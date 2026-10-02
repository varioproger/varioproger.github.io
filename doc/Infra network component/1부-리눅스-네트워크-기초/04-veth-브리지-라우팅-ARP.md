---
title: "4장. veth·브리지·라우팅·ARP"
parent: "1부. 리눅스 네트워크 기초"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 4
---

# 4장. veth·브리지·라우팅·ARP

> **🎮 게임 서버 개발자에게** — 서버 랙에서는 서버마다 랜 케이블이 스위치에 꽂혀 있고, 스위치 밖으로 나가려면 게이트웨이(라우터)를 거친다. 컨테이너 호스트 안에서는 이 랙 전체가 **소프트웨어로 재현**된다. 랜 케이블 = veth pair, 스위치 = 리눅스 브리지, 라우터 = 호스트 커널의 라우팅 테이블이다. 결정적으로 다른 점은 케이블의 한쪽 끝이 **다른 네트워크 네임스페이스 안**에 있다는 것이다. 그래서 컨테이너 안에서 `ip addr`로 본 `eth0@if7`의 짝을 찾으려면 호스트 쪽에서 인덱스 번호를 맞춰 봐야 한다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - "같은 노드의 Pod끼리는 되는데 다른 노드의 Pod는 안 된다" 같은 증상에서 `ip route`로 어느 경로가 빠졌는지 읽어야 한다.
> - 컨테이너 안 `eth0`과 짝인 호스트 쪽 veth를 찾아 `tcpdump`를 걸어야 한다.
> - 직접 만든 네임스페이스나 새 노드에서 외부로 나가는 통신이 안 될 때 기본 게이트웨이·IP 포워딩·MASQUERADE 중 무엇이 빠졌는지 점검해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** veth pair는 항상 쌍으로 만들어지는 가상 케이블이고(한쪽은 컨테이너 네임스페이스로, 한쪽은 호스트 브리지에), 브리지는 MAC 주소 테이블(FDB)로 같은 대역 안을 L2 스위칭하며, 대역 밖으로는 라우팅 테이블이 다음 홉을 정하고, ARP/NDP가 그 다음 홉의 IP를 MAC으로 풀어 준다.

1. **veth pair = 가상 랜 케이블** — 항상 쌍으로 생성되어 한쪽에 들어간 패킷이 다른 쪽으로 그대로 나온다. 한쪽 끝을 네임스페이스 안으로 옮기면 그 안에서 `eth0`이 된다. 짝은 `@ifN`의 인덱스 번호로 찾는다.
2. **브리지 = 가상 스위치** — 같은 브리지 안의 통신은 MAC 주소 테이블(FDB)을 보고 프레임을 전달하는 L2 스위칭이며 라우팅도 NAT도 없다. `bridge link show`로 연결을 본다.
3. **대역 밖은 라우팅이 정한다** — 컨테이너는 기본 게이트웨이(브리지 IP)로 보내고, 호스트 커널이 IP 포워딩으로 올려 라우팅 테이블(`ip route`)로 다음 홉을 정하며, 외부로 나갈 땐 MASQUERADE가 붙는다. 노드 간 경로도 `10.244.2.0/24 via 192.168.1.11 dev eth0` 같은 한 줄 경로다.
4. **ARP는 같은 L2 세그먼트 안에서 IP를 MAC으로 푼다** — IPv4는 ARP, IPv6는 NDP가 맡고 `ip neigh`로 이웃 테이블을 본다. 브리지는 이더넷 프레임을 그대로 전달하므로 ARP/NDP를 특별히 취급하지 않는다.

**이 장의 학습 목표**

- veth pair가 만들어지고 네임스페이스로 옮겨져 `eth0`이 되는 과정을 명령 수준으로 설명한다.
- 호스트의 veth와 컨테이너의 `eth0`을 `@ifN`으로 짝짓고 `bridge link show`로 브리지 연결을 확인한다.
- L2 스위칭, 라우팅, NAT가 개입하는 통신을 구분한다.
- `ip route`, `ip neigh`, `ip -d link show` 출력으로 패킷 경로를 재구성한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 NIC와 스위치를 잇는 랜 케이블 | veth pair | 한쪽에 넣은 프레임이 반대쪽으로 나온다 | 케이블 양 끝이 **서로 다른 네트워크 네임스페이스**에 있을 수 있고, 인덱스 `@ifN`으로 짝을 찾는다 |
| 같은 L2 스위치에 꽂힌 서버끼리 통신 | 리눅스 브리지의 L2 스위칭 | MAC 주소 테이블로 전달한다. 라우팅·NAT 없음 | 스위치가 별도 장비가 아니라 **호스트 커널의 소프트웨어 디바이스**이고 호스트가 그 브리지에 IP(게이트웨이)를 가진다 |
| 기본 게이트웨이를 설정한 서버 | 컨테이너의 `default via 10.99.0.1` | 같은 대역 밖은 게이트웨이로 보낸다 | 게이트웨이가 호스트 자신(브리지/veth의 호스트 쪽 IP)이고, 나가는 길에 호스트 커널의 IP 포워딩과 MASQUERADE가 필요하다 |
| `connect(IP)` 한 번이면 알아서 도달 | 라우팅 테이블 조회 + ARP | 앱은 IP만 안다 | 다음 홉은 라우팅 테이블이 정하고, 같은 L2 안의 MAC은 ARP/NDP(이웃 테이블)가 알려 준다(순서 정리는 4.1의 [보충] 참고) |
| 서버 사이 정적 라우트(`route add`) | 노드의 `10.244.2.0/24 via 192.168.1.11` | 목적지 대역과 다음 홉을 한 줄로 적는다 | BGP나 CNI가 자동으로 주입하며 `proto bird`처럼 출처가 표시된다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. veth를 하나 만들면 인터페이스가 몇 개 생길까? 한쪽을 다른 네임스페이스로 옮기면 어떻게 될까?
> 2. 컨테이너 안 `eth0@if7`의 `if7`은 무엇을 가리킬까?
> 3. 같은 브리지에 꽂힌 두 컨테이너가 통신할 때 패킷은 어느 계층까지 올라갈까?
> 4. 새로 만든 네임스페이스에서 외부로 ping을 하려면 최소한 무엇이 필요할까?
> 5. `ip neigh`에는 무엇이 들어 있을까? 그 정보는 어디서 올까?
>
> **처리법:** 🛠 실습 `ip link add veth-host type veth peer name veth-pod`, `ip link set veth-pod netns pod-lab`, `docker exec web ip link show eth0`, `ip link show type veth`, `bridge link show`, `ip route`, `ip neigh` → 바로 실행(Linux, root 필요) · 🗺 관계도 "veth ↔ 브리지(FDB) ↔ 라우팅 ↔ ARP"를 패킷 한 개의 결정 순서로 그리기 · 📦 카드로 `@ifN`, FDB, `default via`, `proto bird`, `scope host`, NDP · 유추 비판 A "브리지 = 스위치"가 어디서 깨지는지

---

## 코어 1. veth pair는 가상 랜 케이블이다

### 1.1 veth의 성질

**한 줄 요약:** veth는 항상 쌍으로 생성되는 가상 인터페이스이고, 한쪽 끝으로 들어간 패킷이 다른 끝으로 그대로 나온다.

Docker는 컨테이너를 브리지 네트워크에 연결할 때 veth pair를 만들어 **한쪽 끝은 컨테이너의 네트워크 네임스페이스로 옮기고**(컨테이너 안에서 `eth0`으로 보임), **다른 끝은 호스트 네임스페이스에 남겨 브리지에 연결**한다.

```
[ 호스트 네트워크 네임스페이스 ]                [ 컨테이너 네트워크 네임스페이스 ]

   docker0 (브리지)
       │
       ├── vethXXXXXXX@if5  ◄──── veth pair ────►  eth0@if6      (컨테이너 1)
       │
       └── vethYYYYYYY@if7  ◄──── veth pair ────►  eth0@if8      (컨테이너 2)
```

### 1.2 짝 찾기: @ifN

**한 줄 요약:** 컨테이너 안 `eth0@ifN`의 N은 반대쪽 끝(호스트 쪽 veth)의 인터페이스 인덱스이므로, 호스트에서 같은 인덱스를 가진 인터페이스가 짝이다.

```bash
# 컨테이너 안에서 인터페이스 번호 확인
docker exec web ip link show eth0
# 예: 6: eth0@if7: <BROADCAST,MULTICAST,UP,LOWER_UP> ...

# 호스트에서 브리지에 연결된 veth 목록 확인
ip link show type veth
bridge link show
```

호스트에서 `ip link show`로 같은 인덱스 번호를 가진 인터페이스를 찾으면 그 컨테이너와 짝을 이루는 veth의 호스트 쪽 끝이다.

> **[보충]** 원문 그림에서 호스트 쪽 `vethXXXXXXX@if5`와 컨테이너 쪽 `eth0@if6`은 서로 상대의 인덱스를 `@if` 뒤에 적는 형식의 예시이며, 숫자 자체(5, 6, 7, 8)는 예시일 뿐이다. 이 숫자를 보고 짝을 찾는 요령은 두 출력의 "내 인덱스"와 "`@if` 뒤 상대 인덱스"를 서로 맞춰 보는 것이다.

컨테이너 이미지에 `ip` 명령이 없으면 [3장](03-네트워크-네임스페이스.md)의 `nsenter --target $PID --net -- ip link show eth0`로 호스트 도구를 써서 확인한다. 과거에는 `brctl show docker0`로 브리지에 연결된 veth를 확인했지만 `brctl`은 `bridge-utils` 패키지 소속이라 최근 배포판에는 기본 설치되지 않는 경우가 많다. 요즘은 iproute2의 `bridge link show` 또는 `bridge fdb show br docker0`을 쓴다.

### 1.3 손으로 연결하기: Pod의 네트워크 구성

**한 줄 요약:** `ip link add ... type veth peer name ...`로 쌍을 만들고, 한쪽을 `ip link set ... netns`로 옮긴 뒤 양쪽에 IP를 주고 기본 게이트웨이를 잡으면 CNI가 하는 일을 재현한 것이다.

[3장](03-네트워크-네임스페이스.md)에서 만든 빈 네임스페이스 `pod-lab`을 채운다(`kubernetes-textbook-main` 19.3 단계 2).

```bash
# ① 루프백 활성화 — localhost 통신에 필수
ip netns exec pod-lab ip link set lo up

# ② veth 페어 생성 (가상 랜선 한 쌍)
ip link add veth-host type veth peer name veth-pod

# ③ 한쪽 끝을 네임스페이스 안으로 넣는다
ip link set veth-pod netns pod-lab

# ④ Pod 쪽 인터페이스 설정
ip netns exec pod-lab ip link set veth-pod name eth0
ip netns exec pod-lab ip addr add 10.99.0.2/24 dev eth0
ip netns exec pod-lab ip link set eth0 up

# ⑤ 호스트 쪽 설정
ip addr add 10.99.0.1/24 dev veth-host
ip link set veth-host up

# ⑥ Pod의 기본 게이트웨이
ip netns exec pod-lab ip route add default via 10.99.0.1
```

연결 확인은 호스트 → Pod, Pod → 호스트 양방향으로 한다.

```bash
ping -c 2 10.99.0.2                          # 호스트 → Pod
ip netns exec pod-lab ping -c 2 10.99.0.1    # Pod → 호스트
```

여기서 만든 `10.99.0.2`가 이 Pod의 IP다. 외부 통신까지 원하면 NAT와 IP 포워딩을 켠다.

```bash
# 외부 통신을 원한다면 NAT
iptables -t nat -A POSTROUTING -s 10.99.0.0/24 ! -o veth-host -j MASQUERADE
sysctl -w net.ipv4.ip_forward=1
ip netns exec pod-lab ping -c 2 8.8.8.8
```

> 이 절의 명령은 원천 `kubernetes-textbook-main` 19.3에서 그대로 가져왔다. 여기서는 브리지를 쓰지 않고 호스트 쪽 veth에 IP를 직접 준 점대점 구성이며, Docker는 같은 일을 호스트 쪽 veth를 브리지(`docker0`)에 연결하는 방식으로 한다. 이 책의 필자는 이 환경(Windows)에서 이 명령을 실행해 보지 못했다.

정리는 다음과 같다.

```bash
ip netns delete pod-lab
ip link delete veth-host 2>/dev/null
iptables -t nat -D POSTROUTING -s 10.99.0.0/24 ! -o veth-host -j MASQUERADE 2>/dev/null
```

---

## 코어 2. 브리지는 가상 스위치다

### 2.1 같은 브리지 안은 L2 스위칭

**한 줄 요약:** 브리지는 학습한 MAC 주소 테이블(FDB)을 보고 프레임을 상대 컨테이너의 veth로 그대로 전달하며, 이 경로에는 라우팅도 NAT도 개입하지 않는다.

컨테이너 A가 컨테이너 B의 IP로 패킷을 보내면 그 패킷은 veth pair를 통해 `docker0` 브리지로 들어오고, 브리지는 FDB(Forwarding Database)를 참고해 해당 프레임을 컨테이너 B의 veth 쪽으로 전달한다. 리눅스 브리지가 하는 일은 물리 이더넷 스위치가 하는 일과 개념적으로 동일하다. 같은 네트워크 안에서는 IP 계층보다 아래인 L2 계층에서 통신이 끝난다.

```
컨테이너 A eth0 ─ vethA ─┐
                          ├─ docker0 (브리지, FDB 조회) ──► vethB ─ 컨테이너 B eth0
                          │
                          └─(대역 밖 목적지) 호스트 커널 IP 포워딩 → 라우팅 → MASQUERADE
```

```bash
bridge link show                  # 브리지에 연결된 인터페이스
bridge fdb show br docker0        # 브리지의 MAC 주소 테이블
```

### 2.2 브리지 네트워크가 쓰이는 곳

**한 줄 요약:** Docker의 `docker0`과 사용자 정의 브리지, 그리고 단순한 CNI의 로컬 연결이 이 구조를 쓴다.

Docker를 설치하면 `docker0`이라는 리눅스 브리지가 만들어지고, `--network`를 지정하지 않은 컨테이너는 이 기본 브리지에 연결된다. 사용자 정의 브리지는 겉보기에 같은 리눅스 브리지지만 이름 기반 통신과 네트워크 간 격리를 준다. 상세는 [8장](../2부-Docker-네트워크/08-브리지-네트워크와-포트-게시.md)에서 다룬다. 쿠버네티스에서도 CNI 플러그인 호출 예시(`/opt/cni/bin/bridge`)에 브리지 플러그인이 등장하지만 상세는 [15장](../3부-쿠버네티스-네트워크/15-CNI-플러그인과-패킷-경로.md)에서 다룬다.

> **[보충]** 쿠버네티스 노드에서 모든 Pod가 같은 브리지에 꽂히는 구성인지, 노드의 라우팅 테이블에 Pod별 경로를 두는 구성인지는 CNI 플러그인마다 다르다. 이 장의 원천은 두 형태를 모두 예로 든다(Docker는 브리지, kind의 기본 CNI인 kindnet은 노드별 정적 경로).

---

## 코어 3. 대역 밖은 라우팅이 정한다

### 3.1 컨테이너에서 외부로: 게이트웨이 → 포워딩 → MASQUERADE

**한 줄 요약:** 목적지가 같은 브리지 대역 밖이면 컨테이너의 라우팅 테이블이 기본 게이트웨이(브리지 IP, 예: 172.17.0.1)를 다음 홉으로 정하고, 호스트 커널이 IP 포워딩 경로로 올려 출발지를 호스트 IP로 치환한다.

| 통신 | 경로 | 계층 |
|---|---|---|
| 같은 브리지 안의 컨테이너 ↔ 컨테이너 | veth → 브리지가 MAC 주소 테이블(FDB)로 전달 → 상대 veth | L2 스위칭 (라우팅·NAT 없음) |
| 컨테이너 → 외부 | 컨테이너의 기본 게이트웨이(브리지 IP) → 호스트 커널 IP 포워딩 → 출발지 IP를 호스트 IP로 치환(MASQUERADE) | 라우팅 + NAT |

```bash
iptables -t nat -L POSTROUTING -n -v | grep -i MASQUERADE
```

정리하면 같은 브리지 안은 "스위칭"이고 외부로 나가는 통신은 "라우팅 + NAT"라는 완전히 다른 계층의 동작이다. NAT 규칙의 상세는 [5장](05-netfilter-iptables-NAT-conntrack.md)에서 다룬다.

### 3.2 노드 사이: 라우팅 테이블이 곧 경로다

**한 줄 요약:** 네이티브 라우팅에서 다른 노드의 Pod 대역은 `via <노드IP>` 경로이고, 같은 노드의 Pod는 veth로 직접 가는 `scope host` 경로이며, 캡슐화 인터페이스(vxlan 등)가 보이면 오버레이다.

```bash
ip route | grep 10.244
# 10.244.2.0/24 via 192.168.1.11 dev eth0 proto bird
```

`proto bird`는 이 경로가 BGP로 학습된 경로(BIRD가 노드 B로부터 받아 커널에 주입)임을 알려 준다. 캡슐화가 없으므로 `tcpdump`로 봐도 평범한 IP 패킷이다. kind의 기본 CNI인 kindnet은 각 노드에 다른 노드의 Pod CIDR로 가는 정적 경로를 직접 추가하는 방식이어서 사실상 네이티브 라우팅의 축소판이다.

```bash
docker exec k8s-guide-worker ip route | grep 10.244
```

```
10.244.0.0/24 via 172.18.0.2 dev eth0   # control-plane 노드로
10.244.2.0/24 via 172.18.0.4 dev eth0   # worker2 노드로
10.244.1.1 dev veth... scope host       # 로컬 Pod
```

캡슐화 인터페이스(`vxlan.*` 같은)가 보이지 않으면 이 클러스터가 캡슐화 없이 직접 라우팅한다는 뜻이다. 오버레이를 쓰면 라우팅 테이블이 `10.244.2.0/24 → dev vxlan.calico`(또는 `flannel.1`) 같은 형태가 되고, FDB에서 상대 노드의 실제 IP를 조회한다([6장](06-오버레이-VXLAN-MTU.md)).

```bash
ip -d link show | grep -A2 vxlan
bridge fdb show dev vxlan.calico   # 또는 flannel.1
```

### 3.3 Pod 안에서 보는 라우팅

**한 줄 요약:** `kubectl exec pod-a -- ip route`와 `ip addr`로 Pod 쪽 설정을, 호스트에서 `nsenter ... ip route`로 컨테이너 쪽 설정을 본다.

```bash
kubectl exec pod-a -- ip addr
kubectl exec pod-a -- ip route
```

```bash
docker exec k8s-guide-worker bash -c '
PID=$(crictl inspect $(crictl ps -q --name <container-name>) | jq -r .info.pid)
nsenter -t $PID -n ip addr
nsenter -t $PID -n ip route
'
```

애플리케이션 이미지가 너무 미니멀해 디버그 컨테이너조차 넣기 부담스러우면, Pod 안이 아니라 호스트 쪽 veth에서 캡처할 수 있다. Pod의 네트워크 네임스페이스는 veth 쌍의 한쪽 끝이고 다른 쪽 끝은 호스트 네임스페이스(또는 CNI 브리지)에 있기 때문이다. 원천은 veth 이름을 찾는 명령과 캡처를 다음처럼 든다(1.2절의 `@ifN` 짝 찾기와 같은 원리다).

```bash
# Pod에 연결된 veth 인터페이스 이름 찾기
docker exec k8s-guide-worker sh -c \
  'ethtool -S <pod-내부-eth0-ifindex> 2>/dev/null; ip link | grep veth'

# 호스트에서 해당 veth로 캡처 — Pod 내부에 아무것도 설치하지 않고도 확인 가능
docker exec k8s-guide-worker tcpdump -i <veth이름> -n
```

경로를 따라가는 진단 순서는 [23장](../4부-진단/23-네트워크-장애-진단.md)에서 완성한다.

---

## 코어 4. ARP는 같은 L2 안에서 IP를 MAC으로 푼다

### 4.1 ARP와 NDP

**한 줄 요약:** IPv4에서 같은 L2 세그먼트 안의 다른 호스트의 MAC 주소를 알아내는 것이 ARP이고, IPv6에서는 NDP(Neighbor Discovery Protocol)가 그 역할을 대신한다.

NDP는 ARP처럼 브로드캐스트가 아니라 ICMPv6 메시지(Neighbor Solicitation/Advertisement)를 멀티캐스트로 주고받는 방식으로 동작하며, 이웃 탐색뿐 아니라 라우터 발견, 중복 주소 탐지까지 통합적으로 수행한다. 브리지는 이더넷 프레임을 그대로 포워딩하므로 ARP든 NDP든 브리지 계층에서 특별히 다르게 취급하지 않는다. 방화벽 규칙을 짤 때는 ICMPv6의 Neighbor Discovery 관련 메시지를 함부로 차단하면 IPv6 통신 자체가 깨질 수 있다는 점을 유의한다([12장](../2부-Docker-네트워크/12-IPv6-듀얼스택과-Rootless-네트워킹.md)).

> **[보충]** 원천은 ARP의 동작을 "같은 L2 세그먼트 안의 다른 호스트의 MAC 주소를 알아내는 역할"이라고만 설명한다. 이 장에서 이 문장을 "라우팅 테이블이 다음 홉 IP를 정하면, 그 IP의 MAC을 ARP가 푼다"는 순서로 풀어 쓴 것은 이 책이 덧붙인 입문 설명이며, 원천이 이 순서를 명시한 것은 아니다.

### 4.2 이웃 테이블 보기

**한 줄 요약:** `ip neigh`(IPv6는 `ip -6 neigh show`)가 학습된 IP-MAC 대응을 보여 준다.

```bash
# ARP/이웃 테이블
docker exec k8s-guide-worker ip neigh
```

IPv6 dual-stack 환경에서는 `ip -6 neigh show`로 NDP 이웃 테이블이 채워지는 것을 관찰할 수 있다.

### 4.3 ARP가 장애 원인이 되는 사례

**한 줄 요약:** 여러 노드가 같은 IP를 자기 것이라고 ARP로 응답하면 충돌이 생기며, IPVS 모드의 `kube-ipvs0`와 MetalLB L2 모드가 그 사례다.

- kube-proxy IPVS 모드는 `kube-ipvs0` 더미 인터페이스에 모든 ClusterIP를 바인딩하므로 이 노드가 그 IP들의 소유자라고 ARP로 응답할 수 있다. 여러 노드가 같은 ClusterIP를 동일하게 바인딩하므로 "누가 진짜 소유자인가"를 두고 충돌이 생길 수 있다. 특히 MetalLB L2 모드처럼 외부 IP를 ARP로 광고하는 컴포넌트와 얽히면 문제가 커진다.
- 이를 막기 위해 kube-proxy는 IPVS 모드로 전환될 때 커널의 ARP 파라미터를 조정해 `kube-ipvs0`가 ARP 요청에 응답하지 않게(NOARP) 만든다(strict ARP). `ip addr show kube-ipvs0`의 `<BROADCAST,NOARP>` 플래그가 그 결과다.
- MetalLB는 IP 풀을 정의하면 ARP(L2 모드)나 BGP(L3 모드)로 IP를 광고한다.

IPVS 모드에서 외부 IP 광고가 꼬이면 `sysctl net.ipv4.conf.all.arp_ignore/arp_announce`를 확인한다. 상세는 [17장](../3부-쿠버네티스-네트워크/17-kube-proxy-데이터플레인.md)에서 이어진다.

---

## 실무 적용

### 체크리스트

- [ ] veth는 항상 쌍이며, 컨테이너 안 `eth0@ifN`의 N으로 호스트 쪽 짝을 찾는다.
- [ ] 같은 브리지 안의 통신은 L2 스위칭(FDB)이고, 대역 밖은 게이트웨이 → IP 포워딩 → 라우팅 + MASQUERADE다.
- [ ] 브리지 확인은 `bridge link show`/`bridge fdb show br docker0`이다(`brctl`은 `bridge-utils` 의존).
- [ ] 직접 만든 네임스페이스의 외부 통신에는 기본 게이트웨이(`ip route add default via ...`), `net.ipv4.ip_forward=1`, MASQUERADE 규칙이 필요하다.
- [ ] 노드 간 경로는 `ip route | grep <Pod CIDR 접두>`로 본다. `proto bird`는 BGP, `vxlan.*` 인터페이스가 있으면 오버레이다.
- [ ] 이웃 테이블은 `ip neigh`(IPv6는 `ip -6 neigh show`)로 본다.
- [ ] IPVS 모드와 MetalLB L2 모드를 함께 쓰면 ARP 충돌(strict ARP)을 확인한다.

### 시나리오로 확인하기

1. **상황:** `docker exec web ip link show eth0` 결과가 `6: eth0@if7`이다. 호스트에서 이 컨테이너의 트래픽을 `tcpdump`로 보고 싶다.
   **질문:** 어느 인터페이스를 지정해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `@if7`은 veth pair 반대쪽 끝의 인덱스이므로 호스트에서 `ip link show type veth`(또는 `ip link show`)로 인덱스 7을 가진 `vethXXXX`를 찾는다. 그것이 이 컨테이너의 호스트 쪽 끝이며, `bridge link show`로 브리지 연결도 확인한다. 이미지에 `ip`가 없으면 `nsenter --target $PID --net -- ip link show eth0`를 쓴다. → 코어 1 (1.2)

   </details>

2. **상황:** `ip netns add`로 만든 네임스페이스에 veth를 연결하고 호스트 ↔ 네임스페이스 ping은 되는데, 네임스페이스에서 `ping 8.8.8.8`이 안 된다.
   **질문:** 무엇을 점검하나?

   <details markdown="1"><summary>답 확인</summary>

   네임스페이스 안에 기본 게이트웨이(`ip route add default via 10.99.0.1`)가 있는지, 호스트에서 `net.ipv4.ip_forward=1`인지, `POSTROUTING`에 `-s 10.99.0.0/24 ! -o veth-host -j MASQUERADE` 규칙이 있는지 본다. 원천의 구성에서 외부 통신에는 이 세 가지가 함께 쓰인다. → 코어 1 (1.3), 코어 3 (3.1)

   </details>

3. **상황:** 같은 노드의 Pod끼리는 통신되는데 다른 노드의 Pod와는 안 된다.
   **질문:** 어디를 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   원천의 증상별 원인표에서 "같은 노드는 되고 다른 노드는 안 됨"은 오버레이/라우팅 또는 MTU 문제다. 노드에서 `ip route | grep <Pod CIDR>`로 상대 노드 Pod 대역으로 가는 경로(`via <노드IP>` 또는 `vxlan` 인터페이스)가 있는지, `ip -d link show | grep -A2 vxlan`, `ip neigh`를 보고, 양쪽 노드에서 `tcpdump -i any -nn "host <PodIP>"`로 어디서 패킷이 사라지는지 확인한다. → 코어 3 (3.2), 코어 4 (4.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1 veth = 항상 ____ 으로 생성, 한쪽 입력 → 다른 쪽 ____
  컨테이너 쪽 ____ ◄──► 호스트 쪽 ____ → ____ 연결.  짝 찾기: eth0@if__ 의 __ = 반대편 ____
  손으로: ip link add ____ type veth peer name ____ → ip link set ____ netns ____
          → 네임스페이스 안 이름을 ____ 로 → IP → ip route add ____ via ____

코어 2 같은 브리지 안 = L__ 스위칭, ____ 테이블(FDB), 라우팅·____ 없음
  확인: ____ link show / ____ fdb show br docker0   (구: ____ show, bridge-utils)

코어 3 대역 밖: 컨테이너 → 기본 ____ (브리지 IP) → 호스트 ____ → ____ (출발지를 호스트 IP로)
  노드 간(네이티브): 10.244.2.0/24 ____ 192.168.1.11 dev eth0 proto ____ (BGP)
  로컬 Pod: ... dev veth... scope ____ / 오버레이: dev ____.calico 또는 flannel.1

코어 4 IPv4 = ____ , IPv6 = ____ (ICMPv6 멀티캐스트) / 확인: ip ____
  사례: kube-ipvs0 ARP 응답 → 해결: ____ ARP, 플래그 ____
```

### 2. 인출 질문

1. veth pair란 무엇이며 Docker는 컨테이너 연결에 어떻게 쓰는가?

   <details markdown="1"><summary>답 확인</summary>

   항상 쌍으로 생성되는 가상 인터페이스로, 한쪽으로 들어간 패킷이 다른 쪽으로 그대로 나온다. Docker는 한쪽 끝을 컨테이너 네트워크 네임스페이스로 옮겨(`eth0`) 다른 끝은 호스트에 남겨 브리지에 연결한다. → 코어 1 (1.1)

   </details>

2. 컨테이너 안 `eth0@if7`에서 호스트 쪽 짝을 찾는 방법은?

   <details markdown="1"><summary>답 확인</summary>

   `@if` 뒤 숫자는 반대쪽 끝의 인터페이스 인덱스다. 호스트에서 `ip link show type veth` 또는 `ip link show`로 같은 인덱스를 가진 인터페이스를 찾고, `bridge link show`로 브리지 연결을 확인한다. → 코어 1 (1.2)

   </details>

3. 같은 브리지의 두 컨테이너 통신에 라우팅이나 NAT가 개입하는가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. 브리지가 FDB(MAC 주소 테이블)를 보고 프레임을 상대 컨테이너의 veth로 전달하는 L2 스위칭이다. 물리 스위치와 개념적으로 동일하며 IP 계층 아래에서 끝난다. → 코어 2 (2.1)

   </details>

4. 컨테이너가 외부로 나갈 때의 경로는?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너의 기본 게이트웨이(브리지 IP, 예: 172.17.0.1) → 호스트 커널 IP 포워딩 → `nat` 테이블 `POSTROUTING`의 MASQUERADE로 출발지를 호스트 IP로 치환한다(아웃바운드 NAT). → 코어 3 (3.1)

   </details>

5. 손으로 만든 네임스페이스에서 외부 ping이 되게 하려면 무엇이 필요한가?

   <details markdown="1"><summary>답 확인</summary>

   veth로 연결해 양쪽에 IP를 주고(`10.99.0.2/24`, `10.99.0.1/24`), 네임스페이스 안에 `ip route add default via 10.99.0.1`, 호스트에 `sysctl -w net.ipv4.ip_forward=1`과 `iptables -t nat -A POSTROUTING -s 10.99.0.0/24 ! -o veth-host -j MASQUERADE`가 필요하다(원천 19.3의 구성). → 코어 1 (1.3)

   </details>

6. `ip route`의 `10.244.2.0/24 via 192.168.1.11 dev eth0 proto bird`는 무엇을 뜻하는가?

   <details markdown="1"><summary>답 확인</summary>

   다른 노드(192.168.1.11)가 담당하는 Pod 대역으로 가는 경로이며 `proto bird`는 BIRD가 BGP로 학습해 커널에 주입했다는 표시다. 캡슐화가 없으므로 tcpdump에서도 평범한 IP 패킷으로 보인다. → 코어 3 (3.2)

   </details>

7. 오버레이인지 네이티브 라우팅인지 어떻게 구분하는가?

   <details markdown="1"><summary>답 확인</summary>

   `ip route | grep <Pod CIDR 접두>`와 `ip -d link show | grep -A2 -E 'vxlan|ipip|flannel'`로 본다. 캡슐화 인터페이스(`vxlan.*` 등)가 보이지 않으면 직접 라우팅이고, 보이면 오버레이이며 `bridge fdb show dev vxlan.calico`로 FDB를 확인한다. → 코어 3 (3.2)

   </details>

8. ARP와 NDP의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   둘 다 같은 L2 세그먼트에서 이웃의 MAC을 알아내는 역할이다. ARP는 IPv4, NDP는 IPv6용이며 NDP는 브로드캐스트가 아니라 ICMPv6(NS/NA)를 멀티캐스트로 주고받고 라우터 발견·중복 주소 탐지까지 수행한다. 확인은 `ip neigh`/`ip -6 neigh show`. → 코어 4 (4.1, 4.2)

   </details>

9. IPVS 모드에서 strict ARP가 필요한 이유는?

   <details markdown="1"><summary>답 확인</summary>

   `kube-ipvs0`에 모든 ClusterIP를 바인딩하므로 여러 노드가 같은 IP의 소유자라고 ARP로 응답해 충돌이 생길 수 있고, MetalLB L2 모드와 얽히면 더 커진다. kube-proxy가 ARP 파라미터를 조정해 `kube-ipvs0`가 ARP에 응답하지 않게(NOARP) 한다. → 코어 4 (4.3)

   </details>

### 3. 기억 고리

- **C++ 유추:** veth ≈ 두 프로세스를 잇는 소켓 쌍(`socketpair`). ⚠️ 프로세스 간 fd가 아니라 **이더넷 프레임**이 오가며, 양 끝이 서로 다른 네트워크 네임스페이스에 속할 수 있다.
- **C++ 유추:** 라우팅 테이블 조회 ≈ 라우터에 적힌 규칙으로 다음 홉 찾기. ⚠️ 앱은 IP만 알지만 커널이 다음 홉과 그 MAC까지 풀어야 프레임이 나간다.
- **비유:** veth = 두 방 사이의 인터폰, 브리지 = 복도 중앙의 교환대(방 번호표 FDB로 연결), 라우팅 = 건물 밖으로 가는 우편물을 1층 데스크(게이트웨이)에 넘기는 규칙, ARP = "이 호실 주민 누구세요?" 하고 복도에 외쳐 얼굴(MAC)을 알아 두는 것. ⚠️ 비유가 깨지는 지점: 교환대·데스크는 사람이 아니라 커널 코드이고, 인터폰의 양 끝방은 서로 **다른 네트워크 네임스페이스**일 수 있다. IPv6에서는 복도에 외치는 대신(브로드캐스트) 해당 그룹에만 속삭인다(멀티캐스트 NDP).
- **묶음(3의 법칙):** 통신 3종 (같은 브리지=스위칭 / 밖으로=라우팅+MASQUERADE / 노드 간=`via` 경로 또는 `vxlan`) · 확인 명령 3 (`ip link show type veth` / `bridge link show` / `ip route`·`ip neigh`) · 외부 통신 3요소 (기본 게이트웨이 / `ip_forward` / MASQUERADE).
- **대칭·순서:** 패킷 한 개의 결정 순서(개념 정리): 대상 IP → 라우팅 테이블이 다음 홉 결정 → ARP/NDP로 다음 홉 MAC 해석 → 브리지가 FDB로 veth 선택. 쌍 구조: 컨테이너 쪽 `eth0` ↔ 호스트 쪽 `vethXXXX`, `if` 인덱스 ↔ 인덱스.

> **[보충]** 위 "결정 순서"는 이 책이 라우팅·ARP·브리지의 역할을 한 줄로 이은 입문용 정리이며, 원천이 이 순서를 한 목록으로 명시한 것은 아니다.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "같은 브리지의 두 컨테이너가 통신할 때와 컨테이너가 인터넷으로 나갈 때 패킷이 어디까지 올라가는지"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "컨테이너의 `eth0`이 어떻게 호스트의 브리지와 연결되는지"를 랜 케이블·스위치·게이트웨이 비유 없이 `socketpair`와 소켓 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "노드마다 Pod 경로를 라우팅 테이블에 정적 경로로 넣는 편이 진단하기 쉽다" vs B "오버레이로 감싸는 편이 편하다" — 양쪽을 번갈아 변호해 보세요. (`proto bird` 경로, tcpdump로 보이는 패킷, 캡슐화 인터페이스, 물리 네트워크 설정 필요 여부를 근거로)
- **AI 역할 반전:** "내가 veth, 브리지, 라우팅, ARP의 관계를 패킷 한 개 기준으로 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/12_브리지_네트워크_심화.md (12.1 기본 브리지와 사용자 정의 브리지, 12.2 veth pair, 12.3 통신 경로의 차이); kubernetes-textbook-main/05-내부-동작-파헤치기/19-Pod를-밑바닥부터-만들어-보기.md (19.3 단계 1·2 veth·라우팅·NAT 구성); Kubernetes_Internals_Network_Guide/03-네트워크/13-네트워킹-모델과-CNI-스펙.md (13.5 네이티브 라우팅 경로·kind 실습 라우트); kubernetes-textbook-main/05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md (23.6 진단 플로차트: ip route, ip neigh, ip -d link show, 증상별 원인표); docker-fundamental/18_IPv6와_2026년_현재의_네트워크_스택.md (ARP/NDP 설명); Kubernetes_Internals_Network_Guide/03-네트워크/15-kube-proxy-데이터플레인-해부.md (15.2 strict ARP), 19-eBPF-데이터플레인과-네트워크-트러블슈팅.md (veth 인덱스 확인 명령); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/09-서비스와-클러스터-네트워킹-기초.md (MetalLB ARP/BGP 한 줄)*
