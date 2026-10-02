---
title: "5장. netfilter·iptables·NAT·conntrack"
parent: "1부. 리눅스 네트워크 기초"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 5
---

# 5장. netfilter·iptables·NAT·conntrack

> **🎮 게임 서버 개발자에게** — 게임 서버 코드는 `accept()`로 이미 완성된 연결을 받는다. 그 연결에 도착하기 전, 패킷은 커널 안에서 여러 지점을 지나며 **주소가 바뀌고, 막히고, 기록된다.** 컨테이너와 쿠버네티스에서 "포트 게시", "Service IP", "외부로 나갈 때 출발지가 호스트 IP로 바뀐다"는 말은 전부 이 커널 구간의 규칙 목록이 하는 일이다. 결정적으로 다른 점은 **내 프로세스는 그 변환을 전혀 모른다**는 것이다. 서버는 그냥 `listen`/`accept`했을 뿐인데 패킷의 목적지는 이미 바뀌어 도착했고, 응답의 주소는 내가 아니라 커널이 되돌려 놓는다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - `-p 8080:80`이나 Service의 ClusterIP가 "어디서 어떻게" 목적지를 바꾸는지 `iptables` 출력으로 읽어야 하는 장애 분석.
> - 클라이언트 IP가 서버 로그에 노드 IP로 찍히는 이유(출발지 변환)를 설명해야 할 때.
> - 단기 연결이 폭주하는 노드에서 간헐적 타임아웃이 나는데 서버 CPU는 한가한 상황(conntrack 테이블 포화 의심).

## 코어 — 이것만은 100%

> **한 문장:** netfilter는 커널의 패킷 경로에 걸린 훅(PREROUTING·INPUT·FORWARD·OUTPUT·POSTROUTING)이고 iptables/nftables는 그 훅에 규칙을 거는 도구이며, 목적지를 바꾸는 DNAT는 라우팅 결정 앞(PREROUTING)에서, 출발지를 바꾸는 MASQUERADE는 나가는 길(POSTROUTING)에서 일어나고, 되돌아오는 패킷은 conntrack이 기억한 변환 정보로 자동 복원된다.

1. **패킷은 훅을 지나고, 규칙은 거기에 걸려 있다** — 훅 위치가 곧 "무엇을 할 수 있는가"를 정한다. 라우팅 결정보다 앞(PREROUTING)이면 목적지를 바꿔 경로 자체를 바꿀 수 있다.
2. **NAT는 두 방향, 시점이 대칭이다** — DNAT(목적지 변경, PREROUTING, 들어오는 길) ↔ SNAT/MASQUERADE(출발지 변경, POSTROUTING, 나가는 길). Docker `-p`와 쿠버네티스 Service는 DNAT, 컨테이너·Pod의 외부 통신은 MASQUERADE다.
3. **conntrack이 연결 단위로 기억한다** — DNAT 규칙은 연결의 첫 패킷에만 적용되고, 같은 흐름의 나머지 패킷과 응답 방향은 conntrack 테이블이 처리한다. 그래서 확률 분배도 "연결 단위"이고, 테이블이 가득 차면 새 연결이 거부된다.
4. **규칙은 순서대로 읽히고, 백엔드는 둘이다** — iptables 규칙은 위에서부터 선형 탐색이라 규칙이 폭증하면 느려진다. 요즘 `iptables` 명령은 대개 nftables 위의 호환 레이어(`iptables-nft`)이고, 같은 시스템에 legacy와 nft가 섞이면 서로의 규칙을 못 본다.

**이 장의 학습 목표**

- netfilter 훅과 iptables의 테이블·체인이 패킷 경로의 어디에 걸리는지 설명할 수 있다.
- DNAT와 MASQUERADE가 각각 어느 시점에 무엇을 바꾸는지, 왜 시점이 다른지 말할 수 있다.
- `conntrack`이 응답 패킷을 되돌리는 원리와, 테이블 고갈이 장애로 나타나는 모양을 안다.
- Docker와 kube-proxy가 만드는 규칙 체인(`DOCKER`, `KUBE-SERVICES`→`KUBE-SVC-*`→`KUBE-SEP-*`)을 읽을 수 있다.
- iptables-legacy / iptables-nft / nftables의 관계를 알고, 규칙 수가 문제가 되는 이유를 설명할 수 있다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 공유기의 포트포워딩·NAT | DNAT / MASQUERADE | 주소를 바꿔 안팎을 이어 준다 | 별도 장비가 아니라 **같은 호스트 커널**의 훅에서 일어난다. 내 프로세스는 변환을 모른다 |
| 요청 처리 파이프라인의 필터/미들웨어 체인 | netfilter 훅 + 체인의 규칙 목록 | 지나는 지점마다 조건 검사 후 동작(통과·변환·차단)을 건다 | 규칙은 위에서 아래로 **선형 탐색**이라 개수가 늘면 비용이 누적된다. 훅 위치에 따라 할 수 있는 일이 다르다 |
| 서버의 세션 테이블(연결 ID → 상태) | conntrack 테이블 | 연결 단위로 상태를 기록하고 이후 패킷은 테이블을 참조한다 | 앱이 아니라 **커널**이 기록하고, 크기에 상한이 있다. 가득 차면 새 연결이 거부된다 |
| 로드밸런서가 연결마다 백엔드를 고르는 것 | `KUBE-SVC-*`의 `statistic random` 규칙 | 연결 단위로 목적지를 정한다 | 패킷마다 다시 굴리지 않는다. 첫 패킷에서 정하고 conntrack이 유지한다. 연결 수가 충분히 많아야 균등해진다 |
| `getsockname()`의 로컬 주소 | NAT 이후 주소 | 서버가 보는 상대 주소가 무엇인지가 중요하다 | 출발지가 MASQUERADE로 바뀌면 서버는 클라이언트의 실제 IP 대신 변환된 IP를 본다 |
| 방화벽 설정(ufw 등) | iptables/nftables 규칙 | 둘 다 같은 커널 netfilter 규칙이다 | 도구마다 같은 체인 공간에 규칙을 넣어 서로 **조율 없이 겹칠 수 있다**(→ 8장·11장) |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 외부에서 호스트 8080으로 들어온 패킷의 목적지를 컨테이너 IP로 바꾸려면, 라우팅 결정 전과 후 중 언제 바꿔야 할까? 왜?
> 2. 목적지를 바꿔서 보낸 요청의 응답은, 클라이언트가 보기엔 어떻게 원래 주소에서 온 것처럼 되돌아올까?
> 3. 컨테이너가 인터넷으로 나갈 때 출발지 IP는 왜 바꿔야 할까? 안 바꾸면 무슨 일이 생길까?
> 4. 같은 Service에 백엔드가 3개일 때, 패킷마다 무작위로 보내면 TCP 연결은 어떻게 될까?
> 5. 연결 추적 테이블에 상한이 있다면, 어떤 워크로드가 그 상한을 먼저 칠까?
> **처리법:** 🛠 실습 `iptables-save -t nat | grep -i docker`, `iptables -t nat -L POSTROUTING -n -v`, `conntrack -L`, `conntrack -C`, `sysctl net.netfilter.nf_conntrack_max` → 바로 실행 · 🗺 관계도 PREROUTING→라우팅 결정→FORWARD→POSTROUTING 흐름과 DNAT(앞)↔MASQUERADE(뒤)의 대칭을 직접 그려 보기 · 📦 카드로 `KUBE-SERVICES`/`KUBE-SVC-*`/`KUBE-SEP-*`, `0x4000`, `p_i = 1/(N-i+1)`, `nf_conntrack_max` · 유추 비판 "규칙 목록 = if 체인"이 어디서 깨지는지(선형 탐색·훅 위치) 적어 보기

---

## 코어 1. 패킷은 훅을 지나고, 규칙은 거기에 걸려 있다

### 1.1 netfilter와 iptables의 관계

**한 줄 요약:** netfilter는 커널 안의 프레임워크(훅)이고, iptables는 그 위에 만들어진 사용자 공간 도구다.

iptables는 넷필터(netfilter) 프레임워크 위에 만들어진 사용자 공간 도구로, 1998년 무렵 도입된 이래 리눅스 방화벽의 사실상 표준으로 자리 잡아 왔다. 이 책에서 "규칙"이라고 부르는 것은 전부 "패킷이 커널 안의 특정 지점을 지날 때 검사하는 조건 + 동작"이다.

### 1.2 훅과 체인

**한 줄 요약:** 규칙은 패킷 경로의 정해진 지점(훅)에 놓인 체인에 들어 있고, 그 지점이 곧 할 수 있는 일을 정한다.

nftables에서는 체인이 걸릴 훅을 `input`, `forward`, `output`, `prerouting`, `postrouting` 다섯 가지 중에서 선언한다. iptables에서는 `INPUT`, `FORWARD`, `OUTPUT` 같은 표준 체인과 그 체인이 걸리는 훅, 평가 순서(priority)가 프레임워크 안에 이미 고정되어 있다. 이 책에서 자주 보게 되는 체인과 테이블은 다음과 같다.

| 체인 | 이 책에서 나오는 맥락 |
|---|---|
| `PREROUTING` (nat) | 외부에서 들어온 패킷. `DOCKER` 체인·`KUBE-SERVICES`로 점프하고 DNAT가 일어난다 |
| `OUTPUT` (nat) | 호스트 로컬 프로세스가 보낸 패킷. `DOCKER`·`KUBE-SERVICES`로 점프 |
| `FORWARD` (filter) | DNAT 후 컨테이너로 가는 패킷, 호스트를 가로질러 전달되는 패킷 |
| `INPUT` (filter) | 호스트 자신으로 들어오는 패킷. `ufw` 같은 도구가 규칙을 두는 곳 |
| `POSTROUTING` (nat) | 나가는 패킷. 출발지 변환(MASQUERADE) |

> **[보충]** 위 표는 원천의 여러 절(docker 12.3·12.4·15.4·16.2, k8s-internals 15.1)에 흩어져 있는 체인 설명을 이 책에서 한 표로 모은 것이다. 원천은 `PREROUTING`/`OUTPUT`이 `DOCKER`·`KUBE-SERVICES`로 점프하고, `FORWARD`가 DNAT 후 패킷을 판단하며, `POSTROUTING`에 MASQUERADE가 있고, `ufw` 등은 관리자가 설정한 규칙을 흔히 `INPUT` 체인이나 자신의 관리 체인에 넣는다고 설명한다. 각 체인의 "호스트 자신으로 들어오는 패킷", "로컬 프로세스가 보낸 패킷" 같은 한 줄 의미는 원천의 서술을 요약한 것이다(`INPUT`은 컨테이너로 향하는 트래픽 상당수가 `INPUT`이 아니라 `FORWARD`를 통과한다는 16.2절 설명에서 도출).

### 1.3 들어오는 패킷의 순서 (원천 도식)

```
(외부에서 온 패킷, dst=host_ip:8080)
        │
PREROUTING (nat) ── DOCKER 체인으로 점프
        │
DNAT: dst를 container_ip:80 으로 변경
        │
라우팅 결정 (목적지가 이제 컨테이너 IP이므로 docker0 브리지 방향으로)
        │
FORWARD (filter) ── ACCEPT/DROP 판단
        │
docker0 브리지 → veth → 컨테이너 eth0:80
```

**왜 PREROUTING인가.** 커널은 목적지 주소를 컨테이너 IP로 **바꾼 뒤에** "이 패킷을 어디로 보낼지"를 판단한다. 라우팅 결정 후에 바꾸면 이미 "호스트로 들어온 패킷"으로 경로가 정해져 버린다. 그래서 목적지를 바꾸는 규칙은 라우팅 결정보다 앞선 PREROUTING에 걸린다.

> **[보충]** "라우팅 결정 후에 바꾸면 이미 경로가 정해져 버린다"는 문장은 원천(15.4)이 말한 "DNAT가 라우팅 결정보다 앞선 PREROUTING 단계에서 일어나므로, 커널은 바꾼 뒤에 다시 판단한다"를 이 책이 풀어 쓴 설명이다.

---

## 코어 2. NAT는 두 방향, 시점이 대칭이다

### 2.1 DNAT와 MASQUERADE

**한 줄 요약:** DNAT는 목적지를 PREROUTING에서, MASQUERADE는 출발지를 POSTROUTING에서 바꾼다.

| 구분 | DNAT (Destination NAT) | MASQUERADE (아웃바운드 NAT) |
|---|---|---|
| 바꾸는 것 | 목적지 주소 | 출발지 주소 |
| 체인 | `PREROUTING` (호스트 자신에서 접속하는 경우 `OUTPUT`) | `POSTROUTING` |
| 대표 사례 | `docker run -p 8080:80`, 쿠버네티스 Service(ClusterIP·NodePort) | 컨테이너 → 외부, `externalTrafficPolicy: Cluster`의 SNAT |
| 결과 | 목적지가 컨테이너/Pod IP:포트가 된다 | 출발지가 호스트(노드) IP가 된다 |

컨테이너가 외부로 나갈 때는 컨테이너의 기본 게이트웨이(브리지 IP, 예: 172.17.0.1)를 거쳐 호스트 커널의 IP 포워딩 경로로 올라가고, `nat` 테이블 `POSTROUTING` 체인의 MASQUERADE 규칙이 출발지 IP를 호스트의 외부 인터페이스 IP로 치환한다.

```bash
iptables -t nat -L POSTROUTING -n -v | grep -i MASQUERADE
```

### 2.2 Docker의 DNAT 규칙 읽기

`docker run -d --name web -p 8080:80 nginx:latest` 후 `iptables-save -t nat | grep -i docker`를 실행하면, `DOCKER`라는 체인이 정의되어 있고 그 안에 `-p tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80`과 비슷한 규칙이 보인다. `PREROUTING` 체인과 (호스트 자신에서 접속하는 경우를 위한) `OUTPUT` 체인 양쪽에서 이 `DOCKER` 체인으로 점프하는 규칙도 함께 보인다. (자세한 경로는 [8장](../2부-Docker-네트워크/08-브리지-네트워크와-포트-게시.md))

### 2.3 쿠버네티스 Service의 DNAT 체인

**한 줄 요약:** `KUBE-SERVICES`가 단일 진입점이고, `KUBE-SVC-*`가 엔드포인트를 고르고, `KUBE-SEP-*`가 실제 DNAT를 한다.

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

원천의 예(Service `payments`, 엔드포인트 3개)는 다음과 같다.

```
-A KUBE-SERVICES -d 10.96.142.88/32 -p tcp -m comment --comment "default/payments cluster IP" \
   -m tcp --dport 80 -j KUBE-SVC-P2QNAX57L3TRA3TJ
```

```
-A KUBE-SVC-P2QNAX57L3TRA3TJ -m comment --comment "default/payments -> 10.244.1.3:8080" \
   -m statistic --mode random --probability 0.33333333349 -j KUBE-SEP-AAAAAAAAAAAAAA
-A KUBE-SVC-P2QNAX57L3TRA3TJ -m comment --comment "default/payments -> 10.244.2.4:8080" \
   -m statistic --mode random --probability 0.50000000000 -j KUBE-SEP-BBBBBBBBBBBBBB
-A KUBE-SVC-P2QNAX57L3TRA3TJ -m comment --comment "default/payments -> 10.244.1.5:8080" \
   -j KUBE-SEP-CCCCCCCCCCCCCC
```

```
-A KUBE-SEP-AAAAAAAAAAAAAA -s 10.244.1.3/32 -j KUBE-MARK-MASQ
-A KUBE-SEP-AAAAAAAAAAAAAA -p tcp -m tcp -j DNAT --to-destination 10.244.1.3:8080
```

**확률의 수학.** `statistic random`은 각 규칙을 독립적으로 위에서부터 순서대로 평가한다. 엔드포인트가 N개일 때 i번째 규칙의 확률은 `p_i = 1/(N-i+1)`이고 마지막 규칙은 확률 없이 무조건 매칭된다. N=3이면 1번째 1/3, 2번째 남은 2/3의 절반(전체의 1/3), 3번째 나머지 1/3이다. 엔드포인트가 5개면 `1/5, 1/4, 1/3, 1/2, (마지막 무조건)`이다.

### 2.4 `KUBE-MARK-MASQ`와 `0x4000` — 쿠버네티스의 출발지 변환

`KUBE-SEP-*`의 첫 규칙은 **헤어핀(hairpin) 대응**이다. Pod가 자기 자신이 속한 Service를 호출해 결국 자기 자신에게 되돌아오는 경우, SNAT 없이는 응답 패킷의 출발지가 여전히 Pod 자신이 되어 커널이 그 응답을 "내가 보낸 요청에 대한 응답"으로 인식하지 못한다. `KUBE-MARK-MASQ`로 표시를 남기면 `KUBE-POSTROUTING` 체인이 표시를 보고 마스커레이드를 적용한다.

```
-A KUBE-POSTROUTING -m mark ! --mark 0x4000/0x4000 -j RETURN
-A KUBE-POSTROUTING -j MARK --xor-mark 0x4000
-A KUBE-POSTROUTING -j MASQUERADE --random-fully
```

`0x4000` 마크가 붙은 패킷만 SNAT된다. 이것이 `externalTrafficPolicy: Cluster`에서 클라이언트 IP가 사라지는 정확한 지점이다(노드를 건너가야 하는 트래픽에 마크가 붙어 출발지가 노드 IP로 치환된다). 또 kube-proxy는 `--cluster-cidr`로 클러스터 내부 대역을 알아야 "클러스터 내부에서 온 트래픽은 SNAT하지 않는다"는 판단을 할 수 있어서, 이 값이 없거나 틀리면 Pod 간 트래픽까지 불필요하게 마스커레이드될 수 있다. (이 체인들의 전체 그림은 [17장](../3부-쿠버네티스-네트워크/17-kube-proxy-데이터플레인.md))

NodePort 트래픽은 `KUBE-SERVICES`가 아니라 `KUBE-NODEPORTS`를 거치며, 노드 자신의 어떤 주소든 지정 포트로 오면 매칭되어야 하므로 목적지 IP 없이 **포트만으로** 매칭한다. 이후는 ClusterIP와 같은 `KUBE-SVC-*`로 들어간다.

---

## 코어 3. conntrack이 연결 단위로 기억한다

### 3.1 응답 패킷은 어떻게 돌아가는가

**한 줄 요약:** DNAT 규칙은 연결의 첫 패킷에만 적용되고, 나머지와 응답은 conntrack의 변환 기록으로 처리된다.

`iptables`가 매 패킷마다 역방향 규칙을 또 평가하는 것이 아니라, 리눅스 커널의 **연결 추적(conntrack)** 이 응답을 되돌린다.

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

그래서 클라이언트는 자신이 접속한 주소(`호스트IP:8080`, ClusterIP:80)만 본다. "확률 기반 분배가 연결 단위로 유지된다"는 것도 conntrack이 최초 SYN 패킷에서 결정한 목적지를 연결이 끝날 때까지 유지하기 때문이다. 그렇지 않으면 같은 TCP 스트림의 패킷이 서로 다른 백엔드로 흩어지는 문제가 생긴다. 따라서 **연결 수가 충분히 많을 때만** 분배가 통계적으로 균등해지고, 연결이 소수이고 오래 유지되는 워크로드(gRPC 스트리밍 등)에서는 헤드리스 Service + 클라이언트 사이드 로드밸런싱이 필요하다.

```bash
docker exec k8s-guide-worker conntrack -L 2>/dev/null | grep 10.96.142.88
```

```
tcp 6 431999 ESTABLISHED src=10.244.1.9 dst=10.96.142.88 sport=34567 dport=80 \
    src=10.244.1.3 dst=10.244.1.9 sport=8080 dport=34567 [ASSURED]
```

두 번째 `src=`/`dst=` 쌍이 conntrack이 기억하는 **역변환 정보**다.

### 3.2 conntrack 테이블 고갈

**한 줄 요약:** 테이블이 가득 차면 새 연결이 거부되기 시작한다. 짧은 연결이 폭주하는 워크로드에서 흔한 장애다.

```bash
docker exec k8s-guide-worker conntrack -C          # 현재 엔트리 수
docker exec k8s-guide-worker sysctl net.netfilter.nf_conntrack_max
dmesg | grep -i "nf_conntrack: table full"
```

```bash
docker exec k8s-guide-worker sh -c \
  'echo "current: $(conntrack -C), max: $(sysctl -n net.netfilter.nf_conntrack_max)"'
```

원천은 **80%를 넘으면 위험**하다고 한다. 원인은 짧은 연결이 매우 많은 워크로드, 타임아웃이 긴 UDP 연결, 연결 누수다. 대책(원천의 예시값)은 다음과 같다.

```bash
sysctl -w net.netfilter.nf_conntrack_max=2097152
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_time_wait=30
sysctl -w net.netfilter.nf_conntrack_udp_timeout=30
```

(다른 절의 예는 `nf_conntrack_max=1048576`, `nf_conntrack_tcp_timeout_established=3600`이다. 값은 예시이며 환경에 맞춰 정한다.) 쿠버네티스에서 DNS 5초 지연도 conntrack의 UDP 경쟁 조건 때문이라고 원천은 설명한다([18장](../3부-쿠버네티스-네트워크/18-DNS와-서비스-디스커버리.md)). Cilium의 eBPF 데이터플레인은 자체 연결 추적을 쓰므로 이 문제에서 자유롭다고 한다([22장](../3부-쿠버네티스-네트워크/22-eBPF-데이터플레인과-Cilium.md)).

> **[보충]** [2장](02-소켓-TCP-포트-DNS-기초.md)에서 다루는 소켓 상태(TIME_WAIT 등)는 프로세스가 가진 소켓의 상태이고, conntrack 엔트리는 위 `conntrack -L` 출력처럼 netfilter가 따로 유지하는 테이블이라는 구분은 이 책이 독자(소켓 서버 개발자)를 위해 덧붙인 설명이다. 원천은 `nf_conntrack_tcp_timeout_time_wait` 같은 conntrack 쪽 타임아웃 튜닝 값만 보여 준다.

---

## 코어 4. 규칙은 순서대로 읽히고, 백엔드는 둘이다

### 4.1 iptables의 구조적 한계

**한 줄 요약:** 선형 탐색, 파편화된 도구 체계, 그리고 legacy/nft 혼재가 iptables의 세 약점이다.

- **선형 탐색:** `filter` 테이블의 `INPUT`·`FORWARD` 체인에 수백, 수천 개 규칙이 쌓이면 패킷 하나가 체인을 통과할 때마다 위에서부터 규칙을 하나씩 검사한다. Docker처럼 컨테이너가 뜨고 사라질 때마다 규칙을 동적으로 넣고 빼는 환경에서는 비용이 누적되는 경향이 있다.
- **파편화:** IPv4용 `iptables`, IPv6용 `ip6tables`, 브리지 프레임용 `ebtables`, ARP용 `arptables`가 별도 명령과 별도 커널 모듈로 존재한다. IPv4/IPv6에 같은 규칙을 적용하려면 사실상 두 번 작성해야 한다.
- **혼재 위험:** 대부분의 주요 배포판에서 `iptables` 명령은 실제로 `iptables-nft`를 호출해 전통적 iptables 문법을 nftables 규칙으로 변환해 적재한다. 진짜 legacy 구현은 `iptables-legacy`로 남아 있다. 두 구현은 커널에 규칙을 적재하는 내부 표현이 달라서, 한 시스템에 섞이면 서로의 규칙을 인식하지 못해 정책이 꼬여도 원인을 알아채기 어렵다.

```bash
# 현재 iptables가 어느 구현을 가리키는지 확인 (Debian/Ubuntu 계열)
sudo update-alternatives --display iptables
```

### 4.2 규칙 폭증과 갱신 방식

kube-proxy는 규칙을 하나씩 넣지 않고 **전체 규칙 집합을 메모리에 재구성한 뒤 `iptables-restore --noflush`로 원자적으로 통째 교체**한다(`KUBE-` 로 시작하지 않는 규칙은 건드리지 않는다). 갱신 중 어중간한 상태가 노출되지 않는 대신, Service 수가 많아지면 텍스트를 만들고 적재하는 시간이 늘어난다.

```
서비스 1,000개 × 엔드포인트 평균 10개
→ 규칙 수 ≈ 1,000 × (2 + 10 × 2) = 22,000
서비스 5,000개면 10만 개를 넘는다
```

증상은 서비스 변경 반영의 지연(수 초&#126;수십 초), kube-proxy CPU 상승, `iptables-restore` 실행 시간 증가다. 대책은 IPVS 모드, Cilium의 kube-proxy 대체(eBPF), 서비스 수 줄이기(헤드리스 활용)다(→ [17장](../3부-쿠버네티스-네트워크/17-kube-proxy-데이터플레인.md)).

> **[보충]** 원천끼리 충돌한 지점: kubernetes-textbook은 대책으로 IPVS 모드를 꼽지만, 더 최신인 Kubernetes_Internals_Network_Guide(15.2절)는 IPVS 모드가 KEP-5495로 단계적 폐기 경로에 들어섰고 신규로 채택할 이유는 사실상 없다고 하며 nftables 모드를 유력한 후속으로 본다. 이 책은 후자를 따른다.

```bash
docker exec k8s-guide-worker iptables -t nat -S | wc -l
kubectl get --raw /metrics 2>/dev/null | grep kubeproxy_sync_proxy_rules_duration
```

### 4.3 nftables의 설계 목표

nftables는 이 문제들을 다시 설계한 netfilter 프로젝트의 후속 프레임워크이며, 핵심 아이디어는 세 가지다.

- **단일 프레임워크:** IPv4·IPv6·브리지·ARP를 하나의 `nft` 명령과 하나의 규칙 표현으로 다룬다. `ip`/`ip6`를 동시에 다루는 `inet` 패밀리를 쓰면 규칙을 한 번만 쓰면 된다.
- **커널 내 가상 머신:** 규칙을 작은 바이트코드로 컴파일해 커널에 통째로 내려보낸다.
- **세트(set)와 맵(map):** "이 IP 목록에 포함되는가" 같은 조건을 개별 규칙 N개 대신 하나의 세트로 표현하고, 세트는 커널 내부에서 해시 테이블이나 트리로 관리되어 규칙 수가 늘어도 순회 비용이 선형으로 늘지 않는다.

같은 의도의 규칙을 두 문법으로 쓰면 다음과 같다(TCP 22번 허용).

```bash
# iptables 문법
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
```

```bash
# nftables 문법 (nft 스크립트)
nft add table inet filter
nft add chain inet filter input { type filter hook input priority 0 \; }
nft add rule inet filter input tcp dport 22 accept
```

nftables는 테이블과 체인을 사용자가 선언하면서 어떤 훅(input, forward, output, prerouting, postrouting)에 걸릴지, 같은 훅에 체인이 여럿일 때 어떤 순서(priority 숫자가 작을수록 먼저)로 평가될지를 명시한다. 이 명시성 덕분에 Docker 전용 테이블을 다른 도구의 테이블과 이름 공간부터 분리할 수 있다([11장](../2부-Docker-네트워크/11-Docker-방화벽-iptables에서-nftables로.md)).

---

## 실무 적용

### 체크리스트

- [ ] DNAT는 `PREROUTING`(라우팅 결정 전), MASQUERADE는 `POSTROUTING`에서 일어난다. 이 둘의 시점이 대칭이라는 것을 안다.
- [ ] Docker 포트 게시는 `nat` 테이블의 `DOCKER` 체인 DNAT 규칙이고, `iptables-save -t nat | grep -i docker`로 확인한다.
- [ ] 쿠버네티스 Service는 `KUBE-SERVICES` → `KUBE-SVC-*` → `KUBE-SEP-*`(DNAT) 순서로 읽는다. `i`번째 규칙의 확률은 `1/(N-i+1)`.
- [ ] 응답 주소 복원은 conntrack이 한다. 연결 분배도 "첫 패킷에서 결정, conntrack이 유지"라 연결 단위다.
- [ ] 클라이언트 IP가 노드 IP로 보이면 `0x4000` 마크·`KUBE-POSTROUTING`·`--cluster-cidr`를 확인한다.
- [ ] 간헐 타임아웃이면 `conntrack -C`와 `nf_conntrack_max`를 비교(80% 초과 위험), `dmesg`의 `nf_conntrack: table full`을 본다.
- [ ] 규칙이 이상하게 보이지 않으면 `update-alternatives --display iptables`로 legacy/nft 혼재를 의심한다.

### 시나리오로 확인하기

1. **상황:** 게임 로비 서버가 쿠버네티스 Service 뒤에 있다. 접속 폭주 이벤트 때 새 접속이 간헐적으로 타임아웃되는데 Pod CPU·메모리는 여유롭다. 노드의 `dmesg`에 `nf_conntrack: table full`이 보인다.
   **질문:** 의심 부품, 확인, 해결은?

   <details markdown="1"><summary>답 확인</summary>

   의심 부품은 노드 커널의 conntrack 테이블이다. 짧은 연결이 매우 많거나 UDP 타임아웃이 긴 워크로드에서 테이블이 가득 차면 새 연결이 거부된다. `conntrack -C`로 현재 엔트리 수, `sysctl net.netfilter.nf_conntrack_max`로 상한을 비교(80% 초과면 위험)하고, 원천의 예시처럼 `nf_conntrack_max`를 늘리고 `nf_conntrack_tcp_timeout_time_wait`·`nf_conntrack_udp_timeout`를 줄이는 방향으로 조정한다. 연결 누수 여부도 본다. → 코어 3

   </details>

2. **상황:** 외부에서 NodePort로 접속하는 게임 클라이언트의 실제 IP가 서버 로그에 항상 노드 IP로 찍힌다. 접속 제한(IP 기준)이 동작하지 않는다.
   **질문:** 어디서 출발지가 바뀌는가?

   <details markdown="1"><summary>답 확인</summary>

   `externalTrafficPolicy: Cluster`에서 노드를 건너가야 하는 트래픽에 `KUBE-MARK-MASQ`로 `0x4000` 마크가 붙고, `KUBE-POSTROUTING`이 마크를 보고 MASQUERADE해 출발지를 노드 IP로 치환한다. `iptables -t nat -S KUBE-POSTROUTING`으로 규칙을 보고, `--cluster-cidr` 설정값도 확인 대상에 포함한다. (정책 변경 방법은 [16장](../3부-쿠버네티스-네트워크/16-Service와-EndpointSlice.md)) → 코어 2 (2.4)

   </details>

3. **상황:** 호스트에서 Docker 포트 규칙을 확인하려고 `iptables -t nat -S`를 쳤더니 `DOCKER` 체인이 보이지 않는다. 다른 도구는 `iptables-legacy`로 규칙을 넣고 있었다.
   **질문:** 무엇을 의심하는가?

   <details markdown="1"><summary>답 확인</summary>

   legacy와 nft 백엔드 혼재다. 두 구현은 커널 적재 방식이 달라 서로의 규칙을 인식하지 못한다. `update-alternatives --display iptables`로 현재 가리키는 구현을 확인하고, 규칙이 어느 쪽에 적재되었는지 맞춰 본다. → 코어 4 (4.1)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
코어 1 netfilter = 커널 ____ , iptables = 사용자 공간 ____
  훅 5개: ____ ____ ____ ____ ____
  들어오는 순서: PREROUTING → ____ → FORWARD → docker0 → veth → eth0
코어 2 DNAT: 바꾸는 것 ____ / 체인 ____ (라우팅 결정 전)
       MASQUERADE: 바꾸는 것 ____ / 체인 ____
  K8s: KUBE-SERVICES → KUBE-SVC-* (확률 p_i = ____) → KUBE-SEP-* (____)
  출발지 변환 마크 ____ / 체인 KUBE-____
코어 3 응답 복원 = ____ / DNAT 규칙은 연결의 ____ 패킷에만
  확인: conntrack -L / conntrack -C / sysctl ____
  고갈 증상: 새 연결 ____, 로그: dmesg "nf_conntrack: ____"
코어 4 iptables 약점 3: ____ 탐색 / 도구 ____ / legacy-nft ____
  nftables 3: 단일 ____ / 커널 ____ / ____(set)·맵
```

### 2. 인출 질문

1. DNAT가 라우팅 결정 전(PREROUTING)에 일어나야 하는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   커널은 목적지를 컨테이너 IP로 바꾼 뒤에 "어디로 보낼지"를 판단한다. 그 결과 패킷이 docker0 브리지 방향으로 라우팅되어 FORWARD → 브리지 → veth → 컨테이너로 간다. → 코어 1 (1.3)

   </details>

2. 응답 패킷이 어떻게 클라이언트가 접속한 주소에서 온 것처럼 되는가?

   <details markdown="1"><summary>답 확인</summary>

   DNAT 시점에 conntrack이 변환 정보를 기록하고, 응답이 오면 그 흐름을 요청의 응답으로 인식해 저장된 정보로 역변환(Un-DNAT)한다. iptables가 매 패킷 역방향 규칙을 평가하는 것이 아니다. → 코어 3 (3.1)

   </details>

3. 백엔드 3개일 때 `KUBE-SVC-*` 확률이 1/3, 1/2, 무조건인 이유는?

   <details markdown="1"><summary>답 확인</summary>

   각 규칙이 독립적으로 위에서부터 평가되고 앞 규칙에서 안 걸린 패킷만 내려오기 때문이다. `p_i = 1/(N-i+1)`. 2/3 × 1/2 = 1/3, 나머지도 1/3이라 균등하다. → 코어 2 (2.3)

   </details>

4. 확률 분배가 매 패킷이 아니라 연결 단위인 이유와 실무 함의는?

   <details markdown="1"><summary>답 확인</summary>

   conntrack이 최초 SYN에서 정한 목적지를 연결 종료까지 유지하기 때문이다(아니면 한 TCP 스트림이 여러 백엔드로 흩어진다). 연결 수가 충분할 때만 균등해지고, 소수의 오래 가는 연결(gRPC 스트리밍)은 헤드리스 Service + 클라이언트 사이드 로드밸런싱이 필요하다. → 코어 3 (3.1)

   </details>

5. `0x4000` 마크와 `KUBE-POSTROUTING`은 무슨 일을 하는가?

   <details markdown="1"><summary>답 확인</summary>

   `KUBE-MARK-MASQ`가 남긴 `0x4000` 마크를 `KUBE-POSTROUTING`이 보고 MASQUERADE한다. 헤어핀(자기 자신에게 되돌아오는 Service 호출) 대응이고, `externalTrafficPolicy: Cluster`에서 클라이언트 IP가 노드 IP로 치환되는 지점이다. → 코어 2 (2.4)

   </details>

6. conntrack 테이블이 가득 차면 어떤 일이 생기고 무엇을 확인하는가?

   <details markdown="1"><summary>답 확인</summary>

   새 연결이 거부된다. `conntrack -C`와 `sysctl net.netfilter.nf_conntrack_max`를 비교(80% 초과 위험)하고 `dmesg | grep -i "nf_conntrack: table full"`로 확인한다. → 코어 3 (3.2)

   </details>

7. kube-proxy의 규칙 갱신이 증분이 아니라 통째 교체인 이유와 대가는?

   <details markdown="1"><summary>답 확인</summary>

   `iptables-restore --noflush`로 원자적으로 교체해 중간 상태 노출을 막는다(`KUBE-` 외 규칙은 보존). 대가는 Service가 많아질수록 구성·적재 시간이 늘어나는 것이다. → 코어 4 (4.2)

   </details>

8. `iptables-legacy`와 `iptables-nft`가 섞이면 왜 위험한가?

   <details markdown="1"><summary>답 확인</summary>

   커널에 규칙을 적재하는 내부 표현이 달라 서로의 규칙을 인식하지 못하고, 정책이 꼬여도 원인을 알기 어렵다. `update-alternatives --display iptables`로 확인한다. → 코어 4 (4.1)

   </details>

### 3. 기억 고리

- **C++ 유추:** conntrack ≈ 서버의 세션 맵(연결 ID → 상태). ⚠️ 맵을 가진 것은 내 프로세스가 아니라 커널이고, 크기 상한이 있어 가득 차면 새 연결이 거부된다.
- **C++ 유추:** 훅의 규칙 목록 ≈ 요청 처리 필터 체인. ⚠️ 위에서 아래로 선형 탐색이라 규칙이 많아지면 느려지고, 훅의 위치가 곧 할 수 있는 일을 정한다.
- **비유:** NAT = 우편물 대리 접수. 들어오는 편지는 현관(PREROUTING)에서 받는 사람 이름을 사내 담당자로 고쳐 쓰고(DNAT), 나가는 편지는 정문(POSTROUTING)에서 보낸 사람을 회사 대표 주소로 바꾼다(MASQUERADE). 답장은 접수 장부(conntrack)를 보고 원래 이름으로 되돌린다. ⚠️ 깨지는 지점: 장부는 접수원이 아니라 커널의 테이블이고, 장부가 꽉 차면 새 편지를 아예 접수하지 못한다.
- **묶음(3의 법칙):** NAT·추적 3요소(DNAT 앞 / MASQUERADE 뒤 / conntrack 복원) · iptables 약점 3(선형·파편화·혼재) · nftables 3(단일·바이트코드 VM·세트/맵).
- **대칭·순서:** DNAT(목적지, PREROUTING) ↔ MASQUERADE(출발지, POSTROUTING). 순서: PREROUTING → DNAT → 라우팅 결정 → FORWARD → … → POSTROUTING. 체인 계층: KUBE-SERVICES → KUBE-SVC → KUBE-SEP.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "클라이언트가 ClusterIP:80으로 보낸 요청이 어떻게 Pod 8080에 도착하고 응답이 되돌아오는가"를 규칙 이름(`KUBE-SERVICES`, `KUBE-SVC`, `KUBE-SEP`)과 conntrack을 써서 설명해 보세요.
- **C++ 서버 동료에게 설명하기:** "내 서버는 `accept`만 했는데 왜 상대 주소가 노드 IP로 보이는가"를 소켓 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "conntrack 테이블은 크게 늘려 두는 게 안전하다" vs B "타임아웃을 줄이는 게 근본 대책이다" — 양쪽을 번갈아 변호해 보세요(80% 기준, `time_wait`/`udp_timeout`, 연결 누수를 근거로).
- **AI 역할 반전:** "내가 DNAT/MASQUERADE/conntrack의 시점과 역할을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/12_브리지_네트워크_심화.md (12.3 통신 경로, 12.4 포트 게시, 12.6 실제 규칙 확인); docker-fundamental/15_DNS와_서비스_디스커버리_포트_매핑의_내부_동작.md (15.4 포트 매핑 경로); docker-fundamental/16_방화벽_백엔드의_전환.md (16.1 iptables의 한계, nftables 설계 목표, 같은 규칙 두 문법, 16.2 FORWARD 체인 충돌); Kubernetes_Internals_Network_Guide/03-네트워크/15-kube-proxy-데이터플레인-해부.md (15.1 체인 계층·확률·헤어핀·NodePort·갱신 방식·DNAT와 conntrack); kubernetes-textbook-main/05-내부-동작-파헤치기/23-CNI와-대규모-네트워크-트러블슈팅.md (23.4 체인 구조·conntrack, 23.5 iptables 규칙 폭증·conntrack 고갈)*
