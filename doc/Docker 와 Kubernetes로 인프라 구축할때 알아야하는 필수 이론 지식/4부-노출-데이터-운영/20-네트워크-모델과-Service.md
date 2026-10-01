---
title: "20장. 쿠버네티스 네트워크 모델과 Service"
parent: "4부. 서비스 노출, 데이터, 운영"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 20
---

# 20장. 쿠버네티스 네트워크 모델과 Service

## 이 장에서 배우는 것

- 쿠버네티스 네트워크 모델의 4가지 요구사항("IP-per-Pod")
- 노드·Pod·Service, 세 종류의 IP 대역을 구분하는 법
- Service의 4가지 타입(ClusterIP, NodePort, LoadBalancer, ExternalName)과 선택 기준
- Endpoints/EndpointSlice가 "어떤 Pod로 보낼지"를 어떻게 관리하는지
- kube-proxy가 가상 IP를 실제 Pod IP로 바꾸는 원리(iptables/IPVS)

## 1. 왜 Service가 필요한가

Deployment로 Pod를 3개 띄웠다고 하자. 클라이언트는 이 Pod들에 어떻게 접근할까?

- Pod IP는 **일회용**이다. Pod가 재시작되면 바뀐다.
- Pod가 **몇 개인지, 어디 있는지** 클라이언트가 알 수 없다.
- 로드밸런싱을 **누가** 해야 하는가?

Service는 이 셋을 한 번에 해결한다. **변하지 않는 가상 IP 하나**를 제공하고, 그 뒤의 Pod 집합을 자동으로 관리한다.

## 2. 쿠버네티스 네트워크 모델

쿠버네티스는 네트워크 구현을 강제하지 않는다. 대신 **네 가지 규칙**을 정하고, 이를 만족하는 어떤 구현이든 허용한다(그 구현이 CNI 플러그인이다).

1. **모든 Pod는 고유한 IP를 갖는다.**
2. **모든 Pod는 NAT 없이 다른 모든 Pod와 통신할 수 있다.**
3. **모든 노드는 NAT 없이 모든 Pod와 통신할 수 있다.**
4. **Pod가 보는 자기 IP = 다른 Pod가 보는 그 Pod의 IP** (NAT로 인한 불일치가 없다)

이 모델을 **"IP-per-Pod"** 라고 부른다.

### 왜 이런 모델인가

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

### IP 대역 세 가지

클러스터에는 세 개의 서로 다른 IP 대역이 있다. 이 구분이 네트워크 이해의 출발점이다.

| 대역 | 예시 | 할당 대상 | 라우팅 가능? |
|---|---|---|---|
| **노드 CIDR** | `192.168.1.0/24` | 물리/가상 머신 | 실제 네트워크에 존재 |
| **Pod CIDR** | `10.244.0.0/16` | Pod | CNI가 라우팅 (오버레이 또는 실제 라우팅) |
| **Service CIDR** | `10.96.0.0/12` | Service의 ClusterIP | **실재하지 않는 가상 IP** |

> **ClusterIP는 어떤 인터페이스에도 붙어 있지 않다.** Service IP로 ping을 보내도 응답이 없다. 그런 IP를 가진 장비가 존재하지 않기 때문이다. 각 노드의 iptables(또는 IPVS) 규칙이 그 IP로 향하는 패킷을 실제 Pod IP로 바꿔치기한다.

## 3. Service 타입

### ClusterIP — 클러스터 내부 전용 (기본)

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

### NodePort — 모든 노드의 포트를 연다

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

> **NodePort는 프로덕션 외부 노출용이 아니다.** 포트 범위가 30000&#126;32767로 제한되고(80/443을 쓸 수 없다), 클라이언트가 노드 IP를 알아야 하며, 앞단에 별도 로드밸런서가 필요하다. 개발·테스트나 자체 로드밸런서 뒤에서 쓴다. 프로덕션 HTTP 노출은 Ingress(22장)가 맡는다.

### LoadBalancer — 클라우드 로드밸런서 프로비저닝

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

### ExternalName — 외부 주소의 별칭

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

### 4가지 타입 한눈에 비교

| 타입 | 접근 범위 | 핵심 동작 |
|---|---|---|
| ClusterIP | 클러스터 내부 | 가상 IP → Pod로 전달 |
| NodePort | 노드 IP:포트로 외부 | ClusterIP + 모든 노드의 포트 개방 |
| LoadBalancer | 클라우드 LB로 외부 | NodePort + 클라우드 LB 자동 생성 |
| ExternalName | 클러스터 내부 | DNS CNAME만 제공 (프록시 없음) |

> **[보충]** 위 비교표는 앞 절의 내용을 한 표로 모은 입문자용 정리이며, 표 형태 자체는 원문에 없다.

## 4. Endpoints와 EndpointSlice

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

**`ready: true`인 엔드포인트에만 트래픽이 간다.** 15장에서 배운 readiness 프로브가 여기서 효력을 발휘한다.

### Endpoints vs EndpointSlice

원래는 `Endpoints`라는 단일 오브젝트가 모든 IP를 담았다. Pod가 1000개면 오브젝트 하나에 IP 1000개가 들어 있고, Pod 하나가 바뀌어도 **오브젝트 전체**가 모든 노드의 kube-proxy로 전송되어 대규모 클러스터에서 부하가 컸다. **EndpointSlice**는 이것을 100개 단위로 쪼개 변경된 슬라이스만 전송한다.

### 헤드리스 서비스 (한 줄 소개)

`clusterIP: None`을 지정하면 가상 IP를 만들지 않는다. DNS 조회 시 ClusterIP 하나 대신 **모든 Pod IP 목록**이 반환되고, 로드밸런싱은 클라이언트가 직접 한다. StatefulSet의 개별 Pod DNS 이름(`db-0.db-headless...`)을 만드는 것이 이 서비스다(17장, 21장).

## 5. kube-proxy — 가상 IP의 정체

kube-proxy는 각 노드에서 DaemonSet으로 돌며 **Service의 가상 IP를 실제 Pod IP로 바꾸는 규칙**을 관리한다.

```
① API 서버 watch → Service와 EndpointSlice 변경 감지
② 노드의 iptables (또는 IPVS) 규칙 갱신
③ 커널이 패킷을 처리 (kube-proxy는 데이터 경로에 없다!)
```

kube-proxy는 패킷을 직접 처리하지 않는다. 규칙만 만들고 실제 변환은 커널이 한다. 그래서 kube-proxy가 죽어도 기존 연결은 유지된다(새 Service 변경만 반영되지 않는다).

**iptables 모드(기본)**: Service IP로 가는 패킷을 `KUBE-SVC-XXX` 체인으로 보내고, 이 체인이 확률 기반으로 `KUBE-SEP-XXX`(엔드포인트) 중 하나를 골라 DNAT로 Pod IP로 바꾼다. Pod가 3개면 1/3, 1/2, 나머지 순으로 확률이 걸린다. 규칙이 선형으로 평가되므로 Service가 수천 개가 되면 갱신이 느려진다.

**IPVS 모드**: 리눅스 커널의 로드밸런서를 쓰며 해시 테이블 기반이라 서비스 수가 늘어도 일정하다. 라운드 로빈(`rr`), 최소 연결(`lc`) 등 알고리즘을 고를 수 있다.

| | iptables | IPVS |
|---|---|---|
| 규칙 평가 | 선형 O(n) | 해시 O(1) |
| 대규모(1000+ svc) | 느려짐 | 안정적 |
| 로드밸런싱 방식 | 랜덤만 | 6가지 알고리즘 |

Service가 1,000개를 넘거나 최소 연결 수 같은 알고리즘이 필요할 때 IPVS를 고려하고, 그 이하에서는 iptables로 충분하다. (더 새로운 선택지로 nftables 모드와 eBPF 기반 Cilium이 있다.)

## 핵심 요약

- 쿠버네티스 네트워크는 **IP-per-Pod** 모델이다. 모든 Pod는 고유 IP를 갖고 NAT 없이 서로 통신한다.
- 노드 CIDR, Pod CIDR, Service CIDR은 다르다. **ClusterIP는 실재하지 않는 가상 IP**이며 노드의 iptables/IPVS 규칙이 Pod IP로 바꿔 준다.
- Service 타입은 `LoadBalancer ⊃ NodePort ⊃ ClusterIP`로 포함된다. ExternalName은 DNS CNAME일 뿐이다.
- NodePort는 개발·테스트용, LoadBalancer는 서비스마다 LB가 생겨 비용이 늘어난다. HTTP 외부 노출은 Ingress를 쓴다.
- EndpointSlice가 Service 뒤의 Pod 목록을 관리하며 **ready인 Pod에만** 트래픽이 간다.
- kube-proxy는 규칙만 만들고 실제 패킷 변환은 커널이 한다.

## 확인 질문

1. Service의 ClusterIP로 ping을 보내도 응답이 없는 이유는 무엇인가?
2. LoadBalancer 타입 Service를 20개 만들면 어떤 문제가 생기는가?
3. Pod는 Running인데 Service로 트래픽이 가지 않는다면, EndpointSlice의 어떤 값을 확인해 보겠는가?

*원문 근거: kubernetes-textbook-main/03-애플리케이션-노출과-데이터/09-서비스와-클러스터-네트워킹-기초.md (9.1 네트워크 모델, 9.2 Service 타입, 9.3 Endpoints와 EndpointSlice, 9.4 헤드리스 서비스, 9.5 kube-proxy); Kubernetes_Internals_Network_Guide/03-네트워크/14-Service와-EndpointSlice.md (요약 부분 대조), 13-네트워킹-모델과-CNI-스펙.md (요약 부분 대조)*
