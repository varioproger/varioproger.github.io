---
chapter: 12
level: "Level 1 — 초급"
title: "S3 버킷: 하나의 리소스가 여러 개로 쪼개진 이유"
difficulty: 입문
reading_time: "30분"
prerequisites: [5, 10]
source_docs:
  - "website/docs/r/s3_bucket.html.markdown"
  - "website/docs/r/s3_bucket_versioning.html.markdown"
  - "website/docs/r/s3_bucket_policy.html.markdown"
  - "website/docs/r/s3_bucket_public_access_block.html.markdown"
  - "website/docs/r/s3_bucket_server_side_encryption_configuration.html.markdown"
  - "website/docs/r/s3_bucket_lifecycle_configuration.html.markdown"
  - "website/docs/r/s3_object.html.markdown"
  - "website/docs/guides/version-4-upgrade.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket"
provider_baseline: "6.x"
---

# 12장 — S3 버킷: 하나의 리소스가 여러 개로 쪼개진 이유

**이 장에서 배우는 것**

- v4에서 `aws_s3_bucket` 의 인라인 인수들이 개별 리소스로 분리된 이유를 설명하고, 지금 무엇이 남고 무엇이 나갔는지 구분할 수 있다.
- `bucket` 과 `bucket_prefix`, `force_destroy` 의 의미와 위험을 알고 버킷 이름을 안전하게 짓는다.
- 버전 관리·암호화·공개 차단·버킷 정책을 각각의 리소스로 구성하고, 이들이 서로 어떻게 간섭하는지 안다.
- 수명주기 규칙에서 `filter` 가 필수가 된 배경과 `transition`/`expiration`/`noncurrent_version_*` 를 쓸 수 있다.
- `aws_s3_object` 로 파일을 올릴 때 `etag`/`source_hash` 의 함정과, 리소스 분리가 만든 순서 문제를 `depends_on` 으로 다룰 수 있다.

**왜 중요한가**

S3 버킷 사고는 두 방향으로 온다. 첫째는 데이터가 새는 쪽이다. 버킷을 만들고 `aws_s3_bucket_public_access_block` 을 붙이지 않으면 네 개의 차단 플래그는 모두 **기본값 `false`** 다. 그 상태에서 누군가 "잠깐만 공개해서 테스트하자"며 정책을 하나 붙이면 그대로 공개된다. 나중에 정책을 지워도 객체 ACL은 남아 있을 수 있고, 검색 엔진과 스캐너는 그 사이에 이미 다녀갔다.

둘째는 데이터가 사라지는 쪽이다. 버전 관리를 켜지 않은 버킷에서는 덮어쓰기와 삭제를 되돌릴 수 없다. 배포 스크립트의 `aws s3 sync --delete` 한 줄이 정적 사이트 전체를 지우는 사고가 흔한 이유다. 반대편에는 `force_destroy = true` 가 있다. 이 플래그가 켜진 버킷은 `terraform destroy` 한 번에 **객체 전부와 함께** 사라지며, 원문 표현대로 그 객체들은 복구되지 않는다.

## v4는 왜 리소스를 쪼갰나

`aws_s3_bucket` 은 오랫동안 S3 버킷의 거의 모든 설정을 인라인 인수로 갖고 있었다. `versioning`, `acl`, `policy`, `lifecycle_rule`, `logging`, `cors_rule`, `replication_configuration`, `server_side_encryption_configuration`, `website`, `object_lock_configuration`, `request_payer`, `acceleration_status`, `grant` — 하나의 리소스에 열세 덩어리다. v4.0.0은 이것들을 읽기 전용으로 만들고 각각 별도 리소스로 분리했다.

이유는 세 가지로 정리된다.

**AWS API가 원래 그렇게 생겼다.** 버킷 생성은 `CreateBucket` 하나지만 버전 관리는 `PutBucketVersioning`, 정책은 `PutBucketPolicy`, 암호화는 `PutBucketEncryption`으로 **전부 다른 호출**이다. "리소스는 단일 API 객체를 표현한다"는 provider 설계 원칙에서 `aws_s3_bucket` 은 가장 멀리 떨어진 리소스였다.

**부분 실패가 해석되지 않는다.** 하나의 리소스가 API를 여덟 번 호출하는데 다섯 번째가 실패하면 그 리소스는 "생성됨"도 "실패함"도 아닌 상태가 된다. Terraform은 리소스 단위로 결과를 기록하므로 이 중간 상태를 표현할 수 없다. 쪼개면 실패한 호출이 실패한 리소스 하나로 나타나고 재실행은 그것만 다시 시도한다.

**권한을 나눌 수 있다.** 버킷을 만들 권한과 버킷 정책을 바꿀 권한은 조직 안에서 다른 사람의 것인 경우가 많다. 리소스가 분리되어 있으면 정책만 별도 스택·별도 실행 롤로 옮길 수 있다.

분리 직후인 v4.0.0~v4.8.0에서는 인라인 인수가 아예 **읽기 전용**이 되어 `Value for unconfigurable attribute` 오류가 쏟아졌다. v4.9.0에서 방향을 바꿔, 인라인 인수를 다시 설정 가능하게 되돌리되 **설정에 값이 있을 때만 drift를 감지**하도록 제한했다. 이것이 지금까지 이어지는 동작이다. v4 가이드는 이 인수들이 "v5.0에서 완전히 제거된다"고 예고했지만 v6 문서에도 여전히 **Deprecated** 표시로 남아 "향후 메이저 버전에서 제거된다"고만 적혀 있다. 아직 동작하지만 새 코드에서는 쓰지 않는다.

## 지금의 `aws_s3_bucket` 이 남긴 것

v6 문서 기준으로 `aws_s3_bucket` 에서 **Deprecated가 아닌** 인수는 몇 개 되지 않는다.

- `bucket` — 버킷 이름. Optional, **Forces new resource**. 생략하면 Terraform이 임의의 유일한 이름을 만든다.
- `bucket_prefix` — 접두어로 시작하는 유일한 이름을 만든다. Forces new, `bucket` 과 충돌.
- `bucket_namespace` — `account-regional` 또는 `global`. 기본값 `global`. Forces new.
- `object_lock_enabled` — `true`/`false`. Forces new. 모든 리전·파티션에서 지원되지는 않는다.
- `force_destroy` — 기본값 `false`.
- `tags`, `region`

나머지는 전부 별도 리소스로 옮겼다. v4 업그레이드 가이드의 매핑표를 그대로 옮기면 이렇다.

| 옛 인라인 인수 | 지금 써야 할 리소스 |
|---|---|
| `versioning` | `aws_s3_bucket_versioning` |
| `server_side_encryption_configuration` | `aws_s3_bucket_server_side_encryption_configuration` |
| `policy` | `aws_s3_bucket_policy` |
| `lifecycle_rule` | `aws_s3_bucket_lifecycle_configuration` |
| `acl`, `grant` | `aws_s3_bucket_acl` |
| `logging` | `aws_s3_bucket_logging` |
| `cors_rule` | `aws_s3_bucket_cors_configuration` |
| `website` | `aws_s3_bucket_website_configuration` |

`aws_s3_bucket_public_access_block` 은 이 표에 없다. 원래부터 별도 리소스였고 인라인 대응물이 없었다.

## 버킷 이름과 `force_destroy`

S3 버킷 이름은 기본 네임스페이스(`bucket_namespace = "global"`)에서 **전 세계 모든 AWS 계정을 통틀어 유일**하다. 다른 사람이 `logs` 를 쓰고 있으면 우리는 그 이름을 못 쓴다. 원문의 제약은 소문자, 63자 이하, 그리고 `[bucket_name]--[azid]--x-s3` 형식 금지다(그 형식은 S3 Express 디렉터리 버킷용이며 `aws_s3_directory_bucket` 이 따로 있다).

실무의 명명 규칙은 이름 안에 유일성을 만들어 주는 값을 넣는 것이다. `bucket = "acme-logs-${var.env}-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"` 처럼 [8장](08-data-sources.md)의 데이터 소스를 쓴다. 계정 ID와 리전을 넣으면 조직 안에서 충돌하지 않고, 이름만 보고 소유 계정을 알 수 있다. 모듈처럼 이름을 미리 정할 수 없는 경우에는 `bucket_prefix` 를 쓴다(37자 이하). 다만 이름이 apply할 때 정해지므로 사람이 콘솔에서 찾기 어려워진다는 대가가 있다.

`bucket` 은 **Forces new resource** 다. 이름을 바꾸는 것은 새 버킷을 만들고 옛 버킷을 지우는 일이며 **객체는 따라오지 않는다.** 처음 정할 때 신중하게 정하고 이후 건드리지 않는다.

`force_destroy` 는 원문 설명이 길다. 정리하면 이렇다.

- 기본값은 `false` 이며, 이 상태에서는 객체가 하나라도 있는 버킷의 destroy가 실패한다.
- `true` 면 버킷을 **파괴할 때** 모든 객체를 지운다. Object Lock이 걸린 객체까지 포함하며 원문은 이 객체들이 **복구되지 않는다**고 명시한다.
- 값을 `true` 로 바꾸는 것만으로는 부족하다. 그 변경이 **성공적인 apply로 state에 반영된 뒤에야** 효력이 생긴다. destroy와 같은 실행에서 켜면 동작하지 않으며, import한 버킷도 apply를 한 번 거쳐야 한다.

프로덕션 데이터 버킷에는 `force_destroy` 를 켜지 않는다. 켜야 한다면 `lifecycle { prevent_destroy = true }` 와 함께 둔다. 반대로 CI가 만들고 지우는 임시 버킷에는 `force_destroy = true` 가 필수다 — 없으면 파이프라인이 정리 단계에서 매번 실패한다.

## 버전 관리: 한 번 켜면 끌 수 없다

```terraform
resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}
```

`bucket` 은 Required이고 **Forces new resource** 다. `versioning_configuration` 도 Required이며 그 안의 `status` 는 `Enabled`, `Suspended`, `Disabled` 셋 중 하나다.

여기 이 장에서 가장 중요한 제약이 있다. 원문은 `Disabled` 를 **"버전 관리가 없는 버킷을 만들거나 import할 때만" 쓰는 값**이라고 못 박고, `Enabled` 나 `Suspended` 에서 `Disabled` 로 **바꾸면 오류가 난다**고 명시한다. S3 API가 버킷을 버전 관리 이전 상태로 되돌리지 못하기 때문이다. 한 번 켠 버전 관리는 끌 수 없고 `Suspended` 로 멈출 수 있을 뿐이며, 그때도 이미 만들어진 이전 버전은 그대로 남아 비용을 발생시킨다.

삭제 동작도 알아 둔다. 원문에 따르면 이 리소스를 지우면 버킷의 버전 관리가 `Suspended` 가 되거나, 버킷이 애초에 버전 관리를 쓰지 않았다면 state에서만 제거된다. 코드에서 블록만 지워도 버킷 동작이 바뀐다는 뜻이다.

또 하나. AWS는 **버전 관리를 처음 켠 뒤 15분간 기다린 다음** 객체를 쓰라고 권고하고, 원문은 그래서 "버킷 생성 -> 버전 관리 -> 객체 업로드"를 한 설정에서 한꺼번에 하지 말라고 경고한다. 중요한 객체라면 apply를 분리한다.

## 암호화: SSE-S3와 SSE-KMS

```terraform
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.logs.arn
    }
    bucket_key_enabled = true
  }
}
```

`rule` 은 Required이고 원문은 **현재 하나의 rule만 지원**한다고 밝힌다. `sse_algorithm` 은 Required이며 값은 `AES256`(SSE-S3), `aws:kms`(SSE-KMS), `aws:kms:dsse`(이중 계층 KMS) 중 하나다. `kms_master_key_id` 는 `aws:kms` 일 때만 쓰며, 생략하면 AWS 관리 키인 `aws/s3` 가 쓰인다.

**`bucket_key_enabled` 는 비용 인수다.** SSE-KMS는 객체를 읽고 쓸 때마다 KMS API를 호출하고 그 호출에 요금이 붙는다. S3 Bucket Key를 켜면 S3가 버킷 수준 키를 캐시해 호출을 크게 줄인다. SSE-KMS를 쓴다면 `bucket_key_enabled = true` 를 기본으로 둔다.

두 가지 주의사항이 있다. 첫째, 원문은 이 리소스를 **파괴하면 버킷이 Amazon S3 기본 암호화로 되돌아간다**고 명시한다. 암호화가 꺼지는 것이 아니라 기본값으로 돌아가는 것이다. 둘째, `blocked_encryption_types` 로 업로드 시 특정 암호화 방식을 막을 수 있다(`SSE-C` 또는 `NONE`).

## 공개 차단과 버킷 정책

`aws_s3_bucket_public_access_block` 은 네 개의 불리언을 갖고, **네 개 모두 기본값이 `false`** 다. 리소스를 붙이지 않으면 아무것도 차단되지 않는다.

```terraform
resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

네 플래그는 서로 다른 것을 막는다.

- `block_public_acls` — 공개 ACL을 **새로 설정하는 것**을 막는다. 기존 ACL과 정책에는 영향이 없다.
- `ignore_public_acls` — 이미 붙은 공개 ACL을 **무시**한다. 지우지는 않지만 효력을 없앤다.
- `block_public_policy` — 공개를 허용하는 **버킷 정책의 PUT을 거부**한다. 기존 정책은 그대로 둔다.
- `restrict_public_buckets` — 공개 정책이 붙은 버킷을 **소유자와 AWS 서비스만** 접근하게 제한한다. 교차 계정 위임도 막힌다.

넷 중 셋은 "새로 만드는 것"을 막고 하나(`ignore_public_acls`)만 "이미 있는 것"을 무력화한다. 그래서 **네 개를 전부 켜는 것이 기본값**이어야 한다. 공개 배포가 필요하면 버킷을 공개하는 대신 CloudFront + Origin Access Control을 쓴다.

버킷 정책은 별도 리소스다. JSON 문자열을 손으로 쓰는 대신 `aws_iam_policy_document` 데이터 소스로 만든다.

```terraform
data "aws_iam_policy_document" "logs_read" {
  statement {
    sid    = "AllowAuditAccountRead"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::123456789012:root"]
    }

    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/*"]
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.logs_read.json
}
```

`statement` 의 `effect` 기본값은 `Allow` 이고, 버킷 정책은 리소스 기반 정책이므로 **`principals` 를 반드시 지정**해야 한다. `resources` 에 버킷 ARN과 `<ARN>/*` 를 **둘 다** 넣은 것에 주의한다 — 버킷 ARN은 `s3:ListBucket` 같은 버킷 수준 동작에, `/*` 는 `s3:GetObject` 같은 객체 수준 동작에 대응한다. 하나만 넣으면 조용히 권한이 빠진다.

원문의 경고 두 가지도 기억한다. 버킷 정책은 **20 KB 제한**이 있고, 하나의 버킷에는 **`aws_s3_bucket_policy` 를 하나만** 둬야 한다. 이 리소스가 쓰는 `PutBucketPolicy` 는 기존 정책 **전체를 교체**하므로, 같은 버킷을 가리키는 리소스가 둘이면 나중 것이 앞의 것을 오류 없이 덮어쓴다.

정책과 public access block은 함께 평가된다. `block_public_policy = true` 인 버킷에 공개 정책을 apply하면 실패하고, 반대로 공개 정책이 있는 버킷에 차단을 켜면 apply는 성공하지만 정책이 효력을 잃는다. 두 리소스를 같은 설정에 두면 Terraform은 의존 관계를 모르므로 순서가 보장되지 않는다 — 뒤에서 다룬다.

## 수명주기: `filter` 가 필수가 된 이유

수명주기 규칙은 객체를 자동으로 다른 스토리지 클래스로 옮기거나 만료시킨다. S3 비용을 줄이는 가장 큰 레버이자 데이터를 조용히 지우는 가장 빠른 방법이다.

```terraform
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "archive-and-expire"
    status = "Enabled"

    filter {
      prefix = "raw/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}
```

`rule` 은 Required이고 반복할 수 있다. 각 `rule` 에서 `id`(255자 이하)와 `status`(`Enabled`/`Disabled`)가 Required다. `filter` 는 빈 블록이거나 `prefix`·`tag`·`and`·`object_size_greater_than`·`object_size_less_than` 중 정확히 하나만 가져야 하며, 접두어와 태그를 함께 걸려면 `and` 로 묶는다.

`filter` 는 문서상 Optional이지만 사실상 필수로 취급해야 한다. 규칙에 `prefix` 가 없고 "빈 문자열 접두어로 모든 객체를 대상으로 한다"는 기본 동작을 덮어쓰려면 `filter` 가 필요하다. 게다가 `rule.prefix` 는 **Amazon S3가 deprecated한 것이며 provider의 다음 메이저 버전에서 제거될 예정**이다. 원문은 규칙을 **`filter` 가 있는 상태에서 `prefix` 만 있는 상태로 바꿀 수 없다**고도 명시한다. 방향이 한쪽뿐이므로 처음부터 `filter` 로 쓴다.

동작 블록은 네 가지다.

- `transition` — `days` 또는 `date` 하나와 `storage_class`(Required). 값은 `GLACIER`, `STANDARD_IA`, `ONEZONE_IA`, `INTELLIGENT_TIERING`, `DEEP_ARCHIVE`, `GLACIER_IR` 다.
- `expiration` — `days`, `date`, 또는 `expired_object_delete_marker`(앞의 둘과 충돌).
- `noncurrent_version_transition` / `noncurrent_version_expiration` — 버전 관리 버킷의 **이전 버전**이 대상이다. `noncurrent_days` 가 Required이고 `newer_noncurrent_versions` 로 "최근 N개는 남긴다"를 지정한다.
- `abort_incomplete_multipart_upload` — `days_after_initiation` 일 뒤 미완료 멀티파트 업로드를 정리한다.

마지막 것은 비용 측면에서 특히 중요하다. 실패한 대용량 업로드의 조각은 버킷 목록에 보이지 않으면서 스토리지 요금은 그대로 발생한다. "S3 비용이 콘솔에 보이는 객체 크기와 안 맞는다"는 현상은 대개 이것이며, `filter {}` + `abort_incomplete_multipart_upload` 규칙 하나는 모든 버킷의 기본 설정으로 둘 만하다. 버전 관리를 켠 버킷이라면 `noncurrent_version_expiration` 도 반드시 함께 건다.

## 객체 업로드, 순서 문제, import

파일을 올리는 리소스는 `aws_s3_object` 다. `bucket` 과 `key` 가 Required이고, 내용은 `source`(파일 경로) · `content`(문자열) · `content_base64` 중 **하나만** 쓴다. 아무것도 주지 않으면 빈 객체가 만들어진다.

```terraform
resource "aws_s3_object" "config" {
  bucket      = aws_s3_bucket.assets.id
  key         = "config/app.json"
  source      = "${path.module}/files/app.json"
  source_hash = filemd5("${path.module}/files/app.json")

  content_type = "application/json"
}
```

여기서 `etag` 와 `source_hash` 의 차이를 알아야 한다. 둘 다 "값이 바뀌면 다시 올린다"는 트리거지만, `etag` 는 실제 S3 ETag와 비교되므로 원문이 명시한 두 상황에서 깨진다 — **KMS로 암호화된 객체**에서는 ETag가 MD5가 아니고, **16 MB를 넘는 객체**는 멀티파트 업로드로 올라가 역시 MD5가 아니다. 매 plan마다 차이가 잡히는 영구 diff가 생긴다. `source_hash` 는 값을 **state에만 저장하고 AWS에 보내지 않으므로** 이 제약이 없다.

무엇을 올릴지도 판단이 필요하다. 설정 파일, 정적 사이트의 소수 파일, Lambda 배포 패키지 정도가 적합하다. 반대로 **큰 파일과 시크릿은 넣지 않는다.** `content` 로 준 값은 state에 그대로 남고, 수천 개를 `for_each` 로 올리면 state가 커져 plan이 느려진다([40장](../level3-advanced/40-performance-and-throttling.md)). 그런 작업은 CI의 `aws s3 sync` 쪽이 맞다.

### 리소스가 쪼개지면서 생긴 순서 문제

리소스를 분리한 대가가 여기서 나타난다. Terraform은 **참조가 있는 곳에만** 의존 관계를 만든다([6장](06-references-and-dependencies.md)). 객체가 `aws_s3_bucket.example.id` 를 참조하면 버킷 다음에 만들어지는 것은 보장되지만 **버전 관리가 켜진 다음**이라는 보장은 없다. 그 결과 첫 객체가 버전 관리 이전에 올라가 `version_id` 를 갖지 못한다. mTLS 트러스트스토어처럼 버전이 중요한 객체라면 실제 장애가 된다.

원문이 제시하는 해법은 둘이다. 참조를 통해 **암시적 의존**을 만들거나, `depends_on` 으로 **명시적 의존**을 거는 것이다.

```terraform
resource "aws_s3_object" "truststore" {
  # 버킷이 아니라 versioning 리소스를 참조해 순서를 강제한다
  bucket = aws_s3_bucket_versioning.example.id
  key    = "truststore.pem"
  source = "truststore.pem"
}
```

`aws_s3_bucket_versioning` 의 `id` 는 버킷 이름(또는 `bucket,expected_bucket_owner`)이므로 그대로 `bucket` 인수에 넣을 수 있다. 이 트릭이 어색하면 `depends_on = [aws_s3_bucket_versioning.example]` 을 쓴다. 같은 문제가 정책과 public access block 사이에도 있다 — 공개 정책을 붙여야 하는데 차단이 먼저 걸리면 apply가 실패하므로, 순서를 정하고 싶으면 `depends_on` 으로 못 박는다.

### import 형식

분리된 리소스는 각각 따로 import한다. 형식은 대체로 버킷 이름이다.

```console
% terraform import aws_s3_bucket.example bucket-name
% terraform import aws_s3_bucket_versioning.example bucket-name
% terraform import aws_s3_object.example some-bucket-name/some/key.txt
```

예외가 둘 있다. 버킷 소유 계정이 provider 계정과 다르면 `bucket-name,123456789012` 처럼 `expected_bucket_owner` 를 쉼표로 이어 붙이고(이 인수 자체는 Deprecated다), `aws_s3_object` 는 `bucket/key` 또는 `s3://bucket/key` 형식을 받는다. Terraform 1.12 이상에서는 `identity` 로 `bucket`(객체는 `key` 도)을 지정할 수 있다.

## 흔한 실수

### ❌ 인라인 인수와 별도 리소스를 같은 버킷에 섞는다

인라인 인수는 v6에도 남아 있어 오류 없이 apply된다. 그러나 두 곳에서 같은 설정을 관리하면 실행 순서에 따라 결과가 달라지고, 인라인 쪽은 설정에 값이 있을 때만 drift를 감지하므로 어긋남이 조용히 유지된다.

```terraform
resource "aws_s3_bucket" "data" {
  bucket = "acme-data"

  versioning {
    enabled = true # Deprecated 인라인 인수
  }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Suspended" # 같은 설정을 두 곳에서 관리한다
  }
}
```

```terraform
# ✅ 버킷 리소스에는 이름·태그만 두고 설정은 전부 별도 리소스로
resource "aws_s3_bucket" "data" {
  bucket = "acme-data"
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled" # 이 리소스만이 버전 관리의 단일 출처다
  }
}
```

### ❌ public access block을 붙이지 않는다

네 플래그의 기본값은 모두 `false` 다. 리소스를 만들지 않으면 아무것도 차단되지 않으며, 나중에 누군가 붙인 공개 정책이나 ACL을 막을 방어선이 없다.

```terraform
resource "aws_s3_bucket" "assets" {
  bucket = "acme-assets" # public access block이 없다 -> 네 플래그 모두 false
}
```

```terraform
# ✅ 네 플래그를 명시적으로 켠다
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

### ❌ 암호화된 버킷에 `etag` 를 쓴다

KMS로 암호화된 객체와 16 MB를 넘는 객체의 ETag는 MD5가 아니다. `filemd5()` 값과 영원히 일치하지 않으므로 매 plan마다 같은 객체가 다시 올라간다.

```terraform
resource "aws_s3_object" "bundle" {
  bucket = aws_s3_bucket.artifacts.id
  key    = "app.zip"
  source = "app.zip"
  etag   = filemd5("app.zip") # SSE-KMS 버킷 -> 영구 diff
}
```

```terraform
# ✅ state에만 저장되는 source_hash 를 쓴다
resource "aws_s3_object" "bundle" {
  bucket      = aws_s3_bucket.artifacts.id
  key         = "app.zip"
  source      = "app.zip"
  source_hash = filemd5("app.zip")
}
```

### ❌ 버킷 정책 리소스를 같은 버킷에 두 개 만든다

`aws_s3_bucket_policy` 는 `PutBucketPolicy` 로 정책 **전체**를 교체한다. 리소스가 둘이면 나중에 적용된 쪽이 앞의 것을 오류 없이 덮어쓴다.

```terraform
resource "aws_s3_bucket_policy" "read" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.read.json
}

resource "aws_s3_bucket_policy" "write" { # read 를 조용히 덮어쓴다
  bucket = aws_s3_bucket.logs.id
}
```

```terraform
# ✅ 문서를 합쳐 하나의 정책 리소스로 넣는다
data "aws_iam_policy_document" "combined" {
  source_policy_documents = [
    data.aws_iam_policy_document.read.json,
    data.aws_iam_policy_document.write.json,
  ]
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.combined.json
}
```

## 프로덕션 노트

- **버킷 하나는 리소스 대여섯 개다.** 버킷·버전 관리·암호화·public access block·수명주기·정책을 묶어 사내 모듈로 만들면 "안전한 기본값"을 한 곳에서 강제할 수 있다([19장](../level2-intermediate/19-modules.md)). 기존 버킷을 가져올 때도 버킷 하나당 import 대상이 대여섯 개라는 점을 계산에 넣는다.
- **KMS 호출 요금을 확인한다.** SSE-KMS 버킷에서 `bucket_key_enabled` 를 켜지 않으면 객체 접근마다 KMS 호출이 발생한다. 로그나 이미지처럼 객체 수가 많은 버킷에서는 KMS 요금이 스토리지 요금을 넘어서기도 한다.
- **미완료 멀티파트 업로드는 보이지 않는 비용이다.** 콘솔의 객체 목록에는 나오지 않지만 저장 요금은 계속 나간다. `filter {}` + `abort_incomplete_multipart_upload` 규칙을 모든 버킷의 기본 수명주기로 둔다.
- **버전 관리를 켰다면 이전 버전 정리를 같이 건다.** `noncurrent_version_expiration` 없이 버전 관리만 켜면 저장량이 단조 증가한다. 삭제 마커도 쌓이므로 `expiration { expired_object_delete_marker = true }` 를 함께 검토한다.
- **`force_destroy` 는 코드 리뷰 항목이다.** 이 플래그가 붙은 PR은 "이 버킷의 객체가 지워져도 되는가"를 반드시 확인한다. 프로덕션 데이터 버킷에는 `lifecycle { prevent_destroy = true }` 를 함께 걸어 둔다.

## 연습문제

**1. 안전한 기본값 버킷 만들기.** 버킷 하나에 버전 관리(`Enabled`), SSE-KMS + `bucket_key_enabled`, public access block 네 플래그, 그리고 `abort_incomplete_multipart_upload` 수명주기 규칙을 붙인다.
*성공 기준:* `terraform state list` 에 리소스가 다섯 개 이상 보이고, AWS CLI의 `get-bucket-versioning`·`get-bucket-encryption`·`get-public-access-block` 결과가 설정과 일치한다.

**2. 되돌릴 수 없는 것 확인하기.** 위 버킷의 `versioning_configuration.status` 를 `Suspended` 로 바꿔 apply한 뒤, 다시 `Disabled` 로 바꿔 apply를 시도한다.
*성공 기준:* 첫 변경은 성공하고 두 번째는 실패하는 것을 확인한 뒤, 오류 메시지와 원문의 설명을 연결해 왜 실패했는지 두 줄로 적는다.

**3. 순서 문제 재현하기.** 버킷·버전 관리·객체를 한 설정에 두되 객체의 `bucket` 이 `aws_s3_bucket` 을 참조하게 해 apply한 뒤, 객체 참조를 `aws_s3_bucket_versioning` 쪽으로 바꿔 다시 만든다.
*성공 기준:* 두 경우의 `terraform graph` 또는 plan 순서를 비교해 무엇이 달라졌는지 설명하고, `depends_on` 으로 같은 효과를 내는 코드를 제시한다.

## 요약

- v4는 `aws_s3_bucket` 의 인라인 인수 열세 개를 개별 리소스로 분리했다. AWS API가 원래 나뉘어 있고, 부분 실패를 표현할 수 없으며, 권한을 나눌 수 없었기 때문이다.
- v4.9 이후 인라인 인수는 다시 설정 가능하지만 **설정에 값이 있을 때만 drift를 감지**한다. v6에서도 **Deprecated**이며 향후 제거될 예정이다.
- `aws_s3_bucket` 에 남은 주요 인수는 `bucket`, `bucket_prefix`, `bucket_namespace`, `object_lock_enabled`, `force_destroy`, `tags` 이며 앞의 넷은 모두 **Forces new resource** 다. 버킷 이름은 기본 네임스페이스에서 **전역 유일**하고 소문자 63자 이하다.
- `force_destroy = true` 는 destroy 시 Object Lock이 걸린 객체까지 지우며 **복구되지 않는다.** 이 값은 **성공적인 apply로 state에 반영된 뒤에야** 효력이 생긴다.
- 버전 관리는 `Enabled` -> `Suspended` 는 되지만 **`Disabled` 로는 되돌릴 수 없다.** `Disabled` 는 버전 관리가 없는 버킷을 만들거나 import할 때만 쓴다. 처음 켠 뒤 15분 기다렸다 쓰라는 권고가 있다.
- SSE-KMS에서 `bucket_key_enabled = true` 는 KMS 호출을 줄이는 비용 인수다. 암호화 리소스를 파괴하면 버킷은 S3 기본 암호화로 되돌아간다.
- public access block의 네 플래그는 **모두 기본값 `false`** 다. 붙이지 않으면 아무것도 차단되지 않는다. 버킷 정책은 20 KB 제한이 있고 버킷당 `aws_s3_bucket_policy` 는 **하나만** 둔다.
- 수명주기에서 `rule.prefix` 는 Deprecated이므로 `filter` 를 쓰며, `filter` 가 있는 규칙을 `prefix` 만 있는 규칙으로 되돌릴 수 없다.
- `aws_s3_object` 의 `etag` 는 KMS 암호화 객체와 16 MB 초과 객체에서 깨지므로 `source_hash` 를 쓴다. 리소스가 나뉘면서 생긴 순서 문제는 참조 또는 `depends_on` 으로 해결한다.

## 다음으로

- [13장 — IAM 기초](13-iam-basics.md) — `aws_iam_policy_document` 의 statement·condition·principal을 정면으로 다룬다.
- [20장 — Import와 Resource Identity](../level2-intermediate/20-import-and-resource-identity.md) — 기존 버킷 수십 개를 코드로 가져오는 절차.
- [39장 — 메이저 버전 업그레이드](../level3-advanced/39-version-upgrades.md) — v4의 S3 분리를 포함한 파괴적 변경 대응 실전.
- 공식 문서: [aws_s3_bucket](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket), [v4 업그레이드 가이드](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/version-4-upgrade)
