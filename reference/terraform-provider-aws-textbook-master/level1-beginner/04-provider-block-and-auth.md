---
chapter: 4
level: "Level 1 — 초급"
title: "provider 블록과 자격증명: 6단계 우선순위"
difficulty: 입문
reading_time: "30분"
prerequisites: [1, 3]
source_docs:
  - "website/docs/index.html.markdown"
  - "website/docs/guides/enhanced-region-support.html.markdown"
  - "website/docs/d/caller_identity.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 4장 — provider 블록과 자격증명: 6단계 우선순위

**이 장에서 배우는 것**

- `provider "aws"` 블록이 `required_providers` 와 무엇이 다른지 구분하고, 어디에 무엇을 적어야 하는지 판단할 수 있다.
- 자격증명 해결 6단계를 순서대로 말하고, "지금 이 apply가 어느 단계의 자격증명을 쓰고 있는가"를 추적할 수 있다.
- 환경변수 · shared config/credentials 파일 · 컨테이너 자격증명 · IMDS 각각을 언제 쓰고 어떻게 검증하는지 설명할 수 있다.
- `allowed_account_ids` 로 운영 계정 오폭을 막고, provider가 계정 ID를 어떤 API로 알아내는지 알고 필요한 권한을 준비할 수 있다.
- `alias` 로 provider 인스턴스를 여러 개 두는 방법과, v6에서 그것이 항상 필요하지는 않게 된 이유를 말할 수 있다.

**왜 중요한가**

Terraform 사고 중 가장 비싼 부류는 "맞는 코드를 틀린 계정에 apply한 것"이다. 스테이징용 디렉터리에서 `terraform apply` 를 눌렀는데 셸에 `AWS_PROFILE=prod` 가 남아 있었다. 코드도 plan도 정상으로 보인다 — 그 계정에 그 리소스들이 없으니 전부 `+` 로 만들겠다고 하고, 사람은 "새 환경이니 당연하지" 하고 승인한다. 프로덕션 VPC 옆에 이름이 비슷한 VPC가 하나 더 생기고, 다음 주에 누군가 그것을 정리하다가 진짜 프로덕션을 지운다. 이 사고를 코드 한 줄로 막는 장치가 `allowed_account_ids` 다.

두 번째 부류는 자격증명이 **어디서 왔는지 모르는** 상태에서 시작한다. 로컬에서는 되는데 CI에서는 `NoCredentialProviders` 가 뜬다. 혹은 그 반대로, CI에서는 되는데 로컬에서 어떤 팀원만 실패한다. 자격증명은 여섯 군데에서 올 수 있고 우선순위가 정해져 있다. 이 순서를 모르면 "환경변수를 지웠는데 왜 아직 옛날 키를 쓰지"(shared credentials 파일이 남아 있다), "프로파일을 바꿨는데 왜 안 바뀌지"(환경변수가 더 우선이다) 같은 질문에서 반나절씩 잃는다.

세 번째는 액세스 키를 코드에 적는 것이다. 공식 문서는 이 지점에 경고를 붙여 둔다 — 하드코딩된 자격증명은 **어떤 Terraform 설정에서도 권장되지 않으며**, 그 파일이 공개 버전 관리 시스템에 커밋될 경우 시크릿 유출 위험이 있다는 것이다. 이 장의 나머지 다섯 단계는 전부 "그러면 키를 적지 않고 어떻게 하는가"에 대한 답이다.

## provider 블록은 무엇을 하는가

`terraform` 블록의 `required_providers` 는 **어떤 provider를 어디서 받아 어느 버전을 쓸지**를 정하고, `provider "aws"` 블록은 **받아 온 provider를 어떻게 설정할지**를 정한다. 필요한 시점도 다르다 — `required_providers` 는 `init` 이, `provider` 블록은 `plan`/`apply` 가 읽는다.

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

`provider` 블록은 레이블이 하나(provider의 로컬 이름)이고 생략할 수도 있다. 자격증명과 region이 환경에서 전부 공급된다면 빈 블록으로도 동작한다.

```terraform
provider "aws" {}
```

주의할 것 하나. **provider 설정은 모듈 안에 두지 않는다.** 모듈은 호출자로부터 provider 설정을 물려받는 것이 원칙이고, 모듈 안에 `provider` 블록을 두면 그 모듈은 `count`/`for_each` 를 쓸 수 없게 되는 등 제약이 붙는다([19장](../level2-intermediate/19-modules.md)).

## 자격증명 해결 6단계

AWS Provider의 설정은 여러 소스에서 올 수 있고, 다음 순서로 적용된다.

1. provider 설정 블록의 파라미터
2. 환경 변수
3. shared credentials 파일
4. shared configuration 파일
5. 컨테이너 자격증명
6. 인스턴스 프로파일 자격증명과 Region

공식 문서는 이 순서가 **AWS CLI와 AWS SDK for Go v2의 우선순위와 일치한다**고 명시한다. 중요한 이유는 `aws sts get-caller-identity` 로 확인한 신원이 곧 Terraform이 쓸 신원이라고 믿어도 된다는 뜻이기 때문이다 — apply 전에 CLI로 확인하는 습관이 성립하는 근거가 여기 있다.

```mermaid
flowchart TD
    P1{"1. provider 블록<br/>access_key / secret_key / token"} -->|없음| P2
    P2{"2. 환경 변수<br/>AWS_ACCESS_KEY_ID 등"} -->|없음| P3
    P3{"3. shared credentials<br/>~/.aws/credentials"} -->|없음| P4
    P4{"4. shared config<br/>~/.aws/config"} -->|없음| P5
    P5{"5. 컨테이너 자격증명<br/>ECS · CodeBuild · EKS IRSA"} -->|없음| P6
    P6{"6. 인스턴스 프로파일<br/>EC2 IMDS + Region"} -->|없음| ERR[자격증명 없음 에러]
    P1 & P2 & P3 & P4 & P5 & P6 -->|있음| DONE[사용]
```

앞 단계에서 값을 찾으면 뒤는 보지 않는다. "환경변수를 지웠는데 왜 여전히 되지"의 답은 대개 3~4단계, "프로파일을 바꿨는데 왜 안 바뀌지"의 답은 대개 2단계다.

## 1단계 — provider 설정 파라미터

`provider` 블록에 `access_key`, `secret_key`, 그리고 필요하면 `token` 을 직접 줄 수 있다. 문서에 실린 예시는 다음과 같다.

```terraform
provider "aws" {
  region     = "us-west-2"
  access_key = "my-access-key"
  secret_key = "my-secret-key"
}
```

그리고 그 바로 위에 경고가 붙어 있다. 하드코딩된 자격증명은 **어떤 Terraform 설정에서도 권장되지 않으며**, 이 파일이 공개 버전 관리 시스템에 커밋될 경우 시크릿 유출 위험이 있다.

`token` 은 임시 자격증명을 검증할 때 쓰는 세션 토큰이다. 문서는 MFA 로그인의 경우 로그인 후에 받은 세션 토큰이지 **6자리 MFA 코드가 아니라는 점**을 못박는다.

1단계에서 하드코딩 말고 쓸 만한 것은 인증 자체가 아니라 **인증의 방향을 정하는** 인수들이다. `profile`, `shared_config_files`, `shared_credentials_files` 가 그것이고, 이들은 3~4단계를 어디서 읽을지 지정한다.

## 2단계 — 환경 변수

자격증명은 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, 그리고 필요하면 `AWS_SESSION_TOKEN` 으로 줄 수 있다. Region은 `AWS_REGION` 또는 `AWS_DEFAULT_REGION` 이다.

인증과 관련된 나머지 환경변수는 세 개다.

- `AWS_PROFILE` — 사용할 named profile. `AWS_DEFAULT_PROFILE` 도 인식된다.
- `AWS_CONFIG_FILE` — shared config 파일 경로(단일 값).
- `AWS_SHARED_CREDENTIALS_FILE` — shared credentials 파일 경로(단일 값).

환경변수는 CI에서 가장 흔한 방식이다. 장점은 코드에 남지 않는다는 것이고, 단점은 **셸 세션에 남아 다음 명령까지 따라간다**는 것이다. 로컬에서 여러 계정을 오간다면 `export` 대신 `AWS_PROFILE=sandbox terraform plan` 처럼 명령 앞에 붙이는 편이 사고가 적다. 그리고 환경변수는 3단계와 4단계보다 **우선한다** — `~/.aws/credentials` 를 아무리 잘 써 놔도 셸에 `AWS_ACCESS_KEY_ID` 가 살아 있으면 그쪽이 이긴다.

## 3~4단계 — shared credentials 파일과 shared config 파일

AWS Provider는 AWS CLI와 같은 **공유 설정/자격증명 파일**에서 값을 읽는다. 기본 경로는 운영체제에 따라 다르다.

| 플랫폼 | config | credentials |
|---|---|---|
| Linux · macOS | `$HOME/.aws/config` | `$HOME/.aws/credentials` |
| Windows | `%USERPROFILE%\.aws\config` | `%USERPROFILE%\.aws\credentials` |

named profile을 지정하지 않으면 `default` 프로파일이 쓰인다. 프로파일을 고르려면 `profile` 파라미터나 `AWS_PROFILE` 환경변수를 쓴다.

파일 위치도 바꿀 수 있다. 파라미터는 `shared_config_files` 와 `shared_credentials_files`, 환경변수는 `AWS_CONFIG_FILE` 과 `AWS_SHARED_CREDENTIALS_FILE` 이다. 파라미터는 **목록**이고 환경변수는 단일 값이다.

```terraform
provider "aws" {
  shared_config_files      = ["/Users/tf_user/.aws/conf"]
  shared_credentials_files = ["/Users/tf_user/.aws/creds"]
  profile                  = "customprofile"
}
```

`shared_config_files` 의 기본값은 `[~/.aws/config]` 다. `shared_credentials_files` 는 **프로파일이 사용될 때** 기본값이 `[~/.aws/credentials]` 가 된다.

두 파일이 나뉜 이유는 역할이 다르기 때문이다. credentials 파일에는 키가, config 파일에는 region · `role_arn` · `credential_process` 같은 설정이 들어간다. 우선순위에서도 credentials(3단계)가 config(4단계)보다 앞이다.

### credential_process

키를 파일에 적지 않고 **외부 프로세스에서 받아 오는** 방법이 있다. 문서가 명시하는 조건은 두 가지다 — 이 프로세스는 named profile에 설정해야 하고(`default` 프로파일도 포함된다), 그 프로파일은 shared configuration 파일에 있어야 한다.

```ini
[profile customprofile]
credential_process = custom-process --username jdoe
```

Terraform 쪽에서는 `provider "aws" { profile = "customprofile" }` 한 줄이면 된다. 사내 SSO 도구나 하드웨어 토큰 기반 도구를 붙일 때 이 경로를 쓴다. 인증 로직이 AWS 설정 파일 쪽으로 빠진다는 점이 장점이다.

## 5단계 — 컨테이너 자격증명

CodeBuild나 ECS에서 Terraform을 돌리고 IAM Task Role을 설정해 두었다면 Terraform은 그 컨테이너의 Task Role을 쓸 수 있다. 이 지원은 `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` 와 `AWS_CONTAINER_CREDENTIALS_FULL_URI` 환경변수에 기반하며, 이들은 해당 서비스가 자동으로 설정하거나 고급 사용을 위해 수동으로 설정할 수 있다.

EKS에서 IRSA(IAM Roles for Service Accounts)를 설정했다면 Terraform은 파드의 role을 쓸 수 있다. 이 지원은 `AWS_ROLE_ARN` 과 `AWS_WEB_IDENTITY_TOKEN_FILE` 환경변수에 기반하며, 이들은 Kubernetes가 자동으로 설정한다.

이 단계가 중요한 이유는 **CI에 장기 액세스 키를 넣지 않아도 되기 때문**이다. 자격증명이 짧은 수명의 임시 자격증명으로 자동 공급되므로 로테이션도 유출 대응도 신경 쓸 것이 줄어든다. GitHub Actions 같은 외부 CI라면 OIDC로 role을 assume하는 방식이 같은 이점을 준다([25장](../level2-intermediate/25-multi-account.md)).

자주 헷갈리는 지점 하나. 컨테이너 자격증명이 5단계라는 것은 **1~4단계에 값이 있으면 그쪽이 이긴다**는 뜻이다. 태스크 정의에 예전에 넣어 둔 `AWS_ACCESS_KEY_ID` 가 남아 있으면 Task Role은 쓰이지 않는다.

## 6단계 — 인스턴스 프로파일과 Region

AWS Provider가 IAM Instance Profile이 설정된 EC2 인스턴스 위에서 돌고 있다면 EC2 인스턴스 메타데이터 서비스(IMDS)에서 자격증명을 가져올 수 있다. **IMDS v1과 IMDS v2 모두 지원된다.**

엔드포인트는 `ec2_metadata_service_endpoint` 파라미터 또는 `AWS_EC2_METADATA_SERVICE_ENDPOINT` 환경변수로 바꾼다. 통신 모드는 `ec2_metadata_service_endpoint_mode` 로 정하며 유효한 값은 `IPv4` 와 `IPv6` 다(환경변수 `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE`).

반대로 메타데이터 API를 아예 보지 않게 할 수도 있다. `skip_metadata_api_check` 를 `true` 로 두면 **Terraform이 메타데이터 API를 통해 인증하는 것을 막는다.** 이 경우 static credentials나 환경변수 같은 다른 인증 방법이 필요하다. 환경변수는 `AWS_EC2_METADATA_DISABLED` 다.

이 인수가 유용한 곳은 둘이다. 메타데이터 엔드포인트가 없는 AWS 호환 구현(LocalStack 등)에서 불필요한 조회와 지연을 없앨 때, 그리고 EC2 위에서 돌지만 **인스턴스 프로파일이 아닌 다른 자격증명을 쓰고 싶을 때**다. 앞 단계가 모두 비어 있으면 provider는 조용히 인스턴스 프로파일로 넘어가므로, 그 role의 권한이 의도보다 넓으면 사고가 커진다.

6단계 이름에 "and Region"이 붙은 것도 우연이 아니다. 자격증명을 IMDS에서 가져오는 경우 **Region도 메타데이터에서 가져올 수 있다.** 그래서 EC2 위에서는 `region` 을 아무 데도 적지 않았는데 동작하는 일이 생긴다.

## region은 반드시 설정되어야 한다

`region` 은 문서상 Optional이지만 설명에는 **"The Region must be set."** 이라고 적혀 있다. `provider` 블록에 적지 않아도 되지만 어딘가에서는 반드시 와야 한다는 뜻이다. 올 수 있는 곳은 넷이다.

- `provider` 블록의 `region` 인수
- 환경변수 `AWS_REGION` 또는 `AWS_DEFAULT_REGION`
- `profile` 을 쓰는 경우 shared config 파일의 `region` 파라미터
- 자격증명을 EC2 IMDS에서 가져오는 경우 메타데이터

어느 것도 없으면 provider 설정 단계에서 실패한다. 로컬에서는 `~/.aws/config` 덕분에 조용히 넘어가다가 CI에서 터지는 전형적인 패턴이 여기서 나온다 — **CI에서는 region을 명시적으로 준다.**

v6에서 하나가 더 늘었다. 대부분의 리전 리소스 · 데이터 소스 · ephemeral 리소스가 **top-level `region` 인수**를 지원하며, 이것으로 provider 설정값을 리소스 단위로 덮어쓸 수 있다.

```terraform
provider "aws" {
  region = "ap-northeast-2"
}

# provider는 서울인데 이 VPC만 오레곤에 만든다
resource "aws_vpc" "peer" {
  region     = "us-west-2"
  cidr_block = "10.1.0.0/16"
}
```

이 인수는 값을 바꾸면 **리소스가 교체**되고, 모든 리소스에 있는 것은 아니며, import ID에도 영향을 준다([24장](../level2-intermediate/24-enhanced-region-support.md)). 여기서는 "v6부터 리전을 바꾸려고 항상 provider를 하나 더 만들 필요는 없어졌다"만 기억하면 된다. 기존 provider 블록 방식도 v6.0.0에서 여전히 유효하고 deprecated가 아니다.

## allowed_account_ids와 forbidden_account_ids

두 인수는 잘못된 계정을 실수로 사용해 살아 있는 환경을 파괴하는 상황을 막기 위한 안전장치다. 서로 **충돌**하므로 둘 중 하나만 쓴다.

```terraform
provider "aws" {
  region              = "ap-northeast-2"
  allowed_account_ids = ["123456789012"]
}
```

이렇게 해 두면 다른 계정 자격증명으로 plan을 돌릴 때 provider 설정 단계에서 거부된다. 코드가 계정과 묶이므로 스테이징 디렉터리에 프로덕션 프로파일이 새어 들어오는 사고가 원천적으로 막힌다. 반대로 `forbidden_account_ids` 에 프로덕션 계정을 넣어 두는 방식도 쓴다.

### provider는 계정 ID를 어떻게 알아내는가

두 인수 중 하나라도 쓰면 Terraform은 실제 계정 ID를 알아내야 하고, 그 방법은 인증 방식에 따라 다르다.

- **IAM Instance Profile이 붙은 EC2 인스턴스** — 언제나 메타데이터 API를 쓴다.
- **그 밖의 모든 방식**(환경변수, shared credentials 파일 등) — 다음 세 가지를 이 순서로 시도한다.
  1. `iam:GetUser` — 주로 IAM User에 유용하다. 각 사용자가 **자기 자신에 대해** `iam:GetUser` 를 호출할 권한을 가져야 한다는 뜻이기도 하다.
  2. `sts:GetCallerIdentity` — IAM User와 federated IAM Role **양쪽 모두**에서 동작한다.
  3. `iam:ListRoles` — `iam:GetUser` 를 쓸 수 없는 IdP 연동 프로파일에 특히 유용하다. 각 federated 사용자가 `iam:ListRoles` 를 허용하는 IAM role을 **assume하고 있어야** 한다는 뜻이다.

여기서 중요한 결론이 나온다. `allowed_account_ids` 를 켜면 **추가 권한이 필요할 수 있다.** 최소 권한으로 role을 좁게 만든 환경에서 이 인수를 켰다가 `AccessDenied` 를 만나는 일이 흔하다. 대부분 `sts:GetCallerIdentity` 하나만 열어 주면 해결된다.

계정 ID를 코드 안에서 값으로 써야 한다면 `data "aws_caller_identity" "current" {}` 를 두고 `data.aws_caller_identity.current.account_id` 를 참조한다.

## AWS Configuration Reference — 설정 · 환경변수 · shared config 대조

같은 설정을 세 경로로 줄 수 있다는 것이 provider 설정의 핵심 구조다. 인증에 직접 관련된 것부터 본다.

| 설정 | provider 인수 | 환경변수 | shared config |
|---|---|---|---|
| Access Key ID | `access_key` | `AWS_ACCESS_KEY_ID` | `aws_access_key_id` |
| Secret Access Key | `secret_key` | `AWS_SECRET_ACCESS_KEY` | `aws_secret_access_key` |
| Session Token | `token` | `AWS_SESSION_TOKEN` | `aws_session_token` |
| Region | `region` | `AWS_REGION` 또는 `AWS_DEFAULT_REGION` | `region` |
| Profile | `profile` | `AWS_PROFILE` 또는 `AWS_DEFAULT_PROFILE` | N/A |
| Shared Config Files | `shared_config_files` | `AWS_CONFIG_FILE` | N/A |
| Shared Credentials Files | `shared_credentials_files` | `AWS_SHARED_CREDENTIALS_FILE` | N/A |

동작 방식에 관한 것들도 같은 구조를 따른다.

| 설정 | provider 인수 | 환경변수 | shared config |
|---|---|---|---|
| Custom CA Bundle | `custom_ca_bundle` | `AWS_CA_BUNDLE` | `ca_bundle` |
| EC2 IMDS Endpoint | `ec2_metadata_service_endpoint` | `AWS_EC2_METADATA_SERVICE_ENDPOINT` | N/A |
| EC2 IMDS Endpoint Mode | `ec2_metadata_service_endpoint_mode` | `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` | N/A |
| Disable EC2 IMDS | `skip_metadata_api_check` | `AWS_EC2_METADATA_DISABLED` | N/A |
| Max Retries | `max_retries` | `AWS_MAX_ATTEMPTS` | `max_attempts` |
| Retry Mode | `retry_mode` | `AWS_RETRY_MODE` | `retry_mode` |
| HTTP / HTTPS Proxy | `http_proxy` / `https_proxy` | `HTTP_PROXY` / `HTTPS_PROXY` | N/A |
| Use FIPS Endpoints | `use_fips_endpoint` | `AWS_USE_FIPS_ENDPOINT` | `use_fips_endpoint` |
| Use DualStack Endpoints | `use_dualstack_endpoint` | `AWS_USE_DUALSTACK_ENDPOINT` | `use_dualstack_endpoint` |

주의할 점 셋. `custom_ca_bundle` 은 표에 shared config 열이 채워져 있지만 Argument Reference는 **shared config 파일의 `ca_bundle` 은 지원되지 않는다**고 명시한다. `max_retries` 의 기본값은 흔한 오해와 달리 **25** 다. 그리고 `assume_role` 에는 **환경변수가 지원되지 않는다** — provider 블록의 `assume_role` 블록이나 named profile을 써야 한다. 반면 `assume_role_with_web_identity` 는 `AWS_ROLE_ARN`, `AWS_ROLE_SESSION_NAME`, `AWS_WEB_IDENTITY_TOKEN_FILE` 을 지원한다. 전체 목록은 [부록 A](../appendix/a-provider-arguments.md)와 [부록 B](../appendix/b-environment-variables.md)에 있다.

## 여러 provider 인스턴스와 alias

한 설정 안에서 서로 다른 provider 설정이 필요한 경우가 있다. 다른 계정, 다른 리전, 다른 role. 이때 쓰는 것이 `alias` 다.

```terraform
provider "aws" {
  region = "ap-northeast-2"
}

provider "aws" {
  alias  = "virginia"
  region = "us-east-1"
}

resource "aws_acm_certificate" "cloudfront" {
  provider = aws.virginia

  domain_name       = "example.com"
  validation_method = "DNS"
}
```

`alias` 가 없는 블록이 **기본(default) 인스턴스**이고, `provider` 메타 인수를 적지 않은 리소스는 전부 그것을 쓴다. alias가 붙은 인스턴스는 `provider = aws.virginia` 처럼 명시해야 쓰이며, 참조가 문자열이 아니라 `aws.virginia` 라는 점에 주의한다.

위 예시가 alias가 여전히 필요한 대표적인 경우다 — CloudFront에 붙일 ACM 인증서는 `us-east-1` 에 있어야 하는데 서비스 리전은 서울인 상황. v6에서는 이런 경우 상당수를 리소스의 `region` 인수로 해결할 수 있지만, **계정이나 role이 다르면** 여전히 provider 인스턴스를 나눠야 한다.

```terraform
provider "aws" {
  alias  = "audit"
  region = "ap-northeast-2"

  assume_role {
    role_arn = "arn:aws:iam::123456789012:role/TerraformAudit"
  }
}
```

`assume_role` 은 provider 블록의 파라미터로 주거나 named profile에 설정할 수 있고, provider 블록에서 설정하는 경우 **assume할 role을 순서대로 나열해 IAM Role Chaining**을 할 수 있다. 웹 아이덴티티 페더레이션과 OIDC를 이용한 role assume도 지원되며, 이쪽은 환경변수나 named profile로 설정한다. 멀티 계정 구성은 [25장](../level2-intermediate/25-multi-account.md)에서 본격적으로 다룬다.

모듈에 alias provider를 넘길 때는 `providers` 메타 인수를 쓴다([19장](../level2-intermediate/19-modules.md)).

## 흔한 실수

### ❌ 액세스 키를 `.tf` 파일에 적는다

```terraform
provider "aws" {
  region     = "ap-northeast-2"
  access_key = "AKIAIOSFODNN7EXAMPLE"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}
```

공식 문서가 경고하는 그 형태다. 저장소가 공개로 바뀌거나 포크가 하나 생기는 순간 유출된다. `.gitignore` 로 가리는 것도 답이 아니다 — 그 파일이 없으면 팀원이 apply를 못 한다.

```terraform
# ✅ 자격증명은 코드 밖에서 온다. region만 코드에 남긴다
provider "aws" {
  region              = "ap-northeast-2"
  allowed_account_ids = ["123456789012"]
}
```

### ❌ CI에서 region을 주지 않는다

로컬에서는 `~/.aws/config` 의 `region` 이 4단계에서 채워 주므로 잘 돌아간다. CI 러너에는 그 파일이 없다.

```terraform
provider "aws" {}
```

```console
$ terraform plan
Error: Missing region value
```

```terraform
# ✅ region은 코드나 CI 환경변수로 명시한다
provider "aws" {
  region = var.aws_region
}
```

`region` 은 시크릿이 아니므로 코드에 두어도 되고, 오히려 코드가 어느 리전을 향하는지 리뷰에서 보인다.

### ❌ IRSA를 붙였는데 예전 환경변수가 남아 있다

파드에 서비스 계정과 role을 붙여 놓고도 옛 권한으로 동작한다면, 십중팔구 파드 정의에 액세스 키 환경변수가 남아 있다.

```yaml
env:
  - name: AWS_ACCESS_KEY_ID
    valueFrom: { secretKeyRef: { name: aws-creds, key: id } }
  - name: AWS_SECRET_ACCESS_KEY
    valueFrom: { secretKeyRef: { name: aws-creds, key: secret } }
```

환경변수는 2단계, 컨테이너 자격증명은 5단계다. 2단계가 이긴다.

```yaml
# ✅ 키 환경변수를 제거하고 서비스 계정만 붙인다.
# AWS_ROLE_ARN과 AWS_WEB_IDENTITY_TOKEN_FILE은 Kubernetes가 자동으로 주입한다.
serviceAccountName: terraform-runner
```

### ❌ `skip_metadata_api_check` 를 이해 없이 켠다

LocalStack 예제를 복사하면서 딸려 오는 경우가 많다. `true` 로 두면 **메타데이터 API를 통한 인증 자체가 막히므로**, EC2나 EKS 노드 위에서 돌리는 파이프라인이라면 자격증명 공급원이 사라진다.

```terraform
provider "aws" {
  region                  = "ap-northeast-2"
  skip_metadata_api_check = true
}
```

```terraform
# ✅ 로컬 에뮬레이터 전용 설정은 그 환경에서만 켠다
provider "aws" {
  region                  = "ap-northeast-2"
  skip_metadata_api_check = var.use_local_endpoints
}
```

## 프로덕션 노트

- **자격증명 소스를 조직 표준으로 하나 정한다.** 로컬은 named profile + `credential_process`(사내 SSO), CI는 OIDC 또는 Task Role/IRSA 두 갈래로 못박으면 "왜 나만 안 되지"의 대부분이 사라진다. 장기 액세스 키는 예외 승인 대상으로 취급한다.

- **`allowed_account_ids` 는 계정마다 다른 값이므로 변수로 뺀다.** 환경별 tfvars에 계정 ID를 두면 잘못된 tfvars로 실행할 때도 걸린다. 이 인수를 켜면 `sts:GetCallerIdentity` 권한이 필요하다는 점을 role 정책에 반영한다.

- **환경변수는 셸에 남는다.** 로컬에서 `export AWS_PROFILE=prod` 를 하고 잊는 것이 사고의 시작이다. 프롬프트에 현재 프로파일과 계정을 표시하는 셸 설정을 팀에 배포하는 것이 값싼 방어다.

- **`custom_ca_bundle` 은 사내 프록시 환경에서 필수가 된다.** TLS를 가로채는 프록시 뒤에서는 `x509: certificate signed by unknown authority` 가 나오므로 `AWS_CA_BUNDLE` 로 사내 CA를 주입한다. shared config의 `ca_bundle` 은 지원되지 않는다.

- **provider 인스턴스는 공짜가 아니다.** 각 provider 설정은 메모리와 연산 자원 측면에서 오버헤드를 만든다. 리전만 다른 경우라면 v6의 리소스 `region` 인수를 먼저 검토하고, 계정·role이 다를 때만 인스턴스를 늘린다.

## 연습문제

**1. 우선순위를 손으로 확인하기**
`~/.aws/credentials` 에 프로파일 두 개를 만들고, 서로 다른 계정을 가리키게 한다. `provider "aws" {}` 만 둔 설정에서 (a) 아무 환경변수 없이, (b) `AWS_PROFILE` 만 설정하고, (c) `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` 까지 설정하고 각각 `terraform plan` 을 실행한다.
*성공 기준:* `data.aws_caller_identity` 출력으로 세 경우가 각각 어느 계정으로 인증됐는지 보이고, 그 결과가 6단계 순서와 일치함을 설명할 수 있다.

**2. `allowed_account_ids` 를 발동시키기**
`allowed_account_ids` 에 **의도적으로 틀린** 계정 ID를 넣고 `terraform plan` 을 실행한다.
*성공 기준:* plan이 리소스 계획을 만들기 전에 계정 불일치로 실패한다. 이어서 role에서 `sts:GetCallerIdentity` 권한을 뺐을 때 어떤 에러가 나는지 관찰하고, 문서가 말하는 세 가지 조회 경로 중 어디에서 막혔는지 추정한다.

**3. alias로 두 리전에 만들기**
기본 provider는 `ap-northeast-2`, alias `virginia` 는 `us-east-1` 로 두고 각각에 S3 버킷을 하나씩 만든다. 그다음 alias를 지우고 v6의 리소스 `region` 인수로 같은 결과를 만든다.
*성공 기준:* 두 방식 모두 버킷이 의도한 리전에 생성된다. `terraform state list` 와 콘솔에서 확인하고, 두 방식의 차이를 세 줄로 정리한다.

## 요약

- `required_providers` 는 `init` 이 읽는 "무엇을 받을지", `provider` 블록은 plan/apply가 읽는 "어떻게 설정할지"다. root module에만 둔다.
- 설정 소스의 우선순위는 (1) provider 설정 파라미터 (2) 환경 변수 (3) shared credentials 파일 (4) shared configuration 파일 (5) 컨테이너 자격증명 (6) 인스턴스 프로파일 자격증명과 Region 이며, AWS CLI 및 AWS SDK for Go v2와 같은 순서다.
- 자격증명 환경변수는 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, Region은 `AWS_REGION` 또는 `AWS_DEFAULT_REGION`, 그 밖에 `AWS_PROFILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE` 이 있다.
- shared 파일 기본 경로는 Linux·macOS에서 `$HOME/.aws/config` 와 `$HOME/.aws/credentials`, Windows에서 `%USERPROFILE%\.aws\` 아래다. 프로파일을 지정하지 않으면 `default` 가 쓰이고, 경로는 `shared_config_files` / `shared_credentials_files` 로 바꾼다. `credential_process` 는 named profile에 설정해야 한다.
- 컨테이너 자격증명은 `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` / `_FULL_URI`(ECS·CodeBuild)와 `AWS_ROLE_ARN` / `AWS_WEB_IDENTITY_TOKEN_FILE`(EKS IRSA)에 기반하며, 5단계이므로 남아 있는 키 환경변수가 있으면 그쪽이 이긴다.
- IMDS v1과 v2 모두 지원된다. 엔드포인트는 `ec2_metadata_service_endpoint`, 모드는 `ec2_metadata_service_endpoint_mode`(`IPv4`/`IPv6`), 비활성화는 `skip_metadata_api_check` 다.
- Region은 반드시 설정돼야 하며 provider 인수 · 환경변수 · shared config · IMDS 넷 중 하나에서 온다. v6부터는 대부분의 리소스에 top-level `region` 인수가 있어 리소스 단위로 덮어쓸 수 있고, 값을 바꾸면 리소스가 교체된다.
- `allowed_account_ids` 와 `forbidden_account_ids` 는 서로 충돌한다. 계정 ID 확인에는 EC2 인스턴스 프로파일이면 메타데이터 API가, 그 밖에는 `iam:GetUser` -> `sts:GetCallerIdentity` -> `iam:ListRoles` 순서가 쓰인다.
- `alias` 로 provider 인스턴스를 여러 개 두고 `provider = aws.<alias>` 로 지정한다. `assume_role` 은 환경변수를 지원하지 않으며 provider 블록이나 named profile로 설정하고, 순서대로 나열하면 role chaining이 된다. 하드코딩된 자격증명은 어떤 Terraform 설정에서도 권장되지 않으며, `token` 은 세션 토큰이지 6자리 MFA 코드가 아니다.

## 다음으로

- [5장 — 첫 리소스: aws_vpc와 aws_subnet 해부](05-first-resource-vpc.md) — 설정이 끝났으니 실제 리소스로.
- [10장 — 태그 기초](10-tags-basics.md) — provider 블록의 `default_tags` 와 `ignore_tags`.
- [24장 — Enhanced Region Support](../level2-intermediate/24-enhanced-region-support.md) — 리소스별 `region` 인수의 전모.
- [25장 — 멀티 계정](../level2-intermediate/25-multi-account.md) — `assume_role`, 롤 체이닝, OIDC.
- AWS Provider 공식 문서: <https://registry.terraform.io/providers/hashicorp/aws/latest/docs>
