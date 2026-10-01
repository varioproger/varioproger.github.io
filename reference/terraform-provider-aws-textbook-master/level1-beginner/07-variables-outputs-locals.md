---
chapter: 7
level: "Level 1 — 초급"
title: "변수·출력·로컬: 값을 밖으로 빼기"
difficulty: 입문
reading_time: "28분"
prerequisites: [3, 5]
source_docs:
  - "website/docs/r/vpc.html.markdown"
  - "website/docs/r/subnet.html.markdown"
  - "website/docs/r/instance.html.markdown"
  - "website/docs/d/availability_zones.html.markdown"
  - "website/docs/d/ssm_parameter.html.markdown"
  - "website/docs/index.html.markdown"
source_url: "https://developer.hashicorp.com/terraform/language/values"
provider_baseline: "6.x"
---

# 7장 — 변수·출력·로컬: 값을 밖으로 빼기

**이 장에서 배우는 것**

- `variable` 블록의 `type`, `default`, `sensitive`, `nullable`, `validation` 을 골라 쓰고 각각이 plan 이전에 무엇을 막는지 설명할 수 있다.
- 값이 들어오는 여섯 가지 경로와 우선순위를 추론해 "왜 내가 넣은 값이 안 먹히는가"를 진단할 수 있다.
- `sensitive = true` 가 가리는 것과 절대 가리지 못하는 것(state 평문)을 구분하고 팀에 정확히 설명할 수 있다.
- `output` 을 모듈 경계의 공개 API로 설계하고 `precondition` 으로 잘못된 값이 밖으로 나가는 것을 막을 수 있다.
- `locals` 로 태그 맵·이름 접두어·서브넷 CIDR을 파생시키고, 무엇을 변수로 빼고 무엇을 빼지 않을지 판단할 수 있다.

**왜 중요한가**

변수를 배우기 전과 후의 차이는 "재사용"이 아니라 **실수의 발견 시점**이다. `cidr_block = "10.0.0.0/16"` 을 스물세 곳에 흩어 놓은 설정에서 CIDR을 바꾸는 일은 찾기·바꾸기 스물세 번이고, 한 곳을 놓쳐도 plan은 통과한다. Terraform은 그 값이 CIDR이라는 것도 나머지 스물두 곳과 같아야 한다는 것도 모른다. 문제는 apply 뒤 라우팅이 안 되는 서브넷 하나로 드러나고, 그것을 찾는 데 반나절이 든다.

두 번째는 더 비싸다. `instance_type` 을 변수로 뺐지만 `validation` 을 걸지 않은 모듈이 있다고 하자. 누군가 `dev.tfvars` 를 복사해 `prod.tfvars` 를 만들면서 `instance_type = "t3.micro"` 를 지우지 않는다. plan은 조용히 통과한다 — 완벽하게 유효한 문자열이기 때문이다. 프로덕션 ASG가 t3.micro로 교체되고 트래픽이 몰리는 순간 전부 죽는다. 반대로 오타로 `m5.24xlarge` 를 적었고 아무도 막지 않았으며 청구서로 알게 되는 일도 흔하다. `validation` 블록 다섯 줄이 두 사고를 모두 plan 이전에 잡는다.

세 번째는 `sensitive` 를 잘못 이해한 팀에서 나온다. DB 비밀번호를 `sensitive = true` 변수로 받았으니 안전하다고 믿지만, `sensitive` 는 **CLI 출력만** 가린다. 값은 state에 평문으로 저장되고 그 state를 읽을 수 있는 사람은 전부 비밀번호를 읽는다.

## `variable` 블록의 해부

```terraform
variable "vpc_cidr" {
  type        = string
  description = "VPC 주 CIDR. /16 ~ /20 범위를 권장한다."
  default     = "10.0.0.0/16"
}
```

블록 레이블 하나가 변수 이름이고 설정 안에서는 `var.vpc_cidr` 로 참조한다. 소문자 스네이크를 쓰며 `count`, `for_each`, `source`, `providers`, `lifecycle`, `depends_on`, `locals` 같은 예약어는 쓸 수 없다.

바디에 들어갈 수 있는 것은 정해져 있다 — `type`, `default`, `description`, `sensitive`, `nullable`, `ephemeral`, 그리고 하나 이상의 `validation` 블록. 임의의 인수를 추가할 수 없고 **표현식으로 값을 계산할 수도 없다**. `default` 에는 다른 변수를 포함해 어떤 참조도 쓸 수 없다 — 변수는 그래프의 가장 바깥쪽 입구이고 입구는 자기 안쪽을 볼 수 없기 때문이다. 계산이 필요하면 그것은 `locals` 의 일이다.

`description` 은 대화형 프롬프트에 그대로 출력되고 `.tfvars` 를 처음 쓰는 사람이 보는 유일한 설명이다. "VPC CIDR"처럼 이름을 되풀이하면 없는 것과 같다 — **허용 범위와 바꿨을 때의 결과**를 적는다.

## 타입 제약: 값의 모양을 선언한다

`type` 을 생략하면 `any` 이고 아무것도 검사하지 않는다. 문자열이 와야 할 자리에 리스트가 들어와도 변수 단계는 통과하고, 훨씬 안쪽의 리소스 인수에서 읽기 어려운 에러가 난다. **타입은 항상 쓴다.** 기본 타입은 `string`, `number`, `bool` 셋이고 복합 타입은 `list(T)`, `set(T)`, `map(T)`, `object({...})`, `tuple([...])` 다.

```terraform
variable "project" {
  type        = string
  description = "리소스 이름과 태그에 붙는 접두어. 소문자·하이픈만."
}

variable "az_count" {
  type        = number
  description = "서브넷을 배치할 AZ 개수. 리전이 가진 AZ 수를 넘을 수 없다."
  default     = 2
}

variable "private_subnet_cidrs" {
  type        = list(string)
  description = "프라이빗 서브넷 CIDR. AZ 순서와 인덱스가 대응한다."
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}
```

`list` 와 `set` 의 차이는 [3장](03-hcl-basics.md)에서 다뤘다. **순서가 의미를 갖는 값은 `list`** 로 받는다. `private_subnet_cidrs` 에는 "0번 CIDR이 0번 AZ로 간다"는 약속이 있으므로 `set` 이면 안 된다.

관련된 값은 `object` 로 묶는다. `optional()` 로 기본값 있는 선택 필드를 만들 수 있다.

```terraform
variable "node_group" {
  type = object({
    instance_types = list(string)
    desired_size   = number
    min_size       = optional(number, 1)
  })
}
```

`optional(number, 1)` 은 "생략 가능하고 생략하면 1"이다. 호출자는 필수 필드만 적으면 되고 타입이 문서 역할까지 한다. 다만 **`object` 는 전부 아니면 전무**라 필드 이름이 하나만 틀려도 변수 전체가 거부되고, `optional()` 없이는 필드를 추가할 때마다 모든 호출자를 고쳐야 한다.

## 값은 어디서 들어오는가 — 여섯 개의 문

값이 들어오는 경로는 여섯 가지이고, 여러 경로가 같은 변수를 채우면 **낮은 것부터 높은 것 순서로 덮어쓴다.**

1. `default` — 아무도 값을 주지 않으면 이것.
2. **환경 변수 `TF_VAR_<이름>`** — 예: `TF_VAR_project=shop`.
3. **`terraform.tfvars`**(또는 `.json`) — 있으면 자동으로 읽는다.
4. **`*.auto.tfvars`**(또는 `.json`) — 자동으로 읽으며 여러 개면 **파일 이름 사전순**으로 적용한다.
5. **`-var-file=...`**, 6. **`-var 이름=값`** — 둘은 같은 등급이며 **명령줄에 나중에 나온 것이 이긴다.**

어디에서도 값이 오지 않고 `default` 도 없으면 **대화형 프롬프트**로 물어본다.

사람을 무는 것이 셋이다.

**`dev.tfvars` 는 자동으로 읽히지 않는다.** 자동 로드되는 이름은 정확히 `terraform.tfvars`, `terraform.tfvars.json`, 그리고 `.auto.tfvars`/`.auto.tfvars.json` 으로 **끝나는** 파일뿐이라 `dev.tfvars` 는 `-var-file` 로 명시해야 한다. "파일은 만들었는데 값이 안 먹는다"의 대부분이 이것이다.

**`TF_VAR_` 는 가장 약하다.** CI에서 `TF_VAR_environment=prod` 를 넣어 뒀는데 저장소에 커밋된 `terraform.tfvars` 에 `environment = "dev"` 가 있으면 환경 변수가 진다. 파일이 이기는 방향이다.

**대화형 프롬프트는 자동화의 적이다.** CI에서 값을 하나 빠뜨리면 Terraform은 입력을 기다리며 매달리고, 프롬프트로 받은 값은 어디에도 기록되지 않아 재현도 불가능하다. 파이프라인은 항상 `terraform plan -input=false -var-file=envs/prod.tfvars` 형태로 실행한다.

## `validation`: plan 이전에 막는다

`validation` 블록은 값이 조건을 만족하지 못하면 **plan을 시작하기도 전에** 에러로 멈춘다. `condition` 은 `true`/`false` 로 평가되는 표현식, `error_message` 는 사람이 읽을 문장이다.

```terraform
variable "environment" {
  type        = string
  description = "환경 이름. 리소스 이름과 태그에 그대로 들어간다."

  validation {
    condition     = contains(["dev", "stg", "prod"], var.environment)
    error_message = "environment는 dev, stg, prod 중 하나여야 한다. 받은 값: ${var.environment}"
  }
}
```

`contains()` 는 허용목록 검사의 기본형으로 오타(`prd`, `production`)와 값의 무단 추가를 동시에 막는다. CIDR 검증은 `can()` 과 CIDR 함수를 조합한다 — `cidrnetmask()` 는 유효한 IPv4 CIDR이 아니면 에러를 내고 `can()` 이 그것을 잡아 `false` 로 바꾼다.

```terraform
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr은 유효한 IPv4 CIDR이어야 한다 (예: 10.20.0.0/16)."
  }

  validation {
    condition     = startswith(var.vpc_cidr, "10.")
    error_message = "사내 표준상 VPC는 10.0.0.0/8 안에서 할당한다. IPAM 담당자에게 대역을 요청한다."
  }
}
```

**`validation` 블록은 여러 개를 두면 각각 독립적으로 평가된다.** 조건 셋을 `&&` 로 묶으면 어느 것이 깨졌는지 알 수 없으므로 조건 하나에 블록 하나가 원칙이다.

인스턴스 타입 허용목록은 비용 사고를 막는 가장 값싼 장치다.

```terraform
validation {
  condition     = contains(["t3.small", "t3.medium", "m6i.large", "m6i.xlarge"], var.instance_type)
  error_message = "승인된 인스턴스 타입만 허용한다. 추가가 필요하면 플랫폼팀에 요청한다."
}
```

리스트 전체를 검사할 때는 `condition = alltrue([for c in var.private_subnet_cidrs : can(cidrnetmask(c))])` 처럼 `alltrue()` 와 `for` 를 조합한다.

`error_message` 는 **무엇이 잘못됐는지가 아니라 무엇을 해야 하는지**를 적는다. 허용값 목록, 예시, 담당 창구를 적으면 그 메시지 하나로 문의가 사라진다.

Terraform 1.9부터 `condition` 에서 **다른 변수나 데이터 소스를 참조**할 수 있다. `az_count` 가 `data.aws_availability_zones.available.names` 의 길이를 넘지 않는지 같은 검사가 변수 단계에서 가능해졌다. 이전 버전은 자기 자신만 참조할 수 있었으므로 팀의 Terraform 버전 하한을 확인하고 쓴다.

## `sensitive`: 무엇을 가리고 무엇을 못 가리는가

`sensitive = true` 를 붙이면 Terraform은 그 값을 **CLI 출력에서** `(sensitive value)` 로 대체하고, 그 표시는 **전염된다.** 민감 변수로 계산한 `locals`, 그 값을 넣은 리소스 인수의 diff, 그 값을 담은 `output` 이 모두 가려진다. 민감 값을 쓰는 `output` 에 `sensitive = true` 를 붙이지 않으면 Terraform이 에러를 낸다.

가리지 못하는 것이 훨씬 중요하다.

- **state 파일과 plan 파일(`-out=tfplan`)에 평문으로 남는다.** `sensitive` 는 표시 속성이지 암호화가 아니라 `terraform state pull` 한 번이면 그대로 보인다. state를 두는 곳과 plan 아티팩트 저장소는 그 자체로 비밀 저장소 등급이어야 한다.
- **`terraform output -json` 은 값을 그대로 출력한다.** 사람이 보는 `terraform output` 은 가리지만 JSON 출력은 `"sensitive": true` 플래그와 **값을 함께** 낸다. `-raw` 도 같다. CI 로그에 `terraform output -json` 을 그대로 찍는 스크립트는 비밀을 로그에 남긴다.

같은 이유로 `aws_ssm_parameter` **데이터 소스**의 `value` 도 state에 남는다. 원문이 "SecureString의 복호화된 값은 raw state에 평문으로 저장된다"고 명시한다. 진짜 해법은 `sensitive` 가 아니라 **state에 애초에 쓰지 않는 것**이고, provider v6에는 그 목적의 ephemeral 리소스와 write-only 인수가 있다([26장](../level2-intermediate/26-secrets-and-ephemeral.md)).

`nullable` 은 성격이 다르다. 기본값은 `true` 이며 `nullable = false` 를 주면 그 변수에 `null` 을 넘길 수 없다.

```terraform
variable "kms_key_arn" {
  type    = string
  default = null    # null = "지정하지 않음". AWS 기본 키를 쓴다는 뜻으로 쓰인다
}

variable "project" {
  type     = string
  nullable = false  # 빈 값이 흘러들어와 이름이 "-vpc"가 되는 것을 막는다
}
```

`null` 은 "이 인수를 아예 지정하지 않은 것으로 취급하라"는 뜻이라 "설정하지 않으면 AWS 기본값"인 인수에 유용하다. 반대로 이름 접두어처럼 **반드시 실제 값이 있어야 하는 것**은 `nullable = false` 로 못 박는다.

## `locals`: 이름을 붙이는 곳

`locals` 는 설정 안에서 계산한 값에 이름을 붙인다. 변수와 셋이 다르다 — 밖에서 주입할 수 없고, **표현식을 쓸 수 있으며**, 레이블 없이 한 블록에 여러 이름을 정의한다.

```terraform
locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.common_tags,
  )

  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  public_subnet_cidrs  = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i)]
  private_subnet_cidrs = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 100)]
}
```

이 열몇 줄이 이 장의 요점이다. 변수는 **사람이 결정하는 값** 다섯 개만 받고 나머지는 전부 파생된다. 서브넷 CIDR을 손으로 적지 않으니 겹칠 수 없고, AZ 이름을 하드코딩하지 않으니 다른 리전에서도 돈다. `az_count` 를 2에서 3으로 바꾸면 서브넷·라우트 테이블·NAT가 함께 늘어난다.

`local` 로 뺄 기준은 하나다 — **같은 표현식이 두 번 이상 나오거나 길어서 그 자리에서 읽히지 않으면 뺀다.** 한 번만 쓰이는 짧은 값을 빼면 정의를 찾아 올라가는 비용만 생긴다.

`local.common_tags` 를 모든 리소스가 참조하면 태그 정책이 한 곳에서 바뀐다. provider의 `default_tags` 와는 층이 다르다 — 하나는 provider가 자동으로 붙이고 다른 하나는 우리가 명시적으로 붙인다([10장](10-tags-basics.md)).

## `output`: 경계 밖으로 내보내기

`output` 은 세 가지 서로 다른 일을 한다.

**루트 모듈에서는 apply 결과의 요약이다.** VPC ID, ALB DNS 이름, RDS 엔드포인트처럼 "만들고 나서 사람이 알아야 하는 값"을 넣으면 apply 직후와 이후 `terraform output` 으로 볼 수 있다.

**모듈의 공개 API다.** 부모 모듈은 자식의 리소스를 직접 참조할 수 없다 — `module.network.aws_vpc.main.id` 는 불가능하고 **자식이 `output` 으로 내보낸 것만** `module.network.vpc_id` 로 읽는다. `output` 목록이 그 모듈의 계약이고, 한번 공개한 이름을 바꾸면 모든 호출자가 깨진다. 리소스 이름은 언제든 리팩터링할 수 있지만 `output` 이름은 그렇지 않다([19장](../level2-intermediate/19-modules.md)).

**다른 state에서 읽는 창구다.** `terraform_remote_state` 데이터 소스는 다른 state의 **루트 output만** 읽으므로, 네트워크 스택과 애플리케이션 스택을 나눴다면 둘을 잇는 것이 output이다([16장](../level2-intermediate/16-remote-state-and-backends.md)).

바디에 쓸 수 있는 것은 `value`(필수), `description`, `sensitive`, `depends_on`, `ephemeral`, `precondition` 블록이다.

```terraform
output "alb_dns_name" {
  value       = aws_lb.app.dns_name
  description = "ALB의 DNS 이름. Route 53 alias 레코드의 대상으로 쓴다."

  precondition {
    condition     = length(aws_lb.app.subnets) >= 2
    error_message = "ALB는 최소 두 개의 AZ에 걸쳐야 한다. 서브넷 설정을 확인한다."
  }
}
```

`precondition` 은 **잘못된 값이 경계 밖으로 나가는 것을 막는다.** 리소스에서는 `lifecycle` 안에 넣지만 `output` 에서는 바디에 직접 쓴다.

`terraform output` 은 사람이 읽는 형식으로(민감값은 가려짐), `terraform output -raw vpc_id` 는 따옴표 없는 날 값으로, `terraform output -json` 은 전체를 기계가 읽는 형식으로 낸다. `-json` 출력은 각 항목이 `{"sensitive": false, "type": "string", "value": "vpc-0a1b2c3d4e5f67890"}` 모양이라 스크립트에서 `jq -r '.vpc_id.value'` 로 뽑는다. **`sensitive: true` 인 항목도 `value` 가 그대로 들어간다.**

## 환경별 tfvars: 어디까지 되고 어디서 무너지는가

가장 널리 쓰이는 구성은 코드를 `network/` 한 벌만 두고 값만 `network/envs/dev.tfvars`, `stg.tfvars`, `prod.tfvars` 로 나누는 것이다.

`envs/prod.tfvars` 에는 `project = "shop"`, `environment = "prod"`, `vpc_cidr = "10.20.0.0/16"`, `az_count = 3` 처럼 값만 들어간다. 코드는 하나이고 값만 다르므로 "dev에서는 되는데 prod에서는 안 된다"의 원인 범위가 좁아지고, 프로덕션 값 변경이 PR로 남는다. 한계는 셋이다.

**`.tfvars` 는 값만 바꾼다. 구조는 못 바꾼다.** dev에는 NAT gateway를 하나만 두고 prod에는 AZ마다 두고 싶다면 그것은 값이 아니라 리소스 개수의 차이다. `nat_per_az` 같은 불리언 스위치와 `count` 로 흉내낼 수 있지만 스위치가 다섯 개를 넘으면 설정은 읽을 수 없게 된다. 그 지점이 모듈로 넘어갈 때다.

**`-var-file` 을 빼먹으면 조용히 다른 값으로 돈다.** `default` 가 dev 값으로 채워져 있는데 `-var-file=envs/prod.tfvars` 를 잊으면 plan은 성공하고 프로덕션 워크스페이스에 dev 설정이 들어간다. 가장 값싼 방어는 환경을 결정하는 변수에 `default` 를 **주지 않는 것**이다.

**한 state에 여러 환경이 섞이면 tfvars로는 못 막는다.** `.tfvars` 를 바꿔도 backend가 같으면 같은 state에 쓴다. 환경 분리는 값의 문제가 아니라 **state의 문제**다([16장](../level2-intermediate/16-remote-state-and-backends.md)). 비밀이 아닌 환경 설정은 커밋해 리뷰 대상으로 만들고, 비밀은 `.tfvars` 에 넣지 않는다.

## 변수화 과잉: 모든 것을 뺄 수 있다는 함정

변수를 배운 직후 가장 흔한 실수는 **전부 변수로 빼는 것**이다. `vpc_enable_dns_support`, `vpc_instance_tenancy`, `subnet_map_public_ip`, `igw_tags` … 이런 것이 여든 개인 `variables.tf` 는 실제로 존재하며, 유연해 보이지만 아무도 못 쓴다.

**읽을 수 없다** — `main.tf` 의 모든 인수가 `var.` 로 시작하면 이 모듈이 무엇을 만드는지 알기 위해 여든 개 기본값을 확인해야 한다. **검증할 수 없다** — 조합의 수가 폭발하고, 팀이 실제로 테스트한 것은 하나뿐인데 문서상으로는 전부 지원하는 것처럼 보인다. **바꿀 수 없다** — 공개된 변수는 output과 마찬가지로 계약이다.

판단 기준은 셋이다. **환경마다 실제로 다른 값**이면 변수다(`vpc_cidr`, `environment`, `instance_type`, `az_count`). **다른 값에서 계산할 수 있으면** `local` 이다(서브넷 CIDR, 이름 접두어, 태그 병합). **팀의 표준이 하나로 정해져 있으면 하드코딩한다** — `enable_dns_hostnames = true` 를 변수로 뺄 이유가 없고, 정말 false가 필요한 날이 오면 그때 바꾸면 된다. **`variables.tf` 가 한 화면을 크게 넘으면** 대개 모듈을 둘로 쪼개야 한다는 신호다.

## 흔한 실수

### ❌ `dev.tfvars` 를 만들어 두고 자동으로 읽힐 것이라 기대한다

자동 로드 대상이 아니므로 `terraform plan` 은 `dev.tfvars` 를 무시하고 `default` 로 계획을 세운다. 에러는 나지 않는다.

```terraform
# ✅ -var-file=envs/dev.tfvars로 명시하고, 빼먹으면 실패하도록 default를 없앤다
variable "environment" {
  type        = string
  description = "dev | stg | prod. -var-file로 반드시 지정한다."
  # default 없음 — 빼먹으면 -input=false에서 에러로 멈춘다
}
```

### ❌ `sensitive = true` 를 붙였으니 안전하다고 믿는다

```terraform
variable "db_password" {
  type      = string
  sensitive = true
}

resource "aws_db_instance" "main" {
  password = var.db_password
  # ... 나머지 설정 ...
}
```

plan 출력에서는 가려지지만 **state에는 평문이다.** state가 로컬 파일이고 저장소에 커밋된다면 그것으로 끝이다.

```terraform
# ✅ 값을 state에 남기지 않는다 — write-only 인수로 넘기는 방법은 26장에서 다룬다
ephemeral "aws_secretsmanager_secret_version" "db" {
  secret_id = data.aws_secretsmanager_secret.db.id
}
```

### ❌ 검증 조건 여러 개를 `&&` 로 한 블록에 묶는다

```terraform
validation {
  condition     = can(cidrnetmask(var.vpc_cidr)) && tonumber(split("/", var.vpc_cidr)[1]) <= 20
  error_message = "잘못된 vpc_cidr입니다."
}
```

어느 조건이 깨졌는지 알 수 없고 메시지가 아무것도 알려주지 않는다. 게다가 값이 CIDR이 아니면 `split()` 이 먼저 터져 검증 자체가 다른 에러로 죽는다.

```terraform
# ✅ 조건 하나에 블록 하나. 형식 검사가 통과했을 때만 값을 뜯는다
validation {
  condition     = can(cidrnetmask(var.vpc_cidr))
  error_message = "vpc_cidr은 유효한 IPv4 CIDR이어야 한다 (예: 10.20.0.0/16)."
}

validation {
  condition     = can(cidrnetmask(var.vpc_cidr)) ? tonumber(split("/", var.vpc_cidr)[1]) <= 20 : true
  error_message = "VPC CIDR 프리픽스는 /20 이하여야 한다."
}
```

### ❌ 모듈의 output을 리소스 이름 그대로 노출한다

```terraform
output "aws_vpc_main_id"         { value = aws_vpc.main.id }
output "aws_subnet_private_0_id" { value = aws_subnet.private[0].id }
```

내부 구현(리소스 타입, 로컬 이름, 인덱스)이 계약에 새어 나왔다. `count` 를 `for_each` 로 리팩터링하는 순간 호출자가 전부 깨진다.

```terraform
# ✅ 의미 단위로 묶어 내보낸다. 내부 구조가 바뀌어도 계약은 그대로다
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID."
}

output "private_subnet_ids" {
  value       = [for s in aws_subnet.private : s.id]
  description = "프라이빗 서브넷 ID 목록. AZ 순서와 대응한다."
}
```

## 프로덕션 노트

- **CI에는 `-input=false` 를 항상 붙인다.** 변수를 빠뜨렸을 때 프롬프트에서 매달리는 대신 즉시 실패한다. 함께 `-lock-timeout` 도 설정하면 state 락 경합이 무한 대기로 바뀌지 않는다.

- **비밀은 `.tfvars` 가 아니라 환경 변수나 ephemeral로 넣는다.** `TF_VAR_db_password` 는 CI 시크릿에서 주입되므로 저장소에 남지 않는다. 다만 `TF_VAR_` 는 우선순위가 가장 낮아 같은 이름이 `terraform.tfvars` 에 있으면 무시되므로 "비밀 변수는 어떤 tfvars 파일에도 이름조차 등장하지 않는다"를 팀 규칙으로 정한다. 반대로 `.gitignore` 에 `*.tfvars` 를 통째로 넣으면 환경 설정까지 사라져 "그 사람 노트북에만 있는 prod 설정"이 생긴다 — 비밀이 든 파일만 이름으로 제외한다.

- **`validation` 은 가장 값싼 가드레일이다.** 정책 엔진을 도입하기 전에 인스턴스 타입 허용목록·CIDR 대역·환경 이름·태그 필수 키를 `validation` 으로 막는 것만으로 사고의 상당수가 사라진다. 정책 엔진은 "여러 팀·여러 저장소에 같은 규칙을 강제"할 때 필요해진다.

- **`terraform output -json` 은 스택 간 통합 지점이다.** 다음 파이프라인 단계에 값을 넘길 때는 output을 JSON으로 뽑는 것이 `terraform state show` 파싱보다 안정적이다 — state 내부 구조는 바뀌지만 output 이름은 우리가 통제하는 계약이다. 대신 output 이름 변경은 파괴적 변경으로 취급하고, 민감값은 `-raw` 로 하나씩 뽑아 CI 마스킹에 등록한다. `nonsensitive()` 는 코드 리뷰 확인 목록에 넣어 둔다.

- **변수 개수는 모듈 설계의 온도계다.** 새 요구가 올 때마다 `variable` 이 하나씩 늘어난다면 모듈이 두 가지 이상의 일을 하고 있을 가능성이 높다. 변수 스무 개짜리 모듈 하나보다 여섯 개짜리 모듈 셋이 테스트하기도 버리기도 쉽다.

## 연습문제

**1. 우선순위를 실험으로 확인하기**
`environment` 변수 하나와 `output "env" { value = var.environment }` 만 있는 설정에서, `default`, `TF_VAR_environment`, `terraform.tfvars`, `zz.auto.tfvars`, `aa.auto.tfvars`, `-var-file`, `-var` 를 하나씩 추가해 가며 `terraform plan` 을 반복한다.
*성공 기준:* 일곱 가지를 모두 넣은 상태의 최종 값을 미리 맞히고, `aa.auto.tfvars` 와 `zz.auto.tfvars` 중 어느 쪽이 이기는지 확인해 우선순위 표로 정리한다.

**2. 잘못된 값을 plan에서 막기**
`project`, `environment`, `vpc_cidr`, `az_count`, `instance_type` 다섯 변수에 대해 다음을 각각 **독립된** `validation` 블록으로 막는다 — 소문자·하이픈이 아닌 `project`, 허용목록 밖의 `environment`, 유효하지 않거나 `/20` 보다 큰 `vpc_cidr`, 1 미만이거나 4를 넘는 `az_count`, 허용목록 밖의 `instance_type`.
*성공 기준:* 다섯 위반을 하나씩 담은 `.tfvars` 로 실행할 때마다 **해당 위반만** 지목하는 에러가 나오고 메시지가 "무엇을 해야 하는지"를 담고 있다. 두 가지를 동시에 위반하면 두 에러가 함께 나오는지도 확인한다.

**3. 변수 다섯 개로 도는 네트워크 만들기**
`project`, `environment`, `vpc_cidr`, `az_count`, `common_tags` 다섯 개만 받아 VPC, 퍼블릭/프라이빗 서브넷, IGW를 만든다. 서브넷 CIDR과 AZ 이름은 하드코딩하지 않고 `locals` 에서 `cidrsubnet()`, `slice()`, `data.aws_availability_zones` 로 계산한다.
*성공 기준:* `az_count` 를 2에서 3으로 바꾼 plan이 서브넷·라우트 테이블 연결을 정확히 필요한 만큼만 추가하고 기존 리소스를 교체하지 않는다. `terraform console` 로 `local.public_subnet_cidrs` 를 출력해 겹치는 대역이 없음을 보인다.

**4. sensitive의 한계를 눈으로 확인하기**
`sensitive = true` 변수로 `aws_ssm_parameter` 를 `SecureString` 으로 만든 뒤 `terraform plan` 출력, `terraform show`, `terraform state pull`, `terraform output`, `terraform output -json` 다섯 곳에서 값이 보이는지 확인한다.
*성공 기준:* 어디에서 가려지고 어디에서 평문으로 보이는지 표로 정리하고, 팀 저장소에서 안전하게 쓰려면 바꿔야 할 것 세 가지를 적는다.

## 요약

- `variable` 바디에 쓸 수 있는 것은 `type`, `default`, `description`, `sensitive`, `nullable`, `ephemeral`, `validation` 뿐이고 `default` 에는 어떤 참조도 쓸 수 없다. `type` 을 생략하면 `any` 라 아무것도 검사하지 않으므로 항상 쓴다 — 순서가 의미를 갖는 값은 `list`, 관련된 값 묶음은 `object` + `optional()` 이다. `nullable` 기본값은 `true` 이고, 반드시 실제 값이 있어야 하는 변수는 `nullable = false` 로 못 박는다.
- 값 주입 우선순위는 낮은 쪽부터 `default` → `TF_VAR_*` → `terraform.tfvars` → `*.auto.tfvars`(사전순) → `-var-file`/`-var`(명령줄 순서)다. `dev.tfvars` 는 자동으로 읽히지 않는다. 값도 `default` 도 없으면 대화형 프롬프트가 뜨므로 CI에는 `-input=false` 를 붙인다.
- `validation` 은 `condition` 과 `error_message` 로 이루어지고 plan 시작 전에 평가된다. 조건 하나에 블록 하나가 원칙이며 `contains()`, `can(cidrnetmask(...))`, `alltrue([for ...])` 가 주력이다. Terraform 1.9부터는 조건에서 다른 변수·데이터 소스를 참조할 수 있다.
- `sensitive = true` 는 CLI 출력만 가리고 파생값으로 전염된다. **state 파일과 plan 파일에는 평문으로 남고** `terraform output -json` 과 `-raw` 는 값을 그대로 낸다. `aws_ssm_parameter` 데이터 소스도 마찬가지이며 근본 해법은 ephemeral 리소스와 write-only 인수다.
- `locals` 는 밖에서 주입할 수 없고 표현식을 쓸 수 있다. 같은 표현식이 두 번 이상 나오거나 길어서 그 자리에서 읽히지 않으면 뺀다 — 이름 접두어, 태그 병합, `cidrsubnet()` 기반 서브넷 계산이 대표적이다.
- `output` 은 apply 결과 요약이자 모듈의 공개 API이자 다른 state가 읽는 창구다. 부모는 자식의 output만 볼 수 있으므로 output 이름은 계약이고, 리소스 이름과 인덱스를 그대로 노출하면 리팩터링이 막힌다. `precondition` 이 잘못된 값의 유출을 막는다.
- 환경별 `.tfvars` 는 값의 차이만 표현한다. 구조가 환경마다 달라지면 모듈로 넘어가고, 환경 분리 자체는 state의 문제다. 변수는 "환경마다 실제로 다른 값"만 받고 계산 가능한 것은 `local`, 팀 표준이 하나인 것은 하드코딩한다.

## 다음으로

- [8장 — 데이터 소스](08-data-sources.md) — 내가 만들지 않은 값을 읽어 변수 자리를 대신하기.
- [10장 — 태그 기초](10-tags-basics.md) — `local.common_tags` 와 `default_tags` 의 층위, `tags_all`.
- [19장 — 모듈](../level2-intermediate/19-modules.md) — `variable` 과 `output` 이 모듈의 입출력 계약이 되는 지점.
- [26장 — 시크릿: ephemeral과 write-only 인수](../level2-intermediate/26-secrets-and-ephemeral.md) — `sensitive` 로 못 막는 것을 막는 법.
- Terraform 문서: <https://developer.hashicorp.com/terraform/language/values>
