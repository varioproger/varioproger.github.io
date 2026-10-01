---
title: "5장. AWS 계정 첫날(Day 1) 필수 보안"
---

# 5장. AWS 계정 첫날(Day 1) 필수 보안

> **이 장에서 다루는 것**
> - 루트 사용자를 "쓰지 않는 자격 증명"으로 만드는 구체적 절차 — MFA, 액세스 키 부재 확인, 대체 연락처, 루트 사용 알람
> - 개별 아이덴티티 확보와 MFA 강제 — IAM Identity Center 기본 권장, IAM 사용자 대안
> - CloudTrail 다중 리전 트레일 + 로그 파일 검증 — 첫날 켜지 않으면 그 기간은 영구 수사 불가
> - 결제 알람·예산·비용 이상 탐지 3중 구조 — 침해의 첫 신호가 요금인 경우
> - 미사용 리전 차단, 기본 VPC 정리, 암호 정책과 액세스 키 순환
> - Day 1 보안 체크리스트 20항목 (본문 절 번호 + 심화 장 표기)
>
> **선행 지식**: 1장(최소 권한·폭발 반경), 2장(공동 책임 모델), 3장(클라우드 특유의 공격 경로), 4장(데이터 분류)
> **난이도**: ★☆☆

1부의 1~4장은 "왜"와 "무엇"이었습니다. 이 장은 **"지금 당장"** 입니다.

4장 리스크 등록부의 최상위 항목들 — 장기 액세스 키 유출, 감사 추적 부재, 과금 폭증 — 은 리스크 평가가 끝나기를 기다려주지 않습니다. 계정은 만들어진 순간부터 인터넷에 노출된 API 엔드포인트를 갖습니다. 그래서 이 장은 순서를 뒤집어, **분석 없이 바로 실행해도 손해가 없는 통제**만 모았습니다.

> ⚠️ **0장 0.3과의 구분**
> 0.3에서 만든 것은 **학습 전용 계정**(프로파일 `awssec-lab`)이고, 이 장이 다루는 것은 **실제 운영 계정**입니다. 대상이 다르면 요구 수준도 다릅니다. 0.3에서는 예산 20달러 알림 하나로 충분했지만 운영 계정에는 5.4의 3중 구조가 필요하고, 0.3에서 허용한 액세스 키 CLI 설정이라는 우회로는 5.2에서 막습니다.
> 이 장의 명령 예제는 프로파일을 `shopmini-prod` 로 씁니다. **복사해 붙이기 전에 `aws sts get-caller-identity` 로 계정 ID를 확인하세요.**

이 장의 대상은 CANON의 운영 계정 `111122223333`(ShopMini Prod)입니다. 조직(AWS Organizations)이 아직 없는 단일 계정 상황을 기본으로 서술하고, 조직이 있을 때 더 나은 방법은 매 절 끝에서 해당 장으로 넘깁니다. 순서는 중요합니다. **5.1 → 5.2 → 5.3** 은 반드시 이 순서로 하세요. 루트를 잠그기 전에 개별 사용자를 만들면 루트로 로그인한 흔적이 늘어나고, CloudTrail을 켜기 전에 IAM을 구성하면 그 구성 행위 자체가 기록되지 않습니다.

---

## 5.1 🔴 루트 계정 잠그기

### 안 했을 때 벌어지는 일

루트 사용자에게는 권한 정책이라는 개념이 적용되지 않습니다. IAM 정책도, 권한 경계도, 심지어 SCP도 관리 계정의 루트에는 적용되지 않습니다(37.3). 즉 **루트 자격 증명 하나가 유출되면 그 계정에 세운 모든 통제가 동시에 무효**가 됩니다. 공격자는 CloudTrail을 끄고, 로그 버킷을 지우고, 결제 정보를 바꾸고, 새 IAM 사용자를 만든 뒤 나갈 수 있습니다 — 로그를 끈 행위 자체는 기록되지만 그 기록이 담긴 버킷도 루트로 삭제 가능하기 때문에 탐지 체계는 아무것도 보지 못합니다. 공개된 사고 유형 중 가장 복구가 어려운 경로이고, 원인은 대부분 "루트 이메일이 개인 메일이었고 그 메일이 먼저 뚫렸다" 또는 "루트 액세스 키를 만들어 CI 서버에 넣어뒀다" 둘 중 하나입니다.

> 📖 *AWS Security Cookbook* 1장의 첫 레시피는 IAM 대시보드 체크리스트를 전부 초록색으로 만드는 것에서 시작합니다. 저자는 그 체크리스트의 **첫 항목이 "루트 계정에 프로그래밍 방식 접근용 액세스 키가 살아 있는지"를 검사한다**고 짚으면서, 루트는 다른 사용자를 만드는 데만 쓰고 일상 작업은 그 사용자로 하는 것이 좋은 습관이라고 결론냅니다. 두 번째 항목이 루트 MFA 활성화이며, 저자는 가상 MFA 디바이스(예: 인증 앱)와 YubiKey 같은 U2F 보안 키, 하드웨어 MFA 디바이스를 모두 선택지로 제시합니다.

### 루트만 할 수 있는 일 — 그래서 지울 수 없다

"루트를 아예 없애면 안 되나." 안 됩니다. 아래 작업은 IAM 사용자나 역할로는 불가능합니다.

| 루트 전용 작업 | 언제 필요한가 |
|---|---|
| 계정 이메일·루트 암호 변경 | 담당자 변경, 사고 대응 |
| 계정 해지(Close account) | 계정 폐기 |
| Organizations 관리 계정에서 조직 생성·삭제 | 조직 초기 구성 (36.2) |
| S3 버킷의 MFA Delete 활성화 | 랜섬웨어 대비 (15.8) |
| 잘못 만들어 자기 자신을 잠근 S3 버킷 정책 복구 | 사고 복구 |
| 지원 플랜 변경, 세금 정보 등록 | 계약·과금 |
| GovCloud 계정 생성 등 일부 특수 작업 | 규제 환경 |

결론은 **"삭제"가 아니라 "봉인"** 입니다. 1년에 몇 번 쓸 수도 있는 비상 열쇠로 만들어 두고, 꺼내는 순간 사이렌이 울리게 합니다. 32.4에서 다루는 브레이크 글래스(break-glass) 절차의 원형이 바로 이것입니다.

### 실행 순서

**① 루트 이메일을 개인 메일에서 분리한다**

루트 이메일은 **조직 소유의 배포 그룹**(예: `aws-root-prod@example.com`)으로 둡니다. 개인 메일이면 담당자가 퇴사할 때 계정 복구 경로가 함께 사라집니다. 그 배포 그룹 자체에도 MFA를 걸고, 수신자를 2명 이상 둡니다. 이메일 변경은 콘솔에서만 가능하며 CLI가 없습니다.

**② MFA를 등록한다 — 하드웨어 우선**

가능하면 FIDO 보안 키나 하드웨어 TOTP 토큰을 씁니다. 인증 앱(가상 MFA)은 그 앱이 설치된 휴대전화가 곧 두 번째 요소가 되므로, 휴대전화 분실·SIM 스와핑이 그대로 리스크가 됩니다.

> 📖 *Practical Cloud Security* 2판 4장은 MFA를 "약하거나 탈취된 자격 증명에 대비하는 가장 좋은 방법 중 하나이며, 제대로 구현하면 사용자에게 주는 부담은 작다"고 소개하면서, 클라우드 환경 관리자에게는 **포털·API에 대한 무단 관리 접근이 매우 높은 리스크**라고 명시합니다. 공격자가 그 접근을 얻으면 통상 모든 데이터를 침해하는 데까지 이어질 수 있기 때문입니다. 같은 장에서 저자는 FIDO U2F는 두 번째 요소로만 쓰이는 반면 **FIDO2는 결합형 다중 요소 장치로 동작해 패스워드리스가 가능**하다고 구분합니다.

> 💡 **원서 이후 변경** — 원서 집필 시점에는 루트에 MFA 디바이스를 하나만 등록할 수 있었습니다. 현재는 **루트와 IAM 사용자 모두 최대 8개의 MFA 디바이스를 등록**할 수 있습니다. 즉 하드웨어 키를 사무실 금고와 다른 지역 금고에 각각 하나씩 등록하는 구성이 가능합니다. 디바이스 하나를 잃어도 계정 복구 요청 절차를 밟지 않아도 되므로, 운영 계정에서는 **최소 2개 등록**을 권장합니다.

등록 결과는 CLI로 확인합니다. 루트에 MFA가 걸렸는지, 루트 액세스 키가 존재하는지를 한 번에 보여주는 것이 `get-account-summary` 입니다.

```bash
aws iam get-account-summary \
  --query 'SummaryMap.{RootMFA:AccountMFAEnabled,RootAccessKeys:AccountAccessKeysPresent,RootSigningCerts:AccountSigningCertificatesPresent,MFADevices:MFADevices,Users:Users}' \
  --profile shopmini-prod
```

기대하는 결과는 다음과 같습니다.

```json
{
    "RootMFA": 1,
    "RootAccessKeys": 0,
    "RootSigningCerts": 0,
    "MFADevices": 4,
    "Users": 3
}
```

`RootMFA` 가 `0` 이면 MFA가 없는 것이고, `RootAccessKeys` 가 `1` 이면 **루트 액세스 키가 살아 있다는 뜻입니다.** 후자는 그 자리에서 중단하고 콘솔에서 삭제하세요. 가상 MFA 디바이스가 실제로 루트에 붙었는지는 다음 명령으로 확인합니다. `User.Arn` 이 `:root` 로 끝나면 루트에 할당된 것입니다.

```bash
aws iam list-virtual-mfa-devices \
  --assignment-status Assigned \
  --query 'VirtualMFADevices[].{Device:SerialNumber,AssignedTo:User.Arn,Since:EnableDate}' \
  --output table \
  --profile shopmini-prod
```

**③ 루트 액세스 키가 없음을 확인하고, 있으면 삭제한다**

루트 액세스 키는 IAM API로 나열하거나 삭제할 수 없습니다. 루트로 콘솔에 로그인해 **My Security Credentials** 에서 직접 지워야 하고, 위 `AccountAccessKeysPresent` 값이 유일한 원격 확인 수단입니다. 이 값이 `1` 인 계정은 "관리자 권한 무제한 키가 어딘가에 있는 계정"이며, 3.4에서 본 노출된 액세스 키 경로의 최악 변형입니다. 사용 흔적이 없어도 지웁니다 — 흔적이 없다는 것은 아직 안 쓰였다는 뜻일 뿐입니다.

**④ 계정 연락처와 대체 연락처를 등록한다**

가장 자주 빠지는 항목입니다. AWS가 보안 사고를 감지했을 때(예: 여러분의 액세스 키가 GitHub에 노출된 것을 AWS가 발견했을 때) 연락하는 곳이 여기입니다. 대체 연락처가 비어 있으면 그 통지는 **루트 이메일로만** 갑니다. 그리고 루트 이메일은 아무도 안 봅니다.

대체 연락처는 `BILLING`, `OPERATIONS`, `SECURITY` 세 종류이며 AWS Account Management API로 설정합니다.

```bash
aws account put-alternate-contact \
  --alternate-contact-type SECURITY \
  --name "ShopMini Security Team" \
  --title "Security Operations" \
  --email-address security@example.com \
  --phone-number "+82-2-1234-5678" \
  --profile shopmini-prod

aws account put-alternate-contact \
  --alternate-contact-type OPERATIONS \
  --name "ShopMini SRE" \
  --title "Platform Operations" \
  --email-address sre@example.com \
  --phone-number "+82-2-1234-5679" \
  --profile shopmini-prod

aws account put-alternate-contact \
  --alternate-contact-type BILLING \
  --name "ShopMini Finance" \
  --title "Cloud Finance" \
  --email-address billing@example.com \
  --phone-number "+82-2-1234-5680" \
  --profile shopmini-prod
```

세 곳 모두 **개인 이메일이 아니라 그룹 주소**로 넣습니다. 등록 결과를 확인합니다.

```bash
for TYPE in SECURITY OPERATIONS BILLING; do
  aws account get-alternate-contact \
    --alternate-contact-type "$TYPE" \
    --query 'AlternateContact.{Type:AlternateContactType,Email:EmailAddress,Name:Name}' \
    --output text \
    --profile shopmini-prod
done
```

기본 연락처 정보(법인명·주소·전화)도 함께 채웁니다. 비어 있으면 계정 복구나 규제 확인 절차에서 막힙니다.

```bash
aws account put-contact-information \
  --contact-information '{
    "FullName": "ShopMini Inc.",
    "CompanyName": "ShopMini Inc.",
    "AddressLine1": "123 Teheran-ro, Gangnam-gu",
    "City": "Seoul",
    "PostalCode": "06232",
    "CountryCode": "KR",
    "PhoneNumber": "+82-2-1234-5678"
  }' \
  --profile shopmini-prod
```

**⑤ 계정 별칭을 지정한다**

보안 요구사항은 아니지만, 사인인 URL에 계정 ID 대신 이름이 들어가면 **"내가 지금 어느 계정에 로그인하고 있는가"** 를 눈으로 구분할 수 있게 됩니다. 운영 계정과 개발 계정을 혼동해서 생기는 사고를 줄이는 값싼 장치입니다.

```bash
aws iam create-account-alias --account-alias shopmini-prod --profile shopmini-prod
```

**⑥ 루트 사용 알람을 건다**

봉인의 마지막 조각입니다. 루트를 쓰는 것 자체가 이상 사건이므로, 쓰였다면 30초 안에 사람에게 도달해야 합니다.

먼저 알림 주제를 만들고 구독합니다.

```bash
TOPIC_ARN=$(aws sns create-topic \
  --name shopmini-security-alerts \
  --region us-east-1 \
  --query TopicArn --output text \
  --profile shopmini-prod)

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint security@example.com \
  --region us-east-1 \
  --profile shopmini-prod
```

EventBridge 규칙의 이벤트 패턴입니다. `userIdentity.type` 이 `Root` 인 이벤트만 잡습니다.

```json
{
  "detail-type": [
    "AWS Console Sign In via CloudTrail",
    "AWS API Call via CloudTrail"
  ],
  "detail": {
    "userIdentity": {
      "type": ["Root"]
    }
  }
}
```

```bash
aws events put-rule \
  --name shopmini-root-activity \
  --description "Alert on any AWS account root user activity" \
  --event-pattern file://root-activity-pattern.json \
  --state ENABLED \
  --region us-east-1 \
  --profile shopmini-prod

aws events put-targets \
  --rule shopmini-root-activity \
  --targets "Id=1,Arn=$TOPIC_ARN" \
  --region us-east-1 \
  --profile shopmini-prod
```

> ⚠️ **왜 `us-east-1` 인가**
> 콘솔 사인인, IAM, STS 글로벌 엔드포인트 같은 **글로벌 서비스 이벤트는 `us-east-1` 로 배달**됩니다. 서울 리전에 규칙을 만들면 루트 콘솔 로그인은 절대 잡히지 않습니다. 또 `AWS API Call via CloudTrail` 이벤트를 EventBridge가 받으려면 **해당 리전에 활성화된 트레일이 있어야** 하므로, 5.3을 먼저 해도 됩니다.
> SNS 주제 정책에서 `events.amazonaws.com` 의 `sns:Publish` 를 허용해야 실제로 메일이 나갑니다. 콘솔로 대상을 붙이면 자동 추가되지만 CLI는 직접 넣어야 합니다.

**루트 알람은 여기서 끝이 아닙니다.** 30.3에서 "반드시 설정해야 할 보안 알람 15가지"를 다루면서 CloudWatch Logs 지표 필터 방식, 알람 억제, 에스컬레이션 경로까지 심화합니다. 이 절의 목표는 "오늘 켜는 것"이고, 30장의 목표는 "운영 가능하게 만드는 것"입니다.

**조직이 있다면**: 관리 계정을 제외한 모든 멤버 계정의 루트 사용은 SCP로 **차단**할 수 있습니다(37.2). 또한 멤버 계정의 루트 자격 증명을 중앙에서 삭제·관리하는 기능이 제공되므로, 조직 환경에서는 봉인 대신 제거가 가능합니다. 단일 계정에서는 이 옵션이 없으므로 이 절의 절차가 최선입니다.

---

## 5.2 🔴 개별 IAM 사용자/아이덴티티 센터 설정과 MFA 강제

### 안 했을 때 벌어지는 일

계정을 만든 팀이 가장 흔히 하는 선택은 "일단 `admin` 하나 만들어 팀에 공유"입니다. 6개월 뒤 감사에서 "이 보안 그룹을 0.0.0.0/0으로 연 사람이 누구입니까"라는 질문이 옵니다. CloudTrail에는 `admin` 이 찍혀 있고, `admin` 을 쓸 수 있는 사람은 현재 7명, 과거 포함 11명입니다. **답이 없습니다.** 그리고 퇴사자가 저장해 둔 그 암호는 여전히 유효합니다.

> 📖 *Practical Cloud Security* 2판 4장은 이 상황을 **"공유 ID(Shared IDs)"** 라는 이름으로 정면으로 다룹니다. 저자의 원칙은 명확합니다 — 가능한 경우 **모든 사용자와 도구는 다른 누구도, 다른 무엇도 쓰지 않는 자기 자신의 ID를 가져야 한다**는 것입니다. 그리고 공유 ID를 쓸 수밖에 없다면 "어떤 개별 주체(사람 또는 자동화 도구)가 그 ID로 접근했는지 정확히 알 수 있어야 한다"고 조건을 붙입니다. 시스템 자체는 그것을 구분할 방법이 없으므로, **자격 증명을 체크아웃하고 반납 시 변경하는 별도 프로세스와 도구**가 필요하다는 것이 저자의 결론이고, 그 도구를 PAM/PIM이라 부릅니다(9.5에서 다룹니다).

같은 장에서 저자는 또한 클라우드 서비스와 애플리케이션에는 **가능한 경우 다른 제공자의 페더레이티드 아이덴티티나 IAM 클라우드 서비스를 쓰라**고 권합니다. AWS에서 그 권고의 직접적인 구현체가 IAM Identity Center입니다.

### 두 갈래 — 그리고 기본 권장

| 항목 | 방식 A: IAM Identity Center (**기본 권장**) | 방식 B: IAM 사용자 |
|---|---|---|
| 자격 증명 수명 | 세션 기반 단기(권한 세트당 1~12시간) | 콘솔 암호·액세스 키 = 장기 |
| 액세스 키 | 원칙적으로 불필요(`aws configure sso`) | 만들면 무기한 유효 |
| MFA | 인스턴스 설정에서 강제(정책 작성 불필요) | 정책으로 직접 강제해야 함 |
| 멀티 계정 확장 | 계정 추가 시 할당만 하면 끝 | 계정마다 사용자를 다시 만들어야 함 |
| 기업 IdP 연동 | SAML/SCIM으로 자동 프로비저닝·해제 | 수동 |
| 퇴사자 처리 | IdP에서 비활성화하면 전 계정 즉시 차단 | 계정마다 개별 삭제 |
| 전제 조건 | AWS Organizations 필요 | 없음 |
| 비용 | 추가 비용 없음 | 추가 비용 없음 |

**Identity Center를 기본으로 하세요.** 이유는 위 표의 마지막에서 두 번째 행입니다. 9.6에서 다룰 아이덴티티 라이프사이클에서 가장 흔한 감사 지적이 "퇴사자 권한 회수 누락"이고, IAM 사용자 방식은 계정 수 × 사람 수만큼의 회수 작업을 남깁니다. 오늘 계정이 하나라도 6개월 뒤에는 다섯 개일 가능성이 높습니다.

Organizations가 아직 없다면 순서는 이렇습니다: **조직 생성(36.2) → Identity Center 활성화 → 권한 세트 생성 → 할당.** 조직 생성 자체는 루트로 하는 몇 안 되는 작업 중 하나이므로, 5.1의 봉인을 하기 **전에** 끝내는 편이 편합니다.

### 방식 A: Identity Center 최소 구성

상세 구축(IdP 연동, 권한 세트 설계, 세션 정책, 계정 그룹 할당 전략)은 **9.2**에서 한 절 전체로 다룹니다. 여기서는 Day 1에 필요한 최소 골격만 세웁니다.

```bash
# 1) 인스턴스 확인 — 콘솔에서 활성화한 뒤 ARN을 얻는다
aws sso-admin list-instances \
  --query 'Instances[].{Instance:InstanceArn,Store:IdentityStoreId}' \
  --output table \
  --profile shopmini-prod
```

```bash
INSTANCE_ARN="arn:aws:sso:::instance/ssoins-EXAMPLE1234567890"
STORE_ID="d-EXAMPLE12345"

# 2) 그룹과 사용자 생성 (기업 IdP를 연동하면 SCIM이 이 단계를 대신한다)
GROUP_ID=$(aws identitystore create-group \
  --identity-store-id "$STORE_ID" \
  --display-name "ShopMini-Prod-Admins" \
  --description "Break-glass administrators for prod account" \
  --query GroupId --output text \
  --profile shopmini-prod)

# 3) 권한 세트 — 세션 4시간으로 짧게
PS_ARN=$(aws sso-admin create-permission-set \
  --instance-arn "$INSTANCE_ARN" \
  --name "AdministratorAccess" \
  --description "Full admin, 4h session" \
  --session-duration "PT4H" \
  --query 'PermissionSet.PermissionSetArn' --output text \
  --profile shopmini-prod)

aws sso-admin attach-managed-policy-to-permission-set \
  --instance-arn "$INSTANCE_ARN" \
  --permission-set-arn "$PS_ARN" \
  --managed-policy-arn "arn:aws:iam::aws:policy/AdministratorAccess" \
  --profile shopmini-prod

# 4) 운영 계정에 그룹 할당
aws sso-admin create-account-assignment \
  --instance-arn "$INSTANCE_ARN" \
  --permission-set-arn "$PS_ARN" \
  --principal-type GROUP \
  --principal-id "$GROUP_ID" \
  --target-type AWS_ACCOUNT \
  --target-id 111122223333 \
  --profile shopmini-prod
```

Day 1에는 `AdministratorAccess` 권한 세트 하나로 시작해도 됩니다. 다만 **배정되는 사람은 2~3명으로 제한**하고 나머지는 읽기 전용부터 시작하세요. 최소 권한(1.1)은 목표이지 첫날의 산출물이 아닙니다. 첫날에 확보할 것은 **"누가 무엇을 했는지 사람 단위로 구분되는 상태"** 이고, Identity Center 세션은 CloudTrail 이벤트에 사용자 이름을 남기므로 이 조건이 자동으로 충족됩니다.

MFA는 Identity Center 인스턴스 설정에서 **"Every time they sign in(항상 요구)"** + **"등록되지 않은 사용자는 로그인 시 등록 강제"** 로 둡니다. 정책을 쓰지 않아도 되는 이 점이 방식 A의 큰 이점입니다.

### 방식 B: IAM 사용자 + MFA 강제 정책

Organizations를 쓸 수 없는 상황(단일 계정 제약, 조달 지연 등)에서만 쓰세요. 핵심은 **사용자에게 직접 정책을 붙이지 않고 그룹에 붙이는 것**입니다.

> 📖 *AWS Security Cookbook* 1장은 이 지점을 반복해서 강조합니다. 저자는 "정책은 개별 사용자보다 그룹에 배정하는 것이 좋은 습관"이라고 쓰고, IAM 체크리스트 항목 중 두 개가 **최소 한 명의 사용자와 하나의 그룹을 만들었는지**를 검사한다고 설명합니다.

```bash
aws iam create-group --group-name Administrators --profile shopmini-prod

aws iam create-user \
  --user-name kim.minsu \
  --tags Key=Owner,Value=kim.minsu Key=Team,Value=Platform \
  --profile shopmini-prod

aws iam add-user-to-group \
  --group-name Administrators \
  --user-name kim.minsu \
  --profile shopmini-prod

aws iam attach-group-policy \
  --group-name Administrators \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess \
  --profile shopmini-prod
```

여기까지는 MFA가 없어도 관리자로 다 됩니다. 그래서 아래 정책을 **모든 사용자가 속하는 그룹**(예: `AllUsers`)에 붙여 MFA를 강제합니다. 구조는 "자기 MFA는 스스로 등록할 수 있게 허용 + MFA가 없으면 그 외 전부 거부"의 2단입니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowViewAccountInfo",
      "Effect": "Allow",
      "Action": [
        "iam:GetAccountPasswordPolicy",
        "iam:ListVirtualMFADevices"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AllowManageOwnVirtualMFADevice",
      "Effect": "Allow",
      "Action": [
        "iam:CreateVirtualMFADevice",
        "iam:DeleteVirtualMFADevice"
      ],
      "Resource": "arn:aws:iam::111122223333:mfa/${aws:username}"
    },
    {
      "Sid": "AllowManageOwnUserMFAAndPassword",
      "Effect": "Allow",
      "Action": [
        "iam:EnableMFADevice",
        "iam:DeactivateMFADevice",
        "iam:ResyncMFADevice",
        "iam:ListMFADevices",
        "iam:GetUser",
        "iam:ChangePassword"
      ],
      "Resource": "arn:aws:iam::111122223333:user/${aws:username}"
    },
    {
      "Sid": "DenyAllExceptSelfServiceIfNoMFA",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:ResyncMFADevice",
        "iam:ListMFADevices",
        "iam:ListVirtualMFADevices",
        "iam:GetUser",
        "iam:ChangePassword",
        "iam:GetAccountPasswordPolicy",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

```bash
POLICY_ARN=$(aws iam create-policy \
  --policy-name ForceMFASelfService \
  --policy-document file://force-mfa.json \
  --query 'Policy.Arn' --output text \
  --profile shopmini-prod)

aws iam create-group --group-name AllUsers --profile shopmini-prod
aws iam attach-group-policy \
  --group-name AllUsers --policy-arn "$POLICY_ARN" \
  --profile shopmini-prod
aws iam add-user-to-group \
  --group-name AllUsers --user-name kim.minsu \
  --profile shopmini-prod
```

> ⚠️ `Bool` 이 아니라 **`BoolIfExists`** 입니다. `aws:MultiFactorAuthPresent` 키는 장기 액세스 키로 호출한 요청에는 **아예 존재하지 않습니다.** `Bool` 로 쓰면 그런 요청에서 조건이 매칭되지 않아 Deny가 발동하지 않고, 결과적으로 **액세스 키만 있으면 MFA 강제를 통째로 우회**하게 됩니다(4.2에서 지적한 함정입니다). `BoolIfExists` 는 키가 없으면 조건을 참으로 보므로 키 기반 호출도 Deny에 걸립니다.
>
> `sts:GetSessionToken` 을 `NotAction` 에 남기는 이유는 CLI 사용자가 MFA 토큰으로 임시 자격 증명을 받는 경로 때문입니다. 빼면 CLI에서 MFA를 쓸 방법이 없어집니다.

**적용 전에 반드시 정책 시뮬레이터나 별도 테스트 사용자로 검증하세요.** 이 정책은 잘못 쓰면 자기 자신을 포함한 전원을 잠글 수 있습니다. 잠겼을 때 유일한 탈출구가 5.1에서 봉인한 루트이고, 그것이 루트를 지우지 않고 봉인만 하는 이유입니다.

---

## 5.3 🔴 CloudTrail 전 리전 활성화

### 안 했을 때 벌어지는 일

3개월 뒤 GuardDuty가 "누군가 여러분의 액세스 키로 악성 IP에서 API를 호출했다"고 알립니다. 언제부터? 어떤 리소스를 봤나? 어떤 IAM 역할을 새로 만들었나? 데이터를 얼마나 가져갔나?

**트레일이 없으면 이 질문 대부분에 답할 수 없습니다.** CloudTrail 이벤트 기록(Event history)은 최근 90일치 관리 이벤트만, 리전별로 분리해 보관하고, S3 객체 읽기 같은 데이터 이벤트는 애초에 담지 않습니다. 침해가 발견되기까지 걸리는 시간은 자주 90일을 넘습니다. 로깅은 소급 적용이 불가능한 유일한 통제입니다 — 다른 통제는 늦게라도 켜면 그 시점부터 보호되지만, 로그는 **꺼져 있던 기간이 영구적인 공백**으로 남습니다.

> 📖 *AWS Security Cookbook* 8장은 이 구조를 정확히 설명합니다. 저자는 "기본적으로 CloudTrail API 이벤트 로그는 90일간 제공된다"고 하면서, **90일보다 오래 저장하려면, S3나 Lambda의 데이터 이벤트를 로깅하려면, 로그 검색에 추가 유연성을 얻으려면 트레일을 만들어 S3에 적재해야 한다**고 명시합니다. 같은 장에서 "기본적으로 트레일은 한 리전의 이벤트만 기록하지만 **다중 리전 트레일로 구성할 수 있다**"고 하며, 저자가 레시피에서 실제로 만든 것도 다중 리전 트레일입니다. 고급 옵션에 대해서는 **"로그 파일 검증(log file validation)을 활성화하면 CloudTrail이 로그를 배달한 이후 그 파일이 수정·삭제되었는지 아니면 변경되지 않았는지 알 수 있다"** 고 설명합니다.
>
> 저자는 한계도 짚습니다 — **CloudTrail은 AWS API 호출을 수반하는 이벤트만 기록**하므로 EC2에서 도는 애플리케이션의 오류는 잡히지 않습니다. 그것은 CloudWatch의 몫입니다.

> 💡 **원서 이후 변경** — 원서 집필 시점의 데이터 이벤트 설정은 "S3 버킷 선택 / Lambda 함수 선택" 형태의 기본 이벤트 선택기였습니다. 현재는 **고급 이벤트 선택기(advanced event selectors)** 가 표준이며, `resources.ARN` 접두사 기반 필터로 특정 버킷·접두사만 선별 로깅할 수 있습니다. 아래 예제는 이 방식을 씁니다. 데이터 이벤트는 관리 이벤트와 달리 무료 계층이 없으므로, **전체 버킷이 아니라 기밀 등급 버킷만** 선별하는 것이 4.2의 분류 체계를 비용으로 옮기는 방법입니다.

### 실행

**① 로그 버킷을 먼저 만든다 — 잠그고 시작한다**

```bash
BUCKET="shopmini-prod-cloudtrail-111122223333"

aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2 \
  --profile shopmini-prod

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --profile shopmini-prod

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled \
  --profile shopmini-prod

aws s3api put-bucket-ownership-controls \
  --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]' \
  --profile shopmini-prod
```

**② 버킷 정책 — CloudTrail 서비스에만, 그것도 이 트레일에만 허용한다**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::shopmini-prod-cloudtrail-111122223333",
      "Condition": {
        "StringEquals": {
          "aws:SourceArn": "arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/shopmini-prod-trail"
        }
      }
    },
    {
      "Sid": "AWSCloudTrailWrite",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shopmini-prod-cloudtrail-111122223333/AWSLogs/111122223333/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceArn": "arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/shopmini-prod-trail"
        }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::shopmini-prod-cloudtrail-111122223333",
        "arn:aws:s3:::shopmini-prod-cloudtrail-111122223333/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

`aws:SourceArn` 조건이 핵심입니다. 이것이 없으면 **다른 계정의 누군가가 자기 트레일의 로그를 여러분 버킷에 쓰게 만들 수 있습니다**(혼동된 대리인 문제, 8.6). 버킷을 로그 오염 채널로 쓰는 이 패턴은 실제로 존재합니다.

```bash
aws s3api put-bucket-policy \
  --bucket "$BUCKET" \
  --policy file://trail-bucket-policy.json \
  --profile shopmini-prod
```

**③ 트레일 생성 — 다중 리전 + 로그 파일 검증 + KMS**

```bash
aws cloudtrail create-trail \
  --name shopmini-prod-trail \
  --s3-bucket-name "$BUCKET" \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation \
  --kms-key-id alias/shopmini/app \
  --region ap-northeast-2 \
  --profile shopmini-prod

aws cloudtrail start-logging \
  --name shopmini-prod-trail \
  --region ap-northeast-2 \
  --profile shopmini-prod
```

**`create-trail` 만 하면 로깅이 시작되지 않습니다.** `start-logging` 을 반드시 호출하세요. 콘솔로 만들면 자동으로 켜지지만 CLI는 그렇지 않습니다. 이 한 줄을 빼고 "CloudTrail 켰다"고 체크한 계정을 실제로 자주 봅니다.

세 옵션의 의미는 각각 다릅니다.

| 옵션 | 없으면 생기는 공백 |
|---|---|
| `--is-multi-region-trail` | 켜둔 리전 밖의 활동이 기록되지 않음 → 5.5의 미사용 리전 침해가 안 보임 |
| `--include-global-service-events` | IAM·STS·CloudFront 등 글로벌 서비스 호출이 빠짐 → 권한 상승 흔적 누락 |
| `--enable-log-file-validation` | 로그 파일이 변조·삭제되었는지 증명할 수 없음 → 법적 증거로서의 가치 하락 |

> ⚠️ `--kms-key-id` 로 지정한 KMS 키의 **키 정책**에 `cloudtrail.amazonaws.com` 의 `kms:GenerateDataKey*` 와 로그를 읽을 주체의 `kms:Decrypt` 를 허용해야 합니다. 허용하지 않으면 트레일 생성 자체가 실패하거나 로그를 읽을 수 없습니다(13.4). 위 예제는 CANON의 애플리케이션 키를 그대로 썼지만, 운영이 커지면 **로그 전용 키로 분리**하고 키 관리자를 로그 계정에 두세요(29.3, 29.9).

**④ 데이터 이벤트를 선별 적용한다**

관리 이벤트는 "누가 버킷을 만들었나"를, 데이터 이벤트는 "누가 그 버킷의 객체를 몇 개 읽어갔나"를 기록합니다. **유출 규모 산정에는 후자가 필요합니다.** 비용을 고려해 사용자 업로드 버킷만 대상으로 합니다.

```json
[
  {
    "Name": "management-events-all",
    "FieldSelectors": [
      { "Field": "eventCategory", "Equals": ["Management"] }
    ]
  },
  {
    "Name": "s3-uploads-data-events",
    "FieldSelectors": [
      { "Field": "eventCategory", "Equals": ["Data"] },
      { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
      {
        "Field": "resources.ARN",
        "StartsWith": ["arn:aws:s3:::shopmini-uploads/"]
      }
    ]
  }
]
```

```bash
aws cloudtrail put-event-selectors \
  --trail-name shopmini-prod-trail \
  --advanced-event-selectors file://event-selectors.json \
  --region ap-northeast-2 \
  --profile shopmini-prod
```

**⑤ 검증한다**

```bash
aws cloudtrail get-trail-status \
  --name shopmini-prod-trail \
  --query '{Logging:IsLogging,LastDelivery:LatestDeliveryTime,DeliveryError:LatestDeliveryError}' \
  --region ap-northeast-2 \
  --profile shopmini-prod
```

`IsLogging` 이 `true` 이고 `LatestDeliveryError` 가 비어 있어야 합니다. 로그 파일 검증은 며칠 뒤 다음 명령으로 확인합니다. 이것이 **"로그가 배달 이후 손대지지 않았다"** 를 암호학적으로 증명하는 절차입니다.

```bash
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/shopmini-prod-trail \
  --start-time 2026-09-01T00:00:00Z \
  --region ap-northeast-2 \
  --profile shopmini-prod
```

**여기서 멈추지 않을 것**: 이 절이 확보한 것은 "로그가 남는다"까지입니다. **운영 계정 관리자가 그 로그를 지울 수 없게 만드는 것**은 별개 문제로, 조직 트레일과 중앙 로그 계정(`777788889999`) 아키텍처는 29.2·29.4·29.9, Object Lock을 통한 불변화와 보존 기간은 29.3·29.7, Athena 수사 질의는 30.6에서 다룹니다. 단일 계정 Day 1에서는 **버킷 버전 관리 + 퍼블릭 차단 + 로그 파일 검증** 세 개를 확보하고 넘어가세요.

---

## 5.4 🔴 결제 알람과 예산 설정 🧪

### 안 했을 때 벌어지는 일

액세스 키가 공개 저장소에 커밋됩니다. 자동화된 스캐너가 몇 분 안에 찾아냅니다. 공격자는 여러분이 쓰지 않는 리전 몇 곳에서 GPU 인스턴스를 한도까지 기동해 암호화폐 채굴을 시작합니다. 애플리케이션은 정상 동작하고, 대시보드는 초록색이고, 아무도 눈치채지 못합니다. **다음 달 청구서가 도착할 때까지.** 채굴은 그 기간 내내 돌았습니다.

> 📖 *AWS Security Cookbook* 9장은 **GuardDuty가 인스턴스가 암호화폐 채굴에 사용되었는지를 탐지할 수 있다**고 설명하고, 같은 목록에서 "자격 증명이 탈취되었는지 — 악성 IP 접근, EC2 외부에서 EC2 인스턴스 프로파일 사용 등을 통해 — 탐지할 수 있다"고 씁니다. 즉 이 시나리오에 대한 정공법은 GuardDuty입니다(31.1). 다만 Day 1의 관점에서 결제 알람이 여전히 필요한 이유는, 결제 알람은 **탐지 서비스가 놓친 모든 종류의 이상을 금액이라는 단일 지표로 잡아내는 최후의 그물**이기 때문입니다.

> 📖 같은 책 1장의 첫 레시피는 IAM 체크리스트에 포함되지 않는 항목 하나를 저자가 일부러 덧붙입니다. **빌링 알람**입니다. 저자는 "IAM 체크리스트의 일부는 아니지만 빌링 알람을 설정하는 것은 좋은 습관"이며 "설정한 한도를 초과할 때 알람을 발생시켜 알려준다"고 씁니다. 절차는 ① 빌링 대시보드의 Billing preferences에서 **Receive Billing Alerts 체크박스를 켜고 저장**, ② CloudWatch 대시보드의 Billing에서 알람을 만들어 사용 한도와 알림 이메일을 지정하는 순서입니다. 저자는 그 시점에 **"빌링 알람은 리전이 US East (N. Virginia)로 설정되어 있을 때만 만들 수 있다"** 는 제약도 함께 명시합니다.

### 3중 구조 — 각각이 잡는 것이 다르다

| 층 | 서비스 | 반응 속도 | 잡는 것 |
|---|---|---|---|
| ① 절대 한도 | CloudWatch 빌링 알람 (`AWS/Billing`) | 약 6시간 주기 | "이번 달 누적이 X달러를 넘었다" |
| ② 예측 한도 | AWS Budgets (`ACTUAL` + `FORECASTED`) | 일 단위 | "이 추세면 월말에 예산을 넘는다" |
| ③ 패턴 이상 | Cost Anomaly Detection | 대체로 하루 이내 | "예산 안이지만 이 서비스 지출이 평소와 다르다" |

①만 있으면 한도 근처에서만 울립니다. ②를 더하면 월초에 튀는 지출을 월말 전에 잡습니다. ③이 필요한 이유는 **한도 안에서 일어나는 침해**가 있기 때문입니다 — 월 예산 5,000달러 계정에서 공격자가 하루 200달러를 태우면 ①②는 조용하고 ③만 반응합니다.

**① CloudWatch 빌링 알람**

빌링 지표는 `us-east-1` 에만 게시됩니다. 다른 리전에서 만들면 데이터가 들어오지 않아 알람이 영구 `INSUFFICIENT_DATA` 상태로 남습니다. 원서가 지적한 제약이 지금도 유효합니다.

```bash
TOPIC_ARN="arn:aws:sns:us-east-1:111122223333:shopmini-security-alerts"

for THRESHOLD in 500 1000 3000; do
  aws cloudwatch put-metric-alarm \
    --alarm-name "shopmini-prod-billing-over-${THRESHOLD}usd" \
    --alarm-description "Estimated monthly charges exceeded ${THRESHOLD} USD" \
    --namespace AWS/Billing \
    --metric-name EstimatedCharges \
    --dimensions Name=Currency,Value=USD \
    --statistic Maximum \
    --period 21600 \
    --evaluation-periods 1 \
    --threshold "$THRESHOLD" \
    --comparison-operator GreaterThanThreshold \
    --treat-missing-data notBreaching \
    --alarm-actions "$TOPIC_ARN" \
    --region us-east-1 \
    --profile shopmini-prod
done
```

임계값을 **여러 단으로 쌓는 것**이 요령입니다. 하나만 두면 그 하나가 울릴 때는 이미 늦습니다. 500/1000/3000 처럼 배수로 두면 첫 알람은 "확인해 보자", 두 번째는 "지금 본다", 세 번째는 "사고로 취급한다"로 대응 수준을 나눌 수 있습니다.

먼저 콘솔의 **Billing preferences → 결제 알림 수신(Receive Billing Alerts)** 을 켜야 `AWS/Billing` 지표가 게시됩니다. 이 스위치는 CLI로 켤 수 없습니다. 원서가 첫 단계로 지정한 것이 정확히 이것입니다.

**② AWS Budgets**

0.3에서 만든 학습 계정 예산은 20달러 단일 예산이었습니다. 운영 계정은 총액 예산 + 서비스별 예산으로 나눕니다.

`budget-prod.json`:

```json
{
    "BudgetName": "shopmini-prod-monthly",
    "BudgetLimit": {
        "Amount": "5000",
        "Unit": "USD"
    },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {},
    "CostTypes": {
        "IncludeTax": true,
        "IncludeSubscription": true,
        "UseBlended": false,
        "IncludeRefund": false,
        "IncludeCredit": false,
        "IncludeUpfront": true,
        "IncludeRecurring": true,
        "IncludeOtherSubscription": true,
        "IncludeSupport": true,
        "IncludeDiscount": true,
        "UseAmortized": false
    }
}
```

`IncludeCredit` 과 `IncludeRefund` 를 `false` 로 두는 것에 주의하세요. 크레딧을 포함시키면 프로모션 크레딧이 남아 있는 동안 실제 사용량 급증이 예산에 반영되지 않아 **침해 신호가 크레딧에 가려집니다.**

`notifications-prod.json`:

```json
[
    {
        "Notification": {
            "NotificationType": "ACTUAL",
            "ComparisonOperator": "GREATER_THAN",
            "Threshold": 80,
            "ThresholdType": "PERCENTAGE"
        },
        "Subscribers": [
            {
                "SubscriptionType": "SNS",
                "Address": "arn:aws:sns:us-east-1:111122223333:shopmini-security-alerts"
            },
            {
                "SubscriptionType": "EMAIL",
                "Address": "billing@example.com"
            }
        ]
    },
    {
        "Notification": {
            "NotificationType": "FORECASTED",
            "ComparisonOperator": "GREATER_THAN",
            "Threshold": 100,
            "ThresholdType": "PERCENTAGE"
        },
        "Subscribers": [
            {
                "SubscriptionType": "SNS",
                "Address": "arn:aws:sns:us-east-1:111122223333:shopmini-security-alerts"
            }
        ]
    }
]
```

```bash
aws budgets create-budget \
  --account-id 111122223333 \
  --budget file://budget-prod.json \
  --notifications-with-subscribers file://notifications-prod.json \
  --profile shopmini-prod
```

**③ Cost Anomaly Detection**

> 💡 **원서 이후 추가** — 이 서비스는 원서 집필 이후 도입되었습니다. 지출 패턴을 학습해 통계적 이상을 탐지하므로, 임계값을 사람이 정하지 않아도 됩니다. 추가 비용 없이 쓸 수 있으므로 Day 1에 켜지 않을 이유가 없습니다.

```bash
MONITOR_ARN=$(aws ce create-anomaly-monitor \
  --anomaly-monitor '{
    "MonitorName": "shopmini-prod-service-monitor",
    "MonitorType": "DIMENSIONAL",
    "MonitorDimension": "SERVICE"
  }' \
  --query MonitorArn --output text \
  --profile shopmini-prod)
```

`anomaly-subscription.json`:

```json
{
    "SubscriptionName": "shopmini-prod-anomaly-alerts",
    "MonitorArnList": [
        "arn:aws:ce::111122223333:anomalymonitor/EXAMPLE-MONITOR-ID"
    ],
    "Subscribers": [
        {
            "Type": "SNS",
            "Address": "arn:aws:sns:us-east-1:111122223333:shopmini-security-alerts"
        }
    ],
    "Frequency": "IMMEDIATE",
    "ThresholdExpression": {
        "Dimensions": {
            "Key": "ANOMALY_TOTAL_IMPACT_ABSOLUTE",
            "MatchOptions": ["GREATER_THAN_OR_EQUAL"],
            "Values": ["100"]
        }
    }
}
```

```bash
aws ce create-anomaly-subscription \
  --anomaly-subscription file://anomaly-subscription.json \
  --profile shopmini-prod
```

`IMMEDIATE` 빈도는 SNS 구독자에게만 지원됩니다. 이메일로 받으려면 `DAILY` 나 `WEEKLY` 를 쓰되, 침해 탐지 목적이라면 SNS + `IMMEDIATE` 조합을 쓰고 SNS에서 이메일·채팅으로 팬아웃하세요.

> ⚠️ **알람은 사람에게 도달해야 알람이다**
> 위 세 층 모두 SNS 주제 하나로 모았습니다. 그 주제의 구독이 개인 이메일 한 개라면, 그 사람이 휴가 중일 때 이 통제는 존재하지 않습니다. 최소 요건은 **① 그룹 주소 + ② 채팅 채널(Chatbot 등) 또는 온콜 시스템** 두 경로입니다. 30.9에서 알람 피로와 에스컬레이션 설계를 다룹니다.

---

## 5.5 🔴 미사용 리전 제한과 기본 VPC 정리

### 안 했을 때 벌어지는 일

AWS 계정에는 **활성화된 모든 리전에 기본 VPC가 하나씩** 있습니다. 그 기본 VPC는 편의를 위해 설계되어 있어서, 서브넷이 인터넷 게이트웨이로 라우팅되고, 인스턴스를 띄우면 퍼블릭 IP가 자동 할당되고, 기본 보안 그룹은 같은 그룹 내 통신을 전부 허용합니다.

> 📖 *AWS Security Cookbook* 5장은 이 특성을 그대로 기술합니다. 저자는 **"AWS는 모든 리전에 우리가 바로 쓸 수 있는 기본 VPC를 만들어 둔다"** 고 하면서 그 주요 특징으로 **기본 VPC의 서브넷들이 인터넷으로 라우팅된다**는 점, 가용 영역마다 서브넷이 하나씩 만들어진다는 점, DHCP 옵션 세트가 설정된다는 점을 나열합니다. 실제로 저자 자신도 CloudHSM 실습에서 "편의를 위해 기본 VPC를 사용했다"고 여러 차례 밝히고 있습니다 — 편의성이 곧 이 리소스의 존재 이유입니다.

그 편의성이 공격자에게도 편리합니다. 서울 리전만 쓰는 계정의 자격 증명이 유출되면, 공격자는 **한 번도 콘솔을 열어본 적 없는 리전**에서 작업합니다. 거기엔 이미 인터넷에 연결된 VPC가 준비되어 있고, 대시보드는 서울만 보고 있고, 5.3에서 `--is-multi-region-trail` 을 빼먹었다면 로그조차 없습니다. 크립토마이닝 사고 대부분이 이 경로를 씁니다.

### ① 사용하지 않는 옵트인 리전을 비활성화한다

일부 리전은 명시적으로 활성화해야 쓸 수 있는 **옵트인 리전**입니다. 기본 활성 리전은 비활성화할 수 없지만, 옵트인 리전은 끌 수 있습니다. 끄면 그 리전에서는 API 호출 자체가 되지 않습니다.

```bash
aws account list-regions \
  --region-opt-status-contains ENABLED ENABLED_BY_DEFAULT \
  --query 'Regions[].{Region:RegionName,Status:RegionOptStatus}' \
  --output table \
  --profile shopmini-prod
```

```bash
# 쓰지 않는 옵트인 리전을 끈다 (기본 활성 리전에는 적용 불가)
aws account disable-region --region-name af-south-1 --profile shopmini-prod
aws account disable-region --region-name me-south-1 --profile shopmini-prod
```

### ② 기본 활성 리전은 정책으로 막는다

기본 활성 리전(`us-east-1`, `ap-northeast-1` 등)은 끌 수 없으므로 IAM으로 막습니다. 조직이 있다면 **SCP가 정답**이고(4.4에서 리전 제한 SCP를 이미 보았습니다, 상세는 37.2), 단일 계정이라면 아래 정책을 **모든 사용자 그룹과 역할에 붙이거나 권한 경계로 씁니다**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideApprovedRegions",
      "Effect": "Deny",
      "NotAction": [
        "iam:*",
        "sts:*",
        "organizations:*",
        "account:*",
        "cloudfront:*",
        "route53:*",
        "route53domains:*",
        "waf:*",
        "wafv2:*",
        "shield:*",
        "support:*",
        "budgets:*",
        "ce:*",
        "cur:*",
        "health:*",
        "trustedadvisor:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": [
            "ap-northeast-2",
            "us-east-1"
          ]
        }
      }
    }
  ]
}
```

`us-east-1` 을 허용 목록에 남기는 이유는 5.4의 빌링 지표와 5.1의 루트 사인인 이벤트가 거기서 처리되기 때문입니다. 글로벌 서비스를 `NotAction` 으로 제외하지 않으면 IAM 사용자 생성이나 CloudFront 배포 같은 정상 작업이 전부 막힙니다 — 4.4에서 같은 함정을 지적했습니다.

> ⚠️ 이 정책은 **예방(preventive) 통제이고 탐지 통제가 아닙니다.** 정책이 붙지 않은 주체(예: 나중에 만든 서비스 역할)는 여전히 어느 리전에서든 움직입니다. 그래서 5.3의 다중 리전 트레일이 짝으로 필요합니다. 예방과 탐지를 함께 두는 것이 1.2 심층 방어의 실제 모습입니다.

### ③ 기본 VPC를 정리한다 🧪

기본 VPC를 지우면 그 리전에서 서브넷을 지정하지 않은 인스턴스 기동이 실패합니다. **그게 목적입니다.** 실수든 침해든, 네트워크를 명시적으로 설계하지 않은 리소스가 생기지 않습니다.

아래 스크립트는 **ENI(네트워크 인터페이스)가 하나라도 붙은 기본 VPC는 건너뜁니다.** 이미 쓰고 있는 VPC를 지우는 사고를 막는 안전장치입니다.

```bash
#!/usr/bin/env bash
# delete-default-vpcs.sh — 미사용 기본 VPC 정리 (실행 전 --dry-run 으로 확인)
set -euo pipefail

PROFILE="${1:?사용법: $0 <프로파일> [--apply]}"
APPLY="${2:-}"

REGIONS=$(aws account list-regions \
  --region-opt-status-contains ENABLED ENABLED_BY_DEFAULT \
  --query 'Regions[].RegionName' --output text \
  --profile "$PROFILE")

for REGION in $REGIONS; do
  VPC_ID=$(aws ec2 describe-vpcs \
    --filters Name=isDefault,Values=true \
    --query 'Vpcs[0].VpcId' --output text \
    --region "$REGION" --profile "$PROFILE" 2>/dev/null || echo "None")

  if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
    echo "[$REGION] 기본 VPC 없음 — 건너뜀"
    continue
  fi

  ENI_COUNT=$(aws ec2 describe-network-interfaces \
    --filters Name=vpc-id,Values="$VPC_ID" \
    --query 'length(NetworkInterfaces)' --output text \
    --region "$REGION" --profile "$PROFILE")

  if [ "$ENI_COUNT" != "0" ]; then
    echo "[$REGION] $VPC_ID — ENI ${ENI_COUNT}개 사용 중, 삭제 보류 (수동 확인 필요)"
    continue
  fi

  if [ "$APPLY" != "--apply" ]; then
    echo "[$REGION] $VPC_ID — 삭제 대상 (dry-run)"
    continue
  fi

  echo "[$REGION] $VPC_ID 삭제 시작"

  for SUBNET in $(aws ec2 describe-subnets \
      --filters Name=vpc-id,Values="$VPC_ID" \
      --query 'Subnets[].SubnetId' --output text \
      --region "$REGION" --profile "$PROFILE"); do
    aws ec2 delete-subnet --subnet-id "$SUBNET" \
      --region "$REGION" --profile "$PROFILE"
    echo "  서브넷 삭제: $SUBNET"
  done

  for IGW in $(aws ec2 describe-internet-gateways \
      --filters Name=attachment.vpc-id,Values="$VPC_ID" \
      --query 'InternetGateways[].InternetGatewayId' --output text \
      --region "$REGION" --profile "$PROFILE"); do
    aws ec2 detach-internet-gateway \
      --internet-gateway-id "$IGW" --vpc-id "$VPC_ID" \
      --region "$REGION" --profile "$PROFILE"
    aws ec2 delete-internet-gateway --internet-gateway-id "$IGW" \
      --region "$REGION" --profile "$PROFILE"
    echo "  IGW 삭제: $IGW"
  done

  aws ec2 delete-vpc --vpc-id "$VPC_ID" \
    --region "$REGION" --profile "$PROFILE"
  echo "[$REGION] $VPC_ID 삭제 완료"
done
```

```bash
chmod +x delete-default-vpcs.sh
./delete-default-vpcs.sh shopmini-prod            # 먼저 dry-run
./delete-default-vpcs.sh shopmini-prod --apply    # 확인 후 실행
```

기본 라우팅 테이블, 기본 NACL, 기본 보안 그룹은 개별 삭제 대상이 아니며 VPC와 함께 사라집니다. 나중에 필요해지면 리전별로 되살릴 수 있습니다.

```bash
aws ec2 create-default-vpc --region ap-northeast-2 --profile shopmini-prod
```

**서울 리전은 어떻게 하나**: ShopMini의 운영 VPC는 CANON에 따라 `shopmini-prod`(`10.20.0.0/16`)를 직접 설계합니다(18.3). 그러므로 서울 리전의 기본 VPC도 삭제 대상입니다. 다만 실제로 그 리전에서 무언가 돌고 있다면 위 스크립트가 ENI를 보고 자동으로 보류하므로, 먼저 운영 VPC로 이전을 끝낸 뒤 정리하세요.

---

## 5.6 IAM 암호 정책·액세스 키 순환 정책

### 암호 정책

> 📖 *AWS Security Cookbook* 1장의 IAM 체크리스트 마지막 항목이 **계정의 암호 정책 설정**입니다. 저자는 "체크리스트에서 암호 정책 항목을 펼쳐 적절한 암호 정책을 설정하라"고 안내하고, 이 항목을 "계정에 대한 암호 순환 정책을 설정하는 것"이라고 설명합니다.

```bash
aws iam update-account-password-policy \
  --minimum-password-length 20 \
  --require-uppercase-characters \
  --require-lowercase-characters \
  --require-numbers \
  --require-symbols \
  --allow-users-to-change-password \
  --password-reuse-prevention 24 \
  --max-password-age 365 \
  --profile shopmini-prod
```

```bash
aws iam get-account-password-policy \
  --query 'PasswordPolicy' \
  --profile shopmini-prod
```

두 값의 근거를 밝힙니다.

**길이 20자** — 원서의 권고를 그대로 따랐습니다.

> 📖 *Practical Cloud Security* 2판 4장에서 저자는 암호 선택 원칙을 네 가지로 정리합니다. ① 재사용하지 말 것(재사용은 크리덴셜 스터핑으로 이어집니다), ② 그래서 늘어나는 암호는 **평판 있는 암호 월렛**으로 관리할 것, ③ 외울 필요 없는 암호는 보안 난수 생성기로 만들고 **20자를 목표**로 할 것, ④ 외워야 하는 암호는 Diceware 방식의 여섯 단어 조합에 비알파벳 문자를 끼워 넣을 것. 저자는 **완전한 패스워드리스 모델로 가지 않은 이상 좋은 암호 선택은 여전히 중요**하며, 클라우드에서는 **공격자가 인터넷을 통해 직접 암호를 추측할 수 있는 경우가 많아 더욱 그렇다**고 덧붙입니다.

**최대 사용 기간 365일** — 원서의 강조점은 "주기적 변경"이 아니라 "재사용 금지 + 충분한 길이 + 다중 요소"에 있습니다. 짧은 강제 변경 주기는 `Autumn2026!` → `Winter2026!` 식 순번 암호를 유도해 실질 강도를 오히려 낮춥니다. 그래서 **길이와 재사용 방지는 강하게, 변경 주기는 느슨하게** 두었습니다. 컴플라이언스가 90일 변경을 명시하면 따르되(4.4), 그 대가로 길이 요구를 낮추지는 마세요.

**가장 좋은 것은 이 정책이 아무에게도 적용되지 않는 상태입니다.** Identity Center + 기업 IdP를 쓰면 IAM 계정 암호 정책은 IAM 사용자에게만 적용되고, IAM 사용자가 0명이면 이 정책은 유물이 됩니다. 그것이 5.2에서 방식 A를 기본으로 권한 이유입니다. 패스키·패스워드리스로의 전환은 9.4에서 다룹니다.

### 액세스 키 순환

> 📖 *Practical Cloud Security* 2판 4장은 API 키를 암호와 비교하며 결정적인 차이를 짚습니다. **API 키는 사람이 아니라 자동화를 위해 설계되었기 때문에 다중 인증을 쓸 수 없고**, 따라서 길고 무작위인 문자열이어야 합니다. 그리고 대부분의 사용자 아이덴티티가 공개 ID + 비공개 암호 쌍을 갖는 것과 달리, **API 키는 보통 비공개 키 하나가 신원 표명과 인증을 동시에 수행**합니다. 즉 유출되면 그것으로 끝입니다.

AWS 액세스 키가 정확히 이 구조입니다. 그래서 순환 정책보다 먼저 오는 답은 **키를 만들지 않는 것**입니다.

| 상황 | 액세스 키 대신 쓸 것 | 심화 |
|---|---|---|
| 사람이 CLI를 쓴다 | `aws configure sso` (Identity Center 단기 자격 증명) | 9.2 |
| EC2에서 API를 호출한다 | 인스턴스 프로파일 | 8.2 |
| ECS/EKS/Lambda | 태스크 역할 / IRSA·Pod Identity / 실행 역할 | 8.4, 24.6 |
| GitHub Actions 등 외부 CI | OIDC 페더레이션 | 27.6 |
| 온프레미스 서버 | IAM Roles Anywhere | 6.4 |

그래도 남는 키가 있다면 순환합니다. 현황 파악은 자격 증명 보고서로 합니다. 이 보고서 한 장이 "MFA 없는 사용자", "90일 넘은 키", "한 번도 쓰이지 않은 키"를 한 번에 보여줍니다.

```bash
aws iam generate-credential-report --profile shopmini-prod

aws iam get-credential-report \
  --query Content --output text \
  --profile shopmini-prod \
  | base64 --decode > credential-report.csv
```

```bash
# 90일이 지난 활성 키 찾기 (GNU date / BSD date 모두 대응)
CUTOFF=$(date -u -d '90 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-90d +%Y-%m-%d)

aws iam list-users --query 'Users[].UserName' --output text --profile shopmini-prod \
  | tr '\t' '\n' \
  | while read -r USER; do
      [ -z "$USER" ] && continue
      aws iam list-access-keys --user-name "$USER" \
        --query "AccessKeyMetadata[?Status=='Active'].[UserName,AccessKeyId,CreateDate]" \
        --output text --profile shopmini-prod
    done \
  | awk -v cutoff="$CUTOFF" '{ split($3, d, "T"); if (d[1] <= cutoff) print $1, $2, d[1], "<-- 90일 초과" }'
```

무중단 순환은 **"새 키 생성 → 배포 → 구 키 비활성화 → 관찰 → 구 키 삭제"** 5단계입니다. 비활성화와 삭제 사이에 관찰 기간을 두는 것이 핵심입니다. 바로 삭제하면 어딘가 남아 있던 참조가 조용히 실패합니다.

```bash
USER=svc-shopmini-batch

# 1) 새 키 생성 (IAM 사용자당 최대 2개)
aws iam create-access-key --user-name "$USER" --profile shopmini-prod

# 2) 애플리케이션·시크릿 저장소에 새 키 배포 (11장)

# 3) 구 키 비활성화 — 삭제가 아니라 비활성화
aws iam update-access-key \
  --user-name "$USER" \
  --access-key-id AKIAIOSFODNN7EXAMPLE \
  --status Inactive \
  --profile shopmini-prod

# 4) 며칠간 관찰 — 마지막 사용 시각 확인
aws iam get-access-key-last-used \
  --access-key-id AKIAIOSFODNN7EXAMPLE \
  --query 'AccessKeyLastUsed.{When:LastUsedDate,Service:ServiceName,Region:Region}' \
  --profile shopmini-prod

# 5) 문제 없으면 삭제
aws iam delete-access-key \
  --user-name "$USER" \
  --access-key-id AKIAIOSFODNN7EXAMPLE \
  --profile shopmini-prod
```

이 절차를 사람이 기억해서 수행하면 반드시 잊습니다. Config 규칙 `access-keys-rotated` 와 `iam-user-mfa-enabled` 로 상시 평가하고(26.6), 위반 시 자동 조치까지 연결하는 방법은 35.2에서 다룹니다.

---

## 5.7 📋 Day 1 보안 체크리스트 (20항목)

계정을 만든 날 끝내야 하는 20개입니다. **각 항목은 "지금 하는 최소 구성"이고, 심화 장에서 운영 가능한 수준으로 확장합니다.**

| # | 항목 | 본문 | 심화 |
|---|---|---|---|
| 1 | 루트 이메일을 조직 소유 그룹 주소로 두고 수신자 2명 이상 확보 | 5.1 | — |
| 2 | 루트에 MFA 등록 (하드웨어 우선, 최소 2개 디바이스) | 5.1 | 9.4 |
| 3 | 루트 액세스 키 부재 확인 (`AccountAccessKeysPresent = 0`) | 5.1 | 6.4 |
| 4 | 대체 연락처 3종(SECURITY·OPERATIONS·BILLING) 등록 | 5.1 | — |
| 5 | 기본 연락처 정보(법인명·주소·전화) 등록 | 5.1 | — |
| 6 | 계정 별칭 지정 | 5.1 | — |
| 7 | 루트 사용 알람 (`us-east-1` EventBridge → SNS) | 5.1 | 30.3 |
| 8 | 개별 아이덴티티 확보 — Identity Center 기본, IAM 사용자는 대안 | 5.2 | 9.2 |
| 9 | 공유 자격 증명 0개 — 모든 사람이 자기 ID를 가짐 | 5.2 | 9.5, 9.6 |
| 10 | 모든 사람 아이덴티티에 MFA 강제 (`BoolIfExists` 조건) | 5.2 | 7.4, 9.4 |
| 11 | 권한은 그룹/권한 세트에만 부여 — 사용자 직접 부여 0건 | 5.2 | 7.2 |
| 12 | CloudTrail 다중 리전 트레일 + 글로벌 이벤트 + `start-logging` 확인 | 5.3 | 29.2 |
| 13 | 로그 파일 검증 활성화 + 로그 버킷 버전 관리·퍼블릭 차단 | 5.3 | 29.3 |
| 14 | 트레일 버킷 정책에 `aws:SourceArn` 조건 적용 | 5.3 | 8.6, 15.4 |
| 15 | 기밀 등급 버킷에 S3 데이터 이벤트 선별 적용 | 5.3 | 15.11, 29.2 |
| 16 | 결제 알림 수신 켜기 + CloudWatch 빌링 알람 다단계(`us-east-1`) | 5.4 | 30.2 |
| 17 | AWS Budgets `ACTUAL` + `FORECASTED` 두 알림 + Cost Anomaly Detection | 5.4 | 39.4 |
| 18 | 미사용 옵트인 리전 비활성화 + `aws:RequestedRegion` 제한 정책 | 5.5 | 37.2, 38.6 |
| 19 | 전 리전 기본 VPC 삭제 (ENI 사용 중인 리전은 이전 후 삭제) | 5.5 | 18.3 |
| 20 | 암호 정책(20자·재사용 24회 금지) + 액세스 키 90일 순환 절차 문서화 | 5.6 | 6.4, 26.6 |

**여기까지가 "첫날"입니다.** 하나라도 미완이면 그 계정에 워크로드를 올리지 마세요. 반대로 20개를 다 했다고 안전해진 것도 아닙니다 — 이 목록에는 GuardDuty(31.1), Security Hub(31.5), Config(29.8), 계정 수준 퍼블릭 액세스 차단(15.2), IMDSv2 강제(8.3)가 없습니다. 그것들은 "첫 달"의 목록이고, 전체 지도는 부록 A의 마스터 100항목입니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| 루트 계정 | 삭제 불가 → **봉인**. MFA 2개 이상, 액세스 키 0개, 대체 연락처 3종, 사용 시 즉시 알람(`us-east-1`) |
| 개별 아이덴티티 | 공유 ID 금지(원서 원칙). Identity Center 기본 권장 — 단기 자격 증명 + 중앙 회수 |
| MFA 강제 | Identity Center면 인스턴스 설정, IAM 사용자면 `BoolIfExists` 조건 정책. `Bool` 은 우회 가능 |
| CloudTrail | 이벤트 기록은 90일·단일 리전·데이터 이벤트 없음 → 트레일 필수. 다중 리전 + 글로벌 + 로그 파일 검증 |
| 로깅의 특수성 | **소급 적용 불가**. 꺼져 있던 기간은 영구 공백 |
| 결제 감시 | 3중: 빌링 알람(절대 한도) + Budgets(예측) + Cost Anomaly Detection(패턴) |
| 리전 통제 | 옵트인 리전은 `account:DisableRegion`, 기본 활성 리전은 `aws:RequestedRegion` 조건 |
| 기본 VPC | 모든 리전에 존재, 인터넷으로 라우팅됨 → 미사용 리전은 삭제 |
| 자격 증명 | 암호는 20자·재사용 금지, 액세스 키는 **만들지 않는 것**이 1차 답. 남으면 5단계 무중단 순환 |
| 이 장의 성격 | 분석 없이 실행해도 손해가 없는 통제만 모은 장. 20항목 미완 계정에는 워크로드를 올리지 않는다 |

## 🔴 필수 구성 체크리스트 — CLI 검증 명령

5.7이 "무엇을 할 것인가"라면, 이것은 **"실제로 되어 있는가"** 를 기계로 확인하는 목록입니다. 분기마다 그대로 돌려 증거로 남기세요.

- [ ] `aws iam get-account-summary` → `AccountMFAEnabled=1`, `AccountAccessKeysPresent=0`
- [ ] `aws iam list-virtual-mfa-devices --assignment-status Assigned` → 루트 ARN 항목 존재
- [ ] `aws account get-alternate-contact --alternate-contact-type SECURITY` → 그룹 주소 반환
- [ ] `aws iam list-account-aliases` → 별칭 존재
- [ ] `aws events list-rules --region us-east-1` → 루트 활동 규칙 `ENABLED`
- [ ] `aws sns list-subscriptions-by-topic` → 구독 2개 이상, `PendingConfirmation` 아님
- [ ] `aws cloudtrail describe-trails` → `IsMultiRegionTrail=true`, `LogFileValidationEnabled=true`
- [ ] `aws cloudtrail get-trail-status` → `IsLogging=true`, `LatestDeliveryError` 없음
- [ ] `aws cloudtrail get-event-selectors` → 관리 이벤트 + 기밀 버킷 데이터 이벤트
- [ ] `aws s3api get-public-access-block --bucket <트레일 버킷>` → 4개 항목 모두 `true`
- [ ] `aws s3api get-bucket-versioning --bucket <트레일 버킷>` → `Status=Enabled`
- [ ] `aws cloudwatch describe-alarms --region us-east-1` → 빌링 알람 존재, `INSUFFICIENT_DATA` 아님
- [ ] `aws budgets describe-budgets --account-id 111122223333` → `ACTUAL`·`FORECASTED` 알림 모두
- [ ] `aws ce get-anomaly-monitors` → 모니터 + 구독 존재
- [ ] `aws account list-regions --region-opt-status-contains ENABLED` → 미사용 옵트인 리전 없음
- [ ] `aws ec2 describe-vpcs --filters Name=isDefault,Values=true` → 사용 리전 외 전부 빈 결과
- [ ] `aws iam get-account-password-policy` → 길이 20 이상, `PasswordReusePrevention` 설정됨
- [ ] `aws iam get-credential-report` → MFA 미설정 사용자 0명, 90일 초과 활성 키 0개
- [ ] `aws iam list-users` → Identity Center 전환 후 남은 사람 IAM 사용자 0명(목표)
- [ ] `aws iam list-attached-user-policies` → 모든 사용자에 대해 빈 결과(권한은 그룹에만)

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| 루트 이메일을 개인 메일로 둔다 | 담당자 퇴사 시 계정 복구 경로 소멸, 개인 메일 침해가 곧 계정 침해 | 조직 소유 그룹 주소 + 수신자 2명 이상 (5.1) |
| 루트에 MFA만 걸고 액세스 키는 확인하지 않는다 | MFA를 우회하는 무제한 관리자 키가 그대로 살아 있음 | `AccountAccessKeysPresent=0` 확인 (5.1) |
| 대체 연락처를 비워 둔다 | AWS의 키 노출 통지가 아무도 안 보는 루트 메일로만 감 | SECURITY·OPERATIONS·BILLING 3종 등록 (5.1) |
| 루트 알람을 서울 리전에 만든다 | 루트 콘솔 로그인은 `us-east-1` 로 배달되므로 절대 안 잡힘 | 규칙을 `us-east-1` 에 생성 (5.1) |
| 팀에 `admin` 계정 하나를 공유한다 | "누가 이 설정을 바꿨나"에 영구히 답할 수 없고 퇴사자 암호가 유효 | 개별 ID, Identity Center 기본 (5.2) |
| MFA 조건을 `Bool` 로 쓴다 | 액세스 키 호출에서 조건이 매칭되지 않아 MFA 강제가 통째로 우회됨 | `BoolIfExists` (5.2) |
| MFA 강제 정책에서 `sts:GetSessionToken` 을 제외하지 않는다 | CLI에서 MFA를 쓸 경로가 사라져 사용자가 정책 해제를 요구 | `NotAction` 에 포함 (5.2) |
| `create-trail` 만 하고 끝낸다 | 트레일은 존재하지만 로그가 한 줄도 안 쌓임 | `start-logging` + `get-trail-status` 확인 (5.3) |
| 단일 리전 트레일을 만든다 | 미사용 리전에서 벌어진 침해가 기록에 없음 | `--is-multi-region-trail` (5.3) |
| 트레일 버킷 정책에 `aws:SourceArn` 을 안 넣는다 | 타 계정이 여러분 버킷을 로그 오염 채널로 사용 가능 | 조건 필수 (5.3, 8.6) |
| 데이터 이벤트를 전체 버킷에 켠다 | 비용 급증 후 "비싸서 껐다"로 귀결 | 기밀 등급 버킷만 선별 (5.3, 4.2) |
| 빌링 알람을 서울 리전에 만든다 | `AWS/Billing` 지표가 없어 영구 `INSUFFICIENT_DATA` | `us-east-1` 에 생성 (5.4) |
| 예산 알림을 `ACTUAL` 하나만 둔다 | 돈이 이미 나간 뒤에 알게 됨 | `FORECASTED` 병행 (5.4) |
| 예산에 크레딧을 포함시킨다 | 프로모션 크레딧이 사용량 급증을 가려 침해 신호가 사라짐 | `IncludeCredit=false` (5.4) |
| 알람 구독을 개인 이메일 하나로 둔다 | 그 사람 휴가 중에는 통제가 존재하지 않음 | 그룹 주소 + 채팅/온콜 2경로 (5.4, 30.9) |
| 기본 VPC를 방치한다 | 안 쓰는 리전에 인터넷 연결 VPC가 준비된 상태 — 크립토마이닝 착륙장 | 미사용 리전 기본 VPC 삭제 (5.5) |
| 리전 제한만 하고 다중 리전 트레일을 안 켠다 | 정책이 안 붙은 주체의 타 리전 활동이 보이지 않음 | 예방 + 탐지 동시 (5.5, 1.2) |
| 리전 제한에서 글로벌 서비스를 제외하지 않는다 | IAM·CloudFront·Route 53 작업이 전부 실패 | `NotAction` 에 글로벌 서비스 나열 (5.5, 4.4) |
| 액세스 키를 비활성화 없이 바로 삭제한다 | 남아 있던 참조가 조용히 실패하고 원인 추적이 어려움 | 비활성화 → 관찰 → 삭제 (5.6) |
| 90일 강제 변경만 강하게 걸고 길이를 8자로 둔다 | `Autumn2026!` 류 순번 암호를 유도해 실질 강도가 낮아짐 | 20자 + 재사용 24회 금지 (5.6) |

## 다음 장 예고

여기까지가 1부입니다. 원칙(1장), 책임선(2장), 위협(3장), 리스크(4장)를 지나 **오늘 켜야 하는 것**(5장)까지 왔습니다.

그런데 5.2에서 큰 것을 미뤘습니다. "개별 아이덴티티를 확보하라"까지는 했지만 **그 아이덴티티가 무엇을 할 수 있는지**는 `AdministratorAccess` 하나로 뭉뚱그렸습니다. 5.3의 버킷 정책, 5.5의 리전 제한, 5.6의 키 순환 — 이 장의 모든 통제가 결국 하나의 언어로 쓰였습니다. IAM 정책입니다.

2부는 그 언어를 처음부터 다시 배웁니다. 6장은 사용자·그룹·역할·정책 네 요소의 관계와 ARN 문법, 그리고 **장기 액세스 키를 없애야 하는 이유**를 유출 사고의 최대 원인이라는 관점에서 정면으로 다룹니다. 클라우드에서 IAM은 곧 네트워크 경계이고, 2부가 이 책의 심장입니다.
