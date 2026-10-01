---
chapter: 46
level: "Level 3 — 고급"
title: "태깅 구현: 코드 생성과 transparent tagging"
difficulty: 심화
reading_time: "34분"
prerequisites: [23, 44]
source_docs:
  - "docs/resource-tagging.md"
  - "docs/adding-a-tag-resource.md"
  - "docs/naming.md"
  - "website/docs/guides/resource-tagging.html.markdown"
  - "website/docs/guides/tag-policy-compliance.html.markdown"
  - "website/docs/r/ec2_tag.html.markdown"
  - "website/docs/r/autoscaling_group.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging"
provider_baseline: "6.x"
---

# 46장 — 태깅 구현: 코드 생성과 transparent tagging

**이 장에서 배우는 것**

- 서비스마다 제각각인 AWS 태그 API를 provider가 어떻게 하나의 `tags`/`tags_all` 계약으로 통일하는지 설명할 수 있다.
- `generate.go`의 `//go:generate` 지시문과 플래그가 `tags_gen.go`에 무엇을 만드는지 읽고 새 서비스에 태깅을 켜는 절차를 짤 수 있다.
- `@Tags` 어노테이션이 켜는 transparent tagging의 흐름(인터셉터, `getTagsIn`, `setTagsOut`)을 추적하고 쓸 수 없는 경우를 판정할 수 있다.
- `default_tags`와 `ignore_tags`가 어느 계층에서 적용되는지 알고 `aws_autoscaling_group`이 예외인 이유를 구현 관점에서 설명할 수 있다.
- 개별 태그 리소스를 추가하는 절차와 그 리소스가 부모와 충돌하는 구조적 이유, 태그 정책 검사가 끼어드는 시점과 SDKv2의 warning 제약을 안다.

**왜 중요한가**

`tags`는 provider에서 가장 널리 퍼진 인수다. 1,600개가 넘는 리소스가 같은 이름·타입·`tags_all` 계산 규칙을 지켜야 한다. 그런데 그 아래의 AWS API는 통일되어 있지 않다 — 생성 요청에 `Tags` 필드를 넣는 서비스와 생성 후 별도 API를 호출해야 하는 서비스가 있고, 구조체·필드 이름도 목록 API 이름도 제각각이다. **이 간극을 사람이 손으로 메우면 1,600번 다르게 틀린다.**

실제로 벌어지는 일은 이런 모양이다. 어떤 리소스에서 `tags`를 지우면 태그가 사라지는데 다른 리소스에서는 남는다. 어떤 리소스는 `default_tags`를 반영하고 어떤 리소스는 무시한다. 둘 다 태깅이 리소스마다 손으로 쓰이던 시절의 전형적인 버그였고, 그래서 provider는 이 영역을 **코드 생성**과 **인터셉터**로 옮겼다.

이 장의 실전 효용은 셋이다. **어떤 리소스가 태그를 어떤 방식으로 지원하는지 소스에서 판정할 수 있고**, **태그 버그를 "인터셉터가 안 붙었다" 수준으로 정확히 제보할 수 있으며**, 태그 지원이 빠진 리소스에 **직접 PR을 여는 경로**가 생긴다 — 절차가 가장 잘 정리된 영역이어서 첫 기여로 적합하다.

## 태깅은 왜 특별 취급인가

원문은 태깅 지원을 추가하는 일을 네 덩어리로 나눈다 — **서비스 태깅 코드 생성**, **리소스 코드**, **인수 테스트**, **문서**다. 인수 하나를 더하는 일이 왜 이렇게 커지는지는 AWS 쪽 사정을 보면 드러난다.

- **태그를 담는 Go 타입이 다르다.** 단순 맵(`map[string]*string`)인 서비스가 있고 `Key`/`Value` 필드를 가진 구조체의 슬라이스인 서비스가 있다.
- **구조체 이름과 필드 이름이 다르다.** AppMesh는 `Tag`가 아니라 `TagRef`를, KMS는 `Tag` 안에 `Key`/`Value`가 아닌 `TagKey`/`TagValue`를 쓴다.
- **같은 서비스 안에서도 API마다 타입이 다르다.** Auto Scaling은 리소스 호출에서는 `Tag`를 쓰지만 `DescribeTags`는 `TagDescription`을 돌려준다.
- **태그를 읽는 방법이 다르다.** 리소스 조회에 태그가 함께 오는 서비스가 있고 `ListTagsForResource` 같은 별도 API가 필요한 서비스가 있으며, 그 API 이름조차 통일되어 있지 않다(Auto Scaling은 `DescribeTags`).
- **태그를 쓰는 방법이 다르다.** `TagResource`/`UntagResource`가 표준처럼 보이지만 ElastiCache는 `AddTagsToResource`/`RemoveTagsFromResource`다.
- **생성 시 태깅 가능 여부가 다르다.** 생성 요청에 태그를 넣을 수 있는 API가 있고 생성 후 따로 붙여야 하는 API가 있다.

사용자에게 보이는 계약은 이 차이들과 무관하게 하나여야 한다 — **`tags`는 리소스에 직접 설정한 태그, `tags_all`은 그것과 provider `default_tags`의 합집합.** 그 간극을 메우는 것이 코드 생성기다.

## 코드 생성: `generate.go`와 `tags_gen.go`

각 서비스 디렉터리에는 생성기 지시문만 담는 `generate.go`가 있다. 규정은 엄격하다 — **이 파일은 생성 지시문과 패키지 선언만 담아야 한다**(예: `package eks`). 결과물은 같은 디렉터리의 `tags_gen.go`이고(`internal/service/ec2/tags_gen.go`), **생성기 코드 자체(`internal/generate/tags`)는 일반적으로 손댈 필요가 없다.**

```go
//go:generate go run ../../generate/tags/main.go -ServiceTagsSlice -ListTags -UpdateTags
```

지시문 하나에 플래그를 여러 개 붙이는 방식이다. 자주 실수하는 지점이 원문에 명시되어 있다 — **`generate/tags/main.go` 지시문을 두 개 이상 넣으면 안 된다.** 뒤가 앞을 덮어쓰기 때문에, 여러 종류를 만들려면 **지시문 하나에 플래그를 여러 개** 쓴다. **플래그 없이 지시문만 있으면 아무 일도 하지 않는다.**

### 무엇이 생성되는가

태깅을 지원하는 모든 서비스에서 두 함수가 만들어진다 — **`keyValueTags`**(SDK가 돌려주는 서비스별 구조체를 provider 공통 형식으로 변환)와 **`svcTags`**(그 역방향). 서비스가 별도 태그 API를 가지면 **`listTags`**와 **`updateTags`**가 추가되고, 태그 하나를 조회하는 **`GetTag`** 와 생성 후 태깅용 **`createTags`** 는 선택 사항이다.

### 플래그 고르기

원문에서 확인되는 플래그들을 용도별로 묶으면 이렇다.

| 목적 | 플래그 | 언제 |
|---|---|---|
| 타입 형태 | `-ServiceTagsMap` | 태그가 단순 맵일 때 |
| | `-ServiceTagsSlice` | 태그가 구조체 슬라이스일 때 |
| | `-TagType=<이름>` | 구조체 이름이 `Tag`가 아닐 때(AppMesh는 `TagRef`) |
| | `-TagType2=<이름>` | API에 따라 타입이 하나 더 있을 때(Auto Scaling의 `TagDescription`) |
| | `-TagTypeKeyElem` / `-TagTypeValElem` | 키·값 필드가 `Key`/`Value`가 아닐 때(KMS는 `TagKey`/`TagValue`) |
| 태그 읽기 | `-ListTags` | 별도 목록 API가 있을 때 |
| | `-ListTagsOp=<API>` | 그 API가 `ListTagsForResource`가 아닐 때(Auto Scaling은 `DescribeTags`) |
| | `-ListTagsInIDElem=<필드>` | 식별자 필드가 `ResourceArn`이 아닐 때(CloudWatch는 `ResourceARN`) |
| | `-ListTagsInIDNeedSlice=yes` | 식별자를 슬라이스로 받을 때 |
| | `-ListTagsOutTagsElem=<경로>` | 결과의 태그 필드가 `Tags`가 아닐 때(CloudTrail은 `ResourceTagList[0].TagsList`) |
| | `-GetTag` | 태그 하나를 조회하는 함수가 필요할 때 |
| 태그 쓰기 | `-UpdateTags` | 별도 태그 갱신 API가 있을 때 |
| | `-TagOp=<API>` | 추가 API가 `TagResource`가 아닐 때(ElastiCache는 `AddTagsToResource`) |
| | `-TagInIDElem=<필드>` | 식별자 필드가 `ResourceArn`이 아닐 때(EC2는 `Resources`) |
| | `-TagInIDNeedSlice=yes` | 식별자를 슬라이스로 받을 때 |
| | `-UntagOp=<API>` | 제거 API가 `UntagResource`가 아닐 때(ElastiCache는 `RemoveTagsFromResource`) |
| | `-UntagInTagsElem=<필드>` | 제거 API의 태그 필드가 다를 때(Route 53은 `Keys`) |
| 생성 후 태깅 | `-CreateTags` | 생성 API가 태깅을 지원하지 않아 `createTags`가 필요할 때 |

**API 이름과 구조체 이름을 넘길 때 패키지 이름은 붙이지 않는다.** 생성은 `make gen`, 컴파일 확인은 `make test`다.

이 표를 거꾸로 읽으면 진단 도구가 된다. 어떤 서비스의 `generate.go`에 `-ListTags`가 없다면 **리소스를 조회할 때 태그가 함께 온다**는 뜻이고, `-CreateTags`가 있다면 **생성 직후에 태그를 따로 붙인다**는 뜻이다.

## 스키마: `tags`와 `tags_all`

두 속성은 `names` 패키지의 상수 이름(`names.AttrTags`, `names.AttrTagsAll`)과 `internal/tags` 패키지의 헬퍼로 선언한다. **`tags`는 리소스에 직접 설정한 태그, `tags_all`은 그것과 provider `default_tags`의 합집합**이라는 정의가 여기서 코드가 된다.

```go
// Terraform Plugin Framework
names.AttrTags:    tftags.TagsAttribute(),
names.AttrTagsAll: tftags.TagsAttributeComputedOnly(),

// Terraform Plugin SDK V2
names.AttrTags:    tftags.TagsSchema(),
names.AttrTagsAll: tftags.TagsSchemaComputed(),
```

이름이 모든 것을 말한다. `tags`는 **설정 가능**하고 `tags_all`은 **computed 전용**이다. 사용자가 `tags_all`을 쓸 수 없는 것도, plan에서 `tags_all`이 `(known after apply)`로 뜰 때가 있는 것도 이 선언에서 나온다 — `default_tags`가 unknown 값을 담고 있으면 합집합도 unknown이 된다. 헬퍼 대신 손으로 스키마를 쓰면 타입·설명·검증이 리소스마다 어긋나므로 **손으로 선언한 태그 스키마는 그 자체가 리뷰 지적 대상**이다.

## Transparent tagging: `@Tags` 어노테이션 하나

원문의 표현이 정확하다 — **태깅을 지원하는 모든 서비스가 transparent(또는 implicit) tagging이라는 장치를 쓰며, 태그 기능의 대부분은 리소스의 CRUD 핸들러가 아니라 provider 런타임 패키지(`internal/provider/intercept.go`와 `internal/provider/fwprovider/intercept.go`)의 코드로 구현된다.** 리소스 구현자는 **어노테이션(특별한 형식의 Go 주석)을 팩토리 함수에 붙여 여기에 옵트인한다.**

```go
// @FrameworkResource("aws_service_example", name="Example")
// @Tags(identifierAttribute="arn")
func newResourceExample(_ context.Context) (resource.ResourceWithConfigure, error) {
	return &resourceExample{}, nil
}
```

SDKv2 리소스도 같은 모양이다(`// @SDKResource(...)` + `// @Tags(...)`). **`identifierAttribute`는 태그 목록·갱신 API 호출에 쓸 값이 담긴 스키마 속성**을 가리키며 흔한 값은 `"arn"`과 `"id"`다. 예외도 명시되어 있다 — **별도의 `createTags`·`listTags`·`updateTags` 함수가 필요 없는 리소스 타입이라면 `identifierAttribute`를 지정하지 않는다.** 어노테이션을 붙인 뒤 **`make gen`을 돌려야** `service_package_gen.go`에 엔트리가 추가되어 등록이 완성된다([44장](44-implementing-a-resource.md)의 자기 등록 메커니즘과 같은 구조다).

### CRUD가 하는 일과 하지 않는 일

인터셉터가 CRUD 앞뒤에 끼어들기 때문에 리소스 코드에 남는 것은 최소한이다.

- **Create** — 생성 API가 태깅을 지원하면 입력에 **`Tags: getTagsIn(ctx)`** 를, 지원하지 않으면 생성 후 **`createTags(ctx, conn, id, getTagsIn(ctx))`** 를 부른다.
- **Read** — 조회 응답에 태그가 있으면 **`setTagsOut(ctx, out.Tags)`** 한 줄로 신호만 보낸다. **응답에 태그가 없어 `listTags`가 필요한 경우에는 아무것도 하지 않는다** — 인터셉터가 알아서 호출해 state에 넣는다.
- **Update** — **태그가 아닌 변경만 처리한다.** `updateTags` 호출은 인터셉터의 몫이므로 **CRUD에서 태그 변경을 검사하면 안 된다.** SDKv2의 관용구가 `d.HasChangesExcept(names.AttrTags, names.AttrTagsAll)`다.

SDKv2에는 조건이 하나 더 붙는다 — **`Update`는 반환 전에 반드시 `Read`를 호출해야** 인터셉터가 태그를 state에 저장한다. 그래서 태그만 바뀌는 리소스의 Update가 `return append(diags, resourceXxxRead(ctx, d, meta)...)` 한 줄뿐인 경우가 있고, 그 줄이 빠지면 **apply 후 `tags_all`이 옛 값으로 남는 버그**가 된다.

## Explicit tagging: 손으로 써야 하는 경우

transparent tagging에 옵트인할 수 없는 리소스는 CRUD 핸들러에 보일러플레이트를 직접 쓴다. 원문은 이 절의 성격을 한 줄로 못박는다 — **현재 explicit tagging을 쓰는 Plugin Framework 기반 리소스는 없다.** 즉 **explicit tagging은 새로 만드는 것이 아니라 옛 코드에서 읽는 것**이다. Create 쪽은 이렇게 생겼다.

```go
defaultTagsConfig := meta.(*conns.AWSClient).DefaultTagsConfig(ctx)
tags := defaultTagsConfig.MergeTags(tftags.New(ctx, d.Get("tags").(map[string]any)))

input := eks.CreateClusterInput{
	/* ... 나머지 설정 ... */
	Tags: svcTags(tags.IgnoreAWS()),
}
```

`MergeTags`가 **`default_tags`와 리소스 `tags`를 합치는 지점**이고, `IgnoreAWS()`는 **`aws:` 로 시작하는 AWS 관리 태그를 걸러 내는 지점**이다. 사용자 가이드가 "`aws:` 로 시작하는 태그 키는 AWS가 관리하며 보통 편집·삭제할 수 없다"고 말하는 동작이 여기 있다. API가 빈 목록을 허용하지 않으면 `if len(tags) > 0` 로 감싸고, 생성 시 태깅을 지원하지 않으면 생성 후 `updateTags(ctx, conn, d.Id(), nil, tags)`를 부른다. 입력 구조체에 `Tags` 대신 **`TagSpecifications`** 를 갖는 EC2 계열(예: `aws_ec2_fleet`)은 **`tagSpecificationsFromKeyValue()`** 헬퍼를 쓴다.

Read 쪽이 `tags`와 `tags_all`의 관계를 가장 선명하게 보여 준다.

```go
tags := keyValueTags(ctx, cluster.Tags).IgnoreAWS().IgnoreConfig(ignoreTagsConfig)

d.Set("tags", tags.RemoveDefaultConfig(defaultTagsConfig).Map())
d.Set("tags_all", tags.Map())
```

원격에서 읽은 전체 태그가 `tags_all`이고, 거기서 **`default_tags`에 해당하는 것을 뺀 나머지**가 `tags`다. 그리고 그 앞에 **`IgnoreConfig(ignoreTagsConfig)`** 가 있다 — provider의 `ignore_tags` 설정이 적용되는 자리가 바로 여기, **Read가 state에 값을 쓰기 직전**이다. Update는 `d.HasChange("tags_all")`을 보고 옛 값과 새 값을 `updateTags`에 넘긴다.

## `default_tags`와 `ignore_tags`는 어느 계층에서 적용되는가

앞 절의 코드가 답을 갖고 있다. 두 설정 모두 **provider 클라이언트(`conns.AWSClient`)에 담겨 리소스 계층에서 적용되며**, transparent tagging에서는 인터셉터가 그 적용을 대신한다.

- **`default_tags`는 쓰기(Create/Update) 직전에 병합되고, 읽기(Read) 직후에 분리된다.** 병합은 `MergeTags`, 분리는 `RemoveDefaultConfig`다. 그래서 AWS에는 언제나 합쳐진 태그가 붙고, state에는 `tags`와 `tags_all` 두 형태로 저장된다.
- **`ignore_tags`는 읽기 경로에만 있다** — `IgnoreConfig(ignoreTagsConfig)`. 무시된 태그는 state에 들어오지 않으므로 diff가 생기지 않는다. 반대로 말하면 **`ignore_tags`는 태그를 실제로 지우지 않는다.** AWS 쪽에는 그대로 남아 있다.
- **`IgnoreAWS()`는 설정과 무관하게 항상 적용된다.** `aws:` 접두어 태그를 provider가 아예 다루지 않는 것은 정책이 아니라 구현이다.

`aws_autoscaling_group`이 `default_tags`의 예외인 이유도 여기서 설명된다. 앞의 코드가 성립하려면 태그가 **키와 값의 맵**이어야 하는데, ASG의 태그는 키·값에 더해 **`propagate_at_launch`**(이 태그를 ASG가 띄우는 인스턴스에도 붙일 것인가)를 갖는다. `map(string)`인 `default_tags`에는 그 정보를 담을 자리가 없고 provider가 임의로 정하면 어느 쪽이든 사용자 의도를 깨뜨린다. 그래서 가이드는 `default_tags`가 **`aws_autoscaling_group`을 제외한 모든 태그 지원 리소스에 적용된다**고 명시한다. 메우는 방법은 [23장](../level2-intermediate/23-tagging-strategy.md)에서 다뤘다.

## 개별 태그 리소스를 추가하는 절차

`aws_ec2_tag`처럼 **태그 하나만 관리하는 리소스**는 리소스 코드와 초기 인수 테스트 함수가 **자동 생성**되기 때문에 별도의 추가 절차를 갖는다. 원문의 순서는 이렇다.

1. `internal/generate`에서 **그 서비스가 모든 생성기에서 지원되는지** 확인하고 수정했으면 `make gen`.
2. `internal/service/{service}/generate.go`에 **올바른 지시문을 갖춘 `//go:generate` 호출을 추가**하고 다시 `make gen`.
3. `internal/provider/provider.go`에 **새 리소스를 등록**하고 `make test`로 실패가 없는지 확인한다.
4. `internal/service/{service}/tag_gen_test.go`에 인수 테스트를 넣는다 — `_basic`(생성 + import 검증), `_disappears`(외부 삭제 후 재생성 계획 확인), `_Value`(값 변경)가 기본형이다.
5. `make testacc TESTS=TestAcc{Service}Tag_ PKG={Service}` 로 통과를 확인하고 `website/docs/r/{service}_tag.html.markdown` 문서를 만든다.

문서 템플릿 자체가 계약을 정의한다 — 인수는 **`resource_arn`(또는 `resource_id`), `key`, `value`** 세 개가 모두 Required이고, **`id`는 리소스 식별자와 키를 쉼표(`,`)로 이은 값**이며 import ID도 같은 형식이다(`terraform import aws_ec2_tag.example tgw-attach-1234567890abcdef,Name`). 그리고 문서에 반드시 들어가는 경고 두 개가 있다 — **부모 리소스 관리 리소스와 결합하면 안 된다**는 것과 **provider `ignore_tags` 설정을 쓰지 않는다**는 것이다.

### 왜 부모와 충돌하는가

앞 절의 코드를 보면 이유가 구조적이다. `aws_vpc` 같은 부모의 Read는 **원격의 전체 태그를 읽어 `tags_all`에 넣고 설정에 없는 키는 diff로 만든다** — 즉 태그 집합을 **전량 관리**한다. 여기에 `aws_ec2_tag`가 키 하나를 더 붙이면 부모는 그것을 "설정에 없는 태그"로 보고 제거를 계획하고 `aws_ec2_tag`는 다시 붙인다. **매 apply마다 서로를 되돌리는 영구 diff**다.

`ignore_tags`로 우회하려는 시도가 실패하는 이유도 명확해진다. `ignore_tags`는 부모의 Read 경로(`IgnoreConfig`)에서만 작동하고 **개별 태그 리소스는 그 경로를 타지 않는다.** 부모 쪽 diff만 사라지고 관리 주체는 여전히 둘이다. 규칙은 단순하다 — **한 리소스의 태그는 한 곳에서만 관리한다.** 개별 태그 리소스는 **Terraform 밖에서 만들어진 리소스**(AMI, RAM으로 공유받은 리소스, 다른 리소스가 암묵적으로 만든 Transit Gateway VPN Attachment 등)를 위한 도구다.

## 태그 정책 준수 검사는 언제 끼어드는가

provider 인수 `tag_policy_compliance`(`error` / `warning` / `disabled`, 환경변수 `TF_AWS_TAG_POLICY_COMPLIANCE`)를 켜면 조직 태그 정책의 필수 태그를 **plan 시점에 검증**한다. 사용자 관점의 설정은 [23장](../level2-intermediate/23-tagging-strategy.md)에서 다뤘고, 여기서는 구현상 **어느 시점에 끼어드는가**가 중요하다.

규정은 두 줄이다. 검사는 **새 리소스 생성 전**과 **기존 리소스의 `tags` 수정 전**에 실행되며, 명시적 예외가 붙는다 — **기존 리소스에 대한 비-태그 업데이트는 기존 태그가 비준수여도 언제나 허용된다.** 이 방식이 **무관한 업데이트를 막지 않으면서 태그가 조금이라도 수정되는 순간 준수를 강제**하기 때문이다. 그래서 태그 정책을 새로 도입해도 **기존 비준수 리소스가 즉시 파이프라인을 막지 않고** 그 리소스의 태그를 손대는 순간 막힌다. 점진적 도입을 전제로 한 설계다.

두 번째 제약은 훨씬 자주 보인다. **Plugin SDK V2가 노출하는 plan 시점 검증 메서드의 한계 때문에 SDKv2 기반 리소스는 태그 정책 위반에 대해 warning 진단을 낼 수 없다.** 대신 **`WARN` 레벨 로그 메시지**를 남기므로 보려면 로그 레벨을 올려야 한다.

```console
% TF_LOG=warn terraform plan
```

덧붙는 경고가 중요하다 — **provider 리소스의 대다수가 Plugin SDK V2로 구현되어 있고**, 신규 리소스는 Framework를 써야 하지만 이 제약은 **가장 오래되고 가장 많이 쓰이는 리소스들**에 계속 영향을 준다. 실무 결론은 하나다. **`tag_policy_compliance = "warning"` 은 조용할 수 있다.** 강제가 목적이라면 `error`가 실질적인 유일한 선택지다.

전제 조건도 제약이다. 검사는 **Resource Groups Tagging API의 `ListRequiredTags`** 권한을 요구하며 이 API는 **2025년 11월에 도입**되어 기존 CI 역할의 정책 수정이 필요할 수 있다. 어떤 Terraform 리소스가 어떤 태그 리소스 타입에 대응하는지는 문서의 **생성된 교차 참조 표**(`logs:log-group` -> `aws_cloudwatch_log_group` 같은 행)로 확인한다.

## 흔한 실수

### ❌ 태그 지원 여부를 "AWS가 지원하니 되겠지"로 가정한다

**모든 AWS 리소스가 태깅을 지원하지는 않으며 같은 서비스 안에서도 리소스마다 다르다.** 판정 기준은 **그 리소스의 문서 페이지에 `tags` 인수가 있는가** 하나다. AWS API가 지원하는데 provider에 없다면 기능 요청 대상이다.

```terraform
# ❌ 문서에 tags 가 없는 리소스에 태그를 넣는다 -> plan 단계에서 검증 에러
resource "aws_some_thing" "example" {
  tags = { Owner = "ops" }
}
```

```terraform
# ✅ 소스에서는 팩토리 함수 위의 @Tags 어노테이션 유무로 판정한다.
#    지원하지 않으면 개별 태그 리소스나 기능 요청으로 간다.
resource "aws_some_thing" "example" {
  # ... 나머지 설정 ...
}
```

### ❌ 부모 리소스와 개별 태그 리소스를 함께 쓴다

부모는 태그 집합을 **전량 관리**하고 개별 태그 리소스는 키 하나를 관리한다. 겹치면 영구 diff다.

```terraform
# ❌ 같은 VPC의 태그를 두 곳에서 관리한다
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags       = { Name = "main" }
}

resource "aws_ec2_tag" "owner" {
  resource_id = aws_vpc.main.id
  key         = "Owner"
  value       = "ops"
}
```

```terraform
# ✅ Terraform 이 부모를 관리하면 tags 인수 하나로 끝낸다
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name  = "main"
    Owner = "ops"
  }
}
```

### ❌ `tag_policy_compliance = "warning"` 을 켜고 조용하니 준수한다고 판단한다

**SDKv2 리소스는 warning 진단을 낼 수 없고 `WARN` 로그만 남긴다.** provider 리소스의 대다수가 SDKv2다.

```console
# ❌ 경고가 안 보이니 문제 없다고 결론
% terraform plan
```

```console
# ✅ 로그 레벨을 올려 확인하거나, 강제가 목적이면 error 로 둔다
% TF_LOG=warn terraform plan
```

### ❌ `ignore_tags` 로 태그를 "지웠다"고 생각한다

`ignore_tags`는 **Read 경로에서 state에 넣지 않을 뿐**이어서 AWS 쪽 태그는 그대로 남고 비용 리포트에도 나타난다.

```terraform
# ❌ 잘못된 태그를 ignore_tags 로 처리하고 정리했다고 본다
provider "aws" {
  ignore_tags {
    keys = ["LegacyOwner"]
  }
}
```

```terraform
# ✅ 무시는 "외부 시스템이 붙이는 태그와 싸우지 않기" 용도다
provider "aws" {
  ignore_tags {
    key_prefixes = ["kubernetes.io/"]
  }
}
```

## 프로덕션 노트

- **태그 지원 여부와 방식은 소스 세 곳에서 판정된다** — 팩토리 함수 위의 `@Tags` 어노테이션, 서비스의 `generate.go` 플래그, `tags_gen.go`에 생성된 함수 목록. 문서보다 정확하고 빠르다.
- **`-CreateTags`가 있는 서비스는 "생성 후 태깅"이다.** 생성과 태깅 사이에 실패하면 태그 없는 리소스가 남으므로, 태그 기반 비용 할당이나 접근 제어를 쓰는 조직은 정기 스캔이 필요하다.
- **태그 버그 제보는 계층을 특정하면 처리 속도가 다르다.** "`tags_all`이 apply 후에도 옛 값" -> SDKv2 Update가 Read를 부르지 않는 문제, "`default_tags`가 안 붙음" -> 인터셉터 미등록 또는 explicit tagging 잔재.
- **태그 정책 도입은 점진적으로 설계되어 있다.** 비-태그 업데이트는 통과하므로 기존 비준수 리소스가 파이프라인을 막지 않는다. 다만 `ListRequiredTags` 권한이 없으면 검사 자체가 실패한다.
- **태그 지원 추가 PR은 첫 기여로 적합하다.** 절차가 문서화되어 있고(생성기 플래그 -> `make gen` -> 어노테이션 -> 테스트 -> 문서) 인수 테스트도 상당 부분 생성되며, 문서 문구까지 원문이 정해 두었다.
- **`aws_autoscaling_group` 예외는 코드로 고쳐질 성질이 아니다.** 조직 표준 태그를 ASG에 넣으려면 `aws_default_tags` 데이터 소스 패턴을 표준 모듈에 박아 두는 것이 유일한 해법이다.

## 연습문제

1. 자주 쓰는 서비스 하나의 `generate.go`를 열어 태그 생성기 플래그를 해석한다. *성공 기준:* 태그를 맵으로 다루는지 슬라이스로 다루는지, 조회에 별도 API가 필요한지, 생성 시 태깅이 가능한지가 플래그 근거와 함께 적혀 있고 `tags_gen.go`의 함수 목록과 대조되어 있다.

2. 태그를 지원하는 리소스와 지원하지 않는 리소스를 하나씩 골라 소스에서 판정한다. *성공 기준:* 각각의 어노테이션 유무와 `identifierAttribute` 값이 기록되어 있고, 지원하지 않는 쪽에 대해 AWS API가 태깅을 지원하는지 확인한 결과가 함께 적혀 있다.

3. 테스트 계정에서 `default_tags`를 설정한 뒤 VPC를 만들고, 같은 VPC에 `aws_ec2_tag`로 태그를 더 붙여 두 번 연속 `plan`을 돌린다. *성공 기준:* `tags`와 `tags_all`의 차이가 실제 출력으로 기록되어 있고, 영구 diff가 재현되어 어느 리소스가 무엇을 되돌리는지 설명되어 있다.

## 요약

- 태깅이 특별 취급인 이유는 **1,600개가 넘는 리소스가 같은 `tags`/`tags_all` 계약을 지켜야 하는데 AWS 쪽 태그 API는 통일되어 있지 않기 때문**이다 — 타입(맵 vs 구조체 슬라이스), 구조체·필드 이름, 조회·갱신 API 이름, 생성 시 태깅 가능 여부가 서비스마다 다르다.
- 그 간극은 **코드 생성**이 메운다. `internal/service/{svc}/generate.go`의 **`//go:generate go run ../../generate/tags/main.go` 지시문 하나에 플래그를 여러 개** 붙이고(**지시문을 두 개 쓰면 뒤가 앞을 덮어쓴다**) `make gen`을 돌리면 `tags_gen.go`에 **`keyValueTags`·`svcTags`**(모든 서비스), **`listTags`·`updateTags`**(별도 API가 있을 때), 선택적으로 **`GetTag`·`createTags`** 가 생성된다.
- 주요 플래그는 타입 쪽 **`-ServiceTagsMap`/`-ServiceTagsSlice`/`-TagType`/`-TagType2`/`-TagTypeKeyElem`/`-TagTypeValElem`**, 조회 쪽 **`-ListTags`/`-ListTagsOp`/`-ListTagsInIDElem`/`-ListTagsOutTagsElem`/`-GetTag`**, 갱신 쪽 **`-UpdateTags`/`-TagOp`/`-TagInIDElem`/`-UntagOp`/`-UntagInTagsElem`**, 그리고 **`-CreateTags`** 다.
- 스키마는 헬퍼로 선언한다 — Framework는 **`tftags.TagsAttribute()`/`TagsAttributeComputedOnly()`**, SDKv2는 **`tftags.TagsSchema()`/`TagsSchemaComputed()`** 이고 **`tags`는 설정 가능, `tags_all`은 computed 전용**이다.
- **transparent tagging**은 태그 로직 대부분을 CRUD가 아니라 **`internal/provider/intercept.go`와 `fwprovider/intercept.go`의 인터셉터**에 두고, 리소스는 **`@Tags(identifierAttribute="arn")`** 로 옵트인한 뒤 `make gen`으로 등록된다. CRUD에 남는 것은 Create의 **`getTagsIn(ctx)`**(또는 `createTags`), Read의 **`setTagsOut(ctx, ...)`**(응답에 태그가 없으면 아무것도 안 함), Update의 **태그 아닌 변경만 처리**뿐이며 **SDKv2의 Update는 반환 전에 Read를 호출해야** 한다.
- **explicit tagging**은 옛 SDKv2 코드에서만 보인다(**Framework 기반 리소스 중에는 없다**). 그 코드가 계층을 드러낸다 — **`default_tags`는 쓰기 직전 `MergeTags`로 병합되고 읽기 직후 `RemoveDefaultConfig`로 분리**되며, **`ignore_tags`는 읽기 경로의 `IgnoreConfig`에만** 있고(따라서 태그를 실제로 지우지 않는다), **`IgnoreAWS()`는 항상 적용**된다. **`aws_autoscaling_group`이 `default_tags` 예외인 것은 태그에 `propagate_at_launch`가 붙어 맵으로 표현되지 않기 때문**이다.
- **개별 태그 리소스**는 코드와 초기 테스트가 생성된다 — 생성기 지원 확인 -> `generate.go` 지시문 -> `provider.go` 등록 -> `make test` -> `tag_gen_test.go`(`_basic`/`_disappears`/`_Value`) -> `make testacc` -> 문서. 인수는 **식별자·`key`·`value` 모두 Required**, **`id`는 식별자와 키를 쉼표로 이은 값**이다. **부모가 태그를 전량 관리하므로 함께 쓰면 영구 diff**가 되고 **이 리소스는 `ignore_tags`를 쓰지 않는다.**
- **태그 정책 검사는 생성 전과 `tags` 수정 전에** 실행되며 **비-태그 업데이트는 언제나 허용**된다. **SDKv2 리소스는 warning 진단을 낼 수 없어 `WARN` 로그만 남기므로** `TF_LOG=warn`으로 확인해야 하고, 검사에는 **`ListRequiredTags`**(2025년 11월 도입) 권한이 필요하다.

## 다음으로

- [47장 — 테스트](47-testing.md) — 생성된 태깅 인수 테스트와 `_disappears` 패턴
- [48장 — 기여 프로세스](48-contributing.md) — 태그 지원 추가 PR의 changelog·문서 규약
- [23장 — 태깅 전략 심화](../level2-intermediate/23-tagging-strategy.md) — 사용자 관점의 태그 정책
- 공식 문서: [Resource Tagging 가이드](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/guides/resource-tagging)
