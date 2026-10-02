---
title: "부록 A. 용어집"
parent: "부록"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 1
---

# 부록 A. 용어집

이 책에 나오는 리눅스, Docker, 쿠버네티스 네트워크 용어를 분야별로 정리했다. 정의는 참고 자료(`linux`, `docker-fundamental`, `Kubernetes_Internals_Network_Guide`, `kubernetes-textbook-main`)의 설명을 따랐다. 괄호 안의 숫자는 이 용어를 주로 다루는 장이다.

> **[보충]** 아래 항목 중 이름 뒤에 †를 붙인 것은 참고 자료가 용어를 쓰기만 하고 정의하지 않아, 입문자용으로 일반적인 의미를 한 줄로 보태 적은 것이다. 장 번호는 이 책의 목차(1~23장) 기준이며, 이 용어집은 각 장 본문이 아니라 원천 자료를 기준으로 작성했으므로 장 본문의 표현과 세부가 다를 수 있다.

## 리눅스 기반

### 소켓과 TCP

| 용어 | 설명 |
|---|---|
| **소켓(socket)** | 소켓은 파일 디스크립터(fd)다. 그래서 `read`/`write`/`close`/`epoll`이 파일과 똑같이 동작한다 (2장) |
| **backlog / accept 큐** | `listen(fd, backlog)`의 backlog는 `net.core.somaxconn`으로 상한이 잡힌다. 3-way handshake는 커널이 끝내고 `accept()`는 완성된 연결을 큐에서 꺼낼 뿐이다 (2장) |
| **바이트 스트림** | TCP에는 메시지 경계가 없다. 보낸 쪽의 `write` 횟수와 받는 쪽의 `read` 횟수는 무관하며 경계는 애플리케이션이 만든다 (2장) |
| **TIME_WAIT** | 연결을 먼저 닫은 쪽이 2×MSL(리눅스 60초) 동안 머무는 상태. 늦게 도착한 패킷이 새 연결과 섞이지 않게 한다 (2장) |
| **SO_REUSEADDR / SO_REUSEPORT** | TIME_WAIT 소켓이 점유한 포트에도 `bind`가 되게 한다 / 여러 프로세스가 같은 포트에 각자 `bind`하고 커널이 연결을 분배하게 한다 (2장) |
| **에페머럴(임시) 포트** | 클라이언트 쪽 연결에 자동 할당되는 포트. 기본 범위 32768&#126;60999(약 28,000개)이며 고갈되면 새 연결이 실패한다 (2, 23장) |
| **half-open 연결** | 상대 머신이 갑자기 사라져 FIN도 RST도 오지 않아 내 소켓이 `ESTABLISHED`로 남는 상태. keepalive나 heartbeat 없이는 감지할 수 없다 (2장) |
| **DNS 조회의 블로킹** | `getaddrinfo()`는 `/etc/hosts`와 `/etc/resolv.conf`의 네임서버를 거치는 동기 블로킹 호출이다. 컨테이너에서 DNS가 느린 것은 흔한 장애 원인(`ndots:5`)이다 (2, 18장) |
| **MTU** | 한 번에 보낼 수 있는 최대 패킷 크기. 오버레이는 캡슐화 헤더만큼 Pod 쪽 MTU를 줄여야 한다 (6, 23장) |

### 네임스페이스·가상 인터페이스·라우팅

| 용어 | 설명 |
|---|---|
| **네트워크 네임스페이스(net ns)** | 컨테이너 네트워크 격리의 정체. 인터페이스·라우팅·포트를 독립시킨다. 리눅스 네임스페이스는 mnt, net, pid, uts, ipc, user, cgroup, time 8종이 있다 (3장) |
| **`ip netns`** | 컨테이너와 무관하게 네트워크 네임스페이스를 만들고(`add`) 그 안에서 명령을 실행하는(`exec`) 도구. 새 네임스페이스에는 DOWN 상태의 `lo` 하나뿐이다 (3장) |
| **`nsenter` / `unshare`** | 실행 중인 프로세스의 네임스페이스에 진입 / 새 네임스페이스에서 프로세스를 실행하는 도구 (3, 23장) |
| **pause 컨테이너** | Pod의 네트워크 네임스페이스를 소유하는 "빈" 프로세스. 앱 컨테이너가 죽었다 살아나도 네임스페이스와 Pod IP가 유지되고, PID 1로서 좀비를 수거한다. 인프라 컨테이너·샌드박스라고도 한다 (3, 13장) |
| **veth pair** | 항상 쌍으로 만들어지는 가상 인터페이스. 한쪽에 들어간 패킷이 다른 쪽으로 나온다. 한쪽 끝은 컨테이너 네임스페이스(`eth0`), 다른 끝은 호스트(브리지에 연결)에 둔다. `@if` 뒤 숫자가 반대쪽 인덱스다 (4, 8장) |
| **리눅스 브리지 / FDB** | 컨테이너 간 L2 스위칭을 하는 가상 스위치 / 브리지가 학습한 MAC 주소 테이블(Forwarding Database) (4, 8장) |
| **라우팅 테이블 / 기본 게이트웨이** | 목적지별 경로. 같은 대역 밖으로 가는 컨테이너 패킷은 브리지 IP를 기본 게이트웨이로 삼아 호스트 커널의 IP 포워딩 경로로 올라간다 (4장) |
| **ARP / 이웃 테이블** | IPv4에서 IP에 대응하는 MAC을 찾는 방식 / `ip neigh`로 보는 이웃 목록. IPv6에서는 NDP가 ARP를 대신한다 (4, 12, 23장) |
| **IP 포워딩** | 호스트가 한 인터페이스로 들어온 패킷을 다른 인터페이스로 전달하는 설정(`net.ipv4.ip_forward`). 외부 통신용 NAT 실습에서 켠다 (4, 5장) |

### netfilter·NAT·conntrack

| 용어 | 설명 |
|---|---|
| **iptables** | 체인(PREROUTING, OUTPUT, POSTROUTING 등)과 테이블(`nat` 등)에 규칙을 두는 패킷 필터. 규칙을 선형으로 순회한다 (5, 11장) |
| **nftables** | IPv4/IPv6/브리지를 단일 프레임워크로 통합하고 세트/맵 기반 매칭으로 대량의 동적 규칙을 효율적으로 처리하는 차세대 프레임워크 (5, 11, 17장) |
| **iptables-nft / iptables-legacy** | `iptables` 명령을 nftables 위에 얹은 호환 레이어 / 전통 구현. `update-alternatives`로 선택한다 (11장) |
| **DNAT** | 목적지 주소를 바꿔치기하는 NAT. 포트 게시(`-p`)와 Service의 ClusterIP→Pod IP 변환이 모두 DNAT다 (5, 8, 17장) |
| **MASQUERADE (SNAT)** | 브리지 대역에서 나가는 패킷의 출발지 IP를 호스트의 외부 인터페이스 IP로 치환하는 아웃바운드 NAT (5, 8장) |
| **hairpin NAT** | 컨테이너/Pod가 자기 자신이 속한 게시 포트·Service를 호출할 때 SNAT(마스커레이드 표시)를 해 응답이 돌아오게 하는 처리 (8, 17장) |
| **conntrack** | 커널의 연결 추적 테이블. DNAT된 연결을 기록해 응답 패킷을 역변환한다. 가득 차면 새 연결이 거부되며 `nf_conntrack_max`·`nf_conntrack_count`로 본다 (5, 23장) |
| **IPVS** | IP Virtual Server. 커널의 해시 기반 L4 로드밸런서. `rr`/`lc`/`dh`/`sh`/`wrr` 등 스케줄러를 고를 수 있으나 SNAT 등은 iptables+ipset에 의존한다 (17장) |

### 오버레이와 가상 L2/L3

| 용어 | 설명 |
|---|---|
| **오버레이 네트워크** | L3 연결 위에 가상 L2를 얹어 여러 호스트의 컨테이너를 잇는 방식. 패킷을 노드 간 패킷에 캡슐화한다 (6, 10, 15장) |
| **VXLAN / VNI** | 원본 이더넷 프레임을 UDP(목적지 포트 4789, RFC 7348)로 캡슐화하는 터널 / 논리 L2 네트워크를 구분하는 24비트 식별자. 오버헤드 50바이트 (6장) |
| **IPIP / Geneve / WireGuard** | 오버헤드 20바이트의 IP-in-IP / 가변 길이로 확장 가능한 메타데이터를 가진 캡슐화 / 약 60바이트이며 암호화 포함 (6, 15장) |
| **macvlan** | 컨테이너마다 고유 MAC을 부여해 물리망에서 독립 장비처럼 보이게 한다. bridge/vepa/private/passthru 모드, 부모는 `eth0.20` 같은 802.1Q VLAN 서브인터페이스도 가능 (10장) |
| **ipvlan** | 부모 인터페이스의 MAC을 공유하고 IP 기준으로 분배. L2 모드(같은 브로드캐스트 도메인)와 L3 모드(브로드캐스트를 버리는 대신 서브넷 간 통신)가 있다 (10장) |
| **promiscuous mode / 포트당 다중 MAC 학습** | macvlan이 물리 NIC·스위치에 요구하는 두 조건. 퍼블릭 클라우드 가상 NIC에서는 충족되지 않아 별도 설정 없이는 동작하지 않는 경우가 많다 (10장) |

### 권한과 IPv6

| 용어 | 설명 |
|---|---|
| **사용자 네임스페이스(user ns)** | 컨테이너 안에서는 root로 보이지만 호스트에서는 비특권 UID로 매핑한다. Rootless Docker의 기반 (12장) |
| **NDP / ULA / SLAAC †** | IPv6에서 ARP 대신 이웃 탐색과 라우터 발견을 맡는 ICMPv6 기반 프로토콜 / 컨테이너 내부망에 흔히 쓰는 주소(`fd00::/8`) / 자동 주소 구성(macvlan·ipvlan에서 IPAM과 이중 할당 충돌에 주의) (12장) |
| **NAT66 / dual-stack** | 공인 프리픽스를 그대로 노출하지 않고 IPv6를 NAT로 감싸는 방식(종단 간 연결성과 방화벽 통제 용이성의 트레이드오프) / IPv4와 IPv6 주소를 동시에 받는 구성. Docker에서는 opt-in이다 (12장) |

## Docker 네트워크

### 모델과 드라이버

| 용어 | 설명 |
|---|---|
| **libnetwork** | Docker의 네트워킹 로직을 dockerd 코어에서 분리한 Go 라이브러리. 별도 프로세스가 아니라 dockerd에 링크되어 동작한다 (7장) |
| **CNM** | Container Network Model. Sandbox(컨테이너의 네트워크 스택=net ns), Endpoint(Sandbox를 Network에 잇는 가상 인터페이스, 브리지에서는 veth의 컨테이너 쪽), Network(같은 논리 네트워크의 Endpoint 그룹) 세 객체로 추상화한다 (7장) |
| **IPAM 드라이버(Docker)** | 서브넷·게이트웨이·IP 할당 범위를 관리하는 축. `--subnet`, `--gateway`, `--ip-range`로 제어하고 커스텀 드라이버로 교체할 수 있다 (7장) |
| **네트워크 드라이버** | bridge, overlay, macvlan, ipvlan, host, none. 모두 CNM의 Network 개념을 다른 방식으로 구현한 내장 드라이버이고 서드파티도 같은 플러그인 인터페이스로 추가된다 (7, 10장) |
| **CNM vs CNI** | CNM은 Network/Endpoint/Sandbox의 생명주기를 상세히 규정하는 Docker 고유 모델, CNI는 네임스페이스에 인터페이스를 붙이고 떼는 훨씬 단순한 훅 인터페이스(Kubernetes가 채택) (7, 14장) |
| **host 모드 / none 모드** | 네트워크 네임스페이스를 분리하지 않아 NAT가 사라지고 포트가 공유되는 모드 / 루프백만 남기고 완전히 격리하는 모드 (10장) |
| **`--net=container:X`** | 다른 컨테이너 X의 네트워크 네임스페이스를 공유한다. 사이드카 패턴의 기반 (3, 10장) |

### 브리지와 포트 게시

| 용어 | 설명 |
|---|---|
| **docker0 / 사용자 정의 브리지** | 기본 브리지는 컨테이너 간 자동 DNS 해석이 없다. `docker network create`로 만든 사용자 정의 브리지는 이름으로 서로 찾을 수 있어 실무에서 권장된다 (8, 9장) |
| **포트 게시(`-p`)** | iptables `DOCKER` 체인의 DNAT 규칙(PREROUTING → DOCKER)과 `docker-proxy` 사용자 공간 프로세스가 함께 작동한 결과 (8장) |
| **docker-proxy / userland-proxy** | hairpin NAT 등을 보완하는 사용자 공간 프로세스. `--userland-proxy=false`로 끄면 커널 NAT 경로만 남는다 (8장) |
| **게시되지 않은 포트 기본 차단** | Docker Engine 28.0.0부터 게시하지 않은 포트로의 인바운드가 기본 차단된다(Linux 전용). `gateway_mode_ipv4/ipv6=nat-unprotected`로 이전 동작을 복원한다 (8, 11장) |

### DNS와 서비스 디스커버리

| 용어 | 설명 |
|---|---|
| **내장 DNS (127.0.0.11)** | 사용자 정의 브리지/오버레이의 컨테이너가 `/etc/resolv.conf`에 갖는 dockerd 관리 리졸버. 컨테이너 이름·별칭을 조회하고 실패하면 호스트의 업스트림 DNS로 포워딩한다. 이름 해석 범위는 네트워크 단위다 (9장) |
| **`--link`** | 내장 DNS가 없던 기본 브리지에서 이름 해석을 대신하던 정적 방식. 사용자 정의 브리지가 대체했다 (9장) |
| **`--dns` / `--dns-search` / `--dns-option` / `--add-host`** | `/etc/resolv.conf`와 `/etc/hosts`에 생성 시점에 정적으로 반영되는 옵션. 실행 중 갱신은 보통 컨테이너 재생성이 필요하다 (9장) |
| **VIP 모드 / DNSRR 모드** | Swarm 서비스 디스커버리의 기본값(고정 가상 IP + IPVS 로드밸런싱) / 조회마다 모든 태스크 IP를 반환(라우팅 메시와 함께 쓸 수 없음) (9장) |

### Swarm 오버레이와 방화벽

| 용어 | 설명 |
|---|---|
| **Swarm 오버레이** | 컨트롤 플레인(gossip/Serf·memberlist 계열로 멤버십·상태 동기화)과 데이터 플레인(VXLAN 캡슐화)이 분리된 구조. `docker network create -d overlay --attachable`로 일반 컨테이너도 연결할 수 있다 (10장) |
| **ingress 네트워크 / 라우팅 메시** | 게시된 포트를 모든 노드에서 리스닝하게 하고 IPVS 로드밸런싱으로 실제 태스크가 있는 노드로 전달하는 특수 오버레이. SNAT 때문에 원본 클라이언트 IP 보존이 어렵다 (8, 10장) |
| **Swarm 모드의 현재 위상** | 2026년 현재 deprecated가 아니며 Mirantis가 엔터프라이즈 지원을 2030년까지 약속했다. 단 Engine 29의 실험적 nftables 백엔드는 Swarm 모드에서 활성화할 수 없다 (10, 11장) |
| **`--firewall-backend=nftables`** | Docker Engine 29.0.0의 실험적 네이티브 nftables 백엔드. `ip docker-bridges`, `ip6 docker-bridges` 등 Docker 전용 테이블로 규칙을 분리하고 기존 `DOCKER-USER` 방식은 다른 방식으로 대체된다 (11장) |

### Rootless

| 용어 | 설명 |
|---|---|
| **Rootless Docker** | dockerd를 포함한 전체 스택을 root 없이 실행해 컨테이너 탈출 시에도 최종 권한을 일반 사용자 수준으로 제한한다 (12장) |
| **RootlessKit / TAP** | 비루트가 veth·브리지를 직접 조작할 수 없어, TAP 디바이스로 패킷을 유저스페이스 프로세스에 우회시키는 구조 (12장) |
| **slirp4netns / pasta / gvisor-tap-vsock** | Rootless 네트워크 백엔드. slirp4netns(오래된 C, 오랜 기본값) → pasta(Docker 25.0+ 실험적 대안) → gvisor-tap-vsock(순수 Go, 2026년 현재 Docker v29.5부터 기본값) (12장) |

## 쿠버네티스 네트워크

### 모델·CNI·IPAM

| 용어 | 설명 |
|---|---|
| **IP-per-Pod** | 모든 Pod가 고유 IP를 갖고 NAT 없이 서로(그리고 노드와) 통신하며, Pod가 보는 자기 IP와 남이 보는 IP가 같다는 모델. `hostNetwork` 예외가 있다. 포트 충돌·동적 포트 탐색 부담을 개발자에게 넘기지 않기 위한 설계다 (13장) |
| **노드 / Pod / Service CIDR** | 세 종류의 IP 대역. 예시로 `192.168.1.0/24`(실재), `10.244.0.0/16`(CNI가 라우팅), `10.96.0.0/12`(가상) (13, 23장) |
| **CNI** | Container Network Interface. 쿠버네티스 전용이 아닌 독립 스펙으로, `ADD`/`DEL`/`CHECK`/`VERSION` 동작을 실행 파일 호출(환경변수 + stdin JSON)로 정의한다. 호출 주체는 kubelet이 아니라 컨테이너 런타임이다 (14장) |
| **`/etc/cni/net.d/*.conflist`** | CNI 설정 파일. 사전순으로 하나만 채택되고 `plugins` 배열이 주 플러그인 + IPAM + 메타 플러그인(portmap, bandwidth)의 체인을 이룬다 (14장) |
| **IPAM(CNI) / node-ipam-controller / host-local** | Pod IP 할당 담당 서브 플러그인. 클러스터 전역 층(node-ipam-controller가 `Node.spec.podCIDR` 배분)과 노드 로컬 층(host-local이 개별 Pod IP 할당)으로 나뉜다 (14장) |
| **오버레이 / 네이티브 라우팅 / 네이티브 IP** | 노드 간 Pod 통신의 세 방식. 캡슐화(범용적, MTU·CPU 비용) / BGP나 클라우드 라우트로 경로 광고(오버헤드 없음) / VPC IP를 Pod에 직접 할당(IP 고갈 위험) (15장) |
| **BGP / 클라우드 라우트 테이블** | Calico가 라우터와 피어링해 Pod CIDR 경로를 광고 / GKE·EKS가 VPC 라우트 테이블에 항목을 추가(AWS 기본 50개 제한) (15장) |
| **VPC CNI / ENI / prefix delegation** | Pod IP를 VPC 서브넷의 ENI 보조 IP로 받는 AWS 방식. 노드당 Pod 수는 ENI 수 × ENI당 IP 수 − 1 형태로 묶이며, prefix delegation이 완화한다 (15장) |
| **Calico / Cilium / Antrea / Flannel** | 데이터 플레인이 각각 iptables·eBPF / eBPF / OVS / iptables인 CNI. NetworkPolicy는 앞 셋이 시행하고 Flannel과 kind 기본 CNI(kindnet)는 시행하지 않는다 (15, 21장) |

### Service와 kube-proxy

| 용어 | 설명 |
|---|---|
| **Service** | 변하는 Pod 집합 앞에 고정된 가상 IP(ClusterIP)와 DNS 이름을 제공하는 오브젝트. ClusterIP는 어떤 인터페이스에도 붙어 있지 않아 ping에 응답하지 않는다 (16장) |
| **ClusterIP / NodePort / LoadBalancer / ExternalName** | LoadBalancer ⊃ NodePort ⊃ ClusterIP로 포함되는 타입(NodePort 범위 30000&#126;32767). ExternalName은 프록시 없이 DNS CNAME만 만든다 (16장) |
| **EndpointSlice** | Service 뒤 Pod IP 목록. 구 Endpoints가 통째로 재전송되던 문제를 약 100개 단위 샤딩으로 해결했다. `conditions.ready`가 `true`인 엔드포인트에만 트래픽이 가고, `terminating` 전이로 우아한 드레이닝을 한다 (16장) |
| **헤드리스 서비스** | `clusterIP: None`. 가상 IP 없이 DNS가 Pod IP 목록을 직접 반환한다 (16장) |
| **externalTrafficPolicy / internalTrafficPolicy** | `Cluster`(기본: 균등 분산, SNAT로 클라이언트 IP 소실, 홉 하나 추가) / `Local`(홉 감소·클라이언트 IP 보존, 부하는 불균등) (16장) |
| **sessionAffinity: ClientIP** | 데이터플레인이 소스 IP 기준으로 백엔드를 고정한다 (16장) |
| **kube-proxy** | Service/EndpointSlice를 watch해 노드 커널의 데이터플레인 규칙으로 번역하는 데몬. 패킷 처리는 커널이 하므로 죽어도 기존 연결은 유지된다 (17장) |
| **KUBE-SERVICES → KUBE-SVC-\* → KUBE-SEP-\*** | iptables 모드의 체인 구조. SVC가 `statistic --mode random`으로 i번째 엔드포인트에 `1/(N-i+1)` 확률을 주고 SEP가 최종 DNAT를 한다 (17장) |
| **KUBE-MARK-MASQ / 0x4000** | SNAT 표시와 그 마크. 마크가 붙은 패킷만 마스커레이드된다 (17장) |
| **kube-ipvs0** | IPVS 모드에서 모든 ClusterIP를 바인딩하는 더미 인터페이스 (17장) |
| **nftables 모드 / KEP-5495** | 집합·맵 자료구조로 룰셋을 표현해 증분 갱신이 가능한 GA 모드 / IPVS 모드의 공식 폐기 경로(v1.35 경고 → v1.37 기능 게이트 → v1.40 기본 비활성 → v1.43 제거) (17장) |

### DNS·진입점·메시·정책

| 용어 | 설명 |
|---|---|
| **CoreDNS / Corefile** | 플러그인 체인 기반 클러스터 DNS. `kubernetes`가 내부 이름, `forward`가 외부 이름을 처리하고 `cache`/`loop`/`reload`가 보조한다. 자체가 Deployment + ClusterIP Service(`kube-dns`)다 (18장) |
| **FQDN 규칙 / search / ndots** | `<service>.<namespace>.svc.<cluster-domain>` / `/etc/resolv.conf`의 확장 목록 / search 도메인을 먼저 시도할 점 개수 기준. 기본 `ndots:5`는 외부 도메인에도 불필요한 쿼리를 유발한다 (18장) |
| **NodeLocal DNSCache** | 노드마다 두는 DNS 캐시 에이전트. 중앙 CoreDNS 부하와 UDP conntrack 경쟁 조건(대량 쿼리 시 간헐 `SERVFAIL`·정확히 5초 지연)을 완화한다 (18, 23장) |
| **Ingress / IngressController / IngressClass** | L7 라우팅 규칙을 담은 데이터 / 그 리소스를 watch해 실제로 프록시하는 프로그램(대부분 kube-proxy를 우회해 Pod IP로 직접 프록시) / `ingressClassName` 불일치와 컨트롤러 미설치는 ADDRESS가 비는 원인 (19, 23장) |
| **TLS 종료 / cert-manager** | HTTPS를 진입점에서 풀어 내부로 평문 전달 / 인증서 발급·갱신 자동화 도구 (19장) |
| **Gateway API** | `GatewayClass`(인프라 제공자) → `Gateway`(클러스터 운영자) → `HTTPRoute`/`GRPCRoute`/`TCPRoute`(앱 팀)로 역할을 분리한 차세대 라우팅 API (19장) |
| **서비스 메시 / 사이드카 / mTLS** | 동서 트래픽을 다루는 인프라 계층. 사이드카(보통 Envoy)를 뮤테이팅 어드미션 웹훅으로 주입하고 iptables 리다이렉트로 모든 트래픽을 거치게 한다. mTLS·재시도·서킷 브레이커·트래픽 분할을 코드 수정 없이 얻는다 (20장) |
| **앰비언트 메시 / ztunnel / waypoint** | 사이드카 대신 노드 공유 프록시(ztunnel, L4/mTLS)와 선택적 네임스페이스 프록시(waypoint, L7)로 구현하는 메시 (20장) |
| **남북 / 동서 트래픽** | 클러스터 외부↔내부 / 서비스↔서비스 트래픽 (19, 20장) |
| **NetworkPolicy** | 정책이 없으면 전허용, 하나라도 선택되면 그 방향은 기본 거부. 여러 정책은 합집합(OR)이며 명시적 Deny가 없다. 스펙일 뿐 시행은 CNI의 몫(kube-proxy는 시행하지 않음) (21장) |
| **`from`/`to` 항목의 AND/OR** | 리스트의 별도 항목은 OR, 한 항목 안의 여러 필드는 AND. 하이픈 위치가 의미를 바꾼다 (21장) |
| **AdminNetworkPolicy / BaselineAdminNetworkPolicy** | 네임스페이스 정책보다 우선하는 절대 규칙(Deny/Allow, `Pass`로 위임) / 아무도 정하지 않았을 때의 기본값. 둘 다 v1alpha1이다 (21장) |

### eBPF와 Cilium

| 용어 | 설명 |
|---|---|
| **eBPF** | 커널 모듈 없이 검증(verifier)·샌드박스·JIT를 거친 프로그램을 커널 훅에서 실행하는 기술. Cilium의 기반 (22장) |
| **XDP / TC 훅 / sk_buff** | NIC 드라이버 직후 가장 이른 훅(DROP 비용 최소) / sk_buff가 있어 컨텍스트가 풍부한 훅(Cilium 로직 대부분) / 패킷을 표현하는 커널 자료구조 (22장) |
| **BPF 맵 / cilium-agent** | 유저스페이스와 커널이 상태를 주고받는 키-값 자료구조(해시 룩업) / 각 노드에서 API 서버를 watch해 BPF 프로그램을 적재하고 맵을 갱신하는 DaemonSet. 에이전트가 죽어도 적재된 프로그램과 맵은 계속 동작한다 (22장) |
| **소켓 레벨 로드밸런싱** | `connect()`/`sendmsg()` 시점에 BPF가 목적지를 실제 Pod IP로 써 넣어 패킷 DNAT와 conntrack 항목이 필요 없게 하는 방식 (22장) |
| **kube-proxy replacement** | Cilium을 `kubeProxyReplacement=true`로 설치해 kube-proxy를 제거하고 Service 라우팅을 eBPF가 맡는 모드. 확인은 `cilium status \| grep KubeProxyReplacement` (22장) |
| **CiliumNetworkPolicy / tail call** | 같은 TC 훅 BPF 프로그램·맵으로 시행되는 L3/L4/L7 정책(L7만 Envoy에 위임) / verifier의 복잡도 예산 때문에 프로그램을 쪼개 연결하는 방식 (21, 22장) |
| **Hubble** | eBPF 데이터플레인이 관측한 흐름(출발지/목적지, 포트, 정책 판정)을 패킷 캡처 없이 보여 주는 Cilium의 관측 도구 (22, 23장) |

### 진단

| 용어 | 설명 |
|---|---|
| **진단 플로차트** | DNS → 노드 간 연결 → Service → NetworkPolicy → 노드 자원 순으로 상위 계층부터 배제하는 절차 (23장) |
| **세 점 호출** | 같은 대상을 Pod IP, ClusterIP, DNS 이름으로 차례로 호출해 CNI·kube-proxy·DNS 영역을 가르는 기법 (23장) |
| **nicolaka/netshoot** | 진단용 Pod·디버그 컨테이너로 쓰는 네트워크 도구 이미지 (23장) |
| **`kubectl debug`** | 대상 Pod에 임시 디버그 컨테이너를 붙여 같은 네트워크 네임스페이스에서 `tcpdump` 등을 실행한다 (23장) |
| **Sonobuoy** | 클러스터가 CNCF 표준 적합성 테스트를 만족하는지 검증하는 도구. 새 클러스터 구축·CNI 교체 후 실행하면 좋다 (23장) |

> **[보충]** 두 가지 원천 충돌을 반영했다. (1) IPVS: textbook은 대규모 환경의 대책으로 IPVS를 소개하지만 Kubernetes_Internals_Network_Guide는 KEP-5495에 따른 폐기 경로를 설명한다. 더 상세한 후자를 따랐다. (2) Cilium과 conntrack: textbook은 "자체 연결 추적이라 자유롭다"고 쓰고 Internals Guide는 "일반 Pod 간·외부 연결은 여전히 conntrack을 거친다"고 쓴다. 후자를 따랐다.

*원문 근거: linux/06-네트워크.md (6.1~6.3, 6.7, 6.10); docker-fundamental/02_격리의_기초.md, 11~18장 각 장의 핵심 요약과 본문; Kubernetes_Internals_Network_Guide/03-네트워크/13~19장 요약, 부록/B-용어집.md (네트워크 절); kubernetes-textbook-main/05-내부-동작-파헤치기/19·23장, 03-애플리케이션-노출과-데이터/09·10·11장; kubernetes-qustion-book/02_심화/16_EKS의_네트워크_스토리지_확장.md (VPC CNI); †표시 항목은 [보충]*
