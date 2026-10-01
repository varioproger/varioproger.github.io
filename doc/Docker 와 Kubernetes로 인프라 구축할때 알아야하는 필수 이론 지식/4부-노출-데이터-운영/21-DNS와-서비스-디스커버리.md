---
title: "21장. DNS와 서비스 디스커버리"
parent: "4부. 서비스 노출, 데이터, 운영"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 21
---

# 21장. DNS와 서비스 디스커버리

## 이 장에서 배우는 것

- 클러스터 DNS(CoreDNS)가 어디서 어떻게 동작하는지
- Service와 Pod의 DNS 이름(FQDN) 규칙
- Pod 안의 `/etc/resolv.conf`(search, ndots)가 왜 중요한지
- 외부 도메인 조회가 느려지는 "ndots:5 함정"과 해결 방법

## 1. 서비스 디스커버리란

Pod는 Service의 ClusterIP를 외우지 않는다. 이름으로 찾는다. 서비스를 찾는 방법은 두 가지다.

- **DNS 방식** (항상 선호): 요청 시점에 즉시 해석되므로 순서 의존성이 없다.
- **환경변수 방식**: kubelet이 Pod 시작 시점에 이미 존재하던 Service의 환경변수(`PAYMENTS_SERVICE_HOST` 등)를 주입한다. **Pod 시작 시점의 스냅샷**이라, Service가 Pod보다 나중에 만들어지면 환경변수에 아예 없다. 실무에서 쓸 이유는 사실상 없다.

```bash
curl http://payments.default.svc.cluster.local
curl http://payments      # 같은 네임스페이스면 짧은 이름으로도 가능
```

`curl web` 같은 짧은 명령 하나가 실제로는 여러 단계를 거친다. 이 장은 그 과정을 설명한다.

## 2. CoreDNS

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

### Corefile

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

## 3. DNS 레코드 규칙

### Service

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

### StatefulSet Pod

헤드리스 서비스가 있으면 StatefulSet의 각 Pod가 고유한 이름을 얻는다.

```
<pod-name>.<headless-service>.<namespace>.svc.cluster.local
db-0.db-headless.default.svc.cluster.local  → 10.244.1.5
db-1.db-headless.default.svc.cluster.local  → 10.244.2.6
```

이 이름은 Pod가 재생성되어도 유지된다(IP는 바뀌어도 이름은 그대로). 일반 Pod도 `10-244-1-3.default.pod.cluster.local` 형태의 IP 기반 A 레코드를 갖지만 거의 쓸 일이 없다.

## 4. resolv.conf와 ndots — 숨은 성능 문제

### search 도메인

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

### ndots:5의 함정

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

### 해결 방법

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

## 5. dnsPolicy

Pod가 어떤 DNS 설정을 받을지 정한다.

| 값 | 동작 |
|---|---|
| `ClusterFirst` (기본) | 클러스터 DNS(CoreDNS) 사용. 외부 도메인은 CoreDNS가 상위로 forward |
| `ClusterFirstWithHostNet` | `hostNetwork: true`인 Pod에서 클러스터 DNS를 쓰고 싶을 때 필요 |
| `Default` | 노드의 `/etc/resolv.conf`를 그대로 사용. 클러스터 DNS를 안 씀 (이름이 헷갈린다) |
| `None` | 모두 무시하고 `dnsConfig`로만 설정 |

`hostNetwork: true`를 쓰면 `dnsPolicy`가 `Default`처럼 동작해 클러스터 Service 이름을 해석하지 못하므로 `ClusterFirstWithHostNet`을 명시해야 한다.

## 6. NodeLocal DNSCache (개요)

모든 Pod의 DNS 질의가 CoreDNS Pod로 가면 두 가지 문제가 생길 수 있다. 하나는 UDP 질의가 많을 때 conntrack 경합으로 패킷이 유실되어 **DNS 조회가 정확히 5초 걸리는** 증상이고, 다른 하나는 다른 노드의 CoreDNS까지 가는 네트워크 홉이다. NodeLocal DNSCache는 각 노드에 DaemonSet으로 DNS 캐시를 두어, 캐시 히트 시 노드를 벗어나지 않게 한다.

## 7. DNS 장애 진단 순서

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

기본 거부(default-deny) NetworkPolicy를 적용하면 **DNS 질의도 차단된다.** NetworkPolicy를 적용한 뒤 갑자기 모든 것이 안 되는 사고는 대부분 DNS 예외를 빠뜨린 것이다(DNS 허용 정책 예시는 24장).

## 핵심 요약

- 서비스 찾기는 **DNS 이름**으로 한다. 환경변수는 Pod 시작 시점의 스냅샷이라 순서 의존성 함정이 있다.
- CoreDNS(`kube-dns` Service, kube-system)가 클러스터 DNS이며, 모든 Pod의 `resolv.conf`에 그 IP가 들어간다.
- Service FQDN은 `<service>.<namespace>.svc.cluster.local`이다. 헤드리스 서비스는 Pod IP 전체를, StatefulSet Pod는 `<pod>.<headless>.<ns>.svc...` 이름을 얻는다.
- `search`와 `ndots:5` 때문에 외부 도메인 조회 한 번이 여러 번의 질의로 늘어난다. 끝에 점을 붙인 FQDN이 가장 간단한 해결책이다.
- DNS가 5초씩 걸리거나 간헐적으로 실패하면 conntrack 경합을 의심하고 NodeLocal DNSCache를 검토한다.

## 확인 질문

1. `web`이라는 짧은 이름으로 같은 네임스페이스의 Service에 접근할 수 있는 이유는 무엇인가?
2. `google.com`을 조회할 때 `ndots:5` 때문에 어떤 일이 벌어지는가? 어떻게 줄일 수 있는가?
3. 일반 Service와 헤드리스 Service는 DNS 조회 결과가 어떻게 다른가?

*원문 근거: kubernetes-textbook-main/03-애플리케이션-노출과-데이터/10-DNS와-서비스-디스커버리.md (10.1 CoreDNS, 10.2 DNS 레코드 규칙, 10.3 resolv.conf와 ndots, 10.4 DNS 정책, 10.5 NodeLocal DNSCache, 10.6 DNS 문제 진단·NetworkPolicy와 DNS); Kubernetes_Internals_Network_Guide/03-네트워크/14-Service와-EndpointSlice.md (14.3 서비스 디스커버리 메커니즘); Kubernetes_Internals_Network_Guide/부록/A-진단-명령어-치트시트.md (A.10 DNS 진단)*
