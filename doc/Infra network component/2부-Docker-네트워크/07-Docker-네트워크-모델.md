---
title: "7장. Docker 네트워크 모델"
parent: "2부. Docker 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 7
---

# 7장. Docker 네트워크 모델

> **🎮 게임 서버 개발자에게** — C++ 서버에서 소켓 코드는 한 가지(`socket`/`bind`/`listen`)인데 아래에서 어떤 NIC·가상 인터페이스를 쓰는지는 OS가 숨겨 준다. Docker 네트워킹도 비슷한 층 구조다. 위에서는 `docker network create`/`connect` 같은 **하나의 명령 체계**를 쓰고, 아래에서는 브리지·VXLAN·macvlan 같은 **교체 가능한 드라이버**가 실제 일을 한다. 이 둘을 잇는 공통 설계가 CNM(Container Network Model)이다. 결정적으로 다른 점은 드라이버를 바꿔도 명령은 거의 그대로이고, 추상화의 단위가 **Sandbox·Endpoint·Network 세 객체**라는 것이다. 이후 8&#126;12장은 전부 이 모델 위의 구현 이야기다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 컨테이너 하나를 프런트엔드 네트워크와 백엔드 네트워크에 동시에 붙여야 하고, 컨테이너 재시작 없이 네트워크를 추가·분리하고 싶을 때.
> - 사내 IP 대역과 충돌하지 않게 컨테이너 네트워크의 서브넷·게이트웨이·할당 범위를 직접 지정해야 할 때.
> - "Docker는 CNM, 쿠버네티스는 CNI"라는 말을 듣고 둘의 차이를 설명해야 할 때.

## 코어 — 이것만은 100%

> **한 문장:** Docker의 네트워킹은 dockerd에 링크된 라이브러리 libnetwork가 담당하고, 컨테이너 네트워킹을 Sandbox(컨테이너의 네트워크 스택, 리눅스에선 네트워크 네임스페이스)·Endpoint(Sandbox를 Network에 잇는 가상 인터페이스)·Network(Endpoint들의 논리 그룹) 세 객체로 추상화하며, 브리지·오버레이·macvlan 등 모든 드라이버는 이 같은 모델의 서로 다른 구현이고 IPAM은 별도의 교체 가능한 축이다.

1. **libnetwork는 네트워킹을 dockerd 코어에서 뽑아낸 플러그형 라이브러리다** — 별도 데몬이 아니라 dockerd 프로세스에 링크되어 동작하고, 정책·모델은 libnetwork가, 실제 패킷 처리는 드라이버가 맡는다.
2. **CNM은 Sandbox·Endpoint·Network 세 객체다** — Sandbox 1개는 여러 Network에 붙을 수 있고(Endpoint가 그만큼 생김), Endpoint는 정확히 하나의 Network·하나의 Sandbox에만 속한다.
3. **드라이버는 갈아 끼우는 부품이고 IPAM은 독립된 축이다** — `bridge`·`overlay`·`macvlan`·`ipvlan`·`host`·`none` 모두 같은 CNM을 구현한다. 연결 방식(드라이버)과 주소 할당(IPAM)은 서로 독립적으로 교체된다.
4. **`docker network` 명령은 CNM 오퍼레이션이다** — create=Network 생성, connect=Endpoint 생성+join, disconnect=leave+삭제. Endpoint 생성이 컨테이너 생명주기와 독립이라 실행 중에도 네트워크를 붙이고 뗄 수 있다. CNI(쿠버네티스)는 ADD/DEL 두 훅이 핵심인 훨씬 단순한 별개의 모델이다.

**이 장의 학습 목표**

- libnetwork가 dockerd에서 분리된 이유와, 그것이 별도 프로세스가 아님을 설명할 수 있다.
- Sandbox·Endpoint·Network의 관계와 개수 규칙(1:N, 1:1)을 그림으로 그릴 수 있다.
- 6개 내장 드라이버가 같은 모델의 구현임을 알고, 각각이 Network를 무엇으로 구현하는지 말할 수 있다.
- `--subnet`·`--gateway`·`--ip-range`와 `--ipam-driver`의 역할을 안다.
- CNM과 CNI의 차이를 표로 설명할 수 있다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 추상 인터페이스 + 구현 클래스(다형성) | CNM + 드라이버 | 위 코드는 하나, 구현은 갈아 끼운다 | 드라이버는 컴파일된 가상 함수가 아니라 libnetwork에 컴파일해 넣은 내장 드라이버거나, 별도 프로세스로 HTTP 소켓 프로토콜을 쓰는 외부 플러그인이다 |
| 프로세스 하나가 가진 소켓·라우팅 환경 | Sandbox | 한 주체가 쓰는 네트워크 환경 전체 | Sandbox는 인터페이스 목록·라우팅 테이블·DNS 설정을 담은 **네트워크 네임스페이스**이고 컨테이너 하나가 갖는다 |
| NIC 하나 | Endpoint | 네트워크에 붙는 접점 | 가상 인터페이스이며(브리지 드라이버에선 veth의 컨테이너 쪽 끝), 한 Sandbox가 여러 개 가질 수 있다 |
| 같은 서브넷 설정(`ifconfig`/`ip addr` 대역 계획) | Network + IPAM | 대역과 게이트웨이를 정한다 | 주소 할당 주체(IPAM 드라이버)가 연결 방식과 분리된 독립 플러그인이다 |
| 서버 시작 후 NIC를 핫플러그하는 일은 드묾 | `docker network connect` | 접점을 추가한다 | 컨테이너 재시작 없이 새 인터페이스가 그 자리에서 추가된다 |
| 표준 규격 하나로 통일된 API | CNM vs CNI | 둘 다 컨테이너 네트워킹 모델이다 | 서로 **별개의 표준**이다. 같은 개념의 다른 이름이 아니다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `docker network create`를 하면 호스트에는 정확히 무엇이 만들어질까? 드라이버에 따라 달라질까?
> 2. 컨테이너 하나를 네트워크 두 개에 연결하면 컨테이너 안의 인터페이스는 몇 개가 될까?
> 3. 실행 중인 컨테이너에 네트워크를 추가하려면 재시작이 필요할까?
> 4. 서브넷만 지정하고 게이트웨이를 안 적으면 누가 어떤 주소를 게이트웨이로 정할까?
> 5. Docker의 네트워크 모델과 쿠버네티스의 CNI는 같은 것일까, 다른 것일까?
> **처리법:** 🛠 실습 `docker network create --driver bridge --subnet ... --gateway ... --ip-range ... cnm-lab` → `docker network inspect` → `docker network connect second-net cnm-c1` → `docker exec cnm-c1 ip -brief addr` → 바로 실행 · 🗺 관계도 Sandbox–Endpoint–Network 그림에 컨테이너 A의 두 번째 네트워크 확장을 직접 그려 보기 · 📦 카드로 드라이버 6종과 각 Network의 실체(브리지 디바이스/VXLAN VNI 등), `--subnet`/`--gateway`/`--ip-range`/`--ipam-driver`, create/connect/disconnect↔CNM 오퍼레이션 · 유추 비판 "드라이버 = 다형성 구현 클래스" 유추가 어디서 깨지는지 적어 보기

---

## 코어 1. libnetwork는 네트워킹을 dockerd에서 뽑아낸 플러그형 라이브러리다

### 1.1 왜 분리되었는가

**한 줄 요약:** 네트워킹 로직이 dockerd에 하드코딩되어 드라이버 추가·교체가 불가능했기 때문에, 독립 라이브러리 libnetwork로 분리하고 실제 패킷 처리는 드라이버에 위임했다.

Docker 초기에는 브리지를 만들고, veth pair를 꽂고, iptables 규칙을 넣는 로직이 모두 dockerd 코드베이스 한가운데 있었다. 드라이버를 바꾸거나 추가하려면 dockerd 자체를 수정해야 했고, 이 구조는 두 방향에서 한계에 부딪혔다.

- **멀티호스트:** Docker가 여러 호스트에 걸친 클러스터(훗날의 Swarm 모드)를 지원하려는 순간 브리지 하나로는 해결되지 않았다. 서로 다른 호스트의 컨테이너들이 같은 L2에 있는 것처럼 통신하려면 오버레이 같은 전혀 다른 구현이 필요했고, 새 구현마다 dockerd 코어를 건드리는 것은 유지보수가 불가능했다([6장](../1부-리눅스-네트워크-기초/06-오버레이-VXLAN-MTU.md)).
- **생태계:** 클라우드·SDN 벤더가 자신들의 솔루션을 Docker와 통합하려 해도 dockerd 코드를 직접 수정해 병합해야 하는 구조는 확장에 부적합했다.

그래서 Docker는 네트워킹 로직 전체를 `libnetwork`이라는 독립된 Go 라이브러리로 분리했다. libnetwork는 네트워킹의 "정책과 모델"을 정의하는 상위 계층이고, 패킷을 어떻게 스위칭·라우팅할지는 플러그형 드라이버에 맡긴다.

### 1.2 프로세스가 아니라 라이브러리다

**한 줄 요약:** libnetwork는 containerd처럼 gRPC로 통신하는 별도 데몬이 아니라 dockerd 프로세스 안에 링크된 Go 라이브러리다.

dockerd/containerd/shim/runc의 프로세스 분리가 "컨테이너 실행" 경로의 분리였다면, libnetwork의 분리는 성격이 다른 "코드 모듈"의 분리다. dockerd가 `docker network create` 요청을 REST API로 받으면 처리 주체는 여전히 dockerd 프로세스이지만 실제 로직은 libnetwork 패키지의 API 호출로 위임된다.

> **[보충]** C++ 서버 개발자 관점에서는 "정적/동적 링크된 서드파티 라이브러리"로 보면 된다. 별도 서버 프로세스가 아니라 같은 프로세스 안의 라이브러리 호출이라는 점을 위 원천 설명이 말하고 있고, 이 비유 문장 자체는 이 책이 덧붙였다.

---

## 코어 2. CNM은 Sandbox·Endpoint·Network 세 객체다

### 2.1 세 객체의 정의

**한 줄 요약:** Sandbox는 컨테이너 하나의 네트워크 스택 전체, Endpoint는 그 스택을 Network에 잇는 가상 인터페이스, Network는 서로 통신할 수 있는 Endpoint들의 논리 그룹이다.

**Sandbox.** 컨테이너 하나가 갖는 네트워크 스택 전체다. 네트워크 인터페이스 목록, 라우팅 테이블, DNS 설정(`/etc/resolv.conf`) 등이 포함되며, 리눅스에서는 대부분 **네트워크 네임스페이스**로 구현된다([3장](../1부-리눅스-네트워크-기초/03-네트워크-네임스페이스.md)). CNM의 Sandbox는 추상 개념이고 그것을 실현하는 커널 메커니즘이 network namespace다. 하나의 Sandbox는 여러 Network에 동시에 연결될 수 있어서, 컨테이너를 두 개의 사용자 정의 브리지에 붙이면 그 네임스페이스 안에 `eth0`, `eth1`이 나란히 존재한다.

**Endpoint.** Sandbox를 특정 Network에 연결하는 가상 인터페이스다. 리눅스 브리지 드라이버에서는 veth pair 중 **컨테이너 쪽 끝**(컨테이너 안에서 `eth0`으로 보이는 쪽)에 대응한다. Endpoint는 정확히 하나의 Network에만, 정확히 하나의 Sandbox에만 연결된다. 컨테이너가 네트워크 두 개에 연결되면 Endpoint도 두 개다. Endpoint는 "서비스가 노출되는 지점"이라는 의미도 가져서, 다른 컨테이너나 외부가 이 컨테이너로 접근할 때 거치는 접점이다.

**Network.** 서로 통신할 수 있어야 하는 Endpoint들의 논리적 그룹이다. CNM 모델은 Network가 "어떻게" 연결성을 제공하는지 규정하지 않고 구현은 드라이버의 몫이다.

| 드라이버 | Network의 실체 | 같은 Network에 속한다는 것의 구현 |
|---|---|---|
| 브리지 | 리눅스 브리지 디바이스 하나(`docker0` 또는 사용자 정의 브리지) | 그 브리지에 연결된 veth들의 Endpoint |
| 오버레이 | VXLAN VNI 하나 | 물리적으로 다른 호스트의 Endpoint도 같은 VNI를 공유 |

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

컨테이너 A가 두 번째 네트워크에도 연결되면 Sandbox A 아래에 Endpoint A2가 생기고 또 다른 Network에 연결된다. 이 구조 덕분에 하나의 컨테이너가 여러 네트워크(예: 프런트엔드 네트워크와 백엔드 네트워크 모두에 연결된 API 컨테이너)에 속하면서도 각 네트워크는 독립된 격리 도메인으로 유지된다.

### 2.2 개수 규칙

| 관계 | 규칙 |
|---|---|
| Sandbox ↔ Network | 하나의 Sandbox가 여러 Network에 동시에 연결될 수 있다 |
| Endpoint ↔ Network | Endpoint는 정확히 하나의 Network에만 속한다 |
| Endpoint ↔ Sandbox | Endpoint는 정확히 하나의 Sandbox에만 연결된다 |
| 컨테이너가 네트워크 N개에 연결 | Endpoint N개 (인터페이스 N개) |

---

## 코어 3. 드라이버는 갈아 끼우는 부품이고 IPAM은 독립된 축이다

### 3.1 내장 드라이버 6종

**한 줄 요약:** 6개 드라이버는 "제각각 다른 기능"이 아니라 같은 CNM 모델을 각자의 방식으로 구현한 결과물이다.

| 드라이버 | 한 줄 요약 | 다루는 장 |
|---|---|---|
| `bridge` | 단일 호스트 내에서 리눅스 브리지로 컨테이너를 연결하는 기본 드라이버 | [8장](08-브리지-네트워크와-포트-게시.md) |
| `overlay` | VXLAN 캡슐화로 여러 호스트에 걸친 L2 네트워크를 구성 | [10장](10-macvlan-ipvlan-host-none-오버레이.md) |
| `macvlan` | 컨테이너에 물리 인터페이스와 동급의 독립된 MAC 주소를 부여해 L2로 직접 노출 | 10장 |
| `ipvlan` | 물리 인터페이스를 공유하되 L2/L3 모드로 IP 기반 분리 | 10장 |
| `host` | 별도 Sandbox 없이 호스트의 네트워크 네임스페이스를 그대로 사용 | 10장 |
| `none` | 루프백을 제외한 어떤 네트워크 인터페이스도 구성하지 않음 | 10장 |

`docker network create -d overlay`나 `-d macvlan`처럼 `-d`(`--driver`)만 바꿔도 `docker network connect`·`docker network inspect` 같은 상위 명령의 사용법이나 결과 구조가 크게 다르지 않은 것은, 이 명령들이 드라이버가 아니라 **CNM 모델**을 대상으로 동작하기 때문이다.

### 3.2 서드파티 드라이버

내장 드라이버 외에, 별도 프로세스로 동작하며 Docker의 플러그인 API(HTTP 기반 소켓 프로토콜)를 구현하는 외부 드라이버를 등록할 수 있다. Weave Net, Calico(비-Kubernetes 환경), Cilium 등이 한때 이 방식으로 Docker 네트워크 플러그인을 제공했다. libnetwork는 "네트워크 드라이버라면 반드시 구현해야 하는 인터페이스"(네트워크 생성, Endpoint 생성, Sandbox와의 join/leave 등)를 규정하고 각 드라이버가 자기 방식으로 채운다. 플러그인 구현법 자체는 이 책의 범위 밖이다. "드라이버는 갈아 끼울 수 있는 부품이고, CNM은 그 부품들이 공통으로 준수하는 규격"이라는 이해가 핵심이다.

### 3.3 IPAM — 주소는 별도의 축이다

**한 줄 요약:** 연결 방식(드라이버)과 주소 할당(IPAM 드라이버)은 CNM에서 서로 독립적으로 교체 가능한 두 개의 축이다.

Network·Endpoint가 "어떻게 연결할 것인가"를 다룬다면, 그 연결에 쓸 IP를 "어디서 가져올 것인가"는 별도 관심사로서 IPAM(IP Address Management) 드라이버가 맡는다. IPAM 드라이버는 서브넷 풀을 관리하고 그 안에서 게이트웨이 주소와 컨테이너별 IP를 내어 준다. libnetwork에는 기본 IPAM 드라이버가 내장되어 있어서 `docker network create`를 별다른 설정 없이 실행하면 기본 드라이버가 자동으로 사용되지 않는 사설 대역에서 서브넷을 골라 할당한다. 실무에서는 사내 IP 대역 정책과 충돌하지 않게 하거나 여러 네트워크의 주소 공간을 명시적으로 분리하려고 서브넷을 직접 지정하는 경우가 훨씬 많다.

```bash
# 서브넷/게이트웨이/할당 범위를 명시적으로 지정해 브리지 네트워크 생성
docker network create \
  --driver bridge \
  --subnet 172.28.0.0/16 \
  --gateway 172.28.0.1 \
  --ip-range 172.28.5.0/24 \
  app-net
```

| 옵션 | 의미 |
|---|---|
| `--subnet` | 이 네트워크 전체가 쓸 CIDR 대역 |
| `--gateway` | 생략하면 기본 IPAM 드라이버가 서브넷 안에서 관례적인 주소(대개 첫 번째 사용 가능한 호스트 주소)를 자동 선택 |
| `--ip-range` | `--subnet` 중 컨테이너에 **자동 할당할** 범위를 좁힌다 |
| `--ip` (`docker run`) | `--ip-range` 밖이라도 서브넷 범위 안이면 명시적으로 지정해 할당 가능 |
| `--ipam-driver <플러그인>` | 그 네트워크의 주소 할당 전체를 커스텀 IPAM 플러그인에 위임 |

예: `/16` 전체 중 특정 `/24`만 동적 할당용으로 쓰고, 나머지는 `docker run --ip`로 수동 할당할 고정 IP 용도로 남겨 둘 수 있다. 커스텀 IPAM은 사내 IPAM 서버나 클라우드 벤더의 서브넷 관리 API와 Docker의 주소 할당을 연동하려는 경우에 쓰며 실무에서 흔치는 않다.

---

## 코어 4. `docker network` 명령은 CNM 오퍼레이션이다

### 4.1 명령과 CNM의 대응

**한 줄 요약:** create/connect/disconnect는 Network 생성·Endpoint 생성+join·Endpoint leave+삭제에 대응하고, Endpoint 조작이 컨테이너 생명주기와 독립이라 실행 중에도 가능하다.

| CLI 명령 | CNM 오퍼레이션 | 설명 |
|---|---|---|
| `docker network create` | Network 생성 | 드라이버에게 네트워크의 실체(브리지 디바이스, VXLAN VNI 등) 준비를 요청 |
| `docker network inspect` | Network/Endpoint 조회 | Network의 Endpoint 목록, 각 IP, 연결된 컨테이너 정보 조회 |
| `docker network connect` | Endpoint 생성 + Sandbox와 join | 컨테이너의 Sandbox 안에 새 Endpoint를 만들어 Network에 연결. 실행 중이면 새 인터페이스가 그 자리에서 추가됨 |
| `docker network disconnect` | Endpoint를 Sandbox에서 leave + 삭제 | 해당 인터페이스만 제거. 컨테이너·다른 네트워크 연결에는 영향 없음 |
| `docker network rm` | Network 삭제 | 연결된 Endpoint가 하나도 없을 때만 허용 |
| `docker run --network <net>` | Network 생성(암묵) + Endpoint 생성 + Sandbox 생성/join | 컨테이너 생성과 동시에 Sandbox를 만들고 지정 Network에 연결 |

> **[보충]** `docker run --network <net>` 행의 "Network 생성(암묵)"은 원천의 표기를 그대로 옮긴 것이다. 원천은 이 괄호의 정확한 의미(이미 만든 네트워크를 지정하는 일반적인 경우에 어떻게 되는지)를 더 설명하지 않으므로, 이 책은 해석을 덧붙이지 않고 "한 번에 처리한다"는 점만 가져간다.

```bash
# 컨테이너 재시작 없이 네트워크 추가
docker network create second-net
docker network connect second-net cnm-c1
docker exec cnm-c1 ip -brief addr   # eth0 외에 eth1이 즉시 추가됨
```

### 4.2 CNM과 CNI

**한 줄 요약:** CNM은 세 객체의 생명주기를 상세히 규정하는 Docker 고유 모델이고, CNI는 네임스페이스에 인터페이스를 붙이고 떼는 ADD/DEL 두 훅이 핵심인 별개의 스펙이다.

| 구분 | CNM (libnetwork) | CNI |
|---|---|---|
| 주도 조직 | Docker/Moby | CNCF (원래 CoreOS 주도) |
| 핵심 추상화 | Network·Endpoint·Sandbox 세 객체와 각각의 생명주기 | ADD/DEL 두 개의 커맨드에 가까운 단순 인터페이스 |
| 네임스페이스 접근 | 드라이버가 Sandbox 생성 시점부터 관여 | 런타임이 네임스페이스를 먼저 만들고 플러그인은 그 경로만 받아 내부를 채움 |
| IPAM 시점 | libnetwork 내부에서 별도 단계로 분리 | 플러그인 실행 한 번에서 인터페이스 생성과 IP 할당까지 |
| 배포 형태 | libnetwork에 링크되는 드라이버 또는 HTTP 소켓 기반 플러그인 | 표준 입출력(JSON)으로 통신하는 단일 실행 파일 |
| 주 사용처 | Docker Engine, Swarm 모드 | Kubernetes(kubelet) 등 CNI 지원 런타임 |

> **[보충]** 원천끼리 충돌한 지점: docker-fundamental 11.6은 CNI를 "ADD/DEL 두 개의 훅에 가까운" 인터페이스로 설명하지만, 더 상세한 Kubernetes_Internals_Network_Guide(13장)는 CNI 스펙이 `ADD`/`DEL`/`CHECK`/`VERSION` 네 동작을 정의한다고 한다. 이 책은 후자를 따르되, 핵심이 ADD/DEL이라는 뜻으로 "두 훅이 핵심"이라고 쓴다. 호출 주체도 쿠버네티스 쪽 원천은 kubelet이 아니라 컨테이너 런타임이라고 명시한다(자세한 내용은 [14장](../3부-쿠버네티스-네트워크/14-CNI-스펙과-IPAM.md)).

쿠버네티스가 CNI를 택한 이유는 CNM이 나빠서가 아니라 원하는 결합도가 훨씬 느슨했기 때문이다. CNM은 특정 런타임 라이브러리(libnetwork)에 강하게 결합되어 있고 파드 개념 없이 컨테이너 단위로 설계되었다. 쿠버네티스는 파드 안의 여러 컨테이너가 네트워크 네임스페이스를 공유하는 모델을 이미 갖고 있었고, "네임스페이스는 우리가 만들 테니 너는 그 안에 인터페이스만 넣고 IP만 할당해 달라"는 최소주의 계약을 원했다. 그 결과 Docker Engine 단독 사용 시에는 CNM 기반 `docker network` 체계를, 쿠버네티스 노드 네트워킹에서는 CNI 플러그인 체계(Calico, Cilium, Flannel 등)를 이해해야 한다. 이 책의 2부(7&#126;12장)는 CNM/libnetwork 기준이고, CNI는 [14장](../3부-쿠버네티스-네트워크/14-CNI-스펙과-IPAM.md)에서 다룬다.

---

## 실무 적용

### 체크리스트

- [ ] libnetwork는 별도 프로세스가 아니라 dockerd에 링크된 라이브러리이고, 드라이버가 실제 패킷 처리를 맡는다.
- [ ] Sandbox=네트워크 네임스페이스, Endpoint=veth의 컨테이너 쪽 끝(브리지 드라이버), Network=브리지 디바이스 또는 VXLAN VNI.
- [ ] 컨테이너가 네트워크 N개에 붙으면 인터페이스도 N개(`eth0`, `eth1` …)다.
- [ ] 서브넷 충돌이 우려되면 `--subnet`/`--gateway`/`--ip-range`를 직접 지정한다. 고정 IP 용도는 `--ip-range` 밖에 남긴다.
- [ ] 실행 중인 컨테이너의 네트워크 추가·분리는 `docker network connect/disconnect`로 재시작 없이 가능하다.
- [ ] `docker network rm`은 연결된 Endpoint가 하나도 없을 때만 된다.
- [ ] CNM(Docker)과 CNI(쿠버네티스)를 같은 것으로 취급하지 않는다.

### 시나리오로 확인하기

1. **상황:** 게임 API 컨테이너가 프런트엔드 네트워크(`front`)에만 붙어 있는데, 서비스를 멈추지 않고 백엔드 네트워크(`back`)의 DB에도 접근하게 해야 한다.
   **질문:** 어떻게 하고, 컨테이너 안에는 무엇이 생기는가?

   <details markdown="1"><summary>답 확인</summary>

   `docker network connect back <컨테이너>`를 실행한다. Endpoint 생성이 컨테이너 생명주기와 독립적이므로 재시작 없이 새 Endpoint가 만들어지고, 컨테이너의 Sandbox(네트워크 네임스페이스) 안에 `eth1`이 추가된다(`docker exec <컨테이너> ip -brief addr`로 확인). 두 네트워크는 각각 독립된 격리 도메인으로 유지된다. → 코어 2, 코어 4 (4.1)

   </details>

2. **상황:** 사내 IP 정책상 컨테이너 대역을 `172.28.0.0/16`로 써야 하고, 그중 `172.28.5.0/24`만 자동 할당하되 DB 컨테이너에는 고정 IP를 주고 싶다.
   **질문:** 네트워크 생성 명령과 고정 IP 지정 방법은?

   <details markdown="1"><summary>답 확인</summary>

   `docker network create --driver bridge --subnet 172.28.0.0/16 --gateway 172.28.0.1 --ip-range 172.28.5.0/24 app-net`으로 만든다. `--ip-range` 밖이지만 서브넷 안의 주소는 `docker run --ip`로 명시 할당할 수 있으므로 DB 컨테이너에는 `--ip`로 고정 주소를 준다. → 코어 3 (3.3)

   </details>

3. **상황:** 팀원이 "쿠버네티스도 `docker network` 같은 모델이라 CNM으로 CNI 플러그인을 대체할 수 있다"고 한다.
   **질문:** 무엇이 틀렸는가?

   <details markdown="1"><summary>답 확인</summary>

   CNM과 CNI는 설계 철학이 다른 별개의 표준이다. CNM은 libnetwork에 결합되어 Network·Endpoint·Sandbox의 생명주기를 규정하고, CNI는 런타임이 만든 네임스페이스에 인터페이스를 붙이고(ADD) 떼는(DEL) 단일 실행 파일 계약이다. 쿠버네티스(kubelet)는 CNI를 쓴다. → 코어 4 (4.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
코어 1 libnetwork = ____ 에서 분리된 Go ____ (별도 ____ 아님, dockerd에 ____ 됨)
  분리 이유 2: 멀티호스트(____ 등)  /  ____(SDN 벤더) 통합
코어 2 CNM 3객체: ____ (= ____ 네임스페이스) / ____ (veth의 컨테이너 쪽) / ____
  개수: Sandbox는 여러 Network 가능 / Endpoint는 __개 Network, __개 Sandbox
  Network 실체: 브리지 = ____ , 오버레이 = ____
코어 3 내장 드라이버 6: ____ ____ ____ ____ ____ ____
  축 2개: ____ 드라이버(연결) ↔ ____ 드라이버(주소)
  옵션: --____(대역) --____(게이트웨이) --____(자동 할당 범위) --____-driver
코어 4 create=____ / connect=____ + join / disconnect=leave + ____
  CNM: ____ 객체 / CNI: ____ , ____ 두 훅 · 표준 입출력 ____
```

### 2. 인출 질문

1. libnetwork는 별도 데몬인가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. containerd처럼 gRPC로 통신하는 독립 데몬이 아니라 dockerd 프로세스 안에 링크되어 동작하는 Go 라이브러리다. `docker network create`는 REST API로 dockerd가 받고, 실제 로직은 libnetwork 패키지 호출로 위임된다. → 코어 1 (1.2)

   </details>

2. libnetwork를 dockerd에서 분리한 이유 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   첫째, 멀티호스트(Swarm)를 위해 오버레이 같은 전혀 다른 구현이 필요했는데 새 구현마다 dockerd 코어를 수정할 수 없었다. 둘째, 클라우드·SDN 벤더가 dockerd 코드를 수정해 병합해야만 통합이 가능한 구조는 생태계 확장에 부적합했다. → 코어 1 (1.1)

   </details>

3. Sandbox·Endpoint·Network를 각각 한 문장으로 정의하고, 브리지 드라이버에서의 실체를 말하라.

   <details markdown="1"><summary>답 확인</summary>

   Sandbox: 컨테이너 하나의 네트워크 스택 전체(인터페이스·라우팅 테이블·DNS 설정), 리눅스에서는 네트워크 네임스페이스. Endpoint: Sandbox를 Network에 잇는 가상 인터페이스, 브리지 드라이버에서는 veth의 컨테이너 쪽 끝. Network: 서로 통신할 수 있는 Endpoint들의 논리 그룹, 브리지 드라이버에서는 리눅스 브리지 디바이스. → 코어 2 (2.1)

   </details>

4. 컨테이너가 네트워크 두 개에 연결되면 Sandbox·Endpoint·인터페이스는 각각 몇 개인가?

   <details markdown="1"><summary>답 확인</summary>

   Sandbox 1개(하나가 여러 Network에 연결 가능), Endpoint 2개, 인터페이스 2개(`eth0`, `eth1`). Endpoint는 정확히 하나의 Network·Sandbox에만 속한다. → 코어 2 (2.2)

   </details>

5. `-d overlay`나 `-d macvlan`으로 드라이버를 바꿔도 `docker network connect/inspect` 사용법이 비슷한 이유는?

   <details markdown="1"><summary>답 확인</summary>

   그 명령들이 드라이버가 아니라 CNM 모델을 대상으로 동작하기 때문이다. 모든 드라이버가 같은 Sandbox-Endpoint-Network 모델의 구현이다. → 코어 3 (3.1)

   </details>

6. `--subnet`, `--gateway`, `--ip-range`의 역할과 `--gateway` 생략 시 동작은?

   <details markdown="1"><summary>답 확인</summary>

   `--subnet`은 네트워크 전체 CIDR, `--ip-range`는 그중 자동 할당할 범위. `--gateway`를 생략하면 기본 IPAM 드라이버가 서브넷 안의 관례적인 주소(대개 첫 번째 사용 가능한 호스트 주소)를 게이트웨이로 자동 선택한다. 범위 밖이라도 서브넷 안이면 `--ip`로 수동 할당할 수 있다. → 코어 3 (3.3)

   </details>

7. `docker network connect`로 실행 중인 컨테이너에 네트워크를 추가할 수 있는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   CNM이 Endpoint의 생성과 Sandbox로의 결합을 컨테이너 생명주기와 독립적인 오퍼레이션으로 설계했기 때문이다. 새 인터페이스가 재시작 없이 즉시 추가되고, `disconnect`는 그 인터페이스만 제거한다. → 코어 4 (4.1)

   </details>

8. CNM과 CNI의 핵심 차이, 그리고 쿠버네티스가 CNI를 채택한 이유는?

   <details markdown="1"><summary>답 확인</summary>

   CNM은 세 객체와 생명주기를 규정하고 libnetwork에 결합된 모델, CNI는 ADD/DEL 두 훅이 핵심인 단일 실행 파일 계약(런타임이 만든 네임스페이스에 플러그인이 인터페이스와 IP를 채움). 쿠버네티스는 파드 안 컨테이너들이 네임스페이스를 공유하는 모델을 이미 갖고 있었고 특정 런타임 라이브러리에 종속되지 않는 단순한 계약을 원했다. → 코어 4 (4.2)

   </details>

### 3. 기억 고리

- **C++ 유추:** CNM + 드라이버 ≈ 추상 인터페이스 + 구현 클래스. ⚠️ 드라이버는 libnetwork에 컴파일해 넣은 내장 구현이거나 HTTP 소켓으로 말하는 별도 프로세스 플러그인이다.
- **C++ 유추:** Sandbox ≈ 프로세스가 보는 네트워크 환경 전체, Endpoint ≈ NIC. ⚠️ Sandbox는 컨테이너마다 하나이고, Endpoint는 네트워크 수만큼 생긴다.
- **비유:** CNM = 건물(Sandbox)·출입문(Endpoint)·도로망(Network). 한 건물이 출입문을 두 개 내고 서로 다른 도로망에 연결할 수 있다. ⚠️ 깨지는 지점: 출입문은 정확히 하나의 도로망과 하나의 건물에만 속하며, 도로망의 실체는 드라이버마다 다르다(브리지 디바이스 또는 VXLAN VNI).
- **묶음(3의 법칙):** CNM 3객체(Sandbox·Endpoint·Network) · 연결 명령 3(create·connect·disconnect) · 주소 옵션 3(`--subnet`·`--gateway`·`--ip-range`).
- **대칭·순서:** connect(Endpoint 생성+join) ↔ disconnect(leave+삭제). 드라이버(연결) ↔ IPAM(주소). CNM(생명주기 전체) ↔ CNI(ADD/DEL).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "컨테이너 하나를 두 네트워크에 연결하면 Sandbox·Endpoint·Network가 어떻게 생기는지"를 그림 없이 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "드라이버와 IPAM이 왜 따로 교체되는 부품인지"를 인터페이스/구현 분리 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "CNM은 CNI보다 상세하니 더 좋은 모델이다" vs B "CNI의 최소주의가 쿠버네티스에 더 맞다" — 양쪽을 번갈아 변호해 보세요(결합도, 파드 모델, 런타임 독립성을 근거로).
- **AI 역할 반전:** "내가 CNM 세 객체와 docker network 명령의 대응을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/11_libnetwork과_CNM(Container_Network_Model).md (11.1 네트워킹이 dockerd 코어에서 분리된 이유, 11.2 CNM의 3대 구성요소, 11.3 내장 드라이버 개관, 11.4 IPAM 드라이버, 11.5 docker network 명령과 CNM 오퍼레이션의 대응, 11.6 CNM과 CNI, 실습)*
