---
chapter: 22
level: "Level 2 — 중급"
title: "moved · removed: 상태를 깨지 않고 리팩터링하기"
difficulty: 중급
reading_time: "35분"
prerequisites: [9, 17, 19]
source_docs:
  - "website/docs/guides/version-6-upgrade.html.markdown"
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/r/nat_gateway.html.markdown"
  - "website/docs/r/subnet.html.markdown"
  - "website/docs/r/s3_bucket_versioning.html.markdown"
  - "docs/resource-identity.md"
source_url: "https://developer.hashicorp.com/terraform/language/moved"
provider_baseline: "6.x"
---

# 22장 — moved · removed: 상태를 깨지 않고 리팩터링하기

**이 장에서 배우는 것**

- 리소스 **주소**가 바뀌면 Terraform이 왜 "파괴 후 생성"으로 읽는지 plan 알고리즘 수준에서 설명할 수 있다.
- `terraform state mv` 로 하던 일을 `moved` 블록으로 옮기고, 명령형 방식이 팀·CI·다중 환경에서 어떻게 실패하는지 안다.
- `moved` 가 처리할 수 있는 이동(이름 변경, 모듈 안팎·사이, `count` -> `for_each`)과 없는 것(타입 변경, 다른 state)을 구분할 수 있다.
- `removed` 로 리소스를 코드에서만 제거하고, `import` 와 짝지어 스택 사이로 리소스를 옮길 수 있다.
- 단일 `main.tf` 를 모듈로 쪼개는 리팩터링을 백업·순서·검증이 포함된 절차서로 수행할 수 있다.

**왜 중요한가**

`aws_db_instance.main` 이라는 이름이 마음에 들지 않아 `aws_db_instance.primary` 로 바꿨다. 코드에서 바뀐 것은 라벨 한 단어뿐이고 인수는 손대지 않았다. plan을 보면 이렇게 나온다 — `Plan: 1 to add, 0 to change, 1 to destroy`. 파괴 대상은 프로덕션 데이터베이스다. `skip_final_snapshot` 이 `true` 로 되어 있었다면 최종 스냅샷조차 남지 않는다. 이름을 바꾼 대가로 데이터가 사라진다.

두 번째 장면은 더 흔하다. 300줄짜리 `main.tf` 를 `network` 모듈로 정리하는 PR이 올라왔다. 리소스 정의는 한 글자도 바뀌지 않았는데 plan은 `Plan: 22 to add, 0 to change, 22 to destroy` 를 낸다. 주소마다 `module.network.` 접두어가 붙었기 때문이다. 그대로 apply하면 VPC가 지워지고 NAT Gateway는 새 Elastic IP를 받는다. 파트너사에 등록해 둔 아웃바운드 IP 화이트리스트가 깨지고, 복구에는 서류 절차가 며칠 걸린다.

세 번째는 `count` 를 `for_each` 로 바꾸면서 온다([17장](17-count-foreach-dynamic.md)). 인덱스 주소 `[0] [1] [2]` 가 사라지고 키 주소 `["a"] ["b"] ["c"]` 가 생기므로 겹치는 주소가 하나도 없다. 서브넷 세 개를 전부 지우고 세 개를 새로 만드는 계획이 서고, 서브넷 삭제는 그 안의 ENI 때문에 거부되어 apply가 절반쯤 진행되다 `DependencyViolation` 으로 멈춘다. state는 이미 일부를 잃은 상태다. 세 사고의 원인은 하나다 — **Terraform에게 리소스의 정체성은 AWS의 실물이 아니라 코드 안의 주소다.** 이 장은 주소를 바꾸면서 실물을 건드리지 않는 두 도구, `moved` 와 `removed` 를 다룬다.

## 주소가 정체성이다

[9장](../level1-beginner/09-state-basics.md)에서 본 대로 state는 주소를 키로 삼는 목록이다. `aws_db_instance.main` 아래에 `id`, `arn`, `endpoint` 가 매달려 있고 그중 하나가 AWS의 실제 식별자다. 주소는 Terraform의 세계에서만 의미가 있다.

plan은 주소 집합을 비교하는 작업이다. **설정에만 있는 주소**는 create, **state에만 있는 주소**는 destroy, **양쪽에 있는 주소**는 속성을 비교해 no-op / update / replace가 된다.

주소를 바꾸는 순간 "state에만 있는 옛 주소"와 "설정에만 있는 새 주소"가 동시에 생긴다. Terraform은 이 둘이 같다고 추측하지 않는다 — 라벨이 비슷하다는 이유로 데이터베이스를 재활용하는 편이 훨씬 위험하기 때문이다. 주소를 바꾸는 행위 목록을 외워 두면 리뷰에서 걸러 낼 수 있다.

- 리소스 라벨 변경: `aws_vpc.main` -> `aws_vpc.this`
- 모듈로 감싸기·모듈 이름 변경·모듈 중첩 구조 변경: `aws_vpc.main` -> `module.network.aws_vpc.main`, `module.net` -> `module.network`
- `count` -> `for_each`: `aws_subnet.public[0]` -> `aws_subnet.public["ap-northeast-2a"]`
- `count` 목록의 순서 변경: `[1]` 이 가리키던 실물이 `[2]` 로 밀린다
- 모듈에 `count`/`for_each` 추가: `module.app` -> `module.app["blue"]`

반대로 **주소를 바꾸지 않는 행위**도 알아 둬야 쓸데없는 공포를 피한다. 파일을 `main.tf` 에서 `network.tf` 로 옮기는 것, 블록 순서를 바꾸는 것, 주석을 다는 것, `provider` 메타 인수로 alias를 바꾸는 것은 주소와 무관하다. 다만 v6에서 `region` 인수 값을 바꾸면 주소는 그대로여도 **교체가 일어난다**([24장](24-enhanced-region-support.md)) — 주소 문제와 교체 문제는 별개다.

## `terraform state mv`: 되던 방법과 그 한계

`moved` 블록이 생기기 전의 표준 처방은 CLI였다.

```console
$ terraform state mv aws_db_instance.main aws_db_instance.primary
Move "aws_db_instance.main" to "aws_db_instance.primary"
Successfully moved 1 object(s).
```

동작은 한다. state를 직접 열어 키 하나를 바꾸고 저장한다. 문제는 동작이 아니라 이것이 **명령형**이라는 데 있다.

**코드에 흔적이 남지 않는다.** PR에는 라벨이 바뀐 diff만 보인다. 리뷰어는 "이거 destroy 나는 거 아니냐"고 묻고 작성자는 "제가 state mv 돌렸습니다"라고 답한다. 6개월 뒤 그 대화는 사라진다.

**환경마다 따로 실행해야 한다.** dev / staging / prod면 세 번, 워크스페이스가 20개인 조직이라면 20번이다. 하나를 빠뜨리면 그 환경에서만 파괴 계획이 뜨고 보통 가장 늦게 배포되는 프로덕션에서 발견된다.

**CI에서 돌릴 수 없다.** 파이프라인은 `plan` 과 `apply` 를 돌린다. 그 사이에 "이번 한 번만 실행되는 명령"을 끼우려면 실행 여부를 기억하는 장치가 필요하고 두 번 실행되면 실패한다. 결국 사람이 로컬에서 프로덕션 state에 손을 대는 경로가 생긴다.

**머지와 실행이 원자적이지 않다.** 머지한 뒤 명령을 돌리기까지의 창에서 동료가 apply를 걸면 파괴가 일어난다. 반대 순서로 하면 명령 실행 후 머지 전까지 plan에 create가 뜬다. 되돌릴 곳은 직접 떠 둔 백업뿐이고, `terraform state push` 는 시리얼 충돌을 만들 수 있다.

`state mv` 가 유용한 자리도 있다 — 응급 복구나 폐기할 실험 워크스페이스 정리 같은 것이다. 그러나 **일상적인 리팩터링에서 먼저 꺼낼 도구는 아니다.**

## `moved` 블록

Terraform 1.1부터 설정 언어에 들어온 최상위 블록이다.

```terraform
moved {
  from = aws_db_instance.main
  to   = aws_db_instance.primary
}
```

이 블록이 있으면 plan은 "옛 주소가 state에 있으면 새 주소로 먼저 옮긴 뒤 비교하라"로 동작한다. 성질 네 가지가 이 도구를 쓸 만하게 만든다.

**선언적이다.** 코드에 있으므로 PR에서 리뷰되고 git blame으로 언제 왜 옮겼는지 추적된다.

**plan에 드러난다.** apply 전에 "이 주소로 이동한다"가 출력되고, 이동이 성립하지 않으면 destroy/create가 그대로 보여 사람이 검증할 기회가 생긴다.

**모든 state에 자동 적용된다.** 세 환경이든 스무 워크스페이스든 각자가 다음 apply에서 자기 state를 옮긴다.

**멱등이다.** `from` 주소가 state에 없으면 그 블록은 아무 일도 하지 않는다. 에러가 아니다. 이미 이동을 마친 환경에서 다시 apply해도 조용히 넘어가고, 이 성질 덕분에 블록을 한동안 남겨 둘 수 있다.

문법 제약은 짧다. `from` 과 `to` 는 **주소 리터럴**만 받는다. 변수도 함수도 `for_each` 도 쓸 수 없다. `lifecycle` 의 리터럴 제약([21장](21-lifecycle-meta-arguments.md))과 같은 이유다 — Terraform이 그래프를 만들기 **전에** 이 블록을 읽어야 한다. `to` 주소에 해당하는 리소스나 모듈 호출이 설정에 실제로 존재해야 하고, 없으면 plan이 에러로 끝난다. 파일 위치는 자유지만 관례는 `moved.tf` 하나에 모으는 것이다 — 나중에 지울 때 편하다.

## `moved` 가 처리하는 이동들

### 이름 변경과 모듈 안팎 이동

타입이 같고 라벨만 바뀌는 것이 가장 단순한 형태다. 모듈 접두어가 붙는 것도 같은 문법이며, 모듈 안에서 라벨이 달라진다면 그것까지 한 블록에 담는다.

```terraform
moved {
  from = aws_db_instance.main
  to   = aws_db_instance.primary
}

moved {
  from = aws_vpc.main
  to   = module.network.aws_vpc.this
}
```

모듈이 과하다고 판단해 인라인으로 되돌릴 때는 방향만 반대로 적는다 — `from = module.bastion.aws_instance.this`, `to = aws_instance.bastion`.

### 모듈 사이 이동과 모듈 통째 이동

모듈 호출 자체를 `from`/`to` 에 쓰면 **그 안의 모든 리소스가 한꺼번에** 따라온다. 모듈 안에 리소스가 40개여도 블록은 하나다.

```terraform
# 모듈 이름 변경. module.network -> module.platform.module.network 처럼
# 중첩 구조를 바꾸는 것도 같은 문법이다.
moved {
  from = module.net
  to   = module.network
}
```

모듈에 `for_each` 를 붙이는 것도 같은 방식이다 — `from = module.app`, `to = module.app["blue"]`.

### `count` -> `for_each`

가장 자주 필요하고 가장 자주 틀리는 이동이다. 인덱스와 키의 대응을 사람이 만들어야 한다.

```terraform
# resource "aws_subnet" "public" 의 count = 2 를 for_each = local.public_subnets 로 바꾼 뒤
moved {
  from = aws_subnet.public[0]
  to   = aws_subnet.public["ap-northeast-2a"]
}

moved {
  from = aws_subnet.public[1]
  to   = aws_subnet.public["ap-northeast-2c"]
}
```

여기서 `[0]` 이 정말 `ap-northeast-2a` 인지 **코드를 보고 추측하면 안 된다.** 목록이 재정렬됐을 수도, 누군가 `state mv` 를 돌렸을 수도 있다. 진실은 state에만 있다.

```console
$ terraform state show 'aws_subnet.public[0]' | grep -E 'availability_zone|cidr_block'
    availability_zone = "ap-northeast-2a"
    cidr_block        = "10.0.0.0/24"
```

반대 방향(`for_each` -> `count`)과 `for_each` 키 이름 변경도 같은 문법이다.

## `moved` 가 하지 못하는 것

**리소스 타입은 바꿀 수 없다.** `from = aws_instance.app`, `to = aws_spot_instance_request.app` 은 에러다. 타입이 다르면 스키마가 다르고 state의 속성 집합을 그대로 옮길 방법이 없다. `aws_s3_bucket` 안에 있던 versioning 설정을 v4에서 분리된 `aws_s3_bucket_versioning` 으로 옮기는 작업([12장](../level1-beginner/12-s3-bucket.md))도 그래서 `moved` 로 할 수 없고, `import` 로 데려와야 한다([20장](20-import-and-resource-identity.md)).

**다른 state로는 옮길 수 없다.** `moved` 는 하나의 state 안에서만 작동한다. 다른 백엔드·워크스페이스로 보내는 것은 뒤에서 다룰 `import` + `removed` 조합의 일이다.

**리소스와 모듈 호출 사이도 옮길 수 없다.** `aws_vpc.main` -> `module.network` 는 성립하지 않고, `module.network.aws_vpc.this` 처럼 **모듈 안의 리소스 주소**를 지정해야 한다.

**state에 넣거나 빼는 용도가 아니다.** 없는 것을 넣는 것은 `import`, 있는 것을 빼는 것은 `removed` 다. **표현식도 쓸 수 없다** — 서브넷 50개를 옮긴다면 블록도 50개다.

## 연쇄 이동과 `moved` 블록의 수명

같은 리소스를 두 번 옮겼다면 블록 두 개가 나란히 남는다 — `A -> B` 와 `B -> C`. Terraform은 체인을 따라간다. 첫 리팩터링 이전 상태로 남아 있던 워크스페이스는 `A -> B -> C` 를 한 번에 통과하고, 이미 `B` 인 워크스페이스는 `B -> C` 만 적용한다. 블록을 적은 순서는 상관없다. 반면 순환(`A -> B` 와 `B -> A`)은 에러이고, 같은 `from` 을 두 블록이 쓰거나 서로 다른 `from` 이 같은 `to` 로 향하는 것도 에러다.

블록을 **언제 지워도 되는가**의 기준은 하나다 — **이 코드를 쓰는 모든 state가 apply를 마쳤을 때.** 모든 환경·워크스페이스가 새 주소로 apply 됐는지(`terraform state list`), 리팩터링 이전 커밋을 체크아웃해 apply할 사람이 남아 있지 않은지(장기 브랜치와 멈춰 있는 환경이 함정이다), 모듈을 배포한다면 사용자의 state를 통제하지 못한다는 점을 감안했는지를 확인한다.

실무 규칙은 "릴리스 한 사이클을 남긴 뒤 **별도 PR로** 제거"가 무난하다. 제거 PR의 plan은 반드시 비어 있어야 한다. 비어 있지 않다면 아직 옮기지 않은 state가 남아 있다는 뜻이고, 그 PR을 머지하는 순간 그 환경은 destroy 계획을 받는다.

## plan에서 moved는 어떻게 보이는가

이동만 있고 값 변경이 없는 plan은 이런 모양이다.

```console
$ terraform plan

  # aws_db_instance.main has moved to aws_db_instance.primary
    resource "aws_db_instance" "primary" {
        id         = "db-prod-01"
        identifier = "db-prod-01"
        # (48 unchanged attributes hidden)
    }

Plan: 0 to add, 0 to change, 0 to destroy.
```

읽는 법이 있다.

- `has moved to` 항목 앞에는 `+` `-` `~` 기호가 없다. **변경이 아니라 기록**이며 AWS API 호출은 일어나지 않는다.
- 마지막 줄의 `0 to add, 0 to change, 0 to destroy` 가 리팩터링 PR의 합격 조건이다. 이동과 속성 변경을 한 PR에 섞으면 `~` 가 함께 나와 무엇이 이동 때문인지 구분하기 어려워진다.
- `moved` 를 빠뜨린 리소스가 하나 있으면 그 리소스만 destroy/create로 나타난다. 22개 중 하나를 놓치는 것이 전형적이므로 눈으로 세지 말고 CI에서 검사한다.

```bash
terraform show -json tfplan \
  | jq -e '[.resource_changes[] | select(.change.actions | index("delete"))] | length == 0'
```

리팩터링 PR에 이 검사를 강제하면 사람이 "22 to destroy"를 놓치는 경로가 닫힌다.

## `removed`: 코드에서 지우되 AWS에는 남긴다

Terraform 1.7부터의 블록이다. 리소스 블록을 지우면 기본 동작은 파괴다. 파괴하지 않고 관리만 놓고 싶을 때 `removed` 를 쓴다.

```terraform
removed {
  from = aws_ecr_repository.legacy

  lifecycle {
    destroy = false
  }
}
```

규칙이 몇 개 있다.

- **리소스 블록을 먼저 지운다.** 같은 주소에 `resource` 와 `removed` 가 동시에 존재하면 에러다.
- `lifecycle` 블록은 **필수**다. `destroy` 값을 적지 않고 넘어갈 수 없게 만들어 의도를 강제하는 설계다.
- `destroy = false` 는 state에서만 제거한다. `terraform state rm` 의 선언적 대응물이다. `destroy = true` 는 실제로 파괴하며, 리소스 블록을 그냥 지우는 것과 결과는 같지만 "의도된 파괴"임이 코드에 남는다.
- `from` 에는 **인덱스나 키를 붙이지 않는다.** 리소스 전체 또는 모듈 전체가 단위다.

모듈 통째로 제거하는 것도 한 블록이다. `from = module.legacy_bastion` 으로 적고 모듈 호출 블록을 지우면 그 안의 리소스가 몇 개든 전부 state에서만 빠진다.

`state rm` 과의 차이는 `moved` 와 `state mv` 의 차이와 같은 구조다.

| | `terraform state rm` | `removed` 블록 |
|---|---|---|
| 형태 | 명령형 CLI | 설정 블록 |
| 코드 흔적 | 없음 | 남고 리뷰된다 |
| 다중 환경 | 환경마다 수동 실행 | 각자 apply에서 자동 처리 |
| plan 확인 | 불가 (즉시 반영) | plan에 표시 후 apply |
| 파괴 여부 | 항상 state만 제거 | `destroy` 로 선택 |

수명 관리도 `moved` 와 같다 — 모든 환경이 apply를 마치면 지운다. v6 업그레이드 가이드에도 이 패턴이 나온다. `aws_api_gateway_account` 의 `reset_on_delete` 인수가 v6에서 제거되고 destroy 시 항상 API Gateway 계정 설정을 초기화하도록 바뀌었는데, **이전 동작(파괴 시 계정 설정을 건드리지 않음)을 유지하려면 `removed` 블록을 쓰라**고 안내한다. provider의 동작 변경을 사용자 쪽에서 흡수하는 도구이기도 하다는 뜻이다.

## `import` + `removed`: 스택 사이로 리소스 옮기기

`moved` 는 하나의 state 안에서만 작동한다. "네트워크 스택에 있던 VPC를 플랫폼 스택으로 옮긴다"는 요구는 두 개의 state를 건드리므로 다른 조합이 필요하다.

순서가 전부다.

1. **받는 쪽에서 `import` 먼저.** 새 스택에 리소스 블록을 쓰고 `import` 블록으로 데려온 뒤 apply. 이 시점에 리소스는 **두 state에 동시에** 들어 있다.
2. **새 스택의 plan이 빌 때까지 코드를 맞춘다.** diff가 남아 있으면 apply가 실물을 바꾼다.
3. **주는 쪽에서 `removed`.** 옛 스택에서 리소스 블록을 지우고 `removed` + `destroy = false` 를 넣어 apply한 뒤, 양쪽 plan이 모두 비어 있는지 확인한다.

```terraform
# 새 스택 (platform) — 옛 스택의 설정을 그대로 복사한다
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

import {
  to = aws_vpc.main
  id = "vpc-0a1b2c3d4e5f60718"
}
```

옛 스택(network)에서는 리소스 블록을 지우고 `removed { from = aws_vpc.main; lifecycle { destroy = false } }` 를 넣는다.

순서를 뒤집어 `removed` 를 먼저 하면 **아무도 관리하지 않는 창**이 열리고, 그 사이 장애가 나면 되돌릴 코드가 없다. 위 순서에서는 대신 **두 state가 같은 실물을 가리키는 창**이 생기므로 그동안 옛 스택의 파이프라인을 멈추고 머지를 동결한다.

출력도 함께 옮긴다. 옛 스택의 `output "vpc_id"` 를 다른 스택이 `terraform_remote_state` 로 읽고 있다면 새 스택에 output 추가 -> 소비자 전환 -> 옛 스택 output 제거 순이다. output을 먼저 지우면 소비자 스택의 plan이 깨진다.

## 실전: 단일 `main.tf` 를 network / compute 모듈로 쪼개기

리팩터링 전은 약 300줄짜리 `main.tf` 하나에 `aws_vpc.main`, `aws_subnet.public`·`aws_subnet.private`(각각 `count = 2`), `aws_internet_gateway.main`, `aws_nat_gateway.main`, `aws_route_table.public`, `aws_launch_template.app`, `aws_autoscaling_group.app`, `aws_lb.app` 이 나란히 들어 있다.

목표는 `modules/network/` 와 `modules/compute/` 로 쪼개고, 그 김에 서브넷을 `for_each` 로 바꾸고, 모듈 안 리소스 라벨을 `this` 로 통일하는 것이다. **세 가지를 한 번에 하는 것이 옳다** — 각각을 따로 하면 이동이 세 번 일어나고 `moved` 블록도 세 벌이 된다. 리팩터링 후의 `main.tf` 에는 `module "network"` 와 `module "compute"` 두 호출만 남는다.

```terraform
# moved.tf — 이 파일만 보면 무엇이 어디로 갔는지 전부 알 수 있다
moved {
  from = aws_vpc.main
  to   = module.network.aws_vpc.this
}

# count -> for_each 를 겸한다. 인덱스-키 대응은 state에서 확인했다.
moved {
  from = aws_subnet.public[0]
  to   = module.network.aws_subnet.public["ap-northeast-2a"]
}

moved {
  from = aws_subnet.public[1]
  to   = module.network.aws_subnet.public["ap-northeast-2c"]
}

moved {
  from = aws_autoscaling_group.app
  to   = module.compute.aws_autoscaling_group.this
}

# ... aws_internet_gateway, aws_nat_gateway, aws_route_table, aws_launch_template, aws_lb 도 같은 형태 ...
```

블록이 많아지면 `terraform state list` 출력을 `printf` 로 감싸 초안을 생성할 수 있다. 다만 그것은 **초안일 뿐이고**, 모듈 안에서 라벨을 바꿨거나 `count` 를 `for_each` 로 바꿨다면 `to` 를 손으로 고쳐야 한다. 생성된 블록을 읽지 않고 붙여 넣는 것이 이 작업에서 가장 위험한 습관이다.

하나 더. **모듈 안에서 기본값을 "정리"하지 않는다.** 원래 `map_public_ip_on_launch` 를 명시하지 않았는데 모듈 변수 기본값을 `true` 로 잡으면 이동과 동시에 속성 변경이 생겨 plan에 `~` 가 섞인다. 리소스에 따라서는 교체 유발 인수일 수도 있다. 리팩터링 PR의 목표는 `0 to change` 다.

## 대규모 리팩터링 절차서

주소 20개 이상을 옮기는 작업은 절차로 다룬다.

1. **동결.** 대상 스택에 apply 금지를 공지하고 PR 머지를 멈춘다. 겹치는 apply가 최대 위험이다.
2. **백업.** `terraform state pull > backup-$(date +%Y%m%d-%H%M).tfstate`. S3 백엔드라면 버저닝을 확인하고 객체 버전 ID를 기록한다([16장](16-remote-state-and-backends.md)).
3. **목록화.** `terraform state list > before.txt`. 이동 대상과 인덱스-키 대응을 여기서 확정하고, 코드 변경 + `moved` 를 작성한다. 이동만 담고 값 변경은 담지 않는다.
4. **스테이징에서 plan.** `0 to add, 0 to change, 0 to destroy` 를 확인한다. destroy가 하나라도 있으면 멈추고 매핑을 보완한다. `-refresh=false` 로 리허설한 뒤 정식 plan을 돌리면 반복이 빨라진다.
5. **스테이징 apply 후 검증.** `terraform state list > after.txt` 를 뜨고 `diff before.txt after.txt` 로 주소가 예상대로만 바뀌었는지 확인한다. PR 설명에 붙일 증거가 된다.
6. **프로덕션 plan -> 승인 -> apply.** `-out=tfplan` 으로 저장한 그 계획으로 apply한다. 나머지 환경은 순서대로 처리하고 진행 상황을 표로 추적한다.
7. **한 사이클 뒤 `moved` 제거 PR.** plan이 비어 있는지 확인하고 머지한다.

## 흔한 실수

### ❌ 리팩터링과 값 변경을 한 PR에 섞는다

이동 22건과 속성 변경 3건이 섞인 plan은 아무도 검증하지 못한다. 놓친 `moved` 하나가 destroy로 나타나도 diff 더미에 묻힌다.

```terraform
# ❌ 모듈로 옮기면서 instance_class 도 함께 올린다 (원래 db.r6g.large)
module "database" {
  source         = "./modules/database"
  instance_class = "db.r6g.xlarge"
}

# ✅ 이동 PR은 기존 값을 유지하고 값 변경은 다음 PR로 미룬다
#    합격 조건은 "0 to add, 0 to change, 0 to destroy"
```

### ❌ `count` -> `for_each` 매핑을 코드의 목록 순서로 추측한다

`var.azs` 의 순서가 곧 state의 인덱스라는 보장이 없다. 대응이 어긋나면 서브넷 A의 state가 서브넷 C의 실물에 붙고, 그 뒤의 apply는 CIDR을 바꾸려 들어 교체가 일어난다.

```terraform
# ❌ 코드만 보고 만든 매핑 (게다가 to 에는 표현식을 쓸 수 없다)
moved {
  from = aws_subnet.public[0]
  to   = aws_subnet.public[var.azs[0]]
}

# ✅ terraform state show 로 실물의 AZ를 확인하고 리터럴로 적는다
moved {
  from = aws_subnet.public[0]
  to   = aws_subnet.public["ap-northeast-2a"]
}
```

### ❌ `removed` 를 `lifecycle` 없이 쓰거나 `destroy` 의미를 뒤집어 이해한다

`destroy = true` 는 "state에서 지운다"가 아니라 "실제로 파괴한다"다. 반대로 읽고 프로덕션 데이터베이스에 걸면 그것이 마지막 apply가 된다. `lifecycle` 블록 자체를 빼면 plan이 에러로 끝난다.

```terraform
# ❌ 관리에서만 빼려던 의도인데 실물이 파괴된다
removed {
  from = aws_db_instance.legacy
  lifecycle { destroy = true }
}

# ✅ state에서만 뺀다. AWS의 실물은 그대로 남는다
removed {
  from = aws_db_instance.legacy
  lifecycle { destroy = false }
}
```

### ❌ 타입이 바뀌는 이동을 `moved` 로 시도한다

`aws_s3_bucket` 인라인 설정을 별도 리소스로 분리하는 것은 주소 이동이 아니라 **다른 타입으로의 이관**이며, `moved` 는 타입 불일치 에러를 낸다.

```terraform
# ❌ 타입이 다르면 moved 로 옮길 수 없다
moved {
  from = aws_s3_bucket.logs
  to   = aws_s3_bucket_versioning.logs
}
```

```terraform
# ✅ 새 리소스를 쓰고 import 로 데려온다
resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id
  versioning_configuration { status = "Enabled" }
}

import {
  to = aws_s3_bucket_versioning.logs
  id = "my-log-bucket"
}
```

## 프로덕션 노트

- **state 백업은 전제 조건이다.** `moved` 는 plan에서 검증되므로 `state mv` 보다 안전하지만, 잘못된 매핑을 apply해 버리면 되돌릴 곳은 백업뿐이다.
- **원격 모듈 작성자에게 `moved` 는 의무에 가깝다.** 내부 주소를 바꾸면 그 모듈을 쓰는 모든 조직의 state가 깨진다. 모듈 안에 `moved` 를 넣어 배포하고 제거는 메이저 버전 경계에서만 한다([19장](19-modules.md)).
- **Terraform 버전을 CI에서 고정한다.** `moved` 는 1.1부터, `removed` 는 1.7부터다. 파이프라인이 낮은 버전을 쓰면 블록 자체를 파싱하지 못하므로 `required_version` 에 하한을 적어 둔다.
- **destroy 감지를 CI 가드로 만든다.** `terraform show -json` 산출물에서 `delete` 액션 개수를 세어 0이 아니면 리팩터링 PR을 실패시킨다. 사람의 눈보다 정확하다.
- **진행 표를 만든다.** 워크스페이스가 열 개를 넘으면 "누가 어디까지 apply했는가"를 기억으로 관리할 수 없다. `moved` 제거 시점의 근거도 이 표다.

## 연습문제

**1. 파괴를 재현하고 막는다.** VPC와 서브넷을 만든 뒤 라벨을 바꾸고 plan을 뜬다. 그다음 `moved` 를 넣고 다시 plan을 뜬다.
*성공 기준:* 첫 plan의 `N to add / N to destroy` 와 두 번째 plan의 `0 to add, 0 to change, 0 to destroy` 를 나란히 제시하고 `has moved to` 줄을 짚을 수 있다.

**2. `count` -> `for_each` 를 state 근거로 옮긴다.** `count = 3` 인 서브넷을 만들고 `terraform state show` 로 각 인덱스의 AZ를 확인한 뒤 `for_each` 로 전환한다.
*성공 기준:* 인덱스-키 대응의 근거를 `state show` 출력으로 제시하고, 전환 후 각 서브넷의 `id` 가 전환 전과 동일함을 보인다.

**3. 모듈로 쪼갠다.** 인라인 VPC + IGW + 서브넷 2개를 `modules/network/` 로 옮기면서 모듈 안 라벨을 `this` 로 통일한다.
*성공 기준:* `moved.tf` 하나로 모든 이동이 표현되고 plan이 비어 있으며, apply 후 `before.txt` / `after.txt` diff에 주소 변경만 나타난다.

**4. 스택을 갈라 리소스를 옮긴다.** 별도 state를 갖는 두 디렉터리를 만들고 한쪽의 S3 버킷을 다른 쪽으로 옮긴다.
*성공 기준:* `import` -> plan 비움 -> `removed` 순서의 기록을 제시하고, 작업 후 양쪽 plan이 비어 있으며 버킷이 삭제되지 않았음을 확인한다.

## 요약

- Terraform에게 리소스의 정체성은 AWS 실물이 아니라 **state의 주소**다. 주소가 바뀌면 plan은 옛 주소를 destroy, 새 주소를 create로 계산한다. 라벨 변경, 모듈로 감싸기·꺼내기, 모듈 이름·계층 변경, `count` -> `for_each`, 모듈에 `for_each` 추가가 모두 주소를 바꾸며, 파일 이동·블록 순서 변경·주석은 바꾸지 않는다.
- `terraform state mv` 는 명령형이다. 코드에 흔적이 없고, 환경마다 수동 실행이 필요하며, CI에서 돌릴 수 없고, 머지와 실행 사이에 창이 열린다.
- `moved` 블록(Terraform 1.1+)은 선언적이고, plan에 드러나고, 모든 state에 자동 적용되며, `from` 이 state에 없으면 no-op이라 **멱등**이다. `from`/`to` 는 주소 리터럴만 받는다.
- `moved` 로 할 수 없는 것: **리소스 타입 변경**, 다른 state로의 이동, 리소스와 모듈 호출 사이의 이동, state에 넣거나 빼기, 표현식 사용. 타입이 바뀌는 이관은 `import` 로 처리한다.
- 연쇄 이동(`A -> B`, `B -> C`)은 체인으로 처리되고 순환과 `from`/`to` 중복은 에러다. 블록은 **모든 환경이 apply를 마친 뒤** 별도 PR로 제거하며, 공개 모듈이라면 메이저 버전 경계까지 남긴다.
- `removed` 블록(Terraform 1.7+)은 `lifecycle { destroy = false }` 로 state에서만 제거하고 `destroy = true` 는 실제 파괴다. `from` 에는 인덱스를 붙이지 않으며 모듈 전체도 한 블록으로 제거된다. v6 업그레이드 가이드는 `aws_api_gateway_account` 의 destroy 동작 변경을 흡수하는 방법으로 이 블록을 안내한다.
- 스택 사이 이동은 **받는 쪽 `import` -> plan 비움 -> 주는 쪽 `removed`** 순서다. 뒤집으면 아무도 관리하지 않는 창이 생기고, 이 순서에서는 두 state가 겹치는 창이 생기므로 그동안 옛 스택의 apply를 멈춘다. 리팩터링의 합격 조건은 plan의 `0 to add, 0 to change, 0 to destroy` 한 줄이며, 이동 PR과 값 변경 PR은 분리한다.

## 다음으로

- [23장 — 태깅 전략 심화: ignore_tags · 개별 태그 리소스 · 태그 정책](23-tagging-strategy.md) — 코드가 아닌 외부 시스템이 만드는 diff를 다루는 법.
- [20장 — Import와 Resource Identity](20-import-and-resource-identity.md) — 타입이 바뀌는 이관과 스택 간 이동의 앞쪽 절반.
- [38장 — 대규모 코드 구조와 CI/CD 파이프라인](../level3-advanced/38-large-scale-structure-cicd.md) — 리팩터링 가드를 파이프라인에 심는 방법.
- 공식 문서: [Refactoring — moved](https://developer.hashicorp.com/terraform/language/moved) / [Removing Resources](https://developer.hashicorp.com/terraform/language/resources/syntax#removing-resources)
