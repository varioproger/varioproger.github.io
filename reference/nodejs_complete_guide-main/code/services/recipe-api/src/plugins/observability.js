// 31장 31.3절 대응 - 상관관계 ID 전파와 HTTP 메트릭 기록(라벨 카디널리티 관리).
import { randomUUID } from 'node:crypto';
import {
  runWithRequestContext,
  getCorrelationId,
  correlationIdFromHeaders,
} from '@ncg/shared/logger';
import { httpDuration, httpTotal } from '@ncg/shared/metrics';

const CORRELATION_HEADER = 'x-correlation-id';

async function observability(app, opts = {}) {
  const generateId = opts.generateId ?? randomUUID;

  /**
   * onRequest 는 라이프사이클의 가장 앞이다. 여기서 컨텍스트를 열어야
   * 이후의 파싱/검증/핸들러/에러 핸들러 로그까지 전부 같은 ID 를 달고 나온다.
   *
   * async 훅이 아니라 done 콜백 훅을 쓰는 이유:
   * AsyncLocalStorage 의 run() 안에서 done() 을 호출해야 이어지는 요청 처리 전체가
   * 그 컨텍스트를 상속한다. async 훅으로 만들면 run() 이 즉시 끝나 버려
   * 컨텍스트가 핸들러까지 살아 있지 않는다.
   */
  app.addHook('onRequest', (request, reply, done) => {
    // 게이트웨이/상위 서비스가 이미 ID 를 붙였다면 이어받는다. 그래야
    // 여러 서비스에 흩어진 로그를 하나의 요청으로 다시 꿰맬 수 있다.
    // correlationIdFromHeaders 가 길이와 문자 집합을 검증한다(헤더는 외부 입력이다).
    const correlationId = correlationIdFromHeaders(request.headers) ?? generateId();
    request.correlationId = correlationId;
    // 클라이언트가 자기 로그와 대조할 수 있도록 응답에도 되돌려 준다.
    reply.header(CORRELATION_HEADER, correlationId);

    runWithRequestContext(
      {
        correlationId,
        method: request.method,
        // 여기 담는 url 은 사람이 읽는 로그용이다. 메트릭 라벨로는 쓰지 않는다.
        url: request.url,
      },
      () => {
        // 주의: child({ correlationId }) 를 붙이지 않는다.
        // 공유 로거의 mixin 이 AsyncLocalStorage 에서 같은 값을 읽어 주입하므로
        // 여기서 또 묶으면 로그 한 줄에 correlationId 가 중복으로 나온다.
        done();
      },
    );
  });

  /**
   * onResponse 는 응답 전송이 끝난 뒤 호출되므로, 이 시점에는 어떤 라우트가
   * 매칭됐는지가 확정되어 있다. 매칭 결과를 써야 라벨이 정확해진다.
   */
  app.addHook('onResponse', (request, reply, done) => {
    /**
     * ★ 라벨은 반드시 라우트 "패턴"을 쓴다.
     *
     * request.url 은 /recipes/9f1c-... 처럼 요청마다 값이 달라진다. 이걸 라벨에
     * 넣으면 시계열이 요청 수만큼 생겨서(카디널리티 폭발) 프로메테우스의
     * 메모리와 저장소를 순식간에 잡아먹고, 결국 모니터링이 먼저 죽는다.
     * request.routeOptions.url 은 '/recipes/:id' 라는 고정된 패턴이므로
     * 시계열 수가 (라우트 수 x 메서드 수 x 상태코드 수) 로 묶인다.
     *
     * 매칭된 라우트가 없으면(404) 'unmatched' 하나로 접는다. 존재하지 않는
     * 경로를 훑고 다니는 스캐너 트래픽이 그대로 라벨이 되면 안 되기 때문이다.
     */
    const route = request.routeOptions?.url ?? 'unmatched';

    // 라벨 집합은 @ncg/shared/metrics 의 labelNames 와 정확히 같아야 한다.
    // 선언되지 않은 라벨을 넘기면 prom-client 가 던진다.
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };

    // Fastify 의 elapsedTime 은 ms 단위. 프로메테우스 히스토그램의 관례는 초 단위다.
    const seconds = (reply.elapsedTime ?? 0) / 1000;
    try {
      httpDuration.observe(labels, seconds);
      httpTotal.inc(labels);
    } catch (err) {
      // 관측 실패가 요청 처리를 망가뜨리면 안 된다.
      request.log.warn({ err: err?.message }, 'http 메트릭 기록 실패');
    }
    done();
  });

  // 요청 컨텍스트에서 ID 를 꺼내는 헬퍼(에러 핸들러 등에서 사용).
  app.decorate('correlationId', () => getCorrelationId());
}

/**
 * fastify-plugin 없이 캡슐화를 해제한다.
 * 이 심볼이 없으면 위의 훅들이 이 플러그인 스코프 안에서만 동작해서,
 * 형제로 등록된 라우트들에는 적용되지 않는다.
 */
observability[Symbol.for('skip-override')] = true;
observability[Symbol.for('fastify.display-name')] = 'observability';

export default observability;
