# 6장. IAM 기본 요소

> **이 장에서 다루는 것**
> - IAM의 4개 요소(사용자·그룹·역할·정책)가 서로 어떻게 맞물리는가 — 그리고 **그룹은 왜 프린시펄이 될 수 없는가**
> - ARN 문법 `arn:partition:service:region:account-id:resource` 를 필드 단위로 분해하고, 서비스별 변형과 와일드카드 매칭 규칙을 읽어내는 법
> - 자격 증명 5종(콘솔 비밀번호 · 액세스 키 · STS 임시 자격 증명 · 인스턴스 프로파일 · 페더레이션 토큰)의 **수명 · 유출 시 영향 · 회수 방법** 비교
> - 🔴 장기 액세스 키를 계정에서 없애야 하는 이유와, 그것을 대체하는 네 가지 구성
> - 인증(authn)과 인가(authz)를 분리해서 사고하는 법 — AWS가 하나의 API 요청을 처리하는 두 단계
>
> **선행 지식**: 1장(최소 권한), 2장(공동 책임 모델), 5장(계정 첫날 필수 보안)
> **난이도**: ★☆☆

---

2부가 시작됩니다. 1부는 "왜"를 다뤘고, 2부는 **"누가 무엇을 할 수 있는가"** 를 다룹니다. 이 파트를 이 책의 심장이라고 부른 이유는 원서가 IAM에 매기는 등급 때문입니다.

> 📖 *Practical Cloud Security* 2판 4장은 첫 문장부터 순위를 매깁니다. **"아이덴티티 및 접근 관리(IAM)는 아마도 가장 중요한 보안 통제 집합이다. 웹 애플리케이션이 관여된 침해에서, 분실되거나 탈취된 자격 증명은 수년간 공격자가 가장 많이 사용한 도구였다. 공격자가 당신의 시스템에 로그인할 유효한 자격 증명을 갖고 있다면, 세상의 모든 패치와 방화벽도 그를 막아주지 못한다!"**

3장에서 우리는 "노출된 액세스 키"를 클라우드 특유의 공격 경로 1번으로 뽑았고, 4장의 리스크 등록부에서 R-01(장기 키 유출)은 가장 높은 점수를 받았습니다. 이 장은 그 리스크가 사는 집을 해부합니다.

다만 경계를 먼저 그어두겠습니다. **이 장은 "요소가 무엇인가"까지만** 다룹니다. 정책 문서를 어떻게 쓰고 평가 순서가 어떻게 되는지는 7장, 역할 위임과 신뢰 정책의 내부 동작은 8장입니다. 6장은 그 두 장을 읽을 수 있게 만드는 어휘집입니다.

---

## 6.1 사용자, 그룹, 역할, 정책

### 4개 요소

원서 중 IAM 구성 실습을 담당하는 *AWS Security Cookbook* 은 이 4개를 "핵심 개념"으로 정리합니다.

> 📖 *AWS Security Cookbook* 1장 「Configuring IAM for a new account」의 'How it works' 절은 IAM을 **"AWS 내에서 사용자의 신원을 검증하고(인증) AWS 서비스에 대한 권한을 관리하도록(인가) 돕는 AWS 서비스"** 라고 정의한 뒤, **"IAM에는 네 가지 핵심 개념이 있다"** 고 열거합니다.
> - **사용자(Users)**: "IAM에서 생성해 AWS 리소스에 접근할 필요한 권한을 부여할 수 있다."
> - **그룹(Groups)**: "사용자를 그룹에 추가할 수 있다. 이제 개별 사용자 대신 그룹에 권한을 줄 수 있다. **이것이 권장되는 모범 사례다.**"
> - **정책(Policies)**: "사용자 또는 그룹에 대한 권한을 정의하는 JSON 문서다."
> - **역할(Roles)**: "일반적으로 사용자에게 AWS 서비스에 접근할 **임시 권한**을 주는 데 쓰인다. 예를 들어 S3 권한을 가진 역할을 EC2 서비스에 붙일 수 있다."
>
> 같은 장의 다른 위치에서 저자는 한 번 더 강조합니다. **"정책을 개별 사용자보다 그룹에 할당하는 것이 좋은 관행이다."**

여기서 문장 하나를 붙잡아 둘 필요가 있습니다. 정책은 **"권한을 정의하는 JSON 문서"** 이고, 그 자체로는 아무 힘이 없습니다. 정책은 **누군가에게 붙어야(attach)** 비로소 효력을 갖습니다. 그리고 **붙을 수 있는 대상**과 **요청을 보낼 수 있는 대상**은 같지 않습니다. 이 비대칭이 IAM 초보자가 가장 먼저 부딪히는 벽입니다.

### 관계도

```
                         ┌──────────────────────────────────────┐
                         │        정책(Policy) — JSON 문서       │
                         │  Effect / Action / Resource /        │
                         │  Condition  (+ Principal: 리소스 정책) │
                         └──────────────────────────────────────┘
                            △            △              △
             attach(붙는다) │            │              │
        ┌───────────────────┴──┐    ┌────┴─────┐   ┌────┴──────────┐
        │                      │    │          │   │               │
   ┌────┴──────┐        ┌──────┴────┴──┐   ┌───┴──────────┐  ┌─────┴────────┐
   │ 그룹(Group)│───────▶│ 사용자(User) │   │  역할(Role)  │  │ 리소스        │
   │           │  멤버십 │              │   │              │  │ (S3 버킷,     │
   │ ※프린시펄  │        │ ※프린시펄     │   │ ※프린시펄     │  │  KMS 키 등)   │
   │   아님!    │        │  장기 자격증명 │   │  임시 자격증명 │  │              │
   └───────────┘        └──────┬───────┘   └───┬──────────┘  └──────────────┘
                                │               ▲
                                │  sts:AssumeRole (신뢰 정책이 허용해야)
                                └───────────────┘
                                                ▲
                                                │ 사람이 아닌 것도 역할을 맡는다
                    ┌───────────────────────────┼───────────────────────┐
                    │                           │                       │
              EC2 인스턴스                 Lambda 함수            외부 IdP 사용자
           (인스턴스 프로파일)            (실행 역할)          (SAML/OIDC 페더레이션)
```

읽는 순서는 이렇습니다.

1. **정책은 세 곳에 붙는다** — 아이덴티티(사용자·그룹·역할), 리소스(버킷 정책·키 정책), 그리고 7.2에서 다룰 나머지 유형들.
2. **요청을 보내는 주체(프린시펄)는 사용자와 역할뿐이다.** 그룹은 정책을 붙일 수 있는 **컨테이너**지만, 요청의 주체가 될 수 없습니다.
3. **역할은 "빌려 쓰는" 것이다.** 사용자도, EC2 인스턴스도, 외부 IdP로 로그인한 직원도 역할을 맡아(assume) 임시 자격 증명을 받습니다.

### 🔴 그룹은 프린시펄이 아니다

실무에서 반복되는 실패입니다. 다음 버킷 정책은 **유효하지 않습니다.**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::111122223333:group/Developers" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::shopmini-uploads/*"
  }]
}
```

IAM 그룹 ARN은 **리소스 기반 정책의 `Principal`에 쓸 수 없습니다.** 정책 저장 시점에 거부되거나, 저장돼도 아무에게도 적용되지 않습니다. 같은 이유로 `"Resource": "arn:aws:iam::111122223333:group/Developers"` 를 대상으로 권한을 주는 것도 의미가 없습니다(그룹 자체를 관리하는 `iam:*Group*` 액션은 예외).

원하는 결과를 얻는 방법은 두 가지뿐입니다.

| 목표 | 올바른 구성 |
|---|---|
| "Developers 그룹 사람들이 버킷을 읽게" | **아이덴티티 기반 정책**을 Developers 그룹에 붙인다 (버킷 정책 아님) |
| "버킷 정책에서 대상을 지정해야 함" (크로스 계정 등) | **역할**을 만들고 `Principal`에 그 **역할 ARN**을 쓴다. 그룹 사람들은 그 역할을 맡는다 |

두 번째가 크로스 계정 접근의 표준 형태이고, 8.5에서 다룹니다.

### 역할과 그룹은 무엇이 다른가

이 질문에 원서가 정면으로 답합니다.

> 📖 *Practical Cloud Security* 1판·2판 4장의 「Roles Versus Groups」 박스는 "순수한 형태에서의" 차이를 이렇게 정리합니다.
> - **"그룹은 사용자 같은 엔티티의 모음이며, 그 그룹에 속한 엔티티에게 어떤 인가가 부여되었는지에 대한 정보는 담고 있지 않다.** VMAdminGroup 이라는 그룹에 Chris와 Barbara가 들어 있을 수 있지만, 그들이 무엇을 할 수 있는지는 알 수 없다."
> - **"역할은 권한의 모음으로, 사용자·그룹 또는 VM 같은 다른 엔티티에 부여될 수 있다.** 그러나 '순수한' 역할은 그 권한이 누구에게 부여되었는지에 대한 정보를 본질적으로 담고 있지 않다. VMAdminRole 이라는 역할은 가상 머신을 만들고 삭제할 권한을 부여하지만, 역할 정의만으로는 실제로 누가 그 권한을 얻는지 알 수 없다."
>
> 그리고 마지막 문장이 우리에게 직접 향합니다. **"용어는 종종 상호 교환적으로 쓰이지만, 일부 클라우드 제공자에서는 그 구분이 중요하다(AWS IAM의 그룹과 역할처럼)."**

AWS에서 그 구분은 특히 중요합니다. 같은 절에서 저자는 역할의 성격을 이렇게 규정합니다.

> 📖 *Practical Cloud Security* 2판 4장 「Roles」: **"공유 ID와 클라우드 제공자 역할의 근본적인 차이는, 공유 ID는 고정된 자격 증명을 가진 독립적인 아이덴티티라는 점이다. 클라우드 제공자 역할은 완전한 아이덴티티가 아니다. 그것은 그 역할에 접근할 권한을 가진 다른 아이덴티티가 취하는 특별한 지위이며, 그 다음 그 역할에 접근하기 위한 임시 자격 증명이 부여된다."**
>
> 저자는 역할이 왜 보안 통제인지도 설명합니다. **"역할 기반 접근은, 사용자나 서비스가 더 특권적인 작업을 위해 별도의 역할을 명시적으로 맡도록 요구함으로써 추가적인 보안 계층을 더할 수 있으며, 이는 최소 권한 원칙을 따르는 것이다. 대부분의 경우 사용자는 그 역할 '모자'를 명시적으로 쓰지 않으면 특권적인 활동을 수행할 수 없고, 끝나면 모자를 벗는다."** 그리고 **"시스템은 역할을 취하는 각 요청을 로그로 남길 수도 있어, 관리자는 나중에 특정 시점에 누가 그 역할을 갖고 있었는지 판단하고 그 정보를 보안상 결과가 있는 시스템 상의 행위와 비교할 수 있다."**

마지막 문장이 AWS에서 구체적인 자산이 됩니다. `sts:AssumeRole` 호출은 CloudTrail에 남고, 그 안에는 **누가 역할을 맡았는지(원래 프린시펄)와 세션 이름**이 함께 기록됩니다. 그래서 역할을 쓰면 "그 시각 그 API를 부른 것이 누구였나"에 답할 수 있고, 공유 액세스 키를 쓰면 답할 수 없습니다.

### 각 요소를 언제 쓰는가

| 요소 | 쓰는 경우 | 쓰지 말아야 하는 경우 | 자격 증명 |
|---|---|---|---|
| **사용자(User)** | IAM Identity Center를 쓸 수 없는 소규모 계정의 소수 관리자, 브레이크 글래스 계정 | 사람 로그인의 기본 수단(→ Identity Center), 애플리케이션·CI 용도 | 콘솔 비밀번호, 액세스 키 (장기) |
| **그룹(Group)** | 사람 사용자에게 권한을 묶어 주는 **유일한** 권장 경로 | 정책의 `Principal`/`Resource` 대상, 역할·서비스에 권한 주기 | 없음(자격 증명을 갖지 않음) |
| **역할(Role)** | 워크로드(EC2·Lambda·ECS), 크로스 계정 접근, 페더레이션 사용자, 권한 승격 | "임시로 만들었다가 지우기 귀찮으니 사용자로" 하는 모든 경우 | STS 임시 자격 증명 (자동 만료) |
| **정책(Policy)** | 권한을 표현하는 모든 곳 | 인라인 정책으로 같은 내용을 20군데 복붙 (→ 관리형 정책 1개) | 해당 없음 |

**한 줄 규칙: 사람은 그룹으로 묶고, 기계와 위임은 역할로 준다.** 이 문장을 어기는 구성이 6.4의 사고로 이어집니다.

> 💡 **원서 이후 변경** — 2020년 *Cookbook* 은 IAM 사용자를 사람 로그인의 기본으로 전제하고 실습을 구성합니다. 현재 AWS의 권장 구성은 **IAM Identity Center를 통한 페더레이션 로그인**이고, IAM 사용자는 "Identity Center를 쓸 수 없는 예외"로 축소되었습니다. 이 장의 실습(6.6)은 원서 레시피를 따라 IAM 사용자·그룹 기반으로 진행하되, 9.2에서 Identity Center로 이관하는 경로를 다룹니다.

### 알아둘 기본 한도

| 항목 | 기본값 |
|---|---|
| 계정당 IAM 사용자 | 5,000 |
| 계정당 그룹 | 300 |
| 사용자 1명이 속할 수 있는 그룹 | 10 |
| 사용자·그룹·역할 하나에 붙일 수 있는 관리형 정책 | 10 (증액 요청 가능) |
| 사용자 1명의 활성 액세스 키 | 2 (순환용으로 설계된 값 — 상시 2개가 아니다) |
| 역할 세션 최대 길이 | 1~12시간 (역할 설정값) |

"활성 액세스 키 2개"는 **키를 순환하는 동안 잠깐 겹치는 것**을 허용하기 위한 값입니다. 상시 2개가 살아 있는 사용자는 순환에 실패한 사용자입니다.

---

## 6.2 ARN 읽는 법

ARN(Amazon Resource Name)은 AWS 안의 모든 것에 붙는 주소입니다. 정책의 `Resource`, `Principal`, KMS 키 정책, SCP, CloudTrail 로그, 에러 메시지 — 보안 작업의 거의 모든 화면에 ARN이 등장합니다. 읽지 못하면 정책을 쓸 수 없습니다.

### 문법 분해

```
arn : aws : s3 : ap-northeast-2 : 111122223333 : accesspoint/shopmini-ap
 │     │     │          │              │                    │
 │     │     │          │              │                    └─ ⑥ resource
 │     │     │          │              └─────────────────────── ⑤ account-id
 │     │     │          └────────────────────────────────────── ④ region
 │     │     └───────────────────────────────────────────────── ③ service
 │     └─────────────────────────────────────────────────────── ② partition
 └───────────────────────────────────────────────────────────── ① 고정 문자열 "arn"

일반형:  arn:partition:service:region:account-id:resource
변형:    arn:partition:service:region:account-id:resource-type/resource-id
         arn:partition:service:region:account-id:resource-type:resource-id
```

| # | 필드 | 값 | 비워지는 경우 |
|---|---|---|---|
| ① | `arn` | 항상 `arn` | 없음 |
| ② | partition | `aws`(표준) / `aws-cn`(중국) / `aws-us-gov`(GovCloud) | 없음 |
| ③ | service | `s3`, `iam`, `ec2`, `kms`, `sts`, `lambda`, `dynamodb` … (소문자, API 네임스페이스와 동일) | 없음 |
| ④ | region | `ap-northeast-2` 등 | **글로벌 서비스**(IAM, CloudFront, Route 53, Organizations) / **S3 버킷** |
| ⑤ | account-id | 12자리. `111122223333` | **S3 버킷**, Route 53 호스팅 영역 등 이름이 전역 고유한 리소스 |
| ⑥ | resource | 서비스마다 문법이 다름. `/`, `:`, 또는 둘 다로 구분 | 없음 |

⑥의 구분자가 `/`인지 `:`인지는 **서비스가 정한 것이며 규칙성이 없습니다.** 외우려 하지 말고, 정책을 쓸 때 실제 리소스의 ARN을 CLI로 확인하는 습관을 들이는 게 맞습니다(`aws s3api get-bucket-policy-status`, `aws kms describe-key`, `aws sts get-caller-identity` 등이 ARN을 그대로 돌려줍니다).

### 서비스별 변형

CANON의 ShopMini 리소스로 채운 표입니다.

| 리소스 | ARN | 비는 필드 |
|---|---|---|
| S3 버킷 | `arn:aws:s3:::shopmini-uploads` | region, account |
| S3 객체 | `arn:aws:s3:::shopmini-uploads/user/42/photo.jpg` | region, account |
| IAM 사용자 | `arn:aws:iam::111122223333:user/alice` | region |
| IAM 그룹 | `arn:aws:iam::111122223333:group/Developers` | region |
| IAM 역할 | `arn:aws:iam::111122223333:role/shopmini-app-role` | region |
| IAM 관리형 정책 | `arn:aws:iam::111122223333:policy/ForceMFA` | region |
| AWS 관리형 정책 | `arn:aws:iam::aws:policy/ReadOnlyAccess` | region, **account 자리에 `aws`** |
| 인스턴스 프로파일 | `arn:aws:iam::111122223333:instance-profile/shopmini-app-profile` | region |
| 가상 MFA 디바이스 | `arn:aws:iam::111122223333:mfa/alice` | region |
| **역할을 맡은 세션** | `arn:aws:sts::111122223333:assumed-role/shopmini-app-role/i-0abc123def456` | region |
| 페더레이션 사용자 세션 | `arn:aws:sts::111122223333:federated-user/alice` | region |
| EC2 인스턴스 | `arn:aws:ec2:ap-northeast-2:111122223333:instance/i-0abc123def456` | — |
| 보안 그룹 | `arn:aws:ec2:ap-northeast-2:111122223333:security-group/sg-0abc123` | — |
| KMS 키 | `arn:aws:kms:ap-northeast-2:111122223333:key/1a2b3c4d-5e6f-7890-abcd-ef1234567890` | — |
| KMS 별칭 | `arn:aws:kms:ap-northeast-2:111122223333:alias/shopmini/app` | — |
| Secrets Manager 시크릿 | `arn:aws:secretsmanager:ap-northeast-2:111122223333:secret:rds/shopmini-a1B2c3` | — |
| Lambda 함수 | `arn:aws:lambda:ap-northeast-2:111122223333:function:shopmini-thumbnailer` | — |
| RDS DB 인스턴스 | `arn:aws:rds:ap-northeast-2:111122223333:db:shopmini-prod` | — |
| SNS 주제 | `arn:aws:sns:ap-northeast-2:111122223333:shopmini-security-alerts` | — |
| CloudFront 배포 | `arn:aws:cloudfront::111122223333:distribution/E1A2B3C4D5E6F7` | region |
| Route 53 호스팅 영역 | `arn:aws:route53:::hostedzone/Z1A2B3C4D5E6F7` | region, account |

세 가지 패턴을 알아두면 처음 보는 ARN도 읽힙니다.

- **글로벌 서비스는 region이 빈다.** IAM, STS, CloudFront, Route 53, Organizations. IAM ARN에 `ap-northeast-2`를 넣으면 매칭되지 않습니다.
- **이름이 전 세계에서 고유한 리소스는 account도 빈다.** S3 버킷 이름은 전역 고유하므로 계정 ID가 필요 없습니다. 그래서 **버킷 ARN만 보고는 그 버킷이 누구 것인지 알 수 없습니다** — 15.5의 크로스 계정 사고가 여기서 시작됩니다.
- **Secrets Manager는 이름 뒤에 6자 무작위 접미사가 붙는다.** `rds/shopmini` 가 아니라 `rds/shopmini-a1B2c3` 입니다. 그래서 시크릿 정책에는 보통 `rds/shopmini-*` 를 씁니다.

### 와일드카드 매칭 규칙

정책에서 ARN에 쓸 수 있는 와일드카드는 두 개입니다.

| 문자 | 의미 |
|---|---|
| `*` | 0자 이상의 임의 문자열 |
| `?` | 정확히 1자 |

핵심 규칙 네 가지입니다.

**① `*`는 `/`를 넘어간다.** 파일 글로브(shell glob)와 다릅니다.

```
"Resource": "arn:aws:s3:::shopmini-uploads/*"
    [매칭]     shopmini-uploads/photo.jpg
    [매칭]     shopmini-uploads/user/42/deep/path/photo.jpg   ← 하위 경로 전부 포함
    [매칭 안 됨] shopmini-uploads                              ← 버킷 자신은 포함되지 않음
```

**② 버킷과 객체는 다른 리소스다.** `s3:ListBucket`은 버킷 ARN, `s3:GetObject`는 객체 ARN을 필요로 합니다. 그래서 실무 정책은 거의 항상 두 줄이 됩니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListTheBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shopmini-uploads"
    },
    {
      "Sid": "ReadObjectsUnderOwnPrefix",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shopmini-uploads/${aws:userid}/*"
    }
  ]
}
```

`${aws:userid}` 같은 **정책 변수**를 ARN 안에 쓸 수 있습니다(`${aws:username}`, `${aws:PrincipalTag/Team}` 등). 이 기법의 확장이 8.7의 ABAC입니다.

**③ `Principal`에는 부분 와일드카드를 쓸 수 없다.** 이것이 가장 자주 틀리는 규칙입니다.

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/shopmini-*" },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::shopmini-uploads/*"
}
```

위 표기는 **와일드카드로 동작하지 않습니다.** `Principal`에서 허용되는 것은 정확한 ARN, 또는 전체를 뜻하는 `"*"` / `{"AWS": "*"}` 뿐입니다(그리고 이 `"*"`는 7.5가 "위험한 정책 패턴"으로 다루는 바로 그것입니다). "이름이 `shopmini-` 로 시작하는 역할만" 을 표현하려면 `Principal`을 넓게 두는 대신 **`Condition`에서 `aws:PrincipalArn`을 `ArnLike`로 걸어야** 합니다.

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::shopmini-uploads/*",
  "Condition": {
    "ArnLike": {
      "aws:PrincipalArn": "arn:aws:iam::111122223333:role/shopmini-*"
    }
  }
}
```

여기서 `:root`는 **루트 사용자가 아니라 "계정 111122223333 전체"** 를 뜻하는 관용 표기입니다. 이 표기의 의미와 위험(계정 안의 아무 프린시펄이나 허용될 수 있음)은 7.5에서 다룹니다.

**④ 와일드카드는 넓히기 전에 세어보라.** `"Resource": "*"` 는 문법적으로 유효하고 대부분의 문제를 즉시 해결하며, 대부분의 사고의 출발점입니다. 4장의 데이터 등급이 기밀 이상인 리소스에는 와일드카드 Resource를 쓰지 않는 것을 규칙으로 삼습니다.

---

## 6.3 자격 증명의 종류

### 원서의 출발점: 두 가지, 그리고 그 한계

> 📖 *AWS Security Cookbook* 1장의 'There's more' 절은 **"AWS에서 사용자를 인증하는 접근 자격 증명에는 주로 두 종류가 있다"** 고 정리합니다.
> - **"액세스 키 ID와 시크릿 액세스 키: 프로그래밍 방식 접근에 사용되며, AWS API·CLI·SDK 및 모든 개발 도구와 함께 쓰인다."**
> - **"사용자 이름과 비밀번호: 콘솔 접근 관리용."**

2020년 기준의 정확한 요약입니다. 그러나 이 둘만으로 계정을 운영하면 6.4의 사고를 피할 수 없습니다. 다른 원서가 그 이유를 짚습니다.

> 📖 *Practical Cloud Security* 1판·2판 4장 「Passwords, Passphrases, and API Keys」: **"API 키는 비밀번호와 매우 유사하지만 사람이 아닌 자동화를 위해 설계되었다. 그런 이유로 API 키에는 다중 인증을 사용할 수 없으며, 길고 무작위한 문자열이어야 한다. 공개 사용자 ID와 비공개 비밀번호를 갖는 대부분의 사용자 아이덴티티와 달리, 보통 당신은 시스템에게 당신이 누구인지 알려주면서 동시에 당신을 인증하는 비공개 API 키 하나만을 갖는다."**

이 인용에 액세스 키의 구조적 결함이 다 들어 있습니다. **① MFA를 붙일 수 없다. ② 그 문자열 하나가 신원 주장과 인증을 동시에 수행한다.** 즉 액세스 키는 "누구인지"와 "그것을 증명하는 것"이 분리되지 않은 자격 증명입니다. 문자열을 가진 사람이 곧 그 사용자입니다.

한편 워크로드에는 훨씬 나은 방법이 있다고 저자는 말합니다.

> 📖 *Practical Cloud Security* 2판 4장 「Instance Metadata and Identity Documents」: **"특정 시스템에서 실행되는 프로세스는 잘 알려진 엔드포인트에 접속할 수 있고, 그 엔드포인트는 자신이 실행되고 있는 시스템에 대한 모든 것을 알려주며, 그 프로세스는 그 시스템의 아이덴티티를 증명할 암호학적으로 서명된 수단도 제공받는다."**
>
> 그리고 곧바로 조건을 붙입니다. **"그러나 이것은 확실한 방법은 아니다. 시스템 상의 어떤 프로세스든 시스템 내 권한 수준과 무관하게 이 메타데이터를 요청할 수 있기 때문이다. 이는 곧 같은 신뢰 수준의 프로세스만 그 시스템에 두어야 하거나, 낮은 권한의 프로세스가 시스템 전체의 아이덴티티를 취하는 것을 막는 조치를 해야 한다는 뜻이다. 이것은 컨테이너 환경에서 특히 우려스러운데, 호스트 시스템의 어떤 컨테이너든 아이덴티티 문서를 요청해 그 호스트 시스템인 척할 수 있기 때문이다. 이런 경우에는 컨테이너가 메타데이터 서비스에 도달하는 것을 차단해야 한다."**

이 "잘 알려진 엔드포인트"가 AWS에서는 인스턴스 메타데이터 서비스(IMDS)이고, 저자가 경고한 "낮은 권한 프로세스가 시스템 아이덴티티를 취하는 문제"에 대응하는 것이 **IMDSv2 강제와 홉 제한**입니다. 그것은 8.3에서 별도로 다룹니다. 여기서는 "인스턴스 프로파일은 마법이 아니라, 방어해야 할 엔드포인트를 하나 갖는 구조"라는 사실만 기억하면 됩니다.

마지막으로 저자는 이 방향의 끝을 예측합니다.

> 📖 같은 절: **"현재로서 SPIFFE는 널리 쓰이지 않지만, 결국 그것이나 유사한 명세가 인증을 위한 정적 API 키의 광범위한 사용을 없앨 가능성이 크다."**

이 문장이 6.4의 근거입니다. 원서 저자가 보는 방향은 명확합니다 — **정적 키는 사라지는 쪽**입니다.

### 자격 증명 5종 비교

| | 콘솔 비밀번호 | 액세스 키(장기) | STS 임시 자격 증명 | 인스턴스 프로파일 | 페더레이션 토큰 |
|---|---|---|---|---|---|
| **붙는 대상** | IAM 사용자, 루트 | IAM 사용자, 루트 | 역할을 맡은 프린시펄 | EC2 인스턴스 | IdP로 인증된 사용자 |
| **구성 요소** | 사용자명+비밀번호(+MFA) | AKID + Secret | AKID + Secret + **SessionToken** | 위와 동일(IMDS 경유) | 위와 동일 |
| **수명** | 만료 없음(암호 정책으로 강제 가능) | **만료 없음** | 15분~12시간 | 자동 갱신(만료 전 교체) | 15분~12시간(역할 세션) · `GetFederationToken`은 최대 36시간 |
| **MFA 결합** | 가능 | **불가능** | 가능(`aws:MultiFactorAuthPresent`) | 해당 없음 | IdP에서 수행 |
| **CloudTrail 식별** | 사용자명 | 사용자명 | `assumed-role/역할/세션명` — **누가 맡았는지 함께 기록** | 인스턴스 ID를 세션명으로 지정 가능 | 페더레이션 사용자명 |
| **유출 시 영향** | 콘솔 접근. MFA 있으면 1차 방어 남음 | **즉시·무기한 API 전권.** 어디서든 사용 가능 | 만료까지만 유효 | 인스턴스 밖으로 나가면 사용 가능(IMDSv2 + 홉 제한으로 완화) | 만료까지만 유효 |
| **회수 방법** | 비밀번호 삭제/변경 | 키 비활성화·삭제 | **즉시 회수 불가** → 역할에 Deny 정책 부착 또는 `AWSRevokeOlderSessions` 방식 | 역할에서 정책 분리, 인스턴스 격리 | IdP에서 차단 + 역할 Deny |
| **탐지 난도** | 낮음(콘솔 로그인 이벤트) | **높음** — 정상 API 호출과 구별 안 됨 | 중간 | 중간(`InstanceCredentialExfiltration` 탐지 가능) | 중간 |
| **권장 용도** | 사람의 최후 수단 | 🔴 **원칙적으로 사용 금지** | 모든 프로그래밍 접근 | 모든 EC2 워크로드 | 사람의 표준 접근 경로 |

"회수 방법"에서 임시 자격 증명이 **"즉시 회수 불가"** 라는 점이 중요합니다. 발급된 STS 세션은 만료 전에 무효화할 수 없고, 대응은 **역할에 명시적 Deny를 붙이는 것**입니다(예: `aws:TokenIssueTime` 조건으로 특정 시각 이전 발급 세션 전부 거부). 이것이 장기 키보다 나은 이유는 **최악의 경우에도 시한이 있다**는 점입니다. 장기 키는 시한이 없습니다. 33.3의 초동 조치가 이 차이 위에서 설계됩니다.

### STS API 지도

| API | 누가 부르는가 | 결과 |
|---|---|---|
| `sts:AssumeRole` | IAM 사용자·역할 | 역할 세션 (15분~12시간) |
| `sts:AssumeRoleWithWebIdentity` | OIDC IdP 토큰 보유자(GitHub Actions, Cognito 등) | 역할 세션 |
| `sts:AssumeRoleWithSAML` | SAML IdP로 인증된 사용자 | 역할 세션 |
| `sts:GetSessionToken` | IAM 사용자(MFA 승격용) | 동일 사용자의 MFA 포함 세션 |
| `sts:GetFederationToken` | IAM 사용자 | 페더레이션 사용자 세션 |
| `sts:GetCallerIdentity` | 누구나 | **지금 나는 누구인가** — 권한 불필요, 디버깅의 첫 명령 |

세션 길이의 상한은 API마다 다르고 역할 설정(`MaxSessionDuration`)이 함께 작용합니다. **핵심은 상한이 존재한다는 사실 자체**입니다.

---

## 6.4 🔴 장기 액세스 키를 없애야 하는 이유 ⚠️

### 사고 시나리오

ShopMini 팀의 김개발은 로컬에서 S3 업로드 기능을 테스트하기 위해 IAM 사용자 `dev-kim`을 만들고 액세스 키를 발급받았습니다. 편의상 그룹 대신 `AmazonS3FullAccess`를 사용자에게 직접 붙였습니다. 몇 달 후 배포 자동화가 필요해지자 **같은 키를** CI 서비스의 환경 변수에 넣었습니다. 다시 몇 달 후, 신입 개발자가 로컬 검증용 스크립트를 정리하다가 `.env` 파일을 커밋했고, 그 리포지토리는 2주 뒤 오픈소스로 공개되었습니다.

**공개 3분 뒤** 자동 스캐너가 키를 수집합니다. **12분 뒤** 접근이 없는 리전(`sa-east-1`)에서 `RunInstances`가 호출되어 GPU 인스턴스 20대가 기동됩니다. **1시간 뒤** `shopmini-uploads`의 객체가 `ListObjectsV2` → `GetObject` 순서로 대량 열거·다운로드됩니다. **다음 날 아침**, 팀이 알아차린 계기는 GuardDuty 알람이 아니라 예산 알림 메일이었습니다.

조사 단계에서 팀은 세 가지 질문에 답하지 못합니다.

- **이 키는 누가 쓰던 것인가?** CloudTrail에는 `dev-kim`만 남습니다. 로컬 노트북인지, CI 러너인지, 공격자인지 구별되지 않습니다.
- **이 키는 언제부터 유출됐나?** 키에는 발급 시각만 있고 유출 시각이 없습니다. 커밋 시점 이전의 유출 가능성도 배제할 수 없습니다.
- **무엇까지 봤는가?** `shopmini-uploads`에 CloudTrail 데이터 이벤트가 꺼져 있어 객체 단위 접근 기록이 없습니다. → **전량 유출로 간주**해야 합니다(4.2).

### 원인

세 겹입니다.

| 층 | 잘못된 결정 | 결과 |
|---|---|---|
| **자격 증명** | 사람용 IAM 사용자에게 장기 키를 발급 | 만료 없음 + MFA 불가 + 어디서든 사용 가능 |
| **공유** | 사람의 키를 기계(CI)에 재사용 | 주체 식별 불가, 회수 시 사람과 파이프라인이 동시에 죽음 |
| **권한** | `AmazonS3FullAccess`를 사용자에 직접 부착 | 폭발 반경 = 계정의 전체 S3 |

원서는 이 세 번째 층까지 함께 경고합니다.

> 📖 *Practical Cloud Security* 2판 4장 「Secrets Management」: **"애플리케이션 서버가 데이터베이스와 통신하는 데 쓰는 비밀번호를 몇 명이 알고 있는가? 그것은 정기적으로 변경되는가, 그리고 누군가 팀을 떠나면 즉시 변경되는가? 최악의 경우 이 비밀번호는 애플리케이션 서버 코드 안에 있고 GitHub 같은 어떤 공개 리포지토리에 커밋되어 있다."**
>
> 그리고 사고 유형을 명시합니다. **"소스 코드에 AWS API 키 같은 시크릿을 실수로 저장한 데서 비롯된 침해가 많이 있었다. 코드는 배포되었을 때 작동하기 위해 그 자격 증명이 필요하지만, 시크릿을 소스 코드에 직접 넣는 것(또는 구성 파일의 일부로 소스 코드 리포지토리에 넣는 것)은 정말 나쁜 생각이다."** (1판의 같은 절은 이 자리에 2016년 Uber 침해 — 소스 코드에 AWS 자격 증명이 들어 있던 사례 — 를 구체적으로 듭니다.)
>
> 이유를 두 개 듭니다(1판·2판 공통). **"소스 코드 리포지토리는 애초에 정보를 비밀로 유지하도록 설계된 것이 아닐 가능성이 높다. 그것의 주 기능은 소스 코드의 무결성을 보호하는 것이다."** 그리고 **"소스 코드 리포지토리가 완벽하게 안전하더라도, 소스 코드에 접근할 수 있는 모든 사람이 운영 환경에서 사용되는 시크릿을 볼 권한도 가져야 할 가능성은 매우 낮다."**
>
> 각주에는 이런 용어까지 등장합니다. **"공개 GitHub 리포지토리에서 발견되는 시크릿을 가리키는 흔한 용어가 실제로 있다 — 'GitHub dorks'."** 2판은 여기에 한 문장을 더 붙입니다. **"이것이 너무 광범위한 문제였기 때문에 GitHub은 이제 시크릿을 포함한 코드 푸시를 차단하는 방법을 제공한다."**

또 하나, "떠난 사람의 접근이 남는다"는 문제도 장기 자격 증명 고유의 것입니다.

> 📖 *Practical Cloud Security* 2판 4장 「Differences from Traditional IT」: **"전통적인 환경에서 접근 통제는 때때로 단순히 사용자의 아이덴티티 전체를 폐기해 더 이상 로그인할 수 없게 하는 방식으로 이루어진다. 그러나 클라우드 환경을 사용할 때는 이것이 문제 전체를 해결해주지 않는 경우가 많다. 편의를 위해 많은 서비스가 새 세션으로 로그인할 능력 없이도 계속 작동하는 장수명 인증 토큰을 제공한다."**

### 유출 경로

| 경로 | 구체적 형태 | 탐지 |
|---|---|---|
| **Git 커밋** | `.env`, `~/.aws/credentials` 복사본, 테라폼 `tfvars`, 노트북(.ipynb) 출력 | 시크릿 스캐닝(푸시 차단), Git 히스토리 전수 스캔 — **되돌린 커밋도 히스토리에 남는다** |
| **로그·에러** | 디버그 로그의 요청 덤프, 예외 스택, APM 트레이스, CI 빌드 로그의 `env` 출력 | 로그에서 `AKIA`/`ASIA` 패턴 탐지 |
| **로컬 파일** | 노트북 분실·도난, 개발자 PC 악성코드, 백업된 `~/.aws/`, Docker 이미지 레이어 | 엔드포인트 보호, 키 자체를 없애는 것이 유일한 근본 대책 |
| **CI/CD 변수** | 포크 PR에서 시크릿 노출, 빌드 로그 에코, 서드파티 액션의 시크릿 접근 | 파이프라인 권한 검토(27.6), OIDC로 전환 |
| **협업 도구** | 채팅·티켓·위키·이메일에 붙여넣은 키 | DLP, 채널 스캔 |
| **AMI·User Data** | AMI에 남은 자격 증명, User Data 스크립트에 하드코딩 → **IMDS로 평문 조회 가능** | 22.4에서 별도 다룸 |

**되돌린 커밋도 히스토리에 남는다**는 항목이 특히 반복되는 함정입니다. `git revert`나 강제 푸시는 유출을 되돌리지 않습니다. **키가 리포지토리에 한 번 들어갔다면 그 키는 유출된 것**이고, 할 일은 코드 정리가 아니라 **키 폐기**입니다.

### 탐지와 대응

키가 이미 존재하는 계정이라면 먼저 재고를 파악합니다.

```bash
# ① 계정 전체 자격 증명 보고서 — 키 존재·마지막 사용·순환 여부를 한 번에
aws iam generate-credential-report --profile awssec-lab
aws iam get-credential-report --profile awssec-lab \
  --query 'Content' --output text | base64 -d > credential-report.csv

# ② 90일 이상 미사용 키 찾기 (보고서의 access_key_1_last_used_date 열 확인)
#    개별 확인
aws iam list-access-keys --user-name dev-kim --profile awssec-lab
aws iam get-access-key-last-used --access-key-id AKIAIOSFODNN7EXAMPLE \
  --profile awssec-lab

# ③ 루트 액세스 키 존재 여부 — 있으면 즉시 삭제 (5.1)
aws iam get-account-summary --profile awssec-lab \
  --query 'SummaryMap.AccountAccessKeysPresent'
```

유출이 확인된 경우의 순서입니다. **순서가 중요합니다.**

```bash
# 1) 키를 삭제하지 말고 먼저 '비활성화'한다 — 삭제하면 조사 연결점이 사라진다
aws iam update-access-key --user-name dev-kim \
  --access-key-id AKIAIOSFODNN7EXAMPLE --status Inactive --profile awssec-lab

# 2) 그 사용자가 맡을 수 있는 역할의 기존 세션까지 끊는다 (33.3에서 상세)
#    → 역할에 aws:TokenIssueTime 기반 Deny 정책을 임시로 부착

# 3) 이 키로 무엇을 했는지 조회 (30.6의 Athena 쿼리로 확대)
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE \
  --max-results 50 --profile awssec-lab

# 4) 조사가 끝난 뒤 삭제
aws iam delete-access-key --user-name dev-kim \
  --access-key-id AKIAIOSFODNN7EXAMPLE --profile awssec-lab
```

세 가지 자동 탐지 경로를 알아둡니다.

- **AWS Health 이벤트** — AWS가 공개 리포지토리에서 노출된 키를 감지하면 `AWS_RISK_CREDENTIALS_EXPOSED` 이벤트를 발생시키고, 해당 사용자에게 `AWSCompromisedKeyQuarantine` 계열 관리형 정책을 붙여 위험한 액션을 차단합니다. **이것은 안전망이지 방어책이 아닙니다** — 그 정책이 붙기 전에 이미 인스턴스가 켜져 있을 수 있습니다.
- **GuardDuty** — `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS`(인스턴스 자격 증명이 AWS 외부에서 사용됨), `CredentialAccess:IAMUser/AnomalousBehavior`, `Discovery:IAMUser/AnomalousBehavior` 등. 31.1에서 다룹니다.
- **IAM Access Analyzer 미사용 액세스 분석** — 지정 기간 동안 쓰이지 않은 액세스 키·역할·권한을 목록으로 냅니다. 7.7.

### 🔴 대안 네 가지 — 이렇게 구성하라

**장기 키가 필요한 상황은 대부분 이미 해결되어 있습니다.** 상황별로 정확히 하나의 답이 있습니다.

| 상황 | 🔴 올바른 구성 | 자격 증명 수명 |
|---|---|---|
| AWS 안의 워크로드 (EC2·ECS·EKS·Lambda) | **IAM 역할** — 인스턴스 프로파일 / 태스크 역할 / 실행 역할 / IRSA·Pod Identity (8.2, 8.4) | 자동 갱신 |
| AWS 밖의 서버·온프레미스·타 클라우드 VM | **IAM Roles Anywhere** — X.509 인증서를 신뢰 앵커에 등록하고 프로파일로 역할 매핑 | 최대 12시간 |
| CI/CD (GitHub Actions, GitLab CI 등) | **OIDC 페더레이션** — `sts:AssumeRoleWithWebIdentity` (27.6) | 잡 단위 |
| 사람의 콘솔·CLI 접근 | **IAM Identity Center** — SSO 로그인 후 단기 자격 증명 발급 (9.2) | 세션 단위 |

CI/CD의 OIDC 구성은 신뢰 정책 한 장이 핵심입니다. GitHub Actions 예시입니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "GitHubActionsOIDC",
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:shopmini/api:ref:refs/heads/main"
      }
    }
  }]
}
```

이 정책에서 절대 빠뜨릴 수 없는 것이 **`sub` 조건**입니다. `aud`만 검증하고 `sub`를 생략하면 **GitHub의 어떤 리포지토리든** 이 역할을 맡을 수 있습니다. 그리고 `sub`를 `repo:shopmini/api:*` 로 느슨하게 두면 **포크나 임의 브랜치에서 만든 워크플로**가 운영 배포 역할을 맡습니다. 브랜치 또는 환경까지 못 박아야 합니다. 신뢰 정책의 검증 실패가 어떤 사고로 이어지는지는 8.6(Confused Deputy)과 27.6에서 이어집니다.

**그럼에도 장기 키를 남겨야 한다면** 최소한 다음이 모두 충족되어야 합니다. 하나라도 빠지면 남기지 않습니다.

- [ ] 그 키의 소유 주체가 **기계이며, 사람과 공유되지 않는다**
- [ ] 다른 대안 4개가 **모두 기술적으로 불가능함**이 문서로 확인되었다
- [ ] 정책에 `aws:SourceIp` 또는 `aws:PrincipalOrgID` 등 **사용 위치 제약**이 걸려 있다
- [ ] 권한이 **단일 리소스·단일 액션 수준**으로 좁혀져 있다
- [ ] 순환 주기(90일 이하)와 순환 절차가 **자동화**되어 있고, 실패 알람이 있다
- [ ] `iam:CreateAccessKey`를 SCP로 제한하고, **이 사용자만 예외**로 두었다 (37.2)

---

## 6.5 인증(Authentication) vs 인가(Authorization)

### 원서의 구분

두 원서 모두 이 구분을 IAM 서술의 출발점에 둡니다. *Cookbook* 은 간결합니다.

> 📖 *AWS Security Cookbook* 1장: **"인증(Authentication)은 사용자 이름과 비밀번호, 또는 액세스 키와 시크릿 액세스 키 같은 자격 증명으로 사용자의 신원을 검증하는 과정이다."** / **"인가(Authorization)는 사용자가 어떤 행위를 수행할 올바른 권한을 갖고 있는지 확인하는 과정이며, 보통 권한 정책으로 정의된다."**

*Practical Cloud Security* 는 더 앞으로 물러나 **"아이덴티티"와 "접근 관리"** 를 먼저 분리합니다.

> 📖 *Practical Cloud Security* 2판 4장: **"아이덴티티 및 접근 관리는 종종 함께 논의되지만, 그것들이 별개의 개념임을 이해하는 것이 중요하다."**
> - **"아이덴티티는 사람(또는 자동화)이 시스템에서 표현되는 방식이다. 요청을 하는 엔티티가 정말로 그 아이덴티티의 소유자인지 검증하는 과정을 인증(흔히 'authn'으로 축약)이라고 부른다."**
> - **"접근 관리는 아이덴티티가 수행해야 하는 작업을 수행하도록 허용하는 것에 관한 것이다(그리고 최소 권한 환경에서는 수행해야 하는 작업**만**을). 아이덴티티가 어떤 권한을 가져야 하는지 확인하는 과정을 인가(흔히 'authz'로 축약)라고 부른다."**
>
> 저자는 물리 세계의 비유를 씁니다. 군사 기지 정문에 운전면허증을 제시하는 상황입니다. **"인가는 특정 행위를 수행할 능력을 가리키며, 일반적으로 먼저 인증(누군가가 누구인지 아는 것)에 의존한다. 예를 들어 기지의 경비병은 이렇게 말할 수 있다. '그렇습니다, 당신이 당신이 말하는 사람이라고 믿습니다. 그러나 당신은 이 기지에 들어올 수 없습니다.' 또는 들어가는 것은 허용되지만, 일단 안에 들어가면 대부분의 건물에는 접근할 수 없을 수도 있다."**

그리고 이 장의 가장 실무적인 경고가 이어집니다.

> 📖 같은 절: **"IT 보안에서 우리는 종종 이 두 개념을 뒤섞는다. 예를 들어 누군가를 위한 아이덴티티를 만들고(비밀번호 같은 관련 자격 증명과 함께) 그 다음 유효한 아이덴티티를 가진 사람이면 누구든 시스템의 모든 데이터에 접근하도록 암묵적으로 허용한다. 또는 그 사람의 아이덴티티를 삭제해서 접근을 회수하는데 — 그것은 작동하지만, 접근을 거부하는 대신 그 사람의 운전면허증을 찢어버리는 것과 같다."**
>
> 저자가 던지는 두 질문이 그대로 리뷰 항목입니다. **"모든 사용자에게 시스템 전체 접근을 인가하는 것이 정말 적절한가? 조직 외부의 누군가에게 시스템의 다른 영역에 접근하게 하려고 아이덴티티를 주어야 한다면, 그 사용자도 내부 리소스에 자동으로 접근하게 되는가?"**

AWS로 옮기면 두 질문은 이렇게 번역됩니다. 첫 번째 — **"IAM 사용자를 만들면서 `AdministratorAccess`를 붙이고 있지 않은가?"** 두 번째 — **"외부 협력사에 역할을 하나 줬을 때, 그 역할이 다른 리소스에도 닿지 않는가?"**(8.6). 그리고 저자가 지적한 "면허증을 찢는" 방식의 대응 — 사용자 삭제로 접근을 끊는 것 — 은 6.4에서 본 대로 **장기 토큰이 남아 있으면 작동하지도 않습니다.**

인가 단계의 원칙은 두 개로 압축됩니다.

> 📖 *Practical Cloud Security* 1판·2판 4장 「Authorization」: **"인가에서 기억해야 할 가장 중요한 개념은 최소 권한과 직무 분리다. (…) 최소 권한은 사용자·시스템·도구가 자기 일을 하기 위해 필요한 것만 접근할 수 있어야 하고 그 이상은 안 된다는 뜻이다. 실무에서 이것은 보통 '기본 거부(deny by default)' 정책을 두어, 명시적으로 인가하지 않은 것은 허용되지 않게 하는 것을 의미한다."**
>
> **"직무 분리(separation of duties)는 실은 금융 통제의 세계에서 왔다. (…) 클라우드 보안의 세계에서 이것은 보통 어느 한 사람도 환경 전체의 보안을 완전히 무너뜨릴 수 없게 만드는 것으로 더 일반적으로 번역된다. 예를 들어 시스템을 변경할 능력이 있는 사람은 그 시스템의 로그를 변조할 능력을, 또는 그 로그를 검토할 책임을 동시에 가져서는 안 된다."**

"기본 거부"는 AWS IAM의 기본 동작이고(7.3의 암묵적 Deny), 직무 분리는 29.9의 중앙 로그 계정과 17.4의 백업 계정 분리로 구현됩니다. 이 장의 원칙이 뒤에서 계정 아키텍처가 되는 지점입니다.

### AWS가 하나의 요청을 처리하는 두 단계

`aws s3 cp` 한 번이 AWS 안에서 지나는 길입니다.

```
[클라이언트]
   │  ① 자격 증명 탐색 (환경변수 → 웹 아이덴티티 토큰 → ~/.aws/credentials·config
   │                   → 컨테이너 자격 증명 제공자 → EC2 IMDS 순)
   │  ② 요청에 SigV4 서명 생성
   │     Authorization: AWS4-HMAC-SHA256 Credential=AKIA.../20260906/ap-northeast-2/s3/aws4_request,
   │                    SignedHeaders=host;x-amz-date, Signature=<HMAC>
   │     (임시 자격 증명이면 X-Amz-Security-Token 헤더가 추가된다)
   ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1단계 ▸ 인증 (Authentication) — "너는 누구인가"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   │  · 액세스 키 ID로 시크릿을 찾아 서명을 재계산하고 대조
   │  · 요청 타임스탬프가 허용 오차를 벗어났으면 거부(재전송 공격 방어)
   │  · 임시 자격 증명이면 세션 토큰의 유효성·만료 검증
   │  → 실패: 403  InvalidClientTokenId / SignatureDoesNotMatch
   │           ExpiredToken / RequestTimeTooSkewed
   │  → 성공: 프린시펄이 확정된다
   │           arn:aws:sts::111122223333:assumed-role/shopmini-app-role/i-0abc123
   ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2단계 ▸ 인가 (Authorization) — "그것을 해도 되는가"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   │  요청 컨텍스트 조립: 프린시펄 · Action(s3:PutObject) · Resource(객체 ARN)
   │                     · 조건 키(aws:SourceIp, aws:SecureTransport, …)
   │  적용 가능한 모든 정책을 모아 평가:
   │     SCP → 리소스 컨트롤 정책 → 권한 경계 → 세션 정책
   │     → 아이덴티티 기반 정책 → 리소스 기반 정책
   │  · 명시적 Deny가 하나라도 있으면 → 거부
   │  · 명시적 Allow가 없으면 → 거부 (기본 거부)
   │  → 실패: 403  AccessDenied  ("...is not authorized to perform...")
   ▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3단계 ▸ 서비스 고유 검사 — 버킷 소유권, 암호화 요구, KMS 키 정책 등
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ▼  200 OK  (+ CloudTrail에 프린시펄·Action·Resource·결과가 기록)
```

**2단계의 정책 평가 로직 전체는 7.3에서 플로차트로 다룹니다.** 여기서 붙잡을 것은 **두 단계가 분리되어 있다는 사실**과, **그것이 오류 메시지로 드러난다**는 점입니다. 이 구분이 IAM 디버깅 시간의 대부분을 줄여줍니다.

| 증상 | 실패한 단계 | 원인 | 첫 확인 |
|---|---|---|---|
| `InvalidClientTokenId` | 인증 | 키가 존재하지 않음/비활성/삭제됨, 다른 계정의 키 | 프로파일 지정이 맞는지 |
| `SignatureDoesNotMatch` | 인증 | 시크릿 키 오타, 복붙 시 공백·개행 유입 | 자격 증명 재입력 |
| `ExpiredToken` | 인증 | 임시 자격 증명 만료 | 역할 재-assume |
| `RequestTimeTooSkewed` | 인증 | 클라이언트 시계 오차 | NTP 동기화 |
| `AccessDenied` (+ "is not authorized to perform") | **인가** | 정책이 없거나 Deny에 걸림 | 정책 평가 (7장) |
| `AccessDenied` (+ "with an explicit deny in a service control policy") | **인가** | SCP에 막힘 | 조직 SCP 확인 (37장) |
| `AccessDenied` 이지만 정책은 맞아 보임 | 인가 | KMS 키 정책, 버킷 소유권, 리소스 정책 | 13.4, 15.5 |

**`AccessDenied`가 나왔다면 인증은 이미 성공한 것입니다.** 즉 자격 증명은 유효합니다. 이때 키를 다시 만드는 것은 시간 낭비이고, `aws sts get-caller-identity`로 프린시펄을 확정한 뒤 정책을 보는 것이 옳은 순서입니다.

```bash
# 인증 단계 확인 — 권한이 전혀 없어도 성공한다. 실패하면 자격 증명 문제.
aws sts get-caller-identity --profile awssec-lab
# {
#   "UserId": "AROAEXAMPLEID:i-0abc123def456",
#   "Account": "111122223333",
#   "Arn": "arn:aws:sts::111122223333:assumed-role/shopmini-app-role/i-0abc123def456"
# }
```

---

## 6.6 🧪 실습: 신규 계정의 IAM 초기 구성

> 📖 이 실습은 *AWS Security Cookbook* 1장 「Configuring IAM for a new account」 레시피를 따릅니다. 원서는 IAM 대시보드의 체크리스트를 콘솔에서 초록색으로 만드는 순서 — **계정 별칭 → 루트 MFA 활성화 → 개별 IAM 사용자 생성 → 그룹 생성 → 그룹에 정책 할당 → 암호 정책 설정** — 를 제시하고, 마지막에 결제 알람을 추가합니다. 여기서는 같은 순서를 CLI로 재구성하고, 원서 이후 표준이 된 **MFA 강제 정책**을 추가합니다.
>
> 원서의 지침도 그대로 유지합니다. **"관리 콘솔은 일반적으로 일회성 작업에 쓴다. 반복적인 작업에는 API를 사용해야 한다."** 루트 MFA 등록(콘솔 전용)은 5.1에서 이미 완료했다고 가정합니다.

**소요 시간** 약 30분 · **비용** 없음(IAM은 무료) · **프로파일** `awssec-lab`(관리자 권한)

### Step 0. 사전 확인

```bash
aws sts get-caller-identity --profile awssec-lab

# 루트 액세스 키가 남아 있으면 여기서 멈추고 먼저 삭제한다 (5.1)
aws iam get-account-summary --profile awssec-lab \
  --query 'SummaryMap.{RootKeys:AccountAccessKeysPresent,MFA:AccountMFAEnabled}'
# 기대값: {"RootKeys": 0, "MFA": 1}
```

### Step 1. 계정 별칭

```bash
aws iam create-account-alias --account-alias shopmini-prod --profile awssec-lab
# 로그인 URL이 https://shopmini-prod.signin.aws.amazon.com/console 로 바뀐다
```

> 📖 원서: **"IAM 사용자 로그인 링크에 계정에 대한 고유하고 의미 있는 별칭을 부여한다. 이것은 보안 요구사항은 아니지만, IAM 사용자가 우리 계정에 로그인하기 더 쉽게 해준다."**

### Step 2. 그룹 생성 — 사용자보다 먼저

원서의 "정책을 개별 사용자보다 그룹에 할당하라"를 순서로 구현합니다. 사용자를 만들기 전에 그룹을 만들면, 사용자에게 직접 정책을 붙이는 지름길이 애초에 생기지 않습니다.

```bash
for G in Administrators Developers ReadOnly BreakGlass; do
  aws iam create-group --group-name "$G" --profile awssec-lab
done

aws iam attach-group-policy --group-name Administrators \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess --profile awssec-lab

aws iam attach-group-policy --group-name ReadOnly \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess --profile awssec-lab

# Developers: 광범위 관리형 정책 대신 '역할을 맡을 권한'만 준다 (8.5로 이어짐)
aws iam attach-group-policy --group-name Developers \
  --policy-arn arn:aws:iam::aws:policy/job-function/ViewOnlyAccess --profile awssec-lab
```

`Developers`에 `PowerUserAccess`를 붙이지 않은 것이 의도입니다. 개발 권한은 **개발 계정(`555555555555`)의 역할**로 주고, 운영 계정에서는 조회만 가능하게 둡니다. 이 구조가 36.7의 계정 간 역할 전환입니다.

### Step 3. 암호 정책

```bash
aws iam update-account-password-policy \
  --minimum-password-length 14 \
  --require-uppercase-characters \
  --require-lowercase-characters \
  --require-numbers \
  --require-symbols \
  --allow-users-to-change-password \
  --max-password-age 90 \
  --password-reuse-prevention 24 \
  --profile awssec-lab

aws iam get-account-password-policy --profile awssec-lab
```

> 📖 원서: **"암호 정책 체크리스트 항목을 펼쳐 괜찮은 암호 정책을 설정한다."** 원서는 구체적 값을 제시하지 않습니다.
>
> 위 값은 원서 내용이 아니라 이 책이 정한 기준선입니다. 근거는 4장의 데이터 등급과 *Practical Cloud Security* 1판·2판 4장의 비밀번호 권고입니다. **"암호 관리 도구에서 복사·붙여넣기할 수 있어서 기억할 필요가 없는 비밀번호에는 안전한 무작위 생성기를 사용하라. 20자가 좋은 목표다."** 저자는 재사용 금지를 1번 원칙으로 둡니다. **"보호되는 리소스에 인가되지 않은 사용자가 접근하는 것을 정말로 신경 쓰지 않는 경우가 아니라면 비밀번호를 절대 재사용하지 마라."**
>
> ⚠️ `--max-password-age`(만료 강제)는 트레이드오프가 있습니다. 강제 만료는 사용자가 `Shopmini2026!` → `Shopmini2027!` 같은 예측 가능한 변형을 만들게 하는 경향이 있어, 최근 지침(NIST SP 800-63B 등)은 **주기적 만료보다 길이·유출 목록 검사·MFA**를 우선합니다. IAM 사용자를 브레이크 글래스 용도로만 남기고 일상 접근을 Identity Center로 옮기면(9.2) 이 항목의 중요도는 크게 떨어집니다. 여기서는 감사 대응을 위해 90일을 유지합니다. `--hard-expiry`는 **쓰지 않습니다** — 만료 후 스스로 변경할 수 없게 되어 계정에서 잠기는 사고가 발생합니다.

### Step 4. 🔴 MFA 강제 정책

원서 시점 이후 사실상 표준이 된 구성입니다. **MFA 없이 로그인한 세션은 자기 MFA 등록 외에 아무것도 할 수 없게** 만듭니다.

```bash
cat > force-mfa-policy.json <<'JSON'
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
      "Sid": "AllowManageOwnPasswordAndKeys",
      "Effect": "Allow",
      "Action": [
        "iam:ChangePassword",
        "iam:GetUser",
        "iam:ListAccessKeys",
        "iam:ListMFADevices"
      ],
      "Resource": "arn:aws:iam::*:user/${aws:username}"
    },
    {
      "Sid": "AllowManageOwnVirtualMFADevice",
      "Effect": "Allow",
      "Action": [
        "iam:CreateVirtualMFADevice",
        "iam:DeleteVirtualMFADevice"
      ],
      "Resource": "arn:aws:iam::*:mfa/${aws:username}"
    },
    {
      "Sid": "AllowManageOwnUserMFA",
      "Effect": "Allow",
      "Action": [
        "iam:EnableMFADevice",
        "iam:ResyncMFADevice",
        "iam:DeactivateMFADevice"
      ],
      "Resource": "arn:aws:iam::*:user/${aws:username}"
    },
    {
      "Sid": "DenyAllExceptListedIfNoMFA",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:GetUser",
        "iam:ListMFADevices",
        "iam:ListVirtualMFADevices",
        "iam:ResyncMFADevice",
        "iam:ChangePassword",
        "iam:GetAccountPasswordPolicy",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" }
      }
    }
  ]
}
JSON

aws iam create-policy --policy-name ForceMFA \
  --policy-document file://force-mfa-policy.json \
  --description "Deny everything except self-service MFA setup when MFA is absent" \
  --profile awssec-lab

for G in Administrators Developers ReadOnly; do
  aws iam attach-group-policy --group-name "$G" \
    --policy-arn arn:aws:iam::111122223333:policy/ForceMFA --profile awssec-lab
done
```

**세 가지를 반드시 확인하세요.**

1. **`BoolIfExists`를 써야 합니다.** `Bool`을 쓰면 `aws:MultiFactorAuthPresent` 키가 **아예 없는 요청**(액세스 키로 호출한 API 등)에서 조건이 매칭되지 않아 Deny가 통과합니다. `BoolIfExists`는 "키가 없으면 없는 것으로 취급"하므로 그 경우에도 Deny가 적용됩니다. 4장에서 이미 지적한 함정입니다.
2. **`BreakGlass` 그룹에는 붙이지 않았습니다.** 브레이크 글래스 계정은 MFA 디바이스 자체를 물리 금고에 보관하며 별도 절차로 관리합니다(32.4). 정상 인증 경로가 막혔을 때 쓰는 계정에 정상 경로 전제 정책을 걸면 목적이 사라집니다.
3. **`sts:GetSessionToken`이 예외에 있습니다.** CLI에서 MFA 코드로 승격 세션을 받는 경로이므로 제외하지 않으면 CLI 사용자가 MFA를 쓸 방법이 없어집니다.

### Step 5. 사용자 생성 — 그룹에만 넣는다

```bash
aws iam create-user --user-name alice \
  --tags Key=Project,Value=awssec-lab Key=Chapter,Value=ch06 Key=AutoDelete,Value=true \
  --profile awssec-lab

aws iam add-user-to-group --user-name alice --group-name Administrators --profile awssec-lab

# 콘솔 비밀번호만 발급하고, 액세스 키는 발급하지 않는다 (6.4)
aws iam create-login-profile --user-name alice \
  --password "$(openssl rand -base64 24)" \
  --password-reset-required --profile awssec-lab
```

**`aws iam create-access-key`를 부르지 않았다는 점이 이 실습의 핵심입니다.** 프로그래밍 접근이 필요해지면 6.4의 표에서 상황에 맞는 대안을 고릅니다.

### Step 6. 검증

```bash
# ① 사용자에게 직접 붙은 정책이 있는지 — 있으면 안 된다
for U in $(aws iam list-users --profile awssec-lab --query 'Users[].UserName' --output text); do
  echo "== $U"
  aws iam list-attached-user-policies --user-name "$U" --profile awssec-lab \
    --query 'AttachedPolicies[].PolicyName'
  aws iam list-user-policies --user-name "$U" --profile awssec-lab --query 'PolicyNames'
done

# ② 액세스 키를 가진 사용자가 있는지 — 없어야 한다
for U in $(aws iam list-users --profile awssec-lab --query 'Users[].UserName' --output text); do
  aws iam list-access-keys --user-name "$U" --profile awssec-lab \
    --query "AccessKeyMetadata[].[UserName,AccessKeyId,Status]" --output text
done

# ③ MFA 미등록 사용자 찾기
for U in $(aws iam list-users --profile awssec-lab --query 'Users[].UserName' --output text); do
  N=$(aws iam list-mfa-devices --user-name "$U" --profile awssec-lab \
        --query 'length(MFADevices)' --output text)
  [ "$N" = "0" ] && echo "MFA 없음: $U"
done

# ④ 정책 시뮬레이터로 MFA 없는 상태를 검증
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:user/alice \
  --action-names s3:ListAllMyBuckets \
  --context-entries ContextKeyName=aws:MultiFactorAuthPresent,ContextKeyType=boolean,ContextKeyValues=false \
  --profile awssec-lab \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output text
# 기대값: s3:ListAllMyBuckets  explicitDeny
```

`simulate-principal-policy`는 **실제 요청을 보내지 않고 정책 평가만 돌려보는 API**입니다. 7장에서 정책을 쓰기 시작하면 가장 많이 쓰게 됩니다.

### Step 7. 정리

```bash
aws iam remove-user-from-group --user-name alice --group-name Administrators --profile awssec-lab
aws iam delete-login-profile --user-name alice --profile awssec-lab
aws iam delete-user --user-name alice --profile awssec-lab

for G in Administrators Developers ReadOnly BreakGlass; do
  for P in $(aws iam list-attached-group-policies --group-name "$G" --profile awssec-lab \
               --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-group-policy --group-name "$G" --policy-arn "$P" --profile awssec-lab
  done
  aws iam delete-group --group-name "$G" --profile awssec-lab
done

aws iam delete-policy --policy-arn arn:aws:iam::111122223333:policy/ForceMFA --profile awssec-lab
aws iam delete-account-alias --account-alias shopmini-prod --profile awssec-lab
```

⚠️ **삭제 순서를 지켜야 합니다.** 사용자는 그룹 멤버십과 로그인 프로파일을 먼저 제거해야 삭제되고, 그룹은 붙은 정책을 모두 분리해야 삭제되고, 관리형 정책은 어디에도 붙어 있지 않아야 삭제됩니다. IAM의 삭제 실패는 대부분 이 의존 관계 때문입니다.

---

## 이 장의 요약

| 항목 | 핵심 |
|---|---|
| **IAM의 위상** | "아마도 가장 중요한 보안 통제 집합"이며, 탈취된 자격 증명은 "수년간 공격자가 가장 많이 사용한 도구"(원서 2판 4장) |
| **4개 요소** | 사용자·그룹·정책·역할 (원서 *Cookbook* 1장의 "네 가지 핵심 개념") |
| **핵심 비대칭** | 정책이 붙는 대상 ≠ 요청을 보내는 프린시펄. **그룹은 프린시펄이 아니다** |
| **역할 vs 그룹** | 그룹은 "엔티티의 모음", 역할은 "권한의 모음"이며 완전한 아이덴티티가 아닌 "취하는 지위"(원서 4장) |
| **한 줄 규칙** | **사람은 그룹으로 묶고, 기계와 위임은 역할로 준다** |
| **ARN 문법** | `arn:partition:service:region:account-id:resource`. 글로벌 서비스는 region이 비고, 전역 고유 이름 리소스는 account도 빈다 |
| **와일드카드** | `*`는 `/`를 넘어간다. 버킷 ≠ 객체. **`Principal`에는 부분 와일드카드 불가** → `ArnLike`+`aws:PrincipalArn` |
| **액세스 키의 구조적 결함** | MFA 결합 불가 + 신원 주장과 인증이 문자열 하나로 합쳐짐(원서 4장) + 만료 없음 |
| **임시 자격 증명의 이점** | 즉시 회수는 불가하지만 **시한이 있다.** 장기 키는 시한이 없다 |
| **인스턴스 프로파일의 조건** | "어떤 프로세스든 권한 수준과 무관하게 메타데이터를 요청할 수 있다"(원서 4장) → IMDSv2·홉 제한 필요 (8.3) |
| **장기 키 대안 4종** | IAM 역할 / IAM Roles Anywhere / OIDC 페더레이션 / IAM Identity Center |
| **authn vs authz** | 인증 = "당신이 그 아이덴티티의 소유자인가", 인가 = "그 행위를 할 권한이 있는가". "우리는 종종 이 둘을 뒤섞는다"(원서 4장) |
| **오류로 단계 구분** | `SignatureDoesNotMatch`·`ExpiredToken` = 인증 실패 / `AccessDenied` = **인증은 성공, 인가 실패** |
| **인가의 두 원칙** | 최소 권한(기본 거부)과 직무 분리 — "어느 한 사람도 환경 전체의 보안을 무너뜨릴 수 없게"(원서 4장) |
| **초기 구성 순서** | 별칭 → 루트 MFA → **그룹 먼저** → 정책 → 암호 정책 → MFA 강제 → 사용자 (키 없이) |

## 🔴 필수 구성 체크리스트

- [ ] 루트 액세스 키가 **0개**다 (`SummaryMap.AccountAccessKeysPresent` = 0)
- [ ] 루트 사용자에 MFA가 등록되어 있다
- [ ] **사용자에 직접 붙은 정책이 하나도 없다** — 모든 권한이 그룹 또는 역할 경유
- [ ] 인라인 정책으로 같은 내용이 여러 사용자에 복제되어 있지 않다
- [ ] 모든 콘솔 사용자에게 MFA가 등록되어 있다
- [ ] `ForceMFA` 계열 정책이 모든 사람 그룹에 부착되어 있고, **`BoolIfExists`** 를 쓴다
- [ ] 브레이크 글래스 계정이 MFA 강제 정책 **대상에서 제외**되고 별도 절차로 관리된다
- [ ] 계정 암호 정책이 설정되어 있다(길이 14자 이상, 재사용 방지 포함, `--hard-expiry` 미사용)
- [ ] **활성 장기 액세스 키 목록이 문서화**되어 있고, 각 항목에 존재 이유와 소유자가 적혀 있다
- [ ] 장기 키를 가진 사용자가 **기계 전용**이며 사람과 공유되지 않는다
- [ ] 남긴 장기 키에 `aws:SourceIp` 또는 `aws:PrincipalOrgID` 등 **사용 위치 제약**이 걸려 있다
- [ ] 90일 이상 미사용 액세스 키가 **0개**다
- [ ] 사람이 쓰는 액세스 키가 **0개**다
- [ ] EC2 워크로드가 인스턴스 프로파일을 쓰고, User Data·AMI에 자격 증명이 없다
- [ ] CI/CD가 OIDC 페더레이션을 쓰며, 신뢰 정책에 **`sub` 조건이 브랜치/환경 수준까지** 지정되어 있다
- [ ] 리소스 기반 정책의 `Principal`에 IAM **그룹 ARN이 없다**
- [ ] 정책의 `Resource`에 `"*"` 를 쓴 문장이 있다면, 대상이 기밀 이상 데이터가 아님이 확인되었다
- [ ] 자격 증명 보고서(`get-credential-report`)를 **분기마다** 생성해 검토한다
- [ ] `iam:CreateAccessKey`가 SCP로 제한되어 있다(예외 목록 관리) — 37.2
- [ ] 계정 별칭이 설정되어 있다

## ⚠️ 자주 하는 실수

| 실수 | 결과 | 올바른 구성 |
|---|---|---|
| 버킷 정책 `Principal`에 IAM 그룹 ARN을 쓴다 | 정책이 거부되거나, 저장돼도 아무에게도 적용되지 않음 | 아이덴티티 정책을 그룹에 붙이거나, 역할 ARN을 `Principal`에 쓴다 (6.1) |
| `Principal`에 `role/shopmini-*` 부분 와일드카드를 쓴다 | 와일드카드로 동작하지 않음 — 의도한 대상이 접근 실패 | `Condition` + `ArnLike` + `aws:PrincipalArn` (6.2) |
| IAM ARN에 리전을 넣는다 | 매칭되지 않아 정책이 조용히 무효 | IAM·CloudFront·Route 53은 region 필드가 빈다 (6.2) |
| `arn:aws:s3:::bucket/*` 만 쓰고 `ListBucket`이 안 된다고 한다 | 목록 조회 실패 | 버킷 ARN과 객체 ARN을 **두 문장**으로 (6.2) |
| 사용자를 만들고 액세스 키를 함께 발급한다 | 만료 없는 전권 문자열이 생성 — 6.4 시나리오의 시작 | 콘솔 비밀번호 + MFA만. 프로그래밍 접근은 역할 (6.6 Step 5) |
| 사람의 액세스 키를 CI에 재사용한다 | 주체 식별 불가, 회수 시 사람과 파이프라인 동시 중단 | OIDC 페더레이션으로 잡 단위 자격 증명 (6.4) |
| `.env` 커밋을 `git revert`로 되돌리고 끝낸다 | 히스토리에 남아 계속 유출 상태 | 코드 정리가 아니라 **키 폐기**가 대응 (6.4) |
| 유출된 키를 즉시 `delete`한다 | 조사 연결점 소실 — 무엇을 했는지 추적 불가 | 먼저 `Inactive`, CloudTrail 조사 후 삭제 (6.4) |
| OIDC 신뢰 정책에서 `sub` 조건을 생략한다 | GitHub의 **아무 리포지토리나** 그 역할을 맡을 수 있음 | `sub`를 `repo:org/repo:ref:refs/heads/main` 수준까지 (6.4) |
| MFA 강제 정책에 `Bool`을 쓴다 | 액세스 키 호출 등 조건 키가 없는 요청에서 Deny가 통과 | `BoolIfExists` (6.6 Step 4) |
| MFA 강제 정책 예외에 `sts:GetSessionToken`을 빼먹는다 | CLI 사용자가 MFA 승격 세션을 받을 수 없어 잠김 | 예외 목록에 포함 (6.6 Step 4) |
| MFA 강제 정책을 브레이크 글래스 계정에도 붙인다 | 정상 인증 경로가 막혔을 때 쓸 계정이 함께 막힘 | 별도 그룹으로 분리 + 금고 보관 (32.4) |
| 암호 정책에 `--hard-expiry`를 켠다 | 만료 후 스스로 변경 불가 — 계정에서 잠김 | 쓰지 않는다 (6.6 Step 3) |
| `AccessDenied`를 보고 액세스 키를 재발급한다 | 원인은 인가인데 인증을 손봄 — 시간 낭비 | `get-caller-identity`로 프린시펄 확정 후 정책 확인 (6.5) |
| 접근 회수를 "사용자 삭제"로만 한다 | 발급된 장기 토큰·세션이 남아 접근이 유지됨 | 키 비활성화 + 세션 무효화 + 오프보딩 절차 (6.4, 33.3) |
| 인스턴스 프로파일을 붙였으니 안전하다고 본다 | 낮은 권한 프로세스·컨테이너가 IMDS로 자격 증명 탈취 | IMDSv2 강제 + 홉 제한 (8.3) |
| 사용자 1명에게 활성 액세스 키 2개를 상시 유지한다 | 순환 실패 상태 — 어느 키가 어디서 쓰이는지 불명 | 2개 슬롯은 순환 중 겹침용 (6.1) |

## 다음 장 예고

이 장에서 어휘를 확보했습니다. 프린시펄이 무엇이고, 리소스를 어떻게 지목하고, 자격 증명이 어떻게 발급되고 만료되는지 — 그리고 하나의 요청이 **인증과 인가라는 두 관문**을 지난다는 것.

7장은 그 두 번째 관문 안으로 들어갑니다. 정책 문서의 7개 요소(`Version`·`Statement`·`Effect`·`Action`·`Resource`·`Condition`·`Principal`), 정책의 6가지 유형과 각각의 용처, 그리고 이 장에서 계속 미뤄둔 **정책 평가 순서** — 명시적 Deny가 왜 항상 이기는가, SCP·권한 경계·세션 정책이 어떤 순서로 겹치는가 — 를 플로차트로 확정합니다. 그 다음 `aws:PrincipalOrgID`·`aws:SecureTransport`·`aws:MultiFactorAuthPresent` 같은 조건 키로 정책을 좁히는 방법과, 실제로 사고를 만든 **위험한 정책 패턴 10선**을 봅니다.
