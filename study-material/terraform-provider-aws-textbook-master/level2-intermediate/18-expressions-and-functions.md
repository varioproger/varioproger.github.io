---
chapter: 18
level: "Level 2 — 중급"
title: "표현식과 내장 함수: for · splat · try · templatefile"
difficulty: 중급
reading_time: "34분"
prerequisites: [3, 17]
source_docs:
  - "docs/regular-expressions.md"
  - "website/docs/r/launch_template.html.markdown"
  - "website/docs/r/instance.html.markdown"
  - "website/docs/r/s3_object.html.markdown"
  - "website/docs/r/lambda_function.html.markdown"
  - "website/docs/r/ecs_task_definition.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
  - "website/docs/r/subnet.html.markdown"
source_url: "https://developer.hashicorp.com/terraform/language/functions"
provider_baseline: "6.x"
---

# 18장 — 표현식과 내장 함수: for · splat · try · templatefile

**이 장에서 배우는 것**

- `for` 표현식으로 리스트를 리스트로, 리스트를 map으로, map을 map으로 바꾸고 `if` 로 걸러내며 `...` 로 그룹화할 수 있다.
- splat(`[*]`)이 `for` 의 축약이라는 것을 알고, `count` 리소스와 `for_each` 리소스에서 왜 다르게 동작하는지 설명할 수 있다.
- `merge`, `flatten`, `setproduct`, `zipmap`, `try`, `coalesce` 같은 컬렉션 함수를 상황에 맞게 고르고, `cidrsubnet`/`cidrsubnets`/`cidrhost` 로 손으로 계산한 CIDR 표를 없앨 수 있다.
- `timestamp`, `uuid` 처럼 **매 plan마다 값이 바뀌는 함수**가 왜 영구 diff를 만드는지 알고 피할 수 있다.
- `templatefile()` 로 user_data 스크립트를 만들고, `${}` 이스케이프와 `jsonencode` 와의 선택 기준을 알 수 있다.
- `can()`/`try()` 로 변수 `validation` 을 작성하고, `terraform console` 에서 표현식을 실험할 수 있다.

**왜 중요한가**

어느 팀이 서브넷 CIDR을 스프레드시트로 관리했다. `10.0.0.0/16` 을 `/24` 로 쪼갠 24개를 손으로 적어 두고 코드에 문자열로 박았다. 6개월 뒤 새 리전에 같은 구조를 복제하다 대역 하나를 잘못 옮겨 적었고, 겹치지 않는 대역이라 apply는 성공했다. 문제는 반년 뒤 VPC 피어링을 붙일 때 드러났다 — 두 VPC의 대역이 부분적으로 겹쳐 라우팅이 되지 않았고, 되돌리려면 서브넷을 지웠다 만들어야 했다. `cidrsubnet(var.vpc_cidr, 8, 6)` 한 줄이면 오타가 존재할 수 없는 자리였다.

다른 팀은 `aws_instance` 의 `tags` 에 `LastApplied = timestamp()` 를 넣었다. 그날부터 CI의 `terraform plan` 은 **한 번도 "No changes"를 출력하지 못했다.** `timestamp()` 는 plan을 돌릴 때마다 다른 값이므로 인스턴스 40대가 매번 태그 변경으로 잡혔고, plan 출력이 200줄씩 길어지자 사람들은 diff를 읽지 않고 승인하기 시작했다. 두 달 뒤 그 잡음 속에 섞여 있던 진짜 변경 — 보안 그룹의 `0.0.0.0/0` ingress — 이 그대로 통과했다.

표현식과 함수는 문법 장식이 아니다. **오타가 존재할 수 없는 자리를 만들고, plan 출력을 조용하게 유지하고, 없는 값 때문에 죽지 않게 하는 도구**다. 목표는 함수 목록을 외우는 것이 아니라 "이 상황에는 이 함수"라는 지도를 갖는 것이다.

## `terraform console`: 실험실부터 연다

표현식을 코드에 넣고 `plan` 으로 확인하는 것은 느리다. `terraform console` 은 현재 디렉터리의 설정과 state를 로드한 REPL을 띄운다.

```console
$ terraform console
> cidrsubnet("10.0.0.0/16", 8, 3)
"10.0.3.0/24"
> [for s in ["a", "b"] : "subnet-${s}"]
[
  "subnet-a",
  "subnet-b",
]
> aws_vpc.main.cidr_block   # state가 있으면 실제 속성도 읽힌다
"10.0.0.0/16"
```

state를 건드리지 않는 읽기 전용이라 마음껏 시험해도 되지만, 원격 backend를 쓰는 디렉터리에서는 backend에 접근하므로([16장](16-remote-state-and-backends.md)) 순수 표현식만 볼 때는 빈 디렉터리에서 띄운다.

`type()` 도 콘솔에서 유용하다. `type(["a","b"])` 는 `tuple([string, string])`, `type(toset(["a","b"]))` 는 `set(string)` 이다. 리터럴 리스트가 `list` 가 아니라 `tuple` 이라는 사실은 변수 타입 제약에서 계속 튀어나온다([3장](../level1-beginner/03-hcl-basics.md)).

## `for` 표현식: 컬렉션을 다른 컬렉션으로

`for` 는 반복문이 아니라 **표현식**이다. 값을 하나 만들어 낼 뿐 부수효과가 없고, 감싸는 괄호가 결과 타입을 결정한다 — `[ ]` 면 tuple, `{ }` 면 object다.

### 리스트 컴프리헨션

`[for s in ["web", "app", "db"] : "${var.project}-${s}"]` 는 `["shop-web", "shop-app", "shop-db"]` 를 만든다. map을 순회하면 변수를 두 개 받는다. 하나만 쓰면 리스트에서는 값이지만 map에서는 **키**다 — `[for k in { http = 80 } : k]` 는 `["http"]` 이고, 값까지 쓰려면 `[for k, v in ... : "${k}:${v}"]` 로 둘을 받는다. 리스트도 `[for i, s in list : ...]` 로 인덱스를 함께 받을 수 있다.

### map 컴프리헨션

`{ }` 안에 `키 => 값` 을 쓴다. [17장](17-count-foreach-dynamic.md)에서 `for_each` 에 넘길 map을 만드는 표준 도구다.

```terraform
locals {
  subnet_by_name = { for s in var.subnets : s.name => s }

  # 리소스에서 뽑아 map으로 접기
  subnet_ids = { for k, s in aws_subnet.private : k => s.id }
}
```

**map 컴프리헨션의 키는 유일해야 한다.** 중복되면 `Duplicate object key` 로 실패하는데, 이것은 방어선이다 — 원본 데이터에 중복이 있다는 뜻이고 조용히 덮어쓰는 것보다 실패하는 편이 낫다.

### `if` 로 걸러내기

`for` 뒤에 `if` 를 붙이면 조건을 만족하는 항목만 남는다.

```terraform
locals {
  public_subnets = { for k, s in var.subnets : k => s if s.public }
  usable_azs     = [for az in data.aws_availability_zones.available.names : az if !endswith(az, "d")]
}
```

`if` 절에서는 순회 변수를 그대로 쓴다. 이 필터가 리소스 개수를 정하므로 조건에 `known after apply` 값이 들어가면 `for_each` 가 다시 막힌다.

### `...` 로 그룹화하기

값 표현식 뒤에 `...` 를 붙이면 같은 키로 들어온 값들이 **리스트로 묶인다.** 키 중복이 에러가 아니라 그룹이 된다.

```terraform
locals {
  # var.subnets: list(object({ name, tier, az }))
  by_tier = { for s in var.subnets : s.tier => s.name... }
  # { "public" = ["public-a", "public-c"], "private" = ["private-a", "private-c"] }
}
```

AZ별로 서브넷을 묶어 NAT 게이트웨이를 배치할 때 그대로 쓰인다. 그룹화 없이 같은 일을 하려면 `distinct` 로 키를 뽑고 각 키마다 `for`+`if` 를 도는 이중 루프가 되는데, `...` 한 글자가 그것을 대신한다.

## splat은 `for` 의 축약이다

`aws_subnet.private[*].id` 를 splat 표현식이라고 부른다. 이것은 문법적으로 특별해 보이지만 의미는 `for` 로 완전히 설명된다.

```terraform
aws_subnet.private[*].id
# 와 같다
[for s in aws_subnet.private : s.id]
```

splat이 `for` 보다 나은 점은 짧다는 것뿐이고 못 하는 것은 많다 — 필터도, 변형도, map 생성도 안 된다. 속성 하나를 그대로 꺼낼 때만 쓴다.

### `count` 리소스와 `for_each` 리소스에서의 차이

`count` 가 붙은 리소스는 **리스트**라 `[*]` 가 그대로 동작하지만, `for_each` 가 붙은 리소스는 **map**이라 동작하지 않는다.

```terraform
output "ids_count"   { value = aws_subnet.private[*].id }          # count 리소스: 동작
output "ids_foreach" { value = values(aws_subnet.private)[*].id }  # for_each: values() 경유
output "ids_map"     { value = { for k, s in aws_subnet.private : k => s.id } }  # 권장
```

`for_each` 리소스의 출력은 **map으로 내보내는 편이 낫다.** 리스트로 내보내면 소비하는 쪽이 인덱스로 접근하게 되고, 그 순간 [17장](17-count-foreach-dynamic.md)의 인덱스 시프트 문제가 다른 모듈로 전염된다.

splat에는 "legacy" 동작도 하나 있다. **리스트가 아닌 값에 `[*]` 를 붙이면 원소 하나짜리 리스트로 감싸고, null이면 빈 리스트가 된다.** 덕분에 `count = var.enabled ? 1 : 0` 리소스에 `one(aws_nat_gateway.this[*].id)` 관용구가 성립한다. 반대로 map에 붙이면 에러 대신 map 하나짜리 리스트가 나오며 조용히 이상해지므로, 결과가 예상과 다르면 `type()` 으로 확인한다.

## 컬렉션 함수 지도

함수를 알파벳 순으로 외우는 것은 쓸모가 없다. **문제 → 함수**로 외운다.

| 하고 싶은 것 | 함수 |
|---|---|
| 태그 map 여러 개를 합치되 뒤가 이긴다 | `merge(a, b, c)` |
| map에서 키를 꺼내되 없으면 기본값 | `lookup(m, k, default)` |
| 어떤 표현식이 실패하면 다음 것 | `try(a, b, c)` |
| null이 아닌 첫 값 | `coalesce(a, b)` / 리스트판 `coalescelist` |
| 리스트에서 null·빈 문자열 제거 | `compact(list)` |
| 중복 제거(순서 유지) | `distinct(list)` |
| 중첩 리스트를 한 겹 펴기 | `flatten(list)` |
| 두 집합의 모든 조합 | `setproduct(a, b)` |
| 키 리스트 + 값 리스트 → map | `zipmap(keys, values)` |
| map의 키/값만 | `keys(m)` / `values(m)` |
| 포함 여부 | `contains(list, v)` |
| n번째 원소(순환) / 잘라내기 / N개씩 쪼개기 | `element` / `slice` / `chunklist` |

몇 개는 주의할 점이 있다.

**`merge` 는 얕은 병합이다.** `merge({a={x=1,y=2}}, {a={x=9}})` 는 `{a={x=9}}` 이고 `y` 는 사라진다. 태그처럼 평평한 map에는 완벽하지만 중첩 객체를 합치려고 쓰면 필드가 증발한다. **`lookup` 은 인수 3개로만 쓴다** — 두 개짜리는 키가 없으면 에러다. `element` 는 인덱스를 나머지 연산으로 순환시키고(`element(["a","b"], 5)` 는 `"b"`), `flatten` 은 한 겹이 아니라 끝까지 편다.

**`setproduct` 는 카테시안 곱이다.** 결과가 `[["web","a"], ["web","b"], ...]` 처럼 리스트의 리스트라 그대로 `for_each` 에 넣을 수 없고 map으로 접어야 한다.

```terraform
locals {
  subnet_matrix = {
    for p in setproduct(["public", "private"], var.azs) :
    "${p[0]}-${substr(p[1], -1, 1)}" => { tier = p[0], az = p[1] }
  }
  # { "public-a" = {...}, "public-b" = {...}, "private-a" = {...}, ... }
}
```

**`zipmap` 은 두 리스트의 길이가 다르면 에러다.** 같은 리소스에서 `[*]` 로 뽑은 두 속성은 순서가 일치하므로 안전하다.

타입 변환 함수 `tostring`/`tonumber`/`toset`/`tomap`/`tolist` 는 실패하면 에러를 내므로 `try(tonumber(v), 0)` 조합이 흔하다. 실무에서 필요한 순간은 둘이다. 리스트를 `for_each` 에 넘길 때의 `toset(...)`(**중복이 사라진다**), 그리고 값 타입이 섞인 map에서 `tomap({...})` 이 실패할 때다 — HCL의 map은 값 타입이 하나여야 하므로 섞인 값은 object로 두거나 전부 `tostring` 한다. 무엇이 tuple이고 무엇이 set인지는 `type()` 으로 확인한다.

## `try`, `can`, `one`: 없을지도 모르는 값

`try(expr...)` 는 인수를 왼쪽부터 평가해 **에러 없이 성공하는 첫 값**을, `can(expr)` 은 성공 여부를 bool로 돌려준다.

```terraform
locals {
  log_level = try(var.app_config.log_level, "info")           # 키가 없으면 기본값
  domain    = try(var.custom_domain, "${var.project}.example.com")
}
```

`try` 와 `coalesce` 는 다르다. **`try` 는 "에러"를 흡수하고, `coalesce` 는 "null/빈 값"을 건너뛴다.** 키가 아예 없는 상황은 `try`, 키는 있는데 값이 null인 상황은 `coalesce` 이고, `coalesce(try(var.overrides.type, null), var.default_type)` 처럼 겹쳐 쓰는 것도 흔하다.

`try` 를 남용하면 안 되는 이유는 분명하다. **`try` 는 에러를 삼킨다.** 오타 난 속성 이름도 "실패"이므로 조용히 기본값으로 떨어진다. `try` 는 "이 값은 없을 수도 있다"가 **설계**일 때만 쓴다.

### `can()` 으로 validation 쓰기

변수 `validation` 블록의 `condition` 은 bool을 돌려줘야 하는데 안에서 에러가 나면 검증 대신 크래시가 난다. `can()` 이 그것을 막는다.

```terraform
variable "vpc_cidr" {
  type = string

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr는 유효한 CIDR 표기여야 한다 (예: 10.0.0.0/16)."
  }
  validation {
    condition     = try(tonumber(split("/", var.vpc_cidr)[1]) <= 16, false)
    error_message = "vpc_cidr의 프리픽스는 /16 이하로 넓어야 한다."
  }
}
```

`validation` 블록은 여러 개를 쓰면 각각 독립적으로 검사된다. 하나의 조건에 `&&` 를 세 개 넣는 것보다 블록을 셋으로 나누는 편이 **어떤 규칙을 어겼는지** 알려 주므로 낫다([7장](../level1-beginner/07-variables-outputs-locals.md)).

`one()` 은 다른 도구다. 원소가 0개면 null, 1개면 그 원소, 2개 이상이면 에러다. `output "nat_id" { value = one(aws_nat_gateway.this[*].id) }` 처럼 `count = 0 or 1` 패턴의 참조를 안전하게 만든다.

## 문자열과 정규식

`format`, `join`/`split`, `replace`, `substr`, `trimprefix`/`trimsuffix`, `lower`/`upper` 는 이름 그대로다. 자주 틀리는 것만 짚는다.


- `substr(s, offset, length)` 의 `length` 에 `-1` 을 주면 끝까지, `offset` 에 음수를 주면 뒤에서부터 센다 — `substr("ap-northeast-2a", -1, 1)` 은 `"a"` 다. AZ 이름에서 접미 문자만 뽑는 관용구가 여기서 나온다.
- 이름 조립은 `format` 보다 보간이 읽기 쉽다. `format` 은 `%02d` 처럼 **자리수 채움**이 필요할 때만 쓴다. `split` 은 항상 리스트를 돌려주므로 원소 수를 `length` 로 검증한 뒤 인덱싱한다.

`regex(pattern, string)` 은 첫 매치를, `regexall` 은 모든 매치를 돌려준다. 이름 붙은 그룹(`(?P<name>...)`)을 쓰면 map이 나온다 — `regex("^arn:aws:s3:::(?P<name>[0-9A-Za-z_.-]+)$", var.bucket_arn).name`. 매치가 없으면 `regex` 는 에러이므로, 존재 여부만 볼 때는 `length(regexall(...)) > 0` 을 쓴다. ARN 파싱은 provider 함수 `arn_parse` 가 더 낫다([33장](33-provider-functions-and-policies.md)).

Terraform의 정규식은 Go의 RE2 문법이다. **역참조(`\1`)와 전방탐색(`(?=...)`)이 없다.** PCRE에서 가져온 패턴이 `error parsing regexp` 로 죽으면 대개 이 둘이다. provider 저장소의 `docs/regular-expressions.md` 는 정규식이 메모리를 많이 쓰므로 문자열 포함 검사로 대체하라고 권하고, 문자 클래스는 `[0-9A-Za-z_.-]` 처럼 **숫자 → 대문자 → 소문자 → 언더스코어 → 나머지 → 대시** 순으로 쓰라고 정한다. 대시를 마지막에 두면 이스케이프가 필요 없고, 문자 클래스 안에서는 `$ ( ) * + . ? ^ { | }` 를 이스케이프하지 않는다. provider 코드용 규칙이지만 우리 설정에 적용해도 손해가 없다.

정규식보다 `startswith`, `endswith`, `strcontains` 로 끝나는 일이면 그쪽을 쓴다.

## 인코딩: jsonencode · yamlencode · base64

`jsonencode(value)` 는 HCL 값을 JSON 문자열로 만든다. **JSON을 요구하는 인수는 거의 전부 이것으로 만든다** — `aws_ecs_task_definition` 의 `container_definitions`, `aws_iam_policy` 의 `policy`, `aws_sqs_queue` 의 `redrive_policy` 등.

```terraform
container_definitions = jsonencode([
  {
    name        = "app"
    image       = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    essential   = true
    environment = [for k, v in var.env_vars : { name = k, value = v }]
  }
])
```

IAM 정책만은 `data "aws_iam_policy_document"` 가 낫다([13장](../level1-beginner/13-iam-basics.md)). `json` 과 `minified_json` 두 속성을 내보내고 문서 병합(`source_policy_documents`, `override_policy_documents`)을 지원한다.

`jsondecode` 는 반대 방향이다. Secrets Manager에 JSON으로 저장된 값을 꺼낼 때 `jsondecode(data.aws_secretsmanager_secret_version.db.secret_string).password` 형태로 쓴다.

`yamlencode` 는 출력 형식이 Terraform 버전에 따라 달라질 수 있다고 공식 문서가 명시하므로 **결과 문자열을 해시해서 트리거로 삼지 않는다.**

base64 계열은 인코딩 자체가 목적이 아니라 **AWS API가 base64를 요구**하기 때문에 쓴다. `aws_launch_template` 의 `user_data` 는 문서에 "base64-encoded user data"라고 되어 있고, `aws_instance` 는 평문 `user_data` 와 `user_data_base64` 를 따로 받는다. 같은 스크립트라도 launch template에는 반드시 인코딩해서 넣어야 한다.

`filebase64("${path.module}/app.zip")` 는 파일을 읽어 base64로 준다. `base64gzip` 은 gzip 후 base64로 16KB 제한이 있는 user_data를 줄일 때 쓰는데, `aws_instance` 문서는 gzip 데이터를 `user_data` 로 넘기지 말고 `user_data_base64` 로 넣으라고 명시한다.

## CIDR 계산: 표를 코드로 바꾼다

서브넷 CIDR을 손으로 계산한 표는 언젠가 틀린다. 네 함수면 끝난다.

- `cidrsubnet(prefix, newbits, netnum)` — 프리픽스 길이에 `newbits` 를 더한 뒤 `netnum` 번째 블록을 준다.
- `cidrsubnets(prefix, newbits...)` — 서로 다른 크기의 블록을 순서대로 잘라 리스트로 준다.
- `cidrhost(prefix, hostnum)` — 대역 안의 n번째 주소.
- `cidrnetmask(prefix)` — 넷마스크 표기(IPv4 전용).

```console
> cidrsubnet("10.0.0.0/16", 8, 3)
"10.0.3.0/24"
> cidrsubnets("10.0.0.0/16", 2, 2, 4)
[
  "10.0.0.0/18",
  "10.0.64.0/18",
  "10.0.128.0/20",
]
> cidrhost("10.0.1.0/24", 10)
"10.0.1.10"
```

실전 배치는 **public/private 대역을 먼저 분리하고 그 안에서 AZ 번호로 자르는** 형태가 관리하기 쉽다.

```terraform
locals {
  az_index     = { for i, az in var.azs : az => i }
  public_base  = cidrsubnet(var.vpc_cidr, 4, 0)  # 10.0.0.0/20
  private_base = cidrsubnet(var.vpc_cidr, 2, 1)  # 10.0.64.0/18

  public_subnets  = { for az, i in local.az_index : az => cidrsubnet(local.public_base, 4, i) }
  private_subnets = { for az, i in local.az_index : az => cidrsubnet(local.private_base, 4, i) }
}
```

여기서 중요한 것은 **`netnum` 을 AZ 인덱스에 묶었다는 점**이다. AZ 목록의 순서가 바뀌면 CIDR이 바뀌고 서브넷이 교체된다 — [17장](17-count-foreach-dynamic.md)의 인덱스 시프트와 같은 문제다. AZ 목록은 변수로 고정한다.

`cidrsubnets` 는 크기가 다른 블록을 한 번에 자를 때 유리하지만 나중에 가운데에 블록을 추가하면 뒤가 전부 밀린다. **미래에 늘어날 자리를 처음부터 비워 두는** 편이 낫다.

## 매 실행마다 바뀌는 값: 영구 diff의 근원

`timestamp()` 는 plan을 돌리는 순간의 UTC 시각을, `uuid()` 는 매번 새 난수를 돌려준다. 둘 다 **설정에 직접 쓰면 영구 diff**를 만든다.

만료 시각이 필요하면 `timeadd(timestamp(), "720h")` 대신 **변수로 받은 고정 날짜**를 쓰거나, `lifecycle { ignore_changes = [tags["LastApplied"]] }` 로 무시한다([21장](21-lifecycle-meta-arguments.md)). `formatdate("YYYY-MM-DD", timestamp())` 로 감싸도 **날짜가 넘어가는 순간 diff가 생긴다** — 자정에 돌아가는 CI에게는 위로가 되지 않는다.

`uuid()` 도 같은 이유로 위험하다. 유일한 이름이 필요하면 provider의 `name_prefix` 인수나 `random_id` 를 쓴다. 결정적 UUID가 필요하면 같은 입력에 항상 같은 출력을 주는 `uuidv5(namespace, name)` 을 쓴다.

해시 함수는 정반대로 **안정적이라서** 유용하다. `md5`/`sha256` 은 문자열을, `filemd5`/`filesha256`/`filebase64sha256` 은 파일 내용을 해시한다. 용도는 "내용이 바뀌었을 때만 업데이트를 트리거하는 것"이다.

```terraform
resource "aws_s3_object" "config" {
  bucket = aws_s3_bucket.artifacts.id
  key    = "config/app.json"
  source = "${path.module}/files/app.json"
  etag   = filemd5("${path.module}/files/app.json")
}
```

`aws_s3_object` 문서는 `etag` 의 의미 있는 값은 `filemd5("path/to/file")` 뿐이라고 못박고, KMS 암호화나 16MB 초과 객체에서는 ETag가 MD5가 아니므로 `source_hash` 를 쓰라고 한다. `aws_lambda_function` 의 `source_code_hash` 는 provider가 추적하는 합성 인수라 알고리즘을 맞출 필요가 없고(관례상 `filebase64sha256(...)`), 콘솔에서 직접 바뀐 코드까지 잡으려면 `code_sha256` 을 쓰라고 문서가 구분한다.

## `templatefile()`: 설정 파일을 만든다

`templatefile(path, vars)` 는 파일을 읽어 그 안의 보간과 지시자를 `vars` 로 렌더링한다. 확장자는 `.tftpl` 이 관례다.

```bash
# user_data.sh.tftpl
#!/bin/bash
set -euo pipefail
echo "APP_PORT=${app_port}" >> /etc/environment
%{ for k, v in extra_env ~}
echo "${k}=${v}" >> /etc/environment
%{ endfor ~}
%{ if enable_ssm ~}
dnf install -y amazon-ssm-agent && systemctl enable --now amazon-ssm-agent
%{ endif ~}
```

```terraform
resource "aws_launch_template" "app" {
  name_prefix = "${var.project}-app-"

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tftpl", {
    app_port   = var.app_port
    enable_ssm = true
    extra_env  = var.extra_env
  }))
}
```

지시자 `%{ if }`/`%{ for }` 뒤의 `~` 는 그 방향의 공백과 개행을 지워, 렌더링 결과에 빈 줄이 쌓이는 것을 막는다.

### `$${}` 이스케이프

템플릿 안에서 **셸 변수 `${VAR}` 를 그대로 남기려면 `$$` 로 이스케이프**한다. 모르면 `${HOME}` 이 "HOME이라는 템플릿 변수가 없다"는 에러로 죽는다. 리터럴 `%{` 가 필요할 때도 같은 규칙으로 `%%{` 를 쓴다.

```bash
INSTANCE_ID=$$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
echo "id=$${INSTANCE_ID}"   # 셸이 해석
echo "port=${app_port}"     # Terraform이 채움
```

### 언제 `templatefile` 이고 언제 `jsonencode` 인가

기준은 **결과물이 구조화된 데이터인가 아닌가**다. JSON/YAML이라면 `jsonencode`/`yamlencode` 다 — 템플릿으로 JSON을 조립하면 값에 따옴표가 들어가는 순간 깨지고 리스트가 비면 쉼표가 남는다. 이스케이프를 사람이 책임지는 구조는 결국 사고가 된다. 셸 스크립트, cloud-init, systemd 유닛처럼 **자유 형식 텍스트**라면 `templatefile` 이고, 값 하나만 끼우는 짧은 문자열은 보간으로 충분하다.

`templatefile` 은 파일을 **plan 시점에** 읽으므로 경로는 `path.module` 기준으로 쓰고, apply 중에 생길 파일은 읽을 수 없다. 템플릿에 시크릿을 넣으면 그 값이 `user_data` 로 state에 저장되고 EC2 메타데이터로도 노출되므로, 시크릿은 굽지 말고 런타임에 SSM/Secrets Manager에서 읽게 한다([26장](26-secrets-and-ephemeral.md)).

## 흔한 실수

### ❌ 태그에 `timestamp()` 를 넣는다

값이 매 plan마다 달라져 리소스 전부가 영구 diff에 걸린다.

```terraform
# ❌ 40대의 인스턴스가 매번 "1 to change"로 잡힌다
tags = { LastApplied = timestamp() }
```

```terraform
# ✅ 배포 시각이 정말 필요하면 CI가 넘기는 고정 값으로 받는다
variable "deployed_at" { type = string }   # TF_VAR_deployed_at=$(date -u +%FT%TZ)
tags = { DeployedAt = var.deployed_at }
```

### ❌ 템플릿 안의 셸 변수를 이스케이프하지 않는다

`${HOME}` 을 Terraform이 자기 변수로 해석해 `There is no variable named "HOME"` 으로 plan이 죽는다.

```bash
# ❌ user_data.sh.tftpl
echo "host=${HOSTNAME}"
```

```bash
# ✅ 셸에 남길 것은 $$ 로 이스케이프한다
echo "host=$${HOSTNAME}"
echo "port=${app_port}"   # 이것만 Terraform이 채운다
```

### ❌ `for_each` 리소스에 splat을 쓴다

`for_each` 리소스는 map이라 `[*]` 가 기대대로 동작하지 않는다.

```terraform
# ❌ map에 splat
output "subnet_ids" { value = aws_subnet.private[*].id }
```

```terraform
# ✅ 키를 살려 map으로 내보낸다
output "subnet_ids" { value = { for k, s in aws_subnet.private : k => s.id } }
```

### ❌ 반드시 있어야 하는 값을 `try` 로 감싼다

`try` 는 오타 난 속성 이름의 에러까지 삼켜, 설정이 왜 반영되지 않는지 알 수 없게 만든다.

```terraform
# ❌ instnace_type 오타가 조용히 t3.micro로 떨어진다
instance_type = try(var.config.instnace_type, "t3.micro")
```

```terraform
# ✅ 없을 수 있는 값은 변수 스키마에 기본값으로 선언한다
variable "config" {
  type = object({ instance_type = optional(string, "t3.micro") })
}
instance_type = var.config.instance_type
```

## 프로덕션 노트

- **plan은 조용해야 한다.** "No changes"가 정상 상태여야 진짜 변경이 눈에 띈다. 실행마다 흔들리는 값은 설정에서 뿌리째 뽑고, 남는 잡음은 `ignore_changes` 로 명시적으로 봉인한다.
- **표현식 로직은 `locals` 로 끌어낸다.** 리소스 인수 안의 3단 중첩 `for` 는 에러가 나도 어느 항목 때문인지 알려 주지 않는다. `locals` 로 분리하면 `terraform console` 에서 그 값만 꺼내 볼 수 있다.
- **파일 해시는 재현 가능한 빌드를 전제한다.** 매번 다른 zip을 해시하면 Lambda가 배포마다 갱신된다. 빌드가 결정적이지 않으면 아티팩트를 S3에 올리고 버전으로 참조한다.
- **`for_each` 키를 만드는 표현식은 곧 리소스 주소다.** 키 생성 로직을 바꾸는 변경은 `moved` 없이는 전면 재생성이다([22장](22-moved-removed-refactoring.md)).
- **CIDR 계산은 한 곳에만 둔다.** `cidrsubnet` 호출이 흩어지면 어떤 대역이 비어 있는지 아무도 모른다. `locals` 한 블록에 배치를 모아 output으로 내보낸다.

## 연습문제

**1. 서브넷 배치를 코드로.** `var.vpc_cidr` 와 `var.azs` 만 받아 public/private 서브넷 CIDR map을 만드는 `locals` 를 작성한다. 대역이 겹치지 않고 AZ를 추가해도 기존 CIDR이 변하지 않아야 한다.
*성공 기준:* `terraform console` 에서 두 map을 출력해 겹침이 없음을 보이고, `var.azs` 끝에 AZ를 하나 더한 뒤 기존 세 값이 그대로인지 확인한다.

**2. 그룹화로 NAT 배치.** `list(object({ name, tier, az }))` 서브넷 목록에서 `...` 그룹화로 AZ별 public 서브넷 map을 만들고, 그 map으로 `aws_nat_gateway` 를 `for_each` 한다.
*성공 기준:* AZ가 3개면 NAT 3개, `var.single_nat = true` 면 1개가 계획되고, 두 경우 모두 `known after apply` 키 에러가 없다.

**3. templatefile 왕복.** 셸 변수와 Terraform 변수를 모두 포함하는 user_data 템플릿을 만들어 `aws_launch_template` 에 넣는다.
*성공 기준:* `terraform console` 에서 `templatefile(...)` 결과를 출력해 `${HOSTNAME}` 이 리터럴로 남고 `app_port` 는 치환된 것을 확인한다. `base64encode` 를 뺐을 때의 에러도 기록한다.

## 요약

- `for` 는 반복문이 아니라 표현식이다. `[ ]` 는 tuple을, `{ k => v }` 는 object를 만들고, `if` 로 거르며 값 뒤의 `...` 로 같은 키의 값을 그룹화한다. map 컴프리헨션의 키 중복은 에러다.
- splat `[*]` 는 `[for x in c : x.attr]` 의 축약이다. `count` 리소스는 리스트라 동작하고 `for_each` 리소스는 map이라 `values()` 를 거치거나 `for` 로 map을 만든다. 리스트가 아닌 값에 붙이면 원소 하나짜리 리스트가, null이면 빈 리스트가 된다.
- 함수는 이름이 아니라 문제로 외운다 — 합치기 `merge`(얕다), 기본값 `lookup`/`try`/`coalesce`, 정리 `compact`/`distinct`/`flatten`, 조합 `setproduct`, 변환 `zipmap`. `toset` 은 중복을 지운다.
- `try` 는 **에러**를, `coalesce` 는 **null**을 건너뛴다. `try` 는 없을 수 있는 값이 설계일 때만 쓰고, `can()` 은 `validation` 안에서 에러를 bool로 바꿔 준다. Terraform 정규식은 Go RE2라 역참조와 전방탐색이 없고, 포함 검사로 끝나면 `startswith`/`endswith`/`strcontains` 를 쓴다.
- JSON을 요구하는 인수는 `jsonencode` 로 만들되 IAM 정책은 `data "aws_iam_policy_document"`(`json`, `minified_json`)가 낫다. `aws_launch_template` 의 `user_data` 는 base64여야 하고, `aws_instance` 는 `user_data` 와 `user_data_base64` 를 구분해 받는다.
- `cidrsubnet`/`cidrsubnets`/`cidrhost`/`cidrnetmask` 로 CIDR 표를 없앤다. `netnum` 을 AZ 인덱스에 묶으면 AZ 목록 순서가 곧 대역 배치이므로 목록을 고정한다. `timestamp()`, `uuid()` 는 매 실행마다 값이 달라져 **영구 diff**를 만든다. 결정성이 필요하면 `uuidv5`, 변경 감지가 필요하면 `filemd5`/`filebase64sha256` 을 쓴다. `aws_s3_object.etag` 는 `filemd5`, KMS·16MB 초과에는 `source_hash` 다.
- `templatefile` 은 자유 형식 텍스트에, `jsonencode`/`yamlencode` 는 구조화된 데이터에 쓴다. 템플릿 안에서 리터럴 `${` 는 `$${`, `%{` 는 `%%{` 로 이스케이프한다. 시크릿은 템플릿에 굽지 않는다.

## 다음으로

- [19장 — 모듈: 재사용 단위를 설계한다](19-modules.md) — 여기서 만든 표현식을 모듈 인터페이스 뒤로 감춘다.
- [21장 — lifecycle](21-lifecycle-meta-arguments.md) — `ignore_changes` 로 남은 잡음을 봉인한다.
- [26장 — 시크릿](26-secrets-and-ephemeral.md) — 템플릿에 굽지 않고 값을 전달하는 법.
- 공식 문서: [Functions](https://developer.hashicorp.com/terraform/language/functions), [Expressions](https://developer.hashicorp.com/terraform/language/expressions)
