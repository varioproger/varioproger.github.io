# syntax=docker/dockerfile:1.7
# 32장 32.2·32.10절 대응 - 멀티 스테이지 빌드, 최소 런타임, 비루트, tini, HEALTHCHECK
#
# 빌드 컨텍스트는 모노레포 루트(code/)다. 워크스페이스 패키지(@ncg/shared)를
# 함께 복사해야 하므로 서비스 디렉터리만으로는 빌드할 수 없다.
#   docker build -f services/recipe-api/Dockerfile -t recipe-api:local .

# ---------------------------------------------------------------- 1) deps 스테이지
# alpine 을 쓰는 이유: 이미지가 작을수록 pull 시간이 짧고 공격 표면이 좁다.
# 태그를 22-alpine 으로 고정한다. latest 는 어제와 오늘이 다른 이미지가 되어
# "내 노트북에서는 되는데" 를 만든다.
FROM node:22-alpine AS deps
WORKDIR /app

# 매니페스트만 먼저 복사한다.
# 소스가 바뀌어도 package.json 이 그대로면 이 레이어가 캐시에서 재사용되어
# 설치 단계를 건너뛴다. (레이어 캐시를 살리는 핵심 요령)
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/recipe-api/package.json ./services/recipe-api/

# npm ci 를 쓰는 이유: package-lock.json 을 그대로 재현한다.
# npm install 은 락 파일을 갱신할 수 있어서 빌드마다 다른 트리가 나올 수 있다.
# --omit=dev 로 테스트/린트 의존성을 런타임 이미지에서 뺀다.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspaces --include-workspace-root

# --------------------------------------------------------------- 2) build 스테이지
# 이 서비스는 트랜스파일이 없지만, 스테이지를 나눠 두면
# (a) 소스 검증을 여기서 끝내고 (b) 런타임에는 결과물만 넘길 수 있다.
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY services/recipe-api ./services/recipe-api

# 문법 검증을 빌드 시점에 수행한다. 깨진 코드가 이미지로 굳는 것을 막는다.
RUN find services/recipe-api/src packages/shared -name '*.js' -print0 \
    | xargs -0 -n1 node --check

# ------------------------------------------------------------- 3) runtime 스테이지
FROM node:22-alpine AS runtime

# tini: PID 1 문제 해결.
# 컨테이너의 PID 1 은 특별 취급을 받아 기본 시그널 핸들러가 없다. node 를 PID 1 로
# 두면 SIGTERM 이 무시되어 무중단 종료가 동작하지 않고, 자식 프로세스가 좀비로 남는다.
# tini 를 PID 1 로 두면 시그널을 자식에게 전달하고 좀비를 거둬 간다.
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=4000
# 컨테이너 메모리 제한에 맞춰 힙 상한을 명시한다. 지정하지 않으면 Node 가
# 호스트 전체 메모리를 기준으로 잡아 OOMKilled 를 맞는다.
# (주석은 ENV 의 줄 연결(\) 사이에 넣을 수 없으므로 명령을 나눠 쓴다.)
ENV NODE_OPTIONS="--max-old-space-size=384"

WORKDIR /app

# node 이미지에는 uid/gid 1000 의 node 사용자가 이미 있다.
# 비루트로 실행하는 이유: 컨테이너 탈출이나 취약점 악용 시 피해 범위를 줄인다.
# 파일 소유권을 복사 시점에 넘겨야 런타임에 chown 을 돌리지 않아도 된다.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/services/recipe-api ./services/recipe-api

USER node
WORKDIR /app/services/recipe-api

EXPOSE 4000

# HEALTHCHECK 는 liveness 를 본다(readiness 가 아니다).
# readiness 로 걸면 DB 가 잠깐 흔들릴 때 도커/스웜이 멀쩡한 컨테이너를 재시작해
# 장애를 키운다. 의존성 상태는 오케스트레이터의 readinessProbe 가 /health/ready 로 본다.
# curl 을 설치하지 않고 node 로 확인해 이미지에 도구를 더 넣지 않는다.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# exec 형식으로 쓴다. 셸 형식(CMD node src/server.js)은 /bin/sh 가 PID 1 이 되어
# 시그널이 node 까지 전달되지 않는다.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
