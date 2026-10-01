// 31.3 메트릭: prom-client 로 계측하고 /metrics 로 노출한다
//
// 로그가 "이 요청 하나에 무슨 일이 있었는가"를 답한다면, 메트릭은 "지금 전체가 어떤 상태인가"를 답한다.
// 메트릭은 집계된 숫자이므로 요청 수가 늘어도 비용이 늘지 않는다. 단, 라벨 조합 수만큼 시계열이 늘어난다.

import { monitorEventLoopDelay, PerformanceObserver, constants } from 'node:perf_hooks';
import client from 'prom-client';

const prefix = process.env.METRICS_PREFIX ?? '';

/** 서비스 하나가 쓰는 레지스트리. 기본 전역 레지스트리를 쓰지 않아 테스트에서 격리된다 */
export const registry = new client.Registry();

/** 기본 지표 수집(프로세스 CPU/메모리, 핸들 수, GC 등) */
client.collectDefaultMetrics({ register: registry, prefix });

/**
 * HTTP 요청 지연 히스토그램.
 *
 * 카디널리티 주의: 시계열 수 = method × route × status_code × 버킷 수.
 * route 에는 반드시 **경로 템플릿**을 넣는다. `/recipes/42`, `/recipes/43` 처럼 실제 경로를 넣으면
 * ID 하나마다 시계열이 생겨 수십만 개로 폭발하고 Prometheus 가 먼저 죽는다. `/recipes/:id` 로 정규화한다.
 * 같은 이유로 user_id, 요청 본문 값, 쿼리스트링은 절대 라벨에 넣지 않는다.
 * 매칭되지 않은 요청은 전부 `unknown` 하나로 접는다.
 */
export const httpDuration = new client.Histogram({
  name: `${prefix}http_request_duration_seconds`,
  help: 'HTTP 요청 처리 시간(초)',
  labelNames: ['method', 'route', 'status_code'],
  // 밀리초 단위 API 를 전제로 한 버킷. 상한을 넘는 요청은 +Inf 버킷에 들어간다
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

/** HTTP 요청 총 건수. 히스토그램의 _count 로도 얻을 수 있지만 질의 편의를 위해 따로 둔다 */
export const httpTotal = new client.Counter({
  name: `${prefix}http_requests_total`,
  help: 'HTTP 요청 총 건수',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

/**
 * 이벤트 루프 지연. 백분위수를 게이지로 노출한다.
 * CPU 사용률이 낮은데 지연이 커지는 상황을 잡아내는 지표이며, Node.js 서비스의 가장 중요한 헬스 신호다.
 */
export const eventLoopDelay = new client.Gauge({
  name: `${prefix}nodejs_event_loop_delay_seconds`,
  help: '이벤트 루프 지연(초). quantile 라벨로 백분위수를 구분한다',
  labelNames: ['quantile'],
  registers: [registry],
});

/** GC 일시 정지 시간. kind 라벨로 minor/major 를 구분한다 */
export const gcPause = new client.Histogram({
  name: `${prefix}nodejs_gc_pause_seconds`,
  help: 'GC 일시 정지 시간(초)',
  labelNames: ['kind'],
  buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [registry],
});

/** 하류 호출 서킷 브레이커 상태. 0=closed, 1=half-open, 2=open */
export const breakerState = new client.Gauge({
  name: `${prefix}circuit_breaker_state`,
  help: '서킷 브레이커 상태 (0=closed, 1=half-open, 2=open)',
  labelNames: ['target'],
  registers: [registry],
});

/** 하류 호출 재시도 건수 */
export const retriesTotal = new client.Counter({
  name: `${prefix}http_client_retries_total`,
  help: '하류 HTTP 호출 재시도 총 건수',
  labelNames: ['target', 'reason'],
  registers: [registry],
});

const GC_KIND = {
  [constants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
  [constants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb',
};

let loopHistogram = null;
let sampleTimer = null;
let gcObserver = null;

/**
 * 이벤트 루프 지연과 GC 관측을 시작한다. 서버 부팅 직후 한 번 호출한다.
 * @param {{ resolutionMs?: number, sampleIntervalMs?: number }} [options]
 * @returns {() => void} 관측을 멈추는 함수(테스트와 우아한 종료에서 쓴다)
 */
export function startEventLoopMonitor(options = {}) {
  const {
    resolutionMs = Number(process.env.EVENT_LOOP_MONITOR_RESOLUTION_MS ?? 10),
    sampleIntervalMs = 5000,
  } = options;

  if (loopHistogram) return stopEventLoopMonitor; // 중복 호출 방어

  loopHistogram = monitorEventLoopDelay({ resolution: resolutionMs });
  loopHistogram.enable();

  // 히스토그램 값은 나노초다. 초 단위로 변환해 노출한다
  sampleTimer = setInterval(() => {
    eventLoopDelay.set({ quantile: '0.5' }, loopHistogram.percentile(50) / 1e9);
    eventLoopDelay.set({ quantile: '0.9' }, loopHistogram.percentile(90) / 1e9);
    eventLoopDelay.set({ quantile: '0.99' }, loopHistogram.percentile(99) / 1e9);
    eventLoopDelay.set({ quantile: 'max' }, loopHistogram.max / 1e9);
    // 다음 구간을 새로 측정한다. 리셋하지 않으면 프로세스 수명 전체의 최댓값에 고착된다
    loopHistogram.reset();
  }, sampleIntervalMs);
  // 이 타이머 때문에 프로세스가 살아 있으면 안 된다
  sampleTimer.unref();

  gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const kind = GC_KIND[entry.detail?.kind] ?? 'other';
      gcPause.observe({ kind }, entry.duration / 1000); // ms → s
    }
  });
  gcObserver.observe({ entryTypes: ['gc'] });

  return stopEventLoopMonitor;
}

/** 관측을 멈춘다. 우아한 종료에서 호출하면 타이머가 남지 않는다 */
export function stopEventLoopMonitor() {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  if (loopHistogram) {
    loopHistogram.disable();
    loopHistogram = null;
  }
  if (gcObserver) {
    gcObserver.disconnect();
    gcObserver = null;
  }
}

/**
 * 요청 하나를 계측한다. 라우터가 경로 템플릿을 알아낸 뒤 호출한다.
 * @param {{ method: string, route: string, statusCode: number, durationSeconds: number }} sample
 */
export function observeHttpRequest({ method, route, statusCode, durationSeconds }) {
  const labels = {
    method: String(method ?? 'UNKNOWN').toUpperCase(),
    route: route || 'unknown',
    status_code: String(statusCode ?? 0),
  };
  httpDuration.observe(labels, durationSeconds);
  httpTotal.inc(labels);
}

/**
 * 요청 시작 시각을 잡아 두고, 끝날 때 호출하면 지연을 기록하는 타이머를 돌려준다.
 * 라우팅이 끝나야 route 를 알 수 있으므로 라벨은 종료 시점에 받는다.
 */
export function startHttpTimer() {
  const startedAt = process.hrtime.bigint();
  return ({ method, route, statusCode }) => {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    observeHttpRequest({ method, route, statusCode, durationSeconds });
    return durationSeconds;
  };
}

/**
 * `GET /metrics` 핸들러. node:http 의 (req, res) 시그니처를 그대로 받는다.
 * 이 엔드포인트는 내부 네트워크에만 노출한다. 지표는 시스템 구조를 그대로 드러낸다.
 */
export async function metricsHandler(req, res) {
  try {
    const body = await registry.metrics();
    res.writeHead(200, {
      'content-type': registry.contentType,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`메트릭 수집 실패: ${err.message}`);
  }
}

export { client };
