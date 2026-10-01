---
title: "11장. libnetwork과 CNM(Container Network Model)"
---

# 11장. libnetwork과 CNM(Container Network Model)

지금까지 1부와 2부에서는 컨테이너 하나를 어떻게 격리하고(네임스페이스, cgroups), 어떤 표준으로 실행하고(OCI),
어떻게 이미지를 빌드하는지를 다뤘습니다. 이제부터 3부에서는 그렇게 만들어진 컨테이너들이 서로, 그리고
외부 세계와 어떻게 통신하는지를 다룹니다. 그 출발점은 Docker의 네트워킹 로직이 실제로 어디에 구현되어
있고, 어떤 모델을 따르는가 하는 질문입니다. 2장에서 살펴본 네트워크 네임스페이스는 컨테이너 하나를 격리된
네트워크 스택 안에 가두는 커널 메커니즘이었습니다. 이 장에서는 그 격리된 스택들을 서로 연결하는 상위
계층, 즉 libnetwork과 CNM(Container Network Model)을 다룹니다. 12장부터 14장까지 이어지는 브리지,
오버레이, macvlan/ipvlan 각 드라이버의 구체적인 동작은 결국 이 장에서 설명하는 하나의 공통 모델 위에서
서로 다른 방식으로 구현된 것이므로, 개별 드라이버로 들어가기 전에 이 모델 자체를 먼저 이해해 두는 것이
전체 3부를 읽는 데 필요한 지도가 됩니다.

## 11.1 네트워킹이 dockerd 코어에서 분리된 이유

Docker 초기 버전에서 컨테이너 네트워킹은 dockerd 내부에 하드코딩에 가까운 형태로 박혀 있었습니다.
브리지를 만들고, veth pair를 꽂고, iptables 규칙을 넣는 로직이 모두 dockerd의 코드베이스 한가운데
자리잡고 있었고, 네트워크 드라이버를 바꾸거나 새로운 드라이버를 추가하려면 dockerd 자체를 수정해야
했습니다. 이 구조는 두 가지 방향에서 한계에 부딪혔습니다.

첫째, Docker가 단일 호스트를 넘어 여러 호스트에 걸친 컨테이너 클러스터(훗날의 Swarm 모드)를 지원하려는
순간, 브리지 하나만으로는 해결되지 않는 문제가 나타났습니다. 서로 다른 호스트의 컨테이너들이 마치 같은
L2 네트워크에 있는 것처럼 통신하려면 오버레이 네트워크 같은 전혀 다른 구현이 필요했고, 새 구현을 추가할
때마다 dockerd 코어를 건드려야 한다면 유지보수가 감당하기 어려워질 것이 분명했습니다. 둘째, 클라우드
벤더나 SDN(Software-Defined Networking) 벤더들이 자신들의 네트워크 솔루션을 Docker와 통합하고 싶어
했는데, dockerd 코드베이스를 직접 수정해서 병합해야만 통합이 가능한 구조는 생태계 확장에 부적합했습니다.

이 문제를 해결하기 위해 Docker는 네트워킹 로직 전체를 dockerd 코어에서 뽑아내 `libnetwork`이라는 독립된
Go 라이브러리로 분리했습니다. libnetwork은 네트워킹의 "정책과 모델"을 정의하는 상위 계층이고, 실제로
패킷을 어떻게 스위칭하고 라우팅할지는 드라이버라는 플러그형(pluggable) 구현체에 위임합니다. 이 분리
덕분에 브리지, 오버레이, macvlan 같은 드라이버들을 플러그인처럼 추가하거나 교체할 수 있는 구조가
만들어졌습니다. 이 장에서 다루는 CNM은 바로 이 libnetwork이 내부적으로 따르는 설계 규약입니다.

다만 libnetwork은 dockerd와 물리적으로 별도 프로세스나 별도 데몬으로 동작하지는 않습니다. containerd
처럼 gRPC로 통신하는 독립 데몬이 아니라, dockerd 프로세스 안에 링크되어 동작하는 Go 라이브러리입니다.
1장에서 정리했던 프로세스 분리(dockerd/containerd/shim/runc)가 "컨테이너 실행" 경로의 분리였다면,
libnetwork의 분리는 성격이 다른 "코드 모듈"의 분리입니다. dockerd가 `docker network create` 요청을
REST API로 받으면, 요청을 처리하는 주체는 여전히 dockerd 프로세스이지만 실제 로직은 libnetwork
패키지의 API 호출로 위임됩니다.

## 11.2 CNM의 3대 구성요소

CNM은 컨테이너 네트워킹을 세 가지 핵심 객체로 추상화합니다. Sandbox, Endpoint, Network입니다. 이 세
객체와 그 사이의 관계를 이해하면 이후 장에서 다루는 어떤 드라이버를 보더라도 "이 부분이 Sandbox에
해당하고, 이 부분이 Endpoint구나" 하는 식으로 매핑하며 읽을 수 있습니다.

### Sandbox

Sandbox는 컨테이너 하나가 갖는 네트워크 스택 전체를 가리키는 CNM의 개념입니다. 여기에는 그 컨테이너의
네트워크 인터페이스 목록, 라우팅 테이블, DNS 설정(`/etc/resolv.conf`) 등이 포함됩니다. 리눅스에서
Sandbox는 대부분 2장에서 다룬 네트워크 네임스페이스로 구현됩니다. 즉 CNM의 Sandbox는 추상적인 모델
개념이고, 리눅스 위에서 그 모델을 실현하는 구체적인 커널 메커니즘이 network namespace라고 이해하면
됩니다. 하나의 Sandbox는 여러 Network에 동시에 연결될 수 있습니다. 컨테이너 하나를 두 개의 사용자 정의
브리지 네트워크에 동시에 연결하면, 그 컨테이너의 Sandbox(네트워크 네임스페이스) 안에는 `eth0`, `eth1`처럼
두 개의 인터페이스가 나란히 존재하게 됩니다.

### Endpoint

Endpoint는 Sandbox를 특정 Network에 연결하는 가상 인터페이스입니다. 리눅스 브리지 드라이버의 경우
Endpoint는 실제로 veth pair 중 컨테이너 쪽 끝(대개 컨테이너 네임스페이스 안에서 `eth0`으로 보이는 쪽)에
대응합니다. Endpoint는 정확히 하나의 Network에만 속할 수 있고, 정확히 하나의 Sandbox에만 연결될 수
있습니다. 컨테이너가 네트워크 두 개에 연결되어 있다면, 그 컨테이너에는 Endpoint도 두 개 존재하는
것입니다. Endpoint는 CNM에서 "서비스가 노출되는 지점"이라는 의미도 함께 가지고 있어서, 다른 컨테이너나
외부에서 이 컨테이너로 접근할 때 실질적으로 거쳐 가는 접점 역할을 합니다.

### Network

Network는 서로 통신할 수 있어야 하는 Endpoint들의 논리적 그룹입니다. CNM 모델 자체는 Network가 "어떻게"
그 연결성을 제공하는지 규정하지 않습니다. 그 구현은 전적으로 드라이버의 몫입니다. 브리지 드라이버라면
Network 하나는 리눅스 브리지 디바이스 하나(`docker0` 또는 사용자 정의 브리지)로 구현되고, 그 브리지에
연결된 veth들이 같은 Network에 속한 Endpoint들이 됩니다. 오버레이 드라이버라면 Network 하나는 VXLAN
VNI(VXLAN Network Identifier) 하나로 구현되어, 물리적으로 다른 호스트에 있는 Endpoint들도 같은 VNI를
공유함으로써 논리적으로 같은 Network에 속하게 됩니다. 이처럼 Network는 "같은 논리적 네트워크에 속한다"는
멤버십을 나타내는 CNM의 추상 개념이고, 그 멤버십을 실제로 어떤 기술로 실현하느냐는 드라이버마다
다릅니다.

세 객체의 관계를 그림으로 정리하면 다음과 같습니다.

```
[ 컨테이너 A ]                              [ 컨테이너 B ]
   Sandbox A                                   Sandbox B
   (network namespace)                         (network namespace)
       │                                             │
   Endpoint A1 ── veth pair ──┐             ┌── veth pair ── Endpoint B1
                              │             │
                       ┌──────┴─────────────┴──────┐
                       │      Network "app-net"     │
                       │   (리눅스 브리지 또는 VXLAN) │
                       └────────────────────────────┘
```

컨테이너 A가 두 번째 네트워크에도 연결되어 있다면, Sandbox A 아래에 Endpoint A2가 하나 더 생기고 그
Endpoint A2가 또 다른 Network에 연결되는 식으로 그림이 확장됩니다. 이 구조 덕분에 하나의 컨테이너가
여러 네트워크에 동시에 속하면서도(예: 프런트엔드 네트워크와 백엔드 네트워크에 모두 연결된 API
컨테이너), 각 네트워크는 서로 독립적인 격리 도메인으로 유지될 수 있습니다.

## 11.3 내장 드라이버 개관과 이 장의 위치

CNM의 Network 객체는 실제로 여러 드라이버 중 하나로 구현됩니다. libnetwork은 다음과 같은 내장(built-in)
드라이버를 기본으로 제공합니다.

| 드라이버 | 한 줄 요약 | 다루는 장 |
|---|---|---|
| `bridge` | 단일 호스트 내에서 리눅스 브리지로 컨테이너를 연결하는 기본 드라이버 | 12장 |
| `overlay` | VXLAN 캡슐화를 이용해 여러 호스트에 걸친 L2 네트워크를 구성 | 13장 |
| `macvlan` | 컨테이너에 물리 인터페이스와 동급의 독립된 MAC 주소를 부여해 L2로 직접 노출 | 14장 |
| `ipvlan` | 물리 인터페이스를 공유하되 L2/L3 모드로 IP 기반 분리를 제공 | 14장 |
| `host` | 컨테이너가 별도 Sandbox 없이 호스트의 네트워크 네임스페이스를 그대로 사용 | 14장 |
| `none` | 루프백을 제외한 어떤 네트워크 인터페이스도 구성하지 않음 | 14장 |

이 표에서 볼 수 있듯, 이 장은 각 드라이버의 세부 동작을 다루지 않습니다. bridge가 정확히 어떻게 veth를
만들고 iptables를 조작하는지는 12장의 몫이고, overlay가 VXLAN을 통해 여러 호스트를 어떻게 연결하는지는
13장의 몫이며, macvlan/ipvlan/host/none은 14장에서 다룹니다. 이 장에서 강조하고 싶은 것은 이 드라이버들이
전부 "제각각 다른 방식으로 동작하는 독립된 기능"이 아니라, **Sandbox-Endpoint-Network라는 동일한 CNM
모델을 각자의 방식으로 구현한 결과물**이라는 점입니다. `docker network create -d overlay`나
`docker network create -d macvlan`처럼 `-d`(또는 `--driver`) 옵션으로 드라이버만 바꿔도 `docker network
connect`, `docker network inspect` 같은 상위 명령의 사용법이나 리턴되는 정보의 구조가 크게 다르지 않은
것은, 이 명령들이 드라이버가 아니라 CNM 모델을 대상으로 동작하기 때문입니다.

libnetwork은 여기에 더해 서드파티 드라이버를 위한 플러그인 구조도 제공합니다. Docker 데몬은 드라이버를
libnetwork 내부에 컴파일해 넣는 내장 드라이버 외에도, 별도 프로세스로 동작하며 Docker의 플러그인 API(HTTP
기반 소켓 프로토콜)를 구현하는 외부 드라이버를 등록할 수 있습니다. Weave Net, Calico(비-Kubernetes
환경), Cilium 등 SDN 벤더들이 한때 이런 방식으로 Docker 네트워크 플러그인을 제공했습니다. 이 구조에서
libnetwork은 "네트워크 드라이버라면 반드시 구현해야 하는 인터페이스"(네트워크 생성, Endpoint 생성,
Sandbox와의 join/leave 등)를 규정하고, 각 드라이버는 그 인터페이스를 자신의 방식으로 채워 넣습니다.
플러그인 드라이버의 상세한 구현 방법 자체는 이 교재의 범위를 벗어나지만, "드라이버는 갈아 끼울 수 있는
부품이고, CNM은 그 부품들이 공통으로 준수하는 규격"이라는 구조적 이해는 이 장에서 가져가야 할 핵심입니다.

## 11.4 IPAM 드라이버 — 서브넷과 주소를 관리하는 계층

Network와 Endpoint가 "어떻게 연결할 것인가"를 다루는 개념이라면, 그 연결에 사용될 IP 주소를 "어디서
가져올 것인가"는 별도의 관심사입니다. CNM은 이를 IPAM(IP Address Management) 드라이버라는 독립된
플러그인 지점으로 분리해 두었습니다. IPAM 드라이버는 네트워크를 만들 때 사용할 서브넷 풀을 관리하고,
그 안에서 게이트웨이 주소와 개별 컨테이너에 할당할 IP를 내어주는 역할을 합니다.

libnetwork은 기본 IPAM 드라이버를 내장하고 있어서, 별도 설정 없이 `docker network create`를 실행하면
이 기본 드라이버가 자동으로 사용되지 않는 사설 대역에서 서브넷을 골라 할당합니다. 하지만 실무에서는
사내 IP 대역 정책과 충돌하지 않도록, 또는 여러 네트워크의 주소 공간을 명시적으로 분리하기 위해 서브넷을
직접 지정하는 경우가 훨씬 많습니다.

```bash
# 서브넷/게이트웨이/할당 범위를 명시적으로 지정해 브리지 네트워크 생성
docker network create \
  --driver bridge \
  --subnet 172.28.0.0/16 \
  --gateway 172.28.0.1 \
  --ip-range 172.28.5.0/24 \
  app-net
```

이 명령에서 `--subnet`은 이 네트워크 전체가 사용할 CIDR 대역을 지정합니다. `--gateway`를 생략하면
libnetwork의 기본 IPAM 드라이버가 그 서브넷 안에서 관례적인 주소(대개 첫 번째 사용 가능한 호스트 주소)를
게이트웨이로 자동 선택합니다. `--ip-range`는 `--subnet`으로 지정한 전체 대역 중 실제로 컨테이너에
자동 할당할 범위를 좁히는 옵션입니다. 예를 들어 `/16` 전체 대역 중 특정 `/24` 구간만 동적 할당용으로
쓰고, 나머지 대역은 `docker run --ip`로 수동 할당할 고정 IP 용도로 남겨두는 식의 운용이 가능해집니다.
`--ip-range`로 지정하지 않은 주소도 그 서브넷 범위 안에 있다면 `--ip` 옵션으로 명시적으로 지정해 할당할
수 있다는 점도 기억해 둘 필요가 있습니다.

기본 IPAM 드라이버 외에 커스텀 IPAM 드라이버를 꽂는 것도 가능합니다. 이는 서드파티 네트워크 드라이버와
마찬가지로 플러그인 형태로 등록되며, 조직이 이미 운영 중인 IPAM 시스템(예: 사내 IPAM 서버, 클라우드
벤더의 서브넷 관리 API)과 Docker의 주소 할당을 연동하고 싶을 때 사용합니다. `docker network create`에
`--ipam-driver <플러그인 이름>`을 지정하면 그 네트워크의 주소 할당 전체를 해당 플러그인에 위임하게
됩니다. 커스텀 IPAM 드라이버가 필요한 상황은 실무에서 흔치는 않지만, "네트워크 드라이버(연결 방식)와
IPAM 드라이버(주소 할당 방식)는 CNM에서 서로 독립적으로 교체 가능한 두 개의 축"이라는 사실은 모델을
정확히 이해하는 데 중요합니다.

## 11.5 `docker network` 명령과 CNM 오퍼레이션의 대응

`docker network` 하위 명령들은 사용자 입장에서는 단순한 CLI 명령이지만, 내부적으로는 CNM이 정의하는
객체들에 대한 구체적인 오퍼레이션으로 변환됩니다. 각 명령이 CNM의 어떤 동작에 대응하는지 정리하면
다음과 같습니다.

| CLI 명령 | CNM 오퍼레이션 | 설명 |
|---|---|---|
| `docker network create` | Network 생성 | 지정한 드라이버와 IPAM 설정으로 새 Network 객체를 만들고, 드라이버에게 해당 네트워크의 실체(브리지 디바이스, VXLAN VNI 등)를 준비하도록 요청 |
| `docker network inspect` | Network/Endpoint 조회 | 특정 Network에 속한 Endpoint 목록, 각 Endpoint의 IP, 연결된 컨테이너 정보를 조회 |
| `docker network connect` | Endpoint 생성 + Sandbox와 join | 지정한 컨테이너의 Sandbox 안에 새 Endpoint를 만들어 대상 Network에 연결. 실행 중인 컨테이너라면 새 인터페이스가 그 자리에서 추가됨 |
| `docker network disconnect` | Endpoint를 Sandbox에서 leave + 삭제 | 컨테이너의 Sandbox에서 해당 Network로의 Endpoint 연결을 끊고 인터페이스를 제거 |
| `docker network rm` | Network 삭제 | 해당 Network에 연결된 Endpoint가 하나도 없을 때만 허용되며, 드라이버에게 네트워크의 실체(브리지 디바이스 등) 제거를 요청 |
| `docker run --network <net>` | Network 생성(암묵) + Endpoint 생성 + Sandbox 생성/join을 한 번에 수행 | 컨테이너 생성과 동시에 Sandbox를 만들고 지정한 Network에 연결하는 Endpoint까지 한 번에 처리 |

여기서 실무적으로 자주 헷갈리는 부분을 짚고 넘어갈 필요가 있습니다. `docker network connect`로 실행
중인 컨테이너에 네트워크를 추가하면, 컨테이너를 재시작하지 않고도 그 컨테이너의 네임스페이스 안에
새로운 인터페이스(새 Endpoint)가 즉시 나타납니다. 이는 CNM이 Endpoint의 생성과 Sandbox로의 결합을
컨테이너의 생명주기와 독립적인 오퍼레이션으로 설계했기 때문에 가능한 동작입니다. 반대로
`docker network disconnect`는 해당 인터페이스만 제거할 뿐 컨테이너 자체나 다른 네트워크로의 연결에는
영향을 주지 않습니다.

## 11.6 CNM과 CNI — 자주 혼동되는 두 모델

Kubernetes를 함께 다루다 보면 "Docker의 CNM"과 "Kubernetes의 CNI(Container Network Interface)"를
같은 개념의 다른 이름 정도로 오해하는 경우가 많습니다. 실제로는 설계 철학 자체가 다른 별개의 모델이며,
이 차이를 정확히 아는 것은 두 생태계를 오가며 일하는 엔지니어에게 실무적으로도 중요합니다.

CNM은 Docker(정확히는 libnetwork)가 자체적으로 만든 모델로, Network·Endpoint·Sandbox라는 세 객체와
그 생명주기 전체를 상세하게 규정합니다. 네트워크를 만들고, IP를 할당하고, 컨테이너를 연결하고 끊는
모든 단계가 libnetwork이라는 하나의 런타임 라이브러리 안에서 일관되게 관리됩니다. 반면 CNI는 CoreOS
주도로 만들어진 훨씬 단순한 스펙으로, "컨테이너의 네트워크 네임스페이스를 네트워크에 붙여라(ADD)"와
"떼어내라(DEL)"라는 두 개의 훅(hook)에 가까운 인터페이스만 정의합니다. CNI 플러그인은 실행 파일 한
개로 배포되고, 컨테이너 런타임(kubelet 등)이 컨테이너를 생성한 뒤 이미 만들어진 네트워크 네임스페이스의
경로를 인자로 넘겨 그 실행 파일을 호출하는 방식으로 동작합니다. 즉 CNI는 "네임스페이스는 이미 존재하니,
너는 그 안에 인터페이스만 넣고 IP만 할당해서 돌려달라"는 훨씬 좁고 명시적인 계약입니다.

두 모델의 차이를 표로 정리하면 다음과 같습니다.

| 구분 | CNM (libnetwork) | CNI |
|---|---|---|
| 주도 조직 | Docker/Moby | CNCF (원래 CoreOS 주도) |
| 핵심 추상화 | Network, Endpoint, Sandbox 세 객체와 각각의 생명주기 | ADD/DEL 두 개의 커맨드에 가까운 단순 인터페이스 |
| 네트워크 네임스페이스 접근 | 드라이버가 Sandbox 생성 시점부터 관여하며 네임스페이스 자체의 존재를 전제로 설계 | 런타임이 네임스페이스를 먼저 만들고, 플러그인은 그 경로만 받아 내부를 채움 |
| IPAM 시점 | 네트워크 연결과 IPAM 호출이 libnetwork 내부에서 별도 단계로 분리되어 있음 | 플러그인 실행 한 번 안에서 인터페이스 생성과 IP 할당까지 처리하도록 기대 |
| 배포 형태 | libnetwork에 링크되는 드라이버, 또는 HTTP 소켓 기반 플러그인 | 표준 입출력(JSON)으로 통신하는 단일 실행 파일 |
| 주 사용처 | Docker Engine, Swarm 모드 | Kubernetes(kubelet), 그리고 CNI를 지원하는 다른 런타임 |

Kubernetes가 CNM 대신 CNI를 채택한 이유는 CNM이 나쁜 모델이어서가 아니라, Kubernetes가 원했던 결합도가
CNM보다 훨씬 느슨했기 때문입니다. CNM은 libnetwork이라는 특정 런타임 라이브러리에 강하게 결합되어 있고,
파드(pod)라는 개념 없이 컨테이너 단위로 네트워킹을 설계했습니다. Kubernetes는 파드 안의 여러 컨테이너가
네트워크 네임스페이스를 공유하는 모델을 이미 자체적으로 가지고 있었고, 특정 런타임 라이브러리에 종속되지
않는 단순한 플러그인 계약을 원했습니다. 그래서 "네임스페이스는 우리가 만들 테니, 너는 그 안에 인터페이스만
넣어달라"는 CNI의 최소주의적 접근이 Kubernetes의 요구에 더 잘 맞았습니다. 결과적으로 오늘날 컨테이너
네트워킹 생태계에는 두 개의 서로 다른 표준이 공존하게 되었고, Docker Engine을 단독으로 쓸 때는 CNM
기반의 `docker network` 명령 체계를, Kubernetes 클러스터의 노드 네트워킹을 다룰 때는 CNI 플러그인
체계(Calico, Cilium, Flannel 등)를 이해해야 하는 상황이 만들어졌습니다. 이 교재는 Docker Engine을
대상으로 하므로 이후 12~18장에서 다루는 모든 네트워킹 내용은 CNI가 아니라 CNM/libnetwork 체계를
기준으로 서술됩니다.

## 핵심 요약

- libnetwork은 Docker의 네트워킹 로직을 dockerd 코어에서 분리해 낸 Go 라이브러리로, 플러그형 드라이버
  구조를 지원하기 위해 도입되었다. dockerd와는 별도 프로세스가 아니라 dockerd에 링크되어 동작하는
  라이브러리다.
- CNM은 Sandbox(컨테이너의 네트워크 스택, 리눅스에서는 network namespace로 구현), Endpoint(Sandbox를
  Network에 연결하는 가상 인터페이스, 브리지 드라이버에서는 veth의 컨테이너 쪽), Network(같은 논리
  네트워크에 속한 Endpoint들의 그룹)라는 세 객체로 컨테이너 네트워킹을 추상화한다.
- bridge, overlay, macvlan, ipvlan, host, none은 모두 CNM이 정의하는 Network 개념을 서로 다른 방식으로
  구현한 내장 드라이버이며, 각각의 세부 동작은 12~14장에서 이어서 다룬다. 서드파티 드라이버도 동일한
  플러그인 인터페이스를 통해 추가될 수 있다.
- IPAM 드라이버는 네트워크 연결과는 독립된 축으로, 서브넷·게이트웨이·IP 할당 범위를 관리한다.
  `--subnet`, `--gateway`, `--ip-range`로 기본 IPAM 동작을 제어할 수 있고, 커스텀 IPAM 드라이버로
  교체할 수도 있다.
- `docker network create/inspect/connect/disconnect`는 각각 CNM의 Network 생성/조회, Endpoint 생성
  및 Sandbox와의 join, Endpoint의 leave 및 삭제 오퍼레이션에 대응한다.
- CNM(Docker 고유 모델)과 CNI(Kubernetes가 채택한 표준)는 서로 다른 설계 철학을 가진 별개의 표준이다.
  CNM은 Network/Endpoint/Sandbox의 생명주기를 상세히 규정하는 반면, CNI는 네임스페이스에 인터페이스를
  붙이고 떼는 훨씬 단순한 훅 인터페이스다.

## 실습

다음 실습은 Docker Engine 29.x가 설치된 리눅스 호스트를 전제로 합니다.

```bash
# 1) 커스텀 서브넷/게이트웨이/IP 할당 범위를 지정해 네트워크 생성
docker network create \
  --driver bridge \
  --subnet 172.30.0.0/16 \
  --gateway 172.30.0.1 \
  --ip-range 172.30.5.0/24 \
  cnm-lab
# 확인 포인트: 에러 없이 네트워크 ID가 출력되는지 확인합니다.

# 2) 생성된 Network의 CNM 상 세부 정보 확인
docker network inspect cnm-lab
# 확인 포인트: "IPAM" 섹션에 Subnet/Gateway/IPRange가 지정한 값대로 반영되어 있는지,
# "Containers" 섹션이 아직 비어 있는지(Endpoint가 하나도 없는 상태) 확인합니다.

# 3) 컨테이너를 하나 실행해 Sandbox·Endpoint가 생기는 과정을 관찰
docker run -d --name cnm-c1 --network cnm-lab nginx:latest
docker network inspect cnm-lab --format '{{json .Containers}}'
# 확인 포인트: cnm-c1의 Endpoint 정보(IPv4Address 등)가 --ip-range로 지정한 대역
# 안에서 할당되었는지 확인합니다.

# 4) 실행 중인 컨테이너에 네트워크를 하나 더 연결(Endpoint 추가)
docker network create second-net
docker network connect second-net cnm-c1
docker exec cnm-c1 ip -brief addr
# 확인 포인트: 컨테이너 재시작 없이 eth0(cnm-lab용)에 더해 eth1(second-net용)
# 인터페이스가 즉시 추가되어 있는지 확인합니다. 이는 Endpoint 생성이 컨테이너의
# 생명주기와 독립적으로 이루어짐을 보여줍니다.

# 5) 연결 해제와 정리
docker network disconnect second-net cnm-c1
docker exec cnm-c1 ip -brief addr
# 확인 포인트: eth1이 사라지고 eth0만 남아 있는지 확인합니다.

docker rm -f cnm-c1
docker network rm cnm-lab second-net
```

다음 장에서는 이 CNM 모델을 가장 많이 접하게 되는 기본 드라이버인 bridge로 들어가, veth pair가 실제로
어떻게 커널 안에서 연결되고 포트 게시가 iptables와 docker-proxy를 통해 어떻게 실현되는지를 직접
확인해봅니다.
