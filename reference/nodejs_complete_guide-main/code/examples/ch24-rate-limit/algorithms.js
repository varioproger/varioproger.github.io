// 24.6절 — 레이트 리미팅 알고리즘 세 가지를 인메모리로 구현하고 경계 문제를 시뮬레이션한다
//
// 실행: node algorithms.js      (Redis 없이 동작한다)
//
// 실제 시간을 기다리지 않고 "가상 시계"를 쓴다. 결과가 결정적이라 매번 같은 값이 나오고,
// 5초짜리 시나리오도 즉시 끝난다.

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// ─────────────────────────────────────────────────────────────────────────────
// (1) 고정 윈도 카운터
//     가장 단순하고 가장 싸다. 키 하나에 카운터 하나.
//     문제: 윈도 경계에서 순간적으로 한도의 2배를 허용한다.
// ─────────────────────────────────────────────────────────────────────────────
class FixedWindow {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.windowStart = 0;
    this.count = 0;
  }
  allow(now) {
    const w = Math.floor(now / this.windowMs) * this.windowMs;
    if (w !== this.windowStart) {
      // 새 윈도가 시작되면 카운터를 통째로 0으로 되돌린다 — 여기가 취약점이다
      this.windowStart = w;
      this.count = 0;
    }
    if (this.count < this.limit) {
      this.count++;
      return true;
    }
    return false;
  }
  get memory() {
    return '키당 정수 2개';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) 슬라이딩 윈도 로그
//     모든 요청 시각을 기록하고, 지금부터 windowMs 이전 것은 버린다.
//     정확하다. 대신 요청 하나당 타임스탬프 하나를 저장한다.
// ─────────────────────────────────────────────────────────────────────────────
class SlidingWindowLog {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.log = [];
  }
  allow(now) {
    const cutoff = now - this.windowMs;
    // 윈도를 벗어난 오래된 기록을 앞에서부터 버린다
    while (this.log.length > 0 && this.log[0] <= cutoff) this.log.shift();
    if (this.log.length < this.limit) {
      this.log.push(now);
      return true;
    }
    return false;
  }
  get memory() {
    return '요청 수만큼 타임스탬프';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (3) 슬라이딩 윈도 카운터 (근사)
//     이전 윈도의 카운트를 겹친 비율만큼 가중해 더한다.
//     정확도는 로그 방식에 가깝고 메모리는 고정 윈도 수준이다. 실무에서 가장 많이 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
class SlidingWindowCounter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.windowStart = 0;
    this.count = 0;
    this.prevCount = 0;
  }
  allow(now) {
    const w = Math.floor(now / this.windowMs) * this.windowMs;
    if (w !== this.windowStart) {
      // 윈도가 하나만 넘어갔으면 직전 카운트를 보존하고, 두 개 이상이면 버린다
      this.prevCount = w - this.windowStart === this.windowMs ? this.count : 0;
      this.windowStart = w;
      this.count = 0;
    }
    // 현재 윈도에서 지나간 비율. 나머지 비율만큼 이전 윈도를 끌어와 더한다
    const elapsed = (now - this.windowStart) / this.windowMs;
    const estimated = this.prevCount * (1 - elapsed) + this.count;
    if (estimated < this.limit) {
      this.count++;
      return true;
    }
    return false;
  }
  get memory() {
    return '키당 정수 3개';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (4) 토큰 버킷
//     평균 속도(refill)와 순간 허용량(capacity)을 따로 정할 수 있다.
//     token-bucket.lua 와 같은 알고리즘이다.
// ─────────────────────────────────────────────────────────────────────────────
class TokenBucket {
  constructor(capacity, refillPerSec) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.last = null;
  }
  allow(now, cost = 1) {
    if (this.last === null) this.last = now;
    // 타이머 없이 "읽을 때" 채운다
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.last) / 1000) * this.refillPerSec
    );
    this.last = now;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
  get memory() {
    return '키당 실수 2개';
  }
}

const LIMIT = 10;
const WINDOW = 1000;

const makeAll = () => [
  ['고정 윈도', new FixedWindow(LIMIT, WINDOW)],
  ['슬라이딩 윈도 로그', new SlidingWindowLog(LIMIT, WINDOW)],
  ['슬라이딩 윈도 카운터', new SlidingWindowCounter(LIMIT, WINDOW)],
  ['토큰 버킷', new TokenBucket(LIMIT, LIMIT)], // 용량 10, 초당 10개 충전
];

// 통과한 시각들을 훑어 "어떤 1초 구간에서든 최대 몇 개가 통과했는가"를 구한다.
// 이 값이 한도(LIMIT)를 넘으면 그 알고리즘은 약속을 지키지 못한 것이다
function worstBurst(accepted, windowMs) {
  let worst = 0;
  for (let i = 0; i < accepted.length; i++) {
    let n = 0;
    for (let j = i; j < accepted.length && accepted[j] < accepted[i] + windowMs; j++) n++;
    worst = Math.max(worst, n);
  }
  return worst;
}

console.log('='.repeat(94));
console.log('  레이트 리미팅 알고리즘 비교 (24.6절) — 한도: 1초에 ' + LIMIT + '회');
console.log('='.repeat(94));

// ─────────────────────────────────────────────────────────────────────────────
// 시나리오 1: 윈도 경계 공격
//   윈도가 [0,1000) [1000,2000) 으로 나뉜다고 하자.
//   950ms 부터 10개, 1000ms 부터 10개를 보낸다.
//   두 요청 무리는 100ms 안에 몰려 있지만 서로 다른 고정 윈도에 속한다.
// ─────────────────────────────────────────────────────────────────────────────
const burstTimes = [
  ...Array.from({ length: LIMIT }, (_, i) => 950 + i * 5), // 950~995ms
  ...Array.from({ length: LIMIT }, (_, i) => 1000 + i * 5), // 1000~1045ms
];

console.log('\n[시나리오 1] 윈도 경계 공격');
console.log(`  950ms 에 ${LIMIT}개, 1000ms 에 ${LIMIT}개 — 총 ${burstTimes.length}개를 약 100ms 안에 보낸다`);
console.log('─'.repeat(94));
console.log(
  pad('알고리즘', 26) +
    padL('허용', 8) +
    padL('거부', 8) +
    padL('1초 구간 최대 허용', 22) +
    '  ' +
    pad('판정', 14) +
    '메모리'
);
console.log('─'.repeat(94));

const timelines = [];
for (const [name, limiter] of makeAll()) {
  const accepted = [];
  const marks = [];
  for (const t of burstTimes) {
    const ok = limiter.allow(t);
    if (ok) accepted.push(t);
    marks.push(ok ? '○' : '×');
  }
  const worst = worstBurst(accepted, WINDOW);
  timelines.push([name, marks.join('')]);
  console.log(
    pad(name, 26) +
      padL(accepted.length, 8) +
      padL(burstTimes.length - accepted.length, 8) +
      padL(worst, 22) +
      '  ' +
      pad(worst > LIMIT ? '한도 초과' : '정상', 14) +
      limiter.memory
  );
}
console.log('─'.repeat(94));

console.log('\n  요청별 허용(○) / 거부(×) — 앞 10개는 950~995ms, 뒤 10개는 1000~1045ms');
console.log('  ' + pad('', 26) + '|경계 이전 |경계 이후 |');
for (const [name, line] of timelines) {
  console.log('  ' + pad(name, 26) + line.slice(0, 10) + ' ' + line.slice(10));
}

// ─────────────────────────────────────────────────────────────────────────────
// 시나리오 2: 한도의 2배 속도로 5초간 꾸준히 보낸다
// ─────────────────────────────────────────────────────────────────────────────
const steady = [];
for (let t = 0; t < 5000; t += 50) steady.push(t); // 초당 20회 = 한도의 2배

console.log('\n[시나리오 2] 한도의 2배 속도로 5초간 균일하게 요청');
console.log(`  총 ${steady.length}개 전송 · 이상적인 허용량은 5초 × ${LIMIT} = ${5 * LIMIT}개`);
console.log('─'.repeat(94));
console.log(pad('알고리즘', 26) + padL('허용', 10) + padL('이상값 대비', 16) + padL('1초 구간 최대', 18));
console.log('─'.repeat(94));
for (const [name, limiter] of makeAll()) {
  const accepted = [];
  for (const t of steady) if (limiter.allow(t)) accepted.push(t);
  const ideal = 5 * LIMIT;
  console.log(
    pad(name, 26) +
      padL(accepted.length, 10) +
      padL(`${((accepted.length / ideal) * 100).toFixed(0)}%`, 16) +
      padL(worstBurst(accepted, WINDOW), 18)
  );
}
console.log('─'.repeat(94));

// ─────────────────────────────────────────────────────────────────────────────
// 시나리오 3: 오래 쉬었다가 한꺼번에 보내는 사용자 (버스트 허용 여부)
// ─────────────────────────────────────────────────────────────────────────────
const idleThenBurst = [
  ...Array.from({ length: 20 }, (_, i) => 10_000 + i), // 10초간 쉰 뒤 20개를 순간에
];

console.log('\n[시나리오 3] 10초간 쉬다가 20개를 한꺼번에 (버스트 허용 여부)');
console.log('─'.repeat(94));
console.log(pad('알고리즘', 26) + padL('허용', 10) + '  성격');
console.log('─'.repeat(94));
const characters = {
  '고정 윈도': '새 윈도라 한도만큼 통과',
  '슬라이딩 윈도 로그': '엄격하게 한도만큼만',
  '슬라이딩 윈도 카운터': '이전 윈도가 비어 한도만큼',
  '토큰 버킷': '용량이 한도와 같으면 버스트도 한도까지',
  '토큰 버킷(용량 20)': '쌓아 둔 토큰만큼 버스트 허용',
};
// 마지막 줄은 "평균은 초당 10회, 순간은 20회까지" 를 표현한 버킷이다.
// 평균 속도와 버스트 허용량을 따로 정할 수 있다는 것이 토큰 버킷의 핵심 장점이다
const scenario3 = [
  ...makeAll(),
  ['토큰 버킷(용량 20)', new TokenBucket(2 * LIMIT, LIMIT)],
];
for (const [name, limiter] of scenario3) {
  let n = 0;
  for (const t of idleThenBurst) if (limiter.allow(t)) n++;
  console.log(pad(name, 26) + padL(n, 10) + '  ' + characters[name]);
}
console.log('─'.repeat(94));

console.log(`
정리

고정 윈도의 경계 문제
  · 시나리오 1에서 고정 윈도만 1초 구간에 ${LIMIT * 2}개를 통과시켰다. 한도의 2배다.
    950ms 의 10개와 1000ms 의 10개가 "다른 윈도"에 속하기 때문이다.
    공격자는 이 경계를 노려 순간 부하를 두 배로 만들 수 있다.
  · 구현이 가장 쉽고 Redis 명령 하나(INCR + EXPIRE)로 끝나 여전히 널리 쓰인다.
    한도를 실제 필요의 절반으로 잡아 최악의 경우를 감당하는 식으로 쓴다.

슬라이딩 윈도 로그
  · 어떤 1초 구간에서도 한도를 넘지 않는다. 가장 정확하다.
  · 대가는 메모리다. 요청 하나당 타임스탬프 하나를 저장한다.
    초당 1만 요청을 받는 서비스라면 키 하나에 1만 개의 항목이 쌓인다.
    Redis 로 구현하면 ZSET + ZREMRANGEBYSCORE 조합이 되고, 이 삭제 비용도 만만치 않다.

슬라이딩 윈도 카운터
  · 이전 윈도를 겹친 비율만큼 가중해 더하는 근사법이다.
  · 시나리오 1에서 11개를 통과시켰다. 한도보다 1개 많다.
    "근사"라는 말 그대로 약간의 오차가 있지만, 고정 윈도의 2배(20개)와는 차원이 다르다.
  · 정확도는 로그 방식에 가깝고 메모리는 고정 윈도 수준이다.
    실무에서 가장 자주 선택되는 절충안이다(클라우드플레어가 쓰는 방식으로 알려져 있다).

토큰 버킷
  · 시나리오 3의 마지막 줄이 다른 알고리즘과 갈리는 지점이다.
    용량 20 · 충전 10/s 버킷은 쉬는 동안 쌓인 토큰으로 20개를 한꺼번에 통과시킨다.
    평균 속도(refill)와 순간 허용량(capacity)을 따로 정할 수 있기 때문이다.
  · 시나리오 2에서 이상값의 118%를 허용한 것도 같은 이유다.
    처음에 가득 찬 버킷으로 시작하므로 초기 버스트가 한 번 허용된다.
  · "평균은 초당 10회지만 가끔 20회쯤 몰리는 건 괜찮다" 는 요구를
    capacity 와 refill 두 값으로 자연스럽게 표현할 수 있다.
  · 사람이 쓰는 API 라면 이 성질이 오히려 자연스럽다.
    페이지를 열면 요청이 몰리고, 읽는 동안은 조용하기 때문이다.

분산 환경에서는
  · 위 구현은 전부 인메모리다. 서버가 3대면 실제 한도는 3배가 된다.
  · 상태를 Redis 로 옮겨야 하고, 그때는 GET-계산-SET 사이의 경쟁 조건이 생긴다.
    같은 디렉터리의 token-bucket.lua 가 그 해법이다 — 스크립트 전체가 원자적으로 실행된다.
  · 사용자에게는 항상 이유를 알려 준다:
      429 Too Many Requests
      Retry-After: <초>
      X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset
`);
