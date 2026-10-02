# Part 03. Docker 리소스 제어 · 볼륨 · Dockerfile 로 이미지 만들기

> 원본: Docker컨테이너 빌드업! ch7(리소스 모니터링과 자원 할당), ch8(Docker volume), ch9(Dockerfile) — 자료 040~052
> 구축 순서: 모니터링(cAdvisor) → 자원 제한(CPU / Memory / Disk) → 데이터 영속화(bind mount / volume / tmpfs, 디스크 사용량 제한) → Dockerfile 로 이미지 빌드(instruction → 최적화 → Node.js 실습 → 다양한 빌드 실습)
> 주: 초기 PDF 텍스트 추출본에서는 한글이 누락되어 명령어·코드·구조 위주로 정리했으나, 이후 `pdftotext -enc UTF-8 -layout` 로 한글 원문(슬라이드 문구·강사 음성 설명)을 확인해 '[원문 한글 자료 기반 보강]' 블록 및 본문에 반영했다. 자료에 없는 내용은 '일반 지식' 또는 '자료에 없음'으로 명시했다.

---

# PART A. 컨테이너 리소스 모니터링과 자원 제어 (ch7)

## Step 1. 컨테이너 모니터링 도구 cAdvisor 구축

### [목적]
- 컨테이너가 사용하는 CPU/Memory/Network/Disk 를 눈으로 확인할 수 있는 모니터링 환경을 먼저 만든다. (이후 Step 2~4 의 자원 제한 실습 결과를 cAdvisor UI / htop 으로 확인)

### [이론 설명]
- 모니터링(Monitoring)은 Observability(관찰 가능성)의 일부이다. **Observability = Monitoring + Logging + Tracing + Visualization**. MSA 환경에서 서비스별 Metric(CPU 사용률 등)을 수집/저장/시각화하는 체계가 필요하다.
- Metric 은 시간에 따라 변하는 값이므로 시계열(Time-Series) DB 에 저장한다. 로그는 Elasticsearch(+Kibana), 메트릭은 Prometheus(+Grafana) 조합이 대표적이다.
- **cAdvisor**: Google 이 만든 컨테이너 리소스 사용량/성능 분석 도구. Docker HostOS 의 `/`, `/var/run`, `/sys/fs/cgroup`, `/var/lib/docker`, `/dev/disk` 를 마운트하여 컨테이너 정보를 수집하는 컨테이너(데몬)이다. 수집한 metric 은 Google BigQuery, Elasticsearch, Kafka, Prometheus, Redis 등으로 내보낼 수 있다.
- cAdvisor UI(`http://<IP>:9559`)에서 root(`/`)와 Docker Containers, Subcontainers(`/docker`, `/system.slice`, `/user.slice` 등 cgroup)를 볼 수 있다. Usage Overview 의 CPU / Memory / FS, Processes(User, PID, PPID, CPU%, MEM% …), Usage per Core, Network Throughput 을 제공한다.
- `docker stats` 도 있지만 cAdvisor 는 시간 흐름에 따른 그래프를 제공한다. (강사: 실시간 그래프는 새로운 지표가 아니라 이전 챕터의 `docker stats` 와 동일한 데이터를 cAdvisor 가 그대로 수집해 웹 화면에 차트로 시각화한 것. 강점은 '새로운 정보'가 아니라 텍스트로만 보이던 값을 그래프로 한눈에 파악하게 해주는 데 있다.)
- **Monitoring 슬라이드 원문**: 모니터링은 시간의 흐름에 따른 시스템 및 여러 구성 요소의 동작과 출력 등을 관찰·확인하는 작업을 통해 자원의 효율적인 사용을 식별·평가한다. 모니터링 전략을 세우려면 무엇을, 왜, 어떻게 모니터링해야 하는지 먼저 고려해야 한다. 활용률·처리량 같은 Metric 에 중점을 두고 시스템 전반의 성능을 파악한다(예: 메모리 사용량 급증, 캐시 적중률 감소, CPU 사용량 증가). 다만 애플리케이션 중심의 MSA 같은 복잡한 아키텍처를 진단하기엔 어려움이 있고, 몇 가지 Metric 간의 상관 관계만으로는 애플리케이션 장애 진단에 충분한 정보를 주지 못하므로 **Observability(관찰 가능성 = Monitoring, Logging, Tracing, Visualization)** 도구가 요구된다.
  - 강사 보충: MSA 는 하나의 서비스를 여러 작은 서비스로 쪼개 운영하는 방식이라 CPU 사용률 같은 지표 하나만으로는 '어느 서비스에서 왜' 문제가 생겼는지 알기 어렵다. 공식 표준 Metric 만 해도 대략 3,000개 정도 있어 지표 간 상호관계도 복잡하다. 캐시 적중률(히트율) 감소는 메모리 소비가 많고 회전율이 빠르다는 뜻이며 극단적으로는 메모리 자체가 부족하다는 신호로 해석할 수 있다. 서버 운영에서 CPU 사용량의 맥스(임계)선을 흔히 60% 정도로 잡아 두는데(60% 를 넘으면 곧 100% 에 도달할 수 있으므로) 임계치를 정해 두는 이유는 '문제가 터지기 전에 미리 안다' 는 예방 목적이다.
  - 데이터 저장 도구 구분(강사): Elasticsearch 는 '검색 엔진 DB' 성격(+Kibana 시각화), Prometheus 는 시간에 따라 쌓이는 데이터를 저장하는 '시계열 DB' 성격(+Grafana 시각화).
- **cAdvisor 슬라이드 원문**: Google 에서 제공·관리하는 오픈 소스 컨테이너 모니터링 도구. Docker 컨테이너와 다른 컨테이너 플랫폼에도 기본적으로 지원 가능. Docker HostOS 에서 실행 중인 컨테이너에 대한 정보를 수집하고 해당 데이터를 처리한 후 내보내는 **'단일 컨테이너 데몬'** 으로 구성. 이전 리소스 사용량, 리소스 격리 매개 변수 및 각 컨테이너 머신 전체에 대한 네트워크 통계 등을 기록한다. 각 컨테이너는 독립적인 개별 환경이므로 이를 모니터링해 각 애플리케이션 정보를 수집, 현재의 성능과 개선점을 진단할 수 있고, 애플리케이션에 적절한 CPU 및 메모리 할당이 있는지 알 수 있다. 수집 정보(metric data)는 '전용 웹 인터페이스' 또는 Google Big Query, ElasticSearch, Kafka, Prometheus, Redis 등과 연동 가능. (공식: github.com/google/cadvisor 의 quick-start-running-cadvisor-in-a-docker-container)
  - 강사 보충: 데몬(daemon)은 백그라운드에서 항상 실행되는 프로세스이다. cAdvisor 컨테이너를 실행하기만 하면 별도 등록 절차 없이 같은 호스트에서 도는 **모든 컨테이너가 자동으로 수집 대상에 등록**된다. cAdvisor 는 '호스트 전체 모니터링 도구' 라기보다 '컨테이너 관점의 리소스 모니터링 도구' 로 이해하는 것이 정확하다 (그래도 Subcontainers 목록에 `/docker`, `/system.slice`, `/user.slice`, `/snap.snapd-desktop-integration...` 등 systemd 가 관리하는 cgroup 계층까지 트리로 보여준다).
- 실습 흐름: 이미 `cadvisor`, `local-registry`, `portainer` 가 떠 있는 서버에서 `docker ps` 로 확인 → 처음부터 만든다면 어떤 명령이 필요한지 `docker run` 슬라이드로 확인 → 접속(`http://<서버IP>:9559`) → nginx(`mywebserver`)를 띄워 브라우저로 `Welcome to nginx!` 를 반복 새로고침하면 cAdvisor 의 **Network Throughput 그래프에 트래픽 스파이크**가 실시간으로 나타나는 것을 확인(이 스트림은 표준 Metric 을 출력). 화면의 `eth0` 은 컨테이너 생성 시 네트워크 네임스페이스로 함께 만들어지는 가상 네트워크 인터페이스.
- docker run 옵션 해설(강사 설명): `--volume=/:/rootfs:ro` = 호스트 전체 파일시스템을 읽기 전용으로 마운트해 호스트 자원 정보를 읽음 / `--volume=/var/run/:/var/run:rw` = 도커 런타임 소켓 등에 접근, 컨테이너 목록을 읽어야 하므로 rw / `--volume=/sys/fs/cgroup/:/sys/fs/cgroup:ro` = 컨테이너별 CPU·메모리 사용량이 기록되는 cgroup 정보 / `--volume=/var/lib/docker/:/var/lib/docker:ro` = 이미지·컨테이너 레이어 정보 / `--volume=/dev/disk/:/dev/disk:ro` = 디스크 I/O 정보 / `--privileged`, `--device=/dev/kmsg` = 커널 메시지 등 호스트 수준 정보 접근 권한 / `--publish=9559:8080` = cAdvisor 웹 서버는 컨테이너 내부 8080 에서 뜨고 이를 호스트 9559 로 연결.
- 컨테이너 `--restart=always`, healthy 상태가 되려면 약 1분 정도 `health: starting` 이후 `(healthy)` 로 표시된다.
- 컨테이너 내부 포트는 8080, Host 에는 9559 로 publish 한다 (`--publish=9559:8080`).

### [사용한 CLI]
```bash
# 현재 실행 중 컨테이너 확인 (cadvisor, local-registry, portainer 가 떠 있음)
docker ps

# cAdvisor 실행 (Google 공식 quick-start 방식)
docker run \
  --restart=always \
  --volume=/:/rootfs:ro \
  --volume=/var/run/:/var/run:rw \
  --volume=/sys/fs/cgroup/:/sys/fs/cgroup:ro \
  --volume=/var/lib/docker/:/var/lib/docker:ro \
  --volume=/dev/disk/:/dev/disk:ro \
  --publish=9559:8080 \
  --detach=true \
  --name=cadvisor \
  --privileged \
  --device=/dev/kmsg \
  gcr.io/cadvisor/cadvisor:latest

docker ps -a            # STATUS 가 (health: starting -> healthy) 로 바뀌는지 확인
docker port cadvisor    # 포트 매핑 확인
#  8080/tcp -> 0.0.0.0:9559
#  8080/tcp -> [::]:9559
```
옵션 설명
- `--restart=always` : Docker daemon/호스트 재시작 시 항상 재기동
- `--volume=/:/rootfs:ro` : Host root 를 읽기 전용으로 마운트
- `--volume=/var/run/:/var/run:rw` : 읽기/쓰기 마운트
- `--volume=/sys/fs/cgroup/:/sys/fs/cgroup:ro` : CPU/메모리 cgroup 정보
- `--volume=/var/lib/docker/:/var/lib/docker:ro` : 컨테이너/이미지 정보
- `--volume=/dev/disk/:/dev/disk:ro` : 디스크 I/O 정보
- `--privileged`, `--device=/dev/kmsg` : 호스트 커널 정보 접근
- `--publish=9559:8080` : Host 9559 → 컨테이너 8080
- `--detach=true` : 백그라운드 실행

모니터링 대상 컨테이너 생성 및 확인
```bash
docker run -d --name=mywebserver -p 8001:80 nginx:1.25.0-alpine
docker ps -a
curl localhost:8001
# 브라우저: http://<IP>:8001 (Welcome to nginx!) 접속 후 cAdvisor UI 의 Network Throughput 변화 확인
```

### [확인 방법/주의점]
- 브라우저에서 `http://<IP>:9559` 접속 → Docker Containers 목록에서 컨테이너별 CPU/Memory/Network 확인.
- 포트 9559 는 호스트 쪽 포트이고, 컨테이너 내부는 8080 이다 (`docker port cadvisor` 로 확인: `8080/tcp -> 0.0.0.0:9559`, `8080/tcp -> [::]:9559`). 강사: cAdvisor 공식 문서의 기본 호스트 포트는 8080 이나 8080 처럼 흔히 쓰이는 범용 포트를 호스트에 그대로 노출하면 다른 서비스와 충돌할 가능성이 크므로 'Google' 의 앞글자를 연상시키는 9559 를 선택. 포트 번호 자체에 정해진 규칙은 없으며 충돌을 피하면서 기억하기 쉬운 번호를 고르면 된다.
- **[주의] healthy 지연**: cAdvisor 를 처음 실행하면 `docker ps` 에 잠시 `health: starting` 이 표시되다가 보통 몇 초~1분 이내에 `(healthy)` 로 바뀐다. 시간이 지나도 healthy 로 바뀌지 않으면 볼륨 마운트 등 옵션 설정이 잘못되었을 가능성이 크므로 명령을 다시 점검한다.
- **[실습 습관 팁]** `docker run -p 호스트포트:컨테이너포트` 로 포트를 연결한 뒤 `curl` 로 바로 응답을 확인해 컨테이너가 정상 동작하는지 검증하는 것은 실무에서도 자주 쓰는 확인 습관이다.
- cAdvisor 는 현재 시점 그래프, 장기 보관은 Prometheus + Grafana 가 담당 (Step 2).

---

## Step 2. (선택) Prometheus + Grafana 로 장기 모니터링 (docker compose)

### [목적]
- cAdvisor 가 수집한 metric 을 Prometheus 가 scrape 하여 시계열로 저장하고, Grafana 로 대시보드를 구성한다.

### [이론 설명]
- cAdvisor(컨테이너 metric) + Node Exporter(호스트 metric, 9100) → Prometheus(저장, PromQL 질의, 9090) → Grafana(시각화, 3000).
- Grafana 는 'Container in Docker and System Monitoring' 대시보드(JSON, `container-in-docker-and-system-monitoring.json`)를 가져와 사용한다.
- compose 의 `depends_on` 으로 기동 순서(prometheus → cadvisor/node-exporter, grafana → prometheus)를 정하고, `dockermon` 네트워크로 서비스명(`prometheus`)으로 통신한다.
- Prometheus 는 시계열 데이터이므로 서버 간 시간 동기화(ntpq, rdate 등)가 중요하다. **[주의]** 강사: Prometheus·Grafana 를 사용할 때는 반드시 서버 시간이 동기화되어 있어야 한다. 시간이 맞지 않으면 Grafana 화면에 분홍색 경고 메시지가 뜬다. 먼저 ntpq 나 rdate 같은 도구로 시간 동기화를 해 둘 것을 권장.
- Observability 4요소 (슬라이드 원문): **Monitoring**=인프라 로그 메트릭을 검사하여 작업 및 인사이트를 수행 / **Logging**=특정 시간에 발생한 이벤트 기록 / **Tracing**=추적은 원인 관련 이벤트의 요청 흐름을 캡처하는 데 사용 / **Visualization**=시각화는 이 모든 정보를 차트 등의 시각적 효과를 통해 제시하여 빠른 인사이트 제공. (이 실습의 cAdvisor+Prometheus+Grafana 조합이 Observability 를 구현하는 예)
- **Prometheus**: cAdvisor 같은 도구에서 지표를 주기적으로 가져와(scrape) 시계열 형태로 저장하는 오픈소스 모니터링 도구. **PromQL** 은 그 데이터를 조회하는 전용 쿼리 언어. Prometheus 는 Kubernetes 지표 형식으로도 널리 쓰이며 Docker 전용이 아니라 특정 컨테이너 플랫폼에 종속되지 않는 범용 모니터링·시계열 DB 도구이다. **Grafana** 는 이 데이터를 가져와 보기 좋은 대시보드로 시각화하는 도구로 오픈소스 무료 버전과 별도의 유료(상용) 버전이 있으며 이 강의는 오픈소스 버전을 사용한다.
- **Node Exporter**(포트 9100): 각 호스트(노드)에 설치하는 에이전트로 해당 호스트 시스템의 지표를 수집해 Prometheus 에 제공. 슬라이드 화면: Prometheus Graph 화면(9090), `192.168.56.101:9100` Node Exporter Metrics 화면, Grafana 초기 'Welcome to Grafana' 화면.
- Grafana 대시보드 가져오기(강사): 대시보드를 처음부터 구성할 수도 있지만 다른 사용자가 만들어 공유한 대시보드를 '온라인 ID' 나 JSON 파일 형태로 그대로 가져와 쓸 수도 있다. 실습의 'Container in Docker and System Monitoring'(`container-in-docker-and-system-monitoring.json`)도 그라파나 사이트에서 JSON 을 다운로드해 업로드한 것. 대시보드 구성: Uptime, Containers(4), Disk space, Memory, Swap, Load 게이지 / Network Traffic, CPU Usage, Disk I/O 그래프 / RAM Total(4GiB), CPU Cores(4), SWAP Total(2GiB) / 컨테이너별 FS Usage(cadvisor, grafana, node-exporter, prometheus)와 CPU Usage per Container 누적 그래프.
- `depends_on` 은 컨테이너가 뜨는 순서를 지정(prometheus 는 cadvisor·node-exporter 다음에, grafana 는 prometheus 다음에 시작). 같은 `dockermon` 네트워크를 공유하므로 grafana 컨테이너는 `prometheus` 라는 이름만으로 prometheus 컨테이너에 접속할 수 있다. `docker compose up -d` 한 줄로 네트워크와 컨테이너 여러 개를 한꺼번에 백그라운드로 생성·실행(`docker run` 을 하나씩 실행하는 것보다 관리가 편하다). `docker compose version` → v2.18.1, 실행 시 `Network docker-prometheus_dockermon` 이 먼저 Created 되고 이어 cadvisor, node-exporter 컨테이너가 Creating.
- **[보안 참고]** 슬라이드 compose 의 Grafana 관리자 비밀번호 환경변수(`GF_SECURITY_ADMIN_PASSWORD`)는 교육용 값이 노출되어 있다. 실습 외에는 사용하지 말고 마스킹/변경할 것. 또 `GF_AUTH_ANONYMOUS_ORG_ROLE=Admin` 은 익명 접속에 Admin 권한을 주는 설정이다.

### [사용한 CLI]
디렉터리 구조
```bash
cd fastcampus/ch07/docker-prometheus
# (자료 실제 입력: cd fastcampus/ch07 → ls (docker-prometheus notepad07.txt) → cd docker-prometheus/)
tree
# .
# ├── docker-compose.yaml
# ├── grafana
# │   └── datasource.yml
# └── prometheus
#     └── prometheus.yml
```
docker-compose.yaml
```yaml
version: "3"

networks:
  dockermon:
    driver: bridge

services:
  prometheus:
    container_name: prometheus
    image: prom/prometheus:latest
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - 9090:9090
    networks:
      - dockermon
    depends_on:
      - cadvisor
      - node-exporter

  node-exporter:
    container_name: node-exporter
    image: prom/node-exporter
    ports:
      - "9100:9100"
    networks:
      - dockermon

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    ports:
      - 9559:8080
    restart: always
    volumes:
      - /:/rootfs:ro
      - /var/run/:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    networks:
      - dockermon

  grafana:
    container_name: grafana
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/datasource.yml:/etc/grafana/provisioning/datasources/datasource.yml
    environment:
      #- GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
      - GF_SECURITY_ADMIN_PASSWORD=pass123#
    networks:
      - dockermon
    depends_on:
      - prometheus
```
실행
```bash
docker compose version      # Docker Compose version v2.18.1
docker compose up -d        # docker-compose.yaml 의 서비스 일괄 생성/기동 (-d: 백그라운드)
```

### [확인 방법/주의점]
- 네트워크 `docker-prometheus_dockermon` 과 cadvisor / node-exporter / prometheus / grafana 컨테이너가 생성되는지 확인.
- Prometheus Graph(9090), Node Exporter metric(9100), Grafana(3000) 화면 확인. (prometheus.yml, datasource.yml 의 내용은 자료에 나오지 않음)

---

## Step 3. 호스트 관점 확인: htop 과 리소스 제한 개념

### [목적]
- 컨테이너 자원 제한 실습에서 호스트 CPU 코어별 사용량을 확인할 도구(htop)를 준비하고, 자원 제한의 개념을 잡는다.

### [이론 설명]
- 컨테이너는 기본적으로 Docker HostOS 의 자원을 제한 없이(unlimited) 사용 가능. 한 컨테이너가 자원을 독점하면 다른 컨테이너/호스트에 영향을 준다.
- `docker run`(또는 `create`) 시 CPU, Memory, Disk 에 대해 자원 제한 옵션을 줄 수 있고, 실행 중인 컨테이너는 `docker update` 로 일부 변경할 수 있다.
- htop 은 각 코어를 확인해서 각 프로세스 정보를 좀 더 자세히 보여주는 실시간 모니터링 도구 (강사: 기존 `top` 보다 화면을 시각적으로 보기 편하고 프로세스별 정보가 더 자세해 즐겨 쓴다). htop 단축키(영상 원문 설명):
  - F1 Help: 단축키 기능 확인 / F2 Setup: htop 설정메뉴 / F3 Search: 프로세스 검색 / F4 Filter: 프로세스 필터링(`ps -ef | grep [프로세스]` 와 같은 의미) → 필터링할 키워드 입력 / F5 Tree: 부모-자식 관계 보여줌 → 트리관계로 변화 / F6 Sort: 정렬 → sort by 기준 선택 / F7 Nice(+): 우선순위 올림 / F8 Nice(-): 우선순위 내림 / F9 Kill: 프로세스 종료(`kill -9 [pid]` 와 같은 의미) / F10 Quit: htop 종료. (실행 중인 프로세스를 종료하려면 F9)
  - 화면: 코어별 사용률 게이지(0~3번 코어), Tasks/Load average/Uptime, PID별 CPU%, MEM%, TIME+, Command. cAdvisor 관련 프로세스(`/usr/bin/cadvisor -logtostderr`)도 보인다 — cAdvisor 웹 UI 보다 더 세밀하게 '호스트에서 도는 모든 프로세스' 를 실시간으로 보여주는 도구.
- 부하 생성 도구로 `stress`(자료에서는 `leecloudo/stress:1.0` 이미지)를 사용한다. (JMeter 도 부하 도구로 언급) 오래전부터 쓰여 온 부하 테스트 도구로, 컨테이너 CPU·메모리 사용량을 인위적으로 높인 뒤 cAdvisor·htop 으로 변화를 관찰하고 자원 제한을 거는 실습을 한다.
- 컨테이너 리소스 런타임 제한 슬라이드 원문: `docker run`(or `create`)으로 컨테이너 생성 시 주요 자원(CPU, Memory, Disk)에 대한 자원 할당 조정이 가능하다. 이러한 옵션을 사용하지 않으면 Docker HostOS 의 자원이 제한 없이(unlimited) 사용된다. 따라서 자원 소비 제한을 하지 않으면 상대적으로 다른 컨테이너의 자원 사용에 제한을 주어 전반적인 성능에 영향을 줄 수 있다. 사용 중인 컨테이너에 과도한 자원 사용이 있다면 `docker update` 를 통해 소비 제한을 할 수 있다. (강사: 실제 MSA 환경에서는 각 컨테이너가 그렇게 많은 메모리나 CPU 를 쓰지 않는 경우가 많다. 컨테이너별 적정 사용량을 미리 파악한 뒤 CPU·메모리 사용량을 제한해 두고 운영하길 권장. `docker update` 는 이미 실행 중인 컨테이너를 중단하지 않고 자원 제한값을 바꿀 수 있는 방법이다.)

### [사용한 CLI]
```bash
sudo apt -y install htop    # htop 설치
htop                        # 코어(0~3)별 CPU 사용률, PID/CPU%/MEM%/Command 확인
```

### [확인 방법/주의점]
- htop 에서 cAdvisor 프로세스(`/usr/bin/cadvisor -logtostderr`)를 볼 수 있다.

---

## Step 4. CPU 자원 제어 (--cpu-shares / --cpuset-cpus / --cpus / docker update)

### [목적]
- 컨테이너가 사용할 CPU 를 비율/코어 지정/사용량(%)으로 제한하고, cAdvisor·htop 으로 확인한다.

### [이론 설명]
- 기본 상태: 컨테이너를 별도 옵션 없이 `docker run` 하면 CPU 코어 수/할당 시간(스케줄링)에 제한이 없어 호스트 CPU 를 사실상 무제한으로 쓴다. 실무에서는 특정 컨테이너가 CPU 를 독차지하여 다른 서비스에 영향을 주지 않도록 옵션으로 제어한다.
- CPU 스케줄링: CPU 자원을 어떤 프로세스(컨테이너)에 얼마나 할당할지를 정책으로 만드는 것. 컨테이너 CPU 사용량 제한에는 **CFS(Completely Fair Scheduler)** 를 사용한다. CFS 는 모든 프로세스가 공평하게 CPU 시간을 받도록 하는 **리눅스 커널의 기본 스케줄러(OS 알고리즘)** 이다.
- **Docker 가 스케줄링을 새로 만든 것이 아니다.** `--cpu-shares/--cpuset-cpus/--cpus` 는 가중치·코어·상한값을 커널(CFS)에 넘겨주는 인터페이스일 뿐, 실제 계산은 리눅스 커널이 한다 (대부분의 배포판이 CFS 를 기본 스케줄러로 쓰므로 호환성 문제가 없다). — 강사 강조 포인트.
- 컨테이너 CPU 제한은 3가지 옵션 (슬라이드 원문 기준):

| 옵션 | 의미 (슬라이드 원문) | 입문자 보충 |
|---|---|---|
| `--cpu-shares` | 컨테이너가 사용할 수 있는 CPU 사용 시간에 대한 **가중치**. 기본값 1024. 2048 설정 시 다른 컨테이너에 비해 2배의 사용 시간 할당 | 절대 상한이 아니라 **경합이 있을 때만** 작동하는 상대값. CPU 가 한가하면 shares 가 작아도 100% 다 쓴다 (예: 1024 vs 512 → 약 2:1) |
| `--cpuset-cpus` | 보유한 CPU core# 를 지정하여 컨테이너가 해당 core 만 사용하도록 설정. 예) `0` / `1-2` / `0,2,3`. 번호는 0부터 시작, `,` 는 '그리고', `-` 는 '부터~까지' (`"0,3"` = 1,4번째 코어, `"0-2"` = 1,2,3번째 코어) | 컨테이너를 특정 코어에 고정(pinning). 캐시 경합을 줄이거나 특정 코어만 실험할 때 사용 |
| `--cpus` | 컨테이너가 사용할 수 있는 CPU 사용 비율(%) 지정. 예) `--cpus=0.25` → 지정된 core 수의 25% 사용 가능 | 가장 직관적인 상한값. `1.0` = 코어 1개를 100% 쓸 수 있는 양 |

- **`--cpus` 는 코어별이 아니라 '합산' 비율이다.** 코어 1개만 쓸 수 있는 컨테이너에 `--cpus=0.25` 를 주면 그 코어의 25% 를 쓰지만, 코어 2개를 쓸 수 있는 컨테이너에 같은 값을 주면 '코어당 25%' 가 아니라 '두 코어를 합쳐서 25%' 만 쓸 수 있다. (슬라이드: "여러 개의 CPU 사용 비율 조정인 경우는 각각이 아닌 모든 CPU 에 대한 합산 비율이다.") 실습 [3] 에서 `--cpuset-cpus=0,3` 컨테이너에 `--cpus=0.2` 를 주자 0번/3번 코어가 각각 100% 에서 5.6% / 2.7% 정도로 크게 떨어졌다.
- `--cpuset-cpus` 는 '이 코어들만 써라' 라는 화이트리스트이지 그 안에서 코어별 비중을 정하는 옵션이 아니다. 코어 0,3 을 지정하고 `stress --cpu 2` 를 돌리면 코어 0/3 만 약 100% (cAdvisor 툴팁 Core0 0.977, Core3 0.994), 코어 1/2 는 0 근처.
- `docker update` 는 **컨테이너를 중지하지 않고(재시작 없이)** 이미 실행 중인 컨테이너의 CPU(또는 메모리) 제한값을 즉시 바꾼다. (코어 2번 100% → 18.2%)
- cAdvisor UI(`http://<IP>:9559`) 컨테이너 상세의 **Isolation** 항목에서 CPU Shares(1024 shares), Allowed Cores(0 1 2 3 = 제한 없음), Memory Reservation/Limit(unlimited) 을 확인할 수 있고, Usage per Core 그래프에서 코어별 사용량(Core 0~3)을 본다. 그래프의 한 시점을 클릭하면 툴팁으로 코어별 값이 나온다.
- htop: 리눅스 프로세스를 실시간으로 보여주는 터미널 도구. 상단 막대 = 코어별(0,1,2,3) 사용률, 하단 표 = PID/CPU%/Command 정렬 프로세스 목록. 실습 내내 켜 두고 컨테이너 생성/삭제 때마다 코어 사용률 변화를 관찰한다.
- `stress` 는 CPU 제어 옵션이 실제로 동작하는지 확인하려고 인위적으로 부하를 만드는 **실습용 테스트 도구**이지 운영 환경에서 서비스 컨테이너에 넣는 명령이 아니다. (`leecloudo/stress:1.0` 은 stress 명령이 들어 있는 미리 만들어 둔 테스트 이미지)
- 실습용 stress 컨테이너는 `docker stop` 후 `docker rm` 해야 정리된다. (stop 하면 Exited(137) 상태로 `docker ps -a` 에 남음 — stop 만 하면 껍데기가 남으므로 rm 까지 하는 습관)

### [사용한 CLI]
```bash
# [1] --cpu-shares : 두 컨테이너가 CPU 경쟁 시 1024:512 비율로 배분
docker run -d --name cpu_1024 --cpu-shares 1024 leecloudo/stress:1.0 stress --cpu 4
docker run -d --name cpu_512  --cpu-shares 512  leecloudo/stress:1.0 stress --cpu 4

ps -auxf | grep stress      # 프로세스별 %CPU 확인 (cpu_1024 쪽이 약 2배)
docker ps                   # 컨테이너 실행 확인

docker stop cpu_512
docker ps -a                # Exited (137) 확인
docker rm cpu_512 cpu_1024
```
```bash
# [2] --cpuset-cpus : 특정 코어에 고정
docker run -d --name cpuset_1 --cpuset-cpus=2 leecloudo/stress:1.0 stress --cpu 1
#  → htop 에서 3번째 코어(인덱스 2)만 100%, cAdvisor Usage per Core 에서 Core 2 가 1.0

docker stop cpuset_1 && docker rm cpuset_1     # (자료에서는 각각 실행)

docker run -d --name cpuset_2 --cpuset-cpus=0,3 leecloudo/stress:1.0 stress --cpu 2
#  → Core 0, Core 3 이 각각 약 100% (cAdvisor 0.977 / 0.994)
docker stop cpuset_2
docker rm cpuset_2
```
```bash
# [3] --cpus : 실행 중인 컨테이너의 CPU 사용량을 docker update 로 20% 로 제한
docker run -d --name cpuset_1 --cpuset-cpus=2 leecloudo/stress:1.0 stress --cpu 1
docker update --cpus=0.2 cpuset_1       # htop 에서 코어 2 사용률 100% → 약 18.2%
docker stop cpuset_1
docker rm cpuset_1

# 코어 2개(0,3)를 쓰는 컨테이너에 --cpus=0.2 를 주면 코어당 사용률이 낮게 분산됨 (코어 하나가 20% 가 되는 것이 아님)
docker run -d --name cpuset_2 --cpuset-cpus=0,3 leecloudo/stress:1.0 stress --cpu 2
docker update --cpus=0.2 cpuset_2

# (치트시트 템플릿) 실행 시점에 바로 CPU 사용 비율 지정 (예: 0.25 = 코어 1개 기준 25%)
docker run -d --name <이름> --cpus=<비율> <이미지> <명령>
```

### [확인 방법/주의점]
- `htop`: 코어별 CPU%, `ps -auxf | grep stress`: 프로세스별 %CPU, cAdvisor(`http://IP:9559`): Usage per Core / Isolation.
- `--cpu-shares` 는 경쟁 상황에서만 비율이 반영된다. 비율은 **정확히 2배가 아니라 '절반 아래' 정도**로 흔들린다 (강사 설명: 실제로 여러 번 테스트하면 512 컨테이너가 3초 정도만 CPU 시간을 받은 적도 있다. 슬라이드 ps -auxf 결과: cpu_1024 쪽 stress 프로세스 %CPU 69.9/73.0/72.6/84.5, cpu_512 쪽 68.2/63.6/15.2/75.4 처럼 프로세스별로 들쭉날쭉하고, TIME+ 도 cpu_1024 쪽이 0:49~1:00, cpu_512 쪽이 0:03~0:17 로 훨씬 짧다 — 호스트 부하 상태에 따라 편차). 4코어 호스트에서 `stress --cpu 4` 를 두 개 돌리므로 사실상 8코어 분량의 부하를 4코어에 몰아넣는 셈이다.
- **[실무 팁/주의] 실습 중 호스트 전체가 느려지거나 멈칫할 수 있다.** 강사 환경에서는 부하가 너무 심해 cAdvisor 웹 UI 의 CPU 지표조차 제때 그려지지 않을 정도였다. 따라 할 때는 `--cpu` 값이나 동시에 띄우는 컨테이너 수를 낮추어 가볍게 시도하고, 확인이 끝나면 바로 `docker stop`/`docker rm` 으로 정리한다.
- `--cpuset-cpus` 로 지정한 코어 외에는 0 에 가깝게 유지된다.
- 동일 이름 컨테이너를 다시 만들려면 먼저 `docker rm` 필요.
- `docker ps` 결과에서 이번 실습과 무관하게 항상 떠 있는 컨테이너(mywebserver, cadvisor, local-registry, portainer)를 구분해서 읽는다.

---

## Step 5. Memory 자원 제어 (--memory / --memory-reservation / --memory-swap / OOM)

### [목적]
- 컨테이너가 사용할 메모리(RAM)와 swap 을 제한하고, 한도 초과 시 OOM Kill 동작을 확인한다.

### [이론 설명]
- 왜 메모리 제한이 필요한가 (슬라이드): 메모리는 프로세스들의 작업 공간이다. Docker HostOS 의 총 메모리 양과 작업에 사용될 예상 메모리 크기를 사전에 파악하여 메모리 최적화를 유지해야 한다. 특정 컨테이너가 과도한 메모리를 쓰면 메모리 부족(OOM, Out Of Memory)으로 다른 컨테이너의 프로세스가 예기치 않게 강제 종료될 수 있다. 리눅스 커널은 메모리가 부족해지면 **OOM Killer** 가 '가장 메모리를 많이 쓰는 프로세스'를 강제로 죽여 시스템을 살린다. OOM Killer 가 프로세스를 kill 하지 못하도록 보호하는 옵션이 `--oom-kill-disable` 이다 (개념 슬라이드에서 소개만 하며 실습은 없음). 더 나아가 컨테이너들의 과도한 메모리 사용으로 **Docker Daemon 자체가 커널에 의해 강제 종료되면 해당 호스트의 전체 컨테이너 서비스에 영향**을 준다. (참고: docs.docker.com/config/containers/resource_constraints/)
- 강사 경고(실무 경험): 메모리 부족은 프로세스 하나가 죽는 데서 끝나지 않고 컨테이너 장애, 나아가 서비스 장애 수준까지 번질 수 있다. 실제로 과도한 메모리 사용으로 Docker Daemon 이 강제 종료되어 호스트의 모든 컨테이너가 한꺼번에 정지된 적이 있다고 한다. `--oom-kill-disable` 같은 방어책을 걸어도 메모리 사용량 자체가 과도하면 근본 해결이 되지 않으므로 **'메모리 양은 항상 적정량으로 유지하라'** 가 핵심 원칙이다. 과부하 테스트를 직접 하나씩 실행해 보며 '왜 죽는지' 이유를 정확히 이해하는 것이 중요하다.
- 옵션 3가지 (슬라이드 원문)
  - `--memory`(`-m`) : (hard limit) 컨테이너가 사용하는 최대 메모리 사용량 제한. 설정 값을 초과해서 사용하면 OOM 발생. 최소 6MB. (강사: 6MB 는 사실상 애플리케이션이 동작하기엔 아쉬운 값. 특히 DB 처럼 데몬 자체 메모리가 큰 앱은 최소 용량만으로는 운영이 어렵다.)
  - `--memory-reservation` : (soft limit) Docker 가 contention(경합)을 감지하거나 HostOS 의 메모리 가용률이 현저히 떨어지는 경우 활성화되어 최소한의 보장 값으로 사용. 예) `-m=1g --memory-reservation=500m` → 최대 1g 까지 사용 가능하고 적어도 500m 사용은 보장.
  - `--memory-swap` : 컨테이너가 사용할 수 있는 swap memory 사용량 제한(`-1` 은 무제한). 값은 '물리 메모리 + swap 합계' 이므로 `--memory` 보다 작을 수 없다. `-m=300m` 설정 시 자동으로 `--memory-swap=600m` 이 설정되며(= 따로 지정하지 않으면 `--memory` 의 2배가 기본), 전체 600m 에서 `-m` 값을 뺀 나머지(300m)만큼 swap 이 사용된다. (예: `-m=1g` → MemorySwap 2GB)
  - `--memory-swap` 을 `--memory` 와 동일하게 주면 swap 을 쓰지 않는다. (실습4 에서 확인: swap 여유가 없어 OOM 이 더 쉽게 발생)
- 하드리밋은 '절대 넘을 수 없는 최대치', 소프트리밋은 '평소엔 넘어도 되지만 메모리가 빠듯해지면 다시 끌어내리는 최소 보장치' 로 이해하면 쉽다.
- 가상 메모리(swap): 실제 디스크나 파일로 구성된 영역으로, 프로세스가 곧바로 작업할 수 있는 공간이 아니라 메모리가 부족할 때 프로세스 데이터를 잠시 '대기' 시켜 두는 영역이다. 메모리가 부족해 데이터가 swap 으로 밀려나는 것(swap-out)과 다시 메모리로 돌아오는 것(swap-in)을 vmstat 의 si/so 컬럼으로 볼 수 있으며, 이 값은 **0 에 가깝게 유지되는 게 가장 좋다**. si/so 가 계속 발생한다면 호스트 물리 메모리가 부족해 swap 을 자주 쓰고 있다는 신호이므로 메모리 증설이나 컨테이너 메모리 제한 조정을 고려한다.
- `vmstat 2 5` : 2초 간격으로 5번 시스템 상태 출력. memory 의 free = 남은 메모리(KB), buff/cache = 커널이 캐시로 쓰는 메모리, swap 의 si/so = 0 이면 swap 을 전혀 쓰지 않는 여유로운 상태. 실습 시작 전에 호스트 여유 메모리를 먼저 확인하는 습관.
- `docker inspect` 는 바이트 단위로 출력한다 (1073741824 = 1GB, 209715200 = 200MB, 314572800 = 300MB, 629145600 = 600MB). 1073741824 를 1024 로 세 번 나누면(byte→KB→MB→GB) 정확히 1 (강사가 `bc` 계산기로 검증). cAdvisor 의 Reservation unlimited / Limit 1.00 GB / Swap Limit 2.00 GB 와 일치.
- MySQL 같은 DB 는 6MB 로 제한하면 기동 실패(Exited(1))하므로, `docker update` 로 한도를 올린 뒤 `docker start`. 이 과정이 컨테이너를 삭제 후 재생성하지 않고도 실행 중/정지된 컨테이너의 리소스 한도를 바꾸는 방법이다. 강사 측정: MySQL 데몬은 최소 200MB 정도는 있어야 그나마 동작하고, INSERT/UPDATE 같은 작업 부하까지 걸리면 더 큰 메모리가 필요하다. docker update 로 CPU·메모리·디스크 같은 리소스를 조정하는 방식은 실무에서 꽤 자주 쓰인다.

### [사용한 CLI]
```bash
# 호스트 메모리 상태 확인 (2초 간격 5회)
vmstat 2 5
docker ps
```
```bash
# [1] --memory : 1GB hard limit
docker run -d --memory=1g --name=nginx_mem_1g nginx
docker inspect nginx_mem_1g | grep -i memory
#  "Memory": 1073741824,
#  "MemoryReservation": 0,
#  "MemorySwap": 2147483648,      # --memory 의 2배 (기본)
#  "MemorySwappiness": null,
bc                                # 1073741824/1024/1024/1024 = 1 (GB 환산)
# cAdvisor: nginx_mem_1g 의 Memory Limit 1.00 GB, Swap Limit 2.00 GB 확인
```
```bash
# [2] --memory-swap : 메모리 200MB + swap 100MB (합계 300MB)
docker run -m=200m --memory-swap=300m -itd --name=mem-test ubuntu:14.04
docker inspect mem-test | grep -i memory
#  "Memory": 209715200, "MemorySwap": 314572800
```
```bash
# [3] docker update : 너무 작게(6MB) 줘서 죽은 MySQL 컨테이너의 한도 변경
docker run -itd --memory=6m --name=mydb -e MYSQL_ROOT_PASSWORD=pass123# mysql:5.7-debian
docker ps -a | grep mydb          # Exited (1)
docker logs mydb                  # "mysqld failed while attempting to check config"

docker update --memory=300m --memory-swap=600m mydb
docker start mydb
docker ps -a | grep mydb          # Up
docker inspect mydb | grep -i memory
#  "Memory": 314572800, "MemorySwap": 629145600
```
```bash
# [4] stress 로 OOM Kill 확인 (--rm: 종료 시 자동 삭제)
#  stress 옵션: --vm 1(메모리 worker 1개), --vm-bytes(할당량), -t 10s(10초 실행)

# (1) --memory=200m --memory-swap=200m (swap 없음)
docker run -it --rm --memory=200m --memory-swap=200m leecloudo/stress:1.0 stress --vm 1 --vm-bytes 250m -t 10s   # FAIL: worker got signal 9 (OOM Kill)
docker run -it --rm --memory=200m --memory-swap=200m leecloudo/stress:1.0 stress --vm 1 --vm-bytes 150m -t 10s   # 성공
docker run -it --rm --memory=200m --memory-swap=200m leecloudo/stress:1.0 stress --vm 1 --vm-bytes 200m -t 10s   # FAIL

# (2) --memory=200m 만 지정 (swap 기본 = 200m, 합계 400m)
docker run -it --rm --memory=200m leecloudo/stress:1.0 stress --vm 1 --vm-bytes 150m -t 10s   # 성공
docker run -it --rm --memory=200m leecloudo/stress:1.0 stress --vm 1 --vm-bytes 250m -t 10s   # 성공 (swap 사용)
docker run -it --rm --memory=200m leecloudo/stress:1.0 stress --vm 1 --vm-bytes 300m -t 10s   # 성공
docker run -it --rm --memory=200m leecloudo/stress:1.0 stress --vm 1 --vm-bytes 400m -t 10s   # FAIL (합계 400m 도달)
```

### [확인 방법/주의점]
- `docker inspect <컨테이너> | grep -i memory` 로 Memory / MemoryReservation / MemorySwap 값(바이트) 확인, cAdvisor 에서 Limit / Swap Limit 확인.
- `docker logs` 로 기동 실패 원인 확인. 너무 작은 한도(6MB)는 DB 기동 실패의 원인.
- swap 을 쓰지 않으려면 `--memory-swap` 을 `--memory` 와 같게 지정.
- 실습4 결과 해석(슬라이드/강사 설명): stress 의 `--vm 1`(메모리를 채우는 worker 프로세스 1개), `--vm-bytes`(채울 메모리 크기), `-t 10s`(10초 실행)로 인위적 과부하를 만드는 테스트 도구. 실패 시 `worker N got signal 9` 는 리눅스 커널 OOM Killer 가 SIGKILL 로 프로세스를 강제 종료한 것. `--memory=200m --memory-swap=200m`(swap 여유 0)은 150m 만 성공하고 200m·250m 요청은 모두 실패, `--memory=200m` 만 지정(기본 swap → 총 한도 400m)은 150m/250m/300m 성공, 총 한도를 넘는 400m 요청에서만 실패. `--memory-swap` 을 넉넉히(또는 기본값으로) 두면 물리 메모리를 넘는 부분을 swap 이 받아주지만, `--memory` 와 동일하게 맞추면 swap 여유가 없어 OOM 이 더 쉽게 발생한다.
- MySQL 6MB 실습의 `docker logs mydb` 에는 `mysqld failed while attempting to check config` 에러가 남는다. `docker update` 직후에는 아직 Exited(1) 상태이고 `docker start mydb` 후 Up 이 되며, `docker inspect` 에서 Memory 314572800(300MB)/MemorySwap 629145600(600MB) 를 확인한다.
- 슬라이드 상단 헤더/리본이 'CPU 자원 소비 제어' 로 표기된 곳은 강의자료 제목 표기 오류이며 내용은 Memory 실습이다.
---

## Step 6. Disk 자원 제어 (Block I/O : --device-write-bps / --device-write-iops / --blkio-weight)

### [목적]
- 컨테이너의 Disk I/O(처리량 MBPS, 초당 I/O 횟수 IOPS)를 제한하고 iostat 과 dd 로 확인한다.

### [이론 설명]
- 슬라이드 요지(컨테이너 Disk 리소스에 대한 런타임 제한): (1) Docker image 는 기본적으로 Docker Host 의 공간을 사용하므로 **지속적인 사용량 관찰**이 요구된다. (2) 컨테이너 I/O 제한을 설정하지 않으면 컨테이너 내부 I/O bandwidth(대역폭)에 제한이 없으므로 옵션으로 Block I/O 제한이 필요하다. (3) 단, **Direct I/O 의 경우에만 Block I/O 가 제한되며 Buffered I/O 는 해당되지 않는다.**
- 강사 보충: 이미지를 pull 하면 `/var/lib/docker` 영역에 저장되고, 컨테이너를 만들 때마다 그 이미지의 스냅샷(복제본) 위에서 운영된다. 같은 이미지로 컨테이너를 여러 개 띄울수록 공간이 계속 늘어나 `/var/lib/docker` 전체 용량도 관찰 대상이 된다. 컨테이너가 디스크를 과도하게 쓰면 호스트·다른 컨테이너 성능에 영향을 주므로 `df` 로 주기적으로 점검한다.
- Block I/O: 디스크(블록 장치) 단위 입출력. **Direct I/O** 는 OS 캐시(메모리)를 거치지 않고 바로 디스크에 읽고 쓰는 방식, **Buffered I/O** 는 먼저 OS 캐시에 쓴 뒤 나중에 디스크에 반영되는 방식이다. Buffered 로 테스트하면 캐시 속도가 섞여 제한 효과를 정확히 측정할 수 없으므로 `dd` 테스트에 `oflag=direct` 를 사용한다.
- 디스크 Block I/O 제한은 디스크 성능 지표인 **IOPS 와 MBPS** 에 따른다. 옵션:

| 옵션 | 의미 (슬라이드 원문) |
|---|---|
| `--blkio-weight`, `--blkio-weight-device` | Block I/O 의 할당량(Quota)을 10~1000 으로 설정. 기본값 500 (절대 속도 제한이 아니라 컨테이너 간 우선순위를 정하는 **상대 비중**) |
| `--device-read-bps`, `--device-write-bps` | 특정 Device 에 MBPS 제한. 초당 Block throughput(처리량). `b, kb, mb, gb` 단위로 제한 |
| `--device-read-iops`, `--device-write-iops` | 특정 Device 에 IOPS 제한. 초당 Block I/O 횟수. 0 이상의 정수로 표기 |

- `--device-*-bps/iops` 는 특정 device(예: `/dev/sdb`)에 대해 **절대 상한**(초당 몇 MB / 몇 번)을 거는 옵션이고, `--blkio-weight` 는 상대 비중이다. 이번 실습은 `--device-write-bps`, `--device-write-iops` 를 직접 사용한다.
- IOPS(IO Per Second, 초당 I/O 횟수)와 MBPS(MB Per Second, 초당 처리량)를 묶어 디스크의 '대역폭'이라 부른다. **초당 데이터 전송량 = IOPS × 블록크기**. 같은 IOPS 라도 블록 크기에 따라 처리량이 달라진다.
- 실무 IOPS 감각(강사): IOPS 는 디스크가 처리하는 '트랜잭션 속도'와 같다. 트랜잭션이 많은 서비스(금융권 등)는 IOPS 를 넉넉히(클라우드 디스크는 최대 약 10만 IOPS 까지 지원하는 경우가 많음), 트랜잭션이 적은 일반 서비스는 평범한 수준으로 잡아도 충분하다. 컨테이너 단위로 `--device-write-iops` 를 걸 때도 그 위에서 도는 애플리케이션의 트랜잭션 특성을 먼저 파악하고 값을 정한다.
- 자료의 실습 환경은 Docker 저장 디스크(`/var/lib/docker`)가 `/dev/sdb` 이다 (장치명은 환경에 맞게).
- 참고: 이 강의자료의 슬라이드 상단 제목은 이전 챕터(CPU) 템플릿을 그대로 써서 'CPU 자원 소비 제어' 로 표기된 부분이 있으나 자료 표기 오류이며 내용은 Disk 실습이다.

### [사용한 CLI]
```bash
# iostat 설치 및 모니터링 (2초 간격으로 반복 출력)
sudo apt install sysstat
iostat 2 100          # 2초 간격 100회 (예제에서는 iostat 2 1000 도 사용). tps, kB_read/s, kB_wrtn/s 확인
```
```bash
# [1] MBPS 제한 : --device-write-bps
# (기준) 제한 없음
docker run -it --rm ubuntu:14.04 bash
dd if=/dev/zero of=blkmb.out bs=1M count=10 oflag=direct     # 컨테이너 안에서 10MB direct write
exit

# 1MB/s 제한
docker run -it --rm --device-write-bps /dev/sdb:1mb ubuntu:14.04 bash
dd if=/dev/zero of=blkmb.out bs=1M count=10 oflag=direct     # 약 10초, 1.0 MB/s

# 10MB/s 제한
docker run -it --rm --device-write-bps /dev/sdb:10mb ubuntu:14.04 bash
dd if=/dev/zero of=blkmb.out bs=1M count=10 oflag=direct     # 약 1초, 10.3 MB/s
```
```bash
# [2] IOPS 제한 : --device-write-iops
docker run -it --rm ubuntu:14.04 bash
dd if=/dev/zero of=blkio.out bs=1M count=10 oflag=direct     # 제한 없음 (수십 MB/s ~ GB/s)

docker run -it --rm --device-write-iops /dev/sdb:10 ubuntu:14.04 bash
dd if=/dev/zero of=blkio.out bs=1M count=10 oflag=direct     # 초당 10 I/O → 약 5.5 MB/s

docker run -it --rm --device-write-iops /dev/sdb:1 ubuntu:14.04 bash
dd if=/dev/zero of=blkio.out bs=1M count=10 oflag=direct     # 초당 1 I/O → 283 kB/s
```
옵션 설명: `dd if=/dev/zero of=파일 bs=1M count=10 oflag=direct` = 0 으로 채운 1MB 블록 10개(10MB)를 page cache 를 거치지 않고 직접 기록.

### [확인 방법/주의점]
- 호스트에서 `iostat 2 100` 을 띄우고 해당 디스크(sdb)의 kB_wrtn/s 를 관찰. (`2` = 2초 간격, `100` = 100회 반복. tps = 초당 전송 횟수, kB_read/s·kB_wrtn/s = 초당 읽기/쓰기 kB. loop0~loop18 은 Docker 등이 쓰는 loopback 장치라 대부분 0 이고 실제 물리 디스크 sdb 에서 쓰기가 발생한 것을 볼 수 있다. iostat 은 `sysstat` 패키지에 포함.) 강사 팁: 프로세스/CPU 를 보는 htop 대신 디스크 I/O 자체를 보려면 iostat 을 켜 놓고 실습한다.
- 제한 없음 대비 `dd` 결과 속도(MB/s)·소요 시간으로 제한 효과 확인.
- 실측값은 환경에 따라 매번 달라진다. 슬라이드 예시 vs 라이브 실행 결과(영상 캡처 기준):
  - bps 실습 — 제한 없음: 슬라이드 813 MB/s(0.0128923 s) / 라이브 67.0 MB/s(0.156518 s), `:1mb`: 슬라이드 1.0 MB/s(10.0274 s) / 라이브 1.0 MB/s(10.0177 s), `:10mb`: 슬라이드 10.3 MB/s(1.01432 s) / 라이브 10.4 MB/s(1.00534 s).
  - iops 실습 — 제한 없음: 슬라이드 1.0 GB/s(0.0102204 s) / 라이브 27.1 MB/s(0.386325 s), `:10`: 슬라이드 5.5 MB/s(1.90632 s) / 라이브 5.5 MB/s(1.9046 s), `:1`: 슬라이드 283 kB/s(37.0094 s) (3번째는 시간 관계상 라이브로 실행하지 않고 슬라이드 수치로만 설명).
  - 강사 설명: 같은 실습도 다른 데스크탑에서 돌리면 1GB/s 가 나오기도 하고 800MB/s 가 나오기도 한다. 중요한 것은 절대 수치가 아니라 '제한 없음 → 제한 적용' 으로 바뀔 때 지정한 값 근처로 확실히 떨어지는지다. 컨테이너 ID 도 매번 새로 생성되어 달라진다.
- 슬라이드 공식: **초당 데이터 전송량 = IOPS × 블록크기(단위 데이터 용량)**. dd 가 `bs=1M` 으로 쓰므로 `--device-write-iops /dev/sdb:10` 이면 이론상 최대 약 10MB/s 근처이며 실습에서는 5.5 MB/s 로 확인했다. `--device-write-bps` 가 '용량 기준' 제한이라면 `--device-write-iops` 는 '횟수 기준' 제한이라는 차이를 기억한다.
- `oflag=direct` 를 빼면 Buffered I/O 라 제한이 적용되지 않는다.
- Docker 이미지 pull 시 `/var/lib/docker` 가 있는 디스크를 사용하므로 용량에 유의.

---

# PART B. 데이터 지속성과 Docker volume (ch8)

## Step 7. Docker 가 제공하는 3가지 mount 방식 이해

### [목적]
- 컨테이너 삭제 시 데이터가 사라지는 문제를 해결하기 위해 Docker 의 volume 기술(bind mount / docker volume / tmpfs mount)을 이해한다.

### [이론 설명]
- 컨테이너 파일시스템은 컨테이너를 지우면 같이 사라진다. 중요한 데이터(DB 데이터, 로그, 설정)는 컨테이너 밖(Host)에 두어 영속화(Persistent)해야 한다.
- 3가지 방식

| 방식 | 저장 위치 | 특징 |
|---|---|---|
| bind mount | Host 의 임의 경로(Host area) | 사용자가 지정한 호스트 디렉터리/파일을 컨테이너에 연결. `docker stop/rm` 해도 호스트 데이터는 유지 |
| docker volume | Docker 영역(`/var/lib/docker/volumes/<이름>/_data`) | Docker 가 관리(CLI/API). 볼륨 플러그인(예: vieux/sshfs)으로 원격 저장소도 가능 |
| tmpfs mount | Host 메모리(Memory) | 컨테이너 종료 시 사라짐. 영속 데이터 아님 (Linux 에서만) |

- `/var/lib/docker` 는 root 소유(`drwx--x---`)이므로 일반 사용자는 직접 접근 불가(`sudo su -`). bind mount 는 호스트의 사용자 디렉터리를 쓰므로 접근이 편함.
- bind mount 는 디렉터리뿐 아니라 파일 단위도 가능.
- **[원문 한글 자료 기반 보강 — Ch8 Clip1 'Docker 제공, volume 기술 이해']**
  - volume 기술의 의미: 컨테이너 내부 데이터는 기본적으로 컨테이너의 생명 주기와 함께한다(컨테이너 삭제 시 데이터도 삭제). volume 기술은 이를 해결하는 메커니즘으로, volume 은 독립적으로 유지되어 데이터를 지속적(Persistent)으로 보존한다. Docker HostOS 와 컨테이너 **양쪽에서 직접 접근**할 수 있다. 목적은 **"공유"와 "보존"** 두 가지.
  - 강사 예시: nginx 웹 소스 경로(`/usr/share/nginx/html`)를 volume 으로 연결해 두면 컨테이너에 접속하지 않고도 호스트 디렉터리에 웹 소스 파일을 넣는 것만으로 컨테이너에 반영된다.
  - 3가지 방식(Docker docs 인용 다이어그램): bind mount = 호스트 파일시스템의 특정 경로를 컨테이너에 직접 연결 / volume = Docker 가 관리하는 영역(`/var/lib/docker`, 그림의 "Docker area")에 저장 / tmpfs mount = 호스트 메모리에만 임시 저장(파일시스템에 기록되지 않음).
  - **bind mount 원문**: 디렉터리뿐 아니라 파일도 mount 가능하며 `"호스트 파일시스템 절대경로":"컨테이너 내부 경로"` 형식. 연결할 파일/디렉터리를 사용자가 **미리 만들어 두면 그 호스트 소유자 권한 그대로** 연결되고, 존재하지 않으면 컨테이너 실행 시 자동 생성되지만 **root 소유**가 된다. 컨테이너를 제거하면 bind mount 연결은 자동 해제되지만 호스트의 디렉터리와 데이터(file)는 그대로 보존된다. 파일 대 파일 연결도 가능(호스트에서 곧바로 내용 확인 — Step 8 에서 실습).
  - 왜 root 소유인가(강사): Docker 는 컨테이너 가상화 특성상 동작에 root 권한이 필요하므로, 실습 계정(kevin)으로 설치했어도 `/var/lib/docker` 이하 전체는 기본적으로 root 소유이다. 그래서 호스트 경로를 미리 만들지 않으면 자동 생성 디렉터리도 root 소유가 된다.
  - `/var/lib/docker` 구조(자료 `ll` 출력): `buildkit/`, `containers/`, `engine-id`, `image/`, `network/`, `overlay2/`, `plugins/`, `runtimes/`, `swarm/`, `tmp/`, `volumes/` (volumes 는 `drwx-----x`).
  - **docker volume 원문**: Docker 에서 **권장하는 방법**. `docker volume create 볼륨명` 으로 생성. Docker CLI 와 Docker API 로 사용 가능. Docker root 디렉터리(`/var/lib/docker`) 영역에 volume 영역을 만들어 컨테이너 내부 경로와 연결·공유(`/var/lib/docker/volumes/<볼륨명>/_data/`). 볼륨 드라이버(vieux/sshfs plugin 등)를 쓰면 원격 호스트·클라우드에 저장하거나 **암호화**도 가능. 새 볼륨이 될 영역에 데이터를 미리 채워 두고 연결하면 컨테이너가 바로 그 데이터를 사용할 수 있다. 강사: bind mount 보다 한 단계 더 추상화된(상위) 개념 — 이름만 주면 Docker 가 경로를 관리.
  - **tmpfs 원문**: Docker hostOS 의 Memory 에서만 데이터가 지속되고, 컨테이너가 중지되면 연결 해제와 함께 데이터도 사라진다. **컨테이너 간 공유 설정이 되지 않으며 Linux 기반 Docker 에서만 지원**. 임시로 쓰거나 기록되지 않아야 하는 파일·데이터에 유용(호스트 영역 및 컨테이너 write 영역에 기록되지 않음).
  - **선택 기준(강사)**: 실무에서는 bind mount 와 docker volume 을 가장 많이 쓴다. "경로를 누가 관리하는가" — 내가 호스트 경로를 직접 지정·관리하려면 bind mount, Docker 가 경로를 관리하거나 원격/클라우드 연동·암호화 등 부가 기능이 필요하면 docker volume.
  - 셀프 체크(원문): 컨테이너 삭제 시 데이터가 사라지는 이유 / bind mount·volume 각각의 호스트 저장 경로 / volume 이 권장 방식인 이유 / tmpfs 가 근본적으로 다른 점 / `docker rm` 후 bind mount 호스트 데이터의 운명(보존).

### [사용한 CLI]
```bash
# Docker 영역 확인 (root 필요)
sudo su -
cd /var/lib/docker/
ll        # buildkit, containers, image, network, overlay2, plugins, volumes ... 

# bind mount
docker run .. -v /my-host:/app ..
docker run .. --mount type=bind,source=${PWD}/mydata,target=/var/log ..

# docker volume
docker volume create my-volume
docker run .. -v my-volume:/app ..
docker run .. --mount source=my-volume,target=/app ..

# tmpfs mount
docker run .. --tmpfs /var/www/html ..
docker run .. --mount type=tmpfs,destination=/var/www/html ..
```
옵션 설명
- `-v <호스트경로>:<컨테이너경로>` : bind mount (경로가 `/` 또는 `${PWD}` 등 경로 형태)
- `-v <볼륨명>:<컨테이너경로>` : docker volume
- `--mount type=bind,source=,target=` / `--mount source=,target=` / `--mount type=tmpfs,destination=` : 명시적 형식
- `--tmpfs <경로>` : 메모리 mount

### [확인 방법/주의점]
- docker volume 은 `/var/lib/docker/volumes/<볼륨명>/_data/` 에 실제 데이터가 존재.
- `docker stop`, `docker rm` 은 bind mount 된 호스트 데이터를 삭제하지 않는다.
- tmpfs 는 컨테이너 종료 시 데이터가 사라진다.

---

## Step 8. Bind mount 방식 실습

### [목적]
- 호스트 디렉터리/파일을 컨테이너에 연결하는 bind mount 를 사용해 데이터·설정·히스토리·시간대를 공유한다.

### [이론 설명]
- `docker run -v 호스트경로:컨테이너경로` 로 지정. 컨테이너 안에 해당 경로가 없으면 자동 생성된다.
- 기본은 읽기/쓰기(rw). `:ro` 를 붙이면 읽기 전용(쓰면 "Read-only file system").
- 용도: (1) 디렉터리 공유 (2) 설정 파일 주입 (redis.conf 의 `requirepass`) (3) 파일 단위(.bash_history) (4) 호스트 설정 파일(/etc/localtime)로 시간대 맞추기.
- `${PWD}` 는 현재 경로(`$(pwd)` 와 유사)로, 절대경로가 필요한 -v 옵션에서 사용.
- 시간대: 컨테이너는 기본 UTC. 호스트의 `/etc/localtime` 을 bind mount 하면 KST 로 표시. Dockerfile 에서는 `ENV TZ`+`ln -snf` 로도 가능.
- **[원문 한글 자료 기반 보강 — Ch8 Clip2 '[실습] Bind mount 방식']**
  - 실습 구성 4개: (1) bind mount 연결 이해(디렉터리 2개, `df -ha`, `docker inspect`, ro/rw) (2) 설정 파일 공유(redis.conf) (3) file bind mount(.bash_history) (4) 시간 동기화(/etc/localtime).
  - 실습1: `${PWD}`(셸이 이미 가진 환경변수) 와 `$(pwd)`(pwd 명령 실행 결과를 치환)는 결과가 같다. `ubuntu:14.04` 에는 `/bind01`, `/bind02` 가 원래 없지만 **bind mount 대상 경로가 컨테이너에 없으면 Docker 가 자동 생성**한다. 컨테이너 안 `df -ha` 에서 `/dev/sda1` 이 xfs 로 두 경로에 mount 된 것이 보이고, `mount | grep bind` 와 호스트에서 만든 파일이 컨테이너 안에서 그대로 보이는 것을 확인한 뒤 `docker inspect --format="{{ .HostConfig.Binds }}"` 로 목록 조회. 마지막에 `docker stop`/`docker rm` 해도 bind01·bind02 데이터는 호스트 디스크에 남는다(= 데이터 지속성의 이유).
  - ro/rw: 권한은 read only / read write 두 가지뿐이며 **지정하지 않으면 기본값 rw**. `-v 호스트:컨테이너:ro` 로 읽기 전용. bind01(`:ro`)에 `echo` 로 쓰면 "Read-only file system" 오류, `docker inspect` 결과에도 ro/rw 가 각각 표시된다.
  - 실습2(redis): redis.conf 를 `curl` 로 내려받아 `requirepass` 항목(원본 파일 1036번 줄 부근)에 값을 채운다(비밀번호 값은 교육용 — 실무에서는 사용 금지). **강사 핵심: 빌드 시점에 설정을 이미지에 굽는 것이 아니라 `docker run` 시점에 bind mount 로 설정 파일을 공유**한다. 설정이 바뀌어도 이미지를 재빌드할 필요 없이 호스트 파일만 바꾸면 된다. 비밀번호 없이 `set item1 docker1` → `NOAUTH Authentication required.`, `redis-cli -a <비밀번호>` 로 인증 후 item1/item2 저장·`get` 정상. (Redis 는 인메모리 DB 로 캐시 용도로 많이 사용.)
  - 실습3(file mount): `.bash_history` 는 사용자 홈에 실행 명령을 기록하는 파일이다. `history` 명령은 버퍼 값을 보여주며 실제 파일 반영은 **세션 종료 시**에 이루어진다(그래서 `exit` 후 호스트에서 `tail ~/.bash_history` 로 확인). 컨테이너 기본 사용자는 root 이므로 컨테이너 root 의 .bash_history 를 호스트(kevin)와 공유하는 셈이다. 설정 파일·인증서·로그/이력 파일처럼 파일 하나에 의존하는 앱에 유용.
  - 실습4(시간 동기화): 컨테이너는 이미지 제작 시 타임존(대개 UTC)을 따르므로 호스트가 KST 여도 `date` 는 UTC. `/etc/localtime` bind mount 후 호스트와 같은 KST(예: 2023. 06. 18 13:39:43) 출력. **강사 경험담**: 30분 주기로 웹 페이지를 크롤링해 Kafka 로 전달하는 파이프라인이 로컬에서는 정상이었으나 컨테이너로 배포하자 스케줄이 어긋났고 원인이 컨테이너 시간 불일치였다 → 시간이 중요한 앱은 반드시 시간 동기화를 챙긴다. 매번 `-v /etc/localtime` 을 붙이는 것은 번거로우므로 **실무에서는 이미지 빌드 시 Dockerfile 에 `ENV TZ` + zoneinfo 심볼릭 링크로 타임존을 고정**하는 방법을 권장.
  - 자주 하는 오류: 파일 mount 시 호스트 파일이 없으면 Docker 가 그 경로를 **디렉터리로** 자동 생성할 수 있으므로(이 부분은 자료에 직접 언급 없음, 일반 지식) 파일 단위 mount 는 호스트 파일을 미리 만들어 둔다.

### [사용한 CLI]
```bash
# [1] 디렉터리 bind mount (bind01, bind02)
mkdir bind01 bind02
docker run -it -v /host/dirA:/bind01 -v ${PWD}/bind02:/bind02 ubuntu:14.04 bash   # (예시 형태: 자료는 호스트의 bind01, bind02 를 각각 /bind01, /bind02 로 mount)
df -ha                 # 컨테이너 안에서 /bind01, /bind02 가 /dev/sda1 (xfs) 로 보임
mount | grep bind      # mount 확인
docker inspect --format="{{ .HostConfig.Binds }}" <컨테이너>   # Bind mount 설정 확인

# 읽기 전용 / 읽기쓰기
docker run -it -v <호스트>/bind01:/bind01:ro -v <호스트>/bind02:/bind02:rw ubuntu:14.04 bash
echo test > /bind01/a.txt     # → Read-only file system 오류 (ro)

# 실습1 마무리: 컨테이너를 정지·삭제해도 호스트의 bind01, bind02 데이터는 유지
docker stop <컨테이너>
docker rm <컨테이너>
```
```bash
# [2] 설정 파일 bind mount : redis.conf 에 requirepass 설정
#  redis.conf 에 다음을 설정:  requirepass pass123#
#  (redis.conf 는 curl 로 내려받음 — 다운로드 URL 은 자료 텍스트에 미표기)
vi redis.conf             # 1036번 줄 부근 requirepass 항목에 값 입력
docker run -d \
  -v ./data:/data \
  -v ./redis.conf:/usr/local/conf/redis.conf \
  redis:7 \
  redis-server /usr/local/conf/redis.conf

docker exec -it <redis컨테이너> redis-cli
#  > set item1 docker1     → NOAUTH Authentication required.
docker exec -it <redis컨테이너> redis-cli -a pass123#
#  > set item1 docker1 / get item1 ...
```
```bash
# [3] 파일 단위 bind mount : .bash_history 보존
docker run -it -v ~/.bash_history:/root/.bash_history --rm centos:8 /bin/bash
echo 'docker volume test' > volume.txt
ls
rm volume.txt
df -h
tail ~/.bash_history     # (컨테이너 안) history 는 버퍼 값, 파일 반영은 세션 종료 시
exit
tail ~/.bash_history     # 컨테이너에서 실행한 명령이 호스트 파일에 남음
```
```bash
# [4] 시간대 맞추기 : /etc/localtime 파일 bind mount
docker run --rm ubuntu:14.04 date                                          # UTC 로 표시
docker run --rm -v /etc/localtime:/etc/localtime ubuntu:14.04 date         # KST 로 표시
```
```dockerfile
# Dockerfile 로 시간대 설정하는 방법
ENV TZ Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
```

### [확인 방법/주의점]
- 컨테이너를 `docker stop` / `docker rm` 해도 호스트의 bind01, bind02 파일은 유지된다.
- `docker inspect --format="{{ .HostConfig.Binds }}"` 로 mount 정보 확인.
- 설정 파일 변경 시 이미지를 다시 빌드하지 않고 호스트 파일만 수정하면 된다.

---

## Step 9. docker volume 방식 실습

### [목적]
- Docker 가 관리하는 named volume / anonymous volume / data container(`--volumes-from`) 방식으로 데이터를 영속화한다.

### [이론 설명]
- `docker volume create` 로 Docker 영역(`/var/lib/docker/volumes/<이름>/_data`)에 생성. 컨테이너에 연결하면 컨테이너가 삭제되어도 볼륨은 남는다. 볼륨 자체를 지우려면 `docker volume rm`.
- anonymous volume: `-v /컨테이너경로` 만 지정하면 이름 없는(랜덤 ID) volume 이 자동 생성되어 관리가 어려우므로 이름을 주는 것이 좋다.
- data container: 볼륨만 공유하는 컨테이너. `docker create` 로 만들면 실행(Up)되지 않고 Created 상태이며 volume 정보만 가진다. 다른 컨테이너는 `--volumes-from <컨테이너>` 로 같은 volume 을 공유한다. `:ro` 를 붙이면 읽기 전용으로 공유.
- `docker create` 컨테이너는 실행 중이 아니므로 `docker exec` 불가("is not running"), 삭제 시 "Conflict, 사용 중" 오류가 날 수 있다(다른 컨테이너가 참조).
- **[원문 한글 자료 기반 보강 — Ch8 Clip3 '[실습] docker volume 방식']**
  - bind mount 와의 차이: bind mount 는 호스트 경로를 직접 지정, docker volume 은 `docker volume create` 로 먼저 만들고 그 **이름**으로 연결. 저장 위치는 Docker 엔진이 자동 결정: `/var/lib/docker/volumes/<볼륨이름>/_data` (**volume 이름 = 디렉터리 이름** 규칙만 알면 실제 데이터 위치를 쉽게 찾는다). `docker volume inspect` 의 `Mountpoint` 항목이 그 경로.
  - 실습1(mysql): `docker run ... -v mydb-data:/var/lib/mysql mysql:5.7-debian` 후 컨테이너 안 `df -ha` 에 `/dev/sdb1 100G ... /var/lib/mysql` 로 보이고, 호스트 `sudo ls .../_data` 에서 `auto.cnf`, `ibdata1`, `fastcampus` 폴더 등이 보인다. mysql:5.7 은 첫 실행 시 `sys`, `performance_schema` 같은 기본 시스템 DB 를 자동 생성하므로 fastcampus 외 파일이 많아도 정상. **팁(강사 라이브 중 발생): `df -h` 에 마운트 줄이 안 보이면 `df -ha`**(`-a` 는 기본 숨김 항목까지 표시).
  - volume 은 컨테이너와 별개 생명주기: `docker stop/rm mydb` 후에도 `_data` 가 그대로 남고, `docker volume rm mydb-data` 후에야 "No such file or directory". DB 데이터처럼 지우면 안 되는 데이터는 volume 에 두어야 컨테이너를 갈아 끼워도 안전하다. 반대로 데이터를 정말 지우려면 volume 까지 명시적 삭제. bind mount 와 volume 은 방식만 다를 뿐 "컨테이너가 사라져도 데이터는 남는다"는 목적이 동일(샘플 데이터 보존 실습은 Step 10 에서).
  - 실습2(anonymous volume): `-v /var/lib/mysql` 처럼 컨테이너 경로만 쓰면 이름 없는 volume 이 자동 생성되고 `docker inspect` 의 `Mounts` 에 `Type: volume`, `Name: <긴 해시>`, `Source: /var/lib/docker/volumes/<해시>/_data`, `Destination: /var/lib/mysql` 로 표시. **강사: 보통 권장하지 않는다** — 해시 이름이라 `docker volume ls` 만 보고 어느 컨테이너 데이터인지 식별하기 어렵다. 테스트용·간단히 쓰고 말 것이 아니면 항상 `-v mydb-data:/var/lib/mysql` 처럼 이름을 명시.
  - 실습3(data container): 여러 컨테이너가 하나의 데이터를 공유할 때 volume 만 가진 data container 를 만들고 다른 컨테이너가 `--volumes-from <컨테이너>` 로 이어받는다. **왜 `docker run` 이 아니라 `docker create` 인가(강사)**: 데이터만 공유하는 용도라 프로세스가 필요 없으므로 이미지 스냅샷만 만드는 create 를 쓴다 → `docker ps` 에 `Up` 이 아니라 `Created`. `--volumes-from` 은 "그 컨테이너가 가진 volume 마운트 설정을 그대로 복사해 내 컨테이너에 적용". 3-1: share-container 의 `/share-data`(익명 volume)에 data-1 이 쓴 `data-1.txt` 를, data-1 을 지운 뒤 새로 만든 data-2 에서도 `cat` 으로 읽을 수 있다(volume 은 share-container 가 보유).
  - 3-2: `docker create -v $(pwd)/share-volume:/share-data` 로 bind mount 기반 data container 를 만들면 data-1 이 쓴 파일이 호스트 `ls share-volume/` 에서도 보인다. `--volumes-from share-container:ro` 로 연결한 data-2 는 읽기만 가능하고 쓰면 `Read-only file system`. `:ro` 는 volume 방식·bind mount 방식 모두에 공통으로 쓰이며(기본값 rw), 설정 파일·공용 정적 파일을 읽기만 하는 컨테이너에 안전장치로 유용.
  - 라이브 중 실제 오류(강사): `share-container` 이름이 이미 존재 → `Conflict ... 컨테이너 이름이 이미 사용 중` → `docker rm` 후 재생성. `docker exec` 로 share-container 에 접속 시도 → `Container ... is not running` (create 만 한 컨테이너는 실행 상태가 아님; data container 는 접속 대상이 아니라 volume 을 빌려주는 대상).
  - 참고: 원문은 STT(faster-whisper small) 기반 정리라 일부 기술 용어를 화면 기준으로 바로잡았다고 명시.
  - 보안: 예제의 MYSQL_ROOT_PASSWORD 값은 교육용 — 실무에서 그대로 사용 금지(이 문서 CLI 에는 기존 값 유지).

### [사용한 CLI]
```bash
# 1. named volume 생성/조회
docker volume create mydb-data
docker volume ls
docker volume inspect mydb-data     # Mountpoint: /var/lib/docker/volumes/mydb-data/_data

# 2. MySQL 컨테이너에 연결
docker run -d --name mydb \
  -e MYSQL_ROOT_PASSWORD=password1 \
  -e MYSQL_DATABASE=fastcampus \
  -v mydb-data:/var/lib/mysql \
  mysql:5.7-debian

docker ps
sudo ls /var/lib/docker/volumes/mydb-data/_data     # auto.cnf, ibdata1, fastcampus ...
docker exec -it mydb bash
df -ha            # /var/lib/mysql 이 /dev/sdb1 로 마운트됨 (-a: 모든 파일시스템 표시)

# 3. 컨테이너 삭제 후에도 볼륨 유지, volume 삭제
docker stop mydb
docker rm mydb
sudo ls /var/lib/docker/volumes/mydb-data/_data      # 데이터 그대로 존재
docker volume rm mydb-data                           # volume 삭제
sudo ls /var/lib/docker/volumes/mydb-data/_data      # No such file or directory
```
```bash
# 4. anonymous volume (이름 없이 컨테이너 경로만 지정)
docker run -d --name mydb \
  -e MYSQL_ROOT_PASSWORD=password1 -e MYSQL_DATABASE=fastcampus \
  -v /var/lib/mysql \
  mysql:5.7-debian

docker inspect mydb          # Mounts: Type=volume, Name=a1364533dc0948..., Source=/var/lib/docker/volumes/<id>/_data, Destination=/var/lib/mysql
docker volume ls             # local   a1364533dc0948... (랜덤 이름)
```
```bash
# 5-1. data container + 익명 volume
docker create -v /share-data --name=share-container ubuntu:14.04
docker ps -a | grep share
docker inspect share-container            # Mounts.Destination: /share-data
docker run -it --volumes-from share-container --name=data-1 ubuntu:14.04 bash
  df -h                                   # /share-data 가 /dev/sdb1 로 보임
  echo 'testing data container' > /share-data/data-1.txt
  cat /share-data/data-1.txt
  exit
docker rm data-1                          # data-1 을 지워도 volume 은 share-container 가 보유
docker run -it --volumes-from share-container --name=data-2 ubuntu:14.04 bash
  cat /share-data/data-1.txt              # data-1 이 쓴 파일이 보임

# (라이브 중 오류) create 만 한 컨테이너는 실행 상태가 아니므로 접속 불가
docker exec -it share-container bash      # → Container ... is not running

# 5-2. data container + bind mount, 읽기 전용 공유 (:ro)
#  같은 이름이 남아 있으면 Conflict(이름 사용 중) → 기존 컨테이너 삭제 후 재생성
docker rm share-container                 # (data-2 등 같은 이름의 기존 컨테이너도 남아 있다면 함께 정리)
docker create -v $(pwd)/share-volume:/share-data --name=share-container ubuntu:14.04
docker run -it --volumes-from share-container --name=data-1 ubuntu:14.04 bash
  echo 'testing data container' > /share-data/data-1.txt
  exit
ls share-volume/                          # data-1.txt (호스트에도 존재)
docker run -it --volumes-from share-container:ro --name=data-2 ubuntu:14.04 bash
  cat /share-data/data-1.txt
  echo 'testing data container2' >> /share-data/data-2.txt
  # bash: /share-data/data-2.txt: Read-only file system
```

### [확인 방법/주의점]
- `docker volume inspect` 의 Mountpoint 와 `sudo ls` 로 실제 데이터 확인(일반 사용자는 `/var/lib/docker` 접근 불가).
- `df -h` 는 일부 파일시스템을 숨기므로 mount 확인은 `df -ha`.
- volume 이 있어도 `docker volume rm` 하면 데이터가 완전히 사라지므로 주의.
- `:ro` 는 `--volumes-from` 뒤에도 붙일 수 있고, 해당 컨테이너에서만 읽기 전용이 된다.

---

## Step 10. 데이터 지속성을 위한 volume 구성 실습 (MySQL DB, Nginx 로그)

### [목적]
- 실무 시나리오: (1) DB 데이터를 호스트에 보존하여 컨테이너 삭제/재생성 후에도 복구, (2) 웹 서버 로그를 호스트에 남겨 컨테이너 삭제 후에도 분석.

### [이론 설명]
- DB 컨테이너는 `docker rm` 시 데이터가 사라지므로 `-v ${PWD}/mydb-data:/var/lib/mysql` 로 데이터 디렉터리를 호스트에 둔다.
- 같은 데이터 디렉터리를 쓰는 새 컨테이너로 교체하면 데이터가 유지된다. 단 DB 버전이 다르면(예: mysql 5.7 → 8.0) 데이터 포맷/소켓 문제로 접속이 실패(ERROR 2002)할 수 있고, 자료에서는 `ln -s` 로 소켓을 연결해 해결했다. 버전 업그레이드는 호환성 확인이 필요하다.
- Nginx 로그(`/var/log/nginx`)를 호스트로 bind mount 하면 컨테이너 삭제 후에도 `access.log`, `error.log` 가 남고, awk 로 분석할 수 있다.
- **[원문 한글 자료 기반 보강 — Ch8 Clip4 '[실습] 데이터 지속성을 위한 volume 구성']**
  - 왜 DB 컨테이너부터 볼륨을 잡나(강사): DB 컨테이너에는 회사 핵심 업무 데이터가 있다고 가정해야 하며, 단순 보존을 넘어 **백업·다른 서버로 마이그레이션**이 가능해야 한다. 이를 위해 지속성·백업·마이그레이션 목적으로 볼륨을 구성하며 docker volume 이든 bind mount 든 방식은 크게 상관없다(이 실습은 bind mount).
  - `-e MYSQL_ROOT_PASSWORD`, `-e MYSQL_DATABASE=fastcampus` 로 첫 기동 시 fastcampus DB 자동 생성. 컨테이너 안 `df -h` 에서 `/var/lib/mysql` 이 컨테이너 기본 파일시스템(overlay)이 아닌 호스트 `/dev/sda1` 별도 디바이스로 보이면 호스트 디스크에 저장되는 것이다. `dockerclass` 테이블(classid=10, classname='docker container CI/CD')을 만들어 보존 확인용 기준을 만들고, `/var/lib/mysql/fastcampus/` 에서 `dockerclass.frm`, `dockerclass.ibd` 를 확인.
  - 데이터가 남는 이유: `docker rm` 은 컨테이너(프로세스와 컨테이너 전용 쓰기 계층)만 지우고, `-v` 로 마운트한 호스트 디렉터리는 컨테이너와 무관하게 독립적으로 존재한다. 같은 `-v ${PWD}/mydb-data:/var/lib/mysql` 로 새 컨테이너를 만들면 `show tables; select * from dockerclass;` 에 `10 | container CI/CD` 가 그대로 조회된다. **강사 경험담**: 예전에는 DB 마이그레이션·백업을 위해 물리적으로 데이터를 복사하는 별도 솔루션이 필요했지만, 컨테이너 환경에서는 볼륨만 다시 붙이면 테이블·데이터까지 그대로 이전된다("획기적").
  - 이미지 태그(버전) 변경: `mysql:8.0-debian` 으로 같은 볼륨 재사용 시 `ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock'`. 원인은 5.7 과 8.0 의 기본 소켓 파일 경로 규칙이 달라 이전 버전이 남긴 소켓 경로를 새 버전이 찾지 못하는 것. 해결: `ln -s /var/lib/mysql/mysql.sock /tmp/mysql.sock` 후 **컨테이너 `restart`** → 접속 후 `show databases`/`select * from dockerclass` 로 데이터 확인. 슬라이드 결론: "동일한 이미지의 태그(버전)가 달라도 데이터 연결이 가능하다" — 단 버전 차이에 따른 부가 호환성 문제는 별도 해결이 필요할 수 있다.
  - **한계(강사)**: MySQL → Oracle/MariaDB 로 바꿔 같은 볼륨을 쓰는 것은 **불가**. 동일한 종류의 DB 소프트웨어 안에서만 가능하다(MySQL 과 MariaDB 는 갈라질 당시 마지막 버전까지만 구조가 호환되고 이후 아키텍처가 달라짐). 5.7→8.0 뿐 아니라 8.0→5.7 도 동작할 수 있다 — 관건은 버전이 아니라 같은 종류의 DB 인가.
  - 실습2 시나리오(강사): 웹 서비스 운영 중 접근 기록·에러 원인을 보려는데 컨테이너가 장애로 죽어 시작도 안 되면 그 안의 로그를 볼 수 없다 → 로그가 가장 필요한 장애 상황에서 볼 수 없는 역설을 피하려고 **로그 디렉터리를 컨테이너 상태와 무관하게 호스트 볼륨으로 분리**해 둔다.
  - `docker run -v /home/kevin/nginx-log/:/var/log/nginx -p 8011:80 nginx:1.25.0-alpine` 후 호스트 `ls nginx-log/` 에 `access.log`, `error.log`. `tail -f` 를 켜 두고 브라우저(IP:8011, "Welcome to nginx!")로 접속하면 `GET / HTTP/1.1`, `GET /favicon.ico` 가 실시간 추가(다른 호스트의 `curl` 도 동일). `docker stop/rm myweb` 후에도 `cat access.log` 로 전체 로그 보존 확인.
  - awk 로그 필드(원문): 공백 기준 `IP(1) -(2) -(3) [날짜시간(4) +0900](5) "메서드(6) 경로(7) HTTP버전(8)" 상태코드(9) 크기(10)`. 이는 Nginx·Apache 등 웹 서버 액세스 로그의 공통 기본 패턴이라 다른 웹 서버에도 응용 가능. 문자열 비교로 `$4` 범위를 지정 → `$1` 추출 → `sort | uniq -c | sort -r`. 별도 로그 수집 시스템을 붙이기 전에도 특정 시간대 트래픽 폭주 IP·장애 시점 요청 패턴을 빠르게 파악 가능.
  - 보안: 문서 CLI 의 DB 비밀번호는 `<비밀번호>` 로 마스킹 유지.

### [사용한 CLI]
```bash
# [1] DB 컨테이너 data 영속화
docker run -d --name mydb \
  -e MYSQL_ROOT_PASSWORD=<비밀번호> \
  -e MYSQL_DATABASE=fastcampus \
  -v ${PWD}/mydb-data:/var/lib/mysql \
  mysql:5.7-debian

docker exec -it mydb df -h                # /var/lib/mysql 이 overlay 가 아닌 호스트 디스크(/dev/sda1)
docker exec -it mydb mysql -uroot -p      # dockerclass 테이블 생성, (classid=10, classname='docker container CI/CD') insert
ls -l /var/lib/mysql/fastcampus/          # (컨테이너 안) dockerclass.frm, dockerclass.ibd

docker stop mydb
docker rm mydb
ls mydb-data/                             # 호스트에 mysql 데이터 그대로 존재

# 같은 호스트 디렉터리로 새 컨테이너 생성 → 데이터 복구
docker run -d --name mydb ... -v ${PWD}/mydb-data:/var/lib/mysql mysql:5.7-debian
docker exec -it mydb mysql -uroot -p
#  mysql> show tables;  select * from dockerclass;     (10 | container CI/CD)

# 이미지 버전을 올릴 때(mysql:8.0-debian) 소켓 오류 발생 시 자료의 임시 해결 방법
docker stop mydb && docker rm mydb
docker run -d --name mydb ... -v ${PWD}/mydb-data:/var/lib/mysql mysql:8.0-debian   # 태그만 변경, 같은 데이터 디렉터리
docker exec -it mydb mysql -uroot -p
#  ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock'
ln -s /var/lib/mysql/mysql.sock /tmp/mysql.sock       # 이후 컨테이너 restart, show databases / select * from dockerclass 로 확인
docker restart mydb
docker exec -it mydb mysql -uroot -p                  # mysql> show databases;  select * from dockerclass;
```
```bash
# [2] Web 컨테이너 로그 영속화
mkdir /home/kevin/nginx-log
docker run -d --name myweb \
  -v /home/kevin/nginx-log/:/var/log/nginx \
  -p 8011:80 \
  nginx:1.25.0-alpine

ls nginx-log/                      # access.log, error.log
tail -f nginx-log/access.log       # 브라우저로 IP:8011 접속하면 접속 로그 실시간 표시 (curl 도 가능)

docker stop myweb
docker rm myweb
cat nginx-log/access.log           # 컨테이너 삭제 후에도 로그 존재

# awk 로 특정 시간대의 접속 IP 별 횟수 집계
awk '$4>"[16/Jun/2023:05:14:58]" && $4<"[16/Jun/2023:05:15:31]"' access.log \
 | awk '{ print $1 }' | sort | uniq -c | sort -r | more
#   6 192.168.56.102
#  13 192.168.56.1
```
awk 설명: Nginx 기본 로그 포맷에서 `$1` = 클라이언트 IP, `$4` = `[시간` 필드. `sort | uniq -c | sort -r` 로 IP 별 건수를 내림차순 집계.

### [확인 방법/주의점]
- `ls mydb-data/`, `ls nginx-log/` 로 호스트에 데이터가 있는지, 컨테이너 삭제 후에도 유지되는지 확인.
- 다른 버전의 DB 이미지로 교체 시 데이터 호환성 문제(소켓/포맷)가 생길 수 있다.

---

## Step 11. Volume 및 컨테이너 사용량(디스크 용량) 제한 구성

### [목적]
- 컨테이너 rootfs(`/`)와 bind mount/volume 의 디스크 사용량을 제한한다.

### [이론 설명]
- 컨테이너 안에서 `df -h` 를 보면 rootfs(`/`, overlay)는 호스트의 `/var/lib/docker` 가 있는 디스크(예: `/dev/sdb1` 100G) 기준이고, bind mount 한 경로(예: `/webapp`)는 호스트의 해당 경로가 속한 파일시스템(예: `/dev/sda1`) 기준이다. 즉 서로 다른 디스크의 용량이 보인다.
- rootfs(`/`) 용량 제한 : `docker run --storage-opt size=1G` 또는 daemon.json 의 `storage-opts`. **overlay + xfs + pquota(project quota) mount 옵션**이 있어야 한다. 없으면 `--storage-opt is supported only for overlay over xfs with 'pquota' mount option` 오류.
- bind mount/volume 의 호스트 경로는 `--storage-opt` 의 대상이 아니므로, 별도 파일시스템(loop 디바이스 + xfs)을 만들어 그 용량만큼만 쓰도록 한다.
- **[원문 한글 자료 기반 보강 — Ch8 Clip5 '[실습] volume 사용량 제한 구성']**
  - 문제 제기(강사): 컨테이너를 만들면 독립된 rootfs(/)가 생기는데 용량이 매우 크게 잡혀 있고, 볼륨(bind mount/docker volume)도 해당 디렉터리가 속한 파티션 전체 용량을 그대로 쓸 수 있어 "한마디로 제한이 없다". 엄밀히는 volume 기능보다 '제한'에 가까운 주제이나 함께 다룬다. (Ch8 내내 `df` 를 보여준 이유가 이 용량 문제를 암시하기 위해서였다.) 디스크가 가득 차면 컨테이너뿐 아니라 host 전체·다른 컨테이너에 영향을 주는 Ch7 의 CPU/메모리 제한과는 별개의 위험 요소.
  - `df -h` 읽는 법(슬라이드 비교): 컨테이너 `/`(overlay)는 100G(12G 사용, 89G 여유, 12%)로 보이지만 컨테이너 전용 공간이 아니라 **컨테이너가 생성되는 위치 `/var/lib/docker` 가 속한 파티션(`/dev/sdb1`, 100G) 전체 크기**. bind mount 한 `/webapp`(`/home/kevin/myvolume`)은 `/dev/sda1` 56G(14G 사용, 43G 여유, 24%) 로 **host `/` 파티션 용량**. 강사 일반 규칙: "컨테이너는 무조건 /var/lib/docker 영역의 사이즈", bind mount 는 마운트 경로가 속한 파티션 전체 용량을 기본값으로 물려받는다.
  - 두 가지 제한 방법: 개별 컨테이너(`--storage-opt size`) / 이후 생성되는 모든 컨테이너 공통(`daemon.json` 의 `storage-opts`). `--storage-opt` 는 **overlay + xfs + pquota** 조건 필요. 실습 서버 2대 중 hostos1 은 사전 설정, hostos2 는 미설정 상태로 두어 오류와 정상 동작을 비교.
  - 순서: `mount | grep xfs` 에서 `/var/lib/docker` 가 `noquota` → `--storage-opt size=1G` 시 `docker: Error response from daemon: --storage-opt is supported only for overlay over xfs with 'pquota' mount option.` → `/etc/default/grub` 의 `GRUB_CMDLINE_LINUX_DEFAULT` 에 `rootflags=uquota,pquota` 추가, `/etc/fstab` 의 `/var/lib/docker xfs defaults,pquota 0 0` → `sudo reboot` → `mount | grep xfs` 가 `noquota` 에서 `prjquota` 로 바뀐 것 확인 → 성공, 컨테이너 `df -h` 에서 overlay 1.0G(1%).
  - daemon.json: `"storage-opts": ["overlay2.size=500m"]` 추가 후 `sudo systemctl restart docker.service`/`status` → `--storage-opt` 없이도 새 컨테이너 rootfs 가 `overlay 500M 8.0K 500M 1%`.
  - bind mount volume 제한(강사): Docker 공식 문서 등을 찾아봐도 "볼륨 사이즈 제한 방법이 어렵고 관련 내용도 별로 없다". Docker 고유 기능이 아니라 리눅스 친화성을 이용한 **우회 방법(loop 디바이스 + xfs 이미지)**. `dd if=/dev/zero of=tmpdisk.img count=512 bs=1M`(512MiB, 약 537MB) → `mkfs.xfs tmpdisk.img` → `fdisk -l tmpdisk.img`(512 MiB, 1048576 sectors) → `mkdir -p /home/kevin/volume-quota` → `mount -o loop tmpdisk.img /home/kevin/volume-quota` → `df -h` 에서 `/dev/loop18 507M 30M 478M 6%` → `chown -R kevin.kevin` → `exit`. 컨테이너 `df -h` 에 `/dev/loop18 507M 30M 478M 6% /webapp` 로 표시(host `/` 전체 56G~66G 가 아님). 이 용량을 넘겨 쓸 수 없다.
  - **실무 팁(강사)**: 이 방법은 간단하지만 **root 권한이 필요**해 조금 위험하다. `dd`·`mkfs.xfs`·`mount -o loop` 는 관리자 권한이 필요하므로 인프라 담당자에게 요청하거나 sudo 로 진행. 약간의 리눅스 의존성이 있는 우회 방법임을 인지.
  - 요약: rootfs(/) → `--storage-opt`/`storage-opts`(xfs pquota), host 디렉터리 bind mount → host 쪽에서 별도 loop 파일시스템 크기로 제한. 핵심은 "컨테이너 안에서 보이는 용량이 host 의 어느 파일시스템에 물려 있는가"를 파악하는 것.
  - 주의: grub/fstab 오설정 시 부팅 불가 위험(일반 지식, 자료에는 언급 없음)이 있으므로 UUID 는 환경에 맞게 바꾸고 백업 후 실습.

### [사용한 CLI]
```bash
# 1. 현재 파일시스템 확인
mount | grep xfs
#  /dev/sdb1 on /var/lib/docker type xfs (rw,relatime,...,noquota)   ← noquota 이므로 제한 불가

# 컨테이너 안/밖 용량 확인
docker run -it -v /home/kevin/myvolume:/webapp --name=mycontainer ubuntu:14.04 bash
df -h        # overlay(/) 100G, /webapp 은 /dev/sda1(호스트 / 의 크기)
```
```bash
# 2-1. rootfs 용량 제한 : --storage-opt (pquota 가 없으면 에러)
docker run -it -v /home/kevin/myvolume:/webapp --name=mycontainer --storage-opt size=1G ubuntu:14.04 bash
#  docker: Error response from daemon: --storage-opt is supported only for overlay over xfs with 'pquota' mount option.

# pquota 활성화
sudo vi /etc/default/grub
#   GRUB_CMDLINE_LINUX_DEFAULT="quiet splash rootflags=uquota,pquota"
sudo vi /etc/fstab
#   UUID=b2f0ef34-291f-411d-aa75-9a46d72c7401 /var/lib/docker xfs defaults,pquota 0 0
sudo reboot

mount | grep xfs          # 재부팅 후 prjquota 로 표시되는지 확인
docker run -it --storage-opt size=1G ubuntu:14.04 bash     # (자료: -v/--name 포함 실행)
df -h                     # overlay 1.0G 로 표시
```
```bash
# 2-2. daemon.json 으로 전체 컨테이너 rootfs 기본 제한
sudo vi /etc/docker/daemon.json
```
```json
{ "insecure-registries": ["192.168.56.101:5000"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "30m",
    "max-file": "10"
  },
  "storage-opts": ["overlay2.size=500m"]
}
```
```bash
sudo systemctl restart docker.service
sudo systemctl status docker.service

docker run -it -v /home/kevin/myvolume:/webapp --name=mycontainer ubuntu:14.04 bash
df -h        # overlay 500M 으로 표시
```
```bash
# 3. bind mount 용 볼륨 용량 제한 : 파일을 디스크 이미지로 만들어 xfs 포맷 후 loop mount
sudo su -
dd if=/dev/zero of=tmpdisk.img count=512 bs=1M       # 512MB 빈 파일 생성
mkfs.xfs tmpdisk.img                                 # xfs 파일시스템 생성
fdisk -l tmpdisk.img
mkdir -p /home/kevin/volume-quota
mount -o loop tmpdisk.img /home/kevin/volume-quota   # loop 디바이스로 mount
df -h                                                # /dev/loop18 507M ... /home/kevin/volume-quota
chown -R kevin.kevin /home/kevin/volume-quota        # 일반 사용자 쓰기 권한
exit

docker run -it -v /home/kevin/volume-quota:/webapp --name=myvolume ubuntu:14.04 bash
df -h        # /webapp 이 /dev/loop18 507M 으로 표시 → 이 용량 이상 쓸 수 없음
```
옵션 설명
- `--storage-opt size=1G` : 컨테이너 rootfs 최대 크기
- `rootflags=uquota,pquota` (grub) / `defaults,pquota` (fstab) : xfs project quota 활성화
- `dd ... count=512 bs=1M` : 1MB 블록 512개 = 512MB 이미지 파일
- `mount -o loop` : 파일을 블록 디바이스처럼 mount

### [확인 방법/주의점]
- `mount | grep xfs` 에 `prjquota` 가 보여야 `--storage-opt` 사용 가능. grub/fstab 수정 후 reboot 필요.
- daemon.json 수정 후 `systemctl restart docker`.
- host 의 bind mount 경로는 `--storage-opt` 로 제한되지 않는다 → loop + xfs 방식으로 제한.
- grub/fstab 편집은 시스템 설정 변경이므로 신중히(실습 환경에서만).

---

# PART C. Dockerfile 로 이미지 만들기 (ch9)

## Step 12. Dockerfile 과 instruction 이해

### [목적]
- 이미지를 코드로 정의하는 Dockerfile 의 개념과 핵심 instruction(13개)을 익힌다.

### [이론 설명]
- IaC(Infrastructure as Code): 인프라를 코드로 관리. Dockerfile 은 이미지 생성 절차를 담은 템플릿이다. 사람 손으로 서버를 구성(스노우플레이크 서버)하는 문제를 코드로 해결.
- 흐름: **Dockerfile → (docker build) → Docker Image → (docker push) → Registry/Docker Hub → (docker pull) → (docker run) → Container**.
- Dockerfile 은 GitHub 등 형상 관리로 공유할 수 있다.

| instruction | 설명 |
|---|---|
| FROM | 베이스 이미지 지정(첫 레이어). Docker Hub 공식 이미지, 태그 명시, 경량(slim/alpine), `latest` 지양 |
| MAINTAINER / LABEL | 작성자/메타데이터. LABEL 은 여러 개를 `\` 로 한 번에 지정 가능 |
| RUN | 이미지 빌드 중 명령 실행(패키지 설치 등). 여러 명령은 `&& \` 로 묶어 레이어 수 감소 |
| CMD | 컨테이너 시작 시 기본 실행 명령. `docker run` 에서 덮어쓰기 가능. Dockerfile 에서 마지막 CMD 하나만 유효 |
| ENTRYPOINT | 컨테이너 시작 시 항상 실행되는 명령. `docker run` 인자는 ENTRYPOINT 에 추가 인자로 전달 |
| COPY | 호스트 파일/디렉터리를 이미지로 복사 |
| ADD | COPY 기능 + URL 다운로드 + 압축(tar, tar.gz) 자동 해제 |
| ENV | 환경 변수 설정. 이후 RUN/WORKDIR 등에서 사용 가능 |
| EXPOSE | 컨테이너가 리슨하는 포트를 문서화. 실제 publish 는 `docker run -p` |
| VOLUME | 컨테이너 경로를 volume 으로 지정(호스트 Docker 영역에 생성) |
| USER | 실행 사용자 지정(기본 root). root 사용을 피하기 위해 사용 |
| WORKDIR | 작업 디렉터리. 이후 RUN/CMD/ENTRYPOINT/COPY/ADD 에 적용, 컨테이너 접속 시 기본 위치 |
| ARG | `docker build --build-arg` 로 빌드 시점 변수 전달 |

- CMD/ENTRYPOINT 의 형식: Shell 형식 / Exec 형식(JSON 배열, 권장되는 형태로 자료의 예제 다수가 사용).
- ENV 와 ARG : ENV 는 컨테이너 실행 시에도 유지되는 환경 변수, ARG 는 build 시점에만 사용.
- 자료에서 그 외 instruction 으로 ONBUILD, HEALTHCHECK 가 있다고만 언급.
- 이미지 레이어는 읽기 전용(RO), 컨테이너 실행 시 맨 위에 읽기/쓰기(RW) Container Layer 가 추가된다.
- **[원문 한글 자료 기반 보강 — Ch9 Clip1 'image 생성을 위한 Dockerfile 명령어' (약 41.6분, 이론 위주; Ch9 총 8개 클립 중 이 클립과 다음 '최적화' 클립만 이론, 3번째부터 실습)]**
  - **IaC 필요성**: 커맨드를 하나씩 입력해 서버를 구성하면 인적 오류 가능성이 높다(예: APM = Apache+PHP+MySQL 구축 시 설치 순서·구성요소 간 연관성·라이브러리·환경 설정값을 모두 점검, 잘못되면 수정하거나 재설치). 이를 하나의 이미지로 만들고 수정은 코드 변경만으로 반영하면 개발자는 개발 목적에 집중. 코드형 인프라는 **탄력성·확장성·반복성**을 제공, 동일 환경의 서버(컨테이너)를 수십~수백 대 동일하게 운영.
  - **눈송이 서버(snowflake server)**: 개발·테스트 서버에서 성능이 잘 나왔는데 운영 서버에서는 같은 세팅이라 생각해도 성능이 안 나오는 경우 — 시간이 지나며 데이터·패키지 설정이 조금씩 달라지기 때문. Dockerfile 로 환경을 항상 동일하게 재현. 강사: 처음부터 Dockerfile 을 잘 쓰는 사람은 없고 필요한 환경 변수·종속 패키지·라이브러리는 실전 경험이 쌓여야 파악된다.
  - **Dockerfile 정의**: Docker 컨테이너 구성 정보를 프로비저닝(시스템 자원을 할당·배치·배포해 두었다 필요할 때 즉시 쓸 수 있게 준비)한 **텍스트 template 파일**(바이너리 아님, vi 로 작성). 패키지, 소스 코드, 명령어, 환경 변수 설정을 기록. OS 를 처음부터 개발하는 것이 아니라 벤더/오픈소스가 배포한 베이스 이미지 위에 필요한 것을 얹는 작업. 코드(GitHub)·이미지(registry)로 언제 어디서나 동일 컨테이너 재현.
  - **생태계**: Dockerfile(instruction 을 담은 텍스트) → `docker build`(Dockerfile 로 이미지 생성 과정을 실행하는 CLI) → Image → Image registry(public/private 저장소) → `docker run`(이미지에 애플리케이션 인프라·프로세스가 결합되어 서비스로 배포된 것이 컨테이너). **강사: 실무에서는 push 하기 전에 먼저 테스트**한다. 회사에서는 보통 개발팀이 인프라 요구사항을 전달 → 데브옵스팀이 베이스 이미지를 만들어 1차 이미지로 배포 → 버전이 바뀔 때마다 2차·3차 이미지로 버전 관리.
  - **FROM**: 필수(베이스 이미지가 없다 = OS 가 없다). hub.docker.com 공식(official) 이미지 권장, 태그는 버전 정보처럼 여러 개 제공, 크기 작은 slim 또는 alpine 권장(단 모든 애플리케이션이 동일하게 동작하지는 않으니 주의), **태그 미지정 시 `latest`**. 팁: Docker Hub 태그를 클릭하면 실제 Dockerfile(GitHub 소스)로 연결되는 경우가 많아 적합성 사전 확인에 도움. slim/alpine 이 아닌 무거운 이미지는 빌드 시간·용량이 커지므로 애플리케이션 요구 라이브러리를 먼저 확인.
  - **MAINTAINER / LABEL**: MAINTAINER 는 작성자 이름·이메일(레이어를 만들지 않음). LABEL 은 이미지 작성 목적을 버전·타이틀·설명·라이선스·작성자 등으로 기록, 하나 이상 작성 가능. **LABEL 은 레이어를 만든다** — 세 줄로 나눠 쓰면 레이어 3개, `\` 줄바꿈으로 묶으면 1개(권장). 둘 다 필수는 아니나 회사에서는 소속 팀·이메일 정도는 적는 것이 보통 권장.
  - **RUN**: 패키지 업데이트·설치·명령 실행, 하나 이상 작성 가능, apt/yum 계열 사용법 동일. `&& \` 로 묶어 RUN 개수를 줄이면 **레이어 수 감소**, `autoremove`/`autoclean`/`rm -rf /var/lib/apt/lists/*` 로 apt 캐시를 삭제하면 **최종 이미지 크기도 감소**.
  - **CMD/ENTRYPOINT 가 필요한 이유(강사)**: 이미지는 정적이라 그 안의 데몬이 돌고 있지 않다(예: nginx 데몬은 이미지 상태에선 동작 안 함, 컨테이너화되는 순간 프로세스 동작). 정적 이미지 → 동적 컨테이너 전환 시 실제 실행할 데몬·스크립트·실행 파일을 지정하는 것이 CMD/ENTRYPOINT. 그래서 Dockerfile 첫 줄이 FROM 이면 마지막 줄은 CMD 또는 ENTRYPOINT 인 경우가 많다.
  - **CMD**: 컨테이너 실행 시 실행되며 ENTRYPOINT 로 지정된 커맨드에 기본으로 넘길 파라미터를 지정할 때도 사용. **여러 개 작성해도 마지막 하나만 처리**. Shell 방식 / Exec 방식(JSON 배열) 두 가지.
  - **ENTRYPOINT**: 컨테이너 실행 시 명령어와 인자 값을 전달받아 실행, 인자를 함께 쓸 때 유용. 예: `ADD ./entrypoint.sh /entrypoint.sh` → `RUN chmod +x /entrypoint.sh` → `ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]`. **CMD vs ENTRYPOINT**: 둘 다 시작 시 실행 명령 지정, 차이는 덮어쓰기 — CMD 는 `docker run` 뒤에 다른 명령을 붙이면 통째로 대체되는 기본값, ENTRYPOINT 는 고정 실행 파일이고 `docker run` 뒤 값은 그 실행 파일에 넘길 인자.
  - **COPY/ADD 가 read-only 이미지에 파일을 넣는 원리(강사)**: `docker build` 실행 시 Dockerfile 각 줄마다 임시 컨테이너가 만들어져 그 안에서 해당 작업(COPY 등)을 수행하고 `docker commit` 과 비슷하게 새 이미지 레이어로 저장 — 줄 수만큼 반복해 최종 이미지 완성. 즉 이미지를 직접 고치는 것이 아니라 '임시 컨테이너 작업 → 새 이미지로 커밋'의 반복.
  - **COPY**: 호스트의 파일/디렉터리를 이미지로 복사, 단순 복사만 지원, **빌드 작업 디렉터리 외부 파일은 COPY 불가**. 명시적 복사는 ADD 보다 COPY 권장(동작이 더 예측 가능하고 오류가 적음). 주의: `COPY . /app` 은 작업 영역 전체를 복사하므로 비효율적.
  - **ADD**: COPY 기능 + URL 다운로드 + 압축(tar, tar.gz) 해제. 빌드 작업 디렉터리 외부 파일은 불가, **디렉터리를 추가할 때는 경로가 `/` 로 끝나야 한다**. ADD 는 부가 동작이 숨어 있어 의도치 않은 동작 가능 → 단순 복사는 COPY, URL/압축 해제가 필요할 때만 ADD.
  - **ENV**: 이미지 안 환경 변수(JAVA_HOME, PATH 절대경로, 프로그램 버전 등). 반복 표현에도 권장, 설정하면 RUN·WORKDIR 등 다른 명령에서 재사용(예: `NODE_VERSION` 으로 다운로드·압축 해제·삭제).
  - **EXPOSE**: 컨테이너가 호스트 네트워크로 들어오는 트래픽을 리스닝하는 포트·프로토콜 지정. Nginx/Apache 기본 HTTP 80·HTTPS 443, cAdvisor 8080. 강사 비유: 컨테이너 네트워크 네임스페이스 안에 방화벽(포트)을 미리 열어두는 작업. `docker run -p 호스트포트:컨테이너포트` 의 콜론 뒤 컨테이너 포트는 Dockerfile 의 EXPOSE 값과 같아야 하며, **EXPOSE 되지 않은 포트는 `-p` 로 연결해도 동작하지 않는다**(강사 설명). ※ 아래 [확인 방법]의 일반 서술('EXPOSE 는 문서화')과 강사 설명이 다르므로, 실습에서는 EXPOSE 값과 `-p` 컨테이너 포트를 일치시켜 두는 것이 안전.
  - **VOLUME**: 빌드 시점에 볼륨을 미리 설정, 컨테이너 삭제 시 파일이 사라지므로 사용자 데이터 보존·지속성을 위해 권장. 지정한 컨테이너 내부 경로는 호스트 쪽 볼륨 기본 경로(`/var/lib/docker`)와 자동 연결.
  - **USER**: 컨테이너 기본 사용자는 root. root 권한 없이 서비스 가능하면 USER 로 전환. 강사: 서버에서 root 로 원격 접속하지 않는 것이 보안 기본이듯 컨테이너도 마찬가지이며, **컨테이너 root 권한이 상황에 따라 호스트 OS 커널 권한까지 에스컬레이션될 위험**이 있다.
  - **WORKDIR**: RUN/CMD/ENTRYPOINT/COPY/ADD 의 기준 경로, **지정 경로가 없으면 자동 생성**, `docker exec -it my_container bash` 접속 시 지정 경로로 바로 들어간다. 미지정 시 항상 최상위 `/`. 보통 애플리케이션 소스 위치로 지정(컨테이너의 목적이 그 앱 하나에 집중하기 때문).
  - **ARG**: `docker build --build-arg` 로 빌드 시점 변수 전달. **비밀 키·계정 비밀번호 같은 민감 정보를 ARG 로 쓰면 이미지에 값이 남아 노출될 위험**(이미지 레이어에 흔적) → 운영 민감 정보는 별도 시크릿 관리 방식 사용. ENV 는 이미지에 남아 컨테이너 실행 중에도 쓰이고 ARG 는 build 순간에만 전달.
  - 추가 instruction: ONBUILD, HEALTHCHECK 등은 이 영상에서 다루지 않았고 Docker 공식 문서 참고를 권장(강사). 이 영상의 명령어는 실무에서 가장 보편적인 것 위주. 대부분의 instruction 뒤에 실제 리눅스 명령을 그대로 쓰므로 **리눅스 명령어 기본기가 필요**.
  - 참고: 원문은 STT(faster-whisper small) 기반이라 용어 오인식을 화면 기준으로 바로잡았다고 명시.

### [사용한 CLI]
```dockerfile
# FROM
FROM ubuntu:20.04
FROM python:3.9-slim-buster
FROM mongo:4.4.4-bionic

# MAINTAINER / LABEL
MAINTAINER kevin.lee <hylee@dshub.cloud>
LABEL purpose = 'Nginx for webserver'
LABEL version = '1.0'
LABEL description = 'web service application using Nginx'
# 한 줄로 여러 개
LABEL purpose = 'Nginx for webserver' \
      version = '1.0' \
      description = 'web service application using Nginx'

# RUN : 비효율적인 예 (RUN 마다 레이어 생성)
RUN apt update
RUN apt -y install nginx
RUN apt -y install git
# RUN : 권장 (&& \ 로 묶고 캐시/불필요 파일 정리)
RUN apt update && apt install -y nginx \
    git \
    vim \
    curl && \
    apt clean -y && \
    apt autoremove -y && \
    rm -rfv /tmp/* /var/lib/apt/lists/* /var/tmp/*

# CMD : Shell 형식 / Exec 형식
CMD apachectl -D FOREGROUND
CMD ["/usr/sbin/apachectl", "-D", "FOREGROUND"]
CMD ["nginx", "-g", "daemon off;"]
CMD ["python", "app.py"]

# ENTRYPOINT
ENTRYPOINT ["npm", "start"]
ENTRYPOINT ["python", "runapp.py"]
# 스크립트 사용 예
ADD ./entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]

# COPY
COPY index.html /usr/share/nginx/html
COPY ./runapp.py /
COPY . /app          # 현재 디렉터리 전체 복사

# ADD
ADD index.html /usr/share/nginx/html
ADD http://example.com/view/customer.tar.gz /workspace/data/
ADD website.tar.gz /var/www/html

# ENV
ENV JAVA_HOME /usr/lib/jvm/java-8-oracle
ENV PATH /usr/local/nginx/bin:$PATH
ENV Python 3.9
ENV NODE_VERSION v15.1.0
RUN curl -SLO "http://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz" \
    && tar -xzf "node-$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 \
    && rm "node-$NODE_VERSION-linux-x64.tar.gz"

# EXPOSE
EXPOSE 80
EXPOSE 80/tcp
EXPOSE 443
EXPOSE 8080/udp

# VOLUME
VOLUME /var/log
VOLUME /var/www/html
VOLUME /etc/nginx
VOLUME ["/project"]

# USER
RUN ["useradd", "kevinlee"]
USER kevinlee
RUN ["/bin/bash", "-c", "date"]
# 또는
RUN groupadd -r mongodb && \
    useradd --no-log-init -r -g mongodb mongodb

# WORKDIR
WORKDIR /workspace
WORKDIR /usr/share/nginx/html
WORKDIR /go/src/app

# ARG
ARG db_name
CMD db_start.sh -h 127.0.0.1 -d ${db_name}
```
```bash
# Dockerfile 은 텍스트 파일 → vi 로 바로 작성
vi Dockerfile

# ARG 값 전달 (빌드 시)
docker build --build-arg db_name=fastdb .

# WORKDIR 을 지정해 두면 접속 시 해당 경로로 바로 들어감 (미지정 시 /)
docker exec -it my_container bash
```

### [확인 방법/주의점]
- `docker build` → `docker images` → `docker run` 순으로 확인.
- COPY 와 ADD : 단순 복사는 COPY 를 권장하고, URL 다운로드/자동 압축 해제가 필요할 때만 ADD 사용.
- EXPOSE 는 실제 포트를 열어주지 않으므로 `docker run -p 호스트:컨테이너` 가 필요.
- 베이스 이미지는 slim/alpine 으로 가볍게, `latest` 대신 태그 명시.
- 컨테이너는 기본 root 로 실행되므로 USER 로 일반 사용자 지정을 고려.

---

## Step 13. Dockerfile 최적화 (Best Practice)

### [목적]
- 이미지 크기를 줄이고, 빌드 속도·보안·유지보수를 높이는 Dockerfile 작성 원칙을 익힌다.

### [이론 설명]
- 컨테이너 이미지는 가능한 한 작게 + 필요한 것만. `.dockerignore`(`.gitignore` 와 유사) 로 불필요한 파일은 빌드 컨텍스트에서 제외.
- 최적화 항목
  1. **불필요한 패키지/캐시 정리**: `apt-get autoremove && apt-get clean`, `apt install -y --no-install-recommends <패키지>`. (추천 패키지까지 설치되는 것을 방지; 수 MB~수십 MB 절감)
  2. **경량 베이스 이미지**: Alpine Linux(약 5MB), 정적 바이너리는 `scratch`(빈 이미지; Go 등).
  3. **multi-stage build**: `FROM` 을 여러 번 사용. 빌드 stage 에서 컴파일하고 최종 stage 에는 결과물만 `COPY --from=` 로 복사. (centos7(stage1) / centos8(stage2) 예로 `docker image history` 에서 stage2 만 최종 이미지에 남는 것을 확인)
  4. **레이어 수 최소화**: 이미지 레이어 최대 127개(초과 시 "maximum number of layers exceeded"). FROM/RUN/COPY/ADD/ENV/LABEL 등이 새 레이어를 만든다. RUN 을 `&& \` 로 하나로 합친다.
  5. **one application - one container**: 컨테이너 하나에 하나의 애플리케이션. 3-Tier(Frontend-Backend-DB)처럼 분리(decouple)해야 확장·자원 제어가 쉽다.
  6. **캐시 활용(using cache)**: 변경이 적은 명령(패키지 설치)을 위에, 자주 바뀌는 명령(COPY 소스)을 아래에 배치. 변경된 레이어 이후만 다시 빌드된다.
  7. **보안**: root 사용 금지(USER), 이미지 서명/신뢰(Docker Signer `docker trust sign`, Notary(Harbor), DCT `export DOCKER_CONTENT_TRUST=1`), 이미지 취약점 점검(vulnerablecontainers.org 등), `dive` 로 이미지 분석(SETUID/SETGID 등 권한 상승 가능성 확인).
- **[원문 한글 자료 기반 보강 — Ch9 Clip2 'Dockerfile 최적화' (약 28분)]**
  - 개요: 강사는 Dockerfile 을 "우리의 인프라"라 부른다. 불필요한 정보가 쌓이면 이미지가 무거워지고 유지보수·보안 이슈가 생기므로 이를 줄이는 작업이 최적화. 개발팀의 이미지 배포 요청을 가정하고 OS·프로그램·환경변수·서비스 실행·데이터 공유 방법을 고려하며 **빌드 시간 / 이미지 크기 / 재사용성 / 보안 / 유지보수성**을 최적화 요소로 제시(Docker 공식 Best Practice 문서 소개). 5가지 관점: 경량화, multi-stage build, 레이어/캐시 최적화, one application-one container, 보안 강화.
  - Docker Hub 태그 이름이 복잡한 이유는 각 이미지의 용도(지향점)를 나타내기 때문이고, 태그를 클릭하면 GitHub 의 실제 Dockerfile 을 볼 수 있다. 필요 이상으로 많은 것이 설치된 이미지는 불필요한 패키지를 많이 깐 서버처럼 느려진다.
  - **경량 서비스**: 컨테이너는 경량 가상화가 목적, base image 도 지향점에 필요한 프로그램·라이브러리·실행파일만 보유, 최소 설정·구성 권장. 마이크로서비스라는 이름 자체가 '경량'의 의미. `.dockerignore` 는 docker build 시 로컬의 불필요한 파일이 이미지로 쓸려 들어가는 것을 막는 파일이며 `.gitignore` 와 동일한 방식으로 작성.
  - **[실습1] 불필요한 바이너리 제거**: `apt-get autoremove && apt-get clean`(잔여 설치 파일 제거), `apt install -y --no-install-recommends <패키지>`(불필요한 종속 패키지 자동 설치 방지). 강사 예시: tensorflow 기본 베이스 이미지가 이미 2GB 이상인데 설치 시 ML 관련 라이브러리, 현재 환경과 맞지 않는 버전까지 따라와 더 무거워지는 경우가 있다. "극적으로 줄지는 않지만 10~20MB 만 되어도 이미지 입장에서는 큰 크기" — 꾸준한 경량화 습관이 중요.
  - **[실습2] 최소 기본 이미지**: Docker 가 제공하는 최소 이미지 alpine Linux 또는 scratch. scratch 는 완전히 빈 이미지로 Go 같은 정적 링크 바이너리 언어에서 실행 파일만 올려 실행. Alpine 은 최소 약 5MB, 최소 OS 정보만으로 구동 가능, 어떤 앱을 올려도 동일 환경·복잡성 감소 → 성능 향상·빌드 시간 단축·보안 향상. 요구사항상 Ubuntu/CentOS 가 꼭 필요하면 그 OS 를 쓰되 '애플리케이션 동작에 집중하는 컨테이너'라면 Alpine 기본 권장.
  - **[실습3] multi-stage build**: FROM 이 2개 이상이면 분리된 작업 공간(stage) 제공, 첫 stage(빌드 도구)에서 만든 실행파일 등을 두 번째 stage(배포 이미지)에 제공, **마지막에 실행된 stage 작업만 최종 이미지**가 된다. 데모: centos:7(stage1) / centos:8(stage2) 로 echo 실행 후 `docker image history multi-stage:1.0` → 최종 history 에는 stage2(centos:8) 결과만 남고 stage1 은 드러나지 않음. 강사: nc, curl, wget 같은 명령은 보안 취약점 보고서에 자주 등장하는데 multi-stage 로 첫 stage 에서만 설치하고 결과물(아티팩트)만 남기면 이런 바이너리로 인한 취약점도 줄어든다. ※ 슬라이드 예시에는 `COPY --from=build ...` 로 표기되어 있으나 stage 이름은 `AS stage1` 이므로 `--from=stage1` 이 맞다(슬라이드 표기 불일치; 이 문서 CLI 블록은 `stage1` 로 되어 있음).
  - **[실습4] 레이어 수 최소화**: 레이어 수 제한 **127**, 초과 시 `Error response from daemon: maximum number of layers exceeded`. **새 레이어를 만드는 명령: FROM, RUN, COPY, ADD, ENV, LABEL** — 다른 명령은 build 과정에서 임시 이미지를 만들고 삭제. RUN 을 5줄로 나누면 레이어 5개, `&& \` 로 묶거나 같은 명령 체계는 패키지명 나열로 한 줄. **팁(강사)**: 서로 다른 명령은 `&&` 로 연결하지만 `apt install -y package1 package2 package3` 처럼 같은 명령 체계 안의 여러 패키지는 `&&` 반복 없이 나열하면 충분.
  - **one application - one container**: 하나의 컨테이너에 2개 이상 애플리케이션 → 결합성 상승, 확장성 저해. 하나만 두면 독립성 보장, 버전관리·소스 모듈화 이점. 모놀리식보다 결합 해제(Decouple)·MSA 지향 설계여야 장애가 나도 애플리케이션이 유지. 여러 컨테이너로 분리하면 수평 확장·재사용성 좋아짐. 3-Tier 웹 앱은 Frontend-Backend-DB 로 분리 권장. 한 컨테이너에서 많은 프로세스가 돌면 CPU·Memory 소비도 커진다. 강사: 이는 도커 자체의 철학(2013년 발표 컨퍼런스에서 "하나의 서버에는 하나의 애플리케이션만 집중할 수 있는 환경"). 한 컨테이너에 다 넣는 것도 기술적으로 가능하나 결합 구성은 한 앱의 문제가 다른 앱에 전파될 위험. 규모감: 구글은 한 리서치에 따르면 일주일에 약 2억 개 컨테이너를 올리고 내린다(강사 언급).
  - **using cache**: 이미지를 빌드하면 명령어 단위로 자동 캐싱(임시 이미지 생성), 동일 명령 실행은 `Using cache` 로 재사용되어 빌드가 빠르다. 캐시 검증은 **checksum**, 캐싱에 쓰인 명령줄이 바뀌면 기존 캐시를 못 쓰고 재캐싱. 변경이 드문 명령(패키지 설치)을 위쪽, 자주 바뀌는 명령(COPY 등 빌드 단계)을 아래쪽에 배치. 자주 바뀌는 COPY 를 위에 두면 그 아래 캐시까지 무효화. 생성된 캐시(임시 이미지)는 `docker images` 로 확인 가능(강사).
  - **보안 강화**: 사용자를 지정하지 않으면 root 이며 컨테이너 실행 시 암시적으로 Docker Host 에 대한 root access 권한을 갖는 잠재적 보안 문제. 이미지는 컨테이너 보안의 첫 번째 고려 대상, 공격 대상 영역(attack surface)을 줄여야 한다. **이미지 서명**: Docker 가 매니페스트의 서명을 확인해 신뢰할 수 있는 소스에서 생성되었고 위조·변조가 없음을 보장 — Docker Signer(`docker trust sign`), Notary(by Harbor), DCT(Docker Contents Trust, `export DOCKER_CONTENT_TRUST=1`). `USER` 로 root 접근 억제(RUN/ENTRYPOINT/CMD 실행 사용자 지정). 이미지 안에 뭐가 있는지 모르므로 **Docker Hub 인증 이미지만 사용**, 취약성 확인 후 사용(취약성 목록 vulnerablecontainers.org). 낯선 이미지는 **Dive** 로 검사 — **SETUID/SETGID 비트가 있는 바이너리를 찾아 제거**(권한 escalation 에 악용 가능). 강사: 컨테이너는 Host OS 커널을 공유하므로 컨테이너 안에서 root 를 얻으면 Host 접근을 시도할 수 있고, 그래서 Kubernetes 도 root 사용 금지를 원칙으로 한다. Dive 는 명령이라기보다 이미지 검증용 컨테이너 도구로 모든 레이어(디렉터리)와 권한 정보를 한 번에 확인.

### [사용한 CLI]
```bash
# 1. 패키지 설치 시 불필요한 것 제외 / 정리
apt-get install -y --no-install-recommends <pkg>
apt-get autoremove && apt-get clean
apt-get clean && rm -rf /var/lib/apt/lists/*
```
```dockerfile
# 2. multi-stage build 형식
FROM builder_image AS stage1
# Build commands go here
FROM distro_image
# Copy artifacts from stage1
COPY --from=stage1 /stage1/artifacts /app

# 3. RUN 합치기
RUN apt update && \
    apt install -y package1 && \
    apt install -y package2 && \
    apt install -y package3 && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*
# 더 간단히
RUN apt update && apt install -y package1 package2 package3 && apt clean && rm -rf /var/lib/apt/lists/*

# 4. 보안 : 일반 사용자
USER <user>
```
```bash
# 이미지 신뢰(DCT) 활성화
export DOCKER_CONTENT_TRUST=1

# 이미지 레이어 확인
docker image history multi-stage:1.0

# 이미지 분석
dive <image>
```
```text
# .dockerignore  (빌드 컨텍스트에서 제외할 파일 목록, .gitignore 와 유사)
```

### [확인 방법/주의점]
- `docker images` 로 크기 비교, `docker image history` 로 레이어별 크기 확인.
- `scratch` 는 쉘/OS 도구가 없어 정적 컴파일된 실행 파일만 가능.
- Docker 이미지 레이어 수 제한(127).

---

## Step 14. [실습] Node.js 환경 이미지 빌드

### [목적]
- Node.js(Express) 애플리케이션을 `node:20-alpine` 기반 Dockerfile 로 이미지화하고 컨테이너로 실행한다.

### [이론 설명]
- Node.js 는 V8 JavaScript 엔진 기반 런타임. base image 로 `node` 이미지를 쓴다.
- 프로젝트 구조: `Dockerfile`, `node_modules`, `package.json`(+`package-lock.json`), `public/`(index.html, styles.css, images), `server.js`.
- `package.json` 은 npm 이 관리하는 프로젝트 메타데이터(name, version, description, entry point, scripts, keywords, license, dependencies).
- `.dockerignore` 에 `node_modules`, `npm-debug.log` 등을 넣어 이미지에 불필요한 파일 복사를 방지.
- Dockerfile 순서: `COPY package*.json` → `RUN npm install` → `COPY . .` (의존성 레이어 캐시 활용).
- 호스트의 npm/node 버전(자료: npm 8.5.1, node 12.22.9)과 이미지의 Node(20)는 별개이다.
- **[원문 한글 자료 기반 보강 — Ch9 Clip6 '[실습] Nodejs 환경을 위한 image 빌드' (약 9분)]**
  - 위치: 직전 클립(5번)은 Python 기반 이미지 빌드, 이번이 두 번째 실습(Node.js base image). Ch9 폴더에 Node.js 관련 Dockerfile·소스를 미리 준비.
  - **Node.js 소개(슬라이드)**: 크롬 V8 JavaScript 엔진의 성능을 네트워크·파일 작업 같은 저수준 시스템 기능과 결합한 오픈소스 기술. 브라우저-서버 간 지속 연결이 필요한 앱, 채팅·웹 푸시 알림 같은 실시간 데이터 처리에 유용. 사용 기업: Netflix, ebay, PayPal, Linkedin, Twitter Lite, Medium, Uber 등. 활용: 단일 페이지 앱, 실시간 앱, IoT 앱, 위치 기반 앱, 스트리밍 앱.
  - **디렉터리 구성 5가지(슬라이드)**: 1) `Dockerfile` — nodejs base image 구성요소 / 2) `node_modules` — express 설치로 각종 의존성 정보가 기술되는 폴더(npm 설치 시 생성, Node 가 의존하는 패키지 모듈 보관) / 3) `package*.json` — app 이 사용하는 패키지 명세(버전, 의존성) / 4) `public` — css, index.html 등 정적 파일 / 5) `server.js` — 실행할 서버 코드.
  - **왜 컨테이너 안이 아니라 로컬에서 먼저 준비하나(강사)**: 컨테이너에 들어가 하나하나 설치하고 지우는 방식이 아니라, 이미지 개발용 로컬 호스트에서 npm 을 구축하고 소스를 준비한 뒤 **결과물만 이미지에 담아** 불필요한 설치 과정 없이 경량 이미지를 만든다. `sudo apt-get update`, `sudo apt-get -y install npm`, `npm version`(화면: npm 8.5.1, node 12.22.9).
  - **package.json 항목(슬라이드 표)**: package name(패키지/프로젝트/애플리케이션 이름) / version / description / entry point(먼저 실행되는 JS 파일, index.js or app.js) / test command(코드 테스트 명령, 미사용 시 빈 값) / git repository(코드 git 주소, 미사용 시 빈 값) / keywords(검색 키워드) / license(기본값). `npm init -y` 로 `name/version/main/scripts/keywords/author/license/dependencies` 가 담긴 package.json 자동 생성. express 는 Node.js 웹앱/API 서버 프레임워크이며 `server.js` 는 express 앱으로 `public` 을 정적 경로로 서비스, `/` 라우트에서 `public/index.html` 반환, 3000 포트 `app.listen`. `node server.js` 시 `Server running on http://localhost:3000` 이 보이면 Node 환경 정상.
  - public: `index.html` 에 `images/fastcampus.png` 로고, "Welcome to Fastcampus - Nodejs App using dockerfile", "This is a sample Nodejs application!" 문구, `styles.css` 로 배경색·글자색 지정.
  - **Dockerfile 선택 이유(강사)**: Docker Hub 의 공식 Node.js 이미지에는 20 과 최신 21 이 있는데 이번에는 **20 의 alpine(경량)** 선택. `WORKDIR /usr/src/app` → `package*.json` 만 먼저 복사해 `npm install` → 나머지 소스 복사 순서로 빌드 효율(캐시) 향상.
  - `.dockerignore` 에 `node_modules`, `npm-debug.log` 등 빌드 컨텍스트에 불필요한 항목을 지정해 빌드 속도·이미지 용량 관리.
  - 빌드: `docker build -t lab2-nodejs-app:1.0 --no-cache .` 처음엔 베이스 이미지 다운로드로 시간이 걸린 뒤 Dockerfile 대로 한 스텝씩 진행(`[1/5] FROM ... node:20-alpine@sha256:...`). 크기는 본문 텍스트에 188MB, 터미널 캡처 `docker images` 는 185MB 로 표기(영상 내 표기 차이; 이 문서는 캡처 기준 185MB). `docker image history` 결과: `CMD ["node" "server.js"]` 0B, `EXPOSE map[3000/tcp:{}]` 0B, `COPY . .` 61.4kB, `RUN npm install` 4.04MB, `COPY package*.json ./` 40.7kB, `WORKDIR /usr/src/app` 0B.
  - **강사 강조**: 이미지 기본 정보(레이어 구성·크기)는 `docker image history` 와 `docker image inspect` 로 반드시 확인, **"이미지의 가치는 결국 컨테이너가 동작하는 것"** 이므로 만든 뒤 반드시 컨테이너로 실행해 정상 동작 확인. 실수 사례: `curl localhost;3001` (세미콜론) → `curl: (7) Failed to connect to localhost port 80 ... Connection refused` (`;` 로 명령이 끊겨 `curl localhost` 가 80포트로 실행됨) → `curl localhost:3001` 로 정정, 브라우저는 `http://<서버IP>:3001`.
  - **마무리 당부(강사)**: Node base image 를 만든 것이며 추가 환경은 구성을 더 얹으면 된다. 이 실습은 **최적화까지 다루지 않았으므로** 운영 환경에서는 앞서 배운 Dockerfile 최적화·보안 요소를 반드시 반영.

### [사용한 CLI]
```bash
# 1. 호스트에서 npm 설치/확인 (앱 개발용)
sudo apt-get update
sudo apt-get -y install npm
npm version

# 2. 프로젝트 초기화 및 express 설치
npm init -y               # package.json 기본값으로 생성 (-y: 질문 생략)
npm install express       # express 설치 (node_modules, package-lock.json 생성)
node server.js            # 로컬 실행 확인 → "Server running on http://localhost:3000"
```
(server.js: express 를 불러와 `public` 디렉터리를 정적 서비스하고 3000 포트에서 `app.listen`. public/index.html 에 "Welcome to Fastcampus - Nodejs App using dockerfile" 문구.)

```bash
cd ~/fastcampus/ch09/nodejs
vi Dockerfile
vi .dockerignore
```
```text
# .dockerignore (빌드 컨텍스트에서 제외)
node_modules
npm-debug.log
```
```dockerfile
# ch09/nodejs/Dockerfile
# Node.js runtime base image 지정
FROM node:20-alpine

# 작업 디렉터리 지정
WORKDIR /usr/src/app

# 의존성 정의 파일(package.json, package-lock.json) 복사
COPY package*.json ./

# project 의존성 설치
RUN npm install

# application code 를 docker image 내부로 복사
COPY . .

# application port 를 docker daemon 에 알림
EXPOSE 3000

# application 실행
CMD ["node", "server.js"]
```
```bash
# 3. 빌드 / 확인 / 실행
docker build -t lab2-nodejs-app:1.0 --no-cache .
docker images | grep lab2                    # lab2-nodejs-app 1.0 ... 185MB
docker image history lab2-nodejs-app:1.0     # 레이어별 크기 (COPY package*.json 40.7kB, npm install 4.04MB, COPY . . 61.4kB ...)
docker image inspect lab2-nodejs-app:1.0     # 상세 정보 확인

docker run -d -p 3001:3000 lab2-nodejs-app:1.0
docker ps | grep lab2                        # 0.0.0.0:3001->3000/tcp
curl localhost:3001                          # (자료의 오타 `localhost;3001` 은 연결 실패 → `:` 사용)
# 브라우저: http://<IP>:3001
```
옵션 설명
- `docker build -t 이름:태그 .` : 현재 디렉터리의 Dockerfile 로 빌드, `.` 은 빌드 컨텍스트
- `--no-cache` : 캐시를 쓰지 않고 처음부터 빌드
- `-p 3001:3000` : 호스트 3001 → 컨테이너 3000

### [확인 방법/주의점]
- `curl localhost:3001` 또는 브라우저에서 페이지 문구가 보이는지 확인.
- `-p` 호스트:컨테이너 포트 순서 주의, `curl localhost;3001` 처럼 세미콜론을 쓰면 안 된다(자료의 실수 사례).
- `.dockerignore` 에 `node_modules` 를 제외하면 이미지에서 `npm install` 로 새로 설치되므로 호스트 환경과 분리된다.

---

## Step 15. [실습] 다양한 Dockerfile 로 이미지 빌드 (경량화 / multi-stage / ADD / Python Flask / dive)

### [목적]
- docker build 옵션과 Best Practice(경량 base, scratch, multi-stage, USER)를 실제로 적용하여 이미지 크기를 비교하고 dive 로 분석한다.

### [이론 설명]
- 빌드 명령: `docker build -t IMAGE_NAME:TAG [-f DOCKERFILE_NAME] DOCKERFILE_LOCATION` (`-t` 이름:태그, `-f` Dockerfile 이름 지정, 마지막 `.` 은 위치). `docker build -h`(또는 `--help`)에서 `--build-arg`, `--no-cache`, `-f/--file`, `--platform` 등을 확인.
- Dockerfile 의 각 instruction 은 이미지 레이어 1~N 이 되며 read-only, 컨테이너 실행 시 RW Container Layer 가 추가.
- 크기 비교 결과 요약

| 실습 | 이미지 | 크기 |
|---|---|---|
| 경량화 1-case1 (ubuntu:14.04 + apache2) | myweb:1.0 | 221MB |
| 경량화 1-case2 (apt clean/autoremove/rm 정리) | myweb:2.0 | 207MB |
| 경량화 1-case3 (alpine + apk) | myweb:3.0 | 13.1MB |
| 경량화 2 (ubuntu 기반 정적 바이너리) | lightweight:1.0 | 73.7MB |
| 경량화 2 (scratch 기반) | lightweight:2.0 | 900kB |
| multi-stage 실습3 (단일 stage Go) | goapp:1.0 | 317MB |
| multi-stage 실습3 (builder + scratch) | goapp:2.0 | 6.39MB |
| multi-stage 실습4 (ubuntu + USER) | webapp:1.0 | 177MB |
| multi-stage 실습4 (ubuntu builder + alpine + USER) | webapp:2.0 | 5.58MB |
| ADD tar.gz | webapp:3.0 | 250MB |

- dive 결과 예: myweb1(221MB)에서 Potential wasted space 28MB, Image efficiency score 88%.
- **[원문 한글 자료 기반 보강 — Ch9 Clip3 '[실습] 다양한 Dockerfile build' (약 44분, 이미지 경량화 Best Practice, Ch9 최장 실습)]**
  - 환경: MobaXterm 으로 접속한 우분투 서버 2대(fastcampus-hostos1/hostos2). hostos1 에서 빌드·push, hostos2 에서 pull 해 동일 동작을 확인('내 컴퓨터에서는 되는데 서버에서는 안 된다'를 검증하는 흐름).
  - `docker build -t IMAGE_NAME:TAG [-f DOCKERFILE_NAME] DOCKERFILE_LOCATION` — `-t` 생성할 이미지명:버전, `-f` 기본 Dockerfile 이 아닌 다른 파일명, 위치는 현재 경로면 `.`. 슬라이드 sample: `docker build -t myweb:1.0 .`(case1) / `docker build -t myweb:2.0 –f conf/dockerfile2 .`(case2; 원문의 `–f` 는 en-dash 표기이므로 실제로는 `-f`). `docker build -h` 는 deprecated 경고와 함께 `--help` 안내, 옵션 목록에 `--build-arg`, `--no-cache`, `-f/--file`, `--platform` 등이 있고 이후 실습에서 `-f` 와 `--no-cache`(캐시 없이 처음부터 재빌드, 용량 비교 시 필수)를 반복 사용.
  - **레이어 구조**: Dockerfile 한 줄이 Image Layer 1개(nginx 예시에서 FROM/RUN/COPY/EXPOSE/CMD 가 Image Layer 1~6). 이미지 레이어는 RO, `docker run` 시 쓰기 가능한 Container Layer(RW)가 추가되어 실행 중 생성·수정 파일은 맨 위 Container Layer 에만 반영. 이 구조를 알면 이후 경량화(불필요 파일 제거, scratch, multi-stage)가 '불필요한 레이어를 줄이거나 무거운 레이어를 최종 이미지에서 빼는 작업'임을 이해.
  - **실습1(fc-webserver)**: ubuntu:20.04 + nginx 5단계(Step1~5). 빌드 로그 `[+] Building 0.9s (8/8) FINISHED`, 2번 단계 `CACHED`(이전 캐시 재사용), 이미지 176MB, curl 응답 `<title>Docker Container Running Sample App.</title>`. **`docker image tag` 는 이미지를 복사하는 것이 아니라 같은 이미지에 별칭(레지스트리 계정/저장소명:태그)을 하나 더 붙이는 것**이며, 이 태그를 맞춰야 `docker push` 로 Docker Hub 에 올릴 수 있고 다른 서버는 그 태그로 pull 만 하면 동일 이미지를 재사용. (`docker login` 시 자격증명은 직접 입력하며 문서에 기록하지 않음.)
  - **경량화 case1~3 비교 해설**: apt 캐시·목록 파일을 그대로 두느냐(case1, 221MB) / 지우느냐(case2, 207MB, 약 6% 감소) / 더 가벼운 base 로 바꾸느냐(case3 alpine, 13.1MB, 약 94% 감소). case2 가 조금만 줄어드는 이유: 같은 레이어 안에서 apt 캐시를 지워도 ubuntu base 이미지 자체(약 190MB 안팎)는 그대로. case3 는 base 를 alpine(수 MB대)으로 바꾸고 더 가벼운 `apk` 패키지 매니저를 써서 10배 이상 감소. **결론: '파일을 지우는 것'보다 'base 이미지를 가볍게 고르는 것'이 효과적.** case3 빌드 로그: `[+] Building 4.1s (9/9)`, `[1/4] FROM alpine`, `[2/4] RUN apk update && apk add apache2`, `[3/4] WORKDIR /var/www/html`, `[4/4] ADD index.html .`.
  - **오류 사례(강사 라이브)**: case1 을 처음에 `FROM ubuntu:20.04` 로 잘못 저장해 빌드하다가 Ctrl+C(`CANCELED`) 후 `ubuntu:14.04` 로 고쳐 재빌드. 강사: "1번 값에 20.04 로 하시면 안 되고 중간에 설치하면서 물어보는 값이 있다" → ubuntu:20.04 위에서 apache2 설치 시 시간대(tzdata) 등 대화형 프롬프트가 떠 빌드가 멈출 수 있음. (일반적 우회: `DEBIAN_FRONTEND=noninteractive` — 자료에는 없는 일반 지식.)
  - **scratch(실습2)**: 도커가 제공하는 완전히 빈 이미지(OS·쉘·라이브러리 없음) → 외부 라이브러리에 의존하지 않는 **정적(static) 바이너리** 필요(`gcc --static`). 같은 실행파일로 ubuntu:20.04 기반 73.7MB vs scratch 기반 900kB(**약 82배**). 정적 컴파일이 가능한 Go, C, Rust 같은 배치형 애플리케이션에 적합. 두 컨테이너 모두 정상 실행 확인. (최소 용량 scratch: hub.docker.com/_/scratch)
  - **multi-stage(실습3, Go)**: scratch 는 강력하지만 '컴파일 도구 이미지'와 '실행 파일 이미지'를 따로 관리해야 하는 번거로움 → multi-stage 는 한 Dockerfile 안에 여러 FROM 을 두고 앞 stage 결과물만 `COPY --from=` 로 최종 stage 에 옮긴다. goapp:1.0 317MB vs goapp:2.0 6.39MB(약 50배). `docker image history goapp:1.0` 에서 약 293MB 가 alpine 위에 golang 툴체인을 설치한 레이어(`apk add ...`) — 실제 서비스에 필요한 건 컴파일된 `gostart` 6.39MB 뿐. 두 컨테이너(`-p 9091:9090`, `-p 9092:9090`, `-h goapp1/2`)가 동일하게 hostname·IP 출력. (참고: 영상의 goapp:2.0 history 캡처는 `COPY /usr/local/bin/gostart ...`/`CMD ["/usr/local/bin/gostart"]` 로 보여 Dockerfile 의 `/app/gostart` 와 경로가 다르다 — 자료 내 캡처 불일치로 추정, 확인되지 않은 부분.)
  - **multi-stage + 비root(실습4)**: webapp:1.0(ubuntu:14.04 단일, `useradd kevin`/`USER kevin`) 177MB → webapp:2.0(stage1 ubuntu:20.04+nginx, stage2 `alpine:3.12.1`, `addgroup -S appgroup && adduser -S kevin -G appgroup -h /home/kevin`, `USER kevin`) 5.58MB. 경량화와 **비root 실행을 함께 습관화**(root 로 실행되면 컨테이너 탈출 시 위험). ※ 참고: 1.0 의 ENTRYPOINT `["/appstart.sh"]`, 2.0 의 `["sh","/home/kevin/appstart.sh"]` 처럼 실행 방식이 서로 다르다.
  - **ADD 압축 해제(실습5)**: ADD 는 소스가 로컬 압축파일(tar, tar.gz)이면 복사하면서 자동으로 풀어줌. 디렉터리 `ch09/add-gz`(`dockerfile-add`, `webapp.tar.gz`). 포트 충돌 실제 사례: 8001 재사용 시 `Bind for 0.0.0.0:8001 failed: port is already allocated` → 컨테이너 이름·호스트 포트를 바꿔 재시도. 결과 `webapp:3.0` 250MB, `docker exec -it webapp3 ls -l /var/www/html` 에 `css/`, `index.html`, `pngs/`(소유자 uid 1000, 압축 해제됨). 영상 빌드 명령은 `-t myweb:3.0` 인데 images 출력은 `webapp 3.0` 이라 표기 불일치(자료 내 불일치).
  - **Python Flask(실습6)**: `requirements.txt` 에 `Flask`, **`.dockerignore` 에 `dockerfile-py`(Dockerfile 자체를 빌드 컨텍스트에서 제외)**, `python:3.8-alpine` 기반. 빌드 `[+] Building 66.4s (11/11)`. 실행 시 `WARNING: This is a development server. Do not use it in a production deployment.`, `Running on http://127.0.0.1:9000` 및 `http://172.17.0.7:9000`. 응답 문구 'Docker container application: Python & FlasK!'. **강사: `docker build` 가 successfully 로 끝나도 컨테이너로 돌려보면 에러가 나는 경우가 있다 → 빌드는 문법·레이어 생성만 확인하므로 반드시 `docker run` 으로 실제 응답까지 확인.** `-v ${PWD}/app:/py_app/app` 로 코드를 마운트했기에 `py_app.py` 문구를 'Docker container application: Fastcampus' 로 고치고 컨테이너 재시작(`docker start`)만 해도 재빌드 없이 새 포트(9090)에서 'Fastcampus: Docker CI/CD' 로 반영. 강사: "이 자체를 저희는 CI/CD 라고 하지만, 볼륨을 통해서도 가볍게 운영할 수 있다" — 개발 중에는 볼륨 마운트가 코드 변경을 즉시 확인하는 간단한 방법.
  - **dive**(github.com/wagoodman/dive): 이미지 최적화 점검 오픈소스. 자체도 이미지(`wagoodman/dive`)로 배포되며 도커 소켓을 마운트해 실행. 샘플 경로 `ch09/lightweight1`. TUI 에 레이어별 크기·파일 목록과 `Potential wasted space`(중복·불필요 점유 용량), `Image efficiency score`(100% 에 가까울수록 좋음)가 표시 — myweb1(221MB)은 28MB 낭비, 88%. **보안 점검**: 레이어별 파일 목록의 permission 컬럼을 방향키로 훑어 **SUID/GID 비트**가 설정된 실행파일 등 위험 항목을 찾고, 출처가 익숙하지 않거나 신뢰도 낮은 이미지는 dive 로 원치 않는 바이너리·취약한 권한 설정을 먼저 검사.

### [사용한 CLI]
```bash
# 0. 빌드 문법
cd ~/fastcampus/ch09
docker build -h                                   # deprecated 경고 → docker build --help
vi Dockerfile
docker build -t myweb:1.0 .                       # case1 : 기본 Dockerfile
vi conf/dockerfile2
docker build -t myweb:2.0 -f conf/dockerfile2 .   # case2 : -f 로 Dockerfile 이름/경로 지정
```
```bash
# (실습1 준비) ch09/sample 에서 index.html, Dockerfile 작성
cd ~/fastcampus/ch09/sample
vi index.html
vi Dockerfile
```
**(실습1) nginx 웹 서버 이미지 + Docker Hub push/pull**
```dockerfile
# ch09/sample/Dockerfile
# Step:1 ubuntu (base image)
FROM ubuntu:20.04
# Step:2 Nginx package install
RUN apt -y update && apt install -y -q nginx
# Step:3 source file copy
COPY index.html /var/www/html/
# Step:4 expose Port
EXPOSE 80
# Step:5 Nginx start (container execution)
CMD ["nginx", "-g", "daemon off;"]
```
```bash
docker build -t fc-webserver:1.0 .
docker images | grep fc                                   # fc-webserver 1.0 ... 176MB
docker run -d --name=fc-webserver -p 8001:80 fc-webserver:1.0
curl localhost:8001

# Docker Hub 에 올리기 (이미지 이름을 '계정/저장소:태그' 형태로 tag)
docker image tag fc-webserver:1.0 dbgurum/fastcampus:fcw1.0
docker login
docker push dbgurum/fastcampus:fcw1.0

# 서버 2 (hostos2) 에서 받아서 실행
docker pull dbgurum/fastcampus:fcw1.0
docker run -d --name=fc-webserver -p 8001:80 dbgurum/fastcampus:fcw1.0
curl localhost:8001
```
**(실습2) 경량화 1 : base 와 apt 정리**
```dockerfile
# case1 : dockerfile-myweb1
FROM ubuntu:14.04
MAINTAINER "kevin-lee <hylee@dshub.cloud>"
LABEL "purpose"="webserver practice"
RUN apt update && apt install apache2 -y
WORKDIR /var/www/html
COPY index.html .
EXPOSE 80
CMD apachectl -D FOREGROUND

# case2 : dockerfile-myweb2 (정리 추가)
FROM ubuntu:14.04
MAINTAINER "kevin-lee <hylee@dshub.cloud>"
LABEL "purpose"="webserver practice"
RUN apt update && apt install apache2 -y && \
    apt clean autoclean && \
    apt autoremove -y && \
    rm -rfv /tmp/* /var/lib/apt/lists/* /var/tmp/*
WORKDIR /var/www/html
COPY index.html .
EXPOSE 80
CMD apachectl -D FOREGROUND

# case3 : dockerfile-myweb3 (alpine)  ※ 자료에는 구성만 언급: FROM alpine, apk update && apk add apache2, WORKDIR /var/www/html, ADD index.html .
```
```bash
docker build -t myweb:1.0 -f dockerfile-myweb1 --no-cache .
docker build -t myweb:2.0 -f dockerfile-myweb2 --no-cache .
docker build -t myweb:3.0 -f dockerfile-myweb3 .
#  [1/4] FROM docker.io/library/alpine
#  [2/4] RUN apk update && apk add apache2
#  [3/4] WORKDIR /var/www/html
#  [4/4] ADD index.html .
docker images | grep myweb       # 1.0 = 221MB, 2.0 = 207MB, 3.0 = 13.1MB
```
(참고: `ubuntu:20.04` 로 apache2 를 설치하면 tzdata 설정 입력 대기가 발생하여 자료에서는 Ctrl+C 취소 후 `ubuntu:14.04` 로 변경.)

**(실습3) 경량화 2 : scratch + 정적 바이너리**
```bash
sudo apt -y install gcc
vi go-to-lightweight-image.c
```
```c
#include <stdio.h>
int main()
{
    printf("Go to lightweight image!\n");
    return 0;
}
```
```bash
gcc --static -o go-to-lightweight-image go-to-lightweight-image.c    # 정적 링크 컴파일
./go-to-lightweight-image                                            # Go to lightweight image!
```
```dockerfile
# dockerfile-ubuntu
FROM ubuntu:20.04
COPY go-to-lightweight-image /
CMD ["/go-to-lightweight-image"]

# dockerfile-scratch
FROM scratch
COPY go-to-lightweight-image /
CMD ["/go-to-lightweight-image"]
```
```bash
docker build -t lightweight:1.0 -f dockerfile-ubuntu --no-cache .    # 73.7MB
docker build -t lightweight:2.0 -f dockerfile-scratch --no-cache .   # 900kB
```
**(실습4) multi-stage build : Go 애플리케이션**
```bash
cd ~/fastcampus/ch09/multi-stage
vi gostart.go             # (gostart.go 소스 내용은 자료 텍스트에 미표기)
vi dockerfile-go1
vi dockerfile-go2
```
```dockerfile
# dockerfile-go1 (단일 stage)
FROM golang:1.15-alpine3.12
WORKDIR /app/
COPY gostart.go /app/
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /app/gostart
ENTRYPOINT [ "/app/gostart" ]

# dockerfile-go2 (multi-stage)
FROM golang:1.15-alpine3.12 AS gobuilder-stage     # --- stage1: 빌드 ---
MAINTAINER kevin.lee <hylee@dshub.cloud>
LABEL "purpose"="Application Deployment using Multi-stage builds."
WORKDIR /app/
COPY gostart.go /app/
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /app/gostart

FROM scratch                                       # --- stage2: 실행 ---
COPY --from=gobuilder-stage /app/gostart /app/gostart
CMD ["/app/gostart"]
```
```bash
docker build -t goapp:1.0 -f dockerfile-go1 --no-cache .
docker build -t goapp:2.0 -f dockerfile-go2 --no-cache .
docker images | grep goapp                         # 1.0 = 317MB, 2.0 = 6.39MB
docker image history goapp:1.0
docker image history goapp:2.0

docker run --name goapp1 -p 9091:9090 -d -h goapp1 goapp:1.0
docker run --name goapp2 -p 9092:9090 -d -h goapp2 goapp:2.0
curl localhost:9091       # hostname: goapp1  IP: [172.17.0.3]
curl localhost:9092       # hostname: goapp2  IP: [172.17.0.4]
```
(`-h` : 컨테이너 hostname 지정)

**(실습5) multi-stage build + root 사용자 제거**
```bash
vi appstart.sh
```
```bash
#!/bin/bash
echo "Best image build, multi stage build!"
```
```bash
chmod +x appstart.sh
```
```dockerfile
# dockerfile-app1 : 단일 stage
FROM ubuntu:14.04
RUN apt-get update -y && apt-get install nginx -y
COPY appstart.sh /
RUN useradd kevin
USER kevin
ENTRYPOINT ["/appstart.sh"]

# dockerfile-app2 : multi-stage
FROM ubuntu:20.04 as v1-stage                      # --- stage1 : 빌드 ---
RUN apt-get update && apt-get install nginx -y
WORKDIR /app
COPY appstart.sh /app

FROM alpine:3.12.1                                 # --- stage2 : 실행 ---
RUN addgroup -S appgroup && adduser -S kevin -G appgroup -h /home/kevin
COPY --from=v1-stage /app /home/kevin
USER kevin
ENTRYPOINT ["sh","/home/kevin/appstart.sh"]
```
```bash
docker build -t webapp:1.0 -f dockerfile-app1 --no-cache .
docker build -t webapp:2.0 -f dockerfile-app2 --no-cache .
docker images | grep webapp          # webapp 2.0 = 5.58MB, webapp 1.0 = 177MB
```
**(실습6) ADD 로 tar.gz 자동 해제**
```dockerfile
# dockerfile-add
FROM ubuntu:14.04
RUN apt-get update && apt-get -y install apache2 vim
ADD webapp.tar.gz /var/www/html
WORKDIR /var/www/html
```
```bash
cd ~/fastcampus/ch09/add-gz
ls                                                 # dockerfile-add  webapp.tar.gz
docker build -t myweb:3.0 -f dockerfile-add .      # 자료 출력에는 webapp:3.0 (250MB) 로 표기
docker images | grep webapp                        # webapp 3.0 ... 250MB
docker run -d -p 8001:80 --name=webapp3 webapp:3.0
curl localhost:8001
docker exec -it webapp3 ls -l /var/www/html        # css, index.html, pngs (압축이 풀려 있음)
```
(8001 포트가 이미 사용 중이면 `Bind for 0.0.0.0:8001 failed: port is already allocated` 오류 → 기존 컨테이너를 정리하거나 다른 포트 사용.)

**(실습7) Python & Flask 애플리케이션**
```bash
vi app/requirements.txt
#  Flask
vi .dockerignore
#  dockerfile-py
tree -a
# .
# ├── app
# │   ├── py_app.py
# │   └── requirements.txt
# ├── dockerfile-py
# └── .dockerignore
```
```dockerfile
# dockerfile-py
FROM python:3.8-alpine
RUN apk update && \
    apk add --no-cache \
    bash
RUN apk add --update build-base python3-dev py-pip
ENV LIBRARY_PATH=/lib:/usr/lib
ENV FLASK_APP=py_app
ENV FLASK_ENV=development
EXPOSE 9000
WORKDIR /py_app
COPY . /py_app
RUN pip install -r ./app/requirements.txt
ENTRYPOINT ["python"]
CMD ["./app/py_app.py"]
```
```bash
docker build -t py_flask:1.0 -f dockerfile-py .
docker run -it -p 9000:9000 -v ${PWD}/app:/py_app/app py_flask:1.0
#  * Serving Flask app 'py_app'  /  Debug mode: on  /  Running on http://127.0.0.1:9000
```
- `-v ${PWD}/app:/py_app/app` : 호스트 app 디렉터리를 bind mount → 소스(py_app.py)를 수정하면 이미지를 재빌드하지 않고 바로 반영 가능(자료에서는 py_app.py 문구를 수정하고 컨테이너를 재시작하여 9090 포트로 변경된 화면 확인).

**(분석) dive 로 이미지 효율 확인**
```bash
# dive 컨테이너로 Dockerfile 을 빌드하며 이미지 분석 (ch09/lightweight1 에서)
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)":"$(pwd)" \
  -w "$(pwd)" \
  -v "$HOME/.dive.yaml":"$HOME/.dive.yaml" \
  wagoodman/dive:latest build -t dive-webapp:1.0 -f dockerfile-myweb1 .
```
옵션 설명
- `-v /var/run/docker.sock:/var/run/docker.sock` : 컨테이너 안의 dive 가 호스트 Docker 를 사용하도록 연결
- `-v "$(pwd)":"$(pwd)" -w "$(pwd)"` : 현재 디렉터리를 같은 경로로 마운트하고 작업 디렉터리로 지정
- `wagoodman/dive:latest build -t ... -f ... .` : 빌드와 동시에 레이어별 분석(TUI)

### [확인 방법/주의점]
- 이미지 크기 비교는 `docker images | grep <이름>`, 레이어 구성은 `docker image history <이미지>`.
- dive 의 Total Image size, Potential wasted space, Image efficiency score 로 낭비 공간을 확인.
- `FROM scratch` 는 정적 컴파일 바이너리에서만 동작.
- multi-stage build 는 `COPY --from=<stage명>` 으로 최종 stage 에 필요한 결과물만 복사한다.
- 이미 사용 중인 호스트 포트(`port is already allocated`) 주의.
- USER 로 root 대신 일반 사용자 실행(자료에서는 alpine 에서 `addgroup`/`adduser` 사용).
