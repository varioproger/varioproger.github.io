// 29.6절 — 지터 없는 백오프와 있는 백오프의 "재시도 몰림"을 시뮬레이션으로 비교한다
//
// 실행: node retry-backoff.js
//
// 장애가 나면 모든 클라이언트가 동시에 실패한다. 같은 공식으로 재시도하면
// 같은 시각에 다시 몰린다(thundering herd). 회복하려던 서버가 그 파도에 다시 넘어진다.
// 지터(무작위 분산)는 이 파도를 평평하게 만든다.

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// 재현 가능한 난수
let seed = 20260901;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const BASE = 500;      // 기본 대기 시간(ms)
const CAP = 8000;      // 대기 시간 상한
const ATTEMPTS = 6;    // 최대 재시도 횟수
const CLIENTS = 500;   // 동시에 실패한 클라이언트 수

// ─────────────────────────────────────────────────────────────────────────────
// 백오프 전략들
// ─────────────────────────────────────────────────────────────────────────────
const strategies = {
  // 고정 간격 — 가장 나쁘다. 모든 클라이언트가 정확히 같은 시각에 다시 온다
  '고정 간격': (attempt) => BASE,

  // 지수 백오프(지터 없음) — 간격은 벌어지지만 여전히 모두 같은 시각이다
  '지수 (지터 없음)': (attempt) => Math.min(CAP, BASE * 2 ** attempt),

  // Full jitter — [0, 지수값) 구간에서 균등 추출. AWS 아키텍처 블로그의 권장안이다
  '지수 + Full jitter': (attempt) => rand() * Math.min(CAP, BASE * 2 ** attempt),

  // Equal jitter — 절반은 고정, 절반은 무작위. 너무 짧은 대기를 피하면서 분산한다
  '지수 + Equal jitter': (attempt) => {
    const exp = Math.min(CAP, BASE * 2 ** attempt);
    return exp / 2 + rand() * (exp / 2);
  },

  // Decorrelated jitter — 이전 대기 시간을 기반으로 다음을 정한다. 분산이 가장 넓다
  '지수 + Decorrelated': (attempt, prev) =>
    Math.min(CAP, BASE + rand() * (prev * 3 - BASE)),
};

// 클라이언트 CLIENTS 개가 t=0 에 동시에 실패했다고 가정하고,
// 각 재시도가 언제 서버에 도착하는지 시각을 모두 모은다
function simulate(delayFn) {
  const arrivals = [];
  for (let c = 0; c < CLIENTS; c++) {
    let t = 0;
    let prev = BASE;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const wait = delayFn(attempt, prev);
      prev = wait;
      t += wait;
      arrivals.push(t);
    }
  }
  return arrivals.sort((a, b) => a - b);
}

// 도착 시각들을 일정 크기의 버킷으로 나눠 히스토그램을 만든다
// 버킷 크기는 기본 대기 시간(BASE)보다 충분히 작아야 지터의 효과가 눈에 보인다.
// 버킷이 BASE 만큼 크면 지터로 흩뿌린 요청이 전부 같은 칸에 들어가 버린다
const BUCKET = 200;
const HORIZON = 8000; // 처음 8초만 본다
function histogram(arrivals) {
  const buckets = new Array(HORIZON / BUCKET).fill(0);
  for (const t of arrivals) {
    const i = Math.floor(t / BUCKET);
    if (i < buckets.length) buckets[i]++;
  }
  return buckets;
}

console.log('='.repeat(94));
console.log('  재시도 백오프와 지터 (29.6절)');
console.log(
  `  클라이언트 ${CLIENTS}개가 동시에 실패 · 최대 ${ATTEMPTS}회 재시도 · 기본 ${BASE}ms · 상한 ${CAP}ms`
);
console.log('='.repeat(94));

const results = [];
for (const [name, fn] of Object.entries(strategies)) {
  const arrivals = simulate(fn);
  const buckets = histogram(arrivals);
  const peak = Math.max(...buckets);
  const peakAt = buckets.indexOf(peak) * BUCKET;
  const nonEmpty = buckets.filter((b) => b > 0).length;
  results.push({ name, buckets, peak, peakAt, nonEmpty, arrivals });
}

const globalPeak = Math.max(...results.map((r) => r.peak));

console.log();
console.log('─'.repeat(94));
console.log(
  pad('전략', 24) +
    padL('최대 순간 부하', 18) +
    padL('발생 시각', 14) +
    padL('부하가 퍼진 구간', 20) +
    padL('몰림 정도', 12)
);
console.log('─'.repeat(94));
for (const r of results) {
  console.log(
    pad(r.name, 24) +
      padL(`${r.peak}건/${BUCKET}ms`, 18) +
      padL(`${r.peakAt}ms`, 14) +
      padL(`${r.nonEmpty}/${HORIZON / BUCKET} 버킷`, 20) +
      padL(`${((r.peak / globalPeak) * 100).toFixed(0)}%`, 12)
  );
}
console.log('─'.repeat(94));
console.log('  최대 순간 부하가 작을수록, 부하가 퍼진 구간이 넓을수록 좋다. 몰림 정도는 낮을수록 좋다.');

// 시간축 히스토그램을 그린다
console.log(`\n서버가 받는 재시도 요청 분포 (처음 ${HORIZON / 1000}초, ${BUCKET}ms 단위)`);
console.log('─'.repeat(94));
for (const r of results) {
  console.log(`\n  ${r.name}  (최대 ${r.peak}건/${BUCKET}ms)`);
  let line = '  ';
  for (const b of r.buckets) {
    // 밀도를 문자 하나로 표현한다
    const ratio = b / globalPeak;
    line +=
      b === 0 ? '·' : ratio > 0.5 ? '█' : ratio > 0.2 ? '▓' : ratio > 0.05 ? '▒' : '░';
  }
  console.log(line);
}
console.log(`\n  범례:  ·  없음   ░ 적음   ▒ 보통   ▓ 많음   █ 매우 많음   (한 칸 = ${BUCKET}ms)`);
console.log('─'.repeat(94));

const worst = results[1]; // 지수 (지터 없음)
const best = results.reduce((a, b) => (a.peak <= b.peak ? a : b));
console.log(`
읽는 법
  · "고정 간격"과 "지수 (지터 없음)"은 막대가 몇 개의 기둥으로만 서 있다.
    ${CLIENTS}개 클라이언트가 정확히 같은 시각에 재시도하기 때문이다.
    지수 백오프는 간격을 벌려 주지만, 모두가 똑같이 벌리므로 몰림 자체는 해결하지 못한다.
  · 지터를 넣으면 같은 요청 수가 넓게 퍼진다.
    최대 순간 부하가 ${worst.peak}건에서 ${best.peak}건으로 약 ${(worst.peak / best.peak).toFixed(1)}배 줄었다.
    총 재시도 횟수는 똑같은데 서버가 체감하는 최대 부하만 낮아진 것이다. 공짜로 얻는 이득이다.
  · Full jitter 는 대기 시간이 아주 짧아질 수도 있어 평균 응답이 빨라진다.
    Equal jitter 는 최소 대기를 보장해 서버를 더 확실히 쉬게 한다.
    둘 중 무엇을 쓸지는 "빠른 회복"과 "확실한 진정" 중 무엇이 급한지로 정한다.

재시도 자체에 대한 규칙
  · 멱등하지 않은 요청(결제, 주문 생성)은 재시도하면 안 된다.
    꼭 해야 한다면 멱등성 키를 함께 보낸다(29.5절).
  · 재시도해도 소용없는 오류는 즉시 포기한다. 400·401·403·404 를 재시도하는 것은 낭비다.
    재시도할 가치가 있는 것은 429·503·504 와 네트워크 오류다.
  · 429 응답에 Retry-After 헤더가 있으면 우리 공식보다 그 값을 우선한다.
  · 재시도 예산(retry budget)을 둔다. 전체 요청의 10% 이상이 재시도라면
    그것은 재시도로 해결할 문제가 아니라 용량 문제다.
  · 재시도는 계층마다 곱해진다. 3계층이 각각 3번 재시도하면 최악의 경우 27배다.
    보통 가장 바깥 계층에서만 재시도하고, 안쪽은 빠르게 실패시킨다.
  · 서킷 브레이커와 함께 쓴다. 회로가 열려 있으면 재시도조차 하지 않는다
    (circuit-breaker.js 참고).
`);
