// 29장 29.1절 대응 - 외부 공개 서비스의 설정을 부팅 시점에 한 번만 읽고 검증한다.
import { loadConfig, commonSchema, httpClientSchema } from '@ncg/shared/config';

/**
 * web-api 설정 스키마.
 *
 * 설정을 "부팅 시 한 번" 검증하는 이유: 잘못된 환경 변수는 트래픽을 받기 전에,
 * 즉 배포 파이프라인에서 드러나야 한다. 런타임 중간에 process.env 를 직접 읽으면
 * 특정 요청에서만 터지는 버그가 되고, 원인을 찾는 데 몇 시간이 든다.
 *
 * 키 이름이 곧 환경 변수 이름이다(@ncg/shared/config 의 규약).
 * commonSchema 에 NODE_ENV / LOG_LEVEL / SHUTDOWN_TIMEOUT_MS 등이 이미 들어 있다.
 */
export const configSchema = {
  ...commonSchema,
  ...httpClientSchema,

  // 외부에 노출되는 서비스라 관례적으로 3000 을 쓴다.
  PORT: { kind: 'port', default: 3000 },
  // 컨테이너 밖에서 접속을 받으려면 127.0.0.1 이 아니라 0.0.0.0 에 바인딩해야 한다.
  HOST: { kind: 'string', default: '0.0.0.0' },

  // 내부 프로듀서 서비스. 서비스 디스커버리를 쓰기 전까지는 URL 을 직접 주입한다.
  RECIPE_API_URL: {
    kind: 'url',
    protocols: ['http', 'https'],
    required: true,
    default: 'http://localhost:4000',
  },
  // 27.4절 오케스트레이션 예제에서 쓰는 (가상의) 평점 서비스.
  // 떠 있지 않아도 /recipes/:id/full 은 부분 실패를 허용하도록 설계되어 있다.
  RATING_API_URL: {
    kind: 'url',
    protocols: ['http', 'https'],
    default: 'http://localhost:4100',
  },
  // 레이트 리미터의 토큰 버킷 상태를 담는다. 인스턴스가 여러 개여도
  // 한도가 인스턴스 수만큼 뻥튀기되지 않도록 상태를 공유해야 한다.
  REDIS_URL: {
    kind: 'url',
    protocols: ['redis', 'rediss'],
    required: true,
    default: 'redis://localhost:6379',
    secret: true,
  },

  // 업스트림 한 번 호출의 상한. 근거는 recipe-client.js 주석 참고.
  UPSTREAM_TIMEOUT_MS: { kind: 'integer', min: 1, max: 60_000, default: 1_000 },
  // 창(window)당 허용 토큰 수. 버킷 용량이자 초기 잔량이다.
  RATE_LIMIT_MAX: { kind: 'integer', min: 1, default: 100 },
  // 버킷이 가득 차는 데 걸리는 시간. 리필 속도 = RATE_LIMIT_MAX / 윈도.
  RATE_LIMIT_WINDOW_MS: { kind: 'integer', min: 1_000, default: 60_000 },
  // SSE 하트비트 간격. 중간 프록시의 유휴 타임아웃보다 짧아야 한다.
  SSE_HEARTBEAT_MS: { kind: 'integer', min: 1_000, default: 15_000 },
};

/**
 * 검증된 환경 변수를 코드에서 읽기 좋은 이름으로 옮긴다.
 *
 * 환경 변수 이름(SCREAMING_SNAKE)을 코드 전체에 뿌리면, 변수 이름을 바꿀 때
 * 애플리케이션 코드를 전부 고쳐야 한다. 여기 한 곳에서만 매핑하면
 * 바깥 세계의 이름과 안쪽 세계의 이름을 독립적으로 바꿀 수 있다.
 */
export function loadServiceConfig(options = {}) {
  const env = loadConfig(configSchema, options);

  return Object.freeze({
    raw: env,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    serviceVersion: env.SERVICE_VERSION,
    port: env.PORT,
    host: env.HOST,
    recipeApiUrl: env.RECIPE_API_URL,
    ratingApiUrl: env.RATING_API_URL,
    redisUrl: env.REDIS_URL,
    upstreamTimeoutMs: env.UPSTREAM_TIMEOUT_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    sseHeartbeatMs: env.SSE_HEARTBEAT_MS,
    // 오케스트레이터의 terminationGracePeriodSeconds 보다 짧아야
    // SIGKILL 이 날아오기 전에 우리가 스스로 정리를 마칠 수 있다.
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    http: {
      retries: env.HTTP_RETRIES,
      deadlineMs: env.HTTP_DEADLINE_MS,
      retryBaseMs: env.HTTP_RETRY_BASE_MS,
      retryMaxMs: env.HTTP_RETRY_MAX_MS,
    },
    breaker: {
      failureThreshold: env.BREAKER_FAILURE_THRESHOLD,
      resetTimeoutMs: env.BREAKER_RESET_TIMEOUT_MS,
      halfOpenMax: env.BREAKER_HALF_OPEN_MAX,
      successThreshold: env.BREAKER_SUCCESS_THRESHOLD,
    },
  });
}

export default loadServiceConfig;
