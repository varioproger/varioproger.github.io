// 31장 31.4절 대응 - 라이브니스 / 레디니스 프로브와 지표 노출 엔드포인트.
import { metricsHandler } from '@ncg/shared/metrics';
import { isShuttingDown } from '@ncg/shared/shutdown';

/**
 * 헬스 체크 라우트.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ redis?: object, recipeClient?: object, version?: string, state?: object }} options
 */
export async function healthRoutes(app, options = {}) {
  const {
    redis,
    recipeClient,
    version = process.env.APP_VERSION ?? 'dev',
    // 서버가 종료 절차에 들어가면 shuttingDown 을 true 로 바꾼다.
    state = { shuttingDown: false },
  } = options;

  const startedAt = Date.now();

  /**
   * GET /health/live — 라이브니스.
   *
   * "이 프로세스를 재시작해야 하는가?"에만 답한다. 그래서 의존성을 전혀 보지
   * 않는다. Redis 가 죽었다고 이 프로세스를 재시작해도 아무것도 나아지지
   * 않는다. 오히려 모든 파드가 동시에 재시작되면서 장애가 커진다.
   * 이벤트 루프가 돌고 있고 HTTP 응답을 만들 수 있다면 살아 있는 것이다.
   */
  app.get('/health/live', { logLevel: 'warn' }, async () => ({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    version,
  }));

  /**
   * GET /health/ready — 레디니스.
   *
   * "지금 이 인스턴스에 트래픽을 보내도 되는가?"에 답한다.
   *
   * ── 왜 업스트림 전체를 검사하지 않는가(연쇄 장애 방지) ────────────
   * recipe-api 를 레디니스에서 검사하면, recipe-api 가 잠깐 흔들리는 순간
   * web-api 의 모든 인스턴스가 동시에 NotReady 가 되어 로드밸런서에서
   * 빠진다. 그 결과 recipe-api 와 무관한 엔드포인트(/health, 캐시된 응답,
   * 정적 응답)까지 전부 죽고, 하나의 다운스트림 장애가 시스템 전체 장애로
   * 증폭된다. 이것이 전형적인 연쇄 장애(cascading failure)다.
   * 게다가 모든 파드가 동시에 빠졌다가 동시에 돌아오면서 트래픽이 출렁이고,
   * 회복 중인 recipe-api 를 다시 쓰러뜨린다.
   *
   * 원칙:
   *   - 레디니스는 "이 인스턴스만의 사정"만 본다. 부팅 완료 여부, 종료 진행
   *     여부, 그리고 이 인스턴스가 소유한 자원(자체 커넥션 풀)의 상태.
   *   - 다운스트림의 건강은 레디니스가 아니라 서킷 브레이커와 타임아웃으로
   *     다룬다. 그쪽은 트래픽을 끊는 대신 해당 호출만 빠르게 실패시킨다.
   *   - 다운스트림 상태를 "알고 싶은" 욕구는 /health/deps 로 분리한다.
   *     이 엔드포인트는 사람과 대시보드가 보는 용도이며, 프로브가 아니다.
   *
   * Redis 는 예외적으로 확인할 수도 있지만, 여기서는 레이트 리미터가
   * fail-open 이므로 Redis 가 없어도 서비스는 정상 동작한다. 따라서 이것도
   * 레디니스에서 뺀다.
   */
  app.get('/health/ready', { logLevel: 'warn' }, async (request, reply) => {
    // 종료 상태는 두 곳에서 온다. 공유 shutdown 모듈이 시그널을 받아 세운
    // 플래그와, 테스트에서 주입하는 state 객체다. 둘 중 하나라도 참이면 빠진다.
    if (state.shuttingDown || isShuttingDown()) {
      // 종료 중에는 명시적으로 NotReady 를 반환해 로드밸런서가 먼저 우리를
      // 빼도록 유도한다. 이것이 무중단 배포의 핵심이다.
      return reply.code(503).send({ status: 'shutting_down' });
    }
    return { status: 'ready', version };
  });

  /**
   * GET /health/deps — 의존성 상태 보고서(프로브 아님).
   * 오케스트레이터가 이 결과로 파드를 죽이지 않는다. 사람이 본다.
   * 그래서 어떤 의존성이 아프더라도 항상 200 을 반환한다.
   */
  app.get('/health/deps', { logLevel: 'warn' }, async () => {
    const deps = {};

    if (redis) {
      try {
        // 타임아웃 없이 ping 을 걸면 이 엔드포인트 자체가 매달릴 수 있다.
        await Promise.race([
          redis.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500).unref?.()),
        ]);
        deps.redis = { status: 'ok' };
      } catch (err) {
        deps.redis = { status: 'degraded', reason: err.message };
      }
    }

    if (recipeClient) {
      // 실제로 호출하지 않는다. 서킷 브레이커가 이미 알고 있는 상태를 읽기만 한다.
      // 헬스 체크가 업스트림에 트래픽을 더하는 것은 그 자체로 부하다.
      deps.recipeApi = { status: recipeClient.breakerState === 'open' ? 'degraded' : 'ok', circuit: recipeClient.breakerState };
    }

    return { status: 'ok', deps };
  });

  /**
   * GET /metrics — 프로메테우스 스크레이프 엔드포인트.
   * 공유 모듈의 핸들러가 Content-Type 과 본문을 직접 쓰므로 Fastify 의
   * 직렬화를 우회한다(reply.hijack).
   */
  app.get('/metrics', { logLevel: 'warn' }, (request, reply) => {
    reply.hijack();
    return metricsHandler(request.raw, reply.raw);
  });

  return app;
}

export default healthRoutes;
