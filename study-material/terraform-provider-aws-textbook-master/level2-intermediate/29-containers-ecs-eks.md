---
chapter: 29
level: "Level 2 — 중급"
title: "컨테이너: ECR · ECS/Fargate · EKS와 Terraform의 경계선"
difficulty: 심화
reading_time: "38분"
prerequisites: [13, 27, 28]
source_docs:
  - "website/docs/r/ecr_repository.html.markdown"
  - "website/docs/r/ecs_cluster.html.markdown"
  - "website/docs/r/ecs_task_definition.html.markdown"
  - "website/docs/r/ecs_service.html.markdown"
  - "website/docs/r/eks_cluster.html.markdown"
  - "website/docs/r/eks_node_group.html.markdown"
  - "website/docs/r/iam_openid_connect_provider.html.markdown"
  - "website/docs/r/cloudwatch_log_group.html.markdown"
  - "website/docs/ephemeral-resources/eks_cluster_auth.html.markdown"
  - "website/docs/guides/version-6-upgrade.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service"
provider_baseline: "6.x"
---

# 29장 — 컨테이너: ECR · ECS/Fargate · EKS와 Terraform의 경계선

**이 장에서 배우는 것**

- 이미지 빌드·푸시와 인프라 선언 사이에 경계를 긋고, 어디까지를 Terraform이 맡을지 정할 수 있다.
- `aws_ecs_task_definition` 이 매 apply마다 새 리비전을 만드는 구조를 이해하고 `execution_role_arn` 과 `task_role_arn` 을 구분해 부여할 수 있다.
- `aws_ecs_service` 의 배포 컨트롤러·circuit breaker·`wait_for_steady_state` 를 조합해 실패한 배포가 자동으로 멈추게 만들 수 있다.
- `aws_eks_cluster` 의 `access_config.authentication_mode` 로 aws-auth ConfigMap 없이 접근 권한을 관리하고 `bootstrap_self_managed_addons` 의 함정을 피할 수 있다.
- IRSA를 `aws_iam_openid_connect_provider` 와 신뢰 정책 조건으로 직접 구성하고, `ephemeral_aws_eks_cluster_auth` 로 kubernetes provider를 인증할 수 있다.

**왜 중요한가**

컨테이너 스택에서 Terraform이 가장 자주 사고를 내는 지점은 "Terraform이 하지 말아야 할 일을 하는 것"이다. `null_resource` 와 `local-exec` 로 `docker build && docker push` 를 돌리는 코드는 어디에나 있다. 그 코드는 CI 러너에 도커 데몬을 요구하고 plan에 아무것도 보여주지 않으며, 태그가 `latest` 면 apply를 몇 번 해도 서비스가 바뀌지 않는다. 빌드가 실패하면 인프라 apply 전체가 멈춘다.

두 번째는 IAM 롤 두 개를 헷갈리는 것이다. ECS 태스크에는 `execution_role_arn` 과 `task_role_arn` 이 따로 있다. 앞의 것은 **ECS 에이전트가**(ECR pull, 로그 스트림 생성), 뒤의 것은 **컨테이너 안의 애플리케이션이** 쓴다. S3 권한을 execution role에 붙이면 애플리케이션은 여전히 `AccessDenied` 를 받고, ECR pull 권한을 task role에만 붙이면 태스크가 `CannotPullContainerError` 로 아예 뜨지 않는다. 증상이 달라 원인을 찾는 데 반나절이 간다.

세 번째는 삭제 교착이다. ECS 서비스를 지우려면 태스크가 모두 빠져야 하는데, 그 정리에 필요한 IAM 정책을 Terraform이 먼저 지워버리면 서비스가 `DRAINING` 에서 굳는다. 원문이 문서 첫 줄에서 경고한다 — 관련 `aws_iam_role_policy` 에 `depends_on` 을 걸라는 것. 이 한 줄이 없으면 `destroy` 가 20분 timeout을 채우고 실패한다.

## 이미지 빌드는 Terraform의 일이 아니다

원칙은 단순하다. **Terraform은 "이미지를 담을 곳"과 "그 이미지를 실행할 것"을 선언하고, 이미지 자체는 CI가 만든다.** CI가 커밋 SHA로 태그한 이미지를 ECR에 푸시하고 그 태그를 Terraform 변수(`var.image_tag`)나 SSM Parameter로 넘기면, Terraform은 `"${aws_ecr_repository.app.repository_url}:${var.image_tag}"` 로 태스크 정의를 만든다. 태그가 바뀌면 태스크 정의에 diff가 생기고 서비스가 새 리비전을 참조하며 배포가 일어난다. `latest` 태그를 쓰면 이 연결 고리가 끊어져 apply가 무변경이 되고, 그때는 `force_new_deployment = true` 같은 우회에 의존해야 한다.

## ECR: 이미지를 담을 곳

```terraform
resource "aws_ecr_repository" "app" {
  name                 = "payments/api"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
}
```

**`image_tag_mutability` 기본값은 `MUTABLE`** 이다. 아무 설정도 하지 않으면 `v1.2.3` 태그를 덮어쓸 수 있고 프로덕션에서 돌던 이미지가 조용히 바뀔 수 있다. `IMMUTABLE` 이면 같은 태그 재푸시가 거부된다. 절충안으로 `IMMUTABLE_WITH_EXCLUSION` 과 `MUTABLE_WITH_EXCLUSION` 이 있고 이때만 `image_tag_mutability_exclusion_filter` 블록을 쓸 수 있다(`filter` 는 최대 128자·와일드카드 2개, `filter_type` 은 `WILDCARD` 만 유효). `dev-*` 만 덮어쓰기를 허용하고 나머지는 불변으로 두는 식이다.

`image_scanning_configuration.scan_on_push` 는 블록 안에서 **Required**다. 원문은 기본 상태의 이미지 스캔이 **수동 트리거**라고 명시한다. `encryption_type` 기본값은 `AES256` 이고 `KMS` 로 바꾸면 `kms_key` 를 지정한다. `force_delete` 기본값은 `false` 라 이미지가 남은 리포지터리는 destroy가 실패한다 — 실수 방지 장치이므로 임시 환경에서만 `true` 로 둔다. 삭제 timeout 기본값은 20분이다. 이미지가 무한히 쌓이지 않도록 `aws_ecr_lifecycle_policy`(인수는 `repository` 와 JSON `policy`)로 "최근 30개만 유지" 같은 보존 규칙을 함께 선언한다.

## ECS 클러스터와 태스크 정의

`aws_ecs_cluster` 는 거의 비어 있는 리소스다. `name` 이 Required이고 실무에서 채우는 것은 `setting` 블록 정도다.

```terraform
resource "aws_ecs_cluster" "main" {
  name = "payments"

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}
```

`setting.name` 의 유효값은 **`containerInsights` 하나뿐**이고 `value` 는 `enhanced`·`enabled`·`disabled` 다. 용량 공급자는 `aws_ecs_cluster_capacity_providers` 라는 별도 리소스로 붙인다. `configuration.execute_command_configuration` 으로 ECS Exec 세션의 로그 목적지와 KMS 키를 정하며 `logging` 이 `OVERRIDE` 면 `log_configuration` 이 필수다.

태스크 정의는 이 장에서 가장 중요한 리소스다.

```terraform
resource "aws_ecs_task_definition" "api" {
  family                   = "payments-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = 8080 }]
    secrets      = [{ name = "DB_PASSWORD", valueFrom = aws_secretsmanager_secret.db.arn }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}
```

**`container_definitions` 는 "하나의 유효한 JSON 문서"를 담은 문자열이다.** heredoc으로 직접 쓰면 원문이 경고하는 이스케이프 지옥에 빠진다 — JSON 안의 따옴표는 `\"` 로, 변수를 거치면 `\\\"` 로 써야 한다. `jsonencode` 는 이 문제를 없애고 HCL 표현식과 리소스 참조를 그대로 받는다.

**`family` 와 `revision` 은 불변이다.** 어떤 인수든 바꾸면 Terraform은 기존 리비전을 수정하는 대신 **새 리비전을 등록**하고 `arn` 이 `...:12` 에서 `...:13` 으로 바뀐다. 이미지 태그 한 글자만 바뀌어도 plan에 태스크 정의 교체가 나타나며 이것이 정상이다. 옛 리비전을 롤백용으로 남기려면 `skip_destroy = true`(기본 `false`)를 쓰고, "항상 최신 ACTIVE"를 참조해야 하면 `arn_without_revision` 속성을 쓴다.

Fargate에서는 제약이 늘어난다. `requires_compatibilities` 에 `FARGATE` 가 있으면 **`cpu` 와 `memory` 가 필수**이고 조합이 정해져 있다(1 vCPU = 1024 단위). `network_mode` 는 `awsvpc` 여야 태스크마다 ENI가 붙고 `runtime_platform.operating_system_family` 도 **`FARGATE` 일 때 필수**다. Graviton으로 옮기려면 `cpu_architecture = "ARM64"` 만 바꾸면 되지만 이미지도 같은 아키텍처여야 한다.

## `execution_role_arn` 과 `task_role_arn`

가장 많이 헷갈리는 지점이라 따로 본다. 원문의 정의가 정확하다 — `execution_role_arn` 은 "**ECS container agent와 Docker daemon이** assume하는 태스크 실행 롤", `task_role_arn` 은 "**ECS container task가** 다른 AWS 서비스를 호출할 수 있게 하는 IAM 롤"이다.

| 하는 일 | 필요한 롤 |
|---|---|
| ECR에서 이미지 pull | `execution_role_arn` |
| CloudWatch Logs에 로그 스트림 생성 | `execution_role_arn` |
| `secrets` 로 Secrets Manager/SSM 값 주입 | `execution_role_arn` |
| 애플리케이션이 S3에 파일 업로드 | `task_role_arn` |
| 애플리케이션이 SQS에서 메시지 수신 | `task_role_arn` |

판단 기준은 "그 호출이 컨테이너가 뜨기 **전에** 일어나는가"다. 이미지 pull과 시크릿 주입은 플랫폼이 하는 일이라 execution role이고, 애플리케이션 코드가 SDK로 하는 호출은 전부 task role이다. execution role에는 보통 `AmazonECSTaskExecutionRolePolicy` 를 붙이고 시크릿 읽기 권한만 더하며, task role은 애플리케이션마다 최소 권한으로 새로 만든다. 두 롤 모두 신뢰 주체는 `ecs-tasks.amazonaws.com` 이다.

## `aws_ecs_service`: 배포와 삭제

```terraform
resource "aws_ecs_service" "api" {
  name            = "payments-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 3

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 2
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 3
  }

  network_configuration {
    subnets         = local.private_subnet_ids
    security_groups = [aws_security_group.api.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  wait_for_steady_state  = true
  enable_execute_command = true

  depends_on = [aws_iam_role_policy.task_execution]

  lifecycle {
    ignore_changes = [desired_count]
  }
}
```

**`desired_count` 기본값은 0이다.** 생략하면 서비스는 만들어지지만 태스크가 하나도 뜨지 않는다. Application Auto Scaling을 붙일 계획이라면 초기값만 주고 `ignore_changes = [desired_count]` 로 이후 변화를 무시한다 — 28장의 ASG와 같은 패턴이다.

**`launch_type` 과 `capacity_provider_strategy` 는 충돌한다.** `launch_type` 기본값이 `EC2` 이므로 Fargate를 쓰려면 둘 중 하나를 명시한다. 스팟을 섞으려면 capacity provider 쪽이다 — 위 예제는 `base = 2` 로 온디맨드 Fargate 두 개를 깔고 나머지를 3:1 가중치로 `FARGATE_SPOT` 에 보낸다. **전략 변경에는 `force_new_deployment = true` 가 필요하다**고 원문이 명시한다. 모르면 apply는 성공했는데 태스크 배치가 그대로다.

**`network_configuration.security_groups` 를 생략하면 VPC 기본 security group이 붙는다.** `subnets` 만 Required라 빠뜨리기 쉽고 증상이 타임아웃이라 원인을 찾기 어렵다. `assign_public_ip` 기본값은 `false` 이므로 private 서브넷의 Fargate 태스크가 ECR에서 이미지를 당기려면 NAT gateway나 VPC 엔드포인트가 있어야 한다.

배포의 안전 장치는 세 겹이다. `deployment_controller.type` 은 `ECS`(기본)·`CODE_DEPLOY`·`EXTERNAL` 중 하나로, `CODE_DEPLOY` 면 배포를 CodeDeploy가 지휘하고 Terraform은 서비스 껍데기만 관리한다. `deployment_circuit_breaker` 는 `enable` 과 `rollback` 이 **둘 다 Required**이고, 태스크가 반복해서 뜨지 못하면 배포를 중단하고 직전 성공 배포로 되돌린다. `alarms` 블록(세 인수 모두 Required)으로 CloudWatch 알람 기반 롤백도 건다. `deployment_configuration.strategy` 는 `ROLLING`(기본)·`BLUE_GREEN`·`LINEAR`·`CANARY` 이고 `bake_time_in_minutes`(0~1440)로 새 배포를 굳히는 시간을 준다.

`wait_for_steady_state = true` 는 `aws ecs wait services-stable` 과 같은 대기를 apply 안으로 가져온다. 기본값 `false` 에서는 apply가 배포 시작만 확인하고 끝난다. CI에서 "apply 성공 = 배포 성공"으로 취급하려면 켜고, timeout 기본값이 create·update·delete 각각 20분이라는 점을 감안한다.

삭제 쪽 함정은 앞서 본 것이다 — **관련 `aws_iam_role_policy` 에 `depends_on` 을 걸어야** 서비스가 `DRAINING` 에서 굳지 않는다. 이미 굳었다면 `force_delete = true` 가 사후 수습 수단이다.

## EKS 클러스터: 접근 제어가 바뀌었다

```terraform
resource "aws_eks_cluster" "main" {
  name     = "platform"
  role_arn = aws_iam_role.cluster.arn
  version  = "1.35"

  access_config {
    authentication_mode = "API"
  }

  vpc_config {
    subnet_ids              = local.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["203.0.113.0/24"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator"]
  deletion_protection       = true

  depends_on = [aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy]
}
```

**`access_config.authentication_mode` 가 aws-auth ConfigMap을 대체한다.** 유효값은 `CONFIG_MAP`·`API`·`API_AND_CONFIG_MAP` 이다. `API` 면 접근 권한이 Kubernetes ConfigMap이 아니라 **AWS API의 access entry**로 관리되고 `aws_eks_access_entry` 로 IAM 주체를 연결한다. ConfigMap 시절에는 Terraform이 kubernetes provider를 거쳐 YAML을 편집해야 했고 그 편집을 잘못해 자기 자신을 잠그는 사고가 흔했다. 같은 블록의 `bootstrap_cluster_creator_admin_permissions` 기본값은 `true` 라 클러스터를 만든 주체가 자동으로 관리자가 되며, `false` 면 access entry를 먼저 만들지 않는 한 아무도 들어갈 수 없다.

**`bootstrap_self_managed_addons` 기본값은 `true`** 이고 `aws-cni`·`kube-proxy`·CoreDNS를 생성 시 자체 설치한다. **이 값을 바꾸면 클러스터가 교체된다.** EKS Auto Mode를 쓰려면 이 값이 `false` 여야 하고 동시에 `compute_config.enabled`·`kubernetes_network_config.elastic_load_balancing.enabled`·`storage_config.block_storage.enabled` 를 **셋 다 `true`** 로 둬야 한다(끌 때도 셋 다 `false`). Auto Mode에서는 노드 그룹 대신 `compute_config.node_pools`(`general-purpose`, `system`)와 `node_role_arn` 으로 컴퓨트를 선언하며 `node_role_arn` 은 활성화 후 바꿀 수 없다.

`vpc_config` 의 기본값도 함정이다. **`endpoint_public_access` 기본값은 `true`**, `endpoint_private_access` 는 `false` 다. 설정 없이 만들면 API 서버가 인터넷에 열리고 EKS는 `public_access_cidrs` 를 `0.0.0.0/0` 으로 기본 설정한다. `subnet_ids` 는 Required이며 **최소 두 개의 서로 다른 AZ**에 있어야 한다. `enabled_cluster_log_types` 를 비워 두면 컨트롤 플레인 로그가 남지 않으므로 최소한 `audit` 는 켠다.

`encryption_config` 는 `resources = ["secrets"]` 로 Kubernetes Secret의 봉투 암호화를 켠다. `version` 은 올릴 수만 있고 **다운그레이드는 EKS가 지원하지 않는다.** `depends_on` 을 IAM 정책 연결에 거는 이유는 원문이 설명한다 — 롤 권한이 먼저 사라지면 EKS가 자신이 만든 security group 같은 EC2 리소스를 지우지 못한다. 타임아웃 기본값은 create 30분, update 60분, delete 15분이다.

## 노드 그룹

```terraform
resource "aws_eks_node_group" "general" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "general"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = local.private_subnet_ids
  capacity_type   = "SPOT"
  instance_types  = ["m6i.large", "m6a.large", "m5.large"]

  scaling_config {
    desired_size = 3
    min_size     = 2
    max_size     = 12
  }

  update_config {
    max_unavailable_percentage = 25
  }

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }

  depends_on = [aws_iam_role_policy_attachment.node_AmazonEKSWorkerNodePolicy]
}
```

`cluster_name`·`node_role_arn`·`scaling_config`·`subnet_ids` 가 Required이고 `scaling_config` 안의 **세 값도 모두 Required**다. 오토스케일러가 크기를 조정한다면 `ignore_changes = [scaling_config[0].desired_size]` 를 건다 — 중첩 블록 인덱스를 포함한 이 표기가 원문의 예제 형태다.

`update_config` 의 `max_unavailable` 과 `max_unavailable_percentage` 는 **상호 배타적**이고 `update_strategy` 는 `MINIMAL`·`DEFAULT` 를 지원한다. `capacity_type` 은 `ON_DEMAND` 또는 `SPOT` 이며 스팟이면 `instance_types` 에 여러 타입을 넣어 용량 풀을 넓힌다(기본값 `["t3.medium"]`).

`taint` 블록(`key`·`effect` 가 Required, `effect` 는 `NO_SCHEDULE`·`NO_EXECUTE`·`PREFER_NO_SCHEDULE`)으로 특정 워크로드만 그 노드에 스케줄되게 할 수 있고 노드 그룹당 최대 50개다. launch template과 결합할 때는 **`version` 이 Required이고 `$Default`/`$Latest` 문자열을 넣으면 API가 숫자로 변환해 읽어 오므로 다음 plan에 영구 diff가 생긴다** — 원문이 `latest_version` 이나 `default_version` 속성을 쓰라고 권한다. `launch_template` 과 `remote_access` 는 충돌한다. create·update·delete timeout 기본값은 모두 60분인데, 노드 드레이닝과 AMI 교체가 오래 걸리기 때문이다.

## IRSA와 ephemeral 인증

파드가 AWS API를 호출할 때 노드 인스턴스 롤을 공유하는 대신 서비스 계정 단위로 롤을 주는 것이 IRSA다.

```terraform
resource "aws_iam_openid_connect_provider" "eks" {
  url            = aws_eks_cluster.main.identity[0].oidc[0].issuer
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "irsa_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub"
      values   = ["system:serviceaccount:payments:api"]
    }
  }
}
```

클러스터의 OIDC issuer URL은 `aws_eks_cluster.main.identity[0].oidc[0].issuer` 에서 나온다 — 이중 인덱스가 필요한 이유는 `identity` 와 `oidc` 가 모두 블록 목록이기 때문이다. provider에서는 `url` 과 `client_id_list` 가 Required이고 `thumbprint_list` 는 Optional인데, 원문에 미묘한 동작이 있다 — S3 호스팅 JWKS 엔드포인트를 쓰는 IdP(EKS가 여기 해당한다)에 대해 AWS는 자체 신뢰 CA 목록으로 검증하므로 설정된 thumbprint는 보관만 되고, **넣었다가 나중에 지우면 IAM이 새로 조회하지 않고 원래 목록을 계속 쓴다.**

신뢰 정책의 조건이 핵심이다. `:sub` 가 `system:serviceaccount:<네임스페이스>:<서비스계정>` 과 정확히 일치해야 하고, 같은 형태로 `:aud` 를 `sts.amazonaws.com` 에 고정하는 조건도 함께 건다. 조건을 빠뜨리거나 `StringLike` 로 `*` 를 넣으면 **클러스터의 아무 파드나 그 롤을 가져갈 수 있다.**

kubernetes provider나 helm provider를 같은 설정에서 쓰려면 인증 토큰이 필요하다.

```terraform
ephemeral "aws_eks_cluster_auth" "main" {
  name = aws_eks_cluster.main.name
}

provider "kubernetes" {
  host                   = aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.main.certificate_authority[0].data)
  token                  = ephemeral.aws_eks_cluster_auth.main.token
}
```

**왜 ephemeral이어야 하는가.** 이 토큰은 곧 만료되는 단기 자격증명이다. 데이터 소스였다면 값이 state에 평문으로 저장되어 state를 읽을 수 있는 사람이 만료 전까지 클러스터에 접근할 수 있고, 만료된 값이 남아 쓸모없는 diff를 만든다. Ephemeral 리소스는 **plan/apply 중에만 존재하고 state에 기록되지 않으므로** 두 문제가 동시에 사라진다([26장](26-secrets-and-ephemeral.md)).

그렇다고 클러스터 안까지 전부 Terraform이 관리할 이유는 없다. 경계를 이렇게 긋는 팀이 많다 — **Terraform은 클러스터·노드 그룹·IRSA 롤·애드온·컨트롤러용 IAM과 서브넷 태그까지, 애플리케이션 매니페스트와 Helm 릴리스는 GitOps로.** 수명 주기가 다르기 때문이다. 인프라는 분기에 몇 번 바뀌지만 애플리케이션은 하루에 몇 번 배포되고, 두 속도를 한 state에 묶으면 배포마다 인프라 전체 plan을 돌려야 한다.

## 흔한 실수

### ❌ `local-exec` 로 이미지 빌드/푸시를 apply에 끼워 넣기

plan에 아무것도 보이지 않고, 러너 환경에 의존하며, 실패하면 인프라 apply가 함께 멈춘다.

```terraform
resource "null_resource" "build" {
  provisioner "local-exec" {
    command = "docker build -t ${aws_ecr_repository.app.repository_url}:latest . && docker push ..."
  }
}
```

```terraform
# ✅ 이미지 태그를 입력으로 받고 Terraform은 참조만 한다
variable "image_tag" { type = string } # CI가 푸시한 커밋 SHA

# container_definitions 안에서
# image = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
```

### ❌ `container_definitions` 를 heredoc JSON으로 쓰기

따옴표 이스케이프가 변수를 거치면서 늘어나고 리소스 참조를 넣기 어렵다.

```terraform
resource "aws_ecs_task_definition" "api" {
  family                = "payments-api"
  container_definitions = <<TASK
[{"name":"api","environment":[{"name":"MSG","value":"I \"love\" quotes"}]}]
TASK
}
```

```terraform
# ✅ jsonencode가 이스케이프를 처리하고 참조도 그대로 들어간다
resource "aws_ecs_task_definition" "api" {
  family = "payments-api"
  container_definitions = jsonencode([{
    name        = "api"
    image       = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    environment = [{ name = "MSG", value = "I \"love\" quotes" }]
  }])
}
```

### ❌ S3 권한을 `execution_role_arn` 에 붙이기

애플리케이션은 여전히 `AccessDenied` 를 받는다. execution role은 ECS 에이전트가 쓴다.

```terraform
resource "aws_iam_role_policy_attachment" "wrong" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.s3_write.arn
}
```

```terraform
# ✅ 애플리케이션 권한은 task role에, 플랫폼 권한은 execution role에
resource "aws_iam_role_policy_attachment" "app_s3" {
  role       = aws_iam_role.task.name
  policy_arn = aws_iam_policy.s3_write.arn
}
```

### ❌ IRSA 신뢰 정책에서 `:sub` 조건을 느슨하게 두기

클러스터의 어떤 서비스 계정이든 롤을 가져갈 수 있다.

```terraform
condition {
  test     = "StringLike"
  variable = "${local.oidc}:sub" # local.oidc = replace(provider url, "https://", "")
  values   = ["system:serviceaccount:*"]
}
```

```terraform
# ✅ 네임스페이스와 서비스 계정을 정확히 고정한다
condition {
  test     = "StringEquals"
  variable = "${local.oidc}:sub"
  values   = ["system:serviceaccount:payments:api"]
}
```

## 프로덕션 노트

- **ECS 서비스 삭제에는 `depends_on` 이 필요하다.** 관련 `aws_iam_role_policy` 를 먼저 지우면 서비스가 `DRAINING` 에서 굳고 기본 timeout 20분을 채운 뒤 실패한다. 서비스 리소스에 정책 의존성을 명시한다.
- **`wait_for_steady_state` 없이는 apply 성공이 배포 성공이 아니다.** 기본값 `false` 는 배포 시작만 확인한다. 켜면 apply가 길어지지만 `deployment_circuit_breaker` 와 조합했을 때 나쁜 배포가 파이프라인을 실패시킨다.
- **EKS 컨트롤 플레인 로그와 Container Insights는 비용이 크다.** `enabled_cluster_log_types` 에 전부 넣으면 CloudWatch Logs 요금이 빠르게 오른다. 로그 그룹의 `retention_in_days` 를 반드시 지정한다 — 없으면 무기한 보관이다.
- **`bootstrap_self_managed_addons` 변경은 클러스터 교체다.** 기존 클러스터를 EKS Auto Mode로 옮기는 것은 in-place가 아니라 새 클러스터 생성이다. 계획 단계에서 결정하고 `deletion_protection = true` 로 사고를 막는다.
- **private 서브넷의 Fargate 태스크는 ECR에 닿을 길이 필요하다.** `assign_public_ip` 기본값이 `false` 이므로 NAT gateway 또는 `ecr.api`·`ecr.dkr`·S3·`logs` 엔드포인트가 있어야 이미지 pull과 로그 전송이 된다. 이미지 pull은 NAT 데이터 처리 요금의 큰 항목이 되기 쉽다.
- **kubernetes provider를 같은 state에 두면 순서 문제가 생긴다.** 클러스터가 없을 때 provider 설정이 평가되면 apply가 실패한다. 스택을 분리하거나 애플리케이션 배포를 GitOps로 넘긴다.
## 연습문제

1. ECR 리포지터리를 `image_tag_mutability = "IMMUTABLE"` 로 만들고 같은 태그로 두 번 푸시한 뒤, `MUTABLE_WITH_EXCLUSION` 과 `image_tag_mutability_exclusion_filter` 로 `dev-*` 만 덮어쓰기를 허용하도록 바꿔라. *성공 기준:* 첫 재푸시가 거부되는 것을 확인했고, 변경 후 `dev-1` 은 덮어써지지만 `v1.0.0` 은 여전히 거부되는 것을 확인했다.

2. `deployment_circuit_breaker` 를 켠 서비스에 기동 즉시 죽는 이미지를 배포하고 `wait_for_steady_state = true` 로 apply하라. *성공 기준:* apply가 실패로 끝나고 서비스가 직전 태스크 정의로 롤백된 것을 확인했으며, circuit breaker를 끄면 같은 배포가 timeout까지 매달리는 것을 비교했다.

3. IRSA를 구성해 특정 네임스페이스의 서비스 계정만 S3 버킷을 읽게 만들어라. *성공 기준:* 지정한 서비스 계정의 파드에서는 호출이 성공하고, 다른 네임스페이스의 동명 서비스 계정에서는 `AccessDenied` 가 나는 것을 확인했다.

## 요약

- 이미지 빌드·푸시는 CI가, 레지스트리와 실행 환경 선언은 Terraform이 맡는다. 태그를 변수로 주입하면 배포가 결정적이 되고 `latest` 에 의존하지 않게 된다.
- `aws_ecr_repository` 의 `image_tag_mutability` 기본값은 `MUTABLE`, `encryption_type` 기본값은 `AES256`, `force_delete` 기본값은 `false` 다. 예외 필터는 `_WITH_EXCLUSION` 값일 때만 쓸 수 있고 `scan_on_push` 는 블록 안에서 Required이며 기본 상태의 스캔은 수동 트리거다.
- `container_definitions` 는 단일 JSON 문서 문자열이며 항상 `jsonencode` 로 만든다. `family`/`revision` 이 불변이라 변경마다 새 리비전이 생기고 `skip_destroy`(기본 `false`)로 옛 리비전을 남길 수 있다. Fargate면 `cpu`·`memory` 와 `runtime_platform.operating_system_family` 가 필수다.
- **`execution_role_arn` 은 ECS 에이전트용**(ECR pull, 로그 스트림 생성, 시크릿 주입), **`task_role_arn` 은 애플리케이션용**이다.
- `aws_ecs_service` 의 `desired_count` 기본값은 0, `launch_type` 기본값은 `EC2` 이며 `capacity_provider_strategy` 와 충돌한다. 전략 변경에는 `force_new_deployment = true` 가 필요하고 `network_configuration.security_groups` 를 생략하면 VPC 기본 SG가 붙는다. `deployment_controller.type` 은 `ECS`(기본)·`CODE_DEPLOY`·`EXTERNAL`, circuit breaker의 두 인수는 모두 Required, `wait_for_steady_state` 기본값은 `false` 다. 삭제 교착을 막으려면 IAM 정책에 `depends_on` 을 건다.
- EKS는 `access_config.authentication_mode = "API"` 로 aws-auth ConfigMap 대신 access entry를 쓴다. `bootstrap_self_managed_addons`(기본 `true`) 변경은 클러스터 교체이며, Auto Mode는 이 값이 `false` 이고 compute·ELB·storage 세 스위치가 모두 `true` 여야 한다. `endpoint_public_access` 기본값은 `true`, `public_access_cidrs` 기본은 `0.0.0.0/0` 이다.
- 노드 그룹은 `scaling_config` 의 세 값이 모두 Required이고 오토스케일러를 쓰면 `ignore_changes = [scaling_config[0].desired_size]` 를 건다. `launch_template.version` 에 `$Latest` 를 넣으면 영구 diff가 되므로 `latest_version` 을 참조한다. IRSA는 OIDC provider + 신뢰 정책의 `:sub`·`:aud` 조건으로 서비스 계정을 고정하고, kubernetes provider 인증에는 `ephemeral_aws_eks_cluster_auth` 를 써서 단기 토큰이 state에 남지 않게 한다.

## 다음으로

- [30장 — 서버리스: Lambda · API Gateway v2 · 이벤트](30-serverless-lambda.md) — 컨테이너보다 더 작은 실행 단위.
- [26장 — 시크릿: ephemeral 리소스와 write-only 인수](26-secrets-and-ephemeral.md) — 토큰이 state에 남지 않아야 하는 이유.
- 공식 문서: [aws_ecs_service](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service), [aws_eks_cluster](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/eks_cluster)
