---
chapter: 13
level: "Level 1 — 초급"
title: "IAM 기초: role · policy · policy_document"
difficulty: 중급
reading_time: "28분"
prerequisites: [5, 8]
source_docs:
  - "website/docs/r/iam_role.html.markdown"
  - "website/docs/r/iam_policy.html.markdown"
  - "website/docs/r/iam_role_policy_attachment.html.markdown"
  - "website/docs/r/iam_policy_attachment.html.markdown"
  - "website/docs/r/iam_role_policies_exclusive.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
  - "website/docs/d/caller_identity.html.markdown"
  - "docs/design-decisions/exclusive-relationship-management-resources.md"
  - "docs/retries-and-waiters.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role"
provider_baseline: "6.x"
---

# 13장 — IAM 기초: role · policy · policy_document

**이 장에서 배우는 것**

- 신뢰 정책(`assume_role_policy`)과 권한 정책이 서로 다른 질문에 답한다는 것을 이해하고 둘을 구분해 쓴다.
- `aws_iam_role`의 `name`/`name_prefix`, `path`, `permissions_boundary`, `max_session_duration`, `force_detach_policies`가 각각 무엇을 막는지 안다.
- 정책을 붙이는 세 가지 방법을 구분하고 `aws_iam_policy_attachment`가 왜 원문의 경고 대상인지 설명한다.
- `aws_iam_policy_document`로 정책을 조립하고, `source_policy_documents`와 `override_policy_documents`의 병합 규칙 차이로 기본 정책 위에 예외를 얹는다.
- `aws_caller_identity`·`aws_partition`으로 ARN을 조립하고, IAM 최종 일관성이 만드는 권한 오류에 대응한다.

**왜 중요한가**

IAM은 Terraform으로 만드는 리소스 중 **틀렸을 때 아무 일도 일어나지 않는** 종류다. CIDR을 잘못 쓰면 apply가 깨지고 보안 그룹을 열어 두면 스캐너가 잡아낸다. 그러나 롤에 `AdministratorAccess`를 붙이면 apply는 성공하고 애플리케이션도 잘 돈다. 문제는 6개월 뒤 그 자격증명이 유출됐을 때 드러난다. 잘못된 IAM은 증상이 없다.

두 번째 사고는 정책을 붙이는 방식에서 온다. 원문이 `aws_iam_policy_attachment`에 붙인 경고는 provider 문서를 통틀어 손에 꼽게 강하다 — 이 리소스는 **AWS 계정 전체에 걸쳐** 해당 정책이 붙은 모든 user/role/group을 단 하나의 블록이 독점 선언해야 한다. 다른 스택이나 콘솔에서 같은 정책을 붙여 놨다면 그 연결은 다음 apply에 조용히 해제된다. `ReadOnlyAccess` 같은 공용 정책에 잘못 쓰면 한 번의 apply로 조직 절반의 읽기 권한이 사라진다.

세 번째는 타이밍이다. IAM은 최종 일관성(eventual consistency) 서비스여서, 롤을 만들고 정책을 붙인 직후 Lambda를 만들면 "그런 롤이 없다", "그 롤을 쓸 권한이 없다", "권한이 부족하다" 중 하나가 나온다. 원문(`docs/retries-and-waiters.md`)은 이 세 증상을 나열하고 provider가 **2분짜리 표준 타임아웃**으로 재시도한다고 적었다. 이 실패는 예외가 아니라 상시 대비하는 정상 상황이다.

## IAM의 네 조각과 role 중심 사고

IAM은 user(사람), group(user를 묶는 상자), role(주인 없는 신분), policy(허용·거부를 적은 JSON) 네 종류로 이루어진다. 인프라 코드에서 많이 만드는 것은 **role과 policy** 둘이다. user와 group은 조직의 SSO/IdP가 담당하는 경우가 많고, role은 사람이 아니라 **워크로드**의 신분이기 때문이다. EC2 인스턴스, Lambda 함수, ECS 태스크가 AWS API를 부를 때 쓰는 자격증명은 전부 role에서 나온다.

네 조각 뒤에는 조각을 **연결하는** 리소스가 붙는다. 연결 리소스가 유난히 많은 이유는 [35장](../level3-advanced/35-relationship-resources.md)이 다루는 관계 리소스 설계 문제 때문이다. 한편 IAM은 **글로벌 서비스**여서 `aws_iam_role`의 Resource Identity 스키마에는 `name`과 `account_id`만 있고 `region`이 없다.

## 신뢰 정책과 권한 정책은 다른 질문에 답한다

초심자가 가장 오래 헤매는 지점이다. 롤 하나에는 두 종류의 정책이 붙는다.

| | 신뢰 정책 | 권한 정책 |
|---|---|---|
| 질문 | **누가** 이 롤이 될 수 있는가 | 이 롤이 **무엇을** 할 수 있는가 |
| 위치 | `aws_iam_role.assume_role_policy` (Required) | `aws_iam_policy` + attachment, 또는 `aws_iam_role_policy` |
| 개수 | 롤당 하나 | 롤당 여러 개 |
| 핵심 요소 | `Principal`, `sts:AssumeRole` | `Action`, `Resource`, `Effect` |

`aws_iam_role`에서 **Required는 `assume_role_policy` 하나뿐**이다. `name`조차 Optional이다. 권한 없는 롤은 있어도 누가 빌려 쓸 수 있는지 정해지지 않은 롤은 없다는 뜻이다. 원문은 주의를 붙인다 — `assume_role_policy`는 표준 IAM 정책과 **조금 다르며 `aws_iam_policy` 리소스를 쓸 수 없다**. 그러나 `aws_iam_policy_document`는 쓸 수 있다.

```terraform
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "example-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}
```

`principals.type`은 `AWS`(IAM 주체 ARN), `Service`(`lambda.amazonaws.com`), `Federated`(웹 아이덴티티 또는 SAML provider ARN), `CanonicalUser`, `*` 다섯 가지다. 원문이 NOTE로 못 박은 함정도 있다 — AWS 문서는 `"Principal": "*"`와 `"Principal": {"AWS": "*"}`가 동등하다고 적지만 **롤 신뢰 정책에서는 동작이 다르다**. 앞은 `type = "*"`, 뒤는 `type = "AWS"`에 각각 `identifiers = ["*"]`를 쓴다. `principals` 블록은 여러 개 둘 수 있다([25장](../level2-intermediate/25-multi-account.md)).

## `aws_iam_role` 인수 해부

- **`name` / `name_prefix`** — 둘 다 Optional, 둘 다 **Forces new resource**, 서로 충돌한다. 롤 교체는 단순한 재생성이 아니다 — 그 롤을 참조하던 다른 계정의 신뢰 정책과 인스턴스 프로파일이 전부 옛 롤을 가리키기 때문이다.
- **`path`** — Optional이며 Forces new가 **아니다**. 일부 AWS 서비스가 path 있는 롤 ARN을 거부하므로 provider가 `provider::aws::trim_iam_role_path(arn)` 함수를 제공한다.
- **`permissions_boundary`** — 정책 ARN을 받아 권한의 **상한선**을 정한다. 롤에 `AdministratorAccess`가 붙어 있어도 boundary가 S3만 허용하면 실효 권한은 S3뿐이다.
- **`max_session_duration`** — 초 단위. 지정하지 않으면 기본 최대치인 **1시간**이 적용되고 설정 범위는 **1시간에서 12시간**이다.
- **`force_detach_policies`** — 기본값 `false`. `aws_iam_policy_attachment`로 정책을 붙인 상태에서 롤의 `name`이나 `path`를 바꾸려면 이것을 `true`로 **먼저 적용해 둬야** `DeleteConflict`를 피한다. 권장 리소스인 `aws_iam_role_policy_attachment`에는 이 요구가 없으니, 이 인수가 필요하다는 것 자체가 위험한 attachment를 쓰고 있다는 신호다.
- **`inline_policy` / `managed_policy_arns`** — 둘 다 `(Optional, **Deprecated**)`다. 각각 인라인 정책과 관리형 정책 연결을 **배타적으로** 관리하며, 원문은 `aws_iam_role_policy_attachment`·`aws_iam_role_policy` 같은 다른 방식과 **호환되지 않는다**고 경고한다. 섞으면 매 apply마다 붙었다 떨어지는 "resource cycling"이 생긴다.

빈 값의 의미를 특히 조심한다. `inline_policy {}`나 `managed_policy_arns = []`는 밖에서 추가된 **모든** 정책을 apply 때 제거한다. 반대로 `managed_policy_arns`를 아예 설정하지 않으면 Terraform은 정책 연결을 **무시**한다.

내보내는 속성은 `arn`, `name`, `id`(롤 이름과 같다), `unique_id`, `create_date`다. `id`가 롤 이름이라는 점이 `aws_iam_role_policy`의 `role`에 `.id`를 넘기는 관용구의 근거이며, import ID도 롤 이름이다.

## 정책을 붙이는 세 가지 방법

**1. `aws_iam_role_policy` — 인라인 정책.** 롤에 직접 붙고 롤이 사라지면 같이 사라진다. 인수는 `name`, `role`(롤의 `id`), `policy`다.

**2. `aws_iam_role_policy_attachment` — 관리형 정책 하나를 롤 하나에 연결.** 인수는 `role`(Required, 롤의 **이름**)과 `policy_arn`(Required) 둘뿐이고 아무 속성도 내보내지 않는다. **평소에 쓸 것은 이것이다.** 다른 팀이 같은 정책을 자기 롤에 붙여도 우리 쪽에는 영향이 없다. import ID는 롤 이름과 정책 ARN을 `/`로 이은 문자열이다.

**3. `aws_iam_policy_attachment` — 쓰지 않는다.** 다음 절에서 본다.

재사용되는 권한 묶음이면 `aws_iam_policy` + attachment를, 그 롤 전용 권한이면 `aws_iam_role_policy`를 쓴다.

## 배타적 연결: 위험한 것과 의도된 것

원문은 `aws_iam_policy_attachment`에 `!>` 수준의 경고를 달았다. 규약상 `!>`는 **되돌릴 수 없는 변경과 데이터 손실**에 쓰는 표기다(14장). 이 리소스는 IAM 정책의 **배타적 연결**을 만든다 — 계정 전체에 걸쳐 하나의 정책이 붙은 모든 user/role/group을 **단 하나의** 블록이 선언해야 하며, 다른 방식으로 그 정책을 받은 대상이 있다면 이 리소스가 그 연결을 **취소한다**.

겉모습은 무해하다. 인수는 `name`(Required, 빈 문자열 불가), `users`/`roles`/`groups`(각각 Optional), `policy_arn`(Required)뿐이라 편해 보이기까지 한다. 원문은 대체재로 `aws_iam_role_policy_attachment` 계열을 명시하고, 함께 쓰면 **영구히 diff가 뜬다**고 덧붙인다. 또 다른 NOTE는 `policy_arn`을 문자열로 조립하지 말라고 한다 — 조립하면 의존성이 그래프에 잡히지 않아 파괴 순서가 뒤집히고 `DeleteConflict`가 난다.

그렇다면 왜 "배타적"이라는 개념이 존재하는가. 설계 문서 `exclusive-relationship-management-resources.md`가 역사를 정리한다. 초기 provider는 1:N 관계를 부모의 인수로 표현했고(`aws_iam_role.inline_policy`), 그 탓에 자식 하나를 만들다 실패하면 **부분적으로만 프로비저닝된 상태**가 남았다([12장](12-s3-bucket.md)의 S3 분해와 같은 문제다). 대신 부모가 관계를 **독점**한다는 이점이 있었는데, 관계를 독립 리소스로 옮기자 그 보장이 사라졌다. 그 격차 때문에 `inline_policy`를 deprecate 할 수 없었다.

`_exclusive` 접미어가 그 격차를 메운다. 부모 식별자 인수 하나, 자식 식별자 집합 인수 하나(빈 집합은 모든 관계 제거), 현재 상태를 읽어 조정하는 능력, 기존 관계의 소유권을 **파괴 없이 인수**하는 능력이 규정된 특성이다.

```terraform
resource "aws_iam_role_policies_exclusive" "example" {
  role_name    = aws_iam_role.example.name
  policy_names = [aws_iam_role_policy.example.name]
}
```

둘 다 Required이며 `policy_names`에 없는 인라인 정책은 제거되므로, 원문의 `!>` 경고는 함께 관리하는 `aws_iam_role_policy`를 **반드시 `policy_names`에 포함**시키라고 말한다. `policy_names = []`는 인라인 정책 생성을 **막지 못한다** — 조정은 `apply`를 돌릴 때만 일어나므로 가드레일이 아니라 정기 청소부다. destroy 하면 조정을 그만둘 뿐 **정책은 롤에 남는다**.

import에서는 문서와 방침이 갈린다. 이 리소스 문서에는 `role_name`으로 import 하는 절이 있지만, 나중에 나온 설계 결정은 **배타적 리소스 타입에 import를 구현하지 않기로** 정했다. 기존 인프라를 받아들였다고 생각한 다음 apply가 설정에 없는 관계를 지울 수 있기 때문이다.

## `aws_iam_policy_document` 해부

원문은 이 데이터 소스를 쓰는 것이 **선택 사항**이라고 밝힌다. 최상위 인수는 `statement`, `source_policy_documents`, `override_policy_documents`, `policy_id`, `version`(`2008-10-17` 또는 `2012-10-17`, 기본값 `2012-10-17`) 다섯이다.

`statement`의 하위 인수는 원문 기준 **전부 Optional**이다.

- `sid` — 구문 식별자.
- `effect` — `Allow` 또는 `Deny`. **기본값 `Allow`**.
- `actions` / `not_actions` — 액션 목록, 또는 "이것들을 제외한 전부".
- `resources` / `not_resources` — 대상 ARN 목록. 서로 충돌한다. 원문은 `resources`에 대해 "IAM 정책으로 쓸 경우 AWS가 이것을 요구한다"고 적었다.
- `principals` / `not_principals`, `condition`.

`effect` 기본값이 `Allow`라는 점은 위험하다 — `Deny` 구문에서 빼먹으면 조용히 허용 정책이 된다. `not_actions`/`not_resources`는 "이것 빼고 전부"이므로 `Allow`와 쓰면 거의 항상 실수지만 `Deny`와는 가드레일로 유용하다.

`condition`은 세 인수 모두 **Required**다. `test`(IAM 조건 연산자), `variable`(컨텍스트 변수 이름), `values`(비교할 값 목록). 논리 결합 규칙을 정확히 기억해야 한다. **여러 `condition` 블록은 전부 참이어야** 구문이 적용되고(AND), **한 블록 안의 여러 `values`는 하나만 맞아도** 성립한다(OR).

## 병합 규칙과 정책 변수

두 인수는 이름이 비슷하지만 규칙이 정반대이고, 이 차이가 이 데이터 소스를 쓰는 가장 큰 이유다.

- **`source_policy_documents`** — 나열된 문서를 이어 붙이는 **합집합**이다. 원문의 요구사항은 "여기 정의된 구문들은 **유일한 `sid`를 가져야 한다**".
- **`override_policy_documents`** — 순서대로 진행하며 `sid`가 같은 구문을 만나면 **뒤의 것이 앞의 것을 덮는다**. `source_policy_documents`에서 온 같은 `sid` 구문도 덮는다.

원문 예제로 확인하면 빠르다. `source`와 `override`에 같은 `sid`로 서로 다른 액션을 두고 합치면 결과 JSON에는 **구문이 하나만** 남고 액션은 override 쪽 것이다. 결정적인 제약도 하나 있다. 원문 NOTE: **`sid`가 없는 구문은 덮어쓸 수 없다.** 나중에 예외를 얹을 기본 정책을 만들 생각이라면 처음부터 **모든 구문에 `sid`를 붙여야** 한다.

플랫폼 팀이 `sid`를 붙인 기본 문서를 만들고 서비스 팀이 `source_policy_documents`로 그 위에 자기 구문을 얹는 것이 전형적인 사용법이다.

IAM 정책 언어에는 `${aws:username}` 같은 자체 변수 문법이 있는데 Terraform의 보간 문법과 **정확히 겹친다**. 원문의 해법은 명확하다 — **AWS가 처리해야 하는 보간은 `&{...}`로 쓴다.** Terraform은 `&{`를 자기 것으로 보지 않고 통과시키므로 렌더링된 JSON에는 `${aws:username}`이 남는다.

```terraform
resources = ["arn:aws:s3:::${var.s3_bucket_name}/home/&{aws:username}/*"]
```

한 문자열 안에 `${var.s3_bucket_name}`(Terraform이 처리)과 `&{aws:username}`(AWS가 처리)이 공존한다. `jsonencode()`나 heredoc으로 같은 것을 쓰려면 `$${aws:username}` 같은 이스케이프가 필요하고, 하나만 빠져도 정책 의미가 통째로 달라진다.

내보내는 속성은 `json`과 `minified_json`(공백을 뺀 축약본)이다. 후자는 장식이 아니다 — AWS가 정책 문서 크기에 쿼터를 두므로 공백을 빼는 것만으로 한계를 넘기지 않을 수 있다.

원문은 `assume_role_policy`와 `aws_iam_policy.policy` 양쪽에 같은 NOTE를 붙여 `jsonencode()` 또는 이 데이터 소스를 쓰라고 권한다. 즉 **원시 문자열/heredoc은 권장되지 않는다**. 데이터 소스가 나은 점은 plan 단계 **검증**, 두 인수를 통한 **병합**, 일정한 **정렬**(AWS가 정규화한 값과 어긋나 diff가 뜨는 일이 적다), **정책 변수** 처리 넷이다.

## 인스턴스 프로파일과 ARN 조립

EC2 인스턴스는 롤을 직접 붙일 수 없다. 사이에 **인스턴스 프로파일**이 있고 이것이 롤을 감싼다. Terraform에서는 `aws_iam_instance_profile`이며 `role`과 `name`을 쓴다. 붙이는 쪽 모양은 리소스마다 다르다. `aws_instance`의 `iam_instance_profile`은 **프로파일의 이름**을 문자열로 받으며(ARN이 아니다) 자격증명에 `iam:PassRole` 권한이 필요하고, `aws_launch_template`에서는 인수가 아니라 **블록**이며 그 안의 `arn`과 `name`이 서로 충돌한다.

```terraform
resource "aws_iam_instance_profile" "app" {
  name = "example-app-profile"
  role = aws_iam_role.app.name
}

resource "aws_instance" "app" {
  # ... ami / instance_type ...
  iam_instance_profile = aws_iam_instance_profile.app.name
}
```

같은 개념에 모양이 셋인 셈이고, 리소스마다 문서를 확인해야 하는 이유가 여기 있다([14장](14-reading-resource-docs.md)). 인스턴스 프로파일은 **EC2 전용 다리**다 — ECS는 롤 ARN을 직접 받고 EKS는 OIDC 연동을 쓴다.

최소 권한 설계에서 가장 흔한 타협은 `resources = ["*"]`다. `ec2:DescribeInstances` 같은 일부 액션은 리소스 수준 권한을 지원하지 않아 불가피하지만, S3·DynamoDB·SQS처럼 ARN을 받는 액션에서는 거의 항상 게으름이다. ARN을 하드코딩하지 않으려면 `aws_caller_identity`(`account_id`·`arn`·`user_id`)와 `aws_partition`(`partition`·`dns_suffix`·`reverse_dns_prefix`)을 쓴다. 중국 리전과 GovCloud에서 ARN 접두어가 다르기 때문이다.

```terraform
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

# statement 안에서
resources = [
  "arn:${data.aws_partition.current.partition}:sqs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:orders-*",
]
```

가능하면 조립보다 **리소스의 `arn` 속성을 직접 참조**한다. 참조는 의존성 그래프에 잡히고 조립한 문자열은 잡히지 않는다. `aws_partition`의 `id`는 `(**Deprecated**)`이므로 `partition`을 쓴다.

## IAM 최종 일관성과 정책 크기

`docs/retries-and-waiters.md`의 "IAM Error Retries" 절이 이 문제를 다룬다. 롤 생성 -> 정책 연결 -> 다른 서비스에서 그 롤 참조가 빠르게 이어지면 세 증상 중 하나가 나온다 — 롤이 없다, 그 롤을 사용할 권한이 없다(assume role 권한), 권한이 충분하지 않다(롤에 붙은 권한).

원문은 서비스 API마다, 심지어 같은 API의 작업마다도 이 오류의 구현이 제각각이라고 적는다. 그래서 provider는 `internal/service/iam`에 **2분짜리 표준 타임아웃 상수**를 두고 IAM 관련 모든 재시도에 쓴다. 원문 표현으로는 "모든 AWS API를 다룬 수년간의 운영 경험에서 도출된" 값이며, 대부분의 타이밍 문제는 이 재시도가 흡수한다.

코드에서 할 수 있는 일은 순서를 거는 것이다. Lambda의 `role`에 `aws_iam_role.lambda.arn`을 쓰면 롤 다음에 함수가 만들어진다. 그러나 **정책 연결은 그 그래프에 없다** — 함수는 롤만 참조하지 attachment는 참조하지 않는다. 그래서 `depends_on`이 필요하다.

```terraform
resource "aws_lambda_function" "worker" {
  function_name = "example-worker"
  role          = aws_iam_role.lambda.arn
  # ... 나머지 설정 ...

  depends_on = [aws_iam_role_policy_attachment.lambda_logs]
}
```

`aws_iam_policy`의 **`delay_after_policy_creation_in_ms`** 도 같은 계열이다 — 정책을 만든 뒤 그 버전을 기본값으로 설정하기까지 기다릴 밀리초이며, 원문은 "S3 IO 부하가 매우 높은 환경에서 필요할 수 있다"고 설명한다. 자세한 것은 [45장](../level3-advanced/45-errors-retries-waiters.md)에서 본다.

정책 크기도 실제 한계다. AWS는 관리형 정책 본문, 롤의 인라인 정책 총합, 신뢰 정책에 각각 문자 수 쿼터를 둔다(값은 AWS IAM 쿼터 문서에서 확인한다). 부딪히면 `resources`를 와일드카드로 줄이고, 같은 `resources`에 액션만 다른 구문들을 합치고, 그래도 넘치면 **관리형 정책 여러 개로 쪼갠다**. `minified_json`은 마지막 수단이다.

## 흔한 실수

### ❌ 신뢰 정책에 권한을 적는다

`assume_role_policy`에 `s3:GetObject`를 적는다. 신뢰 정책도 IAM 정책 문법을 따르므로 apply는 성공하지만, 이 롤은 아무 권한도 없고 아무도 assume 할 수 없다.

```terraform
resource "aws_iam_role" "broken" {
  name = "broken-role"

  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["s3:GetObject"], Resource = "*" }]
  })
}
```

```terraform
# ✅ 신뢰 정책은 "누가"만, 권한은 별도 정책으로
resource "aws_iam_role" "worker" {
  name               = "example-worker-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json # sts:AssumeRole + principals
}

resource "aws_iam_role_policy" "read_objects" {
  name   = "read-objects"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.read_objects.json
}
```

### ❌ 공용 관리형 정책에 `aws_iam_policy_attachment`를 쓴다

의도는 "이 정책을 이 롤에 붙이자"지만 실제 의미는 "이 정책은 계정 전체에서 오직 여기에만 붙어 있어야 한다"다. apply 한 번으로 `ReadOnlyAccess`가 붙어 있던 **다른 모든** 대상의 연결이 해제된다.

```terraform
resource "aws_iam_policy_attachment" "readonly" {
  name       = "readonly-attach"
  roles      = [aws_iam_role.audit.name]
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
```

```terraform
# ✅ 대상별 attachment 리소스는 다른 곳의 연결에 간섭하지 않는다
resource "aws_iam_role_policy_attachment" "audit_readonly" {
  role       = aws_iam_role.audit.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
```

### ❌ `inline_policy`와 `aws_iam_role_policy`를 섞어 쓴다

`inline_policy`가 인라인 정책을 배타적으로 관리하므로, 옆에서 만든 `aws_iam_role_policy` 쪽 정책이 apply마다 지워지고 다시 만들어진다. 원문이 말하는 resource cycling이다.

```terraform
resource "aws_iam_role" "mixed" {
  name               = "mixed-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  inline_policy {
    name   = "policy-a"
    policy = data.aws_iam_policy_document.a.json
  }
}

resource "aws_iam_role_policy" "b" {
  role = aws_iam_role.mixed.id # 매 apply마다 지워졌다 다시 만들어진다
  # ... name / policy ...
}
```

```terraform
# ✅ 인라인 정책은 전부 별도 리소스로. 독점이 필요하면 _exclusive를 명시적으로 쓴다
resource "aws_iam_role_policies_exclusive" "clean" {
  role_name    = aws_iam_role.clean.name
  policy_names = [aws_iam_role_policy.a.name, aws_iam_role_policy.b.name]
}
```

### ❌ 여러 조건을 OR로 착각한다

"운영 계정에서 왔거나 특정 VPC 엔드포인트를 통해 왔으면 허용"을 의도하고 `condition` 블록을 둘 쓴다. 실제 의미는 **둘 다 만족해야 허용**이라 엔드포인트를 거치지 않은 운영 계정 요청은 거부된다.

```terraform
data "aws_iam_policy_document" "broken_or" {
  statement {
    effect  = "Allow"
    actions = ["s3:GetObject"]
    # ... resources 생략 ...

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = ["123456789012"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceVpce"
      values   = ["vpce-0123456789abcdef0"]
    }
  }
}
```

```terraform
# ✅ 같은 변수의 여러 값은 OR로 평가된다
data "aws_iam_policy_document" "fixed_or" {
  statement {
    sid = "AllowFromKnownAccounts"
    # ... effect / actions / resources 동일 ...

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = ["123456789012", "210987654321"]
    }
  }
}
```

## 프로덕션 노트

- **롤 이름은 교체를 부른다.** 이름 하나 고치는 PR이 롤 교체를 일으키고, 그 롤을 신뢰하던 다른 계정의 정책과 인스턴스 프로파일이 함께 깨진다.
- **permissions boundary를 셀프서비스의 조건으로 건다.** 롤 생성 권한에 "boundary가 붙은 롤만 만들 수 있다"는 `condition`을 걸면 권한 상승 경로가 닫힌다.
- **`attachment_count`로 죽은 정책을 찾는다.** 이 속성을 output으로 뽑아 두면 아무 데도 붙어 있지 않은 관리형 정책을 정리할 수 있다. IAM 계정 쿼터는 생각보다 빨리 찬다.
- **IAM 변경은 plan 리뷰의 별도 항목으로 둔다.** IAM diff는 JSON 한 덩어리라 눈에 잘 들어오지 않는다. `aws_iam_*`가 포함된 plan에 별도 승인자를 붙이고 `AdministratorAccess` 문자열을 grep 하는 CI 체크를 둔다.
- **최종 일관성은 CI에서 먼저 드러난다.** 로컬에서는 apply 사이에 사람이 손대는 시간이 있지만 CI는 밀리초 단위로 이어 붙인다. 간헐적으로 깨지는 IAM 테스트는 전파 지연인 경우가 많다. 한편 `_exclusive` 리소스는 import 하지 말고, 기존 롤에 적용할 때 붙어 있는 인라인 정책을 먼저 조사해 `policy_names`에 전부 나열한다.

## 연습문제

**1. 신뢰 정책과 권한 정책 분리하기.** Lambda가 assume 할 수 있는 롤을 만들고, CloudWatch Logs 로그 그룹 하나에만 쓸 수 있는 관리형 정책을 만들어 `aws_iam_role_policy_attachment`로 연결한다. 로그 그룹 ARN은 리소스 속성을 참조한다.
*성공 기준:* `aws iam get-role`의 `AssumeRolePolicyDocument`에 `sts:AssumeRole`과 `lambda.amazonaws.com`만 있고, `list-attached-role-policies` 결과가 정확히 하나다.

**2. 병합 규칙 직접 확인하기.** 구문 두 개(하나는 `sid` 있음, 하나는 없음)를 가진 기본 문서와, 같은 `sid`로 `effect = "Deny"`인 문서를 만든 뒤 `source_policy_documents`로 합쳤을 때와 `override_policy_documents`로 합쳤을 때의 `json`을 비교한다.
*성공 기준:* 두 결과의 구문 개수와 `Effect` 값이 어떻게 다른지 설명하고, `sid` 없는 구문이 왜 덮이지 않았는지 원문 규칙과 연결해 두 줄로 적는다.

**3. 배타적 리소스와 최종 일관성 관찰하기.** 롤 하나에 `aws_iam_role_policy` 두 개를 만들고 `aws_iam_role_policies_exclusive`에 그중 **하나만** 나열한 뒤 plan을 본다. 이어서 같은 롤을 쓰는 Lambda 함수를 `depends_on` 없이 만든다.
*성공 기준:* 나열하지 않은 정책이 어떻게 되는지 예측한 뒤 apply로 확인하고, Lambda 쪽 권한 오류가 났다면 `depends_on`으로 사라지는 것을, 나지 않았다면 왜 재시도로 흡수됐는지를 설명한다.

## 요약

- `aws_iam_role`에서 Required는 `assume_role_policy` 하나뿐이다. **신뢰 정책**은 "누가 이 롤이 될 수 있는가"만, 권한 정책은 "무엇을 할 수 있는가"를 답한다.
- `name`/`name_prefix`는 둘 다 **Forces new resource**이고 서로 충돌한다. `path`는 교체를 유발하지 않지만 path 있는 ARN을 거부하는 서비스가 있어 `trim_iam_role_path`가 있다. `max_session_duration`은 미지정 시 1시간, 범위는 1~12시간이다.
- `inline_policy`와 `managed_policy_arns`는 **Deprecated**이며 배타적이다. `inline_policy {}`나 `managed_policy_arns = []`는 "아무것도 안 함"이 아니라 "전부 제거"다.
- 정책을 붙이는 방법은 `aws_iam_role_policy`(인라인), `aws_iam_role_policy_attachment`(**평소에 쓸 것**), `aws_iam_policy_attachment`(계정 전역 배타적, `!>` 경고 대상) 셋이다.
- `_exclusive` 계열은 관계를 독립 리소스로 옮기면서 잃은 독점 관리를 되찾는 패턴이다. `aws_iam_role_policies_exclusive`는 `role_name`과 `policy_names`를 받고, 파괴해도 정책을 지우지 않으며, **import를 지원하지 않는 방향**이다. 신뢰 정책에서 `"Principal": "*"`와 `{"AWS": "*"}`의 동작이 다르다는 점도 함께 기억한다.
- `statement`의 하위 인수는 전부 Optional이고 `effect` 기본값은 `Allow`다. `condition`의 세 인수는 모두 Required이며 **여러 블록은 AND, 한 블록의 여러 값은 OR**다.
- `source_policy_documents`는 유일한 `sid`를 요구하는 합집합 병합, `override_policy_documents`는 같은 `sid`를 덮는 병합이다. **`sid` 없는 구문은 덮어쓸 수 없고**, 정책 변수는 `&{}`로 쓴다.
- IAM은 최종 일관성 서비스다. 롤 생성 -> 정책 연결 -> 다른 서비스 참조가 빠르게 이어지면 세 가지 권한 오류가 나오며, provider는 **2분 표준 타임아웃**으로 재시도한다. attachment는 `depends_on`으로 명시한다.

## 다음으로

- [14장 — 리소스 문서 읽는 법](14-reading-resource-docs.md) — `(Required)`, `(Forces new resource)`, `(Deprecated)`, `!>` 표기의 규약.
- [25장 — 멀티 계정](../level2-intermediate/25-multi-account.md) — 신뢰 정책에 `condition`을 걸어 계정 간 접근을 좁히는 패턴과 OIDC 연동.
- [35장 — 관계 리소스와 `*_exclusive`](../level3-advanced/35-relationship-resources.md) — 소유권 경계 설계 전반과 provider 함수([33장](../level2-intermediate/33-provider-functions-and-policies.md)).
- 공식 문서: [aws_iam_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role) · [aws_iam_policy_document](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document)
