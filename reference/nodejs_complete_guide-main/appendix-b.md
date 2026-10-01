---
title: "부록 B. 환경 구축 참조"
---

# 부록 B. 환경 구축 참조

이 부록은 본문 예제를 실행하는 데 필요한 도구의 설치 절차를 한곳에 모은 참조 문서다. 읽는 문서가 아니라 찾아보는 문서이므로 설명보다 명령을 앞세운다.

이 부록에 등장하는 모든 버전 번호는 집필 시점을 기준으로 한 **예시**다. 도구의 릴리스 주기는 이 책보다 훨씬 빠르므로, 실제 설치 전에 각 도구의 공식 문서(`nodejs.org`, `docs.docker.com`, `www.haproxy.org`, `kubernetes.io`)에서 현재 안정 버전을 확인하고 그 값으로 대체한다. 명령 자체의 형태는 대체로 유지되지만, 저장소 URL이나 배포 채널은 바뀔 수 있다.

Windows 사용자는 예외 없이 **WSL2 안의 Linux 배포판**에서 작업한다고 가정한다. 이 책의 예제는 유닉스 시그널, POSIX 파일 경로, `cluster` 모듈의 포크 방식에 의존하는 부분이 있어 네이티브 Windows에서는 동작이 달라질 수 있다. PowerShell에서 다음을 한 번 실행하면 WSL2와 기본 배포판이 함께 설치된다.

```powershell
# 관리자 권한 PowerShell. 설치 후 재부팅이 필요하다
wsl --install -d Ubuntu
wsl --set-default-version 2
```

이후 부록의 "Windows(WSL2)" 항목은 모두 WSL2 셸 안에서 실행하는 명령이다.

---

## B.1 Node.js 설치와 버전 관리

### 시스템 패키지 매니저로 설치하면 안 되는 이유

`apt install nodejs`나 `brew install node`처럼 시스템 패키지 매니저로 Node.js를 설치하면 두 가지 문제가 생긴다.

첫째, **버전이 고정된다.** 배포판 저장소의 Node.js는 대체로 오래된 버전이고, 프로젝트마다 다른 메이저 버전을 요구하는 상황에 대응할 수 없다.

둘째, **전역 설치에 권한 문제가 따라온다.** 시스템 경로(`/usr/lib/node_modules`)에 패키지를 설치하려 하면 권한 오류가 나고, 이를 `sudo npm install -g`로 우회하는 순간 루트 소유 파일이 홈 디렉터리 캐시에 섞여 들어가 이후 일반 권한 설치가 연쇄적으로 깨진다. `npm ERR! EACCES: permission denied`가 반복된다면 대부분 이 경로를 밟은 결과다.

해결책은 **버전 관리자를 통해 사용자 홈 디렉터리에 Node.js를 설치**하는 것이다. 그러면 전역 설치도 홈 디렉터리 안에서 일어나므로 `sudo`가 필요 없다.

### nvm

가장 널리 쓰이는 버전 관리자다. 셸 함수로 구현되어 있어 셸 시작이 다소 느려지지만 호환성이 가장 좋다.

```bash
# macOS / Linux / WSL2 공통
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
# 설치 스크립트가 ~/.bashrc 또는 ~/.zshrc에 초기화 코드를 추가한다. 셸을 새로 연다

nvm install --lts        # 최신 LTS 설치
nvm install 20           # 특정 메이저 설치(예시 버전)
nvm use 20
nvm alias default lts/*  # 새 셸의 기본 버전 지정
nvm ls                   # 설치된 버전 목록
```

### fnm

Rust로 작성된 대안으로, nvm과 명령 체계가 거의 같으면서 훨씬 빠르다. `.nvmrc`도 그대로 읽는다.

```bash
# macOS
brew install fnm

# Linux / WSL2
curl -fsSL https://fnm.vercel.app/install | bash

# 셸 초기화 파일에 추가한다. --use-on-cd가 디렉터리 이동 시 자동 전환을 켠다
eval "$(fnm env --use-on-cd)"

fnm install --lts
fnm use --lts
fnm default lts-latest
```

### Volta

버전을 셸 세션이 아니라 **프로젝트에 고정**한다는 점이 다르다. `package.json`의 `volta` 필드를 읽어 해당 디렉터리에서 `node`를 실행하는 순간 올바른 버전으로 자동 전환한다. 팀 전체가 같은 버전을 쓰도록 강제할 때 유리하다.

```bash
# macOS / Linux / WSL2 공통
curl https://get.volta.sh | bash

volta install node@20      # 예시 버전
volta pin node@20          # 현재 프로젝트의 package.json에 기록
```

```json
{
  "volta": {
    "node": "20.11.0",
    "npm": "10.2.4"
  }
}
```

### .nvmrc로 버전 공유하기

프로젝트 루트에 `.nvmrc` 파일 하나를 두면 nvm과 fnm이 모두 이를 읽는다.

```bash
node --version > .nvmrc   # 예: v20.11.0 이 기록된다
# 또는 메이저만 고정하려면
echo "20" > .nvmrc

nvm use    # .nvmrc를 읽어 전환. 미설치 시 nvm install
fnm use
```

### corepack으로 패키지 매니저 버전 고정하기

Node.js에 내장된 `corepack`은 `package.json`의 `packageManager` 필드를 읽어 지정된 패키지 매니저를 자동으로 내려받아 실행한다. "내 컴퓨터에서는 되는데" 문제의 상당수가 팀원 간 npm/pnpm/yarn 버전 차이에서 나오므로, 프로젝트마다 이 필드를 명시하는 것을 권한다.

```bash
corepack enable            # shim 설치. 시스템 경로 권한이 없으면 --install-directory 사용
corepack use pnpm@9        # package.json에 packageManager 필드를 기록(예시 버전)
```

```json
{
  "packageManager": "pnpm@9.1.0"
}
```

### 이미 권한이 꼬였다면

`sudo npm install -g`를 한 번이라도 실행했다면 캐시와 전역 디렉터리에 루트 소유 파일이 남는다. 버전 관리자로 옮기기 전에 다음 순서로 정리한다.

```bash
# 1) 루트 소유로 바뀐 npm 캐시와 설정 파일의 소유권을 되돌린다
sudo chown -R "$(id -u):$(id -g)" ~/.npm ~/.config/configstore 2>/dev/null

# 2) 시스템 경로에 설치된 전역 패키지 목록을 확인하고 제거한다
npm ls -g --depth=0

# 3) 시스템 Node.js 자체를 제거한다(Debian/Ubuntu 예시)
sudo apt remove --purge nodejs npm && sudo apt autoremove

# 4) 버전 관리자로 다시 설치한 뒤 경로를 확인한다. 홈 디렉터리 아래여야 한다
which node && npm config get prefix
```

버전 관리자를 쓰지 않고 시스템 Node.js를 유지해야 하는 상황이라면, 최소한 전역 설치 경로만이라도 홈 디렉터리로 옮긴다.

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
```

### 설치 확인

```bash
node --version
npm --version
node -e "console.log(process.versions)"   # v8, uv, openssl 버전까지 확인
```

---

## B.2 Docker 설치

이 책의 인프라 예제는 모두 컨테이너로 실행한다. Docker Engine과 Compose v2(`docker compose`, 하이픈 없음)가 필요하다.

### macOS

```bash
brew install --cask docker    # Docker Desktop
# 설치 후 Applications에서 Docker.app을 한 번 실행해 데몬을 띄운다
```

Apple Silicon에서 `linux/amd64` 전용 이미지를 쓸 경우 Rosetta 에뮬레이션이 필요하며 성능이 떨어진다. Docker Desktop 설정에서 "Use Rosetta for x86/amd64 emulation"을 켜거나, 이미지의 `arm64` 태그를 우선 사용한다.

### Linux

```bash
# 공식 편의 스크립트(Ubuntu/Debian/Fedora 등 지원)
curl -fsSL https://get.docker.com | sh

# 데몬 기동 및 부팅 시 자동 시작
sudo systemctl enable --now docker

# sudo 없이 docker를 쓰기 위해 현재 사용자를 docker 그룹에 추가한다
sudo usermod -aG docker "$USER"
newgrp docker    # 또는 로그아웃 후 재로그인
```

### Windows(WSL2)

Docker Desktop for Windows를 설치한 뒤, **Settings → Resources → WSL Integration**에서 사용 중인 배포판을 켠다. 이 설정을 하지 않으면 WSL2 셸에서 `docker: command not found`가 뜬다.

### 설치 확인

```bash
docker --version
docker compose version
docker run --rm hello-world
```

### 흔한 실패 원인

| 증상 | 원인과 해결 |
|---|---|
| `permission denied ... /var/run/docker.sock` | 사용자가 `docker` 그룹에 없다. `usermod -aG docker` 후 재로그인 |
| `Cannot connect to the Docker daemon` | 데몬 미기동. `sudo systemctl start docker`, macOS는 Docker.app 실행 |
| Docker Desktop이 시작되지 않음 | BIOS/UEFI에서 가상화(VT-x, AMD-V)가 비활성. 펌웨어 설정에서 활성화 |
| WSL2에서 `docker` 미인식 | Docker Desktop의 WSL Integration 미설정 |
| `no space left on device` | 미사용 레이어 누적. `docker system prune -a --volumes` |

---

## B.3 HAProxy 설치

20장의 리버스 프록시·부하 분산 실습에 사용한다. 로컬 실험이라면 컨테이너로 띄우는 편이 가장 간단하다.

```bash
# 플랫폼 무관: 설정 파일만 마운트해 실행한다
docker run --rm -p 8080:8080 \
  -v "$PWD/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro" \
  haproxy:lts-alpine
```

호스트에 직접 설치하려면 다음과 같다.

```bash
# macOS
brew install haproxy

# Linux(Debian/Ubuntu). PPA는 배포판 저장소보다 최신 버전을 제공한다
sudo apt update && sudo apt install -y haproxy

# Linux(RHEL 계열)
sudo dnf install -y haproxy

# Windows(WSL2): 위 Linux 명령을 WSL2 셸에서 그대로 실행
```

### 설치 확인과 설정 검증

```bash
haproxy -v                       # 버전 확인
haproxy -c -f /etc/haproxy/haproxy.cfg   # 설정 문법 검사. 재시작 전 반드시 수행
sudo systemctl reload haproxy    # 무중단 리로드
```

`bind :80`처럼 1024 미만 포트를 지정하면 일반 사용자로는 `Starting frontend: cannot bind socket` 오류가 난다. 실습에서는 8080 같은 상위 포트를 쓰거나 컨테이너로 실행한다.

---

## B.4 Kubernetes 로컬 환경: minikube와 kubectl

### kubectl

```bash
# macOS
brew install kubectl

# Linux / WSL2
curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

### minikube

```bash
# macOS
brew install minikube

# Linux / WSL2
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# 클러스터 기동. 드라이버로 docker를 쓰면 별도 하이퍼바이저가 필요 없다
minikube start --driver=docker --cpus=4 --memory=8g
```

### 설치 확인

```bash
kubectl version --client
minikube status
kubectl get nodes
kubectl get pods -A
minikube dashboard    # 웹 UI
```

### 자주 쓰는 보조 명령

```bash
# minikube 내부 도커 데몬을 현재 셸에 연결한다. 이미지를 빌드하면 곧바로 클러스터에서 쓸 수 있다
eval "$(minikube docker-env)"

minikube addons enable ingress
minikube service web-api --url    # 서비스 접근 URL 출력
minikube delete                   # 클러스터 초기화
```

여러 클러스터를 오가는 경우 컨텍스트를 명시적으로 확인하는 습관이 안전하다. 로컬 실습용 명령을 운영 클러스터에 잘못 적용하는 사고는 대부분 컨텍스트 확인을 건너뛴 데서 나온다.

```bash
kubectl config get-contexts        # 등록된 컨텍스트 목록. 현재 값에 * 표시
kubectl config use-context minikube
kubectl config set-context --current --namespace=nodejs-guide   # 기본 네임스페이스 지정
```

### 흔한 실패 원인

- **가상화 비활성화**: `minikube start`가 드라이버를 찾지 못하면 펌웨어의 가상화 설정을 확인한다. `--driver=docker`를 명시하면 대부분 우회된다.
- **메모리 부족**: 기본 할당으로는 Pod가 `Pending`에 머문다. `--memory`를 넉넉히 준다.
- **WSL2 메모리 한계**: `%UserProfile%\.wslconfig`에 `[wsl2]` 섹션과 `memory=8GB`를 지정한 뒤 `wsl --shutdown`으로 반영한다.
- **이미지 Pull 실패**: 로컬에서 빌드한 이미지는 클러스터가 볼 수 없다. 위의 `minikube docker-env`를 쓰거나 `imagePullPolicy: IfNotPresent`를 설정한다.

---

## B.5 이 책의 예제를 위한 docker-compose 묶음

`recipe-api`와 `web-api`가 의존하는 인프라를 한 번에 띄우는 구성이다. 저장소의 `infra/docker-compose.yml`에 해당한다.

```yaml
name: nodejs-complete-guide

services:
  postgres:
    image: postgres:16-alpine        # 예시 버전
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app_password
      POSTGRES_DB: recipes
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro   # 초기 스키마 SQL
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d recipes"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]      # AOF 영속화
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: app
      RABBITMQ_DEFAULT_PASS: app_password
    ports:
      - "5672:5672"     # AMQP
      - "15672:15672"   # 관리 UI
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:9090/-/healthy"]
      interval: 10s
      timeout: 5s
      retries: 5

  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP: "false"
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro   # 데이터소스·대시보드 자동 등록
    depends_on:
      prometheus:
        condition: service_healthy

  jaeger:
    image: jaegertracing/all-in-one:latest
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
    ports:
      - "16686:16686"   # 웹 UI
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP

volumes:
  postgres-data:
  redis-data:
  rabbitmq-data:
  prometheus-data:
  grafana-data:
```

Prometheus는 스크레이프 대상을 설정 파일로 받는다. `infra/prometheus/prometheus.yml`의 최소 구성은 다음과 같다. 컨테이너 안에서 호스트의 서비스를 가리켜야 하므로 `host.docker.internal`을 사용한다(Linux에서는 `extra_hosts`로 이 이름을 매핑하거나 호스트 IP를 직접 적는다).

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: recipe-api
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:4000"]

  - job_name: web-api
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:3001"]
```

### 접속 정보 요약

| 서비스 | 호스트 포트 | 접속 정보 |
|---|---|---|
| PostgreSQL | 5432 | `postgres://app:app_password@localhost:5432/recipes` |
| Redis | 6379 | `redis://localhost:6379` |
| RabbitMQ | 5672 / 15672 | `amqp://app:app_password@localhost:5672`, UI는 `http://localhost:15672` |
| Prometheus | 9090 | `http://localhost:9090` |
| Grafana | 3000 | `http://localhost:3000` (admin / admin) |
| Jaeger | 16686 / 4317 / 4318 | UI는 `http://localhost:16686`, OTLP 엔드포인트는 `http://localhost:4318` |

Grafana의 3000번 포트는 Node.js 개발 서버의 기본 포트와 자주 충돌한다. 충돌하면 Compose 파일에서 `"3001:3000"`처럼 호스트 포트만 바꾼다.

### 실행 명령

```bash
cd infra

docker compose up -d                    # 전체 기동
docker compose up -d postgres redis     # 필요한 서비스만 기동
docker compose ps                       # 상태와 헬스 체크 결과 확인
docker compose logs -f rabbitmq         # 특정 서비스 로그 추적
docker compose exec postgres psql -U app -d recipes   # 컨테이너 안에서 셸 실행

docker compose stop                     # 정지(데이터 유지)
docker compose down                     # 컨테이너 제거(볼륨 유지)
docker compose down -v                  # 볼륨까지 삭제. 데이터 초기화용
```

`depends_on`의 `condition: service_healthy`는 헬스 체크가 통과할 때까지 기동을 미룬다. 애플리케이션 컨테이너를 이 묶음에 추가할 때 같은 방식으로 의존성을 선언하면, DB가 아직 준비되지 않아 첫 연결이 실패하는 흔한 문제를 피할 수 있다.

---

## B.6 예제 코드 저장소 구조

예제는 npm 워크스페이스를 사용하는 단일 저장소로 구성된다.

```text
nodejs-complete-guide/
├── package.json              # 워크스페이스 루트. 공통 스크립트와 devDependencies
├── .nvmrc                    # Node.js 버전 고정
├── packages/
│   └── shared/               # 서비스 간 공용 코드
│       ├── src/
│       │   ├── logger.js         # 구조적 로깅 (31장)
│       │   ├── metrics.js        # Prometheus 지표 등록 (31장)
│       │   ├── tracing.js        # OpenTelemetry 초기화 (31장)
│       │   └── errors.js         # 공용 오류 타입
│       └── package.json
├── services/
│   ├── recipe-api/           # 내부 서비스(업스트림)
│   │   ├── src/
│   │   │   ├── server.js
│   │   │   ├── routes/
│   │   │   ├── db/               # PostgreSQL 접근 계층
│   │   │   └── cache/            # Redis 캐시 계층
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web-api/              # 외부 공개 서비스(다운스트림)
│       ├── src/
│       │   ├── server.js
│       │   ├── clients/          # recipe-api 호출, 서킷 브레이커
│       │   └── middleware/
│       ├── test/
│       ├── Dockerfile
│       └── package.json
├── infra/
│   ├── docker-compose.yml    # B.5의 인프라 묶음
│   ├── haproxy/haproxy.cfg
│   ├── prometheus/prometheus.yml
│   ├── grafana/provisioning/
│   └── k8s/                  # Deployment, Service, Ingress 매니페스트
└── examples/
    ├── ch03-event-loop/
    ├── ch07-streams/
    ├── ch11-worker-threads/
    └── ...                   # 장 번호로 시작하는 단독 실행 스크립트
```

### 장과 디렉터리의 대응

- **1~17장**의 언어·런타임 예제는 `examples/`의 장별 디렉터리에 단독 스크립트로 들어 있다. `node examples/ch07-streams/pipeline.js`처럼 바로 실행한다.
- **18~24장**의 서비스 구현은 `services/`의 두 서비스에 누적된다. 각 장의 결과 상태는 `chapter/18`, `chapter/19` 형태의 Git 태그로 표시되어 있으므로, `git checkout chapter/19`로 해당 시점의 코드를 볼 수 있다.
- **25~28장**의 관측 가능성 코드는 `packages/shared`에 모여 두 서비스가 함께 쓴다.
- **29~34장**의 배포·보안 설정은 `infra/`와 저장소 루트의 `.github/workflows/`에 있다.

### 실행 스크립트

```bash
npm install                  # 워크스페이스 전체 의존성 설치(루트에서 한 번)

npm run dev                  # 두 서비스를 --watch 모드로 동시 기동
npm run dev -w services/recipe-api    # 특정 워크스페이스만

npm test                     # node:test 러너로 전체 테스트
npm test -w services/web-api
npm run test:watch

npm run lint
npm run infra:up             # docker compose up -d 래퍼
npm run infra:down
```

`npm run dev`는 인프라가 떠 있다고 가정한다. 처음 클론했다면 `npm install` → `npm run infra:up` → 헬스 체크 통과 확인 → `npm run dev` 순서로 진행한다. 각 서비스는 `.env.example`을 제공하므로 이를 `.env`로 복사한 뒤 필요한 값만 수정한다.
