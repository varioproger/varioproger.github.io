// 29장 29.1절 대응 - 서비스 설정을 환경 변수에서 한 번만 읽어 검증한다.
import { loadConfig, commonSchema } from '@ncg/shared/config';

/**
 * 설정 스키마.
 *
 * 설정은 "부팅 시 한 번" 검증한다. 런타임 중간에 process.env 를 직접 읽으면
 * 잘못된 값이 트래픽을 받는 도중에야 드러나서 장애 원인을 찾기 어렵다.
 * 여기서 실패하면 프로세스가 아예 뜨지 않으므로(빠른 실패) 배포가 즉시 막힌다.
 *
 * 키는 환경 변수 이름 그대로 쓴다(@ncg/shared/config 의 규약).
 * commonSchema 에 NODE_ENV / LOG_LEVEL / SHUTDOWN_TIMEOUT_MS 등이 이미 있으므로
 * 이 서비스만의 항목을 얹는다.
 */
export const schema = {
  ...commonSchema,

  // 컨테이너 안에서는 4000 고정, 로컬에서는 충돌을 피해 바꿀 수 있게 한다.
  PORT: { kind: 'port', default: 4000 },
  // 컨테이너에서 외부 접속을 받으려면 127.0.0.1 이 아니라 0.0.0.0 에 바인딩해야 한다.
  HOST: { kind: 'string', default: '0.0.0.0' },

  // secret: true 로 두면 DATABASE_URL_FILE 같은 파일 경로 주입도 지원된다
  // (쿠버네티스 시크릿을 환경 변수 대신 파일로 마운트하는 방식).
  // 기본값을 주지 않는 이유: 운영에서 값을 빠뜨렸는데 로컬 DB 로 조용히 붙는 것보다
  // 아예 뜨지 않는 편이 안전하다.
  DATABASE_URL: {
    kind: 'url',
    required: true,
    secret: true,
    protocols: ['postgres', 'postgresql'],
  },
  REDIS_URL: {
    kind: 'url',
    required: true,
    secret: true,
    protocols: ['redis', 'rediss'],
  },

  // 풀 크기 산정 근거는 src/db/pool.js 주석 참고.
  DB_POOL_MAX: { kind: 'integer', min: 1, max: 100, default: 10 },
  CACHE_TTL_SECONDS: { kind: 'integer', min: 1, max: 86_400, default: 60 },
  IDEMPOTENCY_TTL_SECONDS: { kind: 'integer', min: 60, max: 604_800, default: 86_400 },
};

/**
 * 검증된 환경 변수를 애플리케이션 코드가 읽기 좋은 형태로 바꾼다.
 * 코드 곳곳에서 config.DATABASE_URL 처럼 대문자를 쓰면 "환경 변수를 직접 읽는 코드"와
 * 구분이 안 된다. 경계에서 한 번 변환해 두면 이후로는 평범한 객체일 뿐이다.
 */
export function loadServiceConfig(options = {}) {
  const env = loadConfig(schema, options);
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY,
    serviceVersion: env.SERVICE_VERSION,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    metricsEnabled: env.METRICS_ENABLED,
    tracingEnabled: env.TRACING_ENABLED,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    dbPoolMax: env.DB_POOL_MAX,
    cacheTtlSeconds: env.CACHE_TTL_SECONDS,
    idempotencyTtlSeconds: env.IDEMPOTENCY_TTL_SECONDS,
  });
}

export default loadServiceConfig;
