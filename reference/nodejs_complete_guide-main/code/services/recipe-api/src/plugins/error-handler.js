// 16장 16.5절 대응 - RFC 7807(problem+json) 오류 응답과 5xx 내부 정보 은폐.
import {
  ValidationError,
  NotFoundError,
  toProblemJson,
  normalizeError,
  PROBLEM_CONTENT_TYPE,
} from '@ncg/shared/errors';
import { getCorrelationId } from '@ncg/shared/logger';

async function errorHandler(app, opts = {}) {
  const exposeStack = opts.exposeStack ?? false;

  /**
   * 모든 오류는 여기 한 곳으로 모인다.
   * 라우트마다 try/catch 로 응답을 만들면 형식이 제각각이 되고, 언젠가는
   * 스택 트레이스나 SQL 원문이 그대로 밖으로 새어 나간다.
   */
  app.setErrorHandler((err, request, reply) => {
    const correlationId = request.correlationId ?? getCorrelationId() ?? undefined;

    // Fastify 의 JSON Schema 검증 실패는 err.validation 으로 온다.
    // 이건 클라이언트 잘못이므로 400 으로 내린다.
    const normalized = err.validation
      ? new ValidationError(
          '요청이 스키마를 만족하지 않는다.',
          // 필드 경로와 사유만 담는다. 사용자가 보낸 값 자체는 되돌려주지 않는다
          // (그대로 반사하면 로그 인젝션과 XSS 의 통로가 된다).
          err.validation.map((v) => ({
            path: `${err.validationContext ?? 'body'}${v.instancePath}`,
            rule: v.keyword,
            message: v.message,
          })),
        )
      : normalizeError(err);

    // toProblemJson 이 5xx 의 detail 을 일반화해 주지만, 상태 판정은 여기서도 필요하다.
    const { status, body } = toProblemJson(normalized, request.url, { correlationId });

    if (status < 500) {
      // 4xx 는 "정상적인 운영 중 사건"이다. error 로 남기면 알림이 울려
      // 정작 봐야 할 5xx 가 묻힌다. 그래서 warn.
      request.log.warn(
        { err: normalized.message, code: normalized.code, status, route: request.routeOptions?.url },
        '클라이언트 오류',
      );
    } else {
      /**
       * 5xx 는 서버 잘못이다. 스택까지 전부 "로그에" 남긴다.
       *
       * 반대로 응답 본문에는 내부 메시지를 넣지 않는다. err.message 에는 흔히
       * DB 호스트명, 질의문, 파일 경로가 들어 있고 공격자에게는 정찰 정보가 된다.
       * toProblemJson 이 5xx detail 을 고정 문구로 바꿔 주는 것이 그 장치다.
       *
       * 대신 correlationId 는 반드시 응답에 포함한다. 사용자가 그 ID 를 알려주면
       * 우리는 로그에서 실제 원인을 찾을 수 있다.
       * 즉, 정보를 숨기되 추적 가능성은 잃지 않는다.
       */
      request.log.error(
        { err, code: normalized.code, status, route: request.routeOptions?.url },
        '서버 오류',
      );
      // 개발 환경에서만 스택을 덧붙인다. 운영에서는 절대 켜지 않는다.
      if (exposeStack) body.stack = err.stack;
    }

    // correlationId 는 헤더로도 내려 준다(본문을 파싱하지 않는 프록시/클라이언트 대비).
    if (correlationId) reply.header('x-correlation-id', correlationId);
    return reply.code(status).type(PROBLEM_CONTENT_TYPE).send(body);
  });

  /** 404 도 같은 형식으로 내려야 클라이언트가 오류 처리를 한 갈래로 짤 수 있다. */
  app.setNotFoundHandler((request, reply) => {
    const correlationId = request.correlationId ?? getCorrelationId() ?? undefined;
    const { status, body } = toProblemJson(
      new NotFoundError(`라우트 ${request.method} ${request.url}`),
      request.url,
      { correlationId },
    );
    request.log.warn({ status }, '라우트 없음');
    if (correlationId) reply.header('x-correlation-id', correlationId);
    return reply.code(status).type(PROBLEM_CONTENT_TYPE).send(body);
  });
}

// 훅과 핸들러를 루트 인스턴스에 적용하기 위해 캡슐화를 해제한다.
// (fastify-plugin 이 내부적으로 붙이는 심볼과 같다.)
errorHandler[Symbol.for('skip-override')] = true;
errorHandler[Symbol.for('fastify.display-name')] = 'error-handler';

export default errorHandler;
