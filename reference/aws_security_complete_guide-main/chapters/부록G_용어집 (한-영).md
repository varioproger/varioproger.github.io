---
title: "부록 G. 용어집 (한/영)"
---

# 부록 G. 용어집 (한/영)

이 책 본문 41개 장에 실제로 등장하는 용어만 모았습니다. **여기에 없는 용어는 본문에도 없습니다.** 각 항목의 `본문` 열은 그 용어가 **처음 제대로 설명되는 절**을 가리키며, 여러 절에 걸쳐 다뤄지는 용어는 핵심 절을 앞에 둡니다.

구성은 다음과 같습니다.

| 절 | 내용 | 찾는 방법 |
|---|---|---|
| **G.1** | 개념 용어 — 보안 원칙·프로세스·이론 | 한글 가나다순 |
| **G.2** | AWS 서비스·기능 용어 | 기능 영역순(아이덴티티 → 데이터 → 네트워크 → 컴퓨트 → 탐지 → 거버넌스) |
| **G.3** | 규제·표준 약어 | 알파벳순 |
| **G.4** | 혼동하기 쉬운 용어 쌍 | 본문 순서 |
| **G.5** | 영문 → 한글 역인덱스 | 알파벳순 |

> ⚠️ **AWS 서비스 명칭은 바뀝니다.** G.2의 마지막 열은 **원서(2019·2020·2023) 시점과 달라진 명칭**을 표기한 것입니다. 오래된 블로그나 강의 자료를 읽을 때 이 열이 번역표 역할을 합니다. 다만 이 열 자체도 시간이 지나면 낡으므로, 실제 구성 시점에는 AWS 콘솔과 공식 문서의 현재 표기를 따르십시오.

> ⚠️ **G.3의 규제 항목은 "무엇을 요구하는 제도인가"까지만 적었습니다.** 조문 번호·보관 기간·인증 등급 같은 구체 수치는 개정이 잦아 적지 않았습니다. 4.3과 38.4의 서술을 읽고, 실제 적용은 최신 고시 원문과 법무 검토를 거치십시오.

---

## G.1 개념 용어

보안 원칙·프로세스·이론 용어입니다. AWS 서비스 이름은 G.2에 있습니다.

| 한글 | 영문 | 약어 | 정의 | 본문 |
|---|---|---|---|---|
| 가드레일 | Guardrail | — | 조직 전체에 강제되는 통제. 행위를 사전에 막는 예방, 위반을 찾아내는 탐지, 자동으로 되돌리는 대응 세 종류로 나뉩니다 | 37.4 |
| 골든 AMI | Golden AMI | — | 패치·에이전트·설정을 미리 적용해 검증한 기준 머신 이미지. 인스턴스를 고치는 대신 이미지를 고쳐 재배포하는 운영의 출발점입니다 | 22.5 |
| 공급망 공격 | Supply Chain Attack | — | 최종 애플리케이션이 아니라 그것이 의존하는 라이브러리·빌드 도구·배포 경로를 침해해 하류 전체에 도달하는 공격 | 27.1 |
| 관리 연속성 | Chain of Custody | — | 증거가 수집된 시점부터 누가 언제 무엇을 했는지 끊김 없이 기록된 상태. 끊기면 증거의 법적·감사상 효력이 사라집니다 | 34.2 |
| 권한 상승 | Privilege Escalation | — | 낮은 권한으로 진입한 주체가 정책의 허점을 이용해 더 높은 권한을 획득하는 것. IAM에서는 정책 생성·역할 수임 권한이 주된 경로입니다 | 3.4, 7.5 |
| 기본 거부 | Deny by Default | — | 명시적으로 허용하지 않은 것은 모두 거부되는 설계. IAM 정책 평가와 보안 그룹이 모두 이 모델입니다 | 6.5, 7.3 |
| 내부자 위협 | Insider Threat | — | 정당한 접근 권한을 가진 사람에 의한 위협. 악의적 내부자와 실수하는 내부자를 모두 포함하며, 후자가 훨씬 흔합니다 | 3.1 |
| 다중 인증 | Multi-Factor Authentication | MFA | 지식·소유·생체 중 둘 이상의 서로 다른 요소를 요구하는 인증. 자격 증명 유출 한 건이 계정 침해로 이어지는 경로를 끊습니다 | 9.4, 5.2 |
| 데이터 경계 | Data Perimeter | — | "우리 아이덴티티가 우리 리소스에만, 우리 네트워크에서만 접근한다"를 조직 차원에서 강제하는 통제의 묶음 | 20.3, 15.1 |
| 데이터 분류 | Data Classification | — | 데이터를 민감도 등급으로 나누고 등급별 통제를 정의하는 체계. 모든 데이터 보호 통제의 출발점입니다 | 4.2 |
| 데이터 유출 | Data Exfiltration | — | 침해된 환경에서 데이터가 외부로 반출되는 단계. 이그레스 통제와 엔드포인트 정책이 이 단계를 겨냥합니다 | 20.3, 19.6 |
| 데이터 주권 | Data Sovereignty | — | 데이터가 물리적으로 위치한 국가의 법률이 그 데이터에 적용된다는 원칙. 리전 선택을 규제 문제로 만듭니다 | 38.6 |
| 데이터 흐름도 | Data Flow Diagram | DFD | 데이터가 어디서 어디로 흐르는지 그린 그림. 위협 모델링에서 신뢰 경계를 긋는 바탕입니다 | 3.2 |
| 드리프트 | Drift | — | IaC로 선언한 상태와 실제 인프라 상태가 벌어진 것. 콘솔 수동 변경이 주된 원인이며, 재배포 시 조용히 되돌아갑니다 | 28.4 |
| 리스크 등록부 | Risk Register | — | 식별된 리스크와 그 등급·처리 방침·승인자·재평가 일자를 기록한 문서. 감사에서 가장 먼저 요구되는 산출물입니다 | 4.1 |
| 마이크로세그멘테이션 | Microsegmentation | — | 네트워크를 가능한 작은 단위로 쪼개 각 단위 사이의 통신을 개별 허용하는 설계. 제로 트러스트의 네트워크 구현 | 19.7 |
| 명시적 거부(명시적 Deny) | Explicit Deny | — | 정책에 `Deny`로 명시된 거부. 어떤 허용보다 우선하며 뒤집을 수 없습니다 | 7.3 |
| 모의 침투 테스트 | Penetration Testing | 펜테스트 | 공격자 관점에서 실제로 침투를 시도해 취약점의 실제 악용 가능성을 확인하는 활동 | 26.4 |
| 무결성 | Integrity | — | 데이터가 허가 없이 변경되지 않았음. 로그에서는 다이제스트와 객체 잠금으로 보장합니다 | 29.3 |
| 부인 방지 | Non-repudiation | — | 행위자가 자신이 한 일을 부인할 수 없게 하는 성질. CloudTrail의 주체 기록이 이 역할을 합니다 | 3.3 |
| 불변 인프라 | Immutable Infrastructure | — | 배포된 리소스를 고치지 않고 새 것으로 교체하는 운영 방식. 드리프트와 장기 침투를 동시에 줄입니다 | 1.5, 22.8 |
| 브레이크글래스 | Break-glass | — | 평시에는 잠겨 있고 비상시에만 꺼내 쓰는 최고 권한 경로. 사용 즉시 알람이 울리고 사후 검토가 강제되어야 합니다 | 32.4 |
| 비난 없는 사후 검토 | Blameless Postmortem | — | 개인의 과실이 아니라 그 실수를 가능하게 한 시스템을 고치는 데 집중하는 사고 리뷰 방식 | 34.6 |
| 사이버 킬 체인 | Cyber Kill Chain | — | 공격을 정찰→무기화→전달→익스플로잇→설치→C2→목표 실행의 단계로 나눈 모델. 어느 단계에서 끊을지를 설계하게 해 줍니다 | 33.1 |
| 서버 측 요청 위조 | Server-Side Request Forgery | SSRF | 서버가 공격자가 지정한 URL로 요청을 보내게 만드는 취약점. 클라우드에서는 메타데이터 서비스 탈취로 직결됩니다 | 3.4, 8.3 |
| 성숙도 모델 | Maturity Model | — | 보안 운영 수준을 단계로 나눠 현재 위치와 다음 단계를 정하는 틀 | 39.1 |
| 소프트웨어 자재 명세서 | Software Bill of Materials | SBOM | 소프트웨어에 들어간 구성 요소의 목록. 신규 CVE 공개 시 "우리가 영향받는가"에 몇 분 안에 답하기 위한 자료입니다 | 27.2 |
| 신뢰 경계 | Trust Boundary | — | 신뢰 수준이 달라지는 선. 한쪽이 침해되면 그 안 전체가 침해된 것으로 가정해야 하는 단위입니다 | 3.2 |
| 심층 방어 | Defense in Depth | — | 하나의 통제가 뚫려도 다음 통제가 남도록 겹쳐 쌓는 설계 원칙 | 1.2 |
| 알람 피로 | Alert Fatigue | — | 알람이 너무 많아 아무도 보지 않게 되는 상태. 탐지 체계가 실질적으로 꺼진 것과 같습니다 | 30.9 |
| 암묵적 거부(암묵적 Deny) | Implicit Deny | — | 어떤 정책도 허용하지 않았기 때문에 생기는 거부. 명시적 거부와 달리 다른 정책의 허용으로 뒤집힙니다 | 7.3, 1.1 |
| 암호 민첩성 | Crypto-agility | — | 알고리즘·키 길이를 코드 수정 없이 교체할 수 있는 상태. 양자내성 전환의 실질적 준비물입니다 | 14.6 |
| 암호적 삭제 | Cryptographic Erasure | — | 데이터를 지우는 대신 그 데이터를 암호화한 키를 폐기해 복호화를 영구 불가능하게 만드는 파기 방식 | 12.6 |
| 암호화 컨텍스트 | Encryption Context | — | KMS 암·복호화 요청에 붙이는 키-값 쌍. 암호문에 묶여 무결성이 보장되고, 정책 조건으로 쓸 수 있습니다 | 13.9 |
| 양자내성 암호 | Post-Quantum Cryptography | PQC | 양자 컴퓨터로도 깨기 어렵다고 여겨지는 알고리즘군. 오늘 수집해 나중에 복호화하는 위협 때문에 데이터 수명이 긴 쪽부터 문제가 됩니다 | 14.6 |
| 에어갭 | Air Gap | — | 침해된 경로에서 물리적·논리적으로 닿을 수 없게 분리된 백업 사본 | 17.2 |
| 역할 기반 접근 제어 | Role-Based Access Control | RBAC | 역할에 권한을 부여하고 사용자를 역할에 배정하는 접근 통제 모델 | 8.7, 24.4 |
| 오탐 | False Positive | — | 실제로는 문제가 아닌데 탐지된 결과. 방치하면 알람 피로와 억제 규칙 남용으로 이어집니다 | 30.9, 25.6 |
| 왕관 보석 | Crown Jewels | — | 조직에서 잃으면 치명적인 소수의 데이터·시스템. 통제 투자를 우선 배치하는 대상입니다 | 4.2 |
| 위협 모델링 | Threat Modeling | — | 무엇을 지키고 누가 노리며 어떻게 막을지를 설계 단계에서 체계적으로 따지는 활동 | 3.3 |
| 위협 행위자 | Threat Actor | — | 위협을 실행하는 주체. 기회주의적 범죄자, 조직범죄, 핵티비스트, 내부자, 국가 지원 공격자 등으로 분류합니다 | 3.1 |
| 위협 헌팅 | Threat Hunting | — | 알람을 기다리지 않고 가설을 세워 로그를 능동적으로 뒤지는 활동 | 30.8 |
| 의존성 혼동 | Dependency Confusion | — | 내부 전용 패키지와 같은 이름을 공개 저장소에 올려 빌드가 공개 쪽을 당겨오게 만드는 공급망 공격 | 27.3 |
| 이그레스 필터링 | Egress Filtering | — | 나가는 트래픽을 통제하는 것. 침해 이후 C2 통신과 데이터 유출을 끊는 마지막 지점입니다 | 19.6 |
| 인가 | Authorization | AuthZ | 확인된 주체가 무엇을 할 수 있는지 판정하는 것 | 6.5 |
| 인증 | Authentication | AuthN | 주체가 자신이 주장하는 대상이 맞는지 확인하는 것 | 6.5 |
| 임시 자격 증명 | Temporary Credentials | — | 만료 시각이 있는 자격 증명. 유출되어도 시한이 있다는 점에서 장기 액세스 키와 근본적으로 다릅니다 | 6.3, 8.1 |
| 좌측 이동 | Shift-left | — | 보안 검증을 배포 이후가 아니라 개발·빌드 단계로 앞당기는 것 | 26.1, 28.3 |
| 제로 트러스트 | Zero Trust | — | 네트워크 위치를 신뢰의 근거로 삼지 않고, 요청마다 아이덴티티와 상태를 검증하는 모델 | 1.3 |
| 직무 분리 | Separation of Duties | SoD | 한 사람이 위험한 작업을 처음부터 끝까지 혼자 완결할 수 없게 권한을 나누는 것 | 6.5 |
| 최소 권한 | Least Privilege | — | 업무 수행에 필요한 최소한의 권한만 부여하는 원칙 | 1.1 |
| 출처 증명 | Provenance | — | 아티팩트가 어떤 소스에서 어떤 빌드로 만들어졌는지에 대한 검증 가능한 기록 | 27.5 |
| 컨피덴셜 컴퓨팅 | Confidential Computing | — | 사용 중(메모리 내) 데이터까지 격리해 호스트 운영자도 들여다볼 수 없게 하는 접근 | 14.7 |
| 크립토마이닝 | Cryptomining | — | 침해한 계정의 컴퓨트로 암호화폐를 채굴하는 공격. 클라우드 침해에서 가장 흔한 수익화 경로입니다 | 32.2 |
| 타이포스쿼팅 | Typosquatting | — | 유명 패키지와 비슷한 이름을 등록해 오타로 설치되게 만드는 공급망 공격 | 27.1 |
| 테이블톱 훈련 | Tabletop Exercise | — | 실제 시스템을 건드리지 않고 시나리오를 놓고 대응 절차를 말로 따라가 보는 훈련 | 32.5 |
| 토큰화 | Tokenization | — | 민감 값을 의미 없는 대체 값으로 바꾸고 원본은 별도 금고에 두는 방식. 암호화와 달리 시스템에서 원본이 사라집니다 | 16.6 |
| 평균 대응 시간 | Mean Time To Respond / Remediate | MTTR | 탐지 이후 조치 완료까지 걸린 평균 시간. 취약점 관리와 사고 대응에서 서로 다른 뜻으로 쓰입니다(G.4 참조) | 25.5, 32.6 |
| 평균 탐지 시간 | Mean Time To Detect | MTTD | 사건 발생부터 탐지까지 걸린 평균 시간 | 32.6 |
| 폭발 반경 | Blast Radius | — | 한 통제가 무너졌을 때 피해가 미치는 범위. 계정·VPC·키 경계로 이 범위를 자릅니다 | 1.4 |
| 하드닝 | Hardening | — | 필요 없는 구성 요소·포트·서비스를 모두 끄고 기본값을 좁히는 것 | 25.2 |
| 핵티비스트 | Hacktivist | — | 정치·사회적 목적으로 공격하는 행위자. 목표가 금전이 아니라 노출·훼손이라는 점이 대응을 다르게 만듭니다 | 3.1 |
| 혼동된 대리자 | Confused Deputy | — | 권한을 가진 중개자가 속아서 제3자를 대신해 권한을 행사하는 문제. 크로스 계정 역할의 External ID가 이 문제의 해법입니다 | 8.6 |
| 3-2-1 규칙 | 3-2-1 Rule | — | 사본 3개, 매체 2종, 1개는 외부에 두는 백업 원칙. 클라우드에서는 계정·리전 분리로 번역됩니다 | 17.2 |
| OODA 루프 | OODA Loop | — | 관찰→판단→결심→행동을 빠르게 반복하는 의사결정 모델. 사고 대응의 진행 틀로 씁니다 | 33.2 |
| RACI | Responsible, Accountable, Consulted, Informed | RACI | 사고 대응에서 누가 실행하고 누가 책임지며 누구와 상의하고 누구에게 알리는지를 명시하는 역할 표기 | 32.1 |
| STRIDE | Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege | — | 위협을 여섯 범주로 나눠 빠짐없이 훑게 해 주는 분류 체계 | 3.3 |
| WORM | Write Once Read Many | WORM | 한 번 쓰면 보존 기간 동안 수정·삭제할 수 없는 저장 방식 | 15.9 |

**합계: 68개**

---

## G.2 AWS 서비스·기능 용어

⚠️ **명칭 변경** 열은 근거 원서(2019·2020·2023) 시점과 달라진 이름을 표기합니다. 빈칸은 변경 없음을 뜻합니다.

### G.2.1 아이덴티티와 접근 관리

| 용어 | 정식 명칭 | 무엇인가 | 본문 | ⚠️ 명칭 변경 |
|---|---|---|---|---|
| IAM | AWS Identity and Access Management | 사용자·그룹·역할·정책으로 AWS API 호출 권한을 정의하는 서비스. 클라우드에서 IAM이 곧 경계입니다 | 6.1 | |
| STS | AWS Security Token Service | 만료 시각이 있는 임시 자격 증명을 발급하는 서비스. `AssumeRole`의 실행 주체입니다 | 6.3, 8.1 | |
| ARN | Amazon Resource Name | 모든 AWS 리소스를 전역에서 유일하게 가리키는 식별자. 정책의 `Resource`가 이것입니다 | 6.2 | |
| 인스턴스 프로파일 | Instance Profile | EC2 인스턴스에 IAM 역할을 부착하는 컨테이너. 코드에 키를 넣지 않는 표준 방법입니다 | 8.2 | |
| IMDS / IMDSv2 | Instance Metadata Service | 인스턴스가 자신의 메타데이터와 역할 자격 증명을 조회하는 로컬 엔드포인트. v2는 세션 토큰을 요구해 SSRF 경로를 차단합니다 | 8.3 | IMDSv2는 원서 3권 모두 미언급 |
| 서비스 연결 역할 | Service-Linked Role, SLR | AWS 서비스가 자기 동작을 위해 쓰는, 서비스에 묶인 전용 역할. SCP로 잘못 막으면 서비스가 멈춥니다 | 8.4 | |
| 신뢰 정책 | Trust Policy | 역할의 `AssumeRolePolicyDocument`. **누가 이 역할을 맡을 수 있는가**를 정의합니다 | 8.1, 7.2 | |
| External ID | External ID | 서드파티가 우리 역할을 맡을 때 요구하는 공유 비밀. 혼동된 대리자 문제의 표준 해법 | 8.6 | |
| 세션 태그 | Session Tag | 역할 수임 시 세션에 붙이는 태그. ABAC의 재료가 됩니다 | 8.7 | |
| 권한 경계 | Permissions Boundary | 아이덴티티가 가질 수 있는 권한의 **상한**. 권한을 주지 않고 상한만 정합니다 | 7.2 | |
| 서비스 제어 정책 | Service Control Policy, SCP | 조직·OU·계정 단위의 권한 상한. 루트 사용자에게도 적용되지만 권한을 부여하지는 않습니다 | 37.1 | |
| 리소스 제어 정책 | Resource Control Policy, RCP | 우리 조직의 **리소스**에 누가 접근할 수 있는지를 조직 차원에서 제한하는 정책. 거부만 가능합니다 | 37.4, 7.3 | 원서 이후 추가 |
| 선언적 정책 | Declarative Policies | 행위를 금지하는 대신 **설정값 자체를 고정**하는 Organizations 정책 | 37.8, 16.1 | 원서 이후 추가 |
| IAM Access Analyzer | IAM Access Analyzer | 외부에 열린 접근, 미사용 권한, 정책 변경의 영향을 분석하는 기능 | 7.7 | 미사용 액세스·커스텀 정책 검사는 원서 이후 추가 |
| IAM Identity Center | AWS IAM Identity Center | 여러 계정에 대한 인간 로그인을 한 곳에서 페더레이션으로 처리하는 서비스 | 9.2 | ⚠️ **구 AWS SSO**. API·IAM 액션 접두사는 여전히 `sso:` / `sso-admin:` |
| 권한 세트 | Permission Set | Identity Center에서 "이 그룹이 이 계정에서 가질 권한"을 정의하는 단위. 계정마다 IAM 역할로 실체화됩니다 | 9.2 | |
| IAM Roles Anywhere | IAM Roles Anywhere | X.509 인증서를 가진 온프레미스 워크로드가 IAM 역할을 맡게 하는 기능 | 8.8 | 원서 이후 추가 |
| Amazon Cognito 사용자 풀 | User Pool | 고객 계정을 직접 보관·인증하고 JWT를 발급하는 사용자 디렉터리 | 10.1 | ⚠️ 호스팅 UI → **매니지드 로그인**, 고급 보안 기능 → **위협 보호** |
| Cognito 자격 증명 풀 | Identity Pool | 인증된(또는 게스트) 사용자에게 **AWS 자격 증명**을 교환해 주는 기능 | 10.1 | |
| Secrets Manager | AWS Secrets Manager | 시크릿을 저장·순환·크로스 계정 공유하는 전용 서비스 | 11.3 | RDS 등의 **관리형 순환**은 원서 이후 추가 |
| Parameter Store | AWS Systems Manager Parameter Store | 설정값과 `SecureString` 시크릿을 계층 경로로 저장하는 기능 | 11.2 | |

### G.2.2 데이터 보호

| 용어 | 정식 명칭 | 무엇인가 | 본문 | ⚠️ 명칭 변경 |
|---|---|---|---|---|
| KMS | AWS Key Management Service | 암호화 키를 만들고 키 정책으로 사용 권한을 통제하는 관리형 서비스 | 13.3 | ⚠️ **CMK(customer master key) → KMS key** 로 명칭 통일 |
| 키 정책 | Key Policy | KMS 키에 붙는 리소스 기반 정책. 키 정책이 허용하지 않으면 IAM 관리자여도 키를 쓸 수 없습니다 | 13.4 | |
| 그랜트 | Grant | 키 정책을 고치지 않고 특정 주체에 한정된 키 사용 권한을 프로그래밍 방식으로 부여하는 수단 | 13.7 | |
| 다중 리전 키 | Multi-Region Key, MRK | 여러 리전에 같은 키 자료를 복제해 리전 간 암·복호화를 가능하게 하는 키. 정책·별칭·태그는 리전별로 독립입니다 | 13.3 | 원서 이후 추가 |
| 커스텀 키 스토어 | Custom Key Store | KMS 키의 키 자료를 CloudHSM 클러스터나 외부 키 관리자에 두는 구성 | 14.4 | |
| 외부 키 스토어 | External Key Store, XKS | 키 자료를 AWS 밖의 키 관리자에 두는 커스텀 키 스토어 유형 | 14.4 | 원서 이후 추가 |
| CloudHSM | AWS CloudHSM | 단독 테넌시 하드웨어 보안 모듈 클러스터. KMS로 충분하지 않은 요건에서만 선택합니다 | 14.2 | HSM 타입과 FIPS 검증 상태가 원서 시점과 다름 |
| Nitro Enclaves | AWS Nitro Enclaves | 인스턴스에서 격리된 CPU·메모리 영역을 떼어내 민감 처리만 수행하게 하는 기능 | 14.7 | 원서 이후 추가 |
| S3 퍼블릭 액세스 차단 | S3 Block Public Access, BPA | 버킷 정책·ACL이 무엇이든 퍼블릭 접근을 차단하는 상위 스위치. 계정 수준에서 켜는 것이 기본입니다 | 15.2 | 신규 버킷은 기본 활성화로 바뀜 |
| 버킷 정책 | Bucket Policy | 버킷에 붙는 리소스 기반 정책 | 15.4 | |
| ACL(버킷·객체) | Access Control List | 객체·버킷 단위의 구식 접근 통제. `BucketOwnerEnforced`로 비활성화하는 것이 현재 기본입니다 | 15.3 | 신규 버킷은 ACL 기본 비활성화 |
| 사전 서명 URL | Pre-signed URL | 서명한 주체의 권한을 물려받아 한시적으로 객체에 접근하게 하는 URL | 15.6 | |
| SSE-S3 / SSE-KMS / SSE-C / DSSE-KMS | Server-Side Encryption | S3 서버 측 암호화 방식. 관리 주체(S3 / KMS / 고객)와 계층 수가 다릅니다 | 15.7 | 기본 암호화 상시 적용, DSSE-KMS는 원서 이후 추가 |
| S3 버킷 키 | S3 Bucket Key | 객체마다 KMS를 호출하지 않고 버킷 단위 중간 키를 재사용해 호출 비용을 줄이는 기능 | 15.7 | |
| MFA Delete | MFA Delete | 객체 버전 영구 삭제와 버전 관리 중지에 루트의 MFA를 요구하는 설정 | 15.8 | |
| 객체 잠금 | S3 Object Lock | 보존 기간 동안 객체 버전의 수정·삭제를 막는 WORM 기능. 거버넌스/컴플라이언스 두 모드가 있습니다 | 15.9 | |
| 법적 보존 | Legal Hold | 기간 없이 해제 전까지 객체를 잠그는 별도 표시. 보존 기간과 독립으로 작동합니다 | 15.9 | |
| 크로스 리전 복제 | Cross-Region Replication, CRR | 버킷 객체를 다른 리전 버킷으로 자동 복제하는 기능 | 15.10 | |
| EBS 암호화 | EBS Encryption | 볼륨·스냅샷을 KMS 키로 암호화하는 기능. 계정·리전 단위 기본 암호화를 켤 수 있습니다 | 16.1 | 리전 기본 암호화, 스냅샷·AMI 퍼블릭 액세스 차단은 원서 이후 |
| 액세스 포인트 | Access Point | EFS·S3에서 경로·사용자·권한을 고정해 노출하는 진입점 | 16.4 | |
| Glacier Vault Lock | S3 Glacier Vault Lock | 볼트 정책을 24시간 안에 검증·완료해 되돌릴 수 없게 잠그는 기능 | 16.5 | ⚠️ 볼트 기반 **S3 Glacier**와 S3의 **Glacier 스토리지 클래스**는 다른 것 |
| AWS Backup | AWS Backup | 여러 서비스의 백업을 중앙에서 정책으로 관리하는 서비스. 볼트 잠금으로 불변 보존을 겁니다 | 17.3 | 논리적 에어갭 볼트·복원 테스트는 원서 이후 추가 |

### G.2.3 네트워크

| 용어 | 정식 명칭 | 무엇인가 | 본문 | ⚠️ 명칭 변경 |
|---|---|---|---|---|
| VPC | Amazon Virtual Private Cloud | 계정 안에 정의하는 논리적으로 격리된 가상 네트워크 | 18.2 | |
| 보안 그룹 | Security Group, SG | ENI에 붙는 **상태 저장** 가상 방화벽. 허용 규칙만 씁니다 | 19.1 | |
| 네트워크 ACL | Network ACL, NACL | 서브넷 경계의 **상태 비저장** 필터. 허용과 거부를 번호 순서로 평가합니다 | 19.1 | |
| 인터넷 게이트웨이 | Internet Gateway, IGW | VPC를 인터넷에 연결하는 관문. 라우팅 테이블에 이 경로가 있으면 그 서브넷이 퍼블릭입니다 | 18.4 | |
| NAT 게이트웨이 | NAT Gateway | 프라이빗 서브넷의 아웃바운드 인터넷 접속을 대신해 주는 관리형 구성 요소 | 18.5 | |
| 이그레스 전용 인터넷 게이트웨이 | Egress-Only Internet Gateway, EIGW | IPv6에서 아웃바운드만 허용하는 게이트웨이. IPv6에는 NAT 개념이 없어 이것을 씁니다 | 18.7 | |
| 게이트웨이 엔드포인트 | VPC Gateway Endpoint | S3·DynamoDB를 라우팅 테이블 경로로 프라이빗 연결하는 엔드포인트. 무료입니다 | 20.1 | |
| 인터페이스 엔드포인트 | VPC Interface Endpoint (PrivateLink) | 서브넷에 ENI를 만들어 서비스 API에 프라이빗 연결하는 엔드포인트 | 20.2 | 지원 서비스가 원서 시점보다 크게 늘어남 |
| 엔드포인트 정책 | VPC Endpoint Policy | 엔드포인트를 통과하는 요청을 제한하는 정책. 우리 조직 버킷 외 접근을 끊는 데 씁니다 | 20.3 | |
| Route 53 Resolver DNS Firewall | Route 53 Resolver DNS Firewall | VPC의 DNS 질의를 도메인 목록으로 차단·기록하는 기능 | 20.5 | DNS 터널링·DGA 탐지 기능은 원서 이후 추가 |
| Network Firewall | AWS Network Firewall | 관리형 상태 저장 네트워크 방화벽. 도메인·SNI 기반 이그레스 필터링에 씁니다 | 19.5 | 원서 3권 모두 미언급 |
| Site-to-Site VPN | AWS Site-to-Site VPN | 온프레미스와 AWS를 IPsec 터널로 연결하는 서비스 | 21.1 | |
| Direct Connect | AWS Direct Connect | 전용 회선으로 AWS에 연결하는 서비스. **전용선 자체가 암호화를 뜻하지 않습니다** | 21.2 | |
| Transit Gateway | AWS Transit Gateway | 다수의 VPC·온프레미스를 허브로 연결하고 라우팅 테이블로 격리하는 서비스 | 21.3 | 동일 리전 보안 그룹 참조 지원은 이후 추가 |
| VPC 피어링 | VPC Peering | 두 VPC를 1:1로 연결하는 기능. 전이 라우팅이 되지 않습니다 | 21.4 | |
| Session Manager | AWS Systems Manager Session Manager | 인바운드 포트·배스천·키 없이 인스턴스 셸에 접속하고 세션을 기록하는 기능 | 21.6 | 원서는 배스천/VPN 중심. 현재 관리 접근의 표준 |
| 접두사 목록 | Prefix List | 여러 CIDR을 하나의 이름으로 묶어 보안 그룹·라우팅에서 참조하는 객체 | 18.2, 19.2 | |
| VPC 플로우 로그 | VPC Flow Logs | ENI 단위 트래픽 메타데이터 로그. 페이로드는 담기지 않습니다 | 29.5 | |

### G.2.4 컴퓨트·웹 계층·컨테이너

| 용어 | 정식 명칭 | 무엇인가 | 본문 | ⚠️ 명칭 변경 |
|---|---|---|---|---|
| EC2 Image Builder | EC2 Image Builder | 골든 AMI 생성·테스트·배포 파이프라인을 관리형으로 제공하는 서비스 | 22.5 | |
| Patch Manager | AWS Systems Manager Patch Manager | 패치 베이스라인과 유지 관리 기간으로 패치를 자동 적용·보고하는 기능 | 22.6 | |
| 사용자 데이터 | User Data | 인스턴스 첫 부팅 시 실행되는 스크립트. **메타데이터로 조회되므로 시크릿을 넣으면 안 됩니다** | 22.4 | |
| ALB / NLB / GWLB / CLB | Application / Network / Gateway / Classic Load Balancer | 계층과 목적이 다른 네 가지 로드 밸런서 | 23.3 | ⚠️ **CLB는 이전 세대**. WAF 연결·TLS 1.3 정책 불가, 신규 구성 금지 / GWLB는 원서 이후 추가 |
| ACM | AWS Certificate Manager | 퍼블릭·프라이빗 인증서를 발급하고 자동 갱신하는 서비스 | 23.2 | 유료 **내보내기** 옵션이 이후 추가됨 |
| CloudFront | Amazon CloudFront | 엣지 캐시·TLS 종료·WAF 연결 지점이 되는 CDN | 23.7 | |
| OAC | Origin Access Control | CloudFront만 S3 오리진을 읽게 하는 현행 방식 | 23.7 | ⚠️ **구 OAI(Origin Access Identity)**. 신규 구성은 OAC |
| AWS WAF | AWS WAF | HTTP 계층에서 요청을 규칙으로 검사·차단하는 웹 방화벽 | 23.8 | |
| AWS Shield | AWS Shield | DDoS 방어 서비스. Standard는 기본 제공, Advanced는 유료 구독입니다 | 23.10 | |
| Firewall Manager | AWS Firewall Manager | WAF·Shield·보안 그룹·Network Firewall 정책을 조직 전체에 강제하는 서비스 | 23.11 | |
| ECS | Amazon Elastic Container Service | AWS 자체 컨테이너 오케스트레이터 | 24.3 | |
| 태스크 역할 / 태스크 실행 역할 | Task Role / Task Execution Role | 앱 코드가 쓰는 역할과 ECS 에이전트가 이미지·시크릿을 당겨오는 데 쓰는 역할 | 24.3 | |
| EKS | Amazon Elastic Kubernetes Service | 관리형 쿠버네티스 | 24.4 | |
| IRSA | IAM Roles for Service Accounts | 쿠버네티스 서비스 계정을 OIDC로 IAM 역할에 연결하는 방식 | 24.4 | |
| EKS Pod Identity | EKS Pod Identity | OIDC 제공자 설정 없이 파드에 IAM 역할을 연결하는 후발 방식 | 24.4 | 원서 이후 추가 |
| ECR | Amazon Elastic Container Registry | 컨테이너 이미지 레지스트리. 푸시 시 스캔과 태그 불변성을 켭니다 | 26.3, 24.2 | |
| Lambda | AWS Lambda | 서버리스 함수 실행 서비스. 실행 역할·환경 변수·동시성이 보안 설정의 축입니다 | 24.6 | |
| API Gateway | Amazon API Gateway | API 앞단에서 인증·인가·스로틀링·요청 검증을 수행하는 서비스 | 24.7 | |

### G.2.5 탐지·로깅·대응

| 용어 | 정식 명칭 | 무엇인가 | 본문 | ⚠️ 명칭 변경 |
|---|---|---|---|---|
| CloudTrail | AWS CloudTrail | AWS API 호출을 기록하는 감사 로그 서비스 | 29.2 | **고급 이벤트 선택기**가 현재 표준 |
| 관리 이벤트 / 데이터 이벤트 | Management Events / Data Events | 리소스를 조작하는 제어 평면 호출과 데이터 자체를 다루는 호출. 후자는 기본 비활성이며 유료입니다 | 29.2, 15.11 | |
| 조직 트레일 | Organization Trail | 조직 전체 계정의 이벤트를 한 트레일로 모으는 구성. 멤버 계정이 끌 수 없습니다 | 29.4, 29.9 | |
| 로그 파일 무결성 검증 | Log File Integrity Validation | 다이제스트 파일로 로그가 변조·삭제되지 않았음을 검증하는 기능 | 29.3 | |
| CloudWatch Logs | Amazon CloudWatch Logs | 로그를 그룹·스트림으로 수집·보존·질의하는 서비스 | 29.6 | |
| CloudWatch 알람 | CloudWatch Alarm | 지표가 임계값을 넘으면 동작을 트리거하는 알람 | 30.2 | |
| EventBridge | Amazon EventBridge | 이벤트를 규칙으로 매칭해 대상으로 라우팅하는 이벤트 버스 | 30.5 | ⚠️ **구 CloudWatch Events** |
| Athena | Amazon Athena | S3의 로그를 SQL로 직접 질의하는 서버리스 쿼리 서비스 | 30.6 | |
| GuardDuty | Amazon GuardDuty | CloudTrail·DNS·플로우 로그 등을 분석해 위협을 탐지하는 관리형 서비스 | 31.1 | 런타임 모니터링·악성코드 스캔 등 데이터 소스가 계속 추가됨 |
| Macie | Amazon Macie | S3의 민감 데이터를 자동으로 발견·분류하는 서비스 | 12.4, 31.3 | ⚠️ 원서의 Macie(Lucene 질의·사용자 등급화)와 **사실상 다른 서비스**로 재설계 |
| Detective | Amazon Detective | 로그를 행동 그래프로 묶어 조사 동선을 만들어 주는 서비스 | 31.4 | |
| Security Hub | AWS Security Hub | 여러 보안 서비스의 결과를 표준 형식으로 모으고 보안 표준 컨트롤을 평가하는 허브 | 31.5 | |
| ASFF | AWS Security Finding Format | Security Hub가 결과를 정규화하는 공통 스키마 | 31.5 | |
| FSBP | AWS Foundational Security Best Practices | AWS가 정의한 서비스별 모범 사례 표준. 대부분 조직의 기본 선택입니다 | 31.5 | |
| Security Lake | Amazon Security Lake | 보안 로그를 조직 단위로 모아 OCSF 스키마 Parquet으로 적재하는 서비스 | 30.7 | 원서 3권 모두 미언급 |
| Inspector | Amazon Inspector | EC2·ECR·Lambda의 취약점을 지속적으로 스캔하는 서비스 | 26.3 | ⚠️ 원서가 설명하는 것은 **Inspector Classic**(CLI `inspector`), 현행은 `inspector2`. **다른 서비스** |
| AWS Config | AWS Config | 리소스 구성 변경 이력을 기록하고 규칙으로 준수 여부를 평가하는 서비스 | 29.8 | |
| 적합성 팩 | Conformance Pack | Config 규칙과 교정 조치를 묶어 한 단위로 배포하는 패키지 | 37.7 | |
| 자동 교정 | Automatic Remediation | Config 규칙 위반을 SSM Automation 문서로 자동 되돌리는 기능 | 35.3 | |
| Trusted Advisor | AWS Trusted Advisor | 비용·성능·보안·내결함성·한도를 점검해 권고하는 서비스 | 26.7 | |

### G.2.6 거버넌스와 컴플라이언스

| 용어 | 정식 명칭 | 무엇인가 | 본문 | ⚠️ 명칭 변경 |
|---|---|---|---|---|
| Organizations | AWS Organizations | 계정을 조직·OU로 묶고 정책을 계층적으로 적용하는 서비스 | 36.2 | ⚠️ **master account → management account**. 멤버 초대 방식 → **위임 관리자** 방식 |
| OU | Organizational Unit | 조직 안에서 계정을 묶는 계층 단위. 정책 부착 지점입니다 | 36.4 | |
| 위임 관리자 | Delegated Administrator | 관리 계정 대신 특정 보안 서비스를 조직 전체에 대해 운영하는 멤버 계정 | 36.2, 31.2 | ⚠️ 용어가 **"마스터/멤버" → "관리자/멤버"** 로 바뀜 |
| Control Tower | AWS Control Tower | 랜딩 존 설정과 가드레일 적용을 관리형으로 제공하는 서비스 | 37.5 | |
| 랜딩 존 | Landing Zone | 계정 구조·네트워크·로깅·가드레일의 기준 구성 | 37.6 | |
| StackSets | AWS CloudFormation StackSets | 하나의 템플릿을 여러 계정·리전에 일괄 배포하는 기능. 신규 계정 베이스라인의 표준 수단입니다 | 37.9 | |
| 태그 정책 / 백업 정책 | Tag Policy / Backup Policy | Organizations에서 태그 키 표기와 백업 계획을 조직 차원에서 강제하는 정책 유형 | 37.8 | |
| RAM | AWS Resource Access Manager | 서브넷·Transit Gateway 등 리소스를 다른 계정과 공유하는 서비스 | 36.8 | |
| AWS Artifact | AWS Artifact | AWS의 감사 보고서와 인증서를 셀프서비스로 내려받는 포털 | 38.1 | ⚠️ SOC 1·SOC 2 보고서는 **기밀**이며 제3자 재배포가 제한됨 |
| Audit Manager | AWS Audit Manager | 프레임워크별 증거를 자동 수집해 감사 준비를 돕는 서비스 | 38.2 | |
| Well-Architected 보안 기둥 | AWS Well-Architected Framework — Security Pillar | 보안 설계 원칙과 질문 목록으로 아키텍처를 자가 진단하는 프레임워크 | 39.5 | ⚠️ 원칙 문구는 개정됨. 인용 시 **리뷰 시점 문서 표기**를 따를 것 |
| AWS Signer | AWS Signer | 빌드가 개인 키를 만지지 않고 아티팩트에 서명하게 하는 관리형 서명 서비스 | 27.5 | 원서 범위 밖 |
| GovCloud | AWS GovCloud (US) | 미국 정부 요건 전용으로 분리 운영되는 리전군 | 36.2 | |

**합계: 112개** (아이덴티티 21 · 데이터 22 · 네트워크 18 · 컴퓨트 18 · 탐지 20 · 거버넌스 13)

---

## G.3 규제·표준 약어

> ⚠️ 이 표는 **"무엇을 요구하는 제도인가"** 까지만 적습니다. 조문 번호·보관 기간·인증 등급·적용 임계치는 개정이 잦아 의도적으로 넣지 않았습니다. 적용 판단은 최신 원문과 법무 검토로 하십시오(4.3, 38.4).

| 약어 | 정식 명칭 | 무엇인가 | 본문 |
|---|---|---|---|
| **CIS Benchmarks** | Center for Internet Security Benchmarks | 운영체제·클라우드 서비스별 보안 설정 기준선. Security Hub와 Inspector가 이 기준으로 점검합니다 | 26.3, 31.5 |
| **CSAP** | 클라우드 보안인증 | 공공 부문에 클라우드 서비스를 제공하려는 사업자 대상 국내 인증. **어떤 인프라를 쓸 수 있는지까지 제약**합니다 | 38.4, 4.3 |
| **CVE** | Common Vulnerabilities and Exposures | 공개된 취약점에 부여되는 고유 식별자 | 25.2 |
| **CVSS** | Common Vulnerability Scoring System | 취약점의 기술적 심각도를 점수로 표현하는 체계. **점수만으로 우선순위를 정하면 안 됩니다** | 25.4 |
| **CycloneDX** | OWASP CycloneDX (ECMA-424) | 보안 중심 SBOM 형식. VEX·서비스·의존 그래프 표현이 강합니다 | 27.2 |
| **EPSS** | Exploit Prediction Scoring System | 향후 일정 기간 내 악용 시도가 관측될 **확률**을 추정하는 체계(FIRST) | 25.4 |
| **FedRAMP** | Federal Risk and Authorization Management Program | 미국 연방기관에 클라우드 서비스를 제공하기 위한 인증 프로그램 | 4.3 |
| **FIPS 140** | Federal Information Processing Standard 140 | 암호 모듈 검증 표준. CloudHSM 선택의 주된 근거가 되는 요건입니다 | 14.1 |
| **GDPR** | General Data Protection Regulation | EU/EEA 개인 데이터 보호 규정. 목록화·보호·접근 감사와 삭제권·국외 이전 제한을 요구합니다 | 4.3 |
| **HIPAA** | Health Insurance Portability and Accountability Act | 미국 보건의료 정보 보호 법률. BAA 체결과 적격 서비스 사용이 아키텍처 제약이 됩니다 | 4.3 |
| **ISMS-P** | 정보보호 및 개인정보보호 관리체계 인증 | KISA가 운영하는 국내 인증. 관리체계·보호대책·개인정보 단계별 요구의 세 영역으로 구성됩니다 | 38.4, 4.3 |
| **ISO/IEC 27001** | Information security management systems | 정보보호 관리체계 자체를 인증하는 국제 표준. 위험 평가와 적용성 명세서(SoA) 순환의 증명을 요구합니다 | 4.3, 38.3 |
| **KEV** | CISA Known Exploited Vulnerabilities Catalog | **실제 악용이 확인된** 취약점만 모은 목록. 우선순위 판단의 1순위 신호입니다 | 25.4 |
| **MITRE ATT&CK** | MITRE ATT&CK | 실제 관측된 공격 전술·기법을 분류한 지식 베이스. 클라우드용 매트릭스가 별도로 있습니다 | 33.1 |
| **NIST SP 800-53** | Security and Privacy Controls for Information Systems and Organizations | 미국 연방 통제 프레임워크. 컨트롤 수가 매우 많아 **요건이 없으면 켜지 않습니다** | 31.5 |
| **OCSF** | Open Cybersecurity Schema Framework | 보안 로그를 벤더 중립 스키마로 정규화하는 개방 표준. Security Lake가 이 형식으로 적재합니다 | 30.7 |
| **OWASP** | Open Worldwide Application Security Project | 애플리케이션 보안 자료·도구를 만드는 비영리 단체. Top 10과 소스 분석 도구 목록이 널리 쓰입니다 | 26.2 |
| **PCI DSS** | Payment Card Industry Data Security Standard | 카드 데이터를 저장·처리·전송하는 조직에 적용되는 산업 표준. 범위(CDE) 분리가 아키텍처의 핵심 제약입니다 | 4.3, 38.3 |
| **SLSA** | Supply-chain Levels for Software Artifacts | 빌드 환경 보호와 아티팩트 서명의 성숙도를 수준으로 나눈 공급망 보안 프레임워크 | 27.1 |
| **SOC 1 / SOC 2 / SOC 3** | System and Organization Controls | AICPA 기준에 따른 감사 보고서. Type I은 통제 설계를, **Type II는 기간 내 운영 효과성**을 봅니다 | 38.1, 4.3 |
| **SPDX** | Software Package Data Exchange (ISO/IEC 5962) | 라이선스 컴플라이언스에서 출발한 SBOM 형식. 대외 제출·조달 대응에 적합합니다 | 27.2 |
| **VDP** | Vulnerability Disclosure Policy | 외부 제보를 받는 창구와 규칙을 공개하는 정책. **버그 바운티보다 먼저 갖춰야 합니다** | 26.5 |
| **개인정보보호법** | Personal Information Protection Act | 국내 개인정보 처리자에게 안전성 확보 조치를 의무화하는 법률. 암호화 저장·전송, 접속기록 보관·점검, 접근 권한 관리가 아키텍처에 직접 걸립니다 | 4.3, 38.4 |

**합계: 23개**

---

## G.4 혼동하기 쉬운 용어 쌍

시험에서도 실무에서도 사고가 나는 지점은 대개 이 표 안에 있습니다.

| 용어 A | 용어 B | 무엇이 다른가 | 본문 |
|---|---|---|---|
| **인증**(Authentication) | **인가**(Authorization) | 인증은 "너는 누구인가", 인가는 "너는 무엇을 해도 되는가". 인증이 성공해도 인가는 별도로 평가되며, 클라우드 사고 대부분은 **인증이 아니라 인가 설계**에서 납니다 | 6.5 |
| **보안 그룹**(SG) | **네트워크 ACL**(NACL) | SG는 ENI에 붙는 **상태 저장** — 허용한 인바운드의 응답은 자동 허용. NACL은 서브넷 경계의 **상태 비저장** — 응답 트래픽의 임시 포트를 따로 열어야 합니다. SG는 허용만, NACL은 거부도 가능 | 19.1 |
| **게이트웨이 엔드포인트** | **인터페이스 엔드포인트**(PrivateLink) | 게이트웨이는 라우팅 테이블 경로로 동작하고 S3·DynamoDB 두 서비스만 지원하며 **무료**. 인터페이스는 서브넷에 ENI를 만들어 대부분의 서비스 API를 지원하고 **시간·데이터 과금**. 온프레미스에서 도달 가능한 것은 인터페이스 쪽뿐입니다 | 20.1, 20.2 |
| **태스크 역할** | **태스크 실행 역할** | 태스크 역할은 **앱 코드**가 AWS API를 호출할 때 쓰는 역할. 태스크 실행 역할은 **ECS 에이전트**가 이미지를 당기고 시크릿을 주입하고 로그를 보낼 때 쓰는 역할. 실행 역할에 앱 권한을 몰아주는 것이 흔한 실수입니다 | 24.3 |
| **사용자 풀** | **자격 증명 풀** | 사용자 풀은 **사용자를 보관·인증하고 JWT를 발급**하는 디렉터리. 자격 증명 풀은 그 토큰(또는 외부 IdP 토큰)을 **AWS 임시 자격 증명으로 교환**하는 기능. 둘은 독립적으로 쓸 수 있습니다 | 10.1 |
| **SSE-KMS** | **SSE-C** | SSE-KMS는 키를 **KMS가 보관**하고 키 정책·CloudTrail 감사가 따라붙습니다. SSE-C는 **고객이 매 요청마다 키를 보내고** AWS는 저장하지 않으므로, 키를 잃으면 데이터도 잃고 감사 흔적도 남지 않습니다 | 15.7 |
| **키 정책** | **IAM 정책** | KMS 키 접근은 **키 정책이 최종 관문**입니다. 키 정책이 계정에 위임하지 않으면 IAM 관리자 권한으로도 키를 쓸 수 없습니다. 반대로 키 정책만 있고 IAM이 막으면 역시 실패 — **양쪽 모두 허용**이 필요합니다 | 13.4 |
| **SCP** | **권한 경계** | 둘 다 **상한만 정하고 권한을 주지 않습니다.** SCP는 **조직·OU·계정** 단위로 관리자가 겁니다. 권한 경계는 **개별 IAM 아이덴티티**에 붙이며, 권한 위임 시 위임받은 사람이 자기보다 강한 역할을 못 만들게 하는 용도입니다 | 37.1, 7.2 |
| **거버넌스 모드** | **컴플라이언스 모드** | 객체 잠금의 두 보존 모드. 거버넌스 모드는 **특별 권한을 가진 주체가 해제할 수 있고**, 컴플라이언스 모드는 **루트 사용자도 보존 기간 안에는 해제할 수 없습니다.** 랜섬웨어 대비의 실질적 방어선은 후자입니다 | 15.9 |
| **Parameter Store** | **Secrets Manager** | Parameter Store는 **설정값 중심**이고 표준 티어가 무료, 순환은 직접 구현. Secrets Manager는 **시크릿 전용**으로 관리형 순환·리소스 정책·크로스 계정 공유를 제공하고 시크릿 단위 과금. 순환과 크로스 계정이 필요하면 후자 | 11.4 |
| **IRSA** | **EKS Pod Identity** | 둘 다 파드에 IAM 역할을 주는 방법. IRSA는 클러스터마다 **OIDC 제공자를 등록**하고 역할 신뢰 정책에 클러스터별 조건을 씁니다. Pod Identity는 **에이전트 애드온과 연결(association)** 로 처리해 클러스터가 늘어날 때 신뢰 정책 관리 부담이 줄어듭니다 | 24.4 |
| **관리 이벤트** | **데이터 이벤트** | 관리 이벤트는 리소스를 만들고 고치는 **제어 평면** 호출이고 기본으로 기록됩니다. 데이터 이벤트는 객체를 읽고 쓰는 **데이터 평면** 호출로 **기본 비활성이며 유료**입니다. "S3에서 누가 무엇을 가져갔는가"는 데이터 이벤트를 켜지 않으면 영원히 알 수 없습니다 | 29.2, 15.11 |
| **예방 가드레일** | **탐지 가드레일** | 예방(SCP·정책 게이트)은 **행위 자체를 일어나지 못하게** 합니다. 탐지(Config·Security Hub)는 일어난 뒤 **발견**합니다. 예방은 강력하지만 잘못 걸면 운영이 멈추고, 탐지는 안전하지만 이미 벌어진 뒤입니다. 둘 사이에 **대응**(자동 교정)이 있습니다 | 37.4 |
| **MTTD** | **MTTR** | MTTD는 **사건 발생 → 탐지**까지, MTTR은 **탐지 → 조치 완료**까지. MTTD가 나쁘면 탐지 체계 문제이고 MTTR이 나쁘면 대응 체계 문제입니다. 둘을 합쳐 하나로 보고하면 어느 쪽을 고쳐야 할지 알 수 없게 됩니다 | 32.6 |
| **취약점 관리 MTTR** | **사고 대응 MTTR** | 같은 약어가 다른 것을 셉니다. 취약점 관리의 MTTR은 **취약점 발견 → 패치 완료**(보통 일 단위)이고, 사고 대응의 MTTR은 **사고 탐지 → 봉쇄·복구 완료**(보통 시간 단위)입니다. 한 대시보드에 두 값을 "MTTR"로 나란히 놓으면 지표가 무의미해집니다 | 25.5, 32.6 |

**합계: 15쌍**

---

## G.5 영문 → 한글 역인덱스

영어 문서·AWS 콘솔·시험 문제를 읽다가 이 책의 어느 절로 가야 하는지 찾는 표입니다.

| English | 한글 | 본문 |
|---|---|---|
| 3-2-1 Rule | 3-2-1 규칙 | 17.2 |
| Access Control List (ACL) | 액세스 제어 목록 (S3 ACL) | 15.3 |
| Access Point | 액세스 포인트 / 접근 지점 | 16.4 |
| Air Gap | 에어갭(논리적 에어갭) | 17.2 |
| Alert Fatigue | 알람 피로 | 30.9 |
| Amazon Resource Name (ARN) | 리소스 이름(ARN) | 6.2 |
| API Gateway | API 게이트웨이 | 24.7 |
| ASFF (AWS Security Finding Format) | 보안 결과 표준 형식 | 31.5 |
| Athena | 아테나 | 30.6 |
| Attribute-Based Access Control (ABAC) | 속성 기반 접근 제어 | 8.7 |
| Audit Manager | 감사 관리자 | 38.2 |
| Authentication (AuthN) | 인증 | 6.5 |
| Authorization (AuthZ) | 인가 | 6.5 |
| Automatic Remediation | 자동 교정 | 35.3 |
| AWS Artifact | 규정 준수 보고서 포털 | 38.1 |
| AWS Backup | 중앙 백업 서비스 | 17.3 |
| AWS Config | 구성 기록·평가 서비스 | 29.8 |
| AWS Signer | 아티팩트 서명 서비스 | 27.5 |
| Blameless Postmortem | 비난 없는 사후 검토 | 34.6 |
| Blast Radius | 폭발 반경 | 1.4 |
| Block Public Access (BPA) | 퍼블릭 액세스 차단 | 15.2 |
| Break-glass | 브레이크글래스 | 32.4 |
| Bucket Policy | 버킷 정책 | 15.4 |
| Chain of Custody | 관리 연속성 | 34.2 |
| CIS Benchmarks | CIS 벤치마크 | 26.3, 31.5 |
| CloudFront | 콘텐츠 전송 네트워크 | 23.7 |
| CloudHSM | 전용 하드웨어 보안 모듈 | 14.2 |
| CloudTrail | API 호출 감사 로그 | 29.2 |
| CloudWatch Logs | 로그 수집·보존 서비스 | 29.6 |
| Cognito Identity Pool | 자격 증명 풀 | 10.1 |
| Cognito User Pool | 사용자 풀 | 10.1 |
| Compliance Mode | 컴플라이언스 모드 | 15.9 |
| Confidential Computing | 컨피덴셜 컴퓨팅 | 14.7 |
| Confused Deputy | 혼동된 대리자 | 8.6 |
| Conformance Pack | 적합성 팩 | 37.7 |
| Control Tower | 랜딩 존 관리 서비스 | 37.5 |
| Cross-Region Replication (CRR) | 크로스 리전 복제 | 15.10 |
| Crown Jewels | 왕관 보석 | 4.2 |
| Crypto-agility | 암호 민첩성 | 14.6 |
| Cryptographic Erasure | 암호적 삭제 | 12.6 |
| Cryptomining | 크립토마이닝 | 32.2 |
| Custom Key Store | 커스텀 키 스토어 | 14.4 |
| CVE | 공개 취약점 식별자 | 25.2 |
| CVSS | 취약점 심각도 점수 체계 | 25.4 |
| CycloneDX | SBOM 형식(보안 중심) | 27.2 |
| Cyber Kill Chain | 사이버 킬 체인 | 33.1 |
| Data Classification | 데이터 분류 | 4.2 |
| Data Events | 데이터 이벤트 | 29.2, 15.11 |
| Data Exfiltration | 데이터 유출 | 20.3 |
| Data Flow Diagram (DFD) | 데이터 흐름도 | 3.2 |
| Data Perimeter | 데이터 경계 | 20.3 |
| Data Sovereignty | 데이터 주권 | 38.6 |
| Declarative Policies | 선언적 정책 | 37.8 |
| Defense in Depth | 심층 방어 | 1.2 |
| Delegated Administrator | 위임 관리자 | 36.2 |
| Dependency Confusion | 의존성 혼동 | 27.3 |
| Deny by Default | 기본 거부 | 6.5, 7.3 |
| Detective | 조사용 행동 그래프 서비스 | 31.4 |
| Direct Connect | 전용 회선 연결 | 21.2 |
| Drift | 드리프트 | 28.4 |
| DSSE-KMS | 이중 계층 서버 측 암호화 | 15.7 |
| EBS Encryption | EBS 암호화 | 16.1 |
| EC2 Image Builder | 이미지 빌드 파이프라인 | 22.5 |
| ECR | 컨테이너 이미지 레지스트리 | 26.3 |
| ECS | 컨테이너 오케스트레이션 서비스 | 24.3 |
| Egress Filtering | 이그레스 필터링 | 19.6 |
| Egress-Only Internet Gateway (EIGW) | 이그레스 전용 인터넷 게이트웨이 | 18.7 |
| EKS | 관리형 쿠버네티스 | 24.4 |
| EKS Pod Identity | 파드 아이덴티티 | 24.4 |
| Encryption Context | 암호화 컨텍스트 | 13.9 |
| Envelope Encryption | 봉투 암호화 | 13.1 |
| EPSS | 악용 확률 예측 점수 | 25.4 |
| EventBridge | 이벤트 버스 | 30.5 |
| Explicit Deny | 명시적 거부(명시적 Deny) | 7.3 |
| External ID | 외부 ID | 8.6 |
| False Positive | 오탐 | 30.9 |
| FedRAMP | 미국 연방 클라우드 인증 프로그램 | 4.3 |
| FIPS 140 | 암호 모듈 검증 표준 | 14.1 |
| Firewall Manager | 조직 전체 방화벽 정책 관리 | 23.11 |
| FSBP | AWS 기초 보안 모범 사례 표준 | 31.5 |
| Gateway Endpoint | 게이트웨이 엔드포인트 | 20.1 |
| GDPR | EU 개인정보보호 규정 | 4.3 |
| Golden AMI | 골든 AMI | 22.5 |
| Governance Mode | 거버넌스 모드 | 15.9 |
| GovCloud | 미국 정부 전용 리전군 | 36.2 |
| Grant | 그랜트 | 13.7 |
| GuardDuty | 위협 탐지 서비스 | 31.1 |
| Guardrail | 가드레일 | 37.4 |
| Hacktivist | 핵티비스트 | 3.1 |
| Hardening | 하드닝 | 25.2 |
| HIPAA | 미국 보건의료 정보 보호 법률 | 4.3 |
| IAM | 아이덴티티 및 접근 관리 | 6.1 |
| IAM Access Analyzer | 접근 분석기 | 7.7 |
| IAM Identity Center | 아이덴티티 센터 (구 AWS SSO) | 9.2 |
| IAM Roles Anywhere | 외부 워크로드용 역할 | 8.8 |
| Immutable Infrastructure | 불변 인프라 | 1.5, 22.8 |
| Implicit Deny | 암묵적 거부(암묵적 Deny) | 7.3 |
| IMDS / IMDSv2 | 인스턴스 메타데이터 서비스 | 8.3 |
| Insider Threat | 내부자 위협 | 3.1 |
| Inspector | 취약점 스캔 서비스 | 26.3 |
| Instance Profile | 인스턴스 프로파일 | 8.2 |
| Interface Endpoint (PrivateLink) | 인터페이스 엔드포인트 | 20.2 |
| Internet Gateway (IGW) | 인터넷 게이트웨이 | 18.4 |
| IRSA | 서비스 계정용 IAM 역할 | 24.4 |
| ISO/IEC 27001 | 정보보호 관리체계 국제 표준 | 4.3, 38.3 |
| KEV | 실제 악용 확인 취약점 목록 | 25.4 |
| Key Policy | 키 정책 | 13.4 |
| KMS | 키 관리 서비스 | 13.3 |
| Lambda | 서버리스 함수 | 24.6 |
| Landing Zone | 랜딩 존 | 37.6 |
| Least Privilege | 최소 권한 | 1.1 |
| Legal Hold | 법적 보존 | 15.9 |
| Load Balancer (ALB/NLB/GWLB/CLB) | 로드 밸런서 4종 | 23.3 |
| Log File Integrity Validation | 로그 파일 무결성 검증 | 29.3 |
| Macie | 민감 데이터 발견 서비스 | 12.4, 31.3 |
| Management Events | 관리 이벤트 | 29.2 |
| Maturity Model | 성숙도 모델 | 39.1 |
| Mean Time To Detect (MTTD) | 평균 탐지 시간 | 32.6 |
| Mean Time To Respond (MTTR) | 평균 대응 시간 | 25.5, 32.6 |
| MFA | 다중 인증 | 9.4, 5.2 |
| MFA Delete | MFA 삭제 보호 | 15.8 |
| Microsegmentation | 마이크로세그멘테이션 | 19.7 |
| MITRE ATT&CK | 공격 전술·기법 지식 베이스 | 33.1 |
| Multi-Region Key (MRK) | 다중 리전 키 | 13.3 |
| NAT Gateway | NAT 게이트웨이 | 18.5 |
| Network ACL (NACL) | 네트워크 ACL | 19.1 |
| Network Firewall | 관리형 네트워크 방화벽 | 19.5 |
| NIST SP 800-53 | 미국 연방 통제 프레임워크 | 31.5 |
| Nitro Enclaves | 격리 실행 환경 | 14.7 |
| Non-repudiation | 부인 방지 | 3.3 |
| Object Lock | 객체 잠금 | 15.9 |
| OCSF | 개방 보안 스키마 프레임워크 | 30.7 |
| OIDC | OpenID Connect 페더레이션 | 8.8, 9.1 |
| OODA Loop | OODA 루프 | 33.2 |
| Organizational Unit (OU) | 조직 단위 | 36.4 |
| Organizations | 조직 관리 서비스 | 36.2 |
| Organization Trail | 조직 트레일 | 29.4 |
| Origin Access Control (OAC) | 오리진 액세스 제어 | 23.7 |
| OWASP | 애플리케이션 보안 비영리 단체 | 26.2 |
| Parameter Store | 파라미터 스토어 | 11.2 |
| Patch Manager | 패치 관리자 | 22.6 |
| PCI DSS | 카드 산업 데이터 보안 표준 | 4.3, 38.3 |
| Penetration Testing | 모의 침투 테스트 | 26.4 |
| Permission Set | 권한 세트 | 9.2 |
| Permissions Boundary | 권한 경계 | 7.2 |
| Post-Quantum Cryptography (PQC) | 양자내성 암호 | 14.6 |
| Prefix List | 접두사 목록 | 18.2, 19.2 |
| Pre-signed URL | 사전 서명 URL | 15.6 |
| Privilege Escalation | 권한 상승 | 3.4, 7.5 |
| Provenance | 출처 증명 | 27.5 |
| RACI | 역할 책임 표기 | 32.1 |
| RAM (Resource Access Manager) | 리소스 공유 서비스 | 36.8 |
| Ransomware | 랜섬웨어 | 17.5 |
| Resource Control Policy (RCP) | 리소스 제어 정책 | 37.4, 7.3 |
| Risk Register | 리스크 등록부 | 4.1 |
| Role-Based Access Control (RBAC) | 역할 기반 접근 제어 | 8.7 |
| Route 53 Resolver DNS Firewall | DNS 방화벽 | 20.5 |
| S3 Bucket Key | S3 버킷 키 | 15.7 |
| SBOM | 소프트웨어 자재 명세서 | 27.2 |
| Secrets Manager | 시크릿 관리 서비스 | 11.3 |
| Security Group (SG) | 보안 그룹 | 19.1 |
| Security Hub | 보안 결과 통합 허브 | 31.5 |
| Security Lake | 보안 로그 레이크 | 30.7 |
| Separation of Duties (SoD) | 직무 분리 | 6.5 |
| Service Control Policy (SCP) | 서비스 제어 정책 | 37.1 |
| Service-Linked Role (SLR) | 서비스 연결 역할 | 8.4 |
| Session Manager | 세션 관리자 | 21.6 |
| Session Tag | 세션 태그 | 8.7 |
| Shared Responsibility Model | 공동 책임 모델 | 2.1 |
| Shield | DDoS 방어 서비스 | 23.10 |
| Shift-left | 좌측 이동 | 26.1, 28.3 |
| Site-to-Site VPN | 사이트 간 VPN | 21.1 |
| SLSA | 공급망 보안 프레임워크 | 27.1 |
| SOC 1 / 2 / 3 | 통제 감사 보고서 | 38.1 |
| SPDX | SBOM 형식(라이선스 중심) | 27.2 |
| SSE-S3 / SSE-KMS / SSE-C | S3 서버 측 암호화 3종 | 15.7 |
| SSRF | 서버 측 요청 위조 | 3.4, 8.3 |
| StackSets | 다계정 일괄 배포 | 37.9 |
| STRIDE | 위협 분류 체계 | 3.3 |
| STS | 보안 토큰 서비스 | 6.3, 8.1 |
| Supply Chain Attack | 공급망 공격 | 27.1 |
| Tabletop Exercise | 테이블톱 훈련 | 32.5 |
| Tag Policy / Backup Policy | 태그 정책 / 백업 정책 | 37.8 |
| Task Role / Task Execution Role | 태스크 역할 / 태스크 실행 역할 | 24.3 |
| Temporary Credentials | 임시 자격 증명 | 6.3, 8.1 |
| Threat Actor | 위협 행위자 | 3.1 |
| Threat Hunting | 위협 헌팅 | 30.8 |
| Threat Modeling | 위협 모델링 | 3.3 |
| Tokenization | 토큰화 | 16.6 |
| Transit Gateway | 트랜싯 게이트웨이 | 21.3 |
| Trust Boundary | 신뢰 경계 | 3.2 |
| Trust Policy | 신뢰 정책 | 8.1 |
| Trusted Advisor | 권고 점검 서비스 | 26.7 |
| Typosquatting | 타이포스쿼팅 | 27.1 |
| User Data | 사용자 데이터 | 22.4 |
| Vault Lock | 볼트 잠금 | 16.5 |
| VDP | 취약점 공개 정책 | 26.5 |
| VPC | 가상 프라이빗 클라우드 | 18.2 |
| VPC Endpoint Policy | 엔드포인트 정책 | 20.3 |
| VPC Flow Logs | VPC 플로우 로그 | 29.5 |
| VPC Peering | VPC 피어링 | 21.4 |
| WAF | 웹 애플리케이션 방화벽 | 23.8 |
| Well-Architected Security Pillar | 보안 기둥 | 39.5 |
| WORM | 한 번 쓰고 여러 번 읽기 | 15.9 |
| Zero Trust | 제로 트러스트 | 1.3 |

**합계: 205개 항목**

---

## 이 부록을 쓰는 법

| 상황 | 어디를 보나 |
|---|---|
| 본문에서 모르는 개념이 나왔다 | G.1 (가나다순) |
| 콘솔에서 처음 보는 서비스·기능을 만났다 | G.2 (기능 영역순) |
| 오래된 블로그·강의가 다른 이름을 쓴다 | G.2의 **⚠️ 명칭 변경** 열 |
| 감사인이 약어로 요구사항을 말한다 | G.3 |
| 두 가지 중 무엇을 써야 할지 모르겠다 | G.4, 그리고 선택 기준은 부록 H.4 |
| 영어 문서를 읽다가 한글 설명이 필요하다 | G.5 |
