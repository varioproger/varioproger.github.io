---
chapter: 32
level: "Level 2 — 중급"
title: "관측: 로그 그룹의 주인을 정하고, 울려야 할 때만 울리는 알람을 만든다"
difficulty: 중급
reading_time: "30분"
prerequisites: [27, 30]
source_docs:
  - "website/docs/r/cloudwatch_log_group.html.markdown"
  - "website/docs/r/cloudwatch_metric_alarm.html.markdown"
  - "website/docs/r/cloudwatch_event_rule.html.markdown"
  - "website/docs/r/cloudwatch_event_target.html.markdown"
  - "website/docs/r/sns_topic.html.markdown"
  - "website/docs/r/sqs_queue.html.markdown"
  - "website/docs/r/kms_key.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
  - "website/docs/guides/version-6-upgrade.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm"
provider_baseline: "6.x"
---

# 32장 — 관측: 로그 그룹의 주인을 정하고, 울려야 할 때만 울리는 알람을 만든다

**이 장에서 배우는 것**

- 로그 그룹을 서비스가 자동 생성하게 두지 않고 Terraform이 소유해야 하는 이유를 비용·순서·암호화 세 축으로 설명할 수 있다.
- `aws_cloudwatch_log_group`의 `retention_in_days` 유효값과 `0`의 의미, `log_group_class`, `skip_destroy`를 상황에 맞게 고를 수 있다.
- `evaluation_periods`·`datapoints_to_alarm`·`treat_missing_data`가 만드는 서로 다른 동작을 구분하고 지표 성격에 맞게 고를 수 있다.
- `metric_query` 블록으로 수식 알람과 이상 탐지 알람을 만들고, 알람에서 SNS를 거쳐 사람에게 닿는 경로를 정책까지 포함해 세울 수 있다.
- EventBridge 규칙과 타깃으로 상태 변화를 잡고 `input_transformer`·`retry_policy`·`dead_letter_config`로 전달 실패를 관리할 수 있다.
- VPC Flow Log를 목적지 세 종류 중에 골라 설정하고 S3 목적지에서 Parquet·시간별 파티션으로 비용을 줄일 수 있다.

**왜 중요한가**

관측을 코드로 관리하지 않을 때 가장 먼저 오는 것은 청구서다. Lambda 함수를 처음 호출하면 CloudWatch Logs가 `/aws/lambda/<함수이름>` 로그 그룹을 스스로 만들고, 그 그룹의 보존 기간은 "만료 없음"이다. 함수 200개를 굴리는 팀이 이 사실을 3년째 모르면 아무도 열어보지 않는 로그가 테라바이트 단위로 쌓여 로그 비용이 컴퓨트 비용을 넘어선다. 게다가 이 그룹들은 state에 없으므로 `terraform destroy`로 스택을 통째로 내려도 전부 남는다.

두 번째는 "울리지 않는 알람"이다. Lambda `Errors` 지표에 알람을 걸어 두었는데, 정작 함수가 완전히 죽어 호출조차 되지 않는 장애에서는 알람이 울리지 않는다. 데이터 포인트가 아예 없기 때문이다. `treat_missing_data`의 기본값은 원문 기준 `missing`이고, 이 값은 "데이터가 없는 구간은 판단하지 않는다"는 뜻이다. 새벽 2시에 큐 소비자가 전부 죽었는데 대시보드에는 초록불이 켜져 있고, 아침에 출근해서야 24만 건이 밀린 것을 발견한다.

세 번째는 반대 방향이다. 너무 많고 너무 민감한 알람은 채널을 하루 300건씩 울리게 만들고, 사람들이 음소거한 다음 진짜 장애가 온다. 알람을 코드로 관리해야만 "알람이 몇 개 있고 각각 누구에게 가는가"에 답할 수 있다.

## 로그 그룹의 주인을 정하는 문제와 `aws_cloudwatch_log_group`

Lambda, ECS의 `awslogs` 드라이버, API Gateway, VPC Flow Log는 모두 목적지 그룹이 없으면 스스로 만든다. 편해 보이지만 세 가지를 포기하게 된다. **보존 기간** — 서비스가 만든 그룹은 만료가 없고 관측 비용의 대부분이 여기서 나온다. **암호화** — `kms_key_id`를 나중에 붙여도 이미 쌓인 데이터는 그대로다. **삭제 순서** — state 밖의 그룹은 `destroy` 대상이 아니라 고아가 된다. 원칙은 하나다. **로그를 뱉는 리소스를 Terraform으로 만든다면 그 로그 그룹도 Terraform으로 만든다.**

```terraform
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/orders-worker"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.logs.arn
  log_group_class   = "STANDARD"
}
```

- **`name`과 `name_prefix`는 둘 다 Optional이고 둘 다 ForceNew이며 서로 conflict한다.** 이름을 바꾸면 그룹이 교체되고, 교체는 곧 안의 로그가 사라진다는 뜻이다.
- **`retention_in_days`의 유효값은 정해진 목록이다** — 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653, 그리고 0. 45나 100은 거절당한다. **`0`은 "만료 없음"**, 즉 영구 보존이다.
- **`kms_key_id`는 KMS 키의 ARN**이다. 원문의 경고가 중요하다 — 키를 분리하면 그 시점부터 새 데이터는 암호화되지 않지만 **이미 들어온 데이터는 암호화 상태로 남고, 읽으려면 여전히 그 키 권한이 필요하다.**
- **`log_group_class`의 유효값은 `STANDARD`, `INFREQUENT_ACCESS`, `DELIVERY` 셋이다.** `DELIVERY`를 쓰면 **`retention_in_days`가 무시되고 강제로 2로 설정된다**고 원문이 명시한다 — 보관용이 아니라 통로이기 때문이다.
- **`skip_destroy`** 는 destroy 시 그룹을 지우지 않고 state에서만 뺀다. 감사 로그처럼 인프라보다 오래 살아야 하는 로그에 쓴다. **`deletion_protection_enabled`** 의 기본값은 `false`이고 **한 번 켜면 인수를 지우는 것으로는 꺼지지 않고 명시적으로 `false`를 적어야** 해제된다.
- **`arn` 속성에는 API가 붙이는 `:*` 접미사가 제거되어 있다.** 접미사를 요구하는 자리에서는 `"${aws_cloudwatch_log_group.worker.arn}:*"` 처럼 직접 붙인다. import는 그룹 이름 하나로 한다([20장](20-import-and-resource-identity.md)).

## 서비스마다 다른 이름 규칙과 생성 순서

미리 만들어 두는 전략은 **이름을 정확히 맞출 때만** 작동한다. 한 글자만 틀려도 서비스는 자기 이름의 그룹을 따로 만들고 우리 그룹에는 아무것도 쌓이지 않는다.

- **Lambda** — `/aws/lambda/<function_name>` 고정. `logging_config.log_group`으로 다른 그룹을 지정할 수도 있다([30장](30-serverless-lambda.md)).
- **EKS** — `enabled_cluster_log_types`를 켜면 `/aws/eks/<cluster_name>/cluster`로 간다. 이름을 바꿀 수 없다([29장](29-containers-ecs-eks.md)).
- **ECS와 API Gateway v2** — 각각 태스크 정의의 `awslogs-group`, `aws_apigatewayv2_stage.access_log_settings.destination_arn`으로 지정하며 이름은 자유다. ECS의 `awslogs-create-group = "true"`는 ECS가 그룹을 만들어 버리므로 켜지 않는다.

순서는 `depends_on = [aws_cloudwatch_log_group.worker]` 로 못 박는다. 참조가 없는데도 순서가 필요한 대표적인 자리다. 생성 시에는 "그룹이 먼저"를 보장해 첫 호출이 그룹을 자동 생성하고 Terraform이 같은 이름으로 만들다 충돌하는 것을 막고, 삭제 시에는 순서가 뒤집혀 **함수가 먼저 사라진다.**

## 알람의 문법: 무엇을, 몇 번, 어떻게 볼 것인가

`aws_cloudwatch_metric_alarm`에서 Required는 **`alarm_name` 하나뿐이다.** 이 리소스가 서로 배타적인 세 형태(단순 지표, `metric_query` 기반, PromQL 기반)를 한 스키마에 담기 때문이며, "필수 인수"는 조합 규칙에서 온다.

```terraform
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "orders-api-5xx"
  alarm_description   = "ALB가 5분 중 3분 동안 5xx를 5건 넘게 반환"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { LoadBalancer = aws_lb.public.arn_suffix }

  alarm_actions             = [aws_sns_topic.alerts.arn]
  ok_actions                = [aws_sns_topic.alerts.arn]
  insufficient_data_actions = []
}
```

원문이 못 박은 조합 규칙이 둘이다. **`metric_query`를 하나라도 쓰면 `metric_name`, `namespace`, `period`, `statistic`을 쓸 수 없고**, 반대로 `metric_query`가 없으면 이 넷을 전부 지정해야 한다. 그리고 **`statistic`과 `extended_statistic`은 함께 쓸 수 없다** — 전자는 `SampleCount`/`Average`/`Sum`/`Minimum`/`Maximum`, 후자는 `p0.0`부터 `p100` 사이의 백분위이며 p99 지연시간 알람은 후자다.

`comparison_operator`도 두 계열이다. 정적 임계값용 `GreaterThanOrEqualToThreshold`, `GreaterThanThreshold`, `LessThanThreshold`, `LessThanOrEqualToThreshold` 넷과, **이상 탐지 모델 전용**인 `LessThanLowerOrGreaterThanUpperThreshold`, `LessThanLowerThreshold`, `GreaterThanUpperThreshold` 셋이다. 원문은 `threshold`를 **이상 탐지 알람에는 쓰면 안 된다**고 적으며 그 자리에는 `threshold_metric_id`가 온다. `period`의 유효값은 `10`, `20`, `30`, 또는 60의 배수이고 앞의 셋은 고해상도 지표 전용이다. `dimensions`에서 ALB와 타깃 그룹은 ARN이 아니라 **`arn_suffix` 속성**을 넣어야 한다.

`evaluation_periods`는 **최근 몇 개를 볼 것인가**(N)이고 `datapoints_to_alarm`은 그중 **몇 개가 넘어야 ALARM인가**(M)다. 생략하면 M = N이 되어 "최근 5분 전부가 5건 초과"여야 울리므로 스파이크성 장애는 잡히지 않는다. 그리고 **평가 창은 M이 아니라 N만큼 미끄러진다** — `evaluation_periods = 15`, `datapoints_to_alarm = 3`이면 3분이면 울리지만 OK로 돌아가는 데는 최대 15분이 걸린다.

## `treat_missing_data`: 가장 많이 틀리는 인수

원문 기준 유효값은 `missing`, `ignore`, `breaching`, `notBreaching` 넷이고 **기본값은 `missing`** 이다.

| 값 | 데이터 없는 구간의 처리 | 결과 |
|---|---|---|
| `missing` (기본값) | 평가에 넣지 않고, 유효 데이터가 부족하면 INSUFFICIENT_DATA로 간다 | 트래픽이 0이 되는 장애에서 ALARM으로 가지 않는다 |
| `notBreaching` | 정상으로 간주 | 조용해진다. 항상 데이터가 있는 지표에만 안전 |
| `breaching` | 위반으로 간주 | 데이터가 끊기면 울린다. "죽으면 알려 달라"에 맞는 값 |
| `ignore` | 현재 알람 상태를 그대로 유지 | 간헐적으로 비는 지표에서 상태가 튀는 것을 막는다 |

선택 기준은 **"이 지표는 정상일 때 항상 값이 있는가"** 다. ALB `RequestCount`나 ECS `CPUUtilization`처럼 늘 값이 나오는 지표는 데이터 없음이 곧 이상이므로 `breaching`을 쓴다. 반대로 Lambda `Errors`처럼 정상일 때 0이 아니라 **아예 없는** 지표는 `notBreaching`이고, "함수가 아예 죽었다"는 별도 알람(`Invocations`에 `LessThanThreshold 1` + `breaching`)으로 잡는다.

INSUFFICIENT_DATA는 그 자체가 상태이고 `insufficient_data_actions`라는 별도 목록을 가진다. 배포 중 잠깐 비는 것만으로 울리므로 대부분의 팀은 **빈 리스트로 명시**한다 — 생략과 달리 빈 리스트는 "액션 없음"을 코드로 못 박아 콘솔에서 누가 손으로 추가하면 drift로 잡힌다. `actions_enabled`(기본값 `true`)는 알람을 유지한 채 알림만 잠시 끌 때 쓴다.

## `metric_query`: 수식·질의·이상 탐지

`metric_query` 블록은 **최대 20개**까지 쓸 수 있고, 각 블록은 `metric`을 담거나 `expression`을 담는다 — 원문은 **둘 중 하나만** 쓰라고 명시한다. 그리고 **정확히 하나의 블록에서 `return_data = true`** 로 두어 알람의 대상을 지정한다.

가장 실용적인 형태는 비율 알람이다. "5xx가 5건 넘으면"은 트래픽이 열 배로 늘면 무의미해지지만 "5xx 비율이 1%를 넘으면"은 규모에 무관하다.

```terraform
resource "aws_cloudwatch_metric_alarm" "error_rate" {
  alarm_name          = "orders-api-error-rate"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "e1"
    expression  = "m2/m1*100"
    label       = "Error Rate (%)"
    return_data = true
  }

  metric_query {
    id = "m1"
    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = 60
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.public.arn_suffix }
    }
  }

  # m2 는 metric_name 만 HTTPCode_ELB_5XX_Count 로 바꾼 같은 구조
}
```

`metric` 블록 안에서는 인수 이름이 최상위와 다르다. 최상위는 `statistic`이지만 **`metric` 안에서는 `stat`** 이고, 그 안의 `metric_name`·`namespace`·`period`·`stat`은 전부 **Required**다. `id`는 문자·숫자·밑줄만 쓸 수 있고 **첫 글자가 소문자**여야 해서 `m1`, `e1` 같은 이름을 쓴다. `account_id`는 크로스 계정 알람용이다.

**이상 탐지 알람**은 위 구조를 그대로 쓰되 `expression`에 `ANOMALY_DETECTION_BAND(m1)`을 넣고, 최상위에서 `threshold` 대신 `threshold_metric_id = "e1"` 으로 그 밴드를 가리키며 `comparison_operator`에 이상 탐지 전용 값(`GreaterThanUpperThreshold` 등)을 쓴다. 주간과 야간, 평일과 주말의 정상 범위가 달라 고정 임계값을 정할 수 없는 지표에 맞지만 모델이 학습할 시간이 필요하므로 만들자마자 신뢰하면 안 된다. `expression`에는 Metrics Insights 질의도 들어가며, 이때는 `metric` 블록 없이 `expression` 하나로 알람이 성립하고 `period`를 그 블록에 직접 준다.

v6 스키마에는 PromQL 경로도 있다. `evaluation_criteria` 안의 `promql_criteria`가 Required이고 `query`(Required)와 `pending_period`·`recovery_period`(초, 0-86400)를 받으며, 이때 최상위 `evaluation_interval`이 **Required**가 된다. 원문은 이 블록이 **전통적인 지표 알람 인수와 함께 쓰일 수 없다**고 명시한다.

## 알람에서 사람까지: SNS 경로를 코드로

`alarm_actions`, `ok_actions`, `insufficient_data_actions`는 모두 **ARN 문자열의 리스트**다. SNS 토픽만 들어가는 것은 아니다 — Auto Scaling 정책 ARN을 넣으면 알람이 스케일링을 트리거한다([28장](28-compute-asg-alb.md)). 그러나 사람에게 닿는 경로의 사실상 표준은 SNS다.

```terraform
data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "AllowCloudWatchAlarmsToPublish"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}
```

여기서 실무자를 무는 지점이 셋이다.

**이메일 구독은 apply만으로 완성되지 않는다.** SNS는 확인 메일을 보내고 사람이 링크를 눌러야 활성화된다. Terraform은 `aws_sns_topic_subscription`을 성공적으로 만들지만 그 구독은 확인 대기 상태이고 알림이 가지 않는다. 그래서 실무에서는 확인 절차가 없는 Lambda나 HTTPS 엔드포인트 구독을 쓴다.

**KMS로 토픽을 암호화하면 키 정책도 열어야 한다.** CloudWatch가 발행하려면 `kms:GenerateDataKey*`와 `kms:Decrypt`가 필요하다. 키 정책에 `cloudwatch.amazonaws.com` 주체를 넣지 않으면 알람은 ALARM으로 잘 가는데 알림만 오지 않고, 이 실패는 눈에 띄는 에러를 어디에도 남기지 않는다.

**토픽 정책을 손대는 순간 기본 정책을 대체한다.** `aws_sns_topic_policy`는 정책을 통째로 교체하므로 계정 소유자의 접근을 허용하는 구문을 직접 넣지 않으면 콘솔에서도 토픽을 못 만지게 될 수 있다([33장](33-provider-functions-and-policies.md)).

`aws_sns_topic`의 `*_failure_feedback_role_arn` 계열은 **전달 실패를 CloudWatch Logs에 남기는 롤**이며 "알람이 울렸다는데 아무도 못 받았다"를 조사할 때 유일한 단서다. FIFO 토픽은 원문 기준 이메일·SMS·HTTP(S) 엔드포인트로 전달할 수 없으므로 알림 토픽에 쓰지 않는다.

## EventBridge: 지표가 아니라 사건을 잡는다

알람은 "숫자가 임계값을 넘었는가"에 답하고, EventBridge는 "무슨 일이 일어났는가"에 답한다. ECS 태스크가 비정상 종료했다, 스냅샷이 끝났다 — 이런 것들은 지표가 되기 전에 이벤트로 먼저 나온다.

`aws_cloudwatch_event_rule`은 `schedule_expression` 또는 `event_pattern` **중 최소 하나**를 요구한다. `schedule_expression`(`cron(0 20 * * ? *)`, `rate(5 minutes)`)은 **기본 이벤트 버스에서만** 쓸 수 있고, `event_pattern`의 크기는 기본 **2048자**이며 쿼터 상향으로 4096까지 늘릴 수 있다. `name_prefix`는 생성되는 접미사 길이 때문에 **38자 이하**여야 한다. `is_enabled`는 **deprecated**이며 `state`(`DISABLED`/`ENABLED`/`ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`, 기본값 `ENABLED`)를 쓴다. 마지막 값은 CloudTrail이 전달하는 이벤트까지 태우며 **`schedule_expression`과 함께 쓸 수 없다.** `event_pattern`은 문자열이지만 `jsonencode()`로 쓰면 참조를 그대로 넣을 수 있고 문법 오류가 plan에서 잡힌다.

```terraform
resource "aws_cloudwatch_event_rule" "task_stopped" {
  name = "ecs-task-stopped-unexpectedly"

  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Task State Change"]
    detail        = { clusterArn = [aws_ecs_cluster.main.arn], lastStatus = ["STOPPED"] }
  })
}

resource "aws_cloudwatch_event_target" "sns" {
  rule      = aws_cloudwatch_event_rule.task_stopped.name
  target_id = "notify-sns"
  arn       = aws_sns_topic.alerts.arn

  input_transformer {
    input_paths    = { cluster = "$.detail.clusterArn", reason = "$.detail.stoppedReason" }
    input_template = "\"ECS task in <cluster> stopped: <reason>\""
  }

  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 4
  }

  dead_letter_config { arn = aws_sqs_queue.event_dlq.arn }
}
```


타깃의 Required는 `arn`과 `rule` 둘이다. `target_id`를 생략하면 무작위로 붙는데, **`for_each`로 타깃을 만들 때는 반드시 명시**해야 한다 — import id(`event_bus_name/rule-name/target-id`)에도 그 값이 들어간다. 이벤트를 사람이 읽을 형태로 바꾸는 `input_transformer`는 `input`·`input_path`와 **서로 conflict한다.** 원문 규칙도 명확하다 — `input_template`이 **Required이고 유효한 JSON이어야** 하므로 문자열 하나를 보내더라도 **큰따옴표로 감싸야** 하고, 그 따옴표는 JSON과 Terraform 양쪽에서 이스케이프된다. `input_paths`는 최대 **100개** 키-값 쌍이고 **JSON 점 표기법만** 쓸 수 있으며(대괄호 표기 불가) **키가 `AWS`로 시작할 수 없다.**

`dead_letter_config.arn`은 **SQS 큐 ARN**이며, 이 큐가 없으면 재시도를 다 쓴 이벤트는 조용히 사라진다. 큐에도 EventBridge가 보낼 수 있게 하는 큐 정책이 필요하다. `role_arn`은 원문 기준으로 **`ecs_target`을 쓸 때, 또는 타깃이 EC2 인스턴스·Kinesis 데이터 스트림·Step Functions 상태 머신이거나 다른 계정/리전의 이벤트 버스일 때** 필요하다. SNS·SQS·Lambda 타깃은 롤이 아니라 **각자의 리소스 정책**으로 허가한다([30장](30-serverless-lambda.md)).

## VPC Flow Log

`aws_flow_log`는 ENI·서브넷·VPC 단위로 트래픽 메타데이터를 남긴다. 값어치는 "왜 막혔는가"에 답할 때 나온다 — security group과 NACL은 거부를 조용히 수행하므로 REJECT 레코드가 없으면 타임아웃만 보고 원인을 추측하게 된다([27장](27-vpc-networking.md)). **v6에서 `log_group_name`이 제거됐다.** 업그레이드 가이드의 지시는 한 줄이다 — 지우고 `log_destination`을 쓴다.

목적지는 `log_destination_type`으로 고르며 `cloud-watch-logs`(기본값), `s3`, `kinesis-data-firehose` 셋이고 이 선택이 비용과 사용법을 갈라놓는다. `cloud-watch-logs`는 Logs Insights로 즉시 질의할 수 있어 조사에 가장 빠른 대신 수집 요금이 가장 비싸고, `iam_role_arn`으로 **Flow Logs 서비스가 로그를 쓸 롤**을 줘야 한다(신뢰 정책 주체는 `vpc-flow-logs.amazonaws.com`, 권한은 `logs:CreateLogStream`·`logs:PutLogEvents`·`logs:DescribeLogStreams`). `s3`는 단가가 낮고 장기 보관에 맞으며 IAM 롤이 아니라 버킷 정책으로 허가한다. `kinesis-data-firehose`는 외부 SIEM으로 스트리밍할 때 쓴다.

```terraform
resource "aws_flow_log" "vpc_s3" {
  vpc_id                   = aws_vpc.main.id
  traffic_type             = "ALL"
  log_destination_type     = "s3"
  log_destination          = aws_s3_bucket.flow_logs.arn
  max_aggregation_interval = 600

  destination_options {
    file_format                = "parquet"
    per_hour_partition         = true
    hive_compatible_partitions = true
  }
}
```

`traffic_type`은 `ACCEPT`, `REJECT`, `ALL` 중 하나다. 비용을 줄이려고 `REJECT`만 켜면 "연결은 됐는데 응답이 안 온다"는 부류의 문제에 아무 단서가 남지 않는다. `max_aggregation_interval`은 레코드를 묶는 최대 간격이며 **`60` 또는 `600`** 초이고 기본값은 `600`이다.

`destination_options`는 **S3 목적지에서만** 의미가 있다. `file_format`은 `plain-text`(기본값)와 `parquet`, `per_hour_partition`은 시간별 파티션, `hive_compatible_partitions`는 Hive 형식 경로다. Athena로 조회할 계획이라면 셋 다 켠다 — 컬럼 지향 포맷과 파티션 프루닝이 스캔량을 한 자릿수 이상 줄이고 Athena 요금은 스캔한 바이트로 매겨진다.

`log_format`은 필드를 직접 고르는 인수인데 **Terraform 보간과 정면으로 충돌한다.** Flow Log 필드 문법이 `${srcaddr}`이고 Terraform도 `${...}`를 자기 것으로 읽어 "그런 변수가 없다"는 에러를 낸다. 해법은 `$${srcaddr}` 처럼 `$$`로 이스케이프하는 것이다. 기본 포맷에 없는 필드(`flow-direction`, `pkt-src-aws-service`, `traffic-path` 등)를 넣으려면 이 인수를 써야 하고, 넣는 순간 **필드 순서가 곧 파싱 스키마**가 되므로 Athena 테이블 정의와 함께 관리해야 한다.

## 알람을 코드로 관리하는 원칙

**알람은 감시 대상과 같은 모듈에 둔다.** 큐를 만드는 모듈이 그 큐의 적체 알람도 만든다. 그래야 큐를 지울 때 알람도 같이 사라지고 "이미 없는 리소스를 감시하는 알람"이 남지 않는다([19장](19-modules.md)).

**알람 세트는 `for_each`로 만든다.** 임계값 표를 `locals`에 두고 펼치면 리뷰 대상이 코드 백 줄이 아니라 표 한 개가 된다([17장](17-count-foreach-dynamic.md)).

```terraform
locals {
  queue_alarms = {
    depth = { metric = "ApproximateNumberOfMessagesVisible", threshold = 1000 }
    age   = { metric = "ApproximateAgeOfOldestMessage", threshold = 300 }
  }
}

resource "aws_cloudwatch_metric_alarm" "queue" {
  for_each = local.queue_alarms

  alarm_name          = "${var.queue_name}-${each.key}"
  namespace           = "AWS/SQS"
  metric_name         = each.value.metric
  threshold           = each.value.threshold
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = var.queue_name }
  alarm_actions       = [var.alerts_topic_arn]
}
```

**알람마다 "받으면 무엇을 할 것인가"를 정한다.** 답이 "아무것도"라면 그건 대시보드에 있어야 할 지표이지 알람이 아니다. `alarm_description`에 첫 조치를 한 줄로 적어 두면 새벽에 호출된 사람이 그것만 보고 움직인다.

## 흔한 실수

### ❌ 로그 그룹을 서비스에 맡기고 보존 기간을 설정하지 않는다

함수가 첫 호출에서 그룹을 만들면 보존 기간이 "만료 없음"이 되고, state 밖이라 destroy에도 남는다.

```terraform
resource "aws_lambda_function" "worker" {
  function_name = "orders-worker"
  role          = aws_iam_role.worker.arn
  # 로그 그룹 선언 없음 — Lambda가 알아서 만들고 보존 기간은 "만료 없음"이 된다
}
```

```terraform
# ✅ 그룹을 먼저 선언하고 순서를 못 박는다
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/orders-worker"
  retention_in_days = 14
}

resource "aws_lambda_function" "worker" {
  function_name = "orders-worker"
  role          = aws_iam_role.worker.arn
  depends_on    = [aws_cloudwatch_log_group.worker]
}
```

### ❌ 보존 기간을 짧게 하려고 `retention_in_days = 0`을 쓴다

`0`은 삭제가 아니라 **영구 보존**이다. 정확히 반대 결과를 얻는다.

```terraform
retention_in_days = 0  # 만료 없음. 비용이 무한히 쌓인다
retention_in_days = 45 # 유효값 목록에 없어 apply 실패
```

```terraform
# ✅ 유효값 목록에서 고른다 (1, 3, 5, 7, 14, 30, 60, 90, ... , 3653)
retention_in_days = 7
```

### ❌ 서비스가 죽는 장애를 `treat_missing_data` 기본값으로 감시한다

`missing`은 데이터 없는 구간을 판단하지 않으므로, 트래픽이 0이 되는 장애에서 알람이 ALARM으로 가지 않는다.

```terraform
resource "aws_cloudwatch_metric_alarm" "api_down" {
  alarm_name          = "api-no-traffic"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "RequestCount"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  # treat_missing_data 생략 -> "missing" -> 지표가 사라지면 INSUFFICIENT_DATA
}
```

```terraform
# ✅ 데이터가 끊기는 것 자체를 위반으로 본다
  datapoints_to_alarm = 3
  treat_missing_data  = "breaching"
  dimensions          = { LoadBalancer = aws_lb.public.arn_suffix }
```

### ❌ Flow Log의 `log_format`을 Terraform 보간 그대로 쓴다

Flow Log 필드 문법과 Terraform 보간이 같은 `${...}`라서 변수를 찾다 실패한다.

```terraform
log_format = "${version} ${srcaddr} ${dstaddr} ${action}" # Terraform 이 먼저 먹는다
```

```terraform
# ✅ $$ 로 이스케이프해 AWS 쪽으로 넘긴다
log_format = "$${version} $${srcaddr} $${dstaddr} $${action} $${log-status}"
```

## 프로덕션 노트

- **로그 수집 비용은 저장 비용보다 크다.** CloudWatch Logs 요금의 대부분은 보관이 아니라 수집(ingestion)에서 나온다. 보존 기간만 줄여서는 절반밖에 못 줄인다. 프로덕션에서 DEBUG 로그를 끄고, 조사용 대용량 로그는 `log_group_class = "INFREQUENT_ACCESS"`나 S3 목적지로 돌린다.
- **알람 개수 자체가 비용이다.** 고해상도 알람의 단가가 다르고 `metric_query` 알람은 참조하는 지표 수만큼 계산된다. `for_each`로 대량 생성할 때는 리소스 300개짜리 모듈이 알람 900개를 만든다는 것을 미리 계산한다. 알림 토픽·KMS 키·DLQ는 수명이 길므로 별도 state에 두고 모듈에는 ARN만 전달한다([16장](16-remote-state-and-backends.md)).
- **새 알람의 상태 전이는 즉시가 아니고 Flow Log도 마찬가지다.** 방금 만든 알람은 INSUFFICIENT_DATA에서 시작해 데이터가 `evaluation_periods` 만큼 쌓여야 판단을 시작하고, Flow Log의 첫 레코드는 집계 간격만큼(기본 10분) 뒤에야 목적지에 도착한다. apply 직후 비어 있는 것을 설정 오류로 오해하지 않는다.
- **로그 그룹 이름 변경은 로그 삭제와 같다.** `name`이 ForceNew이므로 접두사 표준을 바꾸는 리팩터링은 과거 로그를 버리는 결정이다. 남겨야 하면 새 그룹을 만들고 옛 그룹은 `skip_destroy` + `removed` 블록으로 state에서만 뺀다([22장](22-moved-removed-refactoring.md)).
- **CloudWatch API에도 스로틀링이 있다.** 알람 수백 개를 한 번에 만들면 `PutMetricAlarm`이 스로틀링을 맞는다. provider의 `max_retries`(v6 기본값 **25**)가 대부분 흡수하지만 대량 생성은 `-parallelism`을 낮추는 편이 안정적이다([40장](../level3-advanced/40-performance-and-throttling.md)).


## 연습문제

1. 같은 SQS 큐를 대상으로 `treat_missing_data`만 `missing`, `notBreaching`, `breaching`으로 다르게 설정한 알람 세 개를 만들고, 큐를 완전히 비운 뒤 각 알람의 상태를 비교하라.
   *성공 기준:* 세 알람이 서로 다른 상태(INSUFFICIENT_DATA / OK / ALARM)에 도달하는 것을 보이고, 어떤 지표에 어떤 값을 써야 하는지 근거와 함께 설명할 수 있다.

2. ALB의 `RequestCount`와 `HTTPCode_ELB_5XX_Count`로 오류율 알람을 `metric_query`로 만들고, 같은 알람에 최상위 `namespace`/`metric_name`을 함께 남긴 버전으로 `terraform plan`을 실행하라.
   *성공 기준:* 두 인수 계열이 공존할 수 없다는 것을 plan 출력으로 증명하고, `metric` 블록 안에서는 `stat`을 쓴다는 것을 코드로 보일 수 있다.

3. 하나의 VPC에 S3 목적지 Flow Log를 붙이고 `destination_options`로 Parquet + 시간별 파티션을 켠 뒤 `log_format`으로 `flow-direction` 필드를 추가하라.
   *성공 기준:* 레코드가 도착하는 것을 확인하고 `log_format` 문자열에 `$$` 이스케이프가 필요한 이유를 설명할 수 있다.

## 요약

- 로그 그룹은 서비스가 자동 생성하게 두면 보존 기간이 무제한이고 state 밖에 남는다. 로그를 뱉는 리소스를 코드로 만든다면 그 그룹도 코드로 만들고 `depends_on`으로 순서를 고정한다.
- `aws_cloudwatch_log_group`의 `name`/`name_prefix`는 둘 다 ForceNew이고 서로 conflict한다. `retention_in_days`는 정해진 유효값 목록에서만 고를 수 있고 **`0`은 영구 보존**이다. `log_group_class`의 `DELIVERY`는 보존 기간을 강제로 2로 만든다.
- `aws_cloudwatch_metric_alarm`의 Required는 `alarm_name` 하나다. `metric_query`를 쓰면 `metric_name`·`namespace`·`period`·`statistic`을 쓸 수 없고, `statistic`과 `extended_statistic`은 함께 쓸 수 없으며, 이상 탐지 알람은 `threshold` 대신 `threshold_metric_id`를 쓴다.
- `evaluation_periods`(N)와 `datapoints_to_alarm`(M)이 M of N을 만든다. M을 생략하면 M = N이고 복구는 항상 N 창만큼 걸린다. `treat_missing_data`의 기본값은 `missing`이며, 정상일 때 항상 값이 있는 지표는 `breaching`, 정상일 때 지표가 없는 지표는 `notBreaching`이 맞다.
- `metric_query`는 최대 20개이며 각 블록은 `metric`이나 `expression` 중 하나만 담고 정확히 하나가 `return_data = true`여야 한다. 블록 안의 통계 인수는 `stat`이다. 알림 경로는 SNS 토픽 + 토픽 정책 + (암호화 시) KMS 키 정책까지가 한 벌이며, 이메일 구독은 사람이 확인해야 활성화되므로 apply 성공이 곧 동작은 아니다.
- EventBridge 규칙은 `schedule_expression`(기본 버스 전용)이나 `event_pattern` 중 하나가 필요하고 `is_enabled`는 deprecated다. 타깃에서는 `input`/`input_path`/`input_transformer`가 서로 conflict하며 `retry_policy`와 `dead_letter_config`가 전달 실패를 붙잡는다.
- `aws_flow_log`는 v6에서 `log_group_name`이 제거됐고 `log_destination`을 쓴다. S3 목적지에서는 `destination_options`로 Parquet과 시간별 파티션을 켜고, `log_format`의 필드는 `$$`로 이스케이프한다.

## 다음으로

- [33장 — Provider 함수와 IAM 정책 문서](33-provider-functions-and-policies.md) — 이 장에서 계속 등장한 토픽·큐·키 정책을 정확하게 쓰는 법.
- [36장 — Drift · refresh · check 블록과 지속 검증](../level3-advanced/36-drift-refresh-and-checks.md) — 알람으로 잡지 못하는 것을 `check`로 검증한다.
- [30장 — 서버리스: Lambda · API Gateway v2 · 이벤트](30-serverless-lambda.md) — Lambda 로그 그룹과 EventBridge 권한 모델.
- 공식 문서: [aws_cloudwatch_metric_alarm](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_metric_alarm), [aws_flow_log](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/flow_log)
