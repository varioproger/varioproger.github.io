---
title: "7장. IAM 정책 작성과 평가 로직"
---

# 7장. IAM 정책 작성과 평가 로직

> **이 장에서 다루는 것**
> - IAM 정책 JSON의 모든 요소 — `Version` · `Statement` · `Sid` · `Effect` · `Action`/`NotAction` · `Resource`/`NotResource` · `Principal`/`NotPrincipal` · `Condition`
> - 정책의 6가지 유형과, 그중 **권한을 줄 수 있는 것과 줄 수 없는 것**의 구분
> - **정책 평가 순서 전체 플로차트** — 명시적 Deny → SCP → RCP → 권한 경계 → 세션 정책 → 아이덴티티/리소스 기반 → 암묵적 Deny. 동일 계정과 크로스 계정에서 어떻게 달라지는가
> - 조건 키와 연산자 — `aws:SourceIp`가 VPC 엔드포인트 경유 요청에 통하지 않는 함정을 포함
> - 실제 사고로 이어지는 **위험한 정책 패턴 10선**과 각각의 안전한 대안 JSON
> - CloudTrail → Access Analyzer 정책 생성 → 마지막 액세스 정보로 **최소 권한을 실제로 만드는 반복 워크플로**
>
> **선행 지식**: 1장(최소 권한·심층 방어), 2장(공동 책임 모델), 6장(IAM 기본 요소·ARN 읽는 법)
> **난이도**: ★★☆

---

6장에서 사용자·그룹·역할·정책의 관계와 ARN 문법을 확보했습니다. 이 장은 그중 **정책** 하나만을 다룹니다.

클라우드에서 IAM 정책은 방화벽 규칙보다 더 근본적인 경계입니다. 네트워크를 완벽하게 격리해도 정책 한 줄이 `"Action": "*"` 이면 그 격리는 의미가 없습니다. 1장의 심층 방어에서 IAM을 **계정 층의 통제**로 배치했지만, 실제로는 IAM이 모든 층을 관통합니다.

> 📖 *AWS Security Cookbook* 1장 「Creating IAM policies」는 이 사실을 정확히 짚습니다. **"IAM 정책은 JSON 문서이며, 액세스 제어 목록(ACL)을 제외한 AWS 내 대부분의 정책 유형이 따르는 구조를 따른다 — ACL은 XML 기반이다."** 즉 이 장에서 문법 하나를 익히면 15장의 버킷 정책, 13장의 키 정책, 37장의 SCP에 그대로 재사용됩니다.

이 장의 진짜 어려운 부분은 문법이 아니라 **평가 로직**입니다. 정책을 쓸 줄 아는 엔지니어는 많지만, "왜 이 요청이 거부되는지" 를 5분 안에 설명할 수 있는 엔지니어는 드뭅니다. 7.3이 그 답입니다.

---

## 7.1 정책 문서 구조

### 최소 형태부터

IAM 정책은 하나의 JSON 객체입니다. 최상위에는 두 개의 필드만 옵니다.

```json
{
  "Version": "2012-10-17",
  "Statement": []
}
```

`Version`은 정책 **언어 버전**이며, 정책 자체의 버전이 아닙니다. 이 값을 빼거나 `"2008-10-17"` 로 쓰면 정책 변수(`${aws:username}`)와 일부 조건 키가 동작하지 않습니다. **항상 `"2012-10-17"` 을 씁니다.**

`Statement`는 문장(statement) 객체의 배열입니다. 단일 문장이면 객체 하나를 바로 넣어도 유효하지만, 처음부터 배열로 쓰는 편이 좋습니다.

> 📖 *AWS Security Cookbook* 1장은 문장의 하위 요소를 이렇게 정리합니다. **"`Sid`는 statement ID이며 선택 요소다. `Effect`는 리소스에 대한 접근을 허용할지 거부할지를 지정하고, 지원되는 값은 `Allow`와 `Deny`다. `Action`은 이 문장이 적용되는 권한을 지정한다. `Resource`는 문장이 적용되는 리소스의 ARN을 지정한다. `Condition`은 정책을 조건부로 실행하게 해준다."**

### 요소별 정리

| 요소 | 필수 | 의미 | 실무 주의점 |
|---|---|---|---|
| `Version` | 사실상 필수 | 정책 언어 버전 | `"2012-10-17"` 고정 |
| `Statement` | 필수 | 문장 배열 | 문장 단위로 Effect가 결정됨 |
| `Sid` | 선택 | 문장 식별자 | **하나의 정책 문서 안에서 유일해야 함.** 감사·리뷰 추적용으로 반드시 의미 있게 붙일 것 |
| `Effect` | 필수 | `Allow` 또는 `Deny` | 다른 값은 없음 |
| `Action` | `NotAction`과 택1 | `서비스:작업` 형식 | `s3:GetObject`. 접두 와일드카드 `s3:Get*` 가능 |
| `NotAction` | `Action`과 택1 | 나열한 작업을 **제외한 전부** | `Allow`와 함께 쓰면 위험 (7.5) |
| `Resource` | 아이덴티티 기반에서 필수 | 대상 리소스 ARN | 서비스에 따라 `*` 만 지원하는 작업도 있음 |
| `NotResource` | `Resource`와 택1 | 나열한 리소스를 제외한 전부 | 신규 리소스가 자동 포함됨 |
| `Principal` | 리소스 기반에서 필수 | 요청 주체 | 아이덴티티 기반 정책에는 **쓸 수 없음** |
| `NotPrincipal` | 선택 | 나열한 주체를 제외한 전부 | `Deny`와 함께만 의미가 있고, 그래도 쓰지 말 것 (7.5) |
| `Condition` | 선택 | 요청 컨텍스트 조건 | 최소 권한의 실질적 도구 (7.4) |

`Principal`이 있느냐 없느냐가 아이덴티티 기반 정책과 리소스 기반 정책을 가르는 결정적 차이입니다.

> 📖 *AWS Security Cookbook* 2장 「Creating an S3 bucket policy」는 이 차이를 명시합니다. **"버킷 정책은 IAM 정책과 같은 JSON 문서 구조를 따르지만, 추가적인 principal 필드를 갖는다. principal은 정책 문장이 적용되는 사용자 또는 엔터티다. IAM 정책에는 principal이 없다 — IAM 사용자에게 부착되기 때문이다. IAM 정책의 경우 그 정책을 실행하는 IAM 사용자가 principal이다."**

`Action`은 `서비스 접두사:작업이름` 형태입니다. 대소문자는 무시되지만 **오타는 무시되지 않습니다** — 존재하지 않는 액션 이름을 써도 정책은 정상 저장되며, 조용히 아무 권한도 주지 않습니다. Access Analyzer 정책 검증(7.7)이 이것을 잡습니다.

### ShopMini 예제: 앱 서버의 S3 접근 정책

CANON의 예제 애플리케이션에서 앱 EC2가 `shopmini-uploads` 버킷에 사용자 업로드를 쓰고 읽는 상황입니다. 필요한 최소 권한만 담은 정책은 다음과 같습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOnlyUploadPrefix",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shopmini-uploads",
      "Condition": {
        "StringLike": {
          "s3:prefix": "incoming/*"
        }
      }
    },
    {
      "Sid": "ReadWriteObjectsUnderIncoming",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::shopmini-uploads/incoming/*",
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    },
    {
      "Sid": "UseAppKmsKeyForUploadsOnly",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.ap-northeast-2.amazonaws.com"
        }
      }
    }
  ]
}
```

이 예제에 이 장의 핵심이 이미 세 개 들어 있습니다.

첫째, **버킷과 객체는 다른 ARN입니다.** `s3:ListBucket`은 버킷 수준 작업이므로 `arn:aws:s3:::shopmini-uploads`(슬래시 없음)를 대상으로 하고, `s3:GetObject`는 객체 수준이므로 `arn:aws:s3:::shopmini-uploads/incoming/*`를 대상으로 합니다. 이 둘을 한 문장에 몰아넣고 `Resource`에 다 나열하면 `s3:ListBucket`이 모든 객체 경로에 부여되어 접두사 제한이 사실상 무력화됩니다.

둘째, **KMS 권한을 잊지 않았습니다.** 버킷이 KMS로 암호화되어 있으면 `kms:Decrypt` 없이 `s3:GetObject`는 `AccessDenied`로 실패합니다(13.4). 그리고 `kms:ViaService` 조건으로 이 키 권한이 S3 경유 요청에만 쓰이도록 좁혔습니다 — 앱 서버가 침해되어도 이 자격 증명으로 임의 데이터를 직접 복호화할 수는 없습니다.

셋째, **`Sid`가 문장이 하는 일을 서술합니다.** 6개월 뒤 이 정책을 리뷰할 사람은 `Statement[1]`이 아니라 `ReadWriteObjectsUnderIncoming`을 읽습니다.

---

## 7.2 정책의 6가지 유형

> 📖 *AWS Security Cookbook* 1장은 정책 유형을 정확히 6종으로 열거합니다. **"AWS 정책의 유형에는 아이덴티티 기반 정책(예: IAM 정책), 리소스 기반 정책(예: S3 버킷 정책과 IAM 역할 신뢰 정책), 권한 경계(permissions boundaries), 조직의 서비스 제어 정책(SCP), ACL, 세션 정책이 있다."**

이 6종을 구분하는 가장 유용한 축은 **"권한을 줄 수 있는가"** 입니다. 실무 사고의 절반은 "권한을 주지 못하는 정책으로 권한을 주려 한" 오해에서 나옵니다.

| 유형 | 적용 대상(부착 위치) | 권한 부여 가능 | 평가 시점·역할 | 대표 용도 |
|---|---|---|---|---|
| **아이덴티티 기반 정책** | IAM 사용자·그룹·역할 | 가능 | 최종 허용 판단의 한쪽 | 앱 역할 권한, 관리자 권한 |
| **리소스 기반 정책** | 리소스 자체 (S3 버킷, KMS 키, SQS 큐, SNS 주제, Lambda 함수, 역할 신뢰 정책) | 가능 (크로스 계정 부여도 가능) | 최종 허용 판단의 다른 한쪽 | 크로스 계정 접근, `AssumeRole` 신뢰 |
| **권한 경계(Permissions Boundary)** | IAM 사용자·역할 | 불가 (상한만 정의) | 아이덴티티 기반 정책과 **교집합** | 위임된 관리자에게 권한 생성 권한을 주면서 상한 고정 |
| **SCP(서비스 제어 정책)** | Organizations 루트·OU·계정 | 불가 | 계정 내 **모든** 주체의 최대 권한 필터 | 리전 제한, CloudTrail 중지 금지 |
| **세션 정책** | `AssumeRole`/`GetFederationToken` 호출 시 인라인 전달 | 불가 | 그 세션에만 적용되는 추가 축소 | 브로커가 발급하는 단기 자격 증명 축소 |
| **ACL** | S3 버킷·객체 (레거시) | 가능 | 별도 경로로 평가 | 사실상 사용 중단 대상 (15.3) |

### 권한 경계와 SCP: "상한"의 두 가지

권한 경계와 SCP는 둘 다 "여기까지" 를 정하는 도구인데, 적용 범위가 다릅니다.

> 📖 *AWS Security Cookbook* 1장은 권한 경계를 이렇게 설명합니다. **"권한 경계는 아이덴티티 기반 정책이 사용자나 역할 같은 IAM 엔터티에 부여할 수 있는 최대 권한을 설정하는 기능이다."** 그리고 SCP에 대해서는 **"SCP는 접근을 거부만 할 수 있고, 허용할 수는 없다"** 고 못을 박습니다.

이 두 문장을 합치면 결론이 나옵니다. **어떤 상한 정책도 권한을 주지 않습니다.** SCP에 `"Effect":"Allow","Action":"*"` 를 넣어도 사용자에게 권한이 생기지 않습니다. SCP의 Allow는 "이 작업이 이 계정에서 허용될 **자격**이 있다" 는 필터일 뿐이고, 실제 부여는 아이덴티티/리소스 기반 정책이 합니다.

> 📖 *AWS Security Cookbook* 1장: **"권한 경계(IAM 기능)와 SCP가 모두 존재하는 경우, 권한 경계와 SCP와 아이덴티티 기반 정책이 **모두** 그 작업을 허용할 때에만 해당 작업이 허용된다."**

즉 세 정책의 **교집합**입니다. ShopMini 팀의 리드 개발자에게 "새 Lambda 실행 역할을 직접 만들 수 있게" 해준다고 합시다. `iam:CreateRole`과 `iam:AttachRolePolicy`를 주면 그 사람은 곧바로 `AdministratorAccess`를 부착한 역할을 만들어 관리자가 될 수 있습니다(7.5의 8번 패턴). 권한 경계가 표준 해법입니다 — **"만드는 모든 역할에 이 권한 경계를 반드시 부착하라"** 는 조건을 걸면, 그가 만드는 역할의 권한은 경계 안으로 갇힙니다.

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

두 번째 문장이 빠지면 첫 번째 문장은 무의미합니다. 경계를 붙여 역할을 만든 뒤 경계를 떼면 되니까요. **권한 경계를 위임 도구로 쓸 때는 경계 제거 권한을 명시적으로 Deny하는 문장이 항상 함께 가야 합니다.**

### 리소스 기반 정책이 특별한 이유

리소스 기반 정책은 6종 중 유일하게 **다른 계정의 주체에게 직접 권한을 줄 수 있습니다.** 아이덴티티 기반 정책은 자기 계정 안에서만 유효하므로, 크로스 계정 접근은 언제나 리소스 기반 정책(또는 역할 신뢰 정책)을 경유합니다.

> 📖 *AWS Security Cookbook* 1장은 리소스 기반 정책을 직접 붙일 수 있는 리소스를 열거합니다. **"일부 서비스는 역할을 프록시로 사용하지 않고도 리소스에 정책을 직접 부착할 수 있게 해준다. 이런 리소스에는 S3 버킷, Glacier 볼트, Amazon SNS 주제, Amazon SQS 큐가 포함된다."**

역할의 **신뢰 정책(Trust Policy)** 도 리소스 기반 정책입니다. 여기서 리소스는 역할 자신이고, `Principal`은 이 역할을 맡을 수 있는 주체입니다(8장).

> 📖 *AWS Security Cookbook* 1장에는 신뢰 정책의 가장 중요한 제약이 한 줄로 적혀 있습니다. **"신뢰 정책의 principal로는 와일드카드(`*`)를 지정할 수 없다."** — 정확히는 지정 자체는 가능하지만, 그것은 "누구든 이 역할을 맡을 수 있다" 를 뜻하며 실무에서는 즉시 사고입니다. 7.5의 3번 패턴입니다.

### ACL: 유일한 예외

ACL은 6종 중 유일하게 JSON이 아니고 XML이며, 조건도 걸 수 없습니다.

> 📖 *AWS Security Cookbook* 2장: **"ACL은 조건부로 접근을 허용하거나 거부할 수 없다. 버킷 정책과 IAM 정책은 조건부로 접근을 허용하거나 거부할 수 있다."**

조건을 걸 수 없다는 것은 최소 권한을 구현할 수 없다는 뜻입니다. 이 장에서는 **6종 중 ACL만은 새로 만들지 않는다** 만 기억하면 됩니다(15.3).

---

## 7.3 🔴 정책 평가 순서 완전 이해

**반드시 이 순서대로 사고하십시오.** 순서를 모르면 "왜 안 되지" 에 답할 수 없고, 더 나쁘게는 "왜 되지" 에도 답할 수 없습니다. 후자가 실제 사고입니다.

### 대전제 두 개

**대전제 1 — 기본값은 거부입니다.** 아무 정책도 없으면 아무것도 할 수 없습니다. 이것이 **암묵적 Deny(implicit deny)** 입니다.

> 📖 *Practical Cloud Security* 2판 1장·4장은 이것을 최소 권한의 실질적 구현으로 설명합니다. **"최소 권한의 실질적 적용은 흔히 접근 정책이 기본적으로 거부(deny by default)임을 의미한다. 즉 사용자에게는 기본적으로 아무런(또는 아주 적은) 권한이 부여되며, 필요한 권한은 요청·승인 절차를 거쳐야 한다."**

**대전제 2 — 명시적 Deny는 무엇도 이기지 못합니다.**

> 📖 *AWS Security Cookbook* 1장: **"동일한 액션과 리소스에 대해 allow와 deny 효과가 함께 있으면, deny가 항상 우선한다."**

이 두 대전제 사이에 나머지 모든 규칙이 들어갑니다.

### 전체 플로차트

동일 계정 내 요청의 평가 순서입니다.

```
                    요청 도착
        (Principal · Action · Resource · Context)
                        │
                        ▼
        ┌───────────────────────────────────┐
        │ ① 적용되는 모든 정책을 수집한다     │
        │   아이덴티티 기반 / 리소스 기반 /   │
        │   권한 경계 / SCP / RCP / 세션 정책 │
        └───────────────┬───────────────────┘
                        ▼
        ┌───────────────────────────────────┐   있음
        │ ② 어느 정책에든 명시적 Deny 가 있는가│──────────┐
        └───────────────┬───────────────────┘          │
                        │ 없음                          │
                        ▼                              │
        ┌───────────────────────────────────┐   불허     │
        │ ③ SCP 가 이 액션을 허용하는가       │──────────┤
        │    (Organizations 계정·OU·루트)    │           │
        └───────────────┬───────────────────┘          │
                        │ 허용                          │
                        ▼                              │
        ┌───────────────────────────────────┐   불허     │
        │ ④ 리소스 제어 정책(RCP) 이         │──────────┤
        │    이 액션을 허용하는가             │           │
        └───────────────┬───────────────────┘          │
                        │ 허용                          │
                        ▼                              │
        ┌───────────────────────────────────┐   허용     │
        │ ⑤ 리소스 기반 정책이 이 주체를      │──────┐   │
        │    직접 지목해 허용하는가           │      │   │
        └───────────────┬───────────────────┘      │   │
                        │ 아니오/없음                │   │
                        ▼                          │   │
        ┌───────────────────────────────────┐  불허 │   │
        │ ⑥ 권한 경계가 허용하는가            │──────┼──▶┤
        │    (경계가 없으면 통과)             │      │   │
        └───────────────┬───────────────────┘      │   │
                        │ 허용                      │   │
                        ▼                          │   │
        ┌───────────────────────────────────┐  불허 │   │
        │ ⑦ 세션 정책이 허용하는가            │──────┼──▶┤
        │    (세션 정책이 없으면 통과)        │      │   │
        └───────────────┬───────────────────┘      │   │
                        │ 허용                      │   │
                        ▼                          │   │
        ┌───────────────────────────────────┐  없음 │   │
        │ ⑧ 아이덴티티 기반 정책에 명시적     │──────┼──▶┤
        │    Allow 가 있는가                 │      │   │  (암묵적 Deny)
        └───────────────┬───────────────────┘      │   │
                        │ 있음                      │   │
                        ▼                          ▼   ▼
                  ┌──────────┐               ┌──────────┐
                  │  ALLOW   │               │   DENY   │
                  └──────────┘               └──────────┘
```

### 각 단계가 실무에서 뜻하는 것

**② 명시적 Deny — 최우선.** SCP·아이덴티티 정책·버킷 정책·권한 경계·세션 정책의 Deny 중 **어느 하나라도** 매칭되면 즉시 끝입니다. 33.3에서 침해 대응 시 "즉시 Deny 정책을 붙여 차단" 이 통하는 이유입니다.

**③ SCP — 계정의 천장.** SCP가 허용하지 않으면 그 계정의 **루트 사용자를 포함해** 아무도 그 작업을 할 수 없습니다. 단, 관리 계정(`123456789012`)에는 SCP가 적용되지 않습니다 — 37.3의 함정입니다.

**④ RCP — 리소스 쪽의 천장.**

> 💡 **원서 이후 변경** — 리소스 제어 정책(Resource Control Policy, RCP)은 원서 3권 집필 이후 Organizations에 추가된 정책 유형입니다. SCP가 "우리 계정의 **주체**가 무엇을 할 수 있는가" 의 상한이라면, RCP는 "우리 계정의 **리소스**에 누가 접근할 수 있는가" 의 상한입니다. 외부 계정에서 들어오는 접근까지 조직 차원에서 차단할 수 있어, 버킷마다 개별 정책으로 막아야 했던 것을 한 번에 강제합니다. 지원 서비스가 제한적이므로 도입 전 현재 목록을 확인해야 합니다(37장).

**⑤ 리소스 기반 정책의 우회 경로 — 가장 오해가 많은 지점.** 동일 계정에서 리소스 기반 정책이 주체를 **직접 지목해** 허용하면, 권한 경계·세션 정책·아이덴티티 기반 정책을 보지 않고 허용이 확정됩니다. "직접 지목" 은 IAM 사용자 ARN이나 역할 세션 ARN을 `Principal`에 명시한 경우이며, 계정 루트(`arn:aws:iam::111122223333:root`)만 적어 계정 전체에 위임한 경우는 해당하지 않습니다 — 그때는 아이덴티티 기반 정책도 함께 허용해야 합니다.

AWS가 문서로 예외를 규정하고 있고 서비스별 차이도 있으므로, 이 우회 경로에 설계를 의존해서는 안 됩니다. **실무 지침: 리소스 기반 정책만으로 권한이 성립하도록 설계하지 말고, 아이덴티티 기반 정책에도 항상 필요한 Allow를 명시하십시오.** 그러면 평가 경로가 어느 쪽이든 결과가 같아지고, 권한 경계·SCP가 의도대로 상한으로 작동합니다.

**⑥⑦ 권한 경계와 세션 정책 — 교집합.** 둘 다 없으면 통과, 있으면 반드시 허용해야 합니다. 세션 정책은 `sts:AssumeRole` 호출 시 `--policy` 또는 `--policy-arns` 로 전달됩니다.

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/ShopMiniReadOnly \
  --role-session-name audit-2026-09 \
  --policy '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::shopmini-uploads/incoming/*"}]}' \
  --profile awssec-lab
```

역할 자체가 버킷 전체 읽기 권한을 갖고 있어도, 이 세션은 `incoming/` 접두사만 읽습니다. 감사자에게 임시 자격 증명을 발급할 때의 표준 패턴입니다.

**⑧ 암묵적 Deny.** 여기까지 왔는데 아이덴티티 기반 Allow가 없으면 거부입니다. 로그에 아무 정책 이름도 남지 않아 디버깅이 가장 어려운 케이스이며, 7.6의 `simulate-principal-policy`가 이것을 잡습니다.

### 🔴 동일 계정 vs 크로스 계정 — 반드시 구분하십시오

**크로스 계정 요청에서는 위 플로차트가 두 번 돌아갑니다.** 그리고 **양쪽 모두 허용해야** 접근이 성립합니다.

| | 동일 계정 | 크로스 계정 |
|---|---|---|
| 필요한 허용 | 아이덴티티 기반 **또는** 리소스 기반 중 하나 (조건에 따라) | 아이덴티티 기반 **그리고** 리소스 기반 **둘 다** |
| 요청 주체 계정에서 평가 | 아이덴티티 기반 정책, 권한 경계, 세션 정책, SCP | 동일 |
| 리소스 계정에서 평가 | 리소스 기반 정책, RCP | 동일 |
| 한쪽만 허용하면 | 성립할 수 있음 | **반드시 거부** |

구체적으로, 보안 계정(`444455556666`)의 감사 역할이 운영 계정(`111122223333`)의 `shopmini-uploads` 버킷을 읽으려면 **네 가지가 모두** 있어야 합니다.

1. `444455556666`의 감사 역할 아이덴티티 기반 정책에 `s3:GetObject` Allow
2. `444455556666`에 적용된 SCP가 `s3:GetObject`를 허용
3. `111122223333`의 버킷 정책에 감사 역할을 `Principal`로 하는 Allow
4. `111122223333`(및 그 OU)의 RCP가 그 접근을 허용

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSecurityAccountAuditRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:role/SecurityAuditRole"
      },
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-exampleorgid"
        },
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    }
  ]
}
```

**이것을 하지 않으면 무엇이 일어나는가.** 크로스 계정 접근이 안 될 때 대부분의 팀이 하는 일은 "일단 넓게 열어보기" 입니다. 버킷 정책의 `Principal`을 `"*"` 로 바꾸고 감사 역할에 `s3:*`을 붙입니다. 접근은 되지만 그 순간 버킷은 인터넷 전체에 열립니다. **양쪽 모두 필요하다는 사실을 모르는 것이 퍼블릭 버킷 사고의 흔한 출발점입니다.** 반대로 이 규칙을 알면 디버깅은 위 4개 항목 체크리스트가 됩니다.

한 가지 예외가 있습니다. **KMS 키와 역할 신뢰 정책은 리소스 기반 정책 쪽이 절대적입니다.** 키 정책이 허용하지 않으면 상대 계정 IAM 정책에 `kms:*`가 있어도 접근할 수 없고(13.4), 신뢰하지 않는 주체는 어떤 아이덴티티 정책으로도 `AssumeRole` 할 수 없습니다.

---

## 7.4 🔴 Condition 키 활용

`Condition` 없는 정책은 최소 권한 정책이 아닙니다. `Action`과 `Resource`만으로는 "어디서·어떤 상태로" 를 표현할 수 없습니다.

### 조건 블록의 구조

```
"Condition": {
   "<연산자>": {
      "<조건 키>": "<값 또는 값 배열>"
   }
}
```

**같은 연산자 블록 안의 여러 키는 AND**, **같은 키의 여러 값은 OR** 입니다. 서로 다른 연산자 블록끼리도 AND입니다. 이 규칙 하나만 정확히 알아도 정책 오독의 절반이 사라집니다.

### 조건 연산자

| 연산자 | 용도 | 예 |
|---|---|---|
| `StringEquals` / `StringNotEquals` | 정확 일치 (대소문자 구분) | `"aws:PrincipalOrgID": "o-exampleorgid"` |
| `StringLike` / `StringNotLike` | 와일드카드 `*` `?` 허용 | `"s3:prefix": "incoming/*"` |
| `Bool` | 참/거짓 | `"aws:SecureTransport": "false"` |
| `IpAddress` / `NotIpAddress` | CIDR 매칭 | `"aws:SourceIp": "203.0.113.0/24"` |
| `ArnLike` / `ArnEquals` | ARN 매칭 (와일드카드 허용) | `"aws:PrincipalArn": "arn:aws:iam::*:role/ShopMini*"` |
| `DateLessThan` / `DateGreaterThan` | 시각 비교 | `"aws:CurrentTime": "2026-12-31T23:59:59Z"` |
| `NumericLessThan` 등 | 숫자 비교 | `"s3:max-keys": "100"` |
| `Null` | 키의 **존재 여부** | `"aws:RequestTag/Project": "false"` (반드시 존재) |

> 📖 *AWS Security Cookbook* 1장의 레시피는 `DateLessThan`과 `aws:EpochTime`으로 만료 시각이 있는 정책을 만듭니다. **"앞의 정책은 현재 EPOCH 타임스탬프가 `aws:EpochTime` 값이 나타내는 EPOCH 타임스탬프보다 작을 때만 접근을 허용한다."** 임시 접근 권한에 유효 기간을 박아 넣는 기법이며, 9.6의 "회수 누락" 을 구조적으로 막는 도구로 다시 나옵니다.

**`...IfExists` 접미사**를 붙이면 "그 키가 요청에 없으면 조건을 통과시킨다" 가 됩니다(`BoolIfExists`, `StringEqualsIfExists` 등). 아래 함정 두 개의 핵심입니다.

### 다중 값 처리: `ForAllValues` / `ForAnyValue`

조건 키가 **여러 값을 갖는** 경우(대표적으로 `aws:TagKeys`, `aws:RequestTag`의 키 집합)에는 세트 연산자가 필요합니다.

- `ForAllValues:StringEquals` — 요청의 **모든** 값이 나열된 목록에 있어야 통과. "허용 목록" 용도.
- `ForAnyValue:StringEquals` — 요청의 값 중 **하나라도** 목록에 있으면 통과. "차단 검사" 용도.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowTaggingOnlyApprovedKeys",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateTags",
        "ec2:DeleteTags"
      ],
      "Resource": "arn:aws:ec2:ap-northeast-2:111122223333:instance/*",
      "Condition": {
        "ForAllValues:StringEquals": {
          "aws:TagKeys": [
            "Project",
            "Chapter",
            "AutoDelete",
            "Owner",
            "DataClass"
          ]
        }
      }
    }
  ]
}
```

⚠️ **`ForAllValues`의 함정**: 요청에 그 키가 아예 없으면 조건은 **참**으로 평가됩니다("모든 값" 이 공집합이므로). 태그 강제(`Deny` 문장)에 `ForAllValues`를 쓰면 태그 없는 요청이 그대로 통과합니다. 강제에는 `Null` 연산자나 `ForAnyValue`를 씁니다(12.3).

### 반드시 알아야 할 글로벌 조건 키

> 📖 *AWS Security Cookbook* 1장은 모든 서비스가 지원하는 사전 정의 조건 키를 열거합니다. **"`aws:CurrentTime`, `aws:EpochTime`, `aws:MultiFactorAuthAge`, `aws:MultiFactorAuthPresent`, `aws:PrincipalOrgID`, `aws:PrincipalArn`, `aws:RequestedRegion`, `aws:SecureTransport`, `aws:UserAgent`."** 4장 「Using key policies with conditional keys」는 여기에 **"`aws:PrincipalTag`, `aws:PrincipalType`, `aws:RequestTag`, `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce`, `aws:TagKeys`, `aws:TokenIssueTime`, `aws:userid`, `aws:username`"** 을 추가합니다.

실무에서 쓰이는 빈도 순으로 정리하면 다음과 같습니다.

| 조건 키 | 무엇을 검사하는가 | 대표 연산자 | 실무 용도 |
|---|---|---|---|
| `aws:PrincipalOrgID` | 요청 주체가 우리 조직 소속인가 | `StringEquals` | 🔴 **모든 리소스 기반 정책의 기본 가드레일.** 계정 하나하나 나열하는 대신 조직 단위로 제한 |
| `aws:SecureTransport` | HTTPS 요청인가 | `Bool` | 🔴 평문 HTTP 거부 |
| `aws:PrincipalArn` | 주체 ARN 패턴 | `ArnLike` | `Principal`에는 와일드카드를 못 쓰지만 이 키로는 가능 |
| `aws:MultiFactorAuthPresent` | MFA로 인증된 세션인가 | `BoolIfExists` | 🔴 민감 작업 MFA 강제 |
| `aws:MultiFactorAuthAge` | MFA 인증 후 경과 초 | `NumericLessThan` | 재인증 강제 |
| `aws:SourceIp` | 요청 **공인 IP** | `IpAddress` | 사무실/VPN 대역 제한 (⚠️ 아래 함정) |
| `aws:SourceVpc` | 요청이 통과한 VPC | `StringEquals` | VPC 엔드포인트 경유 요청 제한 |
| `aws:SourceVpce` | 요청이 통과한 VPC 엔드포인트 ID | `StringEquals` | 20.3의 데이터 유출 차단 |
| `aws:RequestTag/<키>` | **생성 요청에 담긴** 태그 값 | `StringEquals` | 태그 강제 (생성 시점) |
| `aws:ResourceTag/<키>` | **기존 리소스에 붙은** 태그 값 | `StringEquals` | ABAC — 태그 기반 접근 제어 (8.7) |
| `aws:PrincipalTag/<키>` | 주체에 붙은 태그/세션 태그 값 | `StringEquals` | ABAC의 다른 쪽 (8.7) |
| `aws:ViaAWSService` | AWS 서비스가 내 자격 증명으로 대신 호출했는가 | `Bool` | ⚠️ 네트워크 조건과 함께 필수 |
| `aws:RequestedRegion` | 요청 대상 리전 | `StringEquals` | 리전 제한 SCP (4.4, 37.2) |
| `aws:CalledVia` | 어떤 서비스를 경유했는가 | `ForAnyValue:StringEquals` | 특정 서비스 경유만 허용 |
| `aws:PrincipalIsAWSService` | AWS 서비스 주체인가 | `Bool` | 서비스 접근 예외 처리 |

### ⚠️ 함정 1: `aws:SourceIp`는 VPC 엔드포인트 경유 요청에 통하지 않습니다

**사고 시나리오.** ShopMini 팀이 `shopmini-uploads` 버킷을 사무실 IP(`203.0.113.0/24`)와 NAT 게이트웨이 IP에서만 접근하도록 버킷 정책에 `aws:SourceIp` Deny를 걸었습니다. 며칠 뒤 앱 서버가 업로드에 실패합니다. 담당자는 NAT IP와 라우팅을 다시 확인하며 몇 시간을 씁니다.

**원인.** ShopMini 아키텍처에서 앱 서버는 **S3 게이트웨이 VPC 엔드포인트를 경유**해 S3에 접근합니다(20.1). 엔드포인트를 지나는 요청은 인터넷으로 나가지 않으므로 공인 IP가 없고, `aws:SourceIp`는 요청 컨텍스트에 **아예 존재하지 않습니다**. 존재하지 않는 키에 대한 `NotIpAddress` Deny는 매칭되어 요청을 차단합니다.

**올바른 구성.** 네트워크 경계를 조건으로 표현할 때는 **IP와 VPC 경로를 함께** 다루고, AWS 서비스의 대리 호출까지 예외로 빼야 합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAccessOutsideApprovedNetworkPaths",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::shopmini-uploads",
        "arn:aws:s3:::shopmini-uploads/*"
      ],
      "Condition": {
        "NotIpAddressIfExists": {
          "aws:SourceIp": [
            "203.0.113.0/24",
            "198.51.100.7/32"
          ]
        },
        "StringNotEqualsIfExists": {
          "aws:SourceVpce": "vpce-0abc123def4567890"
        },
        "BoolIfExists": {
          "aws:ViaAWSService": "false"
        }
      }
    }
  ]
}
```

세 조건이 **AND** 로 묶여 있으므로, 이 Deny는 "승인된 IP도 아니고 **그리고** 승인된 엔드포인트도 아니고 **그리고** AWS 서비스 대리 호출도 아닌" 요청에만 적용됩니다. `...IfExists`가 세 곳 모두에 붙은 것이 핵심입니다.

⚠️ **`aws:ViaAWSService`를 빼면 무엇이 깨지는가.** CloudFront의 오리진 조회, S3 복제, Athena 결과 쓰기는 서비스가 우리 주체의 권한으로 대신 수행합니다(forward access session). 네트워크 조건만 걸면 이들이 전부 차단되어 배포·복제·분석이 동시에 멈춥니다. "IP 제한을 걸었더니 서비스가 죽었다" 의 실제 원인입니다.

### ⚠️ 함정 2: MFA 조건에 `Bool`을 쓰면 Deny가 통과합니다

`aws:MultiFactorAuthPresent`는 **장기 액세스 키로 만든 요청에는 존재하지 않습니다.** 따라서 다음 정책은 의도와 정반대로 동작합니다.

```json
{
  "Sid": "BROKEN_DoNotUse",
  "Effect": "Deny",
  "Action": "s3:DeleteObject",
  "Resource": "*",
  "Condition": {
    "Bool": {
      "aws:MultiFactorAuthPresent": "false"
    }
  }
}
```

키가 없으면 `Bool` 조건은 매칭되지 않고 Deny도 적용되지 않습니다. **결과: MFA를 쓰는 콘솔 사용자만 막히고, 액세스 키를 쓰는 스크립트는 자유롭게 삭제합니다.** 반드시 `BoolIfExists`를 씁니다.

```json
{
  "Sid": "RequireMfaForDestructiveActions",
  "Effect": "Deny",
  "Action": [
    "s3:DeleteObject",
    "s3:DeleteBucket",
    "kms:ScheduleKeyDeletion"
  ],
  "Resource": "*",
  "Condition": {
    "BoolIfExists": {
      "aws:MultiFactorAuthPresent": "false"
    }
  }
}
```

⚠️ 이 문장을 SCP나 광범위한 경계 정책에 넣을 때는 **워크로드 역할이 함께 막히지 않는지** 확인하십시오 — EC2 인스턴스 프로파일과 Lambda 실행 역할은 MFA를 쓸 수 없습니다. `aws:PrincipalArn`으로 예외 처리하거나, 사람 주체에만 적용되는 경계에 배치합니다.

---

## 7.5 ⚠️ 위험한 정책 패턴 10선

각 패턴은 **사고 시나리오 → 원인 → 올바른 구성** 으로 읽으십시오.

| # | 위험 패턴 | 왜 위험한가 | 안전한 대안 |
|---|---|---|---|
| 1 | `"Action":"*"` + `"Resource":"*"` (Allow) | 자격 증명 하나가 계정 전체 — 침해 시 폭발 반경 = 계정 전체 | 7.6 워크플로로 축소 + SCP로 파괴 작업 Deny (아래 `ProtectSecurityBaseline`) |
| 2 | `iam:PassRole`의 `"Resource":"*"` | 계정 최강 역할을 서비스에 넘겨 관리자 획득 | 역할 ARN 접두사 제한 + `iam:PassedToService` (아래 `PassOnlyAppRolesAndOnlyToLambda`) |
| 3 | 신뢰 정책의 `"Principal":{"AWS":"*"}` | 인터넷 전체가 역할을 맡을 수 있음 | 정확한 주체 ARN 명시 (아래 `TrustWorkloadRoleInOrgOnly`) |
| 4 | 신뢰 정책에 상대 계정 root만, 조건 없음 | 상대 계정의 **모든** 주체가 진입 — 혼동된 대리자 | `sts:ExternalId` 조건 (아래 `TrustVendorWithExternalId`, 8.6) |
| 5 | `Allow` + `NotAction` | 앞으로 출시될 모든 서비스가 자동 허용 | 필요한 `Action`을 열거. `NotAction`은 `Deny`에서만 |
| 6 | `Deny` + `NotPrincipal` | 평가가 직관과 달라 실수 시 전면 개방 | `Deny` + `ArnNotLike`/`StringNotEquals` 조건으로 대체 |
| 7 | 리소스 기반 정책의 `"Principal":"*"` + 조건 없음 | 익명 공개 — 퍼블릭 버킷 유출 | 주체 ARN 명시 + `aws:PrincipalOrgID` (7.3 `AllowSecurityAccountAuditRead`) |
| 8 | IAM 자체 변경 권한(`iam:PutRolePolicy` 등) 부여 | 스스로 권한을 늘려 관리자로 상승 | 권한 경계 강제 + 경계 제거 Deny (7.2 `AllowRoleCreationOnlyWithBoundary`) |
| 9 | `aws:SourceIp` **단독** 의존 | 엔드포인트·서비스 경유 우회 또는 오차단 | `aws:SourceVpce` + `aws:ViaAWSService` 병기 (7.4 `DenyAccessOutsideApprovedNetworkPaths`) |
| 10 | 권한 경계 없는 IAM 위임 | 역할 생성 권한 = 관리자 권한 | 8번과 동일 — 경계 강제 조건 없이는 `iam:CreateRole`을 주지 않는다 |

이하 위험도가 높고 오해가 많은 것들을 상세히 다룹니다.

### 패턴 1·8·10: 관리자 권한의 세 가지 얼굴

**사고 시나리오.** ShopMini 개발팀의 CI/CD 역할에 `AdministratorAccess`가 붙어 있습니다. 빌드 스크립트가 내려받은 오픈소스 의존성 중 하나가 침해되었고, 공격자는 빌드 러너 안에서 인스턴스 메타데이터를 읽어 CI 역할의 임시 자격 증명을 획득한 뒤 몇 분 안에 백업 볼트를 지우고 CloudTrail을 멈춥니다.

**원인.** `"Action":"*"`, `"Resource":"*"` 는 "지금 필요한 게 뭔지 모르겠으니 일단 다 주자" 의 결과이며, 27.6의 "CI/CD 파이프라인이 최고 권한을 갖는 문제" 의 정확한 형태입니다. 여기에 8번과 10번이 결합하면 더 나빠집니다 — 관리자 권한을 직접 주지 않았더라도 `iam:CreateRole` + `iam:AttachRolePolicy` 조합이 있으면 스스로 관리자 역할을 만들어 맡을 수 있습니다. **IAM 변경 권한은 그 자체로 관리자 권한과 등가입니다.**

**올바른 구성.** 위임이 필요하면 권한 경계를 강제하고(7.2), 워크로드 역할은 7.6의 워크플로로 좁힙니다. 조직 차원에서는 SCP로 되돌릴 수 없는 파괴 작업을 못 박습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProtectSecurityBaseline",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail",
        "guardduty:DeleteDetector",
        "guardduty:UpdateDetector",
        "config:DeleteConfigurationRecorder",
        "config:StopConfigurationRecorder",
        "iam:DeleteRolePermissionsBoundary"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/OrgSecurityBreakGlass"
        }
      }
    }
  ]
}
```

> 📖 *AWS Security Cookbook* 1장은 SCP의 첫 예제로 정확히 `cloudtrail:StopLogging` 거부를 제시합니다. **"`"Effect": "Deny", "Action": "cloudtrail:StopLogging", "Resource": "*"`"** — 로그를 끌 수 없게 만드는 것이 SCP의 교과서적 첫 용도입니다. 29장과 37.2에서 확장합니다.

### 패턴 2: `iam:PassRole`의 무제한 허용

**사고 시나리오.** 개발자에게 `lambda:CreateFunction`과 `iam:PassRole`을 `"Resource":"*"` 로 주었습니다. 개발자는(또는 그 자격 증명을 얻은 공격자는) 계정에 존재하는 관리자 역할을 자기 Lambda 함수의 실행 역할로 지정하고, 그 함수 안에서 무엇이든 합니다.

**원인.** `iam:PassRole`은 "역할을 서비스에 넘길 수 있는 권한" 입니다. 넘길 수 있는 역할을 제한하지 않으면 **계정 안의 가장 강한 역할이 곧 그 사람의 권한 상한이 됩니다.** `ec2:RunInstances`, ECS 태스크, CodeBuild, Glue 등 역할을 받는 모든 서비스에 같은 문제가 있습니다.

**올바른 구성.** 넘길 수 있는 역할을 ARN 접두사로 좁히고, `iam:PassedToService`로 받는 서비스까지 고정합니다.

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

### 패턴 3·4·7: `*` Principal의 세 변형

**사고 시나리오.** 서드파티 모니터링 SaaS를 도입하며 벤더용 역할을 급히 만듭니다. 벤더 계정 ID를 몰라 `"AWS": "*"` 를 넣고, 읽기 전용 권한만 붙였으니 괜찮다고 생각합니다. 몇 달 뒤 GuardDuty가 처음 보는 계정에서의 `AssumeRole` 성공을 알립니다. 읽힌 것에는 태그·구성·리소스 목록 전체가 포함되어 있었습니다.

**원인.** 신뢰 정책의 `Principal`은 "이 역할을 맡을 자격이 있는 자" 이고 `"*"` 는 인터넷 전체입니다. 4번 변형은 더 미묘합니다 — 벤더 계정의 root만 적으면 벤더 계정의 **모든** 사용자와 역할이 진입할 수 있고, 벤더의 다른 고객이 우리 역할을 지목하도록 벤더를 속이는 혼동된 대리자 공격이 성립합니다(8.6).

**올바른 구성.** 신뢰 정책에는 항상 조건을 붙입니다. 서드파티에는 External ID, 조직 내부에는 `aws:PrincipalOrgID`입니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TrustVendorWithExternalId",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::444455556666:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "shopmini-prod-7f3c9a1e"
        }
      }
    },
    {
      "Sid": "TrustWorkloadRoleInOrgOnly",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::555555555555:role/shopmini-ci-deployer"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-exampleorgid"
        }
      }
    }
  ]
}
```

7번(리소스 기반 정책의 `"Principal":"*"`)은 S3에서 가장 자주 나타납니다. ShopMini의 `shopmini-assets`는 CloudFront 오리진이므로 OAC로 CloudFront만 접근하게 해야 하며(23.7), 익명 공개는 필요 없습니다. **`"Principal":"*"` 를 쓸 때는 계정 수준 퍼블릭 액세스 차단 상태와 그 예외의 문서 승인 여부 두 가지를 확인하십시오**(15.2).

### 패턴 5·6: `NotAction`과 `NotPrincipal`

`NotAction`은 "나열한 것을 제외한 전부" 입니다.

> 📖 *AWS Security Cookbook* 1장: **"`NotAction`은 지정된 액션 목록을 제외한다. `NotPrincipal` 정책 요소는 접근을 거부할 주체 엔터티를 나타낸다."**

**`Deny` + `NotAction`은 유용합니다.** 4.4의 리전 제한 SCP가 그 예입니다 — "승인된 리전 밖의 모든 작업을 거부하되 글로벌 서비스는 제외" 에 이 조합이 필요합니다.

**`Allow` + `NotAction`은 시간 폭탄입니다.** "IAM 빼고 다 허용" 이라고 쓰면 그 정책은 **AWS가 앞으로 출시할 모든 서비스의 모든 액션을 자동으로 허용합니다.** 정책을 쓴 시점에 없던 서비스가 6개월 뒤 데이터 유출 경로가 됩니다. 허용은 언제나 `Action`으로 필요한 것을 열거해 씁니다.

`NotPrincipal`은 더 단순합니다 — **쓰지 마십시오.** 평가가 직관과 다르게 동작하는 경우가 많고 실수 한 번이 전면 개방으로 이어집니다. 같은 목적은 `Deny` + `Condition`의 `ArnNotLike`/`StringNotEquals`로 더 안전하게 표현됩니다(위 `ProtectSecurityBaseline` SCP).

---

## 7.6 최소 권한 정책을 실제로 만드는 방법

이 절은 **"그 정책을 어떻게 만드는가"** 입니다. 답은 하나입니다 — **처음부터 정확하게 쓰려 하지 말고, 넓게 시작해서 데이터로 좁힙니다.**

> 📖 *Practical Cloud Security* 2판 1장은 최소 권한이 자동화까지 포함하는 원칙임을 강조합니다. **"최소 권한 원칙은 사람이나 자동화 도구가 자기 일을 하는 데 필요한 것만 접근할 수 있어야 한다고 말한다. 자동화 부분을 잊기 쉽다 — 예를 들어 데이터베이스에 접근하는 컴포넌트는, 쓰기 접근이 필요하지 않다면 데이터베이스 쓰기를 허용하는 자격 증명을 사용해서는 안 된다."**

사람의 권한은 요청·승인 절차로 관리되지만, 워크로드 역할의 권한은 아무도 요청하지 않습니다. 개발자가 `AdministratorAccess`를 붙여 배포를 성공시키고 그 상태로 3년이 갑니다. 아래 워크플로는 그 3년을 되돌리는 절차입니다.

### 4단계 반복 축소 워크플로

```
[1] 넓게 시작 ─▶ [2] CloudTrail로 실제 사용 관측 ─▶ [3] 정책 생성/축소 ─▶ [4] 검증
        ▲                                                                    │
        └────────────────── 실패한 액션이 있으면 되돌림 ◀────────────────────┘
```

**1단계 — 넓게 시작하되 기간을 정합니다.** 신규 워크로드는 `PowerUserAccess` 같은 넓은 관리형 정책으로 시작할 수 있지만, **"N일 뒤 좁힌다" 를 티켓으로 등록하고 정책 이름이나 태그에 만료일을 적습니다.** 7.4의 `DateLessThan` + `aws:CurrentTime` 조건을 넣어 정책 자체가 만료되게 만드는 방법이 가장 확실합니다.

**2단계 — 마지막 액세스 정보로 큰 덩어리를 잘라냅니다.** 서비스 단위로 "쓴 적 없는 권한" 을 찾는 것이 가장 빠릅니다.

```bash
# 역할이 실제로 접근한 서비스와 마지막 접근 시각을 조회 (비동기 작업)
JOB_ID=$(aws iam generate-service-last-accessed-details \
  --arn arn:aws:iam::111122223333:role/shopmini-app-role \
  --granularity ACTION_LEVEL \
  --profile awssec-lab \
  --query JobId --output text)

# 결과 조회 — LastAuthenticated 가 비어 있는 서비스는 한 번도 사용되지 않았다
aws iam get-service-last-accessed-details \
  --job-id "$JOB_ID" \
  --profile awssec-lab \
  --query 'ServicesLastAccessed[?LastAuthenticated==null].[ServiceName,ServiceNamespace]' \
  --output table
```

`--granularity ACTION_LEVEL`을 주면 지원 서비스에 대해 액션 단위까지 내려갑니다. **여기서 나오는 미사용 서비스 목록이 첫 축소분입니다.** 관리형 정책 `PowerUserAccess`를 떼고, 사용된 서비스만 담은 고객 관리형 정책으로 교체합니다.

**3단계 — Access Analyzer로 CloudTrail 로그에서 정책을 생성합니다.** 지정한 기간의 CloudTrail 이벤트를 읽어 해당 주체가 실제 호출한 액션만으로 정책 JSON을 만들어주는, 가장 정밀한 도구입니다.

```bash
# 조직 트레일이 있는 로그 계정의 트레일을 읽어 정책 생성
aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn":"arn:aws:iam::111122223333:role/shopmini-app-role"}' \
  --cloud-trail-details '{
      "trails": [{
        "cloudTrailArn": "arn:aws:cloudtrail:ap-northeast-2:777788889999:trail/org-trail",
        "regions": ["ap-northeast-2"],
        "allRegions": false
      }],
      "accessRole": "arn:aws:iam::111122223333:role/AccessAnalyzerPolicyGenerationRole",
      "startTime": "2026-08-01T00:00:00Z",
      "endTime": "2026-08-31T23:59:59Z"
    }' \
  --profile awssec-lab

# 반환된 jobId 로 결과 조회
aws accessanalyzer get-generated-policy \
  --job-id 00000000-1111-2222-3333-444444444444 \
  --include-service-level-template \
  --profile awssec-lab
```

⚠️ **생성된 정책을 그대로 붙이지 마십시오.** 관측 기간에 일어나지 않은 작업 — 월말 배치, 분기 리포트, 재해 복구 절차, 예외 처리 경로 — 은 정책에 들어가지 않습니다. **최소 한 번의 완전한 업무 주기(보통 한 달, 분기 작업이 있으면 한 분기)를 포함하는 기간을 잡고**, 생성된 정책을 리뷰해 알려진 비정기 작업을 손으로 추가합니다. 또한 생성 결과의 `Resource`는 대부분 `*` 로 나오므로, ARN 접두사와 태그 조건(`aws:ResourceTag`)으로 좁히는 것이 이 단계의 실제 작업입니다.

**4단계 — 배포 전에 시뮬레이션합니다.**

```bash
# 특정 주체의 현재 권한으로 액션이 허용되는지 평가
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/shopmini-app-role \
  --action-names s3:PutObject s3:GetObject kms:Decrypt \
  --resource-arns arn:aws:s3:::shopmini-uploads/incoming/test.jpg \
  --profile awssec-lab \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' \
  --output table

# 아직 부착하지 않은 정책 JSON 을 대상으로 평가
aws iam simulate-custom-policy \
  --policy-input-list file://candidate-policy.json \
  --action-names s3:DeleteObject \
  --resource-arns arn:aws:s3:::shopmini-uploads/incoming/test.jpg \
  --profile awssec-lab
```

⚠️ `simulate-*` 는 SCP와 일부 리소스 기반 정책의 효과를 완전히 반영하지 않습니다. **"시뮬레이션에서 허용" 은 "실제로 허용" 을 보장하지 않습니다.** 최종 확인은 개발 계정(`555555555555`)에서 실제 호출로 합니다.

**되돌림 장치.** 좁힌 정책을 운영에 넣을 때는 CloudTrail의 `AccessDenied` 이벤트에 EventBridge 규칙을 걸어 알림을 받도록 준비합니다(30.5). 축소 후 며칠간 `AccessDenied`가 늘어나는지 보는 것이 가장 정직한 검증입니다.

---

## 7.7 IAM Access Analyzer

Access Analyzer는 7.6의 정책 생성 외에도 세 가지 일을 더 합니다. 각각 다른 질문에 답합니다.

> 📖 *AWS Security Cookbook* 10장은 Access Analyzer를 Security Hub와 연동되는 서비스로 소개하며 그 동작 원리를 짚습니다. **"IAM Access Analyzer는 논리 기반 추론(logic-based reasoning)을 사용해 우리 AWS 환경의 리소스 기반 정책을 분석하여, 우리 계정의 어떤 리소스가 외부 주체와 공유되고 있는지 알려준다."**

"논리 기반 추론" 은 로그가 아니라 **정책 문서 자체를 수학적으로 분석한다** 는 뜻입니다. 그래서 "아직 아무도 접근하지 않았지만 접근 가능한" 노출도 찾아냅니다 — 실제 행위를 보는 GuardDuty와 성격이 완전히 다릅니다.

| 기능 | 답하는 질문 | 분석 대상 | 유형/명령 |
|---|---|---|---|
| **외부 접근 분석기** | 우리 리소스가 신뢰 영역 밖에 열려 있는가 | 리소스 기반 정책 | `--type ACCOUNT` / `ORGANIZATION` |
| **미사용 액세스 분석기** | 부여했지만 쓰지 않는 권한·자격 증명은 무엇인가 | IAM 사용자·역할 활동 | `--type ACCOUNT_UNUSED_ACCESS` |
| **정책 검증** | 이 정책 문서에 오류·경고·보안 문제가 있는가 | 정책 JSON | `validate-policy` |
| **커스텀 정책 검사** | 이 정책 변경이 새 접근을 만드는가 | 정책 JSON 두 개 비교 | `check-no-new-access` 등 |

### 외부 접근 분석기 — 신뢰 영역(Zone of Trust)이 핵심

```bash
# 조직 전체를 신뢰 영역으로 하는 분석기 (위임 관리자 계정에서)
aws accessanalyzer create-analyzer \
  --analyzer-name shopmini-external-access \
  --type ORGANIZATION \
  --tags Project=awssec-lab,Chapter=ch07 \
  --profile awssec-lab

# 활성 결과 조회 — 조직 밖으로 열린 리소스만 나온다
aws accessanalyzer list-findings-v2 \
  --analyzer-arn arn:aws:access-analyzer:ap-northeast-2:444455556666:analyzer/shopmini-external-access \
  --filter '{"status":{"eq":["ACTIVE"]}}' \
  --profile awssec-lab
```

🔴 **`--type`을 `ACCOUNT`로 만들면 신뢰 영역이 계정 하나입니다.** 조직 내 다른 계정에서의 정당한 접근도 "외부 접근" 으로 보고되어 결과가 노이즈로 가득 차고, 30.9의 알람 피로가 즉시 발생합니다. 멀티 계정 환경에서는 **보안 도구 계정(`444455556666`)을 위임 관리자로 지정하고 `ORGANIZATION` 분석기를 하나 만드는 것이 정답입니다.**

### 미사용 액세스 분석기

> 💡 **원서 이후 변경** — 미사용 액세스 분석기는 원서 집필 이후 추가된 기능입니다. `unusedAccessAge`로 지정한 일수 동안 사용되지 않은 역할, 액세스 키, 비밀번호, 그리고 **부여했지만 호출되지 않은 개별 권한**을 결과로 올려줍니다. 7.6의 `generate-service-last-accessed-details`를 계정 전체에 대해 상시로 돌리는 것과 같은 효과이며, Security Hub로 결과가 흘러갑니다.

```bash
aws accessanalyzer create-analyzer \
  --analyzer-name shopmini-unused-access \
  --type ACCOUNT_UNUSED_ACCESS \
  --configuration '{"unusedAccess":{"unusedAccessAge":90}}' \
  --profile awssec-lab
```

90일은 시작점입니다. 분기 배치가 있는 워크로드라면 100일 이상으로 잡아야 정상 권한이 미사용으로 잡히지 않습니다.

### 정책 검증 — 저장 전에 돌리십시오

```bash
aws accessanalyzer validate-policy \
  --policy-type IDENTITY_POLICY \
  --policy-document file://candidate-policy.json \
  --profile awssec-lab \
  --query 'findings[].[findingType,issueCode,findingDetails]' \
  --output table
```

`--policy-type`은 `IDENTITY_POLICY`, `RESOURCE_POLICY`, `SERVICE_CONTROL_POLICY`, `RESOURCE_CONTROL_POLICY` 중 하나이며, 결과는 `ERROR`(문법·존재하지 않는 액션), `SECURITY_WARNING`(권한 상승 가능 등), `WARNING`, `SUGGESTION` 으로 분류됩니다.

🔴 **`ERROR`가 하나라도 있으면 배포하지 마십시오.** 7.1의 "오타 난 액션 이름은 조용히 아무 권한도 주지 않는다" 문제를 여기서 잡습니다. `SECURITY_WARNING`은 7.5의 패턴들을 상당 부분 자동으로 찾아냅니다.

### 커스텀 정책 검사 — 파이프라인 게이트

> 💡 **원서 이후 변경** — 커스텀 정책 검사(custom policy checks)도 원서 이후 기능입니다. 정책 변경이 **새로운 접근을 추가하는지** 를 배포 전에 판정할 수 있어, 28.3의 "배포 전 정책 게이트" 를 IAM 정책에 대해 구현하는 표준 수단입니다.

```bash
# 변경 후 정책이 변경 전보다 넓어졌는지 판정 (PASS / FAIL)
aws accessanalyzer check-no-new-access \
  --existing-policy-document file://policy-current.json \
  --new-policy-document file://policy-proposed.json \
  --policy-type IDENTITY_POLICY \
  --profile awssec-lab

# 지정한 액션이 이 정책으로 부여되지 않는지 판정
aws accessanalyzer check-access-not-granted \
  --policy-document file://policy-proposed.json \
  --access '[{"actions":["s3:DeleteBucket","cloudtrail:StopLogging"]}]' \
  --policy-type IDENTITY_POLICY \
  --profile awssec-lab

# 버킷 정책이 퍼블릭 접근을 허용하지 않는지 판정
aws accessanalyzer check-no-public-access \
  --policy-document file://bucket-policy.json \
  --resource-type AWS::S3::Bucket \
  --profile awssec-lab
```

이 세 명령을 PR 파이프라인에 넣으면 7.5의 위험 패턴 중 1·2·7·8번이 머지 전에 걸립니다. **정책 리뷰를 사람의 눈에만 맡기지 마십시오.**

---

## 7.8 🧪 실습: 비주얼 에디터와 CLI로 정책 만들기

*AWS Security Cookbook* 1장 「Creating IAM policies」의 레시피를 CANON 리소스로 재구성한 실습입니다. 정책을 **콘솔 비주얼 에디터**와 **CLI** 두 경로로 만들어 결과 JSON을 비교하고, 검증까지 돌려봅니다.

### 준비

- 관리자 권한 프로파일 `awssec-lab` (CANON 실습 규약)
- 권한이 없는 테스트용 IAM 사용자와 그룹: `shopmini-labuser`, `shopmini-labgroup`
- S3 버킷 `shopmini-uploads` (없으면 생성)
- 리전 `ap-northeast-2`

원서 레시피는 시작 전 권한이 없는 상태를 먼저 확인합니다. 생략하면 "정책이 효과가 있었는지" 를 알 수 없습니다.

```bash
# 실패해야 정상 — AccessDenied 를 확인한다
aws s3 ls s3://shopmini-uploads --profile shopmini-labuser
```

### 파트 A — 비주얼 에디터로 만들기

> 📖 *AWS Security Cookbook* 1장의 절차를 요약하면 다음과 같습니다. **"관리자로 콘솔에 로그인해 IAM 대시보드로 이동한다 → 왼쪽 사이드바에서 Policies를 클릭한다 → Create Policy를 클릭한다(비주얼 에디터가 나온다) → Service를 S3로 설정한다 → Actions에서 ListBucket을 선택한다 → Resources에서 Specific을 선택하고 Add ARN을 클릭해 버킷 ARN을 입력한다 → Request conditions에서 Add condition을 클릭해 조건을 추가한다 → Review Policy → 이름과 설명을 넣고 Create Policy."** 저자는 **"이미 정책 JSON을 만들어 두었다면 JSON 탭을 클릭해 JSON을 직접 입력할 수도 있다"** 고 덧붙입니다.

1. IAM 콘솔 → **정책** → **정책 생성**
2. **서비스**: S3
3. **작업**: `ListBucket` 선택 (읽기 범주에 있습니다)
4. **리소스** → **특정** → **ARN 추가** → 버킷 이름 `shopmini-uploads` 입력
   - 여기서 콘솔이 만들어주는 ARN이 `arn:aws:s3:::shopmini-uploads`(슬래시 없음)임을 확인하십시오. 7.1에서 다룬 버킷/객체 ARN 구분이 화면에 나타나는 지점입니다.
5. **요청 조건** → **조건 추가**
   - 조건 키: `aws:SecureTransport`, 연산자: `Bool`, 값: `true`
6. **JSON 탭**을 눌러 생성된 문서를 확인합니다. 아래와 같아야 합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ShopMiniListUploadsOverTls",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shopmini-uploads",
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    }
  ]
}
```

7. 이름 `ShopMiniListUploadsConsole`, 설명을 넣고 생성합니다.
8. **사용자 그룹** → `shopmini-labgroup` → **권한** → 이 정책을 연결합니다.

> 📖 원서는 그룹에 붙인 뒤 CLI로 검증하도록 안내합니다. **"testuser 프로파일 이름으로 커맨드 라인에서 `s3 ls` 명령을 실행해 검증한다. 성공 응답을 볼 수 있어야 한다."**

```bash
aws s3 ls s3://shopmini-uploads --profile shopmini-labuser
```

### 파트 B — CLI로 같은 정책 만들기

먼저 파트 A의 정책을 그룹에서 분리하고, 다시 접근이 막히는 것을 확인한 뒤 진행합니다.

```bash
aws iam detach-group-policy \
  --group-name shopmini-labgroup \
  --policy-arn arn:aws:iam::111122223333:policy/ShopMiniListUploadsConsole \
  --profile awssec-lab
```

정책 파일을 만듭니다. 파트 A와 달리 객체 읽기 권한과 접두사 제한을 함께 넣어 7.1의 두 문장 구조를 확인합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListIncomingPrefixOnly",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shopmini-uploads",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "incoming/",
            "incoming/*"
          ]
        },
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    },
    {
      "Sid": "GetObjectsUnderIncomingOnly",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shopmini-uploads/incoming/*",
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    }
  ]
}
```

배포 전에 검증합니다. 이 단계가 원서 레시피에는 없는, 지금은 필수인 단계입니다.

```bash
aws accessanalyzer validate-policy \
  --policy-type IDENTITY_POLICY \
  --policy-document file://shopmini-list-incoming-policy.json \
  --profile awssec-lab
```

정책을 만들고 그룹에 부착합니다.

```bash
aws iam create-policy \
  --policy-name ShopMiniListIncomingCLI \
  --policy-document file://shopmini-list-incoming-policy.json \
  --description "List and get objects under incoming/ prefix only, TLS required" \
  --tags Key=Project,Value=awssec-lab Key=Chapter,Value=ch07 Key=AutoDelete,Value=true \
  --profile awssec-lab

aws iam attach-group-policy \
  --group-name shopmini-labgroup \
  --policy-arn arn:aws:iam::111122223333:policy/ShopMiniListIncomingCLI \
  --profile awssec-lab
```

### 파트 C — 경계 확인 (이 실습의 핵심)

"되는 것" 만 확인하고 끝내면 최소 권한을 검증한 것이 아닙니다. **막혀야 하는 것이 막히는지** 를 확인합니다.

```bash
# ① 허용되어야 함 — incoming/ 접두사 나열
aws s3 ls s3://shopmini-uploads/incoming/ --profile shopmini-labuser

# ② 거부되어야 함 — 버킷 루트 나열 (s3:prefix 조건 불일치)
aws s3 ls s3://shopmini-uploads --profile shopmini-labuser

# ③ 거부되어야 함 — 다른 접두사의 객체 읽기
aws s3 cp s3://shopmini-uploads/private/report.csv . --profile shopmini-labuser

# ④ 거부되어야 함 — 쓰기 권한은 부여하지 않았다
echo test > t.txt
aws s3 cp t.txt s3://shopmini-uploads/incoming/t.txt --profile shopmini-labuser
```

②가 성공하면 `s3:prefix` 조건이 잘못 걸린 것이고, ④가 성공하면 그룹에 다른 정책이 남아 있는 것입니다. **정책을 좁혔는데 효과가 없으면 항상 "다른 정책이 이미 허용하고 있는가" 를 먼저 확인하십시오.**

```bash
# 그룹과 사용자에 붙은 정책 전체 확인
aws iam list-attached-group-policies --group-name shopmini-labgroup --profile awssec-lab
aws iam list-attached-user-policies --user-name shopmini-labuser --profile awssec-lab
aws iam list-user-policies --user-name shopmini-labuser --profile awssec-lab
```

### 정리(Cleanup)

```bash
aws iam detach-group-policy --group-name shopmini-labgroup \
  --policy-arn arn:aws:iam::111122223333:policy/ShopMiniListIncomingCLI --profile awssec-lab
aws iam delete-policy \
  --policy-arn arn:aws:iam::111122223333:policy/ShopMiniListIncomingCLI --profile awssec-lab
aws iam delete-policy \
  --policy-arn arn:aws:iam::111122223333:policy/ShopMiniListUploadsConsole --profile awssec-lab
rm -f t.txt shopmini-list-incoming-policy.json
```

> 📖 *AWS Security Cookbook* 1장은 정책 작성 도구도 소개합니다. **"AWS Policy Generator는 IAM 정책, S3 버킷 정책, SNS 주제 정책, VPC 엔드포인트 정책, SQS 큐 정책을 생성할 수 있다."** 다만 지금은 비주얼 에디터와 Access Analyzer 정책 생성(7.6)이 더 정확하므로, Policy Generator는 낯선 정책 유형의 문법을 확인할 때 정도로 씁니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| 정책 문서 | `Version`은 `"2012-10-17"` 고정. `Principal` 유무가 아이덴티티/리소스 기반을 가른다 |
| ARN 구분 | 버킷 작업은 `arn:aws:s3:::버킷`, 객체 작업은 `arn:aws:s3:::버킷/키` — 문장을 분리한다 |
| 6가지 유형 | 권한을 **줄 수 있는 것**: 아이덴티티 기반, 리소스 기반, ACL. **상한만 정하는 것**: 권한 경계, SCP, 세션 정책 |
| SCP | 거부만 가능. 관리 계정에는 적용되지 않는다 |
| 권한 경계 | 아이덴티티 기반 정책 ∩ 경계 ∩ SCP 가 최종 권한. 위임 시 **경계 제거 권한 Deny를 함께** |
| 평가 순서 | 명시적 Deny → SCP → RCP → (리소스 기반 직접 허용) → 권한 경계 → 세션 정책 → 아이덴티티 기반 Allow → 없으면 암묵적 Deny |
| 명시적 Deny | 어떤 Allow도 이기지 못한다. 사고 대응의 즉시 차단 수단 |
| 크로스 계정 | **양쪽 모두 허용해야 성립.** 주체 계정의 아이덴티티 기반 + 리소스 계정의 리소스 기반 |
| KMS·신뢰 정책 | 리소스 쪽이 절대적 — 키 정책/신뢰 정책이 거부하면 어떤 IAM 정책도 무효 |
| 조건 논리 | 같은 연산자 안 여러 키는 AND, 같은 키 여러 값은 OR |
| `...IfExists` | 키가 없는 요청을 통과시킨다. MFA Deny와 네트워크 Deny에 필수 |
| `aws:SourceIp` 함정 | VPC 엔드포인트 경유 요청에는 이 키가 없다 → `aws:SourceVpce`/`aws:SourceVpc`와 `aws:ViaAWSService`를 함께 |
| 최소 권한 만들기 | 넓게 시작 → 마지막 액세스 정보로 서비스 단위 절단 → Access Analyzer 정책 생성 → 시뮬레이션 → 반복 |
| Access Analyzer | 외부 접근(신뢰 영역=조직), 미사용 액세스, 정책 검증, 커스텀 정책 검사 4종 |
| 자동 게이트 | `validate-policy`의 `ERROR`는 배포 차단. `check-no-new-access`를 PR에 |

## 🔴 필수 구성 체크리스트

- [ ] 모든 정책의 `Version`이 `"2012-10-17"` 이다
- [ ] 모든 문장에 **의미 있는 `Sid`** 가 붙어 있다
- [ ] `Allow` 문장에 `NotAction`·`NotResource`가 **없다**
- [ ] `NotPrincipal`을 쓰는 정책이 **없다**
- [ ] 아이덴티티 기반 정책에 `"Action":"*"` + `"Resource":"*"` 조합이 관리자 역할 외에 **없다**
- [ ] `iam:PassRole`이 `"Resource":"*"` 로 부여된 정책이 **없다**
- [ ] `iam:PassRole` 허용에 `iam:PassedToService` 조건이 걸려 있다
- [ ] 모든 역할 신뢰 정책의 `Principal`이 **`"*"` 가 아니다**
- [ ] 서드파티 신뢰 정책에 `sts:ExternalId` 조건이 있다
- [ ] 조직 내 크로스 계정 리소스 기반 정책에 `aws:PrincipalOrgID` 조건이 있다
- [ ] IAM 변경 권한(`iam:CreateRole`/`AttachRolePolicy`/`PutRolePolicy`)을 위임한 곳에 **권한 경계 강제 조건**이 있다
- [ ] 그리고 그 위임에 **`iam:DeleteRolePermissionsBoundary` Deny 문장**이 함께 있다
- [ ] MFA 강제 Deny가 `Bool`이 아니라 **`BoolIfExists`** 를 쓴다
- [ ] MFA 강제 Deny에서 **워크로드 역할이 예외 처리**되어 있다
- [ ] 네트워크 제한 Deny에 `aws:SourceVpce`(또는 `aws:SourceVpc`)와 `aws:ViaAWSService`가 함께 들어 있다
- [ ] 데이터 저장 리소스 정책에 `aws:SecureTransport` 강제가 있다
- [ ] KMS 암호화 버킷을 쓰는 역할에 **`kms:Decrypt`/`kms:GenerateDataKey`가 함께** 부여되어 있다
- [ ] 그 KMS 권한에 `kms:ViaService` 조건이 걸려 있다
- [ ] 버킷 수준 작업과 객체 수준 작업이 **서로 다른 문장**으로 분리되어 있다
- [ ] 조직 단위 **외부 접근 분석기(`ORGANIZATION`)** 가 보안 도구 계정에 하나 존재한다
- [ ] **미사용 액세스 분석기**가 활성이고 결과를 정기적으로 처리한다
- [ ] 모든 워크로드 역할에 대해 `generate-service-last-accessed-details`를 **최근 1분기 안에** 돌린 기록이 있다
- [ ] `validate-policy`가 CI에서 실행되고 `ERROR` 시 배포가 중단된다
- [ ] 정책 변경 PR에 `check-no-new-access` 게이트가 있다
- [ ] 넓은 임시 정책에 **만료 조건**(`DateLessThan` + `aws:CurrentTime`) 또는 만료 티켓이 있다
- [ ] 정책 축소 후 `AccessDenied` 이벤트 알림이 며칠간 모니터링된다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| 버킷과 객체 ARN을 한 문장에 몰아넣는다 | `s3:ListBucket`이 전 경로에 부여되어 접두사 제한이 무력화 | 버킷/객체 문장 분리 (7.1) |
| 존재하지 않는 액션 이름을 쓴다 | 정책은 저장되고 권한은 조용히 부여되지 않음 | `validate-policy`의 `ERROR` 확인 (7.7) |
| SCP에 `Allow`를 넣어 권한을 주려 한다 | 아무 권한도 생기지 않음 — 원인 파악에 며칠 소모 | SCP는 필터. 부여는 아이덴티티/리소스 정책 (7.2) |
| 권한 경계를 붙이되 경계 제거 권한을 막지 않는다 | 경계를 떼고 관리자가 됨 | `DeleteRolePermissionsBoundary` Deny 동반 (7.2) |
| 크로스 계정에서 한쪽만 허용한다 | 계속 `AccessDenied` → "일단 넓게 열어보기" 로 이어짐 | 4개 항목(양쪽 정책 + SCP + RCP) 체크 (7.3) |
| 안 될 때 버킷 정책 `Principal`을 `"*"` 로 바꾼다 | 버킷이 인터넷에 공개 | 상대 역할 ARN 명시 + `aws:PrincipalOrgID` (7.3, 7.5) |
| 리소스 기반 정책만으로 권한을 성립시킨다 | 권한 경계·세션 정책이 상한으로 작동하지 않음 | 아이덴티티 기반에도 Allow 명시 (7.3) |
| KMS 권한을 빼놓고 S3 권한만 준다 | `s3:GetObject`가 `AccessDenied` — S3 문제로 오진 | `kms:Decrypt` 동반 부여 (7.1, 13.4) |
| MFA Deny에 `Bool`을 쓴다 | 액세스 키 사용자만 통과 — 막고 싶던 대상이 통과 | `BoolIfExists` (7.4) |
| `aws:SourceIp`만으로 네트워크를 제한한다 | 엔드포인트 경유 요청 오차단 또는 통제 우회 | `aws:SourceVpce` + `aws:ViaAWSService` 병기 (7.4) |
| `aws:ViaAWSService` 예외를 빼먹는다 | CloudFront 오리진 접근·S3 복제·Athena 쓰기가 동시 실패 | `BoolIfExists`로 서비스 대리 호출 제외 (7.4) |
| 태그 강제 Deny에 `ForAllValues`를 쓴다 | 태그 없는 요청이 그대로 통과 | `Null` 연산자 또는 `ForAnyValue` (7.4, 12.3) |
| `Allow` + `NotAction`으로 "IAM 빼고 전부" 를 쓴다 | 미래에 출시될 모든 서비스가 자동 허용 | 필요한 `Action` 열거 (7.5) |
| `iam:PassRole`을 `"Resource":"*"` 로 준다 | 계정 최강 역할이 그 사람의 권한 상한이 됨 | 역할 ARN 접두사 + `iam:PassedToService` (7.5) |
| 벤더 신뢰 정책에 계정 root만 적는다 | 벤더 계정 전체가 진입, 혼동된 대리자 성립 | `sts:ExternalId` 조건 (7.5, 8.6) |
| Access Analyzer 생성 정책을 그대로 배포한다 | 월말·분기 배치와 재해 복구 경로가 깨짐 | 완전한 업무 주기 관측 + 비정기 작업 수동 추가 (7.6) |
| `simulate-*` 결과만 믿고 운영에 넣는다 | SCP·리소스 정책 미반영으로 실제 실패 | 개발 계정 실호출로 최종 확인 (7.6) |
| 외부 접근 분석기를 계정마다 `ACCOUNT`로 만든다 | 조직 내 정당 접근이 전부 결과로 올라와 알람 피로 | 위임 관리자 + `ORGANIZATION` 하나 (7.7) |
| 정책을 좁혔는데 효과가 없다고 판단한다 | 다른 정책의 Allow를 못 보고 엉뚱한 곳을 수정 | 부착 정책·인라인 정책 전수 조회 (7.8) |

## 다음 장 예고

이제 정책을 쓰고 평가 결과를 예측할 수 있게 되었지만, 정책을 **누구에게** 붙일지는 아직 답하지 않았습니다. 7.5의 위험 패턴 중 절반이 신뢰 정책 — 즉 역할 — 에 관한 것이었다는 점이 힌트입니다.

8장은 **역할(Role)과 임시 자격 증명**입니다. `AssumeRole`이 신뢰 정책과 권한 정책의 2중 구조로 동작하는 원리, EC2 인스턴스 프로파일로 코드에서 키를 없애는 표준 방법, 그 자격 증명을 훔치는 가장 흔한 경로인 **인스턴스 메타데이터 서비스**를 IMDSv2로 막는 방법을 다룹니다. 7.5의 4번 패턴은 8.6의 External ID와 혼동된 대리자 문제에서 완결되고, 마지막으로 세션 태그와 `aws:PrincipalTag`를 결합한 **ABAC** 로 이어집니다.
