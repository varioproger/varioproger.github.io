---
title: "부록 A. 용어집"
parent: "부록"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 1
---

# 부록 A. 용어집

> **🎮 게임 서버 개발자에게** — 새 분야의 용어가 어렵게 느껴지는 이유는 단어가 많아서가 아니라 **같은 말이 다른 층위를 가리켜서**다. "namespace"는 리눅스 커널 기능이기도 하고 쿠버네티스의 이름 범위이기도 하며, "controller"는 오브젝트가 아니라 그 오브젝트를 읽는 프로그램이다. C++에서 `class`(타입 선언), 그 `instance`(메모리 위 객체), `std::thread`(커널 태스크)를 구분하는 습관을 그대로 쓰면 된다. 이 부록은 본문에 나온 핵심 용어를 **선언 / 프로그램 / 커널 기능** 중 어느 쪽인지와 함께 한 줄로 정리하고, 그 개념을 다룬 장을 가리킨다.
>
> **🎯 실무에서 이 부록이 필요한 순간**
> - 장애 채팅방에서 "CNI가 이상한 것 같아", "kubelet 로그 봐"라는 말을 들었는데 그것이 무엇인지 즉시 떠올라야 한다.
> - 문서가 `Ingress`와 `IngressController`, `CRI`와 `OCI`를 섞어 쓰는데 어느 층을 말하는지 모르겠다.
> - 같은 단어(namespace, runtime, controller)가 나올 때 어떤 층인지 가려내야 한다.

## 코어 — 이것만은 100%

> **한 문장:** 낯선 용어는 먼저 "선언(오브젝트·스펙) / 실행 프로그램 / 커널 기능" 셋 중 어디에 속하는지 분류하면 대부분 풀린다.

1. **선언 ≠ 프로그램 ≠ 커널 결과** — Deployment, Ingress, NetworkPolicy, PVC는 *기록*이고, 컨트롤러·IngressController·CNI·CSI 드라이버·kubelet·kube-proxy는 *그 기록을 읽고 행동하는 프로그램*이며, 그 끝에는 프로세스·cgroup·mount·iptables 규칙 같은 *커널 기능*이 있다.
2. **이름이 비슷한 쌍을 구분한다** — Ingress / IngressController, CRI / OCI / CNI / CSI(모두 인터페이스 규약), PV / PVC, `ingress-nginx` / `nginx-ingress`(서로 다른 프로젝트).
3. **같은 단어, 다른 층** — namespace(커널의 8종 격리 기능 vs 쿠버네티스 이름 범위), runtime(containerd/CRI 층 vs runc/OCI 층), Service(API 오브젝트이지 서버 프로세스 하나가 아님).

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 부록의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `class` 선언과 그 인스턴스 | 오브젝트(선언)와 실행 중인 상태 | 정의와 실체가 다르다 | 쿠버네티스는 컨트롤러가 끊임없이 선언에 실체를 맞추므로, 실체를 손으로 바꿔도 되돌려질 수 있다 |
| 인터페이스(순수 가상 클래스)와 구현 | CRI/OCI/CNI/CSI와 containerd·runc·Calico·EBS 드라이버 | 규약과 구현을 분리한다 | 규약은 프로그램이 아니라 API 약속이다. "CRI가 죽었다"가 아니라 구현(containerd)이 죽는다 |
| `epoll` 이벤트 루프의 상태 테이블 | Informer의 로컬 캐시와 워크큐 | 이벤트를 받아 상태를 갱신하고 큐에 쌓는다 | 이벤트를 놓쳐도 "현재 상태 vs 목표 상태"를 다시 비교해 따라잡는다(레벨 트리거) |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `Ingress`와 `IngressController` 중 프로그램은 어느 쪽일까?
> 2. `CRI`는 프로그램일까, 규약일까?
> 3. "namespace"가 두 가지 뜻으로 쓰이는 이유는 무엇일까?
>
> **처리법:** 🛠 실습 `kubectl api-resources`, `kubectl get pods -n kube-system`, `lsns` → 바로 실행 · 🗺 관계도 선언 → 프로그램 → 커널 기능 · 📦 카드로 이름이 비슷한 쌍, 같은 단어 다른 층

### 이 부록에서 배우는 것

- 선언 / 프로그램 / 커널 기능 분류법
- 1부·2부·3부 핵심 용어 한 줄 정의와 해당 장
- 이름이 비슷해 혼동하기 쉬운 쌍

---

## 용어 분류법과 혼동 쌍

### A.1 이름이 비슷한 쌍과 같은 단어 다른 층

**한 줄 요약:** 규약(인터페이스)과 구현, 선언과 프로그램, 커널 기능과 API 범위를 구분한다.

| 혼동하기 쉬운 쌍 | 구분 |
|---|---|
| Ingress / IngressController | Ingress는 라우팅 의도를 담은 API 리소스(데이터), IngressController는 그것을 읽어 리버스 프록시 설정을 만들고 실제 요청을 프록시하는 프로그램. 컨트롤러가 없으면 `ADDRESS`가 비어 있다 ([28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md)) |
| `ingress-nginx` / `nginx-ingress` | 커뮤니티 프로젝트(`nginx.ingress.kubernetes.io/...`)와 F5/NGINX Inc. 프로젝트(`nginx.org/...`)는 다른 프로젝트 ([28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md)) |
| CRI / OCI / CNI / CSI | CRI = kubelet ↔ 컨테이너 런타임 gRPC 인터페이스, OCI = 이미지·런타임 규격, CNI = 컨테이너 네트워크 연결 규약, CSI = 스토리지 드라이버 규약. 모두 프로그램이 아니라 약속이다 ([12장](../2부-컨테이너-커널-기능과-Docker/12-OCI-표준과-런타임.md), [23장](../3부-쿠버네티스-구성-요소/23-kubelet과-CRI.md), [26장](../3부-쿠버네티스-구성-요소/26-쿠버네티스-네트워크-모델과-CNI.md), [29장](../3부-쿠버네티스-구성-요소/29-스토리지.md)) |
| PV / PVC | PV는 공급된 실제 스토리지의 API 표현, PVC는 소비자의 요청 ([29장](../3부-쿠버네티스-구성-요소/29-스토리지.md)) |
| namespace (커널) / Namespace (쿠버네티스) | 커널의 8종 격리 기능(PID, net, mnt 등)과, API 객체의 이름·관리 범위. 쿠버네티스 Namespace가 완전한 보안 경계는 아니다 ([9장](../2부-컨테이너-커널-기능과-Docker/09-네임스페이스.md), [24장](../3부-쿠버네티스-구성-요소/24-오브젝트-모델과-워크로드.md)) |
| `dnsPolicy: Default` | 이름과 달리 쿠버네티스 기본값이 아니다. 기본값은 `ClusterFirst` ([28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md)) |
| Service | 일반적으로 별도 서버 프로세스가 아니라 API 객체이며, 실제 전달은 kube-proxy가 구성한 커널 규칙이 한다 ([27장](../3부-쿠버네티스-구성-요소/27-Service와-kube-proxy.md)) |

## 1부. 리눅스 OS 구성 요소

### A.2 커널·프로세스·메모리·I/O

**한 줄 요약:** 컨테이너는 이 커널 기능 위의 프로세스다.

| 용어 | 영문 | 한 줄 정의 | 장 |
|---|---|---|---|
| 시스템 콜 | system call | 유저 모드 프로그램이 커널에 명시적으로 요청하는 유일한 길. 비싸고, 실패 시 -1과 `errno` | [1장](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md) |
| 태스크 | task | 커널이 프로세스와 스레드를 구분하지 않고 `task_struct` 하나로 다루는 스케줄링 단위 | [1장](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md) |
| D 상태 | uninterruptible sleep | 인터럽트 불가능한 대기(주로 디스크 I/O, NFS). `kill -9`로도 안 죽고 load average에 포함 | [1장](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md) |
| 좀비 | zombie (Z) | 종료했지만 부모가 `wait()`로 회수하지 않은 프로세스 | [2장](../1부-리눅스-OS-구성-요소/02-프로세스.md) |
| PID 1 함정 | PID 1 signal trap | 컨테이너의 PID 1은 핸들러 없는 시그널을 커널이 무시해 SIGTERM에 무반응. 핸들러 등록이나 `tini`로 해결 | [3장](../1부-리눅스-OS-구성-요소/03-시그널.md) |
| SIGTERM / SIGKILL | - | 정상 종료 요청(15) / 잡을 수도 무시할 수도 없는 강제 종료(9). 종료 코드 143 / 137 | [3장](../1부-리눅스-OS-구성-요소/03-시그널.md) |
| OOM killer | OOM killer | 메모리 부족 시 `oom_score`가 높은 프로세스를 죽이는 커널 기능. cgroup 한도 초과 시에도 동작 | [4장](../1부-리눅스-OS-구성-요소/04-메모리.md) |
| 파일 디스크립터 | file descriptor (fd) | 파일, 소켓, 파이프를 모두 가리키는 정수. "모든 것은 파일" | [5장](../1부-리눅스-OS-구성-요소/05-파일시스템과-IO.md) |
| `/proc` | procfs | 커널 상태를 파일처럼 읽게 하는 가상 파일시스템. `ps`·`top`·`free`·`lsof`가 이를 읽는다 | [1장](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md), [8장](../1부-리눅스-OS-구성-요소/08-진단-도구.md) |
| conntrack | connection tracking | NAT 연결 추적 테이블. Docker·쿠버네티스 네트워킹과 UDP DNS 경쟁 조건의 배경 | [6장](../1부-리눅스-OS-구성-요소/06-네트워크-스택.md), [27장](../3부-쿠버네티스-구성-요소/27-Service와-kube-proxy.md) |

## 2부. 컨테이너 커널 기능과 Docker

### A.3 격리·자원·이미지·런타임·네트워크

**한 줄 요약:** namespace는 보이는 범위, cgroup은 사용량, 레이어는 파일, 런타임은 이를 조립하는 프로그램이다.

| 용어 | 영문 | 한 줄 정의 | 장 |
|---|---|---|---|
| 네임스페이스 | Linux namespace | 프로세스가 보는 PID·네트워크·마운트 등을 격리하는 커널 기능(8종). `clone`/`unshare`/`setns`로 생성·진입 | [9장](../2부-컨테이너-커널-기능과-Docker/09-네임스페이스.md) |
| cgroup | control group | 프로세스 묶음의 CPU·메모리·PID 수 사용을 측정·제한하는 커널 기능. v2는 `cpu.max`, `memory.max` | [10장](../2부-컨테이너-커널-기능과-Docker/10-cgroup.md) |
| 스로틀링 | CPU throttling | cgroup CPU 쿼터를 다 쓰면 다음 주기까지 컨테이너 전체가 대기. `cpu.stat`의 `nr_throttled` | [10장](../2부-컨테이너-커널-기능과-Docker/10-cgroup.md) |
| overlayfs | overlayfs | 읽기 전용 이미지 레이어 위에 쓰기 레이어(upperdir)를 겹쳐 하나의 루트로 보이게 하는 파일시스템 | [11장](../2부-컨테이너-커널-기능과-Docker/11-이미지-레이어-overlayfs.md) |
| 이미지 레이어 | image layer | 이미지를 이루는 변하지 않는 파일 변경분. 컨테이너 쓰기 레이어는 컨테이너와 함께 사라진다 | [11장](../2부-컨테이너-커널-기능과-Docker/11-이미지-레이어-overlayfs.md) |
| OCI | Open Container Initiative | 이미지·런타임·배포 규격. 프로그램이 아니라 표준 | [12장](../2부-컨테이너-커널-기능과-Docker/12-OCI-표준과-런타임.md) |
| runc | runc | OCI 런타임 규격의 구현체. 리눅스 프로세스를 실제로 실행 | [12장](../2부-컨테이너-커널-기능과-Docker/12-OCI-표준과-런타임.md) |
| containerd | containerd | 이미지 pull, 스냅샷, 컨테이너 수명을 맡는 독립 런타임 계층. dockerd와 kubelet(CRI)이 모두 쓴다 | [13장](../2부-컨테이너-커널-기능과-Docker/13-Docker-아키텍처.md) |
| dockerd | Docker Engine daemon | Docker CLI 요청을 받는 데몬. 컨테이너 실행 자체는 containerd에 위임 | [13장](../2부-컨테이너-커널-기능과-Docker/13-Docker-아키텍처.md) |
| 바인드 마운트 / tmpfs | bind mount / tmpfs | 호스트 경로를 컨테이너 경로로 연결 / 메모리 기반 파일시스템 | [14장](../2부-컨테이너-커널-기능과-Docker/14-볼륨-바인드마운트-tmpfs.md) |
| veth pair / bridge | virtual ethernet pair / bridge | 한쪽은 컨테이너 netns, 한쪽은 호스트 브리지(`docker0`)에 연결되는 가상 케이블 / 가상 스위치 | [16장](../2부-컨테이너-커널-기능과-Docker/16-Docker-네트워크.md) |
| DNAT / docker-proxy | destination NAT | `-p`로 게시한 포트를 컨테이너 IP:포트로 바꾸는 iptables 규칙 / 보조 프록시 프로세스 | [16장](../2부-컨테이너-커널-기능과-Docker/16-Docker-네트워크.md) |
| capability / seccomp | capabilities / seccomp | root 권한을 잘게 나눈 권한 단위 / 허용 시스템 콜 필터 | [17장](../2부-컨테이너-커널-기능과-Docker/17-컨테이너를-손으로-만들기.md) |

## 3부. 쿠버네티스 구성 요소

### A.4 컨트롤 플레인과 노드

**한 줄 요약:** 오브젝트를 저장하는 곳(API 서버, etcd)과 읽고 행동하는 곳(컨트롤러, 스케줄러, kubelet)이 분리되어 있다.

| 용어 | 영문 | 한 줄 정의 | 장 |
|---|---|---|---|
| 조정 루프 | reconcile loop | 관찰 → 비교(diff) → 조치를 반복해 현재 상태를 목표 상태에 맞추는 컨트롤러의 기본 동작 | [18장](../3부-쿠버네티스-구성-요소/18-클러스터-아키텍처-총론.md), [22장](../3부-쿠버네티스-구성-요소/22-컨트롤러-매니저.md) |
| 레벨 트리거 | level-triggered | "무엇이 바뀌었나"가 아니라 "지금 상태가 어떤가"로 판단. 이벤트 유실에 강하다 | [18장](../3부-쿠버네티스-구성-요소/18-클러스터-아키텍처-총론.md) |
| kube-apiserver | kube-apiserver | 모든 요청의 단일 진입점. 인증 → 인가 → 어드미션 → etcd 저장 | [19장](../3부-쿠버네티스-구성-요소/19-kube-apiserver.md) |
| etcd | etcd | 모든 오브젝트를 저장하는 분산 키-값 저장소. Raft 합의, MVCC 리비전 | [20장](../3부-쿠버네티스-구성-요소/20-etcd.md) |
| kube-scheduler | kube-scheduler | 노드 미배정 Pod의 노드를 정한다(Filter → Score). 이미지를 실행하지 않는다 | [21장](../3부-쿠버네티스-구성-요소/21-kube-scheduler.md) |
| Informer / 워크큐 | Informer / Workqueue | API 서버를 watch해 로컬 캐시를 유지하고 변경 키를 중복 제거 큐에 쌓는 client-go 메커니즘 | [22장](../3부-쿠버네티스-구성-요소/22-컨트롤러-매니저.md) |
| 리더 선출 | leader election | 복제본 중 하나만 활성화. Lease 오브젝트 기반 | [22장](../3부-쿠버네티스-구성-요소/22-컨트롤러-매니저.md) |
| kubelet | kubelet | 자기 노드의 Pod를 실행·보고하는 노드 에이전트. CRI로 런타임에 요청 | [23장](../3부-쿠버네티스-구성-요소/23-kubelet과-CRI.md) |
| CRI | Container Runtime Interface | kubelet과 컨테이너 런타임 사이의 gRPC 인터페이스 | [23장](../3부-쿠버네티스-구성-요소/23-kubelet과-CRI.md) |

### A.5 워크로드·네트워크·스토리지·보안

**한 줄 요약:** 선언은 Pod를 사이에 두고 서비스·저장소·권한으로 이어진다.

| 용어 | 영문 | 한 줄 정의 | 장 |
|---|---|---|---|
| Pod | Pod | 함께 실행되는 컨테이너 묶음. 같은 노드, 같은 네트워크 네임스페이스·IP·포트 공간 | [24장](../3부-쿠버네티스-구성-요소/24-오브젝트-모델과-워크로드.md) |
| QoS 클래스 | QoS class | requests/limits로 정해지는 Guaranteed/Burstable/BestEffort. OOM 시 `oom_score_adj`와 축출 순서 | [25장](../3부-쿠버네티스-구성-요소/25-Pod-생명주기와-리소스.md) |
| CNI / IPAM | Container Network Interface / IP Address Management | Pod 네트워크 연결 규약(ADD/DEL/CHECK) / Pod IP 할당 서브 플러그인 | [26장](../3부-쿠버네티스-구성-요소/26-쿠버네티스-네트워크-모델과-CNI.md) |
| EndpointSlice | EndpointSlice | Service 백엔드 Pod 목록을 샤딩해 담는 오브젝트(구 Endpoints 대체) | [27장](../3부-쿠버네티스-구성-요소/27-Service와-kube-proxy.md) |
| kube-proxy | kube-proxy | Service/EndpointSlice를 보고 노드의 iptables/IPVS/nftables 규칙을 프로그래밍하는 데몬 | [27장](../3부-쿠버네티스-구성-요소/27-Service와-kube-proxy.md) |
| CoreDNS / ndots | CoreDNS / ndots | 플러그인 체인 기반 클러스터 DNS 서버 / search를 시도하기 전 필요한 점의 개수 기준(기본 5) | [28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md) |
| Gateway API | Gateway API | GatewayClass/Gateway/HTTPRoute로 역할을 분리한 L7 라우팅 API | [28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md) |
| NetworkPolicy | NetworkPolicy | Pod 간 허용 트래픽 스펙. 시행은 CNI가 한다 | [28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md) |
| PV / PVC / StorageClass | - | 스토리지 조각 / 요청 / 종류. 바인딩은 1:1 배타적 | [29장](../3부-쿠버네티스-구성-요소/29-스토리지.md) |
| CSI | Container Storage Interface | 스토리지 드라이버 규약. 컨트롤러 플러그인과 노드 플러그인으로 구성 | [29장](../3부-쿠버네티스-구성-요소/29-스토리지.md) |
| ConfigMap / Secret | - | 설정 / 민감 값. 환경변수(고정) 또는 볼륨(갱신)으로 주입. Secret의 base64는 암호화가 아님 | [30장](../3부-쿠버네티스-구성-요소/30-설정-보안.md) |
| RBAC | Role-Based Access Control | Role/ClusterRole(권한) + Binding(연결). 허용 규칙만 더하는 모델 | [30장](../3부-쿠버네티스-구성-요소/30-설정-보안.md) |
| securityContext / PSA | securityContext / Pod Security Admission | Pod의 uid·capability·seccomp·읽기 전용 FS 설정 / 네임스페이스 라벨로 프로파일을 강제하는 어드미션 | [30장](../3부-쿠버네티스-구성-요소/30-설정-보안.md) |
| 블래스트 레이디어스 | blast radius | 침해되었을 때 피해가 번지는 범위. 층마다 좁히는 보안 사고방식 | [30장](../3부-쿠버네티스-구성-요소/30-설정-보안.md) |

## 실무 적용

### 체크리스트

- [ ] 모르는 용어를 만나면 선언 / 프로그램 / 커널 기능 중 어디인지 먼저 분류한다.
- [ ] CRI·OCI·CNI·CSI가 프로그램이 아니라 규약임을 설명할 수 있다.
- [ ] Ingress와 IngressController, PV와 PVC, 커널 namespace와 쿠버네티스 Namespace를 구분한다.
- [ ] `dnsPolicy: Default`가 기본값이 아님을 기억한다.
- [ ] 장애 보고에서 "kubelet", "containerd", "CNI"가 어느 층의 어떤 프로그램인지 말할 수 있다.

### 시나리오로 확인하기

1. **상황:** 동료가 "Ingress를 배포했는데 안 먹어"라고 한다. `kubectl get ingress`의 `ADDRESS`가 비어 있다.
   **질문:** Ingress와 IngressController 중 무엇을 의심하나?

   <details markdown="1"><summary>답 확인</summary>

   Ingress는 설정 데이터일 뿐이고 실제로 요청을 받는 것은 IngressController라는 프로그램이다. `ADDRESS`가 비어 있으면 아직 어떤 컨트롤러도 이 오브젝트를 처리하지 않은 것이므로 컨트롤러 설치 여부와 `ingressClassName`/`IngressClass` 일치를 본다. → A.1, [28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md)

   </details>

2. **상황:** 문서에 "CRI 버그로 Pod가 안 뜬다"는 말이 있다.
   **질문:** CRI 자체가 죽었다는 뜻인가?

   <details markdown="1"><summary>답 확인</summary>

   CRI는 kubelet과 컨테이너 런타임 사이의 gRPC 인터페이스(규약)라서 "죽는" 대상이 아니다. 문제는 그 규약을 구현한 containerd 같은 런타임 쪽이나 kubelet 쪽에 있다. → A.1, [23장](../3부-쿠버네티스-구성-요소/23-kubelet과-CRI.md)

   </details>

3. **상황:** 보안 리뷰어가 "namespace를 나눴으니 격리됐다"고 한다.
   **질문:** 어느 namespace를 말하는가?

   <details markdown="1"><summary>답 확인</summary>

   쿠버네티스 Namespace는 API 객체의 이름·정책 적용 범위일 뿐 네트워크나 커널을 완전히 격리하지 않는다. 격리는 NetworkPolicy, securityContext, Pod Security Admission 등 각 경계의 정책을 구성해야 하고, 커널의 namespace는 프로세스가 보는 범위를 나누는 별개의 기능이다. → A.1, [30장](../3부-쿠버네티스-구성-요소/30-설정-보안.md)

   </details>

---

📖 출처: Kubernetes_Internals_Network_Guide/부록/B-용어집.md · kubernetes-qustion-book/01_기초/04_내부_원리.md, 02_심화/10_보안과_확장_구조.md · kubernetes-textbook-main/03-애플리케이션-노출과-데이터/11-인그레스와-외부-트래픽-라우팅.md · 본 시리즈 각 장의 근거 원천

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[분류] 선언(오브젝트) 예: ____ , ____ , ____
       프로그램 예: ____ , ____ , ____ , ____
       커널 기능 예: ____ , ____ , ____ , ____

[규약 4종] CRI = ____ ↔ 런타임 / OCI = ____ 규격 / CNI = ____ / CSI = ____
[쌍] Ingress(____) vs IngressController(____) / PV(____) vs PVC(____)
[같은 단어 다른 층] namespace: 커널 ____종 vs 쿠버네티스 ____
```

### 2. 인출 질문

1. 선언 / 프로그램 / 커널 기능의 예를 각각 세 개씩 들어 보라.

   <details markdown="1"><summary>답 확인</summary>

   선언: Deployment, Ingress, NetworkPolicy, PVC 등. 프로그램: 컨트롤러, 스케줄러, kubelet, kube-proxy, IngressController, CNI/CSI 드라이버, CoreDNS 등. 커널 기능: namespace, cgroup, overlayfs, iptables/netfilter, mount, capability/seccomp 등. → 코어 1

   </details>

2. CRI, OCI, CNI, CSI는 각각 무엇을 정하는 규약인가?

   <details markdown="1"><summary>답 확인</summary>

   CRI는 kubelet과 컨테이너 런타임 사이의 gRPC 인터페이스, OCI는 이미지·런타임·배포 규격, CNI는 컨테이너 네트워크 연결(ADD/DEL/CHECK), CSI는 스토리지 드라이버 인터페이스다. 모두 프로그램이 아니라 약속이다. → A.1

   </details>

3. `ingress-nginx`와 `nginx-ingress`는 같은 프로젝트인가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. 커뮤니티가 관리하는 `ingress-nginx`(애노테이션 접두사 `nginx.ingress.kubernetes.io/`)와 F5/NGINX Inc.의 `nginx-ingress`(`nginx.org/`)는 다른 프로젝트이며 문서를 찾을 때 어느 쪽인지 확인해야 한다. → A.1

   </details>

4. D 상태와 좀비의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   D는 디스크 I/O 등을 기다리는 인터럽트 불가능한 대기로 `kill -9`가 안 듣고 load average에 포함된다. 좀비(Z)는 이미 종료했지만 부모가 `wait()`로 회수하지 않아 프로세스 항목만 남은 상태다. → A.2

   </details>

### 3. 기억 고리

- **C++ 유추:** 순수 가상 클래스(인터페이스)와 구현 = CRI/CNI/CSI와 containerd/Calico/EBS 드라이버 ⚠️ 규약 자체는 프로세스로 존재하지 않으므로 "CRI를 재시작한다"는 말은 성립하지 않는다.
- **비유:** 용어 분류 = 도서관 분류표(설계도 / 일하는 사람 / 기계). ⚠️ 비유가 깨지는 지점: 쿠버네티스의 "일하는 사람"은 설계도를 계속 감시하며 실물을 맞추므로 한 번 만들고 끝나지 않는다.
- **묶음(3의 법칙):** 선언 / 프로그램 / 커널 기능, 규약 4종(CRI·OCI·CNI·CSI), 혼동 쌍 3개(Ingress, PV/PVC, namespace).
- **대칭·순서:** 선언(기록) → 프로그램(조정) → 커널 기능(결과).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Ingress, IngressController, 그리고 nginx 프로세스의 관계"를 선언 / 프로그램 / 커널 기능으로 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "CRI·OCI·CNI·CSI가 각각 어느 두 요소 사이의 약속인가"를 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "Service는 서버 프로세스다" vs B "Service는 API 오브젝트이고 전달은 커널 규칙이 한다" — 양쪽을 번갈아 변호해 보세요. (kube-proxy, iptables/IPVS, EndpointSlice를 근거로)
- **AI 역할 반전:** "내가 용어 10개를 선언/프로그램/커널 기능으로 분류할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

다음: [부록 B. 진단 명령어 모음](B-진단-명령어-모음.md)
