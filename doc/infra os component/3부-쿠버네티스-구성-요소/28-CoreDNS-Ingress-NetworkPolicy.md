---
title: "28장. CoreDNS와 외부 노출"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 28
---

# 28장. CoreDNS와 외부 노출

> **🎮 게임 서버 개발자에게** — `getaddrinfo()`로 호스트 이름을 주소로 바꾸고, 그 주소로 `connect()`하는 코드는 이미 익숙하다. 쿠버네티스의 DNS는 그 `getaddrinfo()`가 읽는 `/etc/resolv.conf`를 kubelet이 Pod마다 채워 주는 구조일 뿐이고, 응답하는 쪽(CoreDNS)도 **평범한 Pod 몇 개**다. 새로운 것은 두 가지다. 첫째, 기본 설정(`ndots:5`) 때문에 외부 도메인 한 번을 조회하는데 실패할 질의가 먼저 여러 번 나간다. 둘째, 클러스터 밖에서 들어오는 HTTP 요청의 입구(Ingress)와 Pod 사이의 방화벽(NetworkPolicy)은 **선언(오브젝트)과 시행(프로그램)이 서로 다른 것**이어서, 오브젝트만 만들면 아무 일도 일어나지 않을 수 있다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 매칭 서버가 외부 결제 API를 부를 때마다 응답이 유난히 느리고, 클러스터의 CoreDNS CPU만 높다.
> - 로그인/로비 REST API를 도메인으로 열려고 Ingress를 만들었는데 `ADDRESS` 칸이 비어 있거나 502/503이 난다.
> - 네임스페이스에 기본 거부 NetworkPolicy를 걸었더니 Service 이름 조회까지 전부 실패한다.

## 코어 — 이것만은 100%

> **한 문장:** Pod의 이름 조회는 `resolv.conf`(nameserver=kube-dns ClusterIP, search 3개, `ndots:5`)를 따라 CoreDNS 플러그인 체인이 답하고, 외부에서 오는 HTTP는 Ingress/Gateway(선언)를 컨트롤러(프로그램)가 프록시 설정으로 바꿔 받으며, Pod 사이의 허용 범위는 NetworkPolicy(스펙)를 CNI가 시행한다.

1. **CoreDNS도 하나의 워크로드다** — Deployment(보통 2개 이상) + `kube-dns`라는 ClusterIP Service. 그래서 DNS 질의도 Service 데이터플레인([27장](27-Service와-kube-proxy.md))을 그대로 탄다. 응답은 `kubernetes` 플러그인이 API 서버를 watch해 만든 **메모리 캐시**에서 나간다.
2. **`resolv.conf`가 이름 해석을 결정한다** — `search` 목록과 `ndots:5` 때문에 점이 5개 미만인 이름은 search 접미사를 먼저 붙여 본다. 외부 도메인도 예외가 아니라서 실패 질의 3개가 낭비된다. 끝에 점을 붙이거나 `dnsConfig`로 줄인다.
3. **Ingress는 데이터, IngressController는 프로그램** — 컨트롤러가 없으면 Ingress는 etcd의 숫자 덩어리일 뿐이다(`ADDRESS` 비어 있음). 컨트롤러는 Pod IP로 직접 프록시한다. Gateway API는 이 역할을 GatewayClass/Gateway/Route 3계층으로 쪼갰다.
4. **NetworkPolicy는 스펙일 뿐, 시행은 CNI** — 정책이 없으면 전허용, 선택된 Pod는 그 방향이 기본 거부로 전환된다. `from` 리스트의 하이픈 위치가 OR/AND를 가르고, egress를 막으면 DNS(53)도 함께 막힌다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `getaddrinfo("redis")` + `/etc/resolv.conf`의 search 목록 | Pod의 `resolv.conf` (`search`, `ndots`) | 짧은 이름에 접미사를 붙여 가며 시도하는 리졸버 규칙이 그대로다 | 쿠버네티스 기본 `ndots:5`가 매우 크다. `www.example.com`(점 2개)도 외부에 곧바로 묻지 않고 search 접미사를 먼저 3번 시도한다 |
| 내부 DNS 서버 한 대를 운영 | CoreDNS | 이름 → 주소를 응답하는 서버다 | CoreDNS는 `kube-dns` ClusterIP 뒤의 Pod들이고, 질의가 Service 로드밸런싱(iptables/IPVS)을 타며 UDP conntrack 경쟁 조건의 영향을 받을 수 있다 |
| nginx/HAProxy 앞단 리버스 프록시 + 설정 파일 | IngressController (예: ingress-nginx) | `nginx.conf`를 만들어 리로드하는 일과 같다 | 설정 파일을 사람이 쓰지 않는다. Ingress 오브젝트를 watch해서 컨트롤러가 렌더링하고, 컨트롤러가 없으면 Ingress는 아무것도 하지 않는다 |
| 게임 TCP/UDP 포트를 로드밸런서로 노출 | Service(NodePort/LoadBalancer)와 Ingress의 차이 | 외부에서 클러스터로 들어오는 입구라는 점은 같다 | Ingress는 사실상 HTTP/HTTPS 전용(L7)이다. 게임 소켓 같은 L4 트래픽은 Service로 노출하고, 로그인/로비 같은 HTTP API만 Ingress에 얹는 식으로 나눈다 |
| 서버 앞 방화벽 규칙(iptables) | NetworkPolicy | "누가 어느 포트로 들어올 수 있나"를 규칙으로 쓴다 | NetworkPolicy는 규칙을 *적는* 오브젝트일 뿐이고, 막는 일은 CNI가 한다. CNI가 지원하지 않으면 에러도 경고도 없이 조용히 무시된다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Pod 안에서 `payments`라는 짧은 이름만으로 Service에 접속되는 이유는 무엇일까?
> 2. 외부 도메인 `api.example.com` 하나를 조회하는데 실제로는 DNS 질의가 몇 번 나갈까?
> 3. Ingress 오브젝트를 만들었는데 `ADDRESS`가 비어 있다면 무엇이 빠진 걸까?
> 4. NetworkPolicy를 적용했는데 트래픽이 전혀 막히지 않는다면 무엇을 의심해야 할까?
>
> **처리법:** 🛠 실습 `kubectl exec <pod> -- cat /etc/resolv.conf`, `dig +search`, `kubectl get ingress`, `kubectl get pods -n kube-system` → 바로 실행 · 🗺 관계도 Pod → resolv.conf → kube-dns ClusterIP → CoreDNS Pod, Ingress → 컨트롤러 → Pod IP, GatewayClass → Gateway → HTTPRoute · 📦 카드로 `dnsPolicy` 4값, Ingress 오류 코드(404/502/503/504), 정책의 OR/AND 규칙

### 이 장에서 배우는 것

- CoreDNS의 플러그인 체인과 `kubernetes` 플러그인이 레코드를 만드는 방식
- FQDN 규칙, `search`/`ndots`가 만드는 숨은 비용과 완화 방법, `dnsPolicy`
- NodeLocal DNSCache와 DNS 장애를 계층별로 좁히는 순서
- Ingress와 IngressController의 관계, Gateway API가 해결한 문제
- NetworkPolicy의 모델(전허용 → 기본 거부), AND/OR 함정, CNI별 시행 차이, 기본 거부 + 최소 허용 패턴

---

## 코어 1. CoreDNS도 하나의 워크로드다

### 1.1 플러그인 체인과 `kubernetes` 플러그인

**한 줄 요약:** CoreDNS는 Corefile에 선언한 플러그인을 위에서 아래로 통과시키며 질의를 처리하고, 클러스터 이름은 API 서버를 watch해 만든 메모리 캐시에서 답한다.

CoreDNS는 범용 DNS 서버가 아니라 **플러그인을 체인으로 엮어 동작을 조립하는 프레임워크**다. 설정은 ConfigMap `coredns`의 Corefile에 있다(`kubectl get configmap coredns -n kube-system -o yaml`).

```
.:53 {
    errors
    health { lameduck 5s }
    ready
    kubernetes cluster.local in-addr.arpa ip6.arpa {
       pods insecure
       fallthrough in-addr.arpa ip6.arpa
       ttl 30
    }
    prometheus :9153
    forward . /etc/resolv.conf { max_concurrent 1000 }
    cache 30
    loop
    reload
    loadbalance
}
```

| 플러그인 | 역할 |
|---|---|
| `kubernetes` | **핵심.** API 서버를 watch해 Service/Pod 정보를 DNS 레코드로 응답 |
| `forward` | `kubernetes`가 답하지 못한(클러스터 외부) 쿼리를 업스트림(노드의 `/etc/resolv.conf`가 가리키는 DNS)으로 전달 |
| `cache` | TTL 동안 응답 캐싱 (`cache 30`이면 최대 30초) |
| `loop` / `reload` | 자기 자신에게 되돌아오는 루프 감지 후 재시작 / ConfigMap이 바뀌면 재시작 없이 다시 읽음 |
| `health`, `ready`, `errors`, `prometheus`, `loadbalance` | 헬스체크 엔드포인트, 오류 로깅, 메트릭, 다중 A/AAAA 응답 순서 섞기 |

쿼리는 이 순서대로 체인을 거친다. `*.cluster.local`처럼 `kubernetes`가 답할 수 있으면 거기서 응답이 나가고, 외부 도메인이면 `forward`가 넘긴다. `kubernetes` 플러그인은 Informer로 Service/EndpointSlice를 watch해 내부 메모리 캐시(zone 데이터)를 갱신하고 질의는 그 캐시에서 즉시 응답하므로, 질의가 폭주해도 API 서버로 그대로 전달되지 않는다. 컨트롤러의 "읽기는 로컬 캐시에서" 원칙([22장](22-컨트롤러-매니저.md))이 DNS 서버에도 적용된 것이다.

> **게임 서버 유추:** 설정 서버를 구독해 메모리 테이블을 갱신해 두고 요청은 그 테이블에서 바로 응답하는 구조와 같다. ⚠️ 이 테이블은 CoreDNS Pod마다 따로 있고, 갱신 주체는 각 Pod 안의 watch 연결이다.

### 1.2 배포 형태와 Pod의 resolv.conf

**한 줄 요약:** CoreDNS = Deployment + `kube-dns` ClusterIP Service이고, 그 IP가 모든 Pod의 `nameserver`에 적힌다.

```bash
kubectl exec -it <아무 Pod> -- cat /etc/resolv.conf
```

```
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

CoreDNS는 보통 **2개 이상의 레플리카를 가진 Deployment**이고 앞에 `kube-dns`라는 ClusterIP Service가 있다(옛 `kube-dns`를 대체했지만 하위 호환으로 이름을 유지). `nameserver` 값은 kubelet이 Pod를 만들 때 `--cluster-dns`(기본적으로 `kube-dns` Service의 ClusterIP)를 참조해 주입한다. 따라서 **Pod의 DNS 질의는 ClusterIP → kube-proxy 데이터플레인 → EndpointSlice의 CoreDNS Pod IP라는 27장의 경로를 그대로 탄다.** 클러스터가 커지면 `cluster-proportional-autoscaler`가 CPU가 아닌 **노드 수·코어 수에 비례하는 선형 공식**으로 레플리카를 미리 늘린다.

### 1.3 DNS 레코드 규칙

**한 줄 요약:** `<service>.<namespace>.svc.<cluster-domain>`, 헤드리스는 Ready Pod IP 전체, StatefulSet Pod는 Pod가 재생성돼도 유지되는 이름.

| 대상 | 레코드 타입 | 응답 |
|---|---|---|
| 일반 Service (`payments.default.svc.cluster.local`) | A / AAAA | ClusterIP 하나 |
| 헤드리스 Service | A / AAAA | **모든 Ready Pod IP** |
| ExternalName | CNAME | 외부 도메인 |

StatefulSet의 Pod는 헤드리스 서비스와 함께 `db-0.db-headless.default.svc.cluster.local` 같은 이름을 얻는다. 이름 있는 포트는 SRV 레코드(`_http._tcp.web.default.svc.cluster.local`)로 조회해 포트 번호를 하드코딩하지 않고 발견할 수 있다.

## 코어 2. resolv.conf가 이름 해석을 결정한다

### 2.1 search 도메인과 ndots:5의 숨은 비용

**한 줄 요약:** 점이 `ndots`보다 적은 이름은 search 접미사를 먼저 붙여 시도하고, 외부 도메인도 예외가 아니라서 실패 질의 3개가 낭비된다.

```
쿼리: payments   (점 0개)
① payments.default.svc.cluster.local   ← 보통 여기서 성공
② payments.svc.cluster.local           ③ payments.cluster.local           ④ payments (절대 이름)

쿼리: www.example.com   (점 2개, 여전히 ndots=5보다 작음)
① www.example.com.default.svc.cluster.local ✗   ② ...svc.cluster.local ✗   ③ ...cluster.local ✗
④ www.example.com   ← 여기서야 성공
```

외부 도메인 1회 조회마다 **실패가 확정된 질의 3개**를 CoreDNS에 먼저 보낸다. 원문(textbook)은 IPv4(A)/IPv6(AAAA) 질의가 함께 나가므로 최대 8개의 DNS 패킷이 될 수 있다고 설명한다. 증상은 외부 API 호출이 유난히 느림, CoreDNS CPU 높음, 트래픽이 늘면 DNS 타임아웃이다.

| 완화 방법 | 설명 |
|---|---|
| 끝에 점 추가 | `api.example.com.`처럼 절대 이름임을 명시하면 search를 건너뛴다. 가장 간단하다 |
| 클러스터 내부도 완전한 FQDN으로 | `postgres.database.svc.cluster.local.`처럼 끝에 점을 붙이면 한 번에 해결된다 |
| `dnsConfig`로 `ndots` 조정 | 내부 이름을 거의 안 쓰는 워크로드만 값을 낮춘다 |

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

`ndots`를 너무 낮추면 내부 짧은 이름이 깨질 수 있다. 원문은 `ndots:2`여도 점이 1개인 `google.com`은 여전히 search를 시도하니 확실하게 하려면 `ndots:1`이어야 하지만, 그러면 `postgres.database` 같은 두 단계 이름도 search를 안 거치므로 FQDN을 써야 한다고 말한다. **절충안:** 내부 통신이 많은 워크로드는 기본값을 유지하고, 외부 API 호출이 많은 워크로드만 `ndots: 1` + FQDN을 쓴다.

### 2.2 dnsPolicy

**한 줄 요약:** `ClusterFirst`가 기본이고, `Default`는 이름과 달리 기본값이 아니며 클러스터 이름을 못 푼다.

| 값 | 동작 |
|---|---|
| `ClusterFirst` (기본값) | CoreDNS와 클러스터 search 목록으로 구성 |
| `ClusterFirstWithHostNet` | `hostNetwork: true` Pod에서 `ClusterFirst` 효과를 강제 (아니면 노드의 resolv.conf를 물려받는다) |
| `Default` | **쿠버네티스 기본값이 아니다.** 노드의 `/etc/resolv.conf`를 상속해 클러스터 내부 이름을 해석하지 못한다 |
| `None` | resolv.conf를 비우고 `dnsConfig`에 적은 값만으로 구성 (사내 DNS를 강제하는 경우 등) |

호스트 네트워크를 쓰는 DaemonSet은 `ClusterFirstWithHostNet`을 명시하지 않으면 Service 이름을 해석하지 못한다.

### 2.3 NodeLocal DNSCache와 장애 진단

**한 줄 요약:** 노드마다 캐시를 두어 conntrack 경쟁을 피하고, 진단은 CoreDNS Pod → EndpointSlice → resolv.conf → ClusterIP 직접 질의 → 간헐성 순으로 좁힌다.

Service 경유 UDP 질의는 연결마다 **conntrack 항목**을 만들고, 질의가 급증하면 경쟁 조건으로 조회가 5초 타임아웃 뒤 `SERVFAIL`로 실패한다. NodeLocal DNSCache는 노드마다 DaemonSet으로 링크-로컬 주소(예: 169.254.20.10)에서 대기하는 캐시를 두어, 캐시 히트가 노드를 벗어나지 않게 해 중앙 CoreDNS 부하와 conntrack 경쟁을 함께 피한다.

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide                     # ① CoreDNS Ready?
kubectl get endpointslice -n kube-system -l kubernetes.io/service-name=kube-dns  # ② 비어 있나
kubectl exec <pod> -- cat /etc/resolv.conf                                       # ③ nameserver/search/ndots
kubectl exec <pod> -- dig @10.96.0.10 payments.default.svc.cluster.local         # ④ ClusterIP 직접
```

| 증상 | 유력 원인 |
|---|---|
| 모든 Pod에서 모든 조회 실패 | CoreDNS Pod 다운, `kube-dns` Service 문제 |
| 특정 노드의 Pod만 실패 | 그 노드의 kube-proxy·CNI, NodeLocal DNSCache 에이전트 다운 |
| 내부는 되는데 외부만 실패 | `forward` 설정, 업스트림 DNS 문제 |
| 외부 조회가 유독 느림 | `ndots` 기본값의 불필요한 search 시도 |
| 부하 때만 간헐적 `SERVFAIL`, 정확히 5초 지연 | UDP conntrack 경쟁 조건 → NodeLocal DNSCache |
| 특정 네임스페이스만 실패 | NetworkPolicy가 DNS를 차단 (코어 4) |

④에서 ClusterIP로는 안 되는데 CoreDNS Pod IP로 직접 질의하면 되는 경우는 kube-proxy 문제다([27장](27-Service와-kube-proxy.md)).

## 코어 3. Ingress는 데이터, 컨트롤러는 프로그램

### 3.1 Ingress와 IngressController

**한 줄 요약:** Ingress는 설정 데이터, IngressController는 그 데이터를 읽는 리버스 프록시 프로그램이다.

LoadBalancer Service는 서비스마다 클라우드 LB 하나이고 L4라서 "`/api`는 백엔드로, `/`는 프론트엔드로" 같은 HTTP 판단을 못 한다. Ingress는 하나의 진입점에서 HTTP/HTTPS를 받아 호스트와 경로로 여러 Service에 나눈다.

| | Ingress | IngressController |
|---|---|---|
| 정체 | **API 리소스**(설정 데이터) | **실행되는 프로그램**(리버스 프록시) |
| 하는 일 | "이렇게 라우팅해 달라"고 선언 | 그 선언을 읽어 실제로 라우팅 |
| 배포 형태 | YAML 매니페스트 | Deployment/DaemonSet + Service |

```bash
kubectl get ingress
# NAME   CLASS   HOSTS              ADDRESS   PORTS   AGE
# shop   nginx   shop.k8s-guide.dev             80      2m     ← ADDRESS 비어 있음 = 처리한 컨트롤러 없음
```

`ADDRESS`가 비어 있으면 아직 어떤 컨트롤러도 이 오브젝트를 처리하지 않은 것이다. 여러 컨트롤러가 공존할 때는 `IngressClass`와 `spec.ingressClassName`으로 지정한다(옛 `kubernetes.io/ingress.class` 애노테이션은 폐기).

> **게임 서버 유추:** Ingress는 `routes.yaml`, 컨트롤러는 그 파일을 읽어 요청을 분배하는 게이트웨이 프로세스다. ⚠️ 컨트롤러가 API 서버를 watch해서 설정을 스스로 다시 만든다.

### 3.2 컨트롤러 내부와 라우팅 규칙

**한 줄 요약:** watch → 설정 재계산 → 리로드(또는 동적 API)하고, ClusterIP를 건너뛰어 Pod IP로 프록시한다.

```
① Ingress, IngressClass, Service, EndpointSlice, Secret watch → ② nginx.conf 등 재생성 → ③ 리로드 → ④ 규칙에 따라 Pod로 프록시
```

ingress-nginx는 전체 `nginx.conf`를 렌더링해 워커를 리로드하고(규칙이 많을수록 느림), Envoy 기반(Contour, Emissary)은 gRPC/HTTP API로 라우팅 테이블만 갱신한다. Pod 스케일로 EndpointSlice만 바뀌면 대부분 **전체 리로드 없이** 백엔드 목록만 교체한다. 대부분의 컨트롤러는 ClusterIP 대신 **Pod IP로 직접** 프록시해 kube-proxy 홉을 건너뛰고 세션 고정·가중치 같은 L7 로드밸런싱을 직접 구현한다. TLS는 컨트롤러에서 종료되며(Secret은 Ingress와 **같은 네임스페이스**), 컨트롤러 → Pod 구간은 기본적으로 평문이다.

`pathType`은 `Exact`(정확히 일치), `Prefix`(**경로 세그먼트** 단위 접두사), `ImplementationSpecific`(컨트롤러 마음, nginx는 정규식)이다. `/api`(Prefix)는 `/api`, `/api/users`와 매칭되지만 `/apifoo`는 매칭되지 않으며, 더 긴 경로가 우선한다. 표준 필드는 호스트·경로·TLS·기본 백엔드뿐이고 재시도·카나리 등은 컨트롤러별 애노테이션(`nginx.ingress.kubernetes.io/canary-weight`)인데, 이식성이 없고, 문자열이라 오타를 조용히 무시하며, 인프라 팀의 TLS와 앱 팀의 라우팅이 한 오브젝트에 섞인다.

### 3.3 Gateway API

**한 줄 요약:** GatewayClass(인프라 제공자) → Gateway(운영 팀, 리스너) → HTTPRoute(앱 팀)로 소유자를 나눈다.

```
GatewayClass   인프라 제공자·클러스터 관리자: "쓸 수 있는 게이트웨이 구현체"
   │ 참조
Gateway        클러스터 운영 팀: 리스너(포트, 프로토콜, TLS), "어느 네임스페이스의 Route를 붙일 수 있는가"(allowedRoutes)
   │ parentRefs
HTTPRoute / GRPCRoute / TCPRoute / TLSRoute / UDPRoute   앱 팀: "이 호스트/경로는 내 Service로"
```

RBAC으로 권한을 나눌 수 있고(앱 팀에는 자기 네임스페이스의 `HTTPRoute` 쓰기만), 헤더 매칭·가중치 분할(`backendRefs[].weight`)·경로 재작성(`URLRewrite`)이 애노테이션이 아닌 **표준 스펙 필드**가 되었다. 원문은 `Gateway`/`GatewayClass`/`HTTPRoute`가 v1.0(2023년 10월)에 GA됐고 2026년 6월 v1.6에서 `TCPRoute`/`UDPRoute`까지 Standard 채널로 승격됐다고 설명하지만, **스펙의 GA와 컨트롤러의 구현 완성도는 별개**이므로 확인이 필요하다. `backendRefs`가 가리키는 것은 여전히 평범한 **Service**다.

> **[보충]** 서비스 메시(사이드카 mTLS 등 동서 트래픽 제어)는 이 책의 범위 밖이라 다루지 않는다.

### 3.4 Ingress 문제 진단

**한 줄 요약:** ADDRESS → IngressClass → 컨트롤러 로그 → 백엔드 엔드포인트 순으로, 상태 코드가 계층을 알려 준다.

```bash
kubectl get ingress; kubectl get ingressclass
kubectl describe ingress <name>
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller --tail=50
kubectl get svc,endpointslice
```

| 증상 | 원인 |
|---|---|
| `404 Not Found` | 호스트/경로 매칭 실패. `Host` 헤더 확인 |
| `503 Service Unavailable` | 백엔드 엔드포인트 없음 (selector 불일치, readiness 실패 → [27장](27-Service와-kube-proxy.md)) |
| `502 Bad Gateway` | 백엔드가 응답 안 함. 포트 불일치, 앱 크래시 |
| `504 Gateway Timeout` | 백엔드가 느림. `proxy-read-timeout` 조정 |
| TLS 인증서 오류 | Secret 이름·네임스페이스 확인 |
| 리다이렉트 루프 | 앞단 LB가 이미 TLS를 종료. `X-Forwarded-Proto`를 신뢰하도록 설정 |

## 코어 4. NetworkPolicy는 스펙이고, 시행은 CNI다

### 4.1 전허용에서 기본 거부로, 그리고 OR/AND

**한 줄 요약:** 정책이 없으면 전부 허용이고, Pod가 어떤 정책의 `podSelector`에 매칭되는 순간 그 방향은 명시 허용 외 전부 거부다.

NetworkPolicy가 없으면 모든 Pod가 모든 곳과 통신한다. Pod가 `podSelector`에 매칭되는 정책을 하나라도 가지면 그 Pod의 해당 방향(`policyTypes`)이 거부로 전환된다. 이 전환은 **Pod 단위**다. `policyTypes`에 `Ingress`만 있으면 Egress는 여전히 전허용이고, `egress: []`는 "아무것도 허용하지 않음"이다. 여러 정책은 허용 규칙이 **합집합(OR)** 으로 누적되며 표준 NetworkPolicy에는 deny 규칙이 없다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: api-policy, namespace: shop }
spec:
  podSelector: { matchLabels: { app: api } }   # ① 적용 대상
  policyTypes: [Ingress, Egress]               # ② 통제할 방향
  ingress:                                     # ③ 허용할 인바운드
    - from: [ { podSelector: { matchLabels: { app: frontend } } } ]
      ports: [ { protocol: TCP, port: 8080 } ]
  egress:                                      # ④ 허용할 아웃바운드
    - to: [ { podSelector: { matchLabels: { app: database } } } ]
      ports: [ { protocol: TCP, port: 5432 } ]
```

가장 흔한 함정은 `from` 리스트의 하이픈 위치다. **별도 항목은 OR, 한 항목 안의 여러 필드는 AND**다.

```yaml
# ① OR — 같은 NS의 app=frontend Pod 또는 team=platform NS의 *모든* Pod
- from:
    - podSelector: { matchLabels: { app: frontend } }
    - namespaceSelector: { matchLabels: { team: platform } }
# ② AND — team=platform NS 안의 app=frontend Pod만
- from:
    - namespaceSelector: { matchLabels: { team: platform } }
      podSelector: { matchLabels: { app: frontend } }
```

들여쓰기 한 칸 차이로 방화벽 범위가 완전히 달라지며, "너무 넓게 열렸다/너무 좁게 막혔다" 사고의 상당수가 여기서 나온다.

### 4.2 시행은 CNI의 몫이다

**한 줄 요약:** API 서버는 저장만 하고 kube-proxy도 관여하지 않으며, CNI가 지원하지 않으면 조용히 무시된다.

kube-proxy는 Service 가상 IP를 Pod IP로 바꾸는 일만 한다. 차단/허용은 CNI가 NetworkPolicy를 watch해 자신의 데이터플레인(iptables 체인, eBPF 프로그램)에 반영해야 일어난다([26장](26-쿠버네티스-네트워크-모델과-CNI.md)).

| CNI | NetworkPolicy 시행 | 비고 |
|---|---|---|
| Calico | 지원 | iptables 또는 eBPF 데이터플레인 선택 |
| Cilium | 지원 | eBPF 전용. `CiliumNetworkPolicy`로 L7·FQDN까지 확장 |
| Antrea, AWS VPC CNI | 지원 | (VPC CNI는 일정 버전 이상, 별도 에이전트 구성) |
| Flannel, kindnet (kind 기본) | **미지원** | 에러도 경고도 없이 조용히 무시 |

"정책을 적용했는데 여전히 통신된다"면 가장 먼저 `kubectl get pods -n kube-system`으로 어떤 CNI가 떠 있는지 확인한다. 표준 NetworkPolicy는 L3/L4(IP, 포트)만 다루고 클러스터 전역 정책·거부 규칙·도메인 기반 egress가 없다. 이를 보완하는 `AdminNetworkPolicy`는 원문 기준 아직 `v1alpha1`이다.

> **게임 서버 유추:** iptables 규칙 파일(오브젝트)과 실제로 패킷을 거르는 netfilter(CNI)의 관계다. ⚠️ 쿠버네티스에서는 규칙을 올려도 시행하는 구현이 정책을 지원하지 않으면 에러 없이 무효다.

### 4.3 제로 트러스트 패턴: 기본 거부 + 최소 허용 + DNS 예외

**한 줄 요약:** 네임스페이스 기본 거부를 먼저 깔고 필요한 통신만 허용하되, egress를 막으면 DNS도 막힌다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-egress, namespace: shop }
spec:
  podSelector: {}          # 네임스페이스의 모든 Pod, egress 규칙 없음 = 전부 거부 (Ingress도 같은 방식)
  policyTypes: [Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-dns-egress, namespace: shop }
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } }
          podSelector: { matchLabels: { k8s-app: kube-dns } }
      ports: [ { protocol: UDP, port: 53 }, { protocol: TCP, port: 53 } ]
```

Egress 기본 거부는 **CoreDNS로 가는 질의도 막아** 앱 입장에서는 네트워크 전체가 죽은 것처럼 보인다. 자주 쓰는 패턴은 3계층 앱(frontend는 인그레스에서만 받고 backend로만 나가며 + DNS, backend는 frontend에서만 받고 database로만 나감, database는 backend에서만 받고 나가는 곳 없음)과 클라우드 메타데이터 서비스 차단(egress에서 `169.254.169.254/32`를 `ipBlock.except`로 제외, [30장](30-설정-보안.md))이다.

## 실무 적용

### 체크리스트

- [ ] CoreDNS가 Deployment(2개 이상) + `kube-dns` ClusterIP Service이며, DNS 질의도 Service 경로를 탄다는 것을 알고 있다.
- [ ] Pod의 `resolv.conf`(nameserver, search 3개, `ndots:5`)를 `kubectl exec ... cat /etc/resolv.conf`로 확인했다.
- [ ] 외부 API를 자주 부르는 워크로드는 호스트 이름 끝에 점을 붙이거나 FQDN을 쓰거나 `ndots`를 낮췄는가? (내부 짧은 이름이 깨지지 않는지 함께 확인)
- [ ] `hostNetwork: true` Pod에는 `dnsPolicy: ClusterFirstWithHostNet`을 지정했다.
- [ ] DNS 장애 시 CoreDNS Pod → EndpointSlice → resolv.conf → ClusterIP 직접 질의 → 간헐성 순서로 좁힌다. 정확히 5초 지연은 conntrack 경쟁 조건을 의심한다.
- [ ] Ingress에는 컨트롤러가 반드시 필요하고, `ADDRESS`가 비면 `ingressClassName`과 컨트롤러 설치 여부를 먼저 본다.
- [ ] 404/502/503/504가 각각 매칭 실패/백엔드 무응답/엔드포인트 없음/백엔드 지연임을 구분한다.
- [ ] 게임 소켓(L4) 트래픽은 Service로, HTTP API만 Ingress/Gateway로 노출하는 경계를 정했다.
- [ ] NetworkPolicy를 쓰기 전에 사용 중인 CNI가 정책을 시행하는지 확인했다.
- [ ] `from` 리스트의 AND/OR(하이픈 위치)를 `kubectl describe networkpolicy`로 검증했다. egress 기본 거부 시 DNS(UDP/TCP 53) 예외를 추가했다.

### 시나리오로 확인하기

1. **상황:** 매칭 서버가 외부 결제 API(`pay.example.com`)를 호출할 때마다 지연이 크고, CoreDNS Pod의 CPU가 높다. 호출 빈도가 높다.
   **질문:** 원인과 대응은?

   <details markdown="1"><summary>답 확인</summary>

   기본 `ndots:5` 때문에 점이 2개인 `pay.example.com`도 search 접미사(`...default.svc.cluster.local`, `...svc.cluster.local`, `...cluster.local`)를 먼저 붙여 실패 질의 3개를 보낸 뒤에야 실제 이름을 조회한다(A/AAAA까지 합치면 패킷이 더 늘어난다). 호스트 이름 끝에 점을 붙여 절대 이름으로 쓰거나, 외부 호출이 많은 워크로드만 `dnsConfig`로 `ndots`를 1 정도로 낮추고 내부 이름은 FQDN으로 쓴다. → 코어 2.1

   </details>

2. **상황:** Ingress 뒤에서 로그인 API가 간헐적으로 503을 반환한다. 앱 Pod는 Running이다.
   **질문:** 어느 계층을 의심하고 무엇을 보나?

   <details markdown="1"><summary>답 확인</summary>

   503은 백엔드 엔드포인트가 없다는 뜻이다. Pod가 Running이어도 readiness가 실패하거나 Service selector가 맞지 않으면 EndpointSlice에서 빠진다. `kubectl get svc,endpointslice`로 대상이 있는지 보고 27장의 Service 진단을 따른다. 502라면 포트 불일치나 앱 크래시, 504라면 느린 백엔드(`proxy-read-timeout`)를 본다. → 코어 3.4

   </details>

3. **상황:** `shop` 네임스페이스에 기본 거부(Ingress/Egress) NetworkPolicy를 배포하자 모든 서비스가 "이름을 찾을 수 없음"으로 실패한다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   Egress 기본 거부가 CoreDNS(`kube-system`의 `k8s-app=kube-dns`)로 가는 UDP/TCP 53 질의까지 막았다. DNS 조회가 안 되니 Service 이름을 풀지 못한다. `namespaceSelector`와 `podSelector`를 **같은 항목에 함께**(AND) 넣어 kube-dns로 가는 53 포트를 허용하는 정책을 추가한다. 정책이 안 먹는 쪽이라면 CNI가 정책을 시행하는지부터 확인한다. → 코어 4.3

   </details>


---

📖 출처: Kubernetes_Internals_Network_Guide/03-네트워크/16-DNS와-서비스-디스커버리.md, 17-Ingress-Gateway-API-서비스메시.md, 18-NetworkPolicy와-네트워크-보안.md · kubernetes-textbook-main/03-애플리케이션-노출과-데이터/10-DNS와-서비스-디스커버리.md, 11-인그레스와-외부-트래픽-라우팅.md · kubernetes-textbook-main/04-클러스터-운영/18-워크로드-보안.md (18.4)

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] CoreDNS = ____ (Deployment) + ____ (ClusterIP Service)
         체인: errors / health·ready / ( ? ) / forward / ( ? ) / loop / reload
         ( ? ) 플러그인이 API 서버를 ____ 해서 메모리에 둔다

[코어 2] Pod resolv.conf: nameserver ____ , search ( ? ) ( ? ) ( ? ) , options ndots:____
         www.example.com → 실패 질의 ( ? )개 후 성공
         완화: 끝에 ____ / dnsConfig ndots / FQDN      dnsPolicy: ClusterFirst · ____ · Default · None

[코어 3] Ingress = ( 데이터 / 프로그램 ), IngressController = ( 데이터 / 프로그램 )
         컨트롤러는 ClusterIP 대신 ____ 로 직접 프록시.  ADDRESS 비면 ____ 확인
         Gateway API: GatewayClass → ____ → ____

[코어 4] 정책 없음 = ____ , 선택되는 순간 = ____ . from 별도 항목 = ( ? ), 한 항목 안 = ( ? )
         시행 주체 = ____ . egress 기본 거부 시 반드시 허용: ____ 포트
```

### 2. 인출 질문

1. Pod의 `/etc/resolv.conf`는 어디서 오고, 그 `nameserver` 질의는 어떤 경로로 CoreDNS에 도달하는가?

   <details markdown="1"><summary>답 확인</summary>

   kubelet이 Pod 생성 시 `--cluster-dns`(기본적으로 `kube-dns` Service의 ClusterIP)를 참조해 주입한다. 질의는 ClusterIP → kube-proxy 데이터플레인 → EndpointSlice의 CoreDNS Pod IP라는 일반 Service 경로를 그대로 탄다. → 코어 1.2

   </details>

2. `ndots:5`가 외부 도메인 조회를 느리게 만드는 과정과 세 가지 완화책은?

   <details markdown="1"><summary>답 확인</summary>

   점이 5개 미만인 이름은 search 접미사를 먼저 붙여 시도하므로 `www.example.com`은 실패 질의 3개(`.default.svc.cluster.local`, `.svc.cluster.local`, `.cluster.local`) 후에 성공한다. 완화책은 끝에 점 붙이기(절대 이름), 클러스터 내부도 완전한 FQDN 사용, `dnsConfig`로 `ndots` 낮추기다. → 코어 2.1

   </details>

3. 정확히 5초 지연이나 부하 시 간헐적 `SERVFAIL`이 나는 원인과 대응은?

   <details markdown="1"><summary>답 확인</summary>

   Service 경유 UDP 질의마다 conntrack 항목이 생기고, 질의가 급증하면 conntrack 경쟁 조건으로 조회가 5초 타임아웃 뒤 `SERVFAIL`이 될 수 있다. 노드마다 DaemonSet으로 캐시를 두는 NodeLocal DNSCache로 캐시 히트가 노드를 벗어나지 않게 하고 conntrack 경로를 피한다. → 코어 2.3

   </details>

4. Ingress와 IngressController는 각각 무엇이고, 컨트롤러가 없으면 어떻게 되는가?

   <details markdown="1"><summary>답 확인</summary>

   Ingress는 "이렇게 라우팅해 달라"는 API 리소스(데이터)이고, IngressController는 그것을 읽어 리버스 프록시 설정을 만들고 실제로 요청을 프록시하는 프로그램이다. 컨트롤러가 없으면 Ingress는 etcd에 저장된 데이터일 뿐이며 `ADDRESS`가 비어 있다. → 코어 3.1

   </details>

5. Gateway API가 Ingress의 애노테이션 난립을 어떻게 해결하는가?

   <details markdown="1"><summary>답 확인</summary>

   GatewayClass(인프라 제공자) / Gateway(운영 팀의 리스너) / HTTPRoute(앱 팀의 라우팅)로 소유자와 RBAC 대상을 나누고, 헤더 매칭·가중치·경로 재작성 같은 기능을 컨트롤러 애노테이션이 아닌 표준 스펙 필드로 올렸다. OpenAPI 스키마로 검증된다. → 코어 3.3

   </details>

6. NetworkPolicy의 `from`에서 `podSelector`와 `namespaceSelector`를 별도 항목으로 쓰는 것과 한 항목에 쓰는 것의 차이, 그리고 egress 기본 거부 시 놓치기 쉬운 것은?

   <details markdown="1"><summary>답 확인</summary>

   별도 항목은 OR(둘 중 하나만 맞아도 허용), 한 항목은 AND(둘 다 만족해야 허용)다. egress 기본 거부는 CoreDNS로 가는 UDP/TCP 53 질의도 막아 모든 이름 조회를 깨뜨리므로 DNS 허용 정책을 함께 둔다. → 코어 4.1, 4.3

   </details>

### 3. 기억 고리

- **C++ 유추:** `getaddrinfo()` + `resolv.conf` = Pod의 이름 해석 ⚠️ 기본 `ndots:5`가 커서 외부 도메인도 search 접미사를 먼저 3번 시도한다. 호스트 이름 끝의 점이 이를 끊는다.
- **C++ 유추:** nginx 설정 파일 + 리로드 = Ingress + IngressController ⚠️ 설정 파일을 사람이 쓰지 않고 컨트롤러가 API watch로 렌더링하며, 컨트롤러가 없으면 설정은 효력이 없다.
- **비유:** Ingress = 건물 안내 데스크의 방문 안내표(어느 층/호실로 보낼지). ⚠️ 비유가 깨지는 지점: 안내표만 붙여 놓고 안내 직원(컨트롤러)이 없으면 아무도 안내하지 않는다.
- **비유:** NetworkPolicy = 출입 규정 문서. ⚠️ 비유가 깨지는 지점: 문서를 집행하는 경비(CNI)가 규정을 읽을 줄 모르면 문서가 있어도 문은 열려 있고, 경고도 없다.
- **묶음(3의 법칙):** search 접미사 3개 / 외부 도메인 실패 질의 3개 / 외부 노출 3계층(GatewayClass·Gateway·Route) / 이 장 첫머리의 실무 상황 3개.
- **대칭·순서:** 선언(Ingress, NetworkPolicy, HTTPRoute) ↔ 시행(IngressController, CNI, Gateway 구현체). 모두 "오브젝트 ≠ 동작". DNS 진단 순서: Pod → Service/EndpointSlice → resolv.conf → ClusterIP 직접 → conntrack.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod에서 `payments`를 `connect`하기까지 DNS가 거치는 경로"를 resolv.conf, search, kube-dns, CoreDNS 순으로 설명해 보세요. 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "외부 API 호출이 많은 서버를 쿠버네티스로 옮기면 DNS 설정을 왜 손봐야 하는가"를 `ndots`와 실패 질의 3개로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "NetworkPolicy를 만들었으니 보안이 적용됐다" vs B "시행하는 CNI를 확인하기 전에는 아무 보장이 없다" — 양쪽을 번갈아 변호해 보세요. (kindnet, Flannel, 조용한 무시를 근거로)
- **AI 역할 반전:** "내가 Ingress와 IngressController, Gateway API의 차이를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."
