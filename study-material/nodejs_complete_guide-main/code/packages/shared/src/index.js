// @ncg/shared 배럴 모듈 — 서브패스 import 가 기본이고 이것은 편의용이다
//
// 주의: 이 파일을 import 하면 pino 와 prom-client 가 함께 로드된다.
// 로거만 필요한 스크립트는 `@ncg/shared/logger` 처럼 서브패스를 쓴다(2.8절의 exports 필드).

export * from './errors.js';
export * from './config.js';
export * from './http-client.js';
export * from './shutdown.js';
export * from './tracing.js';
export { logger, createLogger, requestContext, runWithRequestContext, getRequestContext, getCorrelationId, setContextValue, correlationIdFromHeaders, serializers, redactPaths } from './logger.js';
export { registry, httpDuration, httpTotal, eventLoopDelay, gcPause, breakerState, retriesTotal, startEventLoopMonitor, stopEventLoopMonitor, observeHttpRequest, startHttpTimer, metricsHandler } from './metrics.js';
