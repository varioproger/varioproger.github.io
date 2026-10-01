---
title: "부록 E. IAM 정책 스니펫 모음 (50개)"
---

# 부록 E. IAM 정책 스니펫 모음 (50개)

본문 40개 장에 흩어진 정책을 **복사해서 바로 쓰는 형태**로 모았습니다. 각 스니펫에는 근거가 된 본문 절 번호를 달아 두었으니, "왜 이 조건이 붙는가"가 궁금하면 그 절로 돌아가십시오. 이 부록은 설명하지 않고 **붙여 넣을 것**만 줍니다.

---

## E-0 사용법

### 복사 전 반드시 할 3가지

**① 자리표시자를 치환한다.** 이 부록의 모든 값은 CANON 더미값입니다. 그대로 적용하면 **존재하지 않는 계정·버킷·키를 가리키는 정책**이 되고, 대부분의 경우 정책은 조용히 아무도 허용하지 않게 됩니다(Allow 정책) 또는 **아무도 막지 않게 됩니다**(Deny 정책의 예외 ARN). 각 스니펫 끝의 **변수** 표가 치환 목록입니다.

| 이 부록의 값 | 실제로 무엇 |
|---|---|
| `123456789012` | Organizations 관리 계정 |
| `111122223333` | 운영(Prod) 계정 |
| `444455556666` | 보안 도구 계정 |
| `777788889999` | 로그 아카이브 계정 |
| `555555555555` | 개발(Dev) 계정 |
| `o-exampleorgid` | 조직 ID (`aws organizations describe-organization`). 책 전체에서 이 표기 하나만 씁니다 |
| `vpce-0a1b2c3d4e5f67890` | VPC 엔드포인트 ID |
| `1234abcd-12ab-34cd-56ef-1234567890ab` | KMS 키 ID |
| `shopmini-uploads` / `shopmini-assets` | 대상 버킷 이름 |
| `ap-northeast-2` | 대상 리전 |

**② 격리 계정에서 먼저 테스트한다.** 아이덴티티 기반 정책은 테스트 역할에, 리소스 정책은 테스트 리소스에, **SCP는 Sandbox OU에** 먼저 붙입니다. 운영 계정에서 처음 적용하는 정책은 없어야 합니다.

**③ 적용 전에 두 도구로 검증한다.**

```bash
# (1) 시뮬레이터 — "이 주체가 이 액션을 이 리소스에 할 수 있는가"
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/shopmini-app-role \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::shopmini-uploads/incoming/a.jpg \
  --profile awssec-lab

# (2) Access Analyzer 정책 검증 — 문법·보안 경고·제안
aws accessanalyzer validate-policy \
  --policy-document file://policy.json \
  --policy-type RESOURCE_POLICY \
  --profile awssec-lab

# (3) 리소스 정책이라면 — 외부 접근이 새로 생기는지 사전 확인
aws accessanalyzer check-no-new-access \
  --existing-policy-document file://before.json \
  --new-policy-document file://after.json \
  --policy-type RESOURCE_POLICY \
  --profile awssec-lab
```

`--policy-type`은 아이덴티티 기반 정책이면 `IDENTITY_POLICY`, 리소스 정책·신뢰 정책·키 정책·버킷 정책이면 `RESOURCE_POLICY`, SCP면 `SERVICE_CONTROL_POLICY`입니다(7.7).

### 🔴 SCP는 Sandbox OU부터 단계 적용하라

**E-1의 12개는 어느 것도 Root에 바로 붙이지 마십시오.** 37.3은 Root에 붙인 리전 제한 SCP 하나가 3분 만에 전 계정을 마비시키고, 롤백하려는 관리 계정 로그인 경로마저 끊어 놓은 시나리오를 다룹니다.

| 단계 | 대상 | 관찰 기간 | 통과 기준 |
|---|---|---|---|
| 0 | 적용하지 않음 — Athena로 영향 사전 분석(37.3) | — | 걸릴 요청의 주체 목록 확보 |
| 1 | Sandbox / PolicyStaging OU | 1~3일 | 의도한 액션만 `AccessDenied`, 의도치 않은 실패 0건 |
| 2 | 개발(NonProd) OU | 1주 | 파이프라인 전 단계 통과 |
| 3 | 운영 OU 중 카나리 계정 1개 | 1주 | 배포·오토스케일링·백업·모니터링 정상 |
| 4 | 전체 OU / Root | — | 롤백 절차 문서화 후 적용 |

**롤백은 `aws organizations detach-policy`가 1차입니다.** 관리 계정 접근 경로가 Identity Center 하나뿐이면 그 순간 손이 묶입니다 — 36.6의 브레이크 글래스 IAM 경로를 먼저 확인하십시오.

### ⚠️ 이 부록 전체에 적용되는 3가지 함정

| 함정 | 증상 | 처방 |
|---|---|---|
| **조건 키 미지원 액션에 조건을 걸었다** | 정책은 유효하고 콘솔에는 "적용됨"인데 **아무것도 막지 않는다** | 그 액션이 그 조건 키를 지원하는지 먼저 확인. 확인 안 되면 SCP가 아니라 Config 규칙(37.7)·파이프라인 게이트(28.3)로 옮긴다 (37.3 함정 4) |
| **Deny에 부정 연산자를 썼는데 키가 없다** | 정상 요청까지 **과잉 차단** | `StringNotEqualsIfExists` / `ArnNotLikeIfExists`로 완화하거나, AWS 서비스 예외를 함께 건다 (7.4) |
| **자기 자신을 잠갔다** | 정책을 고칠 주체가 남아 있지 않다 | 모든 Deny에 예외 프린시펄(브레이크 글래스 역할) 자리를 남긴다 (32.4) |

---

## E-0-1 정책 유형 선택 가이드

"이럴 땐 어느 유형을 쓰나"의 결정표입니다. 근거는 7.2입니다.

| 하고 싶은 일 | 쓸 유형 | 이 부록 | 이유 |
|---|---|---|---|
| 내 계정의 역할에 권한을 준다 | 아이덴티티 기반 정책 | E-2 | 권한을 **부여**할 수 있는 두 유형 중 하나 |
| 다른 계정 주체에게 내 리소스를 연다 | 리소스 기반 정책 | E-4·E-5·E-6 | 아이덴티티 기반 정책은 자기 계정 밖으로 나가지 못한다 |
| 다른 계정 주체가 내 역할을 맡게 한다 | 신뢰 정책 | E-3 | 신뢰 정책은 역할에 붙는 리소스 기반 정책이다 |
| 위임 관리자에게 역할 생성을 허용하되 상한을 고정한다 | 권한 경계 | E-2-02·E-2-03 | 경계는 **권한을 주지 않는다** — 아이덴티티 정책과의 교집합만 남긴다 |
| 계정 안의 **모든** 주체(관리자 포함)를 막는다 | SCP | E-1 | 아이덴티티 정책으로는 계정 관리자를 막을 수 없다 |
| 브로커가 발급하는 단기 자격 증명만 좁힌다 | 세션 정책 | — | `AssumeRole` 호출 시 인라인 전달. 그 세션에만 적용 |
| 특정 네트워크 경로로만 리소스에 닿게 한다 | 엔드포인트 정책 + 리소스 정책 | E-6-01 + E-4-02 | 엔드포인트 정책은 **그 엔드포인트를 지나는 요청**만 제한한다 — 다른 경로는 리소스 정책으로 막아야 완성된다 |
| S3 객체 단위 권한을 준다 | **쓰지 않는다** | — | ACL은 조건을 걸 수 없다. Object Ownership을 `BucketOwnerEnforced`로 (15.3) |

🔴 **"상한 정책은 권한을 주지 않는다."** SCP·권한 경계·세션 정책에 `Allow`를 아무리 써도 주체에게 권한이 생기지 않습니다. 실제 부여는 언제나 E-2(아이덴티티) 또는 E-4~E-6(리소스)입니다.

---

# E-1 서비스 제어 정책(SCP) 12개

> 🔴 **이 12개는 전부 Deny 기반이며, 전부 락아웃 위험이 있습니다.** 각 스니펫의 ⚠️와 E-0의 단계 적용 절차를 건너뛰지 마십시오. SCP는 **관리 계정(`123456789012`)에는 적용되지 않습니다** — 12개 전부에 해당하는 공통 한계입니다(37.3 함정 1).

### E-1-01. 루트 사용자 사용 차단

**용도** — 멤버 계정의 루트 사용자가 어떤 API도 호출하지 못하게 막습니다.
**주의** — ⚠️ 루트로만 가능한 작업(일부 결제 설정, 특정 지원 요청)이 함께 막힙니다. 루트가 꼭 필요한 날에는 계정을 Exceptions OU로 옮겼다 되돌리고 그 이동을 감사 흔적으로 씁니다. **관리 계정 루트에는 걸리지 않습니다.**
**본문** — 37.2 ①, 5.1

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAllRootUserActions",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| (없음) | 그대로 사용. 붙이는 위치만 Root OU로 결정 |

---

### E-1-02. CloudTrail 중지·삭제 금지

**용도** — 조직 트레일을 멈추거나 지우거나 이벤트 선택기를 바꾸는 것을 막습니다.
**주의** — ⚠️ 멤버 계정이 **자기 계정용 추가 트레일**을 관리하는 것도 막힙니다. 조직 트레일 하나로 통일한다는 29.2의 전제가 필요합니다. 조직 트레일 자체는 관리 계정에 있어 이 SCP로 보호되지 않습니다.
**본문** — 37.2 ②, 29.2, 29.3

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectCloudTrail",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail",
        "cloudtrail:PutEventSelectors",
        "cloudtrail:DeleteEventDataStore",
        "cloudtrail:UpdateEventDataStore"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/stacksets-exec-*"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `arn:aws:iam::*:role/stacksets-exec-*` | 베이스라인 배포 역할 ARN 패턴. **비우지 마십시오** — 배포 자동화까지 막힙니다 |

---

### E-1-03. 보안 서비스 비활성화 금지

**용도** — GuardDuty·Security Hub·Config·Macie·Access Analyzer·Inspector·Detective를 끄거나 지우지 못하게 합니다.
**주의** — ⚠️ `config:DeleteConfigRule`을 막으면 계정 팀이 **자기 계정에 추가한 규칙**도 못 지웁니다. 로컬 규칙을 허용하려면 이 액션만 목록에서 빼십시오. 위임 관리자 계정의 보안팀 역할을 예외에 넣지 않으면 보안팀이 자기 도구를 운영할 수 없습니다.
**본문** — 37.2 ③, 31.2, 31.5

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDisablingSecurityServices",
      "Effect": "Deny",
      "Action": [
        "guardduty:DeleteDetector",
        "guardduty:UpdateDetector",
        "guardduty:DeleteMembers",
        "guardduty:StopMonitoringMembers",
        "guardduty:DisassociateFromAdministratorAccount",
        "securityhub:DisableSecurityHub",
        "securityhub:DeleteMembers",
        "securityhub:BatchDisableStandards",
        "securityhub:DisassociateFromAdministratorAccount",
        "config:DeleteConfigurationRecorder",
        "config:StopConfigurationRecorder",
        "config:DeleteDeliveryChannel",
        "config:DeleteConfigRule",
        "config:DeleteConformancePack",
        "config:DeleteRetentionConfiguration",
        "macie2:DisableMacie",
        "access-analyzer:DeleteAnalyzer",
        "inspector2:Disable",
        "detective:DeleteGraph"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::*:role/stacksets-exec-*",
            "arn:aws:iam::444455556666:role/SecurityToolingAdmin"
          ]
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `444455556666` | 보안 도구(위임 관리자) 계정 ID |
| `SecurityToolingAdmin` | 보안팀 운영 역할 이름 |
| `config:DeleteConfigRule` | 계정 로컬 Config 규칙을 허용하려면 이 줄을 삭제 |

---

### E-1-04. 미승인 리전 차단

**용도** — 승인한 리전 밖에서 리소스를 만들지 못하게 합니다.
**주의** — 🔴 **이 장에서 가장 자주 사고를 내는 SCP입니다.** `NotAction`에서 글로벌 서비스를 빠뜨리면 IAM 역할 생성·CloudFront 배포·Route 53 변경이 전부 실패합니다. `us-east-1`은 결제 지표·루트 사인인·글로벌 범위 API 때문에 **반드시 남깁니다**. 서비스 연결 역할을 예외에서 빼면 Auto Scaling이 **조용히** 확장에 실패합니다(37.3 함정 2).
**본문** — 37.2 ④, 37.3, 5.5

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnapprovedRegions",
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
        "trustedadvisor:*",
        "artifact:*",
        "networkmanager:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        },
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/aws-service-role/*"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `["ap-northeast-2", "us-east-1"]` | 승인 리전 목록. **`us-east-1`은 빼지 마십시오** |
| `NotAction` 목록 | 조직이 쓰는 글로벌 서비스를 추가. 규칙은 하나 — **"리전 개념이 없는 서비스는 전부 뺀다"** |

---

### E-1-05. 비암호화 리소스 생성 차단 (EBS·S3)

**용도** — 암호화하지 않은 EBS 볼륨 생성과, KMS 이외의 방식으로 지정된 S3 업로드를 막습니다.
**주의** — ⚠️ 두 번째 문장이 핵심입니다. `Bool: false`만 쓰면 **`Encrypted` 파라미터가 요청에 아예 없을 때** 조건이 성립하지 않아 통과합니다. `Null: true`가 그 미지정 요청을 막습니다. S3는 방향이 반대여서 `Null: false`를 함께 걸어 "헤더를 썼다면 반드시 `aws:kms`"로 좁힙니다. **RDS 저장 암호화는 이 SCP에 넣지 마십시오** — 지원되지 않는 조건 조합이면 정책이 유효한 채로 아무것도 막지 않습니다. Config 규칙 `RDS_STORAGE_ENCRYPTED`(37.7)와 파이프라인 게이트(28.3)로 덮습니다.
**본문** — 37.2 ⑤, 37.3 함정 4, 16.1

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedEbs",
      "Effect": "Deny",
      "Action": ["ec2:CreateVolume", "ec2:RunInstances"],
      "Resource": "arn:aws:ec2:*:*:volume/*",
      "Condition": { "Bool": { "ec2:Encrypted": "false" } }
    },
    {
      "Sid": "DenyEbsWhenEncryptionNotSpecified",
      "Effect": "Deny",
      "Action": ["ec2:CreateVolume", "ec2:RunInstances"],
      "Resource": "arn:aws:ec2:*:*:volume/*",
      "Condition": { "Null": { "ec2:Encrypted": "true" } }
    },
    {
      "Sid": "DenyS3PutWithWrongSse",
      "Effect": "Deny",
      "Action": "s3:PutObject",
      "Resource": "*",
      "Condition": {
        "Null": { "s3:x-amz-server-side-encryption": "false" },
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| (없음) | 그대로 사용. 적용 전 모든 IaC 템플릿에 암호화 파라미터가 들어갔는지 먼저 확인 |

---

### E-1-06. 조직 탈퇴·계정 폐쇄 금지

**용도** — 침해된 계정이 조직 밖으로 빠져나가 SCP·조직 트레일·GuardDuty를 한 번에 벗어나는 것을 막습니다.
**주의** — ⚠️ 정상적인 계정 폐쇄도 막힙니다. 폐쇄는 관리 계정에서 수행하거나(SCP 미적용) 대상 계정을 Suspended OU로 옮긴 뒤 진행합니다. 🔴 **이 SCP가 빠지면 나머지 11개가 전부 우회 가능합니다.**
**본문** — 37.2 ⑥, 36.2

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeavingOrganization",
      "Effect": "Deny",
      "Action": [
        "organizations:LeaveOrganization",
        "account:CloseAccount"
      ],
      "Resource": "*"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| (없음) | 그대로 사용. Root에 붙입니다 |

---

### E-1-07. IAM 사용자·장기 액세스 키 생성 금지

**용도** — 장기 자격 증명이 새로 생기는 모든 경로를 막습니다.
**주의** — ⚠️ IAM 사용자를 전제로 하는 레거시 도구·SDK 설정이 깨집니다. Identity Center(9.2)와 역할(8장)이 대체 경로로 먼저 서 있어야 합니다. **기존 IAM 사용자는 사라지지 않습니다** — 6.4의 정리 절차가 따로 필요합니다. 예외 역할에는 반드시 30장 알람을 겁니다.
**본문** — 37.2 ⑦, 6.4, 9.6

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyIamUserAndLongTermKeys",
      "Effect": "Deny",
      "Action": [
        "iam:CreateUser",
        "iam:CreateAccessKey",
        "iam:CreateLoginProfile",
        "iam:UpdateLoginProfile",
        "iam:CreateServiceSpecificCredential",
        "iam:UploadSSHPublicKey"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/OrgIdentityExceptionRole"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `OrgIdentityExceptionRole` | 장기 키 발급 예외 역할 이름. 이 역할 사용에 알람 필수 |

---

### E-1-08. 로그·백업 보관소 삭제 금지

**용도** — 중앙 로그 버킷과 백업 볼트를 조직 전체로부터 봉인합니다.
**주의** — ⚠️ 로그 아카이브 계정의 **관리자 본인**도 버킷을 못 만집니다. 그게 의도입니다. 라이프사이클을 바꾸려면 SCP 변경 절차를 밟아야 합니다. 백업 볼트 잠금(17.5)과 겹치는 것은 의도된 심층 방어입니다.
**본문** — 37.2 ⑧, 29.9, 17.4

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectLogBuckets",
      "Effect": "Deny",
      "Action": [
        "s3:DeleteBucket",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "s3:PutBucketObjectLockConfiguration",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:BypassGovernanceRetention",
        "s3:PutReplicationConfiguration"
      ],
      "Resource": [
        "arn:aws:s3:::shopmini-org-cloudtrail-logs",
        "arn:aws:s3:::shopmini-org-cloudtrail-logs/*",
        "arn:aws:s3:::shopmini-org-config-history",
        "arn:aws:s3:::shopmini-org-config-history/*"
      ]
    },
    {
      "Sid": "ProtectBackupVaults",
      "Effect": "Deny",
      "Action": [
        "backup:DeleteBackupVault",
        "backup:DeleteBackupVaultAccessPolicy",
        "backup:DeleteBackupVaultLockConfiguration",
        "backup:DeleteRecoveryPoint",
        "backup:UpdateRecoveryPointLifecycle",
        "backup:PutBackupVaultAccessPolicy"
      ],
      "Resource": "*"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-org-cloudtrail-logs` | 조직 CloudTrail 버킷 이름 |
| `shopmini-org-config-history` | 조직 Config 이력 버킷 이름 |

---

### E-1-09. 필수 태그 없는 리소스 생성 차단

**용도** — `Owner` 태그 없는 생성 요청을 막고, 거버넌스 태그 제거를 금지합니다.
**주의** — ⚠️ `aws:RequestTag`를 **지원하지 않는 생성 API에는 무력합니다**(대표적으로 `s3:CreateBucket`). 12.3의 3층 강제(SCP + 태그 정책 + Config 규칙)가 함께 필요합니다. 붙이기 전에 모든 IaC 템플릿에 태그가 들어갔는지 확인하십시오 — 순서를 거꾸로 하면 배포가 전부 실패합니다.
**본문** — 37.2 ⑨, 12.3, 37.8

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyEc2CreateWithoutOwnerTag",
      "Effect": "Deny",
      "Action": ["ec2:RunInstances", "ec2:CreateVolume"],
      "Resource": [
        "arn:aws:ec2:*:*:instance/*",
        "arn:aws:ec2:*:*:volume/*"
      ],
      "Condition": { "Null": { "aws:RequestTag/Owner": "true" } }
    },
    {
      "Sid": "DenyOtherCreateWithoutOwnerTag",
      "Effect": "Deny",
      "Action": [
        "rds:CreateDBInstance",
        "dynamodb:CreateTable",
        "elasticfilesystem:CreateFileSystem",
        "secretsmanager:CreateSecret"
      ],
      "Resource": "*",
      "Condition": { "Null": { "aws:RequestTag/Owner": "true" } }
    },
    {
      "Sid": "DenyRemovalOfGovernanceTags",
      "Effect": "Deny",
      "Action": [
        "ec2:DeleteTags",
        "rds:RemoveTagsFromResource",
        "dynamodb:UntagResource"
      ],
      "Resource": "*",
      "Condition": {
        "ForAnyValue:StringEquals": {
          "aws:TagKeys": ["Owner", "DataClass", "Environment"]
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `Owner` | 조직의 필수 태그 키 |
| `["Owner", "DataClass", "Environment"]` | 제거를 금지할 거버넌스 태그 키 목록 |

---

### E-1-10. 보안 베이스라인 역할·권한 경계 변경 금지

**용도** — StackSets가 배포한 베이스라인 역할과 권한 경계 정책을 계정 관리자가 손대지 못하게 합니다.
**주의** — 🔴 **배포 역할 자기 자신을 예외에 넣는 것을 잊지 마십시오.** 그러지 않으면 이 정책을 고칠 수 있는 곳이 관리 계정만 남습니다. 계정 관리자는 베이스라인 역할을 **StackSets를 통해서만** 고칠 수 있게 됩니다 — 그것이 목적입니다(28.4).
**본문** — 37.2 ⑩, 37.9, 28.4

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectBaselineRoles",
      "Effect": "Deny",
      "Action": [
        "iam:DeleteRole",
        "iam:DeleteRolePolicy",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:UpdateRole",
        "iam:UpdateAssumeRolePolicy",
        "iam:PutRolePermissionsBoundary",
        "iam:DeleteRolePermissionsBoundary"
      ],
      "Resource": [
        "arn:aws:iam::*:role/shopmini-baseline-*",
        "arn:aws:iam::*:role/stacksets-exec-*",
        "arn:aws:iam::*:role/AWSControlTowerExecution"
      ],
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::*:role/stacksets-exec-*",
            "arn:aws:iam::*:role/AWSControlTowerExecution"
          ]
        }
      }
    },
    {
      "Sid": "ProtectPermissionsBoundaryPolicy",
      "Effect": "Deny",
      "Action": [
        "iam:DeletePolicy",
        "iam:DeletePolicyVersion",
        "iam:CreatePolicyVersion",
        "iam:SetDefaultPolicyVersion"
      ],
      "Resource": "arn:aws:iam::*:policy/ShopMiniAppBoundary",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/stacksets-exec-*"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-baseline-*` | 베이스라인 역할 이름 패턴 |
| `ShopMiniAppBoundary` | 권한 경계 정책 이름 (E-2-02) |
| `stacksets-exec-*` | 배포 역할 패턴. **예외 목록에서 빼면 자기 잠금** |

---

### E-1-11. S3 퍼블릭 액세스 차단 해제 금지 (추가 ①)

**용도** — 계정·버킷 수준 Block Public Access를 끄거나 버킷 정책·ACL로 우회하는 것을 조직 전체에서 막습니다.
**주의** — ⚠️ `s3:PutBucketPolicy`까지 막으므로 **정상적인 버킷 정책 배포도 함께 막힙니다.** 배포 역할(`stacksets-exec-*`)을 예외에 반드시 넣으십시오. CloudFront OAC(E-4-05)처럼 BPA를 켠 채 공개하는 경로가 먼저 준비되어 있어야 합니다.
**본문** — 15.2, 15.1

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDisablingBlockPublicAccess",
      "Effect": "Deny",
      "Action": [
        "s3:PutAccountPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutBucketAcl"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::*:role/OrgBreakGlassAdmin",
            "arn:aws:iam::*:role/stacksets-exec-*"
          ]
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `OrgBreakGlassAdmin` | 브레이크 글래스 역할 이름 (32.4) |
| `s3:PutBucketPolicy` | 계정 팀이 버킷 정책을 직접 관리해야 하면 이 줄을 삭제 |

---

### E-1-12. MFA 없는 IAM 사용자 작업 차단 (추가 ②)

**용도** — 계정에 남아 있는 IAM 사용자 경로에서 MFA를 강제합니다.
**주의** — 🔴 **`Bool`이 아니라 `BoolIfExists`입니다.** `aws:MultiFactorAuthPresent`는 장기 액세스 키 호출에는 **아예 존재하지 않아**, `Bool`로 쓰면 키만 있으면 MFA 강제를 통째로 우회합니다. `aws:PrincipalArn`을 `user/*`로 좁혀 Identity Center 역할 세션과 워크로드 역할이 영향받지 않게 합니다. ⚠️ **페더레이션 세션의 MFA는 이 조건 키로 강제하지 마십시오** — 연동 방식에 따라 키의 존재와 값이 달라집니다. IdP/Identity Center 설정에서 강제합니다(9.4).
**본문** — 9.4, 7.4, 5.2

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyIamUserActionsWithoutMFA",
      "Effect": "Deny",
      "NotAction": [
        "iam:ChangePassword",
        "iam:GetUser",
        "iam:ListMFADevices",
        "iam:ListVirtualMFADevices",
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:ResyncMFADevice",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        },
        "StringLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:user/*"
        }
      }
    },
    {
      "Sid": "DenyNewHumanCredentialPaths",
      "Effect": "Deny",
      "Action": [
        "iam:CreateUser",
        "iam:CreateLoginProfile",
        "iam:CreateAccessKey"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/OrgBreakGlassRole"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `OrgBreakGlassRole` | 브레이크 글래스 역할 이름 |
| `sts:GetSessionToken` | **`NotAction`에서 빼지 마십시오** — CLI에서 MFA로 임시 자격 증명을 받는 경로입니다 |

---

# E-2 아이덴티티 기반 정책 8개

### E-2-01. 최소 권한 S3 접근 (접두사 + TLS + KMS)

**용도** — 앱 역할이 특정 접두사 아래 객체만, TLS로만, 지정된 KMS 키로만 읽고 쓰게 합니다.
**주의** — ⚠️ `s3:ListBucket`의 `Resource`는 **버킷 ARN**이고 `s3:GetObject`는 **객체 ARN**입니다. 둘을 섞으면 목록 조회가 조용히 실패합니다. `s3:prefix` 조건은 `ListBucket`에만 적용되며 `GetObject`에는 통하지 않습니다.
**본문** — 7.1, 7.6, 15.4

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOnlyIncomingPrefix",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shopmini-uploads",
      "Condition": {
        "StringLike": { "s3:prefix": ["incoming/", "incoming/*"] },
        "Bool": { "aws:SecureTransport": "true" }
      }
    },
    {
      "Sid": "ReadWriteObjectsUnderIncoming",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::shopmini-uploads/incoming/*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "true" }
      }
    },
    {
      "Sid": "UseAppKmsKeyViaS3Only",
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab",
      "Condition": {
        "StringEquals": { "kms:ViaService": "s3.ap-northeast-2.amazonaws.com" }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-uploads` | 대상 버킷 |
| `incoming/` | 허용할 접두사 |
| `1234abcd-...` | 버킷 기본 암호화에 쓰는 KMS 키 ID |

---

### E-2-02. 권한 경계 정책 본문 (ShopMiniAppBoundary)

**용도** — 위임 관리자가 만드는 모든 앱 역할의 **상한**을 정의합니다. 이 정책 자체는 권한을 주지 않습니다.
**주의** — ⚠️ 경계는 아이덴티티 기반 정책과의 **교집합**입니다. 여기에 없는 액션은 아이덴티티 정책이 아무리 허용해도 통하지 않습니다. 반대로 여기 있다고 권한이 생기지도 않습니다. **IAM·Organizations 권한 상승 경로를 Deny로 명시**하지 않으면 경계 안에서 관리자가 되는 길이 열립니다.
**본문** — 7.2, 7.5

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AppRuntimeServicesCeiling",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey",
        "secretsmanager:GetSecretValue",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "xray:PutTraceSegments"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:RequestedRegion": "ap-northeast-2" }
      }
    },
    {
      "Sid": "NeverAllowIdentityOrOrgEscalation",
      "Effect": "Deny",
      "Action": [
        "iam:*",
        "organizations:*",
        "account:*",
        "sts:AssumeRole",
        "cloudtrail:*",
        "guardduty:*",
        "securityhub:*",
        "config:*",
        "kms:PutKeyPolicy",
        "kms:ScheduleKeyDeletion"
      ],
      "Resource": "*"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `AppRuntimeServicesCeiling` 액션 목록 | 앱이 실제로 쓰는 서비스만. **넓히면 경계가 무의미해집니다** |
| `ap-northeast-2` | 앱이 도는 리전 |

---

### E-2-03. 권한 경계 강제 위임 (역할 생성 위임)

**용도** — 리드 개발자에게 앱 역할 생성 권한을 주되, **반드시 권한 경계를 붙여야만** 만들 수 있게 합니다.
**주의** — 🔴 **두 번째 문장이 빠지면 첫 번째 문장은 무의미합니다.** 경계를 붙여 역할을 만든 뒤 경계를 떼면 되기 때문입니다. 경계 제거 권한의 명시적 Deny가 항상 함께 갑니다. `Resource`를 `role/*`로 넓히면 위임자가 **베이스라인 역할까지** 손댈 수 있습니다.
**본문** — 7.2, 7.5

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRoleCreationOnlyWithBoundary",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy"
      ],
      "Resource": "arn:aws:iam::111122223333:role/shopmini-app-*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::111122223333:policy/ShopMiniAppBoundary"
        }
      }
    },
    {
      "Sid": "DenyBoundaryEscape",
      "Effect": "Deny",
      "Action": [
        "iam:DeleteRolePermissionsBoundary",
        "iam:PutRolePermissionsBoundary"
      ],
      "Resource": "arn:aws:iam::111122223333:role/shopmini-app-*"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-app-*` | 위임 범위 역할 이름 패턴. **반드시 접두사로 좁힐 것** |
| `ShopMiniAppBoundary` | E-2-02의 경계 정책 이름 |

---

### E-2-04. MFA 강제 + 셀프서비스 등록 허용

**용도** — IAM 사용자가 MFA를 등록하기 전에는 MFA 등록 외 아무것도 못 하게 합니다.
**주의** — 🔴 **적용 전 반드시 테스트 사용자로 검증하십시오. 이 정책은 자기 자신을 포함한 전원을 잠글 수 있습니다.** 잠겼을 때 유일한 탈출구가 루트이고, 그것이 루트를 지우지 않고 봉인만 하는 이유입니다(5.1). `Bool`이 아니라 **`BoolIfExists`**입니다. `sts:GetSessionToken`을 `NotAction`에서 빼면 CLI에서 MFA를 쓸 방법이 없어집니다.
**본문** — 5.2, 7.4

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

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `111122223333` | 정책을 붙이는 계정 ID |
| `${aws:username}` | **치환하지 마십시오** — 정책 변수입니다. `Version`이 `2012-10-17`이어야 동작합니다 |

---

### E-2-05. 리전 제한 (아이덴티티 기반)

**용도** — SCP를 쓸 수 없는 단일 계정 환경에서 역할·그룹 단위로 리전을 제한합니다.
**주의** — ⚠️ SCP와 달리 **계정 관리자는 이 정책을 떼어낼 수 있습니다.** 조직이 있다면 E-1-04를 쓰십시오. 글로벌 서비스를 `NotAction`에서 빠뜨리면 IAM·CloudFront·Route 53이 전부 실패합니다(37.3 함정 3).
**본문** — 5.5, 7.4, 37.3

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
        "waf:*",
        "wafv2:*",
        "shield:*",
        "support:*",
        "budgets:*",
        "ce:*",
        "health:*",
        "trustedadvisor:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `["ap-northeast-2", "us-east-1"]` | 승인 리전. `us-east-1`은 남길 것 |

---

### E-2-06. ABAC — 같은 태그 리소스만 운영

**용도** — 세션 태그 `Project`와 일치하는 태그를 가진 인스턴스만 운영하게 합니다. 역할을 프로젝트 수마다 만들지 않아도 됩니다.
**주의** — ⚠️ `aws:PrincipalTag`가 비어 있으면 조건이 성립하지 않아 **전부 거부**됩니다. 세션 태그가 실제로 전달되는지 먼저 확인하십시오(`sts:TagSession` 권한과 신뢰 정책). `Describe*` 계열은 리소스 태그로 필터할 수 없어 별도 문장으로 전역 허용해야 합니다 — 이것이 ABAC의 구조적 한계입니다.
**본문** — 8.7, 12.3

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

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `Project` | ABAC 축으로 쓸 태그 키 |
| `111122223333` | 대상 계정 ID |

---

### E-2-07. ABAC — 생성 시 태그 강제

**용도** — 인스턴스를 만들 때 자기 프로젝트 태그를 반드시 붙이게 하고, 생성 이후 태그 변조를 막습니다.
**주의** — ⚠️ `Null` 조건을 함께 걸지 않으면 **태그를 아예 생략한 요청**이 통과합니다(E-1-05와 같은 함정). `ec2:CreateAction` 조건으로 `CreateTags`를 **생성 시점으로 한정**하지 않으면, 사용자가 나중에 태그를 바꿔 다른 프로젝트 리소스를 장악할 수 있습니다.
**본문** — 8.7, 12.3

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

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `Project` | 강제할 태그 키 |
| `["Project", "Chapter", "AutoDelete"]` | 생성 시 허용할 태그 키 화이트리스트 |

---

### E-2-08. `iam:PassRole` 범위 제한

**용도** — 역할 전달을 특정 역할 패턴 + 특정 서비스로만 제한합니다.
**주의** — 🔴 **`"Action": "iam:PassRole", "Resource": "*"`는 즉시 권한 상승입니다.** 전달 가능한 역할이 `AdministratorAccess`를 가지고 있으면, 그 역할을 Lambda에 붙여 임의 코드를 관리자 권한으로 실행할 수 있습니다. `iam:PassedToService`까지 걸어야 "Lambda에는 되지만 EC2에는 안 된다"가 성립합니다.
**본문** — 7.5 패턴 2, 24.6

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PassOnlyAppRolesAndOnlyToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::111122223333:role/shopmini-app-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-app-*` | 전달을 허용할 역할 패턴 |
| `lambda.amazonaws.com` | 전달 대상 서비스 프린시펄 (`ec2.amazonaws.com`, `ecs-tasks.amazonaws.com` 등) |

---

# E-3 신뢰 정책(Trust Policy) 7개

> ⚠️ **신뢰 정책의 `Principal`에 `"*"`를 쓰지 마십시오.** "누구든 이 역할을 맡을 수 있다"는 뜻이며, 조건이 함께 없으면 즉시 사고입니다(7.5 패턴 3). Access Analyzer의 외부 접근 결과에서 가장 먼저 걸러야 할 항목입니다.

### E-3-01. EC2 인스턴스 프로파일 역할

**용도** — EC2 인스턴스가 이 역할의 임시 자격 증명을 받게 합니다. 코드에 키를 넣지 않는 표준 방법입니다.
**주의** — ⚠️ 이 신뢰 정책만으로는 부족합니다. **IMDSv2를 강제**(`HttpTokens: required`)하지 않으면 SSRF 한 번으로 이 역할의 자격 증명이 유출됩니다(8.3). 홉 제한을 1로 두어 컨테이너에서의 메타데이터 접근도 차단하십시오.
**본문** — 8.2, 8.3, 22.3

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowEc2ToAssume",
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| (없음) | 그대로 사용. 역할 권한은 E-2-01 같은 아이덴티티 정책으로 따로 부여 |

---

### E-3-02. Lambda 실행 역할

**용도** — Lambda 함수가 이 역할로 실행되게 합니다.
**주의** — ⚠️ **함수마다 역할을 따로 만드십시오.** 하나의 역할을 여러 함수가 공유하면 최소 권한이 가장 권한이 큰 함수 기준으로 맞춰집니다. 로그 권한은 `logs:CreateLogGroup`을 빼고 자기 로그 그룹만 지정하는 편이 안전합니다(24.6).
**본문** — 24.6, 8.4

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowLambdaToAssume",
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| (없음) | 그대로 사용 |

---

### E-3-03. 크로스 계정 + External ID (서드파티 SaaS)

**용도** — 외부 벤더 계정이 우리 역할을 맡되, **우리가 발급한 비밀 식별자를 제시할 때만** 허용합니다.
**주의** — 🔴 **`sts:ExternalId` 조건이 없으면 Confused Deputy에 그대로 노출됩니다.** 벤더 계정 ID만 아는 제3자가 같은 벤더를 통해 우리 역할을 맡을 수 있습니다. External ID는 **벤더가 주는 값이 아니라 우리가 테넌트마다 다르게 생성해 벤더에 등록하는 값**이어야 합니다. `Principal`을 벤더의 `:root`로 두면 그 계정의 **모든** 주체가 대상이 됩니다 — 가능하면 벤더 역할 ARN으로 좁히십시오.
**본문** — 8.6, 7.5 패턴 3

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustVendorForThisTenantOnly",
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

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `999988887777` | 벤더 AWS 계정 ID |
| `shopmini-prod-7f3a1c9e-...` | **우리가 생성한** 테넌트별 난수. 추측 가능한 값(회사명, 계정 ID)은 금지 |

---

### E-3-04. AWS 서비스 프린시펄 + SourceArn/SourceAccount

**용도** — AWS 서비스가 이 역할을 맡되, **우리 계정의 특정 리소스를 위해 호출할 때만** 허용합니다.
**주의** — 🔴 서비스 프린시펄만 쓰면 **같은 서비스를 쓰는 아무 계정이나** 우리 역할을 맡게 할 수 있습니다(Confused Deputy). `aws:SourceAccount`와 `aws:SourceArn`을 함께 겁니다. ⚠️ **S3 버킷 ARN에는 계정 ID가 없어** `aws:SourceArn`만으로는 부족합니다 — 같은 이름의 버킷을 자기 계정에 만드는 공격이 성립하므로 `aws:SourceAccount`가 반드시 함께 가야 합니다.
**본문** — 8.6, 24.8

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

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `cloudtrail.amazonaws.com` | 호출 서비스 프린시펄 (`ssm.amazonaws.com`, `events.amazonaws.com` 등) |
| `aws:SourceArn` 값 | 그 서비스의 **우리 리소스** ARN |
| `111122223333` | 리소스 소유 계정 ID |

---

### E-3-05. GitHub Actions OIDC

**용도** — 장기 액세스 키 없이 GitHub Actions 워크플로가 배포 역할을 맡게 합니다.
**주의** — 🔴 **`:sub` 조건이 없거나 `repo:org/*`처럼 넓으면 그 조직의 어떤 리포지토리·어떤 브랜치에서도 운영 계정을 배포할 수 있습니다.** 포크 PR에서도 실행될 수 있으므로 `ref:refs/heads/main` 또는 `environment:production`까지 고정하십시오. `:aud`를 빼면 다른 대상으로 발급된 토큰이 재사용될 수 있습니다.
**본문** — 27.4, 27.6, 8.8

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GitHubActionsProdDeployOnly",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:shopmini-org/shopmini-app:environment:production"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `111122223333` | OIDC 공급자를 등록한 계정 ID |
| `shopmini-org/shopmini-app` | GitHub 조직/리포지토리 |
| `environment:production` | 고정할 환경. 브랜치 고정은 `ref:refs/heads/main` |

---

### E-3-06. SAML 페더레이션 (기업 IdP)

**용도** — 기업 IdP가 발급한 SAML 주장으로 콘솔·CLI 접근을 허용합니다.
**주의** — ⚠️ **`SAML:aud` 조건이 없으면 같은 IdP가 다른 용도로 발급한 주장이 AWS 로그인에 재사용될 수 있습니다.** 반드시 넣으십시오. ⚠️ 이 경로는 계정 수에 비례해 관리 비용이 커집니다 — 멀티 계정이라면 Identity Center(9.2)가 표준입니다. **SAML 인증서 만료 알람**을 걸지 않으면 전 계정 로그인이 동시에 차단됩니다.
**본문** — 9.1, 9.3

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustCorpIdPForConsoleAndCli",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::111122223333:saml-provider/CorpIdP"
      },
      "Action": "sts:AssumeRoleWithSAML",
      "Condition": {
        "StringEquals": {
          "SAML:aud": "https://signin.aws.amazon.com/saml"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `CorpIdP` | IAM에 등록한 SAML 공급자 이름 |
| `111122223333` | 역할이 있는 계정 ID |

---

### E-3-07. 조직 내부로 제한한 크로스 계정 신뢰

**용도** — 조직 안의 특정 역할만 이 역할을 맡게 합니다. 계정을 하나씩 열거하지 않아도 조직 밖은 자동으로 차단됩니다.
**주의** — ⚠️ `aws:PrincipalOrgID`만 걸면 **조직의 모든 계정의 모든 주체**가 대상입니다. `Principal`을 구체적 역할 ARN으로 좁히고 `aws:PrincipalOrgID`는 **2차 방어선**으로 씁니다. ⚠️ 조직에서 계정이 떠나면 이 신뢰가 자동으로 끊기는 것이 장점이자 함정입니다 — 계정 이동 시 접근 단절을 예상하십시오.
**본문** — 8.5, 36.7, 7.4

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustSecurityAuditorInOrgOnly",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/SecurityAuditRole"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-exampleorgid"
        },
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "true"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `444455556666` / `SecurityAuditRole` | 신뢰할 계정과 역할 |
| `o-exampleorgid` | 조직 ID |
| `aws:MultiFactorAuthPresent` 조건 | 페더레이션 경로에서는 값이 보장되지 않습니다(9.4). IAM 사용자 기반 전환에만 쓰고, 아니면 이 조건을 빼십시오 |

---

# E-4 S3 버킷 정책 9개

### E-4-01. TLS 강제

**용도** — HTTP 평문 요청을 전부 거부합니다. 모든 버킷에 기본으로 붙일 첫 번째 문장입니다.
**주의** — ⚠️ `Bool: {"aws:SecureTransport": "false"}`는 안전한 방향입니다(키가 없으면 조건 미성립 → 차단 안 됨). S3 요청에는 이 키가 언제나 존재하므로 `BoolIfExists`가 필요 없습니다. **버킷 ARN과 객체 ARN을 둘 다 넣어야** 버킷 수준 API까지 덮습니다.
**본문** — 15.4, 13.2

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniUploadsTls",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-uploads` | 대상 버킷 이름 (두 줄 모두) |

---

### E-4-02. VPC 엔드포인트 경유만 허용

**용도** — 지정한 VPC 엔드포인트를 지나지 않는 요청을 거부합니다. 자격 증명이 유출돼도 인터넷에서는 쓸 수 없게 만듭니다.
**주의** — 🔴 **`StringNotEquals`가 아니라 `StringNotEqualsIfExists`를 쓰고 AWS 서비스 예외를 반드시 넣으십시오.** 그러지 않으면 CloudTrail·복제·Config 같은 **AWS 서비스의 정당한 접근까지 전부 막혀** 로그가 끊깁니다. ⚠️ **콘솔에서의 접근도 막힙니다** — 운영자가 콘솔로 버킷을 열 수 없게 되는 것을 미리 합의하십시오. `aws:SourceIp`는 엔드포인트 경유 요청에 통하지 않으므로 대체재가 되지 못합니다(7.4 함정 1).
**본문** — 15.4, 20.3, 7.4

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniUploadsVpceOnly",
  "Statement": [
    {
      "Sid": "DenyOutsideVpcEndpoint",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "StringNotEqualsIfExists": {
          "aws:SourceVpce": "vpce-0a1b2c3d4e5f67890"
        },
        "BoolIfExists": {
          "aws:PrincipalIsAWSService": "false"
        },
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/DataBreakGlassAdmin"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `vpce-0a1b2c3d4e5f67890` | S3 게이트웨이 엔드포인트 ID. 여러 개면 배열로 |
| `DataBreakGlassAdmin` | 예외 역할. **비우면 콘솔 복구 경로가 사라집니다** |

---

### E-4-03. 조직 외부 접근 차단

**용도** — 조직 밖의 어떤 주체도 이 버킷에 닿지 못하게 합니다. 계정을 열거하지 않아도 됩니다.
**주의** — 🔴 **`StringNotEqualsIfExists` + `aws:PrincipalIsAWSService` 예외가 세트입니다.** `aws:PrincipalOrgID`는 AWS 서비스 프린시펄 호출에 존재하지 않으므로, `StringNotEquals`만 쓰면 조건이 성립해 **로그 전송·복제가 전부 막힙니다.** ⚠️ 사전 서명 URL은 **서명한 주체의 권한**으로 평가되므로 이 정책으로 막히지 않습니다(15.6).
**본문** — 15.4, 15.5, 7.4

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniUploadsOrgOnly",
  "Statement": [
    {
      "Sid": "DenyOutsideOrganization",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "StringNotEqualsIfExists": {
          "aws:PrincipalOrgID": "o-exampleorgid"
        },
        "BoolIfExists": {
          "aws:PrincipalIsAWSService": "false"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `o-exampleorgid` | 조직 ID |
| `shopmini-uploads` | 대상 버킷 |

---

### E-4-04. 암호화 강제 (KMS 키 고정)

**용도** — 지정한 KMS 키로 암호화하지 않은 업로드를 거부합니다.
**주의** — ⚠️ **두 문장이 세트입니다.** `StringNotEquals`만 쓰면 헤더를 생략한 요청이 통과하고, `Null`만 쓰면 SSE-S3로 암호화한 요청이 통과합니다. ⚠️ 키 ID는 **전체 ARN**으로 쓰십시오 — 별칭이나 키 ID만 쓰면 클라이언트가 보낸 값과 문자열 비교가 어긋나 정상 업로드가 거부됩니다. ⚠️ 세 번째 문장은 `IfExists`이므로 **키 ID 헤더를 생략하고 버킷 기본 키에 맡기는 업로드도 거부합니다.** 그것이 "키 고정"의 의도이지만, 기존 클라이언트가 헤더를 보내지 않는다면 먼저 고쳐야 합니다. S3는 2023년부터 모든 신규 객체에 SSE-S3를 기본 적용하므로, 이 정책의 실질 목적은 "암호화 여부"가 아니라 **"고객 관리 키를 쓰게 만드는 것"**입니다(13.4).
**본문** — 15.7, 15.4, 13.4

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniUploadsKmsPin",
  "Statement": [
    {
      "Sid": "DenyMissingEncryptionHeader",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shopmini-uploads/*",
      "Condition": {
        "Null": { "s3:x-amz-server-side-encryption": "true" }
      }
    },
    {
      "Sid": "DenyNonKmsEncryption",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shopmini-uploads/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    },
    {
      "Sid": "DenyWrongKmsKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shopmini-uploads/*",
      "Condition": {
        "StringNotEqualsIfExists": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `arn:aws:kms:...:key/1234abcd-...` | 고정할 KMS 키 **전체 ARN** |
| `shopmini-uploads` | 대상 버킷 |

---

### E-4-05. CloudFront OAC 전용 공개 버킷

**용도** — Block Public Access를 켠 채로 CloudFront 배포에만 오리진 읽기를 허용합니다. **버킷을 공개하지 않고 콘텐츠를 공개하는** 유일한 표준 방법입니다.
**주의** — 🔴 **`aws:SourceArn` 조건이 없으면 아무 CloudFront 배포나 이 버킷을 오리진으로 쓸 수 있습니다.** 반드시 배포 ARN으로 고정하십시오. ⚠️ 레거시 OAI(Origin Access Identity)를 함께 남겨 두면 그 경로가 우회로가 됩니다 — 마이그레이션 후 OAI 문장을 삭제하십시오.
**본문** — 23.7, 15.2

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniAssetsOacOnly",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOACOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shopmini-assets/*",
      "Condition": {
        "StringEquals": {
          "aws:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E1SHOPMINIDIST"
        }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::shopmini-assets",
        "arn:aws:s3:::shopmini-assets/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-assets` | 오리진 버킷 이름 |
| `E1SHOPMINIDIST` | CloudFront 배포 ID |
| `111122223333` | 배포 소유 계정 ID |

---

### E-4-06. 로그 전송 버킷 정책 (CloudTrail · Config · ELB)

**용도** — 로그 아카이브 계정의 중앙 버킷이 세 로그 소스를 받게 합니다.
**주의** — 🔴 **`aws:SourceArn` / `aws:SourceAccount` 없이 서비스 프린시펄만 허용하면 다른 조직의 트레일이 우리 버킷에 로그를 밀어 넣을 수 있습니다.** ⚠️ **ELB 액세스 로그의 프린시펄은 리전마다 다릅니다.** 2022년 8월 이후 활성화된 리전은 `logdelivery.elasticloadbalancing.amazonaws.com` 서비스 프린시펄을 쓰지만, 그 이전부터 있던 리전(서울 `ap-northeast-2` 포함)은 **리전별 ELB 계정 ID**를 `Principal.AWS`로 지정해야 합니다 — 적용 전 AWS 문서에서 해당 리전 값을 확인하십시오. 잘못 쓰면 로그가 조용히 전송되지 않습니다. ⚠️ 이 버킷에는 E-1-08의 SCP가 함께 붙어야 완성입니다.
**본문** — 29.4, 29.9, 29.8, 23.3

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniOrgLogDelivery",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": { "Service": "cloudtrail.amazonaws.com" },
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::shopmini-org-cloudtrail-logs",
      "Condition": {
        "StringEquals": {
          "aws:SourceArn": "arn:aws:cloudtrail:ap-northeast-2:123456789012:trail/shopmini-org-trail"
        }
      }
    },
    {
      "Sid": "AWSCloudTrailOrganizationWrite",
      "Effect": "Allow",
      "Principal": { "Service": "cloudtrail.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shopmini-org-cloudtrail-logs/AWSLogs/o-exampleorgid/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceAccount": "123456789012",
          "aws:SourceArn": "arn:aws:cloudtrail:ap-northeast-2:123456789012:trail/shopmini-org-trail"
        }
      }
    },
    {
      "Sid": "AWSConfigBucketPermissionsCheck",
      "Effect": "Allow",
      "Principal": { "Service": "config.amazonaws.com" },
      "Action": ["s3:GetBucketAcl", "s3:ListBucket"],
      "Resource": "arn:aws:s3:::shopmini-org-config-history",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "111122223333" }
      }
    },
    {
      "Sid": "AWSConfigWrite",
      "Effect": "Allow",
      "Principal": { "Service": "config.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shopmini-org-config-history/config/AWSLogs/111122223333/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceAccount": "111122223333"
        }
      }
    },
    {
      "Sid": "ElbAccessLogWriteNewerRegions",
      "Effect": "Allow",
      "Principal": { "Service": "logdelivery.elasticloadbalancing.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::shopmini-org-elb-logs/AWSLogs/111122223333/*",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "111122223333" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::shopmini-org-cloudtrail-logs",
        "arn:aws:s3:::shopmini-org-cloudtrail-logs/*",
        "arn:aws:s3:::shopmini-org-config-history",
        "arn:aws:s3:::shopmini-org-config-history/*",
        "arn:aws:s3:::shopmini-org-elb-logs",
        "arn:aws:s3:::shopmini-org-elb-logs/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `123456789012` | 조직 트레일을 소유한 **관리 계정** ID |
| `111122223333` | Config·ELB 로그를 보내는 **원본 계정** ID |
| `o-exampleorgid` | 조직 ID (CloudTrail 조직 트레일 경로에 들어감) |
| `shopmini-org-*-logs` | 로그 아카이브 계정의 버킷 이름 |
| `logdelivery.elasticloadbalancing.amazonaws.com` | **리전별 확인 필요.** 구 리전은 리전 ELB 계정 ID를 `Principal.AWS`로 |

---

### E-4-07. 크로스 계정 읽기 허용

**용도** — 보안 계정의 감사 역할이 운영 버킷을 읽게 합니다.
**주의** — ⚠️ **크로스 계정은 양쪽이 모두 허용해야 통합니다.** 이 버킷 정책과 별개로, 상대 계정의 역할에도 `s3:GetObject` 아이덴티티 정책이 필요합니다(7.3). ⚠️ 객체가 KMS로 암호화되어 있으면 **키 정책에도 그 역할을 허용**해야 합니다(E-5-05) — 버킷 정책만 열고 키를 잊는 것이 가장 흔한 실패입니다. ⚠️ `Principal`을 `:root`로 쓰면 **그 계정의 모든 주체**가 대상입니다.
**본문** — 15.5, 7.3, 13.10

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniUploadsCrossAccountRead",
  "Statement": [
    {
      "Sid": "AllowSecurityAccountAuditRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/SecurityAuditRole"
      },
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
        "Bool": { "aws:SecureTransport": "true" }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `444455556666` / `SecurityAuditRole` | 읽기를 허용할 계정과 역할 |
| `o-exampleorgid` | 조직 ID |

---

### E-4-08. 퍼블릭 차단 보강 (BPA 우회 경로 봉인)

**용도** — 계정 수준 Block Public Access와 별개로, 버킷 자체에서 퍼블릭 ACL·퍼블릭 그랜트·접근 통제 변조를 막습니다.
**주의** — 🔴 **마지막 문장이 자기 자신을 잠급니다.** `s3:PutBucketPolicy`를 Deny하므로 예외 프린시펄을 비워 두면 **이 정책을 고칠 수 있는 주체가 사라집니다.** 브레이크 글래스 역할과 배포 역할을 반드시 남기십시오. ⚠️ 그랜트 헤더 검사는 **문장을 둘로 나눕니다** — 한 `Condition` 블록에 두 키를 넣으면 AND로 평가되어 **둘 다 퍼블릭일 때만** 막히고 한쪽만 퍼블릭인 요청은 통과합니다. ⚠️ 근본 대책은 Object Ownership을 `BucketOwnerEnforced`로 두어 ACL 자체를 무력화하는 것입니다(15.3) — 이 정책은 그 위의 2차 방어선입니다.
**본문** — 15.2, 15.1, 15.3

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniUploadsPublicGuard",
  "Statement": [
    {
      "Sid": "DenyPublicObjectAcl",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::shopmini-uploads/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": [
            "public-read",
            "public-read-write",
            "authenticated-read"
          ]
        }
      }
    },
    {
      "Sid": "DenyPublicGrantReadHeader",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:PutObject", "s3:PutObjectAcl", "s3:PutBucketAcl"],
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "StringLike": { "s3:x-amz-grant-read": "*AllUsers*" }
      }
    },
    {
      "Sid": "DenyPublicGrantFullControlHeader",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:PutObject", "s3:PutObjectAcl", "s3:PutBucketAcl"],
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "StringLike": { "s3:x-amz-grant-full-control": "*AllUsers*" }
      }
    },
    {
      "Sid": "DenyTamperingWithAccessControls",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutBucketAcl"
      ],
      "Resource": "arn:aws:s3:::shopmini-uploads",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::111122223333:role/DataBreakGlassAdmin",
            "arn:aws:iam::111122223333:role/stacksets-exec-baseline"
          ]
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `DataBreakGlassAdmin` | 브레이크 글래스 역할. **비우면 자기 잠금** |
| `stacksets-exec-baseline` | 버킷 정책을 배포하는 IaC 역할 |
| `shopmini-uploads` | 대상 버킷 |

---

### E-4-09. 삭제 방지 (버전·수명주기 봉인)

**용도** — 객체 버전 삭제, 버전 관리 해제, 수명주기 변경, 객체 잠금 우회를 막습니다. 랜섬웨어 시나리오의 마지막 방어선입니다.
**주의** — 🔴 **예외 역할을 비우면 정상적인 데이터 정리도 영구히 불가능해집니다.** 보존 기간이 지난 데이터를 지울 경로를 반드시 남기십시오. ⚠️ **MFA Delete는 버킷 정책으로 구현할 수 없습니다** — 버킷 소유 계정의 **루트 자격 증명**으로만 켤 수 있는 별도 기능입니다(15.8). ⚠️ 이 정책은 계정 내부만 막습니다. 계정 관리자 자체를 막으려면 E-1-08의 SCP가 필요합니다.
**본문** — 15.8, 15.9, 17.5

```json
{
  "Version": "2012-10-17",
  "Id": "ShopMiniUploadsDeleteGuard",
  "Statement": [
    {
      "Sid": "DenyVersionDeletionExceptBreakGlass",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:DeleteObjectVersion",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "s3:BypassGovernanceRetention",
        "s3:PutBucketObjectLockConfiguration",
        "s3:DeleteBucket"
      ],
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/DataBreakGlassAdmin"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `DataBreakGlassAdmin` | 데이터 파기 승인 역할. **이 역할 사용에 알람 필수**(30.3) |
| `shopmini-uploads` | 대상 버킷 |

---

# E-5 KMS 키 정책 6개

> 🔴 **키 정책은 KMS 접근 통제의 최종 관문입니다.** 아이덴티티 정책이 아무리 허용해도 키 정책이 허용하지 않으면 통하지 않습니다. 그래서 **자기 자신을 잠글 위험이 가장 큰 정책 유형**이기도 합니다 — `kms:PutKeyPolicy` 권한을 가진 주체를 항상 하나 이상 남기십시오(13.4, 13.11).

### E-5-01. 기본 안전 템플릿

**용도** — 새 고객 관리 키에 처음 붙일 최소 안전 정책. 계정 루트 위임 + 키 관리자 + 키 사용자 3층입니다.
**주의** — 🔴 **첫 문장(`EnableIAMUserPermissions`)을 지우지 마십시오.** 이것이 없으면 IAM 정책으로는 이 키에 접근할 수 없고, 키 정책에 명시된 주체만 남습니다 — 그 주체를 잃으면 **키를 영구히 사용할 수 없습니다**(AWS 지원도 복구할 수 없습니다). 반대로 이 문장은 "계정 안에서 IAM 정책으로 권한을 줄 수 있다"는 뜻이므로, 계정 관리자는 사실상 이 키에 접근할 수 있습니다 — 격리가 필요하면 E-5-02로 분리하십시오.
**본문** — 13.4, 13.5

```json
{
  "Version": "2012-10-17",
  "Id": "key-policy-shopmini-app",
  "Statement": [
    {
      "Sid": "EnableIAMUserPermissions",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "KeyAdministrators",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-key-admin" },
      "Action": [
        "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*",
        "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*",
        "kms:Get*", "kms:Delete*", "kms:TagResource", "kms:UntagResource",
        "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "KeyUsers",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
      "Action": [
        "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
        "kms:GenerateDataKey*", "kms:DescribeKey"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AllowAttachmentOfPersistentResources",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": { "Bool": { "kms:GrantIsForAWSResource": "true" } }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `111122223333` | 키 소유 계정 ID |
| `shopmini-key-admin` | 키 관리자 역할 (키를 **사용하지는** 않음) |
| `shopmini-app-role` | 키 사용자 역할 |
| `"Resource": "*"` | **치환하지 마십시오** — 키 정책에서 `*`는 "이 키 자신"을 뜻합니다 |

---

### E-5-02. 관리자/사용자 완전 분리 (계정 루트 위임 없음)

**용도** — 계정 관리자도 키를 쓰지 못하게 합니다. 규제 대상 데이터나 별도 계정의 감사 키에 씁니다.
**주의** — 🔴 **`EnableIAMUserPermissions` 문장이 없습니다. 이 정책에 열거된 주체를 모두 잃으면 키는 영구히 사용 불가가 되고 암호화된 데이터도 함께 잃습니다.** 반드시 ① 두 개 이상의 독립된 관리자 역할을 넣고, ② 그 역할이 삭제되지 않게 E-1-10으로 보호하고, ③ 키 삭제 예약에 알람을 거십시오(17.4). 🧪 **적용 전 격리 계정의 테스트 키로 리허설하십시오.** ⚠️ 세 번째 문장은 부정 연산자 Deny이므로 `aws:PrincipalArn`이 없는 **AWS 서비스 프린시펄 호출까지 막습니다** — 이 키를 통합 서비스(S3·EBS 등)에 붙일 계획이면 `kms:ViaService` 예외를 함께 설계하십시오(E-5-03).
**본문** — 13.4, 13.11, 4.2

```json
{
  "Version": "2012-10-17",
  "Id": "key-policy-shopmini-regulated",
  "Statement": [
    {
      "Sid": "KeyAdministratorsOnly",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::111122223333:role/shopmini-key-admin",
          "arn:aws:iam::111122223333:role/shopmini-key-admin-backup"
        ]
      },
      "Action": [
        "kms:Describe*", "kms:List*", "kms:Get*",
        "kms:PutKeyPolicy", "kms:EnableKeyRotation", "kms:DisableKeyRotation",
        "kms:TagResource", "kms:UntagResource",
        "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CryptoUsersOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-regulated-app" },
      "Action": [
        "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
        "kms:GenerateDataKey*", "kms:DescribeKey"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyAdminsFromUsingTheKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*"],
      "Resource": "*",
      "Condition": {
        "ArnNotEquals": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/shopmini-regulated-app"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-key-admin` / `-backup` | **서로 다른 두 관리자 역할.** 하나만 두면 락아웃 위험 |
| `shopmini-regulated-app` | 유일하게 키를 쓸 워크로드 역할 |

---

### E-5-03. `kms:ViaService` 로 사용 경로 제한

**용도** — 이 키를 **특정 AWS 서비스를 통해서만** 쓸 수 있게 합니다. 자격 증명이 유출돼도 KMS API를 직접 호출해 복호화할 수 없습니다.
**주의** — ⚠️ **`kms:ViaService`는 그 서비스가 사용자를 대신해 KMS를 호출할 때만 요청 컨텍스트에 존재합니다.** 앱이 KMS SDK로 직접 `Decrypt`를 호출하는 경로가 있다면 이 조건 때문에 **조용히 실패**합니다. 서비스 엔드포인트 이름은 **리전이 포함된 형식**(`s3.ap-northeast-2.amazonaws.com`)이므로 리전을 바꾸면 함께 고쳐야 합니다.
**본문** — 13.8, 13.4, 11.2

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KeyUsersViaIntegratedServicesOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
      "Action": [
        "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
        "kms:GenerateDataKey*", "kms:DescribeKey"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": [
            "s3.ap-northeast-2.amazonaws.com",
            "secretsmanager.ap-northeast-2.amazonaws.com",
            "ssm.ap-northeast-2.amazonaws.com"
          ],
          "kms:CallerAccount": "111122223333"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `kms:ViaService` 목록 | 이 키를 쓰는 서비스 엔드포인트. **리전 포함** |
| `kms:CallerAccount` | 호출 계정 ID |

---

### E-5-04. 암호화 컨텍스트 강제

**용도** — 암호화 컨텍스트 없이 이 키를 쓰지 못하게 합니다. 멀티테넌트에서 테넌트 간 복호화를 차단하는 방법입니다.
**주의** — ⚠️ **암호화 컨텍스트는 평문으로 CloudTrail에 기록됩니다** — 개인정보나 비밀을 넣지 마십시오. ⚠️ 통합 서비스(S3·EBS 등)는 **자기가 정한 컨텍스트**를 씁니다(예: S3는 `aws:s3:arn`). 커스텀 키(`tenant`)를 강제하면 그 서비스 경로가 전부 막히므로, 아래처럼 `kms:ViaService`가 존재하는 요청은 예외로 두어야 합니다.
**본문** — 13.9, 13.8

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RequireTenantEncryptionContextForDirectCalls",
      "Effect": "Deny",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "*",
      "Condition": {
        "Null": {
          "kms:EncryptionContext:tenant": "true",
          "kms:ViaService": "true"
        }
      }
    },
    {
      "Sid": "AllowS3ScopedByBucketArnContext",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-role" },
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.ap-northeast-2.amazonaws.com",
          "kms:CallerAccount": "111122223333"
        },
        "StringLike": {
          "kms:EncryptionContext:aws:s3:arn": "arn:aws:s3:::shopmini-uploads/*"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `tenant` | 앱이 쓰는 암호화 컨텍스트 키 이름 |
| `shopmini-uploads` | S3 경로 제한 대상 버킷 |

---

### E-5-05. 크로스 계정 사용 허용

**용도** — 다른 계정의 역할이 이 키로 복호화하게 합니다. 중앙 로그·백업·감사에서 필요합니다.
**주의** — 🔴 **크로스 계정 KMS는 세 곳이 모두 맞아야 통합니다** — ① 이 키 정책, ② 상대 계정 역할의 아이덴티티 정책(E-5-05 하단), ③ 리소스(버킷 등)의 정책. 하나라도 빠지면 `AccessDenied`이고, 에러 메시지만으로는 어느 쪽인지 알기 어렵습니다. ⚠️ `Principal`을 상대 계정 `:root`로 쓰면 **그 계정이 자기 IAM 정책으로 아무 주체에게나 이 키를 열어 줄 수 있습니다** — `kms:CallerAccount` 조건이 그 위험을 계정 단위로 가두는 최소 장치입니다.
**본문** — 13.10, 15.5, 29.4

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSecurityAccountUse",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
      "Action": [
        "kms:Decrypt", "kms:DescribeKey",
        "kms:GenerateDataKeyWithoutPlaintext", "kms:ReEncryptFrom"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "kms:CallerAccount": "444455556666" }
      }
    },
    {
      "Sid": "AllowSecurityAccountGrantsForAWSResources",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": { "Bool": { "kms:GrantIsForAWSResource": "true" } }
    }
  ]
}
```

상대 계정(`444455556666`)의 역할에 붙일 아이덴티티 정책입니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "UseProdAccountKey",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:DescribeKey",
        "kms:GenerateDataKeyWithoutPlaintext",
        "kms:ReEncryptFrom"
      ],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `444455556666` | 키를 빌려 쓸 계정 ID |
| `111122223333` / 키 ID | 키를 소유한 계정과 키 |

---

### E-5-06. 그랜트 위임 제한

**용도** — 통합 서비스가 자기 리소스를 위해 그랜트를 만드는 것만 허용하고, 임의의 주체에게 그랜트를 발급하지 못하게 합니다.
**주의** — 🔴 **`kms:CreateGrant`를 조건 없이 허용하면 키 정책 우회 경로가 됩니다.** 그랜트를 만들 수 있는 주체는 자기 자신이나 제3자에게 키 사용 권한을 발급할 수 있습니다. `kms:GrantIsForAWSResource`(통합 서비스 경유만) 또는 `kms:GranteePrincipal`(특정 수신자만)로 반드시 좁히십시오. ⚠️ 그랜트는 키 정책과 **별도로** 존재하므로, 감사 시 `aws kms list-grants`를 반드시 함께 보십시오.
**본문** — 13.7, 13.11, 16.1

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GrantsOnlyViaIntegratedServices",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-app-instance" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": {
        "Bool": { "kms:GrantIsForAWSResource": "true" },
        "StringEquals": { "kms:ViaService": "ec2.ap-northeast-2.amazonaws.com" }
      }
    },
    {
      "Sid": "NamedGranteeOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-key-admin" },
      "Action": "kms:CreateGrant",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:GranteePrincipal": "arn:aws:iam::111122223333:role/shopmini-batch-role"
        },
        "ForAllValues:StringEquals": {
          "kms:GrantOperations": ["Decrypt", "DescribeKey"]
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-app-instance` | 통합 서비스를 통해 그랜트가 필요한 역할(EBS 등) |
| `shopmini-batch-role` | 명시적으로 그랜트를 받을 수신자 역할 |
| `["Decrypt", "DescribeKey"]` | 허용할 그랜트 작업 목록 |

---

# E-6 기타 리소스 정책 8개

### E-6-01. VPC 엔드포인트 정책 (S3 게이트웨이)

**용도** — 이 엔드포인트를 지나는 요청이 **우리 조직의 리소스에만** 닿게 합니다. 데이터 유출(외부 버킷으로의 업로드) 차단이 목적입니다.
**주의** — 🔴 **엔드포인트 정책의 기본값은 "모두 허용"입니다.** 엔드포인트만 만들고 정책을 그대로 두면 절반만 한 것입니다 — 인스턴스는 여전히 **아무 계정의 버킷으로든** 데이터를 보낼 수 있습니다. ⚠️ AWS 서비스 프린시펄 예외와 AWS가 운영하는 공용 버킷(ECR 레이어, yum 리포지토리 등) 예외를 빠뜨리면 **컨테이너 이미지 풀과 패치가 실패**합니다. ⚠️ 엔드포인트 정책은 **경로 제한**이지 리소스 보호가 아닙니다 — E-4-02와 짝으로 써야 완성됩니다.
**본문** — 20.3, 20.1, 19.6

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrgIdentitiesToOrgResources",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-exampleorgid",
          "aws:ResourceOrgID": "o-exampleorgid"
        }
      }
    },
    {
      "Sid": "AllowAWSServicePrincipals",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:PrincipalIsAWSService": "true" }
      }
    },
    {
      "Sid": "AllowEcrLayerBucket",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::prod-ap-northeast-2-starport-layer-bucket/*"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `o-exampleorgid` | 조직 ID (두 조건 모두) |
| `prod-ap-northeast-2-starport-layer-bucket` | 리전의 ECR 레이어 버킷. 리전을 바꾸면 이름도 바뀝니다 |

---

### E-6-02. SNS 주제 정책

**용도** — 보안 알림 주제에 발행할 수 있는 주체를 CloudWatch·EventBridge와 보안 운영 역할로 한정합니다.
**주의** — 🔴 **`aws:SourceAccount` 없이 서비스 프린시펄만 허용하면 다른 계정의 CloudWatch 알람이 우리 주제로 알림을 밀어 넣을 수 있습니다** — 알람 피로를 유발하는 저비용 공격입니다(30.9). ⚠️ 주제를 KMS로 암호화했다면 **키 정책에도 같은 서비스 프린시펄을 허용**해야 합니다. 이것을 빠뜨리면 알림이 조용히 발행되지 않습니다(30.2).
**본문** — 30.1, 30.2

```json
{
  "Version": "2012-10-17",
  "Id": "shopmini-secops-topic-policy",
  "Statement": [
    {
      "Sid": "AllowCloudWatchAndEventBridgePublish",
      "Effect": "Allow",
      "Principal": {
        "Service": ["cloudwatch.amazonaws.com", "events.amazonaws.com"]
      },
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:ap-northeast-2:444455556666:shopmini-secops-critical",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "444455556666" }
      }
    },
    {
      "Sid": "AllowSecurityAdminManage",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::444455556666:role/SecurityAdmin" },
      "Action": ["sns:Publish", "sns:Subscribe", "sns:SetTopicAttributes"],
      "Resource": "arn:aws:sns:ap-northeast-2:444455556666:shopmini-secops-critical"
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sns:*",
      "Resource": "arn:aws:sns:ap-northeast-2:444455556666:shopmini-secops-critical",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `444455556666` | 주제 소유 계정 ID |
| `shopmini-secops-critical` | 주제 이름 |

---

### E-6-03. SQS 큐 정책

**용도** — S3 이벤트 알림을 받는 큐가 **우리 버킷에서 온 메시지만** 받게 합니다.
**주의** — 🔴 **`"Principal": {"Service": "s3.amazonaws.com"}`만 쓰면 S3를 쓰는 누구든 우리 큐에 메시지를 넣을 수 있습니다**(Confused Deputy). ⚠️ **S3 버킷 ARN에는 계정 ID가 없으므로** `aws:SourceArn`만으로는 부족합니다 — 같은 이름의 버킷을 자기 계정에 만드는 공격이 성립합니다. `aws:SourceAccount`가 반드시 함께 가야 합니다.
**본문** — 24.8, 8.6

```json
{
  "Version": "2012-10-17",
  "Id": "shopmini-ingest-queue-policy",
  "Statement": [
    {
      "Sid": "AllowOnlyOurUploadsBucket",
      "Effect": "Allow",
      "Principal": { "Service": "s3.amazonaws.com" },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:ap-northeast-2:111122223333:shopmini-ingest",
      "Condition": {
        "ArnLike": { "aws:SourceArn": "arn:aws:s3:::shopmini-uploads" },
        "StringEquals": { "aws:SourceAccount": "111122223333" }
      }
    },
    {
      "Sid": "AllowConsumerRoleReceive",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-ingest-worker" },
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:ap-northeast-2:111122223333:shopmini-ingest"
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sqs:*",
      "Resource": "arn:aws:sqs:ap-northeast-2:111122223333:shopmini-ingest",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-ingest` | 큐 이름 |
| `shopmini-uploads` | 이벤트를 보내는 버킷 |
| `shopmini-ingest-worker` | 큐를 소비하는 역할 |

---

### E-6-04. EventBridge 이벤트 버스 정책

**용도** — 조직 안의 계정들이 보안 계정의 중앙 이벤트 버스로 이벤트를 보낼 수 있게 합니다.
**주의** — ⚠️ **`aws:PrincipalOrgID` 조건이 없으면 인터넷의 아무 AWS 계정이나 우리 버스로 이벤트를 밀어 넣을 수 있습니다** — 자동 대응 규칙(35.2)이 붙어 있으면 그것이 곧 원격 트리거가 됩니다. ⚠️ `Principal`을 `"*"`로 두는 것이 이 패턴의 정상 형태이므로, **조건 없이 배포되지 않도록** Access Analyzer의 외부 접근 결과를 반드시 확인하십시오.
**본문** — 24.8, 35.2, 30.5

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrgAccountsToPutSecurityEvents",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "events:PutEvents",
      "Resource": "arn:aws:events:ap-northeast-2:444455556666:event-bus/shopmini-security",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `444455556666` | 중앙 버스를 소유한 보안 계정 |
| `shopmini-security` | 이벤트 버스 이름 |
| `o-exampleorgid` | 조직 ID |

---

### E-6-05. Secrets Manager 리소스 정책

**용도** — 시크릿 **메타데이터**는 감사팀에 열되, **값 읽기**는 조직 밖에서 불가능하게 합니다.
**주의** — ⚠️ **`secretsmanager:DescribeSecret`은 값을 주지 않지만 이름·설명·태그·순환 설정을 노출합니다** — 시크릿 이름에 시스템 구조를 담지 마십시오. ⚠️ 시크릿이 고객 관리 KMS 키로 암호화되어 있으면 **키 정책에도 해당 주체를 허용**해야 값을 읽을 수 있습니다(E-5-03). ⚠️ 두 번째 문장의 `StringNotEquals`는 부정 연산자이므로, `aws:PrincipalOrgID`가 없는 **AWS 서비스 경유 호출까지 막습니다** — 순환 Lambda가 다른 계정에 있다면 이 조건이 순환을 깨뜨립니다.
**본문** — 11.3, 11.5

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSecurityAccountReadOnlyMetadata",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/security-secret-auditor"
      },
      "Action": [
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecretVersionIds"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyValueReadFromOutsideOrg",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "*",
      "Condition": {
        "StringNotEqualsIfExists": {
          "aws:PrincipalOrgID": "o-exampleorgid"
        },
        "BoolIfExists": {
          "aws:PrincipalIsAWSService": "false"
        }
      }
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `444455556666` / `security-secret-auditor` | 메타데이터를 읽을 감사 계정·역할 |
| `o-exampleorgid` | 조직 ID |
| `"Resource": "*"` | **치환하지 마십시오** — 시크릿 리소스 정책에서 `*`는 "이 시크릿 자신" |

---

### E-6-06. Lambda 리소스 정책

**용도** — S3 이벤트가 함수를 호출하되, **우리 계정의 그 버킷에서 온 호출만** 받게 합니다.
**주의** — 🔴 **`--source-arn`과 `--source-account`를 둘 다 주십시오.** S3 버킷 ARN에 계정 ID가 없어 `--source-arn`만으로는 동명 버킷 공격을 막지 못합니다. ⚠️ **함수 URL의 `AuthType: NONE`은 인터넷 전체에 함수 호출을 허용합니다** — 데모로 켜고 잊는 사고가 흔합니다. 기본은 `AWS_IAM`이어야 하고, 공개 API가 필요하면 API Gateway를 앞에 두십시오(E-6-08).
**본문** — 24.6, 8.6

리소스 정책의 문장 형태입니다.

```json
{
  "Version": "2012-10-17",
  "Id": "shopmini-thumbnail-resource-policy",
  "Statement": [
    {
      "Sid": "s3invoke-uploads",
      "Effect": "Allow",
      "Principal": { "Service": "s3.amazonaws.com" },
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:ap-northeast-2:111122223333:function:shopmini-thumbnail",
      "Condition": {
        "ArnLike": { "aws:SourceArn": "arn:aws:s3:::shopmini-uploads" },
        "StringEquals": { "aws:SourceAccount": "111122223333" }
      }
    }
  ]
}
```

실제로는 `add-permission`으로 만듭니다.

```bash
aws lambda add-permission --function-name shopmini-thumbnail \
  --statement-id s3invoke-uploads --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::shopmini-uploads \
  --source-account 111122223333 \
  --profile awssec-lab --region ap-northeast-2
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `shopmini-thumbnail` | 함수 이름 |
| `shopmini-uploads` | 호출 소스 버킷 |
| `s3.amazonaws.com` | 호출 서비스 (`events.amazonaws.com`, `apigateway.amazonaws.com` 등) |

---

### E-6-07. ECR 리포지토리 정책

**용도** — 운영·개발 계정은 이미지를 받기만(pull), 빌드 파이프라인만 올리게(push) 합니다.
**주의** — ⚠️ **푸시 권한을 런타임 계정에 주지 마십시오.** 운영 계정의 역할이 이미지를 덮어쓸 수 있으면 태그 기반 배포가 공급망 공격 경로가 됩니다(27.1). ⚠️ **태그 불변성(Tag Immutability)을 함께 켜십시오** — 정책만으로는 `latest` 태그 덮어쓰기를 막지 못합니다. ⚠️ ECR은 리포지토리 정책 외에 **레지스트리 정책**(복제·풀 스루 캐시용)이 따로 있습니다 — 둘을 혼동하지 마십시오.
**본문** — 24.2, 27.1, 27.5

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowProdAndDevPullOnly",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::111122223333:root",
          "arn:aws:iam::555555555555:root"
        ]
      },
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ]
    },
    {
      "Sid": "AllowBuildPipelinePush",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/shopmini-build-pipeline"
      },
      "Action": [
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:BatchCheckLayerAvailability"
      ]
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `111122223333` / `555555555555` | 이미지를 받을 런타임 계정 |
| `444455556666` / `shopmini-build-pipeline` | 이미지를 올릴 빌드 계정·역할 |
| `Resource` | **넣지 않습니다** — ECR 리포지토리 정책은 자기 리포지토리에만 적용됩니다 |

---

### E-6-08. API Gateway 리소스 정책

**용도** — 프라이빗 API를 지정한 VPC 엔드포인트를 통해서만 호출하게 합니다.
**주의** — 🔴 **Deny 문장이 Allow보다 먼저 오도록 쓰되, 순서가 아니라 존재가 중요합니다** — 명시적 Deny는 항상 Allow를 이깁니다(7.3). Allow 문장이 없으면 프라이빗 API는 아무도 호출할 수 없습니다. ⚠️ **리소스 정책 변경은 API를 재배포(deploy)해야 반영됩니다** — 저장만 하고 반영됐다고 오해하는 실수가 흔합니다. ⚠️ 이 정책은 **인증을 대체하지 않습니다** — 엔드포인트 안에서는 누구나 호출할 수 있으므로 IAM 권한 부여자나 Lambda 권한 부여자가 함께 필요합니다.
**본문** — 24.7, 20.2, 7.3

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsidePrivateEndpoint",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:ap-northeast-2:111122223333:a1b2c3d4e5/*",
      "Condition": {
        "StringNotEquals": {
          "aws:SourceVpce": "vpce-0a1b2c3d4e5f67890"
        }
      }
    },
    {
      "Sid": "AllowInvokeFromPrivateEndpoint",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:ap-northeast-2:111122223333:a1b2c3d4e5/*"
    }
  ]
}
```

**변수**

| 자리표시자 | 무엇으로 |
|---|---|
| `a1b2c3d4e5` | API ID |
| `vpce-0a1b2c3d4e5f67890` | `execute-api` 인터페이스 엔드포인트 ID |
| `111122223333` | API 소유 계정 ID |

---

# E-7 자주 쓰는 조건 키 레퍼런스

## E-7-1 글로벌 조건 키 15선

모든 서비스에서 쓸 수 있는 `aws:` 접두사 조건 키입니다. **다만 "모든 서비스에서 쓸 수 있다"가 "모든 요청에 존재한다"는 뜻은 아닙니다** — 존재 여부 열이 핵심입니다.

| 조건 키 | 타입 | 무엇을 검사 | 언제 존재하지 않는가 (🔴 함정) | 본문 |
|---|---|---|---|---|
| `aws:PrincipalOrgID` | String | 호출 주체가 속한 조직 ID | **AWS 서비스 프린시펄 호출**, 익명 요청. → `StringNotEquals` Deny가 서비스 접근을 막는다 | 7.4, 15.4 |
| `aws:PrincipalOrgPaths` | String(다중) | 주체의 OU 경로 | 위와 동일 | 36.4 |
| `aws:PrincipalArn` | ARN | 호출 주체의 ARN | 익명 요청. 서비스 프린시펄 호출에는 서비스 이름이 들어간다 | 37.2, 7.5 |
| `aws:PrincipalAccount` | String | 주체의 계정 ID | 익명 요청 | 15.5 |
| `aws:PrincipalIsAWSService` | Bool | AWS 서비스가 직접 호출했는가 | 서비스 호출이 아닐 때 **존재하지 않음** → `BoolIfExists` 필수 | 15.4, 37.3 |
| `aws:PrincipalTag/키` | String | 주체(세션)의 태그 값 | 세션 태그가 전달되지 않은 경우 | 8.7 |
| `aws:SourceArn` | ARN | 서비스를 호출하게 만든 **원본 리소스** ARN | 서비스 경유 호출이 아닐 때. **S3 버킷 ARN에는 계정 ID가 없다** | 8.6, 24.8 |
| `aws:SourceAccount` | String | 원본 리소스 소유 계정 | 서비스 경유 호출이 아닐 때 | 8.6 |
| `aws:SourceVpce` | String | 요청이 지난 VPC 엔드포인트 ID | **엔드포인트를 지나지 않은 요청**(콘솔·인터넷) → `IfExists`로 완화 | 15.4, 20.3 |
| `aws:SourceVpc` | String | 요청 출발 VPC ID | 엔드포인트 경유가 아닐 때 | 20.3 |
| `aws:SourceIp` | IP | 요청 **공인** IP | **VPC 엔드포인트 경유 요청에는 존재하지 않는다**(사설 IP라서) | 7.4 함정 1 |
| `aws:SecureTransport` | Bool | TLS로 왔는가 | 사실상 항상 존재 | 15.4, 13.2 |
| `aws:MultiFactorAuthPresent` | Bool | MFA로 인증된 세션인가 | **장기 액세스 키 호출에는 존재하지 않는다** → `BoolIfExists` 필수 | 5.2, 9.4 |
| `aws:RequestedRegion` | String | 요청이 향한 리전 | 항상 존재하지만 **글로벌 서비스는 `us-east-1`로 평가** | 37.2 ④, 37.3 |
| `aws:RequestTag/키` | String | 생성 요청에 담긴 태그 값 | **태그를 생략한 요청, 태그를 지원하지 않는 생성 API** → `Null`과 세트 | 12.3, 37.2 ⑨ |
| `aws:ResourceTag/키` | String | 대상 리소스에 붙은 태그 값 | 태그 없는 리소스, 리소스를 특정하지 않는 `Describe*` 계열 | 8.7 |
| `aws:TagKeys` | String(다중) | 요청에 등장한 태그 **키 목록** | 태그 없는 요청. `ForAllValues`/`ForAnyValue`와 함께 씀 | 7.4, 12.3 |
| `aws:ViaAWSService` | Bool | 다른 AWS 서비스가 주체를 대신해 호출했는가 | 직접 호출일 때 `false`. Deny에서 이 예외를 빼면 서비스 연계가 깨짐 | 7.4 |
| `aws:TokenIssueTime` | Date | 임시 자격 증명이 발급된 시각 | **장기 자격 증명 호출에는 존재하지 않는다.** "오래된 세션 차단"에 쓸 때 `DateLessThanIfExists` 주의 | 8.1, 9.6 |

### 서비스별로 자주 쓰는 것들

| 조건 키 | 어디서 | 쓰임 | 본문 |
|---|---|---|---|
| `s3:prefix` | S3 `ListBucket` **전용** | 접두사 단위 목록 제한. `GetObject`에는 통하지 않음 | 7.1, 15.4 |
| `s3:x-amz-server-side-encryption` | S3 `PutObject` | 암호화 방식 강제. `Null`과 세트 | 15.7 |
| `s3:x-amz-server-side-encryption-aws-kms-key-id` | S3 `PutObject` | KMS 키 고정. **전체 ARN**으로 | 15.7 |
| `s3:ResourceAccount` | S3 | 대상 버킷 소유 계정 제한 | 20.3 |
| `s3:x-amz-acl` | S3 | ACL 헤더 검사(퍼블릭 차단) | 15.2, 15.5 |
| `kms:ViaService` | KMS | **통합 서비스 경유 호출에만 존재.** 직접 SDK 호출은 실패 | 13.8 |
| `kms:CallerAccount` | KMS | 호출자 계정 고정(크로스 계정) | 13.10 |
| `kms:EncryptionContext:키` | KMS | 암호화 컨텍스트 강제. **평문으로 로그에 남음** | 13.9 |
| `kms:GrantIsForAWSResource` | KMS | 통합 서비스가 만드는 그랜트만 허용 | 13.7 |
| `sts:ExternalId` | 신뢰 정책 | 서드파티 Confused Deputy 방지 | 8.6 |
| `iam:PermissionsBoundary` | IAM | 경계 부착 강제 | 7.2 |
| `iam:PassedToService` | IAM `PassRole` | 역할 전달 대상 서비스 고정 | 7.5 |
| `ec2:Encrypted` | EC2 볼륨 생성 | 암호화 강제. `Null: true`와 세트 | 37.2 ⑤ |
| `ec2:CreateAction` | EC2 `CreateTags` | 태깅을 생성 시점으로 한정 | 8.7 |
| `token.actions.githubusercontent.com:sub` | OIDC 신뢰 | 리포지토리·브랜치·환경 고정 | 27.4 |
| `SAML:aud` | SAML 신뢰 | 주장 재사용 방지 | 9.1 |

---

## E-7-2 🔴 연산자 선택 함정

같은 의도의 정책이 연산자 하나로 **정반대 결과**를 냅니다. 37.3의 함정 4를 결정표로 만든 것입니다.

### 판정 원리

요청 컨텍스트에 **조건 키가 없을 때** 조건이 어떻게 평가되는가 — 이것이 전부입니다.

| 조건 형태 | 키가 없을 때 조건은 | `Deny`에 쓰면 | `Allow`에 쓰면 |
|---|---|---|---|
| 긍정 연산자 (`Bool`, `StringEquals`, `ArnLike`) | **미성립(false)** | 차단 안 됨 → **통제에 구멍** | 허용 안 됨 → 안전한 실패 |
| 부정 연산자 (`StringNotEquals`, `ArnNotLike`, `NotIpAddress`) | **성립(true)** | **과잉 차단** → 정상 요청까지 막힘 | 허용됨 → **의도치 않은 개방** |
| `...IfExists` 접미사 | **성립(true)** | 의도적 과잉 차단(안전 방향) | 조건 없이 허용(주의) |
| `Null` 연산자 | 키 부재를 **직접 검사** | 의도대로 | 의도대로 |

🔴 **모든 조건부 Deny를 쓰기 전에 자문하십시오** — "이 액션이 이 조건 키를 지원하지 않으면, 내 정책은 **과소 차단**인가 **과잉 차단**인가?" 과소 차단이면 `Null`을 더하고, 과잉 차단이면 `IfExists`로 완화하거나 서비스 예외를 넣습니다.

### 실전 대조표

| 쓰려는 것 | 틀린 형태 | 무엇이 잘못되나 | 올바른 형태 | 스니펫 |
|---|---|---|---|---|
| MFA 강제 | `Bool: {"aws:MultiFactorAuthPresent": "false"}` | 장기 액세스 키 호출에는 키가 **없어** Deny가 발동하지 않음 → **키만 있으면 MFA 우회** | `BoolIfExists` | E-1-12, E-2-04 |
| 조직 외부 차단 | `StringNotEquals: {"aws:PrincipalOrgID": "..."}` | AWS 서비스 호출에 키가 없어 조건 성립 → **로그 전송·복제가 전부 막힘** | `StringNotEqualsIfExists` + `BoolIfExists: {"aws:PrincipalIsAWSService": "false"}` | E-4-03, E-6-05 |
| VPC 엔드포인트 강제 | `StringNotEquals: {"aws:SourceVpce": "..."}` | 콘솔·AWS 서비스 접근이 전부 차단 | `StringNotEqualsIfExists` + 서비스 예외 + 브레이크 글래스 예외 | E-4-02 |
| EBS 암호화 강제 | `Bool: {"ec2:Encrypted": "false"}` | `Encrypted` 파라미터를 **생략**한 요청이 통과 | `Bool` **+** `Null: {"ec2:Encrypted": "true"}` 두 문장 | E-1-05 |
| S3 KMS 강제 | `StringNotEquals: {"s3:x-amz-server-side-encryption": "aws:kms"}` **단독** | 헤더를 생략한 정상 업로드까지 차단(SCP) 또는 헤더 없는 업로드가 통과(버킷 정책) | `Null` + `StringNotEquals` 두 문장을 목적에 맞게 조합 | E-1-05, E-4-04 |
| 필수 태그 강제 | `StringEquals: {"aws:RequestTag/Owner": "..."}` | 태그를 생략한 요청이 통과 | `Null: {"aws:RequestTag/Owner": "true"}` | E-1-09 |
| IP 제한 | `NotIpAddress: {"aws:SourceIp": [...]}` | **VPC 엔드포인트 경유 요청에 키가 없어** 조건 성립 → 내부 트래픽 차단 | `NotIpAddressIfExists` + `StringNotEqualsIfExists: {"aws:SourceVpce": ...}` 조합 | 7.4 함정 1 |
| 서비스 연결 역할 예외 | (예외 없음) | Auto Scaling·ELB·RDS가 **조용히** 실패 | `ArnNotLike: {"aws:PrincipalArn": "arn:aws:iam::*:role/aws-service-role/*"}` | E-1-04 |
| 다중 값 태그 검사 | `StringEquals: {"aws:TagKeys": [...]}` | 다중 값 키에 단일 값 연산자 — 의도와 다르게 평가 | `ForAllValues:StringEquals`(화이트리스트) / `ForAnyValue:StringEquals`(하나라도 포함) | E-1-09, E-2-07 |

### `ForAllValues` vs `ForAnyValue`

| 접두사 | 뜻 | 쓰는 곳 | 🔴 함정 |
|---|---|---|---|
| `ForAllValues:` | 요청의 **모든** 값이 정책 목록 안에 있어야 참 | 태그 키 화이트리스트 | 요청에 값이 **하나도 없으면 참**입니다 — `Allow`에 단독으로 쓰면 태그 없는 요청이 통과합니다. `Null`과 함께 쓰십시오 |
| `ForAnyValue:` | 요청 값 중 **하나라도** 목록에 있으면 참 | 금지 태그 키 탐지(Deny) | 요청에 값이 없으면 거짓입니다 |

---

## E-8 적용 체크리스트 📋

복사한 정책을 배포하기 전에 이 10개를 확인하십시오.

- [ ] **자리표시자를 전부 치환했다** — 계정 ID·버킷·키 ARN·조직 ID·엔드포인트 ID. 특히 **Deny의 예외 ARN**이 실재하는지 확인 (E-0)
- [ ] `json.loads` 또는 `aws accessanalyzer validate-policy`로 **문법을 검증했다** (7.7)
- [ ] 이 정책의 모든 **액션이 그 조건 키를 지원하는지** 확인했다. 확신 없으면 그 조건을 빼고 Config 규칙으로 옮겼다 (37.3 함정 4)
- [ ] **부정 연산자에 `IfExists`가 필요한지** E-7-2 대조표로 판정했다
- [ ] **AWS 서비스 예외**(`aws:PrincipalIsAWSService`, `aws-service-role/*`)를 넣어야 하는 Deny인지 확인했다 (37.3 함정 2)
- [ ] Deny 정책에 **브레이크 글래스 예외 프린시펄**을 남겼고, 그 역할이 실제로 존재하며 접근 가능하다 (32.4)
- [ ] 크로스 계정이라면 **양쪽 정책 + KMS 키 정책**을 모두 갖췄다 (7.3, 13.10)
- [ ] **격리 계정/테스트 리소스에서 먼저 적용**하고 `simulate-principal-policy`로 확인했다
- [ ] SCP라면 **Sandbox OU → NonProd → 카나리 → 전체** 순서를 지켰고, 0단계 영향 분석(Athena)을 마쳤다 (37.3)
- [ ] **롤백 절차를 문서화**했고, 롤백을 수행할 주체의 접근 경로가 이 정책에 막히지 않는다 (37.3)
