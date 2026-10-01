---
chapter: 33
level: "Level 2 — 중급"
title: "Provider 함수와 IAM 정책 문서: ARN과 정책을 문자열로 조립하지 않는다"
difficulty: 중급
reading_time: "30분"
prerequisites: [13, 18]
source_docs:
  - "website/docs/functions/arn_build.html.markdown"
  - "website/docs/functions/arn_parse.html.markdown"
  - "website/docs/functions/trim_iam_role_path.html.markdown"
  - "website/docs/functions/user_agent.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
  - "website/docs/d/caller_identity.html.markdown"
  - "website/docs/d/partition.html.markdown"
  - "website/docs/d/region.html.markdown"
  - "website/docs/index.html.markdown"
  - "docs/add-a-new-function.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/functions/arn_build"
provider_baseline: "6.x"
---

# 33장 — Provider 함수와 IAM 정책 문서: ARN과 정책을 문자열로 조립하지 않는다

**이 장에서 배우는 것**

- provider-defined function이 내장 함수와 무엇이 다른지 설명하고 `provider::aws::` 문법으로 네 함수를 호출할 수 있다.
- `arn_build`·`arn_parse`·`trim_iam_role_path`·`user_agent`의 시그니처와 반환값을 알고 `format`/`split`/`element` 조합을 대체할 수 있다.
- `aws_partition`·`aws_region`·`aws_caller_identity`와 엮어 파티션에 종속되지 않는 ARN을 만들 수 있다.
- `aws_iam_policy_document`의 `statement`·`principals`·`condition`을 인수 단위로 이해하고 렌더링된 JSON을 읽을 수 있다.
- `source_policy_documents`와 `override_policy_documents`의 병합 규칙 차이로 기본 정책 위에 환경별 예외를 얹을 수 있다.
- `user_agent` 함수·provider 인수·`TF_APPEND_USER_AGENT`·`provider_meta`의 적용 범위 차이를 구분할 수 있다.

**왜 중요한가**

`"arn:aws:s3:::${var.bucket}"` 같은 문자열 조립은 상용 리전에서 완벽하게 동작하고, 같은 모듈을 중국 리전(`aws-cn`)이나 GovCloud(`aws-us-gov`)에 배포하는 날 무너진다. 접두어가 `arn:aws-cn:`이어야 하는데 `arn:aws:`로 렌더링된 정책은 **문법 오류가 아니다**. IAM은 유효한 정책으로 받아들이고 단지 어떤 요청과도 매칭되지 않는다. 결과는 apply 성공, 두 시간 뒤 AccessDenied로 시작하는 장애 보고다.

두 번째 사고는 IAM role의 `path`에서 온다. 조직 표준으로 `/service-roles/`를 붙이면 role ARN에는 path가 들어가지만, 그 롤이 API를 호출할 때 만들어지는 세션 ARN에는 **path가 들어가지 않는다**. 정책 조건에서 role ARN을 그대로 비교하면 조건은 영원히 거짓이고, path 없는 개발 계정에서는 통과하던 테스트가 운영에서만 실패한다.

세 번째는 정책 문서의 규모다. 기본 정책이 있고 서비스마다 예외가 필요한데 heredoc JSON으로 관리하면 리뷰어는 "정책이 바뀌었다"까지만 알 뿐 **무엇이 바뀌었는지** 모르게 된다. `source_policy_documents`와 `override_policy_documents`가 이 문제를 위해 있고, 두 인수의 규칙이 정반대라는 것을 모르고 쓰면 예외가 반영되지 않거나 기본 정책이 통째로 사라진다.

## provider-defined function이란 무엇인가

원문 `docs/add-a-new-function.md`가 배경을 밝힌다 — **provider-defined function은 Terraform 1.8에서 도입되었으며** provider 개발자가 특정 클라우드나 용례에 한정된 함수를 노출하게 한 기능이다. 핵심 제약은 Prerequisites 절에 있다. **함수는 실행 사이에 재현 가능해야 한다(순수 함수).** 같은 입력이면 언제나 같은 출력이어야 하고, 이 요구사항은 **네트워크 호출을 배제한다**. AWS API가 필요한 작업은 데이터 소스로 만들라고 명시하며, `provider::aws::account_id()` 같은 함수가 없고 `aws_caller_identity` 데이터 소스가 있는 이유다. 원문은 또 **Plugin Framework만 provider-defined function을 지원**한다고 적는다([42장](../level3-advanced/42-provider-architecture.md)).

호출 문법도 다르다. 내장 함수는 `max(1, 2)`처럼 이름만 쓰지만 provider 함수에는 `provider::<로컬 provider 이름>::<함수 이름>(...)` 형태의 네임스페이스가 붙는다. 가운데 `aws`는 **로컬 이름**이다 — `required_providers`에서 `aws = { source = "hashicorp/aws" }`로 선언했기 때문에 `aws`인 것이지 소스 주소가 들어가는 것이 아니다. 즉 함수를 쓰는 모듈은 그 provider를 선언해야 하고 `terraform init`으로 **provider가 설치되어 있어야** 하며 **provider 버전에도 묶인다**. Terraform 1.8 미만에서는 문법 자체가 파싱되지 않으므로 `required_version = ">= 1.8.0"` 하한을 명시해 둔다.

## `terraform console`로 함수를 직접 호출해 본다

provider 함수는 provider가 설치되어야 하므로 [18장](18-expressions-and-functions.md)의 실험실을 `terraform init`을 먼저 돌린 디렉터리에서 연다.

```console
$ terraform init && terraform console
> provider::aws::arn_build("aws", "iam", "", "444455556666", "role/example")
"arn:aws:iam::444455556666:role/example"

> provider::aws::arn_parse("arn:aws:iam::444455556666:role/example")
{
  "account_id" = "444455556666"
  "partition" = "aws"
  "region" = ""
  "resource" = "role/example"
  "service" = "iam"
}

> provider::aws::trim_iam_role_path("arn:aws:iam::444455556666:role/with/path/example")
"arn:aws:iam::444455556666:role/example"
```

여기서 **잘못된 입력도 한 번 넣어 본다.** 함수는 표현식 평가 단계에서 실행되므로 값이 plan 시점에 알려져 있다면 **plan에서 실패한다**. `format`으로 조립한 문자열은 검증 없이 apply까지 가서 AWS API가 거절해야 실패했다.

## `arn_build`와 `arn_parse`: ARN을 구조로 다룬다

두 함수는 서로의 역이다. 원문 시그니처는 이렇다.

```text
arn_build(partition string, service string, region string, account_id string, resource string) string
arn_parse(arn string) object
```

인수 순서가 곧 ARN의 순서다. 원문 Arguments 절의 정의는 `partition`(지원 값으로 `aws`·`aws-cn`·`aws-us-gov`를 나열한다), `service`(서비스 네임스페이스), `region`(리전 코드), `account_id`(계정 식별자), `resource`(리소스 섹션, 보통 리소스 타입과 식별자)다. IAM처럼 글로벌인 서비스는 `region`이 비고 S3 버킷 ARN은 계정 ID까지 빈다. 원문 예제가 `region` 자리에 `""`를 넣는 이유가 그것이다 — 자리를 **생략할 수 없고 빈 문자열을 넣어야** 한다.

`arn_parse`는 문자열 하나를 받아 **객체**를 돌려주며 필드는 `partition`, `service`, `region`, `account_id`, `resource` 다섯으로 `arn_build`의 인수와 일대일이다. 주의할 것은 `resource`가 **다섯 번째 콜론 이후 전부**라는 점이다. 함수는 ARN의 일반 문법만 알지 서비스별 리소스 문법은 해석하지 않으므로 `role/example`을 더 쪼개는 것은 `trimprefix`·`split`의 일이다.

### 문자열 조립과 무엇이 달라지는가

하드코딩한 파티션은 다른 파티션에서 조용히 무력화되고, `format`은 `%s` 개수만 맞으면 통과하므로 콜론 하나를 빠뜨려도 Terraform은 모른다. 정책 문서의 `Resource`는 검증이 느슨해서 매칭되지 않는 ARN으로도 정책 생성은 성공한다. 파싱 쪽은 더 나쁘다. ARN에서 조각을 꺼내려고 이렇게 쓰는 코드가 흔했다.

```terraform
account_id = element(split(":", var.role_arn), 4)
role_name  = element(split("/", var.role_arn), 1)
```

첫 줄은 우연히 맞는다. 둘째 줄은 **path가 있는 롤에서 틀린다** — `arn:aws:iam::123456789012:role/service-roles/app`을 `/`로 자르면 인덱스 1은 롤 이름이 아니라 `service-roles`다.

함수로 얻는 것은 셋이다. **파티션 하드코딩 제거**, **실패 시점이 apply가 아니라 plan으로 앞당겨짐**, **의도가 코드에 남음**. 얻지 못하는 것도 분명히 하자 — `arn_build`는 **그 ARN이 실제로 존재하는지 확인하지 않는다.** 순수 함수이기 때문이다. 같은 설정 안의 리소스라면 여전히 `aws_sqs_queue.orders.arn`처럼 **속성 참조가 1순위**다. 참조는 의존성 그래프에 잡히고 조립한 문자열은 잡히지 않는다([6장](../level1-beginner/06-references-and-dependencies.md)).

## 파티션·리전·계정: 세 메타 데이터 소스

`arn_build`의 인수 다섯 중 셋은 환경에서 온다.

- `aws_partition` — 인수 없음. 속성은 `partition`(`aws`, `aws-cn` 등), `dns_suffix`(상용 `amazonaws.com`, 중국 `amazonaws.com.cn`), `reverse_dns_prefix`(상용 `com.amazonaws`, 중국 `cn.com.amazonaws`), `id`. 원문은 **`id`를 Deprecated로 표시하고 `partition`을 쓰라고** 한다.
- `aws_region` — 인수 `region`(Optional, 미지정 시 provider 설정 리전), `endpoint`, 그리고 `name`(**Deprecated**, `region`을 쓸 것). 속성 `id`도 **Deprecated**다.
- `aws_caller_identity` — 인수 없음. `account_id`, `arn`, `user_id`, `id`(계정 ID와 같은 값).

서비스 principal 이름(`lambda.amazonaws.com`)도 파티션마다 다르므로 `dns_suffix`가 필요하다. ARN만 대응해 놓고 principal을 하드코딩하면 같은 종류의 조용한 실패가 난다.

이 값들은 provider 설정마다 다르므로 [25장](25-multi-account.md)처럼 alias로 여러 계정을 다룰 때 `provider = aws.audit`를 빼먹으면 잘못된 계정 ID가 정책에 굳는다.

## `trim_iam_role_path`: path가 만드는 불일치

원문 설명은 두 문장이다 — **IAM role ARN에서 path 접두어를 제거한다**, 그리고 **서비스가 path 없는 role ARN을 요구할 때 쓸 수 있다**. 시그니처는 `trim_iam_role_path(arn string) string`이며 원문 예제에서 `role/with/path/example`은 `role/example`이 된다.

`aws_iam_role`의 `path` 기본값은 `/`다. 롤 자체의 ARN은 `arn:aws:iam::444455556666:role/with/path/example`처럼 path를 포함하지만, 이 롤을 assume 해서 만들어진 세션의 ARN은 IAM이 아니라 STS 네임스페이스이고 **path가 빠진 롤 이름과 세션 이름**으로 구성된다.

```text
arn:aws:sts::444455556666:assumed-role/example/session-name
```

여기에서 사고가 난다. "이 세션이 우리 롤인가"를 확인하려고 롤 ARN을 그대로 `assumed-role/` 뒤에 붙이면 `assumed-role/with/path/example/*`이 되어 **어떤 세션과도 매칭되지 않는다**.

```terraform
locals {
  parsed    = provider::aws::arn_parse(provider::aws::trim_iam_role_path(aws_iam_role.app.arn))
  role_name = trimprefix(local.parsed.resource, "role/")   # "example"

  session_arn_pattern = provider::aws::arn_build(
    local.parsed.partition, "sts", "", local.parsed.account_id,
    "assumed-role/${local.role_name}/*")
}
```

이 값을 `condition`에서 `test = "ArnLike"`, `variable = "aws:PrincipalArn"`으로 비교하면 path 유무와 무관하게 동작한다. 두 번째 용도는 원문이 직접 말하는 쪽 — **path 없는 role ARN을 요구하는 서비스**에 값을 넘길 때다. 롤에서 path를 빼면 조직 표준이 깨지므로 넘기는 지점에서만 감싼다.

## `aws_iam_policy_document` 심화: `statement` 인수 지도

[13장](../level1-beginner/13-iam-basics.md)에서 기본 사용법을 봤다. 여기서는 인수 하나가 렌더링된 JSON의 어느 자리에 대응하는지, 그 대응이 직관과 어긋나는 지점은 어디인지를 본다. 원문은 이 데이터 소스를 **선택 사항(optional)**이라고 밝힌다 — 정답이 아니라 도구다.

최상위 인수는 다섯이고 전부 Optional이다. `statement`, `source_policy_documents`(**이어 붙인다**), `override_policy_documents`(**같은 `sid`를 덮는다**), `policy_id`, `version`(유효값 `2008-10-17`·`2012-10-17`, **기본값 `2012-10-17`**). `version`을 내리면 정책 변수와 조건 기능을 잃으므로 기존 정책 재현이 아니면 건드리지 않는다.

`statement`의 하위 인수도 원문 기준 **전부 Optional**이다. 필수가 하나도 없으니 `statement {}` 만 써도 plan이 통과한다.

- `sid` — 구문 식별자. 없으면 JSON에 `"Sid": ""`로 남는다. **병합에서 결정적이다.**
- `effect` — `Allow` 또는 `Deny`. **기본값 `Allow`**. `Deny` 구문에서 빠뜨리면 차단하려던 것을 허용한다.
- `actions` / `not_actions` — 액션 목록, 또는 "나열한 것을 **제외한** 전부".
- `resources` / `not_resources` — 대상 ARN 목록. 원문은 `resources`에 대해 "IAM 정책으로 쓸 경우 AWS가 이것을 요구한다"고 적고 `not_resources`가 `resources`와 **충돌한다(Conflicts)**고 명시한다. 한 구문에 둘 다 쓰면 plan 오류다.
- `principals` / `not_principals`, `condition` — 아래에서 따로 본다.

`not_actions`·`not_resources`는 "이것 빼고 전부"이므로 `Allow`와 쓰면 거의 항상 사고이고 `Deny`와 쓸 때만 가드레일이 된다.

### `principals`: type 하나가 의미를 바꾼다

`principals`와 `not_principals`의 하위 인수는 둘 다 **Required**다. `type`의 유효값은 원문 기준 `AWS`, `Service`, `Federated`, `CanonicalUser`, `*` 다섯이고 `identifiers`에 넣는 값이 type에 따라 다르다.

| `type` | `identifiers` | 원문 예 |
|---|---|---|
| `AWS` | IAM principal ARN | `arn:aws:iam::12345678901:role/yak-role` |
| `Service` | AWS 서비스 롤 | `lambda.amazonaws.com` |
| `Federated` | 웹 아이덴티티 사용자 또는 SAML provider ARN | `accounts.google.com`, `arn:aws:iam::12345678901:saml-provider/yak-saml-provider` |
| `CanonicalUser` / `*` | canonical user ID / 아래 NOTE 참고 | `79a59df9...ef2be` |

한 `statement`에 `principals` 블록을 **여러 개** 둘 수 있고 type이 달라도 된다. 원문의 assume-role 예제가 `Service`, `AWS`, `Federated` 세 블록을 한 구문에 둔다. 함정은 원문 NOTE에 있다 — IAM 문서는 `"Principal": "*"`와 `"Principal": {"AWS": "*"}`가 동등하다고 말하지만 **일부 상황에서는 동작이 다르며**(원문이 드는 예가 **IAM Role Trust Policy**다), 전자는 `type = "*"`, 후자는 `type = "AWS"`로 만든다. 둘 다 "누구나"이므로 **`condition` 없이 쓰지 않는다.**

### `condition`: AND와 OR가 어디에 걸리는가

`condition`의 세 인수는 **전부 Required**다. `test`(IAM 조건 연산자 이름), `variable`(컨텍스트 변수 — 원문은 `aws:` 접두어의 표준 변수이거나 서비스 이름이 접두어인 변수라고 설명한다), `values`(비교할 값 목록).

결합 규칙을 원문 그대로 옮기면 이렇다. **여러 `condition` 블록은 전부 참이어야** 구문이 적용되고(AND), **한 블록의 여러 `values`는 하나만 맞아도** 성립한다(OR). 이 비대칭이 정책을 잘못 쓰게 만드는 주범이다. `test`가 같고 `variable`이 다른 블록을 여러 개 두면 JSON에서는 **하나의 연산자 객체 안에 여러 키**로 합쳐진다.

렌더링에서 읽어 둘 것이 둘이다. **값이 하나면 배열이 아니라 스칼라 문자열**로 나오고, `Action`도 마찬가지여서 원문 예제에 `"Action": "ec2:*"`가 보인다. 그리고 원문 예제 출력에서 `Resource` 배열의 순서가 설정에 적은 순서와 **뒤바뀌어** 나온다. `actions`·`resources`는 순서가 보존되는 목록이 아니므로 **JSON을 문자 단위로 비교하는 테스트를 짜면 안 된다.**

### 정책 변수는 `${...}`가 아니라 `&{...}`

원문이 굵은 NOTE로 경고한다. AWS IAM 정책 문법의 **정책 변수** `${aws:username}`은 Terraform 보간 문법과 **정확히 겹친다**. 해법은 원문이 명시한 규약이다 — **AWS가 처리해야 하는 보간은 `&{...}`로 쓴다.** Terraform은 `&{`를 통과시키므로 렌더링된 JSON에는 `${aws:username}`이 남는다.

예를 들어 `resources = ["arn:aws:s3:::${var.s3_bucket_name}/home/&{aws:username}/*"]`에서 `${var.s3_bucket_name}`은 Terraform이, `&{aws:username}`은 AWS가 처리한다. 같은 것을 `jsonencode`나 heredoc으로 쓰려면 `$${aws:username}`처럼 이스케이프해야 하고 하나만 빠뜨려도 정책 의미가 통째로 달라진다.

## `source_policy_documents` vs `override_policy_documents`

이름이 비슷하고 타입도 같지만(정책 JSON 문자열의 목록) 규칙은 정반대다. 원문 Argument Reference를 옮기면 이렇다.

- **`source_policy_documents`** — 나열된 문서를 하나로 병합한다. 요구사항: 여기 정의된 구문들은 **유일한 `sid`를 가져야 한다**. `override_policy_documents`의 같은 `sid` 구문이 source 구문을 덮는다.
- **`override_policy_documents`** — **비어 있지 않은 `sid`를 가진 구문이 목록에서 앞선 문서의 같은 `sid` 구문을 덮는다.** `source_policy_documents`의 같은 `sid` 구문도 덮는다. 덮지 않는 구문은 그대로 추가된다.

그리고 Argument Reference 앞에 굵게 붙은 NOTE가 전체를 규정한다 — **`sid`가 없는 구문은 덮어쓸 수 없다.**

우선순위는 한 줄로 정리된다 — **`override_policy_documents`(뒤쪽 문서일수록 강함) > 이 문서의 `statement` > `source_policy_documents`**. 원문의 "Example with Both Source and Override"가 최소 형태다 — source의 `ec2:DescribeAccountAttributes`와 override의 `s3:GetObject`가 같은 `sid`를 가지면 결과는 **구문 하나**이고 액션은 `s3:GetObject`다. 원래 액션은 남지 않는다. override는 **추가가 아니라 치환**이다.

`sid`가 빈 구문은 규칙 바깥에 있다. 원문의 source 병합 예제에서 두 문서의 `sid` 없는 구문(`ec2:*`, `lambda:*`)이 결과에 **둘 다** 남는다. 뒤집으면 **나중에 덮을 구문에는 처음부터 `sid`를 붙여야** 한다는 뜻이다. 또 원문의 override 병합 예제 출력은 구문 순서가 선언 순서와 다르므로 **병합 결과의 순서에 의존하지 않는다.**

### 기본 정책 + 환경별 예외

플랫폼 팀의 기본 문서 위에 서비스 팀이 얹는 구조가 흔하다.

```terraform
data "aws_iam_policy_document" "baseline" {
  statement {
    sid       = "DenyOutsideApprovedRegions"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    # condition: aws:RequestedRegion StringNotEquals ["ap-northeast-2"]
  }

  statement {
    sid       = "ReadOwnBucket"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]
  }
}

data "aws_iam_policy_document" "effective" {
  source_policy_documents   = [data.aws_iam_policy_document.baseline.json]
  override_policy_documents = var.environment == "staging" ? [data.aws_iam_policy_document.staging_override.json] : []
}
```

`staging_override`가 `sid = "ReadOwnBucket"` 구문 하나만 담고 있다면 그 구문만 교체되고 `DenyOutsideApprovedRegions` 가드레일은 **그대로 살아남는다**.

## 실전 조합 패턴

**서비스 신뢰 정책 생성기.** 신뢰 정책은 같은 모양이 반복되므로 모듈로 뽑을 가치가 있다. principal을 `"${s}.${data.aws_partition.current.dns_suffix}"`로 만들면 파티션이 바뀌어도 따라가고, `aws:SourceAccount`를 `data.aws_caller_identity.current.account_id`와 비교하는 `condition`은 기본 위생이다 — 없으면 다른 계정의 리소스가 우리 롤을 대신 쓰게 만드는 혼동된 대리인 문제가 열린다.

**크로스 계정 접근.** 상대 계정의 `:root`를 신뢰한다는 것은 "그 계정이 자기 IAM으로 위임한 누구든"이라는 뜻이므로 `sts:ExternalId` 조건이 사실상 필수다. principal ARN은 `arn_build(partition, "iam", "", var.partner_account_id, "root")`다.

**S3 버킷 정책 조건.** 거의 모든 버킷에 두 구문이 들어간다 — 평문 전송 차단(`effect = "Deny"`, `test = "Bool"`, `variable = "aws:SecureTransport"`, `values = ["false"]`)과 지정 VPC 엔드포인트 외 차단(`test = "StringNotEquals"`, `variable = "aws:SourceVpce"`). 둘 다 `principals`를 `type = "*"`, `identifiers = ["*"]`로 열고 조건으로만 좁힌다. 불리언이라도 `values`는 **문자열 목록**이므로 `["false"]`로 적는다. `Deny` + `StringNotEquals`는 **자기 자신을 가둘 수 있다** — CI가 엔드포인트를 거치지 않으면 아무도 버킷을 못 만진다.

**KMS 키 정책.** 키 정책은 그 키의 유일한 권한 원천에 가까워 계정 루트를 잠그면 복구가 어렵다. 계정 루트에 `kms:*`를 주는 관리 구문과 애플리케이션 롤에 `kms:Decrypt`·`kms:GenerateDataKey`만 주는 사용 구문을 분리한다. 키 정책의 `resources`가 `["*"]`인 것은 게으름이 아니다 — 그 키에만 붙는 정책이므로 `*`가 곧 "이 키"다.

## `jsonencode`/heredoc과 언제 갈리는가

`aws_iam_policy_document`가 나은 경우: 정책을 **조립**할 때(환경별 예외, 모듈 재사용), **정책 변수**를 쓸 때, `condition`이 여러 개 얽힐 때, 인수 오타를 plan에서 잡고 싶을 때. `Effect`를 `Alow`로 쓰면 JSON에서는 통과하지만 여기서는 유효값 검증에 걸린다.

`jsonencode`가 나은 경우: **AWS 문서나 벤더가 준 정책을 그대로 복사해 붙일 때**다. 옮겨 적는 과정 자체가 오역의 기회이고 원본과 한 글자씩 대조하기도 어렵다. HCL 객체를 그대로 넣으면 원본 JSON과 구조가 눈으로 대응된다. 원시 heredoc은 가장 나쁘다 — 문법 검사조차 받지 못한다.

내보내는 속성은 `json`과 `minified_json`이다. 후자는 **공백을 뺀 축약본**으로 정책 크기 쿼터에 걸릴 때 도움이 되지만 **마지막 수단**이다 — 먼저 액션이 같은 구문을 합치고, `resources`를 접두어 와일드카드로 줄이고, 그래도 넘치면 관리형 정책을 쪼갠다.

## `user_agent` 함수와 `provider_meta`

마지막 함수는 IAM과 무관하다. 시그니처가 `user_agent(product_name string, product_version string, comment string) string`이고 세 조각을 `이름/버전 (주석)` 형식의 **User-Agent 컴포넌트 문자열**로 조립한다.

`website/docs/index.html.markdown`의 "Custom User-Agent Information" 절은 AWS 클라이언트가 기본적으로 Terraform과 AWS SDK for Go 버전 정보를 User-Agent에 담는다고 설명하고 **추가 정보를 넣는 방법 세 가지**를 나열한다. `user_agent` provider 인수(원문 정의는 "모든 AWS API 호출에서 보내는 User-Agent 문자열에 덧붙일 제품 상세"이며 목록이고 **적은 순서대로** 덧붙는다), `TF_APPEND_USER_AGENT` 환경변수(값이 헤더에 **그대로** 덧붙는다), `provider_meta`의 `user_agent` 인수다. 원문은 셋의 차이를 한 문장으로 정리한다 — **앞의 둘은 그 provider 인스턴스가 관리하는 모든 리소스에 적용되고, `provider_meta` 설정은 그것이 설정된 모듈 안의 리소스에만 적용된다.**

```terraform
provider "aws" {
  user_agent = [
    provider::aws::user_agent("example-demo", "0.0.1", "a comment"),
    "other-demo/0.0.2 (other comment)",
  ]
}
```

```terraform
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }

  provider_meta "aws" {
    user_agent = ["module-demo/0.0.3 (another comment)"]
  }
}
```

함정이 하나 있고 원문이 **두 곳에서**(함수 문서와 index 문서) 경고한다. **함수는 `terraform` 블록 안에서 쓸 수 없다.** 따라서 `provider_meta`의 `user_agent`에는 `provider::aws::user_agent(...)`를 쓸 수 없고 문자열을 직접 적어야 한다.

실무 용도는 모듈 채택률 확인, CI 잡 식별, 스로틀링 조사 때 호출량 출처 역추적([40장](../level3-advanced/40-performance-and-throttling.md))이다. 반대로 **민감 정보를 넣지 않는다** — 모든 AWS API 호출에 실려 나가고 로그에 남는다.

## 흔한 실수

### ❌ ARN 접두어에 `aws`를 박아 넣는다

파티션이 다른 환경에서 정책이 조용히 무력화된다. 오류가 없어 발견이 늦다.

```terraform
resources = ["arn:aws:sqs:ap-northeast-2:123456789012:orders"]
```

```terraform
# ✅ 파티션·리전·계정을 환경에서 받는다
resources = [provider::aws::arn_build(
  data.aws_partition.current.partition, "sqs",
  data.aws_region.current.region,
  data.aws_caller_identity.current.account_id, "orders",
)]
```

### ❌ `split`으로 롤 이름을 잘라 낸다

`path`가 있는 롤에서 인덱스가 어긋난다. 개발 계정에서만 통과한다.

```terraform
role_name = element(split("/", var.role_arn), 1)   # "service-roles"가 나온다
```

```terraform
# ✅ path를 제거한 뒤 파싱한다
role_name = trimprefix(
  provider::aws::arn_parse(provider::aws::trim_iam_role_path(var.role_arn)).resource, "role/")
```

### ❌ 한 `condition`의 `values`에 나열하고 AND를 기대한다

`values` 안은 OR다. 두 조건을 모두 요구하려면 블록을 나눠야 한다.

```terraform
condition {
  test     = "StringEquals"
  variable = "aws:PrincipalTag/team"
  values   = ["payments", "risk"]   # payments "또는" risk
}
```

```terraform
# ✅ AND는 블록 분리로 표현한다
condition {
  test     = "StringEquals"
  variable = "aws:PrincipalTag/team"
  values   = ["payments"]
}

condition {
  test     = "Bool"
  variable = "aws:MultiFactorAuthPresent"
  values   = ["true"]
}
```

### ❌ 나중에 덮을 구문에 `sid`를 붙이지 않는다

원문 NOTE 그대로 **`sid` 없는 구문은 덮어쓸 수 없다**. 배포용 문서의 모든 구문에 안정적인 `sid`를 붙인다.

```terraform
statement {
  actions   = ["s3:GetObject"]   # sid 없음 — 영원히 예외를 못 건다
  resources = ["*"]
}
```

```terraform
# ✅ sid를 계약으로 취급한다
statement {
  sid       = "ReadOwnBucket"
  actions   = ["s3:GetObject"]
  resources = ["*"]
}
```

## 프로덕션 노트

- **`sid`는 API 계약이다.** 기본 문서를 여러 팀이 소비하면 `sid`는 리소스 이름만큼 안정적이어야 한다.
- **함수는 Terraform·provider 버전을 요구한다.** 공개 모듈이라면 `required_version`과 `required_providers`에 하한을 명시한다.
- **정책 JSON을 문자열로 비교하지 않는다.** 순서가 보존되지 않고 단일 값은 스칼라로 렌더링된다. 검증은 파싱 후 구조 비교로 한다.
- **`Deny` + `StringNotEquals`는 자기 자신을 가둘 수 있다.** 적용 전에 Terraform 실행 주체와 긴급 대응 롤이 조건을 통과하는지 본다.
- **User-Agent에 민감 정보를 넣지 않는다.** 모든 API 호출에 실려 CloudTrail에 남는다.

## 연습문제

1. `aws_partition`·`aws_region`·`aws_caller_identity`와 `arn_build`만 써서 현재 계정의 `orders-`로 시작하는 SQS 큐를 가리키는 ARN 패턴을 만들어라. *성공 기준:* `terraform console`에서 `arn:aws:sqs:<현재리전>:<현재계정>:orders-*` 형태로 출력되고, provider 리전을 바꾸면 리전 부분만 따라 바뀐다.
2. `path = "/service-roles/"`인 role을 만들고 그 롤의 세션만 허용하는 버킷 정책을 작성하라. `trim_iam_role_path`·`arn_parse`·`arn_build`를 모두 쓴다. *성공 기준:* 렌더링된 `json`의 `Condition`에 `assumed-role/<롤이름>/*`이 있고 그 문자열에 `service-roles`가 **없다**.
3. `sid`를 붙인 구문 두 개짜리 기본 문서를 만들고, (a) `source_policy_documents`로 구문을 더하는 문서와 (b) `override_policy_documents`로 구문 하나를 교체하는 문서를 작성하라. *성공 기준:* (a)의 결과 구문 수는 3, (b)는 2이며 (b)에서 교체 대상이 아닌 구문의 액션이 그대로 남는다.

## 요약

- provider-defined function은 **Terraform 1.8**에서 도입되었고 `provider::aws::<이름>()`으로 부른다. provider가 설치되어야 하며 Plugin Framework만 지원한다.
- `arn_build(partition, service, region, account_id, resource)`는 다섯 인수를 모두 받고 빈 자리에는 `""`를 넣는다. `arn_parse(arn)`은 같은 이름의 다섯 필드를 가진 객체를 돌려준다.
- `trim_iam_role_path(arn)`은 role ARN에서 path를 제거한다. path 없는 ARN을 요구하는 서비스, 그리고 path가 빠진 STS 세션 ARN과 매칭할 때 쓴다.
- `statement` 하위 인수는 전부 Optional이고 `effect` 기본값은 **`Allow`**다. `condition`의 세 인수와 `principals`의 두 인수는 Required다.
- 여러 `condition` 블록은 AND, 한 블록의 여러 `values`는 OR다. 단일 값은 스칼라로 렌더링되고 `actions`·`resources`의 순서는 보존되지 않는다.
- `source_policy_documents`는 이어 붙이고(`sid` 유일 요구), `override_policy_documents`는 같은 `sid`를 **치환**한다. **`sid` 없는 구문은 덮을 수 없다.** 정책 변수는 `&{aws:username}`으로 쓴다.
- User-Agent 추가 방법 셋 중 provider 인수와 `TF_APPEND_USER_AGENT`는 provider 인스턴스 전체에, `provider_meta`는 해당 모듈에만 적용된다. `terraform` 블록 안에서는 함수를 쓸 수 없다.

## 다음으로

- [34장 — Provider 설정 심화](../level3-advanced/34-provider-configuration-deep.md) — provider 인수 전체 지형.
- [25장 — 멀티 계정](25-multi-account.md) — 크로스 계정 신뢰 정책과 롤 체이닝.
- 공식 문서: [`arn_build`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/functions/arn_build) · [`aws_iam_policy_document`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document)
