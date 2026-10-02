---
title: "27장. Service와 kube-proxy"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 27
---

# 27장. Service와 kube-proxy

> **🎮 게임 서버 개발자에게** — 게임 서버 앞에는 보통 로드밸런서나 게이트웨이가 있어서 클라이언트는 고정 주소 하나만 안다. Service는 그 "고정 주소"를 클러스터 안에 만들어 주는 오브젝트이고, kube-proxy는 그 주소로 온 연결을 실제 Pod로 바꿔치기하는 규칙을 각 노드 커널에 심는 에이전트다. 중요한 반전은 **ClusterIP로 가는 진짜 서버 프로세스가 없다**는 것이다. 사용자 공간 프록시가 패킷을 중계하지 않고, 커널의 DNAT와 conntrack이 연결 단위로 목적지를 정한다. TCP 연결 단위 로드밸런싱, conntrack, DNAT가 생소하지 않다면 이 장은 규칙이 어떻게 생기는지만 따라가면 된다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 서버 Pod를 늘렸는데 어떤 접속자는 항상 같은 Pod로만 붙고, 장시간 연결(gRPC, 게임 TCP 세션)이 한 Pod에 쏠린다.
> - 외부 LB로 들어온 요청의 클라이언트 IP가 서버 로그에 노드 IP로 찍혀 접속자 식별·차단이 안 된다.
> - 서비스가 수천 개가 되자 Service 변경 반영이 느려지고 kube-proxy CPU가 올라간다.

## 코어 — 이것만은 100%

> **한 문장:** Service의 ClusterIP는 어느 인터페이스에도 존재하지 않는 가상 좌표이고, EndpointSlice의 Ready Pod 목록을 kube-proxy가 노드 커널의 DNAT 규칙(iptables/IPVS/nftables)으로 번역하며, 패킷 처리는 conntrack을 따라 커널이 하고 kube-proxy는 데이터 경로에 없다.

1. **Service 타입은 포함 관계다** — LoadBalancer ⊃ NodePort ⊃ ClusterIP. ExternalName은 순수 DNS CNAME이고 Headless(`clusterIP: None`)는 가상 IP 없이 Pod IP 목록을 DNS로 준다.
2. **EndpointSlice가 "무엇으로 바꿀지" 목록이다** — 약 100개 단위로 샤딩되고, `ready/serving/terminating` 조건으로 드레이닝한다. `kubernetes.io/service-name` 라벨로 Service와 연결된다.
3. **iptables 모드: `KUBE-SERVICES → KUBE-SVC-* → KUBE-SEP-*`** — `statistic --mode random`에서 i번째 규칙 확률은 `1/(N-i+1)`이고, 최종 DNAT 후 conntrack이 응답을 역변환한다. 규칙은 전체를 다시 만들어 `iptables-restore`로 원자적 교체한다.
4. **IPVS·nftables·eBPF는 O(n) 한계의 대안이다** — IPVS는 해시 O(1)이나 공식 폐기 경로, nftables는 set/map으로 증분 갱신(GA), eBPF(Cilium)는 netfilter DNAT 자체를 우회한다.
5. **트래픽 정책과 디스커버리** — `sessionAffinity`, `externalTrafficPolicy: Local`(클라이언트 IP 보존), DNS 우선(환경변수는 순서 의존), 진단은 오브젝트 → 데이터플레인 순이다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 게이트웨이/LB 앞단의 고정 가상 IP(VIP) | ClusterIP | 클라이언트는 하나의 주소만 알고 뒤에서 여러 서버로 분산된다 | **어떤 인터페이스에도 바인딩되지 않는다**(`ping` 무응답). 패킷을 가로채 바꿔치는 규칙이 각 노드에 있을 뿐 중앙 LB 프로세스가 없다 |
| LB가 연결(세션) 단위로 백엔드를 고정 | conntrack 기반 DNAT | 최초 SYN에서 정한 목적지를 연결이 끝날 때까지 유지한다 | 분배는 **연결 단위 확률**이라 연결 수가 적고 오래 유지되면(gRPC·게임 TCP) 특정 Pod로 쏠린다 |
| 서버 목록을 LB가 아닌 클라이언트가 받아 직접 고르는 방식(클라이언트 사이드 LB) | Headless Service | DNS가 모든 Pod IP를 반환하고 클라이언트가 선택한다 | 가상 IP·kube-proxy 규칙이 만들어지지 않는다. StatefulSet의 개별 Pod 이름(`db-0...`)을 주는 메커니즘이기도 하다 |
| 서버 목록을 변경할 때 전체 설정을 한꺼번에 원자적으로 교체(hot reload) | `iptables-restore` 전체 교체 | 일부만 적용된 중간 상태가 노출되지 않는다 | Service가 많을수록 텍스트 재구성·적재 시간이 늘어난다(`kubeproxy_sync_proxy_rules_duration_seconds`) |
| 프록시 뒤에서 클라이언트 IP가 사라져 `X-Forwarded-For`가 필요 | `externalTrafficPolicy: Cluster`의 SNAT | 중간 SNAT 때문에 원본 IP가 노드 IP로 치환된다 | `Local`로 바꾸면 SNAT가 없어 IP가 보존되지만, 해당 노드에 Pod가 없으면 응답이 없다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. ClusterIP로 `ping`을 보내면 응답이 올까? 그 IP는 어디에 존재할까?
> 2. 엔드포인트 3개 중 첫 규칙의 확률이 1/3, 둘째가 1/2, 셋째가 무조건이면 왜 균등할까?
> 3. kube-proxy 프로세스가 죽으면 이미 맺힌 연결과 새 Service 변경은 어떻게 될까?
> 4. Pod가 종료 중일 때 새 연결은 막고 기존 연결은 끊지 않으려면 EndpointSlice가 어떤 값이어야 할까?
>
> **처리법:** 🛠 실습 `kubectl get endpointslices -l kubernetes.io/service-name=...`, `iptables -t nat -S KUBE-SERVICES`, `conntrack -L`, `kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode` → 바로 실행 · 🗺 관계도 Service → EndpointSlice → kube-proxy → 커널 규칙 체인, 타입 포함 관계 · 📦 카드로 확률 공식, `0x4000` 마크, 모드 비교표(O(n)/O(1)/map), IPVS 폐기 일정

### 이 장에서 배우는 것

- Service 다섯 형태(ClusterIP·NodePort·LoadBalancer·ExternalName·Headless)의 내부 동작
- EndpointSlice의 구조, 샤딩 이유, 종료 중 드레이닝
- kube-proxy가 iptables 규칙으로 DNAT·확률 분배·헤어핀·SNAT를 구현하는 방식과 conntrack의 역할
- IPVS·nftables·eBPF 데이터플레인의 차이와 트래픽 정책·서비스 디스커버리·진단

---

## 코어 1. Service 타입은 포함 관계다

### 1.1 ClusterIP — 주소가 아니라 약속

**한 줄 요약:** ClusterIP는 어떤 네트워크 인터페이스에도 바인딩되지 않은 가상 좌표이고, 각 노드 커널의 규칙이 패킷을 가로채 Pod IP로 바꾼다.

```yaml
apiVersion: v1
kind: Service
metadata: { name: payments }
spec:
  type: ClusterIP        # 생략 시 기본값
  selector: { app: payments }
  ports:
    - { name: http, port: 80, targetPort: 8080 }
```

`10.96.x.y` 같은 ClusterIP로 `ping`을 보내면 응답이 없다. 라우팅 테이블 어디에도 그 주소로 가는 물리 경로가 없기 때문이다. ClusterIP는 "이 값으로 패킷을 보내면 그 순간 노드의 데이터플레인이 알아서 실제 백엔드로 바꿔 준다"는 약속이다. 이 경로의 DNS 조회와 연결 흐름은 다음과 같다.

```
호출 Pod → CoreDNS에 orders.study.svc.cluster.local 조회 → ClusterIP 응답
호출 Pod → ClusterIP:80으로 TCP 연결 → 노드 데이터 경로(Service/EndpointSlice에 맞춘 규칙) → 선택된 Pod IP:8080
```

DNS는 이름을 주소로 해석할 뿐 매 HTTP 패킷을 중계하지 않는다([28장](28-CoreDNS-Ingress-NetworkPolicy.md)). `targetPort`는 컨테이너가 실제로 듣는 포트와 맞아야 한다. 이름 기반 targetPort를 쓰면 Pod의 이름 붙인 포트와 연결된다.

### 1.2 NodePort, LoadBalancer, ExternalName, Headless

**한 줄 요약:** NodePort는 ClusterIP로 가는 진입점을 하나 더 추가하고, LoadBalancer는 그 위에 클라우드 LB를 얹는다.

| 타입 | 동작 |
|---|---|
| ClusterIP | 클러스터 내부 가상 주소 |
| NodePort (⊃ ClusterIP) | **모든 노드**(Pod가 있든 없든)의 지정 포트(기본 30000&#126;32767)가 열려 `노드IP:30080`으로 들어온 트래픽도 같은 엔드포인트 목록으로 간다 |
| LoadBalancer (⊃ NodePort ⊃ ClusterIP) | cloud-controller-manager의 `service` 컨트롤러가 클라우드 API로 LB를 만들고 각 노드의 NodePort를 백엔드로 등록. `EXTERNAL-IP`가 `<pending>`이면 컨트롤러가 없거나 권한 부족(베어메탈·kind는 MetalLB 같은 대체 필요) |
| ExternalName | 셀렉터·엔드포인트·ClusterIP 없음. CoreDNS의 CNAME 하나뿐이며 트래픽은 클러스터 데이터플레인을 거치지 않고 클라이언트가 직접 연결 |
| Headless (`clusterIP: None`) | EndpointSlice는 만들어지지만 ClusterIP와 kube-proxy 규칙이 없음. DNS가 **모든 Pod IP 목록**을 반환 |

Headless는 별도의 `type` 값이 아니라 `clusterIP: None`이다. StatefulSet의 개별 Pod DNS(`db-0.db-headless.default.svc.cluster.local`)를 주는 메커니즘 그 자체이고([24장](24-오브젝트-모델과-워크로드.md)), gRPC처럼 HTTP/2로 연결을 오래 유지하는 프로토콜은 일반 Service에서는 최초 연결된 Pod로 고정되므로 Headless로 목록을 받아 클라이언트 라이브러리가 직접 분산하는 방식이 쓰인다. LB 종류는 사용하는 controller와 환경에 따라 달라지고, ExternalName은 Pod로 프록시하는 기능이 아니다.

---

## 코어 2. EndpointSlice가 "무엇으로 바꿀지" 목록이다

### 2.1 Endpoints의 한계와 EndpointSlice의 해법

**한 줄 요약:** 단일 `Endpoints`는 Pod 하나가 바뀌어도 전체가 재전송되므로, 약 100개 단위로 샤딩했다.

레거시 `Endpoints`는 Service당 하나라서, 백엔드 Pod 10,000개짜리 Service에서 Pod 하나의 IP만 바뀌어도 10,000개 항목 오브젝트 전체가 다시 쓰이고 그 Service를 watch하는 모든 노드의 kube-proxy로 재전송된다. API 서버 직렬화 크기, etcd 쓰기, watch cache fan-out 부하가 모두 Pod 수에 비례해 폭증했다.

**EndpointSlice**(v1.21+ 기본)는 기본 100개 단위(`--max-endpoints-per-slice`, 상한 1000)로 쪼갠다. Pod 하나가 바뀌면 그 Pod가 속한 슬라이스 하나만 다시 쓰이므로 부하가 슬라이스 크기에 비례한다. `endpointslice` 컨트롤러(kube-controller-manager 내장)도 Informer/워크큐 패턴을 따른다([22장](22-컨트롤러-매니저.md)).

```yaml
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: payments-abc12
  labels: { kubernetes.io/service-name: payments }   # ★ Service와의 유일한 연결고리
addressType: IPv4
ports: [{ name: http, port: 8080, protocol: TCP }]
endpoints:
  - addresses: ["10.244.1.3"]
    conditions: { ready: true, serving: true, terminating: false }
    nodeName: k8s-guide-worker
    zone: ap-northeast-2a
    hints: { forZones: [{ name: ap-northeast-2a }] }
```

| 필드 | 의미 |
|---|---|
| `conditions.ready` | **트래픽을 받을지 결정.** readiness 프로브 결과와 직결 |
| `conditions.serving` | `ready`와 별개의 "지금 서비스 가능한가". 종료 중에도 드레이닝을 위해 `true`일 수 있음 |
| `conditions.terminating` | 종료 절차(`preStop`, graceful shutdown) 진행 중 |
| `hints.forZones` | 같은 가용 영역 클라이언트가 우선 선택하도록 하는 토폴로지 인식 라우팅 힌트(`service.kubernetes.io/topology-mode: Auto`) |
| `nodeName` | `Local` 트래픽 정책이 참조 |

Pod A가 없어지고 Pod B가 생기면 B의 IP가 달라도 **대상 목록이 갱신되고 전달 규칙이 따라 바뀌어** 새 연결은 B로 간다. 기존 TCP 연결이 새 프로세스로 이식되지는 않으므로 클라이언트의 재연결·재시도가 필요할 수 있다.

### 2.2 종료 중인 엔드포인트의 드레이닝

**한 줄 요약:** 삭제가 시작되면 `ready=false`, `terminating=true`로 바뀌어 새 연결은 막고 기존 연결은 끊지 않는다.

```
① 삭제 요청 → deletionTimestamp 기록, preStop 시작, EndpointSlice의 ready=false, terminating=true로 갱신
② 데이터플레인이 반영: ready=false → 새 연결의 후보에서 제외,
   terminating을 인식하는 구현은 이미 맺힌 연결을 강제로 끊지 않고 자연스러운 종료를 기다림
③ preStop 완료 또는 terminationGracePeriodSeconds 만료
④ SIGTERM/SIGKILL → Pod 삭제 → EndpointSlice에서 엔드포인트 완전 제거
```

이 전이가 [25장](25-Pod-생명주기와-리소스.md)의 종료 시퀀스와 정확히 대응한다. 다만 전파는 즉시 일어나지 않으므로 앱의 SIGTERM 처리와 `preStop`이 여전히 필요하다.

---

## 코어 3. iptables 모드: 체인, 확률 분배, DNAT, conntrack

### 3.1 kube-proxy의 위치

**한 줄 요약:** kube-proxy는 Service/EndpointSlice를 watch해 규칙만 프로그래밍하고, 패킷은 커널이 처리한다.

```
① API 서버를 watch (Service, EndpointSlice) — Informer 패턴
② 노드의 데이터플레인(iptables / IPVS / nftables) 규칙 갱신
③ 실제 패킷 처리는 커널 — kube-proxy는 데이터 경로에 없다
```

kube-proxy는 노드마다 하나 도는 DaemonSet이다([24장](24-오브젝트-모델과-워크로드.md)). **프로세스가 죽어도 이미 프로그래밍된 규칙은 커널에 남아 기존 연결은 끊기지 않지만**, 이후 Service/EndpointSlice 변경은 반영되지 않는다. CNI가 노드 간에 패킷을 옮기는 방법을 정한다면([26장](26-쿠버네티스-네트워크-모델과-CNI.md)), kube-proxy는 도착한 패킷의 목적지가 무엇으로 바뀔지를 정한다. 이 일은 중앙 로드밸런서 없이 각 노드에서 로컬로 결정된다.

### 3.2 체인 계층과 확률 분배

**한 줄 요약:** 진입점 `KUBE-SERVICES`에서 Service 체인으로, 거기서 확률로 엔드포인트 체인을 골라 DNAT한다.

```
PREROUTING(외부 유입) ─┐
                       ├─→ KUBE-SERVICES ─→ KUBE-SVC-<Service 해시> ─→ KUBE-SEP-<EP1/2/3> ─→ DNAT → Pod IP:Port
OUTPUT(로컬 발신) ─────┘          └→ KUBE-NODEPORTS (포트만으로 매칭, 같은 KUBE-SVC로)
```

```bash
iptables -t nat -S KUBE-SERVICES | grep payments
# -A KUBE-SERVICES -d 10.96.142.88/32 -p tcp ... --dport 80 -j KUBE-SVC-P2QNAX57L3TRA3TJ
iptables -t nat -S KUBE-SVC-P2QNAX57L3TRA3TJ
# ... --probability 0.33333333349 -j KUBE-SEP-AAAA
# ... --probability 0.50000000000 -j KUBE-SEP-BBBB
# ...                              -j KUBE-SEP-CCCC   (마지막은 무조건)
```

`statistic --mode random`은 각 규칙을 위에서부터 독립적으로 평가하며, 앞 규칙에서 안 걸려 내려온 패킷만 다음 확률에 들어간다.

```
엔드포인트 N개일 때 i번째 규칙의 확률 p_i = 1 / (N - i + 1)   (마지막은 무조건)
N=3: 1/3 → 남은 2/3 중 1/2(=전체의 1/3) → 나머지 1/3  ⇒ 균등
N=5: 1/5, 1/4, 1/3, 1/2, 무조건
```

**연결 단위 분배다.** 매 패킷마다 굴리는 것이 아니라 conntrack이 최초 SYN에서 정한 목적지를 연결이 끝날 때까지 유지한다. 연결 수가 충분히 많을 때만 통계적으로 균등에 수렴하고, 소수의 오래 유지되는 연결(gRPC 스트리밍 등)은 Headless + 클라이언트 사이드 LB가 필요한 이유가 된다. 레플리카를 3에서 6으로 늘리면 첫 규칙 확률이 `0.333`에서 `1/6`으로 바뀐다.

### 3.3 엔드포인트 체인: DNAT, 헤어핀, SNAT

**한 줄 요약:** `KUBE-SEP-*`에서 목적지를 바꾸고, 헤어핀과 노드를 건너는 트래픽은 `0x4000` 마크로 SNAT한다.

```bash
iptables -t nat -S KUBE-SEP-AAAA
# -A KUBE-SEP-AAAA -s 10.244.1.3/32 -j KUBE-MARK-MASQ                         ← 헤어핀
# -A KUBE-SEP-AAAA -p tcp -m tcp -j DNAT --to-destination 10.244.1.3:8080     ← 실제 DNAT
iptables -t nat -S KUBE-POSTROUTING
# -A KUBE-POSTROUTING -m mark ! --mark 0x4000/0x4000 -j RETURN
# -A KUBE-POSTROUTING -j MARK --xor-mark 0x4000
# -A KUBE-POSTROUTING -j MASQUERADE --random-fully
```

첫 규칙은 **헤어핀(hairpin) 대응**이다. Pod가 자신이 속한 Service를 호출해 자기에게 돌아올 때 SNAT가 없으면 응답의 출발지가 Pod 자신이 되어 커널이 "내 요청의 응답"으로 인식하지 못한다. `KUBE-MARK-MASQ`로 표시를 남기고 `KUBE-POSTROUTING`이 `0x4000` 마크가 있는 패킷만 마스커레이드한다. 이 마크 메커니즘이 `externalTrafficPolicy: Cluster`에서 클라이언트 IP가 사라지는 정확한 지점이다. kube-proxy는 `--cluster-cidr`로 내부 대역을 알아야 "내부 트래픽은 SNAT 불필요"를 판단하므로, 이 값이 틀리면 불필요한 마스커레이드가 생긴다.

### 3.4 conntrack — 응답은 어떻게 돌아오는가

**한 줄 요약:** DNAT는 연결의 첫 패킷에만 적용되고, 나머지와 응답 방향은 conntrack 테이블이 역변환한다.

```
요청: 10.244.1.9:34567 → 10.96.142.88:80  [DNAT] → 10.244.1.3:8080   (conntrack에 변환 기록)
응답: 10.244.1.3:8080 → 10.244.1.9:34567  [역변환] → 10.96.142.88:80 로 보임
```

`conntrack -L | grep <ClusterIP>`에서 두 번째 `src=/dst=` 쌍이 역변환 정보다. 테이블이 가득 차면(`net.netfilter.nf_conntrack_max`) 새 연결이 거부된다. 게임 서버처럼 짧은 연결이 많은 워크로드에서 흔한 장애 원인이다(DNS의 UDP conntrack 경쟁 조건도 같은 메커니즘이다). 커널 쪽 netfilter·conntrack은 [6장](../1부-리눅스-OS-구성-요소/06-네트워크-스택.md)과 [16장](../2부-컨테이너-커널-기능과-Docker/16-Docker-네트워크.md)의 iptables NAT와 같은 기반이다.

### 3.5 갱신 방식: 원자적 전체 교체

**한 줄 요약:** 변경마다 규칙 하나씩 고치지 않고 전체를 다시 만들어 `iptables-restore --noflush`로 한 번에 적재한다.

메모리에서 `KUBE-*` 체인 전체를 텍스트로 재구성해 커널에 한 번에 넣는다(`--noflush`로 `KUBE-` 아닌 규칙은 건드리지 않음). 일부만 반영된 어중간한 상태가 노출되지 않지만, Service 수가 많을수록 만들고 적재하는 시간이 늘어난다. `kubectl get --raw /metrics | grep kubeproxy_sync_proxy_rules_duration`으로 본다.

---

## 코어 4. IPVS · nftables · eBPF — O(n) 한계의 대안

### 4.1 iptables의 한계와 IPVS

**한 줄 요약:** iptables는 체인을 순차 평가하는 O(n)이고 IPVS는 해시 테이블 조회 O(1)이다.

Service가 수천 개면 `KUBE-SERVICES` 체인이 길어져 신규 연결의 첫 패킷마다 수천 규칙을 비교할 수 있고, 하나라도 바뀌면 전체를 재구성하므로 갱신 지연도 커진다. [26장](26-쿠버네티스-네트워크-모델과-CNI.md)의 출처(kubernetes-textbook 23장)에 있는 추정으로 Service 1,000개 × 엔드포인트 10개면 규칙이 약 22,000개, 5,000개면 10만 개를 넘는다.

IPVS 모드: `kube-ipvs0` 더미 인터페이스에 모든 ClusterIP를 바인딩하고, 커널 IPVS에 Service마다 가상 서버(Virtual Server), 엔드포인트마다 실제 서버(Real Server)를 등록한다(`ipvsadm -Ln`). 스케줄러는 `rr`(기본), `lc`, `dh`, `sh`, `wrr` 등을 고를 수 있다. SNAT·NodePort·헤어핀은 여전히 iptables에 의존하되 Service별 체인 대신 `ipset`(`KUBE-CLUSTER-IP` 등)으로 규칙 수를 극적으로 줄인다. ARP 충돌을 막기 위해 `kube-ipvs0`는 `NOARP`이고 `arp_ignore=1`, `arp_announce=2`로 맞춘다(MetalLB L2와 얽힐 때 확인).

> **⚠️ IPVS 모드는 공식 폐기 경로(KEP-5495)에 들어섰다.** 원문 일정은 v1.35 경고 로그 → v1.37 `KubeProxyIPVS` 기능 게이트 → v1.40 기본 비활성 → v1.43 코드 제거다. 신규 도입은 피하고 기존 IPVS 클러스터는 nftables(또는 iptables) 전환을 계획한다.

### 4.2 nftables 모드

**한 줄 요약:** 집합(set)과 사상(map)으로 원소 단위 증분 갱신을 하며, GA지만 기본값은 여전히 iptables인 경우가 많다.

iptables 모드가 `KUBE-SERVICES(순회) → Service 체인(순회) → 확률 규칙(순회) → DNAT`라면, nftables는 "목적지 IP:포트 → verdict map 조회(해시, 단일 룩업) → 엔드포인트 집합에서 선택 → DNAT" 구조다. 맵은 원소를 개별 추가/삭제할 수 있어 엔드포인트 하나가 바뀌면 원소 하나만 갱신한다. 같은 netfilter 프레임워크를 더 효율적인 규칙 언어로 쓰는 것이다. `mode: nftables`를 명시해야 하고 `nft list table ip kube-proxy`로 본다. Service가 수백&#126;수천 개이거나 갱신 지연이 체감될 때 전환을 검토하고, 그 이하 규모에서는 iptables로도 차이가 크지 않다. 현재 모드는 `kubectl get configmap kube-proxy -n kube-system -o yaml | grep "mode:"`로 직접 확인한다.

| | iptables | IPVS | nftables |
|---|---|---|---|
| 조회 | 선형 순회 O(n) | 해시 O(1) | set/map 해시 |
| 로드밸런싱 | 확률 랜덤 하나 | rr/lc/dh/sh/wrr | 맵 기반 선택 |
| 갱신 | 전체 재구성 후 원자 교체 | 개별 항목 증분 | 원소 단위 증분 |
| 상태 | 오래된 기본값 | 폐기 경로 | GA |

### 4.3 eBPF(kube-proxy 없는 클러스터)

**한 줄 요약:** Cilium은 netfilter DNAT를 우회해 소켓/tc/XDP 계층에서 목적지를 결정한다.

세 모드는 모두 netfilter 위에서 DNAT한다. Cilium은 eBPF를 소켓 계층(`connect()`/`sendmsg()` 시점)이나 tc/XDP에 붙여 패킷이 netfilter를 거치기 전에 백엔드 주소를 정한다. 데이터플레인 계열 자체가 다르다. 자체 연결 추적을 쓰므로 conntrack 고갈에서도 자유롭다(kubernetes-textbook 23장의 평가).

---

## 코어 5. 트래픽 정책, 서비스 디스커버리, 진단

### 5.1 sessionAffinity와 트래픽 정책

**한 줄 요약:** `Local` 정책은 홉을 줄이고 클라이언트 IP를 보존하지만 Pod 분포가 불균등하면 부하도 불균등하다.

- `sessionAffinity: ClientIP`: 소스 IP를 키로 일정 시간(기본 10800초, 최대 86400) 같은 백엔드로 고정. 데이터플레인에서 구현된다. NAT 뒤 다수 사용자가 같은 IP로 보이면 한 Pod로 몰린다. 쿠키 기반 고정은 Ingress나 서비스 메시의 몫이다.
- `internalTrafficPolicy` / `externalTrafficPolicy`: 후보를 클러스터 전체(`Cluster`, 기본) 또는 요청이 도달한 그 노드의 로컬(`Local`)로 한정.

| 값 | 장점 | 단점 |
|---|---|---|
| `Cluster`(기본) | 균등 분산 | 다른 노드 Pod로 갈 때 홉 증가, 외부 트래픽은 **SNAT로 원본 클라이언트 IP 소실** |
| `Local` | 홉 없음, **클라이언트 IP 보존** | 그 노드에 Pod가 없으면 응답 없음. Pod 분포가 불균등하면 부하 불균등 |

`Cluster`에서 노드 A로 들어온 요청을 노드 B의 Pod로 보낼 때 원본 IP를 유지하면 B가 클라이언트로 직접 응답해 비대칭 경로가 생기므로 소스를 노드 A IP로 SNAT한다. 클라우드 LB의 헬스체크가 Pod 없는 노드를 제외해 주면 `Local`이 우수하고, 클라우드 LoadBalancer 구현체는 이 조합을 기본 권장 패턴으로 삼는다. `internalTrafficPolicy: Local`은 노드마다 로컬 캐시 DaemonSet(NodeLocal DNSCache 등)이 있을 때 쓴다.

### 5.2 서비스 디스커버리: 환경변수 vs DNS

**한 줄 요약:** 환경변수는 Pod 시작 시점의 스냅샷이라 순서 의존이므로 DNS를 쓴다.

kubelet은 Pod 시작 시점에 이미 존재하는 Service에 대해 `PAYMENTS_SERVICE_HOST=10.96.142.88` 같은 환경변수를 주입한다. Service가 Pod보다 **나중에** 만들어지면 그 변수는 아예 없고, 재시작 전에는 알 방법이 없다. 배포 순서에 따라 재현되기도 안 되기도 하는 까다로운 버그다. DNS(`payments.default.svc.cluster.local`, 같은 네임스페이스면 `payments`)는 요청 시점에 해석되므로 순서 의존이 없다.

### 5.3 데이터플레인 진단

**한 줄 요약:** EndpointSlice까지 정상인데 안 되면 커널 규칙 계층을 의심한다.

| 증상 | 유력 원인 | 확인 |
|---|---|---|
| EndpointSlice는 정상인데 ClusterIP 접근 안 됨 | kube-proxy 죽음/동기화 실패 | `kubectl logs -n kube-system <kube-proxy>`, `kubeproxy_sync_proxy_rules_duration_seconds` |
| 일부 노드에서만 안 됨 | 그 노드 kube-proxy 비정상 | 노드별 `iptables -t nat -S \| grep <서비스>` 비교 |
| 변경 반영이 느림 | iptables 모드 O(n) 동기화 | 규칙 수 `iptables -t nat -S \| wc -l` |
| 특정 클라이언트가 항상 같은 백엔드 | `sessionAffinity: ClientIP`, IPVS `sh`/`dh` | Service 필드, 스케줄러 |
| 연결은 열리는데 응답 없음 | conntrack, 노드 간 라우팅 | `conntrack -L`, 양쪽 노드 tcpdump |
| Pod는 Ready인데 EndpointSlice 대상이 0개 | selector·라벨·네임스페이스 불일치 | Service selector와 Pod labels 비교(CPU를 늘리는 것은 무관) |

핵심 판별 기준은 "오브젝트 모델(Service·EndpointSlice)까지는 정상인가"다. 정상인데 트래픽이 안 가면 커널 규칙 단계이고, 그렇지 않으면 selector, Ready 상태, `targetPort`를 먼저 본다.

---

## 실무 적용

### 체크리스트

- [ ] ClusterIP는 가상 좌표이며 `ping`으로 검증할 수 없고, 실제 동작은 각 노드의 DNAT 규칙이다.
- [ ] Service 타입 포함 관계(LoadBalancer ⊃ NodePort ⊃ ClusterIP)와 ExternalName(DNS만)/Headless(가상 IP 없음)의 차이를 구분한다.
- [ ] 장시간 연결(gRPC, 게임 TCP 세션)은 연결 단위 확률 분배라 쏠릴 수 있음을 알고, Headless + 클라이언트 LB 또는 다른 분산 수단을 검토했는가?
- [ ] 서버가 클라이언트 IP가 필요하면 `externalTrafficPolicy: Local`(+LB 헬스체크)을 검토했고, Pod 분포 불균등을 감수할 수 있는가?
- [ ] 서비스 디스커버리는 환경변수가 아니라 DNS 이름으로 하는가?
- [ ] 종료 시 `ready=false`/`terminating=true` 드레이닝과 함께 `preStop`·SIGTERM 처리가 있는가?
- [ ] Service가 수백&#126;수천 개라면 `kubeproxy_sync_proxy_rules_duration_seconds`와 규칙 수를 모니터링하고 nftables 전환을 검토하는가? IPVS는 신규 도입하지 않는가?
- [ ] 짧은 연결이 많다면 `conntrack -C` 대비 `nf_conntrack_max`(80%)를 감시하는가?
- [ ] 장애 시 오브젝트(Service·EndpointSlice) → 데이터플레인(kube-proxy·규칙) 순으로 좁히는가?

### 시나리오로 확인하기

1. **상황:** 로비 서버 Pod를 3개에서 6개로 늘렸는데, 장시간 유지되는 게임 TCP 세션 대부분이 기존 Pod 3개에만 있다. 새 Pod는 거의 한가하다.
   **질문:** 왜 그런가?

   <details markdown="1"><summary>답 확인</summary>

   iptables 모드의 분배는 연결 단위 확률이며, conntrack이 최초 SYN에서 정한 목적지를 연결이 끝날 때까지 유지한다. 이미 맺힌 오래 유지되는 세션은 재분배되지 않고, 새 연결에만 새 확률(레플리카 6이면 첫 규칙 1/6 등)이 적용된다. 연결 수가 충분히 많은 짧은 연결에서만 균등에 수렴한다. 장시간 연결 분산은 새 연결 유도, 재접속 정책, Headless + 클라이언트 사이드 LB 등을 검토한다. → 코어 3

   </details>

2. **상황:** `type: LoadBalancer`로 노출한 서버 로그에 모든 접속이 노드 IP에서 온 것으로 찍힌다. 접속자별 IP 밴이 안 된다.
   **질문:** 원인과 대응은?

   <details markdown="1"><summary>답 확인</summary>

   `externalTrafficPolicy: Cluster`(기본)에서는 노드를 건너가는 트래픽이 `0x4000` 마크 후 `KUBE-POSTROUTING`에서 마스커레이드돼 원본 IP가 소실된다. `externalTrafficPolicy: Local`로 바꾸면 SNAT가 없어 클라이언트 IP가 보존된다. 단 Pod가 없는 노드는 응답이 없으므로 클라우드 LB 헬스체크가 그 노드를 제외해야 하고, Pod 분포가 불균등하면 부하도 불균등하다. → 코어 5, 코어 3

   </details>

3. **상황:** Service의 EndpointSlice에 올바른 Pod IP 3개가 모두 `ready: true`로 있는데 한 노드에서만 ClusterIP 접속이 실패한다.
   **질문:** 어디를 어떻게 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   오브젝트 모델이 정상이므로 그 노드의 데이터플레인 문제다. 그 노드의 kube-proxy Pod 상태/로그, `iptables -t nat -S | grep <서비스>`를 정상 노드와 비교, 규칙 동기화 지연(`kubeproxy_sync_proxy_rules_duration_seconds`)을 본다. 노드 재부팅 후라면 규칙 유실을 의심해 kube-proxy를 재시작한다. → 코어 5

   </details>

4. **상황:** 서비스가 4,000개인 클러스터에서 Service 변경 후 반영이 수 초&#126;수십 초 걸리고 kube-proxy CPU가 높다. 모드는 iptables다.
   **질문:** 원인과 선택지는?

   <details markdown="1"><summary>답 확인</summary>

   iptables 모드는 규칙을 순차 평가하는 O(n)이고, 변경마다 전체 규칙셋을 재구성해 `iptables-restore`로 교체하므로 Service 수에 비례해 갱신 지연이 늘어난다. 선택지는 nftables 모드(GA, set/map 증분 갱신), Cilium의 kube-proxy 대체(eBPF), Service 수 감축이다. IPVS는 O(1)이지만 공식 폐기 경로(KEP-5495)라 신규 도입하지 않는다. → 코어 4

   </details>

📖 출처: Kubernetes_Internals_Network_Guide/03-네트워크/14-Service와-EndpointSlice.md, Kubernetes_Internals_Network_Guide/03-네트워크/15-kube-proxy-데이터플레인-해부.md, kubernetes-qustion-book/02_심화/06_네트워크와_서비스_노출.md

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] ClusterIP = 인터페이스에 ( 있다 / 없다 ) ,  LoadBalancer ⊃ ______ ⊃ ______
         ExternalName = 순수 ____ CNAME ,  Headless = clusterIP: ____ → DNS가 Pod IP ( ? )

[코어 2] Endpoints → ____ (약 ___개 단위 샤딩) ,  연결 라벨 = kubernetes.io/____-name
         conditions 3: ready / ____ / ____ ,  종료 중: ready=( ? ), terminating=( ? )

[코어 3] 체인: KUBE-____ → KUBE-____-* → KUBE-____-* → DNAT
         i번째 확률 = 1 / ( ? ) ,  N=3 → ___ , ___ , 무조건
         SNAT 마크 = 0x____ ,  응답 역변환 = ______ 테이블 ,  갱신 = ______-restore (전체 교체)

[코어 4] iptables O(__) / IPVS O(__) / nftables = ____ + ____ ,  IPVS 가상 인터페이스 = ____
         IPVS 폐기 KEP = ____ ,  eBPF 대표 = ______

[코어 5] externalTrafficPolicy: Cluster → 클라이언트 IP ( 보존 / 소실 ) ,  Local → ( ? )
         환경변수 디스커버리 함정 = Pod ____ 시점 스냅샷 → ____를 쓴다
```

### 2. 인출 질문

1. ClusterIP는 어디에 존재하며 `ping`이 왜 실패하는가?

   <details markdown="1"><summary>답 확인</summary>

   어떤 네트워크 인터페이스에도 바인딩되지 않은 가상 좌표다. 라우팅 테이블에 그 주소로 가는 물리 경로가 없어 응답이 없다. 각 노드 커널의 규칙(iptables/IPVS/eBPF)이 그 IP로 가는 패킷을 가로채 실제 Pod IP로 바꿔치기한다. → 코어 1

   </details>

2. Headless Service는 일반 Service와 무엇이 다르고 왜 필요한가?

   <details markdown="1"><summary>답 확인</summary>

   `clusterIP: None`이라 ClusterIP와 kube-proxy 규칙이 없고 DNS 조회가 모든 Pod IP 목록을 반환한다. StatefulSet의 개별 Pod DNS 이름을 주기 위해, 그리고 gRPC 같은 장시간 연결의 클라이언트 사이드 로드밸런싱이나 분산 시스템의 피어 디스커버리를 위해 필요하다. → 코어 1

   </details>

3. EndpointSlice가 단일 Endpoints를 대체한 이유는?

   <details markdown="1"><summary>답 확인</summary>

   단일 Endpoints는 Pod 하나만 바뀌어도 전체 오브젝트가 다시 쓰이고 모든 노드의 kube-proxy로 재전송돼 API 서버·etcd·watch 부하가 Pod 수에 비례해 폭증했다. EndpointSlice는 약 100개 단위로 샤딩해 바뀐 슬라이스 하나만 갱신한다. → 코어 2

   </details>

4. iptables 모드에서 엔드포인트 N개일 때 i번째 규칙의 확률과 그 이유는?

   <details markdown="1"><summary>답 확인</summary>

   `1/(N-i+1)`이고 마지막은 무조건이다. 규칙이 위에서부터 독립적으로 평가되며 앞에서 안 걸린 패킷만 다음에 들어가므로, N=3이면 1/3, (남은 2/3의 1/2=전체 1/3), 나머지 1/3으로 균등해진다. → 코어 3

   </details>

5. 응답 패킷은 어떻게 원래 클라이언트로 돌아오는가?

   <details markdown="1"><summary>답 확인</summary>

   DNAT 규칙은 연결의 첫 패킷에만 적용되고 변환 정보가 conntrack에 기록된다. 응답은 conntrack이 같은 흐름으로 인식해 역변환(Un-DNAT)하므로 클라이언트에게는 ClusterIP에서 온 것처럼 보인다. 그래서 분배도 연결 단위로 유지된다. → 코어 3

   </details>

6. iptables와 IPVS의 성능 차이와 IPVS의 현재 상태는?

   <details markdown="1"><summary>답 확인</summary>

   iptables는 Service 수에 비례하는 선형 순회 O(n)에 변경마다 전체 재구성이고, IPVS는 해시 O(1)에 항목 단위 증분 갱신이다. 그러나 IPVS는 SNAT 등을 여전히 iptables+ipset에 의존해 KEP-5495로 공식 폐기 경로에 들어섰다(v1.35 경고 → v1.37 게이트 → v1.40 기본 비활성 → v1.43 제거). 대안은 GA인 nftables다. → 코어 4

   </details>

7. `externalTrafficPolicy: Cluster`와 `Local`의 차이와 트레이드오프는?

   <details markdown="1"><summary>답 확인</summary>

   `Cluster`는 클러스터 전체 엔드포인트로 균등 분산하지만 노드를 건널 때 SNAT로 원본 IP가 소실되고 홉이 늘어난다. `Local`은 그 노드의 로컬 엔드포인트로만 보내 홉과 SNAT가 없어 클라이언트 IP가 보존되지만, Pod가 없는 노드는 응답이 없고 분포가 불균등하면 부하가 불균등하다. → 코어 5

   </details>

8. 환경변수 기반 서비스 디스커버리의 함정은 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   Pod 시작 시점의 스냅샷이라 Service가 Pod보다 나중에 만들어지면 환경변수가 아예 없고, 재시작하기 전에는 알 방법이 없다. 배포 순서에 따라 재현 여부가 달라지는 디버깅이 까다로운 버그다. DNS는 요청 시점에 해석되어 순서 의존이 없다. → 코어 5

   </details>

### 3. 기억 고리

- **C++ 유추:** ClusterIP = LB의 VIP. ⚠️ VIP를 가진 LB 서버 프로세스가 없고, 각 노드 커널이 패킷을 가로채 바꾼다. kube-proxy가 죽어도 기존 연결은 유지된다.
- **C++ 유추:** 연결 단위 확률 분배 + conntrack = 세션 스티키 LB. ⚠️ 새로 늘린 서버로 기존 세션이 이동하지 않는다. 분산은 새 연결부터다.
- **비유:** Service = 대표 전화번호(ClusterIP), EndpointSlice = 현재 근무 상담원 명단, kube-proxy = 각 지점 교환대에 "이 번호는 이 상담원들에게 돌려라"를 적어 두는 관리자. ⚠️ 비유가 깨지는 지점: 교환대(커널 규칙)는 지점마다 따로 있고 대표번호 자체에는 사람이 없다.
- **비유:** 확률 체인 `1/3 → 1/2 → 무조건` = 3명 앞에서 "1/3 확률로 뽑고, 안 뽑히면 남은 2명 중 1/2, 마지막은 확정"하는 순차 추첨. ⚠️ 비유가 깨지는 지점: 추첨은 연결마다 한 번이고 이후는 conntrack이 결과를 기억한다.
- **묶음(3의 법칙):** 체인 3단(SERVICES·SVC·SEP) / EndpointSlice 조건 3(ready·serving·terminating) / 데이터플레인 3(iptables·IPVS·nftables) + eBPF는 다른 계열.
- **대칭·순서:** `Cluster`(균등·IP 소실) ↔ `Local`(IP 보존·불균등). iptables O(n)·전체 교체 ↔ nftables map·증분. 순서: DNS → ClusterIP → DNAT(SVC→SEP) → conntrack 역변환.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod에서 `payments:80`으로 보낸 연결이 어떻게 실제 Pod에 도착하는가"를 DNS부터 DNAT까지 처음 듣는 사람에게 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "왜 Pod를 늘려도 기존 접속이 새 Pod로 안 옮겨가는가, 그리고 접속자 IP를 서버에서 보려면 무엇을 바꿔야 하는가"를 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "Service 수가 많으니 IPVS로 가자" vs B "IPVS는 폐기 경로이니 nftables로 가자" — 성능, 공식 일정, 호환성, 규모별 체감 차이를 근거로 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 iptables 체인과 확률 계산, conntrack 역변환을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/14 (14.1&#126;14.4), 15 (15.1&#126;15.6), kubernetes-qustion-book 02_심화/06 (2&#126;4, 6)*
