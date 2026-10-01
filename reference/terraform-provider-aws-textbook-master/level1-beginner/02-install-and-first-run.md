---
chapter: 2
level: "Level 1 — 초급"
title: "설치와 첫 실행: init · plan · apply · destroy"
difficulty: 입문
reading_time: "28분"
prerequisites: [1]
source_docs:
  - "website/docs/index.html.markdown"
  - "website/docs/r/vpc.html.markdown"
  - "website/docs/guides/version-6-upgrade.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 2장 — 설치와 첫 실행: init · plan · apply · destroy

**이 장에서 배우는 것**

- Terraform CLI와 AWS 자격증명을 준비하고, 자격증명이 실제로 통하는지 apply 전에 확인할 수 있다.
- `terraform init` 이 만들어 내는 `.terraform/` 과 `.terraform.lock.hcl` 이 각각 무엇이고, 왜 하나만 커밋해야 하는지 설명할 수 있다.
- plan 출력의 `+`, `-`, `~`, `-/+` 기호를 읽고 "무엇이 지워지는가"를 apply 전에 판정할 수 있다.
- `terraform plan -out` 으로 계획을 파일로 굳혀 apply에 넘기는 절차를 쓰고, CI에서 왜 이것이 선택이 아닌 필수인지 말할 수 있다.
- `aws_vpc` 하나를 만들고 지우는 전 과정을 손으로 완주할 수 있다.

**왜 중요한가**

Terraform으로 인프라를 날리는 사고는 대부분 apply 단계가 아니라 **plan을 읽지 않은 단계**에서 시작된다. 화면에 `Plan: 3 to add, 1 to change, 2 to destroy.` 라고 떠 있는데 `yes` 를 치는 순간, 그 "2 to destroy"가 프로덕션 RDS 인스턴스였다는 사실은 apply가 끝난 뒤에야 알게 된다. plan은 실행 전에 결과를 보여 주는 유일한 창구이고, 그 창구를 읽는 능력이 Terraform 사용자의 첫 번째 기술이다.

두 번째로 흔한 사고는 lock 파일을 둘러싼 것이다. `.terraform.lock.hcl` 을 `.gitignore` 에 넣어 두면 팀원마다 다른 provider 버전이 설치된다. A는 6.2.0으로 plan을 돌려 "변경 없음"을 보고, B는 6.14.0으로 같은 코드에 plan을 돌려 "12개 변경"을 본다. 둘 다 자기 화면이 맞다고 믿고, 원인을 찾는 데 이틀이 든다. 반대로 `.terraform/` 디렉터리를 커밋해 버리면 수백 MB짜리 바이너리가 저장소에 들어가 clone이 몇 분씩 걸린다. 무엇을 커밋하고 무엇을 무시할지는 취향이 아니라 정해진 답이 있는 문제다.

세 번째는 CI에서 벌어진다. 파이프라인이 PR에 plan을 남기고 승인 후 `terraform apply -auto-approve` 를 다시 실행하도록 짜여 있다면, 두 시점 사이에 누군가 콘솔에서 뭔가를 바꿨거나 다른 PR이 머지됐을 때 **리뷰어가 승인한 것과 실제로 적용되는 것이 달라진다.** `-out` 으로 계획을 파일에 굳혀 그 파일을 apply에 넘기는 것이 이 간극을 없애는 방법이다.

## Terraform CLI 설치와 확인

Terraform CLI는 Go로 빌드된 단일 실행 파일이다. 설치 방법은 여러 가지지만 확인 절차는 같다.

```console
$ terraform version
Terraform v1.14.0
on darwin_arm64
```

`terraform` 만 치면 하위 명령이 나열된다. 자주 쓰는 것은 `init`, `plan`, `apply`, `destroy`, `fmt`, `validate`, `show`, `state`, `output` 정도이고 이 장에서 앞의 여섯 개를 다룬다.

버전 선택에도 기준이 있다. 1장에서 본 대로 Terraform의 **언어 기능**은 CLI 쪽에 있다. `identity` 를 쓰는 `import` 블록은 v1.12.0 이상, `list` 블록을 이용한 리소스 쿼리는 1.14 이상이 필요하다. 팀에서 쓸 최소 버전을 정했으면 설정에 못박아 둔다.

```terraform
terraform {
  required_version = ">= 1.12"
}
```

이렇게 해 두면 낮은 버전의 CLI로 실행할 때 애매한 문법 오류 대신 `Unsupported Terraform Core version` 이라는 명확한 에러가 나온다.

## AWS 자격증명 준비

provider는 자격증명을 여러 소스에서 찾는다. 공식 문서가 명시하는 우선순위는 다음 순서다.

1. provider 설정 블록의 파라미터
2. 환경 변수
3. shared credentials 파일
4. shared configuration 파일
5. 컨테이너 자격증명
6. 인스턴스 프로파일 자격증명과 Region

이 순서는 AWS CLI 및 AWS SDK for Go v2의 우선순위와 같다. 각 단계의 세부는 [4장](04-provider-block-and-auth.md)에서 다루고, 여기서는 첫 실습에 필요한 최소한만 본다.

로컬 학습에서 가장 흔한 방식은 shared configuration 파일이다. AWS CLI를 설치하고 `aws configure` 를 돌리면 리눅스·macOS 기준 `$HOME/.aws/config` 와 `$HOME/.aws/credentials` 가 만들어진다(Windows는 `%USERPROFILE%\.aws\` 아래). 프로파일을 지정하지 않으면 `default` 가 쓰인다.

환경 변수로 줄 수도 있다. `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, 필요하면 `AWS_SESSION_TOKEN` 이고, Region은 `AWS_REGION` 또는 `AWS_DEFAULT_REGION` 이다. 특정 프로파일을 고르려면 `AWS_PROFILE` 을 쓴다.

```console
$ export AWS_PROFILE="sandbox"
$ export AWS_REGION="ap-northeast-2"
```

**apply를 돌리기 전에 자격증명이 실제로 통하는지 확인하는 습관을 들이는 것이 좋다.** AWS CLI로 한 줄이면 된다.

```console
$ aws sts get-caller-identity
{
    "UserId": "AIDAEXAMPLEUSERID",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/dev-kim"
}
```

여기서 나온 계정 ID가 내가 만들려는 계정인지 눈으로 확인한다. 학습용 리소스를 프로덕션 계정에 만들어 놓고 몇 달 뒤에 발견하는 일이 실제로 일어난다.

절대 하지 말아야 할 것 하나. 액세스 키를 `.tf` 파일에 직접 쓰지 않는다. 공식 문서도 하드코딩된 자격증명이 어떤 Terraform 설정에서도 권장되지 않으며, 공개 저장소에 커밋될 경우 시크릿 유출 위험이 있다고 경고한다.

## 첫 디렉터리와 main.tf

Terraform은 **디렉터리 단위**로 동작한다. 명령을 실행한 디렉터리의 `.tf` 파일들이 하나의 설정(root module)을 이룬다. 하위 디렉터리는 자동으로 포함되지 않는다.

```console
$ mkdir tf-first && cd tf-first
```

`main.tf` 하나를 만든다.

```terraform
terraform {
  required_version = ">= 1.12"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-2"
}

resource "aws_vpc" "first" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = {
    Name = "tf-first"
  }
}
```

`aws_vpc` 를 첫 실습 대상으로 고른 이유가 있다. 비용이 들지 않고, 생성이 빠르고, 다른 리소스에 의존하지 않는다. `enable_dns_hostnames` 를 명시한 것은 1장에서 본 비대칭 때문이다 — `enable_dns_support` 의 기본값은 true이지만 `enable_dns_hostnames` 의 기본값은 false다.

## terraform init이 실제로 하는 일

```console
$ terraform init

Initializing the backend...

Initializing provider plugins...
- Finding hashicorp/aws versions matching "~> 6.0"...
- Installing hashicorp/aws v6.14.1...
- Installed hashicorp/aws v6.14.1 (signed by HashiCorp)

Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!
```

init은 네 가지 일을 한다.

**1. 백엔드 초기화.** state를 어디에 둘지 정한다. 지금은 `backend` 블록이 없으므로 로컬 파일(`terraform.tfstate`)이 쓰인다. 팀으로 넘어가면 S3 같은 원격 백엔드로 바꾸게 되고, 그 이야기는 [16장 — 원격 State와 백엔드](../level2-intermediate/16-remote-state-and-backends.md)에서 다룬다.

**2. provider 다운로드.** 제약(`~> 6.0`)을 만족하는 최신 버전을 Registry에서 찾아 내려받는다. 1장에서 본 대로 별도 실행 파일이며 `.terraform/providers/.../hashicorp/aws/<버전>/<플랫폼>/` 아래에 놓인다.

**3. 모듈 설치.** `module` 블록이 있으면 소스에서 가져와 `.terraform/modules/` 에 둔다.

**4. lock 파일 작성.** 실제로 고른 버전과 체크섬을 `.terraform.lock.hcl` 에 기록한다.

### .terraform/ 은 캐시다

`.terraform/` 은 **재생성 가능한 산출물**이다. 지워도 `terraform init` 을 다시 돌리면 복구된다. AWS provider 바이너리는 수백 MB 규모이므로 이것을 Git에 커밋하면 저장소가 감당하지 못한다. `.gitignore` 에 반드시 넣는다.

### .terraform.lock.hcl 은 커밋한다

lock 파일은 캐시가 아니라 **결정 기록**이다. 안을 열어 보면 이런 모양이다.

```hcl
provider "registry.terraform.io/hashicorp/aws" {
  version     = "6.14.1"
  constraints = "~> 6.0"
  hashes = [
    "h1:EXAMPLEHASHVALUE0000000000000000000000000000=",
    # ... 플랫폼별 해시가 이어진다 ...
  ]
}
```

`version` 은 이번에 고른 버전, `constraints` 는 설정에 적힌 제약, `hashes` 는 무결성 검증용 체크섬이다.

이 파일이 커밋돼 있으면 팀원 누가 언제 `terraform init` 을 돌려도 **같은 6.14.1이 설치된다.** 제약이 `~> 6.0` 이라 6.15가 나와 있어도 lock 파일에 적힌 버전을 우선한다. "내 로컬에서는 plan이 깨끗한데 CI에서는 diff가 뜬다" 같은 유령 현상이 여기서 사라진다. `hashes` 는 공급망 방어 장치이기도 하다 — 내려받은 바이너리의 체크섬이 lock 파일과 다르면 init이 실패한다.

lock 파일이 갱신되는 경우는 두 가지다. `required_providers` 의 제약을 바꿨을 때, 그리고 `terraform init -upgrade` 를 명시적으로 실행했을 때. 둘 다 의도적 행위이므로, lock 파일 변경 자체가 리뷰 대상이 되어야 한다.

## terraform plan 읽는 법

```console
$ terraform plan

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_vpc.first will be created
  + resource "aws_vpc" "first" {
      + arn                       = (known after apply)
      + cidr_block                = "10.0.0.0/16"
      + default_security_group_id = (known after apply)
      + enable_dns_hostnames      = true
      + enable_dns_support        = true
      + id                        = (known after apply)
      + instance_tenancy          = "default"
      + main_route_table_id       = (known after apply)
      + owner_id                  = (known after apply)
      + region                    = "ap-northeast-2"
      + tags                      = {
          + "Name" = "tf-first"
        }
      + tags_all                  = {
          + "Name" = "tf-first"
        }
    }

Plan: 1 to add, 0 to change, 0 to destroy.
```

읽을 때 순서가 있다.

**맨 아래 한 줄부터 본다.** `Plan: 1 to add, 0 to change, 0 to destroy.` `to destroy` 가 0이 아니면 그 위를 반드시 다 읽는다. 이 숫자를 먼저 보는 습관이 사고를 막는다.

**그다음 기호를 본다.** 각 리소스 앞에 붙는 기호는 네 가지다.

| 기호 | 의미 | 위험도 |
|---|---|---|
| `+` | 새로 생성 | 낮음 |
| `~` | 기존 리소스를 그 자리에서 수정(in-place) | 낮음~중간 |
| `-` | 삭제 | 높음 |
| `-/+` | 삭제한 뒤 새로 생성(교체) | **가장 높음** |

`-/+` 가 가장 중요하다. 겉보기에는 "값 하나 바꾸기"인데 실제로는 리소스가 사라졌다가 새로 생긴다. RDS 인스턴스라면 데이터가, EC2 인스턴스라면 로컬 디스크가, EIP라면 IP 주소가 바뀐다. plan은 왜 교체되는지도 알려 준다.

```console
  # aws_security_group.web must be replaced
-/+ resource "aws_security_group" "web" {
      ~ description = "web" -> "web tier" # forces replacement
      ~ id          = "sg-0123456789abcdef0" -> (known after apply)
        name        = "web"
    }
```

`# forces replacement` 주석이 붙은 줄이 범인이다. 여기서는 `description` 인데, `aws_security_group` 문서에 `(Optional, Forces new resource)` 로 표시된 인수다. AWS에 `GroupDescription` 을 수정하는 API가 없기 때문이다.

`lifecycle` 에 `create_before_destroy = true` 를 걸어 둔 리소스는 기호가 `+/-` 로 뒤집혀 나온다 — 먼저 만들고 나중에 지운다는 뜻이다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md)).

**`(known after apply)` 는 정상이다.** AWS가 만들어 준 뒤에야 알 수 있는 값(ID, ARN 등)이라는 표시다. 다만 이 값이 다른 리소스의 인수로 흘러 들어가면 그 리소스의 plan도 일부가 미확정으로 나온다.

**plan은 미래를 보장하지 않는다.** plan 이후 apply 이전에 누군가 콘솔에서 뭔가를 바꾸면 apply 결과는 plan과 달라진다. plan은 "지금 이 순간의 실제 상태 + 설정"으로 계산한 예측이다. 이 간극을 줄이는 장치가 뒤에 나올 `-out` 이다.

또 하나. plan을 돌리면 Terraform은 먼저 state에 적힌 리소스들의 현재 상태를 AWS에서 읽어 온다. 그래서 리소스가 많으면 plan이 느리다 — 계산이 아니라 API 호출 때문이다. 이 조회를 건너뛰는 `-refresh=false` 가 있지만 드리프트를 못 보게 되므로 일상적으로 쓸 것은 아니다([36장](../level3-advanced/36-drift-refresh-and-checks.md)).

## terraform apply와 승인

```console
$ terraform apply

  # ... plan과 동일한 출력 ...

Plan: 1 to add, 0 to change, 0 to destroy.

Do you want to perform these actions?
  Terraform will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value: yes

aws_vpc.first: Creating...
aws_vpc.first: Creation complete after 3s [id=vpc-0a1b2c3d4e5f67890]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
```

인수 없이 `apply` 를 실행하면 plan을 새로 계산해 보여 주고 승인을 묻는다. `yes` 외의 입력은 모두 취소다. `y` 도 안 된다. `-auto-approve` 를 붙이면 이 확인을 건너뛴다. 로컬 학습에서는 편하지만 사람이 보는 환경에서 습관적으로 붙이는 것은 위험하고, CI에서는 뒤에 설명할 plan 파일 방식이 낫다.

apply가 끝나면 디렉터리에 `terraform.tfstate` 가 생긴다. Terraform이 "내가 만든 것"을 기억하는 파일이다([9장 — State 입문](09-state-basics.md)). 지금 알아야 할 것은 둘이다 — **이 파일을 잃으면 Terraform은 자기가 만든 리소스를 잊는다**는 것, 그리고 **모든 속성값이 들어 있어 민감 정보가 포함될 수 있다**는 것.

```console
$ terraform state list
aws_vpc.first
```

`terraform state list` 는 관리 중인 리소스 주소 목록을, `terraform show` 는 state에 기록된 전체 내용을 보여 준다.

## terraform destroy

```console
$ terraform destroy

  # aws_vpc.first will be destroyed
  - resource "aws_vpc" "first" {
      - cidr_block           = "10.0.0.0/16" -> null
      - enable_dns_hostnames = true -> null
      # ... 나머지 속성 ...
    }

Plan: 0 to add, 0 to change, 1 to destroy.

Do you really want to destroy all resources?
  Enter a value: yes

aws_vpc.first: Destroying... [id=vpc-0a1b2c3d4e5f67890]
aws_vpc.first: Destruction complete after 1s

Destroy complete! Resources: 1 destroyed.
```

`destroy` 는 **현재 설정이 관리하는 모든 리소스**를 지운다. 삭제 순서는 의존성의 역순으로 Terraform이 정한다. subnet을 지우기 전에 VPC를 지우려 하지 않는다.

학습용 디렉터리에서는 실습이 끝날 때마다 destroy를 돌리는 습관이 돈을 아껴 준다. NAT gateway나 RDS 인스턴스를 켜 둔 채 잊으면 며칠 만에 청구서가 늘어난다. 반면 프로덕션 설정에서는 이 명령 자체를 CI가 제공하지 않게 하고, 개별 리소스에는 `lifecycle { prevent_destroy = true }` 같은 방어벽을 세운다.

## fmt와 validate

`terraform fmt` 는 HCL 코드를 표준 스타일로 정렬한다. 들여쓰기와 `=` 정렬을 손으로 맞출 필요가 없어진다.

```console
$ terraform fmt -recursive     # 하위 디렉터리까지 정렬
$ terraform fmt -check -diff   # 고치지 않고 검사만 (CI용)
```

`-check` 는 포맷이 어긋난 파일이 있으면 0이 아닌 종료 코드를 낸다. CI에 이 한 줄을 넣어 두면 포맷 관련 리뷰 코멘트가 영구히 사라진다.

`terraform validate` 는 문법과 스키마를 검사한다. AWS API를 호출하지 않으므로 자격증명 없이도 실행되고 빠르다.

```console
$ terraform validate
Success! The configuration is valid.
```

validate가 잡는 것은 존재하지 않는 인수, 타입 불일치, 참조 오류다. 잡지 못하는 것도 분명하다 — CIDR이 겹치는지, 그 AMI ID가 실제로 존재하는지, IAM 권한이 있는지는 알 수 없다. **validate 통과는 "AWS에 요청을 보낼 수 있는 형태"라는 뜻이지 "성공한다"는 뜻이 아니다.** 또 `validate` 는 provider 스키마를 알아야 하므로 `init` 이 끝난 뒤에만 동작한다.

## init -upgrade와 버전 올리기

lock 파일이 있으면 `terraform init` 은 거기 적힌 버전을 고수한다. 새 버전을 받으려면 명시적으로 요청해야 한다.

```console
$ terraform init -upgrade
- Finding hashicorp/aws versions matching "~> 6.0"...
- Installing hashicorp/aws v6.15.0...
```

`-upgrade` 는 `required_providers` 의 제약 **안에서만** 올린다. 제약이 `~> 6.0` 이면 7.x는 오지 않는다. 메이저 업그레이드를 하려면 제약 자체를 바꿔야 하고, 그건 업그레이드 가이드를 읽고 할 일이다. v6 가이드는 "먼저 최신 5.x에서 plan이 오류와 예상치 못한 변경 없이 통과하는지, 관련 deprecation 경고가 없는지 확인한 뒤 제약을 6.x로 올리고 `terraform init -upgrade` 를 실행하라"는 순서를 제시한다.

`-upgrade` 를 돌린 직후에는 반드시 plan을 확인한다. 코드를 한 줄도 안 바꿨는데 diff가 뜬다면 provider 동작이 바뀐 것이고, 그 diff를 이해하기 전에는 apply하지 않는다.

## plan 파일 저장(-out)과 CI

지금까지는 plan과 apply를 따로 실행했다. 문제는 **apply가 plan을 다시 계산한다**는 것이다. 두 시점 사이에 세상이 달라졌다면 승인한 것과 실행되는 것이 달라진다. `-out` 은 계획을 파일로 굳힌다.

```console
$ terraform plan -out=tfplan
$ terraform apply tfplan
```

`apply` 에 plan 파일을 넘기면 Terraform은 **재계산하지 않고** 그 파일에 적힌 동작만 실행한다. 승인 프롬프트도 뜨지 않는다 — 계획을 만들 때 이미 검토했다고 보기 때문이다. 그리고 파일이 만들어진 뒤 실제 인프라가 바뀌어 계획이 유효하지 않게 되면, apply는 조용히 진행하는 대신 **에러를 내며 멈춘다.** 이것이 이 방식의 핵심 가치다.

CI 파이프라인은 대개 이렇게 구성한다.

```console
# PR 단계
$ terraform init -input=false
$ terraform validate
$ terraform plan -input=false -out=tfplan
$ terraform show -no-color tfplan > plan.txt   # PR에 코멘트로 첨부

# 머지 후 apply 단계 (같은 tfplan 파일을 아티팩트로 전달받음)
$ terraform apply -input=false tfplan
```

`-input=false` 는 값이 없을 때 사람에게 묻지 않고 실패하게 만든다. CI에서 프롬프트가 뜨면 파이프라인이 영원히 멈추므로 필수다.

경고가 하나 있다. **plan 파일에는 변경될 값이 그대로 들어 있고 민감한 값도 포함된다.** 화면에서 `(sensitive value)` 로 가려지는 값도 파일 안에는 있다. 공개 아티팩트 저장소에 올리거나 오래 보관하면 안 되고, CI 잡 사이에만 전달하고 즉시 폐기하는 것이 원칙이다.

`terraform show -json tfplan` 으로 계획을 JSON으로 뽑아 정책 검사 도구에 물리면 "destroy가 포함되면 파이프라인을 멈춘다" 같은 가드레일을 만들 수 있다([38장](../level3-advanced/38-large-scale-structure-cicd.md)).

## .gitignore에 무엇을 넣는가

```gitignore
# 재생성 가능한 캐시 — 무시한다
.terraform/

# state와 백업 — 무시한다 (원격 백엔드를 쓰더라도)
*.tfstate
*.tfstate.*

# 로컬 변수 파일 — 값이 환경마다 다르고 시크릿이 들어가기 쉽다
*.auto.tfvars
terraform.tfvars

# plan 파일 — 민감값을 포함한다
*.tfplan
tfplan

# crash 로그
crash.log
crash.*.log
```

여기에 **`.terraform.lock.hcl` 은 들어가지 않는다.** init 출력 자체가 "이 파일을 버전 관리 저장소에 포함하라"고 안내한다.

`*.tfstate` 를 무시하는 이유는 둘이다. 첫째, state에는 모든 리소스 속성이 평문으로 들어 있어 시크릿이 섞일 수 있다. 둘째, 여러 사람이 각자 state를 커밋하면 Git으로는 해결할 수 없는 머지 충돌이 난다. 팀 작업에서는 애초에 원격 백엔드를 쓴다.

`terraform.tfvars` 를 무시할지는 팀 정책에 따라 갈린다. 시크릿이 없다면 커밋하는 편이 재현성에 낫다. 다만 한번 시크릿이 들어가면 Git 히스토리에서 지우기 어려우므로, 기본은 무시로 두고 필요할 때 예외를 두는 쪽이 안전하다.

## 흔한 실수

### ❌ lock 파일을 gitignore에 넣기

"자동 생성 파일이니까"라며 무시 목록에 넣는 경우가 많다. 그 순간 팀원마다 다른 provider 버전이 설치되고, 같은 코드가 사람에 따라 다른 plan을 만든다.

```gitignore
.terraform/
.terraform.lock.hcl
*.tfstate
```

```gitignore
# ✅ lock 파일은 커밋한다. 캐시(.terraform/)와 state만 무시한다
.terraform/
*.tfstate
*.tfstate.*
```

CI에 검사도 걸어 둔다. `terraform init` 후 lock 파일이 변경됐다면 누군가 커밋을 빠뜨린 것이다.

```console
$ terraform init -input=false
$ git diff --exit-code .terraform.lock.hcl
```

### ❌ plan 출력의 요약 줄만 보고 apply하기

`Plan: 2 to add, 1 to change, 1 to destroy.` 를 보고 "1개쯤이야" 하고 넘어가는 경우다. 그 1개가 무엇인지, `to change` 중에 `-/+` 교체가 섞여 있지 않은지 확인해야 한다.

```console
$ terraform apply
# ... 요약 줄만 흘끗 보고 ...
  Enter a value: yes
```

```console
# ✅ 삭제·교체 대상을 먼저 뽑아 눈으로 확인한 뒤 apply한다
$ terraform plan -out=tfplan
$ terraform show -no-color tfplan | grep -E "will be destroyed|must be replaced|forces replacement"
  # aws_security_group.web must be replaced
      ~ description = "web" -> "web tier" # forces replacement

$ terraform apply tfplan
```

### ❌ CI에서 plan과 apply를 각각 계산하기

리뷰어가 본 계획과 실제 적용되는 계획이 달라진다. 두 단계 사이에 다른 PR이 머지되면 조용히 다른 일이 벌어진다.

```console
# PR 단계
$ terraform plan
# 머지 후 apply 단계 — plan을 다시 계산한다
$ terraform apply -auto-approve
```

```console
# ✅ 계획을 파일로 굳혀 아티팩트로 넘긴다. 상황이 달라졌으면 apply가 실패한다
# PR 단계
$ terraform plan -input=false -out=tfplan
# apply 단계
$ terraform apply -input=false tfplan
```

### ❌ init 없이 validate를 돌리고 "설정이 잘못됐다"고 판단하기

`validate` 는 provider 스키마를 필요로 한다. init 전에는 인수 검사를 할 수 없다.

```console
$ terraform validate
╷
│ Error: Missing required provider
│ ...
│ Please run "terraform init".
╵
```

```console
# ✅ init을 먼저. CI에서는 -input=false로 프롬프트를 막는다
$ terraform init -input=false
$ terraform fmt -check -recursive
$ terraform validate
```

## 프로덕션 노트

- **`terraform init` 은 CI에서 매번 네트워크를 탄다.** 러너가 새로 뜰 때마다 수백 MB의 provider를 받으면 시간과 비용이 누적된다. `TF_PLUGIN_CACHE_DIR` 로 캐시를 재사용하거나 사내 미러를 두면 파이프라인 시간이 줄어든다. Registry 장애가 곧 배포 중단이라는 점도 리스크 목록에 넣어 둔다.

- **plan 파일은 시크릿 취급한다.** 화면에서 가려지는 값도 파일 안에는 평문으로 있다. CI 잡 사이 전달에만 쓰고, 아티팩트 보존 기간을 짧게 잡고, 공개 저장소에는 절대 올리지 않는다.

- **로컬 state는 학습용에서만 쓴다.** 두 명이 동시에 apply하면 서로의 state를 덮어쓴다. 원격 백엔드는 state 잠금(locking)으로 이 경합을 막는다. 두 번째 사람이 참여하는 시점이 백엔드를 옮길 시점이다.

- **`-auto-approve` 는 사람이 보는 환경에서 금지한다.** CI에서는 `-auto-approve` 대신 plan 파일을 넘기는 방식을 쓴다. 승인 절차가 파이프라인의 승인 게이트로 올라가고, 실행되는 내용은 파일로 고정된다.

- **destroy는 실수하기 쉬운 명령이다.** 잘못된 디렉터리에서 실행하는 사고가 실제로 일어난다. 프로덕션 워크스페이스에서는 CI가 `destroy` 잡을 아예 제공하지 않게 하고, 되돌릴 수 없는 리소스에는 `prevent_destroy` 를 건다.

- **apply가 실패해도 부분적으로 만들어진 것이 있다.** 리소스 10개 중 3개까지 만들고 실패하면 그 3개는 AWS에 남고 state에도 기록된다. 원인을 고쳐 다시 apply하면 나머지부터 이어서 만든다. "아무것도 안 만들어졌겠지" 하고 방치하면 비용이 샌다.

## 연습문제

**1. VPC 하나 만들고 지우기**
이 장의 `main.tf` 를 그대로 만들어 init -> plan -> apply -> destroy를 완주한다.
*성공 기준:* apply 후 `terraform state list` 에 `aws_vpc.first` 가 나오고, AWS 콘솔이나 `aws ec2 describe-vpcs` 로 실물이 확인된다. destroy 후 `terraform state list` 의 출력이 비고, 콘솔에서도 사라진다.

**2. lock 파일의 효과 관찰하기**
apply 후 `.terraform.lock.hcl` 의 `version` 값을 기록한다. `.terraform/` 디렉터리를 통째로 지우고 `terraform init` 을 다시 실행한다.
*성공 기준:* 제약이 `~> 6.0` 이고 더 최신 6.x가 Registry에 있음에도 처음과 **같은 버전**이 설치된다. 이어서 `terraform init -upgrade` 를 실행하면 버전이 올라가고 lock 파일의 `version` 과 `hashes` 가 바뀐다.

**3. 교체를 유발해 보기**
VPC 실습 후 `aws_security_group` 을 추가해 apply하고, `description` 값을 바꾼 뒤 plan을 돌린다.
*성공 기준:* plan 출력에 `must be replaced` 와 `# forces replacement` 가 나타나고, 요약 줄이 `1 to add, 0 to change, 1 to destroy` 형태가 된다. 어떤 인수가 교체를 유발했는지 지목할 수 있다.

**4. plan 파일이 무효화되는 순간 확인하기**
`terraform plan -out=tfplan` 으로 계획을 저장한 뒤, apply하기 전에 AWS 콘솔에서 해당 리소스의 태그를 수동으로 바꾼다. 그 상태에서 `terraform apply tfplan` 을 실행한다.
*성공 기준:* apply가 성공하지 않고 계획이 더 이상 유효하지 않다는 취지의 에러로 멈춘다. 이 동작이 왜 CI에서 중요한지 두 문장으로 설명할 수 있다.

## 요약

- Terraform은 디렉터리 단위로 동작한다. 그 디렉터리의 `.tf` 파일들이 하나의 설정을 이루며, 하위 디렉터리는 자동으로 포함되지 않는다.
- `terraform init` 은 백엔드 초기화, provider 다운로드, 모듈 설치, lock 파일 작성의 네 가지를 한다.
- `.terraform/` 은 재생성 가능한 캐시이므로 `.gitignore` 에 넣고, `.terraform.lock.hcl` 은 결정 기록이므로 **커밋한다.** lock 파일이 있으면 제약 안에 더 새 버전이 있어도 기록된 버전이 설치된다.
- plan 기호는 `+`(생성), `~`(in-place 수정), `-`(삭제), `-/+`(교체)다. `create_before_destroy` 가 걸린 리소스는 `+/-` 로 나온다. `# forces replacement` 주석이 붙은 줄이 교체를 유발한 인수다.
- plan은 맨 아래 `Plan: N to add, N to change, N to destroy.` 부터 읽는다. `to destroy` 가 0이 아니면 위를 전부 읽는다.
- `terraform apply` 는 인수 없이 실행하면 plan을 재계산하고 `yes` 입력을 요구한다. `terraform plan -out=tfplan` 후 `terraform apply tfplan` 은 재계산 없이 그 계획만 실행하고, 계획이 무효해졌으면 실패한다.
- plan 파일에는 민감한 값이 평문으로 들어 있다. CI 잡 사이 전달에만 쓰고 보관하지 않는다.
- `terraform fmt -check -recursive` 와 `terraform validate` 는 자격증명 없이 돌아가는 값싼 검사다. validate는 문법과 스키마만 보며, 권한이나 실제 값의 유효성은 검사하지 않는다.
- `terraform init -upgrade` 는 `required_providers` 의 제약 안에서만 버전을 올린다. 올린 직후에는 반드시 plan으로 diff를 확인한다.

## 다음으로

- [3장 — HCL 문법: 블록·인수·표현식·타입](03-hcl-basics.md) — 여기서 쓴 `terraform`, `provider`, `resource` 블록의 문법과 타입 시스템.
- [4장 — provider 블록과 자격증명: 6단계 우선순위](04-provider-block-and-auth.md) — 순서만 나열한 6단계를 하나씩 해부한다.
- [9장 — State 입문: Terraform이 기억하는 것](09-state-basics.md) — `terraform.tfstate` 의 정체.
- [16장 — 원격 State와 백엔드](../level2-intermediate/16-remote-state-and-backends.md) — 두 번째 사람이 합류하는 순간 필요한 것.
- AWS Provider 공식 문서: <https://registry.terraform.io/providers/hashicorp/aws/latest/docs>
