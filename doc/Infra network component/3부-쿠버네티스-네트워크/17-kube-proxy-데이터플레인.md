---
title: "17장. kube-proxy 데이터플레인"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 17
---

# 17장. kube-proxy 데이터플레인

> **🎮 게임 서버 개발자에게** — 서버 목록을 들고 클라이언트 연결을 백엔드로 중계하는 프로세스를 직접 만든다면 `recv()`로 받아 `send()`로 넘기는 사용자 공간 프록시가 떠오른다. kube-proxy는 **그런 프로그램이 아니다.** 이름에 "proxy"가 있지만 패킷을 받지도 보내지도 않는다. Service와 EndpointSlice를 감시해서 **커널 규칙표를 다시 써 주는 컨트롤러**일 뿐이고, 실제 목적지 바꿔치기(DNAT)는 커널이 한다. 그래서 kube-proxy가 죽어도 이미 맺어진 연결은 살아 있다. 이 장은 그 규칙표가 정확히 어떤 모양인지(`KUBE-SERVICES → KUBE-SVC-* → KUBE-SEP-*`)를 끝까지 따라간다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - Service가 수천 개로 늘어나면서 스케일·롤아웃 후 규칙 반영이 눈에 띄게 느리다 / kube-proxy CPU가 높다 → iptables 모드의 구조적 한계와 대안을 알아야 한다.
> - EndpointSlice는 정상인데 ClusterIP로만 접속이 안 된다, 일부 노드에서만 안 된다 → 노드의 규칙을 직접 읽어 비교해야 한다.
> - 간헐적 타임아웃·새 연결 거부가 생긴다 → conntrack 테이블 고갈을 의심해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** kube-proxy는 Service/EndpointSlice를 watch해 노드 커널의 규칙(iptables·IPVS·nftables)을 다시 써 주는 컨트롤러일 뿐이고, 패킷 처리(DNAT와 conntrack 되돌림)는 커널이 하며, 모드에 따라 규칙 조회가 선형 O(n)(iptables)이거나 해시 O(1)(IPVS, nftables 맵)이다.

1. **kube-proxy는 데이터 경로에 없다** — ① API 서버 watch → ② 노드 규칙 갱신 → ③ 커널이 패킷 처리. DNAT는 연결의 첫 패킷에만 적용되고 응답·후속 패킷은 conntrack이 처리한다.
2. **iptables 모드는 체인 사슬이다** — `KUBE-SERVICES → KUBE-SVC-* → KUBE-SEP-*`에서 i번째 엔드포인트에 `1/(N−i+1)` 확률을 걸어 균등 분배하고, 마지막에 DNAT한다. 갱신은 증분이 아니라 `iptables-restore`로 전체 교체한다.
3. **모드는 조회 구조의 선택이다** — iptables(선형 O(n)), IPVS(`kube-ipvs0` + 해시 O(1), 하지만 공식 폐기 경로), nftables(집합/맵, GA), eBPF(Cilium은 netfilter 자체를 우회).

**이 장의 학습 목표**

- kube-proxy의 3단계 구조와 "데이터 경로에 없다"는 의미(죽어도 기존 연결 유지)를 설명한다.
- iptables 체인 계층을 규칙 출력으로 읽고, 확률 `1/(N−i+1)`이 균등 분배가 되는 이유를 계산한다.
- DNAT·헤어핀·`KUBE-POSTROUTING`의 `0x4000` 마크·conntrack이 요청과 응답에서 하는 일을 설명한다.
- IPVS의 `kube-ipvs0`·가상 서버 구조, iptables와의 O(n)/O(1) 차이, IPVS의 폐기 경로와 nftables·eBPF를 설명한다.
- 데이터플레인 문제를 증상별로 진단한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 사용자 공간 L4 프록시(`recv` → `send`) | kube-proxy | 가상 주소 → 실제 백엔드로 연결을 분배한다 | kube-proxy는 패킷을 받지 않는다. 규칙만 깔고 커널이 처리하므로 죽어도 기존 연결이 유지된다 |
| 서버 목록 `vector`를 순회하며 맞는 항목 찾기 vs `unordered_map` 조회 | iptables 선형 O(n) vs IPVS/nftables 해시·맵 O(1) | 자료구조에 따라 조회 비용이 갈린다 | iptables는 Service 수만큼 `KUBE-SERVICES` 체인이 길어지고 규칙 갱신도 전체 재구성 비용이 든다 |
| 연결별 상태(`fd → 상대 주소`)를 보관하는 맵 | conntrack | 첫 연결에서 정한 목적지를 끝까지 유지한다 | 커널의 연결 추적 테이블이고, 가득 차면 새 연결이 거부된다(`nf_conntrack_max`) |
| 서버 목록 스냅샷을 새로 만들어 통째로 교체(atomic swap) | `iptables-restore`로 전체 규칙 원자적 교체 | 갱신 도중 반쪽짜리 상태가 노출되지 않는다 | Service가 많을수록 만들고 적재하는 시간이 커진다 |
| 리스트를 한 번 훑으며 i번째를 `1/(N-i+1)` 확률로 뽑아 균등 샘플링 | `statistic --mode random --probability` | 순차 확률로 결과적으로 균등해진다 | 확률은 **연결 단위**로 한 번 굴리고, 소수의 오래 가는 연결은 균등하게 퍼지지 않는다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. kube-proxy Pod가 죽으면 이미 맺어진 연결은 끊길까? 새 Service를 만들면?
> 2. Pod가 3개일 때 iptables의 확률이 `1/3, 1/2, 무조건`인 이유는? 5개일 때는?
> 3. DNAT로 목적지를 바꾼 패킷의 응답은 어떻게 클라이언트에게 되돌아갈 때 원래 ClusterIP처럼 보일까?
> 4. Service가 5,000개일 때 iptables 모드에서 무슨 일이 벌어질까?
> 5. Pod가 자기가 속한 Service를 호출하면 무슨 문제가 생길까?
>
> **처리법:** 🛠 실습 `iptables -t nat -S KUBE-SERVICES | grep <ClusterIP>` → `KUBE-SVC-*` → `KUBE-SEP-*`까지 따라가기, `kubectl scale`로 레플리카 3→6 바꾸고 확률 `0.333`→`0.1666` 확인, `kubectl get configmap kube-proxy -n kube-system -o yaml | grep "mode:"` → 읽자마자 직접 실행(노드 접근 필요) · 🗺 관계도 watch → 규칙 갱신 → 커널 처리, `PREROUTING/OUTPUT → KUBE-SERVICES → KUBE-SVC → KUBE-SEP → DNAT` · 📦 카드로 확률 공식 `p_i = 1/(N−i+1)`, `0x4000` 마크, `kube-ipvs0`, IPVS 스케줄러 rr/lc/dh/sh/wrr, 규칙 수 추정 `1,000 × (2 + 10 × 2) = 22,000`

---

## 코어 1. kube-proxy는 데이터 경로에 없다

### 1.1 watch → 규칙 갱신 → 커널 처리

**한 줄 요약:** kube-proxy는 노드마다 도는 DaemonSet으로, Service와 EndpointSlice를 감시해 그 노드의 데이터플레인을 다시 프로그래밍한다.

16장에서 Service(가상 좌표)와 EndpointSlice(실제 Pod IP 목록)를 봤다([16장](16-Service와-EndpointSlice.md)). kube-proxy가 하는 일은 정확히 이것이다. **EndpointSlice의 내용을 노드 커널이 이해하는 규칙으로 번역한다.**

```
① API 서버를 watch — Service와 EndpointSlice 변경 감지
② 노드의 데이터플레인(iptables / IPVS / nftables) 규칙 갱신
③ 실제 패킷 처리는 커널이 한다 — kube-proxy는 데이터 경로에 없다
```

kube-proxy가 감시하는 것은 두 리소스뿐이다. **Service**(ClusterIP, 포트, 타입 같은 "정책")와 **EndpointSlice**(Service 뒤에 실제로 떠 있는 Pod IP:포트 목록, Pod가 뜨고 죽을 때마다 바뀌는 부분)다. 이 결과로 "ClusterIP로 보낸 패킷이 어느 백엔드 Pod로 갈지"가 각 노드에서 **로컬로** 결정된다. 트래픽이 어떤 중앙 로드밸런서도 거치지 않는 이유다.

kube-proxy 프로세스가 죽어도 이미 프로그래밍된 규칙은 커널에 남아 있으므로 기존 연결은 끊기지 않는다. 다만 그 이후의 Service/EndpointSlice 변경은 반영되지 않는다. CNI가 노드 간에 패킷을 옮기는 방법([15장](15-CNI-플러그인과-패킷-경로.md))을 정했다면, kube-proxy는 **그 패킷이 노드에 도착한 뒤 어떤 목적지로 바뀔지**를 정하는 층이다.

```bash
kubectl get pods -n kube-system -l k8s-app=kube-proxy
kubectl logs -n kube-system -l k8s-app=kube-proxy --tail=20
```

### 1.2 DNAT와 conntrack — 되돌아오는 패킷

**한 줄 요약:** DNAT 규칙은 연결의 첫 패킷에만 적용되고, 응답과 후속 패킷은 conntrack이 저장한 변환 정보로 역변환된다.

이후 절의 규칙은 전부 요청이 나가는 방향(목적지를 바꾸는 DNAT)만 설명한다. 응답 패킷이 원래 클라이언트에게 돌아가게 하는 것은 iptables의 역방향 규칙이 아니라 리눅스 커널의 **연결 추적(conntrack)** 이다. conntrack과 NAT의 일반 원리는 [5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md)에서 다룬다.

```
요청: 클라이언트(10.244.1.9:34567) → ClusterIP(10.96.142.88:80)
        │ DNAT 규칙 적용, 동시에 conntrack에 변환 정보 기록
        ▼
      실제 목적지(10.244.1.3:8080)로 전달

응답: 10.244.1.3:8080 → 10.244.1.9:34567
        │ conntrack이 이 흐름을 "위 요청의 응답"으로 인식
        │ 저장해 둔 변환 정보를 참조해 역변환 (Un-DNAT)
        ▼
      클라이언트가 보기엔 여전히 10.96.142.88:80에서 온 응답
```

**핵심은 DNAT 규칙이 최초 패킷에만 적용되고, 이후 같은 흐름의 나머지 패킷과 응답 방향은 conntrack 테이블을 참조한다는 점이다.** 확률 기반 분배가 연결 단위로 유지되는 것도 이 conntrack 매핑 덕분이다(같은 TCP 연결의 패킷들이 매번 다른 확률 굴림을 거치지 않는다).

```bash
docker exec k8s-guide-worker conntrack -L 2>/dev/null | grep 10.96.142.88
```
```
tcp 6 431999 ESTABLISHED src=10.244.1.9 dst=10.96.142.88 sport=34567 dport=80 \
    src=10.244.1.3 dst=10.244.1.9 sport=8080 dport=34567 [ASSURED]
```

두 번째 `src=`/`dst=` 쌍이 conntrack이 기억하는 **역변환 정보**다.

## 코어 2. iptables 모드는 체인 사슬이다

### 2.1 체인 계층 구조

**한 줄 요약:** `KUBE-SERVICES`(단일 진입점)에서 Service 전용 체인 `KUBE-SVC-*`로, 거기서 엔드포인트 체인 `KUBE-SEP-*`로 내려가 DNAT한다.

```
PREROUTING (외부에서 들어온 패킷)  ─┐
                                   ├─→ KUBE-SERVICES
OUTPUT (로컬 프로세스가 보낸 패킷) ─┘
                                        │
                    ┌───────────────────┼────────────────────┐
                    ▼                   ▼                    ▼
            KUBE-SVC-<서비스A 해시>  KUBE-SVC-<서비스B 해시>  KUBE-NODEPORTS
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
  KUBE-SEP-<EP1>  KUBE-SEP-<EP2>  KUBE-SEP-<EP3>
      │             │             │
     DNAT          DNAT          DNAT
  → Pod1 IP:Port  → Pod2 IP:Port  → Pod3 IP:Port
```

`KUBE-SERVICES`는 모든 ClusterIP/NodePort 트래픽의 단일 진입점이다. 여기서 목적지 IP:포트로 매칭해 해당 Service 전용 체인으로 점프하고, 그 체인 안에서 어느 엔드포인트로 보낼지 확률적으로 결정한 뒤, 엔드포인트 전용 체인에서 실제 DNAT가 일어난다. 체인·테이블 개념은 [5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md)을 본다.

### 2.2 실제 규칙 읽기와 확률의 수학

**한 줄 요약:** `statistic --mode random`이 규칙을 위에서부터 독립 평가하며, i번째 규칙의 확률 `1/(N−i+1)`이 결과적으로 모든 엔드포인트에 균등 분배를 만든다.

Service `payments`가 엔드포인트 3개를 갖는다고 하자.

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-SERVICES | grep payments
```
```
-A KUBE-SERVICES -d 10.96.142.88/32 -p tcp -m comment --comment "default/payments cluster IP" \
   -m tcp --dport 80 -j KUBE-SVC-P2QNAX57L3TRA3TJ
```
```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-SVC-P2QNAX57L3TRA3TJ
```
```
-A KUBE-SVC-P2QNAX57L3TRA3TJ -m comment --comment "default/payments -> 10.244.1.3:8080" \
   -m statistic --mode random --probability 0.33333333349 -j KUBE-SEP-AAAAAAAAAAAAAA
-A KUBE-SVC-P2QNAX57L3TRA3TJ -m comment --comment "default/payments -> 10.244.2.4:8080" \
   -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-BBBBBBBBBBBBBB
-A KUBE-SVC-P2QNAX57L3TRA3TJ -m comment --comment "default/payments -> 10.244.1.5:8080" \
   -j KUBE-SEP-CCCCCCCCCCCCCC
```

이미 이전 규칙에서 매칭되지 않고 "통과해 내려온" 패킷만 다음 규칙의 확률 계산에 들어간다.

```
엔드포인트가 N개일 때, i번째(1부터 시작) 규칙에 적힌 확률 p_i는:

    p_i = 1 / (N - i + 1)     (마지막 규칙은 확률 없이 무조건 매칭)

N=3일 때:
  1번째: p_1 = 1/3 = 0.3333...   → 전체 패킷의 33.33%가 여기서 걸림
  2번째: p_2 = 1/2 = 0.5         → 남은 66.67% 중 절반, 즉 전체의 33.33%
  3번째: 무조건(마지막)           → 나머지 전체의 33.33%
```

검증: 1번째에서 안 걸릴 확률은 `1 − 1/3 = 2/3`. 그 상태에서 2번째가 걸릴 확률은 `2/3 × 1/2 = 1/3`. 3번째는 나머지 `2/3 × 1/2 = 1/3`. 세 엔드포인트가 정확히 1/3씩 받는다. 엔드포인트가 5개면 확률은 순서대로 `1/5, 1/4, 1/3, 1/2, (마지막 무조건)`이다. 3개일 때 `0.33333`이던 첫 규칙은 6개일 때 `0.16666`(=1/6)이 된다.

**주의**: 이것은 연결(connection) 단위 확률 분배다. 매 패킷마다 다시 굴리는 것이 아니라 conntrack이 최초 SYN 패킷에서 결정한 목적지를 그 연결이 끝날 때까지 유지한다. 그래서 **연결 수가 충분히 많을 때만** 확률이 통계적으로 균등 분배로 수렴한다. 연결이 소수이고 오래 유지되는 워크로드(gRPC 스트리밍 등)에서는 16장의 헤드리스 서비스 + 클라이언트 사이드 로드밸런싱이 필요한 이유가 여기서도 드러난다.

### 2.3 엔드포인트 체인 — DNAT와 헤어핀, SNAT 마크

**한 줄 요약:** `KUBE-SEP-*`가 실제 DNAT를 하고, 첫 규칙은 헤어핀(Pod가 자기 Service를 호출) 대응이며, `0x4000` 마크가 붙은 패킷만 마스커레이드된다.

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-SEP-AAAAAAAAAAAAAA
```
```
-A KUBE-SEP-AAAAAAAAAAAAAA -s 10.244.1.3/32 -j KUBE-MARK-MASQ
-A KUBE-SEP-AAAAAAAAAAAAAA -p tcp -m tcp -j DNAT --to-destination 10.244.1.3:8080
```

**목적지가 바뀐다.** `10.96.142.88:80` → `10.244.1.3:8080`. ClusterIP의 정체는 이 iptables 규칙일 뿐이다.

첫 번째 규칙은 **헤어핀(hairpin) 대응**이다. Pod가 자기 자신이 속한 Service를 호출해 결국 자기 자신에게 되돌아오는 경우, SNAT 없이는 응답 패킷의 출발지가 여전히 Pod 자신이 되어 커널이 그 응답을 "내가 보낸 요청에 대한 응답"으로 인식하지 못한다. `KUBE-MARK-MASQ`로 표시를 남기면 이후 `KUBE-POSTROUTING` 체인이 이 표시를 보고 마스커레이드를 적용한다.

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-POSTROUTING
```
```
-A KUBE-POSTROUTING -m mark ! --mark 0x4000/0x4000 -j RETURN
-A KUBE-POSTROUTING -j MARK --xor-mark 0x4000
-A KUBE-POSTROUTING -j MASQUERADE --random-fully
```

`0x4000` 마크가 붙은 패킷만 SNAT된다. 이것이 16장의 `externalTrafficPolicy: Cluster`에서 클라이언트 IP가 사라지는 정확한 지점이다. 노드를 건너가야 하는 트래픽에는 이 마크가 붙고 `KUBE-POSTROUTING`이 소스 주소를 노드 자신의 IP로 치환한다.

### 2.4 NodePort 체인과 `--cluster-cidr`

**한 줄 요약:** NodePort는 `KUBE-SERVICES` 대신 `KUBE-NODEPORTS`(포트만으로 매칭)에서 같은 `KUBE-SVC-*`로 들어가는 또 하나의 진입로다.

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-NODEPORTS
```
```
-A KUBE-NODEPORTS -p tcp -m comment --comment "default/payments" \
   -m tcp --dport 31234 -j KUBE-SVC-P2QNAX57L3TRA3TJ
```

목적지 IP가 특정 ClusterIP가 아니라 **노드 자신의 어떤 주소든** 지정된 포트로 오면 매칭되어야 하므로 이 체인은 목적지 IP를 보지 않고 포트만으로 매칭한다. 이후 흐름은 ClusterIP 트래픽과 같다.

kube-proxy는 `--cluster-cidr`로 클러스터 내부 대역을 알고 있을 때만 "이 트래픽은 클러스터 내부에서 온 것이니 SNAT하지 않아도 된다"는 판단을 할 수 있다. 이 값이 없거나 잘못되면 클러스터 내부 Pod 간 트래픽까지 불필요하게 마스커레이드되거나 외부 트래픽 처리가 꼬일 수 있다. NodePort/LoadBalancer에서 클라이언트 IP가 예상과 다르게 사라지면 이 설정도 확인한다.

```bash
docker exec k8s-guide-control-plane grep cluster-cidr /var/lib/kube-proxy/config.conf 2>/dev/null \
  || kubectl get configmap kube-proxy -n kube-system -o yaml | grep -i clusterCIDR
```

### 2.5 규칙 갱신은 증분이 아니라 원자적 전체 교체

**한 줄 요약:** 변경 때마다 전체 `KUBE-*` 규칙을 메모리에서 다시 구성해 `iptables-restore --noflush`로 한 번에 적재한다.

```
① watch로 Service/EndpointSlice 변경 감지 (또는 --sync-period 주기)
② 메모리에서 전체 KUBE-* 체인 규칙을 텍스트로 재구성
③ iptables-restore --noflush 로 커널에 한 번에 적재
   (--noflush: KUBE- 로 시작하지 않는 다른 규칙은 건드리지 않음)
```

갱신 도중 "일부 규칙만 반영된 어중간한 상태"가 노출되지 않는다(원자성). 대신 **Service 개수가 많아질수록 텍스트를 만들고 적재하는 시간이 늘어난다.** 이것이 iptables 모드의 구조적 한계이고, 아래 3절의 이유다.

```bash
kubectl get --raw /metrics 2>/dev/null | grep kubeproxy_sync_proxy_rules_duration
```

### 2.6 conntrack 테이블 한계

**한 줄 요약:** DNAT된 연결은 conntrack 테이블에 기록되고, 이 테이블이 가득 차면 새 연결이 거부된다.

```bash
docker exec k8s-guide-worker conntrack -L 2>/dev/null | head
docker exec k8s-guide-worker conntrack -C          # 현재 엔트리 수
docker exec k8s-guide-worker sysctl net.netfilter.nf_conntrack_max
dmesg | grep -i "nf_conntrack: table full"
```

사용량이 최대치의 80%를 넘으면 위험하다. 원인은 짧은 연결이 매우 많은 워크로드, 타임아웃이 긴 UDP 연결, 연결 누수다. 원천이 제시한 튜닝 예는 다음과 같다.

```bash
sysctl -w net.netfilter.nf_conntrack_max=2097152
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_time_wait=30
sysctl -w net.netfilter.nf_conntrack_udp_timeout=30
```

> **[보충]** 같은 원천의 다른 절은 `nf_conntrack_max=1048576`, `nf_conntrack_tcp_timeout_established=3600`을 예시 값으로 든다. 값은 환경에 맞는 예시일 뿐이며 정답이 아니다. DNS 5초 지연이 conntrack의 UDP 경쟁 조건 때문이라는 설명도 원천에 있으며 [18장](18-DNS와-서비스-디스커버리.md)에서 다룬다. Cilium의 eBPF 데이터플레인은 자체 연결 추적을 쓰므로 이 문제에서 자유롭다고 원천은 말한다.

## 코어 3. 모드는 조회 구조의 선택이다

### 3.1 IPVS 모드 — `kube-ipvs0`와 해시 테이블

**한 줄 요약:** 모든 ClusterIP를 더미 인터페이스에 바인딩하고, 커널 IPVS의 해시 테이블 가상 서버/실제 서버 구조로 O(1) 조회한다.

IPVS(IP Virtual Server)는 리눅스 커널에 오래전부터 있던 **범용 L4 로드밸런서**(LVS 프로젝트의 산물)다.

```
① kube-ipvs0 이라는 더미(dummy) 네트워크 인터페이스를 노드에 생성
② 모든 Service의 ClusterIP를 이 인터페이스에 로컬 주소로 바인딩
     (이 IP로 온 패킷이 로컬로 라우팅되게 하기 위함 — "가짜 존재"를 만드는 트릭)
③ IPVS 커널 모듈에 Service마다 가상 서버(Virtual Server) 등록
④ 각 엔드포인트를 그 가상 서버의 실제 서버(Real Server)로 등록
```

```bash
docker exec k8s-guide-worker ip addr show kube-ipvs0
docker exec k8s-guide-worker ipvsadm -Ln
```
```
TCP  10.96.142.88:80 rr
  -> 10.244.1.3:8080              Masq    1      0          0
  -> 10.244.2.4:8080              Masq    1      0          0
  -> 10.244.1.5:8080              Masq    1      0          0
```

패킷의 목적지 IP:포트로 **해시 테이블을 직접 조회**해 가상 서버를 찾고, 그 안의 실제 서버 목록에서 스케줄러 알고리즘에 따라 하나를 고른다. Service가 몇 개든 조회는 해시 하나로 끝난다. 스케줄러는 `--ipvs-scheduler`(기본 `rr`)로 고른다.

| 알고리즘 | 이름 | 동작 |
|---|---|---|
| `rr` | 라운드 로빈 | 순서대로 균등 분배 (기본값) |
| `lc` | 최소 연결(Least Connection) | 현재 활성 연결이 가장 적은 실제 서버로 |
| `dh` | 목적지 해싱 | 목적지 IP 기준 해시로 고정 — 캐시 서버 앞단 |
| `sh` | 소스 해싱 | 소스 IP 기준 해시로 고정 — 세션 고정 효과 |
| `wrr` | 가중 라운드 로빈 | 실제 서버별 가중치 반영 |

IPVS 모드에서도 iptables가 완전히 사라지지는 않는다. SNAT/마스커레이드, NodePort, 헤어핀 같은 부가 기능은 iptables로 구현되지만, Service마다 체인을 만드는 대신 `ipset`(해시 기반 IP 집합)을 활용해 규칙 수를 극적으로 줄인다.

```bash
docker exec k8s-guide-worker ipset list -n | grep KUBE
# KUBE-CLUSTER-IP / KUBE-LOOP-BACK / KUBE-NODE-PORT-TCP / KUBE-EXTERNAL-IP
docker exec k8s-guide-worker iptables -t nat -S | grep KUBE-CLUSTER-IP
# -A KUBE-SERVICES -m set --match-set KUBE-CLUSTER-IP dst,dst -j KUBE-MARK-MASQ
```

Service가 1개든 5,000개든 이 iptables 규칙은 한 줄이다.

`kube-ipvs0`에 모든 ClusterIP를 바인딩하면 노드가 그 IP들의 소유자라고 ARP로 응답할 수도 있어 노드 간(특히 L2 모드 MetalLB와) 충돌이 생길 수 있다. 이를 막으려고 kube-proxy는 ARP 파라미터를 조정해 `kube-ipvs0`가 ARP 요청에 응답하지 않게(NOARP) 만든다(`net.ipv4.conf.all.arp_ignore = 1`, `arp_announce = 2`). IPVS 전환 뒤 외부 IP 광고가 꼬이면 `strictARP` 관련 설정부터 확인한다.

### 3.2 iptables vs IPVS 비교

| | iptables | IPVS |
|---|---|---|
| 조회 방식 | **선형 순회(O(n))** — 체인을 순서대로 평가 | **해시 테이블 조회(O(1))** |
| Service 수 증가 시 | 규칙 수와 평가 시간이 비례해 증가 | 조회 비용이 거의 일정 |
| 로드밸런싱 알고리즘 | 확률 기반 랜덤 하나뿐 | rr/lc/dh/sh/wrr 등 다양 |
| 갱신 방식 | 전체 규칙셋 재구성 후 `iptables-restore` | 가상/실제 서버 단위로 증분 갱신 가능 |
| 커널 요구사항 | 기본 내장 | `ip_vs*` 커널 모듈 로드 필요 |
| 부가 기능(SNAT 등) | iptables 규칙 | iptables + ipset 조합 (완전히 벗어나지는 않음) |

왜 iptables가 대규모에서 느려지는가. `KUBE-SVC-*` 체인 하나를 평가하는 비용은 작지만, Service 수가 늘면 `KUBE-SERVICES` 체인이 길어져 매 신규 연결의 첫 패킷마다 수천 개 규칙을 순차 비교해야 할 수 있다. 게다가 하나라도 바뀌면 전체를 다시 만들어 통째로 교체하므로 `kubeproxy_sync_proxy_rules_duration_seconds`로 측정되는 갱신 지연도 함께 늘어난다. 규칙 수 추정(`kubernetes-textbook-main` 23.5)은 다음과 같다.

```
서비스 1,000개 × 엔드포인트 평균 10개
→ 규칙 수 ≈ 1,000 × (2 + 10 × 2) = 22,000
서비스 5,000개면 10만 개를 넘는다
```

증상은 서비스 변경 반영이 수 초&#126;수십 초 지연되는 것, kube-proxy CPU 상승, `iptables-restore` 실행 시간 증가다. 대책은 IPVS 전환, Cilium의 kube-proxy 대체(eBPF), Service 수 자체를 줄이기(헤드리스 활용)였다.

### 3.3 IPVS는 공식 폐기 경로, nftables 모드, eBPF

**한 줄 요약:** IPVS는 KEP-5495로 단계적 폐기가 결정되어 신규로 채택할 이유가 없고, 후속은 nftables 모드이며, Cilium은 netfilter 자체를 우회한다.

> **[보충]** 두 원천이 IPVS를 정반대로 평가한다. `kubernetes-textbook-main` 9.5는 "Service가 1,000개를 넘으면 IPVS로"라고 권하고 nftables 모드를 "v1.29 알파, v1.31 베타"로 적는다. 더 최신·상세한 `Kubernetes_Internals_Network_Guide` 15장은 IPVS 모드가 KEP-5495로 폐기 경로에 들어섰고 nftables가 이미 GA라고 적는다. 이 책은 후자를 따른다. 아래 일정과 상태는 그 원천의 서술이며 자신의 클러스터 버전에서 반드시 직접 확인한다.

폐기 이유는 IPVS 모드에서도 SNAT·NodePort 같은 부가 기능이 여전히 iptables(+ipset)에 의존해야 했고, 커널 IPVS API만으로는 쿠버네티스 Service 모델을 완전히 구현할 수 없어 이중 구조를 유지할 실익이 크지 않다는 것이다. 원천의 일정은 다음과 같다.

| 버전 | 변화 |
|---|---|
| v1.35 | 문서에 폐기 예고 반영, kube-proxy가 IPVS 모드로 시작 시 경고 로그 출력 |
| v1.37 (원천이 "현재"로 적은 시점) | `KubeProxyIPVS` 기능 게이트 도입(기본 활성화), 마이그레이션 가이드 공개 |
| v1.40 | 기능 게이트 기본값이 비활성으로 전환 — IPVS를 쓰려면 게이트를 명시적으로 다시 켜야 함 |
| v1.43 | IPVS 코드 자체가 트리에서 제거 |

이미 IPVS를 쓰는 클러스터도 nftables(또는 iptables) 모드로의 전환을 지금부터 계획하는 것이 권장되고, 신규 클러스터라면 IPVS를 새로 채택할 이유는 사실상 없다.

**nftables 모드.** netfilter 프로젝트는 iptables를 유지보수 모드로 취급해 왔고, 최신 배포판의 `iptables` 명령이 내부적으로 `nft` 규칙으로 번역하는 호환 계층(`iptables-nft`)으로 동작하는 경우가 많다. kube-proxy도 nftables를 직접 쓰는 새 모드를 도입했고(알파 → 베타 → GA), 원천은 이미 GA라고 한다. 다만 **GA와 "기본값 전환"은 별개**여서, 호환성 때문에 기본값은 여전히 iptables인 클러스터가 많고 nftables를 쓰려면 `mode: nftables`를 명시해야 한다.

```
iptables 모드의 개념적 구조:
  KUBE-SERVICES 체인 (순회) → Service별 체인 (순회) → 확률 규칙 (순회) → DNAT

nftables 모드가 지향하는 구조:
  "목적지 IP:포트" → verdict map 조회 (해시, 단일 룩업) → 대응하는 엔드포인트 집합에서 선택 → DNAT
```

nftables는 집합(set)과 사상(map)이라는 1급 자료구조를 규칙 언어로 제공한다. **맵은 원소를 개별적으로 추가/삭제할 수 있어** 엔드포인트 하나가 바뀌면 맵의 원소 하나만 갱신하면 되고, 전체 체인을 텍스트로 다시 만들어 통째로 교체할 필요가 없다. 규칙(오브젝트) 수가 훨씬 적고 갱신도 더 빠르고 가볍다. 여전히 netfilter 훅(PREROUTING/OUTPUT) 위에서 동작하므로 iptables·IPVS와 같은 계열이다. 확인은 `nft list table ip kube-proxy`다(환경에 따라 명령/패키지 상이).

**eBPF(Cilium).** 앞의 세 모드는 모두 netfilter/커널 패킷 필터링 위에서 DNAT를 한다. Cilium은 이 전제를 버리고, eBPF 프로그램을 소켓 계층(`connect()`/`sendmsg()` 시점)이나 tc/XDP 계층에 부착해 패킷이 netfilter를 거치기 전에, 혹은 소켓이 목적지를 정하는 그 순간에 백엔드 주소로 바꾼다. 상세는 [22장](22-eBPF-데이터플레인과-Cilium.md)에서 다룬다.

### 3.4 현재 모드 확인

**한 줄 요약:** 모드는 `kube-proxy` ConfigMap의 `mode` 필드(`iptables`/`ipvs`/`nftables`)로 정해지고, 클러스터마다 다르므로 가정하지 말고 직접 확인한다.

```bash
kubectl get configmap kube-proxy -n kube-system -o yaml | grep "mode:"
```

nftables 전환을 검토할 때는 Service가 수백&#126;수천 개 규모이거나 갱신 지연이 체감될 정도로 잦은 경우이고, 그 이하에서는 iptables로도 체감 성능 차이가 크지 않다.

## 실무 적용

### 체크리스트

- [ ] kube-proxy는 규칙만 만들고 패킷은 커널이 처리한다. 죽어도 기존 연결은 유지되지만 이후 Service/EndpointSlice 변경은 반영되지 않는다. `kubectl logs -n kube-system -l k8s-app=kube-proxy`로 상태를 본다.
- [ ] iptables 모드의 흐름: `KUBE-SERVICES → KUBE-SVC-* → KUBE-SEP-* → DNAT`, 확률 `1/(N−i+1)`. `iptables -t nat -S KUBE-SERVICES | grep <ClusterIP>`에서 시작해 체인을 따라간다.
- [ ] DNAT는 첫 패킷에만 적용되고 응답은 conntrack이 되돌린다. 확률 분배는 연결 단위라 연결이 적고 오래 가면 균등하지 않다.
- [ ] `KUBE-POSTROUTING`의 `0x4000` 마크 → 마스커레이드. `externalTrafficPolicy: Cluster`의 클라이언트 IP 소실이 여기서 일어난다. `--cluster-cidr` 설정도 확인한다.
- [ ] Service가 수천 개이면 iptables 모드의 O(n) 조회와 전체 교체 비용이 문제가 된다. `kubeproxy_sync_proxy_rules_duration_seconds`와 `iptables -t nat -S | wc -l`로 측정한다.
- [ ] IPVS는 KEP-5495로 폐기 경로에 있다. 신규 채택은 피하고 nftables(또는 iptables)·eBPF 전환을 계획한다. 현재 모드는 ConfigMap의 `mode`로 확인한다.
- [ ] conntrack 사용량(`conntrack -C` vs `nf_conntrack_max`)이 80%를 넘으면 위험하다. `dmesg | grep -i "nf_conntrack: table full"`을 확인한다.

### 진단 — 오브젝트 모델이 정상이면 데이터플레인을 본다

| 증상 | 유력 원인 | 확인 |
|---|---|---|
| EndpointSlice는 정상인데 ClusterIP로 접근 안 됨 | kube-proxy 자체가 죽었거나 규칙 동기화 실패 | `kubectl logs -n kube-system <kube-proxy Pod>`, `kubeproxy_sync_proxy_rules_duration_seconds` |
| 일부 노드에서만 특정 Service 접근 안 됨 | 그 노드의 kube-proxy만 비정상, 규칙 동기화가 밀림 | 해당 노드 kube-proxy Pod 상태, `iptables -t nat -S \| grep <서비스>`를 노드별로 비교 |
| Service 변경(스케일 등) 후 반영이 눈에 띄게 느림 | Service 수가 많은 iptables 모드의 O(n) 동기화 비용 | `kubeproxy_sync_proxy_rules_duration_seconds`, `iptables -t nat -S \| wc -l` |
| IPVS 모드인데 `ipvsadm -Ln`에 가상 서버가 안 보임 | `ip_vs` 커널 모듈 미로드, kube-proxy 설정이 여전히 iptables 모드 | `lsmod \| grep ip_vs`, ConfigMap의 `mode` 값 |
| MetalLB(L2 모드) IP 광고가 IPVS 도입 후 꼬임 | strict ARP 미설정 또는 충돌 | `sysctl net.ipv4.conf.all.arp_ignore/arp_announce` |
| 특정 클라이언트만 항상 같은 백엔드로 감 | `sessionAffinity: ClientIP`, 혹은 IPVS `sh`/`dh` 스케줄러 | Service의 `sessionAffinity`, `--ipvs-scheduler` |
| 커넥션은 열리는데 응답이 없음(한쪽만 성공) | conntrack 문제 또는 노드 간 라우팅([15장](15-CNI-플러그인과-패킷-경로.md)) 결합 문제 | `conntrack -L`, 양쪽 노드 tcpdump |

**핵심 판별 기준은 "오브젝트 모델(16장)까지는 정상인가"다.** EndpointSlice에 올바른 Pod IP가 있는데도 트래픽이 도달하지 못한다면 문제는 거의 확실히 이 장의 커널 규칙 생성·적용 단계에 있다. 전체 계층별 절차는 [23장](../4부-진단/23-네트워크-장애-진단.md)을 본다.

### 시나리오로 확인하기

1. **상황:** 게임 서비스가 마이크로서비스 수천 개로 늘었다. 배포 후 Service 엔드포인트 변경이 노드에 반영되는 데 수십 초가 걸리고, 노드의 kube-proxy CPU가 높다. iptables 모드를 쓰고 있다.
   **질문:** 원인과 대응은?

   <details markdown="1"><summary>답 확인</summary>

   iptables 모드는 `KUBE-SERVICES` 체인을 선형 O(n)으로 순회하고, 변경 때마다 전체 규칙셋을 다시 구성해 `iptables-restore`로 통째로 교체하므로 Service 수에 비례해 느려진다(1,000개 × 엔드포인트 10개 ≈ 22,000규칙). `kubeproxy_sync_proxy_rules_duration_seconds`와 `iptables -t nat -S | wc -l`로 확인한다. 대안은 nftables 모드(집합/맵, 원소 단위 갱신)나 Cilium eBPF kube-proxy 대체이고, IPVS는 폐기 경로라 신규 채택을 피한다. Service 수 자체를 줄이는 것도 방법이다. → 코어 2 (2.5), 코어 3

   </details>

2. **상황:** 한 노드의 kube-proxy Pod가 크래시 루프다. 그 노드의 Pod들이 맺고 있던 연결은?
   **질문:** 영향 범위는?

   <details markdown="1"><summary>답 확인</summary>

   기존 연결은 유지된다. kube-proxy는 데이터 경로에 없고 이미 깔린 규칙대로 커널이 패킷을 처리한다. 다만 그 노드에서는 이후의 Service나 엔드포인트 변경이 반영되지 않는다. 다른 노드와 `iptables -t nat -S | grep <서비스>` 결과를 비교하고 kube-proxy 로그를 본다. → 코어 1

   </details>

3. **상황:** 트래픽이 많은 시간대에 간헐적 타임아웃과 새 연결 거부가 생긴다. 짧은 연결을 대량으로 만드는 워크로드다.
   **질문:** 의심 부품과 확인 방법은?

   <details markdown="1"><summary>답 확인</summary>

   conntrack 테이블 고갈을 의심한다(간헐적 타임아웃은 conntrack 고갈 또는 MTU). `conntrack -C`와 `sysctl net.netfilter.nf_conntrack_max`를 비교하고(80% 초과 위험), `dmesg | grep -i "nf_conntrack: table full"`로 확인한다. 대책으로 `nf_conntrack_max`를 늘리고 `nf_conntrack_tcp_timeout_time_wait`·`nf_conntrack_udp_timeout`을 줄이는 sysctl 튜닝이 있고, Cilium eBPF는 자체 연결 추적을 쓴다. MTU 불일치는 [15장](15-CNI-플러그인과-패킷-경로.md)에서 구분한다. → 코어 2 (2.6)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] kube-proxy 3단계: ① ( ? ) → ② 규칙 ( ? ) → ③ ( ? )가 패킷 처리
  watch 대상 2개: ( ? ) / ( ? )      죽으면 기존 연결 ( ? ), 새 변경 ( ? )
  DNAT는 연결의 ( ? ) 패킷에만, 응답은 ( ? )이 역변환

[코어 2] iptables 체인: PREROUTING/( ? ) → KUBE-( ? ) → KUBE-( ? )-* → KUBE-( ? )-* → ( ? )
  확률: p_i = ( ? )   마지막 규칙 = ( ? )   N=3: 1/3, ( ? ), 무조건
  KUBE-SEP 첫 규칙 = ( ? ) 대응, KUBE-POSTROUTING 마크 ( ? ) → MASQUERADE
  NodePort 진입 체인: KUBE-( ? ) (목적지 IP 없이 포트만)
  갱신: ( ? )로 전체 원자적 교체   conntrack 위험 ( ? )% 이상

[코어 3] IPVS: ( ? ) 인터페이스에 ClusterIP 바인딩 → 가상 서버/실제 서버, 해시 O( ? )
  스케줄러 5: rr / ( ? ) / dh / sh / wrr    iptables는 랜덤 ( ? )개
  IPVS 폐기 KEP: ( ? )    후속 모드: ( ? ) (집합/맵, 원소 단위 갱신)
  eBPF(Cilium): ( ? ) 를 우회
```

### 2. 인출 질문

1. kube-proxy가 "데이터 경로에 없다"는 말은 무슨 뜻이고, 죽으면 무슨 일이 생기는가?

   <details markdown="1"><summary>답 확인</summary>

   패킷을 직접 받거나 보내지 않고 Service/EndpointSlice를 watch해 노드 규칙을 갱신하기만 하며 실제 변환은 커널이 한다는 뜻이다. 죽어도 이미 프로그래밍된 규칙은 커널에 남아 기존 연결은 끊기지 않고, 이후 Service/EndpointSlice 변경만 반영되지 않는다. → 코어 1 (1.1)

   </details>

2. 응답 패킷은 어떻게 원래 ClusterIP에서 온 것처럼 클라이언트에게 돌아가는가?

   <details markdown="1"><summary>답 확인</summary>

   DNAT는 첫 패킷에 적용되며 이때 변환 정보가 conntrack에 기록된다. 응답은 conntrack이 "요청의 응답"으로 인식해 저장된 정보로 역변환(Un-DNAT)하므로 클라이언트에게는 `10.96.142.88:80`에서 온 것처럼 보인다. → 코어 1 (1.2)

   </details>

3. iptables 체인을 `KUBE-SERVICES`부터 DNAT까지 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   PREROUTING/OUTPUT에서 `KUBE-SERVICES`(ClusterIP/NodePort 단일 진입점)로 가 목적지 IP:포트로 Service 전용 `KUBE-SVC-*`로 점프하고, 거기서 확률로 엔드포인트를 골라 `KUBE-SEP-*`로 가면 첫 규칙이 헤어핀용 `KUBE-MARK-MASQ`, 이어 `DNAT --to-destination <Pod IP:포트>`가 목적지를 바꾼다. → 코어 2 (2.1&#126;2.3)

   </details>

4. N개 엔드포인트에서 i번째 규칙의 확률과, N=3에서 균등 분배가 되는 검증을 하라.

   <details markdown="1"><summary>답 확인</summary>

   `p_i = 1/(N−i+1)`, 마지막은 무조건. N=3: 1번째 1/3, 2번째 남은 2/3 중 1/2이므로 전체의 1/3, 3번째 나머지 전체의 1/3. N=6이면 첫 규칙이 1/6(0.1666...)이 된다. 단 연결 단위 분배이므로 연결이 충분히 많아야 통계적으로 균등하다. → 코어 2 (2.2)

   </details>

5. `KUBE-SEP`의 첫 규칙(`KUBE-MARK-MASQ`)과 `KUBE-POSTROUTING`의 `0x4000`은 무슨 일을 하는가?

   <details markdown="1"><summary>답 확인</summary>

   Pod가 자기가 속한 Service를 호출해 자기 자신에게 돌아오는 헤어핀에서 SNAT가 없으면 응답 출발지가 Pod 자신이라 커널이 응답으로 인식하지 못하므로, 표시를 남겨 두었다가 `KUBE-POSTROUTING`이 `0x4000` 마크가 있는 패킷만 MASQUERADE한다. 노드를 건너가는 트래픽에도 같은 마크가 붙어 `externalTrafficPolicy: Cluster`의 클라이언트 IP 소실이 일어난다. → 코어 2 (2.3)

   </details>

6. kube-proxy의 규칙 갱신 방식과 그 비용은?

   <details markdown="1"><summary>답 확인</summary>

   변경 감지 시 메모리에서 전체 `KUBE-*` 규칙을 다시 구성해 `iptables-restore --noflush`로 원자적 전체 교체한다. 반쪽 상태가 노출되지 않는 대신 Service가 많을수록 만들고 적재하는 시간이 커지며 `kubeproxy_sync_proxy_rules_duration_seconds`로 측정된다. → 코어 2 (2.5), 코어 3 (3.2)

   </details>

7. IPVS 모드에서 `kube-ipvs0`와 ipset은 무슨 역할이며 NOARP/strict ARP는 왜 필요한가?

   <details markdown="1"><summary>답 확인</summary>

   `kube-ipvs0`는 모든 ClusterIP를 로컬 주소로 바인딩해 그 IP로 온 패킷이 로컬로 라우팅되게 하는 더미 인터페이스이고, ipset은 SNAT 등 부가 기능의 iptables 규칙을 Service마다 체인으로 만들지 않고 한 줄(`KUBE-CLUSTER-IP` 집합 매칭)로 줄여 준다. 모든 노드가 같은 ClusterIP를 바인딩하므로 ARP에 응답하면 소유 충돌(특히 MetalLB L2)이 생겨 `arp_ignore`/`arp_announce` 조정으로 응답하지 않게 한다. → 코어 3 (3.1)

   </details>

8. iptables와 IPVS의 조회 복잡도·알고리즘 차이와, IPVS의 현재 상태는?

   <details markdown="1"><summary>답 확인</summary>

   iptables는 선형 O(n)에 확률 랜덤 하나뿐이고, IPVS는 해시 O(1)에 rr/lc/dh/sh/wrr 등을 지원한다. 그러나 IPVS는 부가 기능이 여전히 iptables+ipset에 의존해 KEP-5495로 단계적 폐기가 결정되었고(원천 기준 v1.43 코드 제거 예정), 신규 채택은 권장되지 않는다. → 코어 3 (3.2, 3.3)

   </details>

9. nftables 모드가 iptables와 다른 점, 그리고 GA인데 기본값이 아닌 이유는?

   <details markdown="1"><summary>답 확인</summary>

   Service별 체인 순회 대신 집합/맵(verdict map 조회)이라는 자료구조를 써서 원소 하나 단위로 증분 갱신할 수 있고 룰셋 크기도 훨씬 작다. 같은 netfilter 프레임워크 위의 더 효율적인 규칙 언어다. GA는 안정적으로 쓸 수 있다는 뜻이지 기본값 전환이 아니므로 호환성 때문에 기본값은 여전히 iptables인 클러스터가 많고 `mode: nftables`를 명시해야 한다. → 코어 3 (3.3)

   </details>

### 3. 기억 고리

- **C++ 유추:** kube-proxy ≈ 라우팅 테이블(해시맵/벡터)을 갱신하는 관리 스레드이고, 실제 패킷 전달은 데이터 스레드(커널)가 한다. iptables ≈ `vector` 선형 순회, IPVS/nftables 맵 ≈ `unordered_map` 조회. ⚠️ 깨지는 곳: 관리자는 규칙 소유자일 뿐 패킷을 한 번도 만지지 않고, iptables는 규칙 하나가 바뀌어도 전체를 새로 구성해 통째로 교체한다.
- **비유:** kube-proxy = 안내판을 새로 그려 거는 관리인, 커널 = 안내판대로 사람들을 안내하는 경비 시스템. 관리인이 퇴근(kube-proxy 크래시)해도 걸린 안내판은 그대로 작동한다. ⚠️ 비유가 깨지는 지점: 안내판(규칙표)은 노드마다 각각 있고, iptables는 안내판을 한 장씩 고치는 대신 전부 새로 인쇄해 교체한다. 그래서 건물(Service 수)이 커질수록 교체 시간이 늘어난다.
- **묶음(3의 법칙):** 3단계(watch → 규칙 갱신 → 커널 처리), 체인 3층(SERVICES → SVC → SEP), 모드 3(iptables·IPVS·nftables) + eBPF는 계열이 다른 대안.
- **대칭·순서:** 요청(DNAT, 첫 패킷만) ↔ 응답(conntrack 역변환). iptables(선형 O(n)·전체 교체) ↔ IPVS/nftables(해시·맵 O(1)·증분 갱신). `1/3 → 1/2 → 무조건`.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Service의 ClusterIP로 보낸 패킷이 Pod IP로 바뀌는 과정, 그리고 응답이 돌아오는 과정"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "kube-proxy가 중계 서버(recv/send)가 아니라는 점과, 그래서 죽어도 기존 연결이 안 끊기는 이유"를 소켓 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "Service가 많으니 IPVS가 정답이다(해시 O(1))" vs B "IPVS는 폐기 경로이니 nftables/eBPF로 가야 한다" — 양쪽을 번갈아 변호해 보세요. (원천 두 곳의 서술 차이와 클러스터 버전을 근거로)
- **AI 역할 반전:** "내가 iptables 체인 구조와 확률 분배를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 3개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/15-kube-proxy-데이터플레인-해부.md (15.1 iptables 모드 체인 상세, 15.2 IPVS 모드 내부, 15.3 두 모드 비교, 15.4 nftables 모드, 15.5 kube-proxy 없는 클러스터 예고, 15.6 데이터플레인 문제 진단); Kubernetes_Internals_Network_Guide/01-내부-아키텍처/06-kubelet-런타임-kube-proxy-개요.md (6.5 kube-proxy 개요); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/09-서비스와-클러스터-네트워킹-기초.md (9.5 kube-proxy, iptables·IPVS 모드); kubernetes-textbook-main/05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md (23.4 kube-proxy iptables 해부, 23.5 iptables 규칙 폭증·conntrack 고갈)*
