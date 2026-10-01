---
chapter: 21
level: "Level 2 — 중급"
title: "lifecycle: 교체·보호·무시·트리거"
difficulty: 중급
reading_time: "33분"
prerequisites: [6, 9]
source_docs:
  - "website/docs/r/security_group.html.markdown"
  - "website/docs/r/acm_certificate.html.markdown"
  - "website/docs/r/ecs_service.html.markdown"
  - "website/docs/r/eks_node_group.html.markdown"
  - "website/docs/r/dynamodb_table.html.markdown"
  - "website/docs/r/rds_cluster.html.markdown"
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/r/instance.html.markdown"
  - "website/docs/r/autoscaling_group.html.markdown"
  - "website/docs/r/lambda_permission.html.markdown"
  - "website/docs/guides/resource-tagging.html.markdown"
source_url: "https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle"
provider_baseline: "6.x"
---

# 21장 — lifecycle: 교체·보호·무시·트리거

**이 장에서 배우는 것**

- `create_before_destroy` 가 왜 필요한지, 의존 리소스로 어떻게 번지는지, `name_prefix` 가 왜 짝을 이루는지 설명하고 쓸 수 있다.
- `prevent_destroy` 가 막는 것과 **막지 못하는 것**을 구분하고 RDS·S3에 거는 실전 패턴의 한계를 안다.
- `ignore_changes` 를 태그·`desired_count`·AMI 같은 외부 변경에 적용하고, `all` 의 위험과 "drift를 숨긴다"는 문제를 판단 기준으로 삼을 수 있다.
- `replace_triggered_by` 로 다른 리소스의 변경을 교체로 연결하고, `precondition`/`postcondition` 으로 plan·apply 시점 검증을 넣을 수 있다.
- `timeouts` 블록과 CLI의 `-replace=`·`-target` 이 lifecycle과 어떻게 다른 도구인지 안다.

**왜 중요한가**

security group의 `description` 을 오타 하나 고치려고 바꿨다. plan에 `# forces replacement` 가 떴고, 그대로 apply 했더니 `DependencyViolation` 으로 20분간 매달리다 실패했다. 그 security group은 EC2 인스턴스 12대와 RDS 하나에 붙어 있었고, AWS는 참조 중인 security group을 지우지 못한다. Terraform이 삭제를 먼저 시도했으므로 새것을 만들지도 옛것을 지우지도 못한 채 apply가 반쯤 진행된 상태로 멈췄다.

반대 방향의 사고도 흔하다. 어느 팀이 ECS 서비스에 `desired_count = 2` 를 적어 두고 Application Auto Scaling을 붙였다. 트래픽이 몰려 태스크가 20개로 늘어난 금요일 밤, 다른 사람이 무관한 태그 변경을 apply 했다. Terraform은 "설정은 2인데 현실은 20"이라 판단해 **태스크 18개를 죽였다.** 태그 한 줄이 장애가 됐다.

세 번째는 조용히 온다. `ignore_changes = all` 을 걸어 둔 리소스는 plan에 영원히 나타나지 않는다. 6개월 뒤 보안 감사에서 그 보안 그룹의 인바운드가 `0.0.0.0/0` 으로 열려 있다는 것이 드러났다. 누군가 콘솔에서 바꿨고 Terraform은 볼 수 있었지만 보지 않기로 설정돼 있었다. **`ignore_changes` 는 drift를 숨길 뿐이다.**

## lifecycle은 provider가 아니라 Terraform에게 하는 말

`lifecycle` 은 모든 리소스가 쓸 수 있는 **메타 인수 블록**이다. AWS API로 전달되지 않고 Terraform 코어가 plan을 만들 때의 행동을 바꾼다. 그래서 리소스 종류와 무관하게 문법이 같고, 리소스 문서의 Argument Reference에는 나오지 않는다.

```terraform
resource "aws_security_group" "app" {
  name_prefix = "app-"

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [tags["LastScanned"]]
    replace_triggered_by  = [aws_launch_template.app]

    precondition {
      condition     = var.vpc_id != ""
      error_message = "vpc_id는 비어 있을 수 없다."
    }
  }
}
```

들어갈 수 있는 것은 네 인수 — `create_before_destroy`, `prevent_destroy`, `ignore_changes`, `replace_triggered_by` — 와 두 검증 블록 `precondition`·`postcondition` 이다. 제약이 하나 있다. **앞의 세 인수는 리터럴 값만 받는다.** 변수도, `local` 도, 다른 리소스 참조도 쓸 수 없다.

```terraform
lifecycle {
  prevent_destroy = var.is_production   # ❌ Variables not allowed
}
```

Terraform이 lifecycle을 그래프를 만들기 **전에** 읽기 때문이다. 그래서 "prod에서만 보호하고 싶다"는 요구를 lifecycle 하나로는 표현할 수 없고, 환경별로 모듈을 나누거나 정책 도구로 옮겨야 한다. `replace_triggered_by` 는 예외적으로 리소스 참조를, `precondition`/`postcondition` 은 일반 표현식을 받는다.

## `create_before_destroy`: 순서를 뒤집는다

Terraform이 리소스를 교체할 때의 기본 순서는 **파괴 후 생성**이다. 이 순서가 문제가 되는 경우는 둘이다. 하나는 **이름 충돌** — AWS의 많은 리소스가 리전·계정 안에서 이름 유일성을 요구한다. 다른 하나는 **삭제 거부** — 다른 리소스가 참조 중이면 삭제 자체가 안 된다. `create_before_destroy = true` 는 순서를 **생성 → 참조 교체 → 파괴**로 뒤집는다.

`aws_security_group` 문서는 두 번째 문제를 "Security Group Deletion Problem"이라는 이름으로 다룬다. security group의 `name`·`description`·`name_prefix`·`vpc_id` 는 모두 `(Optional, Forces new resource)` 라서 바꾸면 교체가 일어난다. 그런데 security group은 **AWS Provider 리소스 100종 이상**이 참조하고, 참조는 코드상 한 방향(인스턴스 → security group)이지만 삭제 제약은 반대 방향으로도 걸린다. Terraform은 이런 **양방향 의존성을 모델링하지 않고**, 삭제가 거부될 때 돌아오는 에러도 무엇이 걸고 있는지 알려 주지 않는다.

문서가 제시하는 첫 처방이 이것이다.

```terraform
resource "aws_security_group" "example" {
  name = "changeable-name"
  # ... 나머지 설정 ...

  lifecycle {
    create_before_destroy = true
  }
}
```

`aws_acm_certificate` 문서도 같은 권고를 한다 — `aws_lb_listener` 등이 사용 중인 인증서를 교체하려면 `create_before_destroy = true` 를 지정하는 것이 권장된다.

### 전파된다

가장 자주 놓치는 부분이다. **`create_before_destroy` 는 그 리소스가 의존하는 리소스로 번진다.** A가 B를 참조하고 A에 걸려 있다면 B도 같은 방식으로 교체돼야 한다. 새 A를 만들려면 새 B가 먼저 있어야 하기 때문이다. Launch Template + ASG 조합이 전형이다.

```terraform
resource "aws_launch_template" "app" {
  name_prefix = "app-"
  image_id    = data.aws_ami.al2023.id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "app" {
  name_prefix = "app-"
  min_size    = 2
  max_size    = 10

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  lifecycle {
    create_before_destroy = true
  }
}
```

전파를 잊고 ASG에만 걸면, ASG를 새로 만들려는데 참조 대상 Launch Template이 이미 파괴 대기 상태가 되어 apply가 꼬인다.

### `name_prefix` 가 짝을 이루는 이유

`create_before_destroy` 는 이름 충돌을 스스로 해결하지 않는다. 옛것과 새것이 잠시 **동시에 존재**하므로 이름이 같으면 생성이 실패한다. 그래서 AWS Provider는 이름을 요구하는 리소스마다 `name_prefix` 를 제공한다 — `aws_security_group` 의 `name_prefix` 는 지정한 접두어로 시작하는 유일한 이름을 만들고 `name` 과 충돌하며(둘 다 `Forces new resource`), `aws_autoscaling_group` 의 `name` 은 생략하면 Terraform이 만들고 `name_prefix` 와 충돌하며, `aws_launch_template` 도 같다.

규칙은 간단하다. **`create_before_destroy` 를 거는 리소스에는 `name` 대신 `name_prefix` 를 쓴다.** 하나만 하고 다른 하나를 빼면 apply 중에 `AlreadyExists` 계열 에러를 만난다.

### 대가

무료가 아니다. 교체 동안 리소스가 **두 벌** 존재하므로 NAT Gateway나 RDS처럼 비싼 리소스라면 교체 창 동안 요금이 두 배이고 서브넷 IP·ENI·Elastic IP 할당량도 두 배로 필요하다. 그리고 "옛것이 살아 있는 동안 새것이 트래픽을 받는" 짧은 구간이 생겨, 상태를 가진 리소스라면 정합성 문제가 될 수 있다.

## `prevent_destroy`: 막는 것과 못 막는 것

```terraform
lifecycle {
  prevent_destroy = true
}
```

이 리소스를 파괴하는 plan이 만들어지면 apply가 아니라 **plan 단계에서 에러로 멈춘다.** `terraform destroy` 도, ForceNew 인수 변경으로 인한 교체도 막힌다. 문제는 **막지 못하는 것**이다.

- **설정에서 리소스 블록을 지우면 막지 못한다.** `prevent_destroy` 도 함께 지워지기 때문이다. 리소스를 통째로 삭제하는 PR은 아무 저항 없이 통과한다 — 실무에서 가장 흔한 삭제 경로다.
- **`terraform state rm` 도, AWS 콘솔·CLI 삭제도 막지 못한다.** Terraform 밖의 일에는 힘이 없다.
- **모듈 밖에서 끌 수 없다.** 리터럴만 받으므로 변수화가 불가능하다.

그래서 실전에서는 **AWS 쪽 방어와 겹쳐 쓴다.**

```terraform
resource "aws_db_instance" "prod" {
  identifier                = "shop-prod"
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "shop-prod-final"

  lifecycle {
    prevent_destroy = true
  }
}
```

`aws_db_instance` 의 `deletion_protection` 은 기본값이 `false` 이고 `true` 면 **AWS가 삭제를 거부한다** — 코드 경로와 무관하다. `skip_final_snapshot` 은 기본값이 `false` 이며, `false` 일 때는 `final_snapshot_identifier` 를 반드시 줘야 한다. 세 겹을 함께 걸어야 실제 방어가 된다. S3라면 `force_destroy` 를 켜지 않는 것, 버저닝, 버킷 정책의 `Deny` 를 겹친다.

## `ignore_changes`: 외부가 바꾸는 값

오토스케일러, 배포 파이프라인, 태깅 봇, AWS 자신 — Terraform 밖의 시스템이 값을 바꾸면 Terraform은 매번 "설정과 다르다"며 되돌리려 한다. `ignore_changes` 는 **그 인수의 diff를 계산에서 제외**한다.

```terraform
resource "aws_ecs_service" "app" {
  name          = "app"
  cluster       = aws_ecs_cluster.main.id
  desired_count = 2

  lifecycle {
    ignore_changes = [desired_count]
  }
}
```

`aws_ecs_service` 문서가 직접 제시하는 패턴이다 — 초기 태스크 수를 정해 서비스를 만든 뒤 Application Auto Scaling 같은 외부 요인의 변경을 무시한다. `desired_count` 는 Optional이고 기본값은 0이며 `DAEMON` 스케줄링 전략에서는 지정하면 안 된다. 같은 처방이 여러 문서에 반복해 나온다.

- `aws_eks_node_group`: `ignore_changes = [scaling_config[0].desired_size]` — 중첩 블록 안의 속성을 인덱스로 지목한다.
- `aws_dynamodb_table`: 오토스케일링 정책이 붙어 있으면 `read_capacity`·`write_capacity` 에 권장되고, `aws_dynamodb_table_replica` 를 함께 쓰면 `ignore_changes = [replica]` 를 쓴다.
- `aws_rds_cluster`: `availability_zones` 를 3개 미만으로 설정하면 RDS가 자동으로 3개를 배정해 **재생성이 필요한 차이**로 나타난다. 3개를 명시하거나 `ignore_changes` 를 쓰라고 적혀 있다.
- `aws_organizations_account`: `role_name` 은 계정 생성 후 읽을 API가 없어 import 뒤 **항상** 차이를 보인다.

### 태그: 전부인가 하나인가

태깅 가이드는 두 단계를 구분한다.

```terraform
lifecycle {
  ignore_changes = [tags]        # 생성 이후 모든 태그 추가·삭제·변경을 무시
}

lifecycle {
  ignore_changes = [tags.Name]   # Name 값의 외부 변경만 무시, 나머지는 계속 관리
}
```

대개 뒤가 옳다. provider의 `ignore_tags` 와의 관계도 알아 둘 만하다. `ignore_tags` 는 provider 수준에서 특정 키를 diff에서 빼지만, **그 키가 여전히 리소스의 `tags` 인수에 적혀 있으면 영구 diff가 남는다.** provider 문서는 인수에서 태그를 지우거나 `ignore_changes` 를 함께 쓰라고 적는다([23장](23-tagging-strategy.md)).

### `all` 의 위험

```terraform
lifecycle {
  ignore_changes = all
}
```

이것은 "이 리소스는 생성 이후 Terraform이 관리하지 않는다"는 선언과 같다. 인수를 고쳐도 plan에 아무것도 나오지 않고 콘솔에서 무엇을 바꿔도 감지되지 않는다. 리소스는 state에 남지만 코드는 더 이상 진실이 아니다. 정당한 용도는 좁고, 그런 경우라면 대개 리소스가 아니라 **데이터 소스**가 맞는 답이다([8장](../level1-beginner/08-data-sources.md)).

### 근본 문제: drift를 숨긴다

`ignore_changes` 는 diff를 **해결하지 않고 가린다.** plan이 깨끗해 보이지만 실제 상태는 코드와 다르다. 그 리소스를 언젠가 교체하면 **코드의 값으로 다시 만들어져** 무시하던 값이 조용히 되돌아온다. 새로 합류한 사람은 코드를 읽고 `desired_count = 2` 라고 믿고, 보안 관련 인수에 걸면 감사가 무력화된다.

판단 기준은 하나다. **"이 값은 Terraform이 소유하지 않는다"가 팀의 명시적 결정인가?** 그렇다면 맞는 도구이고 코드에 소유자를 주석으로 적어 둔다. 단지 "diff가 거슬려서"라면 틀렸다. 그때의 답은 코드를 현실에 맞추거나 관리 경계를 다시 긋거나 `check` 블록으로 drift를 감시하는 것이다([36장](../level3-advanced/36-drift-refresh-and-checks.md)).

## `replace_triggered_by`: 남이 바뀌면 나를 갈아 끼운다

`ignore_changes` 의 반대편이다. 자기 인수는 그대로인데 **다른 리소스가 바뀌면 교체**된다.

```terraform
resource "aws_lambda_permission" "logging" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.example.function_name
  principal     = "events.amazonaws.com"

  lifecycle {
    replace_triggered_by = [aws_lambda_function.example]
  }
}
```

`aws_lambda_permission` 문서의 예제로, Lambda 함수가 바뀔 때 권한 리소스를 새로 만들어 둘의 수명을 묶는다. `aws_security_group` 문서도 다른 각도의 예제를 준다 — 인스턴스에 `replace_triggered_by = [aws_security_group.example]` 을 걸어 security group이 바뀔 때마다 인스턴스를 교체한다. 문서는 그 인스턴스가 **파괴되고 다시 만들어진다**는 사실을 굳이 명시한다. 의도한 것이 아니면 재앙이기 때문이다.

쓸 때의 규칙 셋.

- **참조 대상은 관리 리소스뿐이다.** 데이터 소스·변수·`local`·모듈은 안 된다.
- **범위를 좁게 잡는다.** `[aws_launch_template.app]` 전체보다 `[aws_launch_template.app.latest_version]` 처럼 특정 속성을 가리키는 편이 예상치 못한 교체를 줄인다.
- **교체 비용을 먼저 계산한다.** 상태를 가진 리소스(RDS, EBS)에 걸면 데이터를 잃는다.

ASG에는 더 나은 대안이 있다. `aws_autoscaling_group` 의 `instance_refresh` 블록은 `launch_configuration`·`launch_template`·`mixed_instances_policy` 중 하나가 바뀌면 인스턴스 갱신을 시작하고 `triggers` 로 항목을 추가할 수 있다. ASG 자체를 교체하는 것보다 안전하다([28장](28-compute-asg-alb.md)).

## `precondition` / `postcondition`: 가정을 코드로 적는다

Terraform 1.2부터 `lifecycle` 안에 검증 블록을 넣는다.

```terraform
resource "aws_instance" "app" {
  ami       = data.aws_ami.al2023.id
  subnet_id = aws_subnet.private[0].id

  lifecycle {
    precondition {
      condition     = data.aws_ami.al2023.architecture == "x86_64"
      error_message = "AMI 아키텍처가 x86_64가 아니다: ${data.aws_ami.al2023.architecture}"
    }

    postcondition {
      condition     = self.private_ip != null
      error_message = "인스턴스에 프라이빗 IP가 할당되지 않았다."
    }
  }
}
```

둘의 차이는 **시점**이다. `precondition` 은 리소스를 만들거나 바꾸기 **전에** 검사하고, 값이 plan 시점에 알려져 있으면 plan에서 실패하므로 apply에 도달하지 않는다 — "내가 받은 입력이 내 가정과 맞는가". `postcondition` 은 **후에** 검사하며 `self` 로 자기 속성을 참조할 수 있어 `(known after apply)` 였던 값도 확인한다 — "결과가 내 기대와 맞는가".

에러 메시지 설계가 이 기능의 절반이다. 사람이 읽는 것은 `condition` 이 아니라 `error_message` 다.

```terraform
# ❌ 무엇을 해야 하는지 알 수 없다
error_message = "잘못된 값"

# ✅ 무엇이 왜 틀렸고 무엇을 해야 하는지 적는다
error_message = "subnet ${var.subnet_id} 는 퍼블릭 서브넷이다. RDS는 프라이빗 서브넷에만 배치한다."
```

값 자체의 형식 검증(길이, 정규식, 허용 목록)은 `variable` 의 `validation` 블록이 더 알맞다([7장](../level1-beginner/07-variables-outputs-locals.md)). `precondition` 은 **여러 값 사이의 관계**나 데이터 소스 결과처럼 변수 하나로는 검사할 수 없는 가정에 쓴다. 배포 후에도 계속 감시해야 하는 조건이라면 실패해도 apply를 막지 않는 `check` 블록이 답이다([36장](../level3-advanced/36-drift-refresh-and-checks.md)).

## `timeouts` 는 lifecycle이 아니다

혼동하기 쉬운 이웃이다.

```terraform
resource "aws_security_group" "example" {
  name = "izizavle"
  # ... 나머지 설정 ...

  timeouts {
    delete = "2m"
  }
}
```

**`lifecycle` 은 Terraform 코어가, `timeouts` 는 provider가 처리한다.** 그래서 `lifecycle` 은 모든 리소스에 있고 `timeouts` 는 **그 리소스 문서에 Timeouts 절이 있을 때만** 쓸 수 있으며, 지원되는 키도 기본값도 리소스마다 다르다([14장](../level1-beginner/14-reading-resource-docs.md)).

위 예제는 `aws_security_group` 문서가 제안하는 실전 요령이다. security group 삭제가 오래 걸리는 이유는 Terraform이 "삭제 중인 종속 객체"와 "그냥 남아 있는 객체"를 구별하지 못해서인데, 문서는 이것을 "오지 않을 열차를 기다리는 것"에 비유한다. `delete` 타임아웃을 줄이면 **빨리 실패해서** 원인을 빨리 본다. 같은 문서는 마지막 수단으로 local provisioner도 보여 주지만 읽기 어렵고 오류가 나기 쉬우며 AWS CLI 설치를 요구한다는 이유로 **강하게 만류한다.**

## CLI 쪽 대응물: `-replace=` 와 `-target`

lifecycle이 설정에 적는 영구 규칙이라면 CLI 옵션은 이번 한 번만의 지시다.

**`-replace=ADDRESS`** 는 지정한 리소스를 이번 apply에서 교체한다. 옛 `terraform taint`/`untaint` 를 대체한 방식으로, taint와 달리 state를 미리 바꾸지 않고 **plan에 교체 계획으로 나타나므로 승인 전에 볼 수 있다.** 인스턴스가 이상해졌는데 원인을 모를 때, 설정 변경 없이 재생성하고 싶을 때 쓴다.

```console
$ terraform apply -replace="aws_instance.app"
```

**`-target=ADDRESS`** 는 그래프의 일부만 계획·적용한다. 편해 보이지만 대가가 크다 — **그래프가 잘려** 나머지가 낡은 상태로 남고, **다음 plan이 예상 밖이 되며**(건너뛴 변경이 한꺼번에 튀어나온다), Terraform 자신이 "예외적 상황을 위한 것이며 일상적으로 쓰지 말라"는 취지의 경고를 붙인다.

정당한 용도는 순환 문제를 임시로 푸는 경우, 대량 import 후 부분 검증([20장](20-import-and-resource-identity.md)), 장애 대응 중 한 리소스만 급히 고치는 경우다. **CI 파이프라인에 `-target` 이 상수로 박혀 있다면 그것은 설계 문제의 증상이지 해법이 아니다.**

## AWS 실전 세 장면

**1. security group의 `description` 을 고쳐야 한다.** `description` 은 `(Optional, Forces new resource)` 이고, 문서는 이 필드가 AWS의 `GroupDescription` 에 대응하며 **Update API가 없다**고 명시한다. AWS 자체가 수정을 지원하지 않는 것이다. 분류 목적이라면 문서 권고대로 `description` 대신 **`tags` 를 쓴다.** 정말 바꿔야 한다면 `name_prefix` + `create_before_destroy` 를 걸고, 그 security group을 참조하는 리소스가 새 ID로 갱신될 수 있는지 먼저 확인한다.

**2. ECS 서비스의 `desired_count` 를 오토스케일링에 양보한다.** 판단 기준은 "누가 이 값의 소유자인가"다. Application Auto Scaling을 붙였다면 소유자는 Terraform이 아니므로 `ignore_changes = [desired_count]` 를 걸고 코드의 값은 **초기 생성 값**이라는 주석을 남긴다. 오토스케일링이 없다면 걸지 않는다 — 그때는 Terraform이 소유자다.

**3. `aws_instance` 의 AMI 갱신을 무시할 것인가.** `ami` 가 바뀌면 인스턴스가 교체되고, `data "aws_ami"` 에 `most_recent = true` 를 쓰면 새 이미지가 나올 때마다 plan이 저절로 달라진다([11장](../level1-beginner/11-ec2-instance.md)). 선택지는 셋이다.

- **`ignore_changes = [ami]`** — 인스턴스가 안정되지만 **보안 패치가 영원히 적용되지 않는다.**
- **AMI ID를 변수로 고정** — 갱신이 명시적 PR이 되어 언제 교체될지 사람이 안다. 상태 없는 워크로드에 적합하다.
- **Launch Template + ASG로 옮긴다** — 교체가 롤링 갱신이라는 **정상 절차**가 되고 `instance_refresh` 가 그 일을 한다. 프로덕션의 답은 대개 이것이다.

`user_data` 도 함께 봐야 한다. `aws_instance` 문서는 `user_data`/`user_data_base64` 갱신이 기본적으로 인스턴스의 **stop/start를 유발**하고, `user_data_replace_on_change` 를 `true` 로 두면(기본값 `false`) **파괴 후 재생성**이 된다고 적는다.

## 흔한 실수

### ❌ `create_before_destroy` 만 걸고 `name_prefix` 를 빼먹는다

옛것과 새것이 잠시 동시에 존재하므로 이름이 겹치면 생성이 실패한다.

```terraform
resource "aws_security_group" "app" {
  name = "app-sg"

  lifecycle {
    create_before_destroy = true   # apply 중 InvalidGroup.Duplicate
  }
}
```

```terraform
# ✅ 이름을 provider가 만들게 한다. name 과 name_prefix 는 서로 충돌하므로 하나만 쓴다
resource "aws_security_group" "app" {
  name_prefix = "app-"

  lifecycle {
    create_before_destroy = true
  }
}
```

### ❌ `prevent_destroy` 를 걸어 두고 안전하다고 믿는다

리소스 블록을 지우는 PR에는 아무 저항이 없다.

```terraform
# 이 블록을 통째로 삭제하는 PR은 그냥 통과한다
resource "aws_s3_bucket" "logs" {
  bucket = "shop-prod-logs"

  lifecycle {
    prevent_destroy = true
  }
}
```

```terraform
# ✅ AWS 쪽 방어와 겹친다. deletion_protection 은 코드 경로와 무관하게 AWS가 강제한다
resource "aws_db_instance" "prod" {
  identifier                = "shop-prod"
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "shop-prod-final"

  lifecycle {
    prevent_destroy = true
  }
}
```

### ❌ diff가 거슬려서 `ignore_changes = all` 을 건다

그 순간부터 리소스는 코드로 관리되지 않는다. 콘솔에서 보안 그룹이 열려도 plan은 조용하다.

```terraform
resource "aws_security_group" "app" {
  lifecycle {
    ignore_changes = all
  }
}
```

```terraform
# ✅ 소유권이 넘어간 인수만 지목하고 이유를 남긴다
resource "aws_ecs_service" "app" {
  desired_count = 2   # 초기값. 이후 소유자는 Application Auto Scaling

  lifecycle {
    ignore_changes = [desired_count]
  }
}
```

전부를 무시해야 한다면 리소스가 아니라 데이터 소스로 다뤄야 할 대상이다.

### ❌ `replace_triggered_by` 를 상태 있는 리소스에 건다

교체는 데이터 삭제와 같은 말이다.

```terraform
resource "aws_db_instance" "app" {
  identifier = "app-db"

  lifecycle {
    replace_triggered_by = [aws_security_group.db]   # SG 태그만 바뀌어도 DB가 날아간다
  }
}
```

```terraform
# ✅ 무상태 리소스에, 특정 속성으로 좁혀서 건다
resource "aws_lambda_permission" "logging" {
  function_name = aws_lambda_function.example.function_name

  lifecycle {
    replace_triggered_by = [aws_lambda_function.example.source_code_hash]
  }
}
```

## 프로덕션 노트

- **`create_before_destroy` 는 할당량 사고를 만든다.** 교체 창 동안 리소스가 두 벌 존재하므로 서브넷 IP, ENI, Elastic IP, vCPU 한도를 미리 확인한다. ASG에 걸면 순간적으로 인스턴스 수가 두 배가 될 수 있다.
- **`ignore_changes` 는 리뷰 대상으로 만든다.** 추가하는 PR에 "무엇을, 왜, 누가 소유하는가"를 적게 하고 분기마다 목록을 훑는다. 조용히 늘어나는 것이 이 기능의 본질적 위험이다.
- **`prevent_destroy` 는 CI 가드레일과 짝을 이룬다.** plan 출력에서 `will be destroyed` 를 grep 해 프로덕션에서 사람 승인을 강제하는 편이, 리터럴 제약에 묶인 `prevent_destroy` 하나보다 넓게 방어한다.
- **lifecycle은 모듈 경계를 넘지 못한다.** 모듈 사용자가 밖에서 `lifecycle` 을 주입할 방법이 없으므로, `create_before_destroy` 를 넣을지는 모듈 작성자가 결정해야 한다([19장](19-modules.md)). `postcondition` 은 리소스가 이미 만들어진 뒤 실패하므로 state에는 남고 apply만 에러로 끝난다는 점도 함께 기억한다.
- **교체가 잦은 리소스는 `-replace=` 로 리허설한다.** 프로덕션에서 처음 교체를 겪지 않도록 스테이징에서 한 번 갈아 끼워 본다.

## 연습문제

**1. 교체 순서를 눈으로 확인한다.** security group을 만들어 EC2 인스턴스에 붙인 뒤 `description` 을 바꿔 apply 한다. 실패를 확인하고 `name_prefix` + `create_before_destroy` 로 고쳐 다시 시도한다.
*성공 기준:* 첫 시도의 에러와 두 번째 시도의 apply 로그에서 생성이 파괴보다 먼저 일어난 것을 각각 제시할 수 있다.

**2. `prevent_destroy` 의 구멍을 재현한다.** `prevent_destroy = true` 를 건 S3 버킷에 (a) `terraform destroy`, (b) 리소스 블록 삭제 후 apply를 각각 시도한다.
*성공 기준:* (a)는 plan 단계에서 막히고 (b)는 막히지 않음을 출력으로 보이고, (b)를 막을 AWS 쪽 설정을 하나 이상 제시한다.

**3. drift가 숨는 것을 확인한다.** `ignore_changes = [tags.Owner]` 를 건 VPC의 `Owner` 태그를 콘솔에서 바꾼 뒤 그 VPC를 강제 교체한다.
*성공 기준:* 태그 변경 후 plan이 비어 있고, 교체 후 `Owner` 가 코드의 값으로 되돌아온 것을 `terraform state show` 로 확인한다.

**4. 검증 블록을 설계한다.** 프라이빗 서브넷에만 배치돼야 하는 RDS에 `precondition` 을 걸고, 엔드포인트가 비어 있지 않은지 `postcondition` 으로 확인한다.
*성공 기준:* 퍼블릭 서브넷을 넘겼을 때 **plan 단계에서** 실패하고, 에러 메시지만 읽고도 무엇을 고쳐야 하는지 알 수 있다.

## 요약

- `lifecycle` 은 Terraform 코어의 메타 인수 블록이다. `create_before_destroy`·`prevent_destroy`·`ignore_changes`·`replace_triggered_by` 네 인수와 `precondition`·`postcondition` 두 검증 블록이 들어가며, 앞의 세 인수는 **리터럴 값만** 받는다.
- `create_before_destroy` 는 교체 순서를 뒤집는다. **의존하는 리소스로 전파되고**, 이름 충돌을 피하려면 `name_prefix` 와 짝지어야 하며, 교체 창 동안 리소스가 두 벌 존재하는 비용을 치른다.
- `aws_security_group` 의 `name`·`description`·`name_prefix`·`vpc_id` 는 모두 `Forces new resource` 다. `description` 은 AWS에 Update API가 없어 수정할 수 없으므로 갱신 가능한 분류에는 `tags` 를 쓴다.
- `prevent_destroy` 는 파괴 계획을 plan 단계에서 막지만 **리소스 블록 삭제·`state rm`·콘솔 삭제는 막지 못한다.** `deletion_protection` 같은 AWS 쪽 방어와 겹쳐야 실제 방어가 된다.
- `ignore_changes` 는 외부 소유 값에 쓴다 — ECS `desired_count`, EKS `scaling_config[0].desired_size`, DynamoDB 용량, RDS `availability_zones`, 태그. `all` 은 리소스를 코드 관리 밖으로 내보내는 것과 같고, 이 기능은 diff를 해결하지 않고 **drift를 숨긴다.**
- `replace_triggered_by` 는 다른 관리 리소스가 바뀔 때 교체를 유발한다. 데이터 소스·변수·모듈은 참조할 수 없고 상태를 가진 리소스에 걸면 데이터를 잃는다. ASG에는 `instance_refresh` 가 더 안전한 대안이다.
- `precondition` 은 변경 전, `postcondition` 은 변경 후에 검사하며 후자는 `self` 로 자기 속성을 참조할 수 있다. `timeouts` 는 provider가 처리하는 별개 블록이고, CLI의 `-replace=` 는 이번 apply만의 교체 지시이며 `-target` 은 그래프를 잘라 다음 plan을 예상 밖으로 만든다.

## 다음으로

- [22장 — moved · removed: 상태를 깨지 않고 리팩터링하기](22-moved-removed-refactoring.md) — 교체를 피하는 또 하나의 도구.
- [28장 — 컴퓨트: Launch Template + ASG + ALB](28-compute-asg-alb.md) — `create_before_destroy` 와 `instance_refresh` 의 실전.
- [36장 — Drift · refresh · check 블록과 지속 검증](../level3-advanced/36-drift-refresh-and-checks.md) — `ignore_changes` 로 숨긴 것을 다시 드러내는 방법.
- 공식 문서: [The lifecycle Meta-Argument](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle)
