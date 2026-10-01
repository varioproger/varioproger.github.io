// 9.3 시그널 처리와 우아한 종료 + 32.10 컨테이너 안의 Node.js: 시그널, PID 1
//
// 오케스트레이터가 파드를 내릴 때 보내는 것은 SIGTERM 이다. 기본 동작은 즉시 종료이므로
// 처리 중이던 요청이 연결 초기화로 끝난다. 사용자에게는 그냥 500 이다.
// 우아한 종료의 순서는 정해져 있고, 순서를 바꾸면 의미가 없어진다.
//
// 컨테이너 주의: 프로세스가 PID 1 이면 커널의 기본 시그널 처리가 적용되지 않는다.
// 핸들러를 등록하지 않으면 SIGTERM 이 무시되어 10초 뒤 SIGKILL 로 죽는다.
// `npm start` 로 감싸면 npm 이 시그널을 전달하지 않으므로 `node server.js` 를 직접 ENTRYPOINT 로 둔다.

import { logger as defaultLogger } from './logger.js';

/** readiness 상태. 헬스 체크 핸들러가 이 값을 본다 */
let ready = false;
let shuttingDown = false;

export function setReady(value) {
  ready = Boolean(value);
}

export function isReady() {
  return ready && !shuttingDown;
}

export function isShuttingDown() {
  return shuttingDown;
}

/**
 * 종료 절차를 설치한다. 서버가 listen 을 시작한 직후 한 번 호출한다.
 *
 * 순서:
 *   1. readiness 를 false 로 바꾼다 → 로드 밸런서가 새 트래픽을 다른 인스턴스로 보낸다
 *   2. 라이브니스 프로브 유예(drainDelayMs) → 엔드포인트 목록에서 빠질 시간을 준다
 *   3. server.close() → 새 연결을 거부하되 진행 중 요청은 끝내게 둔다
 *   4. server.closeIdleConnections() → keep-alive 로 놀고 있는 소켓을 끊는다
 *   5. 진행 중 요청이 끝나기를 기다린다
 *   6. onClose 훅 → DB 풀, Redis, 메시지 컨슈머를 정리한다
 *   7. 타임아웃을 넘기면 강제 종료한다
 *
 * @param {object} options
 * @param {import('node:http').Server} [options.server]
 * @param {() => Promise<void>|void} [options.onClose] DB/Redis 등 자원 정리 훅
 * @param {number} [options.timeoutMs] 전체 유예 시간
 * @param {number} [options.drainDelayMs] readiness 를 내린 뒤 close 까지의 대기
 * @param {string[]} [options.signals]
 * @param {object} [options.logger]
 * @param {(code: number) => void} [options.exit] 테스트에서 주입한다
 * @returns {() => Promise<void>} 수동으로 종료를 시작하는 함수
 */
export function gracefulShutdown({
  server,
  onClose,
  timeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000),
  drainDelayMs = Number(process.env.SHUTDOWN_DRAIN_DELAY_MS ?? 0),
  signals = ['SIGTERM', 'SIGINT'],
  logger = defaultLogger,
  exit = (code) => process.exit(code),
} = {}) {
  setReady(true);

  // keep-alive 연결을 추적한다. 강제 종료 시점에 남은 소켓을 끊기 위한 안전망이다
  const sockets = new Set();
  if (server) {
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    // 종료가 시작된 뒤 도착한 요청에는 Connection: close 를 붙인다.
    // 클라이언트가 소켓을 재사용하지 않게 해서 연결이 자연히 정리되게 만든다.
    server.on('request', (req, res) => {
      if (shuttingDown) res.setHeader('connection', 'close');
    });
  }

  async function shutdown(signal) {
    // 중복 시그널 방어. 사용자가 Ctrl+C 를 두 번 누르면 두 번째는 즉시 종료로 해석한다
    if (shuttingDown) {
      logger.warn({ signal }, '종료 중에 시그널을 또 받았다. 즉시 종료한다');
      exit(1);
      return;
    }
    shuttingDown = true;
    ready = false; // 1. 새 트래픽을 받지 않겠다고 알린다
    logger.info({ signal, timeoutMs }, '우아한 종료를 시작한다');

    // 7. 유예 시간을 넘기면 강제 종료한다. 이 타이머는 프로세스를 붙잡지 않아야 한다
    let forced = false;
    const forceTimer = setTimeout(() => {
      forced = true;
      logger.error({ timeoutMs }, '유예 시간 안에 정리하지 못했다. 강제 종료한다');
      // 소켓을 끊으면 server.close 콜백이 뒤늦게 불릴 수 있다. forced 플래그로 그 경로를 막는다
      for (const socket of sockets) socket.destroy();
      exit(1);
    }, timeoutMs);
    forceTimer.unref();

    try {
      // 2. 로드 밸런서가 우리를 목록에서 뺄 시간을 준다
      if (drainDelayMs > 0) {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, drainDelayMs);
          t.unref();
        });
      }

      if (server) {
        // 3. 새 연결을 거부한다. 콜백은 살아 있는 연결이 전부 닫혀야 불린다
        const closed = new Promise((resolve) => server.close(resolve));

        // 4. keep-alive 로 놀고 있는 소켓을 끊는다.
        //    한 번만 부르면 안 된다. 지금 처리 중인 요청은 '활성'이라 살아남고,
        //    응답을 마친 직후 유휴 상태가 되는데 그때 아무도 끊어 주지 않으면
        //    close 콜백이 영원히 오지 않는다. 그래서 close 가 끝날 때까지 반복해서 쓸어낸다.
        server.closeIdleConnections?.();
        const idleSweeper = setInterval(() => server.closeIdleConnections?.(), 50);
        idleSweeper.unref();

        // 5. 진행 중 요청을 기다린다
        try {
          await closed;
        } finally {
          clearInterval(idleSweeper);
        }
        logger.info('진행 중이던 HTTP 요청을 모두 처리했다');
      }

      // 6. 자원 정리. 여기서 실패해도 종료는 계속한다
      if (onClose) {
        await onClose();
        logger.info('자원 정리를 마쳤다');
      }

      clearTimeout(forceTimer);
      if (forced) return; // 이미 강제 종료를 선언했다. 뒤늦은 성공으로 결과를 뒤집지 않는다
      logger.info('정상 종료');
      exit(0);
    } catch (err) {
      clearTimeout(forceTimer);
      if (forced) return;
      logger.error({ err }, '종료 절차 중 오류가 발생했다');
      exit(1);
    }
  }

  for (const signal of signals) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  // 잡히지 않은 예외·거부는 프로세스 상태를 신뢰할 수 없게 만든다.
  // 로그를 남기고 같은 절차로 내려간다. 계속 살려 두는 것이 더 위험하다(29.1).
  process.on('uncaughtException', (err, origin) => {
    logger.fatal({ err, origin }, '잡히지 않은 예외. 프로세스를 내린다');
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, '처리되지 않은 거부. 프로세스를 내린다');
    void shutdown('unhandledRejection');
  });

  return () => shutdown('manual');
}

/**
 * 헬스 체크 핸들러 한 쌍(31.5).
 * liveness 는 "프로세스가 살아 있는가", readiness 는 "트래픽을 받을 준비가 됐는가"다.
 * 종료 중에는 liveness 는 200, readiness 는 503 이어야 한다. 둘을 같은 값으로 두면
 * 종료 중인 파드를 오케스트레이터가 죽여 진행 중 요청이 끊긴다.
 */
export function healthHandlers({ checks = {} } = {}) {
  return {
    liveness(req, res) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    },
    async readiness(req, res) {
      if (!isReady()) {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'shutting_down' }));
        return;
      }
      const results = {};
      let healthy = true;
      // 의존성 검사는 짧은 타임아웃을 걸어야 한다. 헬스 체크가 느려지면 그 자체가 장애다
      for (const [name, check] of Object.entries(checks)) {
        try {
          results[name] = (await check()) ?? 'ok';
        } catch (err) {
          results[name] = `fail: ${err.code ?? err.name}`;
          healthy = false;
        }
      }
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded', checks: results }));
    },
  };
}
