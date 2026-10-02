---
title: "23장. kubelet과 CRI"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 23
---

# 23장. kubelet과 CRI

> **🎮 게임 서버 개발자에게** — 앞 장들의 컨트롤 플레인은 "무엇을 해야 하는가"를 정하는 쪽이었다. 그 결정은 결국 Pod의 `spec.nodeName` 필드 하나로 남는다. 그 필드를 보고 **실제 프로세스·cgroup·네트워크 인터페이스로 바꾸는 노드 위의 에이전트**가 kubelet이다. 이벤트 루프 하나가 여러 입력 채널을 `select`로 기다리고, 세션(Pod)마다 직렬 처리 큐를 두고, 주기적으로 하트비트를 보내고, 하트비트가 끊기면 세션을 정리하는 구조는 게임 서버를 만들어 본 사람에게 낯설지 않다. 새로운 점은 kubelet이 **직접 컨테이너를 만들지 않고 CRI라는 gRPC 경계 뒤의 런타임에 위임**한다는 것, 그리고 하트비트가 끊긴 노드의 프로세스를 컨트롤 플레인이 **죽일 수 없다**는 것이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - Pod가 `ContainerCreating`에서 멈췄는데, kubelet 로그에는 단서가 없고 containerd 로그에 CNI 에러가 있다.
> - 노드 하나의 네트워크가 끊겼는데 그 노드의 게임 서버 Pod가 5분 가까이 그대로 "Running"으로 남아 있다.
> - API 서버가 죽은 상태에서 `kubectl`이 안 되는데, 노드에서 컨테이너 상태를 확인해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** kubelet은 API 서버를 watch하며 스스로 판단해 Pod를 구현하는 노드 에이전트이고, 컨테이너 생성은 CRI로 런타임에 위임하며(CNI 호출도 런타임이 한다), 노드 생사는 Lease 하트비트와 테인트·톨러레이션 타이머로 판정된다.

1. **kubelet = 노드의 이벤트 루프 + Pod당 워커** — API 서버가 명령하지 않고 kubelet이 watch하며 `syncLoop`로 받아 Pod마다 고루틴 하나(Pod Worker)에 디스패치한다. 컨테이너가 아니라 노드의 systemd 서비스로 돈다.
2. **CRI = kubelet과 런타임 사이의 gRPC 경계** — `RunPodSandbox`/`CreateContainer`/`PullImage` 등을 호출하고, CNI 플러그인은 kubelet이 아니라 **런타임이 `RunPodSandbox` 안에서** 호출한다.
3. **static Pod = API 서버 없이 kubelet이 로컬 파일로 만드는 Pod** — 컨트롤 플레인 자신을 부트스트랩하는 수단이고, `kubectl`에 보이는 것은 읽기 전용 미러 Pod다.
4. **노드 생사 = Lease(10초) + 40초 + 톨러레이션 300초** — 하트비트가 끊기면 테인트가 붙고 기본 5분 뒤 Pod 오브젝트가 삭제되지만, 응답 불능 노드의 실제 프로세스 종료는 보장되지 않는다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `epoll_wait` 루프 하나가 소켓·타이머·시그널 이벤트를 받아 디스패치 | kubelet `syncLoop` | 여러 채널(Pod 변경, 컨테이너 상태 변화, 프로브 결과, 주기 틱)을 한 루프가 기다린다 | 원문은 Go의 `select`로 설명한다. kubelet의 "워크큐"는 Pod마다 배정된 전용 고루틴이다 |
| 세션(플레이어)마다 strand를 두어 같은 세션의 처리를 직렬화 | Pod Worker (Pod당 1개) | 같은 대상의 sync는 직렬이라 경쟁 조건이 없고, 서로 다른 대상은 병렬이다 | 직렬화 단위가 연결이 아니라 Pod다. Pod가 삭제되면 워커도 정리된다 |
| 워커가 매니저 데몬에게 "프로세스 하나 띄워 줘"라고 IPC로 요청 (예: 자식 프로세스 관리자) | CRI (kubelet → containerd) | 요청자와 실행자가 인터페이스로 분리돼 구현을 바꿀 수 있다 | 인터페이스가 gRPC로 표준화돼 있고, 요청 하나(`RunPodSandbox`) 안에서 런타임이 CNI까지 호출한다 |
| 클라이언트 keepalive/하트비트, N초 무응답이면 세션 정리 | Lease 갱신과 `node-monitor-grace-period` | 주기 신호가 끊기면 장애로 판정한다 | 즉시 정리하지 않고 테인트 + 톨러레이션 타이머(기본 300초)를 거친다. 또한 연결이 끊긴 노드 위의 프로세스는 **살아 있을 수 있다** |
| 폴링(`select`로 주기 조회) vs 이벤트 통지(`epoll`) | PLEG relist vs Evented PLEG | 주기 전수 조회는 대상이 많을수록 비싸고, 이벤트 푸시가 부하를 줄인다 | Evented PLEG는 원문 기준 베타이고 기본 비활성이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. kubelet은 왜 컨테이너가 아니라 노드의 systemd 서비스로 돌아야 할까?
> 2. Pod의 네트워크 설정(CNI)은 누가 호출할까? kubelet일까, 런타임일까?
> 3. API 서버가 잠시 죽으면 이미 떠 있는 노드의 Pod들은 어떻게 될까?
> 4. 노드가 갑자기 응답이 없어지면 그 노드의 Pod는 언제, 누가 지울까?
>
> **처리법:** 🛠 실습 `crictl pods`, `crictl ps -a`, `ls /etc/kubernetes/manifests/`, `kubectl get lease -n kube-node-lease` → 바로 실행 · 🗺 관계도 컨트롤 플레인(nodeName 확정) → kubelet → CRI → containerd → shim → runc, 하트비트 끊김 → 테인트 → 톨러레이션 만료 → 축출 · 📦 카드로 수치(Lease 10초 / status 5분 / grace 40초 / toleration 300초 / 포트 10250 / `maxPods` 110)

### 이 장에서 배우는 것

- kubelet이 Pod를 받아 컨테이너로 만들기까지의 경로(`syncLoop` → Pod Worker → `syncPod`)
- CRI의 구조와 "CNI는 런타임이 호출한다"는 경계
- static Pod와 미러 Pod가 컨트롤 플레인 부트스트랩 문제를 푸는 방식
- 노드 하트비트가 끊긴 뒤 축출까지 이어지는 파이프라인과 kubelet 자체의 자원 압박 축출

---

## 코어 1. kubelet = 노드의 이벤트 루프 + Pod당 워커

### 1.1 kubelet의 위치와 책임

**한 줄 요약:** kubelet은 "이 노드에 있어야 할 Pod"를 스스로 판단해 구현하는 에이전트이며, 컨테이너가 아니라 systemd 서비스다.

원문의 `ps aux` 예시를 보면 노드에서 `containerd`와 `kubelet`이 프로세스로 돈다. kubelet은 **컨테이너가 아니라 노드의 systemd 서비스**다. 원문의 이유는 순환 의존을 피하기 위해서다. kubelet이 컨테이너라면 그것을 띄울 무언가가 필요한데, 그 일을 하는 것이 kubelet이다.

원문은 kubelet의 책임을 아홉 가지로 나열한다.

| # | 책임 | 구현 방식 |
|---|---|---|
| ① | Pod 소스 감시 | API 서버 watch, static Pod 파일, HTTP 엔드포인트 |
| ② | 컨테이너 생명주기 | CRI로 생성/시작/중지/삭제 |
| ③ | 볼륨 관리 | CSI로 마운트/언마운트 |
| ④ | 네트워크 | CRI로(샌드박스 설정 시) CNI 호출을 유발 |
| ⑤ | 프로브 실행 | liveness/readiness/startup |
| ⑥ | 상태 보고 | Pod status, 노드 status를 API 서버로 |
| ⑦ | 자원 관리 | cgroup 계층 관리, 축출 |
| ⑧ | 이미지 관리 | pull, 가비지 컬렉션 |
| ⑨ | 로그·exec·port-forward 제공 | `kubectl logs/exec/port-forward`의 실제 처리 |

**API 서버는 kubelet에게 명령하지 않는다.** kubelet이 API 서버를 watch하며 스스로 판단한다(풀 모델). 그래서 API 서버가 잠시 죽어도 노드의 Pod들은 계속 동작한다. 게임 서버로 치면 "중앙 매니저가 각 노드에 push 명령을 보내는" 구조가 아니라, 각 노드 데몬이 자기 담당 목록을 구독하는 구조다.

kubelet 설정 파일(`/var/lib/kubelet/config.yaml`)의 주요 항목은 이렇다.

```yaml
syncFrequency: 1m                    # 전체 동기화
fileCheckFrequency: 20s              # static Pod 디렉터리 확인
nodeStatusUpdateFrequency: 10s       # 노드 상태 보고 (Lease)
nodeStatusReportFrequency: 5m
maxPods: 110
cgroupDriver: systemd                # 또는 cgroupfs
evictionHard:
  memory.available: "100Mi"
```

> **⚠️ `cgroupDriver` 불일치는 흔한 장애 원인이다** — kubelet과 컨테이너 런타임이 **같은 드라이버**를 써야 한다. 다르면 cgroup 계층이 두 벌 생겨 자원 제한이 제대로 동작하지 않는다. systemd 배포판에서는 양쪽 모두 `systemd`로 맞추고, containerd는 `SystemdCgroup = true`를 쓴다. cgroup 자체는 [10장](../2부-컨테이너-커널-기능과-Docker/10-cgroup.md)에서 다룬다.

### 1.2 syncLoop와 Pod Worker

**한 줄 요약:** 세 소스의 Pod 목록을 병합한 `syncLoop`가 이벤트를 받아 Pod마다 하나의 워커에 넘기고, 같은 Pod의 sync는 항상 직렬이다.

```
┌── Pod 소스 ─────────────────────────────────┐
│ ① API 서버 watch (spec.nodeName == 이 노드)   │
│ ② static Pod 디렉터리                         │
│ ③ HTTP 엔드포인트 (레거시, 거의 안 씀)          │
└──────────────────┬───────────────────────────┘
                   ▼  PodConfig가 병합
            ┌─────────────┐
            │  syncLoop   │  ← kubelet 메인 이벤트 루프
            └──────┬──────┘
                   │ Pod마다 하나씩 디스패치
                   ▼
        ┌─────────────────────┐
        │ Pod Worker (Pod당 1개)│  ← 고루틴, 같은 Pod의 sync는 항상 직렬
        │   syncPod()           │
        └─────────────────────┘
```

원문이 제시하는 개념적 구조는 `select`로 여러 채널을 동시에 기다리는 루프다. 채널은 Pod 추가/수정/삭제(`configCh`), 컨테이너 상태 변화(`plegCh`), 주기적 전체 재동기화(`syncCh`, 기본 1초), 프로브 결과 3종(`livenessCh`/`readinessCh`/`startupCh`), 정리 작업(`housekeepingCh`, 기본 2초)이다.

[22장](22-컨트롤러-매니저.md)에서 본 "Informer → 이벤트 → 워크큐 → 조정" 패턴이 여기서도 반복된다. 다른 점은 워크큐 대신 **Pod마다 전용 고루틴**이 있다는 것이다. 같은 Pod에 대한 동기화는 순차적이라 경쟁 조건이 없고, 서로 다른 Pod는 병렬로 처리된다.

### 1.3 PLEG, 프로브 매니저, 상태 매니저

**한 줄 요약:** 컨테이너 상태 변화는 PLEG가 런타임을 폴링해 감지하고, 프로브와 상태 보고는 syncLoop와 독립된 매니저가 맡는다.

- **PLEG(Pod Lifecycle Event Generator)** — 기본(relisting) 방식은 1초마다 런타임에 "살아 있는 모든 컨테이너 목록"을 요청해 이전 스냅숏과 diff하고, 바뀐 컨테이너에 이벤트를 만든다. 컨테이너가 수백 개인 노드에서는 이 전수 조사가 무거워진다. relist가 밀려 임계치(원문 예시 3분)를 넘으면 다음 메시지가 나온다.

  ```
  PLEG is not healthy: pleg was last seen active 3m5s ago; threshold is 3m0s
  ```

  이 메시지가 보이면 노드가 곧 `NotReady`로 전환된다. 원인은 대개 런타임 응답 지연(디스크 I/O 포화, 컨테이너 과다)이다. **Evented PLEG**는 런타임이 상태 변화를 이벤트로 푸시하게 하는 방식이지만, 원문 기준 v1.27부터 베타이고 **기본은 비활성화**(`EventedPLEG` 기능 게이트)다.
- **프로브 매니저** — liveness/readiness/startup을 컨테이너마다 별도 고루틴이 자체 주기(`periodSeconds`)로 실행하고, 결과가 **바뀔 때만** syncLoop에 알린다. readiness 실패는 재시작이 아니라 EndpointSlice에서 빠지는 것이고, liveness 실패는 재시작을 유발한다. 프로브 설계는 [25장](25-Pod-생명주기와-리소스.md)에서 다룬다.
- **상태 매니저** — Pod Worker가 만든 최신 `PodStatus`를 로컬 캐시에 쌓고, 별도 루프가 **바뀐 것이 있을 때만 배치로** API 서버에 반영한다. 불필요한 `resourceVersion` 갱신과 watch 이벤트 폭주를 막는 원칙이다.

### 1.4 Pod가 만들어지는 10단계

**한 줄 요약:** watch로 받은 Pod는 cgroup → 볼륨 → 이미지 → 샌드박스(CNI) → init → 앱 컨테이너 → 프로브 → 상태 보고 순으로 구현된다.

원문(20.3절)이 정리한 `syncPod`의 경로는 다음과 같다.

```
① API 서버 watch로 새 Pod 감지 (spec.nodeName == 이 노드)
② Pod Worker에 디스패치
③ cgroup 계층 생성
   /sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod<UID>.slice/
   → QoS 클래스에 따라 위치가 결정된다
④ Volume Manager가 볼륨 마운트 (CSI NodeStageVolume → NodePublishVolume), 완료까지 대기
⑤ 이미지 존재 확인 / pull (imagePullPolicy, imagePullSecrets)
⑥ 샌드박스(pause 컨테이너) 생성: CRI RunPodSandbox
   → 런타임이 네트워크 네임스페이스 생성 → CNI ADD → veth 생성, IP 할당
⑦ init 컨테이너를 순서대로 실행 (각각 exit 0을 기다림)
⑧ 앱 컨테이너들을 동시에 시작, postStart 훅
⑨ 프로브 시작: startup → (통과 후) liveness + readiness
⑩ status를 API 서버에 보고 (phase, conditions, containerStatuses)
```

이 순서는 [17장](../2부-컨테이너-커널-기능과-Docker/17-컨테이너를-손으로-만들기.md)에서 손으로 하던 것(네임스페이스·cgroup·veth)을 kubelet이 자동으로 하는 것에 해당한다. [24장](24-오브젝트-모델과-워크로드.md)의 pause 컨테이너가 ⑥에서 네임스페이스를 소유한다.

---

## 코어 2. CRI = kubelet과 런타임 사이의 gRPC 경계

### 2.1 RuntimeService와 ImageService

**한 줄 요약:** CRI는 두 개의 gRPC 서비스이며, kubelet이 보는 컨테이너 세계의 전부다.

```protobuf
service RuntimeService {
  rpc RunPodSandbox(...)      // pause 컨테이너 생성 + 이 안에서 CNI 호출
  rpc StopPodSandbox(...)
  rpc RemovePodSandbox(...)
  rpc CreateContainer(...)
  rpc StartContainer(...)
  rpc StopContainer(...)
  rpc RemoveContainer(...)
  rpc ListContainers(...)
  rpc ExecSync(...)           // 프로브가 쓰는 exec
  rpc Exec(...)               // kubectl exec
  rpc Attach(...)
  rpc PortForward(...)
  rpc ContainerStats(...)
}
service ImageService {
  rpc ListImages(...)
  rpc PullImage(...)
  rpc RemoveImage(...)
  rpc ImageFsInfo(...)
}
```

샌드박스는 Pod의 네트워크 네임스페이스를 쥐고 있는 단위(pause 컨테이너)다. 런타임 엔드포인트는 `unix:///run/containerd/containerd.sock`이다.

### 2.2 CNI는 kubelet이 아니라 런타임이 호출한다

**한 줄 요약:** `RunPodSandbox` 한 번 안에서 런타임이 CNI 플러그인을 실행한다.

원문이 강조하는 경계다. CNI 설정 파일(`/etc/cni/net.d/`)을 읽는 주체는 containerd/CRI-O이지 kubelet이 아니다. 그래서 CNI 실패는 kubelet 로그가 아니라 **containerd 로그에 먼저** 나타난다(`journalctl -u containerd | grep -i cni`). 이 호출 체인과 설정 파일 선택 규칙은 [26장](26-쿠버네티스-네트워크-모델과-CNI.md)에서 자세히 본다.

### 2.3 containerd, CRI-O, shim, dockershim

**한 줄 요약:** shim이 컨테이너의 부모로 남아 있어서 containerd가 재시작돼도 컨테이너는 살아남는다.

```
                  gRPC(CRI)
kubelet ────────────────────────▶ containerd (또는 CRI-O)
                                        │ 컨테이너마다 프로세스 하나
                                        ▼
                              containerd-shim-runc-v2
                                        │ (OCI 런타임 spec으로)
                                        ▼
                                      runc  →  실제 컨테이너 프로세스
```

- containerd와 CRI-O는 모두 CRI를 구현하므로 kubelet은 같은 gRPC 호출로 둘 다 다룬다.
- **shim**: containerd 데몬이 죽거나 업그레이드로 재시작돼도 이미 뜬 컨테이너는 shim이 부모로서 감독하므로 살아남는다. 컨테이너 수만큼 `containerd-shim-runc-v2` 프로세스가 `ps aux`에 보인다. OCI 런타임 계층은 [12장](../2부-컨테이너-커널-기능과-Docker/12-OCI-표준과-런타임.md), Docker 쪽 대응은 [13장](../2부-컨테이너-커널-기능과-Docker/13-Docker-아키텍처.md)을 본다.
- **dockershim 제거**: 과거 kubelet은 Docker용 어댑터를 자기 코드베이스에 내장했다. v1.24에서 제거돼 CRI를 구현한 런타임만 kubelet과 통신한다. 이미지는 OCI 규격이라 영향이 없다. 사라진 것은 어댑터이지 이미지 호환성이 아니다.

### 2.4 CSI·Device Plugin과 crictl

**한 줄 요약:** 볼륨과 특수 하드웨어도 표준 인터페이스로 위임하고, `crictl`은 kubelet과 같은 CRI 소켓으로 노드를 들여다보는 진단 도구다.

- **볼륨 매니저**는 desired(Pod spec에서 파생)와 actual(실제 마운트) 볼륨 집합을 비교하는 자체 조정 루프이고, CSI를 쓰면 `NodeStageVolume`/`NodePublishVolume` 호출로 이어진다. 컨테이너는 마운트가 끝날 때까지 시작되지 않는다. 상세는 [29장](29-스토리지.md).
- **Device Plugin**은 GPU 같은 자원을 DaemonSet이 kubelet 소켓(`/var/lib/kubelet/device-plugins/kubelet.sock`)에 등록하고 `ListAndWatch`로 노드 `capacity`에 반영, 스케줄된 Pod에는 `Allocate`로 디바이스를 주입한다. **확장 자원은 정수만 가능하고 `requests == limits`** 여야 한다(GPU 0.5개 불가).
- **`crictl`**: `crictl pods`, `crictl ps -a`, `crictl inspect`, `crictl logs`는 kubelet이 보는 것과 정확히 같은 뷰다. API 서버가 죽었을 때 유일한 진단 수단이 된다.

> **⚠️ `crictl`로 컨테이너를 지우지 않는다.** kubelet이 즉시 다시 만들고(조정 루프), 내부 상태와 어긋나 혼란을 줄 수 있다. 진단용으로만 쓴다.

---

## 코어 3. static Pod = API 서버 없이 kubelet이 만드는 Pod

### 3.1 순환 의존 문제와 해법

**한 줄 요약:** API 서버가 Pod로 돈다면 그 Pod는 누가 만드는가 — kubelet이 로컬 디렉터리의 매니페스트를 직접 읽는다.

컨트롤 플레인 컴포넌트는 `kube-system`에 Pod로 떠 있다. 그런데 Pod를 만들려면 API 서버가 필요하고, API 서버가 아직 없다. **static Pod가 이 순환을 끊는다.**

```bash
ls /etc/kubernetes/manifests/
# etcd.yaml  kube-apiserver.yaml  kube-controller-manager.yaml  kube-scheduler.yaml
```

kubelet 설정은 `staticPodPath: /etc/kubernetes/manifests`, `fileCheckFrequency: 20s`다.

| | 일반 Pod | static Pod |
|---|---|---|
| 생성 경로 | 컨트롤러 → API 서버 → 스케줄러 → kubelet | **kubelet이 로컬 파일에서 직접** |
| 스케줄링 | 스케줄러가 노드 결정 | 매니페스트가 있는 노드에 고정 |
| 이름 | 랜덤 접미사 | `<name>-<노드이름>` |
| 삭제 방법 | `kubectl delete` | **파일을 지워야 함** |
| API 서버 의존 | 필요 | 불필요 |

C++ 서버로 비유하면, 서비스 디스커버리 서버를 띄우기 위해 디스커버리 서버가 필요한 상황을 **설정 파일로 직접 기동**하는 것과 비슷하다.

### 3.2 미러 Pod — 읽기 전용 창

**한 줄 요약:** `kubectl`에 보이는 static Pod는 실체가 아니라 소유자가 `Node`인 읽기 전용 사본이다.

kubelet은 static Pod를 만든 뒤 API 서버에 읽기 전용 사본(미러 Pod)을 등록한다. `ownerReferences`의 소유자가 `Node`이고, 일반 Pod는 ReplicaSet 등이 소유한다([24장](24-오브젝트-모델과-워크로드.md)). 미러 Pod를 `kubectl delete`로 지워도 파일이 그대로면 즉시 다시 등록된다. 실제 삭제는 매니페스트 파일을 지워야 한다.

### 3.3 컨트롤 플레인 수정과 주의

**한 줄 요약:** API 서버 플래그를 바꾸는 표준 방법은 매니페스트 편집이고, 오타 하나가 `kubectl` 접근 불능을 만든다.

kubelet이 `fileCheckFrequency` 주기로 변경을 감지해 해당 static Pod를 재생성한다. 이것이 컨트롤 플레인 컴포넌트에 플래그를 추가하는 표준 방법이다.

> **⚠️ 반드시 백업하고 노드 콘솔 접근 수단을 확보한 뒤 수정한다.** YAML 오류로 API 서버가 뜨지 않으면 `kubectl`로는 아무것도 할 수 없다.

---

## 코어 4. 노드 생사 = Lease + 40초 + 톨러레이션 300초

### 4.1 이중 하트비트

**한 줄 요약:** 작은 Lease는 10초마다, 큰 status는 5분마다 또는 변화 시 갱신한다.

```
Lease 갱신   : 10초마다 (nodeStatusUpdateFrequency) — 작은 오브젝트
status 갱신  : 5분마다 또는 실제 변화 시 (nodeStatusReportFrequency) — 큰 오브젝트
```

`Node.status`에는 conditions, capacity, images 목록 등이 들어 있어 크다. 노드 수천 개가 10초마다 전부 갱신하면 etcd 쓰기 부하가 감당되지 않으므로 필드 몇 개뿐인 Lease(`kube-node-lease` 네임스페이스)를 자주 갱신한다. 리더 선출에 쓰이는 Lease와 **같은 API 오브젝트, 다른 용도**다. 게임 서버의 "가벼운 핑 + 가끔 보내는 전체 상태 리포트" 분리와 같은 발상이다.

### 4.2 node-lifecycle-controller의 감지

**한 줄 요약:** Lease가 40초 끊기면 테인트가 붙고, 모든 Pod가 기본으로 가진 300초 톨러레이션이 흐른 뒤 축출된다.

```
정상: Lease.renewTime이 10초마다 갱신됨
  │ node-monitor-grace-period(기본 40초) 동안 갱신 없음
  ▼
① 노드 컨디션을 Unknown으로 전환
② 테인트 부착: node.kubernetes.io/not-ready:NoExecute 또는 unreachable:NoExecute
③ 이 노드의 Pod들에 이미 걸려 있던 tolerationSeconds(기본 300초)가 흐르기 시작
  ▼
④ tolerationSeconds가 지나면 Pod 축출 시작
```

모든 Pod는 `DefaultTolerationSeconds` 어드미션 플러그인이 `not-ready`/`unreachable`에 대해 `tolerationSeconds: 300`을 자동 부여한다. 즉 응답 없는 노드의 Pod도 **기본 5분은 그대로 유지**된다. 짧은 순단으로 불필요한 재기동을 막는 유예다. 테인트의 일반 개념은 [21장](21-kube-scheduler.md)에서 다룬다.

### 4.3 우아한 축출 vs 강제 축출

**한 줄 요약:** 노드가 응답 불능이면 컨트롤 플레인은 API 오브젝트를 지울 뿐 프로세스를 종료시키지 못한다.

```
우아한 축출 (노드가 살아있음):
  kubelet이 Pod에 SIGTERM → terminationGracePeriodSeconds 대기 → SIGKILL
  → kubelet이 API 서버에서 Pod 오브젝트 삭제

강제 축출 (노드가 응답 불능):
  node-lifecycle-controller가 API 서버에서 직접 Pod 오브젝트를 삭제
  → 실제 프로세스가 살아 있는지 확인할 방법이 없음
```

노드가 살아 있지만 네트워크만 끊긴 상황(split-brain 가능성)에서는 kubelet과 API 서버가 서로 닿지 않는다. 실제 컨테이너 종료는 네트워크가 복구된 뒤 kubelet이 "더 이상 내가 담당할 Pod가 아니다"를 확인하고서야 일어난다. StatefulSet처럼 "동시에 둘이 뜨면 안 되는" 워크로드에는 스토리지 수준 펜싱 같은 안전장치가 필요할 수 있다고 원문은 말한다. 게임 서버로 치면 **유령 인스턴스가 같은 DB를 계속 쓰는 상황**이다.

### 4.4 kubelet 자체의 자원 압박 축출

**한 줄 요약:** 노드 자원이 임계치 아래로 내려가면 kubelet이 BestEffort부터 한 번에 하나씩 축출한다.

원문(20.6절)의 흐름이다.

```
① 10초마다 신호 확인 (memory.available, nodefs.available, ...)
② 임계값 초과 → 노드 컨디션 설정 (MemoryPressure=True) → 스케줄러가 새 BestEffort Pod를 보내지 않음
③ 회수 시도: imagefs 부족이면 미사용 이미지 삭제, nodefs 부족이면 죽은 컨테이너/로그 정리
④ 그래도 부족하면 Pod 축출: BestEffort → Burstable(requests 초과 큰 순) → Guaranteed,
   같은 등급 안에서는 Priority가 낮은 순
⑤ 한 번에 하나씩 축출하고 다시 측정, 임계 아래로 내려오면 중단
   (evictionPressureTransitionPeriod 5분 후 컨디션 해제)
```

축출된 Pod 오브젝트는 남는다(`status.phase=Failed`, reason `Evicted`). QoS 클래스와 requests/limits는 [25장](25-Pod-생명주기와-리소스.md)에서 다룬다.

### 4.5 kubelet API(10250) 보안

**한 줄 요약:** kubelet 포트 10250이 익명 접근에 열려 있으면 모든 컨테이너에서 명령을 실행할 수 있다.

필수 설정은 `authentication.anonymous.enabled: false`, `authorization.mode: Webhook`이고, API 서버는 `--authorization-mode=Node,RBAC`와 NodeRestriction으로 침해된 kubelet의 권한을 줄인다(자기 노드 Pod/Secret만 조회, 다른 노드 Node 수정 불가). 원문은 `anonymous: true` + `AlwaysAllow` 조합이 과거 침해 사고의 원인이었다고 경고한다. 인증·인가 체인은 [19장](19-kube-apiserver.md)과 [30장](30-설정-보안.md)에서 이어진다.

---

## 실무 적용

### 체크리스트

- [ ] kubelet은 컨테이너가 아니라 노드의 systemd 서비스이고, API 서버를 watch하는 풀 모델이라 API 서버가 잠시 죽어도 기존 Pod는 유지된다.
- [ ] `syncLoop`는 Pod마다 워커 하나에 디스패치하며, 같은 Pod의 sync는 직렬이다.
- [ ] `PLEG is not healthy`가 보이면 노드가 곧 `NotReady`가 되고, 원인은 대개 런타임 응답 지연이다.
- [ ] CNI는 kubelet이 아니라 런타임이 `RunPodSandbox` 안에서 호출한다. `ContainerCreating`이 길면 containerd 로그와 `/etc/cni/net.d/`를 본다.
- [ ] kubelet과 런타임의 `cgroupDriver`가 같은가(둘 다 `systemd` 권장)?
- [ ] API 서버 없이 노드 상태를 보려면 `crictl pods`, `crictl ps -a`를 쓴다. `crictl`로 컨테이너를 삭제하지 않는다.
- [ ] static Pod는 `kubectl delete`가 아니라 매니페스트 파일 삭제로 지운다. 컨트롤 플레인 매니페스트를 편집하기 전에 백업했는가?
- [ ] 노드 이상 판정 시간: Lease 10초 주기, 40초 무갱신 시 테인트, 기본 300초 톨러레이션 후 축출. 응답 불능 노드의 프로세스 종료는 보장되지 않는다.
- [ ] 노드 10250 포트가 익명 접근을 거부하는가(`Unauthorized`가 정상)?

### 시나리오로 확인하기

1. **상황:** 새 게임 서버 Pod가 몇 분째 `ContainerCreating`이다. `kubectl describe pod`에는 이벤트가 거의 없다.
   **질문:** 어디를 어떤 순서로 보나?

   <details markdown="1"><summary>답 확인</summary>

   노드에서 kubelet 로그와 함께 **containerd 로그**를 본다. CNI는 kubelet이 아니라 런타임이 `RunPodSandbox` 안에서 호출하므로 CNI 실패는 containerd 로그에 먼저 나타난다(`journalctl -u containerd | grep -i cni`). 이후 `/etc/cni/net.d/`의 설정, 볼륨 마운트 대기(코어 1의 ④), 이미지 pull(⑤) 순서로 `syncPod` 단계를 따라 좁힌다. → 코어 1, 코어 2

   </details>

2. **상황:** 매치 서버가 떠 있던 워커 노드의 NIC가 갑자기 죽었다. 4분 뒤에도 `kubectl get pods`에는 그 Pod가 `Running`으로 보인다.
   **질문:** 정상인가? 언제 어떻게 바뀌나?

   <details markdown="1"><summary>답 확인</summary>

   정상적인 유예다. Lease 갱신이 40초(`node-monitor-grace-period`) 끊기면 노드 컨디션이 Unknown이 되고 `unreachable`/`not-ready` 테인트가 붙는다. 모든 Pod는 기본 `tolerationSeconds: 300`을 가지므로 그 뒤 5분이 지나야 축출이 시작된다. 그리고 그 축출은 API 서버의 Pod 오브젝트 삭제일 뿐, 단절된 노드 위의 프로세스가 실제로 멈췄다는 보장이 아니다(같은 플레이어 세션을 두 인스턴스가 처리할 위험은 앱·스토리지 수준에서 막아야 한다). → 코어 4

   </details>

3. **상황:** 클러스터 설정 변경 중 `kube-apiserver.yaml`에 오타를 넣었더니 `kubectl`이 전부 실패한다.
   **질문:** 어떻게 복구하나?

   <details markdown="1"><summary>답 확인</summary>

   API 서버가 static Pod이므로 노드에 직접 접속해(콘솔/SSH) `/etc/kubernetes/manifests/kube-apiserver.yaml`을 백업본으로 되돌린다. kubelet이 `fileCheckFrequency`(예: 20초) 주기로 변경을 감지해 Pod를 재생성한다. 이때 `crictl ps -a`로 컨테이너 상태를 확인할 수 있다. 수정 전 백업과 노드 접근 수단 확보가 선행 조건이다. → 코어 3

   </details>

4. **상황:** 노드 하나에서 `PLEG is not healthy: pleg was last seen active 3m5s ago`가 보이고 곧 `NotReady`가 되었다. 그 노드에는 컨테이너가 수백 개다.
   **질문:** 무엇이 일어나고 있고 무엇을 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   PLEG는 기본적으로 1초마다 런타임에서 전체 컨테이너 목록을 relist해 diff한다. 컨테이너가 많거나 디스크 I/O가 포화돼 런타임 응답이 느려지면 relist가 밀리고, 임계치를 넘으면 kubelet이 스스로를 비정상으로 보고한다. 런타임 응답 지연의 원인(디스크 I/O, 컨테이너 수 폭증)을 `crictl ps | wc -l`, `iostat`으로 확인한다. Evented PLEG는 완화책이지만 원문 기준 베타이며 기본 비활성이다. → 코어 1

   </details>

📖 출처: Kubernetes_Internals_Network_Guide/01-내부-아키텍처/06-kubelet-런타임-kube-proxy-개요.md, kubernetes-textbook-main/05-내부-동작-파헤치기/20-kubelet과-노드.md

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] kubelet = 노드의 ____ 서비스 (컨테이너 아님), 모델 = (풀/푸시)
         Pod 소스 3: ( ? ) / ( ? ) / HTTP   → syncLoop → Pod ____ (Pod당 1개) → syncPod()
         PLEG: 기본 ____초마다 relist, 늦으면 "PLEG is not ____" → 노드 ____
         syncPod 순서: cgroup → ( ? ) → 이미지 → ( ? )(CNI) → init → 앱 → ( ? ) → status

[코어 2] kubelet ─gRPC(CRI)→ ( ? ) → containerd-shim-runc-v2 → ( ? ) → 컨테이너
         CNI 호출 주체 = ( ? ), 호출 시점 = RPC ____ 안

[코어 3] static Pod 디렉터리: /etc/kubernetes/____ ,  kubectl에 보이는 것 = ____ Pod (소유자 ____)
         삭제 = ____을 지운다

[코어 4] Lease ____초 / status ____분 / grace ____초 / toleration ____초
         강제 축출 = API 서버의 Pod ______만 삭제 (프로세스 종료 ( ? ))
```

### 2. 인출 질문

1. kubelet이 컨테이너가 아니라 systemd 서비스로 도는 이유는 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   순환 의존을 피하기 위해서다. kubelet이 컨테이너라면 그것을 띄울 무언가가 필요한데, 컨테이너를 띄우는 것이 kubelet의 일이다. → 코어 1

   </details>

2. API 서버가 kubelet에게 명령하는가? 그렇다면/아니라면 어떤 결과가 생기는가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. kubelet이 API 서버를 watch하며 스스로 판단하는 풀 모델이다. 그래서 API 서버가 잠시 죽어도 노드의 기존 Pod들은 계속 동작한다. → 코어 1

   </details>

3. CNI 플러그인은 누가 언제 호출하며, 실패 로그는 어디에 먼저 나타나는가?

   <details markdown="1"><summary>답 확인</summary>

   kubelet이 아니라 컨테이너 런타임(containerd/CRI-O)이 CRI `RunPodSandbox` 처리 안에서 호출한다. 그래서 실패는 kubelet 로그가 아니라 containerd/CRI-O 로그에 먼저 나타난다. → 코어 2

   </details>

4. shim이 존재하는 이유는 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   containerd 데몬이 죽거나 업그레이드로 재시작돼도 이미 뜬 컨테이너 프로세스는 shim이 부모로서 계속 감독하므로 살아남는다. containerd가 복구되면 shim들과 재연결해 상태를 회복한다. 컨테이너 하나당 shim 프로세스가 하나 붙는다. → 코어 2

   </details>

5. static Pod와 미러 Pod의 차이, 그리고 static Pod를 삭제하는 방법은?

   <details markdown="1"><summary>답 확인</summary>

   static Pod는 kubelet이 로컬 매니페스트로 직접 만드는 Pod이고 API 서버가 필요 없다. 미러 Pod는 `kubectl`에서 보이도록 API 서버에 등록한 읽기 전용 사본이며 소유자가 `Node`다. `kubectl delete`로 지워도 파일이 있으면 즉시 다시 등록되므로, 삭제는 매니페스트 파일을 지워야 한다. → 코어 3

   </details>

6. 노드 하트비트가 Lease와 status 두 가지로 나뉜 이유는?

   <details markdown="1"><summary>답 확인</summary>

   `Node.status`는 conditions, capacity, images 목록 등으로 커서, 수천 노드가 10초마다 갱신하면 etcd 쓰기 부하가 감당되지 않는다. Lease는 몇 개 필드뿐인 작은 오브젝트라 10초마다 갱신해도 부담이 적다. status는 5분마다 또는 변화 시에만 갱신한다. → 코어 4

   </details>

7. 노드가 응답을 멈춘 뒤 Pod가 축출되기까지의 타임라인은?

   <details markdown="1"><summary>답 확인</summary>

   Lease 갱신이 `node-monitor-grace-period`(기본 40초) 끊기면 노드 컨디션이 Unknown이 되고 `not-ready`/`unreachable` 테인트(NoExecute)가 붙는다. 모든 Pod에 자동 부여된 `tolerationSeconds: 300`이 지나면 축출이 시작된다. → 코어 4

   </details>

8. 응답 불능 노드의 축출이 "프로세스 종료를 보장하지 않는" 이유는?

   <details markdown="1"><summary>답 확인</summary>

   컨트롤 플레인은 그 노드의 kubelet에 직접 "멈춰라"를 전달할 수 없고, 할 수 있는 일은 API 서버상의 Pod 오브젝트 삭제뿐이다. 실제 컨테이너 종료는 네트워크 복구 후 kubelet이 자기 담당이 아님을 확인한 뒤에야 일어난다. StatefulSet 등에는 스토리지 펜싱 같은 안전장치가 필요할 수 있다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** `syncLoop` = `epoll_wait` 이벤트 루프, Pod Worker = 세션별 strand. ⚠️ 원문은 Go의 `select`와 고루틴으로 설명하며, 직렬화 단위는 연결이 아니라 Pod다.
- **C++ 유추:** 하트비트 타임아웃 후 세션 정리 = 40초 + 300초 유예. ⚠️ 끊긴 노드의 "세션"(프로세스)은 서버 쪽에서 강제로 닫을 수 없고 살아 있을 수 있다.
- **비유:** kubelet = 지점 점장. 본사(API 서버)가 지시서를 우편으로 보내지 않아도 점장이 본사 게시판(watch)을 보고 알아서 일한다. ⚠️ 비유가 깨지는 지점: 점장 자신은 매장(컨테이너) 안이 아니라 건물 관리 시스템(systemd)에 소속돼 있다.
- **비유:** static Pod = 비상 발전기를 수동 레버로 켜는 것(본사 지시 없이 현장 파일로). ⚠️ 비유가 깨지는 지점: 본사 게시판에 보이는 건 읽기 전용 사진(미러 Pod)이라 게시판에서 지워도 발전기는 계속 돈다.
- **묶음(3의 법칙):** Pod 소스 3(API watch · static 디렉터리 · HTTP) / 인터페이스 위임(CRI · CSI · Device Plugin, CNI는 런타임에 재위임) / 시간 수치 10초-40초-300초.
- **대칭·순서:** 우아한 축출(kubelet이 SIGTERM) ↔ 강제 축출(컨트롤러가 오브젝트만 삭제). 생성 순서 cgroup → 볼륨 → 이미지 → 샌드박스 → init → 앱 → 프로브 → status.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod 하나가 노드에서 컨테이너가 되기까지"를 syncPod 10단계로 처음 듣는 사람에게 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "우리 서버가 있는 노드의 네트워크가 끊겼을 때 왜 5분 가까이 Pod가 안 사라지고, 그동안 왜 유령 인스턴스가 있을 수 있는가"를 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "노드가 죽으면 즉시 Pod를 다른 노드로 옮겨야 한다" vs B "기본 5분 유예가 옳다" — 순단, 재시작 비용, 이중 실행 위험을 근거로 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 CNI 호출 경로를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/01-내부-아키텍처/06 (6.1&#126;6.6), kubernetes-textbook-main/05-내부-동작-파헤치기/20 (20.1&#126;20.7)*
