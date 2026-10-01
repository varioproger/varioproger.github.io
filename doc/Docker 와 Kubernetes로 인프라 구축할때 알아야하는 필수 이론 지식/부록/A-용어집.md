---
title: "부록 A. 용어집"
parent: "부록"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 1
---

# 부록 A. 용어집

이 책에 나오는 Docker, Kubernetes, 리눅스 용어를 분야별로 정리했다. 정의는 참고 자료의 용어집과 본문 설명을 따랐다. 괄호 안의 숫자는 주로 다루는 장이다.

## 리눅스 기반

| 용어 | 설명 |
|---|---|
| **커널 / 시스템 콜** | 하드웨어와 자원을 관리하는 OS의 핵심 / 프로그램이 커널에 기능을 요청하는 통로 (1장) |
| **PID 1** | 컨테이너 안에서 처음 실행되는 프로세스. 시그널 처리와 좀비 회수를 책임진다 (2장) |
| **좀비 프로세스** | 종료했지만 부모가 회수하지 않아 프로세스 테이블에 남은 항목 (2장) |
| **SIGTERM / SIGKILL** | 정상 종료를 요청하는 시그널(처리 가능) / 즉시 강제 종료하는 시그널(처리 불가) (2장) |
| **네임스페이스(리눅스)** | 시스템 자원의 뷰를 분리하는 기능. PID/NET/MNT/UTS/IPC/USER/CGROUP/TIME (5장) |
| **cgroup** | 프로세스 그룹의 자원 사용량을 제한·측정하는 기능 (6장) |
| **overlayfs** | 여러 레이어를 하나의 파일 시스템으로 합치는 union FS (7장) |
| **capability** | root 권한을 40여 개로 쪼갠 것 |
| **seccomp** | 시스템콜 필터링 |
| **OOMKilled** | 메모리 한도 초과로 커널이 프로세스를 종료한 상태 (exitCode 137) |
| **conntrack** | 커널의 연결 추적 테이블. 고갈되면 새 연결이 거부된다 |

## 컨테이너와 이미지

| 용어 | 설명 |
|---|---|
| **이미지** | 실행 중인 서버가 아니라, 다시 실행할 수 있도록 앱 파일·라이브러리·기본 시작 명령을 저장한 산출물 |
| **레이어** | 이미지를 이루는 읽기 전용 파일 시스템 조각. 실행 시 그 위에 쓰기 가능한 컨테이너 레이어가 얹힌다 (7장) |
| **태그 / 다이제스트** | 이미지에 붙인 사람이 읽는 이름(`1.0.0`, 바뀔 수 있음) / 이미지 내용의 해시(`sha256:...`, 내용이 같으면 항상 같음) (7장) |
| **Dockerfile** | 이미지 안에 어떤 실행 파일을 넣고 기본적으로 무엇을 실행할지 적은 이미지 빌드 설명서 |
| **멀티 스테이지 빌드** | 빌드용 단계와 실행용 단계를 나눠, 최종 이미지에는 실행에 필요한 것만 남기는 Dockerfile 작성법 (8장) |
| **레지스트리(ECR 등)** | 빌드한 이미지를 저장해 두는 저장소. ECR은 AWS의 이미지 저장소 |
| **볼륨 / 바인드 마운트 / tmpfs** | Docker가 관리하는 영구 저장 공간 / 호스트의 특정 경로를 그대로 연결 / 메모리에만 두는 임시 저장 공간 (9장) |
| **사용자 정의 브리지** | `docker network create`로 만든 브리지 네트워크. 컨테이너 이름으로 DNS 조회가 된다 (10장) |
| **Docker Compose** | 여러 컨테이너(서비스)·네트워크·볼륨을 YAML 하나로 정의하고 함께 실행하는 도구 (11장) |
| **OCI** | Open Container Initiative. 컨테이너 이미지·런타임의 벤더 중립 표준 |
| **컨테이너 런타임** | 컨테이너를 실제로 만들고 실행하는 프로그램. 고수준 런타임(containerd, CRI-O)과 저수준 런타임(runc)으로 나뉜다 (11장) |
| **CRI** | Container Runtime Interface. kubelet과 컨테이너 런타임 사이의 gRPC 인터페이스 |
| **샌드박스 런타임** | gVisor, Kata 등 커널 노출을 줄인 컨테이너 런타임 |

## 쿠버네티스 핵심 개념과 구성 요소

| 용어 | 설명 |
|---|---|
| **선언적(declarative)** | 절차가 아니라 결과 상태를 기술하는 방식 |
| **조정 루프(reconciliation loop)** | 원하는 상태와 현재 상태를 비교해 차이를 줄이는 반복. 쿠버네티스의 근본 원리 |
| **컨트롤 플레인 / 데이터 플레인** | 결정하는 쪽 / 실행하는 쪽. 25장에서는 컨트롤 플레인을 "제어부"라고도 부른다 |
| **kube-apiserver** | 클러스터의 유일한 진입점. `kubectl`, 컨트롤러, kubelet 모두 이 API를 통해서만 대화한다 (12장) |
| **etcd** | 클러스터의 모든 상태를 저장하는 분산 키-값 스토어 (12장) |
| **kube-scheduler** | 노드가 정해지지 않은 Pod의 실행 노드를 결정한다 (12장) |
| **kube-controller-manager** | 수십 개의 내장 컨트롤러를 실행하는 프로세스. 각 컨트롤러가 조정 루프를 돈다 (12장) |
| **cloud-controller-manager** | 로드밸런서 생성 등 클라우드 API 연동을 담당한다 (12·20장) |
| **kubelet** | 노드의 에이전트. 배정된 Pod의 컨테이너를 런타임에 실행시키고 상태를 보고한다 (12장) |
| **kubeconfig / context** | kubectl이 접속할 클러스터·사용자 인증 정보를 담은 설정 파일 / 그중 현재 사용할 조합 (13장) |
| **라벨 / 셀렉터** | 오브젝트에 붙이는 키-값 꼬리표 / 라벨로 대상 오브젝트를 고르는 조건. Service·Deployment가 Pod를 찾는 방식 (13장) |
| **Node** | 클러스터에 연결되어 앱 실행에 쓰이는 머신. Node 객체는 그 머신의 주소·용량·상태 기록 |
| **Pod** | NET·IPC·UTS를 공유하고 MNT·PID는 분리한 컨테이너 그룹. 최소 배포 단위 (14장) |
| **사이드카(sidecar)** | 메인 컨테이너의 기능을 보조하는 컨테이너 (14장) |
| **프로브(probe)** | kubelet이 컨테이너 상태를 검사하는 방법. startup(시작 완료), liveness(재시작 여부), readiness(트래픽 수신 여부) (15장) |
| **ConfigMap / Secret** | 설정값 / 비밀번호·토큰 같은 민감한 값을 이미지와 분리해 Pod에 주입하는 오브젝트. Secret은 기본적으로 base64 인코딩일 뿐 암호화가 아니다 (16장) |
| **Deployment** | 원하는 Pod 수와 이미지를 적어 두는 설정 객체. 직접 행동하는 프로그램이 아니라 controller가 이를 읽어 ReplicaSet·Pod를 조정한다 (17장) |
| **ReplicaSet** | 지정한 수의 Pod 복제본을 유지하는 오브젝트. 보통 Deployment가 버전마다 만들어 관리한다 (17장) |
| **롤링 업데이트 / 롤아웃** | 새 Pod를 늘리며 기존 Pod를 줄여 버전을 교체하는 방식 / 그 배포 과정 (17장) |
| **StatefulSet** | 고정된 이름(`db-0`, `db-1`)과 Pod별 스토리지가 필요한 상태 저장 워크로드용 컨트롤러 (17장) |
| **DaemonSet** | 모든(또는 선택한) 노드에 Pod를 하나씩 실행하는 컨트롤러. 로그 수집기, kube-proxy 등 (17장) |
| **Job / CronJob** | 완료될 때까지 실행하는 일회성 작업 / 일정에 따라 Job을 만드는 오브젝트 (17장) |
| **네임스페이스(쿠버네티스)** | 클러스터 안의 오브젝트 이름과 권한·쿼터를 나누는 논리적 구획. 리눅스 네임스페이스와는 다른 개념 (19장) |
| **파이널라이저(finalizer)** | 정리 작업이 끝날 때까지 삭제를 막는 장치 |
| **블래스트 레이디어스** | blast radius. 침해나 장애가 번지는 범위 |

## 스케줄링과 리소스

| 용어 | 설명 |
|---|---|
| **requests / limits** | 스케줄러가 보는 값 / 커널이 강제하는 값 |
| **Allocatable** | 노드 용량에서 시스템 예약분을 뺀, 워크로드가 쓸 수 있는 양 |
| **스로틀링(throttling)** | CPU 한도 초과 시 프로세스를 죽이지 않고 대기시키는 것 |
| **QoS 클래스** | Guaranteed / Burstable / BestEffort. 축출 우선순위를 결정 |
| **어피니티 / 안티어피니티** | affinity / anti-affinity. 특정 노드·Pod 쪽으로 끌어당김 / 밀어냄 |
| **테인트 / 톨러레이션** | taint / toleration. 노드가 거부 / Pod가 그 거부를 감내 |
| **축출(eviction)** | 노드 자원 부족 시 kubelet이 Pod를 내보내는 것 |
| **ResourceQuota / LimitRange** | 네임스페이스 전체의 자원 총량 제한 / 컨테이너별 기본값·최소·최대 지정 (19장) |
| **drain / cordon** | 노드에서 Pod를 빼내기 / 새 스케줄만 막기 |
| **PDB** | PodDisruptionBudget. 자발적 중단 시 동시에 내릴 수 있는 수 |

## 네트워크

| 용어 | 설명 |
|---|---|
| **IP-per-Pod** | 모든 Pod가 고유 IP를 갖고 NAT 없이 서로 통신한다는 쿠버네티스 네트워크 모델 (20장) |
| **Service** | 변하는 Pod 집합 앞에 고정된 가상 IP와 DNS 이름을 제공하는 오브젝트 (20장) |
| **ClusterIP / NodePort / LoadBalancer / ExternalName** | Service 타입. 클러스터 내부 가상 IP / 모든 노드의 포트 개방 / 클라우드 LB 생성 / 외부 도메인 CNAME (20장) |
| **ClusterIP(주소)** | 어떤 인터페이스에도 붙어 있지 않은 가상 IP |
| **EndpointSlice** | Service 뒤의 Pod IP 목록. 구 Endpoints를 대체하며 100개 단위로 분할 |
| **헤드리스 서비스** | `clusterIP: None`. DNS가 모든 Pod IP를 직접 반환 |
| **externalTrafficPolicy** | 외부 트래픽을 로컬 노드의 Pod로만 보낼지(`Local`) 클러스터 전체로 보낼지(`Cluster`) 결정 |
| **kube-proxy** | Service/EndpointSlice를 감시해 노드의 데이터플레인(iptables/IPVS/nftables)을 프로그래밍하는 데몬 |
| **IPVS** | IP Virtual Server. 커널의 L4 로드밸런싱 모듈. kube-proxy의 대체 모드 |
| **CNI** | Container Network Interface. Pod에 네트워크를 붙이는 플러그인 규격 |
| **오버레이(overlay)** | Pod 패킷을 노드 간 패킷에 캡슐화해 전달하는 방식 (VXLAN 등) |
| **CoreDNS** | 플러그인 체인 기반의 클러스터 DNS 서버. Service 이름은 `kube-dns` |
| **ndots** | 짧은 이름에 search 도메인을 붙여 볼 기준 점 개수. 기본 5가 성능 문제의 원인 |
| **NodeLocal DNSCache** | 노드별 DNS 캐시 데몬. 중앙 CoreDNS 부하와 conntrack 경합을 줄인다 |
| **인그레스(Ingress)** | L7 라우팅 규칙을 담은 리소스. 리소스와 컨트롤러는 다른 것 |
| **IngressController** | Ingress 리소스를 읽어 실제로 요청을 프록시하는 프로그램(ingress-nginx, AWS Load Balancer Controller 등) (22장) |
| **TLS 종료** | HTTPS 암호화를 진입점(IngressController 등)에서 풀어 내부로는 평문으로 전달하는 것 (22장) |
| **cert-manager** | 인증서 발급·갱신을 자동화하는 도구 (22장) |
| **Gateway API** | GatewayClass/Gateway/HTTPRoute로 역할을 분리한 차세대 L7 라우팅 API |
| **서비스 메시** | 사이드카 프록시로 mTLS·트래픽 제어·관측성을 구현하는 인프라 계층 |
| **남북 / 동서 트래픽** | 외부↔클러스터 / 서비스↔서비스 |
| **NetworkPolicy** | Pod 간 허용 트래픽을 정의하는 스펙. 자체 구현이 없고 CNI가 실제로 강제한다 |

## 스토리지

| 용어 | 설명 |
|---|---|
| **emptyDir** | Pod와 수명이 같은 임시 볼륨. 컨테이너 재시작에는 남지만 Pod 삭제 시 사라진다 (23장) |
| **hostPath** | 노드의 파일 시스템을 직접 마운트하는 볼륨. 보안 위험이 커 일반 앱에서는 쓰지 않는다 (23장) |
| **PV / PVC** | 실제 스토리지 조각 / 그에 대한 요청 |
| **StorageClass** | 스토리지의 "종류" 정의. 동적 프로비저닝의 기준 |
| **동적 프로비저닝** | PVC를 보고 PV를 자동 생성 |
| **접근 모드** | RWO(하나의 **노드**) / ROX / RWX / RWOP(하나의 Pod) |
| **회수 정책** | reclaimPolicy. PVC 삭제 시 Delete(데이터 삭제) / Retain(보존) |
| **volumeBindingMode** | Immediate / WaitForFirstConsumer (멀티 AZ에서 사실상 필수) |
| **CSI** | Container Storage Interface. 스토리지 드라이버 표준 |
| **VolumeSnapshot / Velero** | 볼륨 수준 스냅샷 / 쿠버네티스 리소스와 볼륨을 함께 백업·복원하는 도구 (23장) |

## 보안

| 용어 | 설명 |
|---|---|
| **인증 / 인가** | 요청자가 누구인지 확인(실패 시 401) / 그 행동을 할 권한이 있는지 확인(실패 시 403) (24장) |
| **RBAC** | Role-Based Access Control. Role × Binding 조합 |
| **ServiceAccount** | 클러스터 안의 워크로드가 쓰는 신원. 일반 사용자와 달리 실제 API 오브젝트다 (24장) |
| **어드미션(admission)** | 인가 후 저장 전에 요청을 변형·검증하는 단계 |
| **securityContext** | 컨테이너의 실행 사용자, 권한 상승, capability 등 보안 설정 (24장) |
| **PSA** | Pod Security Admission. 네임스페이스 라벨로 privileged/baseline/restricted 적용 |
| **워크로드 아이덴티티** | SA 토큰을 클라우드 자격증명으로 교환해 정적 키를 없애는 방식 (EKS의 IRSA 등) |

## 오토스케일링·배포·운영

| 용어 | 설명 |
|---|---|
| **HPA** | Horizontal Pod Autoscaler. 메트릭에 따라 Pod 수를 조절. Utilization은 requests 기준 (24장) |
| **VPA** | Vertical Pod Autoscaler. Pod의 requests/limits를 조절하거나 추천 (24장) |
| **Cluster Autoscaler / Karpenter** | 자원 부족으로 Pending인 Pod가 있으면 노드를 추가하고, 한가한 노드는 제거하는 도구 (24장) |
| **metrics-server** | kubelet에서 최근 CPU·메모리 사용량을 모아 `kubectl top`과 HPA에 제공. 장기 모니터링용이 아니다 (24장) |
| **매니지드 쿠버네티스(EKS 등)** | 클라우드가 컨트롤 플레인을 운영해 주는 서비스. 노드·클러스터 설정·워크로드는 여전히 사용자 책임 (25장) |
| **Terraform** | HCL로 VPC·EKS·노드 그룹·IAM 같은 클라우드 자원을 코드로 선언하고 `plan`/`apply`로 반영하는 도구 (25장) |
| **CI / CD** | 코드 변경 시 테스트·이미지 빌드를 자동화 / 빌드 결과를 환경에 배포하는 과정 (25장) |
| **Helm** | 매니페스트 템플릿 묶음(차트)에 값을 주입해 설치하고 릴리스 이력·롤백을 관리하는 도구 (25장) |
| **Kustomize** | 기본 YAML에 환경별 패치를 덧씌우는 도구. `kubectl apply -k`로 내장 지원 (25장) |
| **GitOps** | Git을 진실의 원천으로 삼고 에이전트가 지속적으로 조정 |
| **관측성의 세 기둥** | 메트릭(무엇이) / 로그(왜) / 트레이스(어디서) 잘못됐는지 알려 주는 증거 (26장) |
| **Prometheus** | 메트릭을 주기적으로 수집(스크레이프)·저장·쿼리하는 모니터링 시스템 (26장) |
| **Events** | 스케줄링·이미지·마운트 등 오브젝트에 일어난 일을 기록한 쿠버네티스 오브젝트. `kubectl describe` 하단에 보인다 (26장) |
| **Pending / ImagePullBackOff / CrashLoopBackOff** | 노드에 배치되지 못함 / 이미지를 받지 못해 재시도 대기 / 컨테이너가 반복 종료되어 재시작 대기 (26장) |
| **RTO / RPO** | 복구 목표 시간 / 허용 가능한 데이터 손실 시간 범위 |

*원문 근거: kubernetes-textbook-main/부록/E-용어집과-더-읽을거리.md (E.1 용어집); Kubernetes_Internals_Network_Guide/부록/B-용어집.md (네트워크 절); kubernetes-qustion-book/01_기초/02_네_도구의_역할과_관리_경계.md, 06_Git에서_EKS까지_전체_배포_흐름.md (이미지·Dockerfile·Deployment·Node·레지스트리·Terraform 설명); docker-fundamental/04_컨테이너_런타임_표준.md (OCI); 그 밖의 항목은 이 책 본문 각 장(괄호 안 장 번호)의 설명을 요약함*
