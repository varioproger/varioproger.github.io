---
title: "22장. eBPF 데이터플레인과 Cilium"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 22
---

# 22장. eBPF 데이터플레인과 Cilium

> **🎮 게임 서버 개발자에게** — 게임 서버의 패킷 처리 성능을 올리려 할 때 흔한 선택은 유저 공간 네트워킹(DPDK류)이나 커널 모듈이었다. 커널 모듈은 버그 하나가 커널 전체를 패닉시킬 수 있다. eBPF는 그 중간 길이다. **커널을 재컴파일하거나 모듈을 올리지 않고, 검증을 통과한 작은 프로그램을 커널의 정해진 지점(패킷 도착, `connect()` 호출)에 끼워 넣는다.** 결정적으로 다른 점은 이 프로그램이 일반 C++ 코드가 아니라 **verifier(검증기)가 허락해야만 올라가는 제한된 코드**라는 것이다. 무한 루프도, 임의 메모리 접근도 못 한다. 이 장은 17장에서 본 iptables 체인과 conntrack이 하던 일을 eBPF(Cilium)가 어떻게 다르게 하는지를 다룬다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - Service가 수천 개로 늘면서 iptables 규칙 갱신·순회가 느려졌다 → eBPF 기반 kube-proxy 대체(Cilium `kubeProxyReplacement`)를 검토한다.
> - 노드에서 `nf_conntrack: table full, dropping packet`이 보이고 새 연결이 조용히 드롭된다 → 소켓 레벨 로드밸런싱이 Service 트래픽의 conntrack 의존을 줄인다.
> - "NetworkPolicy가 어떤 흐름을 막고 있는지" 패킷 캡처 없이 보고 싶다 → Hubble의 `--verdict DROPPED`(진단은 [23장](../4부-진단/23-네트워크-장애-진단.md)).

## 코어 — 이것만은 100%

> **한 문장:** eBPF는 verifier가 검증한 프로그램을 커널 훅(XDP/TC, 소켓 시스템콜)에서 실행하는 기술이고, Cilium은 cilium-agent가 API 서버를 watch해 BPF 맵을 갱신하고 커널의 BPF 프로그램이 맵을 룩업해 Service 로드밸런싱과 NetworkPolicy를 처리함으로써 iptables 체인 순회와 패킷마다의 DNAT·conntrack을 대체한다.

1. **eBPF = 검증된 프로그램 + 훅 + 맵** — verifier(검증)·샌드박스·JIT. XDP는 NIC 직후 가장 이른 훅(빨리 버리기), TC는 `sk_buff`가 있는 늦은 훅(더 많은 컨텍스트). 상태는 BPF 맵으로만 주고받는다.
2. **Cilium: 에이전트(유저스페이스)가 맵을 쓰고, 커널 프로그램이 맵을 읽는다** — 에이전트가 죽어도 이미 적재된 프로그램과 맵이 계속 트래픽을 처리한다. 체인 순회 대신 해시 맵 룩업이다.
3. **소켓 레벨 로드밸런싱과 같은 경로의 정책** — `connect()` 시점에 목적지를 Pod IP로 써 넣어 패킷 단위 DNAT/conntrack이 필요 없고, NetworkPolicy도 같은 TC 훅 프로그램·맵을 쓴다. 단 verifier의 복잡도 예산이라는 실제 한계가 있다.

**이 장의 학습 목표**

- eBPF의 세 요소(검증, 샌드박스 실행, JIT)와 XDP/TC 훅의 위치·역할 차이를 설명한다.
- BPF 맵이 유저스페이스(cilium-agent)와 커널 프로그램 사이의 통로임을 설명하고, 에이전트가 죽어도 데이터플레인이 유지됨을 설명한다.
- iptables 경로(DNAT + conntrack)와 소켓 레벨 로드밸런싱의 차이를 설명한다.
- `kubeProxyReplacement` 모드에서 14&#126;17장의 경로가 어떻게 대체되는지 말한다.
- verifier 복잡도 예산, tail call, conntrack이 완전히 사라지지는 않음을 한계로 안다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 커널 모듈로 패킷 처리 로직을 넣는다 | eBPF 프로그램 | 커널 안에서 패킷 처리 로직이 돈다 | 모듈 적재가 아니라 **verifier 검증 후 적재**한다. 무한 루프·범위 밖 메모리 접근은 적재 자체가 거부되어 커널을 크래시시킬 수 없다 |
| 프로세스 간 공유 메모리/해시 테이블로 상태 공유 | BPF 맵(키-값 자료구조) | 두 쪽이 한 테이블로 상태를 주고받는다 | 유저스페이스(cilium-agent)와 커널 프로그램은 메모리를 직접 공유하지 않고 **커널이 관리하는 맵**으로만 통신한다(`bpf()` 시스템콜) |
| `std::unordered_map` 조회 vs 선형 리스트 순회 | 맵 룩업 vs iptables 체인 순회 | 자료구조가 조회 비용을 결정한다 | iptables는 Service·정책 수만큼 체인을 순서대로 비교하고, eBPF는 `ClusterIP:Port`를 키로 해시 맵을 한 번 조회한다 |
| `connect()` 직전에 주소를 바꿔 써서 접속(클라이언트 측 서버 선택) | 소켓 레벨 로드밸런싱 | 연결을 맺는 시점에 백엔드가 정해진다 | 앱 코드가 아니라 **`connect()` 시스템콜을 BPF 프로그램이 가로채** 목적지를 Pod IP로 바꾼다. 앱은 모른다 |
| 데몬(제어)과 커널(데이터)이 분리된 구조 | cilium-agent와 BPF 프로그램 | 제어와 데이터 경로가 분리된다 | 에이전트가 죽어도 적재된 BPF 프로그램과 맵은 커널에 남아 트래픽을 계속 처리한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 커널 모듈 없이 커널 안에 로직을 넣는다면, "커널이 죽지 않는다"는 보장은 무엇이 하는 걸까?
> 2. 패킷을 NIC가 받은 뒤 어느 시점에 가장 빨리 개입할 수 있을까? 그 시점에는 어떤 정보가 없을까?
> 3. iptables 기반 kube-proxy는 Service 1,000개일 때 패킷마다 무엇을 하고, 맵 룩업은 무엇이 다를까?
> 4. 앱이 `connect()`로 ClusterIP에 접속할 때, DNAT를 패킷 단계가 아니라 그보다 앞에서 처리하면 conntrack은 어떻게 될까?
> 5. cilium-agent Pod를 재시작하는 동안 기존 트래픽은 끊길까?
>
> **처리법:** 🛠 실습 (Cilium 환경) `cilium status | grep KubeProxyReplacement`, `cilium monitor --type drop`, `hubble observe --verdict DROPPED` → 클러스터가 있다면 직접 실행 · 🗺 관계도 cilium-agent → BPF 맵 ← TC/XDP 프로그램(패킷마다 룩업), NIC → XDP → TC → 커널 스택 · 📦 카드 XDP vs TC, iptables 경로 vs 소켓 레벨 로드밸런싱, `KubeProxyReplacement: True`, verifier 예산·tail call · 유추 비판 "커널 모듈" 유추가 eBPF에서 깨지는 곳

---

## 코어 1. eBPF = 검증된 프로그램 + 훅 + 맵

### 1.1 eBPF란 무엇인가

**한 줄 요약:** 커널을 재컴파일하거나 모듈을 적재하지 않고, verifier가 검증한 프로그램을 커널이 정한 훅 지점에서 실행하게 하는 기술이다.

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

**커널 모듈이 필요 없다**는 점이 결정적이다. CNI가 커스텀 커널 모듈을 요구했다면 커널 버전마다 재빌드해야 하고 모듈 버그가 커널 전체를 패닉시킬 위험을 감수해야 했을 것이다. eBPF는 검증 단계가 이 위험을 구조적으로 차단하면서도, 커널 내부 깊숙한 지점(패킷이 도착하는 순간, 소켓 시스템콜이 호출되는 순간)에 로직을 심을 수 있게 한다.

### 1.2 훅 지점: XDP와 TC

**한 줄 요약:** XDP는 NIC 드라이버 직후의 가장 이른 훅이라 빨리 버리기에 최적, TC는 `sk_buff`가 있는 더 늦은 훅이라 더 많은 일을 하기에 최적이다.

```
NIC (네트워크 카드)
   │ 패킷 도착
   ▼
XDP (eXpress Data Path)  ★ NIC 드라이버 직후, 가장 이른 훅
  · 아직 sk_buff(커널의 패킷 구조체)도 할당되지 않은 시점
  · 여기서 DROP하면 그 이후의 어떤 커널 처리 비용도 들지 않는다
   ▼ (PASS 결정 시)
sk_buff 할당, 네트워킹 스택 진입
   ▼
TC (Traffic Control) 훅  ★ 좀 더 늦은 지점
  · sk_buff가 이미 있어 더 많은 컨텍스트 참조 가능
  · ingress/egress 양쪽에 부착 가능
  · Cilium 데이터플레인 로직 대부분이 여기 위치
   ▼
일반적인 커널 네트워킹 스택 (라우팅, netfilter/iptables, ...)
```

XDP에서 "이 패킷은 버린다"고 결정하면 이후 어떤 커널 처리 비용도 들지 않으므로 DDoS 방어나 초고속 드롭에 선호된다. 다만 이 시점에는 소켓 정보나 상위 연결 상태 같은 컨텍스트가 빈약해 복잡한 로직을 짜기 어렵다. **XDP는 "얼마나 빨리 버리거나 리다이렉트할 수 있는가"에, TC는 "얼마나 많은 것을 할 수 있는가"에 최적화**되어 있다. Cilium의 핵심 로직(서비스 로드밸런싱, 정책 시행, 캡슐화/역캡슐화)은 대부분 TC 훅에서 이뤄진다.

[5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md)의 netfilter 훅이 "커널 네트워킹 스택 안"이라면, XDP와 TC는 그보다 앞(드라이버 직후, `sk_buff` 할당 직전/직후)이다.

> **[보충]** 위 "netfilter 훅보다 앞"이라는 위치 비교는 원천의 파이프라인 그림(XDP → sk_buff → TC → 일반 커널 네트워킹 스택(라우팅, netfilter/iptables))을 풀어 쓴 것이다.

### 1.3 왜 iptables보다 유리한가

**한 줄 요약:** iptables는 서비스 수만큼 체인을 순회하고, eBPF는 해시 맵을 한 번 룩업한다.

```
iptables 방식 (17장)
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

체인 순회와 해시 맵 한 번 조회의 차이가 서비스 수천 개 규모에서 실질적인 지연 차이로 드러난다. [21장](21-NetworkPolicy와-네트워크-보안.md)의 NetworkPolicy 시행(iptables 대 eBPF)과 같은 원리다.

---

## 코어 2. Cilium: 에이전트가 맵을 쓰고, 커널이 맵을 읽는다

### 2.1 cilium-agent와 BPF 맵

**한 줄 요약:** 유저스페이스의 cilium-agent(DaemonSet)가 API 서버를 watch해 BPF 맵을 갱신하고, 커널의 BPF 프로그램은 패킷마다 맵만 조회한다.

```
유저스페이스
  cilium-agent (Go 프로세스, 각 노드 DaemonSet)
    · API 서버 watch (Pod, Service, EndpointSlice, CiliumNetworkPolicy)
    · BPF 프로그램 컴파일 및 적재
    · BPF 맵 갱신
         │ 맵 쓰기/읽기 (bpf() 시스템콜)
         ▼
커널스페이스 — BPF 맵
  endpoint map          service/backend map
  Pod IP → 메타데이터     ClusterIP:Port →
  (정책 결정에 사용)        [Pod IP:Port, ...]
         ▲ 룩업                ▲ 룩업
  TC/XDP 훅의 BPF 프로그램 (패킷마다 실행, 맵을 참조해 결정)
```

둘은 직접 메모리를 공유하지 않고 **BPF 맵**이라는 커널 관리 키-값 자료구조로만 상태를 주고받는다. Service나 EndpointSlice가 바뀌면([16장](16-Service와-EndpointSlice.md)) 에이전트가 맵을 갱신한다. 실제 패킷은 커널 안의 BPF 프로그램이 처리하며 유저스페이스로 올리지 않는다. 그래서 **에이전트가 죽거나 재시작 중이어도 이미 적재된 프로그램과 맵이 커널에 남아 계속 트래픽을 처리**한다. 컨트롤플레인과 데이터플레인이 분리된 것이다.

> **🎮 연결** — 17장의 kube-proxy도 "규칙만 만들고 변환은 커널이" 하는 구조였다. Cilium은 그 규칙 저장소를 iptables 체인에서 BPF 맵으로 바꾼 것이다. 둘 다 에이전트가 죽어도 이미 깔린 것은 계속 동작한다는 성질이 있다.

### 2.2 kube-proxy 대체 모드

**한 줄 요약:** `kubeProxyReplacement`로 설치하면 kube-proxy를 제거하고 Service 라우팅 전체를 BPF 맵과 소켓 레벨 로드밸런싱으로 처리한다.

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

이 모드에서는 `ClusterIP`, `NodePort`, `LoadBalancer` 타입 Service의 라우팅과 세션 어피니티 같은 kube-proxy의 책임 전부가 BPF 맵과 소켓 레벨 로드밸런싱으로 이관된다. 경로가 다음처럼 바뀐다.

```
기존(16&#126;17장):  EndpointSlice → kube-proxy → iptables/IPVS 규칙
Cilium 대체:    EndpointSlice → cilium-agent → BPF 맵
```

---

## 코어 3. 소켓 레벨 로드밸런싱, 같은 경로의 정책, 그리고 한계

### 3.1 DNAT와 conntrack이 없다

**한 줄 요약:** `connect()`/`sendmsg()` 시점에 BPF가 목적지를 실제 Pod IP로 써 넣어, 이후 패킷은 처음부터 Pod IP로 가는 평범한 패킷이 된다.

```
iptables 경로 (17장)
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

iptables 경로에서는 연결이 지속되는 동안 **매 패킷**이 conntrack을 거친다. 소켓 레벨 로드밸런싱에서는 **연결이 맺어지는 한 순간에만** 결정이 내려지고 이후의 모든 패킷은 처음부터 목적지가 실제 Pod IP다. conntrack 부하가 원천적으로 줄고 패킷마다의 DNAT 오버헤드가 사라진다. DNAT·conntrack의 원리는 [5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md), 경로는 [17장](17-kube-proxy-데이터플레인.md)이다.

> **🎮 연결** — C++ 클라이언트가 `connect()`하기 직전에 서버 목록에서 한 대를 골라 주소를 바꿔 접속하는 클라이언트 측 로드밸런싱과 같은 발상이다. 다만 앱이 아니라 **커널의 BPF 프로그램이 시스템콜을 가로채서** 한다.

### 3.2 NetworkPolicy도 같은 TC 프로그램 위에서

**한 줄 요약:** `CiliumNetworkPolicy`의 L3/L4/L7 규칙은 별도 엔진이 아니라 같은 TC 훅 프로그램과 맵을 쓴다. L7 규칙이 있을 때만 일부 트래픽이 유저스페이스 Envoy로 위임된다.

```
패킷 하나가 TC 훅을 지날 때 (Cilium, 대체 모드 + 정책 활성화)
   ① endpoint map 조회      → 이 Pod가 정책 대상인가?
   ② 정책 맵 조회            → 이 출발지/목적지/포트 조합이 허용되는가?
   ③ (필요시) service map 조회 → ClusterIP를 실제 Pod IP로 (소켓 단계에서 이미 끝났다면 생략)
   ④ (L7 규칙이 있다면) 유저스페이스 프록시로 위임
   ⑤ 그 외에는 커널 내에서 그대로 전달
```

정책 결정에 필요한 엔드포인트 메타데이터가 이미 endpoint map에 있어서, Service 라우팅을 위한 맵 조회와 정책 허용 여부를 위한 맵 조회가 **같은 패킷 처리 경로 안에서** 함께 일어난다. L7 규칙(HTTP 메서드/경로)이 필요한 경우에만 패킷 일부가 Envoy 프록시로 가고, 대부분의 트래픽은 커널을 벗어나지 않는다. 즉 XDP/TC 구조, BPF 맵·소켓 로드밸런싱, NetworkPolicy 시행이 하나의 그림으로 합쳐진다. 표준 NetworkPolicy와 L7 확장은 [21장](21-NetworkPolicy와-네트워크-보안.md)이다.

### 3.3 한계: eBPF는 무한하지 않다

**한 줄 요약:** verifier는 프로그램 하나의 복잡도에 상한을 둔다. 큰 로직은 tail call로 쪼개 예산 안에 맞추며, conntrack은 소켓 LB로도 완전히 사라지지 않는다.

```
· 프로그램이 검증 가능한 상태 공간을 넘어서면 적재 자체가 거부된다
· 매우 복잡한 정책(수많은 L7 규칙, 깊게 중첩된 조건)을
  하나의 BPF 프로그램에 다 욱여넣으려 하면 이 한계에 부딪힐 수 있다
· 실무에서는 tail call(프로그램 간 점프)로 로직을 여러 개의
  작은 BPF 프로그램으로 쪼개 이 예산 안에 맞춘다
```

"eBPF는 무한히 많은 로직을 커널에 넣을 수 있다"는 생각은 틀렸다. 대규모 정책에서 "규칙이 너무 많아지면 무엇이 느려지는가"의 답이 iptables에서는 "체인 순회 시간"이었다면, eBPF에서는 "프로그램 복잡도 예산과 tail call 홉 수"로 형태가 바뀐다.

conntrack도 마찬가지다. 소켓 레벨 로드밸런싱은 **Service 경유 트래픽**의 conntrack 의존을 줄이지만, 일반 Pod-to-Pod 연결이나 외부로 나가는 연결은 여전히 conntrack을 거치므로 완전히 사라지지는 않는다. connection churn이 많은 클러스터에서는 conntrack 테이블이 가득 차 새 연결이 조용히 드롭될 수 있다(`nf_conntrack: table full, dropping packet`). 확인과 조정:

```bash
sysctl net.netfilter.nf_conntrack_max
sysctl net.netfilter.nf_conntrack_count
sysctl -w net.netfilter.nf_conntrack_max=1048576   # 노드 메모리 여유와 연결 처리량을 고려해 결정
```

값을 무작정 올리는 것이 능사는 아니다. conntrack 항목 하나가 커널 메모리를 쓰므로 워크로드의 동시 연결 수 추세를 관측하며 조정한다.

### 3.4 관측 도구 한 장 맛보기

**한 줄 요약:** Hubble은 흐름 단위, `cilium monitor`는 개별 BPF 이벤트 단위로 보여 준다. 진단 절차 전체는 23장이다.

```bash
# 정책에 의해 거부(DROPPED)된 흐름만
hubble observe --namespace shop --verdict DROPPED

# BPF 프로그램이 발생시키는 개별 이벤트
cilium monitor --type drop
cilium monitor --type policy-verdict
```

Hubble은 eBPF 데이터플레인이 이미 관측하는 흐름 정보(출발지/목적지, 포트, 정책 판정 결과)를 노출하고, `cilium monitor`는 그 아래에서 개별 드롭 이유 같은 이벤트를 더 세밀하게 보여 준다. `tcpdump`가 "이 패킷의 바이트"를 보는 도구라면 Hubble은 "이 트래픽이 어떤 정책 판단을 거쳤는가"에 답한다.

---

## 실무 적용

### 체크리스트

- [ ] eBPF가 iptables를 "근본적으로 다시 구현"하는 지점을 구분한다. Service 라우팅(체인 순회 → 맵 룩업, DNAT+conntrack → 소켓 레벨 LB), 정책 시행(체인 → 정책 맵).
- [ ] Cilium을 kube-proxy 대체로 쓴다면 `cilium status | grep KubeProxyReplacement`가 `True`인지 확인한다. 설치 시 `k8sServiceHost`/`k8sServicePort` 값을 지정한다.
- [ ] 소켓 레벨 로드밸런싱이 conntrack을 줄이는 것은 Service 경유 트래픽 한정임을 기억한다. Pod-to-Pod, 외부 연결은 여전히 conntrack을 쓴다.
- [ ] 정책이 매우 복잡해지면 verifier 복잡도 예산과 tail call 한계를 염두에 둔다.
- [ ] cilium-agent 재시작 시에도 이미 적재된 BPF 프로그램과 맵은 유지되어 트래픽이 이어진다는 점을 기억한다(제어/데이터 분리).
- [ ] NetworkPolicy가 무엇을 막는지 알고 싶을 때 `hubble observe --verdict DROPPED`와 `cilium monitor --type drop`을 쓴다.

### 시나리오로 확인하기

1. **상황:** Service 3,000개 클러스터에서 kube-proxy(iptables 모드)의 규칙 갱신이 느리고 패킷 지연이 눈에 띈다.
   **질문:** 왜 느리고, eBPF 대체는 무엇이 다른가?

   <details markdown="1"><summary>답 확인</summary>

   iptables는 Service마다 체인이 생겨 패킷이 점프 규칙을 서비스 개수만큼 순서대로 비교(선형 순회)한다. Cilium은 `ClusterIP:Port`를 키로 BPF 맵(해시 테이블)을 한 번 룩업해 O(1)에 가깝게 백엔드를 확정한다. `kubeProxyReplacement`로 kube-proxy를 제거하면 EndpointSlice → cilium-agent → BPF 맵 경로가 된다. → 코어 1 (1.3), 코어 2 (2.2)

   </details>

2. **상황:** 연결이 매우 빠르게 생성·종료되는 워크로드에서 `nf_conntrack: table full, dropping packet`이 나온다. Cilium 소켓 레벨 로드밸런싱을 쓰는데도 완전히 해소되지 않는다.
   **질문:** 왜인가?

   <details markdown="1"><summary>답 확인</summary>

   소켓 레벨 로드밸런싱은 Service 경유 트래픽의 conntrack 의존을 줄일 뿐이다. 일반 Pod-to-Pod 연결과 외부로 나가는 연결은 여전히 conntrack을 거친다. `nf_conntrack_max`/`nf_conntrack_count`를 확인하고 동시 연결 수 추세를 보며 조정한다. → 코어 3 (3.3)

   </details>

3. **상황:** 업그레이드를 위해 cilium-agent Pod를 롤링 재시작한다. 서비스 트래픽이 끊길지 걱정이다.
   **질문:** 어떻게 판단하나?

   <details markdown="1"><summary>답 확인</summary>

   에이전트와 데이터플레인이 분리되어 있어, 이미 적재된 BPF 프로그램과 맵은 에이전트가 죽거나 재시작 중이어도 커널에 남아 계속 트래픽을 처리한다. → 코어 2 (2.1)

   > **[보충]** 에이전트가 맵을 갱신하는 주체이므로, 재시작 중에는 Service/EndpointSlice 변경이 맵에 반영되지 않을 것이라는 추론은 원천의 직접 서술이 아니라 구조에서 이끌어 낸 것이다.

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
[코어 1] eBPF 3요소: ( ? ) / 샌드박스 실행 / ( ? ) 컴파일
  verifier가 막는 것: ( ? ) 루프, 범위 밖 메모리 접근, 스택 크기 초과
  NIC → ( ? ) (가장 이른 훅, 아직 ( ? ) 없음) → sk_buff 할당 → ( ? ) 훅 → 커널 스택
  XDP는 "( ? )"에, TC는 "( ? )"에 최적화. Cilium 로직 대부분은 ( ? )

[코어 2] 유저스페이스 ( ? ) ↔ ( ? )로만 통신 ↔ 커널 BPF 프로그램
  맵 종류 2: ( ? ) map(Pod IP→메타데이터) / ( ? ) map(ClusterIP:Port→백엔드)
  에이전트가 죽어도 ( ? )은 유지
  kubeProxyReplacement=true → 확인: cilium status | grep ( ? )

[코어 3] iptables 경로: connect → 패킷 생성 → ( ? ) 에서 DNAT → ( ? )에 기록 → 매 패킷 조회
  소켓 레벨 LB: ( ? ) 시스템콜을 BPF가 가로채 목적지를 Pod IP로 → DNAT·conntrack ( ? )
  한계: verifier ( ? ) 예산 → ( ? ) call로 쪼갬 / conntrack은 Pod-to-Pod·( ? ) 연결엔 여전히 필요
```

### 2. 인출 질문

1. eBPF가 커널을 크래시시키지 않는다는 보장은 무엇이 하는가? 그 외 두 요소는?

   <details markdown="1"><summary>답 확인</summary>

   적재 전 verifier의 정적 분석(무한 루프 금지, 메모리 접근 범위 검증, 스택 크기 제한). 나머지는 샌드박스 실행(BPF 맵으로만 상태 교환)과 JIT 컴파일(인터프리터 오버헤드 없음). → 코어 1 (1.1)

   </details>

2. XDP와 TC 훅은 패킷 파이프라인의 어디에 있으며 각각 무엇에 최적인가?

   <details markdown="1"><summary>답 확인</summary>

   XDP는 NIC 드라이버 직후로 `sk_buff` 할당 전이라 가장 이르고 빨리 버리거나 리다이렉트하기에 최적(컨텍스트는 빈약). TC는 `sk_buff`가 있어 더 풍부한 컨텍스트로 많은 일을 하기에 최적이며 Cilium의 서비스 LB·정책·캡슐화가 주로 여기서 일어난다. → 코어 1 (1.2)

   </details>

3. iptables 방식과 eBPF 방식이 Service 하나를 찾는 방법의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   iptables는 PREROUTING → KUBE-SERVICES 체인에서 서비스 개수만큼의 점프 규칙을 순서대로 비교해 KUBE-SVC-XXX → KUBE-SEP-YYY → DNAT. eBPF는 목적지 IP:포트를 키로 BPF 해시 맵을 룩업해 곧바로 백엔드를 확정한다. → 코어 1 (1.3)

   </details>

4. cilium-agent와 BPF 프로그램은 어떻게 상태를 주고받고, 에이전트가 죽으면 어떻게 되는가?

   <details markdown="1"><summary>답 확인</summary>

   직접 메모리를 공유하지 않고 BPF 맵(`bpf()` 시스템콜)으로만 주고받는다. 에이전트가 죽어도 이미 적재된 프로그램과 맵은 커널에 남아 트래픽을 계속 처리한다. → 코어 2 (2.1)

   </details>

5. `kubeProxyReplacement=true`에서 14&#126;17장의 경로는 어떻게 대체되는가?

   <details markdown="1"><summary>답 확인</summary>

   EndpointSlice → kube-proxy → iptables/IPVS가 EndpointSlice → cilium-agent → BPF 맵으로 바뀐다. ClusterIP/NodePort/LoadBalancer 라우팅과 세션 어피니티 등 kube-proxy의 책임 전부가 BPF 맵과 소켓 레벨 로드밸런싱으로 이관된다. → 코어 2 (2.2)

   </details>

6. 소켓 레벨 로드밸런싱이 DNAT·conntrack을 없애는 원리를 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   `connect()`/`sendmsg()` 시스템콜 시점에 BPF 프로그램이 소켓의 목적지를 실제 Pod IP로 바로 써 넣는다. 커널은 처음부터 "Pod IP로 가는 패킷"만 만들므로 패킷 레벨 DNAT도, 반환 패킷을 위한 conntrack 항목도 필요 없다. 연결이 맺어지는 한 순간에만 결정이 내려진다. → 코어 3 (3.1)

   </details>

7. CiliumNetworkPolicy는 Service 라우팅과 같은 경로를 쓰는가? L7 규칙은 어떻게 처리되는가?

   <details markdown="1"><summary>답 확인</summary>

   그렇다. 같은 TC 훅 BPF 프로그램과 맵(endpoint map, 정책 맵, service map)을 쓰며 한 패킷 처리 경로에서 함께 조회한다. L7 규칙(HTTP 메서드/경로)이 있을 때만 패킷 일부가 유저스페이스 Envoy 프록시로 위임되고 나머지는 커널을 벗어나지 않는다. → 코어 3 (3.2)

   </details>

8. eBPF에도 "무한한 로직" 한계가 있다. 무엇이고 어떻게 우회하는가? conntrack은 완전히 사라지는가?

   <details markdown="1"><summary>답 확인</summary>

   verifier가 프로그램 하나의 명령어 수·분기 경로 조합에 복잡도 예산을 두어 넘으면 적재가 거부된다. tail call로 로직을 여러 작은 프로그램으로 쪼개 예산 안에 맞춘다. conntrack은 Service 경유 트래픽에서만 줄고, 일반 Pod-to-Pod·외부 연결은 여전히 쓰므로 사라지지 않는다. → 코어 3 (3.3)

   </details>

### 3. 기억 고리

- **C++ 유추:** eBPF 프로그램 = 커널에 꽂는 플러그인 함수, BPF 맵 = 유저/커널이 공유하는 `unordered_map`. ⚠️ 깨지는 곳: 커널 모듈과 달리 verifier가 적재 전에 검증하며, 맵 외에는 상태를 못 주고받는다. 임의 포인터·무한 루프 같은 C++의 자유는 없다.
- **비유:** iptables 체인 = 위에서부터 한 줄씩 읽어 내려가는 긴 규정집, BPF 맵 = 색인(인덱스)으로 한 번에 찾는 사전. ⚠️ 비유가 깨지는 지점: 사전에도 "한 번에 담을 수 있는 크기"가 있듯, eBPF에도 verifier 복잡도 예산이라는 상한이 있어 tail call로 쪼개야 한다.
- **묶음(3의 법칙):** eBPF 3요소(검증·샌드박스·JIT), 코어 3개(훅·맵 / 에이전트-커널 분리 / 소켓 LB·정책·한계), 훅 2종(XDP/TC) + 소켓 시스템콜 지점, 도구 3개(`cilium status`, `hubble observe`, `cilium monitor`).
- **대칭·순서:** 순회 ↔ 룩업, 패킷마다 DNAT ↔ 연결 시 한 번, 제어(에이전트) ↔ 데이터(커널 프로그램), XDP(빨리 버리기) ↔ TC(많은 일).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Cilium이 iptables 없이 Service를 라우팅하는 방법"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "`connect()` 시점에 목적지를 바꾸는 것과 패킷마다 DNAT하는 것의 차이, 그리고 conntrack이 왜 줄어드는가"를 설명해 보세요.
- **랜덤 논리 게임:** A "eBPF 대체는 conntrack 문제를 해결하므로 무조건 도입해야 한다" vs B "소켓 LB는 Service 트래픽만 줄이고 verifier·운영 복잡도가 있으니 신중해야 한다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 XDP/TC 훅과 Cilium 구조를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/19-eBPF-데이터플레인과-네트워크-트러블슈팅.md (19.1 eBPF 개요와 XDP/TC 훅, 19.2 Cilium 내부 아키텍처, 19.3 노드 레벨 자원 고갈의 conntrack 부분, 19.4 Hubble, 19.5 `cilium monitor`·BPF verifier 복잡도 예산·conntrack 크기 튜닝); Kubernetes_Internals_Network_Guide/03-네트워크/18-NetworkPolicy와-네트워크-보안.md (18.2 iptables 기반 vs eBPF 기반 시행)*
