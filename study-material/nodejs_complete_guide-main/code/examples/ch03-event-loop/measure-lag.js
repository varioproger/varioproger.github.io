// 3.6절 — perf_hooks.monitorEventLoopDelay 로 이벤트 루프 지연을 측정하고,
//          동기 블로킹 작업을 주입해 수치가 튀는 것을 확인한다
//
// 실행: node measure-lag.js
//
// monitorEventLoopDelay 는 libuv 타이머로 정해진 간격마다 "지금 시각"을 재고,
// 예정 시각과의 차이를 히스토그램에 누적한다. setTimeout 으로 직접 재는 것보다
// 정확하고 오버헤드가 작다. p99 는 사용자가 체감하는 꼬리 지연에 가깝다.

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const RESOLUTION_MS = 10; // 히스토그램 샘플링 간격
const WINDOW_MS = 700;    // 한 구간을 관찰하는 시간
const ns2ms = (ns) => ns / 1e6;

// 한글은 터미널에서 폭 2를 차지한다. 표를 맞추려면 문자 수가 아니라 표시 폭으로 채워야 한다
const wide = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// 지정한 시간(ms) 동안 이벤트 루프를 완전히 붙잡는 동기 작업.
// 실제 서비스에서는 큰 JSON.parse, 동기 암호화, 거대한 정규식 등이 이 역할을 한다
function blockSync(ms) {
  const until = performance.now() + ms;
  let h = createHash('sha256');
  while (performance.now() < until) {
    // 최적화로 통째로 제거되지 않도록 실제 계산을 돌린다
    h = createHash('sha256').update(h.digest());
  }
}

// 한 구간을 관찰한다. inject 는 관찰 중 주기적으로 실행할 작업이다
async function observe(label, { injectEveryMs, blockMs }) {
  const h = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  h.enable();

  let injections = 0;
  const timer = injectEveryMs
    ? setInterval(() => {
        injections++;
        blockSync(blockMs);
      }, injectEveryMs)
    : null;

  // 관찰 중에도 정상적인 비동기 작업이 계속 돌고 있다고 가정한다
  const ticker = setInterval(() => {}, 20);

  await new Promise((r) => setTimeout(r, WINDOW_MS));

  if (timer) clearInterval(timer);
  clearInterval(ticker);
  h.disable();

  return {
    label,
    injections,
    blockMs,
    min: ns2ms(h.min),
    mean: ns2ms(h.mean),
    p50: ns2ms(h.percentile(50)),
    p90: ns2ms(h.percentile(90)),
    p99: ns2ms(h.percentile(99)),
    max: ns2ms(h.max),
  };
}

function printTable(rows) {
  const cols = [
    ['구간', 26],
    ['주입', 8],
    ['min', 9],
    ['mean', 9],
    ['p50', 9],
    ['p90', 9],
    ['p99', 10],
    ['max', 10],
  ];
  const line = (cells) =>
    cells.map((c, i) => (i < 2 ? pad(c, cols[i][1]) : padL(c, cols[i][1] - 2) + '  ')).join('');
  console.log('─'.repeat(92));
  console.log(line(cols.map((c) => c[0])));
  console.log('─'.repeat(92));
  for (const r of rows) {
    console.log(
      line([
        r.label,
        r.injections ? `${r.injections}회` : '없음',
        r.min.toFixed(2),
        r.mean.toFixed(2),
        r.p50.toFixed(2),
        r.p90.toFixed(2),
        r.p99.toFixed(2),
        r.max.toFixed(2),
      ])
    );
  }
  console.log('─'.repeat(92));
  console.log('  (단위: ms — 이벤트 루프가 예정보다 늦게 깨어난 시간)');
}

// 값의 크기를 막대로 보여 준다
function bar(value, max, width = 46) {
  const n = Math.max(1, Math.round((value / max) * width));
  return '█'.repeat(Math.min(n, width));
}

console.log('='.repeat(92));
console.log('  이벤트 루프 지연 측정 — monitorEventLoopDelay (3.6절)');
console.log(`  샘플링 간격 ${RESOLUTION_MS}ms · 구간당 관찰 시간 ${WINDOW_MS}ms`);
console.log('='.repeat(92));
console.log('\n측정 중... (약 3초)');

const results = [];
results.push(await observe('1. 유휴 (블로킹 없음)', {}));
results.push(await observe('2. 5ms 블로킹 주입', { injectEveryMs: 50, blockMs: 5 }));
results.push(await observe('3. 50ms 블로킹 주입', { injectEveryMs: 100, blockMs: 50 }));
results.push(await observe('4. 200ms 블로킹 주입', { injectEveryMs: 250, blockMs: 200 }));

console.log();
printTable(results);

const maxP99 = Math.max(...results.map((r) => r.p99));
console.log('\np99 비교');
console.log('─'.repeat(92));
for (const r of results) {
  console.log(
    pad(r.label, 26) + bar(r.p99, maxP99) + '  ' + r.p99.toFixed(2) + 'ms'
  );
}
console.log('─'.repeat(92));

console.log(`
읽는 법
  · 유휴 구간의 값이 샘플링 간격(${RESOLUTION_MS}ms) 근처에 머문다.
    히스토그램은 ${RESOLUTION_MS}ms 마다 깨어나 지연을 재므로 이 값이 측정의 바닥(기준선)이다.
    실제 지연은 "측정값 − 기준선"으로 읽는다.
  · 블로킹 시간이 그대로 p99 로 올라온다. 50ms 를 막으면 p99 가 60ms(= 기준선 10 + 블로킹 50)가 된다.
    이벤트 루프가 막힌 동안 도착한 모든 요청이 그만큼 통째로 밀리기 때문이다.
  · p50 은 네 구간 모두 기준선에서 거의 움직이지 않는데 p99 와 max 만 크게 튄다.
    평균이나 중앙값만 보면 "정상"이라 판단하기 쉽지만, 사용자의 1%는 이미 느리다고 느낀다.
    이벤트 루프 지연은 반드시 백분위수로 봐야 한다.
  · 4번 구간은 주입 횟수가 2회뿐인데도 p99 가 200ms 를 넘는다.
    드물게 일어나는 긴 블로킹 하나가 꼬리 지연을 통째로 지배한다는 뜻이다.

실무 적용
  · prom-client 는 nodejs_eventloop_lag_p99_seconds 를 자동으로 노출한다(30장).
  · p99 가 100ms 를 넘으면 CPU 사용률이 낮아도 확장 신호로 본다
    (infra/k8s/hpa.yaml 의 커스텀 지표 주석 참고).
  · 원인을 찾을 때는 --cpu-prof 나 --prof 로 어떤 동기 함수가 오래 도는지 확인한다(34장).
`);
