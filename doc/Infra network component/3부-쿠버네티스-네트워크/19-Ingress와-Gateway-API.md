---
title: "19장. Ingress와 Gateway API"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 19
---

# 19장. Ingress와 Gateway API

> **🎮 게임 서버 개발자에게** — 게임 서버 앞에는 보통 접속 게이트(로비 서버, 리버스 프록시, 방화벽 뒤의 L4 로드밸런서)가 있다. 게임은 대개 TCP 연결 하나를 길게 유지하니 L4로 충분했지만, 웹 API·운영 도구·결제 콜백·패치 서버처럼 **HTTP**를 외부에 열 때는 "`/api`는 이 서버, `/`는 저 서버", "이 호스트 이름은 이 서비스"처럼 **요청 내용을 보고 나누는** 일이 필요하다. 그것이 Ingress/Gateway API의 일이다. 결정적으로 다른 점은 Ingress 오브젝트 자체는 **아무 일도 하지 않는 설정 데이터**라는 것이다. 실제로 포트를 열고 요청을 받는 건 별도의 프로그램(IngressController, 즉 리버스 프록시 프로세스)이고, 우리가 만드는 YAML은 그 프로그램에게 주는 "라우팅 주문서"다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - `kubectl get ingress`의 `ADDRESS`가 계속 비어 있다 → 컨트롤러가 이 Ingress를 아직 처리하지 않았다(컨트롤러 미설치, `ingressClassName` 불일치).
> - Service(LoadBalancer)를 30개 만들었더니 LB·IP·인증서가 30개 → HTTP 진입점을 하나로 모아야 한다.
> - 카나리 배포·레이트 리밋 설정이 애노테이션 문자열로 흩어져 컨트롤러를 바꾸면 전부 다시 써야 한다 → Gateway API로의 이동을 검토한다.

## 코어 — 이것만은 100%

> **한 문장:** Ingress(또는 Gateway API 리소스)는 라우팅 규칙을 선언한 **데이터**일 뿐이고, 컨트롤러가 그것을 watch해 자기 리버스 프록시 설정으로 바꿔 L7(호스트·경로) 요청을 Pod IP로 직접 프록시하며, Gateway API는 이 선언을 GatewayClass/Gateway/Route 세 역할로 쪼개 애노테이션 난립을 표준 필드로 대체한다.

1. **컨트롤러는 조정 루프이고, 데이터 경로에 있는지는 구현마다 다르다** — ingress-nginx류는 Ingress/Service/EndpointSlice/Secret을 watch해 `nginx.conf` 같은 프록시 설정을 만들고 리로드(엔드포인트 변경은 동적 갱신)하며, 자기 프록시가 요청을 받아 ClusterIP를 거치지 않고 Pod IP로 직접 프록시한다. AWS Load Balancer Controller 같은 클라우드 네이티브 컨트롤러는 ALB 설정만 유지하고 요청 경로에는 없다.
2. **라우팅 규칙과 TLS 종료** — 호스트/경로 기반 라우팅, `pathType`, TLS는 컨트롤러에서 종료(컨트롤러 → Pod는 평문), cert-manager로 발급·갱신 자동화.
3. **Gateway API: 역할을 세 리소스로 분리** — GatewayClass(인프라 제공자) → Gateway(클러스터 운영자, 리스너·TLS·`allowedRoutes`) → HTTPRoute 등(앱 팀). 헤더 매칭·가중치 분할·URL 재작성이 애노테이션이 아닌 타입 검증되는 표준 필드가 된다.

**이 장의 학습 목표**

- 컨트롤러의 조정 루프와 두 가지 리로드 방식, 그리고 클라우드 네이티브 컨트롤러가 데이터 경로에 없다는 점(ALB의 IP/instance target, readiness와 ALB health check)을 설명한다.
- `rewrite-target`과 상대 경로 함정, TLS 종료 지점·Secret watch·cert-manager 챌린지 선택을 설명한다.
- Ingress의 구조적 한계(애노테이션 난립, 역할 분리 불가)를 세 가지로 말하고, Gateway API가 이를 어떻게 푸는지 설명한다.
- 같은 라우팅 규칙을 Ingress와 Gateway API로 각각 쓰고 모델 차이를 비교한다.
- `ADDRESS`·404/502/503/504 같은 증상에서 원인을 좁힌다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 게임 서버 앞의 리버스 프록시/게이트 프로세스 | IngressController | 외부 연결을 받아 뒤의 서버들로 나눠 준다 | 컨트롤러는 직접 설정 파일을 짜지 않는다. Ingress 오브젝트를 watch해 **스스로 프록시 설정을 생성**하고 리로드한다 |
| 프록시의 설정 파일(`nginx.conf` 등) | Ingress 오브젝트 | 라우팅 규칙을 선언한다 | Ingress만 만들고 컨트롤러가 없으면 **아무 일도 일어나지 않는다**. 설정 파일을 읽을 프로세스가 없는 상태 |
| L4(포트 번호)로만 나누던 로드밸런서 | L7 호스트/경로 라우팅 | 뒤의 서버 집합으로 분배한다 | HTTP의 `Host` 헤더와 경로를 보고 판단한다. 게임의 길게 유지되는 TCP 연결과 달리 요청 단위다 |
| 서버 하나당 공인 IP·포트·인증서 | LoadBalancer Service 30개 | 각각 독립된 진입점이다 | 비용·관리 부담이 곱셈으로 늘어난다. Ingress는 LB 하나 뒤에 규칙으로 모은다 |
| 운영팀과 개발팀이 같은 설정 파일을 같이 편집 | Ingress의 단일 오브젝트 | 역할 경계 없이 한 파일에 몰린다 | Gateway API는 GatewayClass/Gateway/Route로 쪼개 RBAC으로 권한을 나눈다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Ingress YAML을 `kubectl apply` 했는데 `ADDRESS`가 비어 있다. 왜일까?
> 2. 외부에서 HTTP 요청이 들어오면 Ingress 컨트롤러는 ClusterIP를 거쳐 Pod로 갈까, Pod IP로 직접 갈까? 이유는?
> 3. 요청이 `/apifoo`로 오면 `path: /api`(Prefix) 규칙에 매칭될까?
> 4. 10%만 새 버전으로 보내는 카나리를 Ingress에서는 어떻게 하고, 그 방식의 약점은 뭘까?
> 5. 컨트롤러 → 백엔드 Pod 구간은 암호화돼 있을까?
>
> **처리법:** 🛠 실습 `ingress-path.yaml`(경로 기반)·`HTTPRoute` 작성, `kubectl get ingress`, `curl -H "Host: ..."` → 직접 쓰고 실행 · 🗺 관계도 클라이언트 → LB → 컨트롤러(리버스 프록시) → Pod IP, 그리고 GatewayClass → Gateway → HTTPRoute → Service · 📦 카드 `pathType` 3종, Ingress 한계 3가지, 502/503/504 구분, HTTP-01 vs DNS-01 · 유추 비판 "Ingress = 프록시 설정 파일"이라는 유추의 한계

---

## 코어 1. Ingress는 데이터, IngressController는 프로그램

### 1.1 왜 필요한가

**한 줄 요약:** LB 서비스마다 하나 + L4라는 이유는 입문 책과 같고, 이 장은 그 위 L7 진입점의 내부를 본다.

> **입문 책에서 배운 것** — LoadBalancer Service는 서비스 수만큼 LB·IP·인증서가 늘고 L4(TCP/UDP)에서 동작해 `/api`·`/` 같은 HTTP 수준 판단을 못 하므로, Ingress가 진입점 하나에서 호스트·경로로 나눈다([입문 책 23장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/23-Ingress와-외부-트래픽.md)).

```
남북(north-south) 트래픽                동서(east-west) 트래픽
외부 → 클러스터                          서비스 ↔ 서비스

Ingress / Gateway API  ← 이 장          서비스 메시 ← 20장
```

[16장](16-Service와-EndpointSlice.md)·[17장](17-kube-proxy-데이터플레인.md)이 클러스터 내부 L4 로드밸런싱이라면, 이 장은 그 위 L7이다.

### 1.2 Ingress와 IngressController는 다른 것이다

**한 줄 요약:** Ingress는 조정 루프의 desired state일 뿐이고, 컨트롤러가 그것을 자기 프록시 설정으로 바꾼다. 컨트롤러가 없으면 `ADDRESS`가 비어 있다.

> **입문 책에서 배운 것** — Ingress = API 리소스(설정 데이터), IngressController = 실행되는 프로그램(리버스 프록시)이고, `kubectl get ingress`의 `ADDRESS`가 비어 있으면 컨트롤러가 처리하지 않은 것이다([입문 책 23장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/23-Ingress와-외부-트래픽.md)).

원천은 `ADDRESS`가 비어 있다는 것을 "아직 어떤 컨트롤러도 이 오브젝트를 관찰하지 않았다"는 신호로 읽고, 컨트롤러가 없으면 이 상태에서 영원히 멈춘다고 한다. 일반 컨트롤러와 다른 점은 조정의 결과물이 API 서버에 쓰는 status가 아니라 **컨트롤러 자신이 들고 있는 리버스 프록시 프로세스의 설정**이라는 것이다. 다음 절이 그 변환 과정이다.

### 1.3 컨트롤러의 조정 루프와 두 가지 리로드 방식

**한 줄 요약:** watch → 라우팅 상태 재계산 → 프록시 설정 생성 → 리로드(정적 재생성) 또는 동적 API 호출.

```
① API 서버 watch → Ingress, IngressClass, Service, EndpointSlice, Secret 변경 감지
② 자신의 설정 파일(nginx.conf 등)을 재생성
③ 프로세스 리로드
④ 들어오는 요청을 규칙에 따라 백엔드 Pod로 프록시
```

| 방식 | 대표 구현 | 동작 | 대가 |
|---|---|---|---|
| **정적 재생성 + 리로드** | ingress-nginx | 전체 `nginx.conf`를 렌더링하고 워커 프로세스를 리로드 | 규칙이 많을수록 리로드 시간 증가, 리로드 중 커넥션 드레이닝 필요 |
| **동적 제어 API** | Envoy 기반(Contour, Emissary), HAProxy Ingress(런타임 API) | gRPC/HTTP API로 라우팅 테이블만 갱신 | 구현은 복잡하지만 무중단·저지연 갱신 |

ingress-nginx는 엔드포인트 변경 같은 대부분의 변경에서 **Lua 기반 동적 백엔드 갱신**을 쓰고, 새 호스트·TLS 추가 같은 구조적 변경에만 전체 리로드를 한다. 즉 Pod 스케일 인/아웃으로 EndpointSlice만 바뀌면 전체 리로드 없이 백엔드 목록만 교체하고, 호스트·경로 규칙이 바뀔 때만 무거운 재생성이 일어난다.

### 1.4 Pod IP로 직접 프록시한다

**한 줄 요약:** 대부분의 컨트롤러는 ClusterIP·kube-proxy를 건너뛰고 Pod IP로 직접 프록시한다. 홉이 줄고 L7 로드밸런싱을 직접 구현한다.

클라이언트 → Ingress 컨트롤러 → Pod IP로 가고, ClusterIP → (kube-proxy/eBPF) → Pod IP 경로는 피한다. kube-proxy의 iptables/IPVS 홉을 하나 건너뛰므로 지연이 줄고, 세션 고정이나 가중치 라우팅 같은 L7 로드밸런싱을 컨트롤러가 자기 알고리즘으로 구현할 수 있다. 대신 컨트롤러는 EndpointSlice를 스스로 watch해 백엔드 목록을 항상 최신으로 유지할 책임을 진다.

### 1.5 IngressClass와 컨트롤러 선택

**한 줄 요약:** 여러 컨트롤러를 함께 쓸 때 `ingressClassName`으로 어느 것이 처리할지 지정한다. 옛 `kubernetes.io/ingress.class` 애노테이션은 폐기됐다.

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx
  annotations:
    ingressclass.kubernetes.io/is-default-class: "true"    # 기본값 지정
spec:
  controller: k8s.io/ingress-nginx
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: nginx        # ★ 어느 컨트롤러가 처리할지
```

> **⚠️ 이름이 비슷한 두 프로젝트** — `ingress-nginx`(커뮤니티)의 애노테이션 접두사는 `nginx.ingress.kubernetes.io/...`, `nginx-ingress`(F5/NGINX Inc.)는 `nginx.org/...`다. 문서를 찾을 때 어느 쪽인지 확인한다.

### 1.6 클라우드 네이티브 컨트롤러는 데이터 경로에 없다 — ALB 사례

**한 줄 요약:** ingress-nginx류는 컨트롤러 안의 프록시가 요청을 받지만, AWS Load Balancer Controller 같은 컨트롤러는 **LB 설정만 유지**하고 요청은 ALB가 받는다.

> **입문 책에서 배운 것** — 클라우드 네이티브 컨트롤러(AWS Load Balancer Controller·GKE Ingress·AGIC)는 LB를 클라우드가 운영해 관리 부담이 낮지만 클라우드에 종속되고, ingress-nginx는 직접 운영하지만 어디서나 동일하다([입문 책 23장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/23-Ingress와-외부-트래픽.md)).

```
Ingress·Service·대상 상태 → AWS Load Balancer Controller ─(AWS API)→ ALB의 listener·rule·target group
사용자 ─HTTPS→ ALB ─(IP target)→ Pod IP:8080
```

- **위치.** 컨트롤러는 AWS API로 listener·rule·target group·target 등록을 조정할 뿐, 사용자 요청마다 중간에서 처리하지 않는다. 1.3절의 "컨트롤러 안의 프록시"와 다르다.
- **target 방식.** IP target은 Pod IP를 target으로 삼고, Service가 설정상의 backend 연결에 쓰여도 패킷이 반드시 ClusterIP나 NodePort를 경유하지 않는다. Instance target은 ALB → 노드의 NodePort → Pod 경로다.
- **건강 신호 둘.** Pod readiness는 쿠버네티스의 신호, ALB health check는 ALB가 대상에 직접 요청해 판단하는 별도 신호다. Ready여도 검사 path·port·성공 코드나 Security Group이 맞지 않으면 target은 unhealthy일 수 있다. Pod readiness gate는 target health가 준비되기 전에 rollout이 너무 빨리 진행되는 문제를 줄이지만 자동 적용을 가정하지 말고 Namespace label 등 요구를 확인한다.
- **TLS와 실패 지점.** ALB에서 HTTPS를 종료하고 내부를 HTTP로 보낼 수도, backend까지 TLS를 쓸 수도 있다(앱 health endpoint가 인증을 요구하면 LB 검사와 충돌). 컨트롤러의 IAM 권한 부족·subnet 검색 실패·class 불일치면 ALB 생성 단계가 막힌다. "ALB는 있고 503" 순서는 listener와 target group → target 등록·health → Pod 준비 상태와 포트다.

클라우드별 특징(원천 11.5b)은 AWS가 Target Group에 Pod IP 직접 등록과 ACM, GCP가 글로벌 애니캐스트 IP·Cloud CDN과 Google-managed certificates, Azure가 WAF와 Key Vault 연동이다. ingress-nginx와 견줄 때 입문 책 표에 없는 축은 설정 유연성(네이티브는 클라우드 LB의 제약 안, ingress-nginx는 NGINX 설정 전체), 반영 지연(프로비저닝에 수 분 vs 즉시), 비용(LB 요금 vs 노드 리소스 + LB 1개)이다.

---

## 코어 2. 라우팅 규칙과 TLS 종료

### 2.1 정규식 경로와 rewrite — 라우팅의 경계 조건

**한 줄 요약:** 호스트·경로 규칙과 `pathType`은 입문 책과 같고, 이 절은 정규식 경로 + `rewrite-target`이 만드는 변환과 그 함정을 본다.

> **입문 책에서 배운 것** — `host`별 규칙과 `defaultBackend`, `pathType` 세 값(`Exact` / 세그먼트 단위 `Prefix` / `ImplementationSpecific`), `/api`(Prefix)가 `/apifoo`에 안 걸린다는 점, 더 긴 경로 우선, 경로 분리보다 호스트 분리가 안전하다는 권고([입문 책 23장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/23-Ingress와-외부-트래픽.md)). 와일드카드 호스트(`*.dev.localdev.me`)는 한 단계만 매칭된다(원천).

경로 기반(`ingress-path.yaml`, 원천 그대로). `ImplementationSpecific`에서는 nginx가 정규식을 지원하므로 캡처 그룹을 쓸 수 있다.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
    - host: shop.localdev.me            # *.localdev.me → 127.0.0.1 로 해석된다
      http:
        paths:
          - path: /api(/|$)(.*)
            pathType: ImplementationSpecific
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

```bash
curl -H "Host: shop.localdev.me" http://localhost/
# I am WEB
curl -H "Host: shop.localdev.me" http://localhost/api/users
# I am API
```

`rewrite-target: /$2`와 `path: /api(/|$)(.*)`의 조합은 요청 `/api/users/1`을 백엔드에 `/users/1`로 전달한다(`$2`는 캡처 그룹 2번).

> **⚠️ rewrite와 상대 경로의 함정** — HTML 안의 상대 경로(`<img src="logo.png">`)는 브라우저가 `/api/logo.png`로 요청한다. 백엔드는 `/logo.png`를 기대하는데 rewrite가 적용되어 다시 `/logo.png`가 되므로 우연히 동작하기도 하고 안 하기도 한다. **경로 기반 분리보다 서브도메인 분리**(`api.example.com`, `www.example.com`)가 안전하다.

> **🎮 연결** — 게임 서버의 패치 서버·웹 API·GM 도구를 한 도메인으로 모을 때 경로 기반(`/patch`, `/api`, `/gm`)이 편해 보이지만, 위 함정 때문에 서브도메인 분리가 더 안전할 수 있다는 것이 원천의 조언이다.

### 2.2 TLS 종료와 cert-manager

**한 줄 요약:** TLS는 컨트롤러에서 끝나고 컨트롤러 → Pod 구간은 기본 평문이다. 인증서 발급·갱신은 cert-manager가 자동화한다.

> **입문 책에서 배운 것** — `tls` 필드에 `kubernetes.io/tls` Secret(`secretName: shop-tls`)을 지정하면 컨트롤러가 TLS를 풀고, 컨트롤러 → Pod 구간은 기본 평문이며, 90일 만료 인증서는 cert-manager로 자동화한다([입문 책 23장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/23-Ingress와-외부-트래픽.md)).

컨트롤러는 조정 루프 안에서 `Secret`도 watch한다. 인증서가 회전되면 Ingress 오브젝트는 안 바뀌었어도 컨트롤러가 Secret 변경을 감지해 TLS 컨텍스트만 다시 로드한다. 컨트롤러 → Pod 구간을 암호화하려면 백엔드 프로토콜 설정(`nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"`)이나 서비스 메시([20장](20-서비스-메시-데이터플레인.md))가 필요하다.

**cert-manager**는 인증서 발급·갱신을 CRD로 자동화한다. Let's Encrypt 인증서는 90일마다 만료되므로 수동 갱신은 지속 가능하지 않다.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
      - dns01:
          route53:
            region: ap-northeast-2
        selector:
          dnsZones: ["example.com"]
```

| | HTTP-01 | DNS-01 |
|---|---|---|
| 검증 방식 | `/.well-known/acme-challenge/` 경로에 파일 배치 | DNS TXT 레코드 생성 |
| 요구사항 | 외부에서 80번 포트 접근 가능 | DNS 제공자 API 자격증명 |
| 와일드카드 | 불가 | 가능 |
| 내부망 서비스 | 불가 | 가능 |

Ingress에 `cert-manager.io/cluster-issuer: letsencrypt-prod` 애노테이션과 `tls.secretName`을 달아 두면, cert-manager는 Ingress를 감시하다가 `Certificate`를 자동 생성하고, ACME 챌린지를 수행하며, 발급 후 Secret에 저장하고, **만료 30일 전 자동 갱신**한다. 상태는 `kubectl get certificate`, `kubectl get certificaterequest,order,challenge`로 추적한다. 설정을 시험할 때는 Let's Encrypt 프로덕션의 주당 5회 중복 발급 제한 때문에 staging(`https://acme-staging-v02.api.letsencrypt.org/directory`)을 쓴다.

### 2.3 애노테이션 난립이라는 구조적 한계

**한 줄 요약:** 표준 필드는 호스트·경로·TLS·기본 백엔드뿐이고, 나머지는 컨트롤러별 문자열 애노테이션이라 이식성·검증·역할 분리가 모두 안 된다.

`Ingress` 스펙의 표준 필드는 호스트·경로·TLS·기본 백엔드뿐이다. 재시도, 타임아웃, 레이트 리밋, 헤더 기반 라우팅, 트래픽 분할은 전부 컨트롤러별 애노테이션이다.

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
    nginx.ingress.kubernetes.io/limit-rps: "10"
```

카나리는 같은 host·path에 `canary: "true"`와 `canary-weight: "10"`을 단 두 번째 Ingress로 구성한다. Pod 수와 무관하게 정확한 비율이 나가고, 헤더(`canary-by-header`)나 쿠키(`canary-by-cookie`)로 특정 사용자만 새 버전에 보낼 수도 있다. 가중치는 `kubectl annotate ingress web-canary nginx.ingress.kubernetes.io/canary-weight=50 --overwrite`로 바꾼다.

문제는 세 가지다.

1. **이식성이 없다.** `nginx.ingress.kubernetes.io/canary-weight`는 Traefik으로 옮기면 의미가 없다.
2. **타입 검증이 없다.** 애노테이션은 전부 문자열이라 오타가 나도 API 서버는 거부하지 못하고 컨트롤러가 조용히 무시한다.
3. **하나의 오브젝트를 여러 팀이 편집해야 한다.** 인프라 팀의 TLS 설정과 앱 팀의 라우팅 규칙이 같은 오브젝트, 같은 `metadata.annotations` 맵에 뒤섞인다.

세 번째 문제(**역할 분리 불가**)가 Gateway API가 존재하는 근본 이유다.

위 "애노테이션"이 실제로 얼마나 넓은 영역을 덮는지는 ingress-nginx의 원천 목록이 보여 준다. 이 목록 전체가 표준 필드 밖이다.

| 영역 | `nginx.ingress.kubernetes.io/` 애노테이션 |
|---|---|
| 리다이렉트·제한 | `ssl-redirect`, `force-ssl-redirect`, `permanent-redirect`, `proxy-body-size`, `proxy-read-timeout`, `proxy-connect-timeout` |
| 레이트 리밋·세션 | `limit-rps`, `limit-connections`, `affinity: cookie`, `session-cookie-name` |
| CORS·인증·접근 제어 | `enable-cors`, `auth-type`, `auth-url`/`auth-signin`(OAuth2 Proxy 등), `whitelist-source-range` |
| 백엔드 프로토콜 | `backend-protocol`: HTTP, HTTPS, GRPC, AJP |

---

## 코어 3. Gateway API: 역할을 세 리소스로 분리

### 3.1 GatewayClass → Gateway → Route

**한 줄 요약:** 관심사마다 다른 리소스, 다른 소유자를 둔다. 인프라는 GatewayClass/Gateway, 앱 팀은 HTTPRoute.

```
GatewayClass   소유자: 인프라 제공자 / 클러스터 관리자
               "이 클러스터에서 쓸 수 있는 게이트웨이 구현체" (Envoy Gateway, Istio, Contour, Cilium ...)
     │ 참조
Gateway        소유자: 클러스터 운영 팀
               리스너 정의 — 포트, 프로토콜, TLS 인증서, "어느 네임스페이스의 Route를 붙일 수 있는가"
     │ parentRefs로 연결
HTTPRoute / GRPCRoute / TCPRoute / TLSRoute / UDPRoute
               소유자: 애플리케이션 팀
               "이 호스트/경로/헤더는 내 Service로"
```

Ingress에서는 이 세 관심사가 하나의 오브젝트, 하나의 RBAC 대상이었다. Gateway API에서는 RBAC으로 권한을 자연스럽게 나눌 수 있다. 앱 팀에게는 자기 네임스페이스의 `HTTPRoute` 쓰기 권한만 주고 `Gateway`/`GatewayClass`는 인프라 팀만 건드리게 한다.

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

`allowedRoutes` 덕분에 `Gateway` 소유자는 **어느 네임스페이스가 자신의 리스너를 쓸 수 있는지 명시적으로 통제**한다. Ingress에는 이런 개념이 없다. 같은 `IngressClass`를 쓰는 모든 `Ingress`가 무조건 처리 대상이다.

네임스페이스를 넘는 참조에는 `ReferenceGrant` 같은 명시적 허용 모델이 관여할 수 있다고 원천(qustion-book)은 적는다. Gateway API는 CRD와 지원 컨트롤러가 필요하고, EKS에서 어떤 기능이 지원되는지는 선택한 구현의 버전으로 확인한다.

### 3.2 애노테이션이 스펙 필드가 됐다

**한 줄 요약:** 헤더 매칭·가중치 분할·경로 재작성이 타입 검증되는 표준 필드라 컨트롤러를 바꿔도 같게 해석된다.

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
    # 헤더 매칭 — 표준 필드
    - matches:
        - path: { type: PathPrefix, value: /api }
          headers:
            - name: X-Canary
              value: "true"
      backendRefs:
        - name: api-v2
          port: 80

    # 가중치 트래픽 분할 — 표준 필드
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: web-v1
          port: 80
          weight: 90
        - name: web-v2
          port: 80
          weight: 10

    # 요청 헤더/경로 변형 — 표준 필드
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

`backendRefs`가 가리키는 것은 여전히 평범한 `Service`다. Gateway API는 Service를 대체하지 않으며, 구현체가 EndpointSlice 기반 백엔드 목록을 watch해 쓴다. 다만 대부분 IngressController처럼 kube-proxy를 거치지 않고 Pod IP로 직접 프록시한다.

> **[보충]** 같은 "`/old` → `/new`" 변형을 textbook은 `RequestRedirect` 필터(`statusCode: 301`)로, internals는 `URLRewrite`로 보여 준다. 둘은 서로 다른 필터(전자는 클라이언트에게 리다이렉트 응답, 후자는 프록시가 경로를 바꿔 전달)이며 충돌이 아니라 예시의 차이다. 이 장은 위 표의 "경로 재작성"에 맞춰 `URLRewrite`를 쓴다.

### 3.3 Ingress와 Gateway API를 나란히

**한 줄 요약:** 규칙은 같아도 Gateway API는 리소스가 3개로 늘어나는 대신 소유자가 나뉜다.

원천 실습은 같은 규칙(`/api` → api, `/` → web)을 Ingress 1개와 Gateway API 3개(GatewayClass, Gateway, HTTPRoute)로 각각 작성해 비교한다. 3.2절의 표가 그 관찰 결과이고, 하나가 더 있다. 컨트롤러를 바꿀 때 Ingress는 애노테이션을 전부 다시 쓰지만 Gateway API는 스펙을 그대로 두고 `gatewayClassName`만 교체한다.

### 3.4 지원 상태와 도입 시점

**한 줄 요약:** 핵심 리소스는 GA이지만 스펙 GA와 컨트롤러 구현 완성도는 별개다. 신규라면 Gateway API를 먼저 검토하고, 기존 Ingress는 서두르지 않는다.

- `Gateway`/`GatewayClass`/`HTTPRoute`는 v1.0(2023년 10월)에 GA됐다. internals 원천은 이후 `GRPCRoute`와 `TLSRoute`도 Standard 채널로 승격됐고, 2026년 6월 출시된 v1.6에서는 `TCPRoute`/`UDPRoute`까지 승격되어 핵심 라우트 타입이 모두 GA라고 적는다. 반면 textbook은 v1.0 GA 시점까지만 적는다.
- **스펙의 GA와 특정 컨트롤러의 구현 완성도는 별개**다. 운영 전에 쓰는 컨트롤러가 해당 채널을 실제로 구현했는지 확인한다.
- 구현체: Envoy Gateway, Istio, Contour, Cilium(eBPF 데이터플레인 위, [22장](22-eBPF-데이터플레인과-Cilium.md)), NGINX Gateway Fabric, Traefik, GKE Gateway Controller, AWS Gateway API Controller.
- 신규 프로젝트: Gateway API를 우선 검토. 기존 Ingress 운영 중: 서둘 필요 없고 Ingress는 계속 지원되며, 애노테이션 지옥이나 팀 간 권한 분리가 필요해질 때 이동한다. `ingress2gateway`라는 변환 도구가 있다.

CRD 설치(표준 채널)의 형태는 `kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml`이다(internals 원천 기준 버전).

> **[보충]** 버전 번호가 두 원천에서 다르다(textbook `v1.2.0`, internals `v1.6.1`). 더 최신인 internals를 따랐고, 설치 시에는 컨트롤러가 지원하는 버전을 확인한다.

---

## 실무 적용

### 체크리스트

- [ ] Ingress만 만들고 끝내지 않는다. 컨트롤러가 설치되어 있고 `ingressClassName`이 맞는지 확인한다(`ADDRESS`가 비어 있으면 처리되지 않은 것).
- [ ] `ingress-nginx`와 F5의 `nginx-ingress`를 혼동하지 않는다(애노테이션 접두사가 다르다).
- [ ] `pathType: Prefix`는 세그먼트 단위 매칭이다(`/apifoo`는 `/api`에 안 걸린다). 상대 경로 문제가 있는 앱은 경로 기반 대신 서브도메인으로 나눈다.
- [ ] TLS Secret은 Ingress와 같은 네임스페이스에 둔다. TLS는 컨트롤러에서 끝나므로 컨트롤러 → Pod 구간 암호화가 필요하면 별도로 구성한다.
- [ ] 인증서는 cert-manager로 자동화하고, 와일드카드·내부망 서비스는 DNS-01을 쓴다. 시험은 staging Issuer로 한다.
- [ ] 애노테이션에 의존하는 기능(카나리, 레이트 리밋)이 늘어나면 Gateway API로의 이동을 검토한다. 이동 전에 컨트롤러의 Gateway API 구현 상태를 확인한다.
- [ ] 앱 팀과 인프라 팀의 권한을 나눠야 하면 Gateway(인프라)와 HTTPRoute(앱)로 분리하고 `allowedRoutes`로 허용 네임스페이스를 통제한다.

### 시나리오로 확인하기

1. **상황:** 새 서비스의 Ingress를 만들었는데 `kubectl get ingress`의 `ADDRESS`가 5분째 비어 있다.
   **질문:** 의심 부품과 확인 방법은?

   <details markdown="1"><summary>답 확인</summary>

   Ingress는 데이터일 뿐이라 컨트롤러가 처리해야 `ADDRESS`가 채워진다. `kubectl get ingressclass`로 클래스가 존재하는지, `kubectl get ingress <name> -o jsonpath='{.spec.ingressClassName}'`로 값이 맞는지, `kubectl describe ingress <name>`의 Events와 `kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller --tail=50`으로 컨트롤러가 인식했는지 확인한다. 원인은 `ingressClassName` 불일치나 컨트롤러 미설치가 흔하다. → 코어 1

   </details>

2. **상황:** EKS에서 ALB Ingress를 만들었다. ALB는 생겼고 Pod도 모두 Ready인데 외부 요청이 503이다. (ingress-nginx라면 404/502/503/504가 호스트·경로 매칭, 포트·앱 크래시, 엔드포인트, 지연 문제를 가리킨다는 구분은 입문 책과 같다.)
   **질문:** 어떤 순서로 보나?

   <details markdown="1"><summary>답 확인</summary>

   ALB 쪽 경로를 순서대로 본다. listener와 target group → target 등록과 health → Pod 준비 상태와 포트다. Pod가 Ready여도 ALB health check의 path·port·성공 코드나 Security Group이 맞지 않으면 target이 unhealthy라 503이 날 수 있다. ALB가 아예 없었다면 컨트롤러와 class → reconcile 로그 → IAM·subnet 조건 → AWS 자원 순으로 간다. ingress-nginx 쪽이라면 컨트롤러 Pod에서 `cat /etc/nginx/nginx.conf`로 생성된 설정을, `curl -s http://web.default.svc.cluster.local`로 백엔드 직접 접근을 확인할 수 있다. → 코어 1 (1.6)

   </details>

3. **상황:** 클라우드 LB가 TLS를 종료하고 HTTP로 ingress-nginx에 넘기는 구조에서 브라우저가 리다이렉트 루프에 빠진다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   컨트롤러가 `ssl-redirect`로 "HTTP네? HTTPS로 리다이렉트!"를 반복하기 때문이다. 원천은 `force-ssl-redirect: false`로 두고, `X-Forwarded-Proto` 헤더를 신뢰하도록 설정해야 한다고 설명한다. 클라우드 환경에서 흔하다. → 코어 2

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
[코어 1] ADDRESS 비어 있음 = ( ? )가 처리하지 않음
  컨트롤러 watch 대상: Ingress, IngressClass, Service, ( ? ), Secret
  리로드 2갈래: 정적 재생성 + ( ? ) / 동적 ( ? ) 호출
  백엔드로 갈 때: ClusterIP가 아니라 ( ? )로 직접 → 홉 하나 감소
  ALB 컨트롤러: 요청 경로에 ( ? ) / LB 설정만 유지, target 방식 IP vs ( ? )
  건강 신호 2: Pod ( ? ) / ALB ( ? ), 둘이 어긋나면 target unhealthy

[코어 2] rewrite-target: /$( ? ) + path /api(/|$)(.*) → /api/users/1이 백엔드엔 ( ? )
  경로 기반 분리의 함정: HTML ( ? ) 경로 → ( ? ) 분리가 안전
  TLS는 ( ? )에서 종료, 그 뒤 구간은 기본 ( ? )
  cert-manager 챌린지: HTTP-01(와일드카드 ( ? )) / DNS-01(와일드카드 ( ? ))
  Ingress 한계 3: 이식성 ( ? ) / 타입 ( ? ) / 역할 ( ? )

[코어 3] Gateway API 3계층: ( ? ) → ( ? ) → ( ? )
  소유자: 인프라 제공자 / 클러스터 운영 / ( ? )
  Route가 Gateway에 붙는 필드 ( ? ), 허용 통제 ( ? )
  가중치 분할 필드: backendRefs[].( ? )
```

### 2. 인출 질문

1. Ingress 오브젝트와 IngressController의 차이는? Ingress만 만들면 어떻게 되는가?

   <details markdown="1"><summary>답 확인</summary>

   Ingress는 "이렇게 라우팅해 달라"는 API 리소스(설정 데이터), IngressController는 그 선언을 읽어 실제로 라우팅하는 리버스 프록시 프로그램이다. Ingress만 만들면 etcd에 저장된 데이터일 뿐 아무 일도 일어나지 않고 `ADDRESS`가 비어 있다. → 코어 1 (1.2)

   </details>

2. 컨트롤러가 엔드포인트만 바뀔 때와 라우팅 규칙이 바뀔 때 다르게 동작하는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   엔드포인트 변경은 대부분 전체 리로드 없이 백엔드 목록만 교체하고(ingress-nginx는 Lua 기반 동적 갱신), 호스트·경로·TLS 같은 구조적 변경에서만 전체 `nginx.conf`를 재생성해 리로드한다. 빈번한 변경을 가볍게 전파한다는 EndpointSlice의 목적이 재사용된 것이다. → 코어 1 (1.3)

   </details>

3. 대부분의 컨트롤러가 ClusterIP를 거치지 않고 Pod IP로 직접 가는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   kube-proxy의 iptables/IPVS 홉을 하나 건너뛰어 지연이 줄고, 세션 고정·가중치 같은 L7 로드밸런싱을 컨트롤러가 자기 알고리즘으로 직접 구현할 수 있다. 대신 EndpointSlice를 직접 watch해야 한다. → 코어 1 (1.4)

   </details>

4. `rewrite-target: /$2`와 `path: /api(/|$)(.*)` 조합에서 `/api/users/1`은 백엔드에 어떤 경로로 가며, 왜 경로 기반 분리보다 서브도메인 분리가 안전한가?

   <details markdown="1"><summary>답 확인</summary>

   `$2`(캡처 그룹 2번)가 `/users/1`이므로 백엔드는 `/users/1`을 받는다(`ImplementationSpecific`에서 nginx가 정규식을 지원한다). HTML의 상대 경로(`logo.png`)는 브라우저가 `/api/logo.png`로 요청하고 rewrite가 다시 `/logo.png`로 만들어 우연히 되기도 안 되기도 하므로, `api.example.com`/`www.example.com`처럼 호스트로 나누는 편이 안전하다. → 코어 2 (2.1)

   </details>

5. TLS 종료 지점과 컨트롤러 → Pod 구간의 암호화는?

   <details markdown="1"><summary>답 확인</summary>

   TLS는 컨트롤러에서 종료되고 컨트롤러 → Pod 구간은 기본 평문 HTTP다. 암호화하려면 `backend-protocol: "HTTPS"` 같은 설정이나 서비스 메시가 필요하다. → 코어 2 (2.2)

   </details>

6. Ingress의 구조적 한계 세 가지와, 그중 Gateway API가 존재하는 근본 이유는?

   <details markdown="1"><summary>답 확인</summary>

   ① 애노테이션 이식성 없음 ② 타입 검증 없음(오타가 조용히 무시됨) ③ 하나의 오브젝트를 여러 팀이 편집(역할 분리 불가). 근본 이유는 ③이다. → 코어 2 (2.3)

   </details>

7. Gateway API의 세 리소스와 소유자, Route를 붙일 수 있는 네임스페이스를 통제하는 방법은?

   <details markdown="1"><summary>답 확인</summary>

   GatewayClass(인프라 제공자/클러스터 관리자), Gateway(클러스터 운영 팀: 리스너·TLS·허용 Route), HTTPRoute 등(앱 팀). Route는 `parentRefs`로 Gateway에 붙고, Gateway 리스너의 `allowedRoutes.namespaces`(예: `from: Selector`)가 어느 네임스페이스의 Route를 허용할지 통제한다. → 코어 3 (3.1)

   </details>

8. 기존 Ingress를 운영 중인 팀은 Gateway API로 언제 이동하는가?

   <details markdown="1"><summary>답 확인</summary>

   서두를 필요는 없다. Ingress는 계속 지원된다. 애노테이션 지옥에 시달리거나 팀 간 권한 분리가 필요해질 때 이동하며, 변환 도구 `ingress2gateway`가 있다. 스펙 GA와 컨트롤러 구현 완성도는 별개이므로 이동 전 구현 상태를 확인한다. → 코어 3 (3.4)

   </details>

9. ALB 컨트롤러는 ingress-nginx와 요청 경로에서 어떤 위치가 다르고, target이 unhealthy인데 Pod는 Ready일 때 무엇을 보는가?

   <details markdown="1"><summary>답 확인</summary>

   ingress-nginx는 컨트롤러 안의 프록시가 요청을 받지만, ALB 컨트롤러는 listener·rule·target group·target 등록만 조정하고 요청은 ALB가 받는다(IP target이면 Pod IP로 직행, instance target이면 ALB → NodePort → Pod). Pod readiness와 ALB health check는 별도 신호이므로 ALB가 검사하는 path·port·성공 코드와 Security Group을 확인한다. → 코어 1 (1.6)

   </details>

### 3. 기억 고리

- **C++ 유추:** IngressController = nginx 같은 리버스 프록시 프로세스, Ingress = 그 프록시의 설정 파일. ⚠️ 깨지는 곳: 설정 파일을 사람이 편집·리로드하지 않는다. 컨트롤러가 오브젝트를 watch해 **자동으로 생성·리로드**하고, 엔드포인트 변경은 리로드조차 없이 반영한다. 또 컨트롤러는 Pod IP로 직접 프록시하므로 ClusterIP 경로와 다르다.
- **비유:** Ingress = 건물 1층 안내 데스크의 방문객 응대 매뉴얼. 매뉴얼(Ingress)만 있고 안내 직원(컨트롤러)이 없으면 아무도 안내받지 못한다. ⚠️ 비유가 깨지는 지점: Gateway API는 매뉴얼을 "건물 운영팀(Gateway)"과 "입주 회사(Route)"가 따로 작성하게 쪼갠 것이라 단일 매뉴얼 비유에 담기지 않는다.
- **묶음(3의 법칙):** 코어 3개(데이터 vs 프로그램 / 규칙·TLS / Gateway 3계층), Ingress 한계 3개(이식성·검증·역할), Gateway API 3계층(GatewayClass → Gateway → Route), `pathType` 3종.
- **대칭·순서:** 남북(Ingress/Gateway) ↔ 동서(서비스 메시). 502(백엔드가 응답 안 함) / 503(엔드포인트 없음) / 504(백엔드가 느림) / 404(매칭 실패)의 대비. HTTP-01(와일드카드 불가) ↔ DNS-01(가능).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Ingress YAML 한 장이 실제 HTTP 요청 처리로 바뀌기까지"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "nginx 설정 파일을 직접 안 고치는데 어떻게 라우팅이 바뀌는가, 그리고 그 요청은 왜 ClusterIP를 거치지 않는가"를 설명해 보세요.
- **랜덤 논리 게임:** A "신규 클러스터라면 Ingress가 아니라 Gateway API로 시작해야 한다" vs B "이미 잘 도는 Ingress는 애노테이션이 불편해도 그대로 두는 게 낫다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Ingress와 Gateway API의 차이를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/17-Ingress-Gateway-API-서비스메시.md (17.1 IngressController 내부 동작, 17.2 Gateway API 모델과 Ingress 대비 장점, 실습 Ingress와 Gateway API 나란히 비교); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/11-인그레스와-외부-트래픽-라우팅.md (11.1 Ingress와 IngressController, 11.2 실습, 11.3 TLS 종료와 cert-manager, 11.4 유용한 애노테이션, 11.5 Gateway API, 11.5b 클라우드별 인그레스 통합, 11.7 인그레스 문제 진단); kubernetes-qustion-book/02_심화/06_네트워크와_서비스_노출.md (5. Ingress는 규칙, ALB는 실제 요청을 받는 자원: IP/instance target, 컨트롤러의 위치, ReferenceGrant); kubernetes-qustion-book/02_심화/16_EKS의_네트워크_스토리지_확장.md (3. ALB: 두 종류의 건강 신호, readiness gate, TLS 종료 위치)*
