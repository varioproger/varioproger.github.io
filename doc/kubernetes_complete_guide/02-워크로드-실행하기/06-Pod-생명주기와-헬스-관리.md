---
title: "6장. Pod 생명주기와 헬스 관리"
parent: "2부. 워크로드 실행하기"
grand_parent: "Kubernetes Complete Guide"
nav_order: 6
---

# 6장. Pod 생명주기와 헬스 관리

> **학습목표**
> - Pod의 phase와 conditions를 읽고 지금 어느 단계인지 판단할 수 있다.
> - liveness / readiness / startup 세 프로브의 역할을 구분하고 안전하게 설계할 수 있다.
> - 재시작 정책과 백오프 동작을 이해한다.
> - preStop 훅과 graceful shutdown으로 종료 시 요청 유실을 막을 수 있다.
> - `CrashLoopBackOff`, `OOMKilled` 등 흔한 실패 패턴을 순서대로 진단할 수 있다.

---

## 들어가며

5장에서 Pod를 만들었다. `kubectl get pod`를 치면 `Running`이 나오고 `1/1`이 뜬다. 그런데 이 두 값은 무엇이 다를까? `0/1 Running`은 무슨 상태일까?

이 장은 **Pod가 태어나서 죽을 때까지**를 다룬다. 실무에서 마주치는 장애의 상당수가 이 구간에서 발생한다. 배포했는데 트래픽이 안 들어온다, 롤아웃이 멈췄다, 배포 중에 502가 났다, 컨테이너가 계속 재시작한다 — 모두 이 장의 내용으로 설명된다.

## 6.1 Pod의 status 읽기

### phase — 큰 그림

`status.phase`는 다섯 값 중 하나다.

| phase | 의미 |
|---|---|
| `Pending` | API 서버에 등록됐지만 아직 모든 컨테이너가 실행되지 않음. 스케줄 대기, 이미지 다운로드, init 컨테이너 실행 중 |
| `Running` | 노드에 배치되고 모든 컨테이너가 생성됨. 적어도 하나가 실행 중이거나 시작/재시작 중 |
| `Succeeded` | 모든 컨테이너가 성공적으로(코드 0) 종료. 재시작하지 않음 |
| `Failed` | 모든 컨테이너가 종료되었고 최소 하나가 실패 |
| `Unknown` | 노드와 통신할 수 없어 상태를 알 수 없음 |

```bash
kubectl get pod hello -o jsonpath='{.status.phase}{"\n"}'
```

> **⚠️ phase는 거칠다**
> `Running`은 **"컨테이너가 실행 중"** 일 뿐, **"서비스할 준비가 됐다"** 는 뜻이 아니다. 앱이 아직 캐시를 채우는 중일 수도, DB 연결에 실패해 계속 재시도 중일 수도 있다. 준비 여부는 뒤에서 볼 **conditions**가 알려 준다.

`kubectl get pod`의 STATUS 열은 phase가 아니라 kubectl이 계산한 **더 친절한 요약**이다. `ContainerCreating`, `CrashLoopBackOff`, `Init:0/2`, `Terminating` 같은 값은 phase에 없다.

### conditions — 정확한 상태

4장에서 본 conditions 패턴이 Pod에도 적용된다.

```bash
kubectl get pod hello -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\t"}{.reason}{"\n"}{end}'
```

```
PodScheduled=True
Initialized=True
ContainersReady=True
Ready=True
```

시간 순서대로 이렇게 진행된다.

```
PodScheduled     노드가 정해졌다
      ↓
Initialized      모든 init 컨테이너가 성공적으로 완료됐다
      ↓
ContainersReady  모든 컨테이너의 readiness가 통과했다
      ↓
Ready            이 Pod로 트래픽을 보내도 된다  ★ 가장 중요
```

**`Ready`가 서비스 트래픽을 결정한다.** Service의 엔드포인트에는 `Ready=True`인 Pod만 등록된다(9장). 그래서 `kubectl get pod`의 READY 열이 `0/1`이면 Running이어도 트래픽을 받지 않는다.

`PodReadyToStartContainers`라는 조건도 있는데(v1.29+), 샌드박스(pause 컨테이너)와 네트워크가 준비됐음을 뜻한다.

### 컨테이너 상태 — 가장 상세한 정보

각 컨테이너는 세 상태 중 하나에 있다.

```bash
kubectl get pod hello -o jsonpath='{.status.containerStatuses[0]}' | jq
```

```json
{
  "name": "hello",
  "ready": true,
  "restartCount": 3,
  "started": true,
  "state": {
    "running": { "startedAt": "2026-09-01T10:20:00Z" }
  },
  "lastState": {
    "terminated": {
      "exitCode": 137,
      "reason": "OOMKilled",
      "startedAt": "2026-09-01T10:15:00Z",
      "finishedAt": "2026-09-01T10:19:58Z"
    }
  }
}
```

**`lastState`가 보물이다.** 이전에 죽은 컨테이너가 왜 죽었는지 알려 준다. 위 예에서는 `OOMKilled`, 즉 메모리 한도를 초과했다.

| state | 의미 |
|---|---|
| `waiting` | 아직 실행 전. `reason`에 `ContainerCreating`, `ImagePullBackOff`, `CrashLoopBackOff` 등 |
| `running` | 실행 중 |
| `terminated` | 종료됨. `exitCode`, `reason`, `signal` 포함 |

**자주 보는 종료 코드**

| exitCode | 의미 |
|---|---|
| `0` | 정상 종료 |
| `1` | 애플리케이션 오류 (일반적) |
| `137` | SIGKILL (128+9). **OOMKilled** 또는 graceful period 초과 |
| `139` | SIGSEGV (128+11). 세그멘테이션 폴트 |
| `143` | SIGTERM (128+15). 정상적인 종료 요청에 응답 |

`137`을 보면 두 가지를 의심한다. ① 메모리 초과(14장) ② 종료 유예 시간 안에 안 끝나서 강제 종료(6.4절).

### 진단 명령 정리

```bash
# 1순위: describe (이벤트 포함)
kubectl describe pod hello

# 재시작 횟수 한눈에
kubectl get pods --sort-by=.status.containerStatuses[0].restartCount

# 죽은 이유만 뽑기
kubectl get pod hello -o jsonpath='{.status.containerStatuses[*].lastState.terminated.reason}'

# 문제 있는 Pod만 필터
kubectl get pods -A --field-selector=status.phase!=Running
```

## 6.2 컨테이너를 건강하게 유지하기 — 프로브

### 세 프로브의 역할

쿠버네티스는 컨테이너 안에서 무슨 일이 벌어지는지 모른다. 프로세스가 살아 있어도 앱은 데드락에 빠져 있을 수 있다. 그래서 **앱에게 직접 물어보는** 장치가 프로브다.

```
                   실패하면 어떻게 되는가?
┌──────────────┬─────────────────────────────────────┐
│ startupProbe │ 컨테이너를 재시작한다                  │
│              │ (성공할 때까지 다른 프로브는 실행 안 됨)  │
├──────────────┼─────────────────────────────────────┤
│ livenessProbe│ 컨테이너를 재시작한다                  │
├──────────────┼─────────────────────────────────────┤
│readinessProbe│ 엔드포인트에서 제거한다 (재시작 안 함)   │
└──────────────┴─────────────────────────────────────┘
```

역할을 한 문장으로 구분하면:

- **startup**: "아직 시작 중인가?" — 느리게 뜨는 앱을 보호
- **liveness**: "살아 있는가? 죽었으면 재시작해야 하는가?"
- **readiness**: "지금 트래픽을 받을 수 있는가?"

### 프로브 방식 네 가지

```yaml
# ① HTTP GET — 가장 일반적
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080                # 또는 포트 이름: port: http
    httpHeaders:
      - name: X-Probe
        value: kubelet
    scheme: HTTP              # HTTPS도 가능 (인증서 검증 안 함)

# ② TCP 소켓 — 포트가 열려 있는지만
livenessProbe:
  tcpSocket:
    port: 5432

# ③ 명령 실행 — 종료 코드 0이면 성공
livenessProbe:
  exec:
    command: ["sh", "-c", "pg_isready -U postgres"]

# ④ gRPC (v1.27+ GA)
livenessProbe:
  grpc:
    port: 9000
    service: liveness         # gRPC Health Checking Protocol
```

HTTP 프로브는 **2xx 또는 3xx면 성공**이다.

### 공통 타이밍 파라미터

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10     # 컨테이너 시작 후 첫 프로브까지 대기
  periodSeconds: 10           # 프로브 간격 (기본 10)
  timeoutSeconds: 3           # 응답 대기 시간 (기본 1) ★ 기본값이 너무 짧다
  successThreshold: 1         # 성공으로 판정할 연속 성공 횟수 (liveness는 1 고정)
  failureThreshold: 3         # 실패로 판정할 연속 실패 횟수 (기본 3)
```

**실패까지 걸리는 시간**을 계산할 수 있다.

```
최대 감지 시간 = initialDelaySeconds + (periodSeconds × failureThreshold) + timeoutSeconds
              = 10 + (10 × 3) + 3 = 43초
```

이 계산을 습관화하면 "왜 이렇게 늦게 재시작되지?"라는 의문이 사라진다.

> **⚠️ `timeoutSeconds`의 기본값 1초는 거의 항상 너무 짧다**
> 부하가 높을 때 앱이 1초 안에 응답하지 못하면 프로브가 실패한다. 그러면 liveness가 컨테이너를 재시작하고, 재시작으로 인해 남은 Pod의 부하가 늘고, 그 Pod들도 느려져 재시작되는 **연쇄 붕괴**가 일어난다. 실무에서 가장 위험한 안티패턴 중 하나다.
>
> `timeoutSeconds`는 최소 3~5초로 두자.

### readinessProbe — 트래픽 제어

```yaml
readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 2
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

readiness가 실패하면 **재시작하지 않고 엔드포인트에서만 빠진다.** 회복되면 다시 들어온다. 이 성질이 중요한 이유:

- 앱이 일시적으로 바쁠 때(GC, 캐시 재구축) 트래픽을 잠시 끊었다가 회복시킬 수 있다.
- 롤링 업데이트에서 새 Pod가 준비되기 전에는 트래픽이 가지 않는다(8.2절).
- **의존성 확인에 쓸 수 있다.** DB 연결이 끊기면 readiness를 실패시켜 트래픽을 받지 않게 한다.

**readiness에는 의존성 확인을 넣어도 되지만, liveness에는 절대 넣으면 안 된다.** 이유는 다음 절에서.

### livenessProbe — 신중하게 설계하라

liveness의 목적은 단 하나, **"스스로 회복할 수 없는 상태에 빠진 프로세스를 재시작"** 하는 것이다. 데드락, 무한 루프, 힙 고갈 같은 상황이다.

> **⚠️ liveness의 3대 안티패턴**
>
> **① 의존성을 체크한다**
> ```yaml
> # ❌ 재앙
> livenessProbe:
>   exec:
>     command: ["sh", "-c", "curl -f http://database:5432 && curl -f http://redis:6379"]
> ```
> DB가 잠깐 느려지면 **모든 앱 Pod가 동시에 재시작한다.** 재시작해도 DB는 여전히 느리므로 무한 재시작에 빠진다. 장애가 전파되어 증폭되는 전형적인 패턴이다.
> → 의존성은 **readiness**에서 확인한다.
>
> **② readiness와 같은 엔드포인트를 쓴다**
> ```yaml
> # ❌ 위험
> livenessProbe:  { httpGet: { path: /health, port: 8080 } }
> readinessProbe: { httpGet: { path: /health, port: 8080 } }
> ```
> `/health`가 DB를 확인한다면 ①의 문제가 그대로 생긴다. 엔드포인트를 분리하자.
>
> **③ 프로브가 무겁다**
> 헬스 엔드포인트에서 전체 진단을 수행하면, 부하가 높을 때 프로브 자체가 응답을 못 해 재시작을 유발한다. liveness는 **극히 가벼워야** 한다.

**권장 설계**

| 엔드포인트 | 확인 내용 | 프로브 |
|---|---|---|
| `/healthz` | 프로세스가 요청을 처리할 수 있는가. **외부 의존성 확인 없음.** 보통 `200 OK`만 반환 | liveness |
| `/readyz` | DB 연결, 캐시 로딩, 마이그레이션 완료 등 **의존성 포함** | readiness |

```python
# 앱 코드 예 (Flask 스타일)
@app.route("/healthz")
def healthz():
    return "ok", 200          # 프로세스가 살아 있으면 항상 200

@app.route("/readyz")
def readyz():
    if not db.is_connected():
        return "db unavailable", 503
    if not cache.is_warm():
        return "warming up", 503
    return "ready", 200
```

**liveness를 아예 안 쓰는 것도 유효한 선택이다.** 앱이 크래시하면 프로세스가 죽고 kubelet이 어차피 재시작한다. liveness는 "프로세스는 살아 있는데 일을 못 하는" 좁은 경우에만 필요하다. 확신이 없다면 liveness 없이 시작하고, 실제로 데드락을 겪은 뒤에 추가하는 편이 안전하다.

### startupProbe — 느리게 뜨는 앱 보호

JVM 앱이나 대용량 캐시를 로드하는 앱은 시작에 2~3분이 걸리기도 한다. 이때 딜레마가 생긴다.

- liveness의 `initialDelaySeconds`를 180초로 늘리면 → **런타임에 데드락이 나도 3분간 방치된다.**
- 짧게 두면 → **시작 중에 계속 재시작된다.**

startupProbe가 이 딜레마를 푼다.

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 10
  failureThreshold: 30        # 10초 × 30 = 최대 300초 허용

livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 10
  failureThreshold: 3         # 시작 후에는 30초면 감지
```

동작 순서:

```
[컨테이너 시작]
  ↓
startupProbe 반복 시도 (최대 300초)
  · 이 동안 liveness/readiness는 실행되지 않는다
  · 300초 안에 성공하지 못하면 컨테이너 재시작
  ↓
[startup 성공]
  ↓
liveness + readiness 시작 (빠른 감지 주기로)
```

**시작은 관대하게, 운영 중에는 엄격하게** — 이것이 startupProbe의 존재 이유다.

### 실습: 프로브 오설정으로 롤아웃 멈추기

프로브 실수가 어떤 결과를 낳는지 직접 재현해 본다.

**① 정상 배포**

`probe-demo.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: probe-demo
spec:
  replicas: 3
  selector:
    matchLabels: { app: probe-demo }
  template:
    metadata:
      labels: { app: probe-demo }
    spec:
      containers:
        - name: app
          image: hello:1.0
          ports: [{ containerPort: 8080, name: http }]
          readinessProbe:
            httpGet: { path: /healthz, port: http }
            initialDelaySeconds: 2
            periodSeconds: 5
            timeoutSeconds: 3
```

```bash
kubectl apply -f probe-demo.yaml
kubectl rollout status deployment/probe-demo
# deployment "probe-demo" successfully rolled out
```

**② 잘못된 경로로 변경**

```bash
kubectl patch deployment probe-demo --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/path","value":"/wrong-path"}]'
```

**③ 관찰**

```bash
kubectl get pods -w
```

```
NAME                          READY   STATUS    RESTARTS   AGE
probe-demo-6f9c8d4b7-abcde    1/1     Running   0          2m    ← 기존 Pod (정상)
probe-demo-6f9c8d4b7-fghij    1/1     Running   0          2m
probe-demo-6f9c8d4b7-klmno    1/1     Running   0          2m
probe-demo-7d8e9f5c8-pqrst    0/1     Running   0          20s   ← 새 Pod (준비 안 됨)
```

**새 Pod는 `Running`이지만 `0/1`이다.** readiness가 실패하고 있기 때문이다.

```bash
kubectl rollout status deployment/probe-demo
# Waiting for deployment "probe-demo" rollout to finish: 1 out of 3 new replicas have been updated...
# (진행되지 않는다)
```

```bash
kubectl describe pod -l app=probe-demo | grep -A3 Warning
# Warning  Unhealthy  Readiness probe failed: HTTP probe failed with statuscode: 404
```

**여기서 중요한 점**: 롤아웃이 멈춰 있지만 **서비스는 정상이다.** 기존 Pod 3개가 그대로 트래픽을 받고 있다. 이것이 readiness 기반 롤링 업데이트의 안전장치다. 만약 readiness가 없었다면 준비되지 않은 새 Pod로 트래픽이 갔을 것이다.

**④ 롤백**

```bash
kubectl rollout undo deployment/probe-demo
kubectl rollout status deployment/probe-demo
```

**⑤ 정리**
```bash
kubectl delete -f probe-demo.yaml
```

## 6.3 재시작 정책과 백오프

### restartPolicy

Pod 수준에 설정하며, **모든 컨테이너에 적용**된다.

| 값 | 동작 | 쓰이는 곳 |
|---|---|---|
| `Always` (기본) | 종료 코드와 무관하게 항상 재시작 | Deployment, StatefulSet, DaemonSet |
| `OnFailure` | 0이 아닌 코드로 종료했을 때만 재시작 | Job, CronJob |
| `Never` | 재시작하지 않음 | 일회성 디버깅 |

**"재시작"은 Pod가 아니라 컨테이너를 다시 시작하는 것이다.** Pod는 같은 노드에 그대로 있고, IP도 유지되고, `emptyDir` 볼륨의 내용도 남는다. `restartCount`만 증가한다.

Pod 자체를 다른 노드로 옮기는 것은 컨트롤러의 일이다(8장).

### 백오프 — CrashLoopBackOff의 정체

컨테이너가 반복해서 죽으면 kubelet은 재시작 간격을 **지수적으로 늘린다.**

```
1차 실패 → 10초 대기 → 재시작
2차 실패 → 20초 대기 → 재시작
3차 실패 → 40초 대기 → 재시작
4차 실패 → 80초 대기
5차 실패 → 160초 대기
6차 실패 → 300초 대기 (상한)
...
```

이 대기 상태가 `CrashLoopBackOff`다. **이것은 원인이 아니라 증상이다.** "컨테이너가 반복해서 죽고 있으니 잠시 기다리는 중"이라는 뜻일 뿐, 왜 죽는지는 알려 주지 않는다.

**10분간 정상 실행되면 백오프 타이머가 초기화된다.**

### CrashLoopBackOff 진단 순서

```bash
# ① 죽기 직전의 로그 — 가장 중요
kubectl logs <pod> --previous

# ② 종료 코드와 이유
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated}' | jq

# ③ 이벤트
kubectl describe pod <pod> | tail -20
```

**종료 코드별 대응**

| 코드 | 원인 | 확인할 것 |
|---|---|---|
| `1` | 앱 오류 | `--previous` 로그의 스택 트레이스 |
| `137` + `OOMKilled` | 메모리 초과 | `limits.memory` 상향, 앱 메모리 프로파일링 (14장) |
| `137` (OOMKilled 아님) | SIGKILL. graceful period 초과 | preStop, 종료 처리 시간 (6.4절) |
| `139` | 세그폴트 | 네이티브 라이브러리, 아키텍처 불일치 (arm64 vs amd64) |
| `126` / `127` | 명령을 실행할 수 없음 / 찾을 수 없음 | `command`, `args`, 이미지의 PATH |
| `0`인데 재시작 | 정상 종료했지만 `restartPolicy: Always` | 계속 실행되는 프로세스인지 확인 |

**마지막 항목이 흔한 함정이다.**

```yaml
# ❌ 즉시 종료 → CrashLoopBackOff
containers:
  - name: app
    image: busybox
    command: ["echo", "hello"]

# ✅ 계속 실행
containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "echo hello && sleep infinity"]
```

**진단이 어려울 때: 디버그 복제본 만들기**

```bash
# 원본 Pod를 복사하되 command를 바꿔서 크래시를 막는다
kubectl debug <pod> --copy-to=debug-pod --container=app -- sleep 3600
kubectl exec -it debug-pod -- sh
# 이제 컨테이너 안에서 직접 앱을 실행해 에러를 관찰할 수 있다
```

## 6.4 종료 훅과 Graceful Shutdown

### 컨테이너 훅

두 가지 라이프사이클 훅이 있다.

```yaml
lifecycle:
  postStart:
    exec:
      command: ["sh", "-c", "echo started > /tmp/started"]
  preStop:
    exec:
      command: ["sh", "-c", "sleep 15"]
```

**`postStart`** 는 컨테이너 시작과 **동시에**(순서 보장 없음) 실행된다. 훅이 끝나야 컨테이너가 `Running`으로 간주된다. 순서가 보장되지 않으므로 초기화 목적으로는 **init 컨테이너가 더 낫다.**

**`preStop`** 이 훨씬 중요하다. 종료 직전에 실행되며, 이것이 끝나야 SIGTERM이 전송된다.

### Pod 종료의 전체 흐름

이 순서를 이해하는 것이 무중단 배포의 핵심이다.

```
kubectl delete pod (또는 롤링 업데이트로 교체)
        │
        ▼
① API 서버: deletionTimestamp 설정 → Pod가 "Terminating"
        │
        ├──────────────┬─────────────────┐
        ▼              ▼                 │
② kubelet:        ③ 엔드포인트 컨트롤러:   │  ★ 이 둘은 병렬이다!
   preStop 실행       Endpoints에서 제거   │     순서가 보장되지 않는다
        │              │                 │
        │              ▼                 │
        │         kube-proxy가 각 노드의   │
        │         iptables 규칙 갱신       │
        │         (수백 ms ~ 수 초 소요)    │
        ▼                                │
④ preStop 완료 → SIGTERM 전송              │
        │                                │
        ▼                                │
⑤ terminationGracePeriodSeconds 대기      │
   (기본 30초, preStop 시간 포함)          │
        │                                │
        ▼                                │
⑥ 아직 살아 있으면 SIGKILL                 │
```

> **⚠️ ②와 ③이 병렬이라는 것이 배포 중 502의 근본 원인이다**
>
> 앱이 SIGTERM을 받고 **즉시** 종료하면, kube-proxy가 아직 iptables 규칙을 지우지 못한 노드에서 그 Pod로 트래픽을 보낸다. 이미 죽은 Pod에 요청이 도착하니 연결 거부(502/503)가 발생한다.
>
> **해결책은 두 가지를 함께 쓰는 것이다.**
>
> **① preStop으로 시간을 번다**
> ```yaml
> lifecycle:
>   preStop:
>     exec:
>       command: ["sleep", "10"]     # 엔드포인트 전파를 기다린다
> ```
> 이 sleep 동안 앱은 정상 동작하며 요청을 계속 처리한다. 그 사이 모든 노드의 iptables가 갱신된다.
>
> **② 앱이 SIGTERM을 제대로 처리한다**
> - 새 연결 수락 중단
> - 진행 중인 요청 완료
> - 커넥션 풀·큐 정리 후 종료

### 앱에서 SIGTERM 처리하기

```python
import signal, sys, time
from http.server import HTTPServer

shutting_down = False
server = None

def handle_sigterm(signum, frame):
    global shutting_down
    shutting_down = True
    print("SIGTERM received, draining...", flush=True)
    # 진행 중인 요청이 끝날 시간을 준다
    server.shutdown()          # 새 연결 수락 중단
    print("shutdown complete", flush=True)
    sys.exit(0)

signal.signal(signal.SIGTERM, handle_sigterm)
```

readiness 프로브를 함께 활용하면 더 안전하다. SIGTERM을 받으면 `/readyz`가 503을 반환하도록 만들어, 엔드포인트에서 빠지는 것을 앱이 스스로 유도할 수 있다.

> **⚠️ 시그널이 앱에 도달하지 않는 함정**
>
> ```yaml
> # ❌ 셸이 PID 1이 되어 시그널을 전달하지 않는다
> command: ["sh", "-c", "python app.py"]
> ```
> 이 경우 SIGTERM은 `sh`가 받고, `sh`는 자식에게 전달하지 않는다. 결과적으로 30초 후 SIGKILL로 강제 종료된다(exitCode 137).
>
> ```yaml
> # ✅ exec으로 프로세스 교체 — 앱이 PID 1이 된다
> command: ["sh", "-c", "exec python app.py"]
>
> # ✅ 더 나은 방법: 셸을 거치지 않는다
> command: ["python", "app.py"]
> ```
>
> Dockerfile에서도 **exec 형식**을 쓴다.
> ```dockerfile
> CMD ["python", "app.py"]        # ✅ exec 형식
> CMD python app.py               # ❌ shell 형식 — sh가 PID 1
> ```

### terminationGracePeriodSeconds

```yaml
spec:
  terminationGracePeriodSeconds: 60      # 기본 30
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command: ["sleep", "10"]
```

**중요**: preStop 실행 시간이 grace period에 **포함된다.** 위 예에서 preStop이 10초를 쓰면 SIGTERM 이후 앱에 남는 시간은 50초다.

값을 정하는 기준:
- 웹 API: `30~60초` (진행 중 요청 완료 + preStop)
- 배치 처리: 한 작업 단위가 끝날 수 있는 시간
- 데이터베이스: 체크포인트·플러시에 충분한 시간 (수 분일 수도)

### 실습: 무중단 종료 확인

**① 종료 처리가 없는 앱**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: term-bad
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "trap '' TERM; while true; do sleep 1; done"]
      # trap '' TERM → SIGTERM을 무시한다
```

```bash
kubectl apply -f term-bad.yaml
kubectl wait --for=condition=Ready pod/term-bad

time kubectl delete pod term-bad
# real  0m30.5s      ← 30초를 꽉 채우고 SIGKILL
```

**② 종료를 처리하는 앱**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: term-good
spec:
  terminationGracePeriodSeconds: 30
  containers:
    - name: app
      image: busybox
      command:
        - sh
        - -c
        - |
          trap 'echo "draining..."; sleep 2; echo "bye"; exit 0' TERM
          echo "started"
          while true; do sleep 1 & wait $!; done
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "echo preStop; sleep 3"]
```

```bash
kubectl apply -f term-good.yaml
kubectl wait --for=condition=Ready pod/term-good

# 다른 터미널에서 로그 관찰
kubectl logs term-good -f &

time kubectl delete pod term-good
# real  0m5.8s       ← preStop 3초 + drain 2초
```

로그를 보면 순서가 확인된다.
```
started
preStop          ← ① preStop 훅
draining...      ← ② SIGTERM 수신
bye              ← ③ 정리 완료 후 자발적 종료
```

**③ 정리**
```bash
kubectl delete pod term-bad term-good --ignore-not-found
```

## 6.5 흔한 실패 패턴 진단표

실무에서 마주치는 상황을 증상별로 정리한다. 앞으로 이 표를 참조하게 될 것이다.

### `Pending` — 스케줄되지 않음

```bash
kubectl describe pod <pod> | grep -A10 Events
```

| Events의 메시지 | 원인 | 대응 |
|---|---|---|
| `Insufficient cpu` / `Insufficient memory` | 요청을 만족할 노드가 없음 | requests 조정, 노드 추가 (14, 16장) |
| `node(s) had untolerated taint` | 테인트에 막힘 | toleration 추가 (15장) |
| `node(s) didn't match node affinity` | 어피니티 조건 불만족 | 노드 라벨 확인 (15장) |
| `pod has unbound immediate PersistentVolumeClaims` | PVC가 바인딩되지 않음 | StorageClass, PV 확인 (12장) |
| `0/3 nodes are available` (조건 없음) | 모든 노드가 SchedulingDisabled | `kubectl uncordon` |

### `ImagePullBackOff` / `ErrImagePull`

```bash
kubectl describe pod <pod> | grep -A5 "Failed to pull"
```

체크리스트:
1. 이미지 이름·태그 오타
2. 프라이빗 레지스트리인데 `imagePullSecrets` 누락
3. 레지스트리 접근 불가 (네트워크, 방화벽)
4. 아키텍처 불일치 (arm64 노드에 amd64 이미지)
5. kind/minikube에서 로컬 이미지를 적재하지 않음 + `imagePullPolicy: Always`

```yaml
# 프라이빗 레지스트리 인증
spec:
  imagePullSecrets:
    - name: regcred
```
```bash
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=user --docker-password=pass
```

### `CrashLoopBackOff`

6.3절의 진단 순서를 따른다. 요약하면:

```bash
kubectl logs <pod> --previous              # ① 죽기 전 로그
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}'   # ② 종료 코드
kubectl describe pod <pod>                 # ③ 이벤트
```

### `0/1 Running` — 준비되지 않음

```bash
kubectl describe pod <pod> | grep -i "readiness probe"
```

원인은 대부분 셋 중 하나다.
1. 프로브 경로/포트가 틀림
2. 앱이 아직 초기화 중인데 `initialDelaySeconds`가 짧음 → startupProbe 도입
3. 의존 서비스가 죽어 readiness가 계속 실패 → 근본 원인은 다른 곳

### `Terminating`에서 멈춤

```bash
kubectl get pod <pod> -o jsonpath='{.metadata.finalizers}'
kubectl describe pod <pod>
```

원인:
1. 앱이 SIGTERM을 무시하고 grace period가 김
2. 파이널라이저가 남아 있음 (4.2절)
3. 노드가 응답하지 않음 → 이 경우 강제 삭제가 필요할 수 있다

```bash
kubectl delete pod <pod> --grace-period=0 --force   # 최후 수단
```

### `OOMKilled`

```bash
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'
# OOMKilled
```

즉시 `limits.memory`를 올리는 것이 답이 아닐 수 있다. 확인할 것:
1. 실제 사용량 추이 (`kubectl top pod`, Prometheus)
2. JVM이라면 힙 설정과 컨테이너 limit의 관계 (`-XX:MaxRAMPercentage`)
3. 메모리 누수 여부

14장에서 상세히 다룬다.

---

## 실습 과제

**과제 1 — 세 프로브 조합 설계**
2장의 `hello` 앱을 수정해 시작에 20초가 걸리도록 만들고(`time.sleep(20)`), `/healthz`와 `/readyz`를 분리한다. startupProbe로 시작을 보호하고, liveness와 readiness를 각각 적절히 설정한다. 각 프로브가 언제 실행되기 시작하는지 `kubectl describe`의 이벤트로 확인한다.

**과제 2 — liveness 안티패턴 재현**
`livenessProbe`가 존재하지 않는 Service(`http://nonexistent:8080`)를 확인하도록 설정하고, Pod가 무한 재시작에 빠지는 것을 관찰한다. `RESTARTS` 카운트와 재시작 간격이 지수적으로 늘어나는 것을 기록한다. 그다음 같은 확인을 readiness로 옮기면 어떻게 달라지는지 비교한다.

**과제 3 — 배포 중 요청 유실 측정**
Deployment(replicas=3)를 만들고 `hey`나 반복 curl로 부하를 준 상태에서 롤링 업데이트를 실행한다.
- preStop 없이: 실패 요청 수 기록
- `preStop: sleep 10` 추가 후: 실패 요청 수 기록

두 결과의 차이가 6.4절에서 설명한 엔드포인트 전파 지연이다.

**과제 4 — 시그널 전달 확인**
`command: ["sh", "-c", "python app.py"]`와 `command: ["python", "app.py"]` 두 버전의 Pod를 만들고, 삭제에 걸리는 시간과 종료 코드를 비교한다. 전자가 137로, 30초 걸려 죽는 것을 확인한다.

---

## 요약

- **`phase`는 거칠고, `conditions`가 정확하다.** 특히 `Ready`가 서비스 트래픽 수신 여부를 결정한다. `0/1 Running`은 "실행 중이지만 트래픽은 안 받는" 상태다.
- `lastState.terminated`에 **왜 죽었는지**가 담겨 있다. exitCode 137 + OOMKilled는 메모리 초과, 137 단독은 grace period 초과다.
- **liveness는 재시작, readiness는 트래픽 차단, startup은 시작 보호.** liveness에 외부 의존성을 넣으면 장애가 전파·증폭된다. `/healthz`(가벼움, liveness)와 `/readyz`(의존성 포함, readiness)를 분리하라.
- `timeoutSeconds`의 기본값 1초는 거의 항상 너무 짧다. 최소 3~5초로 둔다.
- `CrashLoopBackOff`는 원인이 아니라 증상이다. **`kubectl logs --previous`가 첫 번째 단서다.**
- 종료 시 **엔드포인트 제거와 SIGTERM 전송은 병렬**로 일어난다. 배포 중 502를 막으려면 `preStop: sleep 5~15`로 전파 시간을 벌고, 앱이 SIGTERM을 처리해 진행 중인 요청을 완료해야 한다.
- `sh -c "app"` 형태는 셸이 PID 1이 되어 시그널을 전달하지 않는다. `exec`을 쓰거나 셸을 거치지 않는다.

**다음 장에서는** 이미지와 설정을 분리하는 방법을 다룬다. ConfigMap과 Secret으로 설정을 주입하고, 설정이 바뀌었을 때 안전하게 롤아웃을 유도하는 패턴까지 살펴본다.

---

**참고 원서**: *Kubernetes in Action, 2nd Ed.* 6장 / *The Kubernetes Bible* 10장
