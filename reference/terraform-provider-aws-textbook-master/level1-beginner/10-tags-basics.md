---
chapter: 10
level: "Level 1 — 초급"
title: "태그 기초: tags, default_tags, tags_all"
difficulty: 입문
reading_time: "28분"
prerequisites: [5, 7]
source_docs:
  - "website/docs/guides/resource-tagging.html.markdown"
  - "website/docs/index.html.markdown"
  - "website/docs/d/default_tags.html.markdown"
  - "website/docs/r/vpc.html.markdown"
  - "website/docs/r/autoscaling_group.html.markdown"
  - "website/docs/r/security_group.html.markdown"
  - "website/docs/guides/tag-policy-compliance.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging"
provider_baseline: "6.x"
---

# 10장 — 태그 기초: tags, default_tags, tags_all

**이 장에서 배우는 것**

- AWS에서 태그가 실제로 무슨 일을 하는지(비용 할당, 소유권, ABAC, 자동화) 설명할 수 있다.
- provider가 `tags` 를 **전량 관리**한다는 것이 무슨 뜻인지 알고, 밖에서 붙인 태그가 왜 제거 대상이 되는지, `aws:` 접두어는 왜 예외인지 말할 수 있다.
- `tags` 와 `tags_all` 의 차이를 설명하고 어느 쪽을 참조해야 하는지 판단할 수 있다.
- provider `default_tags` 블록과 `TF_AWS_DEFAULT_TAGS_<키>` 환경변수를 쓰고, 우선순위와 `aws_autoscaling_group` 예외를 안다.
- `merge()` 기반 태그 조합과 `default_tags` 중 어느 쪽이 맞는 상황인지 고르고, `ignore_tags` 가 필요한 신호를 알아본다.

**왜 중요한가**

태그가 없는 AWS 계정에서 월말 청구서를 열면 "EC2 $18,400"이라는 한 줄이 보인다. 그 돈이 어느 팀, 어느 서비스, 어느 환경에서 나왔는지 알 방법이 없다. Cost Explorer의 비용 할당 태그는 **태그가 붙어 있던 시점부터** 데이터를 만들기 때문에, 오늘 태그를 붙여도 지난 6개월의 청구서는 영원히 해석되지 않는다. 태그는 나중에 붙이면 늦는 몇 안 되는 것 중 하나다.

두 번째 사고는 반대편에서 온다. 보안팀이 콘솔에서 모든 리소스에 `Compliance = reviewed` 태그를 붙였다. 다음 날 인프라 팀이 관계없는 subnet 하나를 추가하며 apply를 돌렸는데, plan에 리소스 40개의 태그 제거가 함께 잡힌다. provider가 `tags` 를 **전량 관리**하기 때문이다 — 설정에 없는 태그는 "지워야 할 것"으로 계산된다. 이 사실을 모르고 apply하면 보안팀의 작업이 통째로 날아가고, 알고 나서는 "그럼 태그를 코드에 다 적어야 하나?"라는 잘못된 결론에 이른다. 정답은 `ignore_tags` 다.

세 번째는 조용하다. 팀이 `Environment` 태그로 IAM 조건(ABAC)을 걸어 "dev 태그가 붙은 리소스만 개발자가 만질 수 있다"를 구현했다. 그런데 어떤 모듈은 태그 키를 `environment` 로 소문자로 적었다. 태그 키는 대소문자를 구분하므로 그 리소스들은 조건에 걸리지 않고, 정책은 조용히 작동하지 않는다. 태그 표준이 코드로 강제되지 않으면 이런 어긋남은 반드시 생긴다. `default_tags` 가 존재하는 이유가 여기 있다.

## AWS에서 태그가 하는 일

태그는 리소스에 붙이는 키-값 쌍이다. AWS 입장에서는 아무 의미 없는 문자열이지만, 그 위에 네 가지 기능이 얹혀 있다.

**비용 할당.** Billing 콘솔에서 태그 키를 "비용 할당 태그"로 활성화하면 그 키가 Cost Explorer와 CUR(Cost and Usage Report)의 차원이 된다. `Team`, `Service`, `Environment` 세 개만 제대로 붙어 있어도 "결제 팀 스테이징 환경이 이번 달에 얼마 썼는가"가 즉시 나온다.

**소유권과 연락처.** 새벽 3시에 정체 불명의 NAT Gateway가 트래픽을 태우고 있을 때 `Owner` 태그 하나가 30분짜리 추적을 30초로 줄인다. 정리 자동화도 결국 "누구 것인지 아는 리소스"만 안전하게 지울 수 있다.

**접근 제어(ABAC).** IAM 정책의 `aws:ResourceTag/<키>` 조건으로 "이 태그가 붙은 리소스에만" 권한을 줄 수 있다. 리소스가 늘어날 때마다 정책을 고치지 않아도 되므로 계정이 커질수록 값이 커진다. 다만 태그가 곧 권한 경계이므로, **태그를 바꿀 수 있는 사람이 권한을 바꿀 수 있는 사람**이 된다는 점을 함께 설계해야 한다.

**자동화.** 백업 정책, 자동 종료 스케줄러, 패치 그룹, 리소스 그룹이 모두 태그를 조건으로 동작한다. EKS는 subnet의 `kubernetes.io/role/elb` 같은 태그를 보고 로드밸런서를 배치한다 — 이런 태그는 **AWS 쪽 시스템이 붙이고 관리**하므로 뒤에서 다룰 `ignore_tags` 의 단골 대상이다.

## `tags` 인수와 "전량 관리"

태그를 지원하는 리소스는 일관되게 `tags` 라는 인수를 갖는다. map(string) 하나다.

```terraform
resource "aws_vpc" "example" {
  cidr_block = "10.0.0.0/16"

  tags = {
    Name = "MyVPC"
  }
}
```

여기서 반드시 알아야 할 규칙이 하나 있다. 원문의 표현을 그대로 옮기면 **"리소스의 태그는 `aws:` 로 시작하는 키를 제외하고 Terraform이 전량 관리한다"**이다. 결과는 셋이다.

- Terraform 밖에서 VPC에 붙인 태그는 **다음 실행에서 제거 대상으로 제안된다.**
- 설정에 있는데 실제로 없는 태그는 추가 대상이 된다.
- 값이 다른 태그는 갱신 대상이 된다.

`aws:` 접두어가 예외인 이유는 그 키들이 AWS 서비스가 관리하는 것이고 일반적으로 편집·삭제가 불가능하기 때문이다(`aws:cloudformation:stack-name`, `aws:autoscaling:groupName` 같은 것들). provider는 이 키들을 아예 diff 대상에서 뺀다.

"전량 관리"가 plan에 나타나는 모습은 [9장](09-state-basics.md)에서 본 drift 출력 그대로다.

```console
Terraform will perform the following actions:

  # aws_vpc.example will be updated in-place
  ~ resource "aws_vpc" "example" {
      ~ tags     = {
          - "Compliance" = "reviewed" -> null
        }
      ~ tags_all = {
          - "Compliance" = "reviewed" -> null
        }
    }
```

`-> null` 은 "이 태그를 지우겠다"는 뜻이다. 콘솔에서 붙인 태그를 유지하고 싶다면 선택지는 셋뿐이다 — 코드에 그 태그를 적거나, `lifecycle { ignore_changes = [tags] }` 로 무시하거나, provider의 `ignore_tags` 로 그 키를 전역에서 제외하는 것이다.

## `tags` 와 `tags_all`

태그를 지원하는 리소스에는 **`tags_all`** 이라는 읽기 전용 속성이 하나 더 있다. `aws_vpc` 문서의 정의는 "provider의 `default_tags` 설정에서 상속된 것을 **포함해** 리소스에 할당된 태그 맵"이다.

| | 무엇인가 | 성격 |
|---|---|---|
| `tags` | 이 리소스 블록에 우리가 쓴 것 | 인수(Optional) |
| `tags_all` | `default_tags` 까지 합친 최종값 | 계산 속성(read-only) |

구분이 중요한 자리는 **참조할 때**다. 다른 리소스에 같은 태그를 넘기거나 output으로 내보낼 때 `aws_vpc.example.tags` 를 쓰면 provider 기본 태그가 빠진 반쪽이 나간다. "이 리소스에 실제로 붙어 있는 태그 전부"가 필요하면 언제나 `tags_all` 이다.

```terraform
output "vpc_tags" {
  value = aws_vpc.example.tags_all   # default_tags 까지 포함된 최종값
}
```

`tags_all` 은 계산 속성이므로 우리가 값을 넣을 수 없고, plan에서 `tags` 와 `tags_all` 두 줄이 나란히 바뀌는 것이 정상이다.

## provider `default_tags`: 예제 네 가지

같은 태그를 리소스마다 반복해 쓰는 것을 대신하는 장치가 provider 블록의 `default_tags` 다. 원문은 이 기능이 "리소스마다 중복되는 `tags` 설정을 대체하도록 설계되었다"고 설명하며, **provider 태그는 새 값으로 덮어쓸 수는 있지만 특정 리소스에서 제외할 수는 없다**는 제약을 명시한다. 동작을 네 가지 경우로 확인한다.

### 1. 리소스에 `tags` 가 없을 때

```terraform
provider "aws" {
  default_tags {
    tags = {
      Environment = "Test"
      Name        = "Provider Tag"
    }
  }
}

resource "aws_vpc" "example" {
  # ..other configuration...
}

output "vpc_all_tags" {
  value = aws_vpc.example.tags_all
}
```

```console
$ terraform apply
...
Outputs:

vpc_all_tags = tomap({
  "Environment" = "Test"
  "Name" = "Provider Tag"
})
```

리소스는 태그를 하나도 쓰지 않았지만 두 개가 붙었다. 이때 `aws_vpc.example.tags` 는 비어 있다.

### 2. 리소스 태그와 병합될 때

```terraform
resource "aws_vpc" "example" {
  # ..other configuration...
  tags = {
    Owner = "example"
  }
}
```

```console
Outputs:

vpc_all_tags = tomap({
  "Environment" = "Test"
  "Name" = "Provider Tag"
  "Owner" = "example"
})
vpc_resource_level_tags = tomap({
  "Owner" = "example"
})
```

키가 겹치지 않으므로 셋이 모두 붙는다. `tags` 는 여전히 우리가 쓴 하나뿐이다 — **두 출력의 차이를 여기서 확실히 익혀 둔다.**

### 3. 리소스가 provider 태그를 덮어쓸 때

```terraform
resource "aws_vpc" "example" {
  # ..other configuration...
  tags = {
    Environment = "Production"
  }
}
```

```console
Outputs:

vpc_all_tags = tomap({
  "Environment" = "Production"
  "Name" = "Provider Tag"
})
vpc_resource_level_tags = tomap({
  "Environment" = "Production"
})
```

같은 키는 **리소스 쪽이 이긴다.** provider가 `Environment = "Test"` 를 걸어 두었어도 리소스가 `Production` 을 쓰면 최종값은 `Production` 이다. 반대로 "이 리소스에서는 `Environment` 를 아예 빼고 싶다"는 불가능하다 — 덮어쓰기는 되고 제외는 안 된다.

### 4. 환경변수로 줄 때

`default_tags` 는 `TF_AWS_DEFAULT_TAGS_<태그키>=<값>` 형태의 환경변수로도 지정된다.

```terraform
provider "aws" {
  default_tags {
    tags = {
      Name = "Provider Tag"
    }
  }
}
```

```console
$ export TF_AWS_DEFAULT_TAGS_Environment=Test
$ terraform apply
...
Outputs:

vpc_all_tags = tomap({
  "Environment" = "Test"
  "Name" = "Provider Tag"
})
```

규칙은 원문에 명시되어 있다 — **같은 태그가 환경변수와 `default_tags` 인수 양쪽에 있으면 provider 설정의 값이 우선한다.** 이것은 뒤에서 볼 `ignore_tags` 와 정반대라는 점을 기억해 두는 것이 좋다.

환경변수 방식이 유용한 자리는 CI다. 파이프라인이 `TF_AWS_DEFAULT_TAGS_DeployedBy=github-actions`, `TF_AWS_DEFAULT_TAGS_CommitSha=$GITHUB_SHA` 를 내보내면 코드를 건드리지 않고 실행 맥락이 태그로 남는다. 다만 커밋 SHA처럼 **매번 바뀌는 값**을 넣으면 모든 리소스에 태그 갱신 diff가 끝없이 생기므로, 값이 자주 바뀌는 태그는 넣지 않는다.

## `aws_autoscaling_group` 은 예외다

`default_tags` 는 "`tags` 를 지원하는 모든 리소스"에 적용된다. 딱 하나 예외가 있고, 원문이 이름을 콕 집어 적어 둔다 — **`aws_autoscaling_group`**.

이 리소스는 애초에 `tags` 라는 map 인수를 쓰지 않는다. 대신 `tag` 블록을 반복해서 쓰며, 각 블록은 `key`, `value`, 그리고 **`propagate_at_launch`**(Required)를 받는다. 마지막 인수가 예외의 이유를 설명한다 — ASG 태그에는 "이 태그를 이 그룹이 띄우는 EC2 인스턴스에도 물려줄 것인가"라는 차원이 하나 더 있고, 단순한 키-값 map으로는 표현되지 않는다.

```terraform
resource "aws_autoscaling_group" "example" {
  # ... 나머지 설정 ...

  tag {
    key                 = "Environment"
    value               = "prod"
    propagate_at_launch = true
  }
}
```

문제는 이것이다. provider에 `default_tags` 를 걸어 둔 계정에서 ASG만 그 태그를 받지 못하고, ASG가 띄운 인스턴스와 볼륨도 받지 못한다. 비용 할당 태그로 보면 **가장 비싼 리소스인 EC2 인스턴스들만 태그가 비어 있는** 상태가 된다.

메우는 방법이 `aws_default_tags` 데이터 소스다. 인수가 없고, provider에 설정된 기본 태그를 `tags` 맵으로 돌려준다. 원문 예제가 이 조합을 그대로 보여 준다.

```terraform
provider "aws" {
  default_tags {
    tags = {
      Environment = "Test"
      Name        = "Provider Tag"
    }
  }
}

data "aws_default_tags" "example" {}

resource "aws_autoscaling_group" "example" {
  # ...
  dynamic "tag" {
    for_each = data.aws_default_tags.example.tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}
```

`dynamic` 블록은 [17장](../level2-intermediate/17-count-foreach-dynamic.md)에서 다루지만 여기서 하는 일은 단순하다 — 기본 태그 맵을 한 항목씩 돌며 `tag` 블록을 찍어 낸다. 이 데이터 소스의 쓸모는 ASG에 한정되지 않는다. 문서가 밝히듯 "Terraform 리소스가 **직접** 관리하지 않는 대상"에 같은 태그를 붙일 때 쓴다.

## `merge()` 패턴: 언제 `default_tags` 대신 쓰는가

`default_tags` 이전부터 쓰이던 방식은 locals와 `merge()` 다.

```terraform
locals {
  common_tags = {
    Environment = var.environment
    Service     = "checkout"
    ManagedBy   = "terraform"
  }
}

resource "aws_vpc" "main" {
  cidr_block = var.cidr_block

  tags = merge(local.common_tags, {
    Name = "${var.environment}-main"
  })
}
```

`merge()` 는 뒤에 오는 맵이 앞의 같은 키를 덮는다. 그래서 위 코드는 "공통 태그 + 이 리소스만의 `Name`"이 된다. 결과만 보면 `default_tags` 와 비슷하지만 성질이 다르다.

| | `default_tags` | `merge(local.common_tags, ...)` |
|---|---|---|
| 적용 범위 | 그 provider가 만드는 모든 리소스 | 우리가 `tags` 에 쓴 리소스만 |
| ASG | 적용 안 됨 | 적용됨(`tag` 블록으로 풀어야 하지만) |
| 모듈 안 | 부모의 provider 설정을 물려받아 자동 적용 | 모듈에 변수로 넘겨야 함 |
| 리소스별 제외 | 불가능 | 가능 |
| 최종값 확인 | `tags_all` | `tags` |

**`merge()` 가 나은 경우가 분명히 있다.**

- **일부 리소스만 특정 태그를 빼야 할 때.** `default_tags` 는 덮어쓰기만 되고 제외는 안 된다. 예컨대 다른 팀에 공유하는 리소스에만 `Owner` 를 빼야 한다면 `default_tags` 로는 표현되지 않는다.
- **태그 값이 리소스마다 달라야 할 때.** `Name` 이 대표적이다. `default_tags` 에 `Name` 을 넣으면 계정의 모든 리소스가 같은 이름을 갖는 이상한 상태가 된다.
- **모듈을 배포하는 쪽의 provider를 우리가 통제하지 못할 때.** 공용 모듈이라면 `tags` 변수를 받아 `merge()` 하는 편이 예측 가능하다.
- **`aws_autoscaling_group` 이 많을 때.** 어차피 `tag` 블록을 만들어야 하므로 태그 소스를 한곳에 두는 편이 일관적이다.

실무에서는 둘을 함께 쓴다. 계정·환경 단위로 절대 빠지면 안 되는 것(`Environment`, `ManagedBy`, `CostCenter`)은 `default_tags` 에, 리소스마다 달라지는 것(`Name`, `Role`)은 리소스의 `tags` 에 둔다. 이때 최종 결과는 `tags_all` 에서 확인한다.

## `ignore_tags` 맛보기

Terraform 밖의 시스템이 태그를 붙이는 것은 예외 상황이 아니라 정상이다. Kubernetes는 subnet과 시큐리티 그룹에 태그를 붙여 동작하고, CMDB나 보안 스캐너도 자기 태그를 남긴다. 이런 태그를 그대로 두면 apply마다 "제거" diff가 뜬다.

리소스 단위로 막는 방법은 `lifecycle` 이다.

```terraform
resource "aws_vpc" "example" {
  tags = {
    Name  = "MyVPC"
    Owner = "Operations"
  }

  lifecycle {
    ignore_changes = [tags.Name]   # Name 값의 외부 변경만 무시
  }
}
```

`ignore_changes = [tags]` 로 쓰면 **최초 생성 이후의 모든 태그 변경**이 무시된다. `tags.Name` 처럼 특정 키만 지정하면 그 키의 값 변경만 무시되고 다른 태그의 추가·변경은 계속 계획된다.

provider 전체에 거는 방법이 `ignore_tags` 블록이다.

```terraform
provider "aws" {
  ignore_tags {
    keys         = ["LastScanned"]
    key_prefixes = ["kubernetes.io/"]
  }
}
```

`keys` 는 정확히 일치하는 키, `key_prefixes` 는 접두어로 시작하는 모든 키를 무시한다. 두 인수는 함께 쓸 수 있다. 무시된 태그는 `tags` 계열 속성에 아예 나타나지 않고 diff도 생기지 않는다.

두 가지를 지금 기억해 둔다. 첫째, **`ignore_tags` 는 환경변수(`TF_AWS_IGNORE_TAGS_KEYS`, `TF_AWS_IGNORE_TAGS_KEY_PREFIXES`)로도 줄 수 있고, 인수와 환경변수가 둘 다 있으면 두 소스가 병합된다.** `default_tags` 가 "provider 설정 우선"이었던 것과 반대다. 둘째, **무시하기로 한 키를 리소스의 `tags` 에 계속 적어 두면 영구적인 diff가 생긴다.** 원문이 명시하는 함정이다 — 무시하려면 코드에서도 빼거나 `ignore_changes` 를 함께 써야 한다. 심화는 [23장](../level2-intermediate/23-tagging-strategy.md)에서 다룬다.

## `Name` 태그와 태그 키 다루기

AWS 콘솔이 리소스 목록에서 "Name" 열에 보여 주는 값은 사실 `Name` 이라는 **평범한 태그**다. 특별한 API 필드가 아니다. 그래서 두 가지가 따라온다 — 대소문자가 정확히 `Name` 이어야 콘솔이 알아보고, 리소스 이름과 달리 유일성이 강제되지 않아 같은 이름이 열 개 있어도 AWS는 아무 말도 하지 않는다.

`Name` 은 리소스마다 달라야 하므로 `default_tags` 에 넣지 않고 리소스에서 붙인다. 조합 규칙을 정해 두면 콘솔에서 검색이 된다.

```terraform
locals {
  name_prefix = "${var.environment}-${var.service}"
}

resource "aws_subnet" "private" {
  for_each = var.private_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value
  availability_zone = each.key

  tags = {
    Name = "${local.name_prefix}-private-${each.key}"   # prod-checkout-private-ap-northeast-2a
  }
}
```

태그 키에서 사람을 무는 것은 **대소문자 구분**이다. `Environment` 와 `environment` 는 서로 다른 키이고, 둘 다 붙이면 리소스에 태그가 두 개 생긴다. 비용 할당 태그를 `Environment` 로 활성화해 두었다면 소문자로 붙은 리소스의 비용은 "태그 없음"으로 집계된다. IAM의 `aws:ResourceTag/Environment` 조건도 마찬가지로 걸리지 않는다. 팀 표준을 문서가 아니라 **`default_tags` 와 모듈 변수의 기본값으로** 못 박아야 하는 이유다.

`aws:` 로 시작하는 키는 예약이라 쓸 수 없다. 키 길이와 사용 가능한 문자에도 AWS 공통 제한이 있으므로 긴 키나 특수문자를 쓰기 전에 AWS 태깅 문서를 확인하고, 실무에서는 짧은 PascalCase 단어로 고정하는 것이 안전하다.

조직 차원의 강제 수단도 v6 provider에 있다. `tag_policy_compliance` 인수(`error`/`warning`/`disabled`)를 켜면 AWS Organizations의 태그 정책이 요구하는 필수 태그를 **plan·apply 단계에서** 검사한다. 미설정이나 `disabled` 면 provider는 검사하지 않는다. 자세한 조건과 필요한 IAM 권한은 [23장](../level2-intermediate/23-tagging-strategy.md)에서 다룬다.

## 태그 변경은 리소스를 교체하지 않는다

태그는 거의 언제나 **제자리 갱신(update in-place)** 이다. AWS 대부분의 서비스가 태그 전용 API(`CreateTags`/`TagResource`)를 따로 제공하므로 리소스를 다시 만들 이유가 없다.

이 성질이 실제로 유용해지는 사례가 `aws_security_group` 문서에 있다. `description` 은 **Forces new resource**이고 AWS에 갱신 API 자체가 없어서, 값을 바꾸면 시큐리티 그룹이 교체된다. 문서는 이 자리에서 "업데이트 가능한 방식으로 시큐리티 그룹을 분류하고 싶다면 `tags` 를 쓰라"고 권한다. 분류·설명 정보를 태그에 두면 나중에 무중단으로 고칠 수 있다.

예외는 태그 자체가 아니라 **태그가 붙는 대상**에서 온다. 리소스의 이름(`name`)이나 식별자 같은 ForceNew 인수를 `Name` 태그와 함께 바꾸면 교체가 일어나는데, 이때 원인은 태그가 아니라 그 인수다. plan에서 `-/+` 가 보이면 어떤 인수가 `# forces replacement` 로 표시되는지 확인한다 — 태그 줄에는 그 표시가 붙지 않는다.

## 흔한 실수

### ❌ `tags` 를 참조해 놓고 provider 기본 태그가 왜 없냐고 한다

`tags` 는 "이 블록에 우리가 쓴 것"이다. `default_tags` 를 켜 두었다면 최종값은 `tags_all` 에만 있다.

```terraform
# ❌ default_tags 가 빠진 반쪽이 나간다
output "vpc_tags" {
  value = aws_vpc.main.tags
}

resource "aws_flow_log" "main" {
  # ... 나머지 설정 ...
  tags = aws_vpc.main.tags
}
```

```terraform
# ✅ 실제로 붙어 있는 태그 전부는 tags_all 이다
output "vpc_tags" {
  value = aws_vpc.main.tags_all
}
```

### ❌ 콘솔에서 붙인 태그가 지워지는 것을 보고 코드에 전부 받아 적는다

보안팀이 붙인 `LastScanned` 를 유지하려고 리소스마다 그 태그를 적으면, 값이 갱신될 때마다 diff가 다시 생긴다. 값을 관리하는 주체는 우리가 아니다.

```terraform
# ❌ 남의 시스템이 관리하는 태그를 코드로 따라잡으려 한다
resource "aws_vpc" "main" {
  tags = {
    Name        = "main"
    LastScanned = "2026-08-19T03:00:00Z"
  }
}
```

```terraform
# ✅ provider 전역에서 그 키를 무시한다 (코드에서는 뺀다)
provider "aws" {
  ignore_tags {
    keys         = ["LastScanned"]
    key_prefixes = ["kubernetes.io/"]
  }
}

resource "aws_vpc" "main" {
  tags = {
    Name = "main"
  }
}
```

### ❌ `default_tags` 에 `Name` 을 넣는다

`Name` 은 리소스마다 달라야 하는 태그다. provider에 넣으면 코드에서 `Name` 을 쓰지 않은 모든 리소스가 같은 이름을 갖게 되어 콘솔 목록이 무의미해진다. 커밋 SHA처럼 매번 바뀌는 값도 같은 문제를 만든다 — apply마다 전 리소스에 태그 갱신이 계획된다.

```terraform
# ❌ 계정의 모든 리소스가 "Provider Tag" 라는 이름을 갖는다
provider "aws" {
  default_tags {
    tags = {
      Name        = "Provider Tag"
      DeployedAt  = timestamp()
    }
  }
}
```

```terraform
# ✅ 변하지 않는 분류 정보만 default_tags 에 둔다
provider "aws" {
  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      CostCenter  = var.cost_center
    }
  }
}
```

### ❌ ASG에도 `default_tags` 가 붙을 것이라고 믿는다

`aws_autoscaling_group` 은 명시된 예외다. 이 사실을 모르면 "EC2 인스턴스만 태그가 비어 있는" 상태가 몇 달간 유지되고, 그 기간의 비용은 할당되지 않는다.

```terraform
# ❌ default_tags 만 믿는다 — ASG와 그 인스턴스에는 아무것도 붙지 않는다
resource "aws_autoscaling_group" "app" {
  # ... 나머지 설정 ...
}
```

```terraform
# ✅ aws_default_tags 로 읽어 tag 블록으로 풀고, 인스턴스까지 전파한다
data "aws_default_tags" "current" {}

resource "aws_autoscaling_group" "app" {
  # ... 나머지 설정 ...

  dynamic "tag" {
    for_each = data.aws_default_tags.current.tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}
```

### ❌ `aws_ec2_tag` 로 Terraform이 관리하는 리소스의 태그를 붙인다

개별 태그 리소스는 **Terraform이 관리하지 않는 대상**을 위한 것이다. 원문의 경고 그대로, `aws_vpc` 와 `aws_ec2_tag` 로 같은 VPC의 태그를 함께 관리하면 `aws_vpc` 가 그 태그를 계속 지우려 해서 **영구적인 diff**가 생긴다.

```terraform
# ✅ 개별 태그 리소스는 암묵적으로 만들어진 대상에만 쓴다
resource "aws_ec2_tag" "example" {
  resource_id = aws_vpn_connection.example.transit_gateway_attachment_id
  key         = "Owner"
  value       = "Operations"
}
```

## 프로덕션 노트

- **비용 할당 태그는 소급되지 않는다.** Billing 콘솔에서 태그 키를 활성화한 시점 이후의 사용량만 Cost Explorer와 CUR에 차원으로 들어온다. 태그 표준을 정하는 일과 **키를 활성화하는 일은 별개**이며, 후자를 잊으면 태그는 붙어 있는데 청구서는 여전히 해석되지 않는다.
- **`default_tags` 는 provider 인스턴스 단위다.** alias provider를 여러 개 쓰거나 멀티 계정 구성이라면 **모든 provider 블록에 같은 설정을 반복**해야 한다. `ignore_tags` 도 마찬가지다. 한 곳이라도 빠지면 그 리전·계정의 리소스만 태그가 다르게 붙는다.
- **태그를 IAM 조건으로 쓰면 태그가 권한 경계가 된다.** `aws:ResourceTag/*` 로 접근을 통제하는 계정에서는 태그 수정 권한(`ec2:CreateTags` 등)을 사실상 권한 상승 경로로 취급해야 한다. Terraform 실행 롤이 태그를 바꿀 수 있다는 점도 위험 평가에 포함한다.
- **태그 표준 변경은 전 리소스 apply를 부른다.** `default_tags` 에 키 하나를 추가하면 그 provider가 관리하는 **모든 리소스**에 갱신 diff가 뜬다. 수천 개짜리 스택이라면 API 호출도 수천 번이라 스로틀링이 나기 쉽다. 스택을 나눠 순차 적용하고, 변경 창을 잡아 진행한다.
- **EKS를 쓴다면 `ignore_tags` 를 먼저 건다.** Kubernetes의 AWS 컨트롤러가 subnet과 시큐리티 그룹에 `kubernetes.io/` 접두어 태그를 붙인다. 이것을 무시하지 않으면 인프라 apply가 클러스터 동작에 필요한 태그를 지우고, 로드밸런서 생성이 조용히 실패한다.

## 연습문제

**1. 세 층의 태그 관찰하기.** provider `default_tags` 에 `Environment`, `Owner` 를 두고, VPC 하나는 태그 없이, 다른 하나는 `Owner` 를 다른 값으로 덮어써 만든다. 두 리소스의 `tags` 와 `tags_all` 을 모두 output으로 내보낸다.
*성공 기준:* 네 개의 output 값이 이 장의 예제 1~3과 같은 규칙(병합, 리소스 우선)으로 나오는 것을 확인하고, `tags` 와 `tags_all` 이 각각 무엇을 담는지 두 줄로 설명한다.

**2. 전량 관리 확인하기.** 위 VPC에 AWS CLI로 태그 `Scanner = external` 을 붙이고 plan을 돌린다. 그다음 provider에 `ignore_tags { keys = ["Scanner"] }` 를 추가하고 다시 plan을 돌린다.
*성공 기준:* 첫 plan에는 `-> null` 로 제거가 계획되고 두 번째 plan은 "No changes"가 된다. 이어서 리소스의 `tags` 에도 `Scanner` 를 적어 두면 어떤 일이 생기는지 재현하고 이유를 적는다.

**3. 환경변수 우선순위 확인하기.** `default_tags` 에 `Environment = "dev"` 를 둔 상태에서 `TF_AWS_DEFAULT_TAGS_Environment=prod` 를 내보내고 plan을 돌린다.
*성공 기준:* 최종 `tags_all` 의 `Environment` 값이 무엇인지 확인하고, `ignore_tags` 의 환경변수 규칙과 무엇이 다른지 한 줄로 정리한다.

## 요약

- 태그는 비용 할당, 소유권 추적, ABAC 접근 제어, 자동화의 조건으로 쓰인다. 비용 할당은 **소급되지 않으므로** 태그는 나중에 붙이면 늦는다.
- provider는 리소스의 태그를 **전량 관리**한다. 밖에서 붙인 태그는 다음 실행에 제거 대상으로 제안되며, 예외는 `aws:` 로 시작하는 AWS 관리 키뿐이다.
- `tags` 는 리소스 블록에 쓴 값, **`tags_all` 은 `default_tags` 까지 합친 최종값(계산 속성)** 이다. 참조·출력에는 거의 언제나 `tags_all` 을 쓴다.
- provider `default_tags` 는 같은 키를 **리소스 쪽이 덮어쓴다.** 덮어쓰기는 되지만 특정 리소스에서 **제외는 불가능**하다.
- `TF_AWS_DEFAULT_TAGS_<키>=<값>` 환경변수로도 기본 태그를 줄 수 있고, 인수와 겹치면 **provider 설정이 우선**한다. 반대로 `ignore_tags` 는 환경변수와 인수가 **병합**된다.
- **`aws_autoscaling_group` 은 `default_tags` 의 유일한 예외다.** `tag` 블록과 `propagate_at_launch` 를 쓰며, `aws_default_tags` 데이터 소스와 `dynamic "tag"` 로 기본 태그를 메운다.
- `merge(local.common_tags, {...})` 패턴은 리소스별 제외가 가능하고 모듈 경계를 넘어 명시적이라는 점에서 `default_tags` 와 상호 보완적이다. `Name` 처럼 리소스마다 달라야 하는 태그는 항상 리소스 쪽에 둔다.
- 외부 시스템이 붙이는 태그는 `lifecycle { ignore_changes = [tags.X] }` 또는 provider `ignore_tags` 로 제외한다. 무시하기로 한 키를 코드에 계속 적어 두면 영구 diff가 생긴다.
- 태그 변경은 제자리 갱신이며 리소스를 교체하지 않는다. `aws_security_group` 의 `description` 처럼 ForceNew인 필드 대신 태그로 분류 정보를 두라는 권고가 여기서 나온다.

## 다음으로

- [11장 — EC2 인스턴스](11-ec2-instance.md) — 인스턴스와 볼륨에 태그를 붙이는 자리, ForceNew 인수와 태그의 차이.
- [17장 — count · for_each · dynamic](../level2-intermediate/17-count-foreach-dynamic.md) — ASG의 `tag` 블록을 만들어 낸 `dynamic` 의 정식 문법.
- [23장 — 태깅 전략 심화](../level2-intermediate/23-tagging-strategy.md) — `ignore_tags` 상세, 개별 태그 리소스, `tag_policy_compliance`.
- 공식 문서: [Resource Tagging 가이드](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging)
