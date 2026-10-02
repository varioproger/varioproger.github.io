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

> **한 문장:** 정책이 없으면 모든 Pod가 서로 통신할 수 있고, Pod가 하나라도 `podSelector`에 매칭되는 NetworkPolicy를 가지면 그 Pod의 해당 방향은 허용된 것만 통과하는 기본 거부로 바뀌며, 이 모든 시행은 kube-proxy가 아니라 CNI가 하므로 CNI가 지원해야만 효과가 있다.

1. **기본 전허용 → Pod 단위 기본 거부** — 정책의 `podSelector`에 매칭되는 Pod만, `policyTypes`에 명시된 방향만 거부로 전환된다. 여러 정책은 허용이 합집합으로 누적되고 표준 NetworkPolicy에는 deny 규칙이 없다.
2. **AND와 OR는 하이픈이 가른다** — `from`/`to` 리스트의 별도 항목은 OR, 한 항목 안의 여러 필드는 AND.
3. **시행자는 CNI다** — Calico/Cilium/Antrea는 시행하고 Flannel·kindnet은 미지원이다. iptables 기반 시행은 규칙 수에 비례해 순회 비용이 늘고, eBPF 기반은 맵 룩업이라 거의 늘지 않는다.
4. **제로 트러스트 설계: 기본 거부 먼저, DNS 예외, 최소 허용, 그리고 관리자 가드레일** — 네임스페이스 기본 거부 → 필요한 통신만 허용 → DNS 허용 확인. 클러스터 전역 규칙은 AdminNetworkPolicy(아직 v1alpha1)가 맡는다.

**이 장의 학습 목표**

- 기본 전허용과 정책 적용 시 기본 거부 전환, `policyTypes`의 방향 효과를 설명한다.
- `podSelector`/`namespaceSelector`/`ipBlock` 조합에서 AND와 OR가 갈리는 지점을 정확히 판단한다.
- NetworkPolicy가 스펙일 뿐이고 CNI별로 시행 여부가 다름을 설명한다.
- 기본 거부 + 명시적 허용 + DNS 예외로 네임스페이스를 설계한다.
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
> 1. NetworkPolicy가 하나도 없는 클러스터에서 서로 다른 네임스페이스의 Pod끼리 통신할 수 있을까?
> 2. Ingress만 막는 정책(`policyTypes: [Ingress]`)을 만들면 그 Pod의 Egress는 어떻게 될까?
> 3. 정책 A는 frontend를, 정책 B는 monitoring을 허용한다. 같은 Pod에 둘 다 적용되면?
> 4. `from` 아래에 `namespaceSelector`와 `podSelector`를 별도 `-` 항목으로 쓴 것과 같은 항목에 쓴 것은 어떻게 다를까?
> 5. kube-proxy가 NetworkPolicy를 시행할까? Flannel 클러스터에 정책을 적용하면 무슨 일이 생길까?
>
> **처리법:** 🛠 실습 `default-deny-ingress` 적용 전/후 `wget --timeout=3`, 허용 정책 추가, 라벨 없는 Pod로 차단 확인(Calico 같은 시행 CNI 필요) · 🗺 관계도 AdminNetworkPolicy → NetworkPolicy → BaselineAdminNetworkPolicy, 그리고 3계층 앱의 허용 화살표 · 📦 카드 CNI별 시행표, OR/AND 두 YAML, DNS 허용 정책(UDP/TCP 53) · 유추 비판 "방화벽 DROP 규칙" 유추가 표준 NetworkPolicy에서 왜 틀리는가

---

## 코어 1. 기본 전허용에서 Pod 단위 기본 거부로

### 1.1 전환은 Pod 단위, 방향 단위로 일어난다

**한 줄 요약:** 정책이 선택한 Pod의, `policyTypes`에 쓴 방향만 "명시 허용 외 전부 거부"로 바뀐다.

```
NetworkPolicy가 하나도 없는 클러스터
  → 모든 Pod가 모든 Pod, 모든 IP와 통신 가능 (Ingress/Egress 둘 다)

Pod가 하나라도 podSelector에 매칭되는 NetworkPolicy를 갖는 순간
  → 그 Pod의 해당 방향(policyTypes에 명시된 Ingress/Egress)은
     "정책이 명시적으로 허용한 트래픽 외에는 전부 거부"로 전환된다
```

[13장](13-쿠버네티스-네트워크-모델과-Pod-네트워크.md)에서 본 IP-per-Pod 모델은 "모든 Pod가 NAT 없이 서로 통신"이 기본이라, 네트워크 위치(같은 클러스터)만으로는 아무 보호가 없다. 이 장이 그 기본값을 뒤집는 방법이다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-policy
  namespace: shop
spec:
  podSelector:                 # ① 이 정책이 적용될 대상
    matchLabels:
      app: api
  policyTypes: [Ingress, Egress]   # ② 어느 방향을 통제할지

  ingress:                     # ③ 허용할 인바운드 규칙
    - from:
        - podSelector:
            matchLabels: { app: frontend }
        - namespaceSelector:
            matchLabels: { team: platform }
        - ipBlock:
            cidr: 10.0.0.0/8
            except: [10.0.5.0/24]
      ports:
        - { protocol: TCP, port: 8080 }

  egress:                      # ④ 허용할 아웃바운드 규칙
    - to:
        - podSelector:
            matchLabels: { app: database }
      ports:
        - { protocol: TCP, port: 5432 }
```

- `policyTypes`에 `Ingress`만 있으면 그 Pod의 **Egress는 여전히 전허용**이다(반대도 같다). 두 방향을 모두 제한하려면 `[Ingress, Egress]`를 명시하고 두 블록을 채운다.
- `egress`를 비워 두면(`egress: []`) 그 방향은 "무엇도 허용하지 않음"이 된다. "나가는 곳이 없는" DB 티어를 만드는 방법이다.

### 1.2 정책은 합집합으로 누적된다

**한 줄 요약:** 같은 Pod에 여러 정책이 적용되면 허용 규칙이 전부 합쳐진다. 표준 NetworkPolicy에는 명시적 deny가 없다.

```
정책 A: frontend → api 허용
정책 B: monitoring → api (9090 포트) 허용
────────────────────────────────
결과: api Pod는 frontend와 monitoring 양쪽으로부터의 트래픽을 모두 허용
      (둘 다 없으면 전부 거부였을 것을 각각의 허용 규칙이 넓힌다)
```

> **🎮 연결** — 방화벽에서 "허용 목록만 계속 추가"하는 모델이라고 보면 된다. 허용 규칙끼리는 충돌하지 않고, 어느 하나라도 허용하면 통과한다. 그래서 막고 싶을 때는 DROP을 추가하는 게 아니라 **이 Pod를 정책의 대상으로 선택해 기본 거부로 만들고** 허용 목록을 최소로 유지한다.

---

## 코어 2. AND와 OR는 하이픈이 가른다

### 2.1 리스트 항목이냐, 한 항목 안이냐

**한 줄 요약:** `from`/`to` 리스트의 별도 항목은 OR, 한 항목 안에 함께 쓴 필드는 AND.

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

```
리스트 항목이 여러 개  → OR (각 항목이 독립적인 "또는" 조건)
한 항목 안에 필드가 여러 개 → AND (그 항목 안에서는 "그리고" 조건)
```

케이스 ①은 하나만 맞아도 허용, 케이스 ②는 둘을 동시에 만족해야 한다. 들여쓰기 한 칸 차이로 방화벽 범위가 완전히 달라지며, "생각보다 너무 넓게 열렸다/좁게 막혔다" 사고의 상당수가 이 구분을 놓친 데서 나온다고 원천은 말한다.

> **[보충]** 같은 맥락에서 `from: - podSelector: {}`(네임스페이스 셀렉터 없음)는 "같은 네임스페이스의 모든 Pod"를 뜻한다는 점이 원천 18.3절 주석에 나온다(`namespaceSelector 없음 = 같은 NS`). 케이스 ①의 첫 항목이 "같은 네임스페이스의 frontend"로 읽히는 이유도 같다.

---

## 코어 3. 시행자는 CNI다

### 3.1 스펙과 시행은 별개

**한 줄 요약:** API 서버는 NetworkPolicy를 저장만 한다. kube-proxy도 관여하지 않는다. CNI가 watch해서 자기 데이터플레인에 반영해야 차단이 일어난다.

[17장](17-kube-proxy-데이터플레인.md)의 kube-proxy는 Service 가상 IP를 Pod IP로 바꾸는 일만 한다. 막고 허용하는 결정은 전적으로 CNI 플러그인의 몫이다.

```bash
kubectl apply -f networkpolicy.yaml
# 오브젝트는 성공적으로 저장된다.
# 그러나 CNI가 지원하지 않으면 트래픽은 조금도 달라지지 않는다.
# 에러도, 경고도 없다 — 조용히 무시된다.
```

| CNI | NetworkPolicy 시행 | 비고 |
|---|---|---|
| **Calico** | 지원 | iptables 또는 eBPF 데이터플레인 중 선택 가능 |
| **Cilium** | 지원 | eBPF 전용. 자체 `CiliumNetworkPolicy` CRD로 L7까지 확장 |
| **Antrea** | 지원 | Open vSwitch 기반 |
| **AWS VPC CNI** | 지원(일정 버전 이상) | 별도 네트워크 정책 에이전트 구성 필요 |
| **Flannel** | **미지원** | 단순 오버레이 전용, 정책 개념 자체가 없다 |
| **kindnet** (kind 기본 CNI) | **미지원** | `kind create cluster` 기본값 그대로는 항상 무시된다 |

"정책을 적용했는데 여전히 통신된다"면 먼저 `kubectl get pods -n kube-system`으로 어떤 CNI가 떠 있는지 확인하는 습관을 들인다. CNI의 종류와 방식은 [14장](14-CNI-스펙과-IPAM.md)·[15장](15-CNI-플러그인과-패킷-경로.md)에서 다뤘다.

### 3.2 iptables 기반 vs eBPF 기반 시행

**한 줄 요약:** 규칙 기반은 규칙이 늘수록 순회 비용이 늘고, 맵 기반은 규칙이 늘어도 조회 비용이 거의 늘지 않는다.

```
iptables 기반 시행 (Calico의 iptables 모드, 또는 kube-proxy와 유사한 원리)
  · Pod/네임스페이스 조합마다 iptables 체인·규칙이 늘어난다
  · 정책 개수 × 대상 Pod 수에 비례해 규칙 평가 비용 증가
  · 규칙 추가/삭제 시 체인 전체를 다시 순회해야 하는 경우가 있다
  · 수천 개 정책, 수만 Pod 규모에서 패킷당 지연이 눈에 띄게 증가할 수 있다

eBPF 기반 시행 (Cilium, Calico eBPF 모드)
  · 정책이 BPF 맵(해시 테이블 구조)으로 컴파일된다
  · 규칙 조회가 맵 룩업(대체로 O(1)에 가까움)이지 체인 순회가 아니다
  · 정책 수가 늘어도 개별 패킷 처리 경로의 길이가 거의 늘지 않는다
  · 정책 갱신이 프로그램 전체 재적재 없이 맵 갱신만으로 가능한 경우가 많다
```

kube-proxy의 iptables 모드가 Service 수에 따라 규칙이 선형으로 늘어나는 것과 같은 패턴이 NetworkPolicy 시행에도 나타난다. eBPF 쪽 원리는 [22장](22-eBPF-데이터플레인과-Cilium.md)에서 다룬다. iptables의 체인·규칙은 [5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md)이다.

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

---

## 코어 4. 제로 트러스트 설계: 기본 거부, DNS 예외, 관리자 가드레일

### 4.1 순서: 기본 거부 → 최소 허용 → DNS 확인

**한 줄 요약:** 네임스페이스에 기본 거부를 먼저 깔고, 필요한 통신만 허용하며, DNS처럼 당연히 되던 것이 막히지 않는지 확인한다.

```yaml
# 네임스페이스 전체 기본 거부 (Ingress)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: shop
spec:
  podSelector: {}              # 네임스페이스의 모든 Pod
  policyTypes: [Ingress]
  # ingress 규칙이 없다 = 명시된 허용이 없으므로 전부 거부
---
# 네임스페이스 전체 기본 거부 (Egress)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  namespace: shop
spec:
  podSelector: {}
  policyTypes: [Egress]
```

> **DNS 예외를 빠뜨리면 모든 것이 깨진다** — Egress 기본 거부는 CoreDNS로 가는 DNS 조회도 막는다. Service 이름을 조회하지 못하니 앱에서는 네트워크가 통째로 죽은 것처럼 보인다. textbook 원천은 NetworkPolicy 적용 후 갑자기 모든 것이 안 되는 사고의 90%가 DNS 차단이라고 적는다. DNS 구조는 [18장](18-DNS와-서비스-디스커버리.md)이다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: shop
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: kube-system }
          podSelector:
            matchLabels: { k8s-app: kube-dns }
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
```

### 4.2 계층화와 자주 쓰는 패턴

**한 줄 요약:** "같은 네임스페이스는 전부 허용"과 "티어별 세분화"는 다른 신뢰 모델이다. 위협 모델에 따라 고른다.

```yaml
# 베이스라인: 같은 네임스페이스 안의 통신만 허용 (네임스페이스 간 기본 차단)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-namespace
  namespace: shop
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: {}      # 같은 네임스페이스의 모든 Pod
---
# 워크로드별: frontend → api만
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow-frontend-only
  namespace: shop
spec:
  podSelector: { matchLabels: { tier: api } }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: { matchLabels: { tier: frontend } }
      ports: [{ protocol: TCP, port: 8080 }]
```

규제가 엄격한 환경(금융, 의료)일수록 같은 네임스페이스 안에서도 티어 간 통신을 명시적으로만 허용하는 편이 안전하다.

```
패턴 1 — 3계층 애플리케이션
  frontend: 인그레스에서만 인바운드, backend로만 아웃바운드 + DNS
  backend:  frontend에서만 인바운드, database로만 아웃바운드 + DNS
  database: backend에서만 인바운드, 아웃바운드 없음

패턴 2 — 네임스페이스 간 기본 차단
  각 네임스페이스에 default-deny-ingress
  필요한 교차 네임스페이스 통신만 namespaceSelector로 명시적 허용

패턴 3 — 클라우드 메타데이터 서비스 차단
  egress에서 169.254.169.254/32를 ipBlock.except로 제외

패턴 4 — 관측 파이프라인만 예외적으로 전방위 허용
  모니터링 네임스페이스에서 오는 스크레이핑 트래픽은
  기본 거부와 별개로 별도 정책에서 넓게 허용
```

> **🎮 연결** — 3계층 패턴은 게임 서버의 "게이트 → 게임 서버 → DB" 구조 그대로다. DB 티어에 egress 없음(`egress: []`)을 주면, DB가 침해돼도 바깥으로 연결을 못 연다.

### 4.3 AdminNetworkPolicy: 네임스페이스 소유자가 못 푸는 가드레일

**한 줄 요약:** 클러스터 스코프의 우선순위 있는 정책(Allow/Deny/Pass)과 기본값 정책. 두 API 모두 아직 `v1alpha1`이다.

표준 `NetworkPolicy`는 네임스페이스 스코프라 소유자(개발팀)가 자기 네임스페이스 안에서만 정의한다. "모든 네임스페이스에서 메타데이터 서비스 접근 차단", "DNS 등 핵심 통신은 항상 허용" 같은 규칙은 네임스페이스 경계 밖에서 강제해야 하며, 그것이 `AdminNetworkPolicy`(그리고 `BaselineAdminNetworkPolicy`)다.

```
AdminNetworkPolicy (클러스터 스코프, 관리자 전용)
  · priority 필드로 명시적 순서 (숫자가 작을수록 먼저)
  · Allow / Deny / Pass 세 가지 액션
  · Deny/Allow는 네임스페이스 NetworkPolicy가 뭐라 하든 우선한다
        ▼ Pass로 위임되지 않은 트래픽은 여기서 확정
NetworkPolicy (네임스페이스 스코프, 팀 소유) — 기존 표준 동작 그대로
        ▼ 어떤 NetworkPolicy도 매칭하지 않으면
BaselineAdminNetworkPolicy (클러스터 스코프, 관리자 전용)
  · "다른 무엇도 결정하지 않았을 때"의 기본값
  · 네임스페이스 NetworkPolicy가 언제든 이 기본값을 덮어쓸 수 있다
```

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

---

## 실무 적용

### 체크리스트

- [ ] 정책을 적용하기 전에 `kubectl get pods -n kube-system`으로 CNI를 확인한다. Flannel, kindnet은 NetworkPolicy를 시행하지 않아 조용히 무시된다.
- [ ] `policyTypes`에 방향을 명시한다. `Ingress`만 쓰면 Egress는 전허용으로 남는다.
- [ ] 기본 거부(`podSelector: {}`) → 최소 허용 순서로 만든다. Egress 기본 거부 시 **DNS(UDP/TCP 53) 허용**을 반드시 함께 둔다.
- [ ] `from`/`to`의 하이픈 위치를 검토한다(별도 항목 = OR, 한 항목 = AND). 의도와 다르게 넓거나 좁게 열리지 않았는지 두 번 읽는다.
- [ ] 표준 NetworkPolicy에는 deny가 없다. 허용 정책이 쌓일수록 열리는 범위가 넓어진다는 점을 의식한다.
- [ ] 클라우드 환경이면 메타데이터 서비스(`169.254.169.254/32`) egress 차단을 고려한다.
- [ ] 클러스터 전역 가드레일이 필요하면 AdminNetworkPolicy를 쓰되 `v1alpha1`이라는 점, CNI별 지원 상태를 확인한다.

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

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
[코어 1] 정책 없음 = 기본 ( ? ). Pod가 podSelector에 ( ? )되면 해당 방향만 기본 ( ? )
  policyTypes에 Ingress만 → Egress는 ( ? )
  egress: [] → 그 방향 ( ? )
  여러 정책 = ( ? )집합으로 누적, 표준엔 ( ? ) 규칙이 없다

[코어 2] 리스트 별도 항목 = ( ? ) / 한 항목 안 여러 필드 = ( ? )

[코어 3] 시행자 = ( ? ), kube-proxy는 ( ? )
  시행 O: Calico, Cilium, Antrea, AWS VPC CNI / 시행 X: ( ? ), ( ? )
  iptables 시행: 규칙 수에 비례 ( ? ) / eBPF 시행: ( ? ) 룩업
  표준은 L( ? )/L( ? )까지, Cilium은 L( ? )·FQDN까지

[코어 4] 순서: ( ? ) 먼저 → ( ? ) 허용 → ( ? ) 확인
  DNS 허용 대상: kube-system의 k8s-app=( ? ), 포트 UDP/TCP ( ? )
  평가 순서: AdminNetworkPolicy → ( ? ) → BaselineAdminNetworkPolicy
  Admin 액션 3: Allow / Deny / ( ? ), 위상: v1( ? )
```

### 2. 인출 질문

1. 정책이 없는 클러스터와 정책이 선택한 Pod의 동작은 어떻게 다른가? 전환 단위는?

   <details markdown="1"><summary>답 확인</summary>

   정책이 없으면 모든 Pod가 모든 Pod/IP와 통신 가능(전허용). Pod가 `podSelector`에 매칭되는 NetworkPolicy를 가지면 그 Pod의 `policyTypes`에 쓴 방향이 명시 허용 외 전부 거부로 전환된다. 네임스페이스 전체가 아니라 **Pod 단위**, **방향 단위**다. → 코어 1 (1.1)

   </details>

2. 같은 Pod에 정책 A(frontend 허용)와 정책 B(monitoring 허용)가 적용되면?

   <details markdown="1"><summary>답 확인</summary>

   허용이 합집합으로 누적되어 frontend와 monitoring 양쪽을 모두 허용한다. 표준 NetworkPolicy에는 명시적 deny가 없다. → 코어 1 (1.2)

   </details>

3. 아래 두 YAML의 의미 차이를 말하라(① 별도 `-` 항목, ② 한 항목 안).

   <details markdown="1"><summary>답 확인</summary>

   ①은 OR: 같은 네임스페이스의 frontend Pod 또는 team=platform 네임스페이스의 모든 Pod. ②는 AND: team=platform 네임스페이스 안의 app=frontend Pod만. → 코어 2

   </details>

4. NetworkPolicy는 누가 시행하는가? kube-proxy는?

   <details markdown="1"><summary>답 확인</summary>

   CNI 플러그인이 오브젝트를 watch해 자기 데이터플레인(iptables 체인, eBPF 프로그램 등)에 반영해 시행한다. kube-proxy는 Service 가상 IP 변환만 하고 정책에는 관여하지 않는다. API 서버는 저장만 한다. → 코어 3 (3.1)

   </details>

5. 어떤 CNI가 정책을 시행하지 않는가? 그 클러스터에 정책을 적용하면?

   <details markdown="1"><summary>답 확인</summary>

   Flannel과 kindnet(kind 기본 CNI). 오브젝트는 저장되지만 에러·경고 없이 조용히 무시되어 트래픽은 달라지지 않는다. → 코어 3 (3.1)

   </details>

6. iptables 기반과 eBPF 기반 시행의 규모 확장성 차이는?

   <details markdown="1"><summary>답 확인</summary>

   iptables 기반은 정책 × 대상 Pod 수에 비례해 체인 순회 비용이 늘고, eBPF 기반은 정책이 BPF 맵(해시 테이블)으로 컴파일되어 맵 룩업(대체로 O(1)에 가까움)이라 규칙이 늘어도 조회 비용이 거의 늘지 않는다. → 코어 3 (3.2)

   </details>

7. Egress 기본 거부 시 가장 흔한 실수와 해결은?

   <details markdown="1"><summary>답 확인</summary>

   DNS 허용 누락. kube-system의 `k8s-app: kube-dns` Pod로 UDP/TCP 53을 허용하는 정책을 추가한다. → 코어 4 (4.1)

   </details>

8. AdminNetworkPolicy와 BaselineAdminNetworkPolicy는 네임스페이스 NetworkPolicy와 어떤 순서·관계이고, 어떤 상태의 API인가?

   <details markdown="1"><summary>답 확인</summary>

   AdminNetworkPolicy는 가장 먼저(priority 순) 평가되고 Deny/Allow는 네임스페이스 정책이 뒤집을 수 없으며 `Pass`로 아래 계층에 위임할 수 있다. 그다음 NetworkPolicy, 마지막이 BaselineAdminNetworkPolicy(아무도 정하지 않았을 때의 기본값이며 네임스페이스 정책이 덮어쓸 수 있음). 둘 다 `v1alpha1`이고 후속 `ClusterNetworkPolicy`(`v1alpha2`)가 제안된 상태다. → 코어 4 (4.3)

   </details>

### 3. 기억 고리

- **C++ 유추:** NetworkPolicy = 서버 호스트의 iptables 방화벽 규칙. ⚠️ 깨지는 곳: 규칙 주체가 IP가 아니라 라벨이고, 표준에는 DROP 규칙이 없으며 허용만 쌓인다. 또 방화벽 데몬이 없으면(시행 안 하는 CNI) 규칙이 **에러 없이 무시**된다.
- **비유:** 기본 전허용 = 문이 모두 열린 사무실, NetworkPolicy가 선택한 사람의 방만 "명단에 있는 사람만 입장"으로 바뀐다. ⚠️ 비유가 깨지는 지점: 경비원(CNI)이 없는 건물(Flannel, kindnet)에서는 명단(정책)이 있어도 문이 열려 있다. 명단은 합집합으로만 늘어난다.
- **묶음(3의 법칙):** 선택자 3종(`podSelector`/`namespaceSelector`/`ipBlock`), 평가 계층 3개(Admin → NetworkPolicy → Baseline), Admin 액션 3개(Allow/Deny/Pass), 제로 트러스트 순서 3단계(기본 거부 → 최소 허용 → DNS 확인).
- **대칭·순서:** 리스트 OR ↔ 한 항목 AND, Ingress ↔ Egress(`policyTypes`), iptables 순회 ↔ eBPF 맵 룩업, 절대 규칙(Admin) ↔ 기본값(Baseline).

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

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/18-NetworkPolicy와-네트워크-보안.md (18.1 NetworkPolicy 모델, 18.2 CNI별 구현 차이, 18.3 제로 트러스트 네트워킹 설계 패턴, 18.4 AdminNetworkPolicy, 실습); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/10-DNS와-서비스-디스커버리.md (10.6 NetworkPolicy와 DNS — "사고의 90%" 서술 대조)*
