---
title: "2장. 소켓·TCP·포트·DNS 기초"
parent: "1부. 리눅스 네트워크 기초"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 2
---

# 2장. 소켓·TCP·포트·DNS 기초

> **🎮 게임 서버 개발자에게** — 이 장의 내용은 이미 손에 익은 것이다. `socket()`/`bind()`/`listen()`/`accept()`, TCP 스트림, `TIME_WAIT`, `getaddrinfo()`. 그런데 컨테이너·쿠버네티스에서 일어나는 거의 모든 통신은 **결국 이 소켓 하나**로 끝난다. NAT도 브리지도 Service도 소켓 앞뒤에서 주소를 바꿔 줄 뿐, 앱이 보는 것은 여전히 `fd`다. 결정적으로 달라지는 점은 두 가지다. 내 앱의 `bind`/`listen` 범위가 **컨테이너 자신의 네트워크 네임스페이스 안으로 한정**된다는 것, 그리고 `connect(이름)`의 **이름을 풀어 주는 서버가 호스트 DNS가 아니라 컨테이너 `/etc/resolv.conf`가 가리키는 곳**이라는 것이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 컨테이너 안 서버가 `127.0.0.1`에만 `listen`해서 Pod IP나 포트 게시로는 접속이 안 된다.
> - 서버를 재시작하면 `bind: Address already in use`가 나거나, 짧은 연결을 폭발적으로 만드는 클라이언트가 에페머럴 포트를 다 쓴다.
> - 컨테이너·Pod에서 DNS가 느리거나 이벤트 루프가 멈춘다(`getaddrinfo`는 블로킹이다).

## 코어 — 이것만은 100%

> **한 문장:** 소켓은 fd이고 TCP 핸드셰이크는 커널이 하며, TCP는 메시지 경계 없는 바이트 스트림이고, 연결을 먼저 닫은 쪽의 `TIME_WAIT`·에페머럴 포트 범위가 포트 재사용과 고갈을 결정하며, 이름 해석(`getaddrinfo`)은 동기 블로킹이라 컨테이너에서는 `resolv.conf`가 누구를 가리키는지가 장애 원인이 된다.

1. **소켓은 fd이고 핸드셰이크는 커널이 한다** — `accept()`는 이미 완성된 연결을 큐에서 꺼낼 뿐이어서, 서버가 `accept`를 안 불러도 클라이언트의 `connect`는 성공한다. 큐(backlog)가 차면 그때부터 SYN이 무시된다.
2. **TCP는 바이트 스트림이다** — 보낸 쪽의 `write` 횟수와 받는 쪽의 `read` 횟수는 무관하다. 메시지 경계는 애플리케이션이 만든다(길이 접두어·구분자·고정 길이).
3. **포트는 한정된 자원이고 TIME_WAIT가 점유한다** — 먼저 닫은 쪽이 `TIME_WAIT`에 머물고, 서버는 `SO_REUSEADDR`로 재바인드하며, 클라이언트는 에페머럴 포트(기본 32768&#126;60999)가 고갈되지 않게 커넥션 풀·keep-alive를 쓴다.
4. **DNS 조회는 동기 블로킹이다** — `getaddrinfo()`는 `/etc/hosts`와 `/etc/resolv.conf`의 네임서버를 보고 응답을 기다린다. 이벤트 루프 안에서 부르면 모든 커넥션이 멈추고, 컨테이너의 DNS 지연은 흔한 장애 원인이다.

**이 장의 학습 목표**

- 서버 소켓의 생애와 `accept` 큐 오버플로를 설명하고 `ss -ltn`으로 확인한다.
- TCP 스트림의 메시지 경계·부분 읽기/쓰기·EOF·RST 규칙을 안다.
- `TIME_WAIT`, `SO_REUSEADDR`, `SO_REUSEPORT`, 에페머럴 포트 고갈의 차이를 구분한다.
- `getaddrinfo()`가 무엇을 읽고 어떻게 블로킹되는지, 컨테이너에서 어떻게 달라지는지 안다.
- 컨테이너 네트워킹의 이후 장(NAT, conntrack, DNS)이 이 소켓 모델 위에서 어떻게 이어지는지 연결한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `socket()`이 돌려주는 `int fd` | 소켓은 파일 디스크립터 | `read`/`write`/`close`/`epoll`이 파일처럼 동작한다 | 컨테이너 안의 fd가 가리키는 소켓은 **그 컨테이너의 네트워크 네임스페이스에 속한다**(3장). 같은 `0.0.0.0:80`을 컨테이너마다 따로 바인딩할 수 있다 |
| `listen(fd, backlog)` | accept 큐와 `somaxconn` 상한 | 핸드셰이크 완료 연결이 큐에 쌓인다 | 컨테이너에서 `somaxconn`이 어느 값인지는 이 책의 원천에 없다. 운영 환경에서 `ss -ltn`으로 직접 확인한다 |
| 수신 버퍼에서 `read`한 만큼이 곧 메시지 | 바이트 스트림 | 순서가 보장되고 신뢰성이 있다 | 로컬 테스트에서 우연히 1:1로 맞다가 운영(패킷이 나뉘거나 합쳐지는 환경)에서 깨진다. 컨테이너로 옮긴다고 이 성질이 바뀌지는 않는다(스트림 자체는 TCP의 성질이다) |
| 서버 재시작 시 `EADDRINUSE` | `TIME_WAIT`와 `SO_REUSEADDR` | `bind` 전에 옵션을 켜면 된다 | 소켓과 `/proc/net` 통계는 네임스페이스별로 독립 유지되므로, 어느 네임스페이스에서 `ss`를 실행하느냐에 따라 보이는 소켓이 달라진다(`nsenter --target $PID --net`, 3장) |
| `gethostbyname`/`getaddrinfo`로 서버 이름 해석 | `/etc/hosts` → `/etc/resolv.conf`의 네임서버 | 동기 블로킹이고 타임아웃은 기본 5초 × 재시도다 | 컨테이너의 `resolv.conf`는 호스트와 다르다(Docker 사용자 정의 네트워크 `127.0.0.11`, 쿠버네티스는 kube-dns ClusterIP와 `ndots:5`) |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 서버가 `listen` 후 `accept`를 한 번도 안 부르는데 클라이언트의 `connect`는 성공할까?
> 2. 클라이언트가 `write("HELLO")`, `write("WORLD")`를 했을 때 서버의 `read`는 몇 번에 무엇을 받을까?
> 3. 서버를 재시작하면 왜 `Address already in use`가 날까? 해결 옵션은?
> 4. 초당 500개의 짧은 연결을 만드는 클라이언트는 왜 1분 안에 막힐까?
> 5. 컨테이너 안에서 외부 도메인 DNS가 유독 느린 이유로 무엇을 의심해야 할까?
>
> **처리법:** 🛠 실습 `ss -tlnp`, `ss -ltn`, `ss -tan state time-wait | wc -l`, `cat /proc/sys/net/ipv4/ip_local_port_range` → 바로 실행(Linux 환경) · 🗺 관계도 서버 생애 다이어그램(코어 1)을 백지에 다시 그리기 · 📦 카드로 `net.core.somaxconn`(기본 4096), `TIME_WAIT` 60초, 에페머럴 32768&#126;60999, `SO_REUSEADDR` vs `SO_REUSEPORT`, `ndots` · 유추 비판 A "소켓 모델은 컨테이너에서도 그대로"가 어디서 깨지는지 ⚠️ 칸 읽고 짚어 보기

---

## 코어 1. 소켓은 fd이고 핸드셰이크는 커널이 한다

### 1.1 소켓 = 파일 디스크립터

**한 줄 요약:** `socket()`의 반환값은 그냥 fd이고, 그래서 `read`/`write`/`close`/`epoll`이 파일과 똑같이 동작한다.

```c
int fd = socket(AF_INET, SOCK_STREAM, 0);   // TCP 소켓. 반환값은 그냥 fd
```

`send`/`recv`는 플래그를 받는 소켓 전용 확장일 뿐이다. 이 통일성 덕분에 이벤트 루프 하나가 소켓, 파이프, 타이머(`timerfd`), 시그널(`signalfd`)을 한꺼번에 기다릴 수 있다.

### 1.2 TCP 서버의 생애

**한 줄 요약:** 핸드셰이크는 커널이 하고 `accept()`는 완성된 연결을 큐에서 꺼내는 것뿐이다.

```
서버                                       클라이언트
socket()                                   socket()
bind(0.0.0.0:8080)
listen(backlog)          ◀── SYN ───────── connect()
  [커널이 3-way handshake 완료 → accept 큐에 넣음]
accept() → 새 fd         ─── SYN+ACK ──▶
                         ◀── ACK ────────
read(new_fd)             ◀── 데이터 ─────  write()
write(new_fd)            ─── 데이터 ────▶  read()
close(new_fd)            ─── FIN ───────▶
                         ◀── FIN ────────  close()
```

서버 프로세스가 `accept`를 안 부르고 있어도 클라이언트의 `connect`는 성공한다. 큐(backlog)가 꽉 차면 그때부터 SYN이 무시되고 클라이언트는 재전송 후 타임아웃을 겪는다.

- `listen(fd, backlog)`의 backlog는 `net.core.somaxconn`(기본 4096)으로 상한이 잡힌다.
- 트래픽 스파이크에서 `accept` 큐 오버플로가 나면 `ss -ltn`의 Recv-Q 컬럼과 `nstat -az TcpExtListenOverflows`로 확인한다.

```bash
ss -tlnp                        # 리스닝 소켓과 프로세스
ss -ltn                         # Recv-Q = accept 큐 현재 크기, Send-Q = backlog
nstat -az | grep -E 'ListenOverflows|ListenDrops|RetransSegs'
```

### 1.3 이 모델이 컨테이너 네트워크의 "최종 단위"인 이유

**한 줄 요약:** NAT·브리지·Service는 소켓 앞뒤에서 주소를 바꿔 줄 뿐이고, 앱이 만지는 것은 언제나 이 fd 하나다.

[1장](../0부-큰-그림/01-패킷-한-개의-여정.md)의 지도에서 패킷은 여러 경계를 지나지만, 양 끝에서는 `connect()`/`accept()`로 만든 평범한 TCP 연결이다. 예를 들어 [5장](05-netfilter-iptables-NAT-conntrack.md)에서 볼 conntrack 항목은 `src=… dst=… sport=… dport=…` 형태로 연결을 기억한다.

```
tcp 6 431999 ESTABLISHED src=10.244.1.9 dst=10.96.142.88 sport=34567 dport=80 \
    src=10.244.1.3 dst=10.244.1.9 sport=8080 dport=34567 [ASSURED]
```

> **[보충]** 이 한 줄은 TCP 연결이 출발지 IP·출발지 포트·목적지 IP·목적지 포트 네 값으로 식별된다는 점을 보여 준다. 위 줄은 `Kubernetes_Internals_Network_Guide` 15.1절의 conntrack 출력 예시이며, "연결이 네 값으로 식별된다"는 일반적 설명은 원천에 명시되어 있지 않아 이 책이 덧붙인 입문 설명이다. 두 번째 `src=`/`dst=` 쌍은 응답 방향(역변환 정보)이다.

---

## 코어 2. TCP는 바이트 스트림이다

### 2.1 메시지 경계는 없다

**한 줄 요약:** 보낸 쪽 `write` 횟수와 받는 쪽 `read` 횟수는 무관하므로 경계는 애플리케이션이 만들어야 한다.

가장 흔한 초보 버그다.

```c
// 클라이언트
write(fd, "HELLO", 5);
write(fd, "WORLD", 5);

// 서버
n = read(fd, buf, 1024);   // "HELLOWORLD" 10바이트가 한 번에 올 수 있다.
                           // "HEL" 3바이트만 올 수도 있다. "HELLOWOR"이 올 수도 있다.
```

로컬에서 테스트할 땐 우연히 1:1로 맞아서 잘 되다가, 운영 환경에서 패킷이 나뉘거나 합쳐지면 깨진다. 메시지 경계를 만드는 세 가지 방법은 다음과 같다.

1. **길이 접두어**: `[4바이트 길이][본문]`. 가장 일반적(gRPC, 대부분의 바이너리 프로토콜).
2. **구분자**: `\r\n`(HTTP 헤더, Redis 프로토콜). 본문에 구분자가 나오면 이스케이프가 필요.
3. **고정 길이**: 단순하지만 유연성 없음.

### 2.2 부분 읽기·부분 쓰기·EOF·RST

**한 줄 요약:** `read`가 1바이트만 반환해도 정상이고, `0`은 상대가 닫았다는 EOF, `-1`+`ECONNRESET`은 비정상 종료(RST)다.

- `read`가 요청한 바이트를 다 채워 줄 때까지 **루프**해야 한다. `write`도 요청한 양보다 적게 쓰고 반환할 수 있다(논블로킹 소켓에서 특히).
- `read`가 **0을 반환**하면 상대가 연결을 닫았다는 뜻(EOF). -1과 `ECONNRESET`이면 상대가 비정상 종료(RST)했다는 뜻이다.

### 2.3 알아야 할 소켓 옵션과 커널 동작

**한 줄 요약:** 게임·RPC 서버라면 `TCP_NODELAY`, 장기 연결이라면 keepalive, 그리고 `SIGPIPE` 무시를 기본으로 챙긴다.

| 옵션/동작 | 의미 | 언제 |
|---|---|---|
| `TCP_NODELAY` | Nagle 알고리즘 끄기. 작은 패킷을 모으지 않고 즉시 전송 | 요청-응답 지연이 중요한 RPC, 게임. 대부분의 RPC 라이브러리가 기본으로 켠다 |
| `SO_KEEPALIVE` + `TCP_KEEPIDLE/INTVL/CNT` | 유휴 연결에 주기적 probe. 상대가 죽었으면 감지 | 기본은 2시간 후 시작. 장기 연결은 반드시 짧게 조정(예: 60초) |
| `SO_RCVBUF`/`SO_SNDBUF` | 커널 소켓 버퍼 크기 | 보통 자동 조정(`tcp_rmem`/`tcp_wmem`)에 맡기는 게 낫다 |
| `SO_LINGER` | `close` 시 미전송 데이터 처리 | 대부분 건드리지 말 것. 0으로 설정하면 RST 전송 |
| `TCP_CORK` | 데이터를 모아서 한 번에 | 헤더+파일 본문을 하나의 패킷으로 (`sendfile`과 함께) |
| `TCP_FASTOPEN` | 핸드셰이크와 함께 데이터 전송 | 짧은 연결 반복 시 |

- **half-open 연결**: 상대 머신의 케이블이 뽑히거나 전원이 꺼지면 FIN도 RST도 오지 않아 내 소켓은 영원히 `ESTABLISHED`로 남는다. 애플리케이션 레벨 heartbeat나 keepalive 없이는 죽은 연결을 감지할 수 없다.
- **`SIGPIPE`**: 상대가 닫은 소켓에 `write`하면 `EPIPE` 대신 `SIGPIPE`가 오고 기본 동작은 프로세스 종료다. 서버가 로그 한 줄 없이 사라지므로 `signal(SIGPIPE, SIG_IGN)`을 하거나 `send(..., MSG_NOSIGNAL)`을 쓴다.

---

## 코어 3. 포트는 한정된 자원이고 TIME_WAIT가 점유한다

### 3.1 TIME_WAIT와 "Address already in use"

**한 줄 요약:** 연결을 먼저 닫은 쪽이 `TIME_WAIT`(리눅스 60초)에 머물며 그 포트의 `bind`를 막고, `SO_REUSEADDR`를 `bind` 전에 켜면 해결된다.

TCP 연결을 **먼저 닫은 쪽**은 마지막 ACK를 보낸 후 `TIME_WAIT` 상태로 2×MSL(리눅스: 60초) 동안 머문다. 늦게 도착하는 패킷이 새 연결과 섞이지 않게 하기 위해서다. 서버가 커넥션을 먼저 닫는 구조(HTTP 서버가 대부분 그렇다)라면 서버 쪽에 `TIME_WAIT` 소켓이 쌓이고, 그 소켓이 점유한 포트에는 `bind`가 안 된다. 모든 서버 코드는 `bind` 전에 `SO_REUSEADDR`를 켜는 것이 기본이다.

```c
int on = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof(on));
bind(fd, ...);
```

### 3.2 에페머럴 포트 고갈

**한 줄 요약:** `TIME_WAIT` 수만 개는 정상이고, 진짜 문제는 클라이언트의 에페머럴 포트(기본 32768&#126;60999, 약 28,000개) 고갈이며 해결은 커넥션 풀/keep-alive다.

- `TIME_WAIT` 소켓 수만 개는 **정상**이다. 메모리를 조금 쓸 뿐이다.
- 초당 500개의 짧은 연결을 만드는 클라이언트(예: DB에 커넥션 풀 없이 매번 연결)는 60초 안에 포트를 다 쓴다.
- 해결은 **커넥션 풀/keep-alive**다. `net.ipv4.tcp_tw_reuse=1`도 도움이 된다.

```bash
ss -tan state time-wait | wc -l           # TIME_WAIT 수
cat /proc/sys/net/ipv4/ip_local_port_range
```

### 3.3 SO_REUSEADDR와 SO_REUSEPORT는 다르다

**한 줄 요약:** `SO_REUSEADDR`는 `TIME_WAIT` 중에도 재바인드, `SO_REUSEPORT`는 여러 프로세스/스레드가 같은 포트에 각자 `bind`하고 커널이 연결을 분배한다.

| 옵션 | 하는 일 | 용도 |
|---|---|---|
| `SO_REUSEADDR` | `bind` 전에 켜서 `TIME_WAIT`로 점유된 포트에도 바인딩 | 서버 재시작 (모든 서버 코드의 기본) |
| `SO_REUSEPORT` | 여러 프로세스/스레드가 **같은 포트에 각자 `bind`**, 커널이 연결 분배 | 멀티프로세스 서버의 accept 경합 제거(nginx `reuseport`) |

### 3.4 포트 공간은 네임스페이스 단위다

**한 줄 요약:** 네트워크 네임스페이스가 포트 바인딩 공간을 분리하므로 컨테이너·Pod마다 같은 포트를 독립적으로 쓸 수 있다.

네트워크 네임스페이스는 인터페이스, 라우팅 테이블, iptables/nftables 규칙, **포트 바인딩 공간**을 분리하고, 그 덕분에 컨테이너마다 독립적으로 `0.0.0.0:80` 같은 포트를 바인딩할 수 있다([3장](03-네트워크-네임스페이스.md)). 쿠버네티스의 IP-per-Pod 모델에서는 모든 nginx가 80을 쓸 수 있어 포트 충돌 자체가 없다([13장](../3부-쿠버네티스-네트워크/13-쿠버네티스-네트워크-모델과-Pod-네트워크.md)). 반대로 `hostNetwork: true`인 Pod는 노드의 네트워크 네임스페이스를 공유하므로 포트도 노드와 공유한다.

> **[보충]** 앱이 `127.0.0.1`에만 `listen`하면 Pod IP를 통한 접근이 실패할 수 있다는 점은 `kubernetes-qustion-book` 심화 6장의 장애 분해 항목에 근거한다("앱이 Pod 안에서 실제 주소와 포트에 listen하는가?"). 컨테이너 안에서 `bind(0.0.0.0)`과 `bind(127.0.0.1)`을 구분해야 하는 이유는 C++ 서버 경험의 `bind` 주소 선택과 같다.

---

## 코어 4. DNS 조회는 동기 블로킹이다

### 4.1 getaddrinfo가 하는 일

**한 줄 요약:** `/etc/hosts`를 읽고, `/etc/resolv.conf`의 네임서버에 UDP로 묻고, 응답을 기다린다. 동기 블로킹이고 타임아웃은 기본 5초 × 재시도다.

이벤트 루프 안에서 `getaddrinfo()`를 부르면 모든 커넥션이 5초 멈춘다. 대안은 세 가지다.

1. 별도 스레드에서 조회한다(libuv 방식).
2. 비동기 리졸버(c-ares)를 쓴다.
3. 결과를 캐시한다.

### 4.2 컨테이너에서 달라지는 것: resolv.conf가 누구를 가리키는가

**한 줄 요약:** 컨테이너의 `/etc/resolv.conf`는 호스트와 다르며, Docker 사용자 정의 네트워크는 `127.0.0.11`(dockerd 내장 DNS), 쿠버네티스는 kube-dns Service의 ClusterIP와 `ndots:5`를 쓴다.

```
# Docker 사용자 정의 브리지 컨테이너
nameserver 127.0.0.11
options ndots:0

# 쿠버네티스 Pod
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

쿠버네티스에서 `ndots:5`의 기본값 때문에 `www.example.com`(점 2개)처럼 점이 `ndots`보다 적은 이름은 절대 이름으로 곧바로 조회되지 않고 `search` 목록의 접미사를 먼저 하나씩 붙여 시도한다. 외부 도메인을 조회할 때마다 실패가 확정된 쿼리 3개를 먼저 보내고서야 정답에 도달하므로, 컨테이너에서 DNS가 느린 것은 흔한 장애 원인(`ndots:5` 문제)이다. Docker의 내장 DNS는 [9장](../2부-Docker-네트워크/09-Docker-DNS와-서비스-디스커버리.md), 쿠버네티스 DNS는 [18장](../3부-쿠버네티스-네트워크/18-DNS와-서비스-디스커버리.md)에서 다룬다.

---

## 실무 적용

### 체크리스트

원천(Linux 6.12 체크리스트)의 항목을 컨테이너 환경 관점으로 묶었다.

- [ ] `read`/`write`가 요청한 양보다 적게 처리하고 반환할 수 있음을 코드가 다루는가? 메시지 경계를 프로토콜로 정했는가?
- [ ] 리스닝 소켓에 `SO_REUSEADDR`를 켰는가?
- [ ] `SIGPIPE`를 무시하거나 `MSG_NOSIGNAL`을 쓰는가?
- [ ] 짧은 연결을 반복하는 클라이언트 코드가 있다면 커넥션 풀/keep-alive로 바꿨는가?
- [ ] 장기 연결에 keepalive나 애플리케이션 heartbeat가 있는가? 타임아웃 없는 `read`가 있는가?
- [ ] 이벤트 루프 안에서 DNS 조회, 파일 I/O, 동기 DB 호출을 하고 있지 않은가?
- [ ] Edge-triggered epoll을 쓴다면 `EAGAIN`까지 읽는가?
- [ ] `RLIMIT_NOFILE`과 `somaxconn`을 예상 동시 연결 수에 맞게 올렸는가?
- [ ] 컨테이너 안 서버가 외부에서 접근되어야 한다면 `0.0.0.0`에 `listen`하는가?

### 시나리오로 확인하기

1. **상황:** 트래픽 스파이크 때 클라이언트들이 접속 타임아웃을 겪는다. 서버 프로세스는 살아 있고 CPU는 한가하다.
   **질문:** 어디를 의심하고 무엇으로 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   `accept` 큐(backlog) 오버플로다. 큐가 꽉 차면 SYN이 무시되어 클라이언트는 재전송 후 타임아웃을 겪는다. `ss -ltn`의 Recv-Q(현재 accept 큐 크기)와 Send-Q(backlog), `nstat -az TcpExtListenOverflows`로 확인하고, backlog 상한인 `net.core.somaxconn`과 `accept` 속도를 점검한다. → 코어 1 (1.2)

   </details>

2. **상황:** 배치 작업 컨테이너가 DB에 커넥션 풀 없이 매번 연결하는데, 시간이 지나면 새 연결이 실패한다. 서버 쪽 `TIME_WAIT`는 문제가 아닌 것으로 보인다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   클라이언트 쪽 에페머럴 포트(기본 32768&#126;60999, 약 28,000개) 고갈이다. 초당 500개 수준의 짧은 연결이면 `TIME_WAIT` 60초 동안 포트를 다 쓴다. `ss -tan state time-wait | wc -l`과 `ip_local_port_range`로 확인하고, 해결은 커넥션 풀/keep-alive이며 `net.ipv4.tcp_tw_reuse=1`도 도움이 된다. → 코어 3 (3.2)

   </details>

3. **상황:** 쿠버네티스 Pod 안 서버에서 외부 API(`api.example.com`) 호출 지연이 크고, 이벤트 루프가 가끔 멈춘다.
   **질문:** 두 가지 의심 부품은?

   <details markdown="1"><summary>답 확인</summary>

   첫째, 이벤트 루프 안에서 부르는 동기 블로킹 `getaddrinfo()`(기본 5초 × 재시도). 별도 스레드·비동기 리졸버·캐시로 옮긴다. 둘째, Pod `resolv.conf`의 `ndots:5`와 `search` 목록 때문에 외부 도메인 조회마다 실패 쿼리가 먼저 나가는 문제다. → 코어 4 (4.1, 4.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1 서버 생애: socket → ____ → ____ → ____ (큐에서 꺼냄)
  핸드셰이크는 ____ 이 한다. 큐가 차면 ____ 이 무시된다.
  backlog 상한: net.core.____ (기본 ____)   확인: ss -ltn → Recv-Q = ____ , Send-Q = ____

코어 2 TCP = ____ 스트림, 메시지 경계 만드는 법 3: ____ / ____ / ____
  read == 0 → ____ ,  -1 + ECONNRESET → ____ ,  닫힌 소켓에 write → ____ 시그널(기본 종료)

코어 3 TIME_WAIT = 먼저 ____ 쪽, ____ 초 / 해결: ____ (bind 전)
  에페머럴 포트: 기본 ____ 부터 ____ 까지 (약 28,000개) / 해결: ____ / ____
  SO_REUSEPORT = 여러 프로세스가 ____ 에 각자 bind
  포트 바인딩 공간은 ____ 네임스페이스 단위

코어 4 getaddrinfo: ____ → ____ 의 네임서버(UDP) / 동기 ____ / 기본 타임아웃 __초 × 재시도
  Docker 사용자 정의 네트워크: nameserver ____ , ndots:__
  쿠버네티스 Pod: nameserver = ____ Service ClusterIP, ndots:__
```

### 2. 인출 질문

1. 서버가 `accept`를 안 불러도 클라이언트의 `connect`는 왜 성공하는가?

   <details markdown="1"><summary>답 확인</summary>

   핸드셰이크는 커널이 하고, 완성된 연결은 accept 큐에 들어간다. `accept()`는 그 큐에서 꺼낼 뿐이다. 큐(backlog)가 꽉 차면 그때부터 SYN이 무시되고 클라이언트는 재전송 후 타임아웃을 겪는다. → 코어 1

   </details>

2. `ss -ltn`에서 Recv-Q와 Send-Q는 각각 무엇을 뜻하는가?

   <details markdown="1"><summary>답 확인</summary>

   리스닝 소켓에서 Recv-Q는 accept 큐의 현재 크기, Send-Q는 backlog이다. 오버플로는 `nstat -az TcpExtListenOverflows`로도 확인한다. → 코어 1 (1.2)

   </details>

3. 클라이언트가 `write("HELLO")`, `write("WORLD")`를 했을 때 서버 `read` 결과로 가능한 것은?

   <details markdown="1"><summary>답 확인</summary>

   "HELLOWORLD" 10바이트가 한 번에 올 수도, "HEL" 3바이트만 올 수도, "HELLOWOR"이 올 수도 있다. TCP는 바이트 스트림이라 write 횟수와 read 횟수가 무관하다. 길이 접두어·구분자·고정 길이로 경계를 만들고, 요청한 바이트를 다 채울 때까지 루프한다. → 코어 2

   </details>

4. `read`가 0을 반환하는 경우와 -1/`ECONNRESET`의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   0은 상대가 연결을 닫았다는 EOF, -1과 `ECONNRESET`은 상대가 비정상 종료(RST)했다는 뜻이다. → 코어 2 (2.2)

   </details>

5. 서버 재시작 시 `bind: Address already in use`가 나는 이유와 해결은?

   <details markdown="1"><summary>답 확인</summary>

   연결을 먼저 닫은 쪽이 `TIME_WAIT`(리눅스 60초)에 머물고 그 소켓이 점유한 포트에는 `bind`가 안 된다. 서버가 커넥션을 먼저 닫는 구조면 서버 쪽에 쌓인다. `bind` 전에 `SO_REUSEADDR`를 켠다. → 코어 3 (3.1)

   </details>

6. `TIME_WAIT` 소켓이 수만 개면 문제인가? 진짜 위험은?

   <details markdown="1"><summary>답 확인</summary>

   수만 개는 정상이며 메모리를 조금 쓸 뿐이다. 진짜 위험은 클라이언트의 에페머럴 포트(기본 32768&#126;60999, 약 28,000개) 고갈이다. 커넥션 풀/keep-alive로 해결하고 `tcp_tw_reuse=1`도 도움이 된다. → 코어 3 (3.2)

   </details>

7. `SO_REUSEADDR`와 `SO_REUSEPORT`의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   `SO_REUSEADDR`는 `TIME_WAIT`로 점유된 포트에 재바인드하는 용도(서버 재시작), `SO_REUSEPORT`는 여러 프로세스/스레드가 같은 포트에 각자 `bind`하고 커널이 연결을 분배하는 용도(accept 경합 제거, nginx `reuseport`)다. → 코어 3 (3.3)

   </details>

8. 이벤트 루프 안에서 `getaddrinfo()`를 부르면 왜 위험한가?

   <details markdown="1"><summary>답 확인</summary>

   `/etc/hosts`를 읽고 `/etc/resolv.conf`의 네임서버에 UDP로 묻고 응답을 기다리는 동기 블로킹이며 타임아웃은 기본 5초 × 재시도라서, 부르는 동안 모든 커넥션이 멈춘다. 별도 스레드·비동기 리졸버(c-ares)·캐시로 해결한다. → 코어 4 (4.1)

   </details>

9. 컨테이너에서 외부 도메인 DNS가 느린 흔한 원인은?

   <details markdown="1"><summary>답 확인</summary>

   쿠버네티스 Pod의 `ndots:5` 기본값이다. 점이 5개보다 적은 `www.example.com` 같은 이름도 `search` 접미사를 먼저 붙여 실패 쿼리 3개를 보낸 뒤에야 절대 이름을 조회한다. → 코어 4 (4.2)

   </details>

### 3. 기억 고리

- **C++ 유추:** `accept()` ≈ 큐에서 완성된 연결 꺼내기. ⚠️ 핸드셰이크 자체는 `accept` 시점이 아니라 커널이 이미 끝내 놓았다.
- **C++ 유추:** 컨테이너의 `bind(0.0.0.0:80)` ≈ 내 머신의 `bind`. ⚠️ 호스트 포트 80을 점유하는 것이 아니라 그 컨테이너의 네트워크 네임스페이스 안에서만 유효하다.
- **비유:** 서버 소켓 = 식당 접수 창구. 예약(핸드셰이크)은 안내 데스크(커널)가 받아 대기 줄(accept 큐)에 세워 두고, 종업원(`accept`)은 줄에서 손님을 한 명씩 데려온다. 줄이 가득 차면 안내 데스크가 새 예약을 받지 않는다(SYN 무시). ⚠️ 비유가 깨지는 지점: 손님이 보낸 말(바이트)에는 문장 경계가 없어서, 한 번에 여러 문장이 오거나 한 문장이 쪼개져 올 수 있다.
- **묶음(3의 법칙):** 메시지 경계 3 (길이 접두어 / 구분자 / 고정 길이) · 포트 문제 3 (`EADDRINUSE`→`SO_REUSEADDR` / 에페머럴 고갈→커넥션 풀 / 다중 프로세스 accept→`SO_REUSEPORT`) · 죽은 연결·종료 신호 3 (`read`==0 EOF / `ECONNRESET` RST / `SIGPIPE`).
- **대칭·순서:** 서버 `socket→bind→listen→accept` ↔ 클라이언트 `socket→connect`. 종료는 먼저 닫은 쪽이 `TIME_WAIT`. DNS는 `/etc/hosts` → `resolv.conf` 네임서버 순.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "서버가 `accept`를 호출하지 않았는데도 클라이언트 `connect`가 성공하는 이유"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "컨테이너 안에서 `listen(80)`을 해도 호스트의 80번 포트와 충돌하지 않는 이유"를 네임스페이스 없이 소켓 언어만으로 설명해 보고, 무엇이 빠지는지 확인해 보세요.
- **랜덤 논리 게임:** A "TIME_WAIT가 많으니 `tcp_tw_reuse`부터 켜자" vs B "먼저 커넥션 풀/keep-alive를 도입하자" — 양쪽을 번갈아 변호해 보세요. (에페머럴 포트 약 28,000개, 초당 500개 연결, `TIME_WAIT` 60초 계산을 근거로)
- **AI 역할 반전:** "내가 TCP 서버의 생애와 accept 큐, TIME_WAIT 동작을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: linux/06_네트워크.md (6.1 소켓은 파일 디스크립터다, 6.2 TCP는 스트림이다, 6.3 TIME_WAIT과 "Address already in use", 6.7 알아야 할 소켓 옵션과 커널 동작, 6.10 DNS는 블로킹이다, 6.11 직접 확인해보기, 6.12 실전 체크리스트; 6.4&#126;6.6·6.8&#126;6.9는 범위 밖이라 제외); docker-fundamental/02_격리의_기초.md (2.2 네트워크 네임스페이스); docker-fundamental/15_DNS와_서비스_디스커버리_포트_매핑의_내부_동작.md (15.1 내장 DNS 서버); Kubernetes_Internals_Network_Guide/03-네트워크/15-kube-proxy-데이터플레인-해부.md (15.1 DNAT와 conntrack), 16-DNS와-서비스-디스커버리.md (16.1 resolv.conf, 16.2 ndots:5); kubernetes-qustion-book/02_심화/06_네트워크와_서비스_노출.md (6절)*
