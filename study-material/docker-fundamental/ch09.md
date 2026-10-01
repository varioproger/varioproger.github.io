---
title: "9장. Dockerfile의 진화와 멀티플랫폼 빌드"
---

# 9장. Dockerfile의 진화와 멀티플랫폼 빌드

8장에서는 BuildKit이 Dockerfile을 LLB(Low-Level Build) DAG로 변환하고, 솔버가 이를 병렬로 실행하며,
캐시 마운트와 콘텐츠 주소화 캐시로 재빌드 속도를 끌어올리는 내부 구조를 살펴봤습니다. 이번 장은 그
엔진 위에서 실제로 우리가 작성하는 Dockerfile 자체가 지난 몇 년 사이 어떻게 달라졌는지, 그리고 하나의
Dockerfile로 여러 CPU 아키텍처용 이미지를 만들어내는 멀티플랫폼 빌드가 내부적으로 어떻게 동작하는지를
다룹니다. Dockerfile은 겉보기엔 여전히 `FROM`, `RUN`, `COPY` 몇 줄짜리 텍스트 파일이지만, BuildKit이
프론트엔드로 전환된 이후 문법 자체가 별도의 버전 관리 대상이 되었고, 그 변화 속도는 Docker Engine 릴리스
주기보다 훨씬 빠릅니다.

## Dockerfile 문법도 버전이 있다

Docker Engine이 예전 빌더(legacy builder)를 쓰던 시절에는 Dockerfile 문법이 사실상 Docker Engine
버전에 종속되어 있었습니다. 새로운 명령어나 옵션을 쓰려면 Docker Engine 자체를 업그레이드해야 했습니다.
BuildKit이 도입되면서 이 관계가 끊어졌습니다. Dockerfile을 실제로 해석하는 주체는 Docker Engine이
아니라 **Dockerfile 프론트엔드**라는, 컨테이너 이미지로 배포되는 별도의 파서·빌드 그래프 생성기이기
때문입니다. 이 프론트엔드가 어떤 이미지인지는 Dockerfile 맨 첫 줄의 지시자로 지정합니다.

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.20
RUN echo "hello"
```

`# syntax=` 줄은 주석처럼 보이지만 BuildKit이 특별히 해석하는 지시자입니다. 이 줄이 있으면 BuildKit은
Dockerfile 본문을 자신의 내장 파서로 해석하지 않고, 지정된 이미지(`docker/dockerfile:1`)를 프론트엔드로
pull받아 그 프론트엔드가 Dockerfile을 분석해 LLB를 생성하도록 위임합니다. 즉 Dockerfile 문법 자체가
하나의 독립된 소프트웨어 컴포넌트로 분리되어, Docker Engine 버전과 무관하게 배포·업데이트될 수 있게 된
것입니다.

`docker/dockerfile:1` 태그는 고정된 버전이 아니라 **롤링(rolling) 태그**입니다. Docker Hub의 공식
`docker/dockerfile` 저장소에서 이 태그는 항상 1.x 계열의 가장 최근 stable 릴리스를 가리키도록
갱신됩니다. 버전 지정 방식은 세 단계로 나뉩니다.

| 지시자 | 의미 |
|---|---|
| `docker/dockerfile:1` | 1.x의 모든 마이너·패치 릴리스를 자동으로 따라감(권장 기본값) |
| `docker/dockerfile:1.7` | 1.7 마이너 버전에 고정, 패치 릴리스까지만 자동 반영 |
| `docker/dockerfile:1.7.1` | 완전히 고정된 버전, 이후 어떤 업데이트도 반영되지 않음 |

실무에서는 대부분 `docker/dockerfile:1`을 사용합니다. 이렇게 하면 신규 문법이나 버그 수정, 보안 패치가
Dockerfile을 전혀 수정하지 않아도 다음 빌드부터 자동으로 적용됩니다. 반대로 빌드 재현성(reproducibility)이
극도로 중요한 환경, 예를 들어 특정 커밋 시점의 빌드 결과를 몇 년 뒤에도 동일하게 재현해야 하는 규제 산업
파이프라인이라면 `docker/dockerfile:1.7.1`처럼 패치 버전까지 완전히 고정하는 편이 안전합니다. `syntax`
지시자를 아예 생략하면 BuildKit은 자신에게 내장된 기본 파서를 쓰는데, 이 경우 이후 설명할 최신 문법
상당수를 쓸 수 없으므로 신규 프로젝트에서는 `# syntax=docker/dockerfile:1`을 습관적으로 첫 줄에
넣는 것이 좋습니다.

## 최근 몇 년 사이 추가된 핵심 문법

레거시 빌더 시절의 Dockerfile은 셸 명령을 그대로 나열하는 수준이었지만, BuildKit 프론트엔드가 발전하면서
빌드 그래프 자체를 더 정교하게 제어할 수 있는 문법이 여럿 추가됐습니다. 여기서는 실무에서 가장 자주
마주치는 네 가지 — heredoc, RUN 마운트 옵션, `COPY --link`, ARG 스코프 — 를 다룹니다.

### heredoc: 여러 줄 스크립트를 이스케이프 없이

과거에는 여러 줄짜리 셸 스크립트를 하나의 `RUN`으로 실행하려면 `\` 줄바꿈과 `&&`를 계속 이어붙여야
했습니다.

```dockerfile
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*
```

이 방식은 한 줄이라도 `&&`를 빼먹으면 레이어가 예상과 다르게 나뉘고, 셸 문법 하이라이팅도 제대로 되지
않습니다. heredoc 문법은 셸에서 흔히 쓰는 `<<EOF ... EOF` 블록을 Dockerfile 안으로 그대로 가져옵니다.

```dockerfile
# syntax=docker/dockerfile:1
FROM debian:bookworm-slim

RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends curl ca-certificates
rm -rf /var/lib/apt/lists/*
EOF
```

이 블록은 한 번의 `RUN`으로 처리되어 여전히 레이어 하나만 생성하지만, 내용은 일반 셸 스크립트 파일처럼
자연스럽게 읽고 씁니다. `COPY`도 heredoc을 지원하므로, 별도 파일을 만들지 않고 Dockerfile 안에서 짧은
설정 파일을 바로 생성할 수 있습니다.

```dockerfile
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    location / {
        proxy_pass http://backend:8080;
    }
}
EOF
```

여러 개의 heredoc을 동시에 열어 여러 파일을 한 번에 만들 수도 있고, 인터프리터를 지정해 파이썬·Perl
스크립트를 직접 작성하는 것도 가능합니다(`RUN <<PYTHON` 뒤에 `#!/usr/bin/env python3`로 시작하는
블록을 두는 식). 다만 heredoc은 문법적 편의일 뿐 LLB 그래프 구조 자체를 바꾸지는 않는다는 점은
기억해 둘 필요가 있습니다. 여전히 하나의 `RUN` 인스트럭션은 하나의 실행 스텝, 하나의 캐시 키로
취급됩니다.

### RUN의 마운트 옵션: `--mount=type=...`

`RUN --mount`는 이번 장에서 다루는 문법 중 실무 영향이 가장 큰 기능입니다. 핵심 아이디어는 "빌드
컨테이너가 실행되는 동안에만 특정 콘텐츠를 마운트하고, 결과 레이어에는 반영하지 않는다"는 것입니다.
BuildKit은 네 가지 마운트 타입을 지원합니다.

**`type=bind`(기본값)**: 빌드 컨텍스트나 다른 빌드 스테이지의 파일시스템을 읽기 전용으로 마운트합니다.
`COPY`와 달리 파일을 이미지 레이어로 복사하지 않으므로, "이 스테이지에서만 잠깐 참조하고 최종 이미지에는
남기지 않을 파일"을 다룰 때 유용합니다.

```dockerfile
RUN --mount=type=bind,source=go.sum,target=go.sum \
    --mount=type=bind,source=go.mod,target=go.mod \
    go mod download
```

**`type=cache`**: 지정한 경로를 빌드 간에 유지되는 영속 캐시 디렉터리로 마운트합니다. 8장에서 다룬
BuildKit 캐시 시스템 중에서도 가장 체감 효과가 큰 기능으로, 언어별 패키지 매니저의 다운로드 캐시나
컴파일러 중간 산출물 디렉터리를 지정하면 매 빌드마다 처음부터 의존성을 내려받는 낭비를 없앨 수
있습니다.

```dockerfile
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go build -o /out/app ./cmd/app
```

캐시 마운트는 `id`로 여러 스테이지·타겟 간에 캐시를 구분해서 관리할 수 있고, `sharing=locked`,
`sharing=shared`, `sharing=private` 옵션으로 동시 빌드 시 캐시 접근 방식을 제어합니다. 기본값인
`shared`는 여러 빌드가 같은 캐시를 동시에 읽고 쓸 수 있게 허용하는데, 일부 패키지 매니저는 잠금
파일 경쟁으로 오류를 낼 수 있어 이 경우 `sharing=locked`로 직렬화하는 편이 안전합니다.

**`type=secret`**: 자격 증명이나 API 토큰처럼 이미지에 절대 남으면 안 되는 값을 파일 또는 환경 변수
형태로 빌드 컨테이너 안에만 노출합니다. `docker build --secret id=npmrc,src=$HOME/.npmrc` 형태로
호스트에서 값을 전달하면, `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc` 구문으로 해당
스텝 실행 중에만 파일이 존재하고, 스텝이 끝나면 레이어 diff에서 제거됩니다. 예전에는 `ARG`나 `ENV`로
빌드 인자를 넘기면 그 값이 이미지 히스토리에 그대로 남는 문제가 있었는데, `type=secret`은 이 문제를
근본적으로 해결합니다.

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

**`type=ssh`**: 호스트의 SSH 에이전트 소켓을 빌드 컨테이너에 전달해, 프라이빗 Git 저장소를 `git clone`
하거나 SSH 기반 패키지를 내려받을 때 개인키를 이미지에 굽지 않고도 인증할 수 있게 합니다. `docker build
--ssh default`로 호스트의 기본 SSH 에이전트를 전달하고, Dockerfile에서는 `RUN --mount=type=ssh
git clone git@github.com:org/private-repo.git`처럼 사용합니다.

네 가지 마운트 타입 모두 공통점은 "빌드에는 필요하지만 결과 이미지에는 남지 않아야 하는 것"을 다루는
방식이라는 점입니다. 이는 BuildKit이 실행 컨테이너의 루트 파일시스템과 최종 레이어 diff를 명확히
분리해서 관리하기 때문에 가능한 구조이며, 레거시 빌더에서는 이런 구분 자체가 없었습니다.

### `COPY --link`: 레이어 독립성으로 캐시 재사용 극대화

일반적인 `COPY`는 새 레이어를 이전 레이어 위에 스택으로 쌓기 때문에, 베이스 이미지가 바뀌거나 앞
단계의 레이어 하나가 바뀌면 그 뒤에 있는 `COPY` 레이어도 대부분 다시 계산해야 합니다. `--link` 옵션을
주면 BuildKit은 해당 `COPY`를 이전 레이어 체인과 무관하게 독립적으로 생성한 뒤, 이미지를 조립하는
마지막 단계에서 레이어들을 링크(연결)합니다.

```dockerfile
FROM golang:1.23 AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    go build -o /out/app ./cmd/app

FROM gcr.io/distroless/base-debian12
COPY --link --from=build /out/app /usr/local/bin/app
ENTRYPOINT ["/usr/local/bin/app"]
```

이 패턴의 이점은 두 가지입니다. 첫째, 베이스 이미지(`gcr.io/distroless/base-debian12`)가 보안 패치로
새 버전이 나와도, 애플리케이션 레이어(`/usr/local/bin/app`)는 다시 빌드할 필요 없이 새 베이스 위에
그대로 재사용(리베이스)할 수 있습니다. 둘째, 여러 개의 `--link` 레이어는 서로 의존성이 없기 때문에
BuildKit이 병렬로 처리할 수 있어 빌드 그래프 전체의 실행 시간이 줄어듭니다. 다만 `--link`는 대상 경로에
심볼릭 링크를 따라가지 않고, 항상 파일시스템 루트를 기준으로 복사가 이뤄진다는 제약이 있으므로,
컨테이너 안에서 상대 경로나 링크에 의존하는 복잡한 디렉터리 구조를 복사할 때는 동작을 미리 확인해야
합니다.

### ARG의 스테이지 간 스코프

멀티스테이지 빌드가 일반화되면서 `ARG`가 어느 범위까지 유효한지가 자주 혼란을 일으키는 지점이 됐습니다.
규칙은 다음과 같이 정리할 수 있습니다.

- 첫 번째 `FROM` **이전**에 선언된 `ARG`는 전역(global) 스코프를 가지며, 베이스 이미지 태그를 변수화하는
  용도로만 쓸 수 있습니다. 이 값은 `FROM` 줄에서만 사용 가능하고, 이후 스테이지 본문에서 그대로 참조하려면
  각 스테이지 안에서 다시 선언해야 합니다.
- `FROM` **이후**, 즉 각 빌드 스테이지 내부에서 선언된 `ARG`는 해당 스테이지에서만 유효합니다. 이후
  스테이지가 `FROM ... AS`로 앞 스테이지를 상속하더라도, 앞 스테이지의 `ARG` 값이 자동으로 넘어오지
  않습니다.

```dockerfile
# syntax=docker/dockerfile:1
ARG GO_VERSION=1.23

FROM golang:${GO_VERSION} AS build
ARG TARGETARCH
RUN echo "building for ${TARGETARCH}"

FROM gcr.io/distroless/base-debian12
# 여기서 TARGETARCH를 쓰려면 다시 ARG로 선언해야 합니다.
ARG TARGETARCH
COPY --link --from=build /out/app-${TARGETARCH} /usr/local/bin/app
```

`TARGETARCH`, `TARGETOS`, `TARGETPLATFORM`, `BUILDPLATFORM` 같은 이름은 BuildKit이 멀티플랫폼
빌드 시 자동으로 주입하는 내장 인자입니다. 뒤에서 다룰 `buildx build --platform` 옵션과 맞물려,
하나의 Dockerfile로 아키텍처별 분기를 처리할 때 핵심적인 역할을 합니다.

### 멀티스테이지 빌드의 캐시 최적화 패턴

`FROM ... AS <이름>`으로 스테이지에 이름을 붙이고 `COPY --from=<이름>`으로 다른 스테이지의 산출물만
가져오는 멀티스테이지 빌드는 이제 사실상 표준 패턴입니다. 캐시 효율을 높이려면 "자주 바뀌는 것"과
"거의 바뀌지 않는 것"을 레이어 순서상 분리하는 원칙이 여전히 중요합니다.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
COPY --link --from=deps /app/node_modules ./node_modules
COPY --link --from=build /app/dist ./dist
CMD ["node", "dist/server.js"]
```

`deps` 스테이지는 `package.json`/`package-lock.json`만 먼저 복사해 의존성 설치 레이어를 애플리케이션
소스 변경과 분리합니다. 소스 코드만 바뀌었다면 `deps` 레이어는 캐시에서 그대로 재사용되고, `npm ci`는
다시 실행되지 않습니다. 여기에 `type=cache` 마운트까지 더하면, 캐시 자체가 무효화되는 상황(예:
`package-lock.json` 변경)에서도 npm의 전역 패키지 캐시는 유지되어 다운로드 시간을 줄일 수 있습니다.
런타임 스테이지는 빌드 도구 체인이 전혀 없는 슬림 이미지를 베이스로 하고, 필요한 산출물만
`COPY --from=`으로 가져오기 때문에 최종 이미지에는 컴파일러나 빌드 캐시가 전혀 남지 않습니다.

## 멀티플랫폼 빌드: 하나의 태그, 여러 아키텍처

`docker buildx build --platform linux/amd64,linux/arm64 -t myorg/app:1.0 --push .` 같은 명령
한 줄로 서로 다른 CPU 아키텍처용 이미지를 동시에 만들고, 이를 하나의 태그로 묶어 배포하는 것이
이제는 일반적인 워크플로가 됐습니다. 이 한 줄 뒤에서는 크게 두 가지 실행 방식과, 결과물을 하나로
묶어주는 이미지 스펙 차원의 장치가 함께 작동합니다.

### 실행 방식 1: QEMU 유저모드 에뮬레이션

`docker buildx` 빌더가 단일 노드(예: amd64 CI 러너 한 대)에서 arm64 이미지까지 빌드해야 하는 경우,
BuildKit은 `binfmt_misc` 커널 메커니즘과 QEMU의 유저모드 에뮬레이션(`qemu-user-static`)을 활용합니다.
빌드 컨테이너 안에서 arm64용 바이너리를 실행해야 할 때, 커널이 그 실행 요청을 가로채 QEMU 에뮬레이터로
넘기고, QEMU가 arm64 명령어를 amd64 호스트 CPU가 이해할 수 있는 명령어로 변환해 실행합니다. 이 방식의
장점은 별도의 arm64 하드웨어 없이도 어떤 아키텍처든 빌드할 수 있다는 점이고, 단점은 명령어 단위 변환에
따른 오버헤드로 네이티브 빌드 대비 컴파일 시간이 수 배로 늘어날 수 있다는 점입니다. `docker run
--privileged --rm tonistiigi/binfmt --install all` 같은 명령으로 QEMU 에뮬레이터를 등록하는 과정을
거치며, Docker Desktop은 이 등록을 기본적으로 자동화해 둡니다.

### 실행 방식 2: 네이티브 멀티노드 빌더

에뮬레이션 오버헤드를 피하려면, 각 아키텍처에 맞는 실제 하드웨어(또는 네이티브 VM)를 노드로 묶어
하나의 buildx 빌더로 구성하는 방법이 있습니다.

```bash
docker buildx create --name multiarch-builder --platform linux/amd64 \
    --node amd64-node ssh://ci-amd64-host
docker buildx create --name multiarch-builder --append --platform linux/arm64 \
    --node arm64-node ssh://ci-arm64-host
docker buildx use multiarch-builder
```

이렇게 구성한 빌더는 `--platform` 인자로 요청받은 각 아키텍처의 빌드 작업을 해당 아키텍처를 네이티브로
지원하는 노드에 그대로 위임합니다. BuildKit 데몬 자체가 각 노드에서 실행되고, buildx 클라이언트는
이 여러 BuildKit 인스턴스에 작업을 분배한 뒤 결과를 취합하는 오케스트레이터 역할을 합니다. CI 환경에서
arm64 빌드가 자주 발생한다면, 에뮬레이션보다 네이티브 arm64 러너를 빌더 노드로 추가하는 편이 빌드
시간 측면에서 훨씬 유리합니다.

### 매니페스트 리스트와 OCI 이미지 인덱스

QEMU든 네이티브 노드든, 아키텍처별로 빌드된 이미지는 각각 별도의 콘텐츠 주소(digest)를 갖는 독립된
이미지입니다. 이 여러 이미지를 사용자 입장에서 하나의 태그(`myorg/app:1.0`)로 pull받을 수 있게
묶어주는 것이 **매니페스트 리스트**(Docker 이미지 스펙 용어) 또는 **OCI 이미지 인덱스**(OCI 이미지
스펙 용어)입니다. 두 용어는 사실상 같은 개념을 가리키며, 레지스트리에 푸시된 결과물의 구조는 다음과
같은 계층을 가집니다.

```text
myorg/app:1.0  (index/manifest list, 태그가 직접 가리키는 대상)
├── linux/amd64  → image manifest → config + layers
├── linux/arm64  → image manifest → config + layers
└── linux/arm/v7 → image manifest → config + layers
```

클라이언트(예: 다른 서버의 `docker pull`, 쿠버네티스 노드의 kubelet)가 `myorg/app:1.0`을 요청하면,
레지스트리는 먼저 이 인덱스를 반환합니다. 클라이언트는 자신의 OS/아키텍처 정보를 인덱스 안의 플랫폼
목록과 대조해, 자신에게 맞는 이미지 매니페스트의 digest만 선택적으로 골라 그 이미지의 레이어만
내려받습니다. 즉 "멀티플랫폼 이미지"라는 것은 이미지 한 장이 여러 아키텍처를 담고 있는 게 아니라,
아키텍처별로 완전히 분리된 이미지들을 가리키는 색인 하나가 태그에 연결되어 있고, 실제로 어떤 것을
받을지는 pull 시점에 클라이언트 플랫폼에 따라 결정되는 구조입니다. `docker buildx imagetools inspect
myorg/app:1.0` 명령으로 이 인덱스 구조를 직접 확인할 수 있습니다.

```bash
$ docker buildx imagetools inspect myorg/app:1.0
Name:      docker.io/myorg/app:1.0
MediaType: application/vnd.oci.image.index.v1+json
Digest:    sha256:1a2b3c...

Manifests:
  Name:      docker.io/myorg/app:1.0@sha256:aaa...
  Platform:  linux/amd64

  Name:      docker.io/myorg/app:1.0@sha256:bbb...
  Platform:  linux/arm64
```

`docker buildx build --platform ... --push`는 이 과정, 즉 각 플랫폼별 이미지 빌드부터 인덱스 조립,
레지스트리 푸시까지를 한 번에 처리해 줍니다. 반대로 `--load`는 로컬 Docker 데몬으로 결과를 가져오는
옵션인데, 로컬 데몬은 단일 아키텍처 이미지만 로드할 수 있으므로 `--load`와 `--platform`에 여러 값을
동시에 지정하면 오류가 발생합니다. 멀티플랫폼 결과물은 반드시 레지스트리를 거쳐야 인덱스로 조립될 수
있다는 점은 실무에서 자주 혼동하는 부분이니 기억해 둘 필요가 있습니다.

## Dockerfile 린팅과 모범 사례의 변화

BuildKit 이전 시대의 Dockerfile 모범 사례 중 상당수는 여전히 유효하지만, 일부는 BuildKit의 캐시
구조 덕분에 우선순위가 낮아졌습니다.

**레이어 수를 줄이는 것이 예전만큼 절대적이지 않습니다.** 레거시 빌더 시절에는 `RUN` 인스트럭션 하나마다
디스크에 레이어가 쓰였기 때문에, `apt-get update && apt-get install && rm -rf ...`처럼 여러 명령을
`&&`로 묶어 레이어 수 자체를 최소화하는 것이 이미지 크기와 빌드 속도에 직접적인 영향을 줬습니다.
BuildKit에서도 레이어가 쓸데없이 많아지면 여전히 이미지 크기에는 영향을 주지만, 캐시 마운트로 패키지
매니저의 다운로드 비용 자체를 제거할 수 있고, `COPY --link`로 레이어 간 의존성을 끊어 재빌드 범위를
좁힐 수 있기 때문에 "레이어를 몇 개로 쪼갤 것인가"보다 "무엇을 캐시 가능하게 만들 것인가"가 더 중요한
질문이 됐습니다. 즉 레이어를 합치기 위해 가독성을 희생하는 관행은 예전보다 덜 강조해도 됩니다.

**`.dockerignore`는 여전히 필수입니다.** 빌드 컨텍스트 전송은 BuildKit에서도 사라지지 않는 단계이며,
`.git`, `node_modules`, 로컬 빌드 산출물 등을 컨텍스트에서 제외하지 않으면 매 빌드마다 불필요한 데이터
전송과 컨텍스트 해시 재계산이 발생합니다.

```text
.git
node_modules
dist
*.log
.env
```

**멀티스테이지로 빌드 의존성과 런타임 이미지를 분리하는 패턴**은 여전히 가장 중요한 모범 사례입니다.
컴파일러, 헤더 파일, 테스트 프레임워크 같은 빌드 타임 의존성이 런타임 이미지에 남으면 공격 표면이
넓어지고 이미지 크기도 커집니다. 위에서 본 Node.js 예시나 Go 정적 바이너리를 distroless 이미지에
올리는 패턴처럼, "무엇으로 빌드했는가"와 "무엇을 실행하는가"를 서로 다른 스테이지로 분리하고 최종
스테이지에는 실행에 필요한 최소한만 남기는 원칙은 BuildKit 시대에도 그대로 유지됩니다.

다음 장에서는 Dockerfile 한 장 단위를 넘어, 여러 서비스의 빌드·실행을 함께 정의하는 Compose v2와
그 뒤를 받치는 Moby 오픈소스 생태계 전체의 구조를 살펴봅니다.

## 핵심 요약

- Dockerfile 문법은 BuildKit 프론트엔드 이미지로 분리되어 있으며, 첫 줄의 `# syntax=docker/dockerfile:1`
  지시자로 어떤 프론트엔드를 쓸지 지정한다. `docker/dockerfile:1`은 1.x 최신 stable을 자동으로 따라가는
  롤링 태그이고, 재현성이 중요하면 `1.7.1`처럼 완전히 고정된 버전을 쓴다.
- heredoc(`RUN <<EOF`, `COPY <<EOF`)은 여러 줄 스크립트를 이스케이프 없이 작성하게 해주는 문법적
  개선이며, LLB 그래프 구조 자체를 바꾸지는 않는다.
- `RUN --mount`는 `type=bind`(기본, 컨텍스트/스테이지 파일 참조), `type=cache`(영속 빌드 캐시),
  `type=secret`(자격 증명을 레이어에 남기지 않고 전달), `type=ssh`(SSH 에이전트 전달) 네 가지 타입을
  지원하며, 모두 "빌드에는 필요하지만 결과 이미지에는 남지 않아야 하는 것"을 다루기 위한 장치다.
- `COPY --link`는 레이어를 이전 레이어 체인과 독립적으로 생성해, 베이스 이미지 리베이스 시 재빌드
  범위를 줄이고 병렬 처리를 가능하게 한다.
- `ARG`는 `FROM` 이전에 선언하면 전역(베이스 이미지 태그 용도)이고, `FROM` 이후 스테이지 내부에서
  선언하면 해당 스테이지에만 유효하다. 이후 스테이지에서 다시 쓰려면 재선언이 필요하다.
- 멀티플랫폼 빌드는 QEMU 유저모드 에뮬레이션(단일 노드, 느림)과 네이티브 멀티노드 빌더(여러 노드,
  빠름) 두 방식으로 실행되며, 결과는 매니페스트 리스트/OCI 이미지 인덱스로 묶여 하나의 태그 아래
  여러 아키텍처 이미지를 색인한다. pull 시 클라이언트 플랫폼에 맞는 이미지만 선택적으로 받아온다.
- BuildKit 시대에는 레이어 수 최소화보다 "무엇을 캐시 가능하게 만들 것인가"가 더 중요해졌지만,
  `.dockerignore`와 멀티스테이지로 빌드/런타임 의존성을 분리하는 원칙은 여전히 유효하다.

## 실습

**1. syntax 지시자와 heredoc, 캐시 마운트 확인**

다음 Dockerfile을 작성하고 빌드해, 캐시 마운트가 재빌드 시간에 미치는 영향을 직접 비교해 봅니다.

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.12-slim
WORKDIR /app
RUN <<EOF
pip install --no-cache-dir --upgrade pip
EOF
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
COPY . .
```

```bash
time docker build -t cache-demo .
# requirements.txt 내용을 바꾸지 않고 소스 파일만 수정한 뒤 재빌드
time docker build -t cache-demo .
```

두 번째 빌드에서 `pip install` 스텝이 캐시 마운트 덕분에 패키지를 다시 내려받지 않고 완료되는지
빌드 로그(`CACHED` 표시 또는 짧아진 소요 시간)로 확인합니다.

**2. 멀티플랫폼 빌드와 이미지 인덱스 직접 확인**

```bash
docker buildx create --name mpdemo --use
docker buildx inspect --bootstrap

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t <레지스트리계정>/mp-demo:1.0 \
  --push .

docker buildx imagetools inspect <레지스트리계정>/mp-demo:1.0
```

`imagetools inspect` 출력에서 `MediaType`이 `application/vnd.oci.image.index.v1+json`(또는
Docker 매니페스트 리스트 타입)으로 나오는지, 그 아래 `linux/amd64`와 `linux/arm64` 두 플랫폼이
각각 별도의 digest로 나열되는지 확인합니다. 이어서 amd64 머신과 arm64 머신(또는 `--platform`
플래그로 에뮬레이션한 `docker run --platform linux/arm64 <레지스트리계정>/mp-demo:1.0`) 각각에서
같은 태그를 pull해, 서로 다른 digest의 이미지가 내려받아지는지 `docker image inspect --format
'{{.Id}}'`로 비교해 봅니다.
