---
title: "21장. NetworkPolicy와 네트워크 보안"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 21
---

# 21장. NetworkPolicy와 네트워크 보안

> **🎮 게임 서버 개발자에게** — 게임 서버 운영에서는 방화벽(보안 그룹, iptables)으로 "DB 포트는 게임 서버에서만", "관리 포트는 사무실 IP에서만" 열어 두었을 것이다. 쿠버네티스의 NetworkPolicy가 그 역할이지만 결정적으로 다른 점이 둘 있다. 첫째, 기본값이 **전부 허용**이다. 클러스터 안의 어떤 Pod도 다른 모든 Pod와 통신할 수 있다. 둘째, NetworkPolicy는 **스펙(선언)일 뿐 시행은 CNI의 몫**이다. 시행하지 않는 CNI에서는 정책을 만들어도 에러도 경고도 없이 조용히 무시된다. 게다가 YAML 하이픈(`-`) 위치 하나가 AND와 OR를 가르므로, "방화벽을 열었다고 생각했는데 더 넓게/좁게 열린" 사고가 흔하다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 정책을 적용했는데 여전히 통신이 된다 → 이 CNI가 NetworkPolicy를 시행하는지(Flannel, kind 기본 kindnet은 미지원)부터 확인한다.
> - 기본 거부를 걸었더니 서비스 호출이 전부 "이름을 못 찾는다"며 실패한다 → DNS egress 허용을 빠뜨렸다.
> - "frontend만 허용"했는데 다른 네임스페이스의 모든 Pod까지 열렸다 → `from` 리스트의 하이픈 위치(OR vs AND)를 본다.

## 코어 — 이것만은 100%

> **한 문장:** 격리는 정책이 선택한 Pod의 `policyTypes` 방향별로 일어나고 한 연결은 출발 Pod의 egress와 도착 Pod의 ingress 양쪽이 모두 허용해야 통과하며, 이 판정의 시행은 kube-proxy가 아니라 CNI가 하므로 CNI가 지원해야만 효과가 있고, 표준 NetworkPolicy가 못 하는 일(deny·우선순위·클러스터 전역·L7·FQDN)은 CNI 확장이나 AdminNetworkPolicy가 맡는다.

1. **격리는 Pod·방향 단위이고, 연결은 양쪽 판정이다** — 정책이 선택한 Pod의 `policyTypes`에 쓴 방향만 격리되고, 출발 Pod의 egress와 도착 Pod의 ingress가 모두 허용해야 한다. 허용은 합집합으로 누적되며 한 정책이 다른 정책의 허용을 부정하지 못한다.
2. **셀렉터 조합의 의미는 구조가 정한다** — 별도 항목은 OR, 한 항목 안은 AND. 빈 `podSelector`는 같은 네임스페이스 전체, `ipBlock`은 CIDR 기준이라 NAT와 실제 경로의 영향을 받는다.
3. **시행자는 CNI이고, 표준에는 한계가 있다** — Calico/Cilium/Antrea는 시행하고 Flannel·kindnet은 미지원이다. iptables 기반은 규칙 수에 비례해 순회 비용이 늘고 eBPF 기반은 맵 룩업이다. 표준의 한계 4가지는 CNI별 확장으로 메운다.
4. **제로 트러스트 설계는 "기본 거부 → 최소 허용 → DNS 확인 → 자동 배포 → 관리자 가드레일"이다** — 클러스터 전역 규칙은 AdminNetworkPolicy(아직 v1alpha1)가 맡는다.

**이 장의 학습 목표**

- 격리 단위(Pod·방향)와 양쪽 판정(출발 egress + 도착 ingress)을 설명하고 연결 가능 여부를 판정한다.
- `podSelector`/`namespaceSelector`/`ipBlock` 조합에서 AND와 OR가 갈리는 지점과 빈 셀렉터·`ipBlock`의 의미를 정확히 판단한다.
- NetworkPolicy가 스펙일 뿐이고 CNI별로 시행 여부·확장 범위가 다름을 설명하고, 표준의 한계 4가지에 대응하는 CNI 확장을 안다.
- 기본 거부 + 명시적 허용 + DNS 예외로 네임스페이스를 설계하고, 새 네임스페이스에 자동으로 깔 방법(번들·HNC·Kyverno)을 안다.
- AdminNetworkPolicy/BaselineAdminNetworkPolicy의 우선순위와 위상(v1alpha1)을 이해한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 호스트 방화벽(iptables)으로 포트·출발지를 제한 | NetworkPolicy | 누가 어느 포트로 들어올 수 있는지 규칙으로 정한다 | 규칙의 주체가 IP가 아니라 **라벨 셀렉터**다(`podSelector`, `namespaceSelector`). Pod IP가 바뀌어도 규칙은 유지된다 |
| 방화벽의 기본 정책(기본 허용 후 차단 목록 추가) | 정책 없을 때의 전허용 | 규칙이 없으면 열려 있다 | Pod가 정책에 "선택되는 순간" **그 Pod만** 기본 거부로 뒤집힌다. 네임스페이스 전체가 한꺼번에 바뀌지 않는다 |
| 방화벽에 DROP 규칙을 추가해 막기 | 표준 NetworkPolicy | 접근을 제한한다 | 표준에는 **deny 규칙이 없고 허용만 쌓인다**(합집합). 막으려면 "선택해서 거부로 만든 뒤 허용을 최소로" |
| `iptables -A INPUT -s A -p tcp --dport 80` (조건은 한 줄에 AND) | `from` 리스트 | 조건을 조합한다 | 리스트 항목이 여러 개면 OR, 한 항목 안에서는 AND. 하이픈 위치로 의미가 뒤집힌다 |
| 방화벽 규칙을 적용하는 커널 모듈(netfilter) | CNI의 시행(iptables/eBPF) | 규칙을 커널 데이터플레인에 반영한다 | 오브젝트를 저장해도 CNI가 시행하지 않으면 **조용히 무시**된다. kube-proxy는 관여하지 않는다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. client Pod의 egress는 전부 허용인데 server Pod에 "frontend만 허용" ingress 정책이 걸려 있다. client가 frontend가 아니면 연결될까? 반대로 client의 egress가 막혀 있고 server의 ingress는 열려 있으면?
> 2. 정책 하나가 다른 정책이 허용한 트래픽을 "부정"할 수 있을까? `ingress: []`는 그때 무엇을 뜻할까?
> 3. 표준 NetworkPolicy로는 도저히 표현할 수 없는 규칙을 네 가지만 꼽으라면?
> 4. `from` 아래에 `namespaceSelector`와 `podSelector`를 별도 `-` 항목으로 쓴 것과 같은 항목에 쓴 것은 어떻게 다를까?
> 5. kube-proxy가 NetworkPolicy를 시행할까? Flannel 클러스터에 정책을 적용하면 무슨 일이 생길까?
>
> **처리법:** 🛠 실습 `default-deny-ingress` 적용 전/후 `wget --timeout=3`, 허용 정책 추가, 라벨 없는 Pod로 차단 확인(Calico 같은 시행 CNI 필요), 양쪽 판정 시나리오 · 🗺 관계도 출발 egress → 도착 ingress 양쪽 판정, AdminNetworkPolicy → NetworkPolicy → BaselineAdminNetworkPolicy, 3계층 앱의 허용 화살표 · 📦 카드 CNI별 시행표, 표준 한계 4가지↔확장, OR/AND 두 YAML, DNS 허용 변형 3종 · 유추 비판 "방화벽 DROP 규칙" 유추가 표준 NetworkPolicy에서 왜 틀리는가

---

## 코어 1. 격리는 Pod·방향 단위이고, 연결은 양쪽 판정이다

### 1.1 전환 단위와 `policyTypes`

**한 줄 요약:** 정책이 선택한 Pod의, `policyTypes`에 쓴 방향만 "명시 허용 외 전부 거부"로 바뀐다. 입문 책이 짧게 다룬 이 전환을 필드 수준에서 본다.

> **입문 책에서 배운 것** — 정책이 없으면 전허용이고, 정책이 선택한 Pod는 명시된 것 외 거부이며, 허용만 누적되고, CNI가 지원해야 동작한다. 기본 거부 YAML과 DNS 예외는 [입문 책 25장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/25-인증-인가-보안-오토스케일링.md) 3.4&#126;3.5절에 있다.

[13장](13-쿠버네티스-네트워크-모델과-Pod-네트워크.md)의 IP-per-Pod 모델은 "모든 Pod가 NAT 없이 서로 통신"이 기본이라 네트워크 위치만으로는 아무 보호가 없다. 이 장이 그 기본값을 뒤집는 방법이다. 한 정책은 네 칸으로 이루어진다. ① `podSelector`(적용 대상), ② `policyTypes`(통제할 방향), ③ `ingress[].from`(`podSelector`/`namespaceSelector`/`ipBlock` 항목들)·`ports`, ④ `egress[].to`·`ports`. 원천의 `api-policy` 예시는 app=api Pod에 `[Ingress, Egress]`를 걸고 ingress는 frontend·team=platform 네임스페이스·`10.0.0.0/8`(`except: [10.0.5.0/24]`)의 TCP 8080을, egress는 database의 TCP 5432만 허용한다.

- `policyTypes`에 `Ingress`만 있으면 그 Pod의 **Egress는 여전히 전허용**이다(반대도 같다). 두 방향을 모두 제한하려면 `[Ingress, Egress]`를 명시하고 두 블록을 채운다. 원천(qustion 07)도 같은 말을 한다. ingress만 선택한 정책은 그 Pod의 egress를 제한하는 규칙이 아니다.
- `egress`를 비워 두면(`egress: []`) 그 방향은 "무엇도 허용하지 않음"이 된다. "나가는 곳이 없는" DB 티어를 만드는 방법이다.
- 정책의 빈 `podSelector`(`podSelector: {}`)는 그 네임스페이스의 Pod 전체를 고른다. `api-policy`의 ingress `from`에 나열한 세 항목은 별도 리스트 항목이므로 서로 OR다(코어 2).

### 1.2 연결은 출발 Pod의 egress와 도착 Pod의 ingress 양쪽에서 판정된다

**한 줄 요약:** 한쪽이 열려 있어도 다른 쪽이 격리 방향에서 허용하지 않으면 그 연결은 통과하지 못한다.

원천(qustion 10 4절)의 모델은 이렇다. 정책으로 격리되지 않은 방향의 Pod 트래픽은 허용된다. 특정 Pod를 고르는 ingress 정책이 생기면 그 Pod의 ingress는 **적용되는 정책들이 허용한 합집합**으로 제한된다. egress도 **별도로** 판단한다. 그래서 **출발 Pod의 egress와 도착 Pod의 ingress 양쪽이 해당 연결을 허용해야 한다.**

```
출발 Pod ──(egress 판정)──▶ 도착 Pod ──(ingress 판정)──▶ 도착 Pod의 소켓
   둘 중 하나라도 "격리 + 허용 목록에 없음"이면 그 연결은 통과하지 못한다
```

> **[보충]** 위 도식은 원천의 한 문장을 그림으로 풀어 쓴 것이다. 게임 서버로 치면 클라이언트 쪽 아웃바운드 규칙과 서버 쪽 인바운드 규칙을 둘 다 통과해야 접속이 되는 것과 같다. 응답 패킷의 상태 추적 여부는 이 장의 원천에 설명이 없어 다루지 않는다.

### 1.3 정책은 합집합으로 누적되고, 서로를 부정하지 못한다

**한 줄 요약:** 같은 Pod에 여러 정책이 적용되면 허용 규칙이 전부 합쳐진다. 표준 NetworkPolicy에는 deny도, "첫 번째 규칙 우선" 같은 순서도 없다.

정책 A(frontend 허용) + 정책 B(monitoring의 9090 포트 허용) = api Pod는 둘 다 허용.

원천(qustion 07)은 두 가지를 못 박는다. 정책 사이에 일반 방화벽처럼 **첫 번째 규칙 우선순위가 있다고 생각하지 않는다.** 그리고 대상 Pod를 골라 `policyTypes: [Ingress]`, `ingress: []`로 두면 그 방향의 기본 차단을 표현할 수 있지만, 이것이 **다른 정책이 허용한 트래픽까지 부정하지는 않는다.**

> **🎮 연결** — 방화벽에서 "허용 목록만 계속 추가"하는 모델이다. 허용 규칙끼리는 충돌하지 않고 어느 하나라도 허용하면 통과한다. 그래서 막고 싶을 때는 DROP을 추가하는 게 아니라 **이 Pod를 정책의 대상으로 선택해 기본 거부로 만들고** 허용 목록을 최소로 유지한다. 다른 팀이 추가한 정책이 허용을 넓히면 내 `ingress: []`로도 못 막는다.

---

## 코어 2. 셀렉터 조합의 의미는 구조가 정한다

### 2.1 리스트 항목이냐, 한 항목 안이냐

**한 줄 요약:** `from`/`to` 리스트의 별도 항목은 OR, 한 항목 안에 함께 쓴 필드는 AND. 들여쓰기 한 칸이 허용 범위를 가른다.

> **입문 책에서 배운 것** — 하이픈(`-`)을 따로 쓰면 OR, 한 항목에 함께 쓰면 AND이고 실무에서 가장 흔한 실수다. DNS 예시로 AND를 본 것은 [입문 책 25장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/25-인증-인가-보안-오토스케일링.md) 3.5절이다. 여기서는 같은 두 필드의 두 형태를 나란히 놓고 허용 집합을 따져 본다.

```yaml
# 케이스 ① — 리스트의 별도 항목: OR
ingress:
  - from:
      - podSelector:
          matchLabels: { app: frontend }
      - namespaceSelector:
          matchLabels: { team: platform }
# 의미: "같은 네임스페이스의 app=frontend Pod" 또는
#       "team=platform 라벨이 붙은 네임스페이스의 *모든* Pod"
```

```yaml
# 케이스 ② — 한 항목 안에 함께: AND
ingress:
  - from:
      - namespaceSelector:
          matchLabels: { team: platform }
        podSelector:
          matchLabels: { app: frontend }
# 의미: "team=platform 네임스페이스 안의, app=frontend 라벨을 가진 Pod만"
```

케이스 ①은 하나만 맞아도 허용, 케이스 ②는 둘을 동시에 만족해야 한다. 원천(qustion 10)도 `namespaceSelector`와 `podSelector`를 같은 항목에 함께 두는 것과 별도 항목으로 나누는 것이 AND와 OR의 차이를 만든다고 짚는다.

### 2.2 셀렉터 종류별 의미: 빈 셀렉터와 `ipBlock`

**한 줄 요약:** `podSelector`는 같은 네임스페이스(`namespaceSelector`가 없을 때), `namespaceSelector`는 네임스페이스 전체 Pod, `ipBlock`은 CIDR이며 NAT와 실제 경로의 영향을 받는다.

| 항목 | 의미 | 주의 |
|---|---|---|
| `podSelector` 단독 | 같은 네임스페이스의 Pod | `from: - podSelector: {}`는 같은 네임스페이스의 모든 Pod |
| `namespaceSelector` 단독 | 그 네임스페이스의 **모든** Pod | 케이스 ①이 넓게 열리는 이유 |
| 둘을 한 항목에 | 그 네임스페이스 안의 그 Pod만(AND) | 케이스 ② |
| `ipBlock` (`cidr`, `except`) | IP CIDR 범위 기준 | 원천(qustion 07): NAT와 실제 경로의 영향 확인 |

> **[보충]** `podSelector: {}`가 같은 네임스페이스 전체를 뜻한다는 점은 원천 18.3절 주석(`namespaceSelector 없음 = 같은 NS`)에서 가져왔다. 같은 이유로 케이스 ①의 첫 항목이 "같은 네임스페이스의 frontend"로 읽힌다.

`ipBlock`의 `except`는 egress에서 "외부는 허용하되 메타데이터 서비스와 사설 대역은 뺀다"는 식으로 쓴다. 원천(textbook 18.4)의 예시다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-external-except-metadata
  namespace: production
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32     # ★ 클라우드 메타데이터
              - 10.0.0.0/8             # 내부망 (필요에 따라)
              - 172.16.0.0/12
              - 192.168.0.0/16
```

---

## 코어 3. 시행자는 CNI이고, 표준에는 한계가 있다

### 3.1 스펙과 시행은 별개

**한 줄 요약:** API 서버는 NetworkPolicy를 저장만 한다. kube-proxy도 관여하지 않는다. CNI가 watch해서 자기 데이터플레인에 반영해야 차단이 일어난다.

> **입문 책에서 배운 것** — 지원하지 않는 CNI(Flannel, kindnet)에서는 정책을 만들어도 조용히 무시된다. 이 장은 CNI별로 무엇이 다른지에 집중한다.

[17장](17-kube-proxy-데이터플레인.md)의 kube-proxy는 Service 가상 IP를 Pod IP로 바꾸는 일만 한다. 막고 허용하는 결정은 전적으로 CNI 플러그인의 몫이다. 그래서 `kubectl apply`가 성공해도 집행의 증거가 아니다. 원천(qustion 07)의 확인법은 `describe networkpolicy`와 **실제 Pod-to-Pod 연결을 함께** 보는 것이다.

| CNI | NetworkPolicy 시행 | 비고 |
|---|---|---|
| **Calico** | 지원 | iptables 또는 eBPF 데이터플레인 중 선택 가능 |
| **Cilium** | 지원 | eBPF 전용. 자체 `CiliumNetworkPolicy` CRD로 L7까지 확장 |
| **Antrea** | 지원 | Open vSwitch 기반 |
| **AWS VPC CNI** | 지원(일정 버전 이상) | 별도 네트워크 정책 에이전트 구성 필요. 선택한 환경의 지원·활성화 조건을 확인한다 |
| **Flannel** | **미지원** | 단순 오버레이 전용, 정책 개념 자체가 없다 |
| **kindnet** (kind 기본 CNI) | **미지원** | `kind create cluster` 기본값 그대로는 항상 무시된다 |

"정책을 적용했는데 여전히 통신된다"면 먼저 `kubectl get pods -n kube-system`으로 어떤 CNI가 떠 있는지 확인한다. CNI의 종류와 방식은 [14장](14-CNI-스펙과-IPAM.md)·[15장](15-CNI-플러그인과-패킷-경로.md)에서 다뤘다.

### 3.2 iptables 기반 vs eBPF 기반 시행

**한 줄 요약:** 규칙 기반은 규칙이 늘수록 순회 비용이 늘고, 맵 기반은 규칙이 늘어도 조회 비용이 거의 늘지 않는다.

- **iptables 기반**(Calico iptables 모드 등): 정책 × 대상 Pod 수에 비례해 규칙 평가 비용이 늘고, 갱신 때 체인 전체를 순회해야 할 수 있어 수천 정책·수만 Pod에서 패킷당 지연이 눈에 띌 수 있다.
- **eBPF 기반**(Cilium, Calico eBPF 모드): 정책이 BPF 맵(해시 테이블)으로 컴파일되어 조회가 맵 룩업(대체로 O(1)에 가까움)이고, 갱신이 맵 갱신만으로 되는 경우가 많다.

kube-proxy iptables 모드의 선형 증가와 같은 패턴이다. eBPF 쪽 원리는 [22장](22-eBPF-데이터플레인과-Cilium.md), iptables 체인은 [5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md)이다.

### 3.3 Cilium의 L7 확장

**한 줄 요약:** 표준은 L3/L4(IP, 포트)까지. `CiliumNetworkPolicy`는 HTTP 메서드·경로와 도메인 이름(FQDN)까지 쓴다.

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: api-l7-policy
  namespace: shop
spec:
  endpointSelector:
    matchLabels: { app: api }
  ingress:
    - fromEndpoints:
        - matchLabels: { app: frontend }
      toPorts:
        - ports: [{ port: "8080", protocol: TCP }]
          rules:
            http:
              - method: "GET"
                path: "/api/v1/.*"
              - method: "POST"
                path: "/api/v1/orders$"
  egress:
    - toFQDNs:                       # 도메인 이름 기반 — 표준 NetworkPolicy는 IP만 가능
        - matchName: "api.stripe.com"
```

"같은 8080 포트라도 `GET /api/v1/*`만 허용하고 `DELETE`는 거부"는 표준(L3/L4)으로 원천적으로 표현할 수 없다. 패킷 헤더와 포트만이 아니라 애플리케이션 프로토콜 내용을 파싱해야 하기 때문이다. Cilium은 eBPF 데이터플레인에 프록시(Envoy)를 부분적으로 결합해 이를 구현한다([22장](22-eBPF-데이터플레인과-Cilium.md)).

### 3.4 표준의 한계 4가지와 CNI별 확장

**한 줄 요약:** L3/L4만, deny·우선순위 없음, 클러스터 전역 없음, 도메인 이름 불가. 이 네 빈칸을 CNI 확장과 AdminNetworkPolicy가 나눠 메운다.

원천(textbook 18.4)이 꼽는 표준 NetworkPolicy의 한계와 각각에 대응하는 확장은 다음과 같다.

| 표준의 한계 | 메우는 쪽 | 이 책의 위치 |
|---|---|---|
| **L3/L4만.** HTTP 경로·메서드로 제어 불가 | `CiliumNetworkPolicy`(L7: HTTP, 원천 textbook 23.3은 gRPC·Kafka 수준도 언급) | 3.3 |
| **거부 규칙이 없다.** 허용만 있고 우선순위도 없다 | Calico `GlobalNetworkPolicy`(거부 규칙·우선순위), `AdminNetworkPolicy`(Allow/Deny/Pass + priority) | 아래, 4.3 |
| **클러스터 전역 정책이 없다.** 네임스페이스마다 만들어야 한다 | Calico `GlobalNetworkPolicy`, `AdminNetworkPolicy` | 아래, 4.3 |
| **egress에 도메인 이름을 쓸 수 없다.** IP만 가능 | `CiliumNetworkPolicy`의 `toFQDNs` | 3.3 |

Calico의 `GlobalNetworkPolicy`는 클러스터 전역·거부·우선순위(`order`)를 한 리소스에서 준다. 원천(textbook 23.3)의 메타데이터 차단 예시다. 2.2절의 `ipBlock` 정책이 네임스페이스마다 만들어야 했던 일을 한 번에 한다.

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

---

## 코어 4. 제로 트러스트 설계: 기본 거부, DNS 예외, 자동 배포, 관리자 가드레일

### 4.1 순서: 기본 거부 → 최소 허용 → DNS 확인

**한 줄 요약:** 네임스페이스에 기본 거부를 먼저 깔고, 필요한 통신만 허용하며, DNS처럼 당연히 되던 것이 막히지 않는지 확인한다. 이 절은 DNS 예외의 "정확도"를 본다.

> **입문 책에서 배운 것** — 네임스페이스 `default-deny-ingress`(`podSelector: {}`)로 시작해 필요한 통신만 열고, Egress를 막으면 DNS도 막히므로 `kube-system`의 `k8s-app: kube-dns`로 가는 UDP/TCP 53을 허용한다. 두 YAML은 [입문 책 25장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/25-인증-인가-보안-오토스케일링.md) 3.4&#126;3.5절이다.

Egress까지 기본 거부하려면 `policyTypes: [Egress]`에 `egress` 규칙이 없는 정책을 하나 더 둔다(`default-deny-egress`). 이때 CoreDNS로 가는 조회도 막히므로 Service 이름을 못 찾아 앱에는 네트워크가 통째로 죽은 것처럼 보인다. textbook 원천은 NetworkPolicy 적용 후 갑자기 모든 것이 안 되는 사고의 90%가 DNS 차단이라고 적는다(DNS 구조는 [18장](18-DNS와-서비스-디스커버리.md)).

원천에는 DNS 예외가 세 가지 모양으로 나온다. 같은 "DNS 허용"인데 열리는 범위가 다르다.

| 출처 | 대상(`to`) | 포트 |
|---|---|---|
| Internals 18.3 `allow-dns-egress` | `namespaceSelector`(kube-system) + `podSelector`(`k8s-app: kube-dns`)를 **한 항목에**(AND) | UDP 53, TCP 53 |
| textbook 13.5 `allow-dns`(팀 네임스페이스 번들) | `namespaceSelector`(kube-system)만 | UDP 53, TCP 53 |
| textbook 18.4 티어별 예시(frontend·backend) | `namespaceSelector`(kube-system)만 | **UDP 53만** |

> **[보충]** 표는 원천 YAML을 나란히 읽어 정리한 것이다. `podSelector`가 없는 둘째·셋째 모양은 코어 2의 규칙(`namespaceSelector` 단독 = 그 네임스페이스 전체)에 따라 kube-system의 모든 Pod로 가는 53번을 열고, 첫째 모양은 kube-dns Pod로 좁힌다. 셋째 모양의 UDP 전용이 TCP로 넘어가는 조회에 미치는 영향은 원천에 없다.

### 4.2 계층화와 자주 쓰는 패턴

**한 줄 요약:** "같은 네임스페이스는 전부 허용"과 "티어별 세분화"는 다른 신뢰 모델이다. 위협 모델에 따라 고른다.

- **베이스라인:** `podSelector: {}` + ingress `from: - podSelector: {}`. 같은 네임스페이스 안의 통신만 허용하고 네임스페이스 간은 기본 차단한다.
- **워크로드별:** `tier: api`를 고르고 `tier: frontend`에서 오는 TCP 8080만 허용한다.

규제가 엄격한 환경(금융, 의료)일수록 같은 네임스페이스 안에서도 티어 간 통신을 명시적으로만 허용하는 편이 안전하다.

```
패턴 1 — 3계층 애플리케이션
  frontend: 인그레스에서만 인바운드(원천 예시는 ingress-nginx 네임스페이스를 namespaceSelector로 지정), backend로만 아웃바운드 + DNS
  backend:  frontend에서만 인바운드, database로만 아웃바운드 + DNS
  database: backend에서만 인바운드, 아웃바운드 없음

패턴 2 — 네임스페이스 간 기본 차단
  각 네임스페이스에 default-deny-ingress
  필요한 교차 네임스페이스 통신만 namespaceSelector로 명시적 허용

패턴 3 — 클라우드 메타데이터 서비스 차단
  egress에서 169.254.169.254/32를 ipBlock.except로 제외 (2.2절 YAML)
  클러스터 전역으로 한 번에: Calico GlobalNetworkPolicy(3.4절) 또는 AdminNetworkPolicy(4.3절)

패턴 4 — 관측 파이프라인만 예외적으로 전방위 허용
  모니터링 네임스페이스에서 오는 스크레이핑 트래픽은
  기본 거부와 별개로 별도 정책에서 넓게 허용
```

> **🎮 연결** — 3계층 패턴은 게임 서버의 "게이트 → 게임 서버 → DB" 구조 그대로다. DB 티어에 egress 없음(`egress: []`)을 주면, DB가 침해돼도 바깥으로 연결을 못 연다.

### 4.3 AdminNetworkPolicy: 네임스페이스 소유자가 못 푸는 가드레일

**한 줄 요약:** 클러스터 스코프의 우선순위 있는 정책(Allow/Deny/Pass)과 기본값 정책. 두 API 모두 아직 `v1alpha1`이다.

표준 `NetworkPolicy`는 네임스페이스 스코프라 소유자(개발팀)가 자기 네임스페이스 안에서만 정의한다. "모든 네임스페이스에서 메타데이터 서비스 접근 차단", "DNS 등 핵심 통신은 항상 허용" 같은 규칙은 네임스페이스 경계 밖에서 강제해야 하며, 그것이 `AdminNetworkPolicy`(그리고 `BaselineAdminNetworkPolicy`)다.

평가 순서는 **AdminNetworkPolicy**(`priority` 숫자가 작을수록 먼저, Allow/Deny/Pass) → **NetworkPolicy**(`Pass`로 위임되었거나 매칭이 없을 때) → **BaselineAdminNetworkPolicy**(다른 무엇도 결정하지 않았을 때의 기본값)다.

| | `AdminNetworkPolicy` | `NetworkPolicy` | `BaselineAdminNetworkPolicy` |
|---|---|---|---|
| 스코프 | 클러스터 전역 | 네임스페이스 | 클러스터 전역 |
| 소유자 | 클러스터 관리자 | 네임스페이스 팀 | 클러스터 관리자 |
| 평가 순서 | **가장 먼저**(priority 순) | 그다음 | **가장 나중**(기본값) |
| 네임스페이스 정책이 덮어쓸 수 있는가 | 불가(Deny/Allow는 절대적) | - | 가능 |
| 용도 | 절대 어겨서는 안 되는 가드레일 | 팀별 세부 정책 | "아무도 정하지 않았을 때"의 안전한 기본값 |

`Pass` 액션은 "이 트래픽에 대한 결정을 다음 계층(네임스페이스 NetworkPolicy)에 넘긴다"는 뜻이다. 원천 예시:

```yaml
apiVersion: policy.networking.k8s.io/v1alpha1
kind: AdminNetworkPolicy
metadata:
  name: cluster-baseline-guardrail
spec:
  priority: 10                       # 숫자가 작을수록 먼저 평가
  subject:
    namespaces: {}                   # 클러스터 전체 네임스페이스 대상
  egress:
    - name: "deny-metadata-service"
      action: Deny                   # 절대 규칙 — 네임스페이스 정책이 뒤집을 수 없다
      to:
        - networks: ["169.254.169.254/32"]
    - name: "allow-dns"
      action: Allow
      to:
        - pods:
            namespaceSelector:
              matchLabels: { kubernetes.io/metadata.name: kube-system }
            podSelector:
              matchLabels: { k8s-app: kube-dns }
      ports:
        - portNumber: { protocol: UDP, port: 53 }
    - name: "delegate-rest"
      action: Pass                   # 나머지는 네임스페이스 NetworkPolicy가 판단
      to:
        - networks: ["0.0.0.0/0"]
```

> **지원 현황 — 아직 `v1alpha1`** — 두 리소스 모두 GA가 아니다. 원천에 따르면 워킹그룹이 둘을 `tier` 필드 하나로 통합한 `ClusterNetworkPolicy`(`v1alpha2`)를 후속 API로 제안한 상태라 스펙이 최종 형태가 아니다. CNI별 구현 시점과 완성도도 제각각이므로, 핵심 가드레일을 이 API 하나에만 의존하지 말고 CNI 자체 기능(예: `CiliumClusterwideNetworkPolicy`)이나 어드미션 정책과 병행하는 편이 안전하다. 코어 3의 "스펙과 시행은 별개" 원칙이 여기서도 적용되고, "스펙 자체도 아직 굳어지지 않았다"는 조건이 하나 더 붙는다.

### 4.4 네임스페이스마다 어떻게 깔고 유지하나: 번들, HNC, Kyverno

**한 줄 요약:** 네임스페이스가 수십 개가 되면 기본 거부를 손으로 깔 수 없다. 번들로 표준화하고, 부모에서 상속시키거나, 새 네임스페이스 생성 시 자동 생성한다.

원천(textbook 13.5, 13.6, 18.6)이 제시하는 세 가지 방법이다.

| 방법 | 내용 | 원천 |
|---|---|---|
| **네임스페이스 번들** | 소프트 멀티테넌시(같은 조직의 팀)의 구현 조합. 라벨·쿼터·LimitRange와 함께 `default-deny-ingress`, `allow-same-namespace`, `allow-dns`, RBAC를 한 묶음으로 깐다 | 13.5 |
| **HNC(Hierarchical Namespace Controller)** | 네임스페이스에 부모-자식 관계를 만들고 부모의 RoleBinding·NetworkPolicy·ResourceQuota를 자식으로 **전파**한다. `HNCConfiguration`에서 `networkpolicies`를 `mode: Propagate`로 지정한다 | 13.6 |
| **Kyverno `generate`** | 새 `Namespace`가 생길 때 `default-deny-ingress`를 자동 생성한다(`synchronize: true`) | 18.6 |

번들 방식에서 DNS 예외를 빠뜨리는 실수를 막으려면 4.1의 세 모양 중 하나로 `allow-dns`를 번들에 못 박아 둔다. 원천은 이 조합이 어디까지 적용되는지도 한계로 적는다. **테넌트가 임의의 코드를 실행할 수 있다면**(서로 신뢰하지 않는 고객) 네임스페이스 + NetworkPolicy로는 부족하고 별도 클러스터나 샌드박스 런타임이 필요하다. 컨테이너의 격리 경계가 커널이기 때문이다(하드 멀티테넌시).

---

## 실무 적용

### 체크리스트

- [ ] 정책을 적용하기 전에 `kubectl get pods -n kube-system`으로 CNI를 확인한다. 적용 뒤에는 `describe networkpolicy`와 **실제 Pod-to-Pod 연결**을 함께 본다(YAML 존재는 집행의 증거가 아니다).
- [ ] `policyTypes`에 방향을 명시한다. `Ingress`만 쓰면 Egress는 전허용으로 남는다. 연결은 출발 egress와 도착 ingress **양쪽**이 허용해야 통과한다.
- [ ] 기본 거부(`podSelector: {}`) → 최소 허용 순서로 만든다. Egress 기본 거부 시 DNS(UDP/TCP 53) 허용을 함께 두고, 대상 범위(kube-dns Pod만인지 kube-system 전체인지, UDP만인지)를 의식해서 고른다.
- [ ] `from`/`to`의 하이픈 위치를 검토한다(별도 항목 = OR, 한 항목 = AND). `namespaceSelector` 단독은 그 네임스페이스의 모든 Pod다.
- [ ] 표준 NetworkPolicy에는 deny도 순서도 없다. 허용 정책이 쌓일수록 넓어지고 `ingress: []`로도 다른 정책의 허용을 못 막는다.
- [ ] 클라우드 환경이면 메타데이터 서비스(`169.254.169.254/32`) egress 차단을 고려하고, 클러스터 전역으로 걸 수 있는 도구(Calico `GlobalNetworkPolicy`, AdminNetworkPolicy)를 확인한다.
- [ ] 네임스페이스가 늘어나면 번들·HNC 전파·Kyverno `generate` 중 무엇으로 기본 거부를 자동 배포할지 정한다.
- [ ] AdminNetworkPolicy를 쓰되 `v1alpha1`이라는 점, CNI별 지원 상태를 확인한다.

### 시나리오로 확인하기

1. **상황:** 개발 클러스터(kind 기본)에서 `default-deny-ingress`를 적용했는데 `wget backend`가 여전히 성공한다.
   **질문:** 원인과 확인 방법은?

   <details markdown="1"><summary>답 확인</summary>

   kind의 기본 CNI(kindnet)는 NetworkPolicy를 시행하지 않아 정책이 조용히 무시된다. `kubectl get pods -n kube-system`으로 CNI를 확인하고, 실제 차단을 재현하려면 `disableDefaultCNI: true`로 클러스터를 만들고 Calico를 설치한다. → 코어 3 (3.1)

   </details>

2. **상황:** shop 네임스페이스에 egress 기본 거부를 걸자 모든 Pod에서 Service 호출이 실패한다. `nslookup`도 안 된다.
   **질문:** 해결은?

   <details markdown="1"><summary>답 확인</summary>

   기본 거부가 CoreDNS로 가는 UDP/TCP 53도 막았다. `kube-system` 네임스페이스의 `k8s-app: kube-dns` Pod로 향하는 53 포트를 허용하는 `allow-dns-egress` 정책을 추가한다. 이때 `namespaceSelector`와 `podSelector`를 **한 항목 안에**(AND) 쓴다. → 코어 4 (4.1), 코어 2

   </details>

3. **상황:** "frontend만 api에 접근"을 의도해 `from`에 `podSelector: app=frontend`와 `namespaceSelector: team=platform`을 별도 `-` 항목으로 썼더니 platform 네임스페이스의 모든 Pod가 api에 접근한다.
   **질문:** 왜 그런가, 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   별도 리스트 항목은 OR이라 "같은 네임스페이스의 frontend Pod" 또는 "platform 네임스페이스의 모든 Pod"가 되었다. platform 네임스페이스의 frontend Pod만 허용하려면 `namespaceSelector`와 `podSelector`를 같은 항목 안에 함께 써서 AND로 만든다. → 코어 2

   </details>

4. **상황:** shop 네임스페이스의 client Pod에는 `default-deny-egress`와 backend 허용 규칙만 있고, backend Pod에는 `frontend`만 허용하는 ingress 정책이 있다. client(frontend 라벨이 아님)가 backend에 접속하려 하는데 실패한다. client의 egress 허용 목록에 backend가 있는데도 그렇다.
   **질문:** 왜인가, 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   연결은 출발 Pod의 egress와 도착 Pod의 ingress 양쪽이 허용해야 한다. client 쪽 egress는 열렸지만 backend의 ingress 허용 목록에 client가 없다. backend ingress 정책에 client의 라벨을 추가하는 허용 규칙을 더한다(허용은 합집합으로 누적된다). 반대로 backend ingress가 열려 있어도 client egress에 backend가 없으면 막힌다. → 코어 1 (1.2, 1.3)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
[코어 1] 정책 없음 = 기본 ( ? ). Pod가 podSelector에 ( ? )되면 해당 방향만 기본 ( ? )
  policyTypes에 Ingress만 → Egress는 ( ? ) / egress: [] → 그 방향 ( ? )
  연결 판정: 출발 Pod의 ( ? ) + 도착 Pod의 ( ? ) 양쪽이 모두 허용
  여러 정책 = ( ? )집합, 표준엔 ( ? ) 규칙·( ? ) 없음, ingress: []는 다른 정책의 허용을 ( ? )못 한다

[코어 2] 리스트 별도 항목 = ( ? ) / 한 항목 안 여러 필드 = ( ? )
  namespaceSelector 단독 = 그 네임스페이스의 ( ? ) Pod / podSelector: {} = ( ? )
  ipBlock = ( ? ) 기준, ( ? )와 실제 경로의 영향 확인

[코어 3] 시행자 = ( ? ), kube-proxy는 ( ? )
  시행 O: Calico, Cilium, Antrea, AWS VPC CNI / 시행 X: ( ? ), ( ? )
  iptables 시행: 규칙 수에 비례 ( ? ) / eBPF 시행: ( ? ) 룩업
  표준의 한계 4: L( ? )/L( ? )만 / ( ? )·우선순위 없음 / ( ? ) 전역 없음 / ( ? ) 이름 불가
  확장: Cilium(L7·( ? )), Calico( ? ), AdminNetworkPolicy

[코어 4] 순서: ( ? ) 먼저 → ( ? ) 허용 → ( ? ) 확인
  DNS 허용 변형: kube-dns Pod로 좁힘(AND) / kube-system ( ? )으로 넓음 / UDP만
  자동 배포 3: 번들 / ( ? ) 전파 / Kyverno ( ? )
  평가 순서: AdminNetworkPolicy → ( ? ) → BaselineAdminNetworkPolicy
  Admin 액션 3: Allow / Deny / ( ? ), 위상: v1( ? )
```

### 2. 인출 질문

1. 정책이 없는 클러스터와 정책이 선택한 Pod의 동작은 어떻게 다른가? 전환 단위는? `ingress` 정책만 걸면 egress는?

   <details markdown="1"><summary>답 확인</summary>

   정책이 없으면 모든 Pod가 모든 Pod/IP와 통신 가능(전허용). Pod가 `podSelector`에 매칭되는 NetworkPolicy를 가지면 그 Pod의 `policyTypes`에 쓴 방향이 명시 허용 외 전부 거부로 전환된다. 네임스페이스 전체가 아니라 **Pod 단위**, **방향 단위**다. `Ingress`만 쓰면 egress는 전허용으로 남는다. → 코어 1 (1.1)

   </details>

2. client Pod의 egress가 격리되지 않았고 server Pod의 ingress 허용 목록에 client가 없다. 연결되는가? 반대 경우는?

   <details markdown="1"><summary>답 확인</summary>

   둘 다 안 된다. 한 연결은 출발 Pod의 egress와 도착 Pod의 ingress 양쪽이 허용해야 통과한다. 앞 경우는 server의 ingress가 막고, 반대 경우(server ingress는 열림, client egress 격리에 server가 없음)는 client의 egress가 막는다. → 코어 1 (1.2)

   </details>

3. 같은 Pod에 정책 A(frontend 허용)와 정책 B(monitoring 허용)가 적용되면? `ingress: []`로 막은 정책을 추가하면?

   <details markdown="1"><summary>답 확인</summary>

   허용이 합집합으로 누적되어 frontend와 monitoring 양쪽을 모두 허용한다. 표준 NetworkPolicy에는 명시적 deny도 첫 규칙 우선 같은 순서도 없다. `ingress: []` 정책은 그 방향의 기본 차단을 표현하지만 다른 정책이 허용한 트래픽까지 부정하지는 못한다. → 코어 1 (1.3)

   </details>

4. 아래 두 YAML의 의미 차이를 말하라(① 별도 `-` 항목, ② 한 항목 안). `namespaceSelector` 단독, `podSelector: {}`, `ipBlock`은 각각 무엇을 고르는가?

   <details markdown="1"><summary>답 확인</summary>

   ①은 OR: 같은 네임스페이스의 frontend Pod 또는 team=platform 네임스페이스의 모든 Pod. ②는 AND: team=platform 네임스페이스 안의 app=frontend Pod만. `namespaceSelector` 단독은 그 네임스페이스의 모든 Pod, `podSelector: {}`는 같은 네임스페이스의 모든 Pod다. `ipBlock`은 CIDR 기준이며 `except`로 일부를 빼고(예: 메타데이터 `169.254.169.254/32`), NAT와 실제 경로의 영향을 확인해야 한다. → 코어 2 (2.1, 2.2)

   </details>

5. NetworkPolicy는 누가 시행하는가? 어떤 CNI가 시행하지 않으며, 적용했는지 어떻게 확인하는가?

   <details markdown="1"><summary>답 확인</summary>

   CNI 플러그인이 오브젝트를 watch해 자기 데이터플레인(iptables 체인, eBPF 프로그램 등)에 반영해 시행한다. kube-proxy는 Service 가상 IP 변환만 하고, API 서버는 저장만 한다. Flannel과 kindnet은 에러·경고 없이 조용히 무시한다. `describe networkpolicy`와 실제 Pod-to-Pod 연결을 함께 확인한다(YAML 존재는 집행의 증거가 아니다). → 코어 3 (3.1)

   </details>

6. iptables 기반과 eBPF 기반 시행의 규모 확장성 차이는?

   <details markdown="1"><summary>답 확인</summary>

   iptables 기반은 정책 × 대상 Pod 수에 비례해 순회 비용이 늘고, eBPF 기반은 정책이 BPF 맵으로 컴파일되어 맵 룩업이라 규칙이 늘어도 조회 비용이 거의 늘지 않는다. → 코어 3 (3.2)

   </details>

7. 표준 NetworkPolicy의 한계 네 가지와 각각을 메우는 확장은?

   <details markdown="1"><summary>답 확인</summary>

   ① L3/L4만(HTTP 경로·메서드 불가) → `CiliumNetworkPolicy` L7. ② 거부 규칙·우선순위 없음 → Calico `GlobalNetworkPolicy`, AdminNetworkPolicy. ③ 클러스터 전역 정책 없음 → `GlobalNetworkPolicy`, AdminNetworkPolicy. ④ egress에 도메인 이름 불가(IP만) → `CiliumNetworkPolicy`의 `toFQDNs`. → 코어 3 (3.3, 3.4)

   </details>

8. Egress 기본 거부 시 가장 흔한 실수와, 원천에 나오는 DNS 허용의 세 가지 모양의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   DNS 허용 누락(사고의 90%라고 textbook이 적음). 모양은 ① `namespaceSelector`+`podSelector`를 한 항목에 쓰는 kube-dns Pod 한정(AND) + UDP/TCP 53, ② `namespaceSelector`(kube-system)만 쓰는 번들형 + UDP/TCP 53, ③ `namespaceSelector`만 쓰고 UDP 53만 여는 티어별 예시다. ②③은 kube-system의 모든 Pod가 대상이다. → 코어 4 (4.1), 코어 2

   </details>

9. 네임스페이스가 수십 개일 때 기본 거부를 자동으로 깔 세 가지 방법은?

   <details markdown="1"><summary>답 확인</summary>

   소프트 멀티테넌시 번들(default-deny-ingress, allow-same-namespace, allow-dns, RBAC 등), HNC의 부모→자식 전파(`HNCConfiguration`에서 `networkpolicies` `mode: Propagate`), Kyverno `generate`(새 Namespace 생성 시 `default-deny-ingress` 자동 생성, `synchronize: true`). 신뢰할 수 없는 테넌트(임의 코드 실행)에는 부족하고 별도 클러스터·샌드박스 런타임이 필요하다. → 코어 4 (4.4)

   </details>

10. AdminNetworkPolicy와 BaselineAdminNetworkPolicy는 네임스페이스 NetworkPolicy와 어떤 순서·관계이고, 어떤 상태의 API인가?

    <details markdown="1"><summary>답 확인</summary>

    AdminNetworkPolicy는 가장 먼저(priority 순) 평가되고 Deny/Allow는 네임스페이스 정책이 뒤집을 수 없으며 `Pass`로 아래 계층에 위임할 수 있다. 그다음 NetworkPolicy, 마지막이 BaselineAdminNetworkPolicy(아무도 정하지 않았을 때의 기본값이며 네임스페이스 정책이 덮어쓸 수 있음). 둘 다 `v1alpha1`이고 후속 `ClusterNetworkPolicy`(`v1alpha2`)가 제안된 상태다. → 코어 4 (4.3)

    </details>

### 3. 기억 고리

- **C++ 유추:** NetworkPolicy = 서버 호스트의 iptables 방화벽 규칙. ⚠️ 깨지는 곳: 규칙 주체가 IP가 아니라 라벨이고, 표준에는 DROP 규칙도 순서도 없어 허용만 쌓인다. 또 아웃바운드(클라이언트 쪽)와 인바운드(서버 쪽) 양쪽을 모두 통과해야 접속이 되며, 방화벽 데몬이 없으면(시행 안 하는 CNI) 규칙이 **에러 없이 무시**된다.
- **비유:** 기본 전허용 = 문이 모두 열린 사무실, NetworkPolicy가 선택한 사람의 방만 "명단에 있는 사람만 입장"으로 바뀐다. 방문객은 자기 사무실을 나가는 문(egress)과 상대 방 입구(ingress) 둘 다 통과해야 한다. ⚠️ 비유가 깨지는 지점: 경비원(CNI)이 없는 건물(Flannel, kindnet)에서는 명단(정책)이 있어도 문이 열려 있다. 명단은 합집합으로만 늘어난다.
- **묶음(3의 법칙):** 선택자 3종(`podSelector`/`namespaceSelector`/`ipBlock`), 평가 계층 3개(Admin → NetworkPolicy → Baseline), Admin 액션 3개(Allow/Deny/Pass), 제로 트러스트 순서 3단계(기본 거부 → 최소 허용 → DNS 확인), 자동 배포 3방법(번들/HNC/Kyverno).
- **대칭·순서:** 리스트 OR ↔ 한 항목 AND, Ingress ↔ Egress(`policyTypes`, 양쪽 판정), iptables 순회 ↔ eBPF 맵 룩업, 표준 한계 4 ↔ 확장 4, 절대 규칙(Admin) ↔ 기본값(Baseline).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "정책을 하나 만들면 왜 그 Pod만 갑자기 막히는가, 그리고 왜 어떤 클러스터에서는 아무 일도 안 일어나는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "방화벽 DROP 규칙 대신 '선택해서 기본 거부 + 허용 추가'로 막는 이유와 하이픈 하나의 위험"을 설명해 보세요.
- **랜덤 논리 게임:** A "같은 네임스페이스 안은 전부 허용하는 베이스라인이면 충분하다" vs B "네임스페이스 안에서도 티어별로 세분화해야 한다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 NetworkPolicy의 기본 거부 전환과 AND/OR를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/18-NetworkPolicy와-네트워크-보안.md (18.1 NetworkPolicy 모델, 18.2 CNI별 구현 차이, 18.3 제로 트러스트 네트워킹 설계 패턴, 18.4 AdminNetworkPolicy); kubernetes-qustion-book/02_심화/10_보안과_확장_구조.md (4 NetworkPolicy — 출발·도착 양쪽 판단), 07_통신_오브젝트.md (NetworkPolicy — 합집합·`ingress: []`·`ipBlock`); kubernetes-textbook-main/04-클러스터-운영/18-워크로드-보안.md (18.4 메타데이터 차단·티어별 예시·표준 NetworkPolicy의 한계, 18.6 Kyverno generate), 13-네임스페이스와-멀티테넌시.md (13.5 소프트 멀티테넌시 번들, 13.6 HNC), 05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md (23.3 Calico GlobalNetworkPolicy·CNI 비교표·Antrea Traceflow), 03-애플리케이션-노출과-데이터/10-DNS와-서비스-디스커버리.md (10.6 "사고의 90%" 서술 대조)*
