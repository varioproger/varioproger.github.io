// 24장 24.6절 대응 - Redis + Lua 로 원자적인 토큰 버킷 레이트 리미터를 만든다.
//
// 의존성에 @fastify/rate-limit 이 들어 있지만 여기서는 쓰지 않는다.
// 기성 플러그인은 고정 창(fixed window)이 기본이고 Lua 원자성을 직접 다루지
// 않아서, 이 장에서 보여 주려는 것(경합 없는 read-modify-write, 토큰 버킷,
// fail-open 정책)이 전부 감춰진다. 실무에서는 기성 플러그인으로 시작하고,
// 여기서처럼 정책을 세밀하게 통제해야 할 때 직접 구현으로 넘어간다.
import { createHash } from 'node:crypto';
import { AppError } from '@ncg/shared/errors';

/**
 * 토큰 버킷 Lua 스크립트.
 *
 * 왜 Lua 인가?
 *   GET → 계산 → SET 을 애플리케이션에서 나눠 하면 그 사이에 다른 인스턴스가
 *   끼어들어 같은 토큰을 두 번 소비한다(read-modify-write 경합). WATCH/MULTI 로
 *   막을 수는 있지만 경합이 잦을수록 재시도가 폭증한다.
 *   Redis 는 Lua 스크립트를 단일 스레드에서 통째로 실행하므로, 스크립트 안에서는
 *   경합 자체가 존재하지 않는다. 읽기·계산·쓰기가 하나의 원자 단위가 된다.
 *
 * 왜 토큰 버킷인가?
 *   고정 창(fixed window)은 창 경계에서 한도의 2배가 통과하는 구멍이 있다.
 *   토큰 버킷은 "평균 속도(refill)"와 "순간 폭주 허용량(capacity)"을 분리해
 *   표현할 수 있어서, 정상적인 버스트는 통과시키고 지속적인 남용만 막는다.
 *
 * KEYS[1] : 버킷 키
 * ARGV[1] : capacity      버킷 용량(= 순간 최대 허용량)
 * ARGV[2] : refillPerMs   밀리초당 리필되는 토큰 수
 * ARGV[3] : nowMs         호출자가 넘긴 현재 시각(ms)
 * ARGV[4] : cost          이번 요청이 소비할 토큰 수
 * ARGV[5] : ttlMs         버킷 키의 만료 시간
 * 반환    : { allowed(0|1), remaining, retryAfterMs }
 */
export const TOKEN_BUCKET_LUA = `
local key         = KEYS[1]
local capacity    = tonumber(ARGV[1])
local refillPerMs = tonumber(ARGV[2])
local nowMs       = tonumber(ARGV[3])
local cost        = tonumber(ARGV[4])
local ttlMs       = tonumber(ARGV[5])

local stored = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(stored[1])
local ts     = tonumber(stored[2])

-- 처음 보는 클라이언트는 가득 찬 버킷에서 시작한다.
if tokens == nil then
  tokens = capacity
  ts = nowMs
end
if ts == nil then ts = nowMs end

-- 경과 시간만큼 리필한다. 시계 역행(음수)은 0으로 잘라 안전하게 만든다.
local elapsed = nowMs - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + (elapsed * refillPerMs))

local allowed = 0
local retryAfterMs = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  -- 부족한 만큼을 채우는 데 걸리는 시간이 Retry-After 의 근거다.
  local deficit = cost - tokens
  retryAfterMs = math.ceil(deficit / refillPerMs)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', nowMs)
redis.call('PEXPIRE', key, ttlMs)

-- Lua → Redis 정수 변환은 소수점을 버리므로 명시적으로 내림한다.
return { allowed, math.floor(tokens), retryAfterMs }
`;

/** EVALSHA 에 쓸 SHA1. 서버에 물어보지 않고 로컬에서 계산해 왕복 한 번을 아낀다. */
export const TOKEN_BUCKET_SHA = createHash('sha1').update(TOKEN_BUCKET_LUA).digest('hex');

/**
 * 요청을 어느 버킷에 넣을지 정한다.
 *
 * API 키가 있으면 키 단위로(같은 고객의 여러 서버를 하나로 묶는다),
 * 없으면 IP 단위로 센다. 프록시 뒤에 있다면 Fastify 의 trustProxy 설정이
 * request.ip 를 X-Forwarded-For 기반으로 바꿔 주므로 여기서 헤더를 직접
 * 읽지 않는다. 헤더를 직접 믿으면 위조로 한도를 무한정 우회할 수 있다.
 */
export function defaultKeyGenerator(request) {
  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    // 원문 키를 Redis 에 그대로 남기지 않는다(유출 시 그대로 자격 증명이 된다).
    return `key:${createHash('sha256').update(apiKey).digest('hex').slice(0, 32)}`;
  }
  return `ip:${request.ip}`;
}

/**
 * 토큰 버킷 소비를 시도한다. EVALSHA 를 먼저 쏘고, 스크립트가 없으면(NOSCRIPT)
 * 그때만 SCRIPT LOAD 로 등록한 뒤 재시도한다.
 *
 * 매번 EVAL 로 전체 스크립트를 보내면 요청마다 수백 바이트를 낭비한다.
 * 반대로 부팅 때 한 번만 LOAD 하면 Redis 재시작·페일오버 후 스크립트가 사라져
 * 리미터 전체가 죽는다. "EVALSHA 우선, NOSCRIPT 시 자가 치유"가 정답이다.
 */
export async function consumeToken(redis, key, { capacity, refillPerMs, cost, ttlMs, now }) {
  const args = [String(capacity), String(refillPerMs), String(now), String(cost), String(ttlMs)];
  try {
    return await redis.evalsha(TOKEN_BUCKET_SHA, 1, key, ...args);
  } catch (err) {
    if (!String(err?.message ?? '').includes('NOSCRIPT')) throw err;
    await redis.script('LOAD', TOKEN_BUCKET_LUA);
    return redis.evalsha(TOKEN_BUCKET_SHA, 1, key, ...args);
  }
}

/**
 * 레이트 리미터 플러그인.
 *
 * ── Redis 가 죽었을 때: fail-open 인가 fail-closed 인가 ─────────────
 *
 * fail-closed(모두 429/503 로 거절):
 *   장점 — 남용과 폭주를 확실히 막는다. 과금이 요청 수에 직결되거나,
 *          리미터가 곧 보안 경계인 인증 엔드포인트에는 이쪽이 옳다.
 *   단점 — 부가 기능(레이트 리미팅)의 장애가 핵심 기능(레시피 조회)의
 *          100% 장애로 증폭된다. 장애 반경(blast radius)이 최악이다.
 *
 * fail-open(리미터를 건너뛰고 통과):
 *   장점 — 리미터의 가용성이 서비스의 가용성보다 낮아도 서비스는 산다.
 *          Redis 는 우리 의존성 중 가장 흔하게 흔들리는 축이다.
 *   단점 — Redis 가 죽은 동안에는 한도가 사실상 없어진다.
 *
 * 이 서비스는 fail-open 을 택한다. 근거:
 *   1) 여기서의 레이트 리밋은 보안 통제가 아니라 "공정 사용"과 업스트림 보호가
 *      목적이다. 진짜 남용 방어(WAF, 인증, 봇 차단)는 앞단에 따로 있다.
 *   2) 업스트림(recipe-api)은 서킷 브레이커와 타임아웃으로 이미 보호된다.
 *      리미터가 잠깐 열려도 recipe-client 가 2차 방어선 역할을 한다.
 *   3) Redis 장애 시간은 보통 초 단위다. 그 몇 초 동안 한도를 넘긴 트래픽이
 *      들어오는 손해보다, 전체 서비스가 죽는 손해가 훨씬 크다.
 *
 * 대신 fail-open 은 반드시 "조용하지 않게" 만든다. 아래에서 rateLimiterOpen
 * 카운터를 올리고 error 레벨로 로그를 남겨, 열린 채로 잊히지 않도록 한다.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   redis: object,
 *   max?: number, windowMs?: number, cost?: number,
 *   keyGenerator?: (req: object) => string,
 *   skip?: (req: object) => boolean,
 *   failOpen?: boolean,
 *   now?: () => number,
 * }} options
 */
export async function registerRateLimit(app, options) {
  const {
    // 의존성 주입: 테스트에서는 인메모리 가짜 Redis 를 넣는다.
    redis,
    max = 100,
    windowMs = 60_000,
    cost = 1,
    keyGenerator = defaultKeyGenerator,
    // 헬스 체크는 세지 않는다. 쿠버네티스 프로브가 한도를 잡아먹으면
    // 트래픽이 몰릴 때 프로브가 429 를 받아 파드가 재시작되는 자충수가 된다.
    skip = (request) => request.url.startsWith('/health') || request.url === '/metrics',
    failOpen = true,
    now = () => Date.now(),
  } = options;

  if (!redis) throw new Error('registerRateLimit: redis 인스턴스가 필요하다');

  const refillPerMs = max / windowMs;
  // 버킷을 다 채우는 데 걸리는 시간의 2배를 TTL 로 준다. 너무 짧으면 버킷이
  // 조기 소멸해 한도가 리셋되고, 너무 길면 일회성 IP 가 메모리에 쌓인다.
  const ttlMs = Math.ceil(windowMs * 2);

  // 부팅 시 미리 한 번 적재해 둔다. 실패해도 무시한다 —
  // 첫 요청의 NOSCRIPT 경로가 어차피 같은 일을 해 준다.
  try {
    await redis.script('LOAD', TOKEN_BUCKET_LUA);
  } catch (err) {
    app.log.warn({ err }, '레이트 리밋 스크립트 사전 적재 실패(첫 요청 때 다시 시도한다)');
  }

  app.addHook('onRequest', async (request, reply) => {
    if (skip(request)) return;

    const key = `ratelimit:web-api:${keyGenerator(request)}`;
    let result;
    try {
      result = await consumeToken(redis, key, { capacity: max, refillPerMs, cost, ttlMs, now: now() });
    } catch (err) {
      if (!failOpen) {
        // fail-closed 를 골랐다면 503 이 맞다. 429 는 "네가 너무 많이 보냈다"는
        // 뜻이라 거짓말이 된다. 잘못은 우리(리미터) 쪽에 있다.
        throw new AppError('레이트 리미터를 사용할 수 없다', {
          statusCode: 503,
          code: 'RATE_LIMITER_UNAVAILABLE',
          retryable: true,
          retryAfterMs: 1_000,
          cause: err,
        });
      }
      // fail-open: 통과시키되 반드시 시끄럽게 기록한다.
      request.log.error({ err, key }, '레이트 리미터 저장소 장애 — fail-open 으로 요청을 통과시킨다');
      reply.header('x-ratelimit-bypassed', '1');
      return;
    }

    const [allowed, remaining, retryAfterMs] = result.map(Number);

    reply.header('x-ratelimit-limit', String(max));
    reply.header('x-ratelimit-remaining', String(Math.max(0, remaining)));
    // 창이 언제 완전히 회복되는지도 알려 주면 클라이언트가 스케줄링하기 쉽다.
    reply.header('x-ratelimit-reset', String(Math.ceil((now() + windowMs) / 1000)));

    if (allowed === 1) return;

    // Retry-After 는 초 단위 정수다(RFC 9110). 0초는 즉시 재시도를 유도해
    // 폭주를 부르므로 최소 1초로 올린다.
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    reply.header('retry-after', String(retryAfterSec));

    request.log.warn({ key, retryAfterSec }, '레이트 리밋 초과');

    throw new AppError(`요청이 너무 많다. ${retryAfterSec}초 뒤에 다시 시도한다.`, {
      statusCode: 429,
      code: 'RATE_LIMITED',
      retryable: true,
      details: { limit: max, retryAfterSeconds: retryAfterSec },
    });
  });

  return app;
}

export default registerRateLimit;
