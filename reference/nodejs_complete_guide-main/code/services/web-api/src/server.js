// 20장 20.5절 / 31장 31.3절 대응 - 조립 순서, 무중단 종료, 프로세스 수준 오류 처리.
//
// 부팅 순서에는 이유가 있다:
//   추적(가장 먼저) → 설정 → Fastify → 플러그인 → 라우트 → listen → 종료 훅
// 추적을 가장 먼저 시작하는 이유는 OpenTelemetry 가 http/undici 모듈을 몽키패치해야
// 하는데, 그 모듈들이 이미 import 된 뒤에 패치하면 만들어진 참조를 바꿀 수 없어
// 계측이 조용히 비어 버리기 때문이다.

import { fileURLToPath } from 'node:url';
import { startTracing, stopTracing } from '@ncg/shared/tracing';

const SERVICE_NAME = 'web-api';

// ── 1. 추적을 가장 먼저 켠다 ───────────────────────────────────────
await startTracing(SERVICE_NAME);

// 계측이 끝난 뒤에 나머지를 불러온다.
const [
  { default: Fastify },
  { default: Redis },
  { logger },
  { gracefulShutdown },
  { loadServiceConfig },
  { registerObservability },
  { registerErrorHandler },
  { registerRateLimit },
  { createRecipeClient, createRatingClient },
  { recipeRoutes },
  { healthRoutes },
  { sseRoutes },
] = await Promise.all([
  import('fastify'),
  import('ioredis'),
  import('@ncg/shared/logger'),
  import('@ncg/shared/shutdown'),
  import('./config.js'),
  import('./plugins/observability.js'),
  import('./plugins/error-handler.js'),
  import('./plugins/rate-limit.js'),
  import('./clients/recipe-client.js'),
  import('./routes/recipes.js'),
  import('./routes/health.js'),
  import('./routes/sse.js'),
]);

/**
 * 앱을 조립한다. 리스닝은 하지 않는다.
 *
 * 이 함수가 순수한 조립기이기 때문에 테스트에서 app.inject() 로 네트워크 없이
 * 전체 파이프라인(훅 → 라우트 → 오류 처리)을 그대로 검증할 수 있다.
 * 외부 자원은 전부 인자로 주입받고 여기서 new 하지 않는다.
 *
 * @param {{
 *   config: object, redis: object,
 *   recipeClient?: object, ratingClient?: object,
 *   state?: { shuttingDown: boolean }, monitorEventLoop?: boolean,
 * }} deps
 */
export async function buildApp(deps) {
  const { config, redis, state = { shuttingDown: false }, monitorEventLoop = true } = deps;

  const app = Fastify({
    // 로깅은 우리 훅이 상관관계 ID와 함께 직접 남긴다.
    loggerInstance: logger,
    // 프록시(ALB/nginx) 뒤에서 request.ip 를 X-Forwarded-For 로 채운다.
    // 레이트 리미터의 키가 여기 달려 있으므로 반드시 켜야 하고,
    // 반대로 신뢰할 수 없는 프록시 뒤에서 켜면 한도를 위조로 우회할 수 있다.
    trustProxy: true,
    // 게이트웨이가 이미 요청 ID를 붙였다면 그것을 쓴다.
    requestIdHeader: 'x-request-id',
    // 외부 공개 서비스이므로 본문 크기를 넉넉하지 않게 제한한다.
    bodyLimit: 256 * 1024,
    // 느린 클라이언트가 소켓을 붙잡는 시간을 제한한다(slowloris 완화).
    // SSE 라우트는 자체적으로 setTimeout(0) 을 걸어 이 제한에서 빠져나간다.
    connectionTimeout: 30_000,
    keepAliveTimeout: 72_000,
    // 요청 로그는 우리 onResponse 훅이 남긴다. 중복 로그를 막는다.
    disableRequestLogging: true,
  });

  // ── 플러그인 (순서 중요) ────────────────────────────────────────
  // 관측이 가장 먼저다. 그래야 레이트 리밋으로 거절된 요청도 지표에 잡힌다.
  await registerObservability(app, { serviceName: SERVICE_NAME, monitorEventLoop });
  await registerErrorHandler(app, { exposeStack: config.nodeEnv !== 'production' });
  await registerRateLimit(app, {
    redis,
    max: config.rateLimitMax,
    windowMs: config.rateLimitWindowMs,
  });

  // ── 클라이언트 ──────────────────────────────────────────────────
  // 상관관계 ID는 공유 http-client 가 AsyncLocalStorage 에서 읽어 자동으로 붙인다.
  const recipeClient =
    deps.recipeClient ??
    createRecipeClient({
      baseUrl: config.recipeApiUrl,
      timeoutMs: config.upstreamTimeoutMs,
      retries: config.http.retries,
      deadlineMs: config.http.deadlineMs,
      breaker: config.breaker,
      logger: app.log,
    });
  const ratingClient =
    deps.ratingClient ?? createRatingClient({ baseUrl: config.ratingApiUrl });

  // ── 라우트 ──────────────────────────────────────────────────────
  await app.register(healthRoutes, {
    redis,
    recipeClient,
    state,
    version: config.serviceVersion,
  });
  await app.register(recipeRoutes, { recipeClient, ratingClient });
  await app.register(sseRoutes, { heartbeatMs: config.sseHeartbeatMs });

  app.decorate('appState', state);
  return app;
}

/** 프로세스를 띄운다. */
export async function start() {
  // ── 2. 설정 ────────────────────────────────────────────────────
  const config = loadServiceConfig();

  // ── 3. 외부 자원 ───────────────────────────────────────────────
  const redis = new Redis(config.redisUrl, {
    // 부팅 시 Redis 가 아직 안 떴다고 프로세스가 죽으면 배포가 순서에 묶인다.
    // 재시도하되, 연결이 없을 때의 명령은 즉시 실패시켜 요청이 매달리지 않게 한다.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
  // ioredis 는 리스너 없는 'error' 를 프로세스 종료로 만든다. 반드시 붙인다.
  redis.on('error', (err) => logger.error({ err }, 'Redis 오류'));

  const state = { shuttingDown: false };
  const app = await buildApp({ config, redis, state });

  // ── 4. listen ──────────────────────────────────────────────────
  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, env: config.nodeEnv }, `${SERVICE_NAME} 시작`);

  // ── 5. 무중단 종료 ─────────────────────────────────────────────
  gracefulShutdown({
    server: app.server,
    timeoutMs: config.shutdownTimeoutMs,
    // 레디니스를 내린 뒤 로드밸런서가 우리를 목록에서 뺄 시간을 준다.
    // 이 대기가 없으면 프로브 주기(보통 수 초) 동안 들어온 요청이 끊긴 소켓을 만난다.
    drainDelayMs: 3_000,
    logger,
    onClose: async () => {
      // 순서가 중요하다.
      // (1) 레디니스를 먼저 내려 새 트래픽을 막는다.
      state.shuttingDown = true;
      // (2) 진행 중인 요청을 마치고 SSE 연결(app 의 onClose 훅)을 정리한다.
      await app.close();
      // (3) 그다음에야 외부 연결을 닫는다. 순서를 뒤집으면 마무리 중인 요청이
      //     Redis 를 못 써서 오류로 끝난다.
      await redis.quit().catch(() => redis.disconnect());
      // (4) 마지막으로 남은 스팬을 내보낸다.
      await stopTracing();
    },
  });

  return app;
}

// ── 프로세스 수준 오류 처리 ────────────────────────────────────────
//
// uncaughtException 이후의 프로세스는 신뢰할 수 없다. 어느 지점에서 중단됐는지
// 알 수 없어 락, 트랜잭션, 커넥션이 어중간하게 남는다. 그래서 "복구"하지 않고
// 로그를 남길 시간만 벌고 죽는다. 재시작은 오케스트레이터의 일이다(crash-only).
process.on('uncaughtException', (err, origin) => {
  logger.fatal({ err, origin }, '처리되지 않은 예외 — 프로세스를 종료한다');
  // 로그가 실제로 flush 될 최소 시간만 준다. unref 로 이 타이머 자체가
  // 종료를 지연시키지 않게 한다.
  setTimeout(() => process.exit(1), 100).unref();
});

// Node 22 의 기본값에서도 처리되지 않은 거부는 프로세스를 죽인다. 그래도 직접
// 잡는 이유는 "무엇이" 거부됐는지 구조화된 로그로 남기기 위해서다.
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ err: reason, promise }, '처리되지 않은 프로미스 거부 — 프로세스를 종료한다');
  setTimeout(() => process.exit(1), 100).unref();
});

// 이 파일을 직접 실행했을 때만 서버를 띄운다.
// (테스트가 import 할 때 포트를 잡으면 병렬 테스트가 서로 충돌한다.)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  start().catch((err) => {
    logger.fatal({ err }, '부팅 실패');
    process.exit(1);
  });
}

export default buildApp;
