# Part 04. Docker Compose → Docker Swarm → Docker CI(GitHub Actions)로 인프라 구축하기

> 출처: 'CI/CD Docker 초격자' Ch10(docker compose) / Ch11(docker swarm cluster) / Ch12(docker CI) 요약 PDF 11개.
> 구성 순서: **Compose(단일 호스트 멀티 컨테이너) → Swarm(멀티 호스트 클러스터 오케스트레이션) → Stack(compose YAML을 swarm에 배포) → CI(GitHub Actions로 이미지 자동 빌드/푸시)**
> 참고: 처음에는 PDF 텍스트 추출본(한글 유실)으로 작성했으나, 이후 11개 PDF 전 페이지(총 195쪽)를 슬라이드 이미지로 직접 확인해 각 Step의 [이론 설명]에 '보강 근거' 블록으로 한글 원문 내용(강사 설명·주의점·오류 사례)을 보강하고 일부 오류를 정정했다. 자료에 없는 내용은 추가하지 않았다.

---

# PART A. docker compose (Ch10)

## Step 1. Docker CLI(docker run) 방식 vs docker compose 방식 비교 (wordpress + mysql 2-tier)

### [목적]
- 동일한 2-tier(wordpress + mysql) 앱을 (1) `docker run` + volume/network CLI, (2) `docker-compose.yaml` 두 방식으로 구축해 비교하고, compose가 왜 필요한지 체감한다.
- docker run 으로 수동 구성한 환경을 YAML 한 파일로 선언하고 `docker compose up / down` 한 번으로 생성/삭제한다.

### [이론 설명]
> 보강 근거: 'Clip 1. 멀티 컨테이너 서비스 구성'(약 29분, 18쪽) PDF 전체를 슬라이드 이미지로 확인함.
- **강사 강조(도입)**: 실무에서는 컨테이너를 `docker run`으로 만들지 않는다. `docker run`은 어디까지나 **테스트 용도**이고, 여러 컨테이너로 이루어진 서비스를 운영할 때 쓰는 도구가 docker compose이다. compose는 완전한 오케스트레이션 도구는 아니지만 '**스몰한 수준의 오케스트레이션 기능을 가진 멀티 컨테이너 서비스 도구**'로 소개된다.
- compose의 YAML은 결국 **docker run 등 도커 명령어의 옵션을 코드로 옮겨 적은 것**이다. 그래서 docker run 옵션에 익숙하지 않으면 YAML이 오히려 어색하므로, YAML 문법을 배우기 전에 먼저 CLI로 같은 서비스를 만들어 보는 순서를 택했다(Kubernetes YAML과 문법 구조는 다르지만, 여기서 익힌 감각은 개념적으로 비슷하게 적용됨).
- 실습 구조: wordpress_app(컨테이너 80 → 호스트 8888) ↔ mysql_app(3306) 2-tier. mysql은 MySQL Workbench/mysql 클라이언트로, wordpress는 브라우저(`192.168.56.101:8888`)로 확인.
- docker run 방식: volume 2개(mydb_data, myweb_data) + network 1개(my-webdb-net)를 먼저 CLI로 만들고, mysql_app → wordpress_app 순서로 컨테이너를 직접 띄운다. 옵션이 길고 순서/재현성 관리가 어렵다.
- compose 방식: `docker-compose.yaml`의 `services / image / volumes / networks / environment / ports` 항목이 docker run 옵션과 1:1 대응한다. 최상위 `volumes:` / `networks:`에 선언하면 `docker volume create`, `docker network create` 없이 `up`에서 자동 생성, `down`에서 (네트워크) 자동 삭제된다.
- `--link mysql_app:mysql` 은 구식 방식, 같은 사용자 정의 네트워크에서는 컨테이너 이름(DNS)으로 통신 가능. compose에서는 서비스 이름(`mydb`)이 곧 호스트명(`WORDPRESS_DB_HOST: mydb:3306`).
- `-e MYSQL_ROOT_PASSWORD`는 mysql 공식 이미지(Docker Hub) 문서에서 **필수로 지정하도록 명시한 값**이고, `MYSQL_DATABASE/USER/PASSWORD`는 그 외에 추가로 주는 초기 DB/사용자 생성용 설정값이다.
- wordpress_app이 `--net=my-webdb-net`으로 mysql_app과 같은 네트워크에 있기 때문에 IP 대신 **컨테이너 이름(mysql_app)** 만으로 서로 통신(API 통신)이 가능하다(네트워크 강의의 원리가 그대로 적용). 환경변수로 DB 이름·계정을 미리 지정해 두면 wordpress가 `WORDPRESS_DB_HOST=mysql_app:3306`으로 mysql을 찾아 자동 접속·초기화한다.
- 워드프레스 컨테이너는 자체 DB 엔진이 없다. 설치 마법사(한국어 선택 → 사이트 제목/사용자명/비밀번호/이메일 입력 → 설치 → 로그인)를 누르는 순간 입력 정보가 mysql DB로 전달되어 12개 테이블이 만들어지고 그중 wp_users 등에 로그인 계정 정보까지 기록된다.
- docker compose 특징(강사 정리 슬라이드): (1) 여러 번 docker CLI를 실행하지 않고 관련 애플리케이션들을 YAML 하나로 구성해 내부 환경과 속성을 한 번에 실행, (2) 설정 값을 **캐싱**하므로 재시작 시 변경이 없으면 캐싱된 정보를 그대로 써서 빠른 서비스 실행 보장, (3) YAML에 포함된 애플리케이션들은 **동일 네트워크**에 포함되므로 복잡한 연결 구성 없이 쉽게 API 통신 가능.
- 이번 실습에서는 이해를 돕기 위해 `frontend-net/backend-net`을 직접 지정했지만, 사실 `networks:` 항목을 아예 지정하지 않아도 compose가 알아서 **그 프로젝트(디렉터리)만의 독립된 bridge 네트워크**를 하나 만들어 같은 파일 안의 서비스들을 자동으로 묶어준다.
- `depends_on`(myweb → mydb): docker run 에서는 사람이 순서를 지켜 실행하던 것을 compose가 기동 순서로 대신 보장한다(단, 컨테이너 "시작 순서"만 보장).
- compose 파일은 서비스(컨테이너)를 추가/삭제하면서 YAML 코드로 관리하므로 팀 협업과 재사용에 유리하다.

### [사용한 CLI]

**(1) docker run 방식: volume/network 생성**
```bash
docker volume create mydb_data
docker volume create myweb_data
docker volume ls | grep my          # 오타로 만든 볼륨(mydb-data) 확인
docker volume rm mydb-data          # 잘못 만든 볼륨 삭제

# 네트워크 (서브넷 미지정 -> bridge, 172.21.0.0/16 자동 할당)
docker network create my-webdb-net
docker network ls                   # my-webdb-net  bridge  local
docker network inspect my-webdb-net # Driver: bridge, Subnet 172.21.0.0/16, Gateway 172.21.0.1

# (슬라이드 추가 명령) 작업 디렉터리 / 볼륨 상세
mkdir my-webdb && cd $_                     # ch10/my-webdb 생성 후 이동
docker inspect --type volume mydb_data      # 볼륨 상세(Mountpoint 등)
docker inspect --type volume myweb_data
```
- `docker volume create <이름>`: Docker 관리 볼륨 생성(`/var/lib/docker/volume` 하위). `ls`/`rm`/`inspect`로 확인·삭제.
- 슬라이드에 나온 추가 명령: `mkdir my-webdb && cd $_`(ch10/my-webdb 디렉터리), `docker inspect --type volume mydb_data` / `docker inspect --type volume myweb_data`(볼륨 상세 확인), `docker network create my-webdb-net` 후 `docker network ls`(NAME my-webdb-net, DRIVER bridge, SCOPE local), `docker network inspect my-webdb-net`.
- **실수 사례(실습 중 확인)**: 볼륨명을 `mydb_data`(밑줄) 대신 `mydb-data`(하이픈)로 잘못 입력해 의도하지 않은 볼륨이 하나 더 생겼고(`docker volume ls | grep my`로 확인), `docker volume rm mydb-data`로 정리했다. 이름 오타는 실무에서도 흔하므로 생성 직후 `ls`로 확인하는 습관이 좋다.
- 네트워크는 서브넷을 지정하지 않고 만들었으며 inspect 결과 Driver: bridge, Subnet 172.21.0.0/16, Gateway 172.21.0.1 이 **자동 할당**되었다(정정: 서브넷을 직접 지정해 생성한 것이 아님).

**(2) docker run 방식: mysql / wordpress 컨테이너 실행**
```bash
# mysql 컨테이너
docker run -itd \
  --name=mysql_app \
  -v mydb_data:/var/lib/mysql \
  --restart=always \
  -p 3306:3306 \
  --net=my-webdb-net \
  -e MYSQL_ROOT_PASSWORD=password# \
  -e MYSQL_DATABASE=wpdb \
  -e MYSQL_USER=wpuser \
  -e MYSQL_PASSWORD=wppassword \
  mysql:8.0-debian

# wordpress 컨테이너
docker run -itd \
  --name=wordpress_app \
  -v myweb_data:/var/www/html \
  -v ${PWD}/myweb-log:/var/log \
  --restart=always \
  -p 8888:80 \
  --net=my-webdb-net \
  -e WORDPRESS_DB_HOST=mysql_app:3306 \
  -e WORDPRESS_DB_NAME=wpdb \
  -e WORDPRESS_DB_USER=wpuser \
  -e WORDPRESS_DB_PASSWORD=wppassword \
  --link mysql_app:mysql \
  wordpress:5.7
```
- `-itd`: 대화형+tty+백그라운드. `--name`: 컨테이너명. `-v 볼륨:경로`: 볼륨/바인드 마운트. `--restart=always`: 항상 재시작. `-p 호스트:컨테이너`: 포트 매핑. `--net`: 연결 네트워크. `-e`: 환경변수. `--link`: (구식) 다른 컨테이너 별칭 연결.

**(3) 동작 확인**
```bash
docker ps                                   # wordpress_app(8888->80), mysql_app(3306) Up 확인
docker exec -it mysql_app bash              # mysql 컨테이너 접속
mysql -uroot -p                             # 접속 후 비밀번호 입력
mysql> show databases;                      # information_schema, mysql, performance_schema, sys, wpdb
mysql> use wpdb;
mysql> show tables;                         # 설치 전: Empty set / 설치 후: wp_users, wp_posts 등 12개 테이블
```
- **mysql 접속 시 만난 오류(실습 화면)**: 컨테이너 기동 직후 `mysql -uroot -p` 하면 `ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2)` (mysqld 서버가 아직 준비되지 않음 → 잠시 후 재시도), 이어서 `ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)` (비밀번호 오입력 → `-e MYSQL_ROOT_PASSWORD=password#` 에 지정한 올바른 값으로 재시도)가 나온 뒤 접속 성공(MySQL 8.0.33). `show databases;` 결과는 information_schema, mysql, performance_schema, sys, wpdb(5 rows).
- 브라우저: `http://<서버IP>:8888/wp-admin/install.php` 에서 WordPress 설치 → 설치 후 `show tables;` 로 테이블 12개 생성 확인.

**(4) docker compose v2 설치/버전 업데이트** (플러그인 방식, 예: v2.18.1 → v2.19.1)
```bash
docker compose version                                  # Docker Compose version v2.18.1

DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.19.1/docker-compose-linux-x86_64 \
  -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

docker compose version                                  # Docker Compose version v2.19.1
```
- `curl -S -L`: 오류 표시 + 리다이렉트 추적. `-o`: 저장 경로. 실행권한(`chmod +x`) 필수.

**(5) docker-compose.yaml (docker run 과 대응)** — 디렉터리 `ch10/my-webdb`
```yaml
# (파일 맨 위: version: "3.9" / services:  -- 슬라이드 기준, 아래 서비스는 services: 하위)
# mydb 서비스 (mysql)
mydb:
  image: mysql:8.0-debian            # docker run: mysql:8.0-debian
  container_name: mysql_app          # --name=mysql_app
  volumes:
    - mydb_data:/var/lib/mysql       # -v mydb_data:/var/lib/mysql
  restart: always                    # --restart=always
  ports:
    - "3306:3306"                    # -p 3306:3306
  networks:
    - backend-net                    # --net=...
  environment:
    MYSQL_ROOT_PASSWORD: password#   # -e MYSQL_ROOT_PASSWORD=...
    MYSQL_DATABASE: wpdb             # (슬라이드 확인) 나머지 환경변수도 동일하게 기술
    MYSQL_USER: wpuser
    MYSQL_PASSWORD: wppassword

# myweb 서비스 (wordpress)
myweb:
  depends_on:
    - mydb                           # mydb 먼저 기동
  image: wordpress:5.7
  container_name: wordpress_app
  ports:
    - "8888:80"
  networks:
    - backend-net
    - frontend-net
  volumes:
    - myweb_data:/var/www/html
    - ${PWD}/myweb-log:/var/log
  environment:
    WORDPRESS_DB_HOST: mydb:3306     # 서비스명으로 DB 접속 (--link 불필요)
    WORDPRESS_DB_USER: wpuser        # (슬라이드 확인)
    WORDPRESS_DB_PASSWORD: wppassword
    WORDPRESS_DB_NAME: wpdb

# 최상위 networks / volumes 선언
networks:
  frontend-net:
  backend-net:
volumes:
  mydb_data:
  myweb_data:
```

**(6) 실행/삭제**
```bash
# [실습1] docker run 컨테이너 정리(포트 충돌 방지) 후 YAML 작성
docker stop mysql_app wordpress_app
docker rm mysql_app wordpress_app
vi docker-compose.yaml

cd my-webdb
tree                      # docker-compose.yaml, myweb-log 확인
docker compose up         # 네트워크 2, 볼륨 2, 컨테이너 2 자동 생성 (이미지 없으면 wordpress 등 pull)
docker compose up -d      # (참고) 백그라운드 실행
docker compose ps         # compose 로 만든 컨테이너 목록(docker ps 와 동일하게도 확인 가능)
docker compose down       # 컨테이너/네트워크 Removed (볼륨은 유지)
```
- docker run으로 만든 컨테이너는 YAML 작성 전에 `docker stop mysql_app wordpress_app` / `docker rm mysql_app wordpress_app` 으로 정리 후 compose 실행(포트 충돌 방지).
- 슬라이드 확인: `docker compose up` 시 `[+] Running 6/6` — Network my-webdb_backend-net / my-webdb_frontend-net, Volume "my-webdb_mydb_data" / "my-webdb_myweb_data", Container mysql_app / wordpress_app 이 한 번에 Created(이름 앞에 프로젝트=디렉터리명 `my-webdb_` 접두사가 붙음). `docker compose down` 은 `Running 4/4` — 컨테이너 2개 + 네트워크 2개 Removed(볼륨은 남음).
- docker run 대 YAML 1:1 대응(슬라이드 표): `image`=이미지명(마지막 인자) / `container_name`=`--name` / `volumes`=`-v` / `restart: always`=`--restart=always` / `ports`=`-p` / `networks`=`--net`(필요 시 `docker network connect`로 네트워크 추가하는 것과 동일, myweb은 backend-net+frontend-net 2개) / `environment`=`-e` (myweb의 `WORDPRESS_DB_HOST: mydb:3306`은 `-e ...=mysql_app:3306`과 `--link`에 대응) / `depends_on: - mydb`는 docker run에는 없는 항목(docker run에서는 사람이 mysql_app을 먼저 실행해야 했지만 compose는 서비스 실행 순서를 선언적으로 관리). 최상위 `networks:`/`volumes:`는 `docker network create` / `docker volume create` 에 대응(`frontend-net: {}` 처럼 `{}`는 기본값).
- 호스트 운영체제와 컨테이너의 3306 포트를 바인드하는 이유: workbench 같은 클라이언트 도구와 연결하기 위함(슬라이드 주석).
- `services:`가 복수형인 이유: 멀티 컨테이너 서비스이므로 하나 이상의 컨테이너(서비스)가 그 아래에 들어가기 때문. YAML 구조(버전 표기, 들여쓰기 등)는 다음 클립(Clip2)에서 상세히 다룬다.

### [확인 방법/주의점]
- `docker compose up` 시 이미지 pull 이 오래 걸릴 수 있으며(wordpress 21개 레이어 Pulling/Downloading, `[+] Running 5/22`), 중간에 Ctrl+C 하면 다시 `up` 하면 이어서 진행.
- **강사가 실습 중 겪은 실수 2가지(그대로 보여줌)**: ① YAML에 wordpress 이미지 태그를 `5.7`로 명시하지 않아 **최신(latest) 이미지가 새로 받아져** 다운로드가 오래 걸림 → Ctrl+C로 중단 후 `wordpress:5.7`로 고쳐 재실행. 태그를 명시하지 않으면 의도치 않게 최신 버전이 받아질 수 있다. ② YAML에 설명용 **주석을 잔뜩 달고 실행하다 파싱 에러** 발생(콜론 뒤 값이 있는 줄에 주석을 붙이는 방식 등이 YAML 문법과 충돌했다고 판단) → 주석 없는 버전으로 바꿔 정상 기동. YAML 주석 문법에 주의.
- docker compose 명령은 `docker-compose.yaml` 파일이 있는 디렉터리에서만 실행할 수 있다. `docker compose ps` 로 보는 컨테이너 목록도 일반 `docker ps`에 동일하게 나타난다.
- docker run 때는 이미지가 로컬에 있었지만 [실습2]는 컨테이너를 새로 지운 상태라 wordpress 레이어를 처음부터 pull. `docker rmi`로 지우지 않는 한 두 번째 실행부터는 pull이 생략되어 훨씬 빠르다. 실습 전에 이미지를 미리 pull 해 두면 시간을 아낄 수 있다.
- 태그를 `latest`가 아닌 명시 버전(`wordpress:5.7`)으로 고정(재현성).
- compose로 띄운 wordpress도 `192.168.56.101:8888/wp-admin/install.php` 에서 동일한 언어 선택/설치 화면이 뜬다 — 두 방식이 결과적으로 같은 서비스를 만든다는 확인.
- 접속 후 WordPress 초기 설치 화면(`/wp-admin/install.php`)이 뜨고, DB(`wpdb`)에 테이블이 만들어지면 성공.
- docker run 과 compose 는 이름 규칙 등이 다를 수 있으므로 같은 이름으로 동시에 띄우지 말 것.

---

## Step 2. docker compose 개념 + YAML 문법 + docker-compose.yml 작성법

### [목적]
- compose 가 무엇이고(Kubernetes와의 차이), YAML 문법과 docker-compose.yml 의 주요 항목(version/services/networks/volumes/healthcheck)을 익힌다.

### [이론 설명]
> 보강 근거: 'Clip 2. docker compose YAML 코드 작성과 CLI'(29쪽) PDF 전체를 슬라이드 이미지로 확인함.

**docker compose란**
- 슬라이드 정의: docker compose(또는 compose)는 kubernetes와 같이 컨테이너 오케스트레이션 및 컨테이너화된 애플리케이션 관리에 사용되는 널리 쓰이는 도구이며, 다중 컨테이너 Docker 애플리케이션을 정의하고 실행하기 위한 도구다. YAML 파일로 애플리케이션 서비스를 수행하고, 이후 docker compose CLI로 모든 서비스의 라이프 사이클을 관리한다.
- **'응집력 있는 애플리케이션(cohesive application)'**: 로컬 개발 및 테스트 환경을 위해 설계된 도구라는 뜻. '응집력'은 여러 컨테이너가 하나의 서비스처럼 강한 공통성(연관성)을 가지고 함께 동작한다는 의미(예: 3-Tier에서 외부 트래픽이 프론트 → 백엔드 → DB 요청/처리 → 다시 프론트로 응답).
- 여러 컨테이너로 이루어진 하나의 응집된 애플리케이션(예: 3-Tier: 프론트엔드 Node.js/React/Angular + 백엔드 Spring Boot/Flask/Node.js + DB MySQL)을 YAML 파일 하나로 정의/실행/삭제하는 도구. 단일 Docker 호스트용.
- 강사 강조: 단일 호스트의 개발·테스트용으로는 compose만으로 충분하지만 여러 호스트로 확장하는 대규모 서비스에는 한계가 있어 결국 Kubernetes 같은 오케스트레이션 도구로 넘어가게 된다 — compose는 '**k8s로 가기 전 단계**'. 또한 compose YAML은 다음 챕터의 docker swarm `docker stack` 명령에도 그대로 재활용 가능(동일 yaml을 stack으로 배포하면 여러 호스트로 구성된 스윔 클러스터 전체에 배포).
- **장점**: 서로 다른 OS 환경이라도 동일한 환경 구성이 가능(이식성), 동일 환경이라 개발환경 이슈가 발생해도 팀 간 소통이 쉬움('동상이몽' 방지), 복잡한 환경도 YAML로 스크립트화해 자동화 가능, compose CLI로 멀티 컨테이너 애플리케이션을 쉽게 관리. **단점**: 동시에 다수의 컨테이너 서비스를 수행하는 경우(MSA) 자원 활용률이 순간 높아질 수 있음, 사용하려면 충분한 docker container 기술 이해도가 필요.
- docker compose 3단계 프로세스: 1) Dockerfile 작성으로 배포할 애플리케이션 환경 정의(선택) 2) docker-compose.yaml(or compose.yaml)로 하나 이상의 컨테이너 서비스 정의 3) `docker compose up`으로 시작·실행. compose로 실행된 컨테이너들은 독립된 네트워크로 구성되므로 컨테이너 간 통신이 쉽다.
- `docker compose down` 은 컨테이너 Stop + Remove, Network Remove 까지 한 번에 처리.
- 사용 3단계: 1) Dockerfile 로 이미지 정의(필요 시) 2) `docker-compose.yaml`(또는 `compose.yaml`)에 서비스 구성 3) `docker compose up`.
- compose YAML 은 docker swarm 의 `docker stack` 에서도 거의 그대로 사용(→ Part B).

**docker compose vs Kubernetes (슬라이드 비교표, 둘 다 '선언적(YAML) 구성')**

| 비교 | docker compose | kubernetes |
|---|---|---|
| 사용 범위 | 단일 호스트(로컬)에서의 개발, 테스트 및 소규모 배포에 적합 | 클러스터로 구성된 전체 머신을 기반으로 컨테이너화된 애플리케이션 배포에 적합 |
| 구조 | 단일 시스템에서 컨테이너 간의 실행, 상호 작용 및 종속성 관리 | 클러스터의 여러 노드에서 컨테이너를 오케스트레이션하고 확장, 로드밸런싱 메커니즘 제공 |
| 확장성/고가용성 | 여러 호스트 서비스를 지원하지 않음(단, docker swarm 클러스터에서는 지원) | 수요에 따른 애플리케이션 자동 확장 및 분산, 컨테이너 재시작 및 자동 장애 처리 기능 제공 |
| 서비스 검색/로드밸런싱 | 자체 네트워크 생성, 컨테이너 연결 지원 및 서비스 간 포트 노출. 자체 로드밸런싱 없음 | DNS 기반 서비스 검색과 다중 컨테이너 간 분산 처리하는 로드밸런싱 제공 |
| 롤링 업데이트/배포 전략 | 수동적 롤링 업데이트만 지원 | 다운 타임 없이 컨테이너 업데이트 가능, Blue/green 및 카나리아 배포 전략 제공 |

(정정: 기존 서술과 달리 compose는 자체 로드밸런싱이 없고 수동 롤링 업데이트만 지원한다.)

**YAML**
- 'Yet Another Markup Language' / 'YAML ain't markup language'(Text file). 사람이 쉽게 읽을 수 있는 데이터 직렬화 언어(위→아래)로 구성 파일 작성에 주로 사용. 설계상 가장 먼저 실행돼야 하는 애플리케이션을 먼저 작성하고 그에 의존하는 DB·하위 애플리케이션을 작성(클러스터라면 마스터 노드 → 데이터 노드 순). 네트워크·볼륨·캐시 등 기반 환경까지 코드에 모두 설정할 수 있으므로 서비스 전체를 하나의 docker-compose.yaml로 작성 가능.
- 프로그래밍 언어 설정 파일뿐 아니라 클라우드 자동 환경 배포 도구(IaC)로도 많이 사용: AWS CloudFormation(작성한 YAML을 콘솔에 넣으면 가상 인프라가 자동 구축), Redhat Ansible, Terraform, Puppet 등 자동화 도구가 대부분 YAML 기반(강사 언급).
- YAML vs JSON(슬라이드 표): YAML은 주석 사용 가능, 한글 등 유니코드를 그대로 사용 가능, 주로 환경 구성 등 설정 파일 작성에 사용. JSON(JavaScript Object Notation)은 주석 사용 불가, 한글 등 멀티바이트 문자는 인코딩 수행, 주로 API 작성 시 사용(강사: 요즘 Elasticsearch·MongoDB 같은 NoSQL에서 실시간 비정형 데이터 저장에 많이 쓰임). YAML은 중괄호·대괄호 없이 들여쓰기만 지키면 되며, 콜론(:) 앞에는 공백을 붙이지 않고 뒤에는 한 칸 띄운다(`key: value`).
```yaml
# YAML
version: '3.8'
services:
  mydb:
    image: mariadb:10.4.6
```
```json
{
  "version": "3.8",
  "services": {
    "mydb": { "image": "mariadb:10.4.6" }
  }
}
```
- 문법 규칙: 들여쓰기로 계층 구분(Python 처럼), **탭 금지 / 공백(보통 2칸)** 사용, key: value 형식(`:` 뒤 공백), 값은 문자열/숫자/Boolean/리스트(`- `)/딕셔너리, `#` 주석, `---` 문서 시작, `...` 문서 끝.
- 들여쓰기 오류 예: 같은 레벨 키의 들여쓰기가 어긋나면 error (하위 키가 상위 키와 정렬 안 되면 오류).
- 슬라이드 문법 특징: 중괄호·대괄호·닫기 태그·따옴표 같은 통상적인 형식 기호가 없고, Python 스타일의 들여쓰기로 구조(중첩)를 표시. 시스템 전반의 이식성을 위해 들여쓰기는 탭(tab) 문자를 허용하지 않고 공백*n 으로 규칙성 있게 사용. key는 python dictionary의 key, value는 dictionary의 value와 동일(숫자형·문자형·Boolean형 지원). `#` 주석, `---` 문서 시작(선택), `...` 문서 끝(선택).
- 계층 구조는 부모-자식 간의 레벨을 규칙성 있는 들여쓰기로 엄격히 구분해야 한다. 슬라이드의 에러 예 2가지: (에러1) 자식-2의 들여쓰기가 자식-1과 어긋남, (에러2) 자식-2-2의 들여쓰기가 자식-2-1과 어긋남.
- **강사 팁**: YAML 오류의 대부분은 문법 자체보다 공백이 한 칸이라도 어긋나서 생기는 들여쓰기 오류이므로, 편집기의 공백 표시 기능을 켜 놓고 작성하는 습관을 들이면 좋다.

**docker-compose.yml 기본 구조**
```yaml
version: "3.8"
services:
  서비스1:
    # 서비스1 설정
  서비스2:
    # 서비스2 설정
networks:
  # 네트워크 정의
volumes:
  # 볼륨 정의
```
- 파일 위치: docker-compose.yaml(또는 docker-compose.yml / compose.yaml)은 해당 프로젝트의 최상위 디렉터리에 위치하며 하위 프로그램의 설정과 연관성을 코드화한다. `networks`는 '미 지정 시 자동 생성', `volumes`는 선택.
- `version`: 일반적으로 첫 줄에 명시(순서 무관). docker engine release와 연관되는 Compose file format 이며(공식 문서 compose-versioning 참고) 현재 Docker 엔진에 맞는 버전을 써야 한다. 맞지 않으면 아래 오류. 최신 compose(v2)에서는 version 생략 가능(참고: 자료의 오류 문구)
```text
ERROR: Version in "./docker-compose.yml" is unsupported. You might be seeing this error because
you're using the wrong Compose file version. Either specify a supported version (e.g "2.2" or "3.3") ...
```
- `services` 하위 주요 항목과 docker run 옵션 대응:

| compose 항목 | 의미 | docker run 대응 |
|---|---|---|
| `build` (`context`, `dockerfile`) | Dockerfile 로 이미지 빌드. `build: .` 로 약식 가능 | docker build |
| `image` | 사용할 이미지 | 이미지명 |
| `container_name` | 컨테이너 이름 (없으면 `프로젝트_서비스_n`) | `--name` |
| `ports` | 호스트:컨테이너 포트 | `-p` |
| `expose` | 컨테이너 간에만 노출(호스트 미공개) | (EXPOSE) |
| `networks` | 연결 네트워크 | `--net/--network` |
| `volumes` | 볼륨/바인드 마운트 | `-v/--volume` |
| `environment` / `env_file` | 환경변수 / 파일(`env_file: ./envfile.env`) | `-e` / `--env-file` |
| `command` | 컨테이너 실행 명령 재정의 | 이미지 뒤 명령 |
| `restart` | 재시작 정책(`always` 등) | `--restart` |
| `depends_on` | 서비스 기동 순서 | (수동 순서) |
| `scale` (V2) / `deploy.replicas` (V3) | 컨테이너 수 | — |

- `container_name` 을 지정하면 이름 중복 불가(scale 불가능), 지정하지 않으면 `프로젝트_서비스_n` 이름이 자동 부여되어 scale 가능.
- 비밀번호 같은 값은 `environment` 대신 `env_file`(.env) 로 분리 권장(자료의 설명).

### [사용한 CLI]

**build 예시**
```yaml
mydiary-front:
  build:
    context: ./my-diary-front   # Dockerfile 이 있는 디렉터리 (빌드 컨텍스트)
    dockerfile: Dockerfile      # 사용할 Dockerfile 이름
```
- Dockerfile 이름이 `Dockerfile` 이고 같은 디렉터리라면 `build: .` 로 축약.

**scale / deploy.replicas**
```yaml
# V2 방식 (deprecated)
services:
  mydiary-back:
    image: mydiary-back:1.0
    scale: 3

# V3 방식
services:
  mydiary-back:
    image: mydiary-back:1.0
    deploy:
      replicas: 3
      mode: replicated
```
```bash
# V3 에서 scale 이 deprecated 경고(WARN: `scale` is deprecated. Use the `deploy.replicas` element)가 뜰 때
docker-compose --compatibility up -d
```

**networks 정의** (외부 네트워크 사용 / 서브넷 직접 지정)
```yaml
# 1) 외부(기존) 네트워크 사용
version: "3.9"
services:
  # ...
networks:
  default:
    external:
      name: vswitch-ap

# 2) 네트워크 직접 정의 (driver / ipam)
networks:
  fastapp-net:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: 172.20.0.0/24
          ip_range: 172.20.0.0/24
          gateway: 172.20.0.1
```
- `subnet 172.20.0.0/24` : /24 → 256개 IP. `ip_range`: 컨테이너에 할당할 범위. `gateway`: 게이트웨이. `external`: 이미 존재하는 네트워크 사용.

**volumes 정의** (Docker 관리 볼륨)
```yaml
version: "3.8"
services:
  mydb:
    image: mysql:5.7
    volumes:
      - db_data:/var/lib/mysql
  myweb:
    image: wordpress:latest
    volumes:
      - web_data:/var/www/html
networks:
volumes:
  db_data: {}      # {} = 기본값 (docker volume create 와 동일)
  web_data: {}
```
```bash
docker volume ls
docker volume inspect <볼륨명>
```
- 볼륨은 `/var/lib/docker/volume` 하위에 저장. 호스트 경로 직접 마운트는 바인드 마운트(`${PWD}/경로:컨테이너경로`).

**healthcheck**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost"]
  interval: 1m00s      # 검사 주기
  timeout: 10s         # 응답 대기 제한
  retries: 3           # 실패 허용 횟수
  start_period: 30s    # 컨테이너 시작 후 유예 시간
```

**YAML 검증 도구(문법 오류 확인)**
- http://www.yamllint.com/ , https://codebeautify.org/yaml-validator , https://onlineyamltools.com/validate-yaml
- 또는 `docker compose config` 로 문법/해석 결과 확인.

### [확인 방법/주의점]
- 들여쓰기에 탭을 쓰지 않는다. 문법 오류가 의심되면 YAML validator 또는 `docker compose config`.
- version 오류 원인(슬라이드 3가지): 1) 작성한 버전과 현재 docker compose 또는 Docker 엔진 릴리즈가 적합하지 않은 경우, 2) docker compose 도구가 오래된 경우 → 새로운 버전으로 업데이트, 3) 버전 문제가 아닌 **들여쓰기의 공백 수가 하위 레벨과 맞지 않아서** 발생하는 경우. (해결: 버전 확인·지원 버전 지정/생략, 공식 문서 compose-versioning 호환 확인)
- `scale` 관련: V2 문법의 `scale` 을 그대로 쓰면 `WARN[0000] 'scale' is deprecated. Use the 'deploy.replicas' element` 경고가 뜨는데 **오류가 아니라 V3부터 deploy.replicas를 쓰라는 안내**다. 예전 방식을 유지하려면 `docker-compose --compatibility up -d`. **`depends_on`은 오타로 's'를 자주 빠뜨리는 필드**(강사 주의). scale/deploy.replicas로 복제할 서비스에는 `container_name`을 절대 지정하면 안 된다 — container_name은 유일(unique)해야 하는데 복제 컨테이너 이름이 같으면 충돌하므로 이름 뒤에 숫자(n)를 자동 부여하는 기본 작명 규칙을 써야 한다.
- 필드 보충(슬라이드): `build`는 Dockerfile을 직접 빌드해 이미지를 만든 뒤 컨테이너까지 띄우는 옵션이라 별도 `docker build`가 불필요, Dockerfile이 같은 경로에 있고 표준명('Dockerfile', 대문자 D)이면 `build: .` 만 적어도 됨. compose는 '디렉터리 단위 개발'이 원칙(한 프로젝트 디렉터리에서 관련 파일 모두 관리, container_name 기본 작명 `디렉터리명_서비스명_n`의 유래). `ports`(-p)는 컨테이너가 이미 노출 중인 포트를 호스트 포트와 바인딩, `expose`는 호스트 OS와 직접 연결하지 않고 링크로 연결된 서비스 간 통신만 필요할 때 '추가로' 노출. `networks`를 지정하지 않으면 compose가 알아서 기본 브리지 네트워크를 만들어 쓰고, 이미 만들어 둔 네트워크를 재사용하려면 이름을 명시(`external`). `volumes`는 서비스 내부 디렉터리와 호스트 디렉터리를 연결해 데이터 지속성 설정. `environment`는 MYSQL_ROOT_PASSWORD처럼 필수로 넘길 환경변수 지정용이고 변수가 많으면 파일로 분리해 `env_file`(확장자는 반드시 `.env`)로 지정. `restart: always`는 컨테이너가 죽었을 때 자동 재시작. `command`는 서비스 구동 이후 실행할 명령어(docker run 마지막에 적는 명령어).
- `networks` 필드: 최상위에서 네트워크 키를 정의하고 하위 서비스 단위로 선택. `driver`(bridge가 아닌 다른 네트워크 사용), `ipam`(IP Address Manager: subnet/ip_range/gateway 범위 설정), `external`(기존 네트워크 사용). `subnet 172.20.0.0/24`처럼 /24 대역이면 총 256개 IP, `ip_range`로 그 하위 범위를 더 좁힐 수 있고 `gateway`로 게이트웨이 주소 지정.
- `volumes` 필드: 데이터 지속성을 위해 최상위에 볼륨 정의 후 서비스에서 `볼륨명:컨테이너경로` 바인드. docker volume create 와 동일하게 Docker가 관리하는 `/var/lib/docker/volume`에 배치, `docker volume ls` / `docker volume inspect 볼륨명`으로 확인. 호스트 특정 경로를 직접 지정하는 바인드 마운트를 쓰려면 최상위 volumes에 이름을 정의하지 않고 서비스 하위에 절대 경로(또는 `${PWD}`)를 직접 적는다.
- `healthcheck`: 컨테이너 서비스 시작 후 30초(`start_period`)부터 1분(`interval: 1m00s`)마다, 웹 서비스가 10초(`timeout`) 이내에 기본 페이지를 응답해야 하고 실패 시 3회(`retries`) 재시도.
- YAML 검증 사이트는 **들여쓰기(문법) 오류만** 잡아줄 뿐 docker compose 고유의 필드명이 올바른지는 검증하지 않는다. 실제 필드 유효성은 `docker compose config` 로 최종 확인하는 것이 안전.
- `depends_on` 은 기동 순서만 보장(서비스 준비 완료까지는 보장하지 않음 – 아래 Step 5의 'host not found' 사례 참고).

---

## Step 3. docker compose CLI 사용 (flask + redis 실습, scale)

### [목적]
- `docker compose` CLI 주요 명령(up, ps, logs, config, pause/unpause, port, scale, down)을 실습으로 익힌다.

### [이론 설명]
- `docker compose -h(--help)` 로 하위 명령 확인 (build, config, cp, create, down … ).
- `up --scale 서비스=N` 으로 YAML 수정 없이 컨테이너 수를 늘리고(scale-out) 줄일 수(scale-in) 있다.
- `config`: compose 파일을 canonical(정규화) 형식으로 파싱·해석해 출력(문법/결과 확인에 유용).

### [사용한 CLI]

**프로젝트 준비 (flask + redis)**
```bash
mkdir flask-redis && cd $_
mkdir app
vi app/py_app.py
vi app/requirements.txt
vi Dockerfile
vi docker-compose.yaml
tree
# .
# ├── app
# │   ├── py_app.py
# │   └── requirements.txt
# ├── docker-compose.yaml
# └── Dockerfile
```
```yaml
# docker-compose.yaml (flask + redis)
version: '3'
services:
  redis:
    image: redis:6-alpine
    ports:
      - 6379:6379
    restart: always
  flask:
    build: .
    ports:
      - 9000:9000
    depends_on:
      - redis
    restart: always
```
- 접속: `192.168.56.101:9011` 에서 'docker-compose application: Flask & Redis', Web access count 증가 확인. (flask 컨테이너 9000 포트가 이미 실행 중인 portainer 의 9000 과 충돌하여 호스트 포트를 9011 로 바꿔 실습 – 즉 호스트 포트는 변경 가능)

**명령어 모음**
```bash
docker compose -h                      # (--help) 사용 가능 명령 확인
docker compose up                      # 서비스 생성/실행 (-d: 백그라운드)
docker compose logs -f redis           # redis 서비스 로그 실시간(follow)
docker compose ps                      # 컨테이너 상태
docker compose ps --services           # 서비스 이름만 출력 (flask, redis)
docker compose config                  # 정규화된 compose 설정 출력 (name, services, build.context 절대경로 등)

docker compose pause                   # 모든 서비스 컨테이너 일시정지
docker compose ps                      # STATUS 에 (Paused) 표시
docker compose unpause                 # 일시정지 해제

docker compose port flask 9000         # 서비스의 컨테이너 포트가 호스트의 어느 주소에 매핑되었는지 → 0.0.0.0:9000
docker compose port redis 6379         # → 0.0.0.0:6379

docker compose down                    # 컨테이너/네트워크 삭제
docker compose ps                      # 삭제 후 비어있음 확인
docker compose stop redis              # 특정 서비스만 중지(참고)
```
- `logs -f`: 로그 follow. `pause/unpause`: 컨테이너 일시정지/해제.

**scale 실습 (scale-test: server_db=redis:6-alpine, server_web=httpd:2)**
```bash
docker compose up --scale server_db=1 --scale server_web=1 -d
docker compose ps

docker compose up --scale server_web=3 -d      # web 3개로 scale-out
docker compose ps

docker compose down --rmi all                  # 컨테이너/네트워크/이미지까지 모두 삭제
# [+] Running 7/7 : server_web-1~3, server_db-1, Image redis:6-alpine, Image httpd:2, Network scale-test_default Removed
```
- `--scale 서비스=N`: 해당 서비스 컨테이너 수를 N개로 조정(늘리고 줄일 수 있음). `-d`: 백그라운드. `--rmi all`: 사용한 모든 이미지도 삭제.

### [확인 방법/주의점]
- (Clip 2 슬라이드 확인) compose CLI는 Docker 명령어와 크게 다르지 않아 익숙하면 쉽게 적용 가능, `-h`(--help)로 build/config/cp/create/down 등 명령별 설명 확인(`config`: Parse, resolve and render compose file in canonical format / `down`: Stop and remove containers, networks).
- flask+redis: docker-compose.yaml에는 flask 포트가 9000:9000 이지만 강사 호스트에 portainer가 이미 9000을 사용 중이어서 포트 충돌 → 호스트 쪽을 9011로 바꿔 재기동, 브라우저는 `192.168.56.101:9011`로 접속('docker-compose application: FlasK & Redis', Web access count : 1 times, 새로고침마다 증가; 컨테이너 내부 포트는 그대로 9000). `depends_on`으로 redis가 먼저 뜬 뒤 flask 기동.
- `config`는 환경변수·경로가 모두 해석(canonical)된 최종 설정(name: flask-redis, build.context 절대경로 등)을 보여주므로 실제 적용될 값이 맞는지 사전 점검에 유용하고, 직접 작성하지 않은 기본값까지 더 채워져 나온다. `pause/unpause`는 컨테이너를 정지시키지 않고 **프로세스만 일시 정지**(STATUS `Up 17 minutes (Paused)`)하므로 down과 다르다. `docker compose stop redis` 처럼 서비스명을 지정하면 개별 서비스만 멈추거나 다시 시작할 수 있다. `docker compose port flask 9000` → `0.0.0.0:9000`. down 결과에 flask-redis-flask-1/2/3(scale된 컨테이너)·flask-redis-redis-1 Removed 및 Network flask-redis_default Removed 가 표시된 슬라이드가 있다.
- scale-test 예제의 server_db(redis)·server_web(httpd) 두 서비스는 실제 애플리케이션 연관성이 전혀 없으며, `--scale` 하나로 여러 서비스의 컨테이너 수를 동시에 늘리고 줄이는 방법을 보여주기 위한 예제(강사 강조). `--scale 서비스명=개수`를 여러 번 붙이면 서비스별 개수를 한 번에 지정, 이미 떠 있는 상태에서 다른 값으로 `up --scale` 하면 확장(scale-out)/축소(scale-in)되며(예: 4개→1개이면 나머지 정리) 실습 후 `down --rmi all` 로 이미지까지 정리해 디스크 공간을 회수하는 습관.
- scale 사용 시 `container_name` 고정 지정이 있으면 중복 문제 → 이름 미지정 필요.
- scale 변경은 YAML 이 아닌 `up --scale` 옵션으로 즉시 반영. 마지막은 `down --rmi all` 로 정리.
- 호스트 포트 충돌(portainer 9000 등) 시 `호스트:컨테이너` 의 호스트 쪽만 변경.

---

## Step 4. 다양한 애플리케이션 compose 배포 (nginx 로드밸런서 + Flask 3개 / Flask + redis 방문자 카운터)

### [목적]
- (1) nginx(로드밸런서) + Flask 앱 3개, (2) Flask 웹 + redis(방문 횟수 카운트) 를 compose 로 배포·확인·삭제.
- `docker compose up --build`, `ps`, `down --rmi all` 흐름 숙달.

### [이론 설명]
> 보강 근거: 'Clip 3. [실습] docker compose를 통한 다양한 애플리케이션 배포'(약 14분, 14쪽) PDF 전체를 슬라이드 이미지로 확인함. 강사는 이 3번 클립을 '예시 실습'으로 규정하고, 여기서 다룬 nginx 로드밸런싱 구조를 다음 클립(3-Tier 배포)에서 그대로 확장한다고 안내.
- 예제 1: ch06 의 'nginx 프록시 + Flask 3개' 를 compose 로 재구성. nginx_alb 가 pyfla_app1/2/3 로 라운드로빈 분산. (자료에서는 upstream 에 호스트 docker0 게이트웨이 `172.17.0.1` + 각 앱의 호스트 매핑 포트(5001~5003)를 사용)
- compose 는 프로젝트(디렉터리) 단위로 서비스를 묶어 관리하므로 `nginx-compose` 디렉터리를 새로 만들고 nginx_alb, pyfla_app1~3 폴더 안에 각각 Dockerfile(Dockerfile.alb / Dockerfile.app1~3)과 소스를 넣은 뒤 최상위 docker-compose.yaml 하나로 네 서비스를 한 번에 빌드/실행(`tree -a`: 4 directories, 12 files).
- **왜 upstream 이 172.17.0.1 인가(강사 설명)**: 이 구조에서는 별도 네트워크를 정의하지 않았으므로 도커 기본 브리지(docker0)를 쓰게 되고, nginx 컨테이너가 호스트를 거쳐 다른 컨테이너의 포트포워딩된 포트(5001~5003)로 접근하려면 기본 브리지의 게이트웨이 주소(172.17.0.1)를 upstream 에 적어야 한다.
- **설정 파일을 넣는 두 방법(강사)**: nginx.conf 같은 설정 파일은 (1) 볼륨으로 마운트(run 방식이라면 실무에서 더 선호) 또는 (2) 이 실습처럼 Dockerfile 의 COPY 로 이미지 빌드 시점에 복사해 넣는 방식이 있다. 여기서는 COPY 사용.
- `depends_on`: nginx 가 Flask 3개보다 나중에 시작(Flask 가 먼저 기동). 컨테이너 '시작 순서'를 pyfla_app1~3 → nginx 로 맞춰줄 뿐, 애플리케이션이 완전히 준비될 때까지 기다려 주지는 않는다.
- pyfla_app1/2/3.py 는 거의 동일하고 응답 문자열만 [1], [2], [3] 로 달라 브라우저에서 어느 컨테이너가 응답했는지 바로 구분 가능.
- 이미지 build 용 `Dockerfile` 은 각 서비스 폴더에 있고, nginx.conf 는 Dockerfile 의 COPY 로 이미지에 포함(실행 시점이 아니라 빌드 시점에 반영 → 수정 시 재빌드 필요 `--build`).
- 예제 2: `redis.incr('count')` 로 방문 횟수 증가(원자적 증가). `host='redis'` 처럼 compose 서비스명으로 접속(IP 불필요). redis는 key-value 저장소이고 incr()은 해당 키 값을 원자적(atomic)으로 1 증가시키고 결과를 돌려주므로 컨테이너 재시작이나 동시 요청에도 방문자 수를 안전하게 셀 수 있다. 같은 compose 네트워크 안에서는 서비스 이름이 곧 호스트명(nginx 예제의 IP 방식과 대비).
- 이미지는 원래 cloud-01~05.png 5장이었는데 강사가 docker_logo.png / fastcampus.png / k8s_logo.png 3장을 추가해 8장이 됨 — images 리스트에 파일명만 추가하면 `random.choice()`가 곧바로 새 이미지를 포함시킨다.
- `webserver`는 직접 작성한 Dockerfile 로 빌드해야 하므로 `build: .`, `redis`는 공식 이미지가 도커허브에 있으므로 `image: redis:6.0` — 한 compose 파일 안에서 '직접 빌드하는 서비스'와 '기존 이미지를 그대로 쓰는 서비스'를 섞어 쓸 수 있다.
- `docker compose down` 만으로는 컨테이너·네트워크만 정리되고 빌드된 이미지는 남는다. 실습용 임시 이미지까지 지우려면 `--rmi all`(컨테이너·이미지·네트워크 한 번에 정리). 강사 총평: "docker compose는 서버에서 우리가 만드는 모든 환경을 다 집약시키고 컨트롤할 수 있는 환경을 제공한다. 예제는 2개뿐이지만 숙제 삼아 충분히 실습해 보라."
- `build:` vs `image:` : 직접 만드는 서비스는 build, 공개 이미지(redis)는 image.

### [사용한 CLI]

**예제 1. nginx proxy + Flask 3 (디렉터리 구조)**
```bash
mkdir nginx-compose && cd $_
mkdir nginx_alb pyfla_app1 pyfla_app2 pyfla_app3
tree -a
cd nginx_alb/
vi Dockerfile.alb
vi nginx.conf
```
```dockerfile
# nginx_alb/Dockerfile.alb
FROM nginx:1.25.1-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
```
```nginx
# nginx_alb/nginx.conf
upstream web-alb {
   server 172.17.0.1:5001;
   server 172.17.0.1:5002;
   server 172.17.0.1:5003;
}
server {
   location / {
      proxy_pass http://web-alb;
   }
}
```
```python
# pyfla_app1/pyfla_app1.py  (app2, app3 는 출력 문구만 [2], [3])
from flask import request, Flask
import json
app1 = Flask(__name__)
@app1.route('/')
def hello_world():
    return 'Flask Web Application [1]' + '\n'
if __name__ == '__main__':
    app1.run(debug=True, host='0.0.0.0')
```
```yaml
# docker-compose.yaml
version: '3.8'
services:
  pyfla_app1:
    build:
      context: ./pyfla_app1
      dockerfile: Dockerfile.app1
    ports:
      - "5001:5000"
  pyfla_app2:
    build:
      context: ./pyfla_app2
      dockerfile: Dockerfile.app2
    ports:
      - "5002:5000"
  pyfla_app3:
    build:
      context: ./pyfla_app3
      dockerfile: Dockerfile.app3
    ports:
      - "5003:5000"
  nginx:
    build:
      context: ./nginx_alb
      dockerfile: Dockerfile.alb
    ports:
      - "8080:80"
    depends_on:
      - pyfla_app1
      - pyfla_app2
      - pyfla_app3
```
```bash
docker compose up --build        # 이미지 빌드 + 실행 (Dockerfile 변경 시 --build)
docker compose ps                # nginx, pyfla_app1/2/3 Up, 포트 8080(nginx), 5001~5003 확인
curl http://<IP>:8080            # 새로고침(반복 호출)할 때마다 [1]/[2]/[3] 이 번갈아 응답 (라운드로빈)
docker compose down --rmi all    # 컨테이너 4 + 이미지 4 + 네트워크(nginx-compose_default) 삭제
```

**예제 2. web-count (Flask + redis)**
- 파일 구성(`tree -a`): `app.py`, `docker-compose.yml`, `Dockerfile`, `requirements.txt`, `static/(css, images)`, `templates/index.html`. images 에는 cloud-01~05.png, docker_logo.png, fastcampus.png, k8s_logo.png (8장 중 `random.choice()` 로 랜덤 표시).
```python
# app.py
from flask import Flask, render_template
from redis import Redis
import os,random
app = Flask(__name__)
redis = Redis(host='redis', port=6379)
images = [
   "cloud-01.png", "cloud-02.png", "cloud-03.png", "cloud-04.png", "cloud-05.png",
   "docker_logo.png", "fastcampus.png", "k8s_logo.png"
]
@app.route('/')
def index():
   image_path = "/static/images/" + random.choice(images)
   count = redis.incr('count')
   return render_template('index.html', image_path=image_path, visit_count=count)
if __name__ == "__main__":
   app.run(host="0.0.0.0", port=8899)
```
```dockerfile
# Dockerfile
FROM python:3.10-slim
LABEL maintainer "kevin.lee"
RUN pip install --upgrade pip
RUN mkdir -p /cloud-web/image
ENV APP_PATH /cloud-web/image
COPY requirements.txt $APP_PATH/
RUN pip install --no-cache-dir -r $APP_PATH/requirements.txt
COPY app.py $APP_PATH/
COPY templates/ $APP_PATH/templates/
COPY static/ $APP_PATH/static/
EXPOSE 8899
CMD ["python", "/cloud-web/image/app.py"]
```
```yaml
# docker-compose.yml (webserver + redis)
version: '3.8'
services:
  webserver:
    build: .            # 현재 디렉터리의 Dockerfile 로 빌드
    ports:
      - "8899:8899"
    depends_on:
      - redis
  redis:
    image: redis:6.0    # 공개 이미지 사용
```
```bash
docker compose up --build [-d]
docker compose ps
# NAME                    IMAGE                 PORTS
# web-count-redis-1       redis:6.0             6379/tcp
# web-count-webserver-1   web-count-webserver   0.0.0.0:8899->8899
# 브라우저 접속: "Currently you have N visits." 새로고침마다 카운트 증가, 이미지 랜덤 변경
docker compose down --rmi all
# Container web-count-webserver-1, web-count-redis-1 / Image web-count-webserver:latest, redis:6.0 / Network web-count_default Removed
```

### [확인 방법/주의점]
- **실습 중 겪은 포트 충돌(강사)**: 8080 포트가 이미 다른 프로세스(자바 계열)에서 사용 중이어서 충돌 → 해당 프로세스를 내리고 다시 서비스를 시작. 실습 환경에서 포트 충돌은 흔하니 당황하지 말고 점검할 것. `docker compose ps`로 nginx(8080->80), pyfla_app1~3(5001~5003->5000) 모두 Up 확인. `docker compose down --rmi all` 결과 `Running 9/9`(컨테이너 4 + 이미지 4(`nginx-compose-*:latest`) + 네트워크 nginx-compose_default).
- **web-count에서 redis:6.0 을 다시 받은 이유(강사)**: 앞 실습에서 `--rmi all`을 썼기 때문에 이미 로컬에 받아 둔 redis:6.0 이미지가 지워져, 다시 `up` 할 때 도커허브에서 redis:6.0 을 새로 pull 하고 web-count-webserver 이미지도 처음부터 빌드하느라 시간이 걸림. 브라우저는 `192.168.56.101:8899`, 'Currently you have N visits.'(슬라이드에서 5 visits → 15 visits까지 증가 확인).
- 예제 1: nginx.conf 는 Dockerfile COPY 로 이미지에 들어가므로 수정 후엔 `--build`. (`--build`는 컨테이너 시작 전에 이미지를 새로 빌드, Dockerfile이나 소스 변경 시 재빌드에 사용)
- 172.17.0.1(docker0 게이트웨이)을 upstream 으로 쓰는 방식은 호스트 매핑 포트를 경유하는 방법(자료의 설명).
- 예제 2: `down --rmi all` 은 redis:6.0 이미지까지 지우므로 다음 `up` 시 재pull 됨. 접속 횟수 카운트가 이어지는지는 redis 컨테이너 유지 여부에 달림.

---

## Step 5. docker compose 로 3-Tier 웹 애플리케이션 배포 (My Diary: Node.js + Spring Boot + MySQL) + Nginx 로드밸런서

### [목적]
- docker run + network 로 3-tier 를 수동 구성한 뒤 compose 로 전환, build(context/dockerfile) 적용, 최종적으로 `deploy.replicas` + Nginx 로드밸런서(frontend/backend)를 구성한다.

### [이론 설명]
> 보강 근거: 'Clip 4. [실습] docker compose를 이용한 3-Tier 애플리케이션 배포'(약 30분, 24쪽) PDF 전체를 슬라이드 이미지로 확인함. 이 클립은 앞 1~3번 클립 내용을 하나로 집약한 실습이며 같은 3-tier 앱을 4가지 방식(CLI 수동 → compose → 빌드 통합 → nginx 로드밸런싱)으로 반복 구현한다.
- 구조(슬라이드): rolling-front(Node.js, 3000:3000) ⇄ API 통신 ⇄ rolling-server(Spring Boot, 8080:8080) ⇄ 데이터 요청/처리 ⇄ rolling-db(MySQL, 3306). 프런트는 `192.168.56.101:3000`으로 접속. 동작 확인은 `docker logs -f rolling-server`(백엔드 로그), `docker exec -it rolling-db bash`(또는 MySQL Workbench)로 한다. 소스는 `ch10/my-diary` 폴더의 my-diary-back(Spring Boot, Paper 도메인/서비스/레포지토리 구조)·my-diary-front(Node.js, app.js + public/index.ejs).
- **실습 순서 표**: 실습1 docker CLI 수동 배포(전용 네트워크 → db → backend → frontend) / 실습2 compose로 동일 앱 배포(서비스 3 + 네트워크 2) / 실습3 이미지 빌드+배포 통합(`build.context/dockerfile` + `up --build`) / 실습4 Nginx Proxy 결합(frontend/backend 각각 replicas로 복제 + Nginx 2대 proxy-fe, proxy-be).
- **강사 설명**: Spring Boot는 규모가 커서 Gradle 설치·빌드 과정 자체에 시간이 꽤 걸리므로 my-diary-back 이미지 빌드가 my-diary-front보다 눈에 띄게 오래 걸려도 정상. docker-compose를 배우기 전에 docker run만으로 3-tier를 띄워 보는 이유는 YAML 한 장이 실제로 얼마나 많은 수작업을 대신해 주는지 체감하기 위함.
- 컨테이너를 이름(rolling-db 등)으로 통신시키려면 **같은 사용자 정의 네트워크(fastapp-net)** 에 붙어 있어야 한다. 기본 bridge 네트워크만 쓰면 컨테이너 이름으로 DNS 조회가 되지 않기 때문에 모든 컨테이너에 `--net fastapp-net`을 공통으로 지정한다. `-e` 옵션들은 MySQL 컨테이너가 최초 기동 시 읽는 환경변수(루트 비밀번호/기본 DB paperdb/원격 접속 허용 호스트 %/애플리케이션용 계정 user)다.
- `SPRING_DATASOURCE_URL`에 IP가 아니라 컨테이너 이름 `rolling-db`를 쓸 수 있는 것은 같은 네트워크에서는 도커 내장 DNS가 컨테이너 이름을 IP로 변환해 주기 때문. **backend는 DB가 완전히 초기화될 때까지 몇 십 초 걸리므로 DB 컨테이너를 먼저 실행하고 시간차를 두고 backend를 실행**해야 접속 오류를 피할 수 있다(슬라이드 주석: 'DB 컨테이너 내부적인 동작이 요구되므로 몇 십 초 뒤에 backend 수행'). `depends_on`은 컨테이너를 '먼저 실행'만 시킬 뿐 그 안의 애플리케이션이 준비될 때까지 기다려주지 않는다.
- 동작 확인 순서: 화면(프런트)에서 값 입력 후 [Add Note] → 백엔드 로그(Hibernate insert/select) → DB 테이블(`select * from paper;`) 순서로 값이 이어지는지 하나씩 확인하는 것이 3-tier를 이해하는 가장 확실한 방법. `docker exec -it <컨테이너> bash` 로 컨테이너 안에서 mysql 클라이언트를 직접 실행하는 방식은 이후 실습에서도 반복된다.
- 실습2: 실습1의 네트워크 생성 + docker run 3번을 docker-compose.yaml 하나로 옮기고, 실습1에서 만든 이미지(mydiary-front:1.0, mydiary-back:1.0)를 그대로 재사용. 실습1은 네트워크 1개(fastapp-net)에 세 컨테이너를 모두 붙였지만 여기서는 db↔backend용 `rolling-be-db`, backend↔frontend용 `rolling-fe-be` 두 개로 분리. backend만 두 네트워크에 속하게 해 DB는 backend를 통해서만 접근되고 frontend가 DB 네트워크에 직접 노출되지 않는 구조.
- 실습3: `image:` 대신 `build:`(context는 Dockerfile이 있는 폴더 경로, dockerfile은 파일명)를 쓰면 `docker compose up --build` 한 번이 이미지 빌드와 컨테이너 기동을 모두 처리(docker build → docker run을 따로 하지 않아도 되므로 소스가 자주 바뀌는 개발 단계에 유용). 소스 폴더는 실습1·2의 my-diary 대신 `my-diary-3`(compose 파일 + my-diary-back, my-diary-front를 한 폴더에 모음) — 실습4가 이 구조를 이어받음. 실습 후 `--rmi all`로 이미지까지 정리. 강사는 이 3번 실습은 각자 꼭 직접 해보라고 당부하고 넘어감.
- 실습4: 3-tier 앞단에 Nginx를 두 대(frontend용/backend용) 추가해 각 계층 앞에서 리버스 프록시 겸 로드밸런서 역할. frontend/backend 컨테이너는 `deploy.replicas`로 복제하고 Nginx가 라운드 로빈으로 분배. 작업 폴더는 `ch10/my-diary-3-proxy`: 실습3 소스를 복사 후 최상위에 `proxy/`(nginx-be.conf, nginx-fe.conf)만 추가. 복제 수 지정에 `deploy.replicas`를 쓰는 이유는 예전의 `docker-compose up --scale`/`scale` 옵션이 deprecate 되었기 때문(강사).
- 3-tier: rolling-front(Node.js) → rolling-server(Spring Boot) → rolling-db(MySQL), 'fastcampus My class diary' 애플리케이션.
- 사용자 정의 bridge 네트워크에서는 컨테이너 이름이 DNS 로 해석되므로 `SPRING_DATASOURCE_URL` 에 IP 대신 `rolling-db` 사용.
- backend 는 DB가 먼저 떠 있어야 하므로(기동 순서) `depends_on` 으로 순서 지정(수동 실행 시엔 사람이 순서 지킴).
- 단계적 진화: (1) docker CLI 3-tier → (2) compose 3-tier(image 사용, 네트워크 2개 분리: be-db, fe-be) → (3) compose `build:` 사용 → (4) replicas + Nginx proxy 2개(proxy-be, proxy-fe) + 고정 서브넷.
- 네트워크 분리: db–backend 는 `rolling-be-db`, backend–frontend 는 `rolling-fe-be` → frontend 는 DB 에 접근 불가(최소 접근 구성).
- `deploy.replicas`: `up --scale` 은 deprecated 경향이라 compose 에서도 deploy.replicas 사용 권장(자료의 설명). replicas 3개일 때 호스트 포트는 범위 매핑 `'8081-8083:8080'`.
- Nginx upstream 은 서비스 이름 + 포트로 지정, frontend `app.js` 의 backend 주소(`dest`)도 IP 대신 서비스명 사용.
- MSA 관점: 서비스별 Dockerfile + docker-compose.yaml 로 이식성/재현성 확보.

### [사용한 CLI]

**5-1. docker CLI 로 3-tier 수동 구성**
```bash
# frontend, backend 이미지 확인 (이미 빌드된 mydiary-front:1.0, mydiary-back:1.0)
docker image history mydiary-front:1.0
docker image history mydiary-back:1.0

# 네트워크 생성
docker network create fastapp-net
docker network ls

# DB 실행
docker run -d --name rolling-db --net fastapp-net -p 13306:3306 \
  -e MYSQL_ROOT_PASSWORD=pass123# -e MYSQL_DATABASE=paperdb \
  -e MYSQL_ROOT_HOST=% -e MYSQL_USER=user -e MYSQL_PASSWORD=user \
  mysql:5.7-debian --character-set-server=utf8 --collation-server=utf8_general_ci

# backend 실행 (DB 이름으로 접속)
docker run -d --name rolling-server --net fastapp-net -p 8080:8080 \
  -e SPRING_DATASOURCE_URL=jdbc:mysql://rolling-db:3306/paperdb?serverTimezone=Asia/Seoul \
  -e SPRING_DATASOURCE_USERNAME=user -e SPRING_DATASOURCE_PASSWORD=user \
  mydiary-back:1.0

# frontend 실행
docker run -d --name rolling-front --net fastapp-net -p 3000:3000 \
  mydiary-front:1.0

docker ps -a

# 동작 확인: 브라우저에서 [Add Note] → backend → DB 저장
docker exec -it rolling-server bash
docker exec -it rolling-db bash

# 정리
docker stop rolling-db rolling-server rolling-front
docker rm rolling-db rolling-server rolling-front
```
- `-e MYSQL_ROOT_HOST=%`: 모든 호스트에서 root 접속 허용. 컨테이너 뒤쪽의 `--character-set-server=utf8 --collation-server=utf8_general_ci` 는 mysqld 옵션(문자셋).

**5-2. compose 로 전환** (`ch10/my-diary-compose`)
```bash
mkdir my-diary-compose && cd $_
vi docker-compose.yaml
```
```yaml
version: '3.3'

services:
  mydiary-db:
    image: mysql:5.7-debian
    container_name: rolling-db
    environment:
      MYSQL_ROOT_PASSWORD: pass123
      MYSQL_DATABASE: paperdb
      MYSQL_ROOT_HOST: '%'
      MYSQL_USER: user
      MYSQL_PASSWORD: user
    ports:
      - '13306:3306'
    networks:
      - rolling-be-db
    restart: always
    command:
      - --character-set-server=utf8
      - --collation-server=utf8_general_ci

  mydiary-back:
    image: mydiary-back:1.0
    container_name: rolling-server
    restart: always
    depends_on:
      - mydiary-db
    ports:
      - '8080:8080'
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://rolling-db:3306/paperdb?serverTimezone=Asia/Seoul
      SPRING_DATASOURCE_USERNAME: user
      SPRING_DATASOURCE_PASSWORD: user
    networks:
      - rolling-be-db
      - rolling-fe-be

  mydiary-front:
    image: mydiary-front:1.0
    container_name: rolling-front
    restart: always
    depends_on:
      - mydiary-back
    ports:
      - '3000:3000'
    networks:
      - rolling-fe-be

networks:
  rolling-be-db: {}
  rolling-fe-be: {}
```
```bash
docker compose up
# Network my-diary-compose_rolling-be-db / _rolling-fe-be Created, Container rolling-db / rolling-server / rolling-front Created
curl localhost:3000            # <title>fastcampus My class diary</title> 확인

# DB 데이터 확인
docker exec -it rolling-db bash
mysql -uroot -p                # compose 파일에 지정한 비밀번호(pass123) 입력
mysql> show databases;
mysql> use paperdb;
mysql> show tables;
mysql> select * from paper;    # 입력한 노트(id, content, nickname, password) 저장 확인
```
- 주의(자료): docker run 때는 `MYSQL_ROOT_PASSWORD=pass123#`, compose 에서는 `pass123`(# 없음) — 실제 mysql 접속 시 compose 에 지정한 비밀번호를 입력해야 함. **강사가 실제로 이 실수를 함**: 처음에 `pass123#`으로 로그인 시도해 실패한 뒤 compose 파일에 적힌 값으로 다시 입력해 성공. 같은 이름의 값이라도 compose 파일에 적힌 실제 값을 항상 확인할 것.
- DB 검증: `select * from paper;` → 컬럼 id, content, nickname, password (예: 1 | docker class | kevin | (마스킹)), `1 row in set`. `curl localhost:3000` 응답의 `<title>fastcampus My class diary</title>` 확인. 슬라이드 기준 compose `up` 출력은 `Running 5/3`(네트워크 2 + 컨테이너 3 Created) 후 `Attaching to rolling-db, rolling-front, rolling-server`.

**5-3. `build:` 사용 (이미지 사전 빌드 없이 compose 가 빌드)** (`ch10/my-diary-3`)
```yaml
  mydiary-back:
    build:
      context: ./my-diary-back
      dockerfile: Dockerfile
    container_name: rolling-server
    restart: always
    depends_on:
      - mydiary-db
    ports:
      - '8080:8080'
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://rolling-db:3306/paperdb?serverTimezone=Asia/Seoul
      SPRING_DATASOURCE_USERNAME: user
      SPRING_DATASOURCE_PASSWORD: user
    networks:
      - rolling-be-db
      - rolling-fe-be
  # mydiary-front 도 build.context/dockerfile 로 동일 변경
```
```bash
docker compose up --build         # 이미지를 빌드하고 실행
docker compose down --rmi all     # 컨테이너/네트워크 + 이미지까지 삭제
```

**5-4. replicas + Nginx 프록시(로드밸런서)** (`ch10/my-diary-3-proxy`)
```bash
tree
# docker-compose.yaml
# my-diary-back/  (Dockerfile, README.md, rollingpaper/, build.gradle, gradle ...)
# my-diary-front/ (app.js, Dockerfile, fastcampus.png, package.json, public/index.ejs ...)
# proxy/          (nginx-be.conf, nginx-fe.conf)
vi docker-compose.yaml        # mydiary-back replicas/포트 범위, proxy-be, proxy-fe, mydiary-net(ipam) 작성
vi proxy/nginx-be.conf        # backend upstream(mydiary-back:8081~8083) 작성
vi my-diary-front/app.js      # dest 상수를 서비스명(http://mydiary-back:8080)으로 수정
```
```yaml
# docker-compose.yaml (발췌)
version: '3.8'
services:
  mydiary-db:
    ...
  mydiary-back:
    build:
      context: ./my-diary-back
      dockerfile: Dockerfile
    deploy:
      replicas: 3            # backend 3개
    restart: always
    depends_on:
      - mydiary-db
    ports:
      - '8081-8083:8080'     # 컨테이너별 호스트 포트 8081~8083 으로 분리 매핑
    ...

  proxy-be:                  # backend 로드밸런서
    image: nginx:1.21.5-alpine
    container_name: rolling-server-lb
    restart: always
    depends_on:
      - mydiary-back
    ports:
      - '8080:80'
    volumes:
      - ${PWD}/proxy/nginx-be.conf:/etc/nginx/nginx.conf   # backend nginx.conf 마운트
    networks:
      - mydiary-net

  proxy-fe:                  # frontend 로드밸런서 (80 포트 공개)
    image: nginx:1.21.5-alpine
    container_name: rolling-front-lb
    restart: always
    ports:
      - '80:80'
    volumes:
      - ${PWD}/proxy/nginx-fe.conf:/etc/nginx/nginx.conf   # frontend nginx.conf 마운트
    networks:
      - mydiary-net

networks:
  mydiary-net:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: 172.20.0.0/24
          ip_range: 172.20.0.0/24
          gateway: 172.20.0.1
```
```nginx
# proxy/nginx-be.conf
events { worker_connections 1024; }
http{
   upstream mydiary-back {
      server mydiary-back:8081;
      server mydiary-back:8082;
      server mydiary-back:8083;
   }
   server {
      listen *:8080 default_server;
      location / {
        proxy_pass http://mydiary-back;
      }
   }
}
```
```javascript
// my-diary-front/app.js  — backend 주소를 IP 대신 서비스명으로
const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const axios = require('axios');
const ejs = require('ejs');
const dest = 'http://mydiary-back:8080';   // backend 서비스 이름 사용
const router = express.Router();
const bodyParser = require('body-parser');
...
```
```bash
docker compose up --build
# 확인: 브라우저 F5 새로고침 시 my-diary-3-proxy-mydiary-back-1, -2, -3 이 번갈아 응답(로그로 확인, round-robin)
docker compose down --rmi all
# [+] Running 14/14 : 컨테이너(lb 2, front 3, back 3, db) + 이미지(nginx, back, front, mysql) + 네트워크 삭제
```

**트러블슈팅(자료에 나온 오류와 해결)**
```bash
# 1) 서브넷 중복
#  failed to create network ...: cannot create network ... conflicts with network ...: networks have overlapping IPv4
#  강사 설명: 기존 환경에서 172.20 대역을 이미 쓰고 있던 네트워크가 있었음
docker network ls                      # 172.20 대역 등 기존 네트워크 확인
docker network rm <NETWORK ID>         # 충돌 네트워크 삭제
docker compose up                      # 재실행

# 2) host not found in upstream "mydiary-front:3000"
#    [emerg] host not found in upstream "mydiary-front:3000" in /etc/nginx/nginx.conf:4 (rolling-front-lb 로그)
#    nginx 는 시작 시점에 upstream 에 적힌 서비스 이름을 DNS 로 한 번 조회하는데, frontend/backend 컨테이너가 아직 뜨기 전(혹은 재시작 도중)에 nginx 가 먼저 찾으면 발생

# 3) Error response from daemon: driver failed programming external connectivity on endpoint my-diary-3-proxy-mydiary-back-3 ...: all ports are allocated
#    이전 시도에서 남아있던 컨테이너가 포트를 점유 → 관련 컨테이너를 모두 정리한 뒤 처음부터 재시도 (이 슬라이드에서 이 두 오류(2,3)를 한 번에 정리하고 재시도)
docker stop $(docker ps -a -q)
docker compose up
```
- 강사가 실습 중 `docker ps stop $(docker ps -a -q)` 로 오타를 쳐서 `"docker ps" accepts no arguments` 오류가 난 장면이며, `docker stop $(docker ps -a -q)` 로 바로잡아 실행한다. 재시도 후 db, frontend(1~3), backend(4,5 재생성분 포함) 컨테이너가 모두 running 상태가 됨. 복제(replicas)+프록시 조합은 시작 순서와 포트 상태에 민감하므로 처음 몇 번은 오류가 나는 것이 오히려 자연스럽다(강사).
- 로드밸런싱 확인: 웹 접속 후 F5 새로고침마다 터미널 로그에서 `my-diary-3-proxy-mydiary-back-1, -2, -3` 이 순서대로 요청을 받는 것이 보인다(nginx-be.conf upstream 3개 서버를 라운드 로빈).
- 정리: `docker compose down --rmi all` → `Running 14/14` (컨테이너 9: rolling-front-lb, rolling-server-lb, front-1~3, back-1~3, rolling-db + 이미지 4 + 네트워크 1). 강사 총평: 이번 클립은 MSA(마이크로서비스 아키텍처)의 가장 기본적인 모델을 직접 구현해 본 것으로, 작업 방식을 이미지(Dockerfile)와 배포 정의(docker-compose.yaml) 코드로 옮기면 반복 실행·테스트 가능한 컨테이너 서비스 모델이 되며, 서비스 단위로 모듈화해 하나씩 만들어 가면 전체 프로젝트가 완성된다.

### [확인 방법/주의점]
- `docker compose up` 결과로 네트워크 2개, 컨테이너 3개 생성 확인 → `curl localhost:3000`.
- 고정 서브넷(ipam)을 쓰면 기존 네트워크와 CIDR 겹침 오류가 날 수 있으므로 `docker network ls / inspect` 로 확인 후 삭제.
- proxy 서비스는 `depends_on` 이 있어도 'upstream host not found' 가 날 수 있다(기동 순서만 보장). 재실행으로 해결.
- replicas 사용 시 ports 는 범위 매핑(`8081-8083:8080`) 필요, `container_name` 고정 지정은 replicas 와 함께 쓸 수 없는 서비스에는 지정하지 않음(자료의 backend 서비스는 container_name 제거).
- 비밀번호 환경변수 값은 예제용 — 운영에서는 env_file 등으로 분리.

---

# PART B. Docker Swarm Cluster (Ch11)

## Step 6. Docker Swarm 개념 이해 (mode, 아키텍처, 네트워크)

### [목적]
- 단일 호스트 compose 의 한계를 넘어 여러 호스트를 묶는 Docker Swarm mode 의 개념(Node/Manager/Worker/Stack/Service/Task/Scheduling), Raft, 서비스 생성 흐름, Ingress overlay / IPVS routing mesh 를 이해한다.

### [이론 설명]
> 보강 근거: 'Ch11 Clip 1. docker swarm cluster 이해'(약 40분, 18쪽) PDF 전체를 슬라이드 이미지로 확인함. Ch11은 총 4개 클립 구성 — ①(본 클립) 개념 소개 ②호스트 복제(host2→host3, IP·호스트명 변경)로 swarm cluster 구성 + Portainer/Visualizer/Swarmpit 모니터링 ③다양한 service 구성 ④stack 서비스 배포. 이번 클립은 클러스터를 아직 구성하지 않은 상태에서 개념만 먼저 잡는 편이며, 개념을 알아야 이해도가 떨어지지 않는다는 것이 강사의 강조점.
- **정의(슬라이드)**: Docker swarm은 Docker 컨테이너를 위한 분산 환경 클러스터링 및 스케줄링 도구. Docker는 단일 호스트, swarm mode는 다중 호스트 기반 컨테이너 애플리케이션 관리 도구(Orchestration tools) — "컨테이너화된 애플리케이션에 대한 자동화된 관리 및 제어를 수행하는 도구". 여러 노드 클러스터를 구축해 별도 추가 비용 없이 swarm mode를 초기화(init)하여 사용(강사: Kubernetes처럼 별도 플랫폼을 설치하지 않고 이미 설치된 Docker Engine 내장 기능만으로 클러스터를 구성할 수 있다는 점이 실무에서 큰 장점). 실습 환경은 VirtualBox VM(fc_hostos1/2/3).
- **왜 별도 브리지 네트워크(docker_gwbridge)가 필요한가(강사)**: Docker 기본 네트워크 bridge는 '호스트 내부 통신 전용(로컬용)'이라 호스트1의 브리지와 호스트2의 브리지는 원래 서로 통신이 안 된다. swarm으로 클러스터를 구성하면 별도 브리지 네트워크(docker_gwbridge)와 overlay(ingress)가 생겨 서로 다른 호스트의 컨테이너끼리도 통신할 수 있다.
- **Docker Engine과 Orchestration Capabilities(슬라이드)**: Docker Engine 내부에는 Swarm Mode Manager/Worker, TLS·Certificate Authority, Load Balancing, Service Discovery, Distributed store(= Orchestration Capabilities)와 Docker 본연의 Networking·Volumes·Plugins·Container Runtime이 있다. swarm mode는 Docker Engine의 '내장 모드'로 `docker swarm init` 으로 켜는 것뿐이다. `docker info` 의 Swarm 항목이 `inactive` → init 후 `active` 로 바뀌고 노드·네트워크 정보가 채워지는 것으로 swarm 활성 여부를 확인한다. 활성화해도 기존 런타임·네트워킹은 유지되고 오케스트레이션 기능만 얹힌다.
- **주요 기능(슬라이드)**: DNS 서버를 통한 서비스 검색(Service Discovery), 서비스용 포트를 외부 Load Balancer에 연결해 부하 분산, 각 노드 TLS(Transport Layer Security) 상호 인증·암호화로 노드 간 통신 보안, 점진적 서비스 업데이트·롤아웃을 위한 rolling update 및 rollout 기능.
- **Manager 노드에서만 클러스터 제어 가능(실습 화면 확인)**: Play with Docker(training.play-with-docker.com/swarm-mode-intro)에서 node1(manager)에 `docker swarm init --advertise-addr $(hostname -i)` 후 `docker node ls`, `docker service create -p 80:80 --name web nginx:latest`; node2(worker)에서 `docker node ls` 실행 시 `Error response from daemon: This node is not a swarm manager. Use "docker swarm init" or "docker swarm join" to connect this node to swarm and try again.` Worker는 컨테이너 실행만 담당하고 클러스터 관리 권한이 없다.
- **용어표(슬라이드)**: Node=swarm cluster를 구성하는 각각의 Docker host / Manager Node=Cluster 관리 및 컨테이너 오케스트레이션 담당 / Worker Node=컨테이너 기반 서비스(Service)들이 실제 동작하는 node / Stack=다중 컨테이너 애플리케이션을 동작시키는 서비스 묶음 / Service=Node에서 수행하고자 하는 작업(배포)의 단위 / Task=애플리케이션이 동작할 컨테이너(하나의 Service는 replica 수에 따라 여러 Task 보유, 각 Task에는 컨테이너 하나 — 가장 작은 scheduling 단위) / Scheduling=Service 명세에 따라 Task(컨테이너)를 node에 분배하는 작업(균등 분배(spread) 또는 labeling을 통한 노드 범위 제한). 'Service가 Task를, Task가 Container를 포함'하는 계층 구조 — replica 3인 Service는 Task 3개, 각 Task에 컨테이너 1개.
- **Manager node는 일도 한다(강사)**: Kubernetes는 기본값으로 마스터(컨트롤 플레인)에 애플리케이션 컨테이너를 배치하지 않지만(설정으로 풀 수 있음), Docker swarm은 기본값으로 Manager node도 관리 업무와 동시에 서비스 컨테이너를 실행할 수 있다. 반대로 Worker node는 관리 역할을 절대 못 하고 서비스 실행(워킹)만 담당. Scheduling은 내부적으로 각 노드에 점수를 계산해 가장 적합한 노드로 배치하는 알고리즘이 동작하며(기본 spread), 사용자가 호스트명에 label을 걸어 '이 서비스는 이 노드로' 범위를 제한할 수도 있다.
- **docker stack(강사)**: 여러 서비스를 하나의 YAML로 정의해 한 번에 배포하는 것이 stack. stack YAML 문법은 Ch10 docker-compose와 거의 동일하며 compose용 YAML을 그대로 stack으로 배포해도 동작한다. 다만 stack은 배포된 컨테이너를 사용자가 선언한 상태(**Desired State**)로 지속적으로 유지해 준다 — Desired State Management는 Docker swarm뿐 아니라 모든 오케스트레이션 도구가 공통으로 지키는 가장 기본적인 원칙. **하나의 서비스당 하나의 VIP**가 제공되어 어느 워커에서 `curl localhost:8888`을 호출해도 응답이 오며 요청은 내부적으로 3개 Task 중 하나로 분산된다. 슬라이드 예: `docker stack deploy -c webapi-stack.yaml webapp`(-c = --compose-file) 후 `docker stack ls`, `docker service ls`(webapp_webAPI replicated 3/3 `*:8888->80/tcp`), `docker service ps webapp_webAPI`(Task가 hostos2/hostos3/hostos1에 1개씩).
- **Raft(슬라이드·강사)**: Manager가 한 대면 그 매니저 장애 시 클러스터 전체를 제어할 수 없게 되므로 Manager를 다중화하고, Raft 합의 알고리즘은 다중 Manager 환경에서 작업 스케줄링 담당 Leader Manager node가 장애로 다운되면 나머지 Manager 중에서 새 Leader를 선출해 작업 조정을 이어가게 하는 '합의, 선출' 알고리즘이다. Manager들은 Internal distributed state store를 공유(Raft consensus group)하고 Worker들은 별도 Gossip network로 서로 상태를 전파한다. Manager(Service Discovery + Scheduler)는 Docker API를 통해 각 worker node의 Docker Daemon과 TLS로 암호화된 통신을 한다(참조: docs.docker.com/engine/swarm/how-swarm-mode-works/nodes/).
- **Service 배포 내부 동작(슬라이드, `docker service create` 시 swarm manager 내부)**: API(명령을 수락하고 Service 객체 생성) → orchestrator(Service 객체에 대한 Task를 생성하는 조정 루프, reconciliation loop) → allocater(Task에 IP 주소 할당) → dispatcher(Node에 Task 할당) → scheduler(worker node에 Task를 실행하도록 지시) → (worker node) worker(할당된 Task를 확인하기 위해 Dispatcher에 연결) → executor(할당된 Task 실행=컨테이너 실행). 강사: swarm에서는 '컨테이너를 실행한다' 대신 'Task를 실행한다'고 표현할 뿐 내부 개념은 동일하고, 뒤에서 다룰 AWS ECS(Elastic Container Service)도 'Task', 'Service'라는 유사한 용어 체계를 쓴다(자료의 '다른 개념' 표현은 부정확했음 — 용어 체계가 비슷하다는 의미).
- **Swarm 네트워크(슬라이드)**: swarm은 노드 간 통신을 위해 두 네트워크를 자동 생성 — Overlay 타입 ingress network(swarm 범위, task 간 통신 및 load balancing 전용, manager와 worker는 swarm 생성 시 제공되는 ingress로 연결, 로드밸런싱은 IPVS 기술 사용)과 Bridge 타입 docker_gwbridge(local, swarm에 참여한 노드들의 Docker 데몬 연결 + 외부 물리 네트워크 연결). 단일 호스트에서 port 미지정으로 배포하면 docker0(172.17.0.x)에 연결되고, 클러스터에서 port를 지정해 배포하면 gwbridge(NAT, 10.x.x.x 대역)에 연결되어 외부와의 연결에 관여. 노드의 컨테이너는 eth0(ingress overlay 10.0.0.x) / eth1(자체 overlay 10.0.0.x)·gwbridge(172.x) 로 구성. `docker network ls` 결과에 swarm init 전에는 overlay 드라이버가 없으며(bridge/host/null만), swarm 활성화 후에만 `docker info`의 Plugins > Network에 overlay가 나타나 사용 가능.
- **ingress overlay IP 대역(강사)**: `docker swarm init` 직후 ingress overlay는 기본 10.0.0.0/8 대역을 쓰되 통째가 아니라 /24(256개 IP)씩 쪼개서 쓰고, 이 분할·할당을 관리하는 것이 IPAM(IP Address Management)이며 각 Task에 virtual IP를 배정.
- **IPVS routing mesh(슬라이드)**: 외부에서 어떤 Node에 접근해도 IPVS와 ingress network를 통해 worker node들이 제공하는 모든 task에 접속 가능(routing mesh) — Service의 port를 게시하면 해당 port가 모든 swarm node에 게시됨. 내부 key-value 저장소(etcd/consul 등: discovery, networks, endpoints, IP addresses; 예: webapi VIP 10.0.0.11, task1~3.webapi 10.0.2.4~6). 5단계: ① 서비스 생성 시 게시한 포트(8888)로 요청 전달 ② Service의 task가 현재 모든 node에 있으므로 모든 node의 IPVS에 접근 가능 ③ Service Discovery 수행(using DNS) ④ 내부 key-value 저장소에서 task name/service name과 일치하는 IP 확인 후 서비스의 VIP를 요청자에게 반환, Ingress network에 연결 ⑤ docker는 서비스 task 간 트래픽을 균등 분배(서비스 VIP 10.0.0.11 → 각 task IP 10.0.2.5로 부하 분산). 흐름: 트래픽 요청 → Service Discovery → VIP 확인 → Load Balancing → 개별 Container 접근.
- **Docker swarm mode**: Docker Engine 에 내장된 클러스터 오케스트레이션 기능. `docker swarm init` 으로 활성화(`docker info` 의 `Swarm: inactive` → `active`). Kubernetes 와 달리 별도 설치 없이 Docker Engine 만으로 구성.
- **Orchestration Capabilities**: Manager/Worker, TLS·Certificate Authority, Load Balancing, Service Discovery(DNS), Distributed store, + Networking/Volumes/Plugins/Container Runtime.
- **주요 기능**: DNS 기반 서비스 디스커버리, 내장 로드밸런서, 노드 간 TLS 통신(보안), 롤링 업데이트(rolling update/rollout).
- **용어**
  - Node: 클러스터 구성 Docker 호스트. Manager Node: 클러스터 관리/오케스트레이션 담당(Leader 포함). Worker Node: 실제 Task(컨테이너) 실행.
  - Stack: 여러 Service 묶음(compose YAML 기반 배포 단위). Service: 클러스터에서 실행할 작업 정의(replica 수 등). Task: Service 의 실행 단위(= 컨테이너 1개, Service → Task → Container). Scheduling: Task 를 어느 Node 에 배치할지 결정(기본 spread, label 로 제어 가능).
  - 예: replica 3 인 Service = Task 3개 = 컨테이너 3개.
- **Desired State Management**: Stack/Service 에 선언한 상태(replica 수 등)를 Swarm 이 계속 유지(자동 복구, self-healing).
- **Raft**: Manager 간 합의(Leader election). Leader Manager 가 장애나면 다른 Manager 가 Leader 로 선출. Manager 는 Internal distributed state store 공유, Worker 간에는 Gossip network 로 통신.
- **Service 생성 흐름** (`docker service create` 시 manager 내부): API → orchestrator(Task 생성/reconciliation loop) → allocater(Task IP 할당) → dispatcher(Node 에 Task 전달) → scheduler(어느 worker 에 배치) → (worker 측) worker → executor(Task 실행).
- **Swarm 네트워크**: Overlay `ingress` network(swarm 범위, task 간 통신/로드밸런싱) + Bridge `docker_gwbridge`(local, swarm 내부 컨테이너의 외부 통신, NAT). docker0(172.17.0.x) vs gwbridge(10.x.x.x 대역 NAT).
- **Ingress overlay**: `docker swarm init` 시 10.0.0.0/8 풀에서 /24 단위(256 IP)로 할당, VXLAN 데이터 경로(UDP 4789).
- **IPVS(IP Virtual Server) routing mesh**: 모든 노드에서 published port(예: 8888) 로 들어온 요청을 IPVS 가 ingress network 의 task 들로 분산. 5단계: 요청 도착 → 노드 IPVS → Service Discovery(DNS) → VIP(key-value: 서비스 VIP ↔ task IP) → Load Balancing(IPVS) → Container.
- Swarm 의 Manager 는 Kubernetes 처럼 control plane 역할을 하며, Worker 는 task 실행. (스케줄링은 기본적으로 spread)

### [사용한 CLI] (Play with Docker 실습: training.play-with-docker.com/swarm-mode-intro)
```bash
# node1 (Manager) 에서 swarm 초기화
docker swarm init --advertise-addr $(hostname -i)
# 노드 목록 (Manager 에서만 가능)
docker node ls
# ID  HOSTNAME  STATUS  AVAILABILITY  MANAGER STATUS
# ...* node1 Ready Active Leader
# ...  node2 Ready Active

# 서비스 생성 (nginx 웹 서비스)
docker service create -p 80:80 --name web nginx:latest
docker service ls
docker service ps <서비스명>
```
- Worker 노드에서 `docker node ls` 실행 시: `Error response from daemon: This node is not a swarm manager. Use 'docker swarm init' or 'docker swarm join' to connect this node to swarm and try again.` → 서비스/노드 관리 명령은 Manager 에서만 가능.

**docker stack 으로 서비스 배포 (webapi-stack.yaml)**
```bash
vi webapi-stack.yaml      # ch11 디렉터리에서 stack YAML 작성
```
```yaml
version: "3.8"
services:
  webAPI:
    image: nginx:1.25.1-alpine
    ports:
      - '8888:80'
    deploy:
      replicas: 3
```
```bash
docker stack deploy -c webapi-stack.yaml webapp     # -c = --compose-file, 스택명 webapp
docker stack ls
docker service ls
# ID  NAME  MODE  REPLICAS  IMAGE  PORTS
# ... webapp_webAPI replicated 3/3 nginx:1.25.1-alpine *:8888->80/tcp
docker service ps webapp_webAPI                      # Task 3개가 hostos1~3 에 분산 배치
curl localhost:8888                                  # 어느 노드에서든 VIP 로 접속, 3개 Task 로 분산
```

**서비스 확인/디버깅 명령**
```bash
curl 192.168.56.202:8888                       # 서비스 포트(published) 로 접근
curl localhost:8080
docker service ps webapp_webAPI
docker service inspect --pretty webapp_webAPI  # 서비스 상세(사람이 읽기 쉬운 형태)
docker service logs cay74e73dvk3 -f            # 서비스/Task ID 로 로그 follow
docker network ls                              # bridge / host / overlay(ingress) 확인
docker info                                    # Swarm: inactive/active, Plugins > Network 에 overlay 확인
```

### [확인 방법/주의점]
- `docker node ls` 의 MANAGER STATUS 가 `Leader` 인 노드가 Raft Leader.
- Service(작업 정의) / Task(실행 단위) / Container(실제 프로세스) 관계를 구분.
- 정정: Swarm 의 `Task`/`Service` 용어는 AWS ECS 와 유사한 용어 체계이며(강사 설명) '다른 개념'이라는 이전 서술은 부정확. Swarm 에서는 컨테이너를 '실행'한다는 대신 Task 를 실행한다고 표현할 뿐이다.

---

## Step 7. Swarm 클러스터 구성 (init / join) 및 상태 확인

### [목적]
- 서버 3대(hostos1=manager, hostos2·3=worker, IP 192.168.56.201/202/203 — 자료에는 .101/.102/.103 표기도 함)로 Swarm 클러스터를 구성하고 상태/네트워크/포트를 확인한다.

### [이론 설명]
> 보강 근거: 'Ch11 Clip 2. docker swarm cluster 구성 및 모니터링'(약 23.8분, 16쪽) PDF 전체를 슬라이드 이미지로 확인함(Step 7=Part1 구성, Step 8=Part2 모니터링).
- 실습 준비(강사): 호스트 3대(hostos1/2/3, IP .201/.202/.203 — 자료에 .101~.103 표기도 혼재)를 준비하고 MobaXterm으로 세 노드에 모두 미리 SSH 접속해 두었다. hostos1=manager, 나머지 둘=worker. manager가 될 노드에서 먼저 `docker info | grep Swarm` 으로 `Swarm: inactive` 확인 후 `docker swarm init` 으로 클러스터를 시작한다.
- `--advertise-addr` 은 다른 swarm node들이 이 manager 에 접근하기 위한 IP(강사: '나는 매니저이니 앞으로 여기로 접속하라고 광고하는 주소'). init 성공 시 worker 합류용 `docker swarm join --token SWMTKN-1-... 192.168.56.201:2377` 명령이 그대로 출력되므로 이를 복사해 각 worker 에서 실행(`This node joined a swarm as a worker.`). **주의(강사)**: `--advertise-addr` 에 IP 대신 호스트 이름을 쓸 수도 있으나 그 경우 반드시 `/etc/hosts` 에 클러스터에 참가할 모든 노드의 이름-IP 를 미리 등록해 두어야 한다. 특히 VM을 복제해 worker 를 만든 경우 `/etc/hosts` 에 복제 전 IP 가 그대로 남아 있을 수 있으니 실제 IP 로 고쳐졌는지 반드시 확인 — 이런 사소한 값 하나 때문에 통신 장애가 생길 수 있다.
- join 토큰은 시간이 지나도 다시 확인 가능: manager 에서 `docker swarm join-token worker`(또는 manager). 이후 관리 명령(`docker node ls` 등)은 manager 노드에서만 실행되며 MANAGER STATUS 가 `Leader` 인 노드가 현재 클러스터를 이끄는 manager. (슬라이드의 `docker node ls` 결과 ENGINE VERSION 24.0.2)
- `docker info | grep -i swarm: -A 25` 로 ClusterID, Managers 수, Nodes 수, Raft 하트비트/일렉션 틱, Manager Addresses 까지 한 번에 확인(`docker node ls` 보다 상세). 강사 설명: Raft 는 매니저에 문제가 생겼을 때 새 리더를 뽑는 합의 선출 알고리즘(이중화 도구의 마스터 선출 방식과 유사). Dispatcher 는 서비스를 생성했을 때 그 작업(task)을 어떤 노드에 배치할지 결정해 전달하는 역할. Default Address Pool 10.0.0.0/8 은 약 1,670만 개의 IP 를 가진 매우 큰 대역이며 실제로는 SubnetSize 24 만큼, 즉 256개씩 잘라서 각 오버레이 네트워크에 나눠 쓴다.
- swarm 초기화 후 `docker network ls` 에 두 네트워크가 자동 추가: `docker_gwbridge`(bridge, local — 노드 안에서 컨테이너가 외부(호스트)와 통신할 때 쓰는 통로, 172.26.0.0/16, Ingress=false)와 `ingress`(overlay, swarm — 스케일 아웃된 서비스로 들어오는 요청을 라우팅하는 Routing Mesh, 10.0.0.0/24, Ingress=true, Peers 에 클러스터의 세 노드 IP 가 모두 등록). 강사: gwbridge 는 단일 호스트 설치 때 기본 생기는 docker0(172.17.0.0/16)와 비슷한 성격의 노드 밖 통로이고, ingress 는 swarm 참가 노드를 모두 포함하는 네트워크로 worker 가 join 할 때마다 Peers 에 자동 추가.
- manager와의 클러스터 관리 통신에는 TCP 2377, 모든 노드 간 상태 동기화(gossip)에는 TCP/UDP 7946(control plane), 컨테이너 간 오버레이 네트워크 트래픽(VXLAN)에는 UDP 4789(data plane)가 사용되므로 사내 방화벽이 있는 환경이라면 swarm 구성 전에 이 세 포트를 미리 열어(또는 방화벽을 stop) 두어야 한다. (슬라이드 도식에는 VXLAN data plane 이 `udp 4798` 로 오기되어 있으나 표와 netstat 결과는 4789 — 4789 가 맞다.)
- manager 에서 netstat: `tcp6 :::2377 LISTEN dockerd`, `tcp6/udp6 :::7946`, `udp 0.0.0.0:4789`. worker 에서는 7946 만 LISTEN(2377 은 manager 전용).
- manager 노드에서 `docker swarm init`, worker 에서 `docker swarm join --token` 로 합류.
- `--advertise-addr`: 다른 노드가 manager 에 접근할 때 사용하는 IP 지정(자료의 주의: 여러 IP/호스트명 환경에서 명시적으로 지정).
- join token 은 worker 용/manager 용이 다르며 manager 에서 `docker swarm join-token worker|manager` 로 다시 확인 가능.
- **swarm 사용 포트(방화벽 오픈 필요)**: 2377/TCP(클러스터 관리, manager API), 7946/TCP·UDP(노드 간 통신, gossip → Control plane), 4789/UDP(VXLAN → Data plane, overlay).
- swarm 생성 시 만들어지는 네트워크: `docker_gwbridge`(bridge, local, 172.26.0.0/16), `ingress`(overlay, swarm, 10.0.0.0/24, Ingress: true). ingress 의 Peers 에 join 된 노드 IP 가 모두 표시.
- docker info 의 Default Address Pool 10.0.0.0/8, SubnetSize 24 → 약 65,536/256 …(자료: 서브넷당 256 IP).

### [사용한 CLI]
```bash
# 1) swarm 모드 확인
docker info | grep Swarm
# Swarm: inactive

# 2) Manager 노드 (hostos1) 초기화
docker swarm init --advertise-addr 192.168.56.201
# Swarm initialized: current node (vlrx...) is now a manager.
# To add a worker to this swarm, run the following command:
#   docker swarm join --token SWMTKN-1-xxxx 192.168.56.201:2377
# To add a manager to this swarm, run 'docker swarm join-token manager' and follow the instructions.

# 3) Worker 노드 (hostos2, hostos3) 합류
docker swarm join --token SWMTKN-1-<토큰> 192.168.56.201:2377
# This node joined a swarm as a worker.

# join 명령을 잊어버린 경우 (manager 에서)
docker swarm join-token worker
docker swarm join-token manager

# 4) 노드 확인 (manager 에서만)
docker node ls                          # hostos1 Leader / hostos2·3 Ready Active
docker node inspect hostos1 --pretty

# 5) swarm 상세 정보
docker info | grep -i swarm: -A 25
#  Swarm: active / NodeID / Is Manager: true / ClusterID / Managers: 1 / Nodes: 3
#  Default Address Pool: 10.0.0.0/8 / SubnetSize: 24 / Data Path Port: 4789
#  Orchestration: Task History Retention Limit: 5
#  Raft: Snapshot Interval: 10000 / Heartbeat Tick: 1 / Election Tick: 10
#  Dispatcher: Heartbeat Period: 5 seconds
#  CA Configuration: Expiry Duration: 3 months / Autolock Managers: false
#  Node Address: 192.168.56.201 / Manager Addresses: 192.168.56.201:2377

# 6) swarm 생성 네트워크
docker network ls                       # bridge, docker_gwbridge(local), ingress(overlay, swarm)
docker network inspect docker_gwbridge  # Subnet 172.26.0.0/16, Gateway 172.26.0.1, ingress-sbox 172.26.0.2/16
docker network inspect ingress          # Scope swarm, Driver overlay, Ingress true, Subnet 10.0.0.0/24, Gateway 10.0.0.1, Peers[3 노드 IP]

# 7) swarm 포트 리슨 확인
sudo netstat -nlp | grep dockerd        # worker 에서 7946 확인
sudo netstat -nlp | grep 2377           # tcp6 :::2377 LISTEN dockerd
sudo netstat -nlp | grep 7946           # tcp6/udp6 :::7946
sudo netstat -nlp | grep 4789           # udp 0.0.0.0:4789
```
- `docker swarm init --advertise-addr <IP>`: 이 노드를 manager 로 swarm 초기화. `docker swarm join --token <TOKEN> <manager-IP>:2377`: 클러스터 합류. `docker node inspect <노드> --pretty`: 노드 상세.

### [확인 방법/주의점]
- `docker node ls` 는 manager 에서만 동작. hostos1 에 `*`(현재 노드)와 `Leader` 표시.
- 방화벽에서 2377/tcp, 7946/tcp+udp, 4789/udp 오픈 필요(자료의 주석: firewall open 또는 stop).
- worker join 전후 `docker info | grep -i swarm` 로 상태 변화를 확인(inactive → active).
- /etc/hosts 에 호스트명-IP 매핑이 되어 있으면 join 시 편리. 

---

## Step 8. Swarm 모니터링 도구 설치 (Portainer / Visualizer / Swarmpit)

### [목적]
- 3노드 클러스터의 상태·서비스 배치·자원을 GUI 로 확인하는 도구 3종 설치.

### [이론 설명]
> 보강 근거: Clip 2 PDF 후반부(Part 2 모니터링 도구 3종) 슬라이드 확인. 강사는 앞 챕터에서 단일 호스트 리소스 모니터링에 cAdvisor, Prometheus+Grafana 조합을 권장했는데, Swarm 클러스터 환경에서는 별개로 Portainer, Visualizer, Swarmpit 세 가지를 소개하며 모두 설치해 본 뒤 각자 업무에 맞는 도구를 선택해 사용하라고 권장.
- **Portainer 장점(강사)**: 단일 호스트든 Swarm 클러스터든 상관없이 똑같이 쓸 수 있다는 점이 가장 큰 장점. 컨테이너·이미지·네트워크·볼륨까지 GUI로 관리하는 범용 도구(Swarm 전용은 아님)이며, 로그인 후 'local' 환경으로 들어가 Swarm 메뉴에서 Cluster overview(Nodes 3, Total CPU 12, Total memory 16.52GB, 노드별 역할 manager/worker·CPU·메모리·엔진 버전·IP·상태 ready/active)를 볼 수 있고 stack, service, node 정보와 컨테이너 로그·리소스 사용량까지 한 화면에서 확인 가능. 처음 접속 시 admin 계정을 생성하는 화면이 뜬다. 컨테이너가 호스트 도커 소켓(/var/run/docker.sock)에 접근하도록 볼륨으로 연결하고, 설정 보관용 portainer_data 볼륨도 함께 생성.
- **Visualizer가 필요한 이유(강사)**: 서비스가 여러 호스트에 걸쳐 올라갈 때 호스트마다 일일이 접속해 확인하는 것은 번거로우므로, 여러 노드를 하나의 클러스터로 묶어 어디에 어떤 서비스가 떠 있는지 한눈에 보여주는 시각적 피드백이 중요. 특징은 오직 이 '직관성' 하나이며 리소스 수치(CPU/메모리 그래프)는 보여주지 않는다. 다음 클립에서 여러 서비스를 올릴 때 이 화면으로 호스트별 배치를 실시간 확인.
- **Swarmpit**: docker stack 으로 구동되는 좀 더 무거운 도구로 app/agent/db/influxdb 4개 서비스(스택)로 구성. `swarmpit/install:edge` 이미지를 `--rm` 옵션으로 1회성 실행해 설치 마법사를 띄우고, 스택 이름·포트·볼륨 드라이버를 묻는 질문에 기본값을 그대로 두면([swarmpit] / [888] / [local]) 자동으로 `swarmpit_net` 네트워크와 4개 서비스(db, influxdb, agent, app)를 생성. 888 포트 접속 시 `Create first admin account and sign in` 화면에서 admin 계정 생성(비밀번호는 마스킹). 대시보드: CLUSTER 3 nodes(manager 1·worker 2), DISK/MEMORY/CPU 사용량 게이지. 세 도구 중 유일하게 서비스별 CPU/메모리 사용량 추이 그래프까지 제공해 실무에서 지속적으로 리소스를 모니터링하기에 가장 적합하다고 소개.
- Visualizer 최종 화면: hostos1(manager)에 swarmpit_app/viz_swarm/swarmpit_agent, hostos2에 swarmpit_agent/swarmpit_db, hostos3에 swarmpit_influxdb/swarmpit_agent 배치(2번째 Visualizer 슬라이드). 초기 Visualizer 화면은 hostos1에 viz_swarm 하나만(hostos1 manager 7.751G RAM, hostos2·3 worker 3.819G RAM).
- Portainer: docker run 으로 설치, docker.sock 마운트, 9000 포트 웹 UI. Swarm 클러스터 개요(노드 3, CPU, 메모리), stack/service/node 관리.
- Visualizer(dockersamples/visualizer): swarm 서비스(Task)가 어느 노드에 배치됐는지 시각화(8082 포트), manager 에 배치(`--constraint=node.role==manager`), docker.sock 을 bind mount. CPU/메모리 정보는 없음(Portainer·Swarmpit 이 제공).
- Swarmpit: installer 컨테이너가 docker stack 으로 app/agent/db/influxdb 4개 서비스를 배포(웹 UI 888 포트, 최초 관리자 계정 생성). CPU/메모리/디스크 모니터링.

### [사용한 CLI]
```bash
# Portainer
docker volume create portainer_data
docker run -d -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  --restart=always \
  portainer/portainer-ce
# 접속: http://<manager IP>:9000  → Swarm 환경 선택 → Cluster overview(Nodes 3, Total CPU, Memory)

# Visualizer (swarm service 로 생성)
docker service create \
  --name=viz_swarm \
  --publish=8082:8080 \
  --constraint=node.role==manager \
  --mount=type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  dockersamples/visualizer
# overall progress: 1 out of 1 tasks ... verify: Service converged
docker service ls          # viz_swarm replicated 1/1 *:8082->8080/tcp
docker service ps viz_swarm
# 접속: http://<manager IP>:8082

# Swarmpit (installer 대화형 실행)
docker run -it --rm \
  --name swarmpit-installer \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  swarmpit/install:edge
# Enter stack name [swarmpit]:
# Enter application port [888]:
# Enter database volume driver [local]:
# DONE. ... Enjoy :)
# 접속: http://<IP>:888 → 관리자(admin) 계정 생성
```
- `--publish=8082:8080`: 호스트 8082 → 컨테이너 8080. `--constraint=node.role==manager`: manager 노드에만 배치. `--mount=type=bind,src=,dst=`: 호스트 경로 바인드 마운트. `--rm`: 종료 시 컨테이너 삭제.

### [확인 방법/주의점]
- Visualizer: hostos1(manager) 에 viz_swarm, swarmpit_app, swarmpit_agent; hostos2 에 swarmpit_agent/swarmpit_db; hostos3 에 swarmpit_influxdb/swarmpit_agent 등 분산 배치 확인.
- Swarmpit 은 `swarmpit_net` 네트워크와 4개 서비스(db/influxdb/agent/app) 생성.
- Portainer 의 `local` 환경에서 stack/service/node(swarm) 항목 확인.

---

## Step 9. 다양한 swarm service 구성 (create / scale / mode / self-healing / rolling update / rollback / node drain)

### [목적]
- docker service 명령으로 서비스 생성·조회·확장·모드 선택·장애 복구·롤링 업데이트·롤백·노드 유지보수(drain)를 실습.

### [이론 설명]
> 보강 근거: 'Ch11 Clip 3. [실습] 다양한 swarm service 구성'(약 31분, 16쪽) PDF 전체를 슬라이드 이미지로 확인함. 실습 순서: 실습1 stdout 서비스 / 실습2 nginx 서비스(create·scale) / 실습3 service mode(global) / 실습4 장애 복구 / 실습5 rolling update·rollback·업데이트 옵션 / 실습6 node 유지보수(drain).
- **docker service create 기본 구조(강사)**: 이미지 뒤에 실행할 커맨드를 그대로 붙이면 된다(예: `ubuntu:14.04 /bin/sh -c "while true; do echo 'welcome to docker swarm mode.'; sleep 3; done"` — 3초마다 문자열을 echo해 서비스가 살아있는지·로그가 쌓이는지 눈으로 확인). 실습1에서는 일부러 `--replicas` 와 `--name` 을 생략: replicas 를 안 주면 기본값 1, `--name` 을 안 주면 Docker 가 `eloquent_bohr`, `intelligent_hellman` 처럼 랜덤 이름을 자동 부여. `docker service ls`는 서비스 단위 요약(모드·복제본 수·이미지), `docker service ps`는 서비스를 구성하는 개별 task가 어느 node에서 실행 중인지, `docker service logs -f`는 여러 노드에 흩어진 컨테이너 로그를 한 곳에서 실시간 통합. 명령 후의 `overall progress → verify: Service converged` 는 '요청한 상태로 서비스가 수렴(생성 완료)되었다'는 뜻. 내부 흐름: ① API가 요청을 받고 ② Orchestrator 처리 ③ Dispatcher·Scheduler가 배치 노드 결정 ④ 그 노드(Worker)에 task 할당. 실습이 끝난 서비스는 `docker service rm <서비스명>`으로 정리하며 Visualizer 화면에서도 해당 서비스 블록이 실시간으로 사라진다.
- **실습2 nginx**: `docker service create --name myweb --replicas=3 -p 8001:80 nginx:1.25.0-alpine` — 이후 실습에서 재사용되므로 replicas 와 -p 포트 퍼블리시 방식을 정확히 봐 둔다. task 3개가 hostos1(manager)·hostos2·hostos3에 하나씩 배치 — **매니저 노드도 워커 역할을 함께 수행**(강사). 어느 노드 IP(예: 192.168.56.203:8001)로 curl 해도 똑같이 nginx 응답이 오는 것은 ingress 네트워크의 IPVS가 내부 key-value 데이터 스토어에서 서비스 디스커버리 → 대상 task IP 확인 → 연결까지 자동 처리하기 때문. 확장·축소는 `docker service scale myweb=6`(scale-out/scale-in 동일 명령, 즉시 반영). 6개로 늘어난 task가 hostos1/2/3에 2개씩 고르게 배치된 것은 우연이 아니라 Swarm 기본 'Spread'(균등 배분) 스케줄링 정책 때문이며, 특정 노드에 몰아 배치하려면 placement 제약조건을 별도로 지정.
- **replicated vs global(슬라이드)**: "replicated" Service는 사용자가 원하는 수만큼 Task를 동일하게 생성(기본). "global" Service는 모든 Node에서 하나의 Task를 실행하는 Service이며 `--replicas` 지정 안 함(`--replicas` 옵션 자체를 쓸 수 없다). 모니터링 에이전트처럼 '모든 노드에 반드시 하나씩 떠 있어야 하는' 서비스에 적합하고 Kubernetes의 DaemonSet과 같은 개념(강사). global mode의 task도 죽으면 replicated와 마찬가지로 자동 재생성된다. 예: `docker service create --name global-myweb --mode global nginx:1.25.0-alpine` → `inspect --pretty`에 `Service Mode: Global`, `docker service ps` 결과 hostos2/hostos3/hostos1 각 1개.
- `docker service create` 는 stdout 을 출력하는 단순 서비스부터 nginx 웹까지 생성 가능. `--replicas`, `--name` 생략 시 replicas=1, 이름은 자동 부여(예: eloquent_bohr, intelligent_hellman).
- 서비스 mode: **replicated**(지정한 replica 수만큼 task 배치, 기본) vs **global**(모든 노드에 task 1개씩, `--replicas` 불필요; Kubernetes DaemonSet 과 유사 — 에이전트/모니터링 용도).
- Swarm 기본 스케줄링은 spread(노드에 균등 분산).
- **self-healing 슬라이드 보충(실습4)**: `docker rm -f myweb.2.<ID>` 로 컨테이너를 강제 삭제(장애 유발)하면 해당 task가 `Shutdown / Failed ... "task: non-zero exit (137)"` 로 이력에 남고 Swarm은 곧바로 같은 슬롯 번호(myweb.2)에 새 task를 Running 상태로 올려 replicas(6/6)를 다시 맞춘다. 노드 장애는 해당 노드에서 `sudo systemctl stop docker` 로 재현 → manager의 `docker node ls`에 hostos3 STATUS `Down`, Visualizer에 빨간 점으로 표시되고 그 노드의 task는 hostos1/hostos2에서 새로 Running. 다시 `sudo systemctl start docker` 로 복구하면 `Ready/Active`로 돌아오지만(해당 슬라이드에 `Warning: Stopping docker.service, but it can still be activated by: docker.socket` 경고가 보임) **이미 옮겨간 task는 자동 리밸런싱되지 않고** 그 자리에 남는다. 이 '사용자가 요청한 상태를 항상 만족시키도록 유지'하는 동작이 Desired State Management이며 Docker Swarm뿐 아니라 Kubernetes를 포함한 모든 오케스트레이션 도구의 공통 핵심 기능(강사).
- **rolling update/rollback 보충(실습5)**: `docker service create --name rollup_myweb --replicas 3 nginx:1.10` 후 `docker service update --image nginx:1.17 rollup_myweb` — 모든 task를 한 번에 내리지 않고 하나씩 Shutdown → 새 이미지로 Running (ps 결과에 이전 task는 Shutdown, 새 task는 Running으로 나란히 남음). **rollback은 '한 단계'만** 되돌린다: `docker service rollback rollup_myweb` 는 가장 최근 업데이트 한 번만 취소하며(예: nginx:1.17 → 1.10), 이미 한 번 rollback한 상태에서 다시 실행하면 그 rollback 자체를 되돌린다. 여러 단계 전으로 되돌리려면 별도의 배포 이력·버전 관리 방법을 구축해야 한다(강사). `--update-max-failure-ratio` 는 '업데이트 재시도 허용 횟수(비율)' 로 이해하면 쉽다(예: 3이면 3번째 실패까지는 계속 시도, 그 이상 실패하면 전체 업데이트를 실패로 간주하고 `--update-failure-action`(pause/continue/rollback) 동작을 따름). `docker service inspect --pretty rollup_myweb2`의 UpdateConfig: Parallelism 2, Delay 10s, On failure pause, Monitoring Period 5s, Max failure ratio 0, Update order stop-first. `--update-failure-action continue` 로 만든 myweb3(replicas 3, nginx:1.21)는 Parallelism 1, On failure continue. 옵션 설명(슬라이드): `--update-parallelism`=동시에 업데이트할 컨테이너 개수, `--update-delay`=업데이트 간 간격, `--update-order`=start-first면 새 컨테이너를 먼저 생성한 뒤 기존 컨테이너 삭제 / stop-first면 기존 컨테이너를 먼저 삭제하고 새 컨테이너 생성, `--update-failure-action`=실패 시 pause면 업데이트 멈춤 / continue면 계속 / rollback이면 롤백.
- **node drain(실습6)**: 서버 점검(하드웨어 교체 등)으로 특정 노드를 잠시 서비스 배치 대상에서 빼야 할 때 노드를 통째로 내리는 대신 `docker node update --availability`로 상태만 바꾼다(`docker node update -h`로 active/pause/drain 확인, availability 외에 라벨 부여 등 여러 하위 옵션도 있음). drain은 원래 '(물을) 빼내다'라는 뜻으로 그 노드에서 서비스를 싹 비워낸다는 의미 — drain 노드는 새 task를 절대 받지 않고 이미 돌던 task도 다른 활성 노드로 옮겨져, 안전하게 재부팅·패치 등 점검 작업을 할 수 있다. 점검 후 `--availability active` 로 되돌려도 이미 옮겨간 replicated task는 자동 리밸런싱되지 않으며, global mode 서비스만 '모든 노드에 하나씩'이 원칙이므로 재배치된다.
- **self-healing**: replicated 서비스는 Manager 가 desired state(원하는 replica 수)를 계속 확인 → 컨테이너가 삭제/노드가 다운되면 다른 노드에서 task 자동 재생성(= Desired State Management). 복구된 노드로 task 가 자동 되돌아오지는 않음.
- **rolling update**: `service update --image` 로 task 를 순차 교체(Shutdown → Running). `--update-parallelism`(동시 교체 수), `--update-delay`(교체 간 대기), `--update-order`(start-first/stop-first), `--update-failure-action`(pause/continue/rollback), `--update-max-failure-ratio`(허용 실패 비율).
- **rollback**: `docker service rollback` 은 직전 설정(이전 이미지)으로 되돌림.
- **node availability**: active(기본) / pause / drain. drain 이면 해당 노드의 task 가 다른 노드로 이동하고 새 task 도 배정 안 됨(유지보수용). active 로 되돌려도 기존 replicated task 가 자동으로 되돌아오지 않음; global mode 는 active 복귀 시 task 가 다시 배치.

### [사용한 CLI]

**(1) stdout 서비스**
```bash
docker service create ubuntu:14.04 /bin/sh -c "while true; do echo 'welcome to docker swarm mode.'; sleep 3; done"
docker service ls                          # 자동 이름(예: intelligent_hellman)
docker service ps intelligent_hellman      # task 가 배치된 노드 확인
docker service logs -f intelligent_hellman # 로그 실시간(follow)
docker service rm intelligent_hellman      # 서비스 삭제
```

**(2) nginx 서비스 + scale**
```bash
docker service create --name myweb --replicas=3 -p 8001:80 nginx:1.25.0-alpine
docker service ls
docker service ps myweb
curl 192.168.56.203:8001                   # 어느 노드 IP 로 접근해도 응답 (ingress/routing mesh)
docker service inspect --pretty myweb
docker service scale myweb=6               # 6개로 확장 (scale-out/scale-in 모두 가능)
docker service ps myweb                    # hostos1/2/3 에 spread 배치
```

**(3) service mode: global**
```bash
docker service create --name global-myweb --mode global nginx:1.25.0-alpine
docker service inspect --pretty global-myweb   # Service Mode: Global
docker service ps global-myweb                 # 노드 3대에 1개씩
```

**(4) 장애 복구 (self-healing)**
```bash
docker rm -f myweb.2.xxxx            # (해당 노드에서) task 컨테이너 강제 삭제 → exit code 137
docker service ps myweb              # 이전 task Shutdown, 새 task Running (6/6 유지)

# 노드 장애 시뮬레이션 (hostos3)
sudo systemctl stop docker
docker node ls                       # hostos3 STATUS Down, task 가 hostos1/2 로 재배치
sudo systemctl start docker
docker node ls                       # Ready/Active 복귀
docker service ps myweb              # 이미 옮겨진 task 는 되돌아오지 않음
```

**(5) rolling update / rollback**
```bash
docker service create --name rollup_myweb --replicas 3 nginx:1.10
docker service update --image nginx:1.17 rollup_myweb      # 이미지 롤링 업데이트
docker service ps rollup_myweb                              # 이전 task Shutdown, 새 task Running

docker service create --replicas=6 --name rollup_myweb2 --update-delay 10s --update-parallelism 2 nginx:1.17   # 업데이트 정책 지정 생성 (슬라이드: --name rollup_myweb2 포함)
docker service rollback rollup_myweb                        # nginx:1.17 → nginx:1.10 으로 복귀
docker service ps rollup_myweb

# 업데이트 옵션 요약
#   --update-parallelism N              동시에 업데이트할 task 수
#   --update-delay 10s                  배치 간 대기
#   --update-order start-first|stop-first
#   --update-failure-action pause|continue|rollback
#   --update-max-failure-ratio          허용 실패 비율
docker service inspect --pretty myweb3     # UpdateConfig(Parallelism/Delay/On failure/Update order) 확인
# 예: --update-failure-action continue 로 생성한 myweb3 → On failure: continue 표시
```

**(6) 노드 유지보수: drain / active**
```bash
docker node update -h                                   # --availability string ("active"|"pause"|"drain")
docker node update --availability drain hostos2         # hostos2 의 task 가 다른 노드로 이동
docker node ls                                          # hostos2 AVAILABILITY: Drain
docker node update --availability active hostos2        # 다시 활성화
docker node ls                                          # Active 복귀
```

### [확인 방법/주의점]
- `verify: Service converged` / `overall progress: N out of N tasks` 로 서비스 수렴 확인.
- replicated 서비스는 노드 복구 후에도 이미 이동한 task 가 원래 노드로 자동 복귀하지 않음 → 필요 시 scale 변경 또는 재배포.
- drain → active 후에도 replicated task 는 자동 재분산되지 않음(global mode 는 active 노드에 task 재배치).
- 컨테이너를 `docker rm -f` 해도 Swarm 이 desired state 를 맞추기 위해 자동 재생성한다는 점을 활용해 검증.

---

## Step 10. docker stack 으로 서비스 배포 (HAProxy + Nginx)

### [목적]
- compose 형식의 stack YAML 로 HAProxy(manager, global) + Nginx(worker, replicated 4)를 swarm 에 배포하고 로드밸런싱을 확인한다.

### [이론 설명]
> 보강 근거: 'Ch11 Clip 4. [실습] docker stack을 활용한 서비스 배포'(약 13분, 14쪽) PDF 전체를 슬라이드 이미지로 확인함(Ch11 마지막 클립).
- **슬라이드 정의**: docker swarm은 여러 노드로 구성된 클러스터 환경에서 서비스를 통해 컨테이너 애플리케이션을 배포한다. docker compose는 YAML 코드를 통해서 컨테이너 간의 연결성을 제공하지만 동일 호스트에서 실행되므로 수평 확장은 한 호스트의 리소스로 제한된다. docker stack은 위 두 기술을 연결하고 docker-compose.yaml 코드를 사용하여 swarm에 연결된 클러스터의 노드에 연결된 컨테이너 서비스를 실행하여 연결성을 제공한다. 도식: `docker stack = docker swarm mode(클러스터 내 여러 노드에 종속성 없는 컨테이너 배포) + docker compose(단일 호스트에서 컨테이너 간 연결성 제공)`.
- **강사 강조**: "코드는 같은데 실행되는 범위가 다르다". docker-compose.yaml 을 `docker compose up` 으로 실행하면 한 호스트에서만 서비스가 뜨지만, 같은 코드를 `docker stack deploy` 로 실행하면 swarm 클러스터의 여러 노드에 나뉘어 배포된다. 예: 프런트/백엔드/DB 3-tier 컨테이너를 compose로 실행하면 한 호스트에 다 몰리지만 stack으로 배포하면 3개 노드에 분산된 환경에서 서비스가 연결될 수 있다는 것이 docker stack의 핵심 포인트.
- **실습 아키텍처(슬라이드)**: manager node에 HAProxy service(global)를 생성하고, 해당 IP로 웹 접속이 들어오면 이를 동일 overlay network 안에 있는 nginx service로 트래픽을 분산시켜 주는 방법 실습. HAProxy는 global 모드로 매니저 노드에 고정 배치, Nginx(replicas 1~4)는 replicated 모드 4개를 워커 노드 2대에 spread(기본값) 방식으로 골고루 배치, 모두 Ingress Overlay network(10.0.0.0/8)로 연결. 외부의 Nginx web service 요청은 manager의 HAProxy를 거쳐 worker의 Nginx로 분산(슬라이드 빨간 화살표).
- **전용 overlay 네트워크**: `--driver=overlay` 는 swarm이 초기화(swarm init을 마친)된 상태에서만 쓸 수 있는 드라이버. HAProxy·Nginx 두 서비스를 같은 네트워크(haproxy-web)에 연결하기 위해 미리 만들고, YAML에서는 `external: true`로 가져다 쓴다. 슬라이드 주석: Docker swarm route mesh는 Service의 port를 게시할 경우 해당 port가 모든 swarm node에 게시되도록 함(IPVS 사용) — ingress route mesh가 있는 haproxy service.
- 작업 디렉터리: `fastcampus/ch11/haproxy-nginx` (`mkdir haproxy-nginx && cd $_`). YAML 설명(강사): proxy 서비스는 `dbgurum/haproxy:1.0` 이미지 안에 haproxy.cfg 설정 파일이 이미 구성되어 있어 별도 설정 파일을 작성하지 않았다. `depends_on` 으로 nginx가 먼저 뜨도록 지정, 호스트의 도커 소켓을 볼륨으로 마운트해 HAProxy가 컨테이너 정보를 동적으로 참조. nginx는 replicated(기본값) 4개, proxy는 global(대상 노드에 정확히 1개씩)이며 두 서비스 모두 `placement.constraints` 로 각각 "manager가 아닌 노드"(`node.role != manager`)와 "manager 노드"(`node.role == manager`)에만 배치되도록 강제. 결과 Nginx 4개(1~4번)는 hostos2·hostos3에 골고루, HAProxy 1개는 hostos1에만 배치.
- **[참조] 라벨 기반 배치(강사가 '실행하지 않는 참고용'이라고 명시)**: 지금까지는 `node.role`(매니저인지 아닌지)로 조건을 걸었지만 노드를 식별하는 또 다른 방법으로 라벨(label)이 있다. `docker node update --label-add 키=값 호스트명` 으로 원하는 key/value 라벨을 노드에 붙이고 `docker node inspect 호스트명` 의 Spec.Labels 에서 확인. 이후 `docker stack rm haproxy-web` → `cp haproxy-web-stack.yaml haproxy-web2-stack.yaml` → `vi haproxy-web2-stack.yaml` 로 `placement.constraints: [node.labels.zone == fastzone1]` 처럼 라벨 기준으로 바꾸고 `docker stack deploy --compose-file=haproxy-web2-stack.yaml haproxy-web` 로 재배포하면 node.role 대신 라벨 값으로 배치 노드를 지정할 수 있다(직접 따라해 볼 것을 권장). 정정: 슬라이드의 라벨 예시는 `zone=fastzone1` 을 hostos2 와 hostos3 **둘 다**에 부여(아래 CLI 주석의 hostos3=fastzone2 는 원문과 다르므로 정정).
- `docker stack` = docker swarm(멀티 호스트 오케스트레이션) + docker compose(YAML 기반 다중 서비스) → compose YAML 을 swarm 클러스터에 배포.
- compose 는 단일 호스트에 `up`, stack 은 swarm 에 `deploy` 하여 노드 3대에 걸쳐 분산 배치.
- 구성: manager 에 HAProxy(global), worker(hostos2·3) 에 Nginx 4개(replicated, spread 로 2개씩). 모두 같은 overlay 네트워크 `haproxy-web` 연결(Ingress overlay 10.0.0.0/8 위에서 동작).
- `placement.constraints` 로 배치 노드 제한: `node.role != manager`(Nginx), `node.role == manager`(proxy). node label(`zone=fastzone1`)을 만들어 `node.labels.zone == fastzone1` 형태로도 배치 제어 가능.
- `--driver=overlay` 네트워크는 swarm 이 init 된 상태에서만 생성 가능. `--attachable` 로 컨테이너가 수동 attach 가능.
- 로드 밸런싱은 Ingress/IPVS routing mesh 가 처리(라운드로빈).

### [사용한 CLI]
```bash
mkdir haproxy-nginx && cd $_

# 1) overlay 네트워크 생성
docker network create --driver=overlay --attachable haproxy-web
docker network ls                   # haproxy-web overlay swarm, ingress overlay swarm

# 2) stack YAML 작성
vi haproxy-web-stack.yaml
```
```yaml
version: '3'
services:
  nginx:
    image: nginx:1.25.0-alpine
    deploy:
      replicas: 4                                  # 컨테이너 4개
      placement:
        constraints: [node.role != manager]        # manager 노드를 제외한 노드에 배치
      restart_policy:
        condition: on-failure
        max_attempts: 3
    environment:
      SERVICE_PORTS: 80
    networks:
      - haproxy-web
  proxy:
    image: dbgurum/haproxy:1.0                     # 사전 구성된 haproxy.cfg 포함 이미지
    depends_on:
      - nginx                                      # nginx service 먼저
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - 80:80
    networks:
      - haproxy-web
    deploy:
      mode: global                                 # 각 노드에 task 1개
      placement:
        constraints: [node.role == manager]        # manager 노드에만

networks:
  haproxy-web:
    external: true                                 # 미리 만든 overlay 네트워크 사용
```
```bash
# [참고] 노드 label (placement 를 label 로 제어하고 싶을 때)
docker node update --label-add zone=fastzone1 hostos2
docker node update --label-add zone=fastzone1 hostos3   # (슬라이드 화면 기준 fastzone1. PDF 캡션에는 'zone=fastzone2 hostos3'로 적혀 있어 자료 내 불일치 — 슬라이드 값을 따름)
docker node inspect hostos2            # Spec.Labels 에서 확인
# → placement.constraints: [node.labels.zone == fastzone1]  (haproxy-web2-stack.yaml 로 복사해 수정)
docker stack rm haproxy-web                                  # 기존 스택 제거 후
cp haproxy-web-stack.yaml haproxy-web2-stack.yaml            # YAML 복사
vi haproxy-web2-stack.yaml                                   # constraints 를 라벨 기준으로 변경
docker stack deploy --compose-file=haproxy-web2-stack.yaml haproxy-web   # 라벨 기반으로 재배포 (참고용, 강의에서는 미실행)

# 3) 스택 배포
docker stack deploy --compose-file=haproxy-web-stack.yaml haproxy-web
# Creating service haproxy-web_proxy
# Creating service haproxy-web_nginx

# 4) 확인
docker stack ls                          # haproxy-web  2(서비스 수)
docker service ls
docker stack services haproxy-web        # haproxy-web_nginx replicated 4/4 / haproxy-web_proxy global 1/1 *:80->80/tcp
docker stack ps haproxy-web              # task 별 노드(nginx.1~4 → hostos2·3, proxy → hostos1)
docker service ps <서비스명>

# 5) 로드밸런싱 확인 (터미널 2개)
# 터미널 1
curl 192.168.56.101:80                   # (또는 curl localhost:80) 반복 호출
# 터미널 2
docker service logs -f haproxy-web_nginx # nginx.1 → .2 → .3 → .4 → .1 ... 라운드로빈으로 요청 도착

# 6) 삭제 (자료의 CLI 정리 항목)
docker stack rm haproxy-web
```
- `docker stack deploy --compose-file(-c)`: YAML 로 stack 배포. `docker stack ls/services/ps`: 스택/서비스/task 조회. `docker stack rm`: 스택 삭제.

### [확인 방법/주의점]
- 배포 확인 명령(슬라이드): `docker stack deploy` 출력은 `Creating service haproxy-web_proxy` / `haproxy-web_nginx`, `docker stack ls`는 `haproxy-web 2`(서비스 수), `docker stack services haproxy-web`은 nginx replicated 4/4 + proxy global 1/1 `*:80->80/tcp`. `docker stack ps haproxy-web` 은 스택에 속한 모든 태스크(컨테이너 인스턴스)를 노드별로(nginx.1/.3 → hostos2, nginx.2/.4 → hostos3, proxy → hostos1), `docker service ps <서비스명>` 은 서비스 단위로 실행 위치·상태를 보여준다. (슬라이드 [참조] 화면의 이미지 태그는 nginx:1.23.1-alpine 으로 보이나 본 YAML 은 nginx:1.25.0-alpine.)
- **라운드로빈 검증(강사)**: 터미널1에서 `curl 192.168.56.101:80`(또는 `curl localhost:80`)을 반복하고 터미널2에서 `docker service logs -f haproxy-web_nginx` 를 보면 nginx.1 → .2 → .3 → .4 → .1 순서로 요청이 골고루 돌아가며 처리(요청 출처 IP는 10.0.1.3). 이는 ingress overlay 네트워크의 IPVS(IP Virtual Server) 덕분 — swarm은 IPVS로 각 서비스의 태스크를 식별하고 들어오는 요청을 하나씩 순서대로 연결해 로드밸런싱한다.
- Portainer: Stacks > haproxy-web > Stack details 에 "This stack was created outside of Portainer"(Portainer 외부에서 생성) 안내가 표시되며 haproxy-web_nginx(nginx:1.25.0-alpine, replicated 4/4)와 haproxy-web_proxy(dbgurum/haproxy:1.0, global 1/1, 80:80)가 보인다. 강사: CLI로 만든 스택이라도 Swarmpit/Visualizer/Portainer 같은 GUI 도구에서 서비스 로그·상태를 똑같이 열어볼 수 있고 도구마다 스택/서비스를 보는 방식이 조금씩 다르다.
- Visualizer 에서 hostos1(manager)에 haproxy-web_proxy, hostos2·3 에 haproxy-web_nginx 가 배치된 모습 확인.
- Portainer: Stacks > haproxy-web > Stack details (Portainer 외부에서 생성된 스택임을 표시) 에서 nginx(replicated 4/4), proxy(global 1/1, 80:80) 확인.
- 이 실습의 stack YAML 은 모두 `image:` 만 사용한다(사전 구성된 haproxy.cfg 포함 이미지 dbgurum/haproxy:1.0 사용). `build:` 사용 가능 여부에 대한 강사 언급은 자료에 없음.
- 노드 label 을 쓰는 방식이 role 기반 제약보다 유연(자료의 설명).

---

# PART C. Docker CI (Ch12)

## Step 11. CI/CD 개념과 Docker 기반 CI/CD 흐름 이해

### [목적]
- 코드 푸시부터 이미지 레지스트리 배포까지의 Docker CI/CD 흐름과 용어(CI, CD-Delivery, CD-Deployment)를 이해한다. (실습 전 이론)

### [이론 설명]
> 보강 근거: 'Ch12 Clip 1. Docker CI 이해'(약 22.7분, 13쪽) PDF 전체를 슬라이드 이미지로 확인함. Ch12 구성: Clip1 Docker CI 이해 → Clip2 코드 배포를 위한 GitAction workflow 이해 → Clip3 [실습] GitHub Actions를 활용한 docker CI 구성. 강사(이현용) 당부: 전체가 총 14개 챕터의 하나의 커리큘럼이므로 필요한 부분만 골라 들으면 앞뒤 맥락이 끊길 수 있어 가능하면 처음부터 순서대로 들을 것(강사 본인의 GitHub 저장소 'hylee-kevin/docker-ci'는 이전 Dockerfile 챕터의 소스를 옮겨 둔 것으로 Clip3에서 직접 git push 하여 Docker CI를 구성해 보기 위해 준비).
- **CI/CD가 왜 필요한가(슬라이드 3갈래)**: ① 빠른 '배포 속도'와 유연한 반영을 기반으로 하는 '효율성' ② 다차원적인 요구사항과 빠른 비즈니스 변화에 맞는 개발 환경을 고려할 때 시장 변화·요구사항을 빠르고 유연하게 반영할 수 있는 방법론 필요 ③ 탄력적이고 민첩함(Elastic & Agile)의 강조와 개발·운영의 긴밀한 협조 관계의 DevOps 문화의 도약으로 CI/CD 필요성 급부상. 강사: 코드를 변경·배포하는 전통적 방식에서는 실제로 코드가 배포되는 순간 예상치 못한 장애·문제가 자주 발생하고 해결에 오랜 시간이 걸리는 것이 현실이었는데, CI/CD는 배포 속도와 유연한 반영(원하는 흐름으로 워크플로우 구성)으로 이를 줄이고 여러 모듈이 하나로 결합된 다차원적 애플리케이션과 빠르게 변하는 비즈니스 환경에 대응하는 방법론.
- **CI/CD 정의(슬라이드)**: 애플리케이션 개발 단계를 자동화하여 보다 짧은 주기로 변경을 제공함으로써 전반적인 개발 프로세스의 효율성과 지속성을 보장. 효과 4가지: (1) 반복적 작업의 자동화로 업무 효율성↑·실수↓ (2) 개발 업무에 집중할 수 있는 환경 (3) '빌드-테스트-배포' 자동화로 수동 작업을 줄여 오류 위험 최소화 (4) 일관된 빌드 및 배포 보장. 이 과정들을 묶어 'CI/CD 파이프라인'을 구축하면 통합·테스트 단계에서 제공·배포까지 라이프사이클 전체에 걸쳐 지속적인 자동화 및 모니터링을 제공해 안정적인 배포를 돕는다. CI/CD = 지속적인 통합(CI) & 지속적인 서비스 제공(CD) & 지속적인 배포(CD) 로 구성. 파이프라인 도식: CI 영역(빌드 build → 테스트 test → 통합 merge) + CD 영역(제공 delivery → 배포 deployment).
- **CI**: 현대적 애플리케이션의 다양한 기능 부여와 서로 다른 모듈까지 동시에 여러 개발자가 작업 가능하도록 구성하는 것이 목표(강사: 개발자마다 개발·통합·배포 방식과 성향이 다른데 CI가 이를 일관성 있게 유지시켜 주는 통합 기법). 빌드 자동화로 변경되는 개발 코드의 충돌이나 예상치 못한 문제 발생을 예방하고 통합 과정에서 빌드+테스트를 수행해 코드 문제점을 빠르게 확인 — 한마디로 'CI = 빌드 & 테스트 자동화'.
- **CD(지속적 제공, Delivery)**: 유효한 개발 코드를 repository(예, github)에 자동 Release하여 운영 환경으로 배포할 준비가 되어 있는 안정적 배포 준비 단계('저장소에 자동 Release'). CI 단계를 거쳐 검증이 완료된 개발 코드를 저장소로 가져와서 수동 또는 자동으로 지속적 배포 단계로 넘겨 운영 환경으로 배포되게 한다. 여기서 'repository'는 형상 관리(SCM, Software Configuration Management) 도구(대표 예: GitHub).
- **CD(지속적 배포, Deployment)**: 애플리케이션을 운영 환경으로 배포하는 작업을 자동화 — 변경 사항이 테스트를 통과하자마자 자동으로 최종 사용자에게 배포되어 사용자의 피드백도 즉시 반영('운영 환경에 자동 배포'). **Delivery vs Deployment 차이(강사)**: '자동화의 범위'. Delivery는 중간에 사람이 문제가 없는지 모니터링하면서 계속 진행할지 말지를 결정하는 수동적 개입 단계가 필요할 수 있다('언제든 배포할 수 있는 상태로 준비'는 되지만 실제 배포 여부는 사람이 판단). Deployment는 그 판단 과정 없이 테스트를 통과하면 곧바로 최종 사용자(엔드유저)에게까지 자동 반영되는 완전한 자동화 단계.
- **CI/CD 자동화 배포 이후(슬라이드)**: 구성된 workflow에 맞춰 형상 관리 도구(예, github)에 개발 코드를 통합 / 빌드·테스트가 자동으로 진행되므로 품질 관리가 되기 때문에 코드 검증에 들어가는 시간을 절약 / Repository에는 테스트가 통과된 코드만 저장되어 좋은 코드 퀄리티 유지 가능 / 검증된 애플리케이션이 실제 운영 환경으로 자동 배포되어 개발자는 한 번의 클릭으로 모든 프로세스를 자동화하고 더욱 개발에 집중.
- **Docker 환경 CI/CD 파이프라인(슬라이드)**: docker image를 생성(Dockerfile)하는 데 사용. docker image는 모든 종속성과 구성 파일 및 환경 설정이 포함되므로 배포가 모든 환경에서 쉽다. 생성된 이미지는 docker hub(hub.docker.com) 또는 Private registry(예, Nexus)에 push하여 관리가 용이. 일련의 과정 자동화 = Dockerfile 작성 → Docker Image 생성 → Image registry push → Docker Image deploy. **왜 하필 '이미지'를 다시 만드나(강사)**: 이미지 안에 소스 코드·종속성·실행 환경이 모두 들어 있어 이미지 자체가 사실상 버전 관리 단위. 1.0 이미지로 서비스 중인데 새 기능 소스를 배포하려면 변경 사항을 반영한 2.0 이미지가 새로 필요하다 — 코드가 바뀌면 이미지를 다시 빌드하는 것이 Docker CI/CD의 출발점. 5단계: 1) 버전 및 형상 관리를 위해 git 등에 변경 코드를 push 2) 사전에 구성된 CI/CD 파이프라인에서 자동으로 빌드를 트리거하여 Dockerfile을 사용한 새로운 docker image 생성 3) 새롭게 생성된 docker image를 사용하고 있는 docker registry에 push (CI) 4) 추가된 docker image를 가져와 테스트 환경에 배포 5) 애플리케이션 테스트가 마무리되면 docker image 운영 환경에 배포 → 일관적이고 안정적인 배포 관리, 오류 위험 최소화로 전반적인 개발 단계를 쉽게 관리.
- **Docker 환경에서의 CI(슬라이드)**: Docker image를 생성하고 Dockerfile을 작성하여 동일 환경의 팀원과 공유, 협업을 위해 GitHub, GitLab 같은 git 서비스를 이용. Docker CI = "pull request(PR) or git push로 코드가 입력되면 자동으로 docker build가 수행되고 성공, 실패를 나타내고 docker hub에 새로운 docker image가 build 되어 저장되는 일련의 과정". **경계선(강사)**: '실행 중인 애플리케이션에 적용되는 과정까지는 CD 과정이 필요하다' — Docker CI는 '새 이미지를 자동으로 만들어 저장'하는 단계까지이고 실제 서비스에 반영하는 것은 CD의 몫. 로컬에서 수정한 소스를 GitHub 웹 화면에 직접 올리는 방식이 아니라 `git push` 명령으로 저장소에 올리는 순간이 중요하며, push(또는 Pull Request)가 들어오면 미리 만들어 둔 GitHub Actions 워크플로우가 그 이벤트에 반응해 자동으로 정해진 동작(빌드 등)을 수행하도록 대기하는 것이 CI의 핵심 원리(구체적 문법은 Clip2).
- **구조도 1(슬라이드)**: 개발자가 main branch로 변경 코드를 올리면 → GitHub Actions 애플리케이션이 감지해 Docker image build → Docker hub에 image push → 서버에서 docker pull 후 docker run. 이 실습의 CI는 GitHub, Docker, GitHub Actions 세 가지 기능의 조합.
- **구조도 2(역할별 아키텍처)**: Developer는 GitHub Branch로 git commit → Version control → webhook(code pull)으로 Docker CI(GitActions)에 알림 → Docker CI가 새 이미지(leecloudo/myapp:v1.1)를 빌드해 Docker Hub 또는 Private registry에 push → DevOps 엔지니어는 필요 시 docker push로 직접 올리거나 docker pull로 확인(`docker push`/`docker pull`), Container instance에서 docker run으로 실행한 결과는 '재현 환경에 Commit!' 화살표로 Version control에 반영, QA(tester)는 Docker Hub/Private registry에서 docker pull 받아 테스트. 강사 예시: 먼저 DevOps 엔지니어가 기본이 되는 '베이스 이미지'를 만들어 팀 계정(레지스트리)에 push → 개발팀이 이를 pull 받아 원하는 소스를 반영한 신규 버전 이미지를 만들고 이 코드를 베이스 이미지에 적용해 달라는 요청을 Docker CI(GitHub Actions) 워크플로우로 전달 → 신규 코드가 적용된 이미지 생성 → QA가 확인한 뒤 1.0 이미지가 1.1로 올라가는 방식. 강사는 명확히 "배포하는 과정은 없죠. 지금 CD라고 하는 그런 과정은 없습니다" — 이 구조는 어디까지나 '검증된 새 이미지를 만들어내는' CI 영역. 역할을 나눠 보여주는 이유는 CI 서버 혼자 다 하는 게 아니라 Developer(코드 작성·커밋), DevOps 엔지니어(베이스 이미지·레지스트리 관리), QA(pull 받아 테스트)가 같은 파이프라인을 함께 사용한다는 점을 보이기 위함이며, 이미지 태그(leecloudo/myapp:v1.1)처럼 버전이 명시된 이미지가 오간다는 점에서 이미지 태그 관리의 중요성을 보여준다.
- **CI 도구(슬라이드)**: Enterprise부터 Small Biz. 용도의 CI 도구는 다양하며 시장을 선도하는 CircleCI, TeamCity, Bamboo와 같은 상용 제품과 "오픈 소스인 Jenkins"가 있음. G2 Grid(Satisfaction × Market Presence)에서 Jenkins, CircleCI가 우측 상단 'Leaders' 영역, TeamCity와 Bamboo가 'High Performers'. 강사는 슬라이드에 없는 Travis CI도 함께 언급하며 상당수는 '반은 오픈소스, 반은 상용'으로 활용되는 도구라고 부연. **이 강의의 도구**: 12장과 다음 두 클립(Clip2 workflow 이해, Clip3 실습)에서는 별도 설치 없이 GitHub 저장소에 내장된 'GitHub Actions'로 Docker CI를 구성하고, 이후 13·14장에서 오픈소스 CI 도구 'Jenkins'를 활용하는 내용을 다룰 예정(Jenkins는 이후 장).
- **CI**(Continuous Integration, 지속적 통합): 개발자가 코드를 자주 통합(build, test, merge). 변경 시 자동 빌드·테스트로 문제를 조기 발견.
- **CD** (Continuous Delivery, 지속적 제공): CI 이후 Release 가능한 상태로 repository(예: GitHub)에 준비 — 배포 직전 승인은 사람이 수행.
- **CD** (Continuous Deployment, 지속적 배포): 승인 없이 운영 환경까지 자동 배포.
- CI/CD 파이프라인 구성(workflow): 소스(Version control, 예: GitHub) → 빌드/테스트 → 이미지 → 레지스트리 → 배포.
- **Docker 기반 CI/CD 5단계**
  1. 개발자가 코드를 git 저장소에 push
  2. CI/CD 도구가 코드를 가져와 Dockerfile 로 docker image 빌드
  3. 빌드한 image 를 docker registry(Docker Hub 또는 Nexus 같은 Private registry)에 push (CI)
  4. 서버에서 해당 image 를 pull
  5. 컨테이너로 run(배포)
- **Docker CI**: 'pull request(PR) 또는 git push 시 자동으로 docker build 하고 docker hub 에 image 를 push' 하는 구조 (GitHub Actions 사용). 이미지 버전(예: leecloudo/myapp:v1.1) 관리.
- 역할: Developer(코드 commit/push), DevOps(레지스트리 push/pull 관리), QA(레지스트리에서 image pull 해 테스트).
- CI 도구 비교(G2 Grid): Jenkins, CircleCI 가 'Leaders', TeamCity·Bamboo 'High Performers'. 이 과정(Ch12)은 GitHub Actions 사용(Jenkins 는 이후 장).

### [사용한 CLI]
- 이 클립은 이론 중심이며, 흐름에서 언급된 핵심 명령은 다음과 같다.
```bash
docker push <repo>:<tag>      # 이미지를 레지스트리에 업로드
docker pull <repo>:<tag>      # 레지스트리에서 이미지 가져오기
docker run ...                # 가져온 이미지로 컨테이너 실행
```

### [확인 방법/주의점]
- 'git push' 가 CI 시작 트리거이며, 전체 단계 중 이미지 push 까지가 CI, 이후 배포 쪽이 CD.
- 버전 태그 규칙(1.0 → 1.1 → 2.0)으로 이미지 변경 이력 관리.

---

## Step 12. GitHub Actions workflow 이해 (용어와 YAML 작성)

### [목적]
- GitHub Actions 의 구성요소(workflow, event, job, step, action, runner)와 `.github/workflows/*.yml` 작성법을 익힌다.

### [이론 설명]
> 보강 근거: 'Ch12 Clip 2. 코드 배포를 위한 Gitaction workflow 이해'(약 21분, 15쪽) PDF 전체를 슬라이드 이미지로 확인함. 한 클립에서 개념 → YAML 예시 3개 → 실습 demo1·demo2 → 정리 순.
- **GitHub Action(슬라이드)**: 코드 저장소인 GitHub에 CI/CD 기능이 추가된 서비스. 이 코드 저장소에서 어떤 이벤트가 발생하면 특정 작업이 트리거 되도록 자동화할 수 있다 — ① 코드 저장소에 Pull Request를 생성하면 GitHub Action을 통해 변경된 코드 검사 ② main(or master) branch에 코드 유입 시 빌드(build) 후 배포(deploy) 구성 ③ 특정 시간에 작업 스케줄도 가능(cron) ④ 지속적으로 수행해야 하는 반복 작업을 자동화. 강사: PR 생성이나 git push 같은 이벤트 발생 시 특정 작업이 자동 트리거되는 것을 '이벤트 트리거'라 하며, 반복 루틴 작업을 매번 손으로 하지 않고 자동화하는 것이 이 서비스를 쓰는 핵심 이유.
- **workflow(슬라이드)**: 자동화된 전체 프로세스 과정을 의미하고 하나 이상의 job으로 구성. event에 의해 스케줄(on.schedule.cron)이나 트리거 되는 자동화 구성. `on` 속성을 통해 해당 workflow가 언제 실행되는지를 정의. YAML로 작성되고 GitHub Repository의 `.github/workflows` 폴더 아래 저장. 작성된 YAML이 전달되면 GitHub Actions는 해당 파일을 기반으로 그대로 실행. **event**: workflow를 실행하는 활동 및 규칙 지정 — git 저장소에 commit을 하거나 pull request가 생성되면 GitHub 활동(Action) 시작.
- **jobs / step(슬라이드)**: job은 여러 Step으로 구성되고 단일 가상 환경에서 실행되는 하나의 처리 단위. 필요에 따라 다른 Job에 의존 관계를 가질 수도 있고 실행 순서 제어도 가능. step은 job 안에서 순차적으로 실행되는 프로세스 단위(하나의 job은 여러 단계(step)의 명령을 순차적으로 실행)이며 명령이나 스크립트를 `run` 속성으로 작성하거나 `uses` 속성으로 action을 사용.
- **action / runner(슬라이드)**: action은 job을 구성하기 위한 step들의 조합으로 구성된 독립적인 명령으로 workflow의 가장 작은 빌드 단위. workflow에서 action을 사용하려면 action이 step을 포함해야 하며 빈번하게 필요한 반복 단계를 재사용 가능하도록 제공되는 작업 공유 메커니즘 — GitHub Actions Marketplace를 통한 action 공유 커뮤니티. 강사: action을 준비하는 방법은 ① Marketplace에 이미 만들어져 있는 action(YAML 코드)을 가져다 쓰거나 ② 필요한 동작을 직접 작성해서 쓰는 것. **runner**는 GitHub Action Runner 애플리케이션이 설치된 가상머신 환경으로 workflow가 실행될 인스턴스. GitHub에서 자체 제공하는 가상머신인 GitHub-hosted Runner와 사용자가 직접 환경을 구성하는 Self-hosted Runner가 있다(강사: runner 환경도 미리 준비된 것을 그대로 쓰거나 원하는 대로 직접 지정하는 두 방식).
- **예시1(번호 주석 해설, 슬라이드)**: 1) workflow 이름 정의 2) workflow가 트리거될 이벤트 정의 3) `pull_request`는 PR이 생성되었을 때 실행되게끔 해주는 event, `branches` 속성으로 브랜치 제한 4) jobs 정의 5) job 이름 6) job이 실행될 환경 정의 7) job의 steps(단계) 정의 8) action을 사용할 때에는 `uses`를 사용(이 action은 runner에 저장소 코드를 다운로드하고 특정 브랜치로 checkout 하는 job을 해준다) 9) 단순한 커맨드 실행 — gradle을 사용하여 springboot project를 build하도록 한다.
- **예시2 설명**: `on.schedule` workflow의 시간 일정 정의 — 매주 월요일~목요일 5:30 UTC에 실행되도록 workflow를 트리거 하지만 (Not on Monday or Wednesday) 월요일과 수요일에는 해당 단계를 skip. 두 개의 cron 표현식(1,3=월/수, 2,4=화/목)을 함께 등록해 두고 `if` 조건으로 실행 요일마다 다르게 동작하도록 만든 예시. cron 표현식은 리눅스 crontab 문법 그대로 "분 시 일 월 요일" 5개 칸, 맨 끝 칸이 요일. 참고 문서: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
- **예시3 설명**: `push`와 `pull_request` 두 이벤트를 동시에 트리거로 등록하면서 `paths`(포함)/`paths-ignore`(제외, = !paths) 속성으로 특정 파일 패턴이 변경될 때만 workflow가 실행되도록 제한. `strategy.matrix`로 node-version을 [10.x, 12.x] 두 가지로 지정해 하나의 job 정의만으로 여러 버전 조합을 자동 반복 빌드/테스트. 슬라이드 주석: runs-on 은 ubuntu 머신 지정(macos-latest / windows-latest 등), `uses: actions/checkout@v2` 는 runner에 저장소 코드를 다운로드하고 특정 브랜치로 checkout.
- **실습 demo1/demo2 보충(강사)**: ① runs-on에 지정할 수 있는 OS/버전 목록은 GitHub 공식 문서(docs.github.com … workflow-syntax-for-github-actions#jobsjob_idruns-on)에서 확인 — "가끔 OS를 다른 것으로 수행해야 하는 경우에는 꼭 이 문서를 확인". ② **실수 사례**: 실습 중 환경변수 이름을 잘못 참조해(실제 정의는 `MY_VAR`인데 다른 이름으로 `echo`) 값이 비어 출력되는 것을 보고 바로 고쳤다 — **`env`로 정의한 변수명과 `echo`에서 참조하는 변수명은 반드시 철자까지 똑같아야 값이 정상 출력**된다. ③ GitHub 저장소에 새 workflow 파일을 만들 때 이미 같은 이름의 파일이 있어 커밋이 바로 되지 않는 상황(파일명 중복)을 겪었고, 기존 파일을 확인·수정한 뒤 다시 커밋. ④ Actions 탭의 상태 아이콘: 진행 중=진행 아이콘, 정상 종료=초록색, 에러=빨간색. 실행 로그 확인 경로: Actions 탭 > All workflows 목록(실행마다 커밋 메시지 'Create gitaction-demo1.yml', 'Update gitaction-demo1.yml' 등이 표시) > 해당 run > Jobs 의 'Demo Job' > 단계별 로그('Set up job', 'Print a environment', 'Complete job'). demo1 출력: `Hi there! My name is hyunyong lee.` / `Hi there! My name is kevin.lee.` demo2 로그: `job.triggered.event is push`, `job.running.os is Linux`, `job.branch is refs/heads/master`, `job.repository is hylee-kevin/docker-ci`, `job.status is success.`, 이어서 Check out repository code / List files on repository / Post Check out repository code / Complete job 단계가 성공으로 표시. 정리 다이어그램: 개발자가 push, commit 등의 event를 발생시키면 GitHub Actions(runner)가 감지해 workflow를 실행하고 event 종류(pull_request, schedule, push)에 따라 서로 다른 workflow가 트리거된다. 관계 요약: workflow(자동화 전체 과정) → event(트리거 규칙) → job/step(실행 단위) → action(재사용 가능한 명령 묶음) → runner(실행 환경). 다음 클립에서 이 문법으로 앞서 Dockerfile 챕터의 샘플 소스를 이용해 실제 docker CI를 구현.
- GitHub Actions: GitHub 에서 제공하는 CI/CD 자동화. 트리거 예: Pull Request 생성, main(or master) 브랜치 push, 정해진 시간(cron), 수동/기타 이벤트.
- **workflow**: 자동화 프로세스 전체(YAML). 저장소의 `.github/workflows/` 에 `.yml` 로 저장하면 GitHub Actions 가 자동 인식. 하나 이상의 job 으로 구성.
- **event**: workflow 를 시작시키는 트리거(`on:`). push, pull_request, schedule 등.
- **job**: 같은 runner 에서 실행되는 step 묶음. 기본적으로 job 들은 병렬 실행.
- **step**: job 안에서 순차 실행되는 작업. `run`(쉘 명령) 또는 `uses`(action 사용).
- **action**: 재사용 가능한 작업 단위. GitHub Actions Marketplace 에서 가져다 사용(예: `actions/checkout`).
- **runner**: workflow 를 실행하는 서버. GitHub-hosted Runner(ubuntu-latest, macos-latest, windows-latest) 또는 Self-hosted Runner.
- `${{ }}` 표현식: github.event_name, runner.os, github.ref, github.repository, job.status, github.workspace 등 컨텍스트 사용.
- `if:` 조건으로 step 실행 여부 제어, `strategy.matrix` 로 여러 버전 조합 병렬 테스트, `paths`/`paths-ignore` 로 파일 변경 필터.
- cron 형식 `'30 5 * * 1,3'` = 분 시 일 월 요일 → 매주 월(1)·수(3) 05:30 UTC.

### [사용한 CLI] (workflow YAML 예제)

**예제 1: pull_request 시 build job**
```yaml
name: Backend CI                # 1) workflow 이름
on:                             # 2) 트리거 이벤트
  pull_request:                 # 3) PR 이벤트
    branches: [ develop ]       #    develop 브랜치 대상 PR
jobs:                           # 4) job 목록
  build:                        # 5) job 이름
    runs-on: ubuntu-latest      # 6) 실행 runner
    steps:                      # 7) step 목록
      - uses: actions/checkout@v3    # 8) 소스코드 checkout (action 사용)
      - run: "./gradlew build"       # 9) 쉘 명령 (gradle 로 springboot 프로젝트 빌드)
```

**예제 2: schedule(cron) + if 로 step skip**
```yaml
on:
  schedule:
    - cron: '30 5 * * 1,3'      # 월,수 05:30 UTC
    - cron: '30 5 * * 2,4'      # 화,목 05:30 UTC
jobs:
  test_schedule:
    runs-on: ubuntu-latest
    steps:
      - name: Not on Monday or Wednesday
        if: github.event.schedule != '30 5 * * 1,3'
        run: echo "This step will be skipped on Monday and Wednesday"
      - name: Every time
        run: echo "This step will always run"
```

**예제 3: push/paths 필터 + matrix**
```yaml
name: exam-gitactions
on:
  push:                          # push 이벤트
    branches: [ master, main ]
  pull_request:
    branches: [ master ]
    paths:
      - "**.js"                  # 해당 파일 변경 시에만 workflow 실행
    paths-ignore:                # paths 의 반대(무시할 경로)
      - "doc/**"
jobs:
  build:
    strategy:                    # 여러 버전/환경 조합 (matrix)
      matrix:
        node-version: [10.x, 12.x]
    runs-on: ubuntu-latest       # macos-latest / windows-latest 도 가능
    steps:
      - name: Checkout source code
        uses: actions/checkout@v2
      - name: My First Step
        run: |
          npm install
```

**실습 demo1: 환경변수 echo**
```yaml
name: GitActions Demo1
on: push
jobs:
  GitActions-demo-job:
    name: Demo Job
    runs-on: ubuntu-latest
    steps:
      - name: Print a environment
        env:
          MY_VAR: Hi there! My name is
          FIRST_NAME: hyunyong
          LAST_NAME: lee
          AWS_JOB_NAME: kevin.lee
        run: |
          echo $MY_VAR $FIRST_NAME $LAST_NAME.
          echo $MY_VAR $AWS_JOB_NAME.
```
- 결과: "Hi there! My name is hyunyong lee." / "Hi there! My name is kevin.lee."

**실습 demo2: 컨텍스트 값 출력 + checkout**
```yaml
name: GitActions-Demo2
on: [push]
jobs:
  GitActions-demo-job:
    runs-on: ubuntu-latest
    steps:
      - run: echo "job.triggered.event is ${{ github.event_name }}"
      - run: echo "job.running.os is ${{ runner.os }}"
      - run: echo "job.branch is ${{ github.ref }}"
      - run: echo "job.repository is ${{ github.repository }}"
      - run: echo "job.status is ${{ job.status }}."
      - run: echo "The workflow is code test on the runner."
      - name: Check out repository code
        uses: actions/checkout@v2
      - name: List files on repository
        run: |
          ls ${{ github.workspace }}
```
- 출력 예: `job.triggered.event is push`, `job.running.os is Linux`, `job.branch is refs/heads/master`, `job.repository is hylee-kevin/docker-ci`, `job.status is success.`

### [확인 방법/주의점]
- GitHub 저장소 > Actions 탭에서 workflow 실행(All workflows) 목록과 각 step 로그 확인.
- `.github/workflows/` 에 YAML 을 push 하면 자동으로 workflow 로 인식(on: push 인 경우 push 즉시 실행).
- `uses: actions/checkout` 이 없으면 runner 에 소스코드가 없다 — job 의 첫 step 으로 사용.
- cron 시간은 UTC 기준(자료에서 '~ 5:30 UTC').

---

## Step 13. [실습] GitHub Actions 로 Docker CI 구성 (git push → Docker Hub 이미지 자동 push)

### [목적]
- Node.js 앱 소스를 GitHub 에 push 하면 GitHub Actions 가 Docker 이미지를 빌드해 Docker Hub 에 자동 push 하도록 구성하고, 코드 수정·Release 시 이미지 태그가 갱신되는 것을 확인한다.

### [이론 설명]
> 보강 근거: 'Ch12 Clip 3. [실습] GitHub Actions를 활용한 docker CI 구성'(약 41분, 18쪽) PDF 전체를 슬라이드 이미지로 확인함. 구성: Part1 실습 준비(이미지 빌드·Docker Hub push·GitHub 저장소·PAT) / Part2 workflow yaml 작성·Secrets 등록 / Part3 push·자동 빌드 확인·Release로 버전 태그 배포.
- **왜 GitHub Actions인가(강사)**: Docker Hub의 "Automated Builds"는 Pro/Team/Business 유료 플랜 전용 기능(Docker Hub 저장소 화면에 'Available for Pro, Team, Business' 문구 표시)이라, 무료로 CI를 구현하려고 GitHub 저장소에 연결된 GitHub Actions로 push 때마다 Docker Hub에 이미지를 자동으로 올리는 방식을 쓴다.
- **두 저장소를 혼동하지 말 것**: Docker Hub 저장소(leecloudo/nodejs-ci)는 '이미지'가 저장되는 곳, GitHub 저장소(hylee-kevin/docker-ci)는 '소스 코드와 워크플로우'가 저장되는 곳. 실습은 ch09 의 'Nodejs 기반 웹 애플리케이션 base image'를 `fastcampus/ch12/nodejs-ci` 로 복사(MobaXterm에서는 `mkdir nodejs-ci` → `cp -r ../ch09/nodejs .` → `mv ../nodejs/* .` 순서)해 사용. 빌드 로그에는 `docker.io/library/node:20-alpine` 베이스 이미지 pull(BuildKit 로그)이 보이며, 빌드한 이미지는 `leecloudo/nodejs-ci:v1.0` 로 push(Docker Hub Tags 에 v1.0 만 존재, 186MB). `docker info | grep -i username` 으로 현재 로그인된 Docker Hub 계정 확인. 슬라이드의 `.dockerignore` 파일(27B)·`.git` 디렉터리도 `ls -al` 에 표시.
- **PAT 발급 절차(슬라이드)**: GitHub 계정 우측 상단 > Settings(본인 계정) > Developer settings > Personal access tokens > Tokens (classic) > Generate new token. Note(예: "docker ci token")와 Expiration(만료 기간)을 지정하고, 체크해야 할 scope는 `repo`(저장소 전체 제어, push/pull) 와 `workflow`(GitHub Action 워크플로우 파일 생성·수정 권한). **workflow 권한이 없으면 `.github/workflows/` 아래 yaml 파일을 push 해도 거부될 수 있다.** 토큰은 `ghp_` 로 시작하며 생성 직후 한 번만 표시 → 안전한 곳에 복사. **강사의 실제 실수**: 새로 만든 토큰(docker-ci-token2)을 복사해 두지 않아, 토큰 목록 페이지를 다시 열어도 값이 보이지 않고 'Regenerate token' 버튼만 남아 있었다. 재발급하면 이전 토큰은 못 쓰게 되므로 이미 저장해 둔 다른 토큰(docker ci token)을 대신 사용해 실습을 이어갔다. 이 토큰은 `git push` 시 GitHub 계정의 '비밀번호' 자리에 그대로 입력(`Password for 'https://hylee-kevin@github.com':` ← PAT).
- **git push 오류의 의미(강사)**: 처음 `origin` 을 등록하지 않고 push → `fatal: 'origin' does not appear to be a git repository` / `fatal: Could not read from remote repository.` → `git remote add origin https://github.com/hylee-kevin/docker-ci`, `git remote -v` 로 확인 후 재시도. 그래도 `! [rejected] master -> master (fetch first)` / `error: failed to push some refs ...` / 'hint: Updates were rejected because the remote contains work that you do not have locally. This is usually caused by another repository pushing to the same ref. You may want to first integrate the remote changes (e.g., 'git pull ...') before pushing again.' 가 나오는 이유는 GitHub 저장소 생성 시 자동으로 만들어진 README 등 로컬에 없는 커밋이 원격에 이미 있기 때문. 실습 편의를 위해 `git push --set-upstream origin +master`(브랜치명 앞 `+` = 강제 push, 결과 `+ 7affbe5...feb6f0a master -> master (forced update)`, `Branch 'master' set up to track remote branch 'master' from 'origin'.`)로 로컬 내용으로 원격을 덮어썼으나, 실무에서는 원격 변경 내용이 중요하다면 `git pull` 로 먼저 병합하는 것이 안전하다.
- **workflow yaml 한 줄씩(슬라이드 우측 주석)**: `name` workflow 이름 지정 / `on` 동작 조건 지정 / `push` branch, tags가 push되면 동작하도록 / `branches: - 'master'` 에서 `**` 는 all branch, 여기서는 master 만 사용 / `jobs` 작업 지정 / `push` 작업 이름 / `runs-on: ubuntu-latest` 빌드에 사용할 ubuntu:latest 머신 시작 / `Checkout` — runner에 저장소 코드를 다운로드하고 특정 브랜치로 checkout 하는 jobs 수행 / `Docker meta` — step 이름은 사용자 정의, `id: docker_meta` 는 변수값으로 하위 코드에서 output으로 사용 가능, `uses: crazy-max/ghaction-docker-meta@v1` 사용할 동작, `with` 동작에 대한 input값 선언, `images: leecloudo/nodejs-ci` 사용할 docker repository(계정/저장소), `tag-semver` 태그로 사용할 버전 정보 / `Set up QEMU` — QEMU는 오픈소스 하이퍼 바이저, 다른 플랫폼에서 동작하는 애플리케이션을 실행하기 위한 에뮬레이터로 사용 / `Set up Docker Buildx` — Buildx는 Docker 19.03 버전부터 기본으로 제공, 다른 플랫폼용으로 빌드할 수 있는 기능 포함 / `Login to Docker Hub` — docker hub login 관련 동작, `username/password: ${{ secrets.DOCKER_HUB_* }}` 는 docker hub에 사용할 사용자ID/암호 secret / `Build and push Docker Image` — `context: .`, `push: true`(빌드 후 배포 여부 확인), `tags: ${{ steps.docker_meta.outputs.tags }}`(빌드 시 위에서 지정한 태그 사용), `labels:`(위에서 지정한 라벨 사용).
- **각 단계가 왜 필요한가(강사)**: (1) `actions/checkout` 이 없으면 러너(runner)에 내 소스 코드 자체가 없어 빌드할 대상이 없다. (2) ghaction-docker-meta는 push된 브랜치/태그 이름을 분석해 이미지 태그(예: master, v1.1, 1.1)를 자동으로 만들어 주므로 태그를 손으로 관리하지 않아도 된다. **images 아래에 `tag-semver`를 따로 지정하지 않으면 태그는 무조건 latest로 잡히고**, 지정하면 버전(`{{version}}`)과 major.minor(`{{major}}.{{minor}}`) 형태로 태그가 만들어진다. (3) QEMU/Buildx는 서로 다른 CPU 아키텍처(예: arm64)용 이미지까지 한 번에 빌드할 수 있게 해주는 준비 단계이고 이 실습에서는 기본값 그대로 사용 — QEMU는 '하이퍼바이저 기반의 가상 머신 기술을 이용해 (다른 CPU 아키텍처용) 동작을 수행하게 해주는 에뮬레이터', Buildx는 '여러 플랫폼용 이미지를 만들 수 있게 해주는 도커의 확장 빌드 기능'. Buildx는 Docker 19.03부터 기본 내장이고 실습의 Docker는 이미 24 버전대이므로 workflow의 setup-buildx-action 단계가 알아서 처리해 주며 옛날 버전을 쓰는 경우에만 별도로 필요. (4) docker/login-action에 아이디·비밀번호를 코드에 직접 쓰지 않고 `secrets.*` 로 참조하는 이유는 yaml 파일이 공개 저장소에 그대로 노출되어도 실제 로그인 정보는 암호화된 GitHub Secrets에만 저장되어 안전하기 때문.
- **Secrets 등록(강사)**: workflow yaml은 결국 텍스트 코드인데 아이디·비밀번호를 그대로 적으면 저장소가 공개(public)라면 누구나 볼 수 있어 보안 위험이 생긴다 → Settings > Secrets and variables > Actions 에서 'New repository secret' 으로 `DOCKER_HUB_USERNAME`, `DOCKER_HUB_PASSWORD` 두 개를 **실습 전에 미리** 등록해 두어야 workflow가 정상적으로 로그인에 성공한다(Repository secrets 목록에 두 항목 표시). Secrets는 한 번 저장하면 값이 다시 표시되지 않고(암호화 저장) 워크플로우 실행 로그에도 `***` 로 마스킹, 협업자(collaborator) 권한이 있는 사람만 Actions에서 사용 가능, 포크(fork)된 저장소의 pull request로 실행되는 워크플로우에는 전달되지 않는다.
- **workflow 파일 만드는 두 방법**: 로컬에서 yaml을 만들어 push하는 방법과 GitHub 웹 화면에서 `Add file`로 새 파일 경로를 `.github/workflows/docker-ci-demo.yml` 로 지정하고 내용을 입력한 뒤 'Commit changes' 하는 방법(강사는 후자도 시연; 우측에 Marketplace 'Search Marketplace for Actions' 패널 표시). **yaml 파일 자체를 커밋(push)하는 행위도 `on: push: branches: [master]` 조건에 해당하므로 커밋 즉시 Actions 탭에 새 workflow run('Create docker-ci-demo.yml #10')이 In progress 로 나타나 첫 번째 CI 실행이 트리거된다.** 이 첫 실행으로 Docker Hub에 `master` 태그가 자동 생성되며, 강사는 "이 태그가 왜 생겼는지, 다음에 코드를 바꿨을 때 정말 다시 자동으로 만들어지는지"를 더 명확히 보여주기 위해 이 master 태그 이미지를 Docker Hub에서 일부러 삭제하고 v1.0만 남긴 뒤, index.html 수정 → push → master 태그가 다시 새로 생기는 전체 과정을 처음부터 시연한다.
- **코드 변경 → 자동 빌드 검증(강사)**: `public/index.html` 의 `<h1>Welcome to Fastcampus - Nodejs App using docker CI v2.0</h1>` 로 수정 → `git status` 로 modified 확인 → `git add .` → `git commit -m "fastcampus docker CI"` (`[master eb71369] ... 1 file changed, 1 insertion(+), 1 deletion(-)`) → `git push`. 여기서도 `! [rejected] master -> master (fetch first)` 가 다시 나오는데 원격에 workflow 파일이 생겨 로컬과 차이가 생겼기 때문이고 `git push -u origin +master`(`+ b3d0b4d...d12e020 master -> master (forced update)`)로 해결. push 직후 Actions 탭에 새 워크플로우 실행이 올라오고 Docker Hub의 leecloudo/nodejs-ci Tags 에 `master` 태그 이미지가 '몇 초 전'에 push된 것으로 나타난다. 이어서 직접 `docker pull leecloudo/nodejs-ci:master` → `docker run -itd -p 3002:3000 --name=nodev2 leecloudo/nodejs-ci:master` → `curl localhost:3002` 로 배포된 내용을 확인. **오타 사례**: 계정명을 `leecloudl`로 잘못 입력 → `Error response from daemon: pull access denied for leecloudl/nodejs-ci, repository does not exist or may require 'docker login': denied: requested access to the resource is denied` (오탈자 leecloudl → leecloudo 로 정정하면 정상 pull, `Status: Downloaded newer image for leecloudo/nodejs-ci:master`).
- **Release로 버전 태그(강사)**: "master라는 태그는 버전으로서 가치가 있을까요?" — master 태그는 push할 때마다 계속 덮어써지므로 '지금 이 순간의 최신 상태'는 알 수 있어도 '몇 번째로 배포된 버전인지'는 구분할 수 없다. 정식으로 버전을 남기려면 GitHub의 Releases > Create a new release 에서 태그 이름에 `v1.1` 을 입력(Create new tag)하고 'Publish release' — master 브랜치의 특정 시점에 v1.1이라는 이름표를 붙이는 것과 같다. workflow yaml 의 `on.push.tags: ['**']` 조건 덕분에 Release에 연결된 태그(v1.1)가 push되는 순간에도 Actions가 다시 실행. 시연 순서: index.html 문구를 v1.1을 나타내도록 한 번 더 수정·반영 → Release 발행. tag-semver 설정(`{{version}}`, `{{major}}.{{minor}}`)과 docker-meta 덕분에 v1.1 태그로 Release를 발행하면 Docker Hub에는 v1.1 태그뿐 아니라 이 Release가 최신(latest)이라는 의미로 **latest 태그도 함께 자동 추가**된다. 최종 Docker Hub Tags(4개): latest, v1.1, master, v1.0 — 소스 코드 변경(브랜치 push)과 정식 배포(태그/Release)를 태그 이름만으로 구분해 관리할 수 있음을 보여준다. 강사 마무리 팁: GitHub Release를 활용한 버전 관리는 좋은 방법 중 하나일 뿐이고 Release를 매번 수동으로 만들지 않고도 버전이 자동으로 반영되게 만드는 방법들이 더 있으므로, GitHub 공식 문서의 태그(tag) 관련 문법을 살펴보면 CI가 일어날 때마다 버전이 자동으로 올라가도록 구성하는 것까지 확장해 볼 수 있다.
- 사전 준비: Ch09 의 Node.js 앱(base image 예제)을 `fastcampus/ch12/nodejs-ci` 로 복사해 사용. Docker Hub 계정(예: leecloudo), GitHub 계정/저장소(예: hylee-kevin/docker-ci)가 별도로 필요 — Docker Hub 저장소(leecloudo/nodejs-ci)와 GitHub 저장소는 서로 다른 서비스.
- Docker Hub 의 'Automated Builds' 는 Pro/Team/Business 요금제 전용이므로, 무료로 CI 를 구현하기 위해 GitHub Actions 를 사용.
- **GitHub Personal Access Token(PAT)**: HTTPS 로 git push 시 비밀번호 대신 사용. Settings > Developer settings > Personal access tokens > Tokens (classic) > Generate new token. scope 는 `repo`(저장소 push/pull) + `workflow`(.github/workflows/ yaml 파일 push 권한) 필요. 토큰은 생성 시 한 번만 표시(`ghp_...`), 이후 확인 불가 → 분실 시 Regenerate token.
- **GitHub Secrets**: workflow YAML 에 Docker Hub ID/비밀번호를 평문으로 쓰지 않고 `${{ secrets.DOCKER_HUB_USERNAME }}` 로 참조. Settings > Secrets and variables > Actions > New repository secret. 값은 저장 후 `***` 로 마스킹되어 확인 불가, fork 저장소 PR 에는 전달되지 않음.
- workflow 구성: checkout → docker-meta(태그/라벨 생성) → QEMU(멀티 아키텍처 에뮬레이션) → Buildx(빌드 도구) → Docker Hub login → build-push.
- `tag-semver` 설정으로 Release/tag(v1.1) push 시 `v1.1`(version), `1.1`(major.minor) 및 기본 `latest` 태그가 생성(자료: 최종 Docker Hub 태그 latest, v1.1, master, v1.0).

### [사용한 CLI]

**13-1. 로컬 이미지 빌드/실행 확인 (Ch09 앱 복사)**
```bash
cp -r nodejs /home/kevin/fastcampus/ch12/nodejs-ci       # (ch09 에서) 복사
# (실제 터미널 순서) mkdir nodejs-ci → cp -r ../ch09/nodejs . → mv ../nodejs/* .
mkdir nodejs-ci
cp -r ../ch09/nodejs .
mv ../nodejs/* .
cd ch12/nodejs-ci && ls
# Dockerfile  node_modules  package.json  package-lock.json  public  server.js

docker build -t leecloudo/nodejs-ci:v1.0 --no-cache .     # --no-cache: 캐시 없이 빌드
docker images | grep ci                                    # leecloudo/nodejs-ci v1.0 ... 186MB
docker image history leecloudo/nodejs-ci:v1.0
docker image inspect leecloudo/nodejs-ci:v1.0
docker run -d -p 3001:3000 lab2-nodejs-app:1.0            # (자료 표기 그대로) 컨테이너 실행
curl localhost:3001
```

**13-2. Docker Hub 로그인 및 push**
```bash
docker login
docker push leecloudo/nodejs-ci:v1.0
docker info | grep -i username       # 로그인한 Docker Hub 계정 확인
```

**13-3. git 초기화**
```bash
git init
ls -al                               # .git, Dockerfile, .dockerignore, node_modules, package.json 등
git add .
git config --global user.email "<이메일>"
git config --global user.name "<이름>"
```

**13-4. GitHub 저장소 연결 및 push (PAT 사용)**
```bash
git push --set-upstream origin master
# fatal: 'origin' does not appear to be a git repository  ← remote 미설정
git remote add origin https://github.com/hylee-kevin/docker-ci
git remote -v
# origin https://github.com/hylee-kevin/docker-ci (fetch)
# origin https://github.com/hylee-kevin/docker-ci (push)
git push --set-upstream origin master
# Username for 'https://github.com': hylee-kevin
# Password for 'https://hylee-kevin@github.com': (personal access token 입력)
```
- 원격 저장소에 이미 파일(README 등)이 있어 `! [rejected] master -> master (fetch first)` 로 거부될 경우:
```bash
git push --set-upstream origin +master     # 브랜치명 앞 + : 강제 push(forced update) — 원격 내용 덮어씀 주의
# 또는 git pull 로 먼저 원격 변경을 가져온 뒤 push
```

**13-5. workflow YAML (.github/workflows/docker-ci-demo.yml)**
(자료에서는 GitHub 웹에서 `.github/workflows/docker-ci-demo.yml` 파일을 직접 생성 후 'Commit changes')
```yaml
name: Push Docker Image to Docker Hub     # workflow 이름
on:                                       # 트리거 이벤트
  push:                                   # branch, tag push 시
    branches:
      - 'master'                          # master 브랜치만 (** = 모든 브랜치)
    tags:
      - '**'                              # 모든 tag
jobs:
  push:                                   # job 이름
    runs-on: ubuntu-latest                # runner
    steps:
      - name: Checkout                    # runner 에 소스 가져오기
        uses: actions/checkout@v2
      - name: Docker meta                 # 태그/라벨 자동 생성
        id: docker_meta                   # 다음 step 에서 output 참조용 id
        uses: crazy-max/ghaction-docker-meta@v1
        with:
          images: leecloudo/nodejs-ci     # docker repository (계정/저장소)
          tag-semver: |                   # 시맨틱 버전 태그 규칙
            {{version}}
            {{major}}.{{minor}}
      - name: Set up QEMU                 # 다른 CPU 아키텍처 빌드용 에뮬레이터
        uses: docker/setup-qemu-action@v2
      - name: Set up Docker Buildx        # Buildx (Docker 19.03 이상 빌드 도구)
        uses: docker/setup-buildx-action@v2
      - name: Login to Docker Hub         # Docker Hub 로그인
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_HUB_USERNAME }}   # Secrets 에 등록한 Docker Hub ID
          password: ${{ secrets.DOCKER_HUB_PASSWORD }}   # Secrets 에 등록한 Docker Hub 비밀번호
      - name: Build and push Docker Image
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true                      # 빌드 후 push 수행
          tags: ${{ steps.docker_meta.outputs.tags }}      # docker_meta 가 만든 태그
          labels: ${{ steps.docker_meta.outputs.labels }}  # docker_meta 가 만든 라벨
```

**13-6. GitHub Secrets 등록 (웹 UI)**
```text
GitHub 저장소 > Settings > Secrets and variables > Actions > New repository secret
  Name: DOCKER_HUB_USERNAME   Value: <Docker Hub ID>
  Name: DOCKER_HUB_PASSWORD   Value: <Docker Hub 비밀번호(또는 토큰)>
```

**13-7. 코드 수정 → push → 자동 빌드/푸시 확인**
```bash
vi public/index.html
#   <h1>Welcome to Fastcampus - Nodejs App using docker CI v2.0</h1>
git status                           # modified: public/index.html
git add .
git commit -m "fastcampus docker CI"
git push                             # 또는 git push -u origin +master
# ! [rejected] master -> master (fetch first) → 원격에 workflow 파일이 이미 생겨 로컬과 차이 발생
git push -u origin +master           # forced update (또는 git pull 후 push)
```
- GitHub > Actions 탭에서 workflow run('Create docker-ci-demo.yml' 등) In progress → 완료. Docker Hub `leecloudo/nodejs-ci` Tags 에 `master` 태그 추가(이전엔 v1.0만 존재).

```bash
# 생성된 CI 이미지 실행/확인
docker pull leecloudl/nodejs-ci:master      # (오타 예) → denied: pull access denied, repository does not exist (계정명 오타)
docker pull leecloudo/nodejs-ci:master      # 정상
docker run -itd -p 3002:3000 --name=nodev2 leecloudo/nodejs-ci:master
docker ps | grep nodev2
curl localhost:3002                         # 수정한 index.html(v2.0) 응답 확인
```

**13-8. GitHub Release 로 v1.1 / latest 태그 생성 (웹 UI)**
```text
GitHub 저장소 > Releases > Create a new release (New release)
  Tag: v1.1 (Create new tag) → Publish release
```
- workflow 의 `on.push.tags: ['**']` 설정 때문에 Release(tag v1.1) 생성이 push 이벤트로 workflow 를 실행시킴 → Docker Hub 에 `v1.1`, `latest` 태그 이미지 push.
- 최종 Docker Hub Tags: `latest`, `v1.1`, `master`, `v1.0` (4개).

### [확인 방법/주의점]
- master push → Docker Hub 의 `master` 태그(개발용 최신), Release(v1.1) → `v1.1`, `latest` 태그. 운영 배포용 이미지는 Release 로 만든 버전 태그를 사용하는 것이 바람직(자료의 해석).
- PAT 는 생성 직후에만 값 확인 가능하므로 별도 안전한 곳에 보관(분실 시 regenerate). 토큰을 코드/YAML 에 직접 쓰지 않는다.
- Docker Hub 계정 정보는 반드시 GitHub Secrets 로 등록(공개 저장소의 YAML 에 평문 노출 금지). Secrets 는 저장 후 값 조회 불가, fork 의 PR 에서는 사용 불가.
- `git push` rejected(fetch first) 는 원격에 로컬에 없는 커밋이 있다는 뜻 → `git pull` 후 push 하거나 `+master`(강제, 원격 덮어씀) 사용.
- 이미지/계정 이름 오타(leecloudl vs leecloudo) 시 `pull access denied ... repository does not exist` 가 발생.
- QEMU/Buildx: 다른 CPU 아키텍처(예: arm64) 이미지 빌드를 위한 구성이며, 이 workflow 에서는 빌드 환경을 갖추는 단계.

---

## 부록. 이 파트의 핵심 명령어 요약표

| 분류 | 명령 | 설명 |
|---|---|---|
| compose | `docker compose up [-d] [--build] [--scale svc=N]` | 서비스 생성·실행(백그라운드/이미지 빌드/스케일) |
| compose | `docker compose ps [--services]` / `logs -f` / `config` / `port svc N` | 상태/서비스명/로그 follow/정규화 설정/포트 매핑 |
| compose | `docker compose pause` / `unpause` / `stop` | 일시정지/재개/중지 |
| compose | `docker compose down [--rmi all]` | 컨테이너·네트워크(및 이미지) 삭제 |
| compose | `docker compose version` / `-h` | 버전/도움말 |
| swarm | `docker swarm init --advertise-addr <IP>` | manager 초기화 |
| swarm | `docker swarm join --token <T> <IP>:2377` / `join-token worker|manager` | 노드 합류/토큰 재확인 |
| swarm | `docker node ls` / `inspect --pretty` / `update --availability drain|active` / `update --label-add k=v` | 노드 조회·유지보수·레이블 |
| swarm | `docker service create/ls/ps/logs -f/inspect --pretty/scale/update --image/rollback/rm` | 서비스 생성·조회·확장·업데이트·롤백·삭제 |
| swarm | `docker service create --mode global`, `--replicas`, `--update-parallelism/delay/order/failure-action`, `--constraint`, `--mount` | 모드/업데이트 정책/배치 제약/마운트 |
| stack | `docker stack deploy -c file.yaml <name>` / `ls` / `services` / `ps` / `rm` | 스택 배포·조회·삭제 |
| network | `docker network create --driver=overlay --attachable <name>` | swarm overlay 네트워크 |
| 점검 | `docker info | grep -i swarm: -A 25`, `sudo netstat -nlp | grep 2377|7946|4789` | swarm 상태·포트 리슨 확인 |
| 도구 | Portainer(`docker run ... portainer/portainer-ce`), Visualizer(`docker service create ... dockersamples/visualizer`), Swarmpit(`docker run ... swarmpit/install:edge`) | 클러스터 모니터링 |
| CI | `docker build -t <repo>:<tag> --no-cache .` / `docker login` / `docker push` / `docker pull` | 이미지 빌드·레지스트리 |
| CI | `git init / add / commit / remote add origin / push --set-upstream origin +master` | 소스 push |
| CI | `.github/workflows/*.yml` (on / jobs / steps / uses / with / secrets.*) | GitHub Actions workflow |
