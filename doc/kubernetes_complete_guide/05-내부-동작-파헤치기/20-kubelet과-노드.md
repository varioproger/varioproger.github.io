---
title: "20장. kubelet과 노드"
parent: "5부. 내부 동작 파헤치기"
grand_parent: "Kubernetes Complete Guide"
nav_order: 20
---

# 20장. kubelet과 노드

> **학습목표**
> - kubelet의 동기화 루프와 Pod 워커 구조를 설명할 수 있다.
> - PodSpec이 실제 컨테이너가 되기까지의 경로를 추적할 수 있다.
> - CRI, CNI, CSI, Device Plugin 네 인터페이스의 역할을 구분한다.
> - static Pod가 왜 필요하고 어떻게 동작하는지 안다.
> - kubelet의 자원 관리와 축출 로직을 코드 수준에서 이해한다.
> - `crictl`로 노드에서 직접 컨테이너를 진단할 수 있다.

---

## 들어가며

19장에서 손으로 만든 것을 자동으로 해 주는 주체가 kubelet이다.

kubelet은 각 노드에서 도는 에이전트로, **"이 노드에 이 Pod들이 있어야 한다"는 상태를 실제 컨테이너로 구현**한다. 1장에서 본 조정 루프가 노드 수준에서 도는 것이다.

## 20.1 kubelet의 위치와 책임

### 노드에서 실제로 도는 것

```bash
docker exec k8s-guide-worker ps aux | grep -E 'kubelet|containerd' | grep -v grep
```

```
root  1  /usr/local/bin/containerd
root  2  /usr/bin/kubelet --bootstrap-kubeconfig=... --config=/var/lib/kubelet/config.yaml
```

**중요한 특징**: kubelet은 **컨테이너가 아니라 노드의 systemd 서비스**로 실행된다.

```bash
docker exec k8s-guide-worker systemctl status kubelet --no-pager | head -10
```

이유는 순환 의존을 피하기 위해서다. kubelet이 컨테이너라면 그것을 띄울 무언가가 필요하고, 그것도 kubelet이 해야 한다.

### kubelet의 책임 목록

```
① Pod 소스 감시      API 서버 watch, static Pod 파일, HTTP 엔드포인트
② 컨테이너 생명주기   CRI를 통해 컨테이너 생성/시작/중지/삭제
③ 볼륨 관리         CSI를 통해 마운트/언마운트
④ 네트워크          CRI를 통해 CNI 호출 (샌드박스 설정 시)
⑤ 프로브 실행       liveness/readiness/startup
⑥ 상태 보고        Pod status, 노드 status를 API 서버로
⑦ 자원 관리        cgroup 계층 관리, 축출
⑧ 이미지 관리      pull, 가비지 컬렉션
⑨ 로그 제공        kubectl logs, exec, port-forward의 실제 처리
```

**API 서버는 kubelet에게 명령하지 않는다.** kubelet이 API 서버를 watch하며 스스로 판단한다(풀 모델). 그래서 API 서버가 잠시 죽어도 노드의 Pod들은 계속 동작한다.

### 설정 파일

```bash
docker exec k8s-guide-worker cat /var/lib/kubelet/config.yaml
```

주요 항목들:

```yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration

# 동기화 주기
syncFrequency: 1m                    # 전체 동기화
fileCheckFrequency: 20s              # static Pod 디렉터리 확인
httpCheckFrequency: 20s
nodeStatusUpdateFrequency: 10s       # 노드 상태 보고
nodeStatusReportFrequency: 5m

# 자원 예약 (14.1절)
kubeReserved:   { cpu: 100m, memory: 256Mi }
systemReserved: { cpu: 100m, memory: 256Mi }
enforceNodeAllocatable: [pods]

# 축출 (14.4절)
evictionHard:
  memory.available: "100Mi"
  nodefs.available: "10%"
  imagefs.available: "15%"
evictionPressureTransitionPeriod: 5m

# 이미지 GC
imageGCHighThresholdPercent: 85
imageGCLowThresholdPercent: 80

# 컨테이너 GC
maxPods: 110
podPidsLimit: -1

# cgroup
cgroupDriver: systemd                # 또는 cgroupfs
cgroupsPerQOS: true

# 인증
authentication:
  anonymous: { enabled: false }
  webhook: { enabled: true }
  x509: { clientCAFile: /etc/kubernetes/pki/ca.crt }
authorization:
  mode: Webhook
```

> **⚠️ `cgroupDriver` 불일치는 흔한 장애 원인이다**
> kubelet과 컨테이너 런타임이 **같은 드라이버**를 써야 한다. 다르면 cgroup 계층이 두 벌 생겨 자원 제한이 제대로 동작하지 않는다.
>
> systemd를 쓰는 배포판에서는 양쪽 모두 `systemd`로 설정한다.
> ```toml
> # /etc/containerd/config.toml
> [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
>   SystemdCgroup = true
> ```

## 20.2 동기화 루프

### 전체 구조

```
┌─────────────── Pod 소스 (세 가지) ───────────────┐
│  ① API 서버 watch (이 노드에 할당된 Pod)          │
│  ② static Pod 디렉터리 (/etc/kubernetes/manifests)│
│  ③ HTTP 엔드포인트 (거의 안 씀)                    │
└────────────────────┬─────────────────────────────┘
                     │ 병합 (PodConfig)
                     ▼
            ┌─────────────────┐
            │  syncLoop       │  ← kubelet의 메인 루프
            └────────┬────────┘
                     │ Pod마다 하나씩 디스패치
                     ▼
        ┌───────────────────────────┐
        │  Pod Worker (Pod당 1개)     │  ← 고루틴
        │    syncPod()               │
        └────────────┬──────────────┘
                     ▼
      ┌──────────────────────────────────┐
      │  ① Pod 상태 계산                   │
      │  ② cgroup 생성                    │
      │  ③ 볼륨 마운트 대기 (Volume Manager)│
      │  ④ 이미지 pull                    │
      │  ⑤ 샌드박스(pause) 생성 → CNI 호출  │
      │  ⑥ init 컨테이너 순차 실행          │
      │  ⑦ 앱 컨테이너 시작                │
      │  ⑧ status 보고                    │
      └──────────────────────────────────┘
```

### syncLoop이 반응하는 이벤트

```go
// 개념적으로 이런 구조다
for {
    select {
    case update := <-configCh:      // Pod 추가/수정/삭제
    case e := <-plegCh:             // 컨테이너 상태 변화 (PLEG)
    case <-syncCh:                  // 주기적 동기화 (1초)
    case update := <-livenessCh:    // liveness 프로브 실패
    case update := <-readinessCh:   // readiness 상태 변화
    case update := <-startupCh:     // startup 프로브
    case <-housekeepingCh:          // 정리 작업 (2초)
    }
}
```

### PLEG — Pod Lifecycle Event Generator

kubelet이 컨테이너 상태 변화를 감지하는 방식이다.

**기존 방식(relisting)**: 1초마다 런타임에 **모든 컨테이너 목록을 요청**하고, 이전 결과와 비교해 변화를 찾는다.

```
1초마다: crictl ps → 이전 목록과 diff → 변화 이벤트 생성
```

**문제**: Pod가 많은 노드(100+)에서 이 relist가 무거워진다. 런타임이 느려지면 relist가 지연되고, 3분을 넘으면 kubelet이 자신을 비정상으로 판단한다.

```bash
kubectl describe node <node> | grep -i pleg
# PLEG is not healthy: pleg was last seen active 3m0s ago
```

**이 메시지가 보이면 노드가 곧 `NotReady`가 된다.** 원인은 대개 런타임의 응답 지연(디스크 I/O 포화, 컨테이너 과다)이다.

**Evented PLEG** (v1.27+ 베타)는 런타임이 **이벤트를 푸시**하도록 바꾼다. relist는 백업으로만 남는다. 대규모 노드에서 CPU 사용량이 눈에 띄게 준다.

```yaml
featureGates:
  EventedPLEG: true
```

### Pod Worker

**Pod마다 고루틴 하나**가 배정된다. 같은 Pod에 대한 sync는 직렬화되므로 경쟁 조건이 없다.

```
Pod A → worker A (순차 처리)
Pod B → worker B (병렬)
Pod C → worker C
```

Pod가 삭제되면 워커도 정리된다.

## 20.3 Pod가 만들어지는 전체 경로

19장에서 손으로 한 것을 kubelet이 어떤 순서로 하는지 따라가 본다.

```
① API 서버 watch로 새 Pod 감지 (spec.nodeName == 이 노드)
        ↓
② Pod Worker에 디스패치
        ↓
③ cgroup 계층 생성
   /sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/
     kubepods-burstable-pod<UID>.slice/
   → QoS 클래스(14.2절)에 따라 위치가 결정된다
        ↓
④ Volume Manager가 볼륨 마운트 (12.4절)
   CSI NodeStageVolume → NodePublishVolume
   → 완료될 때까지 대기
        ↓
⑤ 이미지 존재 확인 / pull
   imagePullPolicy에 따라 (5.2절)
   imagePullSecrets로 인증
        ↓
⑥ 샌드박스(pause 컨테이너) 생성
   CRI RunPodSandbox
   → 런타임이 네트워크 네임스페이스 생성
   → CNI ADD 호출 → veth 생성, IP 할당 (19.3절과 동일)
        ↓
⑦ init 컨테이너를 순서대로 실행 (5.5절)
   CRI CreateContainer → StartContainer
   → 각각 완료(exit 0)를 기다린 뒤 다음
   → restartPolicy: Always인 사이드카는 계속 실행
        ↓
⑧ 앱 컨테이너들을 동시에 시작
   postStart 훅 실행
        ↓
⑨ 프로브 시작 (6.2절)
   startup → (통과 후) liveness + readiness
        ↓
⑩ status를 API 서버에 보고
   phase, conditions, containerStatuses
```

**이 순서가 6장에서 본 Pod 생명주기의 실제 구현이다.**

### CRI로 직접 관찰하기

```bash
docker exec -it k8s-guide-worker bash

# 샌드박스(Pod) 목록
crictl pods

# 컨테이너 목록
crictl ps -a

# 특정 Pod의 컨테이너
crictl ps --pod <POD_ID>

# 상세 정보
crictl inspect <CONTAINER_ID> | jq '.status, .info.pid, .info.runtimeSpec.linux.resources'

# 로그 (kubectl logs가 결국 이것이다)
crictl logs <CONTAINER_ID>

# 이미지
crictl images

# 통계
crictl stats
```

**`crictl`은 kubelet과 같은 CRI 소켓을 쓴다.** kubelet이 보는 것과 정확히 같은 뷰다.

```bash
crictl info | jq '.config.containerdEndpoint'
# unix:///run/containerd/containerd.sock
```

> **⚠️ `crictl`로 컨테이너를 지우면 안 된다**
> kubelet이 즉시 다시 만든다(조정 루프). 게다가 kubelet의 내부 상태와 어긋나 혼란을 일으킬 수 있다. **진단용으로만 쓴다.**

## 20.4 kubelet의 네 인터페이스

kubelet은 자신이 직접 하지 않는 일을 표준 인터페이스로 위임한다.

```
        ┌─────────────────────────────┐
        │          kubelet            │
        └──┬────────┬────────┬────────┘
           │        │        │        │
    ┌──────▼──┐ ┌───▼───┐ ┌──▼───┐ ┌──▼──────────┐
    │   CRI   │ │  CNI  │ │ CSI  │ │Device Plugin│
    └────┬────┘ └───┬───┘ └──┬───┘ └──┬──────────┘
         │          │        │        │
    containerd   Calico    EBS CSI   NVIDIA
    CRI-O        Cilium    Ceph CSI  Intel QAT
```

### CRI (Container Runtime Interface)

**gRPC 인터페이스**다. 두 서비스로 나뉜다.

```protobuf
service RuntimeService {
  // 샌드박스 (Pod)
  rpc RunPodSandbox(...)      // pause 컨테이너 생성 + CNI 호출
  rpc StopPodSandbox(...)
  rpc RemovePodSandbox(...)
  rpc PodSandboxStatus(...)
  rpc ListPodSandbox(...)

  // 컨테이너
  rpc CreateContainer(...)
  rpc StartContainer(...)
  rpc StopContainer(...)
  rpc RemoveContainer(...)
  rpc ListContainers(...)
  rpc ContainerStatus(...)

  // 실행과 스트리밍
  rpc ExecSync(...)           // 프로브의 exec
  rpc Exec(...)               // kubectl exec
  rpc Attach(...)
  rpc PortForward(...)

  // 상태
  rpc ContainerStats(...)
  rpc ListContainerStats(...)
  rpc Status(...)
}

service ImageService {
  rpc ListImages(...)
  rpc ImageStatus(...)
  rpc PullImage(...)
  rpc RemoveImage(...)
  rpc ImageFsInfo(...)
}
```

**중요**: **CNI 호출은 kubelet이 하지 않는다.** `RunPodSandbox` 안에서 **런타임이** CNI 플러그인을 호출한다. 그래서 CNI 설정은 `/etc/cni/net.d/`에 있고 containerd가 읽는다.

```bash
docker exec k8s-guide-worker ls /etc/cni/net.d/
docker exec k8s-guide-worker cat /etc/cni/net.d/10-kindnet.conflist
```

### CSI — 볼륨

12.4절에서 다뤘다. kubelet은 노드 플러그인의 `NodeStageVolume`과 `NodePublishVolume`을 호출한다.

```bash
docker exec k8s-guide-worker ls /var/lib/kubelet/plugins_registry/
docker exec k8s-guide-worker ls /var/lib/kubelet/pods/*/volumes/ 2>/dev/null | head
```

### Device Plugin — 특수 하드웨어

GPU, FPGA, 고성능 NIC 같은 자원을 노출한다.

```yaml
resources:
  limits:
    nvidia.com/gpu: 2
```

**동작**
1. Device Plugin이 DaemonSet으로 배포된다
2. kubelet의 등록 소켓(`/var/lib/kubelet/device-plugins/kubelet.sock`)에 자신을 등록
3. `ListAndWatch`로 사용 가능한 디바이스 목록을 스트리밍
4. kubelet이 노드의 `status.capacity`에 추가
5. Pod가 요청하면 `Allocate` 호출 → 디바이스 파일과 환경변수 정보를 받아 컨테이너에 주입

```bash
kubectl get node <node> -o jsonpath='{.status.capacity}' | jq
# { "cpu": "4", "memory": "8Gi", "nvidia.com/gpu": "2", ... }
```

**확장 자원은 정수만 가능하고, requests == limits여야 한다.** GPU를 0.5개 요청할 수 없다.

### Topology Manager — NUMA 정렬

고성능 워크로드에서는 CPU, 메모리, 디바이스가 **같은 NUMA 노드**에 있어야 지연이 낮다.

```yaml
# kubelet 설정
cpuManagerPolicy: static
memoryManagerPolicy: Static
topologyManagerPolicy: single-numa-node    # none | best-effort | restricted | single-numa-node
```

**`cpuManagerPolicy: static`** 은 Guaranteed QoS이고 CPU가 정수인 컨테이너에 **전용 CPU 코어를 배타적으로 할당**한다. CFS 스로틀링(14.3절) 없이 코어를 독점하므로 지연이 예측 가능해진다.

```yaml
# 이 조건을 만족해야 전용 코어를 받는다
resources:
  requests: { cpu: "2", memory: 4Gi }
  limits:   { cpu: "2", memory: 4Gi }     # 정수, requests == limits
```

통신사 워크로드(NFV)나 고빈도 트레이딩에서 쓴다.

## 20.5 static Pod

### 순환 의존 문제

3장에서 컨트롤 플레인 컴포넌트가 `kube-system`에 Pod로 떠 있는 것을 봤다.

```bash
kubectl get pods -n kube-system | grep k8s-guide-control-plane
# etcd-k8s-guide-control-plane
# kube-apiserver-k8s-guide-control-plane
# kube-controller-manager-k8s-guide-control-plane
# kube-scheduler-k8s-guide-control-plane
```

**여기에 논리적 문제가 있다.** API 서버가 Pod로 실행된다면, 그 Pod는 누가 만드는가? Pod를 만들려면 API 서버가 필요한데, API 서버가 아직 없다.

**static Pod가 이 순환을 끊는다.**

### 동작 방식

kubelet은 **로컬 디렉터리를 감시**해 그 안의 매니페스트로 Pod를 직접 만든다. API 서버가 전혀 관여하지 않는다.

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
# kubelet config
staticPodPath: /etc/kubernetes/manifests
fileCheckFrequency: 20s
```

**특징**

| | 일반 Pod | static Pod |
|---|---|---|
| 생성 주체 | 컨트롤러 → API 서버 → 스케줄러 → kubelet | **kubelet이 직접** |
| 스케줄링 | 스케줄러가 노드 결정 | 파일이 있는 노드에 고정 |
| 이름 | 랜덤 접미사 | `<name>-<nodename>` |
| 삭제 | `kubectl delete` | **파일을 지워야 함** |
| API 서버 필요 | ✅ | ❌ |

### 미러 Pod

`kubectl get pods`에서 보이는 이유는 **미러 Pod** 때문이다.

kubelet이 static Pod를 만든 뒤, API 서버에 "이런 Pod가 이 노드에 있다"고 읽기 전용 사본을 등록한다.

```bash
kubectl get pod etcd-k8s-guide-control-plane -n kube-system \
  -o jsonpath='{.metadata.ownerReferences}' | jq
```
```json
[{ "apiVersion": "v1", "kind": "Node", "name": "k8s-guide-control-plane", ... }]
```

**소유자가 Node다.** 일반 Pod는 ReplicaSet 등이 소유한다(4.2절).

```bash
# 미러 Pod를 지워도
kubectl delete pod etcd-k8s-guide-control-plane -n kube-system
# 즉시 다시 나타난다 — 파일이 그대로이므로
```

### 실습: static Pod 만들기

```bash
docker exec k8s-guide-worker bash -c 'cat > /etc/kubernetes/manifests/hello-static.yaml <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: hello-static
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "while true; do echo static pod alive; sleep 30; done"]
      resources:
        requests: { cpu: 10m, memory: 16Mi }
EOF'
```

```bash
# 20초 이내에 나타난다
sleep 25
kubectl get pods -A | grep hello-static
# default  hello-static-k8s-guide-worker  1/1  Running
```

**이름에 노드명이 붙은 것**에 주목하자.

```bash
kubectl logs hello-static-k8s-guide-worker
kubectl delete pod hello-static-k8s-guide-worker
sleep 5
kubectl get pods | grep hello-static      # 다시 살아 있다
```

```bash
# 진짜 삭제는 파일 제거
docker exec k8s-guide-worker rm /etc/kubernetes/manifests/hello-static.yaml
sleep 25
kubectl get pods | grep hello-static      # 사라졌다
```

**컨트롤 플레인 컴포넌트를 수정하는 방법도 이것이다.** API 서버에 플래그를 추가하려면 `/etc/kubernetes/manifests/kube-apiserver.yaml`을 편집한다. kubelet이 변경을 감지해 Pod를 재생성한다.

> **⚠️ 컨트롤 플레인 매니페스트 편집은 위험하다**
> YAML을 잘못 쓰면 **API 서버가 뜨지 않고 클러스터에 접근할 수 없게 된다.** 반드시 백업하고, 노드 콘솔 접근 수단을 확보한 뒤에 수정한다.
> ```bash
> cp /etc/kubernetes/manifests/kube-apiserver.yaml /root/kube-apiserver.yaml.bak
> ```

## 20.6 노드 상태와 자원 관리

### 노드 상태 보고

kubelet은 주기적으로 노드 상태를 갱신한다.

```bash
kubectl get node k8s-guide-worker -o jsonpath='{.status.conditions}' | jq
```
```json
[
  { "type": "MemoryPressure", "status": "False", "reason": "KubeletHasSufficientMemory" },
  { "type": "DiskPressure",   "status": "False" },
  { "type": "PIDPressure",    "status": "False" },
  { "type": "Ready",          "status": "True",  "reason": "KubeletReady" }
]
```

**Lease 기반 하트비트**가 별도로 있다.

```bash
kubectl get leases -n kube-node-lease
kubectl get lease k8s-guide-worker -n kube-node-lease -o yaml
```

**왜 Lease를 따로 두는가?** 노드 상태 오브젝트는 크다. 수천 노드가 10초마다 전체 status를 갱신하면 etcd가 감당하지 못한다. Lease는 작은 오브젝트라 자주 갱신해도 부담이 적다.

```
Lease 갱신:  10초마다 (nodeStatusUpdateFrequency)
status 갱신: 5분마다 또는 변화가 있을 때 (nodeStatusReportFrequency)
```

**노드 컨트롤러**(21장)가 Lease를 보고 노드 생사를 판단한다.

```
40초(--node-monitor-grace-period) 동안 Lease 갱신 없음
    → 노드 컨디션을 Unknown으로
    → not-ready / unreachable 테인트 부착 (15.4절)
    → 5분(tolerationSeconds) 후 Pod 축출
```

### 축출 로직 상세

14.4절에서 개념을 봤다. kubelet의 실제 구현은 이렇다.

```
① 10초마다 신호 확인 (memory.available, nodefs.available, ...)
        ↓
② 임계값 초과 감지
        ↓
③ 노드 컨디션 설정 (MemoryPressure=True)
   → 스케줄러가 새 BestEffort Pod를 보내지 않음
        ↓
④ 회수 시도
   · imagefs 부족 → 사용하지 않는 이미지 삭제
   · nodefs 부족 → 죽은 컨테이너/로그 정리
        ↓
⑤ 그래도 부족하면 Pod 축출
   순서: BestEffort → Burstable(requests 초과 큰 순) → Guaranteed
   같은 등급 안에서는 Priority가 낮은 순 (15.6절)
        ↓
⑥ 한 번에 하나씩 축출하고 다시 측정
        ↓
⑦ 임계 아래로 내려오면 중단
   evictionPressureTransitionPeriod(5분) 후 컨디션 해제
```

**축출된 Pod 확인**

```bash
kubectl get pods -A --field-selector status.phase=Failed
kubectl get events -A --field-selector reason=Evicted
```

**축출된 Pod 오브젝트는 남는다.** 정리하려면:

```bash
kubectl delete pods -A --field-selector status.phase=Failed
```

### 가비지 컬렉션

**이미지 GC**

```yaml
imageGCHighThresholdPercent: 85     # 이 이상 차면 GC 시작
imageGCLowThresholdPercent: 80      # 이 아래로 내려갈 때까지
imageMinimumGCAge: 2m               # 이보다 최근 이미지는 보존
```

가장 오래 쓰이지 않은 이미지부터 삭제한다.

**컨테이너 GC**

```yaml
# 폐기 예정 플래그이지만 개념은 유효
--maximum-dead-containers-per-container=1
--maximum-dead-containers=-1
--minimum-container-ttl-duration=0s
```

죽은 컨테이너를 정리한다. 단, **`--previous` 로그를 위해 하나는 남긴다**(6.3절).

**로그 로테이션**

```yaml
containerLogMaxSize: 10Mi
containerLogMaxFiles: 5
```

노드당 최대 로그 크기를 계산할 수 있다: `maxPods × 컨테이너 수 × 10Mi × 5`. 110 Pod면 **수십 GB**가 될 수 있으므로 디스크 용량 계획에 반영해야 한다.

## 20.7 kubelet 보안

### 인증과 인가

kubelet도 API 서버를 갖는다(포트 10250). 여기에 접근하면 **모든 컨테이너에서 명령을 실행할 수 있다.**

```yaml
authentication:
  anonymous:
    enabled: false            # ★ 반드시 false
  webhook:
    enabled: true             # API 서버에 인증 위임
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt
authorization:
  mode: Webhook               # ★ AlwaysAllow 금지
```

> **⚠️ `anonymous: true` + `authorization: AlwaysAllow`**
> 이 조합이면 **네트워크에 접근할 수 있는 누구나 모든 컨테이너를 조작할 수 있다.** 과거 유명한 침해 사고(테슬라 크립토재킹 등)의 원인이었다.
>
> 확인:
> ```bash
> curl -k https://<node-ip>:10250/pods        # 응답이 오면 취약
> ```

### NodeRestriction 어드미션 플러그인

17.5절에서 언급한 그것이다. 침해된 노드의 kubelet이 할 수 있는 일을 제한한다.

```
kubelet이 할 수 있는 것:
  ✓ 자기 Node 오브젝트 수정 (일부 필드만)
  ✓ 자기 노드에 할당된 Pod의 status 수정
  ✓ 자기 노드의 Pod가 쓰는 Secret/ConfigMap 조회

kubelet이 할 수 없는 것:
  ✗ 다른 노드의 Node 오브젝트 수정
  ✗ 다른 노드의 Pod 조작
  ✗ 자기 노드에 라벨을 임의로 추가 (스케줄링 조작 방지)
  ✗ 자기 노드의 테인트 제거
```

**Node Authorizer**도 함께 동작한다. kubelet은 `system:nodes` 그룹에 속하며, **자기 노드와 관련된 리소스만** 조회할 수 있다.

```bash
docker exec k8s-guide-control-plane grep -E 'authorization-mode|enable-admission' \
  /etc/kubernetes/manifests/kube-apiserver.yaml
# --authorization-mode=Node,RBAC
```

**`Node` 인가 모드가 앞에 있는 것**을 확인하자.

## 20.8 노드 진단

### 체크 순서

```bash
# ① 노드 상태
kubectl get nodes
kubectl describe node <node>

# ② kubelet 서비스
docker exec <node> systemctl status kubelet
docker exec <node> journalctl -u kubelet -n 100 --no-pager

# ③ 런타임 상태
docker exec <node> crictl info | jq '.status'
docker exec <node> systemctl status containerd

# ④ 디스크와 메모리
docker exec <node> df -h
docker exec <node> free -h

# ⑤ 컨테이너 상태
docker exec <node> crictl ps -a | head -20
docker exec <node> crictl stats

# ⑥ cgroup 확인
docker exec <node> cat /sys/fs/cgroup/memory.pressure
```

### 증상별 원인표

| 증상 | 원인 | 확인 |
|---|---|---|
| `NotReady` | kubelet 다운, 런타임 다운, 네트워크 단절 | `systemctl status kubelet`, journalctl |
| `PLEG is not healthy` | 런타임 응답 지연, 컨테이너 과다, 디스크 I/O 포화 | `crictl ps \| wc -l`, `iostat` |
| `MemoryPressure=True` | 노드 메모리 부족 | `free -h`, requests 검토 (14장) |
| `DiskPressure=True` | 디스크 부족 | `df -h`, 이미지 GC, 로그 크기 |
| `PIDPressure=True` | PID 고갈 | `podPidsLimit` 설정 |
| Pod가 `ContainerCreating`에서 멈춤 | 이미지 pull, 볼륨 마운트, CNI 실패 | `describe pod` 이벤트, kubelet 로그 |
| `Too many pods` | `maxPods`(기본 110) 도달 | 노드 추가 또는 `maxPods` 상향 |
| 노드가 자꾸 재시작 | OOM으로 kubelet 자체가 죽음 | `kubeReserved` 상향 (14.1절) |
| `cgroup` 관련 에러 | cgroupDriver 불일치 | kubelet과 containerd 설정 비교 |

### kubelet 로그 읽기

```bash
docker exec k8s-guide-worker journalctl -u kubelet -f
# 또는 kind에서는
docker logs k8s-guide-worker 2>&1 | tail -50
```

**로그 레벨을 올리면** 훨씬 자세히 볼 수 있다.

```bash
# 일시적으로 (재시작 시 원복)
docker exec k8s-guide-worker sh -c \
  'kill -USR1 $(pidof kubelet)'    # 일부 버전에서 지원

# 또는 설정 변경
# --v=4  (기본 2)
```

| `-v` 레벨 | 내용 |
|---|---|
| 2 | 기본. 중요한 변경 |
| 4 | 디버깅에 유용한 상세 정보 |
| 6 | 요청한 리소스 표시 |
| 8 | HTTP 요청 본문 |

### 노드 디버깅 Pod

5.3절에서 본 도구다.

```bash
kubectl debug node/k8s-guide-worker -it --image=busybox
# 노드의 파일 시스템이 /host에 마운트된다
chroot /host
```

**노드에 SSH 없이 진단할 수 있다.** 단, 이 명령을 쓸 수 있다는 것은 곧 노드를 장악할 수 있다는 뜻이므로 RBAC으로 제한해야 한다(17.3절).

---

## 실습 과제

**과제 1 — Pod 생성 경로 전체 추적**
kubelet 로그 레벨을 4로 올리고 Pod를 하나 만든 뒤, 로그에서 20.3절의 10단계를 각각 찾아본다. 어느 단계에서 시간이 가장 오래 걸리는지 측정한다.

**과제 2 — static Pod로 컨트롤 플레인 수정**
`kube-apiserver.yaml`을 백업한 뒤 `--v=4` 플래그를 추가하고, kubelet이 Pod를 재생성하는 것을 관찰한다. 로그가 얼마나 늘어나는지 확인하고 원복한다. **(반드시 백업할 것)**

**과제 3 — 축출 재현**
`evictionHard.memory.available`을 매우 크게(예: `4Gi`) 설정해 인위적으로 축출을 유발하고, BestEffort → Burstable 순서로 축출되는지 확인한다.

**과제 4 — crictl로 kubectl 대체**
`kubectl logs`, `kubectl exec`, `kubectl get pods`에 대응하는 `crictl` 명령을 각각 실행해 같은 결과를 얻어 본다. 이 경험이 API 서버가 죽었을 때의 진단 능력이 된다.

**과제 5 — kubelet API 보안 확인**
노드의 10250 포트에 익명 접근을 시도해 차단되는지 확인한다.
```bash
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- \
  curl -sk https://<node-ip>:10250/pods
```
`Unauthorized`가 나와야 정상이다.

---

## 요약

- **kubelet은 컨테이너가 아니라 노드의 systemd 서비스**로 실행된다. 순환 의존을 피하기 위해서다. API 서버가 명령하는 것이 아니라 kubelet이 watch하며 스스로 판단한다.
- **syncLoop**이 여러 채널(설정 변경, PLEG, 프로브, 주기적 동기화)의 이벤트를 받아 **Pod마다 하나씩 배정된 워커**에 디스패치한다.
- **PLEG**는 컨테이너 상태 변화를 감지한다. relist가 지연되면 `PLEG is not healthy`가 나오고 노드가 `NotReady`가 된다. **Evented PLEG**가 이 부하를 크게 줄인다.
- Pod 생성은 **cgroup 생성 → 볼륨 마운트 → 이미지 pull → 샌드박스(CNI) → init 컨테이너 → 앱 컨테이너 → 프로브 → status 보고** 순서다. 19장에서 손으로 한 것과 정확히 대응한다.
- **CNI는 kubelet이 아니라 런타임이 호출한다.** `RunPodSandbox` 안에서 일어난다.
- kubelet은 **CRI**(런타임), **CSI**(스토리지), **Device Plugin**(특수 하드웨어)을 직접 호출하고, **CNI**는 런타임에 위임한다. `cpuManagerPolicy: static`은 Guaranteed + 정수 CPU 컨테이너에 전용 코어를 준다.
- **static Pod**는 kubelet이 로컬 파일에서 직접 만드는 Pod로, API 서버 없이 컨트롤 플레인을 부트스트랩하는 수단이다. `kubectl`에 보이는 것은 **읽기 전용 미러 Pod**이며, 삭제하려면 파일을 지워야 한다.
- 노드 하트비트는 **Lease**(10초, 작음)와 **status**(5분, 큼)로 분리되어 있다. 대규모 클러스터의 etcd 부하를 줄이기 위해서다.
- kubelet API(10250)에 **익명 접근이 열려 있으면 클러스터 전체가 장악된다.** `anonymous: false`, `authorization: Webhook`, 그리고 API 서버의 **`--authorization-mode=Node,RBAC`** 와 **NodeRestriction**이 필수다.

**다음 장에서는** kubelet이 대화하는 상대인 컨트롤 플레인을 연다. API 서버가 요청을 처리하는 내부 경로와, 수십 개의 컨트롤러가 어떤 패턴으로 동작하는지 살펴본다.

---

**참고 원서**: *Core Kubernetes* 9장, 4.4~4.6절
