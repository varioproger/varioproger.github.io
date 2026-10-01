// 16.5 오류 처리 미들웨어와 오류 응답 규약 — RFC 7807 problem+json
//
// 오류 응답의 규약을 서비스마다 다르게 만들면 클라이언트가 매번 다른 파싱 코드를 쓴다.
// RFC 7807(Problem Details for HTTP APIs)은 이 규약을 표준화한다.
// 가장 중요한 규칙: 5xx 의 내부 메시지는 절대 클라이언트로 새지 않는다.
// 스택 트레이스, SQL 문, 내부 호스트 이름은 공격자에게 지도를 그려 준다.

/** 애플리케이션 오류의 기반 클래스 */
export class AppError extends Error {
  /**
   * @param {string} message 내부용 메시지. 5xx 라면 클라이언트에 노출되지 않는다
   * @param {{ statusCode?: number, code?: string, retryable?: boolean, details?: object, cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.statusCode = options.statusCode ?? 500;
    // 기계가 읽는 안정적인 식별자. 메시지 문구는 바뀌어도 이 값은 유지한다
    this.code = options.code ?? 'INTERNAL_ERROR';
    // 클라이언트가 재시도해도 되는가. HTTP 클라이언트의 재시도 판별이 이 값을 본다
    this.retryable = options.retryable ?? this.statusCode >= 500;
    this.details = options.details;
    this.expose = this.statusCode < 500; // 메시지를 그대로 보여도 되는가
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 404 — 자원이 없다 */
export class NotFoundError extends AppError {
  constructor(resource = '자원', options = {}) {
    super(`${resource}을(를) 찾을 수 없다`, {
      statusCode: 404,
      code: 'NOT_FOUND',
      retryable: false,
      ...options,
    });
    this.resource = resource;
  }
}

/** 400 — 입력이 규약을 어겼다. details.errors 에 필드별 사유를 담는다 */
export class ValidationError extends AppError {
  constructor(message = '요청이 올바르지 않다', fieldErrors = [], options = {}) {
    super(message, {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      retryable: false,
      details: { errors: fieldErrors },
      ...options,
    });
  }
}

/** 502 — 하류 서비스가 실패했다. 우리 잘못이 아니라도 사용자에게는 우리의 실패다 */
export class UpstreamError extends AppError {
  constructor(target, options = {}) {
    super(`하류 서비스 호출 실패: ${target}`, {
      statusCode: 502,
      code: 'UPSTREAM_FAILURE',
      retryable: true,
      ...options,
    });
    this.target = target;
  }
}

/** 504 — 예산 안에 답이 오지 않았다 */
export class TimeoutError extends AppError {
  constructor(target, timeoutMs, options = {}) {
    super(`${target} 호출이 ${timeoutMs}ms 안에 끝나지 않았다`, {
      statusCode: 504,
      code: 'UPSTREAM_TIMEOUT',
      retryable: true,
      ...options,
    });
    this.target = target;
    this.timeoutMs = timeoutMs;
  }
}

/** 503 — 서킷이 열려 있어 시도조차 하지 않았다 */
export class CircuitOpenError extends AppError {
  constructor(target, retryAfterMs, options = {}) {
    super(`${target} 회로가 열려 있어 호출하지 않았다`, {
      statusCode: 503,
      code: 'CIRCUIT_OPEN',
      retryable: true,
      ...options,
    });
    this.target = target;
    this.retryAfterMs = retryAfterMs;
  }
}

/** 상태 코드별 기본 title. 5xx 는 일반화된 문구만 쓴다 */
const TITLES = {
  400: '잘못된 요청',
  401: '인증 필요',
  403: '권한 없음',
  404: '찾을 수 없음',
  409: '충돌',
  415: '지원하지 않는 미디어 타입',
  422: '처리할 수 없는 엔터티',
  429: '요청이 너무 많음',
  500: '내부 서버 오류',
  502: '게이트웨이 오류',
  503: '서비스를 이용할 수 없음',
  504: '게이트웨이 시간 초과',
};

/** problem type URI 의 기준. 실제로는 문서 URL 을 가리키게 한다 */
const TYPE_BASE = 'https://example.com/probs';

/**
 * 오류를 RFC 7807 problem+json 객체로 직렬화한다.
 *
 * 5xx 는 message 를 그대로 쓰지 않는다. 내부 메시지에는 커넥션 문자열, 파일 경로,
 * 하류 호스트 이름이 섞여 들어오기 때문이다. 대신 상관관계 ID만 돌려주고
 * 실제 원인은 서버 로그에서 그 ID로 찾는다.
 *
 * @param {unknown} err
 * @param {string} [instance] 문제가 발생한 요청의 경로
 * @param {{ correlationId?: string }} [options]
 * @returns {{ status: number, body: object }}
 */
export function toProblemJson(err, instance, options = {}) {
  const statusCode = Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode <= 599
    ? err.statusCode
    : 500;
  const isServerError = statusCode >= 500;
  const code = typeof err?.code === 'string' && /^[A-Z_]+$/.test(err.code)
    ? err.code
    : isServerError
      ? 'INTERNAL_ERROR'
      : 'BAD_REQUEST';

  const body = {
    type: `${TYPE_BASE}/${code.toLowerCase().replaceAll('_', '-')}`,
    title: TITLES[statusCode] ?? (isServerError ? '내부 서버 오류' : '요청 오류'),
    status: statusCode,
    // 4xx 만 내부 메시지를 그대로 노출한다. 5xx 는 일반화한다.
    detail: isServerError
      ? '요청을 처리하지 못했다. 문제가 계속되면 correlationId 와 함께 문의한다.'
      : (err?.message ?? '요청이 올바르지 않다'),
    code,
  };

  if (instance) body.instance = instance;
  if (options.correlationId) body.correlationId = options.correlationId;
  if (typeof err?.retryable === 'boolean') body.retryable = err.retryable;
  // details 는 4xx 에서만 노출한다. 검증 오류의 필드 목록이 여기 들어간다
  if (!isServerError && err?.details && typeof err.details === 'object') {
    body.details = err.details;
  }
  if (statusCode === 503 && Number.isFinite(err?.retryAfterMs)) {
    body.retryAfterSeconds = Math.ceil(err.retryAfterMs / 1000);
  }

  return { status: statusCode, body };
}

/** problem+json 응답의 Content-Type */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

/**
 * node:http 응답에 problem+json 을 그대로 쓴다.
 * 로깅은 여기서 하지 않는다. 예외는 최종적으로 처리되는 곳에서 한 번만 기록한다.
 */
export function writeProblem(res, err, { instance, correlationId } = {}) {
  const { status, body } = toProblemJson(err, instance, { correlationId });
  if (res.headersSent) {
    // 이미 응답이 시작됐다면 형식을 맞출 수 없다. 연결을 끊어 클라이언트가 실패를 알게 한다
    res.destroy(err instanceof Error ? err : new Error(String(err)));
    return;
  }
  const headers = { 'content-type': PROBLEM_CONTENT_TYPE };
  if (body.retryAfterSeconds) headers['retry-after'] = String(body.retryAfterSeconds);
  if (correlationId) headers['x-correlation-id'] = correlationId;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

/** 임의의 throw 값을 AppError 로 정규화한다. 문자열을 던지는 라이브러리가 아직 있다 */
export function normalizeError(value) {
  if (value instanceof AppError) return value;
  if (value instanceof Error) {
    return new AppError(value.message, {
      statusCode: Number.isInteger(value.statusCode) ? value.statusCode : 500,
      code: typeof value.code === 'string' && /^[A-Z_]+$/.test(value.code) ? value.code : 'INTERNAL_ERROR',
      cause: value,
    });
  }
  return new AppError(`Error 가 아닌 값이 던져졌다: ${typeof value}`, { cause: value });
}
