---
appendix: A
title: "Provider 인수 전체 레퍼런스"
kind: reference
source_docs:
  - "website/docs/index.html.markdown"
  - "website/docs/guides/custom-service-endpoints.html.markdown"
  - "website/docs/guides/tag-policy-compliance.html.markdown"
provider_baseline: "6.x"
---

# 부록 A — Provider 인수 전체 레퍼런스

`provider "aws"` 블록은 AWS Provider가 만드는 **모든 AWS SDK 클라이언트의 조립 설명서**다. 어떤 자격증명으로, 어느 리전에서, 어떤 호스트로, 어떤 프록시를 거쳐, 어떤 CA를 믿고, 실패하면 몇 번 다시 시도할지가 전부 이 한 블록에서 정해진다. provider 인스턴스 단위의 설정이므로 여기를 잘못 만지면 증상이 workspace 전체에서 동시에 나타난다.

이 부록은 v6.x 기준으로 `provider "aws"` 블록의 **모든 최상위 인수**와 중첩 블록 다섯 개(`assume_role`, `assume_role_with_web_identity`, `default_tags`, `ignore_tags`, `endpoints`)의 인수를 모은다. 개념 설명은 [4장](../level1-beginner/04-provider-block-and-auth.md)과 [34장](../level3-advanced/34-provider-configuration-deep.md)에 있다.

최소 설정은 다음과 같다. 자격증명과 리전을 환경에서 전부 공급한다면 `provider "aws" {}` 처럼 블록을 비워도 동작한다.

```terraform
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}
```

## 이 표를 읽는 법

- **기본값** 열의 `—` 는 원문이 기본값을 명시하지 않은 인수다. "false가 기본"이라고 단정하지 않기 위해 비워 뒀다. 명시된 기본값은 `insecure`(`false`), `max_retries`(`25`), `shared_config_files`(`[~/.aws/config]`), `shared_credentials_files`(`[~/.aws/credentials]`) 넷뿐이다.
- **환경변수** 열은 원문이 "Can also be set with ..." 로 적어 둔 것만 싣는다. 전체 목록은 [부록 B](b-environment-variables.md)에 있다.
- **shared config** 열은 `~/.aws/config` 프로파일 섹션의 키다. `N/A` 는 원문이 미지원을 명시한 경우다.
- 모든 최상위 인수는 **Optional**이다. Required는 두 assume 블록의 `role_arn` 뿐이다. `alias`·`version` 은 Terraform Core가 해석하므로 이 표에 없다.

## `provider "aws"` 최상위 인수 전체 (알파벳순)

| 인수 | 타입 | 기본값 | 환경변수 | shared config 키 | 설명 | 관련 챕터 |
|---|---|---|---|---|---|---|
| `access_key` | string | — | `AWS_ACCESS_KEY_ID` | `aws_access_key_id` | AWS access key. `profile` 을 쓰면 shared credentials 파일에서도 온다 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `allowed_account_ids` | list(string) | — | N/A | N/A | 적힌 계정 ID가 아니면 실행을 막는다. `forbidden_account_ids` 와 충돌 | [4장](../level1-beginner/04-provider-block-and-auth.md), [50장](../level3-advanced/50-production-operations.md) |
| `assume_role` | block (반복 가능) | — | N/A | 프로파일로 대체 | IAM 롤을 assume한다. 여러 개면 **롤 체이닝** | [25장](../level2-intermediate/25-multi-account.md) |
| `assume_role_with_web_identity` | block (1개만) | — | 아래 블록 표 참조 | 프로파일로 대체 | 웹 아이덴티티(OIDC)로 롤을 assume한다. **하나만** 둘 수 있다 | [25장](../level2-intermediate/25-multi-account.md) |
| `custom_ca_bundle` | string(경로) | — | `AWS_CA_BUNDLE` | **미지원** | 커스텀 루트·중간 인증서가 든 파일 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `default_tags` | block | — | `TF_AWS_DEFAULT_TAGS_<키>` | N/A | 모든 리소스에 붙일 태그. **`aws_autoscaling_group` 은 예외** | [10장](../level1-beginner/10-tags-basics.md), [23장](../level2-intermediate/23-tagging-strategy.md) |
| `ec2_metadata_service_endpoint` | string(URL) | — | `AWS_EC2_METADATA_SERVICE_ENDPOINT` | N/A | IMDS 엔드포인트 주소 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `ec2_metadata_service_endpoint_mode` | string | — | `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` | N/A | IMDS 통신 모드. `IPv4` 또는 `IPv6` | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `endpoints` | block | — | `AWS_ENDPOINT_URL`, `AWS_ENDPOINT_URL_<SERVICE>` | `endpoint_url`, `services` 섹션 | 서비스별 엔드포인트 재정의. FIPS 지정에도 쓴다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `forbidden_account_ids` | list(string) | — | N/A | N/A | 적힌 계정 ID면 실행을 막는다. `allowed_account_ids` 와 충돌 | [4장](../level1-beginner/04-provider-block-and-auth.md), [50장](../level3-advanced/50-production-operations.md) |
| `http_proxy` | string(URL) | — | `HTTP_PROXY` 또는 `http_proxy` | N/A | HTTP 요청용 프록시 URL | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `https_proxy` | string(URL) | — | `HTTPS_PROXY` 또는 `https_proxy` | N/A | HTTPS 요청용 프록시 URL. HTTPS 프록시 **없이** HTTP만 쓰려면 `""` 로 둔다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `ignore_tags` | block | — | `TF_AWS_IGNORE_TAGS_KEYS`, `TF_AWS_IGNORE_TAGS_KEY_PREFIXES` | N/A | 외부 시스템이 붙이는 태그를 무시한다. `aws_ec2_tag` 같은 개별 태그 리소스는 예외 | [23장](../level2-intermediate/23-tagging-strategy.md) |
| `insecure` | bool | `false` | N/A | N/A | "insecure" SSL 요청 허용 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `max_retries` | number | **`25`** | `AWS_MAX_ATTEMPTS` | `max_attempts` | 스로틀링·일시 장애 시 재시도 횟수 상한. 호출 사이 지연은 지수적으로 증가 | [40장](../level3-advanced/40-performance-and-throttling.md), [45장](../level3-advanced/45-errors-retries-waiters.md) |
| `no_proxy` | string(콤마 구분) | — | `NO_PROXY` 또는 `no_proxy` | N/A | 프록시를 거치지 않을 호스트. 도메인명 / IP / CIDR / `*`. 도메인·IP에는 포트도 붙일 수 있다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `profile` | string | — | `AWS_PROFILE` 또는 `AWS_DEFAULT_PROFILE` | N/A | shared config/credentials 파일의 named profile 이름 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `region` | string | — | `AWS_REGION` 또는 `AWS_DEFAULT_REGION` | `region` | provider가 동작할 리전. **반드시 설정돼야 한다.** IMDS로 자격증명을 받으면 리전도 메타데이터에서 올 수 있다. v6부터 대부분의 리소스에 최상위 `region` 인수가 있어 개별 재정의가 가능하다 | [24장](../level2-intermediate/24-enhanced-region-support.md) |
| `retry_mode` | string | — | `AWS_RETRY_MODE` | `retry_mode` | 재시도 방식. 유효값 `standard`, `adaptive` | [40장](../level3-advanced/40-performance-and-throttling.md) |
| `s3_use_path_style` | bool | — | N/A | N/A | S3 요청에 path-style 주소(`https://s3.amazonaws.com/BUCKET/KEY`)를 쓴다. 기본은 virtual hosted 주소. S3 전용 | [12장](../level1-beginner/12-s3-bucket.md), [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `s3_us_east_1_regional_endpoint` | string | — | `AWS_S3_US_EAST_1_REGIONAL_ENDPOINT` | `s3_us_east_1_regional_endpoint` | **Deprecated.** `us-east-1` S3 호출이 레거시 글로벌 엔드포인트를 쓸지 리전 엔드포인트를 쓸지. 유효값 `legacy`, `regional`. 미설정 시 general purpose 버킷은 글로벌, directory 버킷은 리전 엔드포인트. **이 인수와 글로벌 S3 엔드포인트는 `v7.0.0` 에서 제거 예정** | [39장](../level3-advanced/39-version-upgrades.md) |
| `secret_key` | string | — | `AWS_SECRET_ACCESS_KEY` | `aws_secret_access_key` | AWS secret key. `access_key` 와 짝이다 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `shared_config_files` | list(string) | `[~/.aws/config]` | `AWS_CONFIG_FILE`(1개) | N/A | shared config 파일 경로 목록 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `shared_credentials_files` | list(string) | `[~/.aws/credentials]` (profile 사용 시) | `AWS_SHARED_CREDENTIALS_FILE`(1개) | N/A | shared credentials 파일 경로 목록 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `skip_credentials_validation` | bool | — | N/A | N/A | STS API를 통한 자격증명 검증을 건너뛴다. STS가 없는 AWS 호환 구현용 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `skip_metadata_api_check` | bool | — | `AWS_EC2_METADATA_DISABLED` | N/A | 메타데이터 API 검사를 건너뛴다. `true` 면 IMDS 경유 인증이 막히므로 다른 자격증명 소스가 필요하다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `skip_region_validation` | bool | — | N/A | N/A | 리전 이름 검증을 건너뛴다. 자체 리전 이름을 쓰는 구현이나 미공개 리전에 필요 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `skip_requesting_account_id` | bool | — | N/A | N/A | 계정 ID 조회를 건너뛴다. IAM·STS·메타데이터 API가 없는 구현용. `true` 이고 계정 ID가 이미 밝혀지지 않았다면 ARN을 직접 조립하는 일부 리소스에서 **계정 ID가 빈 문자열**로 들어간다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `sts_region` | string | — | N/A | N/A | STS 전용 리전. 미설정이면 비-STS 작업과 같은 리전을 쓴다 | [25장](../level2-intermediate/25-multi-account.md) |
| `tag_policy_compliance` | string | — (미설정=`disabled`) | `TF_AWS_TAG_POLICY_COMPLIANCE` | N/A | 조직 태그 정책 준수를 강제한다. 유효값 `error`, `warning`, `disabled`. 현재는 리소스 타입별 **필수 태그 키** 준수만 검사한다 | [23장](../level2-intermediate/23-tagging-strategy.md) |
| `token` | string | — | `AWS_SESSION_TOKEN` | `aws_session_token` | 임시 자격증명용 세션 토큰. MFA 로그인 뒤 받는 토큰이며 6자리 MFA 코드가 아니다 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `token_bucket_rate_limiter_capacity` | number | — (미지정 시 비활성) | N/A | N/A | AWS SDK 토큰 버킷 재시도 rate limiter의 용량. 값을 지정하면 `retry quota exceeded` 에러 가능성이 커진다 | [40장](../level3-advanced/40-performance-and-throttling.md) |
| `use_dualstack_endpoint` | bool | — | `AWS_USE_DUALSTACK_ENDPOINT` | `use_dualstack_endpoint` | DualStack 엔드포인트로 해석하도록 강제 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `use_fips_endpoint` | bool | — | `AWS_USE_FIPS_ENDPOINT` | `use_fips_endpoint` | 모든 서비스를 FIPS 엔드포인트로 해석하도록 강제. **커스텀 엔드포인트가 지정된 서비스에서는 무시된다.** FIPS 엔드포인트가 없는 서비스·리전이 있으며, 없으면 `endpoints` 로 개별 재정의한다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `user_agent` | list(string) | — | `TF_APPEND_USER_AGENT`(별도 경로) | N/A | User-Agent 헤더에 덧붙일 제품 정보. 적힌 순서대로 붙는다 | [33장](../level2-intermediate/33-provider-functions-and-policies.md) |

### 표에 담기지 않는 보충

**`allowed_account_ids` / `forbidden_account_ids` 가 계정 ID를 알아내는 방법.** 둘 중 하나라도 쓰면 provider는 실제 계정 ID를 알아내 비교해야 한다. IAM Instance Profile이 붙은 EC2 인스턴스에서는 **항상 메타데이터 API**를 쓴다. 그 외(환경변수, shared credentials 파일 등)는 `iam:GetUser` -> `sts:GetCallerIdentity` -> `iam:ListRoles` 를 **순서대로** 시도한다. `iam:GetUser` 는 각 사용자가 자기 자신에 대해 호출할 권한을 가져야 하고, `iam:ListRoles` 는 `iam:GetUser` 를 쓸 수 없는 IdP-federated 프로파일용이다. 즉 이 인수를 켜는 순간 **최소 하나의 신원 조회 권한**이 필요해진다.

**`skip_requesting_account_id` 의 부작용 범위.** 원문은 계정 ID가 빈 문자열이 될 수 있는 리소스·데이터 소스를 명시적으로 열거한다. API Gateway 계열, AppConfig 계열 전부, `aws_athena_workgroup`, `aws_budgets_budget`, CodeDeploy 계열, `aws_cognito_identity_pool`, `aws_default_vpc_dhcp_options`, DMS 계열, Direct Connect(`dx_*`) 계열, WAF/WAF Regional 계열 등이다. 이 리소스들의 `arn` 속성을 다른 리소스가 참조하고 있다면 빈 계정 ID가 그대로 전파된다.

**`user_agent` 를 붙이는 세 가지 경로.** provider 인수 `user_agent` 는 이 provider 인스턴스가 관리하는 모든 리소스에 적용된다. 환경변수 `TF_APPEND_USER_AGENT` 는 값이 헤더에 **그대로** 덧붙는다. 세 번째는 `terraform` 블록 안 `provider_meta "aws"` 의 `user_agent` 인수로, **그 모듈 안에 정의된 리소스에만** 적용된다. 다만 `terraform` 블록에서는 함수를 쓸 수 없어 `provider::aws::user_agent(...)` 를 `provider_meta` 안에서 호출할 수 없다.

```terraform
provider "aws" {
  user_agent = [
    provider::aws::user_agent("example-demo", "0.0.1", "a comment"),
    "other-demo/0.0.2 (other comment)",
  ]
}
```

## `assume_role` 블록

`assume_role` 은 **반복 가능한 블록**이다. 여러 개를 적으면 순서대로 롤을 이어 assume하는 IAM Role Chaining이 된다. 환경변수로는 설정할 수 없고 provider 블록이나 named profile로만 설정한다.

| 인수 | Required | 타입 | shared config 키 | 설명 |
|---|---|---|---|---|
| `role_arn` | **Required** | string | `role_arn` | assume할 IAM 롤의 ARN |
| `duration` | Optional | string | `duration_seconds` | assume role 세션 길이. 15분부터 그 롤의 최대 세션 길이까지. `1h`, `2h45m`, `30m15s` 같은 문자열로 표현 |
| `external_id` | Optional | string | `external_id` | 롤을 assume할 때 쓰는 외부 식별자 |
| `policy` | Optional | string(JSON) | N/A | assume되는 롤의 권한을 더 좁히는 IAM Policy JSON |
| `policy_arns` | Optional | set(string) | N/A | 권한을 더 좁히는 IAM Policy들의 ARN 집합 |
| `session_name` | Optional | string | `role_session_name` | 롤을 assume할 때 쓸 세션 이름 |
| `source_identity` | Optional | string | N/A | 롤을 assume하는 principal이 지정하는 source identity |
| `tags` | Optional | map(string) | N/A | assume role 세션 태그 |
| `transitive_tag_keys` | Optional | set(string) | N/A | 후속 세션으로 전달할 세션 태그 키 집합 |

```terraform
provider "aws" {
  assume_role {
    role_arn     = "arn:aws:iam::123456789012:role/ROLE_NAME"
    session_name = "SESSION_NAME"
    external_id  = "EXTERNAL_ID"
  }
}
```

롤 체이닝은 `assume_role` 블록을 원하는 순서대로 여러 개 나열하면 된다.

## `assume_role_with_web_identity` 블록

이 블록은 **하나만** 둘 수 있다. `assume_role` 과 달리 환경변수 경로가 있어 CI에서 provider 블록을 비워 두고 쓸 수 있다.

| 인수 | Required | 타입 | 환경변수 | shared config 키 | 설명 |
|---|---|---|---|---|---|
| `role_arn` | **Required** | string | `AWS_ROLE_ARN` | `role_arn` | assume할 IAM 롤의 ARN |
| `web_identity_token` | Optional | string | `TF_AWS_WEB_IDENTITY_TOKEN` | N/A | OIDC/OAuth provider가 발급한 웹 아이덴티티 토큰 **값**. `web_identity_token` 또는 `web_identity_token_file` 중 하나는 있어야 한다 |
| `web_identity_token_file` | Optional | string(경로) | `AWS_WEB_IDENTITY_TOKEN_FILE` | `web_identity_token_file` | 웹 아이덴티티 토큰이 담긴 **파일**. 둘 중 하나는 있어야 한다 |
| `duration` | Optional | string | N/A | `duration_seconds` | 세션 길이. 15분부터 롤의 최대 세션 길이까지. `1h`, `2h45m`, `30m15s` |
| `policy` | Optional | string(JSON) | N/A | `policy` | 권한을 더 좁히는 IAM Policy JSON |
| `policy_arns` | Optional | set(string) | N/A | `policy_arns` | 권한을 더 좁히는 IAM Policy ARN 집합 |
| `session_name` | Optional | string | `AWS_ROLE_SESSION_NAME` | `role_session_name` | 세션 이름 |

```terraform
provider "aws" {
  assume_role_with_web_identity {
    role_arn                = "arn:aws:iam::123456789012:role/ROLE_NAME"
    session_name            = "SESSION_NAME"
    web_identity_token_file = "/Users/tf_user/secrets/web-identity-token"
  }
}
```

두 블록은 이름만 비슷할 뿐 설정 소스 지원 범위가 다르다. `assume_role` 의 `policy`/`policy_arns` 는 shared config 키조차 없지만, 여기서는 있다. EKS의 IRSA나 ECS/CodeBuild의 Task Role을 쓸 때는 이 블록을 **명시하지 않아도** 된다. 런타임이 `AWS_ROLE_ARN` 과 `AWS_WEB_IDENTITY_TOKEN_FILE` 을 자동으로 넣어 주고 provider가 그것을 읽기 때문이다.

## `default_tags` 블록

| 인수 | Required | 타입 | 환경변수 | 설명 |
|---|---|---|---|---|
| `tags` | Optional | map(string) | `TF_AWS_DEFAULT_TAGS_<tag_key>=<tag_value>` | 이 provider가 다루는 모든 리소스에 적용할 태그 |

세 가지 사실이 붙는다.

1. **환경변수와 인수가 충돌하면 provider 설정이 이긴다.** `ignore_tags` 와 정반대 규칙이니 헷갈리지 않게 한다.
2. **리소스의 `tags` 로 값을 덮어쓸 수는 있어도 특정 리소스에서 제외할 수는 없다.** 같은 키를 리소스의 `tags` 에 다른 값으로 적으면 그 값이 이기지만, "이 리소스에만 기본 태그를 빼기"는 불가능하다.
3. **`aws_autoscaling_group` 은 예외다.** `tags` 를 구현한 모든 리소스에서 동작하지만 이 리소스 하나만 빠진다.

결과는 리소스의 `tags`(설정한 것만)와 `tags_all`(기본 태그가 병합된 최종본)로 나뉘어 보인다.

```terraform
provider "aws" {
  default_tags {
    tags = {
      Environment = "Test"
      Name        = "Provider Tag"
    }
  }
}

resource "aws_vpc" "example" {
  cidr_block = "10.0.0.0/16"
  tags       = { Environment = "Production" }
}
```

여기서 `aws_vpc.example.tags` 는 `{Environment = "Production"}`, `tags_all` 은 `{Environment = "Production", Name = "Provider Tag"}` 이다.

## `ignore_tags` 블록

| 인수 | Required | 타입 | 환경변수 | 설명 |
|---|---|---|---|---|
| `keys` | Optional | list(string) | `TF_AWS_IGNORE_TAGS_KEYS`(콤마 구분) | 무시할 태그 키의 정확한 목록 |
| `key_prefixes` | Optional | list(string) | `TF_AWS_IGNORE_TAGS_KEY_PREFIXES`(콤마 구분) | 무시할 태그 키 **접두어** 목록 |

`default_tags` 와 결정적으로 다른 점이 하나 있다. **인수와 환경변수가 둘 다 설정돼 있으면 두 소스의 값이 하나의 목록으로 병합된다.** `default_tags` 는 우선순위(provider 승), `ignore_tags` 는 병합이다.

무시된 태그는 `tags` 계열 속성에 나타나지 않고 diff도 생기지 않는다. 다만 리소스의 `tags` 인수에 **그 키를 여전히 적어 두면** 영구 diff가 생긴다 — 인수에서 지우거나 `lifecycle` 의 `ignore_changes` 를 함께 써야 한다. `aws_ec2_tag` 같은 개별 태그 리소스는 적용 대상이 아니다.

```terraform
provider "aws" {
  ignore_tags {
    keys         = ["TagKey1"]
    key_prefixes = ["kubernetes.io/"]
  }
}
```

## `endpoints` 블록

`endpoints` 블록의 인수 하나하나가 서비스 키다. v6 문서 기준 커스터마이즈 가능한 서비스는 **271개**이며, 각각 provider 파라미터 / 환경변수 / shared config 키가 짝을 이룬다. 전체 표는 원문 [Custom Service Endpoints 가이드](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/custom-service-endpoints)에 있고, 여기서는 규칙과 자주 쓰는 것만 싣는다.

**세 이름의 생성 규칙.** 셋 다 AWS SDK for Go v2의 `serviceID` 에서 나온다. provider 파라미터는 그것을 소문자로 붙여 쓴 것(하위 호환 별칭이 여럿일 수 있다), 환경변수는 `AWS_ENDPOINT_URL_<SERVICE>` 로 공백을 밑줄로 바꾸고 전부 대문자, shared config 키는 공백을 밑줄로 바꾸고 전부 소문자다(프로파일 아래 `services` 섹션에 적는다). DynamoDB라면 각각 `dynamodb` / `AWS_ENDPOINT_URL_DYNAMODB` / `dynamodb` 다.

| 서비스 | provider 파라미터 | 환경변수 | shared config 키 |
|---|---|---|---|
| EC2 | `ec2` | `AWS_ENDPOINT_URL_EC2` | `ec2` |
| S3 | `s3`(또는 `s3api`) | `AWS_ENDPOINT_URL_S3` | `s3` |
| IAM | `iam` | `AWS_ENDPOINT_URL_IAM` | `iam` |
| STS | `sts` | `AWS_ENDPOINT_URL_STS` | `sts` |
| Lambda | `lambda` | `AWS_ENDPOINT_URL_LAMBDA` | `lambda` |
| DynamoDB | `dynamodb` | `AWS_ENDPOINT_URL_DYNAMODB` | `dynamodb` |
| ELB (v2) | `elbv2`(또는 `elasticloadbalancingv2`) | `AWS_ENDPOINT_URL_ELASTIC_LOAD_BALANCING_V2` | `elastic_load_balancing_v2` |
| CloudWatch Logs | `logs`(또는 `cloudwatchlog`, `cloudwatchlogs`) | `AWS_ENDPOINT_URL_CLOUDWATCH_LOGS` | `cloudwatch_logs` |
| Route 53 | `route53` | `AWS_ENDPOINT_URL_ROUTE_53` | `route_53` |

환경변수 이름이 provider 파라미터와 기계적으로 대응하지 않는 경우가 있다. `logs` 의 환경변수는 `AWS_ENDPOINT_URL_LOGS` 가 아니라 `AWS_ENDPOINT_URL_CLOUDWATCH_LOGS` 이고 `route53` 은 `AWS_ENDPOINT_URL_ROUTE_53` 인 반면, `apigatewayv2` 는 `AWS_ENDPOINT_URL_APIGATEWAYV2` 로 밑줄이 없다.

**별칭이 여러 개일 때.** 하위 호환 때문에 같은 엔드포인트를 여러 키로 지정할 수 있는 서비스가 있다(`dms`, `databasemigration`, `databasemigrationservice`). 둘 이상을 적으면 provider는 **먼저 나오는 값**을 쓰고 나머지는 무시한다.

**평가 순서 7단계.** 여러 소스에서 엔드포인트가 들어오면 이 순서로 결정된다.

1. provider 블록의 `endpoints`
2. `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` 또는 shared config의 `ignore_configure_endpoint_urls` — 설정돼 있으면 환경변수·shared config로 지정된 커스텀 엔드포인트를 **무시**한다
3. `AWS_ENDPOINT_URL_<SERVICE>` 서비스별 환경변수
4. `AWS_ENDPOINT_URL` 기본 엔드포인트 환경변수
5. shared config의 서비스별 엔드포인트
6. shared config의 기본 엔드포인트(`endpoint_url`)
7. 기본 서비스 엔드포인트

**v6에서 사라진 엔드포인트 키.** `endpoints.opsworks`, `endpoints.simpledb`, `endpoints.sdb`, `endpoints.worklink` 는 해당 서비스 지원 제거와 함께 사라졌다. 코드에 남아 있으면 실패한다.

**S3 백엔드 호환용 deprecated 환경변수.** Terraform S3 backend와의 호환을 위해 네 서비스는 옛 환경변수로도 설정된다. **deprecated** 이므로 새 설정에는 쓰지 않는다.

| 서비스 | deprecated 환경변수 |
|---|---|
| DynamoDB | `TF_AWS_DYNAMODB_ENDPOINT` 또는 `AWS_DYNAMODB_ENDPOINT` |
| IAM | `TF_AWS_IAM_ENDPOINT` 또는 `AWS_IAM_ENDPOINT` |
| S3 | `TF_AWS_S3_ENDPOINT` 또는 `AWS_S3_ENDPOINT` |
| STS | `TF_AWS_STS_ENDPOINT` 또는 `AWS_STS_ENDPOINT` |

## AWS Configuration Reference 대조표

원문의 AWS Configuration Reference를 그대로 대조한 표다.

| 설정 | provider 인수 | 환경변수 | shared config 키 |
|---|---|---|---|
| Access Key ID | `access_key` | `AWS_ACCESS_KEY_ID` | `aws_access_key_id` |
| Secret Access Key | `secret_key` | `AWS_SECRET_ACCESS_KEY` | `aws_secret_access_key` |
| Session Token | `token` | `AWS_SESSION_TOKEN` | `aws_session_token` |
| Region | `region` | `AWS_REGION` 또는 `AWS_DEFAULT_REGION` | `region` |
| Custom CA Bundle | `custom_ca_bundle` | `AWS_CA_BUNDLE` | `ca_bundle` |
| EC2 IMDS Endpoint | `ec2_metadata_service_endpoint` | `AWS_EC2_METADATA_SERVICE_ENDPOINT` | N/A |
| EC2 IMDS Endpoint Mode | `ec2_metadata_service_endpoint_mode` | `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` | N/A |
| Disable EC2 IMDS | `skip_metadata_api_check` | `AWS_EC2_METADATA_DISABLED` | N/A |
| HTTP Proxy | `http_proxy` | `HTTP_PROXY` 또는 `http_proxy` | N/A |
| HTTPS Proxy | `https_proxy` | `HTTPS_PROXY` 또는 `https_proxy` | N/A |
| Non-Proxied Hosts | `no_proxy` | `NO_PROXY` 또는 `no_proxy` | N/A |
| Max Retries | `max_retries` | `AWS_MAX_ATTEMPTS` | `max_attempts` |
| Profile | `profile` | `AWS_PROFILE` 또는 `AWS_DEFAULT_PROFILE` | N/A |
| Retry Mode | `retry_mode` | `AWS_RETRY_MODE` | `retry_mode` |
| Shared Config Files | `shared_config_files` | `AWS_CONFIG_FILE` | N/A |
| Shared Credentials Files | `shared_credentials_files` | `AWS_SHARED_CREDENTIALS_FILE` | N/A |
| S3 `us-east-1` 리전 엔드포인트 사용 | `s3_us_east_1_regional_endpoint` | `AWS_S3_US_EAST_1_REGIONAL_ENDPOINT` | `s3_us_east_1_regional_endpoint` |
| DualStack 엔드포인트 사용 | `use_dualstack_endpoint` | `AWS_USE_DUALSTACK_ENDPOINT` | `use_dualstack_endpoint` |
| FIPS 엔드포인트 사용 | `use_fips_endpoint` | `AWS_USE_FIPS_ENDPOINT` | `use_fips_endpoint` |

함정이 하나 있다. `custom_ca_bundle` 행의 shared config 키는 `ca_bundle` 로 적혀 있지만, Argument Reference는 **"shared config 파일에 `ca_bundle` 을 설정하는 것은 지원하지 않는다"**고 못박는다. AWS CLI/SDK 일반의 대응 관계를 보여 주는 행일 뿐이다. CA 번들은 provider 인수나 `AWS_CA_BUNDLE` 로 준다.

## 자격증명 해결 순서 6단계

provider 설정은 여러 소스에서 올 수 있고 다음 순서로 적용된다. 이 순서는 AWS CLI와 AWS SDK for Go v2의 우선순위와 같다: provider 파라미터 -> 환경변수 -> shared credentials 파일 -> shared configuration 파일 -> 컨테이너 자격증명 -> 인스턴스 프로파일 자격증명과 Region.

각 단계의 세부 사항.

- **환경변수 단계**에서는 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, 선택적으로 `AWS_SESSION_TOKEN` 이 자격증명을, `AWS_REGION` 또는 `AWS_DEFAULT_REGION` 이 리전을 준다. `AWS_PROFILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE` 도 이 단계에 속한다.
- **shared 파일 단계**의 기본 위치는 Linux·macOS에서 `$HOME/.aws/config` 와 `$HOME/.aws/credentials`, Windows에서 `%USERPROFILE%\.aws\config` 와 `%USERPROFILE%\.aws\credentials` 다. named profile을 지정하지 않으면 `default` 프로파일을 쓴다.
- **컨테이너 자격증명 단계**는 CodeBuild·ECS의 Task Role(`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`, `AWS_CONTAINER_CREDENTIALS_FULL_URI`)과 EKS의 IRSA(`AWS_ROLE_ARN`, `AWS_WEB_IDENTITY_TOKEN_FILE`)를 포함한다. 이 환경변수들은 해당 서비스가 자동으로 넣어 준다.
- **인스턴스 프로파일 단계**는 EC2 IMDS를 쓴다. IMDS v1과 v2 모두 지원되고 리전도 여기서 올 수 있다.

여기에 세 가지 부가 경로가 얹힌다. `assume_role` 블록 또는 named profile을 통한 롤 assume(여러 개면 롤 체이닝), `assume_role_with_web_identity` 또는 환경변수·named profile을 통한 OIDC federation, named profile의 `credential_process` 를 통한 외부 프로세스 자격증명이다.

```ini
[profile customprofile]
credential_process = custom-process --username jdoe
```

하드코딩된 자격증명은 어떤 Terraform 설정에서도 권장되지 않는다. 그 파일이 공개 버전 관리 시스템에 커밋되면 시크릿이 새기 때문이다.

## 자주 쓰는 provider 설정 레시피

### 1. 로컬 개발 — 프로파일 하나로 끝내기

```terraform
provider "aws" {
  region              = "ap-northeast-2"
  profile             = "dev"
  allowed_account_ids = ["123456789012"]

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Env       = "dev"
    }
  }
}
```

`allowed_account_ids` 한 줄이 "스테이징 디렉터리에서 `AWS_PROFILE=prod` 가 남아 있는 셸로 apply"를 막는다. 다만 이 인수를 켜면 계정 ID 조회 권한이 필요해진다.

### 2. CI에서 OIDC — 장기 키 없이

```terraform
provider "aws" {
  region = "us-east-1"

  assume_role_with_web_identity {
    role_arn                = "arn:aws:iam::123456789012:role/ci-deployer"
    session_name            = "gha-${var.run_id}"
    web_identity_token_file = var.oidc_token_file
  }
}
```

러너가 `AWS_ROLE_ARN` 과 `AWS_WEB_IDENTITY_TOKEN_FILE` 을 이미 넣어 주는 환경이라면 블록을 생략하고 `region` 만 남겨도 된다. 토큰을 파일이 아니라 값으로 갖고 있다면 `web_identity_token` 인수나 `TF_AWS_WEB_IDENTITY_TOKEN` 환경변수를 쓴다.

### 3. 멀티 계정 — 관리 계정에서 워크로드 계정으로

```terraform
provider "aws" {
  alias  = "workload"
  region = "us-east-1"

  assume_role {
    role_arn     = "arn:aws:iam::210987654321:role/OrganizationAccountAccessRole"
    session_name = "terraform-workload"
    external_id  = var.external_id
  }

  allowed_account_ids = ["210987654321"]
}

resource "aws_vpc" "workload" {
  provider   = aws.workload
  cidr_block = "10.20.0.0/16"
}
```

v6에서는 **리전만 다르다면** alias를 새로 만들 필요가 없다. 대부분의 리소스에 최상위 `region` 인수가 생겼기 때문이다([24장](../level2-intermediate/24-enhanced-region-support.md)). alias가 여전히 필요한 것은 **자격증명 주체가 다를 때**다.

### 4. LocalStack — AWS 호환 구현에 붙이기

```terraform
provider "aws" {
  access_key                  = "mock_access_key"
  secret_key                  = "mock_secret_key"
  region                      = "us-east-1"
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    apigateway     = "http://localhost:4566"
    cloudformation = "http://localhost:4566"
    cloudwatch     = "http://localhost:4566"
    dynamodb       = "http://localhost:4566"
    iam            = "http://localhost:4566"
    lambda         = "http://localhost:4566"
    s3             = "http://localhost:4566"
    secretsmanager = "http://localhost:4566"
    sns            = "http://localhost:4566"
    sqs            = "http://localhost:4566"
    ssm            = "http://localhost:4566"
    stepfunctions  = "http://localhost:4566"
    sts            = "http://localhost:4566"
  }
}
```

세 개의 `skip_*` 와 `s3_use_path_style` 이 각각 다른 것을 끈다. `skip_credentials_validation` 은 STS 검증, `skip_metadata_api_check` 는 IMDS 조회, `skip_requesting_account_id` 는 계정 ID 조회, `s3_use_path_style` 은 버킷 이름을 호스트에 넣는 virtual hosted 주소 방식이다. DynamoDB Local만 쓴다면 `endpoints` 에 `dynamodb = "http://localhost:8000"` 하나면 된다.

커스텀 엔드포인트 지원은 best effort다. 개별 리소스가 특정 환경에서 동작하려면 호환성 수정이 필요할 수 있고, 통합 테스트는 기본 AWS 엔드포인트를 상대로만 이뤄진다.

### 5. FIPS / GovCloud — 규정 준수 경계

```terraform
provider "aws" {
  region            = "us-gov-west-1"
  use_fips_endpoint = true

  # FIPS 엔드포인트가 없는 서비스는 endpoints 블록에서 개별 지정한다
}
```

`use_fips_endpoint = true` 로 apply가 통과했다는 사실은 "모든 호출이 FIPS로 나갔다"의 증거가 아니다. 원문은 두 예외를 명시한다 — **커스텀 엔드포인트가 지정된 서비스에서는 무시되고**, **모든 서비스·리전에 유효한 FIPS 엔드포인트가 있지는 않다**. 감사가 목적이라면 실제 요청 호스트를 로그로 확인한다([41장](../level3-advanced/41-debugging.md)).

### 6. 프록시 뒤 — egress가 통제된 CI

```terraform
provider "aws" {
  region = "us-east-1"

  http_proxy       = "http://proxy.internal:3128"
  https_proxy      = "http://proxy.internal:3128"
  no_proxy         = "169.254.169.254,10.0.0.0/8,*.internal:8443"
  custom_ca_bundle = "/etc/ssl/certs/corp-root-ca.pem"

  max_retries = 10
  retry_mode  = "standard"
}
```

`no_proxy` 에 `169.254.169.254` 를 넣는 것이 중요하다. IMDS는 링크 로컬 주소이므로 프록시를 거치면 안 된다. HTTPS 프록시 없이 HTTP만 쓰려면 `https_proxy = ""` 를 명시한다 — 생략하면 `HTTPS_PROXY` 환경변수가 대신 적용될 수 있다.

`max_retries` 를 기본값 25에서 줄이는 것은 "빨리 실패하고 싶을 때"의 선택이다. 스로틀링이 심한 계정에서 25는 apply 실패가 아니라 apply가 수십 분 멈춰 있는 형태로 나타난다([40장](../level3-advanced/40-performance-and-throttling.md)).

## 빠른 색인

| 하고 싶은 것 | 인수 |
|---|---|
| 다른 계정에 배포 | `assume_role` (또는 alias 조합) |
| CI에서 장기 키 없애기 | `assume_role_with_web_identity` |
| 운영 계정 오폭 방지 | `allowed_account_ids` |
| 태그 관련 | `default_tags`, `ignore_tags`, `tag_policy_compliance` |
| 로컬 목 서버 | `endpoints` + `skip_*` 3종 + `s3_use_path_style` |
| 사내 프록시·CA 통과 | `http_proxy`, `https_proxy`, `no_proxy`, `custom_ca_bundle` |
| 규정 준수 엔드포인트 | `use_fips_endpoint`, `use_dualstack_endpoint` |
| 스로틀링 대응 튜닝 | `max_retries`, `retry_mode`, `token_bucket_rate_limiter_capacity` |
| 요청 출처 식별(비용 태깅·감사) | `user_agent`, `TF_APPEND_USER_AGENT`, `provider_meta` |
| 리전만 다른 리소스 만들기 | provider 인수가 아니라 **리소스의 `region`** |

**v6에서 조심할 것.**

- `max_retries` 기본값은 3이 아니라 **25** 다.
- `s3_us_east_1_regional_endpoint` 는 **deprecated**, `v7.0.0` 에서 제거 예정이다.
- `endpoints.opsworks` · `endpoints.simpledb` · `endpoints.sdb` · `endpoints.worklink` 는 **제거됐다**.
- `default_tags` 는 `aws_autoscaling_group` 에 적용되지 않고, 환경변수와 충돌 시 **provider 승**이다. `ignore_tags` 는 반대로 **병합**된다.
- 리소스의 `region` 값을 바꾸면 **교체**된다. 반대로 `region` 인수를 지우면 교체되지 않고 state의 이전 값을 쓴다.

## 관련 문서

- [4장 — provider 블록과 자격증명](../level1-beginner/04-provider-block-and-auth.md) · [24장 — Enhanced Region Support](../level2-intermediate/24-enhanced-region-support.md) · [25장 — 멀티 계정](../level2-intermediate/25-multi-account.md) · [34장 — Provider 설정 심화](../level3-advanced/34-provider-configuration-deep.md)
- [부록 B — 환경 변수 레퍼런스](b-environment-variables.md) · [부록 D — v6 파괴적 변경 체크리스트](d-v6-breaking-changes.md)
- 공식 문서: [AWS Provider Argument Reference](https://registry.terraform.io/providers/hashicorp/aws/latest/docs), [Custom Service Endpoint Configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/custom-service-endpoints), [Tag Policy Compliance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/tag-policy-compliance)
