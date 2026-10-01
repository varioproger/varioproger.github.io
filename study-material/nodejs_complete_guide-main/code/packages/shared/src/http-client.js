// 15.6 재시도·타임아웃·데드라인의 조합 + 29.6 지수 백오프와 서킷 브레이커
//
// 이 저장소의 핵심 예제다. 원격 호출을 안전하게 만드는 네 장치가 한곳에 모여 있다.
//   - 타임아웃: 시도 하나가 무한정 매달리지 않게 한다
//   - 데드라인: 요청 트리 전체의 최악 지연에 상한을 건다(재시도 폭풍의 근본 해결)
//   - 재시도 + 백오프/지터: 일시적 실패를 흡수하되 상대를 더 밀어붙이지 않는다
//   - 서킷 브레이커: 지속적 실패에는 아예 시도하지 않는다
//
// 재시도는 "한 번 더 해보자", 서킷 브레이커는 "당분간 하지 말자"다.

import { setTimeout as delay } from 'node:timers/promises';
import { getCorrelationId } from './logger.js';
import { CircuitOpenError, TimeoutError, UpstreamError } from './errors.js';

// ---------------------------------------------------------------------------
// 데드라인 — 절대 시각으로 된 예산
// ---------------------------------------------------------------------------

/**
 * 상대 시간이 아니라 절대 시각으로 예산을 표현한다.
 * 각 계층에서 "남은 시간의 80%" 식으로 새 타임아웃을 만들면 오차가 누적되고
 * 큐 대기 시간이 예산에서 누락된다.
 */
export class Deadline {
  /** @param {number} at epoch ms 로 표현한 만료 시각 */
  constructor(at) {
    this.at = at;
  }

  /** 지금부터 ms 밀리초 뒤를 만료 시각으로 잡는다 */
  static in(ms) {
    return new Deadline(Date.now() + ms);
  }

  /** 값이 무엇이든 Deadline 으로 정규화한다(숫자면 ms 예산으로 해석) */
  static from(value, fallbackMs) {
    if (value instanceof Deadline) return value;
    if (Number.isFinite(value)) return Deadline.in(Number(value));
    return Deadline.in(fallbackMs);
  }

  get remaining() {
    return this.at - Date.now();
  }

  get expired() {
    return this.remaining <= 0;
  }

  /** 남은 예산과 개별 시도 타임아웃 중 더 짧은 쪽만큼 유효한 AbortSignal */
  toSignal(perAttemptMs, parentSignal) {
    const budget = Math.max(0, this.remaining);
    const ms = Number.isFinite(perAttemptMs) ? Math.min(perAttemptMs, budget) : budget;
    const timeout = AbortSignal.timeout(Math.max(0, ms));
    return parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  }
}

// ---------------------------------------------------------------------------
// 재시도 가능 판별
// ---------------------------------------------------------------------------

/** 재시도해도 되는 HTTP 상태 코드. 4xx 중에서는 408 과 429 뿐이다 */
export const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** 재시도 가능한 소켓·DNS 오류 */
export const RETRYABLE_SYSCALL = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN', // DNS 일시 실패
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** 재시도해도 안전한 HTTP 메서드. 멱등성이 규약으로 보장된다 */
export const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/**
 * 이 오류를 다시 시도해도 되는가.
 * 판별 기준은 두 축이다. 오류가 일시적인가, 그리고 연산이 멱등한가.
 */
export function isRetryable(err, { method = 'GET', hasIdempotencyKey = false } = {}) {
  if (!err) return false;
  // 호출자가 명시적으로 취소한 것은 재시도 대상이 아니다
  if (err.name === 'AbortError' && err.cause?.name === 'UserAbort') return false;
  // POST 는 기본적으로 재시도하지 않는다. 멱등성 키가 있어야 안전해진다(29.5)
  if (!IDEMPOTENT_METHODS.has(method.toUpperCase()) && !hasIdempotencyKey) return false;
  // 타임아웃은 요청이 이미 처리됐을 수 있다. 멱등 메서드에 한해 재시도한다
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  if (RETRYABLE_SYSCALL.has(err.code)) return true;
  if (RETRYABLE_SYSCALL.has(err.cause?.code)) return true;
  if (Number.isInteger(err.status)) return RETRYABLE_STATUS.has(err.status);
  return false;
}

/**
 * 완전 지터(full jitter): [0, exponential) 구간의 균등 난수를 대기 시간으로 쓴다.
 * 지터 없는 지수 백오프는 절반만 구현한 것이다. 무리 짓기(thundering herd)를
 * 막지 못하면 백오프의 목적 자체가 달성되지 않는다.
 */
export function fullJitterDelay(attempt, { baseMs = 100, maxMs = 2000 } = {}) {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.random() * exponential;
}

/** 서버가 Retry-After 를 주면 그 값을 따르는 것이 최선이다. 초 또는 HTTP-date 를 받는다 */
export function parseRetryAfter(headerValue) {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(headerValue);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - Date.now());
}

// ---------------------------------------------------------------------------
// 서킷 브레이커 — 3상태
// ---------------------------------------------------------------------------

export const BreakerState = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open',
});

/**
 * 상태가 셋인 차단기.
 *  - closed:    정상 통과. 연속 실패가 임계치를 넘으면 open 으로.
 *  - open:      즉시 실패. resetTimeoutMs 가 지나면 half-open 으로.
 *  - half-open: 제한된 수의 탐색 요청만 통과. 성공하면 closed, 실패하면 다시 open.
 */
export class CircuitBreaker {
  #state = BreakerState.CLOSED;
  #failures = 0;
  #successes = 0;
  #openedAt = 0;
  #halfOpenInFlight = 0;

  constructor({
    name = 'default',
    failureThreshold = 5,
    successThreshold = 2,
    resetTimeoutMs = 10_000,
    halfOpenMax = 1,
    onStateChange = null,
  } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.halfOpenMax = halfOpenMax;
    this.onStateChange = onStateChange;
  }

  get state() {
    // open 상태의 만료를 조회 시점에 평가한다. 타이머를 두지 않아 프로세스를 붙잡지 않는다
    if (this.#state === BreakerState.OPEN && Date.now() - this.#openedAt >= this.resetTimeoutMs) {
      this.#transition(BreakerState.HALF_OPEN);
    }
    return this.#state;
  }

  /** open 상태가 풀릴 때까지 남은 밀리초 */
  get retryAfterMs() {
    if (this.#state !== BreakerState.OPEN) return 0;
    return Math.max(0, this.resetTimeoutMs - (Date.now() - this.#openedAt));
  }

  #transition(next) {
    if (this.#state === next) return;
    const prev = this.#state;
    this.#state = next;
    if (next === BreakerState.OPEN) {
      this.#openedAt = Date.now();
      this.#successes = 0;
    }
    if (next === BreakerState.HALF_OPEN) {
      this.#successes = 0;
      this.#halfOpenInFlight = 0;
    }
    if (next === BreakerState.CLOSED) {
      this.#failures = 0;
      this.#successes = 0;
    }
    this.onStateChange?.({ name: this.name, from: prev, to: next });
  }

  /** 호출을 시작해도 되는가. half-open 에서는 탐색 슬롯을 하나 점유한다 */
  tryAcquire() {
    const state = this.state;
    if (state === BreakerState.OPEN) return false;
    if (state === BreakerState.HALF_OPEN) {
      if (this.#halfOpenInFlight >= this.halfOpenMax) return false;
      this.#halfOpenInFlight += 1;
    }
    return true;
  }

  /** 성공 보고 */
  recordSuccess() {
    if (this.#state === BreakerState.HALF_OPEN) {
      this.#halfOpenInFlight = Math.max(0, this.#halfOpenInFlight - 1);
      this.#successes += 1;
      if (this.#successes >= this.successThreshold) this.#transition(BreakerState.CLOSED);
      return;
    }
    this.#failures = 0;
  }

  /** 실패 보고. half-open 에서의 실패 한 번은 즉시 open 으로 되돌린다 */
  recordFailure() {
    if (this.#state === BreakerState.HALF_OPEN) {
      this.#halfOpenInFlight = Math.max(0, this.#halfOpenInFlight - 1);
      this.#transition(BreakerState.OPEN);
      return;
    }
    this.#failures += 1;
    if (this.#failures >= this.failureThreshold) this.#transition(BreakerState.OPEN);
  }

  /** 관측용 스냅숏 */
  snapshot() {
    return {
      name: this.name,
      state: this.state,
      failures: this.#failures,
      successes: this.#successes,
      retryAfterMs: this.retryAfterMs,
    };
  }

  /** 테스트용 초기화 */
  reset() {
    this.#failures = 0;
    this.#successes = 0;
    this.#halfOpenInFlight = 0;
    this.#transition(BreakerState.CLOSED);
  }
}

// ---------------------------------------------------------------------------
// 클라이언트 팩토리
// ---------------------------------------------------------------------------

/** 응답 본문을 content-type 에 따라 해석한다 */
async function parseBody(response) {
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    // 204 등 본문이 없는 응답에서 json() 은 던진다
    const text = await response.text();
    if (text.length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (type.startsWith('text/')) return response.text();
  return response.arrayBuffer();
}

/** 상태 코드가 실패인 응답을 던질 수 있는 오류로 바꾼다 */
function httpErrorFrom(response, target, body) {
  const err = new Error(`${target} 응답 ${response.status}`);
  err.name = 'HttpStatusError';
  err.status = response.status;
  err.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  err.body = body;
  return err;
}

/**
 * 하류 서비스 하나를 호출하는 클라이언트를 만든다.
 *
 * @param {object} options
 * @param {string} options.baseUrl              하류 서비스 베이스 URL
 * @param {string} [options.name]               지표·로그·오류 메시지에 쓰는 이름
 * @param {number} [options.timeoutMs]          시도 하나의 타임아웃(재시도 총합이 아니다)
 * @param {number} [options.retries]            최초 시도 이후 추가 재시도 횟수
 * @param {number} [options.deadlineMs]         기본 전체 예산. 호출자가 deadline 을 주면 그쪽이 이긴다
 * @param {number} [options.retryBaseMs]        백오프 기준 간격
 * @param {number} [options.retryMaxMs]         백오프 상한
 * @param {object|false} [options.breaker]      서킷 브레이커 설정. false 면 끈다
 * @param {Record<string,string>} [options.defaultHeaders]
 * @param {typeof fetch} [options.fetchImpl]    테스트에서 주입한다
 * @param {(event: object) => void} [options.onEvent] 재시도·상태 전이 관측 훅
 */
export function createClient({
  baseUrl,
  name = undefined,
  timeoutMs = 1000,
  retries = 2,
  deadlineMs = 3000,
  retryBaseMs = 100,
  retryMaxMs = 2000,
  breaker = {},
  defaultHeaders = {},
  fetchImpl = globalThis.fetch,
  onEvent = null,
} = {}) {
  if (!baseUrl) throw new TypeError('createClient: baseUrl 은 필수다');
  const target = name ?? new URL(baseUrl).host;

  const circuit =
    breaker === false
      ? null
      : new CircuitBreaker({
          name: target,
          onStateChange: (e) => onEvent?.({ type: 'breaker', ...e }),
          ...breaker,
        });

  /**
   * 요청 하나를 보낸다.
   * @param {string} path 베이스 URL 기준 경로
   * @param {object} [init]
   * @param {Deadline|number} [init.deadline] 상위에서 내려온 예산. 이 안에서만 재시도한다
   * @param {AbortSignal} [init.signal]       호출자의 취소 신호
   * @param {boolean} [init.idempotencyKey]   비멱등 메서드를 재시도 가능하게 만든다
   */
  async function request(path, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const deadline = Deadline.from(init.deadline, deadlineMs);
    const maxAttempts = retries + 1;
    const correlationId = getCorrelationId();
    let lastError;

    const url = new URL(path, `${baseUrl}/`).href;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // 예산이 이미 소진됐다면 시도조차 하지 않는다. 클라이언트가 포기한 요청을 보내는 것은 순수한 낭비다
      if (deadline.expired) {
        lastError ??= new TimeoutError(target, deadlineMs);
        break;
      }

      // 회로가 열려 있으면 실제 호출 없이 즉시 실패한다
      if (circuit && !circuit.tryAcquire()) {
        throw new CircuitOpenError(target, circuit.retryAfterMs, { cause: lastError });
      }

      const headers = {
        accept: 'application/json',
        ...defaultHeaders,
        ...init.headers,
      };
      // 상관관계 ID를 전파한다. 이 규칙을 지켜야 게이트웨이부터 최말단까지 하나의 ID로 이어진다
      if (correlationId) headers['x-correlation-id'] = correlationId;
      // 남은 예산을 헤더로 넘겨 수신 측이 자기 데드라인으로 복원하게 한다
      headers['x-request-deadline-ms'] = String(Math.max(0, Math.floor(deadline.remaining)));
      if (init.idempotencyKey) headers['idempotency-key'] = String(init.idempotencyKey);

      let body = init.body;
      if (body !== undefined && typeof body === 'object' && !(body instanceof Uint8Array)) {
        body = JSON.stringify(body);
        headers['content-type'] ??= 'application/json; charset=utf-8';
      }

      try {
        const response = await fetchImpl(url, {
          method,
          headers,
          body,
          // 개별 시도 타임아웃과 남은 예산 중 짧은 쪽이 이긴다
          signal: deadline.toSignal(timeoutMs, init.signal),
        });

        const parsed = await parseBody(response);

        // 실패 상태 코드는 던져서 아래 catch 의 재시도·회로 판정을 한 곳에서 받게 한다.
        // 4xx 는 재시도해도 같은 답이 오고, 상대가 죽었다는 증거도 아니므로 회로에 세지 않는다.
        if (!response.ok) throw httpErrorFrom(response, target, parsed);

        circuit?.recordSuccess();
        return {
          status: response.status,
          headers: response.headers,
          body: parsed,
          attempts: attempt + 1,
        };
      } catch (err) {
        // 호출자가 직접 취소한 경우는 하류의 실패가 아니다
        if (init.signal?.aborted) {
          const cancelled = new Error(`${target} 호출이 취소되었다`);
          cancelled.name = 'AbortError';
          cancelled.cause = { name: 'UserAbort' };
          throw cancelled;
        }
        if (err instanceof CircuitOpenError) throw err;

        const retryable = isRetryable(err, {
          method,
          hasIdempotencyKey: Boolean(init.idempotencyKey),
        });
        // 실패는 4xx(=상대가 살아 있다는 증거)를 뺀 나머지만 회로에 센다
        if (retryable) circuit?.recordFailure();
        else circuit?.recordSuccess();

        if (!retryable) throw toPublicError(err, target, timeoutMs);
        lastError = err;

        // 마지막 시도였다면 더 기다릴 이유가 없다
        if (attempt === maxAttempts - 1) break;

        // 서버가 Retry-After 를 줬다면 그 값을 우선한다. 서버가 자기 회복 시점을 가장 잘 안다
        const backoff = Number.isFinite(err.retryAfterMs)
          ? err.retryAfterMs
          : fullJitterDelay(attempt, { baseMs: retryBaseMs, maxMs: retryMaxMs });

        // 대기만 하다 예산을 넘길 상황이면 시도하지 않는다
        if (backoff >= deadline.remaining) break;

        onEvent?.({ type: 'retry', target, attempt: attempt + 1, backoffMs: backoff, code: err.code ?? err.status });
        await delay(backoff);
      }
    }

    throw toPublicError(lastError ?? new Error('알 수 없는 실패'), target, timeoutMs);
  }

  /** 내부 오류를 서비스 경계의 AppError 로 바꾼다. 하류 세부 정보를 클라이언트에 흘리지 않는다 */
  function toPublicError(err, targetName, perAttemptMs) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return new TimeoutError(targetName, perAttemptMs, { cause: err });
    }
    return new UpstreamError(targetName, {
      cause: err,
      details: { status: err?.status, code: err?.code },
    });
  }

  return {
    request,
    get: (path, init) => request(path, { ...init, method: 'GET' }),
    head: (path, init) => request(path, { ...init, method: 'HEAD' }),
    post: (path, body, init) => request(path, { ...init, method: 'POST', body }),
    put: (path, body, init) => request(path, { ...init, method: 'PUT', body }),
    patch: (path, body, init) => request(path, { ...init, method: 'PATCH', body }),
    delete: (path, init) => request(path, { ...init, method: 'DELETE' }),
    /** 헬스 체크와 /metrics 노출용 */
    get breakerState() {
      return circuit ? circuit.state : 'disabled';
    },
    snapshot: () => (circuit ? circuit.snapshot() : { name: target, state: 'disabled' }),
    target,
  };
}

export default createClient;
