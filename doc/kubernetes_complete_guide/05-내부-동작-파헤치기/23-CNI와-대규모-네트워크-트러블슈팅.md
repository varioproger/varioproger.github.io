---
title: "23장. CNI와 대규모 네트워크 트러블슈팅"
parent: "5부. 내부 동작 파헤치기"
grand_parent: "Kubernetes Complete Guide"
nav_order: 23
---

# 23장. CNI와 대규모 네트워크 트러블슈팅

> **학습목표**
> - CNI 스펙과 플러그인 체인의 동작을 설명할 수 있다.
> - 오버레이 방식과 네이티브 라우팅 방식의 차이와 트레이드오프를 안다.
> - Calico, Cilium, Antrea의 구조를 비교할 수 있다.
> - kube-proxy가 만든 iptables 규칙을 끝까지 따라갈 수 있다.
> - 네트워크 장애를 계층별로 좁혀 진단할 수 있다.
> - MTU, conntrack 등 대규모 환경 특유의 문제를 해결할 수 있다.

---

## 들어가며

9장에서 쿠버네티스 네트워크 모델의 네 가지 요구사항을 봤다. 하지만 **누가 그것을 구현하는가**는 다루지 않았다.

19장에서 `ip netns`와 veth로 Pod에 네트워크를 붙였다. 그것을 자동으로, 클러스터 전체에 일관되게 해 주는 것이 **CNI 플러그인**이다.

이 장은 그 내부와, 잘못됐을 때 진단하는 방법을 다룬다.

## 23.1 CNI 스펙

### 단순한 계약

CNI(Container Network Interface)는 놀랍도록 단순한 스펙이다.

```
런타임(containerd)이 플러그인을 실행 파일로 호출한다
  · 환경변수로 파라미터 전달
  · stdin으로 JSON 설정 전달
  · stdout으로 JSON 결과 반환
```

**gRPC도 아니고 REST도 아니다.** 그냥 실행 파일이다.

```bash
docker exec k8s-guide-worker ls /opt/cni/bin/
```
```
bandwidth  bridge  dhcp  firewall  host-local  loopback  portmap  ptp  static  tuning  vlan
kindnet    (또는 calico, cilium-cni 등)
```

### 네 가지 동작

| 동작 | 언제 | 하는 일 |
|---|---|---|
| `ADD` | Pod 생성 시 | 네임스페이스에 인터페이스 생성, IP 할당, 라우팅 설정 |
| `DEL` | Pod 삭제 시 | 정리, IP 반환 |
| `CHECK` | 검증 시 | 설정이 유효한지 확인 |
| `VERSION` | - | 지원 버전 보고 |

**호출 방식**

```bash
CNI_COMMAND=ADD \
CNI_CONTAINERID=abc123 \
CNI_NETNS=/var/run/netns/cni-xyz \
CNI_IFNAME=eth0 \
CNI_PATH=/opt/cni/bin \
/opt/cni/bin/bridge < /etc/cni/net.d/10-bridge.conflist
```

**결과**

```json
{
  "cniVersion": "1.0.0",
  "interfaces": [{"name": "eth0", "sandbox": "/var/run/netns/cni-xyz"}],
  "ips": [{
    "address": "10.244.1.5/24",
    "gateway": "10.244.1.1",
    "interface": 0
  }],
  "routes": [{"dst": "0.0.0.0/0", "gw": "10.244.1.1"}],
  "dns": {}
}
```

**19.3절에서 손으로 한 작업이 정확히 이것이다.**

### 설정 파일

```bash
docker exec k8s-guide-worker cat /etc/cni/net.d/10-kindnet.conflist
```

```json
{
  "cniVersion": "0.3.1",
  "name": "kindnet",
  "plugins": [
    {
      "type": "ptp",
      "ipMasq": false,
      "ipam": {
        "type": "host-local",
        "dataDir": "/run/cni-ipam-state",
        "routes": [{"dst": "0.0.0.0/0"}],
        "ranges": [[{"subnet": "10.244.1.0/24"}]]
      },
      "mtu": 1500
    },
    {
      "type": "portmap",
      "capabilities": {"portMappings": true}
    }
  ]
}
```

### 플러그인 체인

**`plugins` 배열의 순서대로 호출된다.** 앞 플러그인의 결과가 뒤로 전달된다.

```
① ptp / bridge / calico     주 플러그인 — 인터페이스와 IP
        ↓ (결과 전달)
② portmap                   hostPort 매핑 (iptables DNAT)
        ↓
③ bandwidth                 대역폭 제한 (tc)
        ↓
④ firewall / tuning         추가 규칙, sysctl
```

**메타 플러그인**들이 각자 한 가지 일만 한다. 유닉스 철학과 같다.

**대역폭 제한 예시**

```yaml
metadata:
  annotations:
    kubernetes.io/ingress-bandwidth: 10M
    kubernetes.io/egress-bandwidth: 5M
```

`bandwidth` 플러그인이 이 애노테이션을 읽어 `tc` 규칙을 만든다.

### IPAM

IP 주소 관리도 플러그인이다.

| IPAM 플러그인 | 방식 |
|---|---|
| `host-local` | 노드마다 할당된 CIDR에서 로컬 파일로 관리 |
| `dhcp` | DHCP 서버에서 받음 |
| `static` | 고정 IP |
| CNI별 자체 구현 | Calico IPAM, Cilium IPAM 등 — 클러스터 전역 관리 |

```bash
# host-local의 상태 파일
docker exec k8s-guide-worker ls /run/cni-ipam-state/kindnet/
docker exec k8s-guide-worker cat /run/cni-ipam-state/kindnet/last_reserved_ip.0
```

**노드마다 Pod CIDR이 할당된다.**

```bash
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'
```
```
k8s-guide-control-plane   10.244.0.0/24
k8s-guide-worker          10.244.1.0/24
k8s-guide-worker2         10.244.2.0/24
```

`/24`면 노드당 254개 Pod까지다. `maxPods: 110`(20.1절)과 함께 노드 밀도를 결정한다.

### 누가 CNI를 호출하는가

20.4절에서 언급한 내용이다. **kubelet이 아니라 컨테이너 런타임이 호출한다.**

```
kubelet → CRI RunPodSandbox → containerd
                                  ↓
                             네트워크 네임스페이스 생성
                                  ↓
                             CNI 플러그인 실행 (ADD)
                                  ↓
                             pause 컨테이너 시작
```

그래서 CNI 문제는 **containerd 로그**에 나타난다.

```bash
docker exec k8s-guide-worker journalctl -u containerd -n 50 --no-pager | grep -i cni
```

## 23.2 오버레이 vs 네이티브 라우팅

### 근본 문제

노드 A의 Pod(10.244.1.5)가 노드 B의 Pod(10.244.2.7)에 패킷을 보낸다. **물리 네트워크는 10.244.0.0/16을 모른다.** 어떻게 전달할까?

### 방식 1: 오버레이 (캡슐화)

Pod 패킷을 노드 간 패킷 안에 넣어 보낸다.

```
┌─────────────────────────────────────────────────┐
│ 외부 IP 헤더  (노드A IP → 노드B IP)               │
│ ┌─────────────────────────────────────────────┐ │
│ │ VXLAN/IPIP 헤더                              │ │
│ │ ┌─────────────────────────────────────────┐ │ │
│ │ │ 내부 IP 헤더 (Pod A IP → Pod B IP)       │ │ │
│ │ │ 페이로드                                  │ │ │
│ │ └─────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

| 프로토콜 | 오버헤드 | 특징 |
|---|---|---|
| **VXLAN** | 50 bytes | UDP 캡슐화, 가장 널리 쓰임 |
| **IPIP** | 20 bytes | IP-in-IP, 더 가벼움 |
| **Geneve** | 가변 | 확장 가능한 메타데이터 |
| **WireGuard** | ~60 bytes | 암호화 포함 |

**장점**
- 물리 네트워크에 아무 설정도 필요 없다
- 어디서나 동작한다 (온프레미스, 클라우드, 하이브리드)

**단점**
- 캡슐화/역캡슐화 CPU 비용
- **MTU가 줄어든다** (23.5절에서 상세히)
- 패킷을 물리 네트워크 장비가 이해하지 못해 문제 진단이 어렵다

### 방식 2: 네이티브 라우팅

물리 네트워크에 **Pod CIDR로 가는 경로를 알려 준다.**

```
라우터/스위치의 라우팅 테이블:
  10.244.1.0/24 → 192.168.1.10 (노드 A)
  10.244.2.0/24 → 192.168.1.11 (노드 B)
```

**구현 방법**

| 방법 | 설명 |
|---|---|
| **BGP** | Calico가 라우터와 BGP 피어링해 경로를 광고 |
| **클라우드 라우트 테이블** | GKE/EKS가 VPC 라우트 테이블에 항목 추가 |
| **동일 L2 세그먼트** | 모든 노드가 같은 서브넷이면 직접 라우팅 |

**장점**
- **캡슐화 오버헤드 없음** — 성능이 좋다
- MTU 문제 없음
- 패킷을 그대로 볼 수 있어 진단이 쉽다

**단점**
- 물리 네트워크 설정이 필요하다
- 클라우드에서는 라우트 테이블 항목 수 제한이 있다 (AWS: 기본 50)

### 방식 3: 네이티브 IP (클라우드 통합)

Pod가 **VPC의 실제 IP를 받는다.**

```
AWS VPC CNI:  Pod IP = VPC 서브넷의 ENI 보조 IP
Azure CNI:    Pod IP = VNet의 IP
GKE:          Pod IP = VPC의 별칭 IP 범위
```

**장점**
- 오버레이도 라우팅 설정도 필요 없다
- VPC 보안 그룹, 플로우 로그를 Pod에 직접 적용
- 클러스터 외부에서 Pod에 직접 접근 가능

**단점**
- **IP 고갈**이 심각한 문제가 된다
- 노드당 Pod 수가 인스턴스 타입에 묶인다 (ENI 개수 × IP 개수)

```bash
# EKS에서 노드당 최대 Pod 수 계산
# (ENI 수 × ENI당 IP 수) - 1
# m5.large: 3 × 10 - 1 = 29
```

**IP 접두사 위임(prefix delegation)** 으로 완화할 수 있다.

### 선택 가이드

```
물리 네트워크를 제어할 수 있는가?
├─ 예 → 네이티브 라우팅 (BGP)          성능 최선
└─ 아니오
    └─ 클라우드인가?
        ├─ 예 → 클라우드 CNI 또는 클라우드 라우트
        │        IP 여유가 없다면 → 오버레이
        └─ 아니오 → 오버레이 (VXLAN)   가장 범용적
```

## 23.3 주요 CNI 플러그인

### Calico

**구조**

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

**모드**

| 모드 | 캡슐화 | 언제 |
|---|---|---|
| BGP (기본) | 없음 | 같은 L2, 또는 BGP 가능한 네트워크 |
| IPIP | IP-in-IP | 서브넷을 넘어야 할 때 |
| VXLAN | VXLAN | BGP를 쓸 수 없을 때 |
| `CrossSubnet` | 조건부 | 같은 서브넷은 직접, 다르면 캡슐화 ★ |

`CrossSubnet`이 실용적이다. 성능과 범용성을 절충한다.

**강점**: 성숙한 NetworkPolicy 구현, `GlobalNetworkPolicy`(클러스터 전역), 거부 규칙과 우선순위 지원(18.4절).

```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: deny-metadata
spec:
  order: 100
  selector: all()
  types: [Egress]
  egress:
    - action: Deny
      destination:
        nets: [169.254.169.254/32]
    - action: Allow
```

**18.1절의 메타데이터 차단을 클러스터 전역에 한 번에 적용**할 수 있다.

### Cilium

**eBPF 기반**이라는 점이 근본적으로 다르다.

```
전통적 방식:  패킷 → netfilter/iptables 체인 순회 → 결정
Cilium:      패킷 → eBPF 프로그램 (커널 내 실행) → 결정
```

**주요 기능**

| 기능 | 설명 |
|---|---|
| **kube-proxy 대체** | iptables 없이 eBPF로 서비스 로드밸런싱 (9.5절) |
| **L7 정책** | HTTP 메서드/경로, gRPC, Kafka 수준 필터링 |
| **FQDN 정책** | `toFQDNs`로 도메인 기반 egress 제어 |
| **Hubble** | 네트워크 흐름 관측성 (UI 포함) |
| **클러스터 메시** | 여러 클러스터 간 서비스 연결 |
| **투명 암호화** | WireGuard 또는 IPsec |
| **대역폭 관리** | EDT 기반 |

```bash
# kube-proxy 없이 설치
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=<API_SERVER_IP> \
  --set k8sServicePort=6443
```

```bash
# 흐름 관측
cilium hubble port-forward &
hubble observe --namespace production -f
hubble observe --verdict DROPPED
```

**`hubble observe --verdict DROPPED`가 NetworkPolicy 디버깅에 매우 유용하다.** 어떤 정책이 어떤 패킷을 떨궜는지 바로 보인다.

**대규모 클러스터에서 iptables의 O(n) 문제**(9.5절)를 근본적으로 해결하므로, 서비스가 수천 개인 환경에서 채택이 늘고 있다.

### Antrea

Open vSwitch(OVS) 기반이다.

```
┌──────────── 각 노드 ────────────┐
│  antrea-agent                   │
│  └── OVS 브리지 (br-int)         │
│      · OpenFlow 규칙으로 포워딩   │
│      · 정책도 OpenFlow로 구현     │
└─────────────────────────────────┘
```

**강점**
- **Windows 노드 지원**이 뛰어나다
- OVS 생태계의 성숙한 도구 활용
- Traceflow — 패킷 경로 추적 기능

```yaml
apiVersion: crd.antrea.io/v1beta1
kind: Traceflow
spec:
  source: { namespace: default, pod: client }
  destination: { namespace: default, pod: server }
  packet:
    ipHeader: { protocol: 6 }
    transportHeader:
      tcp: { dstPort: 80 }
```

**패킷이 어느 홀에서 떨어졌는지 정확히 보여 준다.**

### 비교표

| | Calico | Cilium | Antrea | Flannel |
|---|---|---|---|---|
| 데이터 플레인 | iptables / eBPF | **eBPF** | OVS | iptables |
| NetworkPolicy | ✅ 확장 | ✅ L7까지 | ✅ 확장 | ❌ |
| kube-proxy 대체 | 부분 | ✅ | 부분 | ❌ |
| 관측성 | 보통 | **Hubble** | Traceflow | 낮음 |
| Windows | ✅ | 제한적 | ✅ | ✅ |
| 암호화 | WireGuard | WireGuard/IPsec | IPsec/WireGuard | ❌ |
| 복잡도 | 중간 | 높음 | 중간 | **낮음** |
| 커널 요구 | 낮음 | **4.19+ 권장** | 낮음 | 낮음 |

**선택 기준**
- **단순함 우선, 정책 불필요** → Flannel (하지만 NetworkPolicy가 없어 프로덕션 부적합)
- **표준적이고 안정적** → Calico
- **성능과 관측성, 대규모** → Cilium
- **Windows 혼합, OVS 경험** → Antrea

## 23.4 kube-proxy iptables 해부

9.5절에서 개념을 봤다. 여기서는 **끝까지 따라간다.**

### 체인 구조

```bash
docker exec -it k8s-guide-worker bash
iptables -t nat -L -n --line-numbers | head -40
```

```
PREROUTING (외부에서 들어오는 패킷)
   └→ KUBE-SERVICES
OUTPUT (로컬에서 나가는 패킷)
   └→ KUBE-SERVICES
        │
        ├→ KUBE-SVC-XXXXX  (서비스별)
        │     ├→ KUBE-SEP-AAAAA  (엔드포인트별) → DNAT
        │     ├→ KUBE-SEP-BBBBB
        │     └→ KUBE-SEP-CCCCC
        │
        ├→ KUBE-NODEPORTS  (NodePort용)
        └→ KUBE-MARK-MASQ  (SNAT 표시)
```

### 단계별 추적

**① 서비스 생성**

```bash
kubectl create deployment trace --image=hashicorp/http-echo:1.0 --replicas=3 \
  -- /http-echo -text=hello -listen=:5678
kubectl expose deployment trace --port=80 --target-port=5678
kubectl get svc trace
# CLUSTER-IP: 10.96.x.y
```

**② KUBE-SERVICES에서 찾기**

```bash
SVC_IP=$(kubectl get svc trace -o jsonpath='{.spec.clusterIP}')
docker exec k8s-guide-worker iptables -t nat -S KUBE-SERVICES | grep $SVC_IP
```
```
-A KUBE-SERVICES -d 10.96.142.88/32 -p tcp -m comment --comment "default/trace cluster IP"
   -m tcp --dport 80 -j KUBE-SVC-ABCDEFGHIJKLMNOP
```

**③ 서비스 체인 들여다보기**

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-SVC-ABCDEFGHIJKLMNOP
```
```
-A KUBE-SVC-ABCD -m comment --comment "default/trace -> 10.244.1.5:5678"
   -m statistic --mode random --probability 0.33333333349 -j KUBE-SEP-1111
-A KUBE-SVC-ABCD -m comment --comment "default/trace -> 10.244.2.6:5678"
   -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-2222
-A KUBE-SVC-ABCD -m comment --comment "default/trace -> 10.244.1.7:5678"
   -j KUBE-SEP-3333
```

**확률 계산 검증**

```
첫 규칙:  1/3 = 0.333  → 33.3%가 SEP-1111
둘째 규칙: 남은 2/3 중 1/2 = 0.5 → 66.7% × 50% = 33.3%
셋째 규칙: 나머지 33.3%
```

**엔드포인트 수가 N이면 i번째 확률은 `1/(N-i+1)`이다.**

**④ 엔드포인트 체인 — 실제 DNAT**

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-SEP-1111
```
```
-A KUBE-SEP-1111 -s 10.244.1.5/32 -j KUBE-MARK-MASQ      ← 헤어핀 대응
-A KUBE-SEP-1111 -p tcp -m tcp -j DNAT --to-destination 10.244.1.5:5678
```

**목적지가 바뀐다.** `10.96.142.88:80` → `10.244.1.5:5678`

**첫 번째 규칙은 헤어핀(hairpin) 처리다.** Pod가 자기 자신이 속한 Service를 호출할 때, SNAT를 하지 않으면 응답이 돌아오지 않는다. 그래서 마스커레이드 표시를 한다.

**⑤ SNAT**

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-POSTROUTING
```
```
-A KUBE-POSTROUTING -m mark ! --mark 0x4000/0x4000 -j RETURN
-A KUBE-POSTROUTING -j MARK --xor-mark 0x4000
-A KUBE-POSTROUTING -j MASQUERADE --random-fully
```

`0x4000` 마크가 붙은 패킷만 SNAT된다. 9.2절의 `externalTrafficPolicy: Cluster`에서 클라이언트 IP가 사라지는 이유다.

**⑥ 스케일 변화 추적**

```bash
docker exec k8s-guide-worker iptables -t nat -S | grep -c KUBE-SEP
kubectl scale deployment trace --replicas=6
sleep 5
docker exec k8s-guide-worker iptables -t nat -S | grep -c KUBE-SEP
```

**규칙 수가 늘어난 것을 확인할 수 있다.**

```bash
kubectl delete deployment trace
kubectl delete svc trace
```

### conntrack

DNAT된 연결은 커널의 **연결 추적 테이블**에 기록된다.

```bash
docker exec k8s-guide-worker conntrack -L 2>/dev/null | head
docker exec k8s-guide-worker conntrack -C          # 현재 엔트리 수
docker exec k8s-guide-worker sysctl net.netfilter.nf_conntrack_max
```

**응답 패킷은 이 테이블을 보고 역변환된다.**

```
요청: 10.244.1.9:34567 → 10.96.142.88:80  [DNAT] → 10.244.1.5:5678
응답: 10.244.1.5:5678 → 10.244.1.9:34567  [역변환] → 10.96.142.88:80
```

**conntrack 테이블이 가득 차면 새 연결이 거부된다.**

```bash
dmesg | grep -i "nf_conntrack: table full"
```

```bash
# 튜닝
sysctl -w net.netfilter.nf_conntrack_max=1048576
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=3600
```

10.5절에서 본 **DNS 5초 지연**도 conntrack의 UDP 경쟁 조건 때문이었다.

## 23.5 대규모 환경 특유의 문제

### MTU 불일치 — 가장 악명 높은 문제

**증상이 특이하다.**

```
· ping은 잘 된다
· 작은 HTTP 요청도 잘 된다
· 큰 응답이나 파일 전송에서 멈춘다
· TLS 핸드셰이크가 실패한다
· "간헐적으로" 느리다
```

**원인**

```
물리 네트워크 MTU: 1500
VXLAN 오버헤드:    -50
Pod 인터페이스 MTU: 1450 이어야 한다

만약 Pod MTU가 1500으로 설정되어 있으면:
  1500바이트 패킷 → VXLAN 캡슐화 → 1550바이트
  → 물리 MTU 초과 → 단편화 또는 드롭
```

**진단**

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

**MTU 계산표**

| 환경 | 물리 MTU | 오버헤드 | Pod MTU |
|---|---|---|---|
| 일반 이더넷 + VXLAN | 1500 | 50 | **1450** |
| 일반 이더넷 + IPIP | 1500 | 20 | **1480** |
| 일반 이더넷 + WireGuard | 1500 | 60 | **1440** |
| AWS (점보 프레임) | 9001 | 50 | 8951 |
| GCP | 1460 | 50 | 1410 |

**설정**

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

> **⚠️ 클라우드 VPC 피어링과 VPN**
> VPC 피어링이나 VPN을 거치면 MTU가 더 줄어든다. 온프레미스 연결이 있는 클러스터에서 **일부 대상만 통신이 안 되는** 증상이 나오면 MTU를 의심한다.

### IP 고갈

```bash
# 노드당 Pod CIDR 크기 확인
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'

# 클러스터 전체 Pod CIDR
docker exec k8s-guide-control-plane grep cluster-cidr \
  /etc/kubernetes/manifests/kube-controller-manager.yaml
```

**계산**

```
클러스터 CIDR: 10.244.0.0/16  → 65,536개 IP
노드당 CIDR:   /24            → 254개 (실제로는 maxPods 110에 제한)
최대 노드 수:   2^(24-16) = 256개
```

**노드가 256개를 넘으면 IP를 할당할 수 없다.** 클러스터 생성 시점에 규모를 예측해야 한다.

**AWS VPC CNI의 IP 고갈**은 다른 문제다. VPC 서브넷의 IP를 직접 쓰므로 서브넷이 작으면 금방 소진된다.

```bash
# 접두사 위임으로 완화
kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true
```

### iptables 규칙 폭증

```bash
docker exec k8s-guide-worker iptables -t nat -S | wc -l
```

```
서비스 1,000개 × 엔드포인트 평균 10개
→ 규칙 수 ≈ 1,000 × (2 + 10 × 2) = 22,000

서비스 5,000개면 10만 개를 넘는다
```

**증상**
- 서비스 변경 반영이 수 초~수십 초 지연
- kube-proxy CPU 사용률 상승
- `iptables-restore` 실행 시간 증가

**대책**
1. **IPVS 모드**로 전환 (9.5절) — O(1) 해시
2. **Cilium의 kube-proxy 대체** — eBPF
3. 서비스 수 자체를 줄이기 (헤드리스 서비스 활용)

```bash
# kube-proxy 동기화 시간 확인
kubectl get --raw /metrics 2>/dev/null | grep kubeproxy_sync_proxy_rules_duration
```

### conntrack 고갈

```bash
docker exec k8s-guide-worker sh -c \
  'echo "current: $(conntrack -C), max: $(sysctl -n net.netfilter.nf_conntrack_max)"'
```

**80%를 넘으면 위험하다.** 새 연결이 거부되기 시작한다.

**원인**
- 짧은 연결이 매우 많은 워크로드
- 타임아웃이 긴 UDP 연결
- 연결 누수

**대책**
```bash
sysctl -w net.netfilter.nf_conntrack_max=2097152
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_time_wait=30
sysctl -w net.netfilter.nf_conntrack_udp_timeout=30
```

Cilium의 eBPF 데이터 플레인은 자체 연결 추적을 쓰므로 이 문제에서 자유롭다.

## 23.6 진단 플로차트

### 계층별로 좁히기

```
Pod A → Pod B 통신 실패
   │
   ├─ ① 같은 Pod 안인가? (localhost)
   │    → 포트 충돌 확인 (5.4절)
   │
   ├─ ② 같은 노드의 다른 Pod인가?
   │    → CNI 로컬 브리지/veth 문제
   │    → ip a, ip route (Pod 네임스페이스 안에서)
   │
   ├─ ③ 다른 노드의 Pod인가?
   │    → 노드 간 라우팅, 오버레이, MTU
   │    → tcpdump로 양쪽 노드에서 확인
   │
   ├─ ④ Service를 통하는가?
   │    → 엔드포인트 존재 확인 (9.7절)
   │    → iptables/IPVS 규칙 확인
   │
   ├─ ⑤ DNS 이름을 쓰는가?
   │    → 10.6절의 DNS 진단
   │
   └─ ⑥ NetworkPolicy가 있는가?
        → 정책 확인, Hubble/Calico 로그
```

### 단계별 명령

**Pod IP로 직접**

```bash
POD_B_IP=$(kubectl get pod pod-b -o jsonpath='{.status.podIP}')
kubectl exec pod-a -- curl -sS --max-time 3 http://$POD_B_IP:8080
```

성공하면 → CNI는 정상. Service나 DNS 문제(9장, 10장).
실패하면 → CNI 또는 NetworkPolicy 문제.

**Pod의 네트워크 설정 확인**

```bash
kubectl exec pod-a -- ip addr
kubectl exec pod-a -- ip route
kubectl exec pod-a -- cat /etc/resolv.conf
```

**노드에서 Pod 인터페이스 찾기**

```bash
docker exec k8s-guide-worker bash -c '
PID=$(crictl inspect $(crictl ps -q --name <container-name>) | jq -r .info.pid)
nsenter -t $PID -n ip addr
nsenter -t $PID -n ip route
'
```

**노드 간 경로 확인**

```bash
# 라우팅 테이블
docker exec k8s-guide-worker ip route | grep 10.244

# 오버레이 인터페이스
docker exec k8s-guide-worker ip -d link show | grep -A2 -E 'vxlan|ipip|flannel'

# ARP/이웃 테이블
docker exec k8s-guide-worker ip neigh
```

**패킷 캡처**

```bash
# 노드에서 특정 Pod IP 트래픽
docker exec k8s-guide-worker tcpdump -i any -nn "host 10.244.2.7" -c 20

# 오버레이 내부 패킷
docker exec k8s-guide-worker tcpdump -i any -nn "udp port 8472" -c 10   # VXLAN

# Pod 네임스페이스 안에서
kubectl debug pod-a -it --image=nicolaka/netshoot --target=app -- tcpdump -i eth0 -nn
```

**양쪽 노드에서 동시에 캡처하면** 어디서 패킷이 사라지는지 정확히 알 수 있다.

### Sonobuoy — 클러스터 적합성 검증

네트워크뿐 아니라 클러스터 전체가 정상인지 표준 테스트로 검증한다.

```bash
sonobuoy run --mode=quick --wait
sonobuoy retrieve -f results.tar.gz
sonobuoy results results.tar.gz
```

**전체 conformance 테스트**는 몇 시간이 걸리지만, 클러스터가 CNCF 표준을 만족하는지 확인할 수 있다. 새 클러스터를 구축했거나 CNI를 교체한 뒤 실행하면 좋다.

```bash
# 네트워크 관련 테스트만
sonobuoy run --e2e-focus="\[sig-network\].*Conformance" --wait
```

### 증상별 원인표

| 증상 | 유력 원인 | 확인 |
|---|---|---|
| 같은 노드는 되고 다른 노드는 안 됨 | 오버레이/라우팅, MTU | `ip route`, tcpdump |
| ping은 되는데 큰 전송이 안 됨 | **MTU** | `ping -M do -s` |
| 간헐적 타임아웃 | conntrack 고갈, MTU | `conntrack -C`, `dmesg` |
| DNS만 안 됨 | CoreDNS, NetworkPolicy | 10.6절 |
| 정책 적용 후 전부 안 됨 | **DNS 예외 누락** | 18.4절 |
| Pod가 `ContainerCreating`에서 멈춤 | CNI 플러그인 실패 | containerd 로그, `/etc/cni/net.d` |
| Pod에 IP가 없음 | IPAM 고갈, CNI 설정 | `describe pod` 이벤트 |
| 서비스는 되는데 특정 Pod만 안 됨 | 그 Pod의 readiness | 9.7절 |
| 외부에서만 안 됨 | SNAT, 방화벽, LB 헬스체크 | `externalTrafficPolicy` |
| 노드 재부팅 후 안 됨 | iptables 규칙 유실, CNI 상태 | kube-proxy/CNI Pod 재시작 |

---

## 실습 과제

**과제 1 — CNI 플러그인 직접 호출**
19장에서 만든 네트워크 네임스페이스에 CNI 플러그인을 직접 실행해 인터페이스를 붙여 본다.
```bash
CNI_COMMAND=ADD CNI_CONTAINERID=test CNI_NETNS=/var/run/netns/pod-lab \
CNI_IFNAME=eth0 CNI_PATH=/opt/cni/bin \
/opt/cni/bin/ptp < /etc/cni/net.d/10-kindnet.conflist
```
반환된 JSON을 확인하고 `DEL`로 정리한다.

**과제 2 — iptables 규칙 끝까지 추적**
Service를 하나 만들고 `KUBE-SERVICES`부터 최종 DNAT까지 모든 체인을 따라가 그림으로 그린다. 엔드포인트를 3개, 5개, 7개로 바꿔 가며 확률 값이 어떻게 계산되는지 검증한다.

**과제 3 — MTU 문제 재현**
Pod의 MTU를 인위적으로 1500으로 설정하고(오버레이 환경에서), 큰 파일 전송이 실패하는 것을 확인한다.
```bash
kubectl exec pod-a -- ip link set eth0 mtu 1500
kubectl exec pod-a -- curl -o /dev/null http://pod-b:8080/large-file
```
`ping -M do`로 실제 가능한 MTU를 찾아 원인을 특정한다.

**과제 4 — Cilium Hubble로 정책 디버깅**
Cilium이 설치된 클러스터에서 NetworkPolicy를 적용하고, `hubble observe --verdict DROPPED`로 어떤 패킷이 왜 차단되는지 관찰한다. 정책을 수정하며 흐름이 어떻게 바뀌는지 본다.

**과제 5 — conntrack 관찰**
부하 도구로 짧은 연결을 대량 생성하며 `conntrack -C` 값을 모니터링한다. `nf_conntrack_max`에 가까워지면 어떤 에러가 나는지 확인한다.

---

## 요약

- **CNI는 실행 파일 기반의 단순한 계약**이다. 런타임이 환경변수와 stdin JSON으로 플러그인을 호출하고, `ADD`/`DEL`/`CHECK`/`VERSION` 네 동작을 지원한다. **kubelet이 아니라 컨테이너 런타임이 호출한다.**
- 플러그인은 **체인**으로 구성되며, 주 플러그인(인터페이스+IP) 뒤에 portmap, bandwidth 같은 메타 플러그인이 이어진다.
- 노드 간 Pod 통신 방식은 셋이다. **오버레이**(캡슐화, 범용적이지만 MTU와 CPU 비용), **네이티브 라우팅**(BGP나 클라우드 라우트, 성능 최선), **네이티브 IP**(클라우드 CNI, IP 고갈 위험).
- **Calico**는 성숙한 정책과 `GlobalNetworkPolicy`, **Cilium**은 eBPF 기반의 성능·L7 정책·Hubble 관측성, **Antrea**는 OVS와 Windows 지원이 강점이다.
- kube-proxy의 iptables는 `KUBE-SERVICES → KUBE-SVC-* → KUBE-SEP-*` 순으로 이어지고, **확률 기반 분배**(i번째 규칙의 확률은 `1/(N-i+1)`)로 로드밸런싱한다. 최종 DNAT가 ClusterIP를 Pod IP로 바꾼다.
- **MTU 불일치가 가장 진단하기 어려운 문제다.** ping은 되는데 큰 전송이 실패하는 증상이면 `ping -M do -s`로 실제 MTU를 찾는다. VXLAN은 50바이트, IPIP는 20바이트를 뺀다.
- 대규모 환경의 세 가지 벽: **IP 고갈**(클러스터 CIDR 설계), **iptables 규칙 폭증**(IPVS나 eBPF로 전환), **conntrack 고갈**(sysctl 튜닝).
- 진단은 **같은 Pod → 같은 노드 → 다른 노드 → Service → DNS → NetworkPolicy** 순으로 좁힌다. 양쪽 노드에서 동시에 tcpdump를 뜨면 패킷이 사라지는 지점을 특정할 수 있다.

**5부를 마치며** — 이제 쿠버네티스가 "어떻게" 동작하는지 밑바닥까지 봤다. Pod는 리눅스 프리미티브의 조합이고(19장), kubelet이 그것을 만들고(20장), 컨트롤러들이 조정 루프를 돌리고(21장), etcd가 상태를 지키고(22장), CNI가 네트워크를 잇는다(23장).

6부에서는 이 구조를 **확장한다.** 쿠버네티스 API를 프로그래밍하고, 커스텀 리소스를 정의하고, 나만의 컨트롤러를 만든다. 21장에서 본 컨트롤러 패턴을 직접 구현하게 된다.

---

**참고 원서**: *Core Kubernetes* 5장, 6장
