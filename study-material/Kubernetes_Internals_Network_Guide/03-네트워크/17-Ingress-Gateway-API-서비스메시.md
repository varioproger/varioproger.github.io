---
title: "17장. Ingress·Gateway API·서비스 메시"
---

# 17장. Ingress·Gateway API·서비스 메시

> **학습목표**
> - IngressController가 Ingress 오브젝트를 실제 프록시 설정으로 바꾸는 조정 루프를 설명할 수 있다.
> - Gateway API가 역할을 세 리소스로 분리한 이유와, 이것이 Ingress의 애노테이션 난립을 어떻게 해소하는지 설명할 수 있다.
> - 사이드카 기반 서비스 메시의 데이터플레인 구조(mTLS, L7 트래픽 제어, 관측성)를 이해한다.
> - 앰비언트 메시가 사이드카 모델과 무엇을 트레이드오프하는지 판단할 수 있다.
> - 같은 라우팅 규칙을 Ingress와 Gateway API 양쪽으로 작성해 모델 차이를 코드 수준에서 비교할 수 있다.

---

## 들어가며

13장에서 CNI가 Pod 간 L3 연결성을, 14~15장에서 Service와 kube-proxy가 클러스터 내부의 L4 로드밸런싱을 어떻게 구현하는지 다뤘다. 이 장에서 다루는 세 가지 — Ingress/Gateway API, 서비스 메시 — 는 모두 그 위, **L7** 에서 동작한다.

세 기술은 성격이 다른 문제를 푼다.

```
남북(north-south) 트래픽                동서(east-west) 트래픽
외부 → 클러스터                          서비스 ↔ 서비스

┌─────────────┐                    ┌─────────┐     ┌─────────┐
│  Ingress /   │                    │ 서비스A  │────▶│ 서비스B  │
│  Gateway API │──▶ 클러스터 내부 ──▶ │(사이드카)│     │(사이드카)│
└─────────────┘                    └─────────┘     └─────────┘
    이 장 17.1~17.2                      이 장 17.3~17.4
```

Ingress와 Gateway API는 **하나의 진입점에서 L7 라우팅 규칙을 어떻게 선언하고, 그 선언이 실제 프록시로 어떻게 반영되는가**를 다룬다. 서비스 메시는 **그 진입점을 통과한 뒤 서비스 사이의 통신을 어떻게 암호화하고, 제어하고, 관측하는가**를 다룬다. 두 영역 모두 "리버스 프록시를 어디에, 어떻게 배치할 것인가"라는 같은 질문에서 출발한다는 점을 기억해 두면 이 장 전체가 하나의 흐름으로 읽힌다.

## 17.1 IngressController 내부 동작

### Ingress는 조정 대상 오브젝트일 뿐이다

`Ingress`는 5장에서 다룬 조정 루프의 **desired state**에 지나지 않는다. 그 자체로는 아무 동작도 하지 않는다.

```bash
kubectl get ingress
```
```
NAME   CLASS   HOSTS              ADDRESS   PORTS   AGE
shop   nginx   shop.k8s-guide.dev             80      2m
```

`ADDRESS`가 비어 있다는 것은 **아직 어떤 컨트롤러도 이 오브젝트를 관찰하지 않았다**는 신호다. IngressController가 없으면 이 상태에서 영원히 멈춘다.

### 조정 루프로서의 IngressController

5장에서 본 Informer → 워크큐 → 조정 패턴이 여기서도 그대로 적용된다. 다만 조정의 결과물이 API 서버에 쓰는 status가 아니라, **컨트롤러 자신이 들고 있는 리버스 프록시 프로세스의 설정 파일**이라는 점이 다르다.

```
┌────────────────────────────────────────────────────────┐
│                 IngressController Pod                   │
│                                                          │
│   watch: Ingress, IngressClass, Service,                │
│          EndpointSlice, Secret                          │
│              │                                          │
│              ▼                                          │
│   ┌──────────────────┐                                  │
│   │  조정 루프         │  변경 감지 → 전체 라우팅 상태 재계산 │
│   └────────┬──────────┘                                  │
│            │                                            │
│            ▼                                            │
│   ┌──────────────────────┐                              │
│   │ 설정 생성              │  Ingress 규칙들을            │
│   │ (템플릿 렌더링)         │  nginx.conf 문법으로 변환     │
│   └────────┬──────────────┘                              │
│            ▼                                            │
│   ┌──────────────────┐        ┌───────────────────────┐ │
│   │ 리로드 방식 분기    │───────▶│ A. 파일 갱신 + SIGHUP │ │
│   │                  │        │    (nginx 기본)        │ │
│   │                  │───────▶│ B. 동적 API 호출        │ │
│   └──────────────────┘        │    (Envoy xDS 등)      │ │
│                                └───────────────────────┘ │
│            │                                            │
│            ▼                                            │
│   ┌──────────────────────────────────────┐              │
│   │ 리버스 프록시 데이터플레인               │              │
│   │  실제 요청을 받아 Pod IP로 직접 프록시    │              │
│   └──────────────────────────────────────┘              │
└────────────────────────────────────────────────────────┘
```

**핵심은 두 갈래 리로드 방식이다.**

| 방식 | 대표 구현 | 동작 | 대가 |
|---|---|---|---|
| **정적 재생성 + 리로드** | ingress-nginx | 매번 전체 `nginx.conf`를 렌더링하고 워커 프로세스를 리로드 | 규칙이 많을수록 리로드 시간 증가, 리로드 중 커넥션 드레이닝 필요 |
| **동적 제어 API** | Envoy 기반(Contour, Emissary), HAProxy Ingress(런타임 API) | 파일을 다시 쓰지 않고 gRPC/HTTP API로 라우팅 테이블만 갱신 | 구현이 복잡하지만 무중단·저지연 갱신 |

ingress-nginx는 대부분의 변경에서 실제로는 **Lua 기반 동적 백엔드 갱신**(엔드포인트 변경 시)을 쓰고, 구조적 변경(새 호스트·TLS 추가 등)에만 전체 리로드를 수행하도록 최적화되어 있다. 그래도 원리는 같다 — **컨트롤러 내부에 자신만의 데이터플레인 상태가 있고, Ingress 오브젝트 변경은 그 상태를 다시 계산하라는 트리거일 뿐이다.**

> **엔드포인트 변경과 Ingress 변경은 다르게 처리된다**
>
> Pod가 스케일 인/아웃 되어 EndpointSlice만 바뀌는 경우, 대부분의 컨트롤러는 **전체 리로드 없이** 백엔드 목록만 교체한다. 라우팅 규칙(호스트·경로) 자체가 바뀔 때만 무거운 재생성이 일어난다. 14장에서 본 EndpointSlice의 목적 — "빈번한 변경을 가볍게 전파" — 이 여기서도 그대로 재사용된다.

### 컨트롤러가 서비스를 우회하는 이유

11장(입문서 기준)에서 이미 짚었듯, 대부분의 IngressController는 ClusterIP를 거치지 않고 **Pod IP로 직접** 프록시한다.

```
일반적인 경로:  클라이언트 → Ingress 컨트롤러 → Pod IP (직접)
피하는 경로:    클라이언트 → Ingress 컨트롤러 → ClusterIP → (kube-proxy/eBPF) → Pod IP
```

15장에서 다룬 kube-proxy의 iptables/IPVS 홉을 하나 건너뛰는 것이므로 지연이 줄고, 컨트롤러가 세션 고정이나 가중치 라우팅 같은 L7 로드밸런싱을 **자신의 알고리즘으로 직접** 구현할 수 있게 된다. 대신 컨트롤러는 EndpointSlice를 스스로 watch해서 백엔드 목록을 항상 최신으로 유지해야 하는 책임을 진다.

### TLS 종료

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
spec:
  ingressClassName: nginx
  tls:
    - hosts: [shop.k8s-guide.dev]
      secretName: shop-tls          # kubernetes.io/tls 타입
  rules:
    - host: shop.k8s-guide.dev
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

컨트롤러는 조정 루프 안에서 `Secret`도 watch한다. 인증서가 회전되면(cert-manager가 갱신한 경우 등) **Ingress 오브젝트 자체는 변경되지 않았는데도** 컨트롤러는 Secret 변경을 감지해 TLS 컨텍스트만 다시 로드한다. TLS는 컨트롤러에서 종료되고, 컨트롤러 → Pod 구간은 기본적으로 평문이다. 이 구간을 암호화하려면 17.3절의 서비스 메시가 필요하다.

### 애노테이션 난립이라는 구조적 한계

`Ingress` 스펙에 표준 필드로 존재하는 것은 호스트·경로·TLS·기본 백엔드뿐이다. 재시도, 타임아웃, 레이트 리밋, 헤더 기반 라우팅, 트래픽 분할은 전부 컨트롤러별 애노테이션으로 구현된다.

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
    nginx.ingress.kubernetes.io/limit-rps: "10"
```

이것이 실무적으로 문제가 되는 지점은 세 가지다.

1. **이식성이 없다.** `nginx.ingress.kubernetes.io/canary-weight`는 Traefik으로 옮기면 아무 의미가 없다.
2. **타입 검증이 없다.** 애노테이션은 전부 문자열이므로 오타가 나도 API 서버는 거부하지 못하고 컨트롤러가 조용히 무시한다.
3. **하나의 오브젝트를 여러 팀이 편집해야 한다.** 인프라 팀이 관리해야 할 TLS 설정과 앱 팀이 관리해야 할 라우팅 규칙이 같은 `Ingress` 오브젝트, 같은 `metadata.annotations` 맵 안에 뒤섞인다.

이 세 번째 문제 — **역할 분리 불가** — 가 다음 절 Gateway API가 존재하는 근본 이유다.

## 17.2 Gateway API 모델과 Ingress 대비 장점

### 리소스를 역할별로 쪼갠다

Gateway API(`gateway.networking.k8s.io`)의 설계 결정은 단순하다. **하나의 오브젝트에 모든 관심사를 담지 않고, 관심사마다 다른 리소스, 다른 소유자를 둔다.**

```
┌───────────────────────────────────────────────────────┐
│ GatewayClass                                           │
│   소유자: 인프라 제공자 / 클러스터 관리자                  │
│   내용: "이 클러스터에서 쓸 수 있는 게이트웨이 구현체"       │
│   예: Envoy Gateway, Istio, Contour, Cilium             │
└───────────────────────────┬─────────────────────────────┘
                            │ 참조
┌───────────────────────────▼─────────────────────────────┐
│ Gateway                                                 │
│   소유자: 클러스터 운영 팀 (팀별로 1개씩 가질 수도 있다)     │
│   내용: 리스너 정의 — 포트, 프로토콜, TLS 인증서,          │
│         "어느 네임스페이스의 Route를 붙일 수 있는가"        │
└───────────────────────────┬─────────────────────────────┘
                            │ parentRefs로 연결
┌───────────────────────────▼─────────────────────────────┐
│ HTTPRoute / GRPCRoute / TCPRoute / TLSRoute / UDPRoute  │
│   소유자: 애플리케이션 팀                                  │
│   내용: "이 호스트/경로/헤더는 내 Service로"                │
└───────────────────────────────────────────────────────┘
```

Ingress에서는 이 세 관심사가 하나의 오브젝트, 하나의 RBAC 대상이었다. Gateway API에서는 **RBAC으로 자연스럽게 권한을 나눌 수 있다.** 앱 팀에게는 자기 네임스페이스의 `HTTPRoute`에 대한 쓰기 권한만 주고, `Gateway`/`GatewayClass`는 인프라 팀만 건드리게 하면 된다.

### 리스너와 라우트 부착

```yaml
# ① 인프라 팀이 관리 — Gateway
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: prod-gateway
  namespace: infra
spec:
  gatewayClassName: cilium          # 클러스터에 설치된 구현체 이름
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.k8s-guide.dev"
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-k8s-guide-dev
      allowedRoutes:
        namespaces:
          from: Selector
          selector:
            matchLabels:
              gateway-access: "true"    # 이 라벨이 붙은 NS의 Route만 부착 허용
---
# ② 앱 팀이 관리 — HTTPRoute (다른 네임스페이스, 다른 소유자)
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop
  namespace: shop
  labels:
    gateway-access: "true"
spec:
  parentRefs:
    - name: prod-gateway
      namespace: infra
  hostnames:
    - shop.k8s-guide.dev
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: web
          port: 80
```

`allowedRoutes`가 있기 때문에 `Gateway` 소유자는 **어느 네임스페이스가 자신의 리스너를 쓸 수 있는지 명시적으로 통제**한다. Ingress에는 이런 개념 자체가 없다 — 같은 `IngressClass`를 쓰는 모든 `Ingress`가 무조건 처리 대상이다.

### 애노테이션이 스펙 필드가 됐다

Ingress에서 컨트롤러별 애노테이션으로 흩어져 있던 기능들이 Gateway API에서는 **표준 스펙 필드**로 승격됐다. 컨트롤러를 바꿔도 동일하게 해석된다는 뜻이다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
  namespace: shop
spec:
  parentRefs: [{ name: prod-gateway, namespace: infra }]
  hostnames: [shop.k8s-guide.dev]
  rules:
    # 헤더 매칭 — 표준 필드 (ingress-nginx의 canary-by-header 애노테이션에 해당)
    - matches:
        - path: { type: PathPrefix, value: /api }
          headers:
            - name: X-Canary
              value: "true"
      backendRefs:
        - name: api-v2
          port: 80

    # 가중치 트래픽 분할 — 표준 필드 (canary-weight 애노테이션에 해당)
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: web-v1
          port: 80
          weight: 90
        - name: web-v2
          port: 80
          weight: 10

    # 요청 헤더/경로 변형 — 표준 필드 (rewrite-target 애노테이션에 해당)
    - matches:
        - path: { type: PathPrefix, value: /old }
      filters:
        - type: URLRewrite
          urlRewrite:
            path: { type: ReplacePrefixMatch, replacePrefixMatch: /new }
      backendRefs:
        - name: web
          port: 80
```

| 기능 | Ingress | Gateway API |
|---|---|---|
| 헤더 기반 라우팅 | 컨트롤러별 애노테이션 | `HTTPRouteMatch.headers` (표준) |
| 트래픽 분할(가중치) | 컨트롤러별 애노테이션, 별도 Ingress 오브젝트 필요 | `backendRefs[].weight` (표준, 한 규칙 안에서) |
| 경로 재작성 | `rewrite-target` 애노테이션 | `URLRewrite` 필터 (표준) |
| 요청/응답 헤더 조작 | 컨트롤러별 애노테이션 | `RequestHeaderModifier`/`ResponseHeaderModifier` 필터 (표준) |
| 프로토콜 범위 | 사실상 HTTP/HTTPS 전용 | `HTTPRoute`/`GRPCRoute`/`TCPRoute`/`TLSRoute`/`UDPRoute` |
| 역할 분리 | 불가 (단일 오브젝트) | GatewayClass/Gateway/Route 3계층 |
| 타입 검증 | 없음 (애노테이션은 문자열) | OpenAPI 스키마로 검증됨 |

### 지원 상태

```bash
# CRD 설치 (표준 채널)
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml

kubectl get crd | grep gateway.networking.k8s.io
```

`Gateway`/`GatewayClass`/`HTTPRoute`는 v1.0(2023년 10월)에 GA됐다. 이후 `GRPCRoute`와 `TLSRoute`도 차례로 Standard 채널(v1)로 승격됐고, 2026년 6월 출시된 v1.6에서는 `TCPRoute`/`UDPRoute`까지 Standard 채널로 승격됐다 — 이제 Gateway API의 핵심 라우트 타입 전체가 GA 상태다. 다만 **스펙의 GA와 특정 컨트롤러의 구현 완성도는 별개**라는 점은 여전히 유효하다. 실제 운영에 반영하기 전에는 사용 중인 컨트롤러가 이 채널들을 실제로 구현했는지 확인해야 한다.

이 GA 전환과 함께, 신규 클러스터에서 L7 라우팅을 새로 설계한다면 `Ingress`가 아니라 **Gateway API를 1차 선택지로 검토하는 것이 이제는 업계 표준에 가깝다.** `Ingress`는 여전히 널리 쓰이고 계속 지원되지만, 표준 필드로 커버하지 못하는 부분을 애노테이션에 의존해야 한다는 구조적 한계(17.1절)는 그대로이기 때문에, "언젠가 Gateway API로 넘어갈 수도 있다"가 아니라 "새로 시작한다면 Gateway API가 기본값"이라는 쪽으로 무게 중심이 이동했다.

**Gateway API를 구현하는 대표 컨트롤러**: Envoy Gateway, Istio, Contour, Cilium(eBPF 데이터플레인 위에 Gateway API를 얹는다 — 19장), NGINX Gateway Fabric, Traefik, GKE Gateway Controller, AWS Gateway API Controller. 클라우드 관리형 Ingress를 이미 쓰고 있다면 해당 클라우드가 Gateway API 컨트롤러도 제공하는지부터 확인하는 것이 자연스러운 시작점이다.

> **13~16장에서 만든 Service/EndpointSlice/DNS 위에 얹힌다**
>
> `HTTPRoute.rules[].backendRefs`가 가리키는 것은 여전히 평범한 `Service`다. Gateway API는 Service 자체를 대체하지 않는다. 14장에서 본 EndpointSlice 기반 백엔드 목록을 Gateway 구현체가 그대로 watch해서 쓴다 — 다만 kube-proxy를 거치지 않고 IngressController와 동일하게 Pod IP로 직접 프록시하는 구현이 대부분이다.

## 17.3 서비스 메시 데이터플레인

### 사이드카 주입 — 11장(2부)의 어드미션 웹훅이 실전에 쓰이는 곳

서비스 메시의 사이드카 모델은 **뮤테이팅 어드미션 웹훅**(2부 11장)의 대표적인 실사용 사례다. Pod가 생성되기 직전, 메시 컨트롤 플레인이 등록한 뮤테이팅 웹훅이 요청을 가로채 프록시 컨테이너를 스펙에 주입한다.

```
Pod 생성 요청
     │
     ▼
┌─────────────────────────────────────┐
│ MutatingAdmissionWebhook             │
│  (istiod, linkerd-proxy-injector 등) │
│                                      │
│  namespaceSelector로 주입 대상 판단     │
│  (예: istio-injection=enabled 라벨)   │
│                                      │
│  spec.containers에 사이드카 프록시 추가 │
│  spec.initContainers에               │
│    iptables 규칙 설정용 initContainer 추가│
└──────────────────┬───────────────────┘
                   ▼
        containerCreate (containerd/CRI-O)
                   │
                   ▼
┌──────────────────────────────────────────┐
│  Pod (2개 이상의 컨테이너)                    │
│  ┌────────────┐   ┌─────────────────┐    │
│  │ app 컨테이너 │──▶│ sidecar (Envoy) │──▶ 외부 │
│  └────────────┘   └─────────────────┘    │
│         모든 인/아웃바운드 트래픽이           │
│         iptables(또는 eBPF)로 사이드카를 거치도록│
│         강제로 리다이렉트된다                 │
└──────────────────────────────────────────┘
```

**init 컨테이너가 iptables 규칙을 심는다**는 부분이 중요하다. 애플리케이션 컨테이너는 자신이 사이드카를 거친다는 사실을 전혀 모른다 — 네트워크 네임스페이스 수준에서 강제로 트래픽이 우회된다. 15장에서 본 iptables 리다이렉트 메커니즘(`REDIRECT`/`DNAT` 타깃)이 kube-proxy와 무관하게 사이드카 주입에도 그대로 쓰인다.

> **사이드카 컨테이너는 이제 "평범한 컨테이너 흉내"가 아니다**
>
> 과거에는 사이드카 프록시를 `spec.containers`에 평범한 컨테이너로 넣었기 때문에, app 컨테이너보다 먼저 준비되고 app 컨테이너가 끝난 뒤에도 로그·트레이스 flush가 끝날 때까지 살아 있어야 한다는 요구를 충족시키기 어려웠다. **네이티브 사이드카 컨테이너**(`restartPolicy: Always`를 가진 `initContainer`로 정의하는 방식)는 kubelet이 시작·종료 순서를 직접 보장해 주는 정식 기능이다. 1.29에서 베타로 기본 활성화됐고 1.33 무렵에는 이미 안정적인 실무 관행으로 자리 잡았다. Istio·Linkerd 등 최신 메시 구현체는 대부분 이 방식으로 프록시를 주입한다 — 위 다이어그램의 "iptables 규칙 설정용 initContainer"와 사이드카 프록시 자체 모두, 오늘날에는 이 네이티브 사이드카 형태로 구현되는 경우가 일반적이다.

### mTLS — 사이드카 사이의 제로 트러스트

일반 Pod-to-Pod 통신은 평문이다. 사이드카가 주입되면 **애플리케이션이 인지하지 못한 채로** 두 사이드카 사이의 구간이 mTLS로 암호화된다.

```
서비스 A                                          서비스 B
┌──────────┐  평문 HTTP   ┌──────────┐  mTLS   ┌──────────┐  평문 HTTP  ┌──────────┐
│   app    │─────────────▶│ sidecar A│────────▶│ sidecar B│────────────▶│   app    │
└──────────┘  (localhost)  └──────────┘ (양방향  └──────────┘ (localhost) └──────────┘
                                        상호 인증)
```

각 사이드카는 워크로드마다 발급된 **단기(short-lived) 인증서**를 갖고, 컨트롤 플레인(Istiod 등)이 이를 자동으로 로테이션한다. 이것이 "제로 트러스트"라 불리는 이유는 두 가지다.

1. **양방향 인증(mTLS)**이므로 클라이언트도 서버도 서로의 신원을 확인한다. 네트워크 위치(같은 서브넷, 같은 클러스터)를 신뢰의 근거로 삼지 않는다.
2. 워크로드 신원이 **SPIFFE/SPIRE 계열의 짧은 수명 인증서**로 표현되므로, IP나 노드가 아니라 **워크로드 자체의 신원**으로 정책(누가 누구를 호출할 수 있는가)을 표현할 수 있다.

### L7 트래픽 제어 — 애플리케이션 코드가 아니라 프록시에서

재시도, 서킷 브레이커, 카나리 가중치 같은 로직을 각 애플리케이션이 라이브러리로 구현하면 언어마다 다시 구현해야 하고 일관성이 깨진다. 메시는 이것을 **프록시 레이어의 공통 기능**으로 옮긴다.

| 기능 | 프록시가 하는 일 |
|---|---|
| 재시도 | 특정 상태 코드(예: 5xx)에서 자동 재시도, 백오프 정책 |
| 타임아웃 | 업스트림 응답이 늦으면 강제 종료 |
| 서킷 브레이커 | 연속 실패가 임계치를 넘으면 해당 백엔드로의 요청을 일시 차단 |
| 카나리 가중치 | 여러 백엔드로 트래픽을 정확한 비율로 분배 (Gateway API의 `weight`와 같은 개념이 동서 트래픽에도 적용) |
| 폴트 인젝션 | 의도적으로 지연·오류를 주입해 장애 내성 테스트 |

**애플리케이션은 이 중 무엇도 알 필요가 없다.** 언어가 Go든 Java든 Python이든 사이드카가 앞을 가로막고 있으므로 동일한 재시도·타임아웃 정책이 적용된다.

### 관측성 — 모든 홉이 프록시이므로 균일하다

모든 서비스 간 호출이 사이드카를 거치므로, 사이드카가 **모든 호출의 메트릭·트레이스·액세스 로그를 애플리케이션 코드 수정 없이** 균일하게 수집할 수 있다.

```
service-a  ──▶  service-b  ──▶  service-c
   │envoy         │envoy          │envoy
   ▼              ▼               ▼
동일한 형식의 요청량, 지연 분포(p50/p90/p99), 오류율, 분산 트레이스 스팬
```

애플리케이션이 각자 다른 방식으로 로그를 남기던 환경에서, 사이드카 단위로 통일된 관측 데이터를 얻을 수 있다는 것이 메시 도입의 실질적 이유 중 하나다. 다만 이는 어디까지나 **네트워크 계층의 관측**이다. 애플리케이션 내부 로직(DB 쿼리 지연 등)까지 보려면 여전히 애플리케이션 계측(OpenTelemetry 등)이 필요하다.

## 17.4 앰비언트 메시

### 사이드카 모델의 비용

17.3절의 사이드카 모델은 강력하지만 공짜가 아니다.

- **Pod마다 프록시 컨테이너 하나.** 클러스터에 Pod가 1,000개면 프록시도 1,000개, 메모리 수십~수백 MB × 1,000.
- **주입 실패가 Pod 시작을 막을 수 있다.** 웹훅 자체가 2부 11장에서 다룬 가용성 위험(웹훅이 응답하지 않으면 Pod 생성이 지연되거나 실패)을 그대로 지닌다.
- **사이드카 시작 순서 문제.** app 컨테이너보다 사이드카가 먼저 준비되어야 트래픽을 놓치지 않는다 — 17.3절에서 본 네이티브 사이드카 컨테이너가 이 문제 자체는 해결했지만, 그 프록시가 Pod마다 하나씩 떠 있어야 한다는 사실 자체는 바뀌지 않는다.

### ztunnel + waypoint — 계층을 분리한다

**앰비언트 모드**(Istio Ambient가 대표적)는 "모든 Pod에 프록시를 하나씩 붙인다"는 전제를 버리고, 기능을 두 계층으로 분리한다.

```
┌──────────────────────────────────────────────────────────┐
│  노드 A                                                    │
│  ┌────────┐  ┌────────┐        ┌──────────────────────┐   │
│  │ Pod 1  │  │ Pod 2  │        │  ztunnel (노드당 1개)   │   │
│  │ (사이드카│  │ (사이드카│───────▶│  · mTLS 종료/시작       │   │
│  │  없음)  │  │  없음)  │        │  · L4 라우팅            │   │
│  └────────┘  └────────┘        │  · 기본 L4 정책 강제      │   │
│                                └───────────┬──────────────┘   │
└────────────────────────────────────────────┼──────────────┘
                                             │ mTLS로 암호화된 L4 터널
┌────────────────────────────────────────────▼──────────────┐
│  waypoint proxy (네임스페이스 또는 서비스 어카운트 단위, 선택적) │
│    · L7 라우팅, 재시도, 서킷 브레이커, 헤더 기반 정책            │
│    · L7 기능이 실제로 필요한 워크로드에만 배치                    │
└────────────────────────────────────────────────────────┘
```

**ztunnel**은 노드마다 하나만 존재하는 공유 프록시로, 해당 노드의 모든 Pod를 대신해 mTLS와 L4 라우팅·기본 정책을 처리한다. Pod 자체에는 프록시 컨테이너가 없다 — 대신 커널 수준의 리다이렉트(예: eBPF 또는 노드 네트워크 네임스페이스 설정)로 Pod의 트래픽이 ztunnel을 거치도록 만든다.

**waypoint proxy**는 선택적이다. L7 기능(헤더 매칭, 재시도, 트래픽 분할 등)이 실제로 필요한 네임스페이스나 서비스 어카운트에만 배치한다. L4 mTLS만 있으면 되는 대다수 워크로드는 waypoint 없이 ztunnel만으로 충분하다.

### 트레이드오프

| | 사이드카 모드 | 앰비언트 모드 |
|---|---|---|
| Pod당 오버헤드 | 프록시 컨테이너 1개씩 (메모리·CPU) | 없음 (ztunnel이 노드당 공유) |
| L7 기능 적용 범위 | 모든 Pod에 항상 존재 | waypoint를 배치한 곳에만 |
| 격리 수준 | Pod 단위로 강함 (프록시가 전용) | ztunnel은 노드 내 워크로드가 공유 |
| 주입 실패의 영향 범위 | 해당 Pod만 | ztunnel 장애 시 그 노드의 모든 Pod 영향 |
| 도입 복잡도 | Pod 재시작(주입)이 필요 | 상대적으로 낮음 — 사이드카 재주입 불필요 |
| 적합한 상황 | 워크로드마다 세밀한 L7 제어가 상시 필요 | 대다수 워크로드는 mTLS만 필요하고, 일부만 L7 제어가 필요 |

**핵심 트레이드오프는 "격리 대 효율"이다.** 사이드카는 Pod마다 전용 프록시를 두어 격리 수준이 높지만 자원 오버헤드가 Pod 수에 비례해 커진다. 앰비언트는 노드 단위로 공유해 오버헤드를 줄이지만, L4 계층(ztunnel)만큼은 노드 내 워크로드들이 프록시를 공유한다는 사실을 감안해야 한다. 대규모 클러스터에서 "메시는 필요한데 사이드카 오버헤드는 감당하기 어렵다"는 경우 앰비언트 모드가 실질적인 대안으로 떠오른 이유가 여기에 있다.

> **Cilium과의 접점**
>
> Cilium 역시 서비스 메시 기능(mTLS, L7 가시성)을 eBPF 데이터플레인 위에서 사이드카 없이 제공하는 방향으로 발전해 왔다. 19장에서 다룰 eBPF 기반 데이터플레인이 앰비언트 모드의 ztunnel과 유사한 "노드 단위 공유 처리"라는 아이디어를 커널 레벨에서 구현한다고 생각하면 두 장이 자연스럽게 연결된다.

## 실습: Ingress와 Gateway API 나란히 비교하기

이 실습은 `k8s-guide` 3노드 kind 클러스터를 전제로 한다. Gateway API 컨트롤러가 없다면 CRD만 설치해 리소스 구조를 검증하고, 가능하면 Cilium(kube-proxy 대체 모드로 설치 시 Gateway API를 함께 지원)을 설치해 실제 라우팅까지 확인한다.

**① 백엔드 준비**

```bash
kubectl create deployment web --image=hashicorp/http-echo:1.0 \
  -- -text="I am WEB" -listen=:5678
kubectl expose deployment web --port=80 --target-port=5678

kubectl create deployment api --image=hashicorp/http-echo:1.0 \
  -- -text="I am API" -listen=:5678
kubectl expose deployment api --port=80 --target-port=5678
```

**② 같은 라우팅 규칙을 Ingress로 작성**

```yaml
# ingress-classic.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
    - host: shop.k8s-guide.dev
      http:
        paths:
          - path: /api(/|$)(.*)
            pathType: ImplementationSpecific
            backend: { service: { name: api, port: { number: 80 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

**③ 같은 규칙을 Gateway API로 작성**

```yaml
# gateway-api.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: k8s-guide-gw
spec:
  controllerName: example.com/gateway-controller   # 실제 설치된 구현체의 컨트롤러 이름으로 교체
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shop-gateway
spec:
  gatewayClassName: k8s-guide-gw
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces: { from: Same }
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop-route
spec:
  parentRefs: [{ name: shop-gateway }]
  hostnames: [shop.k8s-guide.dev]
  rules:
    - matches: [{ path: { type: PathPrefix, value: /api } }]
      backendRefs: [{ name: api, port: 80 }]
    - matches: [{ path: { type: PathPrefix, value: / } }]
      backendRefs: [{ name: web, port: 80 }]
```

**④ 두 방식을 나란히 비교**

```bash
kubectl apply -f ingress-classic.yaml
kubectl apply -f gateway-api.yaml   # 컨트롤러가 없으면 dry-run으로도 구조 확인 가능
kubectl apply -f gateway-api.yaml --dry-run=server
```

| 관찰 포인트 | Ingress | Gateway API |
|---|---|---|
| `/api` 경로 제거를 위한 재작성 | 애노테이션 + 정규식 캡처 그룹 | `URLRewrite` 필터 (선택적으로만 필요) |
| 리소스 개수 | 1개 | 3개 (GatewayClass/Gateway/HTTPRoute) — 대신 소유자가 나뉜다 |
| 컨트롤러 교체 시 | 애노테이션 전부 재작성 | 스펙은 그대로, `gatewayClassName`만 교체 |
| 리소스 소유자 | 전부 동일 (보통 앱 팀) | GatewayClass=인프라, Gateway=클러스터 운영, HTTPRoute=앱 팀 |

**⑤ 정리**

```bash
kubectl delete -f ingress-classic.yaml -f gateway-api.yaml --ignore-not-found
kubectl delete deployment web api
kubectl delete service web api
```

---

## 실습 과제

**과제 1 — 리로드 방식 관찰**
ingress-nginx를 설치한 뒤 `kubectl exec`로 컨트롤러 Pod 안에 들어가 `nginx.conf`를 확인한다. `Ingress`의 라우팅 규칙을 바꿀 때와 백엔드 Deployment를 스케일할 때 각각 컨트롤러 로그에 어떤 차이가 나는지(전체 리로드 여부) 비교한다.

**과제 2 — Gateway API 권한 분리 시뮬레이션**
`Gateway`는 `infra` 네임스페이스에, `HTTPRoute`는 `shop` 네임스페이스에 두고, `shop` 네임스페이스에만 쓰기 권한이 있는 ServiceAccount로 `HTTPRoute`를 수정해 본다. 동일한 권한으로 `Gateway`를 수정하려 하면 거부되는 것을 RBAC으로 구성해 확인한다.

**과제 3 — 트래픽 분할 정확도 비교**
Ingress의 canary 애노테이션(가중치 10/50/90)과 Gateway API `HTTPRoute`의 `backendRefs[].weight`로 각각 동일한 분할을 구성하고, 100~200회 요청을 보내 실제 분배 비율을 측정해 비교한다.

**과제 4 — 사이드카 유무에 따른 지연 측정**
서비스 메시를 설치할 수 있다면(Istio, Linkerd 등), 같은 두 서비스 간 호출을 사이드카 주입 전/후로 각각 측정해 추가되는 지연(보통 1~3ms대)을 확인한다.

**과제 5 — 앰비언트 모드 개념 검증**
Istio Ambient를 설치할 수 있는 환경이라면, 네임스페이스를 ambient에 등록한 뒤 Pod에 사이드카 컨테이너가 주입되지 않는 것을 확인하고, `ztunnel` DaemonSet이 노드마다 하나씩 떠 있는 것을 관찰한다. waypoint를 배치하기 전/후로 L7 정책(헤더 기반 라우팅)이 적용되는지 여부가 달라지는 것을 확인한다.

---

## 요약

- **Ingress 오브젝트는 데이터일 뿐이다.** IngressController가 5장의 조정 루프 패턴 그대로 Ingress/Service/EndpointSlice/Secret을 watch해 자신의 프록시 설정(정적 리로드 또는 동적 API)을 갱신한다. 대부분의 컨트롤러는 kube-proxy를 우회해 Pod IP로 직접 프록시한다.
- Ingress의 근본 한계는 **애노테이션 난립과 역할 분리 불가**다. TLS·라우팅·트래픽 제어가 모두 같은 오브젝트, 같은 소유자에 뒤섞인다.
- **Gateway API**는 `GatewayClass`(인프라 제공자) → `Gateway`(클러스터 운영자) → `HTTPRoute`/`GRPCRoute`/`TCPRoute`(앱 팀)로 역할을 분리한다. 헤더 매칭, 가중치 트래픽 분할, URL 재작성이 애노테이션이 아니라 **타입 검증되는 표준 스펙 필드**다.
- 서비스 메시는 **동서 트래픽**을 다룬다. 사이드카(보통 Envoy)를 뮤테이팅 어드미션 웹훅(2부 11장)으로 주입해, iptables 리다이렉트로 모든 트래픽을 강제로 거치게 한다. mTLS로 제로 트러스트를, 프록시 레이어에서 재시도·서킷 브레이커·트래픽 분할을, 균일한 관측성을 코드 수정 없이 얻는다.
- **앰비언트 메시**는 사이드카를 노드 단위 공유 프록시(`ztunnel`, L4/mTLS)와 선택적 네임스페이스 단위 프록시(`waypoint`, L7)로 분리한다. Pod당 오버헤드는 사라지지만 L4 계층의 격리는 노드 단위로 완화된다.

**다음 장에서는** 지금까지 "누구나 누구에게나 통신 가능하다"고 전제해 온 클러스터 내부 네트워크를 다시 본다. NetworkPolicy로 이 기본값을 어떻게 뒤집고, CNI마다 그 시행이 왜 다른지 살펴본다.
