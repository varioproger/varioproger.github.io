---
title: "14장. Service와 EndpointSlice"
---

# 14장. Service와 EndpointSlice

> **학습목표**
> - Service 다섯 가지 타입(ClusterIP·NodePort·LoadBalancer·ExternalName·Headless)의 내부 동작 차이를 설명할 수 있다.
> - EndpointSlice가 왜 기존 단일 Endpoints 오브젝트를 대체했는지, 핵심 필드 구조와 함께 설명할 수 있다.
> - 환경변수 기반과 DNS 기반 서비스 디스커버리의 차이와 각각의 함정을 안다.
> - `sessionAffinity`와 `internalTrafficPolicy`/`externalTrafficPolicy`의 동작 원리와 트레이드오프를 설명할 수 있다.
> - 종료 중인 Pod에 대한 커넥션 드레이닝이 EndpointSlice의 `terminating` 조건으로 어떻게 구현되는지 안다.
> - EndpointSlice를 직접 조회해 Service 변경이 전파되는 과정을 실시간으로 추적할 수 있다.

---

## 들어가며

13장에서 CNI가 만드는 평평한 네트워크를 봤다. 모든 Pod가 NAT 없이 서로 통신할 수 있다. 그런데 이 평평함만으로는 부족하다 — **Pod IP는 일회용**이다. Pod가 재시작되거나 재스케줄되면 IP가 바뀐다. Deployment가 Pod 3개를 굴린다면 클라이언트는 그 3개가 지금 어떤 IP인지, 몇 개인지조차 알 방법이 없다.

Service는 이 문제를 해결하려고 **변하지 않는 가상 좌표 하나**를 제공하고, 그 뒤에서 실제 Pod 집합을 자동으로 추적한다. 6장에서는 kube-proxy가 "이 가상 좌표를 실제 Pod로 바꿔치기하는 무언가"라고만 언급하고 넘어갔다. 이 장은 **그 좌표 자체(Service)와 그 좌표가 가리키는 대상 목록(EndpointSlice)의 오브젝트 모델**을 다룬다. 그 목록을 실제로 커널 규칙으로 바꾸는 kube-proxy의 데이터플레인은 15장에서, 좌표에 사람이 읽을 수 있는 이름을 붙이는 DNS는 16장에서 각각 이어받는다.

## 14.1 Service 타입별 내부 동작

### ClusterIP — 가상 IP는 어디에도 존재하지 않는다

```yaml
apiVersion: v1
kind: Service
metadata:
  name: payments
spec:
  type: ClusterIP        # 생략 시 기본값
  selector:
    app: payments
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

**가장 중요한 사실**: ClusterIP(`10.96.x.y` 같은 주소)는 **어떤 네트워크 인터페이스에도 바인딩되어 있지 않다.** 이 IP를 향해 `ping`을 보내면 응답이 없다. 라우팅 테이블 어디를 봐도 이 주소로 가는 물리적인 경로가 없기 때문이다.

```
클라이언트 Pod                        실제로 존재하는 Pod
   │  10.96.142.88:80로 연결 시도
   ▼
┌─────────────────────────────────────┐
│  ClusterIP는 "데이터플레인 프로그래밍   │
│  대상"일 뿐이다. 이 IP로 가는 패킷을   │
│  가로채 실제 Pod IP로 바꿔치기하는     │
│  규칙(iptables/IPVS/eBPF, 15장)이     │
│  각 노드 커널에 심어져 있다.           │
└─────────────────┬───────────────────┘
                   ▼
        10.244.1.3:8080 (실제 Pod)
```

즉 ClusterIP는 **주소가 아니라 약속**이다. "이 값으로 패킷을 보내면, 그 순간 노드의 데이터플레인이 알아서 실제 백엔드로 바꿔준다"는 계약이고, 그 계약을 지키는 실행 로직이 15장의 주제다. 이 장에서는 **"무엇으로 바꿀지"를 결정하는 목록(EndpointSlice)이 어떻게 관리되는지**까지만 다룬다.

### NodePort — 모든 노드에 같은 포트를 연다

```yaml
spec:
  type: NodePort
  selector:
    app: payments
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080     # 기본 범위 30000-32767, 생략 시 자동 할당
```

```
NodePort ⊃ ClusterIP
```

**NodePort Service는 ClusterIP를 포함하는 상위 집합이다.** NodePort를 만들면 ClusterIP도 함께 할당되고, 클러스터 **내부**에서는 여전히 ClusterIP로 접근할 수 있다. 추가되는 것은 **모든 노드**(Pod가 그 노드에 있든 없든)의 지정된 포트가 열려, 외부에서 `노드IP:30080`으로 들어온 트래픽도 같은 엔드포인트 목록으로 라우팅된다는 점뿐이다. 즉 NodePort는 새로운 프록시 로직을 만드는 게 아니라, **ClusterIP로 가는 진입점을 하나 더 추가하는 것**이다.

이 진입점 구조 때문에 14.4절에서 다룰 `externalTrafficPolicy`가 의미를 갖는다 — 외부에서 들어온 트래픽이 **어느 노드로 들어왔는지에 따라** 그 노드의 로컬 Pod로만 갈 것인지, 클러스터 전체로 분산할 것인지를 결정해야 하기 때문이다.

### LoadBalancer — 클라우드 LB 프로비저닝

```yaml
spec:
  type: LoadBalancer
  selector:
    app: payments
  ports:
    - port: 443
      targetPort: 8443
```

```
LoadBalancer ⊃ NodePort ⊃ ClusterIP
```

세 계층이 전부 만들어진다. cloud-controller-manager(1장)의 `service` 컨트롤러가 이 Service를 watch하다가, `type: LoadBalancer`를 발견하면 클라우드 API를 호출해 실제 로드밸런서를 프로비저닝하고, 그 로드밸런서의 백엔드로 **각 노드의 NodePort**를 등록한다.

```bash
kubectl get svc payments
```
```
NAME       TYPE           CLUSTER-IP     EXTERNAL-IP        PORT(S)
payments   LoadBalancer   10.96.142.88   a1b2c3.elb.aws...  443:31234/TCP
```

`EXTERNAL-IP`가 `<pending>`에 머무른다면 cloud-controller-manager가 없거나(베어메탈·kind 기본 환경) 클라우드 API 권한이 부족한 것이다. 온프레미스에서 이 타입을 실제로 동작시키려면 MetalLB처럼 `service` 컨트롤러 역할을 대신하는 별도 컴포넌트가 필요하다.

### ExternalName — 프록시하지 않는 순수 DNS 별칭

```yaml
apiVersion: v1
kind: Service
metadata:
  name: legacy-db
spec:
  type: ExternalName
  externalName: db.legacy.example.com
```

**이 Service는 셀렉터도, 엔드포인트도, ClusterIP도 없다.** kube-proxy가 관여할 대상 자체가 없다 — 만들어지는 것은 오직 CoreDNS의 CNAME 레코드 하나뿐이다.

```
legacy-db.default.svc.cluster.local  →  CNAME  →  db.legacy.example.com
```

트래픽이 클러스터 데이터플레인을 전혀 거치지 않고 클라이언트가 직접 그 도메인으로 연결한다는 뜻이다. 클러스터 밖의 서비스를 클러스터 내부 이름 규칙으로 참조하고 싶을 때 쓰며, 나중에 그 서비스를 클러스터 안으로 옮기게 되면 이 Service 정의만 일반 Service로 바꾸면 되고 애플리케이션 코드는 그대로 둘 수 있다.

### 헤드리스(Headless) — 가상 IP를 만들지 않는다

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

`clusterIP: None`을 지정하면 EndpointSlice는 여전히 만들어지지만(백엔드 Pod 목록은 추적된다), **ClusterIP 자체가 존재하지 않으므로 iptables/IPVS 규칙도 생성되지 않는다.** 대신 DNS 조회 결과가 통째로 달라진다.

| | 일반 ClusterIP | 헤드리스 |
|---|---|---|
| ClusterIP 할당 | 있음 | 없음 (`None`) |
| kube-proxy 데이터플레인 규칙 | 생성됨 | **생성 안 됨** |
| DNS 조회 결과 | ClusterIP 하나 | **모든 Pod IP 목록** (StatefulSet이면 개별 Pod 이름도) |
| 로드밸런싱 주체 | kube-proxy | **클라이언트가 직접 선택** |

**왜 필요한가 — StatefulSet의 개별 Pod 식별.** 헤드리스 서비스는 StatefulSet의 각 Pod에 고유 DNS 이름(`db-0.db-headless.default.svc.cluster.local`)을 부여하는 메커니즘 그 자체다. "db-0이 프라이머리"라는 규칙을 구현하려면 특정 Pod를 지목해서 연결할 수 있어야 하는데, 가상 IP 뒤에서 로드밸런싱되는 일반 Service로는 이것이 불가능하다.

**클라이언트 사이드 로드밸런싱과 피어 디스커버리.** gRPC처럼 HTTP/2 위에서 커넥션을 오래 유지하는 프로토콜은, 일반 Service를 쓰면 최초 연결이 맺어진 그 Pod로 이후 모든 요청이 고정돼 로드밸런싱이 사실상 무력화된다. 헤드리스로 전체 Pod IP 목록을 받아 클라이언트 라이브러리가 직접 분산하면 이 문제가 풀린다. Kafka·Cassandra 같은 분산 시스템이 멤버 목록을 얻는 데도 같은 메커니즘을 쓴다. 이 DNS 조회 결과의 정확한 형태와 캐싱은 16장에서 이어서 다룬다.

## 14.2 EndpointSlice 구조와 마이그레이션 이유

### 레거시 Endpoints의 근본적 한계

Service의 셀렉터에 맞는 Pod 목록을 추적하는 것은 원래 단일 `Endpoints` 오브젝트의 역할이었다.

```yaml
kind: Endpoints
metadata:
  name: payments
subsets:
  - addresses:
      - {ip: 10.244.1.3}
      - {ip: 10.244.1.4}
      # ... 백엔드 Pod가 10,000개면 이 배열에 10,000개가 들어간다
```

문제는 이 오브젝트가 **Service 하나당 하나**라는 점이다. 백엔드 Pod 10,000개짜리 Service가 있다면, **그중 Pod 하나의 IP만 바뀌어도 10,000개 항목을 담은 오브젝트 전체가 다시 쓰이고, 그 전체가 해당 Service를 watch하는 모든 노드의 kube-proxy로 재전송**된다. 5장에서 본 watch 기반 컨트롤러 패턴을 떠올려 보면, 이것은 워크큐에 "Endpoints/payments"라는 키 하나가 들어가는 정도로 끝나지 않는다 — **API 서버가 직렬화해야 하는 페이로드 크기, etcd에 다시 써야 하는 오브젝트 크기, 그리고 그것을 fan-out해야 하는 watch cache의 부하**가 전부 Pod 개수에 비례해 폭증한다. 대규모 클러스터의 컨트롤 플레인을 무너뜨리는 전형적인 원인 중 하나였다.

### EndpointSlice의 해법 — 샤딩

**EndpointSlice**(v1.21+ 기본)는 하나의 거대한 목록 대신, **약 100개 단위로 쪼갠 여러 개의 작은 오브젝트**로 나눈다(기본 상한이며 `kube-controller-manager`의 `--max-endpoints-per-slice`로 조정 가능하다, 상한 1000).

```
payments-abc12  → 100개 엔드포인트
payments-def34  → 100개 엔드포인트
payments-ghi56  →  87개 엔드포인트
```

```bash
kubectl get endpointslices -l kubernetes.io/service-name=payments
```

Pod 하나가 바뀌면 그 Pod가 속한 **슬라이스 하나만** 다시 쓰이고 전송된다. 전송량과 API 서버 부하가 Pod 총수가 아니라 **슬라이스 크기(최대 100)** 에 비례하게 된다. 이 컨트롤러(`endpointslice` 컨트롤러, kube-controller-manager 내장)도 5장의 Informer/워크큐 패턴을 그대로 따른다 — Service와 Pod를 watch하다가 변경이 감지되면 관련 슬라이스만 워크큐에 넣어 조정한다.

### 필드 구조

```bash
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
        - name: ap-northeast-2a   # 이 존의 클라이언트가 우선 이 엔드포인트를 쓰도록 힌트
  - addresses: ["10.244.2.4"]
    conditions:
      ready: false
      serving: false
      terminating: false
```

| 필드 | 의미 |
|---|---|
| `endpoints[].addresses` | 백엔드 Pod IP (배열이지만 보통 1개) |
| `endpoints[].conditions.ready` | **트래픽을 받을지 결정하는 값.** readiness 프로브 결과와 직결 |
| `endpoints[].conditions.serving` | `ready`와 별개로 유지되는 "지금 이 순간 서비스 가능한가" 플래그. 종료 중에도 트래픽 드레이닝을 위해 `true`로 유지될 수 있다 |
| `endpoints[].conditions.terminating` | Pod가 종료 절차(`preStop`, 그레이스풀 셧다운) 중임을 나타냄. 14.4절에서 다룸 |
| `endpoints[].hints.forZones` | 토폴로지 인식 라우팅 힌트 — 같은 가용 영역의 클라이언트가 이 엔드포인트를 우선 선택하도록 kube-proxy에 알려주는 값 |
| `endpoints[].nodeName` | 이 엔드포인트가 위치한 노드 — 14.4절의 `Local` 트래픽 정책이 참조 |

`kubernetes.io/service-name` 라벨이 EndpointSlice와 Service를 잇는 유일한 연결고리다. 이 라벨을 셀렉터로 조회하면 특정 Service의 모든 슬라이스를 찾을 수 있다.

**추가 이점 — 토폴로지 인식 라우팅.** `zone`과 `hints.forZones`를 조합하면 kube-proxy(또는 eBPF 데이터플레인)가 **같은 가용 영역(AZ) 안의 엔드포인트를 우선 선택**하도록 만들 수 있다. AZ 간 트래픽에 비용이 부과되는 클라우드 환경에서 이 기능이 비용 절감에 직접 기여한다.

```yaml
metadata:
  annotations:
    service.kubernetes.io/topology-mode: Auto   # 힌트 활성화
```

## 14.3 서비스 디스커버리 메커니즘

Service가 만들어졌다는 것을 클라이언트 Pod가 아는 방법은 두 가지다.

### 환경변수 주입 — 구조적 함정

kubelet은 Pod를 시작할 때, **그 시점에 이미 존재하는** 모든 Service에 대해 다음 형태의 환경변수를 컨테이너에 주입한다.

```bash
PAYMENTS_SERVICE_HOST=10.96.142.88
PAYMENTS_SERVICE_PORT=80
PAYMENTS_PORT=tcp://10.96.142.88:80
PAYMENTS_PORT_80_TCP_ADDR=10.96.142.88
```

**치명적인 함정은 순서 의존성이다.** 이 환경변수는 **Pod가 시작되는 시점의 스냅샷**이다. `payments`라는 Service가 이 Pod보다 **나중에** 만들어지면, 이 Pod의 환경변수에는 `PAYMENTS_SERVICE_HOST`가 아예 없다. Pod를 재시작하지 않는 한 나중에 생긴 Service를 알 방법이 없고, Deployment 롤아웃 순서나 매니페스트 적용 순서에 따라 이 문제가 재현되기도 안 되기도 한다 — **디버깅하기 매우 까다로운 종류의 버그**다.

### DNS 기반 디스커버리 — 항상 선호되는 방식

```bash
curl http://payments.default.svc.cluster.local
curl http://payments      # 같은 네임스페이스면 짧은 이름으로도 가능
```

DNS 조회는 **요청 시점에 즉시 해석**되므로 순서 의존성이 없다. Service가 언제 만들어졌든, DNS 이름으로 접근하는 순간 CoreDNS가 현재 ClusterIP(또는 헤드리스라면 현재 Pod IP 목록)를 돌려준다. **실무에서 환경변수 방식을 쓸 이유는 사실상 없다** — 레거시 호환을 위해 여전히 주입될 뿐, 애플리케이션은 DNS 이름을 쓰도록 작성하는 것이 원칙이다. 이 DNS 이름이 어떻게 구성되고, CoreDNS가 그것을 어떻게 해석하는지는 16장에서 자세히 다룬다.

## 14.4 세션 어피니티와 트래픽 정책

### 세션 어피니티

기본 로드밸런싱은 요청(또는 연결)마다 무작위로 백엔드를 고른다. 같은 클라이언트를 계속 같은 Pod로 보내고 싶다면:

```yaml
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800   # 3시간, 기본값은 10800(3시간), 최대 86400
```

이 설정은 **클라이언트의 소스 IP를 키로 삼아 일정 시간 같은 백엔드로 고정**한다. 데이터플레인 레벨(15장에서 다룰 iptables/IPVS)에서 구현되며, 커널이 이 어피니티 상태를 추적한다. 한계는 명확하다 — NAT 뒤에 있는 다수의 사용자가 같은 소스 IP로 보이면 전부 같은 Pod로 몰린다. 애플리케이션 레벨 쿠키 기반 세션 고정이 필요하면 Ingress 컨트롤러나 서비스 메시(17장)의 몫이다.

### internalTrafficPolicy / externalTrafficPolicy

Service가 라우팅할 후보를 **클러스터 전체 엔드포인트로 볼 것인지, 요청이 도달한 그 노드의 로컬 엔드포인트로 한정할 것인지**를 결정하는 값이다.

```yaml
spec:
  internalTrafficPolicy: Cluster    # 또는 Local — 클러스터 내부 트래픽
  externalTrafficPolicy: Cluster    # 또는 Local — NodePort/LoadBalancer로 들어온 외부 트래픽
```

| 값 | 동작 | 장점 | 단점 |
|---|---|---|---|
| `Cluster` (기본) | 요청이 어느 노드로 들어오든 클러스터 전체 엔드포인트로 분산 | 균등한 부하 분산 | 다른 노드의 Pod로 갈 경우 홉이 하나 늘고, 외부 트래픽은 **SNAT로 원본 클라이언트 IP가 소실**된다 |
| `Local` | 요청이 도달한 **그 노드**의 로컬 엔드포인트로만 전달 | 홉이 없고 **클라이언트 IP가 보존**된다(SNAT 불필요) | 그 노드에 백엔드 Pod가 하나도 없으면 응답 자체가 없다. **Pod 분포가 노드마다 균등하지 않으면 부하가 불균등**해진다 |

```
Cluster (기본):
  외부 클라이언트 → 노드A(Pod 없음) → [SNAT] → 노드B의 Pod
                                       └ 클라이언트 IP가 노드A의 IP로 치환됨

Local:
  외부 클라이언트 → 노드A(Pod 없음) → 응답 없음 ✗ (클라우드 LB가 헬스체크로 이 노드를 제외해야 함)
  외부 클라이언트 → 노드B(Pod 있음) → 노드B의 Pod (원본 클라이언트 IP 그대로 도달) ✓
```

**왜 홉이 늘어나는가.** `Cluster` 정책에서 노드A로 들어온 요청이 노드B의 Pod로 가려면, 노드A의 데이터플레인이 패킷을 노드B로 다시 전달해야 한다. 이 재전달 과정에서 **원본 클라이언트 IP를 보존한 채 노드B로 보내면 노드B가 응답을 노드A가 아닌 클라이언트로 직접 돌려보내려 시도해 비대칭 경로 문제가 생기므로**, 커널은 이 경우 소스 주소를 노드A의 IP로 치환(SNAT/마스커레이드)한다. 그 결과 노드B의 Pod 입장에서는 모든 요청이 "노드A에서 온 것"처럼 보이고, **원본 클라이언트 IP 정보가 사라진다.**

`Local`은 애초에 노드를 건너가는 재전달 자체를 하지 않으므로 이 SNAT가 필요 없다. **클라우드 LoadBalancer가 헬스체크로 Pod 없는 노드를 로드밸런싱 대상에서 제외**해 준다면 `Local`이 우수한 선택이다 — 실제로 클라우드의 `type: LoadBalancer` 구현체는 이 조합(외부 LB 헬스체크 + `externalTrafficPolicy: Local`)을 기본 권장 패턴으로 삼는다.

`internalTrafficPolicy: Local`은 같은 개념을 **클러스터 내부** 트래픽에 적용한다 — 예를 들어 노드마다 로컬 캐시 역할을 하는 DaemonSet이 있고, 그 노드에서 나가는 요청은 반드시 같은 노드의 인스턴스로만 가야 하는 경우(16장에서 다룰 NodeLocal DNSCache가 정확히 이 패턴이다) 쓰인다.

### 종료 중인 엔드포인트 처리 — 커넥션 드레이닝

Pod가 삭제되기 시작하면 곧바로 EndpointSlice에서 사라지는 것이 아니다. 대신 다음과 같은 전이를 거친다.

```
① 삭제 요청 접수 → Pod에 deletionTimestamp 기록, preStop 훅 실행 시작
                    동시에 EndpointSlice에서 이 엔드포인트의
                    conditions.ready = false, conditions.terminating = true 로 갱신
                    (ready는 즉시 내려가지만 serving은 잠시 true로 유지될 수 있다)
        ↓
② kube-proxy/데이터플레인이 이 변경을 즉시 반영
     · ready=false → "새로운" 연결의 로드밸런싱 후보에서 제외
     · 하지만 terminating 상태를 인식하는 구현은
       "이미 맺힌 연결"은 강제로 끊지 않고 자연스러운 종료를 기다린다
        ↓
③ preStop 완료 또는 terminationGracePeriodSeconds 만료
        ↓
④ 컨테이너 SIGTERM/SIGKILL → Pod 실제 삭제 → EndpointSlice에서 엔드포인트 완전 제거
```

**이것이 롤링 업데이트 중 요청 실패가 줄어드는 이유다.** `ready: false`가 새 연결의 유입을 즉시 막으면서도, `terminating: true`라는 별도 신호 덕분에 데이터플레인이 "이 Pod가 곧 사라진다"는 것을 미리 알고 **이미 진행 중인 요청을 강제로 끊지 않는 우아한 종료(graceful shutdown)** 를 지원할 수 있다. 이 전이가 `preStop` 훅, `terminationGracePeriodSeconds`와 어떻게 맞물리는지는 6장에서 다룬 Pod 종료 흐름과 정확히 대응한다.

## 실습: EndpointSlice 실시간 추적

**① 서비스와 EndpointSlice 확인**

```yaml
# svc-demo.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: svc-demo
spec:
  replicas: 3
  selector:
    matchLabels: { app: svc-demo }
  template:
    metadata:
      labels: { app: svc-demo }
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=hello", "-listen=:5678"]
          ports: [{ containerPort: 5678, name: http }]
          readinessProbe:
            tcpSocket: { port: http }
---
apiVersion: v1
kind: Service
metadata:
  name: svc-demo
spec:
  selector: { app: svc-demo }
  ports:
    - name: http
      port: 80
      targetPort: http
```

```bash
kubectl apply -f svc-demo.yaml
kubectl rollout status deployment/svc-demo
kubectl get endpointslices -l kubernetes.io/service-name=svc-demo -o yaml
```

**② 스케일 아웃하며 EndpointSlice 갱신 관찰**

```bash
kubectl get endpointslices -l kubernetes.io/service-name=svc-demo -w &
kubectl scale deployment svc-demo --replicas=8
```

슬라이스가 100개 단위로 나뉘는 것을 직접 보려면 replicas를 훨씬 크게 잡아야 하지만(예: 250), 실습 환경에서는 슬라이스 하나 안에서 `endpoints` 배열이 늘어나는 것과, 임계치를 넘겼을 때 두 번째 슬라이스가 새로 생성되는 것을 관찰하는 것으로 충분하다.

```bash
kubectl scale deployment svc-demo --replicas=1
```

축소 시에도 EndpointSlice가 즉시 갱신되는지 `-w`로 계속 관찰한다.

**③ 헤드리스 서비스로 개별 Pod DNS 확인**

```bash
kubectl expose deployment svc-demo --name=svc-demo-headless --cluster-ip=None --port=80 --target-port=http

kubectl run dns-test --rm -it --image=nicolaka/netshoot --restart=Never -- sh -c '
echo "=== 일반 서비스 ===";
dig +short svc-demo;
echo "=== 헤드리스 서비스 ===";
dig +short svc-demo-headless'
```

```
=== 일반 서비스 ===
10.96.142.88
=== 헤드리스 서비스 ===
10.244.1.3
10.244.2.4
10.244.1.5
```

StatefulSet으로 배포했다면(`db-0.db-headless...` 형태), 각 Pod 이름으로 개별 조회도 시도해 본다.

**④ externalTrafficPolicy: Local과 클라이언트 IP 보존**

```bash
kubectl expose deployment svc-demo --name=svc-demo-nodeport --type=NodePort --port=80 --target-port=http
kubectl patch svc svc-demo-nodeport -p '{"spec":{"externalTrafficPolicy":"Cluster"}}'
```

애플리케이션이 소스 IP를 출력하도록(`http-echo`는 요청 헤더를 그대로 보여주지 않으므로, 실습에서는 노드에서 직접 `tcpdump`로 소스 IP를 확인하는 방식이 더 정확하다):

```bash
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
NODE_PORT=$(kubectl get svc svc-demo-nodeport -o jsonpath='{.spec.ports[0].nodePort}')

# Cluster 정책: 노드에서 캡처하면 실제 백엔드로 가는 패킷의 소스가 노드 자신의 IP로 바뀐 것이 보인다
docker exec k8s-guide-worker tcpdump -i any -nn "tcp port 5678" -c 5 &
curl -s $NODE_IP:$NODE_PORT

kubectl patch svc svc-demo-nodeport -p '{"spec":{"externalTrafficPolicy":"Local"}}'
docker exec k8s-guide-worker tcpdump -i any -nn "tcp port 5678" -c 5 &
curl -s $NODE_IP:$NODE_PORT
```

`Cluster`일 때는 대상 Pod가 다른 노드에 있으면 그 Pod가 보는 소스 IP가 노드 자신의 IP로 치환된 것을 확인하고, `Local`일 때는(그리고 해당 노드에 실제로 Pod가 있을 때는) 원본 클라이언트 IP가 그대로 도달하는 것을 비교한다.

**⑤ 정리**

```bash
kubectl delete -f svc-demo.yaml
kubectl delete svc svc-demo-headless svc-demo-nodeport --ignore-not-found
```

---

## 실습 과제

**과제 1 — EndpointSlice 필드 직접 관찰**
readiness 프로브가 실패하도록 애플리케이션을 조작한 뒤(예: 헬스체크 경로를 잘못 지정), 해당 Pod의 EndpointSlice 항목에서 `conditions.ready`가 `false`로 바뀌는 것을 확인한다. 이때 Service로의 요청이 그 Pod를 완전히 피해 가는지 검증한다.

**과제 2 — terminating 조건 관찰**
`terminationGracePeriodSeconds`를 30초 이상으로 늘리고 `preStop`에 `sleep 20`을 넣은 Pod를 삭제하면서, `kubectl get endpointslice -o yaml -w`로 `conditions.terminating`이 `true`로 바뀌는 순간과 엔드포인트가 완전히 사라지는 순간 사이의 시차를 측정한다.

**과제 3 — 환경변수 순서 의존성 재현**
Pod를 먼저 띄우고, 그 뒤에 Service를 생성한다. 이 Pod 안에서 `env | grep SERVICE_HOST`로 환경변수가 존재하지 않음을 확인한 뒤, 같은 Pod를 재시작하면 환경변수가 나타나는 것과 비교한다.

**과제 4 — internalTrafficPolicy: Local과 불균등 분산**
3개 노드 중 1개 노드에만 백엔드 Pod가 몰리도록 `nodeSelector`로 배치를 왜곡한 뒤, `internalTrafficPolicy: Local`인 Service를 그 Pod가 없는 노드에서 호출해 응답이 없음을 확인한다. `Cluster`로 되돌리면 정상 응답하는 것과 비교한다.

**과제 5 — EndpointSlice 샤딩 관찰**
Deployment를 250개 이상의 레플리카로 스케일하고(리소스가 허용하는 선에서 `pause` 이미지 등 경량 컨테이너 사용), `kubectl get endpointslices -l kubernetes.io/service-name=<name>`으로 슬라이스가 여러 개로 나뉘는 것과 각 슬라이스의 `endpoints` 개수가 대략 100 이하로 유지되는 것을 확인한다.

---

## 요약

- **ClusterIP는 어떤 인터페이스에도 존재하지 않는 가상 좌표**다. 실제 동작은 각 노드의 데이터플레인(15장)이 담당하고, Service 오브젝트 자체는 "무엇으로 바꿔치기할지"를 정의할 뿐이다.
- Service 타입은 위로 갈수록 포함 관계다 — **LoadBalancer ⊃ NodePort ⊃ ClusterIP.** ExternalName은 이 계층에서 완전히 벗어난 순수 DNS CNAME이고, Headless는 ClusterIP 자체를 없애 DNS가 Pod IP 목록을 직접 반환하게 만든다.
- **EndpointSlice는 대규모 클러스터에서 Endpoints 하나의 오브젝트가 통째로 재전송되는 문제**를 해결하기 위해 약 100개 단위로 샤딩한다. `conditions.ready`가 `true`인 엔드포인트에만 트래픽이 가고, `hints.forZones`는 토폴로지 인식 라우팅에 쓰인다.
- 서비스 디스커버리는 **DNS 방식이 항상 선호된다.** 환경변수 주입은 Pod 시작 시점의 스냅샷이라 **Service가 나중에 생기면 아예 나타나지 않는** 순서 의존성 함정이 있다.
- `sessionAffinity: ClientIP`는 데이터플레인이 소스 IP 기준으로 백엔드를 고정한다. `externalTrafficPolicy`/`internalTrafficPolicy: Local`은 **홉을 줄이고 클라이언트 IP를 보존**하지만 Pod 분포가 불균등하면 부하도 불균등해진다.
- 종료 중인 Pod는 EndpointSlice의 `conditions.ready=false` + `conditions.terminating=true` 전이를 통해, **새 연결은 막되 기존 연결은 강제로 끊지 않는 우아한 드레이닝**을 가능하게 한다.

**다음 장에서는** 지금까지 "약속"으로만 다룬 ClusterIP를 실제로 지키는 커널 레벨 메커니즘 — kube-proxy의 iptables·IPVS·nftables 데이터플레인을 끝까지 해부한다.
