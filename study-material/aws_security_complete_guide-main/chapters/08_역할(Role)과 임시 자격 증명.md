---
title: "8장. 역할(Role)과 임시 자격 증명"
---

# 8장. 역할(Role)과 임시 자격 증명

> **이 장에서 다루는 것**
> - 역할이 왜 "정체성"이 아니라 **잠시 걸치는 모자**인지 — **신뢰 정책 + 권한 정책의 2중 구조**와 세션 수명·체이닝 제한
> - EC2에 키를 넣지 않는 표준 — **인스턴스 프로파일**과 자동 순환되는 임시 자격 증명
> - **IMDSv2 강제** — SSRF 한 줄로 계정이 넘어가는 경로를 막는, 원서 집필 이후 표준이 된 필수 설정
> - 서비스 역할 · 서비스 연결 역할 · 크로스 계정 역할 전환 실습(CLI + 콘솔)
> - 서드파티 역할의 **Confused Deputy** 문제와 `sts:ExternalId` / `aws:SourceArn`의 구분
> - 세션 태그로 만드는 **ABAC**, 그리고 사람이 아닌 신원의 인증(**워크로드 아이덴티티**)
>
> **선행 지식**: 6장(IAM 기본 요소, 자격 증명의 종류), 7장(정책 구조·평가 순서·Condition 키)
> **난이도**: ★★☆

---

7장까지는 "정책에 무엇을 쓸 것인가"를 다뤘습니다. 이 장은 **"그 정책을 누가, 얼마나 오래 들고 있을 것인가"** 를 다룹니다. 6.4에서 없애야 한다고 한 장기 액세스 키의 자리를 채우는 것이 **역할(Role)** 입니다. 역할은 "권한을 담는 그릇"이 아니라 **자격 증명의 수명을 몇 시간 단위로 잘라내는 장치**이고, 그래서 유출 사고의 피해 크기를 구조적으로 줄입니다.

> 📖 *Practical Cloud Security* 1판·2판 4장 「Roles」는 역할을 공유 ID와 비교하며 결정적인 차이를 짚습니다. **"공유 ID와 클라우드 제공자 역할의 근본적인 차이는, 공유 ID는 고정된 자격 증명을 가진 독립적인 아이덴티티라는 점이다. 클라우드 제공자 역할은 완전한 아이덴티티가 아니다. 그것은 역할에 접근할 권한이 있는 다른 아이덴티티가 취하는 특별한 상태이며, 그 역할에 접근하기 위한 임시 자격 증명을 부여받는다."**
>
> 그리고 이 장 후반부(8.2·8.4·8.8)를 예고하는 한 문장. **"역할을 맡을 수 있는 것은 사람만이 아니다. 일부 구성 요소(가상 머신 등)는 생성될 때 역할을 맡아, 그 역할에 부여된 권한으로 작업을 수행할 수 있다."**

"완전한 아이덴티티가 아니다"가 핵심입니다. 역할에는 비밀번호도 액세스 키도 없습니다. 역할은 **누가 걸칠 수 있는지를 스스로 선언**하고, 걸친 쪽에 짧은 수명의 자격 증명을 발급합니다. 그 선언문이 신뢰 정책입니다.

---

## 8.1 역할 위임(AssumeRole)의 동작 원리

### 위임과 두 개의 정책

> 📖 *AWS Security Cookbook* 1장 「Switching roles with AWS Organizations」의 "How it works" 절: **"우리가 통제하는 리소스에 접근할 수 있도록 권한을 부여하는 것을 위임(delegation)이라고 부른다. 위임을 수행하려면 리소스를 소유한 계정(신뢰하는 계정)과 접근이 필요한 사용자가 있는 계정(신뢰받는 계정) 사이에 신뢰를 설정해야 한다."**
>
> 이어지는 문장이 2중 구조의 정의입니다. **"권한을 위임할 때, 사용자에게 필요한 권한을 부여하는 표준 권한 정책에 더해, 신뢰하는 계정의 IAM 역할은 신뢰 정책(trust policy)도 정의하게 된다. 신뢰 정책은 어떤 계정이 그 역할을 맡을 수 있는지를 지정한다."**

역할 하나에는 **성격이 완전히 다른 두 정책**이 붙습니다. 이 둘을 섞는 것이 첫 번째 함정입니다.

| | 신뢰 정책 (Trust Policy) | 권한 정책 (Permissions Policy) |
|---|---|---|
| 답하는 질문 | **누가** 이 역할을 걸칠 수 있나 | 이 역할을 걸치면 **무엇을** 할 수 있나 |
| 정책 유형 | 리소스 기반 정책 (역할에 부착) | 아이덴티티 기반 정책 |
| `Principal` 요소 | **필수** | 쓸 수 없음 |
| 개수 | 역할당 **정확히 1개** | 관리형 + 인라인 다수 |
| CLI 파라미터 | `--assume-role-policy-document` | `attach-role-policy` / `put-role-policy` |
| 없을 때 | 역할 생성 자체가 불가 | 걸칠 수는 있지만 아무것도 못 함 |

**두 정책은 AND 조건입니다.** 크로스 계정에서는 신뢰 정책이 허용해도 걸치는 쪽 계정의 IAM 정책에 `sts:AssumeRole` 허용이 없으면 실패하고, 반대도 같습니다. 7.3의 평가 순서가 **AssumeRole 호출**과 **역할 세션의 후속 호출** 두 번 각각 돌아갑니다.

```
[1] 호출 주체 (IAM 사용자 alice / EC2 인스턴스 / Lambda / GitHub Actions)
     │
     │  sts:AssumeRole  (RoleArn, RoleSessionName, DurationSeconds, Tags, ExternalId)
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ AWS STS — 두 번 확인한다                                        │
│                                                                 │
│  (a) 호출 주체 계정의 아이덴티티 정책 · 권한 경계 · SCP        │
│      → sts:AssumeRole 이 Resource=역할 ARN 에 대해 Allow 인가?  │
│                                                                 │
│  (b) 대상 역할의 신뢰 정책                                      │
│      → Principal 에 이 주체가 있는가?                           │
│      → Condition (ExternalId · MFA · SourceIp · OrgID) 통과?    │
└─────────────────────────────────────────────────────────────────┘
     │ 둘 다 Allow 일 때만
     ▼
[2] 임시 자격 증명 3종 발급
     AccessKeyId (ASIA... 로 시작)  ·  SecretAccessKey  ·  SessionToken
     + Expiration (만료 시각)
     + AssumedRoleUser.Arn
       = arn:aws:sts::111122223333:assumed-role/ShopMiniAppRole/<세션이름>
     │
     ▼
[3] 후속 API 호출 — 세션 자격 증명으로 서명
     평가 대상: 역할의 권한 정책 + (있으면) 세션 정책 + 리소스 정책 + SCP
     │
     ▼
[4] Expiration 도달 → 자격 증명 무효. 다시 [1] 부터.

※ CloudTrail 기록: [1]에서 AssumeRole 이벤트 1건,
   [3]의 모든 호출에 userIdentity.sessionContext 로 원래 주체가 남는다.
```

`AccessKeyId` 접두사는 유용한 신호입니다. `AKIA`는 장기 키, `ASIA`는 임시 자격 증명입니다. **`AKIA`가 애플리케이션 설정 파일에 있으면 그 자체가 결함**입니다.

### 세션 이름은 감사의 유일한 단서다

`RoleSessionName`은 필수 파라미터이지만 아무 값이나 통과하므로 자동화에서 `session1` 같은 값으로 채워지곤 합니다. 이 값은 CloudTrail의 `assumed-role/역할명/세션명` ARN에 그대로 박히고, **역할 하나를 여러 사람·파이프라인이 공유할 때 "누가 했나"에 답할 유일한 단서**가 됩니다. 사람은 사번이나 IdP 사용자명, CI는 `<리포지토리>-<커밋SHA앞7자리>`를 씁니다.

더 강한 통제는 **`sts:SourceIdentity`** 입니다. `RoleSessionName`은 호출자가 매번 바꿀 수 있지만 `SourceIdentity`는 한 번 설정되면 **역할 체이닝을 거쳐도 변경할 수 없습니다.** 신뢰 정책에서 `sts:SetSourceIdentity`를 요구하면 "역할을 두 번 갈아타 신원을 지우는" 경로가 막힙니다.

### 세션 지속 시간과 역할 체이닝

| 항목 | 값 | 비고 |
|---|---|---|
| 역할의 `MaxSessionDuration` | 1~12시간 (기본 1시간) | `aws iam update-role --max-session-duration` |
| `AssumeRole --duration-seconds` | `MaxSessionDuration` 이하 | 초과 요청 시 오류 |
| `AssumeRoleWithWebIdentity` / `WithSAML` | 최대 12시간 | IdP 토큰 수명에도 종속 |
| **역할 체이닝 시** | **최대 1시간** 🔴 | `MaxSessionDuration`을 12시간으로 올려도 무시됨 |
| `GetSessionToken` (MFA용) | 15분~36시간 | 역할이 아니라 사용자 자격 증명 |

> 📖 *AWS Security Cookbook* 1장은 **역할 체이닝**을 정의합니다. **"역할 체이닝은 AWS CLI나 API를 통해 역할이 두 번째 역할을 맡는 과정이다."**

기억할 제약은 **1시간 상한**입니다. 12시간 배치를 위해 `MaxSessionDuration`을 43200으로 올려도 실제로 `A 역할 → B 역할` 체인을 타고 있다면 **1시간 뒤에 조용히 만료**됩니다. 원인 불명의 `ExpiredToken`이 나면 체이닝 여부를 먼저 확인하십시오. 근본 해결은 **SDK의 자동 갱신에 맡기는 것**입니다 — 진짜 원인은 대개 자격 증명을 시작 시 한 번만 읽어 담아둔 코드입니다.

### 역할을 걸치면 원래 권한은 사라진다

> 📖 *AWS Security Cookbook* 1장: **"사용자가 역할을 맡으면, 그 사용자가 역할 사용을 멈출 때까지 자신의 원래 권한을 일시적으로 포기한다."** 같은 절의 또 하나의 제약. **"신뢰 정책의 Principal 로 와일드카드(`*`)를 지정할 수 없다."**

첫 문장은 콘솔 역할 전환에서 중요합니다. 관리 계정에서 운영 계정으로 전환하면 관리 계정 권한은 그 창에서 사라지므로, 두 계정을 동시에 다루려면 브라우저 프로필을 분리해야 합니다.

두 번째 문장은 정확히 옮길 필요가 있습니다. `Principal`에 `"AWS": "*"` 를 **문법적으로 쓸 수는 있습니다.** 다만 그것은 "전 세계 모든 AWS 계정"을 뜻하고, `Condition` 없이 두면 **역할 자체가 공개 리소스**가 됩니다(7.5). IAM Access Analyzer는 이런 역할을 "외부 접근 가능"으로 즉시 보고합니다.

---

## 8.2 🔴 EC2 인스턴스 프로파일 — 키를 코드에 넣지 않는 표준 방법

> 📖 *AWS Security Cookbook* 6장 「Creating and attaching an IAM role to an EC2 instance」: **"이제 자격 증명을 설정하지 않고도 EC2 인스턴스에서 지원되는 S3 작업(예: 터미널에서 `s3 ls` 명령 실행)을 수행할 수 있다. 대안은 EC2 머신 내부에 AWS 자격 증명을 설정하는 것인데, 누군가 그 머신에 침입하면 이 자격 증명이 노출된다."**
>
> 인스턴스 프로파일의 정체는 1장에 나옵니다. **"인스턴스가 시작될 때 EC2 인스턴스에 역할 정보를 전달하려면, 역할을 인스턴스 프로파일 안에 넣을 수 있다. 인스턴스 프로파일은 IAM 역할을 담는 컨테이너로 생각할 수 있다."**

### 🔴 반드시 이렇게 구성하라

1. **모든 EC2에 인스턴스 프로파일을 부착한다.** 권한이 필요 없는 인스턴스에도 SSM 관리용 최소 역할을 붙입니다(21.5의 Session Manager 전제).
2. **인스턴스 안에 `~/.aws/credentials`, 환경 변수 `AWS_ACCESS_KEY_ID`, User Data 하드코딩 키를 두지 않는다.** SDK 자격 증명 공급자 체인은 **환경 변수와 공유 자격 증명 파일을 IMDS보다 먼저** 읽습니다. 낡은 키 파일 하나가 남아 있으면 그 키가 역할을 이깁니다. "역할은 맞는데 왜 안 되지"의 절반이 이것입니다.
3. **역할은 인스턴스가 아니라 워크로드 단위로 나눈다.** 앱 서버와 배치 서버가 역할을 공유하면 앱 SSRF 하나로 배치 권한까지 넘어갑니다.
4. **`iam:PassRole`을 제한한다.** `ec2:RunInstances` 권한이 있고 `iam:PassRole`이 `Resource: "*"` 면 **관리자 역할을 붙인 인스턴스를 띄워 권한을 상승**시킬 수 있습니다(7.5).
5. **역할 정책에 `ec2:SourceInstanceARN` 또는 태그 조건을 걸어 범위를 좁힌다.**

### 관계 정리

```
IAM 역할  ShopMiniAppRole
   ├── 신뢰 정책 : Principal = ec2.amazonaws.com
   └── 권한 정책 : S3 shopmini-uploads 읽기/쓰기, KMS alias/shopmini/app 사용

인스턴스 프로파일  ShopMiniAppRole   ← 역할을 담는 컨테이너, 역할 1개만
   │
   ▼ associate-iam-instance-profile
EC2 인스턴스  i-0a1b2c3d4e5f6a7b8
   └── IMDS 가 자격 증명을 노출
       http://169.254.169.254/latest/meta-data/iam/security-credentials/ShopMiniAppRole
       → { AccessKeyId, SecretAccessKey, Token, Expiration }  ※ 자동 순환
```

콘솔에서 역할을 만들면 인스턴스 프로파일이 **같은 이름으로 자동 생성**되어 둘의 구분이 보이지 않습니다. CLI나 CloudFormation에서는 직접 만들어야 하고, 여기서 "역할은 있는데 인스턴스에 붙지 않는다"는 혼란이 생깁니다. **인스턴스 프로파일에는 역할을 하나만 넣을 수 있습니다.**

### 🧪 CLI 실습

```bash
# 0) 신뢰 정책 — EC2 서비스가 이 역할을 맡을 수 있게 한다
cat > trust-ec2.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowEC2ToAssume",
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

# 1) 역할 생성
aws iam create-role \
  --role-name ShopMiniAppRole \
  --assume-role-policy-document file://trust-ec2.json \
  --max-session-duration 3600 \
  --tags Key=Project,Value=awssec-lab Key=Chapter,Value=ch08 Key=AutoDelete,Value=true \
  --profile awssec-lab

# 2) 최소 권한 인라인 정책 부착 (AmazonS3FullAccess 같은 광범위 관리형 정책을 쓰지 않는다)
cat > app-perms.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "UploadsObjectAccess",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::shopmini-uploads/*"
    },
    {
      "Sid": "UploadsListOnly",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shopmini-uploads"
    },
    {
      "Sid": "UseAppKey",
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/*",
      "Condition": {
        "StringEquals": { "kms:ViaService": "s3.ap-northeast-2.amazonaws.com" }
      }
    }
  ]
}
JSON

aws iam put-role-policy \
  --role-name ShopMiniAppRole \
  --policy-name ShopMiniAppInlinePolicy \
  --policy-document file://app-perms.json \
  --profile awssec-lab

# 3) 인스턴스 프로파일 생성 후 역할 삽입 — CLI에서는 이 두 단계가 필수
aws iam create-instance-profile \
  --instance-profile-name ShopMiniAppRole --profile awssec-lab

aws iam add-role-to-instance-profile \
  --instance-profile-name ShopMiniAppRole \
  --role-name ShopMiniAppRole --profile awssec-lab

# 4) 실행 중인 인스턴스에 연결 (인스턴스 중단 없이 가능)
aws ec2 associate-iam-instance-profile \
  --instance-id i-0a1b2c3d4e5f6a7b8 \
  --iam-instance-profile Name=ShopMiniAppRole \
  --region ap-northeast-2 --profile awssec-lab

# 5) 인스턴스 안에서 확인 — 자격 증명 파일이 없어도 동작해야 한다
#    (IMDSv2 토큰 방식. 8.3 참조)
aws sts get-caller-identity
# → Arn: arn:aws:sts::111122223333:assumed-role/ShopMiniAppRole/i-0a1b2c3d4e5f6a7b8
```

**자동 순환**은 아무것도 하지 않아도 일어납니다. EC2가 만료 전에 자격 증명을 갱신하고 SDK는 `Expiration`을 보고 다시 읽습니다. 장기 키 순환 정책·순환 실패 알람·유출 대응 절차가 **전부 필요 없어지는 것**이 진짜 이득입니다.

---

## 8.3 ⚠️ 인스턴스 메타데이터(IMDS) 보안

### 원서가 이미 경고한 것

> 📖 *Practical Cloud Security* 1판·2판 4장 「Instance Metadata and Identity Documents」: **"특정 시스템에서 실행되는 프로세스는 잘 알려진 엔드포인트에 접속해 자신이 실행 중인 시스템에 관한 모든 정보를 얻을 수 있고, 그 프로세스는 또한 그 시스템의 신원을 증명하는 암호학적으로 서명된 방법도 제공받는다."** 그리고 곧바로 위험을 지적합니다. **"그러나 이것은 확실한 방법이 아니다. 시스템의 어떤 프로세스든, 시스템 상의 권한 수준과 무관하게 이 메타데이터를 요청할 수 있기 때문이다."**
>
> 컨테이너에 대한 경고도 정확히 짚혀 있습니다. **"이것은 컨테이너 환경에서 특히 문제가 될 수 있는데, 호스트 시스템 상의 어떤 컨테이너든 아이덴티티 문서를 요청한 뒤 그 호스트 시스템인 척할 수 있기 때문이다. 이런 경우에는 컨테이너가 메타데이터 서비스에 도달하는 것을 차단해야 한다."**

원서가 2019년과 2023년에 똑같이 남긴 이 경고는 **"메타데이터 서비스는 요청자를 인증하지 않는다"** 는 사실에 기반합니다.

> 💡 **원서 이후 변경** — AWS는 2019년 11월 **IMDSv2**(세션 지향 방식)를 도입했고, 이후 계정·리전 단위 기본값(`modify-instance-metadata-defaults`), SCP용 조건 키(`ec2:MetadataHttpTokens`) 등을 순차적으로 추가했습니다. 원서 3권 모두 IMDSv2를 언급하지 않으므로 이 절의 구체적 설정은 원서 인용이 아니라 **현재 AWS 표준**으로 읽으십시오. 결론부터 말하면 **IMDSv1은 예외 없이 끕니다.**

### 사고 시나리오

ShopMini의 상품 등록 화면에는 판매자가 입력한 이미지 URL을 서버가 내려받아 썸네일을 만드는 기능이 있습니다. 앱은 private-app 서브넷(`10.20.10.0/24`)의 EC2에서 8443 포트로 돌고 인터넷 인바운드는 ALB만 받습니다. 네트워크 설계에는 문제가 없습니다.

```
1. 공격자가 상품 등록 폼에 이미지 URL로 다음 값을 넣는다.
   http://169.254.169.254/latest/meta-data/iam/security-credentials/

2. 앱 서버가 그 URL을 그대로 GET 한다 (SSRF).
   응답 본문: ShopMiniAppRole

3. 이어서 다음 URL을 넣는다.
   http://169.254.169.254/latest/meta-data/iam/security-credentials/ShopMiniAppRole
   응답 본문: {"AccessKeyId":"ASIA...","SecretAccessKey":"...",
               "Token":"...","Expiration":"2026-09-06T12:34:56Z"}

4. 공격자는 자기 노트북에서 그 3종 자격 증명으로 AWS API를 호출한다.
   ALB도, 보안 그룹도, NAT 게이트웨이도 이 호출 경로에 없다.
   → shopmini-uploads 전체 열람, KMS 복호화, 역할 권한이 넓었다면 그 이상.
```

**뚫린 것은 네트워크가 아니라 "인증 없이 자격 증명을 내주는 엔드포인트"** 입니다. 프라이빗 서브넷도 이그레스 차단도 막지 못합니다. 자격 증명이 밖으로 나간 뒤에는 공격자의 네트워크에서 호출되기 때문입니다.

### 원인

| 원인 | 설명 |
|---|---|
| IMDSv1은 **단순 GET 요청**으로 응답한다 | SSRF·XXE·오설정된 리버스 프록시·취약한 라이브러리가 모두 "GET 한 번"으로 자격 증명을 얻는다 |
| 요청자를 **인증하지 않는다** | 원서의 지적 그대로. 웹 서버 프로세스든 저권한 프로세스든 동일하게 응답 |
| 역할 권한이 **넓다** | 8.2를 건너뛰고 `AmazonS3FullAccess`를 붙였다면 피해가 계정 전체 S3로 확대 |
| 응답 패킷의 **홉 제한이 크다** | 컨테이너·프록시를 한 단계 더 지나가면 인접 워크로드까지 자격 증명을 얻는다 |

### 🔴 올바른 구성 — IMDSv2 강제

IMDSv2는 **"토큰을 먼저 PUT으로 받아오고, 그 토큰을 헤더에 실어 GET한다"** 는 2단계로 바꿉니다.

```bash
# IMDSv2 정상 사용법
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

이 구조가 공격을 막는 이유는 넷입니다.


| 방어 요소 | 막는 것 |
|---|---|
| **PUT 메서드 요구** | 대부분의 SSRF·오픈 리다이렉트·이미지 fetch 기능은 GET만 수행한다 |
| **`X-aws-ec2-metadata-token` 커스텀 헤더 요구** | 브라우저·프록시가 임의 헤더를 붙여주지 않는다 |
| **`X-Forwarded-For` 헤더가 있는 PUT 거부** | 리버스 프록시를 우회 통로로 쓰는 경로를 차단 |
| **응답 패킷의 IP TTL을 홉 제한 값으로 설정** | 홉 제한 1이면 토큰 응답이 인스턴스 밖으로 못 나간다 |

**IMDSv1 vs IMDSv2 비교**

| 항목 | IMDSv1 | IMDSv2 |
|---|---|---|
| 요청 방식 | `GET /latest/meta-data/...` | `PUT /latest/api/token` → 토큰 헤더 + GET |
| 인증 | 없음 | 세션 토큰 (최대 6시간, `21600`초) |
| SSRF 내성 | **없음** | GET만 가능한 SSRF는 실패 |
| 홉 제한 제어 | 없음 | `HttpPutResponseHopLimit` (1~64) |
| IAM 조건 키 | `ec2:RoleDelivery` = `1.0` | `ec2:RoleDelivery` = `2.0` |
| 권장 설정 | **끈다(`HttpTokens=required`)** | 강제 |

### 🧪 설정 명령

```bash
# (1) 기존 인스턴스 — IMDSv2 강제 + 홉 제한 1
aws ec2 modify-instance-metadata-options \
  --instance-id i-0a1b2c3d4e5f6a7b8 \
  --http-endpoint enabled \
  --http-tokens required \
  --http-put-response-hop-limit 1 \
  --region ap-northeast-2 --profile awssec-lab

# (2) 계정·리전 단위 기본값 — 앞으로 만드는 인스턴스에 자동 적용
#     기본값도 1로 둔다. 전환 중인 컨테이너 호스트만 인스턴스 단위로 2를 예외 지정한다
aws ec2 modify-instance-metadata-defaults \
  --http-tokens required \
  --http-put-response-hop-limit 1 \
  --http-endpoint enabled \
  --region ap-northeast-2 --profile awssec-lab

aws ec2 get-instance-metadata-defaults \
  --region ap-northeast-2 --profile awssec-lab

# (3) 신규 시작 시 지정 (RunInstances / 시작 템플릿)
aws ec2 run-instances \
  --image-id ami-0123456789abcdef0 \
  --instance-type t3.small \
  --subnet-id subnet-0aaa111 \
  --iam-instance-profile Name=ShopMiniAppRole \
  --metadata-options "HttpEndpoint=enabled,HttpTokens=required,HttpPutResponseHopLimit=1" \
  --region ap-northeast-2 --profile awssec-lab

# (4) IMDSv1 호출이 아직 남아 있는지 확인 — 강제 전에 반드시 본다
#     CloudWatch EC2 지표 MetadataNoToken > 0 이면 v1을 쓰는 코드가 있다
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name MetadataNoToken \
  --dimensions Name=InstanceId,Value=i-0a1b2c3d4e5f6a7b8 \
  --start-time 2026-09-01T00:00:00Z --end-time 2026-09-06T00:00:00Z \
  --period 86400 --statistics Sum \
  --region ap-northeast-2 --profile awssec-lab
```

**순서를 지키십시오.** `MetadataNoToken`이 0이 되는 것을 확인한 뒤 `required`로 바꿉니다. 확인 없이 강제하면 오래된 SDK나 자체 스크립트가 자격 증명을 못 받아 서비스가 멈춥니다.

### 조직 전체에 강제하기

인스턴스를 하나씩 설정하는 방식은 반드시 빠집니다. 두 층으로 못을 박습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRunInstancesWithoutIMDSv2",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotEquals": { "ec2:MetadataHttpTokens": "required" }
      }
    },
    {
      "Sid": "DenyRunInstancesWithLooseHopLimit",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "NumericGreaterThan": { "ec2:MetadataHttpPutResponseHopLimit": "3" }
      }
    }
  ]
}
```

이 정책은 SCP(37.2)로 올립니다. 두 번째 층은 **역할 쪽에서 IMDSv1 유래 자격 증명을 거부**하는 것입니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyIMDSv1DerivedCredentials",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "NumericLessThan": { "ec2:RoleDelivery": "2.0" }
      }
    }
  ]
}
```

`ec2:RoleDelivery`는 자격 증명이 IMDS 어느 버전으로 전달되었는지를 담는 조건 키입니다. 이 Deny를 역할에 붙이면 설정이 어쩌다 v1로 되돌아가도 **그 자격 증명으로는 아무것도 못 합니다.** 심층 방어(1.2)의 전형입니다.

### ⚠️ 컨테이너에서의 홉 제한 주의

원서가 지적한 컨테이너 문제는 AWS에서 두 갈래로 나타납니다.

**첫째, 홉 제한 1은 컨테이너가 IMDS에 도달하지 못하게 만듭니다.** ECS `bridge` 모드나 EKS의 일부 CNI 구성에서는 컨테이너 → 호스트 브리지 → IMDS 경로에 홉이 한 단계 더 들어가, 응답 TTL이 1이면 컨테이너까지 도달하지 못합니다.

**이것은 종료 상태(목표)이지 장애가 아닙니다.** 컨테이너는 호스트 역할이 아니라 **태스크 역할·IRSA·Pod Identity**로 자격 증명을 받아야 하고, 그 전환이 끝나면 파드·태스크가 IMDS에 닿지 못하는 편이 정확히 우리가 원하는 상태입니다(24.4가 EKS 노드에 홉 제한 1을 지시하는 이유입니다). 문제는 **아직 호스트 역할에 의존하는 컨테이너가 남아 있을 때** 홉 제한을 내리면 그 워크로드가 즉시 멈춘다는 점입니다. 그래서 순서가 전부입니다.

① 워크로드를 컨테이너 전용 자격 증명 경로로 옮긴다 → ② 시스템 파드·에이전트가 IMDS에 의존하는지 확인한다 → ③ 홉 제한을 **1**로 내린다.

**전환 기간에만 한시적으로 2를 쓰고, 종료 상태는 1입니다.** 2로 남겨 둘 수밖에 없다면 아래 둘째 항목의 보완 통제가 반드시 함께 있어야 합니다.

**둘째, 홉 제한 2는 곧 "컨테이너가 호스트 역할을 쓸 수 있다"는 뜻입니다.** 전환 기간에는 원서의 경고가 그대로 성립하므로 다음이 함께 필요합니다.

- **컨테이너 전용 자격 증명 경로를 쓴다.** ECS는 태스크 역할, EKS는 Pod Identity 또는 IRSA(24.4).
- **파드·태스크에서 `169.254.169.254`로 나가는 트래픽을 차단한다.** 원서의 **"컨테이너가 메타데이터 서비스에 도달하는 것을 차단해야 한다"** 가 이 조치입니다.
- **노드 인스턴스 역할을 최소로 유지한다.** 차단이 뚫려도 얻을 것이 적어야 합니다.

### 탐지

> 📖 *AWS Security Cookbook* 9장은 GuardDuty의 탐지 범위에 이 항목을 포함합니다. **"GuardDuty는 악성 IP 접근, EC2 외부에서의 EC2 인스턴스 프로파일 사용 등으로 우리 자격 증명이 탈취되었는지 탐지할 수 있다."**

"EC2 외부에서의 인스턴스 프로파일 사용"이 정확히 위 시나리오 4단계이고, GuardDuty의 `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS`(및 `.InsideAWS`)가 이를 보고합니다(31.1). **오탐이 드물고 심각도가 높으므로** 30.3의 필수 알람 목록에 넣습니다.

---

## 8.4 서비스 연결 역할과 서비스 역할

AWS에서 "역할"은 세 가지를 가리킵니다. 이 셋을 구분하지 못하면 감사에서 삭제해도 되는 역할과 절대 건드리면 안 되는 역할을 혼동합니다.

> 📖 *AWS Security Cookbook* 6장은 두 번째 유형을 명확히 정의합니다. **"서비스가 우리를 대신해 작업을 수행하기 위해 맡는 역할을 AWS 서비스 역할이라고 부른다. EC2 인스턴스용 AWS 서비스 역할이 그런 예 중 하나다. EC2 인스턴스용 AWS 서비스 역할을 사용하면, EC2 인스턴스에서 실행되는 애플리케이션이 그 역할에 허용된 작업을 수행하기 위한 임시 자격 증명을 얻을 수 있다."**

| 유형 | 신뢰 정책의 Principal | 누가 만드나 | 신뢰 정책 수정 | 대표 예 |
|---|---|---|---|---|
| **사용자가 맡는 역할** | `"AWS": "arn:aws:iam::123456789012:root"` 등 | 우리 | 가능 | 크로스 계정 관리자 역할, IdP 페더레이션 역할 |
| **서비스 역할** | `"Service": "ec2.amazonaws.com"` 등 | 우리 | 가능 | 인스턴스 프로파일, Lambda 실행 역할, ECS 태스크 역할 |
| **서비스 연결 역할(SLR)** | 해당 서비스 전용 Principal | **AWS가** | **불가** | `AWSServiceRoleForAutoScaling`, `AWSServiceRoleForOrganizations` |

### 서비스 연결 역할(Service-Linked Role)

SLR은 경로가 `/aws-service-role/` 이고 이름이 대개 `AWSServiceRoleFor*` 입니다.

- **신뢰 정책과 권한 정책을 우리가 수정할 수 없습니다.** 서비스가 요구하는 최소 권한을 AWS가 정의합니다.
- **일반 역할 삭제 API로 지울 수 없습니다.** `iam:DeleteServiceLinkedRole`을 쓰고, 삭제는 비동기라 `GetServiceLinkedRoleDeletionStatus`로 상태를 봅니다. 서비스가 아직 리소스를 쓰고 있으면 실패합니다.
- 생성 권한은 `iam:CreateServiceLinkedRole`이며 `iam:AWSServiceName` 조건으로 대상 서비스를 제한할 수 있습니다.

> 📖 *AWS Security Cookbook* 8장의 AWS Config 레시피에도 이 개념이 등장합니다. **"AWS Config 역할 섹션에서 AWS Config 서비스 연결 역할 생성을 선택한다. (…) 이 역할은 우리 계정의 지원되는 리소스에 대한 읽기 전용 권한을 Config에 부여한다."**

**감사 실무의 규칙**: `/aws-service-role/` 경로의 역할은 "미사용 삭제 대상"이 아닙니다. 지우면 GuardDuty·Config·Organizations가 조용히 멈춥니다. 37.2의 "보안 도구 삭제 금지" SCP에 SLR 삭제를 포함시킵니다.

### 서비스 역할에서 자주 틀리는 것

**ECS의 두 역할 혼동.** 태스크 역할(task role)은 **컨테이너 안의 애플리케이션 코드**가, 태스크 실행 역할(task execution role)은 **ECS 에이전트**가 이미지를 당기고 로그를 쓰고 시크릿을 주입할 때 씁니다. 애플리케이션 권한을 실행 역할에 넣으면 **같은 클러스터의 모든 태스크가 그 권한을 갖습니다**(24.3). Lambda도 마찬가지로 **함수당 실행 역할 1개**가 원칙입니다(24.6).

**`iam:PassRole` 누락과 과잉.** 서비스에 역할을 "넘기는" 행위 자체가 별도 권한입니다. 누락되면 리소스 생성이 실패하고, `Resource: "*"`로 열면 권한 상승 경로가 됩니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PassOnlyAppRoleToEC2",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::111122223333:role/ShopMiniAppRole",
      "Condition": {
        "StringEquals": { "iam:PassedToService": "ec2.amazonaws.com" }
      }
    }
  ]
}
```

---

## 8.5 🧪 크로스 계정 역할 전환

*AWS Security Cookbook* 1장의 레시피를 CANON의 계정 배정에 맞춰 재구성합니다. 관리 계정 `123456789012`의 사용자가 운영 계정 `111122223333`으로 전환하는 시나리오입니다.

> 📖 *AWS Security Cookbook* 1장 「Switching roles with AWS Organizations」: **"AWS에서 로그아웃하지 않고 콘솔에서 계정 간을 전환하는 것은 많은 조직에서 널리 사용되는 훌륭한 기능이다. 예를 들어 어떤 사용자에게 한 계정의 기본 사용자를 주고, 그 사용자가 적절한 역할로 다른 계정들로 전환하게 할 수 있다(예: Dev에는 Admin, Prod에는 ReadOnly)."**
>
> Organizations로 계정을 만들면 역할이 자동으로 생깁니다. **"`role-name` 파라미터는 새 멤버 계정에 자동으로 사전 구성될 IAM 역할의 이름을 지정한다. 이 역할은 멤버 계정에 대한 관리자 권한을 제공하고 관리 계정을 신뢰한다. 즉, 관리 계정의 사용자가 이 역할을 맡을 수 있다 — 관리 계정 관리자가 이를 허용하는 한. 기본값은 `OrganizationAccountAccessRole`이다."**

**"관리 계정 관리자가 이를 허용하는 한"** 이 문장이 시나리오를 둘로 가릅니다.

### 시나리오 A — 관리자 사용자

관리 계정의 `AdministratorAccess` 사용자는 이미 `sts:AssumeRole`을 포함하므로 **추가 설정 없이** 전환됩니다. 콘솔 우측 상단 드롭다운 → **역할 전환(Switch Role)** 에서 계정 ID `111122223333`, 역할 `OrganizationAccountAccessRole`, 표시 이름 `Prod-Admin`을 입력하면 배지가 `Prod-Admin @ 111122223333`으로 바뀌고, 같은 드롭다운의 **"Back to \<사용자명\>"** 으로 복귀합니다. 자주 쓰는 조합은 콘솔 URL로 북마크해 둡니다.

```
https://signin.aws.amazon.com/switchrole?account=111122223333&roleName=OrganizationAccountAccessRole&displayName=Prod-Admin
```

⚠️ 원서도 지적하듯 **권한이 없는 사용자가 같은 절차를 밟으면 오류로 실패합니다.** 이것이 시나리오 B입니다.

### 시나리오 B — 비관리자 사용자

원서의 방식은 관리 계정 쪽 그룹에 `sts:AssumeRole` 정책을 붙이는 것입니다. 원서 예제는 자식 계정의 `OrganizationAccountAccessRole`(= 관리자 권한)을 대상으로 삼았고, 원서 자신이 한계를 명시합니다.

> 📖 같은 레시피의 마무리: **"이 레시피에서는 관리 계정에 아무 권한도 없던 사용자가 자식 계정에서 완전한 관리자 접근 권한을 받았다. 실제 현장에서는 관리자들이 서로 다른 자식 계정에 서로 다른 역할(Dev, Testing, Prod 등)을 만들고, 관리 계정의 사용자 그룹에 그 계정들의 해당 역할에 대한 접근 권한을 부여할 것이다."**

원서의 권고대로 관리자 역할을 재사용하지 않고 **읽기 전용 역할**을 새로 만듭니다.

**1단계 — 운영 계정에 역할 생성**

```bash
cat > trust-from-mgmt.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowMgmtAccountWithMfa",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
      "Action": ["sts:AssumeRole", "sts:TagSession"],
      "Condition": {
        "Bool": { "aws:MultiFactorAuthPresent": "true" },
        "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
      }
    }
  ]
}
JSON

aws iam create-role \
  --role-name ShopMiniProdReadOnly \
  --assume-role-policy-document file://trust-from-mgmt.json \
  --max-session-duration 3600 \
  --tags Key=Project,Value=awssec-lab Key=Chapter,Value=ch08 \
  --profile prod-admin

aws iam attach-role-policy \
  --role-name ShopMiniProdReadOnly \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess \
  --profile prod-admin
```

`Principal`의 `:root`는 "이 계정 전체"를 뜻하며 루트 사용자만을 가리키지 않습니다. **계정을 신뢰하고 실제 허용은 상대 계정 IAM 정책에 위임하는 형태**입니다. 특정 역할만 신뢰하려면 `arn:aws:iam::123456789012:role/PlatformEngineer`처럼 직접 씁니다.

⚠️ **MFA 조건에서 `Bool`과 `BoolIfExists`를 구분하십시오.** 여기는 `Effect: Allow` 이므로 `Bool`이 맞습니다 — 키가 없는 요청은 조건 불일치로 Allow되지 않고 암묵적 Deny가 됩니다. 반대로 **Deny 문에서 MFA를 요구할 때는 `BoolIfExists`** 입니다. `Bool`을 쓰면 키가 없는 요청에서 조건이 매칭되지 않아 Deny가 발동하지 않습니다(7.4).

**2단계 — 관리 계정에 AssumeRole 권한 부여**

```bash
cat > assume-prod-readonly.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeProdReadOnly",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::111122223333:role/ShopMiniProdReadOnly"
    }
  ]
}
JSON

aws iam create-policy \
  --policy-name AssumeProdReadOnlyPolicy \
  --policy-document file://assume-prod-readonly.json \
  --profile awssec-lab

aws iam attach-group-policy \
  --group-name platform-engineers \
  --policy-arn arn:aws:iam::123456789012:policy/AssumeProdReadOnlyPolicy \
  --profile awssec-lab
```

**3단계 — CLI로 전환**

```bash
# 방법 1: 직접 호출 — 무엇이 발급되는지 눈으로 본다
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ShopMiniProdReadOnly \
  --role-session-name alice-ch08 \
  --duration-seconds 3600 \
  --serial-number arn:aws:iam::123456789012:mfa/alice \
  --token-code 123456 \
  --profile awssec-lab
```

이 명령은 `Credentials`(3종 + `Expiration`)와 `AssumedRoleUser.Arn`을 반환합니다. 실무에서는 **프로파일에 선언**해 두고 씁니다.

```ini
# ~/.aws/config
[profile awssec-lab]
region = ap-northeast-2

[profile prod-readonly]
role_arn       = arn:aws:iam::111122223333:role/ShopMiniProdReadOnly
source_profile = awssec-lab
mfa_serial     = arn:aws:iam::123456789012:mfa/alice
role_session_name = alice-ch08
duration_seconds  = 3600
region         = ap-northeast-2
```

```bash
# 이제 --profile 만 바꾸면 된다. MFA 코드는 필요할 때만 물어보고, 만료 시 자동 갱신된다.
aws sts get-caller-identity --profile prod-readonly
# → Arn: arn:aws:sts::111122223333:assumed-role/ShopMiniProdReadOnly/alice-ch08

aws s3 ls s3://shopmini-uploads --profile prod-readonly            # 성공
aws s3 rm s3://shopmini-uploads/test.txt --profile prod-readonly   # AccessDenied (읽기 전용)
```

### Organizations 없이도 된다

> 📖 *AWS Security Cookbook* 1장 「Switching roles between any two accounts」: **"역할 전환을 수행하기 위해 계정들이 AWS Organization의 일부일 필요는 없다는 점에 유의하라. 이는 임의의 두 계정 사이에 구성할 수 있다."**

원서가 이어서 제시한 4단계 — 계정 B에 정책 생성 → 계정 A를 신뢰하는 역할 생성 후 정책 부착 → 계정 A 관리자가 그 역할 ARN에 대한 `sts:AssumeRole` 부여 → 전환 검증 — 는 위 실습과 대응합니다. 다만 조직 밖 계정과는 `aws:PrincipalOrgID`를 쓸 수 없습니다. 그 자리를 메우는 것이 다음 절의 External ID입니다.

---

## 8.6 🔴 ⚠️ External ID와 Confused Deputy 문제

### 사고 시나리오

ShopMini가 비용 최적화 SaaS "CloudSaver"를 도입합니다. 벤더는 "우리 계정 `999988887777`(CANON 밖의 외부 벤더 더미값)을 신뢰하는 읽기 전용 역할을 만들어 ARN을 알려달라"고 안내하고, 우리는 그대로 만듭니다.

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::999988887777:root" },
  "Action": "sts:AssumeRole"
}
```

같은 벤더의 다른 고객 중 하나가 악의적인 사용자입니다. 그는 우리 역할 ARN을 알아냅니다 — 지원 티켓, 공개된 IaC 저장소, 추측(계정 ID + 벤더 권장 표준 역할 이름) 어느 쪽으로든 가능합니다. 그리고 CloudSaver 콘솔의 자기 계정 설정에 **우리 역할 ARN**을 입력합니다.

```
악의적 고객 ─── "이 역할을 스캔해 주세요" ──▶  CloudSaver
                                                   │
                                    벤더 계정 999988887777 이
                                    sts:AssumeRole 호출
                                                   │
                                                   ▼
                                        우리 역할 ShopMiniCloudSaverRole
                                        신뢰 정책: "999988887777 이면 OK"
                                                   │
                                                   ▼
                                        우리 계정 111122223333 데이터가
                                        악의적 고객의 대시보드에 표시된다
```

CloudSaver는 자기 고객의 요청을 성실히 수행했을 뿐 잘못한 것이 없습니다. **신뢰받은 중개자가 속아서 자기 권한을 남용하게 되는 것** — 이것이 **Confused Deputy(혼동된 대리자)** 문제입니다.

> 💡 **원서 이후 보충** — 원서 3권 모두 Confused Deputy와 `sts:ExternalId`를 다루지 않습니다. 이 절은 AWS 공식 권고와 실무 사고 유형을 정리한 것입니다.

### 원인

신뢰 정책이 답한 질문이 틀렸습니다. 확인한 것은 **"호출자가 CloudSaver인가"** 였고, 확인했어야 하는 것은 **"CloudSaver가 우리를 대신해 호출하는 것인가"** 였습니다. 벤더 계정 ID는 **모든 고객이 공유하는 값**이라 테넌트를 구분하지 못합니다.

### 🔴 올바른 구성 ① — 서드파티에는 `sts:ExternalId`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustCloudSaverForThisTenantOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::999988887777:root" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "shopmini-prod-7f3a1c9e-4b02-4d51-9a6e-2c8d5b71ef40"
        }
      }
    }
  ]
}
```

벤더는 `AssumeRole` 호출 시 `--external-id`로 이 값을 함께 보냅니다. 악의적 고객이 우리 역할 ARN을 넣어도 **자기 테넌트에 배정된 External ID가 전송되므로 조건이 불일치**하여 실패합니다.

**External ID의 규칙 (🔴)**

- [ ] **벤더가 발급한 값을 쓴다.** 테넌트를 구분하는 주체가 벤더이기 때문입니다.
- [ ] **추측 불가능하고 테넌트마다 다르다.** 고객사 이름·계정 ID·순번은 금물이며, 벤더 전체가 공유하는 고정 문자열이면 아무것도 막지 못합니다.
- [ ] **비밀이 아니다.** External ID는 인증 수단이 아니라 **테넌트 구분자**입니다. 이것만 믿지 않습니다.
- [ ] **`Principal`을 벤더 계정으로 좁힌다.** `"AWS": "*"` + External ID 조건은 값이 유출되면 무너집니다.
- [ ] **역할 권한을 벤더가 문서로 요구한 범위로 잘라낸다.**

**벤더 쪽에서 본 호출:**

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ShopMiniCloudSaverRole \
  --role-session-name cloudsaver-scan-20260906 \
  --external-id shopmini-prod-7f3a1c9e-4b02-4d51-9a6e-2c8d5b71ef40
```

### 🔴 올바른 구성 ② — AWS 서비스에는 `aws:SourceAccount` / `aws:SourceArn`

같은 문제가 **AWS 서비스가 우리를 대신해 호출할 때** 도 발생합니다. `Principal`이 `"Service": "cloudtrail.amazonaws.com"` 이면 그 서비스 주체는 **전 세계 모든 AWS 고객이 공유**하므로, 다른 고객이 자기 트레일에서 우리 역할을 지정할 수 있습니다. 여기서는 **`sts:ExternalId`를 쓰지 않습니다** — AWS 서비스는 그 값을 전송하지 않습니다. 대신 요청을 유발한 리소스를 확인합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudTrailFromOurTrailOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudtrail.amazonaws.com" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "111122223333" },
        "ArnLike": {
          "aws:SourceArn": "arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/shopmini-prod-trail"
        }
      }
    }
  ]
}
```

**구분 기준 표**

| 신뢰 대상 | 사용할 조건 키 | 연산자 | 이유 |
|---|---|---|---|
| 서드파티 SaaS 계정 | `sts:ExternalId` | `StringEquals` | 벤더가 테넌트별로 발급·전송 |
| AWS 서비스 주체 | `aws:SourceAccount` | `StringEquals` | 요청을 유발한 리소스의 소유 계정 |
| AWS 서비스 주체 (더 좁게) | `aws:SourceArn` | `ArnLike` / `ArnEquals` | 리소스 ARN까지 특정 |
| 우리 조직 내 계정 | `aws:PrincipalOrgID` | `StringEquals` | 조직 밖 계정 전체를 배제 |
| 우리 조직의 특정 OU | `aws:PrincipalOrgPaths` | `ForAnyValue:StringLike` | OU 경로 단위 제한 |

⚠️ **두 키를 섞어 쓰지 마십시오.** 서비스 주체 신뢰 정책에 `sts:ExternalId`를 걸면 서비스가 값을 보내지 않아 **모든 호출이 실패**하고, 서드파티 계정 신뢰 정책에 `aws:SourceArn`을 걸어도 마찬가지입니다. "왜 항상 AccessDenied인가"의 흔한 원인입니다.

⚠️ **`aws:SourceArn`만 쓰고 `aws:SourceAccount`를 빼지 마십시오.** 일부 서비스는 특정 상황에서 `SourceArn`을 전달하지 않습니다. 그리고 `ArnLike`의 와일드카드 위치를 조심하십시오 — `arn:aws:cloudtrail:*:*:trail/*` 는 계정 제한이 사라져 원래 문제로 되돌아갑니다.

### 📋 서드파티에 역할을 줄 때 점검 목록

- [ ] 벤더가 **External ID를 발급하는가?** (안 하면 그 자체가 벤더 보안 성숙도의 신호)
- [ ] External ID가 **우리 계정마다 다르고**, `Principal`이 **벤더 계정 하나**로 특정되어 있는가?
- [ ] 역할 권한이 **벤더가 문서로 밝힌 API 목록**으로 잘려 있고, `iam:*`·`kms:Decrypt`·`secretsmanager:GetSecretValue` 포함 여부가 의도적인가?
- [ ] IAM Access Analyzer 외부 접근 결과에 이 역할이 **알려진 예외로 등록**되어 있는가?
- [ ] 계약 종료 시 **역할 삭제가 오프보딩 절차에 있는가?** (9.6)
- [ ] 이 역할의 `AssumeRole` 이벤트에 **알람이 걸려 있는가?**

---

## 8.7 세션 태그와 ABAC(속성 기반 접근 제어)

### RBAC의 확장 한계

7장까지의 방식은 RBAC(역할 기반)입니다. 팀·환경·프로젝트 조합마다 역할과 정책을 하나씩 만듭니다.

```
[RBAC] 팀 5 × 환경 3 × 프로젝트 8 = 정책 120개
        프로젝트 하나 추가 → 정책 15개 추가 → 리뷰 대상 15개 증가

[ABAC] 정책 1개 : "자기 Project 태그와 같은 태그가 붙은 리소스만 다룰 수 있다"
        프로젝트 하나 추가 → 정책 변경 0건. 태그만 붙인다.
```

정책 개수가 조합 폭발을 따라가고, 이 지점에서 정책 리뷰는 실질적으로 포기됩니다. **ABAC(속성 기반)** 는 축을 바꿉니다 — "누구인가"가 아니라 **"주체의 속성과 리소스의 속성이 일치하는가"** 를 봅니다.

### 세션 태그

ABAC의 재료는 태그입니다. 리소스 쪽은 `aws:ResourceTag/<키>`, 주체 쪽은 `aws:PrincipalTag/<키>`로 읽습니다. 주체 태그는 세 경로로 들어옵니다.

| 경로 | 방법 |
|---|---|
| IAM 사용자·역할에 부착된 태그 | `aws iam tag-role` / `tag-user` |
| **세션 태그** | `sts:AssumeRole --tags` |
| IdP 페더레이션 속성 | SAML 어트리뷰트 / OIDC 클레임 → 세션 태그로 매핑 (9장) |

**세션 태그**는 역할을 맡는 순간에 붙이는 태그로, 역할 하나를 여러 팀이 공유하면서 **맡는 순간의 속성으로 권한이 갈라지게** 만듭니다. 신뢰 정책에 **`sts:TagSession`이 허용되어야 합니다**(8.5 실습에 미리 넣어두었습니다).

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ShopMiniEngineerRole \
  --role-session-name alice-ch08 \
  --tags Key=Project,Value=awssec-lab Key=Team,Value=payments \
  --transitive-tag-keys Project Team \
  --profile awssec-lab
```

`--transitive-tag-keys`는 **역할 체이닝을 넘어서도 유지될 태그**를 지정합니다. 지정하지 않으면 다음 역할로 갈아탈 때 태그가 사라져 통제가 체이닝 한 번에 무력화됩니다. 🔴 **ABAC을 통제로 쓰려면 전이 태그 지정이 필수입니다.**

### ABAC 정책 예제

**① 같은 프로젝트의 EC2만 조작**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OperateSameProjectInstances",
      "Effect": "Allow",
      "Action": ["ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances"],
      "Resource": "arn:aws:ec2:ap-northeast-2:111122223333:instance/*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
        }
      }
    },
    {
      "Sid": "DescribeIsGlobal",
      "Effect": "Allow",
      "Action": ["ec2:DescribeInstances", "ec2:DescribeTags"],
      "Resource": "*"
    }
  ]
}
```

`"${aws:PrincipalTag/Project}"` 가 정책 변수입니다. 평가 시점에 세션의 `Project` 태그 값으로 치환되어 리소스 태그와 비교됩니다. **프로젝트가 100개로 늘어도 정책 문서는 그대로입니다.**

⚠️ `ec2:DescribeInstances`는 리소스 수준 권한과 태그 조건을 지원하지 않아 두 번째 문장으로 뺐습니다. **ABAC 설계 전에 대상 API가 태그 기반 인가를 지원하는지 반드시 확인하십시오.** 지원하지 않는 API에 태그 조건을 걸면 정책이 아무 요청도 허용하지 않습니다.

**② 리소스를 만들 때 태그를 강제**

ABAC이 성립하려면 "태그 없는 리소스"가 생기지 않아야 합니다. 태그가 없으면 조건 불일치로 아무도 접근할 수 없고, 결국 예외 정책이 늘어나 ABAC이 붕괴합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CreateOnlyWithMatchingProjectTag",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Project": "${aws:PrincipalTag/Project}"
        },
        "Null": { "aws:RequestTag/Project": "false" }
      }
    },
    {
      "Sid": "TagOnCreateOnly",
      "Effect": "Allow",
      "Action": "ec2:CreateTags",
      "Resource": "arn:aws:ec2:ap-northeast-2:111122223333:*/*",
      "Condition": {
        "StringEquals": { "ec2:CreateAction": "RunInstances" },
        "ForAllValues:StringEquals": {
          "aws:TagKeys": ["Project", "Chapter", "AutoDelete"]
        }
      }
    }
  ]
}
```

`ec2:CreateAction` 조건이 중요합니다. 이것이 없으면 **생성 이후에 태그를 바꿔 다른 프로젝트 리소스로 옮길 수 있습니다.** 태그 변경 권한은 곧 접근 권한 변경 권한입니다(12.3).

**③ 프로젝트별 S3 프리픽스 격리** — 정책 변수는 `Resource` 요소에서도 씁니다. 아래처럼 `${aws:PrincipalTag/Team}`이나 `${aws:userid}`를 프리픽스로 써서 한 버킷 안에 격리를 만듭니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProjectScopedPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::shopmini-uploads/${aws:PrincipalTag/Project}/*"
    }
  ]
}
```

### RBAC vs ABAC 비교

| 항목 | RBAC | ABAC |
|---|---|---|
| 권한의 근거 | 어떤 역할을 맡았나 | 주체 속성 = 리소스 속성 |
| 신규 프로젝트 추가 | 역할·정책 신규 작성 | **태그만 부여** |
| 정책 개수 | 조합 수에 비례 | 상수에 가깝게 유지 |
| 감사 난이도 | 정책 읽기는 쉬움, 개수가 많음 | 정책은 적음, **태그 정합성 검증이 새 과제** |
| 실패 모드 | 정책 누락·중복·드리프트 | **태그 오기·누락·무단 변경** |
| 태그 없는 리소스 | 영향 없음 | **접근 불가 → 예외 요청 폭증** |
| 전제 조건 | 없음 | 태그 표준 + 생성 시 태그 강제 + 태그 변경 통제 |

**결론: 둘을 섞습니다.** 조직 경계·환경 분리 같은 굵은 축은 RBAC(계정 분리 + 역할)로, 같은 환경 안의 프로젝트·팀 세분화는 ABAC으로. ABAC은 **태그 거버넌스(12.3)가 먼저 서 있을 때만** 통제가 됩니다.

---

## 8.8 워크로드 아이덴티티 검증

> 📖 *Practical Cloud Security* 1판·2판 4장 「Life Cycle for Identity and Access」의 노트: **"시스템 안의 사람이 아닌 것들 — 애플리케이션 같은 것들 — 을 위한 아이덴티티를 잊지 말라. 이들도 사람의 아이덴티티와 마찬가지로 관리되어야 한다. 많은 팀이 사람에 대한 접근 통제는 훌륭하게 해내면서도, 자동화가 무엇을 할 권한이 있는지에 대해서는 매우 느슨한 통제를 둔다."**

8.1~8.7을 모두 적용한 조직에서도 CI 파이프라인 역할 하나가 `AdministratorAccess`를 들고 있는 경우가 흔합니다.

### 2판이 추가한 문제 제기

> 📖 *Practical Cloud Security* **2판** 4장은 1판에 없던 단락을 추가합니다. **"이런 문서와 서명에 표준 형식이 있어서, 클라우드 서비스가 특정 클러스터에서 생성된 컨테이너나 특정 클라우드 계정에서 생성된 가상 머신을 신뢰할 수 있도록 선택할 수만 있다면 좋겠다! SPIFFE가 등장한다. 이는 워크로드(컨테이너, 가상 머신, 다중 노드 애플리케이션 등)가 다른 것과 인증할 수 있게 하는 표준 방법이다. (…) 결국 이것이나 유사한 명세가 인증을 위한 정적 API 키의 광범위한 사용을 없애게 될 가능성이 높다. API 키를 얻은 누구든 신뢰하도록 시스템을 구성하는 대신, 유효한 ID를 제시할 수 있고 신뢰 목록에 있는 워크로드만 신뢰하도록 구성하게 될 것이다."**

**"유효한 ID를 제시할 수 있고 신뢰 목록에 있는 워크로드만 신뢰한다"** — 이것이 AWS에서 어떻게 구현되어 있는지 정리하면 이 장의 모든 절이 한 그림으로 모입니다.

### AWS의 워크로드 아이덴티티 4가지 경로

| 워크로드의 위치 | 증명 수단 | AWS 메커니즘 | 본서 절 |
|---|---|---|---|
| AWS 안 (EC2) | IMDS 아이덴티티 문서 + AWS 서명 | 인스턴스 프로파일 | 8.2 |
| AWS 안 (컨테이너·Lambda) | 태스크·함수 아이덴티티 | ECS 태스크 역할, Lambda 실행 역할, EKS Pod Identity·IRSA | 8.4 / 24.4 |
| **AWS 밖 (온프레미스·타 클라우드)** | **X.509 클라이언트 인증서** | **IAM Roles Anywhere** | 이 절 |
| **AWS 밖 (CI/CD·Kubernetes)** | **OIDC ID 토큰(JWT)** | **`sts:AssumeRoleWithWebIdentity`** | 이 절 |

세 번째·네 번째 줄이 원서가 말한 "정적 API 키를 대체하는 것"에 대한 AWS의 답입니다.

> 💡 **원서 이후 변경** — IAM Roles Anywhere는 2022년, GitHub Actions의 OIDC 제공자 지원은 2021년에 등장했습니다. 원서 2판은 SPIFFE를 "널리 쓰이지 않는다"고 평가했지만, AWS 문맥에서는 **X.509와 OIDC 기반 워크로드 아이덴티티가 이미 실무 표준**입니다.

### 인스턴스 아이덴티티 문서

원서가 말한 "암호학적으로 서명된 신원 증명"의 AWS판입니다.

```bash
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# 아이덴티티 문서 — 무엇에 대한 주장인가
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/dynamic/instance-identity/document
# → { "accountId":"111122223333", "instanceId":"i-0a1b2c3d4e5f6a7b8",
#      "region":"ap-northeast-2", "imageId":"ami-...", "pendingTime":"...", ... }

# 서명 — 그 주장이 AWS가 발급한 것임을 증명
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/dynamic/instance-identity/rsa2048
```

AWS의 리전별 공개 인증서로 서명을 검증하면 자체 구축 시스템도 **"이 요청은 우리 계정 `111122223333`의, 승인된 AMI로 뜬, 특정 인스턴스에서 왔다"** 를 확인할 수 있습니다. ⚠️ 이 문서 역시 IMDS로 노출되므로 **8.3의 경고가 그대로 적용됩니다.** 문서만으로 고권한을 주지 않습니다.

### IAM Roles Anywhere — 온프레미스 워크로드

온프레미스 배치 서버가 `shopmini-uploads`에 야간 백업을 올려야 합니다. 전통적 방식은 IAM 사용자를 만들고 액세스 키를 서버에 넣는 것 — 6.4가 금지한 그것입니다. 구성 요소는 셋입니다.

```
[신뢰 앵커(Trust Anchor)]  우리 사설 CA 인증서 (또는 AWS Private CA)
        │  이 CA가 발급한 클라이언트 인증서를 신뢰한다
        ▼
[프로파일(Profile)]        맡을 수 있는 역할 목록 + (선택) 세션 정책
        │
        ▼
[IAM 역할]                 신뢰 정책 Principal = rolesanywhere.amazonaws.com
                           권한 정책 = S3 백업 프리픽스 쓰기만
```

온프레미스 서버는 `aws_signing_helper`로 인증서와 개인 키로 서명한 요청을 보내 임시 자격 증명을 받습니다. **서버에 남는 것은 만료·폐기·갱신이 가능한 인증서**입니다. 만료도 폐기도 없는 액세스 키와의 차이가 여기 있습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustRolesAnywhereForBatchHost",
      "Effect": "Allow",
      "Principal": { "Service": "rolesanywhere.amazonaws.com" },
      "Action": ["sts:AssumeRole", "sts:TagSession", "sts:SetSourceIdentity"],
      "Condition": {
        "StringEquals": {
          "aws:PrincipalTag/x509Subject/CN": "shopmini-onprem-batch"
        },
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:rolesanywhere:ap-northeast-2:111122223333:trust-anchor/12345678-1234-1234-1234-123456789012"
        }
      }
    }
  ]
}
```

이 신뢰 정책 하나에 이 장의 개념이 모두 들어 있습니다. `sts:TagSession`(8.7)으로 인증서 속성이 세션 태그가 되고, `aws:PrincipalTag/x509Subject/CN`이 **어떤 인증서인지까지** 검증하며, `aws:SourceArn`(8.6)이 신뢰 앵커를 고정하고, `sts:SetSourceIdentity`가 감사 추적을 유지합니다(8.1).

🔴 **`aws:PrincipalTag/x509Subject/CN` 조건을 생략하지 마십시오.** 신뢰 앵커 CA가 발급한 **모든** 인증서가 이 역할을 맡게 됩니다. 사내 범용 CA라면 사내 아무 서버나 쓸 수 있다는 뜻입니다.

### OIDC 페더레이션 — GitHub Actions

액세스 키를 GitHub Secrets에 넣는 방식은 **가장 흔한 장기 키 잔존 지점**입니다 — 순환되지 않고, 오프보딩 대상에서 빠집니다. OIDC 방식은 GitHub이 발급한 짧은 수명의 JWT를 STS에 제시합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GitHubActionsMainBranchOnly",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:shopmini/deploy:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

⚠️ **`sub` 조건을 반드시 넣고 와일드카드를 조심하십시오.** 흔한 사고 패턴 셋입니다.

| 잘못된 조건 | 결과 |
|---|---|
| `sub` 조건 없음 | **GitHub의 모든 리포지토리**가 이 역할을 맡을 수 있다. 사실상 공개된 역할 |
| `StringLike`: `repo:shopmini/*` | 조직 내 어떤 리포지토리든 — 새로 만든 실험용 리포지토리 포함 — 운영 배포 가능 |
| `StringLike`: `repo:shopmini/deploy:*` | 어떤 브랜치·태그·**풀 리퀘스트**에서든 배포 가능. 외부 기여자의 PR이 운영에 배포될 수 있다 |

정답은 `repo:<조직>/<리포지토리>:ref:refs/heads/main` 처럼 **브랜치까지 고정**하거나, 환경 승인이 필요하면 `...:environment:production` 형태를 쓰는 것입니다. `aud`(`sts.amazonaws.com`) 조건도 함께 확인합니다(27.6).

### 📋 워크로드 아이덴티티 점검 목록

- [ ] 계정 안에 **액세스 키를 가진 IAM 사용자가 0개**인가? (있다면 존재 이유가 문서화되었는가)
- [ ] 모든 CI/CD 파이프라인이 **OIDC 또는 Roles Anywhere**를 쓰는가?
- [ ] OIDC 신뢰 정책에 **`sub`와 `aud` 조건이 모두** 있고 `sub`가 브랜치·환경까지 좁혀졌는가?
- [ ] Roles Anywhere 신뢰 정책에 **인증서 속성 조건**이 있는가?
- [ ] 모든 EC2가 인스턴스 프로파일을 쓰고 **IMDSv2가 강제**되어 있는가?
- [ ] 컨테이너가 **호스트 역할 대신 태스크·파드 역할**을 쓰는가?
- [ ] 워크로드 역할도 **9.6의 재검증 주기**에 포함되어 있는가?
- [ ] 워크로드 역할의 권한이 **CloudTrail 기반으로 축소**된 이력이 있는가? (7.6)

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| 역할의 본질 | 완전한 아이덴티티가 아니라, 다른 아이덴티티가 잠시 취하는 상태 + 임시 자격 증명 |
| 2중 구조 | 신뢰 정책(누가) + 권한 정책(무엇을). **AND 조건**, 크로스 계정은 양쪽 계정 모두 필요 |
| 자격 증명 식별 | `ASIA...` = 임시, `AKIA...` = 장기 키(설정 파일에 있으면 결함) |
| 세션 시간 | 역할 `MaxSessionDuration` 1~12시간. **역할 체이닝 시 최대 1시간** |
| 감사 추적 | `RoleSessionName`은 변경 가능, `sts:SourceIdentity`는 체이닝 후에도 고정 |
| 인스턴스 프로파일 | 역할을 담는 컨테이너(역할 1개). CLI에서는 명시적으로 생성·연결해야 함 |
| SDK 체인 함정 | 환경 변수·자격 증명 파일이 **IMDS보다 우선** — 낡은 키가 역할을 이긴다 |
| IMDS 🔴 | `HttpTokens=required` + **홉 제한 1**(컨테이너 호스트는 전환 기간에만 한시적 2) + 계정 기본값 + SCP + `ec2:RoleDelivery` Deny |
| 강제 전 확인 | CloudWatch `MetadataNoToken` 지표가 0이 된 뒤에 `required`로 전환 |
| 서비스 연결 역할 | AWS가 만들고 우리가 수정 불가. `DeleteServiceLinkedRole`로만 삭제. **감사 시 삭제 대상 아님** |
| 크로스 계정 | 신뢰 정책 `Principal`을 계정(`:root`)으로 + 상대 계정 IAM에 `sts:AssumeRole` |
| MFA 조건 | Allow 문에서는 `Bool`, Deny 문에서는 `BoolIfExists` |
| Confused Deputy | 서드파티 → `sts:ExternalId` / AWS 서비스 → `aws:SourceAccount` + `aws:SourceArn`. **섞으면 전부 실패** |
| ABAC | `aws:PrincipalTag` = `aws:ResourceTag` 비교. 정책 개수를 상수로 유지 |
| ABAC 전제 | 태그 표준 + 생성 시 태그 강제(`ec2:CreateAction`) + 전이 태그(`--transitive-tag-keys`) |
| 워크로드 아이덴티티 | AWS 안=인스턴스 프로파일/태스크 역할, AWS 밖=Roles Anywhere(X.509) / OIDC(JWT) |

## 🔴 필수 구성 체크리스트

- [ ] 모든 EC2에 **인스턴스 프로파일이 부착**되어 있다
- [ ] 인스턴스 안에 `~/.aws/credentials`·`AWS_ACCESS_KEY_ID`·User Data 하드코딩 키가 **없다**
- [ ] 역할이 **워크로드 단위로 분리**되어 있고, `AmazonS3FullAccess` 같은 **광범위 관리형 정책이 없다**
- [ ] `iam:PassRole`이 **역할 ARN 열거 + `iam:PassedToService` 조건**으로 제한되어 있다
- [ ] 전 인스턴스에 **`HttpTokens=required`** 가 적용되어 있다
- [ ] **홉 제한이 1**로 지정되어 있다 (컨테이너 호스트는 태스크 역할·IRSA/Pod Identity 전환이 끝날 때까지만 한시적으로 2)
- [ ] `modify-instance-metadata-defaults`로 **계정·리전 기본값**이 설정되어 있다
- [ ] `ec2:MetadataHttpTokens` **SCP**가 조직에 적용되어 있다
- [ ] 강제 전 **`MetadataNoToken` 지표를 확인**했고 0이었다
- [ ] 민감 역할에 **`ec2:RoleDelivery` Deny**가 걸려 있다
- [ ] 컨테이너가 **태스크·파드 역할**을 쓰고, 파드에서 `169.254.169.254` 접근이 차단되어 있다
- [ ] GuardDuty **인스턴스 자격 증명 탈취 탐지 알람**이 설정되어 있다
- [ ] 크로스 계정 신뢰 정책에 **MFA 또는 `aws:PrincipalOrgID` 조건**이 있다
- [ ] `RoleSessionName` 규칙이 있고, 특권 역할에 **`sts:SourceIdentity`** 를 요구한다
- [ ] 신뢰 정책의 `Principal`에 **`"AWS": "*"`가 없다**
- [ ] 모든 서드파티 역할에 **`sts:ExternalId`** 조건이 있고 값이 계정별로 다르다
- [ ] 모든 AWS 서비스 신뢰 정책에 **`aws:SourceAccount`(+ `aws:SourceArn`)** 가 있고, 와일드카드가 계정 부분을 지우지 않는다
- [ ] ABAC을 쓴다면 **태그 표준·생성 시 강제·변경 통제·`--transitive-tag-keys`** 가 모두 있다
- [ ] CI/CD가 **OIDC 단기 자격 증명**을 쓰고 `sub` 조건이 브랜치·환경까지 좁혀져 있다
- [ ] IAM Access Analyzer의 **외부 접근 결과가 검토·승인**되어 있고, **워크로드 역할도 재검증 주기**에 있다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| 신뢰 정책과 권한 정책을 혼동해 `Principal`을 권한 정책에 넣는다 | 정책 생성 오류 또는 의도와 다른 동작 | 신뢰 정책만 `Principal`을 갖는다 (8.1) |
| 크로스 계정에서 신뢰 정책만 설정한다 | 상대 계정 사용자가 `AccessDenied` | 양쪽 모두 필요 — 상대 계정 IAM에 `sts:AssumeRole` (8.1, 8.5) |
| `MaxSessionDuration`을 12시간으로 올려 장시간 작업을 해결한다 | 역할 체이닝 중이면 **1시간에 만료** | SDK 자동 갱신 사용, 체이닝 여부 확인 (8.1) |
| `RoleSessionName`을 `session1`로 채운다 | 공유 역할에서 행위자 특정 불가 | 사번/커밋SHA 규칙 + `sts:SourceIdentity` (8.1) |
| CLI로 역할만 만들고 인스턴스 프로파일을 안 만든다 | 인스턴스에 붙지 않음 | `create-instance-profile` + `add-role-to-instance-profile` (8.2) |
| 인스턴스에 낡은 `~/.aws/credentials`를 남긴다 | 역할을 붙여도 낡은 키가 우선 사용됨 | 자격 증명 파일·환경 변수 제거 (8.2) |
| IMDSv1을 그대로 둔다 | **SSRF 한 번으로 역할 자격 증명 유출** | `HttpTokens=required` + 홉 제한 (8.3) |
| 확인 없이 `required`로 전환한다 | 구버전 SDK·자체 스크립트가 즉시 실패 | `MetadataNoToken` 지표 0 확인 후 전환 (8.3) |
| 호스트 역할에 의존하는 컨테이너를 그대로 둔 채 홉 제한을 1로 내린다 | 컨테이너가 자격 증명을 못 받아 서비스 장애 | 태스크 역할·IRSA/Pod Identity로 먼저 옮긴 뒤 1로 내린다 (8.3, 24.4) |
| 홉 제한 2로 두고 파드 차단을 안 한다 | 파드가 **노드 역할을 도용** | Pod Identity/IRSA + IMDS 차단 (8.3, 24.4) |
| 감사에서 `/aws-service-role/` 역할을 미사용으로 삭제한다 | Config·GuardDuty·Organizations가 조용히 정지 | SLR은 삭제 대상이 아니다 (8.4) |
| ECS 태스크 실행 역할에 앱 권한을 넣는다 | 같은 클러스터의 모든 태스크가 그 권한을 얻음 | 태스크 역할과 실행 역할 분리 (8.4, 24.3) |
| Lambda 함수 여러 개가 역할 하나를 공유한다 | 최소 권한 붕괴, 함수 하나 침해로 전체 확산 | 함수당 역할 1개 (8.4, 24.6) |
| Deny 문에서 MFA를 `Bool`로 요구한다 | 키가 없는 요청에서 Deny가 발동하지 않음 | Deny는 `BoolIfExists`, Allow는 `Bool` (8.5) |
| 서드파티 역할에 External ID를 안 건다 | **Confused Deputy** — 벤더의 다른 고객이 우리 데이터 조회 | 벤더 발급 `sts:ExternalId` + 계정별 고유값 (8.6) |
| External ID를 우리가 임의로 정한다 | 벤더가 전송하지 못해 실패, 또는 테넌트 구분 불가 | 벤더 발급 값을 사용 (8.6) |
| AWS 서비스 신뢰 정책에 `sts:ExternalId`를 건다 | 서비스가 값을 보내지 않아 **모든 호출 실패** | `aws:SourceAccount` + `aws:SourceArn` (8.6) |
| `aws:SourceArn`을 `arn:aws:...:*:*:...`로 쓴다 | 계정 제한이 사라져 Confused Deputy로 회귀 | 계정 ID를 고정하고 `SourceAccount` 병기 (8.6) |
| 태그 강제 없이 ABAC을 도입한다 | 태그 없는 리소스가 접근 불가 → 와일드카드 예외로 회귀 | 태그 표준 + 생성 시 강제 먼저 (8.7, 12.3) |
| `ec2:CreateTags`를 조건 없이 허용한다 | 생성 후 태그를 바꿔 다른 프로젝트 리소스를 탈취 | `ec2:CreateAction` 조건으로 생성 시점에 한정 (8.7) |
| 세션 태그에 전이 키를 지정하지 않는다 | 역할 체이닝 한 번으로 ABAC 통제 소멸 | `--transitive-tag-keys` 필수 (8.7) |
| 태그 조건을 지원하지 않는 API에 ABAC을 적용한다 | 모든 요청이 거부됨 | API별 태그 인가 지원 여부 확인 (8.7) |
| CI 액세스 키를 GitHub Secrets에 넣는다 | 순환·폐기·오프보딩 대상에서 누락된 영구 키 | OIDC 페더레이션 (8.8, 27.6) |
| OIDC 신뢰 정책에 `sub` 조건을 생략한다 | **모든 GitHub 리포지토리**가 이 역할을 맡을 수 있다 | `sub`를 브랜치/환경까지 고정 (8.8) |
| Roles Anywhere에서 인증서 속성 조건을 생략한다 | 해당 CA가 발급한 모든 인증서가 역할 사용 가능 | `aws:PrincipalTag/x509Subject/CN` 조건 (8.8) |
| 사람 아이덴티티만 재검증하고 역할은 방치한다 | 원서가 경고한 "자동화에 대한 느슨한 통제" 상태 | 워크로드 역할도 재검증 대상 (8.8, 9.6) |

## 다음 장 예고

이 장에서 자격 증명의 수명을 잘라냈습니다. 남은 문제는 **역할을 맡는 그 사람이 애초에 어떻게 인증하는가**입니다. 8.5의 실습은 관리 계정에 IAM 사용자가 있다고 전제했고, 그 사용자에게는 여전히 비밀번호와 MFA 디바이스가 있습니다. 계정이 30개로 늘면 이 방식은 관리 불가능해집니다.

9장은 그 층을 다룹니다. SAML 2.0과 OIDC 페더레이션의 원리, **IAM Identity Center**로 멀티 계정 접근을 한 곳에서 관리하는 방법, 기업 IdP(Active Directory·Okta) 연동, 2판이 새로 강조한 **패스키/패스워드리스**와 **특권 접근 관리(PAM)**, 그리고 8.8 체크리스트 마지막 항목이 가리킨 **아이덴티티 라이프사이클의 재검증과 회수**입니다.
