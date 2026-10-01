// 29.6절 — 서킷 브레이커 구현과 상태 전이 시뮬레이션
//
// 실행: node circuit-breaker.js
//
// 이미 죽은 서비스에 계속 요청을 보내는 것은 두 가지로 해롭다.
//   1) 우리 쪽: 매 요청이 타임아웃까지 기다리며 커넥션과 이벤트 루프를 붙든다
//   2) 상대 쪽: 회복하려는 서비스에 부하를 계속 얹어 회복을 방해한다
// 서킷 브레이커는 실패가 임계치를 넘으면 회로를 열어 "즉시 실패"시킨다.

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((n, c) => n + (wide.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + String(s);

export class CircuitBreaker {
  // CLOSED    : 정상. 요청을 그대로 통과시킨다
  // OPEN      : 차단. 호출하지 않고 즉시 실패시킨다
  // HALF_OPEN : 탐색. 소수의 요청만 통과시켜 회복 여부를 확인한다
  static CLOSED = 'CLOSED';
  static OPEN = 'OPEN';
  static HALF_OPEN = 'HALF_OPEN';

  #state = CircuitBreaker.CLOSED;
  #failures = 0;
  #successes = 0;
  #openedAt = 0;
  #halfOpenInFlight = 0;

  constructor({
    failureThreshold = 5,   // 연속 실패 몇 번에 회로를 열 것인가
    successThreshold = 2,   // HALF_OPEN 에서 몇 번 성공해야 닫을 것인가
    resetTimeoutMs = 3000,  // OPEN 을 유지할 시간
    halfOpenMaxCalls = 1,   // HALF_OPEN 에서 동시에 허용할 탐색 요청 수
    now = () => Date.now(),
  } = {}) {
    Object.assign(this, {
      failureThreshold,
      successThreshold,
      resetTimeoutMs,
      halfOpenMaxCalls,
      now,
    });
    this.transitions = []; // 상태 전이 기록(학습용)
  }

  get state() {
    return this.#state;
  }
  get failures() {
    return this.#failures;
  }

  #to(next, reason) {
    if (this.#state === next) return;
    this.transitions.push({ at: this.now(), from: this.#state, to: next, reason });
    this.#state = next;
    if (next === CircuitBreaker.OPEN) {
      this.#openedAt = this.now();
      this.#successes = 0;
      this.#halfOpenInFlight = 0;
    }
    if (next === CircuitBreaker.CLOSED) {
      this.#failures = 0;
      this.#successes = 0;
    }
    if (next === CircuitBreaker.HALF_OPEN) {
      this.#successes = 0;
      this.#halfOpenInFlight = 0;
    }
  }

  async execute(fn, fallback) {
    // OPEN 이면 유예 시간이 지났는지 먼저 확인한다
    if (this.#state === CircuitBreaker.OPEN) {
      if (this.now() - this.#openedAt >= this.resetTimeoutMs) {
        this.#to(CircuitBreaker.HALF_OPEN, '유예 시간 경과 — 회복 여부를 탐색한다');
      } else {
        // 여기가 핵심이다. 상대를 호출하지 않고 즉시 실패시킨다.
        // 타임아웃을 기다리지 않으므로 우리 자원도, 상대의 회복도 지킬 수 있다
        return this.#fail(new Error('회로가 열려 있음 (요청을 보내지 않았다)'), fallback);
      }
    }

    // HALF_OPEN 에서는 정해진 수의 탐색 요청만 통과시킨다.
    // 모두 통과시키면 아직 회복하지 않은 서비스에 부하가 한꺼번에 몰린다
    if (this.#state === CircuitBreaker.HALF_OPEN) {
      if (this.#halfOpenInFlight >= this.halfOpenMaxCalls) {
        return this.#fail(new Error('회로 탐색 중 — 추가 요청은 차단'), fallback);
      }
      this.#halfOpenInFlight++;
    }

    try {
      const result = await fn();
      this.#onSuccess();
      return { ok: true, result };
    } catch (err) {
      this.#onFailure();
      return this.#fail(err, fallback);
    }
  }

  #fail(err, fallback) {
    if (fallback !== undefined) return { ok: true, result: fallback, degraded: true };
    return { ok: false, error: err };
  }

  #onSuccess() {
    if (this.#state === CircuitBreaker.HALF_OPEN) {
      this.#halfOpenInFlight--;
      if (++this.#successes >= this.successThreshold) {
        this.#to(CircuitBreaker.CLOSED, `연속 성공 ${this.#successes}회 — 정상 복귀`);
      }
      return;
    }
    this.#failures = 0; // CLOSED 에서 성공하면 실패 카운터를 되돌린다
  }

  #onFailure() {
    if (this.#state === CircuitBreaker.HALF_OPEN) {
      this.#halfOpenInFlight--;
      // 탐색이 실패하면 곧바로 다시 연다. 유예 시간도 처음부터 다시 센다
      this.#to(CircuitBreaker.OPEN, '탐색 요청 실패 — 다시 차단');
      return;
    }
    if (++this.#failures >= this.failureThreshold) {
      this.#to(CircuitBreaker.OPEN, `연속 실패 ${this.#failures}회 — 회로 개방`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 시뮬레이션: 가상 시계를 쓰므로 실제로 기다리지 않는다
// ─────────────────────────────────────────────────────────────────────────────
let clock = 0;
const now = () => clock;

// 구간에 따라 건강 상태가 바뀌는 원격 서비스
let healthy = true;
let realCalls = 0;
const TIMEOUT_MS = 500; // 죽은 서비스를 호출하면 이만큼 기다린다

async function remoteCall() {
  realCalls++;
  if (!healthy) {
    clock += TIMEOUT_MS; // 타임아웃까지 기다린 셈으로 시계를 민다
    throw new Error('업스트림 타임아웃');
  }
  clock += 20;
  return '레시피 목록';
}

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 3000,
  halfOpenMaxCalls: 1,
  now,
});

console.log('='.repeat(94));
console.log('  서킷 브레이커 상태 전이 (29.6절)');
console.log('  임계치: 연속 실패 5회에 개방 · 3000ms 후 탐색 · 연속 성공 2회에 복귀');
console.log('='.repeat(94));

const log = [];
async function step(label) {
  const before = breaker.state;
  const callsBefore = realCalls;
  const transBefore = breaker.transitions.length;
  const r = await breaker.execute(remoteCall, undefined);

  // 한 번의 요청 안에서 상태가 두 번 바뀔 수도 있다(OPEN → HALF_OPEN → OPEN).
  // 전이 기록을 이어 붙여 경로를 그대로 보여 준다
  const path = [before, ...breaker.transitions.slice(transBefore).map((t) => t.to)];
  log.push({
    t: clock,
    label,
    path: path.join(' → '),
    called: realCalls > callsBefore,
    ok: r.ok,
    detail: r.ok ? r.result : r.error.message,
  });
  clock += 10; // 요청 간 간격
}

// 1단계: 정상
for (let i = 0; i < 3; i++) await step('정상 구간');

// 2단계: 서비스 장애 발생
healthy = false;
for (let i = 0; i < 7; i++) await step('장애 구간');

// 3단계: 회로가 열린 동안의 요청 — 상대를 호출조차 하지 않는다
for (let i = 0; i < 3; i++) await step('회로 개방 중');

// 4단계: 유예 시간이 지났지만 서비스는 아직 죽어 있다
clock += 3000;
await step('유예 후 탐색(실패)');
for (let i = 0; i < 2; i++) await step('재차단 상태');

// 5단계: 서비스 회복
healthy = true;
clock += 3000;
for (let i = 0; i < 4; i++) await step('회복 후');

const C = [[10, '시각'], [22, '상황'], [32, '상태 전이'], [16, '실제 호출'], [22, '결과']];
console.log();
console.log('─'.repeat(94));
console.log(C.map(([w, h], i) => (i === 0 ? padL(h, w) : '  ' + pad(h, w - 2))).join(''));
console.log('─'.repeat(94));
for (const r of log) {
  console.log(
    padL(r.t, 10) +
      '  ' +
      pad(r.label, 20) +
      '  ' +
      pad(r.path, 30) +
      '  ' +
      pad(r.called ? '예' : '아니오 (차단)', 14) +
      r.detail
  );
}
console.log('─'.repeat(94));

console.log('\n상태 전이 기록');
console.log('─'.repeat(94));
for (const t of breaker.transitions) {
  console.log(`  ${padL(t.at, 6)}ms  ${pad(`${t.from} → ${t.to}`, 26)}${t.reason}`);
}
console.log('─'.repeat(94));

const blocked = log.filter((r) => !r.called).length;
const savedMs = blocked * TIMEOUT_MS;
console.log(`
읽는 법
  · 전체 요청 ${log.length}건 중 ${blocked}건은 원격 서비스를 아예 호출하지 않았다.
    호출했다면 각각 타임아웃(${TIMEOUT_MS}ms)까지 기다렸을 것이므로
    약 ${savedMs}ms 의 대기와 그만큼의 커넥션 점유를 아꼈다.
  · 회로가 열려 있는 동안 상대 서비스는 우리 트래픽에서 완전히 벗어난다.
    이것이 "회복하려는 서비스를 방해하지 않는다"는 서킷 브레이커의 두 번째 목적이다.
  · HALF_OPEN 에서 탐색 요청 하나가 실패하자 즉시 OPEN 으로 돌아갔다.
    전체 트래픽을 한꺼번에 흘려보내지 않으므로 회복 중인 서비스가 다시 넘어지지 않는다.
  · HALF_OPEN 에서 연속 2회 성공한 뒤에야 CLOSED 로 복귀했다.
    한 번의 우연한 성공으로 복귀하면 곧바로 다시 열리는 진동(flapping)이 생긴다.

실무 지침
  · 폴백을 함께 설계한다. execute(fn, fallback) 에 기본값을 주면 회로가 열려도
    캐시된 값이나 축소된 응답으로 서비스를 이어갈 수 있다(우아한 성능 저하).
  · 상태를 메트릭으로 내보낸다(30장). circuit_breaker_state{service="recipe-api"}
    가 1(OPEN)이 되는 순간이 곧 알람이다.
  · 임계치는 트래픽에 맞춘다. 초당 1000요청에서 "연속 5회 실패"는 5ms 만에 도달한다.
    실무에서는 연속 횟수 대신 "최근 N초 실패율 50% 이상" 같은 비율 기준을 더 많이 쓴다.
  · 서킷 브레이커는 타임아웃·재시도와 함께 써야 의미가 있다.
    타임아웃이 없으면 실패로 판정되기까지 무한정 기다린다(retry-backoff.js 참고).
`);
