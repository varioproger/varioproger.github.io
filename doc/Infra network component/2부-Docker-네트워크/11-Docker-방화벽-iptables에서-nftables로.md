---
title: "11장. Docker 방화벽 — iptables에서 nftables로"
parent: "2부. Docker 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 11
---

# 11장. Docker 방화벽 — iptables에서 nftables로

> **🎮 게임 서버 개발자에게** — 게임 서버를 운영할 때 `ufw`나 `iptables`로 "7777만 열고 나머지는 막는다"는 정책을 걸어 본 적이 있을 겁니다. 그런데 컨테이너 세계에서는 **Docker도 같은 netfilter에 자기 규칙을 쓰고**, 그 규칙이 호스트 방화벽 도구와 같은 체인 공간을 조율 없이 나눠 씁니다. 결정적으로 다른 점은, 컨테이너로 향하는 패킷은 `INPUT`이 아니라 `FORWARD` 체인을 지나가기 때문에 "ufw에서 막았다"는 믿음이 깨질 수 있다는 것입니다. Docker Engine 28은 이 허점을 막기 위해 기본 동작을 바꿨고, Engine 29는 iptables 호환 레이어조차 거치지 않는 실험적 nftables 백엔드를 도입했습니다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - `-p`로 게시하지 않은 컨테이너 포트가 같은 사설망/VPC의 다른 서버에서 컨테이너 IP로 직접 접근된다.
> - `ufw`/`firewalld` 정책을 걸었는데 컨테이너로 향하는 트래픽이 정책과 무관하게 통과한다.
> - `iptables`가 `iptables-nft`인지 `iptables-legacy`인지 헷갈리는 호스트에서 규칙이 꼬였다.

## 코어 — 이것만은 100%

> **한 문장:** Docker는 오랫동안 iptables(대부분 `iptables-nft` 호환 레이어) 체인을 호스트 표준 체인에 끼워 넣는 방식으로 방화벽을 구성했고, 그 공유 구조가 낳은 보안 허점을 Engine 28이 "게시하지 않은 포트 인바운드 기본 차단"으로 막았으며, Engine 29는 전용 테이블(`docker-bridges`)로 규칙을 분리하는 **실험적** 네이티브 nftables 백엔드를 도입했다.

1. **iptables의 구조적 한계와 호환 레이어** — 선형 규칙 순회, IPv4/IPv6/브리지/ARP 도구 파편화. 현대 배포판의 `iptables`는 대개 nftables 위의 호환 바이너리 `iptables-nft`이고, `iptables-legacy`와 섞이면 서로의 규칙을 못 본다.
2. **Engine 28.0.0 — 게시하지 않은 포트를 막다** — Docker가 관대한 기본 정책(ACCEPT)에 기대고 `FORWARD`에 자기 규칙을 앞쪽에 끼워 넣던 구조 때문에, 게시하지 않은 포트도 컨테이너 IP로 직접 라우팅되거나 `ufw` 규칙을 우회했다. 28.0.0부터 `DOCKER` 체인에서 기본 차단한다(Linux 전용).
3. **Engine 29.0.0 — 실험적 네이티브 nftables 백엔드** — `--firewall-backend=nftables`. Docker 전용 테이블(`ip docker-bridges`, `ip6 docker-bridges`)로 네임스페이스를 분리한다. `DOCKER-USER`는 그대로 존재하지 않고 별도 테이블 + 우선순위로 대체된다.
4. **제약을 알고 쓴다** — 실험적(구성·동작·구현이 바뀔 수 있음), Swarm 모드에서는 활성화 불가, macvlan/ipvlan은 이 전환과 무관(영향은 브리지 네트워크의 포트 게시 경로에 국한).

**이 장의 학습 목표**

- iptables가 한계에 부딪힌 이유(선형 탐색, 도구 파편화, legacy/nft 혼재)를 설명한다.
- nftables의 설계 목표 세 가지(단일 프레임워크, 커널 내 VM, set/map)를 안다.
- Engine 28이 막은 두 가지 문제(게시하지 않은 포트 직접 접근, `FORWARD` 체인 우선순위 충돌)를 구분한다.
- nftables 백엔드의 활성화 방법과 `DOCKER-USER` 대체 방식의 차이, 제약 세 가지를 안다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 호스트의 `ufw`/`iptables` 정책 | Docker가 만드는 iptables 규칙 | 둘 다 커널 netfilter 규칙 | 두 도구가 같은 체인 공간을 서로의 존재를 모른 채 나눠 쓰고, 삽입 순서에 따라 평가 순서가 뒤바뀐다 |
| `bind(127.0.0.1)`로 내부에서만 받기 | `-p`로 게시한 포트만 외부에 노출한다는 원칙 | 의도한 포트만 외부에 노출 | 게시하지 않은 포트도 컨테이너 사설 IP로 직접 라우팅되면 열려 있었다(Engine 28 이전) |
| 서버 앞단 방화벽 규칙 수천 줄 | iptables 선형 순회 vs nftables set/map | 규칙이 많아지면 성능이 걱정 | 수백&#126;수천 규칙이 쌓이면 위에서부터 순서대로 검사하는 비용이 누적되고, nftables는 set을 해시/트리로 관리한다 |
| 빌드 도구 버전 두 개가 같은 캐시를 건드림 | `iptables-legacy` vs `iptables-nft` 혼재 | 도구가 다르면 서로의 상태를 못 봄 | 둘이 커널에 적재하는 내부 표현이 달라 서로 규칙을 인식 못해 원인 추적이 어렵다 |
| 라이브러리 내부 심볼을 건드리는 대신 네임스페이스로 분리 | Docker 전용 테이블 `docker-bridges` | 이름 공간 분리로 충돌을 줄인다 | 완전한 격리가 아니라 "우연한 충돌 가능성이 훨씬 줄어든다" 수준이고, 평가 순서(priority)는 관리자가 명시적으로 조정해야 한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `-p`를 주지 않은 컨테이너 포트는 외부에서 정말 접근할 수 없을까?
> 2. `ufw`에서 막았는데 컨테이너 포트로 트래픽이 통과한다면, 컨테이너로 가는 트래픽은 어느 체인을 지나갈까?
> 3. `iptables` 명령을 쓰는데 실제로 커널에는 nftables 규칙이 들어갈 수 있을까?
> 4. nftables 백엔드에서는 `DOCKER-USER` 체인에 규칙을 넣던 습관이 그대로 통할까?
> 5. Swarm을 쓰는 노드에서 nftables 백엔드를 켜면 어떻게 될까?
> **처리법:** 🛠 실습 `sudo update-alternatives --display iptables`, `iptables-save | grep -A 5 DOCKER`, `docker info --format '{{.FirewallBackend}}'`, `sudo nft list table ip docker-bridges` (원천 실습, Docker 29.x·systemd 리눅스·테스트 환경 전제) → 바로 실행 · 🗺 관계도 `iptables → iptables-nft(호환) → nftables 커널` / `Docker 28 DOCKER 체인 차단` / `Docker 29 ip docker-bridges 테이블` · 📦 카드로 `FORWARD`/`INPUT`, `DOCKER-USER`, `gateway_mode_ipv4/ipv6=nat-unprotected`, `--firewall-backend=nftables`, 28.0.0 / 29.0.0 · 유추 비판 "ufw로 막았으니 안전하다"가 왜 깨지는가

---

## 코어 1. iptables의 구조적 한계와 호환 레이어

### 1.1 iptables는 왜 한계에 부딪혔나

**한 줄 요약:** 1998년 무렵 도입된 iptables는 규칙 순회가 선형이고 프로토콜별 도구가 파편화되어 있으며, 현대 배포판은 이미 nftables 위의 호환 레이어로 옮겨 갔다.

iptables는 넷필터(netfilter) 프레임워크 위의 사용자 공간 도구다. 20년 넘게 기능이 누적되며 세 가지 구조적 문제가 드러났다. (netfilter·iptables 기초는 [5장](../1부-리눅스-네트워크-기초/05-netfilter-iptables-NAT-conntrack.md) 참조.)

1. **선형 탐색** — `filter` 테이블의 `INPUT`/`FORWARD` 체인에 수백, 수천 규칙이 쌓이면 패킷 하나가 체인을 지날 때 위에서부터 규칙을 하나씩 검사한다. Docker처럼 컨테이너가 뜨고 사라질 때마다 규칙을 동적으로 추가/삭제하는 워크로드에서는 컨테이너 수가 많아질수록 순회 비용이 누적되는 경향이 있다.
2. **도구 파편화** — IPv4용 `iptables`, IPv6용 `ip6tables`, 브리지 프레임용 `ebtables`, ARP용 `arptables`가 각각 별도 명령·별도 커널 모듈이다. 같은 규칙을 IPv4와 IPv6에 적용하려면 사실상 두 번 써야 한다.
3. **호환 레이어와의 혼재** — 커널과 배포판은 `iptables` 자체를 nftables 위에 얹은 호환 레이어로 재구현했다. 대부분의 주요 배포판(Debian, Ubuntu, RHEL/Fedora 계열 등)에서 `iptables`를 실행하면 실제로는 `iptables-nft`가 호출되어 iptables 문법을 nftables 규칙으로 변환해 커널에 적재한다. 진짜 legacy 구현은 `iptables-legacy`라는 별도 이름으로 남아 있고 `update-alternatives`(Debian/Ubuntu 계열)로 전환할 수 있다. 문제는 두 구현이 커널에 규칙을 적재하는 **내부 표현이 달라**, 한 시스템에서 어떤 도구는 `iptables-legacy`를, 다른 도구는 `iptables-nft`를 쓰면 서로의 규칙을 인식하지 못해 정책이 꼬이는데도 어느 쪽에서도 원인을 알아채기 어렵다는 것이다.

```bash
# 현재 iptables가 어느 구현을 가리키는지 확인
sudo update-alternatives --display iptables

# nft 백엔드로 전환(대부분의 최신 배포판에서 이미 기본값)
sudo update-alternatives --set iptables /usr/sbin/iptables-nft

# 순수 legacy 구현으로 되돌리기 (호환성 문제 진단 등 특수한 목적)
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
```

`ebtables`와 `arptables`도 같은 방식(`ebtables-nft`/`arptables-nft`)으로 호환 바이너리를 통해 단일 nftables 프레임워크로 수렴했다. nftables가 브리지 패밀리(`bridge`)와 ARP 매칭을 자체 문법에 포함하기 때문이다. Docker는 오랫동안 이 호환 레이어(대부분의 현대 배포판에서 사실상 `iptables-nft`) 위에서 동작해 왔고, 이 장의 "네이티브 nftables 백엔드"는 **호환 레이어를 거치지 않고** nftables 커널 API(netlink 기반)를 직접 호출하는 새 방식이다.

### 1.2 nftables의 설계 목표 세 가지

**한 줄 요약:** 하나의 프레임워크, 커널 안의 작은 VM, set/map 자료구조.

- **단일 프레임워크:** IPv4·IPv6·브리지·ARP를 하나의 `nft` 명령과 규칙 표현으로 다룬다. `ip`와 `ip6`를 동시에 다루는 `inet` 패밀리를 쓰면 IPv4/IPv6 규칙을 사실상 한 번만 쓰면 된다.
- **커널 내 가상 머신:** 규칙을 커널 안의 작은 바이트코드 VM(BPF와 유사한 개념)으로 표현한다. 사용자 공간에서 규칙을 컴파일해 커널에 통째로 내려보내므로 더 유연한 최적화가 가능하다.
- **세트(set)와 맵(map):** "이 IP 목록에 포함되는가", "이 포트 중 하나인가" 같은 조건을 규칙 N개 대신 하나의 set으로 표현한다. set은 커널 내부에서 해시 테이블이나 트리로 관리되어 규칙이 늘어도 순회 비용이 선형으로 늘지 않는다. 동적으로 늘고 주는 컨테이너 IP 목록에 잘 맞는다.

### 1.3 같은 규칙, 두 가지 문법

**한 줄 요약:** nftables는 테이블·체인·훅·우선순위를 명시적으로 선언하며, 이 명시성이 Docker 전용 테이블 분리의 기반이다.

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

nftables 쪽이 장황한 이유는, iptables에서는 `INPUT`/`FORWARD`/`OUTPUT` 같은 표준 체인과 넷필터 훅·평가 순서가 프레임워크 안에 이미 고정되어 있는 반면, nftables에서는 사용자가 테이블·체인을 직접 선언하면서 어느 훅(input, forward, output, prerouting, postrouting)에 걸릴지와, 같은 훅에 여러 체인이 걸릴 때의 순서(priority 숫자가 작을수록 먼저 평가)를 명시해야 하기 때문이다. 이 명시성이 처음엔 번거롭지만 코어 3에서 보듯 Docker 전용 테이블 격리를 가능하게 하는 핵심이다.

---

## 코어 2. Engine 28.0.0 — 게시하지 않은 포트를 막다

### 2.1 두 가지 허점

**한 줄 요약:** (1) 게시하지 않은 포트가 컨테이너 IP로 직접 라우팅되어 열려 있었고, (2) Docker가 `FORWARD`에 앞쪽으로 끼워 넣은 규칙이 `ufw`/`firewalld` 정책보다 먼저 처리되었다.

Docker는 "명시적으로 게시(publish)한 포트만 외부에 노출된다"를 기본 원칙으로 내세웠지만 실제로는 허점이 있었다.

**허점 1 — 관대한 기본 정책에 기댄 직접 라우팅.** 브리지 네트워크의 컨테이너는 사설 대역 IP를 직접 부여받고 호스트가 그 대역으로 패킷을 라우팅할 수 있다. 많은 리눅스 배포판은 기본 iptables 정책을 `ACCEPT`(모든 트래픽 허용)로 두는데, Docker는 컨테이너 네트워크로 향하는 트래픽을 별도로 필터링하는 대신 이 관대한 기본 정책에 사실상 의존했다. 그 결과 네트워크 경로만 확보되면(같은 사설망의 다른 서버, 또는 VPC 라우팅이 허용된 클라우드 경로) `-p`로 게시하지 않은 컨테이너 포트에 컨테이너 IP로 직접 접근할 수 있었다. 안전하다고 믿은 포트가 호스트를 거치지 않는 경로로 열려 있던 셈이다.

**허점 2 — `FORWARD` 체인의 규칙 충돌.** Docker는 `FORWARD` 체인에 자신의 `DOCKER` 체인으로 점프하는 규칙을 다른 규칙보다 앞쪽에 삽입한다. 그런데 `ufw`나 `firewalld` 같은 호스트 방화벽 도구는 관리자가 설정한 규칙을 흔히 `INPUT` 체인이나 자신의 관리 체인에 넣고, 컨테이너로 향하는 트래픽의 상당수는 `INPUT`이 아니라 `FORWARD`를 통과한다. 그래서 `ufw`에서 막으라고 설정해도 Docker가 `FORWARD`에 심은 규칙이 먼저(또는 별도 경로로) 패킷을 처리해 버려 관리자의 의도와 무관하게 통과하는 일이 생겼다. 원천은 이것이 Docker의 버그라기보다 "컨테이너 네트워킹용 규칙"과 "호스트 방화벽 정책용 규칙"이 같은 netfilter 체인 공간을 서로 조율 없이 나눠 쓰던 **구조적 문제**였다고 설명한다.

### 2.2 28.0.0의 변경

**한 줄 요약:** `-p`로 게시하지 않은 컨테이너 포트로의 직접 라우팅 접근을 `DOCKER` iptables 체인에서 기본 차단한다 — Linux 호스트의 iptables 기반 Docker Engine에 적용되고 Docker Desktop은 대상이 아니다.

Docker Engine 28.0.0은 게시되지 않은 포트로 향하는 인바운드 트래픽을 컨테이너 IP 기준으로 기본 차단한다. Docker Desktop은 별도의 경량 VM 계층과 네트워킹 방식을 쓰므로 직접 영향 대상이 아니다. 기존에 게시하지 않은 포트로 원격 호스트의 직접 라우팅 접근이 필요했던 구성은 두 가지 선택이 있다.

- 필요한 포트를 **정식으로 게시**한다(권장).
- `gateway_mode_ipv4`/`gateway_mode_ipv6`를 `nat-unprotected`로 설정해 이전 동작을 복원한다. 이름 그대로 보호되지 않는 상태로 되돌리는 것이므로 정말 필요한 경우가 아니면 쓰지 않는다.

> **[보충]** 원천이 설명하는 28.0.0 변경은 "게시하지 않은" 포트로의 직접 라우팅 차단이다. 원천은 28.0.0이 허점 2(`FORWARD` 체인에서 `ufw` 규칙보다 Docker 규칙이 앞서는 문제)까지 해소했다고 말하지 않는다. 게시된 포트 쪽 동작은 [8장](08-브리지-네트워크와-포트-게시.md)의 포트 게시 설명과 함께 확인하자.

---

## 코어 3. Engine 29.0.0 — 실험적 네이티브 nftables 백엔드

### 3.1 활성화

**한 줄 요약:** 데몬 플래그 또는 `daemon.json`으로 켠다. 29.0.0부터 실험적으로 제공된다.

```bash
# 방법 1: 데몬 실행 시 플래그로 지정
dockerd --firewall-backend=nftables
```

```json
// 방법 2: daemon.json에 명시
{
  "firewall-backend": "nftables"
}
```

`daemon.json`으로 설정한 뒤에는 데몬을 재시작해야 반영된다.

```bash
sudo systemctl restart docker
```

### 3.2 무엇이 근본적으로 달라지는가

**한 줄 요약:** 공유된 체인 이름 공간에서 점프 규칙을 끼워 넣던 방식에서, Docker 전용 테이블 안에 스스로 훅과 우선순위를 구성하는 방식으로 바뀐다.

iptables 경로에서 Docker는 `DOCKER`, `DOCKER-USER`, `DOCKER-ISOLATION-STAGE-1/2` 같은 체인을 만들어 호스트 표준 체인(`FORWARD`, `nat` 테이블의 `PREROUTING`/`OUTPUT` 등)에 점프 규칙으로 끼워 넣었다. 한계는 Docker의 체인과 관리자·다른 도구(`firewalld`, `ufw`)의 체인이 결국 **같은 공유 네임스페이스**(체인 이름 공간과 점프 순서) 안에서 뒤섞인다는 점이다. 어느 쪽이 먼저 평가되는지는 규칙이 삽입된 순서에 달려 있고, 두 도구가 서로의 존재를 모른 채 규칙을 추가/삭제하면 순서가 쉽게 뒤바뀐다. 코어 2의 허점 2가 이 구조에서 비롯되었다.

nftables 네이티브 백엔드는 nftables의 **테이블 네임스페이스 분리**를 활용한다.

```
[iptables 방식]  호스트 표준 체인(FORWARD 등) ← Docker 점프 규칙 + ufw/firewalld 규칙이 같은 공간에서 혼재
[nftables 방식]  table ip docker-bridges  ← Docker 전용 (자기 체인·훅·priority)
                 table ip6 docker-bridges
                 table ... (firewalld/관리자가 만든 다른 테이블)  ← 이름·우선순위로 구분
```

- 브리지 네트워크 트래픽용으로 호스트 네임스페이스에 `ip docker-bridges`, `ip6 docker-bridges` 테이블을 만들고 필요한 체인과 우선순위를 스스로 구성한다.
- DNS 관련 규칙은 컨테이너 자신의 네트워크 네임스페이스 안에도 별도로 생성된다. ([9장](09-Docker-DNS와-서비스-디스커버리.md)에서 본 `127.0.0.11` 가로채기 규칙이 컨테이너 netns 안에 있다는 설명과 같은 맥락.)
- 다른 nftables 테이블과 이름·우선순위가 우연히 충돌할 가능성이 iptables 시절보다 훨씬 줄고, `nft list table ip docker-bridges`처럼 Docker 규칙만 분리해서 볼 수 있다.

**`DOCKER-USER`의 운명.** iptables 경로에서 관리자가 Docker 규칙보다 먼저 자기 정책을 적용하려고 쓰던 `DOCKER-USER`는 Docker 체인들보다 앞서 평가되도록 비워둔 훅 포인트였다. nftables 백엔드에는 **그대로 존재하지 않고** 별도 테이블과 우선순위 조정이라는 다른 방식으로 대체된다. 관리자가 커스텀 규칙을 넣고 싶다면 자신의 nftables 테이블을 만들고 그 우선순위를 `docker-bridges` 테이블과의 관계 속에서 명시적으로 조정해야 한다.

### 3.3 "같은 포트 게시, 두 백엔드"

**한 줄 요약:** 백엔드가 바뀌어도 포트 게시 동작은 같아야 하며, 규칙이 어디에 어떻게 들어갔는지만 달라진다.

```bash
# iptables 백엔드: nat 테이블의 DOCKER 체인에서 DNAT 규칙 확인
docker run -d -p 18080:80 --name web-iptables nginx:latest
sudo iptables-save | grep -A 5 "DOCKER"

# nftables 백엔드(daemon.json 설정 + 재시작 후): Docker 전용 테이블 확인
docker run -d -p 18080:80 --name web-nftables nginx:latest
sudo nft list table ip docker-bridges
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080    # 200
```

백엔드 확인은 `docker info --format '{{.FirewallBackend}}'`로 한다(필드 이름은 Docker 버전에 따라 다를 수 있어 없으면 `docker info | grep -i firewall`). 설정 변경 후 `sudo journalctl -u docker -n 50 --no-pager | grep -i firewall`로 데몬 재시작 결과를 본다. 원복은 `/etc/docker/daemon.json` 삭제 후 데몬 재시작이다.

---

## 코어 4. 제약을 알고 쓴다 — 실험적, Swarm 불가, macvlan 무관

### 4.1 세 가지 제약

**한 줄 요약:** 실험적이고, Swarm 모드에서는 켤 수 없고, 영향 범위는 브리지 네트워크의 포트 게시 경로다.

| 제약 | 내용 |
|---|---|
| 실험적 상태 | Docker 공식 문서가 "29.0.0에 도입된 nftables 지원은 실험적이며, 구성 옵션·동작·구현이 모두 앞으로 바뀔 수 있다"고 경고한다. `firewall-backend` 플래그 이름, `daemon.json` 스키마, 테이블/체인 구조, 대상 트래픽 경로까지 바뀔 수 있다는 뜻이다. 2026년 9월 현재 프로덕션 전면 도입은 신중해야 하며, 릴리스 노트를 매번 확인하고 검토용/실험용 환경에서 먼저 검증하는 접근이 합리적이다 |
| Swarm 모드 불가 | Swarm 오버레이(ingress 네트워크, 서비스 VIP용 IPVS 연동, 오버레이 간 격리 등)가 의존하는 복잡한 iptables 규칙 집합이 아직 nftables로 이관되지 않았다. 데몬이 Swarm 모드로 동작 중일 때 nftables 백엔드를 켜면 데몬이 거부하며 공식 문서도 "Swarm 모드에서는 nftables를 활성화할 수 없다"고 밝힌다. 즉 현재는 단일 호스트 브리지와 포트 게시 경로 대상이며 멀티호스트 오버레이까지 포함한 완전한 대체재가 아니다 |
| macvlan/ipvlan 무관 | 두 드라이버는 애초에 호스트의 NAT·포트 게시 경로를 거치지 않으므로 iptables든 nftables든 DNAT/필터링 규칙이 개입할 일이 없다. `--firewall-backend`를 바꿔도 동작과 설정은 변하지 않으며, 전환의 영향은 브리지 네트워크의 포트 게시 경로와 그에 의존하는 컨테이너 격리/인바운드 정책에 국한된다 ([10장](10-macvlan-ipvlan-host-none-오버레이.md)) |

### 4.2 IPv6와 방화벽

**한 줄 요약:** nftables 전환은 "규칙을 쓰는 문법과 도구의 통일"이지 "IPv4/IPv6 정책의 자동 통합"이 아니다.

nftables는 `inet` 패밀리로 IPv4/IPv6를 한 테이블에 담을 수 있지만, Docker가 nftables 백엔드로 규칙을 쓴다는 것은 Docker가 생성하는 규칙을 nftables 문법으로 쓴다는 뜻이지 IPv4용과 IPv6용 규칙이 이미 통합되어 있다는 보장이 아니다(위의 `ip docker-bridges`와 `ip6 docker-bridges`가 별개 테이블인 것이 그 예다). IPv6 방화벽 확인법은 [12장](12-IPv6-듀얼스택과-Rootless-네트워킹.md)에서 이어서 본다.

> **[보충]** 쿠버네티스 쪽 규칙 구현(kube-proxy의 iptables/IPVS 등)은 이 장의 범위 밖이며 [17장](../3부-쿠버네티스-네트워크/17-kube-proxy-데이터플레인.md)에서 다룬다.

---

## 실무 적용

### 체크리스트

- [ ] 호스트의 `iptables`가 `iptables-nft`인지 `iptables-legacy`인지 `update-alternatives --display iptables`로 확인한다. 두 구현을 섞지 않는다.
- [ ] Engine 28.0.0이 기본 차단하는 것은 **게시하지 않은** 포트뿐이다. 게시한 포트가 `ufw`/`firewalld` 정책과 어떻게 맞물리는지는 별도로 확인한다(원천은 Docker 규칙이 `FORWARD`에 앞쪽으로 삽입되는 구조를 설명할 뿐 28.0.0이 이를 바꿨다고 하지 않는다).
- [ ] 게시하지 않은 포트로의 직접 라우팅이 필요한 구성이 있다면 포트를 정식 게시한다. `nat-unprotected`는 최후 수단.
- [ ] nftables 백엔드를 검토한다면 테스트 환경에서, 릴리스 노트를 확인하며, `DOCKER-USER`를 쓰던 정책은 별도 테이블 + priority 조정으로 다시 설계한다.
- [ ] Swarm 노드에는 nftables 백엔드를 켜지 않는다(데몬이 거부).
- [ ] macvlan/ipvlan만 쓴다면 방화벽 백엔드 전환의 영향을 받지 않음을 기억한다.
- [ ] 백엔드 확인: `docker info --format '{{.FirewallBackend}}'` 또는 `docker info | grep -i firewall`.

### 시나리오로 확인하기

1. **상황:** 클라우드 VPC의 다른 서버에서 게시하지 않은 컨테이너 포트(`172.x.x.x:6379`)로 직접 접속이 된다. Docker 버전은 27.x다.
   **질문:** 왜 열려 있고, 어떻게 막나?

   <details markdown="1"><summary>답 확인</summary>

   Engine 28 이전에는 Docker가 관대한 기본 iptables 정책(ACCEPT)에 기대 컨테이너 네트워크로 향하는 트래픽을 별도로 필터링하지 않아, 경로(VPC 라우팅)만 있으면 게시하지 않은 포트도 컨테이너 IP로 직접 접근되었다. Engine 28.0.0부터는 `DOCKER` 체인에서 게시하지 않은 포트 인바운드를 기본 차단한다. 이전 동작이 필요하면 포트를 게시하거나 `gateway_mode_ipv4/ipv6=nat-unprotected`로 복원할 수 있지만 보호되지 않는 상태가 된다. → 코어 2

   </details>

2. **상황:** `ufw deny`를 걸었는데 컨테이너로 향하는 트래픽이 통과한다.
   **질문:** 의심 부품과 근본 원인은?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너로 향하는 트래픽 상당수는 `INPUT`이 아니라 `FORWARD` 체인을 통과하는데, Docker가 `FORWARD` 체인에 `DOCKER` 체인 점프 규칙을 다른 규칙보다 앞쪽에 삽입하고 `ufw`/`firewalld`는 `INPUT`이나 자신의 관리 체인에 규칙을 넣기 때문이다. 같은 netfilter 체인 공간을 조율 없이 나눠 쓰는 구조적 문제다. nftables 백엔드는 Docker 전용 테이블(`docker-bridges`)로 이 충돌 가능성을 줄이지만 실험적이고 Swarm에서는 못 쓴다. → 코어 2 (2.1), 코어 3

   </details>

3. **상황:** Swarm을 쓰는 노드의 `daemon.json`에 `"firewall-backend": "nftables"`를 넣고 재시작했더니 데몬이 시작하지 않는다.
   **질문:** 원인과 대응은?

   <details markdown="1"><summary>답 확인</summary>

   Swarm 모드의 오버레이 규칙 집합이 아직 nftables로 이관되지 않아, 데몬이 Swarm 모드로 동작 중일 때 nftables 백엔드를 켜면 데몬이 거부한다. `journalctl -u docker -n 50 --no-pager | grep -i firewall`로 로그를 확인하고 설정을 원복하거나(원천 실습은 `docker swarm leave --force`로 Swarm을 끄는 방법을 안내) Swarm 오버레이가 nftables로 이관되는 후속 릴리스를 기다린다. → 코어 4

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

```
코어 1 iptables 한계 3: ① ____ 탐색 ② 도구 ____ (iptables/ip6tables/____/____) ③ legacy/nft ____
  호환 레이어: iptables → ________ (nftables 규칙으로 변환)   순수 구현: ________
  전환 도구: update-________   혼재 문제: 서로의 규칙을 ____
  nftables 목표 3: 단일 ________ (inet 패밀리) / 커널 내 ____ / ____ 와 map

코어 2 Engine __.0.0   허점 ①: 기본 정책 ____ 에 기대 게시하지 않은 포트 직접 접근
  허점 ②: Docker 규칙이 ____ 체인 앞쪽 vs ufw/firewalld 는 ____ 체인
  변경: ____ 체인에서 게시하지 않은 포트 인바운드 기본 ____  (Docker ______ 는 대상 아님)
  복원: gateway_mode_ipv4/ipv6 = ______________

코어 3 Engine __.0.0, 상태 ________   활성화: dockerd --____-________=nftables / daemon.json
  전용 테이블: ip ________ , ip6 ________   DNS 규칙은 컨테이너 ____ 안에도
  ________ 체인은 그대로 없음 → 별도 ____ + ________ 조정

코어 4 제약 3: ____ / ____ 모드 불가(데몬 거부) / ________ 와 무관 (영향 = 브리지 ____ 경로)
```

### 2. 인출 질문

1. `iptables-legacy`와 `iptables-nft`가 한 시스템에 섞이면 무엇이 문제인가?

   <details markdown="1"><summary>답 확인</summary>

   두 구현이 커널에 규칙을 적재하는 내부 표현 방식이 달라 서로의 규칙을 인식하지 못한다. 그 결과 방화벽 정책이 꼬여 있는데도 어느 쪽에서도 원인을 알아채기 어렵다. → 코어 1 (1.1)

   </details>

2. nftables가 iptables의 선형 탐색 문제를 어떻게 완화하는가?

   <details markdown="1"><summary>답 확인</summary>

   조건을 개별 규칙 N개 대신 하나의 set 자료구조로 표현할 수 있고, set은 커널 내부에서 해시 테이블이나 트리 구조로 관리되어 규칙 수가 늘어도 순회 비용이 선형으로 늘지 않는다. 규칙을 컴파일해 커널 내 바이트코드 VM에 내려보내는 구조도 더 유연한 최적화를 가능하게 한다. → 코어 1 (1.2)

   </details>

3. nftables에서 같은 훅에 여러 체인이 걸릴 때 평가 순서는 어떻게 정해지는가?

   <details markdown="1"><summary>답 확인</summary>

   체인 선언 시 명시하는 priority 숫자가 작을수록 먼저 평가된다. iptables에서는 표준 체인과 순서가 프레임워크에 고정되어 암묵적이었지만 nftables는 사용자가 훅과 priority를 명시한다. → 코어 1 (1.3)

   </details>

4. Engine 28 이전에 게시하지 않은 포트가 열려 있을 수 있었던 이유는?

   <details markdown="1"><summary>답 확인</summary>

   많은 배포판의 기본 iptables 정책이 `ACCEPT`이고 Docker는 컨테이너 네트워크로 향하는 트래픽을 별도로 필터링하지 않고 이 관대한 정책에 의존했다. 호스트가 컨테이너 사설 대역으로 라우팅할 수 있어, 경로가 확보되면 컨테이너 IP로 직접 접근이 가능했다. → 코어 2 (2.1)

   </details>

5. `ufw`로 막았는데 컨테이너 트래픽이 통과하는 구조적 원인은?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너로 향하는 트래픽은 대개 `FORWARD` 체인을 통과하는데, Docker는 `FORWARD`에 `DOCKER` 체인 점프 규칙을 앞쪽에 삽입하고 `ufw`/`firewalld`는 `INPUT`이나 자신의 관리 체인에 규칙을 둔다. 같은 체인 공간을 조율 없이 나눠 써 평가 순서가 관리자 의도와 달라진다. → 코어 2 (2.1)

   </details>

6. Engine 28.0.0의 변경 범위와 이전 동작 복원 방법은?

   <details markdown="1"><summary>답 확인</summary>

   `-p`로 게시하지 않은 컨테이너 포트로의 직접 라우팅 접근을 `DOCKER` 체인에서 기본 차단한다. Linux의 iptables 기반 Docker Engine이 대상이고 Docker Desktop은 아니다. 복원은 포트를 정식 게시하거나 `gateway_mode_ipv4`/`gateway_mode_ipv6`를 `nat-unprotected`로 설정하는 것이며 후자는 보호되지 않는 상태로 돌아가므로 권장되지 않는다. → 코어 2 (2.2)

   </details>

7. nftables 백엔드를 켜는 두 방법과 Docker가 만드는 전용 테이블 이름은?

   <details markdown="1"><summary>답 확인</summary>

   `dockerd --firewall-backend=nftables` 또는 `daemon.json`의 `"firewall-backend": "nftables"`(재시작 필요). 전용 테이블은 `ip docker-bridges`, `ip6 docker-bridges`이며 DNS 규칙은 컨테이너 자신의 네트워크 네임스페이스 안에도 별도로 생성된다. → 코어 3 (3.1, 3.2)

   </details>

8. nftables 백엔드에서 `DOCKER-USER` 대신 무엇을 하는가?

   <details markdown="1"><summary>답 확인</summary>

   `DOCKER-USER` 체인은 그대로 존재하지 않는다. 관리자가 자신의 nftables 테이블을 만들고 그 우선순위를 Docker의 `docker-bridges` 테이블과의 관계 속에서 명시적으로 조정한다. → 코어 3 (3.2)

   </details>

9. nftables 백엔드의 제약 세 가지는?

   <details markdown="1"><summary>답 확인</summary>

   (1) 실험적 — 구성·동작·구현이 바뀔 수 있다. (2) Swarm 모드에서는 활성화 불가(데몬이 거부). (3) macvlan/ipvlan은 이 전환과 무관하며 영향은 브리지 네트워크의 포트 게시 경로에 국한된다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** Docker 규칙과 ufw 규칙의 충돌 ≈ 두 스레드가 락 없이 같은 컨테이너(체인 목록)에 삽입/삭제. ⚠️ 이 유추는 "삽입 순서에 따라 결과가 달라진다"는 점만 같고, 실제 문제는 스레드 안전성이 아니라 체인 평가 순서와 `INPUT` 대 `FORWARD` 경로 차이다.
- **C++ 유추:** nftables 전용 테이블 ≈ 전역 네임스페이스 대신 `namespace docker_bridges { }`로 이름 충돌을 피하는 것. ⚠️ 이름만 분리되는 것이 아니라 훅·priority도 스스로 선언하고, 평가 순서는 관리자가 따로 조정해야 한다.
- **비유:** 건물 출입 통제. 옛 방식 = 경비실 하나의 출입 명부 한 장에 입주민 관리실과 택배 업체가 서로 모르게 줄을 끼워 넣음. 새 방식 = 업체별 별도 명부(테이블)와 확인 순서표(priority). ⚠️ 비유가 깨지는 지점: 새 방식도 "명부 간 확인 순서"는 사람이 정해야 하고, Docker 전용 명부는 아직 시험 운영(실험적)이며 Swarm 단지(오버레이)는 옛 명부를 쓴다.
- **묶음(3의 법칙):** iptables 한계 3(선형·파편화·혼재) / nftables 목표 3(단일·VM·set/map) / 제약 3(실험적·Swarm 불가·macvlan 무관).
- **대칭·순서:** 시간 순서 28.0.0(iptables 위에서 봉합: 게시하지 않은 포트 차단) → 29.0.0(근본 재설계: 전용 테이블). 두 허점의 대칭: 직접 라우팅(경로 문제) ↔ `FORWARD` 우선순위(순서 문제).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`ufw`로 막았는데 Docker 컨테이너가 열려 있는 이유"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "`INPUT`과 `FORWARD`의 차이"를 "서버 프로세스로 들어오는 패킷 vs 서버를 지나쳐 다른 곳으로 가는 패킷"으로 설명해 보세요.
- **랜덤 논리 게임:** A "지금 당장 nftables 백엔드로 전환하자" vs B "iptables 호환 레이어를 유지하자" — 번갈아 변호해 보세요. (실험적 경고, Swarm 불가, `DOCKER-USER` 대체, 충돌 가능성 감소를 근거로)
- **AI 역할 반전:** "내가 Docker 28과 29의 방화벽 변화를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/16_방화벽_백엔드의_전환.md (16.1 iptables의 한계, 16.2 Docker Engine 28, 16.3 Docker Engine 29 실험적 네이티브 nftables 백엔드, 16.4와 실습); docker-fundamental/15_DNS와_서비스_디스커버리_포트_매핑의_내부_동작.md (15.1의 컨테이너 netns 내부 DNAT 설명 참조); docker-fundamental/18_IPv6와_2026년_현재의_네트워크_스택.md (18.4 IPv6 환경의 방화벽)*
