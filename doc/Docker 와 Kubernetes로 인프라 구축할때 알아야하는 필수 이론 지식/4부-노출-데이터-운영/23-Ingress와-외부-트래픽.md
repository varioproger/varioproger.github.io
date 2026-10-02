---
title: "23장. Ingress와 외부 트래픽"
parent: "4부. 서비스 노출, 데이터, 운영"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 23
---

# 23장. Ingress와 외부 트래픽

> **🎮 게임 서버 개발자에게** — 클라이언트 접속을 하나의 게이트웨이(프론트) 서버로 받아 패킷 종류에 따라 로그인·로비·상점 서버로 나눠 보내는 구조를 만들어 봤다면, Ingress가 그 게이트웨이다. 다만 Ingress는 **HTTP/HTTPS 요청을 호스트·경로로 나누는 L7 라우터**이고, 라우팅 규칙(Ingress 리소스)과 그 규칙을 실행하는 프로그램(IngressController)이 **완전히 분리**되어 있다. 규칙만 적고 실행할 프로그램이 없으면 아무 일도 일어나지 않는다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 웹 상점·결제 콜백·운영툴 API를 각각 LoadBalancer로 노출했더니 LB·IP·인증서가 서비스 수만큼 늘었다 → Ingress 하나로 모은다.
> - Ingress YAML을 적용했는데 `ADDRESS`가 비어 있고 외부에서 접속이 안 된다 → 컨트롤러/ingressClassName 확인.
> - 점검 배포 직후 브라우저에 502나 503이 뜬다 → 둘이 가리키는 원인이 다르다.

## 코어 — 이것만은 100%

> **한 문장:** Ingress는 하나의 진입점에서 HTTP 트래픽을 호스트·경로로 나누는 설정 데이터이고, 실제 라우팅과 TLS 종료는 그것을 watch하는 IngressController가 하므로 컨트롤러가 없으면 아무 일도 일어나지 않는다.

1. **하나의 진입점, L7 라우팅** — LoadBalancer Service는 서비스마다 LB가 생기고 L4라 HTTP 판단을 못 한다. Ingress는 LB 하나로 호스트·경로 기반 라우팅을 한다.
2. **선언(Ingress)과 실행(Controller)은 다르다** — Ingress는 API 리소스, IngressController는 리버스 프록시 프로그램이다. 컨트롤러가 없으면 `ADDRESS`가 비어 있다. 진단도 이 순서(ADDRESS → IngressClass → 로그 → 엔드포인트)로 한다.
3. **TLS는 컨트롤러에서 끝난다** — 컨트롤러 → 백엔드 Pod 구간은 기본 평문이고, 인증서 발급·갱신은 cert-manager로 자동화한다.
4. **컨트롤러 선택과 후계** — 클라우드 네이티브(관리 부담↓) vs ingress-nginx(이식성↑). Gateway API는 애노테이션 난립·역할 분리 문제를 푸는 Ingress의 후계다.

**이 장에서 배우는 것 (원래 목차)**

- Ingress가 왜 필요한지(LoadBalancer Service의 한계) → 코어 1
- **Ingress 리소스**와 **IngressController**가 서로 다른 것이라는 점 → 코어 2
- 호스트·경로 기반 라우팅과 TLS 종료의 개념 → 코어 1, 코어 3
- 클라우드 로드밸런서와의 관계(개요)와 Gateway API의 위치(한 단락) → 코어 4

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 게이트웨이 서버가 패킷 헤더(opcode)를 보고 백엔드 서버로 분배 | Ingress 라우팅 | 진입점 하나에서 내용을 보고 여러 백엔드로 나눈다 | 판단 기준이 HTTP의 호스트·경로다. 자체 바이너리 TCP 프로토콜은 Ingress 규칙으로 나눌 수 없다 |
| 라우팅 테이블을 담은 설정 파일 vs 그것을 읽는 게이트웨이 프로세스 | Ingress vs IngressController | 데이터와 실행 주체가 따로 있다 | Ingress는 파일이 아니라 API 서버(etcd)에 저장된 리소스이고, 컨트롤러가 이를 watch해 설정(예: nginx.conf)을 재생성한다. 프로세스가 없으면 규칙은 그냥 데이터다 |
| 게이트웨이에서 OpenSSL로 TLS를 풀고 내부망은 평문으로 전달 | TLS 종료 | 암호화를 진입점에서 끝내고 내부는 평문 | 인증서는 `kubernetes.io/tls` Secret으로 넘기고, 90일 만료 인증서 갱신을 cert-manager가 자동으로 한다 |
| 게이트웨이가 백엔드 연결 실패/타임아웃 시 클라이언트에 돌려주는 에러 코드 | 404 / 502 / 503 / 504 | 에러 코드로 어느 구간이 문제인지 구분한다 | 의미가 HTTP 표준으로 정해져 있다: 404 매칭 실패, 502 백엔드 무응답, 503 엔드포인트 없음, 504 백엔드 느림 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. LoadBalancer Service로도 외부 노출이 되는데, Ingress는 무엇을 더 해 줄까?
> 2. Ingress YAML을 적용했는데 아무 일도 일어나지 않는다면 무엇이 빠진 걸까?
> 3. HTTPS 연결은 어디서 풀리고, 그 뒤 백엔드 Pod까지는 암호화되어 있을까?
> 4. 브라우저의 502와 503은 서로 어떤 다른 문제를 가리킬까?
>
> **처리법:** 🛠 실습 경로·호스트 기반 Ingress YAML, `kubectl create secret tls`, `kubectl get ingress` / `get ingressclass` / `describe ingress` 진단 순서 → 바로 실행 · 🗺 관계도 인터넷 → LB(1개) → IngressController(Ingress 규칙 watch) → 백엔드 Service/Pod, TLS 종료 지점, Gateway API의 역할 분리(GatewayClass / Gateway / HTTPRoute) · 📦 카드로 pathType 3값, HTTP 404/502/503/504 의미, Let's Encrypt 90일 만료, 클라우드별 컨트롤러(AWS LB Controller, GKE Ingress, AGIC)

---

## 코어 1. 하나의 진입점, L7 라우팅

### 1.1 왜 Ingress인가

**한 줄 요약:** LoadBalancer Service는 서비스 수만큼 LB·IP·인증서가 늘고 L4라 HTTP 판단을 못 한다. Ingress는 진입점 하나에서 호스트·경로로 나눈다.

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

### 1.2 경로 기반 라우팅

**한 줄 요약:** `pathType`이 매칭 방식을 정하고(Prefix는 세그먼트 단위), 더 긴 경로가 우선한다. 경로 분리보다 호스트 분리가 더 안전하다.

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

### 1.3 호스트 기반 라우팅과 기본 백엔드

**한 줄 요약:** 호스트별로 규칙을 나누고, 어느 규칙에도 맞지 않는 요청은 `defaultBackend`가 받는다.

```yaml
rules:
  - host: web.example.com
    http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: web, port: { number: 80 } } } }] }
  - host: api.example.com
    http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: api, port: { number: 80 } } } }] }
```

어느 규칙에도 맞지 않는 요청은 `defaultBackend`가 처리한다.

## 코어 2. 선언(Ingress)과 실행(Controller)은 다르다

### 2.1 Ingress와 IngressController

**한 줄 요약:** Ingress는 설정 데이터, IngressController는 그것을 watch해 실제로 프록시하는 프로그램이다. 컨트롤러가 없으면 `ADDRESS`가 비어 있다.

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

### 2.2 컨트롤러가 하는 일과 대표 구현

**한 줄 요약:** 컨트롤러는 Ingress·Service·EndpointSlice·Secret을 watch해 설정을 재생성하고, 대부분 ClusterIP를 거치지 않고 Pod IP로 직접 프록시한다.

컨트롤러는 API 서버를 watch해서 Ingress, Service, EndpointSlice, Secret의 변경을 감지하고, 자신의 설정(예: nginx.conf)을 재생성한 뒤 들어오는 요청을 규칙에 따라 백엔드 Pod로 프록시한다. 대부분의 컨트롤러는 Service의 ClusterIP를 거치지 않고 Pod IP로 직접 프록시한다.

대표적인 컨트롤러로는 ingress-nginx(쿠버네티스 프로젝트가 관리, 가장 널리 쓰임), Traefik, HAProxy Ingress, Envoy 기반(Contour 등), 그리고 클라우드 네이티브(AWS Load Balancer Controller 등)가 있다. 여러 컨트롤러를 함께 쓸 때는 `ingressClassName`으로 어느 컨트롤러가 처리할지 지정한다.

### 2.3 Ingress 문제 진단 (기본)

**한 줄 요약:** 선언이 실행됐는가(ADDRESS, IngressClass) → 컨트롤러가 무엇을 봤는가(Events, 로그) → 백엔드가 있는가(Service, 엔드포인트) 순서로 좁힌다.

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

## 코어 3. TLS는 컨트롤러에서 끝난다

### 3.1 TLS 종료와 cert-manager

**한 줄 요약:** `tls` 필드에 `kubernetes.io/tls` Secret을 지정하면 컨트롤러가 TLS를 풀고, 백엔드 구간은 기본 평문이다. 갱신은 cert-manager로 자동화한다.

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

## 코어 4. 컨트롤러 선택과 후계

### 4.1 클라우드 로드밸런서와의 관계 (개요)

**한 줄 요약:** 클라우드 네이티브 컨트롤러는 LB를 클라우드가 운영해 관리 부담이 낮고, ingress-nginx는 어디서나 동일해 이식성이 높다.

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

### 4.2 Gateway API (한 단락)

**한 줄 요약:** 애노테이션 난립·이식성 부족·역할 혼재·HTTP 위주라는 Ingress의 한계를 GatewayClass / Gateway / HTTPRoute 역할 분리로 푼다.

Ingress는 표준 필드가 적어서 실무 기능(리다이렉트, 레이트 리밋, 카나리 등)이 컨트롤러마다 다른 **애노테이션**으로 제공되고, 이식성이 없으며, 인프라 팀과 앱 팀이 같은 리소스를 편집해야 하고, HTTP 위주라는 한계가 있다. **Gateway API**는 이를 해결하기 위해 역할별로 리소스를 나눈다. `GatewayClass`(인프라 제공자), `Gateway`(클러스터 운영자: 포트·인증서), `HTTPRoute`(애플리케이션 개발자: 호스트·경로 라우팅). 헤더 기반 라우팅과 트래픽 분할이 애노테이션이 아닌 표준 스펙 필드다. 신규 프로젝트라면 검토할 만하지만, 이미 Ingress를 운영 중이라면 서두를 필요는 없다(Ingress는 계속 지원된다).

### 4.3 서비스 메시와의 경계

**한 줄 요약:** Ingress는 남북(외부 ↔ 클러스터), 서비스 메시는 동서(서비스 ↔ 서비스) 트래픽이다.

> **[보충]** 서비스 메시(Istio 등)는 Ingress가 다루는 "외부 ↔ 클러스터"(남북) 트래픽이 아니라 "서비스 ↔ 서비스"(동서) 트래픽을 다루는 별개의 계층이다. 원문은 서비스가 10개 미만이거나 팀이 작을 때는 과하다고 설명한다. 이 책에서는 다루지 않는다.

## 실무 적용

### 체크리스트

- [ ] Ingress는 하나의 진입점에서 호스트·경로에 따라 여러 Service로 HTTP 트래픽을 나눈다. LoadBalancer Service를 서비스마다 만드는 것보다 비용·관리 면에서 유리하다.
- [ ] **Ingress는 설정 데이터, IngressController는 실제 프로그램**이다. 컨트롤러가 없으면 `ADDRESS`가 비어 있고 아무 일도 일어나지 않는다. 컨트롤러가 여럿이면 `ingressClassName`을 지정한다.
- [ ] 라우팅은 경로 분리보다 서브도메인(호스트) 분리를 우선 검토한다. `Prefix`는 세그먼트 단위로 매칭된다.
- [ ] TLS는 컨트롤러에서 종료된다. TLS Secret은 Ingress와 같은 네임스페이스에 두고, cert-manager로 인증서 발급·갱신을 자동화할 수 있다.
- [ ] 클라우드 네이티브 컨트롤러는 관리 부담이 낮고, ingress-nginx는 이식성이 좋다.
- [ ] Gateway API는 애노테이션 난립과 역할 분리 문제를 해결하려는 Ingress의 후계다. 신규 프로젝트라면 검토하되 운영 중인 Ingress를 서둘러 옮길 필요는 없다.
- [ ] 진단은 ADDRESS → IngressClass → 컨트롤러 로그 → 백엔드 엔드포인트 순서로 좁힌다.

### 시나리오로 확인하기

1. **상황:** 이벤트 웹페이지, 결제 콜백 API, 운영툴을 각각 `type: LoadBalancer` Service로 노출했다. 서비스가 늘 때마다 클라우드 LB와 인증서가 하나씩 늘고 있다.
   **질문:** 무엇이 문제이고 어떻게 바꾸나?

   <details markdown="1"><summary>답 확인</summary>

   LoadBalancer Service는 하나당 클라우드 LB를 하나 만들어 LB·IP·인증서가 서비스 수만큼 곱해진다. 또 L4라 경로 판단도 못 한다. Ingress 하나(LB 1개)로 모으고 `event.example.com`, `pay.example.com` 같은 호스트 기반 규칙으로 나눈다. → 코어 1

   </details>

2. **상황:** 새 클러스터에 Ingress YAML을 적용했는데 외부에서 접속이 안 되고 `kubectl get ingress`의 `ADDRESS`가 비어 있다. 게이트웨이 서버를 띄우지 않고 라우팅 설정 파일만 배포한 셈이다.
   **질문:** 무엇을 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   IngressController가 이 Ingress를 처리하지 않은 것이다. 컨트롤러가 설치돼 있는지, `ingressClassName`이 `kubectl get ingressclass`에 나오는 이름과 맞는지 확인하고, `describe ingress`의 Events와 컨트롤러 로그를 본다. → 코어 2

   </details>

3. **상황:** 점검 배포 직후 한쪽에서는 503, 다른 쪽에서는 502가 뜬다.
   **질문:** 각각 어디부터 보나?

   <details markdown="1"><summary>답 확인</summary>

   503은 백엔드 엔드포인트가 없다는 뜻이므로 `kubectl get svc,endpointslice`로 엔드포인트(Ready Pod)가 있는지 본다. 502는 백엔드가 응답하지 않는 것이므로 Service의 포트와 컨테이너 포트가 맞는지, 앱이 크래시했는지 확인한다. → 코어 2

   </details>

4. **상황:** 보안 감사에서 "HTTPS를 쓰는데 클러스터 내부 구간이 평문"이라는 지적과 "인증서가 만료돼 접속 장애가 났다"는 이력이 함께 나왔다.
   **질문:** 원인과 대응은?

   <details markdown="1"><summary>답 확인</summary>

   Ingress에서 TLS는 컨트롤러에서 종료되고 컨트롤러 → 백엔드 Pod 구간은 기본적으로 평문 HTTP다. 만료 문제는 Let's Encrypt 인증서가 90일마다 만료되는데 수동 갱신에 의존했기 때문이므로, cert-manager로 발급·갱신을 자동화한다. → 코어 3

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 왜 Ingress: LB Service 한계 = 서비스마다 LB·IP·( ? ) / L( ? )라 HTTP 판단 불가
  pathType: Exact / Prefix(( ? ) 단위) / ImplementationSpecific
  더 ( ? ) 경로 우선, 매칭 실패 → ( ? )
  권고: 경로 분리보다 ( ? ) 분리

[코어 2] Ingress(( ? )) vs IngressController(( ? ))
  컨트롤러 watch 대상: Ingress, Service, ( ? ), Secret
  여러 컨트롤러 선택: ( ? )
  진단: ADDRESS → ( ? ) → describe/로그 → svc,endpointslice
  404 ( ? ) / 502 ( ? ) / 503 ( ? ) / 504 ( ? )

[코어 3] TLS: ( ? )에서 종료, Secret 타입 kubernetes.io/tls, 자동화 = ( ? )

[코어 4] 클라우드 네이티브(관리 부담↓) vs ingress-nginx(( ? )↑)
  Gateway API: GatewayClass / ( ? ) / HTTPRoute
```

### 2. 인출 질문

1. Ingress YAML을 적용했는데 `ADDRESS`가 비어 있다. 가장 먼저 의심할 것은 무엇인가? (원래 확인 질문 1)

   <details markdown="1"><summary>답 확인</summary>

   IngressController가 이 Ingress를 처리하지 않은 것이다. 컨트롤러가 아예 없거나, `ingressClassName`이 존재하는 IngressClass와 맞지 않는지(`kubectl get ingressclass`) 확인한다. → 코어 2 (2.1, 2.3)

   </details>

2. `Ingress`와 `IngressController`의 차이를 한 문장으로 설명해 보자. (원래 확인 질문 2)

   <details markdown="1"><summary>답 확인</summary>

   Ingress는 "이렇게 라우팅해 달라"는 API 리소스(설정 데이터)이고, IngressController는 그 선언을 watch해 실제로 요청을 백엔드로 프록시하는 실행 프로그램이다. → 코어 2 (2.1)

   </details>

3. 브라우저에서 502와 503이 나올 때 각각 어디부터 확인하겠는가? (원래 확인 질문 3)

   <details markdown="1"><summary>답 확인</summary>

   503은 백엔드 엔드포인트가 없다는 뜻이므로 Service와 EndpointSlice(`kubectl get svc,endpointslice`)부터 본다. 502는 백엔드가 응답하지 않는 것이므로 포트 불일치나 앱 크래시를 확인한다. → 코어 2 (2.3)

   </details>

4. LoadBalancer Service를 서비스마다 만드는 방식의 한계 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   서비스 수만큼 LB·IP·인증서가 늘어 비용과 관리 부담이 곱셈으로 커진다. 또 Service는 L4(TCP/UDP)에서 동작해 "`/api`는 백엔드로" 같은 HTTP 수준 판단을 할 수 없다. → 코어 1 (1.1)

   </details>

5. `pathType: Prefix`에서 `/api`는 `/apifoo`와 매칭되는가? 경로 분리보다 호스트 분리가 권장되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   매칭되지 않는다. Prefix는 경로 세그먼트 단위로 일치시키므로 `/api/users`와만 매칭된다. 경로를 제거해 전달하는 rewrite가 상대 경로와 충돌할 수 있어 `api.example.com` 같은 서브도메인 분리가 더 안전하다. → 코어 1 (1.2)

   </details>

6. Ingress에서 TLS는 어디서 종료되며, 인증서 관리는 어떻게 자동화하나?

   <details markdown="1"><summary>답 확인</summary>

   컨트롤러에서 종료되고 컨트롤러 → 백엔드 Pod 구간은 기본적으로 평문 HTTP다. 인증서는 `kubernetes.io/tls` Secret으로 지정하며, Let's Encrypt 인증서가 90일마다 만료되므로 cert-manager로 애노테이션 한 줄에 발급·갱신을 자동화한다. → 코어 3

   </details>

7. 클라우드 네이티브 컨트롤러와 ingress-nginx는 언제 각각 고르나?

   <details markdown="1"><summary>답 확인</summary>

   클라우드 네이티브는 LB를 클라우드가 운영해 관리 부담이 낮지만 클라우드에 종속된다. ingress-nginx는 컨트롤러 Pod를 직접 운영하지만 어디서나 동일하다. 멀티 클라우드·온프레미스가 섞이면 ingress-nginx로 통일, 단일 클라우드면 네이티브의 통합 이점이 크다. → 코어 4 (4.1)

   </details>

8. Gateway API는 Ingress의 어떤 한계를 어떻게 해결하나?

   <details markdown="1"><summary>답 확인</summary>

   Ingress는 표준 필드가 적어 리다이렉트·레이트 리밋·카나리 같은 기능이 컨트롤러별 애노테이션으로 흩어지고, 인프라 팀과 앱 팀이 같은 리소스를 편집해야 하며, HTTP 위주다. Gateway API는 GatewayClass(인프라 제공자) / Gateway(운영자: 포트·인증서) / HTTPRoute(개발자: 라우팅)로 역할을 나누고 헤더 라우팅·트래픽 분할을 표준 필드로 둔다. → 코어 4 (4.2)

   </details>

### 3. 기억 고리

- **C++ 유추:** Ingress = 게이트웨이 서버의 라우팅 테이블, IngressController = 그 테이블을 읽어 실제로 중계하는 게이트웨이 프로세스. ⚠️ 깨지는 곳: 판단 기준이 HTTP 호스트·경로라서 자체 TCP 프로토콜은 나눌 수 없고, 테이블은 파일이 아니라 API 서버의 리소스라 컨트롤러가 watch로 계속 다시 읽는다.
- **비유:** Ingress = 건물 로비의 층별 안내표, IngressController = 안내표를 읽고 손님을 직접 데려다주는 안내 직원. 안내표만 붙이고 직원이 없으면 아무도 안내받지 못한다(`ADDRESS` 빈칸). ⚠️ 비유가 깨지는 지점: 직원은 안내표를 한 번 읽지만 컨트롤러는 API 서버를 계속 watch해 설정을 재생성하고, 대부분 Service(ClusterIP)를 거치지 않고 Pod IP로 바로 보낸다.
- **묶음(3의 법칙):** Ingress의 3가지 일(호스트·경로 라우팅 / TLS 종료 / 단일 진입점), pathType 3값(Exact / Prefix / ImplementationSpecific), Gateway API 3리소스(GatewayClass / Gateway / HTTPRoute).
- **대칭·순서:** 선언(Ingress) vs 실행(Controller). 5xx 순서화: 502 응답 없음 → 503 엔드포인트 없음 → 504 느림. 진단은 ADDRESS → IngressClass → 로그 → 엔드포인트 순.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Ingress 리소스만 만들면 왜 아무 일도 안 일어나는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리 게이트웨이 서버와 Ingress가 무엇이 같고, 왜 게임 TCP 패킷은 Ingress로 라우팅할 수 없는지"를 설명해 보세요.
- **랜덤 논리 게임:** A "클라우드 네이티브 컨트롤러를 써야 한다(관리 부담 낮음)" vs B "ingress-nginx로 통일해야 한다(이식성)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Ingress와 IngressController, TLS 종료, 5xx 진단을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main/03-애플리케이션-노출과-데이터/11-인그레스와-외부-트래픽-라우팅.md (들어가며, 11.1 Ingress와 IngressController, 11.2 pathType·호스트 기반 라우팅·기본 백엔드, 11.3 TLS 종료와 cert-manager, 11.5 Gateway API, 11.5b 클라우드별 인그레스 통합, 11.6 서비스 메시 판단 기준, 11.7 인그레스 문제 진단)*
