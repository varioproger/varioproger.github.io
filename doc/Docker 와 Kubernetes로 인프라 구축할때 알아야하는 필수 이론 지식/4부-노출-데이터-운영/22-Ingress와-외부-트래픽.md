---
title: "22장. Ingress와 외부 트래픽"
parent: "4부. 서비스 노출, 데이터, 운영"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 22
---

# 22장. Ingress와 외부 트래픽

## 이 장에서 배우는 것

- Ingress가 왜 필요한지(LoadBalancer Service의 한계)
- **Ingress 리소스**와 **IngressController**가 서로 다른 것이라는 점
- 호스트·경로 기반 라우팅과 TLS 종료의 개념
- 클라우드 로드밸런서와의 관계(개요)와 Gateway API의 위치(한 단락)

## 1. 왜 Ingress인가

LoadBalancer 타입 Service는 하나당 클라우드 로드밸런서 하나를 만든다. 서비스가 30개면 LB도 30개, IP도 30개, 인증서도 30개다. 비용과 관리 부담이 곱셈으로 늘어난다. 게다가 Service는 L4(TCP/UDP)에서 동작하므로 "`/api`로 오는 요청은 백엔드로, `/`는 프론트엔드로" 같은 HTTP 수준의 판단을 할 수 없다.

**Ingress**는 하나의 진입점에서 HTTP/HTTPS 트래픽을 받아 호스트와 경로에 따라 여러 서비스로 나눈다.

```
                     ┌─────────────────────────────┐
                     │      Ingress Controller     │
인터넷 → LB (1개) →  │  shop.example.com/     → web│
                     │  shop.example.com/api  → api│
                     │  admin.example.com/    → adm│
                     └─────────────────────────────┘
```

## 2. Ingress와 IngressController는 다르다

가장 중요한 구분이다.

| | Ingress | IngressController |
|---|---|---|
| 정체 | **API 리소스**(설정 데이터) | **실행되는 프로그램**(리버스 프록시) |
| 하는 일 | "이렇게 라우팅해 달라"고 선언 | 그 선언을 읽어 실제로 라우팅 |
| 배포 형태 | YAML 매니페스트 | Deployment/DaemonSet + Service |

**Ingress 리소스만 만들면 아무 일도 일어나지 않는다.** 컨트롤러가 없으면 etcd에 저장된 데이터일 뿐이다. 초보자가 가장 자주 겪는 혼란이다.

```bash
kubectl get ingress
# NAME   CLASS   HOSTS              ADDRESS   PORTS   AGE
# web    nginx   shop.example.com             80      5m
#                                   ADDRESS가 비어 있다 = 컨트롤러가 처리하지 않았다
```

컨트롤러는 API 서버를 watch해서 Ingress, Service, EndpointSlice, Secret의 변경을 감지하고, 자신의 설정(예: nginx.conf)을 재생성한 뒤 들어오는 요청을 규칙에 따라 백엔드 Pod로 프록시한다. 대부분의 컨트롤러는 Service의 ClusterIP를 거치지 않고 Pod IP로 직접 프록시한다.

대표적인 컨트롤러로는 ingress-nginx(쿠버네티스 프로젝트가 관리, 가장 널리 쓰임), Traefik, HAProxy Ingress, Envoy 기반(Contour 등), 그리고 클라우드 네이티브(AWS Load Balancer Controller 등)가 있다. 여러 컨트롤러를 함께 쓸 때는 `ingressClassName`으로 어느 컨트롤러가 처리할지 지정한다.

## 3. 라우팅 규칙

### 경로 기반

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
spec:
  ingressClassName: nginx
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

`pathType`이 매칭 방식을 정한다.

| pathType | 동작 |
|---|---|
| `Exact` | 경로가 정확히 일치 |
| `Prefix` | **경로 세그먼트 단위** 접두사 일치 (`/api`는 `/api/users`와 매칭되지만 `/apifoo`와는 안 됨) |
| `ImplementationSpecific` | 컨트롤러가 알아서 |

더 긴 경로가 우선한다. 경로 기반 분리보다 `api.example.com`, `www.example.com` 같은 **서브도메인(호스트 기반) 분리가 더 안전**하다는 것이 원문의 권고다(경로를 제거해 전달하는 rewrite와 상대 경로가 충돌할 수 있기 때문이다).

### 호스트 기반

```yaml
rules:
  - host: web.example.com
    http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: web, port: { number: 80 } } } }] }
  - host: api.example.com
    http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: api, port: { number: 80 } } } }] }
```

어느 규칙에도 맞지 않는 요청은 `defaultBackend`가 처리한다.

## 4. TLS 종료

```yaml
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - shop.example.com
      secretName: shop-tls          # kubernetes.io/tls 타입 Secret
  rules:
    - host: shop.example.com
      ...
```

```bash
kubectl create secret tls shop-tls --cert=tls.crt --key=tls.key
```

**TLS는 컨트롤러에서 종료된다.** 컨트롤러 → 백엔드 Pod 구간은 기본적으로 평문 HTTP다. 인증서를 수동으로 발급·갱신하는 것은 지속 가능하지 않으므로(Let's Encrypt 인증서는 90일마다 만료), **cert-manager**를 쓰면 Ingress에 애노테이션 한 줄(`cert-manager.io/cluster-issuer: ...`)로 발급과 갱신이 자동화된다.

## 5. 클라우드 로드밸런서와의 관계 (개요)

클라우드에서는 그 클라우드의 로드밸런서를 직접 제어하는 컨트롤러를 쓸 수 있다.

| | AWS | GCP | Azure |
|---|---|---|---|
| 컨트롤러 | AWS Load Balancer Controller | GKE Ingress | AGIC |
| 만드는 것 | ALB (L7) / NLB (L4) | Cloud Load Balancing | Application Gateway |

| | 클라우드 네이티브 | ingress-nginx |
|---|---|---|
| 관리 부담 | 낮음 (LB는 클라우드가 운영) | 컨트롤러 Pod를 직접 운영 |
| 이식성 | 클라우드 종속 | 어디서나 동일 |

멀티 클라우드나 온프레미스가 섞여 있으면 ingress-nginx로 통일하는 편이 운영이 단순하고, 단일 클라우드에 집중한다면 네이티브 컨트롤러의 통합 이점이 크다는 것이 원문의 정리다.

## 6. Gateway API (한 단락)

Ingress는 표준 필드가 적어서 실무 기능(리다이렉트, 레이트 리밋, 카나리 등)이 컨트롤러마다 다른 **애노테이션**으로 제공되고, 이식성이 없으며, 인프라 팀과 앱 팀이 같은 리소스를 편집해야 하고, HTTP 위주라는 한계가 있다. **Gateway API**는 이를 해결하기 위해 역할별로 리소스를 나눈다. `GatewayClass`(인프라 제공자), `Gateway`(클러스터 운영자: 포트·인증서), `HTTPRoute`(애플리케이션 개발자: 호스트·경로 라우팅). 헤더 기반 라우팅과 트래픽 분할이 애노테이션이 아닌 표준 스펙 필드다. 신규 프로젝트라면 검토할 만하지만, 이미 Ingress를 운영 중이라면 서두를 필요는 없다(Ingress는 계속 지원된다).

## 7. Ingress 문제 진단 (기본)

```
① kubectl get ingress           → ADDRESS가 비어 있으면 컨트롤러가 처리하지 않음
② kubectl get ingressclass      → ingressClassName이 맞는가
③ kubectl describe ingress ...  → Events, 컨트롤러 로그 확인
④ kubectl get svc,endpointslice → 백엔드 Service와 엔드포인트가 있는가
```

| 증상 | 원인 |
|---|---|
| `404 Not Found` | 호스트/경로 매칭 실패. `Host` 헤더 확인 |
| `503 Service Unavailable` | 백엔드 엔드포인트 없음 |
| `502 Bad Gateway` | 백엔드가 응답 안 함. 포트 불일치, 앱 크래시 |
| `504 Gateway Timeout` | 백엔드가 느림 |
| TLS 인증서 오류 | Secret 이름·네임스페이스 확인 (Secret은 Ingress와 같은 네임스페이스에) |

> **[보충]** 서비스 메시(Istio 등)는 Ingress가 다루는 "외부 ↔ 클러스터"(남북) 트래픽이 아니라 "서비스 ↔ 서비스"(동서) 트래픽을 다루는 별개의 계층이다. 원문은 서비스가 10개 미만이거나 팀이 작을 때는 과하다고 설명한다. 이 책에서는 다루지 않는다.

## 핵심 요약

- Ingress는 하나의 진입점에서 호스트·경로에 따라 여러 Service로 HTTP 트래픽을 나눈다. LoadBalancer Service를 서비스마다 만드는 것보다 비용·관리 면에서 유리하다.
- **Ingress는 설정 데이터, IngressController는 실제 프로그램**이다. 컨트롤러가 없으면 `ADDRESS`가 비어 있고 아무 일도 일어나지 않는다.
- TLS는 컨트롤러에서 종료된다. cert-manager로 인증서 발급·갱신을 자동화할 수 있다.
- 클라우드 네이티브 컨트롤러는 관리 부담이 낮고, ingress-nginx는 이식성이 좋다.
- Gateway API는 애노테이션 난립과 역할 분리 문제를 해결하려는 Ingress의 후계다.
- 진단은 ADDRESS → IngressClass → 컨트롤러 로그 → 백엔드 엔드포인트 순서로 좁힌다.

## 확인 질문

1. Ingress YAML을 적용했는데 `ADDRESS`가 비어 있다. 가장 먼저 의심할 것은 무엇인가?
2. `Ingress`와 `IngressController`의 차이를 한 문장으로 설명해 보자.
3. 브라우저에서 502와 503이 나올 때 각각 어디부터 확인하겠는가?

*원문 근거: kubernetes-textbook-main/03-애플리케이션-노출과-데이터/11-인그레스와-외부-트래픽-라우팅.md (들어가며, 11.1 Ingress와 IngressController, 11.2 pathType·호스트 기반 라우팅·기본 백엔드, 11.3 TLS 종료와 cert-manager, 11.5 Gateway API, 11.5b 클라우드별 인그레스 통합, 11.6 서비스 메시 판단 기준, 11.7 인그레스 문제 진단)*
