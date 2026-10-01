---
title: "18장. NetworkPolicy와 네트워크 보안"
---

# 18장. NetworkPolicy와 네트워크 보안

> **학습목표**
> - NetworkPolicy가 없을 때의 기본 전허용 모델과, 정책이 적용된 순간 어떻게 기본 거부로 전환되는지 설명할 수 있다.
> - `podSelector`/`namespaceSelector`/`ipBlock`의 조합에서 AND와 OR가 어디서 갈리는지 정확히 판단할 수 있다.
> - NetworkPolicy가 스펙일 뿐이며 시행은 전적으로 CNI의 책임이라는 것, 그리고 CNI별 구현 차이를 설명할 수 있다.
> - 네임스페이스 단위 기본 거부 + 명시적 허용으로 제로 트러스트 네트워크를 설계할 수 있다.
> - AdminNetworkPolicy가 클러스터 관리자와 네임스페이스 소유자의 정책을 어떻게 층위화하는지 이해한다.
> - 정책 적용 전후의 트래픽 차단/허용을 디버그 Pod로 직접 검증할 수 있다.

---

## 들어가며

13장에서 CNI가 Pod 간 L3 연결성을 만든다고 했다. 그 연결성의 기본값은 **전허용(allow-all)** 이다. 클러스터 안의 어떤 Pod도 다른 어떤 Pod와도 통신할 수 있다 — 네임스페이스가 다르고, 팀이 다르고, 신뢰 수준이 달라도 상관없다.

이 장은 그 기본값을 어떻게 뒤집는지 다룬다. 다만 한 가지를 먼저 분명히 해야 한다. **`NetworkPolicy`는 kube-proxy가 시행하지 않는다.** 15장에서 본 kube-proxy는 오직 Service의 가상 IP를 실제 Pod IP로 바꾸는 일만 한다. 트래픽을 막거나 허용하는 결정은 전적으로 **CNI 플러그인의 몫**이다. 이 사실을 놓치면 "정책을 적용했는데 왜 안 막히지?"라는 질문에 영원히 답할 수 없다.

## 18.1 NetworkPolicy 모델

### 기본 전허용에서 기본 거부로

```
NetworkPolicy가 하나도 없는 클러스터
  → 모든 Pod가 모든 Pod, 모든 IP와 통신 가능 (Ingress/Egress 둘 다)

Pod가 하나라도 podSelector에 매칭되는 NetworkPolicy를 갖는 순간
  → 그 Pod의 해당 방향(policyTypes에 명시된 Ingress/Egress)은
     "정책이 명시적으로 허용한 트래픽 외에는 전부 거부"로 전환된다
```

이 전환이 **Pod 단위**로 일어난다는 점이 중요하다. 네임스페이스 전체가 한꺼번에 바뀌는 것이 아니라, 정책의 `podSelector`에 매칭되는 Pod만 영향을 받는다.

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

### `policyTypes`가 방향을 가른다

`policyTypes`에 `Ingress`만 있으면 그 Pod의 **Egress는 여전히 전허용**이다. 반대도 마찬가지다. 두 방향을 모두 제한하려면 `policyTypes: [Ingress, Egress]`를 명시하고 두 규칙 블록을 모두 채워야 한다. `egress`를 아예 비워 두면(`egress: []`) 해당 방향은 "무엇도 허용하지 않음"이 된다 — 이것이 바로 "나가는 곳이 없는" 데이터베이스 티어를 만드는 방법이다.

### 정책은 합집합(OR)으로 누적된다

같은 Pod에 여러 `NetworkPolicy`가 적용되면, 각 정책이 허용하는 규칙들이 **전부 합쳐진다.** 명시적인 거부(deny) 규칙은 표준 NetworkPolicy에 존재하지 않는다 — 오직 허용만 쌓인다.

```
정책 A: frontend → api 허용
정책 B: monitoring → api (9090 포트) 허용
────────────────────────────────
결과: api Pod는 frontend와 monitoring 양쪽으로부터의 트래픽을 모두 허용
      (A, B 둘 다 없으면 전부 거부였을 것을 각각의 허용 규칙이 넓힌다)
```

### 가장 흔한 함정: 리스트 항목이냐 같은 항목이냐

`from`(또는 `to`) 리스트 안에서 **셀렉터가 별도 항목으로 나뉘는지, 한 항목 안에 같이 들어가는지**가 AND와 OR를 가른다. YAML의 하이픈(`-`) 위치 하나가 정책의 의미를 완전히 뒤집는다.

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

케이스 ①은 두 조건 중 **하나만 맞아도** 허용한다. 케이스 ②는 **두 조건을 동시에** 만족해야 한다. YAML만 보면 들여쓰기 한 칸 차이지만 방화벽 규칙의 범위가 완전히 다르다. 실무에서 "생각보다 너무 넓게 열렸다"거나 "생각보다 너무 좁게 막혔다"는 사고의 상당수가 이 구분을 놓친 데서 나온다.

```
리스트 항목이 여러 개  → OR (각 항목이 독립적인 "또는" 조건)
한 항목 안에 필드가 여러 개 → AND (그 항목 안에서는 "그리고" 조건)
```

## 18.2 CNI별 구현 차이

### NetworkPolicy는 스펙일 뿐, 시행자가 없으면 무시된다

`NetworkPolicy` 오브젝트는 `networking.k8s.io/v1` API로 정의되지만, **API 서버는 이것을 저장할 뿐 아무것도 하지 않는다.** 15장에서 확인했듯 kube-proxy도 관여하지 않는다. 전적으로 CNI 플러그인이 이 오브젝트를 watch해서 자신의 데이터플레인(iptables 체인, eBPF 프로그램 등)에 규칙을 반영해야만 실제로 차단이 일어난다.

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
| **AWS VPC CNI** | 지원 (일정 버전 이상) | 별도 네트워크 정책 에이전트 구성 필요 |
| **Flannel** | **미지원** | 단순 오버레이 전용, 정책 개념 자체가 없다 |
| **kindnet** (kind 기본 CNI) | **미지원** | `kind create cluster` 기본값 그대로는 NetworkPolicy가 항상 무시된다 |

> **`k8s-guide` 클러스터를 kindnet 기본값으로 쓰고 있다면**
>
> 지금까지의 실습 클러스터는 NetworkPolicy를 만들어도 아무 효과가 없다. 이 장의 실습을 실제로 검증하려면 **Calico로 CNI를 교체한 새 클러스터**가 필요하다(18.3절 실습 참고). "정책을 적용했는데 여전히 통신된다"는 증상을 보면 가장 먼저 `kubectl get pods -n kube-system` 로 어떤 CNI가 떠 있는지부터 확인하는 습관을 들여야 한다.

### iptables 기반 vs eBPF 기반 시행의 규모 확장성

Calico는 두 데이터플레인을 모두 지원하므로 직접 비교하기 좋은 사례다.

```
iptables 기반 시행 (Calico의 iptables 모드, 또는 15장에서 본 kube-proxy와 유사한 원리)
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

15장에서 다룬 kube-proxy의 iptables 모드가 서비스 수 증가에 따라 규칙이 선형적으로 늘어나는 것과 정확히 같은 패턴이 NetworkPolicy 시행에도 나타난다. **규칙 기반 방화벽은 규칙이 늘수록 순회 비용이 늘고, 맵 기반 방화벽은 규칙이 늘어도 조회 비용이 거의 늘지 않는다.** 이 대비는 19장에서 eBPF 데이터플레인 전체를 다룰 때 다시 정면으로 마주하게 된다.

### Cilium의 확장 — CiliumNetworkPolicy

표준 NetworkPolicy는 L3/L4(IP, 포트)까지만 표현할 수 있다. Cilium은 자체 CRD로 **L7 인지 규칙**까지 확장한다.

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

"같은 8080 포트라도 `GET /api/v1/*`만 허용하고 `DELETE`는 거부"하는 식의 판단은 표준 `NetworkPolicy`(L3/L4)로는 원천적으로 표현할 수 없다. 이는 CNI가 패킷의 IP 헤더와 포트만 보는 것이 아니라, **애플리케이션 프로토콜 내용을 파싱**해야 하는 일이기 때문이다. Cilium은 eBPF 데이터플레인 위에 프록시(Envoy)를 부분적으로 결합해 이를 구현한다 — 19장에서 이 결합 지점을 다시 다룬다.

## 18.3 제로 트러스트 네트워킹 설계 패턴

### 기본 거부를 먼저, 그다음에 최소 권한 허용

제로 트러스트의 원칙은 "네트워크 위치를 신뢰의 근거로 삼지 않는다"는 것이다. 실무에서는 이것을 다음 순서로 구현한다.

```
① 네임스페이스에 기본 거부 정책을 먼저 깐다 (Ingress, Egress 둘 다)
② 꼭 필요한 통신만 명시적으로 허용하는 정책을 추가한다
③ DNS처럼 "당연히 되던 것"이 기본 거부에 걸리지 않는지 반드시 확인한다
```

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

> **DNS 예외를 빠뜨리면 모든 것이 깨진다**
>
> Egress 기본 거부를 걸면 **DNS 조회(16장의 CoreDNS)도 함께 막힌다.** Service 이름을 조회하지 못하니 애플리케이션 입장에서는 "네트워크가 통째로 죽은 것"처럼 보인다. NetworkPolicy 적용 후 벌어지는 장애의 상당수가 이 누락이다.

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

### 계층화 — 네임스페이스 베이스라인 + 워크로드별 추가

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
        - podSelector: {}      # 같은 네임스페이스의 모든 Pod (namespaceSelector 없음 = 같은 NS)
---
# 워크로드별 추가: frontend → api만, 그 외 같은 네임스페이스 Pod는 여전히 차단하고 싶다면
# 위의 allow-same-namespace 대신 아래처럼 더 좁은 규칙을 podSelector로 세분화한다
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

**"같은 네임스페이스는 전부 허용"과 "네임스페이스 안에서도 티어별로 세분화"는 서로 다른 신뢰 모델이다.** 조직의 위협 모델에 따라 어느 수준까지 세분화할지 결정한다 — 규제가 엄격한 환경(금융, 의료)일수록 같은 네임스페이스 안에서도 티어 간 통신을 명시적으로만 허용하는 편이 안전하다.

### 자주 쓰이는 패턴 모음

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
  (입문서에서 다룬 IMDS 자격증명 탈취 경로를 원천 차단)

패턴 4 — 관측 파이프라인만 예외적으로 전방위 허용
  모니터링 네임스페이스에서 오는 스크레이핑 트래픽은
  기본 거부와 별개로 별도 정책에서 넓게 허용
```

## 18.4 AdminNetworkPolicy

### 네임스페이스 소유자에게만 맡길 수 없는 규칙들

표준 `NetworkPolicy`는 네임스페이스 스코프다. 즉 **네임스페이스 소유자(개발팀)가 자신의 네임스페이스 안에서만 정책을 정의**한다. 그런데 클러스터 관리자 입장에서는 "어떤 네임스페이스든 상관없이 항상 지켜져야 하는 규칙"이 있다. 예를 들어:

- 모든 네임스페이스에서 클라우드 메타데이터 서비스로의 접근은 항상 차단되어야 한다.
- `kube-system`으로의 트래픽은 특정 모니터링 네임스페이스를 제외하고 항상 차단되어야 한다.
- 반대로, 각 팀이 실수로 자신의 네임스페이스를 완전히 걸어 잠그더라도 클러스터의 핵심 통신(DNS 등)은 항상 뚫려 있어야 한다.

네임스페이스 소유자가 실수하거나 정책을 아예 만들지 않아도 이 규칙들이 지켜지게 하려면, **네임스페이스 경계 밖에서 강제하는 클러스터 스코프 정책**이 필요하다. 이것이 `AdminNetworkPolicy`(그리고 `BaselineAdminNetworkPolicy`)다. 다만 미리 밝혀 둘 것이 있다 — 이 두 리소스는 아직 `policy.networking.k8s.io/v1alpha1`이다. 표준 `NetworkPolicy`(`networking.k8s.io/v1`, GA)와 달리 **아직 안정화되지 않은, 계속 바뀔 수 있는 API**라는 뜻이다. 개념과 설계 의도는 배워 둘 가치가 충분하지만, "이미 자리 잡은 표준 기능"으로 오해하지 않는 것이 중요하다.

### 두 리소스와 우선순위

```
┌─────────────────────────────────────────────────────────┐
│  AdminNetworkPolicy (클러스터 스코프, 관리자 전용)           │
│    · priority 필드로 명시적 순서 부여                        │
│    · Allow / Deny / Pass 세 가지 액션                       │
│    · "Deny"는 네임스페이스 NetworkPolicy가 뭐라 하든 우선한다  │
└───────────────────────────┬───────────────────────────────┘
                            │ Pass로 위임되지 않은 트래픽은
                            │ 여기서 확정
                            ▼
┌─────────────────────────────────────────────────────────┐
│  NetworkPolicy (네임스페이스 스코프, 팀 소유)                 │
│    · 기존 표준 동작 그대로                                    │
└───────────────────────────┬───────────────────────────────┘
                            │ 어떤 NetworkPolicy도 매칭하지 않으면
                            ▼
┌─────────────────────────────────────────────────────────┐
│  BaselineAdminNetworkPolicy (클러스터 스코프, 관리자 전용)     │
│    · "다른 무엇도 결정하지 않았을 때"의 기본값                  │
│    · 네임스페이스 NetworkPolicy가 언제든 이 기본값을 덮어쓸 수 있다│
└─────────────────────────────────────────────────────────┘
```

**핵심 차이는 우선순위와 재정의 가능 여부다.**

| | `AdminNetworkPolicy` | `NetworkPolicy` | `BaselineAdminNetworkPolicy` |
|---|---|---|---|
| 스코프 | 클러스터 전역 | 네임스페이스 | 클러스터 전역 |
| 소유자 | 클러스터 관리자 | 네임스페이스 팀 | 클러스터 관리자 |
| 평가 순서 | **가장 먼저** (priority 순) | 그다음 | **가장 나중** (기본값) |
| 네임스페이스 정책이 덮어쓸 수 있는가 | 불가 (Deny/Allow는 절대적) | - | 가능 (baseline은 기본값일 뿐) |
| 용도 | 절대 어겨서는 안 되는 가드레일 | 팀별 세부 정책 | "아무도 정하지 않았을 때"의 안전한 기본값 |

`AdminNetworkPolicy`의 규칙은 **`Pass`** 액션을 가질 수 있는데, 이는 "이 트래픽에 대한 결정을 다음 계층(네임스페이스 `NetworkPolicy`)에 넘긴다"는 뜻이다. 반면 `Deny`/`Allow`는 그 자리에서 결정을 확정하며 아래 계층이 뒤집을 수 없다.

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

이 구조가 해결하는 문제는 명확하다. **네임스페이스 소유자가 아무리 실수해도(또는 아무 정책도 만들지 않아도) 클러스터 관리자가 정한 가드레일(메타데이터 서비스 차단, DNS 허용)은 항상 유지된다.** 반대로 baseline은 "아무도 명시적으로 정하지 않았을 때만" 적용되므로 팀에 유연성을 남겨 둔다.

> **지원 현황 — 아직 v1alpha1이고, 계속 진화 중인 API**
>
> `AdminNetworkPolicy`/`BaselineAdminNetworkPolicy`는 Network Policy API 워킹그룹이 표준 `NetworkPolicy`의 한계(클러스터 전역 정책 부재, 명시적 Deny 부재)를 보완하기 위해 만든 API다. 두 리소스 모두 **여전히 `v1alpha1`이며 GA가 아니다.** 실제로 이 워킹그룹은 두 리소스를 `tier` 필드 하나로 통합한 `ClusterNetworkPolicy`(`v1alpha2`)라는 후속 API도 제안한 상태이고, 앞으로의 베타·GA 작업은 이 통합 API를 기준으로 진행될 예정이다 — 즉 `AdminNetworkPolicy`/`BaselineAdminNetworkPolicy`의 스펙 자체가 최종 형태라고 단정할 수 없다. CNI별 구현 시점과 완성도도 제각각이다. 도입 전에는 사용 중인 CNI(Calico, Cilium, Kube-OVN 등)가 어느 채널까지, 어느 버전의 API를 구현했는지 반드시 확인해야 한다 — 이 역시 18.2절에서 본 "스펙과 시행은 별개"라는 원칙이 그대로 적용되는 지점이며, 여기서는 "스펙 자체도 아직 굳어지지 않았다"는 조건이 하나 더 붙는다. 클러스터의 핵심 가드레일을 이 API 하나에만 의존해 설계하기보다는, CNI 자체 기능(예: `CiliumClusterwideNetworkPolicy`)이나 어드미션 정책(2부 11장)과 병행하는 편이 안전하다.

## 실습: 기본 거부 적용과 흐름 검증

**⚠️ 이 실습은 NetworkPolicy를 시행하는 CNI가 필요하다.** kind 기본 CNI(kindnet)에서는 아무 효과가 없으므로, Calico를 설치한 별도 클러스터를 쓴다.

**① CNI를 Calico로 교체한 클러스터 준비**

```yaml
# kind-netpol.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: k8s-guide-netpol
networking:
  disableDefaultCNI: true
  podSubnet: "192.168.0.0/16"
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

```bash
kind create cluster --config kind-netpol.yaml
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
kubectl wait --for=condition=Ready pods -n kube-system -l k8s-app=calico-node --timeout=300s
```

**② 테스트 워크로드 구성**

```bash
kubectl create namespace shop
kubectl -n shop create deployment frontend --image=nginx:alpine
kubectl -n shop create deployment backend --image=nginx:alpine
kubectl -n shop patch deployment frontend -p \
  '{"spec":{"template":{"metadata":{"labels":{"tier":"frontend"}}}}}'
kubectl -n shop patch deployment backend -p \
  '{"spec":{"template":{"metadata":{"labels":{"tier":"backend"}}}}}'
kubectl -n shop expose deployment backend --port=80
```

**③ 정책 적용 전: 통신이 되는 것을 확인**

```bash
kubectl -n shop run debug --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=3 backend
# 정상 응답이 온다
```

**④ 네임스페이스 전체 기본 거부 적용**

```bash
kubectl -n shop apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
spec:
  podSelector: {}
  policyTypes: [Ingress]
EOF
```

**⑤ 기존 트래픽이 깨지는 것을 관찰**

```bash
kubectl -n shop run debug --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=3 backend
# wget: download timed out  ← 방금까지 되던 통신이 막혔다
```

**⑥ frontend → backend(80번 포트)만 정확히 되돌리는 허용 규칙 추가**

```bash
kubectl -n shop apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
spec:
  podSelector:
    matchLabels: { tier: backend }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: { tier: frontend }
      ports:
        - { protocol: TCP, port: 80 }
EOF
```

**⑦ 허용된 경로와 차단된 경로를 각각 검증**

```bash
# frontend 라벨을 가진 Pod에서는 성공해야 한다
FE=$(kubectl -n shop get pod -l tier=frontend -o jsonpath='{.items[0].metadata.name}')
kubectl -n shop exec "$FE" -- wget -qO- --timeout=3 backend
# 정상 응답

# 라벨 없는(정책이 허용하지 않는) Pod에서는 여전히 실패해야 한다
kubectl -n shop run debug2 --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=3 backend
# wget: download timed out
```

**⑧ 정리**

```bash
kind delete cluster --name k8s-guide-netpol
```

---

## 실습 과제

**과제 1 — AND/OR 조합 검증**
같은 `from` 조건을 ① 별도 리스트 항목(OR)과 ② 한 항목 안에 결합(AND)으로 각각 작성하고, 세 개의 네임스페이스(허용 조건 중 하나만 만족/둘 다 만족/둘 다 불만족)를 준비해 실제로 통신되는 조합을 표로 정리한다.

**과제 2 — CNI 미지원 상황 재현**
kindnet 기본 클러스터에 `default-deny-ingress` 정책을 적용하고, 여전히 통신이 되는 것을 확인한다. `kubectl get pods -n kube-system`으로 CNI를 식별하는 절차를 문서화한다.

**과제 3 — DNS 누락 장애 재현**
Egress 기본 거부만 적용하고(DNS 허용 규칙 없이) Pod 안에서 `nslookup`이 실패하는 것을 관찰한다. `allow-dns-egress` 정책을 추가한 뒤 복구되는 것을 확인한다.

**과제 4 — 티어별 정책 계층화**
18.3절의 3계층 패턴(frontend/backend/database)을 실제로 구성하고, database Pod에서 외부로 나가는 연결이 전부 실패하는 것(egress: [])을 검증한다.

**과제 5 — AdminNetworkPolicy 개념 검증 (지원 CNI 필요)**
`AdminNetworkPolicy`를 지원하는 CNI 환경이 있다면, 클러스터 전역 Deny 규칙(예: 메타데이터 서비스 차단)을 만들고, 네임스페이스 `NetworkPolicy`에서 이를 허용하도록 재정의를 시도해 **거부되는 것**을 확인한다. 그다음 `BaselineAdminNetworkPolicy`로 같은 것을 시도해 네임스페이스 정책이 이를 덮어쓸 수 있는 것과 대비한다.

---

## 요약

- 정책이 없으면 클러스터는 **기본 전허용**이다. Pod가 하나라도 `podSelector`에 매칭되는 `NetworkPolicy`를 갖는 순간, 그 Pod의 해당 방향(`policyTypes`)은 **기본 거부**로 전환되고 명시된 규칙만 허용된다.
- 여러 정책은 **합집합(OR)**으로 누적되며, 표준 `NetworkPolicy`에는 명시적 Deny가 없다. `from`/`to` 안에서 **리스트의 별도 항목은 OR, 한 항목 안의 여러 필드는 AND**다 — 하이픈 위치가 정책의 의미를 완전히 바꾼다.
- **NetworkPolicy는 스펙일 뿐이고 kube-proxy는 이를 시행하지 않는다.** 전적으로 CNI의 몫이다. Calico/Cilium/Antrea는 시행하고, **Flannel과 kind 기본 CNI(kindnet)는 시행하지 않는다** — 조용히 무시된다는 점이 흔한 함정이다.
- **iptables 기반 시행은 규칙·Pod 수에 비례해 순회 비용이 늘고, eBPF 기반 시행(맵 룩업)은 규칙 수가 늘어도 조회 비용이 거의 늘지 않는다.** 이 대비는 kube-proxy의 iptables/eBPF 대비와 같은 패턴이며 19장에서 다시 다룬다.
- 제로 트러스트 설계는 **네임스페이스 기본 거부 → 최소 권한 허용**의 순서로 진행한다. **DNS 예외를 빠뜨리는 것이 가장 흔한 사고 원인**이다.
- **AdminNetworkPolicy**는 클러스터 관리자가 네임스페이스 정책보다 우선하는 절대 규칙(Deny/Allow)을, **BaselineAdminNetworkPolicy**는 아무도 정하지 않았을 때의 기본값을 제공한다. `Pass` 액션으로 판단을 네임스페이스 계층에 위임할 수 있다. 다만 두 API 모두 **아직 v1alpha1**이고 후속 통합 API(`ClusterNetworkPolicy` v1alpha2)로 이어질 방향이 이미 논의되고 있으므로, 표준 `NetworkPolicy`와 같은 수준의 안정성을 기대하고 도입하면 안 된다.

**다음 장에서는** 지금까지 iptables/IPVS로 설명해 온 kube-proxy의 데이터플레인과, 방금 본 CNI별 NetworkPolicy 시행을 eBPF가 어떻게 근본적으로 다시 구현하는지 — 그리고 대규모 클러스터에서 네트워크 장애를 어떻게 체계적으로 진단하는지 — 다룬다.
