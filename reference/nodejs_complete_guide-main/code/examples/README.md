# examples — 장별 단독 실행 예제

『Node.js Complete Guide』 본문의 주장을 **직접 돌려서 확인**하는 예제 모음이다.

두 가지 원칙을 지켰다.

1. **설치가 필요 없다.** 외부 패키지를 전혀 쓰지 않는다. Node.js 내장 모듈만으로 동작한다
2. **실행하면 의미 있는 출력이 나온다.** 모든 예제가 결과를 표나 그래프로 출력하고,
   그 숫자를 어떻게 읽어야 하는지까지 함께 설명한다

`services/` 아래의 recipe-api·web-api 와 달리 이 디렉터리의 파일들은 서로 독립적이다.
아무 파일이나 골라 `node <파일>` 로 바로 실행할 수 있다.

## 요구 사항

- Node.js 20 이상 (개발 기준 22)
- `npm install` 불필요
- 인프라(Postgres·Redis 등) 불필요 — 전부 인메모리 또는 가상 시계로 동작한다

## 전체 목록

### ch03-event-loop — 이벤트 루프 (3장)

| 파일 | 내용 | 절 |
|---|---|---|
| `phases.js` | nextTick / 마이크로태스크 / setTimeout / setImmediate / I/O 콜백의 실행 순서 | 3.2~3.4 |
| `starvation.js` | 재귀 nextTick 이 I/O 를 굶기는 현상과 setImmediate 로 고치기 | 3.3, 3.6 |
| `measure-lag.js` | 이벤트 루프 지연 p99 측정과 동기 블로킹 주입 | 3.6 |

### ch06-async — 비동기 제어 흐름 (6장)

| 파일 | 내용 | 절 |
|---|---|---|
| `zalgo.js` | 캐시 유무로 동기/비동기가 갈리는 API 가 만드는 버그 | 6.3 |
| `return-await.js` | `return` vs `return await` 의 try/catch·finally·스택 트레이스 차이 | 6.4 |
| `task-queue.js` | 동시성 제한 TaskQueue 와 무제한 실행 비교 | 6.7 |

### ch07-streams — 스트림 (7장)

| 파일 | 내용 | 절 |
|---|---|---|
| `backpressure.js` | `write()` 반환값을 무시할 때와 존중할 때의 버퍼·RSS 차이 | 7.4 |
| `pipeline-errors.js` | `pipe()` 의 FD 누수와 `pipeline()` 의 자동 정리 | 7.7 |
| `transform-parallel.js` | 순서를 보장하는 병렬 Transform 구현 | 7.8 |

### ch11-worker-threads — 워커 스레드 (11장)

| 파일 | 내용 | 절 |
|---|---|---|
| `subset-sum.js` | 부분집합 합을 동기 / setImmediate / 워커 풀 세 가지로 풀고 비교 | 11.6 |
| `worker-pool.js` | 재사용 가능한 워커 풀 구현 (라이브러리 + 단독 데모) | 11.4, 11.6 |
| `worker-task.js` | 워커 측 스크립트 (직접 실행하지 않는다) | 11.4 |

### ch24-rate-limit — 레이트 리미팅 (24장)

| 파일 | 내용 | 절 |
|---|---|---|
| `algorithms.js` | 고정 윈도 / 슬라이딩 윈도 / 토큰 버킷의 경계 문제 시뮬레이션 | 24.6 |
| `token-bucket.lua` | 원자적 토큰 버킷 Redis Lua 스크립트 | 24.4, 24.6 |

### ch29-resilience — 복원력 (29장)

| 파일 | 내용 | 절 |
|---|---|---|
| `circuit-breaker.js` | 서킷 브레이커 구현과 상태 전이 시뮬레이션 | 29.6 |
| `retry-backoff.js` | 지터 유무에 따른 재시도 몰림 비교 | 29.6 |
| `chaos.js` | 확률적 실패 주입 래퍼와 이벤트 루프 정지 주입기 | 29.7 |

## 실행 방법

```bash
cd code/examples

node ch03-event-loop/phases.js
node ch06-async/task-queue.js
node ch07-streams/backpressure.js
node ch11-worker-threads/subset-sum.js
node ch24-rate-limit/algorithms.js
node ch29-resilience/circuit-breaker.js
```

전부 한 번에 돌려 보려면:

```bash
for f in ch*/*.js; do
  case "$f" in *worker-task.js) continue;; esac   # 워커 측 스크립트는 직접 실행하지 않는다
  echo "=== $f ==="; node "$f" || echo "실패: $f"
done
```

문법만 확인하려면:

```bash
find . -name '*.js' -exec node --check {} \;
```

## 실행 시간

대부분 1초 안에 끝난다. 오래 걸리는 것은 다음 셋뿐이다.

| 예제 | 대략 |
|---|---|
| `ch03-event-loop/measure-lag.js` | 약 3초 |
| `ch11-worker-threads/subset-sum.js` | 약 2초 |
| `ch11-worker-threads/worker-pool.js` | 약 2초 |

## 유용한 플래그

```bash
node --expose-gc ch07-streams/backpressure.js        # GC 잡음을 줄여 RSS 비교를 선명하게
node --stack-trace-limit=30 ch06-async/return-await.js  # 스택 프레임을 더 많이 남긴다
node --cpu-prof ch03-event-loop/measure-lag.js       # 어떤 동기 함수가 루프를 막는지 (34장)
CHAOS_CRASH=1 node ch29-resilience/chaos.js          # 크래시 주입까지 켠다
```

## 예제를 관통하는 하나의 주제

여섯 디렉터리가 결국 같은 이야기를 한다.

> **이벤트 루프를 막지 마라. 그리고 상한을 두어라.**

- 3장: 루프가 막히면 p99 가 튄다. 평균만 봐서는 알 수 없다
- 6장: 동시 실행에 상한이 없으면 상대 서비스를 무너뜨린다
- 7장: 백프레셔를 무시하면 메모리에 상한이 사라진다
- 11장: CPU 작업은 애초에 다른 스레드로 보낸다
- 24장: 들어오는 요청에도 상한이 필요하다
- 29장: 상한을 넘었을 때 어떻게 실패할지 미리 정한다

## 함께 볼 것

- `../infra/` — 인프라 스택, 프록시 설정, 쿠버네티스 매니페스트
- `../services/` — 34개 장에 걸쳐 발전하는 recipe-api·web-api
