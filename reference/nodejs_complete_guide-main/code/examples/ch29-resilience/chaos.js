// 29.7절 — 복원력 테스트: 확률적 실패 주입 래퍼와 이벤트 루프 정지 주입기
//
// 실행: node chaos.js
//       CHAOS_CRASH=1 node chaos.js    (프로세스 크래시 주입까지 켠다)
//
// 복원력은 "장애가 났을 때 어떻게 되는지"를 실제로 겪어 봐야 확인할 수 있다.
// 운영에서 장애를 기다리는 대신, 통제된 환경에서 장애를 만들어 낸다.

import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

// 재현 가능한 난수. 카오스 테스트는 재현되지 않으면 디버깅할 수 없다.
// 실무에서도 시드를 로그에 남겨 같은 시나리오를 다시 돌릴 수 있게 한다
let seed = 20260901;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// ─────────────────────────────────────────────────────────────────────────────
// (1) 확률적 실패 주입 래퍼
//     원래 함수를 감싸 확률적으로 실패·지연·타임아웃을 만들어 낸다.
//     호출부 코드는 전혀 바뀌지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
export function withChaos(fn, options = {}) {
  const {
    enabled = true,
    failureRate = 0,     // 즉시 실패할 확률
    latencyRate = 0,     // 지연을 끼워 넣을 확률
    latencyMs = 500,     // 끼워 넣을 지연의 최대치
    timeoutRate = 0,     // 영원히 응답하지 않을 확률(타임아웃 유발)
    errorFactory = () => new Error('카오스: 주입된 실패'),
    random = rand,
  } = options;

  const stats = { calls: 0, failed: 0, delayed: 0, timedOut: 0 };

  const wrapped = async (...args) => {
    stats.calls++;
    if (!enabled) return fn(...args);

    // 즉시 실패 — 업스트림이 500 을 주거나 커넥션이 끊긴 상황
    if (random() < failureRate) {
      stats.failed++;
      throw errorFactory();
    }

    // 응답 없음 — 가장 위험한 장애 유형이다. 오류보다 훨씬 다루기 어렵다
    if (random() < timeoutRate) {
      stats.timedOut++;
      await new Promise(() => {}); // 영원히 정착하지 않는다
    }

    // 느린 응답 — 죽지는 않았지만 느린 상태. 커넥션 풀을 고갈시킨다
    if (random() < latencyRate) {
      stats.delayed++;
      await new Promise((r) => setTimeout(r, random() * latencyMs));
    }

    return fn(...args);
  };

  wrapped.stats = stats;
  return wrapped;
}

// 타임아웃 없이 카오스를 켜면 테스트가 끝나지 않는다.
// 모든 원격 호출에 타임아웃을 거는 것은 카오스 테스트 이전에 지켜야 할 기본이다
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`타임아웃 ${ms}ms 초과`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) 이벤트 루프 정지 주입기
//     주기적으로 확률에 따라 메인 스레드를 동기적으로 붙잡는다.
//     "가끔 튀는 p99" 를 인위적으로 재현할 때 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
export class EventLoopChaos {
  #timer = null;
  #stalls = 0;
  #totalMs = 0;

  constructor({ everyMs = 100, probability = 0.3, stallMs = 120, random = rand } = {}) {
    Object.assign(this, { everyMs, probability, stallMs, random });
  }

  get stats() {
    return { stalls: this.#stalls, totalMs: this.#totalMs };
  }

  start() {
    this.#timer = setInterval(() => {
      if (this.random() >= this.probability) return;
      this.#stalls++;
      const until = performance.now() + this.stallMs;
      // 동기 루프로 이벤트 루프를 붙잡는다.
      // 실제 서비스에서는 거대한 JSON.parse, 동기 crypto, 폭주하는 정규식이 이 역할을 한다
      let h = createHash('sha256');
      while (performance.now() < until) h = createHash('sha256').update(h.digest());
      this.#totalMs += this.stallMs;
    }, this.everyMs);
    this.#timer.unref?.();
    return this;
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
    return this;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (3) 크래시 주입 — 기본값은 꺼져 있다
//     운영 환경에서 절대 켜지지 않도록 이중 안전장치를 둔다.
// ─────────────────────────────────────────────────────────────────────────────
export function maybeCrash({ probability = 0.001, random = rand } = {}) {
  const armed = process.env.CHAOS_CRASH === '1' && process.env.NODE_ENV !== 'production';
  if (!armed) return false;
  if (random() >= probability) return false;
  console.error('\n[카오스] 프로세스를 강제 종료한다. 재시작·복구 절차가 동작하는지 확인하라.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 데모
// ─────────────────────────────────────────────────────────────────────────────
const CALLS = 300;

// 원래의 정상적인 함수
async function fetchRecipe(id) {
  await new Promise((r) => setTimeout(r, 5));
  return { id, name: `레시피-${id}` };
}

async function drive(label, fn, timeoutMs = 300) {
  const latencies = [];
  let ok = 0;
  let failed = 0;
  const t0 = performance.now();

  for (let i = 0; i < CALLS; i++) {
    const s = performance.now();
    try {
      await withTimeout(fn(i), timeoutMs);
      ok++;
    } catch {
      failed++;
    }
    latencies.push(performance.now() - s);
  }

  latencies.sort((a, b) => a - b);
  const at = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
  return {
    label,
    ok,
    failed,
    totalMs: performance.now() - t0,
    p50: at(50),
    p99: at(99),
  };
}

console.log('='.repeat(94));
console.log('  카오스 엔지니어링: 실패 주입과 이벤트 루프 정지 (29.7절)');
console.log(`  호출 ${CALLS}회 · 클라이언트 타임아웃 300ms`);
console.log('='.repeat(94));

const baseline = await drive('카오스 없음', fetchRecipe);

const chaotic = withChaos(fetchRecipe, {
  failureRate: 0.15,  // 15% 즉시 실패
  latencyRate: 0.2,   // 20% 지연
  latencyMs: 400,
  timeoutRate: 0.05,  // 5% 무응답
});
const injected = await drive('실패 주입', chaotic);

console.log('\n[1] 실패 주입 래퍼');
console.log('─'.repeat(94));
console.log(
  pad('시나리오', 22) +
    padL('성공', 10) +
    padL('실패', 10) +
    padL('성공률', 12) +
    padL('p50(ms)', 12) +
    padL('p99(ms)', 12)
);
console.log('─'.repeat(94));
for (const r of [baseline, injected]) {
  console.log(
    pad(r.label, 22) +
      padL(r.ok, 10) +
      padL(r.failed, 10) +
      padL(`${((r.ok / CALLS) * 100).toFixed(1)}%`, 12) +
      padL(r.p50.toFixed(1), 12) +
      padL(r.p99.toFixed(1), 12)
  );
}
console.log('─'.repeat(94));
console.log(
  `  주입 내역: 즉시 실패 ${chaotic.stats.failed}회 · 지연 ${chaotic.stats.delayed}회 · ` +
    `무응답 ${chaotic.stats.timedOut}회 (총 ${chaotic.stats.calls}회 호출)`
);
console.log(
  '  무응답 5%가 없었다면 p99 는 지연 주입치(400ms)에 머물렀을 것이다.\n' +
    '  타임아웃이 없으면 이 5%가 커넥션을 영원히 붙들고, 결국 풀이 고갈된다.'
);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] 이벤트 루프 정지 주입');
console.log('─'.repeat(94));

async function measureLag(label, chaos) {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  await new Promise((r) => setTimeout(r, 30)); // 히스토그램 기준점을 잡는다
  chaos?.start();
  await new Promise((r) => setTimeout(r, 1200));
  chaos?.stop();
  await new Promise((r) => setTimeout(r, 30));
  h.disable();
  return {
    label,
    p50: h.percentile(50) / 1e6,
    p99: h.percentile(99) / 1e6,
    max: h.max / 1e6,
    stalls: chaos?.stats.stalls ?? 0,
  };
}

const quiet = await measureLag('정지 주입 없음', null);
const stalling = await measureLag(
  '정지 주입 (100ms마다 30% 확률로 120ms)',
  new EventLoopChaos({ everyMs: 100, probability: 0.3, stallMs: 120 })
);

console.log(
  pad('시나리오', 40) + padL('정지 횟수', 12) + padL('p50(ms)', 12) + padL('p99(ms)', 12) + padL('max(ms)', 12)
);
console.log('─'.repeat(94));
for (const r of [quiet, stalling]) {
  console.log(
    pad(r.label, 40) +
      padL(r.stalls, 12) +
      padL(r.p50.toFixed(1), 12) +
      padL(r.p99.toFixed(1), 12) +
      padL(r.max.toFixed(1), 12)
  );
}
console.log('─'.repeat(94));

console.log(`
읽는 법
  · 실패 주입은 호출부 코드를 전혀 바꾸지 않는다. 함수를 감싸기만 한다.
    이 성질 덕분에 설정(환경 변수)만으로 켜고 끌 수 있다.
  · 주입할 장애는 세 종류를 모두 다뤄야 한다.
      즉시 실패 — 가장 다루기 쉽다. 오류가 바로 온다
      느린 응답 — 커넥션 풀을 조용히 고갈시킨다
      무응답   — 가장 위험하다. 타임아웃이 없으면 영원히 기다린다
    많은 팀이 첫 번째만 테스트하고 나머지 둘에서 무너진다.
  · 이벤트 루프 정지 주입은 p50 은 거의 그대로 두고 p99 와 max 만 밀어 올린다.
    "평균은 멀쩡한데 일부 사용자만 느리다"는 신고를 재현하는 가장 빠른 방법이다.

카오스 테스트의 규칙
  · 반드시 재현 가능해야 한다. 난수 시드를 고정하고 로그에 남긴다.
    재현되지 않는 장애는 고쳤는지 확인할 방법도 없다.
  · 폭발 반경(blast radius)을 정한다. 트래픽의 1%, 특정 사용자군, 특정 인스턴스부터 시작한다.
  · 즉시 끌 수 있어야 한다. 이 파일의 maybeCrash 는 CHAOS_CRASH=1 이면서
    NODE_ENV 가 production 이 아닐 때만 동작한다. 안전장치는 항상 이중으로 둔다.
  · 가설을 먼저 세운다. "recipe-api 가 20% 실패해도 web-api 는 캐시로 200 을 준다" 처럼
    검증할 문장을 정하고, 어긋나면 그것이 발견한 결함이다.
  · 관측이 먼저다. 메트릭과 추적이 없으면 무엇이 깨졌는지도 알 수 없다(30·31장).

이 저장소의 다른 예제와 함께 보기
  · circuit-breaker.js — 주입된 실패가 임계치를 넘으면 회로를 열어 즉시 실패시킨다
  · retry-backoff.js   — 실패를 재시도할 때 몰림을 만들지 않는 방법
  · ../ch03-event-loop/measure-lag.js — 여기서 만든 정지를 실제로 측정하는 쪽

크래시 주입을 켜 보려면
  CHAOS_CRASH=1 node chaos.js
  프로세스가 죽은 뒤 systemd·pm2·쿠버네티스가 재시작하는지, 진행 중이던 작업이
  유실되지 않는지(멱등성·재처리) 확인한다. 29.1·29.5절의 주제다.
`);

maybeCrash({ probability: 0.5 });
