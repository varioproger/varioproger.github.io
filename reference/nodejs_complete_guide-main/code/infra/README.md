# infra — 개발용 인프라 스택

『Node.js Complete Guide』의 예제가 의존하는 인프라(데이터베이스·캐시·메시지 브로커·관측 도구)와
프록시·쿠버네티스 설정 모음이다.

서비스 코드(`recipe-api`, `web-api`)는 이 컴포즈 파일에 **포함되어 있지 않다**.
개발 중에는 서비스를 호스트에서 직접 띄우고 인프라만 컨테이너로 두는 편이 반복 주기가 짧다.

---

## 1. 기동과 정지

```bash
# 저장소 루트(code/)에서 실행한다
docker compose -f infra/docker-compose.yml up -d      # 전체 기동 (백그라운드)
docker compose -f infra/docker-compose.yml ps         # 상태 확인
docker compose -f infra/docker-compose.yml logs -f    # 전체 로그
docker compose -f infra/docker-compose.yml down       # 정지 (데이터 유지)
docker compose -f infra/docker-compose.yml down -v    # 정지 + 볼륨 삭제 (완전 초기화)
```

루트 `package.json` 에 단축 스크립트가 있다.

```bash
npm run infra:up      # up -d
npm run infra:down    # down -v
```

### 개별 서비스만 띄우기

전체가 필요 없을 때가 더 많다. 서비스 이름을 인자로 주면 그것만 뜬다(의존 서비스는 함께 뜬다).

```bash
COMPOSE="docker compose -f infra/docker-compose.yml"

$COMPOSE up -d postgres              # 20장 데이터베이스 실습
$COMPOSE up -d redis                 # 23·24장 캐시/레이트 리미터
$COMPOSE up -d rabbitmq              # 25장 메시징
$COMPOSE up -d prometheus grafana    # 30장 메트릭 (grafana 는 prometheus 에 의존)
$COMPOSE up -d jaeger                # 31장 분산 추적

$COMPOSE restart redis               # 하나만 재시작
$COMPOSE stop rabbitmq               # 하나만 정지
$COMPOSE logs -f postgres            # 하나만 로그 추적
```

### 헬스 체크가 통과할 때까지 기다리기

```bash
# 모든 서비스가 healthy 가 될 때까지 대기한다
docker compose -f infra/docker-compose.yml up -d --wait
```

---

## 2. 접속 정보

| 서비스 | 주소 | 계정 / 비고 |
|---|---|---|
| PostgreSQL | `localhost:5432` | `ncg` / `ncg_dev_password`, DB 이름 `ncg` |
| Redis | `localhost:6379` | 비밀번호 없음, `maxmemory 256mb` + `allkeys-lru` |
| RabbitMQ (AMQP) | `localhost:5672` | `ncg` / `ncg_dev_password` |
| RabbitMQ 관리 UI | <http://localhost:15672> | `ncg` / `ncg_dev_password` |
| Prometheus | <http://localhost:9090> | 인증 없음. Status → Targets 에서 스크레이프 상태 확인 |
| Grafana | <http://localhost:3001> | **admin / admin** (익명 열람도 허용) |
| Jaeger UI | <http://localhost:16686> | 인증 없음 |
| Jaeger OTLP (HTTP) | `http://localhost:4318` | `OTEL_EXPORTER_OTLP_ENDPOINT` 에 넣는 값 |
| Jaeger OTLP (gRPC) | `localhost:4317` | |

> Grafana 를 3001 로 매핑한 이유: 컨테이너 내부는 3000 이지만 호스트 3000 은 `web-api` 가 쓴다.

### 접속 확인 명령

```bash
docker exec -it ncg-postgres psql -U ncg -d ncg -c '\l'
docker exec -it ncg-redis redis-cli ping
docker exec -it ncg-rabbitmq rabbitmq-diagnostics status
curl -s localhost:9090/-/healthy
curl -s localhost:3001/api/health
curl -s localhost:16686/ -o /dev/null -w '%{http_code}\n'
```

### 애플리케이션에서 쓸 환경 변수

```bash
DATABASE_URL=postgres://ncg:ncg_dev_password@localhost:5432/ncg
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://ncg:ncg_dev_password@localhost:5672
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

---

## 3. Prometheus 스크레이프 대상

`prometheus/prometheus.yml` 은 호스트에서 도는 서비스를 `host.docker.internal` 로 스크레이프한다.

- `recipe-api` → `host.docker.internal:4000/metrics`
- `web-api` → `host.docker.internal:3000/metrics`
- `web-api-cluster` → 3000·3001·3002 (26장 수평 확장 실습용)

리눅스 도커에는 `host.docker.internal` 이 없어 컴포즈에서 `extra_hosts: host-gateway` 로 만들어 준다.
Target 이 계속 `DOWN` 이면 서비스가 떠 있는지, `/metrics` 가 열려 있는지부터 확인한다.

설정을 고친 뒤 재시작 없이 반영하려면 (`--web.enable-lifecycle` 이 켜져 있다):

```bash
curl -X POST localhost:9090/-/reload
```

Grafana 의 Prometheus·Jaeger 데이터소스는 `grafana/provisioning/datasources/datasource.yml` 로
기동과 동시에 자동 등록된다. UI 에서 손으로 추가할 필요가 없다.

---

## 4. 리버스 프록시 (26장)

`web-api` 인스턴스 3개를 앞에 두고 로드 밸런싱하는 설정이다.
먼저 서비스를 세 개 띄운다.

```bash
PORT=3000 node services/web-api/src/server.js &
PORT=3001 node services/web-api/src/server.js &
PORT=3002 node services/web-api/src/server.js &
```

### HAProxy (26.2절)

```bash
docker run --rm --name ncg-haproxy \
  -p 8080:8080 -p 8404:8404 \
  -v "$PWD/infra/haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro" \
  --add-host=host.docker.internal:host-gateway \
  haproxy:2.9-alpine
```

- 프록시: <http://localhost:8080>
- 통계 페이지: <http://localhost:8404/stats> — 어느 백엔드가 UP/DOWN 인지, 큐 길이가 얼마인지 보인다

관찰 포인트:

- 인스턴스 하나를 `kill` 한 뒤 통계 페이지에서 `fall 3` 만큼 실패한 뒤 DOWN 으로 바뀌는지 본다
- `X-Served-By` 응답 헤더로 어느 인스턴스가 처리했는지 확인한다 (`leastconn` 분배)
- `for i in $(seq 300); do curl -s -o /dev/null -w '%{http_code} ' localhost:8080/; done` 로
  stick-table 레이트 리미팅이 429 를 내는지 확인한다

### Nginx (26.3절)

```bash
docker run --rm --name ncg-nginx \
  -p 8081:8080 \
  -v "$PWD/infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  --add-host=host.docker.internal:host-gateway \
  nginx:1.27-alpine
```

- 프록시: <http://localhost:8081>
- `/events` 경로는 `proxy_buffering off` 라 SSE 이벤트가 즉시 흘러간다.
  일반 `location /` 로 SSE 를 태워 보면 버퍼가 찰 때까지 아무것도 오지 않는 차이를 볼 수 있다
- 설정 문법 검사: `docker run --rm -v "$PWD/infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.27-alpine nginx -t`

HAProxy 는 능동적 헬스 체크(`option httpchk`)를 하고, 오픈소스 Nginx 는 수동 실패 감지
(`max_fails`/`fail_timeout`)만 한다. 이 차이가 두 설정을 비교하는 핵심이다.

---

## 5. 쿠버네티스 (32장)

`k8s/` 아래 매니페스트는 순서대로 적용한다.

```bash
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/configmap.yaml

# 실제 값을 채운 뒤 적용한다. secret.yaml 은 커밋하지 않는다
cp infra/k8s/secret.example.yaml infra/k8s/secret.yaml
$EDITOR infra/k8s/secret.yaml
kubectl apply -f infra/k8s/secret.yaml

kubectl apply -f infra/k8s/recipe-api-deployment.yaml
kubectl apply -f infra/k8s/recipe-api-service.yaml
kubectl apply -f infra/k8s/web-api-deployment.yaml
kubectl apply -f infra/k8s/web-api-service.yaml
kubectl apply -f infra/k8s/ingress.yaml
kubectl apply -f infra/k8s/hpa.yaml
```

확인과 조작:

```bash
kubectl -n ncg get pods -w
kubectl -n ncg rollout status deployment/web-api
kubectl -n ncg rollout undo deployment/web-api        # 롤백 (32.9절)
kubectl -n ncg get hpa
kubectl -n ncg describe pod <파드이름>                 # probe 실패 이유는 Events 에 나온다
kubectl -n ncg port-forward svc/web-api 3000:3000     # 인그레스 없이 접근
```

적용 전 문법만 검증하려면:

```bash
kubectl apply --dry-run=client -f infra/k8s/ -R
```

### 매니페스트에서 꼭 볼 지점

- `recipe-api-deployment.yaml` 의 `NODE_OPTIONS=--max-old-space-size=384`
  — V8 기본 힙 상한은 컨테이너 limit 이 아니라 호스트 메모리를 기준으로 정해진다.
  명시하지 않으면 GC 가 늦어져 힙이 아니라 **컨테이너가** OOMKilled 된다 (32.10절)
- `preStop: sleep 5` — 엔드포인트 제거가 전파되기 전에 SIGTERM 을 받으면
  아직 오고 있던 요청이 연결 거부를 맞는다 (29.1절)
- `livenessProbe` 는 `/health/live`(자기 자신만), `readinessProbe` 는 `/health/ready`(의존성 포함).
  liveness 에서 DB 를 확인하면 DB 가 흔들릴 때 멀쩡한 파드가 전부 재시작되며 장애가 증폭된다
- `startupProbe` 가 있어야 부팅이 느릴 때 liveness 가 먼저 실패해 재시작 루프에 빠지지 않는다

---

## 6. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 포트 충돌 (`address already in use`) | `lsof -i :5432` 등으로 기존 프로세스를 찾는다. 3000/4000 은 서비스가 쓴다 |
| Prometheus Target 이 DOWN | 서비스가 호스트에 떠 있는지, `extra_hosts` 로 `host.docker.internal` 이 해석되는지 |
| RabbitMQ 가 계속 재시작 | `hostname` 이 바뀌면 기존 데이터를 못 읽는다. `down -v` 로 볼륨을 지우고 다시 띄운다 |
| Grafana 에 데이터소스가 없다 | 프로비저닝 디렉터리 마운트 경로 확인. `docker compose logs grafana` 에 에러가 찍힌다 |
| Postgres healthcheck 실패 | `start_period` 안에 initdb 가 끝나지 않았을 수 있다. 로그를 본다 |
| 전부 이상하다 | `down -v` 후 `up -d --wait` 로 완전 초기화 |
