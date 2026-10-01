---
chapter: 48
level: "Level 3 — 고급"
title: "기여 프로세스: 이슈에서 머지까지 무엇이 요구되는가"
difficulty: 심화
reading_time: "34분"
prerequisites: [43, 47]
source_docs:
  - "docs/index.md"
  - "docs/bugs-and-enhancements.md"
  - "docs/raising-a-pull-request.md"
  - "docs/naming.md"
  - "docs/changelog-process.md"
  - "docs/design-decisions/changie-migration.md"
  - "docs/end-user-documentation.md"
  - "docs/breaking-changes.md"
  - "docs/issue-reporting-and-lifecycle.md"
  - "docs/prioritization.md"
  - "docs/ai-usage.md"
  - "AGENTS.md"
  - "ROADMAP.md"
source_url: "https://hashicorp.github.io/terraform-provider-aws/"
provider_baseline: "6.x"
---

# 48장 — 기여 프로세스: 이슈에서 머지까지 무엇이 요구되는가

**이 장에서 배우는 것**

- 기여의 종류별 경로와 각각에 요구되는 산출물을 구분하고, 이슈가 어떤 기준으로 우선순위를 얻고 왜 오래 열려 있는지 설명할 수 있다.
- 리소스·인수·Go 식별자·파일 이름의 명명 규칙과 약어 대소문자 규칙을 적용할 수 있다.
- changelog 항목이 필요한 변경과 필요 없는 변경을 구분하고, changie 형식으로 항목을 만들 수 있다.
- 무엇이 파괴적 변경인지 판정하고, 사용자 문서를 저장소 규약대로 쓸 수 있다.
- AI 사용 정책과 `AGENTS.md`가 자동화 도구에 요구하는 것을 정확히 말할 수 있다.

**왜 중요한가**

provider는 소수의 HashiCorp 팀이 유지보수하고 **수천 명의 기여자**가 만든다. 이 비대칭이 프로세스의 모양을 결정한다. 유지보수자의 병목은 코드를 쓰는 시간이 아니라 **리뷰하는 시간**이고, 그래서 저장소의 규칙은 대부분 "리뷰 비용을 낮추는 규칙"이다 — 리소스 하나만 담긴 PR을 요구하는 것도 같은 이유다.

이걸 모르고 PR을 열면 벌어지는 일은 구체적이다. 리소스 셋과 서비스 클라이언트 추가를 한 PR에 묶으면 리뷰가 몇 배로 느려져 실제로 몇 달을 기다린다. changelog 항목을 빠뜨리면 자동 검증이 막고, 이름을 `aws_service_discovery_instance`처럼 지으면 서비스 식별자 규칙 위반이라 나중에 **파괴적 변경 없이는 못 고친다.**

반대 방향의 효용이 더 크다. 이 장의 내용은 **기여자가 아닌 사람에게도 쓸모가 있다** — 왜 내가 연 이슈가 2년째 열려 있는지, 왜 내 PR이 mergeable하지 않아도 괜찮은지, 다음 릴리스에 무엇이 들어올지를 근거 있게 예측할 수 있다. 그리고 코드를 한 줄도 쓰지 않고 도울 경로가 실제로 있다 — 우선순위 판단의 **주 지표가 GitHub 반응(reaction)** 이기 때문이다.

## 기여의 종류와 각각의 경로

기여자 문서는 전체 흐름을 일곱 단계로 정리한다 — **개발 환경 -> 디버깅 -> 코드 -> 테스트 -> CI -> changelog -> PR.** 43장부터 47장이 앞의 다섯 단계였고 이 장이 나머지다.

| 기여 종류 | 난이도 | 추가로 요구되는 것 |
|---|---|---|
| 기존 리소스의 버그 수정 | 낮음 | 제거하면 실패하는 인수 테스트, changelog `bug` |
| 인수 추가 | 낮음~중간 | 인수 테스트, 문서 갱신, changelog `enhancement` |
| 새 리소스 / 데이터 소스 | 중간 | skaff, 전체 테스트 세트, 문서 페이지, changelog `feature` |
| 새 서비스 | 높음 | 서비스 클라이언트 등록, `names` 데이터, 전체 `make gen` |
| 문서만 수정 | 낮음 | **changelog 항목 불필요** |

기존 리소스를 건드리는 작은 변경에 원문이 요구하는 것은 다섯이다 — **새 동작을 덮는 인수 테스트**(**코드를 도로 지우면 실패하는 테스트**여야 한다), **같은 PR 안의 문서 갱신**, **`go fmt`을 통과하고 기존 관례를 따르는 코드**, **의존성 업데이트는 별도 PR로**(버전이 빠르게 움직여 충돌이 나므로 그쪽을 먼저 머지한다), **운영자에게 영향이 있다면 changelog 항목**. 신규 구현에는 제약이 하나 더 붙는다 — **새 리소스와 데이터 소스는 aws-sdk-go-v2와 terraform-plugin-framework로 구현하고** 도구로는 `skaff`가 권장된다.

## 이슈: 좋은 이슈 · 라이프사이클 · 우선순위

**버그 리포트**에 요구되는 것은 넷이다 — **최신 릴리스에서 재현했는가**, **중복 검색을 했는가**, **재현 단계와 시크릿을 지운 `.tf` 파일을 첨부했는가**(원문은 이것이 없으면 고치기가 훨씬 어려워진다고 못 박는다), **패닉이면 `crash.log` 전체를 gist로**. **기능 요청**은 중복 검색과 **사용 사례 설명**이 핵심이며 원하는 동작만이 아니라 **왜 중요하고 어떤 이득인지**를 쓴다. **질문**은 먼저 문서를 찾아보되 못 찾았다면 **어디에 있을 거라 기대했는지**를 알려 주는 것 자체가 기여다.

이슈 수명은 여섯 단계다 — **보고 -> 검증과 분류 -> 초기 트리아지 -> PR/커밋으로 처리 -> 종료 -> 종료 30일 후 잠금.** 분류는 **두 라벨 체계**다: (1) 유형(`bug`, `enhancement`, `documentation`, `question`), (2) 코드베이스 영역(보통 서비스 이름). 초기 트리아지는 "즉시 처리할 만큼 치명적인가, 커뮤니티 논의를 위해 열어 둘 것인가"를 정한다. **회귀가 생겼다면 닫힌 이슈에 댓글을 다는 것보다 새 이슈를 여는 편이 낫다.**

우선순위는 네 갈래 입력에서 정해진다.

- **커뮤니티** — 가장 큰 몫이다. **주 지표는 GitHub 반응(thumbs-up)** 이고 댓글과 다른 이슈·PR로의 링크를 함께 본다. 팀 용량상 **가장 많은 실무자에게 가치를 주는 것**을 고른다.
- **고객 에스컬레이션** — Customer Support, Sales Engineering, 고객을 대신한 AWS Solutions Architect 경로로 들어와 내부 보드에서 **주 단위로 트리아지**된다. **고객 요청이라고 자동으로 앞서지 않으며** 기준은 "커뮤니티 지지가 상당한가"와 "Core Services에 해당하는가"다. GitHub 이슈가 없으면 만들어 커뮤니티에 보이게 한다.
- **파트너·내부** — 파트너 요청은 **보통 NDA 아래라 비공개**이고 역시 자동 우선권이 없다. SDK 마이너 릴리스는 자동화로 따라가되 **메이저 변경은 provider 메이저 버전을 요구하므로 연 1회를 목표로** 하며, **나쁜 사용자 경험과 보안 취약점은 언제나 우선 포함**된다.

여기서 흔한 오해가 풀린다. **"PR이 오래 열려 있다가 충돌이 생겼는데 계속 리베이스해야 하나?"** — **유지보수자는 최신 상태 유지를 기대하지 않으며** 충돌과 린트 실패는 리뷰 시점에 대개 유지보수자가 해결하고 **머지 가능 여부는 우선순위에 영향을 주지 않는다.** 릴리스는 **매주 목요일**이고 새 기능과 수정은 **가장 최신 메이저에만** 들어간다(보안 취약점은 예외).

## 네이밍 규칙

이름은 한 번 실무자가 의존하면 **파괴적 변경으로만 바꿀 수 있다.** 그래서 규칙이 세밀하다.

**서비스 식별자**는 코드·문서·설정 전체에서 하나의 AWS 서비스를 가리키는 이름이다(`internal/service/<식별자>`, `aws_<식별자>_thing`). 정하는 방법은 기계적이다 — **AWS SDK for Go v2의 서비스 패키지 이름**과 **AWS CLI v2의 command**(`aws sts get-caller-identity`에서 `sts`)를 찾아 **같으면 그것**, 하나에만 있으면 그것, **다르면 더 짧은 쪽**을 **소문자, 밑줄 없이** 쓴다.

지켜지지 않는 예외가 문서에 그대로 적혀 있다는 점이 실용적이다. 패키지 이름은 다섯 개가 어긋나고(`cloudwatchlogs`→`logs` 등), 리소스 이름 쪽은 **32개가 위반**한다 — EC2·ELB·RDS는 널리 쓰이는 레거시라 식별자가 없거나 일관성이 없고 나머지는 `api_gateway`→`apigateway`, `msk`→`kafka` 형태다. **새 이름은 규칙을 따르고 기존 이름은 그대로 둔다.**

**리소스·데이터 소스 이름**은 AWS SDK의 API 오퍼레이션에서 나온다 — `CreateExperiment`/`GetExperiment`가 있으면 이름은 "Experiment"다. HCL 이름은 **`aws` + 서비스 식별자 + 스네이크 케이스 이름**(`aws_imagebuilder_image_pipeline`), Go 팩토리는 **`Resource<ResourceName>()` / `DataSource<ResourceName>()`** 이며 **서비스 이름을 넣지 않는다.** 문서 파일은 `website/docs/r`와 `d`에 두고 **식별자와 이름을 밑줄로 잇되 "aws"를 넣지 않으며** 확장자는 `.html.markdown`이다(`service_discovery_instance.html.markdown`은 식별자에 밑줄이 들어가 틀렸다). Go 파일도 **서비스를 넣지 않고** 데이터 소스는 `_data_source`, 테스트는 `_test.go`이며 `find.go`·`flex.go`·`wait.go` 같은 관용 이름이 있다.

**Mixed Caps**는 카멜 케이스와 다르다. **약어와 이니셜리즘은 사람이 읽는 올바른 대소문자를 그대로 쓴다** — `VPCEndpoint`이지 `VpcEndpoint`가 아니고 "DynamoDB"는 `DynamoDB` 또는 `dynamoDB`다. 서비스 이름은 **AWS 표기**(`SageMaker`, `GameLift`)를 따르며 `names/caps.md`로 관리되고 **Semgrep이 CI에서 강제**한다. 다만 **"Id"는 목록에서 빠져 있다** — "Identifier" 때문에 오탐이 많아서다.

**함수·변수·상수**의 공통 규칙은 셋이다 — **필요할 때만 export**(호출부가 `tfec2.FindVPCEndpointByID()`처럼 패키지 별칭으로 출처를 알려 주므로 **이름에 서비스를 넣지 않는다**), **MixedCaps/mixedCaps에 밑줄 금지**, **"AWS"/"Aws" 금지**. CRUD 함수는 `resource<ResourceName><CRUD>`, 데이터 소스 Read는 `dataSource<Name>Read`이며 상수는 **같은 값이 AWS SDK에 있으면 새로 정의하지 않는다.** 47장 테스트 이름 규약의 근거도 여기다 — 식별자에서 **의미 없는 단어를 빼고**(`withTags`는 `tags`로 충분) 보조 함수는 `testAccCheck<Resource>Destroy`/`Exists`이며 **여기서도 서비스 이름을 뺀다.**

## changelog: `.changelog/`에서 changie로

changelog의 목적은 분명하다 — **이 릴리스가 자신에게 영향이 있는지, 업그레이드 위험이 어느 정도인지 한눈에 가늠하게 하는 것.** 그래서 **모든 커밋이 항목을 만들면 쓸모가 없어진다.**

전통 형식은 `go-changelog` 기반이며 **`.changelog/{PR번호}.txt`** 에 다음 블록을 넣는다.

````
```release-note:enhancement
resource/aws_eip: Add network_border_group argument
```
````

| 헤더 | 언제 | 본문 형식 |
|---|---|---|
| `new-resource` / `new-data-source` / `new-list-resource` | 새 타입 추가 | **이름만** (`aws_secretsmanager_secret_policy`) |
| `new-guide` | 새 장문 가이드 | 문서 제목 |
| `enhancement` | 인수 추가, Resource Identity 지원 | `resource/aws_x: Add ... argument` |
| `bug` | 잘못된 동작 수정 | `resource/aws_x: Fix ...` |
| `note` / `breaking-change` | deprecation·동작 변화 공지 / 파괴적 변경·제거 | `resource/aws_x: ...` |

접두사는 `resource/`, `data-source/`, provider 수준이면 `provider`다. **한 PR에 여러 블록**을 넣을 수 있고, **항목이 필요 없는 변경**도 명시되어 있다 — **문서 갱신, 테스트 갱신, 코드 리팩터링.**

2025-10-23 설계 결정으로 이 체계가 **Changie**로 옮겨 갔다. 옛 방식의 문제는 **릴리스 때 수동 개입**, 자유 텍스트라 **형식 불일치**, **머지 전 검증 빈약**이었다. 새 구조는 `.changes/6.x/` 아래에 **`unreleased/`(새 항목), `beta/`, `ga/`, 버전별 CHANGELOG(`6.1.0.md`)** 를 둔다. 항목은 YAML이다.

```yaml
kind: enhancement
time: 2024-10-23T10:30:00Z
custom:
  Impact: |-
    resource/aws_example
  Body: Add `example_attribute` argument
  PullRequest: 12345
```

**직접 만들지 말고 Changie CLI로 생성한다** — 생성 시 파일 이름 규칙이 CHANGELOG 생성에 쓰이기 때문이다. 종류는 다섯이다: **breaking-change, note, feature**(새 리소스·데이터 소스·ephemeral 리소스·함수·list 리소스·action), **enhancement, bug**. 자동화는 **항목이 필요한 PR인가**(`no-changelog-needed` 라벨이 없으면 요구), **`CHANGELOG.md`를 직접 편집했는가**, **레거시 조각이 섞였는가**, **`PullRequest` 키가 있는가**를 검증한다.

## 파괴적 변경 정책

정의가 간결하다 — **파괴적 변경이란 기존 배포를 유지하기 위해 사용자가 이미 유효했던 설정을 고쳐야 하는 모든 변경**이다. 기준은 실무적으로 하나로 요약된다: **업그레이드 후 `terraform plan`에 예상 못 한 diff가 없어야 한다.** 그리고 **메이저 버전 안에서는 파괴적 변경이 허용되지 않는다.**

| 파괴적 변경이다 | 파괴적 변경이 아니다 |
|---|---|
| 리소스·데이터 소스·ephemeral·list 리소스·provider 함수 제거 | 그것들의 **추가** |
| 속성 제거, 이전 이름 지원 없는 이름 변경 | Optional 또는 Computed 전용 속성 추가 |
| Optional을 Required로, 속성에서 Computed 제거 | 검증을 **덜** 엄격하게(허용 값 추가) |
| 검증을 더 엄격하게, **기본값 변경** | 권위 있는 문서에 맞추는 버그 수정 |
| 생성·갱신·import 동작을 바꾸는 변경 | |

절차 규칙은 둘이다. **파괴적 변경은 메이저 릴리스를 요구하고**(39장의 v4->v5->v6 업그레이드가 그것이다) **제거 전에 deprecate한다** — SDKv2와 Plugin Framework 각각의 deprecation 문서가 권위 있는 근거로 지정되어 있다. 한 가지 현실적 단서도 있다. AWS의 릴리스 속도와 메이저 릴리스의 드묾 때문에 **마이너 업데이트가 설정이나 환경에 따라 예상 밖 변화를 담는 경우가 있어**(새 기능 지원을 위해 IAM 권한을 더 요구하는 식) **버전 고정(pinning)이 권장된다.**

## 사용자 문서 작성 규약

사용자 문서는 `/website` 아래에 있고 릴리스 과정에서 레지스트리로 간다. 규약이 촘촘한데 대부분 "페이지들이 서로 같아 보이게" 하기 위한 것이다.

**예제.** 리소스마다 **최소 하나가 필수**이고 **동작해야 한다.** 코드 펜스는 **`hcl`을 쓰고(`terraform`이 아니다) `terraform`·`provider` 블록을 넣지 않으며** `variable`·`count` 같은 **언어 기능을 부각하지 않는다.** 리소스 인스턴스 이름은 **`example`**, 이름 값은 가능하면 **`example-` 접두사**다. **모든 인수를 넣을 필요는 없고** 기본 예제는 **그 리소스의 basic 인수 테스트와 같은 설정**이면 된다.

**인수.** **모든 인수를 문서화한다.** 순서는 **(1) 정체성을 이루는 인수 -> (2) Required 알파벳순 -> (3) Optional 알파벳순**이고 도입 문구도 정해져 있다("This resource supports the following arguments:" 또는 "The following arguments are required:"/"...optional:"). 설명 문체가 가장 자주 지적되는 지점이다.

- 간결하게, **미국 영어** 철자와 문법으로. 시간이 지나면 바뀔 AWS 기능·유효 값 정보는 **AWS 문서로 링크**한다.
- **동사나 명사로 시작한다** — **"A ", "An ", "The ", "Specifies ", "Indicates "로 시작하지 않는다.**
- **불리언 인수는 "Whether to "로 시작한다.**
- 허용 값이 제한되면 ``Allowed values are: `value1`, `value2`, and `value3`.``, 기본값이 있으면 ``Default value: `ENABLED`.`` 를 반드시 적는다.

**블록**은 **두 곳에 등장**한다 — 상위 목록에 하위 절 링크와 함께 한 줄(`` `ip_rule` - (Optional) IP rules. See [`ip_rule` Block](#ip_rule-block) below. ``), 그리고 모든 최상위 인수 뒤에 하위 절 하나(여럿이면 **알파벳순**, 절 안에서 **Computed는 Optional 뒤에**). **속성**은 **`id` 먼저, 나머지 알파벳순**이고 도입 문구는 "In addition to all arguments above, the following attributes are exported:"다. 중요한 차이 하나 — **속성 설명에는 유효 값과 기본값을 적지 않는다.**

**콜아웃**은 세 단계이며 레지스트리가 각각 다른 아이콘으로 렌더링한다 — **`->`**(정보: 추가 정보·권장 사항·팁), **`~>`**(경고: 모르면 에러가 나지만 되돌릴 수 없는 변경은 아닌 경우, 예컨대 비밀번호가 state에 평문으로 저장된다), **`!>`**(주의: 되돌릴 수 없는 변경, 데이터 손실). 형식은 `(->|~>|!>) **Note:**` 다.

## PR을 여는 법과 리뷰

절차는 짧다 — **포크 -> 브랜치 -> 변경과 테스트 -> PR 생성 -> changelog 항목 -> 리뷰 준비 완료 표시 -> 리뷰 -> 머지.** 브랜치 이름에는 **접두사 규칙**이 있다: `f`(feature), `b`(bug fix), `d`(documentation), `t`(tests), `td`(technical debt), `v`(dependencies). 예시는 `f-aws_emr_instance_group-refactor` 형태다. PR을 열 때 **'Allow edits from maintainers' 체크박스를 켜 두면** 유지보수자가 직접 손봐 머지할 수 있어 왕복이 준다. 완성 전이라도 **draft PR로 먼저 열어 피드백받고 싶은 항목을 적는 것**이 권장된다.

**PR 모범 사례** 셋이 리뷰 속도를 가장 크게 좌우한다.

- **설명적인 제목** — 주된 변경이 드러나야 하고 특정 리소스에 대한 것이면 **그 이름을 제목에 넣는다.**
- **상세한 설명** — 왜 바꾸는지, 무엇을 바꿨는지, 사용자 경험에 어떤 변화가 예상되는지.
- **작고 집중된 범위** — **리소스·데이터 소스 추가는 PR 하나당 하나**와 그 테스트만 담고 **서비스 클라이언트 추가와 섞지 않는다.**

리뷰는 HashiCorp 엔지니어가 하며 목적은 둘이다 — **설계가 사용자가 기대하는 형태에 맞는지**, **테스트와 모범 사례가 지켜졌는지.** 가능하면 수정을 기여자가 직접 하도록 하지만 사소하거나 급한 것은 유지보수자가 처리하기도 하며, 머지된 PR은 **다음 주간 릴리스**에 들어간다.

## AI 사용 정책 · `AGENTS.md` · 설계 결정 · 로드맵

**AI 사용 정책**은 Terraform Core 기여 가이드의 정책을 그대로 따르며 세 원칙으로 되어 있다.

- **투명성** — AI로 코드·문서·테스트를 생성했다면 **PR 설명에 밝히고** 역할을 **구체적으로** 적는다. **LLM 에이전트로 PR을 낸다면 제목에 `🤖🤖🤖`를 넣는다.**
- **책임** — **AI는 도구이지 별개의 기여자가 아니다.** 책임은 **PR을 연 사람에게 전적으로** 있고 **실제 사람이 소유한 계정**으로 내야 하며 **코드 생성용 봇 계정의 제출은 받지 않는다.** **자기 말로 로직과 부작용을 설명할 수 없으면 그 PR은 제출할 준비가 안 된 것**이다.
- **품질** — **보조이지 자동화가 아니다.** **다듬지 않고 붙여 넣은 저품질 제출은 지양**되며 도구 사용 여부와 무관하게 같은 기준이 적용된다.

**`AGENTS.md`** 는 자동화 도구에 주는 저장소 규칙이다. 세 페르소나(`@contributor`, `@maintainer`, `@tcm`)가 있고 **지정이 없으면 `@contributor`가 기본**이다. 협상 불가 규칙이 분명하다 — **검증은 모든 PR의 하드 종료 조건이며 없으면 작업이 끝난 것이 아니다**, **지루하고 뻔한 해법을 선호하고 요청받은 것만 건드린다**, **빌드·테스트·린트가 깨끗해야 한다**, **`internal/`의 기존 유틸리티를 먼저 재사용한다**, **기존 리소스는 그것이 쓰는 프레임워크를 그대로, 새 리소스는 Plugin Framework.** **`make t`/`make testacc`는 실제 AWS 리소스를 만들므로 명시적 승인을 받고** 돌리며, **`CHANGELOG.md` 직접 편집, 생성된 파일 수정, `go mod tidy` 없는 `go.mod` 변경, 승인 없는 새 의존성 추가는 모두 금지**다.

**설계 결정 로그**(`docs/design-decision-log.md`)는 유지보수자 팀이 무엇을 설계 표준으로 요구할지 내린 결정의 색인이다. **새 결정으로 대체될 수 있고, 원래 내부 프로세스였던 것을 커뮤니티 피드백을 위해 공개로 옮기는 중**이다 — **새 설계 표준을 제안하는 경로가 곧 이슈/PR로 결정 문서를 제안하는 것**이다. **로드맵**(`ROADMAP.md`)은 **몇 달마다** 갱신되며 **Top Community Issues, Core Services, 내부 우선순위**에서 고른 집중 영역을 밝히되 **모든 작업을 기술하지 않고 NDA 아래의 신규 서비스 작업은 빠진다.** **의존성 업데이트**는 대개 유지보수자가 처리하며 changelog 항목은 **보안 취약점과 중대한 변화**에만 붙인다.

마지막으로 **코드를 쓰지 않고 돕는 경로**가 있다. 우선순위의 주 지표가 반응이므로 **필요한 이슈에 반응을 남기는 것**이 직접적인 기여이고 **사용 사례 댓글**은 그 이상의 가중치를 받는다. **최신 버전에서 재현되는지 확인해 알려 주는 것**은 트리아지 비용을 줄이고 **문서 오탈자**는 가장 가벼운 PR이다. 시작점 라벨 **`good-first-issue`** 와 **`help-wanted`** 는 **응답 우선권을 받는다.**

## 흔한 실수

### ❌ 리소스 여러 개와 서비스 클라이언트를 한 PR에 묶는다

리뷰 시간이 몇 배가 되고 한 부분의 논의가 나머지 전부를 막는다. 원문은 이 조합을 **리뷰하기 훨씬 어렵고 오래 걸린다**고 명시한다.

```text
❌ PR #12345: Add ExampleService support
   - 클라이언트 등록 + aws_example_thing + aws_example_other_thing + 데이터 소스
```

```text
# ✅ 하나씩 쪼갠다. 뒤 PR은 앞 PR에 의존한다고 설명에 적는다
PR #1: Add ExampleService client (새 서비스 등록만)
PR #2: New resource: aws_example_thing (+ 인수 테스트 + 문서 + changelog)
PR #3: New resource: aws_example_other_thing
```

### ❌ 인수 설명을 "The ..."로 시작한다

문체 규약 위반이고 리뷰에서 매번 지적된다. 불리언과 기본값·허용 값 표기에도 형식이 있다.

```markdown
* `name` - (Required) The name of the thing.
* `enabled` - (Optional) Specifies whether the thing is enabled. Defaults to true.
* `mode` - (Optional) The mode. Can be STANDARD or EXPRESS.
```

```markdown
<!-- ✅ 동사/명사로 시작, 불리언은 "Whether to", 기본값·허용 값은 정해진 형식 -->
* `name` - (Required) Name of the thing.
* `enabled` - (Optional) Whether to enable the thing. Default value: `true`.
* `mode` - (Optional) Mode of the thing. Allowed values are: `STANDARD` and `EXPRESS`.
```

### ❌ 문서 오탈자 PR에 changelog 항목을 넣는다

**문서 갱신, 테스트 갱신, 코드 리팩터링에는 항목을 넣지 않는다.** 넣으면 릴리스 노트가 의미 없는 줄로 채워지고, 반대로 영향이 있는 변경에서 빠뜨리면 자동 검증이 막는다.

```text
❌ PR: Fix typo in aws_vpc documentation → .changes/6.x/unreleased/... (kind: bug)
✅ PR: Fix typo in aws_vpc documentation  (항목 없이, 필요하면 no-changelog-needed 라벨)
```

### ❌ 기본값을 바꾸면서 마이너 릴리스를 노린다

**속성의 기본값 변경은 파괴적 변경**이다. 업그레이드한 사용자의 `plan`에 예상 못 한 diff가 뜬다.

```go
// ❌ 마이너 릴리스 PR에서 기본값을 바꾼다 (이전 기본값: "provisioned")
"engine_mode": {Type: schema.TypeString, Optional: true, Default: "serverless"},
```

```go
// ✅ 옛 기본값을 유지하고, deprecate를 알린 뒤 다음 메이저에서 바꾼다
"engine_mode": {Type: schema.TypeString, Optional: true, Default: "provisioned"},
// changelog: release-note:note
//   resource/aws_example: The default value of `engine_mode` will change to
//   `serverless` in the next major version
```

## 프로덕션 노트

- **이슈에 반응을 남기는 것이 가장 저렴한 영향력이다.** 우선순위 판단의 주 지표이므로 팀에 필요한 기능이 있으면 조직 차원에서 반응과 사용 사례 댓글을 남기는 것이 사내 포크보다 낫다.
- **급한 기능은 대안 경로를 준비한다.** 릴리스는 주간이지만 리뷰 대기열은 길다. `awscc` provider나 직접 빌드한 provider(43장)를 임시로 쓰는 계획을 세워 둔다.
- **버전 고정은 정책이다.** 마이너 업그레이드가 IAM 권한 추가를 요구할 수 있다는 것이 공식 입장이므로 `~> 6.0` 수준의 제약과 lock 파일 관리가 필요하다.
- **백포트는 없다고 가정한다.** 새 기능과 수정은 최신 메이저에만 들어가며 보안 취약점만 예외다. 또한 **PR을 낸 뒤 리베이스 강박을 갖지 않는다** — 충돌과 린트 실패는 대개 리뷰 시점에 유지보수자가 처리하고 **머지 가능 여부는 우선순위에 영향을 주지 않는다.**
- **AI로 만든 기여는 밝힌다.** 제목의 `🤖🤖🤖`와 설명의 역할 기술이 요구되고 **자기 말로 설명하지 못하는 코드는 제출 대상이 아니다.**

## 연습문제

1. 실제로 쓰는 리소스 하나의 문서 페이지를 저장소 규약과 대조한다. *성공 기준:* 인수 순서, 도입 문구, 설명 시작 단어, 불리언 문체, 기본값 표기, 블록의 두 위치 등장 여부가 항목별로 판정되어 있고 위반 항목이 나열되어 있다.

2. 최근 릴리스의 CHANGELOG에서 항목 열 개를 골라 각각 어떤 kind로 만들어졌는지 역추적한다. *성공 기준:* 각 항목의 kind와 접두사가 근거와 함께 적혀 있고, 항목이 없었을 변경 유형 세 가지가 정리되어 있다.

3. 팀이 필요로 하지만 provider에 없는 기능에 대해 기능 요청 이슈 초안을 쓴다. *성공 기준:* 중복 검색 결과, 사용 사례와 그것이 왜 중요한지, 기대하는 설정 예시가 있고 우선순위 문서의 어느 입력 경로인지 판단이 적혀 있다.

4. 가상의 인수 추가 PR을 설계한다. *성공 기준:* 브랜치 이름, PR 제목과 설명 초안, changelog 항목의 kind와 본문, 문서에 추가할 인수 설명 한 줄, 인수 테스트 이름이 모두 규약에 맞게 적혀 있다.

## 요약

- 기여 흐름은 **개발 환경 -> 디버깅 -> 코드 -> 테스트 -> CI -> changelog -> PR** 일곱 단계이며, 작은 변경에는 **제거하면 실패하는 인수 테스트, 같은 PR 안의 문서 갱신, 의존성 업데이트 분리, changelog 항목**이 요구된다.
- 좋은 버그 리포트는 **최신 릴리스 확인 + 중복 검색 + 시크릿을 지운 `.tf`와 재현 단계 + 패닉이면 `crash.log` 전체**다. 이슈는 **유형·서비스 두 라벨**로 분류되고 **종료 30일 뒤 잠긴다.** 우선순위의 주 지표는 **GitHub 반응**이며 **고객·파트너 요청도 자동 우선권이 없고**, **나쁜 UX와 보안은 언제나 우선**, 릴리스는 **매주 목요일**, 수정은 **최신 메이저에만** 들어간다.
- **서비스 식별자**는 **SDK v2 패키지 이름과 CLI v2 command 중 같으면 그것, 다르면 짧은 쪽, 소문자·밑줄 없음**이다. 리소스 이름은 **`aws` + 식별자 + 스네이크 케이스**, Go 팩토리는 **`Resource<Name>()`** 이며 **서비스 이름과 "AWS"를 넣지 않는다.** **Mixed Caps**는 약어를 사람이 읽는 대소문자로 쓴다(**`VPCEndpoint`**).
- changelog는 전통적으로 **`.changelog/{PR번호}.txt`** 의 `release-note:{헤더}` 블록이었고 헤더는 **new-resource / new-data-source / new-list-resource / new-guide / enhancement / bug / note / breaking-change** 다. **문서·테스트·리팩터링 변경에는 항목을 넣지 않는다.** 2025-10-23 결정으로 **Changie**로 이전해 `.changes/6.x/unreleased/`의 **YAML 조각(kind + Impact/Body/PullRequest)** 을 **CLI로 생성**한다.
- **파괴적 변경**은 "기존 배포를 유지하려면 유효했던 설정을 고쳐야 하는 변경"이고 **메이저 버전 안에서는 허용되지 않는다.** 제거·이름 변경·Optional을 Required로·Computed 제거·검증 강화·**기본값 변경**이 해당하며 **제거 전에 deprecate**한다.
- 사용자 문서는 **예제 필수(`hcl` 펜스, `provider`/`terraform` 블록 없음, 인스턴스 이름 `example`)**, **인수는 정체성 -> Required -> Optional 알파벳순**, 설명은 **"A/An/The/Specifies/Indicates"로 시작 금지, 불리언은 "Whether to ", 기본값은 `Default value:`** 이고 속성은 **`id` 먼저**이며 **유효 값·기본값을 적지 않는다.** 콜아웃은 **`->`/`~>`/`!>`** 3단계다.
- PR은 **접두사 브랜치(`f`/`b`/`d`/`t`/`td`/`v`)**, **'Allow edits from maintainers' 체크**, **좁은 범위**(리소스 추가는 PR당 하나)로 낸다. **AI 사용은 PR 설명에 구체적으로 밝히고 LLM 에이전트는 제목에 `🤖🤖🤖`를 넣으며**, **봇 계정 제출은 받지 않고 자기 말로 설명할 수 없는 코드는 제출 대상이 아니다.**

## 다음으로

- [49장 — 설계 결정에서 배우기](49-design-decisions.md) — 설계 결정 로그에 쌓인 판단들을 읽는 법
- [47장 — 테스트](47-testing.md) — PR에 요구되는 인수 테스트와 CI 통과 요건
- [43장 — 개발 환경과 skaff](43-dev-environment-and-skaff.md) — 기여 흐름의 1단계
- [39장 — 메이저 버전 업그레이드](39-version-upgrades.md) — 파괴적 변경이 사용자에게 도달하는 방식
- 공식 문서: [Contributor Guide](https://hashicorp.github.io/terraform-provider-aws/)
