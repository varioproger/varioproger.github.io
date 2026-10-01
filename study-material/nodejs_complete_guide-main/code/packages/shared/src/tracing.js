// 31.4 분산 추적: OpenTelemetry NodeSDK 초기화
//
// 로그는 "이 요청에 무슨 일이 있었는가", 메트릭은 "전체가 어떤 상태인가"를 답한다.
// 추적은 "이 요청이 어느 서비스에서 얼마나 머물렀는가"를 답한다. 세 신호는 대체 관계가 아니다.
//
// 중요: 자동 계측이 http/pg/redis 모듈을 감싸려면 그 모듈들이 로드되기 전에 SDK 가 시작돼야 한다.
// 그래서 서비스는 `node --import ./tracing-bootstrap.js server.js` 처럼 진입점보다 먼저 이 함수를 부른다.

import { logger } from './logger.js';

let sdk = null;
let started = false;

/** 환경 변수로 켜고 끈다. 로컬 개발에서는 콜렉터가 없는 것이 보통이다 */
function tracingEnabled() {
  const raw = process.env.TRACING_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * OpenTelemetry SDK 를 시작한다. 비활성화 상태이거나 이미 시작했다면 아무 일도 하지 않는다.
 *
 * @param {string} serviceName 트레이스에 붙는 service.name. 로그·메트릭과 같은 값을 써야 상관 분석이 된다
 * @param {{ version?: string, endpoint?: string, sampleRatio?: number }} [options]
 * @returns {Promise<boolean>} 실제로 시작했는지 여부
 */
export async function startTracing(serviceName, options = {}) {
  if (started) return true;
  if (!tracingEnabled()) {
    logger.debug('TRACING_ENABLED 가 꺼져 있어 추적을 시작하지 않는다');
    return false;
  }

  const {
    version = process.env.SERVICE_VERSION ?? '0.0.0',
    endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://127.0.0.1:4318',
    sampleRatio = Number(process.env.OTEL_TRACE_SAMPLE_RATIO ?? 1),
  } = options;

  try {
    // 동적 import 를 쓰는 이유: 추적을 끈 채로 돌릴 때 @opentelemetry/* 를 로드조차 하지 않는다.
    // 부팅 시간과 메모리를 아끼고, 패키지가 설치되지 않은 환경에서도 서비스가 뜬다.
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }, resources, traceBase] =
      await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/auto-instrumentations-node'),
        import('@opentelemetry/exporter-trace-otlp-http'),
        import('@opentelemetry/resources'),
        import('@opentelemetry/sdk-trace-base'),
      ]);

    const { resourceFromAttributes } = resources;
    const { ParentBasedSampler, TraceIdRatioBasedSampler } = traceBase;

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': serviceName,
        'service.version': version,
        'deployment.environment': process.env.NODE_ENV ?? 'development',
        'host.name': process.env.HOSTNAME,
      }),
      traceExporter: new OTLPTraceExporter({
        // 콜렉터 주소만 환경 변수로 받고 경로는 코드가 붙인다
        url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
      }),
      // 부모 결정을 존중하되, 루트 스팬만 비율로 표본한다.
      // 부모를 무시하면 한 트레이스의 일부 스팬만 남아 조각난 트레이스가 생긴다.
      sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(sampleRatio) }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': {
            // 헬스 체크와 메트릭 스크레이프는 트레이스를 오염시킨다. 초당 수십 건이 전부 같은 모양이다
            ignoreIncomingRequestHook: (req) =>
              ['/healthz', '/livez', '/readyz', '/metrics'].includes(
                (req.url ?? '').split('?')[0],
              ),
          },
          // fs 계측은 스팬을 폭발시킨다. 파일 읽기 하나하나가 스팬이 된다
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    started = true;
    logger.info({ serviceName, endpoint, sampleRatio }, '분산 추적을 시작했다');
    return true;
  } catch (err) {
    // 관측성 실패가 서비스 실패가 되어서는 안 된다. 경고만 남기고 계속 뜬다
    logger.warn({ err }, '추적 초기화에 실패했다. 추적 없이 계속한다');
    sdk = null;
    started = false;
    return false;
  }
}

/**
 * SDK 를 정지하고 버퍼에 남은 스팬을 플러시한다.
 * 우아한 종료의 onClose 훅에서 부른다. 이걸 빠뜨리면 마지막 몇 초의 트레이스가 사라진다.
 */
export async function stopTracing() {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    logger.info('추적 SDK 를 정지하고 남은 스팬을 보냈다');
  } catch (err) {
    logger.warn({ err }, '추적 SDK 종료 중 오류');
  } finally {
    sdk = null;
    started = false;
  }
}

/** 현재 활성 스팬의 traceId/spanId. 로그 컨텍스트에 넣어 로그에서 트레이스로 점프한다 */
export async function getActiveSpanContext() {
  if (!started) return undefined;
  try {
    const { trace } = await import('@opentelemetry/api');
    return trace.getActiveSpan()?.spanContext();
  } catch {
    return undefined;
  }
}

/** 추적이 켜져 있는가 */
export function isTracingStarted() {
  return started;
}
