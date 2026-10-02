---
title: "Part 07. Kubernetes 아키텍처 · CNI(Calico) · Pod · Service 구축 순서"
parent: "Docker·K8s 인프라 구축 실습 순서"
nav_order: 7
---

# Part 07. Kubernetes 아키텍처 · CNI(Calico) · Pod · Service 구축 순서

> 출처: Kubernetes 기초&심화 (CKA&CKAD) CH04(아키텍처 이해) ~ CH05(Pod 생성과 관리) ~ CH06(Pod 네트워킹을 위한 Service) 자료 064~082
> 실습 환경(자료 기준): VirtualBox VM 4대 (k8s-master 192.168.56.100, k8s-node1 .101, k8s-node2 .102, k8s-node3 .103), Kubernetes v1.28.x, kubeadm 구성, 컨테이너 런타임 containerd, CNI Calico, 접속 도구 MobaXterm. 작업 계정 `student`, 작업 디렉터리 `~/LABs/...`
> 참고: 원본 PDF(강사 이현용, Fast campus)는 영상 화면(슬라이드·터미널)과 강사 음성(STT) 기반 '입문자용 학습 Summary' 문서이다. 한글 본문은 PDF 페이지를 이미지로 렌더링해 OCR + 육안 판독으로 확인하여 보강했다(OCR 오독이 있는 터미널 출력의 세부 숫자는 근사값). 자료에서 확인되지 않는 내용은 적지 않았다.

---

## 전체 구축 순서 한눈에 보기

| Step | 주제 | 핵심 |
|---|---|---|
| 1 | Kubernetes 구조 이해 | Control Plane / Worker Node, Pod 배포 9단계, kubectl run 7단계 |
| 2 | Control Plane 구성요소 확인 | kube-apiserver, etcd(etcdctl), kube-scheduler, controller-manager |
| 3 | Worker Node 구성요소 · Add-on(CoreDNS) | kubelet, kube-proxy, container runtime(CRI/OCI) |
| 4 | CNI (Calico) 확인 | calico-node DaemonSet, calicoctl, IPAM, BIRD, tunl0/cali |
| 5 | 일반적인 애플리케이션 → Pod 배포 과정 | Docker 이미지 → push → Pod YAML → Service(externalIPs) |
| 6 | Kubernetes object / YAML 작성법 | api-resources, api-versions, explain |
| 7 | Pod 기본 관리 | Pause 컨테이너, multi-container, 명령형/선언형, dry-run, MySQL Pod |
| 8 | Pod 네트워크 · 종료 · lifecycle | Container/Pod/Node 통신, SIGTERM, Phase, Conditions |
| 9 | Pod 설계 패턴 (runtime / init / sidecar) | Deployment, initContainers, sidecar(emptyDir) |
| 10 | Label / Annotation | --labels, --show-labels, selector |
| 11 | Node Schedule | nodeSelector, nodeName, taint/toleration |
| 12 | Probe | liveness / readiness / startup |
| 13 | Service 필요성과 동작 원리 | selector, Endpoints, DNS, kube-proxy iptables, sessionAffinity |
| 14 | Service ClusterIP | 클러스터 내부 통신 |
| 15 | Service NodePort | 30000~32767, externalTrafficPolicy |
| 16 | Service LoadBalancer | CSP 연동, GKE 데모, 온프레미스 pending |
| 17 | MetalLB 구성 | VM 환경에서 LoadBalancer 사용 |
| 18 | Amazon EKS LoadBalancer | Classic LB, NLB annotation |
| 19 | Ingress | Ingress Controller(NGINX), path/host 라우팅 |

---

## Step 1. Kubernetes 구조 이해 (Control Plane / Worker Node)

### [목적]
Kubernetes 클러스터가 어떤 구성요소로 이루어지고, `kubectl apply` / `kubectl run` 시 내부에서 어떤 순서로 처리되는지 이해한다.

### [이론 설명]
- **Kubernetes architecture(강사 정의)**: 클러스터 전반의 서비스 디스커버리 등을 위한 오픈소스 플랫폼. 클러스터에는 하나 이상의 control plane과 하나 이상의 컴퓨팅 Node(worker node = data plane)가 있다. control plane은 전체 클러스터를 중앙 관리하고 API 트래픽으로 각 Node와 통신하며, 사용자가 원하는 상태(Desired State)를 제공하기 위해 적합한 컴퓨팅 Node에 object를 스케줄링한다. 각 Node는 control plane과 통신하는 kubelet daemon과 함께 Docker/containerd/CRI-O 같은 컨테이너 런타임을 실행하며(이 수업은 containerd), Node는 온프레미스 서버·클라우드 VM(AWS EC2 등)·베어메탈 어느 것이든 된다.
- **Control Plane(Master)**: 클러스터 전체를 관리하는 두뇌. API Server, etcd, Scheduler, Controller Manager, (Cloud Controller Manager). 사용자가 선언한 원하는 상태(Desired State)를 유지. "하나 이상"이라는 말은 마스터를 여러 대 둘 수 있다는 뜻 — 이 수업 클러스터는 마스터 1대지만 대규모 서비스 운영사는 멀티 마스터를 지향한다.
- **Worker Node(Data Plane)**: 실제 애플리케이션(Pod)이 실행되는 일꾼. kubelet, kube-proxy, container runtime. Node는 물리 서버/VM/AWS EC2 등 무엇이든 가능. Kubernetes는 서버를 직접 조작하지 않고 'Node'라는 object로 추상화해 관리한다. 한 Pod에는 여러 컨테이너를 넣을 수 있고(ambassador/adapter 같은 설계 패턴, 예: ambassador = Pod 안에 프록시 컨테이너를 두어 안쪽 컨테이너의 프록시 역할), 워커 노드 하나에 문제가 생기면 그 노드의 Pod를 다른 노드에 재배포해 서비스 중단을 피하는 것이 클러스터의 이점(내결함성/HA)이다. 운영에서는 Control Plane도 여러 서버에 걸쳐 구성한다.
- **구조도 읽는 법(강사 설명)**: 모든 컴포넌트는 API Server를 향해 화살표를 갖는다(모든 통신은 API Server 경유). kubelet·kube-proxy는 Worker뿐 아니라 마스터에도 올라가 있으나, 마스터는 기본적으로 앱 배포를 막아 둔다(이것이 taint). 각 노드에는 kube-proxy, kubelet, containerd가 있고 containerd-shim과 runc를 거쳐 OS 커널과 연결된다.
- 구성요소 요약

| 구성요소 | 역할 |
|---|---|
| API Server | REST API 진입점. 모든 요청의 단일 창구 |
| etcd | key-value DB, SSOT(Single Source Of Truth). 클러스터 상태 저장 |
| Scheduler | Pod를 어느 Node에 배치할지 결정(Bind Pod to Node) |
| Controller Manager | Desired State와 Current State 비교, 차이 보정(self-healing) |
| Cloud Controller Manager | 클라우드 제공자 API 연동(CCM) |
| kubelet | Worker에서 podSpec대로 Pod 실행, probe 수행, 상태 보고 |
| kube-proxy | Service/Endpoint 기반 네트워크 규칙(iptables/IPVS) 관리, DaemonSet |
| container runtime | containerd, CRI-O 등. CRI로 kubelet과 통신, OCI 표준 사용(runc) |
| CNI(Calico) | Pod 네트워크 구성 |

- **Pod 배포 과정 (`kubectl apply -f pod.yaml`, 9단계)**
  (강사는 "이미 Pod YAML을 작성했다"고 가정하고 선언형 `kubectl apply -f pod.yaml` 실행 시점부터 그림에 번호를 붙여 설명. 이 수업에서는 설치·운영을 한 관리자 계정 `student`로 실행)
  0. 개발자(Dashboard 또는 kubectl)가 YAML을 TLS로 암호화하여 API Server에 전달
  1. API Server: Authentication check(인증) — 올바른 계정인지 확인
  2. API Server: Authorization check(인가) — 권한이 있는지 확인. RBAC(Role Based Access Control)의 cluster-admin, 읽기 전용 여부 등
  3. Admission controller(승인 제어) — 인증·인가 정보를 종합해 "사용해도 되는지" 최종 판단. 문제가 있으면 화면에 오류 메시지를 돌려줌
  4. 통과한 Pod 요청 정보를 etcd에 기록, etcd는 기록 후 "OK"에 해당하는 응답(acknowledgement)을 돌려줌
  5. API Server는 어느 노드에 배치할지 스스로 결정하지 않고 Scheduler에게 문의(Scheduler가 API Server를 watch). Scheduler는 API Server에 etcd의 노드 정보를 요청하고 받은 정보로 결정
  6. Scheduler: 필터링(filter)으로 적합한 노드를 걸러 내고, 노드별 리소스 사용률·Pod 개수 등으로 점수(score)를 매겨 가장 높은 노드에 Pod를 바인딩(Bind Pod to Node), 결과를 API Server에 알림
  7. 해당 노드의 kubelet은 계속 API Server를 바라보며(watch) 지시를 기다리다 "Pod를 이 노드에 생성하라"는 지시를 받음
  8. kubelet이 컨테이너 런타임(containerd)에 컨테이너 생성 명령 → containerd는 OCI(Open Container Initiative) 표준에 따라 containerd-shim과 runc를 통해 OS 커널 기능으로 컨테이너/Pod 생성
  9. kubelet이 컨테이너 네트워킹(CNI)을 통해 생성 결과(Pod IP 포함)를 API Server에 보고 → API Server가 다시 etcd에 기록 → 사용자는 `kubectl get pod`로 상태 조회
  - 강사 정리 포인트: ① Kubernetes는 선언한 상태(Desired State)를 유지하는 시스템, ② 모든 컴포넌트는 API Server를 통해서만 통신, ③ etcd는 단일 진실 공급원(SSOT)이며 변경 이력을 계속 추가하는 방식으로 저장, ④ 사용자에게 상태를 "푸시"하는 것이 아니라 사용자가 조회할 때 현재 상태를 알려 줌.
- **Controller Manager와 self-healing**: 위 흐름에서 언급되지 않지만 거의 모든 object에 관여한다. 안에 든 컨트롤러들이 제어 루프(control loop)로 계속 관찰하며 "원하는 상태"와 "현재 상태"가 같은지 확인하고, 다르면 Pod를 재시작/재생성하는 셀프 힐링(self-healing)을 수행한다.
- **`kubectl run` 흐름(명령형, `kubectl run <pod-name> --image=<image-name>`, 7단계)**: ① 요청을 API 서버가 검증 ② API 서버가 요청을 control plane의 Scheduler로 전달 ③ API 서버만 etcd와 상호작용할 수 있으므로 Scheduler가 API 서버에 클러스터 정보 요청 ④ API 서버가 etcd에서 데이터를 읽어 제공 ⑤ 정보를 받은 Scheduler가 그 정보를 기반으로 지정된 노드에 Pod를 할당하고 메시지를 API 서버에 전달 ⑥ 요청을 받은 노드의 kubelet이 CRI를 통해 컨테이너 런타임과 상호작용해 Pod 생성·실행 ⑦ Pod가 실행되는 동안 Controller Manager가 Desired state와 Current state가 일치하는지 지속 확인. (kubelet 안의 gRPC client가 CRI protobuf로 containerd 안의 CRI Plugin(gRPC server)과 통신하고, containerd는 Pod 안 컨테이너마다 별도의 containerd-shim을 만들어 shim이 실제 컨테이너를 관리한다.)
- **CRI vs OCI**: CRI(Container Runtime Interface)는 kubelet이 컨테이너 런타임과 대화하기 위한 표준 API 규약(덕분에 Docker/containerd/CRI-O를 바꿔 끼울 수 있음), OCI는 컨테이너 형식·런타임 표준(runc).
- **CRI 변천**: Docker 시절(kubelet → CRI → dockershim → Docker → containerd → container) → Containerd 1.0(kubelet → CRI-Containerd 별도 프로세스 → containerd → container) → Containerd 1.1(CRI 기능이 containerd 내부 CRI plugin으로 통합, kubelet → containerd(CRI plugin) → container). **이 수업 환경이 마지막 구조**.
- **관리형 서비스**: 이 수업은 VM으로 마스터·워커를 직접 구성해 접속·관리가 모두 가능. 반면 Amazon EKS, Google GKE, Azure AKS는 Control Plane을 클라우드가 관리하고 사용자는 Worker Node(노드 그룹)만 관리.
- **Cluster/Node 정의(슬라이드)**: Cluster = 컨테이너화된 애플리케이션을 실행하는 물리·가상 Node의 그룹으로, K8s object의 성능·안정성을 보장하는 시스템을 구축하려고 모든 Node를 그룹화한 것. Node = 클러스터에 소속된 단일 서버로 실제 workload인 Pod가 실행되는 기본 단위. 운영 환경에서는 Control Plane이 여러 서버에 걸쳐 동작하고 클러스터가 여러 Node를 실행하므로 내결함성·고가용성이 제공된다.
- **Node 상태 감시(kube-controller-manager의 노드 컨트롤러)**: 5초 간격으로 노드 상태 체크 → API 서버에 보고. 역할: (1) Node 등록 시 CIDR Block 할당, (2) 내부 Node 정보를 최신으로 유지(Cloud provider 연동 시 사용), (3) Node 상태 모니터링(`--node-monitor-period=5`). Node가 사용 중인 리소스 용량 정보는 kubelet이 API 서버에 보고하고, scheduler가 모든 Node의 모든 Pod에 충분한 자원이 있는지 확인할 때 사용된다. 참고: https://kubernetes.io/docs/concepts/architecture/nodes/
- **Node 가용성 유지 파라미터 표(슬라이드)**

| 구성요소 | 파라미터 | 기본값/의미 |
|---|---|---|
| kubelet | `node-status-update-frequency` | 10s (api-server에 노드 상태를 게시하는 주기) |
| kubelet | `node-status-report-frequency` | 5m (슬라이드 표기) |
| kube-controller-manager | `node-monitor-period` | 5s (node-controller에서 node status를 동기화하는 시간) |
| kube-controller-manager | `node-monitor-grace-period` | 40s (해당 시간 동안 노드로부터 응답이 없으면 상태를 NotReady로 변경) |
| kube-controller-manager | `pod-eviction-timeout` | 5m (노드에서 Pod를 삭제(퇴출)하기까지 대기 시간) |

  슬라이드 문구: "Node 가용성 확보 관련 시간(5분 40초), 프로젝트 성격에 맞게 조정 필요". 노드가 죽었을 때 Pod가 다른 노드로 옮겨지기까지 기본 40초(grace) + 5분(eviction) = 약 5분 40초이며, 너무 길거나 짧으면 문제가 되므로 프로젝트에 맞게 조정해야 한다.
- **Calico 개요(자료 4장)**: Pod 생성 시 서로 다른 호스트(마스터·워커) 간 통신 구조가 CNI(Container Network Interface), 이 수업 선택은 calico. Calico는 BGP(Border Gateway Protocol)를 이용하며 내부 모듈이 7~8개 정도. BIRD = vRouter(가상 라우터)를 구현하고 BGP를 이용하는 동적 IP 라우팅 데몬(L3, 노드 간 라우팅 정보 공유), Felix = iptables 정보 관리 모듈, IPAM(IP Address Management) = 노드별 IP 블록(강사는 64개 단위 언급)을 할당·관리. 클러스터 노드(마스터 포함 4대)의 모든 Pod object는 클러스터에서 사용 가능한 IP를 할당받고, object가 삭제되면 IP를 회수해야 하며 이는 Controller Manager 안의 Endpoint/Service 컨트롤러 등과 함께 동작. 관리 도구 calicoctl.
- **API 통신과 Protobuf**: 클러스터 안 API server와의 통신은 REST API이며 구조도에는 gRPC와 protobuf가 표기됨. Protobuf(Protocol Buffers)는 일반 방식보다 빠르고 간편하게 데이터를 전송·API 통신을 구현하게 해 주는 기술. 앞 장의 관리 도구(K9s 등)로 이런 API 트래픽을 모니터링할 수 있다고 강사가 언급.
- **kubectl api-resources**: 강사 권고 — YAML 작성 시 쓰는 apiVersion, kind, 짧은 이름(shortname)을 여기서 확인할 수 있으므로 처음 쓰는 리소스를 만나면 먼저 조회해 보라.

### [사용한 CLI]
```bash
# 전체 Pod 확인 (control plane 구성요소/kube-proxy/coredns/calico가 kube-system에서 Pod로 동작)
kubectl get po -A
# kube-system Pod: calico-node, coredns x2, etcd-k8s-master, kube-apiserver-k8s-master,
#   kube-controller-manager-k8s-master, kube-proxy x4, kube-scheduler-k8s-master

# 선언형: YAML로 Pod 생성
kubectl apply -f pod.yaml

# 명령형: 즉시 Pod 생성
kubectl run <pod-name> --image=<image-name>

# 리소스 타입/약어/apiVersion/kind 확인
kubectl api-resources

# 호스트에서 프로세스 트리로 containerd-shim 아래 컨테이너 확인
pstree
# containerd-shim 아래에 etcd / kube-apiserver / kube-controller / kube-scheduler / kube-proxy / calico-node / pause 가 보임
```

예시 Pod YAML (자료 `pod.yaml` 형태)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: k8s-nodejs-pod
  labels:
    app: hi-nodejs
spec:
  containers:
  - name: nodejs-container
    image: dbgurum/k8s-kor:nod...   # 자료에서 이미지명 일부 잘림
    ports:
    - containerPort: 8000
```

### [확인 방법/주의점]
- `kubectl get po -A`에서 kube-system 아래 control plane 4종 + kube-proxy(노드 수만큼) + calico-node가 Running이면 정상.
- 명령형(`run`)과 선언형(`apply -f`)의 차이를 구분: 선언형은 YAML을 상태 선언으로 관리.
- Pod 생성 직후 `ContainerCreating`이면 이미지 pull/CNI IP 할당 중이므로 잠시 후 재확인.
- 강사 정리: "Kubernetes의 모든 것이 Pod(컨테이너)로 돌아가며 우리가 올리는 애플리케이션도 같은 방식" — `pstree`에서 containerd-shim 아래 etcd/kube-apiserver/kube-controller/kube-scheduler/kube-proxy/calico-node와 pause 컨테이너가 보인다. 슬라이드의 `pod.yaml` image 값은 화면에서 끝이 잘려 있어 전체 이미지명은 자료에서 확인 불가.
- 참고: 영상 06:30경 터미널에 K9s(v0.26.7, K8s v1.28.5)의 Namespaces 목록이 잠시 보이며 default, kube-node-lease, kube-public, kube-system, kubernetes-dashboard, monitoring, portainer 네임스페이스가 존재(`kubectl get po -A`에서 kube-system 외 나머지는 kubernetes-dashboard, monitoring, portainer 등).
- 슬라이드의 `kubectl api-resources` 출력은 캡처 시점에 아직 표시되지 않았다(자료에 출력 없음).

---

## Step 2. Control Plane 구성요소 확인 (apiserver / etcd / scheduler / controller-manager)

### [목적]
kubeadm으로 구성된 Control Plane 각 컴포넌트의 실체(static Pod 매니페스트)를 확인하고, etcd 상태 점검 및 백업 방법을 익힌다.

### [이론 설명]
- Master Node는 `kubectl get no`의 ROLES가 `control-plane`, Worker는 `<none>`. 이 역할 이름은 사용자가 바꿀 수 있어(예: 워커 노드에 `worker`라는 이름 부여) 반드시 `<none>`인 것은 아니다.
- control plane 노드는 각각 특정 작업을 담당하는 여러 구성요소(kube-apiserver, etcd, kube-scheduler, kube-controller-manager, (선택) kube-cloud-controller-manager)로 이루어지며, 이들이 유기적으로 동작해 클러스터 상태가 사전에 정의한 원하는 상태와 일치하는지 지속 확인한다. 구성요소는 독립적 업무를 갖지만 **API 서버를 중심으로** 동작하고, 상태가 어긋나면 셀프 힐링(자동 복구) 같은 조치를 취한다. CCM은 클라우드 연동용 선택 사항이라 이번 클립에서는 다루지 않는다.
- Control Plane 컴포넌트는 `/etc/kubernetes/manifests`의 YAML(static Pod)로 kubelet이 직접 실행 → `etcd.yaml`, `kube-apiserver.yaml`, `kube-controller-manager.yaml`, `kube-scheduler.yaml`. 클러스터를 처음 구축할 때 `kubeadm init`이 이 4개 YAML을 생성하며, kube-system 네임스페이스에서 Pod로 확인된다. (강사: 이 YAML에는 livenessProbe/readinessProbe/startupProbe 같은 라이프사이클 관리 항목도 들어 있다.)
- **kube-apiserver**: Kubernetes API를 사용하는 클러스터 중앙 관리 도구. 역할 ① API 요청 관리(kubectl 요청을 가장 먼저 받음) ② 요청 처리 및 Admission controller를 통한 데이터 유효성 검사(Pod YAML의 스펙, 볼륨, ConfigMap 등이 올바른지) ③ 사용자 인증 및 RBAC 권한 평가 ④ **etcd와 직접 통신하는 유일한 구성요소** ⑤ control plane과 worker node 구성요소 간 모든 작업 조정. 통신: kubectl은 HTTP REST API(secure-port 6443), 내부 구성요소(스케줄러·컨트롤러 등)는 gRPC, API 서버와 다른 구성요소 간 통신은 무단 접근 방지를 위해 TLS. 다른 구성요소끼리 직접 통신하지 않고 전부 API 서버와 통신하며 워커의 kube-proxy/kubelet도 API 서버의 지시를 받는다. **API 서버가 죽으면 kubectl 명령이 가장 먼저 동작하지 않는다.** (RBAC = 누가 어떤 리소스에 무엇을 할 수 있는지를 역할 기준으로 허용하는 방식, Admission controller = 인증·인가를 통과한 요청이 저장되기 전 한 번 더 검증·보정하는 단계.)
- **etcd**: key-value 기반 오픈소스 data storage. 특징: ① 모든 클러스터 관련 정보를 재정의가 아닌 **추가** 방식으로 저장(SSOT), 애플리케이션 데이터는 제외(상태 정보만 기록) ② 공간 활용률을 높이려고 주기적 압축(파쇄) ③ B+tree 구조, BboltDB 위에 구축 ④ 보안용 암호화 기능 제공(뒤 Secret 학습 때 etcd 암호화 소개 예정) ⑤ 강한 일관성(DB의 핵심은 일관성 — RDBMS는 ACID, 빅데이터는 CAP 이론, 공통 요소는 C) ⑥ 분산형(여러 노드에서 클러스터로 실행되도록 설계, 멀티 클러스터에서는 etcd를 여러 개 운영하거나 외부 서버로 분리 가능 — 이 실습은 control plane에 함께 올라가 있음) ⑦ 비관계형 key-value ⑧ Raft 합의 알고리즘(leader-member 구성, control plane 3대 구성 시 그중 하나가 리더, 리더 장애 시 합의로 리더 역할 이전, 리더에 먼저 기록 후 member에 복제). 동작: Kubernetes 객체(Pod, Deployment, Secret 등)의 모든 구성·상태·메타데이터 저장, API 서버가 etcd의 Watch() 기능으로 상태 변화 추적(etcd client가 event 구독), control plane의 유일한 StatefulSet(상태 저장) 구성요소(대부분의 Pod 객체는 stateless), gRPC로 key-value API 노출, `/registry` 디렉터리 아래에 객체를 key-value로 저장(카테고리: apiservices, clusterroles, configmaps, daemonsets, events, namespaces, pods, secrets, serviceaccounts, services 등 → 그 아래 네임스페이스/오브젝트 이름). 예) default 네임스페이스의 nginx Pod = `/registry/pods/default/nginx`. 클라이언트 2379 / peer 2380. 
- **kube-scheduler**: worker node에 Pod를 스케줄링(할당)하는 컨트롤러. API 서버로부터 Pod 생성 이벤트를 수신. 판단 기준: Pod 배포 시 지정한 CPU·메모리·affinity·taint/toleration·우선순위·PV 등 요구사항. Scheduling context = Scheduling cycle(worker node 선택, 노드가 3개든 30개든 어느 노드가 적합한지 진단) + Binding cycle(변경 사항을 클러스터에 적용, 그 노드에 Pod를 실제로 연결). 스케줄러는 DB가 아니라 노드 정보를 스스로 보관하지 않으며 etcd와 직접 통신하지 않고 항상 API 서버를 거친다.
  - **스케줄러 동작 8단계(슬라이드)**: 1) kubectl 등으로 Pod 생성 요청을 kube-apiserver에 전달 2) kube-apiserver가 요청 정보를 etcd에 기록(pod state) 3) client에게 요청 승인 알림 4) Scheduler가 할당을 위해 Node 정보를 kube-apiserver에 요청 → filtering으로 적합한 노드 선택, scoring으로 노드별 점수를 매겨 순위 지정, 순위가 높은 노드 선택(동점이면 랜덤) 5) kube-apiserver가 지정된 Node의 kubelet에게 Pod(container) 생성 요청 6) kubelet이 해당 Node의 container runtime에 container 시작 요청 7) kubelet이 생성 상태를 kube-apiserver에 보고(Bind pod to Node) 8) kube-apiserver가 etcd에 기록(pod state). **스케줄러의 역할은 4단계까지**이고 5~8은 API 서버·kubelet·컨테이너 런타임의 몫.
- **kube-controller-manager**: 무한 제어 루프를 실행하는 프로그램으로 모든 Kubernetes 컨트롤러를 관리. 지속 실행되며 객체의 현재 상태(Current state)와 원하는 상태(Desired state)를 감시(Watch loop)하여 같으면 계속 운영, 다르면 맞추는 조치(Update)를 한다. Kubernetes 대부분의 resource object가 controller에 의해 관리되며 종류는 매우 많다(Deployment 컨트롤러, Node 컨트롤러, Service 컨트롤러 등). 각 컨트롤러는 자기 업무 object를 지속 watching. 흐름: `kubectl apply -f pod.yaml`(create/update) → kube-apiserver → controller-manager가 API 서버를 통해 Pod·Job·Deployment 등 object(Desired state)를 Watch하고 차이가 있으면 Update. "무한 제어 루프"는 종료되지 않고 계속 상태를 비교·조정하는 반복 동작.
- 강사 강조: 각 구성요소가 무엇을 하는가뿐 아니라 "누구와 통신하며 어떤 순서로 유기적으로 동작하는가"가 핵심이며, 4개 구성요소의 동작을 아키텍처 그림으로 이해하고 직접 그려 보는 것이 중요.

### [사용한 CLI]
```bash
# 노드 역할 확인
kubectl get no

# control plane static Pod 매니페스트 확인
ls /etc/kubernetes/manifests/
# etcd.yaml  kube-apiserver.yaml  kube-controller-manager.yaml  kube-scheduler.yaml

sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml

# 클러스터 정보 (API Server 주소 https://192.168.56.100:6443)
kubectl cluster-info
```

kube-apiserver.yaml 주요 부분
```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    component: kube-apiserver
    tier: control-plane
  name: kube-apiserver
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-apiserver
    - --advertise-address=192.168.56.100
    - --authorization-mode=Node,RBAC
    - --etcd-servers=https://127.0.0.1:2379
    - --secure-port=6443
    - --service-cluster-ip-range=10.96.0.0/12
    - --tls-cert-file=/etc/kubernetes/pki/apiserver.crt
    image: registry.k8s.io/kube-apiserver:v1.28.5
```

etcd.yaml 주요 부분
```yaml
spec:
  containers:
  - command:
    - etcd
    - --advertise-client-urls=https://192.168.56.100:2379
    - --cert-file=/etc/kubernetes/pki/etcd/server.crt
    - --client-cert-auth=true
    - --data-dir=/var/lib/etcd
    - --key-file=/etc/kubernetes/pki/etcd/server.key
    - --listen-client-urls=https://127.0.0.1:2379,https://192.168.56.100:2379
    - --listen-peer-urls=https://192.168.56.100:2380
    - --name=k8s-master
    - --peer-cert-file=/etc/kubernetes/pki/etcd/peer.crt
    - --snapshot-count=10000
    - --trusted-ca-file=/etc/kubernetes/pki/etcd/ca.crt
    image: registry.k8s.io/etcd:3.5.9-0
```

etcd 접속 및 상태 점검
```bash
# etcd Pod 내부 shell 진입 후 도움말 (etcdctl 3.5.9)
kubectl exec -it -n kube-system etcd-k8s-master -- sh
etcdctl -h
#  주요 명령: defrag, del, endpoint health, endpoint status, get, member list, put, snapshot ...

# endpoint health (v3 API + 인증서 환경변수)
kubectl -n kube-system exec -it etcd-k8s-master -- sh \
-c "ETCDCTL_API=3 \
ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt \
ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt \
ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key \
etcdctl endpoint health"
# 127.0.0.1:2379 is healthy: successfully committed proposal: took = ...

# member list
kubectl -n kube-system exec -it etcd-k8s-master -- sh \
-c "ETCDCTL_API=3 \
ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt \
ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt \
ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key \
etcdctl member list"
# 76335a6259872c1a, started, k8s-master, https://192.168.56.100:2380, https://192.168.56.100:2379, false
```

etcd 백업 (CKA/CKAD 빈출)
```bash
kubectl -n kube-system exec -it etcd-k8s-master -- sh \
-c "ETCDCTL_API=3 etcdctl \
--endpoints=127.0.0.1:2379 \
--cacert=/etc/kubernetes/pki/etcd/ca.crt \
--cert=/etc/kubernetes/pki/etcd/server.crt \
--key=/etc/kubernetes/pki/etcd/server.key \
snapshot save /var/lib/etcd/snapshot.db"
# Snapshot saved at /var/lib/etcd/snapshot.db   (복구는 snapshot restore)
```

스케줄러 동작 확인용 Pod 생성
```bash
kubectl run myweb2 --image=nginx
# pod/myweb2 created
kubectl get po
# ContainerCreating -> Running
```

### [확인 방법/주의점]
- 인증서 경로(`ca.crt/server.crt/server.key`)는 `etcd.yaml`의 `--trusted-ca-file`, `--cert-file`, `--key-file` 값과 일치시켜야 한다.
- `ETCDCTL_API=3`을 반드시 지정.
- snapshot은 etcd Pod 내부 `/var/lib/etcd`에 저장되므로(호스트 `/var/lib/etcd`에 마운트) 필요 시 외부로 복사. 강사: CKA/CKAD 준비자에게 특히 중요하며, etcd는 DB이므로 백업 전략이 필수. 실무에서는 Kubernetes CronJob으로 etcd를 주기 백업하고 별도 스토리지에 보관하기도 하며, 가장 좋은 방법은 날짜 단위로 이름을 바꿔 저장하는 것. 영상 결과: snapshot 파일(snapshot.db) 약 6.5 MB, `Snapshot saved at /var/lib/etcd/snapshot.db`.
- `snapshot restore`는 보관한 백업 데이터를 불러와 그 상태로 되돌리는 명령이며, 영상에서는 이름만 언급하고 실행하지 않았다(복원 절차는 자료에 없음).
- `endpoint health` 결과 `127.0.0.1:2379 is healthy: successfully committed proposal: took = ...`(소요 시간은 슬라이드 예시와 실제 실행값이 다름). `member list`에는 멤버가 k8s-master 하나뿐이며 peer(2380)·client(2379) 주소가 보인다 — 멀티 control plane이 아니라서 멤버가 하나이고 etcd 관련 포트가 열려 있다는 의미.
- etcd Pod에서는 `bash`가 아니라 `sh`를 사용한다(`kubectl exec -it -n kube-system etcd-k8s-master -- sh`, 프롬프트 `sh-5.1#`). 강사는 etcd Pod 안의 etcdctl을 쓰지 않고 호스트에 etcd 도구를 직접 설치해 외부에서 관리할 수도 있다고 덧붙임. `etcd.yaml`의 command 파라미터는 나중에 암호화(encryption) 기능을 적용할 때 수정하면 바로 적용된다.
- `etcdctl -h` 화면의 하위 명령: defrag(지정 endpoint etcd 멤버 스토리지 조각 모음), del(key 또는 key 범위 삭제), endpoint health(--endpoints에 지정된 endpoint의 건강 확인), endpoint status, get(key/범위 조회), member list(클러스터 전체 멤버), put(key 저장) 등.
- `kubectl run myweb2 --image=nginx` 직후 `pod/myweb2 created`가 뜨는 것은 "문법에 문제가 없고 요청이 승인되었다"는 승인 알림(스케줄러 8단계 중 3단계)일 뿐이며, 실제 컨테이너 생성에는 시간이 걸려 `kubectl get po`에서 한동안 `ContainerCreating`(영상에서는 AGE 2m26s 시점에도 ContainerCreating, 최종 Running은 확인되지 않음)이다. get po로 생성 중/Running/실패(Fail) 상태를 알 수 있다.
- 영상 `kubectl cluster-info` 결과: Kubernetes control plane is running at https://192.168.56.100:6443, CoreDNS is running at .../api/v1/namespaces/kube-system/services/kube-dns:dns/proxy. 6443 = kube-apiserver 수신 포트.
- 매니페스트 파일 수정 시 kubelet이 자동 재기동하므로 신중히 편집.

---

## Step 3. Worker Node 구성요소와 Add-on (kubelet / kube-proxy / runtime / CoreDNS)

### [목적]
Worker Node의 구성요소와 클러스터 Add-on(CNI, CoreDNS, Metrics Server, Dashboard)을 확인하고 CoreDNS로 DNS 동작을 검증한다.

### [이론 설명]
- 강사 강조: 이 부분은 이론 비중이 크지만 "동작 흐름을 정확히 이해해야 프로젝트에서 Kubernetes를 잘 활용할 수 있다".
- **kubelet**: control plane 및 worker node 모두에 존재. Pod 실행(생성·변경·삭제)을 위해 control plane의 API 서버와 통신하며, worker node를 API 서버에 등록하고 API 서버에서 podSpec을 받아 처리하는 에이전트. liveness/readiness/startup probe 기능 처리(Pod 진단: 살아 있는지 / 요청 받을 준비가 됐는지 / 시작이 끝났는지). Node의 container runtime으로 image를 가져오고 컨테이너를 실행. 컨테이너를 관리하고 Pod가 원하는 상태인지 확인. kubelet architecture: kube-apiserver가 podSpec을 내려보내고 kubelet은 Pod/Node Status를 올려보냄, kubelet은 CNI로 Pod에 IP(그림 예 10.111.156.72)를 부여하게 하고 컨테이너 런타임(CRI-O, containerd)에 컨테이너 생성을 맡김. `/etc/kubernetes/manifests`의 Static Pod Specs(pod1.yaml, pod2.yaml)를 읽어 API 서버를 거치지 않고 직접 Pod를 만들 수 있다(static Pod) — 강사가 다음 챕터 Pod 실습에서 직접 보여 주겠다고 언급.
- **kube-proxy**: Service object는 Pod를 트래픽에 노출하고 Endpoint object는 Pod IP 주소와 port를 포함. kube-proxy는 Pod용 Service 구현체로, Service로 Pod를 노출하면 Service object와 그룹화된 Pod로 트래픽을 보내는 네트워크 규칙을 생성. API 서버와 통신해 서비스와 해당 Pod IP/port 세부정보를 가져오고, Service 변경과 Endpoint를 모니터링하여 Mode(IPTables, IPVS, User space, Kernel space)에 따라 Routing 규칙(Rule)을 생성·업데이트. UDP/TCP/SCTP 프로토콜을 Proxy하며 HTTP는 no Proxy. **모든 노드(마스터 포함)에서 DaemonSet으로 실행**되어 이 클러스터에는 4개가 떠 있다(`kubectl get pod -o wide`로 노드 배치 확인). IPTables 모드에서는 iptables 규칙으로 트래픽을 처리하고 로드밸런싱을 위해 백엔드 Pod를 **Random** 선택 — 이 NAT·로드밸런싱 규칙을 따로 구성할 필요 없이 자동 생성된다. 그림의 ClusterIP는 클러스터 내부 통신용 IP(주로 백엔드 연결)이며 외부 통신용이 아니다.
- **container runtime**: 컨테이너 레지스트리에서 이미지 가져오기, 컨테이너 리소스 할당·격리, 호스트에서 컨테이너 전체 수명주기 관리. Kubernetes는 컨테이너 생성·시작·중지·삭제와 이미지·컨테이너 네트워크 관리 API를 정의한 CRI(container runtime interface, API set)로 런타임과 상호작용. OCI(Open Container Initiative)는 컨테이너 형식 및 런타임 표준 집합이며 CRI-O, Docker(cri-docker), containerd, Mirantis 등 OCI 준수 런타임을 지원. 흐름(슬라이드 01~04): API 서버가 podSpec 전송 → kubelet이 gRPC로 containerd에 전달 → containerd의 Image service가 이미지를 받아 오고 OCI specification(컨테이너 사양, JSON)을 만들어 runc에 넘김 → runc가 커널 정보와 함께 사양에 맞는 컨테이너 프로세스를 띄움 → 이를 Pod로 포장. 이후 컨테이너 수명주기는 컨테이너 런타임이 관리.
- **Add-on**(활성화 시 클러스터 성능·기능 향상): CNI plugin(Calico, 앞서 선택), CoreDNS(DNS 기반 Service Discovery, calico 올라올 때 자동으로 함께 올라옴), Metrics Server(Node·Pod 성능/리소스 사용량 수집, 주로 HPA 구성에 사용 — 나중 HPA 실습에서 다룸), Web UI(Dashboard, k8s resource object 관리 — 이미 설정되어 있음).
- CoreDNS: 클러스터 구축 시 자체적으로 Pod 2개 배포(이 실습에서는 둘 다 k8s-node2) + `kube-dns` Service(ClusterIP 10.96.0.10, 53/UDP,53/TCP,9153/TCP), 라벨 `k8s-app=kube-dns`. DNS 서버 2대 × 포트 3개 = 총 6개 엔드포인트가 kube-dns Endpoint에 할당(화면에는 "+ 3 more.."로 일부 생략).
- 검증 목적: 서비스 디스커버리를 쓰려면 Pod와 Service가 DNS에 등록돼야 하므로, Redis 자체는 중요하지 않고 생성 시 부여되는 **Pod IP와 Service IP 두 개가 DNS 이름과 함께 등록되는지**가 핵심이다. busybox는 아주 가벼운 리눅스 테스트 도구 이미지이며 일회성 Pod로 nslookup 후 `--rm`으로 자동 삭제한다.

### [사용한 CLI]
```bash
# kube-system Pod 전체 (kube-proxy 4개, coredns 2개 등 확인)
kubectl get po -A

# CoreDNS Pod / Service / Endpoint 확인
kubectl get po -n kube-system -o wide | grep core
kubectl get pod,svc,ep -n kube-system -l k8s-app=kube-dns -o wide
#  -l: 라벨 셀렉터, -o wide: IP/Node 등 상세 컬럼

# DNS 검증용 Deployment + Service 생성
kubectl create deployment redis-dns --image=redis --replicas=1
kubectl expose deployment redis-dns --name=redis-dns-svc --port=6379 --target-port=6379
kubectl get deploy,po,svc -o wide | grep redis-dns

# busybox 임시 Pod에서 역방향 DNS 조회 (--rm: 종료 시 Pod 삭제, -it: 인터랙티브)
kubectl run dns--pod-verify --image=busybox --restart=Never --rm -it -- nslookup <Pod IP>
kubectl run dns-svc-verify --image=busybox --restart=Never --rm -it -- nslookup <Service IP>
# Server: 10.96.0.10 / Address: 10.96.0.10:53
# name = redis-dns-svc.default.svc.cluster.local  (Service IP 조회 결과)
```

### [확인 방법/주의점]
- nslookup 결과의 Server가 kube-dns ClusterIP(10.96.0.10)이면 CoreDNS가 응답한 것.
- Pod IP 조회 결과는 `10-111-218-72.redis-dns-svc.default.svc.cluster.local` 형태, Service IP는 `redis-dns-svc.default.svc.cluster.local`.
- `--rm -it` 사용 시 "If you don't see a command prompt, try pressing enter." 메시지와 `pod ... deleted`가 나오는 것은 정상.
- 자료에서 `dns--pod-verify`(하이픈 2개)로 Pod 이름이 슬라이드와 실습 화면 모두 동일하게 입력되어 있음(오타이나 동작에는 무관).
- 실습 화면 결과 예: Pod IP 10.109.131.19 → `10-109-131-19.redis-dns-svc.default.svc.cluster.local`, Service IP → `redis-dns-svc.default.svc.cluster.local`(IP는 슬라이드 예시와 다름). `Server 10.96.0.10 / Address 10.96.0.10:53`은 조회를 처리한 DNS 서버 = 앞에서 확인한 kube-dns Service의 ClusterIP. 
- `If you don't see a command prompt, try pressing enter.` 및 `couldn't attach to pod ... falling back to streaming logs` 경고가 보여도 조회 결과는 정상 출력되고 Pod는 `deleted` 된다.
- 검증 결론(강사): Pod IP와 Service IP가 모두 CoreDNS에 등록되어 이름으로 조회된다 = kube-dns(CoreDNS)가 서비스 디스커버리를 정상 수행.

---

## Step 4. CNI (Calico) 확인 및 calicoctl 사용

### [목적]
Pod 네트워크를 책임지는 CNI(Calico)의 구성요소를 확인하고, calicoctl로 노드/IPAM/Pod 인터페이스를 조회하여 Pod IP 할당과 경로를 이해한다.

### [이론 설명]
- **CNI(Container Network Interface)**: 컨테이너(Pod) 간 네트워킹을 제어하는 Plugin 기반 Network architecture. 다양한 container runtime과 orchestrator 사이의 네트워크 계층을 구현하는 공통 인터페이스를 제공하며 k8s는 Pod 간 통신에 CNI를 사용. 컨테이너 런타임(containerd)은 컨테이너만 만들 뿐 노드 간 네트워크는 직접 연결해 주지 않으며, CNI는 "Pod 생성 시 이런 순서로 네트워크를 붙여 달라"는 표준 규격이고 Calico 같은 플러그인이 이를 구현한다. k8s는 기본 `kubenet`이라는 자체 CNI Plugin을 제공하나 네트워크 기능이 매우 제한적이라 이를 보완하는 3rd-party Plugin을 쓴다(kubernetes.io Addons 문서에 열 몇 개의 CNI 도구가 나열 — 프로젝트에 맞는 네트워킹 기술의 도구를 채택). 참고: https://kubernetes.io/docs/concepts/cluster-administration/addons/
- **CNI가 필요한 이유(노드가 여러 개일 때)**: ① 각 Node의 container network IP 대역이 동일해 Pod들이 같은 IP를 할당받을 가능성이 높음 ② 설령 IP가 달라도 해당 Pod가 어느 Node에 있는지 확인 불가(자기 Node의 Pod IP만 식별 가능) → 중복 없는 IP를 부여해 줄 CNI Plugin 필요. CNI Plugin은 모든 worker node에 중복되지 않는 subnet(CIDR)을 부여하고 그 노드의 Pod는 해당 subnet의 IP를 받는다. Calico는 노드마다 서브넷을 만들어 주는데 이를 **IPAM block**이라 하고 한 블록에 IP를 64개씩 할당하며, 블록을 다 쓰면 새 블록을 받는다. 이 클러스터는 구축 시 전체 대역을 10.96.0.0/12(약 100만 개)로 잡았다.
- **CNI 동작**: Pod 생성 흐름 — API 서버가 Node1의 kubelet에 "Pod를 만들어 달라"고 전달 → container runtime에 전달되고 동시에 CNI(Calico)가 Pod를 연동할 터널링(네트워크 연결)을 만들고 IP를 할당. CNI는 **생성뿐 아니라 삭제 때도 호출**되어 Pod 삭제 시 IP를 회수해 재사용하게 한다(표준 인터페이스로서의 특징). CNI 구성 시 Bridge Interface 생성, 컨테이너 네트워크 대역을 나눠 routing table 생성(Docker 기본 bridge 네트워킹의 서브네팅과 같은 맥락), Pod는 CNI가 제공하는 고유 IP를 가지며 클러스터 내 모든 Pod는 내부 네트워크가 자동 구성되어 **Service 없이도 Pod 간 통신 가능**. CNI Provider는 VXLAN·IP-in-IP 같은 캡슐화 모델 또는 BGP 같은 비캡슐화 모델로 구현(캡슐화 = 패킷을 한 겹 더 싸서 전송, BGP = 라우터끼리 경로 정보를 교환해 패킷을 그대로 전송).
- 3rd-party 비교(슬라이드 표: Calico, Canal, Flannel, kopeio-networking, kube-router, romana, Weave Net): 열 = Network Model(Layer 1/2/3, VXLAN), Route Distribution(BGP/OSPF), Network Policy, Mesh, External Datastore(etcd 등), Encryption, Ingress/Egress Policies, Commercial Support. 강사: 어떤 플러그인은 VXLAN을 쓰지만 **Calico는 BGP 프로토콜(Layer 3)**을 사용(기술 기반이 서로 다름). 이 강의는 Calico 선택. (표의 개별 Yes/No 값은 OCR 판독이 불안정해 옮기지 않음)
- **Calico**: kubernetes CNI 인터페이스를 준수한 네트워크 모델로 pod·노드·외부 네트워크 등 k8s 리소스의 네트워크 통신 담당. 참고: https://projectcalico.docs.tigera.io/reference/architecture/overview
- **Calico 구성요소**: Calico API server, Felix(강사: Node의 iptables 관련 정보를 업데이트하는 모듈), BIRD(강사: 노드끼리 라우팅 정보를 공유하는 모듈, master 1 + worker 3 = BIRD 총 4개), CNI plugin/IPAM plugin(Pod에 네트워크를 붙이고 IP 관리), calicoctl(Calico 정보(노드, 워크로드, IPAM, 블록)를 조회·관리하는 명령줄 도구, 외부에서 관리할 때는 별도 설치). 모듈들은 (전부는 아니지만) Calico 파드 안에 올라와 있음.
- **Calico 동작 원리(vRouter·BGP·etcd)**: 모든 노드에 가상 라우터(vRouter)를 하나씩 구성하고 BGP로 라우팅 정보를 노드끼리 공유하여 pod/service 네트워크를 수행. 노드 간(외부 pod 통신)은 overlay 또는 Direct 통신이며 **이 클러스터는 overlay(IP-in-IP) 방식**. 라우팅 정보는 etcd에 저장되는데 Calico가 직접 쓰지 못하고 API 서버에 전달하면 API 서버가 etcd에 기록.
- **IPAM(IP Address Management)**: IP 주소 관리 모듈. Calico는 클러스터 전체(master+worker)를 하나로 묶어 IP를 관리하고 노드마다 IPAM Block(CIDR 형태의 서브넷)을 알아서 잘라(슬라이싱) 준다(사용자가 직접 만들지 않음). 노드에 pod가 만들어지면 그 노드 블록의 IP 중 하나를 받는다.
- 트래픽 흐름: Pod eth0 ↔ veth pair ↔ 노드의 `cali...` 인터페이스(Pod 생성 시 Bind된 Node에 자동 생성) ↔ vRouter(Calico) ↔ `tunl0`(IP-in-IP 터널) ↔ Node NIC(enp0s8) ↔ 대상 노드. 모두 network namespace에서 구성되며 Pod 쪽은 veth로 연결. 강사: 이런 동작·아키텍처 지식은 운영 중 트러블슈팅에 매우 필요.
- `blackhole` 경로: "이 목적지 대역 중 개별 경로가 없는 주소로 가는 패킷은 버린다"는 경로 종류. 자기 Node에 할당된 블록(예: master의 10.108.82.192/26)은 blackhole로 표시되고, 이 노드의 Pod는 개별 경로(`caliXXXX` 인터페이스)로 처리된다. (기존 문서의 "상위 경로 처리용" 표현을 정정)

### [사용한 CLI]
```bash
# Calico 구성요소 확인 (calico-node DaemonSet: Node 수만큼 4개)
kubectl -n kube-system get daemonset

# Calico Pod 상세 (Node IP, Pod IP)
kubectl get po -n kube-system -o wide | grep calico

# 상세 정보 / 로그
kubectl -n kube-system describe po calico-node-2chv5
kubectl logs -n kube-system calico-node-2chv5
```

calicoctl 설치(Pod 형태) 및 사용
```bash
# calicoctl Pod 배포 (자료: v3.17 manifest 사용)
kubectl apply -f https://docs.projectcalico.org/archive/v3.17/manifests/calicoctl.yaml
kubectl get po -n kube-system calicoctl -o wide

# calicoctl 도움말
kubectl exec -n kube-system calicoctl -- calicoctl -h
#  주요 서브명령: create/replace/apply/patch/delete/get/label/convert/ipam/node/version/export/import/datastore

# 노드 목록
kubectl exec -n kube-system calicoctl -- calicoctl get nodes

# IP 풀 사용 현황
kubectl exec -n kube-system calicoctl -- calicoctl ipam show
# IP Pool 10.96.0.0/12  IPS TOTAL 1.0486e+06 ...

# 노드별 IPAM 블록(/26, 64 IP) 확인
kubectl exec -n kube-system calicoctl -- calicoctl ipam show --show-blocks

# Pod(workload) 엔드포인트: 워크로드/노드/IP/cali 인터페이스 매핑
kubectl exec -n kube-system calicoctl -- calicoctl get workloadendpoints
```

IP 할당 변화 확인 실습
```bash
kubectl run ip-check --image=nginx
kubectl get po -o wide | grep ip-check
# ContainerCreating -> Running (IP 10.111.156.88 등, 해당 노드 블록에서 할당)
# 이후 calicoctl ipam show --show-blocks 로 IPS IN USE 증가 확인 (17 -> 18)
```

BIRD 경로 / 인터페이스 확인
```bash
# 라우팅 테이블에서 BIRD(BGP)로 학습한 Pod CIDR 경로
ip -c route | grep bird
# blackhole 10.108.82.192/26 proto bird
# 10.109.131.0/26 via 192.168.56.102 dev tunl0 proto bird onlink
# 10.111.156.64/26 via 192.168.56.101 dev tunl0 proto bird onlink
# 10.111.218.64/26 via 192.168.56.103 dev tunl0 proto bird onlink

# 노드 인터페이스(tunl0, cali*, enp0s3/enp0s8, docker0)
ip -c addr show
route

# 다른 노드의 Pod IP로 접근 테스트
curl 10.111.156.88      # Welcome to nginx!
```

### [확인 방법/주의점]
- calico-node가 Node 수만큼(DESIRED/READY 4) Running인지 확인. calico는 노드마다 반드시 1개씩 배치되는 DaemonSet(ds)이며 kube-proxy도 같은 DaemonSet. 별도로 `calico-kube-controllers`가 1개(실습에서는 k8s-node2) 있고 강사는 이를 "Calico를 관리하는 도구"로 설명. calico-node는 노드 IP(192.168.56.x)를 그대로 쓰는 반면 calico-kube-controllers는 Pod 대역(10.109.x.x)의 IP를 받는다.
- `describe`로 이벤트·설정(volume, ConfigMap 등) 정보를 한꺼번에 보고, `logs`로 동작 상황을 본다. 강사 당부: 이런 소소한 kubectl 명령을 꼭 익힐 것(대시보드가 더 편하지만 kubectl 명령이 기본). 자료의 `describe` Events에 `Warning Unhealthy ... Liveness probe failed: command "/bin/calico-node -felix-live -bird-live" timed out` 경고가 보이는 경우가 있었음(강사가 따로 언급하지는 않음).
- calicoctl: 슬라이드 예시에서는 k8s-node2에 배치, 실제 시연에서는 k8s-node1에 배치되어 처음 ContainerCreating(0/1) 후 Running(1/1). `kubectl exec -n kube-system calicoctl -- calicoctl ...` 형태로 "calicoctl 파드 안의 calicoctl 명령"을 실행하며 하위 명령 중 `ipam`(IP address management), `node`(Calico node management)가 핵심. 외부 관리용으로는 별도 설치(자료에서 설치법 상세는 없음).
- `calicoctl get nodes` = Calico에 등록된 노드(master, node1~3). `calicoctl ipam show` = Calico IP 풀: 10.96.0.0/12(약 100만 개, 1.0486e+06) 중 17개(0%) 사용. `--show-blocks`: 노드 4개이므로 /26 블록 4개(10.108.82.192/26, 10.109.131.0/26, 10.111.156.64/26, 10.111.218.64/26, 각 64개). /26 = 앞 26비트가 네트워크, 남은 6비트로 2^6 = 64개; /12는 2^20 ≈ 약 105만.
- IP 할당 변화 실습: ip-check(nginx) Pod가 k8s-node1에 배치되어 10.111.156.88을 받았고 이는 node1 블록 10.111.156.64/26에 속함. `ipam show --show-blocks` 재조회 시 해당 블록 사용량 3 → 4(FREE 61(95%) → 60(94%)), 전체 IP 풀 사용량 17 → 18. 즉 "Pod가 배치된 노드의 블록에서 IP 하나가 소진된다".
- BIRD 경로: 각 노드 Pod 블록으로 가려면 해당 노드 IP(예 192.168.56.101)를 next hop(via)으로 `tunl0` 터널을 통해 보내는 경로가 BIRD(`proto bird`)에 의해 자동 등록. 강사는 "터널링 서비스로 링크가 구성되어 있다"고 설명(tunl0 = link/ipip, IP-in-IP 터널, mtu 1480).
- k8s-node1의 인터페이스(`ip -c addr show`): enp0s3 10.0.2.15/24 / enp0s8 192.168.56.101/24(노드 IP), docker0 172.17.0.1/16(state DOWN), tunl0 10.111.156.64/32(link/ipip, mtu 1480), 파드마다 생기는 `cali...` 가상 인터페이스(veth 한쪽 끝, 파드 network namespace `cni-...`와 연결). 파드가 올라가면 cali 인터페이스가 하나씩 생기고 tunl0와 이어진다. `calicoctl get workloadendpoints`는 파드 이름·노드·Pod IP·연결 인터페이스를 한 번에 보여 준다(슬라이드 예시: ip-check가 node3에서 10.111.218.76 ↔ cali e2804730689). node3에서 `route`로 Pod IP /32 경로가 해당 cali 인터페이스로 가는 것을 확인.
- curl 통신 테스트: k8s-node1의 nginx Pod(10.111.156.88)에 master에서 `curl`하면 "Welcome to nginx!", node2에서도 동일(node3도 마찬가지라고 설명). 노드가 달라도 Pod IP로 통신되는 이유 = CNI(Calico)가 라우팅 정보를 공유하기 때문.
- 이 클러스터에서 Pod CIDR(IP 풀) 10.96.0.0/12는 `kubeadm init` 시 잡은 값이라고 강사가 설명. (Service ClusterIP 대역도 apiserver `--service-cluster-ip-range=10.96.0.0/12`로 같은 표기이므로 Pod 풀과 구분해 이해.)
- IPAM 블록 CIDR이 /26(IP 64개)이며 Pod 생성 시 해당 Node 블록의 IN USE가 증가.
- 원격 노드 Pod CIDR은 `via <노드IP> dev tunl0 proto bird`로, 로컬 Pod은 `cali...` 인터페이스로 라우팅된다.
- ClusterIP 풀은 다른 대역(`10.96.0.0/12` 중 Service CIDR)이며 Pod 풀과 구분하여 이해(자료는 두 값 모두 10.96.0.0/12로 표기).

---

## Step 5. 일반적인 애플리케이션을 Pod로 배포하는 전체 과정

### [목적]
Docker 방식(소스 → 이미지 빌드 → 레지스트리 push)과 Kubernetes 방식(Pod/Service)을 하나의 흐름으로 체험한다.

### [이론 설명]
- 슬라이드의 6단계 예시(개발팀 배포 요구 ~ 운영 배포): ① 개발 팀에 Application 배포 요구가 전달됨(Node 테스트용 source code 전달) ② 요구 사항을 반영해 Dockerfile 생성, `docker build`로 image 생성 ③ `docker run`으로 컨테이너화 확인 ④ Public 또는 Private registry에 image 업로드 ⑤ 해당 image로 Pod 및 Service를 생성해 내부·외부 연결 테스트 ⑥ 테스트 성공 시 자동 배포 환경(CI/CD)이 포함된 Products(운영) 환경에 배포. **①~④는 Docker 영역, ⑤부터가 Kubernetes 영역**(⑥은 운영 배포).
- 강사 강조: 이미지를 만든 뒤 **바로 push하지 말고 반드시 `docker run`으로 컨테이너가 잘 도는지 먼저 확인**. push 대상은 Docker Hub, 자체 프라이빗 레지스트리, AWS라면 ECR 등. Kubernetes는 이미지를 만드는 도구가 아니므로 Docker 등 다른 방법으로 이미지를 먼저 만들어 두어야 한다. 5장부터 본격적으로 오브젝트를 만들기 때문에 이 절차를 이해해 두면 도움이 된다. (이미지 = 앱과 실행 환경을 묶은 설계도, 컨테이너 = 그 이미지를 실행한 것, 레지스트리 = 이미지를 올려 두고 내려받는 저장소.)
- `docker push` 전제 3단계: **태그가 걸려 있어야 하고 → `docker login`이 되어 있어야 하고 → push**. 강사는 push 과정은 영상에서 시연을 생략했고(이미 올려 둠), 자신의 이미지를 그대로 쓰지 말고 간단하더라도 직접 개발한 소스로 만든 이미지를 쓰라고 당부. 이미지명은 `계정명/이미지명:태그` 형식(강사는 본인 Docker Hub 계정 이름 `dbgurum`으로 태그).
- Dockerfile 4줄 의미: `FROM`(같은 node 이미지를 가져옴) / `EXPOSE`(포트 명시) / `COPY`(소스 복사) / `CMD`(컨테이너 시작 시 `node runapp.js` 자동 실행). docker cp+exec로 수동 실행하던 것과 달리 이미지 자체에 소스와 실행 명령이 들어 있어 컨테이너만 만들면 된다. 빌드 결과: 이미지 크기 약 206MB(node:21-slim과 동일 크기 표시), `Building (7/7) FINISHED`.
- Pod IP는 Calico가 클러스터 안쪽 대역에서 나눠 준 주소라 클러스터 내부에서만 쓸 수 있다(Pod IP·ClusterIP는 Kubernetes Cluster에서만 사용 가능). 회사망·내 PC(Windows)는 그 대역으로 가는 길을 몰라 접근 불가 → Service(externalIPs 등)로 외부 진입로를 연다. (Windows CMD에서 `curl 10.111.218.77:8000` 시도 시 `curl: (28) Failed to connect ... after 21004 ms` 타임아웃 — 강사: 당연한 결과.)
- 포트 일관성: 앱이 listen하는 포트(코드), Dockerfile `EXPOSE`, `docker run -p`, Pod `containerPort`, Service `targetPort`를 같은 번호(8000)로 맞춘다. 강사는 소스가 원래 8080이었는데 자주 쓰는 8000으로 바꿨다고 설명했고, 캡처된 vi 화면에는 `listen(8080)`이 보이지만 이후 8000:8000 연결과 curl이 8000으로 성공 — 화면과 설명이 어긋나므로 따라 할 때는 8000으로 통일(참고용).
- `mkdir mynode && cd $_`: `$_`는 직전 명령의 마지막 인자(mynode)로 이동하는 셸 문법. 샘플 `runapp.js`는 Node 공식 문서 샘플에서 메시지만 "Welcome to Kubernetes~! by fastcampus."로 바꾼 것. (강사는 이후 LABs 디렉터리를 따로 만들 예정이나 이번에는 mynode 사용.)
- Service(externalIPs): Pod가 배치된 노드의 IP를 직접 적는 방식이며 각 노드의 kube-proxy가 iptables에 규칙을 등록 → 노드 IP로 접근하면 실제 Pod IP로 변환되어 컨테이너 앱까지 연결. selector `app: hi-nodejs`가 Pod 라벨과 일치해야 연결된다(Service의 목적은 라벨로 Pod IP를 Endpoint로 보유). `port`=Service가 받는 포트(외부 접속 포트), `targetPort`=Pod(컨테이너) 포트, `externalIPs`=외부에서 접속할 노드 IP.

### [사용한 CLI]
```bash
mkdir mynode && cd $_          # $_ = 직전 명령의 마지막 인자(mynode)
vi runapp.js
```
```javascript
var http = require('http');
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end("Welcome to Kubernetes~! by fastcampus." + "\n");
}).listen(8080);     // 자료 캡처 화면은 8080이나 강사는 8000으로 변경했다고 설명, 실습은 8000 기준(Dockerfile EXPOSE/-p/containerPort와 일치시킬 것 → listen(8000) 권장)
```

Docker로 먼저 검증
```bash
docker pull node:21-slim
docker run -it -d --name=runapp-nodejs -p 8000:8000 node:21-slim   # -d 백그라운드, -p 호스트:컨테이너 포트
docker cp runapp.js runapp-nodejs:/runapp.js                        # 호스트 파일을 컨테이너로 복사
docker exec -it runapp-nodejs node -v                                # v21.5.0
docker exec -it runapp-nodejs node runapp.js                         # 앱 실행
docker inspect runapp-nodejs                                          # 컨테이너 IP 확인 (172.17.0.2)
curl 172.17.0.2:8000
docker stop runapp-nodejs
docker rm runapp-nodejs
```

Dockerfile 작성 → 빌드 → 실행 → push
```dockerfile
FROM node:21-slim
EXPOSE 8000
COPY runapp.js .
CMD node runapp.js
```
```bash
docker build -t dbgurum/mynode:1.0 .      # -t: 이름:태그 지정, 마지막 . = 빌드 컨텍스트
docker images
docker run -it -d --name=runapp-nodejs -p 8000:8000 dbgurum/mynode:1.0
curl localhost:8000                       # Welcome to Kubernetes~! by fastcampus.
docker stop runapp-nodejs
docker rm runapp-nodejs

docker login
docker push dbgurum/mynode:1.0
```

Kubernetes Pod 배포 (mynode.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mynode-pod
  labels:
    app: hi-nodejs
spec:
  containers:
  - name: nodejs-container
    image: dbgurum/mynode:1.0
    ports:
    - containerPort: 8000
```
```bash
kubectl apply -f mynode.yaml
kubectl get po -o wide | grep mynode      # ContainerCreating -> Running, Pod IP/배정 Node 확인
curl <Pod IP>:8000                         # 클러스터 노드(master/node1~3)에서는 성공, Windows CMD에서는 실패
```

Service(externalIPs)로 외부 노출 (mynode-svc.yaml)
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mynode-svc
spec:
  selector:
    app: hi-nodejs
  ports:
  - port: 10001
    targetPort: 8000
  externalIPs:
  - 192.168.56.102
```
```bash
kubectl apply -f mynode-svc.yaml
kubectl get po,svc -o wide | grep mynode   # ClusterIP + EXTERNAL-IP(192.168.56.102) 10001/TCP
curl <ClusterIP>:10001
curl 192.168.56.102:10001                  # Windows CMD에서도 접근 가능

# 정리
kubectl delete -f mynode.yaml
kubectl delete -f mynode-svc.yaml
```

### [확인 방법/주의점]
- Pod 배포 후 `ContainerCreating`이 길게 가는 것은 이미지 pull 및 Calico IP 할당 지연일 수 있음 (자료에서 3분 이상 소요 사례). 강사 설명: 스케줄러가 정한 노드(영상에서는 k8s-node2)가 Docker Hub에서 이미지를 컨테이너 런타임으로 내려받아 컨테이너를 만드는 동안 ContainerCreating, 이후 calico가 노드에 준 CIDR 중 IP가 할당되면 Running + IP 표시. 네트워크(위치)에 따라 속도 차이가 있다.
- `externalIPs`는 **Pod가 어느 노드에 배치됐는지 확인한 뒤** 그 노드 IP로 지정한다(영상 실습은 Pod가 k8s-node2에 배치되어 192.168.56.102로 변경, 슬라이드 예시는 다른 실습 결과로 192.168.56.103). 해당 노드의 IP:port로 접근 가능(kube-proxy iptables 규칙 기반).
- 결과 확인: `kubectl get po,svc -o wide`에서 ClusterIP(클러스터 내부용)와 EXTERNAL-IP:10001(외부용)이 함께 보이며, ClusterIP:10001과 노드IP:10001 모두 응답, Windows 브라우저(192.168.56.102:10001)에서도 "Welcome to Kubernetes~! by fastcampus." 출력(영상 ClusterIP 예: 10.100.180.138).
- Pod 생성 시 앞 클립의 API 서버·etcd·스케줄러·kubelet·컨테이너 런타임이 유기적으로 동작하고 네트워크는 calico가 담당. Pod를 만든 뒤에는 `get`으로 기본 정보, `describe`로 세부 정보를 확인하는 것이 기본(강사).
- docker inspect의 `172.17.0.2`는 Docker 기본 네트워크가 부여한 컨테이너 IP 예시이며 환경마다 다르므로 본인의 inspect 결과를 사용. 슬라이드 메모: `docker exec ... node runapp.js` 실행 중 에러는 무시(슬라이드 표기 "실행 중-에러 무시"), 확인 후 Ctrl+C로 프로세스 종료.
- 강사 마무리: 전체 여정 = Docker로 이미지 개발 → 정상 이미지를 레지스트리에 올림 → Kubernetes 클러스터에 배포 → 그 동작을 Kubernetes가 관리(이것이 Kubernetes를 쓰는 이유). 아키텍처 지식이 없으면 운영할 수 없으므로 머릿속에 아키텍처가 있어야 한다. 5장부터 Pod, Service, Volume 등 리소스 오브젝트를 주제별로 만든다.
- selector(`app: hi-nodejs`)와 Pod labels가 일치해야 Endpoint가 연결된다.

---

## Step 6. Kubernetes object 개념과 YAML 작성법 (api-resources / explain)

### [목적]
YAML을 외우지 않고 `api-resources`, `api-versions`, `explain`으로 작성할 수 있도록 object 구조를 이해한다.

### [이론 설명]
- 5장 구성(7개 클립): ① Pod 라이프사이클 관리(생성·수정·상세 조회·삭제, 이벤트/상태 status 확인, 선언형(YAML)·명령형 두 방법) ② 설계 패턴 1 runtime container(일반 애플리케이션 컨테이너) ③ 설계 패턴 2 init container(메인보다 먼저 실행되는 특수 컨테이너) ④ 설계 패턴 3 sidecar container(모니터링·로그 수집 등 보조 역할) ⑤ Label(Pod 식별·그룹화, Service와 Pod를 연결하는 연결점) ⑥ Node Schedule(원하는 노드에 배치, taint/toleration) ⑦ Probe(Pod 상태 진단 기능, "진단 서비스"). 4장까지가 구축·관리도구·아키텍처·네트워킹 같은 기반이었다면 5장부터는 리소스 오브젝트(API 리소스)를 본격적으로 다룬다. 강사 강조: 마스터/워커에서 컴포넌트가 어떻게 동작하는지 머릿속에 그리고 있어야 현업 트러블슈팅·좋은 설계가 가능.
- **처음 Kubernetes를 접하는 사람에게는 YAML(선언형) 방식을 권장** — 번거롭더라도 YAML 계층 구조를 이해해야 운영 중 문제가 생겼을 때 매니페스트를 직접 고칠 수 있다(명령형만 쓰면 편리하지만 아쉬움이 남는다). 슬라이드 제목은 "05-01. Pod 관리 및 lifecycle"이며 내용이 길어 (1-1)/(1-2) 두 클립으로 나뉨.
- **Kubernetes object 관계도**: 중심에 Pod(안에 컨테이너 — Docker 컨테이너와 동일 — 와 애플리케이션)가 있고, ConfigMap·Secret·Volume(PVC/PV)·ReplicaSet·Deployment·HPA·Service·Ingress·Role 등 나머지는 Pod를 돕는 "부속품"으로 이해(서비스의 궁극 목적은 애플리케이션 서비스). 5장은 Pod 관리, 6장은 Service 등으로 이어진다.
- **Kubernetes API resource(object)**: 각 기능별로 사용자가 의도한 상태(desired state)의 작업을 수행하는 단위. 기본 정보와 의도한 상태를 기술한 `spec`을 제시하며, 생성 시 `.yaml(yml)` 파일을 kubectl에 제공하면 kubectl이 API 요청을 수행할 때 정보를 JSON 형식으로 변환(API 서버가 이를 받아 내부에 저장·기록). Pod는 대시보드로도 만들 수 있으나 일반적으로 kubectl 사용.
- `kubectl api-resources` 열: NAME / SHORTNAMES(pods→`po`, services→`svc`, deployments→`deploy` 등) / APIVERSION(`v1`=core 그룹, `apps/v1`=apps 그룹의 v1, beta·alpha 버전도 보임) / NAMESPACED(네임스페이스 소속 여부) / KIND(YAML `kind:`에 쓰는 이름, 대문자 시작·단어 결합 시 각 단어 첫 글자 대문자, 예 ReplicaSet).
- Kubernetes object의 YAML 공통 4요소: `apiVersion`, `kind`, `metadata`, `spec` (+ 시스템이 관리하는 `status`). 순서는 의미 없으나 이 순서가 관례.
  - apiVersion: Kubernetes가 지원하는 API 버전. `kubectl api-resources`의 APIVERSION 열 값을 쓰고 `kubectl api-versions`로 확인(`apps`=그룹, `v1`=버전, 그룹이 없는 apiVersion은 core 그룹). 개발 순서 Alpha → Beta → Stable(v1alpha1, v1alpha2, v1alpha3 → v1beta1, v1beta2 → v1). 가장 많이 쓰는 것은 v1이고 alpha/beta가 붙은 것은 아직 stable이 아닌 개발 중 기능. **Kubernetes를 업그레이드하면 API 버전이 바뀌거나 deprecated 되는 경우가 있으니 확인 필요.** 첫 줄에 `apps/v1`인지 `v1`인지는 api-resources 결과를 보고 결정(강사 조언).
  - kind: 어떤 object를 생성할지 종류 지정(api-resources의 KIND 열).
  - metadata: object 설명용 메타데이터(name, namespace, label 또는 그 다른 형태인 annotation). 예제는 name만 지정, namespace 생략 시 default 네임스페이스.
  - spec: 사용자가 의도한 상태를 기술하는 가장 중요한 영역(specification=명세서). 리스트가 아닌 정의이므로 spec 바로 아래 항목(selector, replicas, template)의 순서를 바꿔도 무방.
  - status: 사용자가 쓰지 않고 Kubernetes가 Pod 실행 후 상태값을 자동으로 계속 갱신.
- **`kubectl explain`**: 세부 정보가 궁금할 때 구글링보다 먼저 explain 사용. DESCRIPTION을 꼭 읽고 FIELDS의 apiVersion/kind/metadata/spec이 기본 항목. 계층 확인은 `explain pods` → `pods.metadata` → `pods.spec` → `pods.spec.containers` → `pods.spec.containers.image` 순으로 내려가며, 정확한 하위 계층 전체를 보려면 경로 끝에 `--recursive`(슬라이드 별표 강조). YAML과 JSON은 "형제"(키-값, 계층 구조) 같은 구조. pods 외에 `explain deployment`, `explain service` 등도 실습 권장. (슬라이드 참고 문구에는 `pods.spec.containers.images`로 적혀 있으나 실제 필드명은 `image`.)
- **ReplicaSet / Deployment**: Pod = 컨테이너를 담고 있는 기본 object(wrapper). ReplicaSet(RS)은 Pod 하나에 장애가 나도 사용자가 원한 상태 `replicas: 2`를 계속 유지(현재 상태와 desired state가 같은지 watch하다 다르면 되돌림). Deployment는 ReplicaSet을 만들어 그 안에서 Pod를 관리하는 상위 object로, 장애 시 새 Pod를 올리는 것은 같고 추가로 롤링 업데이트·롤아웃(예: 이미지를 1.17에서 1.19로) 같은 매니지먼트 기능이 있다(뒤 클립에서 학습). **MSA 서비스 구축 시에는 Pod 타입보다 Deployment 타입을 쓰는 경우가 훨씬 많다**(매니지먼트 기능이 많아 유리).
- Pod = 컨테이너를 담는 wrapper(포장지). 컨테이너 종류: runtime / init / sidecar.

### [사용한 CLI]
```bash
kubectl get no                       # 클러스터 상태(v1.28.5)
kubectl api-resources                # NAME / SHORTNAMES / APIVERSION / NAMESPACED / KIND
kubectl api-resources | grep -i xxx  # 특정 리소스 검색
kubectl api-versions                 # 사용 가능한 API 그룹/버전

# 필드 설명 조회
kubectl explain pods
kubectl explain pods.metadata
kubectl explain pods.spec
kubectl explain pods.spec.containers
kubectl explain pods.spec.containers.images
kubectl explain pods.spec --recursive         # 하위 필드까지 모두 출력
kubectl explain pods.spec.containers --recursive
```

예시: Deployment YAML
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myweb-deploy
spec:
  selector:
    matchLabels:
      app: web
  replicas: 2
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web-container
        image: nginx:1.25.3
        ports:
        - containerPort: 80
```

예시: 최소 Pod YAML 뼈대
```yaml
# 들여쓰기 2칸, YAML 검증: www.yamllint.com
apiVersion: v1
kind: Pod
metadata:
  name: mynode-pod
  labels:
    app: run-node
spec:
  containers:
  - image: dbgurum/mynode:1.0
    name: mynode-container
    ports:
    - containerPort: 8000
```

### [확인 방법/주의점]
- YAML은 들여쓰기에 민감 → **탭 금지**. 몇 칸이든 상관없지만 한 번 정한 칸 수(강사는 주로 2칸)를 문서 전체에서 일관되게 써야 하며 섞어 쓰면 에러가 난다. 검증 사이트(슬라이드): http://www.yamllint.com/, https://codebeautify.org/yaml-validator, https://onlineyamltools.com/validate-yaml — 문법 의미가 아니라 들여쓰기(계층 구조)를 검증해 주며 YAML을 붙여넣고 verify(검증) 버튼을 누르는 방식. 슬라이드 템플릿 주석: `kubectl api-resources | grep -i xxx`로 리소스 확인.
- `apps/v1`, `v1` 중 어떤 apiVersion을 쓸지는 `kubectl api-resources`로 확인.
- `status`는 Kubernetes가 채우므로 직접 작성하지 않는다.

---

## Step 7. Pod 기본 관리 (Pause 컨테이너, multi-container, 명령형/선언형, dry-run, MySQL)

### [목적]
Pod의 내부 구조(Pause 컨테이너, network namespace 공유)를 이해하고, Pod/Service를 YAML·명령어 두 방식으로 만들며 디버깅(logs, exec)한다.

### [이론 설명]
- **Pod란**: 사전적 의미는 "(물개·고래 등의) 작은 무리(떼)" — 물개·고래가 컨테이너에 해당. Pod는 Kubernetes의 기본적인 application 배포 단위로 하나 이상의 container를 포함하며, Kubernetes는 container를 개별적으로 하나씩 배포하지 않고 **Pod 단위로 배포**한다. 포함하는 container 종류(설계 패턴) 3가지: ① runtime container(기본, 실제 애플리케이션을 수행. nginx, MySQL 등 앱 자체를 탑재) ② init container(기동 시점에 처리하고 종료. 조건을 처리하는 동안 메인 컨테이너를 대기시켰다가 작업이 끝나면 메인을 시작시켜 주는 특수 컨테이너) ③ sidecar container(오토바이 옆 사이드카처럼 모니터링·로그 수집 등 보조 역할로 runtime 컨테이너와 함께 배포). 세 패턴은 5장 02~04번 클립에서 실습.
- **컨테이너가 아닌 Pod로 추상화한 이유(슬라이드)**: Pause container를 통해 HostOS의 namespace(lsns, Linux kernel 기술)를 공유함으로써 Pod 내부의 컨테이너들은 Pod 외부와 격리된 컨테이너의 장점을 유지하면서, Pod 내부에서는 자원(network, storage)을 공유하는 프로세스를 여러 container로 실행할 수 있다. IPC, Network, PID, File System 등이 namespace를 통해 공유되고 Pod 내부 프로세스들은 localhost에 접근하듯 서로에게 접근한다. 이는 외부와 격리된 몇 개의 docker container를 동일한 namespace로 묶어 쓰던 기존 아키텍처를 pod라는 이름으로 재정의한 것이며, 이 구조를 cluster의 기본 구성으로 가져가기 위해 K8s의 가장 작은 배포 단위를 container가 아닌 Pod로 규정한 것이다. ("같은 Pod = 같은 작은 호스트"로 이해)
- **Pause container**: Pod 생성 시 **가장 먼저** 실행되는 인프라 컨테이너. network/IPC/PID namespace를 확보·보유하고 Pod 내 다른 컨테이너가 이를 공유(namespace를 각 컨테이너에 직접 주는 것이 아니라 pause가 가진 것을 공유시킴) → 같은 Pod 컨테이너끼리 `localhost` 통신, Pod IP 하나 공유. SIGINT/SIGTERM 시그널을 받기 전까지 동작 없이 sleep 상태로 대기하므로 평소 눈에 잘 띄지 않는다. 강사: 컨테이너에 문제가 생겨 재시작될 때는 pause가 다시 깨어나 namespace를 공유시켜 주고 다시 sleep. Pod 생성 시 calico IPAM이 해당 노드의 IP를 할당하고 이 IP가 Pod IP가 되어 내부 컨테이너들이 동일하게 사용. Docker는 Docker 엔진이 직접 커널 기술로 컨테이너를 만들었지만 Kubernetes는 pod 단위와 pause 메커니즘을 쓴다.
- 컨테이너 격리 기술: Linux **cgroups**(호스트 자원을 제한해 각 container에 할당) + **namespace**(각 container가 외부와 격리된 IPC, Network, PID, File System을 갖게 독립적 공간을 논리적으로 형성). `lsns`는 호스트 커널의 namespace 종류(time, cgroup, pid, user, uts, ipc, net, mnt)를 보여 준다.
- **single container Pod** vs **multi container Pod**: single은 애플리케이션 실행에 필요한 모든 종속성을 제공하는 단일 컨테이너를 호스팅하며 생성이 간단하고 Kubernetes가 개별 컨테이너를 간접적으로 제어하는 방법을 제공. multi는 서로 의존하고 동일한 리소스를 공유하는 컨테이너를 호스팅하며 Pod 내에서 간단한 네트워크 연결 설정과 같은 스토리지 볼륨 접근이 가능하고 Kubernetes가 이를 단일 단위로 취급해 관리를 단순화. **multi-container의 두 컨테이너는 Pod의 Ethernet(네트워크 인터페이스)과 IP를 공유하므로 같은 포트를 동시에 쓸 수 없고 컨테이너 구분은 포트 번호로 한다**(강사는 프런트/백엔드 관계로 비유; c1:8000, c2:8080). 이 구조가 뒤에서 나올 ambassador·sidecar·adapter 패턴의 기반.
- **명령형(imperative)**: `kubectl {create|run}`으로 CLI에서 object 생성(`run`은 Pod만, `docker run`처럼 / Deployment 등은 `create` / `expose`는 Pod·Deployment를 service와 연결). 장점은 편리함이고 `-h`(help)가 잘 되어 있으며 YAML을 생성해 주는 옵션도 있음(뒤에서 설명). 단점은 YAML을 직접 써 보지 않으면 나중에 YAML 수정·문제 해결 능력이 떨어진다는 점. **선언형(declarative)**: YAML 작성 후 `kubectl apply -f`. `-f`는 file 옵션이며 create와 apply 모두 파일로 생성할 수 있지만 **apply는 (일부 경우) 업데이트도 가능하고 create는 그렇지 않다**(이미 존재하면 오류). `apply -f <디렉터리>/`는 그 안의 모든 YAML을 한꺼번에 apply. 조회는 get/describe(`-o`는 wide, yaml, json), 수정은 edit/patch/replace, 삭제는 delete. 강사: CKAD 같은 자격증 시험은 시간 싸움이라 명령형을 써야 하지만 실무·학습에서는 둘 다 익힐 것.
- `get -o yaml`: 작성한 YAML은 10줄 정도였지만 조회하면 훨씬 길다 — 사용자가 작성한 기본 스펙(desired state)에 Kubernetes가 운영하며 계속 갱신하는 `status`가 붙기 때문. `status` 영역에 containerStatuses(image, ready: true, restartCount: 0, state: running), hostIP(192.168.56.103), phase(Running), podIP(10.111.218.83), qosClass(BestEffort) 등이 표시. Pod의 lifecycle·이벤트는 (1-2)에서 다룬다.
- `strace kubectl get pod`: kubectl이 내부적으로 호출하는 시스템 콜을 보여 주는 디버깅 도구(`sudo apt -y install strace`로 설치). 강사가 직접 설치해 해 보길 권장.

### [사용한 CLI]
```bash
# 단일 Pod 생성
kubectl run myweb --image=nginx
kubectl get po -o wide | grep myweb

# 호스트의 namespace 확인 / pause 확인
lsns
ps -ef | grep pause
pstree
```

multi-container Pod
```bash
mkdir multi-pod && cd $_
vi multi-pod1.yaml                   # 컨테이너 c1(8000), c2(8080) 2개
kubectl apply -f multi-pod1.yaml
kubectl get po -o wide | grep multi  # READY 0/2 ContainerCreating -> 2/2 Running

# -c 로 컨테이너 지정하여 명령 실행
kubectl exec -it multi-container-pod -c c1 -- curl localhost:8080
kubectl exec -it multi-container-pod -c c2 -- curl localhost:8000
kubectl exec -it multi-container-pod -c c1 -- curl 10.111.218.83:8080   # Pod IP로도 접근
kubectl exec -it multi-container-pod -c c2 -- curl 10.111.218.83:8000
```

명령형 vs 선언형 명령 모음
```bash
# 명령형
kubectl create -h
kubectl create deployment deploy-name --image=image_name
kubectl run -h
kubectl run pod-name --image=image_name
kubectl expose ...

# 선언형
kubectl {create | apply} -f {mynode.yaml | URL/mynode.yaml}
kubectl apply -f resources/                 # 디렉터리 내 모든 YAML 적용
kubectl get pod [ -o {wide | yaml | json} ]
kubectl describe pod pod-name
kubectl delete pod -f mynode.yaml
kubectl delete pod -f mynode.yaml -f mynode-svc.yaml
kubectl delete {pod pod-name | pod/pod-name}
kubectl edit pod pod-name
kubectl replace -f mynode.yaml
kubectl patch -f mynode.yaml

kubectl get po multi-container-pod -o yaml   # status 포함 전체 정의 확인

# kubectl이 호출하는 API 확인
sudo apt -y install strace
strace kubectl get pod
```

LAB1: Pod + Service(externalIPs) YAML
```yaml
# myweb1.yaml
apiVersion: v1
kind: Pod
metadata:
  name: myweb1
  labels:
    app: myweb1
spec:
  containers:
  - name: nginx-container
    image: nginx:1.25.3-alpine
    ports:
    - containerPort: 80
```
```yaml
# myweb1-svc.yaml
apiVersion: v1
kind: Service
metadata:
  name: myweb-svc
spec:
  selector:
    app: myweb1
  ports:
  - port: 8001
    targetPort: 80
  externalIPs:
  - 192.168.56.103
```
```bash
mkdir 1-1-myweb1 && cd $_
vi myweb1.yaml
kubectl apply -f myweb1.yaml
kubectl get po -o wide | grep myweb1
vi myweb1-svc.yaml
kubectl apply -f myweb1-svc.yaml
kubectl get po,svc -o wide | grep myweb
curl <Pod IP>            # 80
curl <Service IP>:8001
curl 192.168.56.103:8001
kubectl delete -f myweb1-svc.yaml
kubectl delete -f myweb1.yaml      # 자료에는 myweb1-pod.yaml로 표기됨
```

LAB2: 명령어로 YAML 생성(dry-run) 및 expose
```bash
kubectl run -h
# --dry-run=client: 실제 생성 없이 검증, -o yaml: YAML 출력 -> 파일로 저장
kubectl run myweb2 --image=nginx:1.25.3-alpine --port=80 --dry-run=client -o yaml > myweb2-pod.yaml
vi myweb2-pod.yaml

kubectl run myweb2 --image=nginx:1.25.3-alpine --port=80
kubectl expose pod myweb2 --name=myweb2-svc --port=8002 --target-port=80
kubectl get po,svc -o wide | grep myweb2

kubectl delete pod myweb2
kubectl delete svc myweb2-svc
```

LAB3: MySQL Pod (오류 → logs → env 수정)
```bash
mkdir mysql && cd $_
vi mysql-pod.yaml            # image: mysql:5.7, containerPort: 3306
kubectl apply -f mysql-pod.yaml
kubectl get po -o wide | grep mysql   # Running 후 Error
kubectl logs mysql57-pod
# [ERROR] ... You need to specify one of: MYSQL_ROOT_PASSWORD / MYSQL_ALLOW_EMPTY_PASSWORD / MYSQL_RANDOM_ROOT_PASSWORD
kubectl delete po mysql57-pod
```
```yaml
# mysql-pod.yaml 에 추가한 env
      env:
      - name: MYSQL_ROOT_PASSWORD
        value: "<PASSWORD>"
```
```bash
kubectl apply -f mysql-pod.yaml
kubectl get po -o wide | grep mysql
kubectl describe po mysql57-pod        # Environment 확인
kubectl exec -it mysql57-pod -- bash
bash-4.2# mysql -uroot -p
mysql> show databases;
mysql> create database k8sdb;
mysql> use k8sdb;
mysql> create table products (prod_id int, prod_name varchar(20));
mysql> insert into products values (100,'kubernetes');
mysql> insert into products values (200,'fastcampus');
mysql> select * from products;
```
```yaml
# mysql-svc.yaml (외부 MySQL Workbench 접속용)
apiVersion: v1
kind: Service
metadata:
  name: mysql-svc
spec:
  selector:
    type: mysql57
  ports:
  - port: 13306
    targetPort: 3306
  externalIPs:
  - 192.168.56.103
```
```bash
vi mysql-svc.yaml
kubectl apply -f mysql-svc.yaml
kubectl get po,svc -o wide | grep mysql
# MySQL Workbench: Connection Method Standard TCP/IP over SSH,
#  SSH Hostname 192.168.56.103:22, SSH Username student, MySQL Hostname 192.168.56.103, MySQL Server Port 13306, Username root
```

### [확인 방법/주의점]
- 컨테이너 실행 후 바로 Error/CrashLoop이면 `kubectl logs <pod>`가 1순위(docker logs와 동일 개념, 표준 출력·표준 에러 제공). **MySQL 사례**: 환경변수 없이 apply하면 ContainerCreating → 잠시 Running → 몇 초 뒤 `Error`(RESTARTS 1)가 되며, logs에 `[ERROR] [Entrypoint]: Database is uninitialized and password option is not specified. You need to specify one of the following as an environment variable: MYSQL_ROOT_PASSWORD, MYSQL_ALLOW_EMPTY_PASSWORD, MYSQL_RANDOM_ROOT_PASSWORD`가 나온다 — MySQL 이미지는 루트 패스워드 환경변수가 필수. 해결: 기존 Pod 삭제 후 YAML 컨테이너 항목에 `env` 추가해 재생성 → `describe`의 Environment에 `MYSQL_ROOT_PASSWORD`가 들어갔는지 확인 → `kubectl exec -it mysql57-pod -- bash`로 접속(도커 exec와 동일, 프롬프트 `bash-4.2#`) 후 `mysql -uroot -p`.
- (LAB3 확장) MySQL Service(externalIPs): `kubectl expose`에는 external IP 옵션이 없으므로 expose로 YAML을 만든 뒤 external IP를 추가하는 방법도 가능(강사 언급). **externalIPs 방식의 단점: Pod를 먼저 만들어 노드가 정해진 뒤에야 그 노드 IP를 지정할 수 있다.** 접속 경로: 노드의 13306 → 컨테이너의 3306. Workbench 설정은 Standard TCP/IP over SSH, SSH 비밀번호와 root 비밀번호는 각각 입력창에서 입력(자료에 값 표시 없음). 컨테이너 안 DB도 네트워크로 연결되므로 기존 온프레미스 DB용 클라이언트 도구·애플리케이션을 그대로 쓸 수 있다.
- LAB 환경 메모: `kubectl get po,svc -o wide`를 쓰면 노드 정보까지 보이며, Pod는 만든 직후 ContainerCreating(READY 0/1), Service는 네트워킹 정보만 제공하므로 바로 만들어진다. **Pod IP는 80번 포트(Pod 포트), ClusterIP·externalIP는 Service에서 지정한 8001번 포트로 접속** — 내부 포트는 80이지만 외부 연결은 8001. 강사: 실습이 끝나면 리소스를 삭제할 것("계속 두면 점점 느려짐").
- `kubectl run --dry-run=client -o yaml`: 실제 생성 없이 "시험 실행"만 하고 YAML 출력(`> 파일`로 리다이렉션하면 뼈대 파일 생성). 모든 옵션이 `run`에 있지는 않다. 생성 파일에는 직접 쓰지 않은 부가 항목이 들어 있으니 수정·불필요 항목 삭제 가능, 수정 후 apply. YAML 없이 바로 만들려면 `--dry-run`과 출력 옵션을 지우고 실행. 강사 정리: 명령형의 핵심은 "YAML 코드를 대신 만들어 준다"는 점이며 기본 틀을 명령으로 만들고 수정하는 방법 + 직접 작성을 병행하면 가장 효율적, 처음에는 YAML 작성 훈련을 권장.
- `kubectl expose pod myweb2 --name=myweb2-svc --port=8002 --target-port=80`: myweb2-svc에는 external IP를 지정하지 않아 EXTERNAL-IP가 `<none>`이고 ClusterIP:8002는 클러스터 내부(다른 워커 노드에서는 접속 O, 내 PC CMD에서는 X)에서만 사용된다. (슬라이드 정리 명령에 `kubectl delete pod myweb2-pod`로 적혀 있으나 실습 Pod 이름은 `myweb2`이므로 실제로는 `kubectl delete pod myweb2`.)
- multi-container Pod는 `exec -c <컨테이너명>` 필수(`kubectl exec -it <Pod> -c <컨테이너> -- <명령>`). READY가 `2/2`(준비된 컨테이너 수/전체 컨테이너 수)가 되어야 정상(처음 0/2 ContainerCreating). 영상 통신 검증 결과: c1(containerPort 8000)에서 `curl localhost:8080` → c2가 응답, c2에서 `curl localhost:8000` → c1이 응답, Pod IP(10.111.218.83)로도 동일. 슬라이드 예시 IP(10.111.218.89)와 실습 IP가 다른 것은 Pod를 새로 만들었기 때문.
- `kubectl run myweb --image=nginx` 한 줄에도 API 서버·스케줄러·etcd가 유기적으로 동작해 노드를 정함(영상에서는 k8s-node3, Pod IP 10.111.218.82). 노드에서 `lsns`/`ps -ef | grep pause`/`pstree`로 pause 확인.
- `--dry-run=client -o yaml`로 생성한 YAML에는 `creationTimestamp: null`, `restartPolicy`, `status: {}` 등 불필요 필드가 있으니 정리해 사용.
- Service selector와 Pod label 불일치 시 Endpoint가 비어 접속이 안 된다.
- (자료 기준) 같은 Pod 내 컨테이너는 포트 충돌이 없도록 설계.

---

## Step 8. Pod 네트워크 · 종료 과정 · lifecycle

### [목적]
Pod 통신 3유형과 Pod 삭제(종료) 절차, 상태(Phase)와 Conditions를 이해한다.

### [이론 설명]
- **Pod network 개요**: Kubernetes는 **플랫(flat) 네트워크 구조**를 사용해 컨테이너와 호스트 간 포트 매핑 과정을 제거하여 유지 관리와 비용을 줄인다. 한 노드 안에서 Pod는 여러 개 실행될 수 있고, 클러스터는 CNI(이 환경은 calico)를 통해 하나의 네트워크처럼 동작한다.
- **Container to Container**: 같은 Pod의 여러 컨테이너는 Pause container에 의해 network namespace를 공유 → `localhost` 및 포트로 통신. **단, 포트 충돌 방지를 위해 같은 Pod의 각 컨테이너는 고유한 포트**를 써야 한다(예 c1:8000, c2:8080).
- **Pod to Pod(같은 노드)**: 모든 Pod는 IP 주소(eth0)와 network namespace가 있고, Pod 간을 연결하는 가상 이더넷(veth, calico 제공, tunl0 연결)이 있어 pod(eth0) ↔ pod(eth0) 통신이 가능. 노드의 Bridge(tunl0)에는 veth1(cali123)-10.111.218.88, veth2(calixxx345)-10.111.218.99처럼 Pod IP와 가상 이더넷 쌍이 등록되어 있다. 흐름(강사): 앱 컨테이너 요청 → Pod 이더넷 → 노드 브릿지 네트워크 → 브릿지가 라우팅 테이블처럼 veth(cali..)를 모두 등록해 두고 목적지 Pod가 있는지 확인 후 해당 이더넷으로 전달(프런트엔드 Pod ↔ 백엔드 Pod 통신도 같은 메커니즘).
- **Pod to Pod(다른 노드) / Node to Node**: 클러스터는 대부분 Node에 할당된 IP 주소가 포함된 Routing Table을 저장하며, Routing Table은 bridge가 요청을 해결할 수 없을 때 연결된 Node의 IP를 확인하는 데 쓰인다. 일치하는 network 콘텐츠가 적절한 Node에 연결되고 연결은 Node 수준에서 지속. 강사: 같은 노드 안에서는 브릿지로 충분하지만 브릿지는 원래 외부 연결이 안 되므로(도커 브릿지가 로컬용인 것과 같음) 노드 IP를 통해 나가 라우팅 테이블에서 "원하는 Pod가 Node2에 있다"를 확인하고 전달. 경로: Pod eth0 – veth(pair) – cali 인터페이스 – Calico vRouter – tunl0 – 노드 이더넷(enp0s8) – 옆 노드(역순). 강사 결론: "클러스터로 구성만 되어 있으면 안에서는 전부 통신된다"(클러스터 IP 접속이 되는 것도 이런 연결 정보를 활용하기 때문).
- **Pod 종료(삭제) 과정**(슬라이드 37쪽): Pod 삭제 요청이 API 서버에 수신되면 먼저 etcd 상태를 수정하고, 요청을 수행하는 kubelet(A)과 Endpoints controller(B)에 알린다. 이 이벤트는 API 서버에 의해 **병렬**로 처리된다.
  - A: ① client가 API server에 Delete pod → A1 API server가 해당 노드 kubelet에 삭제 알림 → A2 kubelet이 Pod의 컨테이너를 중지.
  - B: B1 API server가 Endpoints controller에 알림 → B2 Endpoints controller가 Pod를 endpoint에서 제거(API server에 반영) → B3 변경 사항이 각 노드의 Kube-Proxy에 전달 → B4 Kube-Proxy가 iptables에서 해당 Pod 제거. (강사: Endpoints controller는 "Pod의 IP를 관리하는 역할"이라 삭제 시 IP도 회수해야 하고 노드 iptables에 기록된 Pod IP도 지워야 하므로 Kube-Proxy로 전달. 이 흐름은 어느 정도 알고 있어야 함.)
  - kubelet은 Pod에 **SIGTERM** 신호 전송 → SIGTERM을 받으면 처리 중이던 작업을 완료하고 새 요청은 받지 않도록 개발되어 있음(graceful shutdown) → 일정 시간 내 종료되지 않으면 **SIGKILL**로 강제 종료. 이 대기 기간은 `terminationGracePeriodSeconds`(기본값 30초).
- 모든 Pod는 삭제 전에 `terminationGracePeriodSeconds` 값을 갖는다(직접 지정하지 않아도 기본 30, `get -o yaml | grep -i terminationgrace` 또는 `kubectl edit`로 확인). `kubectl delete pod myweb`만 실행하면 grace period(30초)를 지켜 삭제되고 30초 안에 안 끝나면 강제 삭제. 처음부터 빨리 지우려면 `--grace-period=0 --force`(슬라이드 손글씨: 기본 30초를 0초로). **임시로 만드는 Pod라면 YAML에 아예 `terminationGracePeriodSeconds: 0`을 지정하면 delete 시 바로 삭제**된다. 참고: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
- **Pod lifecycle**: 생성부터 삭제까지를 Pod의 lifecycle로 본다. YAML을 작성해 apply하는 순간 Pod가 정의되고 그때부터 lifecycle 시작. Pod는 정의된 lifecycle에 따라 구동되며 실행 중 오류가 있으면 **kubelet이 오류 처리를 위해 restart 수행**, k8s는 Pod 내 다양한 컨테이너 상태를 추적하고 Pod를 다시 정상 상태로 만들 조치를 결정. 실행 중인 Pod는 명세(spec, 우리가 만든 것)와 실제 상태(status, 실행하면 자동 기록)를 모두 보유. **Pod는 수명 중 한 번만 스케줄**되며 Node에 스케줄되면 중지·종료될 때까지 해당 Node에서 실행(종료되면 다른 노드에 다시 할당될 수 있음). RESTARTS 열 = Pod가 Running이었다가 장애가 나 kubelet이 재시작한 횟수(영상: kubeshark-worker-daemon-set Pod가 CrashLoopBackOff이고 RESTARTS가 35, 42 등으로 증가).
- **Pod Phase(status)**(슬라이드 41쪽): Pending = Pod 작성을 기다리는 상태, 컨테이너 image 다운로드 등에 소비되는 시간(강사: ContainerCreating도 내부적으로는 pending의 일종) / Running = Pod가 가동 중 / Succeeded = Pod 내 컨테이너가 정상 종료 / Failed = Pod 내 특정 컨테이너가 실패하여 종료 / Unknown = 어떤 이유로 Pod와 통신 불가(일반적으로 Pod 호스트와의 통신 오류로 발생). 전이: Pending → Running → Succeeded 또는 Failed, Unknown은 별도 상태.
- **Pod Conditions(type)**(슬라이드 42쪽): Initialized(모든 초기화 컨테이너가 성공적으로 시작 완료 — init container는 아직 배우지 않았고 없으면 그냥 넘어감), Ready(Pod가 요청 가능한 상태), ContainersReady(Pod 안 모든 컨테이너가 준비 상태), PodScheduled(Pod가 하나의 Node로 스케줄 완료), Unschedulable(스케줄러가 자원 부족·여러 제약 등으로 바로 스케줄할 수 없는 상태). 필드(슬라이드 44쪽): `type`(컨디션 이름), `status`(True=활성화/False=비활성화/Unknown, 적용 가능 여부), `lastProbeTime`(마지막 probe 시간 timestamp), `lastTransitionTime`(한 상태에서 다른 상태로 마지막 전환 시간), `reason`(마지막 전환 이유, 기계가 판독 가능한 카멜 표기법), `message`(마지막 전환 상세, 읽기 가능한 메시지). `kubectl describe`나 `kubectl edit`의 `status.conditions`에서 확인(영상: myweb2 describe의 Conditions 4개 모두 True, QoS Class BestEffort, Events). lifecycle 전체 안쪽의 현재 conditions·Events는 describe/edit로 집중해서 확인(강사 마무리).

### [사용한 CLI]
```bash
# Pod 즉시 강제 삭제
kubectl delete pod myweb --grace-period=0 --force

# terminationGracePeriodSeconds 확인/수정
kubectl get po myweb -o yaml | grep -i terminationgrace
kubectl edit pod myweb
#   terminationGracePeriodSeconds: 30

# 상태/Conditions 확인
kubectl get po,svc -o wide          # RESTARTS, STATUS(Running/CrashLoopBackOff)
kubectl describe pod myweb2         # Conditions, QoS Class, Events
kubectl run mynode-pod --image=dbgurum/mynode:1.0 --port=8000
kubectl describe pod mynode-pod     # Status: Running, IP, Conditions
kubectl edit po mynode-pod          # status.conditions 필드 확인
```
```yaml
# myweb.yaml 에서 종료 유예 시간 설정
spec:
  containers:
  - name: container
    image: nginx:1.23.1-alpine
  terminationGracePeriodSeconds: 0
```

### [확인 방법/주의점]
- 기본 `kubectl delete pod`는 최대 30초 대기. 빠른 삭제가 필요하면 `--grace-period=0 --force`(실습용; 운영에서는 graceful shutdown 필요).
- RESTARTS 수가 증가하면 kubelet이 컨테이너를 재시작한 것(CrashLoopBackOff 등).
- 참고: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/

---

## Step 9. Pod 설계 패턴 (runtime / init / sidecar container)

### [목적]
Pod 내부에서 컨테이너를 역할별로 구성하는 3가지 패턴을 실습한다.

### [이론 설명]
- **runtime container**: Pod가 포함하는 일반적인 애플리케이션 컨테이너(강사: "파이썬을 담았다, 엔진엑스를 담았다 — 이런 애플리케이션 컨테이너"; 앞 클립에서 실습한 "애플리케이션을 돌리는 형태"가 곧 runtime container). Pod는 애플리케이션 코드가 포함된 단일 컨테이너에 대한 wrapper(포장지) 역할이며 Kubernetes에서 배포하는 가장 작은 단위. 포함 관계: Deployment(Scaling, updates and rollbacks) ⊃ Pod(Smallest Unit of Deployment) ⊃ Container(Application Code: python, nginx 등). 컨테이너는 "애플리케이션 + 실행에 필요한 환경"을 묶은 단위이고, init/sidecar와 구분하려고 "본업을 하는 일반 컨테이너"를 runtime container라 부른다. 단일 Pod는 관리(management) 기능이 약해 Deployment로 확장(scale/rolling update/rollback/rollout, self-healing).
- **Pod 종료 시 복제본과 이름 기반 연결(슬라이드 47)**: Pod가 예기치 않게 종료되면 Kubernetes는 이를 수정하지 않고 그 자리에 **새 Pod를 생성**하며, 새로 시작된 Pod는 **DNS 및 IP 주소를 제외한** 기존 Pod의 복제본이다. 이 기능은 애플리케이션 설계 방식에 큰 영향을 끼치므로 애플리케이션은 더 이상 지정된 Pod에만 연결될 필요가 없고, 클러스터 내 어디에서나 생성된 완전히 새로운 Pod가 원활하게 자리 잡도록 설계해야 한다. 강사: 노드 장애로 Pod가 중단되면 같은 노드에 만들 수 있으면 그 노드에, 못 만들면 다른 노드에 새 Pod를 만든다(애플리케이션은 동일하나 IP 등만 바뀜). 그래서 **Kubernetes 안의 애플리케이션끼리는 IP가 아니라 Pod 이름·Deployment 이름 같은 이름으로 연결**하고, 외부에서 오는 경우에도 Service가 Pod에 연결되어 있어 IP가 바뀌어도 문제없다. "이미지를 만들어 Pod로 배포한다"에서 그치지 말고 내부 동작을 정확히 알아야 설계로 인한 성능·장애 문제를 줄일 수 있다.
- **LAB 흐름 요약**: ① [LAB1] 이미지 build → push → Pod(명령형 + dry-run YAML) → NodePort Service ② [LAB2] 같은 이미지를 Deployment(`--replicas=3`)로 → NodePort Service → kubeshark로 트래픽 분산 확인.
- **init container(`initContainers`, initial container)**: 한 Pod 안에서 Application container **이전에** 실행되는 특수 컨테이너로 목적은 app container가 실행될 환경 준비(메인 프로세스의 환경을 "초기화(initialize)"). 예: 파일·데이터 가져오기. 메인 컨테이너는 init container가 끝날 때까지 대기(`Waiting`/`PodInitializing`)하며, `containers`와 `initContainers`는 spec 아래 별개 항목이고 **YAML에 나열된 순서와 상관없이 init container가 먼저 실행**된다.
  - 동작 규칙: ① Pod의 모든 **네트워킹·스토리지가 프로비저닝된 후** 실행 ② init container가 실패하면 kubelet이 **성공할 때까지 반복 재시작** ③ 단 Pod `restartPolicy: Never`이면 init container 실패 시 Kubernetes가 **전체 Pod를 실패로 처리하고 종료**. restartPolicy 비교(강사): Docker 컨테이너는 별도 지정이 없으면 재시작 안 함(no), Kubernetes는 기본값이 `Always`라 kubelet이 자동 재시작, `Never`를 주면 재시작 없이 그대로 종료(실패 처리).
  - 사용 사례: ① MSA 애플리케이션에서 원격지 소스의 최신 구성 파일을 가져오는 작업을 init container로 구성하면 앱 컨테이너가 항상 최신 구성 파일을 사용 ② 데이터베이스 초기화 / 앱 컨테이너 연결 전 초기(기본) 데이터 채우기(스키마 생성, 데이터 마이그레이션 등 DB 설정 작업을 처리해 DB가 앱과 상호작용할 준비가 됐는지 확인). 강사의 예: 크롤링 데이터를 30분마다 수행해 최신 데이터를 가져와 서비스하는 경우, 일기예보 Open API에서 정보를 가져와 보여 주는 경우 — "신규·최신 데이터를 가져와야 할 때 init container가 필요".
  - 구조(슬라이드): ① Local volume에 공유 영역 생성 ② init container가 외부 리소스(Open API)에 curl 요청 후 데이터를 Local volume에 기록 ③ Application container는 시작과 함께 같은 Local volume에서 필요한 데이터를 읽음 — app container는 init container 작업 이후에만 시작. 다운로드는 보통 curl(URL로 데이터를 요청·내려받는 명령줄 도구). volume은 6장 정도에서 배우며 지금은 "공유 저장 공간"으로 이해. `emptyDir` = Pod가 만들어질 때 생기는 빈 임시 디렉터리로 같은 Pod 컨테이너들이 함께 마운트해 사용.
  - 핵심 효과(슬라이드 붉은 문구): init container는 **애플리케이션 소스 코드를 변경할 필요 없이** 애플리케이션을 실행할 수 있도록 k8s에서 환경을 구성하는 수단을 제공. 준비 작업까지 모두 app container에 담으면 컨테이너가 무거워지므로, **Pod 안에서 작업을 분리하고 준비가 끝나면 그 컨테이너를 종료**하는 것이 리소스·성능 측면에서 좋은 설계(강사: "작업을 분리시킨다는 원칙").
  - STATUS 읽는 법: `Init:0/1` = init container 1개 중 0개 완료, `PodInitializing` = init container가 끝나고 본 컨테이너를 시작하는 중, `1/1 Running` = 모든 컨테이너 준비·실행 중. 즉 일반 Pod lifecycle에 Init 단계가 추가(강사는 이 실습에서 PodInitializing 단계를 놓쳤다고 언급).
- **sidecar container**: "사이드카"는 오토바이 옆에 붙은 보조 좌석 — 말 그대로 보조 역할을 하는 컨테이너. 메인(application) 컨테이너와 같은 Pod에서 함께 작동하며(init container와 같은 Pod에 배치되는 점은 비슷하나 동작 방식이 다름) 특정 추가 기능과, 애플리케이션의 **관찰 가능성(observability)** 향상을 위한 로깅·모니터링 서비스(Prometheus 등)·프록시 등을 구현. 슬라이드: 코드 분리를 촉진하고 관찰 가능성을 개선하며 확장성과 보안을 단순화해 Kubernetes 배포를 향상. **application container는 원래 목적의 기능에만 충실하고 나머지 부가적인 공통 기능은 sidecar를 추가해 사용**한다 — 로그 수집·모니터링을 앱 컨테이너에 함께 넣으면 성능·속도·민첩성·탄력성에 영향을 주기 때문(강사: "애플리케이션 컨테이너는 자기 일에 집중하고 모니터링은 sidecar가 맡게"). (관찰 가능성 = 시스템 내부 상황을 로그·지표(metric)·추적(trace) 데이터로 볼 수 있는 정도.) 같은 Pod이므로 네트워크와 volume(emptyDir)을 공유할 수 있어 메인 컨테이너를 수정하지 않고 기능을 확장.
  - 구조(슬라이드 67~69): 웹서버 컨테이너(Application)는 웹서버 역할에 충실하고 자신의 로그는 Pod의 파일(Local volume)로 남기며, sidecar(로그 수집)가 파일시스템에 쌓이는 로그를 수집해 외부 로그수집기·모니터링 도구로 전달. nginx/apache 같은 웹서버에는 항상 접근 기록(access log)과 오류 기록(error log)이 있고 개발자는 이를 통해 문제 해결·디버깅 — 두 로그를 로컬 볼륨에 공유해 두면 sidecar가 Elasticsearch·Prometheus 같은 외부 도구에 제공 가능. MSA 환경에서 application container는 요청 처리 같은 핵심 기능을, 로깅·모니터링은 sidecar가 수집 로그를 중앙 로깅 시스템으로 전달하거나 생성 로그를 캡처해 적절한 대상으로 전달만 담당(MSA의 핵심은 코드(기능) 분리). 리소스 모니터링을 위해 Prometheus 같은 도구와 통합해 지표를 수집하고 리소스 사용량·마이크로서비스 성능 데이터를 수집.
  - 이 실습(LAB1)은 실제 로그 수집기 대신 sidecar가 1초마다 날짜를 파일에 기록하고 그 파일을 nginx가 서비스하는 경로와 공유하도록 "로그 수집을 가정"한 것이다.

### [사용한 CLI]

**(A) runtime container – 이미지 빌드 → Pod → Service → Deployment**
```dockerfile
FROM nginx:1.23.1-alpine
RUN mkdir -p /usr/share/nginx/html/assets
RUN mkdir -p /usr/share/nginx/html/css
RUN mkdir -p /usr/share/nginx/html/js
COPY index.html /usr/share/nginx/html/index.html
COPY assets /usr/share/nginx/html/assets
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```
```bash
unzip dev_web.zip
vi Dockerfile
docker build -t mymotto:1.0 .
docker images | grep mymotto
docker run -d --name=mymotto -p 8001:80 mymotto:1.0
curl localhost:8001
docker image tag mymotto:1.0 ID/mymotto:1.0     # ID = Docker Hub 계정
docker push ID/mymotto:1.0

# Pod YAML 생성 및 배포
cd LABs/ && mkdir mymotto && cd $_
kubectl run mymotto --image=dbgurum/mymotto:1.0 --port=80 --dry-run=client -o yaml > mymotto.yaml
vi mymotto.yaml
kubectl run mymotto --image=dbgurum/mymotto:1.0 --port=80
kubectl get po -o wide | grep mymotto
curl <Pod IP>

# NodePort Service
kubectl expose po mymotto --name=mymotto-svc --port=8002 --target-port=80 --type=NodePort --dry-run=client -o yaml > mymotto-svc.yaml
vi mymotto-svc.yaml
kubectl expose po mymotto --name=mymotto-svc --port=8002 --target-port=80 --type=NodePort
kubectl get po,svc -o wide | grep mymotto     # 8002:30286/TCP -> 192.168.56.102:30286

# Deployment (replicas=3)
kubectl create deployment mymotto-deploy --image=dbgurum/mymotto:1.0 --port=80 --replicas=3 --dry-run=client -o yaml > mymotto-deploy.yaml
vi mymotto-deploy.yaml
kubectl apply -f mymotto-deploy.yaml
kubectl get deploy,po,svc -o wide | grep mymotto-deploy     # 3/3, Pod가 node1~3에 분산
kubectl expose deployment mymotto-deploy --name=mymotto-deploy-svc --port=8003 --target-port=80 --type=NodePort   # 8003:31241/TCP

# kubeshark로 트래픽(Service Map) 시각화 (브라우저 localhost:8899)
ks tap -n default "(calico*|mymotto*)"
```

**(B) init container – 예제 1: Open API 데이터를 받아 nginx에 표시 (weather.yaml)**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: weather-pod
  namespace: default
spec:
  volumes:
  - emptyDir: {}
    name: weather-data
  initContainers:
  - name: download-config
    image: curlimages/curl:7.85.0
    args: ["https://api.open-meteo.com/v1/forecast?latitude=37.5443878&longitude=127.03744246&current_weather=true", "-o", "/usr/share/nginx/html/index.html"]
    volumeMounts:
    - mountPath: /usr/share/nginx/html
      name: weather-data
  containers:
  - image: nginx:1.25.3-alpine
    name: nginx-container
    ports:
    - containerPort: 80
    volumeMounts:
    - mountPath: /usr/share/nginx/html
      name: weather-data
```
```bash
cd LABs/ && mkdir initcontainer && cd $_
vi weather.yaml
kubectl apply -f weather.yaml
kubectl get po -o wide | grep weather      # Init:0/1 -> PodInitializing -> Running
curl <Pod IP>                              # JSON 날씨 데이터(index.html)
```

**(C) init container – 예제 2: Service가 생길 때까지 대기 (myapp-init-pod.yaml)**
```bash
kubectl run myapp-init-pod --image=busybox --dry-run=client -o yaml > myapp-init-pod.yaml
vi myapp-init-pod.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp-pod
  labels:
    app: myapp
spec:
  containers:
  - name: myapp-container
    image: busybox:1.28
    command: ['sh', '-c', 'echo The app is running! && sleep 3600']
  initContainers:
  - name: init-myservice
    image: busybox:1.28
    command: ['sh', '-c', "until nslookup myservice.$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace).svc.cluster.local; do echo waiting for myservice; sleep 2; done"]
```
```bash
kubectl apply -f myapp-init-pod.yaml
kubectl get po -o wide | grep myapp-pod    # Init:0/1 (myservice 없음)
kubectl describe pod myapp-pod             # Init Containers: Running/Ready False, Containers: Waiting(PodInitializing)
```
```yaml
# myservice.yaml
apiVersion: v1
kind: Service
metadata:
  name: myservice
spec:
  ports:
  - protocol: TCP
    port: 80
    targetPort: 9376
```
```bash
kubectl apply -f myservice.yaml
kubectl get po,svc -o wide | grep myapp-pod    # Init:0/1 -> PodInitializing -> Running
kubectl describe pod myapp-pod                  # init container: Terminated/Completed (Exit Code 0), 메인 Running
```

**(D) sidecar container – LAB1: 날짜를 1초마다 index.html에 기록 (sidecar-pod.yaml)**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: log-pod
spec:
  containers:
  - name: app-container
    image: nginx:1.25.3
    volumeMounts:
    - name: html-log
      mountPath: /usr/share/nginx/html/
  - name: sidecar-container
    image: debian:10
    volumeMounts:
    - name: html-log
      mountPath: /date-log
    command: ["/bin/sh", "-c"]
    args:
    - while true; do
        date >> /date-log/index.html;
        sleep 1;
      done
  volumes:
  - name: html-log
    emptyDir: {}
```
```bash
kubectl delete po myapp-pod weather-pod
mkdir sidecar && cd $_
vi sidecar-pod.yaml
kubectl apply -f sidecar-pod.yaml
kubectl get po -o wide | grep log-pod        # 0/2 ContainerCreating -> 2/2 Running
kubectl exec log-pod -c app-container -- tail -f /usr/share/nginx/html/index.html
kubectl exec log-pod -c sidecar-container -- tail -f /date-log/index.html
kubectl describe po log-pod
```

**sidecar LAB2: nginx 로그를 공유 볼륨으로 sidecar에서 출력 (blog-web.yaml)**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: blog-web
  labels:
    name: blog
spec:
  volumes:
  - name: shared-logs
    emptyDir: {}
  containers:
  - name: blog-web-container
    image: nginx:1.25.3
    volumeMounts:
    - name: shared-logs
      mountPath: /var/log/nginx
  - name: sidecar-container
    image: debian:10
    command: ["/bin/bash", "-c", "while true; do cat /var/log/nginx/access.log /var/log/nginx/error.log; sleep 5; done"]
    volumeMounts:
    - name: shared-logs
      mountPath: /var/log/nginx
```
```bash
vi blog-web.yaml
kubectl apply -f blog-web.yaml
kubectl get po -o wide | grep blog
kubectl exec blog-web -c blog-web-container -- tail -f /var/log/nginx/access.log
kubectl exec blog-web -c sidecar-container -- tail -f /var/log/nginx/access.log
kubectl describe po blog-web
# curl <Pod IP> 로 요청하면 access.log에 기록이 쌓임
```

### [확인 방법/주의점]
- init container 사용 시 STATUS가 `Init:0/1`(init 1개 중 0개 완료)로 보이며 `describe`의 Init Containers 섹션에서 상태 확인.
- weather.yaml(LAB1): 서울숲공원의 위도·경도(`latitude=37.5443878&longitude=127.03744246`)로 날씨 Open API(open-meteo)를 받는 예이며 YAML이 꽤 복잡하므로 다 외워 쓰기보다 핵심 구조를 이해(위도·경도 값이 args에 들어가는 부분 확인). `volumes`의 emptyDir `weather-data`를 init container `download-config`(curl 이미지)와 메인 `nginx-container`가 같은 경로 `/usr/share/nginx/html`에 마운트 → curl이 받은 JSON이 index.html로 저장되고 nginx가 제공. 결과 curl은 JSON 한 줄(예: latitude 37.55, longitude 127.0625, current_weather 항목의 temperature 3.0°C, windspeed 1.3km/h 등). 실습 화면에서는 `Init:0/1` → `Running`만 캡처(PodInitializing 놓침), 슬라이드 교재 예시 IP(10.109.131.29)와 실제 IP·노드는 다름.
- myapp-init-pod.yaml(LAB2, Kubernetes 공식 문서 실습): "myservice"라는 Service가 생성되기를 기다리는 init container를 가진 Pod. init container(`init-myservice`)가 `nslookup`으로 myservice를 **2초 간격으로 무한 반복 조회**하다 성공하면 종료 → 그제야 `myapp-container`(busybox)가 "The app is running!"을 출력하고 3600초(1시간) 대기. `$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)`는 Pod가 속한 namespace를 읽어 `myservice.<namespace>.svc.cluster.local` Service DNS 이름을 만든다. (Pod와 Service 간 연결성은 없고 initContainers만 테스트 — 이름만 맞으면 됨, 슬라이드 Service는 port 80/targetPort 9376인 단순 예.) YAML 뼈대는 `kubectl run ... --dry-run=client -o yaml`로 만들고 init container 부분을 추가하며, 처음에는 복붙보다 직접 작성하는 연습 권장. busybox는 기본 리눅스 명령을 모은 작은 이미지.
- describe 관찰(Service 생성 전): Node k8s-node1, Status: Pending, `Init Containers: init-myservice` State **Running, Ready False**(강사: "State가 Running인데 아직 Ready는 아니라는 점이 중요" — 무한 대기 루프가 안 끝났기 때문), `Containers: myapp-container` State **Waiting, Reason PodInitializing, Ready False**, Conditions는 Initialized False / Ready False / ContainersReady False / PodScheduled True. Events에는 Scheduled·Pulling·Pulled·Created·Started(init-myservice)만 나타나며 별 문제 없음. 
- Service 생성 후: init container가 조회에 성공해 `Terminated / Completed / Exit Code 0`(약 4분 42초 동안 Service 대기)이 되고 메인 컨테이너가 `Running`, Ready True로 변함 — 강사가 말하는 "전과 후의 차이".
- `emptyDir`은 Pod 수명과 같이 생성/삭제되는 임시 볼륨. volumeMounts의 `name`은 volumes의 `name`과 일치해야 한다(강사 강조, blog-web은 볼륨 `shared-logs`가 모든 곳에서 동일). 두 컨테이너가 같은 볼륨을 **서로 다른 경로**에 마운트해도(sidecar `/date-log/index.html` = nginx `/usr/share/nginx/html/index.html`) 사실상 같은 파일이며, debian 컨테이너의 `/date-log` 디렉터리와 index 파일은 마운트로 자동 생성된다. 슬라이드 문구의 "영구 볼륨"은 운영에서 로그를 보존하려는 요구를 뜻하며 이 실습 YAML 자체는 임시 볼륨 emptyDir 사용.
- sidecar가 있으면 READY가 `2/2`(Pod 안 컨테이너 2개 모두 준비)로 표시(처음 0/2 ContainerCreating — 이미지를 받는 동안, 영상에서 약 87초간 반복 조회).
- LAB2(blog-web): `labels: name: blog`는 grep·Service 연결 시 Pod를 구분하는 표식. sidecar가 `/var/log/nginx`의 access.log·error.log를 5초 간격으로 cat(강사: 리눅스 NFS 공유와 비슷하다고 비유, Prometheus·Elasticsearch로 전달하는 활용도 가능). 이 Pod에는 Service를 만들지 않아 **브라우저로는 접근되지 않으므로** 다른 노드에서 `curl <Pod IP>`로 접근해 access log에 기록을 남긴다(접근 전에는 로그가 비어 있음). `-c blog-web-container`와 `-c sidecar-container` 양쪽에서 `tail -f /var/log/nginx/access.log`를 실행하면 동일한 접근 기록(클라이언트 IP, 시각, "GET / HTTP/1.1", 200, curl/7.81.0)이 보인다. `kubectl exec ... -c <컨테이너> -- <명령>`에서 `--` 뒤는 kubectl 옵션이 아니라 컨테이너 안에서 실행할 명령이며 `tail -f` 중지는 Ctrl+C. 슬라이드 예시(12월 28일, node2)와 실제 화면(12월 29일, node1)의 값은 다르나 구조·결과는 같다.
- 강사 당부: 실습을 통해 이해한 뒤 실제 애플리케이션에 sidecar를 도입하는 방안을 생각해 볼 것.
- `kubectl exec ... tail -f`는 Ctrl+C로 중단.
- NodePort 번호(예: 30286, 31241)는 환경마다 자동 할당 값이 다르다. NodePort는 30000번대(30000~32767) 범위의 포트 중 하나를 **랜덤 지정**하며 "Pod가 떨어진 노드의 IP + 지정된 포트"로 접속(슬라이드: 192.168.56.102:30286, 브라우저 시크릿 창에서 "WHAT IS YOUR MOTTO?" 페이지 표시). `--port`는 service가 받는 포트(클러스터 내부용), `--target-port`는 Pod 컨테이너 안에서 실제 열려 있는 포트, `--type=NodePort`는 모든 노드의 특정 포트로 외부 접근을 허용.
- runtime container LAB 메모: `dev_web.zip`은 강사가 제공하는 무료 웹사이트 소스(문구를 "WHAT IS YOUR MOTTO?"로 변경)이며 MobaXterm(WinSCP 등)으로 Linux에 옮긴 뒤 Dockerfile로 이미지를 만든다(예: 이미지 크기 24.8MB). 이미지는 가능하면 강사 이미지가 아니라 **본인이 만든 이미지**를 쓰고, 충분히 테스트 후 Docker Hub에 push(강사: "이참에 Docker를 다시 복습한다고 생각하라"). Dockerfile 명령 의미: `FROM nginx:1.23.1-alpine`(가벼운 alpine 기반 출발점), `RUN mkdir -p ...`/`COPY`(nginx 웹 루트 `/usr/share/nginx/html` 아래에 폴더를 만들고 파일 복사), `EXPOSE 80`/`CMD ["nginx","-g","daemon off;"]`(80번 포트, nginx를 포그라운드로 실행).
- **dry-run YAML 습관(강사 강조)**: `--dry-run=client -o yaml > 파일`은 만들지 않고 정의만 YAML로 뽑는 것이며, 생성된 YAML에는 기본 스펙만 있고 `creationTimestamp`·리소스 설정은 쓰지 않으며 `restartPolicy`는 기본값(Always)으로 두고 `status`는 운영 중 자동으로 채워지므로 "사용자가 원하는 데이터만 남기면 된다". 수정 후 `kubectl apply -f`로 적용하거나, 수정이 필요 없으면 `--dry-run` 부분만 뺀 명령으로 바로 배포. **프로젝트에서는 이렇게 YAML을 항상 확보해 문서화 작업에 포함하고, 한 번에 바로 돌리지 말고 필요하면 YAML을 수정해서 돌려라.** (슬라이드의 이미지명 `dbgurum/mymotto:1.0`은 강사 계정이며, `본인ID/mymotto:1.0` 자리에는 자신의 레지스트리 ID를 넣는다.)
- Deployment `--replicas=3`: "동시에 Pod 3개를 돌리겠다"는 뜻(가장 중요한 옵션). 결과 `3/3`(원하는 수/준비된 수)이며 Pod 3개가 k8s-node1·node2·node3에 하나씩 분산(강사: "착하게 하나씩 나눠 가졌다")되고 각자 Pod IP를 받는다. `kubectl expose deployment`로 Service를 붙이면 하나의 Service에 Pod 3개가 연결된다. 단일 Pod는 `run`, Deployment는 `create deployment` 명령을 사용.
- 부하 분산: 외부 트래픽이 들어오면 지정된 규칙 없이 **랜덤**하게 분산되어 로드 밸런싱된다(다른 브라우저에서 다시 접속해도 같은/다른 Pod로 연결될 수 있음). 강사: 정확한 라운드 로빈 분산을 원하면 다른 방식으로 접근해야 하며 이번에는 NodePort 방식.
- kubeshark(`ks tap -n default "(calico*|mymotto*)"`): 네트워크 트래픽·API 트래픽까지 모니터링하는 Kubernetes용 트래픽 분석 도구. default 네임스페이스에서 이름이 `calico*` 또는 `mymotto*`로 시작하는 Pod를 대상으로 감시. 기본 설정에서는 8899 포트로 **내부에서만** 사용 가능하므로 마스터 노드 Linux 화면에서 Firefox로 `localhost:8899`에 접속, Service Map(Edges: Bandwidth, Nodes: Pod)에서 mymotto-deploy Pod 3개를 확인. NodePort 주소로 계속 접속하거나 F5를 반복하면 트래픽 숫자가 실시간 반영되어 몰린 Pod 쪽 선이 굵어진다.

---

## Step 10. Label / Annotation 활용

### [목적]
Label로 Pod를 분류하고, Service selector가 Label 기준으로 Pod를 연결하는 방식을 이해한다.

### [이론 설명]
- **Label**: 복잡하고 다양한 Pod를 효율적인 집합으로 다루기 위한 방법. key-value 기반의 속성 tag이며 하나의 객체에 하나 이상 설정 가능(앞쪽이 key, 뒤쪽이 value). 용도는 **객체를 식별하고 그룹화**(Pod YAML `metadata.labels`에 `app: run-node`, `job: front` 등). Pod 전용이 아니라 Node·Service·Deployment 등 매우 많은 오브젝트가 Label을 쓴다. Label 검색 조건에 따라 특정 Label을 가진 Pod만 선택할 수 있고, Label을 선택해 특정 리소스만 배포·업데이트하거나, Label로 선택된 리소스만 Service에 연결하거나, 특정 Label로 선택된 리소스에만 네트워크 접근 권한을 부여하는 작업도 가능.
  - 그룹화: 서로 다른 Pod 3개에 같은 Label을 붙일 수 있고(Deployment로 만들면 기본적으로 Pod의 Label이 같아짐) Service의 selector에 그 Label을 지정하면 그 Label의 Pod들을 묶어 트래픽을 보내 주므로 부하 분산이 자연스럽게 이루어진다. 식별: Label을 두 가지 이상 걸면 검색 조건이 여러 개가 되어 식별력을 높일 수 있다.
  - **Label = 식별표, selector = 그 식별표로 고르는 검색 조건.** Service는 Pod 이름이 아니라 Label을 보고 연결하므로 Pod가 새로 생기거나 IP가 바뀌어도 Label만 같으면 자동 연결된다.
- **Annotation**: Label과 달리 추가적인 메타정보를 저장하는 목적. API를 통해 추가 데이터를 저장하는 방법으로, 설정 정보 전달 및 도구에 대한 정보 제공에 쓰이며 Label과 일부 기능은 동일. 사용 예(슬라이드): 객체에 대한 업데이트 사유 추적, 특정 스케줄링 정책 전달, 특정 아이콘의 URL 제공(내부에서 쓰는 아이콘의 정확한 주소를 알려 줘야 할 때 `examples.com/icon-url: "https://example.com/icon.png"`처럼 URL 값을 넣어 기능적으로 활용). Annotation도 식별·그룹화에 쓸 수는 있지만 보통 그렇게 쓰지 않고 부가 정보용이다 — **고르고 묶을 때는 Label, 설명·부가 설정 정보는 Annotation, selector 조회·연결에 쓰이는 것은 Label**(기존 "selector로 선택 불가" 표현을 슬라이드 설명에 맞춰 정정: 일반적으로 selector에는 Label을 사용).
- Service는 selector가 일치하는 Label을 가진 Pod만 Endpoint로 연결. 여러 Label을 selector에 쓰면 AND 조건(두 조건을 모두 만족하는 Pod만 선택).

### [사용한 CLI]
```bash
# Label 지정하여 Pod 생성
kubectl run mynginx1 --image=nginx:1.25.3-alpine --labels=key=value
kubectl run mynginx2 --image=nginx:1.25.3-alpine --labels="key1=value1,key2=value2"
kubectl run mynginx3 --image=nginx:1.25.3-alpine --labels=key1=value1,key2=value2,key3=value3

# Label 확인
kubectl get po --show-labels | grep mynginx

# Label로 필터링
kubectl get po --selector=key=value        # key=value Label을 가진 Pod
kubectl get po --selector=key              # key를 가진 Pod
kubectl get po --selector=key1             # key1이 있는 mynginx2, mynginx3
kubectl get po -l key=value                # -l == --selector

# YAML로 Label 확인
kubectl run mynginx2 --image=nginx:1.25.3-alpine --labels="key1=value1,key2=value2" \
      --dry-run=client -o yaml > mynginx2.yaml
vi mynginx2.yaml
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    key1: value1
    key2: value2
  name: mynginx2
spec:
  containers:
  - image: nginx:1.25.3-alpine
    name: mynginx2
    resources: {}
  dnsPolicy: ClusterFirst
  restartPolicy: Always
status: {}
```
```yaml
# Annotation 예시
metadata:
  annotations:
    examples.com/icon-url: "https://example.com/icon.png"
```

LAB1: 네임스페이스 + Pod 3개 + Service (label-pod.yaml)
```bash
kubectl create namespace infra-team-ns1
kubectl get ns
kubectl run label-pod-a --image=dbgurum/k8s-lab:initial \
      --namespace=infra-team-ns1 --labels=type=infra1 \
      --dry-run=client -o yaml > label-pod.yaml
vi label-pod.yaml          # Pod a, b, c + Service(infra-svc)를 '---'로 구분하여 한 파일에 작성
                           # Pod labels: type=infra (a/b/c), Service selector: type=infra, port 7777
kubectl apply -f label-pod.yaml
kubectl get po,svc -o wide -n infra-team-ns1     # -n: 네임스페이스 지정
kubectl -n infra-team-ns1 describe svc infra-svc  # Selector type=infra, Endpoints Pod IP 3개:7777
kubectl get pods --show-labels -n infra-team-ns1
kubectl get pods --selector='type' -n infra-team-ns1
```

LAB2: Pod 6개 + Service 3개 (label-pod2.yaml)
- Pod: pod-label-01~06, Label `job`(web/db/srv) × `type`(infra/dev) 조합 (01: web,infra / 02: db,infra / 03: srv,infra / 04: web,dev / 05: db,dev / 06: srv,dev)
- Service: front-web-svc(selector `job: web`, port 8081), infra-svc(selector `type: infra`, port 8082), infra-web-svc(selector `job: web` AND `type: infra`, port 8083)
```yaml
# Pod 형식 (01~06 반복, name/labels만 다름)
apiVersion: v1
kind: Pod
metadata:
  name: pod-label-01
  labels:
    job: web
    type: infra
spec:
  containers:
  - name: container01
    ...
```
```yaml
# infra-web-svc 예 (AND 조건)
kind: Service
metadata:
  name: infra-web-svc
spec:
  selector:
    job: web
    type: infra
  ports:
  - port: 8083
```
```bash
vi label-pod2.yaml
kubectl apply -f label-pod2.yaml
kubectl get po -o wide --show-labels | grep pod-label
kubectl apply -f label-pod2-svc.yaml
kubectl get svc -o wide
kubectl describe svc front-web-svc     # Endpoints 2개 (pod-label-01, 04)
kubectl describe svc infra-svc         # Endpoints 3개 (01, 02, 03)
kubectl describe svc infra-web-svc     # Endpoints 1개 (01)
```

### [확인 방법/주의점]
- `kubectl apply` 시 이미 존재하는 동일 정의는 `unchanged`(apply는 변경 사항이 없으면 그대로 두고 바뀐 것만 업데이트).
- 네임스페이스를 지정하지 않으면 default만 조회됨 → `-n <ns>`(명령 앞에 써도 뒤에 써도 됨).
- `--labels` 옵션: 옵션과 값 사이를 띄우거나 붙여도 무방, 여러 개는 쉼표로 이어 쓰며 큰따옴표로 묶어도 안 묶어도 된다(영상에서 3개짜리는 따옴표 없이 생성). `--selector=key`는 값과 무관하게 key가 있는 Pod, `--selector=key1`은 mynginx2·mynginx3, `--selector=key=value`와 `-l key=value`는 mynginx1만 조회. STATUS ContainerCreating·READY 0/1은 준비 중이라는 뜻이며 잠시 후 Running 1/1.
- 강사 강조: **YAML(선언형)과 명령형은 항상 겸해서 공부**(명령형으로 빠르게 만들고, 선언형으로 파일에 남길 수 있어야 함). `--dry-run=client -o yaml` 결과에서는 `metadata.labels`에 Label이 그대로 들어 있다.
- **YAML 한 파일에 여러 리소스는 구분선 `---`(하이픈 3개)로 구분**(강사: 2개도 4개도 안 됨). 슬라이드 80쪽 YAML 본문은 Label 값이 `type: infra1`로, 뒤의 실행 결과(SELECTOR)는 `type=infra`로 표기가 다르나 슬라이드 표기 차이일 뿐 — 핵심은 Pod의 labels 값과 Service의 selector 값이 **정확히 같아야** 연결된다는 것(강사: "Pod a, b, c 모두 같은 Label을 잡고 service의 selector가 그 Label에 연결되어 있어 자동 연결").
- LAB1 시나리오: 애플리케이션을 그룹 단위로 네임스페이스(`infra-team-ns1`)에 나눠 배포, Pod a·b·c가 하나의 Service에 묶이는 구조(이번에는 a,b,c만 생성). Pod 3개에 같은 Label을 붙이고 selector에 같은 Label을 지정하면 3개 모두 선택되고, 트래픽이 들어오면 Service가 기록한 Pod 주소 3개(Endpoint) 중 하나로 랜덤하게 전달. `describe svc`의 Selector `type=infra`, Endpoints에 Pod IP 3개(:7777)가 나오며 이는 get 결과의 label-pod-a/b/c IP와 일치 — LAB1 결론: Label 지정으로 ① 그룹화 ② 부하 분산(Service Endpoint 3개) ③ 기본 조회(`--show-labels`, `--selector`, `-l`)를 얻는다.
- LAB2: 운영팀·개발팀이 각각 만든 웹/DB 서버 Pod의 역할을 job·type 두 Label로 구별. Service 3종 — front-web-svc(frontend 웹 개발자용, selector `job: web`, 8081), infra-svc(운영 팀, `type: infra`, 8082), infra-web-svc(infra팀의 웹 개발자, `job: web` AND `type: infra`, 8083). 결과 Endpoints: front-web-svc 2개(pod-label-01, 04), infra-svc 3개(01, 02, 03), infra-web-svc 1개(01) — selector 조건이 둘이면 둘 다 만족하는 Pod만 선택. 이 LAB의 Pod·Service는 네임스페이스 없이 default에 생성되며(describe의 Namespace: default), 같은 `get svc` 목록의 kubernetes·myservice는 실습과 무관한 기존 service. 슬라이드(86쪽) IP는 다른 실행 값이나 2/3/1개 구조는 동일. 강사 결론: Label은 식별력이 매우 좋고 다양한 검색 조건으로 활용 가능해 리소스를 선택적으로 지정할 때 매우 유용.
- Service selector에 Label이 여러 개이면 모두 만족하는 Pod만 Endpoints에 포함.
- YAML 한 파일에 여러 object를 넣으려면 `---`로 구분.

---

## Step 11. Node Schedule 활용 (nodeSelector / nodeName / taint / toleration)

### [목적]
Pod를 특정 Node에 배치하거나 배치를 막고 허용하는 방법을 익힌다.

### [이론 설명]
- **kube-scheduler의 노드 선택**: Kubernetes 배포가 커지고 다양해질수록 스케줄링(노드 할당) 관리가 중요. 스케줄러는 etcd에 기록된 노드 상태·우선순위·리소스 사용량 정보를 API 서버를 통해 받아 **필터링(Filtering)과 점수(Scoring)**로 노드에 점수를 매겨 순서를 만들고, Pod Spec을 요청하면 **점수가 가장 높은 노드에 우선 배치**한다. 스케줄링 = "새 Pod를 어느 노드에서 실행할지 정하는 일"이며 기본은 kube-scheduler가 자동 결정하지만, GPU가 있는 노드처럼 특정 노드에서만 돌려야 하는 앱은 사용자가 조건을 지정해 유도할 수 있다.
- **사용자가 개입하는 방법 5가지(슬라이드)**: ① `nodeSelector` — kube-scheduler에게 지정 Node 배치 요청("몇 번 노드에 넣어 주세요", 결국 스케줄러 동작으로 배치) ② `nodeName` — 해당 Node의 kubelet에 직접 요청(정적 기법, 스케줄러를 거치지 않음) ③ `Affinity` — 다양한 조건(친밀도·선호도, Affinity/Anti-Affinity)으로 Node 배치 요청 ④ `Tolerations` — Taint가 설정된 Node에 강제 허용 요청(Taint(자물쇠)를 열고 들어가는 열쇠) ⑤ `schedulerName` — 멀티 클러스터 환경이거나 사용자 정의 스케줄러를 쓸 때(기본은 kube-scheduler). 강사: **nodeName은 이미 Deprecated로 선언되었고 nodeSelector도 폐기 대상으로 올라갔다**(사용은 가능하나 언젠가 조건을 다양·세밀하게 넣을 수 있는 Affinity로 통합될 것). 이번 클립에서는 nodeSelector, nodeName, Tolerations(Taint)만 다룬다.
- **nodeSelector**: Node Label과 일치하는 Node에만 배치. 일치하는 Node가 없으면 Pod는 해당 노드가 생길 때까지 Pending. YAML에서 spec 바로 아래(containers와 같은 레벨)에 둔다.
- **nodeName**: 스케줄러(kube-scheduler)를 거치지 않고 지정 노드의 kubelet에게 직접 전달해 실행(강사: Deprecated 확정, 사용은 가능하나 다른 방법 권장).
- **Taint(Node에 설정, 자물쇠) / Toleration(Pod에 설정, 열쇠)**: Taint가 있는 Node에는 해당 Toleration이 있는 Pod만 배치. **Master Node에는 기본적으로 Taint 설정(`node-role.kubernetes.io/control-plane:NoSchedule`)이 되어 있어 Application Pod를 할당하지 않는다**(지금까지 Pod가 node1~3에만 배치된 이유). 허용하려면 Tolerations 필요 — Toleration이 있는 Pod는 Taint가 걸린 마스터에도 배치될 수 있다.
- **Taint 구성요소 / Effect 3종**: Effect — `NoSchedule`(taint를 toleration하지 않는 pod는 schedule 안 됨, "스케줄을 하지 마라"), `PreferNoSchedule`(toleration하지 않더라도 scheduling될 수 있는 다른 노드가 없을 때는 이 노드에 scheduling 가능 — 예: 1,2,3번 노드가 꽉 찼을 때 마스터에도 배치), `NoExecute`(toleration이 없는 Pod들은 전부 삭제됨, 반드시 열쇠가 있는 것만 허용). Key(사용자가 지정하는 기준 대상 키), Value(그 키에 대한 값), Operator(키와 값에 대한 연산자, 예: Equal). **Taint를 건다고 이미 실행 중인 Pod를 건드리지는 않는다** — 기존 Pod는 유지하되 앞으로 Pod를 받지 않겠다는 뜻("열쇠로 잠갔다").
- 자료의 데모(직접 실습 아닌 예시 슬라이드): 워커 4대(worker-0~3)에 Node Label(`disk=ssd/hdd`, `compute=gpu1/gpu2/cpu1/cpu2`: worker-0·1=ssd, worker-2·3=hdd, worker-0=gpu1, worker-1=gpu2, worker-2=cpu1, worker-3=cpu2)을 붙이고 Deployment `nodeSelector`를 조합. `disk: ssd`만 지정하면 ssd 노드(worker-0, 1)가 후보(replicas 2면 각각 하나씩, 1개면 첫 번째 노드 우선), `disk: ssd` + `compute: gpu1`은 **두 조건 모두 만족(AND)**하는 worker-0에만 배치 가능(replicas가 2여도 모두 worker-0). 노드별 특성을 잘 기록해 두면 멀티 클러스터 대규모 환경에서 애플리케이션 배치가 훨씬 좋아진다(슬라이드 캡처는 replicas: 1로 표시).

### [사용한 CLI]
```bash
mkdir schedule && cd $_

# Taint 확인 / Node Label 확인
kubectl describe no | grep -i taint
# Taints: node-role.kubernetes.io/control-plane:NoSchedule
kubectl get no --show-labels
kubectl describe nodes k8s-node1
```

LAB1: nodeSelector (hostname)
```bash
kubectl run sch-test1 --image=nginx:1.25.3 --dry-run=client -o yaml > sch-test1.yaml
vi sch-test1.yaml
kubectl apply -f sch-test1.yaml
kubectl get po -o wide | grep sch
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sch-test1
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s-node1
  containers:
  - image: nginx:1.25.3
    name: sch-test1
```

LAB2: 사용자 Label 부여 후 nodeSelector
```bash
kubectl label nodes k8s-node2 cputype=gpu
kubectl get no k8s-node2 --show-labels
cp sch-test1.yaml sch-test2.yaml
vi sch-test2.yaml            # nodeSelector: cputype: gpu, name: sch-test2
kubectl apply -f sch-test2.yaml

# 값 변경 시 --overwrite 필요
kubectl label nodes k8s-node2 cputype=gpu2
# error: 'cputype' already has a value (gpu), and --overwrite is false
kubectl label nodes k8s-node2 cputype=gpu2 --overwrite
# Label 삭제: key 뒤에 '-'
kubectl label nodes k8s-node2 cputype-
```
```yaml
spec:
  nodeSelector:
    cputype: gpu
```

Node Role(ROLES 컬럼) 표시용 Label
```bash
kubectl label node k8s-node1 node-role.kubernetes.io/worker=worker
kubectl label node k8s-node2 node-role.kubernetes.io/worker=worker
kubectl label node k8s-node3 node-role.kubernetes.io/worker=worker
kubectl get no                                           # ROLES 에 worker 표시
kubectl label node k8s-node3 node-role.kubernetes.io/worker-   # 제거
```

LAB3: nodeName
```bash
cp sch-test1.yaml sch-test3.yaml
vi sch-test3.yaml
kubectl apply -f sch-test3.yaml
kubectl get po -o wide | grep sch-test3
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sch-test3
spec:
  nodeName: k8s-node3
  containers:
  - image: nginx:1.25.3
    name: sch-test3
```

LAB4: Taint 설정/해제
```bash
kubectl taint node k8s-node1 kubernetes.io/k8s-node1:NoSchedule     # Taint 설정
kubectl describe no | grep -i taint
kubectl apply -f sch-test1.yaml
kubectl get po -o wide | grep sch-test1                             # Pending
kubectl taint node k8s-node1 kubernetes.io/k8s-node1:NoSchedule-    # Taint 해제 ('-')
kubectl get po -o wide | grep sch-test1                             # Running
```

LAB5: 레이블 + Taint + Toleration
```bash
kubectl label nodes k8s-node1 cputype=gpu
kubectl get no k8s-node1 --show-labels
kubectl taint node k8s-node1 cputype=gpu:NoSchedule
kubectl describe no | grep -i taint
cp sch-test1.yaml sch-test4.yaml
vi sch-test4.yaml
kubectl apply -f sch-test4.yaml
kubectl get po -o wide | grep sch-test4        # k8s-node1에서 Running
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sch-test4
spec:
  nodeSelector:
    cputype: gpu
  containers:
  - image: nginx:1.25.3
    name: sch-test4
  tolerations:
  - key: "cputype"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
```

### [확인 방법/주의점]
- nodeSelector 조건에 맞는 Node가 없으면 Pod는 Pending. Taint가 걸린 Node에 toleration이 없어도 Pending. 이 Pending은 "아직 만들지 못하고 준비만 하는 상태"로 Taint를 해제할 때까지 계속 유지되며, Taint 해제(`...:NoSchedule-`)하면 Pending이 풀리고 ContainerCreating → Running.
- **nodeSelector 작성 주의(강사)**: `describe`/슬라이드에서 라벨을 복사하면 `key=value` 형태이지만 YAML `nodeSelector`에는 반드시 `key: value`로 바꿔 써야 한다. `nodeSelector`의 S는 대문자. 노드마다 모두 같은 라벨(OS=linux, 아키텍처=amd64 등)은 식별력이 없고 `kubernetes.io/hostname` 라벨만 노드마다 다르므로, 라벨을 추가하기 전에는 호스트네임 라벨만 특정 노드 선택에 쓸 수 있다(마스터는 Taint가 걸려 있어 제외). 호스트네임은 유일하지만 노드가 30·50대로 늘면 "이 노드가 어떤 노드인지" 식별이 어려우므로 노드 특성(cputype, disk SSD/HDD, 네트워크 형태, 스토리지 접근법, 코어 개수 등)을 직접 라벨로 기록한다(LAB2는 k8s-node2가 GPU 칩셋을 가진 것으로 가정해 `cputype=gpu`).
- **Taint 운영 경고(강사)**: 테스트하다 노드에 걸어 놓은 Taint를 잊고 "왜 한쪽 노드에는 안 되지?" 하며 그대로 운영하는 경우가 종종 있다 — **Taint는 반드시 문서화·기록**해 어디에 무엇이 걸려 있는지 알고 쓰며, 해제 여부는 `kubectl describe no | grep -i taint`로 확인.
- 라벨 수정 오류 예: `error: 'cputype' already has a value (gpu), and --overwrite is false` → 오류 안내대로 `--overwrite` 추가. 삭제는 키 뒤에 마이너스(값은 쓰지 않음, `node/k8s-node2 unlabeled`). Node Role 라벨 팁: `node-role.kubernetes.io/worker=worker`로 ROLES 열에 worker 표시(`worker`, `worker1/2/3`처럼 이름은 자유, 해제는 `...worker-`; 영상에서는 시연 후 node3에 다시 붙여 원복).
- LAB4 흐름: ① `describe no | grep -i taint`에서는 컨트롤 플레인만 NoSchedule ② node1에 호스트네임 기반 키로 Taint(`kubernetes.io/k8s-node1:NoSchedule`) ③ 기존 sch-test1 Pod는 계속 돌고 있음(Taint는 기존 Pod에 영향 없음) → 삭제 후 같은 YAML을 다시 apply하면 nodeSelector로 node1을 원하지만 막혀 `Pending` ④ Taint 해제 후 node1에 배치. LAB5: 호스트네임이 아니라 **라벨 키 기반 Taint**(`cputype=gpu:NoSchedule`)를 걸고, `sch-test4.yaml`의 `nodeSelector: cputype: gpu` + `tolerations`(key `cputype`, operator `Equal`, value `gpu`, effect `NoSchedule`)로 Taint를 통과해 k8s-node1에 정상 배치(강사 해석: "cputype이 Equal gpu이고 NoSchedule이 걸린 곳을 허용해 주세요"). 강사는 호스트네임보다 **라벨 기법을 더 선호**해 권장. 정리: 자동 배치를 수동 지정하는 방법(nodeSelector, nodeName), 노드를 잠그는 방법(Taint), 잠긴 노드를 열고 들어가는 방법(Toleration).
- Label 값 변경은 `--overwrite`, 삭제는 `key-`.
- nodeSelector는 "배치할 Node 지정", toleration은 "Taint된 Node 배치 허용"일 뿐 해당 Node로 보내는 것은 아님 → 둘을 조합.
- Pending 시 `kubectl describe pod`의 Events로 원인 확인.

---

## Step 12. Probe: Liveness / Readiness / Startup

### [목적]
kubelet이 컨테이너 상태를 점검하는 Probe의 종류와 설정, 동작(재시작/트래픽 제외)을 실습으로 확인한다.

### [이론 설명]
- **Probe(진단)란**: Pod 안 컨테이너 애플리케이션의 현재 상태를 점검하는 기능. container에서 **kubelet에 의해 주기적으로 수행**되는 진단이며, 진단을 위해 kubelet은 container에 구현된 Handler를 호출한다. **Probe를 전혀 설정하지 않으면 Kubernetes는 기본적으로 "정상(Success)"으로 보고 넘어간다**(Probe를 활성화해야 kubelet의 진단을 받음). Pod 스펙(YAML) 안에 원하는 진단 기법(liveness/readiness/startup)을 쓰고 그 안에 핸들러를 넣는 방식이며 **진단 종류가 달라도 핸들러는 동일**. 결과는 이벤트로 기록된다. 노드의 kubelet은 "의사" 역할로 실행 중인 Pod를 계속 체크하고 문제가 있으면 재시작하거나 Pod를 버리고 새로 만드는 self-healing(auto-healing)을 수행.
- **Probe Handler 3종**:
  - ExecAction: 컨테이너 내에서 지정된 명령어 실행, 명령어 상태 코드가 0으로 종료되면 성공(실패는 1 등). 리눅스 명령이나 직접 만든 셸 스크립트로 헬스체크 가능.
  - TCPSocketAction: 지정된 포트에서 컨테이너 IP에 TCP 검사 수행, 포트가 활성화(열림)되어 있으면 성공.
  - HTTPGetAction: 지정된 포트·경로에서 컨테이너 IP에 HTTP GET 요청, 응답 상태 코드가 200~399이면 성공, 나머지(400 이상)는 실패.
  - 애플리케이션이 웹인지, TCP 트래픽인지, 셸 명령으로 처리하는지에 따라 핸들러를 고른다.
- **Probe 결과**: Success(진단 통과) / Failure(진단 실패) / Unknown(진단 자체가 실패).
- **Probe 종류**(kubelet이 Pod에 Check를 보내고 Response를 받음; 슬라이드: Probe는 컨테이너 상태를 지속 모니터링하고 문제 발생 시 자동 조치):
  - `livenessProbe`: container가 **동작 중인지**. 응답하지 않거나 오류 상태에 갇힌 상황을 감지·복구. 실패 시 kubelet이 해당 컨테이너를 Kill하고 재시작 정책(restartPolicy, 기본 Always)에 따라 다시 시작. 설정하지 않으면 기본값 Success.
  - `readinessProbe`: container가 **요청을 처리할 준비가 되었는지**(들어오는 트래픽을 안전하게 처리할 수 있는지). 실패 시 엔드포인트 컨트롤러가 이 Pod와 연결된 Service의 엔드포인트에서 Pod IP를 제거해 트래픽을 받지 않게 함(재시작하지 않음). 초기 지연 이전 기본 상태는 Failure, 설정하지 않으면 기본값 Success.
  - `startupProbe`: container 내 **애플리케이션이 시작되었는지**. **성공할 때까지 다른 프로브는 활성화되지 않으며**, 실패하면 kubelet이 컨테이너를 죽이고 재시작 정책에 따라 재시작. 설정하지 않으면 Success(느린 시작 앱용).
  - 세 프로브는 섞어서 써도 하나만 써도 되며, 강사가 제시한 **가장 이상적인 설계는 2단계 진단**: 먼저 startupProbe로 애플리케이션 프로세스가 올라왔는지 확인한 뒤 liveness/readiness로 Pod를 진단.
  - 라이브니스는 주기적 헬스체크로 문제 시 재시작을 유도해 서비스가 지속되게 하고, 리드니스는 트래픽 받을 준비가 안 된 Pod를 Service 대상에서 빼서 요청이 가지 않게 한다.
- **실행 시점(슬라이드 103)**: Init Containers(있으면 먼저, 없으면 넘어감) → Main(app) containers → **PostStart Hook**(컨테이너 생성 직후 호출, 앱이 본격 실행되기 전 필요한 설정·준비 작업) → startup probe(애플리케이션 준비 여부) → liveness probe / readiness probe(각자 역할로 진단, 그림에 `initialDelaySeconds` 표시) → … → **PreStop Hook**(컨테이너 종료 전 호출, 진행 중인 프로세스를 마무리하는 Graceful shutdown — DB를 정상적으로 닫거나 트랜잭션을 끝내야 하는 앱에서 사용).
- 옵션: `initialDelaySeconds`(컨테이너 시작 후 첫 probe까지 대기), `periodSeconds`(초기 지연 후 반복 주기). describe에서 `delay=5s timeout=1s period=5s #success=1 #failure=3`으로 표시되며 `timeout`·`#success`·`#failure`는 YAML에 쓰지 않은 기본값이 표시된 것, `#failure=3`은 **연속 3번 실패해야 실패로 판단**.
- 예시 YAML 3종은 실습이 아닌 설명용(readinessProbe에 3가지 핸들러): httpGet은 `path: /testpath`(준비 상태 확인 endpoint)·`port: 8080`, tcpSocket은 포트 8080에서 TCP 연결 수락 여부, exec는 `command`에 컨테이너 내부 실행 명령(리눅스 명령 또는 셸 스크립트, 준비 실패 시 0이 아닌 종료 코드·성공 시 0 반환). `initialDelaySeconds: 15`(컨테이너 시작 15초 후부터 probe 시작), `periodSeconds: 10`(이후 10초마다 반복). 같은 핸들러를 livenessProbe·startupProbe에도 쓸 수 있다.

### [사용한 CLI]
```bash
mkdir probe && cd $_
kubectl run myweb --image=nginx
kubectl describe po myweb
# Events: Scheduled -> Pulling -> Pulled -> Created -> Started
```

readiness probe 예시 3종(자료 예시 YAML)
```yaml
# 1) httpGet
apiVersion: v1
kind: Pod
metadata:
  name: read-http-pod
spec:
  containers:
  - name: http-container
    image: nginx
    ports:
    - containerPort: 8080
    readinessProbe:
      httpGet:
        path: /testpath
        port: 8080
      initialDelaySeconds: 15
      periodSeconds: 10
```
```yaml
# 2) tcpSocket
apiVersion: v1
kind: Pod
metadata:
  name: read-tcp-pod
spec:
  containers:
  - name: tcp-container
    image: testimage
    ports:
    - containerPort: 8080
    readinessProbe:
      tcpSocket:
        port: 8080
      initialDelaySeconds: 15
      periodSeconds: 10
```
```yaml
# 3) exec
apiVersion: v1
kind: Pod
metadata:
  name: read-exec-pod
spec:
  containers:
  - name: execp-container
    image: testimage
    ports:
    - containerPort: 80
    readinessProbe:
      exec:
        command:
        - /bin/sh
        - -c
        - test-shell.sh
      initialDelaySeconds: 15
      periodSeconds: 10
```

실습: exec livenessProbe (liveness-exec.yaml, 공식 문서 예제)
```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    test: liveness
  name: liveness-exec-pod
spec:
  containers:
  - name: liveness-container
    image: registry.k8s.io/busybox
    args:
    - /bin/sh
    - -c
    - touch /tmp/healthy; sleep 30; rm -f /tmp/healthy; sleep 600
    livenessProbe:
      exec:
        command:
        - cat
        - /tmp/healthy
      initialDelaySeconds: 5
      periodSeconds: 5
```
```bash
vi liveness-exec.yaml
kubectl apply -f liveness-exec.yaml
kubectl describe po liveness-exec-pod
# Liveness: exec [cat /tmp/healthy] delay=5s timeout=1s period=5s #success=1 #failure=3
kubectl get po -o wide | grep live
```

### [확인 방법/주의점]
- 30초 후 `/tmp/healthy`가 삭제되어 `cat` 실패 → Events에 `Warning Unhealthy: Liveness probe failed: cat: can't open '/tmp/healthy'` 및 `Normal Killing`(failed liveness probe, will be restarted) → RESTARTS 증가.
- 반복되면 `Warning BackOff ... Back-off restarting failed container`, STATUS `CrashLoopBackOff`.
- readiness는 실패해도 컨테이너를 재시작하지 않고 Service 트래픽에서만 제외.
- 이 실습은 공식 문서(configure-liveness-readiness-startup-probes)의 예제이며, 취지는 장기간 도는 Pod가 다양한 이벤트(예: MSA에서 다른 서비스와의 상호작용)로 죽을 수 있을 때 kubelet에 의한 재시작을 livenessProbe로 진단하는 것. 컨테이너는 시작하자마자 `/tmp/healthy`를 만들고(touch) 30초 뒤 삭제(`rm -f`)한 뒤 600초 sleep — `cat /tmp/healthy`는 처음 30초는 종료 코드 0(성공), 이후 실패. 이 단계는 "시간 싸움"이라 `describe`로 Events를 관찰하는 것이 핵심(강사). 영상에서는 파일명을 `liveness-pod.yaml`로 입력(슬라이드는 `liveness-exec.yaml`).
- 재시작 관찰: 재시작될 때마다 이미지를 다시 pull하고 컨테이너를 새로 만들어 시작하는 과정(Pulled/Created/Started)이 Events에 반복되고 Restart Count가 계속 증가(예: `Running 1 (35s ago)`). 스크립트가 다시 실행되어 `/tmp/healthy`가 새로 만들어졌다가 30초 뒤 다시 지워져 같은 일이 반복. 강사: "무한 반복하지는 않는다" — 계속 실패하면 재시작 간격이 늘어나며(Back-off) 약 15분 뒤 `CrashLoopBackOff`(RESTARTS 7)와 `Warning BackOff ... Back-off restarting failed container liveness-container in pod liveness-exec-pod`가 나타난다.
- **강사 경고**: 이 실습은 일부러 만든 예이지만 **실제로 이런 재시작이 계속 반복된다면 애플리케이션 Pod 스펙 자체(코드)에 문제가 있다는 신호**다. 서비스 가용성을 유지하기 어려우므로 프로브 진단 결과와 Events를 살펴 소스코드의 문제점을 진단해야 한다. Probe를 넣지 않은 Pod의 Events에는 Scheduled/Pulling/Pulled/Created/Started만 보이며(`kubectl describe po myweb`), Probe를 넣으면 성공·실패가 Events(Unhealthy, Killing, BackOff)에 남는다. 5장 정리: Pod 오브젝트(Kubernetes의 가장 중추적인 오브젝트)의 운영·관리, 생성 방법(선언형·명령형), 부가 기능.
- `testimage`, `test-shell.sh`는 자료 예시용 가상 이름(실제 동작 실습 대상 아님).

---

## Step 13. Service object가 필요한 이유와 동작 원리

### [목적]
Pod IP가 바뀌는 문제를 Service로 해결하는 원리(selector/Endpoints/DNS/kube-proxy iptables)와 세션 고정을 이해한다.

### [이론 설명]
- **챕터 06 구성(7개 클립)**: ① Service object가 필요한 이유(네트워크 추상화 개념·동작 원리) ② [실습] ClusterIP(클러스터 내부에서만 접근 가능한 기본 타입) ③ [실습] NodePort(노드 포트로 외부 접근) ④ LoadBalancer(로드 밸런서는 물리 장비를 뜻하며 클라우드(AWS·Google·Azure 등 CSP)는 LoadBalancer 타입 지원) ⑤ [실습] VM 기반 LoadBalancer 사용을 위한 MetalLB 구성(VM/온프레미스에는 로드 밸런서가 없어 MetalLB(베어메탈 로드 밸런서)를 Pod/Service 형태로 올려 구현) ⑥ [실습] Amazon EKS 기반 LoadBalancer 사용(AWS가 제공하는 기본 로드 밸런서 사용) ⑦ [실습] 외부 노출을 위한 Ingress Service(L7 HTTP/HTTPS 외부 노출). Pod는 기본적으로 Pod IP를 가지고 있어 그 IP로 접근할 수도 있는데 굳이 Service object를 쓰는 이유가 첫 주제.
- **Service란(슬라이드)**: **네트워크 추상화 object**로, 생성된 Pod에 동적으로 접근할 수 있게 하고 애플리케이션을 클러스터 내 네트워크 서비스로 노출. IP 주소 또는 DNS 이름으로 특정 포트에 직접 접근할 수 있도록 Pod를 논리적으로 그룹화. Kubernetes는 Pod에 고유 IP를 할당하고, Service를 만들면 Pod 집합에 단일 DNS 명을 부여해 부하 분산을 수행. ("네트워크 추상화" = 내부적으로 복잡한 네트워크 메커니즘을 Service object 하나로 감싸 쓰게 한 것. Service 타입은 여러 가지이며 **기본값은 클러스터 내부에서만 접근되는 ClusterIP**.) 참고: https://kubernetes.io/ko/docs/concepts/services-networking/service/
- **label/selector**: Pod에 붙인 label(키: 값)과 같은 값을 Service의 selector에 지정하면 같은 label의 Pod들이 하나로 묶이고, 이 Service를 통해 연결된 Pod들에 트래픽이 분산(랜덤이지만 로드밸런싱). Pod에 label을 붙이는 이유는 대부분 Service와 연결하기 위함이며 한 Service에 연결된 Pod는 1개일 수도 여러 개일 수도 있다. pod에 IP가 있듯 Service에도 IP가 있고(Calico가 Pod IP 대역을 할당, endpoint controller가 관리), Service를 만들면 자체 DNS가 등록되어 그 DNS 이름으로 부하 분산이 이루어진다.
- **왜 필요한가(슬라이드)**: Pod에 문제가 생기면 Kubernetes는 그 Pod를 **삭제 후 재생성**하는데 이때 기존 Pod IP와 같은 IP를 받을 확률은 매우 낮다(Pod IP는 앞쪽 번호부터 주는 경향 때문에 가끔 같은 IP를 받을 수도 있으나 기본적으로 바뀐다고 생각). Kubernetes 설계 사상은 **"Pod는 언제든 장애로 Down될 수 있다"**이며, 신규 Pod는 새 IP가 부여되므로 애플리케이션(코드)을 매번 수정해야 하는 불편함을 없애려고 Service를 연결해 쓰도록 설계되었다. 재생성 원인: 노드 문제(장애, drain·cordon 같은 유지보수), Pod 자체 문제, probe(상태 점검) 실패 등으로 kubelet이 재시작·재생성하며 Desired state management(replicas 3 유지)에 따라 다른 노드에 새 Pod 생성. 외부에서 들어오는 요청은 특정 Pod로 직접 가지 않고 대부분 Service를 통과하도록 설계.
- **Service = 단일 진입점 + Proxy**: 클러스터 외부에서 내부 Pod 애플리케이션에 접근하기 위한 단일 진입점 역할을 하고, Proxy(Load Balancer)처럼 연결된 Pod들에 트래픽을 전달. Service object는 연결된 각 Pod로 Client 요청 트래픽을 포워딩해 주는 proxy와 같다. `port`(Service가 클라이언트에게 열어 두는 포트, Service IP:port로 접근) → `targetPort`(트래픽을 최종 전달할 Pod 포트, 보통 containerPort와 같게; containerPort에 `name`을 주면 port 번호 대신 이름으로 targetPort 지정 가능). Endpoints는 selector에 매칭된 Pod의 `IP:targetPort` 목록으로 endpoint controller가 자동 관리(Pod가 바뀌면 목록도 바뀜). 슬라이드 예: Pod(`app: backend`, containerPort 8080)와 Service `clusterip-svc`(selector `app: backend`, port 9000, targetPort 8080).
- **Pod는 가상 장치(veth, calico 인터페이스)가 있지만 Service에는 그런 실체(장치)가 없다**(강사). Service는 추상화된 object일 뿐이며 실제 일은 모든 노드의 kube-proxy와 iptables가 한다.
- **Service DNS**: Service 이름이 `<서비스명>.<네임스페이스>.svc.cluster.local` 형태의 DNS 이름으로 등록(CoreDNS=kube-dns, 10.96.0.10:53, kube-system의 coredns Pod 2개). nslookup 결과의 `in-addr.arpa`는 PTR 레코드(IP→이름 역방향 조회) 조회 시 자동으로 붙는 접미사라 IP가 거꾸로(예 238.160.104.10) 표기된다. Pod는 IP 대신 `app-svc` 같은 이름으로 다른 애플리케이션을 찾을 수 있다. `kubectl -n kube-system describe configmap coredns`는 CoreDNS 기본 구성(ConfigMap) 확인. `dig`(Domain Information Groper)가 들어 있는 테스트용 Pod가 `dnsutils`(공식 예제 YAML).
- **kube-proxy**: Service는 가상 IP와 port를 갖고 생성되며 kube-proxy가 이 가상 IP를 구현하고 port와 함께 관리. DaemonSet으로 마스터 포함 모든 Node(4대)에서 실행되어 API 서버를 감시하다 Service/Endpoint 변화(Pod 삭제·생성·재시작으로 IP가 바뀌는 경우 포함)에 따라 규칙 갱신. 동작 순서(슬라이드): ① Control Plane의 endpoint/service controller가 API server를 통해 etcd에 Service·Endpoint object 저장 ② 각 노드 kube-proxy가 API server를 감시해 iptables 정보 업데이트 ③ Proxy mode(IPVS, iptables)의 NAT 규칙이 `10.104.160.238 → 10.111.10.1/.2/.3`처럼 목적지를 Pod 중 하나로 변경 ④ 앱 연결 요청은 네트워크 플러그인(calico)과 네트워크 장치를 거쳐 Pod로 전달.
  - Mode: **iptables(기본)** — kube-proxy는 iptables를 관리하는 역할만 하고 클라이언트에게서 직접 트래픽을 받지 않으며, 클라이언트의 모든 요청은 iptables(리눅스 커널 레벨 Netfilter)를 거쳐 Pod로 직접 전달. KUBE-SERVICES → KUBE-SVC-xxx → KUBE-SEP-xxx, `statistic mode random probability`로 랜덤 분산(확률 0.333…, 0.5, 조건 없음이 순서대로 적용되어 1/3씩 균등), 마지막 DNAT으로 Pod IP:port 변환. **IPVS(IP Virtual Server)** — Netfilter 기반 Linux Kernel 레벨 Layer4 Load Balancing 모듈, 알고리즘 RR(round-robin)/LC(least connection)/DH(destination hashing)/SH(source hashing)/SED(shortest expected delay). 강사: iptables 모드는 Service/Pod 변경이 많을 때 규칙 업데이트 부하가 있어 현업에서는 IPVS를 더 많이 쓴다(이 실습 클러스터는 기본 iptables). 현재 모드는 `kubectl logs -f -n kube-system kube-proxy-<id>`의 "Using iptables proxy" 로그로 확인.
- **sessionAffinity**: 기본 `None`(무작위 분산). `ClientIP`로 설정하면 클라이언트 IP 기준으로 처음 접속된 Pod에 연결이 저장되어 같은 Client IP는 같은 Pod로 전달(기본 timeout 10800초=3시간, `sessionAffinityConfig.clientIP.timeoutSeconds`로 조정 가능). 강사 화면에는 ClientIP만 적고 timeoutSeconds는 적지 않았어도 기본값 10800이 적용. 값 이름은 "Client IP"(강사가 설명 중 Cluster IP로 잘못 말했다가 정정). 유사 기능으로 Internal/External Traffic Policy가 있으며 뒤에서 다룬다고 언급.
- **부하 분산 방식 주의**: Service의 분산은 round-robin 같은 순서 알고리즘이 아니라 **무작위**임을 기억(강사). 정확한 라운드 로빈이 필요하면 다른 방식 필요.
- Service type(슬라이드): `ClusterIP`(클러스터 내부 가상 IP로 노출) / `NodePort`(고정 포트 30000~32767로 각 Node의 IP에 외부 노출) / `LoadBalancer`(클라우드 공급자(CSP)의 로드 밸런서로 외부 노출) / `ExternalName`(일반적인 selector 연결이 아닌 외부 서비스에 대한 DNS name을 제공해 내부 Pod가 외부의 특정 도메인에 접근하게 하는 리소스) / `Ingress`(Service 유형은 아니지만 클러스터로 들어오는 진입점을 하나 세워 두고 트래픽이 어디로 갈지 규칙으로 설정하는 방식).

### [사용한 CLI]
데모 환경: Deployment 3 Pod
```yaml
# app-deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deploy
spec:
  selector:
    matchLabels:
      app: app-pod
  replicas: 3
  template:
    metadata:
      labels:
        app: app-pod
    spec:
      containers:
      - name: app-test
        image: dbgurum/k8s-lab:v1.0
        ports:
        - containerPort: 8080
```
```bash
mkdir service && cd $_       # ~/LABs/service
vi app-deploy.yaml
kubectl apply -f app-deploy.yaml
kubectl get po -o wide --show-labels | grep app-deploy
curl <Pod IP>:8080              # No defined Path.
curl <Pod IP>:8080/hostname     # Hostname : <Pod 이름>
```

문제 재현: client Pod가 Pod IP를 쓰면 재시작 시 끊김
```yaml
# client-app-pod.yaml : sidecar(curl)가 Pod IP로 호출한 결과를 nginx html로 노출
apiVersion: v1
kind: Pod
metadata:
  name: client-app-pod
  labels:
    run: client-app
spec:
  containers:
  - name: myapp
    image: nginx:1.25.3
    volumeMounts:
    - name: html-app
      mountPath: /usr/share/nginx/html
  - name: sidecar
    image: curlimages/curl:8.5.0
    volumeMounts:
    - name: html-app
      mountPath: /html-log
    args: ["/bin/sh", "-c", "curl 10.109.131.61:8080/hostname > /html-log/index.html; sleep 3600;"]
  volumes:
  - name: html-app
    emptyDir: {}
```
```bash
vi client-app-pod.yaml
kubectl apply -f client-app-pod.yaml
kubectl get po -o wide | grep client
curl <client Pod IP>                          # Hostname : app-deploy-...
kubectl rollout restart deployment app-deploy # Deployment Pod 전체 재생성 -> Pod IP 변경
kubectl get po -o wide | grep app-deploy
curl <client Pod IP>                          # 이전 Pod IP가 사라져 응답 없음
```

Service 생성 (expose)
```bash
kubectl expose deployment app-deploy --name=app-svc --port=9090 --target-port=8080
# Error from server (AlreadyExists) 시: kubectl delete svc app-svc 후 재생성
kubectl get svc | grep app-               # ClusterIP, 9090/TCP
curl <Service IP>:9090/hostname           # 여러 Pod로 분산
kubectl rollout restart deployment app-deploy
curl <Service IP>:9090/hostname           # Pod IP가 바뀌어도 Service IP로 계속 접근 가능
```

Service 구성 확인
```bash
kubectl describe svc app-svc
# Selector: app=app-pod, Type: ClusterIP, Port: 9090/TCP, TargetPort: 8080/TCP, Endpoints: ...:8080 x3, Session Affinity: None
kubectl get endpoints app-svc
```

DNS 확인
```bash
kubectl get pod,svc,ep -n kube-system -l k8s-app=kube-dns -o wide
kubectl run dns-pod-verify --image=busybox --restart=Never --rm -it -- nslookup <Service IP>
# name = app-svc.default.svc.cluster.local
kubectl -n kube-system describe configmap coredns

# dnsutils Pod (nslookup/dig)
kubectl apply -f https://k8s.io/examples/admin/dns/dnsutils.yaml
kubectl get po -o wide | grep -i dns
kubectl exec -it dnsutils -- nslookup app-svc.default.svc.cluster.local
kubectl exec -it dnsutils -- dig app-svc.default.svc.cluster.local
# ANSWER SECTION: app-svc.default.svc.cluster.local. 30 IN A <Service IP>
```

kube-proxy / iptables 확인
```bash
kubectl logs -f -n kube-system kube-proxy-hl5sl      # "Using iptables proxy"
sudo iptables -t nat --list KUBE-SERVICES
sudo iptables -t nat --list KUBE-SVC-OUNDI6VOGW5OUD2K     # Service 체인: KUBE-SEP 3개 (probability 0.333 / 0.5 / 나머지)
sudo iptables -t nat --list KUBE-SEP-X4UI2JE2W2QSSJPF     # DNAT -> Pod IP:8080
```

sessionAffinity 설정
```bash
kubectl edit svc app-svc
```
```yaml
# 기본값
sessionAffinity: None
# 변경
sessionAffinity: ClientIP
sessionAffinityConfig:
  clientIP:
    timeoutSeconds: 10800
```
```bash
curl <Service IP>:9090/hostname     # 같은 Client에서 같은 Pod로만 응답
```

### [확인 방법/주의점]
- Pod IP로 직접 통신하면 Pod 재생성 시 단절 → Service IP/DNS 사용. 데모 설명: `app-deploy`(replicas 3, 이미지 `dbgurum/k8s-lab:v1.0`, containerPort 8080)는 경로 없이 호출하면 `No defined Path.`, `/hostname` 경로는 Pod 이름을 응답(Pod 이름이 호스트네임). Pod 3개에 접근하려면 IP 3개를 각각 알아야 한다. `client-app-pod`는 sidecar 구조(nginx `myapp` + curl `sidecar`, emptyDir `html-app` 공유)이며 sidecar의 args에 대상 Pod IP를 직접 적어 두고 `sleep 3600`으로 1시간 유지 — `kubectl rollout restart deployment app-deploy`(Deployment 기능 중 하나, 다음에 학습)로 Pod를 모두 재생성하면 옛 IP가 사라져 client가 응답을 못 받는다(슬라이드: "Pod IP 변경 시 애플리케이션 코드 변경이 불가피"). 반면 Service IP로 요청하면 rollout restart로 Pod IP·이름이 다 바뀌어도(바뀌지 않는 것은 label `app=app-pod`) 계속 접속된다.
- `kubectl expose deployment app-deploy --name=app-svc --port=9090 --target-port=8080`: selector가 `app=app-pod`로 자동 설정되며 타입을 주지 않으면 기본 ClusterIP("안 쓰면 ClusterIP 타입"). expose는 dry-run으로 YAML을 생성하는 용도로도 쓸 수 있다(Service는 YAML로도 만들 수 있음). 슬라이드 12쪽 질문: "Pod는 가상 ethernet device가 존재하는데 service는?" — route 결과에서 Pod IP마다 `cali...` 인터페이스로 향하는 경로(UH 플래그)가 있으나 Service에는 이런 장치가 없음.
- 데모 중 `AlreadyExists` 오류는 이전 실습의 app-svc가 남아 있었기 때문이며 `kubectl delete svc app-svc` 후 다시 expose로 해결(강사 화면).
- `describe svc`: Selector `app=app-pod`, Type ClusterIP, Port `<unset> 9090/TCP`, TargetPort 8080/TCP, Endpoints 3개(`IP:8080` — 바로 위 Pod 조회 IP와 일치), Session Affinity None. 강사: "Service로 들어오면 이 세 접점 중 하나로 무작위 접근". endpoints는 Service가 패킷을 전달하고자 하는 대상을 의미하며 endpoint controller가 자동 관리.
- Service로 요청 시 Endpoint Pod들로 분산(iptables random). Endpoints가 비어 있으면 selector/label 불일치 확인.
- iptables 확인에는 `sudo` 필요.
- 이미 존재하는 이름으로 expose 시 `AlreadyExists`.

---

## Step 14. Service type: ClusterIP

### [목적]
기본 Service 타입인 ClusterIP로 클러스터 내부 전용 통신(예: 백엔드/DB)을 구성한다.

### [이론 설명]
- ClusterIP는 **기본(default) Service 타입**이며 클러스터 안에서만 통용되는 가상 IP. type 생략 시 자동 적용(지금까지 type을 안 준 Service가 모두 ClusterIP). 외부에 노출될 필요가 없는 **애플리케이션 내부 통신용**(예: backend 서비스에서 DB 서비스로 데이터 요청을 처리하는 내부 연결). ClusterIP service는 Cluster 내부 Pod들 간의 통신을 위해 사용.
- 용도(슬라이드 27, 외부 노출은 NodePort, 내부 전용은 ClusterIP로 나눠 씀): case1) WordPress ↔ MySQL(WordPress가 노출되는 쪽이고 MySQL은 데이터를 저장하는 뒷단이므로 ClusterIP — 그림의 WordPress 접속 주소 `http://192.168.56.101:30303`은 NodePort), case2) frontend ↔ backend/DB, case3) Redis DB의 master ↔ slave(master로 들어온 읽기 요청을 slave로 분산해 성능을 높이는 구조에서 master는 외부 노출, master→slave 통신은 내부 ClusterIP — 뒤 강의에서 다룰 예정). 외부에서 들어오는 프런트엔드 Pod는 NodePort·LoadBalancer·Ingress로 노출하고, 일단 클러스터 안으로 들어온 뒤 Pod와 Pod 사이 통신은 ClusterIP로 이루어진다. Pod IP는 재생성 시 바뀌므로 Service는 고정 가상 IP(ClusterIP)를 제공하고 selector로 고른 Pod들에게 전달 — 내부 프로그램끼리는 바뀌지 않는 이 주소(또는 서비스 이름)로 서로를 찾는다.
- YAML 구조(강사 설명): `selector`(실제로 연결할 Pod를 고르는 조건, app: backend label의 Pod), `ports`(보통 `port`=서비스 포트·클라이언트가 접근하는 포트, `targetPort`=Pod 포트 두 가지를 주로 사용하고 `name`·`protocol`(기본 TCP)은 생략 가능), `type: ClusterIP`(미지정 시 기본값). 슬라이드 본문 글은 port 80/targetPort 8080이라 적고 예시 YAML은 9000/8000으로 서로 다르게 적혀 있어 화면 그대로 옮긴 것(예시 숫자는 참고용). 강사 조언: 시연은 명령어를 많이 쓰지만 처음에는 **YAML 코드에 익숙해진 뒤 명령어를 겸용**할 것.
- **`expose` vs `create`(강사)**: `expose`는 현재 운영 중인 Pod/Deployment에 바로 붙여 Service를 만들고, `create`는 그런 대상과 상관없이 Service만 만든다(이번에는 이미 있는 mynode-pod에 expose). 이 문법은 외워 두면 편하다.

### [사용한 CLI]
```yaml
apiVersion: v1
kind: Service
metadata:
  name: clusterip-svc
spec:
  selector:
    app: backend
  ports:
  - name: web
    port: 9000
    targetPort: 8000
    protocol: TCP
  type: ClusterIP
```

LAB
```bash
cd ~/LABs/service
kubectl run mynode-pod --image=dbgurum/mynode:1.0 --port=8000 --dry-run=client -o yaml > mynode-pod.yaml
vi mynode-pod.yaml
kubectl apply -f mynode-pod.yaml

kubectl expose pod mynode-pod --name=mynode-svc --type=ClusterIP --port=9001 --target-port=8000 --dry-run=client -o yaml > mynode-svc.yaml
vi mynode-svc.yaml
kubectl apply -f mynode-svc.yaml

kubectl get po,svc -o wide | grep mynode
kubectl get po -o wide --show-labels | grep mynode
kubectl describe svc mynode-svc
kubectl get endpoints mynode-svc

curl <Pod IP>:8000            # master에서
curl <ClusterIP>:9001         # master/node1~3에서 성공, Windows(외부)에서 타임아웃
```
```yaml
# mynode-pod.yaml (수정본)
apiVersion: v1
kind: Pod
metadata:
  name: mynode-pod
  labels:
    run: mynode
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s-node2
  containers:
  - image: dbgurum/mynode:1.0
    name: mynode-pod
    ports:
    - containerPort: 8000
```
```yaml
# mynode-svc.yaml (dry-run 생성 후 selector 수정 필요)
apiVersion: v1
kind: Service
metadata:
  creationTimestamp: null
  labels:
    run: mynode
  name: mynode-svc
spec:
  ports:
  - port: 9001
    protocol: TCP
    targetPort: 8000
  selector:
    run: mynode          # 자료: expose가 만든 기본값 run: mynode-pod 를 Pod label(run: mynode)에 맞게 수정
  type: ClusterIP
status:
  loadBalancer: {}
```

### [확인 방법/주의점]
- `kubectl expose`는 Pod에서 selector를 자동 생성하는데 Pod label과 어긋나면 수동 수정이 필요(자료에서 `run: mynode-pod` → `run: mynode`로 수정). **강사 강조: Pod의 label(`run=mynode`)과 Service의 selector가 서로 맞아야 연결된다 — "연결점이 label이기 때문"이며 label 자리에 착각해 다른 값을 적기 쉬우니 selector label을 정확히 잡을 것.**
- 수정 후 `apply` 시 `Warning: resource services/mynode-svc is missing the kubectl.kubernetes.io/last-applied-configuration annotation which is required by kubectl apply...`가 나올 수 있으나 오류가 아니다 — "이 Service는 kubectl apply 방식으로 만들어진 것이 아니라 apply용 기록(annotation)이 없다"는 안내이며 누락된 annotation은 자동 패치되고 결과는 `configured`(수정 반영 완료). (영상에서는 AGE 2d10h로 이전에 만든 mynode-svc를 수정 반영한 것으로 보이나 강사가 직접 설명하지 않음.)
- `describe svc`의 Endpoints에 Pod IP:8000이 표시되어야 정상(Endpoints가 비어 있으면 selector 불일치를 의심). Endpoints는 `kubectl get endpoints mynode-svc`로도 볼 수 있다. 연결 확인은 curl로도 가능하지만 describe로 먼저 확인. 영상 실제 값: Pod `10.109.131.41`(k8s-node2, nodeSelector 사용, 라벨 `run=mynode`), Service `10.107.87.76:9001`(슬라이드 예시 IP 10.106.3.224 등과 다름 — 실습에서는 화면에 보이는 실제 값 기준, 환경마다 다름).
- 테스트: master에서 Pod IP:8000과 Service IP:9001 모두 "Welcome to Kubernetes~! by fastcampus." 응답, node1·node2·node3에서도 Service IP:9001 성공(ClusterIP는 어느 노드에서든 클러스터 안이면 통함). Windows cmd에서는 `curl: (28) Failed to connect ... after 21003 ms: Couldn't connect to server`(타임아웃).
- Windows 등 클러스터 외부에서 ClusterIP 접속은 실패하는 것이 정상. 강사 마무리: **ClusterIP는 내부 서비스에서만 사용할 수 있다는 점을 반드시 기억**, 외부(브라우저·Windows)에서 접속해야 하는 서비스는 NodePort·LoadBalancer 등 다른 타입이 필요.

---

## Step 15. Service type: NodePort

### [목적]
Node의 IP와 고정 포트(30000~32767)로 외부에서 Service에 접근하도록 노출한다.

### [이론 설명]
- NodePort는 **애플리케이션에 대한 외부 연결을 활성화하여 ClusterIP 서비스의 기능을 확장**한다 — "내부에 갇혀 있다가 외부로 나갈 수 있는 문을 열어 주는" 타입이며 외부 노출용으로 가장 대표적. NodePort Service를 만들면 클러스터의 **모든 Node**에 특정 포트(30000~32767)를 열어 외부에서 접근하게 하고 생성된 Service의 ClusterIP로 트래픽을 Routing(**NodePort로 만들어도 ClusterIP도 함께 생성**). 이때 kube-proxy가 forwarding하도록 netfilter의 chain rule을 수정. 웹 애플리케이션이나 API처럼 클러스터 외부에서 액세스해야 하는 애플리케이션에 적합. 접속: 외부는 `<NodeIP>:<NodePort>`, 클러스터 내부는 `<ClusterIP>:<port>`. nodePort는 **기본값이 랜덤**이며 YAML에서 `nodePort: 30001`처럼 직접 지정도 가능.
- 3개 포트의 의미와 **개방 순서**(슬라이드 32): ① nodePort(Node에서 열리는 포트, 예 30001 — 외부 노출이므로 가장 먼저 열림) ② port(Service/ClusterIP 포트, 예 9000 — 노드에서 서비스로 연결) ③ targetPort(Pod 컨테이너 포트, 예 8000 — 서비스가 Pod로 전달). 흐름: 클라이언트 요청 트래픽은 노드로 직접 들어오며(노드1이든 2든 3이든 어디로 와도 됨) 노드로 들어온 트래픽은 Pod로 바로 가지 않고 먼저 서비스 ClusterIP의 port로 라우팅된 뒤 Pod targetPort로 전달된다.
- kube-proxy(iptables)가 모든 Node에 규칙을 생성하므로 어느 Node IP로 접속해도 동작(해당 Node에 Pod가 없어도 전달). 강사: Service는 "네트워크 추상화"일 뿐 실제로 일하는 것은 kube-proxy이며, 요청이 노드로 들어와 ClusterIP 쪽으로 라우팅되는 순간 kube-proxy가 만들어 둔 iptables 정보를 따라 Pod로 흐른다(iptables는 리눅스 커널의 패킷 필터/변환 규칙 도구이며 kube-proxy가 Service·Pod 변경 시 자동 갱신).
- 체인 구조: KUBE-NODEPORTS → KUBE-EXT-xxx(KUBE-MARK-MASQ로 masquerade) → KUBE-SERVICES → KUBE-SVC-xxx → KUBE-SEP-xxx(DNAT → Pod IP:port). **KUBE-MARK-MASQ는 Netfilter Mark로 패킷의 Source IP를 Node IP로 변경**하는 역할(masquerade = 출발지 주소를 다른 주소로 바꾸는 것, 응답이 같은 경로로 되돌아오게 하기 위해 "들어와서 나갈 때" 필요). 체인 이름 뒤 해시값은 바뀌므로 앞 단계 출력에서 이름을 복사해 다음 명령에 붙여 넣어 하나씩 따라간다.
- `externalTrafficPolicy`: `Cluster`(기본, 클러스터에 연결된 모든 Pod로 무작위 분산) / `Local`(Cluster처럼 무작위 분산되지 않고 처음 들어온 Node의 Pod로만 지속 연결, kube-proxy가 요청을 Local endpoint로만 proxy하고 다른 Node로 전달하지 않음, 소스 IP 보존). `internalTrafficPolicy`는 Service에 그룹화된 Pod 중 동일 Node에 존재하는 Pod 간의 트래픽 정책(Cluster/Local). 앞 클립 ClusterIP는 내부용이라 internalTrafficPolicy만(sessionAffinity ClientIP 실습), NodePort는 외부에서 들어오므로 externalTrafficPolicy가 함께 붙는다. 강사 비교: sessionAffinity와 비슷하나 "세션 시간" 기준이 아니라 **정책**으로 들어가는 내용. 예: 노드1에 Pod가 2개 있어도 Cluster면 분산되지만 Local이면 처음 들어간 하나만 처리.

### [사용한 CLI]
```yaml
# nodePort 번호 직접 지정 예시
apiVersion: v1
kind: Service
metadata:
  name: nodeport-svc
spec:
  type: NodePort
  selector:
    app: backend
  ports:
  - name: web
    protocol: TCP
    port: 9000
    targetPort: 8000
    nodePort: 30001
```

LAB1
```bash
kubectl run mynode-pod2 --image=dbgurum/mynode:1.0 --port=8000 --dry-run=client -o yaml > mynode-pod2.yaml
vi mynode-pod2.yaml
kubectl apply -f mynode-pod2.yaml

kubectl expose pod mynode-pod2 --name=mynode-svc2 --type=NodePort --port=9002 --target-port=8000 --dry-run=client -o yaml > mynode-svc2.yaml
vi mynode-svc2.yaml
kubectl apply -f mynode-svc2.yaml
kubectl get po,svc -o wide | grep mynode       # 9002:31870/TCP (nodePort 자동 할당)
kubectl describe svc mynode-svc2               # NodePort: 31870/TCP, Endpoints, External Traffic Policy: Cluster

curl 192.168.56.101:31870                      # Node IP:NodePort, 모든 Node IP에서 동일
```
```yaml
# mynode-svc2.yaml
apiVersion: v1
kind: Service
metadata:
  creationTimestamp: null
  labels:
    run: mynode-pod2
  name: mynode-svc2
spec:
  ports:
  - port: 9002
    protocol: TCP
    targetPort: 8000
  selector:
    run: mynode-pod2
  type: NodePort
status:
  loadBalancer: {}
```

iptables에서 NodePort 규칙 확인
```bash
sudo iptables -t nat --list KUBE-NODEPORTS -n | column -t | grep mynode
# KUBE-EXT-ZH6IDACFKHNMCG77 tcp ... /* default/mynode-svc2 */ tcp dpt:31870
sudo iptables -t nat --list KUBE-EXT-ZH6IDACFKHNMCG77 -n | column -t | grep mynode      # KUBE-MARK-MASQ
sudo iptables -t nat --list KUBE-SERVICES -n | column -t | grep mynode                   # KUBE-SVC-...  dpt:9002
sudo iptables -t nat --list KUBE-SVC-ZH6IDACFKHNMCG77 -n | column -t                     # KUBE-SEP-... Pod IP:8000
sudo iptables -t nat --list KUBE-SEP-<id> -n | column -t                                 # DNAT tcp ... to:Pod IP:8000
```

LAB2: Pod 2개 + NodePort(nodePort 30090 고정) (myweb-pod-svc.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myweb1
  labels:
    app: myweb
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s-node1
  containers:
  - name: container
    image: dbgurum/k8s-lab:v1.0
    ports:
    - containerPort: 8080
---
# myweb2: name: myweb2, nodeSelector hostname: k8s-node2 (나머지 동일)
apiVersion: v1
kind: Service
metadata:
  name: myweb-svc
spec:
  selector:
    app: myweb
  ports:
  - port: 9000
    targetPort: 8080
    nodePort: 30090
  type: NodePort
```
```bash
vi myweb-pod-svc.yaml
kubectl apply -f myweb-pod-svc.yaml
kubectl get po,svc -o wide | grep myweb
curl 192.168.56.101:30090/hostname      # myweb1 / myweb2 로 분산
```

externalTrafficPolicy 변경
```bash
kubectl patch svc myweb-svc -p '{"spec":{"externalTrafficPolicy":"Local"}}'
# 또는
kubectl edit svc myweb-svc      # externalTrafficPolicy / internalTrafficPolicy 를 Cluster -> Local
curl 192.168.56.101:30090/hostname   # Local: 접속한 Node(101)의 Pod(myweb1)만 응답
sudo iptables -t nat --list KUBE-NODEPORTS -n | column -t | grep myweb
sudo iptables -t nat --list KUBE-EXT-54PHLYVTQWMEAN6N -n | column -t | grep myweb
```
```yaml
# kubectl edit svc myweb-svc 에서 보이는 spec 일부
spec:
  clusterIP: 10.100.27.255
  externalTrafficPolicy: Cluster
  internalTrafficPolicy: Cluster
  ports:
  - nodePort: 30090
    port: 9000
    protocol: TCP
    targetPort: 8080
  selector:
    app: myweb
  sessionAffinity: None
  type: NodePort
```

### [확인 방법/주의점]
- `kubectl get svc`의 `PORT(S)`가 `9002:31870/TCP`이면 `port:nodePort`. nodePort를 지정하지 않으면 30000~32767에서 자동 할당(환경마다 다름).
- `curl <NodeIP>:<NodePort>`는 클러스터 외부(Windows CMD)에서도 가능(강사가 화면으로 확인: master·node1~3·외부 Windows CMD 모두 성공, 슬라이드 36은 참고용 다른 실행 결과로 포트 32469). "어떤 Node IP든 상관없다" — 모든 Node IP에 발급받은 NodePort를 붙여 조회.
- `Local` 정책에서는 해당 Node에 Pod가 없으면 응답하지 않을 수 있음(자료는 "접속한 Node의 Pod로만" 응답한다고 설명). 영상 결과: edit로 external·internal 두 정책을 모두 Local로 바꾼 뒤 `curl 192.168.56.101:30090/hostname`을 4번 하면 모두 myweb1(101번 노드=k8s-node1에 실제로 뜬 Pod, "저는 1번에 꽂혔어요"), 다시 Cluster로 바꾸면 myweb2/myweb1이 섞여 분산. `kubectl patch ... '{"spec":{"externalTrafficPolicy":"Local"}}'`는 **external 정책만** 변경(edit는 external·internal 둘 다 변경했다는 차이). Local로 바꾸면 `KUBE-EXT-...` 체인에 `masquerade LOCAL traffic`·`route LOCAL traffic` 같은 LOCAL 항목이 생기며 이는 "kube-proxy가 서비스 정보 변경을 확인하고 iptables를 업데이트"한 결과(외부 트래픽은 해당 노드에만 접근 가능하도록 규칙 변경). edit 저장 시 `service/myweb-svc edited`.
- 자료에서 apply 대상 파일명 오타(`mynode-svc.yaml` vs `mynode-svc2.yaml`)가 있었으나 의도는 svc2 적용(영상에서도 강사가 먼저 mynode-svc.yaml을 apply해 `configured`가 나온 뒤 "svc2를 apply하지 않았네요"라며 적용). Service는 별도 기동 시간 없이 즉시 생성.
- **`kubectl expose --type=NodePort`로는 nodePort 번호를 지정할 수 없다**(옵션 없음) — 특정 포트가 꼭 필요하면 `--dry-run=client -o yaml`로 YAML을 뽑아 `nodePort`를 직접 추가하거나 Service를 직접 작성(강사). 이번 LAB1은 지정하지 않아 랜덤(31870) 배정. LAB1에서 Pod는 `--port=8000`(Pod 쪽 포트), expose는 대상 `pod mynode-pod2`와 `--type=NodePort`만 신경 쓰면 되고 생성 YAML에 `nodePort`가 없고 selector `run: mynode-pod2`가 잡혀 있음. `PORT(S)` `9002:31870/TCP` = Service port 9002 : nodePort 31870, Endpoints `10.111.218.68:8000`(Pod IP:targetPort).
- LAB2: Pod 2개(label `app: myweb`, nodeSelector로 각각 k8s-node1·k8s-node2)와 Service를 `---`로 구분해 한 YAML 파일에서 한 번에 apply(강사: pod와 서비스를 동시에 apply). Service는 nodePort를 30090으로 지정. `curl 192.168.56.101:30090/hostname` 반복 시 myweb1/myweb2 응답 — 슬라이드는 1,2로 라운드로빈처럼 보이나 **실제로는 랜덤**(강사), 실습 화면은 myweb1 myweb2 myweb2 myweb1 myweb1 순으로 섞여 나옴("어쨌든 부하분산이 일어난다"). 슬라이드와 실습의 Pod IP·ClusterIP는 서로 다름.
- iptables 명령은 관리자 권한이 필요해 `sudo` 사용(`[sudo] password for student` 프롬프트, 비밀번호 입력은 화면에 표시되지 않음). ClusterIP 클립에서는 KUBE-SERVICES부터, NodePort는 KUBE-NODEPORTS부터 조회 시작.

---

## Step 16. Service type: LoadBalancer (GKE 데모, 온프레미스 pending)

### [목적]
외부 로드밸런서(Public IP/DNS)를 통해 서비스를 노출하는 LoadBalancer 타입의 동작을 이해하고, 클라우드(GKE)와 VM 환경 차이를 확인한다.

### [이론 설명]
- **정의(슬라이드 43)**: 클라우드 서비스 공급자(CSP — AWS, GCE)가 제공하는 외부 Load Balancer를 이용해 클러스터 외부에서 접근 가능하도록 노출하는 서비스로, Node 앞에 위치해 각 Node로 트래픽을 분산하는 역할. LoadBalancer 서비스는 **NodePort 서비스 위에 적용**되며 L4 LoadBalancer가 생성되고 **ClusterIP 서비스 및 NodePort 서비스가 암시적으로 함께 생성**된다. Public으로 사용 가능한 IP 주소 및 DNS 주소를 제공하여 Private IP 주소 및 NodePort 포트를 통해 클러스터 Node에 트래픽을 Load Balancing하고 전달한다. 강사: 로드 밸런서는 원래 L4/L7 스위치 같은 장비인데 클라우드에서는 가상화되어 CSP(AWS·구글 등)가 제공 — Service의 type을 LoadBalancer로 지정하면 실제 클라우드 LB가 생성되고 외부에서 접근할 IP/DNS 정보를 받는다.
- 구조/트래픽 흐름(슬라이드 45): 클라이언트 요청 → 외부 로드 밸런서(`type: LoadBalancer`, Public IP or DNS) → 각 노드의 nodePort(예: 30111, 어느 노드로 들어가도 됨) → ClusterIP 라우팅·kube-proxy → 애플리케이션 Pod(targetPort 8000). NodePort 때와 거의 비슷하나 앞에 LB가 붙는 점이 다르다. 즉 **CSP 로드 밸런서 → NodePort → ClusterIP** 순서.
- 활용: 웹 애플리케이션이나 API처럼 **높은 트래픽 양을 처리해야 하는 애플리케이션**에 유용(부하 분산이 꼭 필요한 경우).
- 클라우드별 외부 접근 정보: GKE(구글)는 IP 주소, EKS(AWS)는 매우 긴 로드 밸런서 DNS 주소(강사 설명).
- VM/온프레미스: 외부에 제공할 공인 주소를 내어줄 장치가 없어 EXTERNAL-IP가 `<pending>`으로 영원히 유지 → **MetalLB(bare metal load balancer) 모듈을 설치**해야 하며(제공할 IP 대역을 MetalLB에 입력해 두면 그 대역의 IP를 Service에 할당, 다음 클립에서 실습) → Step 17.
- YAML 예: selector, ports(port 9000, targetPort 8000, nodePort 30111), `type: LoadBalancer`. 타입만 LoadBalancer로 바뀌었을 뿐 selector·ports는 지금까지와 동일하며 targetPort 8000은 Pod 쪽 포트, nodePort는 지정하지 않아도 무작위 배정.

### [사용한 CLI]
```yaml
apiVersion: v1
kind: Service
metadata:
  name: lb-svc
spec:
  type: LoadBalancer
  selector:
    app: backend
  ports:
  - port: 9000
    targetPort: 8000
    name: web
    protocol: TCP
    nodePort: 30111
```

VM 환경 데모 (EXTERNAL-IP pending)
```bash
kubectl run lb-pod1 --image=traefik/whoami --port=80
kubectl expose po lb-pod1 --name=lb-pod1-svc --type=LoadBalancer --port=80 --target-port=80
kubectl get po,svc -o wide | grep lb-pod
# service/lb-pod1-svc LoadBalancer 10.111.66.154 <pending> 80:32693/TCP
curl <Pod IP>
curl <ClusterIP>        # Hostname 등 요청 정보 출력
```

GKE 데모 (Google Cloud SDK Shell, Windows)
```bash
kubectl get no                   # GKE Node 3대
# nginx-deploy.yml (replicas는 이후 scale로 조정)
```
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-hello
  namespace: default
  labels:
    app: nginx
spec:
  replicas:            # 자료에서 값이 비어 있음 (이후 kubectl scale 사용)
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginxdemos/hello
```
```bash
kubectl apply -f nginx-deploy.yml
kubectl expose deployment nginx-hello --name=nginx-svc --port=80 --target-port=80 --type=LoadBalancer
kubectl get po,svc -o wide          # EXTERNAL-IP <pending> -> 약 20~30초 후 공인 IP (예: 34.22.111.121), 80:31840/TCP
kubectl scale deploy nginx-hello --replicas=3
kubectl get po,svc -o wide
# 브라우저로 http://<EXTERNAL-IP> 접속, Auto Refresh로 Pod 변경 확인
```

### [확인 방법/주의점]
- GKE는 `<pending>` 후 수십 초(강사: 20~30초 정도) 만에 EXTERNAL-IP 부여 — VM과 달리 클라우드가 실제 로드 밸런서를 만들어 IP를 내어주기 때문. VM 클러스터는 계속 pending(MetalLB 필요, 강사: "영원히 유지"). VM 데모에서는 Pod IP(10.111.218.67)와 CLUSTER-IP(10.111.66.154) 모두로 curl이 성공(내부 IP라 당연)하지만 로드 밸런서의 목적인 EXTERNAL-IP는 `<pending>`.
- `PORT(S)`의 `80:31840/TCP`는 Service 80 ↔ nodePort 31840(LoadBalancer도 내부적으로 NodePort 사용, 자동 생성; VM 데모는 `80:32693/TCP`).
- `traefik/whoami` 이미지: 접속한 애플리케이션의 호스트 정보·IP 정보(Hostname, IP, RemoteAddr, Host, User-Agent)를 보여 주는 간단한 테스트용 이미지. `--type=LoadBalancer`가 핵심 옵션(서비스 타입 지정), `--port=80`/`--target-port=80`은 서비스 포트와 Pod 컨테이너 포트.
- GKE 데모는 수강생 환경이 없으므로 구경만 하면 됨(슬라이드에 [Demo]로 표시, 촬영 시점에 GCP의 GKE 운영 중이어서 Google Cloud SDK Shell 화면 사용, GKE 버전 1.28.3, Node 3개). 강사는 VM에서는 LoadBalancer를 쓸 근거가 별로 없다고 언급. `nginxdemos/hello` 이미지는 페이지에 Server address·Server name(Pod 이름이 호스트 이름이 됨)을 표시 — 브라우저에서 `http://<EXTERNAL-IP>`로 접속해 **Auto Refresh**를 체크하면 새로고침마다 응답하는 Pod가 무작위로 바뀌는 로드 밸런서의 부하 분산을 확인(화면 캡처의 Pod 이름이 curl 결과와 다른 것은 서로 다른 Pod가 응답했기 때문). 공인 IP로 curl하면 HTML 소스가 매우 길게 출력되어 브라우저 사용.
- Windows에서는 `vi` 대신 notepad로 YAML 작성(영상에서 강사가 `vi nginx-deploy.yml`이 실패하자 notepad로 염 — 슬라이드 YAML의 replicas 값은 편집 중이라 판독 불가, replicas 3으로 바꾸려 했으나 반영되지 않은 것 같다며 이후 `kubectl scale`로 조정).

---

## Step 17. VM 기반 LoadBalancer 사용을 위한 MetalLB 구성

### [목적]
온프레미스/VM 환경에서 `type: LoadBalancer` Service가 EXTERNAL-IP를 받도록 MetalLB(L2 mode)를 설치·설정한다.

### [이론 설명]
- **왜 필요한가(슬라이드 49)**: 온프레미스 클러스터에서는 AWS·GCP·Azure처럼 Load Balancer를 제공하지 않으므로 부하분산 기능 및 외부 연결용 IP 주소를 제공하는 리소스가 필요 → **MetalLB**("베어메탈 로드밸런서"의 줄임말)는 Bare Metal 환경(가상화하지 않고 쓰는 고성능 물리 서버)에서 쓸 수 있는 Load Balancer 기능을 제공하는 **CNCF의 오픈소스 프로젝트**(Kubernetes와 같은 CNCF 소속, 계속 육성 중). "외부 IP 주소 풀"을 사용해 온프레미스 및 VM 등 가상 환경 클러스터에서 외부 서비스에 접근할 수 있게 한다. 실습에서는 외부 주소 풀로 노드 IP와 같은 192.168.56.x 대역을 그대로 쓰며, 이 대역으로 외부(인터넷)에서 접근하려면 VirtualBox 네트워크 설정을 따로 해야 하지만 이번 수업 범위는 아님(즉 이번 외부 IP는 실제로는 내부에서만 사용 가능).
- **MetalLB의 특징(슬라이드 50)**: 온프레미스 환경에서 `type: LoadBalancer`의 `EXTERNAL-IP=<pending>`을 해소. **목적은 LoadBalancer IP로 전달되는 트래픽을 클러스터 Node로 유도**하는 것이며 트래픽이 Node에 도달하면 MetalLB의 역할은 끝나고 그다음은 클러스터의 CNI(Calico)가 처리 — 즉 "IP를 할당하고 그 IP로 오는 트래픽을 노드로 보내 주는 것까지"가 역할. 제공되는 서비스 IP(EXTERNAL-IP)는 **ping에 응답하지 않으며** 동작 확인은 제공된 IP로 애플리케이션에 접속(curl 등)해서 한다.
- **설치 방법 3가지**(공식 문서 https://metallb.universe.tf/installation/): Kubernetes manifest(평소 쓰는 YAML 매니페스트, **이번 실습은 이 방법**), Kustomize(Kubernetes 기본 도구 중 하나, 애플리케이션 배포 등에 사용), Helm(설치 도구 중 가장 간편한 방법, 이후 파트에서 Helm 작업이 많이 나올 예정).
- **모드(슬라이드 51)**: **Layer2 mode** — 클러스터 노드 중 하나(리더 노드)가 외부에서 접속 가능한 IP의 ARP request를 네트워크 인터페이스에 할당해 처리, 구성은 단순하지만 대용량 처리에 부하가 심해 **테스트용 권장**(이번 실습). ARP(Address Resolution Protocol) = IP 주소를 MAC 주소와 매칭시키는 프로토콜이며 MAC 주소가 OSI 2계층(이더넷)이라 "L2 모드"라 부른다("이 IP를 가진 장비는 MAC 주소를 알려 달라"고 같은 네트워크 전체에 묻는 방식). **BGP mode** — 성능·고가용성 면에서 유리해 **운영 환경 권장**. 고급 AddressPool 구성 — IP 대역을 여러 개로 나누는 데 사용(참고: https://metallb.universe.tf/configuration/_advanced_ipaddresspool_configuration/).
- **L2 모드 설정(슬라이드 52)**: 사용할 IP 주소 대역 설정을 통해 IP를 제공하며 설치 후 필수 사항은 "EXTERNAL-IP 대역"과 "설정 모드" 지정. layer2 모드는 Node NIC에 IP를 바인딩하지 않고 로컬 네트워크의 ARP 요청에 응답해 컴퓨터의 MAC 주소를 클라이언트에 제공하는 방식(참고 https://metallb.universe.tf/concepts/layer2/). 슬라이드 말풍선: **IPAddressPool 대역은 사용자(클라이언트)와 Cluster Node 모두 접근 가능한 대역으로 지정**(강사: "클러스터에서 접근 가능한 IP"와 "클라이언트가 사용할 수 있는 IP"를 함께 고려, 이번에는 노드 IP 대역 사용). 이전 MetalLB 버전은 ConfigMap만으로 설정했지만 현재 쓰는 **0.13.x부터는 L2 모드에서도 `L2Advertisement`를 사용**해야 한다(강사가 이전 버전 번호는 확실히 말하지 않음). L2Advertisement는 "나는 이 IP를 갖고 있으니 받아 달라"고 광고(advertise)하는 역할.
- **구성요소(슬라이드 53)**: **Controller**(Deployment, replica 1개) — 구성된 IP pool을 읽어 로드 밸런싱을 수행할 **EXTERNAL-IP 주소를 할당**, 모드와 상관없이 항상 사용. **Speaker**(DaemonSet, 모든 노드(4개)에 배치) — Layer2 or BGP 모드로 할당된 IP를 **알리는** 역할, **speaker pod는 Pod IP가 아니라 노드(host) IP를 그대로 사용**(설치 후 실제로 192.168.56.100~.103으로 확인됨). **컨트롤러 및 스피커 서비스 계정** — 구성 요소 작동에 필요한 적절한 권한(ServiceAccount, RBAC)이 매니페스트에 함께 포함.
- **L2 동작 흐름(슬라이드 54~55)**: ① `type: LoadBalancer` Service를 만들면 Controller가 API server를 통해 EXTERNAL-IP를 특정 노드의 **리더 Speaker pod**에 할당 ② 클러스터 노드 중 하나의 speaker가 리더가 됨(강사: etcd의 리더 선출과 같은 개념, 리더에 문제가 생기면 자동 재선출되어 장애 시에도 전체가 멈추지 않음 — etcd는 Raft 사용) ③ 리더 Speaker가 EXTERNAL-IP를 소유하고 있다는 사실을 ARP로 모든 노드의 Speaker에 전파/announce ④ 리더 노드로 패킷이 들어오면 그 노드의 iptables 규칙에 따라 각 Pod로 분산(노드 도착 이후는 NodePort 방식과 거의 비슷). 강사 요약: 모든 일은 API 서버를 거치며, controller가 자신이 가진 IP 중 하나를 서비스에 할당하고 그 정보를 speaker에 넘기면 speaker가 "이 IP는 내가 갖고 있다"고 ARP로 전체 노드에 알린다.
- **설정 방식 정리**: 0.13.x는 ConfigMap 방식이 아닌 CRD(`IPAddressPool`, `L2Advertisement`, apiVersion `metallb.io/v1beta1`)로 설정. IP 풀 대역은 Node와 같은 네트워크 대역에서 사용하지 않는 IP로 선택. 풀을 만든다고 곧바로 쓰이는 것이 아니라 **L2Advertisement에 풀 이름을 적어야** 리더 speaker가 그 대역을 관리하고 알린다.
- MetalLB 환경에서도 할당된 EXTERNAL-IP로 ping은 되지 않는다(자료에서 100% packet loss, curl은 정상 — MetalLB의 특징).

### [사용한 CLI]
1) kube-proxy strictARP 활성화 (IPVS 모드 사용 시 L2 필수 설정)
```bash
kubectl edit configmap -n kube-system kube-proxy
#   ipvs:
#     strictARP: true      # false -> true

# 변경 사항 diff (0이 아니면 변경 있음)
kubectl get configmap kube-proxy -n kube-system -o yaml | \
sed -e "s/strictARP: false/strictARP: true/" | \
kubectl diff -f - -n kube-system

# 실제 적용
kubectl get configmap kube-proxy -n kube-system -o yaml | \
sed -e "s/strictARP: false/strictARP: true/" | \
kubectl apply -f - -n kube-system
```

2) MetalLB v0.13.12 설치
```bash
mkdir metallb && cd $_
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.13.12/config/manifests/metallb-native.yaml
# namespace metallb-system, CRD(ipaddresspools, l2advertisements 등), RBAC, controller Deployment, speaker DaemonSet, webhook 생성

kubectl get all -n metallb-system        # controller 1개 + speaker 4개(Node 수) Running
kubectl get no -o wide                   # Node INTERNAL-IP와 Speaker IP 대응 확인
```

3) 설정 전 상태 확인: LoadBalancer Service는 pending
```bash
kubectl run myweb --image=nginx --port=80
kubectl expose po myweb --name=myweb-svc --port=80 --target-port=80 --type=LoadBalancer
kubectl get po,svc -o wide | grep myweb       # EXTERNAL-IP <pending>
```

4) IP pool + L2Advertisement 설정
```bash
kubectl api-resources | grep -i metal
# ipaddresspools / l2advertisements 등 metallb.io/v1beta1 확인 (YAML의 apiVersion, kind 근거)
```
```yaml
# ip-pool-01.yaml  (192.168.56.150/26 -> 192.168.56.128 ~ 191, 64개)
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: ip-pool-01
  namespace: metallb-system
spec:
  addresses:
  - 192.168.56.150/26
```
```yaml
# ip-pool-02.yaml  (192.168.56.200/27 -> 192.168.56.192 ~ 223, 32개)
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: ip-pool-02
  namespace: metallb-system
spec:
  addresses:
  - 192.168.56.200/27
```
```yaml
# l2-pool.yaml  (두 풀을 L2로 광고)
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: network-l2-lb-01
  namespace: metallb-system
spec:
  ipAddressPools:
  - ip-pool-01
  - ip-pool-02
```
```bash
kubectl apply -f ip-pool-01.yaml
kubectl apply -f ip-pool-02.yaml
kubectl apply -f l2-pool.yaml
kubectl get po,svc -o wide | grep myweb    # pending이던 myweb-svc에 EXTERNAL-IP 192.168.56.129 할당
```
(참고: 구버전 ConfigMap 방식 예시)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: metallb-system
  name: config
data:
  config: |
    address-pools:
    - name: default
      protocol: layer2
      addresses:
      - 192.168.56.200-192.168.56.210
```

5) Deployment 3개 + LoadBalancer 확인
```bash
kubectl create deployment metallb-deploy --image=traefik/whoami --replicas=3 --port=80
kubectl expose deployment metallb-deploy --name=metallb-deploy-svc --type=LoadBalancer --port=80 --target-port=80
kubectl get po,svc -o wide | grep metallb       # EXTERNAL-IP 192.168.56.130
curl 192.168.56.130                              # 반복 호출 시 Hostname/Pod IP가 3개 Pod로 분산
```

6) 이벤트 및 ping 확인
```bash
kubectl get events -w
# IPAllocated: Assigned IP ["192.168.56.130"]
# nodeAssigned: announcing from node "k8s-node2" with protocol "layer2"
# (IP 풀 적용 전에 만든 myweb-svc) Warning AllocationFailed: Failed to allocate IP for "default/myweb-svc": no available IPs
#   -> 풀 적용 후 IPAllocated: Assigned IP ["192.168.56.129"] 로 바뀜
ping -c 2 192.168.56.130      # 100% packet loss (ICMP 응답 없음, 서비스 포트 curl은 정상)
```

### [확인 방법/주의점]
- **설치 전 확인(강사)**: L2 모드는 ARP가 필수이므로 kube-proxy ConfigMap에 `strictARP: true`가 되어 있는지 먼저 확인(kube-proxy는 DaemonSet이고 설정은 ConfigMap으로 제공되므로 `kubectl edit configmap -n kube-system kube-proxy`로 열어 확인). "false로 되어 있다면 true로 바꿔 주세요" — 편집기 대신 sed로 diff 확인 후 apply하는 방법도 슬라이드에 있음(첫 번째는 변경 사항을 diff로 확인만, 변경이 있으면 0이 아닌 반환 코드; 두 번째는 실제 적용). 영상에서는 edit 명령을 입력해 보인 뒤 곧바로 설치 단계로 넘어가므로 값이 실제로 바뀌는 장면은 나오지 않는다. 자세한 방법은 공식 설치 문서에 있음.
- 설치: 강사는 공식 문서의 현재 버전 0.13.12 기준 매니페스트 주소로 설치(Controller, Speaker, 권한 관련 리소스 및 **CRD**(새로운 종류의 오브젝트를 만들 수 있게 하는 사용자 정의 리소스 정의)가 함께 포함). MetalLB는 전용 `metallb-system` 네임스페이스 사용(강사: 보통 이렇게 전용 네임스페이스로 운영). 생성된 CRD 중 `ipaddresspools`와 `l2advertisements`가 뒤에서 직접 작성할 오브젝트 종류. 설치 직후 speaker가 아직 다 올라오지 않아 READY 0/1인 구간이 있을 수 있음. 정상 상태: controller Deployment 1개 + speaker DaemonSet 4개(마스터 + 워커 3대)가 Running, Speaker Pod IP는 노드 INTERNAL-IP(192.168.56.100~.103)와 동일. (get no 결과 노드 버전 v1.28.4, OS Ubuntu 22.04.2 LTS.)
- **IP 풀 없이 LoadBalancer를 만들면(핵심 주의점)**: MetalLB를 설치해도 `myweb-svc`의 EXTERNAL-IP는 계속 `<pending>`(약 29초 뒤 다시 조회해도 pending, `80:30537/TCP`). 강사: "바이메탈 로드밸런서를 설치했는데 왜 pending일까요? **한 가지 구성이 빠졌습니다 — IP 풀을 지정하지 않았기 때문**." MetalLB는 설치만으로 끝나지 않고 사용할 IP 대역을 알려 주는 작업이 반드시 필요("매니페스트를 설치했다고 끝난 것이 아니다"). 풀을 만들기 전에 만든 서비스는 `Warning AllocationFailed ... no available IPs` 이벤트를 남겼다가 풀 적용 후 `IPAllocated`로 바뀐다.
- IP 풀 정의 전에는 Service가 `<pending>`, 풀 정의 후 자동 할당(영상: ip-pool-01 대역의 192.168.56.129가 pending이던 myweb-svc에 할당, 새 Deployment 서비스는 pending 없이 곧바로 192.168.56.130 — ip-pool-01 대역 128~191 안). 
- 풀 대역은 Node가 속한 네트워크(192.168.56.x)에서 사용 중이지 않은 IP를 선택(사용자(클라이언트)와 Cluster Node 모두 접근 가능한 대역). `/26`=64개, `/27`=32개. 주소는 "시작-끝" 형태(예 192.168.56.200-192.168.56.210)로 써도 CIDR로 써도 되고 한 풀에 여러 줄도 가능(여기서는 대역 구분을 위해 /26과 /27 두 풀을 만듦). **두 풀의 `metadata.name`은 서로 달라야 한다**(슬라이드 58의 첫 화면에서는 두 번째 파일 name이 ip-pool-01로 보이나 이후 화면과 실제 vi 화면에서는 ip-pool-02 — 중복 주의). 영상 터미널에서는 L2Advertisement 파일명이 `l2-pool.yaml`(슬라이드는 `network-l2-lb-01.yaml`)이며 apply 결과는 `ipaddresspool.metallb.io/ip-pool-01 created`, `... ip-pool-02 created`, `l2advertisement.metallb.io/network-l2-lb-01 created`.
- 설정 YAML 작성 시 `kubectl api-resources | grep -i metal`로 apiVersion/kind 확인(강사: YAML에 쓸 apiVersion과 kind는 반드시 api-resources로 조회해서 확인 — 목록에 AddressPool/BFDProfile/BGPAdvertisement/BGPPeer/Community/IPAddressPool/L2Advertisement가 나오며 IPAddressPool·L2Advertisement는 `metallb.io/v1beta1`; 일부 항목(BGPPeer 등)은 v1beta2로 보이나 화면 판독이 불확실).
- ARP 광고는 단일 Node(leader)가 담당하므로 L2 모드는 대용량 처리에 부하가 심해 테스트용으로 권장, 운영 환경은 고가용성 BGP 모드(슬라이드 51).
- 부하 분산 테스트: `traefik/whoami` 3개 복제본(`kubectl create deployment metallb-deploy --image=traefik/whoami --replicas=3 --port=80` + `expose ... --type=LoadBalancer`)에 `curl 192.168.56.130`을 반복하면 Hostname·Pod IP(10.111.156.111/k8s-node1, 10.109.131.43/k8s-node2, 10.111.218.66/k8s-node3)가 요청마다 다른 Pod로 바뀜 — "외부 IP → 노드 → (CNI/서비스) → 여러 Pod"로 분산. 강사: "MetalLB는 딱 던져 주는 역할이고 노드에 도착한 뒤에는 내부 CNI에 의해 서비스로 연결". 슬라이드 60의 192.168.56.192 등은 다른 시간대 예시 값이라 실습 값과 다름.
- 이벤트: `kubectl get events -w`에서 `IPAllocated`(Assigned IP [...])·`nodeAssigned`(`announcing from node "k8s-node2" with protocol "layer2"` — 그 IP를 어느 노드 speaker가 ARP로 알리는지, 화면 기준 192.168.56.130은 k8s-node2) 확인. `ping -c 2 192.168.56.130`은 `Redirect Host`/`Destination Host Unreachable`로 100% packet loss. 강사 마무리: 베어메탈 로드밸런서는 내부 트래픽 전송 목적으로도 쓸 수 있고 사용 IP 대역을 인프라에서 쓸 수 있는 대역으로 바꾸면 외부 접속도 받을 수 있다. 이번에는 모드만 시험했으며 ARP 동작·내부 구조는 `tcpdump` 등으로 직접 확인해 볼 수 있다고 안내(자료에 구체 절차 없음).

---

## Step 18. Amazon EKS 기반 LoadBalancer 사용 (데모)

### [목적]
관리형 Kubernetes(EKS)에서 `type: LoadBalancer` Service가 AWS 로드밸런서(Classic LB)를 자동 생성하는 과정을 확인한다.

### [이론 설명]
- 클라우드 기반으로 LoadBalancer 타입을 쓰면 실제 로드 밸런서가 장착되고 그 IP 주소나 DNS 정보가 제공되어 외부에서 연결 가능. 이 클립은 데모 파트이며 EKS를 본격적으로 쓰는 것은 3번 파트 이후(강사).
- EKS에서 LoadBalancer Service를 만들면 AWS 로드밸런서가 자동 생성되고 EXTERNAL-IP로 **ELB DNS 이름**이 부여. 일반적으로 LoadBalancer Service는 모든 노드 앞에 로드 밸런서를 추가해 **NodePort Service를 확장**한 것(슬라이드 63)이며, Amazon EKS에서는 Kubernetes가 Load Balancer를 요청하면 **모든 노드를 자동 등록**한다 — **로드 밸런서는 지정된 Service의 Pod가 실행되는 위치를 감지하지 않고 모든 작업자 노드가 백엔드 인스턴스(로드 밸런서가 트래픽을 나눠 보내는 대상 서버, 여기서는 워커 노드용 EC2)로 추가**된다.
- AWS LB 4종(슬라이드 64): **Classic(CLB)**(초기 버전, ALB와 NLB 기능을 모두 갖고 있었고 현재 deprecated(폐기 예정)이지만 사실상 사용은 가능, **지정하지 않으면 기본값**), **Application(ALB)**(HTTP 기반, 7계층 서비스), **Network(NLB)**(4계층 — TCP, UDP, TLS 트래픽), **Gateway**(외부 보안 도구(가상 어플라이언스)와 연결할 때 사용하는 로드 밸런서). EKS는 기본적으로 Classic LB를 LoadBalancer 서비스에 사용하며, LB는 노출된 포트를 통해 노드로 라우팅. 강사: Classic은 폐기 예정이므로 트래픽 성격에 맞춰 NLB나 ALB로 바꾸는 것을 권장(콘솔이 NLB 마이그레이션 마법사를 제공, ALB는 별도 구성)하지만 그 설정은 별도 작업이 필요해 이번에는 생략하고 기본 Classic을 확인. NLB는 아래 어노테이션만 적용하면 옮기기 간단하며 실무에서는 이런 부분까지 업데이트해 보는 것이 좋다. (어노테이션 = Kubernetes 오브젝트에 붙이는 부가 설명용 키-값 정보로 AWS 로드 밸런서 컨트롤러 등이 읽어 동작을 바꾸는 데 사용.)
- **트래픽 흐름(슬라이드 65)**: 외부 트래픽은 워커 노드로 바로 들어가지 않고 먼저 **Classic Load Balancer(DNS 주소)**에 도달 → CLB가 요청을 EC2 인스턴스(워커 노드) 중 하나의 특정 포트로 전달 → 노드에 들어온 트래픽은 프런트엔드 서비스(NodePort, 그림 예 32001)가 받아 Pod 쪽 9001번으로(그림: Service port 80 / targetPort 9001) → Pod로 가는 규칙은 클러스터 IP(그림 10.100.0.26:80)를 통해 라우팅 테이블처럼 저장(내부 메커니즘은 앞서 배운 NodePort와 비슷). 구조는 "NodePort 위에 로드 밸런서를 한 겹 더 얹은 것"이며 달라지는 점은 진입점이 노드 IP:포트가 아니라 **로드 밸런서의 DNS 주소**라는 것. (STT가 32001을 잘못 옮겼으므로 포트 값은 슬라이드 화면의 32001/9001 기준.)
- NLB 사용 시 Service에 annotation 추가:
  ```yaml
  service.beta.kubernetes.io/aws-load-balancer-type: external
  service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: instance
  ```
- EXTERNAL-IP 비교: MetalLB(VM) – 풀 설정 전 `<pending>`, 설정 후 풀의 IP / GKE – 공인 IP / EKS – ELB DNS 이름.
- 자료 데모 환경: ap-northeast-2, EKS Node t3.medium 3대(Kubernetes v1.27.7-eks), 별도 EC2(ec2-user)에서 kubectl 사용. kube-system에 aws-node(VPC CNI), coredns, kube-proxy.

### [사용한 CLI]
```bash
kubectl get no
kubectl get po -A         # aws-node x3, coredns x2, kube-proxy x3

vi nginx-deploy.yml       # Step 16의 nginx-hello Deployment, replicas: 1 (또는 3)
kubectl apply -f nginx-deploy.yml
kubectl expose deploy nginx-hello --name=nginx-svc --port=80 --target-port=80 --type=LoadBalancer
kubectl get po,svc -o wide | grep nginx
# EXTERNAL-IP: a975957e...-830197095.ap-northeast-2.elb.amazonaws.com, 80:30104/TCP
kubectl scale deploy nginx-hello --replicas=3
kubectl get po,svc -o wide | grep nginx
```
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-hello
  namespace: default
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginxdemos/hello
```

### [확인 방법/주의점]
- AWS 콘솔 EC2 > 로드 밸런싱 > 로드 밸런서에서 Classic LB, Internet-facing(인터넷에 공개), 서비스 중인 인스턴스 3/3, 가용 영역 3개(ap-northeast-2a/2c/2d), 서브넷 3개 확인 가능(`expose` 전에는 로드 밸런서가 하나도 없는 상태였고 새로고침하면 생성됨, 생성일 2024-01-04). DNS 이름이 `kubectl get svc`의 EXTERNAL-IP와 **정확히 같은 문자열**이며 Kubernetes Service만 만들었는데 AWS에 실제 Classic LB가 생기고 워커 노드 3대가 모두 백엔드로 등록 — 슬라이드 63의 "모든 작업자 노드가 백엔드로 추가"와 일치. 리스너(로드 밸런서 포트와 인스턴스 포트 연결)도 콘솔에서 확인 가능.
- 브라우저에서 ELB DNS 접속 → nginxdemos/hello 페이지(Server name = Pod 이름, Auto Refresh로 Pod 분산 확인). 기본은 HTTP(80)라 주소창에 "주의 요함(보안되지 않음)"이 뜨는 것이 정상. 영상 화면의 Server address 192.168.90.105:80 / Server name `nginx-hello-689c8f77bb-kckzr`는 앞의 get po에서 본 두 번째 Pod와 일치하며, 다른 Pod로 분산되는 모습과 Auto Refresh는 이 클립에서 직접 시연되지 않았다.
- Classic LB는 기본, NLB를 쓰려면 annotation 필요(`service.beta.kubernetes.io/aws-load-balancer-type: external`, `service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: instance`). 콘솔 배너에 Classic LB를 NLB로 마이그레이션할 수 있다는 안내와 "NLB 마이그레이션 마법사 시작" 버튼이 표시.
- **Service를 삭제하면 AWS 로드 밸런서도 함께 삭제된다**(슬라이드 68). 실습 후 정리는 콘솔에서 LB를 따로 지우는 것이 아니라 Service 삭제. (영상에는 없고 일반적 참고: 로드 밸런서는 시간당 비용이 발생하므로 실습 후 Service를 삭제해 두는 습관이 좋음.)
- EXTERNAL-IP 비교(슬라이드 67): MetalLB 없는 온프레미스 VM = 아무것도 없을 때 `<pending>` / MetalLB 사용 = 내가 제공한 IP 풀에서 IP 할당 / GKE = 로드 밸런서의 IP 주소(캡처 34.22.111.121) / EKS = 로드 밸런서가 실제 장착되므로 **ELB DNS 주소**(Elastic Load Balancer).
- 실습 환경 메모: AWS 서울 리전의 EC2에 이름 dev-cluster-de…인 t3.medium 3대(EKS 워커)가 실행 중, 접속용 t2.micro(kevin-apm) 인스턴스에서 EC2 Instance Connect 터미널로 접속해 kubectl 실행. kube-system에는 `aws-node`(Pod 네트워크 VPC CNI), `coredns`(클러스터 내부 이름 풀이), `kube-proxy`(Service 트래픽 전달 규칙)만 떠 있다. 영상에서 강사는 replicas를 3으로 바꾸겠다고 했으나 vi 화면에는 `replicas: 1`이 보이고 `:q!`로 저장 없이 종료 — 이후 `kubectl scale`로 3개로 늘림. 처음 Pod 1개 → scale 후 3개가 서로 다른 노드(Pod IP 192.168.55.175 / 192.168.90.105 / 192.168.14.73)에 분산. `expose deploy ...` 옵션: `--name=nginx-svc`(서비스 이름), `--port=80`(service가 받는 포트), `--target-port=80`(nginxdemos/hello가 쓰는 포트), `--type=LoadBalancer`(클라우드 로드 밸런서를 요청하는 타입).
- 자료에서 STT 오류로 NodePort 값이 일부 불명확하게 표기됨(그림의 예시값 32001 등). 실제 확인값은 `80:30104/TCP`.

---

## Step 19. Service type: Ingress (NGINX Ingress Controller)

### [목적]
Ingress Controller(NGINX)를 설치하고, 하나의 진입점에서 URL path·host 기준으로 여러 Service로 라우팅한다.

### [이론 설명]
- Ingress는 엄밀히는 "Service 타입"이 아니지만 외부 노출 지점을 제공하므로 Service 계열 오브젝트로 함께 다룬다(강사). **Ingress object**는 클러스터 외부 HTTP 및 HTTPS **경로**를 서비스에 노출하고 트래픽 규칙(어디로 보낼지 룰)을 정의("경로"를 꼭 기억 — 강사 강조). Ingress object는 일반적으로 로드 밸런서를 통해 수신 규칙·요청을 이행하는 **Ingress Controller**를 사용하며, 이것이 Ingress 사용의 **전제 조건**이므로 **Ingress 오브젝트를 만들기 전에 Controller부터 설치**해야 한다(Controller 없이 Ingress만 만들면 동작하지 않음). Controller 예: NGINX Controller(이 강의 사용), Envoy Controller, Traefik Ingress Controller, EKS는 AWS Load Balancer Controller(ALB/NLB 연동, 이전 클립 내용).
- **왜 Ingress인가**: NodePort·LoadBalancer로도 외부 노출은 되지만 서비스마다 로드 밸런서를 붙이면 로드 밸런서가 100개 필요한 상황에서는 100개를 써야 해 비효율적(로드 밸런서가 나쁘다는 뜻이 아니라 개수가 너무 많은 것이 문제 — 강사). Ingress object와 Controller를 쓰면 **"서비스당 로드 밸런서 하나"에서 "Ingress당 로드 밸런서 하나"로 전환하고 여러 서비스로 라우팅**할 수 있으며 트래픽은 경로 기반 라우팅으로 적절한 Service에 전달 — 강사: MSA 구조에 최적.
- **L7·TLS·스마트 라우터**: Ingress는 L7(애플리케이션 계층)에서 http/https 서비스를 지원. HTTPS에는 인증서(TLS)가 필요하며 인증서를 Secret 오브젝트에 넣고 Ingress에서 그 Secret을 참조하는 방법이 있다(Secret은 아직 배우기 전이라 개념만 언급). Ingress는 실제로 서비스 유형이 아니라 여러 서비스 앞에 있는 **"스마트 라우터"**, 즉 클러스터의 진입점 역할. 경로 기반 예: `fastcampus.com/inst-docker`·`/inst-k8s`·`/inst-aws`·`/inst-mlops`처럼 경로로 나누거나, `a.fastcampus.com`/`b.fastcampus.com`처럼 서브도메인(호스트)으로 나눌 수 있으며 이런 내용을 Ingress 오브젝트 옵션으로 지정.
- 트래픽 흐름(슬라이드): Internet(external traffic) → Ingress Controller → Ingress(routing rule) → one or more Services → one or more web APP Pods → container. 역할 분담: Ingress = 단일 접점과 서비스 라우팅, Service = Pod 로드밸런싱, Pod = 비즈니스 로직(App) 처리. 강사 설명: 클라이언트 요청을 Ingress controller가 받음 → Ingress 라우팅 룰에 따라 Service 선택 → 그 Service에 연결된 Pod.
- 기능: path 기반 라우팅, host(name based virtual hosting) 기반 라우팅, TLS(HTTPS, Secret 사용). **Ingress를 쓰려면 만들어야 하는 오브젝트 4가지**: ① Ingress Controller ② Ingress 오브젝트 ③ 백엔드 Service ④ 애플리케이션을 제공하는 Pod(구성 순서 ①→④로 트래픽이 들어감).
- Ingress YAML 핵심(공식 문서 예제 minimal-ingress 기반 — 강사: 문법보다 들여쓰기로 표현되는 종속 관계를 헷갈리기 쉬워 자신도 공식 문서에서 기본 틀을 가져와 수정): `apiVersion: networking.k8s.io/v1`(v1이 정식·안정 버전, beta가 붙은 버전은 현재 버전에서는 거의 맞지 않으므로 `kubectl api-resources`로 꼭 확인), `kind: Ingress`, `metadata.name`, `annotations`(`rewrite-target: /` — 주소 뒤에 슬래시를 기본으로 붙여 다음 페이지(경로)를 지정하겠다는 의도), `spec.ingressClassName`(Controller 설치 후 만들어지는 IngressClass 이름 — 이 실습에서는 `nginx`), `rules.http.paths`(규칙 기반 경로 접근, HTTPS가 있으면 따로 구분; paths에 여러 경로 가능), `path`, `pathType: Prefix`(`/`로 나뉜 URL 경로의 접두사 일치), `backend.service.name/port.number`(트래픽을 보낼 Service 이름과 그 service가 노출한 포트), `rules.host`(`cloud.fastcampus.com`처럼 서브 페이지 이름을 다는 이름 기반 가상 호스팅, LAB3).
- Bare metal 클러스터용 매니페스트 사용 시 Controller Service가 NodePort 타입으로 30000번대 포트(80:31858, 443:30349 등 환경별 값)를 사용 → `<NodeIP>:<80 NodePort>`로 접속. 설치 안내 페이지(kubernetes.github.io/ingress-nginx/deploy)에서 AWS·구글 등 환경 중 이 실습 환경은 VM 기반이라 **Bare metal clusters** 항목을 선택해 안내된 주소를 그대로 복사해 실행.

### [사용한 CLI]
1) Ingress Controller 설치 (ingress-nginx controller-v1.8.2, baremetal)
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/baremetal/deploy.yaml
# namespace ingress-nginx, RBAC, ConfigMap, Service(ingress-nginx-controller NodePort),
# Deployment, Job(admission create/patch), IngressClass nginx, ValidatingWebhookConfiguration 생성

kubectl get all -n ingress-nginx
# controller Pod Running, admission Job Pod Completed, service/ingress-nginx-controller NodePort 80:31858/TCP,443:30349/TCP
```

2) 기본 Ingress YAML 형식 (공식 문서)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minimal-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx-example
  rules:
  - http:
      paths:
      - path: /testpath
        pathType: Prefix
        backend:
          service:
            name: test
            port:
              number: 80
```

3) LAB1: 단일 Ingress
```yaml
# hello-app.yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello-app-pod
  labels:
    app: hello
spec:
  containers:
  - name: hello-container
    image: dbgurum/ingress:hi
    args:
    - "-text=Hello, Fastcampus."
---
apiVersion: v1
kind: Service
metadata:
  name: hello-app-svc
spec:
  selector:
    app: hello
  ports:
  - port: 5678
```
```yaml
# hello-ing.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: http-hello
  annotations:
    ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /hello-app
        pathType: Prefix
        backend:
          service:
            name: hello-app-svc
            port:
              number: 5678
```
```bash
mkdir ing && cd $_
vi hello-app.yaml
kubectl apply -f hello-app.yaml
kubectl get po,svc -o wide | grep hello
vi hello-ing.yaml
kubectl apply -f hello-ing.yaml
kubectl get ing
kubectl describe ingress http-hello          # Address, Path /hello-app, Backends hello-app-svc:5678
curl 192.168.56.101:31858/hello-app          # Hello, Fastcampus.
```

4) LAB2: path 2개 (/hello, /welcome)
```bash
kubectl delete -f hello-ing.yaml
kubectl delete -f hello-app.yaml
```
```yaml
# hello-welcome-app.yaml (hello-pod은 hello-app.yaml과 유사하게 label app: hello, text "Hello, fastcampus.")
apiVersion: v1
kind: Pod
metadata:
  name: welcome-pod
  labels:
    app: welcome
spec:
  containers:
  - image: dbgurum/ingress:hi
    name: welcome-contianer
    args:
    - "-text=Welcome, fastcampus."
---
apiVersion: v1
kind: Service
metadata:
  name: hello-svc
spec:
  selector:
    app: hello
  ports:
  - port: 5678
---
apiVersion: v1
kind: Service
metadata:
  name: welcome-svc
spec:
  selector:
    app: welcome
  ports:
  - port: 5678
```
```yaml
# hello-welcome-ing.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hello-welcome
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /hello
        pathType: Prefix
        backend:
          service:
            name: hello-svc
            port:
              number: 5678
      - path: /welcome
        pathType: Prefix
        backend:
          service:
            name: welcome-svc
            port:
              number: 5678
```
```bash
kubectl apply -f hello-welcome-app.yaml
kubectl apply -f hello-welcome-ing.yaml
kubectl get ing -o wide | grep hello
kubectl describe ingress hello-welcome
curl 192.168.56.101:31858/hello       # Hello, fastcampus.
curl 192.168.56.101:31858/welcome     # Welcome, fastcampus.
kubectl delete -f hello-welcome-app.yaml
kubectl delete -f hello-welcome-ing.yaml
```

5) LAB3: host(도메인) 기반 라우팅
- Pod 4개(svc-pod-1/2: label `app: svc`, cloud-pod-1/2: label `app: cloud`), Service svc-page / cloud-page(port 5678).
```yaml
# fastcampus-app.yaml 일부 (svc-pod-2 / svc-page 예, 나머지는 같은 형식)
---
apiVersion: v1
kind: Pod
metadata:
  name: svc-pod-2
  labels:
    app: svc
spec:
  containers:
  - name: svc2-container
    image: dbgurum/ingress:hi
    args:
    - "-text=This is the SERVICE page of fastcampus.k8s. -2-"
---
apiVersion: v1
kind: Service
metadata:
  name: svc-page
spec:
  selector:
    app: svc
  ports:
  - port: 5678
```
```yaml
# fastcampus-ing.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: fastcampus-http
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: svc.fastcampus.k8s
    http:
      paths:
      - pathType: Prefix
        path: /
        backend:
          service:
            name: svc-page
            port:
              number: 5678
  - host: cloud.fastcampus.k8s
    http:
      paths:
      - pathType: Prefix
        path: /
        backend:
          service:
            name: cloud-page
            port:
              number: 5678
```
```bash
vi fastcampus-app.yaml
vi fastcampus-ing.yaml
kubectl apply -f fastcampus-app.yaml
kubectl apply -f fastcampus-ing.yaml
kubectl get po,svc -o wide | grep svc-
kubectl get po,svc -o wide | grep cloud-
kubectl get ing                          # HOSTS 2개
kubectl describe ing fastcampus-http

# DNS 등록 없이 Host 헤더로 테스트
curl http://192.168.56.101:31858 -H "Host: svc.fastcampus.k8s"      # SERVICE page -1- / -2- 번갈아 응답
curl http://192.168.56.101:31858 -H "Host: cloud.fastcampus.k8s"    # CLOUD page -1- / -2-
```

6) 문제 해결: Ingress apply 시 admission webhook 오류
```bash
kubectl apply -f fastcampus-ing.yaml
# Error from server (InternalError): ... failed calling webhook "validate.nginx.ingress.kubernetes.io": ... i/o timeout

# [solution] 자료의 해결책: 검증 webhook 설정 삭제
kubectl delete validatingwebhookconfiguration ingress-nginx-admission
```

### [확인 방법/주의점]
- Ingress Controller Service의 80 NodePort(예 31858)를 확인하고 `curl <NodeIP>:<NodePort>/<path>`로 접근. **80번에 매핑된 NodePort 번호를 따로 기록해 두고** 이후 curl 접속에 계속 사용(강사). NodePort 값은 설치할 때마다/환경마다 다르다(자료 내 다른 화면은 80:31391, 443:31384 표기 — 자기 환경의 출력값 사용). 접속 형식: `curl [Ingress가 받은 IP]:[Controller Service의 80번 NodePort]/[Ingress에 정한 path]` 예) `192.168.56.101:31858/hello-app`.
- 설치 확인(`kubectl get all -n ingress-nginx`): admission Pod들은 `Completed`, `ingress-nginx-controller` Pod는 `Running`(처음 ContainerCreating)이어야 하며 Service `ingress-nginx-controller`는 NodePort 타입으로 80번·443번에 각각 노드포트 할당.
- `kubectl get ing`의 ADDRESS가 비어 있을 수 있으며(처음에는 비어 있다가 잠시 후 192.168.56.101 표시) **IP가 나올 때까지 기다려야 하고 get 결과만 보면 안 되므로 반드시 `describe ingress <이름>`으로 확인**(강사): Address가 나타나야 하고, Ingress가 전달하는 경로와 Backends에 들어 있는 Service·IP가 에러 없이 연결돼 있어야 한다. `describe`에서 Backends/Rules/Events 확인.
- LAB1 요점: `hello-app-pod`(이미지 `dbgurum/ingress:hi`, "Hello, Fastcampus." 출력 웹 앱)와 Service `hello-app-svc`(port 5678)는 **Pod label(`app: hello`)과 Service selector가 같아야** 연결(슬라이드에서 강사가 두 곳을 동그라미 표시). Ingress는 공식 문서 코드를 가져와 이름을 `http-hello`로 바꾸고 `ingressClassName: nginx`, `path: /hello-app`, backend `hello-app-svc:5678`. **host를 지정하지 않으므로 특정 도메인 없이 Ingress가 받은 IP 주소로 접속**. 강사: 개념은 어렵지 않지만 Ingress를 만드는 문법이 조금 복잡. (YAML은 슬라이드 77 기준으로 옮김.) LAB2: LAB1이 주소(path) 하나였다면 이번엔 주소 2개 = 서비스 2개(각각 Pod 1개 이상 가능) — `/hello`는 hello-svc로, `/welcome`은 welcome-svc로. **같은 IP:포트(192.168.56.101:31858)에 경로만 달라도** Ingress 룰에 따라 서로 다른 Service로 전달. 실습 후 Pod·Service·Ingress를 모두 삭제. 화면의 컨테이너 이름은 `welcome-contianer`(오타) 그대로 표기.
- host 기반 테스트는 DNS 없이 `-H "Host: ..."`로 가능: 호스트 이름(svc.fastcampus.k8s)은 실제 DNS에 등록된 것이 아니므로 IP로 직접 접속하며 Host 헤더를 포함해 요청하고, Ingress controller가 Host 헤더를 보고 어느 서비스로 보낼지 결정. LAB3(공식 문서의 name based virtual hosting): `svc.fastcampus.k8s` → svc-page(뒤에 svc Pod 2개), `cloud.fastcampus.k8s` → cloud-page(뒤에 cloud Pod 2개). 두 규칙 모두 path `/`, pathType Prefix. 앞선 LAB과 달리 rules에 `host`가 추가되고 describe에서 host별로 나뉘어 각 host의 `/` 아래 엔드포인트(Pod IP) 2개씩이 백엔드로 연결. 같은 Host로 반복 요청하면 `-1-`/`-2-` 페이지가 섞여 응답(Ingress가 호스트로 Service를 고르고 Service가 뒤의 Pod 2개로 로드밸런싱). 강사: 한 페이지짜리·두 페이지짜리·호스트 가상 호스팅까지 다뤘고 응용은 공식 문서를 보며 확장해 볼 것. 각 클립은 개론 → 구조 → 실습 순서이므로 구조 이해가 가장 중요.
- webhook 오류 해결책은 admission 검증을 제거하는 방식이므로 운영 환경에서는 원인(네트워크/webhook 호출 실패)을 먼저 점검해야 한다(자료는 실습 환경에서 삭제로 해결). **강사 코멘트(슬라이드 87)**: Ingress를 apply할 때 간혹 webhook 에러가 발생하는 경우가 있어(강사도 경험, 많이들 겪는 듯) 해결법을 슬라이드로 추가. 오류의 핵심은 Ingress 생성 시 검증용 웹훅(`ingress-nginx-admission`) 호출이 **시간 초과(`dial tcp 10.110.114.9:443: i/o timeout`)로 실패**하는 것. 해결: 해당 `validatingwebhookconfiguration`을 삭제한 뒤(`validatingwebhookconfiguration.admissionregistration.k8s.io "ingress-nginx-admission" deleted`) 다시 Ingress를 apply. (웹훅 = 오브젝트 생성 전에 검증을 요청하는 호출이며 삭제하면 그 검증 단계가 없어지므로 학습 환경에서의 임시 해결로 이해.)
- 6장 마무리(강사): Pod를 위한 네트워크 서비스와 다양한 기능을 살펴봤으며 Service 타입을 다양하게 활용해 보고 프로젝트에 어떤 서비스 방식이 유용한지 구조적으로 해석해 볼 것.
- Ingress 사용 전 반드시 Ingress Controller가 설치되어 Running이어야 하며, `ingressClassName`이 설치된 IngressClass(`nginx`)와 일치해야 한다.
