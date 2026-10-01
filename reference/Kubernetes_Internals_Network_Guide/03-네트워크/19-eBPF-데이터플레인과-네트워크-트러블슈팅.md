---
title: "19장. eBPF 데이터플레인과 대규모 네트워크 트러블슈팅"
---

# 19장. eBPF 데이터플레인과 대규모 네트워크 트러블슈팅

> **학습목표**
> - eBPF가 무엇이고, XDP와 TC 훅이 패킷 처리 파이프라인의 어느 지점에서 동작하는지 설명할 수 있다.
> - Cilium이 BPF 맵과 소켓 레벨 로드밸런싱으로 kube-proxy의 iptables 경로를 어떻게 대체하는지 설명할 수 있다.
> - "Pod A가 Pod B/Service C에 닿지 않는다"는 문제를 계층별로 좁혀 가는 진단 플로차트를 적용할 수 있다.
> - `kubectl debug`와 `tcpdump`로 Pod 네트워크 네임스페이스의 패킷을 직접 캡처할 수 있다.
> - Hubble로 패킷 캡처 없이 흐름(flow) 단위 관측을 수행할 수 있다.
> - conntrack 테이블 크기, BPF 프로그램 복잡도 예산 같은 대규모 클러스터 특유의 병목을 인지한다.

---

## 들어가며

이 장은 3부의 마지막이자 이 책 전체의 마지막 장이다. 13장에서 CNI가 Pod 네트워크를 어떻게 조립하는지, 14~15장에서 Service가 EndpointSlice와 kube-proxy를 거쳐 실제 패킷 경로로 번역되는지, 16장에서 DNS가 그 위에서 서비스 디스커버리를 제공하는지, 17~18장에서 L7 라우팅과 NetworkPolicy가 어떻게 얹히는지를 봤다. 이 모든 것에 공통으로 등장한 이름이 하나 있다 — **kube-proxy의 iptables 체인**이다.

이 장은 그 iptables 체인을 근본적으로 다시 구현하는 기술, **eBPF**를 정면으로 다룬다. 그리고 마지막 절에서는 지금까지 배운 모든 계층(DNS, CNI, Service, NetworkPolicy)을 하나의 진단 절차로 꿰어, 실제 장애 상황에서 어디부터 봐야 하는지를 정리한다. 이 장을 다 읽고 나면 "Pod A가 Pod B에 닿지 않는다"는 질문 앞에서 더 이상 막막하지 않아야 한다.

## 19.1 eBPF 개요와 XDP/TC 훅

### eBPF란 무엇인가

**eBPF(extended Berkeley Packet Filter)**는 커널을 재컴파일하거나 커널 모듈을 적재하지 않고도, **검증된(verified) 프로그램을 커널이 정의한 훅 지점에서 실행**할 수 있게 하는 기술이다. 세 가지가 핵심이다.

```
① 검증(verification)
   프로그램을 커널에 적재하기 전 verifier가 정적 분석한다.
   무한 루프 금지, 메모리 접근 범위 검증, 스택 크기 제한 등을
   통과해야만 적재가 허용된다. → 커널을 크래시시킬 수 없다는 보장

② 샌드박스 실행
   프로그램은 커널 메모리를 임의로 조작할 수 없고,
   BPF 맵이라는 정의된 통로로만 상태를 주고받는다

③ JIT 컴파일
   바이트코드가 네이티브 머신 코드로 JIT 컴파일되어 실행되므로
   인터프리터 오버헤드가 거의 없다
```

**커널 모듈이 필요 없다**는 점이 결정적이다. CNI가 커스텀 커널 모듈을 요구했다면 커널 버전마다 재빌드하고, 모듈 버그가 커널 전체를 패닉시킬 위험을 감수해야 했을 것이다. eBPF는 검증 단계가 이 위험을 구조적으로 차단하면서도, 커널 내부 깊숙한 지점(패킷이 도착하는 순간, 소켓 시스템콜이 호출되는 순간)에 로직을 심을 수 있게 한다.

### XDP 훅 — 가장 이른 지점

```
NIC (네트워크 카드)
   │
   │ 패킷 도착
   ▼
┌─────────────────────────┐
│  XDP (eXpress Data Path) │  ★ NIC 드라이버 직후, 가장 이른 훅
│  · 아직 sk_buff(커널의    │
│    패킷 구조체)도         │
│    할당되지 않은 시점     │
│  · 여기서 DROP하면        │
│    그 이후의 어떤 커널     │
│    처리 비용도 들지 않는다 │
└──────────┬───────────────┘
           ▼ (PASS 결정 시)
      sk_buff 할당, 네트워킹 스택 진입
           ▼
┌─────────────────────────┐
│  TC (Traffic Control) 훅  │  ★ 좀 더 늦은 지점
│  · sk_buff가 이미 있어    │
│    더 많은 컨텍스트 참조 가능│
│  · ingress/egress 양쪽에  │
│    부착 가능              │
│  · Cilium 데이터플레인     │
│    로직 대부분이 여기 위치  │
└──────────┬───────────────┘
           ▼
   일반적인 커널 네트워킹 스택
   (라우팅, netfilter/iptables, ...)
```

**XDP**는 NIC 드라이버가 패킷을 받은 직후, 커널이 그 패킷을 위한 `sk_buff`(패킷을 표현하는 커널 자료구조)조차 만들기 전에 실행된다. 그래서 "이 패킷은 버려야 한다"는 결정을 XDP에서 내리면 그 이후의 어떤 커널 처리 비용도 전혀 들지 않는다 — DDoS 방어나 초고속 패킷 드롭에 XDP가 선호되는 이유다. 다만 이 시점에는 아직 컨텍스트가 빈약해서(예: 소켓 정보, 상위 연결 상태를 알기 어렵다) 복잡한 로직을 짜기 어렵다.

**TC 훅**은 그보다 늦은 지점으로, `sk_buff`가 이미 존재하므로 더 풍부한 컨텍스트에 접근할 수 있다. Cilium의 핵심 데이터플레인 로직(서비스 로드밸런싱, 정책 시행, 캡슐화/역캡슐화)은 대부분 TC 훅에서 이뤄진다. **XDP는 "얼마나 빨리 버리거나 리다이렉트할 수 있는가"에 최적화되어 있고, TC는 "얼마나 많은 것을 할 수 있는가"에 최적화되어 있다.**

### 왜 iptables보다 유리한가

15장에서 본 iptables 기반 kube-proxy의 근본 문제를 다시 떠올려 보자. Service 하나당 여러 체인이 생기고, 패킷은 **그 체인들을 순서대로 순회**하며 규칙과 비교된다. Service가 수천 개면 순회해야 할 규칙도 수천 개 단위로 늘어난다.

```
iptables 방식 (15장)
  패킷 도착 → PREROUTING → KUBE-SERVICES 체인
            → (서비스 개수만큼의 점프 규칙을 순서대로 비교)
            → 매칭되는 서비스를 찾을 때까지 순회
            → KUBE-SVC-XXX → KUBE-SEP-YYY (확률적 분산)
            → DNAT 적용

eBPF 방식 (Cilium)
  패킷 도착 → TC 훅에서 BPF 프로그램 실행
            → 목적지 IP:포트를 키로 BPF 맵(해시 테이블)을 룩업
            → O(1)에 가까운 조회로 곧바로 백엔드 확정
            → 리다이렉트/DNAT 적용
```

**체인을 순회하는 것과 해시 맵을 한 번 조회하는 것의 차이**가 서비스 수천 개 규모에서 실질적인 지연 차이로 드러난다. 18.2절에서 본 NetworkPolicy 시행의 iptables 대 eBPF 대비와 정확히 같은 원리가 Service 라우팅에도 적용된다.

## 19.2 Cilium 내부 아키텍처

### BPF 맵 — 유저스페이스와 커널스페이스가 상태를 공유하는 통로

Cilium은 두 개의 실행 컨텍스트로 나뉜다. **유저스페이스의 `cilium-agent`**(각 노드에서 DaemonSet으로 실행)와 **커널스페이스의 BPF 프로그램**이다. 이 둘은 직접 메모리를 공유하지 않고, **BPF 맵**이라는 커널이 관리하는 키-값 자료구조를 통해서만 상태를 주고받는다.

```
┌───────────────────────────────────────────────────┐
│  유저스페이스                                        │
│  ┌───────────────┐                                 │
│  │ cilium-agent   │  · API 서버 watch (Pod, Service, │
│  │ (Go 프로세스)   │    EndpointSlice, CiliumNetworkPolicy)│
│  │                │  · BPF 프로그램 컴파일 및 적재      │
│  │                │  · BPF 맵 갱신                    │
│  └───────┬────────┘                                 │
│          │ 맵 쓰기/읽기 (bpf() 시스템콜)                │
└──────────┼──────────────────────────────────────────┘
           ▼
┌───────────────────────────────────────────────────┐
│  커널스페이스 — BPF 맵                                 │
│  ┌────────────────┐  ┌───────────────────────┐     │
│  │ endpoint map    │  │ service/backend map    │     │
│  │ Pod IP → 메타데이터│  │ ClusterIP:Port →        │     │
│  │ (정책 결정에 사용) │  │   [Pod IP:Port, ...]    │     │
│  └────────────────┘  └───────────────────────┘     │
│          ▲                       ▲                  │
│          │ 룩업                   │ 룩업              │
│  ┌───────┴───────────────────────┴──────┐            │
│  │  TC/XDP 훅의 BPF 프로그램               │            │
│  │  (패킷마다 실행, 맵을 참조해 결정)         │            │
│  └────────────────────────────────────┘            │
└───────────────────────────────────────────────────┘
```

`cilium-agent`가 API 서버를 watch하다가 Service나 EndpointSlice가 바뀌면(14장) BPF 맵을 갱신한다. 실제 패킷을 처리하는 것은 커널 안의 BPF 프로그램이며, 이 프로그램은 매 패킷마다 맵을 조회할 뿐 유저스페이스로 패킷을 올릴 필요가 없다. **에이전트가 죽어도(재시작 중이어도) 이미 적재된 BPF 프로그램과 맵은 커널에 남아 계속 트래픽을 처리한다** — 데이터플레인과 컨트롤플레인이 분리되어 있다는 뜻이다.

### 소켓 레벨 로드밸런싱 — DNAT/conntrack이 아예 없다

15장에서 본 iptables 기반 kube-proxy의 서비스 라우팅은 **패킷이 만들어진 뒤** DNAT으로 목적지를 바꾸고, 그 변환을 conntrack 테이블에 기록해 반환 패킷을 역변환한다. 이 과정은 **패킷마다** 반복된다.

Cilium의 kube-proxy 대체 모드는 이 지점에서 완전히 다른 접근을 취한다. **`connect()`나 `sendmsg()` 같은 소켓 시스템콜이 호출되는 바로 그 순간**, 즉 패킷이 만들어지기도 전에 BPF 프로그램이 개입해 목적지 주소를 실제 백엔드 Pod IP로 바로 써 넣는다.

```
iptables 경로 (15장)
  app이 ClusterIP로 connect()
    → 커널이 패킷을 만든다 (목적지: ClusterIP)
    → netfilter 훅에서 DNAT (목적지를 Pod IP로 재작성)
    → conntrack에 이 변환을 기록 (반환 패킷을 위해)
    → 패킷 전송
    → (매 패킷마다 conntrack 조회/갱신 필요)

Cilium 소켓 레벨 로드밸런싱
  app이 ClusterIP로 connect()
    → connect() 시스템콜 자체를 BPF 프로그램이 가로챈다
    → 이 시점에 소켓의 목적지를 곧바로 실제 Pod IP로 결정
    → 커널은 애초에 "Pod IP로 가는 패킷"만 만든다
    → 패킷 레벨의 DNAT도, conntrack 항목도 필요 없다
```

**이 차이가 의미하는 것은 단순하다.** iptables 경로에서는 연결이 지속되는 동안 매 패킷이 conntrack 테이블을 거친다. 소켓 레벨 로드밸런싱에서는 **연결이 맺어지는 그 한 순간에만** 결정이 내려지고, 그 이후의 모든 패킷은 처음부터 목적지가 실제 Pod IP인 평범한 패킷이다. conntrack 부하가 원천적으로 줄어들고, 매 패킷의 DNAT 오버헤드도 사라진다.

### "kube-proxy 대체" 모드

Cilium을 `kubeProxyReplacement` 모드로 설치하면 **kube-proxy 자체를 클러스터에서 제거**하고, Service 라우팅 전체를 eBPF가 담당한다.

```bash
# Cilium을 kube-proxy 대체 모드로 설치하는 대표적 형태 (helm)
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=<control-plane-endpoint> \
  --set k8sServicePort=6443
```

```bash
# 대체 모드가 정상 동작하는지 확인
cilium status | grep KubeProxyReplacement
# KubeProxyReplacement:   True
```

이 모드에서는 `ClusterIP`, `NodePort`, `LoadBalancer` 타입 Service의 라우팅, 그리고 세션 어피니티 같은 kube-proxy의 책임 전부가 BPF 맵과 소켓 레벨 로드밸런싱으로 이관된다. 14~15장에서 EndpointSlice → kube-proxy → iptables/IPVS로 이어지던 경로가, 여기서는 EndpointSlice → cilium-agent → BPF 맵으로 대체된다.

### CiliumNetworkPolicy도 같은 BPF 프로그램 위에서 동작한다

18.2절에서 본 `CiliumNetworkPolicy`의 L3/L4/L7 규칙은 별도의 데이터플레인이 아니라, **지금까지 설명한 것과 동일한 TC 훅 BPF 프로그램과 맵**을 사용한다. 정책 결정을 위한 엔드포인트 메타데이터가 이미 endpoint map에 있으므로, Service 라우팅을 위해 맵을 조회하는 것과 정책 허용 여부를 위해 맵을 조회하는 것이 **같은 패킷 처리 경로 안에서 함께 일어난다.** L7 규칙(HTTP 메서드/경로)이 필요한 경우에만 패킷의 일부가 유저스페이스의 Envoy 프록시로 위임되고, 그 외 대부분의 트래픽은 커널을 벗어나지 않고 처리된다.

```
패킷 하나가 TC 훅을 지날 때 (Cilium, 대체 모드 + 정책 활성화)
   ① endpoint map 조회      → 이 Pod가 정책 대상인가?
   ② 정책 맵 조회            → 이 출발지/목적지/포트 조합이 허용되는가?
   ③ (필요시) service map 조회 → ClusterIP를 실제 Pod IP로 (소켓 단계에서 이미 끝났다면 생략)
   ④ (L7 규칙이 있다면) 유저스페이스 프록시로 위임
   ⑤ 그 외에는 커널 내에서 그대로 전달
```

**19.1절의 XDP/TC 구조, 19.2절의 BPF 맵과 소켓 로드밸런싱, 18장의 NetworkPolicy 시행**이 여기서 하나의 그림으로 합쳐진다 — 이것이 이 장이 캡스톤인 이유다.

## 19.3 대규모 클러스터 네트워크 진단 플로차트

"Pod A가 Pod B 또는 Service C에 닿지 않는다"는 질문은 사실 여러 개의 서로 다른 질문이 뭉쳐 있는 것이다. 아래 순서로 좁혀 가면 대부분의 원인에 도달한다.

```
Pod A → 목적지에 연결 안 됨
  │
  ▼
① 목적지가 이름(FQDN)인가, IP인가?
  │
  ├─ 이름이다 → DNS 문제 가능성 (16장)
  │             kubectl exec A -- nslookup <목적지>
  │             해석 실패 → CoreDNS Pod 상태, ndots 설정, NetworkPolicy의 DNS 허용(18.3절) 확인
  │             해석 성공 → 아래로 계속
  │
  ▼
② IP는 얻었다. 같은 노드인가, 다른 노드인가?
  │
  ├─ 같은 노드 → CNI의 로컬 브리지/veth 연결 확인 (13장)
  │             다른 노드 → CNI의 오버레이/네이티브 라우팅 확인 (13장)
  │             예: VXLAN 캡슐화가 방화벽에 막히는가, BGP 라우팅이 전파됐는가
  │
  ▼
③ 목적지가 Pod IP인가, Service(ClusterIP 등)인가?
  │
  ├─ Service다 → EndpointSlice에 준비된(ready) 백엔드가 있는가? (14장)
  │             kube-proxy 모드라면 iptables/IPVS 규칙이 반영됐는가 (15장)
  │             eBPF 모드라면 cilium service map에 반영됐는가 (19.2절)
  │             cilium service list / iptables-save | grep <서비스>
  │
  ▼
④ 연결 자체는 되는데 특정 포트/프로토콜에서만 실패하는가?
  │
  ├─ NetworkPolicy가 해당 방향을 거부하고 있지 않은가 (18장)
  │  · CNI가 NetworkPolicy를 시행하는 CNI인지부터 재확인 (18.2절)
  │  · podSelector/namespaceSelector 조합이 의도와 다르게 AND/OR 되어 있지 않은가
  │
  ▼
⑤ 정책도 통과하는데 간헐적으로/고부하 상황에서만 실패하는가?
  │
  └─ 노드 레벨 자원 고갈 가능성
     · conntrack 테이블 가득 참 (연결이 몰릴 때 새 연결이 거부됨)
     · 임시 포트(ephemeral port) 고갈 (아웃바운드 연결이 많은 워크로드)
     · nf_conntrack: table full, dropping packet 같은 커널 로그 확인
```

이 플로차트의 순서가 임의적이지 않다. **DNS(16장) → 노드 간 연결성(13장) → Service 레벨(14~15장/19.2절) → 정책 레벨(18장) → 노드 자원 레벨** 순으로, **더 상위 계층에서 확실히 배제한 뒤에만 하위 원인을 의심하는** 구조다. 반대 순서로 접근하면(예: conntrack부터 의심) 훨씬 흔한 원인(DNS 설정 오류)을 지나치고 시간을 낭비하기 쉽다.

### 노드 레벨 자원 고갈의 두 가지 대표 사례

```bash
# conntrack 테이블 크기와 현재 사용량
docker exec k8s-guide-worker sysctl net.netfilter.nf_conntrack_max
docker exec k8s-guide-worker sysctl net.netfilter.nf_conntrack_count

# 테이블이 가득 찼을 때 커널 로그
docker exec k8s-guide-worker dmesg | grep -i conntrack
# nf_conntrack: table full, dropping packet
```

connection churn(연결이 매우 빠르게 생성·종료되는 워크로드)이 많은 클러스터에서는 conntrack 테이블이 가득 차 **새 연결이 조용히 드롭**되는 현상이 나타난다. eBPF 기반 소켓 레벨 로드밸런싱(19.2절)을 쓰면 Service 경유 트래픽의 conntrack 의존도가 줄어들어 이 문제의 상당 부분이 완화되지만, 일반 Pod-to-Pod 연결이나 외부로 나가는 연결은 여전히 conntrack을 거치므로 완전히 사라지지는 않는다.

```bash
# 임시 포트 범위와 사용량
docker exec k8s-guide-worker sysctl net.ipv4.ip_local_port_range
docker exec k8s-guide-worker ss -s
```

아웃바운드 연결(특히 같은 목적지로 매우 많은 짧은 연결을 여는 패턴)이 많으면 노드의 임시 포트가 고갈되어 신규 연결이 실패할 수 있다. 이 경우 연결 재사용(keep-alive, 커넥션 풀링)으로 애플리케이션 쪽에서 완화하거나, 포트 범위 확장을 검토한다.

## 19.4 패킷 캡처 실전

### Pod 네트워크 네임스페이스 안에서 직접 캡처

가장 정확한 방법은 문제가 되는 Pod의 **네트워크 네임스페이스 안에서** 캡처하는 것이다. 대부분의 운영 이미지에는 `tcpdump`가 없으므로, 별도 컨테이너의 도구를 빌려 쓴다.

```bash
# 방법 ① kubectl debug로 대상 Pod에 임시 디버그 컨테이너 붙이기
# (같은 네트워크 네임스페이스를 공유 — --target으로 프로세스 네임스페이스까지 공유 가능)
kubectl debug -it <pod-name> \
  --image=nicolaka/netshoot \
  --target=<container-name> \
  -- tcpdump -i any -n port 80
```

```bash
# 방법 ② nsenter로 노드에서 직접 Pod의 네트워크 네임스페이스 진입
# (Pod의 PID를 먼저 확인해야 한다)
docker exec k8s-guide-worker crictl inspect <container-id> \
  | grep -i pid

docker exec k8s-guide-worker nsenter -t <pid> -n tcpdump -i eth0 -n
```

**애플리케이션 이미지가 너무 미니멀해 디버그 컨테이너조차 넣기 부담스러운 경우**, Pod 안이 아니라 **호스트 쪽의 veth 페어**에서 캡처하는 방법이 있다. 13장에서 본 것처럼 Pod의 네트워크 네임스페이스는 veth 쌍의 한쪽 끝이고, 다른 쪽 끝은 호스트 네트워크 네임스페이스(또는 CNI 브리지)에 있다.

```bash
# Pod에 연결된 veth 인터페이스 이름 찾기
docker exec k8s-guide-worker sh -c \
  'ethtool -S <pod-내부-eth0-ifindex> 2>/dev/null; ip link | grep veth'

# 호스트에서 해당 veth로 캡처 — Pod 내부에 아무것도 설치하지 않고도 확인 가능
docker exec k8s-guide-worker tcpdump -i <veth이름> -n
```

### Hubble — 캡처 없이 흐름을 본다

Cilium 환경이라면 패킷을 직접 캡처하지 않고도 **흐름(flow) 단위의 가시성**을 얻을 수 있다. Hubble은 eBPF 데이터플레인이 이미 관측하고 있는 흐름 정보(출발지/목적지, 포트, 정책 판정 결과)를 그대로 노출한다.

```bash
# 특정 네임스페이스를 오가는 모든 흐름
hubble observe --namespace shop

# 정책에 의해 거부(DROPPED)된 흐름만
hubble observe --namespace shop --verdict DROPPED

# 특정 Pod를 목적지로 하는 흐름만, 실시간 팔로우
hubble observe --to-pod shop/backend-abc123 --follow
```

```
Sep 22 10:15:03.221: shop/frontend-x7f2k:52344 -> shop/backend-abc123:80
  http-request FORWARDED (GET /api/v1/orders)
Sep 22 10:15:04.108: shop/debug-pod:41022 -> shop/backend-abc123:80
  DROPPED (Policy denied)
```

**허용된 흐름과 거부된 흐름이 같은 화면에서, 패킷 한 개도 캡처하지 않고 곧바로 보인다.** `tcpdump`가 "이 패킷의 바이트를 있는 그대로 보고 싶다"는 요청에 답하는 도구라면, Hubble은 "이 트래픽이 어떤 정책 판단을 거쳤는가"에 답하는 도구다. 18장에서 만든 NetworkPolicy/CiliumNetworkPolicy가 실제로 어떤 흐름을 거부하고 있는지 확인할 때 `hubble observe --verdict DROPPED`만큼 빠른 방법이 없다.

## 19.5 성능 프로파일링 도구

### `cilium monitor` — 이벤트 단위 실시간 관찰

Hubble보다 더 저수준으로, BPF 프로그램이 발생시키는 개별 이벤트(드롭, 정책 판정, 디버그 트레이스)를 직접 볼 수 있다.

```bash
cilium monitor --type drop
cilium monitor --type policy-verdict
```

Hubble이 사람이 읽기 좋은 흐름 단위 요약이라면, `cilium monitor`는 그 아래에서 실제로 무슨 이벤트가 발생하고 있는지를 더 세밀하게 보여준다. 흐름 하나가 예상과 다르게 처리될 때 원인이 되는 개별 드롭 이유를 추적하는 데 쓴다.

### BPF verifier의 복잡도 예산

19.1절에서 본 verifier는 "커널을 크래시시킬 수 없다"는 안전성만 보장하는 것이 아니라, **프로그램 하나가 가질 수 있는 명령어 수와 분기 경로의 조합에 상한**을 둔다. 이는 실제 제약으로 작동한다.

```
· 프로그램이 검증 가능한 상태 공간을 넘어서면 적재 자체가 거부된다
· 매우 복잡한 정책(수많은 L7 규칙, 깊게 중첩된 조건)을
  하나의 BPF 프로그램에 다 욱여넣으려 하면 이 한계에 부딪힐 수 있다
· 실무에서는 tail call(프로그램 간 점프)로 로직을 여러 개의
  작은 BPF 프로그램으로 쪼개 이 예산 안에 맞춘다
```

즉 "eBPF는 무한히 많은 로직을 커널에 넣을 수 있다"는 생각은 틀렸다. **verifier가 허용하는 복잡도 예산**이라는 실제 상한이 있고, Cilium 같은 프로젝트는 이 예산 안에서 동작하도록 프로그램을 여러 개의 작은 단위로 나누어 tail call로 연결하는 방식을 쓴다. 대규모 정책을 설계할 때 "규칙이 너무 많아지면 무엇이 느려지는가"라는 질문의 답은 iptables에서는 "체인 순회 시간"이었지만, eBPF에서는 "프로그램 복잡도 예산과 tail call 홉 수"로 형태가 바뀐다.

### conntrack 크기 튜닝

19.3절에서 본 conntrack 테이블 고갈은 실무에서 반복적으로 마주치는 병목이다.

```bash
# 현재 설정과 사용량
sysctl net.netfilter.nf_conntrack_max
sysctl net.netfilter.nf_conntrack_count

# 필요 시 상향 (노드의 메모리 여유와 연결 처리량을 고려해 결정)
sysctl -w net.netfilter.nf_conntrack_max=1048576
```

값을 무작정 올리는 것이 능사는 아니다. conntrack 항목 하나가 커널 메모리를 소비하므로, 워크로드가 실제로 만드는 **동시 연결 수의 추세**를 관측하며 조정해야 한다. eBPF 소켓 레벨 로드밸런싱(19.2절)으로 Service 트래픽의 conntrack 의존을 줄이는 것도 근본적인 완화책 중 하나다.

## 실습: 진단 플로차트를 실제 장애에 적용하기

Cilium이 설치되어 있다면 ①을, 기본 kind 클러스터(kindnet)라면 ②를 따라간다. 두 경로 모두 같은 결론 — **NetworkPolicy에 의한 조용한 차단** — 에 도달하도록 구성했다.

### ① Cilium 환경 — Hubble로 실시간 관찰

```bash
cilium status
cilium connectivity test --test-namespace cilium-test  # 클러스터 전반의 연결성 자가진단
```

```bash
kubectl create namespace shop
kubectl -n shop create deployment backend --image=nginx:alpine
kubectl -n shop expose deployment backend --port=80

# 정상 흐름을 Hubble로 관찰
kubectl -n shop run debug --image=nicolaka/netshoot --restart=Never -- sleep 3600
kubectl -n shop exec debug -- curl -s --max-time 3 backend -o /dev/null -w "%{http_code}\n"

hubble observe --namespace shop --last 5
```

```bash
# 의도적으로 장애를 주입 — backend에 default-deny-ingress 적용
kubectl -n shop apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-ingress }
spec:
  podSelector: {}
  policyTypes: [Ingress]
EOF

kubectl -n shop exec debug -- curl -s --max-time 3 backend -o /dev/null -w "%{http_code}\n"
# 타임아웃

# Hubble에서 거부된 흐름을 곧바로 확인 — 패킷 캡처 없이 원인이 드러난다
hubble observe --namespace shop --verdict DROPPED --last 5
```

### ② kindnet 환경 — kubectl debug + tcpdump로 수동 확인

```bash
kubectl create namespace shop
kubectl -n shop create deployment backend --image=nginx:alpine
kubectl -n shop expose deployment backend --port=80

BE=$(kubectl -n shop get pod -l app=backend -o jsonpath='{.items[0].metadata.name}')

# 대상 Pod의 네트워크 네임스페이스에서 캡처 시작 (백그라운드)
kubectl debug -n shop -it "$BE" --image=nicolaka/netshoot --target=backend -- \
  timeout 20 tcpdump -i any -n port 80 &

# 별도 터미널에서 트래픽 발생
kubectl -n shop run debug --image=nicolaka/netshoot --restart=Never -- \
  sh -c "sleep 2 && curl -s --max-time 3 backend -o /dev/null -w '%{http_code}\n'"
```

**kindnet은 NetworkPolicy를 시행하지 않으므로(18.2절), 이 환경에서는 정책을 적용해도 실제로 차단되지 않는다.** 이 사실 자체가 19.3절 플로차트의 4단계("NetworkPolicy가 거부하고 있지 않은가")에서 반드시 짚어야 할 전제조건이라는 것을 다시 한번 확인하는 좋은 실습이 된다. 실제 차단까지 재현하려면 18장 실습에서 만든 Calico 클러스터를 이용한다.

### ③ 플로차트를 따라 원인 규명

```
① DNS인가? → curl에 IP가 아니라 이름을 썼으니 DNS는 이미 성공했다 (연결 자체가 시도됨)
② 같은 노드/다른 노드? → 같은 네임스페이스, 스케줄링에 따라 다를 수 있음. CNI 연결성은 정상(다른 요청은 됨)
③ Service 레벨? → EndpointSlice에 ready 백엔드가 있다 (Pod는 Running)
④ NetworkPolicy? → ★ 여기서 default-deny-ingress가 걸린다. Hubble/정책 목록에서 확정
```

**진단이 오래 걸리지 않은 이유는 순서대로 배제했기 때문이다.** DNS와 CNI 연결성을 먼저 배제하지 않았다면 NetworkPolicy를 의심하기까지 훨씬 돌아갔을 것이다.

```bash
# 정리
kubectl delete namespace shop
```

---

## 실습 과제

**과제 1 — XDP DROP의 비용 체감**
Cilium 환경에서 특정 출발지 IP를 XDP 레벨에서 드롭하도록 구성하고(또는 문서상 개념 검증으로), 동일한 차단을 iptables 규칙으로 구성했을 때와 CPU 사용량 차이를 비교 조사한다.

**과제 2 — 소켓 레벨 로드밸런싱 관찰**
`kubeProxyReplacement=true`로 설치된 Cilium 클러스터에서 Service로 향하는 연결을 만들고, `conntrack -L`(또는 `cilium bpf ct list`)로 conntrack 항목이 생성되는지, 생성된다면 iptables 모드와 어떻게 다른지 비교한다.

**과제 3 — 진단 플로차트 5단계 전부 재현**
19.3절 플로차트의 다섯 단계(DNS, 노드 간 연결, Service, NetworkPolicy, 노드 자원) 각각에 대해 의도적으로 장애를 하나씩 주입하고, 어떤 단계에서 무엇을 확인해야 원인을 좁힐 수 있는지 직접 표로 정리한다.

**과제 4 — conntrack 고갈 재현**
테스트 네임스페이스에서 짧은 연결을 매우 빠르게 반복 생성하는 부하(예: `hey`나 간단한 반복 스크립트)를 걸어 `nf_conntrack_count`가 상한에 가까워지는 것을 관찰하고, `nf_conntrack_max`를 조정했을 때의 변화를 기록한다.

**과제 5 — Hubble과 tcpdump 교차 검증**
같은 장애 상황(NetworkPolicy 거부)을 Hubble의 `--verdict DROPPED`와 `tcpdump` 양쪽으로 각각 확인하고, 두 도구가 보여주는 정보의 차이(흐름 단위 요약 vs 원시 패킷)를 정리한다.

---

## 마치며

19.1~19.2절에서 본 eBPF/Cilium의 내부 구조는 15장의 kube-proxy 데이터플레인, 13장의 CNI, 18장의 NetworkPolicy 시행을 하나의 그림으로 다시 그린 것이었다. iptables 체인이 하던 일을 BPF 맵이, DNAT+conntrack이 하던 일을 소켓 레벨 로드밸런싱이, 별도의 정책 엔진이 하던 일을 같은 패킷 경로 위의 정책 맵이 대신한다. 19.3~19.5절의 진단 플로차트와 도구들은 이 모든 계층에서 무엇이 잘못될 수 있는지를 순서대로 배제해 가는 절차였다.

이것으로 이 책의 세 갈래 여정이 끝난다. 1부에서는 컨트롤 플레인 각 컴포넌트의 내부 구조를 열어 "kubectl apply 한 번이 어떻게 실제 컨테이너가 되는가"를 추적했다. 2부에서는 그 위에 무언가를 직접 얹는 법 — client-go, CRD, 오퍼레이터, 어드미션 웹훅, 커스텀 스케줄러 — 을 다뤘다. 그리고 3부에서는 그 모든 것이 결국 패킷 하나하나로 구현된다는 사실을 CNI부터 eBPF까지 층층이 내려가며 확인했다. **내부 아키텍처를 이해해야 프레임워크를 안전하게 확장할 수 있고, 그 확장이 결국 네트워크 위에서 동작한다는 것을 알아야 장애 앞에서 침착할 수 있다.** 이 세 축은 서로 다른 장이 아니라 하나의 시스템을 보는 세 가지 각도였다.

앞으로 실제 장애를 마주할 때는 **부록 A(진단 명령어 치트시트)**를 먼저 펼쳐 이 책 전체에서 쓴 명령어들을 상황별로 빠르게 다시 찾고, 낯선 용어를 만나면 **부록 B(용어집)**에서 한영 대조로 정확한 의미를 확인하기 바란다.
