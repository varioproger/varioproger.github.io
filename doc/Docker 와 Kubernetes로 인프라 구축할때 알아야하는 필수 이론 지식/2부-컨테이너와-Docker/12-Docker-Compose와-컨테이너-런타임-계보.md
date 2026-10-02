---
title: "12장. Docker Compose와 컨테이너 런타임 계보"
parent: "2부. 컨테이너와 Docker"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 12
---

# 12장. Docker Compose와 컨테이너 런타임 계보

> **🎮 게임 서버 개발자에게** — 로그인 서버·게임 서버·DB·Redis를 배치 파일이나 스크립트로 순서대로 띄우던 개발 환경이 Compose의 YAML 한 파일에 해당합니다. 결정적으로 다른 점은 서비스끼리 `localhost`나 IP가 아니라 **서비스 이름**으로 찾고, "먼저 띄웠다"가 "준비됐다"를 뜻하지 않는다는 것입니다. 후반부는 `docker` 명령 아래의 계층(dockerd → containerd → runc → 커널)을 다루는데, 네트워크 라이브러리 → OS API로 내려가는 계층 구조처럼 보면 쿠버네티스가 왜 Docker를 건너뛰고 containerd를 직접 쓰는지 이해됩니다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - Compose로 띄운 API 서버가 시작 직후 DB 접속 실패로 죽는다(`depends_on`만 썼음).
> - API 컨테이너 설정에 DB 호스트를 `localhost`로 적었더니 접속이 안 된다.
> - "쿠버네티스가 Docker 지원을 끊었다는데 우리 Docker 이미지를 다 바꿔야 하나요?"라는 질문에 답해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** Compose는 여러 서비스를 하나의 YAML로 묶어 전용 네트워크와 서비스 이름으로 잇는 개발 도구이고, Docker는 Moby에서 분리된 containerd·runc 등의 조합이며, kubelet은 dockerd를 거치지 않고 CRI로 같은 containerd를 직접 쓰므로 dockershim 제거 후에도 OCI 이미지는 그대로 쓸 수 있다.

1. **Compose = 한 파일 + 전용 네트워크 + 서비스 이름** — `services`/`volumes`/`networks` 등으로 정의하고, 프로젝트별 사용자 정의 네트워크 + 내장 DNS로 서비스 이름(`localhost` 아님)으로 접근한다. 준비 보장은 `healthcheck` + `condition: service_healthy`, `down -v`는 볼륨 데이터까지 지운다. v2는 Go로 재작성된 CLI 플러그인(`docker compose`)이고 설정은 Compose Specification으로 독립했다.
2. **런타임 계층과 Moby 계보** — CLI/dockerd(개발자 도구) → containerd(고수준 런타임, CNCF) → runc(저수준 런타임, OCI 참조 구현) → 커널. Moby(2017)에서 부품이 분리되어 다른 도구에서도 재사용된다.
3. **containerd는 공용 런타임, 두 경로** — `dockerd → containerd(moby)`와 `kubelet ─CRI→ containerd(k8s.io)`가 같은 containerd와 shim으로 수렴한다. containerd 네임스페이스는 커널 네임스페이스와 다른 개념이다.
4. **dockershim 제거 ≠ Docker 이미지 폐기** — 1.24에서 kubelet이 Docker Engine을 건너뛰도록 단순화한 것일 뿐, OCI 이미지와 로컬 Docker 사용은 그대로다.

**이 장의 학습 목표** (원래 "이 장에서 배우는 것")

- Docker Compose로 여러 컨테이너를 하나의 파일로 정의·실행하는 방법을 이해한다.
- Compose v2의 특징(`docker compose`)과 Compose Specification의 의미를 안다.
- containerd, runc, Moby 등 Docker를 구성하는 부품의 관계를 정리한다.
- kubelet이 CRI로 containerd를 직접 호출하고, Docker와 쿠버네티스가 같은 containerd를 각자 쓴다는 사실을 이해한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 로그인·게임·DB 서버를 순서대로 띄우는 실행 스크립트 | Compose 파일 + `depends_on` | 여러 프로세스를 한 번에, 정해진 순서로 띄운다 | `depends_on`은 **시작 순서**만 정하지 DB가 접속을 받을 준비(listen 완료)를 보장하지 않는다. 준비 확인은 `healthcheck` + `condition: service_healthy` |
| 같은 머신의 다른 서버에 `127.0.0.1`로 접속 | 서비스 이름(`db`)으로 접속 | 같은 개발 환경 안의 다른 서비스에 붙는다 | 컨테이너마다 네트워크 네임스페이스가 따로라서 컨테이너 안 `localhost`는 **자기 자신**이다 |
| 게임 로직 → 네트워크 라이브러리 → OS API(IOCP/epoll) 계층 | dockerd → containerd → runc → 커널 | 위층은 편의 기능, 아래층은 실제 커널 호출 | runc는 컨테이너를 준비(네임스페이스·cgroup 설정)한 뒤 빠지고, 실행 중 프로세스는 shim이 지켜본다. 상주하는 "한 라이브러리"가 아니다 |
| 순수 가상 인터페이스 + 어댑터 클래스 | CRI + dockershim | 호출자(kubelet)는 표준 인터페이스만 알고, 맞지 않는 구현은 어댑터로 감싼다 | 인터페이스가 gRPC 프로토콜이고, 1.24에서 어댑터(dockershim)를 kubelet에서 뺐다. Docker Engine을 쓰려면 외부 어댑터 `cri-dockerd`가 필요하다 |
| C++ `namespace`(이름 충돌 방지용 논리 구분) | containerd 네임스페이스(`moby`, `k8s.io`) | 같은 저장소 안에서 이름 공간을 나누는 논리적 장치일 뿐 격리가 아니다 | 커널 네임스페이스(프로세스 격리)와 이름만 같고 전혀 다른 개념이다. 클라이언트(dockerd/kubelet)별 메타데이터 구분용이다 |
| 실행 설정(서비스 등록 정보) vs 실행 중 프로세스 | containerd의 컨테이너 vs 태스크 | 정의와 실행 인스턴스를 나눈다 | 컨테이너(메타데이터)를 둔 채 태스크(프로세스)만 재시작할 수 있다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Compose의 `web` 서비스가 DB에 접속할 때 호스트 이름으로 `localhost`를 쓰면 왜 안 될까?
> 2. `depends_on: [db]`만 쓰면 DB가 "준비된 뒤에" API가 뜰까?
> 3. "쿠버네티스 1.24부터 Docker를 버렸다"면, Docker로 빌드한 이미지는 더 이상 못 쓰는 걸까?
> 4. 같은 노드에서 `ctr`로 띄운 컨테이너가 `docker ps`에 안 보인다면 무엇을 뜻할까?
> **처리법:** 🛠 실습 `docker compose up -d --build / ps / logs -f / exec / run --rm / config / down -v`, `healthcheck` + `condition: service_healthy`, `sudo ctr namespaces list`, `sudo ctr -n moby containers list`, `kubectl get nodes -o wide` → 바로 실행 · 🗺 관계도 CLI/dockerd → containerd → runc → 커널 계층, Moby에서 분리된 컴포넌트들(containerd·runc·BuildKit·libnetwork), 두 사용 경로(dockerd 경유 / kubelet CRI 경유), dockershim 이전·이후 · 📦 카드로 Compose 최상위 키 5개, Compose v1/v2 비교표, Moby 2017년, CRI 2016년, dockershim 제거 1.24, containerd 서비스(Content·Images·Snapshots·Containers·Tasks·Events), 런타임별 기본값(GKE·EKS·AKS / OpenShift)

---

## 코어 1. Compose = 한 파일 + 전용 네트워크 + 서비스 이름

### 1.1 Docker Compose가 필요한 이유

**한 줄 요약:** 여러 서비스를 하나의 YAML로 정의해 한 번에 띄우고, 전용 네트워크에서 서비스 이름으로 서로를 찾게 한다.

실무 애플리케이션은 이미지 한 장이 아니라 웹 서버, API, 데이터베이스, 캐시처럼 **여러 서비스가 함께** 떠야 동작한다. Compose는 여러 컨테이너를 하나의 정의 파일로 묶어 한 번에 실행한다.

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: example
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

- 최상위 키: `services`, `volumes`, `networks`, `configs`, `secrets`.
- 서비스별로 `image`(또는 `build`), `ports`([11장](11-Docker-네트워크.md)의 `-p`), `volumes`([10장](10-컨테이너-데이터-볼륨-바인드마운트-tmpfs.md)의 볼륨), `environment`, `depends_on` 등을 선언한다.
- Compose는 프로젝트마다 전용 사용자 정의 네트워크를 만들어 **서비스 이름으로 서로를 찾게** 해 준다. [11장](11-Docker-네트워크.md)의 사용자 정의 브리지 + 내장 DNS 조합 위에서 동작하는 것이다. 위 예에서 `web`은 호스트 이름 `db`로 데이터베이스에 접근할 수 있다.

같은 Compose 네트워크 안에서는 `localhost`가 아니라 서비스 이름(위 예의 `db`)으로 접근해야 한다. CLI 가이드의 개발용 Compose 예시도 DB 호스트를 `localhost`가 아닌 서비스 이름으로 써야 한다고 설명한다.

### 1.2 자주 쓰는 Compose 명령

**한 줄 요약:** `up -d`/`ps`/`logs -f`/`exec`/`run --rm`/`config`/`down`이 일상 명령이고, `down -v`는 볼륨 데이터까지 지운다.

아래 명령의 서비스 이름(`api`, `postgres`)은 CLI 가이드의 개발용 Compose 예시(1.3의 YAML) 기준이다.

```bash
docker compose up -d                 # 백그라운드로 시작
docker compose up -d --build         # 이미지를 다시 빌드하며 시작
docker compose ps                    # 상태
docker compose logs -f api           # 로그 따라가기
docker compose stop / start / restart api
docker compose down                  # 컨테이너/네트워크 삭제
docker compose down -v               # 볼륨까지 삭제 (DB 데이터도 사라짐)
docker compose exec postgres psql -U app -d app_dev   # 실행 중 컨테이너에서 명령
docker compose run --rm api npm run migration:run     # 일회성 컨테이너로 실행
docker compose config                # 병합·해석된 최종 설정 확인
docker compose pull                  # 이미지 갱신
docker compose -f compose.yaml -f compose.override.yaml up -d   # 여러 파일 병합
docker compose --profile debug up -d # 프로파일로 선택적 서비스 시작
docker compose -p myproj up -d       # 프로젝트 이름 지정
```

`down -v`는 볼륨의 데이터까지 지우므로 주의한다([10장](10-컨테이너-데이터-볼륨-바인드마운트-tmpfs.md)).

### 1.3 준비 보장과 설정 분리: `healthcheck`, `env_file`, `config`

**한 줄 요약:** `depends_on`만으로는 DB 준비가 보장되지 않으므로 `healthcheck` + `condition: service_healthy`를 쓰고, 비밀번호는 `env_file`로 분리한다.

개발용 Compose에서 DB가 준비된 뒤에 API를 시작하려면 `healthcheck`와 `depends_on`의 `condition: service_healthy`를 함께 쓴다.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10
  api:
    build: .
    env_file: [.env.local]        # 환경 변수는 파일로 주입
    ports: ["3000:3000"]
    volumes:
      - ./src:/app/src            # 바인드 마운트로 소스 실시간 반영 (10장)
    depends_on:
      postgres: { condition: service_healthy }
```

(위는 원문 CLI 가이드 예시를 일부 줄여 쓴 것이다. 원문은 `depends_on`만으로는 DB 준비를 보장하지 않으므로 `healthcheck`가 필요하다고 설명한다.)

- 비밀번호 같은 설정은 YAML에 직접 쓰기보다 `env_file`(또는 `.env`)로 분리하고, 그 파일이 이미지에 들어가지 않도록 `.dockerignore`에 넣는다([9장](09-Dockerfile과-이미지-빌드.md)). 1.1 예시의 `POSTGRES_PASSWORD: example`은 개념 설명용이다.
- `docker compose config`를 실행하면 `.env` 값이 치환되고 여러 파일이 병합된 **최종 설정**을 볼 수 있어, "값이 왜 이렇게 들어갔지?"를 확인할 때 먼저 쓴다.

### 1.4 Compose v2와 Compose Specification

**한 줄 요약:** v2는 Go로 재작성된 Docker CLI 플러그인(`docker compose`)이고, 설정 포맷은 여러 도구가 구현하는 독립 스펙이 되었다.

| 구분 | Compose v1 | Compose v2 |
|---|---|---|
| 구현 언어 | Python | Go |
| 배포 형태 | 독립 바이너리/파이썬 패키지 | Docker CLI 플러그인 |
| 실행 명령 | `docker-compose ...` (하이픈) | `docker compose ...` (공백) |
| 설정 파일 표준 | `version` 필드 필수 | Compose Specification (`version` 필드 사실상 불필요) |

- v2는 Docker CLI의 플러그인이라 `docker` 명령 하나로 이미지 빌드부터 다중 컨테이너 실행까지 일관되게 쓴다. 이미지 빌드도 BuildKit 클라이언트 라이브러리를 그대로 호출한다.
- 설정 포맷은 **Compose Specification**이라는 오픈 스펙으로 독립했다. Podman 계열의 `podman compose`, containerd 기반 `nerdctl compose`, 쿠버네티스 매니페스트로 변환하는 `kompose` 등이 이 스펙을 구현한다. 다만 OCI나 CNCF 공식 산하 프로젝트는 아니고 `compose-spec` GitHub 조직이 관리하는 독립 스펙이다.
- 여러 서비스를 한꺼번에 빌드할 때는 `COMPOSE_BAKE=true docker compose build`로 빌드 도구 Bake에 위임해 병렬 빌드와 컨텍스트 전송 중복 감소를 얻을 수 있다.

---

## 코어 2. 런타임 계층과 Moby 계보

### 2.1 Docker를 구성하는 부품의 계보

**한 줄 요약:** 하나의 데몬이던 Docker가 CLI/dockerd → containerd → runc → 커널로 분리·표준화되었고, Moby가 그 부품 키트다.

초기 Docker는 하나의 데몬이 모든 일을 했다. 이후 컨테이너 실행 부분이 분리되고 표준화되면서 지금의 구조가 되었다.

```
사용자
  │
  ▼
Docker CLI / dockerd   ← 개발자 도구 패키지 (이미지 빌드, 네트워크, 볼륨, Compose 등)
  │
  ▼
containerd             ← 고수준 런타임: 이미지 pull/저장, 컨테이너 수명 관리
  │
  ▼
runc                   ← 저수준 런타임: 네임스페이스·cgroup을 실제로 설정 (OCI Runtime Spec 참조 구현)
  │
  ▼
리눅스 커널
```

- **Moby**: 2017년 Docker 사가 자사 오픈소스 코드베이스를 상업 제품 "Docker"와 분리해 만든 프로젝트(`docker/docker` → `moby/moby`). 여러 컴포넌트를 조립해 컨테이너 시스템을 만드는 키트이고, Docker Engine은 그 조합 중 하나를 제품으로 패키징한 것이다.
- 이 과정에서 분리된 컴포넌트의 현재 위치는 다음과 같다.

| 컴포넌트 | 원래 위치 | 현재 위치 |
|---|---|---|
| containerd | dockerd 내부 실행 로직 | CNCF 졸업 프로젝트, 독립 저장소 |
| runc | libcontainer(Docker 내부 라이브러리) | OCI 산하 레퍼런스 런타임 |
| BuildKit | 레거시 이미지 빌더 | 독립 프로젝트, moby 조직 소속 |
| libnetwork | dockerd 내부 네트워킹 모듈 | 독립 저장소, moby 조직 소속 |

그래서 containerd는 Docker Engine뿐 아니라 쿠버네티스(kubelet이 CRI로 직접 호출)나 `nerdctl` 같은 다른 도구에서도 재사용되고, runc는 다른 런타임 구현체들의 참조 구현으로 쓰인다.

---

## 코어 3. containerd는 공용 런타임, 두 경로

### 3.1 containerd의 구조

**한 줄 요약:** containerd는 gRPC 소켓 뒤의 기능별 서비스 묶음이고, "컨테이너(메타데이터)"와 "태스크(실행 중 프로세스)"를 나눈다.

containerd는 유닉스 소켓(보통 `/run/containerd/containerd.sock`)에 gRPC 서버를 열어 두고, `dockerd`, `ctr`, kubelet(CRI 경유) 같은 클라이언트가 이 소켓으로 요청을 보낸다. 기능별 서비스로 나뉘어 있다.

| 서비스 | 역할 |
|---|---|
| Content | 이미지 레이어, config 등 블롭을 내용 해시로 저장·조회 |
| Images | 이미지 이름(태그)과 매니페스트 다이제스트의 매핑 |
| Snapshots | 레이어를 겹쳐 마운트 가능한 루트 파일시스템 생성 |
| Containers | 컨테이너 메타데이터(어떤 이미지·스냅샷·런타임을 쓰는지) |
| Tasks | 실제로 실행 중인 프로세스의 시작·정지·시그널 |
| Events | 컨테이너 상태 변화 이벤트 스트림 |

여기서 "컨테이너"는 정적인 메타데이터("이 이미지로 이 설정으로 실행할 예정")이고, "태스크"는 실제로 뜬 프로세스다. 이 분리 덕분에 컨테이너 정의는 두고 태스크만 재시작하는 식의 운용이 가능하다.

### 3.2 두 가지 사용 경로

**한 줄 요약:** dockerd 경유와 kubelet(CRI) 경유는 같은 containerd·shim으로 수렴하며, 차이는 "누가 요청하는가"뿐이다.

containerd에는 쿠버네티스의 **CRI(Container Runtime Interface)** 구현이 플러그인으로 내장되어 있어, 두 가지 사용 경로가 병존한다.

```
Docker Engine 경유 :  docker CLI → dockerd → containerd(네임스페이스 moby) → shim → runc
쿠버네티스 경유    :  kubelet ──CRI──→ containerd(네임스페이스 k8s.io) → shim → runc
```

두 경로 모두 최종적으로 **같은 containerd 데몬과 같은 shim 인터페이스**로 수렴한다. 차이는 "누가 containerd에 요청을 보내는가"뿐이다.

- `dockerd`는 이미지 빌드, `docker network`/`docker volume` 같은 편의 기능, 사람이 쓰기 좋은 REST API/CLI를 얹은 상위 계층이다.
- kubelet이 CRI로 containerd를 직접 쓸 때는 이런 부가 기능이 끼어들지 않고, kubelet이 필요로 하는 최소 동작(Pod sandbox 생성, 이미지 pull, 컨테이너 시작/정지)만 요청한다.
- containerd의 "네임스페이스"(`moby`, `k8s.io`)는 [6장](06-컨테이너-격리-네임스페이스.md)의 커널 네임스페이스와 **전혀 다른 개념**이다. 한 containerd 인스턴스 안에서 여러 사용자(상위 시스템)의 이미지·컨테이너 메타데이터를 구분하는 멀티테넌시 장치일 뿐이다.

```bash
sudo ctr namespaces list            # moby(도커 사용 시), k8s.io(쿠버네티스 노드)
sudo ctr -n moby containers list    # docker ps 와 일치
```

`ctr`은 디버깅·실습용 저수준 CLI이고(일상 운영에는 `nerdctl` 같은 도구가 적합), 같은 노드에서 `ctr`로 띄운 컨테이너는 `docker ps`에 보이지 않는다. dockerd와 `ctr`(또는 kubelet)이 각각 독립적으로 접근하는 공용 런타임이 containerd라는 증거다.

---

## 코어 4. dockershim 제거 ≠ Docker 이미지 폐기

### 4.1 Docker와 쿠버네티스의 관계

**한 줄 요약:** kubelet은 CRI를 통해서만 containerd 또는 CRI-O를 호출하고, dockerd는 그 경로에 없다.

| 구성 요소 | 역할 | 상위 호출자 | 하위 의존 대상 |
|---|---|---|---|
| Docker Desktop | macOS/Windows에서 리눅스 VM을 띄우고 그 안에서 Docker Engine 구동 | 사용자 | Docker Engine(VM 내부) |
| Docker Engine (dockerd) | REST API, 이미지/네트워크/볼륨 관리, Compose 등 UX | Docker CLI, Docker Desktop | containerd |
| containerd | 이미지 pull/저장, 컨테이너 수명, 스냅샷 관리 | dockerd 또는 kubelet(CRI), nerdctl | runc(또는 다른 OCI 런타임), shim |
| CRI-O | 쿠버네티스 전용으로 설계된 경량 CRI 구현체 | kubelet | runc(또는 다른 OCI 런타임) |
| kubelet | 노드에서 Pod를 관리하는 쿠버네티스 에이전트 | 쿠버네티스 컨트롤 플레인 | containerd 또는 CRI-O (CRI를 통해서만) |

### 4.2 dockershim 제거는 "Docker 이미지를 못 쓴다"는 뜻이 아니다

**한 줄 요약:** CRI(2016) 도입 후 Docker용 어댑터였던 dockershim이 1.24에서 빠졌을 뿐, OCI 이미지와 로컬 Docker 사용은 그대로다.

- 초기에는 kubelet이 Docker를 직접 호출했다.
- 2016년 **CRI**가 도입되어 kubelet이 표준 gRPC 인터페이스로 런타임과 대화하게 되었다.
- Docker는 CRI를 구현하지 않았기 때문에 kubelet 안에 **dockershim**이라는 어댑터가 내장되어 있었다(`kubelet → dockershim → Docker Engine → containerd → runc`).
- 쿠버네티스 **1.24에서 dockershim이 제거**되었다.

이것이 "쿠버네티스가 Docker를 버렸다"고 잘못 알려진 사건이다. 정확히는 **kubelet이 Docker Engine을 거치지 않고 containerd/CRI-O에 CRI로 직접 연결하는 구조로 단순화**된 것이다. Docker로 빌드한 이미지는 OCI 표준이므로 아무 영향이 없고, 개발자가 로컬에서 `docker build`/`docker run`/`docker compose`를 쓰는 것도 그대로다. Docker Engine을 쿠버네티스 런타임으로 쓰려면 `cri-dockerd`라는 별도 어댑터가 필요하다.

```
kubelet ──CRI──→ containerd ──→ shim/runc → 앱 프로세스   (현재 쿠버네티스 노드)
```

### 4.3 현재 주요 런타임과 확인 방법

**한 줄 요약:** containerd(GKE·EKS·AKS 기본), CRI-O(OpenShift 기본), 샌드박스 런타임은 RuntimeClass로 선택하며, 노드의 런타임은 `kubectl get nodes -o wide`로 본다.

현재 주요 런타임은 다음과 같다.

| 런타임 | 특징 |
|---|---|
| containerd | 가장 널리 쓰인다. GKE·EKS·AKS 기본값 |
| CRI-O | 쿠버네티스 전용으로 설계. OpenShift 기본값 |
| Docker Engine | 개발 환경에서 여전히 표준. 내부적으로 containerd 사용 |
| gVisor / Kata | 샌드박스 런타임. RuntimeClass로 특정 워크로드에만 적용 가능 |

클러스터가 어떤 런타임을 쓰는지는 노드 정보에서 확인한다(쿠버네티스 클러스터가 있을 때).

```bash
kubectl get nodes -o wide
# CONTAINER-RUNTIME 열: containerd://1.7.x
```

### 4.4 Docker Desktop

**한 줄 요약:** macOS/Windows의 Docker Desktop은 리눅스 VM 안에서 Docker Engine을 돌리므로 리눅스 원리가 그대로 적용된다.

macOS/Windows에는 리눅스 네이티브 네임스페이스·cgroup이 없으므로, Docker Desktop은 경량 리눅스 VM을 띄우고 그 안에서 통상의 Docker Engine(dockerd + containerd + runc)을 구동한다. 이 책이 리눅스 환경을 기준으로 설명하는 이유이며, VM 안에서는 리눅스 호스트와 같은 원리가 적용된다.

---

## 실무 적용

### 체크리스트

- [ ] Compose는 여러 서비스를 하나의 YAML로 정의·실행하며, 프로젝트별 전용 네트워크와 내장 DNS 덕분에 서비스 이름으로 서로를 찾는다. 서비스 간 접속 호스트는 `localhost`가 아니라 서비스 이름이다.
- [ ] DB 준비가 필요한 서비스는 `healthcheck` + `depends_on.condition: service_healthy`를 쓴다(`depends_on`만으로는 준비 보장 안 됨).
- [ ] 비밀번호는 `env_file`(또는 `.env`)로 분리하고 `.dockerignore`에 넣는다. 값이 이상하면 `docker compose config`로 최종 설정부터 본다.
- [ ] Compose v2는 Go로 재작성된 Docker CLI 플러그인(`docker compose`)이고, 설정 포맷은 Compose Specification으로 독립했다. `down -v`는 볼륨 데이터까지 지운다.
- [ ] Docker는 CLI/dockerd → containerd → runc → 커널의 층으로 구성되며, containerd와 runc는 각각 CNCF와 OCI 산하의 중립 프로젝트로 분리되어 다른 도구에서도 쓰인다.
- [ ] kubelet은 CRI로 containerd/CRI-O를 직접 호출하며 dockerd를 거치지 않는다. Docker Engine과 쿠버네티스는 같은 containerd를 각자 독립적으로 쓰는 병렬 경로다.
- [ ] dockershim 제거(쿠버네티스 1.24)는 Docker 이미지를 못 쓴다는 뜻이 아니다. 이미지는 OCI 표준이라 그대로 쓸 수 있다. Docker Engine을 노드 런타임으로 쓰려면 `cri-dockerd`가 필요하다.
- [ ] containerd의 네임스페이스(`moby`, `k8s.io`)는 커널 네임스페이스와 다른 개념이다. 노드 런타임은 `kubectl get nodes -o wide`의 `CONTAINER-RUNTIME` 열로 확인한다.

### 시나리오로 확인하기

1. **상황:** Compose로 `api`와 `postgres`를 띄웠다. `api`의 DB 호스트 설정은 로컬 개발 습관대로 `localhost:5432`이고, `depends_on: [postgres]`도 넣었다. 그런데 `api`가 시작 직후 DB 접속 실패로 죽는다.
   **질문:** 문제가 두 가지다. 각각 무엇이고 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   (1) 컨테이너 안의 `localhost`는 자기 자신의 네트워크 네임스페이스를 가리킨다. Compose가 만든 전용 네트워크에서 내장 DNS가 서비스 이름을 풀어 주므로 DB 호스트는 `postgres`(서비스 이름)로 써야 한다. (2) `depends_on`만으로는 DB가 요청을 받을 준비가 되었는지 보장하지 않는다. `postgres`에 `healthcheck`(`pg_isready -U app`)를 두고 `api`의 `depends_on`에 `condition: service_healthy`를 지정한다. → 코어 1 (1.1, 1.3)

   </details>

2. **상황:** 로컬 DB 스키마를 초기화하려고 `docker compose down -v` 후 `up -d`를 했는데, 팀원이 공유 개발 PC에서 쓰던 테스트 데이터까지 사라졌다고 항의한다.
   **질문:** 무엇이 지워졌나?

   <details markdown="1"><summary>답 확인</summary>

   `down`은 컨테이너/네트워크를 지우고, `-v`는 볼륨까지 삭제해 DB 데이터도 사라진다. 데이터를 유지하려면 `-v` 없이 `down`하고, 초기화가 목적이면 마이그레이션 같은 일회성 명령(`docker compose run --rm api npm run migration:run`)을 쓴다. → 코어 1 (1.2)

   </details>

3. **상황:** 관리자가 "쿠버네티스 1.24부터 Docker 지원이 끊겼으니 Docker로 만든 이미지와 CI 빌드 파이프라인을 전부 바꿔야 한다"고 한다.
   **질문:** 맞는 말인가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. 1.24에서 제거된 것은 kubelet 안의 Docker용 어댑터 dockershim이다(`kubelet → dockershim → Docker Engine → containerd → runc`). 이제 kubelet은 containerd/CRI-O에 CRI로 직접 연결한다. Docker로 빌드한 이미지는 OCI 표준이라 그대로 쓰고, 로컬 `docker build`/`run`/`compose`도 그대로다. 노드 런타임으로 Docker Engine을 꼭 써야 할 때만 `cri-dockerd`가 필요하다. → 코어 4 (4.2)

   </details>

4. **상황:** 쿠버네티스 노드에 접속해 `docker ps`를 했더니 실행 중인 Pod 컨테이너가 하나도 안 보인다(또는 docker가 아예 없다). 그런데 Pod는 정상 동작 중이다.
   **질문:** 컨테이너는 어디서 돌고 있고, 어떻게 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   kubelet은 dockerd를 거치지 않고 CRI로 containerd를 직접 쓰며, 그 컨테이너는 containerd의 `k8s.io` 네임스페이스에 있다. `docker ps`는 dockerd가 관리하는(`moby` 네임스페이스) 컨테이너만 보여 준다. `sudo ctr namespaces list`, `sudo ctr -n k8s.io containers list`로 보거나, 노드 런타임은 `kubectl get nodes -o wide`의 `CONTAINER-RUNTIME` 열로 확인한다. → 코어 3 (3.2), 코어 4 (4.3)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1 Compose
  최상위 키 services / ____ / ____ / configs / secrets
  서비스 간 접근 = ( ? ) 이름  (이유: 전용 ____ 네트워크 + ____ DNS)
  명령: up -d(--build) / ps / logs -f / exec / run --rm / ____(최종 설정) / down(-v = ____)
  준비 보장: ____ + depends_on.condition: ____
  v1(Python, docker____compose, version 필수) vs v2(____, CLI ____, Compose ____)
  구현체: podman compose / ____ compose / kompose    병렬 빌드: COMPOSE_BAKE=true
코어 2 계보: CLI/dockerd → ____(고수준) → ____(저수준) → 커널
  Moby(____년): containerd(→ ____ 졸업) / runc(→ ____) / BuildKit / libnetwork
코어 3 containerd: gRPC 소켓 / 서비스 Content·Images·Snapshots·Containers·____·Events
  컨테이너(____) vs 태스크(____)
  경로 A: dockerd → containerd(ns ____) → shim → runc
  경로 B: kubelet ─____→ containerd(ns ____) → shim → runc
  containerd ns ≠ ____ 네임스페이스
코어 4 CRI(____년) → dockershim → ____ 에서 제거 → Docker Engine 쓰려면 ____
  런타임: containerd(GKE·EKS·AKS) / CRI-O(____) / gVisor·Kata(RuntimeClass)
  Docker Desktop = 리눅스 ____ 안의 Docker Engine
```

### 2. 인출 질문

1. Compose에서 `web` 서비스가 `db` 서비스에 접근할 때 호스트 이름으로 무엇을 쓰고, 이것이 가능한 이유는?

   <details markdown="1"><summary>답 확인</summary>

   서비스 이름 `db`를 쓴다(`localhost`가 아님). Compose가 프로젝트마다 전용 사용자 정의 네트워크를 만들고, 그 위에서 [11장](11-Docker-네트워크.md)의 내장 DNS가 서비스 이름을 컨테이너 IP로 해석해 주기 때문이다. 컨테이너 안의 `localhost`는 자기 자신의 네트워크 네임스페이스를 가리킨다. → 코어 1 (1.1)

   </details>

2. 쿠버네티스 노드에서 컨테이너가 시작되는 경로와 개발 머신에서 `docker run`이 컨테이너를 시작하는 경로의 공통점과 차이는?

   <details markdown="1"><summary>답 확인</summary>

   공통점: 둘 다 최종적으로 같은 containerd 데몬과 같은 shim 인터페이스, runc로 수렴한다. 차이: 누가 containerd에 요청하는가다. 개발 머신은 `docker CLI → dockerd → containerd(moby 네임스페이스)`로 빌드·네트워크·볼륨 같은 편의 기능이 얹히고, 쿠버네티스는 `kubelet ─CRI→ containerd(k8s.io 네임스페이스)`로 Pod sandbox 생성, 이미지 pull, 컨테이너 시작/정지 같은 최소 동작만 요청한다. → 코어 3 (3.2)

   </details>

3. "쿠버네티스 1.24에서 Docker 지원이 중단되었다"는 말이 정확히 무엇이 바뀐 것인지 설명해 보자.

   <details markdown="1"><summary>답 확인</summary>

   Docker는 CRI를 구현하지 않아 kubelet 안에 dockershim 어댑터가 있었는데(`kubelet → dockershim → Docker Engine → containerd → runc`), 1.24에서 이것이 제거되어 kubelet이 containerd/CRI-O에 CRI로 직접 연결하도록 단순화되었다. Docker로 빌드한 이미지는 OCI 표준이라 영향이 없고, 로컬의 `docker build`/`run`/`compose`도 그대로다. Docker Engine을 런타임으로 쓰려면 `cri-dockerd`가 필요하다. → 코어 4 (4.2)

   </details>

4. `depends_on: [db]`만으로 부족한 이유와 해결책은?

   <details markdown="1"><summary>답 확인</summary>

   `depends_on`만으로는 DB가 요청을 받을 준비가 되었는지를 보장하지 않는다. DB에 `healthcheck`(예: `pg_isready`)를 두고 API의 `depends_on`에 `condition: service_healthy`를 지정해 DB가 healthy가 된 뒤에 시작하게 한다. → 코어 1 (1.3)

   </details>

5. Compose v1과 v2의 차이, 그리고 Compose Specification의 의미는?

   <details markdown="1"><summary>답 확인</summary>

   v1은 Python 독립 바이너리로 `docker-compose`(하이픈), `version` 필드가 필수였다. v2는 Go로 재작성된 Docker CLI 플러그인으로 `docker compose`(공백)를 쓰고, 설정 포맷이 Compose Specification이라는 오픈 스펙으로 독립해 `version`이 사실상 불필요하다. 이 스펙은 `podman compose`, `nerdctl compose`, `kompose` 등이 구현하며, OCI·CNCF 산하가 아닌 `compose-spec` 조직의 독립 스펙이다. → 코어 1 (1.4)

   </details>

6. containerd의 "컨테이너"와 "태스크"는 어떻게 다르며, 이 분리의 이점은?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너는 정적인 메타데이터("이 이미지로 이 설정으로 실행할 예정")이고, 태스크는 실제로 뜬 프로세스다. 분리 덕분에 컨테이너 정의는 그대로 두고 태스크만 재시작하는 운용이 가능하다. → 코어 3 (3.1)

   </details>

7. containerd의 네임스페이스 `moby`, `k8s.io`는 [6장](06-컨테이너-격리-네임스페이스.md)의 커널 네임스페이스와 어떻게 다르며, `ctr`로 띄운 컨테이너가 `docker ps`에 안 보이는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   containerd 네임스페이스는 한 containerd 인스턴스 안에서 여러 상위 시스템(dockerd, kubelet 등)의 이미지·컨테이너 메타데이터를 구분하는 멀티테넌시 장치로, 프로세스의 뷰를 바꾸는 커널 네임스페이스와 전혀 다른 개념이다. `docker ps`는 dockerd가 관리하는 컨테이너(`ctr -n moby containers list`와 일치)만 보여 주므로, dockerd를 거치지 않고 `ctr`로 띄운 컨테이너는 보이지 않는다. containerd가 여러 클라이언트가 독립적으로 접근하는 공용 런타임이라는 증거다. → 코어 3 (3.2)

   </details>

8. macOS/Windows의 Docker Desktop에서도 이 책의 리눅스 원리가 그대로 적용되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   macOS/Windows에는 리눅스 네이티브 네임스페이스·cgroup이 없으므로, Docker Desktop은 경량 리눅스 VM을 띄우고 그 안에서 통상의 Docker Engine(dockerd + containerd + runc)을 구동한다. VM 안에서는 리눅스 호스트와 같은 원리가 적용된다. → 코어 4 (4.4)

   </details>

9. Moby에서 분리된 컴포넌트 네 가지와 각각의 현재 위치는?

   <details markdown="1"><summary>답 확인</summary>

   containerd(dockerd 내부 실행 로직 → CNCF 졸업 프로젝트), runc(libcontainer → OCI 산하 레퍼런스 런타임), BuildKit(레거시 이미지 빌더 → 독립 프로젝트, moby 조직), libnetwork(dockerd 내부 네트워킹 모듈 → 독립 저장소, moby 조직). → 코어 2 (2.1)

   </details>

### 3. 기억 고리

- **C++ 유추:** CRI + dockershim ≈ 순수 가상 인터페이스 + 어댑터 클래스. ⚠️ 인터페이스는 gRPC 프로토콜이고, 1.24에서 어댑터를 kubelet 밖으로 뺐을 뿐 이미지(OCI)는 그대로다.
- **C++ 유추:** containerd 네임스페이스 ≈ C++ `namespace`(논리적 이름 구분). ⚠️ 이름이 같은 커널 네임스페이스(프로세스 격리)와 전혀 다른 개념이다.
- **비유:** containerd = 공용 주방, dockerd = 손님을 직접 받는 레스토랑 홀, kubelet = 배달 플랫폼. 홀(dockerd)은 메뉴판·좌석(빌드·네트워크·볼륨) 같은 서비스를 얹어 주문을 넣고, 배달 플랫폼(kubelet)은 표준 주문서(CRI)로 주방에 직접 주문한다. 과거에는 배달 주문도 홀을 거쳤는데(dockershim), 1.24에서 그 통로를 없앴을 뿐 같은 요리(OCI 이미지)는 그대로 나온다. ⚠️ 비유가 깨지는 지점: 주방의 주문 장부는 containerd 네임스페이스(`moby`, `k8s.io`)로 나뉘어 서로의 주문이 안 보이고, 실제 조리(프로세스 실행)는 주방장(runc)이 준비만 한 뒤 사라지고 shim이 지켜본다.
- **묶음(3의 법칙):** 런타임 3층(dockerd·containerd·runc) / Moby에서 나간 3대 부품(containerd→CNCF·runc→OCI·BuildKit→moby 조직) / Compose 실무 3함정(`localhost` 대신 서비스 이름·`depends_on`만으로 준비 보장 안 됨·`down -v`는 데이터 삭제).
- **대칭·순서:** Compose v1(Python, `docker-compose`) ↔ v2(Go, `docker compose`). 고수준 런타임(containerd) ↔ 저수준 런타임(runc). 흐름 두 줄: ① 부품 분리 — 하나의 데몬이 모든 일을 하던 Docker → Moby(2017)로 containerd·runc 등 분리. ② kubelet 연결 — kubelet이 Docker 직접 호출 → CRI 도입(2016) + dockershim 어댑터 → dockershim 제거(1.24) → kubelet ─CRI→ containerd/CRI-O.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "쿠버네티스가 Docker를 버렸다는 말이 왜 오해인가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "Compose에서 왜 `localhost`로 DB에 못 붙고, 왜 `depends_on`만으로는 DB가 listen할 때까지 기다려 주지 않는지"를 소켓·프로세스 시작 순서 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "쿠버네티스 노드에도 Docker Engine을 깔아 쓰는 게 익숙하고 편하다" vs B "kubelet이 CRI로 containerd/CRI-O를 직접 쓰는 게 맞다" — 양쪽을 번갈아 변호해 보세요. (`cri-dockerd` 필요성, 부가 기능의 필요 여부, 계층 단순화를 근거로)
- **AI 역할 반전:** "내가 Docker의 부품 계보(Moby, containerd, runc)와 두 사용 경로를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/10_Compose_v2와_Moby_프로젝트_생태계.md (Compose v1에서 v2로, Compose Specification, Compose와 Bake 연동, Moby 프로젝트, Docker Desktop·Docker Engine·containerd·Kubernetes의 관계); docker-fundamental/05_containerd_아키텍처_심화.md (5.1 containerd의 전체 구조, 5.5 CRI 플러그인과 Kubernetes 통합, 5.6·5.7 일부 — ctr·containerd 네임스페이스); kubernetes-textbook-main/01-쿠버네티스로-가는-길/02-컨테이너의-이해.md (2.5 컨테이너 런타임의 계보); CLI-Complete-Guide_NestJS-Docker-K8s-Terraform.pdf (06 Docker Compose 절의 명령·compose.yaml 예시 — env_file, 바인드 마운트, healthcheck, config)*
