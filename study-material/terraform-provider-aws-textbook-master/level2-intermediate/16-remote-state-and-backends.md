---
chapter: 16
level: "Level 2 — 중급"
title: "원격 State와 백엔드: 팀으로 넘어가는 순간"
difficulty: 중급
reading_time: "32분"
prerequisites: [9]
source_docs:
  - "website/docs/r/s3_bucket.html.markdown"
  - "website/docs/r/s3_bucket_versioning.html.markdown"
  - "website/docs/r/s3_bucket_server_side_encryption_configuration.html.markdown"
  - "website/docs/r/s3_bucket_public_access_block.html.markdown"
  - "website/docs/r/dynamodb_table.html.markdown"
  - "website/docs/r/kms_key.html.markdown"
  - "website/docs/r/ssm_parameter.html.markdown"
  - "website/docs/d/ssm_parameter.html.markdown"
  - "website/docs/d/subnets.html.markdown"
  - "website/docs/d/iam_policy_document.html.markdown"
source_url: "https://developer.hashicorp.com/terraform/language/backend/s3"
provider_baseline: "6.x"
---

# 16장 — 원격 State와 백엔드: 팀으로 넘어가는 순간

**이 장에서 배우는 것**

- 로컬 state가 팀에서 무너지는 세 가지 방식을 사고 시나리오로 설명하고, 백엔드가 무엇을 어떻게 막는지 말할 수 있다.
- `backend "s3"` 의 인수(`bucket`, `key`, `encrypt`, `kms_key_id`, `use_lockfile`, `dynamodb_table`)를 골라 쓰고, 잠금 방식 전환을 안전하게 수행할 수 있다.
- 백엔드용 버킷의 닭과 달걀 문제를 부트스트랩 패턴으로 풀고, 백엔드 블록의 변수 금지 제약을 `-backend-config` 로 우회하며 `-migrate-state` 와 `-reconfigure` 를 구분한다.
- `terraform_remote_state` 가 만드는 결합도를 설명하고 SSM·태그 기반 대안과 비교할 수 있다.
- 워크스페이스를 환경 분리에 쓰면 안 되는 이유를 근거를 들어 말할 수 있다.

**왜 중요한가**

금요일 오후, 두 사람이 같은 리포지토리에서 동시에 `terraform apply` 를 눌렀다. A는 ALB 리스너 규칙을 추가했고 B는 RDS 인스턴스 클래스를 올렸다. 로컬 state라 각자 자기 노트북의 파일을 고치므로 아무 에러도 없다. 문제는 그 state를 공유하는 순간 나타난다 — 나중에 올린 쪽이 앞의 것을 덮고, 덮인 쪽이 만든 리스너 규칙은 AWS에 실재하지만 state에는 없다. 다음 apply는 같은 우선순위에 하나 더 만들려다 `PriorityInUse` 로 실패한다. 이름이 겹치지 않는 리소스였다면 실패조차 없이 중복 생성되어 요금 청구서에서 발견된다.

두 번째 사고는 더 단순하다. 인프라를 처음 세운 사람이 퇴사했고 그 노트북은 초기화됐다. 새로 온 사람이 clone하고 plan을 돌리면 `Plan: 47 to add` 가 뜬다 — 이미 다 있는데 전부 새로 만들겠다는 뜻이다. apply를 누르면 NAT Gateway가 추가로 생기고, 누르지 않으면 47개는 Terraform이 모르는 리소스로 남는다. 되살리는 방법은 47번의 `import` 뿐이다([20장](20-import-and-resource-identity.md)).

세 번째는 조직의 마비다. state가 누군가의 노트북에만 있으면 CI가 plan을 돌릴 수 없고, plan이 없으면 PR에 "이 변경이 무엇을 바꾸는가"를 붙일 수 없다. `cidr_block` 한 글자를 고친 PR이 subnet 교체를 일으킨다는 사실은 plan 출력에만 나타나는데, 그 출력을 만들 수 있는 사람이 세상에 한 명뿐인 것이다. 세 문제의 성격은 다르다 — 첫째는 **잠금**, 둘째는 **내구성**, 셋째는 **공유**의 부재이며, 백엔드는 셋을 한 번에 옮긴다.

## 백엔드가 실제로 하는 일

`backend` 블록은 state를 어디에 둘지 정하며 `terraform` 블록 안에 하나만 쓸 수 있다. 백엔드가 맡는 일은 셋이다.

**1. 저장과 읽기.** `terraform init` 이후 모든 명령이 로컬 파일 대신 S3 객체를 읽고 쓴다. 작업 디렉터리에 `terraform.tfstate` 가 생기지 않는다.

**2. 잠금.** apply 시작 시 잠금을 얻고 끝나면 푼다. 그 사이 같은 state에 접근한 사람은 기다리거나 실패한다.

**3. (일부 백엔드만) 원격 실행.** HCP Terraform이나 Terraform Enterprise를 백엔드로 쓰면 plan/apply 자체가 그쪽 워커에서 돈다. **S3 백엔드는 해당하지 않는다** — 저장과 잠금만 하고 실행은 내 노트북이나 CI 러너에서 일어난다. 그래서 "누가 언제 무엇을 apply했는가"는 자동 기록되지 않으며, 그 감사 기록은 파이프라인이 만들어야 한다([38장](../level3-advanced/38-large-scale-structure-cicd.md)).

## `backend "s3"` 인수 해부

**`bucket`, `key`, `region`.** state 객체의 좌표다. `key` 는 버킷 안의 경로이며 **나중에 IAM 접두사로 잘리는 자리**이므로 처음부터 계층을 둔다.

예를 들어 `acme/prod/network/terraform.tfstate`, `acme/stage/network/terraform.tfstate` 처럼 계정 별칭·환경·스택을 순서대로 쌓는다.

`region` 은 **버킷이 있는 리전**이지 리소스를 만들 리전이 아니다. 리소스는 서울에, state는 버지니아에 둘 수 있지만 apply마다 대륙을 건너는 왕복이 붙는다.

**`encrypt`.** 서버 측 암호화로 저장하도록 요청한다. S3는 2023년부터 새 객체를 기본 암호화하므로 실질적 의미는 "암호화 없이 저장되는 경로를 없앤다"에 가깝다.

**`kms_key_id`.** SSE-S3 대신 고객 관리형 KMS 키로 암호화한다. 이것이 붙으면 state를 읽는 데 S3 권한만이 아니라 **`kms:Decrypt`** 도 필요해진다 — 실질적 접근 통제가 버킷 정책이 아니라 **키 정책**으로 옮겨 간다.

**`profile`, `assume_role`.** 백엔드는 provider와 **별개의 자격증명 경로**를 쓴다. provider에서 `assume_role` 로 워크로드 계정에 들어가도 백엔드는 그 설정을 물려받지 않는다. state 버킷은 공용 계정, 리소스는 워크로드 계정인 구조에서 이 분리가 오히려 유용하다([25장](25-multi-account.md)).

## 잠금: DynamoDB에서 S3 네이티브 lockfile로

오랫동안 S3에는 조건부 쓰기가 없었고 그래서 S3 백엔드에는 잠금이 없었다. 우회책이 별도의 DynamoDB 테이블에 `LockID` 항목을 넣는 것이었고, 테이블 요구 조건은 **`LockID` 라는 이름의 문자열 해시 키** 하나뿐이다. `aws_dynamodb_table` 로 만든다면 `hash_key = "LockID"` 와 같은 이름의 `attribute` 블록(`type = "S"`)이면 충분하고 `billing_mode` 는 `PAY_PER_REQUEST` 로 둔다 — 기본값 `PROVISIONED` 는 `read_capacity`/`write_capacity` 를 필수로 만든다.

불편함은 명확했다 — state 하나에 **서비스 두 개**가 필요하고 권한도 양쪽에 줘야 한다. 2024년 S3에 조건부 쓰기가 생기면서 이 우회가 필요 없어졌고 Terraform 1.10에서 **`use_lockfile`** 이 들어왔다. 켜면 state 객체 옆에 `<key>.tflock` 객체를 만들어 잠금으로 쓰고, 이미 있으면 조건부 쓰기가 실패한다 — 그것이 곧 "다른 사람이 작업 중"이다. Terraform 1.11에서 `dynamodb_table` 은 **deprecated로 표시**되었으므로 신규 구성은 `use_lockfile` 만 쓴다.

전환에는 요령이 있다. `use_lockfile = true` 를 추가하되 `dynamodb_table` 을 **남긴 채** 두면 Terraform이 양쪽 모두 잠금을 건다. 팀 전원과 CI가 `terraform init -reconfigure` 를 마친 뒤에야 `dynamodb_table` 을 지우고 테이블을 삭제한다. 이 겹치는 기간을 건너뛰면 옛 설정을 쓰는 팀원은 DynamoDB만, 새 설정을 쓰는 CI는 lockfile만 보므로 **서로를 못 본 채 동시에 apply**한다. 잠금 방식을 바꾸는 순간이 잠금이 사라지는 순간이라는 것이 이 작업의 유일한 위험이다.

잠금 획득 실패는 이렇게 보인다.

```console
│ Error: Error acquiring the state lock
│ Lock Info:
│   ID:        7f3a2c58-1d94-4c0b-a2b7-6c9e0f1a3d55
│   Path:      acme-tfstate-.../prod/network/terraform.tfstate.tflock
│   Who:       jiwon@ci-runner-07
│   Created:   2026-08-20 07:41:12.338 +0000 UTC
```

`Who` 와 `Created` 를 먼저 읽는다. 대부분은 동료가 지금 돌리는 중이고 그때 할 일은 기다리는 것이다. CI에서는 `-lock-timeout=5m` 으로 대기 시간을 준다.

## 닭과 달걀: 백엔드 버킷은 무엇으로 만드는가

state를 S3에 두려면 버킷이 있어야 하는데 그 버킷을 Terraform으로 만들려면 state가 필요하다. 표준 해법은 **부트스트랩 스택**이다 — 로컬 state로 버킷을 만든 뒤 그 state를 자기가 만든 버킷으로 옮긴다.

```terraform
# bootstrap/main.tf — 최초 1회는 backend 블록 없이 apply한다
resource "aws_kms_key" "tfstate" {
  description         = "Terraform state encryption"
  enable_key_rotation = true
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "acme-tfstate-ap-northeast-2"

  lifecycle {
    prevent_destroy = true
  }
}
```

여기에 `aws_s3_bucket_versioning` 으로 `versioning_configuration { status = "Enabled" }` 를 켜고, `aws_s3_bucket_server_side_encryption_configuration` 을 붙여 `rule` 안의 `apply_server_side_encryption_by_default` 에 `sse_algorithm = "aws:kms"` 와 `kms_master_key_id = aws_kms_key.tfstate.arn` 을 주고 `bucket_key_enabled = true` 를 켠다 — SSE-KMS의 KMS 호출 수를 줄여 CI 환경의 요금과 스로틀링에 실제로 영향을 준다. 그리고 `aws_s3_bucket_public_access_block` 으로 `block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets` 를 모두 `true` 로 둔다 — 네 인수는 **기본값이 모두 `false`** 라서 리소스를 만들기만 하고 비워 두면 아무것도 막히지 않는다. `prevent_destroy`([21장](21-lifecycle-meta-arguments.md))는 실수 한 번이 인프라 전체의 기억을 지우는 자리이므로 붙일 가치가 있다.

apply가 끝나면 같은 디렉터리에 `backend "s3"` 를 추가하고 `terraform init -migrate-state` 를 돌린다. 그 뒤로 부트스트랩 스택은 자기가 만든 버킷 안에서 자기를 관리한다.

## 백엔드 블록에는 변수를 쓸 수 없다

환경마다 버킷이 다르면 이렇게 쓰고 싶어진다.

```terraform
# 동작하지 않는다: Variables may not be used here
backend "s3" {
  bucket = var.state_bucket
  key    = "${var.env}/network/terraform.tfstate"
}
```

이유는 순서다. 백엔드는 **`terraform init` 시점에**, 변수 파일을 읽기도 전에 결정되어야 한다. state를 읽어야 계산할 수 있는 값으로 그 state의 위치를 정하려는 것이니 순환이다. `local`, `data`, 리소스 참조도 같은 이유로 안 된다. 정식 우회는 **부분 설정(partial configuration)** 이다 — 블록에는 공통값만 남기고 나머지를 init에서 넣는다.

```terraform
# backend.tf — 환경 공통 부분만
terraform {
  backend "s3" {
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
```

```hcl
# envs/prod.s3.tfbackend
bucket     = "acme-tfstate-ap-northeast-2"
key        = "prod/network/terraform.tfstate"
kms_key_id = "arn:aws:kms:ap-northeast-2:123456789012:key/2f1c9a10"
```

```bash
terraform init -input=false -backend-config=envs/prod.s3.tfbackend

# 낱개 값으로도 준다 — CI에서 키 경로를 조립할 때
terraform init -input=false -backend-config="key=${ENV}/${STACK}/terraform.tfstate"
```

확장자는 관례적으로 `.tfbackend` 를 쓴다 — `.tfvars` 로 쓰면 `-var-file` 에 잘못 넘기는 사고가 난다. 이 파일들은 **반드시 Git에 커밋한다** — 시크릿이 아니라 좌표이고, 사람마다 다른 좌표를 쓰는 것이 곧 사고다. 함정도 하나 있다 — `-backend-config` 를 빼먹으면 Terraform이 빠진 값을 **대화형으로 묻고**, 입력이 없는 CI에서는 멈춘 것처럼 보인다. `-input=false` 를 항상 붙여 즉시 실패하게 만든다.

## `-migrate-state`, `-reconfigure`, 그리고 `force-unlock`

백엔드 설정이 이전 init 때와 달라지면 Terraform은 멈추고 둘 중 하나를 고르라고 한다. 정반대의 일을 한다.

**`-migrate-state`** — state의 내용을 새 위치로 **옮긴다.** 로컬에서 S3로 넘어갈 때, 버킷을 바꿀 때, `key` 경로를 재편할 때. 새 위치에 이미 state가 있으면 덮어쓸지 묻는데, **여기서 무심코 yes를 하면 남의 state가 사라진다.**

**`-reconfigure`** — state는 두고 **설정만 갈아 끼운다.** 잠금 방식을 바꿀 때, `profile`/`assume_role` 을 바꿀 때, 같은 디렉터리에서 환경별 `.tfbackend` 를 바꿔 낄 때.

판단 기준은 한 줄이다. **state 객체의 위치가 바뀌는가?** 바뀌면 `-migrate-state`, 아니면 `-reconfigure`. 같은 디렉터리에서 환경을 갈아 끼우며 전자를 고르면 stage state가 prod 경로로 복사되고, 다음 apply가 prod 인프라를 stage의 기록에 맞춰 재단하려 든다. 9장의 `lineage` 가 다른 혈통의 덮어쓰기를 상당 부분 막아 주지만 안전장치를 믿고 운전할 일은 아니다 — 환경 전환은 `-reconfigure` 를 명시하는 것이 기본이다.

CI 러너가 죽거나 노트북 뚜껑을 닫아 apply가 중단되면 잠금 객체가 남고 이후 모든 실행이 막힌다. 이때 쓰는 `terraform force-unlock <LOCK_ID>` 는 **"저 실행이 죽었다"를 확인해 주지 않는다.** 그냥 잠금을 지운다. 살아 있는 apply의 잠금을 풀면 두 apply가 같은 state를 쓰게 되고, 한쪽이 리소스를 만드는 도중 다른 쪽이 state를 통째로 덮는다. 절차를 고정해 둔다.

1. `Who` 와 `Created` 를 읽는다. 몇 분 전이면 살아 있을 가능성이 높다. **기다린다.**
2. 그 사람이나 CI 잡이 실패/취소로 끝났음을 UI에서 눈으로 확인한 뒤 `force-unlock` 한다. `-force` 로 프롬프트까지 건너뛰는 것은 사람이 개입한 상황에서만.
3. 푼 직후 **`terraform plan` 을 돌린다.** 중단된 apply는 리소스를 절반만 만들어 state에 없는 실물을 남길 수 있다 — `import` 로 데려온다.

## 스택 간에 값 넘기기

원격 state의 부수 효과 하나는 다른 스택이 그 **output**을 읽을 수 있다는 것이다.

```terraform
# app 스택
data "terraform_remote_state" "network" {
  backend = "s3"

  config = {
    bucket = "acme-tfstate-ap-northeast-2"
    key    = "prod/network/terraform.tfstate"
    region = "ap-northeast-2"
  }
}

resource "aws_lb" "app" {
  name    = "prod-app-alb"
  subnets = data.terraform_remote_state.network.outputs.private_subnet_ids   # output 참조
}
```

동작은 하지만 대가가 둘이다.

**대가 1 — 읽기 권한이 전부다.** 이 데이터 소스는 output만 뽑는 것처럼 보이지만 실제로는 **state 파일 전체를 내려받아** 파싱한다. app 스택을 돌리는 롤은 network state의 모든 속성을 읽고, 그 안에 DB 비밀번호가 있다면 그것도 읽는다.

**대가 2 — 컴파일 타임 결합.** 소비자가 생산자의 `key` 경로와 output 이름을 알아야 하므로 output 이름을 바꾸는 것이 공개 API를 바꾸는 일이 되고, 의존 방향이 코드에 박힌다.

대안 하나는 **SSM Parameter Store를 계약 지점으로 쓰는 것**이다.

```terraform
resource "aws_ssm_parameter" "vpc_id" {   # 생산자(network 스택)
  name  = "/acme/prod/network/vpc_id"
  type  = "String"
  value = aws_vpc.main.id
}

data "aws_ssm_parameter" "vpc_id" {       # 소비자(app 스택)
  name = "/acme/prod/network/vpc_id"
}
```

권한이 **값 단위**가 되는 것이 장점이다. `/acme/prod/network/*` 만 읽는 정책을 줄 수 있고 state 전체를 여는 일이 없다. 단점은 관리 대상이 하나 늘고 값이 문자열이라 리스트·맵은 `jsonencode`/`jsondecode` 를 거친다는 것이다. `aws_ssm_parameter` 데이터 소스는 `with_decryption` 이 기본 `true` 라 `SecureString` 도 읽히고 그 값이 state에 평문으로 남으니 **계약용 파라미터에 시크릿을 섞지 않는다**([26장](26-secrets-and-ephemeral.md)).

대안 둘은 **태그 기반 데이터 소스**다. 스택 간 결합 대신 태그 규약만 공유한다.

```terraform
data "aws_vpc" "main" {
  tags = { Environment = "prod", Name = "acme-prod" }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  tags = { Tier = "private" }
}
```

`aws_subnets` 의 `tags` 는 **모든 쌍이 정확히 일치**해야 선택된다. 결합도는 가장 낮지만 태그 규약이 곧 계약이 되므로 [23장](23-tagging-strategy.md)의 태깅 전략이 반쯤 강제되고, 결과가 집합이라 순서가 보장되지 않는다. 선택 기준은 경계의 안정성이다 — **같은 팀이 함께 바꾸는 스택**이라면 `terraform_remote_state` 가 가장 직접적이고, **팀 경계를 넘는다면** SSM이나 태그 기반이 권한과 변경 속도를 분리해 준다.

## 워크스페이스: 쓸모와 한계

`terraform workspace` 는 **같은 백엔드 설정 안에서 state를 여러 벌** 두는 기능이다. `terraform workspace new feature-alb-refactor` 로 만들고 `select` 로 전환한다. S3 백엔드에서 `default` 만 `key` 그대로 저장되고 나머지는 `<workspace_key_prefix>/<workspace>/<key>` 에 놓인다. 기본 접두사가 `env:` 이므로 위 예는 `env:/feature-alb-refactor/prod/network/terraform.tfstate` 다. 환경 분리에 딱 맞아 보이지만 **쓰면 안 된다.** 이유 셋이 모두 구조적이다.

**1. 백엔드가 하나다.** dev와 prod의 state가 같은 버킷, 같은 KMS 키 아래 놓이므로 "prod state는 SRE만 읽는다"를 만들 방법이 없다. 접두사로 IAM을 자를 수는 있지만, 그러면 워크스페이스를 잘못 만든 사람이 곧 권한 경계를 뚫은 사람이 된다.

**2. 자격증명이 하나다.** 워크스페이스는 provider 설정을 바꾸지 못하므로 dev 계정과 prod 계정이 다르면 같은 디렉터리로 둘 다 다룰 수 없고, `terraform.workspace` 로 `assume_role` 을 분기하는 순간 실수 한 번으로 prod에 apply하는 경로가 생긴다.

**3. 환경은 대개 같지 않다.** 이 차이를 `terraform.workspace == "prod" ? ... : ...` 로 흩뿌리면 prod 전용 경로는 **prod에 apply하기 전까지 아무도 실행해 보지 않은 코드**가 된다.

무엇보다 워크스페이스 전환은 **셸 상태**이지 코드가 아니다. `select prod` 를 친 것을 잊고 다음 날 같은 터미널에서 apply하면 dev를 고치려던 변경이 prod로 간다. 쓸 자리는 **수명이 짧고 형상이 같은 복제**다 — PR마다 동일한 테스트 스택을 띄웠다 지우는 용도, 모듈 개발과 acceptance 테스트, 일회성 실험. 환경 분리의 정답은 **디렉터리 분리**다. `envs/prod/`, `envs/stage/` 각각에 자기 백엔드와 tfvars를 두고 공통 부분은 모듈로 뺀다([19장](19-modules.md)) — 백엔드가 다르니 권한이 분리되고 prod 파이프라인에 승인 게이트를 걸 수 있다.

## state 접근 권한 = 시크릿 접근 권한

9장의 결론을 다시 쓴다. **state를 읽을 수 있는 사람은 그 인프라의 모든 비밀을 읽을 수 있다.** 원격으로 옮기면 이 문장이 조직 규모로 커지므로 설계를 세 겹으로 한다.

**겹 1 — 객체 접두사.** `key` 를 계층화했다면 IAM 정책의 `Resource` 를 접두사로 자를 수 있다. `aws_iam_policy_document` 에서 `s3:ListBucket` 은 버킷 ARN에 `s3:prefix` 조건을 걸고, `s3:GetObject`/`PutObject`/`DeleteObject` 는 `<버킷 ARN>/prod/app/*` 에만 준다. `use_lockfile` 을 쓰면 잠금 객체도 같은 접두사 안의 `.tflock` 이라 이 정책 하나로 읽기·쓰기·잠금이 모두 덮인다. DynamoDB 잠금이었다면 테이블 권한을 따로 줘야 했다 — 권한 설계가 단순해지는 것도 네이티브 잠금의 이점이다.

**겹 2 — KMS 키 정책.** `kms_key_id` 를 지정했다면 `kms:Decrypt` 없이는 객체를 받아도 못 읽는다. 환경별로 키를 나누면 버킷 정책이 열려도 키가 두 번째 문이 된다.

**겹 3 — 읽기와 쓰기의 분리.** plan만 돌리는 CI 잡에는 `s3:GetObject` 만 준다. `-lock=false` 가 필요해지지만 plan 전용 롤이 state를 망가뜨릴 경로가 사라진다. 여기에 CloudTrail 데이터 이벤트를 켜면 누가 언제 state를 읽었는지가 기록으로 남는다.

## state가 커질 때, 그리고 백업

원격 백엔드는 매 명령마다 state를 통째로 내려받고 올리므로 크기가 곧 체감 속도다.

- 리소스 300~500개, state 수 MB: refresh가 몇 분씩 걸리고 `RequestLimitExceeded` 가 간헐적으로 보인다.
- 1,000개 이상: plan이 10분을 넘고 한 사람이 apply하는 동안 팀 전체가 잠금 앞에서 대기한다. 대기가 병목이 되면 사람들은 `-lock=false` 를 쓰기 시작하고, 그 순간 이 장 첫머리의 사고로 되돌아간다.

응급 처치는 `-target` 이나 `-refresh=false` 지만 둘 다 부작용이 있다([40장](../level3-advanced/40-performance-and-throttling.md)). 근본 해법은 **스택 쪼개기**이고 경계는 두 기준으로 정한다. **변경 주기** — VPC는 분기에 한 번, ECS 서비스는 하루에 열 번 바뀐다. 같은 state에 두면 하루 열 번 VPC를 refresh한다. **폭발 반경** — 데이터 계층을 컴퓨트와 분리하면 실수의 상한이 낮아진다. 흔한 분할은 `network` / `data` / `platform` / `app` 이며, 쪼갤수록 스택 간 계약이 늘어난다([38장](../level3-advanced/38-large-scale-structure-cicd.md)).

원격 state의 유일한 실질적 복구 수단은 **버킷 버저닝**이다. `terraform.tfstate.backup` 은 로컬 백엔드의 이야기이고 원격에서는 만들어지지 않는다.

위험한 작업 전에는 `terraform state pull > backup-$(date +%s).tfstate` 로 한 벌 떠 두고, 되돌릴 때는 `aws s3api list-object-versions` 로 직전 버전을 찾는다. 복구는 버킷에 직접 복사하지 말고 `terraform state push` 로 한다 — `serial` 과 `lineage` 검사를 통과해야 하기 때문이다. 비현행 버전 만료 규칙은 두되 **90일 이하로 줄이지 않는다.** state 사고는 몇 주 뒤에 발견되는 일이 흔하다.

## 흔한 실수

### ❌ 잠금 없이 원격 state만 쓴다

버킷에 올렸으니 안전하다고 생각하기 쉽지만 동시 apply가 서로를 덮는 문제는 그대로이고, "공유되고 있다"는 착각 때문에 동시 실행 확률은 오히려 올라간다.

```terraform
backend "s3" {
  bucket = "acme-tfstate-ap-northeast-2"
  key    = "prod/network/terraform.tfstate"
  region = "ap-northeast-2"
  # ❌ 여기서 끝내면 저장만 되고 잠금이 없다

  # ✅ 두 줄을 더한다. use_lockfile이 동시 apply를 직렬화한다
  encrypt      = true
  use_lockfile = true
}
```

### ❌ 잠금이 걸렸다고 바로 `force-unlock` 한다

에러가 뜨자마자 잠금 ID를 복사해 푸는 것이 습관이 된 팀이 있다. 대부분은 동료가 apply 중이라는 뜻이고, 풀면 두 apply가 같은 state를 쓴다.

```console
# ❌ 확인 없이 푼다
$ terraform force-unlock -force 7f3a2c58-1d94-4c0b-a2b7-6c9e0f1a3d55

# ✅ 기다려 보고, 소유자를 확인하고, 푼 뒤 곧바로 검증한다
$ terraform apply -lock-timeout=10m
$ terraform force-unlock 7f3a2c58-1d94-4c0b-a2b7-6c9e0f1a3d55
$ terraform plan
```

### ❌ 워크스페이스로 dev/stage/prod를 나눈다

같은 백엔드, 같은 자격증명 위에서 이름만 다른 state를 만드는 것이라 권한 분리가 성립하지 않고, `terraform.workspace == "prod" ? ... : ...` 조건문이 코드 전체에 번진다.

```terraform
# ✅ envs/prod/backend.tf — 환경별 디렉터리에 환경별 백엔드. 차이는 tfvars가 표현한다
terraform {
  backend "s3" {
    bucket       = "acme-tfstate-prod"
    key          = "prod/data/terraform.tfstate"
    region       = "ap-northeast-2"
    use_lockfile = true
  }
}
```

### ❌ `terraform_remote_state` 를 열어 주고 "output만 준다"고 믿는다

이 데이터 소스는 state 전체를 내려받으므로, 데이터 팀 state를 앱 팀 CI에 `terraform_remote_state` 로 열어 주고 `s3:GetObject` 를 준 순간 **그 스택의 모든 시크릿을 준 것**이다.

```terraform
# ✅ 필요한 값만 계약으로 발행하고 소비자에게는 그 값만 읽을 권한을 준다
resource "aws_ssm_parameter" "db_endpoint" {
  name  = "/acme/prod/data/db_endpoint"
  type  = "String"
  value = aws_db_instance.main.address
}
```

## 프로덕션 노트

- **state 버킷을 별도 계정에 두는 것을 고려한다.** 워크로드 계정 권한이 유출돼도 state는 남는다. 대신 `assume_role` 설계가 한 겹 늘어난다([25장](25-multi-account.md)).
- **`use_lockfile` 전환에는 겹치는 기간을 반드시 둔다.** `dynamodb_table` 과 함께 켜 둔 채 팀 전원과 CI가 `-reconfigure` 를 마친 뒤 테이블을 뺀다.
- **CI에는 `-input=false` 와 `-lock-timeout` 을 기본값으로 박는다.** 전자는 부분 설정 누락으로 프롬프트에 멈추는 것을 즉시 실패로 바꾸고, 후자는 동시성 충돌을 대기로 바꾼다. 여기에 **plan 전용 롤과 apply 롤을 분리**해 PR 파이프라인은 `s3:GetObject` 만 가진 롤로 `-lock=false` plan을 돌린다.
- **KMS 요금과 스로틀링을 계산에 넣는다.** state를 읽고 쓸 때마다 KMS 호출이 붙는다. `bucket_key_enabled = true` 는 호출 수를 크게 줄여 주며, plan을 분당 수십 번 돌리는 조직에서는 요금과 `ThrottlingException` 양쪽에 영향이 있다.
- **잠금 소유자를 사람이 읽을 수 있게 만든다.** `Who` 가 `runner-a1b2c3` 같은 난수면 추적이 안 된다. 러너 호스트명에 파이프라인 식별자를 넣어 둔다.

## 연습문제

**1. 부트스트랩과 자기 참조.** backend 블록 없이 state 버킷(버저닝·SSE-KMS·퍼블릭 차단 포함)을 apply한 뒤, 같은 디렉터리에 `backend "s3"` 를 추가하고 `terraform init -migrate-state` 로 state를 옮긴다.
*성공 기준:* 로컬 `terraform.tfstate` 를 지워도 `terraform plan` 이 "No changes"를 낸다. 두 셸에서 동시에 apply를 돌려 잠금 에러를 확인하고, 버킷의 `.tflock` 객체가 생겼다 사라지는 것을 본다.

**2. 부분 설정으로 환경 전환.** 백엔드 블록에는 `region`/`encrypt`/`use_lockfile` 만 남기고 `dev.s3.tfbackend` 와 `stage.s3.tfbackend` 로 `bucket`/`key` 를 분리한다.
*성공 기준:* `-reconfigure` 로 두 환경을 오갈 수 있고 각각 `terraform state list` 결과가 다르다. `-reconfigure` 를 뺐을 때 Terraform이 무엇을 묻는지, yes를 하면 무슨 일이 일어나는지 적는다.

**3. 스택 간 계약 비교.** VPC를 만드는 network 스택과 그 VPC에 보안 그룹을 만드는 app 스택을 나누고, app이 VPC ID를 얻는 방법을 (a) `terraform_remote_state`, (b) `aws_ssm_parameter`, (c) 태그 기반 `aws_vpc` 데이터 소스로 각각 구현한다.
*성공 기준:* 세 방법에 필요한 최소 IAM 권한을 적고, network의 output 이름을 바꿨을 때 어느 방법이 깨지는지 확인한다.


## 요약

- 로컬 state는 **잠금 없음·내구성 없음·공유 불가**로 무너진다. 백엔드는 저장과 잠금을 맡고 일부는 원격 실행까지 맡지만, **S3 백엔드는 저장과 잠금만** 한다.
- `backend "s3"` 의 핵심은 `bucket`/`key`/`region`(좌표), `encrypt`/`kms_key_id`(암호화와 두 번째 권한 문), `use_lockfile`(네이티브 잠금)이다. `key` 는 나중에 IAM 접두사로 잘리므로 처음부터 `<환경>/<스택>/` 로 설계한다. 백엔드는 provider와 **별개의 자격증명 경로**를 쓴다.
- 잠금은 **DynamoDB 테이블(`LockID` 해시 키)에서 S3 네이티브 lockfile로** 이동 중이다. `use_lockfile` 은 Terraform 1.10에서 들어왔고 `dynamodb_table` 은 1.11에서 deprecated되었다. 전환은 둘을 동시에 켠 기간을 둔 뒤 테이블을 뺀다.
- 백엔드 버킷의 닭과 달걀은 **부트스트랩 스택**으로 푼다. `aws_s3_bucket_public_access_block` 의 네 인수는 기본이 모두 `false` 다. **백엔드 블록에는 변수·local·data를 쓸 수 없으므로** 부분 설정과 `-backend-config` 로 환경별 값을 넣고 CI에서는 `-input=false` 를 함께 쓴다.
- `-migrate-state` 는 state의 **위치를 옮기고** `-reconfigure` 는 **설정만 갈아 끼운다.** `force-unlock` 은 실행이 죽었는지 확인해 주지 않으므로 소유자를 눈으로 확인한 뒤에만 쓰고 푼 직후 `plan` 으로 검증한다.
- `terraform_remote_state` 는 output만 읽는 것처럼 보이지만 **state 파일 전체를 내려받는다.** 팀 경계를 넘는 계약이라면 SSM Parameter Store나 태그 기반 데이터 소스가 권한을 값 단위로 좁혀 준다.
- 워크스페이스는 **같은 백엔드·같은 자격증명** 위의 state 복제라 환경 분리에 쓸 수 없다. 환경은 디렉터리와 백엔드로 나눈다. 원격 state의 실질적 백업은 **버킷 버저닝**뿐이고, 복구는 `terraform state push` 로 한다.

## 다음으로

- [17장 — count · for_each · dynamic: 반복의 세 얼굴](17-count-foreach-dynamic.md) — 리소스를 여러 벌 만들 차례다.
- [25장 — 멀티 계정: assume_role · 롤 체이닝 · OIDC](25-multi-account.md) — 백엔드와 provider의 자격증명 분리.
- [38장 — 대규모 코드 구조와 CI/CD 파이프라인](../level3-advanced/38-large-scale-structure-cicd.md) — 스택 쪼개기와 파이프라인.
- 공식 문서: [S3 Backend](https://developer.hashicorp.com/terraform/language/backend/s3)
