---
title: "부록 F. 원서 매핑표"
---

# 부록 F. 원서 매핑표

이 책은 **원서 3권을 근거로 재구성한 책**입니다. 원서가 세운 개념과 우선순위를 AWS 문맥으로 옮기고, 원서 집필 이후 바뀐 것을 갱신하고, 원서가 다루지 않은 영역(컨테이너·서버리스·IaC·멀티 계정 거버넌스)을 보강했습니다.

이 부록은 그 대응 관계를 밝혀, 독자가 **원서로 심화 학습**할 수 있게 하는 것을 목적으로 합니다. 동시에 이 책이 **어디까지가 원서의 것이고 어디부터가 이 책의 것인지**를 분명히 하는 문서이기도 합니다.

| 절 | 내용 |
|---|---|
| F.1 | 원서 3권 소개 — 성격·구성·강점·한계 |
| F.2 | **본서 → 원서** 매핑 (41개 장 전부) |
| F.3 | **원서 → 본서** 매핑 (원서 24개 장 전부 + 다루지 않은 내용) |
| F.4 | 2판이 1판에 추가한 것과 본서의 반영 위치 |
| F.5 | 원서 이후 변경된 것 — 본서가 갱신한 항목 |
| F.6 | 심화 학습 경로 |

> ⚠️ **페이지 번호는 쓰지 않습니다.** 이 책의 인용 규칙(WRITING_GUIDE)에 따라 **책 제목 + 판 + 장**까지만 표기합니다. 원서의 판형과 전자책 페이지가 다르기 때문입니다. 장 번호와 절 제목은 실제 목차를 대조해 적었습니다.

---

## F.1 원서 3권 소개

### ① *AWS Security Cookbook* (Packt, 2020) — Heartin Kanikathottu

**성격.** 레시피(recipe) 형식의 실습서입니다. 각 레시피가 `Getting ready` → `How to do it...` → `How it works...` → `There's more...` → `See also` 의 고정 5단 구조를 가지며, 콘솔 화면과 AWS CLI 명령을 나란히 제시합니다. 서문은 이 책이 CIA 삼각(기밀성·무결성·가용성)과 AAA(인증·인가·가용성) 모델을 AWS 서비스로 달성하는 방법을 다루며, **AWS Certified Security – Specialty 준비**에도 도움이 되도록 썼다고 밝힙니다.

**구성 (10장).**

| 장 | 제목 |
|---|---|
| 1 | Managing AWS Accounts with IAM and Organizations |
| 2 | Securing Data on S3 with Policies and Techniques |
| 3 | User Pools and Identity Pools with Cognito |
| 4 | Key Management with KMS and CloudHSM |
| 5 | Network Security with VPC |
| 6 | Working with EC2 Instances |
| 7 | Web Security Using ELBs, CloudFront, and WAF |
| 8 | Monitoring with CloudWatch, CloudTrail, and Config |
| 9 | Compliance with GuardDuty, Macie, and Inspector |
| 10 | Additional Services and Practices for AWS Security |

**강점.** 세 권 중 **유일하게 AWS CLI 명령을 그대로 실행할 수 있는 형태로 제공**합니다. 특히 4장의 CloudHSM 초기화·활성화 절차(자체 CA로 CSR 서명 → 신뢰 앵커 → 초기화)와 2장의 S3 크로스 계정 접근 실습은 다른 두 권에 대응물이 없습니다. 비용 경고도 구체적입니다 — 4장은 CloudHSM에 **"프리 티어가 없다"**, **"학습 목적이라면 다음 레시피를 최대한 빨리 끝내고 생성한 리소스를 전부 정리하라"** 고 반복해 못 박습니다.

**한계 (집필 시점 기준).** 2020년에 쓰였기 때문에 이 책에서 갱신이 가장 많이 필요했던 원서입니다. S3 퍼블릭 액세스 차단이 기본값이 되기 전이고, ACL이 여전히 1급 시민이며, Inspector는 현재와 다른 서비스(Classic)이고, Organizations 최상위 계정을 **master account** 라 부르며, AWS SSO가 IAM Identity Center로 개명되기 전입니다. 또 **레시피 단위라 아키텍처 전체를 설계하는 관점은 약합니다** — "이 서비스를 어떻게 켜는가"에는 답하지만 "왜 이 순서로, 어느 경계에 두는가"에는 답하지 않습니다. 컨테이너·서버리스·IaC·공급망은 목차에 없습니다.

---

### ② *Practical Cloud Security*, 1st ed. (O'Reilly, 2019) — Chris Dotson

**성격.** 특정 클라우드 제공자에 얽매이지 않는 **개념·원칙서**입니다. 저자는 서문에서 이 책이 **"쿡북 스타일의 구현 가이드가 아니다"** 라고 명시하고, 그 이유를 두 가지 듭니다 — 제공자가 구현을 계속 개선하므로 그런 가이드는 매우 빨리 낡고, 제공자 자신이 쓰는 how-to가 더 정확하다는 것입니다. 대신 **"언제 그런 가이드를 찾아 써야 하는지에 대한 이해"** 를 제공하는 것이 목표라고 밝힙니다.

**구성 (7장).** 1. Principles and Concepts · 2. Data Asset Management and Protection · 3. Cloud Asset Management and Protection · 4. Identity and Access Management · 5. Vulnerability Management · 6. Network Security · 7. Detecting, Responding to, and Recovering from Security Incidents.

**강점.** **우선순위가 명확합니다.** 앞 3개 장이 "무엇을 책임지고 무엇을 갖고 있는가"를 세우고, 4~6장이 **"가장 먼저 고려해야 할 통제를 우선순위 순서대로"** — 아이덴티티 → 취약점 → 네트워크 — 배치하며, 7장이 탐지·대응·복구를 다룹니다. 각 장이 `Differences from Traditional IT` 로 시작해 `Putting It All Together in the Sample Application` 으로 끝나는 구조라, 개념이 예제 애플리케이션 하나로 계속 수렴합니다. 이 책이 ShopMini라는 단일 예제를 41개 장에 관통시키는 설계는 여기서 배운 것입니다.

**한계 (집필 시점 기준).** 2019년 판이라 제로 트러스트·패스키·SBOM·PAM·워크로드 아이덴티티가 없습니다(전부 2판 추가분 — F.4 참조). 용어도 `Whitelists and Blacklists`(2판에서 `Allowlists and Denylists` 로 교체), `Cloud Provider Security Management Tools`(2판에서 `Cloud Workload Protection Platforms` 로 교체)처럼 이후 바뀐 것이 있습니다. 그리고 **의도적으로 구현을 다루지 않으므로, 이 책을 읽고 나서 AWS 콘솔 앞에 앉으면 무엇을 눌러야 할지는 알 수 없습니다.** 2판이 나온 지금 1판을 새로 살 이유는 크지 않습니다.

---

### ③ *Practical Cloud Security*, 2nd ed. (O'Reilly, 2023) — Chris Dotson

**성격.** 1판의 구조(7장)를 유지하면서 4년치 변화를 반영한 개정판입니다. 장 제목과 절 구성이 1판과 거의 같아 **두 판을 나란히 두고 비교하기 좋습니다.** 각 장 끝에 `Exercises` 가 추가되고 권말에 `Appendix. Exercise Solutions` 가 붙었습니다. 1판의 `Summary` 가 `Conclusion` 으로 바뀐 것도 이 판입니다.

**구성 (7장 + 부록).** 장 제목은 1판과 동일합니다. 절 수준에서 추가된 대표 항목은 1장 `Zero Trust`, 6장 `Zero Trust Networking`·`Network Defense Tools`, 7장 `Cyber Kill Chains and MITRE ATT&CK`, 5장 `Cloud Workload Protection Platforms` 입니다. 6장의 `Putting It All Together in the Sample Application` 은 `Network Defense in Action in the Sample Application` 으로, 7장의 같은 절은 `Detection and Response in a Sample Application` 으로 제목이 바뀌었습니다.

**강점.** **세 권 중 가장 현재에 가깝고, 원칙의 서술이 가장 정제되어 있습니다.** 이 책이 1부(원칙)·5부(취약점·공급망)·6부(탐지·대응)에서 가장 많이 근거한 원서입니다. 특히 7장은 사고 대응의 팀·계획·도구를 구체적으로 규정해서 — 주(primary)와 예비(backup) 기술 리더를 반드시 두라거나, 검증된 별도 통신 시스템을 도구 목록에 포함하라거나, 사전 승인된 소액 예산이 필요하다거나 — 부록 C의 플레이북 템플릿 골격이 대부분 여기서 나왔습니다.

**한계 (집필 시점 기준).** **구현을 다루지 않는다는 성격은 그대로입니다.** AWS의 구체적인 서비스명은 예시로만 등장하며, 그나마도 2023년 기준입니다. 그리고 **멀티 계정 거버넌스(Organizations·SCP·Control Tower)라는 주제 자체가 없습니다** — 클라우드 중립을 지키려면 계정 경계 모델이 제공자마다 달라 다루기 어렵기 때문으로 보입니다. 컨테이너·서버리스는 3장에서 **자산 유형**으로만, 5장에서 **스캐닝 대상**으로만 다루고, 쿠버네티스 보안 구성이나 Lambda 권한 모델은 범위 밖입니다. 이 책의 7부(36~40장)와 24장(컨테이너·서버리스)이 가장 크게 보강된 부분인 이유입니다.

---

### 세 권의 관계 — 이 책이 세 권을 어떻게 썼는가

| 필요한 것 | 어느 책을 썼는가 |
|---|---|
| **왜 그렇게 해야 하는가**(원칙·우선순위·위협 모델) | PCS 2판 (1판은 대조용) |
| **AWS에서 무엇을 어떻게 누르는가**(CLI·정책 JSON·실습) | Cookbook |
| **탐지·대응·복구의 절차와 조직** | PCS 1·2판 7장 |
| **멀티 계정·컨테이너·서버리스·IaC·공급망 구현** | 원서 범위 밖 → 본서 보강 (💡로 명시) |

---

## F.2 본서 → 원서 매핑표 (정방향)

각 장의 원고에 실제로 달린 📖 인용을 전수 조사해 작성했습니다. **「주로 근거한 원서·장」은 그 장에서 인용 빈도와 논지 기여도가 가장 큰 것**을 앞에 두었습니다.

> 표기: **CB** = *AWS Security Cookbook*(2020) · **PCS1** = *Practical Cloud Security* 1판(2019) · **PCS2** = 2판(2023). `PCS1·2 4장` 은 1·2판 모두에 같은 내용이 있다는 뜻입니다.

### 0부·1부 — 오리엔테이션과 원칙

| 본서 장 | 주로 근거한 원서·장 | 원서에서 가져온 핵심 | 본서가 보강한 것 |
|---|---|---|---|
| **0장** 이 책을 시작하기 전에 | PCS2 서문 · CB 1장 · CB 4장 · PCS2 4장 | 2판 서문의 **읽는 순서 우선순위**(아이덴티티 → 취약점 → 네트워크); CB 1장 첫 레시피의 **루트 액세스 키 점검**; CB 4장의 **CloudHSM 비용 경고**; PCS2 4장의 **소스 코드에 시크릿을 두면 안 되는 두 이유** | 실습 계정 분리·CLI v2·`awssec-lab` 프로파일·예산 알림 2종·CANON 태그 규약·`lab-sweep.sh`. **ShopMini 예제 애플리케이션 확정** |
| **1장** 클라우드 보안의 5대 원칙 | PCS1·2 1장 (주) · PCS2 3장·5장·6장 | 최소 권한, 심층 방어(**"우스울 정도의 극단까지 갈 수 있다"**), 제로 트러스트(2판 신규), 불변 컨테이너의 정의, 콘솔 접근의 위험성 | **폭발 반경(blast radius)** 을 5번째 원칙으로 독립 — 원서에 이 표현은 없음(💡 명시). 원칙 충돌 시의 판단 기준(1.6) |
| **2장** 공동 책임 모델 | PCS1·2 1장 (주) · PCS2 3장·5장·7장 · CB 1장 | `The Cloud Shared Responsibility Model`, `Cloud Service Delivery Models`, aPaaS 정의, PaaS 설정 관리 처방(**"각 컴포넌트에 대해 사용 가능한 보안 설정을 파악하라"**), 가상화 계층의 단서 | **AWS 서비스 30여 종의 책임선 표**, 가장 오해되는 경계 5가지, 서비스 도입 시 체크리스트 |
| **3장** 위협 모델링과 신뢰 경계 | PCS1·2 1장 (주) · PCS2 4장 · CB 1장·10장 | `Threat Actors, Diagrams, and Trust Boundaries` 6단계 절차, **사용자 경험 디자인 기법을 빌려오라**는 권고, 관리자 접근 경로 4단계 | STRIDE를 AWS에 적용(💡 — STRIDE는 원서에 없음), ShopMini의 DF1~DF8·TB1~TB6, IAM Access Analyzer로 **그림과 실제를 대조하는 실습** |
| **4장** 리스크 관리와 컴플라이언스 | PCS1·2 2장 (주) · PCS1·2 1장 | `Data Identification and Classification`, `Example Data Classification Levels`, `Relevant Industry or Regulatory Requirements`(GDPR·HIPAA·PCI DSS), `Risk Management` 의 **리스크에 대한 네 가지 대응**, 리스크의 상호작용·합산 각주 | 규제를 **아키텍처 요구사항으로 번역하는 표**, 국내 규제(💡 원서 범위 밖), 컴플라이언스 ≠ 보안 |
| **5장** AWS 계정 첫날 필수 보안 | CB 1장 (주) · PCS2 4장 · CB 5장·8장·9장 | `Configuring IAM for a new account` 레시피 전체와 `Creating a billing alarm`, IAM 대시보드 체크리스트를 초록으로 유지하는 습관 | 다중 MFA 등록(💡), 전 리전 CloudTrail, 미사용 리전 SCP 차단, 기본 VPC 정리, **Day 1 20항목 체크리스트** |

### 2부 — 계정과 아이덴티티

| 본서 장 | 주로 근거한 원서·장 | 원서에서 가져온 핵심 | 본서가 보강한 것 |
|---|---|---|---|
| **6장** IAM 기본 요소 | PCS1·2 4장 (주) · CB 1장 | `Cloud IAM Identities`, `Shared IDs`, `Passwords and API Keys`, **인증과 인가를 뒤섞는 흔한 오류**, SPIFFE 언급 | ARN 읽는 법, 자격 증명 6종 비교표, **장기 액세스 키를 없애야 하는 이유**(💡 — 2020년 CB는 IAM 사용자를 기본으로 보지만 지금은 아님) |
| **7장** IAM 정책 작성과 평가 로직 | CB 1장 (주, `Creating IAM policies`) · PCS2 1장·4장 | 비주얼 에디터와 CLI로 같은 정책을 만드는 레시피, 그룹에 붙인 뒤 CLI로 검증하는 절차 | **정책 평가 순서 전체 흐름도**, 정책 6유형, Condition 키 활용, 위험한 패턴 10선, Access Analyzer. 💡 **RCP·미사용 액세스 분석기·커스텀 정책 검사는 원서 이후 기능** |
| **8장** 역할과 임시 자격 증명 | CB 1장·6장 (주) · PCS1·2 4장 | `Switching roles with AWS Organizations`, `Creating and attaching an IAM role to an EC2 instance`, `Instance Metadata and Identity Documents` | 💡 **IMDSv2**(원서 이후), 💡 **External ID·Confused Deputy는 원서 3권 모두 미수록**, 세션 태그·ABAC, 💡 **IAM Roles Anywhere·GitHub OIDC** |
| **9장** 페더레이션·SSO·특권 접근 | PCS1·2 4장 (주) · PCS2 7장 · CB 10장·3장 | `Federated Identity`, `Single Sign-On`, `Multi-Factor Authentication`(FIDO2·단계적 인증), `Approve`, `Revalidate`, 2판 7장 `Session Recording Tools`(= PAM), CB 10장 `Setting up and using AWS SSO` | 💡 **AWS SSO → IAM Identity Center 개명**, 💡 Azure AD → Microsoft Entra ID, 권한 세트 + 권한 경계 실습, 아이덴티티 라이프사이클, IAM 리뷰 체크리스트 |
| **10장** 고객 아이덴티티: Cognito | CB 3장 (주, 장 전체) · PCS1·2 4장 | 사용자 풀·앱 클라이언트 생성, 가입/확인 3방식, 관리자·클라이언트 인증 플로우, 그룹, 페더레이션, Lambda 트리거, `Business-to-Consumer and Business-to-Employee` | 💡 **인증 플로우 파라미터 개명**(`ADMIN_NO_SRP_AUTH` → `ALLOW_ADMIN_USER_PASSWORD_AUTH` 등), 💡 토큰 폐기 기능, 💡 지원 소셜 제공자 목록 변화, 흔한 설정 실수 |
| **11장** 시크릿 관리 | PCS1·2 4장 (주, `Secrets Management`) · CB 6장·10장 | 시크릿을 어디에 두면 안 되는가, 시크릿 서버의 요건, CB 6장 `Storing sensitive data with the Systems Manager Parameter Store`, CB 10장 `Using AWS Secrets Manager to manage RDS credentials` | Parameter Store vs Secrets Manager **선택 기준표**, 💡 관리형 순환(원서 시점엔 항상 사용자 Lambda 필요), 애플리케이션에서 안전하게 읽는 패턴, 서드파티 시크릿 서버 연동 |

### 3부 — 데이터 보호

| 본서 장 | 주로 근거한 원서·장 | 원서에서 가져온 핵심 | 본서가 보강한 것 |
|---|---|---|---|
| **12장** 데이터 자산 식별·분류·태깅 | PCS1·2 3장 (주, `Asset Management Pipeline`) · PCS1·2 2장 · CB 9장 | **자산 관리 파이프라인의 4가지 누수**(procurement·processing·tooling·findings), `Tagging Cloud Assets`, "중요한 데이터를 식별할 때 그 데이터를 읽거나 쓰는 것까지 보라"는 경고, 태그 적용 자동 검증 | AWS 태깅 전략 설계(태그 정책·필수 태그), 💡 **Macie가 재설계되어 S3 전용이 됨**, 데이터 보존·파기 정책 |
| **13장** 암호화의 기초와 KMS | CB 4장 (주, KMS 레시피 6개) · PCS1·2 2장 | `Creating keys in KMS`, `Rotating keys in KMS`, `Granting permissions programmatically with grants`, `Using key policies with conditional keys`, `Sharing customer-managed keys across accounts`; 2판 2장의 `Encryption`(저장·전송·사용 중) | 💡 **CMK → KMS key 용어 변경**, 💡 다중 리전 키, 💡 순환 주기 설정 가능, 암호화 컨텍스트, 키 정책 = 최종 관문, KMS 운영 함정 |
| **14장** 고급 키 관리: CloudHSM·외부 키 | CB 4장 (주) · PCS2 2장 | `Creating a CloudHSM cluster`, `Initializing and activating a CloudHSM cluster`, `Using keys with external key material`; 2판 2장의 **양자내성 암호**와 전송 중 암호화 알고리즘 위험 | 💡 FIPS 검증 수준·Client SDK 5 전환·RSA 키 길이 변경, 💡 **커스텀 키 스토어는 CB에 거의 없음**, 💡 NIST 양자내성 표준 확정, 💡 **컨피덴셜 컴퓨팅은 2판도 개념 수준만** |
| **15장** S3 보안 완전 정복 | CB 2장 (주, 장 전체 8 레시피) · PCS2 2장·3장 | ACL·버킷 정책·크로스 계정·사전 서명 URL·암호화 3종·버전 관리·CRR(동일 계정/크로스 계정) 전 레시피 | 💡 **이 장 전체가 가장 크게 갱신된 장**: 퍼블릭 액세스 차단 기본 활성화, ACL 기본 비활성화(Object Ownership), 신규 객체 SSE-S3 기본 적용, S3 버킷 키, 객체 잠금, **20항목 점검표** |
| **16장** DB·스토리지 암호화 | PCS1·2 2장·3장 (주, `Storage Assets`) · CB 6장·10장 | CB 6장 `Using KMS to encrypt data in EBS`, CB 10장 `Protecting S3 Glacier vaults with Vault Lock`, 2·3장의 스토리지 자산 분류와 암호화 | 💡 리전 단위 EBS 기본 암호화(원서 이후), RDS/Aurora·DynamoDB·EFS/FSx 접근 지점, 💡 **DynamoDB 리소스 기반 정책**, 💡 스냅샷·AMI 퍼블릭 차단 설정, 토큰화 vs 암호화 |
| **17장** 백업·복원력·랜섬웨어 | PCS2 7장 (주, `Recovery`·백업 경고 박스) · PCS1·2 2장 | **"백업이 운영 데이터와 같은 방식으로 접근 가능하다면 함께 암호화·파괴된다"** 는 사전 준비 경고, `Redeploying IT Systems` | **장 전체가 큰 보강입니다.** 원서에 AWS Backup 서술이 없습니다. 3-2-1의 클라우드 버전, 💡 **논리적 에어갭 볼트**, 백업 계정 분리, 💡 **복원 테스트 기능**, 랜섬웨어 시나리오 |

### 4부 — 네트워크·컴퓨트 아키텍처

| 본서 장 | 주로 근거한 원서·장 | 원서에서 가져온 핵심 | 본서가 보강한 것 |
|---|---|---|---|
| **18장** VPC 설계의 원칙 | PCS1·2 6장 (주) · CB 5장 | `Differences from Traditional IT`, `Virtual Private Clouds`, `Network Address Translation`, `IPv6`, `DMZs`, `Proxies`, **RFC 1918 사설 주소 권장**, **"대부분의 클라우드에서는 경계를 만드는 것이 더 이상 비싸지 않다"**; CB 5장 `Creating a VPC`·`Creating subnets`·`Configuring an internet gateway and a route table`·`Setting up and configuring NAT gateways` | CANON 3티어 서브넷 설계(6개 서브넷), CIDR 계획, **"프라이빗인 줄 알았던 서브넷" 사고 시나리오**, 💡 **프록시가 서비스가 되었다**(Network Firewall·Route 53 Resolver) |
| **19장** 트래픽 통제 | PCS1·2 6장 (주, `Firewalls and Network Segmentation`·`Egress Filtering`) · CB 5장·6장 | 허용목록/차단목록, 세그멘테이션, **이그레스 필터링에서 tcp/443만 열고 목적지를 제한하지 않는 함정**, CB 5장 `Working with NACLs`, CB 6장 `Creating and configuring security groups` | 상태 저장/비저장 비교표, **SG 참조 체인 설계 패턴**(CIDR 대신 SG 참조), 절대 하면 안 되는 규칙, 💡 **AWS Network Firewall은 원서 이후 출시**, 마이크로세그멘테이션 |
| **20장** 프라이빗 연결 | CB 5장 (주, `Using a VPC gateway endpoint to connect to S3`) · PCS2 6장 | 게이트웨이 엔드포인트 레시피, 네트워크 통제의 목적 | 💡 **인터페이스 엔드포인트 지원 서비스가 폭증**(원서 시점엔 소수), **엔드포인트 정책으로 데이터 유출 차단**, 완전 격리 서브넷, 💡 **Route 53 DNS Firewall의 DNS 터널링 탐지** |
| **21장** 하이브리드 연결과 경계 | PCS1·2 6장 (주, `Allowing Administrative Access`) · CB 5장 | 관리 접근을 어떻게 허용할 것인가, 배스천·VPN의 조건, 2판의 Run Command 언급 | 💡 **Session Manager 전체가 보강**(원서는 배스천/VPN 서술 유지), Transit Gateway 아키텍처, VPC 피어링의 한계, 💡 **피어링 넘어 SG 참조 지원**, 💡 **배스천이 여전히 정답인 경우** |
| **22장** 컴퓨트(EC2) 보안 | CB 6장 (주) · PCS2 5장·3장·6장·7장 | CB 6장 `Launching an EC2 instance into a VPC`·`Using our own private and public keys with EC2`·`Using EC2 user data to launch an instance with a web server`·`Setting up and configuring NAT instances`; CB 10장 `Creating an AMI instead of using EC2 user data`; 2판 5장의 OS 취약점·패치 논지 | 💡 **EC2 기본값 강화**(IMDSv2 기본, 퍼블릭 IP 기본 비활성, 허용 AMI 설정), EC2 Image Builder 파이프라인, 패치 관리(Patch Manager), 불변 인프라 전환 |
| **23장** 웹 계층 보안 | CB 7장 (주, 장 전체) · PCS1·2 6장 | CB 7장 전 레시피(HTTPS 활성화·ACM·CLB·대상 그룹·ALB TLS 종료·NLB TLS 종료·CloudFront+S3·WAF); 2판 6장 `Encryption in Motion`, `Network Defense Tools`, 1판 6장 `Web Application Firewalls and RASP`·`Anti-DDoS` | 💡 **OAI → OAC 대체**, 💡 CLB는 이전 세대, 💡 ALB mTLS, 💡 CloudFront VPC 오리진, **TLS 종료 위치 결정 기준**, TLS 정책·암호 스위트, **WAF Count 모드 도입 절차**, Firewall Manager |
| **24장** 컨테이너와 서버리스 | PCS2 3장·5장·6장·7장 (개념만) | 컨테이너·서버리스를 **자산 유형**으로 분류한 서술, 불변 컨테이너 정의, 컨테이너 스캐너, 마이크로서비스가 변경을 분리한다는 관점 | 💡 **장 전체가 원서 범위 밖 보강입니다.** 4C 모델, ECR 이미지 보안, ECS 태스크 역할, EKS IRSA·Pod Security, 런타임 보호, Lambda 권한·환경 변수, API Gateway 인증, 이벤트 기반 신뢰 경계 |

### 5부 — 취약점·공급망·파이프라인

| 본서 장 | 주로 근거한 원서·장 | 원서에서 가져온 핵심 | 본서가 보강한 것 |
|---|---|---|---|
| **25장** 취약점 관리 체계 | PCS1·2 5장 (주, 장 전체) | `Vulnerable Areas` 7계층(데이터 접근·애플리케이션·미들웨어·OS·네트워크·가상화 인프라·물리 인프라), 전통적 6단계 프로세스, `Risk Management Processes`, `Vulnerability Management Metrics` 6종, **"취약점 관리와 패치 관리는 다르다"**, **"통계적으로 사람들은 통계에 형편없다"** | 💡 **CVSS v4.0**, 💡 **KEV·EPSS**(원서 5장에 없음), AWS 서비스별 7계층 매핑, 지표의 함정을 AWS 문맥으로 |
| **26장** 스캐닝 도구와 AWS 서비스 | PCS1·2 5장 (주, `Finding and Fixing Vulnerabilities` 도구 목록) · CB 9장·10장 | DAST/SAST/SCA/IAST/RASP 정의, 에이전트/에이전트리스 스캐너, `Penetration Tests`(범위·정보 제공 원칙·릴리스 주기 후반의 문제), `User Reports`(제보와 갈취의 경계), **1·2판 모두 Amazon Inspector를 명시적으로 거명**; CB 9장 `Setting up and using Amazon Inspector`·`Creating a custom Inspector template`, CB 10장 `Using AWS Trusted Advisor for recommendations` | 💡 **Inspector Classic ≠ 현행 Inspector**(가장 큰 갱신), 💡 CWPP·CNAPP·CSPM·CIEM 용어 정리, 💡 에이전트리스 EC2 스캔, 💡 security.txt, 💡 **Trusted Advisor API와 플랜별 가시성 변화** |
| **27장** 소프트웨어 공급망 보안 | PCS2 5장 (주, **2판 신규 주제**) · PCS2 3장·6장 | **SBOM**과 그 필요성(**"미국 연방정부를 포함한 일부 조직이 구매 제품에 SBOM을 요구한다"**), 빌드·배포 환경 보호, **"공급망 공격이 증가하고 있다"** | 💡 **구현은 전부 보강**: SLSA 수준, CodeArtifact, 💡 **Inspector의 SBOM 내보내기**, 아티팩트 서명·검증, CI/CD가 최고 권한을 갖는 문제 |
| **28장** IaC 보안과 변경 관리 | PCS1·2 5장 (주, `Change Management`) | **"가장 단순한 형태에서 변경 관리는 변경이 승인되었는지 확인하는 것"**, 변경 통제 위원회에 보안 실무자를 포함하라는 권고, **"보안 수정과 함께 새 코드를 운영에 밀어 넣는 일"** 의 양면성 | 💡 **IaC 구현 전체가 보강**: CloudFormation Guard, Terraform 플랜 검사, 배포 전 정책 게이트, 드리프트 탐지, 환경 분리 |

### 6부 — 탐지·대응·복구

| 본서 장 | 주로 근거한 원서·장 | 원서에서 가져온 핵심 | 본서가 보강한 것 |
|---|---|---|---|
| **29장** 로깅 아키텍처 | CB 8장 (주) · PCS1·2 7장 | CB 8장 `Creating a trail in CloudTrail`·`Reading and filtering logs in CloudTrail`·`Cross-account CloudTrail logging`·`Creating a CloudWatch log group`·`Setting up and using AWS Config`; CB 5장 `Configuring and using VPC flow logs`; 2판 7장 `What to Watch`(특권 사용자 접근·방어 도구 로그·클라우드 서비스 로그) 와 `Aggregation and Retention` | 💡 **조직 트레일의 위임 관리자**(원서는 관리 계정 전용), 💡 **혼동된 대리인 방어 조건 필수**, 💡 CloudWatch Logs 로그 클래스, 로그 무결성 검증, 보존 기간 결정 기준, 중앙 로그 계정 아키텍처 |
| **30장** 모니터링·알람·분석 | PCS1·2 7장 (주, `How to Watch`) · CB 8장 | `Parsing Logs`, `Searching and Correlation`, `Alerting and Automated Response`(**"알람은 발사 후 잊어버리는 활동이어서는 안 된다"**), `Security Information and Event Managers`, `Threat Hunting`; CB 8장 `Creating an SNS topic`·`Working with CloudWatch alarms and metrics`·`Creating a dashboard`·`Working with CloudWatch events`·`Using Athena to query CloudTrail logs in S3` | 💡 **CloudWatch Events → EventBridge**, 💡 CloudTrail Lake, 💡 **Security Lake와 OCSF**(원서 3권에 없음), **반드시 설정할 보안 알람 15가지**, 파티션 프로젝션 + 사고 조사 쿼리 8개, 알람 피로 |
| **31장** 위협 탐지 서비스 | CB 9장·10장 (주) · CB 8장 · PCS2 7장 | CB 9장 `Setting up and using Amazon GuardDuty`·`Aggregating findings from multiple accounts in GuardDuty`·`Setting up and using Amazon Macie`; CB 10장 `Setting up and using AWS Security Hub`; CB 8장 `Integrating CloudWatch and CloudTrail`; 2판 7장 `Logs from Defensive Tooling` | 💡 **초대 방식 → 위임 관리자**, 💡 GuardDuty 데이터 소스·보호 플랜 확장, 💡 **Critical 심각도 추가**, 💡 Macie 재설계, 💡 **Detective는 원서 이후 출시**, 💡 Security Hub 표준이 CIS 하나에서 다수로 |
| **32장** 사고 대응 준비 | PCS2 7장 (주, `Preparing for an Incident`) | `Team`(**주·예비 기술 리더**), `Plans`(우선순위 결정·조직 전체 지침·제공자가 약속한 것), `Tools`(**검증된 통신 시스템**, 점프백의 클라우드 대응물, **"빈 계정은 소유 비용이 없다"**), 사전 승인 예산, 테이블톱 훈련 권고, `Example Metrics` | RACI 표, **플레이북 표준 구조 9단**(→ 부록 C), 브레이크 글래스 절차, 대응 지표(MTTD·MTTA·MTTC·MTTR)의 AWS 측정 방법 |
| **33장** 사고 대응 실행 | PCS1·2 7장 (주, `Responding to an Incident`) | `Cyber Kill Chains and MITRE ATT&CK`(2판 사이드바), `The OODA Loop`(**"행동한 뒤에는 루프가 다시 시작된다"**), `Blocking Unauthorized Access`, `Stopping Data Exfiltration and Command and Control`, 분류(triage) 우선 지침 | 💡 **ATT&CK Enterprise 11개 전술 전체**, AWS에서의 초동 조치 명령(정책 부착·키 비활성화·SG 격리), 💡 **AWS의 노출 키 자동 탐지**, 💡 최대 절전으로 메모리 보존, 이해관계자 커뮤니케이션 |
| **34장** 클라우드 포렌식과 복구 | PCS1·2 7장 (주, `Cloud Forensics`·`Recovery`) | **"클라우드 포렌식은 CSI 텔레비전 쇼와 다르다"**, **"시스템을 청소하려 시도하는 것은 매우 위험하다"**, `Redeploying IT Systems`, `Notifications`, `Lessons Learned`, `Understanding the Auditing Infrastructure`, **NTP로 시각을 맞추라는 강조** | 💡 **EBS direct API로 스냅샷 직접 읽기**, 💡 `SendDiagnosticInterrupt`, 💡 **GuardDuty Malware Protection**, 증거 보전 절차(스냅샷 해시·태깅·계정 격리), 격리 분석 환경 |
| **35장** 대응 자동화 (SOAR) | PCS1·2 7장 (주, `Alerting and Automated Response`) · CB 8장·10장 | **"자동 대응은 원칙적으로 좋게 들리지만 비즈니스를 마비시킬 잠재력이 실재한다"**, Config가 자동 교정을 수행할 수 있다는 서술과 그에 붙은 경고 | 💡 **구현 전체가 보강**: EventBridge + Lambda 3패턴(퍼블릭 S3 차단·노출 키 비활성화·SG 되돌리기), 공유 안전장치 모듈, DLQ·재시도, Config 자동 교정 구성, Security Hub 사용자 지정 작업 |

### 7부 — 멀티 계정 거버넌스와 규모화

| 본서 장 | 주로 근거한 원서·장 | 원서에서 가져온 핵심 | 본서가 보강한 것 |
|---|---|---|---|
| **36장** 멀티 계정 아키텍처 | CB 1장·10장 (주) | CB 1장 `Creating a master account for AWS Organizations`·`Creating a new account under an AWS Organization`·`Switching roles with AWS Organizations`(**"한 번 만든 관리 계정은 변경할 수 없다"**, **"SCP는 접근을 거부할 수만 있고 허용할 수는 없다"**, 자동 생성 역할 이름 파라미터의 성질); CB 10장 `Setting up and using AWS Resource Access Manager`(조직 내 공유 활성화의 의미) | 💡 **master account → management account 용어 변경**, 💡 신뢰할 수 있는 액세스·위임 관리자 목록 확대, 💡 계정 폐쇄 API, 권장 OU 구조, 필수 코어 계정 5종, **관리 계정에서 워크로드를 돌리지 마라**, 공유 VPC 패턴 |
| **37장** 가드레일 | CB 1장·10장 (일부) · PCS2 여러 장 | SCP의 성질(거부만 가능), 권한 경계와의 차이; CB 10장의 "추가 서비스" 관점 | 💡 **장의 대부분이 보강입니다.** SCP 설계 원칙, **반드시 넣을 SCP 10가지**, SCP의 함정(자기 무력화 경로), 예방/탐지/대응 가드레일 3분류, 💡 **Control Tower는 원서 범위 밖**, 💡 **적합성 팩은 원서에 없음**, 💡 **RCP**, 💡 **선언적 정책**, 신규 계정 베이스라인 StackSet |
| **38장** 컴플라이언스와 감사 | CB 10장 (주, `Using AWS Artifact for compliance reports`) · PCS1·2 2장·1장 | Artifact 콘솔 절차, 당시 이용 가능 보고서 목록(APRA CPG 234 등), 규제 요구사항을 데이터 분류와 연결하는 관점 | 💡 **Artifact CLI API**(원서 시점엔 콘솔 전용), 💡 **Audit Manager는 원서 3권에 없음**, 프레임워크별 구현 가이드, 💡 **국내 규제는 원서 범위 밖**, 감사 대응 실무, 💡 **데이터 주권·리전 선택도 원서 범위 밖** |
| **39장** 보안 운영 성숙도와 지표 | PCS1·2 5장·7장·1장 (주) · CB 10장 | `Vulnerability Management Metrics`, `Example Metrics`(7장), **"지표는 유용하지만 위험하다"**, **"어떤 팀은 본래 더 어렵다"**(팀 간 비교의 함정), **"가장 큰 효과를 내는 것부터"**, 리스크 4대응 | 💡 **5단계 성숙도 모델은 원서에 없음**(명시), 경영진 보고 지표, 보안 챔피언 조직, 비용과 보안의 균형, 💡 **Well-Architected 보안 기둥 7원칙 ↔ 이 책 매핑** |
| **40장** 레퍼런스 아키텍처 3종 | PCS1·2 1장·2장·6장·7장 (원칙 근거) · CB 1장 | 원칙·우선순위·예제 애플리케이션 방법론 | 💡 **아키텍처 3종은 원서에 없는 이 책의 종합입니다.** 단일 계정 최소 통제 / 3~10계정 랜딩 존 / 완전 격리형, 마이그레이션 로드맵, 비용·복잡도·리스크 비교표, 진단 체크리스트 |

**F.2 합계: 41개 장 전부.**

---

## F.3 원서 → 본서 매핑표 (역방향)

원서 **24개 장**(Cookbook 10 + PCS 1판 7 + PCS 2판 7) 전부에 대해, 그 내용이 이 책 어디로 갔는지 밝힙니다.

### *AWS Security Cookbook* (2020) — 10개 장

| 원서 장 | 원서 장 제목 | 본서 대응 절 | 비고 |
|---|---|---|---|
| 1 | Managing AWS Accounts with IAM and Organizations | 5.1~5.7 · 6.1~6.6 · 7.1~7.8 · 8.5 · 36.2·36.3·36.7 · 37.1 | 레시피 5개가 **IAM 3개 장과 Organizations 1개 장**으로 나뉘었습니다. `Creating a billing alarm` 은 5.4로 독립 |
| 2 | Securing Data on S3 with Policies and Techniques | **15장 전체**(15.1~15.12) · 16.7 | 8개 레시피 전부 대응. 💡 **ACL·크로스 계정·CRR 레시피는 현재 권장 방식이 달라 갱신 폭이 가장 큼** |
| 3 | User Pools and Identity Pools with Cognito | **10장 전체**(10.1~10.8) · 9.3 | 7개 레시피 전부 대응. `Federated identity with Cognito user pools` 의 Amazon developer portal 설정 절차는 일반화 |
| 4 | Key Management with KMS and CloudHSM | **13장 전체** · **14장 전체**(14.2·14.3·14.5) | 8개 레시피 중 KMS 6개 → 13장, CloudHSM 2개 + 외부 키 1개 → 14장. 💡 14.4(커스텀 키 스토어)는 원서가 한 번 언급하는 데 그침 |
| 5 | Network Security with VPC | **18장 전체** · 19.4 · 20.1 · 29.5 · 21장 일부 | 7개 레시피: VPC·서브넷·IGW·NAT → 18장, NACL → 19.4, 게이트웨이 엔드포인트 → 20.1, **플로우 로그 → 29.5**(로깅 장으로 이동) |
| 6 | Working with EC2 Instances | **22장 전체** · 19.2 · 18.6 · 11.2 · 16.1 · 8.2 | 8개 레시피: 보안 그룹 → 19.2, NAT 인스턴스 → 18.6, Parameter Store → 11.2, EBS 암호화 → 16.1, IAM 역할 → 8.2·22.3 로 **주제별 재배치** |
| 7 | Web Security Using ELBs, CloudFront, and WAF | **23장 전체**(23.1~23.9) | 8개 레시피 전부 대응. 💡 `Creating a classic load balancer` 는 23.3에서 **이전 세대로만** 다룸 |
| 8 | Monitoring with CloudWatch, CloudTrail, and Config | **29장** · **30장** · 31.6 · 35.3 | 11개 레시피: SNS·알람·대시보드·CloudWatch Events·Athena → 30장, CloudTrail·로그 그룹·크로스 계정·Config → 29장, CloudWatch+CloudTrail 통합 → 31.6 |
| 9 | Compliance with GuardDuty, Macie, and Inspector | 31.1·31.2·31.3 · 26.3 · 12.4 | 5개 레시피. 💡 **Inspector 2개 레시피는 Classic 기준이라 26.3에서 현행 Inspector로 전면 교체**, Macie는 12.4(데이터 발견)와 31.3(결과 처리)으로 분할 |
| 10 | Additional Services and Practices for AWS Security | 31.5 · 9.2 · 36.8 · 16.5 · 11.3 · 22.5 · 26.7 · 38.1 | 9개 레시피가 **여덟 개 장으로 흩어졌습니다**. ⚠️ `Using security products from AWS Marketplace` 만 대응 절이 없습니다(아래 참조) |

### *Practical Cloud Security* 1st ed. (2019) — 7개 장

| 원서 장 | 원서 장 제목 | 본서 대응 절 | 비고 |
|---|---|---|---|
| 1 | Principles and Concepts | **1장**(1.1·1.2·1.4·1.6) · **2장** · **3장**(3.1·3.2) · 4.1 · 39.1·39.4 | 1판에는 `Zero Trust` 절이 없어 **1.3은 2판 단독 근거**입니다 |
| 2 | Data Asset Management and Protection | 4.2·4.3 · 12.1~12.3 · 13.1·13.2 · 16.6 | `Tokenization` → 16.6, `Encryption` → 13장 |
| 3 | Cloud Asset Management and Protection | 12.1·12.3·12.5 · 22.x · 16.x · 24.1 | **4가지 누수**(12.5)가 이 장의 핵심 기여 |
| 4 | Identity and Access Management | **6장** · **8장** · **9장** · 10.1 · **11장**(`Secrets Management`) | 이 책 **2부 전체**의 뼈대 |
| 5 | Vulnerability Management | **25장** · **26장** · 28.5 · 39.2 | 1판 `Cloud Provider Security Management Tools` 는 2판에서 **CWPP로 교체**됨(26.1 💡) |
| 6 | Network Security | **18장** · **19장** · 20.x · **21장** · 23.5·23.8~23.10 | 1판의 `Whitelists and Blacklists` 는 2판 `Allowlists and Denylists` 로 변경 — 본서는 **허용목록/차단목록** 표기 |
| 7 | Detecting, Responding to, and Recovering from Security Incidents | **29장~35장**(6부 전체) | 1판 `Cyber Kill Chains` 가 2판에서 `Cyber Kill Chains and MITRE ATT&CK` 로 확장 → 33.1 |

### *Practical Cloud Security* 2nd ed. (2023) — 7개 장 + 부록

| 원서 장 | 원서 장 제목 | 본서 대응 절 | 1판 대비 추가분의 반영 |
|---|---|---|---|
| 1 | Principles and Concepts | **1장 전체** · **2장 전체** · **3장** · 4.1 · 40.x | `Zero Trust` 절 신설 → **1.3** |
| 2 | Data Asset Management and Protection | 4.2·4.3 · **12장** · 13.1·13.2 · 16.6 · 17.1 | 양자내성 암호 서술 → **14.6** |
| 3 | Cloud Asset Management and Protection | **12장** · 22.x · 16.x · 24.1·24.3·24.6 · 27.1 | 컨테이너 자산 서술 확대 → 24장의 개념 근거 |
| 4 | Identity and Access Management | **6장~11장**(2부 전체) · 24.6 | 패스워드리스·패스키 → **9.4** / 워크로드 아이덴티티 검증 → **8.8** |
| 5 | Vulnerability Management | **25장** · **26장** · **27장** · **28장**(5부 전체) · 22.6 · 39.2 | SBOM·공급망 → **27장 전체** / CWPP → **26.1** |
| 6 | Network Security | **18장~21장** · 23.5~23.11 · 19.7 | `Zero Trust Networking` → **19.7** / `Network Defense Tools` 갱신 → **19.5·23.8~23.10** |
| 7 | Detecting, Responding to, and Recovering from Security Incidents | **29장~35장**(6부 전체) · 17.5 · 32.x | MITRE ATT&CK → **33.1** / PAM(`Session Recording Tools`) → **9.5·32.4** |
| 부록 | Appendix. Exercise Solutions | — | **대응 절 없음.** 아래 참조 |

### ⚠️ 본서에서 다루지 않은 원서 내용 — 솔직한 목록

| # | 원서 위치 | 내용 | 다루지 않은 사유 |
|---|---|---|---|
| 1 | CB 10장 | `Using security products from AWS Marketplace` | **특정 벤더 제품 목록은 가장 빨리 낡는 정보**입니다. 이 책의 기조는 AWS 네이티브 통제를 먼저 세우고 공백을 서드파티로 메우는 것이므로, 26.1의 「도구 지형도」에서 **범주**로만 다루고 제품명은 쓰지 않았습니다 |
| 2 | CB 3장 | `Federated identity with Cognito user pools` 의 Amazon developer portal 화면 절차 | 콘솔 화면 중심이고 특정 소셜 제공자 한 곳에 한정됩니다. 10.6에서 **소셜/기업 IdP 페더레이션 일반**으로 재구성했고, 💡로 **지원 제공자 목록이 바뀌었음**을 명시했습니다 |
| 3 | CB 7장 | `Creating a classic load balancer` | CLB는 콘솔에서 **이전 세대**로 표시되며 신규 구성 권장 대상이 아닙니다. 23.3에서 💡로 그 사실만 밝히고 실습은 넣지 않았습니다 |
| 4 | CB 9장 | `Creating a custom Inspector template` | Inspector Classic의 기능입니다. 현행 Inspector에는 템플릿 개념이 없고 **억제 규칙(필터)** 이 그 자리를 대신하므로, 26.3에서 계승 관계를 설명하고 필터로 대체했습니다 |
| 5 | PCS 1·2판 전반 | Azure·GCP·IBM Cloud 등 **다른 제공자의 대응 서비스** 서술 | 이 책은 **AWS 전용**입니다. 다만 원서의 클라우드 중립적 개념은 그대로 살리고 AWS 구현으로 번역했습니다(WRITING_GUIDE의 인용 규칙 5번) |
| 6 | PCS 1·2판 5장 | `Example Tools for Vulnerability and Configuration Management` 의 제품 목록 | 위 1번과 같은 이유입니다. 26.1에서 **범주 지형도**로 재구성했고, 원서가 **Amazon Inspector를 명시적으로 거명한 대목만** 인용했습니다 |
| 7 | PCS 2판 각 장 끝 | `Exercises` 와 권말 `Appendix. Exercise Solutions` | 원서 문제의 정답을 옮기는 것은 인용 범위를 넘습니다. 이 책은 대신 **자체 체계**를 씁니다 — 🧪 실습 75개(부록 D), 📋 체크리스트, 부록 A의 100항목, 부록 H의 시험 범위 매핑 |
| 8 | PCS 1판 6장 | `Whitelists and Blacklists` 라는 **용어 자체** | 2판이 `Allowlists and Denylists` 로 교체했습니다. 본서는 2판을 따라 **허용목록/차단목록**으로 통일했고, 1판 용어는 쓰지 않았습니다 |
| 9 | PCS 1판 5장 | `Cloud Provider Security Management Tools` | 2판에서 `Cloud Workload Protection Platforms`(CWPP)로 교체된 항목입니다. 26.1에서 **2판 용어를 채택**하고 변화를 💡로 남겼습니다 |

---

## F.4 2판이 1판에 추가한 것과 본서의 반영 위치

*Practical Cloud Security* 2판 서문의 **「What's New in the Second Edition」** 은 1판 이후 클라우드 컴퓨팅·보안 업계의 변화를 반영했다고 밝히며 **8개 항목을 예시로 들고**, 이어서 **각 장 끝의 문제와 권말 정답**을 추가했다고 덧붙입니다. 아래는 그 항목을 원문 순서대로 옮기고 본서 반영 위치를 붙인 것입니다.

| # | 2판이 추가했다고 밝힌 것 | 본서 반영 위치 | 반영 방식 |
|---|---|---|---|
| 1 | **제로 트러스트** 원칙을 클라우드 환경 보호에 적용하는 정보 확대 | **1.3** 제로 트러스트 · **19.7** 마이크로세그멘테이션과 제로 트러스트 네트워킹 · **21.5** 관리 접근 설계 · **3.2** 말미 | 1판에는 `Zero Trust` 절이 없으므로, 1.3의 원서 근거는 **2판 단독**입니다. 2판 6장이 "클라우드 네트워크에서 제로 트러스트의 가장 중요한 부분"이라고 지목한 대목을 19.7의 출발점으로 삼았습니다 |
| 2 | **양자내성 암호 알고리즘** 등 암호화 기법의 발전 | **14.6** 양자내성 암호 대비 · **13.2** 암호화 3상태 | 2판 2장이 **전송 중 데이터 암호화 알고리즘이 가장 위험하다**고 짚은 대목이 14.6의 근거입니다. 💡 **NIST 표준 확정은 원서 이후 진행**이므로 별도 박스로 처리 |
| 3 | **패스워드리스 기술과 패스키** 등 인증 기법의 발전 | **9.4** 다중 인증(MFA)의 진화 · **6.4** 장기 액세스 키를 없애야 하는 이유 | 2판 4장의 FIDO2 서술 — **"FIDO U2F는 두 번째 요소일 뿐"** 이라는 구분 — 이 9.4의 축입니다. 💡 **AWS의 FIDO2·다중 MFA 지원**은 원서 이후 |
| 4 | **특권 접근 관리(PAM) 도구**의 활용 | **9.5** 특권 접근 관리(PAM) · **32.4** 브레이크 글래스 절차 · **21.5** 관리 접근 설계 | 2판 7장 `Session Recording Tools` 에서 **"특권 접근 관리 또는 특권 아이덴티티 관리"** 를 언급한 대목이 근거입니다. AWS 대응물(Identity Center 권한 세트 + Session Manager 세션 로깅)은 본서 보강 |
| 5 | **인간 아이덴티티에 더해 워크로드 아이덴티티의 검증** | **8.8** 워크로드 아이덴티티 검증 · **8.3** IMDS 보안 · **27.5** 아티팩트 서명과 검증 | 2판 4장의 SPIFFE 언급(**"현재로서는 널리 쓰이지 않지만 결국 그것이나 유사한 명세가…"**)이 8.8의 근거입니다. IMDSv2·IAM Roles Anywhere·GitHub OIDC는 💡 |
| 6 | **소프트웨어 공급망 보호**(클라우드의 빌드·배포 환경 포함)와 **SBOM을 통한 투명성** | **27장 전체** — 특히 **27.2** SBOM · **27.4** 빌드 환경 보호 | **27장이 존재하는 이유가 이 항목입니다.** 1판에는 대응 서술이 없습니다. 원서는 원칙만 제시하므로 SLSA·CodeArtifact·Inspector SBOM 내보내기는 💡 **원서 범위 밖 보강** |
| 7 | **주요 클라우드 제공자의 제품 변경**에 따른 갱신 | **F.5 전체** + 41개 장에 흩어진 💡 박스 **143개** | 2판조차 2023년 기준이므로, 본서는 2판 이후 변경까지 한 겹 더 갱신했습니다. 그 전량이 F.5에 정리되어 있습니다 |
| 8 | **오늘날의 방어 도구·기술 유형 예시** 갱신 | **26.1** 도구 지형도 · **26.2** 애플리케이션 보안 테스트 4종 · **19.5** Network Firewall · **30.7** SIEM | 2판이 신설한 `Cloud Workload Protection Platforms` 와 6장 `Network Defense Tools` 가 근거입니다. 💡 **CSPM·CIEM·CNAPP는 2판이 쓰지 않는 용어**임을 26.1에서 명시했습니다 |
| 9 | **각 장 끝의 문제와 연습, 권말 부록의 정답** | **채택하지 않음** | 대신 이 책의 자체 체계를 씁니다 — **🧪 실습 75개**(부록 D) · 📋 체크리스트 · **부록 A** 100항목 점검표 · **부록 H** 시험 범위 매핑. 원서 문제의 정답을 옮기는 것은 인용 범위를 넘습니다 |

> ⚠️ **1판/2판 인용 오귀속에 주의하십시오.** 위 표의 1~6번 항목은 **2판에만 있습니다.** 본문에서 이 주제들을 인용할 때 "원서에 따르면"이라고만 쓰면 1판을 읽은 독자가 찾을 수 없습니다. 본서는 이들을 전부 `📖 *Practical Cloud Security* 2판 N장` 으로 표기했습니다.

---

## F.5 원서 이후 변경된 것 — 본서가 갱신한 항목

본문의 💡 박스를 전수 수집해 주제별로 묶은 것입니다. **원서 3권은 2020년·2019년·2023년에 쓰였고, AWS는 그 사이에 기본값 자체를 여러 번 바꿨습니다.** 원서를 그대로 따라 하면 지금은 틀리거나 위험해지는 항목이 여기 있습니다.

| 💡 박스의 성격 | 개수 | 아래 어느 범주로 정리되었나 |
|---|---|---|
| 「원서 이후 변경 / 보충 / 추가」 | 97 | ①~⑤ |
| 「원서 범위 밖 (보강)」 | 22 | ⑥ |
| 그 밖의 보충 설명(용어 주의·출처 등) | 24 | 해당 절에서만 |
| **합계** | **143** | 41개 장 중 **39개 장**에 분포 (32장·35장은 0개) |

### ① 기본값이 반대로 뒤집힌 것 — 가장 위험한 범주

| 무엇이 바뀌었나 | 원서 시점 | 현재 | 본서 절 |
|---|---|---|---|
| **S3 퍼블릭 액세스 차단** | 버킷 생성 시 **꺼져 있음**. CB 2장은 이것을 끄고 퍼블릭 ACL을 붙이는 실습을 함 | **새 버킷은 기본으로 차단됨.** 계정 수준에서 켜는 것이 표준 | 2.3 · **15.2** · 15.3 |
| **S3 ACL** | 접근 통제의 1급 수단. CB 2장 첫 레시피가 ACL | **기본 비활성화**(Object Ownership = `BucketOwnerEnforced`). 신규 설계에서는 쓰지 않음 | **15.3** · 15.5 |
| **S3 기본 암호화** | 버킷마다 켜야 함. CB 2장은 **"기존 객체에는 영향이 없다"** 고 서술 | **모든 신규 객체에 SSE-S3가 항상 적용됨**(끌 수 없음) | 1.2 · 2.1 · **15.7** · 37.2 |
| **EBS 리전 기본 암호화** | 볼륨마다 지정. CB 6장 레시피는 개별 볼륨 기준 | **리전 단위 스위치 하나로 전 볼륨 강제 가능** | **16.1** |
| **EC2 IMDS** | IMDSv1(단순 GET). CB 6장·8장 레시피가 v1 전제 | **IMDSv2(세션 지향)가 기본**. v1은 명시적으로 꺼야 함 | 3.4 · **8.3** · 22.1 |
| **EC2 퍼블릭 IP 자동 할당·키 페어** | 퍼블릭 서브넷 + 키 페어 + SSH가 표준 실습 구성 | 퍼블릭 IP 기본 비활성, **키 페어 없이 Session Manager** 가 표준 | 21.5 · **21.6** · 22.1·22.2 |

### ② 서비스 이름이 바뀐 것 — 검색이 안 되는 범주

| 무엇이 바뀌었나 | 원서 시점 | 현재 | 본서 절 |
|---|---|---|---|
| **AWS SSO → IAM Identity Center** | CB 10장 레시피 제목이 `Setting up and using AWS SSO` | **IAM Identity Center**. CLI 네임스페이스는 `sso-admin`·`identitystore` | **9.2** |
| **master account → management account** | CB 1장 레시피 제목이 `Creating a master account for AWS Organizations` | **관리 계정(management account)** | **36.1·36.2** |
| **CMK → KMS key** | CB 4장 전체가 `customer master key (CMK)` 표기 | **KMS key** / 고객 관리형 키(customer managed key) | **13.3** |
| **CloudWatch Events → EventBridge** | CB 8장 `Working with CloudWatch events` | **Amazon EventBridge**(기능도 크게 확장) | **30.5** |
| **Azure Active Directory → Microsoft Entra ID** | PCS가 Azure AD로 표기 | **Microsoft Entra ID** | **9.3** |
| **OAI → OAC** | CB 7장 CloudFront 레시피가 **Origin Access Identity** 사용 | **Origin Access Control(OAC)**. OAI는 레거시 | **23.7** |
| **Inspector Classic → 현 Inspector** | CB 9장의 두 레시피는 **평가 템플릿·평가 대상·규칙 패키지** 모델 | **완전히 다른 서비스.** 상시 스캔, SSM 기반, ECR·Lambda 지원. 템플릿 개념 없음 | **26.3** · 12.4 |
| **Macie(구) → Macie(현)** | CB 9장·PCS의 Macie는 CloudTrail 사용자 행동 분석까지 포함 | **S3 민감 데이터 발견에 집중**하도록 재설계 | 4.4 · **12.4** · 31.3 |

### ③ 운영 모델이 바뀐 것

| 무엇이 바뀌었나 | 원서 시점 | 현재 | 본서 절 |
|---|---|---|---|
| **GuardDuty·Security Hub 멀티 계정** | **초대(invite) 방식** — 마스터가 멤버를 초대하고 멤버가 수락 | **조직 위임 관리자 + 자동 등록** | **31.2** · 31.5 · 36.2 |
| **조직 CloudTrail·Config 집계** | 관리 계정에서만 설정 가능 | **위임 관리자(로그 아카이브/보안 계정)** 에 위임 가능 | **29.2** · 29.8·29.9 |
| **KMS 키 순환 주기** | **365일 고정**, 끄고 켜는 것만 가능 | **주기 설정 가능 + 온디맨드 순환**(`rotate-key-on-demand`) | **13.6** |
| **Secrets Manager 순환** | 순환에 **항상 사용자 Lambda 필요** | 지원 DB는 **관리형 순환**(Lambda 없이) | **11.5** |
| **CloudHSM 클라이언트** | **Client SDK 3**(`cloudhsm_mgmt_util` 등) | **Client SDK 5**(도구·명령 체계가 다름). FIPS 검증 수준도 갱신 | **14.3** |
| **AWS Artifact 접근 경로** | **콘솔 전용** | **CLI/API 제공**(`artifact list-reports` 등) | **38.1** |
| **Trusted Advisor 가시성** | 플랜별 항목 차이가 크고 API는 `support` 만 | Basic·Developer에서도 일부 점검 제공, **`trustedadvisor` 네임스페이스 추가** | **26.7** |

### ④ 원서 이후 새로 생긴 것 — 원서에 존재하지 않는 서비스·기능

| 무엇이 생겼나 | 어떤 공백을 메우나 | 본서 절 |
|---|---|---|
| **리소스 제어 정책(RCP)** | SCP는 내 조직의 **주체**를 막지만, RCP는 내 조직의 **리소스**에 대한 외부 접근을 막음 | 7.2 · **37.1·37.3** |
| **선언적 정책(Declarative Policies)** | SCP가 "액션을 거부"하는 것과 달리 **서비스 구성의 최종 상태를 고정** | **37.9** |
| **AWS Network Firewall** | 원서 1·2판이 지적한 **IDS/IPS와 이그레스 도메인 필터링 공백** | **19.5** · 19.6 · 31.7 |
| **Amazon Detective** | GuardDuty 결과의 **원인 조사(그래프 분석)** | **31.4** |
| **Amazon Security Lake · OCSF** | PCS 7장 `Aggregation and Retention` 의 AWS 네이티브 구현 | **30.7** |
| **CloudTrail Lake** | Athena 테이블 없이 CloudTrail을 질의 | **30.6** |
| **AWS Control Tower** | 원서에 랜딩 존 개념 자체가 없음 | **37.5·37.6** |
| **AWS Config 적합성 팩** | 규칙을 묶어 조직 단위로 배포 | **37.7** |
| **AWS Audit Manager** | 프레임워크별 증거 자동 수집 | 4.4 · **38.2** |
| **AWS Backup 논리적 에어갭 볼트 · 복원 테스트** | PCS 7장이 요구한 **백업 격리**와 **복구 검증**의 구현 | **17.3** · 17.6 |
| **IAM Access Analyzer 미사용 액세스 · 커스텀 정책 검사** | 최소 권한을 **지표로 관리**할 수단 | **7.7** · 7.6 |
| **IAM Roles Anywhere · GitHub Actions OIDC** | 2판이 말한 **워크로드 아이덴티티 검증**의 AWS 구현 | **8.8** · 27.6 |
| **S3 Object Lock** | 원서의 Glacier Vault Lock을 대체하는 현행 불변 스토리지 | **15.9** · 16.5 |
| **다중 리전 KMS 키** | 리전 간 암호화 데이터 이동 | **13.3** |
| **GuardDuty Malware Protection** | PCS 7장 포렌식 절차의 스냅샷 단계 자동화 | **34.3** |
| **ALB mTLS · CloudFront VPC 오리진** | 2판 6장의 전송 중 암호화·오리진 보호 강화 | **23.5** · 23.7 |
| **DynamoDB 리소스 기반 정책 · 스냅샷/AMI 퍼블릭 차단** | 리소스 측 경계를 S3 수준으로 | **16.3** · 16.7 |

### ⑤ 표준·업계 용어가 바뀐 것

| 무엇이 바뀌었나 | 원서 시점 | 현재 | 본서 절 |
|---|---|---|---|
| **CVSS** | v3.x(temporal·environmental 메트릭) | **CVSS v4.0**(2023 공개) | **25.4** |
| **취약점 우선순위** | CVSS 점수 중심 | **KEV(실제 악용 목록) · EPSS(악용 확률)** 병용 — 원서 5장에 없음 | **25.4** |
| **스캐닝 도구 범주** | 1판 `Cloud Provider Security Management Tools` | 2판 **CWPP**. 그 밖의 CSPM·CIEM·CNAPP는 **2판도 쓰지 않는 시장 용어** | **26.1·26.6** |
| **허용/차단 목록 용어** | 1판 `Whitelists and Blacklists` | 2판 **`Allowlists and Denylists`** | 19.1 · 19.6 |
| **NIST 양자내성 표준** | 2판 집필 시점에는 **선정 진행 중** | **표준 확정** | **14.6** |
| **security.txt** | 원서에 없음 | 취약점 제보 창구를 기계가 읽을 수 있게 공표하는 사실상 표준 | **26.5** |

### ⑥ 본서가 "원서 범위 밖"으로 명시한 영역

원서에 **아예 없는 주제**입니다. 이 책이 원서를 확장한 부분이며, 본문에서 💡 **원서 범위 밖 보강**으로 표시했습니다.

| 영역 | 본서 위치 | 왜 원서에 없나 |
|---|---|---|
| **컨테이너·서버리스 구현** | **24장 전체**(24.1~24.8) | PCS는 자산 유형·스캐닝 대상으로만 다루고, Cookbook 목차에는 없음 |
| **IaC 보안** | **28장**(28.1~28.4·28.6) | PCS는 `Change Management` 로 원칙만 제시 |
| **공급망 구현** | 27.3·27.4·27.5 | PCS 2판이 **원칙**을 신설했으나 구현은 범위 밖 |
| **멀티 계정 거버넌스** | **37장 대부분** · 36.4·36.5·36.6 | PCS는 클라우드 중립이라 계정 경계 모델을 다루지 않음 |
| **레퍼런스 아키텍처** | **40장 전체** | 이 책의 종합 |
| **STRIDE** | 3.3 | 원서 3권 어디에도 이름으로 등장하지 않음 |
| **폭발 반경(blast radius)** | 1.4 | 개념은 원서 1장에 있으나 **이 표현 자체는 없음** |
| **보안 성숙도 5단계 모델** | 39.1 | 원서에 5단계 모델 없음 |
| **국내 규제 · 데이터 주권** | 4.3 · 38.4 · 38.6 | 원서 범위 밖 |
| **컨피덴셜 컴퓨팅 구현** | 14.7 | PCS 2판도 **개념 수준만** |
| **External ID · Confused Deputy** | 8.6 | **원서 3권 모두 다루지 않음** |

---

## F.6 심화 학습 경로 — "이 주제를 더 파고 싶다면"

이 책을 다 읽은 뒤 원서로 넘어갈 때의 안내입니다. **원서를 처음부터 끝까지 다시 읽을 필요는 없습니다.** 주제별로 어디를 볼지 아래를 참고하십시오.

| # | 더 파고 싶은 주제 | 읽을 원서 | 이 책의 어디를 먼저 확인하고 갈 것인가 |
|---|---|---|---|
| **1** | **원칙과 우선순위를 다시 세우고 싶다** — "무엇부터 해야 하는가"를 조직에 설명해야 할 때 | ***Practical Cloud Security* 2판 1장 + 서문 「Navigating This Book」** | 1장(5대 원칙)과 0.2(학습 경로)를 먼저 읽으십시오. 원서 서문이 4~6장을 **아이덴티티 → 취약점 → 네트워크** 우선순위로 배치했다고 밝힌 대목이 이 책 2부·5부·4부 배치의 근거입니다 |
| **2** | **공동 책임 모델의 경계를 더 정밀하게** — 관리형 서비스를 도입할 때마다 판단해야 할 때 | ***PCS* 2판 1장 `The Cloud Shared Responsibility Model` + 3장 + 5장** | 2장 전체, 특히 2.2(서비스 모델별 책임선)와 2.5(체크리스트). 2판 5장의 PaaS 설정 관리 처방 — **"각 컴포넌트에 대해 사용 가능한 보안 설정을 파악하라"** — 이 2.5의 기준입니다 |
| **3** | **위협 모델링을 팀에 정착시키고 싶다** | ***PCS* 1·2판 1장 `Threat Actors, Diagrams, and Trust Boundaries`** | 3.1~3.2. 원서의 **6단계 절차**와 **사용자 경험 디자인 기법을 빌려오라**는 권고가 핵심입니다. STRIDE(3.3)는 원서에 없으므로 별도 자료가 필요합니다 |
| **4** | **데이터 분류를 실제로 운영하고 싶다** — 태깅이 자꾸 무너질 때 | ***PCS* 1·2판 2장 + 3장 `Asset Management Pipeline`** | 12장 전체. 특히 12.5의 **4가지 누수**(procurement·processing·tooling·findings)가 원서의 가장 실무적인 기여입니다. 태깅이 무너지는 원인이 여기서 진단됩니다 |
| **5** | **IAM을 근본부터 다시** — 아이덴티티 라이프사이클과 재검증이 약할 때 | ***PCS* 2판 4장 전체** | 6~11장. 원서 4장은 `Request → Approve → Create/Delete/Grant/Revoke → Authentication → Authorization → Revalidate` 라이프사이클을 한 장에 담고 있습니다. 이 책 9.6이 그 요약이므로, 9.6에서 막히면 원서 4장으로 가십시오 |
| **6** | **AWS CLI로 손에 익히고 싶다** — 이 책의 실습이 부족하게 느껴질 때 | ***AWS Security Cookbook* 2·4·5·6·7장** | 부록 D의 랩 목록. ⚠️ **2020년 기준이므로 F.5의 ①·② 표를 먼저 읽고 가십시오.** 특히 2장(S3)과 9장(Inspector)은 그대로 따라 하면 현재와 어긋납니다. 4장(CloudHSM)과 7장(ELB·CloudFront·WAF)은 지금도 거의 그대로 유효합니다 |
| **7** | **취약점 관리 프로그램을 설계해야 한다** — 지표와 기한을 정해야 할 때 | ***PCS* 2판 5장 전체** | 25장·39.2. 원서 5장의 `Vulnerability Management Metrics` 6종과 그에 붙은 경고 — **"기한 초과를 피하려고 항목의 분류를 바꾸는 게임으로 변질된다"** — 이 25.6(지표의 함정)의 원천입니다 |
| **8** | **공급망과 SBOM** — 고객이나 규제가 SBOM을 요구하기 시작했을 때 | ***PCS* **2판** 5장** (1판에는 없습니다) | 27장. ⚠️ **1판을 보면 이 주제가 없습니다.** 반드시 2판을 보십시오. 원서는 원칙만 제시하므로, SLSA·서명·CodeArtifact 구현은 이 책 27.3~27.5로 돌아오십시오 |
| **9** | **사고 대응 체계를 처음 만든다** — 계획서와 팀 구성이 없을 때 | ***PCS* 2판 7장 `Preparing for an Incident` + `Responding to an Incident`** | 32~34장 + **부록 C(플레이북 템플릿 6종)**. 원서 7장이 규정한 **주·예비 리더**, **검증된 별도 통신 시스템**, **사전 승인 예산**, **빈 계정은 공짜다** 네 가지가 부록 C 골격의 근거입니다 |
| **10** | **네트워크 통제를 제로 트러스트 쪽으로 옮기고 싶다** | ***PCS* **2판** 6장 `Zero Trust Networking` + `Network Defense Tools` + `Egress Filtering`** | 19.6·19.7·21.5. ⚠️ **1판 6장에는 제로 트러스트 절이 없습니다.** 2판 6장이 지적한 이그레스 필터링의 함정 — **tcp/443만 열고 목적지를 제한하지 않는 방식** — 을 19.6에서 AWS 구현으로 풀었습니다 |

### 원서를 읽을 때의 주의 3가지

| # | 주의 | 이유 |
|---|---|---|
| ① | **1판과 2판을 섞지 마십시오.** | F.4의 6개 주제(제로 트러스트·양자내성·패스키·PAM·워크로드 아이덴티티·SBOM)는 **2판에만** 있습니다. 1판에서 찾으면 없습니다 |
| ② | ***Cookbook*의 CLI를 그대로 실행하기 전에 F.5 ①·②를 보십시오.** | 기본값이 뒤집힌 항목(S3 퍼블릭 액세스·ACL·IMDS)과 이름이 바뀐 서비스(AWS SSO·CMK·CloudWatch Events)는 **명령 자체가 실패하거나, 성공했는데 위험해집니다** |
| ③ | **원서에 없는 것을 원서 탓으로 돌리지 마십시오.** | 멀티 계정 거버넌스·컨테이너 구현·IaC는 **원서의 결함이 아니라 범위 설정**입니다. PCS는 클라우드 중립을 지키려 계정 모델을 다루지 않았고, Cookbook은 2020년에 그 주제가 지금만큼 성숙하지 않았습니다 |

---

## 이 부록의 요약

| 항목 | 값 |
|---|---|
| 근거 원서 | 3권 — *AWS Security Cookbook*(2020, 10장) · *Practical Cloud Security* 1판(2019, 7장) · 2판(2023, 7장 + 부록) |
| F.2 정방향 매핑 | **41개 장 전부** |
| F.3 역방향 매핑 | **원서 24개 장 전부**(10 + 7 + 7) + 2판 부록 |
| 본서에서 다루지 않은 원서 내용 | **9건** — 사유 명시 |
| 2판 신규 항목 반영 | **8개 항목 전부 반영** + 연습문제는 자체 체계로 대체 |
| 본서가 갱신한 항목(💡) | **143개 박스**(39개 장에 분포) — 6개 범주로 정리 |
| 이 책의 가장 큰 보강 영역 | **24장**(컨테이너·서버리스) · **27~28장**(공급망·IaC) · **36~37장**(멀티 계정 거버넌스) · **40장**(레퍼런스 아키텍처) |
| 원서를 읽을 때 가장 중요한 주의 | **1판과 2판을 섞지 말 것** · ***Cookbook*의 기본값은 이미 바뀌었다는 것** |
