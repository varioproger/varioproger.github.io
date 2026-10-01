---
chapter: 17
level: "Level 2 — 중급"
title: "count · for_each · dynamic: 반복의 세 얼굴"
difficulty: 중급
reading_time: "32분"
prerequisites: [7, 16]
source_docs:
  - "website/docs/r/subnet.html.markdown"
  - "website/docs/r/security_group.html.markdown"
  - "website/docs/r/vpc_security_group_ingress_rule.html.markdown"
  - "website/docs/r/launch_template.html.markdown"
  - "website/docs/r/autoscaling_group.html.markdown"
  - "website/docs/r/iam_role_policy_attachment.html.markdown"
  - "website/docs/r/ssm_parameter.html.markdown"
  - "website/docs/d/availability_zones.html.markdown"
source_url: "https://developer.hashicorp.com/terraform/language/meta-arguments/for_each"
provider_baseline: "6.x"
---

# 17장 — count · for_each · dynamic: 반복의 세 얼굴

**이 장에서 배우는 것**

- `count` 와 `for_each` 가 만드는 리소스 **주소**의 차이를 알고, 인덱스 기반 주소가 왜 중간 항목 삭제에 취약한지 plan 출력으로 설명할 수 있다.
- 언제 `count`(0 또는 1, 조건부 생성)를 쓰고 언제 `for_each`(이름 있는 집합)를 쓰는지 판단할 수 있다.
- `for_each` 의 키가 plan 시점에 알려져야 한다는 제약과 그 에러를 읽고 우회할 수 있다.
- `dynamic` 블록이 정말 필요한 자리를 구분하고, 남용이 만드는 읽기 어려운 코드를 피할 수 있다.
- `setproduct`/`flatten` 으로 중첩 반복을 평탄한 map으로 만들고, splat과 `values()` 로 반복 리소스를 참조할 수 있다.
- `moved` 블록으로 `count` → `for_each` 마이그레이션을 리소스 파괴 없이 수행할 수 있다.

**왜 중요한가**

서브넷 세 개를 `count = 3` 으로 만든 팀이 있다. 여섯 달 뒤 `ap-northeast-2b` 를 쓰지 않기로 하고 목록의 가운데 항목을 지웠다. plan은 "1 to add, 2 to destroy"를 출력했다. 지운 것은 하나인데 왜 둘이 사라지는가 — 인덱스가 한 칸씩 당겨졌기 때문이다. `[1]` 은 b에서 c가 되면서 교체되고 `[2]` 는 사라진다. 그 서브넷들에는 RDS 서브넷 그룹과 ALB가 매달려 있었고 apply는 30분, 그중 8분은 다운타임이었다.

같은 일이 `for_each` 였다면 plan은 "1 to destroy"였다. 키가 `"ap-northeast-2b"` 라는 이름이라 나머지 둘의 주소가 흔들리지 않는다. 코드는 두 줄 차이지만 사고의 크기는 자릿수가 다르다.

반대 방향의 함정도 있다. `for_each` 는 안전하니 무조건 쓰자고 정하면, 키를 아직 모르는 값에서 뽑는 순간 `Invalid for_each argument` 로 plan 자체가 실패한다. 이 에러는 **Terraform이 apply 전에 인스턴스 개수를 확정할 수 없어서** 나는 것이라 문법을 고쳐서는 풀리지 않고 데이터의 출처를 바꿔야 풀린다.

세 번째 얼굴인 `dynamic` 은 리소스가 아니라 **블록**을 반복한다. 필요한 자리에서는 대안이 없지만, 습관이 되면 스무 줄이면 될 보안 그룹이 중첩 `dynamic` 세 겹으로 변해 아무도 읽지 못하는 코드가 된다.

## `count`: 인덱스로 세는 반복

`count` 는 리소스 블록 하나로 인스턴스를 N개 만든다. 블록 안에서는 `count.index` 로 0부터 시작하는 번호를 읽는다.

```terraform
resource "aws_subnet" "private" {
  count = 3

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone = var.azs[count.index]

  tags = {
    Name = "private-${count.index}"
  }
}
```

주소는 `aws_subnet.private[0]`, `[1]`, `[2]` 이고 state의 `index_key` 도 정수다([9장](../level1-beginner/09-state-basics.md)). 참조는 인덱스로 하거나 splat으로 전체를 가져온다.

```terraform
output "private_subnet_ids" {
  value = aws_subnet.private[*].id   # 리스트
}
```

`count` 는 `module` 과 `data` 블록에도 붙는다. 붙지 않는 곳은 `provider` 와 `backend`, `lifecycle` 같은 메타 인수 블록이다.

## count의 치명적 결함: 인덱스는 이름이 아니다

위 코드에서 `var.azs = ["ap-northeast-2a", "ap-northeast-2b", "ap-northeast-2c"]` 이고 `count = length(var.azs)` 라고 하자. 가운데 `"ap-northeast-2b"` 를 지우면 Terraform이 보는 것은 이렇다.

```console
$ terraform plan

  # aws_subnet.private[1] must be replaced
-/+ resource "aws_subnet" "private" {
      ~ availability_zone = "ap-northeast-2b" -> "ap-northeast-2c" # forces replacement
      ~ cidr_block        = "10.0.1.0/24" -> "10.0.2.0/24" # forces replacement
      ~ id                = "subnet-0b21f..." -> (known after apply)
    }

  # aws_subnet.private[2] will be destroyed
  - resource "aws_subnet" "private" {
      - availability_zone = "ap-northeast-2c" -> null
      - cidr_block        = "10.0.2.0/24" -> null
    }

Plan: 1 to add, 0 to change, 2 to destroy.
```

`[1]` 은 b였는데 이제 c여야 한다. AWS는 기존 subnet의 CIDR이나 AZ를 바꿀 수 없으므로 **교체**가 계획되고, `[2]` 는 대응 항목이 없어 파괴된다. **멀쩡한 c 서브넷이 지워졌다 다시 만들어지는 것이다.**

핵심은 이것이다. **`count` 의 정체성은 순서다.** 목록의 앞이나 가운데가 바뀌면 뒤의 모든 주소가 밀리고, 목록 끝에 추가하는 것만이 안전한 변경이다. 그래서 `count` 는 "요소들이 서로 구별되지 않고 개수만 의미 있는" 경우에만 안전한데, 실무의 서브넷·보안 그룹 규칙·IAM 정책 첨부는 거의 모두 그렇지 않다.

## `for_each`: 키로 세는 반복

`for_each` 는 **map** 또는 **set of string** 을 받는다. 각 인스턴스의 주소는 정수가 아니라 문자열 키다.

```terraform
variable "private_subnets" {
  type = map(object({ cidr_block = string, az = string }))

  default = {
    "private-a" = { cidr_block = "10.0.0.0/24", az = "ap-northeast-2a" }
    "private-b" = { cidr_block = "10.0.1.0/24", az = "ap-northeast-2b" }
    "private-c" = { cidr_block = "10.0.2.0/24", az = "ap-northeast-2c" }
  }
}

resource "aws_subnet" "private" {
  for_each = var.private_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value.cidr_block
  availability_zone = each.value.az

  tags = {
    Name = each.key
  }
}
```

주소는 `aws_subnet.private["private-a"]` 처럼 된다. 이제 `"private-b"` 항목을 지우면 plan은 **그 하나만** 파괴한다. a와 c의 키는 그대로이므로 아무 일도 일어나지 않는다.

`each` 에는 두 값이 있다. **`each.key`** 는 map의 키(또는 set의 원소), **`each.value`** 는 map의 값이다. set을 넘기면 둘이 같다.

```terraform
resource "aws_iam_role_policy_attachment" "app" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
  ])

  role       = aws_iam_role.app.name
  policy_arn = each.value
}
```

`aws_iam_role_policy_attachment` 은 `role` 과 `policy_arn` 두 인수만 받는 관계 리소스라 이 패턴이 잘 맞는다. `count` 였다면 가운데 정책 하나를 빼는 순간 뒤의 첨부가 전부 떼였다 다시 붙고, 그 사이 EC2 인스턴스는 권한을 잃는다.

**리스트는 그대로 넘길 수 없다.** `for_each = var.names` 에서 `var.names` 가 `list(string)` 이면 타입 에러가 난다. `toset(var.names)` 로 감싼다. 이때 중복이 사라진다는 점에 주의한다 — 리스트에 같은 값이 두 번 있으면 인스턴스는 하나만 생긴다.

### 언제 count이고 언제 for_each인가

판단은 한 질문으로 끝난다. **각 인스턴스에 고유한 이름을 붙일 수 있는가?**

- 붙일 수 있다 -> **`for_each`**. 서브넷, 보안 그룹 규칙, IAM 정책 첨부, 환경별 파라미터. 실무 반복의 대부분이 여기다.
- 붙일 수 없고 개수만 의미 있다 -> `count`. 순서가 곧 의미인 드문 경우.
- **0 또는 1** -> `count`. 조건부 생성은 `count` 의 정당한 자리다.

## `for_each` 의 키는 apply 전에 알려져야 한다

Terraform은 plan 시점에 **인스턴스 목록을 확정**해야 한다. 각 인스턴스가 하나의 주소를 가지며, plan은 주소별 변경 계획이기 때문이다. 그래서 `for_each` 의 **키**는 apply 전에 알려진 값이어야 한다.

아직 만들어지지 않은 리소스의 속성으로 키를 만들면 이렇게 실패한다.

```terraform
resource "aws_ssm_parameter" "subnet_ids" {
  for_each = toset(aws_subnet.private[*].id)   # 실패: id는 apply 후에야 정해진다
  name     = "/acme/prod/subnets/${each.value}"
  type     = "String"
  value    = each.value
}
```

```console
│ Error: Invalid for_each argument
│
│ The "for_each" set includes values derived from resource attributes that
│ cannot be determined until apply, and so Terraform cannot determine the
│ full set of keys that will identify the instances of this resource.
```

에러 문구가 정확히 원인을 말한다 — **키를 확정할 수 없다.** 값이 `known after apply` 인 것은 괜찮다. 문제는 그 값이 **키 자리**에 들어갔을 때다.

우회는 셋이다.

**1. 키를 정적인 것으로 바꾼다.** 대부분 이것으로 끝난다. 위 예에서 진짜 필요한 것은 "서브넷 ID를 파라미터로 발행하는 것"이지 "ID를 이름에 넣는 것"이 아니다.

```terraform
# ✅ 키는 우리가 정한 이름, 값은 known after apply여도 무방하다
resource "aws_ssm_parameter" "subnet_ids" {
  for_each = aws_subnet.private   # 키는 "private-a" 같은 우리 이름

  name  = "/acme/prod/subnets/${each.key}"
  type  = "String"
  value = each.value.id           # 값은 apply 후에 채워진다
}
```

리소스 블록 자체를 `for_each` 에 넘길 수 있다는 점이 유용하다 — `for_each` 로 만든 리소스는 **map** 이므로 키가 그대로 전달된다.

**2. 입력 변수에서 키를 받는다.** `toset(var.names)` 처럼 사용자가 준 값은 언제나 알려져 있다. **3. 단계를 나눈다.** 정말로 만들어진 뒤의 값이 키여야 한다면 스택을 둘로 나눈다. `-target` 으로 앞 단계만 먼저 apply하는 것은 응급 처치이지 상시 절차가 아니다.

같은 제약이 `count` 에도 있다. `count` 의 **값**(개수)이 apply 전에 알려져야 한다.

## 조건부 생성: `count = var.enabled ? 1 : 0` 과 `one()`

리소스를 만들지 말지 정하는 스위치는 `count` 의 정당한 용법이다.

```terraform
resource "aws_nat_gateway" "main" {
  count = var.enable_nat_gateway ? 1 : 0

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public["public-a"].id
}
```

문제는 참조할 때 생긴다. `count` 가 붙는 순간 이 리소스는 **리스트**이므로 `aws_nat_gateway.main[0].id` 라고 써야 하는데, `enable_nat_gateway = false` 면 리스트가 비어 `[0]` 은 인덱스 범위 초과 에러다. `one()` 이 이 자리를 위한 함수다 — 원소가 0개면 `null`, 1개면 그 원소를 돌려주고 2개 이상이면 에러다.

```terraform
output "nat_gateway_id" {
  value = one(aws_nat_gateway.main[*].id)   # 없으면 null
}

resource "aws_route" "private_default" {
  count = var.enable_nat_gateway ? 1 : 0

  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = one(aws_nat_gateway.main[*].id)
}
```

`try(aws_nat_gateway.main[0].id, null)` 로도 되지만 `one()` 쪽이 의도가 분명하다 — `try` 는 에러를 삼키므로 오타까지 함께 숨긴다.

조건이 두 축 이상으로 갈라지면 `count` 조건문 대신 **`for_each` 에 빈 map을 넘기는** 쪽이 읽기 쉽다.

```terraform
resource "aws_vpc_endpoint" "interface" {
  for_each = var.enable_endpoints ? var.interface_endpoints : {}

  vpc_id            = aws_vpc.main.id
  service_name      = each.value.service_name
  vpc_endpoint_type = "Interface"
}
```

빈 map이면 인스턴스가 0개다. 켜고 끄는 스위치와 "무엇을 만들 것인가"를 한 식으로 표현할 수 있다.

## 모듈에 `for_each` 쓰기

`for_each` 는 리소스 전용이 아니다. **모듈 호출**에도 붙는다. 환경마다 같은 모양의 스택을 여러 벌 만들 때 반복 단위가 리소스가 아니라 모듈이 된다.

```terraform
module "service" {
  source   = "./modules/ecs-service"
  for_each = var.services

  name          = each.key
  image         = each.value.image
  cpu           = each.value.cpu
  desired_count = each.value.desired_count

  cluster_arn = aws_ecs_cluster.main.arn
  subnet_ids  = [for s in aws_subnet.private : s.id]
}
```

주소는 `module.service["api"].xxx` 가 되고, 모듈 output도 map으로 모여 `{ for k, m in module.service : k => m.url }` 처럼 접을 수 있다.

주의할 점이 하나 있다. 모듈 안에서 또 `for_each` 를 쓰면 인스턴스 수가 곱해진다. 서비스 10개짜리 모듈 안에서 규칙 20개를 반복하면 리소스 200개이고, plan 시간과 state 크기가 그만큼 커진다([16장](16-remote-state-and-backends.md)의 스택 쪼개기가 필요해지는 지점이다).

## `dynamic`: 리소스가 아니라 블록을 반복한다

`count` 와 `for_each` 는 **리소스**를 여러 개 만든다. 반면 하나의 리소스 안에 **같은 종류의 블록**이 여러 개 필요하고 그 개수를 변수로 정하고 싶다면 `dynamic` 이 유일한 수단이다. 대표적인 자리는 `aws_security_group` 의 `ingress`/`egress`, `aws_launch_template` 의 `block_device_mappings`, `aws_autoscaling_group` 의 `tag` 셋이다. 문법은 `dynamic "<블록 이름>"` + `for_each` + `content` 다.

```terraform
variable "ingress_rules" {
  type = map(object({
    from_port = number, to_port = number, protocol = string, cidr_blocks = list(string)
  }))
}

resource "aws_security_group" "app" {
  name   = "prod-app"
  vpc_id = aws_vpc.main.id

  dynamic "ingress" {
    for_each = var.ingress_rules

    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
      description = ingress.key
    }
  }
}
```

블록 안에서는 `each` 가 아니라 **블록 이름과 같은 이름의 임시 변수**(`ingress.key`, `ingress.value`)를 쓴다. 이름이 겹치거나 중첩해서 헷갈릴 때는 `iterator = rule` 을 주어 변수 이름을 `rule` 로 바꾼다.

ASG의 태그는 `dynamic` 이 사실상 필수인 자리다. `aws_autoscaling_group` 은 `tags` map이 아니라 `key`/`value`/`propagate_at_launch` 세 인수를 가진 **`tag` 블록**을 반복해서 받고, provider의 `default_tags` 가 적용되지 않는 **유일한 예외 리소스**이기 때문이다([10장](../level1-beginner/10-tags-basics.md)).

```terraform
resource "aws_autoscaling_group" "app" {
  name                = "prod-app"
  min_size            = 2
  max_size            = 6
  vpc_zone_identifier = [for s in aws_subnet.private : s.id]

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}
```

### dynamic을 쓰지 말아야 할 때

`dynamic` 은 읽는 사람에게 비용을 청구한다. 블록 하나를 보려면 변수 정의로 갔다가 tfvars로 갔다가 돌아와야 한다. 세 경우에는 쓰지 않는 편이 낫다.

**1. 블록이 두세 개로 고정되어 있을 때.** 반복문으로 만든 세 줄보다 그냥 쓴 아홉 줄이 읽기 쉽다.

**2. 별도 리소스로 나눌 수 있을 때.** 보안 그룹 규칙이 그렇다. v6에는 규칙 하나가 리소스 하나인 `aws_vpc_security_group_ingress_rule` 이 있고, 규칙마다 고유 주소가 생기므로 plan에 "어느 규칙이 바뀌는지"가 이름으로 나타나며 태그도 붙는다.

```terraform
resource "aws_vpc_security_group_ingress_rule" "app" {
  for_each = var.ingress_rules

  security_group_id = aws_security_group.app.id
  cidr_ipv4         = each.value.cidr
  from_port         = each.value.from_port
  to_port           = each.value.to_port
  ip_protocol       = each.value.protocol
  description       = each.key
}
```

`ip_protocol` 이 Required이고 `cidr_ipv4`/`cidr_ipv6`/`prefix_list_id`/`referenced_security_group_id` 중 하나는 반드시 줘야 한다. `ip_protocol = "-1"` 이면 `from_port`/`to_port` 를 쓰지 않는다.

**3. 중첩이 두 겹을 넘을 때.** `dynamic` 안의 `dynamic` 안의 `dynamic` 은 읽을 수 없다. 그 지점이 오면 리소스를 나누거나 모듈로 감쌀 때다.

## 중첩 반복: `setproduct` 와 `flatten`

"서브넷 3종 × AZ 3개"처럼 두 축의 조합이 필요할 때는 **평탄한 map을 먼저 만들고** 그 map으로 한 번만 반복한다.

`setproduct` 는 두 집합의 데카르트 곱을 리스트의 리스트로 준다.

```terraform
locals {
  tiers = ["public", "private", "data"]
  azs   = ["ap-northeast-2a", "ap-northeast-2b", "ap-northeast-2c"]

  # [["public","ap-northeast-2a"], ["public","ap-northeast-2b"], ...] 9개
  subnet_pairs = setproduct(local.tiers, local.azs)

  subnets = {
    for pair in local.subnet_pairs :
    "${pair[0]}-${substr(pair[1], -1, 1)}" => {
      tier = pair[0]
      az   = pair[1]
      cidr = cidrsubnet(var.vpc_cidr, 8,
        index(local.tiers, pair[0]) * length(local.azs) + index(local.azs, pair[1]))
    }
  }
}

resource "aws_subnet" "this" {
  for_each = local.subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az

  tags = {
    Name = each.key
    Tier = each.value.tier
  }
}
```

키는 `"public-a"`, `"private-b"` 처럼 읽을 수 있는 이름이 된다. 이 이름이 곧 주소이므로 AZ를 하나 빼면 그 AZ의 서브넷 3개만 사라지고 나머지 6개는 미동도 하지 않는다.

`flatten` 은 모양이 다른 중첩에 쓴다. 항목마다 하위 목록의 길이가 다를 때가 대표적이다.

```terraform
locals {
  # var.role_actions = { api = ["s3:GetObject", ...], worker = ["sqs:ReceiveMessage"] }
  grants = flatten([
    for role, actions in var.role_actions : [
      for action in actions : { key = "${role}:${action}", role = role, action = action }
    ]
  ])

  grant_map = { for g in local.grants : g.key => g }
}
```

`flatten` 은 리스트를 주므로 **map으로 다시 접는 단계**가 필요하다. `for_each` 는 리스트를 받지 않고, `toset` 하면 객체 집합이 되어 키가 읽기 어려워지기 때문이다. 이 "리스트 만들기 -> map으로 접기"가 중첩 반복의 표준 형태다. 키 표현식은 **반드시 유일해야** 하며, 겹치면 중복 키 에러가 난다.

## 반복 리소스를 참조하기: splat과 `values()`

`count` 와 `for_each` 는 참조 방식이 다르다. **`count` 는 리스트, `for_each` 는 map**이라는 사실에서 전부 따라온다.

```terraform
# count 리소스 — splat이 동작한다
aws_subnet.private[*].id            # list(string)
aws_subnet.private[0].id            # 하나

# for_each 리소스 — splat은 동작하지 않는다
values(aws_subnet.private)[*].id            # ✅ map을 리스트로 만든 뒤 splat
[for s in aws_subnet.private : s.id]        # ✅ for 표현식 (동등)
aws_subnet.private["private-a"].id          # 하나
keys(aws_subnet.private)                    # ["private-a", "private-b", ...]
```

`values()` 와 `for` 표현식 중에서는 대개 `for` 쪽이 낫다 — `[for k, s in aws_subnet.private : s.id if s.tags["Tier"] == "private"]` 처럼 조건이나 변환을 함께 넣을 수 있기 때문이다.

map은 **키의 사전순**으로 정렬된다. `"private-a"`, `"private-b"` 는 기대한 순서지만 `"az-10"` 은 `"az-2"` 보다 앞에 온다. 순서가 의미를 갖는 자리에서는 키 이름을 정렬 가능하게 짓는다.

`for_each` 결과를 다른 `for_each` 에 그대로 넘기는 것이 가장 견고하다.

```terraform
resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private   # 키가 그대로 이어진다

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}
```

서브넷 키와 연결 키가 항상 일치하므로 서브넷 하나를 빼면 연결도 정확히 하나만 사라진다.

## `count` 에서 `for_each` 로 옮기기

기존 스택을 옮길 때 코드만 바꾸면 Terraform은 **인덱스 주소 3개를 파괴하고 키 주소 3개를 새로 만드는** 계획을 세운다. 실물이 전부 재생성된다. 이를 막는 것이 `moved` 블록이다([22장](22-moved-removed-refactoring.md)).

```terraform
moved {
  from = aws_subnet.private[0]
  to   = aws_subnet.private["private-a"]
}

moved {
  from = aws_subnet.private[1]
  to   = aws_subnet.private["private-b"]
}

# ... 인스턴스 수만큼 반복 ...
```

절차는 이렇다.

1. 옮기기 전에 `terraform state list` 로 **현재 인덱스와 실물의 대응**을 확인한다. 코드의 목록 순서가 아니라 state가 진실이다.
2. 코드를 `for_each` 로 바꾸고 `moved` 블록을 인스턴스 수만큼 쓴다.
3. `terraform plan` 이 **"0 to add, 0 to change, 0 to destroy"** 와 이동 목록만 보여 주는지 확인한다. 하나라도 destroy가 있으면 대응이 틀린 것이다.
4. apply한 뒤 `moved` 블록은 팀원과 CI가 모두 새 state를 본 뒤에 지운다.

`terraform state mv` 로도 되지만 `moved` 쪽이 낫다 — 코드에 남아 리뷰되고 다른 사람의 작업 디렉터리에도 자동으로 적용된다.

## 흔한 실수

### ❌ 이름 있는 집합에 `count` 를 쓴다

목록 가운데를 건드리는 순간 뒤의 리소스가 전부 재생성된다.

```terraform
# ❌ 정책 하나를 빼면 뒤의 첨부가 전부 떼였다 붙는다
resource "aws_iam_role_policy_attachment" "app" {
  count      = length(var.policy_arns)
  role       = aws_iam_role.app.name
  policy_arn = var.policy_arns[count.index]
}
```

```terraform
# ✅ ARN 자체를 키로 쓰면 다른 항목은 흔들리지 않는다
resource "aws_iam_role_policy_attachment" "app" {
  for_each   = toset(var.policy_arns)
  role       = aws_iam_role.app.name
  policy_arn = each.value
}
```

### ❌ `for_each` 의 키를 `known after apply` 값에서 뽑는다

`Invalid for_each argument` 는 "인스턴스 개수를 확정할 수 없다"는 뜻이다. 키를 우리가 정한 이름으로 바꾸면 풀린다.

```terraform
# ❌ 아직 존재하지 않는 리소스의 id를 키로 쓴다
resource "aws_ssm_parameter" "subnet" {
  for_each = toset(aws_subnet.private[*].id)
  name     = "/acme/subnets/${each.value}"
  type     = "String"
  value    = each.value
}
```

```terraform
# ✅ 키는 이미 알려진 이름, 값만 apply 후에 채워진다
resource "aws_ssm_parameter" "subnet" {
  for_each = aws_subnet.private
  name     = "/acme/subnets/${each.key}"
  type     = "String"
  value    = each.value.id
}
```

### ❌ 조건부 리소스를 `[0]` 으로 참조한다

`count = 0` 일 때 `[0]` 은 인덱스 범위 초과 에러다. 스위치를 끈 환경에서만 깨지므로 dev는 멀쩡하고 다른 환경에서 터진다.

```terraform
# ❌ enable_nat_gateway = false 인 환경에서 plan이 실패한다
output "nat_gateway_id" {
  value = aws_nat_gateway.main[0].id
}
```

```terraform
# ✅ 없으면 null을 돌려준다
output "nat_gateway_id" {
  value = one(aws_nat_gateway.main[*].id)
}
```

### ❌ `count` -> `for_each` 를 `moved` 없이 한다

plan에 destroy가 잔뜩 뜨는데 "리팩터링이니까 괜찮겠지" 하고 넘어가면 실제로 서브넷이 지워진다.

```console
# ❌ 그대로 apply하면 실물이 전부 재생성된다
Plan: 3 to add, 0 to change, 3 to destroy.

# ✅ moved 블록을 넣고 이 출력이 나오는지 확인한 뒤 apply한다
Plan: 0 to add, 0 to change, 0 to destroy.
```

## 프로덕션 노트

- **`for_each` 의 키는 사실상 공개 API다.** 키가 바뀌면 그 인스턴스는 파괴 후 재생성된다. `"private-a"` 같은 논리적 이름을 쓰고 CIDR이나 ID처럼 변할 값을 키로 삼지 않는다. 키 변경에는 반드시 `moved` 를 함께 쓴다.
- **인스턴스 수가 곧 API 호출 수이자 state 크기다.** 리소스 300개짜리 모듈을 환경 3개에 쓰면 900개이고, plan마다 900번의 `Describe*` 가 나가 스로틀링이 시작된다([40장](../level3-advanced/40-performance-and-throttling.md)).
- **`data "aws_availability_zones"` 를 직접 인덱싱하지 않는다.** AZ 목록은 계정마다 다르므로 `names[0]` 은 다른 계정에서 다른 AZ를 가리킨다. AZ 이름을 변수로 고정하거나 최소한 키에 AZ 이름을 넣어 주소가 AZ에 묶이게 한다.
- **`toset` 은 중복을 지운다.** 리스트에 같은 값이 두 번 있으면 인스턴스는 하나만 생기고 경고도 없다. 정책 ARN 목록을 여러 곳에서 합칠 때 개수가 기대와 다르면 여기를 의심한다.
- **`dynamic` 은 plan diff의 해상도를 떨어뜨린다.** 별도 리소스로 나눌 수 있는 관계(보안 그룹 규칙, 라우트)는 나누는 쪽이 운영에서 유리하다.
- **`for_each` 를 리소스 참조로 이어 붙인다.** `for_each = aws_subnet.private` 처럼 앞 리소스의 map을 그대로 넘기면 키가 자동으로 일치한다. 목록을 두 번 정의하면 언젠가 어긋나고, 그날 파괴 계획으로 알게 된다.

## 연습문제

**1. 인덱스 시프트 재현.** `count` 로 서브넷 3개를 만들고 apply한 뒤 AZ 목록의 **가운데** 항목을 지우고 plan을 뜬다.
*성공 기준:* `[1]` 이 교체(`-/+`)되고 `[2]` 가 파괴되는 것을 확인하고 원인을 세 줄로 적는다. 같은 구성을 `for_each` 로 바꿔 "1 destroy"만 나오는 것을 확인한다.

**2. `moved` 로 무중단 마이그레이션.** 위 `count` 버전을 파괴하지 않고 `for_each` 로 옮긴다.
*성공 기준:* `terraform state list` 로 대응을 확인하고 `moved` 블록을 작성해, plan이 `0 to add, 0 to change, 0 to destroy` 와 이동 목록만 출력하는 상태에서 apply한다.

**3. 중첩 반복.** tier 3종 × AZ 2개 = 서브넷 6개를 `setproduct` 로 만들고, 각 서브넷에 라우트 테이블 연결을 `for_each = aws_subnet.this` 로 이어 붙인다.
*성공 기준:* `terraform state list` 출력의 키가 `"public-a"` 형태로 읽히고, AZ 하나를 목록에서 빼면 plan이 정확히 서브넷 3개와 연결 3개만 파괴한다.

**4. dynamic과 개별 리소스 비교.** 같은 ingress 규칙 5개를 (a) `aws_security_group` 의 `dynamic "ingress"` 로, (b) `aws_vpc_security_group_ingress_rule` 의 `for_each` 로 구현한다.
*성공 기준:* 규칙 하나의 포트를 바꾼 뒤 두 방식의 plan 출력을 비교해 변경 지점을 찾는 비용의 차이를 적는다.

## 요약

- `count` 는 인스턴스를 **정수 인덱스**로, `for_each` 는 **문자열 키**로 식별한다. 주소가 `aws_subnet.private[0]` 이냐 `aws_subnet.private["private-a"]` 냐의 차이이며 이것이 안전성의 전부다.
- `count` 목록의 가운데를 지우면 **뒤의 모든 인덱스가 밀려** 교체·파괴가 연쇄한다. 목록 끝에 추가하는 것만이 안전한 변경이다. 각 인스턴스에 고유한 이름을 붙일 수 있으면 `for_each` 를 쓰고, `count` 는 **0 또는 1의 조건부 생성**과 순서 자체가 의미인 경우에만 쓴다.
- `for_each` 는 **map 또는 set of string** 을 받는다. 리스트는 `toset()` 으로 감싸며 이때 중복이 사라진다. set에서는 `each.key` 와 `each.value` 가 같다.
- **`for_each` 의 키는 apply 전에 알려져야 한다.** `known after apply` 값을 키로 쓰면 `Invalid for_each argument` 가 난다. 키를 우리가 정한 이름으로 바꾸거나(대개 이것으로 끝난다) 단계를 나눈다. 값이 apply 후에 정해지는 것은 아무 문제가 없다.
- `count = var.enabled ? 1 : 0` 뒤의 `[0]` 참조는 꺼진 환경에서 깨지므로 `one()` 을 쓴다. 스위치와 목록을 함께 표현하려면 `for_each` 에 빈 map을 넘긴다.
- `dynamic` 은 리소스가 아니라 **블록**을 반복하며 `for_each` + `content`(+`iterator`)로 쓴다. 꼭 필요한 자리는 `aws_security_group` 의 `ingress`, `aws_launch_template` 의 `block_device_mappings`, `aws_autoscaling_group` 의 `tag` 정도이고, 별도 리소스(`aws_vpc_security_group_ingress_rule`)로 나눌 수 있으면 그쪽이 낫다.
- 중첩 반복은 `setproduct`/`flatten` 으로 **평탄한 리스트를 만들고 map으로 접은 뒤** 한 번만 `for_each` 한다. 키는 유일해야 한다.
- `count` 리소스는 리스트라 `[*]` 가 동작하고, `for_each` 리소스는 map이라 `values()` 나 `for` 표현식을 쓴다. map은 키의 사전순으로 정렬된다. `count` -> `for_each` 마이그레이션은 반드시 `moved` 블록과 함께 하고 plan이 파괴 0을 보이는지 확인한 뒤 apply한다.

## 다음으로

- [18장 — 표현식과 내장 함수](18-expressions-and-functions.md) — `for`, splat, `try`, `templatefile` 을 제대로 다룬다.
- [19장 — 모듈: 재사용 단위를 설계한다](19-modules.md) — `for_each` 가 붙는 모듈을 어떻게 설계할 것인가.
- [22장 — moved · removed: 상태를 깨지 않고 리팩터링하기](22-moved-removed-refactoring.md) — 주소 이동의 정석.
- 공식 문서: [for_each](https://developer.hashicorp.com/terraform/language/meta-arguments/for_each), [dynamic blocks](https://developer.hashicorp.com/terraform/language/expressions/dynamic-blocks)
