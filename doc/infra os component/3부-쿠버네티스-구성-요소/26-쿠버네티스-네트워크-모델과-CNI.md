---
title: "26장. 쿠버네티스 네트워크 모델과 CNI"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 26
---

# 26장. 쿠버네티스 네트워크 모델과 CNI

> **🎮 게임 서버 개발자에게** — 게임 서버를 여러 대 띄울 때 가장 골치 아픈 것 중 하나가 포트다. 호스트 한 대에 인스턴스를 여러 개 올리면 `7777`, `7778`, `7779`로 포트를 나눠 쓰고, 클라이언트에게는 "호스트IP:포트" 쌍을 알려 줘야 한다. 쿠버네티스는 이 문제를 **Pod마다 자기만의 IP를 주어 모든 서버가 같은 포트(예: 7777)를 그대로 쓰게 하는 모델**로 풀었다. 그 약속("모든 Pod가 NAT 없이 서로 통신")을 실제 veth·라우팅·캡슐화로 만드는 일은 쿠버네티스가 아니라 **CNI 플러그인**의 몫이다. UDP로 패킷 크기와 MTU 단편화 문제를 겪어 봤다면 오버레이 네트워크의 함정도 이해가 빠르다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 같은 노드의 Pod끼리는 잘 통신하는데 다른 노드의 Pod와는 안 된다.
> - `ping`과 작은 요청은 되는데 큰 응답이나 TLS 핸드셰이크만 실패한다(오버레이의 MTU 문제일 수 있다).
> - Pod가 `ContainerCreating`에서 멈추고 containerd 로그에 CNI 에러가 보인다. 노드를 늘리려는데 Pod CIDR이 모자란다.

## 코어 — 이것만은 100%

> **한 문장:** 쿠버네티스는 "모든 Pod가 고유 IP로 NAT 없이 통신한다"는 네 가지 요구사항만 정의하고, 이를 만드는 일은 런타임이 실행 파일로 호출하는 CNI 플러그인(주 플러그인 + IPAM + 메타 플러그인 체인)이 맡으며, 노드 간 전달은 오버레이·네이티브 라우팅·클라우드 IP 중 하나로 구현된다.

1. **IP-per-Pod 4대 요구사항** — Pod 간 무NAT, 노드-Pod 간 무NAT, 자기가 보는 IP = 남이 보는 IP, `hostNetwork` 예외. 포트 충돌 문제를 앱에 떠넘기지 않는 설계다.
2. **CNI = 실행 파일 호출 계약** — `ADD`/`DEL`/`CHECK`/`VERSION`을 환경변수 + stdin JSON으로 호출한다. 호출 주체는 kubelet이 아니라 런타임(libcni)이고, `/etc/cni/net.d/`의 설정은 사전순 하나만 채택된다.
3. **IPAM 2층** — node-ipam-controller가 노드에 `Node.spec.podCIDR`을 배분하고(클러스터 층), CNI IPAM 플러그인(`host-local` 등)이 그 안에서 Pod IP를 배분한다(노드 층).
4. **노드 간 전달 방식과 MTU** — 오버레이(캡슐화, 범용적이나 MTU 손실), 네이티브 라우팅(BGP 등, 오버헤드 없음), 클라우드 네이티브 IP(IP 고갈 위험). 오버레이는 MTU를 낮춰야 한다.
5. **진단은 계층 순서로** — 같은 Pod → 같은 노드 → 다른 노드 → Service → DNS → NetworkPolicy로 좁힌다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 한 호스트에 서버 여러 개 → 포트를 `7777/7778/7779`로 나눠 클라이언트에 안내 | IP-per-Pod | 인스턴스마다 독립된 주소로 접근한다는 목표가 같다 | 포트를 나누는 대신 **IP를 나눈다**. 모든 Pod가 같은 포트(7777)를 그대로 쓴다. 단 Pod IP는 일회용이다 |
| 사설 IP 뒤 서버에 포트 포워딩(DNAT)으로 접근 | Docker 기본 모델(`-p 8080:80`)과 쿠버네티스 모델의 차이 | NAT가 있으면 포트가 노드 전역 자원이 된다 | 쿠버네티스는 Pod 간에 NAT 자체를 요구하지 않는다(단, Service·외부 접근은 별도로 NAT/DNAT가 쓰인다) |
| 서버 프로세스를 `fork` + `exec`하고 환경변수·표준입력으로 설정을 넘김 (CGI 방식) | CNI 플러그인 호출 | 실행 파일 + 환경변수 + stdin/stdout JSON이 전부인 단순 계약 | gRPC/REST가 아니라서 어떤 언어로 짜도 되고, 호출자(런타임)가 결과 JSON을 해석해 pause 컨테이너의 네트워크로 확정한다 |
| UDP 패킷이 MTU를 넘으면 단편화/드롭 → 게임에서 패킷 크기를 MTU 이하로 제한 | 오버레이의 MTU 감소(VXLAN 50바이트) | MTU를 넘으면 단편화 또는 드롭이 생긴다 | Pod 인터페이스 MTU를 캡슐화 오버헤드만큼 **직접 낮춰야** 한다. 증상이 교묘해 ping과 작은 요청은 통과한다 |
| 서버 대수 증가에 따른 IP 대역 설계 | 클러스터 CIDR과 `--node-cidr-mask-size` | 대역을 작게 잡으면 나중에 확장이 어렵다 | `/16`을 `/24`로 쪼개면 최대 노드 수가 2^(24-16)=256으로 고정된다. 운영 중에 넓히기는 매우 번거롭다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 쿠버네티스는 Pod 네트워크를 직접 구현할까, 요구사항만 정의할까?
> 2. 노드 A의 Pod가 노드 B의 Pod로 패킷을 보낼 때, 물리 스위치는 Pod IP 대역(`10.244.0.0/16`)을 알고 있을까?
> 3. 새 Pod의 IP는 누가, 어느 단계에서 정할까? API 서버까지 왕복할까?
> 4. VXLAN 오버레이에서 Pod MTU를 1500으로 두면 어떤 증상이 나올까?
>
> **처리법:** 🛠 실습 `kubectl get nodes -o jsonpath='{.spec.podCIDR}'`, `ls /etc/cni/net.d/`, `ip route | grep 10.244`, `ping -M do -s` → 바로 실행 · 🗺 관계도 kubelet → CRI → 런타임 → CNI 플러그인, 오버레이 캡슐화 구조, 계층별 진단 플로차트 · 📦 카드로 MTU 표(VXLAN 50, IPIP 20, WireGuard 60), 포트(VXLAN UDP 4789 또는 8472), 최대 노드 수 공식

### 이 장에서 배우는 것

- 쿠버네티스 네트워크 모델의 4대 요구사항과 그 설계 근거
- CNI 스펙(ADD/DEL/CHECK/VERSION), 호출 체인, 설정 파일과 플러그인 체인
- IPAM의 두 층과 `Node.spec.podCIDR`, 클러스터 CIDR 설계
- 오버레이 vs 네이티브 라우팅 vs 클라우드 IP, 주요 CNI 비교, MTU·IP 고갈·conntrack, 계층별 진단

---

## 코어 1. IP-per-Pod 4대 요구사항

### 1.1 네 가지 규칙

**한 줄 요약:** 모든 Pod는 클러스터에서 유일한 IP를 갖고, Pod·노드 어디서든 NAT 없이 서로 닿는다.

1. 모든 Pod는 NAT 없이 다른 모든 Pod와 통신할 수 있다(노드가 같든 다르든).
2. 모든 노드는 NAT 없이 모든 Pod와 통신할 수 있다(kubelet 헬스체크, 노드 에이전트가 Pod IP로 직접 접근).
3. Pod가 스스로 인식하는 자신의 IP는 다른 Pod가 보는 IP와 동일하다.
4. `hostNetwork: true`인 Pod는 예외다. 별도 네트워크 네임스페이스 없이 노드의 것을 공유하므로 Pod IP가 곧 노드 IP이고 포트도 노드와 공유한다.

이 모델을 "IP-per-Pod"라 부른다. 각 Pod가 독립된 호스트처럼 자기 IP와 포트 공간을 갖는다.

### 1.2 왜 이 모델인가

**한 줄 요약:** 포트 매핑 NAT의 복잡도를 애플리케이션 개발자에게 떠넘기지 않기 위해서다.

초기 Docker 단일 호스트 모델의 기본값은 `docker0` 브리지의 사설 주소(`172.17.0.0/16`)와 `-p 8080:80` 같은 **포트 매핑 NAT**였다. 단일 호스트를 벗어나면 문제가 증폭된다. 포트가 노드 단위 전역 자원이 되고, 앱이 자기가 몇 번 포트로 노출됐는지 알아야 하고, 서비스 디스커버리가 "호스트IP:포트" 쌍을 추적해야 하고, 스케줄러가 포트 충돌까지 고려해야 한다. IP-per-Pod에서는 nginx 세 개가 모두 `:80`을 쓸 수 있다.

대가는 **클러스터 규모의 평평한 라우팅 가능 네트워크를 누군가 만들어야 한다**는 것이다. 쿠버네티스가 직접 구현하지 않은 이유는 베어메탈·클라우드 VPC·온프레미스 SDN마다 최선의 구현이 다르기 때문이며, "무엇을 만족해야 하는가"만 정의하고 "어떻게"는 플러그인 계약(CNI)으로 위임했다. [22장](22-컨트롤러-매니저.md)의 컨트롤러 패턴에서 조정 대상과 구현을 분리한 것과 같은 철학이다. Pod 안에서 컨테이너끼리는 NET 네임스페이스를 공유한다는 점은 [24장](24-오브젝트-모델과-워크로드.md)과 [9장](../2부-컨테이너-커널-기능과-Docker/09-네임스페이스.md)에 있다.

---

## 코어 2. CNI = 실행 파일 호출 계약

### 2.1 네 가지 동작

**한 줄 요약:** CNI는 gRPC가 아니라 "실행 파일을 특정 방식으로 호출하면 특정 방식으로 응답한다"는 계약이다.

CNI(cni.dev)는 쿠버네티스 전용이 아닌 독립 스펙이다.

| 동작 | 트리거 | 하는 일 | 반환 |
|---|---|---|---|
| `ADD` | Pod(샌드박스) 생성 시 | 인터페이스 생성, IP 할당, 라우팅·DNS 설정 | 할당된 IP·인터페이스·라우팅 정보(JSON) |
| `DEL` | Pod 삭제 시 | 인터페이스 제거, IP 반환, 방화벽 규칙 정리 | 성공/실패 |
| `CHECK` | 주기적 상태 확인 | 현재 설정이 `ADD` 결과와 일치하는지 검증 | 성공/실패 |
| `VERSION` | 런타임이 플러그인을 처음 인식할 때 | 지원하는 CNI 스펙 버전 목록 보고 | 버전 목록(JSON) |

호출 형태는 이렇다(환경변수 + stdin JSON).

```bash
CNI_COMMAND=ADD \
CNI_CONTAINERID=8f3a9c1e2b7d \
CNI_NETNS=/var/run/netns/cni-4e5f6a7b \
CNI_IFNAME=eth0 \
CNI_PATH=/opt/cni/bin \
CNI_ARGS="IgnoreUnknown=1;K8S_POD_NAMESPACE=default;K8S_POD_NAME=web-abc12" \
/opt/cni/bin/bridge < /etc/cni/net.d/10-bridge.conflist
```

반환값은 `ips`(예: `10.244.1.5/24`, gateway `10.244.1.1`), `routes`, `interfaces`를 담은 JSON이다. [17장](../2부-컨테이너-커널-기능과-Docker/17-컨테이너를-손으로-만들기.md)에서 `ip netns`와 veth로 손으로 하던 작업이 정확히 이것이다. 설정 JSON의 `cniVersion`을 플러그인이 지원하지 않으면 `ADD` 자체가 실패하므로, CNI 업그레이드 후 `ContainerCreating`에 멈추면 버전 불일치도 의심한다.

### 2.2 누가 호출하는가

**한 줄 요약:** kubelet은 CRI로 `RunPodSandbox`를 요청할 뿐이고 CNI를 실제로 호출하는 것은 런타임의 libcni다.

```
kubelet ─ CRI: RunPodSandbox → 런타임(containerd/CRI-O)
        → 네트워크 네임스페이스 생성 → libcni로 설정 로드
        → /opt/cni/bin/<plugin> 실행 (환경변수 + stdin JSON)
        → 플러그인이 netns 안에 인터페이스 생성 → stdout JSON 반환
        → 런타임이 결과를 pause 컨테이너의 네트워크로 확정
```

그래서 CNI 실패는 kubelet이 아니라 **containerd/CRI-O 로그**에 먼저 나타난다(`journalctl -u containerd | grep -i cni`). [23장](23-kubelet과-CRI.md)의 `syncPod` ⑥단계다.

### 2.3 설정 파일 선택과 플러그인 체인

**한 줄 요약:** `/etc/cni/net.d/`에서 파일명 사전순 하나만 채택하고, `.conflist`의 `plugins` 배열이 순서대로 호출된다.

런타임은 `/etc/cni/net.d/`의 `.conf`/`.conflist`/`.json`을 스캔해 **사전순으로 가장 앞선 하나만** 사용한다. `10-kindnet.conflist`와 `99-multus.conf`가 같이 있으면 `10-`이 이긴다. CNI를 교체할 때 "분명히 apply했는데 예전 CNI가 계속 동작한다"는 증상의 원인이다.

```json
{ "cniVersion": "1.0.0", "name": "k8s-pod-network",
  "plugins": [
    { "type": "ptp", "ipMasq": false, "mtu": 1450,
      "ipam": { "type": "host-local", "dataDir": "/run/cni-ipam-state",
                "routes": [{ "dst": "0.0.0.0/0" }],
                "ranges": [[{ "subnet": "10.244.1.0/24" }]] } },
    { "type": "portmap", "capabilities": { "portMappings": true } },
    { "type": "bandwidth", "capabilities": { "bandwidth": true } }
  ] }
```

```
① 주 플러그인 (ptp / bridge / calico / cilium-cni): 인터페이스 생성, IPAM 위임, 라우팅
    ↓ prevResult 전달
② portmap (메타): hostPort → containerPort를 iptables DNAT로
③ bandwidth (메타): tc로 인그레스/이그레스 대역폭 제한
④ firewall / tuning / sbr / vrf (필요 시)
```

메타 플러그인은 각자 한 가지 일만 한다(유닉스 철학). 대역폭 애노테이션(`kubernetes.io/ingress-bandwidth: "10M"`)은 CNI 자체 필드가 아니라 kubelet이 Pod 스펙에서 읽어 `runtimeConfig`로 변환해 전달한 값이다. 실행 파일은 `/opt/cni/bin/`에 있다.

---

## 코어 3. IPAM 2층: 노드에 서브넷, 노드 안에서 Pod IP

### 3.1 IPAM 플러그인

**한 줄 요약:** IP 할당은 인터페이스를 만드는 주 플러그인과 분리된 위임 가능한 플러그인이다.

| IPAM 플러그인 | 방식 | 상태 저장 위치 |
|---|---|---|
| `host-local` | 노드에 할당된 CIDR 안에서 로컬 파일로 순차 할당 | 노드 로컬 디스크(`dataDir`) |
| `dhcp` | 외부 DHCP 서버에 임대 요청(데몬 필요) | DHCP 서버 |
| `static` | 고정 IP를 설정에서 그대로 사용 | 없음 |
| Calico IPAM / Cilium IPAM | 클러스터 전역 상태(etcd 또는 CRD)에서 블록 단위 할당 | 클러스터 전역 저장소 |

`host-local`은 `subnet` 안에서 다음 IP를 순차 탐색해 할당하고 결과를 파일(`/run/cni-ipam-state/...`)로 남기며, 동시 `ADD`가 같은 IP를 받지 않도록 **파일 잠금(flock)** 을 건다. C++로 치면 노드 로컬 ID 할당기를 파일 락으로 보호하는 것이다.

### 3.2 Node.spec.podCIDR과 node-ipam-controller

**한 줄 요약:** `/16`을 `/24`로 잘라 노드에 나눠 주는 것은 컨트롤러, 그 안의 개별 IP는 노드의 CNI가 정한다.

```
kube-controller-manager의 node-ipam-controller (Informer/워크큐 패턴)
  └ watch: Node 생성 → 클러스터 CIDR(--cluster-cidr)에서
    --node-cidr-mask-size 크기로 잘라 새 Node에 할당
  └ Node.spec.podCIDR(듀얼스택이면 spec.podCIDRs)에 기록
```

```
① 클러스터 전역 층: node-ipam-controller가 노드에 서브넷 배분 (API 서버 경유, 노드 추가/제거 때만)
② 노드 로컬 층: CNI IPAM이 그 서브넷 안에서 Pod에 개별 IP 배분 (CNI ADD마다, 즉시)
```

빈번한 작업(Pod IP 할당)을 API 서버 왕복 없이 노드에서 끝내는 설계다. `host-local`은 노드별로 격리된 서브넷을 전제로 하지만, Calico/Cilium IPAM은 노드 간 블록 재배분(한 노드가 서브넷을 다 쓰면 블록 추가 임차)을 지원한다. 대신 상태를 클러스터 전역에서 조율해야 하는 복잡도가 생긴다.

### 3.3 CIDR 설계와 한계

**한 줄 요약:** 클러스터 CIDR과 마스크 크기는 클러스터 생성 시점에 정해야 하며, 최대 노드 수를 결정한다.

```
최대 노드 수 = 2^(노드 마스크 - 클러스터 마스크) = 2^(24-16) = 256개
노드당 최대 Pod 수 = /24 사용 가능 주소(254) 와 kubelet --max-pods(기본 110) 중 작은 값
```

운영 중인 클러스터에서 넓히려면 모든 노드의 라우팅·IPAM 상태 재조정이 필요해 매우 번거롭다. 노드가 256개를 넘으면 IP를 할당할 수 없다. AWS VPC CNI처럼 VPC 서브넷의 IP를 직접 쓰는 방식은 서브넷이 작으면 금방 소진되고, 노드당 Pod 수가 인스턴스 타입(ENI 수 × ENI당 IP)에 묶인다(원문 예: m5.large는 3×10-1=29). 접두사 위임(prefix delegation)으로 완화할 수 있다.

---

## 코어 4. 노드 간 전달 방식과 MTU

### 4.1 근본 문제와 세 가지 방식

**한 줄 요약:** 물리 네트워크는 Pod 대역을 모르므로, 캡슐화하거나 경로를 알려 주거나 VPC IP를 직접 쓴다.

노드 A의 Pod(`10.244.1.5`)가 노드 B의 Pod(`10.244.2.7`)로 보낼 때 물리 스위치·라우터는 `10.244.0.0/16`을 모르고 노드 IP(`192.168.1.0/24` 등)만 안다.

| 방식 | 원리 | 장점 | 단점 |
|---|---|---|---|
| **오버레이**(VXLAN, IPIP, Geneve, WireGuard) | Pod 패킷을 노드 간 패킷에 통째로 넣음 | 물리 네트워크 설정 불필요, 어디서나 동작 | 캡슐화 CPU 비용, **MTU 감소**, 물리 장비가 내부 패킷을 못 봐 진단 어려움 |
| **네이티브 라우팅**(BGP, 클라우드 라우트 테이블, 동일 L2) | 물리 네트워크에 "이 Pod CIDR은 이 노드로"라는 경로를 알림 | 캡슐화 오버헤드·MTU 손실 없음, 평범한 IP 패킷이라 진단 쉬움 | 물리 네트워크가 경로를 받아들여야 함, 클라우드는 라우트 항목 수 제한(원문: AWS 기본 50) |
| **네이티브 IP**(AWS VPC CNI, Azure CNI, GKE 별칭 IP) | Pod가 VPC의 실제 IP를 받음 | 오버레이·라우팅 설정 불필요, 보안 그룹·플로우 로그를 Pod에 적용 | **IP 고갈**, 노드당 Pod 수가 인스턴스 타입에 묶임 |

선택 가이드: 물리 네트워크를 제어할 수 있으면 네이티브 라우팅(BGP), 아니면 클라우드는 클라우드 CNI/라우트(IP 여유가 없으면 오버레이), 온프레미스는 오버레이(VXLAN)가 가장 범용적이다.

### 4.2 VXLAN 오버레이와 BGP 경로

**한 줄 요약:** 오버레이는 FDB를 보고 UDP로 감싸 보내고, BGP는 커널 라우팅 테이블에 `proto bird` 경로를 심는다.

```
VXLAN: Pod(10.244.1.5) → ping → Pod(10.244.2.7, 노드 B)
① Pod netns에서 패킷 생성 → ② veth로 노드 A 루트 netns
③ 라우팅: 10.244.2.0/24 → dev vxlan.calico(또는 flannel.1)
④ VXLAN 인터페이스가 FDB로 노드 B의 실제 IP를 찾아 외부 UDP 헤더(포트 4789 또는 8472)를 씌워 전송
⑤ 노드 B가 역캡슐화 → ⑥ 로컬 라우팅 → veth → Pod netns
```

```bash
ip -d link show | grep -A2 vxlan
bridge fdb show dev vxlan.calico        # 또는 flannel.1
ip route | grep 10.244                  # BGP: 10.244.2.0/24 via 192.168.1.11 dev eth0 proto bird
```

kind의 기본 CNI(kindnet)는 캡슐화 없이 각 노드에 다른 노드 Pod CIDR로 가는 정적 경로를 추가하므로 사실상 네이티브 라우팅의 축소판이다. `vxlan.*` 인터페이스가 없으면 캡슐화 없이 직접 라우팅 중이다. 양쪽 노드에서 `tcpdump -i any -nn "host <PodIP>"`를 동시에 뜨면 캡슐화 유무가 드러난다(오버레이면 `eth0`에서 UDP 4789/8472로 감싸진 패킷이 보인다).

### 4.3 MTU — 가장 악명 높은 문제

**한 줄 요약:** 캡슐화 오버헤드만큼 Pod MTU를 낮추지 않으면 큰 전송에서만 실패한다.

| 환경 | 물리 MTU | 오버헤드 | Pod MTU |
|---|---|---|---|
| 이더넷 + VXLAN | 1500 | 50 | **1450** |
| 이더넷 + IPIP | 1500 | 20 | **1480** |
| 이더넷 + WireGuard | 1500 | 60 | **1440** |
| AWS(점보 프레임) + VXLAN | 9001 | 50 | 8951 |
| GCP + VXLAN | 1460 | 50 | 1410 |

Pod MTU가 1500인데 VXLAN이면 1500바이트 패킷이 캡슐화돼 1550이 되어 물리 MTU를 넘고 단편화·드롭된다. 증상은 "ping은 되고 작은 요청도 되는데 큰 응답/TLS 핸드셰이크가 실패하고 간헐적으로 느림"이다. 진단은 단편화 금지 ping(`ping -c1 -M do -s <size-28> <PodIP>`)으로 크기를 줄여 가며 처음 성공하는 크기를 찾는다. VPC 피어링·VPN을 거치면 MTU가 더 줄 수 있어 일부 대상만 안 되면 MTU를 의심한다. 설정은 Calico는 `veth_mtu`, Cilium은 `MTU` 값이다.

---

## 코어 5. CNI 선택과 계층별 진단

### 5.1 주요 CNI 비교

**한 줄 요약:** Flannel은 단순, Calico는 표준적이고 안정적, Cilium은 eBPF로 성능·관측성, Antrea는 OVS·Windows가 강점이다.

| | Flannel | Calico | Cilium | Antrea |
|---|---|---|---|---|
| 데이터플레인 | iptables(VXLAN) | iptables 또는 eBPF | **eBPF** | OVS(OpenFlow) |
| 기본 전달 | VXLAN 오버레이 | BGP 네이티브(기본) 또는 IPIP/VXLAN | eBPF 라우팅(오버레이·네이티브) | OVS 터널(Geneve) 또는 네이티브 |
| 자체 NetworkPolicy | 없음 | 있음(`GlobalNetworkPolicy` 포함) | 있음(L7까지) | 있음 |
| kube-proxy 대체 | 불가 | 부분 | 완전 대체 가능 | 부분 |
| 관측성 | 낮음 | 보통 | Hubble | Traceflow |
| 복잡도 | **가장 단순** | 중간 | 높음 | 중간 |

Calico는 `CrossSubnet` 모드(같은 서브넷은 직접, 다르면 캡슐화)가 성능과 범용성의 절충으로 실용적이다. Cilium은 `hubble observe --verdict DROPPED`로 어떤 정책이 패킷을 떨궜는지 볼 수 있다. Flannel은 NetworkPolicy가 없어 프로덕션에 부적합하다는 것이 원문 평가다. NetworkPolicy는 [28장](28-CoreDNS-Ingress-NetworkPolicy.md)에서 이어진다.

### 5.2 대규모 환경의 벽

**한 줄 요약:** IP 고갈, iptables 규칙 폭증, conntrack 고갈이 세 가지 벽이다.

- **IP 고갈**: 클러스터 CIDR 설계(코어 3.3), AWS VPC CNI는 서브넷 크기와 prefix delegation.
- **iptables 규칙 폭증**: 서비스 1,000개 × 엔드포인트 10개면 규칙이 약 22,000개, 5,000개면 10만 개를 넘는다. 갱신 지연·kube-proxy CPU 상승. 대책은 nftables 등 다른 모드·Cilium 대체·서비스 수 감축이다([27장](27-Service와-kube-proxy.md)).
- **conntrack 고갈**: `conntrack -C`가 `nf_conntrack_max`의 80%를 넘으면 새 연결이 거부되기 시작한다(`dmesg`의 `nf_conntrack: table full`). `sysctl`로 max와 타임아웃을 조정한다. Cilium의 eBPF 데이터플레인은 자체 연결 추적을 쓴다.

### 5.3 계층별 진단

**한 줄 요약:** 같은 Pod → 같은 노드 → 다른 노드 → Service → DNS → NetworkPolicy 순으로 좁힌다.

```
Pod A → Pod B 통신 실패
 ① 같은 Pod 안(localhost)? → 포트 충돌
 ② 같은 노드의 다른 Pod? → CNI 로컬 브리지/veth (Pod netns 안에서 ip a, ip route)
 ③ 다른 노드의 Pod? → 노드 간 라우팅, 오버레이, MTU → 양쪽 노드 tcpdump
 ④ Service를 통하는가? → EndpointSlice 존재, kube-proxy 규칙
 ⑤ DNS 이름을 쓰는가? → DNS 진단
 ⑥ NetworkPolicy가 있는가? → 정책 확인, Hubble/Calico 로그
```

Pod IP로 직접 접근(`curl <PodIP>`)이 성공하면 CNI는 정상이고 Service나 DNS 문제다. 노드에서 Pod 네임스페이스는 `crictl inspect`로 PID를 얻어 `nsenter -t $PID -n ip addr`로 들여다본다. 양쪽 노드에서 동시에 캡처하면 패킷이 사라지는 지점을 특정할 수 있다.

| 증상 | 유력 원인 | 확인 |
|---|---|---|
| 같은 노드는 되고 다른 노드는 안 됨 | 오버레이/라우팅, MTU | `ip route`, tcpdump |
| ping은 되는데 큰 전송이 안 됨 | **MTU** | `ping -M do -s` |
| 간헐적 타임아웃 | conntrack 고갈, MTU | `conntrack -C`, `dmesg` |
| Pod가 `ContainerCreating`에서 멈춤 | CNI 플러그인 실패 | containerd 로그, `/etc/cni/net.d` |
| Pod에 IP가 없음 | IPAM 고갈, CNI 설정 | `describe pod` 이벤트 |
| 노드 재부팅 후 안 됨 | iptables 규칙 유실, CNI 상태 | kube-proxy/CNI Pod 재시작 |

---

## 실무 적용

### 체크리스트

- [ ] 쿠버네티스는 네트워크를 구현하지 않고 4대 요구사항을 정의하며, 구현은 CNI 플러그인이 한다.
- [ ] 게임 서버가 Pod IP를 클라이언트에 직접 알려 주는 설계라면 Pod IP가 일회용임을 반영했는가(Service/외부 LB 경유)?
- [ ] CNI 호출 주체는 런타임이다. CNI 오류는 containerd/CRI-O 로그와 `/etc/cni/net.d/`(사전순 하나만 채택)에서 찾는가?
- [ ] 클러스터 CIDR과 `--node-cidr-mask-size`로 최대 노드 수와 노드당 Pod 수(`maxPods` 110)를 계산해 두었는가?
- [ ] 오버레이를 쓴다면 Pod MTU를 캡슐화 오버헤드만큼 낮췄는가(VXLAN 1450)?
- [ ] 큰 전송만 실패하면 `ping -M do -s`로 실제 MTU를 찾았는가?
- [ ] 네트워크 장애를 계층별 순서(같은 Pod → 같은 노드 → 다른 노드 → Service → DNS → NetworkPolicy)로 좁혔는가?
- [ ] 대규모 환경이라면 `conntrack -C` 대비 `nf_conntrack_max` 비율(80% 경고)과 iptables 규칙 수를 모니터링하는가?

### 시나리오로 확인하기

1. **상황:** VXLAN 오버레이 CNI를 쓰는 클러스터에서 게임 서버 간 소형 RPC는 되는데, 접속 시 TLS 핸드셰이크와 큰 패치 파일 전송만 간헐적으로 실패한다.
   **질문:** 원인과 확인 방법은?

   <details markdown="1"><summary>답 확인</summary>

   Pod MTU가 캡슐화 오버헤드를 반영하지 않았을 가능성이 크다. 물리 MTU 1500에서 VXLAN은 50바이트를 쓰므로 Pod MTU는 1450이어야 한다. 1500이면 큰 패킷이 캡슐화 후 물리 MTU를 넘어 단편화·드롭된다. `ping -c1 -M do -s <size-28> <PodIP>`로 크기를 줄이며 처음 성공하는 값을 찾고, Calico는 `veth_mtu`, Cilium은 `MTU`로 맞춘다. → 코어 4

   </details>

2. **상황:** 새 CNI를 설치하려고 `/etc/cni/net.d/`에 `99-newcni.conflist`를 추가했는데 Pod가 계속 예전 네트워크로 뜬다. 그 디렉터리에는 `10-oldcni.conflist`도 있다.
   **질문:** 왜 이런 일이 생기고 어떻게 하나?

   <details markdown="1"><summary>답 확인</summary>

   런타임은 파일명 사전순으로 가장 앞선 설정 파일 하나만 채택하고 나머지는 조용히 무시한다. `10-oldcni.conflist`가 `99-newcni.conflist`보다 앞서므로 옛 CNI가 계속 채택된다. 옛 파일을 지우거나 이름을 바꿔 새 설정이 가장 앞서게 한다. "분명히 apply했는데 예전 CNI가 동작한다"의 원인은 이 사전순 규칙이다. → 코어 2

   </details>

3. **상황:** 클러스터 CIDR이 `10.244.0.0/16`, 노드 마스크가 `/24`다. 노드를 300대까지 늘릴 계획이다.
   **질문:** 가능한가?

   <details markdown="1"><summary>답 확인</summary>

   불가능하다. 최대 노드 수 = 2^(24-16) = 256이다. 클러스터 CIDR과 마스크는 생성 시 정해야 하고 운영 중 확장이 매우 번거로우므로, 더 큰 클러스터 CIDR이나 더 작은 노드 서브넷으로 설계를 다시 해야 한다. 노드당 Pod는 `/24`의 254와 `maxPods`(110) 중 작은 값이 상한이다. → 코어 3

   </details>

4. **상황:** 다른 노드의 Pod IP로 직접 `curl`하면 성공하는데, 같은 대상을 Service 이름으로 부르면 실패한다.
   **질문:** 어느 계층부터 보나?

   <details markdown="1"><summary>답 확인</summary>

   Pod IP 직접 접근이 성공하면 CNI·노드 간 전달은 정상이다. 문제는 Service, EndpointSlice(대상 존재·selector), kube-proxy 규칙, DNS, NetworkPolicy 계층이다. 계층별 진단 순서에서 ④ Service 이후를 확인한다. → 코어 5

   </details>

📖 출처: Kubernetes_Internals_Network_Guide/03-네트워크/13-네트워킹-모델과-CNI-스펙.md, kubernetes-textbook-main/05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md, kubernetes-qustion-book/02_심화/06_네트워크와_서비스_노출.md

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 4대 요구사항: Pod↔Pod ( ? ) / 노드↔Pod ( ? ) / 보이는 IP ( ? ) / ____Network 예외
         모델 이름 = IP-per-____ ,  구현 담당 = ____ 플러그인

[코어 2] CNI 동작 4: ____ / DEL / ____ / VERSION ,  호출 형태 = 환경변수 + ____ JSON
         호출 주체 = ( kubelet / 런타임 ) ,  설정 위치 = /etc/cni/net.d/ (사전순 ____개 채택)
         체인: 주 플러그인 → ( ? ) → portmap → ( ? )

[코어 3] IPAM 2층: ① ____-ipam-controller → Node.spec.____ ② CNI ____-local → Pod IP
         최대 노드 수 = 2^(____ - ____)

[코어 4] 오버레이 / ____ 라우팅 / ____ IP
         MTU: VXLAN -__ → 1450, IPIP -__ → 1480, WireGuard -__ → 1440
         진단 ping: ping -M ( ? ) -s <size-28>

[코어 5] 진단: 같은 Pod → ( ? ) → 다른 노드 → ( ? ) → DNS → ( ? )
```

### 2. 인출 질문

1. 쿠버네티스 네트워크 모델의 4대 요구사항은 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   ① 모든 Pod는 NAT 없이 다른 모든 Pod와 통신 ② 모든 노드는 NAT 없이 모든 Pod와 통신 ③ Pod가 인식하는 자신의 IP는 다른 Pod가 보는 IP와 동일 ④ `hostNetwork: true` Pod는 노드의 네트워크 네임스페이스를 공유하는 예외(Pod IP = 노드 IP, 포트 공유). → 코어 1

   </details>

2. IP-per-Pod 모델을 택한 이유와 그 대가는?

   <details markdown="1"><summary>답 확인</summary>

   포트 매핑 NAT 모델에서는 포트가 노드 전역 자원이 되고 앱이 자기 포트를 알아야 하며 디스커버리와 스케줄러가 포트 충돌을 추적해야 한다. IP-per-Pod는 이 복잡도를 앱에 떠넘기지 않아 표준 포트를 그대로 쓸 수 있다. 대가는 클러스터 규모의 평평한 라우팅 가능 네트워크를 CNI가 만들어야 한다는 것이다. → 코어 1

   </details>

3. CNI 호출 체인과 실패 로그의 위치는?

   <details markdown="1"><summary>답 확인</summary>

   kubelet이 CRI `RunPodSandbox`를 요청하면, 런타임이 네트워크 네임스페이스를 만들고 libcni로 설정을 로드해 `/opt/cni/bin/<plugin>`을 환경변수 + stdin JSON으로 실행하고 stdout JSON 결과를 받는다. 호출 주체가 런타임이므로 실패는 containerd/CRI-O 로그에 먼저 나타난다. → 코어 2

   </details>

4. `/etc/cni/net.d/`에 설정 파일이 여러 개 있으면 어떻게 되는가?

   <details markdown="1"><summary>답 확인</summary>

   파일명 사전순으로 가장 앞선 하나만 채택되고 나머지는 조용히 무시된다. 그래서 CNI 교체 시 기존 파일을 지우거나 이름을 바꿔야 한다. → 코어 2

   </details>

5. IPAM의 두 층은 각각 무엇을 하고, 왜 나뉘어 있는가?

   <details markdown="1"><summary>답 확인</summary>

   클러스터 전역 층은 node-ipam-controller가 `--cluster-cidr`를 `--node-cidr-mask-size`로 잘라 `Node.spec.podCIDR`에 노드별 서브넷을 기록한다(노드 추가/제거 때만). 노드 로컬 층은 CNI IPAM 플러그인(`host-local` 등)이 그 서브넷 안에서 CNI `ADD`마다 Pod IP를 즉시 배분한다. 빈번한 작업을 API 서버 왕복 없이 노드에서 끝내려는 설계다. → 코어 3

   </details>

6. `10.244.0.0/16` 클러스터 CIDR과 `/24` 노드 마스크일 때 최대 노드 수와 노드당 Pod 수 상한은?

   <details markdown="1"><summary>답 확인</summary>

   최대 노드 수 2^(24-16)=256개. 노드당 Pod 수는 `/24`의 사용 가능 주소 254와 kubelet `--max-pods`(기본 110) 중 작은 값이다. → 코어 3

   </details>

7. 오버레이, 네이티브 라우팅, 네이티브 IP의 장단점은?

   <details markdown="1"><summary>답 확인</summary>

   오버레이: 어디서나 동작하지만 캡슐화 CPU 비용과 MTU 감소, 진단이 어렵다. 네이티브 라우팅(BGP 등): 오버헤드·MTU 손실이 없고 진단이 쉽지만 물리 네트워크가 경로를 받아들여야 한다. 네이티브 IP(클라우드 CNI): 별도 설정이 필요 없고 보안 그룹을 Pod에 적용할 수 있지만 IP 고갈과 노드당 Pod 수 제약이 있다. → 코어 4

   </details>

8. "ping은 되는데 큰 전송이 실패한다"면 무엇을 의심하고 어떻게 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   MTU 불일치. 오버레이 캡슐화(VXLAN 50바이트 등)를 반영하지 않으면 큰 패킷이 단편화·드롭된다. `ping -c1 -M do -s <size-28> <PodIP>`로 크기를 줄이며 처음 성공하는 값을 찾고 Pod MTU를 맞춘다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** CNI 플러그인 호출 = CGI처럼 `fork+exec`에 환경변수와 stdin으로 설정을 넘기고 stdout JSON을 받는 것. ⚠️ 호출자는 kubelet이 아니라 런타임이고, 플러그인이 netns 안에 인터페이스를 직접 만든다.
- **C++ 유추:** 오버레이 MTU = UDP 게임 패킷의 크기 제한. ⚠️ 게임은 앱이 패킷 크기를 줄이면 되지만, 오버레이에서는 **Pod 인터페이스 MTU 설정**을 바꿔야 하고 앱은 모른 채 큰 전송에서만 실패한다.
- **비유:** IP-per-Pod = 아파트 단지에서 각 호가 독립 번지수를 갖는 것(포트=방 번호 겹쳐도 됨). 오버레이 = 택배 상자 안에 편지 봉투를 통째로 넣어 보냄. ⚠️ 비유가 깨지는 지점: 상자가 커지는 만큼 규격(MTU)을 초과해 큰 편지만 반송된다.
- **비유:** IPAM 2층 = 본사가 지점에 번지 대역을 나눠 주고(컨트롤러), 지점이 개별 호수를 배정(CNI). ⚠️ 비유가 깨지는 지점: 지점 대역은 한 번 정해지면 운영 중 넓히기 어렵다.
- **묶음(3의 법칙):** 노드 간 전달 3(오버레이·네이티브 라우팅·네이티브 IP) / 대규모 벽 3(IP 고갈·iptables 폭증·conntrack) / 메타 플러그인 3(portmap·bandwidth·firewall 등).
- **대칭·순서:** 컨트롤러가 서브넷을 나눔(드물게) ↔ CNI가 Pod IP를 나눔(매번). 진단 순서: 같은 Pod → 같은 노드 → 다른 노드 → Service → DNS → NetworkPolicy.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod가 만들어질 때 IP가 붙는 과정(kubelet → CRI → 런타임 → CNI)"을 처음 듣는 사람에게 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "왜 쿠버네티스에서는 서버 인스턴스마다 포트를 나누지 않아도 되는가, 그리고 오버레이에서 MTU를 신경 써야 하는 이유"를 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "오버레이가 어디서나 되니 항상 오버레이를 쓰자" vs B "가능하면 네이티브 라우팅이 낫다" — MTU, CPU 비용, 진단 용이성, 물리 네트워크 제어 가능성을 근거로 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 IPAM 2층 구조와 podCIDR 할당을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/13 (13.1&#126;13.5), kubernetes-textbook-main 05-내부-동작-파헤치기/23 (23.1&#126;23.6), kubernetes-qustion-book 02_심화/06 (1, 6)*
