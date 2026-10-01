import './silence.js'; // 반드시 첫 import — 로거보다 먼저 평가되어야 한다
// 27장 대응(테스트) - 가짜 db/cache 를 주입해 만드는 테스트용 앱 팩토리.
import Fastify from 'fastify';
import errorHandler from '../../src/plugins/error-handler.js';
import recipesRoutes from '../../src/routes/recipes.js';
import healthRoutes from '../../src/routes/health.js';

/**
 * 테스트 더블은 "인터페이스만" 흉내 낸다.
 * 진짜 Postgres 를 띄우면 테스트가 느려지고 CI 가 불안정해진다.
 * 라우트가 db 객체를 옵션으로 받게 설계해 두었기 때문에 여기서 갈아끼울 수 있다.
 */
export function createFakeDb({ recipes = [], idempotency = new Map() } = {}) {
  // created_at 은 Date 로 보관한다(실제 pg 드라이버와 같은 형태).
  const rows = recipes.map((r) => ({
    ...r,
    created_at: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));

  const calls = [];

  function normalize(textOrTagged, params) {
    if (typeof textOrTagged === 'object' && textOrTagged !== null) {
      return { text: textOrTagged.text, values: textOrTagged.values ?? [] };
    }
    return { text: textOrTagged, values: params ?? [] };
  }

  async function query(textOrTagged, params) {
    const { text, values } = normalize(textOrTagged, params);
    const sql = text.replace(/\s+/g, ' ').trim();
    calls.push({ sql, values });

    if (sql.startsWith('select 1')) return { rows: [{ ok: 1 }], rowCount: 1 };

    if (sql.includes('from idempotency_keys')) {
      const stored = idempotency.get(values[0]);
      return stored ? { rows: [{ response: stored }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    if (sql.includes('insert into idempotency_keys')) {
      const [key, response] = values;
      if (idempotency.has(key)) return { rows: [], rowCount: 0 }; // on conflict do nothing
      idempotency.set(key, typeof response === 'string' ? JSON.parse(response) : response);
      return { rows: [{ key }], rowCount: 1 };
    }

    if (sql.includes('insert into recipes')) {
      const [id, title, ingredients] = values;
      const row = {
        id,
        title,
        ingredients: typeof ingredients === 'string' ? JSON.parse(ingredients) : ingredients,
        created_at: new Date(),
      };
      rows.push(row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.includes('from recipes') && sql.includes('where id =')) {
      const found = rows.find((r) => r.id === values[0]);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    if (sql.includes('from recipes')) {
      // 정렬은 실제 질의와 동일하게 (created_at desc, id desc).
      const sorted = [...rows].sort((a, b) => {
        const diff = b.created_at.getTime() - a.created_at.getTime();
        return diff !== 0 ? diff : (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
      });

      let filtered = sorted;
      let limit = values[values.length - 1];
      if (sql.includes('(created_at, id) <')) {
        const [t, id] = values;
        const cursorTime = new Date(t).getTime();
        filtered = sorted.filter(
          (r) => r.created_at.getTime() < cursorTime || (r.created_at.getTime() === cursorTime && r.id < id),
        );
      }
      return { rows: filtered.slice(0, Number(limit)), rowCount: Math.min(filtered.length, Number(limit)) };
    }

    throw new Error(`fake db: 처리할 수 없는 질의 -> ${sql}`);
  }

  /** 아주 단순한 트랜잭션 흉내: 실패하면 이번에 추가된 행을 되돌린다. */
  async function withTransaction(fn) {
    const snapshotLength = rows.length;
    const snapshotKeys = new Set(idempotency.keys());
    try {
      return await fn({ query });
    } catch (err) {
      rows.length = snapshotLength;
      for (const key of [...idempotency.keys()]) {
        if (!snapshotKeys.has(key)) idempotency.delete(key);
      }
      throw err;
    }
  }

  return {
    query,
    withTransaction,
    ping: async () => ({ rows: [{ ok: 1 }] }),
    stats: () => ({ total: 1, idle: 1, waiting: 0, max: 10, saturated: false }),
    close: async () => {},
    // 테스트에서 "무엇을 물어봤는지" 확인할 수 있게 노출한다.
    __rows: rows,
    __idempotency: idempotency,
    __calls: calls,
  };
}

/** 메모리 캐시 더블. getOrSet 의 in-flight 배칭까지 동일하게 흉내 낸다. */
export function createFakeCache({ failing = false } = {}) {
  const store = new Map();
  const inFlight = new Map();
  let loaderCalls = 0;

  async function get(key) {
    if (failing) return undefined; // Redis 장애 시 미스로 폴백하는 동작 검증용
    return store.has(key) ? store.get(key) : undefined;
  }
  async function set(key, value) {
    if (!failing) store.set(key, value);
    return true;
  }
  async function del(key) {
    store.delete(key);
    return true;
  }
  async function getOrSet(key, ttl, loader) {
    const hit = await get(key);
    if (hit !== undefined) return hit;
    const pending = inFlight.get(key);
    if (pending) return await pending;
    const promise = (async () => {
      loaderCalls += 1;
      const value = await loader();
      if (value !== undefined && value !== null) await set(key, value, ttl);
      return value;
    })();
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  }

  return {
    get,
    set,
    del,
    getOrSet,
    ping: async () => 'PONG',
    connect: async () => {},
    close: async () => {},
    __store: store,
    __loaderCalls: () => loaderCalls,
  };
}

/**
 * 테스트용 앱.
 * 관측 플러그인은 기본으로 끈다: 메트릭 레지스트리는 프로세스 전역 상태라
 * 테스트 파일 사이에 값이 새면 결과가 실행 순서에 의존하게 된다.
 * 관측 동작 자체를 검증하고 싶을 때만 withObservability 로 켠다.
 */
export async function buildTestApp({
  db = createFakeDb(),
  cache = createFakeCache(),
  config = { nodeEnv: 'test', cacheTtlSeconds: 60 },
  withObservability = false,
} = {}) {
  const app = Fastify({ logger: false });

  if (withObservability) {
    const { default: observability } = await import('../../src/plugins/observability.js');
    await app.register(observability);
  }
  await app.register(errorHandler, { exposeStack: false });
  await app.register(healthRoutes, { db, cache, config });
  await app.register(recipesRoutes, { db, cache, config });
  await app.ready();

  return { app, db, cache };
}

export default buildTestApp;
