---
chapter: 19
level: "Level 2 — 중급"
title: "모듈: 재사용 단위를 설계한다"
difficulty: 중급
reading_time: "34분"
prerequisites: [7, 17]
source_docs:
  - "website/docs/guides/enhanced-region-support.html.markdown"
  - "website/docs/r/vpc.html.markdown"
  - "website/docs/r/subnet.html.markdown"
  - "website/docs/r/nat_gateway.html.markdown"
  - "website/docs/r/route_table.html.markdown"
  - "website/docs/r/ecs_service.html.markdown"
  - "website/docs/r/lb_target_group.html.markdown"
  - "website/docs/index.html.markdown"
source_url: "https://developer.hashicorp.com/terraform/language/modules"
provider_baseline: "6.x"
---

# 19장 — 모듈: 재사용 단위를 설계한다

**이 장에서 배우는 것**

- 디렉터리 하나가 곧 모듈이고 루트도 모듈이라는 사실에서 출발해, `module` 블록의 `source`·`version`·`providers`·`count`/`for_each`/`depends_on` 를 정확히 쓸 수 있다.
- 로컬 경로·Registry·Git·S3 소스의 차이와 `terraform get`·`.terraform/modules/` 가 하는 일을 설명할 수 있다.
- 입력 변수를 몇 개까지 열고 출력에 무엇을 담을지, 내부 리소스를 노출하지 않는 인터페이스를 설계할 수 있다.
- 모듈 안에서 `provider` 블록을 선언하면 안 되는 이유를 알고 `providers = { aws = aws.usw2 }` 로 전달할 수 있다.
- 공개 모듈을 쓸 때와 직접 짤 때의 판단 기준, 버저닝과 저장소 구조를 결정할 수 있다.
- 재사용 가능한 `vpc` 모듈과 `app-service` 모듈을 직접 설계하고, `moved` 로 안전하게 리팩터링할 수 있다.

**왜 중요한가**

모듈 없이 3개 환경을 운영하면 같은 코드가 세 벌 생긴다. dev에서 서브넷 하나를 늘리고 stg에는 반영하고 prod에는 잊는다. 6개월 뒤 prod 장애 대응 중에 "dev와 prod의 라우팅이 다르다"는 사실을 처음 알게 된다.

반대 방향의 실패도 흔하다. 어느 팀이 "모든 것을 하는" 모듈을 만들었다. 입력 변수가 87개였고 절반은 `null` 기본값에 `count = var.x != null ? 1 : 0` 이 붙어 있었다. 모듈 하나를 고치면 그것을 쓰는 14개 스택이 전부 영향을 받았고, 결국 아무도 수정하지 못해 팀마다 포크를 떴다.

모듈은 코드를 줄이는 도구가 아니라 **경계를 정하는 도구**이고, 세 번째 실패는 그 경계에서 나온다. 모듈 안에 `provider "aws" { region = var.region }` 을 넣어 두면 처음에는 동작한다. 그러다 그 모듈에 `for_each` 를 붙이려는 순간 `Module is incompatible with count, for_each, and depends_on` 로 막히고, 모듈을 지우려 하면 provider 설정이 사라져 destroy가 불가능해진다. 이미 40개 리소스가 그 안에 있는 상태에서 알게 된다.

## 모듈은 디렉터리다

Terraform에서 모듈의 정의는 단순하다. **`.tf` 파일이 있는 디렉터리 하나가 모듈이다.** 특별한 선언도 매니페스트도 없다. `terraform apply` 를 실행한 디렉터리가 **루트 모듈(root module)** 이고, 루트가 `module` 블록으로 부르는 것이 **자식 모듈(child module)** 이다. 즉 1장부터 써 온 모든 설정은 이미 모듈이었다.

이 정의에서 몇 가지가 따라온다.

- 파일 이름을 강제하지 않는다. `main.tf`/`variables.tf`/`outputs.tf` 는 관습일 뿐이고 Terraform은 디렉터리 안의 `.tf` 를 전부 읽어 합친다. 관습을 따르는 이유는 "이 모듈이 무엇을 받고 무엇을 내보내는가"를 두 파일만 열어 보고 알 수 있기 때문이다.
- 하위 디렉터리는 자동으로 포함되지 않는다. `modules/vpc/` 를 만들어 두는 것만으로는 아무 일도 일어나지 않고 `module` 블록으로 불러야 한다.
- 모듈에는 자체 state가 없다. 자식의 리소스는 루트 state에 `module.vpc.aws_vpc.this` 주소로 들어간다. **모듈은 state를 나누지 않고 주소에 접두어를 붙일 뿐이다.** 진짜로 나누려면 별도 루트와 별도 backend가 필요하다([16장](16-remote-state-and-backends.md)).

state 주소는 `module.vpc.aws_subnet.public["ap-northeast-2a"]`, `module.app["api"].aws_ecs_service.this` 같은 형태가 된다.

## `module` 블록

```terraform
module "vpc" {
  source     = "./modules/vpc"
  name       = "shop-prod"
  cidr_block = "10.0.0.0/16"
  azs        = ["ap-northeast-2a", "ap-northeast-2c"]
  tags       = local.common_tags
}
```

블록 레이블(`"vpc"`)이 모듈 인스턴스의 이름이고, state 주소(`module.vpc.*`)와 참조(`module.vpc.vpc_id`)에 쓰인다. `source` 를 뺀 나머지 인수는 전부 **자식 모듈의 `variable` 에 대응**한다. 자식에 없는 변수를 넘기면 `An argument named "x" is not expected here` 로 실패한다.

메타 인수는 넷이다.

- **`source`**(필수) — 어디서 가져올지.
- **`version`** — Registry 소스에서만 동작한다. Git·로컬 경로에는 쓸 수 없다.
- **`providers`** — 부모의 provider 설정을 자식의 이름에 매핑한다.
- **`count` / `for_each` / `depends_on`** — 리소스와 같은 의미다. `for_each` 를 쓰면 주소가 `module.app["api"]` 가 되고 모듈 안의 모든 리소스가 그 아래로 들어간다.

모듈에 `for_each` 를 붙이면 [17장](17-count-foreach-dynamic.md)의 규칙이 그대로 적용된다. 키가 곧 주소이므로 키를 바꾸면 그 모듈 안의 리소스 전부가 파괴 후 재생성된다 — 리소스 하나가 아니라 스무 개를 한꺼번에 날리므로 `moved` 없이 하지 않는다([22장](22-moved-removed-refactoring.md)).

`depends_on` 은 모듈 전체를 다른 것 뒤로 미룬다. 참조로 표현할 수 있는 의존은 참조로 두고([6장](../level1-beginner/06-references-and-dependencies.md)), `depends_on` 은 참조로 드러나지 않는 순서에만 쓴다.

## `source`: 어디서 가져오는가

`source` 문자열의 앞부분이 소스 타입을 결정한다.

```terraform
# 로컬 경로 — 반드시 ./ 또는 ../ 로 시작해야 한다
source = "./modules/vpc"

# Terraform Registry — <NAMESPACE>/<NAME>/<PROVIDER>
source  = "terraform-aws-modules/vpc/aws"
version = "~> 5.0"

# Git — // 뒤는 저장소 안의 서브디렉터리, ref 는 태그/브랜치/커밋
source = "git::https://github.com/example/tf-modules.git//vpc?ref=v1.4.0"
source = "github.com/example/tf-modules//vpc?ref=v1.4.0"

# S3 — 압축된 모듈 아카이브
source = "s3::https://s3.ap-northeast-2.amazonaws.com/tf-modules/vpc-v1.4.0.zip"
```

기억할 규칙은 둘이다. **`//` 는 저장소 루트와 모듈 디렉터리를 가르는 구분자다** — 슬래시 하나면 경로의 일부로 해석되어 "모듈을 찾을 수 없다"가 된다. **`version` 은 Registry 전용**이고 Git 소스의 고정은 `?ref=` 로 한다. `ref=main` 은 고정이 아니므로 태그나 커밋 SHA를 쓴다 — 브랜치를 가리키면 캐시가 갱신되는 시점에 코드가 바뀌어 "아무것도 안 고쳤는데 plan이 달라졌다"가 된다.

### 로컬 모듈과 원격 모듈의 차이

`terraform init`(내부적으로 `terraform get`)은 원격 모듈을 `.terraform/modules/` 로 내려받고 매핑을 `modules.json` 에 기록한다.

**로컬 경로 모듈은 내려받지 않는다.** 원본 디렉터리를 그대로 참조하므로 파일을 고치면 다음 `plan` 에 즉시 반영된다. 반대로 원격 모듈은 **한 번 내려받으면 캐시를 쓴다.** 같은 `?ref=` 를 유지한 채 저장소 코드만 바꾸면 반영되지 않고 `terraform init -upgrade` 를 해야 한다.

그래서 개발 중인 모듈은 로컬 경로로 붙여 빠르게 반복하고, 안정되면 태그를 찍고 Git/Registry 소스로 바꾼다.

## 인터페이스 설계: 무엇을 열고 무엇을 감출 것인가

모듈의 품질은 안쪽 코드가 아니라 **경계**로 결정된다.

### 입력 변수 — 적을수록 좋다

변수를 열 때마다 "이 값을 호출자가 정하는 것이 맞는가"를 묻는다. **환경마다 다를 수밖에 없는 값**(이름, CIDR, AZ, 인스턴스 크기, 태그)은 열고, **조직 표준으로 강제해야 하는 값**(로그 보존 기간, 암호화, 퍼블릭 접근 차단)은 닫는다 — 변수로 열면 언젠가 누군가 끈다. **모듈이 계산할 수 있는 값**도 닫는다. 서브넷 CIDR 24개를 받는 대신 VPC CIDR 하나를 받고 `cidrsubnet` 으로 계산한다([18장](18-expressions-and-functions.md)).

변수는 타입을 명시하고 `object` + `optional` 로 묶어 개수를 줄인다.

```terraform
variable "nat" {
  description = "NAT 게이트웨이 설정. single=true면 AZ 하나에만 둔다."
  type = object({
    enabled = optional(bool, true)
    single  = optional(bool, false)
  })
  default = {}
}
```

`description` 은 Registry에 올리면 그대로 문서가 된다.

### 출력 — ID와 ARN을 담고 객체를 담지 않는다

출력에 **리소스 객체 전체를 담지 않는다.**

```terraform
output "vpc" { value = aws_vpc.this }   # 나쁨: 내부 구현이 그대로 공개 API가 된다

# 좋음: 소비자가 실제로 쓰는 것만
output "vpc_id"            { value = aws_vpc.this.id }
output "public_subnet_ids" { value = { for k, s in aws_subnet.public : k => s.id } }
```

리소스 객체를 통째로 내보내면 소비자가 `module.vpc.vpc.enable_dns_hostnames` 같은 속성에 의존하기 시작하고, 그 순간 모듈 안의 리소스 타입을 바꿀 수 없게 된다. 서브넷 ID는 **리스트가 아니라 map으로** 내보낸다 — 리스트는 소비자가 인덱스로 접근하게 만들고, 그 인덱스는 AZ 목록이 바뀌면 다른 서브넷을 가리킨다.

민감한 값에는 `sensitive = true` 를 붙이지만, plan에서 가려질 뿐 **state에는 그대로 저장된다**([26장](26-secrets-and-ephemeral.md)).

모듈의 공개 API는 `variable` 과 `output` 뿐이다. 호출자는 `module.vpc.aws_vpc.this.id` 처럼 내부 리소스를 직접 참조할 수 없는데, 이것은 제약이 아니라 설계다.

## 모듈 안에서 provider를 선언하지 않는다

문법적으로는 자식 모듈 안에 `provider "aws" { ... }` 를 쓸 수 있다. 오래된 모듈에 남아 있는 이 패턴은 **쓰지 않는다.** 이유는 두 가지다.

첫째, **`count`/`for_each`/`depends_on` 을 붙일 수 없다.** provider 설정이 인스턴스마다 달라질 수 없기 때문에 Terraform이 거부한다. 둘째, **모듈을 제거할 수 없게 된다.** destroy에도 provider 설정이 필요한데 모듈 블록을 지우면 그 안의 provider도 사라져 "state에는 있는데 지울 방법이 없는 리소스"가 남는다. 빠져나오려면 모듈 블록을 되살리고 리소스를 먼저 비운 뒤 모듈을 지우는 2단계를 거쳐야 한다.

올바른 방법은 **부모가 provider를 정의하고 자식에게 전달**하는 것이다. 자식은 `required_providers` 에서 이름만 선언하고 설정은 하지 않는다.

```terraform
provider "aws" { region = "ap-northeast-2" }

provider "aws" {
  alias  = "usw2"
  region = "us-west-2"
}

# providers 를 생략하면 기본 aws 설정을 상속한다
module "vpc_oregon" {
  source    = "./modules/vpc"
  providers = { aws = aws.usw2 }   # 자식의 aws 를 부모의 aws.usw2 로 채운다
  name      = "oregon"
}
```

자식은 `versions.tf` 에서 `required_providers { aws = { source = "hashicorp/aws", version = ">= 6.0.0" } }` 로 **요구 사항만** 선언하고 `provider` 블록은 두지 않는다. 자식의 `version` 제약은 상한을 두지 말고(`>= 6.0.0`) 열어 두는 것이 관례다 — 상한은 루트가 정한다.

자식이 여러 provider 설정을 필요로 하면 `required_providers` 안에 `configuration_aliases = [aws.primary, aws.replica]` 를 선언하고 부모가 `providers` 로 전부 채운다. 채우지 않으면 `init` 에서 실패하므로 누락이 조용히 지나가지 않는다.

v6부터는 이 필요가 크게 줄었다. 대부분의 리소스에 top-level `region` 인수가 생겨 다른 리전에 리소스를 만들려고 alias를 팔 이유가 없어졌다. 모듈이 `region` 변수를 받아 리소스에 그대로 넘기면(`region = var.region`, null이면 provider 설정 리전) alias 전달 없이 멀티 리전 모듈이 된다.

주의할 점은 v6 문서가 명시하는 둘이다. **`region` 값을 바꾸면 리소스가 교체(force replacement)** 되고, **`region` 을 지우면 교체되지 않고 state의 이전 값을 쓴다.** provider 블록 방식도 v6에서 유효하며 deprecated가 아니다([24장](24-enhanced-region-support.md)).

## 버저닝과 저장소 구조

모듈이 두 곳 이상에서 쓰이는 순간 버전이 필요해진다. Registry는 `version = "~> 5.0"`, Git은 `?ref=v1.4.0` 이다. `~> 5.0` 은 `>= 5.0.0, < 6.0.0` 이고 `~> 5.1.2` 는 `>= 5.1.2, < 5.2.0` 이다 — 자릿수에 따라 의미가 달라지는 것이 함정이라 **메이저만 고정하려면 `~> 5.0`** 을 쓴다. 모듈은 provider와 달리 lock 파일에 기록되지 않으므로(`.terraform.lock.hcl` 은 provider 전용) 범위를 열어 두면 CI가 새로 `init` 할 때 다른 버전을 받는다. 프로덕션 스택은 **정확한 버전**으로 고정하고 의도적으로 올리는 편이 안전하다.

저장소 구조는 두 갈래다.

**모노레포**(`tf-modules/` 하나에 `vpc/`, `app-service/`, `rds/`)는 리뷰와 교차 변경이 쉽고 태그 하나로 전부 버전이 매겨지지만, `vpc` 만 고쳤는데 `rds` 를 쓰는 팀도 버전을 올려야 한다. **모듈별 저장소**는 버전이 독립적이고 소유권이 분명한 대신 CI와 릴리스가 저장소 수만큼 늘어난다. 모노레포로 시작해 별도 수명주기가 필요한 모듈만 분리하는 순서가 무난하고, 어느 쪽이든 **`?ref=` 없는 소스를 프로덕션에 두지 않는 것**이 최소 규칙이다.

## 공개 모듈을 쓸 것인가

`terraform-aws-modules/vpc/aws` 같은 공개 모듈은 수천 개 조직이 밟은 지뢰가 이미 제거되어 있어, 직접 짜면 사흘 걸릴 VPC를 스무 줄로 끝낸다. 대신 비용이 있다.

- **블랙박스 비용.** 리소스 60개가 무엇인지 모른 채 운영하게 된다. 장애 대응 중에 모듈 소스를 처음 읽는 상황이 온다.
- **인터페이스 비용.** 모든 사용자를 만족시켜야 해서 변수가 수백 개다. 우리에게 필요한 여덟 개 외에 나머지 기본값이 표준과 맞는지 검증해야 한다.
- **업그레이드 비용.** 메이저 버전이 오르면 주소가 바뀌어 대규모 `moved` 작업이 우리 일정과 무관하게 발생한다.

판단 기준은 이렇다. **표준화가 잘 되어 있고 조직 고유 요구가 적은 영역**(VPC, EKS, ALB의 기본형)은 공개 모듈이 유리하고, **조직 정책이 강하게 개입하는 영역**(태깅 규칙, 보안 그룹, IAM 경계, 로깅 표준)은 직접 짜는 편이 낫다. 절충안으로 공개 모듈을 **감싸는 얇은 래퍼 모듈**을 만들어 조직 표준을 기본값으로 굳히고 노출 변수를 여덟 개로 줄이는 방식이 널리 쓰인다. 어느 쪽이든 버전을 고정하고 `.terraform/modules/` 에 내려온 코드를 한 번은 읽는다.

## 실전 1: 재사용 가능한 `vpc` 모듈

좋은 모듈의 특징을 코드로 확인한다 — **단일 책임, 이름 접두어, 태그 주입, 조건부 생성.**

입력은 여섯 개다 — `name`(string), `cidr_block`(string), `azs`(list(string)), `region`(string, 기본 null), `tags`(map(string), 기본 `{}`), 그리고 앞에서 본 `nat` object.

```terraform
# modules/vpc/main.tf
locals {
  tags     = merge(var.tags, { Module = "vpc" })
  az_index = { for i, az in var.azs : az => i }

  public  = { for az, i in local.az_index : az => cidrsubnet(var.cidr_block, 8, i) }
  private = { for az, i in local.az_index : az => cidrsubnet(var.cidr_block, 8, i + 64) }

  # single=true면 첫 AZ에만 NAT를 둔다
  nat_azs = var.nat.enabled ? (var.nat.single ? slice(var.azs, 0, 1) : var.azs) : []
}

resource "aws_vpc" "this" {
  region               = var.region
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(local.tags, { Name = var.name })
}

resource "aws_subnet" "public" {
  for_each = local.public

  region                  = var.region
  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value
  availability_zone       = each.key
  map_public_ip_on_launch = true

  tags = merge(local.tags, { Name = "${var.name}-public-${each.key}", Tier = "public" })
}
# aws_subnet.private 도 같은 형태로 local.private 를 for_each 한다

resource "aws_nat_gateway" "this" {
  for_each = toset(local.nat_azs)

  region        = var.region
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  tags       = merge(local.tags, { Name = "${var.name}-${each.key}" })
  depends_on = [aws_internet_gateway.this]
}

# ... aws_internet_gateway, aws_eip, aws_route_table, aws_route_table_association 생략 ...
```

여기서 설계 결정 넷을 짚는다.

**단일 책임** — 이 모듈은 네트워크만 만든다. RDS나 EKS를 함께 만들면 "VPC만 필요한데 RDS 변수를 채워야 하는" 상황이 생기고 변수 87개짜리 모듈이 태어난다. **이름 접두어** — 모든 `Name` 태그가 `var.name` 으로 시작하므로 여러 환경이 한 계정에 있어도 콘솔에서 구분된다.

**태그 주입** — `var.tags` 를 `merge` 한다. provider의 `default_tags` 가 있어도([10장](../level1-beginner/10-tags-basics.md)) 스택별 태그는 따로 필요하다. **조건부 생성** — `nat.enabled`/`nat.single` 을 `for_each` 대상 집합의 크기로 번역했다. `count = var.x ? 1 : 0` 을 리소스마다 흩뿌리는 대신 `local.nat_azs` 한 곳에서 정책이 결정되므로 "dev는 NAT 하나, prod는 AZ마다 하나"가 한 줄로 읽힌다.

출력은 `vpc_id`, `vpc_cidr_block`, `public_subnet_ids`, `private_subnet_ids`, `nat_gateway_ids` 다섯이면 충분하다. 라우트 테이블 ID나 EIP는 소비자가 쓸 일이 없으므로 내보내지 않는다.

## 실전 2: `app-service` 모듈과 모듈 `for_each`

두 번째 모듈은 첫 번째의 출력을 입력으로 받는다. **모듈 사이의 결합은 ID 문자열로만** 이루어지고, 서로의 리소스를 알지 못한다.

입력은 여덟 개다 — `name`, `cluster_arn`, `vpc_id`, `subnet_ids`, `image`, `container_port`(기본 8080), `desired_count`(기본 2), `tags`. VPC ID와 서브넷 ID를 받을 뿐 VPC 모듈을 알지 못한다.

```terraform
# modules/app-service/main.tf
# aws_lb_target_group.this: target_type = "ip", port = var.container_port,
#   vpc_id = var.vpc_id, name_prefix + create_before_destroy

resource "aws_ecs_service" "this" {
  name            = var.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [aws_security_group.this.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = var.name
    container_port   = var.container_port
  }
}
# ... aws_ecs_task_definition, aws_security_group 생략 ...
```

`aws_lb_target_group` 의 `name` 은 ForceNew이고 리전·계정 안에서 유일해야 한다. 교체할 때 이름이 겹치므로 `name_prefix`(최대 6자)와 `create_before_destroy` 를 함께 쓰는 것이 정석이다([21장](21-lifecycle-meta-arguments.md)).

루트에서 둘을 연결한다.

```terraform
module "vpc" {
  source = "./modules/vpc"
  name   = "${var.project}-${var.environment}"
  nat    = { single = var.environment != "prod" }  # prod만 AZ별 NAT
  # ... cidr_block, azs, tags ...
}

module "app" {
  source   = "./modules/app-service"
  for_each = var.services

  name          = "${var.project}-${each.key}"
  cluster_arn   = aws_ecs_cluster.this.arn
  vpc_id        = module.vpc.vpc_id
  subnet_ids    = values(module.vpc.private_subnet_ids)
  image         = each.value.image
  desired_count = each.value.desired_count
  tags          = local.common_tags
}
```

`module.vpc.private_subnet_ids` 는 map이므로 리스트가 필요한 곳에서 `values()` 로 변환한다. map의 순회 순서는 키의 사전순이라 매 plan마다 흔들리지 않는다([18장](18-expressions-and-functions.md)).

## 예제 디렉터리와 `terraform test`

모듈 저장소의 관습적 구조는 이렇다.

`main.tf`/`variables.tf`/`outputs.tf`/`versions.tf`/`README.md` 옆에 `examples/minimal/`(필수 변수만), `examples/complete/`(모든 기능), `tests/*.tftest.hcl` 을 둔다.

`examples/` 는 문서이면서 검증 수단이다. CI에서 각 예제 디렉터리에 `terraform init && validate && plan` 을 돌리면 "호출자 관점에서 깨졌는지"를 apply 없이 잡는다.

`terraform test` 는 `.tftest.hcl` 의 `run` 블록을 순서대로 실행하며 `command = plan` 이면 리소스를 만들지 않고 계획만 검증한다.

```hcl
# tests/defaults.tftest.hcl
variables {
  name       = "test"
  cidr_block = "10.0.0.0/16"
  azs        = ["ap-northeast-2a", "ap-northeast-2c"]
}

run "single_nat_creates_one" {
  command   = plan
  variables { nat = { single = true } }

  assert {
    condition     = length(aws_nat_gateway.this) == 1
    error_message = "single=true면 NAT는 하나여야 한다"
  }
}
```


파일 상단의 `variables` 는 전체 기본값이고 `run` 안의 것이 덮어쓴다. `command = apply` 로 실제 리소스를 만들어 검증할 수도 있고 끝나면 Terraform이 정리하지만, 비용과 시간이 들므로 대부분은 `plan` 으로 둔다.

## 모듈 리팩터링과 `moved`

모듈 경계를 바꾸는 것은 **리소스 주소를 바꾸는 것**이다. 인라인 리소스를 모듈로 옮기면 주소에 `module.` 접두어가 붙고, Terraform은 이것을 "파괴 후 생성"으로 읽는다.

```terraform
# 인라인 -> 모듈
moved {
  from = aws_vpc.main
  to   = module.vpc.aws_vpc.this
}

# 모듈 이름 변경 (안의 리소스가 40개여도 이 블록 하나면 된다)
moved {
  from = module.network
  to   = module.vpc
}
```

규칙은 하나다. **plan이 `0 to add, 0 to destroy` 를 보일 때까지 apply하지 않는다**([22장](22-moved-removed-refactoring.md)).

원격 모듈의 메이저 업그레이드에서 주소가 바뀌면 제작자가 `moved` 블록을 모듈 안에 포함하는 것이 관례다. 업그레이드 후 plan에 예상치 못한 destroy가 보이면 upgrade guide를 먼저 찾는다.

## 흔한 실수

### ❌ 모듈 안에 `provider` 블록을 둔다

`for_each` 를 붙일 수 없고, 모듈을 지우면 destroy가 불가능해진다.

```terraform
provider "aws" { region = var.region }   # ❌ 자식 모듈 안

# ✅ 부모가 정의하고 전달한다. v6에서는 region 인수로 대체할 수도 있다
module "vpc" {
  source    = "./modules/vpc"
  providers = { aws = aws.usw2 }
}
```

### ❌ Git 소스를 브랜치에 고정한다

`ref=main` 은 고정이 아니다. 코드를 한 줄도 안 고쳤는데 어느 날 plan이 달라진다.

```terraform
# ❌ 재현 불가능
source = "git::https://github.com/example/tf-modules.git//vpc?ref=main"

# ✅ 태그나 커밋 SHA로 고정한다
source = "git::https://github.com/example/tf-modules.git//vpc?ref=v1.4.0"
```

### ❌ 서브넷 ID를 리스트로 내보낸다

소비자가 `[0]`, `[1]` 로 접근하게 되고 AZ 목록이 바뀌면 조용히 다른 서브넷을 가리킨다.

```terraform
# ❌ 순서에 의존하는 출력
output "private_subnet_ids" { value = values(aws_subnet.private)[*].id }

# ✅ 키를 살려 내보낸다
output "private_subnet_ids" { value = { for k, s in aws_subnet.private : k => s.id } }
```

### ❌ 모듈 이름이나 `for_each` 키를 `moved` 없이 바꾼다

모듈의 키를 바꾸면 그 안의 리소스 전부가 파괴 후 재생성된다.

```console
# ❌ 그대로 apply하면 VPC부터 NAT까지 22개가 재생성된다
Plan: 22 to add, 0 to change, 22 to destroy.

# ✅ moved { from = module.network, to = module.vpc } 를 넣고 이 출력을 확인한다
Plan: 0 to add, 0 to change, 0 to destroy.
```

## 프로덕션 노트

- **모듈의 변수 개수는 유지보수 비용의 대리 지표다.** 20개를 넘으면 대개 책임이 둘 이상 섞인 것이다. 새 변수를 열기 전에 "모듈이 계산하거나 강제할 수는 없는가"를 먼저 묻는다.
- **모듈 변경의 폭발 반경은 사용처 수만큼이다.** 버전을 고정하고, 변경은 새 태그로 내보내고, 소비자가 각자의 일정에 올리게 한다. 로컬 경로 모듈에는 이 안전장치가 없다.
- **`for_each` 가 붙은 모듈은 인스턴스마다 리소스 세트가 통째로 복제된다.** 모듈 하나가 22개를 만들면 서비스 10개는 220개이고 plan마다 그만큼 `Describe*` 가 나간다([40장](../level3-advanced/40-performance-and-throttling.md)).
- **모듈 출력에 `sensitive = true` 를 붙여도 state에는 평문으로 남는다.** 모듈 경계는 접근 제어가 아니다. 시크릿은 소비자가 직접 Secrets Manager에서 읽게 한다([26장](26-secrets-and-ephemeral.md)). 원격 모듈 소스는 CI의 네트워크 의존성이기도 하다 — 폐쇄망에서는 S3 소스나 사설 Registry로 옮긴다.
- **모듈 안에서 `terraform_remote_state` 로 다른 스택을 읽지 않는다.** 특정 state 레이아웃에 묶여 재사용이 불가능해진다. 루트에서 읽어 변수로 넘긴다([16장](16-remote-state-and-backends.md)).

## 연습문제

**1. VPC 모듈 만들기.** `name`, `cidr_block`, `azs`, `nat`, `tags` 만 받는 VPC 모듈을 작성한다. 서브넷 CIDR은 모듈이 계산하고 출력은 map 형태의 서브넷 ID를 포함한다.
*성공 기준:* `nat = { single = true }` 면 NAT가 1개, 기본값이면 AZ 수만큼 생성된다. `terraform state list` 의 주소가 모두 `module.vpc.` 로 시작하고 서브넷 키가 AZ 이름이다.

**2. 인라인을 모듈로 옮기기.** 루트에 인라인으로 있던 VPC 리소스들을 1번에서 만든 모듈로 옮긴다.
*성공 기준:* `moved` 블록을 작성해 plan이 `0 to add, 0 to change, 0 to destroy` 와 이동 목록만 출력하는 상태에서 apply한다. 전후로 `terraform state list` 항목 수가 같다.

**3. provider 전달 검증.** 같은 VPC 모듈을 두 리전에 만든다 — (a) `providers = { aws = aws.usw2 }` 방식, (b) 모듈에 `region` 변수를 받아 리소스에 넘기는 방식.
*성공 기준:* 두 방식 모두 apply되고, (b)에서 `region` 값을 바꾼 plan이 in-place가 아니라 교체로 나오는 것을 확인해 기록한다.

## 요약

- **`.tf` 파일이 있는 디렉터리 하나가 모듈**이고 `apply` 를 실행한 디렉터리가 루트 모듈이다. 자식은 자체 state를 갖지 않고 루트 state에 `module.<이름>.` 접두어로 들어간다.
- `module` 블록의 메타 인수는 `source`(필수), `version`(Registry 전용), `providers`, `count`/`for_each`/`depends_on` 이고 나머지는 전부 자식의 `variable` 에 대응한다.
- `source` 는 로컬 경로(`./`, `../`), Registry, Git(`git::`, `?ref=`), S3(`s3::`)를 받는다. `//` 는 저장소 안 서브디렉터리 구분자다. 로컬 모듈은 즉시 반영되지만 원격 모듈은 `.terraform/modules/` 에 캐시되어 `init -upgrade` 가 필요하다.
- 좋은 인터페이스는 **환경마다 다른 값만 열고, 조직 표준과 계산 가능한 값은 닫는다.** 출력에는 ID·ARN만 담고 리소스 객체 전체를 내보내지 않으며 반복 리소스의 ID는 map으로 낸다. 좋은 모듈은 **단일 책임**을 지고 이름 접두어를 붙이고 `tags` 를 주입받아 `merge` 하며, 조건부 생성을 `for_each` 대상 집합 크기로 한 곳에서 결정한다.
- **자식 모듈에 `provider` 블록을 두지 않는다.** `count`/`for_each`/`depends_on` 을 쓸 수 없게 되고 모듈 제거도 불가능해진다. 부모가 정의해 `providers = { aws = aws.usw2 }` 로 전달하고, 여러 설정이 필요하면 자식이 `configuration_aliases` 로 선언한다. v6의 `region` 인수는 이 필요를 상당 부분 대체하되 값을 바꾸면 리소스가 교체된다.
- 프로덕션 스택은 모듈 버전을 **정확히 고정**한다 — 모듈은 `.terraform.lock.hcl` 에 기록되지 않으므로 범위를 열어 두면 CI가 다른 버전을 받는다. 공개 모듈은 표준화된 영역에서 유리하고 조직 정책이 개입하는 영역에서는 불리하며, 절충안은 얇은 래퍼 모듈이다.
- `examples/` 는 문서이자 CI 검증 수단이고, `terraform test` 의 `.tftest.hcl` 은 `run`+`assert` 로 모듈의 계약을 코드로 고정한다. 모듈 경계를 바꾸는 리팩터링은 반드시 `moved` 와 함께 하며, `from = module.network` 처럼 모듈 전체를 한 번에 옮길 수 있다.

## 다음으로

- [20장 — Import와 Resource Identity](20-import-and-resource-identity.md) — 이미 있는 리소스를 모듈 주소로 데려오기.
- [22장 — moved · removed](22-moved-removed-refactoring.md) — 모듈 리팩터링의 정석.
- [24장 — Enhanced Region Support](24-enhanced-region-support.md) — `region` 인수와 provider alias.
- 공식 문서: [Modules](https://developer.hashicorp.com/terraform/language/modules), [Module Sources](https://developer.hashicorp.com/terraform/language/modules/sources)
