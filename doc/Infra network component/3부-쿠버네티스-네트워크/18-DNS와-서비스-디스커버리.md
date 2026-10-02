---
title: "18장. DNS와 서비스 디스커버리"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 18
---

# 18장. DNS와 서비스 디스커버리

> **🎮 게임 서버 개발자에게** — 게임 서버 코드에서 `connect()` 직전에 호스트 이름을 IP로 바꾸는 일(`getaddrinfo` 계열)은 라이브러리가 알아서 해 주는 일이라 평소에는 신경 쓰지 않는다. 쿠버네티스에서는 이 "이름 → IP" 단계가 **서비스 디스커버리 그 자체**다. 로그인 서버가 채널 서버 목록을 내려주던 일을 `payments` 같은 세 글자 이름이 대신한다. 결정적으로 다른 점은, 이름을 풀어 주는 DNS 서버(CoreDNS)도 **그냥 하나의 워크로드**라는 것이다. 평범한 Deployment 앞에 평범한 ClusterIP Service가 붙어 있고, DNS 쿼리도 [16장](16-Service와-EndpointSlice.md)·[17장](17-kube-proxy-데이터플레인.md)에서 배운 그 경로(ClusterIP → DNAT → Pod IP)로 간다. 또 하나, 리졸버가 이름을 곧바로 조회하지 않고 **접미사를 붙여 가며 여러 번 시도**한다는 점이 성능 함정이 된다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 외부 API(`api.example.com`) 호출이 유난히 느리고 CoreDNS CPU가 높다 → `ndots:5`와 search 목록이 만드는 불필요한 쿼리를 의심한다.
> - 트래픽이 몰릴 때만 DNS 조회가 간헐적으로 실패하거나 정확히 5초씩 걸린다 → UDP conntrack 경쟁 조건, NodeLocal DNSCache를 검토한다.
> - NetworkPolicy를 적용한 뒤 갑자기 모든 서비스 호출이 깨진다 → DNS(UDP/TCP 53) egress 허용을 빠뜨렸는지 먼저 본다([21장](21-NetworkPolicy와-네트워크-보안.md)).

## 코어 — 이것만은 100%

> **한 문장:** 클러스터 DNS는 CoreDNS(플러그인 체인 + `kubernetes` 플러그인)가 Service/EndpointSlice를 watch해 `<service>.<namespace>.svc.cluster.local` 레코드로 답해 주고, Pod의 `/etc/resolv.conf`(search 목록 + `ndots:5`)가 짧은 이름을 그 형태로 확장하며, 그 DNS 트래픽 자체도 일반 Service 경로를 탄다.

1. **CoreDNS = 플러그인 체인이자 평범한 워크로드** — `kubernetes` 플러그인이 API 서버를 watch해 메모리에 레코드를 유지하고, 모르는 이름은 `forward`가 노드의 DNS로 넘긴다. CoreDNS 앞의 `kube-dns` Service는 ClusterIP이며 이 주소가 모든 Pod의 `nameserver`다.
2. **search/ndots는 리졸버 규칙이고, 그 비용은 CoreDNS 쪽에 흔적으로 남는다** — 짧은 이름 확장은 Pod 안의 리졸버가 `resolv.conf`만 보고 하므로 후보마다 실제 쿼리가 나가고, `NXDOMAIN`이 확정된 쿼리도 CoreDNS까지 간다. 그래서 tcpdump·CoreDNS `log`·`coredns_dns_requests_total`로 직접 세고, 완화책은 `ndots`를 낮출수록 내부 짧은 이름이 깨지는 경계 조건과 함께 고른다. 이름 규칙(FQDN, 레코드 종류)은 입문 책과 같고 SRV·`hostname`/`subdomain`만 더한다.
3. **캐시, NodeLocal DNSCache, 진단 순서** — 대량 UDP 쿼리가 만드는 conntrack 경쟁 조건(5초 지연/SERVFAIL)을 노드마다 놓은 캐시로 피한다. DNS 장애는 CoreDNS Pod → Service/EndpointSlice → resolv.conf → ClusterIP 직접 질의 → 간헐성 순으로 좁힌다.

**이 장의 학습 목표**

- CoreDNS의 `Corefile` 플러그인 체인을 읽고 `kubernetes`/`forward`/`cache`/`reload` 등의 역할을 설명한다.
- `search`/`ndots`가 만드는 쿼리를 tcpdump·CoreDNS `log`·메트릭으로 관찰하고, 완화책(끝 점, `ndots` 낮추기, 완전한 FQDN)의 경계 조건을 설명한다.
- `dnsConfig`의 `timeout`·`attempts`·`single-request-reopen`과 `dnsPolicy: None`의 쓰임, `hosts` 플러그인과 `hostAliases`의 범위 차이를 구분한다.
- CoreDNS 자체 캐시와 NodeLocal DNSCache가 각각 해결하는 문제를 구분한다.
- "DNS 조회 실패"를 계층별로 좁혀 원인을 특정한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `getaddrinfo("lobby", ...)`처럼 이름으로 서버를 찾은 뒤 `connect()` | Pod의 짧은 이름 조회(`curl web`) | 애플리케이션은 이름만 알고, IP는 조회 단계가 알려 준다 | 쿠버네티스에서는 조회 결과가 ClusterIP(변하지 않는 가상 IP)이고, Pod가 바뀌어도 이름은 그대로다. 헤드리스 Service면 Pod IP 목록 전체가 온다 |
| 로그인 서버가 들고 있는 채널 서버 목록 | `kubernetes` 플러그인의 레코드 | 서버 목록이 바뀌면 조회 결과도 바뀐다 | 목록은 API 서버를 watch해 CoreDNS **메모리에 미리** 유지된다. 쿼리마다 API 서버를 호출하지 않는다 |
| 설정 파일의 서버 주소 후보 목록을 순서대로 시도 | `search` 목록 | 후보를 앞에서부터 하나씩 시도한다 | 후보가 실패하면 **네트워크 쿼리가 실제로 나간다**. 외부 도메인도 같은 규칙이라 실패 쿼리가 쌓인다(`ndots:5`) |
| 내가 만든 서비스 프로세스 + 그 앞의 접속 주소 | CoreDNS Deployment + `kube-dns` ClusterIP Service | DNS 서버도 하나의 서버 프로세스다 | DNS 쿼리가 DNS 서버 Pod에 닿으려면 ClusterIP → kube-proxy 규칙 → EndpointSlice 경로를 거친다. DNS가 인프라 바깥의 특별한 시스템이 아니다 |
| UDP 소켓으로 보낸 요청이 유실되면 재시도 | DNS 5초 지연(conntrack 경쟁 조건) | UDP는 유실을 앱/라이브러리가 재시도로 메운다 | 유실 원인이 네트워크 선이 아니라 노드 커널의 conntrack 경쟁 조건일 수 있다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. Pod 안에서 `curl web`이라고만 쳤는데 어떻게 `web`이 IP로 바뀔까? 다른 네임스페이스의 `api`는 왜 `api`만으로 안 될까?
> 2. `google.com` 하나를 조회하는데 DNS 쿼리가 몇 번 나갈까? (힌트: 기본 설정은 `ndots:5`)
> 3. CoreDNS Pod가 죽으면 DNS 쿼리는 어떤 경로로 가다가 실패할까? CoreDNS는 어떤 Service 뒤에 있을까?
> 4. 노드가 많은 클러스터에서 "정확히 5초" 걸리는 DNS 조회가 간헐적으로 생긴다면 무엇을 의심할까?
> 5. `dnsPolicy: Default`는 "쿠버네티스의 기본값"일까?
>
> **처리법:** 🛠 실습 `cat /etc/resolv.conf`, `dig @10.96.0.10 ...`, CoreDNS를 0으로 스케일해 장애 관찰 → 클러스터가 있다면 읽자마자 직접 실행 · 🗺 관계도 Pod → resolv.conf → kube-dns ClusterIP → (kube-proxy 규칙) → CoreDNS Pod → `kubernetes`/`forward` 플러그인 · 📦 카드 Corefile 플러그인 9개, `ndots:5`, FQDN 두 형태, `dnsPolicy` 4값, NodeLocal 주소 `169.254.20.10` · 유추 비판 "서버 목록을 쿼리마다 API로 조회한다"는 유추는 어디가 틀린가?

---

## 코어 1. CoreDNS는 플러그인 체인이자 평범한 워크로드

### 1.1 CoreDNS는 플러그인을 엮어 만든 DNS 서버

**한 줄 요약:** `Corefile`에 선언한 플러그인 순서대로 쿼리가 통과하며, 클러스터 이름은 `kubernetes` 플러그인이, 그 밖은 `forward`가 처리한다.

CoreDNS는 범용 DNS 서버라기보다 **플러그인을 체인으로 엮어 동작을 조립하는 프레임워크**다. 설정은 `kube-system`의 ConfigMap에 있다.

```bash
kubectl get configmap coredns -n kube-system -o yaml
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

| 순서 | 플러그인 | 역할 |
|---|---|---|
| 1 | `errors` | 오류를 stdout에 기록 |
| 2 | `health` / `ready` | `/health`, `/ready` 엔드포인트. `lameduck`은 종료 전 유예 시간. readiness 프로브 대상 |
| 3 | `kubernetes` | **핵심.** 쿠버네티스 API를 watch해 Service/Pod 정보를 DNS 레코드로 응답 |
| 4 | `prometheus` | 메트릭 노출(`:9153`) |
| 5 | `forward` | 클러스터 도메인이 아닌 쿼리를 업스트림(보통 노드의 `/etc/resolv.conf`가 가리키는 DNS)으로 전달 |
| 6 | `cache` | 응답 캐싱(`cache 30`은 최대 30초) |
| 7 | `loop` | 자기 자신에게 쿼리가 되돌아오는 무한 루프를 감지 |
| 8 | `reload` | Corefile(ConfigMap)이 바뀌면 자동으로 다시 읽음 |
| 9 | `loadbalance` | 응답 레코드 순서를 라운드 로빈으로 섞음 |

쿼리는 이 체인을 위에서부터 거친다. `*.cluster.local`처럼 `kubernetes` 플러그인이 답할 수 있으면 거기서 응답이 만들어지고, 외부 도메인이면 `forward`가 넘긴다. 즉 `forward . /etc/resolv.conf` 때문에 `google.com` 같은 질의는 **노드의 DNS 설정**으로 간다.

> **[보충]** 이 책의 [2장](../1부-리눅스-네트워크-기초/02-소켓-TCP-포트-DNS-기초.md)에서 다룬 리눅스 DNS 기초(이름 → IP 조회, `/etc/resolv.conf`의 역할)가 그대로 바탕이다. 쿠버네티스는 Pod마다 이 파일을 kubelet이 채워 준다는 점만 다르다.

### 1.2 `kubernetes` 플러그인: watch로 미리 만들어 둔다

**한 줄 요약:** Service/EndpointSlice(필요 시 Pod)를 watch해 메모리 캐시를 실시간 갱신하고, 쿼리는 그 메모리에서 즉시 응답한다.

```
kubernetes 플러그인
  │ watch: Service, EndpointSlice, (필요 시) Pod
  ▼
내부 메모리 캐시(zone 데이터)를 실시간 갱신
  ▼
DNS 쿼리가 오면 이 메모리 캐시에서 즉시 응답 (API 서버를 매번 호출하지 않음)
```

CoreDNS도 client-go 기반 컨트롤러라서, 쿼리마다 API 서버를 부르지 않는다. "읽기는 로컬 캐시에서" 원칙이 DNS 서버에도 그대로 적용된다.

### 1.3 CoreDNS는 평범한 Deployment + ClusterIP Service

**한 줄 요약:** `kube-dns` ClusterIP가 모든 Pod의 `nameserver`이므로, DNS 쿼리도 Service → kube-proxy 데이터플레인 → EndpointSlice의 CoreDNS Pod IP 경로를 그대로 탄다.

> **입문 책에서 배운 것** — CoreDNS는 `kube-system`의 Deployment이고 앞의 `kube-dns` Service IP(예: `10.96.0.10`, 포트 53/UDP·TCP·9153)가 모든 Pod의 `/etc/resolv.conf` `nameserver`에 들어가며, 이름이 `kube-dns`인 것은 옛 구현의 하위 호환이다([입문 책 22장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/22-DNS와-서비스-디스커버리.md)). `10.96.0.10`은 Service CIDR의 10번째 주소로 관례상 고정되고, CoreDNS는 보통 2개 이상의 레플리카로 배포된다.

이 `nameserver` 값은 kubelet이 Pod를 만들 때 `--cluster-dns` 플래그(기본적으로 `kube-dns` Service의 ClusterIP)를 참조해 주입한다. 그러므로 **Pod에서 나가는 DNS 쿼리는 16·17장에서 배운 것과 완전히 같은 경로**(ClusterIP → kube-proxy 규칙 → EndpointSlice의 CoreDNS Pod IP)를 거친다.

```
Pod의 앱 ──(UDP 53)──▶ 10.96.0.10 (kube-dns ClusterIP, 가상 IP)
                         │  노드 커널의 iptables/IPVS 규칙이 DNAT
                         ▼
                    CoreDNS Pod IP (EndpointSlice의 ready 엔드포인트)
                         │
                         ├─ *.cluster.local → kubernetes 플러그인 (메모리 캐시)
                         └─ 그 외        → forward → 노드의 resolv.conf가 가리키는 DNS
```

이 구조 때문에 "DNS가 안 된다"는 곧잘 "Service 경로가 안 된다"로 귀결된다. 뒤의 진단 순서(코어 3)가 이것을 이용한다.

### 1.4 CoreDNS 레플리카 수와 커스텀 설정

**한 줄 요약:** 클러스터가 커지면 레플리카를 늘린다(수동 또는 cluster-proportional-autoscaler). 커스텀 규칙은 Corefile에 추가하고 `reload`가 반영한다.

- `cluster-proportional-autoscaler`는 CPU·메모리 지표가 아니라 **노드 수·코어 수에 비례하는 선형 공식**으로 `replicas`를 갱신한다.

```yaml
# cluster-proportional-autoscaler의 ConfigMap 설정 예
linear:
  coresPerReplica: 256
  nodesPerReplica: 16
  min: 2
```

- 수동 조정은 `kubectl scale deployment coredns -n kube-system --replicas=4`. 필요량의 대략적 기준으로 원천은 `노드 수 / 16 + Pod 수 / 256`을 들면서도 "실제로는 메트릭을 봐야 한다"고 적는다.
- 특정 도메인만 다른 DNS로 보내는 예(원천 그대로):

```
corp.example.com:53 {
    errors
    cache 30
    forward . 10.10.0.53 10.10.0.54
}
```

- 이름 치환(rewrite)과 호스트 항목 추가(hosts)도 Corefile에 쓴다.

```
rewrite name legacy-payments.default.svc.cluster.local payments.default.svc.cluster.local
```

```
hosts {
    192.168.1.100 legacy-app.internal
    fallthrough
}
```

`reload` 플러그인이 ConfigMap 변경을 감지해 프로세스 재시작 없이 다시 읽는다(반영까지 최대 30초 정도 걸릴 수 있다). 확실히 하려면 `kubectl rollout restart deployment coredns -n kube-system`. 원천은 Corefile을 직접 수정하면 클러스터 업그레이드 시 덮어써질 수 있다고 경고한다.

> **[보충]** 두 원천은 반영 지연을 "최대 수십 초"(internals)와 "최대 30초"(textbook)로 다르게 적는다. 정확한 값은 환경에 따르므로 이 책에서는 "수십 초 안팎"으로만 이해해 둔다. 또 `reload`가 동작하는 중에도 Corefile 문법 오류가 있으면 재시작이 실패할 수 있다(원천 증상표).

---

## 코어 2. 이름 규칙과 search/ndots

### 2.1 레코드 종류와 이름의 확장 형태

**한 줄 요약:** 이름 규칙 자체는 입문 책과 같고, 이 책은 SRV와 `hostname`/`subdomain`처럼 포트·Pod 단위로 이름을 얻는 형태를 더한다.

> **입문 책에서 배운 것** — Service FQDN은 `<service>.<namespace>.svc.<cluster-domain>`이고, 일반 Service는 ClusterIP 하나, 헤드리스는 모든 Ready Pod IP, ExternalName은 CNAME을 돌려준다. StatefulSet Pod는 헤드리스 이름 앞에 `<pod>`가 붙고 재생성돼도 이름이 유지된다([입문 책 22장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/22-DNS와-서비스-디스커버리.md)).

- **SRV 레코드**: 이름 있는 포트를 `_<port-name>._<protocol>.<service>.<namespace>.svc.cluster.local`로 조회한다. 포트 번호를 하드코딩하지 않고 발견할 수 있어 Kafka나 Consul 같은 시스템이 활용한다(원천). 포트에 이름을 주지 않았다면 결과가 비어 있을 수 있다.

```bash
dig +short SRV _http._tcp.web.default.svc.cluster.local
# 0 100 8080 10-244-1-3.web.default.svc.cluster.local.
```

- **일반 Pod의 이름**: IP 기반 A 레코드 `<ip-with-dashes>.<namespace>.pod.cluster.local`(예: `10-244-1-3.default.pod.cluster.local`)이 있지만 거의 쓸 일이 없다. 대신 Pod 스펙에 `hostname`과 `subdomain`을 주면 더 쓸 만한 이름이 생긴다. 단, `subdomain`과 같은 이름의 헤드리스 Service가 있어야 한다.

```yaml
spec:
  hostname: worker-a
  subdomain: workers        # 이 이름의 헤드리스 서비스가 있어야 함
```
```
worker-a.workers.default.svc.cluster.local
```

> **🎮 연결** — 게임 서버의 "방 서버 3번" 같은 고정 이름이 필요한 상태 있는 서버가 헤드리스 + StatefulSet(또는 `hostname`/`subdomain`) 조합이다. 일반 Service의 이름은 로드밸런싱된 "아무 서버"를, 헤드리스의 개별 이름은 "그 서버"를 가리킨다.

### 2.2 search와 ndots의 비용을 눈으로 세기

**한 줄 요약:** 확장 규칙은 입문 책과 같지만, 후보 하나하나가 실제 DNS 쿼리라서 tcpdump·CoreDNS `log`·메트릭으로 직접 셀 수 있다.

> **입문 책에서 배운 것** — `search default.svc.cluster.local svc.cluster.local cluster.local`과 `ndots:5` 때문에 점이 5개 미만인 이름은 접미사 3개를 먼저 붙여 보고(`google.com` 하나가 A/AAAA까지 최대 8쿼리), 해결은 끝에 점 붙이기·`ndots` 낮추기·내부도 FQDN이다([입문 책 22장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/22-DNS와-서비스-디스커버리.md)).

이 규칙은 Pod 안의 리졸버가 `resolv.conf`만 보고 적용하므로, 후보 하나하나가 별개의 질의로 CoreDNS까지 도달하고 없는 이름이면 `NXDOMAIN` 응답이 돌아온다. 그래서 낭비는 **CoreDNS 쪽 로그와 카운터에 그대로 남는다.**

> **[보충]** 두 원천은 같은 규칙을 서로 다른 예(`www.example.com` 점 2개, `google.com` 점 1개)로 설명한다. 어느 쪽이든 점이 5개 미만이면 search를 먼저 거치고, 외부 이름은 앞의 3번이 헛수고라는 결론은 같다.

**① CoreDNS `log` 플러그인으로 질의를 그대로 본다.** Corefile 첫 줄 아래에 `log`를 추가하고 재시작한 뒤 로그를 따라간다(원천 실습).

```bash
kubectl edit configmap coredns -n kube-system        # .:53 { 아래에 log 추가
kubectl rollout restart deployment coredns -n kube-system
kubectl logs -n kube-system -l k8s-app=kube-dns -f
```

다른 터미널에서 `getent hosts api.shop`을 실행하면 search 후보가 순서대로 찍힌다.

```
[INFO] 10.244.1.9:47251 - 12345 "A IN api.shop.default.svc.cluster.local. udp 63 false 512" NXDOMAIN
[INFO] 10.244.1.9:47251 - 12346 "A IN api.shop.svc.cluster.local. udp 55 false 512" NOERROR
```

`NXDOMAIN` 줄 뒤에 `NOERROR` 줄이 이어지는 것이 "다음 후보로 넘어갔다"는 증거다. 트래픽이 많은 클러스터에서 `log`를 켜 두면 로그가 폭증하므로 확인이 끝나면 반드시 제거한다.

**② Pod 안에서 tcpdump로 센다.** 디버그 Pod(`nicolaka/netshoot`) 안에서 53번 포트를 잡고 같은 요청을 짧은 이름과 절대 이름으로 비교한다.

```bash
tcpdump -i any -n -l port 53 &
curl -s -o /dev/null google.com      # google.com.default.svc.cluster.local 같은 실패 쿼리가 보인다
curl -s -o /dev/null google.com.     # 끝에 점: 쿼리 수가 확연히 준다
```

시간으로도 잴 수 있다. `time (for i in $(seq 1 50); do getent hosts google.com > /dev/null; done)`와 `google.com.`을 쓴 같은 루프를 비교한다.

**③ 규모는 CoreDNS 메트릭으로 본다.** `ndots:5`와 `ndots:1` + FQDN 두 배포에 같은 외부 호출 부하를 주고 증가량을 비교하는 것이 원천의 과제다.

```bash
kubectl port-forward -n kube-system svc/kube-dns 9153:9153 &
curl -s localhost:9153/metrics | grep -E 'coredns_dns_requests_total|coredns_dns_request_duration'
```

> **🎮 연결** — 이름 해석은 `getaddrinfo()` 한 번이지만 그 뒤에서는 위 로그의 줄 수만큼 UDP 왕복이 일어난다. [2장](../1부-리눅스-네트워크-기초/02-소켓-TCP-포트-DNS-기초.md)에서 본 대로 이 호출은 동기 블로킹이라, 이벤트 루프 안에서 부르면 이 모든 대기가 서버 전체의 지연으로 번진다. 참고로 Docker 사용자 정의 네트워크 컨테이너의 `resolv.conf`는 `ndots:0`이다([9장](../2부-Docker-네트워크/09-Docker-DNS와-서비스-디스커버리.md)). 같은 짧은 이름이 쿠버네티스에서는 search를 먼저 거친다.

### 2.3 완화책의 경계 조건

**한 줄 요약:** 세 가지 완화책(끝에 점, `ndots` 낮추기, 완전한 FQDN)은 입문 책과 같고, 깊이는 "어디까지 낮추면 무엇이 깨지는가"에 있다.

- `ndots`를 너무 낮추면 클러스터 내부의 짧은 이름 조회가 실패할 수 있다. 예를 들어 `ndots:1`이면 점이 1개 이상인 이름은 곧바로 절대 이름으로 취급되어 `postgres.database` 같은 이름이 search를 거치지 않는다. 그래서 매니페스트에서 FQDN을 써야 한다.
- textbook은 `ndots:2`로도 `google.com`(점 1개)은 여전히 2 미만이라 search를 시도하므로, 확실히 막으려면 `ndots:1`이라고 짚는다.
- 절충안은 내부 통신이 많은 워크로드는 기본값을 유지하고 외부 API 호출이 많은 워크로드만 `ndots:1` + FQDN이다.
- 클러스터 내부 FQDN도 끝의 점이 핵심이다. `postgres.database.svc.cluster.local.`은 점이 4개라 `ndots:5` 미만이지만, 끝의 마침표 덕분에 한 번에 해결된다.

### 2.4 `dnsPolicy`와 `dnsConfig`

**한 줄 요약:** `dnsPolicy`는 이 Pod가 CoreDNS를 거칠지를, `dnsConfig`는 그 위의 세부 값(`timeout`·`attempts` 등)을 정한다.

> **입문 책에서 배운 것** — `ClusterFirst`(기본) / `ClusterFirstWithHostNet` / `Default`(기본값이 아니라 노드의 resolv.conf 상속) / `None`의 네 값, 그리고 `hostNetwork: true` Pod는 `Default`처럼 동작하므로 `ClusterFirstWithHostNet`을 명시해야 한다는 함정([입문 책 22장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/22-DNS와-서비스-디스커버리.md)).

`dnsConfig`에는 추가 nameserver·search·옵션을 넣을 수 있고, 이 중 `timeout`·`attempts`·`single-request-reopen`은 앞 절의 지연을 직접 줄이는 손잡이다(원천 예시).

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

사내 DNS를 쓰되 클러스터 이름도 풀어야 한다면 `dnsPolicy: None` + `dnsConfig`에 CoreDNS ClusterIP(`10.96.0.10`)를 유지한 채 사내 DNS 서버를 nameserver로 추가하고, 클러스터 search 목록 3개와 사내 search를 직접 적는다.

**이름을 DNS 바깥에서 고정하는 두 방법의 범위 차이.** CoreDNS의 `hosts` 플러그인(코어 1.4)은 Corefile 한 곳에서 **클러스터의 모든 Pod**에 보이는 항목을 만든다. `hostAliases`는 **그 Pod 하나**의 `/etc/hosts`에 직접 매핑한다. 후자는 DNS를 거치지 않으므로 원천은 임시 우회·테스트용이고 IP가 바뀌면 매니페스트를 고쳐야 하므로 영구 해법으로는 부적절하다고 한다.

```yaml
spec:
  hostAliases:
    - ip: "192.168.1.100"
      hostnames:
        - "legacy.internal"
        - "old-api"
```

---

## 코어 3. 캐시, NodeLocal DNSCache, 진단 순서

### 3.1 CoreDNS 자체 캐시

**한 줄 요약:** `cache` 플러그인은 응답을 레코드 TTL 동안 메모리에 둔다. 같은 이름의 반복 조회는 이 층에서 끝난다.

`cache 30`은 최대 30초 캐싱이다. 브라우저의 반복 요청이나 커넥션 풀이 주기적으로 재조회하는 경우, 쿼리가 `kubernetes` 플러그인 내부 캐시까지 갈 필요 없이 이 층에서 끝난다.

### 3.2 5초 지연의 정체: UDP conntrack 경쟁 조건

**한 줄 요약:** 모든 DNS 쿼리가 ClusterIP DNAT를 거치며 UDP conntrack 항목을 만들고, 동시 쿼리가 많으면 경쟁 조건으로 패킷이 유실된다.

중앙 CoreDNS로 모든 노드의 모든 Pod가 쿼리를 보내면 ClusterIP → kube-proxy 데이터플레인 → CoreDNS Pod 경로에서 **UDP 커넥션마다 conntrack 항목**이 생긴다. 쿼리가 급증하면 conntrack에 부하가 몰리고, 드물게 경쟁 조건(race condition)으로 패킷이 유실된다. 원천(textbook)은 이것을 리눅스 커널의 알려진 문제로, **DNS 조회가 정확히 5초 걸리는** 악명 높은 증상(resolver 재시도 타임아웃이 5초)의 원인이라 하고, 원천(internals)은 5초 타임아웃 뒤 `SERVFAIL`로 실패하는 현상까지 언급한다. conntrack과 DNAT의 원리는 [5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md), Service 경로는 [17장](17-kube-proxy-데이터플레인.md)에서 다뤘다.

> **[보충]** 두 원천의 서술이 약간 다르다. internals는 "5초 타임아웃 뒤 SERVFAIL", textbook은 "정확히 5초 걸림"이다. 같은 현상의 두 얼굴로 읽으면 된다. 이 책에서는 "정확히 5초 지연, 심하면 SERVFAIL"로 기억한다.

### 3.3 NodeLocal DNSCache

**한 줄 요약:** 노드마다 DaemonSet으로 링크-로컬 주소(`169.254.20.10`)에 캐시를 두어, 캐시 히트 시 노드를 벗어나지 않고 conntrack 경합도 피한다.

```
[변경 전]
Pod → (UDP, conntrack) → kube-dns Service → CoreDNS Pod (다른 노드일 수 있음)

[변경 후]
Pod → (같은 노드의 로컬 IP, conntrack 우회) → node-local-dns
                                                    │ 캐시 미스 시
                                                    └→ (TCP) → CoreDNS
```

1. 각 노드에 DaemonSet으로 캐싱 에이전트를 실행하고 링크-로컬 IP에서 리스닝한다.
2. Pod의 DNS 쿼리가 이 에이전트로 향하게 한다(kubelet의 `--cluster-dns` 조정 또는 각 노드의 iptables 규칙으로 가로채기).
3. 캐시에 있으면 즉시 응답한다. 노드를 벗어나지 않으므로 conntrack 부하가 없다.
4. 캐시 미스면 중앙 CoreDNS로 간다. 이 구간만 기존 경로를 탄다.

효과는 두 가지다. 캐시 히트 시 노드를 벗어나지 않아 CoreDNS 부하와 홉이 준다. 그리고 링크-로컬 주소 통신은 conntrack을 우회해 5초 타임아웃 문제를 해소한다. textbook은 업스트림 구간이 **TCP**를 써서 UDP 유실을 피한다고 적고, 노드가 100개를 넘거나 질의량이 많은 클러스터에서는 사실상 필수라고 한다.

설치 시 매니페스트의 `__PILLAR__` 자리표시자를 값으로 바꿔야 한다. `__PILLAR__DNS__SERVER__`는 `10.96.0.10`(kube-dns ClusterIP), `__PILLAR__LOCAL__DNS__`는 `169.254.20.10`, `__PILLAR__DNS__DOMAIN__`은 `cluster.local`이다. 대부분의 매니지드 서비스는 옵션 하나로 켤 수 있다.

> **[보충]** "노드 밖으로 트래픽을 내보내지 않는다"는 발상이 `internalTrafficPolicy: Local`과 같은 문제의식이라는 설명은 internals가 한 말이며, [16장](16-Service와-EndpointSlice.md)의 해당 절과 함께 읽으면 연결된다.

### 3.4 DNS 장애는 위에서 아래로 좁힌다

**한 줄 요약:** CoreDNS Pod → Service/EndpointSlice → Pod의 resolv.conf → ClusterIP로 직접 질의 → 간헐성 여부.

```
DNS 조회 실패
   │
   ├─ ① CoreDNS Pod가 살아 있고 Ready인가?
   │    kubectl get pods -n kube-system -l k8s-app=kube-dns
   │
   ├─ ② kube-dns Service와 EndpointSlice가 정상인가?
   │    kubectl get endpointslice -n kube-system -l kubernetes.io/service-name=kube-dns
   │    → 비어 있다면 16장의 흐름(셀렉터 불일치, readiness 실패)을 그대로 적용
   │
   ├─ ③ Pod 내부의 /etc/resolv.conf가 정상인가?
   │    kubectl exec <pod> -- cat /etc/resolv.conf
   │
   ├─ ④ ClusterIP로 직접 질의가 되는가? (kube-proxy 계층 분리)
   │    kubectl exec <pod> -- dig @<kube-dns ClusterIP> payments.default.svc.cluster.local
   │    → 안 되면 17장의 데이터플레인 문제(iptables/IPVS 규칙, conntrack) 의심
   │    → 되는데 앱에서만 실패하면 애플리케이션의 리졸버 설정 문제
   │
   └─ ⑤ 간헐적으로만 실패하는가? (conntrack 경쟁 조건)
        → 부하가 몰릴 때만 SERVFAIL/타임아웃 → NodeLocal DNSCache 검토
```

④의 변형으로 textbook은 CoreDNS Pod IP로 직접 질의(`dig @<coredns-pod-ip> ...`)하는 방법을 든다. Service로는 안 되는데 Pod IP로는 되면 kube-proxy 문제다. 디버그 Pod는 `kubectl run dns-debug --rm -it --image=nicolaka/netshoot --restart=Never -- bash`로 띄운다.

**증상별 원인표**

| 증상 | 유력 원인 |
|---|---|
| 모든 Pod에서 모든 DNS 조회 실패 | CoreDNS Pod 다운, `kube-dns` Service 자체 문제 |
| 특정 노드의 Pod만 실패 | 그 노드의 kube-proxy·CNI 문제, 또는 NodeLocal DNSCache 에이전트 다운 |
| 내부 이름은 되는데 외부 도메인만 실패 | `forward` 설정, 업스트림 DNS(노드의 `/etc/resolv.conf`) 문제 |
| 내부만 실패 | `kubernetes` 플러그인, RBAC(CoreDNS 로그, ServiceAccount 권한) |
| 외부 도메인 조회가 유독 느림 | `ndots` 기본값으로 인한 불필요한 search 시도 |
| 부하 몰릴 때만 간헐적 `SERVFAIL`/타임아웃, 정확히 5초 지연 | UDP conntrack 경쟁 조건 — NodeLocal DNSCache 검토(`single-request-reopen`도 완화책으로 언급) |
| 특정 네임스페이스만 | NetworkPolicy가 DNS를 차단([21장](21-NetworkPolicy와-네트워크-보안.md)) |
| `i/o timeout` | UDP 패킷 유실, MTU 문제([23장](../4부-진단/23-네트워크-장애-진단.md)) |
| CoreDNS 로그에 `loop detected` | 노드 resolv.conf가 자기 자신을 가리킴(systemd-resolved 스텁 문제) |
| 설정을 바꿨는데 반영 안 됨 | `reload` 반영 주기 대기, 또는 Corefile 문법 오류로 재시작 실패 |

---

## 실무 적용

### 체크리스트

- [ ] 애플리케이션의 서버 간 접속 주소는 Pod IP가 아니라 Service 이름(같은 네임스페이스는 짧은 이름, 다른 네임스페이스는 `이름.네임스페이스`)으로 쓴다.
- [ ] 외부 도메인을 자주 호출하는 워크로드는 끝에 점을 붙인 FQDN을 쓰거나 `ndots`를 낮추는 것을 검토한다. `ndots`를 낮췄다면 내부 짧은 이름 조회가 여전히 되는지 확인한다.
- [ ] `hostNetwork: true` Pod에는 `dnsPolicy: ClusterFirstWithHostNet`을 명시한다. `dnsPolicy: Default`는 쿠버네티스 기본값이 아니다.
- [ ] 노드가 많거나 DNS 질의량이 큰 클러스터라면 NodeLocal DNSCache와 CoreDNS 레플리카 자동 조정(cluster-proportional-autoscaler)을 검토한다.
- [ ] CoreDNS 설정은 ConfigMap으로 바꾸고(`reload`), 실습 때 켠 `log` 플러그인은 반드시 제거한다(트래픽이 많으면 로그가 폭증).
- [ ] 기본 거부 NetworkPolicy를 적용할 때 `kube-system`의 `k8s-app: kube-dns`로 향하는 UDP/TCP 53 egress를 함께 허용한다.
- [ ] DNS 장애는 5단계 순서(CoreDNS Pod → Service/EndpointSlice → resolv.conf → ClusterIP 질의 → 간헐성)로 진단한다.

### 시나리오로 확인하기

1. **상황:** 외부 결제 API를 초당 수백 번 호출하는 게임 서버 Pod가 있다. 지연이 길고 CoreDNS CPU가 높다. 서버 설정에는 `api.pay.example.com`이 적혀 있다.
   **질문:** 의심 부품과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   `ndots:5` 때문에 점이 5개 미만인 외부 이름이 search 목록(`...default.svc.cluster.local`, `...svc.cluster.local`, `...cluster.local`)을 먼저 거치며 실패 쿼리를 만들고, A/AAAA까지 겹쳐 쿼리 수가 늘어난다. 설정값을 `api.pay.example.com.`처럼 끝에 점을 붙인 절대 이름으로 바꾸거나, 이 워크로드에만 `dnsConfig`로 `ndots`를 낮춘다(낮추면 내부 짧은 이름이 깨지는지 확인). 확인은 `tcpdump -i any -n port 53`으로 실패 쿼리가 보이는지 보면 된다. → 코어 2

   </details>

2. **상황:** 부하 테스트 때만 일부 요청이 정확히 5초씩 걸린다. CoreDNS Pod는 정상이고 평소에는 문제없다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   동시 UDP DNS 쿼리가 많을 때 conntrack 경쟁 조건으로 패킷이 유실되어 resolver 재시도 타임아웃(5초)이 그대로 지연으로 나타나는 증상이다. NodeLocal DNSCache를 도입해 링크-로컬 주소로 conntrack을 우회하고 업스트림을 TCP로 보낸다. 완화책으로 `single-request-reopen` 옵션도 원천에 언급된다. 반복 질의로 재현하는 명령은 `for i in $(seq 1 50); do dig +short +time=1 +tries=1 payments.default.svc.cluster.local || echo "FAIL #$i"; done`이다. → 코어 3

   </details>

3. **상황:** shop 네임스페이스에 기본 거부 egress 정책을 걸었더니 모든 서비스 호출이 "이름을 못 찾는다"며 실패한다.
   **질문:** 무엇을 놓쳤나?

   <details markdown="1"><summary>답 확인</summary>

   DNS egress 허용이다. 기본 거부는 CoreDNS로 가는 UDP/TCP 53도 막는다. `kube-system` 네임스페이스의 `k8s-app: kube-dns` Pod로 향하는 53 포트를 허용하는 정책을 추가한다. 원천(textbook)은 NetworkPolicy 적용 후 모든 것이 깨진 사고의 90%가 DNS 차단이라고 적는다. → 코어 3(증상표), [21장](21-NetworkPolicy와-네트워크-보안.md)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
[코어 1] CoreDNS
  Corefile = ( ? ) 체인: errors → health/ready → ( ? ) → prometheus → ( ? ) → cache → loop → reload → loadbalance
  kubernetes 플러그인: API 서버를 ( ? )해 메모리 캐시 유지, 쿼리마다 API 호출 ( ? )
  앞단 Service 이름 ( ? ), ClusterIP 관례 ( ? ) → 모든 Pod의 nameserver
  → DNS 쿼리도 ( ? ) → kube-proxy 규칙 → EndpointSlice 경로

[코어 2] 이름과 비용
  SRV 조회 이름: _<( ? )>._<protocol>.<service>.<ns>.svc.cluster.local
  Pod hostname/subdomain 이름이 생기려면 subdomain과 같은 이름의 ( ? ) Service 필요
  ndots 기본 ( ? ) → 점이 그보다 ( ? )면 search 먼저, 후보마다 실제 ( ? ) 발생
  관측 3: Pod 안 ( ? ) / CoreDNS ( ? ) 플러그인(NXDOMAIN→NOERROR 줄) / 메트릭 coredns_dns_requests_total
  ndots를 1로 낮추면 깨지는 것: ( ? ) 같은 두 단계 이름 → FQDN 필요
  dnsConfig 옵션: timeout 기본 ( ? )초 → 2초, attempts, ( ? )
  hosts 플러그인 = ( ? ) 범위 / hostAliases = Pod ( ? ) 범위

[코어 3] 캐시와 진단
  cache 30 = 최대 ( ? )초
  NodeLocal DNSCache: 주소 ( ? ), 효과 = ( ? ) 우회 + 캐시 히트 시 노드 이탈 없음
  진단 5단계: CoreDNS Pod → Service/( ? ) → ( ? ) → ClusterIP 직접 질의 → ( ? )
```

### 2. 인출 질문

1. CoreDNS는 `*.cluster.local` 이름을 어떻게 즉시 답할 수 있는가? API 서버를 매번 호출하는가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. `kubernetes` 플러그인이 Service/EndpointSlice(필요 시 Pod)를 watch해 메모리 캐시(zone 데이터)를 실시간으로 유지하고, 쿼리는 그 메모리에서 응답한다. → 코어 1 (1.2)

   </details>

2. Pod 안의 DNS 쿼리가 CoreDNS Pod에 닿기까지 어떤 경로를 거치는가?

   <details markdown="1"><summary>답 확인</summary>

   `/etc/resolv.conf`의 `nameserver`(kube-dns Service의 ClusterIP, kubelet이 `--cluster-dns`로 주입) → 노드의 kube-proxy 규칙(iptables/IPVS)으로 DNAT → EndpointSlice의 CoreDNS Pod IP. 일반 Service 경로와 같다. → 코어 1 (1.3)

   </details>

3. CoreDNS `log`에 `NXDOMAIN` 줄 바로 뒤에 `NOERROR` 줄이 이어서 찍혔다. 무슨 일이 있었던 것이고, 이 확인을 마친 뒤 반드시 할 일은?

   <details markdown="1"><summary>답 확인</summary>

   Pod의 리졸버가 search 후보를 순서대로 시도한 흔적이다(예: `api.shop.default.svc.cluster.local.`이 `NXDOMAIN`, 다음 후보 `api.shop.svc.cluster.local.`이 `NOERROR`). 각 후보가 실제 질의로 CoreDNS에 닿는다는 증거다. 트래픽이 많으면 로그가 폭증하므로 확인 후 `log` 플러그인을 제거한다. → 코어 2 (2.2)

   </details>

4. 외부 호출 지연의 원인이 `ndots`라는 것을 어떤 증거로 확정하고, 고친 뒤 무엇이 줄었는지 어떻게 보이는가? `ndots`를 낮출 때 깨질 수 있는 것은?

   <details markdown="1"><summary>답 확인</summary>

   Pod 안 `tcpdump -i any -n port 53`에서 `google.com.default.svc.cluster.local` 같은 실패 쿼리가 보이는지, 절대 이름(끝에 점)으로 바꾸면 쿼리 수가 준다는 점을 본다. 규모는 `ndots:5`와 `ndots:1` + FQDN 두 배포의 `coredns_dns_requests_total` 증가량으로 비교한다. 낮출 때는 `postgres.database` 같은 점이 있는 내부 이름이 search를 거치지 않으므로 FQDN을 써야 하고, `ndots:2`로는 `google.com`(점 1개)을 못 막아 `ndots:1`이 필요하다. → 코어 2 (2.2, 2.3)

   </details>

5. `dnsPolicy`의 `Default`와 `ClusterFirstWithHostNet`은 무엇이 다르며, 왜 `hostNetwork: true`가 문제인가?

   <details markdown="1"><summary>답 확인</summary>

   `Default`는 이름과 달리 기본값이 아니고 노드의 resolv.conf를 그대로 상속해 클러스터 이름을 못 푼다. `hostNetwork: true` Pod는 자동으로 `Default`처럼 동작하므로, `ClusterFirstWithHostNet`을 명시해야 `ClusterFirst`와 같은 효과를 얻는다. `dnsConfig`로는 `timeout`(기본 5초→2초)·`attempts`·`single-request-reopen`을 조정할 수 있다. → 코어 2 (2.4)

   </details>

6. NodeLocal DNSCache는 어떤 두 문제를 풀고, 어떻게 5초 지연을 피하는가?

   <details markdown="1"><summary>답 확인</summary>

   중앙 CoreDNS로 몰리는 쿼리량(홉 포함)과 UDP conntrack 경쟁 조건. 노드마다 DaemonSet 캐시를 링크-로컬 IP(`169.254.20.10`)에 두어, 캐시 히트 시 노드를 벗어나지 않고 conntrack을 우회하며, 미스 시 업스트림으로는 TCP를 쓴다. → 코어 3 (3.3)

   </details>

7. "DNS 조회가 안 된다"를 받았을 때 처음 세 가지로 무엇을 확인하는가?

   <details markdown="1"><summary>답 확인</summary>

   ① CoreDNS Pod가 Ready인가(`kubectl get pods -n kube-system -l k8s-app=kube-dns`) ② `kube-dns` Service의 EndpointSlice가 비어 있지 않은가 ③ Pod의 `/etc/resolv.conf`가 올바른가(nameserver가 kube-dns ClusterIP인가, search/ndots 정상인가). 그다음 ClusterIP로 직접 `dig`, 마지막으로 간헐성. → 코어 3 (3.4)

   </details>

8. 내부 이름은 되는데 외부 도메인만 안 된다. 어디를 보는가?

   <details markdown="1"><summary>답 확인</summary>

   `forward` 플러그인 설정과 업스트림 DNS(노드의 `/etc/resolv.conf`). → 코어 1 (1.1), 코어 3 (증상표)

   </details>

### 3. 기억 고리

- **C++ 유추:** `search` 목록 = "서버 이름 후보를 앞에서부터 하나씩 `connect` 시도하는 폴백 루프". ⚠️ 깨지는 곳: 후보 하나하나가 **실제 DNS 쿼리**이고, 외부 이름에서도 앞의 후보 3개가 항상 실패한다. 후보 호출 비용이 공짜가 아니다.
- **비유:** 클러스터 DNS = 회사 내선 전화번호부 + 안내 데스크. 짧은 이름은 "우리 부서 번호부"부터 뒤지고 없으면 사내 전체, 그다음 외부로 넘긴다. ⚠️ 깨지는 지점: 안내 데스크(CoreDNS)도 사원(Pod)이 일하는 같은 건물의 평범한 부서라서, 안내 데스크로 가는 길이 막히면 번호부 조회 자체가 안 된다.
- **묶음(3의 법칙):** 코어 3개(플러그인 체인 / 이름 규칙·ndots / 캐시·진단), 완화책 3개(끝에 점 / ndots / FQDN), 이름 3계층(짧은 이름 → `ns.svc.cluster.local` → 절대 이름), search 목록 3개.
- **대칭·순서:** 위에서 아래로 진단(CoreDNS → Service → resolv.conf → ClusterIP → 간헐성). 대비 쌍: `ClusterFirst` vs `Default`, 일반 Service(ClusterIP 하나) vs 헤드리스(모든 Pod IP).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`curl web`이 실제로 어떤 과정을 거쳐 IP가 되는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "`getaddrinfo` 한 번이 클러스터에서는 왜 여러 번의 UDP 패킷이 되고, 그 패킷은 어떤 경로로 DNS 서버에 닿는가"를 설명해 보세요.
- **랜덤 논리 게임:** A "외부 API 호출 워크로드는 `ndots:1`로 낮춰야 한다" vs B "기본값 `ndots:5`를 건드리지 말고 FQDN 끝에 점을 붙이는 게 낫다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 CoreDNS 플러그인 체인과 ndots 문제를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/16-DNS와-서비스-디스커버리.md (16.1 CoreDNS 아키텍처, 16.2 FQDN과 search, 16.3 캐시와 성능, 16.4 트러블슈팅); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/10-DNS와-서비스-디스커버리.md (10.1 CoreDNS, 10.2 DNS 레코드 규칙, 10.3 ndots, 10.4 DNS 정책, 10.5 NodeLocal DNSCache, 10.6 DNS 문제 진단, 10.7 DNS 전체 흐름 추적의 CoreDNS `log` 관찰); docker-fundamental/15_DNS와_서비스_디스커버리_포트_매핑의_내부_동작.md (15.1 내장 DNS의 `ndots:0` 대조)*
