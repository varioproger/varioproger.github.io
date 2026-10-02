# Part 01. Docker 기초 환경 구축 (컨테이너 개념 → VirtualBox/Ubuntu → Docker 엔진 → Portainer → 엔진 업데이트 → Docker CLI 1)

> 출처: 초격자 패키지 Online "Docker 컨테이너 빌드업" ch1~ch3 강의 요약 PDF 및 "컨테이너 관리를 위한 Docker CLI (1)".
> 실습 환경 값(계정 kevin, 호스트명 hostos1, IP 192.168.56.101 등)은 모두 강의 예시값이며, 강의에서도 "교육용 예시"라고 밝힌 값이다. 비밀번호(예: pass123#)는 실제 운영 서버에서 절대 쓰지 말 것(강의 설명).
> 실제 구축 순서에 맞게 재배열했다.

## 전체 구축 순서 한눈에 보기

| Step | 내용 | 비고 |
|---|---|---|
| 1 | 컨테이너 기술 개념 | 이론 |
| 2 | 컨테이너 가상화 vs VM 가상화, 컨테이너 엔진 구조(dockerd/containerd/runC) | 이론 |
| 3 | Oracle VirtualBox 설치 | Windows 호스트 |
| 4 | Ubuntu 22.04 ISO 다운로드와 VM(fc_hostos1) 생성/설정 | VirtualBox |
| 5 | Ubuntu 22.04 설치 (디스크 파티션 포함) | VM 안 |
| 6 | Ubuntu 네트워크 고정 IP, 필수 패키지, 원격 접속 도구(PuTTY/MobaXterm/WinSCP) | VM + Windows |
| 7 | Docker 엔진(docker-ce) 설치 | Ubuntu |
| 8 | sudo 없이 docker 쓰기 (docker 그룹, systemd 등록) | Ubuntu |
| 9 | docker info로 엔진 구성 확인 | Ubuntu |
| 10 | GUI 관리 도구 Portainer 생성 | Docker 컨테이너 |
| 11 | 최신 Docker 엔진을 써야 하는 이유 | 이론 |
| 12 | 운용 중인 Docker 엔진 업데이트 (19.03 → 24.0.2) | 실습 |
| 13 | 컨테이너 운영 기본 CLI (docker run 옵션, top/port/stats, cadvisor, logs, inspect, cp/restart) | 실습 |

---

## Step 1. 컨테이너 기술 개념 이해

### [목적]
컨테이너가 무엇이고 왜 쓰는지, 어떤 종류가 있으며 Docker가 어떤 위치인지 이해한 뒤 실습으로 들어간다. (강사: 이 챕터는 실습보다 "개념 잡기"에 가깝다.)

### [이론 설명]

**1-1. 컨테이너 기술이란 (Why Container)**
- 컨테이너 = **패키징한 논리적 공간**: 애플리케이션을 언제든 실행 가능하도록 필요한 모든 요소(소스코드, 구성요소, 종속성 등)를 하나의 런타임 환경으로 묶은 것. Docker에서는 이것을 **Dockerfile build**로 구현한다.
- 순서: 컨테이너가 먼저가 아니라 **이미지(Image)가 먼저**. 소스코드/환경/종속관계를 묶은 실행 환경을 이미지로 만들고, 이미지를 run하면 컨테이너가 실행된다. Dockerfile을 **IaC(Infrastructure as Code, 코드로 정의하는 인프라)** 라고 부른다.
- 컨테이너 = **경량의 격리된 프로세스**
  - 경량/microVM: 리눅스 최소 이미지(Alpine Linux)는 약 5MB 수준. VM처럼 동작하지만 "마이크로 VM"이라 부른다.
  - 운영체제 수준의 가상화: 커널을 포함하지 않고 **호스트 OS의 커널을 공유**한다. (Docker의 핵심)
  - 격리 = 독립성: 다른 컨테이너에 영향을 주지 않고, 상태값을 저장하지 않는 stateless 환경 제공.
  - 프로세스: 컨테이너 안에는 아주 작은 OS를 붙잡고 있는 프로세스가 있다. 호스트에서 `ps`로 보듯 컨테이너 안에서도 `ps` 조회 가능.
- 어디서나 배포 + 개발에 집중: 개인 PC, 온프레미스, 퍼블릭 클라우드(AWS 등) 어디서나 빠르고 효율적으로 배포 가능. 서버 구성/OS/네트워크/개발도구 설치 같은 반복 작업 대신 개발자는 개발에 집중.
- 스노플레이크(snowflake) 서버 문제: 개발·테스트·운영 서버를 따로 만들어 쓰다 보면 설정이 조금씩 달라지는 "눈송이 서버"가 되는데, Docker 이미지는 **불변(immutable)** 이라 항상 같은 컨테이너로 배포된다.

**1-2. 컨테이너의 특징 (What Container)**
- 최소한의 Image로 실행되므로 경량 (베이스 이미지(base image)에 필요한 요소만). MSA(마이크로서비스 아키텍처)에 적합.
- 빠른 실행: 프로세스 수준 속도로 `docker run` 한 줄로 실행. 여러 컨테이너를 한 번에 돌리는 것은 Docker가 제공하는 오케스트레이션 도구인 `docker compose`가 담당.
- 이식성(portability): 만든 이미지를 Docker Hub, GitHub 소스, 프라이빗 레지스트리, AWS ECR 등에 올려 두면 Docker가 설치된 어디서든 실행 가능.
- 관리 비용 절감 & DevOps: 컨테이너는 애플리케이션 환경에 대한 관리만 요구. 개발팀과 운영팀의 업무 분리 → DevOps workflow에 최적. 운영팀이 인프라 이미지를 제공하고 개발자가 소스를 올려 이미지 버전을 만들면 CI/CD로 자동 배포.

**1-3. 컨테이너 사례 (When Container)** (슬라이드 사례)
구글 웹 앱(약 20억 개 수준의 컨테이너를 일주일에 up/down), 에어비앤비 추천, 넷플릭스 추천, 당근마켓 딥러닝 추천, 엔씨소프트 게임, 삼성전자 헬스케어, 타다 배차, 토스 금융 등. 강사 언급: "컨테이너 표준 도구는 Docker, 오케스트레이션 도구는 쿠버네티스"라고들 말하지만 기업 성향에 따라 다르다.

**1-4. 컨테이너 타입 (Type Container)**
- 컨테이너는 이미지를 패키징해서 run으로 사용할 수 있게 하는 **패키징 메커니즘**. 시스템/애플리케이션/라우터 컨테이너 3종이 있으나 일반적으로 앞의 두 가지.
- **시스템(or OS) 컨테이너**: 호스트OS 위에 Ubuntu/CentOS7/RHEL8 같은 배포판 리눅스 이미지를 통해 배포. 내부에 여러 애플리케이션/라이브러리 설치 가능. 대표: LXC, LXD, OpenVZ, Linux VServer, BSD Jails.
- **애플리케이션 컨테이너**: 단일 애플리케이션 실행을 위해 해당 서비스를 패키징. 3-tier(frontend-backend-DB)면 tier별로 개별 컨테이너로 실행하여 연결. 대표: Docker container runtime, Rocket. 예: Nginx 1.23.1 / Python 3.10 / MySQL 8.0 컨테이너를 각각 실행.
- 구분 기준은 **PID 1번 프로세스**: 시스템 컨테이너는 PID 1이 systemd, 애플리케이션 컨테이너는 Nginx/Python/MySQL 같은 애플리케이션 자체가 PID 1 (컨테이너 안에서 `ps`로 확인).

**1-5. Docker Container 이야기**
- Docker는 2013년 3월 PYCON에서 "Open Source Container Project"로 공개 (발표자: 솔로몬 하익스(Solomon Hykes), 원 소속 dotCloud). 컨테이너 기술은 리눅스의 탄생과 거의 비슷한 시기부터 존재했고, Docker는 이를 쉽게 쓰게 만든 도구.
- Docker 작업 절차 (Build → Run 테스트 → Push → Pull → Run):

| 단계 | 동작 | 설명 |
|---|---|---|
| 1 | Dockerfile 작성 | 원하는 세팅값/라이브러리/환경설정/패키지를 코드로 등록 (Application Infra 구성) |
| 2 | Build | Dockerfile로 이미지를 만든다 = 패키징 (Application 패키징: Docker Image) |
| 3 | Run (테스트) | 로컬에서 컨테이너를 실행해 잘 돌아가는지 확인 |
| 4 | Push | 퍼블릭/프라이빗 레지스트리 또는 퍼블릭 클라우드 레지스트리에 업로드 (공유·저장 목적, 예: Docker Hub) |
| 5 | Pull | 필요할 때 언제든 이미지를 내려받기 |
| 6 | docker run | 받은 이미지로 컨테이너를 실행해 배포 (Application 배포: Docker Container) |

- 이미지 공유: Docker Hub (https://hub.docker.com)에 퍼블릭으로 올리거나 개인용 프라이빗 레지스트리를 이용(무료 계정은 프라이빗 1개 수준). 퍼블릭 클라우드는 AWS ECR, 구글 GCR 등. 백업/파일 공유용으로 `docker save`로 파일 저장도 가능. GitHub와 Docker Hub 연동 시 소스 수정이 이미지에 자동 반영되는 Automated Build 기능이 있다(강사: 지금은 계정에 따라 제한될 수 있음).

### [사용한 CLI]
이 Step은 개념 설명이며 실행 명령은 없다. 개념 설명 중 언급된 명령 이름만 정리한다.

```bash
# (개념 설명 중 언급된 명령 — 실제 실습은 이후 Step)
docker run      # 이미지를 컨테이너로 실행하는 한 줄 명령
docker compose  # 여러 컨테이너를 한 번에 실행하는 Docker 제공 오케스트레이션 도구
docker save     # 이미지를 파일로 저장해 공유/백업
docker build    # Dockerfile -> Image 생성 (Build)
ps              # 컨테이너 안/호스트에서 프로세스 조회 (PID 1 확인 기준)
```

### [확인 방법/주의점]
- 자기 점검: 컨테이너를 설명하는 세 가지 표현(패키징한 논리적 공간, 격리, 프로세스)은? / 스노플레이크 서버 문제를 Docker 이미지가 어떻게 줄이나? / 시스템 컨테이너와 애플리케이션 컨테이너를 PID 1 기준으로 어떻게 구분하나? / Dockerfile부터 컨테이너 배포까지의 흐름(Build, Run 테스트, Push, Pull, docker run)을 말할 수 있는가?

---

## Step 2. 컨테이너 가상화 vs VM 가상화, 컨테이너 엔진 구조

### [목적]
Docker가 VM과 무엇이 다른지, Docker 엔진(dockerd / containerd / runC)이 무엇을 하는지 이해한다. (다음 클립은 Play with Docker(PWD) 체험이며, 이후 이 과정에서는 직접 VirtualBox 위에 Ubuntu+Docker를 구축한다.)

### [이론 설명]

**2-1. 컨테이너 기술 발전사 (trend history)**

| 시기 | 단계 | 슬라이드 표시 |
|---|---|---|
| 1991~ | Linux 프로세스 격리 | LINUX, cgroup, namespace, chroot, LXC |
| 2010~ | Virtual Machine 가상화 기술 | VMware, VirtualBox, Xen, KVM |
| 2013~ | Container 가상화 기술 | dotCloud, docker |
| 2015~ | Container Orchestration tool | kubernetes, docker SWARM, AWS, Microsoft Azure, Google Cloud Platform, CI/CD |

- LXC(LinuX Container): 리눅스 프로세스 격리 기술을 묶은 것. 구성 요소
  - **chroot(change root)**: 격리된 루트 환경(독립된 파일 시스템 공간) 생성
  - **cgroup(control group)**: CPU·메모리·디스크·네트워크 등 자원 할당·제한하는 커널 기술
  - **namespace**: 디스크 마운트, 프로세스 정의, 네트워크 설정 등을 컨테이너별로 분리하는 커널 기술
- 2010년경 VM 가상화 확산: VMware(Player 무료, Workstation·서버 계열 유료), Oracle VirtualBox(기본 무료, 이 과정에서 사용), Xen, KVM.
- 2013년 dotCloud가 발표한 Docker: 기존 격리 기술을 "도커 명령어"라는 플랫폼으로 묶어 간단히 사용하게 함.
- 2015년경 오케스트레이션 도구: 구글의 보그(Borg) 프로젝트가 모체인 쿠버네티스(2014년 출시), Docker Swarm 등. 멀티 호스트·멀티 클러스터 환경에서 컨테이너를 배포하고 중앙에서 관리하는 도구.

**2-2. 가상화(virtualization)란**
- 서버·스토리지·네트워크·애플리케이션 등을 가상화하여 하드웨어 리소스를 효율적으로 사용하는 것. 핵심 이득은 **효율성**. 하이퍼바이저 기반 가상머신(VM)이 대표(VMware, VirtualBox).
- 하이퍼바이저(hypervisor): 물리 하드웨어 위에서 가상머신을 만들고 자원을 나눠 주는 소프트웨어.

**2-3. 컨테이너 가상화 vs VM 가상화**
- 공통점: 애플리케이션 프로세스와 종속 요소·소스 등을 패키징(이미지화)하여 HostOS와 격리된 환경을 제공. (컨테이너 이미지 표준은 OCI)

| 구분 | VM 가상화 | 컨테이너 가상화 |
|---|---|---|
| 가상화 수준 | 하드웨어 수준의 가상화 | 운영체제(OS) 수준의 가상화 |
| 게스트 OS / 커널 | 호스트 OS와 별도의 게스트 OS, 그 안에 독립된 커널 | 커널이 없고 호스트 운영체제의 커널을 공유 |
| 자원 할당 | CPU·메모리를 게스트 OS에 나눠 줌 | 하드웨어를 나눠 주는 수준의 가상화가 없음 |
| 특징 | 원하는 애플리케이션을 설치하는 하드웨어 수준의 가상화 | 경량이면서 원하는 애플리케이션 환경을 빠르게 번들링하여 패키징 |

- 부팅 vs run: VM은 BIOS → 부트로더 → 커널 → systemd 순으로 **부팅**. 컨테이너는 부팅 없이 `docker run` 한 줄로 프로세스 기동만 하면 몇 초 안에 실행.
- 배포 방식 비교: 일반 서버(온프레미스) / 가상머신(GB 단위: HW → Host OS → Hypervisor → Guest OS + Binaries & Libraries → App) / 컨테이너(MB 단위: HW → Host OS → Docker engine → Binaries & Libraries → App).

**2-4. 컨테이너화 기술의 변화**
- LXC + Kernel → libcontainer + Kernel → **containerd, runC** + Kernel (현재 Docker 엔진 모델). 커널의 cgroup/namespace를 공유해서 쓴다는 원칙은 바뀌지 않음.

| 구성 요소 | 역할 |
|---|---|
| runC | 커널 기술의 공유를 통해 컨테이너 생성 지원 |
| containerd | 생성된 컨테이너의 라이프사이클 관리 지원 |
| dockerd | 사용자 환경에서의 명령(CLI) 전달 |

- 구성 요소 사이의 통신은 소켓(예: `/var/run/docker.sock`)으로 이루어진다. daemon(데몬) = 백그라운드에서 요청을 기다리는 프로그램. "dockerd = 우리가 입력한 docker 명령을 받아 주는 서버 프로그램".

**2-5. dockerd 기능 (슬라이드)**

| 항목 | 설명 |
|---|---|
| Docker CLI API | docker 명령(CLI)을 모두 받아서 처리 |
| swarmkit | 도커의 오케스트레이션(swarm) 기능 |
| Logs mgmt | 컨테이너 로그 수집·관리. 기본은 JSON 파일 저장, AWS/GCP 등 로그 플러그인 가능 |
| Storage mgmt | 이미지와 컨테이너 파일을 관리하는 스토리지 (overlay2 드라이버 사용) |
| libnetwork | 도커의 기본 네트워크 라이브러리 (bridge, overlay 네트워크) |
| buildkit | 이미지 빌드 기술 (`docker build` 명령을 dockerd가 받아 처리) |
| DCT | Docker Content Trust. 이미지 위·변조 여부를 알려 주는 이미지 보호(보안) 기술 |
| Image mgmt | 이미지의 생성·변경·삭제·백업 등 관리 |

- 네트워크 보충: libnetwork가 만드는 `docker0` 같은 인터페이스 위에 virtual ethernet 서비스가 동작. 모든 컨테이너는 `eth0` 인터페이스를 가지며, 컨테이너 내부 네트워크 = "샌드박스"(namespace 기술). 그 안에 IP, MAC 주소, 라우팅 테이블, iptables 등이 포함됨.

### [사용한 CLI]
이 Step도 개념 학습이며 실행 CLI는 없다. 언급된 파일/명령:

```bash
docker build              # dockerd가 buildkit으로 이미지 빌드
docker run                # 컨테이너를 부팅 없이 프로세스로 기동
ps                        # 컨테이너 내부 프로세스 조회
/var/run/docker.sock      # (명령이 아닌 파일) dockerd 등 구성 요소 간 통신에 쓰이는 소켓
```

### [확인 방법/주의점]
- 자기 점검: 각 발전 단계(1991, 2010, 2013, 2015)의 기술 / chroot·cgroup·namespace 역할 / VM과 컨테이너의 공통점·차이점(게스트 OS, 커널, 가상화 수준) / runC·containerd·dockerd의 역할 / dockerd 기능 8가지와 DCT의 의미.

---

## Step 3. Oracle VirtualBox 설치

### [목적]
Windows 위에 VirtualBox를 설치하여, 이후 Ubuntu 22.04 VM(Docker 호스트)을 올릴 기반을 만든다. (2장은 PWD 대신 직접 Docker 실습 환경을 구축하는 6개 클립: ① VirtualBox 설치 ② Ubuntu 다운로드/설치 ③ Ubuntu 환경 구성 ④ Docker 엔진 설치/확인 ⑤ 간단한 컨테이너 서비스 구현 ⑥ GUI 관리도구 Portainer)

### [이론 설명]
- 왜 리눅스를 알아야 하나: Docker 개발자 솔로몬 하익스는 리눅스 엔지니어였고, docker 명령은 리눅스 명령과 매우 비슷하다. 리눅스에 어느 정도 익숙해야 Docker가 덜 어렵다.
- 호스트(Host): 실제 컴퓨터와 그 위 OS(여기서는 Windows). 게스트(Guest): 가상 머신 안에서 돌아가는 OS(여기서는 Ubuntu). 하이퍼바이저: 하드웨어 자원을 나눠 여러 VM을 동시에 돌릴 수 있게 하는 소프트웨어.
- **BIOS(CMOS)에서 CPU 가상화 기능(VT-x / AMD-V / VMX; "Intel Virtualization Technology" 등) 활성화 필요**. 기본값이 비활성인 경우가 있어, 켜고 재부팅해야 VirtualBox가 제대로 동작. CMOS 진입 키는 컴퓨터마다 다름(Del, F2, F12 등).
- VirtualBox를 설치하면 가상 네트워크 어댑터 **VirtualBox Host-Only Ethernet Adapter**가 추가된다 (제어판 > 네트워크 및 인터넷 > 네트워크 연결 화면에서 확인). 게이트웨이/클라이언트 역할을 함께 할 수 있으며 기본 IP는 **192.168.56.1**. 강의에서는 게이트웨이를 `.2`번으로 잡고, `.1`번(Windows 쪽)은 접속 도구(PuTTY, MobaXterm 등)가 쓰는 IP로 활용한다. (강의 숫자 표기는 "192.168.56.x 대역" 정도로 이해)

### [사용한 CLI]
CLI 없이 GUI 설치다. 절차는 다음과 같다.

```text
1) 구글에서 "oracle virtualbox download" 검색 -> virtualbox.org 의 Downloads
2) "VirtualBox binaries" 목록에서 "Windows hosts" 선택 (강의 시점 최신 7.0.8, 최신 버전 사용 권장) -> .exe 다운로드
3) exe 실행 -> Setup Wizard: 기본값으로 [Next >]
   - Custom Setup: 기본 선택 그대로 Next (설치 위치 C:\Program Files\Oracle\VirtualBox\)
   - Warning: Network Interfaces (설치 중 네트워크가 일시적으로 끊김 안내) -> Yes (가상 NIC 설치에 필요)
   - Ready to Install -> Install
   - 완료 화면에서 "Start Oracle VM VirtualBox ... after installation" 체크 해제 -> Finish
4) Windows 재부팅 (강사 권장: 가상 네트워크 어댑터가 완벽히 적용되도록)
5) 바탕화면에 Oracle VM VirtualBox 아이콘이 보이면 설치 완료
```

### [확인 방법/주의점]
- BIOS에서 가상화 기능이 켜져 있는지 먼저 확인.
- 설치 후 네트워크 연결 화면에 "VirtualBox Host-Only Ethernet Adapter"가 생겼는지 확인.
- 재부팅은 필수는 아니지만 권장(강사 조언).

---

## Step 4. Ubuntu 22.04 ISO 다운로드와 VM(fc_hostos1) 생성/설정

### [목적]
Ubuntu 22.04 ISO를 받아 VirtualBox VM을 만들고, 설치 전 필수 설정(부팅 순서, CPU 확장, 디스크 2장, 네트워크 어댑터 2개)을 마친다.

### [이론 설명]
- **ISO**: OS 설치 CD의 내용을 통째로 담은 이미지 파일. 가상 환경에서는 VM에 연결하면 "CD-ROM"으로 인식되어 거기서 부팅/설치한다.
- 다운로드: 검색 "ubuntu 22.04 download" → ubuntu.com "Download Ubuntu Desktop"(https://ubuntu.com/download/desktop) → **Ubuntu 22.04.2 LTS** "Download 22.04.2" (ISO 약 4.58GB ≈ 4.6GB). 사이트 권장 사양: 2GHz dual-core CPU, 4GB 메모리, 25GB 디스크.
- VM 사양 설계 (슬라이드: Docker hostos1 CPU*4, Memory*4G 최소 권장):
  - 메모리: 최소 4GB(4096MB). 강사는 8GB(8192MB) 권장/설정.
  - CPU(코어): 최소 4개 권장(PC 사양에 맞게 조절).
  - 디스크: **2장** — OS용 100GB + Docker 전용 100GB. 동적 할당(**"Pre-allocate Full Size"는 체크하지 않음**; 최대치 예약이 아니라 쓴 만큼만 커짐).
  - 네트워크: 어댑터 2개
    - 어댑터 1 = **NAT**: 외부 통로. APT 등 패키지를 내려받을 때 사용.
    - 어댑터 2 = **호스트 전용(Host-Only)**: VirtualBox Host-Only Ethernet Adapter, 내부(infra) 네트워크. (PuTTY/MobaXterm/WinSCP 접속용)
- 강사 계획: host OS1(메인 Docker 운영 서버)을 구축하고 Docker 설치 후 복제(Clone)해 host OS2를 만들어 총 3대 인프라 구성(이번 강의 중 hostos3도 등장). 복제 시 메모리 8GB가 되면 부담이므로 4GB로 줄일 수 있다.
- 디스크 분리 이유: C 드라이브(OS 있는 드라이브)는 피하고(OS와 디스크 I/O 겹침으로 성능 문제), Docker 전용 디스크를 따로 분리.
- 그래픽 컨트롤러 기본은 VMSVGA. Ubuntu 설치 후 재부팅했는데 검은 화면에서 멈추면 VM을 셧다운 후 그래픽 컨트롤러를 **VBoxVGA**로 바꾸면 해결(대처법).

### [사용한 CLI]
GUI 조작 절차이다 (VirtualBox 관리자 "새로 만들기" 및 "설정"):

```text
[새로 만들기]
- 이름: fc_hostos1 / 폴더: D:\fc_hostos1 (C 드라이브 피함)
- 종류: Linux / 버전: Ubuntu (64-bit)   (Docker는 64비트에서만 가능)
- ISO Image: 여기서 고르지 않고 나중에 "설정"에서 연결
- Hardware: 메모리 8192 MB, Processors 4 (Enable EFI 미체크)
- Virtual Hard disk: Create a Virtual Hard Disk Now, 100 GB, "Pre-allocate Full Size" 체크하지 않음
  -> Finish -> VM 목록에 fc_hostos1 생성 (SATA 포트 0: fc_hostos1.vdi)

[설정(S)]
- 시스템 > 마더보드: 부팅 순서 = 광디스크 1번, 하드디스크 2번 (플로피 해제)
- 시스템 > 프로세서: Processors 4, 실행 제한 100%, Extended Features: PAE/NX 사용하기(E) 체크
  (Ubuntu 22 + Docker 24 조합에서 확장 기능 빠져 컴퓨터가 다운된 경험이 있어 추가. 상황에 맞게)
- 디스플레이: 비디오 메모리 16MB, 그래픽 컨트롤러 기본 VMSVGA (문제 시 VBoxVGA)
- 저장소:
  * 컨트롤러 IDE 아래 "비어 있음" -> 광디스크 아이콘 -> "디스크 파일 선택하기" -> ubuntu-22.04.2-desktop-...iso
  * 컨트롤러 SATA 아래 fc_hostos1.vdi (OS용)
  * SATA 컨트롤러의 "네모+아이콘(하드 디스크 추가)" -> "새로 만들기" -> VDI(VirtualBox Disk Image)
    -> 동적 할당(미리 할당하지 않음), 100GB, 파일명 fc_hostos1_docker.vdi -> Finish
    -> 목록에서 이 디스크를 Choose(선택) 후 확인 => 디스크 2장
- 오디오: 필요 없으므로 끔 / USB: 끔(빼는 것이 편리)
- 네트워크: 어댑터 1 = NAT(외부 연결), 어댑터 2 = 네트워크 어댑터 사용하기 체크,
  다음에 연결됨 "호스트 전용 어댑터", 이름 "VirtualBox Host-Only Ethernet Adapter"
- (확인) Windows 네트워크 연결에서 이더넷 2 = VirtualBox Host-Only Ethernet Adapter, TCP/IPv4 IP 192.168.56.1 대역
```

```text
[VM 시작 후 호스트 키 변경]
VirtualBox 관리자: 파일 > 환경 설정 > 입력 > 가상 머신 탭 > "호스트 키 조합" 칸의 기존 값(오른쪽 Ctrl)을
지운 뒤 직접 Ctrl+Alt 입력 -> 이후 VM 안에서 Ctrl+Alt를 누르면 마우스/키보드가 Windows로 빠져나옴
```

### [확인 방법/주의점]
- 시작 시 error 메시지가 나오면 설정값을 확인(에러 코드를 구글링).
- GRUB 화면(GNU GRUB 2.06: Try or Install Ubuntu / Ubuntu (safe graphics) / OEM install / Test memory)이 뜨면 VM 창 안을 마우스로 클릭하고 Enter -> "Try or Install Ubuntu".
- VM 요약에서 확인: 광디스크 ubuntu-22.04.2-desktop-amd64.iso(4.59GB), SATA 포트 0 fc_hostos1.vdi(100GB), SATA 포트 1 fc_hostos1_docker.vdi(100GB).

---

## Step 5. Ubuntu 22.04 설치 (파티션 구성 포함)

### [목적]
OS 디스크(sda)와 Docker 전용 디스크(sdb)를 분리 파티셔닝하여 Ubuntu 22.04 Desktop을 설치한다.

### [이론 설명]
- 설치 마법사 흐름: Install Ubuntu → English/English(US) (한국어도 지원되나 글자 깨짐이 있어 English 권장) → Continue → **Updates and other software: Normal installation**(웹 브라우저·유틸리티·오피스 등 일반 설치; Minimal은 웹 브라우저와 기본 유틸리티만. Ubuntu desktop 버전이지만 Docker 서버로 운영) → **Installation type: Something else**(Erase disk...는 디스크 2장을 모두 지우고 자동 분할하므로 사용하지 않고 직접 파티션 구성).
- 디스크 표기: `sd` = SCSI Device, `a, b, c, d...` = 디스크 번호. sda = Linux OS용 디스크, sdb = Docker 전용 디스크.
- **파티션 계획표 (슬라이드)**

| Partition | Size | Use as | Mount point |
|---|---|---|---|
| /dev/sda1 | 70000 MB | XFS | / |
| (sda2) | 8192 MB | swap | - |
| /dev/sda3 | 15000 MB | Ext4 | /DATA |
| /dev/sda4 | 남은 용량 | Ext4 | /BACKUP |
| /dev/sdb1 | 모든 용량 | XFS | /var/lib/docker |

  - sda1: XFS, `/`(OS 영역). XFS는 쓰기 속도가 좋고 AWS 같은 클라우드에서 XFS 파일시스템이 대부분이라는 강사 설명.
  - sda2 = swap: 가상 메모리, 보통 물리 메모리의 2배를 잡지만 이번에는 메모리 8GB와 같은 8192MB로 지정.
  - sda3: Ext4, `/DATA` (데이터용). sda4: 남은 용량 Ext4, `/BACKUP` (백업용).
  - **sdb1 (가장 중요)**: sdb 전체, XFS, 마운트 지점 `/var/lib/docker` — Docker 전용 영역(OS와 분리해 성능 보장; 강사: "반드시 분리하는 것을 권장").
- 부트로더는 `/dev/sda`에 설치. 마지막에 Install Now.
- 계정(강의 예시): Your name/username = `kevin`, computer's name(hostname) = `hostos1`, 비밀번호 `pass123#`(강의용 — 실제 서버에 쓰지 말 것), "Require my password to log in". 기본 계정과 hostname은 되도록 동일하게. 설치 때 만든 계정은 **sudo(root 역할) 권한**을 가진다.

### [사용한 CLI]
GUI 설치 마법사 절차:

```text
1. Welcome: Install Ubuntu -> Keyboard layout English(US) -> Continue
2. Updates and other software: Normal installation (Download updates while installing Ubuntu 체크 안 함)
3. Installation type: Something else -> Continue
4. /dev/sda 선택 -> New Partition Table... -> Continue -> free space(107.4 GB) 선택 -> + 버튼으로 파티션 하나씩 추가
   (Create partition: Size / Type for the new partition = Primary / Location = Beginning of this space / Use as / Mount point)
   sda1: 70000 MB, Primary, Beginning, XFS journaling file system, Mount point /
   sda2: 8192 MB, swap
   sda3: 15000 MB, Ext4, /DATA
   sda4: 남은 용량(약 14180 MB), Ext4, /BACKUP
5. /dev/sdb 선택 -> New Partition Table -> Continue -> free space 전체를 +
   sdb1: XFS, Mount point /var/lib/docker
6. Device for boot loader installation: /dev/sda (ATA VBOX HARDDISK)
7. Install Now -> 경고창 "Go back to the menu and correct this problem?" (부트로더용 Reserved BIOS boot area 안내) -> Continue를 3번 눌러 진행
8. Where are you?: Seoul -> Continue
9. Who are you?: Your name kevin / computer's name hostos1 / username kevin / password(강의용 예시) / Require my password to log in
10. 설치 5~10분 -> Restart Now -> 로그인 -> Connect Your Online Accounts 등 안내창은 Skip/Next로 넘김
```

### [확인 방법/주의점]
- 로그인 후 해파리 그림의 Ubuntu 바탕화면이 나오면 설치 완료. 이어서 Step 6 진행.
- 설치 화면의 sda2 표기는 슬라이드에서 이름 칸이 비어 있으나 설치기에서는 /dev/sda2로 표시됨.

---

## Step 6. Ubuntu 네트워크 고정 IP, 필수 패키지, 원격 접속 도구

### [목적]
VM에 고정 IP를 부여하고, 필수 패키지(openssh-server, vim, net-tools)를 설치한 뒤 Windows에서 PuTTY / MobaXterm / WinSCP로 접속할 수 있게 한다. (강사: 리눅스 화면에서 직접 작업하면 불편하므로 SSH 기반 원격 도구를 사용. 슬라이드: 이 도구들은 구글에서 무료로 받을 수 있다. 강의에서는 MobaXterm 메인, 파일 전송은 WinSCP.)

### [이론 설명]
- SSH(Secure Shell): 네트워크를 통해 다른 컴퓨터의 터미널에 안전하게 접속하는 프로토콜(기본 포트 22). PuTTY·MobaXterm은 그 접속용 프로그램(클라이언트), WinSCP는 SSH 기반 복사(SCP) GUI 도구.
- 어댑터 역할

| 어댑터 | 역할(강사 설명) | 설정 |
|---|---|---|
| Ethernet (enp0s3) | VM 설정에서 외부 연결용으로 잡은 NAT | 사용만 하고 바꿀 일 없음(기본값 유지). 값은 10.0.2.15 (공통) |
| Ethernet (enp0s8) | 실습용 인프라 네트워크: PuTTY/MobaXterm/WinSCP가 접속할 IP | 수동으로 고정 IP 설정 |

- enp0s8 Wired Settings > IPv4 탭, IPv4 Method 기본값 Automatic (DHCP) → **Manual**.

| 항목 | 입력값 | 설명 |
|---|---|---|
| IPv4 Method | Manual | 수동 지정 |
| Address | 192.168.56.101 | 192.168.x 계열은 사설(Private) IP. 2번 서버는 102 예정 |
| Netmask | 255.255.255.0 | 서브넷 마스크 |
| Gateway | 192.168.56.2 | Windows가 가진 1번을 써도 되고 VM 자체의 2번을 써도 됨. 1번은 클라이언트 접속용으로 쓸 것이므로 2번으로 지정 |
| DNS | 8.8.8.8 | 구글 DNS 사용 |

  Apply 후 네트워크를 한 번 껐다 켜기(내렸다 올리기)를 권장, 다시 들어가 IP가 101번으로 잡혔는지 확인.
- ifconfig는 Ubuntu 22.04에 기본 설치되어 있지 않아(net-tools 필요) `Command 'ifconfig' not found` 가 나온다.
- ping이 실패하면 보통 Windows 방화벽 문제 — Windows Defender 방화벽을 일시적으로 해제(개인용 및 공용 모두)한 뒤 다시 확인 (교육 환경에서만 임시로).

### [사용한 CLI]

```bash
# 터미널 열기: 바탕화면 우클릭 > Open in Terminal
# 현재 서버 확인
kevin@hostos1:~$ hostname
hostos1
kevin@hostos1:~$ id
uid=1000(kevin) gid=1000(kevin) groups=1000(kevin),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),122(lpadmin),135(lxd),136(sambashare)

# 패키지 목록 갱신 (패스워드 입력 프롬프트: [sudo] password for kevin)
kevin@hostos1:~$ sudo apt update
...
201 packages can be upgraded. Run 'apt list --upgradable' to see them.

# 아직 설치 전이라 ifconfig 실행 시 not found
kevin@hostos1:~$ ifconfig
Command 'ifconfig' not found, but can be installed with:
sudo apt install net-tools

# 필수 패키지 설치: SSH 서버, vim 편집기(vi 확장), net-tools(ifconfig 등)
kevin@hostos1:~$ sudo apt -y install openssh-server vim net-tools
# (강의 정리: sudo apt -y update 도 함께 실행)
```

```bash
# IP 확인 (enp0s3 = NAT, enp0s8 = 192.168.56.101, lo = 루프백)
kevin@hostos1:~$ ifconfig
enp0s8: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.56.101  netmask 255.255.255.0
        ...
lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0

# 통신 확인: -c 2 는 두 번만 보내는 옵션 (Windows 192.168.56.1, 구글 DNS 8.8.8.8)
kevin@hostos1:~$ ping -c 2 192.168.56.1
kevin@hostos1:~$ ping -c 2 8.8.8.8
```

```text
[PuTTY 세션]
1) Host Name (or IP address): 192.168.56.101
2) Saved Sessions 이름: hostos1 (강의 시연에서는 fc_hostos1)
3) Port 22 / Connection type SSH
4) Save 클릭 (나중에 Load로 불러오기)
5) Window > Appearance > Change: 글꼴 Consolas, 크기 16 (취향)
6) Session으로 돌아가 Save 후 Open
7) PuTTY Security Alert (서버 호스트 키 처음 저장 경고) -> 예(Y)/Accept
8) login as: kevin / password 입력
   -> Welcome to Ubuntu 22.04.2 LTS (GNU/Linux 5.19.0-42-generic x86_64)

[MobaXterm 세션 (Portable 버전 사용)]
Session 버튼 -> SSH -> Remote host 192.168.56.101 -> Specify username 체크 kevin -> Port 22 -> OK
(PuTTY 세션은 Import PuTTY sessions 로 가져오기 가능. 두 번째 서버용으로 Remote host 192.168.56.102, kevin, 22 세션을 미리 등록. 글씨 확대: Ctrl + 마우스 스크롤)

[WinSCP]
New Site: File protocol SCP (기본은 SFTP지만 강의에서는 SCP로 변경)
Host name 192.168.56.101 / Port 22 / User name kevin / Password -> Save -> Login
(처음 접속 시 호스트 키 경고 -> Add/예)
Windows 파일(예: httpd24.txt)을 끌어다 서버로 복사 후 터미널에서 확인:
```

```bash
kevin@hostos1:~$ ls
Desktop Documents Downloads httpd24.txt Music Pictures Public snap Templates Videos
```

### [확인 방법/주의점]
- `hostname`, `id` 결과가 PuTTY/MobaXterm에서 같으면 같은 서버에 접속된 것.
- ping 실패 시 Windows 방화벽 확인.
- Software Updater 창은 "Remind Me Later"로 넘긴다.
- 이후 hostos2(192.168.56.102)는 Docker 설치 후 복제해 만들 계획(강의 언급).

---

## Step 7. Docker 엔진(docker-ce) 설치 — Ubuntu 22.04 apt 방식

### [목적]
Ubuntu 22.04에서 APT로 최신 Docker 엔진(docker-ce, 강의 시점 24.0.2)을 설치한다. (필수 패키지 → GPG 키 → 저장소 등록 → 설치)

### [이론 설명]
- Docker 설치 조건: **리눅스 커널 3.10 이상, 64비트 OS**. `uname -a`로 확인(예: 5.19, x86_64).
- Docker에는 CE(Community Edition)와 EE(Enterprise Edition)가 있고 CE를 설치.
- 필수 패키지 5개

| 패키지 | 역할 |
|---|---|
| apt-transport-https | Docker CE를 받을 주소가 HTTPS이므로 HTTPS 링크로 패키지를 받을 때 쓰는 패키지 |
| ca-certificates | HTTPS(SSL)에는 인증서가 필요하므로 인증서 기능을 쓰게 해 주는 패키지 |
| curl | URL로 데이터를 주고받는 도구(이후 GPG 키 내려받기에 사용) |
| gnupg-agent | GNU Privacy Guard(GPG) 기반 패키지 서명 보호 기능을 위한 에이전트 |
| software-properties-common | Docker 저장소 정보를 등록하는 등 저장소(repository) 관리 기능 제공 |

- GPG 키: "이 패키지는 Docker가 서명한 진짜 패키지"임을 검증하는 공식 키. Ubuntu 22.04부터 보안이 강화되어 예전의 `apt-key`(등록된 키로 패키지를 가져오는 방식) 대신 **keyring**(키를 별도 파일로 관리) 방식을 권장. apt-key는 deprecated 경고가 나옴.
- `curl -fsSL`: -f(오류 시 실패 처리), -s(진행 표시 숨김), -S(오류는 표시), -L(리다이렉트 따라가기). `gpg --dearmor`는 바이너리 형식 변환, `-o`는 출력 파일 경로.
- Docker 지문(fingerprint): `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88` (마지막 8자리 `0EBFCD88`로 조회 가능).
- 저장소 한 줄의 의미: `deb`(Debian 계열 패키지) / `arch=$(dpkg --print-architecture)`(현재 CPU 아키텍처, 예: amd64) / `signed-by=...keyring.gpg`(위에서 만든 keyring으로 검증) / `https://download.docker.com/linux/ubuntu` / `$(lsb_release -cs)`(Ubuntu 22.04 코드네임 jammy) / `stable`(안정화된 stable 채널. edge가 아닌 stable 선택) / `| sudo tee ... > /dev/null`(결과를 파일에 쓰고 화면 출력은 생략).
- `apt-cache policy docker-ce`: Installed (none) = 미설치, Candidate = 설치될 후보 버전(예: 5:24.0.2-1~ubuntu.22.04~jammy). 특정 버전 설치는 `docker-ce=VERSION` 형식(apt 문법).
- docker-ce 설치 시 containerd.io, docker-ce-cli, docker-compose-plugin, docker-buildx-plugin 등이 함께 설치된다.

### [사용한 CLI]

```bash
# 1) 설치 조건 확인: 커널 3.10 이상, 64비트(x86_64)
kevin@hostos1:~$ uname -ar
Linux hostos1 5.19.0-42-generic #43~22.04.1-Ubuntu SMP PREEMPT_DYNAMIC Fri Apr 21 16:51:08 UTC 2 x86_64 x86_64 x86_64 GNU/Linux

# 2) 패키지 목록 갱신 (앞 클립에서 했으면 생략 가능)
kevin@hostos1:~$ sudo apt update

# 3) 필수 패키지 5개 설치 (apt 와 apt-get 어느 쪽이든 무방, -y 는 질문에 자동 yes)
kevin@hostos1:~$ sudo apt-get install -y \
> apt-transport-https \
> ca-certificates \
> curl \
> gnupg-agent \
> software-properties-common
# 또는: sudo apt -y install \ ...

# 4) Docker 공식 GPG 키를 keyring 파일로 저장 (22.04 권장 방식)
kevin@hostos1:~$ curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# (참고) 구방식 apt-key add — "apt-key is deprecated" 경고가 나옴. 22.04 에서는 keyring 방식 권장
kevin@hostos1:~$ sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
# 등록된 키(지문) 확인: Docker Release (CE deb) <docker@docker.com> 항목 확인
kevin@hostos1:~$ sudo apt-key fingerprint
kevin@hostos1:~$ sudo apt-key fingerprint 0EBFCD88

# 5) Docker 저장소 등록 (/etc/apt/sources.list.d/docker.list 생성)
kevin@hostos1:~$ echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 6) 저장소 반영을 위한 목록 갱신 (download.docker.com jammy InRelease, jammy/stable amd64 Packages 확인)
kevin@hostos1:~$ sudo apt update      # (강의 화면에서는 sudo apt -y update)

# 7) 설치 가능한 버전 확인
kevin@hostos1:~$ sudo apt-cache policy docker-ce
docker-ce:
  Installed: (none)
  Candidate: 5:24.0.2-1~ubuntu.22.04~jammy
  Version table:
     5:24.0.2-1~ubuntu.22.04~jammy 500
        500 https://download.docker.com/linux/ubuntu jammy/stable amd64 Packages
     5:24.0.1-1~ubuntu.22.04~jammy 500
        500 https://download.docker.com/linux/ubuntu jammy/stable amd64 Packages

# 8) docker-ce 설치 (containerd.io, docker-ce-cli, docker-compose-plugin, docker-buildx-plugin 함께 설치)
kevin@hostos1:~$ sudo apt -y install docker-ce
```

```bash
# [참고] CentOS 7 설치 (apt 대신 yum, 원리는 동일: 저장소 등록 후 docker-ce 설치)
[root@server ~]# cd /etc/yum.repos.d
[root@server yum.repos.d]# yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
[root@server yum.repos.d]# ls
docker-ce.repo
[root@server yum.repos.d]# yum repolist
docker-ce-stable/7/x86_64        Docker CE Stable - x86_64
[root@server yum.repos.d]# vi docker-ce.repo
[root@server ~]# yum -y install docker-ce && yum -y update
[root@server ~]# mkdir -p /etc/systemd/system/docker.service.d
[root@server ~]# systemctl daemon-reload
[root@server ~]# systemctl enable --now docker
[root@server ~]# systemctl start docker
[root@server ~]# systemctl status docker
# docker 설치 완료 확인
[root@server ~]# docker version

# [참고] Docker 제공 설치 스크립트(get-docker.sh) — OS에 맞게 자동 설치 (CentOS/Ubuntu 모두 가능)
~$ curl -fsSL https://get.docker.com -o get-docker.sh
# shell script 내용 확인 후 변경 가능
~$ sudo vi get-docker.sh
# 실행 권한 부여
~$ chmod +x get-docker.sh
# 설치
~$ sudo sh get-docker.sh

# [참고] Docker 엔진 삭제(재설치 시) — 패키지 삭제 후 Docker가 쓰던 영역까지 제거
~$ dpkg -l | grep -i docker
ii  docker-ce       5:18.09.3~3-0~ubuntu-xenial   amd64   Docker: the open-source application container engine
ii  docker-ce-cli   5:18.09.3~3-0~ubuntu-xenial   amd64   Docker CLI: the open-source application container engine
rc  docker.io       18.06.1-0ubuntu1.2~16.04.1    amd64   Linux container runtime
~$ sudo apt-get purge -y docker.io
~$ sudo apt-get autoremove -y --purge docker.io
~$ sudo apt-get autoclean
~$ sudo apt purge docker-ce
# Host에 image, directory, 볼륨, 또는 사용자 생성 구성 파일을 제거
~$ sudo rm /etc/apparmor.d/docker
~$ sudo rm -rf /var/lib/docker
~$ sudo groupdel docker
~$ sudo apt-get purge docker-engine
~$ sudo apt-get autoremove --purge docker-engine
```

### [확인 방법/주의점]
- `Installed: (none)` → 설치 전, `Candidate`가 설치될 버전.
- **주의: `rm -rf /var/lib/docker`는 이미지·컨테이너·볼륨 데이터를 모두 지우므로 재설치 목적일 때만 신중히 사용.**
- 설치 직후에는 아직 sudo 없이 docker 명령 불가 → Step 8에서 처리.

---

## Step 8. sudo 없이 docker 쓰기 (docker 그룹 · systemd 등록)

### [목적]
설치 후 `permission denied`가 나는 문제를 해결하고, Docker 서비스가 부팅 시 자동 시작되도록 등록한다.

### [이론 설명]
- 설치 직후 `docker version`은 Client 정보는 나오지만 Server 쪽에서 `permission denied` 오류. Docker 엔진이 `/var/lib/docker` 영역에 설치되고 그 소유자가 root라서 일반 사용자는 `sudo`가 필요하다.
- `df -h`로 `/dev/sdb1`(100G)이 `/var/lib/docker`에 마운트된 것을 확인 가능(Step 5 파티션). (이후 docker info의 Docker Root Dir로도 확인)
- `sudo docker version`: Client = "Docker Engine - Community"(CE), Server = 24.0.2. 엔진은 dockerd, containerd, runc(그리고 docker-init) 등의 데몬/라이브러리로 구성.
- 해결: 사용 중인 계정(kevin)을 docker 그룹에 추가 + systemd에 docker 서비스 등록.

| 명령 | 의미 |
|---|---|
| usermod -aG docker kevin | -a(append, 추가) -G(보조 그룹 지정): kevin 계정을 기존 그룹은 유지한 채 docker 그룹에 추가 |
| systemctl daemon-reload | systemd가 서비스 설정 파일 변경 내용을 다시 읽도록 함 |
| systemctl enable docker | 호스트가 재부팅되어도 도커 서비스가 부팅 시 자동으로 올라오도록 설정 |
| systemctl restart docker | Docker 서비스를 재시작 |
| systemctl status docker | 서비스 상태 확인. Active: active (running)이면 성공(q로 빠져나옴) |

### [사용한 CLI]

```bash
# 설치 직후 (sudo 없이): Client만 출력되고 Server 쪽은 permission denied
kevin@hostos1:~$ docker version
Client: Docker Engine - Community
 Version:           24.0.2
 API version:       1.43
 Go version:        go1.20.4
 Git commit:        cb74dfc
 Built:             Thu May 25 21:51:00 2023
 OS/Arch:           linux/amd64
 Context:           default
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: ...

# 디스크 사용량(사람이 읽기 쉬운 단위): /dev/sdb1(100G)이 /var/lib/docker 에 마운트
kevin@hostos1:~$ df -h

# sudo 를 붙여 Client / Server 확인 (Server: Engine 24.0.2, containerd 1.6.21, runc 1.1.7, docker-init 0.19.0)
kevin@hostos1:~$ sudo docker version

# docker 그룹에 현재 사용 중인 계정(kevin)을 등록하여 sudo 없이 docker 명령 사용 가능하게 함
kevin@hostos1:~$ sudo usermod -aG docker kevin
kevin@hostos1:~$ sudo systemctl daemon-reload
kevin@hostos1:~$ sudo systemctl enable docker
kevin@hostos1:~$ sudo systemctl restart docker
# (enable 실행 시 "Synchronizing state of docker.service with SysV service script ..." 메시지가 나옴)

# 서비스 상태 확인 (Loaded: enabled, Active: active (running), Main PID: 12643 (dockerd),
#  /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock)
kevin@hostos1:~$ sudo systemctl status docker

# 새 세션(재로그인) 또는 sudo reboot 를 통해 kevin 사용자 재접속 시 docker version 사용 가능
kevin@hostos1:~$ sudo reboot
kevin@hostos1:~$ docker version
```

### [확인 방법/주의점]
- 그룹 변경은 **새 세션(재로그인)에서 적용**되므로 새 세션을 열거나 재부팅한다. 강사는 깔끔하게 `sudo reboot`을 권장. 재부팅 후 MobaXterm에서 새 세션으로 접속해 `docker version`을 sudo 없이 실행(첫 시도에서 오타 `docker verion`은 "is not a docker command" 오류).
- 완료 판정: (1) docker 그룹에 사용자 추가 (2) 서비스 등록·자동 시작 (3) 새 세션/재부팅으로 권한 적용 (4) sudo 없이 `docker version`에서 Client·Server 모두 출력.

---

## Step 9. docker info로 엔진 구성 확인

### [목적]
`docker info` 출력의 Client / Server / Plugins / Runtime / Security 항목을 읽을 수 있게 된다.

### [이론 설명]
- **Client**: buildx(이미지 빌드 관련 플러그인 v0.10.5), compose(v2.18.1) 플러그인이 깔려 있다.
- **Server**

| 항목 | 값(화면) | 설명 |
|---|---|---|
| Containers / Images | 0 / 0 | 설치 직후라 이미지도 컨테이너도 없음 |
| Server Version | 24.0.2 | Docker 엔진 버전 |
| Storage Driver | overlay2 | dockerd가 관리하는 스토리지 영역. 이미지는 파일이며 파일 관리·컨테이너와 호스트 간 공유(볼륨)를 다루는 드라이버 |
| Backing Filesystem | xfs | Docker가 깔리는 뒷단 파일 시스템은 XFS를 권장(ext4보다 쓰기 속도도 빠름) |
| Logging Driver | json-file | 기본값. 로그를 AWS, Fluentd, GCP, Splunk 같은 외부 시스템으로 스트림 전달해 분석용으로 관리 가능 |
| Cgroup Driver / Version | systemd / 2 | Docker 24부터 cgroup 드라이버가 systemd, 버전이 2로 바뀜 |

  - **cgroup 변경**: Docker 23 버전까지는 Cgroup Driver `cgroupfs`, Cgroup Version `1`이었는데 24 버전에서 `systemd / 2`로 바뀌었다. 기존 cgroup v1 환경에서 돌리던 이미지에서 문제가 생길 수 있어, 필요 시 cgroup v1으로 낮춰 기존 이미지를 쓰는 방법을 실습 중 오류가 날 때 보여주겠다고 강사가 예고.
- **Plugins**: Volume: local / Network: bridge host ipvlan macvlan null overlay / Log: awslogs fluentd gcplogs gelf journald json-file local logentries splunk syslog. Network는 bridge가 기본, host·null 등이 기본 제공, IP 기반 가상 랜(ipvlan), MAC 기반 가상 랜(macvlan), Swarm에서 쓰는 overlay 네트워크 사용 가능. `Swarm: inactive` = 아직 Swarm 미구축.
- **Runtime**: `Runtimes: io.containerd.runc.v2 runc` / `Default Runtime: runc` / `Init Binary: docker-init`. runc는 커널 공유 방식을 이용해 컨테이너를 만드는 기술. 보안 관점에서 컨테이너가 커널을 통해 호스트 OS 커널까지 접근하려는 공격 가능성이 있어, 이를 줄이려면 gVisor 같은 프로그램으로 커널 접근을 차단하는 방법이 있다는 강사 언급(이 과정에서는 다루지 않음). Docker를 운영하는 3요소 = dockerd(만들고), containerd(관리하고), runc(실행하고).
- **Security Options**: apparmor, seccomp(Profile: builtin), cgroupns — 프로파일을 설정해 커널 레벨(하위 레벨)에서 보안 구성을 하는 도구. 그 밖에 Kernel Version(5.19), Operating System(Ubuntu 22.04.2 LTS), Docker Root Dir = `/var/lib/docker`, Insecure Registries(127.0.0.0/8), Live Restore Enabled: false.

### [사용한 CLI]

```bash
kevin@hostos1:~$ docker info
Client: Docker Engine - Community
 Version:    24.0.2
 Context:    default
 Debug Mode: false
 Plugins:
  buildx: Docker Buildx (Docker Inc.)
    Version:  v0.10.5
    Path:     /usr/libexec/docker/cli-plugins/docker-buildx
  compose: Docker Compose (Docker Inc.)
    Version:  v2.18.1
    Path:     /usr/libexec/docker/cli-plugins/docker-compose

Server:
 Containers: 0
  Running: 0
  Paused: 0
  Stopped: 0
 Images: 0
 Server Version: 24.0.2
 Storage Driver: overlay2
  Backing Filesystem: xfs
  Supports d_type: true
  Using metacopy: false
  Native Overlay Diff: true
  userxattr: false
 Logging Driver: json-file
 Cgroup Driver: systemd
 Cgroup Version: 2
 Plugins:
  Volume: local
  Network: bridge host ipvlan macvlan null overlay
  Log: awslogs fluentd gcplogs gelf journald json-file local logentries splunk syslog
 Swarm: inactive
 Runtimes: io.containerd.runc.v2 runc
 Default Runtime: runc
 Init Binary: docker-init
 containerd version: 3dce8eb055cbb6872793272b4f20ed16117344f8
 runc version: v1.1.7-0-g860f061
 init version: de40ad0
 Security Options:
  apparmor
  seccomp
   Profile: builtin
  cgroupns
 Kernel Version: 5.19.0-43-generic
 Operating System: Ubuntu 22.04.2 LTS
 OSType: linux
 Architecture: x86_64
 CPUs: 4
 Total Memory: 7.763GiB
 Name: hostos1
 Docker Root Dir: /var/lib/docker
 Debug Mode: false
 Experimental: false
 Insecure Registries:
  127.0.0.0/8
 Live Restore Enabled: false
```

### [확인 방법/주의점]
- Docker Root Dir `/var/lib/docker`가 Step 5에서 만든 sdb1(XFS)과 같은 경로인지, Backing Filesystem이 xfs인지 확인.
- 이 단계까지 완료하면 Docker 플랫폼 구축 완료 (다음 클립에서 실제 컨테이너 실습).

---

## Step 10. GUI 관리 도구 Portainer 생성

### [목적]
컨테이너를 웹 GUI로 관리할 수 있는 Portainer를 컨테이너로 띄운다. (강사: CLI를 먼저 익힌 뒤 GUI를 쓰는 것이 가장 현명 — "GUI가 없는 환경에서는 결국 CLI를 써야 한다"; 두 방식을 함께 쓰기 권장)

### [이론 설명]
- Portainer 자체도 하나의 컨테이너이며 웹 브라우저에서 마우스 클릭만으로 관리. Portainer CE(Community Edition, 무료)는 Docker, Swarm, Kubernetes 및 ACI 환경을 관리하는 컨테이너화된 애플리케이션 제공 플랫폼. 배포·사용이 간단하도록 설계된 'Smart' GUI 및 광범위한 API로 docker의 리소스(컨테이너, 이미지, 볼륨, 네트워크 등) 관리. 이미지: Docker Hub `portainer/portainer-ce` (https://hub.docker.com/r/portainer/portainer-ce). 상용 Business 버전도 있으나 수업은 CE.
- 명령·옵션 의미

| 명령/옵션 | 설명 |
|---|---|
| docker pull portainer/portainer-ce | Docker Hub에서 Portainer CE 이미지를 내려받음 |
| docker volume create portainer_data | Portainer 데이터를 보관할 볼륨 생성 |
| -d | 백그라운드(detached)로 실행 |
| -p 9000:9000 | 호스트 9000번 포트로 들어온 요청을 컨테이너 9000번으로 연결 (Portainer 웹 화면 기본 포트) |
| -v /var/run/docker.sock:/var/run/docker.sock | Docker 소켓을 공유. 이래야 GUI에 Docker의 모든 정보를 띄울 수 있음 |
| -v portainer_data:/data | 앞서 만든 볼륨을 컨테이너의 /data에 연결 |
| --restart=always | 컨테이너가 문제로 중단(강제 stop이 아닌 경우)되면 자동으로 재기동 |
| portainer/portainer-ce | 마지막에 사용할 이미지 이름 |

- 런타임(runc)이 커널의 cgroup/namespace로 컨테이너를 만들고 관리한다. 그 런타임과 통신하는 소켓(docker.sock)을 Portainer 컨테이너와 공유해야 GUI가 Docker 정보를 보여줄 수 있다(`sudo ls /var/run`으로 docker.sock 확인).
- `--name`을 주지 않았으므로 이름은 랜덤(예: affectionate_noether)이 붙는다.

### [사용한 CLI]

```bash
# Portainer 컨테이너 생성 (슬라이드 교재 코드)
kevin@hostos1:~$ docker pull portainer/portainer-ce
kevin@hostos1:~$ docker volume create portainer_data
kevin@hostos1:~$ docker run -d -p 9000:9000 \
> -v /var/run/docker.sock:/var/run/docker.sock \
> -v portainer_data:/data \
> --restart=always \
> portainer/portainer-ce

# 실행 확인 (PORTS: 0.0.0.0:9000->9000/tcp)
kevin@hostos1:~$ docker ps | grep portainer
401a14307ed3  portainer/portainer-ce  "/portainer"  18 seconds ago  Up 17 seconds  8000/tcp, 9443/tcp, 0.0.0.0:9000->9000/tcp, :::9000->9000/tcp  tender_allen
# 접속은 서버IP:9000 으로 크롬으로 접속한다.

# docker.sock 확인
kevin@hostos1:~$ sudo ls /var/run

# 실습 화면의 실행 예
# 기존 컨테이너 목록(-a: 중지된 것 포함) 확인 후 이미지 pull (레이어별 Pull complete / Extracting 표시)
kevin@hostos1:~/fastcampus/ch02$ docker ps -a
kevin@hostos1:~/fastcampus/ch02$ docker pull portainer/portainer-ce
kevin@hostos1:~/fastcampus/ch02$ docker volume create portainer_data
portainer_data
kevin@hostos1:~/fastcampus/ch02$ docker run -d -p 9000:9000 -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data --restart=always portainer/portainer-ce
kevin@hostos1:~/fastcampus/ch02$ docker ps
```

```bash
# GUI와 CLI가 같은 상태를 보는지 확인하기 위한 실습: 컨테이너 실행 후 Portainer 목록에 1~2초 뒤 나타남
kevin@hostos1:~/LABs/ch02$ docker run -it --name=myos1 ubuntu:16.04 bash
root@1710eaa50453:/#          # (Ctrl+P, Q 로 빠져나옴)
kevin@hostos1:~/LABs/ch02$ docker exec -it myos1 bash
root@1710eaa50453:/#

# 이후 GUI 배포한 nginx(webserver4)를 CLI로 확인: 호스트 포트를 지정하지 않으면 임의 포트(암시적 포트 매핑)
kevin@hostos1:~$ docker ps
# webserver4  nginx:latest  0.0.0.0:32769->80/tcp, 0.0.0.0:32768->443/tcp
# 브라우저: 192.168.56.101:32769 -> Welcome to nginx!
```

```text
[Portainer 웹 설정 절차]
1) 브라우저에서 서버IP:9000 (예: 192.168.56.101:9000) 접속
2) New Portainer installation: 관리자(admin) 계정 생성 - Username: admin, Password, Confirm password
   ("The password must be at least 12 characters long." -> 12자 이상 비밀번호)
3) Quick Setup / Environment Wizard: [Get Started] (로컬 Docker 환경을 그대로 사용) / Add Environments는 다른 환경 연결
   (화면 하단: Portainer Community Edition 2.18.3)
4) Dashboard: Environment local · Standalone 24.0.2, URL /var/run/docker.sock, 컨테이너·이미지·볼륨·네트워크 개수 = docker ps / docker images 결과와 동일 ("라이브 커넥트")
5) Containers: Name, State, Quick Actions, Stack, Image, Created, IP Address, Published Ports, Ownership 열
6) Quick Actions: Logs, Inspect, Stats, Exec Console, Attach Console — Exec Console 은 docker exec -it myos1 bash 와 같은 기능
   (Console: Command /bin/bash, User root -> Connect)
7) App Templates > Nginx: Name webserver4, Network bridge, Deploy the container
   (Show/Hide advanced options: Port mapping container 80/443, Volume mapping /etc/nginx, /usr/share/nginx/html
    host 칸을 비우면 Portainer가 자동으로 포트 배정; 템플릿은 "이미 만들어져 있는 스크립트 같은 것"이며 결국 docker run 이 실행됨)
8) Logs 아이콘: Auto-refresh logs, Wrap lines, Display timestamps, Fetch(All logs), Search, Lines(100), Download logs / Copy
9) Images 메뉴: Pull image(Docker Hub anonymous), Import/Export, Build a new image.
   (익명 계정은 DockerHub에서 6시간당 100회로 pull이 제한됨)
```

### [확인 방법/주의점]
- `docker ps | grep portainer`로 9000 포트 매핑 확인 후 `서버IP:9000` 접속.
- 관리자 비밀번호는 12자 이상.
- Portainer 대응 관계 (정리표): Dashboard/Containers/Images/Networks/Volumes = docker ps, images 등 / Quick Actions(Logs, Inspect, Exec Console) = docker logs / inspect / exec -it / App Templates > Nginx = GUI nginx(webserver4) 배포, 포트 자동 배정(32769->80).

---

## Step 11. 최신 Docker 엔진을 사용해야 하는 이유 (이론)

### [목적]
엔진 업데이트가 필요한지 판단하는 근거(7가지 이점)를 이해하고, 현재 버전을 확인하는 방법을 익힌다.

### [이론 설명]
- 두 서버 비교(강의): hostos1(kevin)은 Docker 24.0.2 / containerd 1.6.21 / runc 1.1.7 / docker-init 0.19.0, hostos3(jeff)은 가상의 "Ubuntu 18에서 Docker 19 버전을 쓰는 회사" — 19.03.13 / containerd 1.3.7 / runc 1.0.0-rc10 / docker-init 0.18.0. 엔진을 올린다는 것은 함께 쓰이는 containerd·runc·docker-init 버전도 모두 달라진다는 뜻.
- Docker 20.x 정체를 지나 23.x, 24.x까지 빠르게 올라온 배경. 업데이트 시 기존 컨테이너·이미지가 맞지 않을 수 있어 현재 버전 유지 여부를 판단.
- **최신 엔진을 쓰는 7가지 이유**
  1. 기존 기능 개선 및 new feature (새 기능으로 작업 workflow 단순화)
  2. 버그 수정 (안정성·성능 개선, 원활한 작업 보장)
  3. 보안 패치 — `docker info`의 Security Options(apparmor, seccomp 등)를 통한 커널 레벨 보안 강화, 잠재적 위험 최소화 (강사: 부가 기술이지 Docker 자체의 취약성을 막아 주는 것이 아니라 새 버전에서 패치가 적용되어 위협이 줄어든다는 의미)
  4. 성능 개선 (컨테이너 시간 단축, 네트워킹·I/O 향상, 리소스 활용도 향상)
  5. 최신 기술과의 호환성 (쿠버네티스, 젠킨스, 클라우드 등 도구와의 호환)
  6. 커뮤니티·생태계 지원 (docker 기반 플러그인·통합 활용, 예: **buildx** 빌드 기능)
  7. 유지 관리 및 오랜 기간 동안의 지원(Long Term Support, LTS)
- 결론(강사): "무조건 업데이트"가 아니라 **최신 버전을 썼을 때 이득이 더 많다**. 업데이트 전 반드시 **릴리즈 노트**를 확인해 현재 서비스에 필요한 기술이면 적용.

### [사용한 CLI]

```bash
# 현재 사용 중인 엔진 버전 확인: Client/Server 의 Version, containerd, runc, docker-init
kevin@hostos1:~$ docker version
Client: Docker Engine - Community
 Version:           24.0.2
 API version:       1.43
 Go version:        go1.20.4
 Git commit:        cb74dfc
 Built:             Thu May 25 21:51:00 2023
 OS/Arch:           linux/amd64
 Context:           default

Server: Docker Engine - Community
 Engine:
  Version:          24.0.2
  API version:      1.43 (minimum version 1.12)
  Go version:       go1.20.4
  Git commit:       659604f
  Built:            Thu May 25 21:51:00 2023
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          1.6.21
  GitCommit:        3dce8eb055cbb6872793272b4f20ed16117344f8
 runc:
  Version:          1.1.7
  GitCommit:        v1.1.7-0-g860f061
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0

# 비교용 서버(hostos3, jeff): 같은 명령을 실행하면 19.03.13 (API 1.40, containerd 1.3.7, runc 1.0.0-rc10, docker-init 0.18.0)
jeff@hostos3:~$ docker version

# 하단 Security Options 확인 (Step 9 참고)
kevin@hostos1:~$ docker info
```

```text
릴리즈 노트 참고 링크:
https://docs.docker.com/engine/release-notes/23.0/
https://docs.docker.com/engine/release-notes/24.0/
```

### [확인 방법/주의점]
- `docker version` Client/Server 두 부분이 각각 무엇을 나타내는지 구분.
- 업데이트 전에 릴리즈 노트를 먼저 확인.

---

## Step 12. 운용 중인 Docker 엔진 업데이트 (19.03.13 → 24.0.2)

### [목적]
Ubuntu 18.04 + Docker 19.x 서버(hostos3, 사용자 jeff)의 엔진을 최신 24.0.2로 올리고, 중지했던 컨테이너가 정상 기동되는지 확인한다.

### [이론 설명]
- **시나리오(슬라이드)**: 현재 F사는 ubuntu18.04 운영체제에서 docker 19.x 버전을 사용 중. 새로운 기능의 호환성을 맞추고 성능 향상을 위해 최신 버전으로 업데이트하기로 결정.
- **작업 절차 6단계**
  1) 기존에 실행 중인 컨테이너들을 stop 한다.
  2) 현재 사용 중인 19.x 버전의 docker 엔진을 삭제한다.
  3) 최신 버전의 docker 엔진을 설치한다.
  4) 기존 버전에서 운영 중이었던 컨테이너 기동(start)!
  5) If, error 발생 시 원인 파악, 문제 해결 → 중지되었던 컨테이너 start
  6) 필요에 따라 Ubuntu Linux도 18.04 → 22.04 또는 upgrade 수행 (실습에서는 제외)
- 에러 발생 시 `docker logs`나 이벤트로 에러 메시지를 확인하고 원인(현재 버전과의 호환성, 이전 버전에서의 문제점 등)을 파악해 트러블슈팅한 뒤, 새 이미지를 만들어 컨테이너를 올릴지 기존 컨테이너를 그대로 올릴지 판단.
- 업데이트 전 확인: 커널 5.0 64비트, 도커 19.03, OS Ubuntu 18.04. `cat /etc/os-release`의 코드네임(bionic)이 `lsb_release -cs`와 같고 Docker 저장소 등록 때 쓰인다.
- `docker stop`은 "삭제"가 아닌 프로세스 "중단". 실행 상태 그대로 apt로 엔진을 제거/설치해도 상관은 없지만 정상 절차를 밟으려고 stop 수행(슬라이드 주석).
- `sudo apt update`는 패키지 목록(저장소 정보)을 최신으로 갱신하는 단계. `-y`는 확인 질문에 자동으로 "예". 이미지와 컨테이너 데이터는 이 삭제에서 지워지지 않고 뒤에서 다시 시작되는 것을 확인.
- GPG 키는 이 패키지가 정말 Docker가 배포한 것이 맞는지 검증하는 열쇠. 실습 서버에서는 이미 keyring 파일이 있어 덮어쓰기 질문에 `y` 입력했고 apt-key add - 방식으로 한 번 더 추가(OK). 저장소는 `/etc/apt/sources.list.d/docker.list`에 기록, 이후 항상 `sudo apt update`로 저장소 정보를 다시 읽는다.
- `docker-ce`는 서버(엔진) 패키지라서 이것만 설치하면 **Server 쪽은 24.0.2가 되고 Client 쪽은 19.03.13** 그대로. docker-ce-cli, containerd.io 등 클라이언트 관련 도구도 함께 업데이트해야 클라이언트 버전까지 올라간다.

### [사용한 CLI]

```bash
# ① 업데이트 전 현재 환경 확인 (이미지 / 커널 / Docker 버전 / OS 버전)
jeff@hostos3:~$ docker images
REPOSITORY  TAG   IMAGE ID       CREATED       SIZE
httpd       2.4   d1676199e605   11 days ago   145MB
nginx       1.19  f0b8a9a54136   2 years ago   133MB
jeff@hostos3:~$ uname -ar
Linux hostos3 5.0.0-23-generic #24~18.04.1-Ubuntu SMP Mon Jul 29 16:12:28 UTC 2019 x86_64 x86_64 x86_64 GNU/Linux
jeff@hostos3:~$ docker version
# Client/Server 19.03.13 (API 1.40), containerd 1.3.7, runc 1.0.0-rc10, docker-init 0.18.0
jeff@hostos3:~$ cat /etc/os-release
NAME="Ubuntu"
VERSION="18.04.3 LTS (Bionic Beaver)"
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 18.04.3 LTS"
VERSION_ID="18.04"
VERSION_CODENAME=bionic
UBUNTU_CODENAME=bionic
jeff@hostos3:~$ docker ps
CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES
```

```bash
# ② 재기동 테스트용 샘플 컨테이너 실행 (-d 백그라운드, -p 9001:80 호스트 9001을 컨테이너 80에 연결(publish), --name 컨테이너 이름)
jeff@hostos3:~$ docker run -d -p 9001:80 --name=nginx-web nginx:1.19
# 같은 이름의 Exited 컨테이너가 남아 있으면 이름 충돌 오류:
# docker: Error response from daemon: Conflict. The container name "/nginx-web" is already in use by container "4d2714f7f374...". You have to remove (or rename) that container to be able to reuse that name.
jeff@hostos3:~$ docker ps -a
jeff@hostos3:~$ docker rm nginx-web
nginx-web
jeff@hostos3:~$ docker run -d -p 9001:80 --name=nginx-web nginx:1.19
jeff@hostos3:~$ docker run -d -p 9002:80 --name=httpd-web httpd:2.4
jeff@hostos3:~$ docker ps
# httpd-web (9002->80), nginx-web (9001->80) Up
```

```bash
# ③ 컨테이너 중지 후 기존 엔진(19.x) 삭제
jeff@hostos3:~$ docker stop nginx-web httpd-web
nginx-web
httpd-web
jeff@hostos3:~$ sudo apt update
jeff@hostos3:~$ sudo apt -y remove docker-ce
# Removing docker-ce (5:19.03.13~3-0~ubuntu-bionic) ...
# (aufs-tools, cgroupfs-mount, containerd.io, docker-ce-cli, pigz 는 "더 이상 필요하지 않은 패키지"로 표시)
```

```bash
# ④ 최신 엔진 설치 준비: 필수 패키지 -> GPG 키 -> 저장소 등록
# 사전 필수 패키지
jeff@hostos3:~$ sudo apt -y install apt-transport-https ca-certificates curl gnupg-agent software-properties-common

# gpg key download
jeff@hostos3:~$ curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
# (이미 파일이 있으면: File '/usr/share/keyrings/docker-archive-keyring.gpg' exists. Overwrite? (y/N) y)
# (참고) 구방식도 병행 실행됨
jeff@hostos3:~$ sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
OK

# docker repository 등록 (stable 채널, 이 서버는 amd64)
jeff@hostos3:~$ echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
jeff@hostos3:~$ sudo apt update
# (참고: "W: Target ... is configured multiple times in /etc/apt/sources.list:51 and /etc/apt/sources.list.d/docker.list:1" 경고는 저장소가 두 곳에 중복 등록되었다는 경고일 뿐 설치는 계속 진행)
```

```bash
# ⑤ 최신 엔진 설치 및 버전 확인
jeff@hostos3:~$ sudo apt -y install docker-ce
# docker-ce is already the newest version (5:24.0.2-1~ubuntu.18.04~bionic).   (강의 서버는 이미 한 번 설치했던 환경이라 이 메시지)
jeff@hostos3:~$ docker version
# Client 19.03.13 (API 1.40) / Server Engine 24.0.2 (API 1.43, containerd 1.6.21, runc 1.1.7, docker-init 0.19.0)
#   -> 서버만 올라가고 Client는 그대로. 클라이언트 도구도 업데이트 필요

# 클라이언트 관련 도구 업데이트 (docker-ce-cli 업그레이드, docker-buildx-plugin, docker-compose-plugin 신규 설치)
jeff@hostos3:~$ sudo apt -y install docker-ce-cli containerd.io
# containerd.io is already the newest version (1.6.21-1).
# The following NEW packages will be installed: docker-buildx-plugin docker-compose-plugin
# The following packages will be upgraded: docker-ce-cli
# (강사 슬라이드 요약: sudo apt -y install docker-ce docker-ce-cli containerd.io)

jeff@hostos3:~$ docker --version     # (슬라이드 치트시트) 클라이언트 버전만 한 줄로 확인
jeff@hostos3:~$ docker version
# Client Version 24.0.2 (API 1.43) / Server Engine 24.0.2 (API 1.43), containerd 1.6.21, runc 1.1.7, docker-init 0.19.0
```

```bash
# ⑥ 중지했던 컨테이너 재기동과 서비스 확인 (업데이트 후에도 컨테이너 정보 유지됨, Exited (0) 상태로 남아 있음)
jeff@hostos3:~$ docker ps -a
jeff@hostos3:~$ docker start nginx-web httpd-web
nginx-web
httpd-web
jeff@hostos3:~$ docker ps -a
# Up 2 seconds 0.0.0.0:9002->80/tcp httpd-web / 0.0.0.0:9001->80/tcp nginx-web
jeff@hostos3:~$ curl localhost:9001
# <title>Welcome to nginx!</title> ...
jeff@hostos3:~$ curl localhost:9002
# <html><body><h1>It works!</h1></body></html>
```

```bash
# ⑦ [오류 해결] docker start 시 cgroup mountpoint 오류가 나는 경우
jeff@hostos3:~$ docker start nginx-web
docker: Error response from daemon: cgroups: cgroup mountpoint does not exist: unknown.
jeff@hostos3:~$ docker start httpd-web
docker: Error response from daemon: cgroups: cgroup mountpoint does not exist: unknown.

# [solution] cgroup path에 디렉터리를 만들고 mount 해 준다. 이후 docker start ~ 를 수행하면 해결된다.
jeff@hostos3:~$ sudo mkdir /sys/fs/cgroup/systemd
jeff@hostos3:~$ sudo mount -t cgroup -o none,name=systemd cgroup /sys/fs/cgroup/systemd
```

### [확인 방법/주의점]
- `docker version`에서 Client·Server가 모두 24.0.2인지 확인. docker-ce만 설치하면 Server만 올라간다(클라이언트는 docker-ce-cli 필요).
- 컨테이너 이름은 중복될 수 없다 → 같은 이름의 Exited 컨테이너가 남아 있으면 `docker rm` 필요.
- 재기동 시 cgroup(리눅스 커널이 프로세스별 CPU·메모리 등 자원을 제한·관리하는 기능) mountpoint 오류는 mkdir로 디렉터리를 만들고 systemd cgroup을 mount한 뒤 다시 `docker start`. 해결 후 정상 기동 확인(참고: 정상적으로 올라오지 않거나 유사한 에러가 나면 이 절차로 마무리).
- 실무에서는 Ubuntu 18.04→22.04 업그레이드 작업도 함께 진행하는 것이 보통(이번 실습에서는 제외).

### 엔진 업데이트 명령 치트시트

| 단계 | 명령 | 역할 |
|---|---|---|
| 확인 | docker version / cat /etc/os-release / uname -ar | 엔진(Client/Server)·OS·커널 버전 확인 |
| 중지 | docker stop nginx-web httpd-web | 실행 중 컨테이너 정상 중지(삭제 아님) |
| 삭제 | sudo apt update → sudo apt -y remove docker-ce | 패키지 목록 갱신 후 기존 19.x 엔진 제거 |
| 준비 | sudo apt -y install apt-transport-https ca-certificates curl gnupg-agent software-properties-common | 저장소 사용에 필요한 사전 패키지 설치 |
| 키 | curl -fsSL https://download.docker.com/linux/ubuntu/gpg \| sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg | Docker 공식 GPG 키를 키링으로 저장 |
| 저장소 | echo "deb [arch=amd64 signed-by=... ] ... stable" \| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null | stable 저장소 등록 후 sudo apt update |
| 설치 | sudo apt -y install docker-ce docker-ce-cli containerd.io | 최신 엔진·클라이언트·containerd 설치 |
| 확인 | docker --version / docker version | 24.0.2 확인 (Client·Server 모두) |
| 재기동 | docker start nginx-web httpd-web / docker ps -a | 중지했던 컨테이너 시작 및 상태 확인 |
| 검증 | curl localhost:9001 / curl localhost:9002 | 서비스 응답 확인 |
| 오류해결 | sudo mkdir /sys/fs/cgroup/systemd / sudo mount -t cgroup -o none,name=systemd cgroup /sys/fs/cgroup/systemd | cgroup mountpoint 오류 대응 |

---

## Step 13. 컨테이너 운영 기본 CLI (docker CLI 1)

### [목적]
직접 만든 node 앱 이미지로 `docker run` 옵션을 익히고, 실행 중 컨테이너를 조회(top/port/stats/cadvisor/logs/inspect)·수정(cp/restart)하는 기본 운영 명령을 익힌다. 참고: https://docs.docker.com/engine/reference/commandline/container/

### [이론 설명]

**0. docker 컨테이너 CLI 전체 그림**

| 그림의 위치 | 명령 |
|---|---|
| DOCKERFILE → image | build |
| Local Server ↔ Docker Hub Registry | docker login, push, pull |
| image → container | run, create, exec, attach |
| container → image | commit |
| container ↔ 파일(폴더 아이콘) | export, import |
| container 조회(왼쪽) | inspect, ps, logs, top, stats |
| container 제어(오른쪽) | stop, pause, unpause, restart, kill, rm |

이 영상(CLI 1편)은 run 옵션, top / port / stats, logs, inspect, cp / restart 를 다룬다.

**1. docker run 옵션 표 (슬라이드 원문)**

| 옵션 | 설명 |
|---|---|
| -i, --interactive | 대화식 모드 열기 |
| -t | TTY(단말 디바이스) 할당 |
| -d, --detach=true | 백그라운드에서 컨테이너 실행하고 컨테이너 ID 등록 |
| --name | 실행되는 컨테이너에 이름을 부여 (미 지정 시 자동으로 부여됨: 딕셔너리 워드 랜덤 선택) |
| --rm | 컨테이너 종료 시 자동으로 컨테이너 제거 |
| --restart | 컨테이너 종료 시 적용할 재시작 정책 지정. ([no \| on-failure \| on-failure:횟수n \| always]) |
| --env, -e | 컨테이너의 환경변수 지정 (--env-file은 여러 환경 변수를 파일로 생성하여 지정하는 방법) |
| -v, --volume=호스트경로:컨테이너경로 | 호스트 경로와 컨테이너 경로의 공유 볼륨 설정 (Bind mount 라고 함) |
| -h | 컨테이너의 호스트명 지정 (미 지정 시 컨테이너 ID가 호스트명으로 등록) |
| -p [Host 포트]:[Container 포트], --publish | 호스트 포트와 컨테이너 포트 연결 |
| -P, --publish-all=[true \| false] | 컨테이너 내부의 노출된(expose) 포트를 호스트 임의의 포트로 게시 |
| --workdir, -w | 컨테이너 내부의 작업 경로(디렉터리) |

`docker run -itd -p 6060:6060 --name=node-run -h node-run noderun:1.0` → -i -t(대화식 + TTY), -d(백그라운드), -p 6060:6060(호스트 6060 ↔ 컨테이너 6060), --name(이름), -h(호스트명).

**2. top / port / stats**
- `docker top`: 컨테이너 안 실행 프로세스(/sbin/tini -- node runapp.js, node runapp.js 는 Dockerfile의 ENTRYPOINT + CMD). `docker port`: 매핑된 포트. `docker stats`: CPU / MEM / NET I/O / BLOCK I/O / PIDS 실시간 스트림 (스트림 통계 비활성화는 `--no-stream`).
- 호스트에서 확인: `sudo netstat -nlp | grep 6060` → docker-proxy가 6060 LISTEN. `ps -ef | grep 6160`(docker-proxy 확인) → `/usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 6060 -container-ip 172.17.0.4 -container-port 6060`. stats를 켜 둔 상태에서 다른 터미널에서 curl을 보내면 NET I/O 값이 변함.

**3. cadvisor**: Google이 제공/관리하는 오픈소스 컨테이너 모니터링 도구. stats와 유사한 통계·Metric 정보를 웹 UI로 보여 준다. 명령의 주요 옵션: `--restart=always`(재시작 정책), `--volume=...:ro`(호스트의 /, /sys/fs/cgroup, /var/lib/docker, /dev/disk 읽기 전용(ro), /var/run은 rw로 Bind mount), `--publish=9559:8080`(호스트 9559 → 컨테이너 8080), `--detach=true`, `--name=cadvisor`. 접속: `192.168.56.101:9559` (Docker Containers/Subcontainers 목록, Isolation(CPU, Memory), Usage Overview 게이지, Processes 표, Usage per Core, Network Throughput 그래프).

**4. docker logs**
- 컨테이너에서 발생하는 stdout(표준출력), stderr(표준에러) 출력 조회. 출력되는 로그 양이 큰 경우 disk full error의 원인이 될 수 있다. `docker info | grep -i log`로 Logging Driver(현재 json-file) 확인.
- 로그 파일 위치: `/var/lib/docker/containers/<컨테이너ID>/<ID>-json.log`(그 폴더에 checkpoints, config.v2.json, hostconfig.json, hostname, hosts, mounts, resolv.conf, resolv.conf.hash도 있음). 로그 파일 비우기: `truncate -s 0`.
- 로그 크기 제한 두 가지 방법: ① `/etc/docker/daemon.json`에 log-driver, log-opts(max-size, max-file)를 넣고 docker 서비스 재시작(전체 적용) ② `docker run`에 `--log-driver`, `--log-opt`를 직접 지정(해당 컨테이너만 적용).
- 컨테이너가 바로 Exited 되었을 때 `docker logs 컨테이너명`으로 원인을 확인하고, 로그가 요구하는 환경변수를 `-e`(`--env`) 옵션으로 넣어 해결(MySQL 예: MYSQL_ROOT_PASSWORD 등 필요).

**5. inspect**: 컨테이너 내부 구조(JSON 형식): Id, Created, Image, Path, Args, 네트워크 설정(Gateway, IPAddress, MacAddress, Networks.bridge ...). 예: `"Image": "noderun:1.0"`, `"WorkingDir": "/app"`, `"Entrypoint": ["/sbin/tini","--"]`, HostConfig의 CpuShares, Memory, PidsLimit, MaskedPaths / ReadonlyPaths.

**6. cp / restart**: 호스트에서 수정한 소스를 컨테이너 안에 넣고(`docker cp`) `docker restart`로 반영. 방향은 두 가지: 컨테이너 → 호스트, 호스트 → 컨테이너. 복사 후 컨테이너 안을 확인할 때는 `docker exec -it 컨테이너 ls 경로`. 설정 파일(nginx.conf 등)을 꺼내 고친 뒤 다시 넣고 `docker restart`로 적용하는 패턴.

### [사용한 CLI]

**(1) 실습용 node 앱 이미지 빌드 및 docker run**

```javascript
// runapp.js (vi 로 작성)
const http = require('http');
const server = http.createServer().listen(6060);
server.on('request', (req, res) => {
console.log('Your request arrived.');
res.write("HostName: " + process.env.HOSTNAME + "\n");
res.end();
});
server.on('connection', (socket) => {
console.log("Your Connected.");
});
```

```dockerfile
# Dockerfile
FROM node:20-alpine3.17
RUN apk add --no-cache tini curl
WORKDIR /app
COPY runapp.js .
EXPOSE 6060
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "runapp.js"]
```

```bash
kevin@hostos1:~/fastcampus/ch05$ vi runapp.js
kevin@hostos1:~/fastcampus/ch05$ vi Dockerfile
# Dockerfile 로 이미지 빌드 (-t 이름:태그)
kevin@hostos1:~/fastcampus/ch05$ docker build -t noderun:1.0 .
kevin@hostos1:~/fastcampus/ch05$ docker images | grep noderun
noderun  1.0  2ddb250a6232  2 minutes ago  182MB
# 이미지 레이어 이력 (RUN apk add ..., WORKDIR /app, COPY runapp.js, EXPOSE 6060, ENTRYPOINT, CMD 가 한 줄씩 기록됨)
kevin@hostos1:~/fastcampus/ch05$ docker image history noderun:1.0
# 컨테이너 실행: -itd(대화식+TTY+백그라운드), -p 호스트:컨테이너 포트, --name 이름, -h 호스트명
kevin@hostos1:~/fastcampus/ch05$ docker run -itd -p 6060:6060 --name=node-run -h node-run noderun:1.0
kevin@hostos1:~/fastcampus/ch05$ docker ps | grep node
37cf450fd9fe  noderun:1.0  "/sbin/tini -- node ..."  7 seconds ago  Up 6 seconds  0.0.0.0:6060->6060/tcp, :::6060->6060/tcp  node-run
kevin@hostos1:~/fastcampus/ch05$ curl localhost:6060
HostName: node-run          # -h node-run 옵션으로 지정한 호스트명
```

**(2) docker top | port | stats**

```bash
# docker top, 컨테이너에서 실행 중인 프로세스 조회
kevin@hostos1:~/fastcampus/ch05$ docker top node-run
UID   PID    PPID   C  STIME  TTY    TIME      CMD
root  13434  13404  0  10:30  pts/0  00:00:00  /sbin/tini -- node runapp.js
root  13460  13434  0  10:30  pts/0  00:00:00  node runapp.js
root  13690  13404  0  10:31  pts/1  00:00:00  sh

# docker port, 컨테이너에 매핑된 포트 조회
kevin@hostos1:~/fastcampus/ch05$ docker port node-run
6060/tcp -> 0.0.0.0:6060
6060/tcp -> [::]:6060

# 컨테이너 리소스 사용 통계에 대한 실시간 스트림 출력 (스트림 통계 비활성화는 --no-stream)
kevin@hostos1:~/fastcampus/ch05$ docker stats node-run
CONTAINER ID  NAME      CPU %  MEM USAGE / LIMIT    MEM %  NET I/O      BLOCK I/O  PIDS
070e763fd36b  node-run  0.00%  7.477MiB / 7.763GiB  0.09%  7.2kB / 950B 0B / 0B    9

# stats 를 켜 둔 상태에서 다른 터미널에서 여러 번 요청 -> NET I/O 값 변화 확인
kevin@hostos1:~/fastcampus/ch05$ curl localhost:6060

# 호스트 쪽 확인 (docker-proxy 프로세스)
~$ sudo netstat -nlp | grep 6060
~$ ps -ef | grep 6160
```

**(3) cadvisor 컨테이너 (stats 유사 통계/Metric 웹 UI)**

```bash
# cadvisor 컨테이너 생성 (Google에서 제공하고 관리하는 오픈 소스 컨테이너 모니터링 도구)
kevin@hostos1:~/fastcampus/ch05$ docker run \
--restart=always \
--volume=/:/rootfs:ro \
--volume=/var/run:/var/run:rw \
--volume=/sys/fs/cgroup:/sys/fs/cgroup:ro \
--volume=/var/lib/docker/:/var/lib/docker:ro \
--volume=/dev/disk/:/dev/disk:ro \
--publish=9559:8080 \
--detach=true \
--name=cadvisor \
--privileged \
--device=/dev/kmsg \
gcr.io/cadvisor/cadvisor:latest

kevin@hostos1:~/fastcampus/ch05$ docker ps -a
# gcr.io/cadvisor/cadvisor:latest  Up 1 second (health: starting -> healthy)  0.0.0.0:9559->8080/tcp  cadvisor
# 브라우저: 192.168.56.101:9559
```

**(4) docker logs**

```bash
# 컨테이너에서 발생하는 stdout(표준출력), stderr(표준에러) 출력
kevin@hostos1:~/fastcampus/ch05$ while true; do curl 192.168.56.101:6060; sleep 3; done
# 다른 터미널에서..  (-f: 실시간으로 따라가기)
kevin@hostos1:~/fastcampus/ch05$ docker logs -f node-run
Your Connected.
Your request arrived.
Your Connected.
Your request arrived.
...

# 출력되는 로그 양이 큰 경우, disk full error의 원인이 될 수 있음. 현재 Logging Driver 확인
kevin@hostos1:~/fastcampus/ch05$ docker info | grep -i log
Logging Driver: json-file
Log: awslogs fluentd gcplogs gelf journald json-file local logentries splunk syslog

# 로그 파일 위치 확인 (컨테이너 ID 이름의 디렉터리)
kevin@hostos1:~/fastcampus/ch05$ sudo ls -l /var/lib/docker/containers/
kevin@hostos1:~/fastcampus/ch05$ sudo ls -lh /var/lib/docker/containers/4d8fd0de2b83...4659d/
# <ID>-json.log (로그 파일), checkpoints, config.v2.json, hostconfig.json, hostname, hosts, mounts, resolv.conf, resolv.conf.hash

# 로그 파일 비우기
kevin@hostos1:~/fastcampus/ch05$ sudo truncate -s 0 /var/lib/docker/containers/4d8f.../4d8f...-json.log
```

```bash
# 컨테이너에서 발생하는 log size 제한 방법 ① daemon.json (전체 적용)
kevin@hostos1:~/fastcampus/ch05$ sudo vi /etc/docker/daemon.json
```

```json
{ "insecure-registries": ["192.168.56.101:5000"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "30m",
    "max-file": "10"
  }
}
```

```bash
kevin@hostos1:~/fastcampus/ch05$ sudo systemctl restart docker.service
kevin@hostos1:~/fastcampus/ch05$ sudo systemctl status docker.service      # active (running) 확인

# 방법 ② docker run 에 직접 지정 (해당 컨테이너만 적용)
kevin@hostos1:~/fastcampus/ch05$ docker run -itd -p 6062:6060 --name=node-run2 \
> -h node-run --log-driver json-file --log-opt max-size=30m --log-opt max-file=10 \
> noderun:1.0

# MySQL 컨테이너 로그 확인 — logs로 원인 찾기
kevin@hostos1:~/fastcampus/ch05$ docker run -itd --name=mydb mysql:5.7-debian
kevin@hostos1:~/fastcampus/ch05$ docker ps -a
# mysql:5.7-debian  "docker-entrypoint.s..."  Exited (1) About a minute ago  mydb
kevin@hostos1:~/fastcampus/ch05$ docker logs mydb
# [ERROR] [Entrypoint]: Database is uninitialized and password option is not specified
# You need to specify one of the following as an environment variable:
# - MYSQL_ROOT_PASSWORD
# - MYSQL_ALLOW_EMPTY_PASSWORD
# - MYSQL_RANDOM_ROOT_PASSWORD

# 환경변수(-e)를 넣어 다시 실행 (강의 예시 비밀번호는 교육용)
kevin@hostos1:~/fastcampus/ch05$ docker rm mydb
kevin@hostos1:~/fastcampus/ch05$ docker run -itd --name=mydb -e MYSQL_ROOT_PASSWORD=pass123# mysql:5.7-debian
kevin@hostos1:~/fastcampus/ch05$ docker ps -a | grep mydb      # Up 2 seconds, 3306/tcp, 33060/tcp
```

**(5) docker inspect**

```bash
# 컨테이너 내부 구조 확인 (JSON 출력)
kevin@hostos1:~/fastcampus/ch05$ docker container inspect node-run
[
{
"Id": "070e763fd36b78785d7afa8d7ed3be599efa508836426efe489a93ae2dea9691",
"Created": "2023-06-07T01:30:02.641001294Z",
...
"SandboxKey": "/var/run/docker/netns/ea207da8d5ae",
"Gateway": "172.17.0.1",
"IPAddress": "172.17.0.4",
"IPPrefixLen": 16,
"MacAddress": "02:42:ac:11:00:04",
"Networks": {
"bridge": {
"NetworkID": "fb1221ccedb91b8063b77e0233f9027a32e55376f8656dbfc55b70cfdfe5d5d0",
"Gateway": "172.17.0.1",
"IPAddress": "172.17.0.4",
...
```

**(6) docker cp | restart**

```bash
# 컨테이너 내의 source 수정 적용: 호스트에서 runapp.js 수정 (로그 문구 'fastcampus request arrived.', "fastcampus Connected." 로 변경)
kevin@hostos1:~/fastcampus/ch05$ vi runapp.js
kevin@hostos1:~/fastcampus/ch05$ docker cp runapp.js node-run:/app/runapp.js
Successfully copied 2.05kB to node-run:/app/runapp.js
kevin@hostos1:~/fastcampus/ch05$ docker restart node-run
node-run
kevin@hostos1:~/fastcampus/ch05$ docker ps | grep node
# 바뀐 문구(fastcampus Connected. / fastcampus request arrived.) 확인 (-f: 실시간 따라가기)
kevin@hostos1:~/fastcampus/ch05$ docker logs -f node-run

# docker cp 사용법 정리 (슬라이드 원문)
# Container 내의 파일을 Host로 복사
docker container cp <Container명 또는 ID>:<Container 내의 파일 경로> <Host 디렉터리 경로>
docker container cp <Host 파일> <Container명 또는 ID>:<Container 내의 파일 경로>

# test Container의 /etc/passwd 파일을 Host의 /tmp/etc에 복사
~$ docker run -itd --name=my_container centos
~$ docker cp my_container:/var/log/ /home/kevin/centos_log/

# Host의 현재 디렉터리에 있는 local.txt 파일을 test Container의 /tmp/local.txt 로 복사
~$ touch local.txt
~$ docker cp ./local.txt my_container:/tmp/local.txt
~$ docker exec -it my_container ls /tmp

# webserver container 의 /etc/nginx/nginx.conf를 HostOS 경로로 복사
~$ docker run -d -p 7777:80 --name=webserver nginx:1.25.0-alpine
~$ docker cp webserver:/etc/nginx/nginx.conf /home/kevin/nginx.conf

# nginx 웹서버 구성을 reverse Proxy 구성으로 변경하고,
~$ docker cp nginx.conf webserver:/etc/nginx/nginx.conf
~$ docker restart webserver
```

### 이 영상에서 나온 명령 치트시트

| 명령 | 영상에서의 용도 |
|---|---|
| docker build -t noderun:1.0 . | Dockerfile로 실습용 이미지 생성 |
| docker image history 이미지 | 이미지 레이어 이력 확인 |
| docker run -itd -p 6060:6060 --name=node-run -h node-run noderun:1.0 | 백그라운드 실행 + 포트 연결 + 이름/호스트명 지정 |
| docker ps / docker ps -a | 실행 중/전체(Exited 포함) 컨테이너 목록 |
| docker top 컨테이너 | 컨테이너 안에서 실행 중인 프로세스 |
| docker port 컨테이너 | 매핑된 포트 |
| docker stats 컨테이너 [--no-stream] | CPU / MEM / NET I/O / BLOCK I/O / PIDS 실시간 통계 |
| docker logs -f 컨테이너 | stdout / stderr 로그 실시간 조회 |
| docker info \| grep -i log | Logging Driver 확인 (json-file) |
| /etc/docker/daemon.json 의 log-opts / --log-opt max-size, max-file | 로그 파일 크기 제한 |
| docker container inspect 컨테이너 | 컨테이너 내부 정보(JSON) |
| docker cp 원본 대상 | 호스트 ↔ 컨테이너 파일 복사 |
| docker restart 컨테이너 | 컨테이너 재시작 (수정 사항 반영) |
| docker run -e MYSQL_ROOT_PASSWORD=... mysql:5.7-debian | 환경변수로 컨테이너 설정 (logs에서 확인한 요구사항 반영) |
| docker run ... gcr.io/cadvisor/cadvisor:latest | 컨테이너 모니터링 도구 cadvisor 실행 (웹 UI 9559 포트) |

### [확인 방법/주의점]
- `docker run`에서 `-h`를 지정하면 컨테이너 안 `HOSTNAME` 환경변수와 curl 응답(HostName: node-run)이 그 값이 된다.
- 로그가 커지면 disk full 위험 → daemon.json 또는 `--log-opt`로 max-size/max-file 제한.
- 컨테이너가 바로 Exited 되면 `docker logs 컨테이너명`으로 원인 확인(예: MySQL은 root 비밀번호 환경변수 필요).
- 오타 주의: `docker inspc` 처럼 틀리면 `Command 'inspc' not found, did you mean...` 안내가 나온다(강의 화면 언급).
- cadvisor는 `--privileged`와 호스트 루트/`/sys/fs/cgroup`/`/var/lib/docker` 등을 읽기 전용으로 마운트하므로 실습 환경에서만 사용할 것(옵션 구성은 강의 슬라이드 그대로).
