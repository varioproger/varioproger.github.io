---
appendix: B
title: "환경 변수 레퍼런스"
kind: reference
source_docs:
  - "website/docs/index.html.markdown"
  - "website/docs/guides/custom-service-endpoints.html.markdown"
  - "website/docs/guides/tag-policy-compliance.html.markdown"
  - "docs/acc-test-environment-variables.md"
  - "docs/debugging.md"
  - "docs/makefile-cheat-sheet.md"
  - "docs/data-handling-and-conversion.md"
provider_baseline: "6.x"
---

# 부록 B — 환경 변수 레퍼런스

환경 변수는 Terraform AWS Provider 설정에서 **가장 눈에 띄지 않으면서 가장 자주 사고를 내는 층**이다. `.tf` 파일에는 아무 흔적도 남기지 않으면서 자격증명, 리전, 엔드포인트, 태그, 재시도 횟수를 전부 바꿔 놓을 수 있기 때문이다. "로컬에서는 되는데 CI에서는 안 된다"의 절반은 여기에서 나온다.

이 부록은 카테고리별로 변수를 모은다. 표의 **대응 provider 인수** 열을 보면 "이 변수를 코드로 옮기려면 어디에 쓰면 되는가"를 바로 알 수 있다. 여기에 없는 provider 인수는 환경변수 경로가 없다는 뜻이며, provider 인수 쪽 전체 목록은 [부록 A](a-provider-arguments.md)에 있다.

세 접두어를 구분하는 것이 출발점이다.

- **`AWS_*`** — AWS SDK for Go v2와 AWS CLI가 공유하는 표준 변수다. Terraform이 아니라 SDK가 읽는다. 다른 AWS 도구(`aws` CLI, `boto3`)도 같은 값을 본다.
- **`TF_AWS_*`** — AWS Provider가 자체적으로 정의한 변수다. SDK 표준에 없는 기능(기본 태그, 무시 태그, 태그 정책)이거나 SDK 표준을 보완하는 것이다.
- **`TF_*`** — Terraform Core(CLI)가 읽는 변수다. provider와 무관하게 동작하며 다른 provider에도 그대로 적용된다.

## 자격증명·리전

| 변수 | 값 형식 | 대응 provider 인수 | 설명 | 관련 챕터 |
|---|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | 액세스 키 ID | `access_key` | AWS access key. `AWS_SECRET_ACCESS_KEY` 와 짝 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_SECRET_ACCESS_KEY` | 시크릿 문자열 | `secret_key` | AWS secret key | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_SESSION_TOKEN` | 세션 토큰 | `token` | 임시 자격증명용 세션 토큰. MFA 6자리 코드가 아니다 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_REGION` | 리전 코드 (`us-east-1`) | `region` | provider가 동작할 리전 | [24장](../level2-intermediate/24-enhanced-region-support.md) |
| `AWS_DEFAULT_REGION` | 리전 코드 | `region` | `AWS_REGION` 의 대체 이름 | [24장](../level2-intermediate/24-enhanced-region-support.md) |
| `AWS_CA_BUNDLE` | 파일 경로 | `custom_ca_bundle` | 커스텀 루트·중간 인증서 파일 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` | 상대 URI | (없음) | ECS/CodeBuild Task Role. 서비스가 자동으로 설정한다 | [4장](../level1-beginner/04-provider-block-and-auth.md), [29장](../level2-intermediate/29-containers-ecs-eks.md) |
| `AWS_CONTAINER_CREDENTIALS_FULL_URI` | 전체 URI | (없음) | 위와 같으며 고급 용도로 수동 설정도 가능 | [29장](../level2-intermediate/29-containers-ecs-eks.md) |

세 가지를 기억한다.

**하드코딩보다 환경변수가 낫지만, 환경변수도 최선은 아니다.** 셸 히스토리, 프로세스 목록, CI 로그, 코어 덤프 어디로든 샌다. 장기 액세스 키 대신 OIDC나 롤 assume으로 가는 것이 목표다([25장](../level2-intermediate/25-multi-account.md)).

**`AWS_REGION` 과 `AWS_DEFAULT_REGION` 은 둘 다 유효하다.** AWS CLI v1 시절 이름이 `AWS_DEFAULT_REGION` 이었고 SDK v2가 `AWS_REGION` 을 표준으로 삼았다. 팀 내에서 하나로 통일해 두지 않으면 "왜 리전이 안 바뀌지"의 원인이 된다.

**컨테이너 자격증명 변수는 우리가 설정하지 않는다.** ECS·CodeBuild가 Task Role을, EKS가 IRSA 관련 변수를 자동으로 넣어 준다. 이 변수들을 직접 설정하는 것은 고급 사례다.

## 프로파일·설정 파일

| 변수 | 값 형식 | 대응 provider 인수 | 설명 | 관련 챕터 |
|---|---|---|---|---|
| `AWS_PROFILE` | 프로파일 이름 | `profile` | shared config/credentials 파일의 named profile | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_DEFAULT_PROFILE` | 프로파일 이름 | `profile` | `AWS_PROFILE` 의 대체 이름 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_CONFIG_FILE` | 파일 경로 **1개** | `shared_config_files` | shared config 파일 위치. 기본 `~/.aws/config` | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_SHARED_CREDENTIALS_FILE` | 파일 경로 **1개** | `shared_credentials_files` | shared credentials 파일 위치. 기본 `~/.aws/credentials` | [4장](../level1-beginner/04-provider-block-and-auth.md) |

provider 인수 쪽은 `shared_config_files` / `shared_credentials_files` 로 **리스트**를 받지만, 환경변수는 **값 하나만** 지정할 수 있다. 파일을 여러 개 쓰려면 provider 인수를 써야 한다.

named profile을 지정하지 않으면 `default` 프로파일이 쓰인다. 파일의 기본 위치는 Linux·macOS에서 `$HOME/.aws/config` 와 `$HOME/.aws/credentials`, Windows에서 `%USERPROFILE%\.aws\config` 와 `%USERPROFILE%\.aws\credentials` 다.

프로파일 안에서 `credential_process` 를 쓰면 외부 프로세스가 자격증명을 공급한다. 이 경로는 환경변수가 아니라 shared config 파일에만 존재한다.

```ini
[profile customprofile]
credential_process = custom-process --username jdoe
```

## 롤 assume·웹 아이덴티티

**`assume_role` 블록은 환경변수를 지원하지 않는다.** 원문이 명시적으로 못박는 사실이다. 롤 assume을 환경에서 주려면 `assume_role_with_web_identity` 경로를 쓰거나, named profile에 `role_arn` 등을 적어 두고 `AWS_PROFILE` 로 그 프로파일을 가리켜야 한다.

| 변수 | 값 형식 | 대응 provider 인수 | 설명 | 관련 챕터 |
|---|---|---|---|---|
| `AWS_ROLE_ARN` | 롤 ARN | `assume_role_with_web_identity.role_arn` | 웹 아이덴티티로 assume할 롤 | [25장](../level2-intermediate/25-multi-account.md) |
| `AWS_ROLE_SESSION_NAME` | 문자열 | `assume_role_with_web_identity.session_name` | 세션 이름 | [25장](../level2-intermediate/25-multi-account.md) |
| `AWS_WEB_IDENTITY_TOKEN_FILE` | 파일 경로 | `assume_role_with_web_identity.web_identity_token_file` | OIDC 토큰이 담긴 **파일** 경로 | [25장](../level2-intermediate/25-multi-account.md) |
| `TF_AWS_WEB_IDENTITY_TOKEN` | 토큰 문자열 | `assume_role_with_web_identity.web_identity_token` | OIDC 토큰 **값** 자체. AWS 표준이 아니라 provider 고유 변수라 접두어가 `TF_AWS_` 다 | [25장](../level2-intermediate/25-multi-account.md) |

`web_identity_token` 과 `web_identity_token_file` 중 **하나는 반드시** 있어야 한다. `duration`, `policy`, `policy_arns` 에는 환경변수 경로가 없으니 이 셋이 필요하면 provider 블록이나 shared config로 간다.

EKS의 IRSA는 쿠버네티스가 `AWS_ROLE_ARN` 과 `AWS_WEB_IDENTITY_TOKEN_FILE` 을 파드에 자동으로 주입한다. 그래서 EKS 위에서 도는 Terraform은 provider 블록에 아무것도 적지 않아도 롤을 얻는다. 반대로 말하면, 이 두 변수가 예상치 못하게 설정돼 있으면 우리가 의도한 프로파일 대신 파드 롤이 쓰인다.

## 엔드포인트

**형식이 두 갈래다.** 하나는 SDK 표준 형식, 하나는 Terraform S3 backend 호환용 deprecated 형식이다.

| 변수 | 값 형식 | 대응 provider 인수 | 설명 | 관련 챕터 |
|---|---|---|---|---|
| `AWS_ENDPOINT_URL` | URL | (없음 — 전역) | **모든 서비스**의 엔드포인트를 이 값으로 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `AWS_ENDPOINT_URL_<SERVICE>` | URL | `endpoints.<서비스키>` | **개별 서비스** 엔드포인트. `<SERVICE>` 는 AWS SDK for Go v2의 `serviceID` 에서 공백을 밑줄(`_`)로 바꾸고 전부 대문자로 만든 것 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` | 플래그 | (없음) | 환경변수·shared config로 지정된 커스텀 엔드포인트를 **전부 무시**한다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |

`<SERVICE>` 자리에 들어갈 이름은 provider 파라미터 이름과 기계적으로 대응하지 않는다.

| provider `endpoints` 키 | 환경변수 |
|---|---|
| `dynamodb` | `AWS_ENDPOINT_URL_DYNAMODB` |
| `s3` | `AWS_ENDPOINT_URL_S3` |
| `iam` | `AWS_ENDPOINT_URL_IAM` |
| `sts` | `AWS_ENDPOINT_URL_STS` |
| `logs` | `AWS_ENDPOINT_URL_CLOUDWATCH_LOGS` |
| `route53` | `AWS_ENDPOINT_URL_ROUTE_53` |
| `apigateway` | `AWS_ENDPOINT_URL_API_GATEWAY` |
| `apigatewayv2` | `AWS_ENDPOINT_URL_APIGATEWAYV2` |
| `elbv2` | `AWS_ENDPOINT_URL_ELASTIC_LOAD_BALANCING_V2` |
| `secretsmanager` | `AWS_ENDPOINT_URL_SECRETS_MANAGER` |
| `acmpca` | `AWS_ENDPOINT_URL_ACM_PCA` |

271개 서비스 전체 대응표는 원문 [Custom Service Endpoints 가이드](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/custom-service-endpoints)에 있다. 이름을 짐작하지 말고 반드시 표를 확인한다 — `AWS_ENDPOINT_URL_LOGS` 처럼 그럴듯하지만 존재하지 않는 이름을 설정하면 **에러 없이 조용히 무시**되고, 요청은 실제 AWS로 나간다.

### deprecated 엔드포인트 변수

Terraform S3 backend와의 호환을 위해 네 서비스만 옛 이름을 계속 받아 준다. 원문이 **deprecated** 로 명시한 형식이므로 새 설정에는 쓰지 않는다.

| 서비스 | deprecated 변수 |
|---|---|
| DynamoDB | `TF_AWS_DYNAMODB_ENDPOINT` 또는 `AWS_DYNAMODB_ENDPOINT` |
| IAM | `TF_AWS_IAM_ENDPOINT` 또는 `AWS_IAM_ENDPOINT` |
| S3 | `TF_AWS_S3_ENDPOINT` 또는 `AWS_S3_ENDPOINT` |
| STS | `TF_AWS_STS_ENDPOINT` 또는 `AWS_STS_ENDPOINT` |

`TF_AWS_<SERVICE>_ENDPOINT` 는 **이 네 서비스에만** 존재하는 형식이지 일반 규칙이 아니다. `TF_AWS_LAMBDA_ENDPOINT` 같은 변수는 없다.

### 엔드포인트 평가 순서

1. provider 블록의 `endpoints`
2. `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` 또는 shared config의 `ignore_configure_endpoint_urls` — 설정 시 환경변수·shared config 엔드포인트를 무시
3. `AWS_ENDPOINT_URL_<SERVICE>`
4. `AWS_ENDPOINT_URL`
5. shared config의 서비스별 엔드포인트
6. shared config의 기본 엔드포인트(`endpoint_url`)
7. 기본 서비스 엔드포인트

`AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` 가 2번 자리에 있다는 것이 중요하다. 공유 개발 머신이나 LocalStack을 쓰던 셸에서 실제 AWS로 apply해야 할 때, 이 변수 하나로 환경에 새어 든 엔드포인트 설정을 한 번에 걷어낼 수 있다. **provider 블록에 명시한 `endpoints` 는 이 변수의 영향을 받지 않는다.**

## 재시도·네트워크

| 변수 | 값 형식 | 대응 provider 인수 | 설명 | 관련 챕터 |
|---|---|---|---|---|
| `AWS_MAX_ATTEMPTS` | 정수 | `max_retries` | 재시도 횟수 상한. provider 인수 기본값은 **25** | [40장](../level3-advanced/40-performance-and-throttling.md) |
| `AWS_RETRY_MODE` | `standard` \| `adaptive` | `retry_mode` | 재시도 방식 | [40장](../level3-advanced/40-performance-and-throttling.md) |
| `HTTP_PROXY` / `http_proxy` | URL | `http_proxy` | HTTP 요청용 프록시 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `HTTPS_PROXY` / `https_proxy` | URL | `https_proxy` | HTTPS 요청용 프록시 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `NO_PROXY` / `no_proxy` | 콤마 구분 목록 | `no_proxy` | 프록시를 거치지 않을 호스트. 도메인 / IP / CIDR / `*` | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `AWS_USE_FIPS_ENDPOINT` | 불리언 | `use_fips_endpoint` | FIPS 엔드포인트 강제 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `AWS_USE_DUALSTACK_ENDPOINT` | 불리언 | `use_dualstack_endpoint` | DualStack 엔드포인트 강제 | [34장](../level3-advanced/34-provider-configuration-deep.md) |
| `AWS_S3_US_EAST_1_REGIONAL_ENDPOINT` | `legacy` \| `regional` | `s3_us_east_1_regional_endpoint` | **Deprecated.** provider 인수와 함께 `v7.0.0` 에서 제거 예정 | [39장](../level3-advanced/39-version-upgrades.md) |

프록시 변수는 대소문자 두 형태가 모두 유효하다. 관례상 소문자(`http_proxy`)가 더 오래됐고 대문자가 널리 쓰인다. 둘 다 설정하는 것은 혼란만 부른다.

`no_proxy` 에 **`169.254.169.254` 를 반드시 넣는다.** IMDS는 링크 로컬 주소이므로 프록시를 거치면 자격증명 조회가 실패한다. 사내 프록시를 켠 EC2 러너에서 갑자기 `NoCredentialProviders` 가 뜨는 원인의 대부분이 이것이다.

`AWS_MAX_ATTEMPTS` 는 "재시도 횟수"이지 "타임아웃"이 아니다. 이 값을 늘려도 개별 요청이 오래 걸리는 문제는 해결되지 않고, 오히려 apply가 끝나지 않는 시간만 길어진다.

## 태그

이 카테고리는 전부 `TF_AWS_*` — AWS SDK 표준이 아니라 provider 고유 변수다.

| 변수 | 값 형식 | 대응 provider 인수 | 충돌 규칙 | 관련 챕터 |
|---|---|---|---|---|
| `TF_AWS_DEFAULT_TAGS_<태그키>` | 태그 값 | `default_tags.tags` | **provider 설정이 우선** | [10장](../level1-beginner/10-tags-basics.md), [23장](../level2-intermediate/23-tagging-strategy.md) |
| `TF_AWS_IGNORE_TAGS_KEYS` | 콤마 구분 키 목록 | `ignore_tags.keys` | **두 소스가 병합** | [23장](../level2-intermediate/23-tagging-strategy.md) |
| `TF_AWS_IGNORE_TAGS_KEY_PREFIXES` | 콤마 구분 접두어 목록 | `ignore_tags.key_prefixes` | **두 소스가 병합** | [23장](../level2-intermediate/23-tagging-strategy.md) |
| `TF_AWS_TAG_POLICY_COMPLIANCE` | `error` \| `warning` \| `disabled` | `tag_policy_compliance` | **provider 설정이 우선** | [23장](../level2-intermediate/23-tagging-strategy.md) |

### 우선순위 vs 병합 — 반드시 구분한다

이 부록에서 가장 자주 헷갈리는 지점이다. 세 변수가 비슷하게 생겼지만 규칙이 반대다.

**`TF_AWS_DEFAULT_TAGS_<키>` 는 우선순위다.** 같은 태그 키가 환경변수와 `default_tags.tags` 양쪽에 있으면 **provider 설정 값이 이긴다**. 환경변수 값은 버려진다. 환경변수에만 있는 키는 그대로 추가된다.

```console
$ export TF_AWS_DEFAULT_TAGS_Environment=Test
$ export TF_AWS_DEFAULT_TAGS_Owner=platform
```

```terraform
provider "aws" {
  default_tags {
    tags = {
      Environment = "Production"
      Name        = "Provider Tag"
    }
  }
}
```

결과 기본 태그는 `Environment = "Production"`(provider 승), `Name = "Provider Tag"`, `Owner = "platform"`(환경변수에만 있음) 셋이다.

**`TF_AWS_IGNORE_TAGS_KEYS` / `TF_AWS_IGNORE_TAGS_KEY_PREFIXES` 는 병합이다.** 인수와 환경변수가 둘 다 설정돼 있으면 **두 소스의 값이 하나의 목록으로 합쳐진다**. 어느 쪽도 이기지 않는다.

```console
$ export TF_AWS_IGNORE_TAGS_KEYS="LastScanned,CostCenterAuto"
```

```terraform
provider "aws" {
  ignore_tags {
    keys = ["TagKey1"]
  }
}
```

무시되는 키는 `TagKey1`, `LastScanned`, `CostCenterAuto` 세 개 전부다.

이 차이가 실무에서 갈리는 지점은 이렇다. 기본 태그는 "이 값이 맞다"는 **단일 진실**을 정하는 문제라서 우선순위가 필요하고, 무시 태그는 "이것도 무시하고 저것도 무시해라"는 **누적 목록**이라서 병합이 자연스럽다. 규칙을 외우기보다 이 성격 차이를 기억하는 편이 낫다.

**태그 키에 밑줄이나 특수문자가 있다면 주의한다.** 변수 이름은 `TF_AWS_DEFAULT_TAGS_` 뒤에 태그 키를 그대로 붙이는 형식이다. 셸에서 변수 이름으로 쓸 수 없는 문자(하이픈, 콜론, 슬래시)가 태그 키에 들어가면 이 경로를 쓸 수 없고 provider 인수로 가야 한다. `kubernetes.io/cluster/foo` 같은 키가 대표적이다.

**`TF_AWS_TAG_POLICY_COMPLIANCE` 는 plan을 실패시킬 수 있는 변수다.** `error` 로 두면 조직 태그 정책이 요구하는 태그가 빠진 리소스에서 plan 단계부터 에러 진단이 뜬다. `warning` 은 경고만 내고 계획은 진행된다. 다만 Plugin SDK V2 기반 리소스는 plan 시점에 warning 진단을 낼 수 없어 `WARN` 레벨 로그 메시지로 대신 나온다 — 그래서 `warning` 모드에서 무언가를 보려면 `TF_LOG=warn` 을 함께 켜야 한다.

```console
% TF_AWS_TAG_POLICY_COMPLIANCE=warning TF_LOG=warn terraform plan
```

이 기능을 쓰려면 계정에 태그 정책이 붙어 있어야 하고, Terraform을 실행하는 principal에 `ListRequiredTags` IAM 권한이 있어야 한다. 이 API는 2025년 11월에 도입된 것이라 기존 권한 설정을 수정해야 할 수 있다.

## IMDS·엔드포인트 모드

| 변수 | 값 형식 | 대응 provider 인수 | 설명 | 관련 챕터 |
|---|---|---|---|---|
| `AWS_EC2_METADATA_SERVICE_ENDPOINT` | URL | `ec2_metadata_service_endpoint` | IMDS 엔드포인트 주소 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` | `IPv4` \| `IPv6` | `ec2_metadata_service_endpoint_mode` | IMDS 통신 모드 | [4장](../level1-beginner/04-provider-block-and-auth.md) |
| `AWS_EC2_METADATA_DISABLED` | 불리언 | `skip_metadata_api_check` | IMDS 조회를 끈다 | [34장](../level3-advanced/34-provider-configuration-deep.md) |

IMDS v1과 v2 모두 지원된다. `AWS_EC2_METADATA_DISABLED` 를 켜면 IMDS 경유 인증 경로가 완전히 막히므로, EC2 위에서 돌면서 이 변수를 켜면 다른 자격증명 소스가 반드시 있어야 한다.

로컬 개발 머신에서 이 변수를 켜 두면 부수 효과가 하나 있다. provider가 자격증명 해결 6단계의 마지막 단계에서 링크 로컬 주소로 접속을 시도하다 타임아웃을 기다리는 일이 사라져 `plan` 시작이 눈에 띄게 빨라진다.

## Terraform Core 쪽 변수

아래는 AWS Provider가 아니라 **Terraform CLI**가 읽는 변수다. 다른 provider를 쓸 때도 같은 방식으로 동작한다.

| 변수 | 값 형식 | 설명 | 관련 챕터 |
|---|---|---|---|
| `TF_LOG` | `TRACE`\|`DEBUG`\|`INFO`\|`WARN`\|`ERROR` | 로그 레벨. Core와 provider 양쪽에 적용 | [41장](../level3-advanced/41-debugging.md) |
| `TF_LOG_CORE` | 같은 레벨 값 | Terraform Core 로그 레벨만 별도 지정. `TF_LOG` 를 덮어쓴다 | [41장](../level3-advanced/41-debugging.md) |
| `TF_LOG_PROVIDER` | 같은 레벨 값 | provider 로그 레벨만 별도 지정. `TF_LOG` 를 덮어쓴다 | [41장](../level3-advanced/41-debugging.md) |
| `TF_LOG_PATH` | 파일 경로 | 로그를 파일로 보낸다 | [41장](../level3-advanced/41-debugging.md) |
| `TF_VAR_<변수명>` | 값 | 루트 모듈 입력 변수 값 | [7장](../level1-beginner/07-variables-outputs-locals.md) |
| `TF_CLI_ARGS` | CLI 인수 문자열 | 모든 `terraform` 명령에 인수를 덧붙인다. `TF_CLI_ARGS_plan` 처럼 서브커맨드별 지정도 가능 | [38장](../level3-advanced/38-large-scale-structure-cicd.md) |
| `TF_IN_AUTOMATION` | 비어 있지 않은 값 | 자동화 환경임을 알린다. 사람 대상 안내 문구가 줄어든다 | [38장](../level3-advanced/38-large-scale-structure-cicd.md) |
| `TF_APPEND_USER_AGENT` | 문자열 | AWS API 호출의 User-Agent 헤더에 값을 **그대로** 덧붙인다 | [33장](../level2-intermediate/33-provider-functions-and-policies.md) |
| `TF_REATTACH_PROVIDERS` | JSON | 이미 실행 중인 provider 프로세스에 연결한다. 디버거를 붙인 provider를 쓸 때 | [43장](../level3-advanced/43-dev-environment-and-skaff.md) |

`TF_APPEND_USER_AGENT` 만 이 표에서 AWS Provider가 직접 읽는 변수다. Terraform Core 변수 목록에 함께 두는 이유는 이름이 `TF_` 로 시작해 헷갈리기 쉬워서다.

AWS 쪽 문제를 디버깅할 때 `TF_LOG=trace` 하나만 켜면 Core 로그가 압도적으로 많아 AWS 요청/응답을 찾기 어렵다. 아래 조합이 실용적인 기본값이다.

```console
$ TF_LOG_CORE=warn TF_LOG_PROVIDER=trace TF_LOG_PATH=./tf.log terraform plan
```

`TF_LOG_PATH` 를 쓰면 로그는 파일로 가고 터미널 출력은 평소대로 유지된다. **로그에는 SigV4 서명, 세션 토큰, 리소스 인수의 시크릿이 남는다.** 이슈에 첨부하기 전에 반드시 마스킹한다.

provider 내부의 AutoFlex(구조체 변환기) 전용 로그 스위치도 있다.

| 변수 | 값 형식 | 설명 | 관련 챕터 |
|---|---|---|---|
| `TF_LOG_AWS_AUTOFLEX` | `ERROR`\|`WARN`\|`INFO`\|`DEBUG`\|`TRACE` | AutoFlex의 flatten/expand 상세 로그. 기본값 `ERROR` | [44장](../level3-advanced/44-implementing-a-resource.md) |

## provider 개발·테스트용

provider 저장소에서 인수 테스트(acceptance test)를 돌릴 때만 의미가 있는 변수들이다. 사용자 입장에서는 알 필요가 없지만, provider에 기여하거나 버그를 재현할 때 필요하다.

| 변수 | 값 형식 | 설명 | 관련 챕터 |
|---|---|---|---|
| `TF_ACC` | `1` | `resource.Test()` / `resource.ParallelTest()` 를 실제로 실행시킨다. **없으면 인수 테스트는 조용히 건너뛴다** | [47장](../level3-advanced/47-testing.md) |
| `AWS_DEFAULT_REGION` | 리전 코드 | 테스트의 기본 리전. 기본값 `us-west-2` | [47장](../level3-advanced/47-testing.md) |
| `AWS_ALTERNATE_PROFILE` | 프로파일 이름 | 두 번째 계정용 프로파일. `AWS_ALTERNATE_ACCESS_KEY_ID`/`AWS_ALTERNATE_SECRET_ACCESS_KEY` 와 충돌 | [47장](../level3-advanced/47-testing.md) |
| `AWS_ALTERNATE_ACCESS_KEY_ID` | 액세스 키 ID | 두 번째 계정 액세스 키. `AWS_ALTERNATE_SECRET_ACCESS_KEY` 가 필요 | [47장](../level3-advanced/47-testing.md) |
| `AWS_ALTERNATE_SECRET_ACCESS_KEY` | 시크릿 | 두 번째 계정 시크릿 키 | [47장](../level3-advanced/47-testing.md) |
| `AWS_ALTERNATE_REGION` | 리전 코드 | 두 번째 리전. 기본값 `us-east-1` | [47장](../level3-advanced/47-testing.md) |
| `AWS_THIRD_PROFILE` | 프로파일 이름 | 세 번째 계정용 프로파일 | [47장](../level3-advanced/47-testing.md) |
| `AWS_THIRD_ACCESS_KEY_ID` | 액세스 키 ID | 세 번째 계정 액세스 키. `AWS_THIRD_SECRET_ACCESS_KEY` 가 필요 | [47장](../level3-advanced/47-testing.md) |
| `AWS_THIRD_SECRET_ACCESS_KEY` | 시크릿 | 세 번째 계정 시크릿 키 | [47장](../level3-advanced/47-testing.md) |
| `AWS_THIRD_REGION` | 리전 코드 | 세 번째 리전. 기본값 `us-east-2` | [47장](../level3-advanced/47-testing.md) |
| `TF_ACC_ASSUME_ROLE_ARN` | 롤 ARN | 제한된 권한으로 테스트할 때 쓸 기존 IAM 롤 | [47장](../level3-advanced/47-testing.md) |
| `TF_ACC_REQUIRED_TAG_KEY` | 태그 키 | 조직 태그 정책이 대상 리소스에 요구하는 태그 키 이름 | [47장](../level3-advanced/47-testing.md) |
| `TF_AWS_ASSUME_ROLE_ARN` | 롤 ARN | **Required.** assume role 테스트용 | [47장](../level3-advanced/47-testing.md) |
| `TF_AWS_ASSUME_ROLE_DURATION` | 초 | assume role 세션 길이. 기본 1시간(`3600`) | [47장](../level3-advanced/47-testing.md) |
| `TF_AWS_ASSUME_ROLE_EXTERNAL_ID` | 문자열 | assume role external ID | [47장](../level3-advanced/47-testing.md) |
| `TF_AWS_ASSUME_ROLE_SESSION_NAME` | 문자열 | assume role 세션 이름 | [47장](../level3-advanced/47-testing.md) |
| `TF_AWS_ALLOW_SKIP_DESTROY` | 비어 있지 않은 값 | `skip_destroy` 인수로 파괴를 건너뛰는 테스트를 켠다. 리소스를 수동으로 지워야 할 수 있다 | [47장](../level3-advanced/47-testing.md) |
| `GOFLAGS` | Go 플래그 | 예: `-mod=readonly` | [43장](../level3-advanced/43-dev-environment-and-skaff.md) |

`TF_ACC` 가 이 목록에서 가장 자주 발을 거는 변수다. 없이 `go test` 를 돌리면 인수 테스트가 **실패가 아니라 스킵**되기 때문에, 출력만 보면 통과한 것처럼 보인다.

이 밖에 서비스별로 필요한 리소스를 지정하는 변수가 200개 가까이 있다(`ACM_CERTIFICATE_ROOT_DOMAIN`, `AMPLIFY_GITHUB_ACCESS_TOKEN`, `AWS_EC2_EIP_PUBLIC_IPV4_POOL`, `ROUTE53DOMAINS_DOMAIN_NAME` 등). 전체 목록은 저장소의 `docs/acc-test-environment-variables.md` 에 있다. 이름 규칙에 일관성이 있는 것은 아니라서, 특정 테스트가 스킵될 때 그 테스트 코드에서 어떤 변수를 읽는지 직접 확인하는 편이 빠르다.

`make` 타깃에 영향을 주는 변수도 별도로 있다. `PKG`(또는 `K`)로 서비스 패키지를 좁히고, `T`(또는 `TESTS`)로 테스트 이름을 지정하며, `ACCTEST_PARALLELISM`(기본 `20`) 또는 `P` 로 동시 실행 수를, `ACCTEST_TIMEOUT`(기본 `360m`)으로 타임아웃을 정한다. 이것들은 환경변수로도 `make` 호출 앞에 붙여서도 설정할 수 있다.

```console
$ make testacc PKG=vpc T=TestAccVPCFlowLog_basic
```

## 자주 겪는 증상과 원인

| 증상 | 먼저 확인할 변수 |
|---|---|
| 로컬은 되는데 CI만 `NoCredentialProviders` | `AWS_PROFILE`(CI에 프로파일 파일이 없다), `AWS_ROLE_ARN`+`AWS_WEB_IDENTITY_TOKEN_FILE` |
| 프로파일을 바꿨는데 안 바뀐다 | `AWS_ACCESS_KEY_ID` 등 환경변수가 프로파일보다 우선한다 |
| 엉뚱한 계정에 plan이 나온다 | `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`. `allowed_account_ids` 로 막는다 |
| 요청이 로컬 목 서버로 나간다 | `AWS_ENDPOINT_URL`, `AWS_ENDPOINT_URL_<SERVICE>`. `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` 로 무력화 |
| 프록시 켠 EC2에서 자격증명 실패 | `NO_PROXY` 에 `169.254.169.254` 누락 |
| 리전이 예상과 다르다 | `AWS_REGION` vs `AWS_DEFAULT_REGION`, 프로파일의 `region` |
| 태그가 지워지지 않는다 | `TF_AWS_IGNORE_TAGS_KEYS`(병합이라 환경 쪽 값이 살아 있다) |
| 기본 태그가 환경 값으로 안 바뀐다 | `default_tags` 는 provider 설정이 우선이다 |
| plan이 태그 때문에 실패한다 | `TF_AWS_TAG_POLICY_COMPLIANCE=error` |
| apply가 끝나지 않는다 | `AWS_MAX_ATTEMPTS`(provider 기본 25), `AWS_RETRY_MODE` |
| 인수 테스트가 전부 통과한다(수상하게 빠르게) | `TF_ACC` 미설정 |

환경 오염을 의심할 때 가장 빠른 진단은 관련 변수를 전부 나열해 보는 것이다.

```console
$ env | grep -E '^(AWS_|TF_)' | sort
```

CI 파이프라인이라면 이 한 줄을 진단 스텝으로 넣어 둘 만하다. 단 **값이 그대로 로그에 남으므로 이름만 찍도록** 바꾼다.

```console
$ env | grep -Eo '^(AWS_|TF_)[A-Za-z0-9_]+' | sort
```

## 관련 문서

- [4장 — provider 블록과 자격증명](../level1-beginner/04-provider-block-and-auth.md) · [23장 — 태깅 전략 심화](../level2-intermediate/23-tagging-strategy.md) · [25장 — 멀티 계정](../level2-intermediate/25-multi-account.md)
- [34장 — Provider 설정 심화](../level3-advanced/34-provider-configuration-deep.md) · [41장 — 디버깅](../level3-advanced/41-debugging.md) · [47장 — 테스트](../level3-advanced/47-testing.md)
- [부록 A — Provider 인수 전체 레퍼런스](a-provider-arguments.md)
- 공식 문서: [AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs), [Custom Service Endpoints](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/custom-service-endpoints), [Tag Policy Compliance](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/tag-policy-compliance)
