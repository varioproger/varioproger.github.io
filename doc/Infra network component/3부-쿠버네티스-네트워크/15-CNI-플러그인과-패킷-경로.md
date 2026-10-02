---
title: "15장. CNI 플러그인과 패킷 경로"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 15
---

# 15장. CNI 플러그인과 패킷 경로

> **🎮 게임 서버 개발자에게** — 서로 다른 서버 머신 A, B에 게임룸 프로세스가 있고 둘이 통신해야 한다. 두 머신 사이의 물리 네트워크(스위치·라우터)는 **Pod의 사설 대역(`10.244.0.0/16`)을 전혀 모른다.** 이 상황에서 패킷을 건네는 방법은 크게 둘이다. "패킷을 통째로 새 패킷의 페이로드에 넣어 보낸다"(오버레이)와 "라우터에게 이 대역은 저 서버로 보내라고 알려 준다"(네이티브 라우팅). 결정적으로 다른 점은, 전자는 **헤더가 추가되는 만큼 한 번에 보낼 수 있는 최대 크기(MTU)가 줄어든다**는 것이다. 작은 패킷은 잘 가는데 큰 응답만 멈추는 증상은 소켓 서버를 만들어 본 사람에게도 낯설다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - ping과 작은 HTTP 요청은 되는데 큰 응답이나 TLS 핸드셰이크에서만 멈춘다 → 오버레이 환경의 MTU 불일치를 의심해야 한다.
> - 같은 노드의 Pod끼리는 통신되는데 다른 노드의 Pod와는 안 된다 → 노드 간 경로(오버레이/라우팅)를 양쪽 노드에서 캡처해 봐야 한다.
> - 사내 온프레미스, AWS EKS, 단순 개발 클러스터 중 어떤 환경에 어떤 CNI를 골라야 하는가, 또는 EKS에서 노드당 Pod 수 상한에 걸렸다.

## 코어 — 이것만은 100%

> **한 문장:** 물리 네트워크는 Pod 대역을 모르므로 CNI 플러그인은 노드 간 패킷을 (1) 캡슐화해 보내거나(오버레이), (2) 물리 네트워크에 경로를 알리거나(네이티브 라우팅), (3) Pod에 VPC의 실제 IP를 주는(클라우드 네이티브 IP) 세 방식 중 하나로 운반하며, 오버레이는 캡슐화 헤더만큼 MTU가 줄어든다.

1. **근본 문제는 "물리 네트워크가 Pod CIDR을 모른다"이고, 해법은 세 가지다** — 오버레이(어디서나 동작, MTU·CPU 비용), 네이티브 라우팅(오버헤드 없음, 물리 네트워크가 경로를 받아야 함), 클라우드 네이티브 IP(VPC IP 직접 사용, IP 고갈 위험).
2. **패킷 경로는 "veth → 루트 netns 라우팅 → (VXLAN 캡슐화 또는 그대로) → 상대 노드 → veth"다** — 라우팅 테이블이 `dev vxlan.*`면 오버레이, `via <노드IP> dev eth0`이면 네이티브 라우팅이며, tcpdump로 캡슐화 유무가 바로 드러난다.
3. **오버레이의 대가는 MTU다** — VXLAN 50바이트, IPIP 20바이트. Pod MTU를 그만큼 낮추지 않으면 ping은 되고 큰 전송만 실패한다.
4. **플러그인은 이 스펙트럼 위의 선택이다** — Flannel(단순), Calico(BGP·성숙한 정책), Cilium(eBPF), Antrea(OVS), 클라우드 CNI(VPC IP).

**이 장의 학습 목표**

- 오버레이·네이티브 라우팅·클라우드 네이티브 IP 세 방식의 원리와 트레이드오프를 근거와 함께 비교한다.
- VXLAN 오버레이와 BGP 네이티브 라우팅에서 교차 노드 패킷이 지나는 단계를 순서대로 말한다.
- `ip route`, `ip -d link`, `bridge fdb`, tcpdump로 이 클러스터가 어느 방식인지 판별한다.
- 캡슐화별 MTU 오버헤드를 계산하고, MTU 불일치 증상을 알아보고 진단한다.
- Flannel·Calico·Cilium·Antrea와 AWS VPC CNI의 특징을 구분하고 환경에 맞는 선택 기준을 안다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 패킷 앞에 길이·타입 헤더를 붙여 프레이밍한 뒤 TCP로 전송 | 오버레이 캡슐화(VXLAN: Pod 패킷 전체를 바깥 UDP 패킷에 넣음) | 원본 페이로드를 새 헤더로 감싸 운반한다 | 감싸는 헤더는 앱 계층이 아니라 IP/UDP 계층이고, 물리 네트워크는 **바깥 헤더만** 본다. 헤더만큼 MTU가 줄어든다 |
| 사설 서브넷 대역에 대해 라우터에 정적 경로(next hop) 추가 | 네이티브 라우팅(`10.244.1.0/24 → 노드 A`) | 목적지 대역을 다음 홉으로 지정해 준다 | 이 경로를 BGP(BIRD)나 클라우드 라우트 테이블이 대신 광고하고, 물리 네트워크가 그 경로를 받아야 한다 |
| 큰 메시지(스냅샷)만 드롭되는 경로 MTU 문제 | MTU 불일치(Pod MTU 1500, 캡슐화 후 1550) | 한 패킷 크기가 경로 한계를 넘으면 단편화/드롭 | 작은 요청과 ping은 통과하고 큰 응답·TLS 핸드셰이크만 실패해 증상이 교묘하다 |
| 서버를 직접 두 머신에 배포하고 IP를 수작업 배정 | AWS VPC CNI(Pod IP = VPC의 실제 IP) | Pod가 진짜 네트워크 주소를 갖는다 | 노드당 Pod 수가 인스턴스의 ENI·IP 한계에 묶이고 서브넷 IP가 고갈될 수 있다 |
| `tcpdump`로 소켓 서버 패킷 확인 | 양쪽 노드에서 동시에 tcpdump | 패킷이 어디서 사라지는지 찾는다 | 오버레이면 노드 `eth0`에는 UDP 4789/8472로 감싸진 패킷이 보이고 원본은 `vxlan.*`에서만 보인다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 노드 A의 Pod `10.244.1.5`가 노드 B의 Pod `10.244.2.7`로 보낼 때, 사이의 스위치는 이 주소를 알까? 모른다면 어떻게 전달할까?
> 2. 오버레이를 쓰면 무엇이 좋고 무엇이 나쁠까?
> 3. 물리 MTU가 1500일 때 VXLAN 오버레이의 Pod MTU는 얼마여야 할까?
> 4. `ip route`에서 `10.244.2.0/24 via 192.168.1.11 dev eth0 proto bird`는 무슨 뜻일까?
> 5. AWS에서 Pod가 VPC IP를 직접 받으면 좋은 점과 나쁜 점은?
>
> **처리법:** 🛠 실습 `ip route | grep 10.244`, `ip -d link show | grep -A2 vxlan`, `bridge fdb show dev vxlan.calico`, 두 Pod 사이 ping + 양쪽 노드 `tcpdump -i any -nn` → 읽자마자 직접 실행(리눅스·kind 필요) · 🗺 관계도 근본 문제 → 오버레이/네이티브/네이티브 IP 3분기, VXLAN 6단계·BGP 4단계 경로, 선택 가이드 트리 · 📦 카드로 MTU 오버헤드(VXLAN 50 / IPIP 20 / WireGuard 약 60), UDP 포트 4789(또는 8472), `ping -M do -s` 크기 = MTU − 28, EKS 노드당 Pod 수 `(ENI 수 × ENI당 IP 수) − 1`

---

## 코어 1. 근본 문제는 "물리 네트워크가 Pod CIDR을 모른다"이고, 해법은 세 가지다

### 1.1 근본 문제

**한 줄 요약:** 물리 네트워크가 아는 것은 노드의 실제 IP뿐이다. Pod 대역의 패킷을 어떻게 물리 네트워크 위에 실어 보내는가가 CNI가 풀 문제다.

노드 A의 Pod(`10.244.1.5`)가 노드 B의 Pod(`10.244.2.7`)로 패킷을 보낸다. **물리 네트워크(스위치·라우터)는 `10.244.0.0/16`이라는 대역을 전혀 모른다.** 물리 네트워크가 아는 것은 노드의 실제 IP(`192.168.1.0/24` 같은)뿐이다. 13장이 정한 "NAT 없이 모든 Pod와 통신" 요구([13장](13-쿠버네티스-네트워크-모델과-Pod-네트워크.md))를 만족하려면 이 간극을 메워야 하고, 그 방식을 CNI 플러그인이 고른다.

### 1.2 방식 1 — 오버레이(캡슐화)

**한 줄 요약:** Pod 패킷 전체를 노드 간 패킷 속에 통째로 넣는다. 어디서나 동작하지만 MTU와 CPU 비용을 낸다.

```
┌───────────────────────────────────────────────────┐
│ 외부 IP 헤더 (노드A IP → 노드B IP) — 물리 네트워크가 이해함│
│ ┌───────────────────────────────────────────────┐ │
│ │ VXLAN 헤더 (VNI로 가상 네트워크 구분)              │ │
│ │ ┌───────────────────────────────────────────┐ │ │
│ │ │ 내부 IP 헤더 (Pod A IP → Pod B IP)          │ │ │
│ │ │ 원본 페이로드                                │ │ │
│ │ └───────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

물리 네트워크는 바깥 헤더만 보고 노드 B로 전달하면 그만이다. 캡슐화 프로토콜은 다음과 같다.

| 프로토콜 | 오버헤드 | 특징 |
|---|---|---|
| **VXLAN** | 50 bytes | UDP 캡슐화, 가장 널리 쓰임 |
| **IPIP** | 20 bytes | IP-in-IP, 더 가벼움 |
| **Geneve** | 가변 | 확장 가능한 메타데이터 |
| **WireGuard** | 약 60 bytes | 암호화 포함 |

- 장점: 물리 네트워크에 아무 설정도 필요 없다. 어디서나 동작한다(온프레미스, 클라우드, 하이브리드).
- 단점: 캡슐화/역캡슐화 CPU 비용, **MTU가 줄어든다**, 패킷을 물리 네트워크 장비가 이해하지 못해 문제 진단이 어렵다.

### 1.3 방식 2 — 네이티브 라우팅

**한 줄 요약:** 캡슐화 없이 물리 네트워크(또는 그에 준하는 라우팅 계층)에 "이 Pod CIDR은 이 노드로 가라"는 경로를 알린다.

```
라우터/스위치의 라우팅 테이블에 다음이 존재해야 한다:
  10.244.1.0/24 → 192.168.1.10 (노드 A, 넥스트 홉)
  10.244.2.0/24 → 192.168.1.11 (노드 B, 넥스트 홉)
```

이 경로를 만드는 방법은 셋이다.

| 방법 | 설명 |
|---|---|
| **BGP** | Calico의 BIRD 데몬이 라우터와 피어링해 경로를 광고 |
| **클라우드 라우트 테이블** | GKE/EKS가 VPC 라우트 테이블에 항목 추가(CNI가 직접 항목 추가) |
| **동일 L2 세그먼트** | 모든 노드가 같은 서브넷에 있어 커널이 ARP만으로 직접 라우팅 |

- 장점: **캡슐화 오버헤드 없음**(CPU·MTU 손실 없음), 패킷을 그대로 볼 수 있어 진단이 쉽다.
- 단점: 물리 네트워크가 이 경로들을 실제로 받아들일 수 있어야 한다. 클라우드에서는 라우트 테이블 항목 수 제한이 있다(AWS: 기본 50).

### 1.4 방식 3 — 클라우드 네이티브 IP

**한 줄 요약:** Pod가 VPC의 실제 IP를 받는다. 오버레이도 라우팅 설정도 필요 없지만 IP 고갈과 노드당 Pod 수 제한이 따른다.

```
AWS VPC CNI:  Pod IP = VPC 서브넷의 ENI 보조 IP
Azure CNI:    Pod IP = VNet의 IP
GKE:          Pod IP = VPC의 별칭 IP 범위
```

- 장점: 오버레이도 라우팅 설정도 필요 없다. VPC 보안 그룹·플로우 로그를 Pod에 직접 적용할 수 있고, 클러스터 외부에서 Pod에 직접 접근 가능하다.
- 단점: **IP 고갈**이 심각한 문제가 되고, 노드당 Pod 수가 인스턴스 타입에 묶인다(ENI 개수 × IP 개수).

```bash
# EKS에서 노드당 최대 Pod 수 계산
# (ENI 수 × ENI당 IP 수) - 1
# m5.large: 3 × 10 - 1 = 29
```

**IP 접두사 위임(prefix delegation)** 으로 완화할 수 있다.

```bash
# 접두사 위임으로 완화
kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true
```

`kubernetes-qustion-book`은 EKS의 VPC CNI를 이렇게 설명한다(기본 IPv4 secondary-IP 방식). 노드의 Amazon VPC CNI 구성요소(`aws-node`)가 EC2 ENI와 IP 풀을 관리하고, Pod 샌드박스 네트워크 설정 과정에서 CNI 플러그인이 그 IP로 인터페이스·경로를 구성한다. 모든 Pod가 ENI 하나를 독점하는 것은 아니고, 하나의 ENI에 여러 주소가 붙어 여러 Pod에 쓰인다. Pod 수를 제한하는 조건은 CPU·메모리 외에도 노드의 Pod 수 설정, 인스턴스의 ENI/IP 한계, subnet 가용 주소, IP 확보 정책이다. 따라서 "노드당 최대 Pod 숫자" 하나를 모든 인스턴스에 적용하지 않는다. Security Groups for Pods, custom networking, prefix delegation, IPv6 등은 세부 모델을 바꾸므로 별도 조건으로 읽는다.

> **[보충]** 위 `m5.large: 3 × 10 - 1 = 29`는 원천(`kubernetes-textbook-main` 23.2)의 예시 계산이고, 인스턴스별 ENI·IP 한계 값은 원천에 표로 제시돼 있지 않다. 실제 한도는 AWS 문서나 환경에서 확인한다. 또 이 장은 클라우드 네이티브 IP의 개념만 다루며, 이 경우 Ingress에서 ALB가 Pod IP를 직접 대상으로 삼는 구성은 [19장](19-Ingress와-Gateway-API.md)에서 다룬다.

### 1.5 어느 방식을 고를까

**한 줄 요약:** 물리 네트워크를 제어할 수 있으면 네이티브 라우팅(BGP), 아니면 클라우드 CNI, 그 외에는 오버레이(VXLAN)다.

```
물리 네트워크를 제어할 수 있는가?
├─ 예 → 네이티브 라우팅 (BGP)          성능 최선
└─ 아니오
    └─ 클라우드인가?
        ├─ 예 → 클라우드 CNI 또는 클라우드 라우트
        │        IP 여유가 없다면 → 오버레이
        └─ 아니오 → 오버레이 (VXLAN)   가장 범용적
```

## 코어 2. 패킷 경로는 "veth → 루트 netns 라우팅 → (캡슐화 또는 그대로) → 상대 노드 → veth"다

### 2.1 오버레이(VXLAN)가 패킷을 옮기는 경로

**한 줄 요약:** 라우팅 테이블이 Pod CIDR을 `vxlan` 인터페이스로 보내고, VXLAN이 FDB로 상대 노드의 실제 IP를 찾아 UDP로 감싼다.

```
노드 A: Pod(10.244.1.5) → ping → Pod(10.244.2.7, 노드 B)

① Pod netns에서 패킷 생성, 목적지 10.244.2.7
② veth를 통해 노드 A의 루트 netns로
③ 라우팅 테이블 조회: 10.244.2.0/24 → dev vxlan.calico (또는 flannel.1)
④ VXLAN 인터페이스가 캡슐화
     - FDB(Forwarding Database)에서 10.244.2.0/24를 담당하는 노드 B의 실제 IP를 조회
     - 외부 UDP/VXLAN 헤더를 씌워 노드 B의 물리 IP로 전송 (UDP 포트 4789 또는 8472)
⑤ 노드 B의 물리 NIC가 수신 → VXLAN 헤더 확인 → 역캡슐화
⑥ 내부 패킷의 목적지(10.244.2.7)로 로컬 라우팅 → veth → Pod netns
```

```bash
# VXLAN 인터페이스와 FDB 확인 (오버레이 CNI일 때)
ip -d link show | grep -A2 vxlan
bridge fdb show dev vxlan.calico   # 또는 flannel.1
```

veth·FDB의 원리는 [4장](../1부-리눅스-네트워크-기초/04-veth-브리지-라우팅-ARP.md), VXLAN 자체와 MTU는 [6장](../1부-리눅스-네트워크-기초/06-오버레이-VXLAN-MTU.md)을 본다.

### 2.2 네이티브 라우팅(BGP)이 패킷을 옮기는 경로

**한 줄 요약:** 라우팅 테이블에 `via <상대 노드 IP> dev eth0`가 이미 있어서 캡슐화 없이 그대로 나간다. `proto bird`는 BGP로 학습된 경로다.

```
① Pod netns에서 패킷 생성, 목적지 10.244.2.7
② 노드 A의 라우팅 테이블 조회: 10.244.2.0/24 via 192.168.1.11 dev eth0
   (이 경로는 BIRD가 BGP로 노드 B로부터 받아 커널에 주입한 것)
③ 캡슐화 없이 그대로 물리 네트워크로 전송 (목적지 IP는 여전히 10.244.2.7이지만,
   L2 프레임의 다음 홉은 노드 B)
④ 노드 B가 직접 수신 → 로컬 라우팅 → Pod netns
```

```bash
ip route | grep 10.244
# 10.244.2.0/24 via 192.168.1.11 dev eth0 proto bird
```

`proto bird`라는 표시가 이 경로가 **BGP로 학습된 경로**임을 알려준다. 캡슐화 계층이 없으므로 `tcpdump`로 봐도 평범한 IP 패킷이다. **네이티브 라우팅이 진단하기 쉬운 이유**다.

### 2.3 kind 기본 CNI(kindnet)는 네이티브 라우팅의 축소판

**한 줄 요약:** kindnet은 각 노드에 다른 노드의 Pod CIDR로 가는 정적 경로를 직접 추가하는 방식이라 `vxlan` 인터페이스가 보이지 않는다.

kind 노드는 도커 브리지 네트워크 위의 컨테이너이므로 별도 캡슐화 없이 정적 경로를 추가하는 것으로 충분하다.

```bash
docker exec k8s-guide-worker ip route | grep 10.244
```

```
10.244.0.0/24 via 172.18.0.2 dev eth0   # control-plane 노드로
10.244.2.0/24 via 172.18.0.4 dev eth0   # worker2 노드로
10.244.1.1 dev veth... scope host       # 로컬 Pod
```

캡슐화 인터페이스(`vxlan.*` 같은)가 보이지 않으면 이 클러스터는 캡슐화 없이 직접 라우팅하고 있다는 뜻이다. VXLAN/IPIP 헤더나 FDB를 직접 보려면 `disableDefaultCNI: true`로 kind 클러스터를 만들고 Calico를 VXLAN 또는 IPIP 모드로 설치해야 한다(원천 실습 과제 4).

### 2.4 tcpdump로 캡슐화 유무 확인

**한 줄 요약:** 두 Pod 사이 ping을 양쪽 노드에서 동시에 캡처하면 노드 `eth0`에 평범한 ICMP가 보이는지, UDP 4789/8472로 감싸졌는지로 판별된다.

```bash
kubectl run pa --image=nicolaka/netshoot --restart=Never --overrides='{"spec":{"nodeName":"k8s-guide-worker"}}' -- sleep 3600
kubectl run pb --image=nicolaka/netshoot --restart=Never --overrides='{"spec":{"nodeName":"k8s-guide-worker2"}}' -- sleep 3600
kubectl wait --for=condition=Ready pod/pa pod/pb --timeout=60s

PB_IP=$(kubectl get pod pb -o jsonpath='{.status.podIP}')
kubectl exec pa -- ping -c 3 $PB_IP

docker exec k8s-guide-worker tcpdump -i any -nn "host $PB_IP" -c 5 &
docker exec k8s-guide-worker2 tcpdump -i any -nn "icmp" -c 5 &
kubectl exec pa -- ping -c 3 $PB_IP

kubectl delete pod pa pb --ignore-not-found
```

kindnet(네이티브 라우팅) 환경에서는 노드 A의 `eth0`에서 목적지가 그대로 `PB_IP`인 평범한 ICMP가 잡힌다. VXLAN 환경이었다면 노드 A의 `eth0`에서는 UDP 4789(또는 8472)로 감싸진 패킷이 잡히고, 내부의 원본 ICMP는 `vxlan.calico` 인터페이스에서만 보인다.

> **[보충]** 같은 노드의 Pod끼리의 경로(로컬 브리지/veth)는 CNI에 따라 구현이 다르고, 원천은 진단 요령(Pod 네임스페이스 안에서 `ip a`, `ip route`)만 준다. 이 장은 같은 노드 경로의 세부 구현을 다루지 않는다. 진단 절차는 [23장](../4부-진단/23-네트워크-장애-진단.md)에서 계층별로 정리한다.

## 코어 3. 오버레이의 대가는 MTU다

### 3.1 오버헤드와 Pod MTU

**한 줄 요약:** 캡슐화 헤더만큼 Pod 인터페이스 MTU를 낮춰야 하며, VXLAN은 50바이트, IPIP는 20바이트다.

| 캡슐화 | 오버헤드 | 물리 MTU 1500일 때 Pod MTU |
|---|---|---|
| 없음 (네이티브 라우팅) | 0 | 1500 |
| IPIP | 20 bytes | 1480 |
| VXLAN | 50 bytes | 1450 |
| Geneve | 가변(기본 8 + 옵션) | 대략 1450 내외 |
| WireGuard | 약 60 bytes | 1440 |

| 환경 | 물리 MTU | 오버헤드 | Pod MTU |
|---|---|---|---|
| 일반 이더넷 + VXLAN | 1500 | 50 | **1450** |
| 일반 이더넷 + IPIP | 1500 | 20 | **1480** |
| 일반 이더넷 + WireGuard | 1500 | 60 | **1440** |
| AWS (점보 프레임) | 9001 | 50 | 8951 |
| GCP | 1460 | 50 | 1410 |

Pod 인터페이스 MTU가 이 값보다 크게 설정되어 있으면 큰 패킷이 캡슐화된 뒤 물리 MTU를 넘으면서 **단편화되거나 드롭된다.**

```
물리 네트워크 MTU: 1500
VXLAN 오버헤드:    -50
Pod 인터페이스 MTU: 1450 이어야 한다

만약 Pod MTU가 1500으로 설정되어 있으면:
  1500바이트 패킷 → VXLAN 캡슐화 → 1550바이트
  → 물리 MTU 초과 → 단편화 또는 드롭
```

### 3.2 증상은 교묘하다

**한 줄 요약:** ping과 작은 요청은 되고, 큰 응답·파일 전송·TLS 핸드셰이크만 멈추거나 간헐적으로 느리다.

```
· ping은 잘 된다
· 작은 HTTP 요청도 잘 된다
· 큰 응답이나 파일 전송에서 멈춘다
· TLS 핸드셰이크가 실패한다
· "간헐적으로" 느리다
```

VPC 피어링이나 VPN을 거치면 MTU가 더 줄어든다. 온프레미스 연결이 있는 클러스터에서 **일부 대상만 통신이 안 되는** 증상이 나오면 MTU를 의심한다.

### 3.3 진단과 설정

**한 줄 요약:** 단편화 금지 ping(`-M do`)으로 실제 통과하는 최대 크기를 찾고, CNI 설정으로 MTU를 맞춘다.

```bash
# ① MTU 확인
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- ip link show eth0
docker exec k8s-guide-worker ip link show | grep mtu

# ② 단편화 금지 ping으로 실제 MTU 찾기
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'for size in 1500 1450 1400 1350; do
           echo -n "$size: "
           ping -c1 -M do -s $((size-28)) <TARGET_POD_IP> >/dev/null 2>&1 && echo OK || echo FAIL
         done'
```

첫 번째로 성공하는 크기가 실제 사용 가능한 MTU다.

> **[보충]** 원천의 명령은 `-s $((size-28))`로 28을 뺀다. 이 28이 IP 헤더 20 + ICMP 헤더 8 바이트라는 설명은 원천에 없는 보충이다.

```yaml
# Calico
kind: ConfigMap
metadata:
  name: calico-config
data:
  veth_mtu: "1450"
```

```bash
# Cilium
helm upgrade cilium cilium/cilium --set MTU=1450
```

> **[보충]** 오버레이·VXLAN·MTU 자체의 리눅스 수준 설명은 이 책의 [6장](../1부-리눅스-네트워크-기초/06-오버레이-VXLAN-MTU.md)에서 다룬다. 이 장은 쿠버네티스 환경의 MTU 값과 진단 절차만 다룬다.

## 코어 4. 플러그인은 이 스펙트럼 위의 선택이다

### 4.1 비교표

**한 줄 요약:** Flannel은 가장 단순하지만 NetworkPolicy가 없고, Calico는 정책이 성숙하며, Cilium은 eBPF, Antrea는 OVS 기반이다.

| | Flannel | Calico | Cilium | Antrea |
|---|---|---|---|---|
| 데이터플레인 | iptables (VXLAN 백엔드) | iptables 또는 eBPF | **eBPF** | OVS(OpenFlow) |
| 기본 전달 방식 | VXLAN 오버레이 | BGP 네이티브 라우팅(기본) 또는 IPIP/VXLAN | eBPF 라우팅(오버레이·네이티브 모두 지원) | OVS 터널(Geneve) 또는 네이티브 |
| 자체 NetworkPolicy | ❌ (지원 안 함) | ✅ (확장 `GlobalNetworkPolicy` 포함) | ✅ (L3/L4 + L7까지) | ✅ (OpenFlow 기반) |
| kube-proxy 대체 | ❌ | 부분적 | ✅ (완전 대체 가능, [22장](22-eBPF-데이터플레인과-Cilium.md)) | 부분적 |
| 관측성 도구 | 낮음 | 보통 | **Hubble** (흐름 관측 UI) | Traceflow (패킷 경로 추적) |
| Windows | ✅ | ✅ | 제한적 | ✅ |
| 암호화 | ❌ | WireGuard | WireGuard/IPsec | IPsec/WireGuard |
| 커널 요구사항 | 낮음 | 낮음 | 4.19+ 권장 | 낮음 |
| 복잡도 | **가장 단순** | 중간 | 높음 | 중간 |

> **[보충]** 두 원천(`Kubernetes_Internals_Network_Guide` 13.4, `kubernetes-textbook-main` 23.3)의 비교표를 하나로 합쳤다. 두 표의 내용은 서로 충돌하지 않으며, Cilium 커널 요구는 앞 표에는 "비교적 최신 커널 권장", 뒤 표에는 "4.19+ 권장"으로 적혀 있다. 이 표의 4.19+는 뒤 원천의 값이다.

### 4.2 Calico

**한 줄 요약:** 노드마다 `calico-node`(Felix + BIRD + confd)가 돌고, 모드를 BGP/IPIP/VXLAN/CrossSubnet 중에서 고를 수 있다.

```
┌──────────────── 각 노드 (DaemonSet) ────────────────┐
│  calico-node                                        │
│  ├── Felix       정책과 라우팅을 iptables/eBPF로 프로그래밍│
│  ├── BIRD        BGP 데몬 — 경로 광고 (BGP 모드)      │
│  └── confd       설정 생성                            │
└─────────────────────────────────────────────────────┘
┌──────────── 컨트롤 플레인 (Deployment) ──────────────┐
│  calico-kube-controllers                            │
│  · 쿠버네티스 오브젝트 ↔ Calico 데이터 동기화           │
└─────────────────────────────────────────────────────┘

데이터 저장소: 쿠버네티스 API (권장) 또는 별도 etcd
```

| 모드 | 캡슐화 | 언제 |
|---|---|---|
| BGP (기본) | 없음 | 같은 L2, 또는 BGP 가능한 네트워크 |
| IPIP | IP-in-IP | 서브넷을 넘어야 할 때 |
| VXLAN | VXLAN | BGP를 쓸 수 없을 때 |
| `CrossSubnet` | 조건부 | 같은 서브넷은 직접, 다르면 캡슐화 |

`CrossSubnet`이 실용적이다. 성능과 범용성을 절충한다. 강점은 성숙한 NetworkPolicy 구현, `GlobalNetworkPolicy`(클러스터 전역), 거부 규칙과 우선순위 지원이다(정책은 [21장](21-NetworkPolicy와-네트워크-보안.md)).

### 4.3 Cilium과 Antrea

**한 줄 요약:** Cilium은 데이터플레인 자체가 eBPF(kube-proxy 대체·L7 정책·Hubble), Antrea는 OVS와 Traceflow·Windows 지원이 강점이다.

Cilium은 전통적인 "패킷 → netfilter/iptables 체인 순회 → 결정" 대신 "패킷 → eBPF 프로그램(커널 내 실행) → 결정"이다. 오버레이(VXLAN/Geneve)로도 네이티브 라우팅으로도 돌릴 수 있어서, eBPF는 "노드 간에 패킷을 어떻게 옮기느냐"가 아니라 "각 노드 안에서 그 패킷을 얼마나 빠르게 처리하느냐"를 다시 정의한다. 주요 기능은 kube-proxy 대체, L7 정책(HTTP 메서드/경로, gRPC, Kafka), FQDN 정책, Hubble 관측성, 클러스터 메시, 투명 암호화(WireGuard 또는 IPsec), EDT 기반 대역폭 관리다. 상세는 [22장](22-eBPF-데이터플레인과-Cilium.md)에서 다룬다.

Antrea는 Open vSwitch(OVS) 기반이다. 각 노드의 `antrea-agent`가 OVS 브리지(`br-int`)를 OpenFlow 규칙으로 구성해 포워딩하고 정책도 OpenFlow로 구현한다. 강점은 Windows 노드 지원, OVS 생태계의 도구, 패킷이 어디서 떨어졌는지 보여 주는 Traceflow다.

### 4.4 선택 기준

**한 줄 요약:** 단순함은 Flannel, 표준·안정은 Calico, 성능·관측성·대규모는 Cilium, Windows 혼합·OVS는 Antrea.

- **단순함 우선, 정책 불필요** → Flannel (하지만 NetworkPolicy가 없어 프로덕션 부적합)
- **표준적이고 안정적** → Calico
- **성능과 관측성, 대규모** → Cilium
- **Windows 혼합, OVS 경험** → Antrea

## 실무 적용

### 체크리스트

- [ ] 물리 네트워크는 Pod CIDR을 모른다. 노드 간 전달은 오버레이(캡슐화) / 네이티브 라우팅(BGP·클라우드 라우트·동일 L2) / 클라우드 네이티브 IP 중 하나다.
- [ ] `ip route | grep <PodCIDR>`로 방식을 판별한다: `dev vxlan.*`(오버레이) vs `via <노드IP> dev eth0`(네이티브, `proto bird`면 BGP).
- [ ] 교차 노드 문제는 양쪽 노드에서 동시에 `tcpdump -i any -nn`. 오버레이면 노드 `eth0`에서 UDP 4789(또는 8472)를 본다.
- [ ] 오버레이를 쓰면 Pod MTU를 낮춘다(VXLAN 50바이트, IPIP 20바이트, WireGuard 약 60바이트). ping은 되는데 큰 전송만 실패하면 MTU를 의심하고 `ping -M do -s`(크기 = MTU − 28)로 확인한다.
- [ ] 클라우드 네이티브 IP(AWS VPC CNI)는 IP 고갈과 노드당 Pod 수 한도(`(ENI 수 × ENI당 IP 수) − 1`)를 설계 때 확인한다. 완화책은 prefix delegation.
- [ ] 정책이 필요하면 Flannel은 부적합(NetworkPolicy 미지원). Calico/Cilium/Antrea 중에서 선택한다.
- [ ] kind의 kindnet은 네이티브 라우팅 축소판이라 오버레이를 관찰하려면 Calico를 VXLAN/IPIP 모드로 설치해야 한다.

### 시나리오로 확인하기

1. **상황:** 오버레이 기반 클러스터에서 게임 서버 Pod가 매치 결과 같은 작은 요청은 잘 처리하는데, 큰 스냅샷 응답을 보내는 순간 멈추고 TLS 핸드셰이크도 가끔 실패한다. ping은 정상이다.
   **질문:** 의심 부품과 확인·해결 방법은?

   <details markdown="1"><summary>답 확인</summary>

   MTU 불일치를 의심한다. Pod MTU가 1500이면 VXLAN 캡슐화(50바이트) 후 1550바이트가 되어 물리 MTU 1500을 넘으므로 단편화되거나 드롭된다. `ip link show eth0`로 Pod MTU를 보고, `ping -M do -s $((size-28))`로 1500, 1450, 1400, 1350을 시험해 첫 성공 크기를 실제 MTU로 본다. CNI에서 Calico는 `veth_mtu: "1450"`, Cilium은 `--set MTU=1450` 등으로 맞춘다. → 코어 3

   </details>

2. **상황:** 같은 노드의 Pod끼리는 통신되는데 다른 노드의 Pod로는 안 된다.
   **질문:** 어떻게 좁히나?

   <details markdown="1"><summary>답 확인</summary>

   노드 간 경로(오버레이/라우팅)와 MTU를 의심한다. 노드에서 `ip route | grep 10.244`(상대 노드 Pod CIDR로 가는 경로 유무), 오버레이라면 `ip -d link show | grep -A2 vxlan`과 `bridge fdb show dev vxlan.*`로 확인한다. 양쪽 노드에서 `tcpdump -i any -nn "host <상대 Pod IP>"`를 동시에 떠서 패킷이 사라지는 지점을 특정한다. → 코어 2

   </details>

3. **상황:** EKS에서 노드는 충분한데 새 Pod가 특정 노드에 더 이상 배치·시작되지 않고, VPC 서브넷 가용 IP도 줄어든다.
   **질문:** 어떤 제약을 의심하나?

   <details markdown="1"><summary>답 확인</summary>

   클라우드 네이티브 IP 방식(VPC CNI)의 제약이다. Pod가 VPC IP를 직접 쓰므로 서브넷 IP가 소진될 수 있고, 노드당 Pod 수가 인스턴스의 ENI × ENI당 IP에 묶인다(`(ENI 수 × ENI당 IP 수) − 1`, 예: m5.large는 3 × 10 − 1 = 29). Pod 수 제한은 노드의 Pod 수 설정, 인스턴스 ENI/IP 한계, 서브넷 가용 주소, IP 확보 정책이 함께 정한다. 완화책으로 prefix delegation(`ENABLE_PREFIX_DELEGATION=true`)을 쓸 수 있다. → 코어 1 (1.4)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 근본 문제: 물리 네트워크는 ( ? ) CIDR을 모른다
  ① 오버레이: Pod 패킷을 ( ? ) → 장점 / 단점(MTU, ( ? ) 비용)
  ② 네이티브 라우팅: 경로를 알림 — 방법 3: ( ? ) / 클라우드 라우트 테이블 / 동일 ( ? )
  ③ 클라우드 네이티브 IP: Pod IP = ( ? ) IP → 문제: IP ( ? ), 노드당 Pod 수
  EKS 노드당 Pod = (ENI 수 × ( ? )) − ( ? )

[코어 2] VXLAN 경로: Pod netns → ( ? ) → 루트 netns 라우팅 → ( ? ) 캡슐화(FDB로 상대 노드 IP 조회, UDP ( ? )/8472)
  → 상대 NIC 역캡슐화 → 로컬 라우팅 → veth → Pod
  BGP 경로: 라우팅 테이블 via ( ? ) dev eth0, proto ( ? ) = BGP로 학습

[코어 3] MTU 오버헤드: VXLAN ( ? ) / IPIP ( ? ) / WireGuard ( ? ) → Pod MTU 1450 / ( ? ) / 1440
  증상: ping OK, 작은 요청 OK, ( ? )·TLS 핸드셰이크 실패
  진단: ping -M ( ? ) -s (MTU − ( ? ))

[코어 4] Flannel(( ? ) 단순, 정책 ❌) / Calico(BGP, ( ? ) 포함) / Cilium(( ? ), Hubble) / Antrea(( ? ), Traceflow)
  Calico 모드 4: BGP / IPIP / VXLAN / ( ? )
```

### 2. 인출 질문

1. "물리 네트워크가 Pod CIDR을 모른다"는 말은 무슨 뜻이고, CNI는 이를 어떤 세 방식으로 푸는가?

   <details markdown="1"><summary>답 확인</summary>

   스위치·라우터가 아는 것은 노드의 실제 IP뿐이라 `10.244.0.0/16` 같은 Pod 대역으로 가는 경로가 없다는 뜻이다. 오버레이(Pod 패킷을 노드 간 패킷 속에 캡슐화), 네이티브 라우팅(물리 네트워크에 "이 Pod CIDR은 이 노드로" 경로를 알림), 클라우드 네이티브 IP(Pod가 VPC 실제 IP를 받음). → 코어 1

   </details>

2. 오버레이의 장단점과 네이티브 라우팅의 장단점을 비교하라.

   <details markdown="1"><summary>답 확인</summary>

   오버레이는 물리 네트워크 설정이 필요 없고 어디서나 동작하지만 캡슐화/역캡슐화 CPU 비용, MTU 감소, 장비가 내부 패킷을 이해하지 못해 진단이 어렵다. 네이티브 라우팅은 캡슐화 오버헤드·MTU 손실이 없고 패킷이 그대로 보여 진단이 쉽지만, 물리 네트워크가 경로를 받아들여야 하고 클라우드 라우트 테이블 항목 수 제한(AWS 기본 50)이 있다. → 코어 1 (1.2, 1.3)

   </details>

3. 교차 노드 VXLAN 패킷이 지나는 순서를 말해 보라.

   <details markdown="1"><summary>답 확인</summary>

   Pod netns에서 패킷 생성 → veth로 노드 A 루트 netns → 라우팅이 `10.244.2.0/24 → dev vxlan.calico(또는 flannel.1)` → VXLAN 인터페이스가 FDB로 노드 B의 실제 IP를 조회해 UDP(4789 또는 8472)로 캡슐화해 전송 → 노드 B NIC 수신, 역캡슐화 → 목적지로 로컬 라우팅 → veth → Pod netns. → 코어 2 (2.1)

   </details>

4. `10.244.2.0/24 via 192.168.1.11 dev eth0 proto bird`의 의미와, 이 환경의 진단이 쉬운 이유는?

   <details markdown="1"><summary>답 확인</summary>

   노드 B(`192.168.1.11`)가 담당하는 Pod CIDR로 가는 경로이며, `proto bird`는 BIRD가 BGP로 학습해 커널에 주입한 경로라는 표시다. 캡슐화가 없으므로 tcpdump로도 평범한 IP 패킷이 보여 진단이 쉽다. → 코어 2 (2.2)

   </details>

5. tcpdump 결과로 오버레이와 네이티브 라우팅을 어떻게 구분하나?

   <details markdown="1"><summary>답 확인</summary>

   네이티브 라우팅(kindnet 등)은 노드 `eth0`에서 목적지가 그대로 상대 Pod IP인 평범한 ICMP/TCP가 보인다. VXLAN 오버레이는 노드 `eth0`에서 UDP 4789(또는 8472)로 감싸진 패킷이 보이고 원본 ICMP는 `vxlan.calico` 같은 인터페이스에서만 보인다. → 코어 2 (2.4)

   </details>

6. 물리 MTU 1500에서 VXLAN/IPIP/WireGuard 오버레이의 Pod MTU는? Pod MTU를 1500으로 두면 어떻게 되나?

   <details markdown="1"><summary>답 확인</summary>

   VXLAN 1450(오버헤드 50), IPIP 1480(20), WireGuard 1440(약 60). Pod MTU 1500이면 캡슐화 후 1550바이트가 되어 물리 MTU를 넘으면서 단편화되거나 드롭된다. → 코어 3 (3.1)

   </details>

7. MTU 문제의 전형적 증상과 진단 명령은?

   <details markdown="1"><summary>답 확인</summary>

   ping·작은 HTTP는 되고 큰 응답/파일 전송이 멈추며 TLS 핸드셰이크가 실패하고 간헐적으로 느리다. `ip link show eth0`로 MTU를 확인하고 `ping -c1 -M do -s $((size-28)) <TARGET_POD_IP>`를 1500·1450·1400·1350으로 시험해 첫 성공 크기를 본다. → 코어 3 (3.2, 3.3)

   </details>

8. Calico의 네 가지 모드와 `CrossSubnet`의 의미는? Flannel을 프로덕션에서 피하는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   BGP(기본, 캡슐화 없음) / IPIP(서브넷을 넘어야 할 때) / VXLAN(BGP를 쓸 수 없을 때) / `CrossSubnet`(같은 서브넷은 직접, 다르면 캡슐화하는 절충). Flannel은 가장 단순하지만 NetworkPolicy를 지원하지 않아 프로덕션에는 부적합하다고 원천이 말한다. → 코어 4 (4.2, 4.4)

   </details>

9. AWS VPC CNI 방식의 장단점과 노드당 Pod 수 계산식은?

   <details markdown="1"><summary>답 확인</summary>

   장점은 오버레이·라우팅 설정이 필요 없고 VPC 보안 그룹·플로우 로그를 Pod에 직접 적용하며 클러스터 밖에서 Pod에 직접 접근 가능한 것. 단점은 IP 고갈과 노드당 Pod 수가 인스턴스 타입에 묶이는 것. 계산식은 `(ENI 수 × ENI당 IP 수) − 1`(m5.large: 3 × 10 − 1 = 29)이고 prefix delegation으로 완화한다. → 코어 1 (1.4)

   </details>

### 3. 기억 고리

- **C++ 유추:** 오버레이 ≈ 길이 헤더를 붙여 프레이밍한 뒤 다시 TCP 안에 싣는 이중 포장. 네이티브 라우팅 ≈ 라우터에 정적 경로 한 줄. ⚠️ 깨지는 곳: 포장 계층은 앱이 아니라 IP/UDP 계층이고 MTU(한 패킷 최대 크기)가 줄어드는 비용이 따른다. 정적 경로는 BGP 같은 프로토콜이 자동으로 광고한다.
- **비유:** 오버레이 = 소포(Pod 패킷)를 더 큰 택배 상자(VXLAN)에 넣어 배송 — 상자만큼 부피(MTU)를 차지한다. 네이티브 라우팅 = 택배사(라우터)에 "이 동네는 저 지점으로" 배송 지도를 등록. ⚠️ 비유가 깨지는 지점: 큰 상자에 담기는 건 내용물이 상자를 넘을 때 드롭되는 것이고(단편화·드롭), 배송 지도는 사람이 등록하는 대신 BGP/클라우드 API가 자동으로 만든다.
- **묶음(3의 법칙):** 해법 3(오버레이·네이티브 라우팅·클라우드 네이티브 IP) / 라우팅 경로 만드는 방법 3(BGP·클라우드 라우트·동일 L2) / 오버헤드 3(IPIP 20·VXLAN 50·WireGuard 약 60).
- **대칭·순서:** 캡슐화 ↔ 역캡슐화, 경로 6단계(veth → 루트 netns 라우팅 → 캡슐화 → 상대 NIC → 역캡슐화 → veth). 대비 쌍: 오버레이(범용·MTU 비용) ↔ 네이티브(성능·네트워크 협조 필요).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "노드 A의 Pod에서 노드 B의 Pod로 패킷이 가는 길"을 오버레이일 때와 BGP일 때로 나눠 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "ping은 되는데 큰 응답만 멈추는 이유"를 MTU와 패킷 헤더 크기 관점에서 소켓 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "온프레미스에서도 일단 오버레이(VXLAN)로 시작하는 게 안전하다" vs B "BGP 네이티브 라우팅이 성능·진단 면에서 낫다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 오버레이와 네이티브 라우팅, MTU 문제를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/13-네트워킹-모델과-CNI-스펙.md (13.4 CNI 플러그인 생태계 비교, 13.5 오버레이·BGP 실제 경로와 MTU, 실습 kind 클러스터); kubernetes-textbook-main/05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md (23.2 오버레이 vs 네이티브 라우팅, 23.3 주요 CNI 플러그인, 23.5 MTU 불일치·IP 고갈); kubernetes-qustion-book/02_심화/16_EKS의_네트워크_스토리지_확장.md (2. VPC CNI)*
