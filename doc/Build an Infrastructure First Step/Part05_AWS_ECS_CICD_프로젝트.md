# Part 05. AWS ECS/ECR 배포 + Jenkins CI/CD + My Diary 3-Tier 프로젝트

> 출처: 014~019 자료 (Ch13 Amazon ECS 3편, Ch14 Jenkins CI/CD 1편 + My Diary 프로젝트 2편).
> 초기 버전은 PDF 텍스트 추출본(한글 소실)으로 작성했으나, 이후 PDF 6편 전체(014: 15쪽, 015: 21쪽, 016: 21쪽, 017: 25쪽, 018: 17쪽, 019: 34쪽)의 한글 본문(슬라이드 설명, 강사 음성 설명 요약, 화면 캡션, 셀프 체크)을 텍스트 레이어로 직접 읽어 [이론]/주의점/오류 해결을 보강했다. 못 읽은 쪽은 없으나 슬라이드의 다이어그램/스크린샷 이미지 자체는 보지 못했고, PDF 본문의 캡션/설명 문장으로만 확인했다(이미지 안에만 있는 값은 "미확인"). 계정 ID(594682333406), 리전(ap-northeast-2), 리소스 이름은 자료 예시값 그대로이며, 비밀번호/토큰/Access Key 값은 마스킹했다.

## 전체 구축 순서 (로드맵)

| 단계 | 내용 | 환경 |
|---|---|---|
| Step 1 | Amazon ECS / ECR 개념 이해 | 이론 |
| Step 2 | ECS용 네트워크 구성 (VPC, 보안 그룹, ALB) | AWS Console |
| Step 3 | IAM 역할 + Cloud9 개발 환경 구성 | AWS Console |
| Step 4 | ECR 저장소 생성, 이미지 build/tag/push (nodejs) | Cloud9 CLI |
| Step 5 | ECS 클러스터 / 작업 정의 / 서비스 생성, 504 오류 해결 | AWS Console |
| Step 6 | nginx + Django 2-tier를 ECS에 배포 | Cloud9 CLI + Console |
| Step 7 | CI/CD 개념, Jenkins 플러그인, Pipeline 문법 | 이론 |
| Step 8 | Jenkins 컨테이너 설치 및 초기 설정 | VM CLI |
| Step 9 | Jenkins <-> GitHub 연동 (SSH Key, Deploy key, Credentials) | VM CLI + Console |
| Step 10 | ngrok + GitHub Webhook 설정 | VM CLI + GitHub |
| Step 11 | Pipeline Job(web_count_pipeline) + Freestyle Job(web_count_project) 구성, 배포 자동화 | Jenkins UI |
| Step 12 | [프로젝트] VM 기반 My Diary 3-Tier CI/CD | VM |
| Step 13 | [프로젝트] AWS 기반 3-Tier CI/CD (CodeCommit + SNS + SQS + Jenkins + ECR) | AWS + Cloud9 |

---

## Step 1. Amazon ECS / ECR 개념 이해

### 목적
Ch1~12의 VM/Docker Swarm 기반 운영에서 벗어나, AWS 관리형 컨테이너 오케스트레이션(ECS)과 이미지 저장소(ECR)가 무엇인지 이해한다.

### 이론 설명
- **Amazon ECS (Elastic Container Service)**: 컨테이너화된 애플리케이션을 배포/관리/스케일링하도록 돕는 **완전 관리형 컨테이너 오케스트레이션 서비스**. 간단한 API 호출로 단일 컨테이너부터 수천 개 컨테이너까지 복잡한 과정 없이 확장할 수 있고, 개발자/운영자는 마이크로서비스 기반 다중 컨테이너 앱의 설계/구축/실행에 집중할 수 있다.
  - (강사 설명) AWS가 'Elastic'을 즐겨 쓰는 이유는 클라우드의 탄력성(필요한 만큼 확장/축소, 쓴 만큼만 내는 종량 과금) 때문이다. 클라우드 서비스는 '완전 관리형'과 '비관리형'으로 나뉘는데, 완전 관리형은 AWS가 관리를 100% 수행하고 사용자는 활용만 하면 된다. 온프레미스에 오케스트레이션 환경을 직접 구축하면 서버 스펙/모니터링/성능 추이 관리 부담이 크지만, 관리형을 쓰면 그 부담 없이 어느 정도 성능을 보장받는다.
- **ECS 실행 환경 2가지** (두 방식 모두 "컨테이너를 돌린다"는 목표는 같고 밑바탕 인프라만 다르다)
  - **AWS Fargate**: AWS 클라우드 인프라의 가상 환경인 **Firecracker 기반 serverless container compute engine**. 서버(인스턴스) 구성 없이 코드(이미지)만으로 서비스를 운영. (강사: '서버리스'는 서버가 없다는 뜻이 아니라 서버 구성 과정 없이 바로 운영할 수 있다는 의미. Lambda 같은 서버리스 함수 코드도 같은 Firecracker 가상 환경에서 동작.)
  - **Amazon EC2**: 직접적인 클러스터 관리(모든 리소스 관리)를 강화하기 위해 EC2 인스턴스를 서버로 구성한 Docker 기반 서비스 인프라. 자원/OS를 세밀하게 제어 가능하나 운영 부담이 있음.
  - Dockerfile로 만든 image는 ECR(레지스트리)에 저장해 두고, ECS(EC2 또는 Fargate)가 이를 가져와 컨테이너로 실행.
- **ECS 구성 요소** (만드는 순서: ① Cluster 생성 → ② Task Definition 작성 → ③ 그 Task를 바탕으로 Service 생성)
  - **Cluster**: 작업(task)이나 서비스(service)의 논리적 그룹. EC2 기반 또는 Fargate 중 선택하며 작업 배포를 위한 인스턴스의 집합. 노드 수는 '하나 이상'이면 되나, 실무에서는 가용성을 위해 보통 최소 2~3개 노드로 시작한다(강사 팁). ECS 콘솔(관리 영역)은 Docker Swarm의 매니저 노드 / K8s의 control plane(master) 같은 '헤드' 역할이며 이 관리 영역은 AWS가 대신 운영하므로 사용자는 워커(컨테이너 인스턴스=K8s의 worker node)만 신경 쓰면 된다.
  - **Task Definition (작업 정의서)**: 애플리케이션 컨테이너의 명세서(JSON). 시작 유형, 컨테이너 이미지, 노출 포트, 리소스(CPU/memory), 볼륨 구성 등을 정의하며 `docker run` 명령과 유사. (강사: `-itd`, `-p`, 볼륨, 네트워크 같은 수많은 docker run 옵션을 JSON 코드로 미리 정의해 둔 것.) 이미지는 ECR URI로 지정.
  - **Task**: Task Definition에 정의된 설정으로 컨테이너 인스턴스(EC2 또는 Fargate)에 배포되는, 하나 이상의 컨테이너를 실행하는 **최소 단위**. 'Task'라는 용어 자체는 Docker Swarm에도 있던 개념.
  - **Service**: Cluster에서 지정된 수의 Task를 동시에 실행/관리. 연관된 클러스터/작업 정의/시작 유형/로드 밸런서(LB)/오토 스케일링(ASG)/배포 유형 등을 관리. **Kubernetes의 Deployment, ReplicaSet과 동일한 기능**.
- **Amazon ECR (Elastic Container Registry)**: AWS Cloud의 컨테이너 이미지 저장소로 hub.docker.com과 같은 역할. ECR이 제공하는 image URI로 build한 image를 pull/push.
  - **Registry(등록소)**: private registry는 AWS 계정 단위로 제공되며, registry에 하나 이상의 Repository를 생성. 계층: Registry > Repository > Image(태그 포함).
  - **Repository(저장소)**: Docker 이미지, OCI(Open Container Initiative) 이미지, OCI 호환 Artifact를 포함.
  - **Repository policy**: 저장소 접근 제어. IAM으로 '어떤 계정이 어떤 접근을 할 수 있는지'를 정책으로 정의.
  - push/pull 시 클라이언트는 AWS 사용자로서 **인증(authorization) 토큰**이 필요. 저장된 이미지는 ECS 전용이 아니라 일반 Docker에서 pull하거나 EKS Pod spec에서도 그대로 쓸 수 있다.
  - 부가 기능: **수명 주기 정책**(이미지가 쌓이면 비용이 늘므로 오래된 이미지 정리), **이미지 취약점 점검 스캔**(공개 Docker 이미지 상당수에 취약점이 보고되므로 꼭 점검), **교차 리전/교차 계정 복제**(서로 다른 리전 데이터센터 간, 또는 다른 계정 간 이미지 복제).
- **Amazon EKS**: AWS에서 Kubernetes를 손쉽게 실행하게 해 주는 서비스(오픈소스 쿠버네티스를 AWS가 운영해 제공). EKS 클러스터를 프로비저닝한 뒤 노드를 **AWS Fargate(서버리스) 또는 Amazon EC2(작업자 노드)** 로 구성하고 EKS에 연결해 K8s 앱을 실행. 어느 클라우드든 K8s 엔진 서비스가 있다(Google GKE, Azure AKS, 국내 KT/NHN/카카오 클라우드 등).
- **서비스 선택 가이드 (슬라이드/강사)**: 판단 기준은 결국 '성능·효율성'과 '비용'.
  - **EC2가 적합**: 각 컨테이너가 동일한 공유 디스크를 사용해야 하는 경우, 세밀한 인스턴스 세팅이 필요한 경우, 항상 실행되는 웹 서버(호스트 OS 자체에 영향을 주는 앱이나 중단 없이 떠 있어야 하는 워크로드).
  - **Fargate가 적합**: 단기간에 엄청난 CPU 연산이 필요한 경우, **5분 이상의 Lambda 실행이 필요한 경우**(Lambda는 실행 제한 시간이 있어 그보다 오래 걸리는 짧은 연산은 Fargate), 주기적으로 잠깐만 실행되는 웹 크롤러. (강사 사례: 30분 주기로 웹 크롤링 -> 분석 -> '베스트 5' 랭킹을 별도 웹 서비스에 게시하는 작업을 Fargate로 처리.)
- **흐름**: Dockerfile -> image build -> ECR push(Publish) -> Task Definition이 이미지를 가져와 컨테이너 명세 정의 -> Task가 명세대로 실행 -> Service가 지정 개수만큼 유지 -> 사용자 트래픽은 ALB를 거쳐 Service로 연결.

### 사용한 CLI
이 Step은 개념 단계로 CLI는 없다 (콘솔에서 ECR 저장소 목록/이미지 확인). 자료의 ECR 예시: private 저장소 `fc-django, fc-nginx, mydiary, mysql, nginx-esc-cli, nodejs, rolling ...`, `mydiary` 저장소 이미지 3개(frontend_v1 82.88MB, backend_v1 369.17MB, mysql5.7-debian 162.77MB).

### 확인 방법/주의점
- Task Definition = `docker run` 명령의 JSON 버전이라고 이해하면 쉽다.
- ECS/ECR/EKS 비교: ECS=AWS 전용 간단한 오케스트레이터, EKS=Kubernetes 표준(오픈소스 K8s를 AWS가 운영).
- 용어 대응(강사): ECS Service = K8s Deployment/ReplicaSet, ECS Task = Docker Swarm의 Task(K8s Pod 배포 단위 역할을 Service가 대신한다고 이해), ECS 콘솔 = control plane, 컨테이너 인스턴스(EC2) = worker node.
- 화면 확인: ECR 콘솔 Private 리포지토리 목록은 총 10개(fc-django, fc-nginx, moveho, mydiary, mysql, nginx-esc-cli, nodejs, rolling 등)이며 URI/생성 날짜/암호화 유형이 표시된다.
- 이 클립 이후 Clip2~3은 VPC 등 사전 준비가 복잡해 강사가 미리 구성한 환경의 각 단계를 캡처해 교재에 넣었으니 그대로 따라 하면 동일 환경을 만들 수 있다고 안내. 셀프 체크 질문(본문에 답 있음): ECS가 '완전 관리형'인 이유 / EC2 vs Fargate 적합 상황 / Cluster·Service·Task·Task Definition 관계 / Registry vs Repository / push·pull 절차 / ECR 부가 기능 이유 / EKS와 ECS 차이.

---

## Step 2. ECS용 네트워크 구성 (VPC / 보안 그룹 / ALB)

### 목적
ECS 클러스터가 사용할 VPC, 보안 그룹, ALB(Application Load Balancer), Target Group을 만든다.

### 이론 설명
- 배경(강사): VPC는 "격리형 클라우드 리소스 네트워크", 즉 나만의 울타리를 친 네트워크다(클라우드는 데이터센터 서버를 가상화해 제공하므로 완전 퍼블릭이면 보안 문제 -> VPC로 격리). AZ(가용 영역)는 데이터센터의 집합, 서브넷은 그 안의 논리적 네트워크 영역. 퍼블릭 서브넷=인터넷 게이트웨이로 인터넷과 연결, 프라이빗 서브넷=회사 내부 인프라처럼 외부와 직접 연결되지 않는 영역. 서울 리전(ap-northeast-2)은 AZ가 a/b/c 3개이며 "버지니아/도쿄가 아니라 반드시 서울 리전으로 배치"하라고 강조. 과거에는 VPC/서브넷/라우팅 테이블/NAT 게이트웨이를 하나하나 따로 만들어 번거롭고 실수가 잦았으나 지금의 "VPC 등" 생성 마법사는 한 번에 만들어 준다.
- VPC 설정: 이름 태그 `ecs`(생성 후 VPC 이름 `ecs-vpc`), IPv4 CIDR `10.0.0.0/16`, AZ 2개, 퍼블릭 서브넷 2 / 프라이빗 서브넷 2. 마법사 마지막 단계의 NAT 게이트웨이 옵션(없음 / 1개의 AZ에서 / AZ당 1개) 중 **이번 실습은 NAT 게이트웨이를 생성하는 쪽을 선택**했다(생성 로그에 "NAT 게이트웨이가 활성화될 때까지 대기"와 탄력적 IP 할당이 표시됨; 어느 옵션인지는 화면 이미지로만 확인 가능해 미확인). NAT(Network Address Translation)는 프라이빗 IP를 퍼블릭 IP로 바꿔 주어 프라이빗 서브넷의 외부 통신(ECR pull 등)을 가능하게 한다.
- 서브넷 CIDR:

| 서브넷 | AZ | CIDR |
|---|---|---|
| 퍼블릭 1 | ap-northeast-2a | 10.0.1.0/24 |
| 퍼블릭 2 | ap-northeast-2b | 10.0.2.0/24 |
| 프라이빗 1 | ap-northeast-2a | 10.0.3.0/24 |
| 프라이빗 2 | ap-northeast-2b | 10.0.4.0/24 |

  /24는 256개 IP이며 AWS가 서브넷당 5개를 예약해 251개 사용 가능.
- 보안 그룹 2개:
  - `ecs-sg-alb` (allow http): 인바운드 HTTP(TCP 80), 소스 0.0.0.0/0
  - `ecs-sg-instance` (allow traffic from alb): 인바운드 HTTP(TCP 80), 소스 = `ecs-sg-alb` (보안 그룹 참조)
  - **보안 그룹 체이닝**(강사): 소스를 특정 IP 대역이 아니라 앞서 만든 `ecs-sg-alb` 보안 그룹 자체로 지정하는 방식이 가장 안정적. IP가 바뀌어도 "이 보안 그룹을 통과한 트래픽만 허용" 규칙이 유지되고, ALB를 거치지 않은 요청은 컨테이너 인스턴스에 도달하지 못한다.
- ALB: 이름 `ecs-alb`, 인터넷 경계(Internet-facing), IPv4, `ecs-vpc`의 퍼블릭 서브넷 2개(ap-northeast-2a/2b) 선택(프라이빗 서브넷을 선택하면 경고 메시지가 출력됨; ALB는 외부 인터넷과 직접 연결되므로 반드시 퍼블릭). ALB는 HTTP/HTTPS(L7), NLB는 TCP/UDP(L4), 그 외 구형 클래식 로드 밸런서도 있다. ALB를 만들면 자체 DNS 주소가 생기고 이후 샘플 배포 시 이 DNS로 접속한다. "리스너"=들어오는 트래픽을 듣는 창구, "대상 그룹(Target Group)"=로드 밸런서가 트래픽을 실제로 전달하는 대상.
- 대상 그룹: 이름 `ecs-target-group`, 대상 유형 Instances, 프로토콜 HTTP:80. ALB 상태가 Provisioning -> Active가 되면 사용 가능.
- (강사 당부, Clip2 말미) 이번에 만든 VPC/보안 그룹/ALB/ECS 클러스터/Cloud9 환경은 다음 클립(Clip3)뿐 아니라 마지막 14장에서도 그대로 사용하므로 **수업을 끝낼 때까지 삭제하지 말고 유지**할 것.

### 사용한 CLI
AWS Management Console(GUI) 작업이며 CLI 없음.

### 확인 방법/주의점
- ALB의 DNS 이름은 이후 접속 테스트에 사용한다 (예: `ecs-alb-595795020.ap-northeast-2.elb.amazonaws.com`).
- 소스를 IP가 아니라 보안 그룹으로 지정하면 ALB를 통한 트래픽만 EC2로 허용된다.

---

## Step 3. IAM 역할 + Cloud9 개발 환경 구성

### 목적
Docker 이미지를 빌드해 ECR에 push할 개발 환경(AWS Cloud9, EC2 기반 IDE)과 ECR 권한을 준비한다.

### 이론 설명
- 이미지 빌드/ECR 업로드를 로컬 VM에서 해도 되지만 그러면 그 PC에 클라우드 계정/권한을 직접 설정해야 해서 번거롭다. Cloud9은 브라우저 기반 클라우드 IDE(내부적으로 EC2 사용)라 이미 클라우드 내부에 있어 이미지를 곧바로 ECR에 pull/push할 수 있고 여러 명이 같은 개발 환경에 접속해 협업할 수도 있다(강사).
- IAM 역할(Role): 신뢰 엔터티는 EC2, 권한 정책 `AmazonEC2ContainerRegistryFullAccess`를 연결. 이 역할은 Cloud9 자체가 아니라 **Cloud9 환경을 구동하는 EC2 인스턴스에 연결**되어 그 인스턴스가 ECR에 이미지를 올릴 수 있게 한다.
- Cloud9 환경: 이름 `ecs-workshop`, 설명 `fastcampus ecs workshop`, 환경 유형 새 EC2 인스턴스, 인스턴스 타입 `t3.small`. 강사: Cloud9 기본 권장 t2.micro(1GiB RAM/1vCPU)는 부족해서 안 돌아가고, 본인도 1GiB/2vCPU 정도를 최소선으로 썼지만 디스크 용량 부족으로 이미지를 더 못 만든 적이 있어 비용 부담이 크지 않다면 **t3.medium 또는 t3.large 권장**.
- Cloud9 환경 설정(Preferences, 톱니바퀴) > AWS Settings에서 "임시 자격 증명(AWS managed temporary credentials)"을 끈다. 방금 EC2에 연결한 IAM 역할의 권한을 그대로 쓰겠다는 의미. 생성된 Cloud9 IDE 좌측에는 강사가 미리 git clone해 둔 `fastcampus` 저장소가 보인다.

### 사용한 CLI
```bash
# Cloud9 터미널: Docker 설치/확인
ec2-user:~ $ sudo yum update -y
ec2-user:~ $ sudo yum install docker
# Package docker-20.10.23-1.amzn2.0.1.x86_64 already installed and latest version
ec2-user:~ $ docker version
# Client Version: 20.10.23 / Server Engine Version: 20.10.23
```
- `yum update -y`: 패키지 갱신(-y: 자동 승인)
- `docker version`: 클라이언트/서버 버전 확인

### 확인 방법/주의점
- 예제 코드는 `fastcampus` 저장소를 git clone 하여 사용 (`~/fastcampus/ch09/nodejs`, `~/fastcampus/ch13/...`).

---

## Step 4. ECR 저장소 생성 및 이미지 build / tag / push (nodejs)

### 목적
Node.js 이미지를 ECR에 올려 ECS가 pull 할 수 있게 한다.

### 이론 설명
ECR 저장소 생성 -> 로컬 Docker build -> ECR 로그인 -> ECR URI로 tag -> push. 이미지 URI 형식: `<계정ID>.dkr.ecr.<리전>.amazonaws.com/<저장소>:<태그>`. 저장소 생성 결과의 `repositoryUri` 중 계정 ID/리전 부분은 이후 push 때 그대로 쓰므로 복사해 둔다(슬라이드 안내). 용어(강사): 레지스트리가 상위, 그 밑에 리포지토리(nodejs), 그 밑에 이미지(태그 1.0).

### 사용한 CLI
```bash
# 1) ECR 저장소 생성
ec2-user:~/environment $ aws ecr create-repository --repository-name nodejs
# 출력 JSON: repositoryUri, imageScanningConfiguration(scanOnPush:false),
#   encryptionConfiguration(AES256), imageTagMutability(MUTABLE), repositoryArn ...

# 2) 이미지 빌드 (Dockerfile: EXPOSE 3000, CMD ["node","server.js"])
ec2-user:~/fastcampus/ch09 (main) $ cd nodejs
ec2-user:~/fastcampus/ch09/nodejs (main) $ docker build -t nodejs:1.0 .
ec2-user:~/fastcampus/ch09/nodejs (main) $ docker images | grep nodejs
# nodejs 1.0 465a1ce170e0 12 seconds ago 186MB

# 3) ECR 로그인
ec2-user:~ $ aws ecr get-login-password --region ap-northeast-2 | docker login \
  --username AWS --password-stdin 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com
# Login Succeeded

# 4) 계정 ID 확인
ec2-user:~ $ aws sts get-caller-identity --query Account --output text
# 594682333406

# 5) tag & push
~$ docker image tag nodejs:1.0 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/nodejs:1.0
~$ docker push 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/nodejs:1.0
```
옵션 설명:
- `aws ecr create-repository --repository-name <이름>`: ECR 저장소 생성
- `docker build -t <이름:태그> .`: 현재 디렉터리 Dockerfile로 빌드, `-t`는 이름:태그 지정
- `aws ecr get-login-password --region <리전>`: ECR 인증 토큰 출력
- `docker login --username AWS --password-stdin <레지스트리>`: 토큰을 stdin으로 받아 로그인 (사용자명은 항상 `AWS`)
- `aws sts get-caller-identity --query Account --output text`: 현재 자격 증명의 계정 ID만 텍스트로 출력
- `docker image tag <원본> <ECR URI>`: ECR 저장소 이름이 포함된 태그를 추가 (이 태그가 있어야 push 가능)
- `docker push <ECR URI>:<태그>`: ECR로 업로드

### 확인 방법/주의점
- 콘솔 ECR > nodejs 저장소에서 이미지 1.0이 보이면 성공(자료 캡처에는 이미지 2개로 표시됨).
- `docker build` 후 반드시 `docker image tag`로 ECR 주소가 포함된 이름을 붙여야 push 된다.

---

## Step 5. ECS 클러스터 / 작업 정의 / 서비스 생성 + 504 오류 해결 (nodejs)

### 목적
ECS(EC2 유형) 클러스터를 만들고 nodejs 컨테이너를 서비스로 실행해 ALB로 접속한다.

### 이론 설명
1. **클러스터**: 이름 `ecs-cluster`, 프로비저닝 모델 온디맨드 인스턴스(EC2), 인스턴스 `t3.small` x 2. 슬라이드는 t3.medium 권장이라 적혀 있으나 화면에서 실제 선택된 값은 t3.small. 강사 경험담: small로 했다가 디스크가 10GB뿐이라 이미지를 만들다 금방 가득 차서 더 이상 만들 수 없었고 루트 볼륨을 30GB로 늘려 해결(실습 화면의 "루트 EBS 볼륨 크기 30GiB"가 그 조치). 비용을 고려해 본인 상황에 맞게 선택. 네트워크: VPC `ecs-vpc`, 서브넷 프라이빗 1/2, 보안 그룹 `ecs-sg-instance`. 생성 후 상태 ACTIVE, 컨테이너 인스턴스 2개. 클러스터는 태스크를 실행할 컴퓨팅 리소스(EC2 또는 Fargate)의 묶음이다.
2. **작업 정의** `ecs-task`(EC2 호환성): 컨테이너 이름 `nodejs-app`, 이미지 `594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/nodejs:1.0`, 메모리 제한(하드) 500MiB, 포트 매핑 3000:3000(tcp), 상태 확인 `CMD-SHELL, curl -f http://localhost/ || exit 1`. **이미지 칸에는 마음대로 쓰지 말고 ECR 리포지토리 화면의 이미지 URI를 그대로 복사**해 넣어야 ECS가 이미지를 정확히 찾는다(강사). 포트 흐름: 바깥에서 80 -> ALB가 EC2(호스트) 3000으로 전달 -> 호스트 3000이 컨테이너 3000으로 연결.
3. **서비스**: 시작 유형 EC2, 작업 정의 `ecs-task:7`(패밀리:개정=리비전 7), 클러스터 `ecs-cluster`, 서비스 유형 REPLICA(지정한 개수만큼 태스크가 항상 떠 있도록 관리). 다음 단계(네트워크 구성)에서 로드 밸런서 유형 Application Load Balancer, 기존 `ecs-alb`와 `ecs-target-group`을 연결해 컨테이너 3000 포트를 ALB 80 포트와 매핑.
4. **504 Gateway Time-out 해결**: 서비스 생성 후 ALB DNS(`ecs-alb-595795020.ap-northeast-2.elb.amazonaws.com`)로 접속하면 504가 발생. 원인은 보안 그룹: ALB는 80으로 요청을 받지만 실제 컨테이너(작업 정의에서 지정한 포트)는 3000에서 동작하는데 `ecs-sg-instance`에 HTTP(80) 인바운드만 있어 ALB가 EC2의 3000 포트로 전달하려 해도 막혔다. `ecs-sg-instance` 인바운드 편집에서 **사용자 지정 TCP 3000-3010**(소스 `ecs-sg-alb`)을 추가하여 해결 -> 재접속 시 "Welcome to Fastcampus - Nodejs App using dockerfile" 응답 확인. (슬라이드: ALB를 통해 http(80)로 접속한 뒤 EC2에서 실행 중인 컨테이너에 접근하려면 작업 정의에서 설정한 3000번 포트가 노출되어야 한다.) 셀프 체크: 504의 근본 원인과 수정한 설정은?

### 사용한 CLI
콘솔(GUI) 작업. 작업 정의 핵심값(참고용):
```text
컨테이너 이름 : nodejs-app
이미지 URI    : 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/nodejs:1.0
메모리 제한   : 500 MiB
포트 매핑     : 3000 (호스트) : 3000 (컨테이너) tcp
Health check  : CMD-SHELL, curl -f http://localhost/ || exit 1
```

### 확인 방법/주의점
- ALB DNS 접속 시 504 -> 보안 그룹(ALB -> 인스턴스 3000~3010) 점검.
- 이미지 URI는 ECR에서 복사해 정확히 입력한다.

---

## Step 6. nginx + Django 2-tier 컨테이너를 ECS에 배포

### 목적
Step 4~5의 절차를 응용해, nginx(웹 서버)와 Django(애플리케이션) 두 컨테이너를 하나의 작업 정의로 묶어 ECS 서비스로 배포한다.

### 이론 설명
- 아키텍처: ECR(fc-nginx, fc-django) -> Task Definition(`2tier-task`) -> ECS Service(`fastcampus-svc1`) -> ALB. 사용자 요청은 인터넷 게이트웨이와 ALB를 거쳐 프라이빗 서브넷의 ECS 서비스로 전달되고, 서비스(태스크) 안에 Nginx 컨테이너와 Django 컨테이너가 한 쌍으로 뜬다(슬라이드 다이어그램의 AZ 표기는 us-west-2a/2b로 되어 있으나 실습 리전은 ap-northeast-2).
- **Clip2 자원을 재사용**한다: 클러스터/ALB/대상 그룹은 새로 만들지 않고 이번에는 작업 정의와 서비스만 새로 만든다(슬라이드에는 작업 정의 `fastcampus-task` / 서비스 `fastcampus-svc`로 적혀 있으나 실제 화면은 `2tier-task` / `fastcampus-svc1`).
- 이 2-tier 실습은 다음 챕터(14장 Jenkins CI/CD)의 기반이다. (강사) MSA는 여러 노드/컨테이너로 구조가 복잡해지기 쉬워 CI/CD 도구로 단순하게 관리하며, DB 계층은 변경이 적어 CI/CD 대상이 되는 경우가 적고 프론트엔드/백엔드(프레젠테이션 로직 계층)가 가장 많이 대상이 되며 특히 프론트가 가장 빈번히 배포된다.
- 소스 구조 (`~/fastcampus/ch13`): `nginx/`(Dockerfile, nginx.conf(프록시 설정), build_and_push.sh), `django/`(app/, Dockerfile, build_and_push.sh; app 내 bin/gunicorn_start, cmd/start, larva 프로젝트의 common/urls.py/views.py, 템플릿 index.html/base.html). nginx -> gunicorn -> django 3단 구조. `tree`로 확인한 `app` 경로가 Dockerfile 안에도 들어가며, 뒤에서 공유 볼륨의 마운트 포인트(`/app`)로 다시 쓰인다.
- nginx와 gunicorn(Django)은 **소켓 파일**로 통신(강사: Django는 nginx와 애플리케이션 내부 내용을 공유해야 함)하므로, 두 컨테이너가 같은 볼륨 `socket_volume`(Bind Mount, `/app` 경로)을 공유한다.
- 컨테이너 시작 순서: `fc-nginx`는 "시작 종속 관계 순서"로 `fc-django`가 **START** 상태여야 시작되도록 설정. nginx는 뒤의 django로 트래픽을 프록시하므로 django가 아직 뜨지 않은 상태에서 요청을 받으면 정상 응답할 수 없기 때문. 콘솔의 도움말(?) 아이콘에서 START/COMPLETE 등 상태 옵션의 차이를 확인할 수 있다.
- 작업 정의 `2tier-task`(이미 존재하는 작업 정의의 **새 개정 생성**으로 진행; 태스크 역할 비움, 네트워크 모드 `<default>`):
  - 호환성: EC2 (FARGATE 아님; 기존 EC2 기반 클러스터를 쓰기 위해)
  - 볼륨 추가: 이름 `socket_volume`, 유형 Bind Mount
  - 컨테이너 1 `fc-django`: 이미지 `.../fc-django:1.0`(ECR 콘솔에서 복사한 URI), 메모리 하드 제한 500MiB, **포트 매핑 없음**(슬라이드: "Backend이므로 port 연결 불필요" - nginx 뒤에 숨은 백엔드), 스토리지 및 로깅에서 마운트 `socket_volume` -> `/app`, Auto-configure CloudWatch Logs
  - 컨테이너 2 `fc-nginx`: 이미지 `.../fc-nginx:1.0`, 메모리 하드 제한 500MiB, 포트 80:80(tcp, 프론트로서 외부와 연결), 시작 종속 관계 `fc-django` START, 스토리지는 새 볼륨 대신 **"볼륨 출처"에서 소스 컨테이너를 `fc-django`로 지정**해 `socket_volume`을 공유, CloudWatch Logs 동일 선택
  - 메모리 Soft limit(소프트 제한)=컨테이너가 예약해 사용할 메모리 용량(프로비저닝용 예약 개념), Hard limit=해당 메모리 이상 사용 시 컨테이너 종료(즉시 중지). 이번 실습은 소프트 제한 없이 하드 500만 지정(컨테이너 정의 목록에 500/-로 표시).
  - 컨테이너 정의 목록에 두 컨테이너가 모두 등록된 것을 확인한 뒤 [생성]으로 새 개정 완성.
- 서비스 `fastcampus-svc1`: 시작 유형 EC2, 작업 정의 `2tier-task`(개정 1), 클러스터 `ecs-cluster`, REPLICA, 태스크 2개, 최소 정상 100% / 최대 200%, 배포 유형 롤링 업데이트(기본), 네트워킹에서 기존 `ecs-alb`의 80 리스너 / 대상 그룹 `ecs-target-group`(HTTP, 대상 유형 instance, 상태 확인 경로 기본값 `/`, 컨테이너 nginx 80) 재사용, Auto Scaling 미사용.
- 작업이 PENDING -> ACTIVATING -> RUNNING 으로 바뀌면 완료(클러스터 상세에서 활성 서비스 1개, 작업 탭에 `2tier-task:1` 기반 작업 2개).

### 사용한 CLI
```bash
# 1) ECR 저장소 생성
ec2-user:~ $ aws ecr create-repository --repository-name fc-django
ec2-user:~ $ aws ecr create-repository --repository-name fc-nginx

# 2) ECR 로그인
ec2-user:~ $ aws ecr get-login-password --region ap-northeast-2 | docker login \
  --username AWS --password-stdin 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com
# WARNING! Your password will be stored unencrypted in /home/ec2-user/.docker/config.json.
# Login Succeeded

# 3) 소스 확인
ec2-user:~/fastcampus/ch13 (main) $ cd nginx/
ec2-user:~/fastcampus/ch13/nginx (main) $ ls
# build_and_push.sh  Dockerfile  nginx.conf
ec2-user:~/fastcampus/ch13/nginx (main) $ cd ../django/
ec2-user:~/fastcampus/ch13/django (main) $ ls
# app  build_and_push.sh  Dockerfile
ec2-user:~/fastcampus/ch13/django (main) $ tree

# 4) 이미지 빌드 (각 디렉터리에서 ls -l로 Dockerfile 확인 후 빌드)
ec2-user:~ $ cd fastcampus/ch13
ec2-user:~/fastcampus/ch13/django (main) $ ls -l
ec2-user:~/fastcampus/ch13/django (main) $ docker build -t fc-django:1.0 .
ec2-user:~/fastcampus/ch13/nginx (main) $ ls -l
ec2-user:~/fastcampus/ch13/nginx (main) $ docker build -t fc-nginx:1.0 .

# 5) 태그 + ECR push
~$ docker image tag fc-django:1.0 \
   594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/fc-django:1.0
~$ docker image tag fc-nginx:1.0 \
   594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/fc-nginx:1.0
~$ docker push 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/fc-django:1.0
~$ docker push 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/fc-nginx:1.0
```
(일반화 형태) `aws ecr create-repository --repository-name <name>` / `docker build -t <repo>:<tag> .` / `docker image tag <local>:<tag> <ECR URI>/<repo>:<tag>` / `docker push <ECR URI>/<repo>:<tag>`

### 확인 방법/주의점
- ECR 콘솔에서 fc-nginx:1.0(약 10.22MB 표기) 등 push 확인.
- ALB DNS(`ecs-alb-...elb.amazonaws.com`; EC2 콘솔 로드 밸런싱 > ecs-alb 상세에서 복사) 접속 시 Django가 index.html/base.html 템플릿으로 렌더링한 "Fast campus" 메인 페이지가 보이면 성공.
- (정정) 같은 ALB/대상 그룹에 앞선 Node.js 서비스가 이미 연결돼 있으면 부하 분산 때문에 Node.js 화면과 번갈아 나타날 수 있다. 강사 설명: 이번에는 같은 대상 그룹에 fastcampus-svc1(nginx+django)이 새로 연결되어 Django 화면이 보인 것이며, ALB/대상 그룹이라는 진입점은 그대로이고 그 뒤 서비스만 바뀐 것이다. 자료에는 이전 서비스를 중지/삭제하라는 명시적 지시는 없다(자료에 없음).
- 이미지 URI 오타, 서비스 포트(80) 매핑, 컨테이너 종속성(START) 누락이 대표적 실패 원인(원인 목록 자체는 자료 명시가 아닌 점검 포인트).
- 셀프 체크: 새로 만든 것(작업 정의/서비스) vs 재사용한 것(클러스터/ALB/대상 그룹) / django에 포트 매핑이 없는 이유 / Hard vs Soft limit / START 종속 이유 / 볼륨 출처 설정 / 이전과 다른 화면이 나온 이유.

---

## Step 7. CI/CD 개념, Jenkins 플러그인, Pipeline 문법

### 목적
컨테이너 배포 자동화를 위한 CI/CD 개념과 Jenkins Pipeline의 구조를 이해한다.

### 이론 설명
- **CI (Continuous Integration, 지속적 통합)**: 개발자들이 작성한 코드를 자주 하나의 저장소에 병합(merge)하고, 그때마다 자동으로 빌드/테스트를 수행해 문제를 빠르게 발견.
- **CD (Continuous Delivery/Deployment, 지속적 전달/배포)**: 검증된 결과물을 자동으로 운영 환경까지 전달하거나 배포.
- DevOps 무한대(∞) 다이어그램: plan-code-build-test-release-deploy-operate-monitor. CI 영역(code-build-test)과 CD 영역(release-deploy-operate-monitor)이 하나의 순환 고리이며 이 프로젝트에서 그 엔진 역할을 Jenkins가 맡는다. 확장 개념으로 CT(Continuous Testing), CM(Continuous Monitoring)까지 포함하는 방향으로 확장되는 경우가 많다.
- 자동화의 목적(강사): 반복되는 빌드/배포 작업을 자동화해 업무 효율을 올리고 사람의 실수를 줄여 일관된 빌드와 배포를 보장. 자동화의 본질은 "어떤 작업을 수행할 때 사전에 인증받은 무언가를 가지고 그 인증을 통과하는 작업"이며, GitHub/Docker Hub/AWS ECR 어디든 접근하려면 사전에 인증(credential)이 준비돼 있어야 한다.
- CI/CD 도구 비교: Jenkins(오픈소스, 다양한 plugin, 설정 관리 복잡, 높은 커뮤니티 지원), Bamboo, TeamCity, GitHub Action(GitHub 자체 CI/CD, workflow 기반), GitLab(코드 저장+CI/CD 통합 플랫폼, 클라우드 연결성 좋음), CircleCI(설정 간단, 클라우드 호스팅으로 빠른 테스트/빌드), Travis CI(GitHub 연동, 사용 간편). 선택 기준은 사용자의 경험/선호도와 프로젝트 특성이며, 써 보지 않은 도구를 프로젝트에 바로 도입하는 것은 불필요한 리스크. 이 프로젝트가 Jenkins를 쓰는 이유는 오픈소스 무료에 plugin 생태계가 넓어 거의 모든 시스템과 연동되기 때문(설정이 비교적 복잡하다는 단점은 실습으로 체감).
- **Jenkins**: Java 런타임 위에서 동작하는 오픈소스 CI 서버, 문서화가 잘 돼 있음. plugin은 1800개 이상(모듈)이며 처음 올리면 기본 plugin만 있어 Docker/GitHub/AWS 연동 시 필요한 plugin을 관리 화면에서 검색해 추가 설치해야 콘솔에 기능이 나타난다. 설정이 한두 번으로는 이해되지 않고 여러 번 반복해야 눈에 들어온다(강사).
- **Jenkins 주요 플러그인**: credentials plugin(인증 관리: VM 환경 ssh key, AWS/Git은 token), git plugin(GitHub 소스코드 접근/빌드), pipeline plugin(파이프라인 구축의 핵심 CI plugin), docker plugin & pipeline(docker agent로 Jenkins가 docker 사용), blue ocean plugin(CD pipeline 상세 시각화), Amazon EC2 plugin(EC2 인스턴스 스케일링 가능한 빌드 클러스터), Metric plugin(운영 환경 성능 metric 측정용 java library).
- **Pipeline 종류**: Declarative(선언적, 빠른 업데이트와 가독성이 장점) vs Scripted(Groovy 스크립트 기반 유연한 구성). 용도에 맞게 plugin을 조합해 CI/CD 자동화 순서를 정의하는 스크립트 언어.
- **Pipeline 섹션**: Agent(여러 Slave node 중 어느 노드에 일을 시킬지 지정, node뿐 아니라 Jenkins 내부 docker container에서 수행할 명령도 지정 가능), Stage(어떤 일들을 처리할지 category 정의, 예: backend 배포용 stage), Steps(stage 안의 작업 순서/단계, plugin 설치 시 사용 가능한 step 증가), Post(stage 종료 후 결과에 따른 후속 조치: 성공 시 Email 전송, 실패 시 중단/skip 등).

### 사용한 CLI
Jenkinsfile 예시(자료 그대로):

```groovy
// Declarative
pipeline {
   agent { docker 'node:6.3' }
   stages {
      stage('build') {
         steps {
            sh 'npm version'
         }
      }
   }
}

// Scripted
node('docker') {
   checkout scm
   stage('Build') {
      docker.image('node:6.3').inside {
         sh 'npm version'
      }
   }
}
```
GitHub access token을 쓰는 Pipeline 예시:
```groovy
pipeline {
   agent any
   stages {
      stage('Prepare') {
         agent any
         steps {
            git branch: 'main',
               credentialsId: 'github_access_token',
               url: 'https://github.com/hylee-kevin/fastcampus.git'
         }
         post {
            failure {
               error "Fail Git Cloned Repository"
            }
         }
      }
   }
}
```

### 확인 방법/주의점
- `credentialsId`는 Jenkins Credentials에 등록한 ID와 정확히 일치해야 한다.
- 이 예제의 `credentialsId: 'github_access_token'` + `post { failure { error ... } }` 구조는 뒤의 실제 Jenkinsfile과 거의 같은 패턴이다. `credentialsId` 같은 값은 처음부터 직접 쓰기보다 Jenkins 공식 문서의 예제를 복사해 자신의 값으로 수정해 쓰는 것이 일반적이라는 강사 조언.
- 도구 선택/Jenkins 선택 이유는 위 이론 참고. 셀프 체크: CI vs CD와 CT/CM 확장 / Declarative vs Scripted / Agent·Stage·Steps·Post 역할.

---

## Step 8. Jenkins 컨테이너 설치 및 초기 설정 (VM, Docker)

### 목적
Docker로 Jenkins를 실행하고 초기 잠금 해제/관리자 계정 생성을 마친다.

### 이론 설명
- 이미지는 `jenkins/jenkins:lts` (실습 기준 Jenkins 2.401.2, 약 471MB). 강사: `latest` 태그가 아니라 반드시 **LTS(Long Term Support) 태그**를 받으라(둘은 미묘하게 차이가 있고 실습 안정성을 위해 LTS). Jenkins를 로컬에 직접 설치하는 방법도 있으나 이 강의는 컨테이너로 띄운다.
- 호스트 포트 18080 -> 컨테이너 8080(외부 접속용 필수 포트; 8080과 겹치지 않는 범용 포트로 18080 매핑), 50000(여러 노드의 마스터-슬레이브 구성 시 Jenkins agent 간 통신 포트 - 노드 하나만 쓰면 사실 열지 않아도 되나 구조를 보이려 포함). `--name=fc-jenkins`의 'fc'는 패스트캠퍼스 약자일 뿐 자유롭게 지어도 된다.
- `-itd`: 백그라운드 실행. `--privileged=true -u root`: `--privileged` 기본값은 false이며 false면 root여도 커널 모드 관련 시스템 자원 접근이 제한될 수 있다. Jenkins가 직접 이미지를 빌드해야 하므로 컨테이너 내부 시스템 자원 접근 권한을 열어 준다(강사는 이를 도커 인 도커(DinD) 구성에 필요한 것으로 설명). `-u root`는 여러 권한 문제/명령어 수행을 위해 지정(일반 사용자 지정 시 권한 부여 후 사용).
- 볼륨 2개가 필요한 이유(강사): ① `-v /var/run/docker.sock:/var/run/docker.sock` - 호스트에 설치된 docker.sock을 공유해 Jenkins 컨테이너 안의 docker 명령이 실제로는 **호스트의 Docker 데몬**을 쓰게 한다(별도로 docker in docker(dind)를 쓰는 방법도 있음). ② `-v /home/kevin/fastcampus/jenkins:/var/jenkins_home` - Jenkins 설정/데이터를 호스트에 영구 보관하고 Jenkins 내부에서 애플리케이션 소스코드를 보고 빌드할 수 있게 한다. 이 볼륨 디렉터리는 기본적으로 소유자가 root라 이어서 `sudo chown`으로 실제 사용 계정 권한으로 바꿔 준다.
- 컨테이너 안에서 `docker ps`를 실행하면 호스트에서 본 것과 동일한 컨테이너 목록이 보이는데 docker.sock 공유 덕분이다. 단, 강사는 Jenkins가 빌드/소스 관리를 하려면 **Jenkins 컨테이너 내부에도 Docker(DinD)를 curl로 한 번에 설치해야 한다**고 강조했다(설치 명령 자체는 이 PDF에 없음. Step 13의 Dockerfile 방식이 이를 apt로 자동화한 것).
- 초기 접속: `http://<VM_IP>:18080` (예: 192.168.56.101:18080) -> Unlock Jenkins(처음엔 잠겨 있어 초기 암호 필수) -> 초기 admin 비밀번호 입력 -> Customize Jenkins에서 "Install suggested plugins"(1800개 전체가 아니라 가장 널리 쓰는 기본 세트만 설치; 보통 2~3분) -> Create First Admin User(계정명/암호/암호 확인/이름/이메일 5칸을 모두 채워야 Save 활성화, 입력한 '이름'이 로그인 후 우측 상단에 표시) -> Save and Finish -> Instance Configuration. 강사: 설치 자체는 어렵지 않고, 설치 후 내/외부 시스템과 연결하기 위한 인증 작업이 많아 Jenkins 구성이 복잡하게 느껴진다.

### 사용한 CLI
```bash
kevin@hostos1:~/fastcampus/ch14$ ls
# ngrok  notepad14.txt  web-count
~$ docker pull jenkins/jenkins:lts
~$ docker run -itd --name=fc-jenkins -p 18080:8080 -p 50000:50000 \
> --privileged=true -u root \
> --restart=always \
> -v /var/run/docker.sock:/var/run/docker.sock \
> -v /home/kevin/fastcampus/jenkins:/var/jenkins_home \
> jenkins/jenkins:lts

~$ sudo chown -R kevin.kevin /home/kevin/fastcampus/jenkins
~$ sudo netstat -nltp | grep docker-proxy
# tcp 0.0.0.0:50000 LISTEN docker-proxy / tcp 0.0.0.0:18080 LISTEN docker-proxy

kevin@hostos1:~/fastcampus/ch14$ docker images | grep jenkins
# jenkins/jenkins lts 825c3e86c65d 3 weeks ago 471MB

# 초기 관리자 비밀번호 확인 (두 가지 방법)
~$ docker exec fc-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
~$ docker logs fc-jenkins
~$ docker logs -f fc-jenkins     # plugin 설치 진행을 실시간으로 확인할 때

# Restart Jenkins 후 화면이 안 뜰 때 (컨테이너 상태 확인 후 재기동)
~$ docker ps
~$ docker start fc-jenkins
```
옵션 설명:
- `-itd`: 대화형 + TTY + 백그라운드 / `--name`: 컨테이너 이름
- `-p 18080:8080`: 호스트 18080 -> 컨테이너 8080 / `-p 50000:50000`: agent 통신
- `--restart=always`: 재부팅/종료 시 자동 재시작
- `-u root`: root 사용자로 실행
- `-v`: 볼륨(바인드 마운트) 지정
- `chown -R`: jenkins_home 디렉터리 소유권 변경
- `netstat -nltp`: 리슨 중인 포트와 프로세스 확인

### 확인 방법/주의점
- 초기 비밀번호는 `docker exec ... cat` 또는 `docker logs`(별표로 감싼 영역)에서 확인한다 (예시 값은 노출 금지).
- Jenkins 메뉴: Manage Jenkins > Plugins > Installed plugins 에서 SSH 관련 플러그인 확인. 플러그인 설치 후 Restart Jenkins 필요할 수 있고, 재시작 시 컨테이너가 내려가면 `docker ps`/`docker start`로 확인.
- 추가 플러그인: GitHub Integration, Docker Pipeline, Generic Webhook Trigger, Publish Over SSH(Jenkins 자체가 Host OS 위 컨테이너로 돌고 있어 SSH 기반 통신용으로 필요하다고 강사 설명).
- 팁(강사): suggested plugins 설치 중 다른 터미널에서 `docker logs -f fc-jenkins`를 실행하면 설치 진행 로그를 실시간으로 볼 수 있다. plugin을 여러 개 설치할 때는 완료를 기다리지 않고 다음 plugin을 이어서 설치해도 되며 마지막에 한 번만 Restart Jenkins 하면 된다. 재시작 후 화면이 안 올라오면 `docker ps`로 컨테이너가 죽었는지 확인하고 `docker start`로 다시 켠다. 컨테이너에 들어갈 때는 `-u` 옵션으로 사용자를 지정하는 것을 권장.
- 초기 admin 비밀번호는 로그에 그대로 노출되므로 문서에 옮기지 않는다(자료의 값은 마스킹).

---

## Step 9. Jenkins <-> GitHub 연동 (SSH Key, Deploy Key, Credentials)

### 목적
Jenkins가 GitHub 저장소를 clone 할 수 있도록 SSH 키를 만들고 Deploy key / Credentials로 등록한다.

### 이론 설명
- GitHub private 저장소에 Jenkins가 접근하려면 인증이 필요하다. 실습에서 준비하는 인증은 총 3가지: ① Jenkins 컨테이너 자체의 SSH 인증, ② Docker Hub 인증, ③ GitHub 인증. 이 셋이 모두 있어야 로컬 `git push` -> Jenkins가 변경 수신/빌드 -> Docker Hub push -> 이미지 pull 후 운영 앱 반영의 흐름이 완성된다. (실습 저장소는 `web-count`; `jenkins-django` 저장소는 무관.)
- Jenkins 컨테이너 내부 `/var/jenkins_home/.ssh`(없으면 새로 생성)에서 `ssh-keygen`으로 **RSA** 키 쌍(`fc-jenkins`, `fc-jenkins.pub`; 파일명은 자유, 강사는 컨테이너 이름과 동일하게) 생성. jenkins_home에는 운영 중이면 파일이 많지만 처음 시작하는 환경은 비어 있는 게 정상.
- 공개키(.pub) -> GitHub 저장소 **Settings > Deploy keys > Add deploy key** 에 등록. Deploy key는 저장소 하나에 대해서만 읽기(또는 읽기/쓰기) 권한을 주는 제한된 키로, 개인 계정 전체 접근 권한인 Personal Access Token보다 보안 범위가 좁아 특정 저장소 하나만 clone하는 Jenkins에 더 안전하다(강사).
- 개인키 -> Jenkins **Manage Jenkins > Credentials**(Global 범위 Add Credentials)에서 Kind `SSH Username with private key`, Username에는 컨테이너를 만들 때 쓴 계정, Private key `Enter directly`로 개인키 값 붙여넣기 후 Create. 등록된 credential은 지문 모양 아이콘으로 표시된다.
- Docker Hub / GitHub용 Username with password credential 등록 (Password에는 토큰 사용):
  - Docker Hub: Kind `Username with password`, Username=Docker ID, Password=access token, ID `docker-access`, Description `DOCKER-CREDENTIALS`
  - GitHub: Kind `Username with password`, Username=GitHub ID, Password=Personal Access Token, ID `github_access_token`
- Docker Hub 토큰: Account Settings > Security > New Access Token (Generate token을 누르는 순간 **딱 한 번만** 표시되므로 그 자리에서 복사해 안전한 곳에 보관; 이후 재확인 불가, 필요하면 재생성). GitHub Personal Access Token도 발급 시점에만 값이 노출되므로 즉시 복사.
- Password 칸에는 실제 계정 비밀번호가 아니라 각각 발급한 access token을 넣는다. 그러면 실제 로그인 비밀번호를 Jenkins에 저장하지 않아도 되고 문제 시 token만 폐기(revoke)하면 되어 더 안전(강사).

### 사용한 CLI
```bash
# Jenkins 컨테이너 접속
~$ docker exec -it fc-jenkins bash
root@46519e6af2a6:/var/jenkins_home# ls

# (참고) 컨테이너 내부에서도 호스트와 같은 컨테이너 목록이 보임 = docker.sock 공유
root@46519e6af2a6:/var/jenkins_home# docker ps

# 키 생성 (.ssh 디렉터리에서 ssh-keygen 수행, 파일명 fc-jenkins)
root@46519e6af2a6:/var/jenkins_home# mkdir .ssh        # 없으면 새로 생성
root@46519e6af2a6:/var/jenkins_home# cd .ssh
root@46519e6af2a6:/var/jenkins_home/.ssh# ssh-keygen -t rsa   # RSA 키 쌍, 저장 파일명 프롬프트에 fc-jenkins 입력 (원문에 정확한 옵션 미표시)
root@46519e6af2a6:/var/jenkins_home/.ssh# ls
# fc-jenkins  fc-jenkins.pub
root@46519e6af2a6:/var/jenkins_home/.ssh# cat fc-jenkins       # 개인키 -> Jenkins Credentials
root@46519e6af2a6:/var/jenkins_home/.ssh# cat fc-jenkins.pub   # 공개키 -> GitHub Deploy key
```
- `ssh-keygen`: SSH 키 쌍 생성 (자료에서는 RSA 방식, 저장 파일명 `fc-jenkins` 지정)

### 확인 방법/주의점
- 개인키/토큰은 외부에 노출하지 말 것. 토큰이 노출되면 revoke/재발급.
- Credentials ID(`docker-access`, `github_access_token`)는 이후 Jenkinsfile의 `credentialsId`와 동일해야 한다.

---

## Step 10. ngrok + GitHub Webhook 설정

### 목적
GitHub push 이벤트가 VM(사설 IP)의 Jenkins까지 도달하도록 ngrok으로 공개 URL을 만들고 Webhook을 등록한다.

### 이론 설명
- Webhook: git push, commit 등 특정 이벤트 발생 시 서비스/응용프로그램으로 알림(HTTP 요청)을 보내는 기능. GitHub plugin이 설치돼 있으면 push 시 Jenkins가 이를 감지해 빌드를 시작한다. 그러나 VM(로컬)의 Jenkins는 사설 IP라 나가는 연결은 되지만 외부에서 들어오는 public 연결은 받을 수 없어 GitHub가 webhook을 보낼 수 없다. (AWS 같은 클라우드 VM이라면 인스턴스 public IP를 그대로 webhook 주소로 쓸 수 있다.) 그래서 **ngrok**으로 임시 공개 https 주소를 발급받아 터널링한다. ngrok은 실제 업무(상용)용으로는 제한이 있어 업무에 쓰려면 유료 요금제가 필요할 수 있다(강사).
- GitHub **Settings > Webhooks > Add webhook**: Payload URL = `ngrok 주소 + /github-webhook/`, Content type = `application/json`, 이벤트 = "Just the push event".
- Jenkins **Manage Jenkins > System > Jenkins Location > Jenkins URL**을 ngrok 주소로 변경.
- ngrok 무료 플랜은 재실행(세션)마다 주소가 바뀌므로 Webhook URL / Jenkins URL을 새 주소로 다시 수정해야 한다. ngrok 주소는 **두 곳**에 반영: ① GitHub 저장소 Settings > Webhooks의 Payload URL(주소 + `/github-webhook/`, Content type은 반드시 `application/json`, 등록 후 목록에 초록 체크 표시), ② Jenkins 관리 > System > Jenkins Location의 Jenkins URL(Jenkins가 자신을 외부에 알릴 때도 같은 주소 사용).
- ngrok 사용 전 ngrok.com에 회원 가입해 개인 token(add-authtoken)을 발급받아야 한다(자료 화면의 토큰 값은 마스킹, 실제 값은 문서에 옮기지 않음). 화면 예시: Session Status online, Plan Free, Version 3.3.1, Region Japan(jp), Web Interface `http://127.0.0.1:4040`.

### 사용한 CLI
```bash
# ngrok 설치
ch14$ mkdir ngrok && cd $_
ch14/ngrok$ wget -c https://bin.equinox.io/c/4VmDzA7iaHb/ngrok-stable-linux-amd64.zip
ch14/ngrok$ unzip ngrok-stable-linux-amd64.zip
ch14/ngrok$ sudo snap install ngrok

# ngrok 계정 토큰 등록 (ngrok.com 가입 후 발급, 토큰 값은 비공개)
ch14/ngrok$ ngrok config add-authtoken <YOUR_AUTHTOKEN>
# Authtoken saved to configuration file: .../ngrok.yml

# Jenkins 포트 터널링
ch14/ngrok$ ngrok http 18080
# Forwarding https://xxxx.ngrok-free.app -> http://localhost:18080
# Web Interface http://127.0.0.1:4040
```
- `wget -c`: 이어받기 지원 다운로드 / `unzip`: 압축 해제 / `mkdir ngrok && cd $_`: 디렉터리 생성 후 이동
- `ngrok http 18080`: 로컬 18080 포트를 공개 https 주소로 노출

### 확인 방법/주의점
- Webhook 등록 후 "Okay, the hook was successfully updated." 확인.
- ngrok 세션이 종료되면 Webhook이 동작하지 않는다.

---

## Step 11. Pipeline Job + Freestyle Job 구성 및 배포 자동화 (web-count 예제)

### 목적
git push -> Jenkins Pipeline(Clone / Build / Push) -> 후속 Freestyle Job(compose down / pull / up)으로 이어지는 CI/CD 전 과정을 구성한다.

### 이론 설명
- 예제 앱 `web-count`(Flask, Redis 방문 횟수 카운터, Dockerfile, docker-compose.yml, requirements.txt; Ch10 도커 컴포즈 실습 소스 재사용)를 GitHub에 push. 새로고침(F5)마다 방문 횟수가 오르고 8개 이미지 중 하나가 무작위로 표시되며 `docker-compose up -d`로 8899 포트에서 정상 동작을 먼저 확인한 뒤 소스를 바꿔 자동 배포되는 모습을 지켜본다. push 전 기존 `origin`이 있으면 `git remote remove origin` 후 `git remote add origin ...` 하고 `git remote -v`로 확인.
- **두 Job 구조**: web_count_pipeline(Pipeline Job)은 빌드/이미지 push를 정의하고, web_count_project(Freestyle Job)는 파이프라인 뒤에 실제 배포 명령을 실행한다.
- **web_count_pipeline (Pipeline Job)**: General > GitHub project에 저장소 주소 입력, Build Triggers > `GitHub hook trigger for GITScm polling`, Pipeline Definition `Pipeline script from SCM`(SCM = Software Configuration Management, 여기선 Git), Repository는 web-count, Credentials는 GitHub credential, Branch Specifier는 저장소 실제 기본 브랜치와 반드시 일치, Script Path `Jenkinsfile`(저장소 루트, 대문자 J). Jenkinsfile은 docker run 때 잡은 두 번째 볼륨 경로(= jenkins_home에 연결된 호스트 디렉터리 안의 web-count 소스 디렉터리) 바로 안에 만들어 저장소에 포함시켜야 한다.
- **web_count_project (Freestyle Job)**: General의 GitHub project와 소스 코드 관리(Git, Repository/Credentials)는 pipeline과 같게 두되 Build Triggers가 다르다: `Build after other projects are built` (Projects to watch: web_count_pipeline). Build Steps > Execute shell 에서 배포 명령 실행(Jenkins 컨테이너가 호스트 Docker를 docker.sock으로 공유하므로 가능). 흐름: GitHub push -> web_count_pipeline이 build & push -> 끝나면 곧바로 web_count_project가 down/pull/up.
- docker-compose.yml에서는 `build: .` 대신 `image:`를 사용해 Docker Hub에서 pull 하도록 한다 (Jenkins가 이미 빌드해 올린 이미지이므로 build 불필요; Jenkinsfile이 push한 이미지:태그와 동일하게). 강사는 두 버전의 compose 파일을 미리 준비하고 `mv`로 build 포함 파일을 백업명으로 옮긴 뒤 새 파일을 docker-compose.yml로 쓴다. 이 시점에는 Jenkins가 이미지를 한 번도 push하지 않아 image가 없으므로 정상 동작하지 않는 게 당연하다고 안내.
- 배포 검증: `templates/index.html`에서 `{{visit_count}}` 줄 바로 아래에 확인용 문구 한 줄을 추가(슬라이드는 Version 1, 라이브 데모는 이미 한 번 테스트했으므로 Version 2로 재수정)하고 `git status`(빨간 글씨) 확인 -> `git add .` -> `git commit` -> `git push`(HTTPS면 GitHub 계정명과 access token 입력) -> Webhook -> Jenkins Job 연쇄 실행 -> 화면에 변경 반영(재배포 직후 잠깐 재연결 지연이 있을 수 있음).

### 사용한 CLI
```bash
# (사전 확인) web-count 앱을 로컬에서 먼저 실행해 8899 포트 동작 확인
kevin@hostos1:~/fastcampus/ch14/web-count$ docker-compose up -d

# (기존 origin이 있을 때) 원격 재지정
kevin@hostos1:~/fastcampus/ch14/web-count$ git remote remove origin

# web-count 소스를 GitHub에 push
kevin@hostos1:~/fastcampus/ch14/web-count$ git config --global user.email "..."
kevin@hostos1:~/fastcampus/ch14/web-count$ git config --global user.name "..."
kevin@hostos1:~/fastcampus/ch14/web-count$ git add .
kevin@hostos1:~/fastcampus/ch14/web-count$ git commit -m "web-count first commit"
kevin@hostos1:~/fastcampus/ch14/web-count$ git branch -M main
kevin@hostos1:~/fastcampus/ch14/web-count$ git remote add origin https://github.com/hylee-kevin/web-count.git
kevin@hostos1:~/fastcampus/ch14/web-count$ git push origin main
kevin@hostos1:~/fastcampus/ch14/web-count$ git remote -v
# (기존 origin이 있으면) git remote remove origin 후 다시 add
```
- `git branch -M main`: 현재 브랜치를 main으로 강제 변경 / `git remote add origin <URL>`: 원격 등록 / `git remote -v`: 원격 목록 확인

Jenkinsfile (Pipeline Job, Scripted) - 저장소 루트(web-count)에 작성:
```bash
jenkins/web-count$ vi Jenkinsfile
```
```groovy
node {
   stage('Clone repository') {
      git credentialsId: 'github_access_token', url: 'https://github.com/hylee-kevin/web-count.git'
   }
   stage('Build image') {
      dockerImage = docker.build("leecloudo/web_count:v1.0")
   }
   stage('Push image') {
      withDockerRegistry([ credentialsId: "docker-access", url: "" ]) {
         dockerImage.push()
      }
   }
}
```
Freestyle Job > Build Steps > Execute shell:
```bash
cd /var/jenkins_home/web-count   # Jenkins 컨테이너 내부 경로
docker compose down
docker pull leecloudo/web_count:v1.0
docker compose up -d
```
docker-compose.yml (`jenkins/web-count$ vi docker-compose.yml`로 수정):
```yaml
version: '3.3'   # 자료 주석: 버전 에러가 발생해서 3.8에서 3.3으로 수정
services:
  webserver:
    #build: .   # jenkins 서버에서 build 하지 않고 Docker Hub에서 pull
    image: leecloudo/web_count:v1.0   # Jenkinsfile에서 push 한 image:tag 와 동일
    ports:
      - "8899:8899"
    depends_on:
      - redis
  redis:
    image: redis:6.0
```
배포 테스트용 index.html 수정:
```html
<p>[Jenkins Deploy test -- Version 1]</p>   <!-- Version 2 등으로 수정 후 git add/commit/push -->
```
수정 -> push로 자동 빌드/배포 트리거:
```bash
jenkins/web-count$ vi templates/index.html   # {{visit_count}} 줄 바로 아래에 문구 추가
jenkins/web-count$ git status                # 변경 파일(빨간 글씨) 확인
jenkins/web-count$ git add .
jenkins/web-count$ git commit -m "..."       # 커밋 메시지는 원문 미표시
jenkins/web-count$ git push                  # HTTPS: GitHub 계정명 + access token 입력
```

### 확인 방법/주의점
- Job 실행 결과는 Stage View(Clone -> Build -> Push 단계별 진행) / Console Output에서 확인. 대시보드 '최근 성공' 열에 소요 시간이 기록되고 두 Job 모두 성공(자료 표기는 초록 체크)이어야 한다. 실패하면 반드시 Console Output을 열어 어느 단계에서 무엇이 잘못됐는지부터 확인(강사도 실습 중 여러 번 실패).
- push 직후 자동 감지에는 약간의 딜레이가 있을 수 있다. 기다리기 어려우면 Job 화면에서 수동으로 '지금 빌드'를 누르면 된다.
- 브랜치명(master vs main)이 GitHub와 Job의 Branch Specifier에서 일치해야 한다. 불일치하면 이후 Job 설정이 어긋나 실습이 꼬인다. (자료 내 불일치: 강사 음성은 GitHub 기본 브랜치를 master로 맞춰 `*/master`를 쓴다고 했으나 위 push 명령은 `git branch -M main`, Job 화면 캡처 캡션은 `*/main`. 본인 저장소의 실제 기본 브랜치에 맞출 것.)
- Freestyle Job의 `cd` 경로는 Jenkins 컨테이너 기준 경로이다. docker run 때 잡은 볼륨 덕에 컨테이너의 `/var/jenkins_home/web-count`에서 호스트와 동일한 소스(및 Jenkinsfile)가 보인다. 3단계: 기존 compose 서비스 `down` -> 새로 push된 이미지 `pull` -> `up -d`.
- 셀프 체크 요약: 두 Job의 역할 차이와 체이닝 방법 / 배포 Job의 3단계 명령 / docker.build와 dockerImage.push의 credentialsId(push는 `docker-access`, clone은 `github_access_token`).

---

## Step 12. [프로젝트] VM 기반 My Diary 3-Tier 컨테이너 CI/CD (MSA)

### 목적
Ch10에서 만든 My Diary 3-Tier(Node frontend / Spring Boot backend / MySQL DB)를 Step 8~11의 Jenkins 환경에 적용해 CI/CD를 구성한다. (자료에서는 frontend만 CI/CD 대상으로 사용)

### 이론 설명
- 흐름: 소스 수정 -> git push -> GitHub Webhook -> Jenkins `mydiary-msa-pipeline`(Pipeline Job: clone, build, push) -> 성공 시 `mydiary-msa-project`(Freestyle Job: compose down/pull/up) 자동 실행. 개발팀이 로컬에서 코드를 고쳤다고 가정하고 git add/commit/push -> Webhook -> Jenkins가 최신 소스를 가져와 build/test/deploy(새 이미지를 Docker Hub에 push -> 운영 컨테이너를 `docker compose down` -> 새 이미지 pull -> `docker compose up`).
- Clip1에서 띄운 fc-jenkins(18080)와 그때 만든 Credential(SSH, Docker Hub, GitHub)을 **재사용**한다. VM은 사설 IP라 이번에도 ngrok으로 임시 공인 주소를 발급받는다.
- 범위 축소(강사): 이 실습은 frontend 소스 수정을 CI/CD로 배포하는 것을 기준으로 하며 백엔드(Spring Boot)/DB(MySQL)는 기존에 빌드된 이미지를 그대로 쓰고 변경이 없다. 실제 현업이라면 둘 다 파이프라인에 포함할 수 있으나 여기선 동작 원리를 보이려 범위를 좁혔다. 원래 docker-compose.yaml은 프론트/백엔드 두 디렉터리의 Dockerfile을 각각 빌드하는 구조.
- Job을 둘로 나누는 이유: Pipeline Job은 '새 이미지를 만들어 Docker Hub에 올리는 것'까지만 하고, 운영 컨테이너 교체(배포)는 별도 Freestyle Job으로 분리해 빌드 유발 옵션으로 체이닝한다(하나의 Jenkinsfile에 모든 단계를 넣지 않는 구성).
- 준비: Jenkins 컨테이너(`fc-jenkins`, 18080) 가동, ngrok로 Jenkins 공개, GitHub 저장소 `jenkins-mydiary-msa`의 Webhook Payload URL을 `https://<ngrok>.ngrok-free.app/github-webhook/` / Content type `application/json` / `Just the push event`로 갱신. Jenkins Location의 Jenkins URL도 ngrok 주소로 변경.
- Jenkins Credentials 정리:

| Credential ID | 용도 |
|---|---|
| kevinlee | SSH Private Key (GitHub Deploy key 연동) |
| docker-access (DOCKER-CREDENTIALS) | Docker Hub 계정 + 토큰, push(withDockerRegistry) |
| github_access_token (GITHUB-CREDENTIALS) | GitHub 계정 + Personal Access Token, clone |

- **mydiary-msa-pipeline** 설정: Definition `Pipeline script from SCM`, SCM Git, Repository URL `https://github.com/hylee-kevin/jenkins-mydiary-msa.git`, Credentials GitHub, Branch Specifier `*/master`, Script Path `Jenkinsfile`.
- Script Path에 `Jenkinsfile`만 적어도 되는 이유: Clip1에서 docker run 시 Jenkinsfile을 읽을 수 있는 볼륨을 미리 마운트해 두었기 때문. 강사는 참고용으로 미리 만들어 둔 예시 Job(mydiary-msa-pipeline/-project)을 화면에 띄워 설정값을 설명했다(Jenkins 대시보드: `192.168.56.101:18080`).
- **mydiary-msa-project** (Freestyle) : Build Triggers `Build after other projects are built`, Projects to watch `mydiary-msa-pipeline`, `Trigger only if build is stable`. pipeline이 '안정적으로' 성공하면 자동으로 이어서 실행된다.
- **Job 이름 오타 주의(실전 교훈)**: 처음 만든 Freestyle Job 이름이 `mydiary-msa-projectt`(t 하나 더)로 오타였고, 이후 올바른 이름 `mydiary-msa-project`로 다시 구성해 대시보드에 초록 아이콘(pipeline #4 / project #5)으로 정리했다. Job 이름이나 'Projects to watch' 이름의 사소한 오타 하나로도 자동화 체인이 끊길 수 있다.
- Execute shell의 `cd` 경로는 Jenkins 컨테이너 내부(`/var/jenkins_home/...`) 기준. **호스트(VM) 실제 경로를 그대로 적으면 '연결할 수 없다'는 에러가 자주 난다**(강사). 반드시 Jenkins 컨테이너 내부 기준 경로(docker run의 `-v` 마운트 경로)를 써야 한다.
- ngrok 재설정: GitHub Webhook Payload URL(`/github-webhook/` 필수, `application/json`, `Just the push event`; 갱신 성공 시 "Okay, the hook was successfully updated.")과 Jenkins URL을 **둘 다** 새 주소로 바꾼다. Jenkins URL이 옛 주소로 남으면 Jenkins가 생성하는 링크(빌드 결과 알림 등)가 죽은 주소를 가리킨다. 무료 플랜은 실행마다 주소가 바뀐다.
- (자료의 Webhook 화면 예시) 이전 ngrok 주소로 등록돼 있던 webhook을 새 주소로 수정하는 과정이 캡처되어 있음(주소 값은 매번 달라지므로 생략).

### 사용한 CLI
```bash
# Jenkins 컨테이너 확인
~$ docker ps
# jenkins/jenkins:lts ... 0.0.0.0:50000->50000/tcp, 0.0.0.0:18080->8080/tcp  fc-jenkins

# ch10의 my-diary-3 소스를 Jenkins 작업 디렉터리로 복사
~/fastcampus/jenkins$ cp -r /home/kevin/fastcampus/ch10/my-diary-3 .
~/fastcampus/jenkins/my-diary-3$ ls
# docker-compose.yaml  my-diary-back  my-diary-front

~/fastcampus/jenkins/my-diary-3$ docker images | grep mydiary
# mydiary-back 1.0 ... 694MB / mydiary-front 1.0 ... 252MB

# frontend만 CI/CD 대상으로 정리 (backend 제거, front 내용을 루트로 이동)
~/fastcampus/jenkins/my-diary-3$ rm -rf my-diary-back
~/fastcampus/jenkins/my-diary-3$ mv my-diary-front/* .
~/fastcampus/jenkins/my-diary-3$ ls
# app.js docker-compose.yaml Dockerfile fastcampus.png package.json package-lock.json public

# (재확인) Clip1의 web-count 컨테이너 상태 확인/기동 (ngrok 재실행과 함께)
#  (실행 디렉터리는 원문 미표시, web-count compose 디렉터리에서 실행)
~$ docker compose ps
~$ docker compose up -d
~$ ngrok http 18080    # ngrok 재실행으로 새 공개 주소 발급 -> Webhook/Jenkins URL 갱신

# Jenkinsfile 작성
jenkins/my-diary-3$ vi Jenkinsfile
```
Jenkinsfile:
```groovy
node {
   stage('Clone repository') {
      git credentialsId: 'github_access_token', url: 'https://github.com/hylee-kevin/jenkins-mydiary-msa.git'
   }
   stage('Build image') {
      dockerImage = docker.build("leecloudo/mydiary-front:2.0")
   }
   stage('Push image') {
      withDockerRegistry([ credentialsId: "docker-access", url: "" ]) {
         dockerImage.push()
      }
   }
}
```
Freestyle Job (mydiary-msa-project) > Execute shell:
```bash
cd /var/jenkins_home/my-diary-3
docker compose down
docker pull leecloudo/mydiary-front:2.0
docker compose up -d
```
CI/CD 트리거 테스트 (코드 수정 -> push):
```bash
jenkins/my-diary-3$ vi public/index.ejs
#  <h2>Docker class diary -kevin-</h2>   # 문구 수정
jenkins/my-diary-3$ git status
jenkins/my-diary-3$ git add .
jenkins/my-diary-3$ git commit -m "mydiary msa commit"
jenkins/my-diary-3$ git push -u origin master
# Username/Password(토큰) 입력
```
- `git push -u origin master`: 업스트림 지정하며 master 브랜치 push

### 확인 방법/주의점
- Jenkins Stage View에서 Clone repository -> Build image -> Push image 3단계가 성공(초록)하고, 이어서 mydiary-msa-project가 자동 실행되는지 확인.
- `http://192.168.56.101:3000` 접속 시 변경된 문구가 보이면 성공(원래 문구는 'fastcampus My class diary', 수정 후 "Docker class diary -kevin-"). Stage View 시간 예시: Clone 1s / Build 34s / Push 14s~20s.
- backend(Spring Boot)/DB(MySQL)는 변경이 없으므로 CI/CD 대상에서 제외(기존 이미지 재사용).
- 실패 시(Stage View가 빨간색) 해당 Job의 Console Output 확인. 대부분 원인은 오타나 경로/자격 증명 설정 실수. ngrok 주소가 바뀌면 Webhook / Jenkins URL을 다시 갱신.
- webhook 반응이 네트워크 상황에 따라 늦을 수 있으므로 급하면 대시보드의 재생(▷) 버튼으로 수동 빌드해도 된다(다만 실습의 목적은 push 한 번으로 전부 자동화되는 것을 확인하는 것).
- 셀프 체크: VM에서 ngrok이 필요한 이유 / Jenkinsfile 3단계 역할 / 두 Job의 자동 연결 설정 / 컨테이너 내부 경로를 써야 하는 이유 / 백엔드·DB를 다시 빌드하지 않는 이유 / 실패 시 확인 위치.

---

## Step 13. [프로젝트] AWS 기반 3-Tier CI/CD (CodeCommit + SNS + SQS + Jenkins + ECR)

### 목적
GitHub/Docker Hub 대신 AWS 서비스(Cloud9, CodeCommit, SNS, SQS, ECR)만으로 "git push -> Jenkins 자동 빌드 -> ECR push" 흐름을 구성한다.

### 이론 설명
- **목적/배경(강사)**: 목표와 골격은 Clip2(VM 기반)와 같다(코드가 바뀌면 자동 빌드/배포). 다만 앞 챕터에서 이미 AWS ECS로 컨테이너 서비스를 만들어 봤기에 그 환경을 반복하면 새로 배울 게 적어, 대형 프로젝트에서 자주 쓰는 다른 방식을 보이려 일부러 ECS가 아닌 Cloud9/CodeCommit/SNS/SQS/ECR 조합으로 구성했다(같은 목표를 ECS 환경에서 직접 구현해 보는 것도 좋은 복습). 제목 표기가 자료마다 다르다(타이틀 카드 "3-Tier", 챕터 소개 "ECS 기반 2-tier"). 실제로 mydiary-front(3000)/mydiary-back(8080)/mysql 세 컨테이너를 다시 배포하므로 3-Tier로 보는 편이 정확.
- **구성**: Cloud9(개발 IDE+EC2) / ECR(이미지 저장소) / CodeCommit(프라이빗 Git, GitHub와 비슷한 완전관리형 소스 제어 서비스) / SNS(알림) / SQS(큐).
- **흐름**: git push -> CodeCommit -> Trigger로 SNS 토픽 호출 -> 이벤트가 SQS 큐에 저장 -> Jenkins가 SQS Queue를 주기적으로 감지하다 새 메시지가 오면 파이프라인 자동 실행(Build -> Tag -> Push) -> ECR. (슬라이드 다이어그램은 Build->Test->Deploy로 Frontend/Backend/Database 컨테이너 재배포를 표현.)
- SNS는 소셜 네트워크가 아니라 **Simple Notification Service**(단순 통지/알림, 서버리스 환경의 메시지 큐 전달/구독 구현에 자주 사용), SQS는 Simple **Queue** Service(대기열). Webhook/ngrok 불필요(Jenkins가 큐를 읽는 방식).
- **CodeCommit을 Jenkins 저장소로 쓰고 SNS->SQS를 거치는 장단점(슬라이드/강사)**: 장점 - 하나의 SNS & SQS 구성으로 여러 Repository 이벤트를 한 번에 처리/관리(SQS가 병렬 처리 구조이고 큐 기반이라 변경이 잦은 운영 환경에서 빠르고 안정적). 단점 - AWS 클라우드 전용 서비스라 다른 클라우드/온프레미스에는 그대로 적용하기 어렵다. 대안으로 SNS/SQS 없이 Jenkins의 AWS CodeCommit 전용 플러그인을 설치해 Credential만 맺어 직접 연결하는 방법도 있다(이번 실습은 SNS->SQS 구조 구현을 선택).
- Cloud9 환경(EC2 기반)을 Clip1~2에서 이어서 사용(새 서버 없음). 강사는 Cloud9을 협업 개발도구로 실무에서도 권장.
- **포트가 안 열릴 때는 항상 보안 그룹 인바운드 규칙부터 확인**(앱 설정이 아니라). 클라우드는 방화벽/보안 그룹이 기본적으로 엄격해 인바운드는 반드시 규칙을 추가해야 한다. Cloud9 EC2 인스턴스 [보안] 탭의 보안 그룹에서 Jenkins(18080)와 mydiary(3000) 포트 인바운드 규칙(사용자 지정 TCP, 소스 0.0.0.0/0 = 어디서나 접속 허용)을 추가해야 `http://<Public IP>:18080`/`:3000` 접속이 된다. 자료에서도 처음 18080 접속 시 보안 그룹 미개방으로 실패하는 장면을 보여 준다. 보안상 0.0.0.0/0는 실습용 설정.
- Jenkins 컨테이너는 Cloud9에서 Dockerfile + docker-compose.yaml로 실행. 공식 이미지(jenkins/jenkins:lts)만으로는 컨테이너 안에서 docker 명령을 쓸 수 없으므로 apt로 docker-ce(Docker CLI)를 추가 설치한 커스텀 이미지를 만든다. Clip1에서 Jenkins+DinD 설정에 78분 정도 걸리던 수작업을 Dockerfile 하나로 압축한 것이며 `docker compose up -d` 한 번으로 이미지(`jenkins_image-jenkins`)가 자동 빌드되어 Jenkins가 올라온다. docker.sock 마운트로 컨테이너 내 docker 명령은 호스트(Cloud9 EC2)의 Docker 데몬을 쓴다. 이 클립에서 Jenkins는 새로 설치하는 것이 아니라 기존 Jenkins에 AWS 연동 파이프라인(`mydiary-pipeline`)만 추가한다(기존 Job과 계정 유지).
- 자료 내 불일치 주의: 아래 compose는 `8080:8080`으로 매핑돼 있으나 접속은 보안 그룹을 연 18080 포트로 하는 것으로 설명된다(포트 매핑과 접속 포트의 불일치 원인은 자료에 없음). 본인 환경에서 실제 매핑된 포트를 `docker compose ps`로 확인할 것.
- IAM 사용자 `fcuser` 생성: 루트 계정은 최고 관리자 권한이라 일상 작업에는 극히 제한적으로만 써야 하고(서버에서 root를 안 쓰는 것과 같음, 루트로는 이런 연동 작업이 원활하지 않음) 필요한 권한만 부여한 IAM 사용자를 쓴다. 1단계 사용자 이름 `fcuser`(콘솔 액세스 권한 + 콘솔 암호), 2단계 "직접 정책 연결"로 `AWSCodeCommitPowerUser`, 3~4단계 검토/생성 후 콘솔 로그인 URL/사용자 이름/암호 .csv 다운로드.
- **받게 되는 파일 3개(강사)**: ① 사용자 생성 직후의 콘솔 로그인용 암호 파일, ② 보안 자격 증명 화면 "AWS CodeCommit에 대한 HTTPS Git 자격 증명 생성"으로 받는 사용자명/암호 파일(`fcuser_codecommit_credentials`; 사용자명 `fcuser-at-594682333406`; git clone/push 및 Jenkins CodeCommit Credential용), ③ "액세스 키 생성"으로 받는 Access Key/Secret Key 파일(Jenkins가 SQS 폴링/ECR 로그인 등 AWS API 호출에 쓰는 자격). 이 세 용도를 구분해 두면 Jenkins Credential 등록 시 헷갈리지 않는다. IAM 화면에는 SSH 퍼블릭 키와 HTTPS Git 자격 증명 두 방식이 모두 제공되는데 SSH 키 페어를 만들 필요가 없는 HTTPS 방식을 사용.
- Jenkins 플러그인 설치(Available plugins): AWS CodeCommit(Trigger), AWS SQS trigger, Pipeline: AWS Steps, Amazon ECR, Docker Pipeline, AWS Global Configuration. 설치/재시작 후 반드시 "Installed plugins" 목록에서 정상 설치를 확인(설치 중 누락돼 동작하지 않는 경우가 종종 있음).
- SNS 토픽 `mydiary-topic`(유형 표준 Standard), SQS 큐 `mydiary-event-queue`(큐의 "SNS 구독" 탭에서 mydiary-topic을 구독 대상으로 지정 -> 구독 생성). CodeCommit 저장소 `mydiary-repo`(개발자 도구 > CodeCommit > 리포지토리 생성)의 Trigger가 SNS를 호출. (Trigger 생성 화면 자체의 설정값은 이 PDF 본문에 없음 - 자료에 없음)
- Jenkins Credential(강사 정리 총 3종): ① `AWS-CODECOMMIT` (Username with password, Username `fcuser-at-594682333406`, Password는 HTTPS Git 자격 증명 파일의 암호, Scope Global, Description `AWS-CODECOMMIT-CREDENTIALS`), ② SQS Trigger 테스트용 AWS Credentials (`AWS-ACCESS-CREDENTIALS`, IAM Access Key/Secret; 화면에 표시된 AKIA... 값은 마스킹), ③ Docker Hub 계정용 Credential(이전 챕터부터 사용). Jenkinsfile의 ECR 로그인 단계는 같은 Access Key를 `awsaccess` / `awssecret` Credential ID로 주입해 사용(이 둘의 생성 화면은 자료에 없음). 각 Credential ID를 Jenkinsfile/Job 설정과 정확히 일치시켜야 파이프라인이 동작한다.
- Jenkins Job `mydiary-pipeline` (Pipeline): General > GitHub project 체크, Project url `https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/mydiary-repo`; Build Triggers > `AWS SQS Trigger`, Queue URL `https://sqs.ap-northeast-2.amazonaws.com/594682333406/mydiary-event-queue`, AWS Credentials 선택 후 Test -> Success.

### 사용한 CLI
Jenkins 이미지 Dockerfile (`~/fastcampus/jenkins/jenkins_image/Dockerfile`, Jenkins 컨테이너 내부에 Docker CLI 설치):
```dockerfile
FROM jenkins/jenkins:lts
USER root
RUN apt-get update && \
    apt-get -y install apt-transport-https \
       ca-certificates \
       curl \
       gnupg2 \
       zip \
       unzip \
       software-properties-common && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add - && \
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable" && \
    apt-get update && \
    apt-get -y install docker-ce
```
docker-compose.yaml:
```yaml
version: '3.3'
services:
  jenkins:
    build:
      context: .
    container_name: jenkins
    user: root
    restart: always
    ports:
      - 8080:8080
      - 50000:50000
    volumes:
      - /home/ec2-user/jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
```
Jenkins 기동 및 My Diary(이전 프로젝트 소스) 가동 확인:
```bash
# Cloud9 환경 재점검: 이전 실습 컨테이너(jenkins, mydiary-front/back, mysql)가 계속 실행 중인지 확인
ec2-user:~ $ docker ps

ec2-user:~/fastcampus/jenkins/jenkins_image (main) $ ls
# docker-compose.yaml  Dockerfile
ec2-user:~/fastcampus/jenkins/jenkins_image (main) $ vi Dockerfile
ec2-user:~/fastcampus/jenkins/jenkins_image (main) $ vi docker-compose.yaml
$ docker compose up -d
$ docker compose ps

# 기존 프로젝트 소스로 3-Tier(프론트/백/DB) 기동 (3000 포트)
jenkins_home/jenkins-mydiary-msa (master) $ ls
# app.js docker-compose.yaml Dockerfile fastcampus.png Jenkinsfile package.json package-lock.json public
jenkins_home/jenkins-mydiary-msa (master) $ docker compose up -d
jenkins_home/jenkins-mydiary-msa (master) $ docker compose ps
# rolling-db (mysql:5.7-debian, 13306->3306)
# rolling-front (leecloudo/mydiary-front:2.0, 3000->3000)
# rolling-server (leecloudo/mydiary-back:1.0, 8080->8080)
```
- `docker compose up -d`: docker-compose.yaml 기준으로 백그라운드 기동(Jenkins는 이미지 빌드 포함)
- `docker compose ps`: compose 서비스 상태 확인
- 접속: Jenkins `http://<Cloud9 EC2 Public IP>:18080` (자료의 포트 매핑과 보안 그룹 설정에 따름), 앱 `http://<Public IP>:3000`

CodeCommit 저장소 clone (IAM HTTPS Git 자격 증명 사용):
```bash
fcuser:~/jenkins_home/jenkins-mydiary-msa (master) $ git clone https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/mydiary-repo
# Cloning into 'mydiary-repo'...
# Username for 'https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/mydiary-repo': (fcuser-at-594682333406)
# Password for '...': (.csv의 비밀번호)
```
Jenkinsfile (Declarative, Build -> Tag -> Push) - `vi Jenkinsfile`로 생성:
```groovy
pipeline {
   agent any
   stages {
      stage('Build') {
         steps {
            sh 'docker build -t mydiary-repo .'
         }
      }
      stage('Tag') {
         steps {
            sh 'docker tag mydiary-repo:latest 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/mydiary-repo:1.0'
         }
      }
      stage('Push') {
         environment {
            AWS_ACCESS_KEY_ID = credentials('awsaccess')
            AWS_SECRET_ACCESS_KEY = credentials('awssecret')
         }
         steps {
            sh 'aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com'
            sh 'docker push 594682333406.dkr.ecr.ap-northeast-2.amazonaws.com/mydiary-repo:1.0'
         }
      }
   }
}
```
코드 수정 후 push로 CI/CD 트리거:
```bash
jenkins-mydiary-msa/mydiary-repo (master) $ vi public/index.ejs
#  <h2>Docker class diary -AWS-</h2>      # 문구 수정
fcuser:~/jenkins_home/jenkins-mydiary-msa/mydiary-repo (master) $ git add .
fcuser:~/jenkins_home/jenkins-mydiary-msa/mydiary-repo (master) $ git commit -m "mydiary cc commit"
fcuser:~/jenkins_home/jenkins-mydiary-msa/mydiary-repo (master) $ git push
# Username / Password 입력 (CodeCommit HTTPS 자격 증명)
```
요약 CLI (자료 정리표):
```bash
docker build -t <이름> .
docker tag <이름>:latest <ECR>/<repo>:1.0
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <ECR>
docker push <ECR>/<repo>:1.0
docker compose up -d
docker compose ps
git clone https://git-codecommit.<region>.amazonaws.com/v1/repos/<repo>
git add . / git commit -m "..." / git push
```

### 확인 방법/주의점
- git push 후 CodeCommit -> SNS -> SQS -> Jenkins SQS Trigger로 빌드가 자동 시작된다 (Poll SCM/Webhook 아님). Stage View에서 Declarative: Checkout SCM -> Build -> Tag -> Push 4단계가 성공하는지 확인.
- 확인: ECR 콘솔의 `mydiary-repo:1.0` 이미지, 앱 화면 문구 변경("Docker class diary -AWS-").
- Jenkins Job 설정(화면): General에서 GitHub project 체크 후 Project url에 CodeCommit 저장소 URL 입력, Build Triggers에서 AWS SQS Trigger 체크 + Queue URL + AWS Credentials 선택 후 Test -> Success. 이 AWS API Access Key(SQS 폴링용)는 git clone/push용 CodeCommit HTTPS 자격 증명과 별개다.
- Stage View 예시: Declarative: Checkout SCM(3s) -> Build(16s) -> Tag(약 0.5s) -> Push(4s) 모두 성공. 강사는 push 후 Jenkins 대시보드를 모니터링해 이미지가 ECR에 저장되고 SQS가 실제로 사용된 것을 확인한 뒤, CodeCommit 저장소의 방금 커밋 내용(제목 -kevin- -> -AWS-)과 비교해 전 과정을 재확인했다. 화면 비교: Clip2 결과 "Docker class diary -kevin-"(192.168.56.101:3000) vs 이번 결과 "-AWS-"(EC2 Public IP:3000). 앞서 보안 그룹에 3000 포트를 열고 `docker compose up -d`로 띄운 Clip2 결과물이 before 화면.
- 전 클립(Clip1~2)에서는 Job을 직접 실행하거나 변경 감지 방식에 의존했다면 이번 핵심은 push 즉시 SNS/SQS를 거쳐 거의 즉시 Jenkins가 반응한다는 점("push 한 번이 곧 배포" 경험). 강사의 마무리: 진행 속도가 학습자와 다를 수 있으니 영상을 멈춰 가며 따라 하고, 이후 CI/CD를 더 깊이 공부하고 쿠버네티스 같은 상위 오케스트레이션 도구를 함께 익히길 권장.
- 셀프 체크: 5개 AWS 서비스 역할 / CodeCommit->SNS->SQS 경로 / CodeCommit 사용 장단점 / CodeCommit 자격 증명 vs Access Key 용도 / Build·Tag·Push 명령 / 접속 불가 시 첫 확인(보안 그룹).
- 주의: 이 자료의 Pipeline은 ECR에 push까지만 수행하며 컨테이너 재배포(compose up)는 포함하지 않는다(다만 슬라이드 다이어그램은 Build->Test->Deploy 후 재배포를 표현. 자료 내 불일치).
- 주의: IAM 사용자 `fcuser`로 작업 (root 사용 금지 취지). CodeCommit HTTPS Git 자격 증명(git clone/push용)과 IAM Access Key(Jenkins의 AWS API 호출용)는 서로 다른 자격 증명이다.
- 주의: Access Key/Secret, .csv 자격 증명은 외부에 노출하지 말고 Jenkins Credentials에만 저장한다.
