---
title: "16장. Service와 EndpointSlice"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 16
---

# 16장. Service와 EndpointSlice

> **🎮 게임 서버 개발자에게** — 게임 서버에서는 로그인 서버가 채널 서버 목록(IP:포트)을 들고 있다가 클라이언트에게 내려주고, 하트비트가 끊긴 서버는 목록에서 뺐다. Service와 EndpointSlice가 바로 그 두 역할이다. 결정적으로 다른 점은 Service의 주소(ClusterIP)가 **어떤 프로세스도 `listen`하지 않는 가상 좌표**라는 점이다. `accept()`하는 쪽이 없고, ping에도 응답하지 않는다. 이 장은 "무엇으로 바꿀지"를 정하는 **오브젝트 모델**(Service는 의도, EndpointSlice는 현재 대상 목록)까지 다루고, 그 목록을 실제 커널 규칙으로 바꾸는 일은 [17장](17-kube-proxy-데이터플레인.md)이 이어받는다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - Pod는 `Running`/Ready인데 Service로 들어오는 요청이 그 Pod에 가지 않는다 → EndpointSlice 대상과 `selector`·라벨·네임스페이스를 비교해야 한다.
> - 롤링 업데이트 중에 간헐적으로 502/연결 거부가 난다 → Pod 종료와 엔드포인트 제거가 병렬이라는 점을 알아야 한다.
> - NodePort/LoadBalancer로 노출했더니 접속 로그의 클라이언트 IP가 전부 노드 IP다 / gRPC 트래픽이 한 Pod로만 쏠린다 → `externalTrafficPolicy`와 헤드리스 서비스를 알아야 한다.

## 코어 — 이것만은 100%

> **한 문장:** Service는 "이 라벨의 Pod를 이 포트로 제공한다"는 의도와 변하지 않는 가상 IP(ClusterIP)를 정의하고, EndpointSlice 컨트롤러가 selector에 맞는 Pod의 현재 IP·포트·상태를 EndpointSlice로 기록하며, `ready: true`인 대상에게만 트래픽이 간다.

1. **ClusterIP는 주소가 아니라 "약속"이고, Service 타입은 안쪽에서 바깥으로 한 겹씩 감싼다** — `LoadBalancer ⊃ NodePort ⊃ ClusterIP`. ExternalName은 DNS CNAME일 뿐이고, 헤드리스(`clusterIP: None`)는 가상 IP를 없앤다.
2. **EndpointSlice는 "지금 이 주소들이 대상"이라는 구체 목록이다** — 약 100개 단위로 샤딩해 바뀐 슬라이스만 전송하며, `conditions`(ready·serving·terminating)가 트래픽 대상 여부를 정한다.
3. **서비스 디스커버리는 DNS가 정답이고, 환경변수에는 순서 의존 함정이 있다** — 환경변수는 Pod 시작 시점의 스냅샷이다. 헤드리스는 DNS가 Pod IP 목록을 직접 돌려줘 클라이언트가 고르게 한다.
4. **트래픽 정책·세션 어피니티·드레이닝이 "어디로, 어떻게 끊김 없이"를 정한다** — `Cluster`/`Local`, `sessionAffinity: ClientIP`, 종료 중 엔드포인트의 `ready=false` + `terminating=true`.

**이 장의 학습 목표**

- Service 타입(ClusterIP·NodePort·LoadBalancer·ExternalName·헤드리스)의 동작 차이와 포함 관계를 설명한다.
- EndpointSlice가 단일 Endpoints를 대체한 이유와 핵심 필드(`ready`·`serving`·`terminating`·`hints`)를 안다.
- 환경변수 기반과 DNS 기반 서비스 디스커버리의 차이와 함정을 안다.
- `sessionAffinity`·`internalTrafficPolicy`/`externalTrafficPolicy`·종료 중 엔드포인트의 드레이닝 원리를 설명한다.
- Service가 안 될 때 위에서 아래로 좁혀 가는 진단 순서를 안다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 로그인 서버가 내려주는 채널 서버 목록 | Service(ClusterIP) | 뒤의 서버가 바뀌어도 클라이언트는 고정된 진입점만 안다 | ClusterIP에는 `accept()`하는 프로세스가 없다. 각 노드 커널이 패킷의 목적지를 바꿀 뿐이다 |
| 하트비트 끊긴 서버를 목록에서 빼는 서버 매니저 | EndpointSlice의 `ready` | 살아 있고 받을 준비가 된 대상에게만 보낸다 | 판정은 readiness 프로브 결과이고, 목록 갱신은 컨트롤러가 하며 모든 노드의 kube-proxy가 watch한다 |
| 게이트웨이 서버 한 대가 서버 목록에서 로드밸런싱 | kube-proxy의 노드별 규칙 | 한 진입점 뒤에 여러 백엔드가 있다 | 중앙 게이트웨이가 없다. 각 노드에서 로컬로 결정한다([17장](17-kube-proxy-데이터플레인.md)) |
| 공유기 포트포워딩(외부 포트 → 내부 서버) | NodePort | 외부 포트로 들어온 연결을 내부로 전달한다 | 클러스터의 **모든 노드**에서 같은 포트(30000&#126;32767)가 열린다 |
| 서버가 DNS 이름으로 DB에 접속 | 헤드리스 서비스 / DNS 디스커버리 | 이름 → IP 해석 후 `connect()` | 헤드리스는 이름 하나가 여러 Pod IP를 돌려주고, 연결을 고르는 것은 클라이언트다. 연결을 오래 유지하면 한 서버로 쏠린다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Pod IP로 직접 붙으면 되는데 Service가 왜 필요할까? Service를 지워도 그 뒤 Pod는 지워질까?
> 2. NodePort를 만들면 ClusterIP도 같이 생길까? LoadBalancer는?
> 3. Pod 100개짜리 Service에서 Pod 하나만 교체돼도 모든 노드가 100개 전체를 다시 받아야 한다면 어떤 문제가 생길까?
> 4. Pod를 삭제하는 순간, 그 Pod는 곧바로 Service 대상에서 빠질까? 롤링 업데이트 중 요청이 끊기지 않으려면?
> 5. 같은 클라이언트의 요청이 같은 Pod로 가게 하려면? 그 한계는?
>
> **처리법:** 🛠 실습 ClusterIP/NodePort/LoadBalancer Service YAML, `kubectl get endpointslices -l kubernetes.io/service-name=<이름> -o yaml`, 스케일 아웃하며 `-w`로 관찰, 헤드리스 서비스를 `dig +short`로 비교 → 읽자마자 직접 실행 · 🗺 관계도 Service(의도) → EndpointSlice 컨트롤러 → EndpointSlice(현재 대상) → kube-proxy, 그리고 `LoadBalancer ⊃ NodePort ⊃ ClusterIP` · 📦 카드로 NodePort 범위 30000&#126;32767, EndpointSlice 100개 단위(상한 1000), `sessionAffinity` 기본 10800초(최대 86400), `externalTrafficPolicy` Cluster/Local, `ready`·`serving`·`terminating`

---

## 코어 1. ClusterIP는 "약속"이고, Service 타입은 한 겹씩 감싼다

### 1.1 호출 한 번의 순서 — 이름, 주소, 규칙, Pod

**한 줄 요약:** DNS는 이름을 주소로 해석할 뿐이고, 그 주소로 보낸 패킷의 목적지는 노드의 데이터플레인 규칙이 바꾼다. 모든 패킷을 중계하는 서버 프로세스는 없다.

> **입문 책에서 배운 것:** Service가 변하지 않는 가상 IP 하나로 일회용 Pod IP 문제를 푼다. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md)

이 장은 그 약속이 **시간 순서로 어떻게 지켜지는지**부터 본다. 클러스터 내부의 일반 요청 한 번(`orders` Service, 80 → 8080 예)은 이렇게 흐른다.

```
① 호출 Pod → CoreDNS : orders.study.svc.cluster.local 조회
② CoreDNS → 호출 Pod : ClusterIP 응답
③ 호출 Pod → ClusterIP:80 으로 TCP 연결
④ 노드 데이터 경로   : Service·EndpointSlice에 맞춘 규칙 적용
⑤ 노드 → 선택한 Pod IP:8080 으로 전달,  ⑥ 응답은 연결 경로로 돌아온다
```

같은 Namespace에서는 `orders`, 다른 Namespace에서는 `orders.study`처럼 짧은 이름도 쓸 수 있다([18장](18-DNS와-서비스-디스커버리.md)). 세 가지를 구분한다. ①②의 DNS는 **이름을 주소로 해석할 뿐** 패킷을 중계하지 않는다. ClusterIP에는 항상 떠 있는 서버 프로세스가 없다. ④는 API 객체를 관찰한 kube-proxy 같은 구현이 구성한 규칙이고, 일반 kube-proxy는 iptables·nftables 등 선택한 구현에 맞는 규칙을 만들 뿐 모든 패킷이 그 사용자 공간 프로세스를 통과하지 않는다. eBPF 기반 대체 구현에서는 담당 구성요소가 달라질 수 있다([17장](17-kube-proxy-데이터플레인.md), [22장](22-eBPF-데이터플레인과-Cilium.md)).

### 1.2 ClusterIP — "약속"과 필드

**한 줄 요약:** ClusterIP는 어떤 인터페이스에도 붙지 않은 가상 좌표이고, 약속을 지키는 실행 로직은 17장이다. 이 장은 오브젝트 필드를 읽는 법을 다룬다.

> **입문 책에서 배운 것:** ClusterIP는 ping에 응답하지 않는 가상 IP다. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md)

ClusterIP는 **주소가 아니라 약속**이다. "이 값으로 패킷을 보내면 노드의 데이터플레인이 실제 백엔드로 바꿔 준다"는 계약이고, 이 장은 "무엇으로 바꿀지"를 정하는 목록(EndpointSlice)까지 다룬다. 주요 필드는 다음과 같다.

| 필드 | 의미 |
|---|---|
| `selector` | 어떤 Pod를 대상으로 삼을지 결정 |
| `ports[].port` | Service가 제공할 포트 |
| `ports[].targetPort` | 대상의 실제 포트 번호 또는 **이름** |
| `ports[].protocol` | TCP·UDP 등 |
| `type` | ClusterIP·NodePort·LoadBalancer·ExternalName |
| `clusterIP` | 보통 할당받는 가상 주소. `None`이면 헤드리스 |
| `externalTrafficPolicy` / `internalTrafficPolicy` | 지원 경로에서 외부·내부 트래픽의 노드별 처리 정책 |
| `sessionAffinity` | ClientIP 등의 연결 친화성. 앱 세션 저장 기능은 아님 |
| `publishNotReadyAddresses` | 지원 경로에서 준비되지 않은 대상도 게시하도록 하는 예외 설정 |

`targetPort`에는 Pod의 `ports[].name: http`처럼 이름을 쓸 수 있어 포트 번호가 바뀌어도 Service는 그대로다. 포트가 2개 이상이면 `name`이 필수다. `targetPort`는 컨테이너가 **실제로 listen하는** 포트와 맞아야 하며, `containerPort`를 적는 것만으로 앱 서버가 실행되거나 방화벽이 열리지는 않는다. selector 기반 Service는 같은 Namespace의 Pod 라벨을 선택한다.

### 1.3 NodePort와 LoadBalancer — 계층과 실제 패킷 경로

**한 줄 요약:** NodePort는 같은 엔드포인트 목록으로 가는 진입점을 하나 더 추가하는 것이고, LoadBalancer는 그 위에 클라우드 LB를 얹는다. 다만 이 "계층"이 항상 실제 패킷 경로는 아니다.

> **입문 책에서 배운 것:** `LoadBalancer ⊃ NodePort ⊃ ClusterIP`, NodePort의 30000&#126;32767 범위, LB 비용. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md)

NodePort가 더하는 것은 **모든 노드**(Pod가 있든 없든)의 지정 포트가 열려 `노드IP:30080` 트래픽도 같은 엔드포인트 목록으로 간다는 점뿐이다. 규칙 수준에서는 `KUBE-SERVICES` 대신 `KUBE-NODEPORTS`에서 같은 `KUBE-SVC-*` 체인으로 들어가는 모습으로 확인된다([17장](17-kube-proxy-데이터플레인.md) 2.4). LoadBalancer는 cloud-controller-manager의 `service` 컨트롤러가 클라우드 API로 LB를 만들고 **각 노드의 NodePort**를 백엔드로 등록한다. `EXTERNAL-IP`가 `<pending>`이면 cloud-controller-manager가 없거나(베어메탈·kind) 권한이 부족한 것이고, 온프레미스에서는 MetalLB가 그 역할을 대신한다(IP 풀을 정의하면 ARP(L2 모드)나 BGP(L3 모드)로 IP 광고).

**계층과 실제 경로는 다를 수 있다.** `kubernetes-qustion-book`의 AWS ALB 예에서, **IP target** 방식은 Service가 설정상의 backend 연결에 쓰여도 패킷이 반드시 ClusterIP나 NodePort를 경유하지 않고 Pod IP로 가며, **instance target** 방식은 ALB → 노드 NodePort → Pod 경로다. controller는 LB 설정을 유지할 뿐 요청마다 중간에서 처리하지 않는다([19장](19-Ingress와-Gateway-API.md)).

### 1.4 ExternalName — 이름만 바꾸는 경계

**한 줄 요약:** 셀렉터·엔드포인트·ClusterIP가 없고 DNS CNAME 하나만 만든다. 트래픽은 클러스터 데이터플레인을 거치지 않는다.

> **입문 책에서 배운 것:** ExternalName은 프록시 없이 CNAME만 만든다. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md)

kube-proxy가 관여할 대상 자체가 없고 CoreDNS의 CNAME 레코드(`legacy-db.default.svc.cluster.local → db.legacy.example.com`)만 만들어지며, 클라이언트가 그 도메인으로 직접 연결한다. 그래서 HTTP Host·TLS 이름은 별도로 맞아야 한다. 이 "프록시되지 않는다"는 성질이 2.4절의 selector 없는 Service(실제로 프록시·로드밸런싱된다)와의 결정적 차이다.

### 1.5 분류 주의 — 헤드리스는 별도 type이 아니다

**한 줄 요약:** `type` 값은 네 가지이고, 헤드리스는 `clusterIP: None`이라는 형태다.

> **[보충]** 원천 사이에 분류 차이가 있다. `Kubernetes_Internals_Network_Guide`는 헤드리스를 "다섯 번째 타입"으로 세지만, `kubernetes-qustion-book`은 "Headless는 별도의 `type` 값이 아니다"(`clusterIP: None`)라고 정확히 구분한다. 이 책은 후자를 따른다. `type` 값은 네 가지이고, 헤드리스는 `clusterIP: None`이라는 형태다.

## 코어 2. EndpointSlice는 "지금 이 주소들이 대상"이라는 구체 목록이다

### 2.1 Service는 의도, EndpointSlice는 구체 정보

**한 줄 요약:** Service가 "app=payments를 연결"이라는 의도라면, EndpointSlice는 "현재 이 주소·포트·상태가 대상"이라는 구체 목록이고 controller가 자동 생성한다.

```
Service selector ─┐
                  ├→ EndpointSlice controller → EndpointSlice → kube-proxy 등 전달 구현
Pod 주소와 상태 ──┘
```

Pod A가 없어지고 Pod B가 생기면 B의 IP는 달라도 된다. **대상 목록이 갱신되고 전달 규칙이 따라 바뀌므로** 새 연결은 B로 갈 수 있다. 다만 기존 TCP 연결이 새 프로세스로 자동 이식되는 것은 아니어서, 클라이언트의 재연결·재시도가 필요할 수 있다. 반대로 selector를 바꾸면 Pod 자체는 그대로인 채 선택 대상만 바뀌고, Service를 지워도 선택했던 Pod를 보통 함께 지우지 않는다. Service는 "연결 의도"일 뿐 Pod의 소유자가 아니다.

### 2.2 필드 구조

**한 줄 요약:** `kubernetes.io/service-name` 라벨이 Service와 잇는 유일한 연결고리이고, `conditions.ready`가 트래픽 대상 여부를 정한다.

```bash
kubectl get endpointslices -l kubernetes.io/service-name=payments
kubectl get endpointslice payments-abc12 -o yaml
```

```yaml
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: payments-abc12
  labels:
    kubernetes.io/service-name: payments   # ★ 이 라벨로 Service와 연결된다
addressType: IPv4
ports:
  - name: http
    port: 8080
    protocol: TCP
endpoints:
  - addresses: ["10.244.1.3"]
    conditions:
      ready: true          # 정상 트래픽 대상
      serving: true        # 실제로 서비스 가능 (ready와 별개로 유지되는 값도 있음)
      terminating: false   # 종료 절차 진행 여부
    nodeName: k8s-guide-worker
    zone: ap-northeast-2a  # 토폴로지 인식 라우팅에 사용
    hints:
      forZones:
        - name: ap-northeast-2a
  - addresses: ["10.244.2.4"]
    conditions:
      ready: false         # readiness 실패 중. 트래픽 안 감
      serving: false
      terminating: false
```

| 필드 | 의미 |
|---|---|
| `endpoints[].addresses` | 백엔드 Pod IP (배열이지만 보통 1개) |
| `endpoints[].conditions.ready` | **트래픽을 받을지 결정하는 값.** readiness 프로브 결과와 직결 |
| `endpoints[].conditions.serving` | `ready`와 별개로 유지되는 "지금 서비스 가능한가" 플래그. 종료 중에도 드레이닝을 위해 `true`로 유지될 수 있다 |
| `endpoints[].conditions.terminating` | Pod가 종료 절차(`preStop`, 그레이스풀 셧다운) 중임 |
| `endpoints[].hints.forZones` | 토폴로지 인식 라우팅 힌트: 같은 가용 영역의 클라이언트가 이 엔드포인트를 우선 선택 |
| `endpoints[].nodeName` | 이 엔드포인트가 위치한 노드. `Local` 트래픽 정책이 참조 |
| `endpoints[].targetRef` | 관련 Pod 등 원래 대상 참조 |

하나의 Service에 **여러 Slice**가 연결될 수 있으므로 하나만 읽고 모든 대상이라고 가정하지 않는다. 또 `ready: false`인 주소가 목록에 남아 있을 수 있으므로 "주소가 보인다"와 "일반 요청 대상으로 준비됐다"는 다르다. 자동 관리 중인 Slice를 직접 수정하면 controller가 되돌릴 수 있다.

### 2.3 왜 Endpoints가 EndpointSlice로 바뀌었나

**한 줄 요약:** 단일 Endpoints는 Pod 하나만 바뀌어도 오브젝트 전체가 모든 노드로 재전송됐다. EndpointSlice는 약 100개 단위로 쪼개 바뀐 슬라이스만 보낸다.

원래는 `Endpoints`라는 단일 오브젝트가 Service 하나당 모든 IP를 담았다. 백엔드 Pod가 10,000개면 그중 하나의 IP만 바뀌어도 10,000개 항목을 담은 오브젝트 전체가 다시 쓰이고 그 Service를 watch하는 모든 노드의 kube-proxy로 재전송된다. API 서버가 직렬화할 페이로드, etcd에 다시 쓸 크기, watch cache의 fan-out 부하가 전부 Pod 수에 비례해 폭증했고, 대규모 클러스터의 컨트롤 플레인을 무너뜨리는 전형적 원인이었다.

**EndpointSlice**(v1.21+ 기본)는 약 100개 단위의 작은 오브젝트로 쪼갠다(기본 상한이며 `kube-controller-manager`의 `--max-endpoints-per-slice`로 조정 가능, 상한 1000).

```
payments-abc12  → 100개 엔드포인트
payments-def34  → 100개 엔드포인트
payments-ghi56  →  87개 엔드포인트
```

Pod 하나가 바뀌면 그 Pod가 속한 슬라이스 하나만 다시 쓰이고 전송된다. 전송량과 API 서버 부하가 Pod 총수가 아니라 슬라이스 크기(최대 100)에 비례한다. 이 컨트롤러도 Service와 Pod를 watch하다가 변경이 감지되면 관련 슬라이스만 처리한다. 추가 이점으로 `zone`·`hints.forZones`를 조합하면 같은 가용 영역(AZ) 안의 엔드포인트를 우선 선택하도록 해 AZ 간 트래픽 비용을 줄일 수 있다.

```yaml
metadata:
  annotations:
    service.kubernetes.io/topology-mode: Auto   # 힌트 활성화
```

### 2.4 selector 없는 Service와 수동 EndpointSlice

**한 줄 요약:** 셀렉터를 빼고 EndpointSlice를 직접 만들면 외부 IP를 클러스터 내부 Service처럼 쓰면서 로드밸런싱·포트 매핑까지 받는다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  ports:
    - port: 5432
      targetPort: 5432
  # selector 없음!
---
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: external-db-1
  labels:
    kubernetes.io/service-name: external-db    # ★ Service와 연결
addressType: IPv4
ports:
  - port: 5432
endpoints:
  - addresses: ["192.168.1.50"]
  - addresses: ["192.168.1.51"]
```

ExternalName과 달리 **실제로 프록시되고 로드밸런싱된다.**

## 코어 3. 디스커버리는 DNS가 정답이고, 헤드리스는 가상 IP를 없앤다

### 3.1 환경변수 vs DNS

**한 줄 요약:** 환경변수는 Pod 시작 시점의 스냅샷이라 나중에 생긴 Service는 아예 나타나지 않는다. DNS는 요청 시점에 해석되어 순서 의존성이 없다.

kubelet은 Pod 시작 시 **그 시점에 이미 존재하는** 모든 Service의 환경변수를 주입한다.

```bash
PAYMENTS_SERVICE_HOST=10.96.142.88
PAYMENTS_SERVICE_PORT=80
PAYMENTS_PORT=tcp://10.96.142.88:80
PAYMENTS_PORT_80_TCP_ADDR=10.96.142.88
```

**치명적 함정은 순서 의존성**이다. Service가 Pod보다 나중에 만들어지면 그 Pod에는 `PAYMENTS_SERVICE_HOST`가 아예 없다. Pod를 재시작하지 않는 한 알 방법이 없고, 롤아웃·적용 순서에 따라 재현되기도 안 되기도 해서 디버깅하기 까다롭다. DNS는 다르다.

```bash
curl http://payments.default.svc.cluster.local
curl http://payments      # 같은 네임스페이스면 짧은 이름으로도 가능
```

DNS 조회는 요청 시점에 즉시 해석되므로 Service가 언제 만들어졌든 현재 ClusterIP(헤드리스면 현재 Pod IP 목록)를 돌려준다. 실무에서 환경변수 방식을 쓸 이유는 사실상 없고 레거시 호환으로 주입될 뿐이다. 이름이 어떻게 구성·해석되는지는 [18장](18-DNS와-서비스-디스커버리.md)에서 다룬다.

### 3.2 헤드리스 서비스 — 가상 IP를 만들지 않는다

**한 줄 요약:** `clusterIP: None`이면 EndpointSlice는 만들어지지만 ClusterIP와 데이터플레인 규칙은 없고, DNS가 Pod IP 목록을 돌려줘 로드밸런싱을 클라이언트가 한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: db-headless
spec:
  clusterIP: None       # ★
  selector:
    app: db
  ports:
    - port: 5432
```

| | 일반 ClusterIP | 헤드리스 |
|---|---|---|
| ClusterIP 할당 | 있음 | 없음 (`None`) |
| kube-proxy 데이터플레인 규칙 | 생성됨 | **생성 안 됨** |
| DNS 조회 결과 | ClusterIP 하나 | **모든 Pod IP 목록** (StatefulSet이면 개별 Pod 이름도) |
| 로드밸런싱 주체 | kube-proxy | **클라이언트가 직접 선택** |

```bash
dig +short svc-demo
# 10.96.142.88                  ← ClusterIP 하나
dig +short svc-demo-headless
# 10.244.1.3                    ← Pod IP 전부
# 10.244.2.4
# 10.244.1.5
```

왜 필요한가는 셋이다.

1. **StatefulSet의 개별 Pod 식별.** 각 Pod에 고유 DNS 이름(`db-0.db-headless.default.svc.cluster.local`)을 부여하는 것이 헤드리스 서비스다. "db-0이 프라이머리"라는 규칙은 특정 Pod를 지목해 연결할 수 있어야 구현되는데, 가상 IP 뒤에서 로드밸런싱되는 일반 Service로는 불가능하다.
2. **클라이언트 사이드 로드밸런싱.** gRPC처럼 HTTP/2에서 연결을 오래 유지하는 프로토콜은 일반 Service에서 최초 연결이 맺어진 Pod로 이후 모든 요청이 고정돼 로드밸런싱이 사실상 무력화된다. 헤드리스로 모든 Pod IP를 받아 클라이언트 라이브러리가 직접 분산하면 해결된다.
3. **피어 디스커버리.** Kafka·Cassandra·Elasticsearch처럼 클러스터 멤버 목록이 필요한 시스템이 DNS 조회로 모든 피어를 찾는다.

```go
// gRPC 클라이언트에서
conn, _ := grpc.Dial(
    "dns:///db-headless.default.svc.cluster.local:5432",
    grpc.WithDefaultServiceConfig(`{"loadBalancingConfig": [{"round_robin":{}}]}`),
)
```

> **[보충]** 게임 서버로 치면 로비-게임룸 사이의 장기 연결(TCP를 오래 유지하는 구조)도 같은 성질이다. 연결 단위로 백엔드가 고정되므로, 연결이 소수이고 오래 유지되면 서비스 앞단 로드밸런싱이 균등하게 퍼지지 않는다는 점을 의식해야 한다. 이 직접 연결은 원천이 gRPC 예로 설명한 것을 소켓 서버에 옮긴 학습용 해석이다.

## 코어 4. 트래픽 정책·세션 어피니티·드레이닝이 "어디로, 어떻게 끊김 없이"를 정한다

### 4.1 세션 어피니티

**한 줄 요약:** `sessionAffinity: ClientIP`는 소스 IP를 키로 일정 시간 같은 백엔드에 고정하며, NAT 뒤 다수 사용자가 한 Pod로 몰리는 한계가 있다.

기본은 요청(연결)마다 무작위 백엔드를 고른다. 같은 클라이언트를 같은 Pod로 보내려면 다음과 같이 한다.

```yaml
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800   # 3시간, 기본값 10800, 최대 86400
```

데이터플레인 레벨(iptables/IPVS)에서 구현되며 커널이 어피니티 상태를 추적한다. 한계: NAT 뒤의 다수 사용자가 같은 소스 IP로 보이면 전부 같은 Pod로 몰린다. 쿠키 기반 세션 고정이 필요하면 Ingress 컨트롤러나 서비스 메시의 몫이다. 이것은 앱 세션을 저장하는 기능이 아니다.

### 4.2 internalTrafficPolicy / externalTrafficPolicy

**한 줄 요약:** 라우팅 후보를 클러스터 전체(`Cluster`)로 볼지 그 노드의 로컬 엔드포인트(`Local`)로 한정할지 정한다. `Local`은 클라이언트 IP를 보존하지만 부하가 불균등해질 수 있다.

> **입문 책에서 배운 것:** `externalTrafficPolicy`의 `Cluster`(기본: 균등 분산, SNAT로 클라이언트 IP 소실, 홉 하나 더)와 `Local`(클라이언트 IP 보존, Pod 없는 노드는 무응답·부하 불균등)의 장단점 표. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md)

```yaml
spec:
  internalTrafficPolicy: Cluster    # 또는 Local — 클러스터 내부 트래픽
  externalTrafficPolicy: Cluster    # 또는 Local — NodePort/LoadBalancer로 들어온 외부 트래픽
```

`Cluster`에서 홉이 늘어나는 이유: 노드A로 들어온 요청이 노드B의 Pod로 가려면 노드A의 데이터플레인이 패킷을 노드B로 다시 전달해야 한다. 원본 클라이언트 IP를 보존한 채 보내면 노드B가 응답을 노드A가 아닌 클라이언트로 직접 돌려보내려 해 비대칭 경로 문제가 생기므로, 커널은 소스 주소를 노드A의 IP로 치환(SNAT/마스커레이드)한다. 그 결과 노드B의 Pod에게는 모든 요청이 "노드A에서 온 것"처럼 보인다(규칙 수준 확인은 [17장](17-kube-proxy-데이터플레인.md)의 `0x4000` 마크). **클라우드 LoadBalancer가 헬스체크로 Pod 없는 노드를 제외해 준다면** `Local`이 우수한 선택이며, 클라우드의 LoadBalancer 구현체는 이 조합(LB 헬스체크 + `Local`)을 기본 권장 패턴으로 삼는다. `internalTrafficPolicy: Local`은 같은 개념을 클러스터 내부에 적용한다(예: 노드마다 로컬 캐시 DaemonSet, NodeLocal DNSCache).

### 4.3 종료 중인 엔드포인트 — 커넥션 드레이닝

**한 줄 요약:** Pod 삭제 시 EndpointSlice에서 곧바로 사라지지 않고 `ready=false` + `terminating=true`로 전이해 새 연결은 막고 기존 연결은 끊지 않는다.

```
① 삭제 요청 접수 → Pod에 deletionTimestamp 기록, preStop 훅 실행 시작
                    동시에 EndpointSlice에서 이 엔드포인트의
                    conditions.ready = false, conditions.terminating = true 로 갱신
                    (ready는 즉시 내려가지만 serving은 잠시 true로 유지될 수 있다)
        ↓
② kube-proxy/데이터플레인이 이 변경을 즉시 반영
     · ready=false → "새로운" 연결의 로드밸런싱 후보에서 제외
     · terminating 상태를 인식하는 구현은 "이미 맺힌 연결"은 강제로 끊지 않고 자연스러운 종료를 기다린다
        ↓
③ preStop 완료 또는 terminationGracePeriodSeconds 만료
        ↓
④ 컨테이너 SIGTERM/SIGKILL → Pod 실제 삭제 → EndpointSlice에서 엔드포인트 완전 제거
```

여기에 롤링 업데이트 중 502의 근본 원인이 걸려 있다. `kubernetes-textbook-main` 6.4는 Pod 종료의 두 갈래가 **병렬**이라고 강조한다.

```
kubectl delete pod (또는 롤링 업데이트로 교체)
        │
① API 서버: deletionTimestamp 설정 → Pod가 "Terminating"
        ├──────────────┬─────────────────┐
② kubelet:        ③ 엔드포인트 컨트롤러:   ★ 이 둘은 병렬이다!
   preStop 실행       Endpoints에서 제거      순서가 보장되지 않는다
        │              │
        │         kube-proxy가 각 노드의 iptables 규칙 갱신 (수백 ms ~ 수 초 소요)
④ preStop 완료 → SIGTERM 전송
⑤ terminationGracePeriodSeconds 대기 (기본 30초, preStop 시간 포함)
⑥ 아직 살아 있으면 SIGKILL
```

앱이 SIGTERM을 받고 **즉시** 종료하면, kube-proxy가 아직 규칙을 지우지 못한 노드에서 그 Pod로 트래픽을 보내 연결 거부(502/503)가 난다. 해결은 두 가지를 함께 쓴다. ① `preStop`으로 시간을 번다(`command: ["sleep", "10"]`, 그 사이 앱은 요청을 계속 처리하고 모든 노드의 규칙이 갱신된다). ② 앱이 SIGTERM을 제대로 처리한다(새 연결 수락 중단, 진행 중 요청 완료, 정리 후 종료). SIGTERM을 받으면 readiness(`/readyz`)가 503을 반환하게 해 엔드포인트에서 빠지도록 유도할 수도 있다. 또한 `command: ["sh", "-c", "python app.py"]`처럼 셸이 PID 1이 되면 SIGTERM이 앱에 전달되지 않아 30초 후 SIGKILL(exitCode 137)이 되므로 `exec`로 프로세스를 교체하거나 셸을 거치지 않는다.

## 실무 적용

### 체크리스트

- [ ] Pod IP는 일회용이다. 서버 간 접속은 Service 이름/ClusterIP로 하고 Pod IP를 하드코딩하지 않는다.
- [ ] ClusterIP는 가상 IP다. ping 무응답은 장애가 아니고, 연결 확인은 실제 서비스 포트로 한다.
- [ ] `LoadBalancer ⊃ NodePort ⊃ ClusterIP`. NodePort는 개발·테스트용, LoadBalancer는 서비스마다 LB가 생겨 비용이 늘어난다. HTTP 노출은 Ingress.
- [ ] `selector`의 라벨이 Pod 라벨·네임스페이스와 맞는지, 포트가 2개 이상이면 `name`을 붙였는지, `targetPort`가 컨테이너의 실제 listen 포트인지 확인한다.
- [ ] EndpointSlice(`kubectl get endpointslices -l kubernetes.io/service-name=<이름>`)를 본다. 슬라이스가 여러 개일 수 있고, `ready: false` 주소가 남아 있을 수 있다.
- [ ] 디스커버리는 DNS 이름을 쓴다. 환경변수는 Pod 시작 시점 스냅샷이다.
- [ ] 클라이언트 IP가 필요하면 `externalTrafficPolicy`를 의식해 고른다(`Cluster` = SNAT로 소실, `Local` = 보존하지만 Pod 없는 노드는 무응답·부하 불균등). `Local`은 LB 헬스체크와 함께 쓴다.
- [ ] 장기 연결(gRPC 등)은 일반 Service에서 한 Pod로 고정된다. 헤드리스 + 클라이언트 사이드 로드밸런싱을 검토한다.
- [ ] 무중단 종료는 `preStop` sleep + 앱의 SIGTERM 처리 + readiness 연동을 함께 쓴다.

### 진단 순서 — Service가 동작하지 않을 때 위에서 아래로

`kubernetes-textbook-main` 9.7의 순서다.

```bash
# ① Service가 존재하고 ClusterIP가 할당됐는가
kubectl get svc web
# ② 엔드포인트가 있는가  ★ 가장 흔한 실패 지점 (비어 있다면 셀렉터 불일치 또는 Pod가 Ready가 아님)
kubectl get endpointslice -l kubernetes.io/service-name=web
# ③ 셀렉터가 Pod와 맞는가
kubectl get svc web -o jsonpath='{.spec.selector}'
kubectl get pods --show-labels
# ④ Pod가 Ready인가 / ⑤ 포트가 맞는가
kubectl get pods -l app=web
kubectl get svc web -o jsonpath='{.spec.ports}'
# ⑥ Pod에 직접 접근되는가 (Service를 건너뛰고)
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- curl -s <POD_IP>:8080
# ⑦ ClusterIP로 접근되는가
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- curl -s <CLUSTER_IP>:80
# ⑧ DNS 이름으로 접근되는가
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- curl -s web
```

⑥은 되는데 ⑦이 안 되면 kube-proxy 쪽(규칙 미생성, [17장](17-kube-proxy-데이터플레인.md)), ⑦은 되는데 ⑧이 안 되면 DNS 쪽([18장](18-DNS와-서비스-디스커버리.md))이다. **이 구분이 진단의 핵심이다.** 일부 요청만 실패하면 일부 Pod가 비정상일 수 있으니 엔드포인트의 `ready`를 보고, 간헐적 연결 리셋은 종료 중인 Pod로 트래픽이 가는 경우(preStop 확인)다.

### 시나리오로 확인하기

1. **상황:** 게임룸 Pod 두 개가 모두 Ready인데 `kubectl get endpointslices -l kubernetes.io/service-name=gameroom`에 대상이 0개고, 요청이 하나도 닿지 않는다.
   **질문:** 첫 가설과 확인 순서는?

   <details markdown="1"><summary>답 확인</summary>

   Service `selector`와 실제 Pod 라벨, 네임스페이스의 불일치가 첫 가설이다(`kubectl get svc <이름> -o jsonpath='{.spec.selector}'`, `kubectl get pods --show-labels`). CPU를 늘리는 것은 이 증거와 연결되지 않는다. 엔드포인트가 비어 있다면 selector 오타·Pod가 Ready 아님·네임스페이스 불일치 중 하나다. 이어 포트(`targetPort`가 컨테이너의 실제 listen 포트인지)도 확인한다. → 코어 1, 코어 2

   </details>

2. **상황:** 롤링 업데이트 중에만 간헐적으로 연결 거부(502)가 난다. 앱은 SIGTERM을 받자마자 즉시 종료하도록 짜여 있다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   Pod 종료의 kubelet(preStop → SIGTERM)과 엔드포인트 제거(컨트롤러 → 각 노드 kube-proxy 규칙 갱신, 수백 ms&#126;수 초)가 병렬이라, 즉시 종료하면 아직 규칙이 지워지지 않은 노드가 죽은 Pod로 트래픽을 보낸다. `preStop`에 `sleep`으로 시간을 벌고 앱이 SIGTERM을 받으면 새 연결 수락을 멈추고 진행 중 요청을 끝내도록 하며, readiness도 연동한다. 셸이 PID 1이면 SIGTERM이 전달되지 않으니 `exec`/셸 미경유로 한다. → 코어 4 (4.3)

   </details>

3. **상황:** gRPC 기반 서버 간 통신을 일반 ClusterIP Service로 연결했더니 Pod 5개 중 하나로만 트래픽이 몰린다.
   **질문:** 왜 그런가? 어떻게 푸는가?

   <details markdown="1"><summary>답 확인</summary>

   HTTP/2 위에서 연결을 오래 유지하는 프로토콜은 일반 Service에서 최초 연결이 맺어진 Pod로 이후 모든 요청이 고정돼 로드밸런싱이 사실상 무력화된다(분배는 연결 단위). 헤드리스 Service(`clusterIP: None`)로 DNS에서 모든 Pod IP를 받고 클라이언트 라이브러리가 직접 분산(`round_robin` 등)하게 한다. → 코어 3 (3.2)

   </details>

4. **상황:** NodePort로 노출한 서비스의 접속 로그에서 클라이언트 IP가 전부 노드 IP로 찍혀 IP 기반 차단이 안 된다.
   **질문:** 원인과 선택지는?

   <details markdown="1"><summary>답 확인</summary>

   `externalTrafficPolicy` 기본값 `Cluster`는 다른 노드의 Pod로 넘기며 SNAT하므로 클라이언트 IP가 소실된다. `Local`로 바꾸면 해당 노드의 Pod로만 전달해 IP가 보존되지만 Pod가 없는 노드는 응답하지 않아 부하가 불균등해지므로, 클라우드 LB의 헬스체크로 Pod 없는 노드를 제외하는 조합이 권장된다. → 코어 4 (4.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] ClusterIP = 주소가 아니라 ( ? ) — 어떤 ( ? )에도 바인딩 안 됨
  타입 포함: ( ? ) ⊃ ( ? ) ⊃ ( ? )
  NodePort 범위 ____~____, 모든 ( ? )에서 열림
  ExternalName = DNS ( ? ) 만, 셀렉터·엔드포인트·ClusterIP 없음
  targetPort는 번호 또는 ( ? ), 포트 2개 이상이면 ( ? ) 필수

[코어 2] Service = ( ? ) / EndpointSlice = 현재 ( ? ) 목록 / 연결 라벨 kubernetes.io/( ? )
  conditions: ( ? ) = 트래픽 대상 / serving / ( ? ) = 종료 중
  Endpoints 문제: Pod 하나 바뀌어도 ( ? ) 재전송 → EndpointSlice는 ( ? )개 단위(상한 1000)
  selector 없는 Service + 수동 ( ? ) → 실제 프록시됨(ExternalName과 다름)

[코어 3] 환경변수: Pod ( ? ) 시점 스냅샷 → Service가 나중에 생기면 ( ? )
  헤드리스: clusterIP: ( ? ) → DNS가 ( ? ) 반환, 로드밸런싱은 ( ? )가
  필요한 이유 3: StatefulSet 개별 Pod / 클라이언트 사이드 LB / ( ? )

[코어 4] sessionAffinity: ( ? ) 기본 10800초, 한계 = NAT 뒤 사용자 쏠림
  Cluster: SNAT로 클라이언트 IP ( ? ) / Local: IP 보존, Pod 없는 노드 ( ? )
  종료: ready=( ? ) + terminating=( ? ) → 새 연결 막고 기존 연결은 유지
  종료와 엔드포인트 제거는 ( ? ) → preStop ( ? ) + SIGTERM 처리
```

### 2. 인출 질문

1. 클러스터 내부에서 `orders` Service를 호출할 때 시간순으로 일어나는 일은? 그중 패킷을 실제로 중계하는 프로세스가 있는 단계는 어디인가?

   <details markdown="1"><summary>답 확인</summary>

   ① 호출 Pod가 CoreDNS에 `orders.<ns>.svc.cluster.local`을 조회 ② ClusterIP 응답 ③ ClusterIP:80으로 TCP 연결 ④ 노드 데이터 경로의 Service·EndpointSlice 기반 규칙 적용 ⑤ 선택된 Pod IP:8080으로 전달 ⑥ 연결 경로로 응답. DNS는 이름을 주소로 해석할 뿐 매 패킷을 중계하지 않고, ClusterIP에는 항상 떠 있는 서버 프로세스가 없으며, 일반 kube-proxy도 모든 패킷이 통과하는 사용자 공간 프로세스가 아니다(규칙 구성자). eBPF 대체 구현에서는 담당 구성요소가 달라질 수 있다. → 코어 1 (1.1, 1.2)

   </details>

2. NodePort가 "새 프록시 로직이 아니라 진입점 하나 더"라는 말은 규칙 수준에서 어떻게 확인되나? LoadBalancer ⊃ NodePort ⊃ ClusterIP 계층과 실제 패킷 경로가 다를 수 있는 예는?

   <details markdown="1"><summary>답 확인</summary>

   NodePort 트래픽은 `KUBE-SERVICES` 대신 `KUBE-NODEPORTS`(포트만으로 매칭)를 거쳐 같은 `KUBE-SVC-*` 체인으로 들어간다(17장). 계층 예외는 AWS ALB의 IP target 방식이다. Service가 설정상의 backend 연결에 쓰여도 패킷이 반드시 ClusterIP나 NodePort를 경유하지 않고 Pod IP로 직접 가며, instance target 방식이면 ALB → 노드 NodePort → Pod 경로다. 클라우드 LB는 `service` 컨트롤러가 각 노드 NodePort를 백엔드로 등록해 만든다(서비스마다 LB 하나, 비용). → 코어 1 (1.3)

   </details>

3. ExternalName과 "selector 없는 Service + 수동 EndpointSlice"의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   ExternalName은 DNS CNAME만 만들고 프록시하지 않으며 트래픽이 클러스터 데이터플레인을 거치지 않는다. selector 없는 Service에 `kubernetes.io/service-name` 라벨의 EndpointSlice를 직접 만들면 실제로 프록시·로드밸런싱·포트 매핑이 적용된다. → 코어 1 (1.4), 코어 2 (2.4)

   </details>

4. EndpointSlice의 `ready`, `serving`, `terminating`은 각각 무엇이고 트래픽은 누구에게 가나?

   <details markdown="1"><summary>답 확인</summary>

   `ready`는 트래픽을 받을지 결정하는 값(readiness 프로브 결과와 직결, `true`인 엔드포인트에만 트래픽), `serving`은 ready와 별개로 유지되는 "지금 서비스 가능한가" 플래그(종료 중에도 드레이닝을 위해 true일 수 있음), `terminating`은 종료 절차 진행 여부다. → 코어 2 (2.2)

   </details>

5. Endpoints를 EndpointSlice로 바꾼 이유와 슬라이스 크기는?

   <details markdown="1"><summary>답 확인</summary>

   Service당 하나인 Endpoints는 Pod 하나만 바뀌어도 오브젝트 전체가 직렬화·etcd 기록·모든 노드 kube-proxy 재전송되어 부하가 Pod 수에 비례했다. EndpointSlice(v1.21+ 기본)는 약 100개 단위(`--max-endpoints-per-slice`, 상한 1000)로 쪼개 바뀐 슬라이스만 보낸다. → 코어 2 (2.3)

   </details>

6. 환경변수 기반 디스커버리의 함정은?

   <details markdown="1"><summary>답 확인</summary>

   환경변수는 Pod 시작 시점에 이미 존재하던 Service만 주입되는 스냅샷이라, Service가 나중에 만들어지면 Pod 재시작 전까지 나타나지 않는다. 순서에 따라 재현이 달라져 디버깅이 까다롭다. DNS는 요청 시점에 해석되어 이 문제가 없다. → 코어 3 (3.1)

   </details>

7. 헤드리스 서비스가 일반 Service와 다른 점 네 가지와 쓰이는 곳은?

   <details markdown="1"><summary>답 확인</summary>

   ClusterIP 없음(`None`), kube-proxy 규칙 생성 안 됨, DNS가 모든 Pod IP 목록 반환, 로드밸런싱을 클라이언트가 선택. StatefulSet의 개별 Pod DNS 이름, gRPC 같은 장기 연결의 클라이언트 사이드 로드밸런싱, Kafka·Cassandra 같은 피어 디스커버리에 쓰인다. → 코어 3 (3.2)

   </details>

8. `externalTrafficPolicy: Cluster`와 `Local`의 차이, 그리고 SNAT가 생기는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   `Cluster`(기본)는 클러스터 전체 엔드포인트로 분산하지만 노드를 건너가면 소스를 노드 IP로 치환(SNAT)해 클라이언트 IP가 소실되고 홉이 늘어난다(원본 IP를 보존하면 응답이 비대칭 경로로 돌아가려 하기 때문). `Local`은 그 노드의 Pod로만 보내 SNAT 없이 IP를 보존하지만 Pod 없는 노드는 응답이 없고 분포가 불균등하면 부하가 불균등하다. → 코어 4 (4.2)

   </details>

9. Pod 삭제 시 EndpointSlice 상태 전이와, 롤링 업데이트 중 502가 나는 근본 원인은?

   <details markdown="1"><summary>답 확인</summary>

   삭제 요청이 접수되면 `ready=false`, `terminating=true`로 갱신되어 새 연결은 막고 기존 연결은 강제로 끊지 않으며, preStop 완료 또는 grace period 만료 뒤 SIGTERM/SIGKILL, Pod 삭제, 엔드포인트 제거로 간다. 502의 원인은 kubelet의 preStop/SIGTERM과 엔드포인트 제거(kube-proxy 규칙 갱신까지 수백 ms&#126;수 초)가 병렬이라, 즉시 종료하면 규칙이 남은 노드가 죽은 Pod로 보내는 것이다. → 코어 4 (4.3)

   </details>

### 3. 기억 고리

- **C++ 유추:** Service = 로그인 서버가 내려주는 "대표 접속 주소 + 서버 목록 관리", EndpointSlice = 하트비트로 걸러진 살아 있는 서버 목록. ⚠️ 깨지는 곳: 대표 주소에 `accept()`하는 프로세스가 없고, 목록은 컨트롤러가 갱신해 모든 노드가 watch하며, 분배 규칙은 각 노드 커널에서 실행된다.
- **비유:** Service = 회사 대표 전화번호, EndpointSlice = 지금 근무 중인 담당자 명단. 담당자가 바뀌어도 번호는 그대로. ⚠️ 비유가 깨지는 지점: 대표번호에 받는 전화기가 있는 것과 달리 ClusterIP에는 응답하는 장비가 없고, 퇴근 처리(종료)는 "새 전화 차단(ready=false)"과 "통화 중인 건 끝까지(terminating)"로 나뉘어 있다.
- **묶음(3의 법칙):** Service가 푸는 문제 3(일회용 IP / 개수·위치 / 로드밸런싱 주체), 헤드리스가 필요한 이유 3(StatefulSet·클라이언트 LB·피어 디스커버리), conditions 3(ready·serving·terminating).
- **대칭·순서:** `ClusterIP → NodePort → LoadBalancer`(안에서 밖으로 감쌈). 대비 쌍: Cluster vs Local, Endpoints vs EndpointSlice, 환경변수 vs DNS, ExternalName(프록시 없음) vs selector 없는 Service+수동 EndpointSlice(프록시 있음). 종료 순서: ready=false → 새 연결 차단 → 기존 연결 드레인 → SIGTERM/SIGKILL → 제거.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod가 바뀌어도 Service 주소는 안 바뀌는 이유와, 그 목록이 어떻게 갱신되는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리가 직접 짜던 서버 목록 관리·하트비트 제거를 쿠버네티스에서는 누가 하며, 서버를 내릴 때 요청이 안 끊기게 하려면 무엇을 해야 하는지"를 설명해 보세요.
- **랜덤 논리 게임:** A "gRPC 서비스도 일반 ClusterIP로 두면 충분하다" vs B "헤드리스 + 클라이언트 사이드 로드밸런싱이 필수다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Service 타입, EndpointSlice 필드, 종료 중 드레이닝을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/14-Service와-EndpointSlice.md (14.1 Service 타입별 내부 동작, 14.2 EndpointSlice 구조와 마이그레이션 이유, 14.3 서비스 디스커버리 메커니즘, 14.4 세션 어피니티와 트래픽 정책); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/09-서비스와-클러스터-네트워킹-기초.md (9.2 Service 타입, 셀렉터 없는 Service, 9.3 Endpoints와 EndpointSlice, 9.4 헤드리스 서비스, 9.7 문제 진단); kubernetes-textbook-main/02-워크로드-실행하기/06-Pod-생명주기와-헬스-관리.md (6.4 Pod 종료의 전체 흐름); kubernetes-qustion-book/02_심화/07_통신_오브젝트.md (Service, EndpointSlice), 06_네트워크와_서비스_노출.md (2. 일반적인 클러스터 내부 요청, 3. Service와 EndpointSlice가 나누는 역할, 4. Service 종류, 5. ALB의 IP target·instance target 경로)*
