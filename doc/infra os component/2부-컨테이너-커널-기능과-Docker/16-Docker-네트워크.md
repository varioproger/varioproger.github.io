---
title: "16장. Docker 네트워크"
parent: "2부. 컨테이너 커널 기능과 Docker"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 16
---

# 16장. Docker 네트워크

> **🎮 게임 서버 개발자에게** — 게임 서버를 컨테이너로 옮기면 가장 먼저 부딪히는 것이 네트워크다. `bind(0.0.0.0:7000)`으로 리슨하던 서버가 컨테이너 안에서는 **자기만의 네트워크 스택**(컨테이너 전용 IP, 라우팅 테이블, 포트 공간)을 갖는다. 밖에서 접속하려면 호스트 포트를 컨테이너 포트에 연결(`-p`)해야 하고, 그 연결의 정체는 커널의 NAT 규칙이다. 소켓 프로그래밍으로 익힌 포트·bind·로컬 루프백 감각 위에, **veth, 브리지, DNAT, 내장 DNS**라는 부품이 얹힌다고 보면 된다. 이 장은 부품 하나하나가 리눅스 커널의 무엇인지 밝혀 두는 장이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 같은 호스트의 두 컨테이너가 `ping match-server`처럼 이름으로 서로를 못 찾는다(IP로는 된다).
> - 게임 서버 포트를 `-p 7000:7000`으로 열었는데 외부에서 안 붙거나, 방화벽(ufw)으로 막았는데도 외부에서 붙는다.
> - 지연이 민감한 서버를 `--network host`로 띄우자는 제안이 나오고, 그 대가를 설명해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** Docker 네트워크는 Sandbox(네트워크 네임스페이스)·Endpoint(veth 한쪽 끝)·Network(브리지 등) 세 객체로 추상화되고, 컨테이너 간 통신은 브리지의 L2 스위칭, 외부 통신은 라우팅+NAT, 포트 게시는 iptables DNAT, 이름 해석은 127.0.0.11 내장 DNS가 맡는다.

1. **CNM의 세 객체와 드라이버** — Sandbox는 컨테이너의 네트워크 스택(리눅스에선 네트워크 네임스페이스), Endpoint는 Sandbox를 Network에 잇는 가상 인터페이스, Network는 서로 통신해야 하는 Endpoint 묶음이다. bridge/overlay/macvlan/ipvlan/host/none은 이 모델의 서로 다른 구현이고 IPAM(주소 관리)은 독립된 축이다.
2. **브리지 = 리눅스 브리지 + veth pair** — 기본 `docker0`는 이름 해석이 없고 사용자 정의 브리지는 있다. 같은 브리지 안은 L2 스위칭, 밖으로 나갈 때는 라우팅과 MASQUERADE다.
3. **포트 게시 = DNAT(+docker-proxy), 그리고 방화벽** — `-p`는 `nat` 테이블의 `DOCKER` 체인 DNAT 규칙이며 호스트 방화벽 도구와 규칙 공간을 나눠 쓰다 충돌해 왔다. Engine 28이 미게시 포트를 기본 차단했고, 29의 실험적 nftables 백엔드는 전용 테이블로 격리한다.
4. **내장 DNS(127.0.0.11)** — 사용자 정의 네트워크의 컨테이너는 이름·별칭으로 서로를 찾고, 못 찾은 이름은 호스트의 업스트림 DNS로 넘어간다. 해석 범위는 네트워크 단위다.
5. **네트워크 모드 선택** — host는 네임스페이스를 공유하고, none은 루프백만 두며, macvlan/ipvlan은 NAT 없이 물리망에 직접 노출하지만 호스트와 컨테이너가 기본적으로 직접 통신하지 못한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 프로세스별 `bind()` 포트 공간, `EADDRINUSE` | 컨테이너별 네트워크 네임스페이스 | 포트와 IP는 네트워크 스택 안에서 유일하면 된다 | 컨테이너마다 **독립된 스택**이라 모두 80번 포트를 써도 충돌하지 않는다. `--network host`는 이 격리를 포기해 일반 프로세스처럼 충돌한다 |
| `socketpair()`로 만든 한 쌍의 소켓 양 끝 | veth pair | 한쪽에 넣으면 다른 쪽으로 나온다 | 소켓 바이트 스트림이 아니라 **이더넷 프레임**을 전달하는 가상 NIC 한 쌍이다. 한쪽은 컨테이너의 `eth0`, 다른 쪽은 호스트 브리지에 꽂힌다 |
| 서버 앞단의 L4 릴레이/프록시 서버 | `docker-proxy`(사용자 공간) vs iptables DNAT(커널) | 호스트 포트로 온 연결을 컨테이너로 중계한다 | 기본 경로는 프록시 프로세스가 아니라 **커널 NAT**이다. 사용자 공간 프록시는 hairpin 등을 보완하는 안전판이다 |
| 설정/서비스 레지스트리에서 이름으로 서버를 찾기 | 내장 DNS(127.0.0.11) | 이름 → 주소 해석 | 같은 **사용자 정의 네트워크 안**에서만 해석된다. 기본 브리지에는 없다 |
| 멀티홈 서버가 NIC별로 다른 네트워크에 붙음 | 컨테이너를 여러 네트워크에 동시에 연결 | 인터페이스가 여러 개(`eth0`, `eth1`) | 실행 중에 `docker network connect`로 재시작 없이 추가할 수 있다 |
| `iptables`/`ufw`로 서버 방화벽 설정 | Docker의 iptables/nftables 규칙 | 같은 netfilter를 쓴다 | Docker가 같은 체인 공간에 규칙을 끼워 넣어 `ufw`의 의도를 우회하는 일이 있었다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 같은 호스트의 컨테이너 A와 B가 통신할 때, 컨테이너가 인터넷으로 나갈 때, 외부에서 컨테이너로 들어올 때 패킷 경로는 각각 어떻게 다를까?
> 2. `-p 8080:80`은 커널에 무엇을 만들까? 프로세스일까, 규칙일까?
> 3. 컨테이너의 `/etc/resolv.conf`에 `nameserver 127.0.0.11`이 있다면 그건 누가 응답하는 서버일까?
> 4. `--network host` 컨테이너는 왜 `-p`가 필요 없고, 무엇을 잃을까?
>
> **처리법:** 🛠 실습 `docker exec web ip link show eth0`, `bridge link show`, `iptables-save -t nat | grep -i docker`, `docker run --rm --network mynet alpine cat /etc/resolv.conf` → 바로 실행 · 🗺 관계도 Sandbox - Endpoint(veth) - Network(브리지), PREROUTING → DOCKER 체인 DNAT → FORWARD → docker0 → veth → eth0 · 📦 카드로 6개 모드 비교 표, macvlan 4모드, 옵션(`--dns`, `--dns-search`, `--dns-option`, `--add-host`)

### 이 장에서 배우는 것

- CNM 세 객체와 드라이버·IPAM 구조, CNM과 CNI의 차이
- 브리지·veth, 컨테이너 간(L2)과 외부(라우팅+NAT) 통신 경로
- 포트 게시의 DNAT/docker-proxy, 방화벽 충돌과 Engine 28·29의 변화
- 내장 DNS의 동작과 DNS 관련 옵션, 진단 순서
- host·none·macvlan·ipvlan 모드의 특성과 선택 기준

---

## 코어 1. CNM의 세 객체와 드라이버

### 1.1 libnetwork과 CNM

**한 줄 요약:** 네트워킹 로직을 dockerd 코어에서 라이브러리(libnetwork)로 분리하고, 그 모델이 CNM이다.

초기 Docker는 브리지 생성, veth 연결, iptables 규칙 삽입이 dockerd 안에 박혀 있어서 새 드라이버를 추가하려면 dockerd 자체를 고쳐야 했다. 여러 호스트에 걸친 통신(오버레이)이 필요해지고 SDN 벤더들이 통합을 원하면서 이 구조는 한계에 부딪혔고, 네트워킹이 `libnetwork`이라는 독립 Go 라이브러리로 분리됐다. libnetwork은 정책과 모델(CNM)을 정의하고 실제 패킷 처리는 플러그형 드라이버에 맡긴다. 단, **별도 프로세스나 데몬이 아니라 dockerd에 링크되어 동작하는 라이브러리**다(`docker network create` 요청을 받는 주체는 여전히 dockerd 프로세스다).

### 1.2 Sandbox, Endpoint, Network

**한 줄 요약:** Sandbox는 컨테이너의 스택, Endpoint는 연결 지점, Network는 연결 가능한 Endpoint의 묶음이다.

- **Sandbox:** 컨테이너 하나의 네트워크 스택 전체(인터페이스, 라우팅 테이블, `/etc/resolv.conf`). 리눅스에서는 대부분 [네임스페이스](09-네임스페이스.md)의 네트워크 네임스페이스로 구현된다. 하나의 Sandbox가 여러 Network에 동시에 붙을 수 있다(`eth0`, `eth1`).
- **Endpoint:** Sandbox를 특정 Network에 연결하는 가상 인터페이스. 브리지 드라이버에서는 veth pair의 컨테이너 쪽 끝이다. 정확히 하나의 Network, 하나의 Sandbox에만 속한다. 네트워크 두 개에 붙으면 Endpoint도 둘이다.
- **Network:** 서로 통신해야 하는 Endpoint의 논리적 그룹. 구현은 드라이버 몫이다. 브리지라면 리눅스 브리지 디바이스(`docker0` 또는 사용자 정의 브리지) 하나, 오버레이라면 VXLAN VNI 하나다.

```
[ 컨테이너 A ]                              [ 컨테이너 B ]
   Sandbox A (network namespace)               Sandbox B (network namespace)
   Endpoint A1 ── veth pair ──┐             ┌── veth pair ── Endpoint B1
                       ┌──────┴─────────────┴──────┐
                       │      Network "app-net"     │
                       │   (리눅스 브리지 또는 VXLAN) │
                       └────────────────────────────┘
```

### 1.3 드라이버, IPAM, 명령 대응

**한 줄 요약:** 드라이버는 갈아 끼우는 부품이고 CNM은 그것들이 따르는 규격이며, `docker network` 명령은 CNM 오퍼레이션이다.

| 드라이버 | 한 줄 요약 | 이 장 위치 |
|---|---|---|
| `bridge` | 단일 호스트에서 리눅스 브리지로 컨테이너를 연결하는 기본 드라이버 | 코어 2 |
| `overlay` | VXLAN 캡슐화로 여러 호스트에 걸친 L2 네트워크 구성(Swarm) | 이 책의 범위 밖 |
| `macvlan` / `ipvlan` | 컨테이너를 물리 네트워크에 직접 노출 | 코어 5 |
| `host` | 호스트의 네트워크 네임스페이스를 그대로 사용 | 코어 5 |
| `none` | 루프백만 두고 아무 인터페이스도 구성하지 않음 | 코어 5 |

**IPAM**(IP Address Management) 드라이버는 연결 방식(드라이버)과 독립된 축으로 서브넷·게이트웨이·할당 범위를 관리한다. 기본 IPAM이 사설 대역에서 서브넷을 골라 주지만 사내 대역과 충돌하지 않도록 직접 지정하는 경우가 많다.

```bash
docker network create \
  --driver bridge \
  --subnet 172.28.0.0/16 \
  --gateway 172.28.0.1 \
  --ip-range 172.28.5.0/24 \
  app-net
```

`--ip-range`는 자동 할당 범위를 좁히고, 그 밖의 서브넷 안 주소는 `docker run --ip`로 고정 할당할 수 있다. 사용자 정의 IPAM은 `--ipam-driver`로 플러그인에 위임한다.

| CLI 명령 | CNM 오퍼레이션 |
|---|---|
| `docker network create` | Network 생성(드라이버가 브리지·VNI 등 실체 준비) |
| `docker network inspect` | Network/Endpoint 조회(Endpoint IP, 연결된 컨테이너) |
| `docker network connect` | Endpoint 생성 + Sandbox에 join (실행 중 컨테이너에 새 인터페이스가 즉시 추가) |
| `docker network disconnect` | Endpoint를 Sandbox에서 leave + 삭제 |
| `docker network rm` | Network 삭제(연결된 Endpoint가 없을 때만) |
| `docker run --network <net>` | Sandbox 생성 + Endpoint 생성/연결을 한 번에 |

### 1.4 CNM과 CNI는 다르다

**한 줄 요약:** CNM은 Docker의 풍부한 객체 모델이고 CNI는 쿠버네티스가 택한 ADD/DEL 훅이다.

CNM은 Network·Endpoint·Sandbox와 생명주기 전체를 libnetwork 안에서 일관되게 관리한다. CNI는 "이미 만들어진 컨테이너의 네트워크 네임스페이스 경로를 받아, 그 안에 인터페이스를 붙이고(ADD) 떼는(DEL)" 훨씬 좁은 계약이고, 플러그인은 JSON으로 통신하는 단일 실행 파일이다. 쿠버네티스는 파드 안 컨테이너들이 네임스페이스를 공유하는 모델을 이미 갖고 있었고 특정 런타임 라이브러리에 종속되지 않는 단순한 계약을 원해서 CNI를 택했다. Docker Engine 단독 사용은 CNM(`docker network` 체계), 쿠버네티스 노드 네트워킹은 CNI 플러그인 체계를 이해해야 한다([26장](../3부-쿠버네티스-구성-요소/26-쿠버네티스-네트워크-모델과-CNI.md)).

## 코어 2. 브리지 = 리눅스 브리지 + veth pair

### 2.1 기본 브리지와 사용자 정의 브리지

**한 줄 요약:** 둘 다 리눅스 브리지지만, 기본 브리지(`docker0`)에는 컨테이너 이름 해석이 없다.

`--network`를 지정하지 않으면 컨테이너는 기본 `bridge` 네트워크(`docker0`)에 붙는다. 여기서는 컨테이너끼리 이름으로 통신할 수 없고 `--link` 같은 레거시나 IP를 직접 써야 했다. `docker network create -d bridge my-net`으로 만든 **사용자 정의 브리지**는 컨테이너 이름(또는 `--network-alias` 별칭)이 내장 DNS로 해석된다(코어 4). 또 기본 브리지의 컨테이너들은 하나의 평평한 공간에 놓이지만, 서로 다른 사용자 정의 브리지의 컨테이너는 `docker network connect` 없이는 기본적으로 격리된다. 그래서 실무는 프로젝트마다 사용자 정의 브리지를 만든다. Docker Compose가 프로젝트별 전용 네트워크를 자동 생성하는 이유도 같다.

### 2.2 veth pair: 컨테이너와 호스트를 잇는 가상 케이블

**한 줄 요약:** 한 쌍의 가상 NIC 중 한쪽은 컨테이너의 `eth0`(Endpoint), 다른 쪽은 호스트의 브리지에 꽂힌다.

```
[ 호스트 네트워크 네임스페이스 ]                [ 컨테이너 네트워크 네임스페이스 ]
   docker0 (브리지)
       ├── vethXXXXXXX@if5  ◄──── veth pair ────►  eth0@if6   (컨테이너 쪽 = Endpoint)
       └── vethYYYYYYY@if7  ◄──── veth pair ────►  eth0@if8   (다른 컨테이너)
```

대응 관계는 직접 확인할 수 있다.

```bash
docker exec web ip link show eth0     # 예: 6: eth0@if7: <BROADCAST,MULTICAST,UP,LOWER_UP> ...
ip link show type veth
bridge link show
```

`eth0@if7`의 `@if` 뒤 숫자는 반대쪽 끝이 **호스트 네임스페이스에서 갖는 인터페이스 인덱스**다. 호스트의 `ip link`에서 같은 인덱스를 찾으면 짝이 되는 veth다. 예전에 쓰던 `brctl show docker0`은 `bridge-utils` 패키지 도구라 최근 배포판에는 기본으로 없는 경우가 많고, 요즘은 iproute2의 `bridge link show`나 `bridge fdb show br docker0`를 쓴다.

### 2.3 통신 경로: 컨테이너 간 vs 외부

**한 줄 요약:** 같은 브리지 안은 L2 스위칭(NAT 없음), 밖으로 나가는 통신은 라우팅+MASQUERADE다.

- **같은 브리지의 컨테이너 간:** A → veth → `docker0`가 학습한 MAC 테이블(FDB)로 B의 veth로 프레임을 전달한다. 라우팅도 NAT도 개입하지 않는다. 물리 이더넷 스위치와 개념이 같다.
- **외부로 나가는 통신:** 목적지가 브리지 대역 밖이므로 컨테이너의 기본 게이트웨이(브리지 IP, 예: `172.17.0.1`)를 거쳐 커널 IP 포워딩 경로로 올라가고, `nat` 테이블 `POSTROUTING`의 MASQUERADE 규칙이 출발지 IP를 호스트 외부 인터페이스 IP로 치환한다(아웃바운드 NAT).

```bash
iptables -t nat -L POSTROUTING -n -v | grep -i MASQUERADE
```

이 경로 구분은 소켓 지식과 이어진다. 게임 서버가 외부 인증 서버에 접속할 때 상대가 보는 출발지 IP는 컨테이너 IP가 아니라 호스트 IP다([네트워크 스택](../1부-리눅스-OS-구성-요소/06-네트워크-스택.md)).

## 코어 3. 포트 게시 = DNAT(+docker-proxy), 그리고 방화벽

### 3.1 `-p`가 커널에 만드는 것

**한 줄 요약:** `-p 8080:80`은 프로세스가 아니라 `nat` 테이블의 DNAT 규칙이다.

`-p 8080:80`으로 컨테이너를 띄우면 Docker는 `nat` 테이블의 `DOCKER` 체인에 "호스트 8080으로 오는 패킷의 목적지를 컨테이너 IP:80으로 바꿔라"는 DNAT 규칙을 추가하고, `PREROUTING`(그리고 호스트 자신에서 접속하는 경우를 위한 `OUTPUT`) 체인이 `DOCKER` 체인으로 점프하도록 연결해 둔다.

```
(외부에서 온 패킷, dst=host_ip:8080)
        ▼
PREROUTING (nat 테이블) ── DOCKER 체인으로 점프
        ▼
DNAT: dst를 container_ip:80 으로 변경
        ▼
라우팅 결정 (목적지가 컨테이너 IP이므로 docker0 방향)
        ▼
FORWARD 체인 (filter 테이블) ── ACCEPT/DROP 판단
        ▼
docker0 브리지 → veth(호스트 쪽) → veth(컨테이너 쪽)
        ▼
컨테이너 네트워크 네임스페이스의 eth0:80 (서버 프로세스가 accept)
```

핵심은 DNAT가 **라우팅 결정보다 앞선 `PREROUTING`** 에서 일어난다는 점이다. 주소가 컨테이너 IP로 바뀐 뒤에 라우팅이 다시 판단한다. 응답은 conntrack이 기억한 연결 정보로 자동 복원(un-DNAT)되어 클라이언트는 자기가 접속한 `host_ip:8080`만 본다. 이 경로에는 사용자 공간 프로세스가 없다. 확인은 다음과 같다.

```bash
docker run -d --name web -p 8080:80 nginx:latest
iptables-save -t nat | grep -i docker
# -p tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80 형태의 규칙
```

### 3.2 docker-proxy는 안전판

**한 줄 요약:** 포트마다 호스트 포트를 bind하고 연결을 중계하는 사용자 공간 프로세스로, DNAT만으로 깔끔하지 않은 경우를 보완한다.

포트를 게시할 때 dockerd는 호스트 게시 포트를 직접 bind해 컨테이너 IP:포트로 중계하는 `docker-proxy` 프로세스를 띄운다. 호스트 자신이 루프백(`127.0.0.1`)으로 자기가 게시한 포트에 접속하거나, 컨테이너가 호스트의 공인 IP 같은 게시 주소로 되돌아 들어오는 hairpin NAT, IPv6 처리가 얽히는 경우처럼 DNAT 규칙만으로 왕복 경로가 완성되지 않는 케이스를 사용자 공간에서 일관되게 처리하는 역할이다. 오늘날에는 커널의 브리지 netfilter 훅과 conntrack이 개선되어 대부분의 최신 배포판에서 hairpin도 커널 DNAT만으로 처리되지만, 오래된 커널이나 브리지 netfilter가 꺼진 환경에서는 경계 사례가 어긋날 수 있다. 실무에서는 컨테이너가 자기 자신의 게시 주소를 호출하는 설계 자체를 피하고 컨테이너 이름이나 `localhost`로 접근하는 것이 가장 확실하다.

```json
{ "userland-proxy": false }
```

`daemon.json`에서 `userland-proxy`를 `false`로 하면 `docker-proxy`가 뜨지 않고 커널 NAT 경로만 남는다. 호스트당 게시 포트가 많은 환경에서 프로세스 수를 줄이는 이득이 있지만, 끄기 전에 호스트 자신의 루프백 접근이 필요한지 점검한다. 현재 프록시는 `ps -ef | grep docker-proxy`로 보며 `-host-port 8080 -container-ip 172.17.0.2 -container-port 80` 같은 인자가 나온다. 이 구조는 소켓 지식으로 보면 "L4 릴레이 서버(사용자 공간)"와 "커널이 주소를 고쳐 쓰는 NAT"의 병존이다.

### 3.3 Engine 28: 게시하지 않은 포트를 기본 차단

**한 줄 요약:** `-p`로 열지 않은 컨테이너 포트로의 직접 라우팅 접근이 기본 차단되도록 바뀌었다.

문제의 배경은 두 가지였다. 첫째, 많은 배포판의 기본 iptables 정책이 `ACCEPT`이고 Docker가 컨테이너 네트워크로 가는 트래픽을 따로 필터링하지 않아서, 네트워크 경로만 있으면(같은 사설망, 클라우드 VPC 라우팅) 게시하지 않은 포트에 **컨테이너 IP로 직접** 접근할 수 있었다. 둘째, Docker는 `FORWARD` 체인에 자기 `DOCKER` 체인으로 점프하는 규칙을 앞쪽에 삽입하는데, `ufw`/`firewalld`의 규칙은 흔히 `INPUT`이나 자기 관리 체인에 들어간다. 컨테이너로 가는 트래픽은 대부분 `INPUT`이 아니라 `FORWARD`를 지나므로, 관리자가 `ufw`로 막아도 Docker 규칙이 먼저 처리해 의도가 우회됐다. 이것은 버그라기보다 컨테이너 규칙과 호스트 정책 규칙이 같은 netfilter 체인 공간을 조율 없이 나눠 쓰던 구조 문제였다.

Docker Engine 28.0.0은 게시하지 않은 포트의 인바운드 트래픽을 컨테이너 IP 기준으로 `DOCKER` 체인 레벨에서 기본 차단한다(Linux iptables 기반만 해당, VM 계층을 쓰는 Docker Desktop은 영향 없음). 이전 동작이 필요하면 `gateway_mode_ipv4`/`gateway_mode_ipv6`를 `nat-unprotected`로 설정해 복원할 수 있지만 이름 그대로 보호되지 않는 상태이므로 포트를 정식 게시하는 쪽이 권장된다. 다만 이것이 충돌 전체를 해소한 것은 아니다. **게시된 포트에는 여전히 Docker 규칙이 우선**한다.

### 3.4 Engine 29: 실험적 nftables 백엔드

**한 줄 요약:** Docker 전용 테이블로 규칙을 격리해 다른 방화벽 도구와의 충돌을 줄이는 방향이지만 아직 실험적이다.

iptables의 한계는 규칙 순회가 선형이고 IPv4/IPv6/브리지/ARP 도구(`iptables`, `ip6tables`, `ebtables`, `arptables`)가 파편화되어 있다는 점이다. 현대 배포판의 `iptables` 명령은 이미 `iptables-nft`라는 호환 레이어로 nftables 커널 서브시스템에 규칙을 적재한다(과거 구현은 `iptables-legacy`로 남고 `update-alternatives`로 전환). legacy와 nft가 섞이면 서로의 규칙을 인식하지 못해 진단이 어려워진다. nftables는 단일 프레임워크(`inet` 패밀리로 IPv4/IPv6 동시), 커널 내 바이트코드 가상 머신, 세트/맵 기반 매칭(해시/트리라 규칙이 늘어도 선형으로 늘지 않음)으로 설계됐다.

Docker 29.0.0은 이를 호환 레이어 없이 netlink으로 직접 쓰는 실험적 백엔드를 도입했다.

```bash
dockerd --firewall-backend=nftables
```

```json
{ "firewall-backend": "nftables" }
```

`daemon.json`에 넣고 데몬을 재시작한다. 달라지는 점은 다음과 같다.

- 호스트 네임스페이스에 `ip docker-bridges`, `ip6 docker-bridges`라는 **Docker 전용 테이블**을 만들어 거기에 체인과 우선순위를 스스로 구성한다(DNS 관련 규칙은 컨테이너 네임스페이스 안에도 생성). `nft list table ip docker-bridges`로 분리해서 볼 수 있다.
- iptables 방식의 `DOCKER-USER` 체인(관리자 규칙을 Docker보다 먼저 평가시키는 훅)은 그대로 존재하지 않는다. 별도 nftables 테이블을 만들고 우선순위를 `docker-bridges`와의 관계 속에서 직접 조정해야 한다.
- 공식 문서는 구성 옵션·동작·구현이 바뀔 수 있는 **실험적** 기능이라고 경고한다. 프로덕션 전면 도입은 신중해야 한다.
- Swarm 모드에서는 오버레이 규칙이 아직 이관되지 않아 활성화가 거부된다. macvlan/ipvlan은 애초에 NAT·포트 게시 경로를 거치지 않으므로 이 전환과 무관하다. 영향은 브리지 네트워크의 포트 게시 경로에 국한된다.

> **[보충]** `ufw`/`firewalld`로 막은 포트가 Docker 게시 포트로 새는 현상에 대한 구체적 운영 처방(규칙 배치 위치 등)은 원천에 없다. iptables 백엔드에서는 `DOCKER-USER` 체인이 이를 위한 관리자 훅이라는 것까지만 원문에 근거한다.

## 코어 4. 내장 DNS(127.0.0.11)

### 4.1 127.0.0.11의 정체

**한 줄 요약:** 사용자 정의 네트워크의 컨테이너는 dockerd 내장 리졸버를 네임서버로 쓰고, 못 찾은 이름은 호스트의 업스트림 DNS로 포워딩된다.

```bash
docker network create mynet
docker run --rm --network mynet alpine:latest cat /etc/resolv.conf
# nameserver 127.0.0.11
# options ndots:0
```

`127.0.0.11`은 컨테이너 자신의 로컬 프로세스가 아니라 dockerd가 컨테이너의 네트워크 네임스페이스 안에 심어 둔 가상 DNS 리스너다. 네임스페이스 안에 `127.0.0.11:53`(UDP/TCP) 쿼리를 가로채는 DNAT 규칙을 두고, 실제 처리는 dockerd(libnetwork) 안의 내장 리졸버가 한다. 리졸버는 그 네트워크에 속한 컨테이너의 이름-IP 매핑(드라이버가 연결/해제 때마다 갱신하는 서비스 디스커버리 정보)을 조회한다. 컨테이너 이름뿐 아니라 `--network-alias` 별칭, Compose 서비스 이름과 자동 별칭도 같은 방식이다. 내부 테이블에 없는 이름(`api.example.com` 같은)은 실패시키지 않고 호스트 `/etc/resolv.conf`의 네임서버(또는 `--dns`로 지정한 서버)로 그대로 포워딩한다. 사용자 정의 네트워크에서는 업스트림 서버에 순서대로 질의해 성공 응답이나 NXDOMAIN이 오면 즉시 중단한다.

### 4.2 기본 브리지에 없는 이유, `--link`의 역사

**한 줄 요약:** 기본 브리지는 서비스 디스커버리 개념이 없던 시절의 산물이고, 당시 대체재 `--link`는 `/etc/hosts`에 한 번 정적으로 기록하는 방식이었다.

기본 브리지 컨테이너의 `/etc/resolv.conf`에는 `127.0.0.11`이 아닌 호스트 네임서버 설정이 복사되어 있다. `--link`는 대상 IP를 확인해 `/etc/hosts`에 정적으로 한 줄 넣었기 때문에 IP가 바뀌면 갱신할 방법이 없었고 동적으로 늘어나는 서비스 그룹을 표현할 수 없었다. 사용자 정의 네트워크는 내장 DNS 테이블이 연결/해제 시 함께 갱신되어 이 문제를 근본적으로 해결했다. `--link`는 레거시이므로 새 구성에서는 쓰지 않는다.

### 4.3 DNS 옵션과 진단 순서

**한 줄 요약:** 옵션은 컨테이너 생성 시점에 `/etc/resolv.conf`·`/etc/hosts`에 정적으로 기록되고, 장애는 정형화된 원인 네 가지로 좁혀진다.

- `--dns`: `nameserver` 추가(사용자 정의 네트워크에서는 내장 DNS가 외부 이름을 포워딩할 때 참조하는 업스트림에 영향)
- `--dns-search`: `search` 도메인
- `--dns-option`: `ndots`, `timeout`, `attempts` 등 `options`(사용자 정의 네트워크 기본은 `ndots:0`)
- `--add-host host:ip`: `/etc/hosts`에 정적 매핑. DNS 질의를 거치지 않아 항상 즉시 해석된다. `host-gateway` 값은 호스트를 가리키는 내부 IP로 치환된다.

실행 중 호스트의 DNS 설정이 바뀌어도 이미 떠 있는 컨테이너의 `resolv.conf`가 자동 갱신되지는 않는 것이 일반적이며(일부 예외 있음), 반영하려면 컨테이너를 재생성한다.

진단은 이 순서로 한다.

1. 조회하는 쪽과 대상이 **같은 사용자 정의 네트워크**에 있는가? 해석 범위는 네트워크 단위다(서로 다른 네트워크는 둘 다 127.0.0.11을 갖고 있어도 서로 못 찾는다).
2. 컨테이너가 **기본 브리지**에 붙어 있지 않은가? `--network` 미지정이면 여기에 붙는다.
3. `ndots`/검색 도메인이 의도치 않은 이름을 조회하게 하지 않는가? 쿠버네티스 설정을 가져와 `ndots:5`로 키우면 짧은 이름 하나에도 검색 도메인을 덧붙여 여러 번 질의한다.
4. 애플리케이션 자체 DNS 캐싱이 TTL을 무시하지 않는가? 일부 런타임(특히 JVM 계열)은 기본 캐시가 길어 IP가 바뀐 뒤에도 옛 IP로 접속한다. Docker 내장 DNS 문제가 아니다.

DNS의 일반 동작(resolv.conf, 검색 도메인)은 [네트워크 스택](../1부-리눅스-OS-구성-요소/06-네트워크-스택.md)과, 쿠버네티스의 CoreDNS와 `ndots`는 [28장](../3부-쿠버네티스-구성-요소/28-CoreDNS-Ingress-NetworkPolicy.md)과 이어진다.

## 코어 5. 네트워크 모드 선택

### 5.1 macvlan과 ipvlan: NAT 없이 물리망에 직접

**한 줄 요약:** 컨테이너가 물리 네트워크에서 독립된 장비처럼 보이게 하지만, 호스트와 컨테이너가 직접 통신하지 못하는 커널 제약이 있다.

NAT를 우회하려는 이유는 세 가지다. 자기 IP/MAC을 라이선스·클러스터 멤버십·멀티캐스트 디스커버리에 쓰는 레거시 소프트웨어, 서비스마다 고유 IP와 표준 포트를 전제로 설계된 네트워크 정책, 그리고 conntrack을 거치는 NAT 오버헤드가 문제가 되는 고성능 워크로드다.

- **macvlan:** 부모 물리 인터페이스 위에 컨테이너마다 **고유 MAC**을 가진 서브인터페이스를 만든다. veth·브리지·호스트 IP 스택을 거치지 않고 MAC 기준으로 프레임이 분배된다. 모드는 `bridge`(기본, 같은 부모끼리 커널 내부 스위칭), `vepa`(같은 부모끼리도 외부 스위치로 보냈다 되돌림), `private`(상호 통신 차단), `passthru`(부모 NIC를 컨테이너 하나에 통째로)다. 부모는 `eth0.20`처럼 802.1Q VLAN 서브인터페이스도 가능하다. 단 NIC/스위치가 promiscuous mode와 포트당 다중 MAC 학습을 허용해야 하고, 퍼블릭 클라우드의 가상 NIC는 소스/목적지 MAC 검사로 트래픽을 조용히 드롭하는 경우가 많다.
- **ipvlan:** 컨테이너들이 **부모의 MAC을 공유**하고 IP 기준으로 분배한다. MAC 개수 제한이 있는 스위치/클라우드에서 대안이다. L2 모드(기본, 같은 브로드캐스트 도메인)와 L3 모드(브로드캐스트·멀티캐스트 미전달, 커널이 IP로 라우팅하며 다른 서브넷끼리 외부 라우터 없이 통신 가능, 고정 IP 사용이 일반적)가 있다.

```bash
docker network create -d macvlan \
  --subnet=192.168.10.0/24 --gateway=192.168.10.1 \
  -o parent=eth0 mv-net
```

**공통 제약:** 컨테이너는 물리망의 다른 장비와는 통신하는데 정작 실행 중인 호스트와는 ping조차 안 된다. 호스트의 `eth0`과 그 위의 서브인터페이스 사이에는 패킷을 분배하는 경로가 커널에 없기 때문이다(macvlan bridge, ipvlan L2 모두 해당). 우회는 호스트에도 같은 부모를 쓰는 macvlan 서브인터페이스를 하나 더 만드는 것이다.

```bash
sudo ip link add mv-shim link eth0 type macvlan mode bridge
sudo ip addr add 192.168.10.200/24 dev mv-shim
sudo ip link set mv-shim up
```

호스트에서 컨테이너로 헬스체크를 하는 설계를 세울 때 미리 감안해야 한다.

### 5.2 host와 none

**한 줄 요약:** host는 네트워크 네임스페이스를 공유해 성능을 얻는 대신 격리와 포트 독립성을 잃고, none은 루프백만 남기는 완전 격리다.

`--network host`는 `CLONE_NEWNET`을 쓰지 않으므로 컨테이너가 호스트의 네트워크 네임스페이스를 그대로 본다. 컨테이너 전용 IP가 없고 호스트 IP로 직접 리슨하며 `-p`는 무시된다. veth·브리지·conntrack NAT 단계가 사라져 초당 수만&#126;수십만 연결을 다루는 프록시·로드밸런서·패킷 캡처처럼 지연과 처리량이 민감한 워크로드에서 선호된다. 대가는 명확하다. 포트 네임스페이스도 공유하므로 같은 포트를 리슨하는 두 컨테이너는 일반 프로세스끼리처럼 충돌(`EADDRINUSE`)하고, 침해 시 노출되는 네트워크 표면이 넓어지며, `NET_ADMIN` capability와 결합되면 컨테이너에서 호스트의 방화벽 규칙을 조작할 수 있다. 신뢰할 수 있고 성능이 명확한 우선순위인 워크로드에 한정한다.

`--network none`은 독립된 네트워크 네임스페이스에 루프백(`lo`)만 남긴다(기본 UP이 아닌 경우가 많음). 네트워크가 필요 없는 배치 작업의 공격 표면을 줄이거나, 별도 CNI·SR-IOV 같은 다른 솔루션을 외부 도구가 컨테이너 네임스페이스에 직접 붙이게 할 때 쓴다.

### 5.3 여섯 모드 비교

**한 줄 요약:** 네임스페이스 분리 여부, 컨테이너 IP, NAT 필요 여부, 호스트-컨테이너 통신 가능 여부로 고른다.

| 모드 | 네트워크 네임스페이스 | 컨테이너 IP | NAT 필요 여부 | 호스트-컨테이너 통신 | 주 용도 |
|---|---|---|---|---|---|
| bridge(사용자 정의) | 분리 | 사설 대역, 브리지 경유 | 필요(포트 매핑) | 가능 | 범용 단일 호스트 |
| overlay | 분리 | VXLAN 오버레이 대역 | 필요(ingress 등) | 가능(호스트도 참여 시) | Swarm 멀티호스트 |
| macvlan | 분리 | 물리망 대역, 고유 MAC | 불필요 | 기본 불가(우회 필요) | 레거시 IP/MAC 요구 |
| ipvlan | 분리 | 물리망 대역, MAC 공유 | 불필요 | 기본 불가(우회 필요) | MAC 제한 환경 |
| host | 미분리(호스트 공유) | 호스트 IP 그대로 | 불필요 | 구분 자체가 없음 | 고성능, 신뢰 워크로드 |
| none | 분리(루프백만) | 없음 | 해당 없음 | 불가 | 완전 격리, 수동 구성 |

## 실무 적용

### 체크리스트

- [ ] CNM의 Sandbox(네트워크 네임스페이스), Endpoint(veth 컨테이너 쪽), Network(브리지 등)가 각각 커널의 무엇인지 설명할 수 있다.
- [ ] 프로젝트마다 사용자 정의 브리지를 만들어 쓰고, 기본 `docker0`에 의존하지 않는다(이름 해석, 격리).
- [ ] 서브넷이 사내 대역과 겹치지 않도록 `--subnet`/`--gateway`/`--ip-range` 또는 `default-address-pools`를 명시했는가?
- [ ] 패킷 경로를 구분한다: 컨테이너 간(L2) / 외부로 나감(라우팅+MASQUERADE) / 외부에서 들어옴(PREROUTING DNAT → FORWARD → 브리지 → veth).
- [ ] 게시 포트를 `iptables-save -t nat | grep -i docker`와 `ps -ef | grep docker-proxy`로 확인할 줄 안다.
- [ ] `ufw`/`firewalld` 규칙이 Docker 게시 포트에 적용되지 않을 수 있음을 알고, Engine 28의 미게시 포트 기본 차단과 한계(게시 포트는 Docker 규칙 우선)를 구분한다.
- [ ] 이름 해석 장애는 "같은 사용자 정의 네트워크인가 → 기본 브리지인가 → `ndots`/검색 도메인 → 앱 DNS 캐시" 순으로 점검한다.
- [ ] `--network host` 도입 시 포트 충돌·격리 약화·`NET_ADMIN` 결합 위험을 확인했는가? macvlan/ipvlan이면 호스트-컨테이너 직접 통신 불가와 클라우드 MAC 필터링을 고려했는가?

### 시나리오로 확인하기

1. **상황:** 같은 호스트에서 `docker run`으로 띄운 매치 서버 컨테이너와 게이트웨이 컨테이너가 있다. 게이트웨이에서 `ping match-server`가 `bad address`로 실패하는데 `ping 172.17.0.3`은 된다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   `--network`를 지정하지 않아 둘 다 기본 브리지(`docker0`)에 붙어 있고, 기본 브리지에는 내장 DNS 기반 이름 해석이 없다(`resolv.conf`에 127.0.0.11이 아닌 호스트 네임서버가 복사됨). `docker network create`로 사용자 정의 브리지를 만들어 두 컨테이너를 연결하면 컨테이너 이름이 127.0.0.11 내장 DNS로 해석된다. `--link`는 레거시이므로 쓰지 않는다. → 코어 2, 코어 4

   </details>

2. **상황:** 게임 서버가 `-p 7000:7000`으로 게시돼 있다. 운영팀이 `ufw`로 7000을 막았는데 외부에서 여전히 접속된다.
   **질문:** 왜 그럴 수 있고 무엇을 확인·검토하나?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너로 가는 트래픽은 `INPUT`이 아니라 `FORWARD`를 지나는데, Docker가 `FORWARD`에 자기 `DOCKER` 체인 점프 규칙을 앞쪽에 넣어 `ufw` 규칙보다 먼저 처리되기 때문이다(같은 netfilter 체인 공간을 조율 없이 공유). Engine 28은 미게시 포트를 기본 차단했지만 게시된 포트는 여전히 Docker 규칙이 우선이다. `iptables-save -t nat | grep -i docker`로 DNAT 규칙을 확인하고, iptables 백엔드에서는 관리자 훅인 `DOCKER-USER` 체인을 쓴다. Engine 29의 nftables 백엔드는 전용 테이블+우선순위 조정 방식으로 바뀌며 아직 실험적이다. → 코어 3

   </details>

3. **상황:** 지연에 민감한 게임 서버를 `--network host`로 띄우자는 제안이 나왔다.
   **질문:** 얻는 것과 잃는 것은?

   <details markdown="1"><summary>답 확인</summary>

   얻는 것: veth·브리지·conntrack NAT 경로가 사라져 지연·처리량 이점, `-p` 불필요. 잃는 것: 네트워크 네임스페이스와 포트 공간을 호스트와 공유하므로 같은 포트를 리슨하는 컨테이너 둘이 충돌하고(일반 프로세스의 `EADDRINUSE`와 동일), 컨테이너 침해 시 호스트의 모든 인터페이스·라우팅 정보가 노출되며 `NET_ADMIN`이 결합되면 호스트 방화벽 규칙까지 조작될 수 있다. 신뢰할 수 있고 성능이 명확한 우선순위일 때로 한정한다. → 코어 5

   </details>

4. **상황:** 레거시 앱을 물리망에 직접 노출하려고 macvlan을 구성했다. 다른 서버에서는 컨테이너에 접속되는데, 컨테이너가 도는 호스트에서 `ping`하면 실패한다.
   **질문:** 설정 오류인가? 어떻게 우회하나?

   <details markdown="1"><summary>답 확인</summary>

   설정 오류가 아니라 커널 구조상의 제약이다. 호스트의 부모 인터페이스와 그 위의 macvlan 서브인터페이스 사이에는 패킷을 분배하는 경로가 없다(ipvlan L2도 동일). 호스트에도 같은 부모를 쓰는 macvlan 서브인터페이스(`mv-shim`)를 `ip link add ... type macvlan mode bridge`로 만들어 컨테이너와 같은 대역의 IP를 주면 통신된다. Docker CLI가 자동으로 만들어 주지 않는다. → 코어 5

   </details>

📖 출처: docker-fundamental/11_libnetwork과_CNM(Container_Network_Model).md, docker-fundamental/12_브리지_네트워크_심화.md, docker-fundamental/14_macvlan_ipvlan_host-none_네트워크_모드.md, docker-fundamental/15_DNS와_서비스_디스커버리_포트_매핑의_내부_동작.md, docker-fundamental/16_방화벽_백엔드의_전환.md

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] CNM: Sandbox = ( ? ) / Endpoint = veth ( ? ) / Network = ( ? )
         libnetwork = dockerd 에 ____ 된 Go ____ (별도 데몬 아님).  IPAM = ____ 관리 (독립 축)
         CNM(Docker) vs CNI(쿠버네티스): 객체 3개 모델 vs ____ / ____ 훅

[코어 2] 같은 브리지 안: ____ 스위칭(NAT 없음) / 밖으로: 게이트웨이 → 라우팅 → ____
         eth0@ifN 의 N = 반대쪽 veth 의 ____ 번호.  이름 해석: 기본 브리지 ____ / 사용자 정의 ____

[코어 3] -p 8080:80 → nat 테이블 ____ 체인 DNAT (시점 = ____ , 라우팅 결정 ____ )
         보완: ____ (사용자 공간 프록시).   28: ____ 포트 기본 차단.  29: 전용 테이블 ____
         DOCKER-USER 는 nftables 백엔드에서 ____

[코어 4] resolv.conf: nameserver ____ (내장 DNS) → 못 찾으면 호스트 ____ 로 포워딩
         진단: 같은 ____ ? → ____ 브리지 ? → ndots ? → 앱 ____ 캐시 ?

[코어 5] host: 네임스페이스 ____ / none: ____ 만 / macvlan: 고유 ____ / ipvlan: ____ 공유
         macvlan·ipvlan 공통 제약: ____ ↔ 컨테이너 직접 통신 불가 → ____ 로 우회
```

### 2. 인출 질문

1. CNM의 세 객체를 리눅스 커널의 무엇이 구현하는지 말해 보라(브리지 드라이버 기준).

   <details markdown="1"><summary>답 확인</summary>

   Sandbox는 컨테이너의 네트워크 스택 전체로 대부분 네트워크 네임스페이스다. Endpoint는 veth pair의 컨테이너 쪽 끝(`eth0`)이다. Network는 리눅스 브리지 디바이스(`docker0` 또는 사용자 정의 브리지)이며 그에 연결된 veth들이 같은 Network의 Endpoint다. 오버레이라면 Network는 VXLAN VNI 하나다. → 코어 1

   </details>

2. 기본 브리지와 사용자 정의 브리지의 실무적 차이 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   (1) 이름 해석: 기본 브리지는 내장 DNS가 없어 컨테이너 이름으로 못 찾고(`--link` 레거시), 사용자 정의 브리지는 이름·별칭이 127.0.0.11로 해석된다. (2) 격리: 기본 브리지는 모든 컨테이너가 평평한 공간에 놓이고, 서로 다른 사용자 정의 브리지는 명시적 `docker network connect` 없이는 격리된다. → 코어 2

   </details>

3. 같은 브리지 안의 컨테이너 간 통신과 외부 통신의 경로 차이는?

   <details markdown="1"><summary>답 확인</summary>

   같은 브리지 안은 veth → 브리지 FDB(MAC 테이블)로 상대 veth에 프레임을 전달하는 순수 L2 스위칭이며 라우팅도 NAT도 없다. 외부 통신은 컨테이너의 게이트웨이(브리지 IP)를 거쳐 커널 IP 포워딩으로 올라가고 `POSTROUTING`의 MASQUERADE가 출발지 IP를 호스트 외부 인터페이스 IP로 바꾼다. → 코어 2

   </details>

4. `-p 8080:80` 요청이 컨테이너 프로세스에 도달하기까지 단계를 순서대로 말해 보라.

   <details markdown="1"><summary>답 확인</summary>

   패킷(dst=host_ip:8080) → `PREROUTING`(nat)에서 `DOCKER` 체인으로 점프 → DNAT로 dst를 container_ip:80으로 변경 → 라우팅 결정(docker0 방향) → `FORWARD`(filter) ACCEPT/DROP → docker0 → 호스트 쪽 veth → 컨테이너 쪽 veth → 컨테이너 네임스페이스의 eth0:80. 응답은 conntrack이 기억해 자동 복원된다. → 코어 3

   </details>

5. `docker-proxy`는 왜 있고, `userland-proxy=false`로 끄면 무엇이 바뀌나?

   <details markdown="1"><summary>답 확인</summary>

   호스트 자신의 루프백 접근이나 hairpin NAT, IPv6 처리처럼 DNAT만으로 왕복 경로가 완성되지 않는 경우를 사용자 공간에서 중계해 일관되게 처리하는 안전판이다. 끄면 `docker-proxy` 프로세스가 뜨지 않고 포트 게시는 iptables/nftables 커널 NAT 경로만 쓴다. 게시 포트가 많을 때 프로세스를 줄이는 이득이 있지만 hairpin류에서 차이가 생길 수 있다. → 코어 3

   </details>

6. Engine 28이 해결한 문제와 해결되지 않고 남은 것은?

   <details markdown="1"><summary>답 확인</summary>

   게시하지 않은 포트로의 인바운드가 컨테이너 IP로 직접 라우팅 가능했던 문제를 `DOCKER` 체인에서 기본 차단하도록 바꿨다(Linux iptables 한정, Docker Desktop 제외, `nat-unprotected`로 복원 가능). 남은 것: Docker가 `FORWARD` 등 호스트 방화벽과 같은 테이블에 규칙을 직접 삽입하는 구조 자체와, 게시된 포트에서 Docker 규칙이 우선인 점. 이는 29의 nftables 전용 테이블 방향의 배경이다. → 코어 3

   </details>

7. 컨테이너 이름이 해석되지 않을 때 점검 순서는?

   <details markdown="1"><summary>답 확인</summary>

   (1) 두 컨테이너가 같은 사용자 정의 네트워크에 있는가(해석 범위는 네트워크 단위), (2) 기본 브리지에 붙어 있지 않은가(`--network` 미지정), (3) `ndots`/검색 도메인이 의도치 않은 질의를 만들지 않는가, (4) 애플리케이션 DNS 캐시(JVM 등)가 옛 IP를 쥐고 있지 않은가. → 코어 4

   </details>

8. macvlan과 ipvlan의 차이, 그리고 둘의 공통 제약과 우회 방법은?

   <details markdown="1"><summary>답 확인</summary>

   macvlan은 컨테이너마다 고유 MAC을 부여하고(promiscuous mode·다중 MAC 학습 필요, 클라우드에서 막히기 쉬움), ipvlan은 부모 MAC을 공유하고 IP로 분배한다(L2/L3 모드, MAC 제한 환경에 유리). 공통 제약은 호스트와 컨테이너가 기본적으로 직접 통신 불가이며, 호스트에 같은 부모를 쓰는 macvlan 서브인터페이스(`mv-shim`)를 만들어 우회한다. → 코어 5

   </details>

### 3. 기억 고리

- **C++ 유추:** `socketpair()` = veth pair ⚠️ 바이트 스트림이 아니라 이더넷 프레임을 나르는 가상 NIC 한 쌍이며, 한쪽 끝은 브리지(스위치)에 꽂힌다.
- **C++ 유추:** 서버 앞단의 L4 릴레이 = `docker-proxy` ⚠️ 기본 경로는 이 프록시가 아니라 커널이 목적지 주소를 고쳐 쓰는 DNAT이고, 프록시는 DNAT가 곤란한 경우의 안전판이다.
- **비유:** 브리지 = 사무실 층의 스위치 허브, veth = 각 사무실에서 허브로 이어진 랜선(양 끝에 플러그), DNAT = 안내데스크가 "8080호 방문객은 201호로" 하고 방문 목적지를 바꿔 적는 일. ⚠️ 비유가 깨지는 지점: 안내데스크는 사람이 하지만 DNAT는 커널이 라우팅 판단보다 먼저 자동 처리하고, 응답은 conntrack 장부로 원래 주소로 되돌려 준다.
- **비유:** host 모드 = 칸막이 없는 오픈 오피스. 전화번호(포트)를 모두가 공유하니 빠르지만 충돌하고 서로 다 들린다. ⚠️ 비유가 깨지는 지점: 오픈 오피스에서도 사람이 구분되지만, host 모드에서는 포트 충돌이 일반 프로세스끼리와 똑같이 `EADDRINUSE`로 터진다.
- **묶음(3의 법칙):** CNM 객체 3(Sandbox·Endpoint·Network) / 통신 경로 3(컨테이너 간 L2·외부로 NAT·외부에서 DNAT) / 이 장 첫머리 질문 3(이름 해석·방화벽 우회·host 모드).
- **대칭·순서:** 나가기 MASQUERADE(`POSTROUTING`) ↔ 들어오기 DNAT(`PREROUTING`). macvlan(MAC 고유) ↔ ipvlan(MAC 공유). host(공유) ↔ none(단절). 기본 브리지(DNS 없음) ↔ 사용자 정의(DNS 있음).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`-p 8080:80`을 줬을 때 외부 패킷이 컨테이너의 서버 프로세스에 닿기까지"를 처음 듣는 사람에게 PREROUTING, DNAT, veth 순서로 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "컨테이너 이름으로 서로를 못 찾는 이유와 해결"을 기본 브리지와 127.0.0.11 내장 DNS로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "게임 서버는 지연이 중요하니 무조건 `--network host`" vs B "격리와 포트 독립성이 더 중요하니 브리지+포트 게시" — 번갈아 변호해 보세요. (NAT 오버헤드, 포트 충돌, `NET_ADMIN`, 침해 시 노출 범위를 근거로)
- **AI 역할 반전:** "내가 Docker 포트 게시와 호스트 방화벽(ufw)이 충돌하는 이유를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
