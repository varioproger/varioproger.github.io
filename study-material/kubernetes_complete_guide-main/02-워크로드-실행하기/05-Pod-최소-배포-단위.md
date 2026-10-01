---
title: "5장. Pod: 최소 배포 단위"
---

# 5장. Pod: 최소 배포 단위

> **학습목표**
> - Pod가 왜 컨테이너가 아니라 "컨테이너 그룹"인지 커널 수준에서 설명할 수 있다.
> - Pod 매니페스트를 작성하고 컨테이너와 상호작용할 수 있다.
> - 멀티 컨테이너 Pod에서 네임스페이스와 볼륨이 어떻게 공유되는지 실습으로 확인한다.
> - Init 컨테이너와 사이드카 컨테이너의 차이와 용도를 구분한다.
> - 사이드카·앰배서더·어댑터 세 가지 디자인 패턴을 적용할 수 있다.

---

## 5.1 왜 Pod인가

### 컨테이너를 직접 스케줄링하지 않는 이유

쿠버네티스는 컨테이너를 배포하는 시스템인데, 정작 배포 단위는 컨테이너가 아니라 Pod다. 왜 한 겹을 더 두었을까?

한 가지 상황을 생각해 보자. 웹 서버 컨테이너가 있고, 그 서버가 쓰는 설정 파일을 주기적으로 갱신하는 동기화 컨테이너가 있다. 이 둘은 다음 조건을 만족해야 한다.

1. **같은 노드에** 있어야 한다. 파일 시스템을 공유해야 하므로.
2. **함께 시작하고 함께 끝나야** 한다. 한쪽만 남으면 의미가 없다.
3. **localhost로 통신**할 수 있어야 편하다.
4. 하지만 **각자 다른 이미지, 다른 라이프사이클**을 갖는다.

컨테이너를 개별 스케줄링 단위로 삼으면 이 요구를 표현할 방법이 없다. "이 둘을 반드시 같은 노드에 함께 배치하라"는 제약을 매번 스케줄러에 걸어야 하고, 실패 처리도 각자 따로 해야 한다.

그래서 쿠버네티스는 **"함께 배치되고 함께 살고 죽는 컨테이너 묶음"** 을 하나의 원자 단위로 정의했다. 그것이 Pod다.

> Pod의 어원은 "고래 떼(pod of whales)" 또는 "완두콩 꼬투리(pea pod)"다. 도커 고래들이 모여 있는 껍질이라는 은유다.

### Pod의 정체: 공유하는 것과 공유하지 않는 것

2장에서 `unshare`로 네임스페이스를 만들어 봤다. 그때 예고한 문장을 다시 가져오자.

> **Pod는 NET·IPC·UTS 네임스페이스를 공유하고, MNT·PID는 각자 갖는 컨테이너 그룹이다.**

이제 이 문장을 표로 풀어 보자.

| 네임스페이스 | 공유 여부 | 결과 |
|---|---|---|
| **NET** | ✅ 공유 | 같은 IP, 같은 포트 공간. `localhost`로 서로 통신 |
| **IPC** | ✅ 공유 | System V IPC, POSIX 메시지 큐 공유 |
| **UTS** | ✅ 공유 | 같은 호스트명 |
| **MNT** | ❌ 각자 | 파일 시스템이 분리됨. 볼륨으로만 공유 |
| **PID** | ❌ 각자 (기본값) | 서로의 프로세스가 보이지 않음 |

여기서 두 가지 실무적 결론이 나온다.

**① 같은 Pod의 컨테이너는 포트를 공유한다.** 두 컨테이너가 모두 8080을 열려고 하면 뒤에 시작한 쪽이 실패한다. 하나의 IP를 나눠 쓰기 때문이다.

**② 파일은 자동으로 공유되지 않는다.** MNT 네임스페이스가 분리되어 있으므로, 파일을 공유하려면 **볼륨을 명시적으로 마운트**해야 한다. 초보자가 가장 자주 하는 실수가 이 지점이다.

PID 네임스페이스는 옵션으로 공유할 수 있다.

```yaml
spec:
  shareProcessNamespace: true    # 서로의 프로세스가 보인다
```

이렇게 하면 디버깅 컨테이너에서 메인 프로세스를 `ps`로 보거나 시그널을 보낼 수 있다.

### pause 컨테이너 — Pod의 숨은 주인

Pod에 컨테이너를 하나만 정의해도, 노드에서는 컨테이너가 **두 개** 실행된다.

3장에서 만든 클러스터의 노드에 들어가 확인해 보자.

```bash
docker exec -it k8s-guide-worker bash
crictl ps -a | head
```

메인 컨테이너 외에 `pause`라는 이미지가 보인다(일부 런타임에서는 `crictl pods`로만 노출된다).

**pause 컨테이너의 역할**은 이렇다.

```
Pod 생성 순서:
① pause 컨테이너를 먼저 띄운다
   → 이 컨테이너가 NET·IPC·UTS 네임스페이스를 "소유"한다
   → CNI 플러그인이 이 네임스페이스에 인터페이스를 꽂고 IP를 할당한다

② 나머지 컨테이너들을 띄우면서
   → "pause 컨테이너의 네임스페이스에 합류하라"고 지시한다
```

pause 컨테이너의 코드는 놀랍도록 단순하다. 시그널 핸들러를 등록하고 무한히 잠자는 것이 전부다.

**왜 이런 구조인가?** 메인 컨테이너가 크래시하고 재시작해도 **Pod의 IP가 유지되어야** 하기 때문이다. 네임스페이스를 소유한 pause가 살아 있으면 IP는 그대로다. 만약 메인 컨테이너가 네임스페이스를 소유했다면 재시작할 때마다 IP가 바뀔 것이다.

19장에서 이 구조를 `unshare`로 직접 재현한다.

### Pod의 특성 — 반드시 기억할 것들

**Pod는 일회용이다(ephemeral).** 죽으면 되살아나지 않는다. **새 Pod**가 만들어질 뿐이다. 이름도, IP도, uid도 다르다. 그래서 다음이 따라온다.

- **Pod IP에 의존하면 안 된다.** → Service가 필요하다(9장).
- **Pod의 로컬 파일 시스템에 중요한 데이터를 두면 안 된다.** → 볼륨이 필요하다(12장).
- **Pod를 직접 만들면 안 된다.** → 컨트롤러가 필요하다(8장).

마지막 항목이 특히 중요하다. `kind: Pod`로 직접 만든 Pod는 노드가 죽으면 그대로 사라진다. 아무도 다시 만들어 주지 않는다. **프로덕션에서 Pod를 직접 만드는 경우는 사실상 없다.** 이 장에서 Pod를 직접 만드는 것은 학습 목적이다.

## 5.2 Pod 매니페스트 작성

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

      # 포트 선언 (문서화 목적. 실제로 포트를 여는 건 아니다)
      ports:
        - name: http
          containerPort: 8080
          protocol: TCP

      # 환경변수
      env:
        - name: APP_VERSION
          value: "1.0"
        - name: POD_NAME                    # Downward API (7장)
          valueFrom:
            fieldRef:
              fieldPath: metadata.name

      # 리소스 (14장)
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          memory: 256Mi

      # 헬스 체크 (6장)
      readinessProbe:
        httpGet:
          path: /healthz
          port: http
        initialDelaySeconds: 2

      # 보안 (18장)
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

몇 가지 짚을 점이 있다.

**`ports`는 선언일 뿐이다.** 이 필드를 지운다고 포트가 닫히지 않는다. 컨테이너가 리슨하면 열린다. 그럼에도 적는 이유는 ① 문서화 ② Service에서 `targetPort: http`처럼 **이름으로 참조**할 수 있어서다. 포트 번호가 바뀌어도 Service를 고치지 않아도 된다.

**`imagePullPolicy`의 기본값 규칙**은 함정이 있다.

| 이미지 태그 | 기본 정책 |
|---|---|
| `myapp:1.0` | `IfNotPresent` |
| `myapp:latest` 또는 태그 없음 | `Always` |

`latest`가 매번 새로 받아지는 것이 편해 보이지만, 2장에서 말했듯 재현성을 깨뜨린다. 명시적 태그 + `IfNotPresent`가 정석이다.

**`readOnlyRootFilesystem: true`를 쓰면** 임시 파일을 쓸 곳이 없어 앱이 죽을 수 있다. 그래서 `/tmp`에 `emptyDir`을 마운트하는 조합이 관용적이다.

### Pod 생성과 관찰

```bash
kubectl apply -f pod.yaml
kubectl get pod hello -o wide
kubectl describe pod hello
```

`describe`의 출력을 읽는 법을 익혀 두자. 위에서부터 다음 순서로 본다.

1. **Status / Conditions** — 지금 어느 단계인가
2. **Containers → State / Last State** — 재시작했다면 왜
3. **Events** (맨 아래) — 시간 순으로 무슨 일이 있었나

## 5.3 컨테이너와 상호작용하기

### 로그

```bash
kubectl logs hello
kubectl logs hello -c sidecar             # 멀티 컨테이너 중 하나 지정
kubectl logs hello --previous             # 재시작 전 로그 ★ 크래시 원인 추적의 핵심
kubectl logs hello -f                     # 팔로우
kubectl logs hello --tail=100
kubectl logs hello --since=10m
kubectl logs hello --timestamps
kubectl logs -l app=hello --max-log-requests=10   # 라벨로 여러 Pod 동시에
```

`--previous`를 기억해 두자. `CrashLoopBackOff` 상태에서 현재 컨테이너는 이제 막 시작했거나 대기 중이라 유용한 로그가 없다. **직전에 죽은 컨테이너의 로그**가 원인을 담고 있다.

여러 Pod의 로그를 동시에 보려면 `stern` 플러그인이 훨씬 편하다.

```bash
kubectl stern hello          # Pod별로 색이 다르게 표시된다
```

**로그가 어디에 저장되는가?** 컨테이너의 stdout/stderr가 노드의 파일로 기록되고, kubelet이 그것을 API로 제공한다.

```bash
docker exec k8s-guide-worker ls /var/log/pods/
```

**로그는 노드에 남고, Pod가 삭제되면 사라진다.** 그래서 31장의 중앙 로그 수집이 필요하다.

### 셸 접속

```bash
kubectl exec -it hello -- sh
kubectl exec -it hello -c sidecar -- bash
kubectl exec hello -- env                 # 한 줄 명령
kubectl exec hello -- cat /etc/resolv.conf
```

> **⚠️ distroless 이미지에는 셸이 없다**
> 2장에서 권장한 distroless 이미지는 `sh`조차 없어서 `exec`이 실패한다. 보안 이득의 대가다. 이때 쓰는 것이 **임시 디버그 컨테이너**다.
> ```bash
> kubectl debug -it hello --image=nicolaka/netshoot --target=hello
> ```
> 실행 중인 Pod에 컨테이너를 추가로 붙인다. `--target`을 주면 그 컨테이너의 프로세스 네임스페이스를 공유해 메인 프로세스를 직접 관찰할 수 있다. **프로덕션 디버깅의 표준 도구다.**
>
> 노드 자체를 조사할 때는:
> ```bash
> kubectl debug node/k8s-guide-worker -it --image=busybox
> ```

### 파일 복사

```bash
kubectl cp hello:/app/config.yaml ./config.yaml     # Pod → 로컬
kubectl cp ./patch.py hello:/tmp/patch.py           # 로컬 → Pod
```

`tar`가 컨테이너에 있어야 동작한다. distroless에서는 쓸 수 없다.

### 포트 포워딩

```bash
kubectl port-forward pod/hello 8080:8080
kubectl port-forward svc/hello 8080:80
kubectl port-forward deploy/hello 8080:8080
```

개발 중 가장 자주 쓰는 명령이다. Service를 NodePort로 바꾸거나 인그레스를 설정하지 않고도 로컬에서 접근할 수 있다.

## 5.4 실습: 멀티 컨테이너 Pod

이제 앞의 이론을 눈으로 확인한다.

**① 네임스페이스 공유 확인**

`shared-ns.yaml`:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: shared-ns
spec:
  containers:
    - name: server
      image: nicolaka/netshoot
      command: ["sh", "-c", "python3 -m http.server 8080"]
    - name: client
      image: nicolaka/netshoot
      command: ["sh", "-c", "sleep 3600"]
```

```bash
kubectl apply -f shared-ns.yaml
kubectl wait --for=condition=Ready pod/shared-ns
```

**같은 IP인지 확인**
```bash
kubectl exec shared-ns -c server -- ip addr show eth0 | grep inet
kubectl exec shared-ns -c client -- ip addr show eth0 | grep inet
```
동일한 IP가 나온다. **NET 네임스페이스를 공유하기 때문이다.**

**localhost 통신 확인**
```bash
kubectl exec shared-ns -c client -- curl -s localhost:8080 | head -3
```
다른 컨테이너의 서버에 `localhost`로 접근된다.

**호스트명 확인 (UTS 공유)**
```bash
kubectl exec shared-ns -c server -- hostname
kubectl exec shared-ns -c client -- hostname
```
둘 다 `shared-ns`다.

**파일 시스템은 분리됨 (MNT 각자)**
```bash
kubectl exec shared-ns -c server -- touch /only-in-server
kubectl exec shared-ns -c client -- ls /only-in-server
# ls: /only-in-server: No such file or directory
```
**파일은 공유되지 않는다.** 이것이 볼륨이 필요한 이유다.

**프로세스도 분리됨 (PID 각자)**
```bash
kubectl exec shared-ns -c client -- ps aux
# 자기 자신만 보인다. http.server 프로세스는 안 보인다
```

**② 포트 충돌 확인**

두 컨테이너가 같은 포트를 열면 어떻게 되는지 본다.

```bash
kubectl exec shared-ns -c client -- sh -c "python3 -m http.server 8080 2>&1 | head -3"
# OSError: [Errno 98] Address already in use
```

같은 IP를 공유하므로 포트도 하나뿐이다.

**③ 볼륨으로 파일 공유하기**

`shared-vol.yaml`:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: shared-vol
spec:
  volumes:
    - name: shared
      emptyDir: {}

  containers:
    # 생산자: 5초마다 파일에 시간 기록
    - name: writer
      image: busybox
      command:
        - sh
        - -c
        - |
          while true; do
            echo "$(date '+%H:%M:%S') tick" >> /data/log.txt
            sleep 5
          done
      volumeMounts:
        - name: shared
          mountPath: /data

    # 소비자: 같은 파일을 읽어 출력
    - name: reader
      image: busybox
      command: ["sh", "-c", "sleep 3; tail -f /data/log.txt"]
      volumeMounts:
        - name: shared
          mountPath: /shared-data      # 마운트 경로는 달라도 된다!
```

```bash
kubectl apply -f shared-vol.yaml
kubectl logs shared-vol -c reader -f
```

```
10:23:11 tick
10:23:16 tick
10:23:21 tick
```

주목할 점: **두 컨테이너가 같은 볼륨을 다른 경로에 마운트했다.** `/data`와 `/shared-data`는 같은 디렉터리를 가리킨다. 볼륨은 Pod 수준에 정의되고, 각 컨테이너가 원하는 위치에 붙인다.

**`emptyDir`의 수명**은 Pod와 같다. 컨테이너가 재시작해도 데이터는 남지만, **Pod가 삭제되면 사라진다.** 12장에서 영구 볼륨을 다룬다.

메모리 기반 emptyDir도 있다.
```yaml
volumes:
  - name: cache
    emptyDir:
      medium: Memory        # tmpfs. 빠르지만 메모리를 소비한다
      sizeLimit: 128Mi
```

**④ 정리**
```bash
kubectl delete pod shared-ns shared-vol
```

## 5.5 Init 컨테이너와 사이드카 컨테이너

### Init 컨테이너

**메인 컨테이너보다 먼저, 순서대로, 완료될 때까지** 실행되는 컨테이너다.

```
시간 →
[init-1 실행 → 종료(0)] [init-2 실행 → 종료(0)] [app + sidecar 동시 시작]
     실패 시 재시도            실패 시 재시도
```

특징:
- **순차 실행.** 여러 개면 정의된 순서대로 하나씩.
- **반드시 성공해야** 다음으로 넘어간다. 실패하면 `restartPolicy`에 따라 재시도.
- **완료 후 종료.** 계속 도는 프로세스를 두면 Pod가 영원히 시작되지 않는다.
- 메인 컨테이너와 **다른 이미지**를 쓸 수 있다. 이것이 핵심 이점이다.

`init-demo.yaml`:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: init-demo
spec:
  volumes:
    - name: config
      emptyDir: {}

  initContainers:
    # ① 의존 서비스가 뜰 때까지 대기
    - name: wait-for-db
      image: busybox
      command:
        - sh
        - -c
        - |
          echo "waiting for database..."
          until nc -z -w 2 postgres 5432 2>/dev/null; do
            echo "  still waiting"
            sleep 2
          done
          echo "database is up"

    # ② 설정 파일 생성
    - name: fetch-config
      image: busybox
      command:
        - sh
        - -c
        - |
          echo "generating config"
          cat > /config/app.conf <<EOF
          # generated at $(date)
          mode=production
          EOF
      volumeMounts:
        - name: config
          mountPath: /config

  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "cat /etc/app/app.conf && sleep 3600"]
      volumeMounts:
        - name: config
          mountPath: /etc/app
```

```bash
kubectl apply -f init-demo.yaml
kubectl get pod init-demo -w
```

```
NAME        READY   STATUS            RESTARTS   AGE
init-demo   0/1     Init:0/2          0          2s     ← 첫 init 실행 중
init-demo   0/1     Init:0/2          0          10s    ← DB를 못 찾아 대기
```

`Init:0/2`는 "2개 중 0개 완료"라는 뜻이다. DB가 없으니 첫 번째에서 멈춘다.

**init 컨테이너의 로그도 볼 수 있다.**
```bash
kubectl logs init-demo -c wait-for-db
```

이제 DB 역할의 Service를 만들어 준다.

```bash
kubectl create deployment postgres --image=postgres:16-alpine
kubectl set env deployment/postgres POSTGRES_PASSWORD=demo
kubectl expose deployment postgres --port=5432
```

```bash
kubectl get pod init-demo -w
```
```
init-demo   0/1     Init:1/2           0    45s
init-demo   0/1     PodInitializing    0    47s
init-demo   1/1     Running            0    49s
```

**Init 컨테이너의 대표적 용도**

| 용도 | 설명 |
|---|---|
| 의존성 대기 | DB, 캐시, 다른 서비스가 준비될 때까지 블로킹 |
| 설정 준비 | Git clone, S3 다운로드, 템플릿 렌더링 |
| 스키마 마이그레이션 | DB 마이그레이션 실행 후 앱 시작 |
| 권한 설정 | 볼륨 소유권 변경 (`chown`) |
| 시크릿 주입 | Vault 등에서 시크릿을 받아 파일로 배치 |

**보안 이점**이 크다. `git`이나 `aws-cli` 같은 도구가 init 컨테이너에만 있고 메인 이미지에는 없으므로, 실행 중인 컨테이너의 공격 표면이 줄어든다.

### 사이드카 컨테이너 (재시작 가능한 Init 컨테이너)

전통적으로 사이드카는 `containers`에 나란히 정의했다. 그런데 이 방식에는 오래된 문제가 있었다.

**문제 1**: 사이드카(예: 로그 수집기)가 메인보다 **늦게 시작**하면 초기 로그를 놓친다.
**문제 2**: Job에서 메인이 끝나도 **사이드카가 계속 돌아** Job이 완료되지 않는다.

쿠버네티스 v1.29부터 **`initContainers`에 `restartPolicy: Always`를 주는 방식**으로 정식 사이드카가 도입됐다(v1.33 GA).

```yaml
spec:
  initContainers:
    # 일반 init 컨테이너 — 완료 후 종료
    - name: setup
      image: busybox
      command: ["sh", "-c", "echo setup done"]

    # 사이드카 — 계속 실행되지만 init 단계에서 시작
    - name: log-shipper
      image: fluent/fluent-bit:3.0
      restartPolicy: Always          # ★ 이 한 줄이 사이드카로 만든다
      volumeMounts:
        - name: logs
          mountPath: /logs

  containers:
    - name: app
      image: hello:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app

  volumes:
    - name: logs
      emptyDir: {}
```

이 방식의 이점:

- **메인보다 먼저 시작**한다 → 초기 로그를 놓치지 않는다.
- **메인보다 나중에 종료**된다 → 마지막 로그까지 전송한다.
- **Job에서 메인이 끝나면 자동 종료**된다 → Job이 정상 완료된다.

| 구분 | 일반 Init | 사이드카 (init + Always) | 일반 컨테이너 |
|---|---|---|---|
| 시작 시점 | 메인보다 먼저 | 메인보다 먼저 | 메인과 동시 |
| 실행 방식 | 완료 후 종료 | 계속 실행 | 계속 실행 |
| 종료 시점 | - | 메인 종료 후 | 메인과 함께 |
| Job 완료 방해 | 없음 | 없음 | **있음** ⚠️ |

새로 작성하는 매니페스트에서는 사이드카를 이 방식으로 쓰는 것이 권장된다.

## 5.6 Pod 디자인 패턴

멀티 컨테이너 Pod의 용도는 대략 세 가지 패턴으로 정리된다. 이 분류는 구글의 논문 *Design Patterns for Container-based Distributed Systems* 에서 왔다.

### 사이드카(Sidecar) — 기능 추가

메인 컨테이너의 기능을 **보조**한다. 가장 흔한 패턴이다.

```
┌──────── Pod ────────┐
│  ┌────────┐         │
│  │  app   │──write─→│ [공유 볼륨]
│  └────────┘         │      │
│  ┌────────┐         │      │
│  │사이드카 │←──read──┘      │
│  │(수집기) │────────────────┼──→ 외부 로그 시스템
│  └────────┘         │
└─────────────────────┘
```

**실제 사례**

- **로그 수집**: Fluent Bit가 앱의 로그 파일을 읽어 중앙 시스템으로 전송
- **설정 동기화**: Git 저장소를 폴링해 설정을 갱신 (`git-sync`)
- **시크릿 주입**: Vault Agent가 토큰을 갱신해 파일로 배치
- **서비스 메시**: Envoy 프록시가 모든 트래픽을 가로채 mTLS·재시도·관측 추가 (11장)
- **메트릭 변환**: 앱의 독자 포맷 메트릭을 Prometheus 형식으로 노출

**실습: 로그 수집 사이드카**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sidecar-log
spec:
  volumes:
    - name: logs
      emptyDir: {}

  initContainers:
    - name: log-tailer
      image: busybox
      restartPolicy: Always                 # 사이드카
      command: ["sh", "-c", "sleep 2; tail -F /logs/app.log"]
      volumeMounts:
        - name: logs
          mountPath: /logs

  containers:
    - name: app
      image: busybox
      command:
        - sh
        - -c
        - |
          i=0
          while true; do
            i=$((i+1))
            echo "{\"level\":\"info\",\"seq\":$i,\"msg\":\"request handled\"}" >> /logs/app.log
            sleep 3
          done
      volumeMounts:
        - name: logs
          mountPath: /logs
```

```bash
kubectl apply -f sidecar-log.yaml
kubectl logs sidecar-log -c log-tailer -f
```

앱은 파일에만 쓰고, 사이드카가 그것을 stdout으로 흘려보낸다. **앱 코드를 전혀 수정하지 않고** 로그 파이프라인에 연결한 것이다.

### 앰배서더(Ambassador) — 바깥으로 나가는 연결의 대리인

메인 컨테이너가 **외부 서비스에 접근할 때** 그 복잡성을 감춘다. 앱은 항상 `localhost`만 바라본다.

```
┌──────── Pod ─────────┐
│  ┌────────┐          │
│  │  app   │          │
│  └───┬────┘          │
│      │ localhost:6379│
│  ┌───▼─────┐         │
│  │앰배서더  │─────────┼──→ Redis 클러스터 (샤딩, 페일오버)
│  │(프록시)  │         │
│  └─────────┘         │
└──────────────────────┘
```

**해결하는 문제**: 앱이 Redis 클러스터의 샤딩 규칙, 센티널 페일오버, 연결 풀링을 알아야 한다면 코드가 복잡해진다. 앰배서더가 그것을 대신 처리하면 앱은 `localhost:6379`만 알면 된다.

**실제 사례**

- **DB 프록시**: Cloud SQL Proxy가 IAM 인증과 TLS를 처리
- **연결 풀러**: PgBouncer가 커넥션 풀 관리
- **환경 전환**: 개발에서는 로컬 DB, 프로덕션에서는 클라우드 DB로 앰배서더만 교체

**실습: 앰배서더로 외부 서비스 프록시하기**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ambassador-demo
spec:
  containers:
    # 앱: 항상 localhost:8000만 호출한다
    - name: app
      image: nicolaka/netshoot
      command:
        - sh
        - -c
        - |
          while true; do
            echo "--- $(date '+%H:%M:%S')"
            curl -s localhost:8000/get 2>/dev/null | head -5 || echo "failed"
            sleep 10
          done

    # 앰배서더: 실제 외부 주소를 알고 있다
    - name: ambassador
      image: alpine/socat
      args:
        - TCP-LISTEN:8000,fork,reuseaddr
        - TCP:httpbin.org:80
```

```bash
kubectl apply -f ambassador-demo.yaml
kubectl logs ambassador-demo -c app -f
```

앱은 외부 주소를 전혀 모른다. 대상이 바뀌면 앰배서더 설정만 고치면 된다.

### 어댑터(Adapter) — 밖에서 보는 인터페이스의 통역사

**외부에 노출되는 형식**을 표준화한다. 앰배서더가 나가는 방향이라면, 어댑터는 들어오는 방향이다.

```
                       ┌──────── Pod ────────┐
                       │  ┌────────┐         │
                       │  │  app   │         │
                       │  └───┬────┘         │
                       │      │ 독자 포맷      │
   Prometheus ←────────┼──┌───▼────┐         │
   (표준 형식)          │  │ 어댑터  │         │
                       │  └────────┘         │
                       └─────────────────────┘
```

**해결하는 문제**: 레거시 앱이 메트릭을 자기만의 형식으로 노출한다. 앱을 수정할 수 없다. 어댑터가 그것을 Prometheus 형식으로 변환해 준다.

**실제 사례**

- **메트릭 익스포터**: `redis_exporter`, `mysqld_exporter`, `nginx-prometheus-exporter`
- **로그 포맷 변환**: 비정형 로그를 JSON으로 파싱
- **헬스체크 어댑터**: 앱의 독자적 상태 확인 방식을 HTTP 엔드포인트로 변환

**실습: 메트릭 어댑터**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: adapter-demo
  labels:
    app: adapter-demo
spec:
  volumes:
    - name: metrics
      emptyDir: {}

  containers:
    # 레거시 앱: 자기만의 형식으로 파일에 기록
    - name: legacy-app
      image: busybox
      command:
        - sh
        - -c
        - |
          while true; do
            echo "requests=$((RANDOM % 1000)) errors=$((RANDOM % 10))" > /metrics/raw.txt
            sleep 5
          done
      volumeMounts:
        - name: metrics
          mountPath: /metrics

    # 어댑터: Prometheus 형식으로 변환해 HTTP로 노출
    - name: adapter
      image: python:3.12-alpine
      command:
        - sh
        - -c
        - |
          cat > /tmp/adapter.py <<'PY'
          from http.server import BaseHTTPRequestHandler, HTTPServer
          import re
          class H(BaseHTTPRequestHandler):
              def do_GET(self):
                  try:
                      raw = open('/metrics/raw.txt').read().strip()
                  except FileNotFoundError:
                      raw = ''
                  out = []
                  for k, v in re.findall(r'(\w+)=(\d+)', raw):
                      out.append(f'# TYPE app_{k} gauge')
                      out.append(f'app_{k} {v}')
                  body = ('\n'.join(out) + '\n').encode()
                  self.send_response(200)
                  self.send_header('Content-Type', 'text/plain')
                  self.end_headers()
                  self.wfile.write(body)
              def log_message(self, *a): pass
          HTTPServer(('', 9090), H).serve_forever()
          PY
          python3 /tmp/adapter.py
      ports:
        - name: metrics
          containerPort: 9090
      volumeMounts:
        - name: metrics
          mountPath: /metrics
```

```bash
kubectl apply -f adapter-demo.yaml
kubectl wait --for=condition=Ready pod/adapter-demo
kubectl exec adapter-demo -c adapter -- wget -qO- localhost:9090
```

```
# TYPE app_requests gauge
app_requests 427
# TYPE app_errors gauge
app_errors 3
```

레거시 앱을 한 줄도 고치지 않고 Prometheus 생태계에 편입시켰다. 31장에서 이 Pod에 `ServiceMonitor`를 붙여 실제로 수집한다.

### 패턴 선택 가이드

| 질문 | 답 |
|---|---|
| 메인 컨테이너에 **기능을 더하고** 싶다 | 사이드카 |
| 메인이 **외부로 나가는 연결**을 단순화하고 싶다 | 앰배서더 |
| 메인이 **외부에 보이는 형식**을 바꾸고 싶다 | 어댑터 |

> **⚠️ 언제 멀티 컨테이너를 쓰지 말아야 하는가**
> "두 서비스가 서로 호출한다"는 이유만으로 한 Pod에 넣으면 안 된다. 그 둘은 별도 Pod + Service여야 한다. 판단 기준은 이것이다.
>
> **"이 둘이 항상 1:1로, 같은 개수만큼, 함께 스케일되어야 하는가?"**
>
> 아니라면 별도 Pod다. 웹 서버와 DB를 한 Pod에 넣으면 웹 서버를 5개로 늘릴 때 DB도 5개가 된다.

## 5.7 Pod 삭제

```bash
kubectl delete pod hello
kubectl delete pod -l app=hello
kubectl delete pods --all -n test-ns
```

삭제 시 일어나는 일은 이렇다.

```
① API 서버가 deletionTimestamp 설정 → Pod는 Terminating 상태
② 동시에:
   - Endpoints에서 제거 (더 이상 새 트래픽이 오지 않음)
   - kubelet이 preStop 훅 실행
③ 컨테이너에 SIGTERM 전송
④ terminationGracePeriodSeconds(기본 30초) 대기
⑤ 아직 살아 있으면 SIGKILL
```

**강제 삭제는 신중하게.**

```bash
kubectl delete pod hello --grace-period=0 --force
```

이 명령은 kubelet의 정리를 기다리지 않고 **API 서버에서 레코드만 지운다.** 노드에 컨테이너가 남아 있을 수 있다. StatefulSet에서 쓰면 같은 ID의 Pod가 두 개 실행되는 스플릿 브레인이 발생할 수 있다(8.3절). 노드가 완전히 죽어 복구 불가능할 때만 쓴다.

6장에서 종료 과정과 graceful shutdown을 훨씬 자세히 다룬다.

---

## 실습 과제

**과제 1 — PID 네임스페이스 공유 실험**
`shareProcessNamespace: true`를 준 Pod와 주지 않은 Pod를 각각 만들고, 한쪽 컨테이너에서 `ps aux`를 실행해 차이를 확인한다. 공유했을 때 PID 1이 무엇인지 확인하고, 왜 그런지 설명해 본다(힌트: 5.1절의 pause 컨테이너).

**과제 2 — Init 컨테이너로 마이그레이션 구현**
Init 컨테이너에서 "DB 마이그레이션"을 흉내 내는 스크립트를 실행하고(파일에 버전 기록), 메인 컨테이너가 그 파일을 읽어 시작하도록 만든다. Init이 실패하도록 만든 뒤 `kubectl get pod`의 STATUS와 RESTARTS가 어떻게 변하는지 관찰한다.

**과제 3 — 세 패턴 조합**
하나의 Pod에 다음을 모두 넣어 본다.
- 메인 앱 (로그 파일에 기록)
- 사이드카 (로그를 stdout으로 전달)
- 어댑터 (앱 상태를 Prometheus 형식으로 노출)

컨테이너가 셋이 되면 `kubectl logs`에 `-c`가 필수가 되는 것을 확인하고, `kubectl get pod`의 READY 열이 `3/3`이 되는 것을 본다.

**과제 4 — kubectl debug 익히기**
distroless 이미지(`gcr.io/distroless/static-debian12`)로 Pod를 만들고 `kubectl exec`이 실패하는 것을 확인한 뒤, `kubectl debug`로 접속해 본다.
```bash
kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container>
```
`--target`을 뺐을 때와 비교해 `ps`의 출력이 어떻게 다른지 확인한다.

---

## 요약

- Pod는 **NET·IPC·UTS를 공유하고 MNT·PID는 분리된 컨테이너 그룹**이다. 그래서 같은 IP를 쓰고 `localhost`로 통신하지만, 파일은 볼륨으로만 공유된다.
- **pause 컨테이너**가 네임스페이스를 소유하기 때문에 메인 컨테이너가 재시작해도 Pod IP가 유지된다.
- Pod는 **일회용**이다. IP에 의존하지 말고(→ Service), 로컬 파일에 데이터를 두지 말고(→ 볼륨), 직접 만들지 말 것(→ 컨트롤러).
- `kubectl logs --previous`는 크래시 원인 추적의 핵심이고, `kubectl debug`는 셸 없는 이미지를 디버깅하는 표준 방법이다.
- **Init 컨테이너**는 순서대로 완료될 때까지 실행되며, 의존성 대기·설정 준비·마이그레이션에 쓴다. `restartPolicy: Always`를 주면 **사이드카**가 되어 메인보다 먼저 시작하고 나중에 종료된다.
- 멀티 컨테이너 패턴은 **사이드카**(기능 추가), **앰배서더**(나가는 연결 대리), **어댑터**(보이는 형식 변환) 셋으로 정리된다. 함께 스케일될 필요가 없다면 별도 Pod여야 한다.

**다음 장에서는** Pod가 시작해서 종료되기까지의 전 과정을 추적한다. 프로브 세 종류를 어떻게 설계해야 롤아웃이 안전한지, 그리고 종료 시 요청을 흘리지 않으려면 무엇을 해야 하는지 다룬다.

---

**참고 원서**: *Kubernetes in Action, 2nd Ed.* 5장 / *Core Kubernetes* 2장 / *The Kubernetes Bible* 4장, 5장
