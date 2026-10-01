---
title: "6장. kubelet·컨테이너 런타임·kube-proxy 개요"
---

# 6장. kubelet·컨테이너 런타임·kube-proxy 개요

> **학습목표**
> - kubelet의 동기화 루프에서 Pod 워커, PLEG, 프로브 매니저, 상태 매니저가 각각 무슨 일을 하는지 구분할 수 있다.
> - CRI가 정의하는 RuntimeService/ImageService의 역할과 containerd·CRI-O·shim 계층의 관계를 설명할 수 있다.
> - static Pod와 미러 Pod의 차이, 그리고 이것이 컨트롤 플레인 부트스트랩 문제를 어떻게 푸는지 안다.
> - 볼륨 매니저와 디바이스 플러그인이 노드 자원을 Pod에 연결하는 흐름을 개괄한다.
> - kube-proxy가 어떤 정보를 감시해 무엇을 프로그래밍하는지 알고, 15장에서 다룰 데이터플레인과의 경계를 구분한다.
> - 노드 하트비트가 끊겼을 때 테인트 기반 축출까지 이어지는 파이프라인을 추적할 수 있다.

---

## 들어가며

1부의 앞선 다섯 장은 컨트롤 플레인 — API 서버, etcd, 스케줄러, 컨트롤러 매니저 — 이 **"무엇을 해야 하는가"**를 결정하는 과정을 다뤘다. 그 결정은 결국 `Pod.spec.nodeName`이라는 필드 하나로 요약된다. 이 장은 그 결정을 실제 프로세스와 네트워크 인터페이스로 바꾸는 노드 쪽 삼총사를 개괄한다.

```
컨트롤 플레인                          노드
┌─────────────────┐                ┌──────────────────────────┐
│ 스케줄러가        │   watch        │  kubelet                 │
│ nodeName을        │───────────────▶│    → CRI → 컨테이너 런타임 │
│ 확정한 Pod         │                │  kube-proxy               │
└─────────────────┘                │    → Service/EndpointSlice│
                                    │      감시 → 로컬 데이터플레인│
                                    └──────────────────────────┘
```

**이 장은 1부의 마지막이자 3부(네트워크)로 넘어가는 다리다.** kube-proxy는 여기서 "무엇을 감시해 무엇을 하는가" 수준만 다루고, iptables/IPVS/nftables 각 모드의 규칙 구조와 성능 특성 같은 실제 데이터플레인은 **15장에서 전용 장으로 깊게 다룬다.**

## 6.1 kubelet 동기화 루프

### Pod 소스와 syncLoop

kubelet은 노드마다 정확히 하나씩 도는 에이전트로, 세 가지 소스에서 "이 노드에 있어야 할 Pod 목록"을 받아 병합한다.

```
┌── Pod 소스 ─────────────────────────────────┐
│ ① API 서버 watch (spec.nodeName == 이 노드)   │
│ ② static Pod 디렉터리 (6.3절)                 │
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

`syncLoop`은 여러 채널을 `select`로 동시에 기다리는 이벤트 루프다.

```go
// 개념적 구조 — 실제 kubelet 소스의 단순화
for {
    select {
    case u := <-configCh:        // Pod 추가/수정/삭제 (Informer 이벤트, 5장과 동일한 패턴)
    case e := <-plegCh:          // 컨테이너 상태 변화 (PLEG, 아래)
    case <-syncCh:               // 주기적 전체 재동기화 (기본 1초)
    case u := <-livenessCh:      // liveness 프로브 실패
    case u := <-readinessCh:     // readiness 상태 변화
    case u := <-startupCh:       // startup 프로브 완료
    case <-housekeepingCh:       // 종료된 Pod 정리 등 (기본 2초)
    }
    dispatchToPodWorker(...)
}
```

**5장에서 본 "Informer → 이벤트 → 워크큐 → 조정" 패턴이 여기서도 그대로 반복된다.** 다만 kubelet의 "워크큐"는 Pod마다 배정된 전용 고루틴(Pod Worker)이라는 점이 다르다 — 같은 Pod에 대한 동기화는 항상 순차적으로 일어나므로 경쟁 조건이 없고, 서로 다른 Pod는 완전히 병렬로 처리된다.

### PLEG — 컨테이너 상태 변화를 감지하는 방법

kubelet은 컨테이너 런타임이 상태 변화를 알아서 알려주는 것에 의존할 수 없었다(적어도 전통적 방식에서는). 그래서 **PLEG(Pod Lifecycle Event Generator)**가 이를 능동적으로 폴링한다.

```
기본(relisting) 방식:
  1초마다: 런타임에 "지금 살아있는 모든 컨테이너 목록"을 요청
           → 이전 스냅숏과 비교(diff)
           → 상태가 바뀐 컨테이너에 대해 이벤트 생성 → plegCh로 전달
```

컨테이너 수가 많은 노드(수백 개)에서 이 전수 조사는 비용이 커진다. 런타임 응답이 느려지면 relist 주기 자체가 밀리고, 이 지연이 임계치를 넘으면 kubelet이 스스로를 이상 상태로 보고한다.

```bash
kubectl describe node k8s-guide-worker | grep -i pleg
```

```
PLEG is not healthy: pleg was last seen active 3m5s ago; threshold is 3m0s
```

**이 메시지가 보이면 노드가 곧 `NotReady`로 전환된다.** 원인은 대개 런타임 자체의 응답 지연(디스크 I/O 포화, cgroup 과다, 컨테이너 수 폭증)이다.

**Evented PLEG**는 런타임이 상태 변화를 **이벤트로 직접 푸시**하도록 바꿔, relist를 폴링이 아니라 백업 수단으로만 남기는 방식이다. v1.27부터 베타로 제공되지만 **여전히 기본은 비활성화**이며, 클러스터마다 `EventedPLEG` 기능 게이트를 명시적으로 켜야 한다. 대규모 노드에서 CPU 사용량을 줄일 잠재력은 있지만 아직 GA로 승격되지 않았고, 컨테이너 런타임 버전에 따라 호환성 이슈가 보고된 적도 있어 도입 전 검증이 필요하다.

### 프로브 매니저 — 동기화 루프와 독립적으로 동작

liveness/readiness/startup 프로브는 `syncPod()` 안에서 매번 실행되는 것이 아니라, **프로브 매니저가 컨테이너마다 별도 고루틴으로 자체 주기(`periodSeconds`)에 맞춰 독립적으로 실행**한다. 결과가 바뀌면(성공↔실패) `livenessCh`/`readinessCh`/`startupCh`로 syncLoop에 알려 재동기화를 유발한다.

```
Pod A의 컨테이너 c1 → 전용 프로브 고루틴 → 10초마다 exec/HTTP/TCP 프로브 실행
                                          → 결과가 바뀌면만 이벤트 발생
```

**readiness 실패는 컨테이너를 재시작시키지 않는다** — Service의 EndpointSlice에서만 빠진다(14장). **liveness 실패는 컨테이너 재시작을 유발한다.** startup 프로브가 아직 통과하지 않았다면 liveness/readiness는 아예 시작되지 않는다.

### 상태 매니저 — 로컬 상태를 API 서버와 조율

kubelet 내부에는 **status manager**가 따로 있다. Pod Worker가 만들어낸 최신 `PodStatus`(phase, conditions, containerStatuses)를 로컬 캐시에 쌓아 두고, 별도 루프가 이를 API 서버에 반영한다. **바뀐 것이 있을 때만, 그리고 일정 주기로 배치해서 보낸다** — 5장에서 다룬 "실제로 다를 때만 쓴다"는 원칙과 완전히 같은 이유(불필요한 `resourceVersion` 갱신과 watch 이벤트 폭주 방지)다.

### 인플레이스 파드 리사이즈(In-Place Pod Resize) 개관

전통적으로 실행 중인 Pod의 `resources.requests`/`limits`를 바꾸려면 Pod를 삭제하고 새로 만드는 수밖에 없었다. **InPlacePodVerticalScaling**은 많은 경우 이 재시작 없이 실행 중인 컨테이너의 CPU/메모리 요청량·제한량을 바꿀 수 있게 하는 기능이다. v1.27 알파로 시작해 v1.33에서 베타(기본 활성화)로, **v1.35에서 GA**로 승격됐다.

이 기능의 실제 무게는 대부분 kubelet에 실린다. 사용자가 Pod의 `spec.containers[].resources`를 수정하면, Pod Worker는 (가능한 경우) 컨테이너를 재시작하지 않고 CRI를 통해 cgroup의 실제 자원 한도만 갱신하도록 시도한다 — `syncPod()`가 새로 떠맡은 책임 중 하나다. 노드에 그만큼의 여유 자원이 없으면 즉시 거부하는 대신 요청을 `Deferred` 상태로 미뤄 두고 자원이 풀리기를 기다린다. 4.4절에서 다룬 선점 메커니즘이 v1.37부터 이 대기 상태와 맞물리기 시작했다는 점(알파 단계의 `InPlacePodVerticalScalingSchedulerPreemption`)도 함께 기억해 둘 만하다.

## 6.2 CRI 아키텍처

### kubelet과 런타임 사이의 gRPC 경계

CRI(Container Runtime Interface)는 kubelet이 어떤 런타임과도 통신할 수 있게 하는 **gRPC 인터페이스**다. 두 서비스로 나뉜다.

```protobuf
service RuntimeService {
  // 샌드박스 (Pod의 네트워크 네임스페이스를 쥐고 있는 단위)
  rpc RunPodSandbox(...)      // pause 컨테이너 생성 + 이 안에서 CNI 호출
  rpc StopPodSandbox(...)
  rpc RemovePodSandbox(...)
  rpc PodSandboxStatus(...)
  rpc ListPodSandbox(...)

  rpc CreateContainer(...)
  rpc StartContainer(...)
  rpc StopContainer(...)
  rpc RemoveContainer(...)
  rpc ListContainers(...)
  rpc ContainerStatus(...)

  rpc ExecSync(...)           // 프로브가 내부적으로 쓰는 exec
  rpc Exec(...)               // kubectl exec
  rpc Attach(...)
  rpc PortForward(...)

  rpc ContainerStats(...)
  rpc ListContainerStats(...)
}

service ImageService {
  rpc ListImages(...)
  rpc ImageStatus(...)
  rpc PullImage(...)
  rpc RemoveImage(...)
  rpc ImageFsInfo(...)
}
```

**중요한 사실 하나**: **CNI 호출은 kubelet이 직접 하지 않는다.** `RunPodSandbox` RPC **안에서 런타임이** CNI 플러그인을 실행한다. 그래서 CNI 설정 파일(`/etc/cni/net.d/`)을 읽는 주체는 containerd/CRI-O이지 kubelet이 아니다. 이 경계는 13장(CNI 스펙)에서 CNI 자체를 다룰 때 다시 등장한다.

```bash
docker exec k8s-guide-worker crictl info | jq '.config.containerdEndpoint'
```

```
"unix:///run/containerd/containerd.sock"
```

### containerd vs CRI-O, 그리고 shim

kind 클러스터는 기본적으로 **containerd**를 쓴다. **CRI-O**는 CNCF의 또 다른 CRI 구현체로, OCI 런타임(runc, crun 등)만 직접 감싸는 더 얇은 설계를 지향한다. 두 런타임 모두 CRI를 구현하므로 kubelet 입장에서는 **동일한 gRPC 호출로 어느 쪽이든 다룰 수 있다.**

```
                  gRPC(CRI)
kubelet ────────────────────────▶ containerd (또는 CRI-O)
                                        │
                                        │ 컨테이너마다 프로세스 하나
                                        ▼
                              containerd-shim-runc-v2
                                        │ (OCI 런타임 spec으로)
                                        ▼
                                      runc  →  실제 컨테이너 프로세스
```

**shim이 존재하는 이유**: containerd 데몬 자체가 죽거나 업그레이드로 재시작되더라도, 이미 떠 있는 컨테이너 프로세스는 shim이 부모로서 계속 감독하므로 **살아남는다.** containerd가 복구되면 shim들과 다시 연결(재연결)해 상태를 회복한다. 컨테이너 하나당 shim 프로세스가 하나씩 붙는 구조라 `ps aux`에서 `containerd-shim-runc-v2` 프로세스가 컨테이너 수만큼 보인다.

```bash
docker exec k8s-guide-worker ps aux | grep containerd-shim | head -5
```

### dockershim이 사라진 이유

과거 kubelet은 Docker Engine을 위한 특수 어댑터(dockershim)를 **자신의 코드베이스 안에** 내장하고 있었다. Docker는 CRI를 구현하지 않았기 때문이다. 이는 쿠버네티스 본체가 특정 런타임의 유지보수 부담을 떠안는 구조였고, v1.24에서 dockershim이 제거되면서 **CRI를 구현하는 런타임만 kubelet과 통신할 수 있게** 정리됐다. Docker로 빌드한 이미지 자체는 OCI 이미지 규격을 따르므로 전혀 영향받지 않는다 — 사라진 것은 "Docker 데몬을 직접 조종하던 어댑터"였지, 이미지 호환성이 아니다.

## 6.3 static Pod와 미러 Pod

### 순환 의존 문제

1장에서 컨트롤 플레인 컴포넌트가 `kube-system`에 Pod로 떠 있는 것을 봤다. 여기엔 논리적 모순이 있다 — **API 서버가 Pod로 실행된다면, 그 Pod는 누가 만드는가?** Pod를 만들려면 스케줄러와 API 서버가 필요한데, API 서버가 아직 뜨지 않았다.

**static Pod가 이 순환을 끊는다.** kubelet은 API 서버 없이도 **로컬 디렉터리를 감시**해 그 안의 매니페스트로 Pod를 직접 만든다.

```bash
docker exec k8s-guide-control-plane ls /etc/kubernetes/manifests/
```

```
etcd.yaml
kube-apiserver.yaml
kube-controller-manager.yaml
kube-scheduler.yaml
```

```yaml
# kubelet 설정 (kubelet config.yaml)
staticPodPath: /etc/kubernetes/manifests
fileCheckFrequency: 20s
```

| | 일반 Pod | static Pod |
|---|---|---|
| 생성 경로 | 컨트롤러 → API 서버 → 스케줄러 → kubelet | **kubelet이 로컬 파일에서 직접** |
| 스케줄링 | 스케줄러가 노드 결정(4장) | 매니페스트가 있는 노드에 고정 |
| 이름 | 랜덤 접미사 | `<name>-<노드이름>` |
| 삭제 방법 | `kubectl delete` | **파일을 지워야 함** |
| API 서버 의존 | 필요 | 불필요 |

### 미러 Pod — 읽기 전용 창

`kubectl get pods -n kube-system`에서 static Pod가 보이는 건 **미러 Pod** 덕분이다. kubelet은 static Pod를 만든 뒤, API 서버에 "이런 Pod가 이 노드에 있다"는 **읽기 전용 사본**을 등록한다.

```bash
kubectl get pod etcd-k8s-guide-control-plane -n kube-system \
  -o jsonpath='{.metadata.ownerReferences}'
```

```json
[{"apiVersion":"v1","kind":"Node","name":"k8s-guide-control-plane","uid":"..."}]
```

**소유자가 `Node`다.** 일반 Pod가 ReplicaSet 등에 소유되는 것(5.6절)과 대비된다. 미러 Pod를 `kubectl delete`로 지워도 파일이 그대로면 kubelet이 즉시 다시 등록한다 — **미러 Pod는 실체가 아니라 창(window)이기 때문**이다.

```bash
kubectl delete pod etcd-k8s-guide-control-plane -n kube-system
# 즉시 재생성됨 — 실제 삭제는 /etc/kubernetes/manifests/etcd.yaml을 지워야 한다
```

**컨트롤 플레인 컴포넌트에 플래그를 추가하는 표준 방법이 바로 이 매니페스트 편집이다.** kubelet이 `fileCheckFrequency` 주기로 변경을 감지해 해당 static Pod를 재생성한다.

> **⚠️ 컨트롤 플레인 매니페스트 편집 시 반드시 백업한다**
> YAML 문법 오류 하나로 API 서버가 뜨지 않으면 `kubectl`로는 아무것도 할 수 없다. 노드 콘솔/SSH 접근 수단을 확보한 뒤 수정하고, 항상 원본을 백업해 둔다.

## 6.4 볼륨과 디바이스 플러그인 연동 개요

이 책은 네트워킹/아키텍처 중심이므로 스토리지 자체는 깊이 다루지 않지만, kubelet이 이를 어떻게 조율하는지는 노드 그림의 일부다.

### 볼륨 매니저

kubelet 내부의 **volume manager**는 "이 노드에서 실행 중인 Pod들이 필요로 하는 볼륨" 집합과 "실제로 마운트된 볼륨" 집합을 주기적으로 비교하는 **자체 조정 루프**를 돈다 — 역시 5장의 패턴이다.

```
desired (Pod spec에서 파생)      actual (실제 마운트 상태)
    volume A 필요                    volume A 마운트됨
    volume B 필요        ──diff──▶    volume B 미마운트  → Attach/Mount 수행
    (volume C 불필요)                 volume C 마운트됨   → Unmount/Detach 수행
```

CSI 플러그인을 쓰는 볼륨이라면 이 조정은 CSI gRPC 호출(`NodeStageVolume`, `NodePublishVolume`)로 이어진다. Pod의 컨테이너는 볼륨이 실제로 마운트 완료될 때까지 시작되지 않는다 — 6.1절에서 본 `syncPod()` 단계 중 하나가 바로 이 대기다.

```bash
docker exec k8s-guide-worker ls /var/lib/kubelet/plugins_registry/
docker exec k8s-guide-worker ls /var/lib/kubelet/pods/*/volumes/ 2>/dev/null | head
```

### 디바이스 플러그인 — GPU 등 특수 하드웨어

GPU, FPGA, 고성능 NIC 같은 표준 자원 모델(CPU/메모리)로 표현할 수 없는 하드웨어는 **Device Plugin API**로 노출한다.

```
① 디바이스 플러그인이 보통 DaemonSet으로 배포됨
② kubelet의 등록 소켓(/var/lib/kubelet/device-plugins/kubelet.sock)에 자신을 등록
③ ListAndWatch RPC로 사용 가능한 디바이스 목록을 스트리밍
④ kubelet이 이를 노드의 status.capacity에 확장 자원으로 반영
⑤ 이 자원을 요청하는 Pod가 스케줄되면 kubelet이 Allocate RPC 호출
   → 디바이스 파일 경로, 환경 변수 등을 받아 컨테이너에 주입
```

```yaml
resources:
  limits:
    nvidia.com/gpu: 2
```

**확장 자원은 정수 단위만 가능하고 `requests == limits`여야 한다** — GPU 0.5개를 요청할 수 없다. CPU를 코어 단위로 배타 할당하는 `cpuManagerPolicy: static`, 그리고 CPU·메모리·디바이스를 같은 NUMA 노드로 정렬하는 Topology Manager도 이 디바이스 플러그인 정보를 함께 사용하지만, 본격적인 다룸은 이 책의 범위 밖이다.

## 6.5 kube-proxy 개요

### 감시 대상과 역할

kube-proxy는 **노드마다 하나씩 도는 데몬**(보통 DaemonSet)으로, kubelet과 마찬가지로 "감시 → 로컬 상태 반영"이라는 조정 루프를 돈다 — 역시 5장의 Informer 패턴을 그대로 쓴다.

```
API 서버
  │ watch: Service, EndpointSlice
  ▼
┌────────────────────────┐
│      kube-proxy         │
│  (Informer로 캐시 유지)   │
└───────────┬─────────────┘
            │ 변경 감지 시 로컬 데이터플레인 재프로그래밍
            ▼
  ┌───────────────────────────┐
  │ 이 노드의 커널 데이터플레인   │
  │  iptables / IPVS / nftables│
  └───────────────────────────┘
```

kube-proxy가 감시하는 것은 두 리소스뿐이다.

- **Service**: ClusterIP, 포트, 타입(ClusterIP/NodePort/LoadBalancer) 등 "정책" 정보
- **EndpointSlice**(14장): 그 Service 뒤에 실제로 떠 있는 Pod들의 IP:포트 목록 — Service가 바뀔 때가 아니라 **Pod가 뜨고 죽을 때마다** 바뀌는 부분

Service나 EndpointSlice가 바뀌면, kube-proxy는 해당 노드의 **iptables 체인**(또는 IPVS 가상 서버, 또는 nftables 규칙 집합)을 다시 계산해 커널에 반영한다. **이 결과로 "ClusterIP로 보낸 패킷이 어느 백엔드 Pod로 갈지"가 각 노드에서 로컬로 결정된다** — 트래픽이 어떤 중앙 로드밸런서도 거치지 않는 이유다.

```bash
kubectl get pods -n kube-system -l k8s-app=kube-proxy
kubectl logs -n kube-system -l k8s-app=kube-proxy --tail=20
```

### 15장으로 미루는 것들

이 절에서 의도적으로 깊이 들어가지 않는 부분들이다.

| 주제 | 15장에서 다룰 내용 |
|---|---|
| iptables 모드 규칙 구조 | `KUBE-SERVICES`, `KUBE-SVC-*`, `KUBE-SEP-*` 체인이 실제로 어떻게 얽히는지 |
| IPVS 모드 | 가상 서버/실제 서버 구조, 스케줄링 알고리즘(rr, lc, sh 등) |
| nftables 모드 | iptables가 여전히 널리 쓰이는 기본값이지만 nftables로의 전환이 진행 중인 배경과 성능 특성 |
| 성능 비교 | Service 수천 개 규모에서 각 모드의 규칙 갱신 지연·CPU 비용 |
| 세션 어피니티, externalTrafficPolicy | 실제 라우팅 결정에 미치는 영향 |

**이 장에서 기억할 것은 하나면 충분하다: kube-proxy는 Service/EndpointSlice를 감시해 노드의 로컬 데이터플레인을 프로그래밍하는 컨트롤러다.** 그 데이터플레인의 내부 구조가 15장의 주제다.

## 6.6 노드 상태 보고와 축출 파이프라인

### 이중 하트비트 — Lease와 status

kubelet은 노드 상태를 두 가지 빈도로 나눠 보고한다.

```
Lease 갱신     : 10초마다 (nodeStatusUpdateFrequency) — 작은 오브젝트
status 갱신    : 5분마다 또는 실제 변화 시 (nodeStatusReportFrequency) — 큰 오브젝트
```

```bash
kubectl get lease k8s-guide-worker -n kube-node-lease -o yaml
```

**왜 나누는가?** `Node.status`는 conditions, capacity, images 목록 등을 포함한 상대적으로 큰 오브젝트다. 노드가 수천 개인 클러스터에서 이걸 10초마다 전부 갱신하면 etcd 쓰기 부하가 감당되지 않는다. 반면 Lease는 `holderIdentity`에 해당하는 필드 몇 개뿐인 아주 작은 오브젝트라 자주 갱신해도 부담이 적다 — 5장에서 다룬 리더 선출 Lease와 **같은 API 오브젝트, 다른 용도**다.

### node-lifecycle-controller의 감지

`node-lifecycle-controller`(kube-controller-manager 내부, 5장에서 열거한 내장 컨트롤러 중 하나)가 이 Lease를 관찰한다.

```
정상: Lease.renewTime이 10초마다 갱신됨
        │
        │ node-monitor-grace-period(기본 40초) 동안 갱신 없음
        ▼
① 노드 컨디션을 Unknown으로 전환
② 테인트 부착:
     node.kubernetes.io/not-ready:NoExecute        (완전 불통으로 판단 시)
     node.kubernetes.io/unreachable:NoExecute       (일부 상황)
③ 이 노드의 Pod들에 이미 걸려 있던
     tolerationSeconds(기본 300초, 5분)가 흐르기 시작
        ▼
④ tolerationSeconds가 지나면 Pod 축출 시작
```

**모든 Pod는 스케줄될 때 자동으로 다음 톨러레이션을 부여받는다**(`DefaultTolerationSeconds` 어드미션 플러그인).

```yaml
tolerations:
  - key: node.kubernetes.io/not-ready
    operator: Exists
    effect: NoExecute
    tolerationSeconds: 300
  - key: node.kubernetes.io/unreachable
    operator: Exists
    effect: NoExecute
    tolerationSeconds: 300
```

**즉 노드가 응답 없음 상태가 된 뒤에도 기본 5분 동안은 그 노드의 Pod가 그대로 유지된다.** 짧은 네트워크 순단으로 애플리케이션이 불필요하게 재기동되는 것을 막기 위한 유예 시간이다. StatefulSet의 Pod처럼 더 신중한 처리가 필요한 경우, 이 값을 직접 짧게/길게 오버라이드하기도 한다.

### 우아한 축출 vs 강제 축출

노드가 응답할 수 있는 상태에서 스스로 종료되는 경우(예: `kubectl drain`, 스케일 다운)와, 노드가 완전히 응답 불능인 경우는 축출 방식이 다르다.

```
우아한 축출 (노드가 살아있음):
  kubelet이 Pod에 SIGTERM 전송 → terminationGracePeriodSeconds 대기 → SIGKILL
  → kubelet 스스로 API 서버에서 Pod 오브젝트 삭제

강제 축출 (노드가 응답 불능):
  node-lifecycle-controller가 API 서버에서 직접 Pod 오브젝트를 삭제
  → 실제 프로세스가 살아 있는지는 확인할 방법이 없음
  → StatefulSet 등 "동시에 두 개가 뜨면 안 되는" 워크로드에서
    이 불확실성이 문제가 될 수 있어 별도의 안전장치(예: 스토리지 수준 펜싱)가 필요할 수 있다
```

**이 구분이 중요한 이유**: 노드가 실제로는 살아 있지만 네트워크만 끊긴 상황(split-brain 가능성)에서, 컨트롤 플레인은 그 노드의 kubelet에게 직접 "프로세스를 멈춰라"라고 말할 수 없다 — kubelet도 API 서버도 서로에게 도달하지 못하기 때문이다. 컨트롤 플레인이 할 수 있는 일은 **API 서버 상의 Pod 오브젝트를 지우는 것뿐**이며, 실제 컨테이너 종료는 네트워크가 복구된 뒤 kubelet이 "더 이상 내가 담당할 Pod가 아니다"를 확인하고서야 일어난다.

## 실습: crictl로 노드 내부 들여다보기, 그리고 축출 관찰

**① crictl로 kubectl 없이 노드 상태 확인**

```bash
docker exec -it k8s-guide-worker crictl pods
docker exec -it k8s-guide-worker crictl ps -a
```

```bash
# 특정 Pod의 컨테이너만
POD_ID=$(docker exec k8s-guide-worker crictl pods --name coredns -q | head -1)
docker exec k8s-guide-worker crictl ps --pod $POD_ID 2>/dev/null || true
```

**`crictl`은 kubelet과 정확히 같은 CRI 소켓을 쓴다.** kubelet이 보는 것과 동일한 뷰를 API 서버 없이 얻는다 — API 서버가 죽었을 때 이것이 유일한 진단 수단이 된다.

**② static Pod 매니페스트와 crictl 결과 대조**

```bash
docker exec k8s-guide-control-plane cat /etc/kubernetes/manifests/kube-scheduler.yaml | head -20
docker exec k8s-guide-control-plane crictl ps -a --name kube-scheduler
```

매니페스트의 `command`/`args`가 실제로 뜬 컨테이너의 실행 인자와 일치하는지 `crictl inspect`로 확인한다.

```bash
CID=$(docker exec k8s-guide-control-plane crictl ps -q --name kube-scheduler)
docker exec k8s-guide-control-plane crictl inspect $CID | jq '.status.metadata, .info.runtimeSpec.process.args'
```

**③ PLEG relist 활동 관찰**

```bash
docker exec k8s-guide-worker sh -c \
  'kubectl 없이는 로그 레벨을 못 올리므로, kind 노드의 kubelet 로그를 직접 확인'
docker logs k8s-guide-worker 2>&1 | grep -i pleg | tail -20
```

부하가 낮은 실습 클러스터에서는 PLEG 경고가 거의 안 보이는 게 정상이다. 대량의 Pod를 동시에 생성해 관찰해 본다.

```bash
kubectl create deployment pleg-load --image=busybox --replicas=30 \
  -- sh -c "sleep 3600"
sleep 30
docker logs k8s-guide-worker 2>&1 | grep -i 'PLEG\|relist' | tail -20
kubectl delete deployment pleg-load
```

**④ 노드 축출 타임라인 관찰(개념 시연)**

kind 환경에서 실제 네트워크 파티션을 안전하게 재현하기는 어려우므로, kubelet 프로세스를 잠시 멈춰 유사 효과를 관찰한다.

```bash
# 워커의 kubelet을 정지 (systemd 서비스가 아니라 kind 노드 내부 프로세스)
docker exec k8s-guide-worker2 pkill -STOP kubelet

kubectl get nodes -w
# 40초(node-monitor-grace-period) 전후로 STATUS가 Ready → NotReady로 바뀌는지 관찰
```

다른 터미널에서 테인트와 이벤트를 관찰한다.

```bash
kubectl describe node k8s-guide-worker2 | grep -A5 Taints
kubectl get events -A --field-selector involvedObject.kind=Node | grep k8s-guide-worker2
```

이 노드에 있던 Pod들의 상태도 확인한다(톨러레이션이 만료되기 전까지는 유지된다).

```bash
kubectl get pods -o wide --field-selector spec.nodeName=k8s-guide-worker2
```

**복구**

```bash
docker exec k8s-guide-worker2 pkill -CONT kubelet
kubectl get nodes -w
# 다시 Ready로 돌아오고, 테인트가 제거되는 것을 확인
```

---

## 실습 과제

**과제 1 — crictl로 전 과정 재현**
`kubectl logs`, `kubectl exec`, `kubectl get pods -o wide`에 대응하는 `crictl` 명령을 각각 직접 실행해 동일한 정보를 얻어 본다. API 서버가 멈췄다고 가정하고 이 명령들만으로 문제를 진단하는 절차를 정리한다.

**과제 2 — static Pod 직접 만들고 미러 Pod 확인**
워커 노드의 `/etc/kubernetes/manifests/`(kind 환경에서는 워커에 기본적으로 없는 디렉터리이므로 먼저 kubelet 설정에서 `staticPodPath`를 확인)에 간단한 static Pod를 배치하고, 생성된 미러 Pod의 `ownerReferences`가 `Node`를 가리키는지 확인한다. `kubectl delete`로 지워도 되살아나는지, 파일을 지우면 실제로 사라지는지 비교한다.

**과제 3 — PLEG 부하 실험**
Pod를 대량(50개 이상)으로 동시에 생성·삭제하며 `docker logs <worker>`에서 PLEG relist 시간이 늘어나는지, `kubectl describe node`에 PLEG 관련 경고가 나타나는지 관찰한다.

**과제 4 — 노드 축출 타임라인 측정**
실습 ④를 반복하되, `node-monitor-grace-period`가 걸리는 실제 시간과 Pod가 실제로 다른 노드로 재스케줄되기까지 걸리는 전체 시간(테인트 부착 시점 + `tolerationSeconds`)을 초 단위로 기록한다.

**과제 5 — kube-proxy 감시 대상 확인**
Service를 하나 만들고 그 뒤에 Pod를 추가/제거하면서 `kubectl get endpointslice`의 변화와 `kubectl logs -n kube-system -l k8s-app=kube-proxy`의 로그 타이밍을 비교한다. Service의 spec 자체를 바꿀 때와 백엔드 Pod만 바뀔 때 kube-proxy 로그에 어떤 차이가 있는지 관찰한다. (본격적인 데이터플레인 분석은 15장에서 이어간다.)

---

## 요약

- kubelet의 **syncLoop**은 설정 변경·PLEG·프로브·주기 동기화 등 여러 채널의 이벤트를 받아 **Pod마다 배정된 워커 고루틴**에 디스패치한다. **PLEG**는 기본적으로 런타임 상태를 폴링해 변화를 감지하며, relist가 지연되면 `PLEG is not healthy` → 노드 `NotReady`로 이어진다. **Evented PLEG**는 이벤트 푸시 방식으로 이 폴링을 줄이지만 아직 베타·기본 비활성화 상태다.
- **프로브 매니저**는 동기화 루프와 독립적으로 컨테이너마다 자체 주기로 liveness/readiness/startup을 실행한다. **상태 매니저**는 로컬에서 계산한 Pod 상태를 실제로 바뀔 때만 API 서버에 반영한다. **InPlacePodVerticalScaling**(v1.35 GA)은 이 syncPod 경로 위에서 재시작 없이 cgroup 자원 한도만 갱신하는 것을 목표로 한다.
- **CRI**는 kubelet과 런타임 사이의 gRPC 경계(`RuntimeService`/`ImageService`)다. **CNI 호출은 kubelet이 아니라 런타임이 `RunPodSandbox` 안에서** 수행한다. **shim**(예: `containerd-shim-runc-v2`) 덕분에 containerd 데몬이 재시작돼도 이미 뜬 컨테이너는 살아남는다. dockershim 제거는 이미지 호환성이 아니라 kubelet 내장 어댑터의 정리였다.
- **static Pod**는 kubelet이 로컬 매니페스트에서 직접 만드는 Pod로, API 서버 없이 컨트롤 플레인을 부트스트랩하는 수단이다. `kubectl`에 보이는 것은 소유자가 `Node`인 **읽기 전용 미러 Pod**이며, 실제 삭제는 파일을 지워야 한다.
- **볼륨 매니저**는 desired/actual 볼륨 집합을 비교하는 자체 조정 루프이며 CSI를 통해 attach/mount를 수행한다. **디바이스 플러그인**은 GPU 등 확장 자원을 `ListAndWatch`/`Allocate` RPC로 노드 capacity와 컨테이너에 연결한다.
- **kube-proxy**는 Service/EndpointSlice를 감시해 노드의 로컬 데이터플레인(iptables/IPVS/nftables)을 프로그래밍하는 노드별 데몬이다. **실제 데이터플레인 내부 구조와 성능 비교는 15장에서 다룬다.**
- 노드 하트비트는 **Lease(10초, 작음)**와 **status(5분, 큼)**로 이중화되어 있다. Lease 갱신이 `node-monitor-grace-period`(기본 40초)만큼 끊기면 `not-ready`/`unreachable` 테인트가 붙고, 기본 톨러레이션(`tolerationSeconds: 300`)이 흐른 뒤 Pod가 축출된다. 노드가 응답 불능일 때의 축출은 **API 서버 상의 오브젝트 삭제일 뿐, 실제 프로세스 종료를 보장하지 않는다.**

이것으로 1부 "내부 아키텍처"를 마친다. 컨트롤 플레인이 상태를 어떻게 저장하고 결정하는지(2~5장), 노드가 그 결정을 어떻게 실행하는지(6장)를 훑었다. **다음 부에서는** 이 모든 내부 동작을 애플리케이션 개발자가 어떻게 확장하는지 — client-go, CRD, 오퍼레이터, 어드미션 웹훅, 커스텀 스케줄러/API 서버 — 를 7장부터 차례로 연다.
