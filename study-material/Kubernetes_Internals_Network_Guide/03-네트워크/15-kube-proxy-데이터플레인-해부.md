---
title: "15장. kube-proxy 데이터플레인 해부"
---

# 15장. kube-proxy 데이터플레인 해부

> **학습목표**
> - iptables 모드의 체인 계층(`KUBE-SERVICES → KUBE-SVC-* → KUBE-SEP-*`)과 확률 기반 분배의 수학적 원리를 설명할 수 있다.
> - IPVS 모드가 `kube-ipvs0` 더미 인터페이스와 커널 IPVS 가상 서버로 어떻게 동작하는지 설명할 수 있다.
> - iptables와 IPVS의 알고리즘적 성능 차이(O(n) 대 O(1))와 그것이 대규모 클러스터에 미치는 실무적 함의를 비교할 수 있다.
> - nftables 모드가 iptables의 어떤 구조적 한계를 해결하는지 설명할 수 있다.
> - eBPF 기반으로 kube-proxy 자체를 걷어내는 접근이 근본적으로 무엇을 바꾸는지 개괄적으로 안다.
> - 실제 클러스터에서 iptables/IPVS 규칙을 직접 읽어 로드밸런싱 확률과 스케줄링 정책을 검증할 수 있다.

---

## 들어가며

6장에서 kube-proxy를 "서비스 트래픽을 어떻게든 Pod로 보내는 노드 쪽 삼각편대의 한 축"이라고만 소개하고, 상세는 이 장으로 미뤘다. 14장에서는 그 "어떻게든"의 **재료**를 봤다 — Service는 가상 좌표를 정의하고, EndpointSlice는 그 좌표가 가리켜야 할 실제 Pod IP 목록을 담는다. kube-proxy가 하는 일은 정확히 이것이다: **EndpointSlice의 내용을 노드 커널이 이해하는 규칙으로 번역한다.**

kube-proxy는 각 노드에서 DaemonSet으로 돈다.

```
① API 서버를 watch — Service와 EndpointSlice 변경 감지 (5장의 Informer 패턴 그대로)
② 노드의 데이터플레인(iptables / IPVS / nftables) 규칙 갱신
③ 실제 패킷 처리는 커널이 한다 — kube-proxy는 데이터 경로에 없다
```

**이 3단계 구조가 이 장 전체를 관통하는 핵심이다.** kube-proxy 프로세스가 죽어도 이미 프로그래밍된 규칙은 커널에 남아 있으므로 기존 연결은 끊기지 않는다. 다만 그 이후의 Service/EndpointSlice 변경은 반영되지 않는다. 13장에서 CNI가 **노드 간에 패킷을 옮기는 방법**을 결정했다면, kube-proxy는 **그 패킷이 노드에 도착한 뒤 어떤 목적지로 바뀔지**를 결정하는 층이다. 이 장에서는 그 번역이 실제로 어떤 커널 자료구조로 구현되는지 끝까지 따라간다.

## 15.1 iptables 모드 체인 상세

### 체인 계층 구조

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

`KUBE-SERVICES`는 모든 ClusterIP/NodePort 트래픽의 단일 진입점이다. 여기서 목적지 IP:포트로 매칭해 해당 Service 전용 체인(`KUBE-SVC-*`)으로 점프하고, 그 체인 안에서 **어느 엔드포인트로 보낼지** 확률적으로 결정한 뒤, 최종적으로 엔드포인트 전용 체인(`KUBE-SEP-*`)에서 실제 DNAT가 일어난다.

### 실제 규칙 읽기

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

### 확률 계산의 수학

`statistic` 모듈의 `random` 모드는 **각 규칙을 독립적으로, 위에서부터 순서대로 평가**한다. 이미 이전 규칙에서 매칭되지 않고 "통과해 내려온" 패킷만 다음 규칙의 확률 계산에 들어간다는 점이 핵심이다.

```
엔드포인트가 N개일 때, i번째(1부터 시작) 규칙에 적힌 확률 p_i는:

    p_i = 1 / (N - i + 1)     (마지막 규칙은 확률 없이 무조건 매칭)

N=3일 때:
  1번째: p_1 = 1/3 = 0.3333...   → 전체 패킷의 33.33%가 여기서 걸림
  2번째: p_2 = 1/2 = 0.5         → 남은 66.67% 중 절반, 즉 전체의 33.33%
  3번째: 무조건(마지막)           → 나머지 전체의 33.33%
```

검증: 1번째에서 안 걸릴 확률은 `1 - 1/3 = 2/3`. 그 상태에서 2번째가 걸릴 확률은 `2/3 × 1/2 = 1/3`. 3번째는 나머지 `2/3 × 1/2 = 1/3`. **결과적으로 세 엔드포인트 모두 정확히 1/3씩 균등하게 트래픽을 받는다.** 엔드포인트가 5개면 확률은 순서대로 `1/5, 1/4, 1/3, 1/2, (마지막 무조건)`이 되고, 매번 이 공식이 성립한다.

**주의할 점**: 이것은 연결(connection) 단위 확률 분배다. 매 패킷마다 다시 굴리는 것이 아니라 커널의 conntrack이 최초 SYN 패킷에서 결정한 목적지를 그 연결이 끝날 때까지 유지한다(그렇지 않으면 같은 TCP 스트림의 패킷이 서로 다른 백엔드로 흩어지는 재앙이 벌어진다). 그래서 **연결 수가 충분히 많을 때만** 확률이 통계적으로 균등 분배로 수렴한다. 커넥션이 소수이고 오래 유지되는 워크로드(gRPC 스트리밍 등)에서는 14.1절에서 다룬 헤드리스 서비스 + 클라이언트 사이드 로드밸런싱이 필요한 이유가 여기서도 드러난다.

### 엔드포인트 체인 — 실제 DNAT와 헤어핀 처리

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-SEP-AAAAAAAAAAAAAA
```
```
-A KUBE-SEP-AAAAAAAAAAAAAA -s 10.244.1.3/32 -j KUBE-MARK-MASQ
-A KUBE-SEP-AAAAAAAAAAAAAA -p tcp -m tcp -j DNAT --to-destination 10.244.1.3:8080
```

첫 번째 규칙은 **헤어핀(hairpin) 대응**이다. Pod가 자기 자신이 속한 Service를 호출해 결국 자기 자신에게 되돌아오는 경우, SNAT 없이는 응답 패킷의 출발지가 여전히 Pod 자신이 되어 커널이 그 응답을 "내가 보낸 요청에 대한 응답"으로 인식하지 못하는 상황이 생긴다. `KUBE-MARK-MASQ`로 표시를 남기면 이후 `KUBE-POSTROUTING` 체인에서 이 표시를 보고 마스커레이드를 적용한다.

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-POSTROUTING
```
```
-A KUBE-POSTROUTING -m mark ! --mark 0x4000/0x4000 -j RETURN
-A KUBE-POSTROUTING -j MARK --xor-mark 0x4000
-A KUBE-POSTROUTING -j MASQUERADE --random-fully
```

이 `0x4000` 마크 메커니즘이 14.4절에서 본 `externalTrafficPolicy: Cluster`가 클라이언트 IP를 소실시키는 정확한 지점이다 — 노드를 건너가야 하는 트래픽에는 이 마크가 붙고, 그 결과 `KUBE-POSTROUTING`이 소스 주소를 노드 자신의 IP로 치환한다.

### NodePort 체인과 `--cluster-cidr`

NodePort로 들어온 트래픽은 `KUBE-SERVICES`가 아니라 별도의 `KUBE-NODEPORTS` 체인을 거친다. 목적지 IP가 특정 ClusterIP가 아니라 **노드 자신의 어떤 주소든** 지정된 포트로 오면 매칭되어야 하므로, 이 체인은 목적지 IP를 보지 않고 **포트만으로** 매칭한다.

```bash
docker exec k8s-guide-worker iptables -t nat -S KUBE-NODEPORTS
```
```
-A KUBE-NODEPORTS -p tcp -m comment --comment "default/payments" \
   -m tcp --dport 31234 -j KUBE-SVC-P2QNAX57L3TRA3TJ
```

**노드 자신의 어느 인터페이스로 들어와도** 동일한 `KUBE-SVC-*` 체인으로 연결되고, 그 이후 흐름은 ClusterIP 트래픽과 완전히 같다. NodePort는 새로운 로드밸런싱 로직이 아니라 **`KUBE-SERVICES` 대신 `KUBE-NODEPORTS`에서 같은 목적지 체인으로 들어가는 또 하나의 진입로**일 뿐이라는 14.1절의 설명이 여기서 규칙 수준으로 확인된다.

또 한 가지 실무에서 자주 놓치는 지점 — kube-proxy는 `--cluster-cidr` 플래그로 클러스터 내부 대역을 알고 있을 때만 **"이 트래픽은 클러스터 내부에서 온 것이니 SNAT하지 않아도 된다"**는 판단을 내릴 수 있다. 이 값이 없거나 잘못 설정되면 클러스터 내부 Pod 간 트래픽까지 불필요하게 마스커레이드될 수 있고, 반대로 외부에서 들어온 트래픽에 대한 처리도 꼬일 수 있다. NodePort/LoadBalancer 트래픽에서 클라이언트 IP가 예상과 다르게 사라지는 문제를 진단할 때 `--cluster-cidr` 설정값도 확인 대상에 포함해야 한다.

```bash
docker exec k8s-guide-control-plane grep cluster-cidr /var/lib/kube-proxy/config.conf 2>/dev/null \
  || kubectl get configmap kube-proxy -n kube-system -o yaml | grep -i clusterCIDR
```

### 규칙 갱신 방식 — 증분이 아니라 원자적 전체 교체

kube-proxy는 Service/EndpointSlice가 바뀔 때마다 규칙 하나씩 `iptables` 명령을 개별 실행하지 않는다. 대신 **전체 규칙 집합을 메모리에 다시 구성한 뒤, `iptables-restore`로 원자적으로 통째 교체**한다.

```
kube-proxy 내부 동작:
① watch로 Service/EndpointSlice 변경 감지 (또는 --sync-period 주기)
② 메모리에서 전체 KUBE-* 체인 규칙을 텍스트로 재구성
③ iptables-restore --noflush 로 커널에 한 번에 적재
   (--noflush: KUBE- 로 시작하지 않는 다른 규칙은 건드리지 않음)
```

이 방식 덕분에 갱신 도중 "일부 규칙만 반영된 어중간한 상태"가 노출되지 않는다(원자성). 대신 **Service 개수가 많아질수록 이 텍스트를 만들고 커널에 적재하는 데 걸리는 시간이 늘어난다** — 이것이 15.3절에서 다룰 iptables 모드의 근본적 한계로 이어진다.

```bash
kubectl get --raw /metrics 2>/dev/null | grep kubeproxy_sync_proxy_rules_duration
```

### DNAT와 conntrack — 되돌아오는 패킷은 어떻게 되는가

지금까지 본 규칙은 전부 **요청이 나가는 방향(목적지를 바꾸는 DNAT)** 만 설명한다. 그런데 응답 패킷은 어떻게 원래 클라이언트에게 돌아갈까? `iptables`가 매 패킷마다 역방향 규칙을 또 평가하는 것이 아니다. 리눅스 커널의 **연결 추적(conntrack)** 이 이 일을 한다.

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

**핵심은 DNAT 규칙이 최초 패킷(연결의 첫 패킷)에만 적용되고, 이후 같은 흐름의 나머지 패킷과 응답 방향은 모두 conntrack 테이블을 참조해 처리된다는 점이다.** 15.1절에서 "확률 기반 분배가 연결 단위로 유지된다"고 한 것도 이 conntrack 매핑 덕분이다 — 같은 TCP 연결의 패킷들이 매번 다른 확률 굴림을 거치지 않고 최초에 결정된 목적지로 일관되게 전달된다.

```bash
docker exec k8s-guide-worker conntrack -L 2>/dev/null | grep 10.96.142.88
```
```
tcp 6 431999 ESTABLISHED src=10.244.1.9 dst=10.96.142.88 sport=34567 dport=80 \
    src=10.244.1.3 dst=10.244.1.9 sport=8080 dport=34567 [ASSURED]
```

두 번째 `src=`/`dst=` 쌍이 conntrack이 기억하는 **역변환 정보**다. 이 테이블이 가득 차면(`sysctl net.netfilter.nf_conntrack_max`) 새 연결이 거부되기 시작하며, 대량의 짧은 연결을 만드는 워크로드에서 흔히 겪는 장애 원인이다. 16.3절에서 다룰 DNS의 UDP conntrack 경쟁 조건도 근본적으로 같은 메커니즘 위에서 벌어지는 문제다.

## 15.2 IPVS 모드 내부

### 더미 인터페이스와 가상 서버

IPVS(IP Virtual Server)는 리눅스 커널에 오래전부터 존재하던 **범용 L4 로드밸런서**(LVS 프로젝트의 산물)다. kube-proxy는 이것을 서비스 프록시로 재활용한다.

```
① kube-ipvs0 이라는 더미(dummy) 네트워크 인터페이스를 노드에 생성
② 모든 Service의 ClusterIP를 이 인터페이스에 로컬 주소로 바인딩
     (이 IP로 온 패킷이 로컬로 라우팅되게 하기 위함 — "가짜 존재"를 만드는 트릭)
③ IPVS 커널 모듈에 Service마다 가상 서버(Virtual Server) 등록
④ 각 엔드포인트를 그 가상 서버의 실제 서버(Real Server)로 등록
```

```bash
docker exec k8s-guide-worker ip addr show kube-ipvs0
```
```
4: kube-ipvs0: <BROADCAST,NOARP> mtu 1500 ...
    inet 10.96.142.88/32 scope global kube-ipvs0
    inet 10.96.0.1/32 scope global kube-ipvs0
    ...
```

```bash
docker exec k8s-guide-worker ipvsadm -Ln
```
```
IP Virtual Server version 1.2.1 (size=4096)
Prot LocalAddress:Port Scheduler Flags
  -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
TCP  10.96.142.88:80 rr
  -> 10.244.1.3:8080              Masq    1      0          0
  -> 10.244.2.4:8080              Masq    1      0          0
  -> 10.244.1.5:8080              Masq    1      0          0
```

**"가상 서버(Virtual Server) + 실제 서버(Real Server) 목록"** 이라는 이 구조 자체가 IPVS의 검색 방식을 규정한다 — 패킷의 목적지 IP:포트로 **해시 테이블을 직접 조회**해 가상 서버를 찾고, 그 안의 실제 서버 목록에서 스케줄러 알고리즘에 따라 하나를 고른다. Service가 몇 개든 이 조회는 해시 하나로 끝난다.

### 스케줄링 알고리즘

`--ipvs-scheduler` 플래그(기본값 `rr`)로 고를 수 있다.

| 알고리즘 | 이름 | 동작 |
|---|---|---|
| `rr` | 라운드 로빈 | 순서대로 균등 분배 (기본값) |
| `lc` | 최소 연결(Least Connection) | 현재 활성 연결이 가장 적은 실제 서버로 |
| `dh` | 목적지 해싱(Destination Hashing) | 목적지 IP 기준 해시로 고정 — 캐시 서버 앞단에서 유용 |
| `sh` | 소스 해싱(Source Hashing) | 소스 IP 기준 해시로 고정 — 세션 고정 효과 |
| `wrr` | 가중 라운드 로빈 | 실제 서버별 가중치 반영 |

iptables 모드는 **랜덤(확률) 분배 하나뿐**이지만, IPVS는 워크로드 특성에 맞춰 스케줄러를 바꿀 수 있다는 것이 실질적인 차이다. 예를 들어 백엔드마다 처리 능력이 다르다면 `wrr`로 가중치를 부여할 수 있고, 캐시 히트율을 높이고 싶다면 `dh`/`sh`로 특정 키를 특정 백엔드에 고정할 수 있다.

### strict ARP — kube-ipvs0가 일으키는 부작용 방지

`kube-ipvs0`에 모든 ClusterIP를 바인딩한다는 것은, 이 노드가 **자신이 그 IP들의 소유자라고 ARP로 응답할 수도 있다**는 뜻이다. 여러 노드가 각자 `kube-ipvs0`에 같은 ClusterIP들을 동일하게 바인딩하고 있으므로, 이것이 그대로 ARP에 노출되면 "누가 이 IP의 진짜 소유자인가"를 두고 노드 간에 충돌이 생길 수 있다. 특히 MetalLB처럼 L2 모드로 외부 IP를 ARP 광고하는 컴포넌트와 얽히면 문제가 커진다.

이를 막기 위해 kube-proxy는 IPVS 모드로 전환될 때 커널의 ARP 파라미터를 조정해 **`kube-ipvs0`가 ARP 요청에 응답하지 않도록(NOARP)** 만든다.

```bash
docker exec k8s-guide-worker sysctl net.ipv4.conf.all.arp_ignore net.ipv4.conf.all.arp_announce
```
```
net.ipv4.conf.all.arp_ignore = 1
net.ipv4.conf.all.arp_announce = 2
```

`ip addr show kube-ipvs0`의 출력에 있던 `<BROADCAST,NOARP>` 플래그가 바로 이 설정의 결과다. IPVS 모드로 전환한 뒤 외부 IP 광고(MetalLB 등)가 예상과 다르게 동작한다면 이 `strictARP` 관련 설정이 의도대로 적용됐는지부터 확인한다.

### IPVS 모드에서도 iptables가 완전히 사라지지 않는다

IPVS는 L4 로드밸런싱만 한다. SNAT/마스커레이드, NodePort 처리, 헤어핀 대응 같은 부가 기능은 여전히 iptables 규칙으로 구현된다. 다만 **Service마다 체인을 만드는 대신 `ipset`(IP 집합 자료구조)을 활용**해 규칙 수를 극적으로 줄인다.

```bash
docker exec k8s-guide-worker ipset list -n | grep KUBE
```
```
KUBE-CLUSTER-IP
KUBE-LOOP-BACK
KUBE-NODE-PORT-TCP
KUBE-EXTERNAL-IP
```

```bash
docker exec k8s-guide-worker iptables -t nat -S | grep KUBE-CLUSTER-IP
```
```
-A KUBE-SERVICES -m set --match-set KUBE-CLUSTER-IP dst,dst -j KUBE-MARK-MASQ
```

**Service가 1개든 5,000개든 이 iptables 규칙은 단 한 줄이다.** "이 IP가 `KUBE-CLUSTER-IP`라는 집합에 속하는가"라는 판단 자체를 커널의 `ipset` 자료구조(해시 기반)에 위임했기 때문이다. iptables 모드가 Service마다 체인을 하나씩 만드는 것과 근본적으로 다른 접근이다.

### IPVS 모드의 향후 — 공식 폐기(deprecation) 경로

여기까지 설명한 구조는 여전히 유효하지만, 쿠버네티스 프로젝트는 **KEP-5495**로 IPVS 모드를 단계적으로 폐기하기로 결정했다. 이유는 이 절에서 이미 확인한 바로 그 한계다 — 앞서 본 것처럼 IPVS 모드에서도 SNAT·NodePort 같은 부가 기능은 여전히 iptables(+ipset)에 의존해야 했고, 커널 IPVS API만으로는 쿠버네티스 Service 모델을 완전히 구현할 수 없어 이 이중 구조를 계속 유지보수할 실익이 크지 않다는 것이 핵심 사유다. 일정은 다음과 같다.

| 버전 | 변화 |
|---|---|
| v1.35 | 문서에 폐기 예고 반영, kube-proxy가 IPVS 모드로 시작 시 경고 로그 출력 |
| v1.37 (현재) | `KubeProxyIPVS` 기능 게이트 도입(기본 활성화), 마이그레이션 가이드 공개 |
| v1.40 | 기능 게이트 기본값이 비활성으로 전환 — IPVS를 쓰려면 게이트를 명시적으로 다시 켜야 함 |
| v1.43 | IPVS 코드 자체가 트리에서 제거 |

즉 이미 IPVS를 쓰고 있는 클러스터도 **nftables(또는 iptables) 모드로의 전환을 지금부터 계획하는 것이 권장**되고, 신규 클러스터라면 이 시점 이후로 IPVS를 새로 채택할 이유는 사실상 없다. 다만 이 절에서 다룬 해시 기반 조회·가상 서버 구조·strict ARP 같은 개념은 IPVS가 완전히 제거되기 전까지 실무에서 여전히 마주칠 수 있고, nftables가 왜 그 대안으로 선택됐는지(15.4절)를 이해하는 데도 유용하므로 그대로 다룬다.

## 15.3 두 모드 비교

| | iptables | IPVS |
|---|---|---|
| 조회 방식 | **선형 순회(O(n))** — 체인을 순서대로 평가 | **해시 테이블 조회(O(1))** |
| Service 수 증가 시 | 규칙 수와 평가 시간이 비례해 증가 | 조회 비용이 거의 일정 |
| 로드밸런싱 알고리즘 | 확률 기반 랜덤 하나뿐 | rr/lc/dh/sh/wrr 등 다양 |
| 갱신 방식 | 전체 규칙셋 재구성 후 `iptables-restore` | 가상/실제 서버 단위로 증분 갱신 가능 |
| 커널 요구사항 | 기본 내장 | `ip_vs*` 커널 모듈 로드 필요 |
| 부가 기능(SNAT 등) 구현 | iptables 규칙 | iptables + ipset 조합 (완전히 벗어나지는 않음) |

### 왜 iptables가 대규모에서 느려지는가

`KUBE-SVC-*` 체인 하나를 평가하는 비용 자체는 작다. 문제는 **Service 수가 늘면 `KUBE-SERVICES` 체인의 길이도 늘고, 그 체인을 순서대로 훑어야 목적지 규칙에 도달**한다는 점이다. Service가 수천 개면 매 패킷(정확히는 매 신규 연결의 첫 패킷)마다 수천 개 규칙을 순차 비교해야 할 수 있다. 게다가 **하나라도 바뀌면 전체 규칙셋을 다시 만들어 통째로 교체**하므로, Service 개수가 커질수록 `kubeproxy_sync_proxy_rules_duration_seconds`로 측정되는 갱신 지연도 함께 늘어난다.

IPVS는 두 문제 모두에서 자유롭다. 조회는 해시이므로 Service 수와 무관하게 거의 일정하고, 가상 서버·실제 서버 등록/삭제는 전체를 다시 만들지 않고 **개별 항목 단위로 증분 갱신**할 수 있다.

### 오늘날의 기본값

kube-proxy의 프록시 모드는 `kube-proxy` ConfigMap의 `mode` 필드(`iptables` / `ipvs` / `nftables`)로 결정된다. **역사적으로 iptables가 가장 오래되고 보편적인 기본값**이었고, IPVS는 대규모 클러스터를 위한 대안으로 나중에 추가됐다. 15.4절에서 다룰 nftables 모드는 이미 **GA(정식) 상태**이지만, 호환성 때문에 **기존 클러스터·배포판의 기본값은 여전히 iptables인 경우가 많다** — GA 승격과 "기본값 전환"은 별개의 단계라는 점에 유의한다. 어떤 모드가 실제로 쓰이고 있는지는 클러스터마다 다를 수 있으므로, 확신 없이 가정하지 말고 항상 직접 확인한다.

```bash
kubectl get configmap kube-proxy -n kube-system -o yaml | grep "mode:"
```

**언제 nftables로 전환을 검토하는가**: Service가 수백~수천 개 규모이거나, 갱신 지연이 체감될 정도로 잦을 때. 그 이하 규모에서는 iptables로도 체감 성능 차이가 크지 않다. 과거에는 이 자리에서 IPVS도 함께 대안으로 꼽혔지만, 앞의 15.2절 말미에서 보듯 IPVS 모드는 공식 폐기 경로에 들어섰으므로 **신규로 IPVS를 채택할 이유는 이제 사실상 없다.**

## 15.4 nftables 모드

### iptables는 왜 대체되는가

리눅스 커널의 netfilter 프로젝트 자체가 **iptables를 유지보수 모드로 취급**한 지 오래다. 최신 배포판의 `iptables` 명령은 사실 내부적으로 `nft`(nftables) 규칙으로 번역해 적재하는 호환 계층(`iptables-nft`)을 통해 동작하는 경우가 많다. kube-proxy도 이 흐름을 따라 **nftables를 직접 사용하는 새로운 프록시 모드**를 도입했다(알파로 시작해 베타를 거쳐 이미 **GA(정식)** 상태에 이르렀다). 다만 GA는 "안정적으로 선택해 쓸 수 있다"는 뜻이지 "이제부터 기본값이다"라는 뜻은 아니다 — 15.3절에서 본 것처럼 **호환성 때문에 기본값은 여전히 iptables인 클러스터가 많고**, nftables를 쓰려면 `mode: nftables`를 명시적으로 지정해야 한다. 15.2절 말미에서 본 IPVS 모드의 공식 폐기 결정과 맞물려, nftables는 이제 iptables·IPVS를 잇는 유력한 후속 모드로 자리잡고 있다.

### 셋/맵이 만드는 근본적 차이

iptables 모드가 Service마다 체인을 만들고 그 체인을 순서대로 평가하는 구조라면, nftables는 **집합(set)과 사상(map)** 이라는 1급 자료구조를 규칙 언어 차원에서 제공한다.

```
iptables 모드의 개념적 구조:
  KUBE-SERVICES 체인 (순회) → Service별 체인 (순회) → 확률 규칙 (순회) → DNAT

nftables 모드가 지향하는 구조:
  "목적지 IP:포트" → verdict map 조회 (해시, 단일 룩업) → 대응하는 엔드포인트 집합에서 선택 → DNAT
```

**맵은 원소를 개별적으로 추가/삭제할 수 있다.** iptables처럼 전체 체인을 다시 텍스트로 만들어 통째로 교체할 필요 없이, 엔드포인트 하나가 바뀌면 그 맵의 원소 하나만 갱신하면 된다. 이는 15.1절에서 본 "규칙 하나 바뀌어도 전체 재구성"이라는 iptables의 구조적 비용을 근본적으로 없앤다. 결과적으로 **규칙(정확히는 룰셋을 구성하는 오브젝트) 수가 훨씬 적고, 갱신도 더 빠르고 가볍다.**

```bash
# nftables 모드일 때 (환경에 따라 명령/패키지가 다를 수 있다)
nft list table ip kube-proxy
```

nftables 모드는 여전히 커널 netfilter 훅(PREROUTING/OUTPUT) 위에서 동작한다는 점에서 iptables·IPVS와 같은 계열이다 — **완전히 다른 데이터플레인이 아니라, 같은 netfilter 프레임워크를 더 표현력 있고 효율적인 규칙 언어로 사용하는 것**이라고 이해하면 된다. 이 점에서 다음 절의 eBPF 접근과는 근본적으로 다르다.

## 15.5 kube-proxy 없는 클러스터 예고

지금까지 다룬 세 모드는 모두 **netfilter/커널 패킷 필터링 프레임워크 위에서 DNAT를 수행**한다는 공통점이 있다. Cilium은 이 전제 자체를 버린다. eBPF 프로그램을 소켓 계층(`connect()`/`sendmsg()` 호출 시점)이나 tc/XDP 계층에 부착해, **패킷이 netfilter를 거치기도 전에, 혹은 아예 소켓이 목적지를 결정하는 그 순간에** 실제 백엔드 주소로 바꿔치기한다. DNAT라는 개념 자체가 필요 없어지는 경로도 있다는 뜻이다. 이것이 무엇을 가능하게 하고 어떤 관측성을 제공하는지는 19장에서 Cilium의 eBPF 데이터플레인을 다룰 때 깊이 들어간다.

## 15.6 데이터플레인 문제 진단

Service를 통한 접근이 안 될 때, 14.1절에서 다룬 오브젝트 모델(Service·EndpointSlice)이 정상인데도 실패한다면 문제는 이 장에서 다룬 **데이터플레인 층**에 있다.

| 증상 | 유력 원인 | 확인 |
|---|---|---|
| EndpointSlice는 정상인데 ClusterIP로 접근 안 됨 | kube-proxy 자체가 죽었거나 규칙 동기화 실패 | `kubectl logs -n kube-system <kube-proxy Pod>`, `kubeproxy_sync_proxy_rules_duration_seconds` |
| 일부 노드에서만 특정 Service 접근 안 됨 | 그 노드의 kube-proxy만 비정상, 또는 규칙 동기화가 밀림 | 해당 노드의 kube-proxy Pod 상태, `iptables -t nat -S \| grep <서비스>`를 노드별로 비교 |
| Service 변경(스케일 등) 후 반영이 눈에 띄게 느림 | Service 수가 많은 iptables 모드의 O(n) 동기화 비용 | `kubeproxy_sync_proxy_rules_duration_seconds`, `iptables -t nat -S \| wc -l` |
| IPVS 모드인데 `ipvsadm -Ln`에 가상 서버가 안 보임 | `ip_vs` 커널 모듈 미로드, kube-proxy 설정이 여전히 iptables 모드 | `lsmod \| grep ip_vs`, kube-proxy ConfigMap의 `mode` 값 |
| MetalLB(L2 모드)의 IP 광고가 IPVS 도입 후 꼬임 | strict ARP 미설정 또는 충돌 | `sysctl net.ipv4.conf.all.arp_ignore/arp_announce` |
| 특정 클라이언트만 항상 같은 백엔드로 감 | `sessionAffinity: ClientIP` 설정, 혹은 IPVS `sh`/`dh` 스케줄러 | Service의 `sessionAffinity` 필드, `--ipvs-scheduler` 값 |
| 커넥션은 열리는데 응답이 없음(한쪽만 성공) | conntrack 관련 문제, 또는 노드 간 라우팅(13장) 결합 문제 | `conntrack -L`, 양쪽 노드 tcpdump |

**핵심 판별 기준은 항상 "오브젝트 모델(14장)까지는 정상인가"다.** EndpointSlice에 올바른 Pod IP가 들어 있는데도 트래픽이 그 Pod에 도달하지 못한다면, 문제는 거의 확실히 이 장에서 다룬 **커널 규칙 생성·적용 단계**에 있다.

## 실습: 실제 로드밸런싱 규칙 확인하기

**① 3개 레플리카 Service 준비**

```bash
kubectl create deployment kp-demo --image=hashicorp/http-echo:1.0 --replicas=3 \
  -- /http-echo -text=hello -listen=:5678
kubectl expose deployment kp-demo --port=80 --target-port=5678
kubectl rollout status deployment/kp-demo
```

**② 현재 kube-proxy 모드 확인**

```bash
kubectl get configmap kube-proxy -n kube-system -o yaml | grep "mode:"
```

**③ iptables 모드라면 — 확률 규칙 직접 읽기**

```bash
SVC_IP=$(kubectl get svc kp-demo -o jsonpath='{.spec.clusterIP}')
docker exec k8s-guide-worker iptables -t nat -S KUBE-SERVICES | grep $SVC_IP
```

여기서 얻은 `KUBE-SVC-*` 이름으로 계속 따라 들어간다.

```bash
docker exec k8s-guide-worker iptables -t nat -nL KUBE-SVC-<위에서 얻은 해시> -v
```

세 규칙의 확률(`0.333`, `0.5`, 마지막은 무조건)을 15.1절의 공식과 대조해 검증한다. 그 다음 각 `KUBE-SEP-*` 체인까지 따라 들어가 최종 DNAT 대상이 실제 Pod IP와 일치하는지 확인한다.

**④ IPVS 모드라면 — 가상 서버 테이블 직접 읽기**

```bash
docker exec k8s-guide-worker ipvsadm -Ln
```

`kind` 노드는 컨테이너이므로 `ip_vs` 커널 모듈은 **호스트 커널**의 것을 공유한다. `ipvsadm -Ln`이 비어 있거나 명령 자체가 없다면, 호스트에서 `lsmod | grep ip_vs`로 모듈이 로드되어 있는지 먼저 확인하고, 필요하면 호스트에서 `sudo modprobe ip_vs ip_vs_rr ip_vs_wrr ip_vs_sh`를 실행한 뒤 kube-proxy를 IPVS 모드로 전환한다(`kubectl edit configmap kube-proxy -n kube-system`에서 `mode: "ipvs"`로 변경 후 kube-proxy Pod 재시작).

**⑤ 레플리카 수를 바꿔가며 규칙 변화 관찰**

```bash
docker exec k8s-guide-worker iptables -t nat -S | grep -c KUBE-SEP
kubectl scale deployment kp-demo --replicas=6
sleep 5
docker exec k8s-guide-worker iptables -t nat -S | grep -c KUBE-SEP
```

**확률 값도 함께 바뀐다.** 3개일 때 `0.333`이던 첫 규칙이 6개일 때는 `0.1666...`(=1/6)이 되는 것을 확인한다.

**⑥ 정리**

```bash
kubectl delete deployment kp-demo
kubectl delete svc kp-demo
```

---

## 실습 과제

**과제 1 — 체인을 끝까지 따라가 그림 그리기**
엔드포인트가 4개인 Service를 만들고 `KUBE-SERVICES`부터 최종 `DNAT`까지 모든 체인 이름과 확률 값을 손으로 받아 적어 다이어그램으로 그린다. `1/(N-i+1)` 공식으로 각 확률을 미리 계산해 보고 실제 규칙과 일치하는지 검증한다.

**과제 2 — 확률 분배의 통계적 검증**
`statistic --mode random`이 실제로 균등 분배를 만드는지, 같은 Service에 100번 이상 연속 요청을 보내고 응답한 Pod 이름의 분포를 집계해 확인한다. 요청 수가 적을 때와 많을 때 분산이 어떻게 달라지는지 비교한다.

**과제 3 — IPVS 스케줄러 비교**
`--ipvs-scheduler`를 `rr`에서 `lc`로 바꾸고, 백엔드 중 하나에 인위적으로 느린 응답(예: 지연을 발생시키는 핸들러)을 심어 연결 수가 어떻게 재분배되는지 `ipvsadm -Ln`의 `ActiveConn` 값으로 관찰한다.

**과제 4 — 규칙 수와 동기화 시간 비교**
Service를 50개까지 늘려가며 `iptables -t nat -S | wc -l`의 증가 추이와 `kubeproxy_sync_proxy_rules_duration_seconds` 메트릭의 변화를 함께 기록한다. IPVS 모드로 전환한 뒤 같은 실험을 반복해 두 모드의 차이를 정량적으로 비교한다.

**과제 5 — nftables 모드 탐색(선택)**
kube-proxy를 nftables 모드로 전환할 수 있는 환경이라면(커널·kube-proxy 버전 요구사항 확인 필요), `nft list ruleset`으로 Service가 맵(map) 형태로 표현되는 것을 확인하고, 엔드포인트를 하나 추가했을 때 iptables 모드처럼 전체가 재구성되는지, 아니면 맵 원소 하나만 갱신되는지 비교해 본다.

---

## 요약

- kube-proxy는 **Service/EndpointSlice를 watch해 노드 커널의 데이터플레인 규칙으로 번역**할 뿐, 패킷 처리 자체는 커널이 담당한다. kube-proxy가 죽어도 기존 연결은 유지된다.
- **iptables 모드**는 `KUBE-SERVICES → KUBE-SVC-* → KUBE-SEP-*` 체인을 순차 평가하며, `statistic --mode random`으로 **i번째 엔드포인트에 `1/(N-i+1)`의 확률**을 부여해 결과적으로 균등 분배를 만든다. 규칙 갱신은 증분이 아니라 **전체를 다시 구성해 `iptables-restore`로 원자적 교체**한다.
- **IPVS 모드**는 `kube-ipvs0` 더미 인터페이스에 모든 ClusterIP를 바인딩하고, 커널 IPVS의 **해시 기반 가상 서버/실제 서버 테이블**로 O(1) 조회를 실현한다. `rr`/`lc`/`dh`/`sh`/`wrr` 등 다양한 스케줄러를 고를 수 있지만, SNAT 등 부가 기능은 여전히 iptables+ipset 조합에 의존한다.
- **iptables는 Service 수에 비례해 조회·갱신 비용이 늘어나는 O(n) 구조**이고, **IPVS는 그 비용이 거의 일정한 O(1) 구조**다. Service가 많고 갱신이 잦은 대규모 클러스터일수록 이 차이가 체감된다. 다만 **IPVS 모드는 KEP-5495에 따라 공식 폐기 경로에 들어섰다**(v1.35 경고 로그 → v1.37 기능 게이트 → v1.40 기본 비활성 → v1.43 코드 제거) — 신규 도입은 피하고, 기존 IPVS 클러스터는 전환을 계획해야 한다.
- **nftables 모드**는 Service별 체인 대신 **집합/맵 자료구조로 룰셋을 표현**해, 원소 단위 증분 갱신이 가능하고 룰셋 크기도 훨씬 작다. 이미 **GA 상태**이며 IPVS를 대신할 후속 모드로 자리잡았지만, 호환성 때문에 **기본값은 여전히 iptables인 클러스터가 많다.**
- **eBPF 기반(Cilium)** 은 netfilter DNAT 자체를 우회해 소켓/tc/XDP 계층에서 목적지를 결정한다 — 데이터플레인 계열 자체가 다르다. 상세는 19장.

**다음 장에서는** 지금까지 IP 주소로만 다룬 Service에 사람이 읽을 수 있는 이름을 붙이는 CoreDNS와, 그 이름 해석 과정에서 실제로 발생하는 성능·장애 문제를 다룬다.
