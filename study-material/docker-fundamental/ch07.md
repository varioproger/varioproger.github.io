---
title: "7장. Docker Engine API와 CLI — dockerd 데몬의 내부 동작"
---

# 7장. Docker Engine API와 CLI — dockerd 데몬의 내부 동작

1부에서는 `dockerd`가 containerd에게 컨테이너 실행을 위임하고, containerd가 다시 shim v2를 통해 runc를 호출하는
전체 실행 경로를 살펴보았습니다. 이 장부터 시작하는 2부는 그 실행 경로의 "입구"로 돌아갑니다. 사용자가
터미널에 `docker run nginx`를 입력했을 때, 그 명령이 어떤 경로를 거쳐 1부에서 다룬 containerd 아키텍처에
도달하는지를 추적합니다. `docker` CLI는 사실 컨테이너를 실행하는 도구가 아니라, dockerd라는 데몬에게 "이런
컨테이너를 만들어 달라"고 요청하는 REST API 클라이언트일 뿐이라는 사실에서 출발합니다.

## `docker` CLI는 REST API 클라이언트일 뿐이다

많은 사람이 `docker`라는 단일 바이너리가 이미지를 내려받고, 레이어를 조합하고, 네임스페이스를 만들고,
프로세스를 실행하는 모든 일을 직접 한다고 오해합니다. 실제로는 그렇지 않습니다. `docker` CLI가 하는 일은
사용자가 입력한 명령을 HTTP 요청으로 직렬화해서 dockerd에게 보내고, 응답을 사람이 읽기 좋은 형태로
출력하는 것뿐입니다. 실제 이미지 다운로드, 레이어 조립, 네임스페이스 생성, 프로세스 실행은 전부 dockerd와
그 하위의 containerd, runc가 수행합니다.

이 사실은 단순한 트리비아가 아닙니다. 이를 이해하면 다음과 같은 것들이 자연스럽게 설명됩니다.

- 왜 `docker` 명령을 실행하는 사용자에게 dockerd 소켓에 대한 접근 권한(대개 `docker` 그룹 소속)이 필요한가
- 왜 원격 Docker 호스트를 다룰 때 `DOCKER_HOST` 환경 변수 하나만 바꾸면 되는가
- 왜 Docker Desktop, Portainer, Lazydocker, VS Code Docker 확장 같은 서드파티 도구들이 `docker` CLI 없이도
  컨테이너를 제어할 수 있는가 — 이들은 모두 같은 REST API를 직접 호출합니다

`docker` CLI와 dockerd 사이의 통신은 기본적으로 유닉스 도메인 소켓 `/var/run/docker.sock`(대개
`/run/docker.sock`의 심볼릭 링크)을 통해 이루어집니다. 이 소켓 파일에 HTTP 프로토콜을 얹어서 통신하는데,
TCP 포트를 쓰는 일반적인 HTTP 서버와 다른 점은 네트워크 소켓 대신 파일 시스템 상의 소켓 파일을 엔드포인트로
사용한다는 것뿐입니다. 소켓 파일이기 때문에 리눅스의 표준 파일 권한(owner, group, mode)으로 접근을
통제할 수 있고, 이것이 바로 "root 권한 없이 docker 명령을 쓰려면 사용자를 docker 그룹에 추가하라"는
관행의 근거입니다. 이 그룹에 속한다는 것은 사실상 소켓을 통해 dockerd에 임의의 API 호출을 보낼 수 있다는
뜻이고, dockerd는 root 권한으로 동작하므로(rootless 모드는 예외이며 17장에서 다룹니다) 이는 사실상 root
권한을 위임하는 것과 다르지 않습니다.

이 구조를 직접 눈으로 확인하는 가장 좋은 방법은 `docker` CLI를 거치지 않고 `curl`로 같은 소켓에 직접
요청을 보내보는 것입니다.

```bash
# 데몬 버전 정보를 REST API로 직접 조회
curl --unix-socket /var/run/docker.sock http://localhost/version

# 실행 중인 컨테이너 목록을 REST API로 직접 조회 (docker ps와 동일한 정보원)
curl --unix-socket /var/run/docker.sock http://localhost/containers/json

# 특정 API 버전을 명시해서 호출 (버전 협상은 뒤에서 다룹니다)
curl --unix-socket /var/run/docker.sock http://localhost/v1.51/info
```

`curl`의 `--unix-socket` 옵션은 TCP 연결 대신 지정한 유닉스 소켓 파일로 연결하되, HTTP 요청 자체는
평범하게 보냅니다. 요청 URL의 호스트명(`localhost`)은 실제로는 아무 의미가 없고, 유닉스 소켓 위에서
HTTP 프로토콜의 형식을 지키기 위한 자리채움일 뿐입니다. `docker ps`, `docker inspect`, `docker logs`
같은 명령을 실행하면서 동시에 `strace -f -e trace=network,connect -p $(pgrep -x dockerd)` 등으로
관찰해보면, 실제로 CLI 프로세스가 이 소켓에 연결해서 JSON 요청/응답을 주고받는 모습을 볼 수 있습니다.
CLI 쪽에서 더 간단히 확인하려면 `docker --log-level=debug` 형태로 클라이언트 로그 레벨을 올리는 방법도
있지만, dockerd와의 통신 자체를 가장 명확히 보여주는 것은 결국 `curl --unix-socket`으로 같은 요청을
재현해보는 것입니다.

Docker Desktop 환경이나 Docker Engine을 원격 호스트로 사용하는 설정에서는 `DOCKER_HOST` 환경 변수나
`docker context`로 엔드포인트를 `tcp://`, `ssh://`, 혹은 Windows의 `npipe://` 형태로 바꿀 수 있습니다.
CLI 입장에서 이는 그저 "다른 소켓/엔드포인트에 같은 REST API 요청을 보낸다"는 것 이상의 의미가 없습니다.
즉 `docker` CLI의 역할은 처음부터 끝까지 "요청을 만들고 보내고, 응답을 예쁘게 출력하는" 것으로 일관되어
있습니다.

## dockerd 내부 계층 구조 — API에서 containerd gRPC까지

`docker run`이 소켓을 거쳐 dockerd에 도달한 뒤에는 다음과 같은 계층을 순서대로 통과합니다.

```
docker CLI
   │  (HTTP 요청, /var/run/docker.sock)
   ▼
API 서버 (api/server)
   │  요청 파싱, 인증/인가 훅, 버전 협상
   ▼
라우터 / 핸들러 (router)
   │  URL 경로 → 핸들러 함수 매핑 (containers, images, networks, volumes …)
   ▼
daemon 패키지
   │  비즈니스 로직: 컨테이너 상태 머신, 이미지 참조 해석, 볼륨/네트워크 연결
   ▼
libcontainerd (containerd 클라이언트 래퍼)
   │  containerd의 태스크/컨테이너 개념으로 변환
   ▼
containerd gRPC API
   │  (1부 5장에서 다룬 containerd 아키텍처, shim v2)
   ▼
containerd-shim-runc-v2 → runc → 컨테이너 프로세스
```

가장 바깥쪽의 API 서버 계층은 들어온 HTTP 요청을 파싱하고, 필요하다면 인증/인가 미들웨어(예: 인가 플러그인,
audit 로깅 훅)를 거치게 한 뒤, 요청 URL 경로와 메서드를 기준으로 적절한 라우터로 넘깁니다. 라우터는
`/containers/create`, `/images/{name}/json`, `/networks/{id}/connect`처럼 리소스 종류별로 나뉘어 있고,
각 라우터는 실제 처리를 담당하는 핸들러 함수를 호출합니다. 이 구조는 일반적인 REST 프레임워크의 구조와
크게 다르지 않습니다.

핸들러 아래에 있는 `daemon` 패키지가 사실상 dockerd의 두뇌 역할을 합니다. 컨테이너의 생성부터 시작·정지·
삭제까지 이어지는 상태 머신을 관리하고, 이미지 이름을 실제 콘텐츠 주소(digest)로 해석하며, 볼륨과 네트워크를
컨테이너에 연결하는 등 Docker가 사용자에게 제공하는 대부분의 "편의 기능"이 이 계층에 들어 있습니다.
containerd 자체는 이런 고수준 개념을 전혀 모릅니다. containerd가 아는 것은 이미지, 컨테이너, 태스크,
스냅샷 같은 비교적 저수준의 원시 개념뿐이고, "포트를 게시한다", "이 네트워크에 연결한다", "이 볼륨을
마운트한다" 같은 Docker 특유의 상위 개념은 daemon 패키지가 조립해서 containerd가 이해할 수 있는 요청으로
변환해줍니다.

이 변환을 실제로 수행하는 얇은 계층이 `libcontainerd`입니다. `libcontainerd`는 이름 그대로 containerd를
위한 클라이언트 라이브러리 역할을 하며, dockerd의 내부 자료구조를 containerd의 gRPC API 호출(이미지 풀,
컨테이너 생성, 태스크 시작 등)로 번역합니다. 여기서부터는 1부 5장에서 다룬 containerd의 세계입니다.
containerd는 요청받은 태스크를 shim v2 프로토콜에 따라 `containerd-shim-runc-v2`에 위임하고, shim이
runc를 호출해 실제 네임스페이스·cgroup이 적용된 프로세스를 만들어냅니다. 즉 dockerd 내부에서 일어나는
일은 결국 "REST API 요청을 containerd gRPC 요청으로 재번역하는 것"이라고 요약할 수 있습니다.

이 구조를 알고 나면 흔히 제기되는 질문, "dockerd 없이 containerd만으로 컨테이너를 실행할 수 있는가"에
대한 답도 명확해집니다. 가능합니다. `ctr`이나 `nerdctl` 같은 도구는 dockerd를 거치지 않고 containerd에
직접 요청을 보냅니다. 다만 이 경우 포트 게시, 사용자 정의 브리지 네트워크, 볼륨 드라이버, 레거시
`docker-compose` 호환성처럼 dockerd의 daemon 패키지가 제공하던 편의 기능들은 별도로 구현해주어야 합니다.
(nerdctl은 이런 기능 상당수를 containerd 위에 다시 구현해 Docker CLI와 유사한 사용자 경험을 제공합니다.)

> **참고 — moby/moby의 Go 모듈 재편**
> Docker Engine의 오픈소스 구현체인 moby/moby 프로젝트는 오랫동안 `github.com/docker/docker`라는 모듈
> 경로를 사용해왔지만, Docker Engine 29 계열로 오면서 `github.com/moby/moby/v2`로 정식 모듈 경로가
> 재편되었습니다. `api/`, `client/`, `daemon/`, `cmd/` 같은 최상위 디렉터리 구조 자체는 유지되지만, 내부
> 패키지 경로나 import 문을 오래된 블로그 글/스택오버플로 답변에서 참고할 때는 이 모듈 경로 변경을
> 염두에 두어야 합니다. 이 책에서 소스코드 경로를 언급할 때는 어디까지나 "대략 이런 계층에 있다"는
> 개념적인 위치를 가리키는 것이며, 정확한 파일 경로는 버전에 따라 달라질 수 있습니다.

## API 버전 관리와 버전 협상

Docker Engine API는 도입 이후 계속 변경되어 왔고, 그 변경 이력을 관리하기 위해 URL 경로에 버전을 명시하는
방식을 씁니다. 예를 들어 `/v1.51/containers/json`처럼 API 버전이 경로의 일부로 들어갑니다. 문제는 클라이언트
(CLI든 SDK든)와 서버(dockerd)가 서로 다른 버전을 지원할 수 있다는 점인데, Docker는 이를 **버전 협상
(API version negotiation)**으로 해결합니다.

클라이언트가 명시적으로 버전을 고정하지 않으면, 클라이언트와 서버가 공통으로 지원하는 API 버전 중 가장
높은 버전으로 자동으로 맞춰집니다. 서버가 클라이언트보다 최신이면 서버가 지원하는 버전 중 클라이언트가
아는 최고 버전으로 낮춰서 통신하고, 반대로 서버가 더 오래된 버전이라면 클라이언트가 서버 수준에 맞춰
내려갑니다. 이 협상 덕분에 몇 년 전에 만들어진 오래된 CLI 바이너리로도 최신 dockerd와 (신기능은 못
쓰더라도) 기본적인 통신은 계속 가능하고, 반대로 최신 CLI로 다소 오래된 dockerd에 접속해도 크래시 없이
동작할 수 있습니다. 다만 공식 문서에서도 이 하위 호환성은 "best effort"로 명시하고 있으므로, 버전 차이가
너무 크면 신기능 관련 필드가 비어 있거나 일부 엔드포인트가 404를 반환할 수 있습니다.

`docker version` 명령으로 클라이언트와 서버 양쪽의 API 버전을 직접 확인할 수 있습니다.

```bash
docker version
```

출력에는 `Client`와 `Server` 섹션이 각각 있고, 그 안에 `API version` 필드가 존재합니다. 서버 쪽에는
추가로 최소 지원 버전(`Minimum API version` 또는 이에 준하는 표기)이 함께 표시되어, 이 데몬이 얼마나
오래된 클라이언트까지 받아줄 수 있는지를 보여줍니다.

버전 협상을 끄고 특정 API 버전을 강제로 쓰고 싶다면 `DOCKER_API_VERSION` 환경 변수를 설정하면 됩니다.

```bash
DOCKER_API_VERSION=1.43 docker info
```

이렇게 하면 클라이언트는 자동 협상을 하지 않고 지정한 버전으로만 요청을 보냅니다. 이는 주로 디버깅
목적이나, 여러 버전의 dockerd가 혼재된 환경에서 스크립트의 동작을 고정하고 싶을 때 사용합니다. 반대로
일반적인 운영 환경에서는 협상 로직에 맡겨두는 편이 버전 업그레이드에 따른 마찰을 줄여줍니다.

이 버전 관리 정책의 실무적 함의는 명확합니다. dockerd를 업그레이드해도 API 버전은 이전 버전을 계속
지원하도록 설계되어 있기 때문에, CI 파이프라인이나 오케스트레이션 도구가 특정 SDK 버전에 고정되어 있다는
이유만으로 데몬 업그레이드를 미룰 필요는 일반적으로 없습니다. 다만 아주 오래된 API 버전에 의존하는
레거시 자동화가 있다면, 메이저 업그레이드 전에 `docker version`으로 최소 지원 버전과 실제 사용 중인
API 버전 사이에 간극이 없는지 점검하는 것이 안전합니다.

## daemon.json — 데몬 설정과 재시작 시의 동작

dockerd의 동작 방식은 커맨드라인 플래그(`dockerd --host=...`)로도 바꿀 수 있지만, 실무에서는 대부분
`/etc/docker/daemon.json` 설정 파일을 통해 관리합니다. JSON 형식의 이 파일은 dockerd가 시작될 때 읽어
들이며, 커맨드라인 플래그와 겹치는 항목이 있으면 충돌을 일으키므로 두 방식을 섞어 쓰지 않는 것이
권장됩니다. 자주 쓰이는 항목들을 정리하면 다음과 같습니다.

| 키 | 역할 |
|---|---|
| `hosts` | dockerd가 요청을 받을 엔드포인트 목록 (`unix://`, `tcp://`, Windows에서는 `npipe://`) |
| `log-level` | 데몬 자체 로그의 상세도(`debug`, `info`, `warn`, `error`, `fatal`) |
| `log-driver` / `log-opts` | 컨테이너 로그의 기본 드라이버(`json-file`, `journald`, `local` 등)와 옵션 |
| `storage-driver` | 이미지/컨테이너 스토리지 드라이버(`overlay2` 등, 6장 참고) |
| `insecure-registries` | TLS 검증 없이 접근을 허용할 레지스트리 주소 목록 |
| `registry-mirrors` | Docker Hub 등에 대한 미러 레지스트리 목록 |
| `default-address-pools` | 사용자 정의 브리지/오버레이 네트워크에 할당할 IP 대역 풀 |
| `exec-opts` | 실행 관련 옵션(예: `native.cgroupdriver=systemd`) |
| `default-runtime` | 컨테이너 생성 시 기본으로 사용할 OCI 런타임(기본값 `runc`) |
| `features` | `containerd-snapshotter`, `cdi` 등 옵트인 기능 플래그 |
| `live-restore` | 데몬 재시작 중에도 실행 중인 컨테이너를 계속 살려둘지 여부 |
| `tls`, `tlscert`, `tlskey`, `tlscacert` | TCP 소켓 노출 시 TLS 상호 인증 설정 |

설정 파일을 수정한 뒤에는 dockerd를 재시작해야 반영됩니다. systemd 환경이라면 다음과 같이 처리합니다.

```bash
sudo systemctl restart docker
```

여기서 실무적으로 가장 중요한 질문이 나옵니다. dockerd를 재시작하면 지금 실행 중인 컨테이너들도 함께
죽는 것 아닌가 하는 걱정입니다. 답은 "아니요"이며, 그 이유는 1부에서 다룬 shim v2 구조에 있습니다.
컨테이너의 실제 프로세스를 쥐고 있는 것은 dockerd가 아니라 `containerd-shim-runc-v2` 프로세스입니다.
shim은 containerd의 자식으로 뜨지만 컨테이너 프로세스와 함께 독립적으로 생존하도록 설계되어 있고,
dockerd나 containerd가 재시작되는 동안에도 자신이 관리하는 컨테이너 프로세스를 계속 유지합니다. dockerd가
다시 살아나면 containerd에 다시 연결해서 현재 실행 중인 태스크 목록을 조회하고, 자신의 내부 상태(컨테이너
메타데이터, 네트워크 연결 정보 등)를 그 목록과 맞춰 복원합니다. 즉 재시작으로 사라지는 것은 dockerd의
메모리 상의 상태와 API 소켓 연결뿐이고, 실제 컨테이너 프로세스와 그 자식인 shim은 살아남습니다.

`live-restore`는 이 복원 과정을 한 단계 더 명시적으로 만들어주는 옵션입니다. 이 옵션을 켜두면 dockerd가
정상적으로 종료될 때 실행 중인 컨테이너를 멈추지 않고 그대로 둔 채 종료하며, 재시작 후에는 containerd에
남아 있는 태스크 목록을 기준으로 컨테이너 상태를 다시 구성합니다. 이 옵션이 꺼져 있어도 위에서 설명한
shim 기반의 생존 메커니즘 자체는 여전히 동작하지만(즉 예기치 않은 크래시에도 어느 정도 보호되지만),
`live-restore`를 켜두면 "데몬을 내리고 새 버전으로 올리는" 계획된 업그레이드 시나리오에서 컨테이너
중단을 더 확실하게 방지할 수 있습니다. 운영 환경에서 무중단 dockerd 업그레이드를 고려한다면 이 옵션을
활성화해두는 것이 일반적으로 권장됩니다.

소켓 자체의 재연결도 짚어볼 필요가 있습니다. dockerd가 재시작되면 `/var/run/docker.sock` 파일은 새
프로세스에 의해 다시 생성되고, 그 시점까지 대기하던 클라이언트 요청은 연결 거부(connection refused)를
받게 됩니다. 이는 CLI를 쓰는 사람에게는 몇 초의 "Docker 데몬이 응답하지 않습니다" 같은 오류로 나타나지만,
실행 중이던 컨테이너의 애플리케이션 트래픽에는 영향을 주지 않습니다. 컨테이너의 관점에서 dockerd 재시작은
"관리자가 자리를 비운 것"이지 "건물이 무너진 것"이 아닙니다.

## 소켓을 TCP로 노출할 때의 보안 고려사항

기본 설정에서 dockerd는 로컬 유닉스 소켓으로만 요청을 받기 때문에, 그 호스트에 로그인할 수 있고 소켓
권한이 있는 사용자만 API를 호출할 수 있습니다. 그런데 원격에서 Docker Engine을 제어하고 싶다는 이유로
`daemon.json`의 `hosts`에 `tcp://0.0.0.0:2375`처럼 TCP 엔드포인트를 추가하는 경우가 있습니다. 이 설정은
반드시 신중하게 다루어야 합니다.

TCP로 노출된 Docker API에 인증 메커니즘이 전혀 없다면, 그 포트에 네트워크로 접근할 수 있는 누구든지
dockerd에 임의의 명령을 내릴 수 있습니다. 앞서 설명했듯 dockerd에 대한 API 호출 권한은 사실상 해당
호스트에서의 root 권한과 동급입니다. 컨테이너를 호스트의 루트 파일시스템을 통째로 바인드 마운트한 상태로
띄우고 그 안에서 셸을 실행하는 것만으로도 호스트 전체를 장악할 수 있기 때문입니다. 실제로 인터넷에
`2375` 포트가 인증 없이 열린 Docker 호스트를 스캔해서 암호화폐 채굴 컨테이너를 심는 자동화된 공격이
오랫동안 반복적으로 관측되어 왔습니다. 이런 이유로 공식 문서와 커뮤니티 모두 "TLS 클라이언트 인증서
검증 없이 TCP 소켓을 외부에 노출하지 말라"는 점을 강하게 권고합니다.

TCP로 노출이 꼭 필요하다면 다음 원칙을 지켜야 합니다.

- `tlsverify`를 활성화하고 `tlscacert`, `tlscert`, `tlskey`를 설정해 상호 TLS 인증(mTLS)을 강제할 것.
  서버 인증서만 확인하는 일반적인 HTTPS 수준이 아니라, 클라이언트 인증서까지 검증해야 임의의 접속자가
  API를 호출하지 못합니다.
- 포트를 `0.0.0.0`이 아니라 필요한 네트워크 인터페이스나 VPN 대역으로 한정하고, 방화벽/보안 그룹으로
  추가 제한을 둘 것.
- 가능하다면 TCP 노출 자체를 피하고, `ssh://` 컨텍스트나 SSH 터널을 통해 유닉스 소켓에 접근하는 방식을
  우선 검토할 것. 이 경우 인증과 전송 암호화를 SSH의 기존 키 기반 체계에 그대로 위임할 수 있습니다.

정리하면, Docker Engine API는 편의성과 강력함을 함께 제공하는 만큼 접근 통제의 무게중심도 그만큼
무겁습니다. 유닉스 소켓의 파일 권한이든 TCP의 mTLS든, "이 API를 호출할 수 있는 사람 = 이 호스트의
root"라는 등식을 항상 염두에 두고 접근 범위를 설계해야 합니다.

## 핵심 요약

- `docker` CLI는 컨테이너를 직접 실행하지 않는다. 사용자의 명령을 REST API 요청으로 바꿔 dockerd에게
  보내고, 응답을 사람이 읽기 좋은 형태로 보여주는 클라이언트일 뿐이다.
- 기본 통신 경로는 유닉스 소켓 `/var/run/docker.sock`이며, `curl --unix-socket`으로 CLI 없이도 같은
  API를 직접 호출해볼 수 있다.
- dockerd 내부는 API 서버 → 라우터/핸들러 → daemon 패키지 → libcontainerd → containerd gRPC의 계층을
  거치며, daemon 패키지가 Docker 고유의 상위 개념(네트워크, 볼륨, 포트 게시 등)을 containerd가 이해하는
  저수준 개념으로 변환하는 역할을 한다.
- API는 URL 경로에 버전을 명시하며, 클라이언트-서버 간 공통 지원 버전으로 자동 협상된다. `docker version`
  으로 양쪽의 API 버전을 확인할 수 있고, `DOCKER_API_VERSION`으로 협상을 우회해 특정 버전을 강제할 수
  있다.
- `daemon.json`으로 데몬 동작을 설정하며, 재시작 후에도 실행 중이던 컨테이너가 살아남는 것은 containerd
  shim이 컨테이너 프로세스를 독립적으로 유지하기 때문이다. `live-restore`는 이 생존을 계획된 업그레이드
  시나리오에서 더 확실하게 보장해주는 옵션이다.
- 인증 없이 TCP로 Docker API 소켓을 노출하는 것은 해당 호스트의 root 권한을 그대로 내주는 것과 같다.
  TCP 노출이 필요하면 반드시 mTLS로 클라이언트 인증서를 검증해야 한다.

## 실습

아래 실습은 root 권한(또는 `docker` 그룹 소속 사용자) 및 `curl`이 설치된 리눅스 환경을 전제로 합니다.

```bash
# 1. docker 소켓에 curl로 직접 접속해서 버전 정보를 REST API로 조회한다.
#    docker version의 Server 섹션과 동일한 정보가 JSON으로 나오는지 확인한다.
curl --unix-socket /var/run/docker.sock http://localhost/version

# 2. 컨테이너를 하나 띄운 뒤, docker ps 대신 REST API로 목록을 직접 조회해본다.
docker run -d --name curl-demo nginx:alpine
curl --unix-socket /var/run/docker.sock http://localhost/containers/json | grep -o '"Names":\[[^]]*\]'
# 기대 결과: "/curl-demo" 라는 이름이 JSON 배열 안에 나타난다.

# 3. 클라이언트/서버 API 버전을 확인하고, 협상을 강제로 낮춰본다.
docker version | grep -A2 "API version"
DOCKER_API_VERSION=1.43 docker info > /dev/null && echo "1.43으로 통신 성공"

# 4. dockerd를 재시작하는 동안 컨테이너가 죽지 않는지 확인한다.
docker exec curl-demo sh -c 'while true; do date; sleep 1; done' > /tmp/heartbeat.log 2>&1 &
sudo systemctl restart docker
sleep 3
docker ps --filter name=curl-demo
# 기대 결과: 재시작 이후에도 curl-demo 컨테이너가 Up 상태로 남아 있다.
# (docker exec로 붙인 프로세스 자체는 dockerd 재시작 시 끊길 수 있으나, 컨테이너 본체는 유지된다.)

# 5. daemon.json에서 데몬 로그 레벨을 debug로 바꾸고 재시작 후 반영을 확인한다.
sudo mkdir -p /etc/docker
echo '{"log-level": "debug"}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
sudo journalctl -u docker --since "1 min ago" | grep -i level=debug | head -n 3
# 기대 결과: debug 레벨 로그 라인이 출력된다.

# 6. 정리
docker rm -f curl-demo
```

다음 8장에서는 이 REST API 경로 중에서도 이미지를 만드는 쪽, 즉 `docker build` 요청이 dockerd를 거쳐
BuildKit에 도달한 이후에 벌어지는 일 — LLB, 프론트엔드, 솔버, 캐시로 이어지는 빌드 프레임워크의 내부
구조를 다룹니다.
