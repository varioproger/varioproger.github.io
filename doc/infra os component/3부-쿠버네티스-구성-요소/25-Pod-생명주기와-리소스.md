---
title: "25장. Pod 생명주기와 리소스"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 25
---

# 25장. Pod 생명주기와 리소스

> **🎮 게임 서버 개발자에게** — 게임 서버를 운영해 봤다면 "접속 받을 준비가 됐는가"(로비 등록), "데드락에 빠졌는가"(워치독), "점검 때 접속자를 어떻게 내보내는가"(SIGTERM 후 drain), "메모리 한도를 넘으면 OOM Killer가 죽인다"가 모두 익숙하다. 쿠버네티스에서는 이것들이 각각 **readiness/liveness 프로브, 종료 시퀀스, requests/limits(cgroup)** 로 표준화돼 있다. 새로운 것은 두 가지다. 종료 시 **트래픽 차단과 SIGTERM이 병렬로 일어난다**는 점, 그리고 같은 자원 초과라도 **CPU는 기다리게 하고 메모리는 죽인다**는 비대칭이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 배포할 때마다 잠깐 502/연결 거부가 나서 접속 중이던 유저가 튕긴다.
> - 컨테이너가 계속 재시작하는데 `CrashLoopBackOff`만 보이고 이유를 모르겠다. `exitCode 137`이 찍혀 있다.
> - 평균 CPU는 낮은데 틱 지연이 튀고, `limits.cpu`를 줄였더니 더 심해졌다.

## 코어 — 이것만은 100%

> **한 문장:** Pod의 트래픽 수신 여부는 `Ready` 조건이 결정하고(프로브), 종료는 "엔드포인트 제거와 SIGTERM이 병렬"이라 preStop과 SIGTERM 처리가 필요하며, requests는 스케줄러가 limits는 cgroup이 쓰고 초과 시 CPU는 스로틀링·메모리는 OOM Kill이다.

1. **상태는 conditions와 `lastState`로 읽는다** — `phase`는 거칠다. `Ready`가 트래픽을 결정하고, 죽은 이유는 `lastState.terminated`(exitCode, reason)에 있다.
2. **프로브 세 종류는 실패 시 동작이 다르다** — startup은 시작 보호, liveness는 재시작, readiness는 트래픽 차단. liveness에 외부 의존성을 넣으면 장애가 증폭된다.
3. **종료는 프로토콜이다** — API 삭제 → (병렬) 엔드포인트 제거 + preStop → SIGTERM → grace period → SIGKILL. 셸이 PID 1이면 시그널이 전달되지 않는다.
4. **requests는 스케줄러, limits는 커널** — requests 합으로 배치, limits는 cgroup으로 강제. QoS(Guaranteed/Burstable/BestEffort)가 OOM 점수와 축출 순서를 정한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 기동 후 "준비 완료"를 로비/LB에 알리는 헬스 엔드포인트 | readinessProbe | 준비 안 됐으면 새 접속을 받지 않게 한다 | 실패해도 프로세스를 재시작하지 않고 엔드포인트에서만 뺀다. 회복되면 다시 들어온다 |
| 워치독 타이머가 멈춘 메인 루프를 감지해 프로세스 재시작 | livenessProbe | "회복 불가능한 상태"를 감지해 재시작한다 | 외부 의존성(DB)까지 체크하면 DB가 느려질 때 **모든 Pod가 동시에 재시작**한다 |
| `SIGTERM` 핸들러에서 `listen` 소켓을 닫고 기존 세션을 drain한 뒤 `exit` | graceful shutdown | 새 접속 중단, 진행 중 처리 완료 후 종료 | 로드밸런서의 대상 제거가 SIGTERM과 **병렬**이라, 이미 죽은 프로세스로 요청이 갈 수 있다 |
| `ulimit`/cgroup 메모리 한도, OOM Killer | `limits.memory`, `OOMKilled` | 한도 초과 시 커널이 프로세스를 죽인다(`exitCode 137`) | 같은 Pod의 컨테이너별 cgroup이고, `requests`는 별개로 스케줄러가 배치에 쓴다 |
| `hardware_concurrency()` 만큼 워커 스레드 | `limits.cpu` = CFS 쿼터 | 코어 수 이상의 CPU 바운드 스레드는 의미가 없다 | 쿼터는 100ms 주기마다 적용돼 평균 사용률이 낮아도 순간 스로틀링이 생긴다([1부 1장](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md)과 같은 메커니즘) |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `kubectl get pod`에서 `Running`인데 `READY`가 `0/1`이면 트래픽을 받을까?
> 2. readiness와 liveness가 같은 `/health` 엔드포인트를 쓰고, 그것이 DB를 확인하면 DB 장애 때 무슨 일이 생길까?
> 3. Pod 삭제 시 엔드포인트 제거와 SIGTERM 중 어느 쪽이 먼저일까? 이 순서가 배포 중 502와 무슨 관계일까?
> 4. 컨테이너가 CPU limit을 넘으면 죽을까, 메모리 limit을 넘으면 죽을까?
>
> **처리법:** 🛠 실습 `kubectl get pod -o jsonpath='{.status.containerStatuses[0].lastState}'`, `kubectl logs --previous`, `cat /sys/fs/cgroup/cpu.stat` → 바로 실행 · 🗺 관계도 종료 시퀀스 타임라인, 프로브 3종 실패 동작표, QoS 3등급 · 📦 카드로 exitCode 표(0/1/137/139/143), 백오프 10→20→40→80→160→300초, 감지 시간 공식

### 이 장에서 배우는 것

- `phase`, `conditions`, 컨테이너 상태, 종료 코드를 읽는 법
- startup/liveness/readiness의 역할과 안전한 설계, 재시작 정책과 `CrashLoopBackOff`
- 종료 시퀀스와 무중단 종료(preStop, SIGTERM, PID 1)
- requests/limits가 스케줄러·커널에 미치는 영향, QoS, CPU 스로틀링 vs OOM, 노드 압박 축출

---

## 코어 1. 상태는 conditions와 lastState로 읽는다

### 1.1 phase와 conditions

**한 줄 요약:** `Running`은 "서비스 준비 완료"가 아니며, 트래픽 수신 여부는 `Ready` 조건이 결정한다.

`status.phase`는 다섯 값이다.

| phase | 의미 |
|---|---|
| `Pending` | API 서버에 등록됐지만 아직 모든 컨테이너가 실행되지 않음(스케줄 대기, 이미지 다운로드, init 실행 중) |
| `Running` | 노드에 배치되고 모든 컨테이너가 생성됨. 적어도 하나가 실행/시작/재시작 중 |
| `Succeeded` | 모든 컨테이너가 코드 0으로 종료, 재시작 안 함 |
| `Failed` | 모든 컨테이너가 종료됐고 최소 하나가 실패 |
| `Unknown` | 노드와 통신할 수 없어 상태를 모름 |

`kubectl get pod`의 STATUS 열(`ContainerCreating`, `CrashLoopBackOff`, `Init:0/2`, `Terminating`)은 phase가 아니라 kubectl이 계산한 요약이다.

conditions는 시간 순으로 진행된다.

```
PodScheduled     노드가 정해졌다
   ↓
Initialized      모든 init 컨테이너가 성공적으로 완료됐다
   ↓
ContainersReady  모든 컨테이너의 readiness가 통과했다
   ↓
Ready            이 Pod로 트래픽을 보내도 된다  ★ 가장 중요
```

Service의 엔드포인트에는 `Ready=True`인 Pod만 등록된다([27장](27-Service와-kube-proxy.md)). 그래서 `0/1 Running`은 실행 중이지만 트래픽은 받지 않는 상태다. 상태 출력 한 칸에서 멈추지 말고 conditions, reason, message, Events를 읽는다.

### 1.2 컨테이너 상태와 종료 코드

**한 줄 요약:** `lastState.terminated`에 이전 컨테이너가 왜 죽었는지 들어 있다.

컨테이너 상태는 `waiting`(reason: `ContainerCreating`, `ImagePullBackOff`, `CrashLoopBackOff`), `running`, `terminated`(`exitCode`, `reason`, `signal`) 셋이다.

| exitCode | 의미 |
|---|---|
| `0` | 정상 종료 |
| `1` | 애플리케이션 오류 |
| `137` | SIGKILL(128+9). **OOMKilled** 또는 grace period 초과 |
| `139` | SIGSEGV(128+11), 세그먼테이션 폴트 |
| `143` | SIGTERM(128+15), 정상 종료 요청에 응답 |

`137`을 보면 두 가지를 의심한다. ① 메모리 초과 ② 종료 유예 시간 안에 안 끝나 강제 종료. 이 값은 [1부의 시그널](../1부-리눅스-OS-구성-요소/03-시그널.md)의 `128 + 시그널 번호` 규약 그대로다.

### 1.3 재시작 정책과 CrashLoopBackOff

**한 줄 요약:** 재시작은 Pod가 아니라 컨테이너를 다시 띄우는 것이고, `CrashLoopBackOff`는 원인이 아니라 증상이다.

`restartPolicy`는 Pod 수준(모든 컨테이너에 적용)이다. `Always`(기본, Deployment 등), `OnFailure`(Job), `Never`. 재시작해도 Pod는 같은 노드에 있고 IP와 `emptyDir` 내용이 유지되며 `restartCount`만 증가한다. 다른 노드로 옮기는 것은 컨트롤러의 일이다([24장](24-오브젝트-모델과-워크로드.md)).

반복해서 죽으면 kubelet이 간격을 지수적으로 늘린다: 10초 → 20초 → 40초 → 80초 → 160초 → 300초(상한). 10분간 정상 실행되면 타이머가 초기화된다.

진단 순서: ① `kubectl logs <pod> --previous`(죽기 직전 로그) ② `lastState.terminated`의 exitCode/reason ③ `kubectl describe pod`의 Events. `exitCode 0`인데 재시작되면 정상 종료하는 프로세스를 `restartPolicy: Always`로 돌리는 것이다(`command: ["echo","hello"]`처럼 즉시 끝나는 명령).

---

## 코어 2. 프로브 세 종류는 실패 시 동작이 다르다

### 2.1 역할과 실패 동작

**한 줄 요약:** startup은 "아직 시작 중인가", liveness는 "재시작해야 하는가", readiness는 "지금 트래픽을 받을 수 있는가"이다.

| 프로브 | 질문 | 실패했을 때 |
|---|---|---|
| startupProbe | 시작이 끝났는가? | 컨테이너 재시작. 성공 전에는 liveness/readiness가 실행되지 않음 |
| livenessProbe | 회복 불가능한 상태인가? | 컨테이너 재시작 |
| readinessProbe | 새 요청을 받을 준비가 됐는가? | 엔드포인트에서 제거(재시작 안 함), 회복되면 복귀 |

방식은 `httpGet`(2xx/3xx면 성공), `tcpSocket`, `exec`(종료 코드 0이면 성공), `grpc`(v1.27+ GA) 네 가지다. 프로브는 kubelet의 프로브 매니저가 컨테이너마다 별도 고루틴으로 자체 주기로 실행한다([23장](23-kubelet과-CRI.md)).

타이밍 파라미터와 최대 감지 시간:

```
최대 감지 시간 = initialDelaySeconds + (periodSeconds × failureThreshold) + timeoutSeconds
              = 10 + (10 × 3) + 3 = 43초
```

> **⚠️ `timeoutSeconds` 기본값 1초는 거의 항상 너무 짧다.** 부하가 높을 때 1초 안에 응답하지 못하면 liveness가 컨테이너를 재시작하고, 남은 Pod의 부하가 늘어 그 Pod들도 재시작되는 **연쇄 붕괴**가 생긴다. 최소 3&#126;5초로 둔다.

### 2.2 liveness 설계 원칙

**한 줄 요약:** liveness는 가볍고 외부 의존성이 없어야 하며, readiness와 엔드포인트를 분리한다.

readiness에는 의존성(DB 연결, 캐시 로딩) 확인을 넣어도 되지만 **liveness에는 넣으면 안 된다.**

1. 의존성을 체크한다 — DB가 잠깐 느려지면 모든 앱 Pod가 동시에 재시작하고, 재시작해도 DB는 여전히 느려 무한 재시작에 빠진다.
2. readiness와 같은 엔드포인트를 쓴다 — `/health`가 DB를 확인하면 1번 문제가 그대로 생긴다.
3. 프로브가 무겁다 — 부하 때 프로브 자체가 응답을 못 해 재시작을 유발한다.

| 엔드포인트 | 확인 내용 | 프로브 |
|---|---|---|
| `/healthz` | 프로세스가 요청을 처리할 수 있는가, 외부 의존성 없음 | liveness |
| `/readyz` | DB 연결, 캐시 로딩, 마이그레이션 완료 등 | readiness |

liveness를 아예 쓰지 않는 것도 유효하다. 앱이 크래시하면 프로세스가 죽고 kubelet이 어차피 재시작한다. 데드락 같은 "프로세스는 살아 있는데 일을 못 하는" 경우에만 필요하다.

### 2.3 startupProbe와 롤아웃

**한 줄 요약:** 시작은 관대하게(startup), 운영 중에는 엄격하게(liveness) 감지한다.

JVM처럼 시작에 수 분이 걸리는 앱은 liveness의 `initialDelaySeconds`를 길게 잡으면 런타임 데드락이 방치되고, 짧게 잡으면 시작 중 재시작된다. startupProbe(`periodSeconds: 10`, `failureThreshold: 30` → 최대 300초)로 시작을 보호하고 성공 후에 liveness(예: 30초 감지)와 readiness가 시작된다. 게임 서버라면 맵/리소스 로딩이 긴 서버가 해당한다.

readiness는 롤아웃의 안전장치이기도 하다. 잘못된 readiness 경로로 업데이트하면 새 Pod가 `0/1 Running`에 머물러 롤아웃이 멈추지만, 기존 Pod가 트래픽을 계속 받아 서비스는 정상이다.

---

## 코어 3. 종료는 프로토콜이다

### 3.1 종료 시퀀스

**한 줄 요약:** 엔드포인트 제거와 preStop/SIGTERM이 병렬이어서, 앱이 즉시 죽으면 이미 죽은 Pod로 트래픽이 간다.

```
kubectl delete pod (또는 롤링 업데이트로 교체)
① API 서버: deletionTimestamp 설정 → Pod가 "Terminating"
   ├──────────────────────┬──────────────────────┐
   ▼                      ▼                      │ ★ 병렬이다
② kubelet: preStop 실행   ③ 엔드포인트 컨트롤러:   │   순서 보장 없음
                             Endpoints에서 제거     │
                             → kube-proxy가 각 노드의 규칙 갱신 (수백 ms 내지 수 초)
④ preStop 완료 → SIGTERM 전송
⑤ terminationGracePeriodSeconds 대기 (기본 30초, preStop 시간 포함)
⑥ 아직 살아 있으면 SIGKILL
```

②와 ③이 병렬이라는 것이 배포 중 502의 근본 원인이다. 앱이 SIGTERM을 받고 즉시 종료하면 kube-proxy가 아직 규칙을 지우지 못한 노드에서 그 Pod로 트래픽을 보낸다. 해결은 두 가지를 함께 쓰는 것이다.

- **preStop으로 시간을 번다** — `lifecycle.preStop.exec.command: ["sleep","10"]`. 그동안 앱은 정상 동작하며 요청을 처리하고, 그 사이 모든 노드의 규칙이 갱신된다.
- **앱이 SIGTERM을 제대로 처리한다** — 새 연결 수락 중단, 진행 중 요청 완료, 커넥션 풀/큐 정리 후 종료. 게임 서버라면 `listen` 소켓을 닫고, 접속 중인 세션을 안전하게 저장·이전한 뒤 `exit`하는 것이다. SIGTERM을 받으면 `/readyz`가 503을 반환하게 해 엔드포인트에서 빠지는 것을 앱이 유도할 수도 있다.

`terminationGracePeriodSeconds`는 **preStop 시간을 포함**한다(60초에 preStop 10초면 SIGTERM 후 앱에 남는 시간은 50초). 웹 API는 30&#126;60초, 배치는 한 작업 단위, DB는 체크포인트·플러시에 충분한 시간이 기준이다.

`postStart`는 컨테이너 시작과 동시에(순서 보장 없이) 실행되므로 초기화 목적으로는 init 컨테이너가 낫다. 강제 삭제(`--grace-period=0 --force`)는 kubelet의 정리를 기다리지 않고 **API 서버의 레코드만 지워** 노드에 컨테이너가 남을 수 있다. StatefulSet에서는 같은 ID의 Pod가 둘 실행되는 스플릿 브레인이 가능하다.

### 3.2 시그널이 앱에 도달하지 않는 함정

**한 줄 요약:** 셸이 PID 1이면 SIGTERM을 자식에게 전달하지 않아 30초 뒤 SIGKILL(exitCode 137)된다.

```yaml
# ❌ 셸이 PID 1이 되어 시그널을 전달하지 않는다
command: ["sh", "-c", "python app.py"]
# ✅ exec으로 프로세스 교체
command: ["sh", "-c", "exec python app.py"]
# ✅ 더 나은 방법: 셸을 거치지 않는다
command: ["python", "app.py"]
```

Dockerfile도 exec 형식(`CMD ["python", "app.py"]`)을 쓴다. shell 형식(`CMD python app.py`)은 `sh`가 PID 1이 된다. PID 1 규칙과 좀비 회수는 [1부 시그널](../1부-리눅스-OS-구성-요소/03-시그널.md)과 [프로세스](../1부-리눅스-OS-구성-요소/02-프로세스.md) 장의 내용이 컨테이너에서 그대로 문제가 되는 사례다.

### 3.3 종료 중 EndpointSlice의 드레이닝

**한 줄 요약:** 종료 중에는 `ready=false`, `terminating=true`로 바뀌어 새 연결은 막고 기존 연결은 끊지 않는다.

[27장](27-Service와-kube-proxy.md)에서 보듯 삭제가 시작되면 EndpointSlice의 해당 엔드포인트가 `conditions.ready=false`, `conditions.terminating=true`로 갱신된다. `ready=false`가 새 연결의 유입을 막고, `terminating`을 인식하는 구현은 이미 맺힌 연결을 강제로 끊지 않고 자연스러운 종료를 기다린다.

> **[보충]** 전파는 즉시가 아니므로("Pod 삭제 즉시 모든 요청이 다른 Pod로 순간 이동한다"는 모델은 틀리다) 장시간 연결과 외부 LB의 대상 해제 지연(ALB의 deregistration delay 등)을 `terminationGracePeriodSeconds`와 함께 고려해야 한다는 것이 원문(qustion-book 05)의 지적이다.

---

## 코어 4. requests는 스케줄러, limits는 커널

### 4.1 requests와 limits의 역할

**한 줄 요약:** requests는 배치 결정에 한 번, limits는 실행 내내 cgroup으로 강제된다.

| | **requests** | **limits** |
|---|---|---|
| 누가 쓰는가 | **스케줄러** | **커널(cgroup)** |
| 언제 | Pod 배치 결정 시 | 실행 내내 |
| 의미 | "이만큼은 보장해 주세요" | "이 이상은 못 씁니다" |
| 초과 가능? | 여유가 있으면 가능 | 불가 |
| 영향 | 어느 노드에 갈지 | CPU 스로틀링 / OOM Kill |

스케줄러는 **requests의 합**만 본다. 실제 사용률이 5%여도 Allocatable(Capacity에서 `kube-reserved`, `system-reserved`, eviction 여유분을 뺀 값) 대비 requests가 꽉 차면 더 이상 스케줄되지 않는다. `kubectl describe node`의 Allocated resources에서 Requests 백분율이 100%에 가까우면 배치가 막히고, Limits는 100%를 넘어도(오버커밋) 된다. CPU 단위는 `1000m` = 1코어, 메모리는 `Mi`/`Gi`(2진 접두사)를 쓴다(`1000Mi`는 약 1.05GB, `1000M`은 정확히 1GB).

### 4.2 QoS 클래스

**한 줄 요약:** requests/limits 구성으로 자동 결정되며 OOM 점수와 축출 순서를 정한다.

```
Guaranteed : 모든 컨테이너에 requests와 limits가 있고, CPU·메모리 모두 requests == limits
Burstable  : Guaranteed는 아니지만 최소 하나의 컨테이너에 requests나 limits가 있음
BestEffort : 모든 컨테이너에 requests도 limits도 없음
```

사이드카 하나에 `resources`를 빠뜨리면 **Pod 전체가 Burstable**이 된다. 직접 지정할 수 없고 `kubectl get pod -o jsonpath='{.status.qosClass}'`로 확인한다.

| QoS | `oom_score_adj` | 축출 순서 |
|---|---|---|
| Guaranteed | **-997**(거의 죽지 않음) | 마지막 |
| Burstable | 2&#126;999(requests 대비 비율) | 다음(requests 초과가 클수록 먼저) |
| BestEffort | **1000**(가장 먼저 죽음) | 가장 먼저 |

CPU `cpu.weight`(v2)/`cpu.shares`(v1)는 requests에 비례해 설정되어 경합 시 requests가 큰 컨테이너가 더 많은 시간을 받는다(100m → 102, 500m → 512 대략 1:5). cgroup 파일 구조는 [10장](../2부-컨테이너-커널-기능과-Docker/10-cgroup.md)을 본다.

### 4.3 CPU 스로틀링 vs 메모리 OOM

**한 줄 요약:** CPU는 압축 가능해서 기다리게 하고, 메모리는 압축 불가능해서 죽인다.

| | **CPU** | **메모리** |
|---|---|---|
| 성질 | 압축 가능 | 압축 불가능 |
| 초과 시 | 대기(스로틀링) | **죽임**(OOM Kill) |
| 증상 | 응답 지연 | `exitCode 137`, `OOMKilled` |

CFS 대역폭 제어는 `cpu.max = "50000 100000"`처럼 100ms(period)마다 50ms(quota)를 쓸 수 있게 한다(0.5코어). **평균이 아니라 매 100ms 주기마다** 적용되므로, 스레드 4개가 각 30ms씩(총 120ms) 일하면 `limits.cpu: 1`(100ms)에서 CPU 사용률이 100%가 아니어도 지연이 발생한다. `cpu.stat`의 `nr_throttled / nr_periods`가 스로틀링 비율이며 5&#126;10%를 넘으면 limits를 올려야 한다. 이는 [1부 1장](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md)의 "스레드 16개, `--cpus=2`" 사례와 같은 메커니즘이다. 일부 조직은 지연에 민감한 서비스에서 CPU limits를 의도적으로 생략하는데(반대 의견: 예측 가능성 저하, 이웃 영향), ResourceQuota가 있으면 limits가 필수라 넉넉한 값이 현실적이라고 원문은 정리한다.

메모리 OOM은 두 종류다. **cgroup OOM**(컨테이너가 자기 `limits.memory` 초과, 그 컨테이너만 영향)과 **노드 OOM**(노드 전체 고갈, 여러 Pod와 심하면 kubelet까지 영향)이다. 노드 OOM이 훨씬 위험하고, 다음 절의 축출이 이를 예방한다. JVM은 힙 외에도 메타스페이스·스레드 스택·다이렉트 버퍼를 쓰므로 `-Xmx`를 limits와 같게 잡으면 OOMKilled되고, `-XX:MaxRAMPercentage=70.0` 같은 비율 설정을 쓴다. 메모리 동작의 커널 측 설명은 [4장](../1부-리눅스-OS-구성-요소/04-메모리.md)이다.

### 4.4 노드 압박과 축출

**한 줄 요약:** 노드 자원이 부족해지면 kubelet이 "약속보다 많이 쓰는 Pod부터" 축출하며, PDB는 이를 막지 못한다.

`evictionHard`(예: `memory.available: "500Mi"`)는 즉시 축출, `evictionSoft` + 유예 시간은 지속 시 축출이다. 순서는 ① QoS(BestEffort → Burstable → Guaranteed) ② 같은 QoS 안에서는 requests 초과 정도 ③ Pod Priority다. `MemoryPressure=True`가 되면 새 BestEffort Pod는 그 노드에 스케줄되지 않는다. 축출 흐름의 상세는 [23장](23-kubelet과-CRI.md)이다.

> **⚠️ PDB는 노드 압박 축출을 막지 못한다.** PodDisruptionBudget은 `kubectl drain` 같은 자발적 중단만 제어한다. 자원 부족으로 kubelet이 축출하는 것은 비자발적 중단이라 PDB를 무시한다.

적정값은 데이터로 정한다: 관측(`kubectl top`, Prometheus) → 산정(CPU requests는 P50&#126;P70, 메모리 requests는 P95×1.1, 메모리 limits는 최대×1.2&#126;1.5) → 검증(스로틀링 비율, OOMKilled 여부). CPU는 압축 가능해 오버커밋이 안전하지만(2&#126;4배도 흔함), 메모리 오버커밋은 위험해 1.2&#126;1.5배 이내로 제한한다.

---

## 실무 적용

### 체크리스트

- [ ] `READY 0/1 Running`은 트래픽을 받지 않는 상태임을 안다. 상태는 phase가 아니라 conditions와 `lastState`로 읽는다.
- [ ] `exitCode 137`을 보면 OOMKilled(메모리)와 grace period 초과(종료 처리) 두 가지를 구분했는가?
- [ ] liveness는 `/healthz`(가볍고 의존성 없음), readiness는 `/readyz`(의존성 포함)로 분리했는가? `timeoutSeconds`는 3&#126;5초 이상인가?
- [ ] 시작이 느린 서버(맵 로딩 등)에는 startupProbe를 두었는가?
- [ ] 종료 시 `preStop: sleep`으로 엔드포인트 전파 시간을 벌고, 앱이 SIGTERM을 받아 새 접속 중단 + 진행 중 세션 정리를 하는가?
- [ ] 컨테이너 `command`가 셸을 거치지 않거나 `exec`을 쓰는가(PID 1이 앱인가)? `terminationGracePeriodSeconds`가 preStop 시간을 포함해 충분한가?
- [ ] 모든 컨테이너(사이드카 포함)에 requests/limits를 정해 QoS를 의도대로 맞췄는가?
- [ ] 워커 스레드 수를 `limits.cpu` 쿼터에 맞췄고, `cpu.stat`의 `nr_throttled/nr_periods`를 확인했는가?
- [ ] 메모리 limits는 런타임의 힙 외 사용량(스택, 버퍼)을 포함한 값인가?

### 시나리오로 확인하기

1. **상황:** 롤링 업데이트마다 접속 중이던 유저 일부가 연결 거부(502/503)를 겪는다. 게임 서버는 SIGTERM을 받으면 즉시 `exit(0)`한다.
   **질문:** 원인과 대응은?

   <details markdown="1"><summary>답 확인</summary>

   엔드포인트 제거와 SIGTERM 전송이 병렬이라, 앱이 즉시 죽으면 kube-proxy가 아직 규칙을 갱신하지 못한 노드에서 이미 죽은 Pod로 트래픽이 간다. `preStop: sleep 10`으로 전파 시간을 벌고, 앱은 SIGTERM에서 `listen`을 닫고 진행 중 세션을 정리한 뒤 종료한다. `terminationGracePeriodSeconds`는 preStop 시간을 포함해 설정한다. → 코어 3

   </details>

2. **상황:** 서버가 `CrashLoopBackOff`다. `kubectl logs`에는 몇 줄뿐이고, `lastState.terminated`는 `exitCode: 137`, `reason: OOMKilled`다.
   **질문:** 어떻게 진단하나?

   <details markdown="1"><summary>답 확인</summary>

   `CrashLoopBackOff`는 증상이고 원인은 OOM이다. 현재 로그가 아니라 `kubectl logs --previous`로 죽기 직전 로그를 본다. 실제 사용량 추이(`kubectl top pod`, Prometheus), 메모리 누수, 런타임의 힙 외 사용(JVM이면 `-Xmx`가 limits와 같은지)을 점검한다. 무작정 `limits.memory`만 올리지 않는다. → 코어 1, 코어 4

   </details>

3. **상황:** 헬스 엔드포인트 `/health`가 DB 연결을 확인하고, liveness와 readiness가 모두 그것을 쓴다. DB 장애로 응답이 1초를 넘기자 모든 서버 Pod가 거의 동시에 재시작했다.
   **질문:** 무엇이 잘못됐고 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   liveness에 외부 의존성을 넣어 DB 장애가 전 Pod의 재시작으로 증폭됐고(재시작해도 DB는 그대로라 무한 재시작), `timeoutSeconds` 기본 1초도 너무 짧았다. liveness는 의존성 없는 `/healthz`, 의존성은 readiness의 `/readyz`로 분리하고 `timeoutSeconds`를 3&#126;5초로 올린다. liveness를 아예 쓰지 않는 선택도 유효하다. → 코어 2

   </details>

4. **상황:** 컨테이너를 `command: ["sh","-c","./gameserver --port 7777"]`로 정의했더니 `kubectl delete pod`가 항상 30초 걸리고 `exitCode 137`이다.
   **질문:** 왜 그런가?

   <details markdown="1"><summary>답 확인</summary>

   `sh`가 PID 1이 되어 SIGTERM을 자식(게임 서버)에게 전달하지 않으므로 grace period 30초를 꽉 채우고 SIGKILL된다. `exec ./gameserver ...`로 프로세스를 교체하거나 셸을 거치지 않는 `command: ["./gameserver","--port","7777"]`를 쓴다. → 코어 3

   </details>

📖 출처: kubernetes-textbook-main/02-워크로드-실행하기/06-Pod-생명주기와-헬스-관리.md, kubernetes-textbook-main/04-클러스터-운영/14-리소스-관리와-QoS.md, kubernetes-qustion-book/02_심화/05_스케줄링과_Pod_생명주기.md

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] conditions 순서: PodScheduled → ( ? ) → ContainersReady → ____ (트래픽 결정)
         exitCode: 137 = SIGKILL(128+__), 143 = SIGTERM(128+__), 139 = ____
         백오프: 10 → 20 → ( ? ) → 80 → 160 → ____초(상한), ____분 정상이면 초기화

[코어 2] startup 실패 = ____ / liveness 실패 = ____ / readiness 실패 = ____ (재시작 안 함)
         최대 감지 시간 = initialDelay + (period × ____) + ____
         liveness: ____ 엔드포인트, 외부 의존성 ( 넣는다 / 안 넣는다 ),  readiness: ____

[코어 3] 삭제 → ( ? 병렬 ? ): [kubelet: ____ 훅] ‖ [엔드포인트 ____ ]  → SIGTERM → grace(기본 __초) → ____
         PID 1 문제 해결: ____ sh -c "exec app"  또는 셸 안 거치기

[코어 4] requests = ____가 사용 / limits = ____이 사용
         QoS: Guaranteed(oom_score_adj ____) / Burstable / BestEffort(____)
         CPU 초과 = ____ , 메모리 초과 = ____ , 스로틀링 비율 = nr_throttled / ____
```

### 2. 인출 질문

1. `phase: Running`과 `Ready=True`는 어떻게 다른가?

   <details markdown="1"><summary>답 확인</summary>

   `Running`은 노드에 배치되고 컨테이너가 생성돼 적어도 하나가 실행 중이라는 거친 상태다. `Ready=True`는 모든 컨테이너의 readiness가 통과해 이 Pod로 트래픽을 보내도 된다는 조건이며, Service 엔드포인트에는 `Ready=True`인 Pod만 등록된다. `0/1 Running`은 트래픽을 받지 않는다. → 코어 1

   </details>

2. 세 프로브가 실패했을 때 각각 어떤 일이 일어나는가?

   <details markdown="1"><summary>답 확인</summary>

   startup 실패: 컨테이너 재시작(성공 전에는 다른 프로브가 실행되지 않음). liveness 실패: 컨테이너 재시작. readiness 실패: 재시작 없이 엔드포인트에서 제거되고 회복되면 복귀한다. → 코어 2

   </details>

3. liveness에 외부 의존성을 넣으면 안 되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   DB 등이 잠깐 느려지면 모든 앱 Pod의 liveness가 동시에 실패해 전부 재시작하고, 재시작해도 DB는 여전히 느려 무한 재시작에 빠진다. 장애가 전파·증폭된다. 의존성은 readiness에서 확인한다. → 코어 2

   </details>

4. 배포 중 502의 근본 원인과 두 가지 해법은?

   <details markdown="1"><summary>답 확인</summary>

   Pod 삭제 시 엔드포인트 제거(kube-proxy 규칙 갱신, 수백 ms&#126;수 초)와 preStop/SIGTERM이 병렬이라 앱이 즉시 죽으면 이미 죽은 Pod로 트래픽이 간다. ① `preStop: sleep`으로 전파 시간을 번다 ② 앱이 SIGTERM에서 새 연결 수락을 중단하고 진행 중 요청을 완료한 뒤 종료한다. → 코어 3

   </details>

5. `sh -c "python app.py"` 형태의 `command`가 왜 문제인가?

   <details markdown="1"><summary>답 확인</summary>

   셸이 PID 1이 되어 SIGTERM을 자식에게 전달하지 않으므로 grace period(기본 30초) 후 SIGKILL(exitCode 137)된다. `exec python app.py` 또는 `["python","app.py"]`(Dockerfile은 exec 형식 `CMD [...]`)를 쓴다. → 코어 3

   </details>

6. requests와 limits는 각각 누가 어떤 시점에 사용하는가?

   <details markdown="1"><summary>답 확인</summary>

   requests는 스케줄러가 Pod 배치 결정 시(requests의 합만 보고 실제 사용량은 안 봄), limits는 커널(cgroup)이 실행 내내 강제한다(CPU 스로틀링, 메모리 OOM Kill). → 코어 4

   </details>

7. CPU 초과와 메모리 초과의 결과가 다른 이유는?

   <details markdown="1"><summary>답 확인</summary>

   CPU는 압축 가능한 자원이라 쿼터를 넘으면 다음 주기까지 대기(스로틀링)시키면 된다. 메모리는 이미 할당된 것을 뺏을 수 없으므로 프로세스를 죽이는(OOM Kill, exit 137) 수밖에 없다. CFS 쿼터는 평균이 아니라 100ms 주기마다 적용된다. → 코어 4

   </details>

8. QoS 클래스는 어떻게 결정되고 무엇에 영향을 주는가?

   <details markdown="1"><summary>답 확인</summary>

   모든 컨테이너가 CPU·메모리 requests == limits이면 Guaranteed, 아무 설정도 없으면 BestEffort, 나머지는 Burstable이다(사이드카 하나가 빠지면 Pod 전체 Burstable). `oom_score_adj`(-997/2&#126;999/1000)와 노드 압박 시 축출 순서(BestEffort → Burstable → Guaranteed)에 영향을 준다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** liveness = 워치독 타이머, readiness = 로비 등록 플래그. ⚠️ readiness가 깨져도 프로세스는 재시작되지 않고 엔드포인트에서만 빠졌다가 회복되면 돌아온다.
- **C++ 유추:** `SIGTERM` 핸들러 + drain. ⚠️ 쿠버네티스에서는 LB 대상 제거와 SIGTERM이 병렬이라 핸들러만으로는 부족하고 preStop이 필요하다.
- **비유:** 종료 시퀀스 = 가게 폐점. 간판 내리기(엔드포인트 제거)와 점장 퇴근 통보(SIGTERM)가 동시에 나가서, 간판이 안 내려간 사이 손님이 문 닫힌 가게에 올 수 있다 → 점장은 10분 더 영업(preStop sleep). ⚠️ 비유가 깨지는 지점: 간판은 노드마다 따로 있어 전파 속도가 균일하지 않다.
- **비유:** requests/limits = 호텔 예약(requests, 방을 보장)과 객실 한도(limits). 객실 전기(CPU)는 한도 초과 시 잠시 차단, 객실 짐(메모리)은 한도를 넘으면 퇴실. ⚠️ 비유가 깨지는 지점: 방 예약은 실제 사용량이 아니라 예약 합만으로 만석이 된다.
- **묶음(3의 법칙):** 프로브 3(startup·liveness·readiness) / 컨테이너 상태 3(waiting·running·terminated) / QoS 3 / 종료 후반부 3(SIGTERM → grace → SIGKILL).
- **대칭·순서:** CPU(압축 가능, 기다림) ↔ 메모리(압축 불가, 죽음). 시작은 관대(startup) ↔ 운영은 엄격(liveness). conditions: PodScheduled → Initialized → ContainersReady → Ready.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod 삭제 명령부터 컨테이너가 죽을 때까지 무슨 일이 어떤 순서로 일어나는가"를 처음 듣는 사람에게 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "왜 배포 때 접속자가 튕기는지, preStop과 SIGTERM 처리를 어떻게 조합해야 하는지"를 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "CPU limits는 반드시 설정해야 한다" vs B "지연 민감 서비스는 CPU limits를 생략하는 편이 낫다" — 스로틀링, 이웃 영향, ResourceQuota를 근거로 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 liveness/readiness 설계와 QoS 결정 규칙을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main 02-워크로드-실행하기/06 (6.1&#126;6.5), 04-클러스터-운영/14 (14.1&#126;14.5), kubernetes-qustion-book 02_심화/05 (1&#126;6)*
