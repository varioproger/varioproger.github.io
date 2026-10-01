---
title: "10장. Compose v2와 Moby 프로젝트 생태계"
---

# 10장. Compose v2와 Moby 프로젝트 생태계

9장에서는 Dockerfile 한 장이 BuildKit 프론트엔드와 멀티플랫폼 빌드를 거쳐 어떻게 이미지로 만들어지는지
살펴봤습니다. 그러나 실무에서 다루는 애플리케이션은 대개 이미지 한 장이 아니라 여러 서비스 — 웹
서버, API, 데이터베이스, 캐시 — 가 함께 떠 있어야 동작합니다. 이 장에서는 여러 컨테이너를 하나의
정의로 묶어 실행하는 Docker Compose가 v1에서 v2로 넘어오며 어떻게 재작성되었는지, 그 설정 형식인
Compose Specification이 Docker라는 회사를 넘어 어떤 위치를 차지하고 있는지, 그리고 이 모든 도구들이
속해 있는 더 큰 우산인 Moby 프로젝트의 역사와 2026년 현재의 모습을 다룹니다.

## Compose v1에서 v2로: 언어와 배포 방식이 모두 바뀌다

`docker-compose`라는 이름으로 익숙한 초기 Compose(v1)는 Python으로 작성된 독립 실행 파일이었습니다.
`pip install docker-compose`나 별도의 바이너리 배포로 설치했고, Docker CLI(`docker`)와는 완전히
분리된 프로세스로 동작했습니다. `docker-compose.yml`을 읽어 Docker Engine의 REST API를 호출하는
오케스트레이션 스크립트 역할을 했고, 내부적으로는 여러 컨테이너의 생성·시작·네트워크 연결 순서를
파이썬 코드로 직접 제어했습니다.

Compose v2는 이 구현을 Go로 완전히 새로 작성하고, 독립 바이너리가 아니라 **Docker CLI 플러그인**
형태로 통합했습니다. 그 결과 명령어도 `docker-compose up`(하이픈, 별도 실행 파일)에서 `docker compose
up`(공백, `docker` CLI의 서브커맨드)으로 바뀌었습니다. 이 변화는 단순한 리네이밍이 아니라 아키텍처
자체의 변화입니다.

| 구분 | Compose v1 | Compose v2 |
|---|---|---|
| 구현 언어 | Python | Go |
| 배포 형태 | 독립 바이너리/파이썬 패키지 | Docker CLI 플러그인(`~/.docker/cli-plugins/docker-compose`) |
| 실행 명령 | `docker-compose ...` | `docker compose ...` |
| Docker CLI와의 관계 | 별도 프로세스, REST API로만 통신 | CLI 플러그인 프로토콜로 통합, 공통 코드 재사용 |
| 설정 파일 표준 | Compose 파일 포맷(버전 필드 필수) | Compose Specification(버전 필드 사실상 불필요) |

Go로 재작성된 것은 단순히 언어 취향의 문제가 아니라, Docker CLI 자체가 Go로 작성되어 있고 BuildKit
클라이언트 라이브러리, containerd 클라이언트 등 Docker 생태계의 핵심 라이브러리들이 모두 Go 모듈로
제공되기 때문에, 같은 언어로 통합해야 이 라이브러리들을 직접 재사용할 수 있었기 때문입니다. 실제로
Compose v2는 이미지를 빌드할 때 별도의 구현을 두지 않고, 8~9장에서 다룬 BuildKit 클라이언트 라이브러리를
그대로 호출합니다. CLI 플러그인 구조로 통합되면서 `docker compose`는 `docker builder`, `docker
buildx`, `docker scout`처럼 Docker CLI가 지원하는 여러 플러그인 중 하나가 되었고, 사용자 입장에서는
`docker` 명령 하나로 이미지 빌드부터 다중 컨테이너 오케스트레이션까지 일관된 경험을 얻게 됐습니다.

## Compose Specification: Docker를 넘어서는 공유 스펙

Compose v2와 함께 등장한 중요한 변화는 설정 파일 포맷 자체가 **Compose Specification**이라는 별도의
오픈 스펙으로 독립했다는 점입니다. v1 시절의 Compose 파일은 `version: "3.8"`처럼 버전 필드를 명시해야
했고, 이 버전에 따라 지원되는 필드가 달라지는 방식이었습니다. Compose Specification은 이 버전 필드
개념을 사실상 폐지하고, 스펙 자체가 지속적으로 확장되는 단일 사양으로 정리되었습니다. 최신 Compose v2는
`version` 필드가 없는 파일도 정상적으로 해석하며, 있더라도 대부분 무시하거나 경고만 남깁니다.

이 스펙은 `compose-spec` GitHub 조직 아래에서 관리되며, Docker 한 회사의 사유 포맷이 아니라 여러 도구가
함께 구현하는 공개 표준을 지향합니다. Docker Compose가 사실상의 레퍼런스 구현체 역할을 하지만, Podman
계열의 `podman compose`, containerd 기반 CLI인 `nerdctl compose`, Kubernetes 매니페스트로 변환해주는
`kompose` 등 여러 도구가 이 스펙을 부분적으로 또는 폭넓게 구현하고 있습니다. 다만 이 스펙이 OCI(Open
Container Initiative)나 CNCF(Cloud Native Computing Foundation) 산하의 공식 프로젝트로 편입된 것은
아니며, Apache 2.0 라이선스로 GitHub 기반 협업을 통해 독립적으로 발전하는 오픈소스 스펙이라는 점은
정확히 짚어둘 필요가 있습니다. 다시 말해 "여러 벤더가 공유하는 컨테이너 오케스트레이션 정의 언어"라는
역할 면에서 OCI 이미지 스펙·런타임 스펙과 유사한 위치를 차지하지만, 거버넌스 구조는 별개입니다.

Compose 파일의 기본 골격은 여전히 익숙한 형태를 유지합니다.

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

`services`, `volumes`, `networks`, `configs`, `secrets` 같은 최상위 키 구조 자체는 이전 세대 Compose
파일과 크게 다르지 않습니다. 달라진 것은 이 구조를 해석하는 엔진이 Docker Compose 하나에 종속되지
않는다는 점, 그리고 스펙 확장(예: GPU 리소스 예약, healthcheck 세부 옵션, 개발용 `develop.watch`
설정 등)이 특정 도구의 릴리스 주기가 아니라 스펙 저장소의 커뮤니티 논의를 거쳐 이뤄진다는 점입니다.

## Compose와 Bake의 연동: `docker compose build`의 내부 경로

Compose 파일에 여러 서비스가 각자의 `build` 블록을 가지고 있을 때, `docker compose build`는 이
서비스들을 어떤 순서와 방식으로 빌드할까요. 초기 Compose v2는 각 서비스를 순차적으로, 서비스별로 별도의
`docker build`(BuildKit) 호출을 통해 처리했습니다. 이후 Compose는 8~9장에서 다룬 **Bake**와 연동하는
경로를 추가했는데, 이는 Compose 파일의 `build` 설정들을 Bake의 타겟 정의로 변환한 뒤 `buildx bake`
호출 한 번으로 위임하는 방식입니다.

```bash
COMPOSE_BAKE=true docker compose build
```

`COMPOSE_BAKE=true`를 설정하면(또는 Compose 설정 파일에서 이를 기본값으로 지정하면) Compose는 내부적으로
서비스별 `build` 블록들을 하나의 Bake 그룹으로 묶어 `buildx bake`에 그대로 전달합니다. 이렇게 하면
서로 의존 관계가 없는 서비스들의 이미지가 병렬로 빌드되고, 여러 서비스가 같은 빌드 컨텍스트나 베이스
이미지를 공유할 때 컨텍스트 전송이 중복되지 않도록 최적화되며, 8장에서 설명한 BuildKit의 캐시 계산도
서비스 경계를 넘어 공유될 여지가 생깁니다. Compose 파일 자체가 Bake의 입력 포맷 중 하나로도 인정되기
때문에, 굳이 별도의 `docker-bake.hcl`을 새로 작성하지 않고 기존 `compose.yaml`을 그대로 `docker buildx
bake -f compose.yaml`로 실행하는 것도 가능합니다. 반대로 프로젝트가 이미 `docker-bake.hcl`을 CI
파이프라인에서 직접 쓰고 있다면, 로컬 개발 환경에서는 `docker compose up`으로 실행하면서 빌드 단계만
동일한 Bake 정의를 재사용하는 구성도 흔히 볼 수 있습니다.

```hcl
// docker-bake.hcl
group "default" {
  targets = ["web", "worker"]
}

target "web" {
  context    = "."
  dockerfile = "Dockerfile"
  tags       = ["myorg/web:latest"]
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "worker" {
  context    = "./worker"
  tags       = ["myorg/worker:latest"]
}
```

정리하면 Compose는 "여러 컨테이너를 어떻게 함께 띄울 것인가"를 정의하는 오케스트레이션 레이어이고,
Bake는 그중 "여러 이미지를 어떻게 함께, 효율적으로 빌드할 것인가"를 담당하는 빌드 레이어입니다. 두
도구가 같은 YAML/HCL 생태계 안에서 서로의 정의를 재사용할 수 있게 연결되어 있다는 점이 Docker 빌드·
오케스트레이션 툴체인이 지난 몇 년간 발전해 온 중요한 축 중 하나입니다.

## Moby 프로젝트: Docker라는 제품과 오픈소스 코드베이스의 분리

Compose, BuildKit, buildx, Docker CLI, Docker Engine이 어떻게 하나의 생태계로 묶여 있는지 이해하려면
2017년으로 거슬러 올라가야 합니다. 그해 DockerCon에서 Docker 사(당시 Docker Inc.)는 자사 오픈소스
코드베이스를 **Moby**라는 이름의 별도 프로젝트로 분리한다고 발표했습니다. 이는 단순한 리브랜딩이
아니라, "Docker"라는 이름을 상업 제품 브랜드로 남겨두고, 그 제품을 구성하던 오픈소스 컴포넌트들의
집합을 시스템 빌더를 위한 조립 키트로 재정의하는 구조적 결정이었습니다. GitHub의 `docker/docker`
저장소는 이때 `moby/moby`로 이름이 바뀌었고, 이후 "moby/moby"는 컨테이너 엔진을 구성하는 오픈소스
코드베이스를, "Docker"는 그 코드베이스(및 여러 다른 컴포넌트)를 가져다 만든 상업 제품·브랜드를
가리키는 이름으로 정리되었습니다. Solomon Hykes(당시 Docker 창업자 겸 CTO)는 이 관계를 "Moby가
Docker에 대해 갖는 위치는, Fedora가 Red Hat Enterprise Linux에 대해 갖는 위치와 같다"고 비유했습니다.
즉 Moby는 여러 컴포넌트를 자유롭게 조합해 자신만의 컨테이너 시스템을 만들고 싶은 개발자를 위한
업스트림 프로젝트이고, Docker Engine은 그 조합 중 하나를 Docker 사가 제품으로 패키징한 결과물입니다.

이 분리와 거의 같은 시기에, 원래 Docker Engine 안에 내장되어 있던 여러 핵심 컴포넌트들이 각각 독립된
프로젝트로 떨어져 나갔습니다.

| 컴포넌트 | 원래 위치 | 현재 위치 |
|---|---|---|
| containerd | dockerd 내부 실행 로직 | CNCF 졸업 프로젝트, 독립 저장소 `containerd/containerd` |
| runc | libcontainer(Docker 내부 라이브러리) | OCI 산하 레퍼런스 런타임, `opencontainers/runc` |
| BuildKit | 레거시 이미지 빌더 | 독립 프로젝트 `moby/buildkit`, Moby 생태계 소속으로 유지 |
| libnetwork | dockerd 내부 네트워킹 모듈 | 독립 저장소 `moby/libnetwork`(11장에서 다룰 CNM의 구현체) |

이 표에서 알 수 있듯 분리된 컴포넌트들의 거버넌스 종착점은 하나로 통일되어 있지 않습니다. containerd와
runc는 각각 CNCF와 OCI라는, Docker 사의 영향력 밖에 있는 중립적인 재단·표준화 기구 산하로 이관되어
멀티 벤더 거버넌스를 갖추게 된 반면, BuildKit과 libnetwork는 여전히 `moby` GitHub 조직 아래 남아
있습니다. 이 구조 덕분에 오늘날 containerd는 Docker Engine뿐 아니라 Kubernetes(kubelet이 CRI를 통해
직접 구동)나 nerdctl 같은 전혀 다른 상위 도구에서도 재사용되고, runc는 Docker Engine 계열이 아닌 다른
컨테이너 런타임 구현체들의 참조 구현으로 폭넓게 쓰이고 있습니다. 반대로 Docker Engine 입장에서는 자신이
직접 짜지 않은 외부 표준 컴포넌트(containerd, runc)와 자신이 계속 주도하는 컴포넌트(BuildKit, libnetwork)를
조합해 제품을 구성하는 모델이 자리 잡았습니다.

## 2026년 현재: moby/moby의 Go 모듈 재편

moby/moby 저장소는 오랫동안 단일한 대형 모놀리식 Go 모듈(`github.com/docker/docker`)로 유지되어
왔습니다. 이 구조는 데몬, API 타입, CLI 헬퍼, 내부 유틸리티가 하나의 모듈 그래프 안에 뒤섞여 있어,
저장소 규모가 커질수록 두 가지 문제를 낳았습니다. 하나는 외부 프로젝트가 `docker/docker`의 API 타입
패키지 하나만 가져다 쓰고 싶어도, 데몬 내부 구현까지 포함된 무거운 의존성 그래프 전체를 끌고 와야
했다는 점이고, 다른 하나는 모듈 내부 패키지 간 결합도가 높아 리팩터링이나 API 안정성 관리가 점점
어려워졌다는 점입니다.

2026년 현재 moby/moby는 이 문제를 해결하기 위해 Go 모듈 구조를 재편했습니다. 저장소의 루트 모듈
경로는 `github.com/moby/moby/v2`가 되었고, 기존 `github.com/docker/docker` 모듈 경로는 더 이상
갱신되지 않는 사실상의 종료(deprecated) 상태로 전환되었습니다. 다만 이 루트 모듈(`.../v2`) 자체는
데몬 바이너리를 빌드하기 위한 내부 구현체로 취급되며, 외부 프로젝트가 안정적으로 import해서 쓰도록
설계된 것이 아닙니다. 대신 외부에서 실제로 참조해야 할 대상은 별도로 분리된 두 모듈, 즉 Go 클라이언트
라이브러리인 `github.com/moby/moby/client`와 REST API의 공유 타입을 담은 `github.com/moby/moby/api`로
안내되고 있습니다. 이 재편의 실무적 의미는, 지금까지 관행적으로 `github.com/docker/docker/client`를
import해 온 서드파티 도구(CI 이미지 빌더, 빌드팩 구현체, 각종 Go 기반 오케스트레이션 도구 등)들이
장기적으로 새 모듈 경로로 옮겨가야 한다는 점입니다. 당장 기존 경로가 하루아침에 삭제되는 것은 아니지만,
신규 기능이나 버그 수정은 새 모듈 경로 기준으로만 이뤄지기 때문에, 의존성을 최신 상태로 유지해야 하는
프로젝트라면 마이그레이션 일정을 검토해 둘 필요가 있습니다.

같은 맥락에서 moby/moby는 실험적으로 **embedded-containerd** 기능도 제공하기 시작했습니다. 이는
containerd를 별도의 시스템 데몬(`containerd.service`)으로 구동하지 않고, dockerd 프로세스 내부에서
라이브러리 형태로 함께 구동하는 방식입니다. 배포·운영 관점에서 관리해야 할 데몬 프로세스 수를 줄일 수
있다는 장점이 있지만, 이 글을 쓰는 시점에는 아직 실험적 기능으로 표시되어 있으므로 프로덕션에 적용하기
전에는 해당 Docker Engine 릴리스 노트의 안정성 범위를 반드시 확인해야 합니다.

## Docker Desktop, Docker Engine, containerd, Kubernetes의 관계

이 장을 마무리하며, 지금까지 등장한 구성 요소들이 실제 운영 환경에서 서로 어떤 관계를 맺는지 한 번에
정리해 두는 것이 도움이 됩니다. 특히 "Kubernetes가 Docker를 쓴다/안 쓴다"는 표현은 5장에서 다룬
CRI(Container Runtime Interface) 구조를 모르면 오해하기 쉬운 지점입니다.

| 구성 요소 | 역할 | 상위 호출자 | 하위 의존 대상 |
|---|---|---|---|
| Docker Desktop | macOS/Windows에서 리눅스 VM을 띄우고 그 안에서 Docker Engine을 구동하는 애플리케이션 | 사용자(GUI/CLI) | Docker Engine(VM 내부) |
| Docker Engine(dockerd) | REST API, 이미지/네트워크/볼륨 관리, Compose·Bake 등 상위 UX 제공 | Docker CLI, Docker Desktop | containerd(libcontainerd 경유) |
| containerd | 이미지 pull/저장, 컨테이너 생명주기, snapshotter 관리 | dockerd, **또는** kubelet(CRI 경유), nerdctl | runc(또는 다른 OCI 런타임), containerd-shim |
| CRI-O | Kubernetes 전용으로 설계된 경량 CRI 구현체 | kubelet(CRI 경유) | runc(또는 다른 OCI 런타임) |
| kubelet | 노드에서 파드를 스케줄링·관리하는 Kubernetes 에이전트 | Kubernetes 컨트롤플레인 | containerd 또는 CRI-O(CRI를 통해서만) |

이 표에서 가장 중요한 점은 kubelet이 containerd를 호출하는 경로와 dockerd가 containerd를 호출하는
경로가 서로 다른, 병렬적인 두 개의 소비자라는 사실입니다. kubelet은 CRI라는 표준화된 gRPC 인터페이스를
통해 containerd(또는 CRI-O)에 직접 요청을 보내며, 이 경로 어디에도 dockerd나 Docker Engine의 REST
API가 끼어들지 않습니다. 한때 통용되던 "Kubernetes가 Docker를 제거했다"는 표현은 정확히는 "dockershim
(kubelet이 Docker Engine을 거쳐 containerd에 접근하도록 다리를 놓던 어댑터)이 제거되고, kubelet이
containerd/CRI-O에 CRI로 직접 연결하는 구조로 단순화됐다"는 의미입니다. Docker Engine 자체가 사라진
것이 아니라, Kubernetes 노드의 컨테이너 실행 경로에서 더 이상 필수 구성 요소가 아니게 된 것입니다.
반대로 로컬 개발자 워크스테이션에서 `docker run`, `docker compose up`을 쓸 때는 여전히 dockerd가
containerd를 거쳐 컨테이너를 띄우는 이 장 전체에서 다룬 경로를 그대로 따릅니다. 즉 같은 containerd
바이너리가 서버 위에서 "Docker Engine의 실행 백엔드"로 쓰이기도 하고, 완전히 별도의 Kubernetes 노드
위에서 "kubelet의 실행 백엔드"로 쓰이기도 하는 것이며, 두 역할 사이에는 직접적인 호출 관계가 없습니다.

Docker Desktop은 이 그림에 한 겹을 더 얹습니다. macOS나 Windows에는 리눅스 네이티브 네임스페이스·
cgroup이 없으므로, Docker Desktop은 경량 리눅스 VM을 하나 띄우고 그 안에서 통상적인 Docker
Engine(dockerd + containerd + runc)을 그대로 구동합니다. 사용자가 로컬 터미널에서 입력하는 `docker`
CLI 명령은 이 VM 내부의 dockerd로 전달되어 처리됩니다. 이 책 전체가 리눅스 네이티브 환경을 전제로
설명을 진행하는 이유도 여기에 있습니다. Docker Desktop의 VM 계층 자체는 이 책이 다루는 커널 수준
격리·네트워킹 메커니즘의 핵심 논의 대상이 아니며, VM 내부에서는 리눅스 호스트와 동일한 원리가
적용됩니다.

## 핵심 요약

- Docker Compose는 Python 독립 실행 파일(v1, `docker-compose`)에서 Go로 재작성된 Docker CLI
  플러그인(v2, `docker compose`)으로 전환되었다. 이 전환으로 Compose는 BuildKit 클라이언트 등
  Docker 생태계의 다른 Go 라이브러리를 직접 재사용할 수 있게 됐다.
- Compose 파일 포맷은 Docker 전용 사양이 아니라 `compose-spec` 조직이 관리하는 **Compose
  Specification**이라는 오픈 스펙으로 독립했다. `version` 필드는 사실상 폐지되었고, Podman·nerdctl·
  kompose 등 여러 도구가 이 스펙을 구현한다. 다만 OCI/CNCF 공식 산하 프로젝트는 아니다.
- `docker compose build`는 `COMPOSE_BAKE=true` 설정 시 서비스별 build 블록을 Bake 타겟으로 변환해
  `buildx bake`에 위임하며, 이를 통해 여러 서비스 이미지를 병렬 빌드하고 컨텍스트 중복을 줄인다.
- Moby 프로젝트는 2017년 Docker 사가 자사 오픈소스 코드베이스(`docker/docker` → `moby/moby`)를
  상업 제품 "Docker"와 분리하며 만든 시스템 조립 키트다. 이 과정에서 containerd(CNCF), runc(OCI)는
  중립 거버넌스 기구로 이관되었고, BuildKit·libnetwork는 여전히 moby 조직 아래 남아 있다.
- 2026년 현재 moby/moby는 대형 모놀리식 모듈 문제를 해결하기 위해 루트 모듈 경로를
  `github.com/moby/moby/v2`로 재편했다. 외부 프로젝트는 루트 모듈이 아니라 `.../client`,
  `.../api` 모듈을 참조해야 하며, 기존 `github.com/docker/docker` 경로는 더 이상 갱신되지 않는다.
- kubelet은 CRI를 통해 containerd/CRI-O를 dockerd 없이 직접 호출한다. Docker Engine과 Kubernetes는
  같은 containerd 바이너리를 각자 독립적으로 소비하는 두 개의 병렬 경로일 뿐, 한쪽이 다른 쪽을
  경유하지 않는다. Docker Desktop은 이 전체 스택을 macOS/Windows의 리눅스 VM 안에 구동하는
  래퍼 계층이다.

## 실습

**1. Compose Specification 파일로 버전 필드 없이 다중 서비스 실행하기**

```yaml
# compose.yaml
services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
  cache:
    image: redis:7
```

```bash
docker compose up -d
docker compose ps
docker inspect --format '{{.Config.Labels}}' $(docker compose ps -q web)
```

`version` 필드 없이도 정상적으로 파싱·실행되는지 확인하고, `docker inspect`로 컴포즈가 각 컨테이너에
붙이는 `com.docker.compose.project`, `com.docker.compose.service` 등의 라벨을 확인해, Compose가
내부적으로 프로젝트/서비스 단위를 어떻게 식별하는지 살펴봅니다.

**2. Bake 연동 빌드 경로 비교**

```bash
# 기본 경로
time docker compose build

# Bake 경로
COMPOSE_BAKE=true time docker compose build
```

두 방식의 빌드 로그 구조 차이(서비스별 순차 출력 vs Bake의 병렬 타겟 출력)를 비교합니다. 이어서
`docker buildx bake -f compose.yaml --print`로 Compose 파일이 어떤 Bake 타겟 정의로 변환되는지
JSON 형태로 직접 확인해 봅니다.

**3. CRI 경로와 Docker 경로의 독립성 확인(쿠버네티스 환경 필요)**

containerd가 설치된 노드에서, Docker Engine을 거치지 않고 `ctr`(containerd 자체 CLI)로 컨테이너를
직접 띄운 뒤, 같은 노드에서 `docker ps`로 조회했을 때 나타나지 않는 것을 확인합니다.

```bash
sudo ctr images pull docker.io/library/nginx:1.27
sudo ctr run -d docker.io/library/nginx:1.27 cri-demo
sudo ctr containers list
docker ps   # ctr로 띄운 컨테이너는 보이지 않아야 정상
```

이 실습은 containerd가 dockerd의 하위 구성 요소가 아니라, dockerd와 `ctr`(혹은 kubelet)이 각각
독립적으로 접근하는 공용 런타임이라는 점을 직접 확인하기 위한 것입니다. 정리가 끝나면
`sudo ctr containers rm cri-demo`로 컨테이너를 제거합니다.
