---
chapter: 40
level: "Level 3 — 고급"
title: "성능과 API 스로틀링: 느린 plan은 어디에서 시간을 쓰는가"
difficulty: 심화
reading_time: "34분"
prerequisites: [16, 34]
source_docs:
  - "docs/retries-and-waiters.md"
  - "docs/error-handling.md"
  - "website/docs/index.html.markdown"
  - "website/docs/r/db_instance.html.markdown"
  - "website/docs/r/lambda_function.html.markdown"
  - "website/docs/r/eks_cluster.html.markdown"
  - "website/docs/r/dynamodb_table.html.markdown"
  - "website/docs/d/ami.html.markdown"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 40장 — 성능과 API 스로틀링: 느린 plan은 어디에서 시간을 쓰는가

**이 장에서 배우는 것**

- plan이 느려지는 원인을 리소스 수·데이터 소스·그래프 세 갈래로 분해하고 어느 쪽이 병목인지 측정으로 판별할 수 있다.
- `-parallelism`을 올렸을 때 빨라지는 것과 깨지는 것을 구분하고, AWS 스로틀링이 어떤 에러 코드로 나타나는지 안다.
- `max_retries`(기본 **25**) · `retry_mode` · `token_bucket_rate_limiter_capacity`가 각각 어느 계층을 건드리는지 알고 안전하게 조정할 수 있다.
- 리소스별 `timeouts` 기본값이 왜 그렇게 다른지 waiter의 동작으로 설명하고 CI 타임아웃과 맞출 수 있다.
- 최종 일관성(eventual consistency)이 provider 내부에서 감춰지는 지점과 감춰지지 않는 지점을 구분할 수 있다.
- `-target`·`-refresh=false`·데이터 소스 남용·모듈 중첩이 각각 언제 정당하고 언제 사고가 되는지 판단할 수 있다.

**왜 중요한가**

`terraform plan`이 11분 걸리기 시작하면 조직의 행동이 바뀐다. 사람들은 plan을 건너뛰고, 파이프라인 타임아웃을 늘리고, 결국 누군가 `-refresh=false`나 `-target`을 배운다. **성능 문제는 성능 문제로 끝나지 않고 안전 절차를 갉아먹는다** — plan 시간은 편의의 지표가 아니라 위험의 지표다.

더 나쁜 조합이 있다. 느려진 plan을 고치려고 `-parallelism=50`을 붙이는 것이다. 동시 요청이 늘면 AWS API 한도에 부딪히고 provider는 그것을 재시도 가능한 에러로 분류해 **지수 백오프로 다시 시도한다.** 기본 `max_retries`는 25이고 원문은 그 백오프가 **대략 한 시간 분량의 재시도**라고 적는다. 즉 결과는 "apply 실패"가 아니라 **"apply가 끝나지 않는다"**로 나타난다 — 로그에 에러는 없고 파이프라인은 살아 있고 40분째 아무 일도 일어나지 않는다.

세 번째 사고는 방향이 반대다. RDS 인스턴스를 만드는 apply가 CI에서 30분 만에 잘려 나간다 — `aws_db_instance`의 `create` 기본 타임아웃은 **40분**인데 잡 타임아웃이 30분이면 Terraform은 정상적으로 기다리는 중인데 **바깥에서 죽고**, AWS 쪽 생성은 계속되므로 state에 없는 인스턴스가 남는다. `timeouts`는 **CI 설계의 입력값**이다.

## plan이 느려지는 세 가지 원인

**원인 1 — 리소스 수.** plan은 state의 모든 관리 대상을 refresh한다. 리소스 N개면 read 계열 호출이 최소 N번 나가고 `-parallelism`(기본 10)만큼만 동시에 처리된다. 리소스 1,400개에 호출 하나가 평균 300ms면 이론상 최소 42초, 실제로는 의존성과 스로틀링 때문에 훨씬 길다. **이 축은 거의 선형이며**, 선형에서 벗어나 계단식으로 튀기 시작하면 이미 스로틀링에 걸리고 있다는 신호다.

**원인 2 — 데이터 소스.** 데이터 소스는 plan마다 **매번** 읽히고 state의 값을 재사용하지 않는다. 모듈 하나가 `data "aws_ami"`를 갖고 그 모듈을 30번 인스턴스화하면 plan 한 번에 AMI 조회가 30번 나간다. `aws_ami`는 EC2의 `DescribeImages`를 호출하는데 필터가 넓을수록 반환량이 커지고 느려진다. **리소스는 늘어난 만큼 느려지고 데이터 소스는 "쓰인 횟수"만큼 느려진다.**

**원인 3 — 그래프.** Terraform은 의존 그래프를 위상 정렬해 순회한다. 그래프가 넓으면(독립 리소스가 많으면) 병렬성이 잘 먹히지만 **깊으면** — A가 B를, B가 C를 기다리는 사슬이 길면 — `-parallelism`을 올려도 소용이 없다. 모듈을 3~4겹으로 중첩하고 출력끼리 연결하면 사슬이 길어진다. **모듈 중첩 깊이는 가독성 문제가 아니라 임계 경로 길이 문제**다.

## `-parallelism`을 올리면 무엇이 빨라지고 무엇이 깨지는가

`-parallelism`은 Terraform이 그래프에서 동시에 처리하는 노드 수의 상한이고 기본값은 10이다. 올리면 빨라지는 것은 **서로 의존하지 않는 리소스가 많고 각각의 API 호출이 짧은 경우**뿐이다 — `aws_route53_record` 500개처럼 폭이 넓은 그래프가 그 조건이다.

효과가 없는 경우가 셋이다. 그래프가 깊은 경우(임계 경로는 병렬성과 무관하다), 시간의 대부분을 **waiter가 쓰는** 경우(RDS 클러스터가 `available`이 되기를 기다리는 20분은 동시성으로 줄지 않는다), 그리고 이미 API 한도에 걸린 경우다.

그리고 **깨지는 것**이 있다. 동시 요청이 늘면 계정·리전·서비스 단위의 요청 속도 한도를 넘기고, AWS는 요청을 거절한다. provider는 이 거절을 대부분 재시도 가능한 에러로 분류하므로 apply는 실패하지 않는다 — 대신 **지수 백오프만큼 느려진다.** 병렬성을 두 배로 올렸는데 전체 시간이 그대로이거나 오히려 늘었다면 십중팔구 여기다.

**`-parallelism`은 측정 없이 올리지 않는다.** 올릴 때는 한 단계씩(10 → 20) 올리고 총 시간과 재시도 로그를 함께 본다. **낮추는 쪽도 도구다** — 스로틀링이 심한 계정에서는 `-parallelism=5`가 20보다 빠를 수 있다.

## AWS 쪽 스로틀링의 실체

AWS API는 서비스마다, 같은 서비스 안에서도 오퍼레이션마다 요청 속도 한도가 다르다. 대체로 토큰 버킷 형태여서 **짧은 버스트는 허용하고 지속적인 고속 요청은 거절한다.** plan은 정확히 버스트를 만드는 워크로드다 — 수백 개의 read 호출이 몇 초 안에 몰린다. 거절은 에러 코드로 오는데, 이름이 서비스마다 다른 것이 함정이다. EC2 계열은 `RequestLimitExceeded`, 다수의 신규 서비스는 `ThrottlingException`, API Gateway나 Lambda 계열은 `TooManyRequestsException`, 일부 서비스는 그냥 `Throttling`을 쓴다. 원문도 이 상황을 인정한다 — AWS Go SDK가 자동 재시도를 거는 조건에 "여러 서비스에 공통인 특정 API 에러 코드(예: `ThrottledException`)"를 넣으면서, **"모든 AWS 서비스가 이 에러 코드들을 일관되게 구현하지는 않는다"**고 덧붙인다.

원문이 정리한 자동 재시도 조건은 셋이다.

- **특정 네트워크 에러.** 다만 **connection reset 에러는 흔한 예외**로 재시도되지 않는다.
- **HTTP 상태 코드 429와 5xx.**
- **여러 서비스에 공통인 특정 API 에러 코드**(예: `ThrottledException`). 단 일관성은 보장되지 않으며, **일부 만료된 자격증명 에러**는 예외로 재시도되지 않는다.

여기에 provider 쪽 조정이 두 겹 더 있다. 하나는 **네트워크 에러의 재시도 횟수를 낮추는 것**이다 — 기본 횟수가 워낙 높아 과도하게 기다리게 되므로 `aws-sdk-go-base`가 **재시도로 해결되지 않는 성격의 특정 네트워크 에러에 한해 횟수를 10으로 낮춘다**(대략 30초). 다른 하나는 **서비스별 커스텀 재시도**다. AWS API가 어떤 에러 코드를 자동 재시도 대상으로 표시하지 않았을 때, provider가 클라이언트 구성 단계(`internal/service/{서비스}/service_package.go`)에서 판정을 덧붙인다. 원문의 S3 예제는 `OperationAborted` 중 **"A conflicting conditional operation is currently in progress against this resource. Please try again."** 를 재시도 대상으로 추가한다.

결론은 하나다. **재시도는 실패를 감추고 시간으로 대가를 치른다.** 로그에 에러가 없다는 것이 스로틀링이 없다는 뜻이 아니다.

## `max_retries` · `retry_mode` · 토큰 버킷

세 인수는 각각 다른 계층을 건드린다.

**`max_retries`** — API 호출이 스로틀되거나 일시적 실패를 겪을 때의 **최대 재시도 횟수**이고 후속 호출 사이의 지연은 **지수적으로 증가**한다. 기본값은 **25**다(3이 아니다). 환경변수 `AWS_MAX_ATTEMPTS`, shared config `max_attempts`로도 설정한다. 원문은 이 값이 지수 백오프와 합쳐져 **대략 한 시간 분량의 재시도**가 되며, 이 높은 기본값이 **provider 코드베이스가 Terraform CLI에서 분리되기 전(0.10 이전)부터 있던 값**이라고 밝힌다 — 최적값이 아니라 역사적 유산이다.

판단은 둘이다. CI에서 **빨리 실패하고 싶다면 낮춘다** — `max_retries = 5`면 스로틀링이 30분을 잡아먹는 대신 몇 분 만에 에러로 드러난다. 반대로 밤새 돌리는 대규모 배치라면 기본값이 유리하다.

**`retry_mode`** — 재시도를 **어떻게** 시도할지를 정하며 유효값은 `standard`와 `adaptive`다(환경변수 `AWS_RETRY_MODE`, shared config `retry_mode`). `adaptive`는 SDK가 스로틀링 응답을 관찰해 **송신 속도를 스스로 줄이는** 모드다. 스로틀링이 상시적이라면 시도해 볼 값이지만 속도를 낮추는 것이 목적이므로 **개별 apply는 더 느려질 수 있다.**

**`token_bucket_rate_limiter_capacity`** — AWS SDK 토큰 버킷 재시도 속도 제한기의 용량이다. 원문의 두 문장이 전부다. **값을 지정하지 않으면 클라이언트 측 속도 제한이 비활성화된다**, 그리고 **값을 지정하면 `retry quota exceeded` 에러가 발생할 가능성이 커진다.** 즉 "스로틀링을 줄여 주는 스위치"가 아니라 **재시도 예산을 명시적으로 제한하는 스위치**이고, 예산이 바닥나면 재시도 대신 새 종류의 에러를 받는다.

```terraform
provider "aws" {
  region = "ap-northeast-2"

  max_retries = 5          # CI에서 빨리 실패시키기 (기본 25)
  retry_mode  = "standard"
  # token_bucket_rate_limiter_capacity 는 의도적으로 설정하지 않는다
}
```

세 인수 모두 [34장](34-provider-configuration-deep.md)의 세 입구(provider 인수·환경변수·shared config)를 갖는다. **CI가 이미 `AWS_MAX_ATTEMPTS`를 export하고 있다면** 어느 쪽이 실제로 적용되는지부터 확인한다.

## `timeouts` 블록과 waiter: 왜 RDS는 40분이고 Lambda는 10분인가

`max_retries`가 **한 번의 API 호출**을 몇 번 다시 던질지의 문제라면, `timeouts`는 **하나의 리소스 작업 전체**를 얼마나 기다릴지의 문제다. 둘은 다른 계층이고 서로를 대체하지 않는다.

기다림이 필요한 이유는 AWS의 비동기 동작 때문이다. 오래 걸리는 작업을 시작하면 **AWS 서비스가 즉시 성공 응답을 돌려주고 요청은 뒤에서 계속 처리**할 수 있으며, 리소스는 그 상태를 컴포넌트 수준 필드(`CREATING`, `UPDATING` 등)나 추적 식별자로 따라간다. **Terraform 리소스는 이 백그라운드 작업이 끝날 때까지 기다려야 한다** — 기다리지 않으면 불완전한 state와 다른 리소스에서의 후속 에러가 생긴다.

그 기다림의 구현이 **waiter**이고, provider는 대부분 `retry.StateChangeConf`와 `retry.StateRefreshFunc`를 쓴다. 네 조각이다 — `Pending`(아직 기다려야 하는 상태), `Target`(도달하면 성공인 상태), `Refresh`(현재 상태를 읽는 함수), `Timeout`. 삭제 waiter에서 **리소스가 사라지고 "deleted" 상태가 없으면 `Target`을 빈 목록으로 둔다**는 것이 관례다.

`timeouts` 블록의 값은 이 `Timeout`으로 그대로 흘러간다. 그래서 기본값의 차이는 **AWS가 그 리소스를 만드는 데 실제로 걸리는 시간**을 반영한다.

| 리소스 | create | update | delete |
|---|---|---|---|
| `aws_db_instance` | 40m | 80m | 60m |
| `aws_rds_cluster` | 120m | 120m | 120m |
| `aws_eks_cluster` | 30m | 60m | 15m |
| `aws_eks_node_group` | 60m | 60m | 60m |
| `aws_dynamodb_table` | 30m | 60m | 10m |
| `aws_s3_bucket` | 20m (`read` 20m) | 20m | 60m |
| `aws_ecs_service` | 20m | 20m | 20m |
| `aws_instance` | 10m (`read` 15m) | 10m | 20m |
| `aws_lambda_function` | 10m | 10m | 10m |
| `aws_lb` | 10m | 10m | 10m |
| `aws_nat_gateway` | 10m | 10m | 30m |
| `aws_kms_key` | 2m | — | — |

RDS가 40분이고 Lambda가 10분인 이유가 여기 있다. RDS 인스턴스 생성은 스토리지 할당과 엔진 부팅을 포함해 실제로 수십 분이 걸리고, Lambda 함수 생성은 사실상 메타데이터 등록이다. **기본값은 여유롭게 잡은 숫자가 아니라 실측에 가까운 상한**이므로 줄이는 것은 대개 나쁜 생각이다 — 진행 중인 작업을 끊으면 AWS 쪽 작업은 계속되므로 **state에 없는 리소스**가 남는다.

예외 둘. `aws_dynamodb_table`과 `aws_kms_key` 문서는 **커스텀 타임아웃을 내부 기본값보다 짧게 잡으면 그 값이 존중되지 않고 긴 쪽이 쓰인다**고 명시한다. 그리고 `aws_eks_cluster`의 `update`는 **`version`과 `vpc_config`에 각각 따로** 적용되므로 두 변경이 한 apply에 들어가면 최대 대기가 120분이 된다.

**CI 타임아웃과 맞추는 규칙.** 잡 타임아웃은 그 스택에 들어 있는 리소스들의 `timeouts` 중 **가장 긴 값 + 여유**보다 커야 한다. RDS 클러스터가 있는 스택이면 잡 타임아웃을 120분 미만으로 두는 것은 사실상 "가끔 고아 리소스를 만든다"는 선언이다. 반대로 stateless 스택만 있는 잡을 두 시간으로 잡는 것도 나쁘다 — 멈춘 apply가 그동안 잠금을 붙든다. **잡 타임아웃은 스택 성격별로 다르게 잡는다.**

## 최종 일관성: provider가 감추는 것과 감추지 못하는 것

원문은 최종 일관성을 **원격 시스템이 강한 read-after-write 일관성을 갖지 않아 오래된 정보나 에러를 돌려주는 일시적 상태**로 정의하고, 크게 확장된 시스템에서 나타나는 패턴이라고 설명한다. 그리고 Terraform과의 충돌을 짚는다 — Terraform은 계획된 변경이 apply 후 그대로 일치하기를 기대하고, 운영자는 drift 감지를 기대하므로 **작업 직후 값을 다시 읽어야 한다.** 덧붙는 한 문장이 이 주제의 성격을 요약한다 — **이런 문제들은 신뢰성 있게 재현되지 않으며** false positive와 함께 잡기 어렵다. "내 환경에서는 안 나던데"가 반증이 되지 못하는 부류다.

**IAM이 대표 사례다.** IAM 서비스 자체가 최종 일관적이고, 그 구성 요소와 권한이 다른 서비스로 **전파되는 것** 또한 그렇다. 원문의 예시 — IAM Role을 만들고 정책을 붙이고 곧바로 그 Role을 다른 서비스(예: Lambda 생성)에서 참조하면 **Role이 존재하지 않는다**, **그 서비스가 Role을 사용할 권한(assume role)이 없다**, **권한이 충분하지 않다** 중 하나를 받는다. 셋 다 실제로는 "아직 전파되지 않았다"는 뜻이다.

provider는 이것을 재시도로 감춘다. `internal/service/iam` 패키지에 **2분짜리 표준 타임아웃 상수**를 두고 IAM 관련 재시도 전부에 쓰며, 원문은 이 값이 **수년간의 Terraform 운영 경험에서 도출되었다**고 적는다. 작업별 재시도의 권장 타임아웃도 명시되어 있다 — **보통 2분, 길어도 5분.**

리소스 생명주기 쪽도 같다. 리소스를 만들고 곧바로 조회하면 일부 서비스는 "not found"를 돌려주므로 provider는 생성 직후의 `Get`/`Describe`(SDKv2 리소스의 `Read`)에 재시도를 건다. 다만 원문은 **Resource Lifecycle Waiter를 구현한 뒤에도 `Read`에서 "not found"가 여전히 발생할 수 있다**고 못박는다.

여기서 **감추지 못하는 것**의 경계가 나온다.

- **감추는 것**: 같은 리소스의 생성 직후 조회, IAM 전파의 정형화된 에러, 서비스별로 알려진 재시도 가능 에러.
- **감추지 못하는 것**: 순서가 잘못된 구성. 원문은 **이런 재시도 로직을 잘못 정렬된 구성을 극복하는 데 쓰지 말라**고 명시하고 **더 큰 환경에서는 통하지 않을 수 있다**고 경고한다. 참조나 `depends_on`으로 순서를 세우는 것이 먼저다([6장](../level1-beginner/06-references-and-dependencies.md)).
- **감추다가 시간을 잡아먹는 것**: 재시도는 성공할 때까지 기다린다. plan/apply가 이유 없이 느릴 때 **"어딘가에서 조용히 재시도하고 있다"**가 유력한 가설이다.

원문의 에러 헬퍼 하나가 이 가설을 확인해 준다. `retry.TimedOut(err)`는 `retry.TimeoutError`이면서 `LastError`가 없을 때 참인데, 이는 **재시도 로직이 한 번도 재시도 신호를 받지 못했다는 뜻이고, AWS API 작업이 반환 전에 이미 자동 재시도하고 있을 때 발생할 수 있다.** 재시도가 두 계층에서 겹친다는 증거다.

## state 크기와 스택 분할 기준

성능 관점에서 state는 둘로 작용한다. **파일 자체의 크기**(모든 plan이 내려받고 잠금을 잡고 갱신하면 올린다)와, 더 큰 쪽인 **refresh 대상 수**다. state 안의 리소스 하나가 곧 API 호출 하나이므로 state 크기와 plan 시간은 사실상 같은 축이다.

그래서 분할 기준은 [38장](38-large-scale-structure-cicd.md)의 네 축과 겹치되 순서가 다르다. 성능만 놓고 보면 **리소스 수**가 먼저다 — 한 스택의 리소스가 수백 개를 넘어가면 plan 시간이 사람들의 인내를 넘긴다. 두 번째는 **변경 빈도**다. 하루 스무 번 배포하는 것과 분기에 한 번 바뀌는 것이 한 state에 있으면, 빠른 쪽이 매번 느린 쪽의 refresh 비용을 낸다. 세 번째와 네 번째가 **팀 경계**와 **폭발 반경**이고, 이 둘은 성능이 아니라 안전과 권한의 축이지만 결과적으로 성능도 개선한다.

**plan 시간이 5분을 넘으면 분할을 검토하고, 10분을 넘으면 다른 모든 대책이 임시방편이다.** 스로틀링 완화, `-parallelism` 조정, `-refresh=false`는 몇 분을 벌어 줄 뿐 축을 바꾸지 못한다.

## `-target`·`-refresh=false`·데이터 소스·모듈 깊이

**`-target`이 응급용인 이유.** 그래프의 일부만 골라 처리하므로 빠른 대신 **plan이 전체 구성의 진실을 말하지 않는다** — 대상 밖의 drift도, 대상 밖에서 발생할 변경도 보이지 않는다. 게다가 대상의 의존성은 함께 처리되므로 "무엇이 포함되는지"가 직관과 어긋난다. 정당한 용도는 하나 — **부분 실패한 apply의 복구.** 정기적으로 쓰이면 그것은 **스택을 나누라는 신호를 무시하는 방법**이다.

**`-refresh=false`를 안전하게 쓰는 조건.** refresh를 건너뛰면 plan은 state를 진실로 간주하므로 세 조건이 모두 참일 때만 안전하다. (1) 그 스택을 **Terraform만** 바꾼다 — 콘솔 변경, 다른 자동화, 다른 계정의 공유 리소스가 없다. (2) **직전 apply가 성공**했고 그 이후 시간이 얼마 지나지 않았다. (3) 정기적으로 **refresh를 하는 별도 경로**가 있다(야간 `terraform plan -refresh-only`로 drift 보고 — [36장](36-drift-refresh-and-checks.md)). 세 번째가 빠지면 drift가 쌓이다 어느 날 큰 diff로 나타난다.

**데이터 소스 남용.** 가장 흔한 사고는 공용 모듈 안에 `data "aws_ami"`를 넣는 것이다. 모듈이 30번 쓰이면 `DescribeImages`가 30번 나가고 그 30번이 전부 같은 답을 준다.

```terraform
# ✅ 루트에서 한 번 조회해 값으로 내려보낸다 (모듈 안에서 호출하면 인스턴스 수만큼 늘어난다)
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

module "app" {
  source = "./modules/app"
  ami_id = data.aws_ami.al2023.id
}
```

같은 원리가 `aws_availability_zones`, `aws_caller_identity`, `aws_region`, `aws_subnets`에도 적용된다. 값이 사실상 불변이라면 **데이터 소스보다 변수나 SSM Parameter가 낫다** — 특히 AMI ID는 조회할 때마다 바뀔 수 있어 **재현성 문제**이기도 하다.

**모듈 중첩 깊이.** 모듈은 그래프에 노드를 더하지 않지만 **의존 사슬을 길게 만든다.** A의 출력이 B의 입력이고 B의 출력이 C의 입력이면, 실제로는 무관한 리소스도 A가 끝나기 전에는 시작하지 못한다. 중첩은 두 겹까지가 실용적 상한이고, 세 겹을 넘으면 **평평하게 펴는 것만으로 apply 시간이 줄어드는 경우가 많다.**

## 측정하는 법과 규모 계산

추측 대신 재는 방법은 셋이다.

**1. 전체 시간.** `time terraform plan`을 며칠치 기록해 두면 "느려졌다"는 체감이 데이터가 된다. CI에서는 단계별 소요 시간을 아티팩트로 남긴다.

**2. API 호출 세기.** `TF_LOG=trace`(또는 `debug`)로 실행하면 SDK가 주고받는 요청·응답이 로그에 남는다. 원문은 `debug`가 **수천 줄의 추가 정보를 내어 유용한 정보를 찾기 어렵게 만들 수 있다**고 경고하지만, 세는 목적이라면 그 양이 재료다. 오퍼레이션별로 집계하면 어느 API가 병목인지 드러난다.

```console
$ TF_LOG=trace terraform plan 2> plan.log
$ grep -o 'X-Amz-Target: [^ ]*' plan.log | sort | uniq -c | sort -rn | head
$ grep -ci "throttl\|RequestLimitExceeded" plan.log
```

두 번째 명령의 숫자가 0이 아니면 스로틀링이 이미 시간을 먹고 있는 것이다.

**3. plan JSON 분석.** `terraform plan -out=tfplan` 뒤 `terraform show -json tfplan`으로 리소스별 계획을 기계적으로 셀 수 있다. 타입별 개수가 곧 refresh 호출 분포다.

**규모 계산.** 스택 200개에 평균 리소스 150개, 하루 plan 10회라면 refresh 호출만 200 × 150 × 10 = **하루 30만 회**이고 여기에 데이터 소스와 apply가 더해진다. 이 규모에서는 **개별 스택 최적화보다 전체 호출 분포를 보는 것이 효율적이다** — 상위 몇 개 스택이 전체의 절반을 차지하는 경우가 흔하고, 그 스택들만 나눠도 계정 전체의 스로틀링이 사라진다.

따라 나오는 대책 하나는 plan 횟수 자체를 줄이는 것이다 — PR마다 전 스택 plan을 도는 파이프라인을 변경된 디렉터리만 도는 것으로 바꾸면 호출이 한 자릿수 배로 줄어든다.

## 흔한 실수

### ❌ 느리다고 `-parallelism`부터 올린다

병목이 waiter나 깊은 그래프면 효과가 없고, 병목이 API 한도면 오히려 느려진다.

```console
# ❌ 원인을 모른 채 동시성만 올린다
$ terraform apply -parallelism=50
```

```console
# ✅ 먼저 재고, 스로틀링이 보이면 오히려 낮춘다
$ TF_LOG=trace terraform plan 2> plan.log
$ grep -ci "throttl\|RequestLimitExceeded" plan.log
$ time terraform plan -parallelism=5
```

### ❌ 스로틀링을 `token_bucket_rate_limiter_capacity`로 막으려 한다

이 인수는 클라이언트 측 속도 제한을 **켜는** 스위치이고, 원문은 값을 지정하면 `retry quota exceeded` 가능성이 커진다고 적는다.

```terraform
# ❌ 스로틀링이 괴로워서 반사적으로 켠다
provider "aws" {
  token_bucket_rate_limiter_capacity = 100
}
```

```terraform
# ✅ 재시도 정책을 먼저 조정한다. 속도 제한은 마지막 수단
provider "aws" {
  max_retries = 5
  retry_mode  = "adaptive"
}
```

### ❌ CI 잡 타임아웃을 리소스 `timeouts`보다 짧게 잡는다

Terraform이 기다리는 중인데 바깥에서 잘린다. AWS 쪽 생성은 계속되므로 state에 없는 리소스가 남는다.

```yaml
# ❌ aws_db_instance(create 40m, update 80m)가 있는 스택인데
timeout-minutes: 30
```

```yaml
# ✅ 스택 안 최대 timeouts + 여유. RDS 클러스터가 있으면 120m 이상
timeout-minutes: 140
```

### ❌ 모듈마다 데이터 소스를 호출한다

데이터 소스는 plan마다 다시 읽히므로, 같은 답을 주는 조회가 모듈 인스턴스 수만큼 나간다.

```terraform
# ❌ 모듈 내부에서 data "aws_ami" 호출 — 30개 모듈이면 30번
```

```terraform
# ✅ 루트에서 한 번 조회하고 값을 내려보낸다
module "app" {
  source = "./modules/app"
  ami_id = data.aws_ami.al2023.id
}
```

## 프로덕션 노트

- **plan 시간을 지표로 관리한다.** 스택별 소요 시간을 CI 아티팩트로 남기고 임계값(예: 5분)을 넘으면 알림을 띄우면, 분할 시점이 논쟁이 아니라 데이터가 된다.
- **`max_retries`는 환경마다 다르게 잡는다.** CI는 낮춰 빨리 실패시키고 야간 배치는 기본값(25, 대략 한 시간)을 유지한다. 코드 하나로 두 값을 쓰려면 환경변수 `AWS_MAX_ATTEMPTS`를 파이프라인에서 주입한다.
- **로그에 에러가 없다고 스로틀링이 없는 것이 아니다.** 재시도는 실패를 감추고 시간으로 대가를 치르므로, plan 시간이 계단식으로 튀면 재시도 로그부터 센다.
- **`timeouts`를 줄이기 전에 waiter를 이해한다.** 기본값은 AWS가 실제로 쓰는 시간에 가깝고, `aws_dynamodb_table`·`aws_kms_key`는 내부 기본값보다 짧게 잡아도 **긴 쪽이 쓰인다**고 문서가 명시한다.
- **IAM을 만든 직후의 실패는 대개 권한 문제가 아니다.** provider가 2분 상수로 재시도하는 전파 지연 구간에서는 "Role 없음", "assume 불가", "권한 부족"이 모두 같은 원인을 가리킬 수 있다.

## 연습문제

1. 가장 느린 스택 하나를 골라 `TF_LOG=trace`로 plan을 돌리고 오퍼레이션별 API 호출 수를 집계한다. *성공 기준:* 상위 5개 오퍼레이션과 각각의 호출 수가 표로 정리되고, 그중 데이터 소스가 유발한 호출과 refresh가 유발한 호출이 구분되어 있다.

2. 같은 스택에서 `-parallelism`을 5·10·20으로 바꿔 각각 세 번씩 plan을 돌리고 소요 시간과 스로틀링 로그 줄 수를 기록한다. *성공 기준:* 시간이 병렬성에 단조 감소하지 않는 구간을 지목하고 스로틀링 로그 수로 설명할 수 있다.

3. CI 잡 타임아웃과 각 스택에 포함된 리소스의 `timeouts` 최댓값을 대조한 표를 만든다. *성공 기준:* 잡 타임아웃이 더 짧은 스택이 모두 식별되고, 각각 "잡 타임아웃을 늘린다 / 리소스를 옮긴다" 중 하나가 근거와 함께 선택되어 있다.

## 요약

- plan이 느려지는 원인은 **리소스 수(refresh 호출)·데이터 소스(plan마다 재조회)·그래프 깊이(임계 경로)** 세 갈래이고, 대응이 각각 다르므로 먼저 측정한다.
- `-parallelism`(기본 10)은 폭이 넓은 그래프에서만 효과가 있다. waiter가 시간을 쓰거나 이미 API 한도에 걸린 상황에서는 올려도 소용이 없거나 오히려 느려진다.
- 스로틀링 에러 코드는 서비스마다 다르다(`RequestLimitExceeded`, `ThrottlingException`, `TooManyRequestsException` 등). SDK 자동 재시도 조건은 특정 네트워크 에러(connection reset은 예외), HTTP 429·5xx, 서비스 공통 API 에러 코드이며 원문은 **모든 서비스가 이 코드들을 일관되게 구현하지는 않는다**고 적는다. 재시도로 해결되지 않는 특정 네트워크 에러는 **10회(약 30초)**로 낮춰져 있다.
- `max_retries` 기본값은 **25**이고 지수 백오프와 합쳐 **대략 한 시간** 분량이다. `retry_mode`는 `standard`/`adaptive`, `token_bucket_rate_limiter_capacity`는 지정하지 않으면 클라이언트 측 속도 제한이 **꺼져 있고** 지정하면 `retry quota exceeded` 가능성이 커진다.
- `timeouts`는 waiter(`retry.StateChangeConf`)의 `Timeout`으로 흘러가고 기본값은 실제 소요 시간을 반영한다 — `aws_db_instance` 40m/80m/60m, `aws_rds_cluster` 120m, `aws_lambda_function` 10m. **CI 잡 타임아웃은 이 값보다 커야 한다.**
- 최종 일관성은 provider가 재시도로 상당 부분 감추지만(IAM은 **2분** 표준 상수) **잘못 정렬된 구성을 대신 고쳐 주지는 않으며**, 감추는 동안 시간을 쓴다.
- `-target`은 부분 실패 복구용이고, `-refresh=false`는 "Terraform만 바꾼다 + 직전 apply 성공 + 별도 refresh 경로 존재"가 모두 참일 때만 안전하다. 둘의 사용 빈도가 구조 변경 시점을 알려 준다.

## 다음으로

- [41장 — 디버깅: TF_LOG · 에러 메시지 해부 · 재현](41-debugging.md) — trace 로그를 세는 것에서 읽는 것으로
- [45장 — 에러 처리 · 재시도 · Waiter](45-errors-retries-waiters.md) — 이 장의 재시도·waiter를 구현하는 쪽에서 보기
- [38장 — 대규모 코드 구조와 CI/CD 파이프라인](38-large-scale-structure-cicd.md) — 스택 분할의 나머지 축과 파이프라인 설계
- 공식 문서: [Provider Argument Reference](https://registry.terraform.io/providers/hashicorp/aws/latest/docs#max_retries)
