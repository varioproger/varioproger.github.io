---
title: "11장. Docker Compose와 컨테이너 런타임 계보"
parent: "2부. 컨테이너와 Docker"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 11
---

# 11장. Docker Compose와 컨테이너 런타임 계보

## 이 장에서 배우는 것

- Docker Compose로 여러 컨테이너를 하나의 파일로 정의·실행하는 방법을 이해한다.
- Compose v2의 특징(`docker compose`)과 Compose Specification의 의미를 안다.
- containerd, runc, Moby 등 Docker를 구성하는 부품의 관계를 정리한다.
- kubelet이 CRI로 containerd를 직접 호출하고, Docker와 쿠버네티스가 같은 containerd를 각자 쓴다는 사실을 이해한다.

---

## 11.1 Docker Compose가 필요한 이유

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
- 서비스별로 `image`(또는 `build`), `ports`(10장의 `-p`), `volumes`(9장의 볼륨), `environment`, `depends_on` 등을 선언한다.
- Compose는 프로젝트마다 전용 사용자 정의 네트워크를 만들어 **서비스 이름으로 서로를 찾게** 해 준다. 10장의 사용자 정의 브리지 + 내장 DNS 조합 위에서 동작하는 것이다. 위 예에서 `web`은 호스트 이름 `db`로 데이터베이스에 접근할 수 있다.

같은 Compose 네트워크 안에서는 `localhost`가 아니라 서비스 이름(위 예의 `db`)으로 접근해야 한다. CLI 가이드의 개발용 Compose 예시도 DB 호스트를 `localhost`가 아닌 서비스 이름으로 써야 한다고 설명한다.

---

## 11.2 자주 쓰는 Compose 명령

아래 명령의 서비스 이름(`api`, `postgres`)은 CLI 가이드의 개발용 Compose 예시(이 절 뒤쪽 YAML) 기준이다.

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

`down -v`는 볼륨의 데이터까지 지우므로 주의한다(9장).

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
      - ./src:/app/src            # 바인드 마운트로 소스 실시간 반영 (9장)
    depends_on:
      postgres: { condition: service_healthy }
```

(위는 원문 CLI 가이드 예시를 일부 줄여 쓴 것이다. 원문은 `depends_on`만으로는 DB 준비를 보장하지 않으므로 `healthcheck`가 필요하다고 설명한다.)

- 비밀번호 같은 설정은 YAML에 직접 쓰기보다 `env_file`(또는 `.env`)로 분리하고, 그 파일이 이미지에 들어가지 않도록 `.dockerignore`에 넣는다(8장). 11.1 예시의 `POSTGRES_PASSWORD: example`은 개념 설명용이다.
- `docker compose config`를 실행하면 `.env` 값이 치환되고 여러 파일이 병합된 **최종 설정**을 볼 수 있어, "값이 왜 이렇게 들어갔지?"를 확인할 때 먼저 쓴다.

---

## 11.3 Compose v2와 Compose Specification

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

## 11.4 Docker를 구성하는 부품의 계보

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

## 11.5 containerd의 구조와 두 가지 사용 경로

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

containerd에는 쿠버네티스의 **CRI(Container Runtime Interface)** 구현이 플러그인으로 내장되어 있어, 두 가지 사용 경로가 병존한다.

```
Docker Engine 경유 :  docker CLI → dockerd → containerd(네임스페이스 moby) → shim → runc
쿠버네티스 경유    :  kubelet ──CRI──→ containerd(네임스페이스 k8s.io) → shim → runc
```

두 경로 모두 최종적으로 **같은 containerd 데몬과 같은 shim 인터페이스**로 수렴한다. 차이는 "누가 containerd에 요청을 보내는가"뿐이다.

- `dockerd`는 이미지 빌드, `docker network`/`docker volume` 같은 편의 기능, 사람이 쓰기 좋은 REST API/CLI를 얹은 상위 계층이다.
- kubelet이 CRI로 containerd를 직접 쓸 때는 이런 부가 기능이 끼어들지 않고, kubelet이 필요로 하는 최소 동작(Pod sandbox 생성, 이미지 pull, 컨테이너 시작/정지)만 요청한다.
- containerd의 "네임스페이스"(`moby`, `k8s.io`)는 5장의 커널 네임스페이스와 **전혀 다른 개념**이다. 한 containerd 인스턴스 안에서 여러 사용자(상위 시스템)의 이미지·컨테이너 메타데이터를 구분하는 멀티테넌시 장치일 뿐이다.

```bash
sudo ctr namespaces list            # moby(도커 사용 시), k8s.io(쿠버네티스 노드)
sudo ctr -n moby containers list    # docker ps 와 일치
```

`ctr`은 디버깅·실습용 저수준 CLI이고(일상 운영에는 `nerdctl` 같은 도구가 적합), 같은 노드에서 `ctr`로 띄운 컨테이너는 `docker ps`에 보이지 않는다. dockerd와 `ctr`(또는 kubelet)이 각각 독립적으로 접근하는 공용 런타임이 containerd라는 증거다.

---

## 11.6 Docker와 쿠버네티스의 관계

| 구성 요소 | 역할 | 상위 호출자 | 하위 의존 대상 |
|---|---|---|---|
| Docker Desktop | macOS/Windows에서 리눅스 VM을 띄우고 그 안에서 Docker Engine 구동 | 사용자 | Docker Engine(VM 내부) |
| Docker Engine (dockerd) | REST API, 이미지/네트워크/볼륨 관리, Compose 등 UX | Docker CLI, Docker Desktop | containerd |
| containerd | 이미지 pull/저장, 컨테이너 수명, 스냅샷 관리 | dockerd 또는 kubelet(CRI), nerdctl | runc(또는 다른 OCI 런타임), shim |
| CRI-O | 쿠버네티스 전용으로 설계된 경량 CRI 구현체 | kubelet | runc(또는 다른 OCI 런타임) |
| kubelet | 노드에서 Pod를 관리하는 쿠버네티스 에이전트 | 쿠버네티스 컨트롤 플레인 | containerd 또는 CRI-O (CRI를 통해서만) |

### dockershim 제거는 "Docker 이미지를 못 쓴다"는 뜻이 아니다

- 초기에는 kubelet이 Docker를 직접 호출했다.
- 2016년 **CRI**가 도입되어 kubelet이 표준 gRPC 인터페이스로 런타임과 대화하게 되었다.
- Docker는 CRI를 구현하지 않았기 때문에 kubelet 안에 **dockershim**이라는 어댑터가 내장되어 있었다(`kubelet → dockershim → Docker Engine → containerd → runc`).
- 쿠버네티스 **1.24에서 dockershim이 제거**되었다.

이것이 "쿠버네티스가 Docker를 버렸다"고 잘못 알려진 사건이다. 정확히는 **kubelet이 Docker Engine을 거치지 않고 containerd/CRI-O에 CRI로 직접 연결하는 구조로 단순화**된 것이다. Docker로 빌드한 이미지는 OCI 표준이므로 아무 영향이 없고, 개발자가 로컬에서 `docker build`/`docker run`/`docker compose`를 쓰는 것도 그대로다. Docker Engine을 쿠버네티스 런타임으로 쓰려면 `cri-dockerd`라는 별도 어댑터가 필요하다.

```
kubelet ──CRI──→ containerd ──→ shim/runc → 앱 프로세스   (현재 쿠버네티스 노드)
```

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

### Docker Desktop

macOS/Windows에는 리눅스 네이티브 네임스페이스·cgroup이 없으므로, Docker Desktop은 경량 리눅스 VM을 띄우고 그 안에서 통상의 Docker Engine(dockerd + containerd + runc)을 구동한다. 이 책이 리눅스 환경을 기준으로 설명하는 이유이며, VM 안에서는 리눅스 호스트와 같은 원리가 적용된다.

---

## 핵심 요약

- Compose는 여러 서비스를 하나의 YAML로 정의·실행하며, 프로젝트별 전용 네트워크와 내장 DNS 덕분에 서비스 이름으로 서로를 찾는다.
- Compose v2는 Go로 재작성된 Docker CLI 플러그인(`docker compose`)이고, 설정 포맷은 Compose Specification으로 독립했다. `down -v`는 볼륨 데이터까지 지운다.
- Docker는 CLI/dockerd → containerd → runc → 커널의 층으로 구성되며, containerd와 runc는 각각 CNCF와 OCI 산하의 중립 프로젝트로 분리되어 다른 도구에서도 쓰인다.
- kubelet은 CRI로 containerd/CRI-O를 직접 호출하며 dockerd를 거치지 않는다. Docker Engine과 쿠버네티스는 같은 containerd를 각자 독립적으로 쓰는 병렬 경로다.
- dockershim 제거(쿠버네티스 1.24)는 Docker 이미지를 못 쓴다는 뜻이 아니다. 이미지는 OCI 표준이라 그대로 쓸 수 있다.
- containerd의 네임스페이스(`moby`, `k8s.io`)는 커널 네임스페이스와 다른 개념이다.

## 확인 질문

1. Compose에서 `web` 서비스가 `db` 서비스에 접근할 때 호스트 이름으로 무엇을 쓰고, 이것이 가능한 이유는?
2. 쿠버네티스 노드에서 컨테이너가 시작되는 경로와 개발 머신에서 `docker run`이 컨테이너를 시작하는 경로의 공통점과 차이는?
3. "쿠버네티스 1.24에서 Docker 지원이 중단되었다"는 말이 정확히 무엇이 바뀐 것인지 설명해 보자.

*원문 근거: docker-fundamental/10_Compose_v2와_Moby_프로젝트_생태계.md (Compose v1에서 v2로, Compose Specification, Compose와 Bake 연동, Moby 프로젝트, Docker Desktop·Docker Engine·containerd·Kubernetes의 관계); docker-fundamental/05_containerd_아키텍처_심화.md (5.1 containerd의 전체 구조, 5.5 CRI 플러그인과 Kubernetes 통합, 5.6·5.7 일부 — ctr·containerd 네임스페이스); kubernetes-textbook-main/01-쿠버네티스로-가는-길/02-컨테이너의-이해.md (2.5 컨테이너 런타임의 계보); CLI-Complete-Guide_NestJS-Docker-K8s-Terraform.pdf (06 Docker Compose 절의 명령·compose.yaml 예시 — env_file, 바인드 마운트, healthcheck, config)*
