// 16장 16.5절 / 26장 26.5절 대응 - RFC 7807 problem+json 으로 오류 응답을 통일한다.
import {
  AppError,
  NotFoundError,
  UpstreamError,
  TimeoutError,
  CircuitOpenError,
  toProblemJson,
  PROBLEM_CONTENT_TYPE,
} from '@ncg/shared/errors';

/**
 * 우리 것이 아닌 오류를 도메인 오류로 번역한다.
 *
 * 핵심 원칙: recipe-api 가 500 을 냈다고 web-api 가 500 을 내면 안 된다.
 * web-api 자체는 멀쩡하고, 사실은 "의존하는 서비스가 실패했다"이다.
 * 그 사실을 정확히 말하는 코드가 502(Bad Gateway)와 504(Gateway Timeout)다.
 * 이 구분이 있어야 온콜 담당자가 알림만 보고 어느 서비스를 볼지 안다.
 *
 * 그리고 업스트림의 응답 본문(스택 트레이스, SQL 오류, 내부 호스트명)은 절대
 * 그대로 흘려보내지 않는다. 외부 공개 서비스에서 그것은 정보 노출이다.
 * 실제 마스킹은 shared 의 toProblemJson 이 5xx 에 대해 수행한다.
 */
export function normalizeToAppError(err) {
  // 1) 이미 우리 도메인 오류다. statusCode 가 정해져 있으니 그대로 쓴다.
  //    (TimeoutError=504, UpstreamError=502, CircuitOpenError=503,
  //     NotFoundError=404, ValidationError=400)
  if (err instanceof AppError) return err;

  // 2) Fastify 스키마 검증 실패 → 400. 어떤 필드가 왜 틀렸는지는 알려 준다.
  if (err?.validation) {
    return new AppError('요청이 스키마를 만족하지 않는다', {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      retryable: false,
      details: {
        errors: err.validation.map((v) => ({
          path: v.instancePath || v.schemaPath || '/',
          message: v.message,
        })),
      },
      cause: err,
    });
  }

  const code = err?.code ?? err?.cause?.code;

  // 3) Node/undici 수준의 네트워크 오류도 업스트림 장애로 번역한다.
  //    ECONNREFUSED 를 500 으로 내보내면 "우리 코드가 터졌다"는 잘못된 신호가 된다.
  if (
    err?.name === 'AbortError' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return new TimeoutError('upstream', err?.timeoutMs ?? 0, { cause: err });
  }
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_SOCKET'
  ) {
    return new UpstreamError('upstream', { cause: err });
  }

  // 4) 다른 라이브러리가 붙인 statusCode 는 그대로 존중한다.
  //    4xx 는 호출자의 잘못이므로 메시지를 그대로 보여 줘도 안전하고,
  //    5xx 는 toProblemJson 이 알아서 일반화된 문구로 바꾼다.
  if (Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode <= 599) {
    return new AppError(err.message, {
      statusCode: err.statusCode,
      code:
        err.statusCode === 429
          ? 'RATE_LIMITED'
          : err.statusCode < 500
            ? 'BAD_REQUEST'
            : 'INTERNAL_ERROR',
      retryable: err.statusCode >= 500 || err.statusCode === 429,
      cause: err,
    });
  }

  // 5) 나머지는 전부 우리 잘못. 내부 사정은 toProblemJson 이 감춰 준다.
  return new AppError(err?.message ?? '알 수 없는 오류', {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    cause: err,
  });
}

/**
 * 오류 처리 플러그인.
 *
 * fastify-plugin 없이도 전역에 걸리도록 register() 대신 앱 인스턴스를 직접 받는다.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ exposeStack?: boolean }} [options] exposeStack 은 개발 환경에서만 켠다.
 */
export async function registerErrorHandler(app, options = {}) {
  const { exposeStack = false } = options;

  app.setNotFoundHandler((request, reply) => {
    const err = new NotFoundError(`${request.method} ${request.url}`);
    const { status, body } = toProblemJson(err, request.url, {
      correlationId: reply.getHeader('x-correlation-id'),
    });
    reply.code(status).type(PROBLEM_CONTENT_TYPE).send(body);
  });

  app.setErrorHandler((rawError, request, reply) => {
    const err = normalizeToAppError(rawError);
    const { status, body } = toProblemJson(err, request.url, {
      correlationId: reply.getHeader('x-correlation-id'),
    });

    // 5xx 는 우리가 조치해야 할 사건이므로 error, 4xx 는 호출자 문제이므로 warn.
    const level = status >= 500 ? 'error' : 'warn';
    request.log[level]({ err: rawError, status, route: request.routeOptions?.url }, '요청 처리 실패');

    // 서킷이 열려 있는 동안은 재시도 시점을 알려 주면 클라이언트가 얌전해진다.
    if (rawError instanceof CircuitOpenError && Number.isFinite(rawError.retryAfterMs)) {
      reply.header('retry-after', String(Math.max(1, Math.ceil(rawError.retryAfterMs / 1000))));
    }

    // 개발 환경에서만 스택을 덧붙인다. 프로덕션에서는 상관관계 ID로 로그를 찾는다.
    if (exposeStack && status >= 500) body.stack = rawError?.stack;

    // 이미 응답이 나가기 시작했다면(SSE 등) 헤더를 다시 쓸 수 없다. 소켓만 닫는다.
    if (reply.raw.headersSent) {
      request.log.warn('응답 전송이 시작된 뒤 오류가 발생해 연결을 종료한다');
      reply.raw.end();
      return;
    }

    reply.code(status).type(PROBLEM_CONTENT_TYPE).send(body);
  });

  return app;
}

export default registerErrorHandler;
