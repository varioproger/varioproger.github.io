// 11.4·11.6절 — 재사용 가능한 워커 스레드 풀 구현
//
// 단독 실행: node worker-pool.js   (아래 데모가 돌아간다)
// 라이브러리로 사용: import { WorkerPool } from './worker-pool.js'
//
// 워커를 매번 새로 만들면 스레드 생성 비용(수십 ms)과 V8 인스턴스 메모리(수 MB)가
// 작업마다 든다. 풀은 워커를 미리 만들어 두고 작업만 메시지로 실어 보낸다.

import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export class WorkerPool extends EventEmitter {
  #workerFile;
  #size;
  #workers = [];        // 모든 워커
  #idle = [];           // 놀고 있는 워커
  #queue = [];          // 대기 중인 작업
  #tasks = new Map();   // taskId → { resolve, reject }
  #nextId = 1;
  #closed = false;

  constructor(workerFile, size = Math.max(1, os.availableParallelism() - 1)) {
    super();
    this.#workerFile = workerFile;
    this.#size = size;
    for (let i = 0; i < size; i++) this.#spawn(i);
  }

  get size() {
    return this.#size;
  }
  get pending() {
    return this.#queue.length;
  }
  get busy() {
    return this.#workers.length - this.#idle.length;
  }

  #spawn(index) {
    const worker = new Worker(this.#workerFile, { workerData: { index } });
    worker.unref(); // 풀 때문에 프로세스가 종료되지 못하는 일을 막는다

    // 워커가 결과를 보내면 해당 작업의 프로미스를 정착시킨다
    worker.on('message', (msg) => {
      const task = this.#tasks.get(msg.id);
      if (!task) return;
      this.#tasks.delete(msg.id);
      if (msg.ok) task.resolve(msg.result);
      else {
        const err = new Error(msg.error?.message ?? '워커 작업 실패');
        err.stack = msg.error?.stack ?? err.stack;
        task.reject(err);
      }
      this.#release(worker);
    });

    // 워커 자체가 죽으면 진행 중이던 작업을 실패시키고 새 워커로 교체한다.
    // 이 처리가 없으면 호출자의 프로미스가 영원히 정착하지 않는다
    worker.on('error', (err) => {
      this.emit('workerError', err);
      this.#retire(worker, err);
    });
    worker.on('exit', (code) => {
      if (code !== 0 && !this.#closed) {
        this.#retire(worker, new Error(`워커가 코드 ${code} 로 종료됨`));
      }
    });

    this.#workers.push(worker);
    this.#idle.push(worker);
  }

  // 죽은 워커를 정리하고 대체 워커를 만든다
  #retire(worker, err) {
    const wasIdle = this.#idle.indexOf(worker);
    if (wasIdle !== -1) this.#idle.splice(wasIdle, 1);
    const all = this.#workers.indexOf(worker);
    if (all !== -1) this.#workers.splice(all, 1);

    // 이 워커가 처리 중이던 작업을 찾아 실패시킨다
    for (const [id, task] of this.#tasks) {
      if (task.worker === worker) {
        this.#tasks.delete(id);
        task.reject(err);
      }
    }
    worker.terminate().catch(() => {});
    if (!this.#closed) this.#spawn(-1);
    this.#drain();
  }

  #release(worker) {
    this.#idle.push(worker);
    this.#drain();
  }

  // 놀고 있는 워커가 있으면 대기 중인 작업을 하나 배정한다
  #drain() {
    while (this.#idle.length > 0 && this.#queue.length > 0) {
      const worker = this.#idle.pop();
      const job = this.#queue.shift();
      job.worker = worker;
      this.#tasks.set(job.id, job);
      worker.postMessage({ id: job.id, payload: job.payload });
    }
  }

  // 작업을 제출하고 결과 프로미스를 받는다
  run(payload) {
    if (this.#closed) return Promise.reject(new Error('풀이 이미 종료됐다'));
    return new Promise((resolve, reject) => {
      this.#queue.push({ id: this.#nextId++, payload, resolve, reject, worker: null });
      this.#drain();
    });
  }

  // 여러 작업을 한 번에 제출한다. 결과는 입력 순서로 돌아온다
  runAll(payloads) {
    return Promise.all(payloads.map((p) => this.run(p)));
  }

  // 모든 워커를 종료한다. 반드시 호출해야 프로세스가 깔끔하게 끝난다
  async destroy() {
    this.#closed = true;
    for (const job of this.#queue) job.reject(new Error('풀 종료로 작업이 취소됨'));
    this.#queue.length = 0;
    await Promise.all(this.#workers.map((w) => w.terminate()));
    this.#workers.length = 0;
    this.#idle.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 단독 실행 시의 데모
// ─────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
  const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
  const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

  const workerFile = path.join(here, 'worker-task.js');
  const size = Math.min(4, Math.max(1, os.availableParallelism() - 1));

  console.log('='.repeat(80));
  console.log('  워커 풀 데모 (11.4·11.6절)');
  console.log(`  CPU 코어 ${os.availableParallelism()}개 · 풀 크기 ${size}`);
  console.log('='.repeat(80));

  const pool = new WorkerPool(workerFile, size);

  // (1) 워커 생성 비용 vs 재사용
  const t0 = performance.now();
  await pool.runAll(Array.from({ length: 20 }, () => ({ type: 'ping' })));
  const reuseMs = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < 20; i++) {
    const w = new Worker(workerFile, { workerData: { index: i } });
    await new Promise((resolve) => {
      w.on('message', () => resolve());
      w.postMessage({ id: 1, payload: { type: 'ping' } });
    });
    await w.terminate();
  }
  const spawnMs = performance.now() - t1;

  console.log('\n[1] 작업 20개 처리 — 워커를 매번 만들 때 vs 풀을 재사용할 때');
  console.log('─'.repeat(80));
  console.log(pad('방식', 34) + padL('소요(ms)', 14) + padL('작업당(ms)', 16));
  console.log('─'.repeat(80));
  console.log(pad('매번 new Worker + terminate', 34) + padL(spawnMs.toFixed(1), 14) + padL((spawnMs / 20).toFixed(2), 16));
  console.log(pad('WorkerPool 재사용', 34) + padL(reuseMs.toFixed(1), 14) + padL((reuseMs / 20).toFixed(2), 16));
  console.log('─'.repeat(80));
  console.log(`  → 재사용이 약 ${(spawnMs / reuseMs).toFixed(1)}배 빠르다. 차이는 전부 스레드 생성 비용이다.`);

  // (2) 큐잉 동작
  console.log('\n[2] 풀 크기보다 많은 작업을 넣으면 큐에서 대기한다');
  console.log('─'.repeat(80));
  const jobs = pool.runAll(
    Array.from({ length: size * 3 }, () => ({ type: 'busy', ms: 60 }))
  );
  const snaps = [];
  const iv = setInterval(() => snaps.push(`실행 ${pool.busy} / 대기 ${pool.pending}`), 25);
  await jobs;
  clearInterval(iv);
  console.log('  ' + snaps.join('  |  '));

  // (3) 워커 안에서 던진 예외는 호출자의 프로미스로 전달된다
  console.log('\n[3] 워커 안의 예외는 호출자에게 전달된다');
  console.log('─'.repeat(80));
  try {
    await pool.run({ type: 'boom' });
  } catch (err) {
    console.log(`  잡힌 오류: ${err.message}`);
  }

  await pool.destroy();
  console.log('\n풀을 종료했다. destroy() 를 부르지 않으면 프로세스가 끝나지 않을 수 있다.');
}
