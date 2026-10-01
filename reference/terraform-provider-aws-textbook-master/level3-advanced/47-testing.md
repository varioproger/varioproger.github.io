---
chapter: 47
level: "Level 3 — 고급"
title: "테스트: 진짜 AWS를 만들고 지우는 인수 테스트와 그 주변"
difficulty: 심화
reading_time: "32분"
prerequisites: [43, 44]
source_docs:
  - "docs/running-and-writing-acceptance-tests.md"
  - "docs/unit-tests.md"
  - "docs/acc-test-generation.md"
  - "docs/acc-test-environment-variables.md"
  - "docs/go-vcr.md"
  - "docs/design-decisions/expect-resource-action-with-disappears-tests.md"
  - "docs/makefile-cheat-sheet.md"
  - "docs/continuous-integration.md"
source_url: "https://hashicorp.github.io/terraform-provider-aws/running-and-writing-acceptance-tests/"
provider_baseline: "6.x"
---

# 47장 — 테스트: 진짜 AWS를 만들고 지우는 인수 테스트와 그 주변

**이 장에서 배우는 것**

- acceptance · unit · CI 세 계층이 각각 무엇을 보증하는지 구분하고, 어떤 변경에 어떤 테스트가 필요한지 판단할 수 있다.
- `resource.ParallelTest`의 `TestCase` 필드(`PreCheck`, `ErrorCheck`, `ProtoV5ProviderFactories`, `CheckDestroy`, `Steps`)를 읽고 직접 쓸 수 있다.
- `_basic` / `_disappears` / 속성별 / 데이터 소스 / `_serial` 테스트의 명명 규약과, `plancheck.ExpectResourceAction`을 쓰는 disappears 테스트가 왜 `ExpectNonEmptyPlan`만으로 부족한지 설명할 수 있다.
- `@Testing` 어노테이션 테스트 생성기와 `go-vcr` 녹화/재생을 언제 쓰고 어디서 한계에 부딪히는지 판단할 수 있다.
- 버그를 재현하는 최소 인수 테스트를 작성해 이슈나 PR에 첨부할 수 있다.

**왜 중요한가**

provider의 인수 테스트는 성격이 다르다. 목(mock)을 세우고 함수를 부르는 것이 아니라 **진짜 AWS 계정에 진짜 리소스를 만들고, 검사하고, 지운다.** 그래서 돌리면 청구서가 나온다. 원문은 이를 절의 제목으로 못 박아 두었다 — 인수 테스트는 돈이 든다. 특히 ACM, Bedrock, EC2, ElastiCache, FSx, Glue, OpenSearch, RDS, Storage Gateway, WorkSpaces가 비싸다고 명시된다.

이 사정이 규약 전부를 만들었다. 리소스 이름을 무작위로 만드는 것은 **같은 계정에서 스무 개의 테스트가 동시에 돌기 때문**이고, 하드코딩을 금지하는 것은 **같은 테스트가 GovCloud를 포함한 다른 파티션에서도 통과해야 하기 때문**이며, `CheckDestroy`를 필수로 요구하는 것은 **지워지지 않은 리소스가 계속 과금되기 때문**이다.

모르고 PR을 열면 리뷰어가 "인수 테스트 없음"으로 되돌리거나, CI가 빨간 X를 띄우거나, 테스트가 리뷰어 계정에서만 실패해 추적에 며칠이 든다. 반대로 이 장을 알면 **AWS 계정 없이도 기여할 수 있다** — 원문은 비용을 감당할 수 없으면 PR에 그렇게 적으라고 명시한다. "최선을 다한(best effort)" 구현을 받아 유지보수자가 대신 돌려 주며 머지가 늦어질 뿐 차단 사유가 아니다. 기여자가 아니어도 마찬가지여서, 버그를 겪었을 때 **재현되는 최소 인수 테스트 함수 하나**를 이슈에 붙이면 "설정을 봐야 알겠다" 단계가 사라진다.

## 세 층의 테스트와 `TF_ACC`

| 종류 | 대상 | AWS 접근 | 실행 시점 |
|---|---|---|---|
| **acceptance** | AWS와의 종단 간 상호작용(CRUD·import) | 있음(실제 과금) | 수동 / 부분적으로 CI |
| **unit** | provider 내부의 격리된 함수 | 없음 | 모든 PR |
| **CI** | 린트, 컴파일, 단위 테스트, 정적 분석 | 없음 | 모든 PR |

**AWS API의 실제 동작에 의존하는 것은 인수 테스트로만 검증된다** — 최종 일관성, waiter가 제대로 기다리는지, 삭제 후 조회가 어떤 에러를 내는지. 그리고 **모든 PR에서 자동으로 도는 것은 세 번째 계층뿐**이다. 인수 테스트가 전부 자동으로 돌지 않는다는 사실이 회귀 버그가 살아남는 구조적 이유이며 "버그를 재현하는 테스트를 함께 내라"는 요구가 강한 이유다.

경계를 지키는 장치가 `TF_ACC`다. 원문의 정의는 "`resource.Test()`와 `resource.ParallelTest()`를 포함하는 Go 테스트를 활성화한다"이며 **없으면 인수 테스트는 건너뛴다.**

## 인수 테스트를 돌리는 법

```console
make testacc TESTS=TestAccCloudWatchDashboard_updateName PKG=cloudwatch
# TF_ACC=1 go test ./internal/service/cloudwatch/... -v -count 1 -parallel 20 -run=... -timeout 180m
```

`TESTS`는 정규식이라 접두사만 주면 묶음 전체가 돈다. 자격증명은 `AWS_PROFILE` 또는 액세스 키로 미리 export한다. **기본 리전은 `us-west-2`** 이고 `AWS_DEFAULT_REGION`으로 덮어쓴다(GovCloud(US)는 `us-gov-west-1`).

- **패키지 자동 감지.** `t` 타깃은 `T`만 주면 테스트 이름으로 패키지를 찾는다(`make t T=TestAccIAMRole_basic` = `PKG=iam`). **`TESTS`는 자동 감지를 하지 않는다.**
- **긴 테스트 건너뛰기.** 300초를 넘는 테스트에는 `-short` 가드가 붙는다. `TESTARGS=-short` 또는 `testacc-short`(별칭 `ts`)를 쓰되 **PR 직전 마지막 실행은 `-short` 없이** 한다.
- **동시성과 타임아웃.** `ACCTEST_PARALLELISM` 기본 `20`, `ACCTEST_TIMEOUT` 기본 `360m`, `TEST_COUNT` 기본 `1`. `P=5`로 낮추면 스로틀링과 쿼터 충돌이 완화된다. macOS 등의 기본 `ulimit -n` 256이 AWS 연결을 막으므로 1024 이상으로 올린다.

## 테스트 함수 해부

```go
func TestAccExampleThing_basic(t *testing.T) {
	ctx := acctest.Context(t)
	rName := acctest.RandomWithPrefix(t, acctest.ResourcePrefix)
	resourceName := "aws_example_thing.test"

	resource.ParallelTest(t, resource.TestCase{
		PreCheck:                 func() { acctest.PreCheck(ctx, t) },
		ErrorCheck:               acctest.ErrorCheck(t, names.ExampleServiceID),
		ProtoV5ProviderFactories: acctest.ProtoV5ProviderFactories,
		CheckDestroy:             testAccCheckExampleThingDestroy(ctx, t),
		Steps: []resource.TestStep{
			{
				Config: testAccExampleThingConfig_name(rName),
				Check: resource.ComposeTestCheckFunc(
					testAccCheckExampleThingExists(ctx, t, resourceName),
					acctest.CheckResourceAttrRegionalARN(resourceName, "arn", "example", "thing/"+rName),
					resource.TestCheckResourceAttr(resourceName, "name", rName),
				),
			},
			{ResourceName: resourceName, ImportState: true, ImportStateVerify: true},
		},
	})
}
```

- **`PreCheck`** — 성공할 수 없는 환경이면 실패로 보고하지 않고 **건너뛴다.**
- **`ErrorCheck`** — 실패로 흘러가기 전 에러를 볼 기회다. **대부분의 에러는 그대로 실패해야 하고**, 여기서 다룰 것은 "이 리전에서 지원되지 않는다" 같은 skip 대상뿐이다.
- **`CheckDestroy`** — 자동 destroy 후 **AWS API에 직접 물어** 정말 사라졌는지 본다. 실패하면 "dangling resources"로 보고되며 구현은 **리뷰 통과의 필수 항목**이다.

전체 흐름은 **Step마다 apply -> Check -> (다음 Step) -> 마지막에 자동 destroy -> `CheckDestroy`** 다. 놓치기 쉬운 원칙 하나 — **Exists 검사는 state가 아니라 provider API로 한다.** state에서 가져오는 것은 리소스 ID뿐이고 그 ID로 AWS에 실제로 물어본다. 반면 **computed 속성의 값 검증은 state 값**으로 한다. 둘을 섞으면 "state에는 있는데 AWS에는 없는" 버그를 영원히 못 잡는다.

## 설정 규약과 하드코딩 금지

테스트 설정은 Go 함수가 문자열을 돌려주는 방식으로 쓰고, 규약 대부분을 CI가 기계적으로 검사한다.

- **`fmt.Sprintf()`만 쓴다.** `text/template`은 **명시적으로 금지**되고, 같은 값이 여러 번 나오면 인자를 반복하지 말고 **`%[1]q`** 를 여러 번 쓴다.
- **리소스 이름은 `test`**, **첫 줄과 마지막 줄의 개행이 필수**다 — 이어 붙일 때 HCL 문법 오류를 막는다.
- **`provider "aws" {...}`와 `timeouts {...}` 블록을 넣지 않는다.** 후자는 타임아웃 자체를 시험할 때만 예외다.
- **로그 목적지 `aws_s3_bucket`에는 `force_destroy = true`.** 테스트 중 로그가 계속 쓰여 삭제 시점에 `BucketNotEmpty`가 나는 경쟁 조건을 막는다.

**독립성 요구는 강하다** — 모든 설정이 서로 최대한 독립적이어야 한다. 대표 사례가 기본 VPC로, 기본 VPC를 재구성하는 테스트가 존재하므로 VPC가 필요하면 **테스트 안에서 만들고 지워야** 한다. 사용자가 준비한 S3 버킷·IAM 롤·KMS 키도 전제할 수 없다. 반복되는 전제는 `acctest.ConfigCompose()`로 이어 붙이되 **과도한 연쇄는 피하고 리소스와 그 데이터 소스 사이에서 설정을 재사용하지 않는다.** 하드코딩 금지의 이유도 이식성이다.

| 하드코딩된 것 | 대신 쓸 것 |
|---|---|
| 계정 ID | `aws_caller_identity`, `aws_billing_service_account` |
| AMI ID | `acctest.ConfigLatestAmazonLinuxHVMEBSAMI()` -> `data.aws_ami.amzn-ami-minimal-hvm-ebs.id` |
| AZ 이름 | `acctest.ConfigAvailableAZsNoOptIn()` -> `data.aws_availability_zones.available.names[0]` |
| 인스턴스 타입 / 스팟 가격 | `acctest.AvailableEC2InstanceTypeForRegion(...)` / `aws_ec2_spot_price` |
| DB 엔진 버전 / 파티션 / 리전 | `aws_rds_engine_version` / `aws_partition` / `aws_region` |
| SSH 키 / 이메일 | `acctest.RandSSHKeyPair()` / `acctest.DefaultEmailAddress` |

검사도 전용 헬퍼를 쓴다 — 계정 ID는 `CheckResourceAttrAccountID()`, ARN은 `CheckResourceAttrRegionalARN()` 과 `Match`·`Global`·`NoAccount`·`AccountID` 변형들이다.

## 테스트 종류와 disappears

- **`_basic`** — 가장 먼저 쓴다. **Required 인수만** 넣고 **read-only 속성(`Computed: true`이면서 `Optional`이 아닌 것) 전부의 값을 검사**하며, import를 지원하면 import 검증 Step을 붙이되 **갱신·재생성 Step은 넣지 않는다.** 빈 블록은 `"{ATTRIBUTE}.#", "0"`, 빈 맵은 `"{ATTRIBUTE}.%", "0"`으로 제로값까지 확인한다.
- **`_disappears`** — 두 번째로 쓴다. **`_{ATTRIBUTE}`** 는 인수 하나를 설정하고 값을 바꿔 갱신(또는 강제 재생성)되는지 본다.
- **`{THING}DataSource_{...}`** — `disappears`가 없고 검사 대부분을 `TestCheckResourceAttrPair()`로 하되 **리소스의 `CheckDestroy`는 그대로 쓴다.**
- CI의 **이름 규약 검사**는 `TestAccResource_MiddleSegment_finalSegment`를 요구한다 — **중간은 UpperCase**(`DefaultTags`), **마지막은 lowerCamelCase**(`basic`, `emptyMap`). `make test-naming`으로 돌린다.

disappears 테스트는 가장 흔한 사용자 버그 하나를 겨냥한다 — **콘솔에서 밖에서 지웠는데 다음 `plan`에서 provider가 "찾을 수 없다"고 에러를 내는 것.** 올바른 동작은 **state에서 제거하고 재생성 계획을 내는 것**이다.

```go
{
	Config: testAccExampleThingConfig_name(rName),
	Check: resource.ComposeTestCheckFunc(
		testAccCheckExampleThingExists(ctx, t, resourceName),
		acctest.CheckSDKResourceDisappears(ctx, t, ResourceExampleThing(), resourceName),
	),
	ExpectNonEmptyPlan: true,
	ConfigPlanChecks: resource.ConfigPlanChecks{
		PostApplyPostRefresh: []plancheck.PlanCheck{
			plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionCreate),
		},
	},
},
```

Check 단계에서 헬퍼가 **의도적으로 리소스를 밖에서 삭제**하고, refresh에서 리소스가 state에서 빠져 계획이 비지 않으므로 `ExpectNonEmptyPlan: true`가 필요하다. 문제는 **그것이 "계획이 비어 있지 않다"만 말할 뿐 무엇이 계획되었는지는 검증하지 않는다**는 점이다. 설계 결정 문서(2025-04-11, `@jar-b`)가 이 지점을 지적한다 — `terraform-plugin-testing` v1.2.0의 `plancheck` 패키지와 `ExpectResourceAction`으로 사라진 리소스가 **재생성(create)으로 계획되는지**를 명시적으로 확인할 수 있게 됐고, 결정은 기여자 가이드와 `skaff` 스캐폴딩에 이 검사를 넣는 것이었다. **`PostApplyPostRefresh`라는 시점이 핵심**이다 — 삭제가 refresh에 반영된 다음의 계획이라야 의미가 있다.

실패하면 고치는 자리는 정해져 있다. **Read의 API 호출 직후** not-found를 잡아 `d.SetId("")`로 state에서 제거하고 `nil`을 반환하되, 조건에 **`!d.IsNewResource()`** 를 함께 두어(45장의 최종 일관성) 방금 만들어 아직 조회되지 않는 것과 구별한다. **자식 리소스**는 `_disappears_{PARENT}`를 두고 plan check에 부모와 자식 **둘 다**를 넣는다.

## PreCheck · 교차 계정 · 동시성 · sweeper

`PreCheck` 표준 함수는 이미 여럿 있고 **새로 만들기 전에 있는 것을 먼저 찾는다** — `PreCheckRegion` / `PreCheckRegionNot`, `PreCheckPartition` / `PreCheckPartitionNot`, `PreCheckPartitionHasService`(**AWS가 신규·프리뷰 서비스를 목록에 바로 넣지 않아 거짓 양성이 난다**), `PreCheckOrganizationsAccount`, `PreCheckAlternateAccount`, `PreCheckMultipleRegion`. 서비스별 `ErrorCheck`는 `init()`에서 `acctest.RegisterServiceErrorCheck(...)`로 등록하고 본문은 `ErrorCheckSkipMessagesContaining(t, "...")`으로 쓰되 **건너뛰면 안 될 에러까지 삼키지 않도록** 조각을 좁게 잡는다.

**교차 계정**은 세 곳을 바꾼다 — `PreCheck`에 `PreCheckAlternateAccount`, 팩토리를 `ProtoV5FactoriesAlternate`, 설정에 `ConfigAlternateAccountProvider()`를 조합하고 두 번째 계정 쪽에만 `provider = awsalternate`를 붙인다(**주인공 리소스는 provider 지정을 하지 않아 기본 provider를 쓴다**). 자격증명은 `AWS_ALTERNATE_PROFILE` 또는 `AWS_ALTERNATE_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY`이고 없으면 skip이다. **교차 리전**은 **두 번째 리전 `us-east-1`, 세 번째 `us-east-2`가 기본값**이라 추가 설정이 거의 없고 코드는 `PreCheckMultipleRegion(t, 2)` + `ProtoV5FactoriesMultipleRegions(ctx, t, 2)` + `ConfigMultipleRegionProvider(2)`다. 두 경우 모두 **`ImportState: true`인 Step에는 직전 Step과 같은 `Config`를 명시**해야 하고, 원문은 여러 리전을 쓰는 테스트라면 별도 provider 대신 **리소스의 `region` 인수를 고려하라**고 권한다.

**동시성**은 기본 20인데 리전당 개수 제한이 있는 구성 요소가 있다(원문의 예: **SageMaker Domain은 리전당 하나**). 해법은 직렬화다 — 함수 이름을 대문자 `T`에서 **소문자 `t`로 바꿔** Go가 직접 실행하지 못하게 하고, 그 안의 `ParallelTest`를 **`resource.Test`로 바꾸고**, 대문자 `_serial` 함수에서 묶어 `RunSerialTests2Levels(t, testCases, 0)`으로 실행한다. `AWS_EC2_CLIENT_VPN_LIMIT`처럼 동시성을 환경변수로 제어하는 서비스도 있다(**미지정 시 기본 5**).

**Sweeper**는 남은 리소스를 치운다(`make sweep`). **대상 계정·리전의 인프라와 백업을 파괴하며 API의 삭제 보호를 우회하도록 설계**되어 있어 비어 있어야 할 개발 전용 계정 밖에서는 절대 돌리지 않는다. 구현은 서비스의 `sweep.go`에 두고 `RegisterSweepers()`에서 `awsv2.Register("aws_example_thing", sweepThings, "의존 리소스...")`로 등록한다.

## 테스트 생성기: `@Testing` 어노테이션

태깅 테스트와 Resource Identity 테스트는 **패턴이 같아서 생성된다.** 46장의 태깅 코드 생성과 같은 방식으로 서비스의 `generate.go`에서 켜고, 특정 리소스만 빼려면 그 소스 파일에 `@Testing(tagsTest=false)` / `@Testing(identityTest=false)`를 붙인다.

```go
//go:generate go run ../../generate/tagstests/main.go
//go:generate go run ../../generate/identitytests/main.go
```

생성된 테스트를 실제 리소스에 맞추는 것이 `@Testing(...)` 무리다. **공통** 항목은 PreCheck 추가(`preCheck`, `preCheckWithRegion`, `preCheckRegion`), 환경변수 요구(`requireEnvVar`, 값까지 쓰면 `requireEnvVarValue`), 대체 provider(`useAlternateAccount`, `altRegionProvider`), 검사 함수 형태(`existsType`, `hasExistsFunction=false`, `checkDestroyNoop=true`), import 동작(`importIgnore="a;b"`, 미지원이면 `@NoImport`), 직렬화(`serialize`, `serializeDelay="3m30s"`), 이름 생성(`generator`)이다. 참조 형식은 `[<패키지 경로>;[<패키지 별칭>;]]<함수 이름>`으로 통일되어 있다. 기본 파라미터는 `rName`(값은 `acctest.RandomWithPrefix`)이며 **`generator=false`를 쓰지 않았는데 템플릿이 `rName`을 참조하지 않으면 `tflint`가 `terraform_unused_declarations`로 실패한다.**

**태깅 전용** 어노테이션은 AWS 쪽 비표준 동작을 우회한다 — `skipEmptyTags`(빈 문자열 태그 미지원), `skipNullTags`, `tagsUpdateForceNew`, `noRemoveTags`(태그 제거 미지원 — 원문은 AWS 쪽 오류로 본다). **Identity 전용**은 기존 리소스에 추가할 때 `preIdentityVersion="v6.4.0"`처럼 **추가 직전 버전**을(`aws_batch_job_definition`은 6.5.0에서 추가), 새 리소스면 `hasNoPreExistingResource=true`를, 스키마 버전이 오르면 `identityVersion="0;v6.10.0"`을 쓴다.

설정은 `testdata/tmpl/<name>_basic.gtpl` Go 템플릿에서 생성되며 `<name>`은 **구현 파일 이름에서 `.go`를 뗀 것**이다(`load_balancer.go` -> `load_balancer_basic.gtpl`). 템플릿에는 **글로벌이 아니면 선언 맨 위에 `{{- template "region" }}`** 을, **`tags` 자리에 `{{- template "tags" . }}` 를 넣고 블록의 마지막 줄로 두며**, 전제 인프라는 `{{ template "acctest.ConfigVPCWithSubnets" 2 }}` 같은 미리 정의된 섹션으로 끌어온다. **`rName`에서 파생되지 않는 추가 파라미터는 정의할 수 없으므로** 그런 리소스는 수동 작성 테스트로 간다.

## go-vcr · 단위 테스트 · CI

`go-vcr`는 HTTP 요청·응답을 녹화해 재생하는 라이브러리로, provider는 이를 **인수 테스트 성능 개선과 비용 절감**에 쓴다. 재생 모드에서는 실제 인프라 없이 핵심 로직이 실행되며 **효과가 큰 것은 생성 완료를 기다리는 폴링을 건너뛰는 긴 테스트**다.

```sh
make testacc PKG=logs TESTS=TestAccLogsLogGroup_ VCR_MODE=RECORD_ONLY VCR_PATH=/path/to/testdata/
# 재생은 VCR_MODE=REPLAY_ONLY 로 바꾸고 같은 VCR_PATH 를 준다
```

`VCR_MODE`와 `VCR_PATH`를 **둘 다** 설정해야 켜진다. `RECORD_ONLY`는 상호작용을 YAML에 쓰고 **무작위성 시드를 `.seed` 파일에 저장**한다 — 재생 시 리소스 이름이 결정적으로 같아야 요청이 매칭되기 때문이다. `REPLAY_ONLY`는 **요청 헤더와 본문**을 기준으로 녹화를 찾고 **매칭이 없으면 실패한다.** 원문은 지원을 **확장하는 중**이며 **특정 스타일의 테스트에는 아직 안정적으로 녹화·재생하지 못하는 공백이 있다**고 명시한다. 즉 재생 실패는 대개 **go-vcr 지원의 공백**이며 추적 중이 아니면 새 이슈를 연다. 실무 팁 — **녹화와 재생에 항상 같은 디렉터리를 쓴다.**

**단위 테스트**는 AWS에 접근하지 않고 함수 하나에 집중한다. **복잡한 부분을 AWS 접촉 부분에서 분리해 두면 단위 테스트가 가능해진다**는 것이 설계 조언이다. 대상은 **AWS 접촉이 필요 없는 유틸리티 함수**이고 **중간 이상으로 복잡하면 대응하는 단위 테스트를 가져야 하지만**, **전형적인 flatten/expand(flex)처럼 뻔한 패턴은 필요 없다.** 이름은 `Test`로 시작하되 **`TestAcc`가 아니며**, 형태는 `TestName`/`Input`/`Expected`/`Error` 필드의 구조체 슬라이스를 `t.Run`으로 도는 **테이블 주도** 방식이다.

**CI**는 PR마다 enrichment(changelog 생성, 라벨, 자동 코멘트)와 testing을 돌린다. 빨간 X를 만드는 것은 후자이고, `make tools`로 도구를 깔면 `make ci`, `make ci-quick`, `make quick-fix`(copyright 헤더·포맷·인수 테스트 린트·import 순서·Semgrep·Terraform 포맷 자동 수정)로 로컬에서 대부분 선점할 수 있다. 주요 검사는 **go-build / test**, **go_generate**(`make gen-check` — 생성기를 돌린 뒤 변경이 없어야 한다. 단일 서비스는 `make gen PKG=<service>`로 좁힐 수 있지만 **provider 수준 등록이 얽히거나 `internal/generate/`를 건드렸으면 전체 `make gen`**), **acctest-lint**, **import-lint**, 문서 검사, 정적 분석, **test-naming** 이다.

기여자가 아니어도 쓰이는 자리가 **버그 재현 최소 테스트**다. **속성 값이 틀린다** -> `_basic`에 `TestCheckResourceAttr`로 기대값을 박는다. **밖에서 지웠더니 에러가 난다** -> disappears 형태를 그대로 쓴다. **import 후 값이 달라진다** -> `ImportState`/`ImportStateVerify` Step이 어긋난 속성을 알려 준다. 이슈에는 테스트 함수와 설정 함수, 실행 명령, 실패 출력을 붙인다.

## 흔한 실수

### ❌ `CheckDestroy` 없이 테스트를 낸다

테스트는 통과하는데 계정에는 리소스가 쌓이고 Delete가 조용히 실패하는 버그가 통과한다. 원문은 이를 **즉시 머지를 막는 필수 항목**으로 분류한다.

```go
resource.ParallelTest(t, resource.TestCase{
	ProtoV5ProviderFactories: acctest.ProtoV5ProviderFactories,
	// CheckDestroy 없음, Exists 검사도 없음
	Steps: []resource.TestStep{{Config: testAccExampleThingConfig_basic(rName)}},
})
```

```go
// ✅ CheckDestroy와 Exists를 모두 구현한다
resource.ParallelTest(t, resource.TestCase{
	PreCheck:                 func() { acctest.PreCheck(ctx, t) },
	ErrorCheck:               acctest.ErrorCheck(t, names.ExampleServiceID),
	ProtoV5ProviderFactories: acctest.ProtoV5ProviderFactories,
	CheckDestroy:             testAccCheckExampleThingDestroy(ctx, t),
	Steps: []resource.TestStep{{
		Config: testAccExampleThingConfig_basic(rName),
		Check:  resource.ComposeTestCheckFunc(testAccCheckExampleThingExists(ctx, t, resourceName)),
	}},
})
```

### ❌ 이름을 고정한다

병렬 실행에서 여러 테스트가 같은 이름을 만들어 서로를 밟는다.

```go
return `
resource "aws_example_thing" "test" {
  name = "tf-acc-test-thing"
}
`
```

```go
// ✅ 무작위 이름 + 인덱스 지정 verb
// 호출부: rName := acctest.RandomWithPrefix(t, acctest.ResourcePrefix)
return fmt.Sprintf(`
resource "aws_example_thing" "test" {
  name = %[1]q

  tags = {
    Name = %[1]q
  }
}
`, rName)
```

### ❌ AMI ID와 AZ를 하드코딩한다

AMI는 폐기되고 AZ 이름은 리전마다 달라, `us-west-2` 밖에서 그리고 몇 달 뒤에 깨진다.

```terraform
resource "aws_instance" "test" {
  ami               = "ami-0abcdef1234567890"
  availability_zone = "us-west-2a"
  instance_type     = "t3.micro"
}
```

```go
// ✅ 데이터 소스 헬퍼로 조회한다
return acctest.ConfigCompose(
	acctest.ConfigLatestAmazonLinuxHVMEBSAMI(),
	acctest.ConfigAvailableAZsNoOptIn(),
	acctest.AvailableEC2InstanceTypeForRegion("t3.micro", "t2.micro"), `
resource "aws_instance" "test" {
  ami               = data.aws_ami.amzn-ami-minimal-hvm-ebs.id
  availability_zone = data.aws_availability_zones.available.names[0]
  instance_type     = data.aws_ec2_instance_type_offering.available.instance_type
}
`)
```

### ❌ disappears를 `ExpectNonEmptyPlan`만으로 끝낸다

계획이 비어 있지 않다는 것만 확인하므로 **엉뚱한 변경이 계획되어도 통과**한다. 정작 검증하려던 "재생성이 계획되는가"는 확인되지 않는다.

```go
{Check: /* Exists + Disappears */, ExpectNonEmptyPlan: true},
```

```go
// ✅ apply 이후·refresh 이후 시점의 plan check로 재생성을 명시적으로 검증한다
{
	Check:              /* Exists + Disappears */,
	ExpectNonEmptyPlan: true,
	ConfigPlanChecks: resource.ConfigPlanChecks{
		PostApplyPostRefresh: []plancheck.PlanCheck{
			plancheck.ExpectResourceAction(resourceName, plancheck.ResourceActionCreate),
		},
	},
},
```

## 프로덕션 노트

- **테스트 계정은 격리한다.** sweeper는 삭제 보호를 우회하도록 설계되어 있고 기본 대상이 네 개 리전이므로 비어 있어야 할 전용 계정 밖에서 `make sweep`을 돌리는 것은 사고다.
- **비용과 쿼터는 실행 옵션으로 관리한다.** 비싼 서비스는 `PKG`/`TESTS`를 좁히고 `-short`를 쓰며, 쿼터가 낮은 구성 요소는 `P=5`로 낮추거나 `_serial` 패턴을 쓴다. 감당이 안 되면 PR에 적으면 된다.
- **재생(`REPLAY_ONLY`) 실패는 대개 provider 버그가 아니다.** 지원 공백이 남아 있다는 것이 원문의 공식 입장이므로 테스트를 비틀기 전에 알려진 공백인지 확인한다.
- **CI 통과는 `make ci-quick` + `make quick-fix`로 대부분 선점된다.** `terrafmt`, `tflint`, import 순서, copyright 헤더는 자동 수정 대상이다.
- **생성된 테스트(`*_gen_test.go`)는 손으로 고치지 않는다.** 편집하면 `make gen-check`가 CI에서 실패하므로 조정은 언제나 `@Testing(...)`으로 한다.
- **간헐적 실패에는 `TEST_COUNT`가 쓸모 있다.** 경쟁 조건을 의심할 때 같은 테스트를 여러 번 돌려 재현율을 본다.

## 연습문제

1. 자주 쓰는 리소스의 `_basic`과 `_disappears` 테스트를 읽고 `TestCase`의 다섯 필드에 주석을 단다. *성공 기준:* `CheckDestroy`가 호출하는 AWS API 이름, `ErrorCheck`에 넘긴 서비스 ID, disappears의 plan check 시점이 근거와 함께 적혀 있다.

2. 테스트 전용 계정에서 서비스 하나를 `TESTARGS=-short P=5`로 돌리고 `-short` 없이 다시 돌린다. *성공 기준:* 두 실행의 소요 시간과 테스트 개수 차이가 기록되어 있고 건너뛴 테스트 이름이 나열되어 있다.

3. 하드코딩(AMI ID, AZ, 인스턴스 타입, 파티션 중 셋 이상)이 든 설정을 만든 뒤 데이터 소스와 `acctest` 헬퍼로 전부 바꾼다. *성공 기준:* 변경 전후가 나란히 있고 각 항목의 대체 헬퍼와 참조 이름이 정확히 적혀 있다.

4. 겪었거나 이슈 트래커에서 고른 버그 하나에 대해 재현되는 최소 인수 테스트를 작성한다. *성공 기준:* 테스트 함수와 `fmt.Sprintf` 설정 함수가 각각 하나씩 있고 무작위 이름을 쓰며, 실행 명령과 실패해야 할 검사 지점이 첨부되어 있다.

## 요약

- 테스트는 세 층이다 — **acceptance**(실제 AWS를 만들고 지운다), **unit**(AWS 접촉 없는 함수 단위), **CI**(모든 PR에서 도는 린트·빌드·정적 분석). **인수 테스트는 `TF_ACC`가 없으면 건너뛴다.**
- 실행은 `make testacc TESTS=<정규식> PKG=<서비스>`이며 **기본 리전 `us-west-2`**, 기본 동시성 `20`, 기본 타임아웃 `360m`다. `make t T=...`는 패키지를 자동 감지하지만 `TESTS`는 하지 않고, 300초를 넘는 테스트는 `-short`로 건너뛴다.
- `TestCase`의 다섯 축은 **`PreCheck`**(조건 미달이면 skip), **`ErrorCheck`**(skip이어야 할 드문 에러만), **`ProtoV5ProviderFactories`**, **`CheckDestroy`**(리뷰 필수), **`Steps`** 다. Exists 검사는 **provider API**로, computed 값 검증은 **state**로 한다.
- 설정은 **`fmt.Sprintf`만**(`text/template` 금지) 쓰고 **인덱스 verb `%[1]q`** 로 값을 반복하며, 리소스 이름은 `test`, 앞뒤 개행이 필수, **`provider`·`timeouts` 블록은 넣지 않는다.** 설정은 독립적이어야 하고 **기본 VPC나 사용자 인프라를 전제할 수 없다.** 이름 충돌은 **`RandomWithPrefix`** 로 막는다.
- 종류는 **`_basic`**(Required만, read-only·제로값 검증, import 검증), **`_disappears`**, **속성별**, **데이터 소스**, **`_serial`** 이며 CI가 `TestAccResource_MiddleSegment_finalSegment` 규약을 검사한다.
- **disappears는 `ExpectNonEmptyPlan`만으로 부족하다.** 설계 결정(2025-04-11)에 따라 `ConfigPlanChecks.PostApplyPostRefresh`에 **`plancheck.ExpectResourceAction(..., plancheck.ResourceActionCreate)`** 를 넣는다. 실패하면 Read에서 not-found를 잡아 `!d.IsNewResource()` 조건과 함께 state에서 제거한다.
- **교차 계정**은 `AWS_ALTERNATE_*` + `PreCheckAlternateAccount` + `ProtoV5FactoriesAlternate` + `ConfigAlternateAccountProvider`, **교차 리전**은 기본값 `us-east-1`/`us-east-2`에 `PreCheckMultipleRegion` + `ProtoV5FactoriesMultipleRegions` + `ConfigMultipleRegionProvider`다. 동시성 제한이 필요하면 소문자 `t` 함수 + `resource.Test` + `RunSerialTests2Levels`로 직렬화한다(**SageMaker Domain은 리전당 하나**가 대표 사례).
- **태깅·Identity 테스트는 생성된다** — `generate.go`의 `tagstests`/`identitytests` 지시문으로 켜고 조정은 `@Testing(...)`, 설정은 `testdata/tmpl/<name>_basic.gtpl`에서 나온다. **`go-vcr`** 는 `VCR_MODE`와 `VCR_PATH`를 함께 켜 상호작용을 `.yaml`, 시드를 `.seed`에 저장하며 매칭 실패는 대개 **아직 남아 있는 지원 공백**이다.

## 다음으로

- [48장 — 기여 프로세스](48-contributing.md) — 테스트를 통과시킨 다음 PR을 여는 절차와 changelog·문서 규약
- [45장 — 에러 처리 · 재시도 · Waiter](45-errors-retries-waiters.md) — disappears가 검증하는 not-found 처리의 구현
- [44장 — 리소스 구현하기](44-implementing-a-resource.md) — 테스트가 검증하는 CRUD와 스키마
- [43장 — 개발 환경과 skaff](43-dev-environment-and-skaff.md) — 테스트 스켈레톤을 만드는 스캐폴딩
- 공식 문서: [Running and Writing Acceptance Tests](https://hashicorp.github.io/terraform-provider-aws/running-and-writing-acceptance-tests/)
