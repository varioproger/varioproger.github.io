// 19장 19.1절 대응 - PostgreSQL 커넥션 풀 생성, 크기 산정, 타임아웃, 풀 포화 지표.
import pg from 'pg';

const { Pool } = pg;

/**
 * 파라미터화 질의 전용 태그드 템플릿.
 *
 *   sql`select * from recipes where id = ${id}`
 *     -> { text: 'select * from recipes where id = $1', values: [id] }
 *
 * 문자열 연결로 SQL 을 만들면 값이 그대로 구문에 섞여 인젝션이 생긴다.
 * 태그드 템플릿을 쓰면 값이 자동으로 $n 자리표시자로 빠지므로
 * "실수로 문자열을 이어붙일 수 없는" 구조가 된다.
 */
export function sql(strings, ...values) {
  let text = '';
  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  return { text, values };
}

/**
 * 풀 크기 산정 근거
 * -----------------
 * PostgreSQL 은 커넥션 하나당 백엔드 프로세스 하나를 띄운다. 커넥션을 늘린다고
 * 처리량이 선형으로 늘지 않고, 어느 지점부터는 컨텍스트 스위칭과 잠금 경합으로
 * 오히려 지연이 커진다. 경험적으로 쓰이는 상한은
 *
 *     max = (코어 수 * 2) + 실효 스핀들 수
 *
 * 이고, 여기에 서비스 인스턴스 수를 곱한 값이 DB 의 max_connections 를
 * 넘지 않아야 한다. 예) DB max_connections=100, 운영/마이그레이션용 20 예약,
 * 인스턴스 8개 -> 인스턴스당 (100-20)/8 = 10.
 *
 * 그래서 기본값을 10 으로 잡고 DB_POOL_MAX 로 환경별 조정만 허용한다.
 * Node 는 단일 스레드이므로 풀이 CPU 코어 수보다 훨씬 커야 할 이유도 없다.
 */
export function createDb({ config, logger, PoolCtor = Pool } = {}) {
  const max = config?.dbPoolMax ?? 10;

  const pool = new PoolCtor({
    connectionString: config?.databaseUrl,
    max,
    // 유휴 커넥션 회수: DB 쪽 idle_in_transaction/유휴 백엔드가 쌓이는 것을 막는다.
    idleTimeoutMillis: 30_000,
    // 커넥션 "획득" 타임아웃. 풀이 포화됐을 때 요청이 무한정 큐에 매달리면
    // 이벤트 루프에는 여유가 있는데도 응답만 지연되어 장애 원인 파악이 어렵다.
    // 여기서 빨리 실패시켜야 상위에서 503 으로 백프레셔를 걸 수 있다.
    connectionTimeoutMillis: 3_000,
    // 개별 질의가 영원히 걸리지 않도록 서버 측 타임아웃도 함께 건다.
    statement_timeout: 10_000,
    query_timeout: 10_000,
    application_name: 'recipe-api',
    allowExitOnIdle: false,
  });

  // 유휴 커넥션에서 발생한 오류는 여기서 잡지 않으면 프로세스를 죽인다.
  // pg 풀은 죽은 커넥션을 버리고 다음 요청 때 새로 만들어 붙으므로(재연결),
  // 우리가 할 일은 "기록하고 넘어가기" 뿐이다.
  pool.on('error', (err) => {
    logger?.error?.({ err }, 'db 유휴 커넥션 오류 - 해당 커넥션을 폐기하고 재연결한다');
  });
  pool.on('connect', () => {
    logger?.debug?.({ total: pool.totalCount }, 'db 커넥션 생성');
  });

  /**
   * 풀 포화 지표.
   *
   * waiting 은 "커넥션을 못 얻어 대기 중인 요청 수"다. 이 값이 0 보다 크게
   * 유지되면 DB 가 병목이라는 뜻이며, 응답 지연의 원인을 애플리케이션 코드에서
   * 찾느라 시간을 낭비하지 않게 해 준다.
   * (프로메테우스 메트릭 등록은 @ncg/shared/metrics 가 소유하므로 여기서는
   *  스냅샷만 제공하고, /metrics 와 /health/ready 에서 이 값을 읽어 쓴다.)
   */
  function stats() {
    return {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max,
      saturated: pool.waitingCount > 0,
    };
  }

  /**
   * 질의 실행. 파라미터화된 형태만 받는다.
   * - query(sql`...`)          <- 권장
   * - query('... $1 ...', [v]) <- 허용
   * 값이 이미 박힌 문자열을 넘기는 것을 막기 위해, 문자열을 넘기면서
   * 파라미터를 생략했는데 자리표시자가 있는 경우를 오류로 처리한다.
   */
  async function query(textOrTagged, params) {
    let text;
    let values;
    if (typeof textOrTagged === 'object' && textOrTagged !== null) {
      text = textOrTagged.text;
      values = textOrTagged.values ?? [];
    } else {
      text = textOrTagged;
      values = params ?? [];
    }
    if (typeof text !== 'string' || text.length === 0) {
      throw new TypeError('query() 는 SQL 문자열 또는 sql`` 결과를 받아야 한다');
    }
    const started = process.hrtime.bigint();
    try {
      return await pool.query(text, values);
    } finally {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (ms > 200) {
        // 느린 질의는 원문을 남긴다. 값은 남기지 않는다(개인정보/카디널리티).
        logger?.warn?.({ ms, sql: text, pool: stats() }, '느린 질의');
      }
    }
  }

  /** 트랜잭션 헬퍼. 콜백이 던지면 롤백하고, 어떤 경우에도 커넥션을 반납한다. */
  async function withTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({
        query: (t, p) =>
          typeof t === 'object' && t !== null
            ? client.query(t.text, t.values ?? [])
            : client.query(t, p ?? []),
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger?.error?.({ err: rollbackErr }, '롤백 실패 - 커넥션을 폐기한다');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /** 준비 상태 점검용. 타임아웃을 걸어 느린 DB 가 헬스체크를 붙잡지 못하게 한다. */
  async function ping(timeoutMs = 1_000) {
    return await withTimeout(query('select 1 as ok'), timeoutMs, 'db ping timeout');
  }

  async function close() {
    await pool.end();
  }

  return { pool, sql, query, withTransaction, ping, stats, close };
}

/** 프로미스에 상한 시간을 씌운다. 타이머는 어떤 경로로든 반드시 해제한다. */
export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    // 헬스체크 타이머가 프로세스 종료를 붙잡지 않게 한다.
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export default createDb;
