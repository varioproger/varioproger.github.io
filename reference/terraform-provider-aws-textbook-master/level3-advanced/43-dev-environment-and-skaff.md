---
chapter: 43
level: "Level 3 — 고급"
title: "개발 환경과 skaff: 직접 빌드해서 붙이기"
difficulty: 심화
reading_time: "30분"
prerequisites: [42]
source_docs:
  - "docs/skaff.md"
  - "docs/makefile-cheat-sheet.md"
  - "docs/debugging.md"
  - "docs/add-a-new-service.md"
  - "docs/add-a-new-resource.md"
  - "docs/changelog-process.md"
  - "docs/index.md"
  - "AGENTS.md"
  - "main.go"
  - ".go-version"
source_url: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs"
provider_baseline: "6.x"
---

# 43장 — 개발 환경과 skaff: 직접 빌드해서 붙이기

**이 장에서 배우는 것**

- provider 저장소를 클론해 로컬에서 빌드하고, 그 바이너리를 Terraform이 실제로 쓰게 만들 수 있다.
- `dev_overrides`가 `terraform init`과 lock 파일을 어떻게 무력화하는지 알고 안전하게 원복할 수 있다.
- GNUmakefile 타깃을 "초 단위 / 분 단위 / AWS 요금이 나가는 것"으로 분류해 필요한 것만 돌릴 수 있다.
- `make gen`이 무엇을 생성하고 언제 서비스 범위로 좁혀야 하는지 판단할 수 있다.
- `skaff`로 리소스·데이터 소스·ephemeral·function·list 스캐폴딩을 만들고 생성된 지시 주석을 읽을 수 있다.
- 로컬 빌드에 디버거를 붙여 CRUD 함수 안을 보고, 이슈 재현부터 수정 검증까지 완주할 수 있다.

**왜 중요한가**

금요일 오후에 `aws_ecs_service`가 특정 조건에서 매번 diff를 만든다. 이슈에 "main 브랜치에서 고쳤다, 다음 릴리스에 들어간다"는 코멘트가 달려 있고 다음 릴리스는 목요일이다. 선택지는 둘 — 엿새를 기다리며 `lifecycle { ignore_changes }`로 덮어 두거나, **main 브랜치를 빌드해서 30분 안에 확인**하거나. 후자를 할 수 있으면 "이 수정이 우리 케이스도 고치는가"에 직접 답할 수 있다.

반대 방향도 있다. 이슈를 올렸는데 메인테이너가 "재현이 안 된다"고 답한다. 우리 환경에는 조직 SCP가 걸려 있고, 특정 리전이고, 태그 정책이 있다. 필요한 것은 더 긴 설명이 아니라 **최소 재현 설정과 그것으로 실패하는 인수 테스트 하나**다. 원문 debugging 가이드가 강조한다 — 1,000줄짜리 설정보다 **같은 버그를 재현하는 10줄짜리 설정이 100배쯤 유용하다.**

세 번째는 판정이다. 문서에 없는 동작이 의도인지 버그인지는 소스를 읽으면 답이 나오지만([42장](42-provider-architecture.md)), **브레이크포인트 하나가 논쟁 열 번보다 빠르다.** 원문 기여자 문서가 기여 흐름을 "1. 개발 환경 구성 → 2. 디버그 → 3. 코드 변경"으로 놓는 것도 같은 이야기다.

## 준비물과 Go 버전 고정

필요한 것은 **Go**(저장소가 고정한 버전), **Terraform CLI**, **저장소 클론** 셋이다.

Go 버전은 루트의 `.go-version`에 있고 v6.x 기준 **1.26.6**이다. `AGENTS.md`도 스택을 "Go 1.26+, AWS SDK for Go v2"로 명시한다. GNUmakefile이 이 값을 강제한다 — 치트시트의 `GO_VER` 설명대로 **기본값이 `.go-version` 파일의 값**이고, 시스템 기본 Go를 쓰려면 `GO_VER=go`로 지정한다. 그래서 `prereq-go` 타깃이 따로 있다.

`make prereq-go`가 그 버전을 설치하고, `GO_VER=go make build`는 시스템 기본 Go로 강행한다. `GO_VER=go` 우회는 "로컬에선 되는데 CI에서만 깨지는" 문제를 만든다 — 생성기가 Go 버전에 민감해서 `make gen` 결과물이 달라지면 CI의 `gen-check`가 실패한다.

## 빌드: `make build`가 하는 일

치트시트에서 `build`는 **dependent 타깃**(다른 타깃을 먼저 돌린 뒤 자기 일을 하는 타깃)이고 영향 변수는 `GO_VER`다. 두 가지를 더 읽어야 한다 — **기본 타깃(`_default_`)이 `build`**여서 `make`만 쳐도 빌드가 돌고, **`install`은 `build`의 별칭**이다. 별도의 설치 단계가 있는 것이 아니다.

결과 바이너리는 `$GOBIN`(미설정이면 `$GOPATH/bin`, 보통 `~/go/bin`)에 `terraform-provider-aws`라는 이름으로 놓인다. 이 **디렉터리 경로**를 다음 절에서 쓴다. 컴파일 통과만 확인하려면 `go-build`가 CI의 "go-build" 검사와 같은 일을 한다.

## Development Overrides: 로컬 바이너리를 물리기

빌드한 바이너리를 Terraform이 쓰게 하는 공식 경로가 **provider development overrides**다. Terraform CLI 설정 파일(Linux/macOS는 `~/.terraformrc`, Windows는 `%APPDATA%\terraform.rc`)에 넣는다.

```hcl
provider_installation {
  dev_overrides {
    "hashicorp/aws" = "/home/user/go/bin"
  }

  # 나머지 provider 는 평소대로 레지스트리에서 받는다
  direct {}
}
```

**1) 값은 바이너리가 아니라 디렉터리다.**

**2) `terraform init`이 무의미해진다.** 오버라이드된 provider는 설치 대상이 아니므로 Terraform은 내려받지 않고, `.terraform.lock.hcl`의 버전 제약·해시도 적용되지 않는다. `required_providers`의 `version = "~> 6.0"`도 강제되지 않는다 — main을 빌드했다면 다음 메이저를 개발 중인 코드여도 그대로 실행된다.

**3) 실행할 때마다 경고가 나온다.** `plan`이든 `apply`든 매번 "development overrides가 적용 중이며 동작이 릴리스된 어떤 버전과도 일치하지 않을 수 있고, 변경을 적용하면 state가 배포된 릴리스와 호환되지 않을 수 있다"는 취지의 경고가 붙는다(문구는 CLI 버전에 따라 다르다). 끌 수 없고 **꺼서도 안 된다.** 켜져 있다는 사실을 잊고 프로덕션 workspace에 `apply`를 때리는 것이 이 장에서 가장 비싼 실수다.

되돌리는 법은 블록을 지우는 것이지만, 더 안전한 습관은 파일을 분리해 `TF_CLI_CONFIG_FILE=~/.terraformrc.dev terraform plan` 처럼 셸 하나에서만 살려 두는 것이다.

## GNUmakefile 지도: 비용 등급으로 기억한다

타깃은 100개가 넘는다. **비용 등급**으로 나눠 기억하면 된다.

**초 단위 — 마음껏 돌린다.** `fmt`(포매팅 수정), `fmt-check`(검증만), `fumpt`, `fix-imports`, `terraform-fmt`. `AGENTS.md`가 이 등급을 따로 언급한다 — **"`make fmt`는 싼 예외다. 마음껏 돌려라."** 나머지 린트는 "작은 변경 → 린트" 루프를 만들지 말고 PR 직전에 몰아서 돌리라고 한다.

**분 단위 — 범위를 좁혀서 돌린다.** `test`(유닛 테스트, 단일 서비스인지 전체인지 자동 감지), `test-compile`(컴파일 확인, AWS 호출 없음), `gen`(생성기), `golangci-lint`(1~5 분할), `import-lint`, `semgrep`, 그리고 이들을 묶은 `quick-fix`(copyright·fmt·testacc-lint·imports·modern·semgrep·terraform-fmt·website-terrafmt 일괄).

여기서 **`PKG`(동의어 `K`)** 가 결정적이다. `ec2`·`iam`·`lambda` 같은 서비스 패키지 이름을 주면 Go 처리가 그 패키지와 의존성으로 한정되고, `PKG_NAME`·`SVC_DIR`·`TEST`에 값이 할당되어 기존 값을 덮는다. `AGENTS.md`의 지침도 같다 — **"대부분의 명령은 변경한 패키지로 범위를 좁혀라. provider는 매우 크다. build·lint·semgrep의 provider 전역 게이트는 CI다."** 최종 패스는 `make quick-fix PKG=<service>` 하나다. 포매팅·import·린트·semgrep 수정과 `copyright-fix`를 적용하고 **빌드가 깨져 있으면 실패**하므로 별도 빌드 단계가 필요 없다.

**시간 단위 + 실제 AWS 요금 — 승인받고 돌린다.** `testacc`, `t`(패키지 자동 감지), `testacc-short`/`ts`, `sane`/`smoke`, `sanity`(실패 허용), `sweep`/`sweeper`(남은 리소스 정리). 기본값은 **`ACCTEST_PARALLELISM=20`, `ACCTEST_TIMEOUT=360m`**, 기본 스윕 리전은 `us-west-2,us-east-1,us-east-2,us-west-1`이다. `AGENTS.md`가 못박는다 — "`make t`와 `make testacc`는 실제 AWS 리소스를 생성한다. **실행 전 명시적 승인을 받아라.**"

```console
$ make testacc TESTS=TestAccIAMRole_basic PKG=iam   # 이름·패키지 지정
$ make t T=TestAccIAMRole_basic                     # 패키지 자동 감지
```

`T`의 자동 감지는 `PKG`도 `K`도 없을 때 `internal/` 아래 `_test.go`를 훑어 패키지를 찾고, **여러 개가 매칭되면 첫 번째를 쓰면서 경고**하고, **하나도 없으면 에러로 멈춘다.** `T`·`TESTS`는 `RUNARGS`를 덮지만 `TESTARGS`는 덮이지 않으므로 `-v` 같은 플래그는 `TESTARGS`로 얹는다. 병렬성은 `P`가 `ACCTEST_PARALLELISM`보다 우선한다 — 스로틀링([40장](40-performance-and-throttling.md))에는 `P=4`가 첫 대응이다.

**Legacy 타깃 함정.** 치트시트의 **Legacy?** 열은 "조심해서 써라. 동작하지 않을 수도 있고, 현재 관행과 맞지 않는 검사나 수정을 할 수도 있다"고 적으며, **`lint`·`docs-lint`·`docs-check`·`website-lint`** 계열이 여기 해당한다. `docs/add-a-new-resource.md`가 여전히 `make lint`를 안내하는 것은 문서 사이의 시차다 — 최신 지침은 `make quick-fix PKG=<service>`이고 문서 검증은 `make swissshepherd`다.

## `make gen`: 코드 생성이 만드는 것

[42장](42-provider-architecture.md)에서 봤듯 이 provider는 **어노테이션 기반 자기 등록**을 쓴다. 그 등록 코드를 만드는 것이 `make gen`이고, 입구는 서비스 디렉터리의 `generate.go` 한 파일이다.

```go
//go:generate go run ../../generate/servicepackage/main.go
//go:generate go run ../../generate/tagstests/main.go
//go:generate go run ../../generate/identitytests/main.go
// ONLY generate directives and package declaration! Do not add anything else to this file.

package <service>
```

마지막 주석이 규칙이다 — **generate 지시문과 패키지 선언만.** `servicepackage`는 `service_package_gen.go`(이 패키지가 등록하는 리소스·데이터 소스·ephemeral·list 목록. 어노테이션을 스캔해 만든다), `tagstests`는 태깅 인수 테스트([46장](46-implementing-tagging.md)), `identitytests`는 Resource Identity 인수 테스트를 만든다. 태깅 헬퍼 생성기가 더해지면 `tags_gen.go`가 생긴다.

**범위가 중요하다.** `AGENTS.md`가 정한다 — 어노테이션이나 서비스의 `generate.go`를 바꾼 뒤에는 `make gen PKG=<service>`, **전역 `make gen`은 `names/data/names_data.hcl`이나 `internal/generate/`를 바꿨을 때만.** 전역은 모든 서비스에 영향을 주고 수 분이 걸린다. 그리고 **"생성된 파일을 손으로 편집하지 마라"** — 손으로 고친 `*_gen.go`는 다음 생성에서 덮이고, 그전에 CI의 `gen-check`가 diff를 잡는다.

## skaff: 스캐폴딩 도구

`skaff`는 이 저장소의 스캐폴딩 CLI다. 원문의 설명이 명확하다 — **소스 파일과 테스트 파일을 최신 모범 사례에 맞춰 생성하며, 생성물에 지시 주석이 빽빽하게 붙어 있어 provider 개발을 시작하는 가장 좋은 방법**이라는 것이다.

`make skaff`로 설치한 뒤 **작업할 디렉터리로 이동해서** 실행한다 — 리소스·데이터 소스·ephemeral·list는 **해당 서비스 디렉터리**에서, function은 **`internal/functions`** 에서.

```console
$ make skaff
$ cd internal/service/mq
$ skaff resource --name BrokerReboot
$ skaff list --name EBSVolume
```

### 서브커맨드와 플래그

서브커맨드는 `resource`, `datasource`, `ephemeral`, `list`, `function`, 그리고 `completion`(bash/fish/powershell/zsh 자동완성)과 `help`다.

공통 플래그는 넷이다 — **`-n, --name`**(엔티티 이름, 반드시 준다), **`-s, --snakename`**(스네이크 케이스를 잘못 유도할 때 명시 지정. 예: `db_vpc_instance`. 대문자 약어가 붙은 이름에서 자주 필요하다), **`-f, --force`**(덮어쓰기), **`-c, --clear-comments`**(지시 주석 생략).

전용 플래그는 셋이다. **`-t, --include-tags`** 는 `resource`·`datasource`에만 있고 "태그가 있으니 태깅 코드를 생성하라"는 표시다. **`-d, --description`** 은 `function` 전용, **`-p, --framework`** 는 **`list` 전용**이다.

`resource`·`datasource`·`ephemeral`에 **SDK를 고르는 플래그가 없다**는 것이 요점이다. 원문 skaff 문서의 팁이 이유를 말한다 — **신규 리소스는 Terraform Plugin Framework로 구현해야 하며 그것이 `skaff`의 기본 설정**이다. 선택지가 아예 없는 것이 의도된 설계다([42장](42-provider-architecture.md)).

### 지시 주석과, skaff가 만들지 않는 것

생성물에 붙는 "TIP" 주석은 장식이 아니다. 스키마를 어떻게 채우는지, 어디에 finder를 넣는지, 어떤 에러 처리를 해야 하는지가 그 자리에 적혀 있다. 원문의 워크플로 순서도 (1) 이름 정하기([48장](48-contributing.md)) → (2) 스캐폴딩 생성 → (3) 커스터마이즈 → (4) 실행·테스트 → (5) **"TIP" 주석 제거** → (6) PR 이다. `--clear-comments`는 처음부터 쓰는 플래그가 아니라 이미 패턴을 아는 사람이 잡음을 줄이려고 쓰는 것이다.

`skaff`는 소스 파일과 테스트 파일을 만든다. **사용자 문서**(`website/docs/r/<service>_<name>.html.markdown` — Terraform Registry에 그대로 실린다)와 **changelog 엔트리**(`.changelog/{PR번호}.txt`)는 직접 만든다. 새 리소스의 changelog는 ` ```release-note:new-resource ` 헤더에 리소스 이름 한 줄이 본문이고, **파일 이름이 PR 번호이므로 PR을 연 다음에야 만들 수 있다.** `AGENTS.md`는 `CHANGELOG.md`를 직접 편집하는 것을 금지한다 — 반드시 `.changelog/` 엔트리를 통한다.

## 새 서비스를 추가할 때의 시작점

**0단계 — 설계.** 원문이 못박는 말이 둘 있다 — 대부분의 워크플로를 열어 주는 데 **AWS 서비스 제공 범위의 100%를 덮을 필요는 없다.** 그리고 **리소스는 격리해서 리뷰·머지하므로 여러 신규 리소스를 한 PR에 묶지 않는다.**

**1단계 — `names/data/names_data.hcl` 확인.** 세 갈래다. 서비스가 있고 `not_implemented` 속성이 **없으면** 바로 첫 리소스/데이터 소스를 구현한다. `not_implemented`가 **true면** 그 속성을 제거하고 클라이언트 PR을 낸다. 서비스가 **없으면** naming 가이드의 식별자 규칙으로 식별자를 정하고 새 블록을 추가한다. 원문의 경고 — **`names_data.hcl`을 추가·변경할 때는 매우 조심하라. provider와 생성기들이 이 파일이 정확하다는 전제 위에 있다.** 글로벌 서비스는 `is_global = true`.

**2단계 — 서비스 디렉터리와 `generate.go`.** `mkdir internal/service/<service>` 후 `generate.go`를 작성하고 `make gen`, `go mod tidy`를 돌린다. 여기까지가 **클라이언트 PR**이다 — 원문은 신규 리소스를 제출하기 **전에** AWS SDK for Go 서비스 클라이언트만 담은 별도 PR을 먼저 내라고 요구한다. 클라이언트가 머지된 뒤 **3단계**로 별도 PR에서 skaff로 첫 리소스를 구현한다([44장](44-implementing-a-resource.md)).

## 디버거 붙이기

`fmt.Printf()`부터 시작해도 된다. 원문 debugging 가이드는 이 접근을 "빠르고 지저분한" 방법으로 인정하면서, **코드를 이미 읽었고 무엇이 잘못됐는지 강한 심증이 있을 때 그것을 확인하는 데 특히 유용**하다고 말한다. 반대로 **복잡한 로직, 많은 줄, 많은 변수**에는 맞지 않는다. AWS SDK 입력 구조체를 `%+v`로 통째로 찍으면 "우리가 실제로 보낸 요청이 무엇인가"가 테스트 로그에 그대로 나온다.

```go
outputRaw, err := tfresource.RetryWhenAWSErrMessageContains(ctx, propagationTimeout, /* ... */)
fmt.Printf("reached point %d, with input: %+v\n", 3, input)
```

### VS Code로 테스트를 디버그하기

저장소의 `.gitignore`가 `.vscode`를 무시하므로 **개인 설정이 저장소에 올라갈 걱정이 없다.** 원문이 주는 `launch.json`은 `"type": "go"`, `"mode": "auto"`, `"program": "${fileDirname}"`(현재 파일의 디렉터리를 패키지로 실행), `"args": ["-test.v", "-test.run", "^${selectedText}$"]`, `"env": {"PKG_NAME": "${relativeFileDirname}"}`, `"envFile": "${workspaceFolder}/.vscode/private.env"` 를 갖는 "Debug Selected Test" 구성 하나다.

`${selectedText}`가 핵심이다. **에디터에서 테스트 함수 이름을 드래그해 선택한 상태**로 실행하면 그 테스트만 돈다. 원문은 선택 범위를 구체적으로 지시한다 — 앞의 `func`나 뒤의 `(t *testing.T) {`는 **포함하지 않는다.**

`.vscode/private.env`에는 인수 테스트 환경변수를 넣는다 — `TF_ACC=1`, `TF_LOG=info`, `GOFLAGS='-mod=readonly'`, `AWS_PROFILE`, `AWS_DEFAULT_REGION`, 그리고 멀티 리전·계정 테스트가 쓰는 `AWS_ALTERNATE_PROFILE`·`AWS_ALTERNATE_REGION`·`AWS_THIRD_REGION`. `TF_ACC=1`이 없으면 인수 테스트는 스킵된다([47장](47-testing.md)). `TF_LOG`은 **`debug`로 올리면 수천 줄이 쏟아져 정작 쓸모 있는 정보를 찾기 어려워지므로** 기본을 `info`로 둔다([41장](41-debugging.md)).

브레이크포인트는 **리소스의 Create·Read·Update·Delete 함수**에 찍는다. 디버거는 처음 만나는 브레이크포인트에서 멈춘다. 멈춘 뒤의 제어는 여섯 개 — 일시정지, step over(함수 안으로 들어가지 않음), step into(따라 들어감), step out(호출자의 다음 문장으로), 재시작, 정지. IDE를 쓰지 않겠다면 **Delve**를 직접 쓴다.

### 실행 중인 provider에 붙기: `-debug`와 `TF_REATTACH_PROVIDERS`

위 방법은 **인수 테스트**를 디버그한다. "우리 실제 설정으로 `terraform apply`를 돌릴 때 provider 안에서 무슨 일이 일어나는가"를 보려면 provider의 디버그 모드를 쓴다. `main.go`에 근거가 그대로 있다.

```go
debugFlag := flag.Bool("debug", false, "Start provider in debug mode.")
// ...
if *debugFlag {
	serveOpts = append(serveOpts, tf5server.WithManagedDebug())
}
err = tf5server.Serve("registry.terraform.io/hashicorp/aws", serverFactory, serveOpts...)
```

`-debug`를 주면 provider 프로세스는 **Terraform이 띄우는 자식 프로세스가 아니라 우리가 직접 띄운 프로세스**가 되고, 시작할 때 재접속 정보를 출력한다. IDE에서 provider 바이너리를 `-debug` 인수로 디버그 실행하고(`"program": "${workspaceFolder}"`, `"args": ["-debug"]`인 구성을 하나 더 만든다), 콘솔에 출력된 `TF_REATTACH_PROVIDERS=...` 값을 복사해 별도 터미널에 설정한 채 실제 설정 디렉터리에서 `terraform plan`/`apply`를 돌리면, Terraform은 provider를 새로 띄우지 않고 **이미 떠 있는(디버거가 붙어 있는) 프로세스에 연결**한다.

이 모드에서는 `dev_overrides`가 필요 없다 — Terraform이 바이너리를 찾을 필요 자체가 없다. 실행 중인 프로세스에 붙는 것이 목적이면 `TF_REATTACH_PROVIDERS`만, 빌드한 바이너리를 쓰는 것이 목적이면 `dev_overrides`만 쓴다. **섞으면 헷갈린다.**

## 재현에서 검증까지

원문 debugging 가이드의 다섯 단계는 그대로 사용자에게도 좋은 절차다.

**1. 재현한다** — 버그가 실재하는지, **항상** 일어나는지 **간헐적으로** 일어나는지 확인한다. **2. 최소 재현을 만든다** — 리소스·의존성·인수를 최대한 제거하되 **테스트 독립성**은 유지하고, 제거 후에도 버그가 나는지 확인한다. 사라졌다면 너무 많이 지운 것이므로 되돌린다. 원문의 표현대로 **최소 설정은 그 무게만큼의 금값**이며 여기까지만 해도 충분한 기여다.

**3. 실패하는 인수 테스트를 만든다.** 최소 설정을 테스트 설정 함수로 옮기면 **버그를 명령 하나로 재현**할 수 있게 되어 디버깅 도구를 쓸 수 있다. 여기에 원문의 실무 규칙이 붙는다 — 테스트만 기여할 때는 **테스트가 "PASS"하도록 만들되 코드 주석과 이슈로 무엇이 잘못됐는지 설명하라.** **인수 테스트가 7,000개에 육박해 항상 일정 비율이 설명 불가능하게 실패하므로**, 알려진 버그를 드러내는 새 테스트가 그 더미에 묻히면 안 되기 때문이다. 에러가 나는 버그면 `ExpectError`와 이슈 링크 주석을, 값이 틀리는 버그면 `resource.TestCheckResourceAttr()`가 **현재의(틀린) 값**을 확인하게 두고 주석에 기대값을 남긴다.

**4. 왜 일어나는지 찾는다** — `fmt.Printf()`로 시작해 IDE 디버거로 옮겨 간다. **5. 테스트로 수정을 검증한다** — 디버깅에 썼던 테스트가 그대로 회귀 테스트가 되어 **미래의 변경이 이 수정을 되돌리지 못하게 막는다.**

정지점을 의식적으로 정해 두면 좋다. **빌드와 `dev_overrides`까지**가 대부분의 운영자에게 충분하고(30분이면 된다), **최소 재현과 실패하는 테스트까지**가 코드를 고칠 줄 몰라도 되는 기여 지점이며, **수정과 PR**부터가 [44장](44-implementing-a-resource.md) 이후다. **"provider를 고칠 줄 모르니 로컬 빌드도 안 해 본다"가 가장 비싼 선택**이다.

## 흔한 실수

### ❌ `dev_overrides` 값으로 바이너리 경로를 준다

Terraform은 이 값을 **디렉터리**로 해석한다. 파일 경로를 주면 provider를 찾지 못한다.

```hcl
dev_overrides {
  # ❌ 바이너리 파일을 직접 가리킨다
  "hashicorp/aws" = "/home/user/go/bin/terraform-provider-aws"
}
```

```hcl
# ✅ 바이너리가 들어 있는 디렉터리를 가리킨다
dev_overrides {
  "hashicorp/aws" = "/home/user/go/bin"
}
```

### ❌ `dev_overrides`를 켜 둔 채 프로덕션에 apply한다

경고는 매 실행마다 나오지만 CI 로그나 긴 plan 출력 속에 묻히면 눈에 띄지 않는다. state가 릴리스된 provider와 호환되지 않게 남으면 되돌리기가 훨씬 비싸다.

```console
# ❌ 전역 ~/.terraformrc 에 오버라이드를 넣고 잊는다
$ terraform apply

# ✅ 실험용 설정 파일을 분리하고 그 셸에서만 쓴다
$ TF_CLI_CONFIG_FILE=~/.terraformrc.dev terraform plan
```

### ❌ 생성된 `*_gen.go`를 손으로 고치고, 어노테이션 한 줄에 전역 `make gen`을 돌린다

손으로 고친 생성물은 다음 생성에서 되돌아오고 CI의 `gen-check`가 diff를 잡는다. 전역 생성은 모든 서비스를 훑어 수 분이 걸린다.

```go
// ❌ service_package_gen.go 를 직접 편집하고 `make gen` 을 전역으로 돌린다

// ✅ 어노테이션을 고치고 `make gen PKG=example` 로 재생성한다
// @FrameworkResource("aws_example_thing", name="Example Thing")
func newExampleThingResource(_ context.Context) (resource.ResourceWithConfigure, error) { /* ... */ }
```

### ❌ `skaff`를 저장소 루트에서 실행한다

`skaff`는 **현재 디렉터리에** 파일을 만든다. 루트에서 실행하면 엉뚱한 곳에 리소스 파일이 생긴다.

```console
# ❌ 루트에서 실행
$ cd terraform-provider-aws && skaff resource --name BrokerReboot

# ✅ 서비스 디렉터리로 이동해서 실행 (function 은 internal/functions)
$ cd internal/service/mq && skaff resource --name BrokerReboot
```

## 프로덕션 노트

- **오버라이드 설정은 셸 단위로 격리한다.** `TF_CLI_CONFIG_FILE`을 쓰는 규칙을 팀 표준으로 정하고, CI 러너에서는 그 변수가 설정되지 않도록 검사 하나를 넣는다. 전역 `~/.terraformrc`에 오버라이드를 두는 관행은 언젠가 프로덕션 state를 개발 중인 provider로 건드리게 만든다.
- **인수 테스트 계정을 프로덕션과 분리한다.** `make testacc`는 실제 리소스를 만들고 실패하면 남긴다. 정리는 `sweep`/`sweeper`가 하는데, **패턴에 맞는 리소스를 지우므로** 프로덕션 계정에서 절대 돌리지 않는다.
- **로컬 빌드 검증은 별도 workspace에서 한다.** 프로덕션 state를 가리키는 디렉터리에서 개발 빌드로 `plan`을 돌리면 refresh만으로도 예상 못 한 결과를 낼 수 있다. Go 빌드 캐시는 수 GB로 자라므로 `make cache-info`·`make clean-go-cache-trim`으로 관리한다.
- **`-debug` 세션은 타임아웃과 싸운다.** 브레이크포인트에 오래 멈춰 있으면 Terraform이나 AWS API 쪽 타임아웃이 날 수 있으므로 먼저 `fmt.Printf()`로 범위를 좁힌다.
- **PR을 낼 거라면 마지막 패스는 `make quick-fix PKG=<service>` 하나다.** Legacy로 표시된 `lint`·`docs-lint` 계열은 현재 CI 검사와 일치하지 않는다.

## 연습문제

1. 저장소를 클론해 `.go-version`에 맞는 Go로 빌드하고, 빈 디렉터리에 리소스 하나짜리 설정을 만들어 `dev_overrides`로 로컬 빌드가 쓰이는지 확인한다. *성공 기준:* plan 출력에 development overrides 경고가 나타나고, `terraform init` 없이 plan이 실행되며, 오버라이드 제거 후에는 다시 `init`이 필요해지는 것이 확인되어 있다.

2. 자주 쓰는 서비스 패키지 하나를 골라 `make test PKG=<service>`와 범위 없는 `make test`의 소요 시간을 비교한다. *성공 기준:* 두 경우의 시간이 측정되어 있고, `PKG`가 `PKG_NAME`·`SVC_DIR`·`TEST`를 덮는다는 치트시트의 설명과 관측이 일치하는지 서술되어 있다.

3. `make skaff` 후 임의의 서비스 디렉터리에서 `skaff resource --name <이름>`을 실행하고 생성된 파일과 지시 주석을 목록으로 만든다. *성공 기준:* 파일 이름이 `AGENTS.md`의 네이밍 규칙(`{thing}.go`, `{thing}_test.go`)과 대조되어 있고, 주석이 요구하는 작업이 최소 다섯 항목으로 정리되어 있으며, `-s/--snakename`이 필요한 이름의 예가 하나 제시되어 있다. 생성물은 커밋하지 않는다.

4. 열린 이슈를 하나 골라 debugging 가이드의 1~2단계(재현 → 최소화)를 수행한다. *성공 기준:* 최소 설정이 20줄 이하이고, 제거한 항목과 "제거하면 재현되지 않는" 최소 필수 항목이 구분되어 있으며, 증상이 항상 나는지 간헐적인지 명시되어 있다.

5. 인수 테스트 하나를 디버그 실행하고 대상 리소스의 Read 함수에 브레이크포인트를 걸어 AWS 응답이 state로 들어가기 직전의 값을 확인한다. *성공 기준:* 관찰한 변수 이름과 값이 기록되어 있고, step into와 step over의 차이가 실제 관찰로 설명되어 있다.

## 요약

- provider를 직접 빌드하는 이유는 **미릴리스 수정 검증, 이슈 재현·최소화, 인수 지원 판정, 직접 수정** 넷이고, 앞의 셋은 Go 코드를 몰라도 할 수 있다.
- Go 버전은 `.go-version`이 고정한다(v6.x 기준 **1.26.6**). `GO_VER`의 기본값이 그 파일 값이고 `make prereq-go`가 설치한다. `make build`는 **기본 타깃이자 `install`의 정체**다.
- 빌드 산출물이 놓인 **디렉터리**를 `~/.terraformrc`(Windows는 `%APPDATA%\terraform.rc`)의 `dev_overrides`에 지정한다. provider 설치와 lock 파일 제약이 무력화되고 매 실행마다 경고가 나온다. `TF_CLI_CONFIG_FILE`로 셸 단위 격리하는 것이 안전하다.
- Makefile 타깃은 비용 등급으로 기억한다 — **초 단위**(`fmt`), **분 단위**(`test`, `gen`, `golangci-lint`, `quick-fix`), **시간 단위 + AWS 요금**(`testacc`, `t`, `sane`, `sweep`). `PKG`(=`K`)로 좁히는 것이 첫 수단이고 Legacy인 `lint`·`docs-lint` 대신 `quick-fix`를 쓴다. 인수 테스트는 기본 병렬성 **20**, 타임아웃 **360m**이며 실제 AWS 리소스를 만든다.
- `make gen`은 어노테이션을 스캔해 `service_package_gen.go`와 태깅·Identity 테스트를 만든다. 서비스 `generate.go`에는 **generate 지시문과 패키지 선언만** 둔다. 어노테이션 변경 후엔 `make gen PKG=<service>`, 전역 실행은 `names_data.hcl`이나 `internal/generate/` 변경 시에만. **생성물은 손으로 고치지 않는다.**
- `skaff`는 **작업 디렉터리에서** 실행한다(function만 `internal/functions`). 서브커맨드는 `resource`·`datasource`·`ephemeral`·`list`·`function`, 공통 플래그는 `-n`·`-s`·`-f`·`-c`, 전용 플래그는 `-t/--include-tags`(resource·datasource), `-d`(function), `-p/--framework`(list)다. **SDK를 고르는 플래그는 없다 — Framework가 기본이자 유일한 신규 경로다.** 문서와 changelog는 만들어 주지 않는다.
- 새 서비스는 `names_data.hcl` → 서비스 디렉터리 + `generate.go` → `make gen` + `go mod tidy` → **클라이언트만 담은 별도 PR** → skaff로 첫 리소스 순서다.
- 디버깅의 다섯 단계는 **재현 → 최소 재현 → 실패하는 인수 테스트 → 원인 규명 → 테스트로 검증**이다. 테스트만 기여할 때는 **"PASS"하게 만들고 주석과 이슈 링크로 설명**한다. `-debug`와 `TF_REATTACH_PROVIDERS`를 쓰면 **실제 `apply` 중인 provider에 디버거를 붙일 수 있다.**

## 다음으로

- [44장 — 리소스 구현하기](44-implementing-a-resource.md) — skaff가 만든 뼈대를 실제 스키마와 CRUD로 채우기
- [45장 — 에러 처리·재시도·Waiter](45-errors-retries-waiters.md) — 최종 일관성 문제를 코드로 다루기
- [48장 — 기여 프로세스](48-contributing.md) — changelog 엔트리·문서·PR까지
- 공식 문서: [Terraform CLI Configuration — Development Overrides](https://developer.hashicorp.com/terraform/cli/config/config-file#development-overrides-for-provider-developers)
