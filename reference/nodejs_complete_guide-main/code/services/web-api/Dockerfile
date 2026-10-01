# 32장 32.3절 대응 - 멀티 스테이지 빌드로 작고 안전한 프로덕션 이미지를 만든다.
#
# 원칙 네 가지:
#   1) 멀티 스테이지 — 빌드 도구와 devDependencies 를 최종 이미지에 남기지 않는다.
#   2) alpine       — 베이스가 작을수록 배포가 빠르고 공격 표면(CVE)이 좁다.
#   3) 비루트       — 컨테이너 탈출의 첫 단추는 대부분 root 실행이다.
#   4) tini         — PID 1 문제(시그널 미전달, 좀비 프로세스)를 해결한다.

# syntax=docker/dockerfile:1

########################################
# 1단계: 의존성 설치
########################################
FROM node:22-alpine AS deps
WORKDIR /app

# 워크스페이스 저장소이므로 매니페스트를 먼저 복사한다.
# 소스보다 매니페스트가 훨씬 덜 바뀌므로, 이렇게 나눠야 소스 한 줄 고칠 때마다
# npm ci 를 다시 돌리지 않는다(레이어 캐시).
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY services/web-api/package.json ./services/web-api/

# --omit=dev: 런타임에 필요 없는 것을 애초에 받지 않는다.
# --ignore-scripts: 의존성의 postinstall 스크립트는 공급망 공격의 통로다.
# 캐시 마운트로 레이어에는 캐시를 남기지 않으면서 재빌드는 빠르게 한다.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --workspaces --include-workspace-root

########################################
# 2단계: 런타임
########################################
FROM node:22-alpine AS runtime

# tini 는 PID 1 로 떠서 SIGTERM 을 자식에게 정확히 전달하고 좀비를 거둔다.
# 이것이 없으면 무중단 종료 로직이 아예 호출되지 않는다.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PORT=3000

WORKDIR /app

# node 이미지에는 uid/gid 1000 의 node 사용자가 이미 있다. 그것을 쓴다.
# COPY 시점에 소유자를 지정해야 뒤에 chown -R 레이어를 또 만들지 않는다.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --chown=node:node packages/shared ./packages/shared
COPY --chown=node:node services/web-api ./services/web-api

# 파일 시스템은 읽기 전용으로 마운트하는 것을 전제로 한다(docker run --read-only).
# 쓰기가 필요한 곳은 tmpfs 로 따로 붙인다.
USER node

EXPOSE 3000

# HEALTHCHECK 는 라이브니스와 같은 의미여야 한다. 즉 의존성을 검사하지 않는다.
# 여기에 업스트림 검사를 넣으면 도커가 멀쩡한 컨테이너를 계속 재시작한다.
# curl/wget 을 설치하지 않고 node 로 확인해 이미지 크기와 공격 표면을 줄인다.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini 를 PID 1 로 두고 그 아래에서 node 를 직접 실행한다.
# npm start 로 감싸면 npm 이 PID 1 이 되어 시그널이 node 까지 가지 않는다.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/web-api/src/server.js"]
