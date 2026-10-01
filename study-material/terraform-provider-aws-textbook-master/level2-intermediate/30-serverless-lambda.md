---
chapter: 30
level: "Level 2 — 중급"
title: "서버리스: 코드 배포와 인프라 선언의 경계에서 Lambda 다루기"
difficulty: 중급
reading_time: "30분"
prerequisites: [12, 13]
source_docs:
  - "website/docs/r/lambda_function.html.markdown"
  - "website/docs/r/lambda_permission.html.markdown"
  - "website/docs/r/apigatewayv2_api.html.markdown"
  - "website/docs/r/cloudwatch_event_rule.html.markdown"
  - "website/docs/r/cloudwatch_log_group.html.markdown"
  - "website/docs/r/sqs_queue.html.markdown"
  - "website/docs/r/s3_object.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function"
provider_baseline: "6.x"
---

# 30장 — 서버리스: 코드 배포와 인프라 선언의 경계에서 Lambda 다루기

**이 장에서 배우는 것**

- 배포 패키지 세 경로(`filename`, `s3_bucket`/`s3_key`, `image_uri`)를 상황에 맞게 고를 수 있다.
- `source_code_hash` 와 `code_sha256` 의 차이를 알고, 코드가 바뀌었는데 apply가 무변경으로 끝나는 사고를 막을 수 있다.
- `aws_lambda_permission` 이 왜 실행 롤로 대체될 수 없는지 이해하고 `principal`·`source_arn` 을 정확히 채울 수 있다.
- API Gateway v2 HTTP API, EventBridge, SQS/SNS 트리거를 각각의 권한 모델과 함께 구성할 수 있다.
- 로그 그룹을 명시적으로 선언해야 하는 이유와 VPC 연결이 만드는 지연·삭제 문제를 설계에 반영한다.
- 인프라와 코드의 배포 주기를 분리하고 `lifecycle` 로 그 경계를 코드에 못 박을 수 있다.

**왜 중요한가**

서버리스에서 가장 흔한 사고는 "apply는 성공했는데 아무 일도 일어나지 않는" 상태다. 함수도 있고 EventBridge 규칙도 있고 타깃도 붙었는데, 5분마다 돌아야 할 배치가 하루 종일 한 번도 실행되지 않는다. CloudWatch에는 로그 스트림조차 없다 — 호출된 적이 없으니 로그가 생길 리 없다. 빠진 것은 `aws_lambda_permission` 하나다. Lambda는 리소스 기반 정책이 없으면 외부 서비스의 호출을 거절하고, 그 거절은 호출한 쪽(EventBridge의 `FailedInvocations` 지표)에만 남는다.

두 번째는 코드가 배포되지 않는 사고다. `filename = "function.zip"` 만 써 두고 zip을 새로 빌드했는데 `terraform plan` 이 `No changes` 를 낸다. Terraform은 로컬 파일의 내용을 추적하지 않으므로 `filename` 문자열이 그대로면 변경이 없다고 본다. 릴리스 담당자는 apply 성공을 배포 완료로 보고하지만 프로덕션에는 3주 전 코드가 돌고 있다.

세 번째는 VPC다. RDS에 붙어야 해서 `vpc_config` 를 넣는 순간 함수는 인터넷 접근을 잃고, 그 스택을 내릴 때는 원문이 경고하듯 함수에 연결된 **서브넷과 시큐리티 그룹 삭제가 최대 45분까지 걸릴 수 있다.**

## 배포 패키지: 세 갈래 길

`aws_lambda_function` 의 Required는 `function_name` 과 `role` 둘뿐이지만 원문이 못 박은 제약이 있다 — **`filename`, `image_uri`, `s3_bucket` 중 정확히 하나를 지정해야 하고 셋은 서로 conflict한다.**

`filename` 은 로컬 zip이다. 실행 주체의 디스크에 파일이 있어야 해서 CI 러너와 개발자 노트북의 산출물이 달라지기 쉽다. `s3_bucket` + `s3_key`(+`s3_object_version`)는 S3 경유이며 `s3_bucket` 을 쓰면 `s3_key` 가 Required가 된다 — 원문은 **큰 배포 패키지에 S3 업로드를 권장**한다. `image_uri` 는 컨테이너 이미지이고 `package_type = "Image"` 와 함께 쓰며, 이때는 `handler`·`runtime` 대신 `image_config` 블록(`entry_point`, `command`, `working_directory`)이 진입점을 정한다. 반대로 `handler` 와 `runtime` 은 `package_type` 이 `Zip` 일 때 Required다.

```terraform
resource "aws_s3_object" "artifact" {
  bucket      = aws_s3_bucket.artifacts.id
  key         = "orders/${var.release_version}/function.zip"
  source      = "${path.module}/dist/function.zip"
  source_hash = filemd5("${path.module}/dist/function.zip")
}

resource "aws_lambda_function" "from_s3" {
  function_name     = "orders-processor"
  role              = aws_iam_role.lambda.arn
  s3_bucket         = aws_s3_object.artifact.bucket
  s3_key            = aws_s3_object.artifact.key
  s3_object_version = aws_s3_object.artifact.version_id
  handler           = "index.handler"
  runtime           = "nodejs24.x"
}
```

오브젝트가 Terraform 리소스이므로 **의존성 그래프가 저절로 생긴다** — 함수가 `version_id` 를 참조하는 순간 "먼저 업로드, 그다음 함수 갱신" 순서가 보장된다. `etag` 는 KMS 암호화나 16MB 초과 멀티파트 업로드에서 MD5가 아니게 되므로 **`source_hash`** 를 쓴다.

## 코드가 바뀐 것을 어떻게 아는가

Terraform은 `filename` 이 가리키는 파일의 **내용**을 추적하지 않는다. 이 구멍을 메우는 인수가 둘이다.

- **`source_code_hash`** — 사용자가 정의한 소스 패키지 해시. 원문 표현으로 **AWS provider만 추적하는 합성(synthetic) 인수**이며 Lambda의 `CodeSha256` 과 알고리즘이 같을 필요가 없다. 대신 **out-of-band 변경(콘솔·CLI로 바꾼 코드)은 감지하지 못한다.**
- **`code_sha256`** — 소스 패키지의 Base64 표현. zip이면 `.zip` 의 Base64 SHA-256, OCI면 이미지 다이제스트가 전달된다. **레이어는 계산에 포함되지 않는다.**

콘솔에서 몰래 바뀐 코드까지 되돌리려면 `code_sha256`, 로컬 빌드 산출물의 변경만 트리거로 삼으려면 `source_code_hash` 다. `data "archive_file"` 은 `hashicorp/archive` provider의 데이터 소스이며 plan 단계에서 zip을 만들어 `output_path` 와 `output_base64sha256` 을 내놓는다.

```terraform
data "archive_file" "this" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/build/function.zip"
}

resource "aws_lambda_function" "this" {
  function_name = "orders-processor"
  role          = aws_iam_role.lambda.arn
  filename      = data.archive_file.this.output_path
  code_sha256   = data.archive_file.this.output_base64sha256
  # ... handler, runtime ...
}
```

다만 `archive_file` 은 **소스 트리를 압축할 뿐 빌드를 하지 않는다.** 의존성 설치나 네이티브 확장 컴파일은 Terraform 밖에서 끝나 있어야 하고, zip 안의 타임스탬프가 실행마다 달라지면 코드 변경이 없어도 매 apply가 함수를 갱신한다.

## 함수의 실행 형태를 정하는 인수들

```terraform
resource "aws_lambda_function" "worker" {
  function_name = "reports-worker"
  role          = aws_iam_role.lambda.arn
  handler       = "app.handler"
  runtime       = "python3.12"

  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 120

  ephemeral_storage { size = 2048 }
  dead_letter_config { target_arn = aws_sqs_queue.dlq.arn }
}
```

- **`role`** — 함수의 **실행 롤**. 코드가 AWS API를 호출할 때 쓰는 신원이며 `lambda.amazonaws.com` 을 신뢰해야 한다([13장](../level1-beginner/13-iam-basics.md)). 원문이 강조하는 구분이 여기 있다 — `role` 은 **나가는 방향**, `aws_lambda_permission` 은 **들어오는 방향**이다.
- **`architectures`** — `["x86_64"]`(기본) 또는 `["arm64"]`. 원문에 특이한 문장이 있다 — **제거해도 함수의 아키텍처는 그대로 유지된다.**
- **`memory_size`** — 기본 **128MB**(128MB~32,768MB). 메모리에 비례해 vCPU가 배정되므로 사실상 CPU 손잡이이며, CPU 바운드 함수는 메모리를 올리면 총비용이 **내려가는** 구간이 있다. **`timeout`** 은 기본 **3초**(1~900초)로 거의 언제나 너무 짧다.
- **`ephemeral_storage.size`** — `/tmp` 크기, **512MB~10,240MB(10GB)**. `layers` 는 레이어 버전 ARN **최대 5개**이며 `code_sha256` 계산에 포함되지 않는다. `tracing_config.mode` 는 `Active` 또는 `PassThrough` 다.
- **`dead_letter_config.target_arn`** — 비동기 호출 실패를 알릴 SNS 토픽이나 SQS 큐. 더 세밀한 재시도 제어는 `aws_lambda_function_event_invoke_config` 가 맡는다.
- **`reserved_concurrent_executions`** — 기본 **`-1`(제한 없음)**, **`0` 이면 호출이 완전히 막힌다.** 계정 동시성 한도를 한 함수가 다 먹지 못하게 막는 상한이므로 RDS처럼 커넥션이 유한한 다운스트림을 부르는 함수에는 반드시 건다 — 트래픽이 튀는 순간 수백 개 실행 환경이 DB 커넥션을 고갈시키는 것이 서버리스에서 가장 흔한 연쇄 실패다([31장](31-databases-rds-dynamodb.md)).
- **`publish`** — 기본 `false`. `true` 면 변경마다 새 버전이 발행되고 `version`·`qualified_arn` 이 채워지며 별칭은 `aws_lambda_alias` 가 맡는다. 이때 **트리거도 별칭을 가리켜야 한다** — permission의 `qualifier` 와 API Gateway의 `qualified_invoke_arn` 을 쓴다.

## 환경변수는 state에 남는다

`environment` 블록에는 `variables` 맵 하나뿐이다. 편리해서 DB 비밀번호나 API 키를 넣고 싶어지는데, **그 값은 state에 평문으로 저장된다.** `kms_key_arn` 을 줘도 마찬가지다 — 그 인수는 AWS 쪽 환경변수 암호화 키를 정할 뿐 state 저장 방식과 무관하다. 답은 **환경변수에 시크릿의 "위치"만 넣는 것**이다. `DB_SECRET_ID = aws_secretsmanager_secret.db.name` 을 넘기고 함수가 런타임에 조회하면 회전이 apply 없이 이뤄지고 state에는 이름만 남는다([26장](26-secrets-and-ephemeral.md)).

`kms_key_arn` 자체에도 함정이 있다. 환경변수를 쓰지 않는데 이 값을 주면 **Lambda API가 설정을 저장하지 않아** 영원한 diff가 된다. 그리고 호출 시 `KMSAccessDeniedException` 이 나면 대개 **함수 생성 이후 실행 롤이 삭제되고 같은 이름으로 재생성된 경우**다 — 롤에 부여됐던 KMS grant가 무효가 되기 때문이며 함수를 `taint` 해 재생성하면 풀린다.

## VPC에 붙이는 순간 생기는 것들

`vpc_config` 에서 `subnet_ids` 와 `security_group_ids` 는 Required다. 원문에 중요한 주석이 붙어 있다 — **`subnet_ids`, `security_group_ids`, `ipv6_allowed_for_dual_stack` 이 모두 비면 `vpc_config` 는 설정되지 않은 것으로 간주된다.**

**첫째, 함수는 서브넷의 라우팅을 그대로 따른다.** 프라이빗 서브넷에 NAT Gateway가 없으면 인터넷에 못 나가고, 퍼블릭 서브넷에 넣는 것은 해결책이 아니다 — 함수 ENI에는 퍼블릭 IP가 붙지 않는다. S3·DynamoDB만 필요하면 NAT 대신 **게이트웨이 VPC 엔드포인트**가 정답이다([27장](27-vpc-networking.md)).

**둘째, 삭제가 느려진다.** 원문 첫 노트가 명시한다 — 2019년 9월부터 배포된 개선된 VPC 네트워킹 때문에 **함수에 연결된 EC2 서브넷과 시큐리티 그룹 삭제가 최대 45분까지 걸릴 수 있다**(provider 2.31.0 이상은 이 타임아웃을 자동 처리한다). 시큐리티 그룹 삭제가 교착되면 `replace_security_groups_on_destroy`(기본 `false`)와 `replacement_security_group_ids` 로 파괴 순서를 바꾼다.

**셋째, 콜드 스타트가 커진다.** ENI 준비 때문에 초기 지연이 커지며, `snap_start { apply_on = "PublishedVersions" }` 가 이를 줄이는 수단이다(유효 값은 원문 기준 이 하나뿐이고 `publish = true` 가 전제다).

## 로그 그룹은 직접 선언한다

Lambda는 첫 호출 때 `/aws/lambda/<function_name>` 로그 그룹을 **자동으로 만든다.** 그 그룹은 state에 없으므로 두 문제가 생긴다 — 보존 기간이 "만료 없음"이라 비용이 영원히 쌓이고, `destroy` 후에도 고아로 남는다.

```terraform
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "worker" {
  function_name = var.function_name
  # ...
  logging_config {
    log_format            = "JSON"
    application_log_level = "INFO"
  }

  depends_on = [aws_cloudwatch_log_group.worker]
}
```

이름 규칙을 정확히 지켜야 한다. `/aws/lambda/` 접두사에 **함수 이름을 그대로** 붙인 것이 아니면 Lambda는 자기 것을 따로 만든다. `retention_in_days` 는 원문이 열거한 값(1, 3, 5, 7, 14, 30, ... , 3653, 0) 중에서만 고를 수 있고 **`0` 은 영구 보존**이며, `name` 과 `name_prefix` 는 ForceNew다.

`depends_on` 이 필요한 이유는 순서다. 함수가 먼저 만들어져 곧바로 호출되면 Lambda가 그룹을 자동 생성해 버리고 Terraform이 같은 이름으로 만들려다 충돌한다. 삭제 시에는 반대로 그룹이 나중에 지워져야 하는데 `depends_on` 이 그 순서도 뒤집어 준다.

`logging_config.log_format` 은 Required이며 `Text` 또는 `JSON` 이다. **`JSON` 일 때만 `application_log_level`·`system_log_level` 필터가 의미를 갖는다.** `log_group` 으로 `log_group_class = "DELIVERY"` 인 그룹을 지정하면 구독 필터를 통해 로그를 S3나 Data Firehose로 내려보낼 수 있다.

## `aws_lambda_permission`: 들어오는 문을 여는 리소스

Lambda의 권한은 두 방향이다. 나가는 방향은 실행 롤(`role`), 들어오는 방향은 **리소스 기반 정책**이다. EventBridge가 함수를 호출하려면 EventBridge에 권한을 주는 게 아니라 **함수 쪽 정책에 "events.amazonaws.com 이 나를 호출해도 된다"고 적어야 한다.** AWS 서비스 주체는 IAM 롤을 갖지 않아 `aws_iam_policy` 로는 표현할 대상 자체가 없다.

Required는 `action`, `function_name`, `principal` 셋이다.

```terraform
resource "aws_lambda_permission" "from_events" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.worker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly.arn
}
```

**`source_arn` 은 Optional이지만 사실상 필수다.** 빼면 "events.amazonaws.com 이면 누구든 호출 가능"이 되어 **다른 계정이 만든 규칙**도 이 함수를 부를 수 있다. S3나 SES처럼 ARN에 계정 정보가 없는 소스에는 `source_account` 를 함께 건다.

`statement_id` 는 주지 않으면 Terraform이 생성하며 `statement_id_prefix` 와 conflict한다. 여러 소스가 한 함수를 호출할 때 id가 겹치면 나중 것이 앞 것을 덮어써 권한이 사라진다. 함수가 재생성되면 정책도 사라지는데 Terraform은 permission에 변화가 없다고 보므로, 원문 예제대로 `lifecycle { replace_triggered_by = [aws_lambda_function.example] }` 를 걸어 둔다([21장](21-lifecycle-meta-arguments.md)).

## 이벤트 소스 (1) — API Gateway v2 HTTP API

`aws_apigatewayv2_api` 의 Required는 `name` 과 `protocol_type`(**`HTTP` 또는 `WEBSOCKET`**)이다. REST API(v1)는 `aws_api_gateway_rest_api` 라는 다른 계열이다.

```terraform
resource "aws_apigatewayv2_api" "http" {
  name          = "orders-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["https://app.example.com"]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_orders" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /orders"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}
```

조립 순서는 **API -> 통합 -> 라우트 -> 스테이지**이며, `auto_deploy = true` 면 별도 `aws_apigatewayv2_deployment` 를 관리하지 않아도 된다.

여기에 `principal = "apigateway.amazonaws.com"`, `source_arn = "${aws_apigatewayv2_api.http.execution_arn}/*/*"` 인 permission을 더해야 호출이 통과한다. 원문이 명시하듯 `execution_arn` 은 **`aws_lambda_permission` 의 `source_arn` 에 쓰라고 만들어진 ARN 접두사**이고, 뒤의 `/*/*` 가 "이 API의 어느 스테이지·메서드·경로에서 오든 허용"을 뜻한다. 외부 노출 주소는 `api_endpoint` 가 내보내며 커스텀 도메인만 쓰게 하려면 `disable_execute_api_endpoint` 를 켠다. `cors_configuration` 은 **HTTP API에만** 적용되고, `body` 로 OpenAPI 문서를 넘기면 통합과 라우트가 그 문서로 구성되므로 **별도 리소스로 함께 관리해서는 안 된다.**

## 이벤트 소스 (2) — EventBridge와 큐

정해진 시각에 도는 배치나 AWS 이벤트에 반응하는 함수는 `aws_cloudwatch_event_rule` + `aws_cloudwatch_event_target` 조합이다(이름의 `cloudwatch` 는 EventBridge의 옛 이름에서 왔다).

```terraform
resource "aws_cloudwatch_event_rule" "nightly" {
  name                = "orders-nightly-rollup"
  schedule_expression = "cron(0 2 * * ? *)"
}

resource "aws_cloudwatch_event_target" "nightly" {
  rule = aws_cloudwatch_event_rule.nightly.name
  arn  = aws_lambda_function.worker.arn
}
```

`schedule_expression` 과 `event_pattern` 중 **최소 하나는 필요하다.** 스케줄은 `cron(0 20 * * ? *)` 또는 `rate(5 minutes)` 형식이며 원문의 제약이 하나 붙는다 — **`schedule_expression` 은 기본 이벤트 버스에서만 쓸 수 있다.** `event_pattern` 은 JSON 문자열이고 기본 크기 제한이 **2048자**다. 상태는 `state`(기본 `ENABLED`)로 정하며 옛 인수 **`is_enabled` 는 deprecated이고 `state` 와 conflict**한다. 여기에도 `principal = "events.amazonaws.com"` permission이 반드시 따라야 한다.

큐 쪽은 성격이 다르다. **SNS는 푸시**, **SQS는 폴링**이다. SNS는 토픽 구독(`aws_sns_topic_subscription` 의 `protocol = "lambda"`)이 함수를 직접 호출하므로 `principal = "sns.amazonaws.com"` permission이 필요하고, SQS는 Lambda 서비스가 큐를 대신 폴링하므로 `aws_lambda_event_source_mapping` 이 그 폴러를 만든다.

```terraform
resource "aws_sqs_queue" "orders" {
  name                       = "orders"
  visibility_timeout_seconds = 180 # 함수 timeout(120)보다 크게
  receive_wait_time_seconds  = 20  # long polling 최대값

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_event_source_mapping" "orders" {
  event_source_arn = aws_sqs_queue.orders.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 10
}
```

여기서 permission이 **필요 없다.** 방향이 반대이므로 필요한 것은 **실행 롤의 `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` 권한**이다. `visibility_timeout_seconds` 는 기본 30초(0~43200)이며 **함수 `timeout` 보다 넉넉히 커야 한다.** `message_retention_seconds` 는 60~1209600초(기본 345600)이고 DLQ는 대개 최대값으로 둔다. `redrive_policy` 에는 원문이 경고하는 함정이 있다 — **`maxReceiveCount` 는 정수 `5` 여야 하고 문자열이면 안 된다.** 배치 처리 중 일부만 실패한 경우를 살리려면 매핑에 `function_response_types = ["ReportBatchItemFailures"]` 를 준다.

## 코드 배포와 인프라 배포를 분리하기

**함수 코드 배포를 Terraform이 해야 하는가?** 주기가 다르다는 것이 핵심이다. VPC·IAM·큐는 몇 주에 한 번 바뀌지만 애플리케이션 코드는 하루에도 몇 번 바뀐다. 코드 배포를 여기에 묶으면 개발자가 배포할 때마다 인프라 apply 권한이 필요해지고 배포 실패가 state를 어중간하게 남긴다.

현실적인 분리는 두 층이다. **Terraform**은 "함수가 존재한다"까지만 맡고 최초 생성 시 더미 zip을 올리며, **배포 파이프라인**은 `aws lambda update-function-code` 나 별칭 이동으로 코드만 교체한다. 이 분리를 코드에 못 박는 장치가 `lifecycle` 이다.

```terraform
resource "aws_lambda_function" "api" {
  function_name = "orders-api"
  role          = aws_iam_role.lambda.arn
  # ... handler, runtime ...

  filename         = "${path.module}/bootstrap.zip"
  source_code_hash = filebase64sha256("${path.module}/bootstrap.zip")

  lifecycle {
    ignore_changes = [filename, source_code_hash, s3_key, s3_object_version, image_uri, publish]
  }
}
```

대가도 분명하다 — **"지금 프로덕션에 어떤 코드가 있는가"를 state가 더 이상 답해 주지 못하고** 그 진실은 파이프라인의 배포 기록으로 옮겨간다. 어느 쪽이 맞다기보다 팀이 어디서 답을 찾을지 정하고 일관되게 지키는 것이 중요하다.

인프라를 만든 직후 함수를 한 번 호출해야 할 때도 있다 — 마이그레이션 트리거, 초기 데이터 시드. Provider는 `aws_lambda_invocation` 을 관리형과 ephemeral 두 갈래로 제공하며 차이는 결과의 저장 여부다. 관리형은 결과를 state에 남겨 시크릿을 반환하는 함수에 쓸 수 없고, ephemeral 쪽은 [26장](26-secrets-and-ephemeral.md)의 규칙대로 값이 apply 중에만 존재한다. apply 중 호출은 plan에 결과가 드러나지 않고 실패해도 롤백이 없으므로 **선언으로 표현할 수 있는 것은 선언으로 둔다.**

## 흔한 실수

### ❌ 해시 인수 없이 `filename` 만 쓴다

```terraform
resource "aws_lambda_function" "bad" {
  function_name = "orders-api"
  role          = aws_iam_role.lambda.arn
  filename      = "function.zip" # zip을 새로 빌드해도 plan은 No changes
  # ...
}
```

```terraform
# ✅ 패키지 내용의 해시를 인수로 연결해 변경을 감지시킨다
resource "aws_lambda_function" "good" {
  function_name = "orders-api"
  role          = aws_iam_role.lambda.arn
  filename      = data.archive_file.this.output_path
  code_sha256   = data.archive_file.this.output_base64sha256
  # ...
}
```

### ❌ 트리거를 붙였는데 `aws_lambda_permission` 을 잊는다

```terraform
resource "aws_cloudwatch_event_target" "bad" {
  rule = aws_cloudwatch_event_rule.nightly.name
  arn  = aws_lambda_function.worker.arn
}
# 규칙도 타깃도 정상인데 함수는 한 번도 호출되지 않는다 — 실행 롤에
# 권한을 더해도 해결되지 않는다. 방향이 반대다.
```

```terraform
# ✅ 들어오는 호출은 리소스 기반 정책으로 연다. source_arn까지 반드시 좁힌다
resource "aws_lambda_permission" "from_events" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.worker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly.arn
  statement_id  = "AllowExecutionFromEventBridge"
}
```

### ❌ 환경변수에 시크릿을 직접 넣는다

```terraform
environment {
  variables = {
    DB_PASSWORD = var.db_password # state에 평문으로 남는다
  }
}
```

```terraform
# ✅ 위치만 넘기고 값은 런타임에 조회한다 (실행 롤에는
#    secretsmanager:GetSecretValue 와 필요한 kms:Decrypt 를 부여)
environment {
  variables = {
    DB_SECRET_ID = aws_secretsmanager_secret.db.name
  }
}
```

### ❌ SQS 가시성 타임아웃을 함수 타임아웃보다 짧게 둔다

```terraform
resource "aws_sqs_queue" "bad" {
  visibility_timeout_seconds = 30 # 기본값 그대로인데 함수 timeout은 120
}
# 30초가 지나면 메시지가 다시 보이고 같은 주문이 여러 번 처리된다
```

```terraform
# ✅ 가시성 타임아웃을 함수 타임아웃보다 크게 잡고 DLQ를 건다
resource "aws_sqs_queue" "good" {
  visibility_timeout_seconds = 180

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5 # 문자열 "5"가 아니라 정수여야 한다
  })
}
```

## 프로덕션 노트

- **`destroy` 시간을 미리 알려 둔다.** VPC 연결 함수가 있는 스택은 서브넷·시큐리티 그룹 삭제가 최대 45분까지 걸릴 수 있어 CI 잡 타임아웃이 짧으면 매번 실패한다. 함수 자체의 timeouts 기본값은 create/update/delete 모두 10분이다.
- **로그 비용이 함수 비용을 넘는 경우가 있다.** 실행이 짧고 호출이 많은 함수는 로그 수집·저장비가 컴퓨트 비용을 앞지른다. `application_log_level` 을 올리고 보존 기간을 줄이며, 장기 보관은 `DELIVERY` 클래스와 구독 필터로 S3에 내리는 편이 싸다.
- **`reserved_concurrent_executions` 는 다운스트림 보호 장치다.** 상한을 걸되 `0` 을 실수로 커밋하면 알람 없는 전면 장애가 되므로 리뷰에서 걸러야 할 값이다.
- **statement id 충돌은 조용히 권한을 지운다.** 소스별로 다른 `statement_id` 를 명시하거나 `statement_id_prefix` 를 쓰고, 함수 재생성 시에는 `replace_triggered_by` 로 permission도 함께 재생성시킨다.
- **모노레포에서는 함수 개수만큼 state가 커진다.** 함수 50개를 한 state에 넣으면 매 plan이 50번의 `GetFunction` 을 부르고 스로틀링에 걸린다. 서비스 경계로 state를 쪼개고([16장](16-remote-state-and-backends.md)) 함수는 모듈로 묶어 `for_each` 로 찍는다.

## 연습문제

1. `data "archive_file"` 로 만든 zip을 `filename` 으로 배포하는 함수를 해시 인수 없이 apply한 뒤 소스 한 줄을 고치고 `terraform plan` 을 실행하라. 이어서 `code_sha256` 을 붙이고 같은 실험을 반복하라.
   *성공 기준:* 첫 plan이 `No changes` 를, 두 번째 plan이 함수 갱신을 보여주는 출력을 나란히 제시할 수 있다.

2. `rate(5 minutes)` 규칙으로 함수를 호출하는 구성을 `aws_lambda_permission` 없이 apply하고 10분 뒤 함수의 로그 그룹과 규칙의 `FailedInvocations` 지표를 확인한 다음, permission을 추가해 다시 확인하라.
   *성공 기준:* permission 이전에는 로그 스트림이 없고 규칙 쪽 지표에만 실패가 기록되는 것을 근거와 함께 설명할 수 있다.

3. `timeout = 60` 인 함수와 `visibility_timeout_seconds = 30` 인 SQS 큐를 연결하고 45초를 소비하는 핸들러로 메시지 하나를 처리한 뒤, 로그에서 같은 메시지 ID가 몇 번 처리되는지 세고 가시성 타임아웃을 고쳐 재현이 사라지는 것을 확인하라.
   *성공 기준:* 수정 전 중복 처리 횟수와 수정 후 1회 처리를 로그로 증명하고, `maxReceiveCount` 를 넘긴 메시지가 DLQ로 이동한 것을 확인할 수 있다.

4. 함수에 `lifecycle { ignore_changes = [filename, source_code_hash] }` 를 걸고 AWS CLI로 코드를 교체한 뒤 `terraform plan` 을 실행하고, 이어서 `ignore_changes` 를 제거하고 다시 plan을 실행하라.
   *성공 기준:* 두 plan의 차이를 설명하고, 각 방식이 "프로덕션에 어떤 코드가 있는가"의 답을 어디에 두는지 정리할 수 있다.

## 요약

- `aws_lambda_function` 의 Required는 `function_name` 과 `role` 뿐이고, 배포 패키지는 `filename` / `s3_bucket`+`s3_key` / `image_uri` 중 정확히 하나로 준다. 셋은 서로 conflict하며 원문은 큰 패키지에 S3를 권한다.
- `source_code_hash` 는 provider만 추적하는 합성 인수로 out-of-band 코드 변경을 잡지 못하고, `code_sha256` 은 패키지의 Base64 SHA-256이라 콘솔 변경까지 잡는다.
- 기본값을 외운다 — `memory_size` 128MB, `timeout` 3초, `publish` `false`, `reserved_concurrent_executions` `-1`(0은 호출 차단), `layers` 최대 5개.
- `environment.variables` 값은 state에 평문으로 남고 `kms_key_arn` 은 AWS 쪽 암호화만 바꾼다. `vpc_config` 를 붙이면 함수는 서브넷 라우팅을 따르며 연결된 서브넷·시큐리티 그룹 삭제가 최대 45분 걸릴 수 있다.
- 로그 그룹은 `/aws/lambda/<function_name>` 이름으로 직접 선언하고 `retention_in_days` 를 정한다(`0` 은 영구 보존). `log_format` 이 `JSON` 일 때만 레벨 필터가 의미를 갖는다.
- 들어오는 호출은 실행 롤이 아니라 `aws_lambda_permission` 으로 연다. `action`·`function_name`·`principal` 이 Required이고 `source_arn` 으로 범위를 좁히며 `statement_id` 는 소스마다 다르게 준다.
- 트리거의 성격이 다르다 — API Gateway v2·EventBridge·SNS는 푸시라 permission이 필요하고, SQS는 `aws_lambda_event_source_mapping` 을 통한 폴링이라 실행 롤 권한만 있으면 된다.
- 코드 배포와 인프라 배포는 주기가 다르다. `lifecycle { ignore_changes = [...] }` 로 경계를 명시하되, 그 순간 state가 "지금 도는 코드"의 진실을 잃는다는 대가를 합의해야 한다.

## 다음으로

- [31장 — 데이터베이스: RDS/Aurora · DynamoDB](31-databases-rds-dynamodb.md) — Lambda가 붙을 상태 저장소, 그리고 동시성이 DB를 무너뜨리는 방식.
- [32장 — 관측: CloudWatch 로그·알람·VPC Flow Log](32-observability.md) — 이 로그 그룹 위에 알람과 대시보드를 얹는다.
- [26장 — 시크릿: ephemeral 리소스와 write-only 인수](26-secrets-and-ephemeral.md) — 환경변수 대신 쓸 수 있는 것들.
- 공식 문서: [aws_lambda_function](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function), [aws_lambda_permission](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission)
