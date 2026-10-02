---
title: "9장. Dockerfile과 이미지 빌드"
parent: "2부. 컨테이너와 Docker"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 9
---

# 9장. Dockerfile과 이미지 빌드

> **🎮 게임 서버 개발자에게** — 빌드 머신에서 컴파일러로 서버 바이너리를 만들고, 필요한 파일만 배포 패키지로 묶어 패치 서버에 올리던 과정이 이 장의 "Dockerfile → 이미지 → 레지스트리"에 해당합니다. 결정적으로 다른 점은 빌드가 **명령 한 줄마다 레이어로 쌓이고, 캐시는 바뀐 줄부터 끝까지 통째로 무효화**된다는 것, 그리고 결과물이 바이너리가 아니라 **실행 환경 전체(파일시스템 + 시작 명령)** 라는 것입니다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 코드 한 줄만 고쳤는데 CI 빌드가 매번 `npm ci`/`pip install`부터 다시 돌아 10분씩 걸린다.
> - ARM 노드(예: 저렴한 arm64 인스턴스)에 배포했더니 Pod가 `exec format error`로 죽는다.
> - 빌드용 사설 패키지 토큰을 `ARG`로 넘겼는데, 이미지를 받은 사람이 `docker history`로 토큰을 볼 수 있다.

## 코어 — 이것만은 100%

> **한 문장:** Dockerfile은 레이어로 쌓이는 빌드 입력이므로 자주 바뀌는 것을 뒤에 두어 캐시를 살리고, 멀티스테이지로 "빌드 도구"와 "실행물"을 분리해 작고 안전한 이미지를 만들며, 버전 태그·멀티플랫폼 인덱스로 배포 단위를 식별하고, 비밀값은 이미지 밖으로 빼고 스캔·운영 설정으로 실행 준비를 마친다.

1. **레이어 레시피와 캐시** — Dockerfile 명령이 레이어로 쌓이고, 어떤 레이어가 바뀌면 그 레이어와 뒤의 레이어를 전부 다시 만든다. 그래서 자주 바뀌는 것을 뒤에 두고 `.dockerignore`로 컨텍스트를 줄인다.
2. **빌드와 실행의 분리(멀티스테이지)** — `FROM ... AS builder` + `COPY --from`으로 산출물만 최종 이미지에 옮겨 크기(800MB → 10MB 남짓)와 공격 표면(distroless, 비루트 `USER`)을 줄인다.
3. **배포 단위로서의 이미지: 태그·CLI·멀티플랫폼** — `latest` 대신 버전/커밋 태그로 추적하고, `build → tag → login → push`로 옮기며, 멀티플랫폼은 아키텍처별 이미지를 가리키는 인덱스로 `--push`한다.
4. **이미지 밖에 둘 것과 실행 운영** — `ARG`/`ENV`는 히스토리에 남으므로 비밀값은 secret 마운트·`--env-file`로, 푸시 전 `hadolint`·`trivy`, 실행 중에는 `--restart`·로그 제한·`HEALTHCHECK`를 챙긴다.

**이 장의 학습 목표** (원래 "이 장에서 배우는 것")

- Dockerfile이 이미지의 "빌드 입력"이며 명령이 레이어로 쌓인다는 것을 복습한다.
- 빌드 캐시를 살리는 명령 순서와 `.dockerignore`의 역할을 안다.
- 멀티스테이지 빌드로 최종 이미지를 작고 안전하게 만드는 이유를 이해한다.
- 이미지 태그 규칙과 자주 쓰는 `docker` 기본 CLI를 익힌다.
- 멀티플랫폼 이미지(이미지 인덱스)의 개념을 안다.
- 비밀값 처리, 레지스트리 로그인, 취약점 스캔, 재시작 정책·로그·헬스체크 같은 실행 전후 기본기를 익힌다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| make/CMake 증분 빌드(바뀐 소스만 재컴파일) | 빌드 캐시 | 입력이 같으면 이전 결과를 재사용한다 | make는 의존 그래프(DAG)를 따라 영향받는 것만 다시 만들지만, Dockerfile 캐시는 **한 줄로 이어진 사슬**이라 바뀐 줄 뒤의 명령은 관계가 없어도 전부 다시 실행된다 |
| 빌드 머신(컴파일러·헤더·SDK) vs 배포 패키지(실행 파일 + 필요한 런타임) | 멀티스테이지 빌드 | "빌드에 필요한 것"과 "실행에 필요한 것"을 나눈다 | 최종 이미지에 무엇을 넣을지는 `COPY --from`으로 직접 골라야 하고, 동적 링크 라이브러리를 빠뜨리면 실행 시점에야 실패한다(그래서 예시는 `CGO_ENABLED=0` 정적 바이너리 + distroless) |
| 서버 바이너리에 빌드 번호·git 해시 박기 | 이미지 태그(버전/커밋 해시) | 어떤 코드로 만든 결과물인지 추적한다 | 태그는 레지스트리 안의 **이름표**라 같은 태그를 다른 이미지에 다시 붙일 수 있다(`latest`가 대표적). 내용 고정이 필요하면 다이제스트를 쓴다 |
| x86/ARM 크로스 컴파일 결과를 따로 배포 | 멀티플랫폼 이미지 + 이미지 인덱스 | 아키텍처마다 다른 실행 파일이 필요하다 | 하나의 태그 아래 여러 아키텍처 이미지를 묶고, `docker pull`/kubelet이 **자기 플랫폼에 맞는 것을 자동으로 고른다** |
| 설정 파일·소스에 DB 비밀번호를 하드코딩 | `ARG`/`ENV` 비밀값 | 결과물에 비밀이 박혀 함께 배포된다 | 바이너리의 문자열처럼 `docker history`/`docker inspect`로 그대로 읽힌다. BuildKit secret 마운트는 해당 `RUN` 단계 동안에만 파일이 존재한다 |
| 서버가 죽으면 다시 띄우는 감시 스크립트·서비스 매니저, 하트비트 | `--restart` 정책, `HEALTHCHECK` | 죽은 프로세스를 되살리고 "응답하는가"를 주기적으로 본다 | 쿠버네티스는 Dockerfile의 `HEALTHCHECK`를 쓰지 않고 Pod 명세의 probe로 검사한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 코드 한 줄만 바꿨는데 `pip install`/`npm ci`가 매번 처음부터 다시 도는 이유는 무엇일까?
> 2. 800MB짜리 빌드 이미지를 10MB 남짓으로 줄이는 방법은 무엇일까?
> 3. 빌드에 필요한 토큰을 `ARG`로 넘기면 무엇이 위험할까?
> 4. 하나의 태그로 amd64와 arm64 노드 모두에서 실행되는 이미지는 어떻게 가능할까?
> **처리법:** 🛠 실습 3.3 실습(`docker build` → `docker run -p` → `docker history` → 로컬 `registry:2`에 `tag`/`push` → `/v2/_catalog`), `docker buildx imagetools inspect`, `hadolint`, `trivy image` → 바로 실행 · 🗺 관계도 명령 순서 ↔ 캐시 무효화, 빌드 스테이지 → `COPY --from` → 실행 스테이지, 이미지 인덱스 → 아키텍처별 매니페스트, 비밀값 경로(secret 마운트 / `--env-file`) · 📦 카드로 `docker` CLI 모음(build/run/exec/logs/inspect/push/pull/save/load/prune 옵션), `# syntax=docker/dockerfile:1`, `--restart` 값 4가지, `log-driver`/`log-opts`(`max-size`, `max-file`)

---

## 코어 1. 레이어 레시피와 캐시

### 1.1 Dockerfile 기본기

**한 줄 요약:** Dockerfile은 이미지를 만드는 레시피이고, `RUN`은 빌드 중 실행되어 레이어를 남기지만 `CMD`는 "시작 시 실행할 명령"을 기록할 뿐이다.

Dockerfile은 이미지를 만드는 **입력(레시피)** 이다. 빌드가 끝난 뒤의 이미지는 Dockerfile 없이도 실행된다([5장](05-가상머신-vs-컨테이너-Docker-전체-구조.md) 참고).

```dockerfile
FROM python:3.12-slim

# 비루트 사용자 생성
RUN useradd --uid 10001 --create-home appuser

WORKDIR /app
COPY app.py .

USER 10001
EXPOSE 8080
CMD ["python", "-u", "app.py"]
```

- `FROM`: 베이스 이미지. 레이어의 출발점.
- `RUN`: 빌드 중에 명령을 실행하고 그 결과 파일 변경을 레이어로 남긴다.
- `COPY`: 빌드 컨텍스트의 파일을 이미지로 복사.
- `WORKDIR`, `USER`, `EXPOSE`, `CMD`: 작업 디렉터리, 실행 사용자, 노출 포트, **컨테이너 시작 시 기본 명령**을 기록하는 메타데이터. `CMD`는 빌드할 때 서버를 실행하는 것이 아니다.
- `USER`로 비루트 사용자를 쓰는 것은 보안의 기본 원칙이다(쿠버네티스 `runAsNonRoot`와도 연결된다).

각 명령이 항상 레이어를 만드는 것은 아니다. `WORKDIR`, `CMD`처럼 메타데이터만 바꾸는 명령은 파일시스템 레이어를 만들지 않는다([8장](08-이미지-레이어-레지스트리-OCI.md)의 예와 같은 설명).

### 1.2 `# syntax=` 지시자

**한 줄 요약:** 첫 줄의 `# syntax=`는 주석이 아니라 BuildKit에게 "어떤 Dockerfile 문법 프론트엔드를 쓸지" 알려 주는 지시자다.

Dockerfile 첫 줄에 쓰는 이 줄은 주석처럼 보이지만 BuildKit이 해석한다. Dockerfile을 해석하는 주체가 Docker Engine이 아니라 별도의 "Dockerfile 프론트엔드" 이미지이기 때문에, 이 줄로 어떤 문법 버전을 쓸지 지정한다.

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.20
```

`docker/dockerfile:1`은 1.x의 최신 stable을 따라가는 롤링 태그로, 실무 기본값으로 권장된다. 생략하면 BuildKit 내장 기본 파서가 쓰이며 최신 문법 상당수를 쓸 수 없다. 완전한 빌드 재현성이 필요하면 `docker/dockerfile:1.7.1`처럼 고정한다.

### 1.3 빌드 캐시와 명령 순서

**한 줄 요약:** 바뀐 레이어부터 끝까지 다시 빌드되므로, 자주 바뀌는 것(앱 코드)을 뒤에 둔다.

앞 레이어가 바뀌지 않으면 그 레이어는 캐시를 재사용하고, **어떤 레이어가 바뀌면 그 레이어와 뒤에 오는 레이어를 전부 다시 만든다.** 그래서 **자주 바뀌는 것을 뒤에** 둔다.

```dockerfile
# 나쁜 순서 — 코드 한 줄만 바꿔도 pip install을 다시 한다
COPY . .
RUN pip install -r requirements.txt

# 좋은 순서 — 의존성이 안 바뀌면 캐시 적중
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
```

### 1.4 `.dockerignore`

**한 줄 요약:** 빌드 컨텍스트 전송은 BuildKit에서도 일어나므로, 불필요한 파일(특히 `.env`)은 `.dockerignore`로 뺀다.

빌드 컨텍스트 전송은 BuildKit에서도 사라지지 않는다. `.git`, `node_modules`, 로컬 산출물 등을 제외하지 않으면 매 빌드마다 불필요한 전송과 해시 계산이 발생한다.

```text
.git
node_modules
dist
*.log
.env
```

### 1.5 레이어 수에 대한 관점

**한 줄 요약:** BuildKit 시대에는 "레이어 수 줄이기"보다 "무엇을 캐시 가능하게 만들 것인가"가 더 중요하다.

예전에는 `RUN`마다 레이어가 쓰여 `&&`로 명령을 묶어 레이어 수를 줄이는 것이 중요했다. BuildKit에서는 레이어 수를 줄이는 것보다 **"무엇을 캐시 가능하게 만들 것인가"** 가 더 중요한 질문이 되었다. 가독성을 희생하면서까지 합칠 필요는 예전보다 덜하다.

---

## 코어 2. 빌드와 실행의 분리 — 멀티스테이지 빌드

### 2.1 멀티스테이지 빌드의 원리

**한 줄 요약:** "무엇으로 빌드했는가"와 "무엇을 실행하는가"를 분리하면 최종 이미지가 작고 안전해진다.

빌드 도구와 실행 환경을 분리하면 최종 이미지가 작고 안전해진다.

```dockerfile
# --- 빌드 스테이지 ---
FROM golang:1.22 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

# --- 실행 스테이지 ---
FROM gcr.io/distroless/static-debian12
COPY --from=builder /out/server /server
USER 65532:65532
ENTRYPOINT ["/server"]
```

- `FROM ... AS <이름>`으로 스테이지에 이름을 붙이고 `COPY --from=<이름>`으로 다른 스테이지의 산출물만 가져온다.
- 빌드 스테이지 이미지는 800MB가 넘어도, 최종 이미지는 컴파일된 바이너리만 담아 10MB 남짓이다(원문 예시 기준).
- `distroless` 이미지에는 셸조차 없어 침투 시 할 수 있는 일이 거의 없다.
- 컴파일러·헤더·테스트 프레임워크 같은 빌드 타임 의존성이 런타임 이미지에 남으면 공격 표면과 크기가 커진다. **"무엇으로 빌드했는가"와 "무엇을 실행하는가"를 분리**하는 것이 가장 중요한 모범 사례다.
- 위 빌드 스테이지도 코어 1의 캐시 원칙을 따른다: `go.mod go.sum`을 먼저 복사해 `go mod download`를 캐시하고, 소스 복사(`COPY . .`)는 뒤에 둔다.

### 2.2 Node.js(NestJS) 3단계 구성

**한 줄 요약:** deps → build → runtime 3단계로 나누고, 런타임에는 `dumb-init`(PID 1 시그널 처리)과 `USER node`(비루트)를 쓴다.

Node.js 앱의 전형적인 3단계 구성도 같은 원리다.

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "node", "dist/main.js"]
```

(CLI 가이드의 NestJS Dockerfile 예시이다. 가이드는 Node가 PID 1이면 시그널 처리가 잘 되지 않아 `dumb-init`이나 `tini`를 쓰고, `USER node`로 비루트 실행하라고 설명한다.)

- PID 1과 시그널 문제는 [3장](../1부-리눅스-기초/03-프로세스와-시그널.md)의 설명과 연결된다. C++ 서버에서 SIGTERM 핸들러로 접속 종료 처리를 하던 것과 같은 이유로, 시그널이 앱까지 제대로 전달되어야 우아한 종료가 가능하다.

---

## 코어 3. 배포 단위로서의 이미지 — 태그·CLI·멀티플랫폼

### 3.1 이미지 태그

**한 줄 요약:** 이미지 참조는 `호스트/리포지토리:태그`이고, 프로덕션에서는 `latest` 대신 버전이나 커밋 해시 태그를 쓴다.

```
registry.example.com:5000/team/myapp:1.2.3
└──────── 호스트 ────────┘└─ 리포지토리 ─┘└ 태그 ┘
```

- 태그를 생략하면 `latest`가 된다. 프로덕션에서 `latest`는 피한다([8장](08-이미지-레이어-레지스트리-OCI.md)).
- 버전 또는 커밋 해시로 태그를 붙이면 어떤 코드로 만든 이미지인지 추적하기 쉽다.

```bash
docker build -t my-api:1.0.0 .
docker build -t my-api:$(git rev-parse --short HEAD) .
docker tag my-api:1.0.0 registry.example.com/team/my-api:1.0.0
```

### 3.2 기본 CLI 모음

**한 줄 요약:** 빌드(`build`), 실행·점검(`run/exec/logs/inspect`), 이동(`push/pull/save/load`), 정리(`prune`) 네 묶음으로 기억한다.

#### 빌드

```bash
docker build -t my-api:1.0.0 .                    # 현재 디렉터리를 컨텍스트로 빌드
docker build --target builder -t my-api:build .   # 멀티스테이지의 특정 스테이지까지만
docker build --build-arg NODE_ENV=production .    # 빌드 인자 전달
docker build -f Dockerfile.dev .                  # 다른 Dockerfile 지정
docker build --progress=plain --no-cache .        # 로그를 자세히, 캐시 없이
docker build --pull .                             # 베이스 이미지를 항상 새로 받기
```

#### 실행과 점검

```bash
docker run -it --rm -p 3000:3000 --env-file .env my-api:1.0.0   # 포그라운드, 종료 시 삭제
docker run -d --name api --restart unless-stopped my-api:1.0.0  # 백그라운드
docker run -it --rm --entrypoint sh my-api:1.0.0                # 셸로 들어가 이미지 내부 확인

docker exec -it api sh              # 실행 중 컨테이너에 셸 접속
docker logs -f --tail 100 api       # 로그 따라가기
docker inspect api                  # 상세 정보 (JSON)
docker stats                        # 자원 사용량
docker top api                      # 컨테이너 안의 프로세스
docker cp api:/app/logs/app.log ./app.log
docker port api                     # 포트 매핑 확인
```

#### 이미지와 레지스트리

```bash
docker images                       # 로컬 이미지 목록
docker image history my-api:1.0.0   # 레이어별 크기 확인
docker login $REGISTRY
docker push $REPO/my-api:1.0.0
docker pull $REPO/my-api:1.0.0
docker save my-api:1.0.0 | gzip > my-api.tar.gz   # 파일로 내보내기
docker load < my-api.tar.gz                       # 파일에서 불러오기
```

#### 정리

```bash
docker system df              # 디스크 사용량 요약
docker container prune        # 중지된 컨테이너 삭제
docker image prune -a         # 사용하지 않는 이미지 삭제
docker volume prune           # 사용하지 않는 볼륨 삭제
```

`docker system prune -a --volumes`처럼 한 번에 많이 지우는 명령은 되돌릴 수 없으므로 신중해야 한다. 특히 `--volumes`는 볼륨의 데이터까지 지운다([10장](10-컨테이너-데이터-볼륨-바인드마운트-tmpfs.md)).

### 3.3 실습: 이미지를 빌드해서 로컬 레지스트리에 올리기

**한 줄 요약:** build → run → history → 로컬 `registry:2` → tag → push → `/v2/_catalog`로 이미지가 "옮길 수 있는 배포 단위"임을 확인한다.

1.1의 Dockerfile과, 8080번 포트에서 응답하는 간단한 `app.py`가 있는 디렉터리에서 실행한다고 가정한다.

```bash
docker build -t hello:1.0 .
docker images hello
docker run -d --name hello -p 8080:8080 hello:1.0
curl localhost:8080
docker history hello:1.0          # 각 명령이 만든 레이어 크기 확인

docker run -d -p 5000:5000 --name registry registry:2    # 로컬 레지스트리 실행
docker tag hello:1.0 localhost:5000/hello:1.0
docker push localhost:5000/hello:1.0
curl -s localhost:5000/v2/_catalog                        # {"repositories":["hello"]}

docker rm -f hello
```

### 3.4 멀티플랫폼 빌드: 하나의 태그, 여러 아키텍처

**한 줄 요약:** 멀티플랫폼 결과물은 아키텍처별 이미지 + 이를 가리키는 이미지 인덱스이고, 로컬 데몬은 단일 아키텍처만 받으므로 `--push`로 레지스트리에 올려야 한다.

`docker buildx build --platform linux/amd64,linux/arm64 -t myorg/app:1.0 --push .` 한 줄로 서로 다른 CPU 아키텍처용 이미지를 만들어 하나의 태그로 배포할 수 있다.

| 실행 방식 | 설명 | 특징 |
|---|---|---|
| QEMU 에뮬레이션 | 한 대의 amd64 머신에서 arm64 명령어를 변환해 실행 | 별도 하드웨어 불필요, 느림 |
| 네이티브 멀티노드 빌더 | 아키텍처별 실제 노드를 묶어 buildx 빌더로 구성 | 빠름, 노드 필요 |

결과물은 아키텍처별로 분리된 이미지들과 그것을 가리키는 **이미지 인덱스(매니페스트 리스트)** 하나다. 태그가 이 인덱스를 가리키고, 클라이언트(`docker pull`, 쿠버네티스 노드의 kubelet)는 자기 플랫폼에 맞는 이미지만 골라 받는다([8장](08-이미지-레이어-레지스트리-OCI.md)).

```text
myorg/app:1.0  (index)
├── linux/amd64  → image manifest → config + layers
├── linux/arm64  → image manifest → config + layers
└── linux/arm/v7 → image manifest → config + layers
```

```bash
docker buildx imagetools inspect myorg/app:1.0   # 인덱스 구조 확인
```

`--load`는 로컬 Docker 데몬이 단일 아키텍처 이미지만 받을 수 있어 여러 `--platform`과 함께 쓸 수 없다. 멀티플랫폼 결과는 레지스트리로 `--push`해야 인덱스로 조립된다.

### 3.5 "OCI 이미지"라고 어디서나 실행되는 것은 아니다

**한 줄 요약:** 받는 단계 실패(`ImagePullBackOff`)와 받은 뒤 실행 실패(`exec format error`)를 구분하고, 호환성은 다섯 가지 조건으로 나눠 본다.

쿠버네티스에서 `ImagePullBackOff`는 이미지를 가져오는 단계의 문제이고, 이미지를 받은 뒤 `exec format error`가 나면 실행 파일의 플랫폼(아키텍처)이 노드와 맞지 않는 문제를 의심할 수 있다. (`kubernetes-qustion-book/01_기초/03_Docker_이미지에서_실행까지.md` 9절의 설명)

같은 원문은 "OCI 이미지라서 호환된다"가 "어디서나 무조건 실행된다"는 뜻이 아니라며, 적어도 다음 질문을 분리해서 보라고 한다.

| 조건 | 예 |
|---|---|
| 이미지 형식을 읽을 수 있는가? | 런타임이 매니페스트와 레이어 형식을 지원하는가 |
| 실행 파일의 플랫폼이 맞는가? | linux/amd64 이미지와 linux/arm64 노드의 차이 |
| 필요한 커널 기능이 있는가? | 시스템 콜·기능·권한이 앱 요구와 맞는가 |
| 실행 설정이 맞는가? | 환경 변수·볼륨·시작 명령·파일 권한 |
| 외부 의존성에 접근 가능한가? | DB 연결, DNS, 인증 정보, 네트워크 정책 |

### 3.6 태그와 레지스트리 로그인 (CI 흐름)

**한 줄 요약:** CI에서는 커밋 해시를 `$TAG`로 쓰고, 레지스트리 임시 비밀번호는 `--password-stdin`으로 넘기며, 배포 도구에는 `latest`가 아니라 이 `$TAG`를 넘긴다.

CLI 가이드의 CI 예시는 커밋 해시를 태그로 쓰고, 클라우드 레지스트리에는 명령으로 발급받은 임시 비밀번호를 `--password-stdin`으로 넘겨 로그인한다. 배포 도구에는 `latest`가 아니라 이 `$TAG`를 넘긴다.

```bash
export TAG=$(git rev-parse --short HEAD)
export REPO=$ACCOUNT.dkr.ecr.ap-northeast-2.amazonaws.com/my-api

aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.ap-northeast-2.amazonaws.com

docker buildx build --platform linux/amd64 -t $REPO:$TAG --push .
```

---

## 코어 4. 이미지 밖에 둘 것과 실행 운영

### 4.1 비밀값은 이미지에 넣지 않는다

**한 줄 요약:** `ARG`/`ENV` 값은 이미지 히스토리에 남으므로, 빌드용 자격 증명은 secret 마운트로, 실행용 설정은 `--env-file`로 넘긴다.

- `ARG`나 `ENV`로 넘긴 값은 **이미지 히스토리에 그대로 남는다.** 빌드 중에만 필요한 자격 증명(예: 사설 npm 토큰)은 BuildKit의 secret 마운트로 넘기면 해당 `RUN` 단계 동안에만 파일이 존재하고 결과 레이어에는 남지 않는다.

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc -t my-api:1.0.0 .
```

- `.env` 파일은 `.dockerignore`에 넣어 빌드 컨텍스트에서 빼고(1.4), 실행할 때 `--env-file`로 주입한다. 이미지에 어떤 환경 변수가 박혀 있는지는 `docker inspect`로 확인할 수 있다.

```bash
docker run -d --name api -p 3000:3000 --env-file .env my-api:1.0.0
docker inspect -f '{{.Config.Env}}' my-api:1.0.0     # 이미지에 기록된 환경 변수 확인
```

### 4.2 푸시 전 점검: 린트와 취약점 스캔

**한 줄 요약:** `hadolint`(Dockerfile 린트)와 `trivy`(이미지 취약점 스캔)를 CI의 빌드·푸시 단계와 함께 돌린다.

```bash
hadolint Dockerfile                                         # Dockerfile 린트
trivy image --exit-code 1 --severity CRITICAL $REPO:$TAG    # 심각한 취약점이 있으면 실패
```

CI에서 이 두 단계를 빌드·푸시와 함께 돌리면, 취약한 이미지가 배포 단계까지 가는 것을 막을 수 있다. 비루트 사용자(`USER`)와 셸조차 없는 최소 이미지(distroless, 2.1)도 같은 목적의 기본기다.

### 4.3 실행 중 컨테이너 관리: 재시작, 종료, 로그, 헬스체크

**한 줄 요약:** `--restart`로 되살리고, `stop -t`로 종료 유예를 주고, 로그는 `log-opts`로 제한하고, `HEALTHCHECK`로 "응답하는가"를 본다.

```bash
docker run -d --name api --restart unless-stopped my-api:1.0.0   # 재시작 정책
docker stop -t 30 api                     # 종료 유예 30초 (SIGTERM → 기다린 뒤 SIGKILL, 3장)
docker logs -f --tail 100 --timestamps api
docker logs --since 10m api               # 최근 10분 로그
```

- 컨테이너 로그의 기본 드라이버와 옵션은 `/etc/docker/daemon.json`의 `log-driver` / `log-opts`로 정한다(`json-file`, `journald`, `local` 등).
- 헬스체크 예시는 2.2 Node.js Dockerfile의 `HEALTHCHECK`와 [12장](12-Docker-Compose와-컨테이너-런타임-계보.md) Compose의 `healthcheck` + `condition: service_healthy`를 참고한다.

> **[보충]** `HEALTHCHECK`는 컨테이너가 "떠 있는가"가 아니라 "제대로 응답하는가"를 주기적으로 검사하는 명령을 이미지에 기록하며, 결과는 `docker ps`의 상태(`healthy`/`unhealthy`)로 보인다. `--restart` 값은 `no`(기본값), `on-failure`, `always`, `unless-stopped` 중에서 고른다. `unless-stopped`는 사람이 직접 `docker stop`한 경우가 아니면 데몬 재시작 후에도 다시 띄운다. 기본 `json-file` 로그 드라이버는 따로 제한하지 않으면 로그 파일이 계속 커지므로 `log-opts`에 `max-size`, `max-file`을 지정해 두는 것이 안전하다. 또한 쿠버네티스는 Dockerfile의 `HEALTHCHECK`를 쓰지 않고 Pod 명세의 probe로 상태를 검사한다([16장](../3부-쿠버네티스-핵심/16-Pod-생명주기와-헬스체크.md)).

---

## 실무 적용

### 체크리스트

- [ ] Dockerfile은 이미지의 빌드 입력이며, 명령이 레이어로 쌓이고 `CMD`는 컨테이너 시작 시의 기본 명령을 기록할 뿐임을 안다.
- [ ] 첫 줄에 `# syntax=docker/dockerfile:1`을 두고, 재현성이 필요하면 `1.7.1`처럼 고정한다.
- [ ] 캐시를 살리려면 자주 바뀌는 것을 뒤에 두고(의존성 파일 복사·설치 → 코드 복사), `.dockerignore`로 `.git`, `node_modules`, `.env` 등을 컨텍스트에서 뺀다.
- [ ] 멀티스테이지 빌드로 빌드 도구와 실행 환경을 분리해 최종 이미지를 작고 안전하게 만든다(distroless, 비루트 `USER`).
- [ ] Node 앱은 PID 1 시그널 문제 때문에 `dumb-init`/`tini`를 ENTRYPOINT로 둔다.
- [ ] 프로덕션에서는 `latest` 대신 버전/커밋 태그나 다이제스트를 쓰고, 배포 도구에도 그 `$TAG`를 넘긴다.
- [ ] `docker build/run/exec/logs/inspect/push/pull`과 `prune` 계열이 일상적인 기본 CLI이며, `system prune -a --volumes`는 볼륨 데이터까지 지운다는 것을 기억한다.
- [ ] 멀티플랫폼 이미지는 아키텍처별 이미지와 이를 가리키는 인덱스로 구성되며 pull 시 클라이언트가 맞는 것을 고른다. 여러 `--platform`은 `--push`로만 결과를 받는다.
- [ ] 비밀값은 `ARG`/`ENV`가 아니라 secret 마운트나 실행 시 `--env-file`로 넘기고, 푸시 전에 린트(`hadolint`)·취약점 스캔(`trivy`)을 돌린다.
- [ ] `--restart` 정책, `stop -t` 종료 유예, `log-opts`의 `max-size`/`max-file`, `HEALTHCHECK`를 설정한다.

### 시나리오로 확인하기

1. **상황:** 게임 API 서버 이미지를 CI에서 빌드하는데, 코드 한 줄만 고쳐도 매번 `npm ci`가 처음부터 돌아 빌드가 10분씩 걸린다. Dockerfile은 `COPY . .` 다음 줄에 `RUN npm ci`가 있다. make 증분 빌드에 익숙한 동료는 "의존성은 안 바뀌었으니 캐시돼야 정상"이라고 한다.
   **질문:** 왜 캐시가 안 되며, 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   Docker 빌드 캐시는 make처럼 의존 관계를 추적하지 않고, **바뀐 레이어와 그 뒤 레이어를 전부 다시 만든다.** 코드가 바뀌면 `COPY . .` 레이어가 바뀌므로 뒤의 `npm ci`도 매번 재실행된다. `COPY package*.json ./` → `RUN npm ci` → `COPY . .` 순서로 바꾸고, `.dockerignore`로 `node_modules`·`.git`을 빼서 컨텍스트 전송·해시 계산도 줄인다. → 코어 1 (1.3, 1.4)

   </details>

2. **상황:** amd64 개발 PC에서 빌드한 이미지를 arm64 노드로 구성된 쿠버네티스 클러스터에 배포했다. 이미지 pull은 성공했는데 컨테이너가 `exec format error`로 바로 죽는다.
   **질문:** 원인은 무엇이고, 하나의 태그로 두 아키텍처를 모두 지원하려면 어떻게 하나?

   <details markdown="1"><summary>답 확인</summary>

   pull은 성공했으니 `ImagePullBackOff`(가져오기 단계) 문제가 아니라, 실행 파일의 플랫폼이 노드와 맞지 않는 문제다. `docker buildx build --platform linux/amd64,linux/arm64 -t ... --push .`로 아키텍처별 이미지와 이를 가리키는 이미지 인덱스를 만들어 레지스트리에 올리면, kubelet이 자기 플랫폼에 맞는 이미지를 골라 받는다. 멀티플랫폼 결과는 `--load`로 로컬에 받을 수 없다. → 코어 3 (3.4, 3.5)

   </details>

3. **상황:** 사설 npm 레지스트리 토큰을 `docker build --build-arg NPM_TOKEN=...`으로 넘겨 빌드했다. 이미지를 받은 외주 팀이 토큰을 알고 있었다.
   **질문:** 어디로 새었고, 어떻게 넘겨야 했나?

   <details markdown="1"><summary>답 확인</summary>

   `ARG`나 `ENV`로 넘긴 값은 이미지 히스토리에 그대로 남는다. BuildKit secret 마운트(`RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci` + `docker build --secret id=npmrc,src=$HOME/.npmrc`)를 쓰면 해당 `RUN` 단계 동안에만 파일이 존재하고 결과 레이어에는 남지 않는다. 실행용 설정은 `.env`를 `.dockerignore`에 넣고 `--env-file`로 주입한다. → 코어 4 (4.1)

   </details>

4. **상황:** C++ 서버 시절처럼 빌드 머신 이미지(`golang:1.22`, 800MB 이상)를 그대로 운영에 배포하고 있다. 보안 점검에서 "운영 컨테이너에 컴파일러와 셸이 있다"는 지적을 받았다.
   **질문:** 무엇을 바꿔야 하나?

   <details markdown="1"><summary>답 확인</summary>

   멀티스테이지 빌드로 빌드 스테이지(`FROM golang:1.22 AS builder`)에서 바이너리만 만들고, 실행 스테이지(`FROM gcr.io/distroless/static-debian12`)에 `COPY --from=builder`로 바이너리만 옮긴 뒤 `USER 65532:65532`로 비루트 실행한다. 최종 이미지는 10MB 남짓이 되고, distroless에는 셸조차 없어 침투 시 할 수 있는 일이 거의 없다. → 코어 2 (2.1)

   </details>

5. **상황:** 장기 실행 중인 서버 호스트의 디스크가 가득 차서 모든 컨테이너가 멈췄다. 조사해 보니 한 컨테이너의 로그 파일이 수십 GB였다.
   **질문:** 원인과 예방책은?

   <details markdown="1"><summary>답 확인</summary>

   기본 `json-file` 로그 드라이버는 따로 제한하지 않으면 로그 파일이 계속 커진다. `/etc/docker/daemon.json`의 `log-opts`에 `max-size`, `max-file`을 지정해 둔다. 정리할 때는 `docker system df`로 사용량을 먼저 보고, `system prune -a --volumes`는 볼륨 데이터까지 지우므로 신중히 쓴다. → 코어 4 (4.3), 코어 3 (3.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1 레이어 레시피와 캐시
  기본기: FROM / RUN(____) / COPY / 메타데이터(WORKDIR, USER, EXPOSE, CMD)
  # syntax=docker/dockerfile:1  ← 해석 주체: ____
  캐시: 바뀐 레이어 + ( ? ) 재빌드 → 자주 바뀌는 것은 ____
  .dockerignore → 컨텍스트 ____ 감소     BuildKit 관점: 레이어 수보다 ____
코어 2 빌드와 실행 분리
  AS builder → COPY --from=____ → distroless(____ 없음) + USER
  핵심 원칙: "무엇으로 ____" vs "무엇을 ____"
  Node: deps → build → runtime, PID 1 → ____ / ____
코어 3 배포 단위
  태그: 버전 / ____ 해시      CLI: build·run·exec·logs·inspect·push·pull·prune
  실습: build → run → history → registry:2 → tag → push → /v2/_catalog
  멀티플랫폼: buildx --platform a,b --push → ____ (매니페스트 리스트)
  QEMU(____) vs 네이티브 노드(____)    --load 불가 이유: ____
  exec format error → ( ? )     ImagePullBackOff → ( ? )
  CI: TAG=git 해시, docker login --password-____
코어 4 이미지 밖 + 운영
  비밀값: ARG/ENV → ____ 에 남음 → RUN --mount=type=____ / --env-file
  점검: ____(린트) + ____(스캔)
  운영: --restart(no/on-failure/always/____), stop -t, log-opts(max-size, max-file), HEALTHCHECK
```

### 2. 인출 질문

1. `COPY . .`를 `RUN pip install` 앞에 두면 빌드 캐시에 어떤 문제가 생기는가?

   <details markdown="1"><summary>답 확인</summary>

   어떤 레이어가 바뀌면 그 레이어와 뒤의 레이어를 전부 다시 만든다. 코드 한 줄만 바꿔도 `COPY . .` 레이어가 바뀌어 뒤의 `pip install`까지 매번 다시 실행된다. `requirements.txt`만 먼저 복사해 설치한 뒤 `COPY . .`를 두면 의존성이 안 바뀌는 한 캐시가 적중한다. → 코어 1 (1.3)

   </details>

2. 멀티스테이지 빌드로 최종 이미지에서 얻는 이점 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   크기가 작아지고(빌드 스테이지 800MB 이상 → 바이너리만 담은 10MB 남짓), 안전해진다(컴파일러·헤더·테스트 프레임워크 같은 빌드 타임 의존성이 빠져 공격 표면이 줄고, distroless는 셸조차 없다). → 코어 2 (2.1)

   </details>

3. 멀티플랫폼 이미지를 `--load`로 로컬에 가져올 수 없는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   로컬 Docker 데몬은 단일 아키텍처 이미지만 받을 수 있기 때문이다. 여러 `--platform` 결과는 레지스트리로 `--push`해야 아키텍처별 이미지를 가리키는 이미지 인덱스로 조립된다. → 코어 3 (3.4)

   </details>

4. 빌드에 필요한 토큰을 `ARG`로 넘기면 안 되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   `ARG`나 `ENV`로 넘긴 값은 이미지 히스토리에 그대로 남기 때문이다. BuildKit의 secret 마운트(`RUN --mount=type=secret,...` + `docker build --secret`)를 쓰면 해당 `RUN` 단계 동안에만 파일이 존재하고 결과 레이어에는 남지 않는다. → 코어 4 (4.1)

   </details>

5. Dockerfile 첫 줄의 `# syntax=docker/dockerfile:1`은 주석인데 왜 의미가 있는가?

   <details markdown="1"><summary>답 확인</summary>

   BuildKit이 이 줄을 해석한다. Dockerfile을 해석하는 주체가 Docker Engine이 아니라 별도의 "Dockerfile 프론트엔드" 이미지이므로, 이 줄로 문법 버전을 지정한다. `:1`은 1.x 최신 stable을 따르는 롤링 태그이고, 생략하면 내장 기본 파서가 쓰여 최신 문법 상당수를 못 쓴다. 완전한 재현성이 필요하면 `1.7.1`처럼 고정한다. → 코어 1 (1.2)

   </details>

6. NestJS 예시 Dockerfile의 런타임 스테이지가 `dumb-init`과 `USER node`를 쓰는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   Node가 PID 1이면 시그널 처리가 잘 되지 않으므로 `dumb-init`(또는 `tini`)을 ENTRYPOINT로 두고, `USER node`로 비루트 실행해 보안 기본 원칙을 지킨다. → 코어 2 (2.2, [3장](../1부-리눅스-기초/03-프로세스와-시그널.md) PID 1 문제와 연결)

   </details>

7. 쿠버네티스에서 이미지를 받은 뒤 `exec format error`가 났다면 무엇을 의심해야 하며, `ImagePullBackOff`와는 어떻게 다른가?

   <details markdown="1"><summary>답 확인</summary>

   `exec format error`는 이미지를 받은 뒤 실행 파일의 플랫폼(아키텍처)이 노드와 맞지 않는 문제(예: linux/amd64 이미지를 linux/arm64 노드에서 실행)를 의심한다. `ImagePullBackOff`는 이미지를 가져오는 단계의 문제다. "OCI 이미지라서 호환된다"가 "어디서나 실행된다"는 뜻은 아니다. → 코어 3 (3.5)

   </details>

8. 기본 `json-file` 로그 드라이버를 그대로 두면 생기는 문제와 대응은?

   <details markdown="1"><summary>답 확인</summary>

   따로 제한하지 않으면 로그 파일이 계속 커진다. `/etc/docker/daemon.json`의 `log-opts`에 `max-size`, `max-file`을 지정해 두는 것이 안전하다. → 코어 4 (4.3 [보충])

   </details>

9. `CMD`와 `RUN`은 실행 시점이 어떻게 다른가?

   <details markdown="1"><summary>답 확인</summary>

   `RUN`은 빌드 중에 실행되어 파일 변경을 레이어로 남긴다. `CMD`는 컨테이너 시작 시의 기본 명령을 기록하는 메타데이터일 뿐, 빌드할 때 서버를 실행하지 않으며 파일시스템 레이어도 만들지 않는다. → 코어 1 (1.1)

   </details>

### 3. 기억 고리

- **C++ 유추:** 빌드 캐시 ≈ make 증분 빌드. ⚠️ make는 의존 그래프를 따라 영향받는 것만 다시 만들지만, Dockerfile은 한 줄 사슬이라 바뀐 줄 **뒤의 모든 줄**이 다시 실행된다.
- **C++ 유추:** 멀티스테이지 ≈ 빌드 머신에서 컴파일하고 배포 패키지에는 실행 파일만 넣기. ⚠️ 최종 이미지에 들어갈 파일은 `COPY --from`으로 직접 골라야 하고, 빠뜨린 동적 라이브러리는 실행 시에야 드러난다.
- **비유:** 빌드 캐시 = 도미노 줄. 중간 도미노 하나를 건드리면(레이어 변경) 그 뒤 도미노는 모두 다시 세워야 한다. 그래서 자주 건드릴 도미노(앱 코드)는 맨 끝에 둔다. ⚠️ 비유가 깨지는 지점: 도미노와 달리 바뀐 레이어 앞쪽은 아무 영향 없이 캐시로 그대로 재사용되고, 다시 만드는 범위는 정확히 "바뀐 레이어부터 끝까지"다.
- **비유:** 멀티스테이지 = 공장(빌드 스테이지)에서 완성품만 포장해 매장(실행 스테이지)으로 보내기. 매장에는 공구(컴파일러)를 두지 않아 도둑(침입자)이 쓸 도구가 없다. ⚠️ 비유가 깨지는 지점: 공장도 이미지로 남을 수 있고(`--target builder`), 포장에 무엇을 넣을지는 `COPY --from`으로 직접 골라야 한다.
- **묶음(3의 법칙):** 이미지 다이어트 3종(캐시 순서·`.dockerignore`·멀티스테이지) / 보안 3종(비루트 `USER`·distroless·secret 마운트) / 푸시 전 3종(커밋 태그·`hadolint`·`trivy`).
- **대칭·순서:** 빌드 시점(`RUN`, `ARG`, secret 마운트) ↔ 실행 시점(`CMD`/`ENTRYPOINT`, `--env-file`, `--restart`). QEMU(하드웨어 불필요, 느림) ↔ 네이티브 노드(빠름, 노드 필요). 흐름: build → tag → login → push → (스캔) → 배포.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Go 서버 이미지를 멀티스테이지로 10MB로 만드는 과정"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "make 증분 빌드와 Docker 빌드 캐시가 왜 다르게 동작하는지, 그래서 Dockerfile에서 `COPY` 순서가 왜 중요한지"를 동료의 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "`RUN` 명령은 `&&`로 최대한 합쳐 레이어 수를 줄여야 한다" vs B "BuildKit에서는 가독성과 캐시 가능성이 더 중요하다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Dockerfile 명령 순서와 빌드 캐시, 비밀값 처리 방법을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/09_Dockerfile의_진화와_멀티플랫폼_빌드.md (Dockerfile 문법도 버전이 있다/syntax 지시자, RUN --mount type=secret, 멀티스테이지 빌드의 캐시 최적화 패턴, 멀티플랫폼 빌드 전 구간, Dockerfile 린팅과 모범 사례의 변화/.dockerignore); kubernetes-textbook-main/01-쿠버네티스로-가는-길/02-컨테이너의-이해.md (2.2 캐시·멀티 스테이지·이미지 참조, 2.3 실습: 이미지 빌드와 푸시); CLI-Complete-Guide_NestJS-Docker-K8s-Terraform.pdf (06 Docker 절의 build/run/images/system 명령·ECR 로그인, NestJS Dockerfile 예시, 13 End-to-End CI/CD의 TAG·hadolint·trivy); Backend_Infrastructure_CLI_Complete_Guide_KO.pdf (04 Docker 컨테이너 명령 — logs --since, stop -t); docker-fundamental/07_Docker_Engine_API와_CLI.md (daemon.json log-driver/log-opts); kubernetes-qustion-book/01_기초/03_Docker_이미지에서_실행까지.md (9절)*
