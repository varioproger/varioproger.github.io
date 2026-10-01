// 3.2~3.4절 — 이벤트 루프 단계별 실행 순서를 출력으로 증명한다
//
// 실행: node phases.js
//
// 확인할 것:
//   1) 동기 코드가 전부 끝나기 전에는 어떤 콜백도 실행되지 않는다
//   2) 콜백 안에서는 process.nextTick 큐가 Promise(마이크로태스크) 큐보다 먼저 비워진다
//   3) 메인 모듈에서 setTimeout(0) 과 setImmediate 의 순서는 "비결정적"이다
//   4) 하지만 I/O 콜백 안에서는 setImmediate 가 항상 먼저다
//   5) ESM 최상위에서는 nextTick 과 Promise 의 순서가 CommonJS 와 다르다 (아래 설명 참고)

import { readFile } from 'node:fs';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);

// 한글은 터미널에서 폭 2를 차지한다. 표를 맞추려면 문자 수가 아니라 표시 폭으로 채워야 한다
const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

let seq = 0;
const rows = [];

// 실행될 때마다 순번을 매겨 기록한다
function log(phase, label) {
  rows.push({ no: ++seq, phase, label });
}

function printTable() {
  console.log('\n실행 순서 기록');
  console.log('─'.repeat(88));
  console.log(pad('순번', 8) + pad('단계 / 큐', 34) + '무엇이 실행됐나');
  console.log('─'.repeat(88));
  for (const r of rows) {
    console.log(pad(r.no, 8) + pad(r.phase, 34) + r.label);
  }
  console.log('─'.repeat(88));
}

console.log('='.repeat(88));
console.log('  이벤트 루프 단계 실행 순서 (3.2~3.4절)');
console.log('='.repeat(88));

// ── 1라운드: 메인 모듈(동기 실행 구간)에서 모든 종류의 콜백을 등록한다 ─────────

log('(동기) 메인 모듈', '스크립트 시작');

setTimeout(() => log('timers 단계', 'setTimeout(fn, 0)'), 0);
setTimeout(() => log('timers 단계', 'setTimeout(fn, 1)'), 1);
setImmediate(() => log('check 단계', 'setImmediate(fn)'));

// 등록 순서는 뒤지만 실행은 훨씬 빠른 것들
Promise.resolve().then(() => log('마이크로태스크 큐', '메인의 Promise.then'));
queueMicrotask(() => log('마이크로태스크 큐', '메인의 queueMicrotask'));
process.nextTick(() => log('nextTick 큐', '메인의 process.nextTick'));

// I/O 콜백은 poll 단계에서 실행된다
readFile(filename, () => {
  log('poll 단계', 'fs.readFile 콜백 (I/O 완료)');

  // ── 2라운드: I/O 콜백 "안에서" 다시 등록한다 ────────────────────────────
  // poll 단계 바로 다음이 check 단계이므로 여기서는 순서가 결정적이다.
  setTimeout(() => log('timers 단계 (I/O 콜백 안)', 'setTimeout(fn, 0)  ← 항상 나중'), 0);

  setImmediate(() => {
    log('check 단계 (I/O 콜백 안)', 'setImmediate(fn)   ← 항상 먼저');

    // ── 3라운드: 한 콜백 안에서 nextTick 과 Promise 의 우선순위 ──────────
    // 어떤 콜백이 끝날 때마다 nextTick 큐를 "완전히" 비우고,
    // 그 다음에 마이크로태스크(Promise) 큐를 비운다.
    Promise.resolve().then(() => {
      log('마이크로태스크 큐 (콜백 안)', 'Promise.then #1');
      process.nextTick(() =>
        log('nextTick 큐 (콜백 안)', 'Promise 안에서 등록한 nextTick')
      );
    });
    Promise.resolve().then(() => log('마이크로태스크 큐 (콜백 안)', 'Promise.then #2'));

    process.nextTick(() => {
      log('nextTick 큐 (콜백 안)', 'process.nextTick #1  ← Promise 보다 먼저');
      // nextTick 안에서 등록한 nextTick 도 같은 라운드에서 소진된다.
      // 이 성질 때문에 재귀 nextTick 은 이벤트 루프를 굶긴다(starvation.js 참고)
      process.nextTick(() =>
        log('nextTick 큐 (콜백 안)', 'nextTick 안에서 등록한 nextTick (같은 라운드)')
      );
    });
    process.nextTick(() => log('nextTick 큐 (콜백 안)', 'process.nextTick #2'));

    // 위 체인이 모두 소진된 뒤 결과를 출력한다
    setTimeout(report, 50);
  });
});

log('(동기) 메인 모듈', '스크립트 끝 — 여기까지가 동기 구간');

function report() {
  printTable();

  // 실제로 관찰된 순서를 근거로 설명한다
  const at = (needle) => rows.findIndex((r) => r.label.includes(needle)) + 1;
  const tickMain = at('메인의 process.nextTick');
  const promiseMain = at('메인의 Promise.then');
  const timeoutMain = at('setTimeout(fn, 0)');
  const immediateMain = rows.findIndex(
    (r) => r.phase === 'check 단계' && r.label.startsWith('setImmediate')
  ) + 1;
  const ioImmediate = at('setImmediate(fn)   ← 항상 먼저');
  const ioTimeout = at('setTimeout(fn, 0)  ← 항상 나중');
  const tickCb = at('process.nextTick #1');
  const promiseCb = at('Promise.then #1');

  console.log(`
정리

1. 동기 구간이 먼저다
   순번 1·2가 동기 코드다. 그 사이에는 어떤 콜백도 끼어들지 못한다.
   메인 모듈이 오래 걸리면 이미 완료된 I/O 조차 대기한다.

2. 콜백 안에서는 nextTick 이 Promise 보다 먼저다  (순번 ${tickCb} < ${promiseCb})
   콜백 하나가 끝날 때마다 nextTick 큐를 완전히 비우고, 그 다음 마이크로태스크 큐를 비운다.

3. 그런데 ESM 최상위에서는 반대로 나온다  (Promise ${promiseMain} < nextTick ${tickMain})
   ES 모듈의 평가 자체가 하나의 프로미스 작업(job) 안에서 일어나기 때문이다.
   모듈 본문이 끝나면 현재 마이크로태스크 체크포인트가 먼저 소진되고, nextTick 큐는 그 뒤다.
   같은 코드를 .cjs 로 바꿔 실행하면 nextTick 이 먼저 나온다. 직접 확인해 보라:
     node -e "process.nextTick(()=>console.log('tick')); Promise.resolve().then(()=>console.log('promise'))"

4. 메인에서 setTimeout(0) 과 setImmediate 의 순서는 비결정적이다  (이번 실행: ${timeoutMain} vs ${immediateMain})
   타이머 등록부터 루프 진입까지 1ms 가 지났는지에 달렸다. 여러 번 실행하면 뒤바뀐다.

5. I/O 콜백 안에서는 setImmediate 가 항상 먼저다  (순번 ${ioImmediate} < ${ioTimeout})
   poll 단계 바로 다음이 check 단계이기 때문이다. 이것이 둘의 실질적 차이다.
   "I/O 이후에 무언가를 하고 싶다"면 setTimeout(0) 이 아니라 setImmediate 를 쓴다.
`);
}
