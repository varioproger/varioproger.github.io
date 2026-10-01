// 7.8절 — 순서를 보장하는 병렬 Transform 스트림 구현
//
// 실행: node transform-parallel.js
//
// 기본 Transform 은 한 청크의 콜백을 부르기 전까지 다음 청크를 받지 않는다.
// 즉 항상 순차 실행이다. 각 청크가 네트워크 호출이라면 이건 큰 낭비다.
// 콜백을 먼저 불러 병렬로 처리하면 빨라지지만, 이번엔 완료 순서대로 출력돼 순서가 깨진다.
// 인덱스를 붙여 재정렬하면 "병렬 처리 + 입력 순서 유지"를 둘 다 얻는다.

import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// ─────────────────────────────────────────────────────────────────────────────
// ParallelTransform — 동시성 제한 + (선택적) 순서 보장
// ─────────────────────────────────────────────────────────────────────────────
class ParallelTransform extends Transform {
  #task;
  #concurrency;
  #ordered;
  #running = 0;
  #inputIndex = 0;    // 들어온 순서를 매기는 카운터
  #nextToEmit = 0;    // 다음에 내보내야 할 인덱스
  #buffer = new Map(); // 먼저 끝났지만 차례가 아닌 결과를 잠시 담아 둔다
  #continue = null;   // 자리가 나면 부를 _transform 콜백
  #finish = null;     // _flush 콜백

  constructor({ task, concurrency = 4, ordered = true, ...opts }) {
    super({ objectMode: true, ...opts });
    this.#task = task;
    this.#concurrency = concurrency;
    this.#ordered = ordered;
  }

  _transform(chunk, _enc, cb) {
    const index = this.#inputIndex++;
    this.#running++;
    this.#process(chunk, index); // 기다리지 않는다 — 여기가 병렬성의 출발점

    if (this.#running < this.#concurrency) {
      cb(); // 아직 여유가 있으니 다음 청크를 곧바로 받는다
    } else {
      this.#continue = cb; // 꽉 찼다 — 자리가 날 때까지 상류를 멈춘다(백프레셔)
    }
  }

  async #process(chunk, index) {
    let result;
    try {
      result = await this.#task(chunk);
    } catch (err) {
      this.destroy(err); // 하나라도 실패하면 스트림 전체를 오류로 끝낸다
      return;
    }

    if (this.#ordered) {
      // 차례가 아니면 보관해 두고, 차례가 된 것부터 연속으로 내보낸다
      this.#buffer.set(index, result);
      while (this.#buffer.has(this.#nextToEmit)) {
        this.push(this.#buffer.get(this.#nextToEmit));
        this.#buffer.delete(this.#nextToEmit);
        this.#nextToEmit++;
      }
    } else {
      this.push(result); // 끝나는 대로 내보낸다 → 순서가 섞인다
    }

    this.#running--;

    // 막아 뒀던 상류를 다시 흐르게 한다
    if (this.#continue) {
      const cb = this.#continue;
      this.#continue = null;
      cb();
    }
    // 입력이 끝났고 진행 중인 작업도 없으면 스트림을 닫는다
    if (this.#finish && this.#running === 0) {
      const done = this.#finish;
      this.#finish = null;
      done();
    }
  }

  _flush(cb) {
    // 아직 처리 중인 작업이 남았으면 끝날 때까지 기다린다
    if (this.#running === 0) cb();
    else this.#finish = cb;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 실험용 데이터: 처리 시간이 제각각인 12개 항목
// 앞쪽 항목이 더 오래 걸리게 만들어 순서 뒤집힘이 잘 드러나게 한다
// ─────────────────────────────────────────────────────────────────────────────
const ITEMS = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  ms: [90, 20, 70, 10, 60, 15, 80, 25, 50, 5, 40, 30][i],
}));

const task = async (item) => {
  await new Promise((r) => setTimeout(r, item.ms));
  return item.id;
};

// 기본 Transform (순차). 비교 기준선이다
class SequentialTransform extends Transform {
  constructor() {
    super({ objectMode: true });
  }
  async _transform(chunk, _enc, cb) {
    try {
      cb(null, await task(chunk)); // 끝날 때까지 다음 청크를 받지 않는다
    } catch (err) {
      cb(err);
    }
  }
}

async function run(label, stream) {
  const out = [];
  const t0 = performance.now();
  await pipeline(
    Readable.from(ITEMS),
    stream,
    new Transform({
      objectMode: true,
      transform(id, _e, cb) {
        out.push(id);
        cb();
      },
    })
  );
  return { label, ms: performance.now() - t0, out };
}

console.log('='.repeat(92));
console.log('  순서 보장 병렬 Transform (7.8절)');
console.log(`  항목 ${ITEMS.length}개 · 처리 시간 ${ITEMS.map((i) => i.ms).join('/')}ms`);
console.log(`  전부 더하면 ${ITEMS.reduce((a, b) => a + b.ms, 0)}ms`);
console.log('='.repeat(92));

const results = [];
results.push(await run('순차 Transform (기본)', new SequentialTransform()));
results.push(
  await run(
    '병렬 4 · 순서 안 지킴',
    new ParallelTransform({ task, concurrency: 4, ordered: false })
  )
);
results.push(
  await run(
    '병렬 4 · 순서 보장',
    new ParallelTransform({ task, concurrency: 4, ordered: true })
  )
);
results.push(
  await run(
    '병렬 12 · 순서 보장',
    new ParallelTransform({ task, concurrency: 12, ordered: true })
  )
);

const expected = ITEMS.map((i) => i.id).join(',');
console.log();
console.log('─'.repeat(92));
console.log(pad('방식', 26) + padL('소요(ms)', 12) + '  ' + pad('순서 유지', 12) + '출력 순서');
console.log('─'.repeat(92));
for (const r of results) {
  const ok = r.out.join(',') === expected;
  console.log(
    pad(r.label, 26) +
      padL(r.ms.toFixed(0), 12) +
      '  ' +
      pad(ok ? '예' : '아니오', 12) +
      r.out.join(' ')
  );
}
console.log('─'.repeat(92));

// 오류가 나면 스트림 전체가 실패하는지 확인한다
let errMessage = '(오류 없음)';
try {
  await pipeline(
    Readable.from(ITEMS),
    new ParallelTransform({
      concurrency: 4,
      task: async (item) => {
        await new Promise((r) => setTimeout(r, item.ms));
        if (item.id === 3) throw new Error(`항목 ${item.id} 처리 실패`);
        return item.id;
      },
    }),
    new Transform({ objectMode: true, transform: (c, e, cb) => cb() })
  );
} catch (err) {
  errMessage = err.message;
}
console.log(`\n오류 처리: 한 항목이 실패하면 파이프라인 전체가 거부된다 → "${errMessage}"`);

console.log(`
읽는 법
  · 순차 Transform 은 처리 시간의 총합(${ITEMS.reduce((a, b) => a + b.ms, 0)}ms)만큼 걸린다.
    각 청크가 외부 API 호출이라면 이 시간은 전부 대기 시간이다.
  · 병렬 4는 약 4배 빨라진다. 하지만 순서를 지키지 않으면 출력이 완료 순으로 섞인다.
    로그 처리나 CSV 변환처럼 순서가 의미를 갖는 작업에서는 그대로 쓸 수 없다.
  · 순서 보장 버전은 같은 속도를 내면서 입력 순서를 그대로 유지한다.
    먼저 끝난 결과를 Map 에 담아 두었다가 차례가 되면 연속으로 내보내는 것이 전부다.
  · 동시성을 12(전체)로 올려도 가장 느린 항목(90ms)보다 빨라지지는 않는다.
    병렬화의 하한은 언제나 "가장 오래 걸리는 하나"다.

주의할 점
  · 순서 보장에는 대가가 있다. 첫 항목이 90ms 걸리면 나머지가 다 끝나도
    첫 항목이 나올 때까지 최대 11개의 결과가 메모리에 쌓인다.
    입력이 무한 스트림이라면 이 버퍼에도 상한을 둬야 한다.
  · concurrency 를 무한정 올리면 6장의 무제한 팬아웃과 같은 문제가 생긴다.
    상대 서비스가 감당할 수 있는 값으로 묶는다.
  · 이 구현은 _flush 에서 진행 중인 작업을 기다리고, 하나라도 실패하면 destroy 로
    전체를 끝낸다. 두 처리를 빠뜨리면 데이터가 조용히 유실된다.
`);
