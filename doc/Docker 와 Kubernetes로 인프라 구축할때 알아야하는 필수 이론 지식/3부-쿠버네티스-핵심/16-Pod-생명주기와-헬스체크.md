---
title: "16장. Pod 생명주기와 헬스 체크"
parent: "3부. 쿠버네티스 핵심"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 16
---

# 16장. Pod 생명주기와 헬스 체크

> **🎮 게임 서버 개발자에게** — 서버 매니저가 채널 서버에 하트비트를 보내 응답이 없으면 프로세스를 죽였다 살리고, 점검 중인 채널은 "입장 불가"로 표시해 유저 배정을 멈추던 것이 각각 liveness와 readiness다. 점검 배포 때 "신규 접속 차단 → 기존 세션 마무리 → 종료"를 하던 것이 graceful shutdown이다. 결정적으로 다른 점은 쿠버네티스에서는 **트래픽 차단(엔드포인트 제거)과 종료 신호(SIGTERM)가 병렬로** 일어나며, 유예 시간이 지나면 **SIGKILL로 강제 종료**된다는 것이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 점검 배포 중 접속 중인 유저 요청이 끊기고 502가 난다.
> - DB가 잠깐 느려졌을 뿐인데 모든 API 서버 Pod가 동시에 재시작하며 장애가 커진다.
> - 시작 시 맵·테이블 데이터를 2분 동안 로딩하는 서버가 뜨기도 전에 계속 재시작된다.

## 코어 — 이것만은 100%

> **한 문장:** Pod 상태는 거친 phase가 아니라 conditions의 `Ready`와 컨테이너의 `lastState`로 읽고, 프로브로 재시작(liveness)·트래픽 차단(readiness)·시작 보호(startup)를 나눠 설계하며, 종료 시 엔드포인트 제거와 SIGTERM이 병렬이라는 점을 preStop과 SIGTERM 처리로 메워야 요청이 유실되지 않는다.

1. **상태 읽기: phase는 거칠고, `Ready`와 `lastState`가 정확하다** — `Ready=True`인 Pod만 Service 엔드포인트에 등록된다(`0/1 Running`은 트래픽 없음). 왜 죽었는지는 `lastState.terminated`(137+OOMKilled = 메모리 초과, 137 단독 = grace period 초과).
2. **프로브 3종: 재시작 vs 트래픽 차단 vs 시작 보호** — liveness 실패 → 재시작, readiness 실패 → 엔드포인트에서 제거, startup → 성공 전까지 다른 프로브 보류. liveness에 외부 의존성을 넣지 말고 `/healthz`와 `/readyz`를 분리한다.
3. **재시작은 컨테이너 단위, `CrashLoopBackOff`는 증상** — `restartPolicy`는 같은 노드에서 컨테이너만 다시 띄우고, 반복 크래시는 지수 백오프가 된다. 원인은 `logs --previous` → `lastState` → `describe`로 찾는다.
4. **종료: 엔드포인트 제거와 SIGTERM은 병렬** — 이것이 배포 중 502의 근본 원인이다. `preStop: sleep`으로 전파 시간을 벌고 앱이 SIGTERM을 처리한다(셸이 PID 1이 되지 않게).

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 매니저의 하트비트 → 무응답이면 프로세스 재시작 | `livenessProbe` | 응답이 없으면 죽었다 보고 다시 띄운다 | 하트비트에 DB 체크를 넣던 습관을 그대로 옮기면, DB가 느려질 때 **모든 Pod가 동시에 재시작**하는 장애 증폭이 된다. 의존성 확인은 readiness로 |
| 채널 상태를 "입장 불가"로 바꿔 유저 배정 중단 | `readinessProbe` | 프로세스는 살려 둔 채 새 트래픽만 끊는다 | 쿠버네티스가 프로브 결과로 **자동으로** 엔드포인트에서 빼고 넣는다. Running이어도 `Ready`가 아니면(`0/1`) 트래픽을 받지 않는다 |
| 셸 종료 코드 규약 128+시그널 번호(SIGSEGV → 139) | `exitCode` 137/139/143 | 같은 규약이다. 139는 세그폴트, 143은 SIGTERM에 응답한 종료 | 137(SIGKILL)은 OOM 강제 종료와 grace period 초과 둘 다 같은 숫자다. `reason`(`OOMKilled` 여부)으로 구분한다 |
| 클라이언트 재접속 지수 백오프 | `CrashLoopBackOff` | 실패할수록 대기 시간을 늘린다(10초 → … → 300초 상한) | 이것은 원인이 아니라 **증상**이다. 왜 죽는지는 알려 주지 않으며, 10분간 정상 실행되면 타이머가 초기화된다 |
| 점검 시 "신규 접속 차단 → 기존 세션 처리 → 종료" | Pod 종료 흐름(preStop, SIGTERM, grace period) | SIGTERM을 받으면 새 요청을 멈추고 진행 중인 것을 끝낸 뒤 종료한다 | 트래픽 차단(엔드포인트 제거와 각 노드 규칙 갱신)과 SIGTERM 전달이 **병렬**이라 순서가 보장되지 않는다. 유예 시간(기본 30초, preStop 포함)이 지나면 SIGKILL이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. STATUS가 `Running`인데도 트래픽을 받지 않는 Pod가 있다면, 무엇이 다른 걸까?
> 2. liveness 프로브에 DB 연결 확인을 넣으면 DB가 잠깐 느려질 때 무슨 일이 생길까?
> 3. `CrashLoopBackOff`는 원인일까, 증상일까?
> 4. 롤링 업데이트 중 502가 나는 이유는 무엇일까?
> 5. `command: ["sh", "-c", "python app.py"]`로 띄운 앱은 SIGTERM을 받을까?
>
> **처리법:** 🛠 실습 readinessProbe 경로를 틀리게 바꿔 롤아웃 멈춤 관찰 → `rollout undo`, `logs --previous`, `lastState.terminated` jsonpath, `trap`으로 SIGTERM 처리 Pod 삭제 시간 비교 · 🗺 관계도 phase ↔ conditions(PodScheduled→Initialized→ContainersReady→Ready) ↔ 엔드포인트, 프로브 3종 ↔ 실패 시 동작, Pod 종료 흐름(preStop ∥ 엔드포인트 제거 → SIGTERM → SIGKILL) · 📦 카드로 exitCode 0/1/137/139/143/126/127, 프로브 기본값(period 10, timeout 1, failure 3), 백오프 10초→300초, grace 30초

**이 장에서 배우는 것**

- Pod의 phase와 conditions, 컨테이너 상태를 읽고 지금 어느 단계인지 판단한다.
- liveness / readiness / startup 프로브의 역할을 구분하고 안전하게 설계한다.
- 재시작 정책과 `CrashLoopBackOff`의 정체를 이해한다.
- preStop 훅과 graceful shutdown으로 종료 시 요청 유실을 막는 원리를 안다.

배포했는데 트래픽이 안 들어온다, 롤아웃이 멈췄다, 배포 중에 502가 났다, 컨테이너가 계속 재시작한다. 실무 장애의 상당수가 이 장의 내용으로 설명된다.

---

## 코어 1. 상태 읽기: phase는 거칠고, `Ready`와 `lastState`가 정확하다

### 1.1 phase: 거친 큰 그림

**한 줄 요약:** phase는 다섯 값뿐이고, `Running`은 "서비스 준비 완료"가 아니다.

`status.phase`는 다섯 값 중 하나다.

| phase | 의미 |
|---|---|
| `Pending` | API 서버에 등록됐지만 아직 모든 컨테이너가 실행되지 않음. 스케줄 대기, 이미지 다운로드, init 컨테이너 실행 중 |
| `Running` | 노드에 배치되고 모든 컨테이너가 생성됨. 적어도 하나가 실행 중이거나 시작/재시작 중 |
| `Succeeded` | 모든 컨테이너가 성공적으로(코드 0) 종료. 재시작하지 않음 |
| `Failed` | 모든 컨테이너가 종료되었고 최소 하나가 실패 |
| `Unknown` | 노드와 통신할 수 없어 상태를 알 수 없음 |

> **phase는 거칠다.** `Running`은 "컨테이너가 실행 중"일 뿐 "서비스할 준비가 됐다"는 뜻이 아니다. 앱이 캐시를 채우는 중이거나 DB 연결에 실패해 재시도 중일 수 있다.

`kubectl get pod`의 STATUS 열은 phase가 아니라 kubectl이 계산한 더 친절한 요약이다. `ContainerCreating`, `CrashLoopBackOff`, `Init:0/2`, `Terminating` 같은 값은 phase에 없다.

### 1.2 conditions: 정확한 상태

**한 줄 요약:** `Ready`가 트래픽을 결정한다. READY `0/1`이면 Running이어도 트래픽을 받지 않는다.

```
PodScheduled     노드가 정해졌다
      ↓
Initialized      모든 init 컨테이너가 성공적으로 완료됐다
      ↓
ContainersReady  모든 컨테이너의 readiness가 통과했다
      ↓
Ready            이 Pod로 트래픽을 보내도 된다   ← 가장 중요
```

**`Ready`가 서비스 트래픽을 결정한다.** Service의 엔드포인트에는 `Ready=True`인 Pod만 등록된다. 그래서 `kubectl get pod`의 READY 열이 `0/1`이면 Running이어도 트래픽을 받지 않는다.

### 1.3 컨테이너 상태와 종료 코드

**한 줄 요약:** `lastState`가 보물이다. 137은 메모리 초과 또는 유예 시간 초과를 의심한다.

각 컨테이너는 세 상태 중 하나다.

| state | 의미 |
|---|---|
| `waiting` | 아직 실행 전. `reason`에 `ContainerCreating`, `ImagePullBackOff`, `CrashLoopBackOff` 등 |
| `running` | 실행 중 |
| `terminated` | 종료됨. `exitCode`, `reason`, `signal` 포함 |

**`lastState`가 보물이다.** 이전에 죽은 컨테이너가 왜 죽었는지(예: `OOMKilled`)를 알려 준다.

| exitCode | 의미 |
|---|---|
| `0` | 정상 종료 |
| `1` | 애플리케이션 오류(일반적) |
| `137` | SIGKILL(128+9). **OOMKilled** 또는 graceful period 초과 |
| `139` | SIGSEGV(128+11). 세그멘테이션 폴트 |
| `143` | SIGTERM(128+15). 정상적인 종료 요청에 응답 |

`137`을 보면 ① 메모리 초과 ② 종료 유예 시간 안에 안 끝나서 강제 종료, 두 가지를 의심한다.

```bash
kubectl describe pod hello          # 1순위: 이벤트 포함
kubectl get pod hello -o jsonpath='{.status.containerStatuses[*].lastState.terminated.reason}'
kubectl get pods -A --field-selector=status.phase!=Running
```

---

## 코어 2. 프로브 3종: 재시작 vs 트래픽 차단 vs 시작 보호

### 2.1 프로브: 앱에게 직접 물어보기

**한 줄 요약:** 프로세스가 살아 있어도 앱은 데드락일 수 있으므로 앱에게 직접 묻는다. 세 프로브는 실패 시 동작이 다르다.

쿠버네티스는 컨테이너 안에서 무슨 일이 벌어지는지 모른다. 프로세스가 살아 있어도 앱은 데드락에 빠져 있을 수 있다. 그래서 **앱에게 직접 물어보는** 장치가 프로브다.

| 프로브 | 질문 | 실패하면 |
|---|---|---|
| `startupProbe` | 아직 시작 중인가? | 컨테이너 재시작 (성공할 때까지 다른 프로브는 실행 안 됨) |
| `livenessProbe` | 살아 있는가? | 컨테이너 재시작 |
| `readinessProbe` | 지금 트래픽을 받을 수 있는가? | 엔드포인트에서 제거 (재시작 안 함) |

#### 프로브 방식 네 가지

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }   # ① HTTP GET: 2xx, 3xx면 성공
# tcpSocket: { port: 5432 }                 # ② TCP 소켓: 포트가 열려 있는지만
# exec: { command: ["sh","-c","pg_isready -U postgres"] }  # ③ 명령 실행: 종료 코드 0이면 성공
# grpc: { port: 9000 }                      # ④ gRPC
```

#### 공통 타이밍 파라미터

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  initialDelaySeconds: 10   # 컨테이너 시작 후 첫 프로브까지 대기
  periodSeconds: 10         # 프로브 간격 (기본 10)
  timeoutSeconds: 3         # 응답 대기 시간 (기본 1) — 기본값이 너무 짧다
  failureThreshold: 3       # 실패로 판정할 연속 실패 횟수 (기본 3)
```

최대 감지 시간 = `initialDelaySeconds + (periodSeconds x failureThreshold) + timeoutSeconds` = 10 + 30 + 3 = 43초. 이 계산을 습관화하면 "왜 이렇게 늦게 재시작되지?"라는 의문이 사라진다.

> **`timeoutSeconds` 기본값 1초는 거의 항상 너무 짧다.** 부하가 높을 때 응답이 1초를 넘으면 프로브가 실패 → liveness가 재시작 → 남은 Pod의 부하 증가 → 그 Pod들도 느려져 재시작되는 **연쇄 붕괴**가 일어난다. 최소 3&#126;5초로 두자.

### 2.2 readinessProbe: 트래픽 제어

**한 줄 요약:** 실패하면 재시작 없이 엔드포인트에서만 빠지고, 회복되면 다시 들어온다.

readiness가 실패하면 **재시작하지 않고 엔드포인트에서만 빠진다.** 회복되면 다시 들어온다.

- 앱이 일시적으로 바쁠 때(GC, 캐시 재구축) 트래픽을 잠시 끊었다 회복시킬 수 있다.
- 롤링 업데이트에서 새 Pod가 준비되기 전에는 트래픽이 가지 않는다.
- DB 연결 같은 **의존성 확인**에 쓸 수 있다.

### 2.3 livenessProbe: 신중하게

**한 줄 요약:** 스스로 회복할 수 없는 상태만 재시작하도록 가볍게, 외부 의존성 없이. 확신이 없으면 안 써도 된다.

liveness의 목적은 단 하나, **스스로 회복할 수 없는 상태(데드락, 무한 루프 등)에 빠진 프로세스를 재시작**하는 것이다. 3대 안티패턴이 있다.

1. **의존성을 체크한다.** DB가 잠깐 느려지면 모든 앱 Pod가 동시에 재시작하고, 재시작해도 DB는 여전히 느려 무한 재시작에 빠진다(장애 증폭). 의존성은 readiness에서 확인한다.
2. **readiness와 같은 엔드포인트를 쓴다.** `/health`가 DB를 확인한다면 1번 문제가 그대로 생긴다. 엔드포인트를 분리한다.
3. **프로브가 무겁다.** 부하가 높을 때 프로브 자체가 응답하지 못해 재시작을 유발한다. liveness는 극히 가벼워야 한다.

| 엔드포인트 | 확인 내용 | 프로브 |
|---|---|---|
| `/healthz` | 프로세스가 요청을 처리할 수 있는가. **외부 의존성 확인 없음** | liveness |
| `/readyz` | DB 연결, 캐시 로딩 등 **의존성 포함** | readiness |

**liveness를 아예 안 쓰는 것도 유효한 선택이다.** 앱이 크래시하면 프로세스가 죽고 kubelet이 어차피 재시작한다. 확신이 없다면 liveness 없이 시작하고, 실제로 데드락을 겪은 뒤에 추가하는 편이 안전하다.

### 2.4 startupProbe: 느리게 뜨는 앱 보호

**한 줄 요약:** 시작은 관대하게, 운영 중에는 엄격하게.

JVM 앱처럼 시작에 2&#126;3분 걸리는 앱에서는 딜레마가 생긴다. liveness의 `initialDelaySeconds`를 길게 잡으면 런타임 데드락이 그 시간 동안 방치되고, 짧게 잡으면 시작 중에 계속 재시작된다. startupProbe가 이를 푼다.

```yaml
startupProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
  failureThreshold: 30      # 10초 x 30 = 최대 300초 허용
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
  failureThreshold: 3       # 시작 후에는 30초면 감지
```

```
[컨테이너 시작] → startupProbe 반복(최대 300초, 이 동안 liveness/readiness 미실행)
              → [startup 성공] → liveness + readiness 시작
```

**시작은 관대하게, 운영 중에는 엄격하게.**

### 2.5 프로브 실수의 결과: 롤아웃이 멈춘다

**한 줄 요약:** readiness가 틀리면 새 Pod는 `0/1`로 남고 롤아웃이 멈추지만, 기존 Pod가 트래픽을 받아 서비스는 정상이다.

Deployment의 readinessProbe 경로를 `/wrong-path`로 바꾸면, 새 Pod는 `Running`이지만 `0/1`로 남고 `kubectl rollout status`는 진행되지 않는다. 그러나 **서비스는 정상이다.** 기존 Pod 3개가 그대로 트래픽을 받고 있기 때문이다. 이것이 readiness 기반 롤링 업데이트의 안전장치다. `kubectl rollout undo`로 되돌린다.

---

## 코어 3. 재시작은 컨테이너 단위, `CrashLoopBackOff`는 증상

### 3.1 restartPolicy

**한 줄 요약:** Pod 수준 설정이며, "재시작"은 같은 노드에서 컨테이너를 다시 시작하는 것이다.

Pod 수준에 설정하며 **모든 컨테이너에 적용**된다.

| 값 | 동작 | 쓰이는 곳 |
|---|---|---|
| `Always`(기본) | 종료 코드와 무관하게 항상 재시작 | Deployment, StatefulSet, DaemonSet |
| `OnFailure` | 0이 아닌 코드로 종료했을 때만 재시작 | Job, CronJob |
| `Never` | 재시작하지 않음 | 일회성 디버깅 |

**"재시작"은 Pod가 아니라 컨테이너를 다시 시작하는 것이다.** Pod는 같은 노드에 그대로 있고 IP와 `emptyDir` 내용도 유지되며 `restartCount`만 증가한다. Pod를 다른 노드로 옮기는 것은 컨트롤러의 일이다.

### 3.2 CrashLoopBackOff의 정체

**한 줄 요약:** 반복 크래시에 대한 지수 백오프 대기 상태일 뿐이고, 원인은 `logs --previous`와 종료 코드에 있다.

컨테이너가 반복해서 죽으면 kubelet은 재시작 간격을 지수적으로 늘린다.

```
1차 실패 → 10초 → 2차 20초 → 3차 40초 → 80초 → 160초 → 300초(상한)
```

이 대기 상태가 `CrashLoopBackOff`다. **원인이 아니라 증상**이다. 왜 죽는지는 알려 주지 않는다. 10분간 정상 실행되면 백오프 타이머가 초기화된다.

진단 순서:

```bash
kubectl logs <pod> --previous        # ① 죽기 직전의 로그 — 가장 중요
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'   # ② 종료 코드와 이유
kubectl describe pod <pod> | tail -20   # ③ 이벤트
```

| 코드 | 원인 | 확인할 것 |
|---|---|---|
| `1` | 앱 오류 | `--previous` 로그의 스택 트레이스 |
| `137` + `OOMKilled` | 메모리 초과 | `limits.memory`, 앱 메모리 사용 ([19장](19-리소스-요청-제한과-스케줄링-기초.md)) |
| `137` (OOMKilled 아님) | grace period 초과로 SIGKILL | preStop, 종료 처리 시간 |
| `139` | 세그폴트 | 네이티브 라이브러리, 아키텍처 불일치(arm64 vs amd64) |
| `126` / `127` | 명령을 실행할 수 없음 / 찾을 수 없음 | `command`, `args`, 이미지의 PATH |
| `0`인데 재시작 | 정상 종료했지만 `restartPolicy: Always` | 계속 실행되는 프로세스인지 확인 |

마지막이 흔한 함정이다. `command: ["echo", "hello"]`처럼 즉시 끝나는 프로세스는 `Always` 정책에서 `CrashLoopBackOff`가 된다.

진단이 어려우면 `kubectl debug <pod> --copy-to=debug-pod --container=app -- sleep 3600`으로 command를 바꾼 복제본을 만들고 `exec`으로 들어가 앱을 직접 실행해 본다.

### 3.3 흔한 실패 패턴 진단표

**한 줄 요약:** 증상(STATUS)별로 어디를 볼지와 주요 원인을 한 표로.

| 증상 | 확인 | 주요 원인 |
|---|---|---|
| `Pending` | `describe pod`의 Events | `Insufficient cpu/memory`(requests를 만족하는 노드 없음), `untolerated taint`, 어피니티 불일치, 바인딩되지 않은 PVC, 모든 노드 SchedulingDisabled(`kubectl uncordon`) |
| `ImagePullBackOff` / `ErrImagePull` | `describe`의 "Failed to pull" | 이미지 이름·태그 오타, 프라이빗 레지스트리인데 `imagePullSecrets` 누락, 레지스트리 접근 불가, 아키텍처 불일치, 로컬 이미지를 클러스터에 적재하지 않음 |
| `CrashLoopBackOff` | `logs --previous`, 종료 코드, `describe` | 3.2의 종료 코드 표 |
| `0/1 Running` | `describe`의 readiness probe | 프로브 경로/포트 오류, `initialDelaySeconds`가 짧음(→ startupProbe 도입), 의존 서비스 장애 |
| `Terminating`에서 멈춤 | `metadata.finalizers`, `describe` | 앱이 SIGTERM을 무시하고 grace period가 김, 파이널라이저 잔존, 노드 무응답(최후 수단: `--grace-period=0 --force`) |
| `OOMKilled` | `lastState.terminated.reason` | 즉시 limit을 올리기 전에 실제 사용량 추이, 메모리 누수 여부 확인 ([19장](19-리소스-요청-제한과-스케줄링-기초.md)) |

---

## 코어 4. 종료: 엔드포인트 제거와 SIGTERM은 병렬

### 4.1 컨테이너 훅

**한 줄 요약:** `postStart`는 시작과 동시(순서 보장 없음), `preStop`은 끝나야 SIGTERM이 간다.

```yaml
lifecycle:
  postStart:
    exec: { command: ["sh", "-c", "echo started > /tmp/started"] }
  preStop:
    exec: { command: ["sh", "-c", "sleep 15"] }
```

- `postStart`는 컨테이너 시작과 **동시에**(순서 보장 없음) 실행된다. 초기화 목적으로는 init 컨테이너가 더 낫다.
- `preStop`은 종료 직전에 실행되며, 이것이 끝나야 SIGTERM이 전송된다.

### 4.2 Pod 종료의 전체 흐름

**한 줄 요약:** preStop과 엔드포인트 제거가 병렬이라, 앱이 바로 죽으면 아직 규칙을 못 지운 노드에서 502가 난다. preStop sleep + SIGTERM 처리로 막는다.

```
kubectl delete pod (또는 롤링 업데이트로 교체)
① API 서버: deletionTimestamp 설정 → Pod "Terminating"
   ├─ ② kubelet: preStop 실행
   └─ ③ 엔드포인트 컨트롤러: Endpoints에서 제거 → kube-proxy가 각 노드 규칙 갱신 (수백 ms ~ 수 초)
          ★ ②와 ③은 병렬이다. 순서가 보장되지 않는다
④ preStop 완료 → SIGTERM 전송
⑤ terminationGracePeriodSeconds 대기 (기본 30초, preStop 시간 포함)
⑥ 아직 살아 있으면 SIGKILL
```

> **②와 ③이 병렬이라는 것이 배포 중 502의 근본 원인이다.** 앱이 SIGTERM을 받고 즉시 종료하면, 아직 규칙을 지우지 못한 노드에서 이미 죽은 Pod로 트래픽이 가 연결 거부(502/503)가 발생한다.

해결책은 두 가지를 함께 쓰는 것이다.

1. **preStop으로 시간을 번다.** `preStop: sleep 10` 같은 설정. 이 동안 앱은 정상 동작하며 요청을 계속 처리하고, 그 사이 모든 노드의 규칙이 갱신된다.
2. **앱이 SIGTERM을 제대로 처리한다.** 새 연결 수락을 중단하고, 진행 중인 요청을 완료하고, 커넥션 풀·큐를 정리한 뒤 종료한다.

SIGTERM을 받으면 `/readyz`가 503을 반환하게 해서 엔드포인트에서 빠지도록 앱이 스스로 유도하면 더 안전하다.

### 4.3 시그널이 앱에 도달하지 않는 함정

**한 줄 요약:** `sh -c "app"`은 셸이 PID 1이 되어 SIGTERM을 막는다. `exec`을 쓰거나 셸 없이 실행한다.

```yaml
# 셸이 PID 1이 되어 시그널을 전달하지 않는다
command: ["sh", "-c", "python app.py"]
# exec으로 프로세스 교체 — 앱이 PID 1이 된다
command: ["sh", "-c", "exec python app.py"]
# 더 나은 방법: 셸을 거치지 않는다
command: ["python", "app.py"]
```

첫 형태에서는 SIGTERM을 `sh`가 받고 자식에게 전달하지 않아 30초 후 SIGKILL(exitCode 137)로 끝난다. Dockerfile에서도 `CMD ["python", "app.py"]`(exec 형식)를 쓰고 `CMD python app.py`(shell 형식)는 피한다. (PID 1과 시그널은 [3장](../1부-리눅스-기초/03-프로세스와-시그널.md) 참고.)

### 4.4 terminationGracePeriodSeconds

**한 줄 요약:** 기본 30초이며 preStop 시간이 포함된다. 워크로드 성격에 맞춰 정한다.

기본 30초이며 **preStop 실행 시간이 포함**된다. 예를 들어 값이 60초이고 preStop이 10초를 쓰면 SIGTERM 이후 앱에 남는 시간은 50초다. 값 기준: 웹 API는 30&#126;60초, 배치는 한 작업 단위가 끝날 시간, 데이터베이스는 체크포인트·플러시에 충분한 시간이다.

실습으로 확인할 수 있다. `trap '' TERM`으로 SIGTERM을 무시하는 Pod는 삭제에 30초를 꽉 채우고 SIGKILL로 끝나지만, `trap`으로 정리 후 `exit 0`하는 Pod는 preStop 3초 + 정리 2초 정도로 빨리 끝난다.

---

## 실무 적용

### 체크리스트

- [ ] **`phase`는 거칠고 `conditions`가 정확하다.** `Ready`가 트래픽 수신 여부를 결정하며, `0/1 Running`은 "실행 중이지만 트래픽은 안 받는" 상태다.
- [ ] `lastState.terminated`에 **왜 죽었는지**가 담겨 있다. 137 + OOMKilled는 메모리 초과, 137 단독은 grace period 초과다.
- [ ] **liveness는 재시작, readiness는 트래픽 차단, startup은 시작 보호.** liveness에 외부 의존성을 넣으면 장애가 증폭된다. `/healthz`와 `/readyz`를 분리한다. 확신이 없으면 liveness 없이 시작한다.
- [ ] `timeoutSeconds` 기본 1초는 대개 너무 짧다. 3&#126;5초 이상으로 둔다. 최대 감지 시간 = `initialDelaySeconds + (periodSeconds x failureThreshold) + timeoutSeconds`.
- [ ] 느리게 뜨는 앱은 startupProbe로 보호한다(시작은 관대하게, 운영 중에는 엄격하게).
- [ ] `CrashLoopBackOff`는 원인이 아니라 증상이다. **`kubectl logs --previous`가 첫 단서**다. 즉시 끝나는 프로세스는 `Always` 정책에서 코드 0이어도 CrashLoopBackOff가 된다.
- [ ] 종료 시 **엔드포인트 제거와 SIGTERM은 병렬**이다. `preStop: sleep`으로 전파 시간을 벌고, 앱이 SIGTERM을 처리해 진행 중 요청을 끝내야 한다.
- [ ] `terminationGracePeriodSeconds`(기본 30초)에는 preStop 시간이 포함된다.
- [ ] `sh -c "app"` 형태는 셸이 PID 1이 되어 시그널을 막는다. `exec` 또는 셸 없이 실행한다.

### 시나리오로 확인하기

1. **상황:** 롤링 업데이트로 API 서버를 교체할 때마다 몇 초간 502가 튄다. 앱은 C++ 서버 시절 습관대로 SIGTERM을 받으면 즉시 `exit()`하도록 되어 있다.
   **질문:** 근본 원인과 해결책 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   Pod 종료 시 kubelet의 preStop 실행과 엔드포인트 제거(→ kube-proxy의 노드별 규칙 갱신, 수백 ms~수 초)가 병렬이라 순서가 보장되지 않는다. 앱이 SIGTERM을 받고 즉시 죽으면 아직 규칙을 지우지 못한 노드에서 죽은 Pod로 트래픽이 가 502/503이 된다. ① `preStop: sleep 10` 등으로 전파 시간을 벌고 ② 앱이 SIGTERM을 받으면 새 연결 수락을 중단하고 진행 중 요청을 끝내고 커넥션 풀·큐를 정리한 뒤 종료한다. `/readyz`가 503을 반환하게 하면 더 안전하다. → 코어 4

   </details>

2. **상황:** DB가 30초쯤 느려졌는데 모든 API 서버 Pod가 동시에 재시작했고, DB가 회복될 때까지 재시작이 이어졌다. liveness가 `/health`를 보는데, `/health`는 DB 쿼리를 한 번 날린다.
   **질문:** 무엇이 잘못됐고 어떻게 나눠야 하나?

   <details markdown="1"><summary>답 확인</summary>

   liveness에 외부 의존성을 넣은 안티패턴이다(readiness와 같은 엔드포인트를 쓴 것도 같은 문제). DB가 느려지면 모든 Pod가 동시에 재시작하고, 재시작해도 DB는 여전히 느려 무한 재시작에 빠지는 장애 증폭이 생긴다. `/healthz`(프로세스가 요청을 처리할 수 있는가, 외부 의존성 없음)는 liveness, `/readyz`(DB 연결·캐시 로딩 포함)는 readiness로 분리한다. readiness 실패는 재시작 없이 엔드포인트에서만 빠진다. `timeoutSeconds` 기본 1초도 3~5초로 늘린다. → 코어 2

   </details>

3. **상황:** 게임 데이터 테이블과 맵을 메모리에 로딩하는 데 2분이 걸리는 서버가, liveness(`initialDelaySeconds: 10`)에 걸려 뜨기도 전에 계속 재시작된다. `initialDelaySeconds`를 180으로 늘리자는 의견이 나왔다.
   **질문:** 그 방법의 문제와 더 나은 설정은?

   <details markdown="1"><summary>답 확인</summary>

   `initialDelaySeconds`를 길게 잡으면 런타임 데드락이 그 시간 동안 방치된다. startupProbe(예: `periodSeconds: 10`, `failureThreshold: 30` → 최대 300초)를 두면 성공할 때까지 liveness/readiness가 실행되지 않고, 성공 후에는 liveness가 `failureThreshold: 3`으로 30초 안에 감지한다. 시작은 관대하게, 운영 중에는 엄격하게. → 코어 2

   </details>

4. **상황:** 서버 컨테이너가 `exitCode 137`로 반복 종료된다. 담당자는 "OOM이니 메모리 limit을 두 배로"라고 한다.
   **질문:** 바로 limit을 올리기 전에 무엇을 확인해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   137은 SIGKILL(128+9)로, OOMKilled일 수도 grace period 초과일 수도 있다. `kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'`로 `reason`을 본다. OOMKilled가 아니면 종료 처리 시간·preStop을 봐야 한다. OOMKilled라도 즉시 limit을 올리기 전에 실제 사용량 추이와 메모리 누수 여부를 확인한다([19장](19-리소스-요청-제한과-스케줄링-기초.md)). → 코어 1, 코어 3

   </details>

5. **상황:** 게임 서버를 `command: ["sh", "-c", "./gameserver --config /etc/game.conf"]`로 띄웠다. 배포 때마다 Pod 삭제가 정확히 30초씩 걸리고, SIGTERM 핸들러에 넣어 둔 세이브 처리가 한 번도 실행되지 않는다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   셸이 PID 1이 되어 SIGTERM을 받고 자식(게임 서버)에게 전달하지 않는다. 그래서 핸들러가 실행되지 않고 유예 시간(기본 30초) 후 SIGKILL(137)로 끝난다. `sh -c "exec ./gameserver ..."`로 프로세스를 교체하거나, 셸 없이 `["./gameserver", "--config", "/etc/game.conf"]`로 실행한다. Dockerfile에서도 exec 형식 `CMD`를 쓴다. → 코어 4

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1. 상태 읽기
   phase 5개: ( ? ) ( ? ) ( ? ) ( ? ) ( ? )   — 왜 거친가: ____
   conditions: PodScheduled → ( ? ) → ( ? ) → Ready(____ 결정)
   컨테이너 state: waiting / running / terminated,  보물: ( ? )
   exitCode: 0 / 1 / 137(____) / 139(____) / 143(____)

코어 2. 프로브
   startup(실패 시 ____) / liveness(실패 시 ____) / readiness(실패 시 ____)
   방식 4가지: ( ? ) ( ? ) ( ? ) ( ? )
   최대 감지 시간 = ____ + (____ x ____) + ____
   liveness 안티패턴 3가지: ____ / ____ / ____
   /healthz(____) vs /readyz(____)
   startupProbe 원칙: 시작은 ____, 운영 중에는 ____

코어 3. 재시작
   restartPolicy: Always / OnFailure / Never — 재시작 대상은 Pod? 컨테이너?
   CrashLoopBackOff: 10초 → ... → ____(상한), ____ 이다(원인 아님)
   진단 순서: ( ? ) → ( ? ) → ( ? )
   진단표: Pending / ImagePullBackOff / CrashLoopBackOff / 0/1 Running / Terminating / OOMKilled

코어 4. 종료
   deletionTimestamp → [preStop ∥ ____] → SIGTERM → 대기(____초) → SIGKILL
   502 해결 2가지: ____ / ____
   시그널 함정: sh -c "app" → 해결 ____
```

### 2. 인출 질문

1. (확인 질문 1) `kubectl get pod`에서 `0/1 Running`으로 보이는 Pod는 Service 트래픽을 받는가? 그 이유는 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   받지 않는다. phase는 Running(컨테이너 실행 중)이지만 readiness가 통과하지 않아 `Ready` condition이 True가 아니고, Service 엔드포인트에는 `Ready=True`인 Pod만 등록되기 때문이다. → 코어 1

   </details>

2. (확인 질문 2) liveness 프로브에 DB 연결 확인을 넣으면 왜 위험한가? 대신 어디에 넣어야 하는가?

   <details markdown="1"><summary>답 확인</summary>

   DB가 잠깐 느려지면 모든 앱 Pod가 동시에 재시작하고, 재시작해도 DB는 여전히 느려 무한 재시작에 빠지는 장애 증폭이 일어난다. 의존성 확인은 실패해도 재시작 없이 엔드포인트에서만 빠지는 readiness(`/readyz`)에 넣고, liveness(`/healthz`)는 외부 의존성 없이 가볍게 둔다. → 코어 2

   </details>

3. (확인 질문 3) 롤링 업데이트 중 502가 나는 근본 원인은 무엇이며, 이를 줄이기 위해 할 수 있는 두 가지는 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   Pod 종료 시 kubelet의 preStop 실행과 엔드포인트 제거(→ kube-proxy의 노드별 규칙 갱신)가 병렬로 일어나 순서가 보장되지 않는다. 앱이 SIGTERM을 받고 즉시 죽으면 아직 규칙을 못 지운 노드에서 죽은 Pod로 트래픽이 간다. 해결은 ① `preStop: sleep 10` 등으로 전파 시간을 벌고 ② 앱이 SIGTERM을 받으면 새 연결 수락을 중단하고 진행 중 요청을 끝낸 뒤 종료하는 것이다. → 코어 4

   </details>

4. exitCode 137을 보면 무엇을 의심해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   137은 SIGKILL(128+9)이다. ① `reason`이 OOMKilled면 메모리 한도 초과, ② OOMKilled가 아니면 종료 유예 시간(grace period) 안에 끝나지 않아 강제 종료된 것이다. `lastState.terminated`로 구분한다. → 코어 1, 코어 3

   </details>

5. liveness 설정이 `initialDelaySeconds: 10, periodSeconds: 10, failureThreshold: 3, timeoutSeconds: 3`일 때 최대 감지 시간은? `timeoutSeconds` 기본값의 문제는?

   <details markdown="1"><summary>답 확인</summary>

   10 + (10 x 3) + 3 = 43초다. 기본값 1초는 너무 짧아, 부하가 높을 때 응답이 1초를 넘으면 프로브 실패 → 재시작 → 남은 Pod 부하 증가 → 연쇄 재시작의 연쇄 붕괴가 일어난다. 최소 3~5초로 둔다. → 코어 2

   </details>

6. startupProbe는 어떤 딜레마를 푸는가?

   <details markdown="1"><summary>답 확인</summary>

   시작에 2~3분 걸리는 앱에서 liveness의 `initialDelaySeconds`를 길게 잡으면 런타임 데드락이 그 시간 동안 방치되고, 짧게 잡으면 시작 중 계속 재시작된다. startupProbe는 성공할 때까지(예: 10초 x 30 = 최대 300초) 다른 프로브를 실행하지 않고, 성공 후에는 liveness가 엄격하게(예: 30초) 감지한다. "시작은 관대하게, 운영 중에는 엄격하게." → 코어 2

   </details>

7. readinessProbe 경로를 잘못 바꿔 배포하면 어떤 일이 생기며, 서비스는 왜 멀쩡한가?

   <details markdown="1"><summary>답 확인</summary>

   새 Pod는 `Running`이지만 `0/1`로 남고 `kubectl rollout status`가 진행되지 않는다(롤아웃 멈춤). 기존 Pod들이 그대로 트래픽을 받고 있으므로 서비스는 정상이며, 이것이 readiness 기반 롤링 업데이트의 안전장치다. `kubectl rollout undo`로 되돌린다. → 코어 2

   </details>

8. `CrashLoopBackOff`의 정체와 진단 순서는? 종료 코드 0인데도 이 상태가 되는 경우는?

   <details markdown="1"><summary>답 확인</summary>

   반복해서 죽는 컨테이너에 kubelet이 재시작 간격을 10초부터 지수적으로 늘리며(상한 300초) 기다리는 상태로, 원인이 아니라 증상이다. 진단은 ① `logs --previous` ② `lastState.terminated`의 종료 코드·이유 ③ `describe`의 이벤트 순이다. `command: ["echo", "hello"]`처럼 즉시 끝나는 프로세스는 `restartPolicy: Always`에서 코드 0이어도 계속 재시작되어 이 상태가 된다. → 코어 3

   </details>

9. `command: ["sh", "-c", "python app.py"]`의 문제와 해결 방법은?

   <details markdown="1"><summary>답 확인</summary>

   셸이 PID 1이 되어 SIGTERM을 받아도 자식(앱)에게 전달하지 않으므로 앱이 정리하지 못하고 유예 시간 후 SIGKILL(137)로 끝난다. `sh -c "exec python app.py"`로 프로세스를 교체하거나, 셸 없이 `["python", "app.py"]`로 실행한다. Dockerfile에서도 exec 형식 `CMD`를 쓴다. → 코어 4

   </details>

10. `restartPolicy`에 의한 "재시작"과 Pod를 다른 노드로 옮기는 것의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    restartPolicy의 재시작은 같은 노드에서 **컨테이너**만 다시 시작하는 것으로 IP와 `emptyDir` 내용이 유지되고 `restartCount`만 늘어난다. Pod를 다른 노드로 옮기는(새로 만드는) 것은 컨트롤러의 일이다. → 코어 3

    </details>

### 3. 기억 고리

- **C++ 유추:** liveness = 서버 매니저의 하트비트(무응답이면 재시작), readiness = 채널 "입장 불가" 표시(살려 두고 배정만 중단). ⚠️ 깨지는 곳: 하트비트에 DB 체크를 넣던 습관은 쿠버네티스에서 모든 Pod 동시 재시작(장애 증폭)이 된다.
- **C++ 유추:** 점검 종료 절차(신규 차단 → 세션 마무리 → 종료) = preStop + SIGTERM 처리. ⚠️ 깨지는 곳: 트래픽 차단과 SIGTERM이 병렬이고, 유예 시간이 지나면 SIGKILL이다.
- **비유:** 프로브 = 가게 점검. liveness는 "가게 주인이 쓰러졌나?"(쓰러졌으면 교대), readiness는 "지금 손님을 받을 수 있나?"(재료 준비 중이면 간판만 잠시 끔), startup은 "개점 준비 중엔 점검을 미룬다". ⚠️ 비유가 깨지는 지점: 쿠버네티스의 "교대"는 같은 노드에서 컨테이너를 다시 띄우는 것이고, 거래처(DB)가 늦는다고 주인을 교대시키면(liveness에 의존성 체크) 모든 가게가 동시에 문을 닫는 장애 증폭이 생긴다.
- **묶음(3의 법칙):** 프로브 3종(startup·liveness·readiness) / liveness 안티패턴 3개(의존성 체크·readiness와 같은 엔드포인트·무거운 프로브) / CrashLoopBackOff 진단 3단계(logs --previous·lastState·describe).
- **대칭·순서:** phase(거침) ↔ conditions(정확), `/healthz`(의존성 없음) ↔ `/readyz`(의존성 포함), 시작은 관대 ↔ 운영은 엄격. 종료 순서: Terminating → [preStop ∥ 엔드포인트 제거] → SIGTERM → grace period → SIGKILL.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "배포할 때 502가 나는 이유와 막는 방법"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "SIGTERM 받자마자 exit()하던 우리 서버가 쿠버네티스에서 왜 502를 만드는가, 그리고 `sh -c`로 띄우면 왜 핸들러가 아예 안 도는가"를 설명해 보세요.
- **랜덤 논리 게임:** A "데드락에 대비해 livenessProbe를 항상 설정해야 한다" vs B "확신이 없으면 liveness 없이 시작하고 실제로 데드락을 겪은 뒤 추가하는 편이 안전하다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Pod 생명주기와 프로브, graceful shutdown을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main/02-워크로드-실행하기/06-Pod-생명주기와-헬스-관리.md (6.1 status 읽기, 6.2 프로브·안티패턴·startupProbe·롤아웃 실습, 6.3 재시작 정책과 백오프, 6.4 종료 훅과 Graceful Shutdown, 6.5 진단표); 부록/B-쿠버네티스-아키텍처-도해.md (B.6 phase와 conditions, 종료 순서)*
