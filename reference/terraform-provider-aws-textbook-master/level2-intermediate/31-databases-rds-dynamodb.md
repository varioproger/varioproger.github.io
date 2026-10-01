---
chapter: 31
level: "Level 2 — 중급"
title: "데이터베이스: 지울 수 없는 리소스를 코드로 다루기 — RDS/Aurora와 DynamoDB"
difficulty: 중급
reading_time: "34분"
prerequisites: [26, 27]
source_docs:
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/r/rds_cluster.html.markdown"
  - "website/docs/r/db_subnet_group.html.markdown"
  - "website/docs/r/dynamodb_table.html.markdown"
  - "website/docs/r/kms_key.html.markdown"
  - "website/docs/r/secretsmanager_secret.html.markdown"
  - "docs/design-decisions/rds-bluegreen-deployments.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance"
provider_baseline: "6.x"
---

# 31장 — 데이터베이스: 지울 수 없는 리소스를 코드로 다루기 — RDS/Aurora와 DynamoDB

**이 장에서 배우는 것**

- `aws_db_instance` 의 핵심 인수를 골라 쓰고, `apply_immediately` 가 없을 때 변경이 언제 실제로 적용되는지 설명할 수 있다.
- 마스터 비밀번호를 다루는 세 방법(`password`, `password_wo`, `manage_master_user_password`)을 비교해 상황에 맞게 고를 수 있다.
- `blue_green_update` 가 무엇을 대신해 주는지, 왜 Aurora에는 통하지 않는지 설계 문서 근거로 설명할 수 있다.
- `aws_rds_cluster` + `aws_rds_cluster_instance` 구조와 Serverless v2 스케일링을 구성할 수 있다.
- `aws_dynamodb_table` 의 `attribute` 를 **키에 쓰이는 것만** 선언해야 하는 이유를 알고 무한 plan 루프를 피할 수 있다.
- 스냅샷·삭제 보호·타임아웃을 조합해 되살릴 수 있는 데이터 계층을 설계할 수 있다.

**왜 중요한가**

데이터베이스는 Terraform이 다루는 리소스 중 **되돌릴 수 없는 것**에 가장 가깝다. VPC를 잘못 만들면 지우고 다시 만들면 되지만, `terraform destroy` 한 번에 사라진 프로덕션 DB는 스냅샷이 없으면 끝이다. `skip_final_snapshot` 의 기본값은 `false`(스냅샷을 만든다)이지만, 개발 환경에서 편하려고 `true` 로 바꿔 둔 코드를 그대로 프로덕션 모듈에 복사하는 일이 자주 일어난다. 그 한 줄이 사고의 크기를 결정한다.

두 번째는 "plan에는 보이는데 실제로는 안 바뀌는" 변경이다. 원문이 문서 앞머리에서 경고하듯 RDS의 변경은 기본적으로 **다음 유지보수 창**에 반영되므로, 파라미터를 바꾸고 apply해도 반영은 며칠 뒤일 수 있고 그 사이 plan은 계속 diff를 보여준다. 야간에 반영된 변경이 재부팅을 동반하면 아무도 예상하지 못한 시각에 짧은 장애가 난다. `apply_immediately = true` 는 반대편의 위험을 갖는다 — 원문 표현대로 **서버가 재부팅되면서 짧은 다운타임이 생길 수 있다.**

세 번째는 DynamoDB의 조용한 함정이다. `attribute` 블록에 키가 아닌 속성을 하나 선언하면 원문이 말하는 **무한 plan 루프**가 시작된다 — 매번 diff가 생기고 apply해도 사라지지 않는다. 오토스케일링을 붙인 테이블에서 용량 인수를 `ignore_changes` 하지 않으면 Terraform과 Application Auto Scaling이 값을 서로 되돌린다. 둘 다 코드는 "맞아 보이는데" 운영에서만 드러난다.

## RDS 인스턴스의 뼈대

`aws_db_instance` 에서 Required는 `instance_class` 하나이고 `allocated_storage`·`engine`·`username` 은 **`snapshot_identifier` 나 `replicate_source_db` 를 주지 않는 한 필수**인 조건부 Required다 — 새로 만들 때는 사실상 넷 다 필요하다.

```terraform
resource "aws_db_subnet_group" "main" {
  name       = "app-db"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_c.id]
}

resource "aws_db_instance" "app" {
  identifier     = "app-prod"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = "db.m6g.large"

  allocated_storage     = 100
  max_allocated_storage = 500
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  db_name                = "app"
  username               = "appadmin"
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  multi_az               = true

  manage_master_user_password = true
}
```

**`db_subnet_group_name` 을 빼먹지 않는다.** 지정하지 않으면 **`default` 서브넷 그룹**에 만들어져 DB가 의도치 않은 네트워크 경계 안에 놓인다. 서브넷 그룹은 `subnet_ids` 가 Required이고 `name`·`name_prefix` 는 ForceNew다([27장](27-vpc-networking.md)).

**`storage_encrypted` 의 기본값은 `false`** 다. 나중에 켜려면 스냅샷을 만들어 암호화된 인스턴스로 복원해야 하므로 사실상 재생성이니 첫날에 `true` 로 둔다. `multi_az` 는 읽기 확장이 아니라 **가용성**을 위한 동기 대기 인스턴스이고, 읽기 부하를 나누려면 `replicate_source_db` 를 쓴 읽기 복제본이나 Aurora가 필요하다. 원문에 중요한 한 줄이 있다 — **기존 복제본에서 `replicate_source_db` 를 제거하면 그 DB는 독립 데이터베이스로 승격된다.**

## 스토리지와 오토스케일링

`storage_type` 의 값은 `standard`(마그네틱), `gp2`, `gp3`, `io1`, `io2` 다. 기본값이 조건부라는 점이 함정이다 — **`iops` 를 지정하면 `io1`, 아니면 `gp2`** 가 된다. gp3는 `iops` 와 `storage_throughput` 을 따로 정할 수 있으나 **`allocated_storage` 가 엔진별 임계값 아래면 지정할 수 없다.**

`max_allocated_storage` 는 스토리지 오토스케일링을 켠다. 기본은 비활성이고 **`allocated_storage` 이상**으로 설정해야 켜지며 `0` 은 명시적 비활성이다. 켜고 나면 원문이 명시하듯 **`allocated_storage` 의 차이가 자동으로 무시된다** — 스토리지가 100GiB에서 180GiB로 늘어도 Terraform이 되돌리지 않고, `allocated_storage` 는 "초기 할당량"의 의미만 갖는다.

## 변경은 언제 적용되는가

원문 첫머리의 경고가 이 절을 요약한다 — RDS는 변경을 **다음 유지보수 창**에 반영하므로 apply 직후 plan이 여전히 diff를 보여줄 수 있다.

- **`apply_immediately`** — 기본 `false`. `true` 면 즉시 적용되지만 원문 노트대로 **서버 재부팅에 따른 짧은 다운타임**이 생길 수 있다. **`maintenance_window`**(`"Mon:00:00-Mon:03:00"`)와 **`backup_window`**(`"09:46-10:16"`)는 **겹치면 안 된다.**
- **`backup_retention_period`** — 기본 **`0`(백업 비활성)**, 0~35일. 읽기 복제본의 원본이거나 low-downtime 업데이트·Blue/Green을 쓰려면 **0보다 커야 한다.**
- **`auto_minor_version_upgrade`** — 기본 **`true`**. 메이저 버전을 올리려면 `allow_major_version_upgrade` 가 `true` 여야 하며, 원문에 따르면 이 값을 바꾸는 것 자체는 중단을 일으키지 않는다.

`auto_minor_version_upgrade` 가 기본 `true` 라는 사실이 drift의 흔한 원인이다. AWS가 유지보수 창에 마이너 버전을 올리면 실제 버전이 설정값과 달라지고 다음 plan은 **버전을 되돌리려는 변경**을 만든다. 해법은 둘이다 — `engine_version` 에 **접두사**만 쓰거나(자동 업그레이드가 켜져 있으면 `8.0` 같은 부분 버전을 줄 수 있고 실제 버전은 `engine_version_actual` 로 읽는다), 자동 업그레이드를 끄고 버전을 코드로만 관리하는 것이다.

```terraform
resource "aws_db_instance" "app" {
  # ...
  engine_version             = "16"  # 접두사만 지정
  auto_minor_version_upgrade = true
  apply_immediately          = false # 유지보수 창에 반영
  maintenance_window         = "Mon:17:00-Mon:18:00"
  backup_window              = "15:00-16:00"
}
```

`enabled_cloudwatch_logs_exports` 로 엔진 로그를 CloudWatch로 내보내고 `performance_insights_enabled`(기본 `false`)로 쿼리 단위 분석을 켠다. 후자의 `performance_insights_retention_period` 는 기본 `7` 일(유효 값 `7`, `731`, 31의 배수)이며 `performance_insights_kms_key_id` 는 **한 번 정하면 바꿀 수 없다.**

## 삭제를 막는 것들

프로덕션 DB에는 세 겹의 안전장치를 건다.

```terraform
resource "aws_db_instance" "app" {
  # ...
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "app-prod-final-${var.release}"
  delete_automated_backups  = false

  lifecycle {
    prevent_destroy = true
  }
}
```

- **`deletion_protection`** — 기본 `false`. `true` 면 AWS API 수준에서 삭제가 거부되어 콘솔에서 지우려 해도 막힌다.
- **`skip_final_snapshot`** — 기본 `false`(스냅샷을 만든다). 이때 **`final_snapshot_identifier` 를 반드시 제공해야 한다.** 값은 문자로 시작하고 영숫자·하이픈만 쓰며 하이픈으로 끝나거나 연속 하이픈을 포함할 수 없고, 읽기 복제본을 지울 때는 **주면 안 된다.**
- **`delete_automated_backups`** — 기본 **`true`**. 인스턴스를 지우면 자동 백업이 즉시 사라진다 — 최종 스냅샷은 남지만 시점 복구용 백업은 없어진다.
- **`lifecycle { prevent_destroy = true }`** — Terraform 쪽 방어선. 설정을 지우기 전에는 plan 자체가 실패한다([21장](21-lifecycle-meta-arguments.md)).

`final_snapshot_identifier` 에 `timestamp()` 를 쓰면 plan마다 값이 달라져 diff 소음이 생기므로 `var.release` 같은 안정적인 값을 쓴다. 같은 이름의 스냅샷이 이미 있으면 destroy가 에러로 멈춘다는 점도 기억한다.

## 비밀번호를 다루는 세 가지 방법

원문이 문서 상단에서 경고한다 — **username과 password를 포함한 모든 인수가 state에 평문으로 저장된다.** 선택지는 셋이며 서로 배타적이다.

**1) `password` — 가장 나쁜 선택.** 값이 state에 그대로 남는다.

**2) `password_wo` — write-only 인수.** Terraform 1.11+에서 쓸 수 있고 값이 **state에 저장되지 않는다.** 짝이 되는 `password_wo_version` 정수를 함께 두고, 비밀번호를 바꿀 때 이 정수를 올려 업데이트를 유발한다([26장](26-secrets-and-ephemeral.md)).

**3) `manage_master_user_password = true` — Secrets Manager에 위임.** RDS가 비밀번호를 만들고 회전까지 관리하므로 Terraform은 값을 아예 모르고, 대신 `master_user_secret` 블록을 속성으로 내보낸다 — `secret_arn`, `kms_key_id`, `secret_status`(`creating`/`active`/`rotating`/`impaired`). 암호화 키는 `master_user_secret_kms_key_id` 로 지정한다.

```terraform
# 2) write-only 인수 — 값은 apply 중에만 존재한다
ephemeral "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
}

resource "aws_db_instance" "app" {
  # ...
  username            = "appadmin"
  password_wo         = jsondecode(ephemeral.aws_secretsmanager_secret_version.db.secret_string)["password"]
  password_wo_version = var.db_password_version
}
```

무엇을 고를 것인가. **비밀번호 회전이 필요하고 특별한 소유자가 없다면 3번**이 가장 단순하다 — 비밀번호가 코드에도 state에도 CI 로그에도 등장하지 않는다. **외부 시스템(Vault 등)이 소유한다면 2번**이 맞고, 1번은 학습용 외에는 쓰지 않는다. `manage_master_user_password` 는 **`password`·`password_wo` 와 함께 쓸 수 없으며**, 기존 인스턴스는 `password` 를 지우고 이 인수를 넣는 한 번의 apply로 전환된다.

## Blue/Green 배포는 왜 인스턴스에만 되는가

인스턴스 클래스나 엔진 버전을 바꾸면 in-place 수정이 일어나고, 설계 결정 문서의 표현대로 그 다운타임은 **15분을 넘길 수도 있다.** `blue_green_update { enabled = true }`(기본 `false`)를 켜면 provider가 RDS Blue/Green Deployment로 새 인스턴스를 만들고 동기화한 뒤 전환하므로 다운타임이 **전환(switchover) 시간만큼**으로 줄어든다.

조건이 붙는다 — low-downtime 업데이트는 **MySQL·MariaDB·PostgreSQL에서만**, **복제본이 없는 인스턴스에서만** 쓸 수 있고 **백업이 켜져 있어야 한다**(`backup_retention_period > 0`).

```terraform
resource "aws_db_instance" "app" {
  # ...
  instance_class          = "db.m6g.xlarge" # 변경 시 Blue/Green으로 전환
  backup_retention_period = 14

  blue_green_update { enabled = true }
}
```

여기서 배울 것은 인수 하나가 아니라 **리소스 모델과 AWS API가 어긋날 때 provider가 무엇을 할 수 있는가**다. `aws_db_instance` 는 자립 객체라 Blue/Green 오케스트레이션을 **구현 세부사항으로 숨길 수 있고** 사용자는 한 번의 apply만 본다. 같은 논리가 나머지를 설명한다. **읽기 복제본이 있는 인스턴스**는 원본과 복제본이 별도 리소스라 한 단위로 묶을 수 없다. **Aurora 클러스터**는 `aws_rds_cluster` 와 하나 이상의 `aws_rds_cluster_instance` 로 쪼개져 자립 객체가 아니므로 대부분의 업데이트에 Blue/Green을 쓸 수 없고, **Multi-AZ DB 클러스터**는 Blue/Green 자체가 아직 지원되지 않는다.

독립 리소스(`aws_rds_blue_green_deployment`)를 만들자는 제안도 문서가 기각한다 — **편집 -> apply -> import -> 편집 -> apply** 를 반복해야 해서 Terraform의 작업 방식과 맞지 않기 때문이다([49장](../level3-advanced/49-design-decisions.md)).

## Aurora: 클러스터와 인스턴스는 다른 리소스다

`aws_rds_cluster` 는 **Aurora 클러스터**와 MySQL·PostgreSQL 엔진의 **Multi-AZ DB 클러스터** 둘을 모델링한다. `engine` 이 Required이고 유효 값은 `aurora-mysql`, `aurora-postgresql`, `mysql`, `postgres` 이며 뒤의 둘이 Multi-AZ DB 클러스터다. 핵심 구조는 **클러스터가 스토리지·엔드포인트·백업을 갖고 컴퓨트는 `aws_rds_cluster_instance` 가 갖는다**는 것 — 클러스터만 만들면 접속할 인스턴스가 없다.

```terraform
resource "aws_rds_cluster" "app" {
  cluster_identifier = "app-aurora"
  engine             = "aurora-postgresql"
  engine_version     = "16.4"
  database_name      = "app"
  master_username    = "appadmin"

  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.main.name
  vpc_security_group_ids      = [aws_security_group.db.id]

  backup_retention_period   = 14
  final_snapshot_identifier = "app-aurora-final-${var.release}"

  serverlessv2_scaling_configuration {
    min_capacity             = 0.5
    max_capacity             = 16
    seconds_until_auto_pause = 3600
  }
}

resource "aws_rds_cluster_instance" "app" {
  count              = 2
  identifier         = "app-aurora-${count.index}"
  cluster_identifier = aws_rds_cluster.app.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.app.engine
}
```

인수 이름이 `aws_db_instance` 와 미묘하게 다르다 — 비밀번호는 `master_password` / `master_password_wo`, 사용자명은 `master_username`, 백업 창은 `preferred_backup_window` 다. `backup_retention_period` 기본값도 클러스터는 **`1`**, 인스턴스는 **`0`** 으로 다르다. `cluster_identifier` 는 ForceNew이고 `master_username` 은 **in-place 수정이 되지 않는다.**

`engine_mode` 는 기본 `provisioned` 이고 `global`, `parallelquery`, `serverless` 를 가질 수 있다. 헷갈리기 쉬운 사실 하나 — **Serverless v2는 `engine_mode = "serverless"` 가 아니다.** `serverlessv2_scaling_configuration` 은 **`engine_mode` 가 `provisioned` 일 때만 유효**하고 옛 `scaling_configuration` 이 v1용이다. v2에서는 `instance_class` 를 `db.serverless` 로 두고 용량은 클러스터가 ACU로 정한다 — `min_capacity`·`max_capacity` 는 Required이며 `0`~`256`을 0.5 단위로, `seconds_until_auto_pause` 는 300~86400이다.

여러 리전에 걸친 글로벌 데이터베이스는 `aws_rds_global_cluster` 를 만들고 각 클러스터에 `global_cluster_identifier` 를 지정해 연결한다.
## 파라미터 그룹과 스냅샷 복원

엔진 설정은 리소스 인수가 아니라 파라미터 그룹으로 바꾼다. 인스턴스에는 `parameter_group_name`, 클러스터에는 `db_cluster_parameter_group_name` 을 연결하고 그룹은 `aws_db_parameter_group` / `aws_rds_cluster_parameter_group` 이 만든다. 각 `parameter` 블록의 `apply_method` 에 원문 예제가 쓰는 값이 `immediate`(즉시 반영)이고, 재부팅해야 적용되는 정적 파라미터에는 `pending-reboot` 를 쓴다.

그룹 이름을 바꾸면 교체가 일어나므로 `name_prefix` + `create_before_destroy` 조합이 "인스턴스가 아직 쓰는 그룹을 지우려다 실패"하는 교착을 막는다.

스냅샷 복원은 `snapshot_identifier` 로 한다. 이 인수가 있으면 `engine`·`username`·`allocated_storage` 가 조건부 Required에서 풀린다. 다만 **복원은 새 리소스를 만드는 일**이다 — 기존 인스턴스에 `snapshot_identifier` 를 나중에 추가한다고 데이터가 되돌아오지 않는다. 특정 시점으로 되살리는 `restore_to_point_in_time` 블록은 **ForceNew이고 `identifier` 를 함께 지정해야 한다.**

## DynamoDB: `attribute` 는 키에 쓰는 것만 선언한다

`aws_dynamodb_table` 의 Required는 `name`, `hash_key`, `attribute` 셋이고 `hash_key`·`range_key` 는 ForceNew다 — 키를 바꾸는 것은 새 테이블을 만드는 것과 같다. 가장 중요한 규칙은 원문이 강조하는 문장이다. **`attribute` 블록에는 테이블 자신의 키나 LSI/GSI 키로 쓰이는 속성만 선언한다.** 그 밖의 속성을 선언하면 **무한 plan 루프**가 생긴다 — DynamoDB는 스키마리스라 키가 아닌 속성은 테이블 정의에 존재하지 않고, AWS가 돌려주지 않는 값을 Terraform이 계속 만들려 하기 때문이다.

```terraform
resource "aws_dynamodb_table" "orders" {
  name         = "orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "CustomerId"
  range_key    = "OrderId"

  attribute {
    name = "CustomerId"
    type = "S"
  }
  attribute {
    name = "OrderId"
    type = "S"
  }
  attribute {
    name = "Status" # GSI의 키로 쓰이므로 선언한다
    type = "S"
  }

  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "Status"
    range_key       = "OrderId"
    projection_type = "KEYS_ONLY"
  }

  deletion_protection_enabled = true
}
```

`attribute.type` 의 유효 값은 **`S`(문자열), `N`(숫자), `B`(바이너리)** 셋뿐이다. `billing_mode` 의 기본값은 **`PROVISIONED`** 이며 이 경우 `read_capacity` 와 `write_capacity` 가 필수다. 트래픽 예측이 어려우면 `PAY_PER_REQUEST` 로 두고, 상한이 필요하면 `on_demand_throughput` 블록(`max_read_request_units`, `max_write_request_units`, 해제는 `-1`)을 쓴다.

인덱스는 성격이 다르다. **`global_secondary_index` 는 나중에 추가·삭제할 수 있지만 `local_secondary_index` 는 ForceNew** 다 — LSI는 생성 시에만 만들 수 있어 나중에 정의를 바꾸면 테이블이 교체된다. `projection_type` 은 `ALL`, `INCLUDE`, `KEYS_ONLY` 이고 `INCLUDE` 일 때만 `non_key_attributes` 를 준다. GSI의 `hash_key`/`range_key` 는 **deprecated**이며 원문은 `key_schema` 블록을 권한다.

## DynamoDB의 운영 스위치들

- **`ttl`** — `enabled`(기본 `false`)가 `true` 면 `attribute_name` 이 필수이고 꺼져 있으면 주면 안 된다. 만료 항목을 DynamoDB가 지워 주므로 로그·세션 테이블 비용을 크게 줄인다.
- **`point_in_time_recovery`** — `enabled` 가 Required이고 블록이 없으면 `false` 다. 새 테이블에서 켜지는 데 **10분까지 걸릴 수 있으며** `recovery_period_in_days` 는 기본 35다.
- **`stream_enabled` / `stream_view_type`** — 변경 스트림. 후자는 `KEYS_ONLY`, `NEW_IMAGE`, `OLD_IMAGE`, `NEW_AND_OLD_IMAGES` 중 하나이며 **`stream_enabled` 가 `true` 일 때만 유효**하다. 이 스트림을 [30장](30-serverless-lambda.md)의 `aws_lambda_event_source_mapping` 으로 Lambda에 붙인다.
- **`server_side_encryption`** — `enabled` 가 Required. 원문이 직접 설명하는 헷갈리는 지점 — 블록이 없거나 `enabled = false` 면 **AWS 소유 키**로 암호화되고(콘솔에 `DEFAULT`), `enabled = true` 인데 `kms_key_arn` 이 없으면 **KMS 관리 기본 키**가 된다. 즉 "암호화 꺼짐" 상태는 없다.
- **`table_class`** 는 `STANDARD`(기본) 또는 `STANDARD_INFREQUENT_ACCESS` 이고, **`deletion_protection_enabled`** 는 기본 `false` 다.

**글로벌 테이블**은 `replica` 블록으로 만든다. `region_name` 이 Required이고 `kms_key_arn`, `point_in_time_recovery`, `propagate_tags`, `consistency_mode`(기본 `EVENTUAL`)를 가지며, `replica.kms_key_arn` 을 바꾸면 **레플리카가 재생성된다.**

여기서 v6의 top-level `region` 인수와 헷갈리지 않아야 한다. `region` 은 **이 테이블 리소스를 어느 리전에서 관리할지**를 정하며 값을 바꾸면 **교체**된다([24장](24-enhanced-region-support.md)). `replica` 는 그 테이블의 **복제본을 어느 리전에 둘지**를 정한다 — 서울 테이블을 도쿄에도 복제하려면 `replica { region_name = "ap-northeast-1" }` 다. 별도 리소스 `aws_dynamodb_table_replica` 를 함께 쓴다면 원문 권고대로 테이블 쪽에 `lifecycle { ignore_changes = [replica] }` 를 건다.

용량 인수에도 같은 주의가 필요하다. Application Auto Scaling 정책을 붙였다면 **`read_capacity`·`write_capacity` 를 `ignore_changes` 에 넣으라**고 원문이 권한다. 그러지 않으면 오토스케일링이 올린 값을 다음 apply가 되돌린다.

## 흔한 실수

### ❌ `skip_final_snapshot = true` 를 프로덕션 모듈에 복사한다

```terraform
resource "aws_db_instance" "prod" {
  identifier          = "payments-prod"
  skip_final_snapshot = true # 개발용 예제에서 그대로 복사, 삭제 보호도 없음
}
# destroy 한 번이면 복구 지점이 아무것도 남지 않는다
```

```terraform
# ✅ 환경별로 값을 갈라 두고 프로덕션은 여러 겹으로 막는다
resource "aws_db_instance" "prod" {
  identifier                = "payments-prod"
  deletion_protection       = var.is_production
  skip_final_snapshot       = !var.is_production
  final_snapshot_identifier = var.is_production ? "payments-prod-final-${var.release}" : null
  delete_automated_backups  = !var.is_production

  lifecycle {
    prevent_destroy = true
  }
}
```

### ❌ 키가 아닌 속성을 `attribute` 로 선언한다

```terraform
resource "aws_dynamodb_table" "bad" {
  name     = "orders"
  hash_key = "OrderId"

  attribute {
    name = "OrderId"
    type = "S"
  }
  attribute {
    name = "Amount" # 키도 인덱스 키도 아니다 -> 무한 plan 루프
    type = "N"
  }
}
```

```terraform
# ✅ 키·인덱스 키로 쓰이는 속성만 선언한다. 나머지는 애플리케이션의 몫이다
resource "aws_dynamodb_table" "good" {
  name     = "orders"
  hash_key = "OrderId"

  attribute {
    name = "OrderId"
    type = "S"
  }
}
```

### ❌ 오토스케일링과 Terraform이 용량을 두고 싸운다

```terraform
resource "aws_dynamodb_table" "bad" {
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5
}
# appautoscaling이 40으로 올린 값을 다음 apply가 5로 되돌린다
```

```terraform
# ✅ 소유권을 오토스케일링에 넘기고 Terraform은 초기값만 정한다
resource "aws_dynamodb_table" "good" {
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5

  lifecycle {
    ignore_changes = [read_capacity, write_capacity]
  }
}
```

### ❌ 비밀번호를 변수로 받아 `password` 에 그대로 넣는다

```terraform
resource "aws_db_instance" "bad" {
  username = "appadmin"
  password = var.db_password # sensitive는 출력만 가릴 뿐 state에는 평문
}
```

```terraform
# ✅ RDS에 위임하거나(권장) write-only 인수를 쓴다
resource "aws_db_instance" "good" {
  username                      = "appadmin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.rds.arn
}
# 애플리케이션은 master_user_secret[0].secret_arn 을 읽어 접속한다
```

## 프로덕션 노트

- **RDS의 timeouts는 이유가 있어 길다.** `aws_db_instance` 는 create 40m·update 80m·delete 60m, `aws_rds_cluster` 는 셋 다 120m이 기본이다. CI 잡 타임아웃을 이보다 짧게 잡으면 DB를 만드는 파이프라인이 매번 중간에 죽는다. DynamoDB도 create 30m·update 60m·delete 10m이며, 원문 노트대로 **내부 기본값보다 짧은 커스텀 타임아웃은 무시된다**(긴 쪽이 쓰인다).
- **데이터 계층은 별도 state로 분리한다.** 애플리케이션과 같은 state에 두면 잦은 apply가 DB를 매번 refresh하고 실수로 destroy할 위험도 커진다([16장](16-remote-state-and-backends.md)).
- **`engine_version` drift를 팀 규칙으로 정한다.** 마이너 자동 업그레이드를 켜 두고 접두사 버전을 쓸지, 꺼 두고 코드로 고정할지 하나로 통일한다. 인스턴스마다 다르면 "왜 이 DB만 plan에 diff가 뜨는가"를 반복 조사하게 된다.
- **KMS 키의 삭제 대기 기간을 확인한다.** `aws_kms_key` 의 `deletion_window_in_days` 만큼 기다렸다 키가 지워지며, 그 키로 암호화한 스냅샷은 키가 사라지면 복원할 수 없다.
- **Aurora는 인스턴스 수를 코드로 표현한다.** `aws_rds_cluster_instance` 를 줄이는 변경이 라이터를 지우게 되지 않는지 plan에서 확인한다. 인덱스가 밀리는 `count` 대신 `for_each` 가 안전한 대표적인 경우다([17장](17-count-foreach-dynamic.md)).

## 연습문제

1. `apply_immediately` 없이 만든 RDS 인스턴스의 `backup_retention_period` 를 바꿔 apply한 뒤 곧바로 `terraform plan` 을 다시 실행하고, `apply_immediately = true` 로 같은 실험을 반복하라.
   *성공 기준:* 첫 실험에서 apply 후에도 diff가 남는 것을 출력으로 보이고, 그 이유를 유지보수 창과 연결해 설명할 수 있다.

2. `hash_key` 만 있는 DynamoDB 테이블에 키가 아닌 `attribute` 를 하나 추가하고 `terraform apply` 를 두 번 연속 실행한 뒤, 그 블록을 제거하고 다시 두 번 실행하라.
   *성공 기준:* 문제 상황에서 두 번째 apply에도 변경이 남는 것과 수정 후 `No changes` 가 되는 것을 출력으로 증명할 수 있다.

3. Aurora PostgreSQL 클러스터를 `serverlessv2_scaling_configuration` 과 `instance_class = "db.serverless"` 로 구성한 뒤 `engine_mode = "serverless"` 로 바꿔 plan을 실행하라.
   *성공 기준:* 두 구성의 차이를 설명하고 v1과 v2가 다른 인수 계열이라는 것을 plan 결과로 보일 수 있다.

## 요약

- `aws_db_instance` 의 Required는 `instance_class` 이고 `engine`·`username`·`allocated_storage` 는 `snapshot_identifier`/`replicate_source_db` 가 없을 때 필수다. `db_subnet_group_name` 을 생략하면 `default` 그룹에 만들어진다.
- RDS 변경은 기본적으로 유지보수 창에 반영되므로 apply 후에도 plan에 diff가 남을 수 있다. `apply_immediately = true` 는 즉시 반영하지만 재부팅으로 짧은 다운타임을 만든다.
- 기본값을 기억한다 — `backup_retention_period` 0(클러스터는 1), `auto_minor_version_upgrade` `true`, `storage_encrypted` `false`, `delete_automated_backups` `true`.
- 비밀번호는 셋 중 하나다 — `password`(state 평문), `password_wo` + `password_wo_version`(state에 저장 안 함), `manage_master_user_password`(Secrets Manager 위임). 마지막 것은 앞의 둘과 함께 쓸 수 없다.
- `blue_green_update.enabled` 는 MySQL·MariaDB·PostgreSQL에서, 복제본이 없고 백업이 켜진 인스턴스에만 쓸 수 있다. Aurora가 제외되는 이유는 클러스터가 여러 리소스로 쪼개져 자립 객체가 아니기 때문이다.
- Aurora는 `aws_rds_cluster`(스토리지·엔드포인트)와 `aws_rds_cluster_instance`(컴퓨트)로 나뉘고 인수 이름도 다르다(`master_username`, `preferred_backup_window`). Serverless v2는 `engine_mode = "provisioned"` 에서 설정한다.
- `aws_dynamodb_table` 의 `attribute` 에는 **키로 쓰이는 속성만** 선언한다 — 그 외 속성을 넣으면 무한 plan 루프가 생긴다. `billing_mode` 기본값은 `PROVISIONED` 이고 이때 `read_capacity`/`write_capacity` 가 필수다.
- GSI는 나중에 추가·삭제할 수 있지만 LSI는 생성 시에만 정의되며 ForceNew다. 오토스케일링을 붙였다면 용량 인수를 `ignore_changes` 로 넘긴다. 글로벌 테이블은 `replica.region_name` 이고, v6의 top-level `region` 은 리소스를 관리할 리전을 정하며 바꾸면 **교체**된다 — 둘은 다른 축이다.

## 다음으로

- [32장 — 관측: CloudWatch 로그·알람·VPC Flow Log](32-observability.md) — DB 지표에 알람을 걸고 로그를 모은다.
- [26장 — 시크릿: ephemeral 리소스와 write-only 인수](26-secrets-and-ephemeral.md) — `password_wo` 의 전체 그림.
- [21장 — lifecycle: 교체·보호·무시·트리거](21-lifecycle-meta-arguments.md) — `prevent_destroy` 와 `ignore_changes` 의 동작.
- 공식 문서: [aws_db_instance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance), [aws_dynamodb_table](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table)
