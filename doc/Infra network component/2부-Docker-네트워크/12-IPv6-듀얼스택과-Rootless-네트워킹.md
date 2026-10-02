---
title: "12장. IPv6 듀얼스택과 Rootless 네트워킹"
parent: "2부. Docker 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 12
---

# 12장. IPv6 듀얼스택과 Rootless 네트워킹

> **🎮 게임 서버 개발자에게** — 게임 서버는 `AF_INET` 소켓 하나로 시작해서 필요하면 `AF_INET6`나 dual-stack 소켓을 추가하고, 포트 80이나 443은 `CAP_NET_BIND_SERVICE`나 root로 열던 감각이 있을 겁니다. 이 장의 두 주제는 그 감각이 컨테이너에서 어떻게 달라지는지를 다룹니다. IPv6는 Docker에서 **기본으로 꺼져 있고 명시적으로 켜야 하는 기능**이며, 켜더라도 방화벽 규칙은 IPv4와 별개로 관리됩니다. Rootless는 dockerd 자체를 일반 사용자로 돌리는 모드인데, 결정적으로 다른 점은 **커널의 veth·브리지를 쓸 권한이 없어서 패킷을 유저스페이스 프로세스(TAP 디바이스 뒤의 네트워크 스택)가 대신 소켓 API로 중계**한다는 것입니다. 그래서 80번 포트가 안 열리고, 성능 오버헤드가 생기고, macvlan은 못 씁니다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - IPv4 방화벽은 열심히 설정했는데 IPv6로 우회해서 컨테이너에 접속된다.
> - Rootless Docker에서 `docker run -p 80:80`이 권한 오류로 실패한다.
> - 보안 정책 때문에 dockerd를 root 없이 돌리고 싶은데 네트워크가 어떻게 달라지는지 알아야 한다.

## 코어 — 이것만은 100%

> **한 문장:** Docker의 IPv6는 2026년 현재도 opt-in(daemon.json의 `ipv6`/`fixed-cidr-v6` 또는 네트워크별 `--ipv6`)이고 방화벽 규칙은 IPv4와 별도로 확인해야 하며, Rootless Docker는 비특권 사용자가 veth·브리지를 못 만지므로 RootlessKit이 TAP 디바이스로 패킷을 유저스페이스 네트워크 스택(slirp4netns → pasta → gvisor-tap-vsock)에 넘겨 대신 통신시킨다.

1. **IPv6는 켜야 쓴다** — 새로 설치해도 IPv4 전용이다. 데몬 전체(`daemon.json`의 `ipv6: true` + `fixed-cidr-v6`)나 네트워크 단위(`docker network create --ipv6 --subnet ...`)로 활성화해 dual-stack을 만든다.
2. **dual-stack은 ARP 대신 NDP, 방화벽은 IPv4와 별도** — 컨테이너는 두 주소를 함께 받고, 이웃 탐색은 ICMPv6 기반 NDP가 맡으며, 내부망에는 흔히 ULA(`fd00::/8`)를 쓴다. nftables 전환은 문법 통일일 뿐 IPv4/IPv6 정책을 자동 통합하지 않는다.
3. **Rootless는 "커널 권한 없이" 네트워크를 만든다** — dockerd를 user namespace 안에서 일반 사용자로 실행한다. 비루트는 veth를 다른 netns로 옮기거나 브리지·라우팅·방화벽을 조작할 수 없어, RootlessKit이 자식 netns에 TAP 디바이스를 만들고 유저스페이스 스택이 비특권 소켓 API로 대신 통신한다.
4. **백엔드와 제약** — 기본 백엔드가 Docker v29.5부터 slirp4netns(C)에서 gvisor-tap-vsock(Go)으로 바뀌었다(보안 이유). 1024 미만 포트, ICMP, macvlan/ipvlan에 제약이 있다.

**이 장의 학습 목표**

- Docker IPv6가 기본 비활성임을 알고, daemon.json과 네트워크 단위 활성화 방법을 구분한다.
- dual-stack 컨테이너의 주소·NDP·ULA·NAT66 개념과 IPv6 방화벽의 별도 관리를 설명한다.
- Rootless Docker가 무엇을 보장하고, 왜 일반 netns/veth/브리지 방식이 불가능한지 설명한다.
- RootlessKit·TAP·유저모드 스택의 구조와 세 백엔드(slirp4netns, pasta, gvisor-tap-vsock)를 비교한다.
- Rootless의 1024 미만 포트, ICMP, macvlan/ipvlan 제약과 대응책을 안다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `AF_INET` vs `AF_INET6` / dual-stack 소켓 | dual-stack 네트워크(IPv4+IPv6 동시) | 같은 인터페이스에 두 프로토콜 스택이 얹힌다 | 소켓이 아니라 **네트워크 단위**로 서브넷 두 개를 갖고, IPAM이 두 풀에서 주소를 하나씩 할당한다. 기본은 꺼져 있다 |
| ARP로 상대 MAC 찾기 | NDP(ICMPv6 NS/NA, 멀티캐스트) | 같은 L2에서 이웃 MAC 해결 | 브로드캐스트가 아니라 멀티캐스트이고, 라우터 발견·중복 주소 탐지까지 담당하며, ICMPv6를 함부로 막으면 IPv6가 깨진다 |
| 사설 IP 대역(10.x, 192.168.x)과 NAT | ULA(`fd00::/8`)와 NAT66 | 전역 라우팅되지 않는 내부망 주소 | IPv6는 원래 NAT 없는 종단 간 연결이 목표라 NAT66을 두고 의견이 갈린다 |
| `iptables`와 `ip6tables`를 따로 설정 | IPv4/IPv6 방화벽 별도 관리 | 문법은 비슷하지만 독립된 규칙 집합 | `nft`는 한 문법으로 가능하지만 Docker nftables 백엔드가 자동으로 합쳐 주지는 않는다 |
| root가 아닌 계정으로 서버를 띄우고 1024 미만 포트 `bind` 실패 | Rootless 컨테이너의 80/443 게시 실패 | `CAP_NET_BIND_SERVICE` 없으면 `bind()`가 거부된다 | sysctl(`net.ipv4.ip_unprivileged_port_start`)을 호스트에서 낮추거나 리버스 프록시를 앞에 둔다 |
| 프록시 서버가 클라이언트 연결을 받아 별도 `connect()`로 중계 | 유저모드 네트워크 스택(slirp4netns/pasta/gvisor-tap-vsock) | 패킷 내용을 파싱해 일반 소켓 API로 대신 통신 | 소켓 연결이 아니라 **이더넷 프레임**을 TAP로 받아 처리하므로 ICMP·성능·메모리 안전성 같은 고유 문제가 생긴다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Docker를 새로 설치하면 컨테이너는 IPv6 주소를 받을까?
> 2. IPv4 방화벽으로 막은 포트가 IPv6로는 접속될 수 있을까? 왜?
> 3. Rootless Docker의 "root 아님"은 컨테이너 안 프로세스를 말할까, dockerd를 말할까?
> 4. 일반 사용자가 못 하는 네트워크 작업은 무엇이고, 그러면 컨테이너 패킷은 어떻게 밖으로 나갈까?
> 5. Rootless에서 `-p 80:80`이 실패하면 어떻게 해결할까?
> **처리법:** 🛠 실습 daemon.json `"ipv6": true`, `docker network create --ipv6 --subnet ...`, `docker exec web ip -6 addr show eth0`, `nft list ruleset`/`ip6tables -L -n -v`, `dockerd-rootless-setuptool.sh install`, `docker info`의 `Security Options`, `ps -ef | grep -E "rootlesskit|slirp4netns|pasta|gvisor-tap-vsock"` (원천 실습, 직접 실행 검증은 하지 않음) → 바로 실행 · 🗺 관계도 `컨테이너 → (자식 netns 내부 브리지/veth) → TAP → 유저모드 스택 → 호스트 소켓 API → 부모 netns` · 📦 카드로 `fixed-cidr-v6`, `--ipv6`, NDP, ULA `fd00::/8`, NAT66, RootlessKit, TAP, `DOCKERD_ROOTLESS_ROOTLESSKIT_NET`, `ip_unprivileged_port_start` · 유추 비판 "프록시 서버"와 유저모드 스택의 차이(프레임 vs 소켓)

---

## 코어 1. IPv6는 켜야 쓴다

### 1.1 기본은 IPv4 전용 — opt-in

**한 줄 요약:** Docker의 네트워크 스택은 IPv4를 전제로 설계되었고, 2026년 현재도 IPv6는 명시적으로 켜야 한다.

CNM·IPAM 드라이버([7장](07-Docker-네트워크-모델.md))와 브리지·NAT 구조([8장](08-브리지-네트워크와-포트-게시.md))는 IPv4 주소 공간과 IPv4 NAT를 염두에 두고 만들어졌고 IPv6는 나중에 얹힌 선택 기능에 가깝다. Docker를 처음 설치하면 기본 브리지도 새로 만드는 네트워크도 IPv4 전용이며 IPv6 주소는 할당되지 않는다. 원천은 "이제는 IPv6가 기본으로 켜져 있다"는 서술은 과장이며, Docker Engine 29.8.1을 새로 설치해도 IPv4 전용으로 시작한다고 분명히 밝힌다. 다만 최근에는 데몬 전역 설정을 건드리지 않고 **네트워크 단위**로 dual-stack을 켜고 끌 수 있는 흐름이 자리 잡았다. 유연성은 좋아졌지만 opt-in이라는 성격은 그대로다.

### 1.2 활성화 두 가지 방법

**한 줄 요약:** 기본 브리지(`docker0`)에는 `daemon.json`의 `ipv6`+`fixed-cidr-v6`, 개별 네트워크에는 `--ipv6`+IPv6 `--subnet`.

```json
{
  "ipv6": true,
  "fixed-cidr-v6": "2001:db8:1::/64"
}
```

`ipv6: true`는 기본 브리지에서 IPv6를 켜겠다는 선언이고 `fixed-cidr-v6`는 거기에 할당할 IPv6 서브넷이다. 데몬을 재시작하면(`sudo systemctl restart docker`) 기본 브리지의 컨테이너가 IPv4와 함께 이 서브넷에서 파생된 IPv6 주소도 받는다.

```bash
docker network create \
  --driver bridge \
  --ipv6 \
  --subnet 172.28.0.0/16 \
  --subnet 2001:db8:abcd::/64 \
  my-dualstack-net

docker run -d --name web --network my-dualstack-net nginx:latest
docker exec web ip -4 addr show eth0
docker exec web ip -6 addr show eth0
```

IPv4 서브넷과 IPv6 서브넷을 함께 가진 네트워크가 **dual-stack** 네트워크다. Compose에서는 네트워크 정의에 `enable_ipv6: true`와 IPv4/IPv6 서브넷을 `ipam.config`에 병기해 같은 결과를 얻는다. 모든 브리지에 일괄 적용하려면 전역 설정, 특정 워크로드에만 적용하려면 네트워크별 `--ipv6`가 적합하며, 두 설정은 상호 배타적이지 않고 함께 쓸 수 있다.

---

## 코어 2. dual-stack은 ARP 대신 NDP, 방화벽은 IPv4와 별도

### 2.1 주소 할당, NDP, ULA, NAT66

**한 줄 요약:** IPAM이 두 풀에서 주소를 하나씩 줘 같은 `eth0`에 두 스택이 얹히고, IPv6의 이웃 탐색은 ICMPv6 기반 NDP가 맡으며, 내부망에는 ULA를 흔히 쓴다.

dual-stack 네트워크에서 컨테이너가 시작되면 IPAM 드라이버가 IPv4/IPv6 풀에서 주소를 하나씩 `eth0`에 동시에 부여한다. 어느 주소로 통신할지는 상대의 주소 체계와 애플리케이션의 소켓 바인딩(`AF_INET` 대 `AF_INET6`, 혹은 두 프로토콜을 함께 다루는 dual-stack 소켓)에 달려 있다.

- **NDP(Neighbor Discovery Protocol):** IPv4의 ARP([4장](../1부-리눅스-네트워크-기초/04-veth-브리지-라우팅-ARP.md))가 하던 일을 IPv6에서는 NDP가 한다. 브로드캐스트가 아니라 ICMPv6 메시지(Neighbor Solicitation/Advertisement)를 **멀티캐스트**로 주고받으며, 라우터 발견(Router Solicitation/Advertisement)과 중복 주소 탐지(DAD)까지 통합 수행한다. 브리지는 이더넷 프레임을 그대로 포워딩하므로 ARP든 NDP든 브리지 계층에서 특별히 다르게 취급하지 않지만, 방화벽 규칙에서 ICMPv6의 일부 메시지 타입(특히 Neighbor Discovery 관련)을 함부로 차단하면 IPv6 통신 자체가 깨질 수 있다.
- **ULA(Unique Local Address, `fd00::/8`):** IPv4 사설 대역(`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)에 해당하는 IPv6 개념. 전역 라우팅되지 않고, 전역 유일성이 보장되지는 않지만 충돌 확률이 극히 낮게 설계되었다. 컨테이너 내부망에 쓰면 호스트가 공인 IPv6 프리픽스를 갖든 말든 컨테이너 간 통신 주소 체계를 독립적으로 구성할 수 있고, 공인 프리픽스가 재부팅마다 바뀌는 환경에서도 컨테이너 네트워크 설정을 바꿀 필요가 없다.
- **공인 프리픽스 직접 노출 vs NAT66:** 호스트가 받은 공인 `/56`이나 `/64`를 잘라 컨테이너에 직접 할당하면 NAT 없이 외부에서 직접 도달 가능한 주소를 갖는다. IPv6가 NAT 없는 종단 간 연결을 목표로 설계되었으니 "IPv6답다"고 볼 수 있지만 컨테이너 하나하나가 외부에서 직접 도달 가능하므로 방화벽 정책을 훨씬 꼼꼼히 관리해야 한다. 절충안이 **NAT66**(IPv6-to-IPv6 NAT)으로, ULA 내부망을 유지하면서 필요한 트래픽만 공인 프리픽스로 변환해 내보낸다. NAT66은 종단 간 투명성을 깨뜨린다는 비판이 있고 IPv6 진영 일부는 설계 철학에 어긋난다는 입장이다. 결국 ULA+NAT66이냐 공인 직접 노출이냐는 **보안 통제의 용이성 대 종단 간 연결성**의 선택이며 정답이 하나로 정해져 있지 않다.

### 2.2 IPv6 방화벽은 따로 본다

**한 줄 요약:** `iptables`와 `ip6tables`는 독립된 규칙 집합이고, nftables 백엔드로 바뀌어도 "문법 통일"일 뿐 "정책 통합"이 아니다.

전통적 iptables 시대에는 IPv4 규칙은 `iptables`, IPv6 규칙은 `ip6tables`라는 별도 명령·별도 테이블로 관리했다. 문법은 거의 같지만 규칙 집합이 완전히 독립이라 IPv4에서 포트를 막았다고 IPv6에서도 자동으로 막히지 않는다. 원천은 "IPv4 방화벽은 열심히 설정했는데 IPv6로 우회해서 접속되더라"는 사고가 실무에서 드물지 않았다고 말한다.

`nft`는 한 문법 안에서 `ip`, `ip6`, 또는 둘을 함께 다루는 `inet` 패밀리를 선택할 수 있어 이원화가 어느 정도 정리된다. 그러나 [11장](11-Docker-방화벽-iptables에서-nftables로.md)의 Docker Engine 29 실험적 nftables 백엔드가 이 이점을 자동으로 가져다주지는 않는다. Docker가 nftables 백엔드를 쓴다는 것은 Docker가 만드는 포워딩/NAT/게시 포트 규칙을 nftables 문법으로 쓴다는 뜻이지 IPv4용·IPv6용이 이미 통합되어 있다는 보장이 아니다. 데몬에 `ipv6: true`를 설정하지 않으면 Docker는 IPv6 관련 규칙 자체를 만들지 않고, 켠 뒤에도 IPv6용 규칙 집합은 IPv4용과 개념적으로 나란히 존재하는 별도 체인으로 관리된다. 그래서 IPv6를 켠 뒤에는 `nft list ruleset`(nftables 백엔드가 아니라면 `ip6tables -L -n -v`)으로 IPv6 규칙이 의도대로 생성되었는지를 IPv4와 **별개로** 반드시 확인한다.

### 2.3 오버레이·macvlan/ipvlan과 IPv6

**한 줄 요약:** Swarm 오버레이의 IPv6는 아직 제약이 있을 수 있는 영역이고, macvlan/ipvlan은 개념상 자연스럽지만 IPAM과 SLAAC의 이중 할당에 주의한다.

- **오버레이([10장](10-macvlan-ipvlan-host-none-오버레이.md)):** VXLAN 캡슐화 자체는 내부 페이로드가 IPv4든 IPv6든 상관없지만, Swarm 오버레이에 IPv6 서브넷을 할당해 컨테이너 간 IPv6 통신과 서비스 디스커버리까지 안정적으로 동작시키는 경로는 커뮤니티에서 꾸준히 이슈가 보고된 영역이다. 서브넷을 지정했는데 컨테이너에 IPv6 주소가 기대대로 붙지 않는 경우, IPv6 주소로 광고된 매니저 노드 사이에서 오버레이가 정상적으로 붙지 않는 경우가 보고된 바 있다. 원천은 "완전히 지원한다"고 단정하지 않고 사용할 Docker Engine 버전의 릴리스 노트와 이슈 트래커를 직접 확인하고 소규모로 검증하라고 권한다.
- **macvlan/ipvlan:** 물리 L2 세그먼트에 자체 MAC/IP로 나타나므로 그 세그먼트에 IPv6 라우터 광고(RA)가 흐르면 SLAAC로 주소를 자동으로 받는 것도 가능하다. 다만 Docker IPAM의 할당과 커널 SLAAC가 서로 다른 경로로 동시에 주소를 부여하려 해 충돌하거나 혼란스러운 상태가 될 수 있으므로, Docker IPAM에 명시적 IPv6 서브넷을 지정해 관리 주체를 하나로 고정하는 편이 안전하다.

---

## 코어 3. Rootless는 "커널 권한 없이" 네트워크를 만든다

### 3.1 Rootless Docker란

**한 줄 요약:** "루트리스"는 컨테이너 안 프로세스가 아니라 **호스트에서 dockerd를 실행하는 계정**이 root가 아니라는 뜻이며, 컨테이너 탈출 시 최종 권한의 상한선을 일반 사용자 수준으로 낮춘다.

`docker run --user`나 컨테이너 안에서 비루트 사용자로 앱을 띄우는 것은 오래전부터 가능했던 별개의 관행이다. Rootless Docker는 dockerd, containerd, shim, 컨테이너 프로세스 전부가 호스트의 어느 시점에도 root UID(0)로 실행되지 않음을 보장한다. 일반(rootful) 구성에서는 Docker 소켓(`/var/run/docker.sock`)에 접근할 수 있는 사용자가 사실상 호스트 root를 얻은 것과 다르지 않고, 컨테이너 탈출이 root dockerd를 마주치면 호스트 전체가 뚫리기 쉽다. Rootless는 탈출해도 얻는 권한이 dockerd를 실행한 일반 사용자 권한으로 제한된다. 공격 표면을 없애는 것이 아니라 **탈출 후 도달 가능한 최종 권한의 상한선**을 낮추는 방어 전략이다.

이는 user namespace([3장](../1부-리눅스-네트워크-기초/03-네트워크-네임스페이스.md)과 같은 격리 계열)를 빼놓고 설명할 수 없다. Rootless Docker는 `rootlesskit`으로 dockerd 자신을 user namespace 안에서 실행한다. 일반 사용자가 `unshare(CLONE_NEWUSER)`로 새 user namespace를 만들면 그 안에서 자신을 UID 0으로 매핑할 수 있고, `/etc/subuid`/`/etc/subgid`에 정의된 UID/GID 범위로 호스트에서는 여전히 비특권 사용자로 매핑된다. 그래서 컨테이너 안 `id`는 `uid=0(root)`이지만 호스트의 `ps -ef`에서는 일반 사용자 UID로 보인다.

### 3.2 근본 문제 — 비특권 사용자는 netns를 쓸모 있게 만들 수 없다

**한 줄 요약:** `CLONE_NEWNET`으로 netns를 만드는 것까지는 (user namespace 안이면) 가능하지만, veth를 바깥 netns로 옮기고 브리지를 붙이고 라우팅·방화벽을 조작하는 일은 root나 `CAP_NET_ADMIN`을 요구한다.

[8장](08-브리지-네트워크와-포트-게시.md)에서 본 `docker0`+veth 구조를 rootful Docker가 만드는 방식 그대로 재현하는 것은 커널 권한 모델상 원천적으로 막혀 있다. 특히 veth pair의 한쪽 끝을 user namespace 바깥의 호스트 기본 netns로 옮기는 작업 자체가 일반 사용자에게 허용되지 않는다. 남는 선택지는 하나, **패킷 처리 자체를 유저스페이스 프로세스로 옮기는 것**이다. 컨테이너가 보낸 이더넷 프레임을 커널이 라우팅하게 하는 대신 통째로 붙잡아 일반 프로세스가 파싱하고, 호스트의 비특권 소켓 API(`socket()`, `connect()`, `bind()`)로 실제 통신을 대신 수행한다. 이것이 슬립(slirp) 계열 유저모드 네트워크 스택이 존재하는 이유다.

### 3.3 RootlessKit과 TAP — 구조

**한 줄 요약:** 자식 netns 안에서는 평범하게 브리지·veth로 컨테이너를 잇고, 그 자식 netns를 호스트 네트워크로 잇는 **마지막 한 구간만** TAP + 유저스페이스 스택이 대신한다.

RootlessKit은 Rootless Docker(그리고 Podman 등)가 공통으로 의존하는 사용자 공간 도구로 dockerd를 감싼다. 핵심은 두 네트워크 네임스페이스다. 하나는 dockerd를 실행한 사용자의 원래 netns(부모/호스트), 다른 하나는 RootlessKit이 `unshare`로 새로 만든 자식 netns로, dockerd와 모든 컨테이너가 이 자식 netns 안에서 실행된다. 분리의 이유 중 하나는 호스트 netns의 abstract Unix 소켓 같은 리소스를 컨테이너 프로세스로부터 격리하기 위해서이기도 하다.

두 netns를 잇는 통로는 veth가 아니라 자식 netns 안에 만든 **TAP 디바이스**다. TAP는 커널 입장에서는 평범한 네트워크 인터페이스지만 들어오고 나가는 이더넷 프레임을 커널이 라우팅하는 대신 문자 디바이스(`/dev/net/tun`)를 통해 유저스페이스 프로세스에 넘긴다.

```
[컨테이너] --- (veth/브리지, 자식 netns 내부에서는 평범하게 동작) --- [자식 netns의 TAP 디바이스]
                                                                        │
                                                          (이더넷 프레임을 유저스페이스로 전달)
                                                                        ▼
                                              [유저모드 네트워크 스택 프로세스]
                                              (slirp4netns / pasta / gvisor-tap-vsock)
                                                                        │
                                                (일반 사용자 권한의 소켓 API로 실제 통신 수행)
                                                                        ▼
                                                        [호스트의 부모 netns / 물리 네트워크]
```

응답은 반대 경로로 TAP를 통해 컨테이너 netns 안으로 주입된다. 자식 netns "안쪽"의 위상은 rootful과 크게 다르지 않고, 마지막 한 구간만 커널 라우팅 대신 유저스페이스 프록시가 대신한다는 것이 Rootless 네트워킹의 본질이다. 이 구간이 유저스페이스를 지나므로 커널 네이티브 경로 대비 처리량·지연에 오버헤드가 필연적으로 생긴다.

---

## 코어 4. 백엔드의 변천과 Rootless의 제약

### 4.1 slirp4netns → pasta → gvisor-tap-vsock

**한 줄 요약:** Docker v29.5부터 Rootless의 기본 네트워크 드라이버가 slirp4netns(C)에서 gvisor-tap-vsock(순수 Go)으로 교체되었다 — 성능이 아니라 메모리 안전성(보안)이 명분이다.

- **slirp4netns:** 1990년대 QEMU용 slirp 계보의 C 코드베이스. 오랜 기본값이며 안정적이고 검증되었지만 C 패킷 파싱 코드 특유의 메모리 안전성 문제(버퍼 오버플로, use-after-free류)에서 자유롭지 않다. 이 스택은 컨테이너가 보내는 임의 패킷을 파싱하므로 취약점이 있으면 조작된 패킷으로 스택 프로세스 자체를 공격할 수 있고, "탈출 후 피해 반경 축소"가 목적인 Rootless의 마지막 방어선이 오래된 C 코드라는 것이 아이러니한 약점으로 지적되어 왔다.
- **pasta:** Docker 25.0부터 실험적 대안으로 제공. passt 프로젝트의 하위 도구로 컨테이너의 네트워크 설정(IP, 라우팅)을 호스트의 실제 설정과 최대한 그대로 반영해("패킷을 변환하지 않고 그대로 통과시킨다"는 설계 목표에 가깝다) slirp4netns보다 처리량·지연이 낫고 호스트 네트워크와의 통합도 매끄럽다는 평가를 받았다. 기본값으로 승격되지는 않았다.
- **gvisor-tap-vsock:** gVisor 프로젝트에서 파생된 **순수 Go** 구현. Go는 메모리 안전성을 언어 차원에서 보장하는 GC 언어라 slirp4netns가 겪어 온 메모리 손상 취약점 클래스 자체가 구조적으로 줄어든다. Docker 프로젝트는 이 교체를 성능 개선이 아니라 "보안 강화" 문맥에서 설명한다. 최신 패키징에서는 slirp4netns가 더 이상 기본으로 함께 설치되지 않는 방향이며, RootlessKit의 네트워크 드라이버 설정으로 slirp4netns나 pasta를 명시적으로 선택할 수 있다.

| 항목 | slirp4netns | pasta | gvisor-tap-vsock |
|---|---|---|---|
| 구현 언어 | C | C (passt/pasta 코드베이스) | Go |
| 계보 | 1990년대 QEMU용 slirp의 재구현 | passt 프로젝트의 하위 도구 | gVisor 프로젝트에서 파생 |
| Docker 도입 시점 | Rootless Docker 초기(2019년경)부터 사실상 기본값 | Docker 25.0부터 실험적 옵션 | Docker v29.5부터 신규 기본값 |
| 성능 특성 | 유저모드 스택 중 상대적으로 느린 편 | slirp4netns 대비 처리량/지연 우위, 호스트와 통합 매끈 | pasta와 유사하거나 그 이상을 목표로 설계 |
| 보안 특성 | 오래된 C, 메모리 안전성 이슈 이력 | 비교적 최신 C | Go라 메모리 안전성 취약점 클래스 구조적 감소 |
| 2026년 현재 기본값 | v29.5부터 후순위 | 명시적 선택 옵션 | Docker v29.5부터 신규 기본값 |

"더 빠른 것"이 반드시 기본값이 되지는 않았다는 점이 눈여겨볼 부분이다. 순수 처리량은 pasta와 gvisor-tap-vsock이 비슷하거나 우열을 가리기 어려운 경우도 보고되지만, 기본값으로 선택된 것은 메모리 안전성을 확보한 gvisor-tap-vsock이다. Rootless가 "성능보다 보안을 우선하는 실행 모드"라는 정체성과 일관된 선택이다.

### 4.2 세 가지 제약과 대응

**한 줄 요약:** 1024 미만 포트는 sysctl·프록시로, ICMP는 구분 디버깅으로, macvlan/ipvlan은 rootful로.

| 제약 | 원인 | 대응 |
|---|---|---|
| 1024 미만 포트 게시 실패 | 커널은 전통적으로 1024 미만 포트 `bind()`를 `CAP_NET_BIND_SERVICE`를 가진 프로세스에게만 허용한다. Rootless dockerd는 root가 아니라 기본적으로 이 capability가 없다 | 호스트 커널의 `net.ipv4.ip_unprivileged_port_start` sysctl을 낮춘다(가장 흔함). 그 외 RootlessKit 포트 드라이버 설정으로 우회하거나, 호스트 nginx나 별도 rootful 포트 포워더 같은 리버스 프록시를 앞단에 둔다 |
| ping/ICMP 제약 | 유저모드 스택은 TCP/UDP 소켓 API를 대리하는 방식이라 ICMP Echo는 백엔드에 따라 별도 특수 처리가 필요하다 | 백엔드와 커널 설정(`net.ipv4.ping_group_range`)에 따라 ping이 안 되거나 제한적일 수 있으므로 연결성 문제인지 ICMP 경로만 막힌 것인지 구분해 디버깅한다 |
| macvlan/ipvlan 사용 곤란 | 물리 인터페이스를 커널 레벨에서 조작해야 하는데 이는 유저스페이스로 우회된 Rootless 구조와 전제가 충돌한다([10장](10-macvlan-ipvlan-host-none-오버레이.md)) | 기본적으로 사용하기 어렵거나 별도 권한 상승·rootful 데몬 병행 없이는 지원되지 않는다고 보는 것이 안전하다. 물리망에 직접 붙어야 한다면 rootful Docker에 다른 보안 계층(gVisor/Kata 같은 대안 런타임, seccomp/AppArmor 강화)을 얹는 쪽이 현실적 절충일 수 있다 |

### 4.3 설치·확인 명령

```bash
# 사전 준비 패키지(Debian/Ubuntu 계열 예시)
sudo apt-get install -y uidmap dbus-user-session

# rootless 셋업 도구 실행 (일반 사용자 계정에서)
dockerd-rootless-setuptool.sh install

# rootless 데몬 상태 / CLI 컨텍스트 확인
systemctl --user status docker
docker context ls

# Security Options 에 rootless 가 표시되는지 확인
docker info

# 어떤 네트워크 백엔드가 실행 중인지 확인
ps -ef | grep -E "rootlesskit|slirp4netns|pasta|gvisor-tap-vsock"
```

특정 백엔드를 명시하려면 systemd 사용자 유닛에 오버라이드를 추가한다.

```bash
mkdir -p ~/.config/systemd/user/docker.service.d
cat <<'EOF' > ~/.config/systemd/user/docker.service.d/override.conf
[Service]
Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_NET=gvisor-tap-vsock"
EOF

systemctl --user daemon-reload
systemctl --user restart docker
```

1024 미만 포트 제약은 다음처럼 체감한다.

```bash
docker run -d -p 80:80 nginx:latest   # 대부분 권한 오류로 실패

# 호스트 root 권한 필요 — rootless 데몬 자체와는 별개의 커널 설정
sudo sysctl net.ipv4.ip_unprivileged_port_start=80
docker run -d -p 80:80 nginx:latest   # 이제 성공하는지 확인
```

> **[보충]** 위 명령은 원천 실습에서 가져온 것이며, 이 책을 쓴 환경(Windows)에서는 실행 검증을 하지 못했다.

---

## 실무 적용

### 체크리스트

- [ ] IPv6가 필요한가? 필요하면 전역(`daemon.json`) 대 네트워크별(`--ipv6`) 중 범위에 맞는 쪽을 고르고 둘을 함께 써도 된다.
- [ ] IPv6를 켠 직후 `nft list ruleset`(또는 `ip6tables -L -n -v`)으로 IPv6 규칙을 IPv4와 별개로 확인한다.
- [ ] 방화벽에서 ICMPv6 Neighbor Discovery 메시지를 함부로 차단하지 않는다.
- [ ] 컨테이너 내부망 주소 방침(ULA+NAT66 vs 공인 프리픽스 직접 노출)을 보안 통제와 종단 간 연결성 기준으로 정해 둔다.
- [ ] Swarm 오버레이에 IPv6를 쓰려면 사용 버전의 릴리스 노트·이슈 트래커를 확인하고 소규모로 검증한다.
- [ ] macvlan+IPv6는 Docker IPAM에 명시적 IPv6 서브넷을 지정해 SLAAC와의 이중 할당을 피한다.
- [ ] Rootless: `docker info`의 `Security Options`에 `rootless`가 있는지, `ps`로 어느 백엔드가 도는지 확인한다.
- [ ] Rootless에서 80/443 게시가 필요하면 `net.ipv4.ip_unprivileged_port_start` 조정 또는 리버스 프록시를 쓴다.
- [ ] 물리망 직접 접속이 필요한 워크로드는 Rootless 대신 rootful + 추가 보안 계층을 검토한다.

### 시나리오로 확인하기

1. **상황:** 컨테이너 5432 포트를 IPv4에서는 방화벽으로 막았는데, 다른 호스트에서 IPv6 주소로는 접속이 된다.
   **질문:** 의심 부품, 확인, 해결은?

   <details markdown="1"><summary>답 확인</summary>

   IPv4와 IPv6의 방화벽 규칙은 커널 수준에서 별도 규칙 집합이다(`iptables`/`ip6tables`). IPv4에서 막았다고 IPv6에서 자동으로 막히지 않는다. `nft list ruleset`(nftables 백엔드가 아니면 `ip6tables -L -n -v`)으로 IPv6 쪽 규칙이 의도대로 만들어졌는지 IPv4와 별개로 확인하고 IPv6용 정책을 추가한다. Docker nftables 백엔드로 바꿔도 문법이 통일될 뿐 IPv4/IPv6 정책이 자동 통합되지는 않는다. → 코어 2 (2.2)

   </details>

2. **상황:** Rootless Docker 환경에서 `docker run -d -p 80:80 nginx`가 권한 오류로 실패한다.
   **질문:** 원인과 해결 선택지는?

   <details markdown="1"><summary>답 확인</summary>

   커널은 1024 미만 포트 `bind()`를 `CAP_NET_BIND_SERVICE` 보유 프로세스에게만 허용하는데, Rootless dockerd는 root가 아니라 기본적으로 이 capability가 없다. 해결: 호스트의 `net.ipv4.ip_unprivileged_port_start`를 낮춘다(`sudo sysctl net.ipv4.ip_unprivileged_port_start=80`, 호스트 root 필요), RootlessKit의 포트 드라이버 설정으로 우회한다, 또는 호스트 nginx 같은 리버스 프록시를 1024 이상 포트 앞단에 둔다. → 코어 4 (4.2)

   </details>

3. **상황:** Rootless 환경에서 컨테이너 안에서 외부로 TCP 접속은 되는데 `ping`이 안 된다.
   **질문:** 네트워크가 아예 끊긴 것인가?

   <details markdown="1"><summary>답 확인</summary>

   아닐 수 있다. 유저모드 네트워크 스택은 TCP/UDP 소켓 API를 대리 수행하는 방식이라 ICMP Echo는 백엔드에 따라 별도 처리가 필요하고, 백엔드와 `net.ipv4.ping_group_range` 같은 커널 설정에 따라 ping이 안 되거나 제한적으로만 동작할 수 있다. 연결성 문제인지 ICMP 경로만 막힌 것인지 구분해 디버깅한다. → 코어 4 (4.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
코어 1 IPv6 기본값: ____ (opt-in)   전역: daemon.json "____": true + "________-v6": "<CIDR>" (기본 브리지)
  네트워크별: docker network create --____ --subnet <v4> --subnet <v6>   결과 = ________ 네트워크
  Compose: ____________: true + ipam.config

코어 2 IPv6 이웃 탐색 = ____ (ICMPv6 NS/NA, 브로드캐스트가 아닌 ______)  + 라우터 발견 + ____
  내부망 주소 = ____ (fd00::/8)   절충안 = ______   선택 기준 = 보안 통제 용이성 vs ________
  IPv4/IPv6 방화벽: ______ / ______ (별도)  nft: ____ 패밀리  nftables 백엔드 = ____ 통일 (정책 통합 아님)
  오버레이 IPv6 = 아직 ____ 가능   macvlan: IPAM vs ______ 충돌 주의

코어 3 rootless = ______ 를 실행하는 계정이 root 가 아님 (컨테이너 안 프로세스 아님)
  도구 ________ + user namespace, /etc/____ /____ 범위 매핑
  비특권이 못 하는 것: ____ 를 다른 netns로 이동, ____ 구성, 라우팅/방화벽 조작
  구조: 자식 netns 의 ____ 디바이스(/dev/net/tun) → ________ 스택 → 호스트 ____ API → 부모 netns

코어 4 백엔드: ________(C) → ______ (Docker 25.0 실험) → ________(Go, Docker v____부터 기본)
  환경변수: DOCKERD_ROOTLESS_ROOTLESSKIT_NET   명분 = ________ 안전성
  제약 3: 1024 미만 포트 (sysctl net.ipv4.________) / ____(ICMP) / ________ 계열
```

### 2. 인출 질문

1. 2026년 현재 Docker를 새로 설치하면 컨테이너가 IPv6 주소를 받는가? 최근 개선된 점은?

   <details markdown="1"><summary>답 확인</summary>

   받지 않는다. 기본 브리지도 새 네트워크도 IPv4 전용이며 IPv6는 명시적으로 켜야 한다(opt-in). 개선된 점은 데몬 전역 설정을 건드리지 않고 네트워크 단위로 dual-stack을 켜고 끌 수 있는 흐름이 자리 잡았다는 것이지 기본값이 바뀐 것은 아니다. → 코어 1 (1.1)

   </details>

2. `daemon.json`의 IPv6 설정과 네트워크별 `--ipv6`는 어떻게 다르고 함께 쓸 수 있는가?

   <details markdown="1"><summary>답 확인</summary>

   `"ipv6": true` + `"fixed-cidr-v6"`는 기본 브리지(`docker0`)에 IPv6를 켜고 서브넷을 지정한다. `docker network create --ipv6 --subnet <IPv4> --subnet <IPv6>`는 개별 네트워크를 dual-stack으로 만든다. 모든 브리지에 일괄 적용하려면 전자, 특정 워크로드에만 적용하려면 후자가 적합하며 상호 배타적이지 않아 함께 쓸 수 있다. → 코어 1 (1.2)

   </details>

3. IPv6에서 ARP를 대신하는 것은 무엇이며 방화벽 관점의 주의점은?

   <details markdown="1"><summary>답 확인</summary>

   NDP다. ICMPv6의 Neighbor Solicitation/Advertisement를 멀티캐스트로 주고받으며 라우터 발견·중복 주소 탐지까지 수행한다. 방화벽에서 ICMPv6의 일부 메시지(특히 Neighbor Discovery 관련)를 함부로 차단하면 IPv6 통신 자체가 깨질 수 있다. → 코어 2 (2.1)

   </details>

4. ULA+NAT66과 공인 프리픽스 직접 노출의 트레이드오프는?

   <details markdown="1"><summary>답 확인</summary>

   공인 프리픽스 직접 노출은 NAT 없이 종단 간 연결성을 주는 대신 컨테이너 하나하나가 외부에서 직접 도달 가능해 방화벽을 훨씬 꼼꼼히 관리해야 한다. ULA 내부망 + NAT66은 필요한 트래픽만 변환해 통제하기 쉽지만 종단 간 투명성을 깨뜨리고 IPv6 설계 철학에 어긋난다는 비판이 있다. 정답은 하나로 정해져 있지 않다. → 코어 2 (2.1)

   </details>

5. nftables 백엔드로 바꾸면 IPv4/IPv6 방화벽이 하나로 합쳐지는가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. 규칙을 쓰는 문법과 도구가 통일될 뿐 정책이 통합되는 것은 아니다. `ipv6: true`가 없으면 Docker는 IPv6 규칙을 만들지 않고, 켜도 IPv6용 규칙은 IPv4용과 나란히 존재하는 별도 체인으로 관리된다. 그래서 `nft list ruleset`(아니면 `ip6tables -L`)으로 IPv6 규칙을 별도로 확인해야 한다. → 코어 2 (2.2)

   </details>

6. "Rootless"가 가리키는 대상은 무엇이고 보안상 무엇을 보장하는가?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너 안 프로세스가 아니라 호스트에서 dockerd를 실행하는 계정이다. dockerd·containerd·shim·컨테이너 프로세스 전부가 호스트에서 root UID(0)로 실행되지 않음을 보장해, 컨테이너 탈출이 일어나도 공격자가 얻는 권한이 일반 사용자 수준으로 제한된다. 공격 표면 제거가 아니라 최종 권한의 상한선을 낮춘다. → 코어 3 (3.1)

   </details>

7. 비특권 사용자가 일반 방식(veth+브리지)으로 컨테이너 netns를 못 잇는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   veth pair를 만들어 한쪽 끝을 user namespace 바깥의 호스트 기본 netns로 옮기거나, 브리지에 붙이거나, 라우팅·방화벽 규칙을 조작하는 작업은 root나 `CAP_NET_ADMIN`을 요구하고 일반 사용자에게는 허용되지 않기 때문이다. 그래서 패킷 처리를 유저스페이스 프로세스로 옮기는 것이 남은 선택지다. → 코어 3 (3.2)

   </details>

8. RootlessKit 구조를 한 줄 경로로 그려라.

   <details markdown="1"><summary>답 확인</summary>

   컨테이너 → (자식 netns 내부의 veth/브리지) → 자식 netns의 TAP 디바이스 → (이더넷 프레임을 `/dev/net/tun`으로 유저스페이스에 전달) → 유저모드 네트워크 스택(slirp4netns/pasta/gvisor-tap-vsock) → 일반 사용자 권한 소켓 API → 호스트의 부모 netns/물리 네트워크. 응답은 반대 경로. → 코어 3 (3.3)

   </details>

9. 기본 백엔드가 gvisor-tap-vsock으로 바뀐 이유와 시점은?

   <details markdown="1"><summary>답 확인</summary>

   Docker v29.5부터다. 이유는 성능이 아니라 보안: 순수 Go라 slirp4netns(C)가 겪어 온 메모리 손상 취약점 클래스가 구조적으로 줄어든다. 임의 패킷을 파싱하는 스택이 탈출 후 피해 반경 축소라는 Rootless의 목적과 맞물려 중요하다. pasta는 성능·호스트 통합이 우수하나 기본값으로 승격되지 않았다. → 코어 4 (4.1)

   </details>

10. Rootless의 세 가지 제약과 각 대응은?

    <details markdown="1"><summary>답 확인</summary>

    (1) 1024 미만 포트: `net.ipv4.ip_unprivileged_port_start` 조정, RootlessKit 포트 드라이버, 리버스 프록시. (2) ping/ICMP: 백엔드와 `net.ipv4.ping_group_range`에 따라 제한되므로 연결성 문제와 구분해 디버깅. (3) macvlan/ipvlan: 물리 인터페이스를 커널 레벨에서 조작해야 해 전제가 충돌하므로 rootful + 추가 보안 계층. → 코어 4 (4.2)

    </details>

### 3. 기억 고리

- **C++ 유추:** dual-stack 네트워크 ≈ `AF_INET6` 소켓에 `IPV6_V6ONLY`를 끄고 IPv4도 받는 dual-stack 소켓. ⚠️ 소켓 옵션이 아니라 **네트워크·IPAM 단위** 설정이며 기본은 꺼져 있고, 방화벽 규칙은 프로토콜별로 따로 있다.
- **C++ 유추:** 유저모드 네트워크 스택 ≈ 클라이언트 연결을 받아 별도 `connect()`로 대신 중계하는 프록시 서버. ⚠️ 연결(스트림)이 아니라 이더넷 **프레임**을 TAP로 받아 파싱하므로 ICMP·메모리 안전성·성능 문제가 따로 생긴다.
- **비유:** Rootless = 관리자 열쇠 없이 세입자 계정으로 건물을 운영. 복도(브리지)는 자기 층 안에서만 깔고, 건물 밖과의 연결은 정문 안내원(유저스페이스 스택)이 편지를 대신 우체통에 넣어 준다. ⚠️ 비유가 깨지는 지점: 안내원도 임의 편지(패킷)를 읽는 프로세스라 취약점이 있으면 공격 표면이 되고(그래서 C→Go 교체), 우편으로 못 보내는 종류(ICMP)나 직통 회선(macvlan)은 처리가 어렵다.
- **묶음(3의 법칙):** IPv6 확인 3(주소 `ip -6 addr` / 이웃 `ip -6 neigh` / 방화벽 `nft list ruleset`·`ip6tables`) · 백엔드 3(slirp4netns · pasta · gvisor-tap-vsock) · Rootless 제약 3(1024 미만 포트 · ICMP · macvlan/ipvlan).
- **대칭·순서:** IPv4 ↔ IPv6(ARP ↔ NDP, 사설 대역 ↔ ULA, `iptables` ↔ `ip6tables`, NAT ↔ NAT66). 백엔드 변천 순서: slirp4netns(C, 오랜 기본) → pasta(25.0 실험) → gvisor-tap-vsock(v29.5 기본, Go).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Rootless Docker에서 컨테이너 패킷이 밖으로 나가는 경로(TAP → 유저스페이스 스택 → 소켓 API)"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "IPv4 방화벽만 설정해서 IPv6로 우회 접속된 사고"를 `AF_INET`/`AF_INET6` 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "ULA + NAT66으로 통제하자" vs B "공인 프리픽스를 직접 노출하자" 또는 A "성능이 좋은 pasta를 기본으로" vs B "메모리 안전한 gvisor-tap-vsock이 맞다" — 번갈아 변호하세요.
- **AI 역할 반전:** "내가 Docker IPv6 활성화와 Rootless 네트워크 구조를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/18_IPv6와_2026년_현재의_네트워크_스택.md (18.1 Docker와 IPv6, 18.2 IPv6 활성화, 18.3 dual-stack 동작, 18.4 IPv6 환경의 방화벽, 18.5 오버레이·macvlan과 IPv6, 실습); docker-fundamental/17_Rootless_Docker의_네트워킹_구조.md (17.1 Rootless Docker란, 17.2 근본 문제, 17.3 RootlessKit 구조, 17.4 slirp4netns에서 gvisor-tap-vsock으로, 17.5 성능·기능 제약, 17.6 설치와 확인, 실습)*
