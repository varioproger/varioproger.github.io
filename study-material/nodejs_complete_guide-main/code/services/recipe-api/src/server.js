// 29장 29.1절 대응 - 서비스 진입점: 부팅 순서, 의존성 배선, 무중단 종료, 치명적 예외 처리.
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import underPressure from '@fastify/under-pressure';
import { startTracing, stopTracing } from '@ncg/shared/tracing';
import { logger as baseLogger } from '@ncg/shared/logger';
import { startEventLoopMonitor } from '@ncg/shared/metrics';
import { gracefulShutdown } from '@ncg/shared/shutdown';
import { loadServiceConfig } from './config.js';
import { createDb } from './db/pool.js';
import { createCache } from './cache/redis.js';
import observability from './plugins/observability.js';
import errorHandler from './plugins/error-handler.js';
import recipesRoutes from './routes/recipes.js';
import healthRoutes from './routes/health.js';

/**
 * Fastify 인스턴스를 조립한다.
 *
 * 리스닝과 분리해 두는 이유: 테스트는 포트를 열 필요 없이 app.inject() 로
 * 라우트를 두드리면 된다. 그러려면 "앱 조립"과 "프로세스 기동"이 따로여야 한다.
 * db/cache 를 인자로 받는 것도 같은 이유다(테스트에서는 더블을 넣는다).
 */
export async function buildApp({ config, logger, db, cache } = {}) {
  const app = Fastify({
    loggerInstance: logger,
    // 프록시 뒤에 있을 때 X-Forwarded-* 를 신뢰해 클라이언트 IP/프로토콜을 복원한다.
    trustProxy: true,
    disableRequestLogging: false,
    // 헤더 수신 타임아웃: 느린 헤더 공격(slowloris)으로 소켓이 고갈되는 것을 막는다.
    requestTimeout: 30_000,
    // 라우트가 없는 URL 도 메트릭 라벨이 폭발하지 않게 고정 문자열로 처리된다.
    ignoreTrailingSlash: true,
    bodyLimit: 1_048_576, // 1MiB. 무제한이면 큰 본문 하나로 메모리를 밀어낼 수 있다.
  });

  // 1) 관측 훅이 가장 먼저 붙어야 이후 모든 로그가 상관관계 ID 를 갖는다.
  await app.register(observability);
  // 2) 오류 핸들러. 라우트보다 먼저 등록해 두면 라우트 등록 중 오류까지 포괄한다.
  await app.register(errorHandler, { exposeStack: config.nodeEnv !== 'production' });

  /**
   * 3) 과부하 보호(백프레셔).
   * 이벤트 루프 지연이 커진 상태에서 요청을 계속 받으면 모든 요청이 느려지고
   * 결국 전부 타임아웃된다. 일부를 503 으로 빠르게 거절하는 편이
   * 나머지를 정상 지연으로 지켜 낸다.
   */
  await app.register(underPressure, {
    maxEventLoopDelay: 1_000,
    maxHeapUsedBytes: 512 * 1024 * 1024,
    maxRssBytes: 768 * 1024 * 1024,
    maxEventLoopUtilization: 0.95,
    retryAfter: 5,
    // 헬스체크는 under-pressure 가 아니라 우리 /health/* 가 담당한다.
    exposeStatusRoute: false,
  });

  // 4) 라우트. 의존성은 전부 옵션으로 주입한다.
  await app.register(healthRoutes, { db, cache, config });
  await app.register(recipesRoutes, { db, cache, config });

  return app;
}

/** 프로세스 기동. 부팅 순서를 지키는 것이 핵심이다. */
export async function main() {
  /**
   * (1) 추적을 가장 먼저 시작한다.
   * OpenTelemetry 계열은 http/pg/ioredis 모듈을 몽키패치해서 계측하는데,
   * 그 모듈들이 먼저 로드되면 패치할 대상을 놓친다. 완벽하게 하려면
   *   node --import ./tracing-hook.js src/server.js
   * 처럼 프리로드하는 편이 낫고, 여기서는 최소한 커넥션 생성보다는 앞에 둔다.
   */
  await startTracing('recipe-api');

  // (2) 설정 로드 및 검증. 여기서 실패하면 아예 뜨지 않는다(빠른 실패).
  const config = loadServiceConfig();

  // (3) 로거. 이후 모든 컴포넌트가 이 로거의 자식을 쓴다.
  const logger = baseLogger.child({ service: 'recipe-api', env: config.nodeEnv });
  logger.level = config.logLevel;

  // 이벤트 루프 지연 측정 시작. 지연 그래프가 없으면 "왜 느린가"에 답할 수 없다.
  startEventLoopMonitor();

  // (4) 의존성 생성. 아직 실제 연결은 하지 않는다(lazy).
  const db = createDb({ config, logger });
  const cache = createCache({ config, logger });

  // (5) 앱 조립
  const app = await buildApp({ config, logger, db, cache });

  // (6) 연결 확인을 listen 보다 먼저 한다.
  //     연결도 못 하는 인스턴스가 로드밸런서에 붙어 트래픽을 받으면 안 된다.
  await cache.connect();
  await db.ping(3_000);
  logger.info('의존성 연결 확인 완료');

  // (7) 리스닝
  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'recipe-api 시작됨');

  /**
   * (8) 무중단 종료 등록.
   * SIGTERM 을 받으면 (a) readiness 를 내려 새 트래픽을 끊고
   * (b) 처리 중인 요청을 마치고 (c) DB/Redis/추적을 닫는다.
   * timeoutMs 안에 못 끝내면 강제 종료한다 — 영원히 안 죽는 프로세스는
   * 배포를 멈춰 세우기 때문이다.
   */
  gracefulShutdown({
    server: app.server,
    timeoutMs: config.shutdownTimeoutMs,
    async onClose() {
      logger.info('종료 시작: 새 요청 수신 중단');
      await app.close();
      // 순서가 중요하다. 요청이 끝난 뒤에 커넥션을 닫아야
      // 처리 중이던 질의가 중간에 끊기지 않는다.
      await Promise.allSettled([db.close(), cache.close()]);
      await stopTracing();
      logger.info('종료 완료');
    },
  });

  return { app, db, cache, config, logger };
}

/**
 * 치명적 예외 처리.
 *
 * unhandledRejection / uncaughtException 이후의 프로세스는 상태를 신뢰할 수 없다.
 * 붙잡아서 계속 돌리면 반쯤 망가진 인스턴스가 트래픽을 계속 받는다.
 * 그래서 "로그를 확실히 남기고" 종료한다 — 재시작은 오케스트레이터가 한다.
 */
export function installFatalHandlers({ logger, exit = (code) => process.exit(code) } = {}) {
  const log = logger ?? baseLogger;

  process.on('unhandledRejection', (reason) => {
    log.fatal({ err: reason }, 'unhandledRejection - 프로세스를 종료한다');
    // 로그가 전송될 시간을 아주 잠깐 준 뒤 종료한다(비동기 트랜스포트 대비).
    setTimeout(() => exit(1), 100).unref();
  });

  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'uncaughtException - 프로세스를 종료한다');
    setTimeout(() => exit(1), 100).unref();
  });

  // 경고는 죽일 일은 아니지만 반드시 남긴다(메모리 누수의 초기 신호).
  process.on('warning', (warning) => {
    log.warn({ name: warning.name, message: warning.message }, 'process warning');
  });
}

// 이 파일이 직접 실행됐을 때만 기동한다.
// (테스트에서 import 할 때 서버가 켜지면 포트 충돌과 느린 테스트가 생긴다.)
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  installFatalHandlers();
  main().catch((err) => {
    baseLogger.fatal({ err }, '기동 실패');
    process.exit(1);
  });
}

export default buildApp;
