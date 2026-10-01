# 부록 D. 실습 랩 인덱스

본문 41개 장에 흩어진 🧪 표시 절을 **하나의 랩 목록**으로 모은 것입니다. 총 **75개**이며, 목차(`00_TOC.md`)의 🧪 절과 1:1로 대응합니다. 랩 번호(`LAB-01` ~ `LAB-75`)는 본문 등장 순서대로 매긴 연번입니다.

이 부록이 답하는 질문은 네 가지입니다.

- **무엇부터 해야 하는가** — D.1 학습 경로별 추천 순서
- **이 랩을 하려면 무엇이 먼저 되어 있어야 하는가** — 각 표의 「선행 랩」 열, D.2 의존성 그래프
- **돈이 새는가** — 각 표의 「비용 성격」 열, D.4 🔴 "주의" 등급 경고표
- **끝났는가** — D.5 통합 정리 스크립트, D.6 사후 점검

> ⚠️ **이 부록에는 금액이 적혀 있지 않습니다.** 단가와 프리 티어 조건은 리전과 시점에 따라 달라지고, 책에 적힌 숫자는 반드시 낡습니다. 대신 **"무엇에 비례해 과금되는가"** 만 적었습니다. 실제 금액은 실습 직전에 AWS 요금 페이지와 계정의 예산 알림(0.3)으로 확인하십시오.

> 🔴 **모든 랩의 전제는 LAB-01(0.3 실습 환경 구성)입니다.** 실습 전용 계정, `awssec-lab` 프로파일, 예산 알림, `Project=awssec-lab` / `Chapter=chNN` / `AutoDelete=true` 태그 규약이 여기서 확정됩니다. LAB-01을 건너뛴 상태에서 다른 랩을 시작하면 **D.5의 정리 스크립트가 당신의 리소스를 찾지 못합니다.**

---

## D.0 이 인덱스 읽는 법

### 열의 뜻

| 열 | 뜻 |
|---|---|
| **랩 번호** | `LAB-NN`. 본문 등장 순서 연번. 이 부록 안에서만 쓰는 식별자입니다 |
| **절** | 본문 절 번호. 정본은 `00_TOC.md` 입니다 |
| **랩 제목** | 목차의 절 제목 |
| **무엇을 만드나** | 이 랩이 끝났을 때 계정에 실제로 생기는 것 |
| **예상 소요** | 15분 / 30분 / 1시간 / 2시간+ 4단계. **CLI를 복사해 넣는 시간이 아니라 결과를 이해하고 검증까지 하는 시간**입니다 |
| **비용 성격** | 아래 4등급 |
| **선행 랩** | 이 랩을 시작하기 전에 **끝나 있어야 하는** 랩. `—` 는 LAB-01 외에 선행이 없다는 뜻입니다 |
| **정리 필요** | 예/아니오. "예"면 남았을 때 계속 과금되거나 위험을 남기는 리소스 이름을 함께 적었습니다 |

### 비용 4등급

| 등급 | 뜻 | 판단 기준 |
|---|---|---|
| **무료** | 프리 티어 범위이거나, 리소스 자체에 과금 항목이 없음 | IAM·정책·태그·설정 변경·조회 API |
| **소액** | 시간당 과금 리소스지만 **한 자리에서 끝내고 즉시 지우면** 무시할 수준 | 소형 EC2 인스턴스, EBS 볼륨, 스냅샷 |
| 🔴 **주의** | **시간당 단가가 크고 프리 티어가 없음.** 지우는 것을 잊으면 다음 달 청구서에 그대로 나타남 | NAT 게이트웨이, 인터페이스 VPC 엔드포인트, CloudHSM, 로드 밸런서, Shield Advanced |
| **이벤트 과금** | 요청 수·분석 데이터량·결과 건수에 비례 | GuardDuty, Macie, Inspector, Security Hub, WAF, CloudTrail 데이터 이벤트, Athena, Config |

**이벤트 과금이 "안전하다"는 뜻이 아닙니다.** 시간당 과금은 리소스를 지우면 멈추지만, 이벤트 과금은 **켜 둔 채로 다른 실습을 하면 그 실습의 활동량만큼 계속 쌓입니다.** 예를 들어 GuardDuty를 켜 놓고 VPC 플로우 로그 랩을 돌리면 분석 대상 로그가 늘어납니다. 탐지 서비스 랩(LAB-61~LAB-65)은 **의도적으로 마지막에 배치**했고, 계속 켜 둘 것인지 끌 것인지 각 랩 끝에서 결정하도록 했습니다.

---

## D.1 사용법 — 학습 경로별 추천 랩 순서

0.2의 4개 트랙과 정합합니다. **어느 트랙이든 LAB-01이 0번입니다.**

### 트랙 A — 입문자 (0.2 필독 장: 1→2→3→5→6→7→8→15→18→19→22→23)

| 순서 | 랩 | 절 | 왜 이 순서인가 |
|---|---|---|---|
| 0 | LAB-01 | 0.3 | 계정·프로파일·예산·태그. 없으면 정리가 불가능 |
| 1 | LAB-03 | 5.4 | **돈이 새는 것부터 막는다.** 실습 계정의 첫 안전장치 |
| 2 | LAB-04 | 6.6 | IAM 그룹·MFA 강제. 클라우드에서 경계는 IAM이다 |
| 3 | LAB-05 | 7.8 | 정책을 직접 써 보고 경계를 눈으로 확인 |
| 4 | LAB-02 | 3.2 | 지금까지 만든 것을 위협 모델로 되돌아보기 |
| 5 | LAB-21~28 | 15.3~15.10 | **사고가 가장 많이 나는 곳(S3)** 을 통째로 |
| 6 | LAB-30~33 | 18.3~18.6 | VPC → 서브넷 → 라우팅 → NAT |
| 7 | LAB-34~35 | 19.2·19.4 | 보안 그룹 설계, NACL |
| 8 | LAB-38~42 | 22.1~22.5 | EC2 배치·키·역할·User Data·AMI |
| 9 | LAB-43~47 | 23.1~23.8 | TLS → ACM → 대상 그룹 → CloudFront → WAF |

입문자는 **LAB-17~19(CloudHSM·BYOK)를 건너뛰십시오.** 비용 등급이 가장 높고, 13장(KMS)을 충분히 이해하기 전에는 얻는 것이 적습니다.

### 트랙 B — 아키텍트 (0.2 필독 장: 1→2→3→4→18~24→36→37→40)

| 순서 | 랩 | 절 | 초점 |
|---|---|---|---|
| 0 | LAB-01 · LAB-03 | 0.3 · 5.4 | 환경과 예산 |
| 1 | LAB-02 | 3.2 | 신뢰 경계를 먼저 그린다 |
| 2 | LAB-30~33 | 18.3~18.6 | **4부의 사슬을 끊지 말 것** (D.2 참조) |
| 3 | LAB-34~35 | 19.2·19.4 | SG 참조 체인 |
| 4 | LAB-36 | 20.1 | 게이트웨이 엔드포인트 — 여기서 인터넷 경로가 사라진다 |
| 5 | LAB-37 | 21.6 | Session Manager. **배스천을 없애는 랩** |
| 6 | LAB-38~42 | 22.1~22.5 | 컴퓨트 배치 |
| 7 | LAB-43~47 | 23.1~23.8 | 웹 계층 |
| 8 | LAB-68~71 | 36.2~36.8 | Organizations·OU·역할 전환·RAM |
| 9 | LAB-72~73 | 37.5·37.7 | Control Tower·적합성 팩 |

아키텍트 트랙은 **LAB-37(Session Manager)을 LAB-38(EC2 시작)보다 먼저** 두었습니다. 인스턴스를 만들기 전에 접근 경로를 정해야 키 페어를 만들 이유가 사라집니다.

### 트랙 C — 보안 담당자 (0.2 필독 장: 1→3→25~27→29~35→37~39)

| 순서 | 랩 | 절 | 초점 |
|---|---|---|---|
| 0 | LAB-01 · LAB-03 | 0.3 · 5.4 | 환경과 예산 |
| 1 | LAB-51~55 | 29.2~29.8 | **로그가 먼저다.** 없으면 이후 전부 실행 불가 |
| 2 | LAB-56~60 | 30.1~30.6 | SNS → 알람 → 대시보드 → EventBridge → Athena |
| 3 | LAB-61~65 | 31.1~31.6 | GuardDuty → 멀티 계정 → Macie → Security Hub |
| 4 | LAB-48~49 | 26.3·26.7 | Inspector·Trusted Advisor |
| 5 | LAB-11 | 12.4 | Macie로 데이터 자산 발견 |
| 6 | LAB-66~67 | 35.2·35.3 | 자동 대응 (SOAR) |
| 7 | LAB-73 · LAB-74 | 37.7 · 38.1 | 적합성 팩·Artifact |
| 8 | LAB-75 | 39.5 | Well-Architected 리뷰로 마무리 |

보안 담당자 트랙은 **탐지 서비스를 끄지 않고 이어서 씁니다.** 대신 실습 계정에 워크로드가 거의 없으므로 이벤트 과금이 크지 않습니다. 4부 랩(VPC·EC2)을 먼저 돌린 상태라면 **LAB-32(NAT 게이트웨이)를 지운 뒤** 탐지 랩으로 넘어가십시오.

### 트랙 D — 자격증 준비 (SCS-C02)

**75개 전부를 순서대로 합니다.** 다만 아래 두 가지를 지키면 총비용이 크게 줄어듭니다.

| 원칙 | 구체적으로 |
|---|---|
| **묶음으로 하루에 끝낸다** | 같은 장의 랩은 한 자리에서 끝내고 그날 정리합니다. 특히 **13장(LAB-12~16)** 과 **14장(LAB-17~19)**, **18~23장(LAB-30~47)** |
| **주의 등급은 마지막에 켜고 즉시 끈다** | D.4의 경고표에 있는 랩은 **그날의 마지막 순서**로 미루고, 끝나는 즉시 D.5 스크립트를 돌립니다 |

시험 대비 관점에서 **반드시 손으로 해 봐야 하는 랩 12개**를 꼽으면 다음과 같습니다. 정책 평가·키 정책·S3 4중 구조는 문제로 가장 많이 나오는 영역입니다.

LAB-05(7.8 정책) · LAB-12(13.5 KMS) · LAB-15(13.8 조건 키) · LAB-16(13.10 크로스 계정 키) · LAB-22(15.4 버킷 정책) · LAB-23(15.5 크로스 계정 S3) · LAB-30(18.3 서브넷) · LAB-34(19.2 SG) · LAB-36(20.1 엔드포인트) · LAB-51(29.2 CloudTrail) · LAB-61(31.1 GuardDuty) · LAB-64(31.5 Security Hub)

---

## D.2 랩 의존성 그래프

### 전체 구조

```
                        LAB-01 (0.3) 실습 환경
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   LAB-03 (5.4)          LAB-04 (6.6)          LAB-51 (29.2)
   예산 알림              IAM 초기 구성          CloudTrail
        │                     │                     │
        │              ┌──────┴──────┐              │
        │         LAB-05 (7.8)  LAB-06 (8.5)        │
        │         정책 작성      크로스 계정 역할     │
        │                              │            │
        │                        [2계정 필요]        │
        │                                           │
        └──────────► 4부 사슬 (아래) ◄───────────────┘
```

### 🔴 4부(18~24장) 사슬 — 순서를 바꿀 수 없는 구간

이 부록에서 **가장 중요한 그림**입니다. 4부 랩은 앞 랩의 출력(VPC ID, 서브넷 ID, 보안 그룹 ID)을 다음 랩의 입력으로 씁니다. 중간을 건너뛰면 명령이 실행되지 않습니다.

```
LAB-30 (18.3) VPC + 6개 서브넷
   │  출력: VPC_ID, SUBNET_PUB_2A/2C, SUBNET_APP_2A/2C, SUBNET_DATA_2A/2C
   │
   ├─► LAB-31 (18.4) IGW + 퍼블릭 라우팅 테이블
   │      │  출력: IGW_ID, RTB_PUBLIC
   │      │
   │      ├─► LAB-32 (18.5) 🔴 NAT 게이트웨이 (AZ별 2개)
   │      │      │  출력: NATGW_2A/2C, RTB_APP_2A/2C
   │      │      │  ⚠️ 여기서부터 시간당 과금이 시작된다
   │      │      │
   │      │      └─► LAB-33 (18.6) NAT 인스턴스 (레거시, 선택)
   │      │             └── LAB-38 선행 (인스턴스가 필요)
   │      │
   │      └─► LAB-36 (20.1) S3 게이트웨이 엔드포인트
   │             └── RTB_APP_2A/2C 에 접두사 목록 경로 자동 추가
   │
   ├─► LAB-34 (19.2) 보안 그룹 참조 체인
   │      │  출력: SG_ALB → SG_APP → SG_DATA (SG를 CIDR 대신 참조)
   │      │
   │      ├─► LAB-35 (19.4) NACL (서브넷 단위 보조 통제)
   │      │
   │      └─► LAB-37 (21.6) 🔴 Session Manager
   │             │  인터페이스 엔드포인트 3종(ssm·ssmmessages·ec2messages) × 2 AZ
   │             │  ⚠️ 인터페이스 엔드포인트는 ENI 단위 시간당 과금
   │             │
   │             └─► LAB-38 (22.1) EC2 인스턴스 시작 (private-app 서브넷)
   │                    │  출력: INSTANCE_ID, 시작 템플릿
   │                    │
   │                    ├─► LAB-39 (22.2) 키 페어 (임포트 방식)
   │                    ├─► LAB-40 (22.3) IAM 역할 부착
   │                    ├─► LAB-41 (22.4) User Data
   │                    ├─► LAB-42 (22.5) 골든 AMI 파이프라인
   │                    │
   │                    └─► LAB-43 (23.1) EC2에 HTTPS 활성화 (8443)
   │                           │
   │                           ├─► LAB-44 (23.2) ACM 인증서
   │                           │      │
   │                           │      └─► LAB-46 (23.7) CloudFront + S3 (OAC)
   │                           │             │  ⚠️ CloudFront용 ACM은 us-east-1
   │                           │             │
   │                           │             └─► LAB-47 (23.8) WAF Web ACL
   │                           │                    (CLOUDFRONT scope + REGIONAL scope 2개)
   │                           │
   │                           └─► LAB-45 (23.4) 🔴 대상 그룹 + ALB 연결
   │                                  ⚠️ 대상 그룹 자체는 무료지만,
   │                                     트래픽을 흘리려면 ALB가 필요하고
   │                                     ALB는 시간당 + LCU 과금 (23.3·23.5·23.6)
   │
   └─► [정리 시 역순] LAB-45 → LAB-38 → LAB-37 → LAB-32 → LAB-36 → LAB-34/35 → LAB-31 → LAB-30
```

### 사슬이 끊기는 대표적 지점 3개

| 증상 | 원인 | 해결 |
|---|---|---|
| `InvalidSubnetID.NotFound` | LAB-30을 다른 셸 세션에서 돌려 `SUBNET_*` 변수가 사라짐 | 각 랩 시작 시 `aws ec2 describe-subnets --filters Name=tag:Project,Values=awssec-lab` 로 ID를 다시 조회해 변수에 넣습니다 |
| 프라이빗 인스턴스에서 `yum`/`apt` 가 멈춤 | LAB-32(NAT)를 건너뛰고 LAB-38을 시작 | NAT를 만들거나, 애초에 아웃바운드가 필요 없는 AMI를 씁니다(LAB-42) |
| Session Manager 세션이 열리지 않음 | LAB-37의 엔드포인트 3종 중 하나 누락, 또는 LAB-40(역할 부착) 미완 | `aws ssm describe-instance-information` 이 빈 배열이면 **역할**, 타임아웃이면 **엔드포인트**를 의심합니다 |

### ⚠️ 본문 순서를 그대로 따르면 막히는 랩 8개

**책의 장 순서와 랩의 선행 관계가 항상 같지는 않습니다.** 아래 8개 랩은 **뒤 장의 랩**을 선행으로 요구합니다. 본문을 순서대로 읽는 것은 맞지만, **실습은 아래 표의 대안 중 하나를 골라야 합니다.**

| 랩 | 절 | 요구하는 뒤 랩 | 왜 | 대안 — 순서대로 가고 싶다면 |
|---|---|---|---|---|
| LAB-09 | 11.2 | LAB-12 (13.5) | SecureString을 **고객 관리형 KMS 키**로 암호화 | 우선 `alias/aws/ssm`(AWS 관리형 키)으로 실습하고, LAB-12 뒤에 CMK로 바꿔 다시 넣습니다 |
| LAB-10 | 11.3 | LAB-12 (13.5) | 시크릿 암호화 키 | 위와 동일 (`alias/aws/secretsmanager`) |
| LAB-11 | 12.4 | LAB-21·22 (15.4·15.5) | 검사할 **S3 버킷과 객체**가 있어야 함 | 임시 버킷에 더미 파일 몇 개를 올려 먼저 돌리고, 15장 뒤에 `shopmini-uploads` 로 다시 돌립니다 |
| 🔴 LAB-17 | 14.2 | LAB-30 (18.3) | 클러스터를 **Private-App 서브넷 2개**에 만듦 (본문 14.2가 원서의 기본 VPC 대신 CANON VPC를 쓰기로 정함) | **3부를 마친 뒤 4부의 LAB-30·31을 먼저 하고 돌아오는 것을 권합니다.** 기본 VPC로 하면 원서 구성이 되어 14.2의 논지가 사라집니다 |
| 🔴 LAB-18 | 14.3 | LAB-17, LAB-37 (21.6) | 클라이언트 EC2에 **키 페어 없이 Session Manager로** 접속 | 임시로 퍼블릭 서브넷 + 키 페어로 접속할 수는 있으나, 그러면 21.5의 원칙을 스스로 깨는 셈입니다. LAB-37을 먼저 하십시오 |
| LAB-33 | 18.6 | LAB-38 (22.1) | NAT **인스턴스**를 띄워야 함 | 22.1의 시작 절차만 먼저 참조합니다. 레거시 인수인계 상황이 아니면 **건너뛰어도 되는 랩**입니다 |
| LAB-37 | 21.6 | LAB-38 (22.1) — **검증 단계만** | 역할·엔드포인트·로깅 구성은 인스턴스 없이 됩니다. `describe-instance-information` 과 `start-session` 만 인스턴스가 필요 | **구성까지 먼저 하고, 검증은 LAB-38 직후에 합니다.** 이것이 D.2 사슬이 37 → 38 순서인 이유입니다 |
| LAB-62 | 31.2 | LAB-68 (36.2) | 위임 관리자는 **조직이 있어야** 지정 가능 | 단일 계정이라면 31.1(LAB-61)까지만 하고, 36장에서 조직을 만든 뒤 돌아옵니다 |

**이 8개를 제외하면 랩 번호 순서가 곧 유효한 실행 순서입니다.** 선행 관계에 순환은 없습니다 — LAB-37과 LAB-38은 서로를 요구하는 것처럼 보이지만, LAB-37의 **구성**이 LAB-38보다 앞이고 LAB-37의 **검증**만 뒤이므로 순환이 아닙니다.

### 2개 계정이 필요한 랩

아래 랩은 **계정 하나로는 완결되지 않습니다.** 실습 전용 계정 두 개(또는 Organizations 아래 Sandbox 계정 두 개)를 준비하십시오.

| 랩 | 절 | 필요한 두 번째 계정의 역할 |
|---|---|---|
| LAB-06 | 8.5 | 역할을 위임받는 쪽 |
| LAB-16 | 13.10 | KMS 키를 빌려 쓰는 쪽 |
| LAB-23 | 15.5 | 객체를 업로드하는 쪽 |
| LAB-28 | 15.10 | 복제 대상 버킷 소유 계정 |
| LAB-52 | 29.4 | 로그 아카이브 계정 |
| LAB-62 | 31.2 | GuardDuty 멤버 계정 |
| LAB-68~71 | 36.2~36.8 | 조직 멤버 계정 |

---

## D.3 랩 전체 목록

### 0부. 오리엔테이션

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-01 | 0.3 | 실습 환경 구성 | 실습 전용 계정, CLI v2, `awssec-lab` 프로파일, 월 예산 + 알림 2종, 태그 규약 | 1시간 | 무료 | — | 아니오 (책을 끝낼 때까지 유지) |

---

### 1부. 원칙과 위협 모델

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-02 | 3.2 | 데이터 흐름도와 신뢰 경계 그리기 | ShopMini 데이터 흐름도(DF1~DF8), 신뢰 경계 TB1~TB6, IAM Access Analyzer 분석기로 그림과 실제 대조 | 1시간 | 무료 | — | **예** — Access Analyzer 분석기(`delete-analyzer`). 계정당 외부 접근 분석기 1개는 무료이나 남겨 두면 결과가 계속 쌓임 |
| LAB-03 | 5.4 | 🔴 결제 알람과 예산 설정 | CloudWatch 결제 알람(`us-east-1`), AWS Budgets 예산 + ACTUAL/FORECASTED 알림, Cost Anomaly Detection 모니터·구독 | 30분 | 무료 | — | 아니오 (**끝까지 유지할 것**) |

> 🔴 **LAB-03을 다른 랩보다 먼저 하십시오.** 이 책의 나머지 74개 랩은 전부 LAB-03이 지키고 있다는 전제에서 씌었습니다.

---

### 2부. 계정과 아이덴티티

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-04 | 6.6 | 실습: 신규 계정의 IAM 초기 구성 | 계정 별칭, 그룹(관리자/개발자/읽기전용), 암호 정책, MFA 강제 정책, 사용자 1명 | 1시간 | 무료 | — | **예** — 사용자·로그인 프로파일·액세스 키·그룹·고객 관리형 정책·계정 별칭 (본문 Step 7에 역순 삭제 절차 있음) |
| LAB-05 | 7.8 | 실습: 비주얼 에디터와 CLI로 정책 만들기 | 동일 정책을 콘솔과 CLI로 각각 생성, `validate-policy` 검증, 경계 확인(허용/거부 실측) | 30분 | 무료 | LAB-04 | **예** — 고객 관리형 정책 2개, 그룹 연결 해제 |
| LAB-06 | 8.5 | 크로스 계정 역할 전환 | 계정 B에 신뢰 정책 붙은 역할, 계정 A의 `sts:AssumeRole` 허용 정책, `assume-role` 실행 | 1시간 | 무료 | LAB-04, **2계정** | **예** — 역할·역할 정책·전환 허용 정책 |
| LAB-07 | 9.2 | 🔴 IAM Identity Center(구 AWS SSO) 도입 | Identity Center 인스턴스, 그룹, 권한 세트(+권한 경계), 계정 할당, `aws configure sso` 로그인 | 2시간+ | 무료 | LAB-04 | 아니오 — **오히려 이후 모든 랩에서 이 프로파일을 쓰는 것을 권장** |
| LAB-08 | 10.2 | 사용자 풀 생성과 앱 클라이언트 구성 | Cognito 사용자 풀(JSON 정의), MFA 구성, 앱 클라이언트(시크릿 유/무 2종) | 1시간 | 무료 (월간 활성 사용자 기준 프리 티어) | — | **예** — 사용자 풀, 앱 클라이언트. 남겨도 활성 사용자가 없으면 과금되지 않으나 자격 증명 저장소가 방치됨 |
| LAB-09 | 11.2 | Systems Manager Parameter Store | 계층 경로(`/shopmini/prod/...`) 파라미터, 고객 관리형 KMS 키로 SecureString, 경로 단위 IAM 정책 | 30분 | 무료 (Standard 티어) / 고급 티어는 소액 | LAB-12 (CMK를 쓸 경우) | **예** — 파라미터, **advanced 티어를 썼다면 반드시 삭제**(파라미터 수 × 시간 과금) |
| LAB-10 | 11.3 | AWS Secrets Manager | `rds/shopmini` 시크릿, 리소스 정책, 순환 설정, 리전 복제 | 1시간 | 소액 (시크릿 수 × 월 + API 호출) | LAB-12 | **예** — 시크릿(복구 기간 때문에 `--force-delete-without-recovery` 여부를 의식적으로 결정), **복제본은 먼저 제거해야 원본이 지워짐** |

---

### 3부. 데이터 보호

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-11 | 12.4 | Amazon Macie로 민감 데이터 자동 발견 | Macie 활성화, 자동 민감 데이터 검색, 사용자 지정 데이터 식별자, `shopmini-uploads` 분류 작업, 결과 내보내기 | 2시간+ | **이벤트 과금** (S3 객체 인벤토리 + 검사한 데이터량) | LAB-21~22 (버킷 필요) | **예** — 분류 작업 중지, 자동 검색 해제, **Macie 비활성화**. 켜 둔 채로 두면 버킷이 늘어날수록 계속 과금 |
| LAB-12 | 13.5 | KMS 키 생성과 별칭 | 고객 관리형 키 `alias/shopmini/app`, 키 정책, 봉투 암호화 직접 실행(`generate-data-key` → `decrypt`) | 30분 | 소액 (키 수 × 월 + 요청 수) | — | **예** — `schedule-key-deletion`(최소 대기 기간 존재). 별칭 먼저 삭제. **13.10까지 마친 뒤** 정리 |
| LAB-13 | 13.6 | 키 순환(Rotation) | 자동 순환 활성화, 순환 상태 조회, 온디맨드 순환, 수동 순환(새 키 + 별칭 이동 + `re-encrypt`) | 30분 | 소액 (순환 시 백업 키 자료가 추가 과금) | LAB-12 | **예** — 수동 순환에서 만든 **두 번째 키**를 잊기 쉬움 |
| LAB-14 | 13.7 | 그랜트(Grant)로 프로그래밍 방식 권한 부여 | 그랜트 생성, 그랜트 토큰으로 `decrypt`, `retire` / `revoke` 비교 | 30분 | 무료 (LAB-12 키 재사용) | LAB-12 | **예** — 그랜트(`revoke-grant`). 키를 지우면 함께 사라지나, 키를 남길 거라면 그랜트를 정리 |
| LAB-15 | 13.8 | 조건 키를 활용한 키 정책 | `kms:ViaService`·`kms:EncryptionContext:*`·`kms:CallerAccount` 등 실재 조건 키를 조합한 키 정책 | 30분 | 무료 | LAB-12 | **예** — 키 정책을 원복하거나 키와 함께 삭제 |
| LAB-16 | 13.10 | 크로스 계정 키 공유 | 계정 A 키 정책에 계정 B 프린시펄 허용, 계정 B의 IAM 정책, 3중 확인(키 정책·IAM·그랜트) | 1시간 | 무료 | LAB-12, **2계정** | **예** — 키 정책에서 외부 계정 제거 후 키 삭제 |
| LAB-17 | 14.2 | 🔴 CloudHSM 클러스터 생성 | CloudHSM 클러스터(서브넷 2개 지정), 상태 전이 관찰 | 1시간 | 🔴 **주의** — HSM 인스턴스 **시간당 과금, 프리 티어 없음** | LAB-30 (서브넷) | **예** — HSM → 클러스터 → 백업 순서. 백업을 지우지 않으면 백업 보관 과금이 남음 |
| LAB-18 | 14.3 | 🔴 클러스터 초기화와 활성화 | HSM 생성, CSR 서명(자체 CA), 신뢰 앵커, 클러스터 초기화, 클라이언트 EC2, CO/CU 사용자 생성 | 2시간+ | 🔴 **주의** — HSM 시간당 + 클라이언트 EC2 | LAB-17, LAB-37 | **예** — ⚠️ **순서를 틀리면 키가 영구 소실**(본문 14.3 마지막 절의 정리 절차를 그대로 따를 것): 클라이언트 EC2 종료 → `delete-hsm` → `delete-cluster` → `delete-backup` |
| LAB-19 | 14.5 | 외부 키 자료 가져오기(BYOK) | `EXTERNAL` 오리진 키, 래핑 키·임포트 토큰, OpenSSL로 키 자료 생성·암호화·임포트, 만료 이벤트 규칙 | 1시간 | 소액 (KMS 키 수 × 월) | LAB-12 | **예** — 임포트 키 삭제. ⚠️ 만료된 키는 **재임포트하지 않으면 복호화 불가** — 이 키로 암호화한 실습 데이터를 먼저 정리 |
| LAB-20 | 15.3 | ACL의 이해와 (사실상) 사용 중단 | 버킷 Object Ownership을 `BucketOwnerEnforced` 로 설정, 3가지 설정 비교 | 15분 | 무료 | — | 아니오 (버킷 정리는 LAB-28 이후 일괄) |
| LAB-21 | 15.4 | 버킷 정책 작성 | `shopmini-uploads` 버킷, 🔴 기본 4개 문장(HTTPS 강제·암호화 강제·계정 제한·불법 접근 거부) | 1시간 | 무료 (저장량 프리 티어) | LAB-20 | **예** — 실습 버킷·객체 |
| LAB-22 | 15.5 | 크로스 계정 접근 | 계정 B에서 업로드, 객체 소유권 문제 재현, Object Ownership으로 근본 해결 | 1시간 | 무료 | LAB-21, **2계정** | **예** — 버킷 정책에서 외부 계정 제거 |
| LAB-23 | 15.6 | 사전 서명 URL(Pre-signed URL) | `s3 presign` 으로 만료 시간 있는 URL 생성, 4가지 함정 실측 | 15분 | 무료 | LAB-21 | 아니오 (URL은 만료로 자연 소멸, 단 **발급에 쓴 자격 증명 수명**을 확인할 것) |
| LAB-24 | 15.7 | 🔴 S3 암호화 3가지 | 버킷 기본 암호화(SSE-KMS) + **S3 버킷 키** 활성화, SSE-S3/SSE-KMS/SSE-C 비교 | 30분 | 소액 (SSE-KMS 요청 과금 — 버킷 키로 크게 감소) | LAB-12, LAB-21 | 아니오 (설정. 버킷과 함께 정리) |
| LAB-25 | 15.8 | 🔴 버전 관리와 MFA Delete | 버전 관리 활성화, MFA Delete 설정(루트 자격 증명 필요), 버전 목록 확인 | 30분 | 무료 (저장량만) | LAB-21 | **예** — ⚠️ **버전 관리 버킷은 모든 버전과 삭제 마커를 지워야 버킷이 삭제됩니다.** MFA Delete를 켰다면 **먼저 끄십시오** |
| LAB-26 | 15.10 | 크로스 리전 복제(CRR) | 복제 역할, 복제 규칙, 크로스 계정 복제 구성, 🔴 보안 목적 복제의 4조건 | 1시간 | 소액 (복제 데이터 전송 + 대상 리전 저장) | LAB-25, **2계정** | **예** — 복제 규칙 제거 → **대상 리전 버킷**(다른 리전이라 정리 스크립트가 놓치기 쉬움) |
| LAB-27 | 16.1 | 🔴 EBS 암호화 | 리전 단위 기본 암호화 활성화, 기본 KMS 키 지정, 미암호화 볼륨 → 스냅샷 → 암호화 복사 → 새 볼륨 전환 | 1시간 | 소액 (볼륨·스냅샷 저장량) | LAB-12 | **예** — 스냅샷 2개(원본·암호화 사본), 볼륨. **리전 기본 암호화 설정 자체는 켠 채로 두는 것을 권장** |
| LAB-28 | 16.5 | Glacier와 Vault Lock | S3 Glacier 볼트, Vault Lock 정책 시작(`initiate`) → 검증 → `abort` 또는 `complete` | 1시간 | 소액 | — | **예** — ⚠️ `complete-vault-lock` 을 실행하면 **정책이 불변이 되어 되돌릴 수 없습니다.** 실습에서는 `abort-vault-lock` 으로 끝내십시오 |
| LAB-29 | 17.3 | AWS Backup 중앙화 | 백업 볼트, 백업 계획, 태그 기반 리소스 할당, 볼트 잠금, 조직 단위 설정 | 2시간+ | 소액 (백업 저장량) | LAB-27 (백업 대상 필요) | **예** — ⚠️ **볼트 잠금을 컴플라이언스 모드로 걸면 유예 기간이 지난 뒤에는 해제할 수 없습니다.** 실습은 거버넌스 모드로. 복구 지점 → 백업 계획 → 볼트 순서 |

---

### 4부. 네트워크·컴퓨트 아키텍처

> 🔴 **이 부의 랩은 D.2의 사슬 순서를 그대로 따르십시오.** LAB-30부터 LAB-47까지는 사실상 하나의 긴 실습이고, 중간을 건너뛰면 뒤의 명령이 실행되지 않습니다.

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-30 | 18.3 | 🔴 서브넷 티어링 | VPC `shopmini-prod`(10.20.0.0/16), public/private-app/isolated-data 각 2AZ = 6개 서브넷 | 1시간 | 무료 | — | **예** — 서브넷·VPC (**마지막에** 삭제) |
| LAB-31 | 18.4 | 라우팅 테이블과 인터넷 게이트웨이 | IGW, 퍼블릭 라우팅 테이블 + 0.0.0.0/0 경로, 서브넷 연결, "프라이빗인 줄 알았던 서브넷" 검증 | 1시간 | 무료 | LAB-30 | **예** — 라우팅 테이블, IGW 분리 후 삭제 |
| LAB-32 | 18.5 | 🔴 NAT 게이트웨이 구성 | 탄력적 IP 2개, AZ별 NAT 게이트웨이 2개, 앱 서브넷용 라우팅 테이블 2개 | 1시간 | 🔴 **주의** — NAT 게이트웨이 **시간당 + 처리 데이터량**. 탄력적 IP도 **미연결 상태에서 시간당 과금** | LAB-31 | **예** — NAT 게이트웨이 → (삭제 완료 대기) → 탄력적 IP 해제. **이 랩이 이 책에서 요금 사고가 가장 많이 나는 지점입니다** |
| LAB-33 | 18.6 | NAT 인스턴스 (레거시) | 소스/대상 확인 비활성화, NAT용 보안 그룹, 라우팅 경로를 ENI로 | 1시간 | 소액 (소형 EC2 1대) | LAB-32, LAB-38 | **예** — 인스턴스, 보안 그룹, 경로 |
| LAB-34 | 19.2 | 🔴 보안 그룹 설계 패턴 | `sg-alb` → `sg-app` → `sg-data` 참조 체인, 기본 이그레스 제거 후 재정의, 관리형 접두사 목록 활용, 태깅 | 1시간 | 무료 | LAB-30 | **예** — 보안 그룹 (**참조 체인 역순**: data → app → alb. 참조 중인 SG는 삭제되지 않음) |
| LAB-35 | 19.4 | NACL 실습과 활용처 | 커스텀 NACL, 규칙 번호 설계, 임시 포트 규칙, 서브넷 연결 교체 | 1시간 | 무료 | LAB-30 | **예** — NACL(기본 NACL로 연결 복구 후 삭제) |
| LAB-36 | 20.1 | VPC 게이트웨이 엔드포인트로 S3 연결 | S3 게이트웨이 엔드포인트, 라우팅 테이블 연결, 접두사 목록 경로 자동 추가 확인, 이그레스 규칙을 접두사 목록으로 | 30분 | 무료 (**게이트웨이** 엔드포인트는 과금 없음) | LAB-31, LAB-34 | **예** — 엔드포인트 (무료지만 남으면 라우팅이 꼬임) |
| LAB-37 | 21.6 | 🔴 Session Manager 구성 | SSM 인스턴스 프로파일, **인터페이스 엔드포인트 3종 × 2AZ**, 세션 로깅(S3/CloudWatch + KMS), IAM 조건으로 대상 제한, 포트 포워딩 | 2시간+ | 🔴 **주의** — 인터페이스 엔드포인트는 **AZ당 ENI 시간당 과금 + 처리량**. 3종 × 2AZ = 6 ENI | LAB-34 (구성) / LAB-38 (검증만) | **예** — VPC 엔드포인트 6개, 인스턴스 프로파일·역할, 세션 로그 버킷 |
| LAB-38 | 22.1 | EC2 인스턴스 시작과 서브넷 배치 | 시작 템플릿(IMDSv2 강제·퍼블릭 IP 없음), private-app 서브넷에 인스턴스 시작, 허용 AMI 설정 | 1시간 | 소액 (인스턴스 시간 + EBS) | LAB-30, LAB-34 | **예** — 인스턴스, 시작 템플릿, 루트 볼륨 |
| LAB-39 | 22.2 | 키 페어 관리 | 로컬에서 키 생성 후 `import-key-pair`, EC2 Instance Connect로 임시 공개 키 주입, 시작 템플릿 버전 확인 | 30분 | 무료 | LAB-38 | **예** — 키 페어(**AWS에서 지워도 인스턴스의 `authorized_keys` 는 남는다**는 것이 이 랩의 요지) |
| LAB-40 | 22.3 | 🔴 IAM 역할 부착 | 인스턴스 프로파일 연결·교체(무중단), 서비스 최종 액세스 정보로 권한 좁히기 | 30분 | 무료 | LAB-38 | **예** — 역할·인스턴스 프로파일 |
| LAB-41 | 22.4 | 사용자 데이터(User Data) | 8443 HTTPS 웹 서버를 User Data로 구성, Parameter Store에서 값 주입, User Data 노출 실측 | 1시간 | 소액 | LAB-38, LAB-09 | **예** — 인스턴스 (User Data에 넣은 값이 **메타데이터로 평문 노출**되므로 실습 후 반드시 교체) |
| LAB-42 | 22.5 | 골든 AMI 파이프라인 | EC2 Image Builder 컴포넌트·레시피·인프라 구성·파이프라인, AMI 태깅, 사용 중단·등록 해제 보호 | 2시간+ | 소액 (빌드 인스턴스 시간 + AMI 스냅샷 저장) | LAB-38 | **예** — ⚠️ **AMI와 그 뒤의 스냅샷은 별도입니다.** AMI 등록 해제만 하면 스냅샷 저장 과금이 남습니다. 등록 해제 보호를 켰다면 먼저 해제 |
| LAB-43 | 23.1 | EC2에 HTTPS 활성화 | 앱 인스턴스에 TLS 구성(8443), 자체 서명 인증서로 검증 | 30분 | 무료 (LAB-38 재사용) | LAB-38 | 아니오 (인스턴스와 함께 정리) |
| LAB-44 | 23.2 | 🔴 ACM으로 인증서 발급·관리 | ACM 퍼블릭 인증서 요청(DNS 검증), 갱신 실패 알람 2겹 | 1시간 | 무료 (ACM 퍼블릭 인증서 자체는 무과금) | — (도메인 보유 필요) | **예** — 인증서. ⚠️ **검증되지 않은 요청은 일정 기간 뒤 자동 만료**되지만, 알람은 남으므로 함께 삭제 |
| LAB-45 | 23.4 | 대상 그룹 구성 | HTTPS·8443 대상 그룹, 헬스 체크 `/healthz`, 등록 해제 지연, 침해 인스턴스 즉시 등록 해제 | 30분 | 무료 (대상 그룹 자체) / 🔴 **주의** — 실제로 트래픽을 흘리려면 **ALB가 필요하고 ALB는 시간당 + LCU 과금** (23.3·23.5·23.6) | LAB-38, LAB-34 | **예** — 대상 그룹, **그리고 만들었다면 ALB/NLB와 리스너** |
| LAB-46 | 23.7 | CloudFront + S3 안전한 배포 | OAC(Origin Access Control), 응답 헤더 정책, 퍼블릭 키·키 그룹(서명된 URL/쿠키), 커스텀 도메인 | 2시간+ | **이벤트 과금** (요청 수 + 데이터 전송) | LAB-21, LAB-44 | **예** — 배포 **비활성화 후 삭제**(시간이 걸림), OAC, 키 그룹. ⚠️ CloudFront용 ACM 인증서는 `us-east-1` |
| LAB-47 | 23.8 | AWS WAF 구성 | 웹 ACL 2개(`CLOUDFRONT`/`us-east-1`, `REGIONAL`/`ap-northeast-2`), Count 모드 도입, 샘플 요청 확인, 로깅 | 2시간+ | 🔴 **주의** + **이벤트 과금** — 웹 ACL 월 단위 + **규칙 수** + **요청 수**. 관리형 규칙 그룹은 별도 | LAB-46 | **예** — 웹 ACL **2개 모두**(리전이 달라 하나만 지우기 쉬움), 로깅 구성, 로그 대상 |

---

### 5부. 취약점·공급망·파이프라인

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-48 | 26.3 | Amazon Inspector | Inspector 활성화(계정/조직), 커버리지 확인, 결과 조회, 억제 규칙(필터), 결과 보고서 내보내기 | 1시간 | **이벤트 과금** (스캔 대상 인스턴스 시간 + 컨테이너 이미지 스캔 건수 + Lambda 함수) | LAB-38 | **예** — **Inspector 비활성화**. 켜 둔 채 EC2 랩을 계속하면 인스턴스마다 계속 과금 |
| LAB-49 | 26.7 | Trusted Advisor 활용 | 점검 목록 조회, 요약·상세 결과 조회, 새로고침 | 15분 | 무료 (**단, 전체 점검 항목은 지원 플랜에 따라 다름**) | — | 아니오 |
| LAB-50 | 28.2 | IaC 정적 분석 | CloudFormation Guard 규칙 작성, 템플릿 검증, Terraform 플랜 검사, CI 연결, `validate-policy` | 2시간+ | 무료 (로컬 실행 중심) | — | 아니오 (로컬 파일만) |

---

### 6부. 탐지·대응·복구

> ⚠️ **이 부의 랩은 켜 두면 계속 과금됩니다.** LAB-51(CloudTrail)과 LAB-53(플로우 로그)은 **로그 저장량**, LAB-61~65(탐지 서비스)는 **분석 이벤트량**에 비례합니다. 한 번에 다 켜지 말고, 랩마다 "이것을 계속 켜 둘 것인가"를 결정하십시오.

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-51 | 29.2 | 🔴 CloudTrail 심화 | 🔴 다중 리전 조직 트레일, 데이터 이벤트 고급 선택기, Insights 선택기 | 1시간 | **이벤트 과금** — 관리 이벤트 첫 사본은 무과금이나 **데이터 이벤트와 Insights는 건당 과금**, S3 저장량 별도 | — | **예** — ⚠️ **데이터 이벤트와 Insights를 반드시 끄십시오.** 트레일 자체는 유지해도 되지만 이 둘은 실습 후 즉시 해제 |
| LAB-52 | 29.4 | 크로스 계정 CloudTrail 로깅 | 로그 아카이브 계정의 버킷 정책(`aws:SourceArn` + `aws:SourceAccount` 조건 포함) | 1시간 | 무료 (저장량 별도) | LAB-51, **2계정** | **예** — 로그 버킷(객체 포함) |
| LAB-53 | 29.5 | VPC 플로우 로그 | VPC/서브넷/ENI 단위 플로우 로그, 사용자 지정 형식, S3 vs CloudWatch Logs 대상 비교 | 1시간 | **이벤트 과금** — **수집 로그량에 비례.** 트래픽이 많으면 빠르게 쌓임 | LAB-30 | **예** — 플로우 로그 구독, 로그 그룹/버킷의 데이터 |
| LAB-54 | 29.6 | CloudWatch 로그 그룹 설계 | 로그 그룹, 보존 기간, KMS 연결, 지표 필터, 구독 필터 | 1시간 | **이벤트 과금** (수집량 + 저장량) | LAB-12 | **예** — ⚠️ **보존 기간을 "만료 안 함"으로 두면 영구 저장 과금**입니다. 로그 그룹 삭제 또는 보존 기간 설정 |
| LAB-55 | 29.8 | AWS Config로 구성 이력 추적 | 구성 레코더, 전송 채널, `select-resource-config` 질의, 구성 이력 조회, 관계 확인 | 1시간 | **이벤트 과금** — **기록된 구성 항목 수**에 비례. 4부 랩을 돌리면 항목이 급증 | LAB-51 | **예** — ⚠️ **레코더를 중지**하지 않으면 이후 모든 실습의 리소스 변경이 계속 기록됩니다 |
| LAB-56 | 30.1 | SNS 주제로 알림 보내기 | SNS 주제, 이메일 구독(확인 필요), 🔴 주제 정책으로 발행 주체 제한, KMS 암호화 | 30분 | 무료 (알림 건수 프리 티어) | LAB-12 | **예** — 주제·구독 (이후 랩에서 계속 쓰므로 **6부를 마친 뒤** 정리) |
| LAB-57 | 30.2 | CloudWatch 지표와 알람 | 지표 필터, 알람, 로그 끊김 알람(`TreatMissingData`), 복합 알람, 이상 탐지 알람 | 1시간 | 소액 (알람 수 × 월, 고해상도·복합·이상 탐지는 단가 다름) | LAB-54, LAB-56 | **예** — 알람 전부(특히 **이상 탐지 알람**), 지표 필터 |
| LAB-58 | 30.4 | CloudWatch 대시보드 구성 | 보안 운영 대시보드(JSON 정의) | 30분 | 소액 (대시보드 수 × 월, 소수는 무료) | LAB-57 | **예** — 대시보드 |
| LAB-59 | 30.5 | EventBridge(CloudWatch Events)로 실시간 대응 | 이벤트 패턴 규칙, 타깃, 입력 변환기, 크로스 계정 이벤트 버스 권한, 스케줄 규칙 | 1시간 | **이벤트 과금** (사용자 지정 이벤트·크로스 계정 이벤트) | LAB-56 | **예** — 규칙·타깃 (타깃을 먼저 제거해야 규칙이 삭제됨), 버스 권한 |
| LAB-60 | 30.6 | 🔴 Athena로 CloudTrail 로그 질의 | 파티션 프로젝션 테이블, 사고 조사 쿼리 8종, 스캔량 절감 | 2시간+ | **이벤트 과금** — **스캔한 데이터량**에 비례. 파티션 없이 전체 스캔하면 급증 | LAB-51 | **예** — Glue 테이블·데이터베이스, **Athena 쿼리 결과 버킷**(놓치기 쉬움) |
| LAB-61 | 31.1 | 🔴 Amazon GuardDuty | 탐지기 활성화, 보호 플랜 선택, 신뢰 IP 목록·위협 IP 목록, 결과 필터 | 1시간 | **이벤트 과금** — CloudTrail 이벤트 수 + VPC 플로우/DNS 로그량 + 선택한 보호 플랜 | LAB-51 | **예** — 계속 켜 둘지 결정. **끌 거라면 탐지기 삭제**(일시 중지 상태로 두면 설정만 남고 과금은 멈춤) |
| LAB-62 | 31.2 | 멀티 계정 GuardDuty 집계 | 위임 관리자 지정, 조직 자동 등록, 멤버 계정, S3로 결과 게시 | 1시간 | **이벤트 과금** (계정 수만큼 증가) | LAB-61, LAB-68, **2계정** | **예** — 멤버 연결 해제 → 위임 관리자 해제 → 게시 대상 버킷 |
| LAB-63 | 31.3 | Amazon Macie | 결과 조회·처리, EventBridge로 결과 흐름 자동화 | 30분 | **이벤트 과금** | LAB-11, LAB-59 | **예** — LAB-11과 함께 Macie 비활성화 |
| LAB-64 | 31.5 | 🔴 AWS Security Hub | Security Hub 활성화, 조직 구성, 보안 표준 선택, 컨트롤 관리, 결과 집계기, 사용자 지정 작업 | 2시간+ | **이벤트 과금** — **보안 점검 수행 건수 + 수집 결과 건수** | LAB-55, LAB-61 | **예** — ⚠️ Security Hub는 **AWS Config에 의존**하므로 켜 두면 Config 과금도 함께 커집니다. 비활성화 시 점수·결과 이력이 사라지므로 스크린샷을 먼저 남기십시오 |
| LAB-65 | 31.6 | CloudWatch와 CloudTrail 통합 | 트레일 → CloudWatch Logs 연결, 지표 필터 + 알람 배선 | 1시간 | **이벤트 과금** (로그 수집량) | LAB-51, LAB-54, LAB-57 | **예** — 트레일의 CloudWatch Logs 연결 해제, 로그 그룹 |
| LAB-66 | 35.2 | EventBridge + Lambda 자동 조치 패턴 | 공유 안전장치 모듈, 패턴 3종(퍼블릭 S3 차단·노출 키 비활성화·SG 되돌리기), DLQ·재시도 | 2시간+ | 소액 (Lambda 호출·SQS DLQ) | LAB-59, LAB-61 | **예** — Lambda 함수·실행 역할·DLQ·EventBridge 규칙. ⚠️ **자동 조치 람다를 남겨 두면 이후 실습 리소스를 자동으로 변경합니다** |
| LAB-67 | 35.3 | AWS Config 자동 교정(Remediation) | SSM 자동화 문서 확인, 교정 구성 연결, 교정 역할 범위 제한 | 1시간 | **이벤트 과금** (Config 규칙 평가 + SSM 자동화 실행) | LAB-55 | **예** — 교정 구성, 교정 역할. ⚠️ LAB-66과 같은 이유로 반드시 제거 |

---

### 7부. 멀티 계정 거버넌스와 규모화

> ⚠️ **이 부의 랩은 되돌리기가 가장 어렵습니다.** 조직 생성은 관리 계정을 바꿀 수 없고(36.2), 계정은 만들기는 쉽고 닫기는 어렵습니다(36.3). **개인 학습용 조직은 실습 전용 계정으로만 만드십시오.**

| 랩 번호 | 절 | 랩 제목 | 무엇을 만드나 | 예상 소요 | 비용 성격 | 선행 랩 | 정리 필요 |
|---|---|---|---|---|---|---|---|
| LAB-68 | 36.2 | AWS Organizations 구성 | 조직 생성, 전체 기능 활성화, 신뢰할 수 있는 액세스, 위임 관리자 등록 | 1시간 | 무료 | — | **예**(어려움) — ⚠️ **조직 삭제 전에 모든 멤버 계정을 제거**해야 하며, 관리 계정은 변경할 수 없습니다 |
| LAB-69 | 36.3 | 조직 하위 계정 생성과 이동 | 계정 생성(비동기), OU 생성, 계정 이동, 기존 계정 초대, 계정 폐쇄 | 2시간+ | 무료 | LAB-68 | **예**(어려움) — 계정 폐쇄 후에도 일정 기간 복구 대기 상태가 유지됩니다. **필요 이상으로 계정을 만들지 마십시오** |
| LAB-70 | 36.7 | 계정 간 역할 전환 | 자동 생성 역할의 신뢰 정책 수정, 통제 4가지, 생성 이벤트 감시 규칙 | 1시간 | 무료 | LAB-69 | **예** — 신뢰 정책 원복 또는 역할 삭제, EventBridge 규칙 |
| LAB-71 | 36.8 | AWS Resource Access Manager로 리소스 공유 | 조직 내 공유 활성화, 공유 VPC 패턴(서브넷 공유), 공유 범위 제한 | 1시간 | 무료 (RAM 자체) | LAB-68, LAB-30 | **예** — 리소스 공유 삭제. ⚠️ **공유받은 계정이 서브넷에 만든 리소스가 남아 있으면** 공유 해제가 막히거나 고아 리소스가 생깁니다 |
| LAB-72 | 37.5 | AWS Control Tower | 랜딩 존 정보 조회, 컨트롤 카탈로그 조회, 컨트롤 활성화 | 2시간+ | 🔴 **주의** — 랜딩 존이 **Config·CloudTrail·S3·KMS를 자동 배포**하고 그 전부가 과금됩니다 | LAB-68 | **예**(어려움) — ⚠️ **랜딩 존 해제는 리소스를 전부 지우지 않습니다.** 개인 학습이라면 **컨트롤 조회까지만 하고 랜딩 존을 만들지 않는 것**을 권합니다 |
| LAB-73 | 37.7 | AWS Config 적합성 팩(Conformance Pack) | 조직 단위 적합성 팩 배포, 상태 조회, 커스텀 팩 작성 | 1시간 | **이벤트 과금** — 팩에 든 **규칙 수 × 평가 횟수** | LAB-55, LAB-68 | **예** — 적합성 팩 삭제(팩이 만든 규칙과 S3 전송 버킷도 함께 확인) |
| LAB-74 | 38.1 | AWS Artifact로 규정 준수 보고서 받기 | 보고서 목록 조회, 약관 수락, 보고서 내려받기 | 30분 | 무료 | — | 아니오 (⚠️ 다만 **받은 보고서는 NDA 대상**입니다. 공유 금지) |
| LAB-75 | 39.5 | AWS Well-Architected 보안 기둥 리뷰 | 워크로드 정의, 보안 기둥 질문 응답, 개선 항목 조회, 마일스톤, 보고서 | 2시간+ | 무료 | 4부·6부 랩 일부(리뷰 대상이 있어야 의미 있음) | 아니오 (워크로드 정의는 남겨 두고 분기마다 재리뷰 권장) |

---

## D.4 🔴 "주의" 등급 랩 — 실습 후 반드시 삭제

**아래 랩은 시간당 단가가 크고 프리 티어가 없습니다.** 지우는 것을 잊으면 다음 달 청구서에 그대로 나타납니다. 이 표의 모든 항목은 **"오늘 안에 끝내고 오늘 지운다"** 를 전제로 합니다.

| 랩 | 절 | 무엇이 과금되나 | 무엇에 비례하나 | 삭제 명령(요지) | 특히 놓치기 쉬운 것 |
|---|---|---|---|---|---|
| **LAB-17** | 14.2 | CloudHSM 클러스터 | — (HSM이 없으면 클러스터 자체는 과금되지 않음) | `cloudhsmv2 delete-cluster` | HSM을 먼저 지워야 클러스터가 지워짐 |
| 🔴 **LAB-18** | 14.3 | **HSM 인스턴스** | **HSM 개수 × 실행 시간** | `cloudhsmv2 delete-hsm` → `delete-cluster` → `delete-backup` | ⚠️ **백업.** HSM과 클러스터를 지워도 **백업이 남아 보관 과금**됩니다. 그리고 백업까지 지우면 **키가 영구 소실**되므로, 순서를 본문 14.3 그대로 따르십시오 |
| 🔴 **LAB-32** | 18.5 | **NAT 게이트웨이** | **게이트웨이 개수 × 실행 시간 + 처리 데이터량** | `ec2 delete-nat-gateway` → (삭제 완료 대기) → `ec2 release-address` | ⚠️ **탄력적 IP.** NAT를 지우면 EIP가 미연결 상태가 되고, **미연결 EIP는 그 자체로 시간당 과금**됩니다. 이 책에서 요금 사고가 가장 많이 나는 조합입니다 |
| 🔴 **LAB-37** | 21.6 | **인터페이스 VPC 엔드포인트** | **ENI 개수(= 엔드포인트 × AZ) × 실행 시간 + 처리량** | `ec2 delete-vpc-endpoints` | 3종(ssm·ssmmessages·ec2messages) × 2AZ = **6 ENI**. 하나만 지우고 끝내기 쉽습니다 |
| 🔴 **LAB-45** | 23.4 | **ALB / NLB** (대상 그룹 자체는 무료) | **로드 밸런서 개수 × 실행 시간 + LCU** | `elbv2 delete-load-balancer` → `elbv2 delete-target-group` | 23.3·23.5·23.6을 따라 하며 만든 **ALB와 NLB 두 개**가 남는 경우가 많습니다. 리스너를 지워도 로드 밸런서는 남습니다 |
| 🔴 **LAB-47** | 23.8 | **WAF 웹 ACL** | **웹 ACL 수 + 규칙 수 + 검사 요청 수** (관리형 규칙 그룹은 별도) | `wafv2 delete-web-acl` (연결 해제 후) | ⚠️ **웹 ACL이 2개**입니다 — `us-east-1`/`CLOUDFRONT` 와 `ap-northeast-2`/`REGIONAL`. 리전이 달라 하나만 지우기 쉽습니다 |
| 🔴 **LAB-72** | 37.5 | **Control Tower 랜딩 존** | 랜딩 존이 자동 배포한 **Config 항목 수 + CloudTrail + S3 + KMS** | 콘솔에서 랜딩 존 해제 후 **남은 리소스 수동 삭제** | ⚠️ **해제가 곧 삭제가 아닙니다.** 개인 학습이라면 랜딩 존을 만들지 말고 컨트롤 조회까지만 하십시오 |
| ⚠️ **Shield Advanced** (23.10) | 23.10 | **구독 자체** | **구독 기간(최소 약정 기간이 있음)** | — | 🔴 **이 책에는 Shield Advanced를 활성화하는 실습이 없습니다.** 23.10은 서술 절(🧪 아님)이며, **실습으로 구독하지 마십시오.** 최소 약정 기간이 있어 실습 목적으로 켜면 되돌릴 수 없습니다 |

### 🔴 이 표를 쓰는 법 — 세션 종료 의식(ritual) 3단계

| 단계 | 하는 일 | 판정 |
|---|---|---|
| ① | D.5 스크립트를 **조회 모드**로 실행 | 출력에 위 표의 리소스가 하나도 없어야 함 |
| ② | 남은 것이 있으면 **의존성 역순**으로 삭제 (D.5가 순서대로 처리) | 스크립트 재실행 시 출력이 비어야 함 |
| ③ | D.6의 사후 점검 | 다음 날 비용이 평평해져야 함 |

**②에서 "지웠는데 또 나온다"면 리전을 의심하십시오.** 이 책의 실습 리전은 `ap-northeast-2` 고정이지만, CloudFront용 ACM·WAF(CLOUDFRONT scope)·CloudWatch 결제 알람은 `us-east-1`에 있습니다(0.4 시나리오 4).

---

## D.5 통합 정리(cleanup) 스크립트

### 이 스크립트가 하는 일과 하지 않는 일

| 하는 일 | 하지 않는 일 |
|---|---|
| `Project=awssec-lab` 태그가 붙은 리소스를 **Resource Groups Tagging API로 조회** | 태그 없이 만든 리소스를 찾는 일 (아래 ⚠️ 참조) |
| 태그와 무관하게 **과금이 큰 리소스 유형을 직접 조회** | 두 번째 계정, 다른 리전의 리소스 |
| 확인 프롬프트 뒤에 **의존성 역순으로 삭제** | 확인 없이 무엇이든 삭제하는 일 |
| 삭제 완료를 **기다린 뒤** 다음 단계로 진행 | 되돌릴 수 없는 작업(계정 폐쇄, 볼트 잠금 완료, HSM 백업 삭제)을 대신 판단하는 일 |

> 🔴 **기본 동작은 조회(dry-run)입니다.** 실제 삭제는 `--apply` 를 붙이고, 그 뒤에도 `DELETE` 를 타이핑해야 진행됩니다.

### ⚠️ 이 스크립트가 못 찾는 것 — 반드시 손으로 확인할 목록

Resource Groups Tagging API는 **모든 서비스를 지원하지 않습니다.** 아래는 이 책의 실습에서 실제로 누락되는 유형이고, 스크립트도 이것들을 삭제하지 않습니다.

| 유형 | 왜 안 잡히나 | 어떻게 확인·정리하나 |
|---|---|---|
| **IAM 사용자·그룹·역할·정책** | IAM은 Tagging API 대상이 아님 | `iam list-users` / `list-roles` / `list-policies --scope Local` (LAB-04·05·06·40) |
| **계정 수준 설정** (EBS 기본 암호화, S3 퍼블릭 액세스 차단, IAM 암호 정책, 허용 AMI 설정) | 리소스가 아니라 설정이라 태그가 없음 | 각 서비스의 `get-*` 명령. **대부분은 켜 둔 채로 두는 것이 맞습니다** |
| **서비스 활성화 상태** (GuardDuty·Macie·Inspector·Security Hub·Config 레코더) | 태그 대상이 리소스가 아니라 "활성화"라는 상태 | `guardduty list-detectors`, `macie2 get-macie-session`, `inspector2 batch-get-account-status`, `securityhub describe-hub`, `configservice describe-configuration-recorder-status` |
| **Organizations 계정·OU·SCP** | Tagging API 대상이 아님 | `organizations list-accounts` / `list-organizational-units-for-parent` / `list-policies` (LAB-68~70) |
| **S3 객체와 객체 버전** | 버킷은 잡히지만 **객체는 잡히지 않음** | `s3api list-object-versions`. ⚠️ **버전 관리 버킷은 모든 버전과 삭제 마커를 지워야 버킷이 삭제됩니다**(LAB-25) |
| **다른 리전 리소스** | Tagging API는 리전 단위 | `us-east-1`: CloudFront용 ACM·WAF(CLOUDFRONT scope)·결제 알람. 복제 대상 리전(LAB-26) |
| **다른 계정 리소스** | 자격 증명이 다름 | 2계정 랩(D.2 표)의 두 번째 계정에서 스크립트를 **따로 한 번 더** 실행 |
| **Athena 쿼리 결과** | 결과 버킷은 태그 없이 자동 생성되는 경우가 많음 | `athena get-work-group --work-group primary` 로 결과 위치 확인 후 객체 삭제 (LAB-60) |
| **CloudHSM 백업** | 클러스터·HSM과 별개 수명 주기 | `cloudhsmv2 describe-backups` (LAB-18) |
| **AMI 뒤의 EBS 스냅샷** | AMI 등록 해제 ≠ 스냅샷 삭제 | `ec2 describe-images --owners self` → 각 이미지의 `BlockDeviceMappings[].Ebs.SnapshotId` (LAB-42) |

### 스크립트

`appD-cleanup.sh`:

```bash
#!/usr/bin/env bash
# appD-cleanup.sh — 실습 리소스 조회 및 (확인 후) 삭제
#
#   조회만       : ./appD-cleanup.sh
#   실제 삭제    : ./appD-cleanup.sh --apply
#   프로파일/리전: ./appD-cleanup.sh --profile awssec-lab --region ap-northeast-2
#
# 태그 규약(CANON): Project=awssec-lab / Chapter=chNN / AutoDelete=true
# 삭제 대상은 AutoDelete=true 인 것만으로 한정한다.

set -euo pipefail

PROFILE="awssec-lab"
REGION="ap-northeast-2"
APPLY="no"
TAG_PROJECT="awssec-lab"

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)   APPLY="yes"; shift ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --region)  REGION="$2"; shift 2 ;;
    -h|--help)
      echo "usage: $0 [--apply] [--profile NAME] [--region REGION]"
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

AWS=(aws --profile "$PROFILE" --region "$REGION" --output text)

hr()   { printf '%s\n' "------------------------------------------------------------"; }
note() { printf '[*] %s\n' "$*"; }
warn() { printf '[!] %s\n' "$*" >&2; }

# ---------------------------------------------------------------
# 0. 계정 확인 — 업무 계정에서 실행하는 사고를 막는다
# ---------------------------------------------------------------
ACCOUNT_ID="$("${AWS[@]}" sts get-caller-identity --query Account)"
CALLER_ARN="$("${AWS[@]}" sts get-caller-identity --query Arn)"
hr
note "프로파일 : $PROFILE"
note "리전     : $REGION"
note "계정 ID  : $ACCOUNT_ID"
note "호출자   : $CALLER_ARN"
note "모드     : $( [ "$APPLY" = "yes" ] && echo '삭제(APPLY)' || echo '조회만(DRY-RUN)' )"
hr
echo "위 계정이 실습 계정이 맞습니까? 아니라면 지금 Ctrl-C 를 누르십시오."
read -r -p "계정 ID를 그대로 입력해 확인: " TYPED
if [ "$TYPED" != "$ACCOUNT_ID" ]; then
  warn "계정 ID가 일치하지 않습니다. 중단합니다."
  exit 1
fi

# ---------------------------------------------------------------
# 1. 인벤토리 — 태그로 잡히는 것
# ---------------------------------------------------------------
hr
note "[1] 태그(Project=$TAG_PROJECT)가 붙은 리소스"
"${AWS[@]}" resourcegroupstaggingapi get-resources \
  --tag-filters "Key=Project,Values=$TAG_PROJECT" \
  --query 'ResourceTagMappingList[].ResourceARN' || true

# ---------------------------------------------------------------
# 2. 인벤토리 — 과금이 큰 유형을 직접 조회 (태그 누락 대비)
# ---------------------------------------------------------------
hr
note "[2] 과금이 큰 리소스 직접 조회 (태그 무관)"

echo "-- 실행/대기 중 EC2 인스턴스"
"${AWS[@]}" ec2 describe-instances \
  --filters Name=instance-state-name,Values=running,pending,stopping,stopped \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]' || true

echo "-- 로드 밸런서 (시간당 + LCU)"
"${AWS[@]}" elbv2 describe-load-balancers \
  --query 'LoadBalancers[].[LoadBalancerArn,Type,State.Code]' || true

echo "-- NAT 게이트웨이 (시간당 + 처리량)"
"${AWS[@]}" ec2 describe-nat-gateways \
  --filter Name=state,Values=available,pending \
  --query 'NatGateways[].[NatGatewayId,VpcId,State]' || true

echo "-- 미연결 탄력적 IP (그 자체로 시간당 과금)"
"${AWS[@]}" ec2 describe-addresses \
  --query 'Addresses[?AssociationId==`null`].[PublicIp,AllocationId]' || true

echo "-- 인터페이스 VPC 엔드포인트 (ENI 단위 시간당)"
"${AWS[@]}" ec2 describe-vpc-endpoints \
  --filters Name=vpc-endpoint-type,Values=Interface \
  --query 'VpcEndpoints[].[VpcEndpointId,ServiceName,State]' || true

echo "-- CloudHSM 클러스터 / HSM"
"${AWS[@]}" cloudhsmv2 describe-clusters \
  --query 'Clusters[].[ClusterId,State,length(Hsms)]' 2>/dev/null || \
  echo "(CloudHSM 없음 또는 권한 없음)"

echo "-- RDS 인스턴스"
"${AWS[@]}" rds describe-db-instances \
  --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceClass,DBInstanceStatus]' || true

echo "-- WAF 웹 ACL (REGIONAL)"
"${AWS[@]}" wafv2 list-web-acls --scope REGIONAL \
  --query 'WebACLs[].[Name,Id]' || true

echo "-- WAF 웹 ACL (CLOUDFRONT, us-east-1) / CloudFront 배포 / 결제 알람"
aws --profile "$PROFILE" --region us-east-1 --output text \
  wafv2 list-web-acls --scope CLOUDFRONT --query 'WebACLs[].[Name,Id]' || true
aws --profile "$PROFILE" --region us-east-1 --output text \
  cloudfront list-distributions \
  --query 'DistributionList.Items[].[Id,Status,Enabled]' 2>/dev/null || \
  echo "(CloudFront 배포 없음)"

hr
note "[3] 스크립트가 찾지 못하는 것 — 부록 D.5 표를 보고 손으로 확인하십시오"
echo "    IAM · 계정 수준 설정 · 탐지 서비스 활성화 상태 · Organizations ·"
echo "    S3 객체/버전 · 다른 리전 · 다른 계정 · Athena 결과 · CloudHSM 백업 · AMI 스냅샷"

if [ "$APPLY" != "yes" ]; then
  hr
  note "조회만 수행했습니다. 삭제하려면 --apply 를 붙여 다시 실행하십시오."
  exit 0
fi

# ---------------------------------------------------------------
# 3. 삭제 확인
# ---------------------------------------------------------------
hr
warn "이제부터 AutoDelete=true 태그가 붙은 리소스를 삭제합니다. 되돌릴 수 없습니다."
read -r -p "계속하려면 DELETE 를 그대로 입력하십시오: " CONFIRM
if [ "$CONFIRM" != "DELETE" ]; then
  note "취소했습니다."
  exit 0
fi

# ---------------------------------------------------------------
# 4. 삭제 — 의존성 역순
#    인스턴스 → LB/대상그룹 → 엔드포인트 → ENI → NAT → EIP
#    → 라우팅/IGW → SG/NACL → 서브넷 → VPC
# ---------------------------------------------------------------
FILTERS=(Name=tag:Project,Values="$TAG_PROJECT" Name=tag:AutoDelete,Values=true)

hr
note "[4-1] EC2 인스턴스 종료"
INSTANCE_IDS="$("${AWS[@]}" ec2 describe-instances \
  --filters "${FILTERS[@]}" Name=instance-state-name,Values=running,pending,stopping,stopped \
  --query 'Reservations[].Instances[].InstanceId')"
if [ -n "$INSTANCE_IDS" ]; then
  # shellcheck disable=SC2086
  "${AWS[@]}" ec2 terminate-instances --instance-ids $INSTANCE_IDS
  note "종료 대기 중..."
  # shellcheck disable=SC2086
  "${AWS[@]}" ec2 wait instance-terminated --instance-ids $INSTANCE_IDS
  note "인스턴스 종료 완료: $INSTANCE_IDS"
else
  note "대상 없음"
fi

hr
note "[4-2] 로드 밸런서 → 대상 그룹"
LB_ARNS="$("${AWS[@]}" elbv2 describe-load-balancers \
  --query 'LoadBalancers[].LoadBalancerArn')"
for ARN in $LB_ARNS; do
  TAGGED="$("${AWS[@]}" elbv2 describe-tags --resource-arns "$ARN" \
    --query "TagDescriptions[0].Tags[?Key=='AutoDelete'].Value")"
  if [ "$TAGGED" = "true" ]; then
    note "삭제: $ARN"
    "${AWS[@]}" elbv2 delete-load-balancer --load-balancer-arn "$ARN"
  fi
done
if [ -n "$LB_ARNS" ]; then
  note "로드 밸런서 삭제 반영 대기(ENI 해제까지 시간이 걸립니다)"
  sleep 30
fi

TG_ARNS="$("${AWS[@]}" elbv2 describe-target-groups \
  --query 'TargetGroups[].TargetGroupArn' 2>/dev/null || true)"
for ARN in $TG_ARNS; do
  TAGGED="$("${AWS[@]}" elbv2 describe-tags --resource-arns "$ARN" \
    --query "TagDescriptions[0].Tags[?Key=='AutoDelete'].Value")"
  if [ "$TAGGED" = "true" ]; then
    note "삭제: $ARN"
    "${AWS[@]}" elbv2 delete-target-group --target-group-arn "$ARN" || \
      warn "대상 그룹 삭제 실패(리스너가 남아 있을 수 있음): $ARN"
  fi
done

hr
note "[4-3] VPC 엔드포인트 (인터페이스 + 게이트웨이)"
VPCE_IDS="$("${AWS[@]}" ec2 describe-vpc-endpoints \
  --filters "${FILTERS[@]}" \
  --query 'VpcEndpoints[].VpcEndpointId')"
if [ -n "$VPCE_IDS" ]; then
  # shellcheck disable=SC2086
  "${AWS[@]}" ec2 delete-vpc-endpoints --vpc-endpoint-ids $VPCE_IDS
  note "삭제 요청: $VPCE_IDS"
  sleep 20
else
  note "대상 없음"
fi

hr
note "[4-4] 남은 ENI (available 상태만)"
ENI_IDS="$("${AWS[@]}" ec2 describe-network-interfaces \
  --filters "${FILTERS[@]}" Name=status,Values=available \
  --query 'NetworkInterfaces[].NetworkInterfaceId')"
for ENI in $ENI_IDS; do
  note "삭제: $ENI"
  "${AWS[@]}" ec2 delete-network-interface --network-interface-id "$ENI" || \
    warn "ENI 삭제 실패(아직 사용 중): $ENI"
done
[ -z "$ENI_IDS" ] && note "대상 없음"

hr
note "[4-5] NAT 게이트웨이"
NAT_IDS="$("${AWS[@]}" ec2 describe-nat-gateways \
  --filter "${FILTERS[@]}" Name=state,Values=available,pending \
  --query 'NatGateways[].NatGatewayId')"
for NAT in $NAT_IDS; do
  note "삭제: $NAT"
  "${AWS[@]}" ec2 delete-nat-gateway --nat-gateway-id "$NAT"
done
if [ -n "$NAT_IDS" ]; then
  note "NAT 삭제 완료 대기 (수 분 소요)"
  # shellcheck disable=SC2086
  "${AWS[@]}" ec2 wait nat-gateway-deleted --nat-gateway-ids $NAT_IDS || \
    warn "대기 시간 초과. 콘솔에서 상태를 확인하십시오."
else
  note "대상 없음"
fi

hr
note "[4-6] 미연결 탄력적 IP 해제 (NAT 삭제 후에만 의미가 있습니다)"
ALLOC_IDS="$("${AWS[@]}" ec2 describe-addresses \
  --filters "${FILTERS[@]}" \
  --query 'Addresses[?AssociationId==`null`].AllocationId')"
for ALLOC in $ALLOC_IDS; do
  note "해제: $ALLOC"
  "${AWS[@]}" ec2 release-address --allocation-id "$ALLOC" || \
    warn "EIP 해제 실패(아직 연결되어 있음): $ALLOC"
done
[ -z "$ALLOC_IDS" ] && note "대상 없음"

hr
note "[4-7] 라우팅 테이블 연결 해제 → 삭제, IGW 분리 → 삭제"
RTB_IDS="$("${AWS[@]}" ec2 describe-route-tables \
  --filters "${FILTERS[@]}" \
  --query 'RouteTables[?length(Associations[?Main==`true`])==`0`].RouteTableId')"
for RTB in $RTB_IDS; do
  ASSOC_IDS="$("${AWS[@]}" ec2 describe-route-tables --route-table-ids "$RTB" \
    --query 'RouteTables[].Associations[].RouteTableAssociationId')"
  for A in $ASSOC_IDS; do
    "${AWS[@]}" ec2 disassociate-route-table --association-id "$A" || true
  done
  note "삭제: $RTB"
  "${AWS[@]}" ec2 delete-route-table --route-table-id "$RTB" || \
    warn "라우팅 테이블 삭제 실패: $RTB"
done
[ -z "$RTB_IDS" ] && note "라우팅 테이블 대상 없음"

IGW_IDS="$("${AWS[@]}" ec2 describe-internet-gateways \
  --filters "${FILTERS[@]}" \
  --query 'InternetGateways[].InternetGatewayId')"
for IGW in $IGW_IDS; do
  VPCS="$("${AWS[@]}" ec2 describe-internet-gateways --internet-gateway-ids "$IGW" \
    --query 'InternetGateways[].Attachments[].VpcId')"
  for V in $VPCS; do
    note "IGW 분리: $IGW ← $V"
    "${AWS[@]}" ec2 detach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$V" || true
  done
  note "삭제: $IGW"
  "${AWS[@]}" ec2 delete-internet-gateway --internet-gateway-id "$IGW" || \
    warn "IGW 삭제 실패: $IGW"
done
[ -z "$IGW_IDS" ] && note "IGW 대상 없음"

hr
note "[4-8] 보안 그룹 (참조 체인 때문에 여러 번 시도합니다)"
for PASS in 1 2 3; do
  SG_IDS="$("${AWS[@]}" ec2 describe-security-groups \
    --filters "${FILTERS[@]}" \
    --query 'SecurityGroups[?GroupName!=`default`].GroupId')"
  [ -z "$SG_IDS" ] && break
  note "pass $PASS: $SG_IDS"
  for SG in $SG_IDS; do
    "${AWS[@]}" ec2 delete-security-group --group-id "$SG" 2>/dev/null || true
  done
done
SG_LEFT="$("${AWS[@]}" ec2 describe-security-groups \
  --filters "${FILTERS[@]}" \
  --query 'SecurityGroups[?GroupName!=`default`].GroupId')"
[ -n "$SG_LEFT" ] && warn "삭제되지 않은 보안 그룹(다른 리소스가 참조 중): $SG_LEFT"

hr
note "[4-9] NACL (기본 NACL은 건드리지 않습니다)"
ACL_IDS="$("${AWS[@]}" ec2 describe-network-acls \
  --filters "${FILTERS[@]}" \
  --query 'NetworkAcls[?IsDefault==`false`].NetworkAclId')"
for ACL in $ACL_IDS; do
  note "삭제: $ACL"
  "${AWS[@]}" ec2 delete-network-acl --network-acl-id "$ACL" || \
    warn "NACL 삭제 실패(서브넷에 연결되어 있음): $ACL"
done
[ -z "$ACL_IDS" ] && note "대상 없음"

hr
note "[4-10] 서브넷"
SUBNET_IDS="$("${AWS[@]}" ec2 describe-subnets \
  --filters "${FILTERS[@]}" \
  --query 'Subnets[].SubnetId')"
for SN in $SUBNET_IDS; do
  note "삭제: $SN"
  "${AWS[@]}" ec2 delete-subnet --subnet-id "$SN" || \
    warn "서브넷 삭제 실패(ENI가 남아 있음): $SN"
done
[ -z "$SUBNET_IDS" ] && note "대상 없음"

hr
note "[4-11] VPC (마지막)"
VPC_IDS="$("${AWS[@]}" ec2 describe-vpcs \
  --filters "${FILTERS[@]}" \
  --query 'Vpcs[?IsDefault==`false`].VpcId')"
for V in $VPC_IDS; do
  note "삭제: $V"
  "${AWS[@]}" ec2 delete-vpc --vpc-id "$V" || \
    warn "VPC 삭제 실패(의존 리소스가 남아 있습니다. 위 경고를 확인하십시오): $V"
done
[ -z "$VPC_IDS" ] && note "대상 없음"

hr
note "삭제 단계를 마쳤습니다. 스크립트를 조회 모드로 한 번 더 실행해 결과를 확인하십시오."
note "그 뒤 부록 D.6의 사후 점검을 수행하십시오."
```

> ⚠️ **이 스크립트는 VPC 계열만 삭제합니다.** S3 버킷·KMS 키·시크릿·로그 그룹·탐지 서비스는 **의도적으로 제외**했습니다. 되돌릴 수 없거나(키 삭제 대기, 시크릿 복구 기간), 증거를 지우거나(로그·Config 이력), 판단이 필요한(버전 관리 버킷의 모든 버전 삭제) 작업이기 때문입니다. 이들은 각 랩의 정리 절차를 따르십시오.

### 스크립트 검증

배포 전에 **문법 검사**를 반드시 통과시키십시오. 이 부록의 스크립트는 아래 검사를 통과한 상태로 실렸습니다.

```bash
bash -n appD-cleanup.sh   # 문법 검사 (실행하지 않음)
shellcheck appD-cleanup.sh   # 선택: 정적 분석
```

---

## D.6 실습 계정 사후 점검

정리 스크립트가 "대상 없음"을 출력했다고 끝난 것이 아닙니다. **비용은 하루 뒤에 확인해야 합니다.**

### ① 다음 날 — 일 단위 비용이 평평한가

0.3의 `lab-sweep.sh` 와 같은 방식으로 **일 단위** 비용을 봅니다. 실습을 안 한 날의 값이 0에 가까워야 정리가 끝난 것입니다.

```bash
aws ce get-cost-and-usage \
  --profile awssec-lab --region us-east-1 \
  --time-period Start="$(date -u -d '7 days ago' +%Y-%m-%d)",End="$(date -u -d 'tomorrow' +%Y-%m-%d)" \
  --granularity DAILY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[].{Date:TimePeriod.Start,Svc:Groups[?Metrics.UnblendedCost.Amount!=`0`].[Keys[0],Metrics.UnblendedCost.Amount]}' \
  --output json
```

> 💡 **Cost Explorer API 사용 시 유의할 점 3가지**(0.3과 동일합니다). ① `ce` 는 글로벌 엔드포인트이므로 `us-east-1` 로 호출합니다. ② `--time-period` 의 `End` 는 **미포함(exclusive)** 입니다. ③ **요청당 과금되는 유료 API**이므로 루프에서 돌리지 마십시오.

### ② 어느 서비스가 남았는지 — 그룹핑해서 본다

위 명령의 `--group-by Type=DIMENSION,Key=SERVICE` 출력에서 **실습이 끝난 서비스가 여전히 나타나면** 그 서비스만 골라 정리합니다. 자주 남는 순서대로:

| 순위 | 서비스 | 원인이 되는 랩 | 확인 명령 |
|---|---|---|---|
| 1 | EC2 - Other (NAT·EIP·엔드포인트가 여기로 묶입니다) | LAB-32, LAB-37 | `ec2 describe-nat-gateways` / `describe-addresses` / `describe-vpc-endpoints` |
| 2 | AWS Config | LAB-55, LAB-64, LAB-73 | `configservice describe-configuration-recorder-status` |
| 3 | Amazon GuardDuty / Security Hub / Macie / Inspector | LAB-61~64, LAB-11, LAB-48 | 각 서비스의 상태 조회 명령(D.5 표) |
| 4 | Amazon S3 (저장량 + 요청) | LAB-21·25·26·51·53·60 | `s3api list-object-versions` 로 **버전과 삭제 마커**까지 |
| 5 | AWS Key Management Service | LAB-12~16, LAB-19 | `kms list-keys` → `describe-key` 로 `PendingDeletion` 확인 |
| 6 | AWS WAF | LAB-47 | `wafv2 list-web-acls` (REGIONAL + CLOUDFRONT 둘 다) |
| 7 | Amazon CloudFront | LAB-46 | `cloudfront list-distributions` |
| 8 | AWS CloudHSM | LAB-17·18 | `cloudhsmv2 describe-clusters` / `describe-backups` |

### ③ 예산 알람이 살아 있는가

**정리하다가 예산 알람을 지우는 것이 가장 나쁜 결말입니다.** LAB-03에서 만든 것 세 가지가 그대로 있는지 확인합니다.

```bash
aws budgets describe-budgets --account-id "$(aws sts get-caller-identity --profile awssec-lab --query Account --output text)" \
  --profile awssec-lab --region us-east-1 \
  --query 'Budgets[].[BudgetName,BudgetLimit.Amount,TimeUnit]' --output table

aws cloudwatch describe-alarms --profile awssec-lab --region us-east-1 \
  --alarm-name-prefix billing --query 'MetricAlarms[].[AlarmName,StateValue]' --output table

aws ce get-anomaly-monitors --profile awssec-lab --region us-east-1 \
  --query 'AnomalyMonitors[].[MonitorName,MonitorType]' --output table
```

### ④ 📋 실습 종료 최종 체크리스트

- [ ] D.5 스크립트를 **조회 모드**로 돌렸고 출력이 비어 있다
- [ ] D.4의 🔴 주의 등급 리소스가 **하나도 남아 있지 않다** (NAT·EIP·인터페이스 엔드포인트·ALB/NLB·웹 ACL 2개·HSM·HSM 백업)
- [ ] **`us-east-1`** 을 따로 확인했다 (CloudFront용 ACM·WAF CLOUDFRONT·결제 알람)
- [ ] **두 번째 계정**에서도 정리를 수행했다 (2계정 랩을 했다면)
- [ ] **복제 대상 리전**을 확인했다 (LAB-26을 했다면)
- [ ] 버전 관리 버킷의 **모든 버전과 삭제 마커**를 지웠다 (LAB-25)
- [ ] AMI **등록 해제 + 뒤의 스냅샷 삭제**까지 했다 (LAB-42)
- [ ] 탐지 서비스(GuardDuty·Macie·Inspector·Security Hub)와 **Config 레코더**의 상태를 의식적으로 결정했다
- [ ] 자동 조치 Lambda와 Config 교정 구성을 **제거했다** (LAB-66·67 — 남기면 이후 실습을 자동으로 바꿉니다)
- [ ] **예산 알람 3종은 지우지 않았다**
- [ ] 하루 뒤 일 단위 비용을 다시 확인할 일정을 잡았다

---

## 이 부록의 요약

| 항목 | 값 |
|---|---|
| 총 랩 수 | **75개** (`00_TOC.md`의 🧪 절과 1:1) |
| 부별 분포 | 0부 1 · 1부 2 · 2부 7 · 3부 19 · 4부 18 · 5부 3 · 6부 17 · 7부 8 |
| 🔴 주의 등급 | **7개** (LAB-17·18·32·37·45·47·72) + Shield Advanced는 **실습 금지** |
| 2계정이 필요한 랩 | 10개 (LAB-06·16·22·26·52·62·68~71) |
| 모든 랩의 선행 | **LAB-01 (0.3)** — 태그 규약이 여기서 정해집니다 |
| 가장 흔한 요금 사고 | **LAB-32의 NAT 게이트웨이 + 미연결 탄력적 IP** |
| 되돌릴 수 없는 작업 | Vault Lock 완료(LAB-28) · 백업 볼트 컴플라이언스 잠금(LAB-29) · CloudHSM 백업 삭제(LAB-18) · 계정 폐쇄(LAB-69) |
