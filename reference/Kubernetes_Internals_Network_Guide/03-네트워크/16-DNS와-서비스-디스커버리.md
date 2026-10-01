---
title: "16장. DNS와 서비스 디스커버리"
---

# 16장. DNS와 서비스 디스커버리

> **학습목표**
> - CoreDNS의 플러그인 체인 구조와 `Corefile` 문법을 읽고 각 플러그인의 역할을 설명할 수 있다.
> - `kubernetes` 플러그인이 Service·EndpointSlice·Pod 정보를 어떻게 DNS 레코드로 바꾸는지 설명할 수 있다.
> - FQDN 명명 규칙과 search domain, `ndots` 설정이 조회 성능에 미치는 영향을 설명하고 완화할 수 있다.
> - CoreDNS 자체 캐시와 NodeLocal DNSCache가 각각 어떤 문제를 해결하는지 구분할 수 있다.
> - "DNS 조회 실패" 증상을 계층별로 좁혀 원인을 특정할 수 있다.
> - CoreDNS 설정을 직접 변경·재적용해 커스텀 동작을 구성할 수 있다.

---

## 들어가며

14.3절에서 서비스 디스커버리 두 방식을 비교하며 "DNS 방식이 항상 선호된다"고 했다. 이 장은 그 약속을 지킨다. `payments`라는 세 글자가 실제 ClusterIP로 바뀌기까지 무슨 일이 일어나는지, 그리고 그 과정에서 왜 성능 문제와 간헐적 장애가 생기는지를 끝까지 따라간다.

먼저 한 가지를 분명히 하고 시작한다 — **CoreDNS도 결국 하나의 워크로드다.** 클러스터 안에서 CoreDNS는 Deployment로 떠 있고, 그 앞에는 평범한 ClusterIP Service(`kube-dns`)가 있다. 즉 14~15장에서 배운 모든 것 — EndpointSlice, iptables/IPVS DNAT, 로드밸런싱 확률 — 이 **DNS 쿼리 자체를 CoreDNS Pod로 보내는 과정에도 그대로 적용된다.** DNS는 이 책의 네트워크 스택 바깥에 있는 별도 시스템이 아니라, 지금까지 배운 스택 위에서 동작하는 하나의 애플리케이션일 뿐이다.

## 16.1 CoreDNS 아키텍처와 플러그인 체인

### 플러그인 체인으로서의 DNS 서버

CoreDNS는 범용 DNS 서버가 아니라 **플러그인을 체인으로 엮어 동작을 조립하는 프레임워크**다. 설정 파일(`Corefile`)에서 어떤 플러그인을 어떤 순서로 쓸지 선언하면, 들어온 DNS 쿼리가 그 순서대로 각 플러그인을 통과하며 처리된다.

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

**순서가 의미를 갖는다.**

| 순서 | 플러그인 | 역할 |
|---|---|---|
| 1 | `errors` | 오류를 stdout에 로깅 |
| 2 | `health` / `ready` | 자체 헬스체크 엔드포인트 — kubelet/Service의 liveness·readiness 프로브 대상 |
| 3 | `kubernetes` | **핵심.** 쿠버네티스 API 서버를 watch해 Service/Pod 정보를 DNS 레코드로 응답 |
| 4 | `prometheus` | 메트릭 노출 |
| 5 | `forward` | `kubernetes` 플러그인이 답하지 못한(클러스터 내부 도메인이 아닌) 쿼리를 업스트림(보통 노드의 `/etc/resolv.conf`가 가리키는 DNS)으로 전달 |
| 6 | `cache` | 응답 캐싱 (16.3절) |
| 7 | `loop` | 자기 자신에게 쿼리가 되돌아오는 무한 루프를 감지해 CoreDNS를 재시작 |
| 8 | `reload` | Corefile(ConfigMap)이 바뀌면 프로세스 재시작 없이 **자동으로 다시 읽음** |
| 9 | `loadbalance` | 여러 A/AAAA 레코드가 있을 때 응답 순서를 라운드로빈으로 섞음 |

쿼리 하나가 들어오면 이 체인을 위에서부터 순서대로 거치며, `kubernetes` 플러그인이 답할 수 있는 이름(`*.cluster.local`)이면 거기서 응답이 만들어지고, 그렇지 않으면(외부 도메인) `forward` 플러그인이 다음 단계로 넘긴다.

### kubernetes 플러그인의 동작

`kubernetes` 플러그인은 이름이 시사하는 그대로, **API 서버를 watch하며 DNS 레코드를 실시간으로 유지**한다.

```
kubernetes 플러그인
  │ watch: Service, EndpointSlice, (필요 시) Pod
  │ (5장에서 다룬 Informer/워크큐 패턴 — CoreDNS도 client-go 기반 컨트롤러다)
  ▼
내부 메모리 캐시(zone 데이터)를 실시간 갱신
  ▼
DNS 쿼리가 들어오면 이 메모리 캐시에서 즉시 응답 (API 서버를 매번 호출하지 않음)
```

**API 서버를 매 쿼리마다 호출하지 않는다는 점이 중요하다.** Informer로 받은 Service/EndpointSlice 상태를 로컬에 유지하고 있다가, DNS 쿼리가 오면 그 로컬 상태에서 즉시 응답을 만든다. 5장에서 강조한 "읽기는 캐시에서" 원칙이 컨트롤러뿐 아니라 CoreDNS에도 그대로 적용되는 셈이다.

### 배포 형태

```bash
kubectl get deployment coredns -n kube-system
kubectl get svc kube-dns -n kube-system
```

CoreDNS는 보통 **2개 이상의 레플리카를 가진 Deployment**로 배포되고, 그 앞에 `kube-dns`라는 이름의 ClusterIP Service가 있다(CoreDNS가 옛 `kube-dns` 컴포넌트를 대체했지만 하위 호환을 위해 Service 이름은 그대로 유지된다). 이 Service의 ClusterIP가 바로 각 Pod의 `/etc/resolv.conf`에 `nameserver`로 적히는 주소다.

```bash
kubectl exec -it <아무 Pod> -- cat /etc/resolv.conf
```
```
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

이 `nameserver` 값은 kubelet이 Pod를 생성할 때 `--cluster-dns` 플래그(기본적으로 `kube-dns` Service의 ClusterIP)를 참조해 주입한다. **즉 Pod에서 나가는 DNS 쿼리는 14~15장에서 배운 것과 완전히 동일한 경로 — ClusterIP → kube-proxy 데이터플레인 → EndpointSlice의 CoreDNS Pod IP — 를 거친다.**

### 클러스터 크기에 맞춰 레플리카 수 조정하기

CoreDNS 레플리카가 고정된 숫자(예: 2개)로만 유지되면, 노드와 Pod 수가 크게 늘어난 클러스터에서는 그만큼 쿼리량도 늘어나 두 인스턴스로는 부족해질 수 있다. 이를 자동으로 조정하는 애드온이 **`cluster-proportional-autoscaler`** 다. HPA(수평 파드 자동스케일러)처럼 CPU·메모리 지표를 보는 것이 아니라, **클러스터의 노드 수 또는 코어 수에 비례하는 선형 공식**으로 레플리카 수를 계산해 CoreDNS Deployment의 `replicas`를 직접 갱신한다.

```yaml
# cluster-proportional-autoscaler의 ConfigMap 설정 예
linear:
  coresPerReplica: 256
  nodesPerReplica: 16
  min: 2
```

이 방식은 "지금 CPU 사용률이 높으니 늘린다"는 반응형이 아니라, **"클러스터가 이만큼 커졌으니 미리 그만큼 늘려 둔다"는 예측형**에 가깝다. DNS 쿼리량은 대개 CPU 사용률보다 노드·Pod 수와 훨씬 안정적으로 비례하기 때문에, 이런 선형 공식이 실무에서 잘 들어맞는다.

## 16.2 FQDN 규칙과 search domain

### 명명 규칙

Service는 다음 형태의 정규화된 이름(FQDN)을 갖는다.

```
<service>.<namespace>.svc.<cluster-domain>

예: payments.default.svc.cluster.local
```

`<cluster-domain>`은 클러스터 설정값(대개 `cluster.local`)이며, CoreDNS의 `kubernetes` 플러그인 설정에 지정된 것과 일치해야 한다. StatefulSet의 개별 Pod(14.1절의 헤드리스 서비스)는 여기에 한 단계가 더 붙는다.

```
<pod-hostname>.<headless-service>.<namespace>.svc.<cluster-domain>

예: db-0.db-headless.default.svc.cluster.local
```

### search domain과 짧은 이름

애플리케이션이 `payments`처럼 짧은 이름만 써도 동작하는 이유는 `/etc/resolv.conf`의 `search` 목록 때문이다.

```
search default.svc.cluster.local svc.cluster.local cluster.local
```

리졸버는 조회하려는 이름에 점(`.`)이 **`ndots` 값보다 적게 있으면**, 그 이름을 그대로 절대 이름으로 조회하기 **전에** `search` 목록의 접미사를 순서대로 하나씩 붙여 먼저 시도한다.

```
쿼리: payments   (점 0개, ndots=5보다 작음)

① payments.default.svc.cluster.local   ← 시도 1, 보통 여기서 성공
   (실패 시)
② payments.svc.cluster.local           ← 시도 2
   (실패 시)
③ payments.cluster.local               ← 시도 3
   (실패 시)
④ payments                              ← 마지막으로 절대 이름 그대로 시도
```

### ndots:5의 숨은 비용

문제는 **이 규칙이 외부 도메인 조회에도 그대로 적용된다**는 점이다. `www.example.com`(점 2개)도 여전히 기본값 `ndots:5`보다 적으므로, 리졸버는 이것을 곧바로 외부에 물어보지 않는다.

```
쿼리: www.example.com   (점 2개, 여전히 ndots=5보다 작음)

① www.example.com.default.svc.cluster.local   ← 실패 (당연히 존재하지 않음)
② www.example.com.svc.cluster.local           ← 실패
③ www.example.com.cluster.local               ← 실패
④ www.example.com                              ← 여기서야 성공
```

**외부 도메인을 조회할 때마다 실패가 확정된 쿼리 3개를 먼저 CoreDNS에 보내고서야 실제 정답에 도달한다.** 클러스터 안에서 외부 API를 자주 호출하는 워크로드일수록 이 낭비가 누적되어 CoreDNS 부하와 응답 지연에 실질적으로 영향을 준다.

### 완화 방법

| 방법 | 설명 |
|---|---|
| **끝에 점 추가** | `www.example.com.`처럼 **절대 이름**임을 명시하면 search 목록을 건너뛰고 곧바로 조회한다 |
| **Pod의 `dnsConfig`로 `ndots` 조정** | 클러스터 내부 이름을 거의 안 쓰는 워크로드라면 `ndots` 값을 낮춰 search 목록 시도 횟수를 줄인다 |
| **가능하면 완전한 FQDN 사용** | 애플리케이션 설정에서 `payments.default.svc.cluster.local`처럼 처음부터 완전한 이름을 쓰면 search 목록 자체가 필요 없다 |

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

`ndots` 값을 너무 낮추면 반대로 **클러스터 내부의 짧은 이름 조회가 실패**할 수 있으므로(예: `ndots:1`이면 점이 1개 이상인 이름은 곧바로 절대 이름으로 취급돼 search 목록을 거치지 않는다), 워크로드의 실제 조회 패턴(내부 짧은 이름 위주인지, 외부 FQDN 위주인지)을 파악한 뒤 조정해야 한다.

### Pod의 dnsPolicy — search/ndots 조작보다 앞선 선택지

`dnsConfig`를 만지기 전에, 애초에 이 Pod가 **CoreDNS를 거칠지 말지 자체**를 결정하는 상위 필드가 있다. `spec.dnsPolicy` 다.

| 값 | 동작 |
|---|---|
| `ClusterFirst` (기본값) | `/etc/resolv.conf`가 이 절에서 본 대로 CoreDNS(`kube-dns` ClusterIP)와 클러스터 search 목록으로 구성된다 |
| `ClusterFirstWithHostNet` | `hostNetwork: true` Pod에서 `ClusterFirst`와 동일한 효과를 강제로 적용(그렇지 않으면 hostNetwork Pod는 기본적으로 노드의 resolv.conf를 그대로 물려받는다) |
| `Default` | 이름과 달리 **쿠버네티스 기본값이 아니다.** 노드 자신의 `/etc/resolv.conf`를 그대로 상속 — CoreDNS를 거치지 않고 클러스터 내부 이름도 해석하지 못한다 |
| `None` | resolv.conf를 완전히 비우고, **`dnsConfig`에 명시한 값만으로** 처음부터 구성 — 사내 DNS 서버를 강제하거나 특수한 search 목록이 필요할 때 |

`dnsPolicy: None` + `dnsConfig`의 조합은 예를 들어 **사내 프라이빗 DNS 서버를 우선 참조하되 클러스터 내부 이름도 여전히 해석해야 하는** 경우에 쓴다 — CoreDNS의 `kubernetes` 플러그인 경로를 우회하지 않으면서 커스텀 nameserver를 추가하는 식이다.

```yaml
spec:
  dnsPolicy: None
  dnsConfig:
    nameservers:
      - 10.96.0.10        # CoreDNS ClusterIP는 유지
      - 172.16.0.53       # 사내 DNS 서버 추가
    searches:
      - default.svc.cluster.local
      - svc.cluster.local
      - cluster.local
      - corp.example.internal
    options:
      - name: ndots
        value: "2"
```

## 16.3 캐시와 성능

### CoreDNS 자체 캐시

`cache` 플러그인은 응답을 **레코드의 TTL 동안 메모리에 캐싱**한다. `Corefile`의 `cache 30`은 최대 30초까지 캐싱한다는 뜻이다. 같은 이름이 짧은 시간 안에 반복 조회되는 경우(브라우저의 반복 요청, 커넥션 풀이 주기적으로 재조회하는 경우 등) API 서버·`kubernetes` 플러그인 내부 캐시까지 갈 필요 없이 이 층에서 끝난다.

### NodeLocal DNSCache

Pod 수가 많은 대규모 클러스터에서는 **중앙 CoreDNS로 몰리는 쿼리 양 자체**가 문제가 된다. 모든 노드의 모든 Pod가 DNS 쿼리를 보낼 때마다 ClusterIP → kube-proxy 데이터플레인 → CoreDNS Pod라는 경로를 거치는데, 이 경로에서 **UDP 커넥션마다 conntrack 항목이 생성**된다. 쿼리 양이 급증하면 conntrack 테이블에 부하가 몰리고, 드물게는 **경쟁 조건(race condition)** 으로 인해 DNS 조회가 5초 타임아웃 뒤 `SERVFAIL`로 실패하는 현상까지 발생한다.

**NodeLocal DNSCache**는 노드마다 DaemonSet으로 캐싱 에이전트를 띄워 이 문제를 완화한다.

```
Pod → (노드 로컬) NodeLocal DNSCache → 캐시 미스 시에만 → 중앙 CoreDNS
       링크-로컬 주소(예: 169.254.20.10)에서 대기
```

```
동작 방식
① 각 노드에 DaemonSet으로 캐싱 에이전트 실행, 링크-로컬 IP에서 리스닝
② Pod의 DNS 쿼리가 이 로컬 에이전트로 향하도록 구성
   (kubelet의 --cluster-dns 조정, 또는 각 노드의 iptables 규칙으로 가로채기)
③ 캐시에 있으면 즉시 응답 — 노드를 벗어나지 않으므로 conntrack 부하 없음
④ 캐시 미스면 중앙 CoreDNS로 쿼리 (이 구간만 기존 경로를 탄다)
```

**핵심 효과 두 가지**: (1) 캐시 히트 시 쿼리가 노드를 벗어나지 않아 **중앙 CoreDNS의 부하와 네트워크 홉이 줄어든다**, (2) 링크-로컬 주소로의 통신은 대개 일반적인 Service 경유 경로의 conntrack 부담을 거치지 않도록 구성되므로 **UDP conntrack 경쟁 조건 자체를 회피**할 수 있다. 14.4절에서 언급한 `internalTrafficPolicy: Local`이 지향하는 것과 같은 문제의식 — **가능한 한 트래픽을 노드 밖으로 내보내지 않는다** — 을 DNS 영역에 적용한 결과물이라고 볼 수 있다.

## 16.4 트러블슈팅 플로차트

"DNS 조회가 안 된다"는 증상은 원인이 다양하다. **위에서 아래로, 경로를 하나씩 좁혀가며** 확인한다.

```
DNS 조회 실패
   │
   ├─ ① CoreDNS Pod가 살아 있고 Ready인가?
   │    kubectl get pods -n kube-system -l k8s-app=kube-dns
   │    → 아니라면: Pod 로그, 리소스 부족(OOMKilled), 이미지 pull 실패 등을 확인
   │
   ├─ ② kube-dns Service와 EndpointSlice가 정상인가?
   │    kubectl get endpointslice -n kube-system -l kubernetes.io/service-name=kube-dns
   │    → 비어 있다면 14.2절의 흐름(셀렉터 불일치, readiness 실패)을 그대로 적용해 진단
   │
   ├─ ③ Pod 내부의 /etc/resolv.conf가 정상인가?
   │    kubectl exec <pod> -- cat /etc/resolv.conf
   │    → nameserver가 kube-dns ClusterIP와 일치하는지, search/ndots가 예상대로인지 확인
   │
   ├─ ④ ClusterIP로 직접 질의가 되는가? (kube-proxy 계층 분리)
   │    kubectl exec <pod> -- dig @<kube-dns ClusterIP> payments.default.svc.cluster.local
   │    → 안 되면 15장의 데이터플레인 문제(iptables/IPVS 규칙, conntrack)를 의심
   │    → 되는데 애플리케이션에서만 실패하면 애플리케이션의 리졸버 설정 문제
   │
   └─ ⑤ 간헐적으로만 실패하는가? (conntrack 경쟁 조건)
        → 부하가 몰릴 때만 SERVFAIL/타임아웃 → conntrack 관련 UDP 경쟁 조건 의심
        → NodeLocal DNSCache 도입 검토, conntrack 관련 커널 파라미터 점검
```

### 단계별 명령

```bash
# ① CoreDNS 상태
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50

# ② Service/EndpointSlice
kubectl get svc kube-dns -n kube-system
kubectl get endpointslice -n kube-system -l kubernetes.io/service-name=kube-dns -o yaml

# ③ 디버그 Pod에서 리졸버 설정 확인
kubectl run dns-debug --rm -it --image=nicolaka/netshoot --restart=Never -- cat /etc/resolv.conf

# ④ 각 단계 직접 질의
kubectl run dns-debug --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'dig +short payments.default.svc.cluster.local; \
         dig @10.96.0.10 +short payments.default.svc.cluster.local'

# ⑤ 반복 질의로 간헐적 실패 재현
kubectl run dns-debug --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'for i in $(seq 1 50); do dig +short +time=1 +tries=1 payments.default.svc.cluster.local || echo "FAIL #$i"; done'
```

**증상별 원인표**

| 증상 | 유력 원인 |
|---|---|
| 모든 Pod에서 모든 DNS 조회 실패 | CoreDNS Pod 다운, `kube-dns` Service 자체 문제 |
| 특정 노드의 Pod만 실패 | 그 노드의 kube-proxy·CNI 문제, 또는 NodeLocal DNSCache 에이전트 다운 |
| 클러스터 내부 이름은 되는데 외부 도메인만 실패 | `forward` 플러그인 설정, 업스트림 DNS(노드의 `/etc/resolv.conf`) 문제 |
| 외부 도메인 조회가 유독 느림 | `ndots` 기본값으로 인한 불필요한 search 시도 (16.2절) |
| 부하 몰릴 때만 간헐적 `SERVFAIL`/타임아웃 | UDP conntrack 경쟁 조건 — NodeLocal DNSCache 검토 |
| CoreDNS 설정을 바꿨는데 반영이 안 됨 | ConfigMap 갱신 후 `reload` 플러그인의 반영 주기 대기, 또는 Corefile 문법 오류로 재시작 실패 |

---

## 실습: DNS 해석 경로 직접 확인하기

**① resolv.conf와 search 목록 확인**

```bash
kubectl run dns-lab --image=nicolaka/netshoot --restart=Never -- sleep 3600
kubectl exec dns-lab -- cat /etc/resolv.conf
```

**② ndots로 인한 다중 쿼리 관찰**

```bash
kubectl create deployment ndots-demo --image=hashicorp/http-echo:1.0 -- /http-echo -text=hi -listen=:5678
kubectl expose deployment ndots-demo --port=80 --target-port=5678

kubectl exec dns-lab -- dig +search +noall +answer +stats ndots-demo.default.svc.cluster.local
kubectl exec dns-lab -- sh -c 'dig +search +trace www.example.com 2>&1 | head -30'
```

두 번째 명령에서 `+search` 옵션과 함께 짧은 이름을 조회해 보면, `search` 목록의 각 접미사가 순서대로 시도되는 흔적을 확인할 수 있다.

**③ CoreDNS를 잠시 내려 장애를 관찰**

```bash
kubectl scale deployment coredns -n kube-system --replicas=0

kubectl exec dns-lab -- dig +time=2 +tries=1 ndots-demo.default.svc.cluster.local
# 타임아웃 또는 응답 없음을 확인

kubectl scale deployment coredns -n kube-system --replicas=2
kubectl rollout status deployment/coredns -n kube-system

kubectl exec dns-lab -- dig +short ndots-demo.default.svc.cluster.local
# 복구 확인
```

**④ Corefile에 커스텀 rewrite 규칙 추가**

```bash
kubectl get configmap coredns -n kube-system -o yaml > /tmp/coredns-backup.yaml
kubectl edit configmap coredns -n kube-system
```

`kubernetes` 블록 위나 아래에 다음을 추가한다(예시 — 특정 레거시 이름을 실제 Service 이름으로 치환).

```
rewrite name legacy-payments.default.svc.cluster.local payments.default.svc.cluster.local
```

`reload` 플러그인이 ConfigMap 변경을 감지해 CoreDNS 프로세스를 재시작 없이 다시 로드한다(반영까지 최대 수십 초 걸릴 수 있다). 반영 후 확인한다.

```bash
kubectl exec dns-lab -- dig +short legacy-payments.default.svc.cluster.local
```

**⑤ 정리**

```bash
kubectl apply -f /tmp/coredns-backup.yaml
kubectl delete deployment ndots-demo
kubectl delete svc ndots-demo
kubectl delete pod dns-lab
```

---

## 실습 과제

**과제 1 — 플러그인 순서 바꿔보기**
`Corefile`에서 `cache` 플러그인을 `kubernetes` 플러그인보다 앞에 두면 어떤 문제가 생길지 예상해 보고(힌트: `kubernetes` 플러그인의 실시간 watch 기반 응답과 캐시의 상호작용), 실제로 순서를 바꿔 적용한 뒤 EndpointSlice 변경이 DNS 응답에 반영되는 지연이 달라지는지 관찰한다. 실습 후 반드시 원래 순서로 되돌린다.

**과제 2 — ndots 낮추기의 효과 측정**
외부 도메인을 자주 조회하는 워크로드를 흉내 내는 Pod를 만들어, `dnsConfig.options`로 `ndots`를 `1`로 낮췄을 때와 기본값(`5`)일 때 각각 `dig +stats`로 응답 시간과 쿼리 횟수를 비교한다. 동시에 같은 Pod에서 클러스터 내부 짧은 이름 조회가 여전히 되는지도 확인한다.

**과제 3 — NodeLocal DNSCache 도입 전후 비교**
NodeLocal DNSCache를 설치하기 전과 후, 동일한 부하(다수 Pod에서 짧은 간격으로 반복 DNS 조회)를 걸어 `conntrack -C`(15장의 진단 기법 응용)의 증가량과 CoreDNS Pod의 CPU 사용률을 비교한다.

**과제 4 — 진단 플로차트 실전 적용**
`kube-dns` Service의 셀렉터를 의도적으로 틀리게 바꿔 EndpointSlice가 비도록 만든 뒤, 16.4절의 플로차트를 처음부터 따라가며 어느 단계에서 문제가 드러나는지 기록한다. 원상복구 후 이번엔 CoreDNS Pod의 리소스 제한을 매우 낮게 설정해 OOMKill을 유도하고 같은 절차로 진단해 본다.

**과제 5 — 캐시 TTL과 레코드 갱신 지연 관찰**
`cache` 플러그인의 TTL 값을 늘렸을 때(예: `cache 300`), Service의 ClusterIP는 바뀌지 않지만 EndpointSlice(백엔드 Pod)가 바뀌는 상황에서 클라이언트가 오래된 응답을 얼마나 오래 붙들고 있는지 확인한다. ClusterIP 자체는 Service 생애주기 동안 불변이므로 이 캐시가 실제로 어떤 종류의 응답에 영향을 주는지(A 레코드 자체보다는 이름 존재 여부, NXDOMAIN 캐싱 등) 구분해 본다.

---

## 요약

- CoreDNS는 `Corefile`에 선언된 **플러그인 체인**으로 동작한다. `kubernetes` 플러그인이 클러스터 내부 이름을, `forward`가 외부 이름을 처리하며, `cache`/`loop`/`reload` 같은 플러그인이 성능과 안정성을 보조한다.
- `kubernetes` 플러그인은 API 서버를 **Informer로 watch**해 Service/EndpointSlice 상태를 로컬 메모리에 유지하고, 그 캐시에서 즉시 응답한다 — 5장의 컨트롤러 패턴이 DNS 서버 내부에도 그대로 쓰인다.
- **CoreDNS 자체가 Deployment + ClusterIP Service**로 배포되므로, DNS 쿼리 역시 14~15장에서 배운 EndpointSlice·kube-proxy 데이터플레인 경로를 그대로 거친다.
- FQDN은 `<service>.<namespace>.svc.<cluster-domain>` 규칙을 따르고, `/etc/resolv.conf`의 **search 목록**이 짧은 이름을 이 형태로 확장한다. 기본 `ndots:5`는 **외부 도메인 조회에도 search 목록을 먼저 시도**시켜 불필요한 쿼리를 유발한다 — 끝에 점을 붙이거나 `dnsConfig`로 완화한다.
- **CoreDNS 자체 캐시**는 TTL 기반으로 응답을 재사용하고, **NodeLocal DNSCache**는 노드마다 캐싱 에이전트를 둬 중앙 CoreDNS 부하와 **UDP conntrack 경쟁 조건**(대량 쿼리 시 간헐적 `SERVFAIL`의 원인)을 함께 완화한다.
- DNS 장애 진단은 **CoreDNS Pod 상태 → Service/EndpointSlice → Pod의 resolv.conf → ClusterIP 직접 질의 → 간헐성(conntrack) 여부** 순으로 좁혀 간다. 이 순서가 "어느 계층의 문제인가"를 빠르게 특정해 준다.

**다음 장에서는** Service·DNS라는 클러스터 내부 통신의 기초 위에서, 외부 트래픽을 HTTP/HTTPS 계층까지 끌어올려 라우팅하는 Ingress·Gateway API와 서비스 메시를 다룬다.
