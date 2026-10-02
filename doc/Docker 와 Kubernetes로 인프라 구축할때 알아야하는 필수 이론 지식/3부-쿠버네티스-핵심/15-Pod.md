---
title: "15장. Pod — 최소 배포 단위"
parent: "3부. 쿠버네티스 핵심"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 15
---

# 15장. Pod — 최소 배포 단위

> **🎮 게임 서버 개발자에게** — 한 머신에 게임 서버 프로세스와 로그 에이전트 프로세스를 같이 띄워 `localhost`로 통신시키던 구성을 떠올리면 Pod의 절반이 보인다. 같은 Pod의 컨테이너는 IP와 포트 공간을 공유해 `bind()` 충돌도 똑같이 난다. 결정적으로 다른 점은 **파일 시스템과 프로세스 목록은 공유되지 않는다**는 것, 그리고 Pod는 죽으면 같은 머신에서 되살아나는 것이 아니라 **IP도 이름도 다른 새 Pod로 교체되는 일회용**이라는 것이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 서버 컨테이너가 쓴 로그 파일을 같은 Pod의 수집 사이드카가 "No such file"이라며 못 읽는다.
> - 재배포 뒤 다른 서버가 하드코딩해 둔 Pod IP로 접속하다 전부 실패한다.
> - 매칭 서버가 Redis가 뜨기 전에 먼저 떠서 크래시를 반복한다.

## 코어 — 이것만은 100%

> **한 문장:** Pod는 pause 컨테이너가 소유한 NET·IPC·UTS 네임스페이스를 함께 쓰고 MNT·PID는 따로 갖는 일회용 컨테이너 묶음이므로, IP·로컬 파일·직접 생성에 기대지 말고 Service·볼륨·컨트롤러를 쓰며, 함께 스케일되어야 할 때만 Init·사이드카 등으로 컨테이너를 묶는다.

1. **공유 vs 분리 + pause** — NET·IPC·UTS 공유(같은 IP, `localhost`, 포트 공간 하나), MNT·PID 분리(파일은 볼륨으로만 공유). pause 컨테이너가 네임스페이스를 소유해 메인 재시작에도 IP가 유지된다.
2. **Pod는 일회용** — 죽으면 이름·IP·uid가 다른 새 Pod가 생긴다 → Service, 볼륨, 컨트롤러가 필요하다. 삭제는 Terminating → SIGTERM → 유예 → SIGKILL 순서다.
3. **매니페스트 읽기와 Pod 다루기** — `ports`는 선언일 뿐, `latest`는 `Always` pull, `describe`는 Conditions → State → Events 순으로 읽고, 크래시 원인은 `logs --previous`, 셸 없는 이미지는 `kubectl debug --target`.
4. **멀티 컨테이너: Init·사이드카·패턴** — Init(먼저, 순서대로, 완료까지) / 사이드카(init + `restartPolicy: Always`) / 사이드카·앰배서더·어댑터. 기준은 "항상 1:1로 함께 스케일되어야 하는가?"

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 한 머신에 서버 프로세스 + 에이전트 프로세스를 함께 띄움 | 멀티 컨테이너 Pod | `localhost`로 통신하고, 같은 포트를 둘이 `bind()`하면 뒤쪽이 `Address already in use`로 실패한다 | 같은 머신의 프로세스와 달리 **파일 시스템(MNT)과 프로세스 목록(PID)은 분리**되어 있다. 파일을 나누려면 볼륨을 명시적으로 마운트해야 한다. 또 둘은 반드시 같은 노드에 함께 배치되고 함께 살고 죽는다 |
| 부모 프로세스가 리스닝 소켓을 쥐고 있어, 워커 프로세스가 재시작돼도 포트가 유지되는 구조 | pause 컨테이너 | 오래 사는 쪽이 자원을 소유해 두면 다른 쪽이 죽었다 살아나도 "주소"가 유지된다 | pause가 쥐는 것은 소켓이 아니라 **NET·IPC·UTS 네임스페이스 자체**(그래서 IP)이고, pause는 실제 일을 하지 않는다 |
| 서버가 크래시하면 같은 머신에서 재실행 — IP·포트 그대로 | Pod의 일회용성 | 컨테이너 재시작은 같은 Pod 안에서 일어나 IP가 유지된다 | Pod 자체가 교체되면 **이름·IP·uid가 모두 새로** 바뀐다. 다른 서버가 IP를 하드코딩하면 안 되고 Service를 써야 한다 |
| SIGTERM 핸들러에서 정리 후 종료 | Pod 삭제 흐름 | SIGTERM을 받으면 정리하고 끝내야 한다 | `terminationGracePeriodSeconds`(기본 30초)가 지나면 SIGKILL로 강제 종료된다. 트래픽 제거와 preStop이 함께 얽힌다([16장](16-Pod-생명주기와-헬스체크.md)) |
| 운영 중인 프로세스에 디버거를 붙여 관찰 | `kubectl debug --target` | 실행 중인 프로세스를 밖에서 들여다본다 | 셸조차 없는 이미지에 **임시 디버그 컨테이너를 붙여** 대상 컨테이너의 프로세스 네임스페이스를 공유하는 방식이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 쿠버네티스는 왜 컨테이너가 아니라 "Pod"를 배포 단위로 삼았을까?
> 2. 같은 Pod의 두 컨테이너는 IP를 공유할까? 파일은 공유할까?
> 3. 컨테이너를 하나만 정의했는데 노드에서 컨테이너가 두 개 실행되는 이유는?
> 4. 웹 서버와 DB를 한 Pod에 넣으면 무엇이 문제일까?
>
> **처리법:** 🛠 실습 Pod 매니페스트 `apply` → `describe`, `logs --previous`, `exec`, `port-forward`, `kubectl debug --target`, 멀티 컨테이너 Pod로 공유 여부 확인 · 🗺 관계도 공유 네임스페이스(NET·IPC·UTS) vs 분리(MNT·PID), pause 컨테이너 → IP 유지, Init 컨테이너 ↔ 사이드카 ↔ 일반 컨테이너, 사이드카·앰배서더·어댑터 · 📦 카드로 `imagePullPolicy` 기본값 표, 사이드카 도입 버전(v1.29, v1.33 GA), `terminationGracePeriodSeconds` 기본 30초

**이 장에서 배우는 것**

- Pod가 왜 컨테이너가 아니라 "컨테이너 그룹"인지, 무엇을 공유하고 무엇을 공유하지 않는지 설명할 수 있다.
- Pod 매니페스트의 기본 구조를 읽고 쓸 수 있다.
- 로그 확인, 셸 접속, 포트 포워딩 등 Pod와 상호작용하는 기본 명령을 안다.
- Init 컨테이너와 사이드카의 차이, 그리고 사이드카·앰배서더·어댑터 패턴을 구분한다.

---

## 코어 1. 공유 vs 분리 + pause

### 1.1 왜 Pod인가

**한 줄 요약:** "함께 배치되고 함께 살고 죽는 컨테이너 묶음"을 표현하려면 컨테이너보다 한 단계 큰 원자 단위가 필요했다.

쿠버네티스는 컨테이너를 배포하는 시스템인데, 정작 배포 단위는 컨테이너가 아니라 **Pod**다. 이유를 상황으로 보자. 웹 서버 컨테이너와, 그 서버가 쓰는 설정 파일을 주기적으로 갱신하는 동기화 컨테이너가 있다. 이 둘은 다음 조건을 만족해야 한다.

1. **같은 노드에** 있어야 한다 (파일 시스템 공유).
2. **함께 시작하고 함께 끝나야** 한다. 한쪽만 남으면 의미가 없다.
3. **localhost로 통신**할 수 있으면 편하다.
4. 하지만 **각자 다른 이미지, 다른 라이프사이클**을 갖는다.

컨테이너를 개별 스케줄링 단위로 삼으면 이 요구를 표현할 방법이 없다. 그래서 쿠버네티스는 **"함께 배치되고 함께 살고 죽는 컨테이너 묶음"** 을 하나의 원자 단위, Pod로 정의했다.

### 1.2 무엇을 공유하는가

**한 줄 요약:** NET·IPC·UTS는 공유, MNT·PID는 각자. 그래서 포트는 하나, 파일은 볼륨으로만 공유된다.

> **Pod는 NET·IPC·UTS 네임스페이스를 공유하고, MNT·PID는 각자 갖는 컨테이너 그룹이다.**

(네임스페이스는 [6장](../2부-컨테이너와-Docker/06-컨테이너-격리-네임스페이스.md)에서 배운 리눅스 격리 기능이다.)

| 네임스페이스 | 공유 여부 | 결과 |
|---|---|---|
| NET | 공유 | 같은 IP, 같은 포트 공간. `localhost`로 통신 |
| IPC | 공유 | System V IPC, POSIX 메시지 큐 공유 |
| UTS | 공유 | 같은 호스트명 |
| MNT | 각자 | 파일 시스템 분리. 볼륨으로만 공유 |
| PID | 각자(기본값) | 서로의 프로세스가 보이지 않음 |

실무적 결론 두 가지가 나온다.

- **같은 Pod의 컨테이너는 포트를 공유한다.** 두 컨테이너가 모두 8080을 열려 하면 뒤에 시작한 쪽이 실패한다.
- **파일은 자동으로 공유되지 않는다.** 파일을 공유하려면 **볼륨을 명시적으로 마운트**해야 한다. 초보자가 가장 자주 하는 실수다.

PID 네임스페이스는 `shareProcessNamespace: true`로 공유할 수 있다(디버깅용).

### 1.3 pause 컨테이너: Pod의 숨은 주인

**한 줄 요약:** pause가 네임스페이스를 먼저 만들어 쥐고 있으므로, 메인 컨테이너가 재시작해도 Pod IP가 유지된다.

Pod에 컨테이너를 하나만 정의해도 노드에서는 컨테이너가 두 개 실행된다.

```
① pause 컨테이너를 먼저 띄운다
   → NET·IPC·UTS 네임스페이스를 "소유"한다
   → CNI 플러그인이 여기에 인터페이스를 꽂고 IP를 할당한다
② 나머지 컨테이너들이 pause의 네임스페이스에 합류한다
```

**왜 이런 구조인가?** 메인 컨테이너가 크래시하고 재시작해도 **Pod의 IP가 유지되어야** 하기 때문이다. 네임스페이스를 소유한 pause가 살아 있으면 IP는 그대로다.

### 1.4 멀티 컨테이너 Pod로 확인하기

**한 줄 요약:** 실험하면 공유(같은 IP·hostname·포트 충돌)와 분리(파일·프로세스가 안 보임)가 그대로 드러난다.

두 컨테이너를 가진 Pod를 만들어 실험하면 앞의 이론이 확인된다(`nicolaka/netshoot` 이미지로 server와 client 컨테이너를 만든 경우).

| 확인 항목 | 결과 | 이유 |
|---|---|---|
| 두 컨테이너의 `ip addr` | 동일한 IP | NET 공유 |
| client에서 `curl localhost:8080` | server에 접속됨 | NET 공유 |
| 두 컨테이너의 `hostname` | 둘 다 Pod 이름 | UTS 공유 |
| server에서 만든 파일을 client에서 `ls` | No such file | MNT 분리 |
| client에서 `ps aux` | 자기 프로세스만 보임 | PID 분리 |
| 두 컨테이너가 같은 포트를 열기 | `Address already in use` | IP를 공유하므로 포트도 하나 |

### 1.5 볼륨으로 파일 공유

**한 줄 요약:** 볼륨은 Pod 수준에 정의하고 각 컨테이너가 원하는 경로에 붙인다. `emptyDir`은 Pod와 수명이 같다.

```yaml
spec:
  volumes:
    - name: shared
      emptyDir: {}
  containers:
    - name: writer
      image: busybox
      command: ["sh","-c","while true; do echo \"$(date '+%H:%M:%S') tick\" >> /data/log.txt; sleep 5; done"]
      volumeMounts:
        - name: shared
          mountPath: /data
    - name: reader
      image: busybox
      command: ["sh","-c","sleep 3; tail -f /data/log.txt"]
      volumeMounts:
        - name: shared
          mountPath: /shared-data     # 마운트 경로는 달라도 된다
```

볼륨은 **Pod 수준**에 정의되고 각 컨테이너가 원하는 위치에 붙인다. `emptyDir`의 수명은 Pod와 같아서, 컨테이너가 재시작해도 데이터는 남지만 **Pod가 삭제되면 사라진다**(영구 데이터는 [24장](../4부-노출-데이터-운영/24-스토리지.md)의 PV/PVC). `medium: Memory`를 주면 tmpfs 기반으로 빠르지만 메모리를 소비한다.

---

## 코어 2. Pod는 일회용

### 2.1 반드시 기억할 Pod의 특성

**한 줄 요약:** 죽으면 되살아나는 것이 아니라 새 Pod가 생긴다 → IP 대신 Service, 로컬 파일 대신 볼륨, 직접 생성 대신 컨트롤러.

**Pod는 일회용(ephemeral)이다.** 죽으면 되살아나는 것이 아니라 **새 Pod**가 만들어진다. 이름도 IP도 uid도 다르다. 그래서 다음이 따라온다.

- Pod IP에 의존하면 안 된다. → Service가 필요하다.
- Pod의 로컬 파일 시스템에 중요한 데이터를 두면 안 된다. → 볼륨이 필요하다.
- Pod를 직접 만들면 안 된다. → 컨트롤러가 필요하다.

`kind: Pod`로 직접 만든 Pod는 노드가 죽으면 그대로 사라지고 아무도 다시 만들어 주지 않는다. **프로덕션에서 Pod를 직접 만드는 경우는 사실상 없다.** 이 장에서 직접 만드는 것은 학습 목적이다. (컨트롤러는 [18장](18-워크로드-컨트롤러.md)에서 다룬다.)

### 2.2 Pod 삭제

**한 줄 요약:** Terminating → (Endpoints 제거 + preStop) → SIGTERM → 유예(기본 30초) → SIGKILL. `--force`는 최후 수단.

```
① API 서버가 deletionTimestamp 설정 → Pod는 Terminating 상태
② 동시에: Endpoints에서 제거(새 트래픽 중단) + kubelet이 preStop 훅 실행
③ 컨테이너에 SIGTERM 전송
④ terminationGracePeriodSeconds(기본 30초) 대기
⑤ 아직 살아 있으면 SIGKILL
```

`kubectl delete pod hello --grace-period=0 --force`는 kubelet의 정리를 기다리지 않고 API 서버에서 레코드만 지운다. 노드에 컨테이너가 남아 있을 수 있고, StatefulSet에서는 같은 ID의 Pod가 둘 실행되는 문제가 생길 수 있다. 노드가 완전히 죽어 복구 불가능할 때만 쓴다. 종료 과정은 [16장](16-Pod-생명주기와-헬스체크.md)에서 자세히 다룬다.

---

## 코어 3. 매니페스트 읽기와 Pod 다루기

### 3.1 Pod 매니페스트

**한 줄 요약:** `ports`는 선언일 뿐, `latest`는 재현성을 깨고, `readOnlyRootFilesystem`에는 `/tmp` emptyDir을 짝지운다.

#### 최소 형태

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: minimal
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "sleep 3600"]
```

#### 실무에서 쓰는 형태

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello
  labels:
    app: hello
spec:
  containers:
    - name: hello
      image: hello:1.0
      imagePullPolicy: IfNotPresent
      ports:                       # 선언일 뿐. 포트를 여는 것은 아니다
        - name: http
          containerPort: 8080
      env:
        - name: APP_VERSION
          value: "1.0"
      resources:                   # 리소스 요청·제한 (아래 설명 참고)
        requests: { cpu: 50m, memory: 64Mi }
        limits:   { memory: 256Mi }
      readinessProbe:              # 헬스 체크 프로브 (아래 설명 참고)
        httpGet: { path: /healthz, port: http }
        initialDelaySeconds: 2
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      volumeMounts:
        - name: tmp
          mountPath: /tmp
  volumes:
    - name: tmp
      emptyDir: {}
  restartPolicy: Always
  terminationGracePeriodSeconds: 30
```

짚을 점은 다음과 같다.

- `resources`는 [19장](19-리소스-요청-제한과-스케줄링-기초.md), `readinessProbe`는 [16장](16-Pod-생명주기와-헬스체크.md)에서 다룬다.
- **`ports`는 선언일 뿐이다.** 지워도 포트가 닫히지 않는다. 그래도 적는 이유는 문서화와, Service에서 `targetPort: http`처럼 **이름으로 참조**할 수 있기 때문이다.
- **`imagePullPolicy` 기본값에 함정이 있다.**

  | 이미지 태그 | 기본 정책 |
  |---|---|
  | `myapp:1.0` | `IfNotPresent` |
  | `myapp:latest` 또는 태그 없음 | `Always` |

  `latest`는 재현성을 깨뜨린다. 명시적 태그 + `IfNotPresent`가 정석이다.
- **`readOnlyRootFilesystem: true`** 를 쓰면 임시 파일을 쓸 곳이 없어 앱이 죽을 수 있으므로, `/tmp`에 `emptyDir`을 마운트하는 조합이 관용적이다.

### 3.2 생성과 관찰

**한 줄 요약:** `describe`는 Status/Conditions → Containers의 State/Last State → Events 순으로 읽는다.

```bash
kubectl apply -f pod.yaml
kubectl get pod hello -o wide
kubectl describe pod hello
```

`describe`는 위에서부터 **Status/Conditions**(어느 단계인가) → **Containers의 State/Last State**(재시작했다면 왜) → **Events**(시간 순으로 무슨 일이 있었나) 순서로 읽는다.

### 3.3 컨테이너와 상호작용하기

**한 줄 요약:** 크래시 원인은 `logs --previous`, 개발 중 접속은 `port-forward`, 셸 없는 이미지는 `kubectl debug --target`.

```bash
# 로그
kubectl logs hello
kubectl logs hello -c sidecar        # 멀티 컨테이너 중 하나 지정
kubectl logs hello --previous        # 재시작 전 로그 (크래시 원인 추적의 핵심)
kubectl logs hello -f --tail=100

# 셸 접속
kubectl exec -it hello -- sh
kubectl exec hello -- env

# 파일 복사 (컨테이너에 tar 필요)
kubectl cp hello:/app/config.yaml ./config.yaml

# 포트 포워딩 (개발 중 가장 자주 쓴다)
kubectl port-forward pod/hello 8080:8080
kubectl port-forward svc/hello 8080:80
```

- `--previous`: `CrashLoopBackOff` 상태에서는 현재 컨테이너가 막 시작했거나 대기 중이라 유용한 로그가 없다. **직전에 죽은 컨테이너의 로그**에 원인이 있다.
- 로그는 컨테이너의 stdout/stderr가 노드의 파일로 기록된 것을 kubelet이 API로 제공한다. **로그는 노드에 남고 Pod가 삭제되면 사라지므로** 운영에서는 중앙 로그 수집이 필요하다.
- **distroless 이미지에는 셸이 없어** `exec`이 실패한다. 이때는 임시 디버그 컨테이너를 붙인다.

  ```bash
  kubectl debug -it hello --image=nicolaka/netshoot --target=hello
  ```

  `--target`을 주면 그 컨테이너의 프로세스 네임스페이스를 공유해 메인 프로세스를 직접 관찰할 수 있다. 프로덕션 디버깅의 표준 도구다.

---

## 코어 4. 멀티 컨테이너: Init·사이드카·패턴

### 4.1 Init 컨테이너

**한 줄 요약:** 메인보다 먼저, 순서대로, 완료될 때까지 실행되며, 끝나지 않으면 Pod가 영원히 시작되지 않는다.

**메인 컨테이너보다 먼저, 순서대로, 완료될 때까지** 실행되는 컨테이너다.

```
[init-1 실행 → 종료(0)] → [init-2 실행 → 종료(0)] → [app + sidecar 동시 시작]
     실패 시 재시도            실패 시 재시도
```

- 여러 개면 정의된 순서대로 하나씩 실행한다.
- 반드시 성공해야 다음으로 넘어간다. 실패하면 `restartPolicy`에 따라 재시도한다.
- 완료 후 종료해야 한다. 계속 도는 프로세스를 두면 Pod가 영원히 시작되지 않는다.
- 메인과 **다른 이미지**를 쓸 수 있다.

```yaml
spec:
  initContainers:
    - name: wait-for-db
      image: busybox
      command: ["sh","-c","until nc -z -w 2 postgres 5432; do echo waiting; sleep 2; done"]
  containers:
    - name: app
      image: myapp:1.0
```

`kubectl get pod`에서 `Init:0/2`는 "init 컨테이너 2개 중 0개 완료"를 뜻한다(`Init:1/2` → `PodInitializing` → `Running`으로 진행). init 컨테이너의 로그는 `kubectl logs <pod> -c <init이름>`으로 본다.

| 용도 | 설명 |
|---|---|
| 의존성 대기 | DB, 캐시 등이 준비될 때까지 블로킹 |
| 설정 준비 | Git clone, S3 다운로드, 템플릿 렌더링 |
| 스키마 마이그레이션 | DB 마이그레이션 후 앱 시작 |
| 권한 설정 | 볼륨 소유권 변경(`chown`) |
| 시크릿 주입 | Vault 등에서 받아 파일로 배치 |

**보안 이점**도 있다. `git`이나 `aws-cli` 같은 도구가 init 컨테이너에만 있고 메인 이미지에는 없으므로 실행 중인 컨테이너의 공격 표면이 줄어든다.

### 4.2 사이드카 컨테이너

**한 줄 요약:** `initContainers`에 `restartPolicy: Always`를 주면 메인보다 먼저 시작해 메인 종료 후 끝나는 정식 사이드카가 된다.

전통적으로 사이드카는 `containers`에 나란히 정의했는데 두 가지 문제가 있었다. ① 사이드카(예: 로그 수집기)가 메인보다 늦게 시작하면 초기 로그를 놓친다. ② Job에서 메인이 끝나도 사이드카가 계속 돌아 Job이 완료되지 않는다.

이를 해결하려고 **`initContainers`에 `restartPolicy: Always`를 주는 방식**의 정식 사이드카가 도입되었다(원문 기준: 쿠버네티스 v1.29부터 도입, v1.33 GA).

```yaml
spec:
  initContainers:
    - name: log-shipper
      image: fluent/fluent-bit:3.0
      restartPolicy: Always        # 이 한 줄이 사이드카로 만든다
  containers:
    - name: app
      image: hello:1.0
```

| 구분 | 일반 Init | 사이드카(init + Always) | 일반 컨테이너 |
|---|---|---|---|
| 시작 시점 | 메인보다 먼저 | 메인보다 먼저 | 메인과 동시 |
| 실행 방식 | 완료 후 종료 | 계속 실행 | 계속 실행 |
| 종료 시점 | - | 메인 종료 후 | 메인과 함께 |
| Job 완료 방해 | 없음 | 없음 | **있음** |

### 4.3 멀티 컨테이너 디자인 패턴

**한 줄 요약:** 사이드카(기능 보조) · 앰배서더(나가는 연결 대리) · 어댑터(보이는 형식 표준화). 함께 스케일될 필요가 없으면 별도 Pod.

멀티 컨테이너 Pod의 용도는 세 가지 패턴으로 정리된다.

| 패턴 | 하는 일 | 예 |
|---|---|---|
| **사이드카** | 메인 컨테이너의 기능을 **보조** | Fluent Bit 로그 수집, git-sync 설정 동기화, Vault Agent 시크릿 주입, Envoy 프록시 |
| **앰배서더** | 메인이 **외부 서비스에 나갈 때** 복잡성을 감춤. 앱은 `localhost`만 바라본다 | Cloud SQL Proxy, PgBouncer 연결 풀러, Redis 클러스터 프록시 |
| **어댑터** | 외부에 **보이는 형식**을 표준화 | `redis_exporter` 등 메트릭 익스포터, 로그를 JSON으로 변환 |

```
사이드카:  app ──write──→ [공유 볼륨] ←──read── 사이드카 ──→ 외부 로그 시스템
앰배서더:  app ──localhost:6379──→ 앰배서더 ──→ Redis 클러스터 (샤딩, 페일오버)
어댑터:    app ──독자 포맷──→ 어댑터 ──→ Prometheus(표준 형식)
```

예를 들어 로그 수집 사이드카를 쓰면 앱은 파일에만 쓰고, 사이드카가 그것을 stdout으로 흘려보내므로 **앱 코드를 수정하지 않고** 로그 파이프라인에 연결된다. 어댑터는 레거시 앱을 한 줄도 고치지 않고 Prometheus 생태계에 편입시킨다.

> **언제 멀티 컨테이너를 쓰지 말아야 하는가** — "두 서비스가 서로 호출한다"는 이유만으로 한 Pod에 넣으면 안 된다. 판단 기준은 **"이 둘이 항상 1:1로, 같은 개수만큼, 함께 스케일되어야 하는가?"** 이다. 아니라면 별도 Pod + Service다. 웹 서버와 DB를 한 Pod에 넣으면 웹 서버를 5개로 늘릴 때 DB도 5개가 된다.

---

## 실무 적용

### 체크리스트

- [ ] Pod는 **NET·IPC·UTS를 공유하고 MNT·PID는 분리된 컨테이너 그룹**이다. 같은 IP·`localhost`를 쓰지만 파일은 볼륨으로만 공유된다. 같은 포트를 두 컨테이너가 열 수 없다.
- [ ] **pause 컨테이너**가 네임스페이스를 소유하므로 메인 컨테이너가 재시작해도 Pod IP가 유지된다.
- [ ] Pod는 **일회용**이다. IP에 의존하지 말고, 로컬 파일에 데이터를 두지 말고, 직접 만들지 말 것(컨트롤러를 쓴다).
- [ ] 이미지는 명시적 태그 + `IfNotPresent`. `latest`는 재현성을 깨뜨린다. `readOnlyRootFilesystem`을 쓰면 `/tmp`에 `emptyDir`을 붙인다.
- [ ] `kubectl logs --previous`는 크래시 원인 추적의 핵심, `kubectl debug`는 셸 없는 이미지 디버깅의 표준이다. 로그는 Pod가 삭제되면 사라지므로 중앙 로그 수집이 필요하다.
- [ ] **Init 컨테이너**는 순차적으로 완료될 때까지 실행되고, `restartPolicy: Always`를 주면 **사이드카**가 되어 메인보다 먼저 시작해 나중에 종료된다.
- [ ] 패턴은 **사이드카**(기능 추가), **앰배서더**(나가는 연결 대리), **어댑터**(형식 변환)이며, 함께 스케일될 필요가 없다면 별도 Pod로 나눈다.
- [ ] `--grace-period=0 --force`는 노드가 완전히 죽어 복구 불가능할 때만 쓴다.

### 시나리오로 확인하기

1. **상황:** 게임 서버 컨테이너가 `/var/log/game/` 아래에 로그를 쓰고, 같은 Pod의 로그 수집 컨테이너가 같은 경로를 읽게 했다. 같은 머신의 두 프로세스처럼 당연히 보일 줄 알았는데 수집기는 "No such file"을 낸다.
   **질문:** 왜 안 보이며, 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   같은 Pod라도 MNT 네임스페이스는 컨테이너마다 따로라 파일 시스템이 분리되어 있다. Pod 수준에 볼륨(예: `emptyDir`)을 정의하고 두 컨테이너 모두에 `volumeMounts`로 마운트해야 한다(경로는 서로 달라도 된다). 반면 네트워크는 공유하므로 `localhost` 통신은 된다. → 코어 1

   </details>

2. **상황:** 로비 서버 설정 파일에 매칭 서버 Pod의 IP를 적어 두었다. 매칭 서버를 재배포한 뒤 로비 서버가 매칭 서버에 전혀 접속하지 못한다.
   **질문:** 원인과 올바른 방식은?

   <details markdown="1"><summary>답 확인</summary>

   Pod는 일회용이라 교체되면 이름·IP·uid가 모두 새로 바뀐다. Pod IP에 의존하지 말고 Service를 통해 접근해야 한다. (컨테이너 재시작만이라면 pause 덕분에 IP가 유지되지만, Pod 교체는 다르다.) → 코어 2

   </details>

3. **상황:** Pod가 `CrashLoopBackOff`인데 `kubectl logs`가 비어 있다. `exec`으로 들어가 보려 했더니 distroless 이미지라 셸이 없다고 실패한다.
   **질문:** 각각 무엇을 써야 하나?

   <details markdown="1"><summary>답 확인</summary>

   CrashLoopBackOff에서는 현재 컨테이너가 막 시작했거나 대기 중이라 유용한 로그가 없다. `kubectl logs <pod> --previous`로 직전에 죽은 컨테이너의 로그를 본다. 셸이 없는 이미지는 `kubectl debug -it <pod> --image=nicolaka/netshoot --target=<컨테이너>`로 임시 디버그 컨테이너를 붙여 그 컨테이너의 프로세스 네임스페이스를 공유해 관찰한다. → 코어 3

   </details>

4. **상황:** 매칭 서버가 시작하자마자 Redis에 접속하는데, 클러스터를 처음 올릴 때 Redis가 아직 준비되지 않아 매칭 서버가 크래시를 반복한다.
   **질문:** 앱 코드를 고치지 않고 Pod 수준에서 할 수 있는 방법은? 그 컨테이너에서 주의할 점은?

   <details markdown="1"><summary>답 확인</summary>

   Init 컨테이너로 의존성 대기를 건다(예: `until nc -z -w 2 <호스트> <포트>; do ...; done`). Init 컨테이너는 메인보다 먼저, 정의 순서대로, 성공할 때까지 실행되며, 성공해야 메인이 시작된다. 반드시 완료 후 종료해야 한다. 계속 도는 프로세스를 두면 Pod가 영원히 시작되지 않는다. 진행 상황은 `Init:0/1` 같은 STATUS로, 로그는 `kubectl logs <pod> -c <init이름>`으로 본다. → 코어 4

   </details>

5. **상황:** 배포를 단순하게 하려고 게임 API 서버와 DB를 한 Pod에 넣자는 제안이 나왔다. "어차피 서로 호출하니 `localhost`가 빠르다"는 이유다.
   **질문:** 무엇이 문제이고, 판단 기준은?

   <details markdown="1"><summary>답 확인</summary>

   Pod는 함께 배치되고 함께 스케일되는 단위라, API 서버를 5개로 늘리면 DB도 5개가 된다. "서로 호출한다"는 이유만으로 묶으면 안 된다. 판단 기준은 "이 둘이 항상 1:1로, 같은 개수만큼, 함께 스케일되어야 하는가?"이며, 아니라면 별도 Pod + Service다. → 코어 4

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1. 공유 vs 분리
  왜 Pod인가 — 조건 4가지: 같은 ____ / 함께 ____ / ____ 통신 / 각자 다른 ____
  공유: ( ? ) ( ? ) ( ? )    분리: ( ? ) ( ? )
  실무 결론: 포트 ____ / 파일은 ____ 로만
  pause 컨테이너 → 왜? ____
  emptyDir 수명 = ____

코어 2. 일회용
  IP 대신 ( ? ) / 로컬 파일 대신 ( ? ) / 직접 생성 대신 ( ? )
  삭제: deletionTimestamp → Endpoints 제거 + preStop → ( ? ) → 대기(____초) → ( ? )

코어 3. 매니페스트·상호작용
  함정: ports는 ____ / latest 태그 → imagePullPolicy ____ / readOnlyRootFilesystem + ____
  describe 읽는 순서: ( ? ) → ( ? ) → ( ? )
  logs --previous(____) / exec / cp / port-forward / debug --target(____)

코어 4. 멀티 컨테이너
  Init → ____ → app + sidecar
  Init vs 사이드카(init + ____) vs 일반 컨테이너: 시작·종료·Job 완료 방해
  패턴: 사이드카(____) / 앰배서더(____) / 어댑터(____)
  묶을지 기준: ____
```

### 2. 인출 질문

1. (확인 질문 1) 같은 Pod의 두 컨테이너가 `localhost`로 통신할 수 있는 이유와, 그럼에도 파일을 바로 공유할 수 없는 이유는 각각 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   NET 네임스페이스를 공유해 같은 IP와 포트 공간을 쓰기 때문에 `localhost`로 통신한다. MNT 네임스페이스는 컨테이너마다 따로라 파일 시스템이 분리되어 있으므로, 파일을 공유하려면 Pod 수준에 볼륨(예: `emptyDir`)을 정의하고 각 컨테이너에 명시적으로 마운트해야 한다. → 코어 1

   </details>

2. (확인 질문 2) Init 컨테이너와 일반 컨테이너의 실행 방식 차이는 무엇이며, 어떤 작업에 Init 컨테이너가 적합한가?

   <details markdown="1"><summary>답 확인</summary>

   Init 컨테이너는 메인보다 먼저, 정의된 순서대로 하나씩, 성공적으로 완료될 때까지 실행되고 끝나야 한다(계속 돌면 Pod가 시작되지 않는다). 일반 컨테이너는 동시에 시작해 계속 실행된다. 의존성 대기(DB 준비), 설정 준비(Git clone 등), 스키마 마이그레이션, 볼륨 권한 설정, 시크릿 주입에 적합하고, 도구를 메인 이미지에서 빼 공격 표면도 줄인다. → 코어 4

   </details>

3. (확인 질문 3) 웹 서버와 DB를 한 Pod에 넣으면 안 되는 이유를 "스케일" 관점에서 설명해 보라.

   <details markdown="1"><summary>답 확인</summary>

   Pod는 함께 배치되고 함께 스케일되는 단위라, 웹 서버를 5개로 늘리면 DB도 5개가 된다. 판단 기준은 "이 둘이 항상 1:1로, 같은 개수만큼, 함께 스케일되어야 하는가?"이고, 아니라면 별도 Pod + Service로 나눈다. → 코어 4

   </details>

4. pause 컨테이너는 무엇을 하며, 왜 필요한가?

   <details markdown="1"><summary>답 확인</summary>

   Pod에서 가장 먼저 떠서 NET·IPC·UTS 네임스페이스를 소유하고, CNI가 여기에 인터페이스를 꽂고 IP를 할당한다. 나머지 컨테이너는 그 네임스페이스에 합류한다. 메인 컨테이너가 크래시하고 재시작해도 pause가 살아 있으므로 Pod IP가 유지된다. → 코어 1

   </details>

5. "Pod는 일회용"이라는 특성에서 따라 나오는 세 가지 원칙은?

   <details markdown="1"><summary>답 확인</summary>

   죽으면 이름·IP·uid가 다른 새 Pod가 만들어지므로 ① Pod IP에 의존하지 말고 Service를 쓴다 ② 로컬 파일 시스템에 중요한 데이터를 두지 말고 볼륨을 쓴다 ③ Pod를 직접 만들지 말고 컨트롤러를 쓴다. 직접 만든 Pod는 노드가 죽으면 아무도 다시 만들어 주지 않는다. → 코어 2

   </details>

6. `myapp:latest` 이미지를 쓸 때의 `imagePullPolicy` 기본값과 그것이 왜 문제인가?

   <details markdown="1"><summary>답 확인</summary>

   `latest`나 태그가 없으면 기본값이 `Always`, 명시적 태그면 `IfNotPresent`다. `latest`는 재현성을 깨뜨리므로 명시적 태그 + `IfNotPresent`가 정석이다. → 코어 3

   </details>

7. `CrashLoopBackOff` 상태에서 `kubectl logs --previous`가 필요한 이유와, 셸이 없는 distroless 이미지는 어떻게 디버깅하나?

   <details markdown="1"><summary>답 확인</summary>

   CrashLoopBackOff에서는 현재 컨테이너가 막 시작했거나 대기 중이라 유용한 로그가 없고, 직전에 죽은 컨테이너의 로그에 원인이 있다. distroless 이미지는 셸이 없어 `exec`이 실패하므로 `kubectl debug -it <pod> --image=nicolaka/netshoot --target=<컨테이너>`로 임시 디버그 컨테이너를 붙여 그 컨테이너의 프로세스 네임스페이스를 공유한다. → 코어 3

   </details>

8. 정식 사이드카(`initContainers` + `restartPolicy: Always`)가 전통적 사이드카의 어떤 문제를 해결했나?

   <details markdown="1"><summary>답 확인</summary>

   전통적 사이드카는 `containers`에 나란히 두어 ① 메인보다 늦게 시작하면 초기 로그를 놓치고 ② Job에서 메인이 끝나도 사이드카가 계속 돌아 Job이 완료되지 않았다. 정식 사이드카는 메인보다 먼저 시작해 계속 실행되고 메인 종료 후 종료되므로 Job 완료를 방해하지 않는다. → 코어 4

   </details>

9. 사이드카·앰배서더·어댑터 패턴을 각각 한 줄로 구분하면?

   <details markdown="1"><summary>답 확인</summary>

   사이드카는 메인의 기능을 보조(Fluent Bit 로그 수집, git-sync 등), 앰배서더는 메인이 외부 서비스로 나갈 때 복잡성을 감춤(앱은 localhost만 바라봄, Cloud SQL Proxy 등), 어댑터는 외부에 보이는 형식을 표준화(redis_exporter 등 메트릭 익스포터)한다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** 같은 Pod의 컨테이너 = 같은 머신의 두 프로세스. `localhost` 통신, 같은 포트 `bind()` 시 `Address already in use`. ⚠️ 깨지는 곳: 파일 시스템(MNT)과 프로세스 목록(PID)은 분리되어 볼륨 없이는 파일을 못 나눈다.
- **C++ 유추:** pause = 리스닝 소켓을 쥔 부모 프로세스. ⚠️ 깨지는 곳: 쥐는 것은 소켓이 아니라 네임스페이스(IP) 자체이고, Pod가 교체되면 IP는 결국 바뀐다.
- **비유:** Pod = 한 주소를 쓰는 룸메이트 집. 주소(IP)와 현관 번호(포트)는 하나라 같은 포트를 둘이 쓰면 충돌하고, 방(MNT)은 각자라 물건을 나누려면 공용 창고(볼륨)를 써야 한다. 집주인(pause)이 계약을 쥐고 있어 세입자가 바뀌어도 주소는 그대로다. ⚠️ 비유가 깨지는 지점: Pod가 삭제되면 같은 집을 수리하는 게 아니라 다른 주소의 새 집(새 Pod)이 지어진다. 그대로 유지되는 건 컨테이너 재시작일 때뿐이다.
- **묶음(3의 법칙):** 공유 3개(NET·IPC·UTS) / 일회용 원칙 3개(Service·볼륨·컨트롤러) / 패턴 3개(사이드카·앰배서더·어댑터).
- **대칭·순서:** 공유(NET·IPC·UTS) ↔ 분리(MNT·PID). 컨테이너 종류 순서: init-1 → init-2 → (사이드카) → app. 삭제 순서: Terminating → Endpoints 제거 + preStop → SIGTERM → 유예 → SIGKILL.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod는 왜 컨테이너가 아니라 컨테이너 그룹인가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "한 머신에 서버와 에이전트를 같이 띄우던 것과 한 Pod에 두 컨테이너를 넣는 것은 무엇이 같고 무엇이 다른가"를 포트·파일·프로세스·수명 네 가지로 설명해 보세요.
- **랜덤 논리 게임:** A "서로 호출하는 두 서비스는 한 Pod에 넣어 localhost로 통신하는 게 낫다" vs B "함께 스케일될 필요가 없으면 별도 Pod + Service로 나눠야 한다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Pod의 공유 네임스페이스와 Init·사이드카 컨테이너를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main/02-워크로드-실행하기/05-Pod-최소-배포-단위.md (5.1 왜 Pod인가·공유 네임스페이스·pause·Pod의 특성, 5.2 매니페스트, 5.3 컨테이너와 상호작용, 5.4 멀티 컨테이너 실습, 5.5 Init·사이드카, 5.6 디자인 패턴·선택 가이드, 5.7 Pod 삭제); 부록/B-쿠버네티스-아키텍처-도해.md (B.3 Pod는 컨테이너가 아니다·pause)*
