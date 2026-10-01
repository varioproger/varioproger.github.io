---
chapter: 45
level: "Level 3 — 고급"
title: "에러 처리 · 재시도 · Waiter: 최종 일관성과 싸우기"
difficulty: 심화
reading_time: "34분"
prerequisites: [40, 44]
source_docs:
  - "docs/retries-and-waiters.md"
  - "docs/error-handling.md"
  - "docs/finders-and-listers.md"
  - "docs/ai-agent-guides/smarterr.md"
  - "docs/naming.md"
  - "website/docs/r/autoscaling_group.html.markdown"
  - "website/docs/r/ecs_service.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 45장 — 에러 처리 · 재시도 · Waiter: 최종 일관성과 싸우기

**이 장에서 배우는 것**

- AWS API의 세 가지 불친절 — 최종 일관성, 비동기 상태 전이, 스로틀링·일시 장애 — 을 구분하고 각각에 대응하는 코드 장치를 지목할 수 있다.
- 에러를 재시도 가능/영구로 분류하는 코드(`errs.IsA`, `tfawserr.ErrCodeEquals`, `ErrMessageContains`)를 읽고 어디까지 매칭하는 것이 옳은지 판정할 수 있다.
- SDK 자체 재시도와 provider 레벨 재시도가 **다른 층**임을 알고 어느 쪽이 사용자 설정으로 조절되는지 구분할 수 있다.
- `retry.StateChangeConf`의 네 조각과 `status`/`wait` 관례를 읽어 상태 전이와 대기 시간을 소스에서 확인하고, `timeouts`가 닿지 않는 대기를 가려낼 수 있다.
- 에러 문구를 보고 원인 계층(권한·순서·전파·스로틀링)을 짚어 조치까지 이어 갈 수 있다.

**왜 중요한가**

CI에서 apply가 실패한다. `Error: creating Lambda Function (api): InvalidParameterValueException: The role defined for the function cannot be assumed by Lambda.` 방금 그 롤을 만들었고 `role_arn`은 정확하다. 재실행하면 통과하고 다음 주에 또 실패한다. 팀은 이것을 "가끔 그러는 것"으로 분류하고 재시도 버튼을 누르는 문화가 자리 잡는다. 실제로는 **IAM 전파 지연**이라는 이름이 있는 현상이고, provider에는 그 목적의 **2분짜리 표준 타임아웃 상수**가 있으며, 그 리소스에 재시도가 붙어 있지 않다는 것이 진짜 결론이다. 이름을 알면 이슈가 되고, 모르면 매주 버튼을 누른다.

두 번째 상황은 더 비싸다. RDS 클러스터를 만드는 apply가 CI 잡 타임아웃 60분에 걸려 죽는다. 프로세스는 죽었지만 **AWS 쪽 생성 작업은 계속 진행되어** state에는 아무것도 없고 계정에는 클러스터가 남는다. 원인은 하나 — `aws_rds_cluster`의 `create` 기본 타임아웃은 **120분**인데 잡 타임아웃이 60분이었다.

세 번째는 조용하다. 콘솔에서 리소스를 지웠는데 `terraform plan`이 재생성 계획 대신 에러를 뱉는다. 운영 실수가 아니라 **provider 버그의 정형화된 증상**이고, 소스 20줄이면 어느 분기가 빠졌는지 판정된다.

## AWS API의 세 가지 불친절

원문은 provider가 원격 시스템을 호출할 때 마주치는 상황을 세 부류로 나눈다 — **요청이 도달하지 않는 경우**, **도달했지만 지금은 처리할 수 없다고 응답하는 경우**, **성공을 보장하려면 추가 요청이 필요한 경우**다. 앞의 둘은 대부분 **AWS SDK for Go v2의 자동 재시도**가 흡수하고, 셋째는 provider의 몫이며 다시 둘로 갈라진다 — 값을 아직 읽을 수 없는 **최종 일관성**(방금 만든 것이 "없다"고 나온다)과 값은 읽히지만 아직 쓸 수 없는 **비동기 상태 전이**(`CREATING` -> `AVAILABLE`)다.

최종 일관성의 정의는 **원격 시스템이 강한 read-after-write 일관성을 갖지 않아 오래된 정보나 에러를 돌려주는 일시적 상태**다. Terraform은 계획된 변경이 apply 후 **그대로 일치**하기를 기대하고 운영자는 drift 감지를 기대하므로 provider는 작업 직후 값을 **다시 읽어야** 한다. 두 요구의 충돌이 이 장의 전부이고, **이런 문제들은 신뢰성 있게 재현되지 않는다.**

## SDK가 먼저 재시도한다

provider 코드가 `err`를 손에 쥐었을 때 그 요청은 **이미 여러 번 시도된 뒤**일 수 있다. SDK는 응답을 파싱하는 단계에서 **기본 로직과 커스텀 로직에 근거해 자동 재시도**를 걸기 때문이다. `client.DefaultRetryer`의 발동 조건은 셋이다 — **일부 네트워크 에러**(흔한 예외는 connection reset), **HTTP 429와 5xx**, **여러 서비스에 공통적인 일부 API 에러 코드**(예: `ThrottledException`). 다만 **모든 AWS 서비스가 이 코드들을 일관되게 구현하지는 않는다.** 횟수는 `max_retries`(**기본 25**, 대략 한 시간)를 따르지만, **재시도로 고쳐지지 않는 종류의 네트워크 에러**는 `hashicorp/aws-sdk-go-base` 쪽에서 **10회 · 대략 30초**로 낮춘다 — **사용자가 늘릴 수 없는 대기**의 첫 사례다([40장](40-performance-and-throttling.md)).

AWS가 어떤 에러를 "재시도 대상"으로 표시하지 않았지만 실제로는 재시도해야 하는 경우에는 리소스마다 붙이는 대신 **서비스 클라이언트 자체를 손본다** — `internal/service/{service-name}/service_package.go`의 `conns.AddIsErrorRetryables(...)`이고, S3가 `errCodeOperationAborted` + `"A conflicting conditional operation is currently in progress"` 조합을 이렇게 추가한다.

## 에러 분류: 코드로 볼 것인가 메시지로 볼 것인가

출발점은 **이 에러가 무엇인가**의 판정이다. SDK v2는 모든 에러를 **`smithy.OperationError`로 감싸며** 특정 타입 검사에는 **`errors.As`로 언랩해야 한다.** provider는 그 위에 헬퍼 층을 얹는다.

| 헬퍼 | 쓰는 자리 |
|---|---|
| `errs.IsA[*awstypes.ResourceNotFoundException](err)` | SDK가 타입으로 노출하는 에러를 타입으로 검사 |
| `tfawserr.ErrCodeEquals(err, "코드")` | **에러 코드만으로 조건이 충분히 특정될 때** |
| `tfawserr.ErrMessageContains(err, "코드", "…")` | 한 코드가 여러 실패 모드를 덮어 메시지 파싱이 필요할 때 |

`tfawserr` 계열은 `github.com/hashicorp/aws-sdk-go-base/v2/tfawserr`에서 온다. 기준은 **에러 코드가 조건을 충분히 특정하면 `ErrCodeEquals`** 이고, 문제는 메시지 매칭이다. 권고는 **예상한 문제를 잡을 만큼만 구체적으로, 그러나 너무 많이 매칭하지는 말라**는 것이며 이유도 붙어 있다 — **AWS API는 예고 없이 바뀔 수 있고** 과거에 **문구와 대소문자 변경이 예기치 않은 문제를 일으킨 것을 관찰했다.** `InvalidParameterValueException: IAM Role arn:aws:iam::123456789012:role/XXX cannot be assumed by AWS Backup`에서 매칭할 부분은 `"cannot be assumed"` 하나다 — ARN은 환경마다 다르고 접미사는 서비스 이름이 바뀌면 깨진다.

에러 코드 상수가 SDK에 없으면 `internal/service/{SERVICE}/errors.go`에 정의한다 — 그 파일이 쌓여 있는 서비스는 **API가 SDK 정의와 어긋나 있다는 신호**다.

## finder 규약: 404를 `NotFoundError`로 바꾸는 자리

Plugin SDK의 `retry.NotFoundError`는 provider 전체에서 "이 리소스는 없다"를 표현하는 **공용 언어**이고 `internal/retry`에 보조 함수가 있다. **`retry.NotFound(err)`** 는 에러가 `retry.NotFoundError`이면 참이다. **`retry.TimedOut(err)`** 는 `retry.TimeoutError`이면서 `LastError`가 없으면 참으로, **AWS API가 반환 전에 이미 자동 재시도하고 있을 때** 나타나는 신호다.

[44장](44-implementing-a-resource.md)에서 본 대로 Read는 finder를 부르고 finder가 not-found를 알리면 state에서 제거한다(SDKv2에서는 `!d.IsNewResource()` 조건이 함께 붙는다). finder가 판정하는 "없음"은 두 가지다. **AWS가 not-found 에러를 준 경우** — EKS 클러스터 finder는 `errs.IsA[*awstypes.ResourceNotFoundException](err)`가 참이면 `&retry.NotFoundError{LastError: err}`를, 응답이 비어 있으면 `tfresource.NewEmptyResultError()`를 돌려준다. **조회는 성공했지만 상태가 논리적으로 삭제됨인 경우** — EFS Access Point finder는 `LifeCycleState`가 `deleted`면 `&retry.NotFoundError{Message: string(state)}`를 돌려준다. 계층 규칙이 여기서 나온다 — **AWS의 resource-not-found 에러를 `retry.NotFound` 에러로 매핑하는 일은 가장 낮은 계층(`Describe` 호출에 가장 가까운 곳)에서, 논리적 삭제 검사는 가장 높은 계층(Read 핸들러에 가장 가까운 곳)에서** 한다. 이유가 있다. 낮은 계층 finder는 waiter의 status 함수와 코드를 공유하는데 삭제 waiter는 `DELETED`를 **정상적인 종착점**으로 봐야 한다. 목록 API만 있는 서비스는 페이지네이터를 도는 lister가 not-found를 매핑하고 그 위 finder가 **`tfresource.AssertSingleValueResult(output)`** 로 "정확히 하나"를 강제한다.

## provider 레벨 재시도와 IAM 전파 지연

SDK가 흡수하지 못하는 것 — 순서를 맞춘 구성인데도 최종 일관성 때문에 후속 작업이 실패하는 경우 — 은 provider가 직접 처리한다. 단순화된 재시도 구현이 **`tfresource.Retry()`** 다.

```go
// Maximum amount of time to wait for Thing operation eventual consistency
const ThingOperationTimeout = 2 * time.Minute

err := tfresource.Retry(ctx, ThingOperationTimeout, func(ctx context.Context) *tfresource.RetryError {
	_, err := conn./* ... 최종 일관성 에러가 나는 AWS Go SDK 작업 ... */
	if errs.IsAErrorMessageContains[/* 에러 타입 */](err, /* 에러 메시지 */) {
		return tfresource.RetryableError(err)
	}
	if err != nil {
		return tfresource.NonRetryableError(err)
	}
	return nil
})
```

**재시도 가능하면 `RetryableError`, 아니면 `NonRetryableError`, 성공이면 `nil`** 이고, 재시도 조건을 먼저 검사하지 않으면 그 조건에 도달하지 못한다. 규칙 셋은 **타임아웃을 낮게(보통 2분, 길어도 5분)**, **상수에 담고**, **해당 리소스 로직과 같은 자리에 두는 것**이다. 경고도 붙는다 — **잘못 정렬된 구성을 극복하는 데 이 로직을 쓰지 말 것.** 그 접근은 **더 큰 환경에서는 통하지 않을 수 있다.**

가장 흔한 최종 일관성 문제는 IAM이다. **IAM 서비스 자체가 최종 일관적이고, 그 구성 요소와 권한이 다른 서비스로 전파되는 과정 또한** 그렇다. Role 생성 -> 정책 첨부 -> 그 Role을 참조한 리소스 생성이 빠르게 이어지면 마지막 작업이 받는 에러는 세 갈래다 — Role이 **존재하지 않는다**, 그 서비스가 Role을 **사용할 권한(assume role)이 없다**, Role에 **충분한 권한이 없다**. 셋 다 뜻은 "아직 전파되지 않았다"이다.

타임아웃은 **`internal/service/iam` 패키지의 표준 상수 2분**이고, 원문은 이 값이 **모든 AWS API에 대한 수년간의 Terraform 운영 경험에서 도출되었다**고 밝힌다. 소스에서는 **`tfiam.PropagationTimeout`** 형태로 눈에 띄며, 어떤 리소스가 IAM 전파를 고려하는지 확인하는 가장 빠른 방법이 이 심볼 검색이다.

**비동기 작업 위에 얹힌 IAM 재시도**는 타임아웃이 둘이 된다. 전체는 **`tfiam.PropagationTimeout + ThingOperationTimeout`** 으로 잡고, IAM 부류만 앞쪽 2분으로 자르기 위해 **중단 시각을 미리 저장해** 비교한다.

## 생성 직후의 Read와 `d.IsNewResource()`

생성 직후 조회는 최종 일관성이 가장 잘 터지는 자리다. **Plugin Framework**는 생성 요청 후 **`Create` 메서드 안에서** `Get`/`Describe`를 부르고, **Plugin SDK V2**는 **`Create` 함수가 `Read` 함수를 호출하며 반환**하며, **그 호출에 재시도를 건다.** SDKv2에만 있는 함정이 여기 있다. Read는 원격 리소스가 없으면 `d.SetId("")` 후 에러 없이 반환하는 것이 관례인데, 생성 직후 최종 일관성으로 그 분기를 타면 **"에러도 없고 식별자도 없는"** 결과가 된다.

```
Error: Provider produced inconsistent result after apply
... produced an unexpected new value: Root resource was present, but now absent.
This is a bug in the provider, which should be reported in the provider's own
issue tracker.
```

이 문구는 **거의 항상 provider 쪽 문제이고 대개 최종 일관성이 원인**이다. 방어 장치가 **`d.IsNewResource()`** 로, state에서 제거하기 전에 이 검사를 걸어 생성 직후라면 제거 대신 에러를 반환한다. 원문은 이것이 **최종 일관성을 고쳐 주지는 않지만 에러가 덜 불투명해진다**고 정직하게 적는다. 진짜 해결은 재시도이며, **이 검사는 SDKv2 전용**이다. 보조 규칙 둘 — Create가 `retry.StateChangeConf`를 쓴다면 refresh 함수는 "not found"를 에러 대신 **`return nil, "", nil`** 로, `tfresource.Retry()`를 쓴다면 **`RetryableError`** 로 돌려준다. 그리고 못박아 두는 문장 하나 — **waiter를 구현한 뒤에도 `Read`에서 "not found"는 여전히 발생할 수 있다.**

## Waiter: `StateChangeConf`의 네 조각

오래 걸리는 작업을 시작하면 AWS가 **즉시 성공 응답을 돌려주고 요청은 뒤에서 계속 처리**하며, 리소스는 상태 필드(`CREATING` 등)나 추적 식별자로 진행을 따라간다. **Terraform 리소스는 이 작업이 끝날 때까지 기다려야 한다** — 그러지 않으면 불완전한 state와 후속 에러가 생긴다. 도구는 `retry.StateChangeConf`이고 핵심 필드는 넷이다.

| 필드 | 의미 |
|---|---|
| `Pending` | 아직 기다려야 하는 상태 목록. **여기에도 `Target`에도 없는 값이 오면 에러**가 된다 |
| `Target` | 도달하면 성공인 상태 목록 |
| `Refresh` | 현재 상태를 읽어 오는 `retry.StateRefreshFunc` |
| `Timeout` | 전체 대기 상한 |

수신자 메서드는 `WaitForState()`와 `WaitForStateContext()`다. 폴링 조절 필드도 있다 — 첫 요청을 늦추는 **`Delay`**, 폴링 간격의 하한 **`MinTimeout`**, target 값을 **연속으로 몇 번** 받아야 성공으로 볼지인 **`ContinuousTargetOccurence`**(최종 일관성 대비책으로, `AVAILABLE`을 돌려줬다가 `CREATING`으로 되돌리는 서비스에서 2 이상으로 둔다). 그리고 **예상 목록에 없는 상태는 조용히 무시되지 않고 에러**가 된다 — AWS가 새 상태 값을 추가하면 waiter가 "unexpected state"로 깨지는 것이 흔한 버그 유형이고, `FAILED`를 `Pending`에 넣지 않는 것도 실패를 즉시 에러로 만들기 위해서다.

status·wait 함수는 **서비스 패키지에 별도 함수로 분리**하며 파일 이름도 정해져 있다 — `status.go`, `wait.go`, `find.go`, 서비스 전역 상수는 `consts.go`다.

```go
func ThingStatus(ctx context.Context, conn *example.Client, id string) retry.StateRefreshFunc {
	return func() (any, string, error) {
		output, err := /* ... 리소스/상태를 가져오는 AWS Go SDK 작업 ... */
		if errs.IsA[*types.ResourceNotFoundException](err) || output == nil {
			return nil, "", nil
		}
		if err != nil {
			return nil, "", err
		}
		return output, aws.ToString(output.Status), nil
	}
}

func waitThingCreated(ctx context.Context, conn *example.Example, id string, timeout time.Duration) (*example.Thing, error) {
	stateConf := &retry.StateChangeConf{
		Pending: []string{example.StatusCreating},
		Target:  []string{example.StatusCreated},
		Refresh: ThingStatus(ctx, conn, id),
		Timeout: timeout,
	}
	outputRaw, err := stateConf.WaitForState()
	output, _ := outputRaw.(*example.Thing)
	return output, err
}
```

**not-found와 nil 출력을 `nil, "", nil`로 돌려주는 것**이 status 함수의 관례다 — 에러가 아니라 "아직 상태를 모른다"로 취급된다. 삭제 waiter에는 별도 관례가 있다 — **리소스가 그냥 사라지고 "deleted" 상태를 갖지 않으면 `Target`을 빈 목록(`[]string{}`)으로 둔다.** 기다림의 대상이 **특정 속성 값**이면 `Pending` 없이 `Target: []string{expectedValue}`만 둔다.

AWS SDK for Go도 일부 비동기 작업에 waiter를 제공하지만 지침은 단호하다 — **대신 Resource Lifecycle Waiter를 쓸 것을 요구한다.** 더 널리 쓰이고 **커스터마이징 옵션이 더 많기** 때문이다.

## `timeouts`가 닿는 곳과 닿지 않는 곳

waiter의 `Timeout` 인자는 사용자 설정에서 온다. Framework는 `r.CreateTimeout(ctx, plan.Timeouts)`, SDKv2는 `d.Timeout(schema.TimeoutCreate)`이고 출처는 리소스 블록의 `timeouts`다. 여기서 **늘릴 수 있는 것과 없는 것**의 경계가 생긴다.

| 대기 | 조절 가능한가 |
|---|---|
| waiter 전체 대기(`StateChangeConf.Timeout`) | **가능** — `timeouts` 블록. 단 그 리소스가 해당 키를 문서화한 경우에만 |
| SDK 자동 재시도 횟수 | **부분적** — `max_retries`(기본 25). 리소스가 아니라 provider 단위 |
| 재시도로 고칠 수 없는 네트워크 에러 | **불가능** — 10회 고정 |
| `tfresource.Retry`의 최종 일관성 타임아웃 | **불가능** — 코드 상수(보통 2분) |
| IAM 전파 타임아웃 | **불가능** — `tfiam.PropagationTimeout`(2분) |
| `Delay`·`MinTimeout`·`ContinuousTargetOccurence` | **불가능** — 코드 상수 |

`timeouts`를 키워도 IAM 전파 지연으로 실패하는 apply는 구제되지 않고, 반대로 "3분쯤 뒤 실패"가 반복되면 **코드 상수 쪽**을 의심해야 한다.

일부 리소스는 `timeouts`와 별개로 **대기 자체를 인수로 노출**한다. `aws_autoscaling_group`의 **`wait_for_capacity_timeout`**(Optional, 기본 `"10m"`)은 인스턴스가 `Healthy` + `InService`가 될 때까지의 상한이고 **`"0"`이면 용량 대기를 끈다.** `min_elb_capacity`는 **생성 시에만**, `wait_for_elb_capacity`는 **생성과 업데이트 모두**에서 지정 수만큼 ELB `InService`를 기다리며 후자가 우선한다. 헬스 체크를 통과하지 못하면 apply가 타임아웃되고 **ASG는 tainted로 표시**된다. `aws_ecs_service`의 **`wait_for_steady_state`**(기본 `false`)는 steady state까지 기다리게 하며 `sigint_rollback`이 이 값을 **요구한다.** 기본 타임아웃 값 표는 [40장](40-performance-and-throttling.md)에 있다.

## 삭제의 멱등성과 `create_before_destroy`

삭제의 표준 패턴은 **존재 확인 없이 곧바로 삭제 API를 호출하는 것**이다. 그러나 외부 시스템이 직전에 원격 시스템을 바꾸면 "그런 리소스 없음" 에러가 돌아올 수 있고, 이때 **리소스는 그 에러를 반환하지 않고 건너뛰어야 한다.**

```go
output, err := conn.DeleteServiceThing(input)

if tfawserr.ErrCodeEquals(err, "ResourceNotFoundException") {
	return
}
```

state 제거는 프레임워크가 대신한다 — **Framework는 `resp.State.RemoveResource()`에, SDKv2는 `d.SetId("")`에 해당하는 처리를 자동으로 한다.** 이 로직이 없는 리소스는 **콘솔에서 먼저 지운 뒤 `terraform destroy`를 돌리면 실패**하고 `terraform state rm`으로 우회해야 한다. 정확한 이슈 제보 대상이다.

`create_before_destroy`와 waiter는 서로를 증폭시킨다([21장](../level2-intermediate/21-lifecycle-meta-arguments.md)). 교체 시 **생성 waiter가 끝난 뒤에야 삭제와 그 waiter가 시작**되므로 교체 시간이 사실상 `create` + `delete` 타임아웃이 된다 — `aws_db_instance`라면 40m + 60m다. 게다가 이름이 교체를 유발하는 리소스에서 `name`을 직접 지정하면 옛 리소스가 살아 있는 동안 **이름 충돌로 실패**한다. `name_prefix`가 있으면 그쪽을 쓴다.

## 진단 메시지 규약과 smarterr

Go 에러는 **`fmt.Errorf()`와 `%w`로 감싸** 원래 타입을 잃지 않고 맥락만 덧붙이며, 진단은 헬퍼로 만든다.

```go
// Framework
resp.Diagnostics.AddError(create.ProblemStandardMessage(
	names.QuickSight, create.ErrActionWaitingForCreation, ResNameVPCConnection, plan.ID.String(), err), err.Error())

// SDKv2
return create.AppendDiagError(diags, names.IVS, create.ErrActionCreating, ResNameRecordingConfiguration, d.Id(), err)
```


동작 상수가 곧 실패 단계를 알려 준다 — `ErrActionCreating`/`Reading`/`Updating`/`Deleting`은 API 호출 자체의 실패, **`ErrActionWaitingForCreation`/`WaitingForUpdate`/`WaitingForDeletion`은 API는 성공했고 waiter가 실패**했다는 뜻이다. `creating`이면 요청이 거부된 것이니 권한·인수·쿼터를 보고, `waiting for creation`이면 **AWS가 실제로 만들고 있는 중**이므로 계정에 반쯤 만들어진 객체가 있을 가능성이 높다.

최근 provider는 이 계층을 **smarterr/smerr**로 옮기고 있다. 목적은 에러에 **컨텍스트를 자동으로 붙이는 것**이고, 규칙은 **진단 호출에는 `smerr` · 맨 에러 반환에는 `smarterr`**, **Framework는 Add · SDKv2는 Append**, **`ctx`를 먼저, 가능하면 `smerr.ID`와 식별자를 함께** 넘기는 것이다.

| 이전 | 이후 |
|---|---|
| `sdkdiag.AppendErrorf(diags, "msg", err)` | `smerr.Append(ctx, diags, err, smerr.ID, id)` |
| `return nil, err` | `return nil, smarterr.NewError(err)` |

## 에러 문구에서 원인으로

| 에러 문구의 특징 | 유력한 원인 | 조치 |
|---|---|---|
| `creating ...: AccessDenied` / `UnauthorizedOperation` | 실행 principal의 권한 부족 | TRACE 로그에서 실패한 API 이름을 뽑아 정책에 추가 |
| `cannot be assumed` / `role ... does not exist` 인데 롤은 존재 | IAM 전파 지연 | 재실행으로 확인 -> 재현되면 해당 리소스에 IAM 전파 재시도가 없다는 이슈 |
| `timeout while waiting for state to become ...` | waiter 타임아웃 — 요청은 접수됨 | 콘솔에서 상태 확인, `timeouts` 상향, 진행 중이면 기다렸다가 `import` |
| `unexpected state 'X', wanted target 'Y'` | AWS가 waiter가 모르는 상태를 반환 | 대개 provider 버그 또는 실제 실패 상태. 상태 값을 그대로 넣어 이슈 |
| `... inconsistent result after apply ... now absent` | 생성 직후 최종 일관성 | provider 버그. 리소스 타입과 리전을 적어 이슈 |

## 흔한 실수

### ❌ 최종 일관성 에러를 `depends_on` 남발로 덮는다

전파 지연은 "앞 리소스가 완료됐는가"와 무관한 시간 축의 문제여서 `depends_on`을 더해도 달라지지 않는다.

```terraform
# ❌ 순서는 이미 참조로 보장돼 있는데 depends_on 만 늘린다
resource "aws_lambda_function" "api" {
  role       = aws_iam_role.lambda.arn
  depends_on = [aws_iam_role.lambda, aws_iam_role_policy_attachment.lambda]
  # ... 나머지 설정 ...
}
```

```terraform
# ✅ 참조로 순서를 세우고, 전파 지연은 provider 재시도의 몫으로 둔다.
#    재현되면 "이 리소스에 IAM 전파 재시도가 없다"는 이슈로 제보한다.
resource "aws_lambda_function" "api" {
  role = aws_iam_role.lambda.arn
  # ... 나머지 설정 ...
}
```

### ❌ CI 잡 타임아웃을 리소스 타임아웃보다 짧게 둔다

apply를 끊어도 **AWS 쪽 작업은 계속되어** state에 없는 리소스가 남는다.

```yaml
# ❌ RDS 클러스터(create 기본 120m)가 든 스택인데 잡 타임아웃이 60분
timeout-minutes: 60
```

```yaml
# ✅ 가장 긴 timeouts + 여유. 짧게 가려면 스택을 나눈다
timeout-minutes: 150
```

### ❌ 에러 메시지 문자열로 CI 분기를 만든다

provider 메인테이너조차 **문구 변경이 문제를 일으킨 것을 관찰했다**고 적는 영역이다.

```bash
# ❌ AWS가 문구를 바꾸는 순간 조용히 오작동한다
terraform apply 2>&1 | grep -q "Throttling" && ./retry.sh
```

```bash
# ✅ 종료 코드와 구조화된 출력으로 판단한다
terraform apply -json > apply.json || ./retry.sh
```

### ❌ `timeouts`를 짧게 잡아 "빨리 실패"하게 만든다

기본값은 실측에 가까운 상한이어서 짧게 잡으면 **정상 작업이 끊긴다.**

```terraform
# ❌ 30분이면 충분하겠지
resource "aws_rds_cluster" "main" {
  timeouts { create = "30m" }
  # ... 나머지 설정 ...
}
```

```terraform
# ✅ 기본값을 두거나, 실측 근거가 있을 때만 늘린다
resource "aws_rds_cluster" "main" {
  timeouts {
    create = "180m" # 대형 스냅샷 복원 실측 근거
  }
  # ... 나머지 설정 ...
}
```

## 프로덕션 노트

- **"가끔 실패하고 재실행하면 된다"를 정상으로 두지 않는다.** 대개 provider에 재시도나 waiter가 빠졌다는 뜻이다. 실패 문구·리소스 타입·리전을 기록해 두면 세 번째 발생 시점에 그대로 이슈가 된다.
- **apply 중단은 고아 리소스를 만든다.** 잡 타임아웃, 파이프라인 취소, 스팟 러너 회수 모두 같다. 중단 뒤에는 계정 쪽 상태를 확인하고 필요하면 `import`한다.
- **에러 동사(`creating` vs `waiting for creation`)를 먼저 읽는다.** 앞쪽이면 요청이 거부된 것이고 뒤쪽이면 AWS는 만들고 있는 중이다. 후자에서 곧바로 재실행하면 중복 생성 위험이 있다.
- **`-parallelism`을 올리면 스로틀링이 늘고, SDK 재시도로 apply가 길어진다.** 반대로 재시도가 감추는 범위에는 상한이 있어(IAM 전파 2분) 그 이상의 지연은 구성 순서나 권한 문제다.
- **삭제가 실패하는 리소스는 삭제 waiter와 멱등성 처리를 의심한다.** 콘솔에서 먼저 지운 뒤 destroy가 깨지면 "already deleted" 분기가 없다는 뜻이다.

## 연습문제

1. 자주 쓰는 리소스 하나의 `find.go`·`status.go`·`wait.go`를 열어 상태 전이도를 그린다. *성공 기준:* 생성·삭제 waiter의 `Pending`/`Target`이 실제 상태 문자열로 적혀 있고, 삭제 waiter가 빈 `Target`을 쓰는지와 `timeouts` 문서 기본값이 함께 기록되어 있다.

2. 테스트 계정에서 리소스를 만들고 콘솔에서 삭제한 뒤 `terraform plan`과 `terraform destroy`를 각각 실행한다. *성공 기준:* plan이 재생성 계획을 내는지와 destroy가 not-found를 성공으로 처리하는지가 판정되고, 실패한 쪽에 대해 Read와 Delete 중 어느 분기가 없는지 특정되어 있다.

3. IAM Role을 만들고 곧바로 그 롤을 참조하는 리소스를 만드는 구성을 10회 연속 apply/destroy하고, 같은 스택의 `timeouts` 기본값을 CI 잡 타임아웃과 비교한다. *성공 기준:* 실패 횟수와 에러 문구, 해당 서비스 패키지의 `tfiam.PropagationTimeout` 사용 여부, 가장 긴 `timeouts`와 잡 타임아웃의 차이가 기록되어 있다.

## 요약

- AWS API의 불친절은 셋 — **요청이 도달하지 않음**, **도달했으나 지금은 처리 불가**, **성공 보장에 추가 요청이 필요함**. 앞의 둘은 SDK 자동 재시도가, 셋째(최종 일관성 · 비동기 상태 전이)는 provider의 재시도와 waiter가 맡는다.
- **SDK 재시도**는 일부 네트워크 에러(예외: connection reset), HTTP 429·5xx, `ThrottledException` 류 공통 코드에 발동하고 횟수는 `max_retries`(**기본 25**, 약 1시간)다. 단 **고칠 수 없는 네트워크 에러는 10회 · 약 30초**로 낮춰져 있다.
- 에러는 **`smithy.OperationError`로 감싸여** 오므로 `errors.As` 계열로 언랩한다. **코드로 충분하면 `ErrCodeEquals`, 메시지 파싱이 필요하면 `ErrMessageContains`**이고 **매칭은 딱 필요한 만큼만** 한다. **finder는 not-found를 `retry.NotFoundError`로 바꾸는 자리**이며 그 매핑은 **가장 낮은 계층**, 논리적 삭제 검사는 **가장 높은 계층**에서 한다.
- **`tfresource.Retry`** 안에서 `RetryableError`/`NonRetryableError`/`nil`을 돌려주는 것이 provider 레벨 재시도다. 타임아웃은 **보통 2분, 길어도 5분**, IAM 전파용 표준 상수는 **`tfiam.PropagationTimeout`(2분)** 이며, 재시도를 **잘못 정렬된 구성의 우회로 쓰지 않는다.**
- SDKv2는 **Create가 Read를 호출하며 반환**하고 Framework는 **Create 안에서 Get/Describe**를 한다. `... inconsistent result after apply ... now absent`는 생성 직후 최종 일관성의 증상이고 **`d.IsNewResource()`(SDKv2 전용)** 가 방어 장치다. waiter가 있어도 Read의 not-found는 여전히 날 수 있다.
- **waiter는 `Pending`·`Target`·`Refresh`·`Timeout`** 에 `Delay`·`MinTimeout`·`ContinuousTargetOccurence`를 더한 것이다. **예상 목록에 없는 상태는 에러**가 되고, 삭제 waiter는 **"deleted" 상태가 없으면 `Target`을 빈 목록**으로 둔다. provider는 **SDK 제공 waiter 대신 이 방식을 요구한다.**
- `timeouts`가 조절하는 것은 **waiter 대기뿐**이다 — 네트워크 재시도(10회), 최종 일관성 상수(2분), IAM 전파(2분)는 늘릴 수 없다. 삭제는 **이미 없으면 성공으로 처리**하며 state 제거는 두 프레임워크 모두 자동이고, 사용자에게 가장 실용적인 정보는 **`creating`과 `waiting for creation`의 구분**이다.

## 다음으로

- [46장 — 태깅 구현](46-implementing-tagging.md) — 인터셉터가 CRUD 앞뒤에 끼어드는 구조
- [40장 — 성능과 API 스로틀링](40-performance-and-throttling.md) — `timeouts` 기본값 표와 `max_retries`
- [41장 — 디버깅](41-debugging.md) — 로그에서 실제 API 요청과 request ID 찾기
- 공식 문서: [Retries and Customizable Timeouts](https://developer.hashicorp.com/terraform/plugin/sdkv2/resources/retries-and-customizable-timeouts)
