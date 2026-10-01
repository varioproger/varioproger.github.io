---
chapter: 23
level: "Level 2 — 중급"
title: "태깅 전략 심화: ignore_tags · 개별 태그 리소스 · 태그 정책"
difficulty: 중급
reading_time: "35분"
prerequisites: [10]
source_docs:
  - "website/docs/guides/resource-tagging.html.markdown"
  - "website/docs/guides/tag-policy-compliance.html.markdown"
  - "website/docs/index.html.markdown"
  - "website/docs/r/ec2_tag.html.markdown"
  - "website/docs/d/default_tags.html.markdown"
  - "website/docs/r/autoscaling_group.html.markdown"
  - "website/docs/r/cloudwatch_log_group.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/tag-policy-compliance"
provider_baseline: "6.x"
---

# 23장 — 태깅 전략 심화: ignore_tags · 개별 태그 리소스 · 태그 정책

**이 장에서 배우는 것**

- 외부 시스템이 붙이는 태그가 왜 **영구 diff**를 만드는지 알고, 리소스 단위(`ignore_changes`)와 provider 단위(`ignore_tags`) 해법을 골라 쓸 수 있다.
- `ignore_tags` 와 환경변수는 **병합**되고 `default_tags` 는 **우선순위**로 결정된다는 차이를 구분할 수 있다.
- `ignore_tags` 를 켜고도 영구 diff가 남는 조건을 알고 무엇을 고쳐야 하는지 안다.
- `aws_ec2_tag` 같은 개별 태그 리소스를 언제 쓰고 언제 쓰면 안 되는지 판단하고, `aws_autoscaling_group` 의 `default_tags` 예외를 `aws_default_tags` + `dynamic "tag"` 로 메울 수 있다.
- `tag_policy_compliance` 로 태그 정책 준수를 plan에서 강제하고, 조직 태깅 표준을 3층 구조로 설계할 수 있다.

**왜 중요한가**

EKS 클러스터를 올린 다음 날부터 `terraform plan` 이 조용한 적이 없다. subnet 여섯 개에 매번 같은 변경이 잡힌다 — `kubernetes.io/cluster/prod-eks: "shared"` 를 지우겠다는 계획이다. 이 태그는 우리가 붙인 적이 없다. AWS Load Balancer Controller가 붙였고, 없으면 로드밸런서가 배치될 서브넷을 찾지 못한다. 그런데 provider는 `tags` 를 전량 관리하므로([10장](../level1-beginner/10-tags-basics.md)) "설정에 없는 태그 = 지워야 할 것"으로 계산한다. 무심코 apply하면 다음 Service 배포부터 로드밸런서 생성이 실패한다.

같은 증상이 다른 원인으로도 나온다. CMDB 에이전트가 `cmdb:asset-id` 를 채우고 비용 도구가 `finops:allocated` 를 붙인다. 코드로 따라 적으면 값이 바뀔 때마다 또 diff가 나고, 빼면 provider가 지우려 든다. **영구 diff는 plan을 무의미하게 만든다** — 매번 열 줄이 뜨는 plan에서 사람은 진짜 변경을 읽지 않게 되고 리뷰는 형식이 된다.

반대 방향의 문제도 있다. 조직이 "모든 리소스에 `Owner` 를 붙인다"는 표준을 위키에 적었는데, 6개월 뒤 감사에서 리소스 3,000개 중 400개에 `Owner` 가 없다는 것이 드러난다. 위키는 강제력이 없고, 코드 리뷰는 사람이 놓치며, AWS Organizations의 태그 정책은 기본적으로 **보고만 하고 막지 않는다.** provider 인수 `tag_policy_compliance` 는 이 간극을 plan 단계로 끌어온다.

## 영구 diff는 어디서 오는가

plan은 매번 "실제 태그"와 "설정 태그"를 비교해 실제에만 있는 키는 제거 대상, 설정에만 있는 키는 추가 대상으로 잡는다. 예외는 `aws:` 로 시작하는 키뿐이다 — AWS 서비스가 관리하며 대개 편집·삭제할 수 없으므로 provider가 건드리지 않는다. 문제는 `aws:` 가 아닌 접두어로 태그를 붙이는 시스템이 많다는 것이다.

- **Kubernetes.** EKS 생태계는 subnet과 security group의 태그를 **기능적 설정**으로 쓴다. `kubernetes.io/cluster/<이름>`, `kubernetes.io/role/elb`, `kubernetes.io/role/internal-elb` 가 대표적이고 cluster-autoscaler는 ASG에 `k8s.io/cluster-autoscaler/` 접두어 태그를 요구한다.
- **CMDB·자산 관리.** 에이전트가 주기적으로 순회하며 자산 ID, 담당 조직, 감사 시각을 채운다. 값이 계속 바뀌므로 코드로 따라잡는 것이 원리적으로 불가능하다.
- **비용·거버넌스 도구.** 태그 정규화 람다, 비용 할당 도구, 보안 스캐너가 각자의 네임스페이스로 태그를 남긴다.

증상은 하나다 — plan을 두 번 연속 돌려도 같은 변경이 뜬다. 고쳐야 할 것은 태그가 아니라 **누가 그 태그의 소유자인가**에 대한 선언이며, 소유자가 우리가 아니라면 Terraform이 손을 떼야 한다.

## 리소스 단위 해법: `ignore_changes`

모든 리소스가 쓸 수 있는 `lifecycle` 메타 인수다([21장](21-lifecycle-meta-arguments.md)).

```terraform
resource "aws_vpc" "example" {
  cidr_block = "10.0.0.0/16"
  tags       = { Name = "MyVPC" }

  lifecycle {
    ignore_changes = [tags]
  }
}
```

생성 시점에는 `Name` 이 붙는다. 그러나 그 뒤로는 `Name` 값이 밖에서 바뀌어도, 다른 태그가 추가·제거되어도 Terraform은 아무것도 제안하지 않는다. 강력한 대신 뭉툭하다 — 이 리소스의 태그는 사실상 코드 관리 밖으로 나간다. 키 하나만 무시하는 편이 대개 낫다.

```terraform
resource "aws_vpc" "example" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name  = "MyVPC"
    Owner = "Operations"
  }

  lifecycle {
    ignore_changes = [tags["Name"]]
  }
}
```

`Name` 값의 외부 변경은 무시되지만 `Owner` 를 포함한 다른 태그의 변경과 추가는 그대로 제안된다. 키에 슬래시나 점이 들어가면 대괄호 표기가 필수다 — `tags["kubernetes.io/role/elb"]` 는 되지만 점 표기법으로는 쓸 수 없다.

`tags_all` 을 지정해야 하는 경우도 있다. `tags_all` 은 `default_tags` 와 리소스 `tags` 를 합친 최종 결과이자 provider가 실제로 AWS에 보내는 값이므로, `default_tags` 로 들어온 키의 외부 변경을 무시하려면 이쪽을 본다([10장](../level1-beginner/10-tags-basics.md)).

한계는 명확하다. **리소스마다 적어야 한다.** subnet 여섯 개, security group 열 개에 같은 블록을 복사하게 되고 새 리소스를 추가한 사람이 빠뜨리면 그 리소스만 영구 diff를 낸다. `lifecycle` 은 리터럴만 받으므로 변수로 주입할 수도, 모듈 사용자가 밖에서 넣을 수도 없다.

## provider 단위 해법: `ignore_tags` 블록

provider 블록 안의 설정 블록이다(2.60.0+). 그 provider 인스턴스가 다루는 **모든 리소스**에 적용된다.

```terraform
provider "aws" {
  ignore_tags {
    keys         = ["LastScanned", "cmdb:asset-id"]
    key_prefixes = ["kubernetes.io/", "k8s.io/cluster-autoscaler/"]
  }
}
```

- `keys` — 정확히 일치하는 태그 키 목록.
- `key_prefixes` — 접두어 목록. `kubernetes.io/` 하나로 `kubernetes.io/cluster/prod-eks` 와 `kubernetes.io/role/elb` 가 모두 걸린다. 키 이름을 미리 알 수 없는 경우(클러스터 이름이 들어가는 태그 등)에 유일한 해법이다.

두 인수는 함께 쓸 수 있다. 효과는 "이 키들을 `tags` 계열 속성에서 **반환하지 않고** 값 차이도 표시하지 않는다"이며, 결과적으로 plan에서 사라진다. 주의할 범위 제약이 둘 있다.

**provider 인스턴스마다 따로 적어야 한다.** alias로 여러 provider 설정을 두었다면([25장](25-multi-account.md)) 각각에 같은 `ignore_tags` 를 넣는다. 기본 인스턴스에만 넣고 `provider = aws.tokyo` 로 만든 리소스에서 diff가 계속 나는 것이 흔한 함정이다.

**개별 태그 리소스에는 적용되지 않는다.** provider 문서는 `ignore_tags` 의 범위를 "이 provider가 다루는 모든 리소스(`aws_ec2_tag` 같은 개별 서비스 태그 리소스는 제외)"로 규정한다. 버그가 아니라 설계다 — 그 리소스의 존재 이유가 "특정 키 하나를 명시적으로 소유한다"이기 때문이다.

## 환경변수와 병합 규칙: `default_tags` 와 다른 점

`ignore_tags` 의 두 인수는 환경변수로도 줄 수 있다.

```console
$ export TF_AWS_IGNORE_TAGS_KEYS="LastScanned,cmdb:asset-id"
$ export TF_AWS_IGNORE_TAGS_KEY_PREFIXES="kubernetes.io/,k8s.io/"
$ terraform plan
```

값이 여러 개면 쉼표로 구분한다. 반드시 구분해야 할 사실이 있다.

> **인수와 환경변수가 둘 다 설정되면 두 소스의 값이 하나의 목록으로 병합된다.**

`default_tags` 는 정반대다. `TF_AWS_DEFAULT_TAGS_<키>=<값>` 로 줄 수 있지만, 같은 키가 양쪽에 있으면 **provider 설정의 값이 우선한다.** 값 하나가 이기고 다른 하나는 버려진다.

| | 환경변수 | 인수와 함께 설정되면 |
|---|---|---|
| `default_tags` | `TF_AWS_DEFAULT_TAGS_<키>=<값>` | **provider 인수가 우선** (덮어씀) |
| `ignore_tags.keys` | `TF_AWS_IGNORE_TAGS_KEYS`(쉼표 구분) | **병합** |
| `ignore_tags.key_prefixes` | `TF_AWS_IGNORE_TAGS_KEY_PREFIXES`(쉼표 구분) | **병합** |
| `tag_policy_compliance` | `TF_AWS_TAG_POLICY_COMPLIANCE` | **provider 인수가 우선** |

이 차이는 의미에서 나온다. `default_tags` 는 "이 키의 값은 무엇인가"라는 **단일 값** 질문이므로 승자를 정해야 하고, `ignore_tags` 는 "무시할 키의 집합"이므로 합집합이 자연스럽다. CI 러너에 `TF_AWS_IGNORE_TAGS_KEY_PREFIXES=cmdb:` 를 전역으로 걸면 모든 워크스페이스가 상속하고 각 스택은 필요한 키만 코드에 더한다. 반대로 로컬에 실수로 남은 환경변수 하나가 **조용히 diff를 숨긴다** — plan 결과가 사람마다 다르다는 신고가 들어오면 `env | grep TF_AWS_` 부터 확인한다.

## `ignore_tags` 를 켜도 diff가 나는 조건

문서가 명시적으로 경고하는 함정이 하나 있다.

> 어떤 리소스의 설정이 여전히 그 태그 키를 `tags` 인수에 갖고 있으면, 그 키를 인수에서 제거하거나 `ignore_changes` 를 함께 쓰기 전까지 **영구 diff가 표시된다.**

`ignore_tags` 는 provider가 **읽어 오는 쪽**에서 그 키를 지운다. 코드에는 여전히 있으므로 Terraform이 보기에 "설정에는 있고 실제에는 없는 키"가 되어 매번 추가를 제안한다 — 무시하려던 diff의 방향만 뒤집힌 셈이다.

고치는 방법은 둘이다. **코드에서 그 키를 뺀다**(권장 — 소유권을 넘긴다는 선언과 일치한다). 또는 초기값을 심어야 한다면 `lifecycle { ignore_changes = [tags["kubernetes.io/role/elb"]] }` 를 함께 건다. 원칙으로 정리하면 **`ignore_tags` 는 "밖에서 붙는 것을 안 본다", `ignore_changes` 는 "내 것이지만 변경을 안 본다"** 이다. 둘을 섞는 것은 "처음 한 번만 내가 정하고 그 뒤로는 남의 것"인 좁은 경우뿐이다.

## 개별 태그 리소스: `aws_ec2_tag` 와 형제들

Terraform이 리소스 자체를 관리하지 않으면서 **태그 하나만** 관리해야 하는 상황이 있다 — RAM으로 공유받은 리소스, 다른 팀이 만든 AMI, 다른 리소스가 **암묵적으로 만들어 낸** 객체(EC2 VPN Connection이 생성하는 Transit Gateway VPN Attachment 등)다.

```terraform
resource "aws_ec2_tag" "attachment_name" {
  resource_id = aws_vpn_connection.example.transit_gateway_attachment_id
  key         = "Name"
  value       = "Hello World"
}
```

인수는 셋뿐이다 — `resource_id`(Required), `key`(Required), `value`(Required). v6에서는 top-level `region` 인수도 받는다([24장](24-enhanced-region-support.md)). `id` 속성은 리소스 식별자와 키를 **쉼표로 이은** 문자열이고 import ID도 같은 형식이다.

```console
% terraform import aws_ec2_tag.example tgw-attach-1234567890abcdef,Name
```

태그가 여러 개면 맵을 `for_each` 에 주고 `key = each.key`, `value = each.value` 로 푼다.

EC2 말고도 서비스별로 같은 꼴의 리소스가 있다 — `aws_autoscaling_group_tag`, `aws_ecs_tag`, `aws_dynamodb_tag`, `aws_secretsmanager_tag`, `aws_organizations_tag`, `aws_transfer_tag` 등이다. 모든 서비스에 있지는 않으므로 이름이 `_tag` 로 끝나는 리소스를 찾아본다.

### 부모 리소스와 절대 함께 쓰지 않는다

문서가 강한 경고를 붙여 둔 지점이다. **개별 태그 리소스를 부모 리소스 관리 리소스와 결합하면 안 된다.** 같은 VPC를 `aws_vpc` 로 관리하면서 `aws_ec2_tag` 로 태그를 붙이면 `aws_vpc` 는 자기 `tags` 에 없는 그 키를 지우려 하고 `aws_ec2_tag` 는 다시 붙인다. 매 apply마다 서로의 작업을 되돌린다.

`ignore_tags` 로 그 키를 무시해 해결하려는 시도도 실패한다. `aws_ec2_tag` 는 `ignore_tags` 의 적용 대상이 아니므로 그쪽은 계속 관리하고 `aws_vpc` 쪽 diff만 사라져 상태가 더 헷갈려진다. 규칙은 단순하다 — **한 리소스의 태그는 한 곳에서만 관리한다.** 부모를 Terraform이 관리하면 `tags` 인수를 쓰고, 관리하지 않을 때만 개별 태그 리소스를 쓴다.

## `aws_autoscaling_group` 예외 메우기

`default_tags` 는 태그를 지원하는 거의 모든 리소스에 적용되지만 **`aws_autoscaling_group` 은 예외**다. ASG의 태그 모델이 다르기 때문이다 — 키·값에 더해 `propagate_at_launch` 플래그가 붙고, 이것이 "이 태그를 ASG가 띄우는 인스턴스에도 전파할 것인가"를 정한다. map(string)으로는 표현되지 않는 구조다.

그래서 `default_tags` 만 믿고 ASG를 만들면 ASG에도 그 인스턴스에도 조직 표준 태그가 붙지 않는다. 비용 리포트에서 EC2 비용 대부분이 미분류로 남는 전형적인 원인이다. 메우는 방법은 `aws_default_tags` 데이터 소스다 — 인수가 없고 `tags` 속성 하나를 내보내며 그 값이 현재 provider의 `default_tags` 맵이다.

```terraform
provider "aws" {
  default_tags {
    tags = { Environment = "Test", Owner = "Ops" }
  }
}

data "aws_default_tags" "example" {}

resource "aws_autoscaling_group" "example" {
  # ... 나머지 설정 ...

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

`dynamic` 블록의 문법은 [17장](17-count-foreach-dynamic.md)에서 다뤘다. 실무적으로 결정할 것은 `propagate_at_launch` 값이다. 비용 할당·소유권 태그는 인스턴스까지 전파해야 의미가 있으므로 `true` 가 맞고, ASG 고유 태그를 인스턴스에 붙이고 싶지 않다면 두 개의 `dynamic` 블록으로 나눈다. `default_tags` 에 `Name` 을 넣으면 그 값이 인스턴스 이름으로 전파되어 콘솔의 인스턴스 목록이 전부 같은 이름이 된다. alias provider를 쓴다면 데이터 소스에도 `provider = aws.tokyo` 를 지정해야 그 인스턴스의 `default_tags` 를 읽는다.

## `tag_policy_compliance`: 태그 정책을 plan에서 검사한다

AWS Organizations의 **태그 정책**은 조직 단위로 "어떤 리소스 타입에 어떤 태그 키가 필수인가"를 선언한다. 그 자체로는 생성을 막지 않고 준수 여부를 보고할 뿐이다. v6의 provider 인수 `tag_policy_compliance` 는 이 정책을 **plan 시점 검증**으로 끌어온다.

### 전제 조건

- **계정에 태그 정책이 붙어 있어야 한다.** 여러 정책이 붙어 있으면 병합한 "유효(effective) 태그 정책"이 기준이 된다. 정책은 `aws_organizations_policy` 와 `aws_organizations_policy_attachment` 로 만들 수 있으며 **조직의 관리 계정에서** 만들어야 한다.
- **실행 principal에 `ListRequiredTags` 권한이 필요하다.** Resource Groups Tagging API의 액션이며 2025년 11월에 도입됐다. 기존 CI 역할의 권한을 손봐야 할 가능성이 높다.

```json
{
  "tags": {
    "Owner": {
      "tag_key": { "@@assign": "Owner" },
      "report_required_tag_for": { "@@assign": ["logs:log-group"] }
    }
  }
}
```

이 정책은 `logs:log-group` 타입에 `Owner` 키를 필수로 만든다. `logs:log-group` 은 AWS의 **태그 리소스 타입** 표기이고 Terraform의 `aws_cloudwatch_log_group` 에 대응한다. 대응 관계는 공식 가이드의 교차 참조표에 400개 이상 실려 있다 — `ec2:vpc` -> `aws_vpc`, `s3:bucket` -> `aws_s3_bucket`, `lambda:function` -> `aws_lambda_function` 식이다. 1:1이 아닌 경우도 있어 `elasticloadbalancing:loadbalancer` 는 `aws_lb` 와 `aws_alb` 양쪽에, `rds:db` 는 `aws_db_instance`·`aws_docdb_cluster_instance`·`aws_neptune_cluster_instance` 에 걸린다. **정책을 쓰기 전에 표에서 타입 이름을 확인한다** — 오타 하나면 아무것도 강제하지 못하는데 그 사실이 조용하다.

### 켜기와 값

```terraform
provider "aws" {
  tag_policy_compliance = "error"
}
```

값은 셋이다.

- `error` — 위반이 **에러 진단**이 된다. plan이 실패하고 apply로 가지 못한다.
- `warning` — 위반이 **경고 진단**이 된다. 계획된 변경은 진행할 수 있지만 위반이 해소될 때까지 경고는 계속 나온다.
- `disabled` — 강제하지 않는다. 인수를 설정하지 않은 것과 같다.

환경변수 `TF_AWS_TAG_POLICY_COMPLIANCE` 로도 줄 수 있고 **둘 다 있으면 provider 인수가 우선한다.** 범위는 "이 provider 인스턴스가 관리하는 리소스"이므로 alias마다 따로 켠다. 검사 범위는 **리소스 타입별 필수 태그 키의 준수 여부만**이며, 값의 허용 목록이나 대소문자 규칙은 대상이 아니다.

### 에러는 어떻게 보이는가

앞의 정책이 붙은 상태에서 태그 없는 로그 그룹을 만들면 이렇게 된다.

```console
% terraform plan

Planning failed. Terraform encountered an error while generating this plan.

╷
│ Error: Missing Required Tags - An organizational tag policy requires the following tags for aws_cloudwatch_log_group: [Owner]
│
│   with aws_cloudwatch_log_group.example,
│   on main.tf line 23, in resource "aws_cloudwatch_log_group" "example":
```

메시지가 리소스 주소, 파일, 줄 번호, 빠진 키를 모두 준다. 해결은 그 리소스에 `tags = { Owner = "..." }` 를 넣거나, 조직 전체에 걸리는 키라면 provider `default_tags` 에 넣는 것이다. 후자를 택하면 리소스 코드를 손대지 않고도 준수 상태가 된다 — **`default_tags` 로 들어온 키도 검사에서 인정된다.**

### 검증 시점과 SDKv2 제약

검사는 새 리소스를 **생성하기 전**과 기존 리소스의 **`tags` 를 수정하기 전** 두 시점에 돈다. 중요한 예외가 있다. **태그와 무관한 업데이트는 기존 태그가 정책을 위반하고 있어도 항상 허용된다.** 비준수 리소스 때문에 무관한 변경까지 막히는 것을 피하면서 태그를 건드리는 순간에는 준수를 요구하는 절충이며, "정책을 켜도 기존 인프라가 즉시 멈추지 않는다"는 뜻이다.

두 번째 제약은 내부 구현에서 온다. **Plugin SDK V2로 구현된 리소스는 plan 시점에 경고 진단을 낼 수 없다.** 이 경우 provider는 `WARN` 레벨 로그 메시지를 대신 남긴다.

```console
% TF_LOG=warn terraform plan
```

AWS Provider의 리소스 대다수가 아직 SDK V2 기반이므로([42장](../level3-advanced/42-provider-architecture.md)) **`warning` 모드는 생각보다 조용하다** — 대부분의 리소스에서는 로그를 봐야 보인다는 뜻이다. 실무 도입 순서는 스테이징에서 `error` 로 켜 위반 목록을 뽑고, 코드를 고치고, 프로덕션에서 `error` 로 켜는 쪽이 낫다.

활성화하면 `ListRequiredTags` 호출이 추가된다. 호출 빈도와 캐싱 동작은 문서에 명시돼 있지 않으므로 리소스가 수백 개인 워크스페이스라면 **스테이징에서 plan 소요 시간을 먼저 재 보고** 도입한다([40장](../level3-advanced/40-performance-and-throttling.md)).

## 조직 태깅 표준을 3층으로 설계한다

도구를 다 봤으니 설계로 옮긴다. 표준은 세 부분으로 이뤄진다.

**1) 필수 키 목록.** 다섯 개를 넘기지 않는 것이 현실적이다 — `Environment`, `Owner`(개인 이메일이 아니라 팀 식별자), `Service`, `CostCenter`, `ManagedBy`(`terraform` 고정). 여섯 번째 키 논의가 나올 때마다 "이 키가 없어서 못 하는 일이 무엇인가"를 묻는다.

**2) 값 규칙.** 태그 키와 값은 **대소문자를 구분한다.** `Environment = "Prod"` 와 `environment = "prod"` 는 다른 것이고 ABAC 정책은 조용히 통과하거나 조용히 막힌다. 표기법, 허용 값 목록, 네임스페이스 접두어 규칙을 문서가 아니라 **모듈의 variable validation** 으로 강제한다.

**3) 강제 수단 3층.** **코드 리뷰(1층)** — `default_tags` 를 루트 모듈의 provider 블록에 두고 모듈은 `merge()` 로 자기 태그만 더해 리뷰 지점을 한 곳으로 줄인다. **provider 검사(2층)** — `tag_policy_compliance = "error"` 는 plan 단계에서 막으므로 **AWS를 호출하기 전에** 실패한다. 되돌릴 것이 없다는 점이 이 층의 가치다. **SCP·태그 정책(3층)** — 콘솔, 다른 IaC, SDK 스크립트 등 Terraform을 통하지 않는 경로를 덮는다. 태그 정책은 보고가 기본이므로 정말 막으려면 SCP의 `aws:RequestTag` 조건과 조합한다.

세 층은 서로를 대체하지 않는다. 1층은 사람에 의존하고, 2층은 Terraform 경로만 덮으며, 3층은 넓지만 늦고 불친절하다. 좋은 조합은 **2층을 주력으로 두고 3층으로 구멍을 막는 것**이다.

## 흔한 실수

### ❌ 외부 시스템이 붙인 태그를 코드로 따라 적는다

CMDB가 채우는 값은 계속 바뀐다. 코드로 따라잡으면 매일 "태그 동기화 PR"을 만들게 된다.

```terraform
# ❌ 남의 시스템이 관리하는 값을 코드에 박아 둔다
resource "aws_instance" "app" {
  tags = {
    Name             = "app-01"
    "cmdb:asset-id"  = "AST-00042"
    "cmdb:last-sync" = "2026-08-19T03:11:00Z" # 매 순회마다 바뀐다
  }
}
```

```terraform
# ✅ 소유권을 넘기고 provider 전역에서 그 네임스페이스를 무시한다
provider "aws" {
  ignore_tags { key_prefixes = ["cmdb:"] }
}

resource "aws_instance" "app" {
  tags = { Name = "app-01" }
}
```

### ❌ `ignore_tags` 를 켜 놓고 코드에서 그 키를 빼지 않는다

방향만 뒤집힌 영구 diff가 남는다. provider는 그 키를 읽어 오지 않고, 코드에는 있으니 매번 추가를 제안한다.

```terraform
# ❌ key_prefixes 에 "kubernetes.io/" 를 넣고도 tags 에 그대로 둔다
resource "aws_subnet" "public" {
  tags = {
    Name                     = "public-a"
    "kubernetes.io/role/elb" = "1"
  }
}
```

```terraform
# ✅ 코드에서 뺀다. 초기값을 꼭 심어야 한다면 ignore_changes 를 함께 건다
resource "aws_subnet" "public" {
  tags = { Name = "public-a" }
}
```

### ❌ `aws_ec2_tag` 로 Terraform이 관리 중인 리소스의 태그를 붙인다

`aws_vpc` 는 자기 `tags` 에 없는 키를 지우려 하고 `aws_ec2_tag` 는 다시 붙인다. 매 apply마다 서로의 작업을 되돌린다.

```terraform
# ❌ 부모가 Terraform 관리 대상인데 개별 태그 리소스를 얹는다
resource "aws_ec2_tag" "owner" {
  resource_id = aws_vpc.main.id
  key         = "Owner"
  value       = "Operations"
}
```

```terraform
# ✅ 관리 중인 리소스는 tags 인수로. 개별 태그 리소스는 암묵 생성된 대상에만
resource "aws_ec2_tag" "attachment_owner" {
  resource_id = aws_vpn_connection.example.transit_gateway_attachment_id
  key         = "Owner"
  value       = "Operations"
}
```

### ❌ `tag_policy_compliance` 를 프로덕션에서 먼저 `error` 로 켠다

정책 이름 오타나 예상 밖의 리소스 타입 때문에 배포 파이프라인 전체가 멈출 수 있고, 실행 역할에 `ListRequiredTags` 권한이 없으면 원인을 짐작하기 어려운 실패가 난다.

```terraform
# ❌ 검증 없이 프로덕션부터
provider "aws" {
  tag_policy_compliance = "error"
}
```

```terraform
# ✅ 스테이징에서 먼저 켜고, 권한과 위반 목록을 확인한 뒤 프로덕션으로 옮긴다
provider "aws" {
  tag_policy_compliance = var.tag_policy_mode

  default_tags {
    tags = {
      Environment = var.environment
      Owner       = var.owner
      ManagedBy   = "terraform"
    }
  }
}
```

## 프로덕션 노트

- **`ignore_tags` 목록은 리뷰 대상이다.** 한 번 넣으면 아무도 다시 보지 않고 조용히 늘어난다. 각 항목에 "누가 이 키의 소유자인가"를 주석으로 남기고 분기마다 훑는다. 소유 시스템이 폐기됐는데 규칙만 남으면 그 키의 drift는 보이지 않는다.
- **환경변수는 로컬과 CI의 plan을 다르게 만든다.** `TF_AWS_IGNORE_TAGS_*` 는 인수와 **병합**되므로 CI에만 걸린 값이 로컬에서는 diff로 보인다. 팀 표준은 코드에 둔다.
- **ASG 모듈에는 `aws_default_tags` + `dynamic "tag"` 를 기본으로 넣는다.** 예외를 사용자 기억에 맡기면 반드시 누락된다.
- **`tag_policy_compliance` 는 IAM 권한 변경을 동반한다.** `ListRequiredTags` 는 2025년 11월에 나온 API이므로 오래된 CI 역할에는 없다.
- **태그 변경은 리소스를 교체하지 않지만 API 호출은 늘린다.** 수천 개 리소스에 표준 키를 한 번에 추가하는 작업은 스로틀링을 만드므로 단계적으로 적용한다.

## 연습문제

**1. 영구 diff를 만들고 두 방법으로 없앤다.** subnet을 만든 뒤 콘솔이나 CLI로 `kubernetes.io/role/elb = 1` 태그를 붙이고 plan을 뜬다. 그다음 (a) `lifecycle.ignore_changes`, (b) provider `ignore_tags.key_prefixes` 로 각각 해결한다.
*성공 기준:* 해결 전 plan과 두 해법 각각의 빈 plan을 제시하고, 리소스가 20개로 늘었을 때 어느 쪽이 나은지 이유와 함께 답한다.

**2. 병합과 우선순위를 실증한다.** `ignore_tags { keys = ["A"] }` 와 `TF_AWS_IGNORE_TAGS_KEYS=B` 를 동시에 걸고, 별도로 `default_tags` 의 같은 키를 인수와 `TF_AWS_DEFAULT_TAGS_<키>` 양쪽에 다른 값으로 건다.
*성공 기준:* 앞은 A와 B가 **모두** 무시되고, 뒤는 provider 인수 값 하나만 `tags_all` 에 남는 것을 출력으로 보인다.

**3. 태그 정책을 코드로 만들고 걸린다.** 샌드박스 조직에서 `aws_organizations_policy` 로 특정 리소스 타입에 필수 키를 붙이고 `tag_policy_compliance = "error"` 로 위반 리소스를 만든다.
*성공 기준:* plan에서 실패하는 출력과 `default_tags` 로 키를 채워 통과시킨 출력을 나란히 제시하고, `ListRequiredTags` 권한이 없을 때의 동작도 기록한다.

## 요약

- provider는 `tags` 를 전량 관리하고 `aws:` 접두어만 예외로 둔다. Kubernetes, CMDB, 비용·보안 도구가 붙이는 태그가 **영구 diff**가 되는 이유다. 고칠 것은 태그가 아니라 소유권 선언이다.
- 리소스 단위 해법은 `lifecycle { ignore_changes = [tags] }` 이고, 개별 키만 무시하려면 `tags["Name"]` 처럼 대괄호로 지정한다. `tags_all` 을 지정하면 `default_tags` 를 합친 최종 결과가 기준이 된다. 리소스마다 반복해야 한다는 것이 한계다.
- provider 단위 해법은 `ignore_tags` 의 `keys` 와 `key_prefixes` 다(2.60.0+). **provider 인스턴스마다 따로 적어야 하고** `aws_ec2_tag` 같은 개별 태그 리소스에는 적용되지 않는다.
- `TF_AWS_IGNORE_TAGS_KEYS` / `TF_AWS_IGNORE_TAGS_KEY_PREFIXES` 는 쉼표로 구분하며 provider 인수와 **병합**되고, `default_tags` 와 `tag_policy_compliance` 는 **provider 인수가 우선**한다. `ignore_tags` 를 켜도 리소스 `tags` 에 그 키가 남아 있으면 **영구 diff가 난다** — 코드에서 키를 빼거나 `ignore_changes` 를 함께 쓴다.
- `aws_ec2_tag` 는 `resource_id`·`key`·`value` 를 받고 `id` 와 import ID가 `<리소스ID>,<키>` 형식이다. **Terraform이 관리하는 부모 리소스와 결합하면 안 된다.** `aws_autoscaling_group` 은 `default_tags` 의 예외이므로 `aws_default_tags` 데이터 소스를 `dynamic "tag"` 로 풀고 `propagate_at_launch` 를 정해 인스턴스까지 전파한다.
- `tag_policy_compliance` 는 `error`/`warning`/`disabled` 를 받고 미설정은 `disabled` 와 같다. 태그 정책이 붙은 계정과 `ListRequiredTags` 권한이 전제이며 검사는 **리소스 타입별 필수 태그 키**만 본다. 생성 전과 `tags` 수정 전에 돌고 **태그와 무관한 업데이트는 항상 허용된다.** SDK V2 리소스는 경고 진단을 낼 수 없어 로그로만 보인다.
- 조직 표준은 필수 키(5개 이하) + 값 규칙(대소문자 구분) + 3층 강제(코드 리뷰 / provider 검사 / SCP)로 설계한다.

## 다음으로

- [24장 — Enhanced Region Support](24-enhanced-region-support.md) — 여러 리전에 걸친 provider 설정과 태그 설정의 상호작용.
- [25장 — 멀티 계정](25-multi-account.md) — alias provider마다 `ignore_tags` 를 반복해야 하는 이유.
- [46장 — 태깅 구현](../level3-advanced/46-implementing-tagging.md) — provider가 태그를 처리하는 방식을 내부에서 본다.
- 공식 문서: [Resource Tagging](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging) / [Tag Policy Compliance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/tag-policy-compliance)
