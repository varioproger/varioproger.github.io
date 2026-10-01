// 11.4절 — 워커 스레드 측 스크립트
//
// 직접 실행하지 않는다. worker-pool.js 의 WorkerPool 이 이 파일을 워커로 띄운다.
//
// 프로토콜
//   메인 → 워커 : { id, payload }
//   워커 → 메인 : { id, ok: true, result } 또는 { id, ok: false, error: {message, stack} }
//
// 중요: 워커 안에서 예외를 그냥 던지면 'error' 이벤트로 워커가 통째로 죽는다.
// 풀이 워커를 재사용하려면 여기서 잡아 결과 메시지로 되돌려 줘야 한다.

import { parentPort, workerData } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('이 파일은 워커 스레드로만 실행된다. worker-pool.js 를 실행하라.');
}

// 부분집합 합: [from, to) 범위의 비트마스크만 검사해 target 이 되는 조합 수를 센다.
// 범위를 나눠 여러 워커에 뿌리면 그대로 병렬화된다.
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

// 지정한 시간만큼 CPU 를 붙잡는다(풀 데모용)
function busy(ms) {
  const until = Date.now() + ms;
  let x = 0;
  while (Date.now() < until) x = (x + 1) % 1_000_003;
  return x;
}

function handle(payload) {
  switch (payload.type) {
    case 'ping':
      return { pong: true, worker: workerData?.index ?? null };

    case 'busy':
      busy(payload.ms ?? 10);
      return { done: true };

    case 'subset-sum':
      return subsetSumRange(payload.numbers, payload.target, payload.from, payload.to);

    case 'boom':
      throw new Error('워커 안에서 의도적으로 던진 오류');

    default:
      throw new Error(`알 수 없는 작업 종류: ${payload.type}`);
  }
}

parentPort.on('message', ({ id, payload }) => {
  try {
    const result = handle(payload);
    parentPort.postMessage({ id, ok: true, result });
  } catch (err) {
    // 워커를 죽이지 않고 오류만 돌려보낸다 → 풀이 이 워커를 계속 재사용할 수 있다
    parentPort.postMessage({
      id,
      ok: false,
      error: { message: err.message, stack: err.stack },
    });
  }
});
