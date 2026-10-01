---
chapter: 44
level: "Level 3 — 고급"
title: "리소스 구현하기: 스키마 · CRUD · flatten/expand"
difficulty: 심화
reading_time: "36분"
prerequisites: [42, 43]
source_docs:
  - "docs/add-a-new-resource.md"
  - "docs/add-a-new-datasource.md"
  - "docs/add-a-new-ephemeral-resource.md"
  - "docs/add-a-new-function.md"
  - "docs/add-a-new-list-resource.md"
  - "docs/data-handling-and-conversion.md"
  - "docs/finders-and-listers.md"
  - "docs/id-attributes.md"
  - "docs/resource-identity.md"
  - "docs/resource-name-generation.md"
  - "docs/add-import-support.md"
  - "docs/naming.md"
  - "docs/design-decisions/relationship-resource-design-standards.md"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 44장 — 리소스 구현하기: 스키마 · CRUD · flatten/expand

**이 장에서 배우는 것**

- 리소스 하나가 어떤 파일들로 구성되고, Framework 리소스의 뼈대(`Schema`/CRUD/`ImportState`)와 어노테이션이 켜는 기능을 읽을 수 있다.
- `Required`/`Optional`/`Computed`의 조합과 plan modifier가 plan 출력에 어떻게 나타나는지 설명할 수 있다.
- expand와 flatten이 무엇을 옮기는지, AutoFlex가 자동화하는 부분과 손으로 써야 하는 부분을 구분할 수 있다.
- Read의 **"찾을 수 없으면 state에서 제거"** 규칙과 finder 패턴이 drift 처리의 핵심인 이유를 안다.
- `id`·Resource Identity·`name_prefix`가 어떻게 정해지는지 알고, 데이터 소스·ephemeral·function·list가 이 뼈대에서 무엇을 빼고 더하는지 안다.

**왜 중요한가**

문서에는 "Optional"이라고만 적혀 있는 인수가 있다. 값을 지웠더니 AWS 쪽 설정이 그대로 남는다. 버그인가, 의도인가? 답은 소스 세 줄에 있다 — 스키마가 `Optional` + `Computed`이면 **값을 지워도 provider는 "미설정"과 "이전 값 유지"를 구분하지 않는다.** 알면 명시적인 값을 넣거나 그 인수를 관리하지 않는 쪽으로 설계를 바꾼다. 모르면 "이상하다"는 이슈를 열고 2주를 기다린다.

또 다른 상황. 리소스를 콘솔에서 지웠는데 `terraform plan`이 에러를 낸다. 정상이라면 plan은 **"없어졌으니 다시 만들겠다"**여야 한다. 그 차이를 만드는 것이 Read 함수의 대여섯 줄 — finder가 `retry.NotFound`로 판정되는 에러를 반환하고 Read가 `RemoveResource`를 호출하는가다. 이 패턴이 빠진 리소스는 **콘솔 삭제 하나로 파이프라인 전체를 멈춘다.**

이 장의 효용은 코드를 쓰는 것보다 **읽는 것**에 있다. 스키마 한 블록과 CRUD 네 함수를 읽을 줄 알면 문서가 침묵하는 동작을 스스로 판정할 수 있다.

## 리소스 하나는 어떤 파일들인가

`AGENTS.md`의 파일 규약과 `docs/naming.md`를 합치면 최소 넷이다 — 구현 `internal/service/{service}/{thing}.go`, 인수 테스트 `{thing}_test.go`, 사용자 문서 `website/docs/r/{service}_{thing}.html.markdown`(Registry에 그대로 실린다), changelog 엔트리 `.changelog/{PR번호}.txt`.

**파일 이름에 서비스 이름을 넣지 않는다** — 디렉터리가 이미 그 정보를 담고 있다. 데이터 소스는 이름 뒤에 `_data_source`를 붙이고 문서는 `website/docs/d/` 아래로 간다. 리소스 이름 자체는 `aws` + [서비스 식별자](42-provider-architecture.md) + 스네이크 케이스 이름이다(`aws_imagebuilder_image_pipeline`).

여기에 서비스 패키지의 공용 파일들이 따라붙는다 — `find.go`, `flex.go`, `wait.go`, `status.go`, `exports_test.go`(테스트에서 쓸 비공개 함수 노출), `generate.go`, 그리고 생성물인 `service_package_gen.go`·`tags_gen.go`.

리소스 이름 규칙은 **AWS SDK for Go v2의 API 오퍼레이션을 따르라**는 것이어서, 대부분은 이름만 보고 어떤 API를 부르는지 짐작할 수 있다.

## Framework 리소스의 뼈대

신규 리소스는 Plugin Framework이고([42장](42-provider-architecture.md)) 등록은 어노테이션으로 한다.

```go
// @FrameworkResource("aws_something_example", name="Example")
// @Tags(identifierAttribute="arn")
func newExampleResource(_ context.Context) (resource.ResourceWithConfigure, error) {
	return &exampleResource{}, nil
}

type exampleResource struct {
	framework.ResourceWithModel[exampleResourceModel]
}

type exampleResourceModel struct {
	framework.WithRegionModel
	// Schema 의 각 attribute 에 대응하는 필드
}
```


`framework.ResourceWithModel[T]`를 임베드하면 모델 타입이 리소스에 묶이고 `Configure` 같은 공통 뼈대를 상속받는다. 직접 쓰는 메서드는 **`Schema`**, **`Create`/`Read`/`Update`/`Delete`**(각각 `req`에서 plan·state를 읽고 `resp`에 결과를 쓴다), **`ImportState`**, 그리고 선택적으로 `ModifyPlan`·`ValidateConfig`다.

`make gen`이 어노테이션을 스캔해 `service_package_gen.go`에 등록 엔트리를 만든다. 그래서 **어노테이션이 곧 기능 스위치**다 — `@Tags`가 transparent tagging을 켜고([46장](46-implementing-tagging.md)), `@Region`이 리전 처리를, `@ArnIdentity`·`@IdentityAttribute`가 Resource Identity를, `@Testing(...)`이 생성될 테스트의 모양을 정한다. 소스를 읽을 때 **주석 블록을 먼저 보는 것**이 가장 빠른 기능 조사다.

## 스키마 작성: 세 플래그가 만드는 네 가지 의미

`Required`·`Optional`·`Computed`의 조합이 사용자에게 보이는 동작을 결정한다. `Required`는 빠뜨리면 검증 에러, `Optional`은 미설정이면 `null`, `Computed`는 사용자가 쓸 수 없는 읽기 전용이다. 그리고 **`Optional` + `Computed`** 는 "설정 가능하되 미설정이면 원격 값을 그대로 받아들임"이어서 **값을 지워도 diff가 생기지 않는다.**

이 마지막 조합이 가장 많은 혼란을 만드는데, 원문은 이것을 권장 패턴으로 명시한다 — **AWS API가 서버 쪽에서 기본값을 설정한다면 provider 쪽에 기본값을 두지 마라. 대신 `Optional`과 `Computed`로 표시하라.** 서버 쪽 기본값이 나중에 바뀔 때 충돌하지 않기 위해서다. 결론: 문서에 "Optional"이면서 "지정하지 않으면 AWS가 정한다"는 뉘앙스가 있으면 **그 인수는 지워도 원래대로 돌아가지 않는다.**

### Plan modifier와 validator

plan 단계에서 값이 어떻게 계산될지를 바꾸는 장치다. **`RequiresReplace`** 는 이 속성이 바뀌면 **교체**(destroy 후 create)한다 — SDKv2의 `ForceNew`에 해당하며 문서의 "Changing this forces a new resource to be created"가 여기서 나온다. **`UseStateForUnknown`** 은 `Computed` 속성이 바뀔 리 없다고 판단되면 plan에서 `(known after apply)` 대신 **state의 기존 값을 그대로 쓴다.** 없으면 무관한 변경 하나에 ARN·ID가 전부 unknown으로 뜨고 그 값을 참조하는 다른 리소스까지 연쇄로 재계산 대상이 된다 — **plan이 실제보다 위협적으로 보이는** 리소스는 이 plan modifier의 부재를 의심할 근거다.

`Validators`는 apply 전에 값을 거르며 `stringvalidator.ExactlyOneOf(...)`처럼 **속성 사이의 관계**도 검증할 수 있다(`name`과 `name_prefix`가 대표 사례다). 스키마에서 거르면 AWS를 부르기 전에 실패하므로 에러가 훨씬 빠르고 정확하다.

중첩 구조는 셋이다 — `SingleNested`(객체 하나), `ListNested`(순서 있는 목록), `SetNested`(순서 없는 집합). 선택 기준은 **AWS API가 순서를 의미 있게 다루는가**다. 순서가 무의미한 목록을 List로 두면 AWS가 순서를 바꿔 돌려줄 때마다 diff가 생긴다. 타입 대응에서 하나가 예외다 — **AWS의 `structure`는 `MaxItems: 1`인 `types.List`로 표현되어 Terraform 언어에서 `list(object(any))`가 된다.** 블록 하나짜리 설정이 왜 인덱싱되는지(`self.thing[0].field`)가 여기서 설명된다.

## expand와 flatten: 두 세계를 잇는 번역

원문의 정의가 명확하다. **계획된 새 Terraform state를 원격 시스템 요청으로 변환하는 것이 "Expanding", 원격 시스템 응답을 적용될 새 state로 변환하는 것이 "Flattening"** 이다.

### AutoFlex가 대신 해 주는 것

Framework 리소스의 기본 도구는 **AutoFlex**다. `internal/framework/flex`의 `Expand`와 `Flatten` 두 함수가 진입점이고, 원문의 표현대로 **설정 없이도 대부분의 provider 구조체와 AWS API 구조체를 변환할 수 있다.**

매핑은 **필드 이름**으로 하고 순서는 넷이다 — (1) 대소문자를 구분하는 정확한 일치, (2) 대소문자를 무시하는 일치, (3) 복수형·단수형 비교, (4) `flex.WithFieldNamePrefix`로 설정한 접두어를 붙여 비교. **기본적으로 `Tags` 필드는 무시한다** — 태그는 별도 경로로 처리되기 때문이다([46장](46-implementing-tagging.md)). 조정은 `flex.WithIgnoredFieldNamesAppend(...)`와 `flex.WithNoIgnoredFieldNames()`로 한다.

AutoFlex는 **Terraform 블록의 단일 요소 리스트를 AWS 구조체의 단일 struct 또는 포인터 값으로 변환**할 수 있어서 앞 절의 "구조체가 `MaxItems: 1` 리스트로 표현되는" 문제를 흡수한다.

개별 필드는 `autoflex` 네임스페이스의 Go 구조체 태그로 제어한다. **`",legacy"`** 는 Plugin SDK 동작을 보존해 **빈 문자열이나 숫자 0 같은 zero value를 `null`과 동등하게 취급**한다(SDKv2→Framework 마이그레이션용). **`",omitempty"`** 는 `string`에서 빈 문자열이 오면 `null`을 저장하고, **`"-"`** 는 필드를 완전히 무시하며, **`",noexpand"`/`",noflatten"`** 은 각각 expand 때만·flatten 때만 무시한다.

`legacy` 태그의 존재가 핵심 사실 하나를 드러낸다. **SDKv2에는 `null`과 zero value의 구분이 없다** — `TypeBool`은 `false`, `TypeInt`은 `0`, `TypeString`은 `""`가 zero value다. 그래서 SDKv2 리소스에서는 "설정하지 않았다"와 "빈 문자열을 설정했다"가 구분되지 않고 로직이 이 특수 값을 항상 고려해야 한다. Framework는 이 구분을 타입 차원에서 갖는다. **같은 provider인데 어떤 리소스는 빈 값이 먹고 어떤 리소스는 안 먹는 이유가 이것이다.**

### 손으로 써야 하는 경우

AutoFlex로 안 되는 대표 사례가 **union 타입**이다. **Terraform 스키마는 union을 지원하지 않으므로** provider는 타입마다 중첩 스키마를 정의하고 하나만 허용하도록 제약한 뒤 모델에 `flex.Flattener`나 `flex.Expander`를 구현해 분기한다.

수동 flex 함수는 `expand{Service}{Type}` / `flatten{Service}{Type}`으로 이름 짓고 **가장 지역적인 위치에 정의**한다(한 리소스면 리소스 파일, 세 서비스 이상이면 `internal/flex/flex.go`). Framework 쪽 flatten은 `apiObject == nil`일 때 `types.ListNull(elemType)`을 돌려준다 — **빈 리스트가 아니라 null이다.**

### 암묵적 state 통과라는 함정

**plan이나 apply 중에 어떤 루트 속성이나 블록의 값이 갱신되지 않으면, 이전 state가 새 state로 암묵적으로 깊은 복사된다.** flatten에서 속성을 빼먹으면 에러가 나는 게 아니라 **조용히 예전 값이 유지되고 drift 감지가 영원히 되지 않는다.** 단 **중첩 속성·블록에는 적용되지 않는다.** 원문의 조언은 **state 검증을 포함한 import 테스트**로 잡으라는 것이다. 사용자 관점의 함의: 어떤 속성이 콘솔에서 바꿔도 절대 diff가 안 나면 "무시하도록 설계된 것"이거나 **flatten 누락 버그**다.

## Create의 표준 흐름

여섯 단계가 거의 항상 같다 — (1) `req.Plan`에서 모델을 읽고, (2) AWS SDK 입력 구조체를 **expand**로 채우고, (3) API를 호출하고, (4) 에러를 처리하고([45장](45-errors-retries-waiters.md)), (5) 식별자(`id`와 Resource Identity)를 정하고, (6) **waiter**로 사용 가능 상태를 기다린 뒤 응답을 **flatten**해 state에 쓴다. Framework 코드로는 `req.Plan.Get` → `fwflex.Expand` → API 호출 → `fwflex.Flatten` → `resp.State.Set` 순서다.

두 가지가 중요하다. **Create가 끝나면 state는 완전해야 한다** — `Computed` 속성이 채워지지 않은 채 끝나면 Terraform이 "provider가 unknown 값을 채우지 않았다"고 에러를 낸다. 그리고 **waiter 없이 성공을 선언하면 뒤따르는 리소스가 "아직 준비 안 됨" 에러로 실패한다** — Create 응답은 대개 "요청을 접수했다"이지 "쓸 준비가 됐다"가 아니다.

## Read와 "찾을 수 없으면 state에서 제거"

Read는 두 가지 일을 한다 — 원격 상태를 읽어 state를 갱신하고, **리소스가 사라졌으면 state에서 지운다.** 두 번째가 drift 처리의 핵심이다.

```go
output, err := findDBShardGroupByID(ctx, conn, shardGroupID)

if retry.NotFound(err) {
	response.Diagnostics.Append(fwdiag.NewResourceNotFoundWarningDiagnostic(err))
	response.State.RemoveResource(ctx)
	return
}
if err != nil {
	response.Diagnostics.AddError(fmt.Sprintf("reading RDS Shard Group (%s)", shardGroupID), err.Error())
	return
}
```

세 갈래를 구분하는 것이 요점이다 — **찾을 수 없음**은 에러가 아니라 **경고 + state 제거**, 그 밖의 에러는 진짜 에러, 성공이면 flatten. `RemoveResource`가 호출되면 다음 plan은 "새로 만들겠다"가 되고 파이프라인은 멈추지 않는다.

SDKv2 쪽은 `!d.IsNewResource() && retry.NotFound(err)` 조건이 붙는다. **방금 만든 리소스가 최종 일관성 때문에 아직 안 보일 수 있어서**, 그때 state에서 지워 버리면 "apply는 성공했는데 아무것도 안 만들어진" 상태가 되기 때문이다.

## finder 패턴

원문의 정의가 그대로 규약이다 — **finder는 리소스의 Read 핸들러에서 호출되어 AWS API로부터 리소스의 현재 상태를 반환하는 함수이며, AWS API가 리소스가 더 이상 존재하지 않는다고 알리면 finder는 `retry.NotFound` 함수가 `true`를 반환하는 에러를 반환해야 한다.**

별도 함수로 빼는 이유는 **재사용**(인수 테스트의 `CheckDestroy`와 `Exists`가 같은 finder를 쓴다 — 그래서 `exports_test.go`로 노출한다), **계층화**, **일관성**이다.

단수 finder의 뼈대는 `Describe` 호출 → AWS의 not-found 에러 타입을 `&retry.NotFoundError{LastError: err}`로 매핑 → 그 밖의 에러는 그대로 반환 → 응답이 비었으면 `tfresource.NewEmptyResultError()`다. 여러 개를 돌려주는 API는 페이지네이터로 모은 뒤 `tfresource.AssertSingleValueResult`로 하나임을 단언한다.

계층 규칙이 원문에 명시되어 있고, 이것이 finder를 읽을 때 가장 유용한 지식이다 — **AWS의 resource-not-found 에러를 `retry.NotFound` 에러로 매핑하는 일은 가장 낮은 계층**(`Describe` 호출에 가장 가까운 곳)에서, **논리적 삭제 확인**(리소스의 현재 상태 값 검사)은 **가장 높은 계층**(Read 핸들러에 가장 가까운 곳)에서 한다.

두 번째가 특히 실용적이다. EFS Access Point의 finder는 `LifeCycleState`가 `deleted`이면 `retry.NotFoundError`를 반환한다. AWS는 여전히 객체를 돌려주지만 **Terraform 관점에서는 없는 것**이다. 이 계층이 없으면 "삭제됨" 리소스를 계속 관리하려 들면서 이상한 에러가 난다.

## Update와 Delete

**Update는 부분 업데이트가 기본**이다. plan과 state를 모두 받아 실제로 바뀐 것만 API 호출에 담는다. 전부 보내면 다른 주체가 관리하는 필드를 덮어쓸 수 있고 "변경 없음"을 에러로 취급하는 API에서 실패한다. 끝나면 Create처럼 waiter로 안정 상태를 기다린 뒤 state를 쓴다.

**Delete는 멱등해야 한다.** 이미 없는 리소스에 not-found 에러가 나면 성공으로 취급한다 — `destroy` 도중 실패해 재시도하거나 다른 리소스가 연쇄로 지운 상황이 늘 있기 때문이다.

관계 리소스(attachment·assignment류)에는 별도 표준이 있다 — **신규 "one-to-many" 관계 리소스는 단수형(singular)으로 구현하는 것이 모범 사례**다. 근거는 실측으로, 복수형 API를 가진 17개 리소스 중 **13개(76%)가 단수형 구현**을 쓰고 있었다. 예외는 **모든 부모/자식 관계를 배타적으로 관리해야 하는 정당한 사용 사례**가 있을 때다([35장](35-relationship-resources.md)).

## ID와 Resource Identity

역사적으로 모든 리소스에는 읽기 전용 `id` 속성이 있었다. SDKv2와 그 인수 테스트 라이브러리가 요구했기 때문인데, **Framework와 독립된 `terraform-plugin-testing`이 나오면서 이 요구는 사라졌다.** 현재 표준은 — **신규 리소스에서 `id`가 기존 인수와 중복되거나 여러 인수의 조합이라면 `id`를 생략한다.** 조합일 때는 콤마(`,`)로 구분하고 `ImportState`에서 내부 함수 `ExpandResourceID`로 나눈다. `id`가 없는 리소스의 import 테스트에는 `ImportStateVerifyIdentifierAttribute`와 `ImportStateID`/`ImportStateIdFunc` 중 하나가 필요하다. 단순한 경우의 `ImportState`는 한 줄이다 — `resource.ImportStatePassthroughID(ctx, path.Root("vpc_endpoint_id"), req, resp)`.

### 세 종류의 Identity

Terraform 1.12가 도입한 **구조화된 식별 데이터**다([20장](../level2-intermediate/20-import-and-resource-identity.md)).

- **ARN Identity** — `@ArnIdentity`. 단, **그 리소스 타입의 AWS API가 원격 리소스를 식별하는 파라미터로 ARN을 받을 때만** 쓴다. 기본 속성 이름은 `arn`이고 다르면 이름을 준다(`@ArnIdentity("resource_arn")`).
- **Singleton Identity** — `@SingletonIdentity`. 리전당(글로벌이면 계정당) 하나만 존재할 수 있는 리소스.
- **Parameterized Identity** — `@IdentityAttribute("<속성명>")`을 하나 이상. **`account_id`와 `region`은 항상 포함되므로 어노테이션에 적지 않는다.** 식별 속성이 `null`일 수 있으면 `optional=true`를 붙인다(`aws_route53_record`의 `set_identifier`).

Identity 속성에는 **리소스를 유일하게 식별하는 것만** 담는다. 원문의 예가 `aws_s3_bucket_acl`이다 — `acl`은 `id`의 일부지만 Bucket ACL을 식별하지 않으므로 뺀다.

식별 속성이 여러 개면 import ID를 파싱할 핸들러가 필요하다. Framework 쪽은 `inttypes.ImportIDParser`(메서드 `Parse(id string) (string, map[string]string, error)`)를 구현하는 구조체를 만들고 `@ImportIDHandler("<구조체명>")`으로 연결한다. `id`를 여러 필드에서 조합해야 하면 `inttypes.FrameworkImportIDCreator`도 구현하고 `setIDAttribute=true`를 준다. 신규 리소스는 `@Testing(hasNoPreExistingResource=true)`로, 기존 리소스는 `@Testing(preIdentityVersion="v6.4.0")`처럼 표시한다.

## 이름 자동 생성: `name` · `name_prefix` · 완전 생성

많은 AWS 리소스에서 이름은 유일해야 하고 이름이 바뀌면 교체가 일어난다. 그래서 provider는 세 단계를 표준으로 제공한다 — 사용자가 **이름을 정하거나**, **접두어만 주고 나머지를 생성하게 하거나**, **완전히 생성하게** 한다. 구현은 스키마에서 `name_prefix`를 추가하고 `name`을 `Optional`+`Computed`로 바꾼 뒤 **둘이 서로 충돌하도록** 만든다(Framework는 `stringvalidator.ExactlyOneOf`, SDKv2는 `ConflictsWith`). 두 속성 모두 plan modifier로 `UseStateForUnknown`과 `RequiresReplace`를 단다(SDKv2는 `ForceNew: true`). Create에서는 `create.Name(ctx, plan.Name.ValueString(), plan.NamePrefix.ValueString())`을 쓴다.

import를 지원한다면 **Read에서 둘 다 설정**해야 한다 — `name`은 API 응답 값으로, `name_prefix`는 `create.NamePrefixFromName()`으로 역산해서. 빠뜨리면 import 직후 plan에 diff가 생긴다. **문서에 `name_prefix`가 있는지 보는 것만으로 이 리소스가 이름 생성 3단을 지원하는지 알 수 있다.**

## 다른 유형은 무엇을 빼고 더하는가

**데이터 소스**(`@FrameworkDataSource`, `framework.DataSourceWithModel[T]`)는 **Read 하나만** 있다. 스키마는 대부분 `Computed`이고, 원문의 규칙 하나가 실무적이다 — **`Computed` 속성만 있는 객체에는 항상 `framework.DataSourceComputedListOfObjectAttribute` 헬퍼를 쓴다.** 이유가 각주에 있다: **완전 computed 블록은 Terraform 프로토콜 V6에서 지원되지 않으며** AWS Provider는 미래의 메이저 버전에서 V6를 채택한다. 서버 사이드 필터링을 지원하는 서비스라면 스키마에 `namevaluesfilters.Schema()`를 더해 `name`/`values`를 갖는 `filter` 블록을 노출할 수 있다.

**Ephemeral 리소스**(`@EphemeralResource`)는 **`Open` 핸들러**만 갖고 **state에 저장되지 않는다.** CRUD도 import도 없다([26장](../level2-intermediate/26-secrets-and-ephemeral.md)).

**Function**은 리소스가 아니다. `Definition`(파라미터와 반환 타입)과 `Run`(로직) 두 메서드뿐이고 결정적 제약이 있다 — **함수는 실행 간 재현 가능해야 하며(순수 함수), 이 요구는 네트워크 호출을 배제한다.** AWS API가 필요하면 데이터 소스를 쓴다([33장](../level2-intermediate/33-provider-functions-and-policies.md)).

**List 리소스**는 기존 리소스에 **Listing 오퍼레이션을 덧붙이는 사이드카**다([37장](37-list-resources-and-query.md)). 전제 조건이 있다 — **대상 리소스에 Resource Identity가 구현되어 있어야 한다.** 이름은 대상 리소스와 동일하게 짓고 어노테이션은 `@FrameworkListResource("<resource_name>")`(SDKv2 대상이면 `@SDKListResource`)이며 값은 연관된 리소스 타입 이름과 일치해야 한다. 핵심 지침은 **재사용**이다 — Read에서 API 응답을 모델로 flatten하는 부분을 `flatten` 메서드로 추출하고 **List와 Read가 모두 그 함수를 호출**한다.

## 흔한 실수

### ❌ 서버 기본값을 provider 스키마의 기본값으로 복사한다

AWS가 서버 쪽 기본값을 바꾸면 provider가 옛 값을 강제로 되돌리려 하면서 영구 diff가 생긴다.

```go
// ❌ AWS 문서에 적힌 기본값을 그대로 스키마에 박는다
"retention_days": schema.Int64Attribute{Optional: true, Default: int64default.StaticInt64(30)},

// ✅ Optional + Computed 로 두고 서버가 정한 값을 받아들인다
"retention_days": schema.Int64Attribute{Optional: true, Computed: true},
```

### ❌ Read에서 not-found를 그냥 에러로 올린다

콘솔에서 지운 순간부터 `plan`이 실패하고 사용자는 `terraform state rm`을 손으로 해야 한다.

```go
// ❌ 모든 에러를 한 갈래로 처리한다
output, err := findThingByID(ctx, conn, id)
if err != nil {
	resp.Diagnostics.AddError("reading Thing", err.Error())
	return
}

// ✅ 찾을 수 없음은 경고 + state 제거로 분기한다
if retry.NotFound(err) {
	resp.Diagnostics.Append(fwdiag.NewResourceNotFoundWarningDiagnostic(err))
	resp.State.RemoveResource(ctx)
	return
}
if err != nil {
	resp.Diagnostics.AddError("reading Thing", err.Error())
	return
}
```

### ❌ flatten에서 속성 하나를 빠뜨린다

에러가 나지 않는다. **암묵적 state 통과** 때문에 이전 값이 조용히 유지되고 그 속성은 영원히 drift를 감지하지 못한다.

```go
// ❌ 응답의 일부만 state 에 쓴다 — 나머지는 예전 값이 남는다
state.Name = fwflex.StringToFramework(ctx, output.Name)

// ✅ 응답 구조체 전체를 flatten 하고, import 테스트로 state 를 검증한다
resp.Diagnostics.Append(fwflex.Flatten(ctx, output, &state)...)
```

### ❌ `name_prefix`를 Read에서 설정하지 않는다

import 직후 `terraform plan`이 `name_prefix`에 diff를 만든다.

```go
// ❌ name 만 설정한다
state.Name = fwflex.StringToFramework(ctx, output.Name)

// ✅ 접두어를 역산해 함께 설정한다
state.NamePrefix = create.NamePrefixFromName(fwflex.StringToFramework(ctx, output.Name))
```

## 프로덕션 노트

- **소스에서 확인할 세 가지** — 어노테이션 블록(기능 스위치), 스키마의 플래그와 plan modifier(교체·unknown 동작), Read의 not-found 분기(drift 처리). 이 셋이면 문서에 없는 동작 대부분이 설명된다.
- **`Optional`+`Computed` 인수는 "지워서 되돌릴 수 없다"고 가정한다.** 원하는 값을 명시하거나 `lifecycle { ignore_changes }`로 관리에서 뺀다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md)).
- **plan에 unknown이 과하게 뜨면 `UseStateForUnknown` 부재를 의심한다.** 무해한 변경 하나가 하위 리소스 전체를 재계산 대상으로 만들면 이슈 후보다.
- **콘솔에서 지운 뒤 `plan`이 에러를 내면 그것은 버그다.** 임시 대응은 `terraform state rm`이지만 근본 원인은 Read의 not-found 분기 누락이다. 그리고 **이름이 교체를 유발하는 리소스에서 `name`을 직접 지정하면 `create_before_destroy`가 이름 충돌로 실패한다** — `name_prefix`가 있으면 충돌하지 않는다.
- **관계 리소스는 단수형이 표준이다.** 여러 관계를 한 리소스로 관리하려는 요구는 대개 `for_each`로 푸는 것이 맞고, 배타적 관리가 필요하면 `*_exclusive` 계열을 쓴다([35장](35-relationship-resources.md)).

## 연습문제

1. 자주 쓰는 리소스 하나의 구현 파일을 열어 스키마 전체를 표로 옮긴다. *성공 기준:* 각 속성의 Required/Optional/Computed 조합과 plan modifier 유무가 기록되어 있고, 공식 문서의 "Optional"·"forces a new resource" 서술과 대조되어 있으며 불일치가 표시되어 있다.

2. 같은 리소스의 Read와 finder를 추적해 not-found 처리 경로를 그린다. *성공 기준:* AWS 에러 타입이 `retry.NotFoundError`로 매핑되는 지점과 논리적 삭제 검사 지점이 각각 특정되어 있고 원문의 계층 규칙과 일치하는지 판정되어 있다.

3. 테스트 계정에서 리소스를 만든 뒤 콘솔에서 삭제하고 `terraform plan`을 돌린다. *성공 기준:* plan이 에러가 아니라 재생성 계획을 내고 로그에 state 제거 경고가 나타나며, `Optional`+`Computed` 인수를 지우는 실험의 diff 유무도 기록되어 있다.

## 요약

- 리소스 하나는 **구현 `.go`, 인수 테스트 `_test.go`, `website/docs/r/` 문서, `.changelog/` 엔트리** 네 파일이 기본이다. Framework 리소스는 `framework.ResourceWithModel[T]`를 임베드하고 `Schema`·CRUD·`ImportState`를 구현하며 **어노테이션이 기능 스위치**다(`@FrameworkResource`, `@Tags`, `@Region`, `@ArnIdentity`, `@Testing`).
- **`Optional`+`Computed`** 는 "설정 가능하되 미설정이면 원격 값을 받아들임"이다. **AWS가 서버 쪽 기본값을 정하면 provider 쪽 기본값을 두지 않고 이 조합을 쓴다** — 값을 지워도 되돌아가지 않는다. `RequiresReplace`는 교체를, `UseStateForUnknown`은 불필요한 unknown 확산을 막고, AWS의 `structure`는 **`MaxItems: 1`인 리스트**여서 `list(object(any))`가 된다.
- **expand는 설정→API 입력, flatten은 API 출력→state**다. Framework의 기본 도구는 **AutoFlex**(`flex.Expand`/`flex.Flatten`)로 필드 이름 4단계 매칭으로 동작하며 **기본적으로 `Tags` 필드를 무시**한다. 필드 단위 조정은 `autoflex:",legacy"`(zero value를 null과 동등 취급)·`",omitempty"`·`"-"`·`",noexpand"`·`",noflatten"` 태그로, union 타입은 `flex.Flattener`/`flex.Expander`로 처리한다.
- **암묵적 state 통과** — 루트 속성이 갱신되지 않으면 이전 state가 조용히 복사되어, flatten 누락이 에러가 아니라 **영구적인 drift 미감지**로 나타난다. import 테스트로 잡는다.
- Read의 규칙은 **찾을 수 없으면 경고 + `RemoveResource`**, 그 밖은 진짜 에러다(SDKv2는 최종 일관성 때문에 `!d.IsNewResource()` 조건이 붙는다). **finder**는 Read·`CheckDestroy`·`Exists`가 공유하는 단일 진입점이고, **AWS not-found → `retry.NotFoundError` 매핑은 가장 낮은 계층에서, 논리적 삭제 검사는 가장 높은 계층에서** 한다.
- 신규 리소스는 **중복되거나 조합인 `id`를 생략**한다. Resource Identity는 **ARN / Singleton / Parameterized** 세 종류이고 Parameterized에는 `account_id`와 `region`이 항상 포함된다. 이름 생성 3단은 `name` + `name_prefix` + `create.Name()`이며 **Read에서 `create.NamePrefixFromName()`으로 둘 다 설정**해야 import 후 diff가 없다.
- 데이터 소스는 **Read만**(완전 computed 객체에는 `framework.DataSourceComputedListOfObjectAttribute` — 프로토콜 V6가 완전 computed 블록을 지원하지 않는다), ephemeral은 **`Open`만이고 state에 저장되지 않으며**, function은 **네트워크 호출이 금지된 순수 함수**, list는 **대상의 Resource Identity가 전제**이고 Read와 `flatten`을 공유한다.

## 다음으로

- [45장 — 에러 처리·재시도·Waiter](45-errors-retries-waiters.md) — Create/Update 뒤의 waiter와 최종 일관성
- [46장 — 태깅 구현](46-implementing-tagging.md) — `@Tags`가 켜는 transparent tagging
- 공식 문서: [Terraform Plugin Framework — Resources](https://developer.hashicorp.com/terraform/plugin/framework/resources)
