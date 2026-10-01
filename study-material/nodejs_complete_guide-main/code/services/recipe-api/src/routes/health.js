// 31장 31.5절 대응 - liveness/readiness 분리, 의존성 검사 타임아웃과 짧은 캐시, /metrics.
import { metricsHandler } from '@ncg/shared/metrics';
import { isShuttingDown } from '@ncg/shared/shutdown';

/**
 * 헬스 라우트.
 *
 * liveness 와 readiness 를 나누는 이유:
 * - liveness 가 실패하면 오케스트레이터는 컨테이너를 "죽인다".
 * - readiness 가 실패하면 로드밸런서에서 "잠깐 빼기만" 한다.
 * 이 둘을 한 엔드포인트로 합쳐 놓고 DB 를 검사하면, DB 가 잠깐 흔들릴 때
 * 멀쩡한 앱 인스턴스가 전부 재시작되어 장애가 훨씬 커진다.
 */
export default async function healthRoutes(app, opts = {}) {
  const { db, cache, config = {} } = opts;
  const startedAt = Date.now();
  const readyCheckTimeoutMs = opts.readyCheckTimeoutMs ?? 800;
  const readyCacheMs = opts.readyCacheMs ?? 1_000;

  // -------------------------------------------------------------- GET /health/live
  app.get(
    '/health/live',
    {
      // 헬스체크는 아주 자주 호출된다. 로그를 남기면 실제 트래픽 로그가 묻히고
      // 메트릭에도 잡음이 낀다.
      logLevel: 'silent',
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              uptimeSeconds: { type: 'number' },
              pid: { type: 'integer' },
            },
          },
        },
      },
    },
    async () => {
      /**
       * ★ 여기서는 DB/Redis 를 절대 검사하지 않는다.
       * liveness 는 "이 프로세스가 아직 요청을 받아 응답할 수 있는가"만 본다.
       * 의존성을 넣으면 DB 장애 = 전체 파드 재시작 루프가 되어
       * DB 가 회복돼도 애플리케이션이 계속 죽는 상황이 만들어진다.
       */
      return {
        status: 'ok',
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        pid: process.pid,
      };
    },
  );

  /**
   * readiness 결과 캐시.
   *
   * readiness 는 초당 여러 번(인스턴스 수 x 프로브 주기) 호출된다. 매번 DB 에
   * select 1 을 날리면 이미 힘든 DB 에 헬스체크가 부하를 더 얹는 꼴이 된다.
   * 아주 짧은(1초) 캐시만 둬도 원본 부하는 사라지면서, 상태 반영 지연은
   * 프로브 주기보다 훨씬 짧아 실용상 문제가 없다.
   */
  let cached = { at: 0, payload: null, ok: false };

  /** 개별 의존성 검사에 상한 시간을 씌운다. */
  async function checkWithTimeout(name, fn) {
    let timer;
    const started = Date.now();
    try {
      await Promise.race([
        fn(),
        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${name} check timeout ${readyCheckTimeoutMs}ms`)),
            readyCheckTimeoutMs,
          );
          if (typeof timer.unref === 'function') timer.unref();
        }),
      ]);
      return { name, status: 'ok', latencyMs: Date.now() - started };
    } catch (err) {
      /**
       * ★ 타임아웃이 핵심이다.
       * 타임아웃이 없으면 느린 DB 한 대가 readiness 요청을 전부 붙잡고,
       * 그 요청들이 이벤트 루프와 소켓을 점유해 정상 트래픽까지 밀린다.
       * 즉 "의존성 지연"이 "우리 서비스 장애"로 번진다(연쇄 장애).
       * 빨리 실패해서 not-ready 를 선언하는 편이 언제나 낫다.
       */
      return { name, status: 'fail', latencyMs: Date.now() - started, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------- GET /health/ready
  app.get(
    '/health/ready',
    {
      logLevel: 'silent',
      schema: {
        response: {
          200: readyResponseSchema(),
          503: readyResponseSchema(),
        },
      },
    },
    async (request, reply) => {
      /**
       * 종료가 시작됐으면 의존성을 볼 것도 없이 not-ready 다.
       * 이 응답이 로드밸런서를 우리에게서 떼어 내는 신호이고, 그 사이에
       * 처리 중이던 요청이 끝날 시간을 번다(= 무중단 배포의 핵심 단계).
       * 캐시보다 먼저 검사해야 종료 신호가 최대 1초 늦게 반영되는 일이 없다.
       */
      if (isShuttingDown()) {
        reply.header('x-ready-cache', 'bypass');
        return reply.code(503).send({ status: 'shutting-down', checks: [], env: config.nodeEnv });
      }

      const now = Date.now();
      if (cached.payload && now - cached.at < readyCacheMs) {
        reply.header('x-ready-cache', 'hit');
        return reply.code(cached.ok ? 200 : 503).send(cached.payload);
      }

      const checks = await Promise.all([
        checkWithTimeout('postgres', () => db.ping(readyCheckTimeoutMs)),
        checkWithTimeout('redis', () => cache.ping(readyCheckTimeoutMs)),
      ]);

      const ok = checks.every((c) => c.status === 'ok');
      const payload = {
        status: ok ? 'ready' : 'not-ready',
        checks,
        // 풀 포화는 "아직 살아 있지만 곧 넘어간다"는 신호다. 함께 노출해 두면
        // 지연의 원인을 대시보드에서 바로 알 수 있다.
        db: db.stats ? db.stats() : undefined,
        env: config.nodeEnv,
      };

      cached = { at: now, payload, ok };
      reply.header('x-ready-cache', 'miss');
      return reply.code(ok ? 200 : 503).send(payload);
    },
  );

  // ------------------------------------------------------------------- GET /metrics
  app.get(
    '/metrics',
    {
      logLevel: 'silent',
      // 스크레이프 응답은 텍스트다. JSON 직렬화 스키마를 붙이면 안 된다.
      schema: { response: {} },
    },
    async (request, reply) => {
      // metricsHandler 가 Content-Type 헤더와 본문을 raw 응답에 직접 쓴다.
      // 먼저 hijack() 으로 "이 응답은 내가 끝낸다"고 선언해야
      // Fastify 가 뒤이어 자기 응답을 겹쳐 쓰지 않는다.
      reply.hijack();
      await metricsHandler(request.raw, reply.raw);
    },
  );
}

function readyResponseSchema() {
  return {
    type: 'object',
    properties: {
      status: { type: 'string' },
      env: { type: 'string' },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: { type: 'string' },
            latencyMs: { type: 'integer' },
            error: { type: 'string' },
          },
        },
      },
      db: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          idle: { type: 'integer' },
          waiting: { type: 'integer' },
          max: { type: 'integer' },
          saturated: { type: 'boolean' },
        },
      },
    },
  };
}
