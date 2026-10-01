// 31.2 구조화된 로깅과 로그 수집 — pino + AsyncLocalStorage 상관관계 ID
//
// 로그 한 줄은 문장이 아니라 필드를 가진 이벤트다.
// 상관관계 ID를 함수 인자로 끝까지 들고 다니는 것은 현실적이지 않으므로
// AsyncLocalStorage 에 요청 컨텍스트를 담고, pino 의 mixin 이 로그를 찍는 시점에 조회한다.
// 애플리케이션 코드는 상관관계 ID의 존재조차 몰라도 된다.

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import pino from 'pino';

/** 요청 단위 컨텍스트 저장소. 비동기 호출 체인 전체에 걸쳐 유지된다 */
export const requestContext = new AsyncLocalStorage();

/**
 * 주어진 컨텍스트 안에서 fn 을 실행한다. 요청 진입점(서버 핸들러)에서 한 번 감싼다.
 * 상관관계 ID는 상류 서비스가 이미 부여했을 수 있으므로 헤더를 먼저 보고 없을 때만 만든다.
 */
export function runWithRequestContext(ctx, fn) {
  const store = { correlationId: ctx?.correlationId ?? randomUUID(), ...ctx };
  return requestContext.run(store, fn);
}

/** 현재 컨텍스트 전체를 돌려준다. 컨텍스트 밖이면 undefined */
export function getRequestContext() {
  return requestContext.getStore();
}

/** 현재 상관관계 ID. 컨텍스트 밖(부팅 코드, 배치 작업)에서는 undefined */
export function getCorrelationId() {
  return requestContext.getStore()?.correlationId;
}

/** 요청 처리 도중 컨텍스트에 값을 덧붙인다(인증 후 userId 등) */
export function setContextValue(key, value) {
  const store = requestContext.getStore();
  if (store) store[key] = value;
}

/** 헤더에서 상관관계 ID를 뽑되 형식을 검증한다. 신뢰할 수 없는 입력이 로그 필드로 들어간다 */
export function correlationIdFromHeaders(headers = {}) {
  const raw = headers['x-correlation-id'] ?? headers['x-request-id'];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  // 로그 인젝션과 카디널리티 폭발을 막기 위해 길이와 문자 집합을 제한한다
  if (trimmed.length === 0 || trimmed.length > 128) return undefined;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * 요청·응답 객체를 통으로 찍지 않고 필요한 필드만 뽑는다.
 * redact 는 예상한 경로만 가리므로, 애초에 통째로 넣지 않는 것이 1차 방어선이다.
 */
export const serializers = {
  req: (req) => ({
    method: req.method,
    url: typeof req.url === 'string' ? req.url.split('?')[0] : undefined,
    remoteAddress: req.socket?.remoteAddress,
  }),
  res: (res) => ({ statusCode: res.statusCode }),
  err: pino.stdSerializers.err,
};

/** 민감 필드 마스킹 경로. 2차 방어선이며 유일한 방어선이 아니다 */
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'headers.authorization',
  'headers.cookie',
  'user.email',
  'user.phone',
  '*.password',
  '*.passwd',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.cardNumber',
  'body.paymentToken',
];

const isProduction = process.env.NODE_ENV === 'production';
const usePretty = process.env.LOG_PRETTY === 'true' && !isProduction;

/**
 * 로거를 만든다. 서비스마다 base 필드가 달라지므로 팩토리를 노출한다.
 * @param {{ serviceName?: string, level?: string, version?: string }} [options]
 */
export function createLogger(options = {}) {
  const {
    serviceName = process.env.SERVICE_NAME ?? 'ncg-service',
    level = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    version = process.env.SERVICE_VERSION ?? '0.0.0',
  } = options;

  return pino({
    level,
    // 모든 줄에 붙는 공통 필드. OpenTelemetry 리소스 속성 이름을 그대로 쓴다
    base: {
      'service.name': serviceName,
      'service.version': version,
      'deployment.environment': process.env.NODE_ENV ?? 'development',
      pid: process.pid,
      host: process.env.HOSTNAME ?? hostname(),
    },
    // 기본 level 은 숫자다. 수집기가 문자열을 기대하면 여기서 변환한다
    formatters: {
      level: (label, number) => ({ level: label, levelValue: number }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    serializers,
    // 로그를 찍을 때마다 호출되어 추가 필드를 반환한다
    mixin() {
      const ctx = requestContext.getStore();
      if (!ctx) return {};
      const extra = {};
      if (ctx.correlationId) extra.correlationId = ctx.correlationId;
      if (ctx.traceId) extra.trace_id = ctx.traceId;
      if (ctx.spanId) extra.span_id = ctx.spanId;
      if (ctx.userId) extra.userId = ctx.userId;
      if (ctx.route) extra.route = ctx.route;
      return extra;
    },
    // 개발에서만 사람이 읽는 형식으로. 프로덕션은 순수 JSON 을 stdout 으로 흘린다
    transport: usePretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  });
}

/** 기본 로거. 대부분의 모듈은 이것을 그대로 import 한다 */
export const logger = createLogger();

export default logger;
