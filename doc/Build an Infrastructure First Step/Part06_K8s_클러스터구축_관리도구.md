---
title: "Part 06. Kubernetes 클러스터 구축 및 관리도구"
parent: "Docker·K8s 인프라 구축 실습 순서"
nav_order: 6
---

# Part 06. Kubernetes 클러스터 구축 및 관리도구

> 출처: DevOps 초격자 Docker & Kubernetes feat. Amazon EKS (Kubernetes Part2) - CH01 컨테이너 서비스 개요 / CH02 Kubernetes Cluster 환경 구축 / CH03 Kubernetes 관리도구 (자료 053~063)
> 구성: 실제 구축 순서대로 Step 번호를 부여해 재배열함. (2차 보강: 원본 PDF 11개(053~063)의 한글 본문(슬라이드 설명 + 강사 STT 요약)을 pdftotext로 추출해 [이론 설명]을 재작성하고 강사 주의점/오류 해결을 추가함. PDF 내 삽입 이미지 자체는 시각 확인하지 못했고, 이미지에 포함된 텍스트(슬라이드 캡션 등)는 PDF 본문에 옮겨 적힌 범위만 반영함. 모든 페이지 텍스트를 읽었으며 못 읽은 페이지는 없음.)

## 전체 순서 요약

| Step | 내용 | 비고 |
|---|---|---|
| 0 | 컨테이너 서비스 / Kubernetes 오케스트레이션 개념 | 이론 |
| 1 | VirtualBox VM 생성 + Ubuntu 22.04 설치 + K8s 사전 OS 설정 + Docker/containerd + kubeadm/kubelet/kubectl 설치 | master 1대 기준 후 복제 |
| 2 | 3-node 클러스터 `kubeadm init` + kubectl 설정 + `kubeadm join` + Calico(CNI) | master + node1, node2 |
| 3 | 노드 확장 (node3 추가, join token) | |
| 4 | (비교 데모) Amazon EKS 구성 (eksctl) | |
| 5 | Kubernetes Dashboard (secure) | 모니터링/Observability 개념 포함 |
| 6 | Prometheus & Grafana | |
| 7 | KubeShark (API 트래픽 모니터링) | |
| 8 | Portainer | |
| 9 | k9s | |

---

## Step 0. 컨테이너 서비스와 Kubernetes 오케스트레이션 개념

### [목적]
Kubernetes 클러스터를 구축하기 전에 "왜 컨테이너 서비스/오케스트레이션이 필요한가"와 Kubernetes가 제공하는 핵심 기능을 이해한다.

### [이론 설명]

**1) 컨테이너 서비스란 (CH01-02, 강사 설명 기준)**
- **정의**: 컨테이너는 애플리케이션을 언제든 실행할 수 있도록 필요한 모든 요소(소스코드, 구성요소, 종속성 등)를 하나의 런타임 환경으로 **패키징한 논리적 공간**이다. 한마디로 애플리케이션과 종속 항목을 묶어 실행하게 해 주는, 운영체제를 가상화한 **"경량의 격리된 프로세스"**. 누가 "컨테이너가 뭐예요?"라고 물으면 "프로세스다"라고 답하면 된다고 강사가 강조한다. "패키징한 공간"이라는 표현이 포인트.
- 별칭/특성: **microVM**이라고도 함, 운영체제 수준의 가상화 제공, 독립성을 가지므로 다른 컨테이너에 영향을 주지 않는 **stateless** 환경. (VM은 OS 전체를 가상화해 무겁지만 컨테이너는 호스트 커널을 공유하며 프로세스를 격리하므로 훨씬 가볍고 빠름.)
- **이미지 기반 실행**: OCI(컨테이너 이미지 표준 규격)에 따라 원하는 OS 환경, 애플리케이션 환경, 여러 패키지를 설치해 하나의 이미지로 만들고, 그 이미지를 런타임에서 동작시키는 것이 컨테이너. 핵심 작업은 `docker build`로 만든 이미지 또는 Docker Hub 같은 저장소의 이미지로 컨테이너를 만드는 것.
- **효과**: (1) 프로세스 수준의 속도로 빠르게 run, 이미지만 있으면 한 개든 100개든 동시에 실행하고 필요 없으면 인스턴트하게 내릴 수 있음. (2) 컨테이너 자체의 애플리케이션 환경만 관리하면 되므로 서버/하드웨어 관리 인력·비용 절감. (3) 이미지를 만드는 팀 / 테스트 팀 / 배포 팀 / CI·CD 파이프라인 구축 팀처럼 업무를 세분화할 수 있어 **DevOps workflow에 최적**.
- **활용 사례(슬라이드 [컨테이너화 사용 사례] 3가지)**: Airbnb, Google, Netflix, 당근마켓, 엔씨소프트, 삼성전자 헬스케어, 타다, 토스 등이 사용 중.
  - **클라우드 마이그레이션**: 보통 리프트 앤 시프트 방식. 기존(온프레미스) 애플리케이션을 컨테이너 이미지로 캡슐화해 클라우드(EKS, ECS 등)에 올리는 것이 모더나이즈 애플리케이션의 가장 기본.
  - **마이크로서비스 아키텍처(MSA)**: MSA 기술이 반드시 컨테이너만은 아니고 서버리스인 경우도 있으나, 이 강의는 MSA에 컨테이너를 접목하며 "MSA 구조에는 컨테이너가 적합하다"는 입장.
  - **IoT 디바이스**: 컴퓨팅 자원이 제한적이고 수동 소프트웨어 업데이트가 복잡한 IoT 기기에 애플리케이션을 쉽게 배포/업데이트.
- **컨테이너 유형 (PID 1번으로 구분)**: 초기 컨테이너는 OS를 탑재한 시스템 컨테이너뿐이었고, 이를 발전시킨 것이 애플리케이션 컨테이너이며 Docker가 선두 주자.
  - **시스템 컨테이너**: HostOS 위에 Ubuntu 20.04 / CentOS 7 / RHEL 8 같은 배포판 이미지로 배포. 또 다른 VM 형태로, 내부에 다양한 애플리케이션/라이브러리/도구를 설치해 실행.
  - **애플리케이션 컨테이너**: 단일 애플리케이션 실행용(Nginx 1.23.1 / Python 3.10 / MySQL 8.0 등). 3-tier라면 frontend-backend-DB를 각각 개별 컨테이너로 실행해 연결.
  - **구분법**: 컨테이너 안에서 `ps`로 조회했을 때 해당 애플리케이션(예: Nginx)이 **PID 1**이면 그 애플리케이션 중심의 애플리케이션 컨테이너. (강의에서는 ps 화면 시연 없이 개념만 설명.)

**2) 컨테이너 오케스트레이션이란 (CH01-02)**
- 컨테이너를 **자동으로 관리하는 소프트웨어 기술**. 컨테이너마다 여러 마이크로서비스를 담을 수 있어 최신 클라우드 애플리케이션 개발에 최적이며, 배포/관리/확장/네트워킹을 자동화·정교하게 조정해 다수 컨테이너(MSA) 수동 관리에서 생기는 **인적 오류를 최소화**한다. 대표 도구: **Docker Swarm**, **Kubernetes**(오픈소스; 이 강의의 집중 대상).
- "관리의 복잡성을 줄여 주고 자동화하는 기술" = 4가지 관심사 (슬라이드 질문 / 강사 설명):

| 기능 | 슬라이드 질문 | 강사 설명 |
|---|---|---|
| 배포 관리 | 한정된 자원에 맞춰 컨테이너를 어느 노드에 최적으로 스케줄링할 것인가? | 어느 노드에 할당(예약)할지 정하는 것이 스케줄링. 오케스트레이션 도구의 스케줄러가 배포를 관리(자동/수동 모두 존재) |
| 제어 및 모니터링 | 실행 중인 여러 컨테이너의 상태를 어떻게 추적/관리할 것인가? | 현재 상태가 사용자가 원하는(desired) 상태와 같은지 계속 지켜봄(watching). 다르면 문제 있는 Pod를 버리고 새 Pod를 띄움 |
| 스케일링 | 변화하는 워크로드/사용량 증가에 어떻게 대응할 것인가? | 오토스케일링 기능 |
| 네트워킹 | 여러 컨테이너의 상호작용을 위한 연결은? | CNI(Container Network Interface) 기반 기술 + 오케스트레이션 도구 내부의 서비스 네트워킹 기술 (이후 학습). 슬라이드 판서 "CNI → S"는 판독이 불확실 |

**3) Kubernetes Orchestrations (CH01-03)**
- Kubernetes = 컨테이너화된 애플리케이션을 위한 **오케스트레이션 플랫폼**. 대규모 컨테이너 워크로드의 관리·구성을 자동화. **사용 목적은 "Desired state management"**: 모든 것이 자동은 아니지만, 사용자가 요청한 상태(Desired state)를 기본적으로 자동 추적·관리·스케일링하며, 현재 상태(Current state)와 다르면 문제 Pod를 버리고 새 Pod를 올리거나 규모를 확장해 원하는 상태를 유지한다.
- 6가지 오케스트레이션 기능:
  1. **Service discovery & Load Balancing**: 각 Pod에 단일 DNS 이름과 IP 할당(이름으로 찾고 IP로 식별; 강사는 클러스터 내부 DNS 서비스로 설명했으나 STT상 컴포넌트명은 불명확). 트래픽이 많으면 서비스 아래 여러 Pod로 자동 로드밸런싱. 예: 컨테이너 Pod 3개 + 서비스 1개에 **동일한 label**을 붙이면 자동으로 하나의 연결점이 생겨 부하 분산 = "DNS + 로드밸런싱 + 라벨 기반 동적 그룹". K8s 설치 시 기본 내장.
  2. **Automated rollouts and rollbacks**: 새 이미지로 새 Pod를 배포하며 기존 Pod와 교체(rollout). 배포 방식으로 롤링 업데이트, 블루-그린, 카나리 등이 있음(강사 언급). 실패 시 이전 상태로 되돌리는 rollback.
  3. **Self-healing**: Pod 상태 확인, 실패한 컨테이너 재시작. Pod 장애 시 상태 확인이 통과할 때까지 해당 Pod로 연결을 허용하지 않음(정상 Pod만 서비스에 연결). 강사 판서 "C/S ≠ D/S"(Current state ≠ Desired state = 복구가 필요한 상황).
  4. **Automatic Bin-packing**: 구성된 CPU/RAM 요구 사항에 따라 컨테이너를 효율적으로 할당해 리소스 활용도 최적화("상자(노드)에 짐(컨테이너)을 빈틈없이 채우기").
  5. **Storage orchestration**: 로컬/네트워크 스토리지, 퍼블릭 클라우드(CSP) 스토리지 등을 K8s 오브젝트에 Mount(볼륨 기술).
  6. **Secret and configuration management**: 컨테이너 이미지를 재구성하지 않고 내부 구성과 기밀 정보를 안전하게 저장/갱신. 이유: 이미지는 불변(읽기 전용)이라 환경값/기밀값을 이미지에 넣으면 값이 바뀔 때마다 이미지를 다시 빌드해야 하기 때문.
- **Kubernetes 설계 사상 5가지 (architecture keypoints)**: ① **선언적 구성 기반 배포 환경**(YAML로 Desired state 선언 -> Current state와 지속 비교/자동 복구) ② **기능 단위(object)의 분산**(Node, Deployment, ReplicaSet, Namespace 등 기능별 독립 구성요소를 Controller가 관리) ③ **클러스터 단위의 중앙 제어**(전체 물리 리소스를 클러스터로 추상화, Control plane 역할의 master node가 관리) ④ **동적 그룹화**(Label/Annotation을 Key-Value로 설정, 같은 라벨의 Pod들을 하나의 서비스와 연결해 부하분산) ⑤ **API 기반 상호작용**(구성요소들은 kube-apiserver를 통해서만 서로 접근).
- **kube-apiserver**: 모든 구성요소와 사용자(kubectl)가 거치는 정문이자 강사 표현으로 **"쿠버네티스의 뇌"**. 죽으면 모든 통신/명령이 먹지 않음. **6443 포트** 사용. (이후 API 트래픽 모니터링 도구도 사용 예정 -> Step 7 KubeShark.) 1챕터 마지막 슬라이드: "Now let's go! to the universe of kubernetes".

### [사용한 CLI]
(이 Step은 개념 설명으로 CLI 실습 없음. 컨테이너 PID 1 확인은 Part1(Docker)의 `ps` 사용 내용과 연계.)

### [확인 방법/주의점]
- 스스로 점검: 컨테이너와 VM의 차이, PID 1 의미, 오케스트레이션이 필요한 이유, Desired state vs Current state, kube-apiserver의 역할(6443).

---

## Step 1. Kubernetes 클러스터용 VM 환경 구성 (VirtualBox + Ubuntu 22.04)

### [목적]
Oracle VirtualBox에서 master VM 1대를 만들고, Kubernetes 설치에 필요한 OS 설정, container runtime(containerd), kubelet/kubeadm/kubectl 1.28을 설치한 뒤 이 VM을 복제하여 node1~node3를 만든다. (실습은 "제공된 VM 환경"을 사용하나, 구성 절차가 자료에 정리되어 있음)

### [이론 설명]
- **실습 계획**: 클러스터 구성 방법은 minikube 등 여러 가지이나, 이 강의는 실무에서 많이 쓰는 **kubeadm init**으로 3노드 클러스터(master 1 + worker 2)를 구성하고 예비 노드 1대(node3)로 add node(노드 추가)를 실습한다. 챕터 구성: 01 VM 환경 구성 / 02 3-node Cluster 초기화 / 03 Node 확장 / 04 Amazon EKS 데모(본격 EKS 실습은 Part 3). 온프레미스에서는 노드를 직접 추가하지만 클라우드에는 자동 확장 기능이 있다.
- **강사 강조**: 이 master VM을 **나중에 복제**하므로 설정을 놓치면 모든 노드에 같은 문제가 생긴다. 천천히 정확히 따라 할 것. VirtualBox는 공식 사이트에서 받아 설치(영상 시점 최신 7.0.12, 하이퍼바이저이므로 설치 후 재부팅 권장), Ubuntu 22.04 ISO도 웹에서 내려받아 사용.
- **VM 사양**: 이름 k8s-master, 종류 Linux / 버전 Ubuntu(64-bit) (**32비트가 표시되면 안 됨**). 노드별 폴더(master, node1 ...)를 미리 만들어 두면 복제 시 편함. 슬라이드: "K8s의 최소 요구 사양은 CPU*4, Memory*4GB" (공식 문서상 최소 2/4로 나오기도 하나 4/4 권장, PC 사양에 맞춰 조정 가능). **CPU 4, 메모리 4096MB**, 호스트 PC 메모리 **16GB 이상 권장**(8GB 노트북은 VM 메모리를 줄여야 해서 어려움). 디스크는 **최대 100GB 동적 할당**(처음부터 100GB를 차지하지 않고 확장 한도). 이미 완성된 디스크 이미지가 있으면 "기존 디스크 사용".
- **VM 설정**: 시스템 - CD-ROM으로 설치하므로 부팅 순서에서 **광디스크를 하드디스크보다 위로**. 디스플레이 - 기본값(VMSVGA). 그래픽 사양이 높은 노트북에서는 컨트롤러 조정이 필요할 수 있고, 재부팅 후 화면이 먹통이면 VMSVGA를 VBoxVGA로 바꿔 보라고 안내(STT 불분명, 대략 의미). 저장소 - Ubuntu 22.04 ISO를 가상 CD에 연결, 100GB 디스크 함께 표시 확인. 오디오/USB 미사용.
- **네트워크 어댑터 2개**: 어댑터1 **NAT**(10.0.2.15, VM이 호스트를 통해 인터넷 접속), 어댑터2 **호스트 전용(Host-only)**(VirtualBox 설치 시 생기는 어댑터, 호스트 PC와 VM들끼리만 통신하는 사설망 192.168.56.x). ping이 안 나가면 호스트(Windows/Mac) 방화벽을 임시로 끄거나 규칙을 구성해 보라고 안내.
- **Ubuntu 설치**: English / Install Ubuntu / Normal installation, 시간대 Seoul. 파티션은 직접 나누는 이유를 설명하나 **기본 설치로 가도 무방**하다고 여러 번 말함. 직접 나눌 경우 기본 EXT4 대신 쓰기가 더 빠른 **XFS** 권장. 영상 구성(100GB `/dev/sda`, New Partition Table): `/` Primary XFS 약 80GB, swap 약 8GB(만들지만 K8s에서는 비활성화), `/data1` 약 10GB(Ext, 필수 아님), `/data2`, `/boot` 약 500MB(커널 안정성용). 수치는 STT 오류가 섞여 있어 정확한 값은 교재 슬라이드를 따를 것(화면상 표는 판독 불가). 계정 student / 컴퓨터 이름 k8s-master. 설치 약 7~10분(OS 설치까지 총 약 15분), Ubuntu는 보안상 root 대신 일반 계정 사용 권장.
- **IP 계획**: Network(Wired) > IPv4 **Manual**로 호스트 전용 어댑터를 고정. master 192.168.56.100, node1 .101, node2 .102, node3 .103 / Netmask 255.255.255.0 / Gateway 192.168.56.2(VirtualBox 기본 게이트웨이 예시) / DNS 8.8.8.8. Apply 후 네트워크를 한 번 껐다 켜고 hostname이 k8s-master인지 확인. 확인 시 게이트웨이(호스트 PC 192.168.56.1)와 외부 8.8.8.8로 ping(apt 설치가 된다는 것 자체가 외부 통신 증거). Ubuntu 최소 이미지에는 ifconfig 등이 없어 `vim openssh-server net-tools`(필요 시 htop 등)를 설치. MobaXterm(Session > SSH, 세션을 k8s-master 등 이름으로 저장) 또는 PuTTY(Save까지 해야 재사용 가능)로 접속; node1~3 세션도 미리 생성(이후 수업은 모두 MobaXterm).
- **K8s 사전 요구 설정과 이유 (강사 설명)**:
  - **방화벽(ufw) 해제**: 쿠버네티스가 사용하는 포트가 매우 많아 실습에서는 해제(설치 후 필요한 포트만 열어도 무방).
  - **swap 비활성화**: 컨테이너는 프로세스이므로 메모리 부족 시 swap으로 밀려나 성능 저하/지연이 생기고 결국 교체 대상이 될 수 있음. "swap은 항상 off"가 쿠버네티스 설계 사상 중 하나이며 swap은 설치 오류의 흔한 원인. `swapoff -a`는 **일시적**(재부팅하면 /etc/fstab으로 다시 mount)이므로 fstab의 swap 줄을 `#` 주석 처리해야 영구 해제. `free`에서 Swap이 0이면 OK.
  - **NTP**: 여러 노드로 이루어진 클러스터는 노드 간 시간이 다르면 안 됨. ntp 설치/재시작 후 status(running)와 `ntpq -p`(외부 시간 서버 목록, 모든 노드가 같은 서버를 쓰면 시간 일치)로 확인.
  - **ip_forward=1**: Calico 등 CNI는 L3(IP) 라우팅으로 패킷을 전달하므로 커널 ip_forward가 기본값 0이면 안 됨. 0인 채 init하면 `[ERROR FileContent--proc-sys-net-ipv4-ip_forward]: /proc/sys/net/ipv4/ip_forward contents are not set to 1` 발생. 변경 후 `cat`으로 1 확인 필수.
  - **overlay / br_netfilter 모듈 + sysctl**: `modprobe`는 요청한 커널 모듈(의존 모듈 포함)을 커널에 등록하는 프로그램. overlay = 컨테이너 이미지 계층용 파일시스템, br_netfilter = 브리지 트래픽에 iptables 규칙 적용. `modules-load.d`에 적어 재부팅 후에도 로드. 이 파일들은 처음에 존재하지 않으므로 직접 만들며(강사는 교재 PDF 내용을 복사/붙여넣기), 마지막 `sudo sysctl --system`으로 두 sysctl 파일(99-kubernetes-cri.conf, k8s.conf)이 적용됐는지 확인.
- **Container runtime 선택과 주의 (슬라이드 표)**: Docker Engine(cri-dockerd) `unix:///var/run/cri-dockerd.sock` / containerd `unix:///var/run/containerd/containerd.sock` / CRI-O `unix:///var/run/crio/crio.sock`. **주의: Docker와 containerd가 모두 감지되면 Docker가 우선하며, 둘 이상의 런타임이 감지되면 kubeadm은 오류와 함께 종료**된다(Docker 18.09부터 containerd가 함께 제공되므로 Docker만 설치해도 둘 다 감지될 수 있음). 이 수업에서 **docker는 이미지 개발/테스트용, K8s의 주 컨테이너 런타임은 containerd**. 요즘은 containerd/CRI-O를 쓰는 경향이 늘었음. docker-ce Candidate는 `5:24.0.7-1~ubuntu.22.04~jammy`를 최신으로 설치. 설치 후 `docker version`에서 Client/Server가 모두 올라오는지 반드시 확인.
- **containerd 설정**: `containerd config default` 출력을 config.toml로 저장 후 `disabled_plugins`에 CRI가 들어 있지 않은지(빈 목록 `[]`) 확인 - 잘못되면 쿠버네티스 핵심인 kube-api-server(6443) 쪽 문제로 이어질 수 있다고 강사가 경고. **SystemdCgroup = true**: K8s는 커널 cgroup(리소스 제어 그룹)을 systemd로 관리하는 방식을 쓰는데 containerd 기본값은 false이므로 true로 변경, **변경 후 containerd 재시작 필수**. `usermod -aG docker student`는 sudo 없이 docker 사용, `systemctl enable docker`는 부팅 시 자동 시작. 이후 재부팅하고 새 터미널을 열어 `docker version`(sudo 없이 가능)과 `docker info`로 Cgroup Driver가 systemd인지 확인하라고 안내(`/etc/docker/daemon.json` 내용은 화면에 안 보임).
- **설치 도구 3종**: **kubelet**(각 노드에서 동작하며 컨테이너/Pod를 관리하는 데몬, 항상 실행 상태여야 함), **kubeadm**(클러스터 init, 업그레이드, 노드 join 관리 도구), **kubectl**(클러스터 조작용 명령줄 도구). 슬라이드 원본 예시는 1.29이나 1.29 신규 출시 상태에서 이 수업은 **1.28로 진행하고 뒤 챕터에서 1.29로 업그레이드하는 과정을 보여 줄 예정**이므로 명령의 v1.29를 v1.28로 바꾼다. 저장소 경로에 v1.28이 들어 있어 설치도 1.28 계열. 버전 미지정 시 Candidate(1.28.5) 설치, 특정 버전은 `패키지명=버전`(예: 1.28.3)으로 명시.
- **버전 표기**: v1.28.4 = Major(1, 제품 전체 수정 정보) / Minor(28, 새로운 기능) / Patch(4, 버그 수정/보안). 슬라이드 예시는 1.28.4, 실습은 1.28.5이므로 5로 바꿔 보면 된다(패치는 하루 사이에도 바뀜). 메이저 1의 아키텍처는 출시 이후 바뀌지 않았고 기능은 마이너 버전으로 추가된다. 클러스터가 없으므로 `kubectl version`의 `localhost:8080 refused`는 정상.
- **apt-mark hold**: 안 하면 apt 업데이트 시 신규 버전으로 자동 업그레이드될 수 있으므로 반드시 hold. kubelet은 `daemon-reload` -> `restart` -> `enable --now`로 즉시 시작 + 부팅 시 자동 시작.
- **복제 시 주의**: master 설정 완료 후 shutdown, VirtualBox 우클릭 > 복제(완전한 복제), 이름 k8s-node1(경로는 미리 만든 node1 디렉터리), **MAC 주소 정책 = "모든 네트워크 어댑터의 새 MAC 주소 생성"(안 바꾸면 안 된다고 강조; MAC 중복 시 네트워크 충돌)**. 사양이 부족하면 2대(node1, node2)만 해도 되며 add node는 데모로 관찰 가능. 강사는 복제 클립에서 node1만 같이 진행하고 node2, node3는 각자 진행하라고 안내. 복제 후 바꿔야 할 3가지: ① IP ② hostname ③ /etc/hosts의 127.0.1.1 줄 -> ping 테스트 후 reboot. 이 시점엔 node3를 켜지 않아도 됨.
- **노드 간 SSH 상호 접속(known_hosts)**: 클러스터 모든 노드끼리 서로 한 번씩 ssh 접속해 두어야 하며, 안 하면 다음 클립(init/join)에서 **SSH timeout 문제**가 생길 수 있다고 강조("간혹 ssh timeout 문제가 생기면 사전 연결 설정으로 해결"). 슬라이드 원문에 node2의 `ssh student@k8s-mster` 오타가 있음(k8s-master가 맞음).

### [사용한 CLI]

**1-1. VM 생성 (VirtualBox GUI 설정 요약)**
- 새로 만들기: 이름 k8s-master, 종류 Linux, 버전 Ubuntu(64-bit)
- 하드웨어: 메모리 4096MB, Processors 4
- 하드디스크: 100GB 신규 생성
- 디스플레이/스토리지: ISO(Ubuntu 22.04)를 CD에 마운트, 그래픽 컨트롤러 VMSVGA
- 네트워크: 어댑터1 NAT, 어댑터2 호스트 전용 어댑터(Host-only)
- Ubuntu 설치: English / Normal installation / Installation type = Something else (New Partition Table, `/dev/sda`) / Who are you: 이름 student, computer name k8s-master / 시간대 Seoul

**1-2. IP, hostname 설정 및 기본 패키지**
- Settings > Network(Wired) > IPv4 Manual: Address 192.168.56.100, Netmask 255.255.255.0, Gateway 192.168.56.2, DNS 8.8.8.8 (Apply 후 hostname k8s-master 확인)

```bash
# vim(편집기), openssh-server(MobaXterm/PuTTY SSH 접속), net-tools(ifconfig) 설치
sudo apt -y install vim openssh-server net-tools

# 확인: IP가 192.168.56.100 인지, 호스트 PC(192.168.56.1)와 외부(8.8.8.8)로 ping 되는지
ifconfig
ping 192.168.56.1
ping 8.8.8.8
```
- 이후 MobaXterm(Session > SSH, Remote host 192.168.56.100, user student) 또는 PuTTY로 접속해 작업.

**1-3. 방화벽/SWAP/NTP/ip_forward**
```bash
sudo apt -y update

# k8s 노드에서 ubuntu 방화벽 비활성화
sudo ufw disable        # Firewall stopped and disabled on system startup
sudo ufw status         # Status: inactive

# Pod 실행 시 SWAP 사용을 허용하지 않으므로 SWAP 끄기
sudo swapoff -a         # 즉시 swap 해제 (재부팅하면 다시 켜짐)
free                    # Swap 이 0 인지 확인

# 재부팅 후에도 swap 이 켜지지 않도록 /etc/fstab 의 swap 행을 주석 처리
sudo sed -i '/ swap / s/^/#/' /etc/fstab
# 또는 직접 편집
sudo vi /etc/fstab      # 예) #/swapfile           none swap sw 0 0

# NTP (시간 동기화)
sudo apt -y install ntp
sudo systemctl restart ntp
sudo systemctl status ntp   # running 확인
sudo ntpq -p                # 동기화 대상 서버 목록 확인

# IP 포워딩 활성화 (CNI(Calico)가 L3 라우팅에 필요)
sudo -i                     # 또는 sudo su -
echo '1' > /proc/sys/net/ipv4/ip_forward
cat /proc/sys/net/ipv4/ip_forward    # 1 이어야 함
```
- 설정하지 않으면 init 시 `[ERROR FileContent--proc-sys-net-ipv4-ip_forward]: /proc/sys/net/ipv4/ip_forward contents are not set to 1` 오류 발생.

**1-4. 커널 모듈 및 sysctl**
```bash
# containerd 용 container runtime 커널 모듈 설정
sudo cat <<EOF | sudo tee /etc/modules-load.d/containerd.conf
overlay
br_netfilter
EOF
sudo modprobe overlay
sudo modprobe br_netfilter

# 브리지 트래픽이 iptables 를 거치도록 sysctl 설정
sudo cat <<EOF | sudo tee /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward  =1
net.bridge.bridge-nf-call-ip6tables = 1
EOF

cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
br_netfilter
EOF

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
EOF

sudo sysctl --system    # 설정 적용
```
- `modprobe`: 커널 모듈 즉시 로드 / `modules-load.d`: 재부팅 시에도 자동 로드. (PDF에 sysctl 설정이 중복 기재되어 있고, `sudo sysctl --system` 적용 단계가 핵심)

**1-5. Docker 저장소 등록 및 docker-ce(containerd.io) 설치**
```bash
# k8s runtime 은 containerd, docker, CRI-O 등이 있으며 여기서는 containerd 사용
# apt 가 HTTPS 저장소를 사용할 수 있도록 필요한 패키지 설치
sudo apt-get update && sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common gnupg2

# Docker 공식 GPG 키 등록 (https://docs.docker.com/engine/install/ubuntu/)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Docker apt 저장소 추가
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update

# 설치 후보 버전 확인 (Candidate: 5:24.0.7-1~ubuntu.22.04~jammy)
apt-cache policy docker-ce

# docker-ce 와 containerd 설치
sudo apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo docker version     # Client/Server (Engine 24.0.7, containerd 1.6.26) 확인
```

**1-6. containerd 설정 (SystemdCgroup)**
```bash
# containerd 기본 설정 파일 생성
sudo sh -c "containerd config default > /etc/containerd/config.toml"
sudo vi /etc/containerd/config.toml
#   disabled_plugins = []        # [] 로 비어 있어야 CRI 플러그인 활성화 (kube-api-server 6443 통신 관련)

# cgroup driver 를 systemd 로 변경
sudo sed -i 's/ SystemdCgroup = false/ SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd.service

# docker 데몬 설정 및 서비스 등록
sudo vi /etc/docker/daemon.json
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo usermod -aG docker student        # student 가 sudo 없이 docker 사용
sudo systemctl daemon-reload
sudo systemctl enable docker
sudo systemctl restart docker
sudo systemctl status docker           # Active: active (running)
sudo systemctl status containerd       # containerd 도 active (running) 확인

# 재부팅 후 새 터미널에서 확인 (usermod 반영 -> sudo 없이 docker 사용 가능)
docker version                         # Client/Server 모두 출력되는지
docker info                            # Cgroup Driver: systemd 인지 확인
```
- (`/etc/docker/daemon.json` 의 구체 내용은 자료에 표시되지 않음.) `docker info` 에서 Cgroup Driver 가 systemd 인지 확인 가능.

**1-7. Kubernetes 패키지 저장소 등록 및 설치 (v1.28)**
```bash
# kubernetes 저장소 (1.28) - Docker 와 마찬가지로 GPG 키 + 저장소 등록 + apt update
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt update
sudo apt-cache policy kubeadm        # Candidate: 1.28.5-1.1 확인

sudo apt -y install kubelet kubeadm kubectl

# 버전 확인
kubeadm version
kubectl version [-o yaml]            # 서버 미구성 상태라 "localhost:8080 refused" 는 정상
kubelet --version

# 자동 업그레이드 방지 (hold) 및 kubelet 서비스 등록
sudo apt-mark hold kubelet kubeadm kubectl
sudo systemctl daemon-reload
sudo systemctl restart kubelet.service
sudo systemctl enable --now kubelet.service
```

**1-8. /etc/hosts 설정 후 VM 복제 및 node 설정**
```bash
# master 에서 hosts 파일 편집 후 종료 (worker node 로 복제하기 위해)
sudo vi /etc/hosts
```
```text
127.0.0.1  localhost
127.0.1.1  k8s-master
192.168.56.100 k8s-master
192.168.56.101 k8s-node1
192.168.56.102 k8s-node2
192.168.56.103 k8s-node3
```
```bash
sudo shutdown -h now
```
- VirtualBox에서 master VM 우클릭 > 복제(Clone): 이름 k8s-node1, **MAC 주소 정책은 "모든 네트워크 어댑터의 새 MAC 주소 생성"** (VM 간 MAC 중복 방지). node2, node3도 동일하게 복제 (node3는 실습에서 "add node" 용으로 나중에 시작).

복제된 각 노드(node1 예)에서 IP/hostname 변경:
```bash
# node 별로 IP 와 hostname 변경 (node1 예)
sudo hostnamectl set-hostname k8s-node1
sudo vi /etc/hosts     # 127.0.1.1  k8s-node1 로 변경, 나머지 행(master/node1~3 IP)은 유지
sudo systemctl restart network
sudo ifconfig          # IP가 192.168.56.101 인지 확인 (Network 설정에서 IP 변경 필요)
sudo ping 192.168.56.1
sudo ping 8.8.8.8
sudo reboot
```
- node2는 IP 192.168.56.102, node3는 192.168.56.103.

모든 노드 간 SSH 최초 접속(known_hosts 등록):
```bash
# cluster 의 각 Node 간 ssh 접속 테스트 (최초 접속 시 yes 로 known_hosts 등록)
student@k8s-master:~$ date
student@k8s-master:~$ ssh student@k8s-node1
student@k8s-master:~$ ssh student@k8s-node2
student@k8s-master:~$ cat .ssh/known_hosts

student@k8s-node1:~$ date
student@k8s-node1:~$ ssh student@k8s-node2
student@k8s-node1:~$ ssh student@k8s-master
student@k8s-node1:~$ cat .ssh/known_hosts     # ssh key 저장됨을 확인

student@k8s-node2:~$ date
student@k8s-node2:~$ ssh student@k8s-node1
student@k8s-node2:~$ ssh student@k8s-master   # 슬라이드 원문은 k8s-mster (오타)
student@k8s-node2:~$ cat .ssh/known_hosts
```

### [확인 방법/주의점]
- `free` 에서 Swap 이 0, `cat /proc/sys/net/ipv4/ip_forward` 결과가 1, `systemctl status containerd` / `docker` 가 active (running).
- containerd 의 `SystemdCgroup = true` 및 `disabled_plugins = []` 확인.
- kubeadm/kubelet/kubectl 버전이 모두 1.28.x 이며 hold 상태.
- 복제 후 **MAC 주소 재생성**, **hostname, IP, /etc/hosts의 127.0.1.1 행**을 노드마다 반드시 수정.
- 노드 간 ssh 최초 접속(known_hosts) 및 timeout 시 설정 점검. 메모리 부족 주의(호스트 PC 16GB 이상 권장).
- 주의: `kubectl version` 의 서버 연결 오류는 클러스터 init 전이라 정상.

- (강사 강조) 이 VM을 복제하므로 설정 누락은 모든 노드에 전파됨 -> 천천히 정확히 따라 할 것. VirtualBox 종류/버전은 Ubuntu 64-bit(32비트 불가).
- Docker 와 containerd 가 모두 감지되면 Docker 가 우선하고, 둘 이상의 런타임이 감지되면 kubeadm 이 오류와 함께 종료됨(슬라이드 주의 표). 이 수업에서 docker 는 이미지 개발/테스트용, K8s 런타임은 containerd.
- `disabled_plugins = []` (CRI 비활성 목록이 비어 있어야 함)가 잘못되면 kube-api-server(6443) 쪽 문제로 이어질 수 있음. SystemdCgroup 변경 후에는 containerd 재시작 필수, 재부팅 후 `docker info` 로 Cgroup Driver 확인.
- 재부팅하면 swapoff -a 가 풀리므로 fstab 의 swap 행 주석 처리 필수(swap 은 설치 오류의 흔한 원인).
- 복제 시 MAC 주소 정책 = "모든 네트워크 어댑터의 새 MAC 주소 생성"(안 바꾸면 안 됨). 복제 후 IP / hostname / /etc/hosts 의 127.0.1.1 3가지 변경.
- 노드 간 ssh 를 미리 한 번씩 접속해 두지 않으면 이후 init/join 단계에서 SSH timeout 문제가 생길 수 있음. (슬라이드 원문의 `k8s-mster` 는 오타)
- 화면 해상도/먹통 문제: 재부팅 후 화면이 안 나오면 그래픽 컨트롤러 VMSVGA -> VBoxVGA 변경 시도(STT 불명확). ping 이 안 나가면 호스트 PC 방화벽을 임시 해제하거나 규칙 구성.

---

## Step 2. 3-node Cluster 구성 (kubeadm init / join / Calico CNI)

### [목적]
master 1대에서 `kubeadm init` 으로 control plane을 초기화하고, node1, node2를 `kubeadm join` 으로 합류시킨 뒤, CNI(Calico)를 설치하여 모든 노드를 Ready 상태로 만든다. (node3는 Step 3에서 추가)

### [이론 설명]
- **kubeadm init (강사 설명)**: Kubernetes 클러스터를 엮는 초기화 작업. 컨트롤 플레인 역할의 master 노드에 API 서버, 스케줄러, etcd, 컨트롤러 매니저 같은 핵심 구성요소를 배포한다. 인증서(`/etc/kubernetes/pki`)와 kubeconfig(admin/kubelet/controller-manager/scheduler.conf)가 생성되고, 컨트롤 플레인 구성요소는 `/etc/kubernetes/manifests`의 YAML로 kubelet이 **static Pod**로 띄운다(kubelet = 모든 노드에 할당되는 "감시병" 같은 역할). 마지막에 CoreDNS, kube-proxy addon 적용. 컨트롤 플레인이 생기면 **join 토큰(조인 키)**으로 node1, node2 ...를 붙일 수 있고 **조인 키는 언제든 다시 발급 가능**. 이번 클립에서는 master + node1, node2만 구성하고 node3는 다음 클립(노드 확장)용으로 남겨 둔다.
- **강사 주의점 (중요)**: init이 가장 중요한 작업이며 앞의 사전 작업(swap 해제, containerd 등)이 기반이다. 놓친 내용이 있으면 중간에 error가 나는데 **당황하지 말고 error 메시지를 꼼꼼히 읽을 것(대부분 힌트가 있음)**. **init은 그대로 다시 실행할 수 없으므로** 문제가 생기면 `kubeadm reset`으로 제거한 뒤 다시 수행. 실행 전 모든 노드의 `date`(시간 동기화)와 `free`(Swap 0)를 점검(Kubernetes는 기본적으로 swap이 켜진 상태를 허용하지 않음). 영상에서도 재부팅 후 swap이 다시 켜져 있어(Swap 7812092) `sudo swapoff -a`를 수행하고 containerd가 active(running)인지 확인했다.
- **init 중 멈춘 것처럼 보일 때**: pre-flight에서 이미지를 내려받는 시간이 걸릴 뿐이다(K8s 구성요소도 모두 컨테이너이므로). 사전에 `kubeadm config images pull`로 받아 두면 수월. 출력에 매니페스트(YAML)/인증서 위치가 들어 있으니 메모해 두면 도움이 된다. `[wait-control-plane]`은 최대 4m0s 소요.
- **주요 옵션**:
  - `--pod-network-cidr=10.96.0.0/12`: Pod 네트워크 IP 범위. 설정하면 control plane이 모든 노드에 CIDR을 자동 할당. `/12`면 사설 IP 약 100만 개(CIDR = 클래스와 무관하게 "IP/접두사 길이"로 대역 표기, 앞 12비트가 네트워크). 이 대역을 실제로 나눠 할당하는 것이 CNI(Calico)이며, Calico가 100만 개를 slice해 노드별로 할당하고 노드가 다 쓰면 다시 할당한다.
  - `--service-cidr`: Pod IP와 Service IP 대역을 나누고 싶을 때 별도 지정(예: 한쪽 100만 개, 다른 쪽 6만~10만 개). 이번 실습은 교육용이라 100만 개면 Pod와 Service에 충분하다고 보고 **지정하지 않음**(나누려면 두 옵션을 모두 지정). 둘 다 생략하면 기본값 설정(강사가 보여 주기 위해 명시적으로 지정).
  - `--apiserver-advertise-address=192.168.56.100`: API 서버가 "내 주소는 이것"이라고 클러스터의 모든 리소스에 알리는 IP. 미지정 시 기본 네트워크 인터페이스 사용, 여기서는 Master node IP를 지정(NAT 어댑터가 아닌 host-only 대역을 쓰도록 지정하는 의미).
  - (참고, 강의 외 보충) kubeadm의 기본 Service CIDR도 10.96.0.0/12이므로, 이 실습처럼 Pod CIDR을 같은 값으로 주고 service-cidr을 생략하면 실제로는 두 대역이 겹칠 수 있다. 운영에서는 두 대역을 겹치지 않게 지정할 것.
- **init 직후 NotReady / coredns Pending은 정상**: 노드의 Ready 상태는 Calico 같은 CNI가 올라가야 등록되고, CoreDNS도 네트워크 구성요소라 Calico가 올라가야 Pending이 풀린다. 이 시점엔 가장 중요한 요소(API 서버 6443, etcd 2379/2380, kubelet 10250, kube-proxy, scheduler 10259, controller-manager 10257)가 netstat에 올라와 있는지만 확인.
- **kubeadm join**: init 결과로 출력된 조인 명령을 복사해 각 노드에 붙여 넣되 **앞에 반드시 sudo**. 타임아웃 없이 바로 끝나면 성공(TLS Bootstrap -> CSR 전송 -> kubelet에 보안 연결 정보 통보). 이후 master에서 `kubectl get node`: node1, node2가 등록되지만 아직 NotReady, `get po -A`에서 새 노드의 kube-proxy가 ContainerCreating -> Running(kube-proxy = 각 노드에서 내부 서비스 노출/연결). 슬라이드의 토큰·해시는 예시 값이며 실제로는 자신의 init 출력 값을 사용.
- **CNI(Container Network Interface) 개념 (슬라이드 44~46)**: 컨테이너 네트워킹을 제어하는 Plugin을 만들기 위한 표준(컨테이너 런타임과 오케스트레이터 사이 네트워크 계층 구현이 제각각 발전하지 않도록 공통 인터페이스 제공). K8s는 Pod 간 통신에 CNI를 사용하며, 기본 제공 자체 plugin 'kubenet'은 기능이 매우 제한적이라 3rd-party(Flannel, **Calico**, Weavenet 등)를 사용. **필요성**: 노드가 여러 개이면 각 노드의 container network IP 대역이 같아 Pod들이 같은 IP를 받을 가능성이 높고, IP가 달라도 그 Pod가 어느 노드에 있는지 알 수 없다(자기 노드 Pod IP만 식별 가능) -> 모든 worker node에 중복되지 않는 subnet을 부여할 CNI가 필요(Pod IP를 이해하지 못하면 노드 간 Pod 연결이 불가해 오케스트레이션의 의미가 없어짐). **구성 시 동작**: CNI는 Pod 생성~삭제 시마다 호출되는 API의 규격/인터페이스를 정의, 브리지 인터페이스 생성 + 컨테이너 네트워크 대역 분할 + 라우팅 테이블 생성, Pod는 CNI가 제공하는 고유 IP를 가지며 클러스터 내 모든 Pod는 Service 없이도 서로 통신 가능. Provider는 VXLAN, IP-in-IP(캡슐화 모델) 또는 BGP(비캡슐화 모델)로 네트워크 패브릭 구현. CNI 종류별 비교는 다음 챕터에서 설명 예정.
- **Calico 설치**: YAML을 직접 작성하지 않고 Calico가 제공하는 최신 YAML(calico.yaml, 4천 줄 이상, vi에서 4779행까지 확인)을 받아 `kubectl apply`. 붙어 있는 노드 3개(master, node1, node2)에 calico-node가 각각 배치된다. 적용 직후 calico-node `Init:0/3`, calico-kube-controllers `Pending`이며 이미지를 받아 설정하느라 시간이 걸린다(영상은 대기 구간을 편집). Calico가 올라오면 coredns도 자동으로 초기화되어 Running.
- **성공 기준**: `get po -A`의 모든 Pod가 READY 1/1(Pod 안 컨테이너 1개 중 1개 준비) Running 유지, 모든 노드 Ready. `kubectl cluster-info`와 `kubeadm config print init-defaults`로 기본 설정(bindPort 6443, criSocket containerd, clusterName kubernetes, certificatesDir /etc/kubernetes/pki, imageRepository registry.k8s.io) 확인 가능.

### [사용한 CLI]

**2-1. 사전 점검 (모든 노드: master, node1, node2)**
```bash
date                       # 노드 간 시간 확인
free                       # Swap 이 0 인지 확인 (재부팅 후 swap 이 다시 켜졌다면 아래 실행)
sudo swapoff -a
sudo systemctl status containerd.service   # active (running)
```

**2-2. kubeadm init (master)**
```bash
sudo kubeadm init --pod-network-cidr=10.96.0.0/12 --apiserver-advertise-address=192.168.56.100
```
- init 출력(요약): `[init] Using Kubernetes version: v1.28.5` -> preflight(이미지 pull; 사전에 `kubeadm config images pull` 로 받아둘 수 있음) -> certs -> kubeconfig(admin.conf, kubelet.conf, controller-manager.conf, scheduler.conf) -> etcd, kube-apiserver, kube-controller-manager, kube-scheduler static Pod manifest 생성 -> kubelet 시작 -> addons(CoreDNS, kube-proxy) -> `Your Kubernetes control-plane has initialized successfully!`
- init 도중 오류(swap, containerd 등)가 나면 원인을 수정한 후 `kubeadm reset` 으로 초기화하고 다시 init.
```bash
sudo kubeadm reset            # init 실패/재시도 시 초기화
kubeadm config images pull    # (선택) 필요한 이미지를 미리 pull
```

**2-3. 일반 사용자(student)가 kubectl 사용하도록 설정**
```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
# root 로 사용할 경우:  export KUBECONFIG=/etc/kubernetes/admin.conf
```

**2-4. kubectl 자동완성 및 alias**
```bash
sudo apt install bash-completion -y
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc
complete -F __start_kubectl k
vi .bashrc
```
```bash
# ~/.bashrc 에 추가
alias k=kubectl
alias kg='kubectl get'
alias kc='kubectl create'
alias ka='kubectl apply'
alias kr='kubectl run'
alias kd='kubectl delete'
complete -F __start_kubectl k
```
```bash
source .bashrc
```

**2-5. init 직후 상태 확인**
```bash
# 컨트롤 플레인 구성요소 리스닝 포트 확인 (etcd 2379/2380, kube-apiserver 6443, kubelet 10250, kube-proxy, scheduler 10259, controller-manager 10257 등)
sudo netstat -ntlp | grep LISTEN

kubectl get node       # k8s-master NotReady control-plane (CNI 미설치)
kubectl get po -A      # -A = --all-namespaces; coredns Pending, 나머지 Running
```

**2-6. worker 노드 합류 (node1, node2 각각 sudo 로 실행)**
```bash
# init 출력 마지막에 표시된 join 명령 (토큰/해시는 환경마다 다름)
sudo kubeadm join 192.168.56.100:6443 --token <TOKEN> \
    --discovery-token-ca-cert-hash sha256:<HASH>
```
- 성공 메시지: `This node has joined the cluster: ... Run 'kubectl get nodes' on the control-plane to see this node join the cluster.`
- master 에서 `kubectl get node` -> node1, node2 모두 NotReady, `kubectl get po -A` -> 새 kube-proxy 가 ContainerCreating -> Running.

**2-7. Calico(CNI) 설치 (master)**
```bash
curl -O https://raw.githubusercontent.com/projectcalico/calico/v3.25.0/manifests/calico.yaml
ls                               # calico.yaml 확인
vi calico.yaml                   # 내용 확인 (약 4779 라인 규모의 큰 YAML; 자료에서는 열어서 확인만 함)
kubectl apply -f calico.yaml
```
- 생성되는 리소스: poddisruptionbudget, serviceaccount, configmap(calico-config), CRD들(bgpconfigurations 등), daemonset `calico-node`, deployment `calico-kube-controllers`.
```bash
kubectl get po -A        # calico-node: Init:0/3 -> Running, coredns Pending -> Running
```

**2-8. 최종 확인**
```bash
kubectl get po -A        # 모든 Pod READY 1/1, Running
kubectl get node         # master/node1/node2 모두 Ready (v1.28.5)
kubectl cluster-info     # Kubernetes control plane / CoreDNS 주소 (https://192.168.56.100:6443)
kubeadm config print init-defaults   # kubeadm init 기본값 확인 (bindPort 6443, criSocket unix:///var/run/containerd/containerd.sock, clusterName kubernetes, certificatesDir /etc/kubernetes/pki, imageRepository registry.k8s.io 등)
```

### [확인 방법/주의점]
- init 전: swap 0, containerd active, ip_forward 1 필수. 오류 시 `kubeadm reset` 후 재시도.
- `kubeadm init` 출력의 **join 명령(토큰, hash)을 기록**해 둘 것 (토큰은 만료됨 -> Step 3의 token 재발급).
- init 직후 `NotReady` / `coredns Pending` 은 CNI 미설치로 인한 정상 상태.
- Calico Pod가 Running이 될 때까지 몇 분 소요 (Init:0/3 상태 확인).
- 최종 성공 기준: `kubectl get node` 전부 Ready, `kubectl get po -A` 전부 1/1 Running.

- (강사 강조) init 은 그대로 재실행 불가 -> 실패 시 error 메시지를 꼼꼼히 읽고(대부분 힌트 포함) 원인 수정 후 `kubeadm reset` -> 재실행. 이미지 pull 로 멈춘 것처럼 보여도 정상(사전에 `kubeadm config images pull` 가능).
- 재부팅 후 swap 이 다시 켜져 있을 수 있으므로 init/join 전 모든 노드에서 `date`, `free`(Swap 0), `sudo swapoff -a`, containerd active 확인. 모든 노드의 시간 동기화 확인.
- join 명령은 반드시 `sudo` 로 실행. 슬라이드의 토큰/해시는 예시이므로 자신의 init 출력 값 사용.
- init 직후 NotReady / coredns Pending 은 정상(CNI 미설치). Calico 적용 후 calico-node Init:0/3 -> Running 까지 시간이 걸림(대기 구간).
- (참고, 강의 외) Pod CIDR 과 Service CIDR 기본값이 겹칠 수 있음 - 위 [이론 설명] 보충 참조.

---

## Step 3. Kubernetes Cluster Node 확장 (node3 추가)

### [목적]
기존 3-node(master + node1, node2) 클러스터에 새 worker 노드(k8s-node3)를 join token으로 추가한다.

### [이론 설명]
- **Node란 (슬라이드 + 강사 판서 "Host")**: Node는 동작 중인 Pod를 유지시키고 Kubernetes container runtime 환경을 제공하는 **호스트 역할**이며 모든 Node 상에서 동작한다. container를 실행하는 모든 worker node에는 **kubelet, kube-proxy, container runtime**이 실행된다.
  - **kubelet**: container 실행 요청을 수신하고 필요한 리소스를 관리하며 로컬 노드에서 이를 감시("감시병").
  - **kube-proxy**: 네트워크에 container를 노출하기 위한 네트워킹 연결 관리 규칙을 생성/관리. 외부에서 들어온 트래픽을 내부로 전달(프록시)하는 NAT 유사 역할이라고 비유.
  - **container runtime**: 컨테이너를 실제로 만들고 실행(이 실습은 containerd).
  - K8s는 Node도 하나의 리소스(오브젝트)로 보므로 kubectl로 노드를 기본적인 수준에서 관리할 수 있다. 운영 중 노드 수가 늘거나 줄 수 있으며(수동), 클라우드에서는 오토스케일링으로 운영할 수도 있다. 이 실습은 VM이라 수동으로 미리 준비한 node3를 합류시킨다.
- **노드 정보 확인**: `kubectl get node`는 `get no`로 축약 가능. `-o`는 output, `wide`는 기본 정보에 노드 IP, OS 이미지(Ubuntu 22.04.2 LTS), 커널 버전(6.2.0-39-generic), 컨테이너 런타임 버전(containerd://1.6.26)을 추가. `kubectl describe nodes <이름>`(이름을 생략하면 전체 출력)에는 이름, Label/Annotation(노드 식별), 생성 시각, 네트워크 정보, 리소스 상태, 그리고 **하단의 Events(강사가 중요하다고 강조)**가 포함. 화면 값: Conditions - NetworkUnavailable False(CalicoIsUp), MemoryPressure/DiskPressure/PIDPressure False, Ready True(KubeletReady) / Addresses - InternalIP, Hostname / Capacity - cpu 4, ephemeral-storage 78085888Ki, hugepages-2Mi 0, memory 4000932Ki, pods 110.
- **노드 추가 전 사전 점검 7가지 (슬라이드 "사전에 준비한 k8s-node3을 부팅하고 아래 내용을 점검한다")**: ① IP 주소(192.168.56.103; enp0s8) ② Hostname 변경 ③ /etc/hosts의 127.0.1.1 hostname 변경(복제 VM이라 이전 이름이 남아 있을 수 있음) ④ containerd 및 kubelet 서비스 restart/정상(active running) ⑤ `free`로 swapoff 확인(Swap이 0이 아니면 `sudo swapoff -a` 후 재확인; 영상에서도 재부팅 후 Swap이 7812092로 켜져 있어 해제함) ⑥ `cat /proc/sys/net/ipv4/ip_forward`가 1 ⑦ ssh 접속 테스트(예: node3에서 `ssh student@k8s-master` 후 exit; 이미 접속해 본 적이 있으면 yes 질문 없음). 호스트 이름/IP가 기존 노드와 충돌하지 않아야 하며 이 조건들이 맞아야 join이 정상 진행된다. (K8s는 swap이 켜져 있으면 kubelet이 정상 동작하지 않도록 설계. ip_forward는 서버가 다른 곳으로 패킷을 전달(라우팅)하게 하는 설정으로 Pod 간 통신에 필요.)
- **join 토큰**: 기본(init 시 생성) 토큰의 **TTL은 23h(24시간 기준)**이라 노드를 나중에 확장할 때는 이미 만료되었을 가능성이 높으므로 새 토큰을 만든다. 토큰은 언제든 새로 만들 수 있으므로 토큰 관리 방법을 알아 두는 것이 이 부분의 포인트. `kubeadm token create --ttl 0`은 만료되지 않는 영구 토큰(목록에 `<forever>`/`<never>`), `--print-join-command`는 토큰과 CA 인증서 해시가 포함된 완성된 join 명령 출력. 토큰 = 새 노드가 클러스터에 들어가도 되는지 인증하는 임시 비밀번호, `--discovery-token-ca-cert-hash` = 접속하려는 master가 진짜인지 확인하는 인증서 지문. **TTL 0(영구) 토큰은 편리하지만 유출 위험이 있으므로 실무에서는 신중히 사용**.
- **합류 후 NotReady -> Ready**: join 직후 `get no`에서 node3는 NotReady(AGE 13s). 새 노드에 네트워크 플러그인 Pod(calico-node, Init:0/3)가 올라가 등록되고 kube-proxy Pod(ContainerCreating)가 생성되는 과정이 끝나야 Ready로 바뀐다. 영상에서 약 5분 대기(강사: "시간이 조금 걸리니 기다려 보면 만들어지는 과정을 볼 수 있다"). 완료 후 kube-proxy가 노드 4대에 하나씩 4개이고 Pod 이름 뒤에 해시가 붙은 고유 이름을 가진다(calico도 동일). 특정 Pod의 소속 노드는 `kubectl describe -n kube-system po <Pod>`의 **Node 항목**으로 확인(`-n`은 namespace).
- **노드 제거와 권장 구성**: 수동으로 추가한 노드는 `kubectl delete node <이름>`으로 제거 가능(이 클립에서는 실행하지 않고 언급만). 이 수업은 master 1 + worker 3, 총 4대로 진행. 컴퓨터 리소스가 부족하면 worker 2대면 충분하며, 1대만으로도 가능하지만 노드가 하나뿐이면 여러 노드에 걸친 동적인 동작을 확인할 수 없으므로 **최소 worker 2대 권장**.

### [사용한 CLI]

**3-1. 현재 노드 상태 및 상세 확인 (master)**
```bash
kubectl get no                       # node = no 약어. master/node1/node2 Ready (v1.28.5)

kubectl get node -o wide             # -o wide: INTERNAL-IP, OS-IMAGE, KERNEL-VERSION, CONTAINER-RUNTIME(containerd://1.6.26) 추가
kubectl describe nodes k8s-node1     # Labels, Annotations, Taints, Conditions, Addresses, Capacity 등 상세
```
- describe 주요 항목: Conditions(NetworkUnavailable False(CalicoIsUp), MemoryPressure/DiskPressure/PIDPressure False, Ready True(KubeletReady)), Addresses(InternalIP, Hostname), Capacity(cpu 4, memory, pods 110 등).

**3-2. node3 사전 점검 (k8s-node3)**
```bash
hostname                                  # k8s-node3
ifconfig                                  # enp0s8 inet 192.168.56.103 확인
cat /etc/hosts                            # 127.0.1.1 k8s-node3 및 master/node1~3 IP 확인
sudo systemctl status containerd.service  # active (running)
free                                      # Swap 이 0 인지
sudo swapoff -a                           # Swap 이 남아 있으면 해제
ssh student@k8s-master                    # 최초 접속 시 yes, 접속 후 exit
cat /proc/sys/net/ipv4/ip_forward         # 1
```

**3-3. join token 확인/생성 (master)**
```bash
kubeadm token list                                     # 기존 토큰 목록, 기본 토큰 TTL 23h
kubeadm token create --ttl 0 --print-join-command      # 만료 없는 토큰(<forever>/<never>) + join 명령 출력
kubeadm token create --print-join-command              # 기본 TTL 토큰 + join 명령 출력
```
- 출력 예: `kubeadm join 192.168.56.100:6443 --token <토큰> --discovery-token-ca-cert-hash sha256:<해시>`

**3-4. node3 에서 join 실행**
```bash
sudo kubeadm join 192.168.56.100:6443 --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>
```
- 성공 시 `This node has joined the cluster:` 출력.

**3-5. 합류 결과 확인 (master)**
```bash
kubectl get no                                         # k8s-node3 NotReady -> Ready (수 분 소요)
kubectl get po -A                                      # calico-node Init:0/3, kube-proxy ContainerCreating -> Running
kubectl describe -n kube-system po kube-proxy-rfh6h    # -n: namespace 지정. Node: k8s-node3/192.168.56.103 확인
```

**3-6. (참고) 노드 제거**
```bash
kubectl delete node <노드이름>        # 노드 삭제 (필요 시)
```
- 자료 내용: 노드 삭제 시 `kubectl delete node` 를 사용하며, 이후 구성(master 1 + worker 3, 총 4 노드)으로 관리도구 실습을 진행한다.

### [확인 방법/주의점]
- join 직후 `NotReady` 는 정상(calico-node, kube-proxy 가 새 노드에서 실행되기까지 대기). 약 5분 후 Ready.
- node3의 `/etc/hosts`에서 127.0.1.1이 `k8s-node3`인지(복제 VM의 이전 hostname이 남아 있지 않은지) 점검.
- `--ttl 0` 토큰은 만료되지 않으므로 보안상 운영 환경에서는 주의.

- (강사 안내) 기본 join 토큰은 TTL 23h 라 나중에 노드를 추가할 때는 만료되었을 가능성이 높음 -> `kubeadm token create --print-join-command` 로 재발급. 토큰 관리 방법을 알아 두는 것이 포인트.
- 노드 합류 후 NotReady -> Ready 까지 약 5분 대기(calico-node, kube-proxy 생성 과정). 사전 점검 7항목(IP, hostname, /etc/hosts 127.0.1.1, containerd/kubelet, swap, ssh, ip_forward)을 지키지 않으면 join 이 정상 진행되지 않음.
- 실습은 master 1 + worker 3 이 기본이나 자원 부족 시 worker 2대면 충분(1대는 여러 노드에 걸친 동작 확인 불가).

---

## Step 4. [비교 데모] Amazon EKS 클러스터 구성 (eksctl)

### [목적]
VM 기반 kubeadm 클러스터와 비교하기 위해, AWS의 관리형 Kubernetes인 Amazon EKS 클러스터를 `eksctl` 한 번의 명령으로 구성한다. (데모)

### [이론 설명]
- **데모 성격**: 이 클립은 시연 형식이라 따라 하지 않고 보기만 해도 된다. EKS는 Part 3~7에서 계속 쓰는 환경이라 그때 본격 구축/활용하며, 여기서는 Kubernetes 기본(native) 명령을 VM 환경과 클라우드 환경에서 비교해 보여 주기 위해 넣었다. EKS 구성은 VM으로 했던 복잡한 과정보다 훨씬 간단함을 보여 주는 목적. 이 챕터의 다음 3장은 옵저버빌리티(관리/모니터링) 도구, 본격적인 Kubernetes 학습은 4장부터.
- **Amazon EKS(Elastic Kubernetes Service)**: AWS 클라우드에서 Kubernetes를 실행하는 **관리형(managed) Kubernetes 서비스**. 컨테이너 스케줄링, 애플리케이션 가용성 관리, 클러스터 데이터 저장 등 주요 작업을 담당하는 **컨트롤 플레인 노드의 가용성과 확장성을 AWS가 관리**하며, AWS 네트워킹/보안 서비스와 통합되고 AWS 인프라의 성능·규모·신뢰성·가용성을 활용한다. Kubernetes가 컨테이너 운영 관리의 사실상 표준이라 모든 클라우드가 관리형 서비스를 제공(AWS=EKS, Google=GKE). **VM과의 차이**: VM에서는 master/worker를 하나하나 직접 관리했지만, 클라우드에서는 컨트롤 플레인(마스터)을 클라우드가 관리하므로 우리는 워커 노드 설정, 가용성, 관리형 여부, 어느 VPC에 넣을지 같은 클라우드 설정만 신경 쓰면 된다. (강사 언급: 국내에서는 LG CNS가 업무의 절반 이상을 EKS로 운영, 카카오/삼성 등도 전환 중 - 화면에는 없는 구술.)
- **워커 노드 운영 방식 2가지**: **EC2 기반**(AWS VM 서비스 위에 노드 운영, 앞의 VM 방식과 동일한 VM 베이스) / **Fargate 기반**(서버리스 환경에서 컨테이너 서비스 운영).
- **EKS 구성도 (슬라이드 58)**: AWS Cloud > Amazon VPC(독립된 네트워크 영역) > Availability Zone A/B > Public/Private Subnet, Internet Gateway, NAT Gateway, Kubernetes ELB, Auto Scaling Group 안의 노드들(각 가용 영역에 노드 묶음), Amazon EKS. 노드 수와 노드 그룹 단위는 사용자가 정하고, 컨트롤 플레인은 클라우드가 운영하므로 사용자가 보고 관리하는 것은 대부분 워커 노드. 세팅 방법은 AWS 콘솔(마우스 클릭) 또는 eksctl 같은 CLI 두 가지이며 이 강의는 명령어 위주.
- **작업 환경 선택**: ① EC2(Linux) 서버 - 강사 방식, Bastion 개념으로 EC2 Linux를 띄워 그 안에 명령어를 설정해 EKS를 생성/관리 ② 내 Windows PC - 비용이 드는 EC2 대신 Windows용 도구를 설치해 Windows CMD에서 운영해도 무방. 어느 쪽이든 **AWS 계정 + Access Key ID/Secret Access Key + `aws configure`** 인증 절차는 동일. Windows에서 작업해도 AWS CLI(2.0 이상 권장), kubectl, eksctl 세 가지를 설치. 강사 EC2에는 AWS CLI가 기본 설치돼 있음.
- **도구 구분**: kubectl = Kubernetes 자체를 다루는 도구, **eksctl = EKS 클러스터를 만들고 관리하는 도구**. jq = JSON 처리 도구(강사는 따로 설명 안 함). `/usr/local/bin`은 PATH에 포함된 디렉터리라 어디서든 이름만으로 실행 가능, `uname -s`는 OS 이름(Linux)이라 URL이 `eksctl_Linux_amd64.tar.gz`로 완성.
- **버전 주의 (강사 강조)**: 클라우드 Kubernetes는 충분한 테스트를 위해 최신 릴리스보다 한두 단계 낮은 버전이 제공된다. 강의 시점 EKS는 **1.27이 default, 1.28까지 지원**(1.27 설치 후 1.28 업데이트도 지원; 콘솔에 "지금 업데이트" 표시). VM 실습은 1.28이었지만 여기서는 한 단계 낮춘 1.27. **설치할 EKS 버전과 kubectl 버전을 같게 맞춰야 하며, 다르면 클러스터 구축 시 에러가 발생해 클러스터를 다시 만들어야 할 수 있다.**
- **인증/리전 주의**: Access Key와 Secret Key는 AWS 계정 비밀번호에 해당하므로 타인에게 보이거나 코드 저장소에 올리면 안 됨(강사 화면의 값은 임의 예시라 문서에 미기재). 발급은 IAM > 사용자 보안 자격 증명 > 액세스 키 생성 > CSV 다운로드. 서울 리전 = `ap-northeast-2`, 출력 형식 `json`(반드시 소문자). TOKEN/AWS_REGION 메타데이터 조회는 EC2에서 실행할 때의 방법이며 Windows에서는 불필요하고 `--region ap-northeast-2`를 직접 지정. **`--region`을 지정하지 않으면 기본값 us-east-1(미국 동부)로 생성되므로 유의.**
- **eksctl create cluster 옵션 (슬라이드 주석)**: `--name` EKS 클러스터 이름 / `--nodegroup-name` 노드그룹명 / `--node-type t3.medium` EC2 인스턴스 유형(CPU·메모리·네트워크 대역폭·디스크 사양을 정의한 타입) / `--nodes 3` 배포되는 노드 수 / `--nodes-min 1`, `--nodes-max 4` EC2 Autoscaling의 최소/최대 노드 수 / `--managed` Amazon EKS 관리형 노드 그룹 생성 / `--version 1.27` Kubernetes 버전(kubectl과 동일해야 함) / `--region` 배포 리전.
- **실습 중 오류 사례**: 강사가 처음 붙여 넣었을 때 마지막 줄(`--region` 값)이 누락된 채 입력되어 `error: --region` 관련 에러가 잠깐 나왔고, 사전에 준비한 명령을 다시 복사해 붙여 넣어 정상 실행(에러 문구는 일부만 판독 가능).
- **생성 과정**: 클러스터 서버 생성 + EC2 3대 기동 + 클러스터로 묶는 과정이 필요해 **10~15분(강사 경험상 13~15분)** 소요(슬라이드 "New Cluster 생성은 10~15분 소요"). 시청자는 대기 구간을 건너뛰어도 됨. 로그 요약: 가용 영역 `[ap-northeast-2d, 2c, 2b]` 설정, 노드 AMI AmazonLinux2/1.27, CloudFormation 스택 2개(클러스터 + 초기 managed nodegroup), API endpoint 기본 `publicAccess=true, privateAccess=false`, CloudWatch logging 비활성. 진행 상황은 EKS 콘솔(dev-cluster "생성 중" -> "활성", 컴퓨팅 탭 노드 0개에서 시작)과 **CloudFormation 스택 `eksctl-dev-cluster-cluster`(CREATE_IN_PROGRESS -> COMPLETE) 이벤트 탭**에서 관찰. CloudFormation은 Terraform과 비슷한 **IaC(Infrastructure as Code)** 도구로, 논리적 구성을 코드로 만들어 적용해 서비스를 구축한다. 터미널에는 `waiting for CloudFormation stack ...`이 반복되다가 클러스터 스택 완료 후 노드그룹 스택 `eksctl-dev-cluster-nodegroup-dev-nodes`로 넘어간다.
- **완료 확인**: `EKS cluster "dev-cluster" in "ap-northeast-2" region is ready`가 완료 표시, kubeconfig가 `/home/ec2-user/.kube/config`에 자동 저장되어 바로 kubectl 사용 가능. `kubectl get no`로 노드 3대 Ready(v1.27.7-eks-e71965b), 노드 이름은 `ip-192-168-xx-xx.ap-northeast-2.compute.internal` 형식.
- **VM과의 차이 확인**: `kubectl run myweb --image=nginx:1.25.1-alpine`은 docker run과 비슷한 작업(alpine은 가벼운 이미지, 포트 등 옵션 생략한 "요구만 던진" 최소 명령). `kubectl get po -A`에서 VM(kubeadm)과 달리 **kube-apiserver, etcd, scheduler 등 컨트롤 플레인 Pod는 보이지 않고** aws-node(CNI), kube-proxy, coredns만 보인다(컨트롤 플레인을 AWS가 관리하기 때문).
- **비용 주의 (강사 당부)**: 클라우드는 사용한 만큼 비용이 발생하므로 **작업이 끝나면 생성한 리소스는 바로바로 삭제**하는 것이 가장 좋다(강사도 데모 전에 기존 EKS 클러스터를 모두 지움). 삭제 명령은 이 클립에서 실행/제시되지 않음.

### [사용한 CLI]

**4-1. kubectl v1.27.0 설치 (EC2, ec2-user)**
```bash
curl -LO https://dl.k8s.io/release/v1.27.0/bin/linux/amd64/kubectl   # 바이너리 다운로드
ls
sudo mv kubectl /usr/local/bin/kubectl                               # PATH 에 있는 경로로 이동
sudo chmod +x /usr/local/bin/kubectl                                 # 실행 권한 부여
kubectl version -o yaml                                              # clientVersion major "1", minor "27", gitVersion v1.27.0
```

**4-2. eksctl 설치**
```bash
# eksctl: Amazon EKS Kubernetes cluster 를 생성/관리하는 CLI
curl --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv -v /tmp/eksctl /usr/local/bin
eksctl version                        # 0.166.0
sudo yum -y install jq                # JSON 처리 도구
```

**4-3. AWS 자격 증명 및 리전 설정**
```bash
aws configure
# AWS Access Key ID [None]: <Access Key ID>
# AWS Secret Access Key [None]: <Secret Access Key>
# Default region name [None]: ap-northeast-2
# Default output format [None]: json
```
- Access Key는 IAM 사용자 생성 후 받은 CSV 파일의 값을 사용 (외부 노출 금지).
```bash
# EC2 메타데이터에서 현재 리전을 읽어 환경변수 AWS_REGION 설정
TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"`
export AWS_REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" --silent http://169.254.169.254/latest/meta-data/placement/region) && echo $AWS_REGION
# ap-northeast-2
```
- Windows 등 EC2 외부에서는 이 메타데이터 방식이 안 되므로 `--region ap-northeast-2` 를 직접 지정.

**4-4. EKS 클러스터 생성**
```bash
eksctl create cluster \
--name dev-cluster \            # Amazon EKS cluster 이름
--nodegroup-name dev-nodes \    # Amazon EKS 노드그룹 이름
--node-type t3.medium \         # 노드 인스턴스 타입 (EC2)
--nodes 3 \                     # 노드 수
--nodes-min 1 \                 # EC2 Auto Scaling 최소 노드 수
--nodes-max 4 \                 # EC2 Auto Scaling 최대 노드 수
--managed \                     # Amazon EKS 관리형 노드그룹
--version 1.27 \                # Kubernetes 버전
--region ${AWS_REGION}          # 리전 (미지정 시 기본 us-east-1 사용 주의)
```
- 진행 로그: 가용영역 설정, nodegroup `dev-nodes` (AmazonLinux2/1.27), CloudFormation stack `eksctl-dev-cluster-cluster` 및 노드그룹 스택 `eksctl-dev-cluster-nodegroup-dev-nodes` 배포. 완료 시 `saved kubeconfig as "/home/ec2-user/.kube/config"`, `EKS cluster "dev-cluster" in "ap-northeast-2" region is ready`.
- AWS 콘솔에서 EKS 의 dev-cluster(Kubernetes 1.27) 와 CloudFormation 스택(CREATE_IN_PROGRESS -> COMPLETE) 확인 가능.

**4-5. 클러스터 동작 확인**
```bash
kubectl get no                                   # 노드 3개 Ready (v1.27.7-eks-...)
kubectl run myweb --image=nginx:1.25.1-alpine    # Pod 생성 (docker run 과 유사)
kubectl get po -o wide                           # ContainerCreating -> Running, Pod IP 와 배치된 NODE 확인
kubectl get po -A                                # aws-node, coredns, kube-proxy 등 시스템 Pod
```

### [확인 방법/주의점]
- 생성 시 `--region` 을 지정하지 않으면 기본 리전(us-east-1)이 사용될 수 있음 -> `ap-northeast-2` 로 지정.
- VM(kubeadm) 환경과 비교: EKS 의 `kubectl get po -A` 에는 kube-apiserver, etcd, scheduler Pod 가 보이지 않음(AWS 관리 control plane). 대신 aws-node(CNI), kube-proxy, coredns 가 보임.
- 실습 후 비용 발생 주의: 강사 당부 - 작업이 끝나면 생성한 리소스는 바로 삭제할 것(삭제 명령은 자료에 제시되지 않음).
- EKS 기본 버전 1.27 이므로 kubectl 도 1.27 로 맞춤.

---

## Step 5. Kubernetes Dashboard 생성 (secure) + 모니터링/Observability 개념

### [목적]
Kubernetes 공식 Dashboard v2.7.0을 설치하고, 보안을 고려한 접속 방식(API server 6443 + 클라이언트 인증서 + 토큰)으로 웹 UI에 로그인하여 리소스를 확인/관리한다.

### [이론 설명]
**챕터 3 소개 (강사 안내)**
- 챕터 2에서 Control Plane(master) + Worker로 구성한 클러스터를 다루는 관리 도구를 소개한다. 실습이 많으므로 **시작 전에 모든 노드가 Ready인지, `kubectl get po -A`로 전체 오브젝트가 Running인지 먼저 점검**할 것. 강사가 고른 5가지 도구: ① Kubernetes Dashboard(쿠버네티스 네이티브, VM뿐 아니라 EKS/GKE에도 설치 가능, 인증서로 안전하게 접속) ② Prometheus & Grafana(데모; 자세한 설치/알람은 Part 3 이후) ③ Kubeshark(API 서버는 구성요소가 API 트래픽으로 통신 -> 이를 보는 "쿠버네티스판 와이어샤크") ④ Portainer(도커 수업에서 만난 도구, 클러스터를 등록해 Pod/노드까지 관리) ⑤ k9s(kubectl 명령이 거부감 있는 사람을 위한 UI가 있는 CLI 도구). 강사는 Windows 환경이라 쿠버네티스 인증서를 Windows 인증서 관리자(certmgr)에 등록해 **인증서가 없는 컴퓨터에서는 접근되지 않는 보안 접속**을 만든다(Mac은 인증서 관리를 별도로 확인).

**Monitoring vs Observability**
- **Monitoring(모니터링)**: IT 시스템의 CPU/메모리/네트워크 트래픽 등 데이터를 수집·분석해 성능과 동작을 파악하고, 문제로 추정되는 이상 동작/조건을 감지해 경고(알람)한다. 일정 간격으로 수집되는 **사전 정의된 메트릭/로그**에 의존. 예: CPU를 1분마다 체크하고 **임계값(Threshold)**을 초과하면 알람. 특정 유형의 문제 감지에는 효과적이나 IT 시스템 전체 동작 파악이나 근본 원인 분석에 대한 심층 인사이트는 제한적.
- **Observability(관측 가능성)**: 시스템에서 **외부로 출력되는 값만으로 내부 상태를 예측**하는 것. 내부 시스템 이해를 근거로 발생 가능한 이벤트를 예측하고 이를 바탕으로 IT 운영을 자동화. 강사 구분: "모니터링은 내부에서 발생한 히스토리 데이터를 근거로, 관측 가능성은 외부로 출력되는 값으로 내부 상태를 예측". 이점: 문제 해결 속도 향상 / 전체 시스템 이해도 증가 / 대규모 시스템 관리 가능 / 문제 예방 및 최적화. 대규모 시스템에서는 관리 대상이 너무 많아 이를 하나로 집약 관리하고 빠르게 조치하게 해 주는 것이 장점.
- **Observability Golden Triangles**: ① **지표(Metrics, 모니터링)** - 일정 기간 측정된 데이터의 수치 표현, 추세 확인/모델링/예측에 사용(정량적 정보; CPU량, 메모리량) ② **로깅(Logs)** - 이벤트의 타임스탬프가 지정된 변경 불가능한 레코드, 긴급하고 예측할 수 없는 동작 파악에 사용(예: 15개월~1년 저장해 월별/주별 패턴 분석) ③ **트레이싱(Tracing)** - 요청이 통과한 경로와 구조 모두에 대한 가시화, 리소스가 비정상일 때 사용자/요청 경로에 미치는 영향 파악. 강사는 여기에 **Visualization(시각화)**을 더해야 한다고 강조(세 가지는 "데이터"이고 데이터만 보면 빠른 분석이 어려우므로 시각화가 더해지면 더 빠른 분석/예측 가능).
- **쿠버네티스 모니터링/관측 도구 (슬라이드)**: Kubernetes Dashboard(native monitoring tool, 이번 클립), Prometheus/Grafana(open source monitoring tool, 데모), ELK stack(open source Visualization tool; 이후 파트에서 ELK/EFK = Elasticsearch, Logstash/Fluentd, Kibana로 로그 수집/정제/시각화), Kubewatch(Event-based monitoring, 클러스터 내부 이벤트 기반), Jaeger(open source Tracing and Monitoring tool, 지표/트레이싱/로그 분석), OpenTelemetry(open source observability tool). Part 2~7에서 쓸 도구들을 정리한 목록.

**Kubernetes Dashboard**
- **특징 (슬라이드)**: 범용 웹 기반 UI / 환경 관리·문제 해결·Monitoring을 위한 직관적 접근 / 모든 노드의 메모리·CPU 사용량 등 기본 지표 접근 / 거의 모든 workload resource의 상태 모니터링 / **Helm 및 Manifest(YAML)**로 설치 / 전역 관리를 위한 RBAC 구성. 리소스를 보기만 하는 것이 아니라 **생성/삭제/변경**까지 가능하며 화면의 **+ 버튼**으로 리소스 생성, **exec 버튼**으로 Pod 내부 접속(kubectl exec와 동일 역할). 이번에는 YAML을 직접 작성하지 않고 제공 링크의 매니페스트를 그대로 apply(Helm은 Part 3부터 본격 사용).
- **RBAC가 필요한 이유**: 대시보드는 master 1 + worker 3(총 4노드)를 모두 훑고 리소스를 가져와야 하므로 전역 관리 권한이 필요. 보안 내용은 뒤에서 자세히 다루고 여기서는 대시보드에 관리자 권한만 부여.
- **버전 선택**: https://github.com/kubernetes/dashboard/releases 에서 확인. 강사 시점 최신 **v3.0.0은 알파 버전이라 정식이 아니므로 안정 버전 v2.7.0 사용**. 릴리스의 Compatibility 표상 2.7.0은 Kubernetes 1.25 이후에서 사용 가능하므로 v1.28.5에서 사용 가능. 릴리스 페이지에 Dashboard와 Metrics Scraper(지표 수집기) 이미지가 안내됨. 설치 후 `kubernetes-dashboard` 네임스페이스에 Pod 2개(dashboard-metrics-scraper, kubernetes-dashboard)가 1/1 Running인지 **반드시 확인**(시스템 구성요소는 kube-system, 대시보드는 별도 네임스페이스에 그룹화). "쿠버네티스에서 동작하는 모든 것은 결국 Pod이며 Pod는 컨테이너의 포장지 같은 것".
- **접속 방법 3가지 (슬라이드)**: ① **Proxy port** - `kubectl proxy --port=[port#] &`로 local port 생성(보안이 전혀 없는 가장 기본 방법, 예: 8899) ② **NodePort** - 생성된 dashboard의 Service를 기본 타입 ClusterIP(내부용)에서 `kubectl edit`으로 NodePort로 변경(외부 노출 포트 생성) ③ **API server 보안 접속** - API 서버(중앙 관리 구성요소)의 **6443 포트에 인증서로 접속**. 강사는 "DevSecOps" 관점(슬라이드 손글씨)에서 보안팀은 항상 보안 접속을 원하므로 이 실습은 ③을 선택.
- **RBAC 구성**: ClusterRole = 클러스터 전반 권한의 집합, `cluster-admin`은 쿠버네티스 세팅 시 자동 생성되는 "클러스터 전반의 관리자 롤"(`describe`의 `*.*` / `[*]` = 모든 리소스에 대한 모든 동작(verbs) 허용). 대시보드 설치 시 기본 ServiceAccount가 생기지만 관리용으로 **admin-user**를 새로 만들어 cluster-admin을 바인딩한다. ServiceAccount = 사람이 아닌 프로그램(Pod 등)이 쓰는 계정, ClusterRoleBinding = "누가(subjects) 어떤 역할(roleRef)을 갖는가"를 연결. 슬라이드 손글씨 화살표: ServiceAccount 이름(admin-user)이 ClusterRoleBinding의 `subjects`에, cluster-admin이 `roleRef`에 들어가 연결됨. ClusterRoleBinding 파일명은 슬라이드 표기상 `ClusterRoleBinding-admin-user.yml`.
- **토큰**: 서비스 어카운트 토큰은 접속 시 쓰는 "패스워드 개념"(JWT). **기본 만료 기간이 매우 짧아** 만료되면 매번 다시 생성해서 쓴다. `alias dtoken`("dashboard token")을 `~/.bashrc`에 기록해 두면 편리(`source ~/.bashrc`로 즉시 반영). 강사는 토큰을 메모장에 붙여 두고 로그인에 사용.
- **인증서 준비**: 마스터 `~/.kube/config`의 `client-certificate-data`/`client-key-data`는 **base64로 인코딩**되어 있으므로 `base64 -d`로 디코딩해 `kubecfg.crt`/`kubecfg.key`로 저장(cat 시 BEGIN CERTIFICATE / BEGIN RSA PRIVATE KEY). `openssl pkcs12 -export`로 crt+key를 하나로 묶어 Windows가 가져올 수 있는 **p12(PKCS#12)** 생성(`-name "kubernetes-admin"`은 표시 이름). **`Warning: -clcerts option ignored with -export`는 무시해도 됨**. Export Password는 두 번 입력하며 이후 Windows 가져올 때 같은 암호를 사용(슬라이드 예시 암호는 이 문서에 미기재). `/etc/kubernetes/pki/ca.crt`(클러스터 CA 인증서)는 권한 때문에 sudo로 복사.
- **Windows 등록**: WinSCP로 master(192.168.56.100)의 `dashboard_rbac` 디렉터리를 Windows로 가져온다(YAML은 불필요, 중요한 것은 `ca.crt`, `kubecfg.crt`, `kubecfg.key`, `kubecfg.p12` 네 가지). **PowerShell(또는 cmd)을 관리자 권한으로** 열어 해당 폴더에서 실행: `certutil.exe -addstore "Root" ca.crt`(CA를 "신뢰할 수 있는 루트 인증 기관"에 등록, "이 인증서를 설치하시겠습니까?" 창에서 예) / `certutil.exe -p <p12암호> -user -importPFX kubecfg.p12`(클라이언트 인증서를 현재 사용자 개인용 저장소에 가져옴, `-p`는 p12 암호). `certmgr.msc`에서 개인용 > kubernetes-admin, 신뢰할 수 있는 루트 인증 기관 > kubernetes 확인. 강사 PC에는 이전 kubernetes 인증서(만료 2033년)가 여러 개 있어 최신 두 개만 남기고 삭제.
- **접속**: 주소는 master API server(6443)에 서비스 프록시 경로를 붙인 형태이며, `kubectl cluster-info`가 알려 주는 주소의 뒷부분을 kubernetes-dashboard 서비스로 바꾼 것. **크롬 시크릿 창(Ctrl+Shift+N)**에서 접속하면 "Select a certificate" 창이 뜨고 kubernetes-admin 선택 후 OK -> 로그인 화면에서 발급한 토큰 붙여넣기(만료되었으면 재발급). **인증서가 등록되지 않은 컴퓨터에서는 접근 불가**한 것이 보안 접속의 핵심. 로그인 후 전체 워크로드/리소스 현황, 왼쪽 사이드 메뉴, 상단 + 버튼(YAML 붙여넣기/파일 업로드), 네임스페이스 선택 가능. 클러스터 > 노드 화면에서 k8s-node3/2/1/master 모두 준비(True) 확인.
- **세션/토큰 만료**: 토큰 로그인 세션에도 만료가 있어 **약 30분 후 자동 로그아웃**되고 토큰도 만료된다. 만료를 쓰지 않으려면 Deployment를 edit하여 containers `args`에 `--token-ttl=0`을 추가(세션 타임아웃 비활성화). 슬라이드 주석: `--enable-skip-login`을 추가하면 token 인증 자체를 완전히 비활성화(보안상 비권장). edit가 정상 저장되면 Pod가 자동 재시작되므로 `kubectl get po -n kubernetes-dashboard`로 확인. 강사는 이렇게 운영하면 좋겠다고 언급.
- **Pod 관리 실습**: `kubectl run myweb1 --image=nginx:1.25.1-alpine --port=80`(alpine이라 매우 가벼워 금방 Running, node1에 배치) -> `get po -o wide`로 Pod IP/노드 확인 -> Pod IP로 curl하면 "Welcome to nginx!". 대시보드 워크로드 > 파드 > myweb1에서 메타데이터/노드/상태/IP/조건을 명령 없이 볼 수 있고(describe에 해당하는 이벤트/연결성 정보), 우측 상단 exec 버튼으로 Pod 내부 셸 접속(alpine 확인, exit 없이 창을 닫아도 됨), 편집/삭제 가능(삭제 후 `No resources found in default namespace.`). kubectl을 좋아하면 명령줄, 약하면 UI로 관리 가능하며 Dashboard는 오픈소스라 수업 중 계속 사용할 예정.

### [사용한 CLI]

**5-1. 사전 확인**
```bash
kubectl get no
kubectl get po -A
```

**5-2. Dashboard v2.7.0 설치**
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml
```
- 생성: namespace kubernetes-dashboard, serviceaccount, service, secret(certs/csrf/key-holder), configmap, role/clusterrole/rolebinding/clusterrolebinding, deployment `kubernetes-dashboard`, service/deployment `dashboard-metrics-scraper`.
```bash
kubectl get po -A      # kubernetes-dashboard 네임스페이스의 2개 Pod Running 확인
```

**5-3. 관리자 계정 생성 (ServiceAccount + ClusterRoleBinding)**
```bash
kubectl get clusterrole cluster-admin
kubectl describe clusterrole cluster-admin     # *.* [] [] [*]  (모든 리소스/모든 동작)

mkdir dashboard_rbac && cd $_
vi dashboard-admin-user.yaml
vi ClusterRoleBinding-admin-user.yml
```
```yaml
# dashboard-admin-user.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
```
```yaml
# ClusterRoleBinding-admin-user.yml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: admin-user
  namespace: kubernetes-dashboard
```
```bash
kubectl apply -f dashboard-admin-user.yaml            # serviceaccount/admin-user created
kubectl apply -f ClusterRoleBinding-admin-user.yml    # clusterrolebinding.rbac.authorization.k8s.io/admin-user created
kubectl -n kubernetes-dashboard get sa                # admin-user, default, kubernetes-dashboard
```

**5-4. 로그인 토큰 발급 및 alias**
```bash
kubectl -n kubernetes-dashboard create token admin-user      # JWT 토큰 출력 (만료 시간 있음)

alias dtoken='kubectl create token -n kubernetes-dashboard admin-user'
vi ~/.bashrc          # alias 를 영구 저장
source ~/.bashrc
```

**5-5. 클라이언트 인증서 생성 (kubeconfig에서 추출 -> p12)**
```bash
# ~/.kube/config 의 client-certificate-data / client-key-data 를 base64 디코딩
grep 'client-certificate-data' ~/.kube/config | head -n 1 | awk '{print $2}' | base64 -d >> kubecfg.crt
grep 'client-key-data' ~/.kube/config | head -n 1 | awk '{print $2}' | base64 -d >> kubecfg.key
ls
cat kubecfg.crt       # -----BEGIN CERTIFICATE-----
cat kubecfg.key       # -----BEGIN RSA PRIVATE KEY-----

# crt + key 를 브라우저/Windows 용 p12(PKCS#12) 로 묶기 (Export Password 입력)
openssl pkcs12 -export -clcerts -inkey kubecfg.key -in kubecfg.crt -out kubecfg.p12 -name "kubernetes-admin"
# Warning: -clcerts option ignored with -export  (무시해도 됨)

# 클러스터 CA 인증서 복사
sudo cp /etc/kubernetes/pki/ca.crt ./
```
- export 비밀번호는 실습에서 임의 지정(자료에서는 간단한 예시 값 사용)한 값을 이후 import에 그대로 사용.

**5-6. Windows PC 로 인증서 가져오기 후 등록**
- WinSCP 로 master(192.168.56.100)의 `dashboard_rbac` 폴더의 `ca.crt, kubecfg.crt, kubecfg.key, kubecfg.p12` 를 Windows 로 복사.
```powershell
# PowerShell (Windows) - 인증서 위치 폴더에서 실행
certutil.exe -addstore "Root" ca.crt                       # 신뢰할 수 있는 루트 인증 기관에 CA 등록 (경고창에서 예)
certutil.exe -p <p12 비밀번호> -user -importPFX kubecfg.p12   # 개인 인증서(kubernetes-admin) 가져오기
certmgr.msc                                                # 인증서 관리자에서 등록 확인
```
- certmgr.msc 에서 "신뢰할 수 있는 루트 인증 기관"의 kubernetes, "개인"의 kubernetes-admin 확인.

**5-7. Dashboard 접속**
```text
# 브라우저 (시크릿 모드: Ctrl+Shift+N 권장)
https://192.168.56.100:6443/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/#/login
```
- 접속 시 "Select a certificate" 창에서 kubernetes-admin 선택 -> 로그인 화면에서 Token 선택 후 `dtoken` 으로 발급한 토큰 입력.
- (참고) 슬라이드의 다른 접속 방법 2가지 (이 실습에서는 사용하지 않음):
```bash
# 방법 1) Proxy port - 보안 없는 가장 기본 방법, 로컬 포트 생성 (예: 8899)
kubectl proxy --port=[port#] &
# 방법 2) NodePort - dashboard Service 타입을 ClusterIP -> NodePort 로 kubectl edit 하여 외부 노출 포트 생성
#         (자료에 edit 대상의 정확한 명령 문자열은 표시되지 않음)
```
- 로그인 후 확인: 노드 목록(k8s-master, node1~3), Namespace, Pod 등. 우측 상단 + 버튼으로 YAML 붙여넣어 배포도 가능.

**5-8. 토큰 만료 방지 (선택)**
```bash
kubectl -n kubernetes-dashboard edit deployments kubernetes-dashboard
# containers.args 에 아래 항목 추가
#   - --auto-generate-certificates
#   - --token-ttl=0
#   - --namespace=kubernetes-dashboard
# (참고: 토큰 없이 로그인하려면 --enable-skip-login 사용 가능하나 보안상 권장하지 않음)

kubectl get po -n kubernetes-dashboard     # edit 후 Pod 재생성 확인
```

**5-9. 테스트 Pod 생성 후 대시보드에서 확인**
```bash
kubectl cluster-info
kubectl run myweb1 --image=nginx:1.25.1-alpine --port=80
kubectl get po -o wide        # ContainerCreating -> Running, IP 10.111.156.66 / NODE k8s-node1
curl <Pod IP>                 # "Welcome to nginx!"
```
- Dashboard 에서 Workloads > Pods > myweb1 : 상태/IP/노드 확인, **exec(터미널)** 로 컨테이너 내부 접속(exit로 종료), 삭제 가능. 삭제 후 `kubectl get po -o wide` 는 `No resources found in default namespace.`

### [확인 방법/주의점]
- Dashboard 버전은 클러스터 호환성에 맞게(v2.7.0 / K8s 1.28.5).
- `cluster-admin` 은 전권이므로 보안상 주의. 인증서(kubecfg.key)와 토큰 노출 금지.
- 인증서 import 후 브라우저를 **완전히 재시작/시크릿 창**에서 접속해야 "Select a certificate" 창이 뜸.
- 토큰 TTL 기본 만료 -> alias `dtoken` 으로 재발급 또는 `--token-ttl=0`.

- (강사 안내) Dashboard 최신 v3.0.0 은 알파라 정식이 아님 -> 안정 버전 v2.7.0(Kubernetes 1.25 이후 호환) 사용.
- 접속 3가지: ① kubectl proxy(보안 없음) ② NodePort(edit 로 ClusterIP -> NodePort) ③ API server 6443 + 인증서(이 실습, DevSecOps 관점).
- `openssl pkcs12 -export` 의 `Warning: -clcerts option ignored with -export` 는 무시. certutil 은 관리자 권한 PowerShell/cmd 에서 실행, CA 등록 시 확인 창에서 예.
- 토큰 로그인 세션은 약 30분 후 만료(자동 로그아웃) -> `dtoken` 재발급 또는 Deployment args 에 `--token-ttl=0`. `--enable-skip-login` 은 토큰 인증 비활성화(보안상 비권장). edit 저장 후 Pod 자동 재시작 확인.
- 인증서가 등록되지 않은 컴퓨터에서는 접속 불가(보안 접속의 핵심). 시크릿 창(Ctrl+Shift+N)에서 "Select a certificate" 창이 뜸. Mac 은 인증서 관리 별도 확인.

---

## Step 6. Prometheus & Grafana 모니터링 구성 (데모)

### [목적]
Prometheus(지표 수집/저장)와 Grafana(시각화)를 `monitoring` 네임스페이스에 배포하고 NodePort 로 접속하여 클러스터 지표를 대시보드로 확인한다.

### [이론 설명]
- **Prometheus**: CNCF(Cloud Native Computing Foundation)의 오픈소스 **Metric(지표) pipeline**. 클러스터/컨테이너의 상태 수치를 모아 모니터링. 특징(슬라이드 24): key-value 형태로 식별되는 **TSDB(시계열 DB)** 사용(시간에 따라 변하는 수치 저장 전용 DB) / **PromQL**(Prometheus Query Language) 쿼리 언어로 조회·분석 / **Alert** 기능으로 알림 / 자체 시각화도 있지만 미흡해 **Grafana에 Metric을 연동해 시각화**. Prometheus UI는 "수집 대상과 원시 지표를 확인하는 곳", 분석·시각화는 Grafana에 맡기는 것이 이 클립의 핵심 흐름.
- **Grafana**: 지표를 분석·시각화하는 대시보드 도구. 시계열 DB(Graphite, Prometheus, Elasticsearch, InfluxDB 등)와 클라우드 모니터링(Google Stackdriver, Amazon CloudWatch, Microsoft Azure 등)을 데이터 소스로 지원 - **Prometheus 전용이 아님**. 대시보드를 직접 만들거나 여러 대시보드에서 원하는 패널만 가져와 조합 가능, Grafana 사이트의 **대시보드 ID** 또는 **JSON 파일**로 import.
- **Exporter(node-exporter)**: 노드(master/worker)의 metrics를 Prometheus가 가져갈 수 있게 내보내는 에이전트. **DaemonSet**(모든 노드에 하나씩 고정 배치되는 에이전트형 Pod)으로 배포해 노드 수만큼(3개) 올라간다. 슬라이드 25 흐름: 각 노드의 exporter -> (Prometheus가 **pull metrics**) -> Prometheus(TSDB 저장) -> Grafana가 가져와 Web UI로 Visualization.
- **kube-state-metrics**: Kubernetes 오브젝트 상태 지표 제공(kube-system 네임스페이스에 배포됨).
- **상세 구성도 (슬라이드 26)**: Monitoring Targets(Node Exporter=Host/OS Metrics, K8s processes=K8S Metrics, Service Metrics=MinIO/Velero/Longhorn 등, 모두 Prometheus-format metric endpoints) / Prometheus Server(Service Discovery=Kubernetes API에서 대상 발견, Retrieval, TSDB, HTTP Server, config) / Grafana(PromQL로 조회해 Dashboards 표시) / Alert Manager(Prometheus가 push alerts 하면 Slack, 메일, 웹훅 등으로 전달) / Prometheus Operator(Kubernetes CRD - Prometheus, AlertManager, AlertManagerConfig, ServiceMonitor, PodMonitor - 를 watch하며 Prometheus 설정을 generate, 서버/Alert Manager를 manage). 강사: Prometheus에는 쿠버네티스의 방대한 메트릭이 모두 들어오지만 다 보지는 않으므로 내 애플리케이션 메트릭만 수집해 보고, 값이 과도하면 Alert(예: 팀 공유 Slack 채널)로 알리는 식의 사용도 가능. 이 클립은 구조 이해 후 곧바로 데모로 넘어가는 형태이며, Prometheus 운영 상세는 Part 3, 4 등 뒤쪽에서 다룬다.
- **실습 매니페스트**: 강사 개인 GitHub `brayanlee/k8s-prometheus`(나중에 강의 공유 저장소에도 올릴 예정). `tree` 결과 3개 디렉터리(grafana, kube-state, prometheus) 14개 파일. 쿠버네티스에서 쓸 Grafana, 시스템 영역 권한(ClusterRole 등)과 서비스(kube-state), Prometheus 세 가지를 설치하는 YAML이며 apply 또는 create로 바로 생성. git이 이미 설치돼 있으면 install 단계 생략 가능.
- **monitoring 네임스페이스**: 모니터링 리소스를 다른 것과 분리하려고 별도 생성. 적용 순서(Prometheus): ConfigMap -> ClusterRoleBinding -> ClusterRole -> Deployment -> Service -> DaemonSet(node-exporter). **ClusterRole/ClusterRoleBinding은 Prometheus와 kube-state-metrics가 클러스터 정보를 읽을 수 있게 주는 권한 설정**. 각 create는 `...created`로 성공을 알려 준다.
- **Pod 확인 주의**: 처음에는 grafana가 `0/1 ContainerCreating`이지만 잠시 기다리면 올라온다. **kube-state-metrics는 kube-system, grafana/prometheus-deployment/node-exporter는 monitoring 네임스페이스**에 있다는 점에 주의.
- **접속**: NodePort 방식(노드 지정 포트로 외부 접근) - Prometheus 30003, Grafana 30004, 노드 IP 192.168.56.101. 앞에서 열어 둔 Kubernetes Dashboard 창은 세션이 만료되었으므로 새 창(시크릿 모드)으로 접속.
- **시간 동기화 주의 (강사 강조)**: Prometheus 화면에 분홍/빨간색 경고가 뜨면 내용이 "시간이 맞지 않는다"는 것이며, 이때는 **반드시 시간을 맞춰야** 한다. 처음 설치 때 사용한 시간 동기화(NTP 계열) 명령을 **모든 노드에서 한 번씩 실행한 뒤 Prometheus에 재접속**(정확한 명령어 이름은 STT가 불명확해 확정 불가).
- **Prometheus UI 사용**: Expression 입력란 옆 동그란 버튼 = Metrics Explorer(수집 중인 메트릭 이름 목록; 강사: "표준 메트릭이 약 3천 개 정도 정의되어 있고 대부분을 포함하는 것이 Prometheus의 장점"). "pod", "cpu-core" 등을 검색해 실행하면 Table(텍스트)/Graph(시계열)로 확인. 데모에서는 API 서버 메트릭 `apiserver_cache_list_total`(Result series 62) 조회(API 서버 영역을 가장 자주 쓴다고 언급). **Status -> Targets**: 수집(scrape) 대상과 상태 목록 - kube-state-metrics(1/1 up), kubernetes-apiservers(1/1 up), kubernetes-cadvisor(4/4 up) 등이 UP이면 healthy. Alert 기능은 별도 제공.
- **Grafana 로그인 주의**: 강사가 쓰는 버전은 낮아 로그인 없이 열리지만 **요즘 버전을 설치하면 로그인 창이 뜨므로 admin 계정에 비밀번호를 지정해 접속**하면 된다(화면 모양은 조금 달라도 대부분 비슷).
- **Grafana 데이터 소스/대시보드**: Connections > Data sources > Add data source에는 Grafana Pyroscope, MySQL, PostgreSQL, Azure Monitor 등 여러 종류가 있고 여기서 Prometheus 선택. 이름 prometheus, Connection URL `http://192.168.56.101:30003/`(Prometheus NodePort 주소), 인증은 기본값(No Authentication), **Save & Test -> "Successfully queried the Prometheus API."**면 성공. Dashboards > New > Import: **JSON 파일 업로드 또는 대시보드 ID 입력 후 Load(인터넷 연결 필요)** -> 데이터 소스로 prometheus 선택 -> Import. ID는 grafana.com 대시보드 사이트에서 복사(또는 JSON 다운로드). 이미 다른 대시보드가 있어도 다시 가져와 바꿔 쓸 수 있고, 대시보드를 복사해 나만의 대시보드로 만드는 것도 가능.
  - **13770** "1 Kubernetes All-in-one Cluster Monitoring KR": 클러스터 요약(마스터 정상 가동률 100%, 네임스페이스 6, Pods 23), 노드 현황(k8s-master, k8s-node1~3, Ubuntu 22.04.2 LTS, 커널 6.2.0-39-generic, K8s v1.28.5, containerd://1.6.26), 노드별 CPU/메모리/디스크, 네트워크 트래픽, API 서버 호출 패널.
  - **6417**: 강사가 즐겨 쓰는 ID.
  - **11455** "K8s / Storage / Volumes / Namespace": 볼륨(스토리지) 관련(Current Alerts, Stats, Use, Use vs Capacity, Use Rate 패널 그룹)을 펼쳐서 확인.
  - **"No data" 해결**: 일부 패널이 No data면 연결 자체는 되고 있는 상태이며, **패널 오른쪽 위 점 세 개(...) -> Edit로 들어가 JSON/PromQL 쿼리를 수정**해서 사용하면 좋다고 강사가 안내.

### [사용한 CLI]

**6-1. 매니페스트 내려받기**
```bash
sudo apt -y install git
git clone https://github.com/brayanlee/k8s-prometheus.git
cd k8s-prometheus/
tree
```
- 파일 구성: `grafana/` (grafana-Deployment.yaml, grafana-Service.yaml, kubernetes-cluster-prometheus_rev1.json), `kube-state/` (ClusterRoleBinding, ClusterRole, Deployment, ServiceAccount, Service), `prometheus/` (ClusterRoleBinding, ClusterRole, ConfigMap, DaemonSet-nodeexporter, Deployment, Service).

**6-2. monitoring 네임스페이스 및 리소스 생성**
```bash
kubectl create namespace monitoring

# Prometheus (prometheus/ 폴더)
kubectl create -f prometheus/prometheus-ConfigMap.yaml
kubectl create -f prometheus/prometheus-ClusterRoleBinding.yaml
kubectl create -f prometheus/prometheus-ClusterRole.yaml
kubectl create -f prometheus/prometheus-Deployment.yaml
kubectl create -f prometheus/prometheus-Service.yaml
kubectl create -f prometheus/prometheus-DaemonSet-nodeexporter.yaml

# kube-state-metrics (kube-state/ 폴더)
kubectl create -f kube-state/kube-state-ClusterRoleBinding.yaml
kubectl create -f kube-state/kube-state-ClusterRole.yaml
kubectl create -f kube-state/kube-state-ServiceAccount.yaml
kubectl create -f kube-state/kube-state-Deployment.yaml
kubectl create -f kube-state/kube-state-Service.yaml

# Grafana (grafana/ 폴더)
kubectl create -f grafana/grafana-Deployment.yaml
kubectl create -f grafana/grafana-Service.yaml
```

**6-3. 배포 확인**
```bash
kubectl get po -A
# monitoring: grafana, node-exporter x3(DaemonSet), prometheus-deployment / kube-system: kube-state-metrics 가 Running
```

**6-4. 접속 주소 (NodePort)**
```text
Prometheus : http://192.168.56.101:30003
Grafana    : http://192.168.56.101:30004
```
- Prometheus UI: Graph(Expression 입력, Metrics Explorer 에서 지표 선택, 예: `apiserver_cache_list_total`), Status > Targets 에서 kube-state-metrics, kubernetes-apiservers, kubernetes-cadvisor 등이 UP 인지 확인.

**6-5. Grafana 설정 (웹 UI)**
```text
Grafana 접속 (192.168.56.101:30004) - 강사 버전은 로그인 없이 열리지만, 최신 버전은 로그인 창이 뜨므로 admin 계정에 비밀번호를 지정해 접속
Connections > Data sources > Add data source > Prometheus
  Connection URL: http://192.168.56.101:30003/   (인증 없음 No Authentication)
  [Save & Test] -> "Successfully queried the Prometheus API."

Dashboards > New > Import
  Dashboard ID 입력(13770) > Load > Data Source: prometheus 선택 > Import
  (추가 ID: 6417, 11455)
대시보드 ID 검색: https://grafana.com/grafana/dashboards/?search=kubernetes
```
- ID **13770**: "1 Kubernetes All-in-one Cluster Monitoring KR" (노드/Pod 수, CPU/메모리 등)
- ID **6417**: 추가 쿠버네티스 대시보드
- ID **11455**: K8s / Storage / Volumes / Namespace (https://grafana.com/grafana/dashboards/11455-k8s-storage-volumes-namespace/)

### [확인 방법/주의점]
- 시간이 어긋나면 Prometheus 화면에 분홍/빨간 경고가 뜸(강사 강조): 모든 노드에서 시간 동기화(NTP) 명령을 한 번씩 실행한 뒤 재접속.
- 일부 패널에 "No data" 가 보이면 연결은 정상 상태이며, 패널 우측 상단 ... -> Edit 에서 JSON 내 PromQL 쿼리를 수정해 사용(강사 안내).
- Data source URL 은 Prometheus 의 NodePort(30003) 주소를 사용.
- NodePort 접속 IP 는 Pod 위치와 관계없이 노드 IP(여기서는 192.168.56.101) 사용.

---

## Step 7. KubeShark - Kubernetes API 트래픽 모니터링

### [목적]
Kubeshark(Wireshark for Kubernetes)를 설치해 클러스터 내 Pod/서비스 간 API 트래픽(Request/Response)을 실시간으로 확인하고 Service Map 으로 호출 관계를 시각화한다.

### [이론 설명]
- **Kubeshark란**: Kubernetes 구성요소끼리 오가는 API 트래픽을 잡아 보여 주는 도구. 패킷 캡처/필터링 도구 Wireshark의 이름을 딴 **"Wireshark의 Kubernetes 버전"**이며, 네트워크·보안 분야에서 Wireshark로 패킷을 수집·분석하듯 쿠버네티스에서 같은 일을 한다. 슬라이드(40쪽): Kubernetes 내부 네트워크에 대한 **실시간 프로토콜 수준 가시성** 제공 / 컨테이너, Pod, 노드, 클러스터에 들어오고 나가는 모든 트래픽과 페이로드를 캡처·모니터링하는 **Kubernetes용 API 트래픽 분석기** / 특정 서비스에 도달하는 여러 프로토콜(HTTP, HTTPS 등)의 요청·응답 확인. 요청/응답뿐 아니라 Kubernetes가 선언형 YAML로 동작하므로 어떤 매니페스트로 어떤 Pod/Deployment가 동작하는지, 서비스를 이용하는 오브젝트가 무엇인지까지 제공.
- **동작 기술 (슬라이드 41쪽)**: **eBPF**(BPF = Berkeley Packet Filter의 확장판; 커널 공간과 유저 공간을 모니터링해 인사이트 제공) + **kprobe**(TCP 커넥션의 Source/Destination IP·Port를 저장하고, 수집된 Trace로부터 Request/Response를 하나로 묶어 제공; 커널 함수 실행 지점에 관측 코드를 끼우는 방식). 실제 TCP 패킷은 **PCAP** 파일로 임시 저장해 다운로드 가능(Wireshark 등에서 열 수 있음). **TLS로 암호화된 패킷도 평문으로 확인** 가능. Wireshark가 NIC를 지정하면 OSI 7계층 기준으로 보여 주듯 Kubeshark도 계층별 정보를 제공.
- **설치(슬라이드 42쪽)**: kubeshark.co의 설치 스크립트를 curl로 받아 셸로 실행하면 **약 30초** 만에 완료. 두 질문에 모두 y: ① system-wide 설치(sudo, `/usr/local/bin/kubeshark`) ② `ks` 별칭. 강사는 이미 설치했다가 지운 환경이라 alias 질문이 안 나왔고(실제 터미널은 "You can use the ./kubeshark command now." 표시), 교재 화면에서는 질문이 두 번 나오니 그대로 진행하면 된다고 안내.
- **`ks -h`**: "Kubeshark: The API Traffic Analyzer for Kubernetes - An extensible Kubernetes-aware network sniffer and kernel tracer". 가장 중요한 명령은 **tap**(Capture the network traffic in your Kubernetes cluster). clean(모든 Kubeshark 리소스 제거), export(캡처 트래픽을 PCAP이 든 TAR로 내보내기), proxy(웹 UI를 proxy/port-forward로 열기), logs(GitHub 이슈/트러블슈팅용 로그 ZIP), config(기본값 설정 생성), console(스크립팅 콘솔 로그 스트림), scripts, license, pro, version, completion. 플래그 `-d/--debug`, `-h/--help`, `--set strings`(값 override).
- **`ks tap` 동작**: 현재 클러스터의 Pod를 읽어 대상을 정하고(Targeted pod ...) **Helm**으로 Kubeshark 리소스(hub, front, worker)를 설치(`Installing using Helm: kube-version=">= 1.16.0-0" release=kubeshark`). 설치 후 마지막 줄 `Kubeshark is available at: url=http://127.0.0.1:8899`. 기본값은 **클러스터 내부(ClusterIP)로만** 연결되며 proxy를 통해 127.0.0.1:8899로 접속하므로 강사는 master VM 리눅스의 Firefox로 접속했다. **외부에서 접근하려면 Helm으로 서비스 설정을 업데이트해 NodePort 방식으로 변경**.
- **웹 UI**: localhost:8899에서 현재 클러스터의 트래픽(HTTP, TCP 등)이 실시간 스트리밍("streaming live traffic"). Wireshark처럼 항목을 클릭하면 **REQUEST / RESPONSE / MANIFEST**(사용하는 오브젝트의 매니페스트) 정보 제공. **Service Map**(강사가 가장 좋아하는 기능): Deployment/MSA 등 연동되는 오브젝트 사이의 트래픽 흐름을 동적 지도로 표시하고 실제 트래픽이 발생하면 수치(B/s, KB/s)로 표시. 왼쪽에서 Edges(Bandwidth), Nodes(Resolved Name) 표시 방식 변경, 하단 범례에 DNS / HTTP / TCP 프로토콜 색 표시. 초기에는 calico, dashboard 등 기본 구성요소만 보임. 트래픽 표시 기준을 바꿔 가며 볼 수 있으나 네트워크 지식이 어느 정도 필요.
- **구성요소 (슬라이드 46~47쪽)**: Pod는 default 네임스페이스에 생성. ① **Worker**(DaemonSet, 각 노드에서 발생하는 모든 패킷을 모니터링 - 네트워크/시스템 관련 높은 수준의 권한 필요; 트래픽을 수집·가공해 Hub로 보내는 수집기, Prometheus의 exporter와 비슷) ② **Hub**(Worker가 보낸 여러 패킷 정보를 **WebSocket**으로 전달해 브라우저에서 확인하게 함; 중앙에서 모든 노드 정보를 모음) ③ **Frontend**(웹 브라우저로 Hub와 통신해 데이터를 검색/탐색하는 UI) ④ **CLI**(Kubeshark 설치/삭제, `kubeshark tap`으로 모니터링 시작, Hub에 HTTP 요청을 보내거나 Kubernetes Service와 port-forward 하는 간단한 동작; **Pod가 아니라 명령줄 도구**). 이 클러스터는 master 포함 4노드라 Worker Pod가 4개(각 2/2 Running)이고 Hub가 4대 정보를 중앙 수집해 Frontend에 제공. **설치 후 Worker/Hub/Front 3종 Pod가 Running인지 반드시 확인**.
- **샘플 앱**: `kubectl create deployment myweb --image=nginx:1.25.1-alpine --port=80 --replicas=3` (Deployment = 원하는 개수의 Pod를 유지해 주는 오브젝트; 강사는 아직 kubectl을 본격적으로 배우기 전이라 "이런 명령으로 Deployment를 만든다" 정도로 보라고 함). 3개 Pod IP로 curl을 동시에 던져 트래픽 발생 -> Service Map에 myweb Pod 3개(myweb-df68776d5-...)가 나타남.
- **활용/주의 (슬라이드 50쪽)**: 개발 환경에서 발생 가능한 정책 오류 및 HTTP 요청/응답 내용 확인, 통신 간 Request/Response **Header 확인으로 애플리케이션의 인증 문제 확인** 가능. **Kubeshark는 Network, Memory 자원을 많이 사용하므로 `ks tap` 사용 시 대상을 정확히 지정해 Trace하는 것을 권장**(그냥 `ks tap`은 클러스터 전체를 계속 수집해 데이터가 엄청나게 쌓임). 패턴 `"(calico*|myweb*)"`는 "calico로 시작하거나 myweb으로 시작하는 Pod 이름"을 뜻하는 정규식(`|`는 또는), `-n default`는 default 네임스페이스 한정(이 클러스터는 Calico를 네트워크 정책 연결에 쓰고 Deployment를 default에 만들었기 때문). 제한 후 Service Map에는 myweb Pod 3개로의 트래픽(예: 1.73 KB/s)만 표시되며, curl을 반복하면 실시간 검증 가능. MSA처럼 오브젝트가 많은 구조에서 트래픽이 어디에 집중되는지/에러가 나는 곳이 어디인지 눈으로 확인할 때 유용. 강사: 일반 모니터링은 리소스 오브젝트 중심이며 다른 도구도 있지만 Wireshark에 익숙한 사람에게는 Kubeshark가 더 편할 수 있다.

### [사용한 CLI]

**7-1. 설치**
```bash
sh <(curl -Ls https://kubeshark.co/install)
# Do you want to install system-wide? Requires sudo (y/N)? y   -> /usr/local/bin/kubeshark
# Do you want to add 'ks' alias for Kubeshark? (y/N)? y        -> ks 명령 사용 가능
```

**7-2. 도움말**
```bash
ks -h
```
- 주요 명령: `tap`(클러스터 트래픽 캡처), `clean`(Kubeshark 리소스 제거), `export`(캡처 트래픽을 PCAP TAR 로 내보내기), `proxy`(웹 UI 를 proxy/port-forward 로 열기), `logs`(트러블슈팅용 로그 ZIP), `config`(기본 설정 생성), `console`, `scripts`, `version`, `license`, `pro`, `completion`
- 플래그: `-d, --debug`, `-h, --help`, `--set strings`(Helm 값 override)

**7-3. 실행 및 UI 접속**
```bash
ks tap
# ... Installed the Helm release: kubeshark / Added: pod=kubeshark-hub, pod=kubeshark-front
# Kubeshark is available at: url=http://127.0.0.1:8899
```
- 브라우저에서 `http://127.0.0.1:8899` 접속 (실습은 master VM 의 Firefox 사용). UI: 실시간 트래픽 목록, 항목별 REQUEST / RESPONSE / MANIFEST, **Service Map**(서비스 간 호출 관계, 대역폭 B/s, KB/s).

**7-4. 구성요소 확인**
```bash
kubectl get po -A
# default 네임스페이스: kubeshark-front, kubeshark-hub, kubeshark-worker-daemon-set-xxxxx (노드 수만큼, 2/2 Running)
```

**7-5. 샘플 앱으로 트래픽 발생**
```bash
kubectl create deployment myweb --image=nginx:1.25.1-alpine --port=80 --replicas=3
kubectl get po -o wide | grep myweb        # 3개 Pod 의 IP 확인
curl 10.111.156.69; curl 10.109.131.8; curl 10.111.218.70     # 각 Pod IP 로 요청
```
- 옵션: `--image`(컨테이너 이미지), `--port=80`(컨테이너 포트), `--replicas=3`(Pod 3개).

**7-6. 특정 Pod 만 대상으로 캡처**
```bash
ks tap -n default "(calico*|myweb*)"
curl 10.111.156.69; curl 10.109.131.8; curl 10.111.218.70
```
- `-n default`: default 네임스페이스만 대상, `"(calico*|myweb*)"`: 이름이 calico 또는 myweb 로 시작하는 Pod 만 정규식으로 필터. Service Map 에서 myweb 3개 Pod 의 트래픽(예: 1.73 KB/s)이 표시됨.

### [확인 방법/주의점]
- 설치 스크립트는 `curl` 로 외부 스크립트를 받아 실행(`sh <(curl ...)`)하므로 신뢰할 수 있는 출처인지 확인.
- 모든 노드에 Worker DaemonSet 이 배포되므로 리소스 사용 증가 (Network, Memory).
- 기본 접속은 ClusterIP + proxy(127.0.0.1:8899) 이므로 원격에서 보려면 Helm 설정으로 NodePort 를 사용해야 함.
- 정리: `ks clean` 으로 Kubeshark 리소스 제거(자료의 `ks -h` 목록 기준).

- (강사 경고) Kubeshark 는 Network/Memory 자원을 많이 사용하므로 `ks tap` 은 `-n` 과 Pod 이름 패턴으로 대상을 제한할 것(미지정 시 클러스터 전체를 계속 수집해 데이터가 쌓임).
- 설치 후 Worker(노드 수만큼, 2/2) / Hub / Front 3종 Pod 가 Running 인지 확인. 기본 접속은 ClusterIP + proxy(127.0.0.1:8899)이며 외부 접속은 Helm 으로 NodePort 변경.
- Request/Response Header 확인으로 애플리케이션 인증 문제를 점검할 수 있음. TLS 암호화 패킷도 평문 확인 가능, PCAP 내보내기(`ks export`) 지원.

---

## Step 8. Portainer - Kubernetes 클러스터 GUI 관리

### [목적]
Portainer(CE)를 NodePort 방식으로 설치해 웹 GUI 로 Kubernetes 리소스(Dashboard, Applications, Logs, kubectl shell)를 관리한다.

### [이론 설명]
- **Portainer 소개**: 쿠버네티스 클러스터의 리소스/애플리케이션을 관리하는 **웹 GUI 기반 컨테이너 관리 도구**. Part 1(Docker)에서 Docker와 연동해 써 봤으므로 여기서는 Kubernetes를 연동한다. 강사: "간단하게 쓸 수 있는 웹 기반 도구가 필요할 때" 권장, 오픈소스 도구가 매우 많으니 운영/개발 시 본인에게 편리한 도구를 찾아 쓰면 좋다. 슬라이드: **Portainer-ce**는 Docker, Swarm, Kubernetes 환경을 관리하는 컨테이너화된 애플리케이션용 경량 서비스 제공 플랫폼 / 배포·사용이 간단 / Kubernetes의 대부분 리소스(Pod, 볼륨, 네트워크 등) 관리 / 메모리·CPU 사용량 및 각 노드에서 실행 중인 이벤트와 애플리케이션 모니터링 / 이미지 `portainer/portainer-ce`(https://hub.docker.com/r/portainer/portainer-ce). **상용(Business) 버전과 커뮤니티(CE) 버전** 두 가지가 있고 이 강의는 CE를 사용. GUI는 명령어 대신 마우스로 조작하는 화면이라 kubectl에 아직 익숙하지 않은 입문자가 상태를 눈으로 확인하기에 좋다.
- **설치 방식 2가지**: **LoadBalancer**(`portainer-lb.yaml`, 외부 로드밸런서로 노출) / **NodePort**(`portainer.yaml`, 각 노드에 열린 포트로 접속). 둘 다 다음 챕터에서 배울 Service 오브젝트의 "외부 노출" 기술이며 차이는 나중에 다룬다. 이번에는 NodePort 사용: **HTTP 30777, HTTPS 30779**(필요하면 수정 가능). 매니페스트는 `curl -O`로 내려받거나 URL을 그대로 `kubectl apply -f`에 주는 두 방법 중 하나를 쓰면 된다. (온프레미스 VM에는 외부 LoadBalancer가 없으므로 NodePort 선택.)
- **PV/PVC와 Pending 경고 (강사 경고)**: Portainer도 Pod로 동작하며 데이터 저장을 위해 **PV(PersistentVolume, 클러스터에 준비해 둔 저장 공간) / PVC(PersistentVolumeClaim, Pod가 "저장 공간을 달라"는 요청; PV와 연결되면 Bound)**를 사용한다(아직 배우기 전 내용이라 핵심만). **PV를 먼저 만들지 않고 Portainer yaml을 바로 실행하면 PVC가 연결되지 못해 Pending이 발생하고 그 결과 Deployment의 Pod가 올라오지 않는다.** 그래서 슬라이드의 PV 소스를 그대로 사용해 PV를 먼저 생성한다. PV 항목: capacity 10Gi(10기비바이트) / accessModes ReadWriteOnce(한 노드에서 읽기/쓰기 마운트) / persistentVolumeReclaimPolicy Retain(PVC가 삭제되어도 데이터 보존) / local.path `/DATA1`(노드 안의 실제 디렉터리) / nodeAffinity hostname In k8s-node1(이 볼륨은 k8s-node1에서만 사용 가능).
- **설치 순서/검증**: PV 적용 -> Portainer 적용 -> 확인. 생성 오브젝트: namespace(portainer), ServiceAccount(portainer-sa-clusteradmin), PersistentVolumeClaim, ClusterRoleBinding, Service, Deployment. **Deployment가 쓰는 PVC가 미리 만든 PV와 연동(Bound)되는지 꼭 체크**. 강사 검증 결과: Pod 1개가 k8s-node1에 배치(Running), Service는 NodePort, PORT(S) `9000:30777/TCP,9443:30779/TCP,30776:30776/TCP`(9000=HTTP, 9443=HTTPS에 대응하는 NodePort 30777/30779). 접속은 Pod가 있는 k8s-node1 IP: `http://192.168.56.101:30777/`.
- **초기 접속 오류와 해결**: 강사 화면은 바로 계정 생성 창이 나왔지만, 어떤 경우 **"New Portainer installation - Your Portainer instance timed out for security purposes. To re-enable your Portainer instance, you will need to restart Portainer."**가 표시된다. Portainer가 시작 후 일정 시간 안에 초기 설정이 이뤄지지 않으면 보안상 잠기는 동작이며, **`kubectl -n portainer rollout restart deployment portainer`**로 Deployment를 재시작하면 계정 생성 창으로 바뀐다. 초기 관리자: Username `admin`, 화면 안내 "The password must be at least 12 characters long." -> **비밀번호 12자 이상**, Create user(강사가 입력한 비밀번호는 가려져 있어 미기재).
- **Home / Live connect**: Home에 `local` 환경 카드(Kubernetes v1.28.5, 16 CPU, 16.4 GB RAM, 4 nodes)가 보이고 **Live connect**로 실제 쿠버네티스에 접속. Dashboard에 Namespaces 7, Applications 18, Services 11, ConfigMaps 19, Secrets 6, Volume 1 등 요약 수치(캡처 시점 "Refreshing total" 갱신 중), 왼쪽 메뉴 Applications / Services / Ingresses / ConfigMaps & Secrets / Volumes / Cluster. Applications에는 앞 클립에서 설치한 kubeshark가 남아 있어 default 네임스페이스에 Helm 앱으로 표시(Not ready)되며 앞으로 배포하는 애플리케이션도 여기서 확인.
- **Environments / CE 제한**: Settings > Environments > Add environment(Environment Wizard)에서 연결할 환경 선택. 화면상 "Connect to existing environments"의 Docker Standalone, Docker Swarm은 선택 가능, Kubernetes/ACI/Nomad 항목은 Business Feature로 비활성 표시, "Set up new environments"(Provision KaaS Cluster, Create Kubernetes cluster)도 Business 기능(화면 표 기준). 강사 설명: Docker Standalone/Swarm은 Part 1에서 붙여 봤고, Kubernetes·ACI·Nomad, master가 여러 개인 멀티 클러스터까지 연결 가능하나 **일부는 비즈니스(상용) 버전에서만 제공**되며 CE는 그 범위까지가 제한. CE에서도 애플리케이션/네임스페이스/서비스 등을 훑어보고 가볍게 관리할 수 있고 명령용뿐 아니라 "보는(관전)" 용도로도 사용 가능.
- **myweb 테스트**: `kubectl create deployment myweb --image=nginx:1.25.1-alpine --port=80 --replicas=3` 후 `kubectl get deploy,po -o wide | grep myweb`(grep = myweb 포함 줄만 필터). Pod 3개가 node2, node3, node1에 하나씩 배치(replicas 3이라 깔끔히 분산; 캡처 시점 2개 ContainerCreating, 1개 Running). 강사: Portainer 안에서는 (Pod 생성보다) **"관리" 기능을 제공**. Applications > myweb 상세: 기본 정보/이벤트/YAML 내용, Application type = Deployment, Status = Replicated 3/3, **Edit external application / Rolling restart / Redeploy** 버튼, Accessing the application(포트 노출 없음), Application containers 표(Pod, Name, Image, Image Pull Policy, Status, Node, Pod IP, Creation date, Actions: Logs/Console; kubectl get pods와 동일 정보). **Logs**: 컨테이너 로그(docker-entrypoint.sh 실행, "start worker processes" 등) + Auto-refresh / Search / Download logs. **kubectl shell**(왼쪽 메뉴): 별도 터미널 없이 Portainer 안에서 kubectl 명령 실행, 창이 뜨는 데 시간이 조금 걸리며 안내 "#Run kubectl commands inside here / #e.g. kubectl get all", 강사는 `kubectl get all`, `kubectl get pod`로 조회. 강사 정리: 복잡하지 않고 손쉬운 관리 도구가 필요할 때 운영 쪽에서 편리하며 Docker에서 이미 써 봤으므로 Kubernetes에서도 편리할 것.

### [사용한 CLI]

**8-1. 매니페스트 다운로드 (참고)**
```bash
# LoadBalancer 방식
curl -O https://raw.githubusercontent.com/portainer/k8s/master/deploy/manifests/portainer/portainer-lb.yaml
kubectl apply -n portainer -f https://raw.githubusercontent.com/portainer/k8s/master/deploy/manifests/portainer/portainer-lb.yaml

# NodePort 방식 (HTTP 30777, HTTPS 30779) - 본 실습에서 사용
curl -O https://raw.githubusercontent.com/portainer/k8s/master/deploy/manifests/portainer/portainer.yaml
```

**8-2. PersistentVolume 생성**
```bash
vi portainer-pv.yaml
```
```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: portainer-pv
  namespace: portainer
spec:
  capacity:
    storage: 10Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  local:
    path: /DATA1
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - {key: kubernetes.io/hostname, operator: In, values: [k8s-node1]}
```
- capacity 10Gi / ReadWriteOnce(한 노드에서 읽기/쓰기) / Retain(PVC 삭제 후에도 데이터 유지) / local path `/DATA1` / nodeAffinity 로 k8s-node1 에 고정.
- (자료에는 node1 의 `/DATA1` 디렉터리 생성 명령은 표시되지 않음; local PV 사용 시 해당 경로가 노드에 있어야 함.)

**8-3. 설치 및 확인**
```bash
kubectl apply -f portainer-pv.yaml                # persistentvolume/portainer-pv created
kubectl apply -n portainer -f https://raw.githubusercontent.com/portainer/k8s/master/deploy/manifests/portainer/portainer.yaml
# namespace, serviceaccount(portainer-sa-clusteradmin), pvc, clusterrolebinding, service, deployment 생성

kubectl -n portainer get pv,pvc                   # PV/PVC 모두 Bound
kubectl -n portainer get po,svc -o wide           # Pod 1/1 Running(k8s-node1), Service NodePort 9000:30777/TCP, 9443:30779/TCP
```

**8-4. 접속 및 초기 설정**
```text
http://192.168.56.101:30777/        # Pod 가 실행 중인 k8s-node1 IP + NodePort(HTTP)
```
- 접속 시 "New Portainer installation - Your Portainer instance timed out for security purposes" 화면이 나오면 Portainer 를 재시작해야 함:
```bash
kubectl -n portainer rollout restart deployment portainer
```
- 재접속 후 관리자 계정 생성: Username `admin`, 비밀번호는 **12자 이상** -> Create user.

**8-5. 웹 UI 사용**
- Home: `local` 환경(Kubernetes v1.28.5, 4 nodes 등) -> **Live connect** 클릭 -> Dashboard(Namespaces, Applications, Services, ConfigMaps, Secrets, Volumes 개수).
- Settings > Environments > Add environment: 화면상 Docker Standalone/Swarm 은 선택 가능, Kubernetes/ACI/Nomad 및 새 환경 생성(KaaS, Create Kubernetes cluster) 항목은 Business Feature 로 비활성 표시.
- 배포 테스트:
```bash
kubectl create deployment myweb --image=nginx:1.25.1-alpine --port=80 --replicas=3
kubectl get deploy,po -o wide | grep myweb
```
```bash
# Portainer 왼쪽 메뉴 kubectl shell 안에서 실행한 조회 명령
kubectl get all
kubectl get pod
```
- Portainer 의 Applications > myweb : Deployment, Replicated 3/3, Pod 목록(이미지, 상태, 노드, Pod IP), **Logs**(nginx 로그, Auto-refresh/Search/Download), **Console**, YAML 편집/Rolling restart/Redeploy, 그리고 **kubectl shell** (예: `kubectl get all`, `kubectl get pod`).

### [확인 방법/주의점]
- PV 를 먼저 생성하지 않으면 PVC Pending -> Portainer Pod Pending.
- 최초 접속 시간 초과 화면이 나오면 `rollout restart` 로 재시작 후 바로 관리자 계정을 만들 것.
- `get pv,pvc` 가 둘 다 Bound 인지, Service 의 포트 매핑(9000:30777, 9443:30779) 확인. HTTPS 는 30779.
- 비밀번호 12자 이상 조건.

- (강사 경고) PV 없이 Portainer yaml 을 적용하면 PVC Pending -> Pod 미기동. Deployment 가 쓰는 PVC 가 미리 만든 PV 와 Bound 되는지 확인.
- "Your Portainer instance timed out for security purposes" 화면은 시작 후 일정 시간 내 초기 설정이 없으면 잠기는 보안 동작 -> rollout restart 후 즉시 admin 계정 생성(비밀번호 12자 이상).
- Service PORT(S) `9000:30777/TCP,9443:30779/TCP,30776:30776/TCP` : HTTP 30777 / HTTPS 30779. 접속 IP 는 Pod 가 있는 노드(k8s-node1) 기준으로 시연.

---

## Step 9. k9s - 터미널 기반 Kubernetes 리소스 관리

### [목적]
k9s(Kubernetes CLI + 터미널 UI)를 설치하고 단축키로 Pod/Deployment/Namespace 를 빠르게 조회/관리한다.

### [이론 설명]
- **k9s란**: Kubernetes 클러스터를 터미널에서 사용하기 위한 **오픈소스 CLI 도구**(https://k9scli.io/). 터미널 기반 UI를 통해 kubectl 명령을 입력하지 않아도 직관적으로 Kubernetes 리소스를 **생성, 업데이트, 로깅, 제거**할 수 있다. 강사: 명령이 익숙하지 않을 때 도구를 찾게 되며(앞의 Portainer에 이어), k9s는 UI를 제공하면서도 CLI 성격을 함께 가진 도구. Kubernetes를 "K8s"(K와 s 사이 8글자)라고 줄이듯 k9s는 "Kubernetes CLI 스타일" 정도의 뜻으로 이해하면 되며, 명령 대신 **단축키(shortcut key)**가 명령을 대신해 준다.
- **설치**: GitHub 릴리스의 tar.gz(k9s_Linux_x86_64.tar.gz, v0.26.7, 약 17MB)를 `wget`으로 받는다(GitHub 릴리스 주소는 실제 파일 주소로 안내하므로 `302 Found` 리다이렉트 후 objects.githubusercontent.com에서 저장되는 것이 정상). `tar zxvf`(z=gzip 해제, x=추출, v=과정 출력, f=파일 지정)로 풀면 LICENSE, README.md, k9s 3개 파일이 나오고 k9s가 실행 파일. **PATH에 잡힌 경로 중 한 곳(가장 일반적인 `/usr/local/bin`)에 두어야 어느 경로에서나 실행**되므로 `echo $PATH`로 경로를 확인한 뒤 `sudo mv k9s /usr/local/bin/k9s`.
- **`k9s info`**: Configuration `/home/student/.config/k9s/config.yml`(홈 아래 `.config/k9s/`), Logs `/tmp/k9s-student.log`, Screen Dumps `/tmp/k9s-screens-student`. `k9s version`: Version v0.26.7 (Commit 37569b8..., Date 2022-10-18). 사용법이 궁금하면 먼저 `k9s help`로 명령(completion, help, info, version)과 플래그를 보라고 강사가 안내. 플래그는 k9s 시작 시 붙이는 옵션이며 `--readonly`로 실행하면 읽기 전용 모드가 되어 실수로 리소스를 바꾸는 일을 줄일 수 있다.
- **실행 화면**: `k9s`만 입력하면 시작. 상단에 Context `kubernetes-admin@kubernetes`, Cluster `kubernetes`, User `kubernetes-admin`, K9s Rev v0.26.7, K8s Rev v1.28.5와 로고. 기본 화면은 `Pods(all)[27]`로 `kubectl get pod -A`와 같은 정보(앞선 실습의 myweb Pod 및 kube-system, kubernetes-dashboard, monitoring, portainer 네임스페이스 Pod가 함께 표시). 상단 가운데에 현재 화면에서 쓸 수 있는 단축키(a Attach, ctrl-d Delete, d Describe, e Edit, l Logs, s Shell, y YAML)가 표시된다.
- **기본 조작**: Pod 선택 후 **Enter** = 그 Pod의 컨테이너 목록(`Containers(default/myweb-...)[1]`: nginx, 이미지 nginx:1.25.1-alpine, READY true, STATE Running, PORTS 80), **ESC** = 이전 화면(브라우저 "뒤로 가기"처럼 breadcrumb으로 계속 되돌아감). **e** = 리소스를 YAML 형태로 **vi 편집기와 연동**해 열어 고쳐 저장하면 수정 반영. **s** = 화면 위에 `<<K9s-Shell>> Pod: default/myweb-... | Container: nginx` 표시와 함께 컨테이너 접속(kubectl exec와 같은 방법, **exit**로 k9s 화면 복귀). 그 밖에 삭제(Delete), Attach, 로그(Logs) 확인 가능. 강사: 명령 대신 키 하나로 조회/편집/접속하며 몇 번 쓰면 손에 익는다.
- **`?` 도움말**: RESOURCE / GENERAL / NAVIGATION 세 갈래(ESC로 복귀). 아래 표 참고. **슬라이드 69의 단축키 표는 텍스트 추출 시 열이 뒤섞여 대응이 일부 불확실**하며(ctrl+d가 두 번 적혀 있음: 삭제 / label 출력으로 읽힘), 강사도 실제로는 `?` 도움말(ctrl-d = Delete)을 기준으로 확인하라는 취지. 슬라이드 내용 요지: `?` 단축키 확인 / `e` edit(예: Deployment의 replicas 수정) / `:deployment`(또는 `:deploy`)로 Deployment만 조회 후 `s`로 scale 등 replica 수 수정 -> `r` restart 계열 조작을 `kubectl get po -w`로 관찰하는 방식 / `ctrl+d` Deployment 삭제 / `s` Pod의 shell 접속 / `:ns` namespace 조회 후 해당 ns에서 Enter하면 그 영역의 Pod 조회 / Pod에서 Enter = Pod 내 container 조회 / `esc` 해제(뒤로) / `:q` 종료(위 대응은 추출본 기준 추정). **Skin 변경**: https://github.com/derailed/k9s/tree/master/skins 참고, `k9s info`의 Configuration 경로에 `skin.yml` 파일 생성(강사는 스킨 변경 등은 이후 직접 활용해 보라고만 언급).
- **`:ns` 사용**: `:`(콜론)을 누르면 vi처럼 화면 아래에 커맨드 라인이 나타나고 `ns`를 입력하면 `Namespaces(all)[8]` 목록(default, kube-node-lease, kube-public, kube-system, kubernetes-dashboard, monitoring, portainer + 첫 줄 all)만 표시. `monitoring` 선택 후 Enter -> `Pods(monitoring)[5]`(grafana, node-exporter 3개, prometheus-deployment). `:deploy`는 Deployment만 출력, `:q`는 종료. 라벨 출력 등도 같은 콜론/단축키 방식.
- **강사 마무리**: 이번 클립은 새로 시연한 것 없이 설치하고 클러스터 리소스를 살펴본 것. 몇 번 써 보면 손에 익고 단축키만으로 간단한 모니터링이 가능하며 리소스의 **로그, 이벤트, describe 정보**를 모두 확인할 수 있어 이 메뉴만으로도 운영이 쉬워진다. 3장 관리 도구(Dashboard, Prometheus & Grafana 등)를 모두 설치해 쓸 필요는 없고 **본인 업무에 적합한 도구를 선택**해 사용하기를 권장한다. 다음은 챕터 종료 화면 "Now let's go! to the universe of kubernetes".

### [사용한 CLI]

**9-1. 설치**
```bash
wget https://github.com/derailed/k9s/releases/download/v0.26.7/k9s_Linux_x86_64.tar.gz   # 약 17MB, GitHub 리다이렉트(302) 후 다운로드
tar zxvf k9s_Linux_x86_64.tar.gz       # LICENSE, README.md, k9s 3개 파일 (z: gzip, x: 추출, v: 진행 표시, f: 파일 지정)
echo $PATH                             # /usr/local/bin 이 PATH 에 포함되어 있는지 확인
sudo mv k9s /usr/local/bin/k9s
k9s info
```
- `k9s info` 출력: Configuration `/home/student/.config/k9s/config.yml`, Logs `/tmp/k9s-student.log`, Screen Dumps `/tmp/k9s-screens-student`.

**9-2. 버전/도움말**
```bash
k9s version     # Version: v0.26.7
k9s help
```
- Commands: `completion`, `help`, `info`, `version`
- 주요 Flags:

| 옵션 | 설명 |
|---|---|
| `-A, --all-namespaces` | 모든 네임스페이스로 시작 |
| `-c, --command string` | 시작 시 로드할 기본 리소스 지정 |
| `--context string` | 사용할 kubeconfig context |
| `--kubeconfig string` | kubeconfig 파일 경로 |
| `-n, --namespace string` | 네임스페이스 지정 |
| `-l, --logLevel string` | 로그 레벨(info, warn, debug, trace, error; 기본 info) |
| `-r, --refresh int` | 기본 새로고침 주기(초, 기본 2) |
| `--headless / --logoless / --crumbsless` | 헤더 / 로고 / 브레드크럼 숨김 |
| `--readonly / --write` | 읽기 전용 모드 / 쓰기 모드 |

**9-3. 실행 및 사용**
```bash
k9s
```
- 시작 화면: Context(kubernetes-admin@kubernetes), Cluster, User, K9s Rev v0.26.7, K8s Rev v1.28.5, 기본으로 `Pods(all)` 목록 (kubectl get pod -A 와 유사).
- Pod 에서 사용하는 단축키: `Enter`(컨테이너 목록, ESC 로 돌아감), `d` describe, `e` edit(YAML 을 vi 로 수정), `l` logs, `s` shell(Pod 컨테이너 내부 접속, kubectl exec 와 유사, `exit` 로 복귀), `y` YAML, `a` attach, `ctrl-d` delete, `ctrl-k` kill.
- 도움말 `?` : RESOURCE / GENERAL / NAVIGATION 단축키 목록.

| 구분 | 키 | 동작 |
|---|---|---|
| RESOURCE | 0 / 1 | all / default 네임스페이스 |
| RESOURCE | a / d / e | Attach / Describe / Edit |
| RESOURCE | ctrl-d / ctrl-k | Delete / Kill |
| RESOURCE | l / p | Logs / Logs Previous |
| RESOURCE | s / n / f | Shell / Show Node / Show PortForward |
| RESOURCE | shift-f / ctrl-r | Port-Forward / Refresh |
| GENERAL | `:q` | 종료 |
| GENERAL | `:cmd` / esc | 명령 모드 / 뒤로가기 |
| GENERAL | `/term` / `?` | 필터 모드 / 도움말 |
| NAVIGATION | j / k, h / l | 아래 / 위, 왼쪽 / 오른쪽 |
| NAVIGATION | g / shift-g | 맨 위 / 맨 아래 |

```text
:ns       # Namespace 목록 (Enter 로 선택하면 해당 namespace 의 Pod 목록, 예: monitoring 의 Pod 5개)
:deploy   # Deployment 목록 (슬라이드 설명상 e 로 replicas 수정 등; s/r 대응은 슬라이드 표가 뒤섞여 불확실)
:q        # k9s 종료
```
```bash
# (슬라이드 69) k9s 에서 Deployment replicas 수정/restart 시 다른 터미널에서 Pod 변화 관찰
kubectl get po -w        # -w: watch, 변경 사항을 실시간 출력
```
- 슬라이드의 사용 예(추출본에서 열이 뒤섞여 일부 불확실): `e` 로 Deployment 의 replicas 수정, `ctrl+d` 로 삭제, Pod 변화는 `kubectl get po -w` 로 관찰, `esc` 로 이전 화면(브레드크럼). 실제 영상에서 강사가 시연한 것은 Enter(컨테이너 조회), e(YAML 편집), s(shell, exit 로 복귀), ?(도움말), :ns -> monitoring Pod 5개 조회까지이며 정확한 키는 `?` 도움말 기준.

### [확인 방법/주의점]
- `/usr/local/bin` 에 이동해야 어느 경로에서든 `k9s` 실행 가능 (`sudo mv`).
- `--readonly` 로 실행하면 실수로 삭제/수정하는 것을 막을 수 있음.
- ctrl-d 는 삭제이므로 조작 주의. (자료의 설치 버전은 v0.26.7)

---

## 부록. 최종 구성 요약
- 클러스터: master(192.168.56.100) + node1(.101) + node2(.102) + node3(.103), Kubernetes v1.28.5, containerd 1.6.26, CNI Calico v3.25.0
- 관리도구 접속 정보
  - Kubernetes Dashboard: `https://192.168.56.100:6443/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/#/login` (클라이언트 인증서 + 토큰)
  - Prometheus: `http://192.168.56.101:30003` / Grafana: `http://192.168.56.101:30004`
  - Kubeshark: `http://127.0.0.1:8899` (`ks tap`)
  - Portainer: `http://192.168.56.101:30777` (HTTPS 30779)
  - k9s: 터미널 `k9s`
