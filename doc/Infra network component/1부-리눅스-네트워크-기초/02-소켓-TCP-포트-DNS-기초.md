---
title: "2장. 소켓·TCP·포트·DNS 기초"
parent: "1부. 리눅스 네트워크 기초"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 2
---

# 2장. 소켓·TCP·포트·DNS 기초

> **🎮 게임 서버 개발자에게** — 이 장의 내용은 이미 손에 익은 것이다. `socket()`/`bind()`/`listen()`/`accept()`, TCP 스트림, `epoll`, `getaddrinfo()`. 그런데 컨테이너·쿠버네티스에서 일어나는 거의 모든 통신은 **결국 이 소켓 하나**로 끝난다. NAT도 브리지도 Service도 소켓 앞뒤에서 주소를 바꿔 줄 뿐, 앱이 보는 것은 여전히 `fd`다. 이 장은 입문 책이 짚은 "소켓 기본"을 복습으로 줄이고, 그 아래의 **커널 쪽 사정**(accept 큐 진단, `epoll`이 왜 O(준비된 수)인지, Edge-triggered의 함정, `io_uring`, `sendfile`, fd 전달)을 채운다. 결정적으로 달라지는 점은 두 가지다. 내 앱의 `bind`/`listen` 범위가 **컨테이너 자신의 네트워크 네임스페이스 안으로 한정**된다는 것, 그리고 `connect(이름)`의 **이름을 풀어 주는 서버가 호스트 DNS가 아니라 컨테이너 `/etc/resolv.conf`가 가리키는 곳**이라는 것이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 트래픽 스파이크에서 서버 프로세스는 살아 있고 CPU도 한가한데 클라이언트가 접속 타임아웃을 겪는다(accept 큐 오버플로).
> - Edge-triggered `epoll` 서버의 연결이 가끔 멈춘 듯 보이거나, 이벤트 루프 안의 `getaddrinfo`가 모든 접속자를 멈춘다.
> - 컨테이너 안 서버가 `127.0.0.1`에만 `listen`해서 Pod IP나 포트 게시로는 접속이 안 된다.

## 코어 — 이것만은 100%

> **한 문장:** 소켓은 fd이고 핸드셰이크와 accept 큐는 커널이 쥐며, TCP는 메시지 경계 없는 바이트 스트림이고, 동시 연결의 한계는 포트(에페머럴 범위)와 I/O 모델(블로킹 스레드 대 `epoll`)이 정하며, 이름 해석(`getaddrinfo`)은 동기 블로킹이라 이벤트 루프를 멈추고 컨테이너에서는 `resolv.conf`가 누구를 가리키는지가 장애 원인이 된다.

1. **소켓은 fd이고 핸드셰이크·accept 큐는 커널이 쥔다** — `accept()`는 이미 완성된 연결을 큐에서 꺼낼 뿐이어서, 서버가 `accept`를 안 불러도 `connect`는 성공한다. 큐(backlog)가 차면 그때부터 SYN이 무시되고 `ss -ltn`의 Recv-Q/Send-Q와 `nstat`으로 진단한다. fd이므로 이벤트 루프 하나가 소켓·파이프·타이머·시그널을 함께 기다리고, 같은 머신에서는 `AF_UNIX` 소켓이 fd 자체를 다른 프로세스에 넘길 수 있다.
2. **TCP는 바이트 스트림이고 커널 옵션이 동작을 바꾼다** — `read`는 1바이트만 돌려줘도 정상이고(0은 EOF, `ECONNRESET`은 RST), `TCP_NODELAY`·keepalive·`SIGPIPE`·half-open이 장애의 단골이다. 파일을 보낼 때 `sendfile`은 유저 공간 복사를 건너뛴다.
3. **동시 연결의 한계는 포트와 I/O 모델이 정한다** — 포트는 에페머럴 범위(기본 32768&#126;60999)와 `TIME_WAIT`가 고갈시키고, 스레드-per-연결은 수천에서 한계가 오며(C10K), `epoll`은 fd를 한 번 등록해 O(준비된 수)로 답한다. Edge-triggered는 `EAGAIN`까지 읽어야 하고, `io_uring`은 준비 모델이 아니라 완료 모델이다.
4. **DNS 조회는 동기 블로킹이다** — `getaddrinfo()`는 `/etc/hosts`와 `/etc/resolv.conf`의 네임서버를 보고 응답을 기다리므로 이벤트 루프 안에서 부르면 모든 커넥션이 멈추며, 컨테이너의 DNS 지연은 흔한 장애 원인이다.

**이 장의 학습 목표**

- accept 큐 오버플로를 `ss -ltn`·`nstat`으로 진단하고, `AF_UNIX`의 fd 전달(`SCM_RIGHTS`)이 무엇을 가능하게 하는지 설명한다.
- 부분 읽기/쓰기·EOF·RST 규칙과 소켓 옵션(`TCP_NODELAY`, keepalive, `SO_LINGER` 등), `sendfile`의 복사 절감을 안다.
- 블로킹 스레드 모델이 한계에 이르는 이유와 `epoll`이 `select`/`poll`보다 확장되는 이유, Level/Edge-triggered의 차이, 이벤트 루프의 규칙을 설명한다.
- `getaddrinfo()`가 무엇을 읽고 어떻게 블로킹되는지, 컨테이너에서 어떻게 달라지는지 안다.
- 컨테이너 네트워킹의 이후 장(NAT, conntrack, DNS)이 이 소켓 모델 위에서 어떻게 이어지는지 연결한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `socket()`이 돌려주는 `int fd` | 소켓은 파일 디스크립터 | `read`/`write`/`close`/`epoll`이 파일처럼 동작한다 | 컨테이너 안의 fd가 가리키는 소켓은 **그 컨테이너의 네트워크 네임스페이스에 속한다**(3장). 같은 `0.0.0.0:80`을 컨테이너마다 따로 바인딩할 수 있다 |
| `listen(fd, backlog)` | accept 큐와 `somaxconn` 상한 | 핸드셰이크 완료 연결이 큐에 쌓인다 | 컨테이너에서 `somaxconn`이 어느 값인지는 이 책의 원천에 없다. 운영 환경에서 `ss -ltn`으로 직접 확인한다 |
| `epoll_wait` 기반 게임 서버 루프 | 이벤트 루프의 규칙 | 준비된 fd만 돌려받는다 | 루프 안에서 부른 `getaddrinfo`·파일 I/O·동기 DB 호출 하나가 **모든 접속자를** 멈춘다. 컨테이너에서는 DNS 지연이 이 형태로 증폭된다 |
| 서버 재시작 시 `EADDRINUSE` | `TIME_WAIT`와 `SO_REUSEADDR` | `bind` 전에 옵션을 켜면 된다 | 소켓과 `/proc/net` 통계는 네임스페이스별로 독립 유지되므로, 어느 네임스페이스에서 `ss`를 실행하느냐에 따라 보이는 소켓이 달라진다(`nsenter --target $PID --net`, 3장) |
| 로컬 IPC에 `fork` 후 fd 상속, 파이프 | `AF_UNIX` + `SCM_RIGHTS` | 같은 머신 프로세스 간 통신이다 | fd를 상속이 아니라 **실행 중에 다른 프로세스로 전달**할 수 있다. 3장의 네임스페이스 공유(스택 전체를 같이 쓰기)와는 다른 층의 공유다 |
| `gethostbyname`/`getaddrinfo`로 서버 이름 해석 | `/etc/hosts` → `/etc/resolv.conf`의 네임서버 | 동기 블로킹이고 타임아웃은 기본 5초 × 재시도다 | 컨테이너의 `resolv.conf`는 호스트와 다르다(Docker 사용자 정의 네트워크 `127.0.0.11`, 쿠버네티스는 kube-dns ClusterIP와 `ndots:5`) |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 서버가 `listen` 후 `accept`를 한 번도 안 부르는데 클라이언트의 `connect`는 성공할까? 큐가 차면 무슨 일이 생기고 어디서 확인할까?
> 2. 파일을 `read`로 읽어 소켓에 `write`하면 데이터는 몇 번 복사될까? 줄이는 방법이 있을까?
> 3. 연결 1만 개를 스레드 1만 개로 처리하면 무엇이 문제일까? `epoll`은 `select`/`poll`보다 왜 확장될까?
> 4. Edge-triggered `epoll`에서 알림을 받고 일부만 읽고 멈추면 어떻게 될까?
> 5. 이벤트 루프 안에서 `getaddrinfo`를 부르면, 그리고 컨테이너 안에서 외부 도메인 DNS가 유독 느리면 무엇을 의심해야 할까?
>
> **처리법:** 🛠 실습 `ss -tlnp`, `ss -ltn`, `ss -tin`, `nstat -az | grep -E 'ListenOverflows|ListenDrops|RetransSegs'`, `tcpdump -i any -nn port 8080`, `strace -e trace=network -p <pid>` → 바로 실행(Linux 환경) · 🗺 관계도 "블로킹 스레드 → select/poll → epoll(LT/ET) → io_uring" 진화를 한 장으로, 서버 생애 다이어그램(입문 책 4장)을 백지에 다시 그리기 · 📦 카드로 `net.core.somaxconn`(기본 4096), `EAGAIN`, `SCM_RIGHTS`, `sendfile`, `TCP_NODELAY`, 에페머럴 32768&#126;60999, `ndots` · 유추 비판 A "내 epoll 서버 경험이 컨테이너에서도 그대로"가 어디서 깨지는지 ⚠️ 칸 읽고 짚어 보기

---

## 코어 1. 소켓은 fd이고 핸드셰이크·accept 큐는 커널이 쥔다

### 1.1 accept 큐 오버플로를 진단한다

**한 줄 요약:** 핸드셰이크는 커널이 끝내 두고 `accept()`는 큐에서 꺼낼 뿐이므로, 큐가 차는 순간부터 SYN이 무시되고 그 징후는 `ss -ltn`과 `nstat`에 남는다.

> **입문 책에서 배운 것:** 소켓은 fd, 핸드셰이크(SYN, SYN+ACK, ACK)는 커널이 하고 `accept()`는 완성된 연결을 큐에서 꺼내는 것뿐이며, 그래서 `accept`를 안 불러도 `connect`는 성공한다([입문 책 4장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/1부-리눅스-기초/04-메모리-파일시스템-네트워크-기초.md)).

큐(backlog)가 꽉 차면 그때부터 SYN이 무시되고 클라이언트는 재전송 후 타임아웃을 겪는다. `listen(fd, backlog)`의 backlog는 `net.core.somaxconn`(기본 4096)으로 상한이 잡힌다. 트래픽 스파이크에서 이 오버플로가 나면 서버 프로세스는 멀쩡하고 CPU도 한가한데 접속만 타임아웃이 난다.

```bash
ss -tlnp                        # 리스닝 소켓과 프로세스
ss -ltn                         # Recv-Q = accept 큐 현재 크기, Send-Q = backlog
nstat -az | grep -E 'ListenOverflows|ListenDrops|RetransSegs'
ss -tin                         # 연결별 RTT, cwnd, 재전송 등 TCP 내부 상태
tcpdump -i any -nn port 8080    # 실제 패킷 (핸드셰이크, RST, 재전송 관찰)
strace -e trace=network -p <pid>
```

`ss -ltn`의 Recv-Q는 accept 큐의 현재 크기, Send-Q는 backlog이고, `nstat -az TcpExtListenOverflows`로도 오버플로를 확인한다. 해결은 `accept` 속도를 점검하고 `somaxconn`과 backlog를 예상 동시 연결 수에 맞게 올리는 것이다.

### 1.2 이 모델이 컨테이너 네트워크의 "최종 단위"인 이유

**한 줄 요약:** NAT·브리지·Service는 소켓 앞뒤에서 주소를 바꿔 줄 뿐이고, 앱이 만지는 것은 언제나 이 fd 하나다.

[1장](../0부-큰-그림/01-패킷-한-개의-여정.md)의 지도에서 패킷은 여러 경계를 지나지만, 양 끝에서는 `connect()`/`accept()`로 만든 평범한 TCP 연결이다. 예를 들어 [5장](05-netfilter-iptables-NAT-conntrack.md)에서 볼 conntrack 항목은 `src=… dst=… sport=… dport=…` 형태로 연결을 기억한다.

```
tcp 6 431999 ESTABLISHED src=10.244.1.9 dst=10.96.142.88 sport=34567 dport=80 \
    src=10.244.1.3 dst=10.244.1.9 sport=8080 dport=34567 [ASSURED]
```

> **[보충]** 이 한 줄은 TCP 연결이 출발지 IP·출발지 포트·목적지 IP·목적지 포트 네 값으로 식별된다는 점을 보여 준다. 위 줄은 `Kubernetes_Internals_Network_Guide` 15.1절의 conntrack 출력 예시이며, "연결이 네 값으로 식별된다"는 일반적 설명은 원천에 명시되어 있지 않아 이 책이 덧붙인 입문 설명이다. 두 번째 `src=`/`dst=` 쌍은 응답 방향(역변환 정보)이다.

### 1.3 같은 머신 안: Unix 도메인 소켓과 fd 전달

**한 줄 요약:** `AF_UNIX`는 TCP 스택을 통째로 건너뛰어 빠르고 파일 권한으로 접근을 제어하며, `SCM_RIGHTS`로 fd 자체를 다른 프로세스에 넘길 수 있다.

같은 머신 안의 프로세스 간에는 `AF_UNIX`를 쓴다. TCP 스택(체크섬, 순서 제어, 혼잡 제어)을 건너뛰어 2배 이상 빠르고(원천 표현), 파일시스템 경로(`/var/run/docker.sock`)에 바인딩되어 파일 권한으로 접근을 제어하며, API는 TCP 소켓과 같다.

특별한 능력은 **`SCM_RIGHTS`로 파일 디스크립터 자체를 다른 프로세스에 전달**하는 것이다. 이런 용도가 있다.

- 리스닝 소켓을 새 버전의 서버 프로세스에 넘겨 **무중단 재시작**을 한다(HAProxy, systemd socket activation).
- 권한 있는 프로세스가 파일을 열어 권한 없는 워커에 넘긴다.

---

## 코어 2. TCP는 바이트 스트림이고 커널 옵션이 동작을 바꾼다

### 2.1 부분 읽기·부분 쓰기·EOF·RST

**한 줄 요약:** `read`가 1바이트만 반환해도 정상이고, `0`은 상대가 닫았다는 EOF, `-1`+`ECONNRESET`은 비정상 종료(RST)다.

> **입문 책에서 배운 것:** `write` 횟수와 `read` 횟수는 무관하며 메시지 경계(길이 접두어·구분자·고정 길이)는 앱이 만든다([입문 책 4장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/1부-리눅스-기초/04-메모리-파일시스템-네트워크-기초.md)). 컨테이너로 옮겨도 이 성질은 같다. 그 위에서 챙길 규칙은 다음과 같다.

- `read`가 요청한 바이트를 다 채워 줄 때까지 **루프**해야 한다. `write`도 요청한 양보다 적게 쓰고 반환할 수 있다(논블로킹 소켓에서 특히).
- `read`가 **0을 반환**하면 상대가 연결을 닫았다는 뜻(EOF). -1과 `ECONNRESET`이면 상대가 비정상 종료(RST)했다는 뜻이다.

### 2.2 알아야 할 소켓 옵션과 커널 동작

**한 줄 요약:** 게임·RPC 서버라면 `TCP_NODELAY`, 장기 연결이라면 keepalive, 그리고 `SIGPIPE` 무시를 기본으로 챙긴다.

| 옵션/동작 | 의미 | 언제 |
|---|---|---|
| `TCP_NODELAY` | Nagle 알고리즘 끄기. 작은 패킷을 모으지 않고 즉시 전송 | 요청-응답 지연이 중요한 RPC, 게임. 대부분의 RPC 라이브러리가 기본으로 켠다 |
| `SO_KEEPALIVE` + `TCP_KEEPIDLE/INTVL/CNT` | 유휴 연결에 주기적 probe. 상대가 죽었으면 감지 | 기본은 2시간 후 시작. 장기 연결은 반드시 짧게 조정(예: 60초) |
| `SO_RCVBUF`/`SO_SNDBUF` | 커널 소켓 버퍼 크기 | 보통 자동 조정(`tcp_rmem`/`tcp_wmem`)에 맡기는 게 낫다 |
| `SO_LINGER` | `close` 시 미전송 데이터 처리 | 대부분 건드리지 말 것. 0으로 설정하면 RST 전송 |
| `TCP_CORK` | 데이터를 모아서 한 번에 | 헤더+파일 본문을 하나의 패킷으로 (`sendfile`과 함께) |
| `TCP_FASTOPEN` | 핸드셰이크와 함께 데이터 전송 | 짧은 연결 반복 시 |

- **half-open 연결**: 상대 머신의 케이블이 뽑히거나 전원이 꺼지면 FIN도 RST도 오지 않아 내 소켓은 영원히 `ESTABLISHED`로 남는다. 애플리케이션 레벨 heartbeat나 keepalive 없이는 죽은 연결을 감지할 수 없다(커넥션 풀이 오래된 연결에서 갑자기 실패하는 이유).
- **`SIGPIPE`**: 상대가 닫은 소켓에 `write`하면 `EPIPE` 대신 `SIGPIPE`가 오고 기본 동작은 프로세스 종료다. 서버가 로그 한 줄 없이 사라지므로 `signal(SIGPIPE, SIG_IGN)`을 하거나 `send(..., MSG_NOSIGNAL)`을 쓴다.

### 2.3 데이터 복사 줄이기: sendfile과 zero-copy

**한 줄 요약:** `read`+`write`는 유저 버퍼를 거쳐 두 번 복사하지만, `sendfile`은 커널 안에서 페이지 캐시 → 소켓 버퍼로 바로 넘긴다.

```c
read(file_fd, buf, n);    // 디스크 → 페이지 캐시 → 유저 버퍼 (복사 1)
write(sock_fd, buf, n);   // 유저 버퍼 → 소켓 버퍼 (복사 2) → NIC
```

```c
sendfile(sock_fd, file_fd, &off, n);   // 페이지 캐시 → 소켓 버퍼. 유저 공간 거치지 않음
```

`sendfile`은 복사 한 번과 시스템 콜 두 번을 줄인다. 정적 파일 서버(nginx, Kafka의 consumer 전송)가 쓴다. `splice`는 파이프를 거쳐 임의의 fd 간에 같은 일을 하고, `MSG_ZEROCOPY`는 큰 `send`에서 유저 버퍼를 복사하지 않고 직접 NIC에 넘긴다(10KB 이상에서 이득).

---

## 코어 3. 동시 연결의 한계는 포트와 I/O 모델이 정한다

### 3.1 포트는 한정된 자원이다 (복습)

**한 줄 요약:** `TIME_WAIT`는 먼저 닫은 쪽에 60초 머물고, 진짜 위험은 클라이언트의 에페머럴 포트 고갈이다.

> **입문 책에서 배운 것:** 먼저 닫은 쪽의 `TIME_WAIT`(리눅스 60초)가 `bind`를 막고 `SO_REUSEADDR`로 풀며, `TIME_WAIT` 수만 개는 정상이고 에페머럴 포트(기본 32768&#126;60999, 약 28,000개) 고갈이 진짜 위험이라 커넥션 풀/keep-alive로 해결한다([입문 책 4장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/1부-리눅스-기초/04-메모리-파일시스템-네트워크-기초.md)).

(확인은 `ss -tan state time-wait | wc -l`, `cat /proc/sys/net/ipv4/ip_local_port_range`.) 이 장에서 덧붙일 것은 둘뿐이다. `net.ipv4.tcp_tw_reuse=1`도 도움이 된다는 것, 그리고 `SO_REUSEPORT`는 `TIME_WAIT` 우회가 아니라 **여러 프로세스/스레드가 같은 포트에 각자 `bind`하고 커널이 연결을 분배**하게 해 멀티프로세스 서버의 accept 경합을 없애는 용도(nginx `reuseport`)라는 것이다. 이것은 3.5의 "코어 수만큼 이벤트 루프를 띄운다"로 이어진다.

### 3.2 블로킹 I/O와 C10K

**한 줄 요약:** "커넥션당 스레드 하나"는 수천까지는 잘 돌지만, 대부분의 스레드가 `read`에서 잠든 채 코어는 놀고 스택·스케줄러 비용만 폭증한다.

기본 소켓은 블로킹이다. `read`는 데이터가 올 때까지, `accept`는 연결이 올 때까지, `connect`는 핸드셰이크가 끝날 때까지 스레드를 잠재운다. 스레드 모델은 단순하고 수천 커넥션까지는 잘 돈다. 그 이상에서는 다음이 문제가 된다.

- 스레드 1만 개 = 스택 예약 80GB(가상), 실제 수십 MB 이상, 스케줄러 부담, 컨텍스트 스위칭 폭증.
- 대부분의 스레드는 `read`에서 잠들어 있다. 코어는 놀고 있다.

이것이 1999년의 **C10K 문제**이고, 답은 스레드가 기다리는 대신 커널에게 "이 소켓들 중 어느 것이든 준비되면 알려줘"라고 묻는 **I/O 멀티플렉싱**이다.

### 3.3 논블로킹 I/O와 epoll

**한 줄 요약:** 논블로킹 소켓은 데이터가 없으면 `EAGAIN`을 즉시 돌려주고, `epoll`은 fd를 한 번 등록해 두면 준비된 것만 돌려주므로 O(준비된 수)다.

소켓이 fd이기 때문에(`send`/`recv`는 플래그를 받는 확장일 뿐이다) 이벤트 루프 하나가 소켓, 파이프, 타이머(`timerfd`), 시그널(`signalfd`)을 한꺼번에 기다릴 수 있다.

```c
fcntl(fd, F_SETFL, O_NONBLOCK);     // 또는 socket(..., SOCK_NONBLOCK)
n = read(fd, buf, sz);
if (n == -1 && errno == EAGAIN) { /* 지금은 데이터 없음. 에러 아님. 나중에 다시 */ }
```

"언제 다시 시도할지"를 알려 주는 것이 `epoll`이다. 흐름은 `epoll_create1` → `epoll_ctl(EPOLL_CTL_ADD, listen_fd)`로 등록 → `epoll_wait`(준비된 fd가 생길 때까지 잠듦) 루프이고, 리스닝 fd가 준비되면 `accept4(..., SOCK_NONBLOCK | SOCK_CLOEXEC)`로 받은 소켓을 다시 등록하며, 그 외 fd는 `read` → 처리 → `write`를 `EAGAIN`까지 반복한다.

**왜 select/poll이 아니라 epoll인가:** `select`/`poll`은 매 호출마다 감시할 fd 목록 전체를 커널에 넘기고 커널은 전체를 순회한다. O(n)이라 fd 1만 개면 매번 1만 개를 검사한다. `select`에는 fd 1024 한도(`FD_SETSIZE`)도 있다. `epoll`은 fd를 한 번 등록해 두면 커널이 준비된 것만 돌려준다. O(준비된 수)다.

### 3.4 Level-triggered와 Edge-triggered

**한 줄 요약:** Level-triggered는 읽을 데이터가 남아 있는 한 매번 알려 주고, Edge-triggered는 상태가 변할 때 한 번만 알려 주므로 `EAGAIN`까지 읽지 않으면 연결이 멈춘 듯 보인다.

| 모드 | 알림 | 대가 |
|---|---|---|
| Level-triggered (기본) | 읽을 데이터가 남아 있는 한 매번 | 안전하다. 조금 덜 효율적 |
| Edge-triggered (`EPOLLET`) | 상태가 **변할 때만** 한 번 | 알림을 받으면 **`EAGAIN`이 나올 때까지 끝까지 읽어야 한다.** 안 그러면 남은 데이터에 대해 다시는 알림이 오지 않는다 |

고성능 서버가 쓰지만 실수하기 쉽다.

### 3.5 이벤트 루프의 규칙과 io_uring

**한 줄 요약:** 루프 안에서 블로킹하지 말고, CPU를 오래 쓰는 일은 워커 풀로 넘기며, 코어 수만큼 루프를 띄운다. `io_uring`은 시스템 콜 횟수를 줄이고 디스크 파일까지 비동기로 만든다.

이벤트 루프의 규칙은 세 가지다.

1. **루프 안에서 블로킹하지 마라.** 파일 I/O, DNS 조회(`getaddrinfo`는 블로킹이다), 동기 DB 호출 하나가 모든 커넥션을 멈춘다. Node.js가 DNS와 파일 I/O를 별도 스레드 풀에서 하는 이유다.
2. **CPU를 오래 쓰는 작업도 마찬가지다.** 워커 스레드 풀로 넘긴다.
3. 코어 수만큼 이벤트 루프를 띄워 각각 `epoll`을 돈다(nginx worker, `SO_REUSEPORT`).

Node.js(libuv), Go 런타임의 netpoller, Java NIO, Rust tokio, Python asyncio가 전부 아래에서 `epoll`을 쓴다. 언어의 `async/await`는 이 구조에 문법을 씌운 것이다.

`epoll`은 "준비됐다"고 알려 줄 뿐 실제 `read`는 따로 시스템 콜이고, **디스크 파일에는 `epoll`이 통하지 않는다**(항상 준비됨으로 나온다). `io_uring`(5.1+)은 이 둘을 해결한다.

- 유저 공간과 커널이 공유 메모리 링 버퍼 두 개(제출 큐, 완료 큐)를 공유한다. 요청을 링에 넣고 `io_uring_enter` 한 번으로 여러 개를 제출하며 완료도 링에서 읽으므로 시스템 콜 횟수가 극적으로 줄어든다.
- 파일 I/O도 진정한 비동기로 된다. `read`, `write`, `accept`, `send`, `recv`, `fsync`, `openat` 등 대부분의 시스템 콜이 비동기 연산으로 제공된다.
- "준비 모델(readiness)"이 아니라 "완료 모델(completion)"이다. Windows IOCP와 같은 철학이다.

아직 `epoll`이 표준이고 `io_uring`은 보안 이슈로 일부 환경(일부 컨테이너 런타임)에서 막혀 있다. 하지만 고성능 스토리지·네트워크 코드의 방향은 이쪽이다.

### 3.6 포트 공간은 네임스페이스 단위다

**한 줄 요약:** 네트워크 네임스페이스가 포트 바인딩 공간을 분리하므로 컨테이너·Pod마다 같은 포트를 독립적으로 쓸 수 있다.

네트워크 네임스페이스는 인터페이스, 라우팅 테이블, iptables/nftables 규칙, **포트 바인딩 공간**을 분리하고, 그 덕분에 컨테이너마다 독립적으로 `0.0.0.0:80` 같은 포트를 바인딩할 수 있다([3장](03-네트워크-네임스페이스.md)). 쿠버네티스의 IP-per-Pod 모델에서는 모든 nginx가 80을 쓸 수 있어 포트 충돌 자체가 없다([13장](../3부-쿠버네티스-네트워크/13-쿠버네티스-네트워크-모델과-Pod-네트워크.md)). 반대로 `hostNetwork: true`인 Pod는 노드의 네트워크 네임스페이스를 공유하므로 포트도 노드와 공유한다.

> **[보충]** 앱이 `127.0.0.1`에만 `listen`하면 Pod IP를 통한 접근이 실패할 수 있다는 점은 `kubernetes-qustion-book` 심화 6장의 장애 분해 항목에 근거한다("앱이 Pod 안에서 실제 주소와 포트에 listen하는가?"). 컨테이너 안에서 `bind(0.0.0.0)`과 `bind(127.0.0.1)`을 구분해야 하는 이유는 C++ 서버 경험의 `bind` 주소 선택과 같다. 또 위 단락의 "`hostNetwork: true` Pod는 노드의 네트워크 네임스페이스를 공유하므로 포트도 노드와 공유한다"는 이 장의 원천에 직접 서술이 없고, 입문 책 6장(`--net=host`)에서 이어 온 이 책의 설명이다.

---

## 코어 4. DNS 조회는 동기 블로킹이다

### 4.1 getaddrinfo가 하는 일

**한 줄 요약:** `/etc/hosts`를 읽고, `/etc/resolv.conf`의 네임서버에 UDP로 묻고, 응답을 기다린다. 동기 블로킹이고 타임아웃은 기본 5초 × 재시도다.

이벤트 루프 안에서 `getaddrinfo()`를 부르면 모든 커넥션이 5초 멈춘다(3.5의 규칙 1). 대안은 세 가지다.

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
- [ ] 큰 파일을 소켓으로 보내는 경로가 `read`+`write` 두 번 복사인가, `sendfile`인가? `io_uring`을 쓴다면 컨테이너 런타임이 막지 않는지 확인했는가?

### 시나리오로 확인하기

1. **상황:** 트래픽 스파이크 때 클라이언트들이 접속 타임아웃을 겪는다. 서버 프로세스는 살아 있고 CPU는 한가하다.
   **질문:** 어디를 의심하고 무엇으로 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   `accept` 큐(backlog) 오버플로다. 큐가 꽉 차면 SYN이 무시되어 클라이언트는 재전송 후 타임아웃을 겪는다. `ss -ltn`의 Recv-Q(현재 accept 큐 크기)와 Send-Q(backlog), `nstat -az TcpExtListenOverflows`로 확인하고, backlog 상한인 `net.core.somaxconn`과 `accept` 속도를 점검한다. → 코어 1 (1.1)

   </details>

2. **상황:** Edge-triggered `epoll`로 만든 서버에서 큰 요청을 보낸 클라이언트의 연결만 가끔 응답 없이 멈춘 듯 보인다. 소켓 에러는 없다.
   **질문:** 의심할 코드는?

   <details markdown="1"><summary>답 확인</summary>

   Edge-triggered는 상태가 변할 때 한 번만 알려 주므로 알림을 받았을 때 `EAGAIN`이 나올 때까지 끝까지 읽어야 한다. 한 번에 일부만 읽고 돌아가면 남은 데이터에 대해 다시는 알림이 오지 않아 연결이 멈춘 듯 보인다. 읽기 루프를 `EAGAIN`까지 돌리거나 Level-triggered(기본)로 바꾼다. → 코어 3 (3.4)

   </details>

3. **상황:** 쿠버네티스 Pod 안 서버에서 외부 API(`api.example.com`) 호출 지연이 크고, 이벤트 루프가 가끔 멈춘다.
   **질문:** 두 가지 의심 부품은?

   <details markdown="1"><summary>답 확인</summary>

   첫째, 이벤트 루프 안에서 부르는 동기 블로킹 `getaddrinfo()`(기본 5초 × 재시도). 별도 스레드·비동기 리졸버·캐시로 옮긴다. 둘째, Pod `resolv.conf`의 `ndots:5`와 `search` 목록 때문에 외부 도메인 조회마다 실패 쿼리가 먼저 나가는 문제다. → 코어 3 (3.5), 코어 4 (4.1, 4.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1 서버 생애: socket → ____ → ____ → ____ (큐에서 꺼냄)   핸드셰이크는 ____ 이 한다
  backlog 상한: net.core.____ (기본 ____)   확인: ss -ltn → Recv-Q = ____ , Send-Q = ____ ,  nstat ____
  AF_UNIX: TCP 스택 ____ , 접근 제어 = 파일 ____ , fd 전달 = ____ (용도: 무중단 ____)

코어 2 read == 0 → ____ ,  -1 + ECONNRESET → ____ ,  닫힌 소켓에 write → ____ 시그널(기본 종료)
  옵션: ____ (Nagle 끄기) / ____ (죽은 연결 감지, 기본 __시간 뒤 시작) / half-open = ____ 도 ____ 도 안 옴
  read+write = 복사 __번 → ____ 는 페이지 캐시 → 소켓 버퍼 (MSG_ZEROCOPY: __KB 이상에서 이득)

코어 3 에페머럴 포트: 기본 ____ 부터 ____ 까지 / TIME_WAIT = 먼저 ____ 쪽, ____ 초
  C10K: 스레드 1만 개 → 스택 예약 ____ GB(가상), 대부분 ____ 에서 잠듦
  select/poll = O(__) , 한도 ____ / epoll = fd를 ____ 번 등록, O(____)
  LT vs ET: ET는 ____ 까지 읽기. io_uring = ____ 모델 (epoll = ____ 모델)
  이벤트 루프 규칙 3: 루프 안 ____ 금지 / CPU 작업은 ____ / 코어 수만큼 ____

코어 4 getaddrinfo: ____ → ____ 의 네임서버(UDP) / 동기 ____ / 기본 타임아웃 __초 × 재시도
  Docker 사용자 정의 네트워크: nameserver ____ , ndots:__   쿠버네티스 Pod: ____ Service ClusterIP, ndots:__
```

### 2. 인출 질문

1. 서버가 `accept`를 안 불러도 `connect`가 성공하는 이유와, 큐가 찼을 때의 확인법은?

   <details markdown="1"><summary>답 확인</summary>

   핸드셰이크는 커널이 끝내 완성된 연결을 accept 큐에 넣고 `accept()`는 꺼낼 뿐이다. 큐(backlog)가 차면 SYN이 무시되어 클라이언트는 재전송 후 타임아웃을 겪는다. `ss -ltn`에서 Recv-Q는 accept 큐 현재 크기, Send-Q는 backlog이고 `nstat -az TcpExtListenOverflows`로도 확인하며, 상한은 `net.core.somaxconn`(기본 4096)이다. → 코어 1 (1.1)

   </details>

2. `AF_UNIX` 소켓은 TCP와 무엇이 다르고 `SCM_RIGHTS`로 무엇을 하는가?

   <details markdown="1"><summary>답 확인</summary>

   TCP 스택(체크섬, 순서 제어, 혼잡 제어)을 건너뛰어 2배 이상 빠르고 파일 권한(`/var/run/docker.sock`)으로 접근을 제어한다. `SCM_RIGHTS`는 fd 자체를 다른 프로세스에 전달해, 리스닝 소켓을 새 버전 서버에 넘기는 무중단 재시작(HAProxy, systemd socket activation)이나 권한 있는 프로세스가 연 파일을 권한 없는 워커에 넘기는 데 쓴다. → 코어 1 (1.3)

   </details>

3. `read`가 0일 때와 -1/`ECONNRESET`일 때, 그리고 부분 읽기/쓰기 규칙은?

   <details markdown="1"><summary>답 확인</summary>

   0은 상대가 닫은 EOF, -1과 `ECONNRESET`은 상대의 비정상 종료(RST)다. `read`는 1바이트만 반환해도 정상이라 요청한 바이트를 채울 때까지 루프해야 하고 `write`도 요청보다 적게 쓸 수 있다(논블로킹에서 특히). → 코어 2 (2.1)

   </details>

4. 서버가 로그 없이 사라지는 이유와 죽은 상대의 감지법은?

   <details markdown="1"><summary>답 확인</summary>

   닫힌 소켓에 `write`하면 `EPIPE` 대신 `SIGPIPE`가 오고 기본 동작이 종료라서다(`SIG_IGN` 또는 `MSG_NOSIGNAL`). 상대 전원이 꺼지면 FIN도 RST도 안 와(half-open) `ESTABLISHED`로 남으므로 `SO_KEEPALIVE`(기본 2시간 뒤 시작, 60초 등으로 조정)나 heartbeat가 필요하다. → 코어 2 (2.2)

   </details>

5. 파일을 소켓으로 보낼 때 `read`+`write`와 `sendfile`의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   `read`+`write`는 페이지 캐시 → 유저 버퍼(복사 1) → 소켓 버퍼(복사 2)다. `sendfile`은 유저 공간을 거치지 않고 커널 안에서 페이지 캐시 → 소켓 버퍼로 넘겨 복사 한 번과 시스템 콜 두 번을 줄인다(nginx, Kafka). `MSG_ZEROCOPY`는 10KB 이상의 큰 `send`에서 이득이다. → 코어 2 (2.3)

   </details>

6. `SO_REUSEADDR`와 `SO_REUSEPORT`는 각각 무엇을 푸는가? `TIME_WAIT` 수만 개는 문제인가?

   <details markdown="1"><summary>답 확인</summary>

   `SO_REUSEADDR`는 `TIME_WAIT` 점유 포트에 재바인드(서버 재시작), `SO_REUSEPORT`는 여러 프로세스/스레드가 같은 포트에 각자 `bind`하고 커널이 연결을 분배(accept 경합 제거, nginx `reuseport`)한다. `TIME_WAIT` 수만 개는 정상이고 진짜 위험은 에페머럴 포트(기본 32768&#126;60999) 고갈이다. → 코어 3 (3.1)

   </details>

7. 스레드-per-연결의 한계와 `epoll`이 `select`/`poll`보다 확장되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   스레드 1만 개는 스택 예약 80GB(가상), 스케줄러·컨텍스트 스위칭 폭증을 낳고 대부분 `read`에서 잠든 채 코어는 논다(C10K). `select`/`poll`은 매 호출 fd 목록 전체를 넘겨 O(n)(`select`는 1024 한도), `epoll`은 fd를 한 번 등록하고 준비된 것만 받는 O(준비된 수)다. → 코어 3 (3.2, 3.3)

   </details>

8. Level-triggered와 Edge-triggered의 차이와 ET의 규칙은?

   <details markdown="1"><summary>답 확인</summary>

   LT(기본)는 읽을 데이터가 남아 있는 한 매번 알려 안전하지만 덜 효율적이다. ET(`EPOLLET`)는 상태가 변할 때만 한 번 알려 주므로 `EAGAIN`이 나올 때까지 끝까지 읽어야 하며, 아니면 남은 데이터에 다시는 알림이 오지 않아 연결이 멈춘 듯 보인다. → 코어 3 (3.4)

   </details>

9. `epoll`과 `io_uring`의 차이와 이벤트 루프의 규칙 세 가지는?

   <details markdown="1"><summary>답 확인</summary>

   `epoll`은 준비 사실만 알리고 실제 `read`는 따로이며 디스크 파일에는 통하지 않는다(준비 모델). `io_uring`은 공유 링 버퍼로 한 번에 여러 요청을 제출하고 파일 I/O까지 비동기인 완료 모델이며 일부 컨테이너 런타임에서 막혀 있다. 규칙: ① 루프 안 블로킹(파일 I/O·DNS·동기 DB) 금지 ② CPU 작업은 워커 풀 ③ 코어 수만큼 루프. → 코어 3 (3.5)

   </details>

10. 이벤트 루프 안 `getaddrinfo()`가 위험한 이유와 컨테이너에서 외부 도메인 DNS가 느린 흔한 원인은?

    <details markdown="1"><summary>답 확인</summary>

    `/etc/hosts` → `resolv.conf` 네임서버(UDP)를 거치는 동기 블로킹이고 기본 타임아웃 5초 × 재시도라 부르는 동안 모든 커넥션이 멈춘다(별도 스레드·c-ares·캐시로 해결). 컨테이너에서는 Pod의 `ndots:5` 때문에 `www.example.com` 같은 이름도 `search` 접미사로 실패 쿼리 3개를 먼저 보낸 뒤 절대 이름을 조회한다. → 코어 4 (4.1, 4.2)

    </details>

### 3. 기억 고리

- **C++ 유추:** `accept()` ≈ 큐에서 완성된 연결 꺼내기. ⚠️ 핸드셰이크 자체는 `accept` 시점이 아니라 커널이 이미 끝내 놓았다.
- **C++ 유추:** 내 게임 서버의 `epoll` 루프 ≈ 컨테이너 안에서도 그대로. ⚠️ 루프 안 `getaddrinfo`가 컨테이너의 `ndots:5`·`resolv.conf`와 만나면 DNS 지연이 모든 접속자의 지연이 된다. 컨테이너의 `bind(0.0.0.0:80)`은 호스트 포트 80을 점유하는 것이 아니라 그 네트워크 네임스페이스 안에서만 유효하다.
- **비유:** 서버 소켓 = 식당 접수 창구. 예약(핸드셰이크)은 안내 데스크(커널)가 받아 대기 줄(accept 큐)에 세워 두고, 종업원(`accept`)은 줄에서 손님을 한 명씩 데려온다. 줄이 가득 차면 안내 데스크가 새 예약을 받지 않는다(SYN 무시). ⚠️ 비유가 깨지는 지점: 손님이 보낸 말(바이트)에는 문장 경계가 없어서, 한 번에 여러 문장이 오거나 한 문장이 쪼개져 올 수 있다.
- **묶음(3의 법칙):** 이벤트 루프 규칙 3 (루프 안 블로킹 금지 / CPU 작업은 워커 풀 / 코어 수만큼 루프) · I/O 모델의 진화 3 (블로킹 스레드 → `epoll` → `io_uring`) · 죽은 연결·종료 신호 3 (`read`==0 EOF / `ECONNRESET` RST / `SIGPIPE`).
- **대칭·순서:** 서버 `socket→bind→listen→accept` ↔ 클라이언트 `socket→connect`. 준비 모델(`epoll`) ↔ 완료 모델(`io_uring`). Level ↔ Edge. DNS는 `/etc/hosts` → `resolv.conf` 네임서버 순.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "서버가 `accept`를 호출하지 않았는데도 클라이언트 `connect`가 성공하고, 큐가 차면 어떻게 되는지"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "ET `epoll`에서 `EAGAIN`까지 읽어야 하는 이유"를 `epoll_wait`가 돌려주는 것이 무엇인지부터 설명해 보세요.
- **랜덤 논리 게임:** A "게임 서버는 `io_uring`으로 갈아타자" vs B "아직 `epoll`이 표준이고 컨테이너 런타임이 막을 수 있다" — 양쪽을 번갈아 변호해 보세요. (readiness/completion, 시스템 콜 횟수, 일부 컨테이너 런타임 차단을 근거로)
- **AI 역할 반전:** "내가 accept 큐, `epoll`의 LT/ET, 이벤트 루프 규칙을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: linux/06_네트워크.md (6.1 소켓은 파일 디스크립터다·TCP 서버의 생애, 6.2 TCP는 스트림이다, 6.3 TIME_WAIT과 "Address already in use", 6.4 블로킹 I/O와 그 한계, 6.5 논블로킹 I/O와 epoll·Level/Edge-triggered·이벤트 루프의 규칙, 6.6 io_uring, 6.7 알아야 할 소켓 옵션과 커널 동작, 6.8 데이터 복사 줄이기, 6.9 Unix 도메인 소켓, 6.10 DNS는 블로킹이다, 6.11 직접 확인해보기, 6.12 실전 체크리스트; 6.13 다른 OS는 범위 밖이라 제외); docker-fundamental/02_격리의_기초.md (2.2 네트워크 네임스페이스); docker-fundamental/15_DNS와_서비스_디스커버리_포트_매핑의_내부_동작.md (15.1 내장 DNS 서버); Kubernetes_Internals_Network_Guide/03-네트워크/15-kube-proxy-데이터플레인-해부.md (15.1 DNAT와 conntrack), 16-DNS와-서비스-디스커버리.md (16.1 resolv.conf, 16.2 ndots:5); kubernetes-qustion-book/02_심화/06_네트워크와_서비스_노출.md (6절)*
