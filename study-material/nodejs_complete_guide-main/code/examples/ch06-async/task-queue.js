// 6.7절 — 동시성 제한 TaskQueue 구현과 무제한 실행의 비교
//
// 실행: node task-queue.js
//
// Promise.all(items.map(fetch)) 은 "전부 동시에" 시작한다. 항목이 10개면 괜찮지만
// 10,000개면 소켓과 메모리가 한꺼번에 터지고, 상대 서버는 우리를 공격으로 오해한다.
// 동시 실행 개수를 정해진 값으로 묶는 것이 TaskQueue 다.

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// ─────────────────────────────────────────────────────────────────────────────
// TaskQueue — 동시에 최대 concurrency 개의 작업만 실행한다
// ─────────────────────────────────────────────────────────────────────────────
class TaskQueue {
  #concurrency;
  #running = 0;
  #queue = [];

  constructor(concurrency) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new TypeError('concurrency 는 1 이상의 정수여야 한다');
    }
    this.#concurrency = concurrency;
  }

  get running() {
    return this.#running;
  }
  get pending() {
    return this.#queue.length;
  }

  // 작업(프로미스를 반환하는 함수)을 큐에 넣고, 그 결과를 담은 프로미스를 돌려준다
  push(task) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ task, resolve, reject });
      // 동기적으로 곧장 실행하면 Zalgo 가 된다(zalgo.js 참고). 다음 틱으로 미룬다
      process.nextTick(() => this.#next());
    });
  }

  // 여러 작업을 한 번에 넣고, 입력 순서 그대로 결과 배열을 받는다
  pushAll(tasks) {
    return Promise.all(tasks.map((t) => this.push(t)));
  }

  #next() {
    // 여유가 있는 만큼 큐에서 꺼내 실행한다
    while (this.#running < this.#concurrency && this.#queue.length > 0) {
      const { task, resolve, reject } = this.#queue.shift();
      this.#running++;
      // task() 가 동기적으로 던질 수도 있으므로 Promise.resolve().then 으로 감싼다
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          this.#running--;
          this.#next(); // 자리가 났으니 다음 작업을 꺼낸다
        });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 동시 접속 수에 상한이 있는 원격 서비스를 흉내 낸다.
// 상한을 넘으면 실제 서버가 그러듯 오류를 던진다(커넥션 풀 고갈, 429 등).
// ─────────────────────────────────────────────────────────────────────────────
function makeRemote({ maxConcurrent }) {
  let inFlight = 0;
  const stat = { peak: 0, failures: 0, calls: 0 };

  // 결정적인 재현을 위해 난수 대신 선형 합동 생성기를 쓴다
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  async function call(id) {
    stat.calls++;
    inFlight++;
    stat.peak = Math.max(stat.peak, inFlight);
    // 실제 서버처럼 "연결은 받아 두고" 처리 단계에서 과부하를 판정한다.
    // 접수 시점에 이미 한도를 넘었다면 이 요청은 결국 거절된다(503 / 커넥션 풀 고갈)
    const overloaded = inFlight > maxConcurrent;
    try {
      await new Promise((r) => setTimeout(r, 8 + Math.floor(rand() * 12)));
      if (overloaded) {
        stat.failures++;
        throw new Error(`동시 접속 한도 초과 (${inFlight} > ${maxConcurrent})`);
      }
      return `결과-${id}`;
    } finally {
      inFlight--;
    }
  }

  return { call, stat };
}

const TOTAL = 60;
const REMOTE_LIMIT = 5;

async function runUnbounded() {
  const remote = makeRemote({ maxConcurrent: REMOTE_LIMIT });
  const t0 = performance.now();
  // 전형적인 안티패턴: 60개를 한꺼번에 시작한다
  const settled = await Promise.allSettled(
    Array.from({ length: TOTAL }, (_, i) => remote.call(i))
  );
  return {
    label: '무제한 (Promise.allSettled)',
    ms: performance.now() - t0,
    peak: remote.stat.peak,
    ok: settled.filter((s) => s.status === 'fulfilled').length,
    failed: settled.filter((s) => s.status === 'rejected').length,
  };
}

async function runQueued(concurrency) {
  const remote = makeRemote({ maxConcurrent: REMOTE_LIMIT });
  const queue = new TaskQueue(concurrency);
  const t0 = performance.now();
  const settled = await Promise.allSettled(
    Array.from({ length: TOTAL }, (_, i) => queue.push(() => remote.call(i)))
  );
  return {
    label: `TaskQueue(동시 ${concurrency})`,
    ms: performance.now() - t0,
    peak: remote.stat.peak,
    ok: settled.filter((s) => s.status === 'fulfilled').length,
    failed: settled.filter((s) => s.status === 'rejected').length,
  };
}

console.log('='.repeat(92));
console.log('  동시성 제한 TaskQueue vs 무제한 실행 (6.7절)');
console.log(`  작업 ${TOTAL}개 · 원격 서비스의 동시 접속 한도 ${REMOTE_LIMIT}`);
console.log('='.repeat(92));

const rows = [];
rows.push(await runUnbounded());
rows.push(await runQueued(1));
rows.push(await runQueued(5));
rows.push(await runQueued(10));

const C = [[30, '방식'], [14, '최대 동시'], [12, '성공'], [12, '실패'], [14, '총 소요(ms)']];
console.log('─'.repeat(92));
console.log(C.map(([w, h], i) => (i === 0 ? pad(h, w) : padL(h, w))).join(''));
console.log('─'.repeat(92));
for (const r of rows) {
  console.log(
    pad(r.label, 30) +
      padL(r.peak, 14) +
      padL(r.ok, 12) +
      padL(r.failed, 12) +
      padL(r.ms.toFixed(1), 14)
  );
}
console.log('─'.repeat(92));

// 순서 보장 확인: 결과는 완료 순서가 아니라 "입력 순서"로 돌아온다
const q = new TaskQueue(3);
const ordered = await q.pushAll(
  [50, 5, 30, 1, 20].map((delay, i) => async () => {
    await new Promise((r) => setTimeout(r, delay));
    return `작업${i}(${delay}ms)`;
  })
);
console.log('\n결과 순서는 완료 순이 아니라 입력 순이다 (Promise.all 과 동일)');
console.log('  ' + ordered.join(' → '));

// 큐가 실제로 대기 중인 작업을 들고 있는지 관찰한다
const q2 = new TaskQueue(2);
const snapshots = [];
const jobs = Array.from({ length: 8 }, (_, i) =>
  q2.push(async () => {
    await new Promise((r) => setTimeout(r, 20));
    return i;
  })
);
const watcher = setInterval(
  () => snapshots.push(`실행 ${q2.running} / 대기 ${q2.pending}`),
  10
);
await Promise.all(jobs);
clearInterval(watcher);
console.log('\n큐 상태 스냅샷 (10ms 간격, 동시 2 제한, 작업 8개)');
console.log('  ' + snapshots.join('  |  '));

console.log(`
읽는 법
  · 무제한 실행은 ${TOTAL}개를 한꺼번에 시작해 최대 동시 실행이 ${rows[0].peak} 까지 치솟았고,
    원격 서비스의 한도(${REMOTE_LIMIT})를 넘긴 ${rows[0].failed}개가 실패했다.
    벽시계 시간(${rows[0].ms.toFixed(1)}ms)만 보면 가장 빠르지만, 성공한 것은 ${rows[0].ok}개뿐이다.
    "가장 빠른 방법"이 실제로는 가장 많이 실패하는 방법이었다.
  · TaskQueue(동시 ${REMOTE_LIMIT}) 는 ${rows[2].ok}개 전부 성공했다.
    총 소요 시간은 ${rows[2].ms.toFixed(1)}ms 로 더 길지만, 실패분 재시도 비용까지 넣으면
    실질적으로 더 빠르고 무엇보다 결과를 신뢰할 수 있다.
  · 동시 1은 순차 실행과 같다. 안전하지만 가장 느리다.
  · 동시 10은 다시 한도를 넘겨 ${rows[3].failed}개가 실패한다.
    상한은 "우리 서버"가 아니라 "상대의 능력"에 맞춰야 한다는 점이 핵심이다.

실무 적용
  · 외부 API 호출, 파일 처리, DB 쿼리 등 팬아웃이 생기는 모든 지점에 상한을 둔다.
  · items.map(async ...) + Promise.all 은 항목 수가 입력에 따라 변하면 그 자체로 사고 위험이다.
  · 큐가 무한정 커지는 것도 문제다. 운영 코드라면 pending 상한을 두고
    넘으면 즉시 거절해 백프레셔를 위로 전달한다(7장·26.5절).
  · 표준 라이브러리에는 없다. p-limit 같은 패키지를 쓰거나 위 40줄을 그대로 쓴다.
`);
