// 22장 22.3절 / 23장 23.2절 대응 - 상관관계 ID 전파와 HTTP 지표 수집.
import { randomUUID } from 'node:crypto';
import {
  logger,
  runWithRequestContext,
  getCorrelationId,
  correlationIdFromHeaders,
} from '@ncg/shared/logger';
import { httpDuration, httpTotal, startEventLoopMonitor } from '@ncg/shared/metrics';

/**
 * 헤더에서 상관관계 ID를 뽑되, 없거나 형식이 이상하면 새로 만든다.
 *
 * 외부에서 온 값을 그대로 믿으면 로그 인젝션(개행 삽입)과 카디널리티 폭발의
 * 통로가 된다. 공유 모듈의 correlationIdFromHeaders 가 길이와 문자 집합을
 * 검증해 주고, 통과하지 못하면 undefined 를 돌려준다.
 */
function extractCorrelationId(headers) {
  return correlationIdFromHeaders(headers) ?? randomUUID();
}

/**
 * 지표 라벨로 쓸 라우트 이름을 고른다.
 *
 * ── 카디널리티 주의 ──────────────────────────────────────────────
 * 반드시 "라우트 패턴"(/recipes/:id)을 써야 한다. 실제 경로(/recipes/42)를
 * 라벨에 넣으면 레시피 ID 하나마다 시계열이 하나씩 생겨서, 100만 개의 ID는
 * 100만 개의 시계열이 된다. 프로메테우스의 메모리와 디스크는 시계열 개수에
 * 비례해 늘어나므로 이는 곧 모니터링 시스템의 장애로 이어진다.
 *
 * 같은 이유로 쿼리 문자열, User-Agent, 사용자 ID, 상관관계 ID는 절대
 * 라벨에 넣지 않는다. 그런 정보는 로그와 트레이스에 남긴다.
 * 라우트에 매칭되지 않은 요청(404)은 전부 '__unmatched__' 한 칸으로 접는다.
 * 그러지 않으면 스캐너 봇이 던지는 임의의 경로가 그대로 시계열이 된다.
 */
function routeLabel(request) {
  return request.routeOptions?.url ?? request.routerPath ?? '__unmatched__';
}

/**
 * 관측 가능성 플러그인.
 *
 * fastify-plugin 없이도 훅이 전역에 걸리도록, register() 대신 앱 인스턴스를
 * 직접 받아 훅을 다는 형태로 만들었다. (register 로 감싸면 캡슐화 때문에
 * 바깥에 등록된 라우트에는 훅이 걸리지 않는다.)
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ serviceName?: string, metrics?: object, monitorEventLoop?: boolean }} [options]
 */
export async function registerObservability(app, options = {}) {
  const {
    serviceName = 'web-api',
    // 의존성 주입: 테스트에서는 가짜 지표 객체를 넣어 부작용 없이 검증한다.
    metrics = { httpDuration, httpTotal },
    monitorEventLoop = true,
  } = options;

  if (monitorEventLoop) {
    // 이벤트 루프 지연은 "CPU 를 붙잡는 코드"를 찾는 가장 빠른 단서다.
    startEventLoopMonitor();
  }

  // onRequest 는 요청 파이프라인의 가장 앞이다. 여기서 AsyncLocalStorage 컨텍스트를
  // 열어 두면 이후의 훅/핸들러/업스트림 호출이 모두 같은 상관관계 ID를 본다.
  // done() 을 컨텍스트 안에서 동기적으로 호출하는 것이 핵심이다.
  app.addHook('onRequest', (request, reply, done) => {
    const correlationId = extractCorrelationId(request.headers);
    request.startTime = process.hrtime.bigint();

    const context = {
      correlationId,
      service: serviceName,
      method: request.method,
      path: request.url,
    };

    // 클라이언트가 자기 요청을 로그에서 찾을 수 있도록 응답에도 되돌려 준다.
    reply.header('x-correlation-id', correlationId);

    runWithRequestContext(context, () => {
      // 주의: 여기서 logger.child({ correlationId }) 를 부르면 안 된다.
      // 공유 로거의 mixin 이 이미 AsyncLocalStorage 에서 상관관계 ID를 읽어
      // 모든 로그 줄에 주입한다. child 로 한 번 더 묶으면 같은 키가 두 번 찍힌다.
      request.log = logger;
      done();
    });
  });

  // 다운스트림으로 나가는 호출에 붙일 헤더를 만들어 둔다.
  // (recipe-client 가 이 함수를 통해 상관관계 ID를 전파한다.)
  app.decorate('correlationHeaders', () => {
    const id = getCorrelationId();
    return id ? { 'x-correlation-id': id } : {};
  });

  app.addHook('onResponse', (request, reply, done) => {
    const route = routeLabel(request);
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };

    // hrtime.bigint 는 단조 증가 시계라 NTP 보정에 흔들리지 않는다.
    const startedAt = request.startTime;
    const seconds =
      startedAt === undefined
        ? reply.elapsedTime / 1000
        : Number(process.hrtime.bigint() - startedAt) / 1e9;

    try {
      metrics.httpDuration.observe(labels, seconds);
      metrics.httpTotal.inc(labels);
    } catch (err) {
      // 지표 수집 실패가 응답을 망가뜨려서는 안 된다. 삼키고 로그만 남긴다.
      request.log.warn({ err }, '지표 기록 실패');
    }

    request.log.info(
      { route, statusCode: reply.statusCode, durationMs: Math.round(seconds * 1000) },
      '요청 완료',
    );
    done();
  });

  return app;
}

export default registerObservability;
