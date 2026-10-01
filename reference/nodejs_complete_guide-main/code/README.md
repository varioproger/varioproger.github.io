---
title: "Node.js Complete Guide — 예제 저장소"
---

# Node.js Complete Guide — 예제 저장소

『Node.js Complete Guide: 플랫폼의 원리부터 프로덕션 분산 시스템까지』 본문에 등장하는 코드를 실제로 돌려 볼 수 있게 조립한 저장소다.

책은 34개 장 내내 **두 개의 HTTP 서비스**를 점진적으로 발전시킨다. 이 저장소는 그 여정의 **최종 상태**를 담는다. 각 장에서 무엇이 더해졌는지는 아래 "장별 예제 위치"에서 찾는다.

- **recipe-api** — 레시피 데이터를 제공하는 프로듀서. 내부 네트워크에서만 접근한다.
- **web-api** — 브라우저가 호출하는 컨슈머. recipe-api를 호출해 결과를 가공하고 외부에 노출한다.

두 서비스가 공유하는 횡단 관심사(로깅, 메트릭, 추적, 오류 규약, HTTP 클라이언트, 우아한 종료, 설정)는 `packages/shared` 한 곳에 모여 있다. 서비스 코드가 짧은 이유는 여기에 있다.

---

## 요구 사항

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | 22 LTS (최소 20) | `.nvmrc`에 22를 박아 뒀다. `nvm use`로 맞춘다 |
| npm | 10 이상 | workspaces를 쓴다 |
| Docker / Docker Compose | 최신 | PostgreSQL, Redis, RabbitMQ, Prometheus, Grafana, Jaeger를 띄운다 |

모든 코드는 ESM(`"type": "module"`)이며 `node:` 프리픽스를 쓴다. CommonJS 예제는 2장에만 남아 있다.

---

## 빠른 시작

### 0. 의존성 설치와 환경 변수

```bash
nvm use                      # .nvmrc의 22를 읽는다
npm install                  # 워크스페이스 전체를 한 번에 설치한다
cp .env.example .env         # 값을 확인하고 필요한 것만 바꾼다
```

`.env`는 커밋하지 않는다. Node 20+는 `--env-file=.env` 플래그로 별도 라이브러리 없이 이 파일을 읽는다.

### 1. 인프라 기동

```bash
npm run infra:up             # docker compose up -d
docker compose -f infra/docker-compose.yml ps    # 전부 healthy가 될 때까지 기다린다
```

| 서비스 | 주소 | 용도 |
|---|---|---|
| PostgreSQL | `localhost:5432` | 19장 데이터 계층 |
| Redis | `localhost:6379` | 17장 세션, 29장 캐시, 24장 분산 락 |
| RabbitMQ | `localhost:5672` (UI `:15672`) | 23장 메시징 |
| Prometheus | http://localhost:9090 | 31.3 메트릭 |
| Grafana | http://localhost:3001 | 31.3 대시보드 |
| Jaeger | http://localhost:16686 | 31.4 분산 추적 |

내리려면 `npm run infra:down`. 볼륨까지 지우므로 데이터가 사라진다.

### 2. 서비스 실행

터미널 두 개를 연다. 순서가 중요하다 — web-api는 recipe-api에 의존한다.

```bash
# 터미널 1 — 프로듀서
npm run dev:recipe           # http://127.0.0.1:4000

# 터미널 2 — 컨슈머
npm run dev:web              # http://127.0.0.1:3000
```

`dev` 스크립트는 `node --watch`를 쓴다. 파일을 고치면 자동으로 재시작한다.

`examples/` 아래의 장별 스크립트는 서비스와 무관하게 단독으로 돈다. `node examples/ch03-event-loop/<파일>.js` 처럼 직접 실행한다.

### 3. 확인용 curl

```bash
# 프로듀서가 살아 있는가
curl -s http://127.0.0.1:4000/health/live

# 의존성(DB, Redis)까지 준비됐는가. 종료 중에는 503이 돌아온다
curl -s http://127.0.0.1:4000/health/ready | jq

# 레시피 목록과 단건 조회
curl -s http://127.0.0.1:4000/recipes | jq
curl -s http://127.0.0.1:4000/recipes/42 | jq

# 컨슈머를 통한 조회. 내부적으로 recipe-api를 호출한다
curl -s http://127.0.0.1:3000/recipes/42 | jq

# 상관관계 ID를 직접 넘겨 본다. 두 서비스의 로그에 같은 ID가 찍힌다
curl -s -H 'x-correlation-id: demo-0001' http://127.0.0.1:3000/recipes/42 | jq

# 없는 자원 — RFC 7807 problem+json이 돌아온다
curl -s -i http://127.0.0.1:3000/recipes/999999

# Prometheus 지표
curl -s http://127.0.0.1:4000/metrics | head -40
```

### 4. 테스트

```bash
npm test                     # node --test --experimental-test-coverage services/*/test/
npm run lint                 # 33장에서 채운다
```

### 5. 종료 동작 확인

```bash
kill -TERM <recipe-api PID>  # 진행 중 요청을 끝낸 뒤 정상 종료한다
```

`SHUTDOWN_TIMEOUT_MS` 안에 끝나지 않으면 강제 종료되고 종료 코드 1이 남는다. 9.3절과 32.10절의 내용이다.

---

## 디렉터리 구조

```
code/
├── package.json              # npm workspaces 루트. 모든 스크립트의 진입점
├── .nvmrc                    # 22
├── .env.example              # 두 서비스가 쓰는 모든 환경 변수와 기본값
├── .gitignore
│
├── packages/
│   └── shared/               # @ncg/shared — 두 서비스가 공유하는 횡단 관심사
│       ├── package.json      # exports 맵으로 서브패스 노출 (2.8절)
│       └── src/
│           ├── index.js      # 배럴. 보통은 서브패스를 직접 import 한다
│           ├── config.js     # 부팅 시 스키마 검증 (34.4)
│           ├── logger.js     # pino + AsyncLocalStorage 상관관계 ID (31.2)
│           ├── metrics.js    # prom-client + 이벤트 루프 지연 (31.3)
│           ├── tracing.js    # OpenTelemetry NodeSDK (31.4)
│           ├── errors.js     # AppError 계층 + RFC 7807 (16.5)
│           ├── http-client.js# 타임아웃·데드라인·재시도·서킷 브레이커 (15.6, 29.6)
│           └── shutdown.js   # 우아한 종료와 헬스 체크 (9.3, 32.10)
│
├── services/
│   ├── recipe-api/           # 프로듀서 (내부 전용)
│   │   ├── src/
│   │   │   ├── server.js     # 진입점
│   │   │   ├── config.js     # 이 서비스의 설정 스키마
│   │   │   ├── routes/       # health.js, recipes.js
│   │   │   ├── plugins/      # 관측성·오류 처리 플러그인
│   │   │   ├── db/           # 데이터 계층 (19장)
│   │   │   └── cache/        # 경계 있는 인메모리 캐시 (29.3)
│   │   └── test/
│   └── web-api/              # 컨슈머 (외부 노출)
│       ├── src/
│       │   ├── server.js
│       │   ├── config.js
│       │   ├── routes/       # recipes.js
│       │   ├── clients/      # @ncg/shared/http-client로 만든 recipe-api 클라이언트
│       │   └── plugins/
│       └── test/
│
├── examples/                 # 예제 서비스에 넣기 애매한 장별 독립 실행 스크립트
│   ├── ch03-event-loop/      # 이벤트 루프 여섯 단계, nextTick vs setImmediate
│   ├── ch06-async/           # TaskQueue, AbortController, 안티패턴 재현
│   ├── ch07-streams/         # 백프레셔와 파이프라인
│   ├── ch11-worker-threads/  # 워커 스레드와 CPU 바운드 작업
│   ├── ch24-rate-limit/      # 분산 레이트 리밋
│   └── ch29-resilience/      # 크래시·이벤트 루프 정지·비동기 실패 주입
│
└── infra/
    ├── docker-compose.yml    # 로컬 인프라 전체 (32.4)
    ├── prometheus/           # 스크레이프 설정 (31.3)
    ├── grafana/              # 데이터소스 프로비저닝
    ├── nginx/                # 리버스 프록시 (26장)
    ├── haproxy/              # 로드 밸런서 (26장)
    └── k8s/                  # Deployment, Service, ConfigMap (32.6~32.9)
```

---

## 장별 예제 위치

본문의 코드가 이 저장소 어디에 살아 있는지에 대한 색인이다. 개념 설명용 단편 예제는 본문에만 있고, 예제 서비스에 실제로 반영된 것만 적었다.

| 장·절 | 주제 | 위치 |
|---|---|---|
| 1.8 | 예제 서비스 소개 | `services/recipe-api/src/server.js`, `services/web-api/src/server.js` |
| 2.8 | `exports` 필드와 서브패스 | `packages/shared/package.json` |
| 3.x | 이벤트 루프 여섯 단계 | `examples/ch03-event-loop/` |
| 6.7~6.9 | 동시성 제한과 취소 | `examples/ch06-async/`, `packages/shared/src/http-client.js` (`Deadline#toSignal`) |
| 7.x | 스트림과 백프레셔 | `examples/ch07-streams/` |
| 11.x | 워커 스레드 | `examples/ch11-worker-threads/` |
| 9.3 | 시그널 처리와 우아한 종료 | `packages/shared/src/shutdown.js` |
| 15.6 | 재시도·타임아웃·데드라인의 조합 | `packages/shared/src/http-client.js` (`Deadline`, `isRetryable`, `fullJitterDelay`) |
| 16.5 | 오류 응답 규약 (RFC 7807) | `packages/shared/src/errors.js` |
| 17.x | 세션과 인증 | `services/web-api/src/plugins/` |
| 19.x | 데이터 계층 | `services/recipe-api/src/db/` |
| 23.x | 메시징 | `infra/docker-compose.yml` (RabbitMQ) |
| 24.x | 분산 레이트 리밋 | `examples/ch24-rate-limit/` |
| 26.x | 리버스 프록시와 로드 밸런싱 | `infra/nginx/`, `infra/haproxy/` |
| 29.3 | 경계 있는 인프로세스 캐시 | `services/recipe-api/src/cache/` |
| 29.6 | 재시도, 백오프, 서킷 브레이커 | `packages/shared/src/http-client.js` (`CircuitBreaker`) |
| 29.7 | 복원력 테스트(실패 주입) | `examples/ch29-resilience/` |
| 30.x | 테스팅 (`node:test`) | `services/*/test/` |
| 31.2 | 구조화된 로깅 | `packages/shared/src/logger.js` |
| 31.3 | 메트릭 | `packages/shared/src/metrics.js`, `infra/prometheus/` |
| 31.4 | 분산 추적 | `packages/shared/src/tracing.js` |
| 31.5 | 헬스 체크 설계 | `packages/shared/src/shutdown.js` (`healthHandlers`), `services/recipe-api/src/routes/health.js` |
| 32.4 | Docker Compose 오케스트레이션 | `infra/docker-compose.yml` |
| 32.6~32.9 | Kubernetes 배포 | `infra/k8s/` |
| 32.10 | 컨테이너 안의 시그널과 PID 1 | `packages/shared/src/shutdown.js` 상단 주석, 각 서비스의 `Dockerfile` |
| 34.4 | 설정 검증 | `packages/shared/src/config.js`, `services/*/src/config.js` |

---

## `@ncg/shared` 사용법

`exports` 맵으로 서브패스만 노출한다. 내부 파일 경로에 직접 의존할 수 없으므로, 나중에 파일을 옮겨도 사용처가 깨지지 않는다.

```js
import { logger, runWithRequestContext, getCorrelationId } from '@ncg/shared/logger';
import { registry, startEventLoopMonitor, startHttpTimer } from '@ncg/shared/metrics';
import { startTracing, stopTracing } from '@ncg/shared/tracing';
import { NotFoundError, toProblemJson } from '@ncg/shared/errors';
import { createClient, Deadline } from '@ncg/shared/http-client';
import { gracefulShutdown, healthHandlers, isReady } from '@ncg/shared/shutdown';
import { loadConfig, commonSchema } from '@ncg/shared/config';
```

전형적인 조합은 이렇다. 부팅 순서가 중요하다 — 추적 SDK는 http 모듈이 로드되기 전에 시작해야 자동 계측이 붙는다.

```js
const config = loadConfig({ ...commonSchema, PORT: { kind: 'port', default: 3000 } });
await startTracing('web-api');
startEventLoopMonitor();

const recipeApi = createClient({
  baseUrl: config.RECIPE_API_URL,
  name: 'recipe-api',
  timeoutMs: config.HTTP_TIMEOUT_MS,
  retries: config.HTTP_RETRIES,
  deadlineMs: config.HTTP_DEADLINE_MS,
  breaker: { failureThreshold: config.BREAKER_FAILURE_THRESHOLD },
});

const server = createServer(handler).listen(config.PORT);
gracefulShutdown({ server, onClose: async () => { await stopTracing(); await pool.end(); } });
```

---

## 실습 시나리오

책의 주장을 눈으로 확인하는 데 쓸 만한 조작들이다. 값은 `.env`에서 바꾼다.

| 하고 싶은 것 | 방법 |
|---|---|
| 타임아웃 동작 보기 | `RECIPE_API_LATENCY_MS=2000`, `HTTP_TIMEOUT_MS=500` |
| 재시도와 백오프 보기 | `RECIPE_API_FAIL_RATE=0.5`, `HTTP_RETRIES=3`, 로그에서 `retry` 이벤트를 센다 |
| 서킷 브레이커 열기 | recipe-api를 내린 뒤 web-api에 요청 → `503 CIRCUIT_OPEN` |
| 데드라인이 재시도를 자르는 것 보기 | `HTTP_DEADLINE_MS=300`, `HTTP_RETRIES=5` → 재시도가 예산 안에서 멈춘다 |
| 상관관계 ID 추적 | 두 서비스 로그를 `jq 'select(.correlationId=="demo-0001")'`로 거른다 |
| 우아한 종료 | 부하를 주는 중에 `kill -TERM` → 진행 중 요청이 200으로 끝나는지 본다 |

---

## 주의

- **`npm install` 없이는 서비스가 뜨지 않는다.** `packages/shared`는 pino, prom-client, `@opentelemetry/*`를 쓴다. 그 외에는 전부 Node 내장 모듈로 해결했다.
- **`/metrics`는 내부 네트워크에만 노출한다.** 지표는 시스템 구조를 그대로 드러낸다.
- **`.env`의 시크릿 값은 예시다.** 실제 환경에서는 시크릿 매니저나 마운트된 파일에서 주입한다(34.4).
- **재시도는 한 계층에서만 켠다.** 이 저장소에서는 web-api의 하류 클라이언트가 그 계층이다. 서비스 메시나 프록시에서 재시도를 또 켜면 부하가 곱해진다.
