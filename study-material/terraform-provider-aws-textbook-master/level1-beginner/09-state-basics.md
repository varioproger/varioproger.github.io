---
chapter: 9
level: "Level 1 — 초급"
title: "State 입문: Terraform이 기억하는 것"
difficulty: 입문
reading_time: "28분"
prerequisites: [5, 6]
source_docs:
  - "website/docs/r/vpc.html.markdown"
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/d/ssm_parameter.html.markdown"
  - "website/docs/d/secretsmanager_secret_version.html.markdown"
  - "docs/id-attributes.md"
  - "docs/resource-identity.md"
  - "website/docs/guides/enhanced-region-support.html.markdown"
source_url: "https://developer.hashicorp.com/terraform/language/state"
provider_baseline: "6.x"
---

# 9장 — State 입문: Terraform이 기억하는 것

**이 장에서 배우는 것**

- state가 필요한 세 가지 이유(주소 매핑, 성능, 메타데이터)를 설명하고, 각각이 없으면 무엇이 불가능해지는지 말할 수 있다.
- `terraform.tfstate` 의 `version`, `serial`, `lineage`, `resources[]` 를 읽고 항목 하나를 해부할 수 있다.
- plan이 만들어지는 세 단계를 구분하고, drift가 plan 출력의 어느 자리에 어떤 모양으로 나타나는지 안다.
- `terraform show`, `terraform state list`, `terraform state show` 로 state를 조회하고 리소스 주소 문법을 정확히 쓸 수 있다.
- state를 **변경**하는 명령(`state mv`, `state rm`)이 왜 위험한지 알고 백업과 함께 다룰 수 있다.
- state에 민감 값이 평문으로 들어간다는 사실을 설명하고, 로컬 state의 세 가지 한계를 말할 수 있다.

**왜 중요한가**

Terraform이 하는 일을 한 문장으로 줄이면 "설정과 AWS의 현실을 비교해 차이를 없앤다"이다. 그런데 비교하려면 **무엇과 무엇을 비교할지** 알아야 한다. 설정에는 `aws_vpc.main` 이라고 적혀 있고 AWS에는 `vpc-0a1b2c3d4e5f67890` 이 있다. 이 둘이 같은 것이라고 아무도 말해 주지 않으면 다음 apply에서 VPC가 하나 더 생긴다. 그 매핑을 적어 두는 파일이 state다.

state를 잃은 팀에 무슨 일이 일어나는지는 구체적이다. 로컬에만 `terraform.tfstate` 를 두던 팀원의 노트북이 죽는다. 코드는 Git에 있으니 다른 사람이 clone해서 apply를 돌린다. Terraform은 아무것도 모르므로 VPC, subnet 6개, NAT Gateway 3개, ALB, RDS를 **전부 새로 만들려고 한다.** 이름이 겹쳐 `AlreadyExists` 로 실패하면 그나마 낫고, 이름 충돌이 없는 NAT Gateway는 실제로 3개가 더 생겨 요금이 두 배가 된다. 원래 있던 리소스들은 **Terraform이 존재를 모르는 유령**이 되어 destroy로도 정리되지 않는다.

## state가 하는 일 세 가지

state를 "만든 리소스 목록"으로만 이해하면 절반이다. 실제로는 서로 다른 세 문제를 푼다.

### 1. 설정의 주소와 AWS 객체 ID를 잇는 매핑

```terraform
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
```

이 리소스의 **주소**는 `aws_vpc.main` 이고 AWS 쪽에는 `vpc-0a1b2c3d4e5f67890` 이 있다. state는 이 둘을 잇는 줄을 기록하며 이후 모든 동작이 그 줄 위에서 일어난다 — plan은 이 ID로 조회하고, apply는 이 ID로 수정하고, destroy는 이 ID로 삭제한다.

매핑은 **이름에 걸려 있지 값에 걸려 있지 않다.** 이름을 `main` 에서 `primary` 로 바꾸면 Terraform이 보기에는 하나가 사라지고 하나가 새로 생긴 것이라 "1 to add, 1 to destroy"가 뜬다. 이 문제를 코드로 푸는 것이 `moved` 블록이다([22장](../level2-intermediate/22-moved-removed-refactoring.md)).

그 "ID"가 무엇인지는 리소스마다 다르다. 역사적으로 모든 리소스에 읽기 전용 `id` 속성이 있었지만(Plugin SDK v2가 요구했다), Plugin Framework로 넘어오면서 `id` 는 필수가 아니게 되었고 신규 리소스는 그것이 다른 인수와 중복되면 생략하는 것이 표준이다. 대신 Terraform 1.12부터 **Resource Identity**라는 구조화된 식별 정보가 함께 저장된다([20장](../level2-intermediate/20-import-and-resource-identity.md)).

### 2. 성능 — 매번 전수 조회하지 않기

state가 없다면 plan마다 "이 계정의 모든 VPC를 나열하고 그중 내 설정과 맞는 것을 찾아라"를 해야 한다. 리소스가 수백 개면 서비스마다 `Describe*` 를 전수 호출하게 되고, 스로틀링(`RequestLimitExceeded`)이 시작되면 plan 자체가 실패한다. state가 있으면 조회는 **정확한 ID로 하나씩**이다. 그래도 리소스 1,000개면 호출도 1,000번이므로 대형 스택용 `-refresh=false` 가 존재한다([40장](../level3-advanced/40-performance-and-throttling.md)).

### 3. 메타데이터 — 의존성, provider, 스키마 버전

각 항목에는 **의존성 목록**이 함께 저장된다. 코드에서 subnet과 VPC를 동시에 삭제하면 Terraform은 설정을 보고 의존 관계를 만들 수 없다 — 설정에 아무것도 남아 있지 않기 때문이다. 이때 **state에 남은 의존성 기록**이 "subnet 먼저, VPC 나중에"라는 순서를 준다. [6장](06-references-and-dependencies.md)의 그래프가 destroy 시점까지 살아남는 방법이 state다.

각 항목에는 **provider 주소**와 **스키마 버전**(`schema_version`)도 붙는다. provider 업그레이드로 속성의 저장 형태가 바뀌면 provider는 이 버전을 보고 옛 형식을 업그레이드해 읽는다. 이 조용한 마이그레이션 덕분에 버전을 올려도 state가 깨지지 않는다.

## `terraform.tfstate` 를 열어 보기

`backend` 설정이 없으면 state는 작업 디렉터리의 `terraform.tfstate` 이며, 그냥 JSON이다.

```json
{
  "version": 4,
  "terraform_version": "1.13.3",
  "serial": 7,
  "lineage": "8f2a1c33-7b41-4d0e-9a56-2c1f8e4b7d90",
  "resources": [
    {
      "mode": "managed",
      "type": "aws_vpc",
      "name": "main",
      "provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
      "instances": [
        {
          "schema_version": 1,
          "attributes": {
            "cidr_block": "10.0.0.0/16",
            "id": "vpc-0a1b2c3d4e5f67890",
            "owner_id": "123456789012",
            "region": "ap-northeast-2",
            "tags": { "Name": "main" },
            "tags_all": { "Environment": "prod", "Name": "main" }
          },
          "sensitive_attributes": [],
          "dependencies": []
        }
      ]
    }
  ],
  "check_results": null
}
```

**`version`** 은 **state 파일 포맷의 버전**이다. Terraform 1.x는 `4` 를 쓴다. provider 버전과도 Terraform 버전과도 무관하며, 이 숫자가 우리 Terraform이 아는 것보다 크면 읽기를 거부한다.

**`terraform_version`** 은 이 state를 마지막으로 쓴 Terraform 버전이다. 누군가 1.14로 apply하면 1.9를 쓰는 팀원은 그 state를 열지 못한다. **버전은 앞으로만 간다** — Terraform 버전을 팀에서 고정해야 하는 이유가 이 필드다.

**`serial`** 은 저장될 때마다 1씩 증가하는 정수, **`lineage`** 는 state가 처음 만들어질 때 한 번 생성되고 변하지 않는 UUID다. 둘의 쓸모는 뒤에서 다룬다.

**`outputs`** 는 [7장](07-variables-outputs-locals.md)의 `output` 값이 그대로 저장된 것이다. `terraform output` 이 AWS에 묻지 않고 즉시 답하는 이유이고, 다른 스택이 `terraform_remote_state` 로 읽는 것도 이 부분이다. **`check_results`** 는 `check` 블록의 마지막 실행 결과 자리다([36장](../level3-advanced/36-drift-refresh-and-checks.md)).

## `resources[]` 한 항목 해부하기

**`mode`** 는 `managed` 또는 `data` 다. 데이터 소스도 state에 들어간다 — 매 refresh마다 새로 읽히므로 "지난번에 읽은 값"에 가깝지만 파일에는 남는다. [8장](08-data-sources.md)에서 말한 대로 **시크릿 데이터 소스의 값도 여기에 평문으로 남는다.**

**`type`** 과 **`name`** 은 설정에 적은 두 레이블이며 `mode`+`type`+`name`+(모듈 경로)가 곧 리소스 주소다. **`provider`** 는 완전한 provider 주소이고 alias를 쓰면 뒤에 `.replica` 처럼 붙는다. `terraform state replace-provider` 가 건드리는 것이 이 문자열이다.

**`instances`** 가 배열인 이유는 `count` 나 `for_each` 가 블록 하나로 인스턴스 여러 개를 만들기 때문이다. 각 인스턴스에는 `index_key` 가 붙는다 — `count` 면 정수, `for_each` 면 문자열 키다.

**`attributes`** 는 이 리소스의 **모든 속성값**이다. 우리가 쓴 인수뿐 아니라 AWS가 계산해 돌려준 것까지 전부 들어 있어서 `aws_vpc.main.arn` 같은 참조가 가능해진다. v6에서는 `region` 도 여기 저장되며, 설정에서 `region` 을 지워도 리소스가 교체되지 않는 이유가 이것이다 — state에 값이 있으니 provider가 그것을 계속 쓴다([24장](../level2-intermediate/24-enhanced-region-support.md)).

**`sensitive_attributes`** 는 민감으로 표시된 속성의 경로 목록이다. **출력을 가리는 표시일 뿐 암호화가 아니다.** **`dependencies`** 는 의존하는 리소스 주소 목록으로 destroy 순서의 근거다. `private` 필드는 provider 내부 데이터를 base64로 넣어 둔 자리이니 사람이 해석할 것이 아니다.

## plan은 세 단계로 만들어진다

`terraform plan` 을 "AWS와 코드를 비교하는 것"이라고 대충 알고 있으면 drift가 뜰 때 해석이 안 된다. 실제로는 세 단계다.

**1단계 — 설정 읽기.** `.tf` 를 파싱하고 변수를 채우고 표현식을 평가해 그래프를 만든다. AWS는 건드리지 않는다.

**2단계 — refresh.** state에 적힌 각 ID로 `Describe*`/`Get*` 를 호출해 실제 값을 읽고 `attributes` 를 덮어쓴다. 갱신되는 것은 **메모리 안의 state**이고 `plan` 만 돌렸다면 파일은 바뀌지 않는다. AWS에 없는 리소스가 발견되면 사라진 것으로 취급되어 plan에 "다시 만들기"로 나타난다.

**3단계 — diff.** "원하는 상태"와 "갱신된 state"를 속성 단위로 비교한다. plan 출력의 기호가 그 결과다.

| 기호 | 의미 |
|---|---|
| `+` | 새로 만든다 |
| `~` | 제자리에서 고친다 |
| `-/+` | 지우고 다시 만든다 (ForceNew 인수가 바뀜) |
| `-` | 지운다 |
| `<=` | 데이터 소스를 읽는다 |

세 단계를 분리해 이해해야 하는 이유는 **각 단계를 따로 끌 수 있기 때문**이다. `plan -refresh=false` 는 2단계를 건너뛴다 — plan은 빨라지지만 **drift를 보지 못한다.** `plan -refresh-only` 는 반대로 설정과의 비교 없이 2단계에서 발견한 차이만 보여 준다.

## drift: state와 현실이 어긋날 때

**drift**는 state에 적힌 값과 AWS의 실제 값이 다른 상태이며 원인은 늘 Terraform 밖에 있다 — 사람이 콘솔에서 바꿨거나, 다른 자동화나 AWS 서비스가 태그·규칙을 붙였거나, 다른 스택이 같은 리소스를 건드렸다. drift는 refresh 단계에서 발견되고 plan에 이런 모양으로 나타난다.

```console
$ terraform plan
Note: Objects have changed outside of Terraform

  # aws_vpc.main has been changed
  ~ resource "aws_vpc" "main" {
      ~ tags = {
          + "Owner" = "manual-edit"
        }
    }

Terraform will perform the following actions:

  # aws_vpc.main will be updated in-place
  ~ resource "aws_vpc" "main" {
      ~ tags = {
          - "Owner" = "manual-edit" -> null
        }
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

**블록이 두 개**라는 점이 핵심이다. 위쪽 "Objects have changed outside of Terraform"은 refresh가 발견한 drift이고, 아래쪽은 그것을 되돌리는 계획이다. 둘을 구분하지 못하면 "변경 하나에 왜 diff가 두 번 나오지?" 하고 혼란스러워진다. 태그가 이렇게 잡히는 이유는 provider가 태그를 **전량 관리**하기 때문이며 [10장](10-tags-basics.md)에서 다룬다.

설정이 그 속성을 지정하지 않았다면 drift는 위쪽 블록에만 나타나고 실행 계획은 비어 있을 수 있다. `lifecycle { ignore_changes }` 나 provider의 `ignore_tags` 가 걸린 속성은 아예 diff에 오르지 않는다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md), [23장](../level2-intermediate/23-tagging-strategy.md)).

되돌릴 생각이 없고 **현실을 정답으로 받아들이고 싶을 때** 쓰는 것이 refresh-only다.

```console
$ terraform plan -refresh-only     # 무엇이 어긋났는지만 본다
$ terraform apply -refresh-only    # state를 현실에 맞춘다 (AWS는 건드리지 않는다)
```

`apply -refresh-only` 는 **AWS에 아무 변경도 가하지 않고 state 파일만 갱신한다.** 물론 코드를 함께 고치지 않으면 다음 plan이 다시 되돌리기를 계획한다.

## `terraform refresh` 는 왜 물러났나

옛 명령 `terraform refresh` 는 **묻지 않고 state를 덮어썼다.** refresh는 명백히 state를 변경하는 작업인데 plan처럼 가벼운 조회 명령의 얼굴을 하고 있었던 것이 문제였다 — 콘솔에서 누가 리소스를 지웠다면 확인 없이 그 항목을 state에서 제거한다.

그래서 지금 권장되는 형태가 `terraform apply -refresh-only` 다. 동작은 거의 같지만 **계획을 먼저 보여 주고 승인을 받는다.** `terraform refresh` 는 지금도 실행되지만 deprecated 경고가 나오며, 자동화에서는 `-auto-approve` 를 붙여 쓴다.

## state를 읽는 명령

state 명령은 **읽는 것**과 **쓰는 것**으로 갈린다. 읽는 쪽은 아무리 돌려도 안전하다.

**`terraform state list`** 는 관리 중인 리소스 주소를 한 줄에 하나씩 출력한다. 가장 자주 쓰는 명령이다.

```console
$ terraform state list
data.aws_availability_zones.available
aws_subnet.private["a"]
aws_subnet.public[0]
aws_vpc.main
module.db.aws_db_instance.main

$ terraform state list aws_subnet     # 타입/모듈로 필터할 수 있다
```

**`terraform state show <주소>`** 는 한 리소스의 속성 전체를 읽기 좋은 형태로 보여 준다.

```console
$ terraform state show aws_vpc.main
# aws_vpc.main:
resource "aws_vpc" "main" {
    arn                       = "arn:aws:ec2:ap-northeast-2:123456789012:vpc/vpc-0a1b..."
    cidr_block                = "10.0.0.0/16"
    id                        = "vpc-0a1b2c3d4e5f67890"
    tags                      = { "Name" = "main" }
    tags_all                  = { "Environment" = "prod", "Name" = "main" }
}
```

문서에서 속성 목록을 찾기 전에 실물을 보는 가장 빠른 방법이며, `tags` 와 `tags_all` 의 차이를 확인하기 좋다. 민감으로 표시된 속성은 `(sensitive value)` 로 가려질 수 있다 — **가려졌다고 파일에 없는 것이 아니다.**

**`terraform show`** 는 state 전체를 출력한다. `-json` 은 스크립트와 정책 검사(OPA, Conftest 등)의 입력이 되는 기계용 표현이고, 인수로 plan 파일을 주면 그 plan을 읽는다.

```console
$ terraform show
$ terraform show -json | jq '.values.root_module.resources[].address'
$ terraform show tfplan
```

**`terraform show -json` 출력에는 민감값이 그대로 들어간다.** CI 로그에 찍지 않는다.

## 리소스 주소 문법: `state list` 가 가르쳐 주는 것

`terraform state list` 의 출력은 그 자체로 주소 문법 교재다. 이 표기는 `-target`, `moved`/`import` 블록, 에러 메시지에서 똑같이 쓰인다.

| 형태 | 의미 |
|---|---|
| `aws_vpc.main` | 관리 리소스 |
| `data.aws_ami.al2023` | 데이터 소스 — 앞에 `data.` |
| `aws_subnet.public[0]` | `count` 인스턴스 — 정수 인덱스 |
| `aws_subnet.private["a"]` | `for_each` 인스턴스 — 문자열 키 |
| `module.network.aws_vpc.main` | 모듈 안의 리소스 |

셸에서 대괄호와 큰따옴표는 반드시 감싼다. 작은따옴표를 빼면 셸이 `[` 를 글로브로, `"` 를 따옴표로 먹어 버려 "주소를 찾을 수 없다"는 엉뚱한 에러가 난다.

```console
$ terraform state show 'aws_subnet.private["a"]'
$ terraform apply -target='module.network.aws_subnet.public[0]'
```

## state를 바꾸는 명령 — 그리고 왜 위험한가

여기서부터는 성격이 다르다. 이 명령들은 **AWS를 건드리지 않고 state만 고친다.** "Terraform이 세상을 어떻게 인식하는가"를 사람이 직접 조작하는 것이므로, 잘못하면 코드와 현실의 대응이 깨진다.

**`terraform state mv <원래주소> <새주소>`** — 항목의 주소를 바꾼다. 리소스 이름 변경이나 모듈 이동을 재생성 없이 따라가게 한다.

```console
$ terraform state mv aws_vpc.main aws_vpc.primary
$ terraform state mv aws_vpc.main module.network.aws_vpc.main
```

**`terraform state rm <주소>`** — state에서 항목을 지운다. **AWS의 실물은 그대로 남는다.** 관리에서만 빼는 용도이며, 지운 뒤 설정에 블록이 남아 있으면 다음 plan은 그것을 **새로 만들려고 한다.**

세 명령 모두 실행 전에 현재 state를 **`terraform.tfstate.backup`** 으로 복사한다(`-backup=<경로>` 로 위치 지정 가능). 중요한 것은 백업이 **직전 한 벌만** 남는다는 점이다 — 잘못된 `state rm` 을 두 번 돌리면 첫 백업이 덮인다. 위험한 조작 전에는 따로 떠 두는 것이 습관이어야 한다.

```console
$ terraform state pull > backup-$(date +%s).tfstate
```

요즘은 이 명령들 대부분을 **코드로 대체할 수 있다.** 이름·모듈 이동은 `moved`, 관리 해제는 `removed`, 기존 리소스 편입은 `import` 블록이다. 코드로 하면 plan에 나타나고 리뷰를 거치며 Git 이력에 남는다 — CLI 조작은 그중 어느 것도 남기지 않는다([22장](../level2-intermediate/22-moved-removed-refactoring.md)).

## state에는 비밀이 평문으로 들어간다

추측이 아니라 provider 문서가 명시하는 사실이다. `aws_db_instance` 의 `password` 설명은 이 값이 로그에 보일 수 있으며 **state 파일에 저장된다**고 적고, `aws_ssm_parameter` 데이터 소스 문서는 state의 민감 데이터 문서를 링크하며 같은 경고를 한다. `aws_secretsmanager_secret_version` 데이터 소스로 읽은 `secret_string` 은 시크릿의 **내용 자체**이며 그대로 `attributes` 에 들어간다.

`sensitive_attributes` 목록과 `output` 의 `sensitive = true` 는 **CLI 출력을 가리는 표시**일 뿐 파일은 암호화되지 않는다. 정리하면 이렇다.

- state를 읽을 수 있는 사람 = 그 인프라의 모든 비밀을 읽을 수 있는 사람.
- **state는 Git에 커밋하지 않는다.** `.gitignore` 에 `*.tfstate`, `*.tfstate.*`, `.terraform/` 을 넣는다.
- CI 로그에 `terraform show -json` 이나 state 덤프를 찍지 않고, 원격 백엔드에는 **저장 시 암호화**(S3 SSE-KMS)와 **접근 통제**를 함께 건다([16장](../level2-intermediate/16-remote-state-and-backends.md)).

근본적인 회피 수단도 v6에 있다. **ephemeral 리소스**와 **write-only 인수**는 값을 state에 남기지 않는다. `aws_db_instance` 라면 `password` 대신 `password_wo` 를 쓰거나 `manage_master_user_password = true` 로 AWS에 맡기는 선택지가 있다([26장](../level2-intermediate/26-secrets-and-ephemeral.md)).

## `serial`, `lineage`, 그리고 손으로 편집하면 안 되는 이유

두 필드는 장식이 아니라 **안전장치**다.

**`serial`** 은 저장할 때마다 증가하는 판번호다. 원격 백엔드는 쓰기 전에 "내가 읽은 serial이 지금 저장된 것과 같은가"를 확인하고, 다르면 그 사이에 누군가 apply했다는 뜻이므로 거부한다. 낙관적 잠금의 근거다.

**`lineage`** 는 state가 처음 만들어질 때 생성되고 절대 바뀌지 않는 UUID로, 두 state가 **같은 혈통인지**를 판정한다. dev 스택의 state를 실수로 prod 백엔드에 push하면 lineage가 다르므로 Terraform이 거부한다 — 이 한 줄이 "다른 환경의 state를 덮어써 인프라 전체를 유령으로 만드는" 사고를 막는다.

이제 파일을 손으로 고치면 안 되는 이유가 분명해진다.

1. **`serial` 을 올리지 않으면** 원격 백엔드가 변경을 인식하지 못하거나 거부한다.
2. **JSON 하나만 틀려도 state 전체를 못 읽는다.** 쉼표 하나에 스택 전부가 인질이 된다.
3. **`dependencies` 나 `schema_version` 을 손대면** destroy 순서가 깨지거나 provider의 state 업그레이드 로직이 잘못된 형식을 읽는다.
4. **의도가 이력에 남지 않는다.** 왜 그렇게 고쳤는지 아무도 모른다.

state를 고쳐야 하는 상황은 실제로 있다. 다만 그때 쓰는 도구는 편집기가 아니라 `terraform state` 하위 명령이거나 `moved`/`import`/`removed` 블록이다.

## 로컬 state의 세 가지 한계

지금까지 다룬 `terraform.tfstate` 는 작업 디렉터리에 있는 파일이다. 혼자 실습할 때는 충분하지만 팀에서는 셋이 동시에 무너진다.

**1. 동시성.** 두 사람이 동시에 apply하면 각자 자기 파일을 고친다. 나중에 저장한 쪽이 상대의 기록을 덮어쓰고, 덮인 쪽이 만든 리소스는 유령이 된다. 잠금이 없으니 경고도 없다.

**2. 유실.** 노트북 하나에만 있는 파일이다. 코드가 Git에 있어도 복구되지 않는다 — 코드는 "무엇을 원하는가"만 알고 "그것이 지금 어느 리소스인가"는 모른다.

**3. 공유 불가.** 다른 팀원은 plan조차 제대로 돌릴 수 없고 다른 스택이 `terraform_remote_state` 로 output을 읽을 수도 없다. CI는 매번 빈 state에서 시작한다.

셋을 한꺼번에 해결하는 것이 **원격 백엔드**다. S3에 state를 두고 잠금을 걸면 동시 실행이 직렬화되고, 버전 관리와 암호화가 붙고, 권한이 있는 사람과 CI가 같은 state를 본다.

## 흔한 실수

### ❌ state 파일을 Git에 커밋한다

"공유해야 하니까"라는 이유로 커밋하면 비밀번호와 시크릿이 저장소에 평문으로 남고, 두 사람이 각자 apply한 state가 merge conflict로 나타난다. 손으로 해결한 state는 거의 항상 망가져 있다.

```bash
# ✅ .gitignore — state는 무시하고 .terraform.lock.hcl 은 반대로 커밋한다
*.tfstate
*.tfstate.*
.terraform/
```

공유가 필요하면 파일이 아니라 `backend "s3"` 블록으로 한다([16장](../level2-intermediate/16-remote-state-and-backends.md)).

### ❌ 이름을 바꾸고 재생성 계획을 그냥 승인한다

주소가 바뀌었을 뿐인데 plan에 destroy가 뜬다. 그대로 apply하면 NAT Gateway든 RDS든 실제로 지워졌다 다시 만들어진다.

```terraform
# ❌ 이름만 바꿨는데 plan: 1 to add, 1 to destroy
resource "aws_nat_gateway" "primary" { # 원래 이름은 "main"
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
}
```

```terraform
# ✅ moved 블록으로 주소 이동을 코드에 남긴다 (plan: no changes)
moved {
  from = aws_nat_gateway.main
  to   = aws_nat_gateway.primary
}
```

### ❌ plan이 느리다고 `-refresh=false` 를 CI 기본값으로 박는다

plan은 빨라지고 팀은 눈이 먼다. 콘솔에서 열린 `0.0.0.0/0` 규칙도, 누가 지워 버린 리소스도 보이지 않는다.

```bash
# ❌ 파이프라인 기본값
terraform plan -refresh=false -out=tfplan

# ✅ 평소에는 refresh를 켜고, drift 점검을 따로 돌린다
terraform plan -out=tfplan
terraform plan -refresh-only -detailed-exitcode   # 변경 있으면 종료 코드 2
```

### ❌ `terraform state rm` 으로 "문제를 없앤다"

알 수 없는 diff가 날 때 항목을 지우는 대처는 문제를 없애는 게 아니라 **보이지 않게** 만든다. 실물은 남고, 설정도 남아 있으면 다음 plan이 같은 것을 하나 더 만든다.

```console
# ❌ 이해하지 못한 채 지운다
$ terraform state rm aws_db_instance.main
$ terraform apply     # 같은 이름이면 실패, 이름이 다르면 DB가 하나 더 생긴다
```

```console
# ✅ 먼저 무엇이 어긋났는지 확인하고, 백업부터 뜬다
$ terraform state show aws_db_instance.main
$ terraform plan -refresh-only
$ terraform state pull > backup-$(date +%s).tfstate
```

```terraform
# ✅ 관리만 해제하려면 removed 블록으로 의도를 코드에 남긴다
removed {
  from = aws_db_instance.main
  lifecycle {
    destroy = false
  }
}
```

## 프로덕션 노트

- **state 크기는 성능 문제로 자란다.** 모든 속성이 저장되므로 리소스 수백 개짜리 스택의 state는 수 MB가 되고, plan마다 이 JSON을 전부 파싱하며 원격 백엔드라면 매번 내려받고 올린다. 스택을 기능 단위(network / data / app)로 쪼개는 가장 실용적인 이유는 blast radius가 아니라 **plan 시간**인 경우가 많다.
- **백업은 직전 한 벌뿐이다.** `terraform.tfstate.backup` 은 다음 조작에 덮인다. 원격 백엔드라면 **S3 버킷 버저닝**이 사실상 유일한 복구 수단이므로 켜져 있는지 오늘 확인해 둔다.
- **state 접근 권한은 인프라 관리자 권한과 같다.** 읽으면 시크릿을 읽고, 쓰면 다음 apply의 동작을 조작할 수 있다. 버킷 정책과 KMS 키 정책을 "누가 배포할 수 있는가"와 같은 기준으로 설계한다.
- **drift 점검을 정기 작업으로 만든다.** `terraform plan -refresh-only -detailed-exitcode` 는 변경이 있으면 종료 코드 `2` 를 준다. 야간 배치로 돌려 알림을 보내면 "콘솔에서 누가 뭘 바꿨다"를 사고가 아니라 알림으로 만난다.
- **Terraform 버전을 팀 전체에서 고정한다.** state의 `terraform_version` 은 앞으로만 간다. 한 사람이 최신 버전으로 apply하면 나머지 팀원과 CI가 그 state를 열지 못한다. `required_version` 과 CI 이미지 버전을 함께 관리한다.

## 연습문제

**1. state 구조 읽기.** VPC 하나와 `for_each` 로 만든 subnet 두 개를 apply한 뒤 `terraform.tfstate` 를 직접 열어 본다.
*성공 기준:* `version`, `serial`, `lineage` 를 찾아 각각의 의미를 한 줄씩 적는다. subnet 항목의 `instances` 가 두 개이고 각각 `index_key` 를 가짐을 확인하고, `aws_vpc` 의 `attributes` 에서 설정에 쓰지 않은 속성 세 개를 골라 적는다.

**2. drift 만들고 관찰하기.** 위 VPC에 콘솔이나 AWS CLI로 태그 `Owner = manual` 을 붙인다.
*성공 기준:* `terraform plan` 출력에서 "Objects have changed outside of Terraform" 블록과 실행 계획 블록을 구분해 설명한다. `terraform apply -refresh-only` 실행 후 다시 plan을 돌려 무엇이 달라졌는지, 왜 그런지 세 줄로 정리한다.

**3. 시크릿이 남는 것 확인하기.** `aws_ssm_parameter` 를 `type = "SecureString"` 으로 만들고 데이터 소스로 다시 읽는다(테스트 값으로만 한다).
*성공 기준:* `terraform state show` 출력에서 값이 가려지는지 확인하고, `terraform.tfstate` 안에서 그 값을 문자열로 검색해 **평문으로 존재함**을 확인한다. 끝나면 destroy하고 state와 백업 파일을 모두 지운다.

## 요약

- state는 리소스 주소와 AWS 객체 ID의 **매핑**, 전수 조회를 피하는 **성능**, 의존성·provider·스키마 버전 같은 **메타데이터**를 동시에 담는다. plan은 **설정 읽기 → refresh → diff 계산**의 세 단계이며 `-refresh=false` 는 2단계를 뺀다.
- `terraform.tfstate` 는 JSON이며 `version`(포맷 버전, 1.x는 4), `terraform_version`, `serial`, `lineage`, `outputs`, `resources[]` 로 구성된다. 각 항목은 `mode`/`type`/`name`/`provider`/`instances` 를, 인스턴스는 `schema_version`/`attributes`/`dependencies` 를 가진다.
- drift는 Terraform 밖에서 값이 바뀐 상태이며 plan의 "Objects have changed outside of Terraform" 블록에 나타난다. 되돌리지 않고 인정하려면 `terraform apply -refresh-only` 를 쓴다.
- 조회 명령(`show`, `state list`, `state show`)은 안전하지만, 변경 명령(`state mv`, `state rm`, `state replace-provider`)은 AWS가 아니라 인식만 바꾸므로 위험하다. `terraform.tfstate.backup` 은 **직전 한 벌뿐**이다. `terraform refresh` 는 확인 없이 state를 덮어써 deprecated되었고 `apply -refresh-only` 가 그 자리를 대신한다.
- **state에는 민감 값이 평문으로 들어간다.** `aws_db_instance` 의 `password` 는 문서가 명시하듯 state에 저장되고, 시크릿 데이터 소스의 값도 마찬가지다. `sensitive` 표시는 출력만 가릴 뿐 암호화가 아니다.
- `serial` 은 낙관적 잠금의 근거이고 `lineage` 는 state의 혈통을 나타내는 UUID로 다른 환경의 state를 덮어쓰는 사고를 막는다. 이 둘 때문에라도 파일을 손으로 편집하면 안 된다.
- 로컬 state는 **동시성·유실·공유 불가** 세 문제를 가지며 원격 백엔드가 셋을 함께 해결한다.

## 다음으로

- [10장 — 태그 기초: tags, default_tags, tags_all](10-tags-basics.md) — provider가 태그를 전량 관리한다는 것이 plan에 어떻게 나타나는지.
- [16장 — 원격 State와 백엔드](../level2-intermediate/16-remote-state-and-backends.md) — 잠금·암호화·공유. 로컬 state의 세 문제를 푸는 곳.
- [20장 — Import와 Resource Identity](../level2-intermediate/20-import-and-resource-identity.md) — 이미 존재하는 리소스를 state에 편입시키는 정식 절차.
- 공식 문서: [Terraform State](https://developer.hashicorp.com/terraform/language/state)
