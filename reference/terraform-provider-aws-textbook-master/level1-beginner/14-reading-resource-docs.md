---
chapter: 14
level: "Level 1 — 초급"
title: "리소스 문서 읽는 법: Optional·ForceNew·Import·Timeouts"
difficulty: 입문
reading_time: "28분"
prerequisites: [5]
source_docs:
  - "docs/end-user-documentation.md"
  - "docs/naming.md"
  - "docs/id-attributes.md"
  - "docs/resource-identity.md"
  - "docs/changelog-process.md"
  - "website/docs/r/vpc.html.markdown"
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/r/lambda_function.html.markdown"
  - "names/README.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 14장 — 리소스 문서 읽는 법: Optional·ForceNew·Import·Timeouts

**이 장에서 배우는 것**

- 리소스 문서 페이지의 고정된 구조를 알고 필요한 정보가 어느 절에 있는지 곧바로 찾는다.
- `(Required)` `(Optional)` `(Forces new resource)` `(Deprecated)` 표기의 정확한 의미와, Optional인데 사실상 필수인 경우를 구분한다.
- 인수(Argument)와 속성(Attribute)의 차이를 알고, 같은 이름이 양쪽에 나오는 이유를 설명한다.
- `->` `~>` `!>` 세 콜아웃의 심각도 차이를 알고 무시해도 되는 것과 절대 안 되는 것을 가른다.
- Timeouts와 Import 절을 읽고, `terraform import`·`import` 블록·`identity` 기반 import를 상황에 맞게 고른다.
- 리소스 이름만 보고 어떤 서비스의 문서를 찾을지 알아내고, 그 인수가 언제 추가됐는지 확인한다.

**왜 중요한가**

AWS Provider에는 리소스 1,691개, 데이터 소스 673개, list resource 183개, ephemeral resource 10개가 있다. 전부 외우는 것은 불가능하고 그럴 필요도 없다. 필요한 능력은 "이 리소스의 인수를 안다"가 아니라 **"모르는 리소스의 문서를 3분 안에 읽어낸다"** 이다.

문서를 대충 읽어서 나는 사고는 형태가 정해져 있다. `(Forces new resource)` 를 놓치고 인수 하나를 바꿨다가 RDS 인스턴스가 교체되는 경우, `Conflicts with`를 못 보고 두 인수를 같이 써서 plan이 계속 실패하는 경우, `!>` 가 붙은 인수를 무심코 켰다가 되돌릴 수 없게 되는 경우다. 코드 실력이 아니라 **읽기의 문제**다.

반대 방향의 손해도 크다. 문서를 못 읽으면 검색과 블로그 글에 의존하게 되는데, 그 글들은 v3 시절 인수를 쓰거나 이미 제거된 리소스를 예제로 든다. Provider 문서는 코드와 같은 저장소에서 같은 PR로 갱신되고, 기여자 문서(`docs/end-user-documentation.md`)가 작성 규약을 강제해 **모든 페이지가 같은 순서와 표기법**을 따른다. 그 규약을 알면 페이지를 처음부터 읽을 필요가 없다.

## 문서 페이지의 고정 구조

`website/` 폴더 아래의 디렉터리 구조가 문서 종류를 그대로 나눈다.

```text
website/docs
├── actions/               # 액션
├── d/                     # 데이터 소스
├── ephemeral-resources/   # ephemeral 리소스
├── function/              # provider 함수
├── guides/                # provider 수준 가이드와 업그레이드 문서
├── index.html.markdown    # provider 블록 전체 레퍼런스
├── list-resources/        # list resource
└── r/                     # 리소스
```

리소스 페이지는 거의 항상 이 순서다.

1. **제목과 한 줄 설명** — `# Resource: aws_vpc` 뒤에 한 문장.
2. **Example Usage** — 최소 하나. 규약상 예제는 실제로 동작해야 하고, `terraform`·`provider` 블록을 포함하지 않으며, 리소스 인스턴스 이름은 대개 `example`이다. 규약은 예제가 `count`·`for_each`·내장 함수 같은 언어 기능을 자랑하지 말라고도 정한다. 즉 **예제는 그 리소스만 보여 준다**.
3. **Argument Reference** — 설정에 쓸 수 있는 것.
4. **Attribute Reference** — 읽을 수만 있는 것.
5. **Timeouts** — 있을 수도, 없을 수도 있다.
6. **Import** — 있을 수도, 없을 수도 있다.

Argument Reference의 첫 줄(byline)도 두 가지 중 하나로 정해져 있다. 필수와 선택을 한 목록에 섞으면 `This resource supports the following arguments:`, 나눠 쓰면 `The following arguments are required:` 와 `The following arguments are optional:` 다. 나뉘어 있으면 목록만 봐도 필수 인수를 알 수 있다.

목록 안의 순서도 정해져 있다. **정체성을 이루는 인수 -> 필수 인수(알파벳순) -> 선택 인수(알파벳순)** 다. 그래서 목록 맨 위 두세 개가 대개 그 리소스의 핵심이다. 블록 인수는 목록에 한 줄로 나오고 하위 인수는 아래쪽 별도 소제목에서 알파벳순으로 설명된다.

설명문에도 규약이 있어 읽는 데 도움이 된다. 설명은 `A `, `An `, `The `, `Specifies `, `Indicates ` 로 시작하지 않으며 **불리언 인수는 `Whether to` 로 시작한다.** 값이 정해진 인수는 `Valid values are:` 로 나열하고 기본값은 `Default value:` 로 적는다. 즉 설명문에 `Default` 가 없다면 기본값이 없거나 문서에서 누락된 것이다.

## 인수와 속성은 다르다

이 구분이 문서 읽기의 절반이다.

- **Argument(인수)** — 설정 파일에 **쓰는** 값. `Argument Reference`에 있다.
- **Attribute(속성)** — AWS가 정하고 Terraform이 **읽어 오는** 값. `Attribute Reference`에 있으며 `aws_vpc.main.arn` 처럼 참조만 된다.

Attribute Reference의 byline도 정해져 있다 — 내보내는 것이 없으면 `This resource exports no additional attributes.` 다. 이 문장을 봤다면 그 리소스는 참조할 값이 없다. `aws_iam_role_policy_attachment` 가 그런 경우다.

초심자가 걸리는 지점이 하나 있다. **같은 이름이 양쪽에 다 나온다.** `aws_vpc` 문서에서 `instance_tenancy`, `enable_dns_support`, `enable_dns_hostnames` 는 Argument Reference에도 Attribute Reference에도 있다. 모순이 아니다 — 설정하지 않으면 AWS가 정한 값이 읽혀 들어오고, 설정하면 그 값이 쓰인다.

속성 목록은 `id` 가 맨 앞, 나머지는 알파벳순이다. 속성 설명에는 **유효값과 기본값을 적지 않는다** — 우리가 정하는 값이 아니기 때문이다. 설명에 유효값이 나열되어 있다면 그 줄은 인수다.

`id` 자체도 예전만큼 당연하지 않다. `docs/id-attributes.md` 는 과거 모든 리소스가 `id` 를 가졌던 이유(Plugin SDK v2와 테스트 라이브러리가 요구했다)를 설명하면서 Plugin Framework 이후로는 **더 이상 필수가 아니라고** 못 박는다. 새 리소스는 `id` 가 다른 인수와 중복되거나 여러 인수의 조합이면 **아예 두지 않는 것이 표준**이고, 여러 값을 합칠 때는 쉼표(`,`)로 구분한다. 최신 문서에 `id` 가 없는 것은 오류가 아니다.

## 표기 읽기: Required · Optional · Forces new · Deprecated

각 인수 줄의 괄호 안 표기가 그 인수에 대한 계약이다.

```markdown
* `name` - (Optional, Forces new resource) The name of the log group. If omitted, Terraform will assign a random, unique name.
* `name_prefix` - (Optional, Forces new resource) Creates a unique name beginning with the specified prefix. Conflicts with `name`.
```

**`(Required)`** — 없으면 `terraform validate` 단계에서 막힌다. AWS API가 요구하는 것과 반드시 일치하지는 않으며, provider가 자체적으로 필수로 정한 경우도 있다.

**`(Optional)`** — 생략할 수 있다. 그러나 "생략해도 안전하다"는 뜻은 아니다. 생략했을 때 무슨 값이 들어가는지는 설명문의 `Default` 를 봐야 하고, 기본값이 위험한 경우가 많다.

**`(Forces new resource)`** — **이 인수를 바꾸면 리소스가 파괴되고 새로 만들어진다.** 문서 읽기에서 가장 값비싼 표기다. `aws_cloudwatch_log_group` 의 `name`, `aws_db_instance` 의 `backup_target`, `aws_dynamodb_table` 의 `hash_key` 가 그런 인수다. 데이터를 담은 리소스에서 이 표기를 놓치면 apply 한 번에 데이터가 사라진다.

다만 **문서의 표기가 완전하다고 믿으면 안 된다.** `aws_vpc` 문서에는 `(Forces new resource)` 표기가 하나도 없지만 `cidr_block` 을 바꾸면 교체가 일어난다. 최종 권위는 문서가 아니라 **plan 출력**이다. 문서는 plan을 읽기 전에 위험을 예상하는 도구이지 plan을 대신하지 않는다.

**`(Deprecated)`** — 아직 동작하지만 향후 메이저 버전에서 제거된다. 원문은 대개 `(Optional, **Deprecated**)` 형태로 굵게 쓰고 대체재를 함께 알려 준다. `aws_iam_role` 의 `inline_policy`, `aws_s3_bucket` 의 `acl`·`policy`·`lifecycle_rule` 이 그렇다. 새 코드에서는 쓰지 않고, 기존 코드에서는 메이저 업그레이드 전에 정리한다([39장](../level3-advanced/39-version-upgrades.md)).

## Optional인데 사실상 필수인 것

Optional 표기 하나만 보고 "안 써도 되겠다" 하면 안 되는 경우가 있다. 인수들 사이의 관계는 표기가 아니라 **설명문 안의 정해진 문구**로 드러난다.

**`Conflicts with`** — 둘을 같이 쓸 수 없다. `name` 과 `name_prefix` 의 관계가 전형적이다. `aws_vpc` 에서는 `ipv6_ipam_pool_id` 가 `assign_generated_ipv6_cidr_block` 과, `ipv6_netmask_length` 가 `ipv6_cidr_block` 과 충돌한다.

**`Exactly one of ... must be specified`** — 정확히 하나. `aws_nat_gateway` 의 `availability_zone` / `availability_zone_id`, `aws_vpc_endpoint` 의 `resource_configuration_arn` / `service_name` / `service_network_arn` 이 그렇다. **전부 Optional로 표기되어 있지만 하나는 반드시 써야 한다.**

**`At least one of ... is required`** — 하나 이상. `aws_ebs_volume` 의 `size` / `snapshot_id`, `aws_cloudwatch_event_rule` 의 `schedule_expression` / `event_pattern` 이 그렇다. 둘 다 써도 된다는 점이 위와 다르다.

**`Required with`** — 다른 인수를 쓸 때만 함께 필요하다. 이 표기 대신 산문으로 적히기도 한다. `aws_vpc` 의 `ipv4_netmask_length` 설명에는 `ipv4_ipam_pool_id` 를 함께 지정해야 한다고 문장으로 적혀 있다.

여러 관계가 겹치기도 한다. `aws_lambda_function` 의 배포 패키지 인수 셋이 대표적이다.

```markdown
* `filename` - (Optional) Path to the function's deployment package within the local
  filesystem. Conflicts with `image_uri` and `s3_bucket`. One of `filename`, `image_uri`,
  or `s3_bucket` must be specified.
```

세 인수가 서로 충돌하면서 동시에 하나는 반드시 있어야 한다. 목록만 훑고 "셋 다 Optional이네" 하고 넘어가면 apply에서 막힌다. **Optional 인수의 설명문은 끝까지 읽는다.**

## 콜아웃 세 단계: `->` · `~>` · `!>`

문서 곳곳에 들어 있는 강조 블록에는 심각도가 정해져 있다. 기여자 문서가 세 단계를 명시한다.

| 표기 | 등급 | 의미 |
|---|---|---|
| `-> **Note:**` | Informational | 유용한 추가 정보·권장 사항·팁. Registry에서 정보 아이콘으로 렌더링된다 |
| `~> **Note:**` | Warning | 이것을 모르면 **오류를 만난다**. 다만 그 오류는 되돌릴 수 없는 변경을 일으키지는 않는다 |
| `!> **Note:**` | Caution | **되돌릴 수 없는 변경**에 대한 치명적 정보. 데이터 손실을 포함한다 |

읽는 요령은 단순하다. `!>` 는 **한 글자도 빠뜨리지 않고 읽는다.** 이 표기가 붙은 곳은 손에 꼽는다 — `aws_iam_policy_attachment` 의 계정 전역 배타적 연결 경고([13장](13-iam-basics.md)) 같은 것들이다. `~>` 는 그 인수를 실제로 쓸 때 읽는다. 대부분 "이 조합은 permanent diff를 만든다", "이 값은 state에 평문으로 저장된다" 같은 내용이다. `->` 는 훑고 지나가도 된다.

주의할 점 하나. 콜아웃은 페이지 맨 위에만 있지 않고 **관련된 자리에 흩어져 있다.** `aws_vpc` 문서에는 Attribute Reference가 끝난 뒤 `~>` 노트가 붙어, VPC 삭제 시 GuardDuty가 만든 리소스를 정리하려면 어떤 IAM 권한이 권장되는지 알려 준다. 인수 목록만 골라 읽으면 놓치는 정보다.

## Timeouts: 있을 때와 없을 때

Timeouts 절은 **모든 리소스에 있는 것이 아니다.** `aws_vpc` 에는 없고 `aws_db_instance` 와 `aws_lambda_function` 에는 있다. 없다는 것은 그 리소스가 Terraform이 기다릴 필요 없이 즉시 끝나거나, provider가 별도 대기 로직을 두지 않았다는 뜻이다.

있을 때는 기본값이 함께 적혀 있고, 기본값의 크기가 그 리소스의 성격을 말해 준다.

```text
aws_db_instance      create 40m   update 80m   delete 60m
aws_lambda_function  create 10m   update 10m   delete 10m
aws_ami (데이터 소스) read 20m
```

`aws_db_instance` 의 `update` 가 80분인 것은 인스턴스 클래스 변경이나 스토리지 확장이 그만큼 걸릴 수 있기 때문이다. 데이터 소스에도 Timeouts가 있을 수 있고 이때 항목은 `read` 하나다.

늘려야 하는 경우는 대형 스냅샷에서 RDS를 복원할 때, 큰 EKS 클러스터를 다룰 때, 대용량 배포 패키지를 올릴 때다. 반대로 **줄이는 것도 쓸모가 있다** — CI에서 "어차피 실패할 apply"가 40분을 잡아먹는 것을 막을 수 있다.

```terraform
resource "aws_db_instance" "restored" {
  # ... 나머지 설정 ...

  timeouts {
    create = "90m"
    delete = "90m"
  }
}
```

타임아웃 초과가 곧 실패는 아니다. Terraform이 기다리기를 멈춘 것일 뿐 AWS 쪽 작업은 진행 중일 수 있고, 다음 apply에서 state와 실제가 어긋난 채 만나게 된다. 재실행 전에 콘솔에서 실제 상태를 확인한다.

## Import 절 읽기

Import 절은 세 가지 방법을 순서대로 보여 주며 최신 것이 위에 온다.

**1. `identity` 기반 import (Terraform v1.12.0 이상).** Resource Identity라는 구조화된 식별 정보를 쓴다.

```terraform
import {
  to = aws_subnet.example
  identity = {
    id = "subnet-9d4a7b6c"
  }
}

resource "aws_subnet" "example" {
  ### Configuration omitted for brevity ###
}
```

바로 아래 **Identity Schema** 소제목이 어떤 키가 Required이고 Optional인지 알려 준다. `aws_subnet` 은 Required가 `id`, Optional이 `account_id`·`region` 이다. `aws_iam_role` 은 Required가 `name`, Optional이 `account_id` 뿐이고 **`region` 이 없다** — IAM이 글로벌 서비스이기 때문이다. `docs/resource-identity.md` 는 identity를 ARN으로 식별하는 **ARN Identity**, 리전·계정마다 하나뿐인 리소스의 **Singleton Identity**, 속성 조합으로 식별하는 **Parameterized Identity** 셋으로 나눈다. 마지막 종류에는 `account_id` 와 `region` 이 **항상 포함된다**.

**2. `import` 블록 + `id` (Terraform v1.5.0 이상).**

```terraform
import {
  to = aws_subnet.example
  id = "subnet-9d4a7b6c"
}
```

**3. `terraform import` CLI.**

```console
% terraform import aws_subnet.example subnet-9d4a7b6c
```

import ID 형식은 리소스마다 다르고 이 절에 **정확한 형식이 적혀 있다.** 단일 값(`aws_subnet` 은 서브넷 ID, `aws_iam_role` 은 롤 이름, `aws_iam_policy` 는 정책 ARN)도 있고 여러 값을 잇는 경우도 있다 — `aws_iam_role_policy_attachment` 는 `/` 로, 새로 만들어지는 리소스는 쉼표로 잇는 것이 표준이다.

v6에는 규칙이 하나 더 있다. **특정 리전의 리소스를 import 하려면 import ID 뒤에 `@<region>` 을 붙인다.**

```console
% terraform import aws_vpc.test_vpc vpc-a01106c2@eu-west-1
```

v6의 top-level `region` 인수와 짝을 이루는 기능이다([24장](../level2-intermediate/24-enhanced-region-support.md)). 붙이지 않으면 provider 설정의 리전에서 찾는다.

Import 절이 **아예 없는** 리소스도 있고 대개 이유가 있다. 배타적 관계 관리 리소스가 그 예로, 설계 결정 문서는 import가 "기존 인프라를 기록했을 뿐"이라는 착각을 주면서 실제로는 다음 apply에 관계를 지울 수 있어 지원하지 않기로 정했다고 적는다. import 전반은 [20장](../level2-intermediate/20-import-and-resource-identity.md)에서 다룬다.

## 이름으로 문서 찾기

모르는 기능을 만났을 때 "어떤 리소스를 찾아야 하지"에서 막히는 일이 잦다. 이름 규칙을 알면 대부분 해결된다. 기여자 문서 `docs/naming.md` 가 규칙을 정한다.

리소스의 HCL 이름은 세 조각을 밑줄로 잇는다.

```text
aws  +  <서비스 식별자>  +  <리소스 이름(snake_case)>
aws  +  imagebuilder     +  image_pipeline        -> aws_imagebuilder_image_pipeline
```

서비스 식별자를 정하는 규칙도 명시되어 있다. AWS Go SDK v2의 패키지 이름과 AWS CLI v2의 명령 이름을 보고, 둘이 같으면 그것을, 다르면 **짧은 쪽**을 쓰며 소문자에 밑줄 없이 적는다. 리소스 이름은 AWS API 오퍼레이션에서 가져온다 — `CreateExperiment`/`GetExperiment` 가 있으면 이름은 "Experiment"다.

문서 파일 이름도 같은 규칙을 따른다. 리소스는 `website/docs/r/`, 데이터 소스는 `website/docs/d/` 아래에 `<서비스식별자>_<이름>.html.markdown` 으로 놓이고 **이름에 `aws` 를 넣지 않는다.** Registry URL도 같은 구조라 주소창에 직접 쳐 넣는 편이 검색보다 빠를 때가 많다.

다만 **규칙을 지키지 않는 이름이 꽤 있다.** `docs/naming.md` 는 리소스 이름 기준으로 32개가 전부 또는 일부 규칙을 어긴다고 스스로 밝힌다. EC2·ELB·ELBv2·RDS는 오래되고 많이 쓰여 식별자를 아예 안 붙이거나 일관성이 없다(`aws_instance`, `aws_lb`, `aws_db_instance`).

| 문서에서 보이는 이름 | 규칙대로면 |
|---|---|
| `api_gateway` | `apigateway` |
| `cloudwatch_log` | `logs` |
| `cloudwatch_event` | `events` |
| `dx` | `directconnect` |
| `msk` | `kafka` |
| `config` | `configservice` |
| `prometheus` | `amp` |
| `elastic_beanstalk` | `elasticbeanstalk` |

이름이 안 떠오를 때 마지막 근거는 `names/README.md` 가 설명하는 `names/data/names_data.hcl` 이다. 서비스마다 AWS SDK·CLI 이름, 사람이 읽는 이름(`human_friendly`), 별칭(`aliases`), 실제 접두어와 규칙상 접두어(`resource_prefix`), 글로벌 여부(`is_global`) 를 담고 **빌드 시점에 provider에 박힌다.** provider 본체와 코드 생성기, `skaff` 가 전부 이 파일을 참조한다.

## 데이터 소스·ephemeral·list 문서의 차이

같은 규약을 따르지만 제목과 절 구성이 조금씩 다르다. 제목 한 줄만 봐도 무엇인지 알 수 있다.

```markdown
# Resource: aws_vpc
# Data Source: aws_ami
# Ephemeral: aws_ssm_parameter
# List Resource: aws_vpc
```

**데이터 소스**는 Argument Reference가 "찾을 조건", Attribute Reference가 "찾은 결과"다. 만드는 것이 없으니 Import 절이 없고, Timeouts가 있다면 항목은 `read` 하나다.

**ephemeral 리소스**는 `ephemeral "aws_ssm_parameter" "example" {}` 로 선언하며 state에 값을 남기지 않는다. 문서 상단에 이 기능이 새롭다는 `~>` 노트가 붙고 절 구성은 Attribute Reference까지다([26장](../level2-intermediate/26-secrets-and-ephemeral.md)).

**list resource**는 `list "aws_vpc" "example"` 블록을 쓰고 인수를 `config { }` 안에 넣는다([37장](../level3-advanced/37-list-resources-and-query.md)).

같은 이름이 종류를 넘나든다는 점도 알아 둔다. `aws_vpc` 는 리소스이자 데이터 소스이자 list resource이고 `aws_ssm_parameter` 는 셋 다 있다. Registry 검색에서 여러 결과가 나오는 이유이며, **필요한 종류의 페이지를 열었는지 제목으로 확인**해야 한다.

## 문서에 없을 때: CHANGELOG와 `.changelog/`

문서 페이지에는 "이 인수가 언제 추가됐는지"가 적혀 있지 않다. 그런데 실무에서 자주 필요하다 — 고정된 provider 버전이 `~> 6.4` 인데 지금 보는 인수가 6.12에서 추가된 것이라면 아무리 정확히 써도 동작하지 않는다.

근거는 저장소의 `CHANGELOG.md` 다. `docs/changelog-process.md` 에 따르면 이 파일은 손으로 쓰지 않고 `.changelog/` 디렉터리의 파일들로 생성된다. 파일 이름은 **PR 번호**이며(`.changelog/1234.txt`), 안에는 분류 헤더가 붙은 항목이 들어 있다.

```text
release-note:new-resource        새 리소스. 리소스 이름만 적는다
release-note:new-data-source     새 데이터 소스
release-note:new-list-resource   새 list resource
release-note:new-guide           새 가이드 문서
release-note:enhancement         기능 추가. "resource/aws_eip: Add network_border_group argument"
release-note:bug                 버그 수정. "resource/aws_glue_classifier: Fix ..."
release-note:note                동작 변경·deprecated 안내
```

이 형식 덕분에 CHANGELOG에서 `aws_eip` 로 검색하면 그 리소스에 언제 무엇이 생겼는지 시간순으로 나온다. Resource Identity 지원도 `enhancement` 로 기록되며 문구가 "Add resource identity support"로 고정되어 있어, 어떤 리소스가 언제부터 `identity` import를 지원하는지 찾을 수 있다.

문서와 CHANGELOG로도 부족하면 마지막 근거는 코드다. 리소스의 Go 파일에는 스키마가 그대로 들어 있어 `Required`, `Optional`, `ForceNew`, `ConflictsWith`, `Default` 를 눈으로 확인할 수 있고, 위치는 이름 규칙에서 바로 나온다 — `internal/service/<서비스식별자>/<리소스이름>.go`. 문서와 코드가 어긋나면 코드가 맞다.

## 흔한 실수

### ❌ Optional만 보고 인수를 생략한다

`aws_nat_gateway` 의 `availability_zone` 과 `availability_zone_id` 는 둘 다 Optional로 표기되어 있어 둘 다 생략하고 넘어간다.

```terraform
resource "aws_nat_gateway" "example" {
  subnet_id     = aws_subnet.public.id
  allocation_id = aws_eip.nat.id
  # 두 인수 모두 Optional이니 생략해도 되겠지?
}
```

설명문에는 `Exactly one of availability_zone or availability_zone_id must be specified` 가 붙어 있다.

```terraform
# ✅ Optional 인수의 설명문 끝까지 읽고 관계를 확인한다
resource "aws_nat_gateway" "example" {
  subnet_id         = aws_subnet.public.id
  allocation_id     = aws_eip.nat.id
  availability_zone = "us-west-2a"
}
```

### ❌ 문서에 `(Forces new resource)` 가 없으니 안전하다고 믿는다

`aws_vpc` 문서에는 `(Forces new resource)` 표기가 없다. 그래서 `cidr_block` 을 바꾸는 PR을 plan 확인 없이 머지한다. 실제로는 VPC가 교체되고 안의 서브넷·라우팅이 연쇄적으로 재생성된다.

```console
$ terraform apply -auto-approve   # plan을 읽지 않았다
```

```console
# ✅ plan 출력에서 교체 표시를 직접 확인한다
$ terraform plan | grep -E "forces replacement|must be replaced|# .* will be destroyed"
```

교체가 절대 일어나면 안 되는 리소스에는 `lifecycle { prevent_destroy = true }` 를 함께 건다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md)).

### ❌ Attribute Reference의 값을 설정하려 한다

문서에서 `arn` 을 보고 설정에 써 넣는다. Attribute이므로 쓸 수 없다.

```terraform
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  arn        = "arn:aws:ec2:us-west-2:123456789012:vpc/vpc-12345678"
}
```

```terraform
# ✅ 속성은 읽기만 한다 - 다른 곳에서 참조한다
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

output "vpc_arn" {
  value = aws_vpc.main.arn
}
```

`Unsupported argument` 오류를 만나면 그 이름이 Attribute Reference 쪽에 있는지부터 확인한다.

### ❌ `~>` 와 `!>` 를 같은 무게로 읽는다

콜아웃을 전부 같은 참고 사항으로 취급해서, 되돌릴 수 없는 변경을 예고한 `!>` 를 그냥 지나친다.

```terraform
# !> 경고가 붙은 리소스를 확인 없이 쓴다
resource "aws_iam_policy_attachment" "readonly" {
  name       = "readonly-attach"
  roles      = [aws_iam_role.audit.name]
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
```

```terraform
# ✅ !> 를 읽고 대체 리소스를 쓴다
resource "aws_iam_role_policy_attachment" "audit_readonly" {
  role       = aws_iam_role.audit.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
```

## 프로덕션 노트

- **문서 버전을 코드 버전에 맞춘다.** Registry의 `latest` 페이지는 최신 버전 기준이다. 고정된 버전을 쓴다면 URL의 `latest` 를 그 버전으로 바꿔 읽는다. 문서에 있는 인수가 "Unsupported argument"로 나오면 십중팔구 버전 차이다.
- **PR 리뷰 체크리스트에 표기 확인을 넣는다.** "새 인수 중 `(Forces new resource)` 가 있는가", "`!>` 경고가 붙은 리소스를 쓰는가" 두 줄만 있어도 사고가 크게 준다.
- **Timeouts는 실측으로 정한다.** 기본값이 부족해 실패한 적이 있다면 실제 소요 시간을 기록해 두고 여유를 얹어 고정한다. CI 전용 환경에서는 짧게 잡아 실패를 빨리 만든다.
- **import 형식은 문서에서 복사한다.** 여러 값을 잇는 구분자가 `/` 인지 `,` 인지 리소스마다 다르고, 짐작해 만들면 "Unexpected Import Identifier" 오류가 난다. 다른 리전이 대상이면 `@<region>` 을 잊지 않는다.
- **문서 오류는 저장소로 돌려보낸다.** 문서와 실제가 다르면 이슈나 PR을 낼 수 있고, 페이지 하단 링크가 해당 markdown 파일로 연결된다. 사내 위키에 우회 메모를 쌓는 것보다 빠를 때가 많다([48장](../level3-advanced/48-contributing.md)).

## 연습문제

**1. 문서 세 개를 같은 순서로 읽기.** `aws_vpc`, `aws_db_instance`, `aws_lambda_function` 문서에서 (1) Required 인수, (2) `(Forces new resource)` 인수, (3) Timeouts 유무와 기본값, (4) import ID 형식을 표로 정리한다.
*성공 기준:* 세 리소스의 차이(Timeouts가 없는 리소스, update가 create보다 긴 리소스, identity 스키마에 `region` 이 있는지)를 각각 한 줄로 설명한다.

**2. 관계 문구 찾아내기.** 리소스 문서에서 `Conflicts with`, `Exactly one of`, `At least one of` 가 쓰인 인수를 하나씩 찾아 그 관계를 위반하는 설정을 만들고 `terraform validate` 를 돌린다.
*성공 기준:* 세 오류 메시지가 어떻게 다른지 적고, 어느 것이 validate에서 잡히고 어느 것이 apply에서야 잡히는지 구분한다.

**3. 이름과 시점 추적하기.** MSK와 API Gateway v2의 문서 파일 이름을 규칙만으로 추측해 실제와 비교하고, 임의의 인수 하나를 골라 CHANGELOG에서 추가된 버전을 찾는다.
*성공 기준:* 규칙과 실제의 차이를 `docs/naming.md` 로 설명하고, 검색에 쓴 문자열과 찾은 버전을 적은 뒤 현재 `required_providers` 제약이 그 버전을 포함하는지 판단한다.

## 요약

- 리소스 문서는 제목 -> Example Usage -> Argument Reference -> Attribute Reference -> Timeouts -> Import 순서가 고정되고, 인수 목록은 정체성 인수 -> 필수(알파벳순) -> 선택(알파벳순) 순이다.
- **Argument는 쓰는 것, Attribute는 읽는 것**이다. 같은 이름이 양쪽에 나오면 "설정하면 쓰이고 안 하면 읽힌다"는 뜻이다. 속성 설명에는 유효값·기본값을 적지 않는다.
- `id` 속성은 더 이상 필수가 아니다. 새 리소스는 중복되거나 조합인 `id` 를 아예 두지 않으며, 여러 값을 합칠 때는 쉼표로 구분한다.
- `(Forces new resource)` 는 교체를 뜻하고 `(Deprecated)` 는 향후 제거를 뜻한다. **문서 표기는 완전하지 않으므로 최종 권위는 plan 출력**이다.
- Optional 표기만으로 판단하지 않는다. `Conflicts with`, `Exactly one of`, `At least one of`, `Required with` 문구가 설명문 안에 숨어 있다.
- 콜아웃은 `->` 정보, `~>` 오류를 부르는 경고, `!>` 되돌릴 수 없는 변경·데이터 손실 세 단계다. `!>` 는 반드시 정독한다.
- Timeouts 절은 모든 리소스에 있지 않다. `aws_db_instance` 는 create 40m·update 80m·delete 60m, `aws_lambda_function` 은 셋 다 10m이며 데이터 소스는 `read` 하나다.
- Import 절은 `identity` 블록(v1.12+), `import` 블록 + `id`(v1.5+), `terraform import` CLI 순으로 제시된다. v6에서 다른 리전이 대상이면 import ID 뒤에 `@<region>` 을 붙인다.
- 리소스 이름은 `aws` + 서비스 식별자 + 이름이며 문서 파일 이름도 같다. 32개가 규칙을 어기고 있고 단일 진실은 `names/data/names_data.hcl` 이다. 인수가 언제 생겼는지는 `CHANGELOG.md`와 `.changelog/` 규약으로 찾는다.

## 다음으로

- [15장 — 초급 종합: 2-tier VPC 환경](15-capstone-two-tier.md) — 지금까지의 내용을 하나의 환경으로 조립한다.
- [20장 — Import와 Resource Identity](../level2-intermediate/20-import-and-resource-identity.md) — 이 장에서 읽는 법만 본 import를 실제로 수행한다.
- [21장 — lifecycle 메타 인수](../level2-intermediate/21-lifecycle-meta-arguments.md) — `(Forces new resource)` 를 만났을 때 쓸 수 있는 도구들.
- [48장 — 기여 프로세스](../level3-advanced/48-contributing.md) — 네이밍·changelog·문서 규약을 반대편에서 본다.
- 공식 문서: [AWS Provider Registry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
