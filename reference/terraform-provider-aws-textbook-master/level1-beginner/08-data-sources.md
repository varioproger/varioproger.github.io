---
chapter: 8
level: "Level 1 — 초급"
title: "데이터 소스: 내가 만들지 않은 것을 읽기"
difficulty: 입문
reading_time: "30분"
prerequisites: [5, 7]
source_docs:
  - "website/docs/d/caller_identity.html.markdown"
  - "website/docs/d/region.html.markdown"
  - "website/docs/d/partition.html.markdown"
  - "website/docs/d/availability_zones.html.markdown"
  - "website/docs/d/ami.html.markdown"
  - "website/docs/d/vpc.html.markdown"
  - "website/docs/d/subnets.html.markdown"
  - "website/docs/d/ssm_parameter.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
  - "website/docs/guides/version-6-upgrade.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami"
provider_baseline: "6.x"
---

# 8장 — 데이터 소스: 내가 만들지 않은 것을 읽기

**이 장에서 배우는 것**

- `data` 블록이 `resource` 와 무엇이 같고 무엇이 다른지 설명하고, 데이터 소스가 언제 읽히는지 예측할 수 있다.
- `aws_caller_identity`, `aws_region`, `aws_partition` 으로 계정·리전·파티션을 얻고 ARN을 안전하게 조립할 수 있다.
- `aws_availability_zones` 에서 Local Zone을 걸러내고, `names` 와 `zone_ids` 중 무엇을 써야 하는지 판단할 수 있다.
- `aws_ami` 의 v6 필수 요건을 지키고, "항상 최신 AMI"가 인스턴스를 재생성하는 문제를 SSM Parameter로 고정할 수 있다.
- `aws_vpc`, `aws_subnets` 로 남의 인프라를 찾고, 결과가 비었을 때의 동작 차이와 시크릿 데이터 소스가 state에 남기는 것을 안다.

**왜 중요한가**

Terraform으로 관리하는 리소스는 언제나 세상의 일부다. 나머지는 다른 팀이 만들었거나 콘솔에서 손으로 만들어졌거나 AWS가 기본으로 넣어 둔 것이다. 참조하는 방법은 둘뿐이다 — **ID를 하드코딩하거나, 데이터 소스로 읽거나.** 첫 번째를 택하면 그 코드는 그 계정, 그 리전에서만 돈다. 스테이징 계정에 배포하면 존재하지 않는 `vpc-0a1b...` 를 가리키다 실패하고, 운 나쁘면 우연히 존재하는 **다른 VPC**를 가리켜 성공한다.

가장 비싼 사고는 AMI에서 나온다. `aws_ami` 에 `most_recent = true` 를 걸어 "항상 최신 Amazon Linux"를 쓰도록 해 둔 팀이 있다고 하자. AWS가 새 AMI를 릴리스하면 아무도 코드를 건드리지 않았는데 다음 plan에 **EC2 인스턴스 교체**가 뜬다. `ami` 는 교체를 유발하는 인수이기 때문이다. 배포 파이프라인이 자동으로 apply까지 한다면 프로덕션 인스턴스가 새벽에 갈린다. 같은 이유로 v6는 `most_recent = true` 에 `owners` 나 `image-id`/`owner-id` filter를 **필수로 요구**하도록 바꿨다.

두 번째는 조용한 사고다. IAM 정책에 `"arn:aws:s3:::my-bucket"` 이라고 적힌 코드는 상용 리전에서 잘 돈다. 같은 코드를 GovCloud나 중국 리전에 배포하면 파티션이 `aws-us-gov`, `aws-cn` 이라 그 ARN은 **아무것도 가리키지 않는다.** 정책은 유효하고 apply도 성공하며 권한만 조용히 작동하지 않는다. `aws_partition` 한 줄이 이 문제를 없앤다.

## `data` 블록: 리소스와 무엇이 다른가

```terraform
data "aws_vpc" "selected" {
  id = var.vpc_id
}

resource "aws_subnet" "app" {
  vpc_id     = data.aws_vpc.selected.id
  cidr_block = cidrsubnet(data.aws_vpc.selected.cidr_block, 4, 1)
}
```

문법은 `resource` 와 같다 — 블록 타입만 `data` 로 바뀌고 레이블 두 개가 따라온다. 참조할 때는 앞에 `data.` 가 붙어 `data.aws_vpc.selected.id` 가 되며, 이 접두어 덕분에 `aws_vpc` 처럼 같은 이름의 리소스와 데이터 소스가 공존해도 충돌하지 않는다.

다른 점은 셋이다.

**만들지 않는다.** `Describe*`/`Get*` 계열 API만 호출하므로 `terraform destroy` 를 해도 읽은 대상은 지워지지 않고 state에서 항목만 사라진다. 그래서 "남의 인프라를 읽는" 용도로 안전하다.

**매번 다시 읽는다.** 리소스는 state에 기록된 값으로 diff를 계산하지만 데이터 소스는 refresh 때마다 AWS에 물어본다. 즉 값이 **plan을 돌릴 때마다 달라질 수 있다.** `aws_ami` 가 위험한 이유가 이것이다.

**인수가 검색 조건이다.** 리소스에서 `cidr_block = "10.0.0.0/16"` 은 "이렇게 만들어라"지만 데이터 소스에서는 "이런 CIDR을 가진 것을 찾아라"다. 그래서 문서의 Argument Reference가 대부분 Optional이고, "설정에 포함되지 않은 필드는 선택된 대상의 데이터로 채워진다".

## 언제 읽히는가 — plan 시점과 apply 시점

이것이 데이터 소스에서 가장 자주 사람을 무는 지점이다.

데이터 소스의 **모든 인수가 plan 시점에 알려진 값**이면 Terraform은 plan 단계(refresh)에서 읽는다. 결과가 plan 출력에 실제 값으로 찍히고 그것을 쓰는 리소스 인수도 구체적으로 보인다. 반대로 인수 중 하나라도 **아직 만들어지지 않은 리소스의 속성**을 참조하면 그 값은 plan 시점에 `(known after apply)` 이고, Terraform은 모르는 값으로 API를 호출할 수 없으므로 **읽기 자체를 apply 시점으로 미룬다.**

아직 만들어지지 않은 `aws_vpc.main.id` 로 서브넷을 찾는 `aws_subnets` 가 그런 경우다. 읽기가 미뤄지면 그 데이터 소스의 **모든 속성이 plan에서 unknown**이 되고, 그 값을 쓰는 리소스의 인수도 전염된다.

**plan이 덜 보인다** — "몇 개가 만들어지는지"조차 알 수 없어질 수 있고, `for_each` 나 `count` 에 그 값을 쓰면 [6장](06-references-and-dependencies.md)에서 본 `Invalid count argument` 로 실패한다. **plan과 apply 사이에 결과가 달라질 수 있다** — 리뷰한 plan과 실제 실행이 어긋나고, plan 파일을 승인 절차에 쓰는 팀이라면 승인의 의미가 옅어진다.

실무 규칙은 하나다. **데이터 소스는 "이번 apply에서 만들지 않는 것"만 읽는다.** 방금 만든 리소스의 정보가 필요하면 되읽지 말고 속성을 직접 참조한다 — `aws_vpc.main.cidr_block` 이 있는데 `data.aws_vpc` 로 다시 물어볼 이유가 없다.

## 계정·리전·파티션: 하드코딩을 없애는 세 줄

```terraform
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}
```

셋 다 **인수가 없다.** provider 설정이 곧 질문이고, 대답은 "지금 이 provider가 누구로, 어디에, 어느 파티션에서 동작하는가"다.

`aws_caller_identity` 는 `account_id`, `arn`, `user_id` 를 준다. `arn` 은 assume role을 쓰면 `arn:aws:sts::123456789012:assumed-role/...` 형태가 되므로 "어떤 롤로 돌고 있나"를 확인할 수 있다.

S3 버킷 이름처럼 **전역으로 유일해야 하는 이름**에 `${data.aws_caller_identity.current.account_id}` 를 섞는 것은 표준 관용구다. 여러 계정에 같은 코드를 배포해도 이름이 충돌하지 않는다. 여기에 `precondition` 으로 `account_id == var.expected_account_id` 를 확인해 두면, 프로파일을 잘못 잡고 프로덕션에 dev 스택을 얹는 사고가 apply 이전에 멈춘다.

`aws_region` 은 provider에 설정된 리전을 알려준다. v6에서 주의할 점은 **`name` 속성이 deprecated**이고 `data.aws_region.current.region` 을 써야 한다는 것이다(`id` 도 deprecated). 진짜로 필요한 자리는 **provider 설정을 부모에게서 물려받는 자식 모듈**이다 — 리전을 변수로 받는 것보다 안전하다.

`aws_partition` 은 `partition`(상용 `aws`, 중국 `aws-cn`), `dns_suffix`(`amazonaws.com`, `amazonaws.com.cn`), `reverse_dns_prefix`(`com.amazonaws`, `cn.com.amazonaws`)를 준다. **ARN을 조립할 때 `aws` 를 직접 쓰지 않는 이유**가 여기 있다 — `resources = ["arn:${data.aws_partition.current.partition}:s3:::${var.bucket_name}/*"]` 처럼 쓴다.

`dns_suffix` 는 서비스 principal에 쓴다 — `ec2.amazonaws.com` 대신 `"ec2.${data.aws_partition.current.dns_suffix}"` 로 적으면 중국 리전에서도 그대로 돈다.

## `aws_availability_zones`: AZ는 이름이 아니라 ID다

AZ를 하드코딩하면 안 되는 이유는 [5장](05-first-resource-vpc.md)에서 다뤘다. 여기서는 데이터 소스 쪽을 본다.

```terraform
data "aws_availability_zones" "available" {
  state = "available"
}
```

`state` 는 `available`, `information`, `impaired`, `unavailable` 중 하나를 받는다. **기본값은 필터 없음** — 상태와 무관하게 계정이 접근할 수 있는 AZ 전체가 나오므로 `state = "available"` 이 사실상 표준이다.

여기에 원문이 명시하는 함정이 있다. **Local Zone이 활성화된 리전에서는 기본적으로 Local Zone도 함께 반환된다.** `us-west-2` 에서 `names[0]` 이 `us-west-2-lax-1a` 일 수 있고 그런 곳에는 지원되지 않는 인스턴스 타입과 서비스가 많다. 일반 AZ만 원한다면 filter를 쓴다.

```terraform
# 일반 AZ만 (Local Zone / Wavelength Zone 제외)
data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}
```

Local Zone과 Wavelength Zone은 명시적으로 opt-in해야 쓸 수 있어 `opt-in-status` 가 `opted-in`/`not-opted-in` 이고 일반 AZ만 `opt-in-not-required` 다. 이름·ID 단위로 빼는 `exclude_names`, `exclude_zone_ids` 도 있다.

**`names` 와 `zone_ids` 는 다른 것이다.** `names` 는 `ap-northeast-2a` 같은 AZ 이름이고 `zone_ids` 는 `apne2-az1` 같은 AZ ID다. **AZ 이름은 계정마다 다른 물리 AZ에 매핑된다** — A 계정의 `ap-northeast-2a` 와 B 계정의 그것은 다른 데이터센터일 수 있다. 반면 **AZ ID는 모든 계정에서 같은 물리 AZ를 가리킨다.** 그래서 **계정 간에 물리적 배치를 맞춰야 할 때만** `zone_ids` 를 쓴다. VPC 피어링으로 이어진 두 계정의 워크로드를 같은 AZ에 두어 교차 AZ 데이터 전송 비용을 줄이는 경우가 대표적이다. 일상적인 "AZ 두세 개에 분산"에는 `names` 로 충분하다.

**AZ 목록의 순서와 개수는 영원하지 않다.** 계정에 AZ가 추가되거나 순서가 바뀌면 `names[0]` 이 가리키는 곳이 달라지고 서브넷이 교체되므로, 프로덕션에서는 AZ를 변수로 고정하는 팀도 많다.

## `aws_ami`: v6에서 바뀐 규칙과 재생성 문제

`aws_ami` 는 조건에 맞는 AMI **하나**를 찾는다. 원문이 명시하듯 **결과가 정확히 하나가 아니면 실패한다.** 여러 개를 받고 싶으면 `most_recent = true` 로 최신 하나를 고르거나 `aws_ami_ids` 데이터 소스를 쓴다.

```terraform
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]   # v6에서 사실상 필수

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}
```

### v6의 변경: `most_recent = true` 에는 소유자 지정이 필수다

원문 업그레이드 가이드가 이렇게 적는다 — **`most_recent = true` 를 쓰면 설정에 `owners` 또는 `image-id`/`owner-id` 를 지정하는 `filter` 가 반드시 포함되어야 한다.** v5까지는 경고만 나왔지만 **v6부터는 에러로 멈춘다.**

이유는 보안이다. 소유자를 제한하지 않으면 검색 결과에 제3자가 공개한 이미지가 섞일 수 있고 `most_recent` 는 그중 가장 새로 등록된 것을 고른다. 고치는 방법은 `owners = ["amazon"]` 이나 `filter { name = "owner-id" ... }` 다. `allow_unsafe_filter = true` 로 검사를 무력화할 수 있지만 원문이 "권장하지 않는다"고 쓴다 — 이 인수가 코드에 있다면 리뷰에서 이유를 묻는다.

### "항상 최신"이 인스턴스를 지운다

더 흔한 문제는 따로 있다. `most_recent = true` 는 **AWS가 새 AMI를 내는 순간 결과값이 바뀐다.** `aws_instance` 의 `ami` 는 값이 바뀌면 인스턴스를 교체하는 인수이므로, 코드를 한 줄도 고치지 않았는데 plan에 `~ ami = "ami-0abc..." -> "ami-0def..." # forces replacement` 가 뜬다.

Launch Template + ASG로 굴리며 롤링 교체가 정상 절차인 팀이라면 받아들일 만하지만([28장](../level2-intermediate/28-compute-asg-alb.md)), 상태를 가진 단일 인스턴스라면 재앙이다. 선택지는 셋이다. **AMI ID를 변수로 고정하면** 업그레이드가 PR이 되어 리뷰와 롤백이 가능하다. **SSM Public Parameter로 고정하면** 파라미터 이름이 곧 버전 계약이 된다 — AWS는 공식 AMI ID를 SSM Parameter Store의 공개 경로로 게시한다.

```terraform
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}
# aws_instance의 ami = data.aws_ssm_parameter.al2023.value
```

주의할 것은 이 방법도 "latest" 경로를 쓰면 **여전히 값이 바뀐다**는 점이다. 진짜 고정을 원하면 버전이 박힌 경로를 쓰거나 `lifecycle { ignore_changes = [ami] }` 로 변경을 무시한다 — 후자는 "다음에 교체될 때만 새 AMI를 쓴다"는 뜻이므로 의도를 주석으로 남긴다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md)).

`include_deprecated` 의 기본값이 `false` 라는 점도 기억해 둔다 — 오래된 이미지를 고정해 쓰던 설정이 "결과 없음"으로 깨진다면 이 인수를 의심한다.

## 남이 만든 인프라 찾기: `aws_vpc` 와 `aws_subnets`

플랫폼팀이 만든 VPC 위에 애플리케이션 스택을 올리는 상황이 가장 흔하다. VPC ID를 변수로 받는 것이 명확하지만 ID를 모르고 태그만 아는 경우도 많다.

```terraform
data "aws_vpc" "selected" {
  tags = {
    Name        = "shared-vpc"
    Environment = var.environment
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected.id]
  }

  tags = { Tier = "Private" }
}
```

`aws_vpc` 는 `id`, `cidr_block`, `dhcp_options_id`, `default`, `state`, `tags`, 그리고 임의의 `filter` 블록으로 찾는다. `tags` 는 **모든 쌍이 정확히 일치**해야 하고 더 복잡한 조건은 `filter` 로 표현한다. 결과로는 `arn`, `main_route_table_id`, `owner_id`, `enable_dns_support`, `cidr_block_associations` 등이 따라오는데, `main_route_table_id` 는 "만들지 않았는데 딸려 오는 것"을 참조할 때 요긴하다.

`aws_subnets` 는 복수형이므로 **여러 개**를 찾아 `ids` 를 리스트로 준다. 각 서브넷의 상세 정보가 필요하면 원문 예제처럼 `for_each = toset(data.aws_subnets.private.ids)` 로 단수형 `aws_subnet` 을 다시 돌리는데, 서브넷이 스무 개면 `Describe` 호출이 스무 번 나가 refresh가 느려지고 스로틀링에 걸린다([40장](../level3-advanced/40-performance-and-throttling.md)).

### 결과가 비었을 때: 어떤 것은 터지고 어떤 것은 안 터진다

데이터 소스마다 "못 찾았을 때" 동작이 다르고, 이 차이가 배포 실패와 조용한 사고를 가른다.

**단수형은 에러다.** `aws_vpc`, `aws_ami`, `aws_subnet` 처럼 하나를 찾는 데이터 소스는 결과가 0개면 실패하고, `aws_ami` 는 원문이 명시하듯 **하나가 아닌 모든 경우** 실패한다. 좋은 동작이다 — 잘못된 대상 위에 리소스를 만드는 대신 배포가 멈춘다.

**복수형은 빈 리스트다.** `aws_subnets`, `aws_regions` 는 조건에 맞는 것이 없으면 `ids = []` 를 돌려주고 **에러를 내지 않는다.** 태그 오타 하나로 빈 리스트가 되고 그것을 `for_each` 에 넣으면 인스턴스가 0개 만들어진다 — apply는 "0 added"로 성공하고 서비스만 뜨지 않는다. 방어는 `postcondition` 이다.

```terraform
data "aws_subnets" "private" {
  tags = { Tier = "Private" }

  lifecycle {
    postcondition {
      condition     = length(self.ids) >= 2
      error_message = "Tier=Private 서브넷이 2개 미만이다. 태그와 VPC ID를 확인한다."
    }
  }
}
```

`self` 는 postcondition 안에서 그 데이터 소스 자신을 가리킨다. 이 다섯 줄이 "조용히 0개 배포"를 명확한 실패로 바꾼다.

## `depends_on` 을 데이터 소스에 걸면 벌어지는 일

데이터 소스에도 `depends_on` 을 쓸 수 있지만 부작용이 크다. `depends_on` 을 걸면 Terraform은 그 의존 대상이 데이터 소스의 결과를 바꿀 수 있다고 가정한다. plan 시점에는 의존 대상이 아직 변경되지 않았으므로, Terraform은 **읽기를 apply 시점까지 미루고 그 데이터 소스의 모든 속성을 unknown으로 만든다.** 앞 절에서 본 전염이 그대로 일어난다 — 아무것도 바뀌지 않았는데 plan에 매번 다시 읽히는 것으로 표시되고, 참조하는 리소스들이 `(known after apply)` 로 채워지며, `for_each` 에 쓰고 있었다면 plan이 아예 실패한다.

정말로 순서가 필요하다면 대개 **참조로 표현할 수 있다.** VPC가 먼저 만들어져야 한다면 `values = [aws_vpc.main.id]` 로 직접 참조하면 의존성도 생기고 의도도 드러난다.

## 시크릿을 읽는 데이터 소스와 state

`aws_ssm_parameter` 와 `aws_secretsmanager_secret_version` 은 값을 읽어 오는 데이터 소스다. 편리하지만 대가가 명확하다.

```terraform
data "aws_secretsmanager_secret_version" "db" {
  secret_id = var.db_secret_id
}
# locals에서 jsondecode(...secret_string)["password"] 로 꺼내 쓴다
```

**읽은 값은 state에 평문으로 저장된다.** `aws_ssm_parameter` 원문은 SecureString의 복호화된 값이 raw state에 평문으로 저장된다는 경고를 명시적으로 달고 있다. `sensitive` 표시는 CLI 출력만 가릴 뿐이라는 [7장](07-variables-outputs-locals.md)의 사실이 그대로 적용된다.

`aws_ssm_parameter` 의 `value` 는 타입과 무관하게 항상 민감값으로 표시되며 민감 표시 없는 `insecure_value` 가 따로 있다. `name` 에 `foo:3` 처럼 쓰면 특정 버전을 읽는다.

값을 state에 남기지 않는 방법은 **같은 이름의 ephemeral 리소스**다. v6에는 `ephemeral "aws_ssm_parameter"` 와 `ephemeral "aws_secretsmanager_secret_version"` 이 있고, 이들이 읽은 값은 state에도 plan 파일에도 저장되지 않는다. 인수가 미묘하게 다르다는 점만 기억해 둔다 — ephemeral `aws_ssm_parameter` 는 `name` 이 아니라 `arn` 을 필수로 받는다([26장](../level2-intermediate/26-secrets-and-ephemeral.md)).

## `aws_iam_policy_document`: JSON을 HCL로 쓰기

IAM 정책 JSON을 문자열로 붙여 넣을 때 생기는 문제는 [3장](03-hcl-basics.md)에서 봤다. `aws_iam_policy_document` 는 정책을 **HCL로 쓰고 JSON을 결과로 받는** 데이터 소스다. AWS에 요청을 보내지 않고 문자열을 조립할 뿐이지만 형태는 데이터 소스다.

```terraform
data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.${data.aws_partition.current.dns_suffix}"]
    }
  }
}

resource "aws_iam_role" "app" {
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  name               = "${var.project}-app"
}
```

`statement` 블록은 `sid`, `effect`(기본 `Allow`), `actions`/`not_actions`, `resources`/`not_resources`, `principals`/`not_principals`, `condition` 을 갖고, `principals` 의 `type` 은 `AWS`, `Service`, `Federated`, `CanonicalUser`, `*` 중 하나다. 결과는 `json` 과 `minified_json` 으로 나온다.

이득은 둘이다. 쉼표를 빠뜨리거나 키를 틀리면 HCL 파서가 즉시 잡고, **AWS 정책 변수**의 충돌이 사라진다 — Terraform의 `${...}` 와 겹치므로 AWS가 해석할 변수는 `&{aws:username}` 처럼 쓴다.

`source_policy_documents`(모든 `sid` 가 유일해야 함)와 `override_policy_documents`(같은 `sid` 를 덮어씀)로 문서를 합칠 수도 있다([13장](13-iam-basics.md), [33장](../level2-intermediate/33-provider-functions-and-policies.md)).

## 알아 두면 좋은 나머지 셋

**`aws_default_tags`** 는 provider의 `default_tags` 설정을 읽어 `tags` 맵으로 준다. 인수는 없다. 쓸모가 분명한 자리는 `default_tags` 가 적용되지 않는 곳에 같은 태그를 손으로 붙일 때다 — 원문 예제는 `aws_autoscaling_group` 의 `tag` 를 `dynamic "tag" { for_each = data.aws_default_tags.current.tags ... }` 로 돌린다. ASG는 `default_tags` 의 예외이므로 이 패턴이 없으면 ASG가 만든 인스턴스만 태그가 빈다([10장](10-tags-basics.md)).

**`aws_regions`** 는 계정이 쓸 수 있는 리전 목록(`names`)을 준다. 기본은 활성화된 리전만이고 `all_regions = true` 로 전부 본다 — `filter` 로 `not-opted-in` 을 거르려면 이 인수가 반드시 함께 필요하다.

**`aws_service`** 는 서비스 DNS 이름을 조립·분해한다. `service_id`(예: `ec2`), `dns_name`, `reverse_dns_name` 중 하나를 주면 나머지를 채우며, 유용한 속성은 **그 리전/파티션에서 그 서비스를 지원하는지** 알려주는 `supported` 다.

## 흔한 실수

### ❌ `most_recent = true` 만 쓰고 소유자를 지정하지 않는다

```terraform
data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}
```

v5까지는 경고였지만 **v6에서는 에러로 멈춘다.** 소유자를 제한하지 않으면 제3자 이미지가 선택될 수 있다.

```terraform
# ✅ owners를 지정한다 (또는 owner-id / image-id filter)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  # ... 같은 filter ...
}
```

### ❌ ARN 안에 파티션을 하드코딩한다

```terraform
resources   = ["arn:aws:s3:::${var.bucket_name}/*"]
identifiers = ["ec2.amazonaws.com"]
```

GovCloud(`aws-us-gov`)와 중국(`aws-cn`) 파티션에서 아무것도 가리키지 않는 ARN이 된다. 정책은 유효하고 apply도 성공하며 권한만 작동하지 않는다.

```terraform
# ✅ 파티션과 DNS suffix를 데이터 소스에서 가져온다
resources   = ["arn:${data.aws_partition.current.partition}:s3:::${var.bucket_name}/*"]
identifiers = ["ec2.${data.aws_partition.current.dns_suffix}"]
```

### ❌ `filter` 이름에 Terraform 인수 이름을 쓴다

```terraform
data "aws_subnets" "private" {
  filter {
    name   = "vpc_id"   # InvalidParameterValue
    values = [var.vpc_id]
  }
}
```

`filter` 의 `name` 은 Terraform 인수가 아니라 **AWS API가 정한 필터 이름**이다. 하이픈을 쓰고 태그는 `tag:` 접두어를 붙인다.

```terraform
# ✅ describe-subnets 레퍼런스의 이름을 그대로 쓴다
data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
  filter {
    name   = "tag:Tier"
    values = ["Private"]
  }
}
```

### ❌ 데이터 소스에 `depends_on` 을 습관적으로 붙인다

```terraform
data "aws_subnets" "in_vpc" {
  depends_on = [aws_vpc.main]
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
}
```

읽기가 apply로 미뤄져 모든 속성이 plan에서 unknown이 되고, `for_each` 에 쓰고 있었다면 plan 자체가 실패한다.

```terraform
# ✅ 순서가 필요하면 참조로 표현한다
data "aws_subnets" "in_vpc" {
  filter {
    name   = "vpc-id"
    values = [aws_vpc.main.id]
  }
}
```

## 프로덕션 노트

- **데이터 소스는 매 refresh마다 API를 호출한다.** 수십 개가 흩어져 있으면 plan이 느려지고 `RequestLimitExceeded` 를 만난다. 특히 `for_each` 로 단수형 데이터 소스를 도는 패턴은 호출 수가 항목 수만큼 늘어나므로, 자주 쓰는 값은 한 번 읽어 `locals` 에 담는다.

- **데이터 소스에 필요한 IAM 권한을 잊지 않는다.** `Describe*`, `Get*` 권한이 없으면 plan 단계에서 실패한다. CI 롤에 생성 권한만 주고 읽기 권한을 빠뜨리면 "apply는 되는데 plan이 안 되는" 상태가 된다. `aws_secretsmanager_secret_version` 은 `secretsmanager:GetSecretValue` 와 KMS 복호화 권한까지 필요하다.

- **AMI 갱신 정책을 팀 차원에서 정한다.** "항상 최신"과 "고정 후 수동 갱신" 중 어느 쪽도 무조건 옳지 않다 — 상태 없는 ASG 워크로드는 최신 추적이, 상태를 가진 인스턴스는 고정이 맞다. 결정한 쪽을 주석으로 남긴다.

- **시크릿 데이터 소스가 state에 남기는 것을 감사한다.** 값이 이미 state에 들어간 뒤라면 코드를 ephemeral로 바꿔도 과거 값은 지워지지 않는다 — 원격 state의 이전 버전을 정리하거나 시크릿을 로테이션하는 것이 실질적인 대응이다.

- **`filter` 이름의 유일하게 정확한 목록은 AWS CLI의 `describe-*` 레퍼런스다.** `vpc-id`, `tag:Name` 처럼 하이픈과 콜론이 섞이므로 추측하지 말고 각 데이터 소스 문서가 걸어 둔 링크에서 확인한다.

## 연습문제

**1. 하드코딩을 전부 데이터 소스로 걷어내기**
계정 ID, 리전, 파티션, AZ 이름, AMI ID가 문자열로 박힌 설정을 `aws_caller_identity`, `aws_region`, `aws_partition`, `aws_availability_zones`, `aws_ami` 로 대체한다. ARN을 조립하는 IAM 정책도 하나 포함시킨다.
*성공 기준:* 설정에서 계정 ID·리전 이름·`arn:aws:` 문자열이 사라지고 같은 코드가 다른 리전에서도 plan을 통과한다.

**2. 읽기 시점을 눈으로 확인하기**
VPC를 만드는 리소스와 그 VPC의 ID로 서브넷을 찾는 `aws_subnets` 를 함께 두고 plan을 실행한 뒤, filter 값을 이미 존재하는 `var.vpc_id` 로 바꿔 다시 실행한다.
*성공 기준:* 첫 plan에서 데이터 소스 속성이 `(known after apply)` 로, 두 번째에서는 실제 값으로 표시되는 것을 확인한다. `depends_on` 을 추가하면 두 번째도 unknown이 되는지 검증한다.

**3. 빈 결과를 실패로 바꾸기**
존재하지 않는 태그로 `aws_subnets` 를 조회해 그 결과를 `for_each` 에 넣어 EC2 인스턴스를 만든 뒤, `postcondition` 을 추가한다.
*성공 기준:* 처음에는 에러 없이 "0 added"로 apply가 끝나고 `postcondition` 추가 후에는 plan에서 멈춘다. 같은 실험을 단수형 `aws_vpc` 로 반복해 처음부터 에러가 나는 것을 확인하고 차이를 설명한다.

**4. AMI 재생성 문제를 재현하고 막기**
`most_recent = true` + `owners = ["amazon"]` 인 `aws_ami` 로 EC2 인스턴스를 만든 뒤 `ami` 를 다른 이미지로 바꿔 plan을 확인하고, SSM Public Parameter 방식과 `ignore_changes = [ami]` 를 각각 적용한다.
*성공 기준:* 첫 plan에서 `# forces replacement` 를 확인하고 세 방식의 plan 차이를 표로 정리한다. 각 방식이 언제 적절한지 한 줄씩 적는다.

## 요약

- `data` 블록은 문법이 `resource` 와 같고 참조에 `data.` 접두어가 붙는다. 만들지 않고 매 refresh마다 다시 읽으며, 인수는 "이렇게 만들어라"가 아니라 "이런 것을 찾아라"다.
- 모든 인수가 plan 시점에 알려져 있으면 plan에서 읽고, 하나라도 unknown이면 **읽기가 apply까지 미뤄져 모든 속성이 unknown이 된다.** 데이터 소스는 "이번 apply에서 만들지 않는 것"만 읽고, 방금 만든 리소스는 속성을 직접 참조한다.
- `aws_caller_identity`, `aws_region`(v6에서 `name` deprecated, `region` 을 쓴다), `aws_partition`(`partition`, `dns_suffix`, `reverse_dns_prefix`)은 인수가 없다. ARN과 서비스 principal에 `aws` 와 `amazonaws.com` 을 하드코딩하지 않는다.
- `aws_availability_zones` 는 기본적으로 Local Zone을 포함하므로 일반 AZ만 원하면 `opt-in-status = ["opt-in-not-required"]` filter를 쓴다. `names` 는 계정마다 다른 물리 AZ를, `zone_ids` 는 모든 계정에서 같은 물리 AZ를 가리킨다.
- **v6부터 `aws_ami` 에 `most_recent = true` 를 쓰면 `owners` 또는 `image-id`/`owner-id` filter가 필수**이며 없으면 에러다(v5까지는 경고). 결과가 정확히 하나가 아니면 실패한다. "항상 최신"은 인스턴스 교체를 유발하므로 변수 고정 / SSM Public Parameter / `ignore_changes = [ami]` 중에서 고른다.
- 단수형 데이터 소스는 결과가 없으면 에러지만 복수형(`aws_subnets`, `aws_regions`)은 **빈 리스트를 조용히 돌려준다.** `postcondition` 으로 최소 개수를 강제해 "0개 배포 후 성공"을 막는다. `depends_on` 을 걸면 읽기가 apply로 미뤄져 plan이 흐려지므로 순서는 참조로 표현한다.
- `aws_ssm_parameter` 와 `aws_secretsmanager_secret_version` 데이터 소스가 읽은 값은 **state에 평문으로 남는다.** 남기지 않으려면 같은 이름의 ephemeral 리소스를 쓴다. `filter` 이름은 Terraform이 아니라 AWS API가 정하며(`vpc-id`, `tag:Name`), `aws_iam_policy_document` 는 AWS 호출 없이 정책 JSON을 조립하는 데이터 소스다.

## 다음으로

- [9장 — State 입문](09-state-basics.md) — 데이터 소스가 state에 무엇을 남기는지, 왜 평문인지.
- [13장 — IAM 기초](13-iam-basics.md) — `aws_iam_policy_document` 심화.
- [26장 — 시크릿: ephemeral과 write-only 인수](../level2-intermediate/26-secrets-and-ephemeral.md) — 시크릿을 state에 남기지 않는 법.
- AWS Provider 문서: <https://registry.terraform.io/providers/hashicorp/aws/latest/docs>
