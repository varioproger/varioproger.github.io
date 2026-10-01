// 34.4 애플리케이션 설정: 환경 변수, 설정 파일, 시크릿 — 부팅 시 스키마 검증
//
// 애플리케이션에서 process.env 를 읽는 유일한 지점이다.
// 잘못된 설정으로 인한 장애의 특징은 "그 값을 처음 쓰는 코드 경로"에서야 드러난다는 것이다.
// 그래서 시작 시점에 전부 검증하고, 실패하면 즉시 종료한다.
// 외부 의존성 없이 순수 JS 로 구현한다(공급망 표면을 줄이는 것도 34장의 주제다).

import { readFileSync } from 'node:fs';

/** 스키마가 지원하는 타입 */
const KINDS = new Set(['string', 'number', 'integer', 'boolean', 'enum', 'url', 'port']);

/** 검증 실패를 한 건씩 모아 두는 오류 */
export class ConfigError extends Error {
  constructor(issues) {
    super(`설정 오류 ${issues.length}건`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * 시크릿을 읽는다. `NAME_FILE` 이 있으면 파일에서, 없으면 `NAME` 환경 변수에서 가져온다.
 * 파일 마운트는 환경 변수보다 노출 표면이 좁고 회전할 때 파일만 갱신하면 된다.
 */
export function readSecret(name, env = process.env) {
  const filePath = env[`${name}_FILE`];
  if (filePath) {
    try {
      return readFileSync(filePath, 'utf8').trim();
    } catch (err) {
      throw new Error(`시크릿 파일을 읽을 수 없음: ${filePath} (${err.code ?? err.message})`);
    }
  }
  return env[name];
}

/** 불리언 해석. "1/true/yes/on" 만 참으로 본다 */
function toBoolean(raw) {
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
  return undefined; // 해석 실패
}

/** 값 하나를 규칙에 맞게 강제 변환한다. 실패하면 { error } 를 돌려준다 */
function coerce(key, raw, rule) {
  switch (rule.kind) {
    case 'string': {
      const v = String(raw);
      if (rule.minLength != null && v.length < rule.minLength) {
        return { error: `${rule.minLength}자 이상이어야 한다 (현재 ${v.length}자)` };
      }
      if (rule.pattern instanceof RegExp && !rule.pattern.test(v)) {
        return { error: `형식이 맞지 않는다 (기대: ${rule.pattern})` };
      }
      return { value: v };
    }
    case 'number':
    case 'integer': {
      const v = Number(raw);
      if (!Number.isFinite(v)) return { error: `숫자여야 한다 (받은 값의 타입: ${typeof raw})` };
      if (rule.kind === 'integer' && !Number.isInteger(v)) return { error: '정수여야 한다' };
      if (rule.min != null && v < rule.min) return { error: `${rule.min} 이상이어야 한다` };
      if (rule.max != null && v > rule.max) return { error: `${rule.max} 이하여야 한다` };
      return { value: v };
    }
    case 'port': {
      const v = Number(raw);
      if (!Number.isInteger(v) || v < 1 || v > 65535) {
        return { error: '1~65535 범위의 정수 포트여야 한다' };
      }
      return { value: v };
    }
    case 'boolean': {
      const v = toBoolean(raw);
      if (v === undefined) return { error: 'true/false 로 해석할 수 없다' };
      return { value: v };
    }
    case 'enum': {
      const v = String(raw);
      if (!rule.values.includes(v)) {
        return { error: `허용된 값이 아니다 (허용: ${rule.values.join(', ')})` };
      }
      return { value: v };
    }
    case 'url': {
      try {
        const u = new URL(String(raw));
        if (rule.protocols && !rule.protocols.includes(u.protocol.replace(':', ''))) {
          return { error: `허용된 프로토콜이 아니다 (허용: ${rule.protocols.join(', ')})` };
        }
        // 뒤 슬래시를 정규화해 두면 new URL(path, base) 조합이 일관된다
        return { value: u.href.replace(/\/$/, '') };
      } catch {
        return { error: '올바른 URL 이 아니다' };
      }
    }
    default:
      return { error: `알 수 없는 타입: ${rule.kind}` };
  }
}

/**
 * 스키마로 환경 변수를 검증해 동결된 설정 객체를 만든다.
 *
 * 스키마 예시:
 *   {
 *     NODE_ENV: { kind: 'enum', values: ['development','test','production'], default: 'development' },
 *     PORT:     { kind: 'port', default: 3000 },
 *     DATABASE_URL: { kind: 'url', required: true, secret: true },
 *     LOG_LEVEL: { kind: 'enum', values: ['debug','info','warn','error'], default: 'info' }
 *   }
 *
 * @param {Record<string, object>} schema
 * @param {{ env?: object, onError?: 'exit'|'throw' }} [options]
 *   onError='exit'(기본): 문제를 모두 출력하고 process.exit(1).
 *   onError='throw': ConfigError 를 던진다(테스트에서 쓴다).
 */
export function loadConfig(schema, { env = process.env, onError = 'exit' } = {}) {
  const issues = [];
  const result = {};

  for (const [key, ruleInput] of Object.entries(schema)) {
    const rule = typeof ruleInput === 'string' ? { kind: ruleInput } : { ...ruleInput };
    rule.kind ??= 'string';

    if (!KINDS.has(rule.kind)) {
      issues.push({ key, message: `스키마 정의가 잘못됨: 알 수 없는 kind '${rule.kind}'` });
      continue;
    }
    if (rule.kind === 'enum' && !Array.isArray(rule.values)) {
      issues.push({ key, message: "스키마 정의가 잘못됨: enum 에는 values 배열이 필요하다" });
      continue;
    }

    // 시크릿은 NAME_FILE 우회 경로를 먼저 본다
    let raw;
    try {
      raw = rule.secret ? readSecret(key, env) : env[key];
    } catch (err) {
      issues.push({ key, message: err.message });
      continue;
    }

    if (raw === undefined || raw === '') {
      if (rule.default !== undefined) {
        result[key] = rule.default;
        continue;
      }
      if (rule.required) {
        issues.push({ key, message: '필수 값이 비어 있다' });
        continue;
      }
      result[key] = undefined;
      continue;
    }

    const { value, error } = coerce(key, raw, rule);
    if (error) {
      // 값 자체는 절대 출력하지 않는다. 어떤 키가 왜 틀렸는지만 알린다.
      issues.push({ key, message: error });
      continue;
    }
    result[key] = value;
  }

  if (issues.length > 0) {
    if (onError === 'throw') throw new ConfigError(issues);
    for (const issue of issues) {
      process.stderr.write(`설정 오류: ${issue.key} — ${issue.message}\n`);
    }
    process.stderr.write('잘못된 설정으로는 시작하지 않는다. 위 항목을 고친 뒤 다시 실행한다.\n');
    process.exit(1);
  }

  return Object.freeze(result);
}

/** 서비스 두 개가 공통으로 쓰는 스키마 조각. 각 서비스가 자기 항목을 더해 쓴다 */
export const commonSchema = {
  NODE_ENV: { kind: 'enum', values: ['development', 'test', 'production'], default: 'development' },
  LOG_LEVEL: {
    kind: 'enum',
    values: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
    default: 'info',
  },
  LOG_PRETTY: { kind: 'boolean', default: false },
  SERVICE_VERSION: { kind: 'string', default: '0.0.0' },
  SHUTDOWN_TIMEOUT_MS: { kind: 'integer', min: 100, max: 120_000, default: 10_000 },
  METRICS_ENABLED: { kind: 'boolean', default: true },
  TRACING_ENABLED: { kind: 'boolean', default: false },
  OTEL_EXPORTER_OTLP_ENDPOINT: { kind: 'url', default: 'http://127.0.0.1:4318' },
  OTEL_TRACE_SAMPLE_RATIO: { kind: 'number', min: 0, max: 1, default: 1 },
};

/** 하류 HTTP 호출 정책 스키마 조각 */
export const httpClientSchema = {
  HTTP_TIMEOUT_MS: { kind: 'integer', min: 1, default: 1000 },
  HTTP_RETRIES: { kind: 'integer', min: 0, max: 10, default: 2 },
  HTTP_RETRY_BASE_MS: { kind: 'integer', min: 1, default: 100 },
  HTTP_RETRY_MAX_MS: { kind: 'integer', min: 1, default: 2000 },
  HTTP_DEADLINE_MS: { kind: 'integer', min: 1, default: 3000 },
  BREAKER_FAILURE_THRESHOLD: { kind: 'integer', min: 1, default: 5 },
  BREAKER_RESET_TIMEOUT_MS: { kind: 'integer', min: 100, default: 10_000 },
  BREAKER_HALF_OPEN_MAX: { kind: 'integer', min: 1, default: 1 },
  BREAKER_SUCCESS_THRESHOLD: { kind: 'integer', min: 1, default: 2 },
};
