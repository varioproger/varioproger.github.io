---
title: "21장. 쿠버네티스 네트워크 모델과 Service"
parent: "4부. 서비스 노출, 데이터, 운영"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 21
---

# 21장. 쿠버네티스 네트워크 모델과 Service

> **🎮 게임 서버 개발자에게** — 게임 서버에서는 "로그인 서버가 채널 서버 목록(IP:포트)을 클라이언트에 내려주고, 서버가 죽으면 목록에서 뺀다"를 직접 구현했다. 쿠버네티스의 Service가 바로 그 역할을 플랫폼이 대신 해 주는 장치다. 결정적 차이는 Service의 주소(ClusterIP)가 **어떤 프로세스도 listen하지 않는 가상 IP**라는 점이다. 중간에 패킷을 중계하는 프록시 프로세스도 없고, 각 노드의 커널이 목적지 주소를 바꿔치기(DNAT)할 뿐이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 서버 Pod를 재배포했더니 IP가 바뀌어 다른 서버가 접속을 못 한다 → Pod IP 대신 Service 이름/ClusterIP로 붙어야 한다.
> - Pod는 `Running`인데 Service로 요청이 하나도 안 들어간다 → EndpointSlice의 `ready` 값과 selector 라벨을 본다.
> - 외부 노출용으로 LoadBalancer Service를 서비스마다 만들었더니 클라우드 비용이 불어난다 → Ingress로 진입점을 모은다.

## 코어 — 이것만은 100%

> **한 문장:** IP-per-Pod 모델에서 일회용인 Pod IP 대신 Service가 변하지 않는 가상 IP(ClusterIP)를 주고, EndpointSlice가 ready인 Pod 목록을 관리하며, kube-proxy가 만든 iptables/IPVS 규칙대로 커널이 그 가상 IP를 실제 Pod IP로 바꿔 준다.

1. **IP-per-Pod와 가상 IP** — 모든 Pod는 고유 IP를 갖고 NAT 없이 서로 통신한다. Pod IP는 일회용이고, ClusterIP는 어떤 인터페이스에도 없는 가상 IP다.
2. **Service 타입은 바깥으로 한 겹씩 감싼다** — `LoadBalancer ⊃ NodePort ⊃ ClusterIP`. ExternalName은 프록시 없이 DNS CNAME만 만든다.
3. **EndpointSlice: ready인 Pod에만 보낸다** — selector에 맞는 Pod 목록을 관리하고, `ready: true`인 엔드포인트에만 트래픽이 간다.
4. **kube-proxy는 규칙만, 변환은 커널이** — kube-proxy는 iptables/IPVS 규칙을 만들 뿐 데이터 경로에 없다.

**이 장에서 배우는 것 (원래 목차)**

- 쿠버네티스 네트워크 모델의 4가지 요구사항("IP-per-Pod") → 코어 1
- 노드·Pod·Service, 세 종류의 IP 대역을 구분하는 법 → 코어 1
- Service의 4가지 타입(ClusterIP, NodePort, LoadBalancer, ExternalName)과 선택 기준 → 코어 2
- Endpoints/EndpointSlice가 "어떤 Pod로 보낼지"를 어떻게 관리하는지 → 코어 3
- kube-proxy가 가상 IP를 실제 Pod IP로 바꾸는 원리(iptables/IPVS) → 코어 4

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 한 서버 머신에서 프로세스마다 다른 포트로 `bind`/`listen` (7777, 7778...) | IP-per-Pod | 프로세스(컨테이너)마다 독립된 수신 지점이 있다 | Pod마다 자기 네트워크 네임스페이스와 IP가 있어 모두 같은 포트(예: 80)를 써도 충돌하지 않는다. 포트가 전역 자원이 아니다 |
| 로그인 서버가 들고 있는 채널 서버 주소 목록 | Service(ClusterIP) | 뒤의 서버가 바뀌어도 클라이언트는 고정된 진입점만 안다 | ClusterIP에는 `accept()`하는 프로세스가 없다. ping에도 응답하지 않으며 노드 커널이 패킷 목적지를 Pod IP로 바꿀 뿐이다 |
| 하트비트가 끊긴 서버를 목록에서 빼는 서버 매니저 | EndpointSlice의 `ready` | 살아 있고 받을 준비가 된 서버에만 보낸다 | 판정은 readiness 프로브 결과로 이뤄지고, 목록은 모든 노드의 kube-proxy에 전파된다. 직접 구현하지 않는다 |
| 유저 공간 L4 프록시/중계 서버(recv → send) | kube-proxy | 가상 주소 → 실제 백엔드로 연결을 분배한다 | kube-proxy는 패킷을 받지 않는다. 규칙만 깔고 커널이 처리하므로 kube-proxy가 죽어도 기존 연결은 유지된다 |
| 공유기 포트포워딩(외부 포트 → 내부 서버) | NodePort | 외부 포트로 들어온 연결을 내부 대상에 전달한다 | 클러스터의 **모든 노드**에서 같은 포트가 열리고, 범위가 30000~32767로 제한된다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Pod IP로 직접 접속하면 되는데 왜 Service라는 것이 따로 필요할까?
> 2. Service의 IP로 ping을 보내면 무슨 일이 생길까?
> 3. NodePort와 LoadBalancer는 무엇이 다르고, 왜 프로덕션 HTTP 노출에는 둘 다 최선이 아닐까?
> 4. kube-proxy가 죽으면 이미 맺어진 연결은 끊길까?
>
> **처리법:** 🛠 실습 ClusterIP/NodePort/LoadBalancer Service YAML, `kubectl get svc`, `kubectl get endpointslices -l kubernetes.io/service-name=web` → 읽자마자 직접 실행 · 🗺 관계도 Service → selector → EndpointSlice(ready) → kube-proxy → iptables/IPVS → Pod IP, 그리고 `LoadBalancer ⊃ NodePort ⊃ ClusterIP` · 📦 카드로 NodePort 범위 30000~32767, 예시 CIDR(노드 `192.168.1.0/24`, Pod `10.244.0.0/16`, Service `10.96.0.0/12`), EndpointSlice 100개 단위, IPVS 알고리즘 `rr`/`lc`

---

## 코어 1. IP-per-Pod와 가상 IP

### 1.1 왜 Service가 필요한가

**한 줄 요약:** Pod IP는 일회용이고 개수·위치를 알 수 없으며 로드밸런싱 주체도 없다. Service가 변하지 않는 가상 IP 하나로 이 셋을 해결한다.

Deployment로 Pod를 3개 띄웠다고 하자. 클라이언트는 이 Pod들에 어떻게 접근할까?

- Pod IP는 **일회용**이다. Pod가 재시작되면 바뀐다.
- Pod가 **몇 개인지, 어디 있는지** 클라이언트가 알 수 없다.
- 로드밸런싱을 **누가** 해야 하는가?

Service는 이 셋을 한 번에 해결한다. **변하지 않는 가상 IP 하나**를 제공하고, 그 뒤의 Pod 집합을 자동으로 관리한다.

### 1.2 쿠버네티스 네트워크 모델 — 네 가지 규칙

**한 줄 요약:** 쿠버네티스는 구현이 아니라 규칙 넷(IP-per-Pod)을 정하고, 그 규칙을 만족하는 구현이 CNI 플러그인이다.

쿠버네티스는 네트워크 구현을 강제하지 않는다. 대신 **네 가지 규칙**을 정하고, 이를 만족하는 어떤 구현이든 허용한다(그 구현이 CNI 플러그인이다).

1. **모든 Pod는 고유한 IP를 갖는다.**
2. **모든 Pod는 NAT 없이 다른 모든 Pod와 통신할 수 있다.**
3. **모든 노드는 NAT 없이 모든 Pod와 통신할 수 있다.**
4. **Pod가 보는 자기 IP = 다른 Pod가 보는 그 Pod의 IP** (NAT로 인한 불일치가 없다)

이 모델을 **"IP-per-Pod"** 라고 부른다.

### 1.3 왜 이런 모델인가 — 포트 충돌 제거

**한 줄 요약:** 포트 매핑 방식에서는 포트가 노드의 전역 자원이지만, IP-per-Pod에서는 Pod마다 자기 IP가 있어 포트 충돌이 없다.

전통적인 컨테이너 환경(Docker의 포트 매핑)에서는 `호스트:8080 → 컨테이너:80` 식으로 포트를 연결했다. 이 방식은 **포트가 전역 자원이 된다**. 같은 노드에 nginx를 두 개 띄우면 하나는 8080, 하나는 8081을 써야 한다. IP-per-Pod 모델에서는 각 Pod가 자기만의 네트워크 네임스페이스와 IP를 가지므로 **포트 충돌이 없다.**

```
전통적 방식                        쿠버네티스
┌─────── 노드 ───────┐            ┌─────── 노드 ───────┐
│  nginx-1 :8080     │            │ Pod 10.244.1.2 :80 │
│  nginx-2 :8081     │            │ Pod 10.244.1.3 :80 │
│  nginx-3 :8082     │            │ Pod 10.244.1.4 :80 │
│  → 포트 관리 필요    │            │ → 충돌 없음         │
└────────────────────┘            └────────────────────┘
```

### 1.4 IP 대역 세 가지 — ClusterIP는 실재하지 않는다

**한 줄 요약:** 노드 CIDR(실재), Pod CIDR(CNI가 라우팅), Service CIDR(가상)을 구분하는 것이 네트워크 이해의 출발점이다.

클러스터에는 세 개의 서로 다른 IP 대역이 있다. 이 구분이 네트워크 이해의 출발점이다.

| 대역 | 예시 | 할당 대상 | 라우팅 가능? |
|---|---|---|---|
| **노드 CIDR** | `192.168.1.0/24` | 물리/가상 머신 | 실제 네트워크에 존재 |
| **Pod CIDR** | `10.244.0.0/16` | Pod | CNI가 라우팅 (오버레이 또는 실제 라우팅) |
| **Service CIDR** | `10.96.0.0/12` | Service의 ClusterIP | **실재하지 않는 가상 IP** |

> **ClusterIP는 어떤 인터페이스에도 붙어 있지 않다.** Service IP로 ping을 보내도 응답이 없다. 그런 IP를 가진 장비가 존재하지 않기 때문이다. 각 노드의 iptables(또는 IPVS) 규칙이 그 IP로 향하는 패킷을 실제 Pod IP로 바꿔치기한다.

## 코어 2. Service 타입은 바깥으로 한 겹씩 감싼다

### 2.1 ClusterIP — 클러스터 내부 전용 (기본)

**한 줄 요약:** 기본 타입. selector 라벨에 맞는 Pod로 가상 IP의 트래픽을 전달하며 클러스터 안에서만 접근된다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP           # 생략 가능 (기본값)
  selector:
    app: web                # 이 라벨을 가진 Pod로 전달
  ports:
    - name: http
      port: 80              # 서비스가 노출하는 포트
      targetPort: 8080      # 컨테이너의 포트 (이름도 가능)
      protocol: TCP
```

```
클라이언트 Pod → 10.96.142.88:80 → [iptables] → 10.244.1.3:8080
                (ClusterIP)                      (실제 Pod)
```

`selector`의 라벨이 Pod의 라벨과 맞아야 연결된다. 포트가 2개 이상이면 `name`이 필수다.

### 2.2 NodePort — 모든 노드의 포트를 연다

**한 줄 요약:** ClusterIP에 더해 모든 노드에서 30000~32767 범위 포트를 연다. externalTrafficPolicy가 균등 분산과 클라이언트 IP 보존 사이의 선택이다.

```yaml
spec:
  type: NodePort
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080       # 30000-32767 범위. 생략하면 자동 할당
```

```
외부 클라이언트 → 노드IP:30080 → [iptables] → Pod
                  (모든 노드에서 열린다)
```

NodePort는 ClusterIP를 포함한다. 클러스터 내부에서는 여전히 ClusterIP로 접근할 수 있다.

**externalTrafficPolicy**가 중요한 선택이다.

| 값 | 동작 | 장점 | 단점 |
|---|---|---|---|
| `Cluster` (기본) | 어느 노드로 들어와도 클러스터 전체 Pod로 분산 | 균등한 부하 분산 | SNAT로 클라이언트 IP가 소실된다. 홉이 하나 더 |
| `Local` | 해당 노드의 Pod로만 전달 | 클라이언트 IP 보존. 홉 없음 | Pod가 없는 노드는 응답 안 함 → 부하 불균등 |

> **NodePort는 프로덕션 외부 노출용이 아니다.** 포트 범위가 30000&#126;32767로 제한되고(80/443을 쓸 수 없다), 클라이언트가 노드 IP를 알아야 하며, 앞단에 별도 로드밸런서가 필요하다. 개발·테스트나 자체 로드밸런서 뒤에서 쓴다. 프로덕션 HTTP 노출은 Ingress([23장](23-Ingress와-외부-트래픽.md))가 맡는다.

### 2.3 LoadBalancer — 클라우드 로드밸런서 프로비저닝

**한 줄 요약:** cloud-controller-manager가 실제 클라우드 LB를 만들어 각 노드의 NodePort를 백엔드로 삼는다. Service마다 LB가 하나씩 생겨 비용이 든다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
    - port: 443
      targetPort: 8443
```

cloud-controller-manager가 이 Service를 보고 실제 클라우드 로드밸런서를 만든다. 계층은 포함 관계다.

```
LoadBalancer ⊃ NodePort ⊃ ClusterIP
```

클라우드 LB가 각 노드의 NodePort를 백엔드로 삼는 구조다.

```bash
kubectl get svc web
# NAME  TYPE           CLUSTER-IP     EXTERNAL-IP        PORT(S)
# web   LoadBalancer   10.96.142.88   a1b2c3.elb.aws...  443:31234/TCP
```

`EXTERNAL-IP`가 `<pending>`에 머문다면 cloud-controller-manager가 없거나 권한이 부족한 것이다. **베어메탈이나 kind에서는 기본적으로 pending이다.** 온프레미스에서는 MetalLB 같은 구현이 필요하다.

**비용 주의**: LoadBalancer Service 하나마다 클라우드 LB가 하나씩 생긴다. 서비스가 20개면 LB도 20개다. 그래서 여러 서비스를 하나의 진입점으로 모으는 Ingress가 필요하다.

### 2.4 ExternalName — 외부 주소의 별칭

**한 줄 요약:** 프록시도 셀렉터도 엔드포인트도 없이 DNS CNAME 레코드만 만든다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: legacy-db
spec:
  type: ExternalName
  externalName: db.legacy.example.com
```

이 Service는 **프록시하지 않는다.** 셀렉터도 엔드포인트도 없고, DNS CNAME 레코드만 만든다.

```
legacy-db.default.svc.cluster.local  →  CNAME  →  db.legacy.example.com
```

클러스터 밖의 서비스를 클러스터 내부 이름처럼 쓰고 싶을 때 쓴다. 나중에 그 서비스를 클러스터 안으로 옮기면 Service 정의만 바꾸면 되고 앱 코드는 그대로다.

### 2.5 4가지 타입 한눈에 비교

**한 줄 요약:** 접근 범위가 내부 → 노드 포트 → 클라우드 LB로 넓어지고, ExternalName만 이름 별칭이다.

| 타입 | 접근 범위 | 핵심 동작 |
|---|---|---|
| ClusterIP | 클러스터 내부 | 가상 IP → Pod로 전달 |
| NodePort | 노드 IP:포트로 외부 | ClusterIP + 모든 노드의 포트 개방 |
| LoadBalancer | 클라우드 LB로 외부 | NodePort + 클라우드 LB 자동 생성 |
| ExternalName | 클러스터 내부 | DNS CNAME만 제공 (프록시 없음) |

> **[보충]** 위 비교표는 앞 절의 내용을 한 표로 모은 입문자용 정리이며, 표 형태 자체는 원문에 없다.

## 코어 3. EndpointSlice: ready인 Pod에만 보낸다

### 3.1 EndpointSlice가 만드는 엔드포인트 목록

**한 줄 요약:** EndpointSlice 컨트롤러가 셀렉터에 맞는 Pod로 목록을 만들고, `ready: true`인 엔드포인트에만 트래픽이 간다.

Service를 만들면 **EndpointSlice 컨트롤러**가 셀렉터에 맞는 Pod를 찾아 엔드포인트 목록을 만든다.

```bash
kubectl get endpointslices -l kubernetes.io/service-name=web
```

```yaml
addressType: IPv4
endpoints:
  - addresses: ["10.244.1.3"]
    conditions:
      ready: true              # 트래픽을 받을 수 있음
  - addresses: ["10.244.2.4"]
    conditions:
      ready: false             # readiness 실패 중. 트래픽 안 감
ports:
  - name: http
    port: 8080
```

**`ready: true`인 엔드포인트에만 트래픽이 간다.** [16장](../3부-쿠버네티스-핵심/16-Pod-생명주기와-헬스체크.md)에서 배운 readiness 프로브가 여기서 효력을 발휘한다.

### 3.2 Endpoints vs EndpointSlice

**한 줄 요약:** 단일 Endpoints 오브젝트는 Pod 하나만 바뀌어도 전체가 전송됐다. EndpointSlice는 100개 단위로 쪼개 바뀐 슬라이스만 보낸다.

원래는 `Endpoints`라는 단일 오브젝트가 모든 IP를 담았다. Pod가 1000개면 오브젝트 하나에 IP 1000개가 들어 있고, Pod 하나가 바뀌어도 **오브젝트 전체**가 모든 노드의 kube-proxy로 전송되어 대규모 클러스터에서 부하가 컸다. **EndpointSlice**는 이것을 100개 단위로 쪼개 변경된 슬라이스만 전송한다.

### 3.3 헤드리스 서비스 (한 줄 소개)

**한 줄 요약:** `clusterIP: None`이면 가상 IP 없이 DNS가 모든 Pod IP를 돌려주고 클라이언트가 직접 고른다.

`clusterIP: None`을 지정하면 가상 IP를 만들지 않는다. DNS 조회 시 ClusterIP 하나 대신 **모든 Pod IP 목록**이 반환되고, 로드밸런싱은 클라이언트가 직접 한다. StatefulSet의 개별 Pod DNS 이름(`db-0.db-headless...`)을 만드는 것이 이 서비스다([18장](../3부-쿠버네티스-핵심/18-워크로드-컨트롤러.md), [22장](22-DNS와-서비스-디스커버리.md)).

## 코어 4. kube-proxy는 규칙만, 변환은 커널이

### 4.1 kube-proxy — 가상 IP의 정체

**한 줄 요약:** kube-proxy는 watch → 규칙 갱신까지만 하고, 패킷 처리는 커널이 한다. 그래서 kube-proxy가 죽어도 기존 연결은 산다.

kube-proxy는 각 노드에서 DaemonSet으로 돌며 **Service의 가상 IP를 실제 Pod IP로 바꾸는 규칙**을 관리한다.

```
① API 서버 watch → Service와 EndpointSlice 변경 감지
② 노드의 iptables (또는 IPVS) 규칙 갱신
③ 커널이 패킷을 처리 (kube-proxy는 데이터 경로에 없다!)
```

kube-proxy는 패킷을 직접 처리하지 않는다. 규칙만 만들고 실제 변환은 커널이 한다. 그래서 kube-proxy가 죽어도 기존 연결은 유지된다(새 Service 변경만 반영되지 않는다).

### 4.2 iptables 모드 vs IPVS 모드

**한 줄 요약:** iptables는 선형 O(n)·랜덤, IPVS는 해시 O(1)·알고리즘 선택. Service 1,000개 이상이면 IPVS를 고려한다.

**iptables 모드(기본)**: Service IP로 가는 패킷을 `KUBE-SVC-XXX` 체인으로 보내고, 이 체인이 확률 기반으로 `KUBE-SEP-XXX`(엔드포인트) 중 하나를 골라 DNAT로 Pod IP로 바꾼다. Pod가 3개면 1/3, 1/2, 나머지 순으로 확률이 걸린다. 규칙이 선형으로 평가되므로 Service가 수천 개가 되면 갱신이 느려진다.

**IPVS 모드**: 리눅스 커널의 로드밸런서를 쓰며 해시 테이블 기반이라 서비스 수가 늘어도 일정하다. 라운드 로빈(`rr`), 최소 연결(`lc`) 등 알고리즘을 고를 수 있다.

| | iptables | IPVS |
|---|---|---|
| 규칙 평가 | 선형 O(n) | 해시 O(1) |
| 대규모(1000+ svc) | 느려짐 | 안정적 |
| 로드밸런싱 방식 | 랜덤만 | 6가지 알고리즘 |

Service가 1,000개를 넘거나 최소 연결 수 같은 알고리즘이 필요할 때 IPVS를 고려하고, 그 이하에서는 iptables로 충분하다. (더 새로운 선택지로 nftables 모드와 eBPF 기반 Cilium이 있다.)

## 실무 적용

### 체크리스트

- [ ] 쿠버네티스 네트워크는 **IP-per-Pod** 모델이다. 모든 Pod는 고유 IP를 갖고 NAT 없이 서로 통신한다. 서버 간 접속에 Pod IP를 하드코딩하지 않는다.
- [ ] 노드 CIDR, Pod CIDR, Service CIDR은 다르다. **ClusterIP는 실재하지 않는 가상 IP**이며 노드의 iptables/IPVS 규칙이 Pod IP로 바꿔 준다. ping 무응답은 장애가 아니다.
- [ ] Service 타입은 `LoadBalancer ⊃ NodePort ⊃ ClusterIP`로 포함된다. ExternalName은 DNS CNAME일 뿐이다.
- [ ] NodePort는 개발·테스트용, LoadBalancer는 서비스마다 LB가 생겨 비용이 늘어난다. HTTP 외부 노출은 Ingress를 쓴다.
- [ ] 클라이언트 IP가 필요하면 externalTrafficPolicy(`Cluster`는 SNAT로 소실, `Local`은 보존하지만 부하 불균등)를 의식해서 고른다.
- [ ] EndpointSlice가 Service 뒤의 Pod 목록을 관리하며 **ready인 Pod에만** 트래픽이 간다. selector 라벨이 Pod 라벨과 맞는지, 포트가 2개 이상이면 `name`을 붙였는지 확인한다.
- [ ] kube-proxy는 규칙만 만들고 실제 패킷 변환은 커널이 한다. Service가 1,000개를 넘거나 최소 연결 알고리즘이 필요하면 IPVS를 고려한다.

### 시나리오로 확인하기

1. **상황:** 매치메이킹 서버가 게임룸 서버 Pod의 IP를 설정 파일에 적어 두고 접속한다. C++ 서버 시절처럼 "서버 IP는 고정"이라고 가정했는데, 롤링 업데이트 뒤 매치메이킹이 전부 실패한다.
   **질문:** 원인과 올바른 접속 방법은?

   <details markdown="1"><summary>답 확인</summary>

   Pod IP는 일회용이라 Pod가 재시작·교체되면 바뀐다. 게임룸 서버 앞에 Service를 두고, 변하지 않는 ClusterIP(또는 Service 이름)로 접속해야 한다. Service가 selector로 현재 Pod 집합을 추적하고 로드밸런싱까지 맡는다. → 코어 1, 코어 2

   </details>

2. **상황:** 새 버전 API Pod가 `Running`인데 Service로 들어오는 요청이 이 Pod에 하나도 가지 않는다.
   **질문:** 무엇을 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   `kubectl get endpointslices -l kubernetes.io/service-name=<이름>`으로 엔드포인트를 본다. 해당 Pod가 `conditions.ready: false`면 readiness 프로브가 실패 중이라 트래픽에서 빠진 것이다. 엔드포인트에 아예 없다면 Service의 `selector`가 Pod 라벨과 맞지 않는 것이다. → 코어 3

   </details>

3. **상황:** 운영자가 "Service IP로 ping이 안 가니 네트워크가 죽었다"며 노드를 재부팅하려 한다.
   **질문:** 맞는 판단인가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. ClusterIP는 어떤 인터페이스에도 붙지 않은 가상 IP라 원래 ping에 응답하지 않는다. 연결 확인은 실제 서비스 포트로 요청을 보내서 해야 한다. → 코어 1

   </details>

4. **상황:** 접속 로그에 클라이언트 IP가 전부 노드 IP로 찍혀 IP 기반 어뷰징 차단이 동작하지 않는다(NodePort/LoadBalancer 노출).
   **질문:** 원인과 선택지는?

   <details markdown="1"><summary>답 확인</summary>

   externalTrafficPolicy 기본값 `Cluster`는 다른 노드의 Pod로 넘기면서 SNAT를 해 클라이언트 IP가 소실된다. `Local`로 바꾸면 해당 노드의 Pod로만 전달해 IP가 보존되지만, Pod가 없는 노드는 응답하지 않아 부하가 불균등해진다. → 코어 2

   </details>

5. **상황:** kube-proxy Pod가 한 노드에서 크래시 루프에 빠졌다. 그 노드의 Pod들이 맺고 있던 기존 연결은 어떻게 되나?
   **질문:** 영향 범위는?

   <details markdown="1"><summary>답 확인</summary>

   기존 연결은 유지된다. kube-proxy는 데이터 경로에 없고 이미 깔린 iptables/IPVS 규칙대로 커널이 패킷을 처리하기 때문이다. 다만 그 노드에서는 새 Service나 엔드포인트 변경이 반영되지 않는다. → 코어 4

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] IP-per-Pod와 가상 IP
  Service가 필요한 이유: Pod IP는 ( ? ) / Pod 개수·위치 모름 / ( ? )는 누가?
  네트워크 모델 4규칙: 고유 IP / Pod↔Pod NAT ( ? ) / 노드↔Pod NAT 없음 / 자기 IP = ( ? )
  IP 대역 3개: 노드 CIDR(실재) / Pod CIDR(( ? )가 라우팅) / Service CIDR(( ? ))

[코어 2] Service 타입: ( ? ) ⊃ ( ? ) ⊃ ( ? )
  ClusterIP ─ 내부 전용, 기본
  NodePort ─ 범위 ____~____, externalTrafficPolicy: Cluster vs ( ? )
  LoadBalancer ─ ( ? )-controller-manager가 LB 생성, 베어메탈은 ( ? )
  ExternalName ─ DNS ( ? )만

[코어 3] EndpointSlice ─ ready: ( ? )에만 트래픽 / Endpoints 대비 ( ? )개 단위로 쪼갬
  헤드리스 ─ clusterIP: ( ? ) → 모든 Pod IP 반환

[코어 4] kube-proxy: ① watch → ② ( ? ) 규칙 갱신 → ③ ( ? )가 패킷 처리
  iptables: 선형 O(n), 랜덤   vs   IPVS: ( ? ), 알고리즘 선택
```

### 2. 인출 질문

1. Service의 ClusterIP로 ping을 보내도 응답이 없는 이유는 무엇인가? (원래 확인 질문 1)

   <details markdown="1"><summary>답 확인</summary>

   ClusterIP는 어떤 인터페이스에도 붙어 있지 않은, 실재하지 않는 가상 IP이기 때문이다. 그 IP를 가진 장비가 없고, 각 노드의 iptables/IPVS 규칙이 그 IP로 향하는 패킷을 실제 Pod IP로 바꿔치기할 뿐이다. → 코어 1 (1.4)

   </details>

2. LoadBalancer 타입 Service를 20개 만들면 어떤 문제가 생기는가? (원래 확인 질문 2)

   <details markdown="1"><summary>답 확인</summary>

   Service 하나마다 클라우드 LB가 하나씩 생겨 LB도 20개가 되므로 비용이 늘어난다. 그래서 여러 서비스를 하나의 진입점으로 모으는 Ingress가 필요하다. → 코어 2 (2.3)

   </details>

3. Pod는 Running인데 Service로 트래픽이 가지 않는다면, EndpointSlice의 어떤 값을 확인해 보겠는가? (원래 확인 질문 3)

   <details markdown="1"><summary>답 확인</summary>

   엔드포인트의 `conditions.ready` 값을 확인한다. `ready: true`인 엔드포인트에만 트래픽이 가며, readiness 프로브가 실패 중이면 `false`가 된다. 엔드포인트 자체가 없다면 selector 라벨이 Pod 라벨과 맞는지도 봐야 한다. → 코어 2 (2.1), 코어 3

   </details>

4. IP-per-Pod 모델은 Docker의 포트 매핑 방식에 비해 어떤 문제를 없애는가?

   <details markdown="1"><summary>답 확인</summary>

   포트 매핑에서는 포트가 노드의 전역 자원이 되어 같은 노드에 nginx를 여러 개 띄우면 8080, 8081처럼 포트를 나눠 관리해야 한다. IP-per-Pod에서는 Pod마다 자기 네트워크 네임스페이스와 IP가 있어 모두 80을 써도 포트 충돌이 없다. → 코어 1 (1.3)

   </details>

5. externalTrafficPolicy의 `Cluster`와 `Local`은 무엇이 다른가?

   <details markdown="1"><summary>답 확인</summary>

   `Cluster`(기본)는 어느 노드로 들어와도 전체 Pod로 균등 분산하지만 SNAT로 클라이언트 IP가 소실되고 홉이 하나 더 생긴다. `Local`은 그 노드의 Pod로만 보내 클라이언트 IP가 보존되지만, Pod가 없는 노드는 응답하지 않아 부하가 불균등해진다. → 코어 2 (2.2)

   </details>

6. LoadBalancer Service의 EXTERNAL-IP가 `<pending>`에 머무는 이유와 온프레미스 해결책은?

   <details markdown="1"><summary>답 확인</summary>

   cloud-controller-manager가 없거나 권한이 부족해서 실제 LB가 만들어지지 않은 것이다. 베어메탈이나 kind에서는 기본적으로 pending이며, 온프레미스에서는 MetalLB 같은 구현이 필요하다. → 코어 2 (2.3)

   </details>

7. Endpoints 대신 EndpointSlice가 등장한 이유는?

   <details markdown="1"><summary>답 확인</summary>

   Endpoints는 모든 IP를 단일 오브젝트에 담아, Pod 하나만 바뀌어도 오브젝트 전체가 모든 노드의 kube-proxy로 전송되어 대규모 클러스터에서 부하가 컸다. EndpointSlice는 100개 단위로 쪼개 변경된 슬라이스만 전송한다. → 코어 3 (3.2)

   </details>

8. kube-proxy가 죽으면 기존 연결은 어떻게 되며, 그 이유는? iptables와 IPVS 모드는 언제 갈리는가?

   <details markdown="1"><summary>답 확인</summary>

   기존 연결은 유지되고 새 Service 변경만 반영되지 않는다. kube-proxy는 규칙만 만들 뿐 데이터 경로에 없고 실제 변환은 커널이 하기 때문이다. iptables는 규칙을 선형 O(n)으로 평가해 Service가 수천 개면 느려지므로, 1,000개를 넘거나 최소 연결 같은 알고리즘이 필요하면 해시 O(1)인 IPVS를 고려한다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** ClusterIP = 로그인 서버가 내려주는 "대표 접속 주소", kube-proxy = 중계 서버. ⚠️ 깨지는 곳: ClusterIP에는 `accept()`하는 프로세스가 없고, kube-proxy는 `recv`/`send`로 중계하지 않는다. 노드 커널이 DNAT로 목적지만 바꾼다.
- **비유:** ClusterIP = 회사의 대표 전화번호. 담당자(Pod)가 바뀌어도 번호는 그대로이고 교환기(노드의 iptables/IPVS)가 담당자에게 돌려 준다. ⚠️ 비유가 깨지는 지점: 대표번호에는 실제 전화기가 있지만 ClusterIP에는 응답하는 장비가 없다(ping 무응답). 교환기도 한 곳이 아니라 모든 노드에 각각 있다.
- **묶음(3의 법칙):** Service가 푸는 문제 3개(일회용 IP / 개수·위치 모름 / 로드밸런싱 주체), IP 대역 3개(노드·Pod·Service), kube-proxy 3단계(watch → 규칙 갱신 → 커널 처리).
- **대칭·순서:** `ClusterIP → NodePort → LoadBalancer`는 바깥으로 한 겹씩 감싸는 순서. 대비 쌍: Cluster vs Local, Endpoints vs EndpointSlice, iptables vs IPVS.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Service의 가상 IP로 보낸 패킷이 어떻게 실제 Pod에 도착하는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리가 직접 짜던 서버 목록 관리 + 중계 서버를 쿠버네티스에서는 무엇이 대신하고, 왜 중계 프로세스가 죽어도 연결이 안 끊기는지"를 설명해 보세요.
- **랜덤 논리 게임:** A "externalTrafficPolicy는 `Cluster`가 낫다(균등 분산)" vs B "`Local`이 낫다(클라이언트 IP 보존, 홉 없음)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Service 4가지 타입과 kube-proxy 동작을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main/03-애플리케이션-노출과-데이터/09-서비스와-클러스터-네트워킹-기초.md (9.1 네트워크 모델, 9.2 Service 타입, 9.3 Endpoints와 EndpointSlice, 9.4 헤드리스 서비스, 9.5 kube-proxy); Kubernetes_Internals_Network_Guide/03-네트워크/14-Service와-EndpointSlice.md (요약 부분 대조), 13-네트워킹-모델과-CNI-스펙.md (요약 부분 대조)*
