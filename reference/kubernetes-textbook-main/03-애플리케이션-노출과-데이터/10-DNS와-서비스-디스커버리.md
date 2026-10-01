# 10장. DNS와 서비스 디스커버리

> **학습목표**
> - CoreDNS의 구조와 Corefile 설정을 읽을 수 있다.
> - Service와 Pod의 FQDN 규칙을 설명하고 짧은 이름이 어떻게 확장되는지 안다.
> - `resolv.conf`의 `ndots` 설정이 만드는 성능 문제를 이해하고 측정할 수 있다.
> - DNS 정책과 커스텀 DNS 설정을 적용할 수 있다.
> - NodeLocal DNSCache로 DNS 부하와 지연을 줄일 수 있다.
> - DNS 장애를 계층별로 진단할 수 있다.

---

## 들어가며

9장 마지막의 진단 순서에서 마지막 단계가 남았다.

```
⑦ ClusterIP로 접근된다 ✓
⑧ DNS 이름(web)으로 접근되지 않는다 ✗   ← 이 장의 영역
```

`curl web`이라는 짧은 명령 하나가 실제로는 여러 단계를 거친다. 그 과정을 이해하면 "가끔 DNS가 안 된다", "요청이 5초씩 걸린다" 같은 난감한 증상을 설명할 수 있다.

## 10.1 CoreDNS

### 클러스터 DNS의 위치

3장에서 `kubectl get pods -n kube-system`을 실행했을 때 `coredns` Pod 두 개를 봤다.

```bash
kubectl get deployment coredns -n kube-system
kubectl get svc kube-dns -n kube-system
```

```
NAME       TYPE        CLUSTER-IP   PORT(S)
kube-dns   ClusterIP   10.96.0.10   53/UDP,53/TCP,9153/TCP
```

**Service 이름이 `kube-dns`인 것에 주의하자.** 예전에 kube-dns라는 다른 구현을 쓰던 시절의 이름이 남았다. 실제 구현은 CoreDNS다.

`10.96.0.10`은 Service CIDR의 10번째 주소로 관례상 고정된다. 모든 Pod의 `/etc/resolv.conf`에 이 IP가 들어간다.

```bash
kubectl run t --rm -it --image=busybox --restart=Never -- cat /etc/resolv.conf
```
```
search default.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

이 세 줄이 이 장의 전부라고 해도 과언이 아니다. 하나씩 뜯어본다.

### Corefile

CoreDNS의 설정은 ConfigMap에 담겨 있다.

```bash
kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}'
```

```
.:53 {
    errors
    health {
       lameduck 5s
    }
    ready
    kubernetes cluster.local in-addr.arpa ip6.arpa {
       pods insecure
       fallthrough in-addr.arpa ip6.arpa
       ttl 30
    }
    prometheus :9153
    forward . /etc/resolv.conf {
       max_concurrent 1000
    }
    cache 30
    loop
    reload
    loadbalance
}
```

**플러그인 체인 방식**이다. 요청이 위에서 아래로 흐르며 각 플러그인이 처리한다.

| 플러그인 | 역할 |
|---|---|
| `errors` | 에러를 stdout에 기록 |
| `health` | `/health` 엔드포인트. `lameduck`은 종료 전 유예 시간 |
| `ready` | `/ready` 엔드포인트 (readiness 프로브용) |
| `kubernetes` | **핵심.** 쿠버네티스 API를 watch해 Service/Pod 레코드를 응답 |
| `prometheus` | 메트릭 노출 (31장) |
| `forward` | 처리 못 한 질의를 상위 DNS로 전달 |
| `cache` | 응답 캐싱 (초 단위) |
| `loop` | 무한 루프 감지 |
| `reload` | Corefile 변경 시 자동 재적용 |
| `loadbalance` | 응답 레코드 순서를 섞음 (라운드 로빈) |

**`forward . /etc/resolv.conf`** 가 중요하다. 클러스터 도메인이 아닌 질의(`google.com` 등)는 **노드의 DNS 설정**으로 전달된다.

### 커스텀 설정 추가

Corefile을 직접 수정할 수도 있지만, 클러스터 업그레이드 시 덮어써질 수 있다. 대신 다음 방법을 쓴다.

**특정 도메인만 다른 DNS로 보내기**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        ...기존 설정...
    }
    # 사내 도메인은 사내 DNS로
    corp.example.com:53 {
        errors
        cache 30
        forward . 10.10.0.53 10.10.0.54
    }
```

**호스트 파일 항목 추가 (레거시 시스템 연동)**

```
    hosts {
        192.168.1.100 legacy-app.internal
        fallthrough
    }
```

**변경 후 반영**
```bash
kubectl rollout restart deployment coredns -n kube-system
```
`reload` 플러그인이 있으면 자동 반영되지만(최대 30초), 확실히 하려면 재시작한다.

### CoreDNS 스케일링

기본 replica는 2다. 클러스터가 커지면 부족할 수 있다.

```bash
kubectl scale deployment coredns -n kube-system --replicas=4
```

**얼마나 필요한가?** 대략적인 기준은 `노드 수 / 16 + Pod 수 / 256` 정도지만, 실제로는 메트릭을 봐야 한다.

```bash
# CoreDNS 메트릭 확인
kubectl port-forward -n kube-system svc/kube-dns 9153:9153 &
curl -s localhost:9153/metrics | grep -E 'coredns_dns_requests_total|coredns_dns_request_duration'
```

31장에서 이 메트릭으로 대시보드를 만든다.

**cluster-proportional-autoscaler**를 쓰면 노드 수에 비례해 자동 조절된다. 대부분의 매니지드 클러스터는 이것을 기본 탑재한다.

## 10.2 DNS 레코드 규칙

### Service 레코드

**FQDN 형식**
```
<service>.<namespace>.svc.<cluster-domain>
```

```
web.default.svc.cluster.local
postgres.database.svc.cluster.local
```

| 대상 | 레코드 타입 | 응답 |
|---|---|---|
| 일반 Service | A / AAAA | ClusterIP 하나 |
| 헤드리스 Service | A / AAAA | **모든 Ready Pod IP** |
| ExternalName | CNAME | 외부 도메인 |

**SRV 레코드** — 이름 있는 포트를 조회할 수 있다.

```
_<port-name>._<protocol>.<service>.<namespace>.svc.cluster.local
```

```bash
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- \
  dig +short SRV _http._tcp.web.default.svc.cluster.local
# 0 100 8080 10-244-1-3.web.default.svc.cluster.local.
```

포트 번호를 하드코딩하지 않고 발견할 수 있다. Kafka나 Consul 같은 시스템이 활용한다.

### StatefulSet Pod 레코드

8장과 9장에서 예고한 부분이다. 헤드리스 서비스가 있으면 각 Pod가 이름을 얻는다.

```
<pod-name>.<headless-service>.<namespace>.svc.cluster.local
```

```
db-0.db-headless.default.svc.cluster.local  → 10.244.1.5
db-1.db-headless.default.svc.cluster.local  → 10.244.2.6
```

**이 이름은 Pod가 재생성되어도 유지된다.** IP는 바뀌지만 이름은 그대로다. 데이터베이스 클러스터의 설정 파일에 `db-0.db-headless`를 적어 둘 수 있는 이유다.

### 일반 Pod 레코드

Pod도 IP 기반 A 레코드를 갖는다(기본적으로는 조회만 가능).

```
<ip-with-dashes>.<namespace>.pod.cluster.local
10-244-1-3.default.pod.cluster.local
```

거의 쓸 일이 없다. `hostname`과 `subdomain`을 지정하면 더 유용한 이름을 만들 수 있다.

```yaml
spec:
  hostname: worker-a
  subdomain: workers        # 이 이름의 헤드리스 서비스가 있어야 함
```
```
worker-a.workers.default.svc.cluster.local
```

## 10.3 resolv.conf와 ndots — 숨은 성능 문제

### search 도메인의 동작

다시 `/etc/resolv.conf`를 보자.

```
search default.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

**`search`** 는 짧은 이름에 순서대로 붙여 볼 접미사 목록이다.

`curl web` 을 실행하면 resolver가 이렇게 시도한다.

```
① web.default.svc.cluster.local     ← 성공! (같은 네임스페이스)
```

`curl postgres.database` 라면:
```
① postgres.database.default.svc.cluster.local   ✗ NXDOMAIN
② postgres.database.svc.cluster.local           ✓ 성공
```

이 덕분에 같은 네임스페이스 안에서는 `web`처럼 짧게 쓸 수 있다.

### ndots:5 의 함정

**`ndots`** 는 "이름에 점이 이 개수 미만이면 **먼저 search 도메인을 붙여 본다**"는 설정이다.

쿠버네티스의 기본값은 **5**다. 매우 큰 값이다.

`google.com`을 조회하면 어떻게 될까? 점이 1개, 즉 5 미만이므로 search 도메인부터 시도한다.

```
① google.com.default.svc.cluster.local   ✗ NXDOMAIN
② google.com.svc.cluster.local           ✗ NXDOMAIN
③ google.com.cluster.local               ✗ NXDOMAIN
④ google.com                             ✓ 성공
```

**질의가 4번 발생한다.** 게다가 각 질의는 IPv4(A)와 IPv6(AAAA)를 함께 보내므로 **실제로는 8번의 DNS 패킷**이 오간다.

```
외부 도메인 1회 조회 = 최대 8개 DNS 쿼리
```

이것이 다음 증상들의 원인이다.

- 외부 API 호출이 유난히 느리다
- CoreDNS의 CPU 사용률이 높다
- 트래픽이 늘면 DNS 타임아웃이 발생한다

### 해결 방법

**① FQDN에 마침표를 붙인다 (가장 간단)**

```
google.com.        ← 끝의 점이 "이것이 완전한 이름"이라는 표시
```

점이 붙으면 search 도메인을 건너뛰고 바로 조회한다.

```yaml
env:
  - name: EXTERNAL_API
    value: "api.example.com."      # ★ 끝에 점
```

**② ndots를 낮춘다**

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

`ndots:2`면 `google.com`(점 1개)은... 여전히 2 미만이라 search를 시도한다. `ndots:1`로 해야 확실하다. 다만 그러면 `postgres.database` 같은 두 단계 이름도 search를 안 거치므로, **매니페스트에서 FQDN을 써야 한다.**

**절충안**: 클러스터 내부 통신이 많은 워크로드는 기본값 유지, 외부 API 호출이 많은 워크로드만 `ndots: 1` + FQDN 사용.

**③ 클러스터 내부도 FQDN으로 쓴다**

```yaml
env:
  - name: DB_HOST
    value: "postgres.database.svc.cluster.local."
```

점 4개라 `ndots:5` 미만이지만, 끝의 마침표 덕분에 한 번에 해결된다. **가장 명시적이고 빠른 방법이다.**

### 실습: ndots 영향 측정

```bash
kubectl run dns-bench --rm -it --image=nicolaka/netshoot --restart=Never -- bash
```

컨테이너 안에서:

```bash
# 현재 설정 확인
cat /etc/resolv.conf

# ① 짧은 이름 — 쿼리 횟수 확인
dig +search +trace google.com 2>/dev/null | grep -c "IN"

# ② 실제 쿼리 관찰 (tcpdump)
tcpdump -i any -n port 53 &
sleep 1
curl -s -o /dev/null google.com
sleep 1
kill %1
```

`tcpdump` 출력에서 `google.com.default.svc.cluster.local`, `google.com.svc.cluster.local` 같은 실패 쿼리가 보인다.

```bash
# ③ FQDN으로 비교
tcpdump -i any -n port 53 &
sleep 1
curl -s -o /dev/null google.com.
sleep 1
kill %1
```

쿼리 수가 확연히 줄어든 것을 확인할 수 있다.

**시간 측정**

```bash
# 짧은 이름
time (for i in $(seq 1 50); do getent hosts google.com > /dev/null; done)

# FQDN
time (for i in $(seq 1 50); do getent hosts google.com. > /dev/null; done)
```

## 10.4 DNS 정책과 커스텀 설정

### dnsPolicy

Pod가 어떤 DNS 설정을 받을지 결정한다.

```yaml
spec:
  dnsPolicy: ClusterFirst
```

| 값 | 동작 |
|---|---|
| `ClusterFirst` (기본) | 클러스터 DNS(CoreDNS)를 사용. 외부 도메인은 CoreDNS가 상위로 forward |
| `ClusterFirstWithHostNet` | `hostNetwork: true`인 Pod에서 클러스터 DNS를 쓰고 싶을 때 **반드시 필요** |
| `Default` | **노드의 `/etc/resolv.conf`를 그대로 사용.** 클러스터 DNS를 안 씀 (이름이 헷갈린다) |
| `None` | 모두 무시하고 `dnsConfig`로만 설정 |

> **⚠️ `hostNetwork: true`의 함정**
> DaemonSet 등에서 `hostNetwork: true`를 쓰면 `dnsPolicy`가 자동으로 `Default`처럼 동작한다. 즉 **클러스터 Service 이름을 해석하지 못한다.**
> ```yaml
> spec:
>   hostNetwork: true
>   dnsPolicy: ClusterFirstWithHostNet    # ★ 이걸 명시해야 한다
> ```
> 8.4절의 DaemonSet 예제에서 이 조합이 왜 필요한지 이제 알 수 있다.

### dnsConfig

세부 조정을 한다.

```yaml
spec:
  dnsPolicy: ClusterFirst
  dnsConfig:
    nameservers:
      - 1.1.1.1                  # 추가 네임서버
    searches:
      - internal.example.com     # 추가 search 도메인
    options:
      - name: ndots
        value: "2"
      - name: timeout
        value: "2"               # 기본 5초 → 2초
      - name: attempts
        value: "3"
      - name: single-request-reopen   # A/AAAA 동시 전송 문제 완화
```

`dnsPolicy: None`이면 `dnsConfig`가 유일한 설정이 된다.

```yaml
spec:
  dnsPolicy: None
  dnsConfig:
    nameservers: ["8.8.8.8"]
    searches: []
    options:
      - name: ndots
        value: "1"
```

### hostAliases — Pod의 /etc/hosts

```yaml
spec:
  hostAliases:
    - ip: "192.168.1.100"
      hostnames:
        - "legacy.internal"
        - "old-api"
```

DNS를 거치지 않고 직접 매핑한다. 임시 우회나 테스트에 쓴다. **영구적 해법으로는 부적절하다** — IP가 바뀌면 매니페스트를 고쳐야 한다.

## 10.5 NodeLocal DNSCache

### 문제

모든 Pod의 DNS 질의가 CoreDNS Pod로 간다. 이때 두 가지 문제가 생긴다.

**① conntrack 경합**
DNS는 UDP를 쓴다. iptables의 DNAT는 conntrack 테이블에 엔트리를 만드는데, 동시에 많은 UDP 질의가 발생하면 **경합으로 패킷이 유실**될 수 있다. 이것이 리눅스 커널의 알려진 문제(race condition in conntrack)로, **DNS 조회가 정확히 5초 걸리는** 악명 높은 증상의 원인이다(resolver의 재시도 타임아웃이 5초).

**② 네트워크 홉**
Pod → (다른 노드의) CoreDNS Pod → 응답. 노드를 넘어가는 왕복이 발생한다.

### 해결: 노드마다 캐시를 둔다

NodeLocal DNSCache는 각 노드에 **DaemonSet으로 DNS 캐시**를 배치한다.

```
[변경 전]
Pod → (UDP, conntrack) → kube-dns Service → CoreDNS Pod (다른 노드일 수 있음)

[변경 후]
Pod → (같은 노드의 로컬 IP, conntrack 우회) → node-local-dns
                                                    │ 캐시 미스 시
                                                    └→ (TCP) → CoreDNS
```

**개선점**

- 캐시 히트 시 **노드를 벗어나지 않는다** → 지연 감소
- 로컬 링크 IP(`169.254.20.10`)를 써서 **conntrack을 우회** → 5초 타임아웃 문제 해소
- 업스트림으로는 **TCP**를 사용 → UDP 유실 문제 회피
- CoreDNS 부하가 크게 준다

**설치**

```bash
# 쿠버네티스 공식 매니페스트를 클러스터 값에 맞게 치환
kubectl apply -f https://raw.githubusercontent.com/kubernetes/kubernetes/master/cluster/addons/dns/nodelocaldns/nodelocaldns.yaml
```

매니페스트의 `__PILLAR__` 자리표시자를 실제 값으로 바꿔야 한다.
- `__PILLAR__DNS__SERVER__`: `10.96.0.10` (kube-dns ClusterIP)
- `__PILLAR__LOCAL__DNS__`: `169.254.20.10`
- `__PILLAR__DNS__DOMAIN__`: `cluster.local`

대부분의 매니지드 서비스는 옵션 하나로 켤 수 있다.
```bash
# GKE
gcloud container clusters update CLUSTER --update-addons=NodeLocalDNS=ENABLED
```

**노드가 100개를 넘거나 DNS 질의량이 많은 클러스터에서는 사실상 필수다.**

## 10.6 DNS 문제 진단

### 계층별 확인

```bash
# 진단용 Pod 띄우기
kubectl run dns-debug --rm -it --image=nicolaka/netshoot --restart=Never -- bash
```

**① resolv.conf가 올바른가**
```bash
cat /etc/resolv.conf
# nameserver가 10.96.0.10 인지, search가 올바른지
```

**② CoreDNS Pod에 도달하는가**
```bash
# kube-dns Service IP로 직접 질의
dig @10.96.0.10 kubernetes.default.svc.cluster.local

# CoreDNS Pod IP로 직접 (Service를 건너뛰고)
dig @<coredns-pod-ip> kubernetes.default.svc.cluster.local
```

Service로는 안 되는데 Pod IP로는 되면 → **kube-proxy 문제**(9장).

**③ 클러스터 내부 이름이 해석되는가**
```bash
nslookup kubernetes.default
nslookup web.default.svc.cluster.local
```

**④ 외부 이름이 해석되는가**
```bash
nslookup google.com
```
내부는 되는데 외부가 안 되면 → CoreDNS의 `forward` 설정 또는 노드의 DNS 문제.

**⑤ CoreDNS 자체 상태**
```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
kubectl get endpointslice -n kube-system -l kubernetes.io/service-name=kube-dns
```

### 증상별 원인표

| 증상 | 가능한 원인 | 확인 |
|---|---|---|
| **모든 DNS 실패** | CoreDNS Pod 다운, 엔드포인트 없음 | `kubectl get pods -n kube-system -l k8s-app=kube-dns` |
| **간헐적 실패** | CoreDNS 부하, conntrack 경합 | CoreDNS replica 늘리기, NodeLocal DNSCache |
| **정확히 5초 지연** | conntrack race condition | NodeLocal DNSCache, `single-request-reopen` |
| **외부만 실패** | `forward` 설정, 노드 DNS | Corefile의 forward, 노드 `/etc/resolv.conf` |
| **내부만 실패** | `kubernetes` 플러그인, RBAC | CoreDNS 로그, ServiceAccount 권한 |
| **특정 네임스페이스만** | NetworkPolicy가 DNS 차단 | 18장 참조 |
| **`i/o timeout`** | UDP 패킷 유실, MTU 문제 | 23장 참조 |
| **CoreDNS 로그에 `loop detected`** | 노드 resolv.conf가 자기 자신을 가리킴 | systemd-resolved 스텁 문제 |

### NetworkPolicy와 DNS

18장을 미리 언급해 둔다. 기본 거부(default-deny) NetworkPolicy를 적용하면 **DNS도 차단된다.** 반드시 예외를 만들어야 한다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

**NetworkPolicy를 적용한 뒤 갑자기 모든 것이 안 되는** 사고의 90%가 DNS 차단이다.

## 10.7 실습: DNS 전체 흐름 추적

**① 환경 준비**

```bash
kubectl create namespace shop
kubectl create deployment api --image=hello:1.0 -n shop
kubectl expose deployment api --port=80 --target-port=8080 -n shop
kubectl create deployment web --image=hello:1.0
kubectl expose deployment web --port=80 --target-port=8080
```

**② 같은 네임스페이스 — 짧은 이름**

```bash
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'nslookup web; echo "---"; curl -s web'
```

**③ 다른 네임스페이스 — 네임스페이스 포함**

```bash
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'nslookup api 2>&1 | tail -3; echo "=== 실패. 네임스페이스를 붙인다 ==="; nslookup api.shop'
```

첫 조회는 실패한다. `api`는 `api.default.svc.cluster.local`로 확장되는데 그런 서비스가 없기 때문이다.

**④ search 도메인 동작 관찰**

```bash
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- bash
```

컨테이너 안에서:
```bash
# tcpdump로 실제 쿼리를 본다
tcpdump -i any -n -l port 53 2>/dev/null &
sleep 1
getent hosts api.shop
sleep 1
kill %1
```

`api.shop.default.svc.cluster.local`(실패) → `api.shop.svc.cluster.local`(성공) 순서가 보인다.

**⑤ SRV 레코드 확인**

```bash
kubectl run t --rm -it --image=nicolaka/netshoot --restart=Never -- \
  dig +short SRV _http._tcp.web.default.svc.cluster.local
```

포트에 이름을 주지 않았다면 결과가 비어 있을 수 있다. Service에 `name: http`를 추가하고 다시 시도해 본다.

**⑥ CoreDNS 로그 활성화해서 질의 관찰**

```bash
kubectl edit configmap coredns -n kube-system
# Corefile의 첫 줄 아래에 "log" 추가
```
```
.:53 {
    log                     # ★ 추가
    errors
    ...
}
```

```bash
kubectl rollout restart deployment coredns -n kube-system
kubectl logs -n kube-system -l k8s-app=kube-dns -f
```

다른 터미널에서 질의를 날리면 CoreDNS가 받은 요청이 그대로 보인다.

```
[INFO] 10.244.1.9:47251 - 12345 "A IN api.shop.default.svc.cluster.local. udp 63 false 512" NXDOMAIN
[INFO] 10.244.1.9:47251 - 12346 "A IN api.shop.svc.cluster.local. udp 55 false 512" NOERROR
```

**실습이 끝나면 `log` 플러그인은 제거하자.** 트래픽이 많으면 로그가 폭증한다.

**⑦ 정리**

```bash
kubectl delete namespace shop
kubectl delete deploy,svc web
```

---

## 실습 과제

**과제 1 — ndots 성능 측정**
같은 앱을 `ndots:5`(기본)와 `ndots:1` + FQDN 두 가지로 배포하고, 외부 API를 1000번 호출하는 부하를 준다. CoreDNS의 `coredns_dns_requests_total` 메트릭 증가량을 비교한다. 몇 배 차이가 나는가?

**과제 2 — 5초 지연 재현하기**
UDP 패킷을 대량으로 발생시켜 conntrack 경합을 유도하고, 일부 DNS 조회가 정확히 5초 걸리는 것을 관찰한다.
```bash
for i in $(seq 1 200); do (time getent hosts google.com) 2>&1 | grep real & done; wait
```
5초에 가까운 값이 섞여 나오는지 확인한다.

**과제 3 — 커스텀 도메인 추가**
Corefile에 `hosts` 플러그인으로 가상의 레거시 서버(`legacy.internal → 192.168.1.100`)를 등록하고, Pod에서 해석되는지 확인한다. 그다음 `hostAliases`로 같은 것을 구현해 두 방식의 차이(범위, 관리 지점)를 비교한다.

**과제 4 — hostNetwork + DNS 실험**
`hostNetwork: true`인 Pod를 `dnsPolicy` 없이 만들고 클러스터 Service 이름을 조회해 실패하는 것을 확인한다. 그다음 `dnsPolicy: ClusterFirstWithHostNet`을 추가해 해결되는 것을 본다.

---

## 요약

- 클러스터 DNS는 **CoreDNS**가 제공하며, Service 이름은 관례상 `kube-dns`, IP는 Service CIDR의 10번째(`10.96.0.10`)다.
- Corefile은 **플러그인 체인**이다. `kubernetes` 플러그인이 API를 watch해 레코드를 만들고, 클러스터 밖 질의는 `forward`가 노드 DNS로 넘긴다.
- FQDN 규칙: Service는 `<svc>.<ns>.svc.cluster.local`, StatefulSet Pod는 `<pod>.<headless-svc>.<ns>.svc.cluster.local`. **Pod가 재생성되어도 이름은 유지된다.**
- **`ndots:5`가 숨은 성능 문제의 주범이다.** 외부 도메인 하나를 조회하는 데 최대 8개의 DNS 패킷이 발생한다. 해결책은 **끝에 마침표를 붙인 FQDN 사용**이 가장 간단하다.
- `hostNetwork: true`인 Pod는 `dnsPolicy: ClusterFirstWithHostNet`을 명시해야 클러스터 이름을 해석한다.
- **NodeLocal DNSCache**는 각 노드에 캐시를 두어 conntrack 경합(5초 지연)을 회피하고 CoreDNS 부하를 줄인다. 대규모 클러스터에서는 사실상 필수다.
- 진단은 **resolv.conf → CoreDNS 도달 여부 → 내부 이름 → 외부 이름** 순으로 좁힌다. NetworkPolicy 적용 후 모든 것이 깨졌다면 **DNS 예외를 빠뜨린 것**이 90%다.

**다음 장에서는** HTTP 레벨의 라우팅을 다룬다. 여러 서비스를 하나의 진입점으로 모으고, TLS를 종료하고, 경로와 호스트 기반으로 트래픽을 나누는 Ingress를 살펴본다.

---

**참고 원서**: *Core Kubernetes* 10장
