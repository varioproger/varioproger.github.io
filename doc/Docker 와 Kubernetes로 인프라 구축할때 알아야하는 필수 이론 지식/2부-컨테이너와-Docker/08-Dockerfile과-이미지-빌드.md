---
title: "8장. Dockerfile과 이미지 빌드"
parent: "2부. 컨테이너와 Docker"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 8
---

# 8장. Dockerfile과 이미지 빌드

## 이 장에서 배우는 것

- Dockerfile이 이미지의 "빌드 입력"이며 명령이 레이어로 쌓인다는 것을 복습한다.
- 빌드 캐시를 살리는 명령 순서와 `.dockerignore`의 역할을 안다.
- 멀티스테이지 빌드로 최종 이미지를 작고 안전하게 만드는 이유를 이해한다.
- 이미지 태그 규칙과 자주 쓰는 `docker` 기본 CLI를 익힌다.
- 멀티플랫폼 이미지(이미지 인덱스)의 개념을 안다.
- 비밀값 처리, 레지스트리 로그인, 취약점 스캔, 재시작 정책·로그·헬스체크 같은 실행 전후 기본기를 익힌다.

---

## 8.1 Dockerfile 기본기

Dockerfile은 이미지를 만드는 **입력(레시피)** 이다. 빌드가 끝난 뒤의 이미지는 Dockerfile 없이도 실행된다(4장 참고).

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

각 명령이 항상 레이어를 만드는 것은 아니다. `WORKDIR`, `CMD`처럼 메타데이터만 바꾸는 명령은 파일시스템 레이어를 만들지 않는다(7장의 예와 같은 설명).

### `# syntax=` 지시자

Dockerfile 첫 줄에 쓰는 이 줄은 주석처럼 보이지만 BuildKit이 해석한다. Dockerfile을 해석하는 주체가 Docker Engine이 아니라 별도의 "Dockerfile 프론트엔드" 이미지이기 때문에, 이 줄로 어떤 문법 버전을 쓸지 지정한다.

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.20
```

`docker/dockerfile:1`은 1.x의 최신 stable을 따라가는 롤링 태그로, 실무 기본값으로 권장된다. 생략하면 BuildKit 내장 기본 파서가 쓰이며 최신 문법 상당수를 쓸 수 없다. 완전한 빌드 재현성이 필요하면 `docker/dockerfile:1.7.1`처럼 고정한다.

---

## 8.2 빌드 캐시와 명령 순서

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

### `.dockerignore`

빌드 컨텍스트 전송은 BuildKit에서도 사라지지 않는다. `.git`, `node_modules`, 로컬 산출물 등을 제외하지 않으면 매 빌드마다 불필요한 전송과 해시 계산이 발생한다.

```text
.git
node_modules
dist
*.log
.env
```

### 레이어 수에 대한 관점

예전에는 `RUN`마다 레이어가 쓰여 `&&`로 명령을 묶어 레이어 수를 줄이는 것이 중요했다. BuildKit에서는 레이어 수를 줄이는 것보다 **"무엇을 캐시 가능하게 만들 것인가"** 가 더 중요한 질문이 되었다. 가독성을 희생하면서까지 합칠 필요는 예전보다 덜하다.

---

## 8.3 멀티스테이지 빌드

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

---

## 8.4 이미지 태그

```
registry.example.com:5000/team/myapp:1.2.3
└──────── 호스트 ────────┘└─ 리포지토리 ─┘└ 태그 ┘
```

- 태그를 생략하면 `latest`가 된다. 프로덕션에서 `latest`는 피한다(7장).
- 버전 또는 커밋 해시로 태그를 붙이면 어떤 코드로 만든 이미지인지 추적하기 쉽다.

```bash
docker build -t my-api:1.0.0 .
docker build -t my-api:$(git rev-parse --short HEAD) .
docker tag my-api:1.0.0 registry.example.com/team/my-api:1.0.0
```

---

## 8.5 기본 CLI 모음

### 빌드

```bash
docker build -t my-api:1.0.0 .                    # 현재 디렉터리를 컨텍스트로 빌드
docker build --target builder -t my-api:build .   # 멀티스테이지의 특정 스테이지까지만
docker build --build-arg NODE_ENV=production .    # 빌드 인자 전달
docker build -f Dockerfile.dev .                  # 다른 Dockerfile 지정
docker build --progress=plain --no-cache .        # 로그를 자세히, 캐시 없이
docker build --pull .                             # 베이스 이미지를 항상 새로 받기
```

### 실행과 점검

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

### 이미지와 레지스트리

```bash
docker images                       # 로컬 이미지 목록
docker image history my-api:1.0.0   # 레이어별 크기 확인
docker login $REGISTRY
docker push $REPO/my-api:1.0.0
docker pull $REPO/my-api:1.0.0
docker save my-api:1.0.0 | gzip > my-api.tar.gz   # 파일로 내보내기
docker load < my-api.tar.gz                       # 파일에서 불러오기
```

### 정리

```bash
docker system df              # 디스크 사용량 요약
docker container prune        # 중지된 컨테이너 삭제
docker image prune -a         # 사용하지 않는 이미지 삭제
docker volume prune           # 사용하지 않는 볼륨 삭제
```

`docker system prune -a --volumes`처럼 한 번에 많이 지우는 명령은 되돌릴 수 없으므로 신중해야 한다. 특히 `--volumes`는 볼륨의 데이터까지 지운다(9장).

---

## 8.6 실습: 이미지를 빌드해서 로컬 레지스트리에 올리기

8.1의 Dockerfile과, 8080번 포트에서 응답하는 간단한 `app.py`가 있는 디렉터리에서 실행한다고 가정한다.

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

---

## 8.7 멀티플랫폼 빌드: 하나의 태그, 여러 아키텍처

`docker buildx build --platform linux/amd64,linux/arm64 -t myorg/app:1.0 --push .` 한 줄로 서로 다른 CPU 아키텍처용 이미지를 만들어 하나의 태그로 배포할 수 있다.

| 실행 방식 | 설명 | 특징 |
|---|---|---|
| QEMU 에뮬레이션 | 한 대의 amd64 머신에서 arm64 명령어를 변환해 실행 | 별도 하드웨어 불필요, 느림 |
| 네이티브 멀티노드 빌더 | 아키텍처별 실제 노드를 묶어 buildx 빌더로 구성 | 빠름, 노드 필요 |

결과물은 아키텍처별로 분리된 이미지들과 그것을 가리키는 **이미지 인덱스(매니페스트 리스트)** 하나다. 태그가 이 인덱스를 가리키고, 클라이언트(`docker pull`, 쿠버네티스 노드의 kubelet)는 자기 플랫폼에 맞는 이미지만 골라 받는다(7장).

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

쿠버네티스에서 `ImagePullBackOff`는 이미지를 가져오는 단계의 문제이고, 이미지를 받은 뒤 `exec format error`가 나면 실행 파일의 플랫폼(아키텍처)이 노드와 맞지 않는 문제를 의심할 수 있다. (`kubernetes-qustion-book/01_기초/03_Docker_이미지에서_실행까지.md` 9절의 설명)

같은 원문은 "OCI 이미지라서 호환된다"가 "어디서나 무조건 실행된다"는 뜻이 아니라며, 적어도 다음 질문을 분리해서 보라고 한다.

| 조건 | 예 |
|---|---|
| 이미지 형식을 읽을 수 있는가? | 런타임이 매니페스트와 레이어 형식을 지원하는가 |
| 실행 파일의 플랫폼이 맞는가? | linux/amd64 이미지와 linux/arm64 노드의 차이 |
| 필요한 커널 기능이 있는가? | 시스템 콜·기능·권한이 앱 요구와 맞는가 |
| 실행 설정이 맞는가? | 환경 변수·볼륨·시작 명령·파일 권한 |
| 외부 의존성에 접근 가능한가? | DB 연결, DNS, 인증 정보, 네트워크 정책 |

---

## 8.8 이미지를 내보내기 전에 챙길 기본기

### 비밀값은 이미지에 넣지 않는다

- `ARG`나 `ENV`로 넘긴 값은 **이미지 히스토리에 그대로 남는다.** 빌드 중에만 필요한 자격 증명(예: 사설 npm 토큰)은 BuildKit의 secret 마운트로 넘기면 해당 `RUN` 단계 동안에만 파일이 존재하고 결과 레이어에는 남지 않는다.

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc -t my-api:1.0.0 .
```

- `.env` 파일은 `.dockerignore`에 넣어 빌드 컨텍스트에서 빼고(8.2), 실행할 때 `--env-file`로 주입한다. 이미지에 어떤 환경 변수가 박혀 있는지는 `docker inspect`로 확인할 수 있다.

```bash
docker run -d --name api -p 3000:3000 --env-file .env my-api:1.0.0
docker inspect -f '{{.Config.Env}}' my-api:1.0.0     # 이미지에 기록된 환경 변수 확인
```

### 태그와 레지스트리 로그인

CLI 가이드의 CI 예시는 커밋 해시를 태그로 쓰고, 클라우드 레지스트리에는 명령으로 발급받은 임시 비밀번호를 `--password-stdin`으로 넘겨 로그인한다. 배포 도구에는 `latest`가 아니라 이 `$TAG`를 넘긴다.

```bash
export TAG=$(git rev-parse --short HEAD)
export REPO=$ACCOUNT.dkr.ecr.ap-northeast-2.amazonaws.com/my-api

aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.ap-northeast-2.amazonaws.com

docker buildx build --platform linux/amd64 -t $REPO:$TAG --push .
```

### 푸시 전 점검: 린트와 취약점 스캔

```bash
hadolint Dockerfile                                         # Dockerfile 린트
trivy image --exit-code 1 --severity CRITICAL $REPO:$TAG    # 심각한 취약점이 있으면 실패
```

CI에서 이 두 단계를 빌드·푸시와 함께 돌리면, 취약한 이미지가 배포 단계까지 가는 것을 막을 수 있다. 비루트 사용자(`USER`)와 셸조차 없는 최소 이미지(distroless, 8.3)도 같은 목적의 기본기다.

### 실행 중 컨테이너 관리: 재시작, 종료, 로그, 헬스체크

```bash
docker run -d --name api --restart unless-stopped my-api:1.0.0   # 재시작 정책
docker stop -t 30 api                     # 종료 유예 30초 (SIGTERM → 기다린 뒤 SIGKILL, 2장)
docker logs -f --tail 100 --timestamps api
docker logs --since 10m api               # 최근 10분 로그
```

- 컨테이너 로그의 기본 드라이버와 옵션은 `/etc/docker/daemon.json`의 `log-driver` / `log-opts`로 정한다(`json-file`, `journald`, `local` 등).
- 헬스체크 예시는 8.3 Node.js Dockerfile의 `HEALTHCHECK`와 11장 Compose의 `healthcheck` + `condition: service_healthy`를 참고한다.

> **[보충]** `HEALTHCHECK`는 컨테이너가 "떠 있는가"가 아니라 "제대로 응답하는가"를 주기적으로 검사하는 명령을 이미지에 기록하며, 결과는 `docker ps`의 상태(`healthy`/`unhealthy`)로 보인다. `--restart` 값은 `no`(기본값), `on-failure`, `always`, `unless-stopped` 중에서 고른다. `unless-stopped`는 사람이 직접 `docker stop`한 경우가 아니면 데몬 재시작 후에도 다시 띄운다. 기본 `json-file` 로그 드라이버는 따로 제한하지 않으면 로그 파일이 계속 커지므로 `log-opts`에 `max-size`, `max-file`을 지정해 두는 것이 안전하다. 또한 쿠버네티스는 Dockerfile의 `HEALTHCHECK`를 쓰지 않고 Pod 명세의 probe로 상태를 검사한다(15장).

---

## 핵심 요약

- Dockerfile은 이미지의 빌드 입력이며, 명령이 레이어로 쌓이고 `CMD`는 컨테이너 시작 시의 기본 명령을 기록할 뿐이다.
- 캐시를 살리려면 자주 바뀌는 것을 뒤에 두고, `.dockerignore`로 불필요한 파일을 컨텍스트에서 뺀다.
- 멀티스테이지 빌드는 빌드 도구와 실행 환경을 분리해 최종 이미지를 작고 안전하게 만든다.
- 프로덕션에서는 `latest` 대신 버전/커밋 태그나 다이제스트를 쓴다.
- `docker build/run/exec/logs/inspect/push/pull`과 `prune` 계열이 일상적인 기본 CLI다.
- 멀티플랫폼 이미지는 아키텍처별 이미지와 이를 가리키는 인덱스로 구성되며 pull 시 클라이언트가 맞는 것을 고른다.
- 비밀값은 `ARG`/`ENV`가 아니라 secret 마운트나 실행 시 `--env-file`로 넘기고, 푸시 전에 린트·취약점 스캔을 돌린다.

## 확인 질문

1. `COPY . .`를 `RUN pip install` 앞에 두면 빌드 캐시에 어떤 문제가 생기는가?
2. 멀티스테이지 빌드로 최종 이미지에서 얻는 이점 두 가지는?
3. 멀티플랫폼 이미지를 `--load`로 로컬에 가져올 수 없는 이유는?
4. 빌드에 필요한 토큰을 `ARG`로 넘기면 안 되는 이유는?

*원문 근거: docker-fundamental/09_Dockerfile의_진화와_멀티플랫폼_빌드.md (Dockerfile 문법도 버전이 있다/syntax 지시자, RUN --mount type=secret, 멀티스테이지 빌드의 캐시 최적화 패턴, 멀티플랫폼 빌드 전 구간, Dockerfile 린팅과 모범 사례의 변화/.dockerignore); kubernetes-textbook-main/01-쿠버네티스로-가는-길/02-컨테이너의-이해.md (2.2 캐시·멀티 스테이지·이미지 참조, 2.3 실습: 이미지 빌드와 푸시); CLI-Complete-Guide_NestJS-Docker-K8s-Terraform.pdf (06 Docker 절의 build/run/images/system 명령·ECR 로그인, NestJS Dockerfile 예시, 13 End-to-End CI/CD의 TAG·hadolint·trivy); Backend_Infrastructure_CLI_Complete_Guide_KO.pdf (04 Docker 컨테이너 명령 — logs --since, stop -t); docker-fundamental/07_Docker_Engine_API와_CLI.md (daemon.json log-driver/log-opts); kubernetes-qustion-book/01_기초/03_Docker_이미지에서_실행까지.md (9절)*
