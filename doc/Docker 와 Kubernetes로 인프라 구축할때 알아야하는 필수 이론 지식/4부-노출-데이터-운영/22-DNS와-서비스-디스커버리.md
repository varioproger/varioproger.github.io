---
title: "22장. DNS와 서비스 디스커버리"
parent: "4부. 서비스 노출, 데이터, 운영"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 22
---

# 22장. DNS와 서비스 디스커버리

> **🎮 게임 서버 개발자에게** — 게임 서버는 보통 설정 파일에 DB·캐시·다른 서버의 IP:포트를 적어 두고 시작할 때 읽는다. 쿠버네티스에서는 그 주소록이 클러스터 DNS(CoreDNS)이고, 서버 코드는 `getaddrinfo("payments")`처럼 이름만 넘기면 된다. 결정적 차이는 Pod 안의 resolver 설정(`search`, `ndots:5`) 때문에 **이름 하나가 여러 번의 DNS 질의로 불어날 수 있다**는 점이다. 외부 API 호출이 이유 없이 느리다면 코드가 아니라 이 규칙을 의심해야 한다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 결제 검증·푸시 같은 외부 API 호출이 유난히 느리고 CoreDNS CPU가 높다 → ndots:5 함정.
> - 보안 강화로 default-deny NetworkPolicy를 걸자마자 모든 서버 간 통신이 끊긴다 → DNS(53번) 예외 누락.
> - 다른 네임스페이스의 DB에 짧은 이름으로 붙으려다 실패하거나, DNS 조회가 정확히 5초씩 걸린다.

## 코어 — 이것만은 100%

> **한 문장:** Pod는 resolv.conf에 박힌 CoreDNS(kube-dns Service)에 `<service>.<namespace>.svc.cluster.local` 이름으로 Service를 묻고, search 도메인 덕에 짧은 이름이 통하지만 ndots:5 때문에 외부 도메인 조회가 여러 번의 질의로 불어나므로 끝에 점을 붙인 FQDN으로 막는다.

1. **이름으로 찾고, 답은 CoreDNS가 한다** — 서비스 찾기는 DNS 이름으로 한다(환경변수는 Pod 시작 시점의 스냅샷). 모든 Pod의 resolv.conf에 kube-dns Service IP가 들어가고, CoreDNS가 플러그인 체인으로 응답한다.
2. **이름 규칙이 곧 응답 규칙** — Service FQDN은 `<service>.<namespace>.svc.cluster.local`. 일반 Service는 ClusterIP 하나, 헤드리스는 모든 Ready Pod IP, ExternalName은 CNAME을 돌려준다.
3. **search + ndots가 질의 수를 정한다** — 점이 ndots(기본 5)개 미만인 이름은 search 접미사를 먼저 붙여 보므로 외부 조회 1회가 최대 8개 쿼리가 된다. 해결은 끝 마침표 FQDN, ndots 낮추기, 내부도 FQDN 쓰기. dnsPolicy가 이 설정의 출처를 정한다.
4. **DNS 장애는 순서대로 좁힌다** — CoreDNS → kube-dns EndpointSlice → resolv.conf → NetworkPolicy(53번) → conntrack 경합(NodeLocal DNSCache).

**이 장에서 배우는 것 (원래 목차)**

- 클러스터 DNS(CoreDNS)가 어디서 어떻게 동작하는지 → 코어 1
- Service와 Pod의 DNS 이름(FQDN) 규칙 → 코어 2
- Pod 안의 `/etc/resolv.conf`(search, ndots)가 왜 중요한지 → 코어 3
- 외부 도메인 조회가 느려지는 "ndots:5 함정"과 해결 방법 → 코어 3

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 시작 시 설정 파일에서 다른 서버 주소를 읽어 두기 | 환경변수 방식 디스커버리 | 프로세스 시작 시점에 주소가 고정된다 | 시작 후 생긴 Service는 영영 모른다. 그래서 쿠버네티스에서는 요청 시점에 해석하는 DNS를 쓴다 |
| `getaddrinfo()`로 호스트 이름 해석 | Pod 안의 DNS 조회 | 같은 libc resolver가 `/etc/resolv.conf`를 읽는다 | Pod의 resolv.conf에는 search 3개와 `ndots:5`가 박혀 있어, 점이 적은 외부 이름은 클러스터 접미사부터 붙여 여러 번 질의한다 |
| 사내 DNS 서버 / hosts 파일 | CoreDNS | 이름 → IP 매핑을 응답한다 | 레코드를 사람이 등록하지 않는다. `kubernetes` 플러그인이 API를 watch해 Service/Pod가 생기고 사라지는 대로 자동 응답한다 |
| 해석한 IP를 프로세스 수명 내내 캐시 | 일반 vs 헤드리스 Service 응답 | 일반 Service의 ClusterIP는 Service가 살아 있는 한 그대로라 오래 써도 된다 | 헤드리스는 Pod IP 목록 자체를 돌려주므로, Pod가 재생성되면 IP가 바뀐다. 이름(`db-0.db-headless...`)은 유지되니 다시 해석해야 한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Pod 안에서 `curl web`만 쳐도 Service에 닿는 이유는 무엇일까?
> 2. 환경변수로 Service 주소를 받는 방식은 왜 실무에서 거의 안 쓸까?
> 3. Pod에서 `google.com` 한 번 조회하면 DNS 쿼리는 몇 번 나갈까?
> 4. NetworkPolicy를 적용한 직후 "모든 것이 안 되는" 사고는 왜 생길까?
>
> **처리법:** 🛠 실습 `kubectl run t --rm -it --image=busybox --restart=Never -- cat /etc/resolv.conf`, Corefile 조회, `dig <service>.<namespace>.svc.cluster.local`, `dnsConfig`의 ndots 설정 → 바로 실행 · 🗺 관계도 Pod resolv.conf(search, ndots, nameserver) → kube-dns Service → CoreDNS 플러그인 체인(kubernetes / forward / cache) → 상위 DNS · 📦 카드로 `kube-dns` IP 예시 `10.96.0.10`, 포트 53/9153, FQDN 형식, dnsPolicy 4값, CoreDNS 기본 replica 2

---

## 코어 1. 이름으로 찾고, 답은 CoreDNS가 한다

### 1.1 서비스 디스커버리란

**한 줄 요약:** DNS는 요청 시점에 해석되어 순서 의존성이 없고, 환경변수는 Pod 시작 시점의 스냅샷이라 실무에서 쓸 이유가 없다.

Pod는 Service의 ClusterIP를 외우지 않는다. 이름으로 찾는다. 서비스를 찾는 방법은 두 가지다.

- **DNS 방식** (항상 선호): 요청 시점에 즉시 해석되므로 순서 의존성이 없다.
- **환경변수 방식**: kubelet이 Pod 시작 시점에 이미 존재하던 Service의 환경변수(`PAYMENTS_SERVICE_HOST` 등)를 주입한다. **Pod 시작 시점의 스냅샷**이라, Service가 Pod보다 나중에 만들어지면 환경변수에 아예 없다. 실무에서 쓸 이유는 사실상 없다.

```bash
curl http://payments.default.svc.cluster.local
curl http://payments      # 같은 네임스페이스면 짧은 이름으로도 가능
```

`curl web` 같은 짧은 명령 하나가 실제로는 여러 단계를 거친다. 이 장은 그 과정을 설명한다.

### 1.2 CoreDNS

**한 줄 요약:** kube-system의 `coredns` Pod가 클러스터 DNS이고, 그 앞의 `kube-dns` Service IP가 모든 Pod의 resolv.conf에 들어간다.

클러스터 DNS는 `kube-system` 네임스페이스의 `coredns` Pod가 담당한다.

```bash
kubectl get deployment coredns -n kube-system
kubectl get svc kube-dns -n kube-system
```

```
NAME       TYPE        CLUSTER-IP   PORT(S)
kube-dns   ClusterIP   10.96.0.10   53/UDP,53/TCP,9153/TCP
```

Service 이름이 `kube-dns`인 것은 예전에 kube-dns라는 다른 구현을 쓰던 시절의 이름이 남은 것이고, 실제 구현은 CoreDNS다. 이 IP가 모든 Pod의 `/etc/resolv.conf`에 들어간다.

```bash
kubectl run t --rm -it --image=busybox --restart=Never -- cat /etc/resolv.conf
```

```
search default.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

### 1.3 Corefile — 플러그인 체인

**한 줄 요약:** `kubernetes` 플러그인이 API를 watch해 클러스터 레코드를 답하고, 나머지는 `forward`가 노드의 DNS로 넘긴다.

CoreDNS의 설정은 `kube-system`의 ConfigMap(`coredns`)에 담겨 있고, **플러그인 체인** 방식이다.

```bash
kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}'
```

| 플러그인 | 역할 |
|---|---|
| `kubernetes` | **핵심.** 쿠버네티스 API를 watch해 Service/Pod 레코드를 응답 |
| `forward` | 처리 못 한 질의를 상위 DNS로 전달 (`forward . /etc/resolv.conf` → 노드의 DNS 설정) |
| `cache` | 응답 캐싱 |
| `health`, `ready` | `/health`, `/ready` 엔드포인트 |
| `reload` | Corefile 변경 시 자동 재적용 |

클러스터 도메인이 아닌 질의(`google.com` 등)는 `forward`에 의해 노드의 DNS 설정으로 전달된다. CoreDNS의 기본 replica는 2이며, 클러스터가 커지면 `kubectl scale deployment coredns -n kube-system --replicas=4`처럼 늘릴 수 있다.

## 코어 2. 이름 규칙이 곧 응답 규칙

### 2.1 Service 레코드

**한 줄 요약:** `<service>.<namespace>.svc.<cluster-domain>` — 일반은 ClusterIP 하나, 헤드리스는 Ready Pod IP 전부, ExternalName은 CNAME.

```
<service>.<namespace>.svc.<cluster-domain>
web.default.svc.cluster.local
postgres.database.svc.cluster.local
```

| 대상 | 레코드 타입 | 응답 |
|---|---|---|
| 일반 Service | A / AAAA | ClusterIP 하나 |
| 헤드리스 Service | A / AAAA | **모든 Ready Pod IP** |
| ExternalName | CNAME | 외부 도메인 |

이름 있는 포트는 SRV 레코드(`_http._tcp.web.default.svc.cluster.local`)로 조회할 수 있다.

### 2.2 StatefulSet Pod 레코드

**한 줄 요약:** 헤드리스 서비스가 있으면 StatefulSet Pod마다 재생성돼도 유지되는 고유 이름이 생긴다.

헤드리스 서비스가 있으면 StatefulSet의 각 Pod가 고유한 이름을 얻는다.

```
<pod-name>.<headless-service>.<namespace>.svc.cluster.local
db-0.db-headless.default.svc.cluster.local  → 10.244.1.5
db-1.db-headless.default.svc.cluster.local  → 10.244.2.6
```

이 이름은 Pod가 재생성되어도 유지된다(IP는 바뀌어도 이름은 그대로). 일반 Pod도 `10-244-1-3.default.pod.cluster.local` 형태의 IP 기반 A 레코드를 갖지만 거의 쓸 일이 없다.

## 코어 3. search + ndots가 질의 수를 정한다

### 3.1 resolv.conf와 search 도메인

**한 줄 요약:** `search`는 짧은 이름에 순서대로 붙여 볼 접미사 목록이라, 같은 네임스페이스에서는 `web`처럼 짧게 쓸 수 있다.

`search`는 짧은 이름에 **순서대로 붙여 볼 접미사 목록**이다. `curl web`을 실행하면 resolver가 이렇게 시도한다.

```
① web.default.svc.cluster.local     ← 성공! (같은 네임스페이스)
```

`curl postgres.database`라면:

```
① postgres.database.default.svc.cluster.local   ✗ NXDOMAIN
② postgres.database.svc.cluster.local           ✓ 성공
```

덕분에 같은 네임스페이스에서는 `web`처럼 짧게 쓸 수 있다.

### 3.2 ndots:5의 함정 — 숨은 성능 문제

**한 줄 요약:** 점이 5개 미만인 `google.com`도 search 접미사부터 붙여 보므로 4번 시도 × A/AAAA = 최대 8개 쿼리가 나간다.

`ndots`는 "이름에 점이 이 개수 **미만**이면 먼저 search 도메인을 붙여 본다"는 설정이고, 쿠버네티스 기본값은 **5**다. `google.com`(점 1개)을 조회하면:

```
① google.com.default.svc.cluster.local   ✗ NXDOMAIN
② google.com.svc.cluster.local           ✗ NXDOMAIN
③ google.com.cluster.local               ✗ NXDOMAIN
④ google.com                             ✓ 성공
```

질의가 4번 발생하고, 각 질의는 IPv4(A)와 IPv6(AAAA)를 함께 보내므로 **외부 도메인 1회 조회에 최대 8개 DNS 쿼리**가 나간다. 증상은 다음과 같다.

- 외부 API 호출이 유난히 느리다
- CoreDNS의 CPU 사용률이 높다
- 트래픽이 늘면 DNS 타임아웃이 발생한다

### 3.3 해결 방법 3가지

**한 줄 요약:** ① 끝에 마침표(FQDN) ② `dnsConfig`로 ndots 낮추기 ③ 클러스터 내부도 FQDN으로.

**① FQDN 끝에 마침표를 붙인다 (가장 간단).** 끝의 점은 "이것이 완전한 이름"이라는 표시라서 search 도메인을 건너뛴다.

```yaml
env:
  - name: EXTERNAL_API
    value: "api.example.com."      # 끝에 점
```

**② ndots를 낮춘다.**

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "1"
```

단, `ndots:1`로 하면 `postgres.database` 같은 두 단계 이름도 search를 거치지 않으므로 매니페스트에서 FQDN을 써야 한다.

**③ 클러스터 내부도 FQDN으로 쓴다.** 예: `postgres.database.svc.cluster.local.` — 가장 명시적이고 빠른 방법이다.

### 3.4 dnsPolicy — resolv.conf를 어디서 받나

**한 줄 요약:** 기본은 `ClusterFirst`. `Default`는 이름과 달리 노드의 resolv.conf를 쓰는 값이고, `hostNetwork: true`면 `ClusterFirstWithHostNet`이 필요하다.

Pod가 어떤 DNS 설정을 받을지 정한다.

| 값 | 동작 |
|---|---|
| `ClusterFirst` (기본) | 클러스터 DNS(CoreDNS) 사용. 외부 도메인은 CoreDNS가 상위로 forward |
| `ClusterFirstWithHostNet` | `hostNetwork: true`인 Pod에서 클러스터 DNS를 쓰고 싶을 때 필요 |
| `Default` | 노드의 `/etc/resolv.conf`를 그대로 사용. 클러스터 DNS를 안 씀 (이름이 헷갈린다) |
| `None` | 모두 무시하고 `dnsConfig`로만 설정 |

`hostNetwork: true`를 쓰면 `dnsPolicy`가 `Default`처럼 동작해 클러스터 Service 이름을 해석하지 못하므로 `ClusterFirstWithHostNet`을 명시해야 한다.

## 코어 4. DNS 장애는 순서대로 좁힌다

### 4.1 NodeLocal DNSCache (개요)

**한 줄 요약:** conntrack 경합으로 인한 "정확히 5초" 지연과 다른 노드까지의 홉을, 노드마다 둔 DNS 캐시로 줄인다.

모든 Pod의 DNS 질의가 CoreDNS Pod로 가면 두 가지 문제가 생길 수 있다. 하나는 UDP 질의가 많을 때 conntrack 경합으로 패킷이 유실되어 **DNS 조회가 정확히 5초 걸리는** 증상이고, 다른 하나는 다른 노드의 CoreDNS까지 가는 네트워크 홉이다. NodeLocal DNSCache는 각 노드에 DaemonSet으로 DNS 캐시를 두어, 캐시 히트 시 노드를 벗어나지 않게 한다.

### 4.2 DNS 장애 진단 순서

**한 줄 요약:** CoreDNS 상태 → kube-dns Service/EndpointSlice → Pod의 resolv.conf → NetworkPolicy(53번) → 간헐 SERVFAIL(conntrack) 순으로 좁힌다.

```bash
kubectl exec -it <pod> -- cat /etc/resolv.conf
kubectl exec -it <pod> -- dig <service>.<namespace>.svc.cluster.local
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

```
DNS 조회 실패
  ├─ CoreDNS Pod가 Running/Ready인가?
  ├─ kube-dns Service/EndpointSlice가 정상인가?
  ├─ Pod 내부 /etc/resolv.conf가 정상인가?
  ├─ 특정 네임스페이스에서만 실패하는가? → NetworkPolicy가 DNS(53번 포트)를 막고 있지 않은가
  └─ 간헐적 SERVFAIL인가? → conntrack 경합 의심 (NodeLocal DNSCache 검토)
```

기본 거부(default-deny) NetworkPolicy를 적용하면 **DNS 질의도 차단된다.** NetworkPolicy를 적용한 뒤 갑자기 모든 것이 안 되는 사고는 대부분 DNS 예외를 빠뜨린 것이다(DNS 허용 정책 예시는 [25장](25-인증-인가-보안-오토스케일링.md)).

## 실무 적용

### 체크리스트

- [ ] 서비스 찾기는 **DNS 이름**으로 한다. 환경변수는 Pod 시작 시점의 스냅샷이라 순서 의존성 함정이 있다.
- [ ] CoreDNS(`kube-dns` Service, kube-system)가 클러스터 DNS이며, 모든 Pod의 `resolv.conf`에 그 IP가 들어간다. 클러스터가 커지면 replica(기본 2)를 늘린다.
- [ ] Service FQDN은 `<service>.<namespace>.svc.cluster.local`이다. 헤드리스 서비스는 Pod IP 전체를, StatefulSet Pod는 `<pod>.<headless>.<ns>.svc...` 이름을 얻는다.
- [ ] `search`와 `ndots:5` 때문에 외부 도메인 조회 한 번이 여러 번의 질의로 늘어난다. 끝에 점을 붙인 FQDN이 가장 간단한 해결책이다.
- [ ] `hostNetwork: true` Pod에는 `dnsPolicy: ClusterFirstWithHostNet`을 명시한다.
- [ ] DNS가 5초씩 걸리거나 간헐적으로 실패하면 conntrack 경합을 의심하고 NodeLocal DNSCache를 검토한다.
- [ ] default-deny NetworkPolicy를 걸 때는 DNS(53번 포트) 허용을 함께 넣는다.

### 시나리오로 확인하기

1. **상황:** 인앱 결제 영수증 검증 서버가 외부 결제사 API(`api.pay-provider.com`)를 호출하는데, 같은 코드를 VM에서 돌릴 때보다 쿠버네티스에서 확연히 느리고 CoreDNS CPU가 높다. C++ 서버 시절 습관대로 코드의 HTTP 클라이언트만 의심하고 있다.
   **질문:** 진짜 원인과 가장 간단한 해결은?

   <details markdown="1"><summary>답 확인</summary>

   Pod의 resolv.conf가 `ndots:5`라서 점이 2개인 이름은 search 접미사 3개를 먼저 붙여 NXDOMAIN을 받은 뒤에야 성공한다. A/AAAA를 함께 보내므로 조회 1회에 최대 8개 쿼리가 나간다. 설정값 끝에 마침표를 붙여(`api.pay-provider.com.`) search를 건너뛰게 하는 것이 가장 간단하다. → 코어 3

   </details>

2. **상황:** `game` 네임스페이스의 서버가 `database` 네임스페이스의 `postgres` Service에 `postgres`라는 짧은 이름으로 접속하려다 실패한다.
   **질문:** 왜 실패하며 어떤 이름을 써야 하나?

   <details markdown="1"><summary>답 확인</summary>

   search 첫 항목은 자기 네임스페이스(`game.svc.cluster.local`)라서 `postgres`는 `postgres.game.svc.cluster.local`로 해석되어 없는 이름이 된다. `postgres.database`(두 번째 search에서 성공)나 FQDN `postgres.database.svc.cluster.local.`을 쓴다. → 코어 2, 코어 3

   </details>

3. **상황:** 보안 점검 후 모든 네임스페이스에 default-deny NetworkPolicy를 걸었더니 서버들이 서로 전혀 접속하지 못한다. IP로 직접 접속하는 허용 규칙은 넣었다.
   **질문:** 빠진 것은?

   <details markdown="1"><summary>답 확인</summary>

   기본 거부는 DNS 질의도 막는다. 서버들이 이름을 IP로 바꾸지 못해 전부 실패하는 것이다. CoreDNS로 가는 53번 포트 허용 정책을 추가해야 한다(예시는 [25장](25-인증-인가-보안-오토스케일링.md)). → 코어 4

   </details>

4. **상황:** 트래픽이 몰리는 이벤트 시간에만 DNS 조회가 간헐적으로 정확히 5초씩 걸리거나 SERVFAIL이 난다.
   **질문:** 무엇을 의심하고 무엇을 검토하나?

   <details markdown="1"><summary>답 확인</summary>

   UDP 질의가 많을 때 conntrack 경합으로 패킷이 유실되는 문제를 의심한다. 각 노드에 DaemonSet으로 DNS 캐시를 두는 NodeLocal DNSCache를 검토하고, CoreDNS replica 확장도 고려한다. → 코어 4, 코어 1

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 이름으로 찾고 CoreDNS가 답한다
  서비스 디스커버리: DNS(요청 시점 해석) vs 환경변수(( ? ) 스냅샷)
  CoreDNS 위치: ( ? ) 네임스페이스, Service 이름 ( ? )
  Corefile 플러그인: kubernetes(( ? ) watch) / forward / ( ? ) / health·ready / reload

[코어 2] 레코드
  Service: <svc>.<ns>.svc.( ? )
  일반 → ( ? ) / 헤드리스 → ( ? ) / ExternalName → ( ? )
  StatefulSet Pod: <pod>.<( ? )>.<ns>.svc.cluster.local

[코어 3] resolv.conf: search ____ / nameserver ____ / options ndots:( ? )
  ndots 함정: google.com → ( ? )번 시도 × A/AAAA = 최대 ( ? ) 쿼리
  해결: ① 끝에 ( ? ) ② ndots 낮추기 ③ 내부도 FQDN
  dnsPolicy: ClusterFirst / ( ? ) / Default / None

[코어 4] NodeLocal DNSCache: 정확히 ( ? )초 지연(conntrack 경합) 대응
  진단: CoreDNS Ready? → kube-dns EndpointSlice? → resolv.conf? → ( ? )가 53 막나? → 간헐 SERVFAIL?
```

### 2. 인출 질문

1. `web`이라는 짧은 이름으로 같은 네임스페이스의 Service에 접근할 수 있는 이유는 무엇인가? (원래 확인 질문 1)

   <details markdown="1"><summary>답 확인</summary>

   Pod의 `/etc/resolv.conf`에 `search default.svc.cluster.local svc.cluster.local cluster.local`처럼 접미사 목록이 있어서, resolver가 짧은 이름에 이를 순서대로 붙여 본다. `web`은 첫 시도인 `web.default.svc.cluster.local`에서 바로 성공한다. → 코어 3 (3.1)

   </details>

2. `google.com`을 조회할 때 `ndots:5` 때문에 어떤 일이 벌어지는가? 어떻게 줄일 수 있는가? (원래 확인 질문 2)

   <details markdown="1"><summary>답 확인</summary>

   점이 5개 미만이므로 search 도메인 3개를 먼저 붙여 NXDOMAIN을 세 번 받고 네 번째에 성공한다. A와 AAAA를 함께 보내므로 최대 8개 쿼리가 나가 외부 호출 지연, CoreDNS CPU 상승, DNS 타임아웃으로 이어진다. 끝에 마침표를 붙인 FQDN, `dnsConfig`로 ndots 낮추기, 내부 이름도 FQDN으로 쓰기로 줄인다. → 코어 3 (3.2, 3.3)

   </details>

3. 일반 Service와 헤드리스 Service는 DNS 조회 결과가 어떻게 다른가? (원래 확인 질문 3)

   <details markdown="1"><summary>답 확인</summary>

   일반 Service는 A/AAAA로 ClusterIP 하나를 돌려주고, 헤드리스 Service는 모든 Ready Pod IP를 돌려준다. 헤드리스가 있으면 StatefulSet Pod마다 `db-0.db-headless.default.svc.cluster.local` 같은 고유 이름도 생긴다. → 코어 2

   </details>

4. 환경변수 방식의 서비스 디스커버리가 가진 함정은?

   <details markdown="1"><summary>답 확인</summary>

   kubelet이 Pod 시작 시점에 이미 존재하던 Service의 환경변수만 주입하는 스냅샷이라, Service가 Pod보다 나중에 만들어지면 환경변수에 아예 없다. DNS는 요청 시점에 해석되므로 순서 의존성이 없어 항상 선호된다. → 코어 1 (1.1)

   </details>

5. CoreDNS Corefile의 `kubernetes`와 `forward` 플러그인은 각각 무엇을 하나?

   <details markdown="1"><summary>답 확인</summary>

   `kubernetes`는 쿠버네티스 API를 watch해 Service/Pod 레코드를 응답하는 핵심 플러그인이다. `forward`는 처리하지 못한 질의(예: `google.com`)를 상위 DNS, 기본적으로 노드의 `/etc/resolv.conf` 설정으로 전달한다. → 코어 1 (1.3)

   </details>

6. `ndots:1`로 낮추면 생기는 부작용은?

   <details markdown="1"><summary>답 확인</summary>

   `postgres.database`처럼 점이 하나 있는 두 단계 이름도 search를 거치지 않게 되므로, 매니페스트에서 클러스터 내부 이름을 FQDN으로 써야 한다. → 코어 3 (3.3 해결 방법 ②)

   </details>

7. `hostNetwork: true` Pod가 클러스터 Service 이름을 해석하지 못할 때 어떻게 하나? `dnsPolicy: Default`는 무엇을 뜻하나?

   <details markdown="1"><summary>답 확인</summary>

   `hostNetwork: true`면 `Default`처럼 동작해 클러스터 DNS를 쓰지 않으므로 `ClusterFirstWithHostNet`을 명시한다. `Default`는 이름과 달리 기본값이 아니고 노드의 `/etc/resolv.conf`를 그대로 쓰는 설정이다(기본값은 `ClusterFirst`). → 코어 3 (3.4)

   </details>

8. DNS 조회가 정확히 5초씩 걸리거나 간헐적 SERVFAIL이 나면 무엇을 의심하나? default-deny NetworkPolicy 적용 후 전부 안 되면?

   <details markdown="1"><summary>답 확인</summary>

   UDP 질의가 많을 때 conntrack 경합으로 패킷이 유실되는 것을 의심하고, 각 노드에 DNS 캐시를 두는 NodeLocal DNSCache를 검토한다. default-deny 이후의 전면 장애는 대부분 DNS(53번 포트) 예외를 빠뜨려 DNS 질의까지 차단된 것이다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** Pod 안의 `getaddrinfo("google.com")` = 평소의 그 함수 호출. ⚠️ 깨지는 곳: Pod의 resolv.conf에 `ndots:5`와 search 3개가 박혀 있어, 코드는 그대로인데 질의가 최대 8개로 불어난다. 코드가 아니라 resolver 설정이 성능을 바꾼다.
- **비유:** search + ndots = 내선 번호 자동 완성. 짧게 누르면 회사 앞자리를 붙여 먼저 걸어 본다. ⚠️ 비유가 깨지는 지점: 실제 전화는 외부 번호를 알아서 구분하지만, ndots:5에서는 `google.com` 같은 외부 이름도 "짧은 번호"로 보고 사내 접미사를 세 번 붙여 실패한 뒤에야 바깥으로 건다.
- **묶음(3의 법칙):** 레코드 응답 3종(일반=ClusterIP / 헤드리스=Pod IP 전부 / ExternalName=CNAME), resolv.conf 3줄(search / nameserver / options ndots), ndots 해결 3가지(끝 점 / ndots 낮춤 / 내부도 FQDN).
- **대칭·순서:** DNS(요청 시점) vs 환경변수(시작 시점). `<service>.<namespace>.svc.cluster.local`은 좁은 것에서 넓은 것으로, search 목록도 같은 순서(`default.svc...` → `svc...` → `cluster.local`)로 넓어진다.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`curl web` 한 줄이 실제로 거치는 DNS 단계"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "설정 파일에 IP를 적던 방식 대신 왜 이름을 쓰는지, 그리고 이름 끝의 점 하나가 왜 외부 API 지연을 줄이는지"를 설명해 보세요.
- **랜덤 논리 게임:** A "ndots를 1로 낮춰 외부 조회를 빠르게 하자" vs B "ndots:5를 두고 외부 도메인 끝에 점을 붙이자(짧은 내부 이름 편의 유지)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 CoreDNS, resolv.conf, ndots 함정을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main/03-애플리케이션-노출과-데이터/10-DNS와-서비스-디스커버리.md (10.1 CoreDNS, 10.2 DNS 레코드 규칙, 10.3 resolv.conf와 ndots, 10.4 DNS 정책, 10.5 NodeLocal DNSCache, 10.6 DNS 문제 진단·NetworkPolicy와 DNS); Kubernetes_Internals_Network_Guide/03-네트워크/14-Service와-EndpointSlice.md (14.3 서비스 디스커버리 메커니즘); Kubernetes_Internals_Network_Guide/부록/A-진단-명령어-치트시트.md (A.10 DNS 진단)*
