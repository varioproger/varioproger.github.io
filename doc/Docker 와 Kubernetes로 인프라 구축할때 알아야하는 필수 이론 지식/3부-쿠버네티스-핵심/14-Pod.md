---
title: "14장. Pod — 최소 배포 단위"
parent: "3부. 쿠버네티스 핵심"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 14
---

# 14장. Pod — 최소 배포 단위

## 이 장에서 배우는 것

- Pod가 왜 컨테이너가 아니라 "컨테이너 그룹"인지, 무엇을 공유하고 무엇을 공유하지 않는지 설명할 수 있다.
- Pod 매니페스트의 기본 구조를 읽고 쓸 수 있다.
- 로그 확인, 셸 접속, 포트 포워딩 등 Pod와 상호작용하는 기본 명령을 안다.
- Init 컨테이너와 사이드카의 차이, 그리고 사이드카·앰배서더·어댑터 패턴을 구분한다.

---

## 1. 왜 Pod인가

쿠버네티스는 컨테이너를 배포하는 시스템인데, 정작 배포 단위는 컨테이너가 아니라 **Pod**다. 이유를 상황으로 보자. 웹 서버 컨테이너와, 그 서버가 쓰는 설정 파일을 주기적으로 갱신하는 동기화 컨테이너가 있다. 이 둘은 다음 조건을 만족해야 한다.

1. **같은 노드에** 있어야 한다 (파일 시스템 공유).
2. **함께 시작하고 함께 끝나야** 한다. 한쪽만 남으면 의미가 없다.
3. **localhost로 통신**할 수 있으면 편하다.
4. 하지만 **각자 다른 이미지, 다른 라이프사이클**을 갖는다.

컨테이너를 개별 스케줄링 단위로 삼으면 이 요구를 표현할 방법이 없다. 그래서 쿠버네티스는 **"함께 배치되고 함께 살고 죽는 컨테이너 묶음"** 을 하나의 원자 단위, Pod로 정의했다.

### 무엇을 공유하는가

> **Pod는 NET·IPC·UTS 네임스페이스를 공유하고, MNT·PID는 각자 갖는 컨테이너 그룹이다.**

(네임스페이스는 5장에서 배운 리눅스 격리 기능이다.)

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

### pause 컨테이너: Pod의 숨은 주인

Pod에 컨테이너를 하나만 정의해도 노드에서는 컨테이너가 두 개 실행된다.

```
① pause 컨테이너를 먼저 띄운다
   → NET·IPC·UTS 네임스페이스를 "소유"한다
   → CNI 플러그인이 여기에 인터페이스를 꽂고 IP를 할당한다
② 나머지 컨테이너들이 pause의 네임스페이스에 합류한다
```

**왜 이런 구조인가?** 메인 컨테이너가 크래시하고 재시작해도 **Pod의 IP가 유지되어야** 하기 때문이다. 네임스페이스를 소유한 pause가 살아 있으면 IP는 그대로다.

### 반드시 기억할 Pod의 특성

**Pod는 일회용(ephemeral)이다.** 죽으면 되살아나는 것이 아니라 **새 Pod**가 만들어진다. 이름도 IP도 uid도 다르다. 그래서 다음이 따라온다.

- Pod IP에 의존하면 안 된다. → Service가 필요하다.
- Pod의 로컬 파일 시스템에 중요한 데이터를 두면 안 된다. → 볼륨이 필요하다.
- Pod를 직접 만들면 안 된다. → 컨트롤러가 필요하다.

`kind: Pod`로 직접 만든 Pod는 노드가 죽으면 그대로 사라지고 아무도 다시 만들어 주지 않는다. **프로덕션에서 Pod를 직접 만드는 경우는 사실상 없다.** 이 장에서 직접 만드는 것은 학습 목적이다. (컨트롤러는 17장에서 다룬다.)

## 2. Pod 매니페스트

### 최소 형태

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

### 실무에서 쓰는 형태

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
      resources:                   # 18장
        requests: { cpu: 50m, memory: 64Mi }
        limits:   { memory: 256Mi }
      readinessProbe:              # 15장
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

- **`ports`는 선언일 뿐이다.** 지워도 포트가 닫히지 않는다. 그래도 적는 이유는 문서화와, Service에서 `targetPort: http`처럼 **이름으로 참조**할 수 있기 때문이다.
- **`imagePullPolicy` 기본값에 함정이 있다.**

  | 이미지 태그 | 기본 정책 |
  |---|---|
  | `myapp:1.0` | `IfNotPresent` |
  | `myapp:latest` 또는 태그 없음 | `Always` |

  `latest`는 재현성을 깨뜨린다. 명시적 태그 + `IfNotPresent`가 정석이다.
- **`readOnlyRootFilesystem: true`** 를 쓰면 임시 파일을 쓸 곳이 없어 앱이 죽을 수 있으므로, `/tmp`에 `emptyDir`을 마운트하는 조합이 관용적이다.

### 생성과 관찰

```bash
kubectl apply -f pod.yaml
kubectl get pod hello -o wide
kubectl describe pod hello
```

`describe`는 위에서부터 **Status/Conditions**(어느 단계인가) → **Containers의 State/Last State**(재시작했다면 왜) → **Events**(시간 순으로 무슨 일이 있었나) 순서로 읽는다.

## 3. 컨테이너와 상호작용하기

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

## 4. 멀티 컨테이너 Pod 확인하기

두 컨테이너를 가진 Pod를 만들어 실험하면 앞의 이론이 확인된다(`nicolaka/netshoot` 이미지로 server와 client 컨테이너를 만든 경우).

| 확인 항목 | 결과 | 이유 |
|---|---|---|
| 두 컨테이너의 `ip addr` | 동일한 IP | NET 공유 |
| client에서 `curl localhost:8080` | server에 접속됨 | NET 공유 |
| 두 컨테이너의 `hostname` | 둘 다 Pod 이름 | UTS 공유 |
| server에서 만든 파일을 client에서 `ls` | No such file | MNT 분리 |
| client에서 `ps aux` | 자기 프로세스만 보임 | PID 분리 |
| 두 컨테이너가 같은 포트를 열기 | `Address already in use` | IP를 공유하므로 포트도 하나 |

### 볼륨으로 파일 공유

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

볼륨은 **Pod 수준**에 정의되고 각 컨테이너가 원하는 위치에 붙인다. `emptyDir`의 수명은 Pod와 같아서, 컨테이너가 재시작해도 데이터는 남지만 **Pod가 삭제되면 사라진다**(영구 데이터는 23장의 PV/PVC). `medium: Memory`를 주면 tmpfs 기반으로 빠르지만 메모리를 소비한다.

## 5. Init 컨테이너와 사이드카

### Init 컨테이너

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

### 사이드카 컨테이너

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

## 6. 멀티 컨테이너 디자인 패턴

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

## 7. Pod 삭제

```
① API 서버가 deletionTimestamp 설정 → Pod는 Terminating 상태
② 동시에: Endpoints에서 제거(새 트래픽 중단) + kubelet이 preStop 훅 실행
③ 컨테이너에 SIGTERM 전송
④ terminationGracePeriodSeconds(기본 30초) 대기
⑤ 아직 살아 있으면 SIGKILL
```

`kubectl delete pod hello --grace-period=0 --force`는 kubelet의 정리를 기다리지 않고 API 서버에서 레코드만 지운다. 노드에 컨테이너가 남아 있을 수 있고, StatefulSet에서는 같은 ID의 Pod가 둘 실행되는 문제가 생길 수 있다. 노드가 완전히 죽어 복구 불가능할 때만 쓴다. 종료 과정은 다음 장에서 자세히 다룬다.

## 핵심 요약

- Pod는 **NET·IPC·UTS를 공유하고 MNT·PID는 분리된 컨테이너 그룹**이다. 같은 IP·`localhost`를 쓰지만 파일은 볼륨으로만 공유된다.
- **pause 컨테이너**가 네임스페이스를 소유하므로 메인 컨테이너가 재시작해도 Pod IP가 유지된다.
- Pod는 **일회용**이다. IP에 의존하지 말고, 로컬 파일에 데이터를 두지 말고, 직접 만들지 말 것(컨트롤러를 쓴다).
- `kubectl logs --previous`는 크래시 원인 추적의 핵심, `kubectl debug`는 셸 없는 이미지 디버깅의 표준이다.
- **Init 컨테이너**는 순차적으로 완료될 때까지 실행되고, `restartPolicy: Always`를 주면 **사이드카**가 되어 메인보다 먼저 시작해 나중에 종료된다.
- 패턴은 **사이드카**(기능 추가), **앰배서더**(나가는 연결 대리), **어댑터**(형식 변환)이며, 함께 스케일될 필요가 없다면 별도 Pod로 나눈다.

## 확인 질문

1. 같은 Pod의 두 컨테이너가 `localhost`로 통신할 수 있는 이유와, 그럼에도 파일을 바로 공유할 수 없는 이유는 각각 무엇인가?
2. Init 컨테이너와 일반 컨테이너의 실행 방식 차이는 무엇이며, 어떤 작업에 Init 컨테이너가 적합한가?
3. 웹 서버와 DB를 한 Pod에 넣으면 안 되는 이유를 "스케일" 관점에서 설명해 보라.

*원문 근거: kubernetes-textbook-main/02-워크로드-실행하기/05-Pod-최소-배포-단위.md (5.1 왜 Pod인가·공유 네임스페이스·pause·Pod의 특성, 5.2 매니페스트, 5.3 컨테이너와 상호작용, 5.4 멀티 컨테이너 실습, 5.5 Init·사이드카, 5.6 디자인 패턴·선택 가이드, 5.7 Pod 삭제); 부록/B-쿠버네티스-아키텍처-도해.md (B.3 Pod는 컨테이너가 아니다·pause)*
