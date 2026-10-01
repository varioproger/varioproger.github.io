---
appendix: E
title: "용어집"
kind: reference
source_docs:
  - "website/docs/index.html.markdown"
  - "website/docs/guides/enhanced-region-support.html.markdown"
  - "website/docs/guides/resource-tagging.html.markdown"
  - "docs/resource-identity.md"
  - "docs/list-resources.md"
  - "docs/retries-and-waiters.md"
  - "docs/data-handling-and-conversion.md"
  - "docs/resource-tagging.md"
  - "docs/running-and-writing-acceptance-tests.md"
provider_baseline: "6.x"
---

# 부록 E — 용어집

이 교재에서 쓰인 용어를 한자리에 모은다. 항목마다 **원어**를 표제로 두었다. Terraform과 AWS의 용어는 한국어로 번역하면 검색이 되지 않고 공식 문서·에러 메시지와 연결이 끊기기 때문이다.

각 항목은 "이것이 무엇인가"에 더해 **"언제 걸려 넘어지는가"** 를 한 줄이라도 담으려 했다. 자세한 설명은 항목 끝의 챕터 링크로 이어진다. 색인은 두 벌이다 — 한국어 개념 이름이 먼저 떠오를 때는 **가나다순 색인**을, 코드나 에러 메시지에서 본 영어 단어로 찾을 때는 **알파벳순 색인**을 쓴다.

## 가나다순 색인

| 한국어로 부르는 이름 | 표제어 |
|---|---|
| 가용 영역 분산, 오토스케일링 그룹 | [ASG](#asg) |
| 계정 넘나들기, 롤 떠맡기 | [assume role](#assume-role), [role chaining](#role-chaining) |
| 교체, 강제 재생성 | [ForceNew](#forcenew), [taint, replace](#taint-replace) |
| 그래프, 의존성 순서 | [DAG](#dag) |
| 기본 태그 | [default_tags](#default_tags) |
| 데이터 소스 | [data source](#data-source) |
| 되돌리기, 무중단 교체 | [blue-green deployment](#blue-green-deployment) |
| 드리프트, 코드와 실물의 어긋남 | [drift](#drift) |
| 락 파일, 버전 고정 | [lock file](#lock-file) |
| 리소스 | [resource](#resource) |
| 리전 인수 | [Enhanced Region Support](#enhanced-region-support) |
| 메타 인수 | [meta-argument](#meta-argument) |
| 모듈 | [module](#module) |
| 무시할 태그 | [ignore_tags](#ignore_tags) |
| 백엔드, 원격 상태 저장소 | [backend](#backend) |
| 변수 파일 | [tfvars](#tfvars) |
| 사전·사후 조건 | [precondition, postcondition](#precondition-postcondition) |
| 상태, 상태 파일 | [state](#state) |
| 서비스 계정에 IAM 롤 붙이기 | [IRSA](#irsa) |
| 서버리스 컨테이너 | [Fargate](#fargate) |
| 스로틀링, 요청 제한 | [throttling](#throttling) |
| 시크릿 저장소 | [Secrets Manager](#secrets-manager) |
| 실행, 적용 | [apply](#apply) |
| 암호화 키 관리 | [KMS](#kms) |
| 엔드포인트 재정의 | [endpoints](#endpoints) |
| 오류 처리 래퍼 | [smarterr](#smarterr) |
| 유령 자원 발견 | [list resource](#list-resource) |
| 인수 테스트 | [acceptance test](#acceptance-test) |
| 자격증명 파일 | [shared config, shared credentials](#shared-config-shared-credentials) |
| 재시도 대기 | [waiter](#waiter), [StateChangeConf](#statechangeconf) |
| 정규 리소스 이름 | [ARN](#arn) |
| 최종 일관성 | [eventual consistency](#eventual-consistency) |
| 코드 생성기 | [skaff](#skaff) |
| 태그 정책 준수 | [tag policy compliance](#tag-policy-compliance) |
| 파티션 | [partition](#partition) |
| 프로바이더 | [provider](#provider) |
| 프로바이더 함수 | [provider function](#provider-function) |
| 확인, 계획 | [plan](#plan) |
| 휘발성 리소스 | [ephemeral resource](#ephemeral-resource) |

## 알파벳순 색인

[acceptance test](#acceptance-test) · [ALB, NLB](#alb-nlb) · [apply](#apply) · [ARN](#arn) · [ASG](#asg) · [assume role](#assume-role) · [AutoFlex](#autoflex) · [backend](#backend) · [blue-green deployment](#blue-green-deployment) · [changelog entry](#changelog-entry) · [check](#check) · [DAG](#dag) · [data source](#data-source) · [default_tags](#default_tags) · [disappears test](#disappears-test) · [drift](#drift) · [dualstack](#dualstack) · [endpoints](#endpoints) · [Enhanced Region Support](#enhanced-region-support) · [ephemeral resource](#ephemeral-resource) · [eventual consistency](#eventual-consistency) · [Fargate](#fargate) · [finder](#finder) · [FIPS endpoint](#fips-endpoint) · [flatten, expand](#flatten-expand) · [ForceNew](#forcenew) · [go-vcr](#go-vcr) · [HCL](#hcl) · [ignore_tags](#ignore_tags) · [IMDS](#imds) · [import](#import) · [IRSA](#irsa) · [KMS](#kms) · [lifecycle](#lifecycle) · [list resource](#list-resource) · [lock file](#lock-file) · [meta-argument](#meta-argument) · [module](#module) · [moved](#moved) · [mux](#mux) · [partition](#partition) · [plan](#plan) · [Plugin Framework](#plugin-framework) · [precondition, postcondition](#precondition-postcondition) · [provider](#provider) · [provider function](#provider-function) · [provisioner](#provisioner) · [refresh](#refresh) · [removed](#removed) · [resource](#resource) · [Resource Identity](#resource-identity) · [role chaining](#role-chaining) · [SDKv2](#sdkv2) · [Secrets Manager](#secrets-manager) · [shared config, shared credentials](#shared-config-shared-credentials) · [skaff](#skaff) · [smarterr](#smarterr) · [state](#state) · [StateChangeConf](#statechangeconf) · [tag policy compliance](#tag-policy-compliance) · [tags_all](#tags_all) · [taint, replace](#taint-replace) · [tfvars](#tfvars) · [throttling](#throttling) · [transparent tagging](#transparent-tagging) · [waiter](#waiter) · [workspace](#workspace)

## Terraform 코어 용어

### HCL

HashiCorp Configuration Language. Terraform 설정 파일(`.tf`)의 문법이다. 블록(`resource "aws_vpc" "main" { ... }`), 인수(`cidr_block = "10.0.0.0/16"`), 표현식으로 이루어진다. JSON으로도 같은 내용을 쓸 수 있지만(`.tf.json`) 사람이 읽고 쓰는 것은 HCL 쪽이다. → [3장](../level1-beginner/03-hcl-basics.md)

### resource

Terraform이 **생성·수정·삭제까지 책임지는** 인프라 객체다. `resource "<타입>" "<이름>"` 형태로 선언하며, AWS Provider v6.x에 1,691개가 있다. → [5장](../level1-beginner/05-first-resource-vpc.md), [49장](../level3-advanced/49-design-decisions.md)

### data source

내가 만들지 않은 것을 **읽기만** 하는 블록이다. `data "aws_ami" "al2023" { ... }` 처럼 쓰며 v6.x에 673개가 있다. 복수형 데이터 소스(`aws_subnets`)는 결과가 0건이어도 에러를 내지 않으므로 빈 결과를 전제로 쓴다. → [8장](../level1-beginner/08-data-sources.md)

### provider

특정 API를 Terraform의 리소스 모델로 번역하는 플러그인이다. `provider "aws"` 블록에서 자격증명·리전·엔드포인트·재시도를 설정하며, 이 설정이 그 인스턴스가 만드는 모든 AWS SDK 클라이언트에 적용된다. → [4장](../level1-beginner/04-provider-block-and-auth.md), [부록 A](a-provider-arguments.md)

### module

리소스 묶음을 재사용 단위로 감싼 디렉터리다. 모듈을 쓰면 코드는 줄지만 **state 주소가 `module.<이름>.<리소스>` 로 바뀌므로**, 이미 만들어진 리소스를 모듈로 감싸는 리팩터링에는 `moved` 블록이 필요하다. → [19장](../level2-intermediate/19-modules.md), [22장](../level2-intermediate/22-moved-removed-refactoring.md)

### meta-argument

리소스 타입과 무관하게 **모든 리소스 블록에서 쓸 수 있는** 인수다. `count`, `for_each`, `provider`, `depends_on`, `lifecycle` 이 여기 해당한다. → [17장](../level2-intermediate/17-count-foreach-dynamic.md), [21장](../level2-intermediate/21-lifecycle-meta-arguments.md)

### state

Terraform이 "내가 만든 것이 무엇이고 지금 어떤 값을 갖는가"를 기록해 둔 파일이다. 코드와 실제 인프라를 잇는 유일한 다리이므로, state를 잃으면 Terraform은 기존 리소스를 남의 것으로 취급하고 새로 만들려 든다. → [9장](../level1-beginner/09-state-basics.md)

### backend

state를 어디에 저장하고 어떻게 잠글지를 정하는 설정이다. 기본값은 로컬 파일이며, 팀으로 넘어가는 순간 S3 같은 원격 백엔드 + 잠금이 필요해진다. → [16장](../level2-intermediate/16-remote-state-and-backends.md)

### workspace

같은 코드로 여러 개의 독립된 state를 두는 Terraform Core의 기능이다. 이름만 보면 환경 분리에 적합해 보이지만 백엔드가 공유되므로, 계정이 다른 prod/dev를 나누는 데는 별도 디렉터리·백엔드 키가 더 안전하다. → [16장](../level2-intermediate/16-remote-state-and-backends.md), [38장](../level3-advanced/38-large-scale-structure-cicd.md)

### lock file

`.terraform.lock.hcl`. `terraform init` 이 선택한 provider 버전과 체크섬을 기록한다. **커밋해야 한다.** 그러지 않으면 로컬과 CI가 다른 provider 버전을 받는다. → [2장](../level1-beginner/02-install-and-first-run.md), [39장](../level3-advanced/39-version-upgrades.md)

### plan

현재 state·실제 인프라·코드 셋을 비교해 **무엇을 바꿀지 계산만** 하는 단계다. `-detailed-exitcode` 를 주면 변경 없음이 0, 에러가 1, 변경 있음이 2로 나오므로 CI에서 게이트로 쓸 수 있다. 출력에서 가장 중요한 문자열은 `forces replacement` 다. → [2장](../level1-beginner/02-install-and-first-run.md), [38장](../level3-advanced/38-large-scale-structure-cicd.md)

### apply

plan이 계산한 변경을 **실제로 실행**하는 단계다. `-refresh-only` 모드는 state만 갱신하고 인프라는 건드리지 않으므로 메이저 업그레이드 직후에 쓴다. → [2장](../level1-beginner/02-install-and-first-run.md)

### refresh

AWS API를 호출해 state에 적힌 값을 **실제 값으로 갱신**하는 동작이다. 기본적으로 plan·apply 앞에 자동으로 일어난다. → [36장](../level3-advanced/36-drift-refresh-and-checks.md), [40장](../level3-advanced/40-performance-and-throttling.md)

### drift

코드와 실제 인프라가 어긋난 상태다. 콘솔에서 손으로 고치거나 다른 자동화가 같은 리소스를 건드리면 생긴다. 방치하면 다음 apply가 그 변경을 되돌리므로, 코드로 흡수하든 `ignore_changes` 로 관리 밖에 두든 **명시적으로 결정**해야 한다. → [36장](../level3-advanced/36-drift-refresh-and-checks.md)

### DAG

Directed Acyclic Graph. Terraform이 리소스 참조 관계로 만드는 방향성 비순환 그래프다. `aws_subnet.a.vpc_id = aws_vpc.main.id` 처럼 참조가 있으면 순서가 정해지고, 참조가 없는 것들은 병렬로 처리된다. 참조 없이 순서만 필요할 때 `depends_on` 을 쓴다. → [6장](../level1-beginner/06-references-and-dependencies.md)

### lifecycle

리소스의 생성·교체·삭제 방식을 바꾸는 meta-argument 블록이다. `create_before_destroy`(새것을 먼저 만들고 옛것을 지움), `prevent_destroy`(삭제 차단), `ignore_changes`(특정 인수의 diff 무시), `replace_triggered_by`(다른 리소스가 바뀌면 교체)를 담는다. → [21장](../level2-intermediate/21-lifecycle-meta-arguments.md)

### moved

state 안의 리소스 주소를 **새 주소로 옮기는** 설정 블록이다. 리소스 이름을 바꾸거나 모듈로 감쌀 때, 이것이 없으면 Terraform은 "옛것 삭제 + 새것 생성"으로 해석한다. → [22장](../level2-intermediate/22-moved-removed-refactoring.md)

### removed

리소스를 **AWS에서 지우지 않고 Terraform 관리에서만 떼어 내는** 설정 블록이다. 제거된 리소스 타입을 쓰는 코드를 메이저 업그레이드 전에 정리할 때 특히 유용하다. → [22장](../level2-intermediate/22-moved-removed-refactoring.md), [부록 D](d-v6-breaking-changes.md)

### import

이미 존재하는 AWS 리소스를 Terraform state로 데려오는 동작이다. `terraform import` 명령과 `import` 설정 블록 두 가지 방법이 있으며, 후자는 plan에서 결과를 미리 볼 수 있다. v6에서는 특정 리전의 리소스를 가져올 때 ID 뒤에 `@<리전>` 을 붙인다. → [20장](../level2-intermediate/20-import-and-resource-identity.md)

### Resource Identity

Terraform 1.12에서 도입된, 리소스를 유일하게 식별하는 **구조화된 데이터**다. 기존의 단일 문자열 `id` 와 달리 여러 속성을 담을 수 있어 import가 훨씬 명확해진다. → [20장](../level2-intermediate/20-import-and-resource-identity.md)

### check

apply 이후에도 계속 조건을 검증하는 설정 블록이다. 조건이 깨져도 apply를 실패시키지 않고 **경고**를 낸다. "엔드포인트가 200을 돌려주는가", "인증서가 30일 안에 만료되는가" 같은 지속 검증에 쓴다. → [36장](../level3-advanced/36-drift-refresh-and-checks.md)

### precondition, postcondition

`lifecycle` 블록 안에 두는 조건 검사다. precondition은 리소스를 만들기 **전에**, postcondition은 만든 **뒤에** 검사하며, 실패하면 apply가 중단된다. → [36장](../level3-advanced/36-drift-refresh-and-checks.md)

### taint, replace

리소스를 강제로 다시 만들게 하는 방법이다. `terraform apply -replace=<주소>` 가 현재 권장되는 형태이고, 옛 `terraform taint` 는 state를 직접 더럽히는 방식이라 밀려났다. 코드 변경 때문에 자동으로 일어나는 교체는 [ForceNew](#forcenew)를 본다. → [21장](../level2-intermediate/21-lifecycle-meta-arguments.md)

### ephemeral resource

**state에도 plan 파일에도 값을 남기지 않는** 리소스다. 실행 중에만 존재하며 AWS Provider v6.x에 10개가 있다(`aws_secretsmanager_secret_version`, `aws_ssm_parameter`, `aws_eks_cluster_auth` 등). → [26장](../level2-intermediate/26-secrets-and-ephemeral.md)

### list resource

Terraform 1.14에서 도입된 `list` 블록과 `terraform query` 명령으로 **계정 안에 무엇이 있는지 조회**하는 기능이다. AWS Provider v6.x에 183개가 있다. → [37장](../level3-advanced/37-list-resources-and-query.md)

### provider function

provider가 제공하는 HCL 함수다. `provider::aws::arn_build(...)` 형태로 호출한다. AWS Provider에는 `arn_build`, `arn_parse`, `trim_iam_role_path`, `user_agent` 네 개가 있다. → [33장](../level2-intermediate/33-provider-functions-and-policies.md)

### provisioner

리소스가 만들어진 뒤 셸 명령이나 파일 복사를 실행하는 기능(`local-exec`, `remote-exec`, `file`)이다. Terraform은 이것을 **최후 수단**으로 규정한다. 실행 결과가 state에 남지 않아 재현성이 없고, 실패하면 리소스가 tainted 상태가 되기 때문이다. → [11장](../level1-beginner/11-ec2-instance.md)

### tfvars

`variable` 로 선언한 입력 변수에 값을 넣는 파일이다. `terraform.tfvars` 와 `*.auto.tfvars` 는 자동으로 읽히고, 그 밖의 파일은 `-var-file` 로 지정한다. → [7장](../level1-beginner/07-variables-outputs-locals.md)

## AWS Provider 용어

### default_tags

provider 블록에서 선언해 **그 provider가 만드는 모든 태그 지원 리소스에 자동으로 붙이는** 태그다. 환경 변수 `TF_AWS_DEFAULT_TAGS_<키>=<값>` 으로도 지정할 수 있고 충돌 시 provider 설정이 이긴다. **`aws_autoscaling_group` 은 예외**로 적용되지 않는다. → [10장](../level1-beginner/10-tags-basics.md), [23장](../level2-intermediate/23-tagging-strategy.md)

### tags_all

리소스의 `tags` 와 provider의 `default_tags` 를 **합친 최종 결과**를 담는 읽기 전용 속성이다. 실제 AWS에 붙는 태그가 무엇인지는 `tags` 가 아니라 `tags_all` 을 봐야 안다. → [10장](../level1-beginner/10-tags-basics.md)

### ignore_tags

Terraform이 **자기 관리 대상에서 제외할 태그**를 지정하는 provider 블록이다. `keys` 로 정확한 키를, `key_prefixes` 로 접두어를 지정한다. 환경 변수 `TF_AWS_IGNORE_TAGS_KEYS`·`TF_AWS_IGNORE_TAGS_KEY_PREFIXES` 도 지원하며, 이 경우 두 소스가 **병합**된다(`default_tags` 와 다른 점이다). → [23장](../level2-intermediate/23-tagging-strategy.md)

### tag policy compliance

provider 인수 `tag_policy_compliance` 로 켜는 기능이다. AWS Organizations의 태그 정책을 provider가 직접 검사해 `error`(위반 시 실패), `warning`(경고만), `disabled` 중 하나로 동작한다. 설정하지 않으면 비활성이다. 환경 변수는 `TF_AWS_TAG_POLICY_COMPLIANCE` 다. → [23장](../level2-intermediate/23-tagging-strategy.md)

### Enhanced Region Support

v6.0.0에서 대부분의 리소스·데이터 소스·ephemeral 리소스에 **최상위 `region` 인수**를 추가한 변경이다. `region` 값을 바꾸면 **교체**되고, 지우면 교체되지 않고 state의 이전 값을 쓴다. 기존 alias 방식도 여전히 유효하며 deprecated가 아니다. → [24장](../level2-intermediate/24-enhanced-region-support.md), [부록 D](d-v6-breaking-changes.md)

### partition

AWS의 최상위 격리 경계다. 일반 상용 리전은 `aws`, 중국은 `aws-cn`, 미국 정부용은 `aws-us-gov` 파티션에 속한다. `region` 인수 값은 provider가 속한 파티션 안인지 검증된다. → [24장](../level2-intermediate/24-enhanced-region-support.md), [33장](../level2-intermediate/33-provider-functions-and-policies.md)

### ARN

Amazon Resource Name. `arn:<partition>:<service>:<region>:<account-id>:<resource>` 형태로 AWS 리소스를 유일하게 가리키는 문자열이다. 문자열 이어붙이기로 조립하면 파티션·리전을 틀리기 쉬우므로 `provider::aws::arn_build` 함수를 쓴다. → [13장](../level1-beginner/13-iam-basics.md), [33장](../level2-intermediate/33-provider-functions-and-policies.md)

### assume role

한 자격증명으로 **다른 IAM 롤의 권한을 임시로 빌려 쓰는** 것이다. provider 블록의 `assume_role` 중첩 블록에 `role_arn`(유일한 Required 인수)을 지정한다. 멀티 계정 구성의 기본 도구다. → [25장](../level2-intermediate/25-multi-account.md), [부록 A](a-provider-arguments.md)

### role chaining

assume한 롤로 다시 다른 롤을 assume하는 것이다. 관리 계정 → 워크로드 계정처럼 단계를 거칠 때 쓴다. **체이닝된 세션의 최대 수명은 1시간으로 제한**되므로, 긴 apply에서 세션이 만료되는 사고가 생긴다. → [25장](../level2-intermediate/25-multi-account.md)

### IRSA

IAM Roles for Service Accounts. EKS에서 파드가 노드의 인스턴스 프로파일을 공유하지 않고, **쿠버네티스 ServiceAccount 단위로 IAM 롤**을 갖게 하는 방식이다. `aws_iam_openid_connect_provider` 로 클러스터의 OIDC 발급자를 IAM에 등록하고, 롤의 신뢰 정책에서 그 발급자와 ServiceAccount를 조건으로 건다. → [29장](../level2-intermediate/29-containers-ecs-eks.md)

### IMDS

Instance Metadata Service. EC2 인스턴스가 자기 자신에 대한 정보와 **인스턴스 프로파일의 임시 자격증명**을 받아 오는 링크 로컬 엔드포인트다. provider 인수 `ec2_metadata_service_endpoint`, `ec2_metadata_service_endpoint_mode`(`IPv4`/`IPv6`), `skip_metadata_api_check` 로 제어한다. → [4장](../level1-beginner/04-provider-block-and-auth.md), [34장](../level3-advanced/34-provider-configuration-deep.md)

### shared config, shared credentials

AWS CLI와 SDK가 공유하는 설정 파일이다. 기본값은 각각 `~/.aws/config` 와 `~/.aws/credentials` 이며, provider 인수 `shared_config_files`·`shared_credentials_files`(둘 다 리스트)로 바꿀 수 있다. **v4부터는 `profile` 을 명시했는데 그 프로파일이 유효하지 않으면 환경 변수로 넘어가지 않고 에러가 난다.** → [4장](../level1-beginner/04-provider-block-and-auth.md), [부록 B](b-environment-variables.md)

### endpoints

provider 블록에서 **서비스별 API 엔드포인트 URL을 직접 지정**하는 중첩 블록이다. v6에서 `opsworks`, `simpledb`, `sdb`, `worklink` 키가 제거되었으므로 옛 설정을 그대로 들고 오면 init에서 막힌다. → [34장](../level3-advanced/34-provider-configuration-deep.md), [부록 A](a-provider-arguments.md)

### FIPS endpoint

FIPS 140-2 검증 암호 모듈을 쓰는 AWS 엔드포인트다. provider 인수 `use_fips_endpoint = true` 한 줄로 지원되는 서비스 전부에 대해 자동 해결된다(v4에서 도입). → [34장](../level3-advanced/34-provider-configuration-deep.md)

### dualstack

IPv4와 IPv6를 모두 지원하는 엔드포인트다. provider 인수 `use_dualstack_endpoint = true` 로 켠다. → [34장](../level3-advanced/34-provider-configuration-deep.md)

## Provider 개발 용어

### Plugin Framework

terraform-plugin-framework. HashiCorp의 **현행** provider 개발 SDK다. AWS Provider의 **신규 리소스는 Framework로 구현하는 것이 원칙**이다. → [42장](../level3-advanced/42-provider-architecture.md), [44장](../level3-advanced/44-implementing-a-resource.md)

### SDKv2

terraform-plugin-sdk v2. AWS Provider의 리소스 대부분이 여전히 이 위에 올라가 있는 이전 세대 SDK다. 새로 만들지는 않지만 기존 코드를 고치려면 알아야 한다. → [42장](../level3-advanced/42-provider-architecture.md)

### mux

두 개의 provider 구현(SDKv2와 Plugin Framework)을 **하나의 provider로 합쳐 서빙**하는 방식이다. 덕분에 리소스 전부를 한꺼번에 마이그레이션하지 않고도 신기능을 도입할 수 있다. → [42장](../level3-advanced/42-provider-architecture.md)

### AutoFlex

Plugin Framework 쪽에서 **Terraform 모델과 AWS API 구조체를 자동으로 변환**해 주는 provider 내부 기능이다. `flex.Flatten` 과 `flex.Expand` 두 진입점이 필드 이름을 분석해 매핑하므로, 대부분의 신규 리소스는 손으로 변환 코드를 쓰지 않아도 된다. → [44장](../level3-advanced/44-implementing-a-resource.md)

### flatten, expand

AWS API 응답을 Terraform state 모양으로 바꾸는 것이 **flatten**, 반대로 Terraform 설정을 AWS API 입력 구조체로 바꾸는 것이 **expand**다. → [44장](../level3-advanced/44-implementing-a-resource.md)

### finder

리소스의 Read 핸들러가 호출하는, **AWS API에서 현재 상태를 가져오는 함수**다. 리소스가 이미 사라졌다면 `retry.NotFound` 가 `true` 인 에러를 돌려줘야 하고, 그러면 Read 핸들러가 state에서 리소스를 제거한다. → [44장](../level3-advanced/44-implementing-a-resource.md)

### waiter

리소스가 원하는 상태가 될 때까지 **폴링하며 기다리는** 함수다. AWS API는 생성 요청을 즉시 받아들이고 완료는 나중에 되는 경우가 많아, waiter가 없으면 다음 리소스가 "아직 준비 안 됨" 에러를 맞는다. → [45장](../level3-advanced/45-errors-retries-waiters.md)

### StateChangeConf

`retry.StateChangeConf`. Terraform Plugin SDK가 제공하는, **원하는 값이 나올 때까지 작업을 반복하는 범용 도구**다. 여기서 말하는 "state"는 Terraform의 state가 아니라 AWS 리소스의 상태 값(`creating` → `available` 등)이다. → [45장](../level3-advanced/45-errors-retries-waiters.md)

### transparent tagging

태깅 로직을 각 리소스의 CRUD 핸들러가 아니라 **provider 런타임의 인터셉터에 몰아 둔** 구현 방식이다. 리소스 구현자는 팩토리 함수에 애노테이션(특별한 형식의 Go 주석)을 붙이고 `make gen` 을 돌리기만 하면 된다. → [46장](../level3-advanced/46-implementing-tagging.md)

### skaff

리소스·데이터 소스·함수의 **소스 파일과 테스트 파일을 최신 관행에 맞게 생성**해 주는 스캐폴딩 CLI 도구다. 기본 설정이 Plugin Framework다. → [43장](../level3-advanced/43-dev-environment-and-skaff.md)

### acceptance test

**실제 AWS에 리소스를 만들고 지우면서** 검증하는 테스트다. 그래서 자격증명이 필요하고 비용이 발생하며 느리다. PR을 낼 때 관련 테스트 통과가 사실상 요구사항이다. → [47장](../level3-advanced/47-testing.md)

### disappears test

리소스가 **Terraform 밖에서(예: 콘솔에서) 삭제되었을 때**, Terraform이 "없어졌다"는 에러 대신 재생성을 제안하는지 검증하는 테스트다. finder의 NotFound 규약이 제대로 구현되었는지를 검사하는 셈이다. → [47장](../level3-advanced/47-testing.md)

### go-vcr

HTTP 요청을 **녹화해 두었다가 재생**하는 Go 라이브러리다. AWS Provider는 acceptance test의 속도와 비용을 줄이려고 이것을 쓴다. → [47장](../level3-advanced/47-testing.md)

### changelog entry

PR마다 `.changelog/{PR번호}.txt` 파일에 넣는 릴리스 노트 항목이다. `release-note:enhancement` 처럼 카테고리를 헤더로 적고 그 아래 한 줄을 쓴다. 이 파일들이 모여 릴리스 노트가 되므로, 업그레이드하는 사람이 읽을 문장이라고 생각하고 써야 한다. → [48장](../level3-advanced/48-contributing.md)

### smarterr

AWS Provider의 **에러 처리·진단 메시지 래퍼**다. 실무에서는 래퍼인 `smerr` 로 `smerr.Append`·`smerr.AddError` 를 호출하고, 맨 에러를 반환할 때만 `smarterr` 를 직접 쓴다. 옛 `sdkdiag.*` 호출을 이쪽으로 옮기는 마이그레이션이 진행 중이다. → [45장](../level3-advanced/45-errors-retries-waiters.md), [48장](../level3-advanced/48-contributing.md)

## AWS 개념

### eventual consistency

쓰기가 성공했다고 응답이 왔어도 **곧바로 읽으면 옛 값이 보일 수 있는** 성질이다. provider는 재시도와 waiter로 이것을 흡수하지만 완전히 감춰 주지는 못하므로, 사용자 쪽에서도 `depends_on` 이나 재시도가 필요할 때가 있다. → [45장](../level3-advanced/45-errors-retries-waiters.md)

### throttling

AWS API가 요청 속도를 제한해 `ThrottlingException`, `RequestLimitExceeded` 같은 에러를 돌려주는 것이다. provider 인수 `max_retries`(**기본값 25**)가 자동 재시도 횟수를 정하고, Terraform 쪽에서는 `-parallelism` 을 낮춰 완화한다. → [40장](../level3-advanced/40-performance-and-throttling.md)

### ForceNew

인수 값을 바꾸면 **in-place 수정이 아니라 리소스 교체**가 일어나는 성질이다. 리소스 문서에서 "Forces new resource"로 표시된다. 데이터가 들어 있는 리소스에서 이것을 놓치면 apply 한 번으로 데이터가 사라진다. v6의 `region` 인수도 변경 시 교체를 유발한다. → [14장](../level1-beginner/14-reading-resource-docs.md), [21장](../level2-intermediate/21-lifecycle-meta-arguments.md)

### blue-green deployment

새 환경(green)을 통째로 만들어 두고 트래픽을 옮긴 뒤 옛 환경(blue)을 지우는 배포 방식이다. Terraform에서는 `create_before_destroy` 와 `name_prefix` 조합이 가장 단순한 형태이고, RDS는 서비스 차원의 blue/green 배포를 별도로 지원한다. → [28장](../level2-intermediate/28-compute-asg-alb.md), [31장](../level2-intermediate/31-databases-rds-dynamodb.md)

### ASG

Auto Scaling Group. 지정한 개수의 EC2 인스턴스를 유지하고, 죽으면 새로 띄우고, 부하에 따라 수를 조절하는 그룹이다. `aws_launch_template` 로 인스턴스의 모양을 정의하고 `aws_autoscaling_group` 이 그것을 몇 개 어디에 띄울지 정한다. **`default_tags` 가 적용되지 않는 예외 리소스**이므로 `tag` 블록으로 직접 태그를 붙여야 한다. → [28장](../level2-intermediate/28-compute-asg-alb.md)

### ALB, NLB

Elastic Load Balancing v2의 두 종류다. ALB는 HTTP/HTTPS 계층에서 경로·호스트로 라우팅하고, NLB는 TCP/UDP 계층에서 더 낮은 지연으로 전달한다. Terraform에서는 둘 다 `aws_lb` 리소스이며 `load_balancer_type` 으로 구분한다. → [28장](../level2-intermediate/28-compute-asg-alb.md)

### Fargate

EC2 인스턴스를 직접 관리하지 않고 컨테이너를 실행하는 ECS·EKS의 서버리스 실행 모드다. 노드 그룹이 사라져 Terraform이 관리할 리소스는 줄지만, 태스크 정의의 CPU·메모리 조합을 정해진 값에서만 고를 수 있다. → [29장](../level2-intermediate/29-containers-ecs-eks.md)

### KMS

Key Management Service. 암호화 키를 만들고 접근을 통제하는 서비스다. **키 삭제는 즉시 일어나지 않고 대기 기간(`deletion_window_in_days`)을 거친다.** 키를 잃으면 그 키로 암호화한 데이터도 잃으므로 `prevent_destroy` 를 걸어 둘 값어치가 있다. → [26장](../level2-intermediate/26-secrets-and-ephemeral.md)

### Secrets Manager

비밀번호·API 키 같은 시크릿을 저장하고 자동 교체까지 해 주는 서비스다. Terraform에서 값을 읽을 때는 데이터 소스 대신 **ephemeral 리소스**를 쓰는 것이 낫다. 데이터 소스로 읽으면 그 값이 state에 평문으로 남기 때문이다. → [26장](../level2-intermediate/26-secrets-and-ephemeral.md)

## 관련 문서

- 전체 목차와 학습 순서: [부록 F — 학습 경로와 다음 단계](f-learning-paths.md)
- 인수·환경 변수·리소스 이름을 찾을 때: [부록 A](a-provider-arguments.md) · [부록 B](b-environment-variables.md) · [부록 C](c-resource-catalog.md)
- 버전 관련 용어의 맥락: [부록 D — v6 파괴적 변경 체크리스트](d-v6-breaking-changes.md)
- 공식 용어 정의: [Terraform Glossary](https://developer.hashicorp.com/terraform/docs/glossary), [AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
