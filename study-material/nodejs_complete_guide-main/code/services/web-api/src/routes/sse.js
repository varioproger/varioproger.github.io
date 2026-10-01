// 18장 18.2절 대응 - Server-Sent Events 와이어 포맷을 직접 쓰고 Last-Event-ID 로 이어받는다.
import { EventEmitter } from 'node:events';

/**
 * SSE 이벤트 버스 + 재생 버퍼.
 *
 * Last-Event-ID 로 이어받으려면 서버가 최근 이벤트를 얼마간 기억하고 있어야
 * 한다. 여기서는 링 버퍼로 최근 N개만 들고 있는다. 무한히 쌓으면 메모리
 * 누수이고, 진짜 내구성이 필요하다면 Redis Stream 이나 Kafka 로 옮길 자리다.
 * (그래서 버퍼 크기는 "재접속에 걸리는 시간 × 초당 이벤트 수"로 잡는다.)
 */
export class EventBus extends EventEmitter {
  #buffer = [];
  #max;
  #seq = 0;

  constructor({ bufferSize = 256 } = {}) {
    super();
    // 리스너가 연결 수만큼 붙는다. 기본 한도(10)에 걸려 경고가 나지 않게 푼다.
    this.setMaxListeners(0);
    this.#max = bufferSize;
  }

  /**
   * 이벤트를 발행한다.
   * @param {{ event?: string, data: unknown, id?: string }} message
   */
  publish({ event = 'message', data, id }) {
    const record = {
      id: id ?? String(++this.#seq),
      event,
      data,
      at: Date.now(),
    };
    this.#buffer.push(record);
    if (this.#buffer.length > this.#max) this.#buffer.shift();
    this.emit('event', record);
    return record;
  }

  /**
   * lastEventId 이후의 이벤트들을 돌려준다.
   * 버퍼에서 그 ID를 못 찾으면(너무 오래 끊겨 있었으면) 빈 배열을 준다.
   * 이때 클라이언트는 "구멍이 났다"는 사실을 알아야 하므로,
   * 라우트에서 gap 이벤트를 따로 보내 준다.
   */
  replayAfter(lastEventId) {
    if (!lastEventId) return { events: [], gap: false };
    const index = this.#buffer.findIndex((r) => r.id === lastEventId);
    if (index === -1) return { events: [], gap: true };
    return { events: this.#buffer.slice(index + 1), gap: false };
  }

  get bufferedCount() {
    return this.#buffer.length;
  }
}

/**
 * SSE 프레임 하나를 와이어 포맷으로 직렬화한다.
 *
 * 포맷 규칙(W3C EventSource):
 *   - "필드명: 값\n" 을 줄마다 쓰고, 빈 줄("\n")로 이벤트를 끝낸다.
 *   - data 는 여러 줄로 나눌 수 있다. 값에 개행이 있으면 반드시
 *     줄마다 "data: " 를 다시 붙여야 한다. 안 그러면 프레임이 깨지고
 *     공격자가 임의의 SSE 필드를 주입할 수 있다(개행 주입).
 *   - "id: " 를 보내면 브라우저가 그 값을 기억했다가 재접속 시
 *     Last-Event-ID 헤더로 되돌려 준다.
 *   - "retry: " 는 클라이언트의 재접속 대기 시간(ms)을 지정한다.
 *   - ":" 로 시작하는 줄은 주석이며 무시된다. 하트비트로 쓴다.
 */
export function formatSse({ id, event, data, retry }) {
  let frame = '';
  if (retry !== undefined) frame += `retry: ${retry}\n`;
  if (id !== undefined) frame += `id: ${id}\n`;
  if (event !== undefined && event !== 'message') frame += `event: ${event}\n`;
  if (data !== undefined) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const line of String(payload).split(/\r\n|\r|\n/)) {
      frame += `data: ${line}\n`;
    }
  }
  return `${frame}\n`;
}

/**
 * SSE 라우트.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ bus?: EventBus, heartbeatMs?: number, retryMs?: number, maxClients?: number }} options
 */
export async function sseRoutes(app, options = {}) {
  const {
    // 의존성 주입: 테스트에서는 직접 만든 버스를 넣어 이벤트를 밀어 넣는다.
    bus = new EventBus(),
    // 하트비트는 두 가지 일을 한다. (1) 중간 프록시가 유휴 연결을 끊는 것을
    // 막고, (2) 죽은 소켓을 write 실패로 빨리 발견하게 해 준다.
    heartbeatMs = 15_000,
    // 클라이언트가 끊긴 뒤 다시 붙기까지 기다릴 시간. 기본값(3초)보다 조금
    // 길게 줘서, 서버 재시작 때 모든 클라이언트가 동시에 몰리는 것을 완화한다.
    retryMs = 5_000,
    // 연결 하나가 소켓 하나를 붙잡는다. 상한이 없으면 파일 디스크립터가 마른다.
    maxClients = 1_000,
  } = options;

  /** 살아 있는 연결들. 종료 시 일괄 정리에 쓴다. */
  const clients = new Set();

  app.decorate('eventBus', bus);

  // 서버가 닫힐 때 열린 SSE 연결을 모두 정리한다. 이것이 없으면
  // graceful shutdown 이 영원히 끝나지 않는다(SSE 는 절대 스스로 안 끝난다).
  app.addHook('onClose', async () => {
    for (const close of clients) close();
    clients.clear();
  });

  app.get('/events', { logLevel: 'warn' }, (request, reply) => {
    if (clients.size >= maxClients) {
      return reply.code(503).send({ error: '동시 연결 수 상한에 도달했습니다.' });
    }

    // Fastify 의 응답 파이프라인에서 빼내 소켓을 직접 다룬다.
    reply.hijack();

    const res = reply.raw;
    const { socket } = res;

    // ── 헤더 ──────────────────────────────────────────────────────
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      // 프록시와 브라우저가 스트림을 캐시하지 못하게 한다.
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx 는 기본적으로 업스트림 응답을 버퍼링한다. 그러면 이벤트가
      // 버퍼가 찰 때까지 클라이언트에 도착하지 않아 SSE 가 무용지물이 된다.
      'x-accel-buffering': 'no',
      // 압축도 같은 이유로 끈다. gzip 은 블록 단위로 flush 되므로 지연이 생기고,
      // no-transform 과 함께 중간 장비의 재압축도 막는다.
      'content-encoding': 'identity',
      'x-correlation-id': reply.getHeader('x-correlation-id') ?? '',
    });
    // 헤더를 즉시 내보내 클라이언트의 onopen 이 바로 뜨게 한다.
    res.flushHeaders?.();

    // 작은 프레임을 지연 없이 보낸다(Nagle 알고리즘 비활성화).
    socket?.setNoDelay?.(true);
    // 유휴 타임아웃으로 소켓이 끊기지 않게 한다. 하트비트로 우리가 관리한다.
    socket?.setTimeout?.(0);
    res.setTimeout?.(0);

    /** 소켓에 프레임을 쓴다. 실패하면 정리한다. */
    let closed = false;
    function write(frame) {
      if (closed || res.writableEnded) return false;
      try {
        return res.write(frame);
      } catch (err) {
        request.log.warn({ err }, 'SSE 쓰기 실패 — 연결을 정리한다');
        cleanup();
        return false;
      }
    }

    // ── 리스너 ────────────────────────────────────────────────────
    function onEvent(record) {
      write(formatSse({ id: record.id, event: record.event, data: record.data }));
    }

    const heartbeat = setInterval(() => {
      // 주석 프레임. 클라이언트의 이벤트 핸들러를 건드리지 않는다.
      write(`: heartbeat ${Date.now()}\n\n`);
    }, heartbeatMs);
    // 이 타이머 하나 때문에 프로세스가 종료되지 못하는 일이 없게 한다.
    heartbeat.unref?.();

    /**
     * 정리 함수. 반드시 멱등해야 한다 —
     * 'close', 'error', 'aborted' 가 한 연결에서 여러 번 올 수 있다.
     * 여기서 리스너를 떼지 않으면 EventBus 의 리스너 배열이 계속 자라서
     * 전형적인 메모리 누수 + "이미 닫힌 소켓에 write" 오류가 된다.
     */
    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      bus.removeListener('event', onEvent);
      clients.delete(closeConnection);
      request.raw.removeListener('close', cleanup);
      request.raw.removeListener('aborted', cleanup);
      res.removeListener('close', cleanup);
      res.removeListener('error', cleanup);
      request.log.info({ remaining: clients.size }, 'SSE 연결 정리 완료');
    }

    function closeConnection() {
      cleanup();
      if (!res.writableEnded) res.end();
    }

    clients.add(closeConnection);
    bus.on('event', onEvent);
    request.raw.once('close', cleanup);
    request.raw.once('aborted', cleanup);
    res.once('close', cleanup);
    res.once('error', cleanup);

    // ── 첫 프레임: 재접속 간격을 먼저 알려 준다 ────────────────────
    write(formatSse({ retry: retryMs, event: 'open', data: { ok: true } }));

    // ── Last-Event-ID 로 이어받기 ─────────────────────────────────
    // 브라우저의 EventSource 는 헤더로 보내고, 헤더를 못 쓰는 클라이언트를
    // 위해 쿼리 문자열도 함께 받아 준다.
    const lastEventId = request.headers['last-event-id'] ?? request.query?.lastEventId;
    if (lastEventId) {
      const { events, gap } = bus.replayAfter(String(lastEventId));
      if (gap) {
        // 버퍼에서 밀려나 못 보내 주는 구간이 있다. 조용히 넘어가면 클라이언트는
        // 데이터가 완전하다고 착각한다. 명시적으로 알려서 전체 재동기화를 유도한다.
        request.log.warn({ lastEventId }, 'SSE 재생 버퍼에 없는 ID — 구간 손실을 통지한다');
        write(formatSse({ event: 'gap', data: { lastEventId, hint: '전체 상태를 다시 조회하세요.' } }));
      }
      for (const record of events) {
        write(formatSse({ id: record.id, event: record.event, data: record.data }));
      }
    }

    return reply;
  });

  return app;
}

export default sseRoutes;
