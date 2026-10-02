---
title: "15장. 빌드 — BuildKit과 Dockerfile의 핵심"
parent: "2부. 컨테이너 커널 기능과 Docker"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 15
---

# 15장. 빌드 — BuildKit과 Dockerfile의 핵심

> **🎮 게임 서버 개발자에게** — C++ 프로젝트를 빌드해 본 사람이라면 이 장의 구조가 낯설지 않다. 의존 관계 그래프(Makefile/Ninja)를 만들고, 독립된 작업은 병렬로 돌리고, 바뀌지 않은 단계는 캐시(ccache)로 건너뛰고, 컴파일러 도구 체인은 배포물에 넣지 않는다. BuildKit은 이 일을 이미지 빌드에 적용한 엔진이고, Dockerfile은 그 위의 입력 문법일 뿐이다. 이 장은 **이미지를 만드는 엔진이 어떻게 생겼는지**와 **빌드가 빠르고 안전하려면 Dockerfile을 어떻게 써야 하는지**의 핵심만 다룬다. 한 줄 한 줄 문법 사전이 아니다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 서버 코드를 한 줄 고쳤을 뿐인데 CI에서 이미지 빌드가 매번 의존성 설치부터 다시 돌아 10분씩 걸린다.
> - 프라이빗 저장소 토큰이나 `.npmrc` 같은 비밀값을 빌드 중에 써야 하는데, 이미지 히스토리에 남을까 걱정된다.
> - 개발 PC(amd64)에서 빌드한 이미지를 arm64 서버에 배포해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** BuildKit은 Dockerfile을 프론트엔드가 LLB(콘텐츠 주소 기반 DAG)로 바꾸고 솔버가 병렬·캐시 판단으로 실행하는 빌드 엔진이므로, 빌드 속도는 "자주 바뀌는 것을 아래에, 안 바뀌는 것을 위에" 두는 순서와 캐시 마운트에서, 안전은 secret 마운트와 멀티스테이지에서 나온다.

1. **BuildKit = 프론트엔드 → LLB → 솔버 → 익스포터** — 순차 실행·거친 캐시·경직된 모델이라는 레거시 빌더의 한계를 DAG와 콘텐츠 해시로 푼다.
2. **Dockerfile 문법도 프론트엔드 이미지** — 첫 줄 `# syntax=docker/dockerfile:1`이 해석기 버전을 정한다. 신규 프로젝트는 습관적으로 넣는다.
3. **캐시는 순서와 마운트로 만든다** — 의존성 설치 레이어를 소스 복사 앞에 두고, `RUN --mount=type=cache`로 패키지 다운로드를 재사용하며, 비밀값은 `--mount=type=secret`으로 레이어에 남기지 않는다.
4. **멀티스테이지와 멀티플랫폼** — 빌드 도구는 중간 스테이지에 두고 최종 이미지에는 산출물만 복사한다. 멀티플랫폼 이미지는 아키텍처별 이미지를 가리키는 인덱스 하나로 묶인다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| Makefile/Ninja의 의존 그래프와 병렬 빌드 | LLB(DAG)와 솔버 | 의존 없는 작업은 병렬로, 이미 된 것은 건너뛴다 | Make는 타임스탬프를 보지만 LLB 노드는 **입력으로 계산한 콘텐츠 해시**로 식별한다 |
| ccache/컴파일 캐시 디렉터리 유지 | `RUN --mount=type=cache` | 빌드 사이에 유지되는 캐시 디렉터리를 재사용 | 캐시 마운트는 이미지 레이어에 **커밋되지 않고** 별도 저장소에 남는다. 레이어 캐시와는 다른 층이다 |
| 빌드 서버에서 컴파일 후 바이너리만 배포 | 멀티스테이지 빌드 | 컴파일러/헤더는 배포물에 넣지 않는다 | 스테이지 간 복사는 `COPY --from=<스테이지>`로 명시해야 한다 |
| 크로스 컴파일로 다른 CPU용 바이너리 생성 | 멀티플랫폼 빌드(QEMU 또는 네이티브 노드) | 하나의 소스로 여러 타깃 | QEMU 방식은 CPU 명령어를 **에뮬레이션**해 빌드가 수 배 느려질 수 있다. 결과물은 아키텍처별 이미지를 가리키는 인덱스다 |
| 설정 파일에 API 키를 넣지 않고 환경에서 주입 | `--mount=type=secret` | 비밀을 산출물에 굽지 않는다 | `ARG`/`ENV`로 넘기면 값이 이미지 히스토리에 그대로 남는다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Dockerfile 위쪽의 `COPY` 한 줄이 바뀌면 그 아래 무거운 `RUN`까지 다시 도는 이유는 무엇일까?
> 2. 빌드 중에 쓴 비밀 토큰이 이미지에 남지 않게 하려면?
> 3. 빌드 도구(컴파일러)가 최종 이미지에 남지 않게 하려면?
> 4. amd64에서 만든 이미지를 arm64 서버가 `docker pull` 하면 어떤 일이 일어날까?
>
> **처리법:** 🛠 실습 `docker buildx build`를 두 번 연속 실행해 `CACHED` 확인, `docker buildx imagetools inspect <이미지>` → 바로 실행 · 🗺 관계도 Dockerfile → 프론트엔드 → LLB(DAG) → 솔버 → 익스포터, 인덱스 → 플랫폼별 매니페스트 · 📦 카드로 `RUN --mount` 4종(bind/cache/secret/ssh), 캐시 백엔드(registry/gha/s3/local/inline)

### 이 장에서 배우는 것

- 레거시 빌더의 한계와 BuildKit의 네 단계 구조
- `# syntax=` 지시자가 하는 일과 버전 지정 규칙
- 캐시를 살리는 Dockerfile 작성 순서, 캐시 마운트, secret 마운트, 외부 캐시
- 멀티스테이지·`.dockerignore`·멀티플랫폼 빌드와 buildx의 정체

---

## 코어 1. BuildKit = 프론트엔드 → LLB → 솔버 → 익스포터

### 1.1 레거시 빌더의 세 가지 한계

**한 줄 요약:** 순차 실행, 거친 캐시 무효화, 경직된 빌드 모델이 BuildKit을 낳았다.

레거시 빌더는 Dockerfile을 위에서부터 한 줄씩 실행하며 명령마다 새 레이어를 커밋했다. 단순해서 이해하기 쉬웠지만 세 가지가 문제였다.

- **순차 실행:** 서로 의존하지 않는 두 `RUN`이 있어도 병렬화할 수 없었다. 데이터 의존성이 아니라 파일에 적힌 순서대로 실행했기 때문이다.
- **거친 캐시 무효화:** "이 명령과 그 이전 레이어가 이전 빌드와 정확히 같으면 재사용"이라는 규칙이라, 초반 `COPY` 한 줄이 바뀌면 그 아래 모든 캐시가 무효화되어 상관없는 `RUN apt-get install`까지 다시 돌았다.
- **경직된 모델:** 원격 캐시 내보내기, 멀티플랫폼 동시 빌드, 비밀값을 레이어에 남기지 않는 주입 같은 요구를 풀기 어려웠다.

BuildKit은 이 셋을 해결하려 처음부터 다시 설계한 엔진이다. Docker Engine 18.09부터 옵트인으로 제공되다가 기본 빌더가 되었고, `DOCKER_BUILDKIT=0` 같은 우회로는 호환성 잔재로 보면 된다.

### 1.2 네 단계 구조

**한 줄 요약:** 프론트엔드가 LLB(DAG)를 만들고, 솔버가 병렬·캐시 판단으로 실행하고, 익스포터가 결과를 내보낸다.

```
Dockerfile (또는 다른 빌드 정의)
        │
        ▼
   프론트엔드 (Frontend)       ← Dockerfile을 파싱해서 LLB로 변환
        │
        ▼
     LLB (Low-Level Build)     ← 빌드 단계를 표현하는 DAG (콘텐츠 주소 기반)
        │
        ▼
      솔버 (Solver)            ← DAG를 분석해 실행 순서를 최적화·병렬화, 캐시와 대조
        │
        ▼
     익스포터 (Exporter)       ← 이미지, OCI tar, 로컬 파일 등으로 출력
```

- **프론트엔드:** 빌드 정의를 BuildKit이 이해하는 중간 표현으로 바꾼다. BuildKit 본체에 하드코딩된 것이 아니라 별도 컨테이너 이미지로 배포되는 플러그형 구성 요소다.
- **LLB:** 연산을 노드로, 의존 관계를 엣지로 하는 DAG다. 각 노드는 자기 입력(부모 출력, 파일, 명령어 문자열 등)으로 계산한 해시로 식별되므로 같은 입력의 노드는 어느 빌드에서든 같은 것으로 취급되고, 이것이 정교한 캐시 재사용의 기반이다.
- **솔버:** 의존 없는 노드를 동시에 실행하고, 같은 해시의 결과가 이미 있으면 그 노드를 건너뛴다. 최종 이미지에 반영되지 않는 중간 스테이지 산출물은 아예 계산을 생략하기도 한다.
- **익스포터:** 결과를 이미지(로컬 스토어 적재나 레지스트리 푸시), OCI 레이아웃 tar, 파일 트리 등으로 내보낸다. 여러 형식 동시 출력도 가능하다.

이 분리 덕분에 프론트엔드나 익스포터를 바꿔도 캐시·병렬 실행 같은 엔진의 이점은 그대로다. 콘텐츠 주소화라는 발상은 이미지 레이어 저장에도 똑같이 쓰인다([11장](11-이미지-레이어-overlayfs.md)).

### 1.3 buildx와 빌더 인스턴스

**한 줄 요약:** `docker buildx`는 BuildKit 데몬을 구동·관리하는 CLI 플러그인이고, 빌더는 실제로 어딘가에 떠 있는 BuildKit 데몬이다.

Docker Engine 23.0 이후 `docker build`는 내부적으로 buildx를 호출하므로 평소의 `docker build`도 BuildKit 경로를 탄다. 빌더 인스턴스는 추상 설정값이 아니라 실제 BuildKit 데몬을 가리킨다.

```bash
docker buildx create --name mybuilder --driver docker-container --use
docker buildx inspect --bootstrap
docker ps --filter "name=buildx_buildkit_mybuilder"    # BuildKit이 뜬 컨테이너가 보인다
```

`docker-container` 드라이버는 로컬 Docker 위에 BuildKit 컨테이너를 띄우고, `kubernetes` 드라이버는 BuildKit 파드를 클러스터에 띄우며, `remote` 드라이버는 이미 운영 중인 BuildKit 데몬에 연결만 한다. 즉 "빌더를 만든다"는 것은 BuildKit 데몬을 프로비저닝하거나 연결 정보를 등록하는 일이다.

## 코어 2. Dockerfile 문법도 프론트엔드 이미지

### 2.1 `# syntax=` 지시자

**한 줄 요약:** 첫 줄의 `# syntax=docker/dockerfile:1`이 이 Dockerfile을 해석할 프론트엔드 이미지(버전)를 정한다.

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.20
RUN echo "hello"
```

주석처럼 보이지만 BuildKit이 특별히 해석한다. 이 줄이 있으면 BuildKit은 지정한 이미지를 pull해 컨테이너 샌드박스에서 실행하고, 그 프론트엔드가 Dockerfile을 분석해 LLB를 만든다. 없으면 dockerd에 내장된 기본 파서를 쓰는데, 이는 Docker Engine 릴리스 주기에 묶여 있어 heredoc, 최신 `--mount` 옵션, `COPY --link` 같은 최신 문법을 곧바로 쓰지 못할 수 있다. 즉 Dockerfile 문법이 Docker Engine 버전에서 분리되어 독립 배포된다.

| 지시자 | 의미 |
|---|---|
| `docker/dockerfile:1` | 1.x의 모든 마이너·패치 릴리스를 자동으로 따라감(권장 기본값, 롤링 태그) |
| `docker/dockerfile:1.7` | 1.7 마이너에 고정, 패치 릴리스까지만 반영 |
| `docker/dockerfile:1.7.1` | 완전히 고정된 버전. 빌드 재현성이 극도로 중요할 때 |

`docker/dockerfile:1-labs`처럼 `-labs` 채널은 정식보다 먼저 신규 문법을 주는 대신 마이너 버전 사이에도 호환이 깨질 수 있다. 그리고 Dockerfile은 BuildKit이 지원하는 여러 프론트엔드 중 가장 널리 쓰이는 하나일 뿐, BuildKit 자체와 같은 개념이 아니다.

## 코어 3. 캐시는 순서와 마운트로 만든다

### 3.1 레이어 캐시와 Dockerfile 순서

**한 줄 요약:** 같은 입력으로 계산된 적 있는 노드는 다시 실행하지 않으므로, 잘 안 바뀌는 것을 위에 두어야 효과가 난다.

BuildKit의 캐시는 LLB의 콘텐츠 주소 위에서 동작해, 같은 입력(부모 레이어, 사용된 파일 내용, 명령어 문자열, 빌드 인자)이면 재사용한다. 별다른 설정 없이도 기본 동작하므로 **Dockerfile을 캐시 친화적으로, 즉 자주 바뀌는 내용을 아래쪽에 쓰는 것**만으로 상당한 효과를 얻는다. 의존성 목록(`package.json` 등)만 먼저 복사해 설치하고, 그 뒤에 소스를 복사하는 순서가 전형이다(4.1의 예 참고).

### 3.2 `RUN --mount` 네 가지

**한 줄 요약:** 모두 "빌드에는 필요하지만 결과 이미지에는 남지 않아야 하는 것"을 다루는 장치다.

`RUN --mount`는 빌드 컨테이너가 실행되는 동안에만 무언가를 마운트하고 결과 레이어에는 반영하지 않는다.

| 타입 | 용도 |
|---|---|
| `type=bind`(기본) | 빌드 컨텍스트나 다른 스테이지의 파일을 읽기 전용으로 참조. 이미지 레이어로 복사하지 않음 |
| `type=cache` | 빌드 간에 유지되는 영속 캐시 디렉터리(패키지 매니저 캐시, 컴파일러 중간 산출물) |
| `type=secret` | 자격 증명·토큰을 파일/환경 변수로 해당 스텝에만 노출, 레이어에 남지 않음 |
| `type=ssh` | 호스트 SSH 에이전트 소켓을 전달해 개인키를 이미지에 굽지 않고 인증 |

```dockerfile
# 캐시 마운트: npm 다운로드 캐시를 빌드 간 재사용
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# secret 마운트: 호스트에서 docker build --secret id=npmrc,src=$HOME/.npmrc 로 전달
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

캐시 마운트는 이미지 레이어로 커밋되지 않고 별도 저장소에 남는다. `id`로 캐시를 이름 붙여 공유하고, `sharing=locked`로 동시 접근을 직렬화할 수 있다(`apt`처럼 동시 쓰기에 취약한 도구에 중요). 이때 레이어 캐시가 무효화되어 `npm ci`가 다시 실행되더라도 다운로드 캐시는 유지되어 네트워크 비용이 준다. 반면 `type=secret`은 예전에 `ARG`/`ENV`로 비밀을 넘기면 이미지 히스토리에 그대로 남던 문제를 근본적으로 해결한다.

> **[보충]** 이 책의 다른 장([30장](../3부-쿠버네티스-구성-요소/30-설정-보안.md))은 쿠버네티스 Secret을 다룬다. 빌드 시점의 secret 마운트와 런타임의 Secret은 서로 다른 메커니즘이다. 이 장의 secret은 이미지를 만들 때만 존재한다.

### 3.3 외부 캐시와 `.dockerignore`

**한 줄 요약:** 로컬 캐시는 빌드한 머신에만 있으므로 CI에서는 `--cache-to`/`--cache-from`으로 내보내고, 불필요한 컨텍스트는 `.dockerignore`로 막는다.

CI 러너가 매번 새 머신이면 로컬 캐시 이점이 거의 없다. 이를 위해 캐시를 외부 백엔드에 내보내고 불러온다.

```bash
docker buildx build \
  --cache-to type=registry,ref=myregistry.example.com/myapp:buildcache,mode=max \
  --cache-from type=registry,ref=myregistry.example.com/myapp:buildcache \
  -t myregistry.example.com/myapp:latest \
  --push .
```

- 백엔드: `registry`(캐시를 별도 이미지로 레지스트리에 저장해 공유), `gha`(GitHub Actions 캐시), `s3`/`azblob`(오브젝트 스토리지), `local`(파일시스템 경로), `inline`(결과 이미지에 캐시 메타데이터를 함께 인코딩).
- `mode=min`(기본)은 최종 이미지에 반영되는 레이어 위주로만, `mode=max`는 멀티스테이지의 중간 스테이지까지 모두 내보내 적중률을 높이는 대신 저장 공간과 전송 비용이 늘어난다.
- `--cache-from`은 여러 개 지정할 수 있어 작업 브랜치와 `main`의 캐시를 함께 참조하는 패턴이 흔하다.

`.dockerignore`는 BuildKit에서도 필수다. 빌드 컨텍스트 전송은 사라지지 않는 단계라서 `.git`, `node_modules`, 로컬 산출물, `.env`를 제외하지 않으면 매 빌드마다 불필요한 전송과 컨텍스트 해시 재계산이 생긴다.

```text
.git
node_modules
dist
*.log
.env
```

레이어 수를 줄이려 `&&`로 이어 붙이는 관행은 예전만큼 절대적이지 않다. 캐시 마운트와 `COPY --link`로 "무엇을 캐시 가능하게 만들 것인가"가 더 중요한 질문이 되었다. 다만 한 `RUN`에서 설치와 정리를 같이 해야 이미지 크기가 줄어드는 이유는 [11장](11-이미지-레이어-overlayfs.md)의 whiteout과 [17장](17-컨테이너를-손으로-만들기.md)에서 확인한다.

## 코어 4. 멀티스테이지와 멀티플랫폼

### 4.1 멀티스테이지 빌드

**한 줄 요약:** 빌드 의존성과 런타임 이미지를 스테이지로 분리하고 최종 스테이지에는 산출물만 복사한다.

컴파일러, 헤더, 테스트 프레임워크가 런타임 이미지에 남으면 공격 표면이 넓어지고 이미지도 커진다. 아래는 의존성 레이어를 소스 변경과 분리하고 캐시 마운트를 곁들인 패턴이다.

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

소스만 바뀌었다면 `deps`는 캐시에서 재사용되고 `npm ci`는 다시 실행되지 않는다. 런타임 스테이지는 빌드 도구가 없는 슬림 이미지를 베이스로 하고 필요한 산출물만 `COPY --from=`으로 가져온다. `COPY --link`는 해당 `COPY`를 이전 레이어 체인과 독립적으로 만든 뒤 마지막에 연결하므로, 베이스 이미지가 보안 패치로 바뀌어도 애플리케이션 레이어를 다시 만들지 않고 새 베이스 위에 재사용하고 병렬 처리도 가능하다(대상 경로의 심볼릭 링크를 따라가지 않는 제약이 있다).

두 가지만 더 기억한다. `RUN <<EOF ... EOF` heredoc은 여러 줄 스크립트를 이스케이프 없이 쓰게 해 주는 문법 편의이고, LLB 구조는 바꾸지 않는다(한 `RUN`은 여전히 한 스텝, 한 캐시 키). `ARG`는 첫 `FROM` 앞에 선언하면 `FROM` 줄에서만 쓰는 전역 스코프이고, `FROM` 이후 스테이지 안에서 선언하면 그 스테이지에서만 유효하므로 다른 스테이지에서 쓰려면 다시 선언해야 한다.

### 4.2 멀티플랫폼 빌드와 이미지 인덱스

**한 줄 요약:** 아키텍처별로 완전히 분리된 이미지들을 가리키는 인덱스 하나가 태그에 붙고, pull 시 클라이언트 플랫폼에 맞는 것만 받는다.

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t myorg/app:1.0 --push .
```

실행 방식은 두 가지다.

- **QEMU 유저모드 에뮬레이션:** `binfmt_misc` 커널 메커니즘이 다른 아키텍처 바이너리 실행을 가로채 QEMU로 넘긴다. arm64 하드웨어 없이도 빌드되지만 명령어 변환 오버헤드로 네이티브보다 수 배 느릴 수 있다. `docker run --privileged --rm tonistiigi/binfmt --install all`로 등록하며 Docker Desktop은 기본적으로 자동화한다.
- **네이티브 멀티노드 빌더:** 아키텍처별 실제 하드웨어(또는 VM)를 노드로 묶는다(`docker buildx create --append --platform ...`). 각 플랫폼 빌드를 해당 네이티브 노드에 위임하므로 빠르다.

결과는 매니페스트 리스트(Docker 용어) 또는 OCI 이미지 인덱스(OCI 용어)로 묶인다.

```text
myorg/app:1.0  (index / manifest list, 태그가 직접 가리키는 대상)
├── linux/amd64  → image manifest → config + layers
├── linux/arm64  → image manifest → config + layers
└── linux/arm/v7 → image manifest → config + layers
```

클라이언트(다른 서버의 `docker pull`, 쿠버네티스 노드의 kubelet)는 인덱스를 받아 자신의 OS/아키텍처와 대조해 맞는 매니페스트의 레이어만 내려받는다. 확인은 `docker buildx imagetools inspect myorg/app:1.0`이다. 주의할 점: `--load`(로컬 데몬으로 가져오기)는 단일 아키텍처 이미지만 받을 수 있어서 `--platform`에 여러 값을 주면 오류가 난다. 멀티플랫폼 결과는 레지스트리(`--push`)를 거쳐야 인덱스로 조립된다. 인덱스와 매니페스트 구조의 표준은 [12장](12-OCI-표준과-런타임.md)의 OCI Image Spec이다.

## 실무 적용

### 체크리스트

- [ ] Dockerfile 첫 줄에 `# syntax=docker/dockerfile:1`을 넣었는가? (빌드 재현성이 핵심이면 `1.7.1`처럼 고정)
- [ ] 의존성 매니페스트만 먼저 `COPY`해 설치 레이어를 만들고, 소스 `COPY`는 그 뒤에 두었는가?
- [ ] 패키지 매니저 캐시(npm, pip, go build, apt)를 `RUN --mount=type=cache`로 빼고, `apt`처럼 동시 쓰기에 약한 것은 `sharing=locked`를 검토했는가?
- [ ] 비밀값은 `ARG`/`ENV`가 아니라 `--mount=type=secret`(또는 `type=ssh`)으로 넘겼는가?
- [ ] 멀티스테이지로 빌드 도구와 런타임을 분리하고, 최종 스테이지에 산출물만 복사했는가?
- [ ] `.dockerignore`로 `.git`, `node_modules`, 로컬 산출물, `.env`를 제외했는가?
- [ ] 러너가 매번 새 머신인 CI라면 `--cache-to`/`--cache-from`(registry, gha, s3 등)을 설정했는가?
- [ ] 멀티플랫폼은 QEMU(느림)와 네이티브 노드(빠름) 중 선택하고, 결과를 `--push`로 올려 `imagetools inspect`로 확인하는가?

### 시나리오로 확인하기

1. **상황:** 게임 서버 소스를 한 줄 고쳤는데 CI에서 이미지 빌드가 의존성 설치부터 다시 돌고 매번 10분이 걸린다. Dockerfile은 `COPY . .` 다음에 `RUN npm ci`가 있다.
   **질문:** 원인과 개선은?

   <details markdown="1"><summary>답 확인</summary>

   `COPY . .`가 소스 변경으로 달라지면 입력이 바뀌어 그 아래 모든 노드의 캐시가 무효화된다. 의존성 매니페스트(`package.json`, `package-lock.json`)만 먼저 복사해 설치하고 그 뒤에 소스를 복사하도록 순서를 바꾼다. 여기에 `RUN --mount=type=cache,target=/root/.npm`을 더하면 설치 레이어가 무효화되어도 다운로드 캐시는 유지된다. CI 러너가 매번 새 머신이면 `--cache-to`/`--cache-from`으로 캐시를 외부(registry 등)에 보관한다. → 코어 3

   </details>

2. **상황:** 빌드 중 프라이빗 패키지 저장소 인증이 필요해서 토큰을 `ARG`로 넘겼는데, 나중에 `docker history`에 값이 보인다.
   **질문:** 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   `ARG`/`ENV`로 넘긴 값은 이미지 히스토리에 남는다. `docker build --secret id=npmrc,src=$HOME/.npmrc`로 전달하고 `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc`로 해당 스텝 실행 중에만 파일을 노출하면 레이어 diff에 남지 않는다. Git over SSH라면 `--mount=type=ssh`로 SSH 에이전트를 전달한다. → 코어 3

   </details>

3. **상황:** 서버 이미지가 1GB를 넘는다. 빌드에 쓴 컴파일러와 헤더가 그대로 들어 있다.
   **질문:** 구조를 어떻게 바꾸나?

   <details markdown="1"><summary>답 확인</summary>

   멀티스테이지로 나눈다. 빌드 스테이지에서 컴파일하고, 최종 스테이지는 빌드 도구가 없는 슬림 베이스에서 시작해 `COPY --from=build`로 실행 파일 등 산출물만 가져온다. 컴파일러·헤더·캐시가 최종 이미지에 남지 않아 크기와 공격 표면이 줄어든다. → 코어 4

   </details>

4. **상황:** amd64 CI에서 `docker buildx build --platform linux/amd64,linux/arm64 --load .`를 실행했더니 오류가 난다.
   **질문:** 왜이고 어떻게 하나?

   <details markdown="1"><summary>답 확인</summary>

   `--load`는 로컬 Docker 데몬으로 결과를 가져오는 옵션인데 로컬 데몬은 단일 아키텍처 이미지만 로드할 수 있어 여러 플랫폼과 함께 쓰면 오류가 난다. `--push`로 레지스트리에 올려 인덱스로 조립하고 `docker buildx imagetools inspect`로 확인한다. arm64 빌드가 잦다면 QEMU 에뮬레이션(느림) 대신 네이티브 arm64 노드를 멀티노드 빌더에 추가하는 편이 빠르다. → 코어 4

   </details>

📖 출처: docker-fundamental/08_BuildKit_아키텍처.md, docker-fundamental/09_Dockerfile의_진화와_멀티플랫폼_빌드.md

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 레거시 빌더 한계 3: ____ 실행 / 거친 캐시 ____ / 경직된 모델
         BuildKit: ( ? ) → ( ? ) (콘텐츠 주소 DAG) → ( ? ) → ( ? )
         buildx = BuildKit ____ 을 구동·관리하는 CLI 플러그인

[코어 2] 첫 줄: # syntax=docker/dockerfile:____   (롤링 / 마이너 고정 / 패치 고정)

[코어 3] 순서: ____ 은 위, ____ 은 아래
         RUN --mount= bind / ____ / ____ / ssh
         캐시 내보내기: --cache-____ / --cache-____ , mode = min | ____

[코어 4] 멀티스테이지: COPY --____ = 산출물만.  멀티플랫폼: 에뮬레이션(____) vs 네이티브 노드
         결과 = ____ (이미지 인덱스) → 플랫폼별 매니페스트.  --load + 멀티 플랫폼 = ____
```

### 2. 인출 질문

1. 레거시 빌더의 한계 세 가지는?

   <details markdown="1"><summary>답 확인</summary>

   (1) 순차 실행: 의존 관계가 없어도 파일 순서대로만 실행해 병렬화 불가. (2) 거친 캐시 무효화: 앞쪽 `COPY` 하나가 바뀌면 아래 모든 캐시가 무효화. (3) 경직된 빌드 모델: 원격 캐시 내보내기, 멀티플랫폼 동시 빌드, 비밀값 안전 주입이 어려움. → 코어 1

   </details>

2. BuildKit의 네 단계와 각각의 역할은?

   <details markdown="1"><summary>답 확인</summary>

   프론트엔드(Dockerfile을 LLB로 변환), LLB(콘텐츠 주소 기반 DAG), 솔버(DAG 분석으로 병렬화하고 캐시와 대조해 건너뜀), 익스포터(이미지, OCI tar, 로컬 파일 등으로 출력). 프론트엔드/익스포터를 바꿔도 엔진의 이점은 유지된다. → 코어 1

   </details>

3. `# syntax=docker/dockerfile:1`은 무엇을 하며, `1`, `1.7`, `1.7.1`은 어떻게 다른가?

   <details markdown="1"><summary>답 확인</summary>

   이 Dockerfile을 해석할 프론트엔드 이미지를 지정해 Docker Engine 버전과 무관하게 최신 문법을 쓰게 한다. `1`은 1.x 최신 stable을 자동 추적(권장 기본), `1.7`은 1.7 마이너 고정에 패치만 반영, `1.7.1`은 완전 고정(재현성 최우선). 생략하면 dockerd 내장 파서를 써서 최신 문법을 못 쓸 수 있다. → 코어 2

   </details>

4. `RUN --mount`의 네 타입과 공통 목적은?

   <details markdown="1"><summary>답 확인</summary>

   `bind`(컨텍스트/스테이지 파일 읽기 전용 참조), `cache`(빌드 간 영속 캐시), `secret`(자격 증명을 레이어에 남기지 않고 전달), `ssh`(SSH 에이전트 전달). 공통 목적은 "빌드에는 필요하지만 결과 이미지에는 남지 않아야 하는 것"을 다루는 것이다. → 코어 3

   </details>

5. CI에서 매번 새 러너가 떠도 캐시를 살리는 방법은?

   <details markdown="1"><summary>답 확인</summary>

   `--cache-to`로 캐시를 외부 백엔드(registry, gha, s3/azblob, local, inline)에 내보내고 `--cache-from`으로 불러온다. `mode=max`는 중간 스테이지까지 내보내 적중률을 높이지만 저장·전송 비용이 늘고, 기본 `min`은 최종 이미지 레이어 위주다. → 코어 3

   </details>

6. 멀티스테이지 빌드와 `.dockerignore`는 각각 무엇을 막아 주나?

   <details markdown="1"><summary>답 확인</summary>

   멀티스테이지는 컴파일러·헤더 같은 빌드 의존성이 런타임 이미지에 남는 것을 막아 크기와 공격 표면을 줄인다. `.dockerignore`는 `.git`, `node_modules`, 로컬 산출물 등이 빌드 컨텍스트로 전송·해시되는 낭비를 막는다. → 코어 3, 코어 4

   </details>

7. 멀티플랫폼 이미지가 "한 태그, 여러 아키텍처"로 동작하는 구조는?

   <details markdown="1"><summary>답 확인</summary>

   아키텍처별로 완전히 분리된 이미지들을 가리키는 인덱스(매니페스트 리스트/OCI 이미지 인덱스) 하나가 태그에 연결된다. pull 시 클라이언트가 자신의 OS/아키텍처와 인덱스를 대조해 맞는 매니페스트의 레이어만 받는다. 이미지 한 장이 여러 아키텍처를 담는 것이 아니다. → 코어 4

   </details>

8. `docker buildx create`로 만든 빌더의 정체는 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   실제로 어딘가에 떠 있는 BuildKit 데몬이다. `docker-container` 드라이버는 로컬에 BuildKit 컨테이너를, `kubernetes`는 BuildKit 파드를, `remote`는 기존 BuildKit 데몬 연결 정보를 가리킨다. → 코어 1

   </details>

### 3. 기억 고리

- **C++ 유추:** Makefile/Ninja의 의존 그래프 = LLB와 솔버 ⚠️ Make는 파일 타임스탬프를 보고, BuildKit은 입력으로 계산한 콘텐츠 해시로 같은 작업인지 판단한다.
- **C++ 유추:** ccache 디렉터리 = `--mount=type=cache` ⚠️ 캐시 마운트는 이미지 레이어에 커밋되지 않는 별도 저장소라서 결과 이미지 크기에 들어가지 않는다.
- **비유:** Dockerfile 순서 = 도미노. 앞쪽 도미노(앞 줄)가 쓰러지면(입력이 바뀌면) 뒤쪽이 전부 다시 쓰러진다. 그래서 잘 안 바뀌는 의존성 설치를 앞에, 자주 바뀌는 소스 복사를 뒤에 세운다. ⚠️ 비유가 깨지는 지점: 도미노는 한 번 쓰러지면 끝이지만, 입력 해시가 같은 단계는 캐시에서 되살려 건너뛴다.
- **비유:** 멀티스테이지 = 공장과 출고장. 공장(빌드 스테이지)에서 조립하고 출고장(런타임 스테이지)에는 완제품만 보낸다. ⚠️ 비유가 깨지는 지점: 공장 도구는 사라지지 않고 캐시로 남아 다음 빌드를 빠르게 한다.
- **묶음(3의 법칙):** 레거시 한계 3(순차·거친 캐시·경직) / `syntax` 버전 3단계(1·1.7·1.7.1) / 비밀·캐시·산출물 분리 3원칙(secret·cache·multi-stage).
- **대칭·순서:** 프론트엔드(입력) ↔ 익스포터(출력). `--cache-to`(내보내기) ↔ `--cache-from`(불러오기). QEMU(느리지만 간편) ↔ 네이티브 노드(빠르지만 하드웨어 필요).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Dockerfile 한 줄이 바뀌면 왜 아래가 전부 다시 빌드되고, BuildKit은 그걸 어떻게 개선했는가"를 처음 듣는 사람에게 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "우리 서버 이미지 CI 빌드를 빠르게 하려면 Dockerfile을 어떻게 고쳐야 하는가"를 의존성 레이어 분리와 캐시 마운트로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "레이어 수를 최소화하려고 모든 명령을 `&&`로 한 줄에 묶자" vs B "가독성과 캐시 가능성이 더 중요하다" — 번갈아 변호해 보세요. (캐시 마운트, `COPY --link`, 이미지 크기를 근거로)
- **AI 역할 반전:** "내가 멀티플랫폼 이미지가 어떻게 하나의 태그로 묶이는지 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
