// 11.6절 — CPU 바운드 작업 처리 전략 세 가지 비교
//
// 실행: node subset-sum.js
//
// 부분집합 합 문제(주어진 수들 중 합이 target 이 되는 조합의 개수)를
//   (1) 동기 실행
//   (2) setImmediate 인터리빙
//   (3) 워커 스레드 풀
// 세 가지로 풀고, 실행 시간과 "그동안 서버가 응답할 수 있었는가"를 함께 측정한다.
//
// 핵심: 총 실행 시간만 보면 (1)이 가장 빠르다. 하지만 (1)이 도는 동안 이 프로세스는
// 어떤 HTTP 요청도, 어떤 헬스 체크도 처리하지 못한다.

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WorkerPool } from './worker-pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// ─────────────────────────────────────────────────────────────────────────────
// 문제 정의 — 재현 가능하도록 난수 대신 고정 생성기를 쓴다
// ─────────────────────────────────────────────────────────────────────────────
const N = 22; // 2^22 = 약 420만 가지 조합
let seed = 20260901;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const NUMBERS = Array.from({ length: N }, () => 1 + Math.floor(rand() * 60));
const TARGET = 300;
const TOTAL_MASKS = 2 ** N;

// 워커 스크립트와 완전히 같은 알고리즘. 결과가 일치하는지 확인하는 데 쓴다
function subsetSumRange(numbers, target, from, to) {
  const n = numbers.length;
  let count = 0;
  for (let mask = from; mask < to; mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) sum += numbers[i];
    }
    if (sum === target) count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// 측정 장치: 이벤트 루프 지연 + "하트비트"
// 하트비트는 20ms 간격 타이머다. 루프가 막히면 예정된 횟수만큼 실행되지 못한다.
// 실제 서버로 치면 "그동안 처리할 수 있었던 요청 수"에 해당한다.
// ─────────────────────────────────────────────────────────────────────────────
const HEARTBEAT_MS = 20;

async function measure(label, fn) {
  const h = monitorEventLoopDelay({ resolution: 5 });
  let beats = 0;
  const timer = setInterval(() => beats++, HEARTBEAT_MS);

  h.enable();
  // 히스토그램은 첫 표본을 잡아야 이후의 지연을 계산할 수 있다.
  // 곧바로 동기 작업에 들어가면 표본이 하나도 없어 지연이 0으로 나온다
  await new Promise((r) => setTimeout(r, 20));

  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  clearInterval(timer);

  // 완전히 동기로 도는 방식은 실행 중에 히스토그램 타이머가 깨어나지 못한다.
  // 여기서 루프에 제어를 넘겨야 "밀려 있던 지연"이 비로소 기록된다.
  // 이 대기는 위에서 이미 측정을 끝낸 ms 와 하트비트에 영향을 주지 않는다
  await new Promise((r) => setTimeout(r, 20));
  h.disable();

  const expectedBeats = Math.floor(ms / HEARTBEAT_MS);
  return {
    label,
    result,
    ms,
    lagP99: h.percentile(99) / 1e6,
    lagMax: h.max / 1e6,
    beats,
    expectedBeats,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) 동기 — 가장 단순하고 가장 위험하다
// ─────────────────────────────────────────────────────────────────────────────
function solveSync() {
  return subsetSumRange(NUMBERS, TARGET, 0, TOTAL_MASKS);
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) setImmediate 인터리빙 — 작업을 쪼개 매 청크마다 이벤트 루프에 제어를 돌려준다
// ─────────────────────────────────────────────────────────────────────────────
function solveInterleaved(chunkSize = 1 << 16) {
  return new Promise((resolve) => {
    let count = 0;
    let mask = 0;
    function step() {
      const end = Math.min(mask + chunkSize, TOTAL_MASKS);
      count += subsetSumRange(NUMBERS, TARGET, mask, end);
      mask = end;
      if (mask >= TOTAL_MASKS) return resolve(count);
      setImmediate(step); // 루프에 한 바퀴 돌 기회를 준다
    }
    step();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// (3) 워커 스레드 풀 — 메인 스레드는 아무 계산도 하지 않는다
// ─────────────────────────────────────────────────────────────────────────────
async function solveWorkers(pool, splits) {
  const size = Math.ceil(TOTAL_MASKS / splits);
  const payloads = [];
  for (let from = 0; from < TOTAL_MASKS; from += size) {
    payloads.push({
      type: 'subset-sum',
      numbers: NUMBERS,
      target: TARGET,
      from,
      to: Math.min(from + size, TOTAL_MASKS),
    });
  }
  const counts = await pool.runAll(payloads);
  return counts.reduce((a, b) => a + b, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('='.repeat(94));
console.log('  CPU 바운드 작업 처리 전략 비교 — 부분집합 합 (11.6절)');
console.log(
  `  원소 ${N}개 · 검사할 조합 ${TOTAL_MASKS.toLocaleString('ko-KR')}가지 · 목표 합 ${TARGET}`
);
console.log(`  CPU 코어 ${os.availableParallelism()}개`);
console.log('='.repeat(94));
console.log('\n측정 중...');

const poolSize = Math.min(4, Math.max(2, os.availableParallelism()));
const pool = new WorkerPool(path.join(here, 'worker-task.js'), poolSize);

// 워커 스레드가 뜨는 비용을 측정에서 빼기 위해 미리 예열한다
await pool.runAll(Array.from({ length: poolSize }, () => ({ type: 'ping' })));

const rows = [];
rows.push(await measure('1. 동기 (블로킹)', solveSync));
rows.push(await measure('2. setImmediate 인터리빙', () => solveInterleaved()));
rows.push(
  await measure(`3. 워커 풀 (${poolSize} 스레드)`, () => solveWorkers(pool, poolSize * 2))
);

await pool.destroy();

const C = [
  [28, '방식'],
  [10, '결과'],
  [12, '소요(ms)'],
  [16, '루프 지연 p99'],
  [14, '루프 지연 max'],
  [16, '하트비트'],
];
console.log();
console.log('─'.repeat(94));
console.log(C.map(([w, h], i) => (i === 0 ? pad(h, w) : padL(h, w))).join(''));
console.log('─'.repeat(94));
for (const r of rows) {
  console.log(
    pad(r.label, 28) +
      padL(r.result, 10) +
      padL(r.ms.toFixed(0), 12) +
      padL(r.lagP99.toFixed(1) + 'ms', 16) +
      padL(r.lagMax.toFixed(1) + 'ms', 14) +
      padL(`${r.beats} / ${r.expectedBeats}`, 16)
  );
}
console.log('─'.repeat(94));
console.log(
  '  하트비트: 20ms 타이머가 실제로 실행된 횟수 / 이론상 실행됐어야 할 횟수.' +
    '\n            실제 서버라면 "그동안 처리할 수 있었던 요청 수"에 해당한다.'
);

const allSame = new Set(rows.map((r) => r.result)).size === 1;
console.log(`\n  세 방식의 계산 결과 일치 여부: ${allSame ? '일치 (' + rows[0].result + '가지)' : '불일치 — 버그다'}`);

// 응답성 막대
console.log('\n응답성 (하트비트 달성률)');
console.log('─'.repeat(94));
for (const r of rows) {
  // 하트비트가 이론치를 살짝 넘을 수 있으므로 100% 로 자른다
  const rate = Math.min(1, r.expectedBeats > 0 ? r.beats / r.expectedBeats : 1);
  const n = Math.min(40, Math.max(0, Math.round(rate * 40)));
  console.log(
    pad(r.label, 28) + '█'.repeat(n) + '░'.repeat(40 - n) + '  ' + (rate * 100).toFixed(0) + '%'
  );
}
console.log('─'.repeat(94));

console.log(`
읽는 법
  · 동기 버전은 코드가 가장 단순하고 CPU 낭비도 없다(${rows[0].ms.toFixed(0)}ms).
    그러나 그동안 하트비트가 ${rows[0].beats}회밖에 못 뛰었고 루프 지연 max 가
    ${rows[0].lagMax.toFixed(0)}ms 다. 이 시간 동안 들어온 모든 요청이 통째로 밀린다.
    헬스 체크도 응답하지 못해, 로드 밸런서는 이 인스턴스를 죽은 것으로 판단하고
    로테이션에서 빼 버린다(26장). 계산은 성공했는데 서비스는 장애가 난다.
  · setImmediate 인터리빙은 총 시간이 늘어나는 대신(${rows[1].ms.toFixed(0)}ms)
    루프 지연이 크게 줄어 하트비트가 ${rows[1].beats}회 뛰었다.
    코드 수정이 가장 적게 드는 완화책이지만, CPU 는 여전히 메인 스레드가 태운다.
    다른 요청도 이 스레드를 나눠 써야 하므로 전체 처리량은 오히려 떨어진다.
  · 워커 풀은 메인 스레드가 계산에 전혀 참여하지 않는다.
    루프 지연 p99 가 ${rows[2].lagP99.toFixed(1)}ms 로 유휴 상태와 다름없고,
    코어가 여러 개면 총 시간까지 짧아진다.

선택 기준
  · 수십 ms 이내로 끝나는 작업 → 그냥 동기로 한다. 워커 통신 비용이 더 크다.
  · 수백 ms 이상 걸리거나 입력 크기가 사용자에게 달려 있다 → 워커 스레드 풀.
  · 코드를 크게 못 고치는 상황의 임시 완화 → setImmediate 인터리빙.
  · 워커로 넘길 데이터가 크면 직렬화 비용을 먼저 재 본다.
    SharedArrayBuffer 나 transferList 로 복사를 피할 수 있다(11.5절).

주의
  · 이 측정은 CPU 코어 ${os.availableParallelism()}개인 환경에서 나온 값이다.
    코어가 1개뿐인 컨테이너(cpu limit: 1)에서는 워커 풀도 총 시간을 줄이지 못한다.
    그래도 "메인 스레드가 응답 가능한 상태로 남는다"는 이점은 그대로다.
`);
