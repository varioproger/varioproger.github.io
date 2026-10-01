// 3.3·3.6절 — 재귀 process.nextTick 이 I/O 를 굶기는 현상과 setImmediate 로 고치기
//
// 실행: node starvation.js
//
// nextTick 큐는 "현재 작업이 끝날 때마다 완전히 비워질 때까지" 처리된다.
// 그 큐가 계속 새 항목을 만들어 내면 이벤트 루프는 poll 단계로 넘어가지 못하고,
// 이미 완료된 I/O 의 콜백조차 영영 실행되지 않는다.
// setImmediate 는 check 단계에 예약되므로 한 번 실행할 때마다 루프가 한 바퀴 돈다.

import { readFile } from 'node:fs';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const ROUNDS = 200_000; // 몇 초 안에 끝나도록 작게 잡는다

// 한글은 터미널에서 폭 2를 차지한다. 표를 맞추려면 문자 수가 아니라 표시 폭으로 채워야 한다
const wide = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// 결과 표를 그리는 헬퍼
const COLS = [
  ['방식', 28],
  ['반복 횟수', 14],
  ['총 소요(ms)', 16],
  ['I/O 콜백이 실행된 시점', 30],
];

function printTable(rows) {
  const line = (cells) => cells.map((c, i) => pad(c, COLS[i][1])).join('');
  console.log('─'.repeat(88));
  console.log(line(COLS.map((c) => c[0])));
  console.log('─'.repeat(88));
  for (const r of rows) console.log(line(r));
  console.log('─'.repeat(88));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) 굶기는 버전: 재귀 process.nextTick
//    반복이 끝날 때까지 I/O 콜백은 한 번도 실행되지 못한다.
// ─────────────────────────────────────────────────────────────────────────────
function starving() {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    let ioFiredAtRound = null; // I/O 콜백이 실행됐을 때의 반복 카운터
    let count = 0;

    // 파일 읽기를 시작한다. 읽기 자체는 스레드풀에서 금방 끝나지만,
    // 그 완료 콜백은 poll 단계에서만 실행될 수 있다.
    readFile(filename, () => {
      ioFiredAtRound = count;
    });

    function spin() {
      if (count++ < ROUNDS) {
        // nextTick 큐에 다시 넣는다 → 루프는 다음 단계로 넘어가지 못한다
        process.nextTick(spin);
        return;
      }
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      // 이 시점에도 ioFiredAtRound 는 여전히 null 이다
      const observed = ioFiredAtRound;
      // 루프가 다시 돌기 시작하면 그제야 I/O 콜백이 실행된다.
      // 잠깐 기다렸다가 그 사실을 확인한다
      setTimeout(
        () => resolve({ ms, duringLoop: observed, afterLoop: ioFiredAtRound }),
        30
      );
    }

    spin();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) 고친 버전: setImmediate
//    한 번 실행할 때마다 이벤트 루프가 한 바퀴 돌아 poll 단계를 지나므로
//    I/O 콜백이 반복 도중에 끼어들 수 있다.
// ─────────────────────────────────────────────────────────────────────────────
function fair() {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    let ioFiredAtRound = null;
    let count = 0;

    readFile(filename, () => {
      ioFiredAtRound = count;
    });

    function spin() {
      if (count++ < ROUNDS) {
        // check 단계에 예약한다 → 루프가 한 바퀴 돌면서 poll 단계를 통과한다
        setImmediate(spin);
        return;
      }
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({ ms, duringLoop: ioFiredAtRound, afterLoop: ioFiredAtRound });
    }

    spin();
  });
}

console.log('='.repeat(88));
console.log('  이벤트 루프 굶기기: 재귀 nextTick vs setImmediate (3.3·3.6절)');
console.log(`  반복 횟수: ${ROUNDS.toLocaleString('ko-KR')}회`);
console.log('='.repeat(88));

const bad = await starving();
const good = await fair();

printTable([
  [
    'process.nextTick (굶김)',
    ROUNDS.toLocaleString('ko-KR'),
    bad.ms.toFixed(1),
    bad.duringLoop === null
      ? '반복 중 실행 안 됨 (null)'
      : `${bad.duringLoop}번째 반복`,
  ],
  [
    'setImmediate (정상)',
    ROUNDS.toLocaleString('ko-KR'),
    good.ms.toFixed(1),
    good.duringLoop === null
      ? '반복 중 실행 안 됨 (null)'
      : `${good.duringLoop.toLocaleString('ko-KR')}번째 반복`,
  ],
]);

console.log(`
읽는 법
  · nextTick 버전의 "I/O 콜백이 실행된 시점"이 null 이라는 것은,
    ${ROUNDS.toLocaleString('ko-KR')}번의 반복이 모두 끝날 때까지 파일 읽기 완료 콜백이
    단 한 번도 실행되지 못했다는 뜻이다. 파일은 진작 다 읽혔는데도 그렇다.
    반복이 끝나고 루프가 다시 돌자 그제야 실행됐다 (기록된 반복 카운터: ${
      bad.afterLoop === null ? '여전히 null' : bad.afterLoop.toLocaleString('ko-KR')
    }).
  · setImmediate 버전은 반복 초반에 이미 I/O 콜백이 끼어들었다.
    루프가 매번 poll 단계를 지나가기 때문이다.
  · 대신 setImmediate 는 매 반복마다 루프를 한 바퀴 돌므로 총 소요 시간이 더 길다.
    "빠르지만 아무것도 못 하게 막는 것"과 "느리지만 서버가 응답하는 것" 사이의 거래다.

실무 규칙
  · 재귀적으로 자기를 다시 예약하는 코드에 process.nextTick 을 쓰지 않는다.
  · 큰 배열을 나눠 처리하는 등 CPU 작업을 쪼갤 때는 setImmediate 를 쓴다.
  · 그마저도 근본 해결은 아니다. 진짜 CPU 바운드 작업은 워커 스레드로 보낸다(11장).
`);
