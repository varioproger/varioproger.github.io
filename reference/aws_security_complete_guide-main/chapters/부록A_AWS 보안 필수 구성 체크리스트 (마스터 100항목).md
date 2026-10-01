---
title: "부록 A. AWS 보안 필수 구성 체크리스트 (마스터 100항목)"
---

# 부록 A. AWS 보안 필수 구성 체크리스트 (마스터 100항목)

본문 41개 장에 흩어진 🔴 필수 항목을 **하나의 점검표**로 합친 것입니다. 각 항목은 본문 어딘가에서 이미 "왜 그래야 하는가"를 설명한 것이고, 여기서는 **"되어 있는가"** 만 묻습니다. 근거가 궁금하면 `본문` 열의 절 번호로 돌아가십시오.

---

## A-0 사용법

### 1) 무엇을 준비하고 시작하는가

| 준비물 | 설명 |
|---|---|
| 점검 범위 | 조직 전체 계정 목록. 계정 하나만 보고 "됐다"고 하지 않습니다 — 잊힌 계정이 언제나 가장 위험합니다 (12.1) |
| 점검 리전 | 사용 중인 리전 **전부**. "서울만 켰다"는 미완입니다 (5.5, 31.1) |
| 읽기 전용 역할 | 점검 계정은 읽기 권한만 가져야 합니다. 점검하다 고치지 마십시오 (38.5) |
| 기록 위치 | 결과를 버전 관리·객체 잠금이 걸린 버킷에 남깁니다. 이것이 곧 감사 증거입니다 (38.5) |

### 2) 판정 규칙 — "부분적으로"는 아니오

40.4가 진단 체크리스트에서 못박은 규칙을 그대로 씁니다.

- **"GuardDuty는 켜져 있는데 서울 리전만"** → 아니오
- **"백업은 있는데 같은 계정"** → 아니오
- **"설정은 했는데 아무도 결과를 안 본다"** → 아니오

관대한 진단은 틀린 지점에서 출발하는 로드맵을 만듭니다.

### 3) "아니오"가 나오면

| 순서 | 할 일 |
|---|---|
| ① | 본문 절로 가서 **무엇이 깨지는지** 확인합니다. 통제를 이해하지 않고 켜면 장애가 납니다 (37.3) |
| ② | 우선순위(P0/P1/P2)에 따라 일정에 넣습니다. **P0는 일정이 아니라 오늘 할 일입니다** |
| ③ | 이번 분기에 못 고칠 항목은 **리스크 등록부**에 등재합니다 — 승인자 이름과 재평가 일자를 반드시 함께 (4.1) |
| ④ | 고친 뒤에는 **다시 꺼지지 않게** 만듭니다. SCP·Config 규칙·정책 게이트 중 하나로 강제합니다 (28.3, 37.2) |

④가 핵심입니다. 40.4의 표현으로는 **A(통제가 존재하는가)에서 B(통제가 강제되는가)로 넘어가는 구간이 투자 대비 효과가 가장 큽니다.** 고쳤는데 강제하지 않으면 다음 분기에 같은 항목이 다시 아니오가 됩니다.

### 4) 우선순위의 뜻

| 등급 | 의미 | 40.4 로드맵 대응 |
|---|---|---|
| **P0** | Day 1. 안 되어 있으면 **지금 즉시 위험**하고, 워크로드를 올릴 상태가 아님 | 0~1개월 단계 |
| **P1** | 30일 내. 사고가 나면 **탐지·대응·복구가 불가능해지는** 통제 | 1~3개월 단계 |
| **P2** | 90일 내. 운영을 **반복 가능·증명 가능**하게 만드는 통제 | 3~12개월 단계 |

P0 20항목은 5.7의 Day 1 체크리스트, 40.1의 통제 20개와 정합하도록 골랐습니다.

### 5) 재점검 주기

| 대상 | 주기 | 방법 |
|---|---|---|
| P0 20항목 | **주 1회** | A-7 자동 점검 스크립트 + Security Hub 보안 점수 |
| 100항목 전수 | **분기 1회** | 이 부록 전체. 결과를 증거 번들에 적재 (38.5) |
| 신규 계정 | **생성 후 30분 내** | 베이스라인 StackSet이 자동 적용했는지 확인 (37.9) |
| 아키텍처 변경 시 | **변경 즉시** | 영향받는 범주만 (28.5) |

⚠️ **이 체크리스트를 다 채웠다고 안전해진 것이 아닙니다.** 100항목은 "빠지면 사고가 나는 것"의 목록이지 "할 수 있는 전부"가 아닙니다. 조직 고유의 위협 모델(3장)과 규제 요구(4.3)에서 나오는 항목을 각자 덧붙이십시오.

---

## A-0.5 📋 오늘 당장 — P0 20항목 요약

5.7 Day 1 체크리스트와 40.1의 "1일차 / 2~3일차" 묶음에 대응합니다. **이 20개가 미완인 계정에는 운영 워크로드를 올리지 마십시오.**

| # | 항목 | 범주 | 본문 |
|---|---|---|---|
| 1 | 루트 사용자에 MFA(하드웨어 우선)가 등록되어 있다 | A-1 | 5.1 |
| 2 | 루트 액세스 키가 0개다 | A-1 | 5.1 |
| 3 | 루트 이메일이 배포 리스트이고 대체 연락처 3종·계정 별칭이 등록되어 있다 | A-1 | 5.1 |
| 4 | 루트 사용·관리 계정 콘솔 로그인에 알람이 걸려 있다 | A-1 | 5.1 |
| 5 | 예산 알람(ACTUAL+FORECASTED)과 비용 이상 탐지가 있다 | A-1 | 5.4 |
| 6 | 모든 사람 아이덴티티에 MFA가 강제된다 | A-1 | 5.2 |
| 7 | 사람이 보유한 액세스 키가 0개이고, 90일 초과 활성 키가 0개다 | A-1 | 5.6 |
| 8 | 코드·Git 히스토리·User Data·AMI·환경 변수에 시크릿이 없다 | A-1 | 11.1 |
| 9 | 계정 수준 S3 퍼블릭 액세스 차단 4개 항목이 모두 켜져 있다 | A-2 | 15.2 |
| 10 | 모든 RDS/Aurora가 저장 암호화·TLS 강제이고 `PubliclyAccessible=false`다 | A-2 | 16.2 |
| 11 | 퍼블릭 EBS 스냅샷·AMI·RDS 스냅샷이 전 계정·전 리전에서 0건이다 | A-2 | 16.7 |
| 12 | 백업이 다른 계정 또는 최소한 다른 리전에 불변으로 있고, 복원을 해 봤다 | A-2 | 17.3 |
| 13 | 어떤 SG에도 `0.0.0.0/0`·`::/0`의 22/3389가 없고, 기본 SG 규칙이 비어 있다 | A-3 | 19.3 |
| 14 | 관리 접근이 SSM Session Manager로 통일되어 있다(배스천·SSH 키 없음) | A-3 | 21.5 |
| 15 | 앱 인스턴스에 퍼블릭 IP와 SSH 키 페어가 없다 | A-4 | 22.1 |
| 16 | CloudTrail이 다중 리전 + 글로벌 이벤트 + 로그 파일 검증으로 켜져 있다 | A-5 | 29.2 |
| 17 | 30.3의 필수 보안 알람 15종이 존재하고 수신자에게 실제로 도착한다 | A-5 | 30.3 |
| 18 | GuardDuty가 모든 계정·모든 사용 리전에서 켜져 있다 | A-5 | 31.1 |
| 19 | Security Hub(FSBP+CIS)가 켜져 있고 결과가 단일 큐로 모인다 | A-5 | 31.5 |
| 20 | CI/CD에 장기 AWS 액세스 키가 0개다(OIDC 페더레이션) | A-6 | 27.6 |

📋 **출력용 체크박스**

- [ ] 1 루트 MFA  - [ ] 2 루트 키 0  - [ ] 3 루트 이메일·연락처·별칭  - [ ] 4 루트 사용 알람  - [ ] 5 예산·이상 탐지 알람
- [ ] 6 사람 MFA 강제  - [ ] 7 액세스 키 위생  - [ ] 8 시크릿 부재  - [ ] 9 S3 계정 BPA  - [ ] 10 RDS 암호화·비퍼블릭
- [ ] 11 퍼블릭 스냅샷 0  - [ ] 12 불변 백업 + 복원 테스트  - [ ] 13 SG 개방 0  - [ ] 14 Session Manager 전용  - [ ] 15 퍼블릭 IP·키 페어 없음
- [ ] 16 CloudTrail  - [ ] 17 보안 알람 15종  - [ ] 18 GuardDuty  - [ ] 19 Security Hub  - [ ] 20 CI 장기 키 0

---

## A-1 계정 · 아이덴티티 (20항목)

대응 본문: 5~11장, 36장

| # | 점검 항목 | 왜 필요한가 | 본문 | 우선순위 | 확인 방법 |
|---|---|---|---|---|---|
| A-1-01 | 루트 사용자에 MFA가 등록되어 있다(하드웨어 우선, 디바이스 2개) | 루트는 모든 통제를 무력화할 수 있고 SCP도 적용되지 않는다 | 5.1 | **P0** | `aws iam get-account-summary` → `AccountMFAEnabled=1` / Config `root-account-mfa-enabled`, `root-account-hardware-mfa-enabled` |
| A-1-02 | 루트 액세스 키가 0개다 | 루트 키는 만료도 제한도 없는 무제한 자격 증명이다 | 5.1, 6.4 | **P0** | `aws iam get-account-summary` → `AccountAccessKeysPresent=0` / Config `iam-root-access-key-check` |
| A-1-03 | 루트 이메일이 회사 도메인 배포 리스트(수신자 2인 이상)이고, 대체 연락처 3종(SECURITY·OPERATIONS·BILLING)과 계정 별칭이 등록되어 있다 | AWS의 침해·남용 통보가 개인 메일함에서 사라지면 사고를 마지막에 알게 된다 | 5.1, 36.3 | **P0** | `aws account get-alternate-contact --alternate-contact-type SECURITY` / `aws iam list-account-aliases` |
| A-1-04 | 루트 사용과 관리 계정 콘솔 로그인에 즉시 알람이 걸려 있다 | 루트 로그인은 정상 운영에서 월 1회 미만이어야 하며, 그 이상은 사건이다 | 5.1, 30.3, 36.6 | **P0** | `aws events list-rules --region us-east-1` → 루트 활동 규칙 `ENABLED`, SNS 구독이 `Confirmed` |
| A-1-05 | 결제 알림 수신 + 다단계 빌링 알람 + Budgets `ACTUAL`·`FORECASTED` + Cost Anomaly Detection이 모두 있다 | 크립토마이닝·계정 탈취의 첫 신호가 요금인 경우가 많다 | 5.4 | **P0** | `aws budgets describe-budgets --account-id <ID>` → 두 알림 유형 존재 / `aws ce get-anomaly-monitors` |
| A-1-06 | 모든 사람 아이덴티티에 MFA가 강제된다(`BoolIfExists` 조건, 워크로드 역할은 예외 처리) | `Bool`을 쓰면 MFA 없이 받은 세션이 조건을 통과해 강제가 무력화된다 | 5.2, 7.4, 9.4 | **P0** | `aws iam get-credential-report` → MFA 미설정 사용자 0명 / Config `mfa-enabled-for-iam-console-access` |
| A-1-07 | 사람이 보유한 액세스 키가 0개이고, 90일 초과 활성 키도 0개다 | 장기 키는 유출되면 만료되지 않는다 — 공개 저장소의 키는 분 단위로 악용된다 | 5.6, 6.4 | **P0** | `aws iam get-credential-report` 디코드 후 `access_key_1_last_rotated` 확인 / Config `access-keys-rotated` |
| A-1-08 | 코드·Git 전체 히스토리·User Data·AMI 레이어·환경 변수에 시크릿이 없고, 푸시 차단(push protection)이 활성이다 | 커밋된 시크릿은 삭제해도 히스토리에 남는다 — 대응은 삭제가 아니라 **순환**이다 | 11.1, 22.4 | **P0** | 저장소 시크릿 스캐닝 결과 0건 / `aws ec2 describe-instance-attribute --attribute userData` 전수 디코드 |
| A-1-09 | 사람 접근이 IAM Identity Center로 단일화되어 있고, 권한은 그룹·권한 세트로만 부여된다(사용자 직접 부착 0건) | 사용자별 개별 부여는 회수 누락을 만들고, 퇴사자 권한이 남는 주된 원인이다 | 5.2, 6.1, 9.2 | P1 | `aws iam list-users` → 사람 사용자 0명(목표), `aws iam list-attached-user-policies` 전원 빈 결과 / Config `iam-user-no-policies-check` |
| A-1-10 | 계정 암호 정책이 설정되어 있다(길이 20자 이상, 재사용 방지, `--hard-expiry` 미사용) | 짧은 암호 정책은 크리덴셜 스터핑에 그대로 뚫린다. `hard-expiry`는 계정 잠김을 만든다 | 5.6 | P1 | `aws iam get-account-password-policy` / Config `iam-password-policy` |
| A-1-11 | CI/CD가 OIDC 단기 자격 증명을 쓰고, 신뢰 정책의 `sub` 조건이 브랜치·환경 수준까지 좁혀져 있다 | `repo:*/*` 형태의 조건은 포크 PR에서도 운영 배포 역할을 얻게 한다 | 6.4, 27.6 | P1 | 역할 신뢰 정책에서 `token.actions.githubusercontent.com:sub` 조건 확인, `aud` 조건 동시 존재 |
| A-1-12 | 모든 EC2에 인스턴스 프로파일이 붙어 있고, 인스턴스 안에 정적 자격 증명 파일이 없다 | 키를 파일에 두는 순간 스냅샷·AMI·백업으로 복제된다 | 8.2, 22.3 | P1 | `aws ec2 describe-instances --query 'Reservations[].Instances[?!IamInstanceProfile].InstanceId'` / Config `ec2-instance-profile-attached` |
| A-1-13 | 전 인스턴스에 IMDSv2가 강제(`HttpTokens=required`)되고 홉 제한이 **1**로 지정(컨테이너 호스트는 전용 자격 증명 경로 전환 기간에만 한시적 2)되어 있으며, 계정·리전 기본값과 SCP로도 강제된다 | SSRF 한 방으로 역할 자격 증명이 통째로 유출되는 경로를 닫는다 | 8.3 | P1 | `aws ec2 describe-instances --query 'Reservations[].Instances[].MetadataOptions.HttpTokens'` / Config `ec2-imdsv2-check` |
| A-1-14 | IAM 정책 위생 — `Allow`에 `NotAction`/`NotResource`가 없고, `"Action":"*"`+`"Resource":"*"` 조합이 관리자 역할 외에 없으며, `iam:PassRole`이 역할 ARN 열거 + `iam:PassedToService` 조건으로 제한된다 | `PassRole`이 열려 있으면 낮은 권한으로 높은 권한 역할을 달아 권한 상승이 가능하다 | 7.3, 7.4, 7.5 | P1 | `aws accessanalyzer validate-policy` CI 통과 / Config `iam-policy-no-statements-with-admin-access` |
| A-1-15 | 크로스 계정 신뢰·리소스 정책에 조건이 걸려 있다 — `Principal`에 `"*"` 없음, 서드파티 역할에 `sts:ExternalId`, 조직 내부에 `aws:PrincipalOrgID`, AWS 서비스 신뢰에 `aws:SourceAccount`(+`aws:SourceArn`) | 조건 없는 신뢰 정책은 Confused Deputy로 남의 계정에서 우리 리소스를 만지게 한다 | 8.6, 7.4, 15.5 | P1 | `aws iam list-roles` 후 `AssumeRolePolicyDocument` 전수 검사(조건 없는 외부 계정 신뢰 0건) |
| A-1-16 | IAM Access Analyzer가 조직 단위(`ORGANIZATION`)로 보안 도구 계정에 존재하고, 외부 접근 결과가 0건(의도된 것 제외)이며 미사용 액세스 분석기도 활성이다 | "누가 우리 리소스에 외부에서 닿을 수 있는가"를 기계가 대신 답하게 한다 | 7.7, 3.4 | P1 | `aws accessanalyzer list-analyzers --type ORGANIZATION` / `list-findings`로 `ACTIVE` 0건 |
| A-1-17 | 모든 시크릿이 Secrets Manager 또는 Parameter Store `SecureString`에 있고 고객 관리형 KMS 키로 암호화되며, IAM이 시크릿 ARN·경로 단위로 좁혀져 있다(`kms:ViaService` 조건 포함) | `String` 오지정 하나로 시크릿이 평문 파라미터가 된다. 와일드카드 ARN은 인접 시크릿까지 연다 | 11.2, 11.3 | P1 | `aws ssm describe-parameters --query 'Parameters[?Type!=\`SecureString\`]'` / Config `secretsmanager-using-cmk` |
| A-1-18 | DB 자격 증명에 자동 순환이 활성이고(운영은 다중 사용자 교대), 순환 실패가 3중으로 탐지된다 | 순환은 켜는 것보다 **실패를 알아채는 것**이 어렵다 — 조용히 멈춘 순환은 순환이 아니다 | 11.5 | P1 | `aws secretsmanager describe-secret --secret-id rds/shopmini` → `RotationEnabled=true`, `LastRotatedDate` 최신 / Config `secretsmanager-rotation-enabled-check` |
| A-1-19 | Cognito 사용자 풀이 하드닝되어 있다 — MFA 활성, 위협 보호 `ENFORCED`, 토큰 취소 활성, `--prevent-user-existence-errors ENABLED`, 퍼블릭 클라이언트는 시크릿 없이 `code` 그랜트 + PKCE | 사용자 열거와 토큰 재사용은 고객 아이덴티티에서 가장 흔한 사고 경로다 | 10.2, 10.4 | P1 | `aws cognito-idp describe-user-pool` / `describe-user-pool-client`로 플로우·토큰 설정 확인 |
| A-1-20 | 관리자 상시 권한이 최소화되어 있다 — JIT 승격 + 명시적 승인, 관리자 권한 세트 세션 1시간, 권한 경계 부착, 분기 접근 재검증(긍정 확인)과 퇴사·직무 변경 시 활성 세션 삭제 | 상시 관리자 수는 침해 시 폭발 반경을 그대로 결정한다 | 9.5, 9.6 | P2 | `aws sso-admin describe-permission-set` → `SessionDuration=PT1H`, 재검증 증거 문서 |

📋 **A-1 출력용 체크박스**

- [ ] 루트 MFA(하드웨어) — [ ] 루트 액세스 키 0 — [ ] 루트 이메일 배포 리스트·대체 연락처 3종·계정 별칭
- [ ] 루트 사용·관리 계정 로그인 알람 — [ ] 예산·빌링·비용 이상 탐지 알람
- [ ] 사람 MFA 강제(`BoolIfExists`) — [ ] 사람 액세스 키 0 / 90일 초과 키 0 — [ ] 코드·Git·User Data·AMI에 시크릿 없음
- [ ] Identity Center 단일화 + 권한은 그룹·권한 세트로만 — [ ] 암호 정책
- [ ] CI/CD OIDC(`sub`·`aud` 조건) — [ ] 전 EC2 인스턴스 프로파일 — [ ] IMDSv2 강제 + 홉 제한
- [ ] IAM 정책 위생(NotAction·와일드카드·PassRole) — [ ] 크로스 계정 신뢰·리소스 정책 조건
- [ ] Access Analyzer(조직 + 미사용 액세스) — [ ] 시크릿 저장소 + 고객 관리형 키 + ARN 단위 IAM
- [ ] DB 자격 증명 자동 순환 + 실패 탐지 — [ ] Cognito 하드닝 — [ ] 관리자 JIT·세션 1시간·분기 재검증

---

## A-2 데이터 보호 (20항목)

대응 본문: 12~17장

| # | 점검 항목 | 왜 필요한가 | 본문 | 우선순위 | 확인 방법 |
|---|---|---|---|---|---|
| A-2-01 | 데이터 분류 4등급의 정의와 예시가 문서로 있고, 모든 데이터 저장소(스냅샷·백업·로그·시크릿 포함)에 등급이 배정되어 있다 | 등급이 없으면 "어디에 무엇이 있는지 모른다"가 계속되고, 통제 수준을 결정할 수 없다 | 4.2, 12.2 | P1 | 인벤토리 대장에 `DataClass` 열이 전부 채워짐 — 빈 행 0 |
| A-2-02 | 필수 태그 표준이 확정되고 Organizations 태그 정책(`enforced_for`) + SCP(태그 없는 생성 차단·값 오기 차단·태그 제거 차단) + Config `required-tags`로 3중 강제된다 | 태그는 분류·비용·격리의 공통 축이다. 강제 없는 태그는 며칠 만에 비어 간다 | 12.3 | P1 | `aws organizations describe-policy --policy-id <태그 정책>` / Config `required-tags` 비준수 0건 |
| A-2-03 | Amazon Macie가 조직 위임 관리자로 구성되고 신규 계정 자동 등록이 켜져 있으며, 분류 작업에 스코핑이 걸리고 결과가 Security Hub·EventBridge로 나간다 | 스코핑 없는 Macie는 비용이 폭증하고, 결과가 큐에 닿지 않으면 발견은 발견이 아니다 | 12.4, 31.3 | P2 | `aws macie2 get-macie-session` / `aws macie2 describe-organization-configuration` → `autoEnable=true` |
| A-2-04 | 데이터 보존·파기 정책이 있고, S3 라이프사이클에 **비현행 버전 만료**와 **미완료 멀티파트 업로드 중단**이 설정되어 있다 | 버저닝만 켜고 라이프사이클이 없으면 삭제한 데이터가 영원히 남고 비용도 영원히 는다 | 12.6, 15.8 | P2 | `aws s3api get-bucket-lifecycle-configuration --bucket <버킷>` → 두 규칙 존재 |
| A-2-05 | 분류 등급 "내부" 이상 데이터가 **고객 관리형 KMS 키**로 암호화된다 | AWS 관리형 키는 키 정책을 우리가 통제할 수 없어 크로스 계정 공유·삭제 방지·감사가 불가능하다 | 13.4, 4.2 | P1 | `aws kms describe-key --key-id <키>` → `KeyManager=CUSTOMER` / 리소스별 `KmsKeyId`가 고객 관리형 키 ARN |
| A-2-06 | 키 정책에 키 관리자 역할과 키 사용자 역할이 분리 명시되고, `EnableIAMUserPermissions` 문장이 유지되며, 키 사용자 문장에 `kms:ViaService` 조건과 암호화 컨텍스트(`Null` 조건) 강제가 있다 | 키 정책이 접근 통제의 최종 관문이다. `ViaService`가 없으면 KMS 직접 호출 경로가 열린 채 남는다 | 13.4, 13.9 | P1 | `aws kms get-key-policy --policy-name default` 로 조건 존재 확인 |
| A-2-07 | 모든 키에 자동 순환이 활성이고, 자동 순환이 불가능한 키(BYOK·CloudHSM 지원 키)는 **수동 순환 절차와 주기가 문서화·등록**되어 있다 | 순환하지 않는 키는 유출 시 소급 복호화 범위가 무한하다 | 13.6, 14.5 | P1 | `aws kms get-key-rotation-status --key-id <키>` / Config `cmk-backing-key-rotation-enabled` |
| A-2-08 | KMS 위험 API(`ScheduleKeyDeletion`·`PutKeyPolicy`·`DisableKey`·`RevokeGrant`)에 알람이 걸리고 SCP로 제한된다. 운영 키의 삭제 대기 기간은 30일이다 | 키 삭제는 되돌릴 수 없는 데이터 파괴다 — 랜섬웨어의 가장 빠른 경로이기도 하다 | 13.11, 17.4 | P1 | `aws events list-rules`로 KMS 규칙 존재 / SCP에 `kms:ScheduleKeyDeletion` Deny |
| A-2-09 | 계정 수준 S3 퍼블릭 액세스 차단 4개 항목이 모든 계정에서 `true`이고, SCP로 해제가 금지된다 | 버킷 하나의 실수로 전체 데이터가 인터넷에 열리는 가장 흔한 사고를 계정 단위로 봉인한다 | 15.2 | **P0** | `aws s3control get-public-access-block --account-id <ID>` → 4개 모두 `true` / Config `s3-account-level-public-access-blocks-periodic` |
| A-2-10 | 신규 버킷이 `BucketOwnerEnforced`(ACL 비활성)로 생성되고, 기존 버킷에 전환 계획이 있다 | ACL은 버킷 정책과 별개의 두 번째 접근 경로다 — 정책만 보고 안심하게 만든다 | 15.1, 15.3 | P1 | `aws s3api get-bucket-ownership-controls --bucket <버킷>` → `BucketOwnerEnforced` |
| A-2-11 | 모든 데이터 버킷 정책에 TLS 강제(`aws:SecureTransport` Deny)와 조직 제한(`aws:PrincipalOrgID`) 가드레일이 있다 | 평문 HTTP 요청과 조직 밖 프린시펄을 리소스 정책 층에서 차단한다(심층 방어 4층) | 15.4, 1.2 | P1 | `aws s3api get-bucket-policy` / Config `s3-bucket-ssl-requests-only` |
| A-2-12 | 버킷 기본 암호화가 고객 관리형 KMS 키이고, 다른 키·비암호화 업로드가 버킷 정책으로 거부된다 | 기본 암호화만으로는 클라이언트가 다른 키를 지정한 업로드를 막지 못한다 | 15.7, 2.2 | P1 | `aws s3api get-bucket-encryption --bucket <버킷>` → `aws:kms` + 고객 관리형 키 ARN |
| A-2-13 | 모든 데이터 버킷에 버전 관리가 켜져 있고 `s3:DeleteObjectVersion`이 정책으로 잠겨 있다 | 버저닝이 없으면 덮어쓰기 한 번으로 원본이 사라진다. 랜섬웨어 복구의 전제 조건이다 | 15.8, 17.5 | P1 | `aws s3api get-bucket-versioning --bucket <버킷>` → `Status=Enabled` / Config `s3-bucket-versioning-enabled` |
| A-2-14 | 불변이 필요한 버킷(로그·증적·규제 데이터)에 객체 잠금이 걸려 있고, 운영 계정 관리자가 지울 수 없다 | 로그를 지울 수 있는 사람이 있으면 그 로그는 증거가 아니다 | 15.9, 29.3, 34.2 | P1 | `aws s3api get-object-lock-configuration --bucket <버킷>` / Config `s3-bucket-default-lock-enabled` |
| A-2-15 | 전 리전에서 EBS 기본 암호화가 켜져 있고 기본 키가 고객 관리형이며, 미암호화 볼륨·스냅샷이 0건이다 | 기본값이 꺼진 리전 하나가 평문 볼륨을 계속 만들어 낸다 | 16.1 | P1 | `aws ec2 get-ebs-encryption-by-default --region <각 리전>` → `true` / Config `encrypted-volumes`, `ec2-ebs-encryption-by-default` |
| A-2-16 | 모든 RDS/Aurora가 저장 암호화(고객 관리형 키)이고, `require_secure_transport`/`rds.force_ssl`이 강제되며, `PubliclyAccessible=false`로 격리 서브넷에 있다 | 저장 암호화는 **생성 후에 켤 수 없고**, 퍼블릭 DB는 인터넷에서 직접 브루트포스 대상이 된다 | 16.2, 2.3 | **P0** | `aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,StorageEncrypted,PubliclyAccessible]'` / Config `rds-storage-encrypted`, `rds-instance-public-access-check` |
| A-2-17 | 민감 DynamoDB 테이블이 고객 관리형 키이고 **PITR이 켜져 있으며**, 최종 사용자 정책에 `Scan`이 없고 `dynamodb:LeadingKeys`로 제한된다 | PITR 기본값은 꺼짐이다. `Scan` 권한 하나가 테이블 전체 유출로 이어진다 | 16.3 | P1 | `aws dynamodb describe-continuous-backups --table-name <테이블>` / Config `dynamodb-pitr-enabled` |
| A-2-18 | EFS/FSx가 암호화되어 있고 `tls` 마운트 + 접근 지점 + 파일 시스템 정책 3중이며, `ClientRootAccess`를 가진 주체가 백업 도구뿐이다 | 파일 시스템은 POSIX 권한만으로 지켜지지 않는다 — AWS 층의 정책이 있어야 한다 | 16.4 | P2 | `aws efs describe-file-systems --query 'FileSystems[].[FileSystemId,Encrypted]'` / Config `efs-encrypted-check` |
| A-2-19 | 퍼블릭 EBS 스냅샷·AMI·RDS 스냅샷이 전 계정·전 리전에서 0건이고, 스냅샷·이미지 블록 퍼블릭 액세스가 전 리전에 적용되어 있으며, 공유 API 호출이 알람 대상이다 | 스냅샷 하나의 공개는 볼륨 전체 공개와 같다. 그리고 아무 로그도 남기지 않고 복사된다 | 16.7, 12.5 | **P0** | `aws ec2 describe-snapshots --owner-ids self --restorable-by-user-ids all` → 빈 결과 / `aws ec2 get-snapshot-block-public-access-state` |
| A-2-20 | AWS Backup 계획이 **태그 조건**으로 자동 포함되고, `CopyActions`로 크로스 계정 + 크로스 리전 사본을 만들며, 목적지 볼트에 볼트 잠금(컴플라이언스 모드)이 걸려 있고, 분기 1회 크로스 계정 복원 훈련을 수행한다 | 같은 계정의 백업은 계정이 털리면 함께 털린다. 복원해 보지 않은 백업은 백업이 아니다 | 17.1, 17.3, 17.4, 17.6 | **P0** | `aws backup list-backup-plans` + `get-backup-plan`에 `CopyActions` / `aws backup describe-backup-vault` → `Locked=true` / 복원 훈련 기록 |

📋 **A-2 출력용 체크박스**

- [ ] 데이터 분류 등급 전수 배정 — [ ] 태그 표준 3중 강제 — [ ] Macie 조직 구성 — [ ] 보존·파기 + S3 라이프사이클
- [ ] 내부 이상 데이터 고객 관리형 키 — [ ] 키 정책 역할 분리 + `ViaService` + 암호화 컨텍스트 — [ ] 키 순환(자동/수동 절차)
- [ ] KMS 위험 API 알람 + SCP — [ ] S3 계정 BPA 4항목 — [ ] `BucketOwnerEnforced`
- [ ] 버킷 정책 TLS + OrgID — [ ] 기본 암호화 고객 관리형 키 + 타 키 거부 — [ ] 버저닝 + 버전 삭제 잠금 — [ ] 객체 잠금(로그·증적)
- [ ] EBS 기본 암호화 전 리전 — [ ] RDS 암호화·TLS·비퍼블릭 — [ ] DynamoDB 고객 관리형 키 + PITR — [ ] EFS/FSx 3중 통제
- [ ] 퍼블릭 스냅샷·AMI 0 — [ ] 백업 크로스 계정·볼트 잠금·복원 훈련

---

## A-3 네트워크 (15항목)

대응 본문: 18~21장

| # | 점검 항목 | 왜 필요한가 | 본문 | 우선순위 | 확인 방법 |
|---|---|---|---|---|---|
| A-3-01 | VPC CIDR이 조직 IP 계획 문서에 근거해 배정되었고, 온프레미스·기존 VPC·피어 대상과 겹치지 않으며 확장용 상위 대역이 예약되어 있다 | CIDR이 겹치면 나중에 TGW·피어링·VPN을 붙일 수 없고, 재설계 비용이 이전 비용을 넘긴다 | 18.2 | P2 | IP 계획 문서와 `aws ec2 describe-vpcs --query 'Vpcs[].CidrBlock'` 대조 |
| A-3-02 | Public / Private-App / Isolated-Data 3계층이 분리되어 최소 2개 AZ에 배치되어 있고, 서브넷 크기 산정에 AWS 예약 5개 IP와 ENI 소비량이 반영되었다 | 계층이 없으면 "인터넷에서 DB까지 2홉"이 되고, IP 고갈은 장애로 나타난다 | 18.3 | P1 | `aws ec2 describe-subnets --filters Name=vpc-id,Values=<VPC>` 로 계층·AZ 확인 |
| A-3-03 | 메인 라우팅 테이블에 `0.0.0.0/0` 인터넷 경로가 없고, 모든 서브넷이 라우팅 테이블에 **명시적으로 연결**되어 있으며, 퍼블릭 IP 자동 할당이 비활성이다 | 암묵 연결된 서브넷은 메인 라우팅 테이블을 물려받는다 — 새 서브넷 하나가 조용히 퍼블릭이 된다 | 18.4 | P1 | `aws ec2 describe-route-tables --filters Name=association.main,Values=true` / Config `no-unrestricted-route-to-igw`, `subnet-auto-assign-public-ip-disabled` |
| A-3-04 | Isolated-Data 서브넷 라우팅 테이블에 IGW·NAT 경로가 **아예 없다**(`0.0.0.0/0`·`::/0` 부재) | DB 계층에서 인터넷으로 나가는 경로가 곧 데이터 유출 경로다 | 18.4, 19.3, 20.4 | P1 | `aws ec2 describe-route-tables` 에서 해당 RTB에 `DestinationCidrBlock=0.0.0.0/0` 없음 |
| A-3-05 | 기본 VPC가 사용하지 않는 전 리전에서 삭제되었고, 미사용 옵트인 리전이 비활성화되어 있으며 `aws:RequestedRegion` 제한이 적용된다 | 기본 VPC는 모든 서브넷이 퍼블릭이다. 쓰지 않는 리전은 감시도 되지 않는다 | 5.5, 18.3 | P1 | `aws ec2 describe-vpcs --filters Name=isDefault,Values=true --region <각 리전>` → 빈 결과 / `aws account list-regions` |
| A-3-06 | NAT 게이트웨이가 AZ당 1개로 퍼블릭 서브넷에 있고, Private-App 라우팅 테이블이 AZ별로 분리되어 있다 | AZ 하나가 끊길 때 다른 AZ 트래픽이 함께 죽는 구성을 피한다(가용성도 보안 요구사항이다) | 18.5, 2.2 | P2 | `aws ec2 describe-nat-gateways` 로 AZ 분산 확인 |
| A-3-07 | 모든 티어 간 허용이 **보안 그룹 참조**로 표현되어 있다(VPC 내부 CIDR을 소스로 쓰지 않는다). 모든 규칙에 Description이 있고 임시 규칙에 만료일 태그가 있다 | CIDR 기반 허용은 그 대역의 미래 리소스 전부를 미리 허용하는 것과 같다 | 19.2 | P1 | `aws ec2 describe-security-groups --query 'SecurityGroups[].IpPermissions[].IpRanges'` 에 내부 대역이 없음 |
| A-3-08 | 모든 SG에서 기본 아웃바운드 `0.0.0.0/0` 규칙이 제거되고 필요한 것만 명시되어 있으며, **DB 보안 그룹의 아웃바운드가 비어 있다** | 이그레스가 열려 있으면 침해 후 데이터 반출과 C2 통신을 막을 층이 없다 | 19.2, 19.6 | P1 | `aws ec2 describe-security-groups --query 'SecurityGroups[?length(IpPermissionsEgress)>`0`]'` 검토 |
| A-3-09 | 어떤 SG에도 `0.0.0.0/0`·`::/0`의 22/3389 인바운드가 없고, 모든 VPC의 **기본 보안 그룹 규칙이 비어 있다** | 열린 SSH/RDP는 계정 생성 몇 분 만에 스캐너에 발견된다. 기본 SG는 아무도 안 보는 채로 붙는다 | 19.3 | **P0** | `aws ec2 describe-security-groups --filters Name=ip-permission.cidr,Values=0.0.0.0/0` / Config `restricted-ssh`, `restricted-common-ports`, `vpc-default-security-group-closed` |
| A-3-10 | NACL 규칙 번호 1–99 대역이 긴급 차단용으로 비어 있고, 응답용 임시 포트 1024–65535 아웃바운드 규칙이 있다 | NACL은 상태 비저장이다 — 임시 포트를 좁히면 정상 응답이 끊긴다. 1–99는 사고 시 한 줄로 막기 위한 예약이다 | 19.1, 19.4, 33.4 | P2 | `aws ec2 describe-network-acls` 로 규칙 번호 대역 확인 |
| A-3-11 | 이그레스 필터링이 최소 한 층 있다 — Route 53 Resolver DNS Firewall에 관리형 위협 도메인 목록이 연결되어 있고, 필요 시 Network Firewall이 `STRICT_ORDER` + 로깅 활성으로 구성되어 있다 | DNS 기반 반출과 C2 도메인 접속을 가장 싸게 막는 층이다 | 19.5, 19.6 | P1 | `aws route53resolver list-firewall-rule-group-associations` → VPC별 연결 존재 |
| A-3-12 | S3 게이트웨이 엔드포인트가 **모든** 프라이빗·격리 라우팅 테이블에 연결되어 있고, 모든 엔드포인트에 Full Access가 아닌 정책이 붙어 있다 | 게이트웨이 엔드포인트는 무료다 — 안 붙일 이유가 없고, 정책 없는 엔드포인트는 전 세계 S3로 가는 통로다 | 20.1, 20.3 | P1 | `aws ec2 describe-vpc-endpoints --query 'VpcEndpoints[].[ServiceName,PolicyDocument]'` |
| A-3-13 | 엔드포인트 정책에 **신원 축**(`aws:PrincipalOrgID`)과 **리소스 축**(`aws:ResourceOrgID` 또는 `s3:ResourceAccount`)이 **둘 다** 있다 | 한 축만 있으면 "우리 역할로 남의 버킷에" 또는 "남의 역할로 우리 버킷에" 중 하나가 열린 채 남는다 | 20.3 | P1 | 엔드포인트 정책 문서에서 두 조건 키 동시 존재 확인 |
| A-3-14 | 관리 접근이 SSM Session Manager로 통일되어 있다 — 배스천·SSH 키 없음, 모든 세션이 S3+CloudWatch Logs에 KMS 암호화로 기록되어 로그 아카이브 계정에 있고, `idleSessionTimeout`·`maxSessionDuration`이 설정되어 있다 | 배스천은 상시 열린 인터넷 접점이고, 기록 없는 관리 접근은 사고 조사에서 공백이 된다 | 21.5, 21.6 | **P0** | `aws ssm describe-instance-information` 로 커버리지 / `aws ssm get-document --name SSM-SessionManagerRunShell` 로 로깅 설정 |
| A-3-15 | 하이브리드 연결이 안전하게 구성되어 있다 — VPN 터널 2개 + BGP + IKEv1/약한 DH 그룹 제거, Direct Connect 구간도 애플리케이션 계층 TLS로 보호, TGW의 기본 연결·전파가 `disable`이고 `AutoAcceptSharedAttachments`가 `disable`, RAM 공유가 조직 내부로 제한 | 전용선은 암호화된 회선이 아니다. TGW 기본 연결은 모든 VPC를 한 라우팅 도메인에 합친다 | 21.1, 21.2, 21.3 | P2 | `aws ec2 describe-transit-gateways --query 'TransitGateways[].Options'` / `aws ram get-resource-shares --resource-owner SELF` |

📋 **A-3 출력용 체크박스**

- [ ] CIDR 계획·중복 없음 — [ ] 3계층 × 2AZ 서브넷 — [ ] 메인 RTB 인터넷 경로 없음 + 명시적 연결 + 퍼블릭 IP 비활성
- [ ] 격리 서브넷 IGW/NAT 경로 없음 — [ ] 기본 VPC 삭제 + 미사용 리전 차단 — [ ] NAT AZ 분산
- [ ] SG 참조 체인 + Description — [ ] 아웃바운드 최소화 + DB SG 아웃바운드 공백 — [ ] 22/3389 개방 0 + 기본 SG 공백
- [ ] NACL 1–99 예약 + 임시 포트 — [ ] DNS Firewall 이그레스 필터링
- [ ] S3 게이트웨이 엔드포인트 전면 + 엔드포인트 정책 — [ ] 엔드포인트 정책 신원·리소스 양축
- [ ] Session Manager 전용 + 세션 로깅 — [ ] 하이브리드(VPN 2터널·TGW 기본값·RAM 제한)

---

## A-4 컴퓨트 · 애플리케이션 (15항목)

대응 본문: 22~24장

| # | 점검 항목 | 왜 필요한가 | 본문 | 우선순위 | 확인 방법 |
|---|---|---|---|---|---|
| A-4-01 | 앱 인스턴스에 퍼블릭 IP가 없고(`MapPublicIpOnLaunch=false`), 시작 템플릿에 `KeyName`이 없다. 남아 있는 키 페어에는 `Owner`·`ExpiresOn` 태그와 만료 점검이 있다 | 퍼블릭 IP + SSH 키는 "인터넷에서 직접 로그인 가능한 서버"라는 뜻이다 | 22.1, 22.2 | **P0** | `aws ec2 describe-instances --query 'Reservations[].Instances[?PublicIpAddress].InstanceId'` → 빈 결과 / Config `ec2-instance-no-public-ip` |
| A-4-02 | 모든 인스턴스가 **시작 템플릿**을 통해 시작되고, 템플릿에 IMDSv2 강제·홉 제한 1·루트 볼륨 고객 관리형 키 암호화·종료 방지가 고정되어 있다 | 콘솔 직접 시작은 모든 베이스라인을 우회한다 — 통제는 템플릿에 박혀 있어야 한다 | 22.1, 8.3 | P1 | `aws ec2 describe-launch-templates` + `describe-launch-template-versions` 로 필드 확인 |
| A-4-03 | User Data 부팅 스크립트가 `set -euxo pipefail`로 시작하고, 민감 값은 스크립트에 박지 않고 Secrets Manager 조회로 가져온다 | 실패를 숨기는 부팅 스크립트는 "반쯤 구성된 서버"를 만들고, 그 상태가 가장 취약하다 | 22.4, 11.6 | P2 | `aws ec2 describe-instance-attribute --attribute userData` 디코드 후 검토 |
| A-4-04 | 골든 AMI가 파이프라인으로 만들어지고 `test` 단계가 자격 증명·SSH 키 잔존을 검사하며, AMI에 `Approved`·`BuildDate` 태그와 만료 AMI 폐기(`enable-image-deprecation`)가 적용된다 | 손으로 만든 AMI는 무엇이 들어갔는지 아무도 모르고, 오래된 AMI는 계속 배포된다 | 22.5, 27.4 | P2 | `aws imagebuilder list-image-pipelines` / `aws ec2 describe-images --owners self --query 'Images[].[Name,DeprecationTime]'` |
| A-4-05 | 모든 인스턴스가 SSM 관리형 인스턴스이고, 패치 베이스라인 + `Patch Group` 태그 + 유지 관리 기간(`--max-concurrency`·`--max-errors` 포함)이 구성되어 있으며, **패치 준수 보고를 주기적으로 읽는 사람이 있다** | SSM에 안 잡히는 인스턴스는 패치도 스캔도 세션 접근도 안 된다. 보고서 생성만으로는 통제가 아니다 | 22.6, 25.3 | P1 | `aws ssm describe-instance-information` 대 `describe-instances` 수 비교 / Config `ec2-instance-managed-by-systems-manager` |
| A-4-06 | 호스트 보호가 켜져 있다 — Amazon Inspector(EC2·ECR·Lambda·Lambda 코드 4유형, 전 사용 리전)와 GuardDuty Malware Protection·Runtime Monitoring이 활성이고 결과가 Security Hub로 모이며, 보안 에이전트가 **AMI에 포함**되어 있다 | 실행 중 인스턴스에 에이전트를 밀어 넣는 방식은 항상 일부가 누락된다 | 22.7, 26.3, 31.1 | P1 | `aws inspector2 batch-get-account-status` → 4개 리소스 유형 `ENABLED` |
| A-4-07 | 배포가 **인스턴스 새로 고침**으로만 이뤄지고 `AutoRollback`이 켜져 있으며, ASG에 `max-instance-lifetime`이 설정되어 있다 | 오래 살아 있는 인스턴스는 드리프트와 잔존 침해의 은신처가 된다 | 22.8, 28.4 | P2 | `aws autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[].MaxInstanceLifetime'` |
| A-4-08 | ACM 인증서를 DNS 검증으로 발급했고 검증 CNAME 레코드가 살아 있으며, CloudFront용 인증서를 `us-east-1`에 별도 발급해 **양쪽 모두** 만료 알람(`--treat-missing-data breaching`)이 있다 | CNAME을 지우면 자동 갱신이 조용히 멈추고, 만료는 전면 장애로 나타난다 | 23.2 | P1 | `aws acm describe-certificate --certificate-arn <ARN>` → `RenewalEligibility`, `ValidationMethod=DNS` / Config `acm-certificate-expiration-check` |
| A-4-09 | TLS가 끝에서 끝까지 구성되어 있다 — ALB→앱 구간이 HTTPS 8443(대상 그룹·헬스 체크 모두 HTTPS), ALB 리스너 정책이 `ELBSecurityPolicy-TLS13-1-2-2021-06` 이상, CloudFront `MinimumProtocolVersion`이 `TLSv1.2_2021`에 `redirect-to-https`, HSTS 헤더 부착 | VPC 내부 구간도 신뢰 경계를 가로지른다 — "내부망이니 평문"은 제로 트러스트 위반이다 | 23.5, 23.6, 1.3 | P1 | `aws elbv2 describe-listeners --query 'Listeners[].SslPolicy'` / `aws cloudfront get-distribution-config` |
| A-4-10 | ALB가 하드닝되어 있다 — `drop_invalid_header_fields=true`, `desync_mitigation_mode=strictest`, 삭제 보호, 액세스 로그 활성 | 요청 스머글링과 헤더 위조는 WAF를 통과해 백엔드에서 터진다 | 23.6 | P1 | `aws elbv2 describe-load-balancer-attributes --load-balancer-arn <ARN>` / Config `alb-http-drop-invalid-header-enabled` |
| A-4-11 | `shopmini-assets`가 **OAC + `AWS:SourceArn` 한정** 버킷 정책으로만 열려 있다(OAI가 아니다) | 오리진 버킷이 직접 열려 있으면 CloudFront의 WAF·로깅·지리 제한이 전부 우회된다 | 23.7, 15.4 | P1 | `aws s3api get-bucket-policy --bucket shopmini-assets` 에 `cloudfront.amazonaws.com` + `AWS:SourceArn` |
| A-4-12 | WAF가 구성되어 있다 — CloudFront 웹 ACL은 `us-east-1`/`--scope CLOUDFRONT`, 관리형 규칙 3종 + 속도 기반 규칙, 로깅이 `aws-waf-logs-` 대상으로 켜지고 `authorization`·`cookie`가 `RedactedFields`에 있으며, `BlockedRequests`에 상·하한 알람이 모두 있다 | 하한 알람이 없으면 WAF가 조용히 아무것도 막지 않게 된 상태를 알아채지 못한다 | 23.8 | P1 | `aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1` / `get-logging-configuration` |
| A-4-13 | WAF 우회 경로가 봉쇄되어 있다 — ALB SG 인바운드가 **CloudFront 관리형 접두사 목록**으로만 제한되고, ALB에 리전 웹 ACL과 오리진 커스텀 헤더 검증 규칙(우선순위 0)이 있으며, Firewall Manager 정책으로 웹 ACL 없는 ALB/CloudFront가 0건이다 | ALB 주소를 알아낸 공격자는 CloudFront를 건너뛰고 직접 때린다 | 23.9, 23.11 | P1 | `aws ec2 describe-security-groups` 에서 ALB SG의 `PrefixListIds` 확인 / `aws fms list-policies` |
| A-4-14 | 컨테이너 이미지가 안전하다 — 최소 베이스, `USER <숫자 UID>`로 비루트 실행, 레이어·`ENV`·`ARG`에 시크릿 없음, ECR 태그 불변성 `IMMUTABLE` + `scanOnPush=true` + 향상 스캔, 배포 매니페스트가 **다이제스트** 참조, 리포지토리 정책에 `Principal: "*"` 없음 | 가변 태그는 "어제 검증한 것과 오늘 도는 것"이 다를 수 있다는 뜻이다 | 24.2, 27.5 | P1 | `aws ecr describe-repositories --query 'repositories[].[repositoryName,imageTagMutability,imageScanningConfiguration]'` |
| A-4-15 | 워크로드 아이덴티티와 런타임이 격리되어 있다 — ECS: 태스크 정의마다 전용 태스크 역할·`awsvpc`·`readonlyRootFilesystem`·`capabilities.drop ALL`·`privileged false` / EKS: API 엔드포인트 제한·`audit`·`authenticator` 로깅·Pod Identity 또는 IRSA(와일드카드 `sub` 금지)·파드 IMDS 차단·네임스페이스별 `default-deny-all` / Lambda·API Gateway: 함수마다 별도 실행 역할, 환경 변수에 시크릿 없음, 모든 `add-permission`에 `--source-arn`, 함수 URL 없음 또는 `AuthType: AWS_IAM`, 모든 메서드에 권한 부여자·스로틀링·액세스 로깅, SQS/SNS/EventBridge 정책에 `aws:SourceArn`/`aws:PrincipalOrgID` | 컨테이너·서버리스에서 노드 역할·공용 실행 역할을 쓰면 한 워크로드의 침해가 전체 권한으로 번진다 | 24.3, 24.4, 24.6, 24.7, 24.8 | P1 | `aws ecs describe-task-definition` / `aws eks describe-cluster --query 'cluster.logging'` / `aws lambda get-function-url-config` |

📋 **A-4 출력용 체크박스**

- [ ] 퍼블릭 IP·SSH 키 페어 없음 — [ ] 시작 템플릿에 IMDSv2·홉 1·고객 관리형 키·종료 방지 고정 — [ ] User Data 안전성
- [ ] 골든 AMI 파이프라인 + 잔존 검사 + deprecation — [ ] SSM 관리형 + 패치 관리 + 준수 보고 수신자
- [ ] Inspector 4유형 + GuardDuty Malware/Runtime + 에이전트 AMI 포함 — [ ] 인스턴스 새로 고침 + AutoRollback + 수명 제한
- [ ] ACM DNS 검증 + `us-east-1` 별도 + 만료 알람 — [ ] TLS 정책(ALB·CloudFront·8443) — [ ] ALB 하드닝 4종
- [ ] CloudFront OAC + SourceArn — [ ] WAF 관리형·속도·로깅·양방향 알람 — [ ] WAF 우회 봉쇄 + Firewall Manager
- [ ] 컨테이너 이미지(비루트·IMMUTABLE·다이제스트) — [ ] ECS·EKS·Lambda·API GW 워크로드 아이덴티티

---

## A-5 로깅 · 탐지 · 대응 (15항목)

대응 본문: 29~35장

| # | 점검 항목 | 왜 필요한가 | 본문 | 우선순위 | 확인 방법 |
|---|---|---|---|---|---|
| A-5-01 | 조직 트레일이 **다중 리전 + 글로벌 서비스 이벤트 + 로그 파일 검증 + SSE-KMS**로 켜져 있고, 로그가 로그 아카이브 계정(`777788889999`) 버킷으로 가며, 버킷 정책에 `aws:SourceArn`+`aws:SourceAccount` 조건이 있고 멤버 계정의 중복 개별 트레일이 정리되어 있다 | 로그가 없으면 침해를 알 수도, 증명할 수도, 통지 범위를 정할 수도 없다 | 5.3, 29.2, 29.4, 29.9 | **P0** | `aws cloudtrail describe-trails` → `IsMultiRegionTrail`·`LogFileValidationEnabled`·`IsOrganizationTrail` 모두 `true` / `get-trail-status` → `IsLogging=true` |
| A-5-02 | 로그 무결성이 보장된다 — `validate-logs`가 주기 자동 실행되고 실패가 경보로 이어지며, 로깅 조작 API가 SCP로 Deny되고(예외 역할 하나, 사용 시 경보), 로그 유입 중단(`IncomingLogEvents`=0)에 경보가 있다 | 공격자의 첫 행동이 로깅 중지다. 중지된 로깅은 조용하다 — 침묵을 감시해야 한다 | 29.3, 30.3, 37.2 | P1 | `aws cloudtrail validate-logs --trail-arn <ARN> --start-time <T>` 자동 실행 기록 / SCP에 `cloudtrail:StopLogging` Deny |
| A-5-03 | 민감 버킷에 **S3 데이터 이벤트**가 고급 이벤트 선택기로 범위를 좁혀 켜져 있고, 서버 액세스 로깅도 함께 있으며, 인사이트 이벤트(`ApiCallRateInsight`·`ApiErrorRateInsight`)가 활성이다 | 데이터 이벤트는 기본으로 꺼져 있다 — `GetObject`가 한 건도 안 남아 "무엇이 나갔는가"에 답하지 못한다 | 15.11, 29.1, 29.2 | P1 | `aws cloudtrail get-event-selectors --trail-name <이름>` → `AdvancedEventSelectors`에 S3 데이터 이벤트 |
| A-5-04 | 모든 운영 VPC에 플로우 로그가 켜져 있고 **사용자 지정 형식**에 `flow-direction`·`instance-id`·`pkt-*`가 포함되며, Route 53 Resolver 쿼리 로깅이 켜져 로그 아카이브 계정으로 모인다 | 기본 형식 플로우 로그는 방향도 인스턴스도 알려주지 않고, DNS는 아예 남지 않는다 | 29.5, 20.5 | P1 | `aws ec2 describe-flow-logs --query 'FlowLogs[].[ResourceId,LogFormat]'` / Config `vpc-flow-logs-enabled` |
| A-5-05 | 모든 CloudWatch 로그 그룹에 보존 기간이 명시되어 있고("만료 없음" 0건) 보존 기간마다 근거가 문서화되어 있으며, 특권 세션·OS 감사 로그는 별도 로그 그룹 + 별도 KMS 키 + 최소 인원으로 격리되어 있다 | 무기한 보존은 비용이자 유출 표면이고, 너무 짧은 보존은 조사 불능이다 | 29.6, 29.7 | P1 | `aws logs describe-log-groups --query 'logGroups[?!retentionInDays].logGroupName'` → 빈 결과 / Config `cw-loggroup-retention-period-check` |
| A-5-06 | AWS Config 레코더가 전 계정·전 사용 리전에서 켜져 있고 **글로벌 리소스 유형을 포함**하며, 전송 채널 버킷이 로그 아카이브 계정에 있고 보안 도구 계정에 애그리게이터가 있다 | Config는 Security Hub 컨트롤의 전제 조건이다 — 꺼져 있으면 점수 자체가 허구가 된다 | 29.8, 26.6, 31.5 | P1 | `aws configservice describe-configuration-recorder-status` → `recording=true` / `describe-configuration-aggregators` |
| A-5-07 | 30.3의 필수 보안 알람 15종이 전부 존재하고 실제로 수신자에게 도착한다 — IAM·STS·콘솔 로그인 관련은 `us-east-1`에, 모든 지표 필터에 `defaultValue=0`, 심각도별 SNS 주제가 분리되어 모든 구독이 `Confirmed`이고 주제가 고객 관리형 KMS 키로 암호화되며, 모든 알람에 `Owner`·`Severity`·`Runbook` 태그가 있다 | `defaultValue=0`이 없으면 이벤트가 없을 때 알람이 `INSUFFICIENT_DATA`로 빠져 영원히 울리지 않는다 | 30.1, 30.2, 30.3 | **P0** | `aws cloudwatch describe-alarms --region us-east-1` / `aws sns list-subscriptions-by-topic --topic-arn <ARN>` → `PendingConfirmation` 0건 |
| A-5-08 | 조사 기반이 준비되어 있다 — 조직 CloudTrail용 Athena 테이블이 **파티션 프로젝션**으로 만들어져 있고 30.6의 조사 질의가 저장되어 플레이북에서 참조되며, 작업 그룹에 질의당 스캔 한도가 있고, 에스컬레이션 경로·주간 알람 튜닝·분기 알람 실사가 정례화되어 있다 | 사고 한복판에서 테이블을 만들기 시작하면 이미 늦다. 울리지 않는 알람은 없는 알람이다 | 30.6, 30.9 | P2 | `aws athena list-work-groups` / 저장 질의 목록과 튜닝 회의록 |
| A-5-09 | GuardDuty가 조직 위임 관리자(`444455556666`) 아래 **모든 사용 리전**에서 `--auto-enable-organization-members ALL`로 켜져 있고, S3·Malware·RDS Protection이 조직 기본이며, 미사용 리전도 켜져 있고, 결과가 S3로 내보내져 장기 보존되며 `guardduty:DeleteDetector`·`UpdateDetector`가 SCP로 제한된다 | 끄지 않은 리전이 공격자의 안전 지대가 된다. VPC가 AWS 제공 DNS 리졸버를 써야 DNS 탐지가 동작한다 | 31.1, 31.2 | **P0** | `aws guardduty list-detectors --region <각 리전>` / `aws guardduty describe-organization-configuration` → `AutoEnableOrganizationMembers=ALL` |
| A-5-10 | Security Hub가 위임 관리자 + `ConfigurationType=CENTRAL`로 구성되고 FSBP + CIS가 켜져 있으며(카드 결제 시 PCI DSS 추가), 크로스 리전 결과 집계가 설정되고 통합 컨트롤 결과가 활성이며, 비활성화 컨트롤마다 `--disabled-reason`에 근거·승인자·재검토일이 있다 | 결과가 여러 콘솔에 흩어지면 아무도 전체를 못 본다. 사유 없는 비활성화는 3개월 뒤 아무도 이유를 모른다 | 31.5, 26.6 | **P0** | `aws securityhub get-enabled-standards` / `aws securityhub list-finding-aggregators` |
| A-5-11 | 사고 대응 조직과 계획이 준비되어 있다 — 기술·비즈니스 리더에 주·예비 지정, 법무·커뮤니케이션·인사 연락처 확보, 연락처 명단의 **오프라인 사본** 존재, 회사 SSO와 무관한 대체 통신 채널, 모든 계정에 보안 연락처 등록, 플레이북이 실행 가능한 쿼리 원문을 포함해 최소 2종(자격 증명 유출·퍼블릭 노출) 작성, 분기 1회 테이블톱 | 아이덴티티가 침해되면 사내 위키와 SSO 채팅을 못 쓴다 — 계획이 침해된 시스템 안에만 있으면 계획이 아니다 | 32.1, 32.2, 32.5 | P1 | 플레이북 문서와 오프라인 사본 소재 확인, 훈련 기록 |
| A-5-12 | 브레이크 글래스 절차가 살아 있다 — IdP에 의존하지 않는 비상 자격 증명 + 하드웨어 MFA, **비밀번호와 MFA 기기의 보관자 분리**(각각 예비 인원), 사용 시 사고 지휘관·경영진에게 즉시 알람(SMS 백업 포함), 사용 후 24시간 내 재발급, **분기 1회 실제 로그인 점검** | 써 본 적 없는 비상 계정은 정작 필요할 때 안 열린다 | 32.4, 9.2 | P1 | 분기 점검 기록 / 브레이크글래스 역할 `AssumeRole` 알람 규칙 존재 |
| A-5-13 | 초동 조치 수단이 **사고 전에** 만들어져 있다 — 격리용 보안 그룹(아웃바운드 기본 규칙 제거), `aws:TokenIssueTime` 기반 세션 무효화 정책 파일, 계정 봉쇄 SCP(조사용 읽기·스냅샷 액션을 `NotAction`으로 보존)가 비운영 OU에서 검증 완료, 격리 순서 스크립트, 배포 동결 절차 | 조치 수단을 사고 중에 만들면 오타 하나로 조사자 자신이 잠긴다 | 32.3, 33.3, 33.4 | P1 | 격리 SG·정책 파일 저장소 존재 / 락다운 SCP의 비운영 OU 검증 기록 |
| A-5-14 | 포렌식·복구 준비가 되어 있다 — 증거 전용 S3 버킷을 **객체 잠금을 켠 상태로 사고 전에** 생성, IGW·NAT 없는 포렌식 VPC와 도구 AMI, `IncidentResponder` 역할(MFA·ExternalId 조건부), KMS 키 정책이 포렌식 계정의 복호화를 허용, 스냅샷 보전 스크립트 훈련 완료, 백업 복구 지점 선택 규칙이 "가장 최근"이 아니라 **"침해 시작 이전"** | 증거는 만들어지는 순간 보전되지 않으면 사라지고, 침해 이후 시점으로 복구하면 침해도 함께 복구된다 | 32.3, 34.2, 34.5 | P1 | 증거 버킷 `get-object-lock-configuration` / 포렌식 계정 VPC에 IGW 없음 확인 |
| A-5-15 | 대응 자동화에 안전장치가 있다 — 모든 자동화가 카탈로그에 등재(등급·트리거·롤백·승인자), `DRY_RUN` 기본값 `true`, 예외 태그 검사, 시간당 조치 상한(서킷 브레이커), 자기 변경 무시, 자동화 역할이 IAM·Organizations·CloudTrail·SCP를 못 바꾸도록 SCP 봉인, EventBridge 대상에 DLQ·재시도, 주기적 카나리아 테스트 | 자동화의 트리거를 공격자가 반복 생성할 수 있으면 자동화가 곧 공격 도구가 된다 | 35.1, 35.2, 35.5 | P2 | 자동화 카탈로그 문서 / Lambda 환경 변수 `DRY_RUN` / DLQ 알람 존재 |

📋 **A-5 출력용 체크박스**

- [ ] 조직 CloudTrail(다중 리전·글로벌·검증·KMS) + 로그 계정 — [ ] 로그 무결성(validate-logs·SCP·중단 경보)
- [ ] S3 데이터 이벤트 + 인사이트 — [ ] VPC 플로우 로그(사용자 지정) + Resolver 쿼리 로깅 — [ ] 로그 보존 명시 + 특권 로그 격리
- [ ] Config 전 계정·전 리전 + 글로벌 리소스 + 애그리게이터 — [ ] 보안 알람 15종 + SNS 주제·구독 확인
- [ ] Athena 조사 기반 + 알람 운영 — [ ] GuardDuty 조직·전 리전·보호 기능 — [ ] Security Hub CENTRAL + FSBP·CIS
- [ ] IR 조직·플레이북·오프라인 연락처 — [ ] 브레이크 글래스 분기 점검 — [ ] 초동 조치 수단 사전 준비
- [ ] 포렌식 증거 버킷·포렌식 VPC·복구 지점 규칙 — [ ] 자동화 안전장치(DRY_RUN·서킷 브레이커·DLQ)

---

## A-6 거버넌스 · 컴플라이언스 (15항목)

대응 본문: 25~28장, 36~39장

| # | 점검 항목 | 왜 필요한가 | 본문 | 우선순위 | 확인 방법 |
|---|---|---|---|---|---|
| A-6-01 | 취약점 관리 체계가 있다 — 25.2의 7계층 각각에 탐지 수단이 지정되고 빈 칸은 "공백"으로 명시, 심각도별·노출별 조치 기한(SLA) 문서화, 기한 내 미조치분은 리스크 등록부 등재 후 분기 재평가, 모든 억제(SUPPRESSED)에 사유·승인자·만료일 | "어느 계층을 아무도 안 보고 있는가"를 모르면 그 계층이 침해 경로가 된다 | 25.2, 25.3 | P1 | 7계층 커버리지 표 / Security Hub 억제 결과에 `Note` 존재 |
| A-6-02 | 취약점 지표를 산출하고 **커버리지를 첫 번째로** 보고하며, 우선순위가 CVSS 단독이 아니라 노출 × 민감도 × 악용 가능성으로 결정된다 | 커버리지가 낮은 상태의 "위험 건수 감소"는 개선이 아니라 착시다 | 25.4, 25.5, 25.6 | P2 | 월간 지표 산출물 / `aws inspector2 list-coverage` 로 커버리지 분모 확인 |
| A-6-03 | 스캐닝이 파이프라인에 박혀 있다 — SAST·SCA·시크릿 스캔이 **커밋 시점**에 돌고, 이미지 스캔이 레지스트리 단계에서 Critical을 차단하며, 모든 결과가 이슈 트래커로 자동 유입되고, Inspector가 조직 위임 관리자 + 신규 계정 자동 활성화로 4가지 유형·모든 사용 리전에서 켜져 있다 | 사람이 리포트를 열어야 보이는 결과는 열리지 않는다 | 26.2, 26.3 | P1 | `aws inspector2 batch-get-account-status` / 파이프라인 정의에 스캔 스텝 존재 |
| A-6-04 | 수동 테스트와 제보 창구가 있다 — 암호화·인가·시크릿 취급 코드는 사람이 리뷰, 펜테스트 계약에 대상 ARN 범위·시각·긴급 연락처·범위 밖 제외 명시, **AWS 침투 테스트 정책 원본 확인**(DoS 성격 시험은 별도 승인), `/.well-known/security.txt`의 `Expires`가 유효하고 갱신 알람 존재, VDP에 안전 항구 조항과 대응 SLA | 도구가 못 잡는 논리 결함이 가장 비싸고, 제보 창구가 없으면 제보는 SNS로 간다 | 26.4, 26.5 | P2 | `security.txt` 응답의 `Expires` 확인 / 펜테스트 계약서 |
| A-6-05 | SBOM 체계가 있다 — 모든 배포 아티팩트가 빌드 시점에 SBOM을 생성하고 파일 키가 태그가 아닌 **다이제스트**, 아카이브가 보안 계정에 버전 관리·객체 잠금·KMS 암호화로 있고, `purl`+버전 인덱스와 **현재 운영 실행 중인 다이제스트 목록**이 갱신되며, "신규 CVE → 영향받는 운영 서비스" 조회를 리허설해 봤다 | 다음 Log4Shell이 터졌을 때 답까지 걸리는 시간이 곧 노출 시간이다 | 27.2 | P2 | SBOM 아카이브 버킷 객체 수 / 리허설 기록 |
| A-6-06 | 의존성과 빌드 환경이 통제된다 — 락파일 + CI가 `npm ci` 동등 명령 사용(불일치 시 실패), 설치 스크립트 기본 차단, 빌드가 CodeArtifact/ECR 캐시 경유, **내부 패키지마다 `upstream=BLOCK` 오리진 통제**, 러너가 운영 계정 밖 전용 계정·프라이빗 서브넷·빌드 1회당 폐기, 포크 PR이 러너·시크릿에 닿지 못하고, 모든 서드파티 액션이 **커밋 SHA로 고정**, 베이스 이미지가 `@sha256:` 참조 | 의존성 혼동 공격은 내부 패키지명 하나로 성립하고, 빌드 서버는 모든 코드에 서명할 수 있는 최고 권한 지점이다 | 27.3, 27.4, 27.5 | P1 | `aws codeartifact list-package-origin-configurations` / 워크플로 파일의 SHA 고정 검사 |
| A-6-07 | CI/CD에 저장된 **장기 AWS 액세스 키가 하나도 없고**, OIDC 신뢰 정책에 `aud`와 `sub` 조건이 모두 있으며(`repo:*/*` 형태 금지), 운영 배포 역할의 `sub`가 `environment:production`이고 그 환경에 승인자가 있으며, Dev 워크플로가 Prod 배포 역할을 맡을 수 없음을 실제로 확인했고, 배포 역할의 IAM 생성 권한에 권한 경계 조건과 경계·역할 보호 Deny가 있다 | 파이프라인은 사실상 조직 최고 권한이다 — 여기 있는 키 하나가 전부다 | 27.6, 6.4 | **P0** | CI 시크릿 저장소 감사 / 역할 신뢰 정책에서 `sub`·`aud` 조건 확인 |
| A-6-08 | 배포 전 정책 게이트가 **경고가 아니라 차단**이다 — 게이트 규칙 10개 구현, 브랜치 보호의 필수 상태 체크로 등록, 규칙 파일에 회귀 테스트, 규칙 저장소 쓰기 권한이 앱 팀과 분리, 억제에 소유자·만료일(만료 시 재실패), IAM 정책은 Access Analyzer 정책 검증 통과, 같은 10개 규칙이 Config 규칙으로도 존재(예방+탐지 이중화) | 경고는 무시된다. 차단만이 통제다 | 28.2, 28.3, 7.7 | P1 | 브랜치 보호 설정의 필수 체크 목록 / Config 규칙 목록과 게이트 규칙 대조 |
| A-6-09 | 드리프트와 수동 변경이 통제된다 — 운영 스택에 드리프트 탐지 주기 실행 후 결과가 Security Hub로, "배포 역할 외 주체의 쓰기 API" 쿼리가 상시 리포트로 존재하고 결과 0건, 운영 계정 사용자는 기본적으로 읽기 + Session Manager만, 인프라 변경 API가 배포 역할·브레이크글래스 외에는 SCP로 거부 | 콘솔에서 손으로 바꾼 한 줄이 IaC와 현실을 영구히 갈라놓는다 | 28.4 | P1 | `aws cloudformation detect-stack-drift` 주기 실행 / Config `cloudformation-stack-drift-detection-check` |
| A-6-10 | 환경이 분리되어 있다 — 개발/스테이징/운영이 **별도 AWS 계정**, 템플릿은 공유하고 파라미터만 분리, 암호화·퍼블릭 차단·IMDSv2·로깅은 파라미터가 아니라 **코드에 고정**, 운영 계정에서 스냅샷·AMI 공유 API가 SCP로 차단, 운영 KMS 키 정책에 개발 계정 주체 없음, 개발 계정에 Macie 활성 | 보안 설정을 파라미터로 빼는 순간 개발 환경에서 꺼진 값이 운영으로 흘러간다 | 28.6, 36.1 | P1 | `aws organizations list-accounts-for-parent` 로 OU별 계정 / 운영 KMS 키 정책 검토 |
| A-6-11 | Organizations 기반이 서 있다 — `--feature-set ALL`로 생성, **관리 계정에 워크로드 없음**, 관리 계정에 IAM 사용자·장기 액세스 키 0개, Root 바로 아래 계정 0개(전부 OU 소속), 필수 코어 계정(관리·로그 아카이브·보안 도구·네트워크·백업) 존재, 루트 이메일이 회사 도메인 배포 리스트, 모든 멤버 계정의 `OrganizationAccountAccessRole` 신뢰 정책에 MFA 조건과 특정 역할 ARN이 있고 `AssumeRole`에 즉시 알람 | 관리 계정은 SCP가 적용되지 않는 유일한 계정이다 — 여기서 워크로드를 돌리면 가드레일 밖에서 사는 것이다 | 1.4, 36.1, 36.4, 36.5, 36.6, 36.7 | P1 | `aws organizations describe-organization` → `FeatureSet=ALL` / `list-accounts-for-parent --parent-id r-xxxx` → 빈 결과 |
| A-6-12 | OU 구조와 리소스 공유가 정리되어 있다 — Security / Infrastructure / Workloads(Prod·NonProd) / Sandbox / Suspended OU 존재, **Suspended OU와 전면 거부 SCP를 사고 전에 미리 생성**, Exceptions OU 계정에 만료일 태그, OU 깊이 3단계 이하, RAM 조직 내 공유 활성화 + 모든 공유가 `allowExternalPrincipals=false` + 프린시펄이 계정 나열이 아닌 **OU ARN** + 분기 1회 공유 검토 | 격리 계정을 사고 중에 만들면 격리가 늦고, 외부 공유가 켜진 RAM은 조직 밖으로 리소스를 내보낸다 | 36.4, 36.8, 32.2 | P1 | `aws organizations list-organizational-units-for-parent` / `aws ram get-resource-shares --resource-owner SELF --query 'resourceShares[].allowExternalPrincipals'` |
| A-6-13 | 필수 SCP 10종이 적용되고 안전하게 운영된다 — 루트 액션 거부 / CloudTrail 보호 / 탐지 서비스 비활성화 금지 / 미승인 리전 차단(글로벌 서비스 `NotAction` 검증 완료) / 비암호화 EBS·RDS 생성 차단(`Null` 조건 포함) / `LeaveOrganization`·`CloseAccount` 거부 / IAM 사용자·액세스 키 생성 금지 / 로그 버킷·백업 볼트 보호 / 필수 태그 강제 / 베이스라인 역할·권한 경계 보호. 모든 SCP가 Git + 파이프라인 배포이고 `FullAWSAccess`를 떼어 낸 지점이 없으며, 새 SCP는 CloudTrail 90일 질의로 영향을 먼저 계산하고 PolicyStaging → NonProd → 카나리 → 전체 순서를 지키며 롤백 명령과 브레이크 글래스 경로가 문서에 있다 | SCP는 조직 전체에 즉시 적용된다 — 검증 없는 SCP 하나가 전사 장애를 만든다. **배포 역할이 자기 자신을 잠그지 않는지** 반드시 확인한다 | 37.1, 37.2, 37.3 | P1 | `aws organizations list-policies --filter SERVICE_CONTROL_POLICY` / `list-targets-for-policy`로 부착 지점 |
| A-6-14 | 신규 계정 베이스라인이 자동화되어 있다 — 계정 생성 경로가 하나뿐(팩토리 또는 파이프라인), 베이스라인 StackSet이 `SERVICE_MANAGED` + `--auto-deployment Enabled=true`, Config 적합성 팩이 조직 단위로 배포되어 계정별 상태를 집계, 태그 정책·백업 정책·AI 옵트아웃 정책 활성화, **5.7의 20항목이 전부 조직 수단으로 매핑**되어 있고, 주간 자동 리포트로 StackSets·Config·OU 소속 3층을 검증한다 | 사람이 새 계정을 손으로 세팅하면 항상 빠지는 것이 생긴다. 40.4의 목표는 **"새 계정 생성 후 30분 내 전 통제 자동 적용"** 이다 | 37.7, 37.9, 40.4 | P1 | `aws cloudformation list-stack-sets --status ACTIVE` → `PermissionModel=SERVICE_MANAGED` / `aws configservice describe-conformance-pack-status` |
| A-6-15 | 컴플라이언스와 성숙도가 증명 가능하다 — Artifact의 조직 계약을 관리 계정에서 확인하고 필요한 계약을 조직 단위로 처리, 감사 질문을 AWS 책임/고객 책임으로 나눈 표 작성, 고객 책임 항목마다 "누가·어떤 명령으로·언제" 증거를 뽑는지 명시, 증거 자동 수집 스크립트를 **월 1회 자동 실행**해 잠긴 버킷에 적재하고 해시 매니페스트를 별도 보관, 증거 수집 역할은 **읽기 전용**, 예외 대장의 모든 항목에 만료일과 보상 통제, 리전 이탈 경로를 분기 1회 점검하고 데이터 흐름도에 국가 경계선 표시, 39.2의 지표를 분모의 절대 숫자와 함께 산출, Well-Architected 보안 기둥 리뷰를 반기 1회 이상 실시 | 감사는 "했다"가 아니라 "증명한다"를 요구한다. 증거를 사고 후에 모으면 그것은 증거가 아니다 | 38.1, 38.5, 38.6, 39.2, 39.5 | P2 | 증거 수집 스크립트의 월간 실행 로그 / `aws wellarchitected list-workloads` / 예외 대장 만료 초과 0건 |

📋 **A-6 출력용 체크박스**

- [ ] 취약점 7계층 커버리지 + SLA + 억제 관리 — [ ] 지표(커버리지 우선) — [ ] 커밋·레지스트리 스캔 + Inspector 조직 구성
- [ ] 수동 리뷰·펜테스트 정책·security.txt·VDP — [ ] SBOM 생성·아카이브·조회 리허설
- [ ] 의존성·빌드 환경 통제(락파일·오리진 통제·러너 격리·SHA 고정) — [ ] CI 장기 키 0 + OIDC `aud`·`sub`
- [ ] 정책 게이트 차단형 + Config 이중화 — [ ] 드리프트 탐지 + 수동 변경 SCP 거부 — [ ] 환경 계정 분리 + 보안 설정 코드 고정
- [ ] Organizations 기반(ALL·관리 계정 워크로드 0·코어 계정·OrgAccountAccessRole MFA)
- [ ] OU 구조 + Suspended OU 사전 준비 + RAM 외부 공유 0 — [ ] 필수 SCP 10종 + 단계적 배포
- [ ] 신규 계정 베이스라인 자동화(StackSet·적합성 팩·정책) — [ ] 증거 자동 수집·예외 대장·지표·WA 리뷰

---

## A-7 자동 점검 스크립트

⚠️ **이 스크립트는 100항목을 대체하지 않습니다.** P0 항목 중 **CLI로 기계적으로 확인 가능한 것만** 봅니다. "문서가 존재하는가", "복원을 해 봤는가", "결과를 사람이 읽는가" 같은 항목은 기계가 판정할 수 없고, 그런 항목이 실제 사고에서 더 자주 결정적입니다. 스크립트가 전부 PASS여도 A-1~A-6 전수 점검은 별도로 하십시오.

**실행 조건** — 읽기 전용 권한(`ReadOnlyAccess` 또는 그 부분집합)이면 충분합니다. 쓰기 권한으로 돌리지 마십시오(38.5).

```bash
#!/usr/bin/env bash
# aws-sec-p0-check.sh — 부록 A P0 항목 자동 점검 (읽기 전용)
# 사용법: ./aws-sec-p0-check.sh [--profile awssec-lab] [--regions "ap-northeast-2 us-east-1"]
# 주의: 보조 수단입니다. 부록 A 100항목 전수 점검을 대체하지 않습니다.

set -uo pipefail

PROFILE_ARG=()
REGIONS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE_ARG=(--profile "$2"); shift 2 ;;
    --regions) REGIONS="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

aws_() { aws "${PROFILE_ARG[@]+"${PROFILE_ARG[@]}"}" "$@"; }

PASS=0; FAIL=0; WARN=0

ok()   { printf '  [PASS] %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  [FAIL] %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  [WARN] %s\n' "$1"; WARN=$((WARN+1)); }
head_() { printf '\n== %s ==\n' "$1"; }

ACCOUNT_ID=$(aws_ sts get-caller-identity --query Account --output text 2>/dev/null || true)
if [ -z "${ACCOUNT_ID}" ] || [ "${ACCOUNT_ID}" = "None" ]; then
  echo "자격 증명을 확인할 수 없습니다. --profile 을 확인하십시오." >&2
  exit 1
fi

if [ -z "${REGIONS}" ]; then
  REGIONS=$(aws_ ec2 describe-regions --query 'Regions[].RegionName' --output text 2>/dev/null || echo "ap-northeast-2")
fi

printf 'AWS 보안 P0 자동 점검 — 계정 %s\n' "${ACCOUNT_ID}"
printf '점검 리전: %s\n' "${REGIONS}"

# ---------- A-1-01 / A-1-02 루트 MFA와 루트 액세스 키 ----------
head_ "A-1-01 / A-1-02  루트 MFA · 루트 액세스 키"
SUMMARY=$(aws_ iam get-account-summary --output json 2>/dev/null || echo '{}')
ROOT_MFA=$(printf '%s' "${SUMMARY}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("SummaryMap",{}).get("AccountMFAEnabled","?"))')
ROOT_KEYS=$(printf '%s' "${SUMMARY}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("SummaryMap",{}).get("AccountAccessKeysPresent","?"))')
[ "${ROOT_MFA}" = "1" ] && ok "루트 MFA 활성" || bad "루트 MFA 비활성 (AccountMFAEnabled=${ROOT_MFA}) → 5.1"
[ "${ROOT_KEYS}" = "0" ] && ok "루트 액세스 키 0개" || bad "루트 액세스 키 존재 (AccountAccessKeysPresent=${ROOT_KEYS}) → 5.1"

# ---------- A-1-03 계정 별칭 · 보안 연락처 ----------
head_ "A-1-03  계정 별칭 · 보안 연락처"
ALIAS=$(aws_ iam list-account-aliases --query 'AccountAliases[0]' --output text 2>/dev/null || echo "None")
[ "${ALIAS}" != "None" ] && [ -n "${ALIAS}" ] && ok "계정 별칭: ${ALIAS}" || bad "계정 별칭 없음 → 5.1"
if aws_ account get-alternate-contact --alternate-contact-type SECURITY >/dev/null 2>&1; then
  ok "대체 보안 연락처 등록됨"
else
  warn "대체 보안 연락처를 확인하지 못함(권한 부족이거나 미등록) → 5.1"
fi

# ---------- A-1-07 액세스 키 위생 (90일 초과 활성 키) ----------
head_ "A-1-07  90일 초과 활성 액세스 키"
STALE=0
for U in $(aws_ iam list-users --query 'Users[].UserName' --output text 2>/dev/null); do
  for K in $(aws_ iam list-access-keys --user-name "${U}" \
      --query 'AccessKeyMetadata[?Status==`Active`].AccessKeyId' --output text 2>/dev/null); do
    CREATED=$(aws_ iam list-access-keys --user-name "${U}" \
      --query "AccessKeyMetadata[?AccessKeyId=='${K}'].CreateDate" --output text 2>/dev/null)
    AGE=$(python3 - "${CREATED}" <<'PY'
import sys, datetime
try:
    t = sys.argv[1].replace("Z", "+00:00")
    d = datetime.datetime.fromisoformat(t)
    print((datetime.datetime.now(datetime.timezone.utc) - d).days)
except Exception:
    print(-1)
PY
)
    if [ "${AGE}" -ge 90 ] 2>/dev/null; then
      bad "액세스 키 ${K} (사용자 ${U}) 생성 후 ${AGE}일 → 5.6"
      STALE=$((STALE+1))
    fi
  done
done
[ "${STALE}" -eq 0 ] && ok "90일 초과 활성 액세스 키 없음"

# ---------- A-5-01 CloudTrail ----------
head_ "A-5-01  CloudTrail 다중 리전 · 로그 파일 검증"
TRAILS=$(aws_ cloudtrail describe-trails --output json 2>/dev/null || echo '{"trailList":[]}')
GOOD_TRAIL=$(printf '%s' "${TRAILS}" | python3 -c '
import sys, json
d = json.load(sys.stdin).get("trailList", [])
g = [t for t in d if t.get("IsMultiRegionTrail") and t.get("LogFileValidationEnabled")]
print(g[0]["Name"] if g else "")
')
if [ -n "${GOOD_TRAIL}" ]; then
  ok "다중 리전 + 로그 파일 검증 트레일: ${GOOD_TRAIL}"
  LOGGING=$(aws_ cloudtrail get-trail-status --name "${GOOD_TRAIL}" --query IsLogging --output text 2>/dev/null || echo "False")
  [ "${LOGGING}" = "True" ] && ok "트레일 로깅 중" || bad "트레일이 중지 상태 → 29.2"
else
  bad "다중 리전 + 로그 파일 검증을 만족하는 트레일 없음 → 29.2"
fi

# ---------- A-2-09 계정 수준 S3 퍼블릭 액세스 차단 ----------
head_ "A-2-09  계정 수준 S3 퍼블릭 액세스 차단"
BPA=$(aws_ s3control get-public-access-block --account-id "${ACCOUNT_ID}" --output json 2>/dev/null || echo '{}')
BPA_OK=$(printf '%s' "${BPA}" | python3 -c '
import sys, json
c = json.load(sys.stdin).get("PublicAccessBlockConfiguration", {})
keys = ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]
print("yes" if c and all(c.get(k) for k in keys) else "no")
')
[ "${BPA_OK}" = "yes" ] && ok "계정 BPA 4개 항목 모두 활성" || bad "계정 BPA 미설정 또는 일부만 활성 → 15.2"

# ---------- A-1-05 예산 알람 ----------
head_ "A-1-05  예산 알람"
BUDGETS=$(aws_ budgets describe-budgets --account-id "${ACCOUNT_ID}" --query 'length(Budgets)' --output text 2>/dev/null || echo "0")
if [ "${BUDGETS}" != "0" ] && [ "${BUDGETS}" != "None" ]; then
  ok "예산 ${BUDGETS}개 존재 (ACTUAL·FORECASTED 알림 유무는 수동 확인)"
else
  bad "예산이 없음 → 5.4"
fi

# ---------- 리전 순회 점검 ----------
for R in ${REGIONS}; do
  head_ "리전 ${R}"

  # A-3-09 기본 SG 개방 · 0.0.0.0/0 22/3389
  OPEN_SG=$(aws_ ec2 describe-security-groups --region "${R}" \
    --query 'SecurityGroups[?IpPermissions[?(IpRanges[?CidrIp==`0.0.0.0/0`] || Ipv6Ranges[?CidrIpv6==`::/0`]) && ((FromPort<=`22` && ToPort>=`22`) || (FromPort<=`3389` && ToPort>=`3389`) || IpProtocol==`-1`)]].GroupId' \
    --output text 2>/dev/null || echo "")
  if [ -z "${OPEN_SG}" ]; then
    ok "[A-3-09] 전체 개방 22/3389 인바운드 없음"
  else
    bad "[A-3-09] 개방된 보안 그룹: ${OPEN_SG} → 19.3"
  fi

  DEFAULT_SG_OPEN=$(aws_ ec2 describe-security-groups --region "${R}" \
    --filters Name=group-name,Values=default \
    --query 'SecurityGroups[?length(IpPermissions)>`0` || length(IpPermissionsEgress)>`0`].GroupId' \
    --output text 2>/dev/null || echo "")
  if [ -z "${DEFAULT_SG_OPEN}" ]; then
    ok "[A-3-09] 기본 보안 그룹 규칙 비어 있음"
  else
    bad "[A-3-09] 기본 SG에 규칙 존재: ${DEFAULT_SG_OPEN} → 19.3"
  fi

  # A-2-15 EBS 기본 암호화
  EBS_ENC=$(aws_ ec2 get-ebs-encryption-by-default --region "${R}" \
    --query EbsEncryptionByDefault --output text 2>/dev/null || echo "False")
  [ "${EBS_ENC}" = "True" ] && ok "[A-2-15] EBS 기본 암호화 활성" || bad "[A-2-15] EBS 기본 암호화 비활성 → 16.1"

  # A-2-15 미암호화 볼륨
  UNENC_VOL=$(aws_ ec2 describe-volumes --region "${R}" \
    --query 'Volumes[?Encrypted==`false`].VolumeId' --output text 2>/dev/null || echo "")
  [ -z "${UNENC_VOL}" ] && ok "[A-2-15] 미암호화 EBS 볼륨 없음" || bad "[A-2-15] 미암호화 볼륨: ${UNENC_VOL} → 16.1"

  # A-2-19 퍼블릭 스냅샷
  PUB_SNAP=$(aws_ ec2 describe-snapshots --region "${R}" --owner-ids "${ACCOUNT_ID}" \
    --restorable-by-user-ids all --query 'Snapshots[].SnapshotId' --output text 2>/dev/null || echo "")
  [ -z "${PUB_SNAP}" ] && ok "[A-2-19] 퍼블릭 EBS 스냅샷 없음" || bad "[A-2-19] 퍼블릭 스냅샷: ${PUB_SNAP} → 16.7"

  # A-2-19 퍼블릭 AMI
  PUB_AMI=$(aws_ ec2 describe-images --region "${R}" --owners "${ACCOUNT_ID}" \
    --query 'Images[?Public==`true`].ImageId' --output text 2>/dev/null || echo "")
  [ -z "${PUB_AMI}" ] && ok "[A-2-19] 퍼블릭 AMI 없음" || bad "[A-2-19] 퍼블릭 AMI: ${PUB_AMI} → 16.7"

  # A-2-16 RDS 저장 암호화 · 퍼블릭 접근
  RDS_BAD=$(aws_ rds describe-db-instances --region "${R}" \
    --query 'DBInstances[?StorageEncrypted==`false` || PubliclyAccessible==`true`].DBInstanceIdentifier' \
    --output text 2>/dev/null || echo "")
  [ -z "${RDS_BAD}" ] && ok "[A-2-16] RDS 전부 암호화 + 비퍼블릭" || bad "[A-2-16] 문제 DB: ${RDS_BAD} → 16.2"

  # A-1-13 IMDSv2
  IMDS_BAD=$(aws_ ec2 describe-instances --region "${R}" \
    --query 'Reservations[].Instances[?State.Name==`running` && MetadataOptions.HttpTokens!=`required`].InstanceId' \
    --output text 2>/dev/null || echo "")
  [ -z "${IMDS_BAD}" ] && ok "[A-1-13] 전 인스턴스 IMDSv2 강제" || bad "[A-1-13] IMDSv1 허용 인스턴스: ${IMDS_BAD} → 8.3"

  # A-4-01 퍼블릭 IP를 가진 인스턴스
  PUB_EC2=$(aws_ ec2 describe-instances --region "${R}" \
    --query 'Reservations[].Instances[?State.Name==`running` && PublicIpAddress!=null].InstanceId' \
    --output text 2>/dev/null || echo "")
  [ -z "${PUB_EC2}" ] && ok "[A-4-01] 퍼블릭 IP 인스턴스 없음" || warn "[A-4-01] 퍼블릭 IP 인스턴스: ${PUB_EC2} (의도된 것인지 확인) → 22.1"

  # A-5-09 GuardDuty
  GD=$(aws_ guardduty list-detectors --region "${R}" --query 'DetectorIds[0]' --output text 2>/dev/null || echo "None")
  [ "${GD}" != "None" ] && [ -n "${GD}" ] && ok "[A-5-09] GuardDuty 활성" || bad "[A-5-09] GuardDuty 비활성 → 31.1"

  # A-5-10 Security Hub
  if aws_ securityhub describe-hub --region "${R}" >/dev/null 2>&1; then
    ok "[A-5-10] Security Hub 활성"
  else
    bad "[A-5-10] Security Hub 비활성 → 31.5"
  fi

  # A-5-06 Config 레코더
  CFG=$(aws_ configservice describe-configuration-recorder-status --region "${R}" \
    --query 'ConfigurationRecordersStatus[0].recording' --output text 2>/dev/null || echo "False")
  [ "${CFG}" = "True" ] && ok "[A-5-06] Config 레코더 기록 중" || bad "[A-5-06] Config 레코더 미동작 → 29.8"

  # A-3-05 기본 VPC
  DEF_VPC=$(aws_ ec2 describe-vpcs --region "${R}" \
    --filters Name=isDefault,Values=true --query 'Vpcs[].VpcId' --output text 2>/dev/null || echo "")
  [ -z "${DEF_VPC}" ] && ok "[A-3-05] 기본 VPC 없음" || warn "[A-3-05] 기본 VPC 존재: ${DEF_VPC} (사용 리전이면 무시) → 5.5"
done

# ---------- 결과 ----------
printf '\n========================================\n'
printf 'PASS %d  /  FAIL %d  /  WARN %d\n' "${PASS}" "${FAIL}" "${WARN}"
printf '========================================\n'
printf '이 결과는 P0의 기계 확인 가능 부분만 다룹니다.\n'
printf '부록 A의 100항목 전수 점검을 별도로 수행하십시오.\n'

[ "${FAIL}" -eq 0 ] && exit 0 || exit 1
```

**이 스크립트가 확인하지 못하는 P0 항목** — 반드시 사람이 봐야 합니다.

| P0 항목 | 왜 자동화가 안 되는가 |
|---|---|
| A-1-04 루트 사용 알람 | 규칙 존재는 확인해도 **수신자에게 실제로 도착하는지**는 발송 테스트가 필요하다 |
| A-1-06 사람 MFA 강제 | Identity Center·외부 IdP 쪽 설정이라 IAM API로 보이지 않는다 |
| A-1-08 시크릿 부재 | 저장소·이미지 레이어 스캔은 별도 도구의 영역이다 |
| A-2-20 백업 + 복원 훈련 | **"복원을 해 봤는가"** 는 기록으로만 판정된다 |
| A-3-14 Session Manager 전용 | 배스천 부재는 "SSH 포트가 없다"로 근사할 수 있으나, 예외 경로 문서 검토가 필요하다 |
| A-5-07 보안 알람 15종 | 알람의 존재보다 **울렸을 때 사람이 움직이는가**가 통제의 본질이다 |
| A-6-07 CI 장기 키 0 | AWS 밖(CI 시크릿 저장소)에 있어 AWS API로 볼 수 없다 |

---

## A-8 이 체크리스트를 조직 통제로 바꾸기

100항목을 매번 손으로 도는 조직은 오래가지 못합니다. **점검을 통제로 바꾸는 세 단계**가 있습니다.

| 단계 | 하는 일 | 본문 |
|---|---|---|
| ① 탐지로 | 항목 대부분을 AWS Config 규칙 + Security Hub 표준으로 옮깁니다. 이 부록의 "확인 방법" 열에 Config 규칙명이 있는 항목이 출발점입니다 | 26.6, 29.8, 31.5 |
| ② 예방으로 | 되돌아가면 안 되는 항목을 SCP와 정책 게이트로 봉인합니다. 37.2의 10개 SCP가 100항목 중 상당수를 "애초에 불가능"으로 만듭니다 | 28.3, 37.2 |
| ③ 자동 적용으로 | 신규 계정 베이스라인에 넣어, 계정이 생기는 순간 통제가 따라붙게 합니다 | 37.9 |

세 단계를 거치고 나면 이 부록은 **"매번 도는 목록"이 아니라 "분기마다 한 번 확인하는 증거"** 가 됩니다. 그것이 40.4가 말한 A(존재) → B(강제) → C(증명)의 이동입니다.
