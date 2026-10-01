-- 24.4·24.6절 — 원자적 토큰 버킷 레이트 리미터 (Redis Lua 스크립트)
--
-- 사용법 (node-redis / ioredis 공통 개념):
--   const sha = await redis.scriptLoad(fs.readFileSync('token-bucket.lua', 'utf8'));
--   const [allowed, remaining, retryAfterMs] = await redis.evalSha(sha, {
--     keys: [`rl:${userId}`],
--     arguments: [capacity, refillPerSec, now, requested].map(String),
--   });
--
-- 왜 Lua 인가
--   GET → 계산 → SET 을 애플리케이션에서 하면 그 사이에 다른 프로세스가 끼어든다.
--   두 인스턴스가 동시에 "토큰 1개 남음"을 읽고 둘 다 통과시키는 것이 전형적인 사고다.
--   WATCH/MULTI 로도 되지만 경합이 잦으면 재시도가 폭증한다.
--   Redis 는 Lua 스크립트를 하나의 명령처럼 원자적으로 실행하므로 경쟁 조건이 원천 차단된다.
--
-- 왜 토큰 버킷인가
--   고정 윈도는 경계에서 순간적으로 2배를 허용한다(algorithms.js 로 확인할 수 있다).
--   토큰 버킷은 평균 속도를 refill 로, 순간 허용량(버스트)을 capacity 로 따로 정할 수 있다.
--
-- KEYS[1] : 버킷 키 (예: "rl:user:1234")
-- ARGV[1] : capacity      — 버킷 최대 용량 = 허용 가능한 최대 버스트
-- ARGV[2] : refill_rate   — 초당 채워지는 토큰 수 = 평균 허용 속도
-- ARGV[3] : now_ms        — 호출자가 넘긴 현재 시각(ms)
-- ARGV[4] : requested     — 이번에 소비할 토큰 수 (보통 1, 무거운 API 는 더 크게)
--
-- 반환: { allowed(1/0), remaining, retry_after_ms }

local key          = KEYS[1]
local capacity     = tonumber(ARGV[1])
local refill_rate  = tonumber(ARGV[2])
local now_ms       = tonumber(ARGV[3])
local requested    = tonumber(ARGV[4])

if not capacity or not refill_rate or not now_ms or not requested then
  return redis.error_reply('ARGV 는 모두 숫자여야 한다: capacity, refill_rate, now_ms, requested')
end
if requested > capacity then
  -- 용량보다 큰 요청은 아무리 기다려도 통과할 수 없다. 영원한 재시도를 막는다
  return redis.error_reply('requested 가 capacity 보다 클 수 없다')
end

-- 버킷 상태를 읽는다. tokens = 남은 토큰, ts = 마지막 갱신 시각
local bucket    = redis.call('HMGET', key, 'tokens', 'ts')
local tokens    = tonumber(bucket[1])
local last_ms   = tonumber(bucket[2])

-- 처음 보는 키라면 가득 찬 버킷에서 시작한다
if tokens == nil then
  tokens  = capacity
  last_ms = now_ms
end

-- 경과 시간만큼 토큰을 채운다.
-- 타이머를 돌리지 않고 "읽을 때 계산"하는 것이 이 알고리즘의 핵심이다.
-- 유휴 사용자를 위해 주기적으로 무언가를 돌릴 필요가 없다.
local elapsed_ms = math.max(0, now_ms - last_ms)
local refilled   = (elapsed_ms / 1000.0) * refill_rate
tokens = math.min(capacity, tokens + refilled)

local allowed = 0
local retry_after_ms = 0

if tokens >= requested then
  allowed = 1
  tokens  = tokens - requested
else
  -- 부족한 만큼 채워지는 데 걸리는 시간을 알려 준다 → 클라이언트의 Retry-After 헤더
  local shortfall = requested - tokens
  retry_after_ms  = math.ceil((shortfall / refill_rate) * 1000)
end

-- 상태를 저장한다
redis.call('HSET', key, 'tokens', tokens, 'ts', now_ms)

-- TTL: 버킷이 가득 차는 데 걸리는 시간 + 여유 1초.
-- 이 시간이 지나면 어차피 "가득 찬 새 버킷"과 같으므로 지워도 무해하다.
-- TTL 이 없으면 사용자 수만큼 키가 영원히 쌓여 메모리가 샌다.
local ttl_ms = math.ceil((capacity / refill_rate) * 1000) + 1000
redis.call('PEXPIRE', key, ttl_ms)

return { allowed, math.floor(tokens), retry_after_ms }

-- 주의사항
--
-- 1) 시각은 호출자가 넘긴다(now_ms).
--    Redis 의 TIME 명령을 쓰면 스크립트가 비결정적이 되어 예전 버전에서는 복제가 깨졌다.
--    여러 애플리케이션 서버의 시계가 어긋나면 이 값도 어긋나므로 NTP 동기화는 필수다.
--
-- 2) Redis Cluster 에서는 KEYS 에 든 키가 모두 같은 슬롯에 있어야 한다.
--    사용자별 버킷은 키가 하나뿐이라 문제가 없다.
--
-- 3) EVAL 대신 SCRIPT LOAD + EVALSHA 를 쓴다. 매 요청마다 스크립트 본문을
--    네트워크로 보내지 않는다. NOSCRIPT 오류가 오면(Redis 재시작 등) 다시 로드한다.
--
-- 4) 이 리미터는 Redis 가 죽으면 함께 죽는다. 실패 시 정책을 미리 정해 둔다.
--    fail-open(막지 않고 통과) 이 보통이지만, 과금 API 라면 fail-closed 가 맞을 수 있다.
