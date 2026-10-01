---
title: "17장. Rootless Docker의 네트워킹 구조"
---

# 17장. Rootless Docker의 네트워킹 구조

16장에서는 `iptables`가 오랫동안 담당해 온 Docker의 방화벽 규칙 관리가 Docker Engine 29부터 `nftables`
네이티브 백엔드로 옮겨가는 과정을 살펴봤습니다. 이번 장에서 다룰 주제는 그 방화벽 규칙을 애초에 만들
권한 자체가 없는 상황, 즉 dockerd가 root가 아닌 일반 사용자 권한으로 떠 있는 **Rootless Docker**에서
네트워킹이 어떻게 동작하는가입니다. 지금까지 다룬 브리지(12장), 오버레이(13장), macvlan/ipvlan(14장)은
전부 커널이 제공하는 네트워크 네임스페이스, veth pair, 브리지 디바이스를 dockerd가 root 권한으로 직접
조작한다는 전제 위에 서 있었습니다. Rootless 모드는 그 전제 자체를 걷어내기 때문에, 같은 결과(컨테이너가
격리된 네트워크를 갖고, 포트를 게시하고, 외부와 통신하는 것)를 완전히 다른 메커니즘으로 만들어내야 합니다.

## 17.1 Rootless Docker란 무엇인가

Rootless Docker는 `dockerd` 자체를 포함해 컨테이너를 실행하는 전체 스택을 root 권한 없이, 일반 사용자
계정으로 구동하는 실행 모드입니다. 여기서 혼동하기 쉬운 지점이 있는데, "루트리스"가 가리키는 대상은
**컨테이너 안의 프로세스**가 아니라 **호스트에서 dockerd를 실행하는 계정**입니다. `docker run --user`나
컨테이너 내부에서 비루트 사용자로 애플리케이션을 띄우는 것은 이미 오래전부터 가능했던 별개의 관행이고,
Rootless Docker는 그보다 한 단계 더 나아가 dockerd 프로세스 자체와 그 dockerd가 실행하는 containerd,
shim, 컨테이너 프로세스 전부가 처음부터 끝까지 호스트의 어떤 시점에도 root UID(UID 0)로 실행되지 않는다는
것을 보장합니다.

이것이 보안상 의미를 갖는 이유는 명확합니다. 일반적인(rootful) Docker 구성에서는 dockerd가 root 권한으로
떠 있고, Docker 소켓(`/var/run/docker.sock`)에 접근할 수 있는 사용자는 사실상 호스트의 root 권한을 얻은
것과 다르지 않습니다. 컨테이너 런타임 자체의 취약점이나 설정 실수로 컨테이너 탈출(container escape)이
일어났을 때, 탈출한 프로세스가 마주치는 것이 root 권한으로 떠 있는 dockerd라면 호스트 전체가 뚫리는
결과로 이어지기 쉽습니다. Rootless 모드에서는 설령 컨테이너 탈출이 일어나더라도, 탈출한 프로세스가 얻는
권한은 dockerd를 실행한 일반 사용자 계정의 권한으로 제한됩니다. 즉 공격 표면 자체를 없애는 것이 아니라,
탈출에 성공했을 때 공격자가 도달할 수 있는 최종 권한의 상한선을 낮추는 방어 전략입니다.

이 구조는 2장에서 다룬 user namespace를 빼놓고는 설명할 수 없습니다. Rootless Docker는 `rootlesskit`이라는
별도 도구를 통해 dockerd 자신을 user namespace 안에서 실행합니다. 일반 사용자가 `unshare(CLONE_NEWUSER)`로
새 user namespace를 만들면, 그 namespace 안에서는 자신을 UID 0(root)으로 매핑할 수 있습니다. 즉 namespace
내부에서는 root처럼 보이고 root처럼 동작하지만, `/etc/subuid`/`/etc/subgid`에 정의된 UID/GID 범위를 통해
호스트에서는 여전히 원래의 비특권 사용자로 매핑됩니다. dockerd, containerd, 그리고 그 안에서 실행되는
컨테이너 프로세스들은 이 user namespace 매핑 위에서 동작하기 때문에, 컨테이너 안에서 `id` 명령을 치면
`uid=0(root)`가 나오지만 호스트의 `ps -ef`로 보면 그 프로세스는 일반 사용자 UID로 보입니다. 2장에서 이미
다룬 것처럼 user namespace 자체는 Rootless Docker만의 전유물이 아니라 일반적인 컨테이너 격리 메커니즘의
하나지만, Rootless Docker는 "컨테이너의 격리"뿐 아니라 "dockerd라는 데몬 자체의 격리"까지 이 메커니즘
위에 올려놓았다는 점이 다릅니다.

## 17.2 근본 문제 — 비루트 사용자는 네트워크 네임스페이스를 마음대로 다룰 수 없다

문제는 user namespace를 확보하는 것만으로는 네트워킹이 저절로 해결되지 않는다는 데 있습니다. 리눅스
커널은 네트워크 네임스페이스 생성 자체는 `CLONE_NEWNET` 플래그로 비교적 자유롭게 허용하지만(user
namespace 안에서라면), 그 네트워크 네임스페이스를 실제로 쓸모 있게 만드는 작업, 즉 veth pair를 만들어
호스트 네임스페이스와 컨테이너 네임스페이스를 연결하고, 브리지 디바이스에 그 veth를 붙이고, 라우팅
테이블과 iptables/nftables 규칙을 조작하는 작업은 대부분 호스트의 root 권한이나 `CAP_NET_ADMIN` capability를
요구합니다. 더 근본적으로는, veth pair의 한쪽 끝을 만든 user namespace 바깥의 다른 네임스페이스(즉 호스트의
기본 네트워크 네임스페이스)로 옮기는 작업 자체가 일반 사용자 권한으로는 허용되지 않습니다. 12장에서 다룬
`docker0` 브리지와 veth pair 구조를 rootful Docker가 만드는 방식 그대로 rootless 환경에서 재현하는 것은
커널 권한 모델상 원천적으로 막혀 있는 셈입니다.

이 제약을 풀 수 없다면 남는 선택지는 하나뿐입니다. 커널의 네트워크 스택을 직접 조작하는 대신, **네트워크
패킷 처리 자체를 유저스페이스 프로세스로 옮기는 것**입니다. 컨테이너 안에서 발생하는 이더넷 프레임을
커널이 라우팅하게 하는 대신, 그 프레임을 통째로 붙잡아 일반 프로세스가 파싱하고, 필요하면 호스트의 일반
소켓 API(`socket()`, `connect()`, `bind()` 같은 비특권 시스템 콜)를 통해 실제 통신을 대신 수행해주는 방식입니다.
이것이 뒤에서 설명할 슬립(slirp) 계열 유저모드 네트워크 스택들이 존재하는 이유이며, RootlessKit이 그
중간에서 이 전환을 조율하는 역할을 맡습니다.

## 17.3 RootlessKit의 구조 — TAP 인터페이스로 우회하는 트래픽

RootlessKit은 Rootless Docker(그리고 Podman 등 다른 rootless 컨테이너 런타임)가 공통으로 의존하는
사용자 공간 도구로, dockerd를 감싸는 형태로 동작합니다. 핵심 아이디어는 두 개의 네트워크 네임스페이스를
두는 것입니다. 하나는 dockerd를 실제로 실행하는 사용자가 원래 속해 있던 네임스페이스(부모/호스트
네임스페이스)이고, 다른 하나는 RootlessKit이 `unshare`로 새로 만든 네트워크 네임스페이스(자식 네임스페이스)로,
dockerd와 그 아래 모든 컨테이너가 이 자식 네임스페이스 안에서 실행됩니다. 이렇게 분리하는 이유 중 하나는
호스트 네임스페이스의 abstract Unix 소켓 같은 리소스를 컨테이너 프로세스로부터 격리하기 위해서이기도
합니다.

문제는 이 두 네임스페이스를 이어주는 통로입니다. 일반적인 rootful 환경이라면 veth pair로 두 네임스페이스를
연결하겠지만, 앞서 설명했듯 그 방식은 비특권 사용자에게 허용되지 않습니다. 대신 RootlessKit은 자식
네트워크 네임스페이스 안에 **TAP 디바이스**를 하나 만듭니다. TAP 디바이스는 커널 입장에서는 평범한
네트워크 인터페이스처럼 보이지만, 그 인터페이스로 들어오고 나가는 이더넷 프레임을 커널이 라우팅하는 대신
그 프레임을 읽고 쓸 수 있는 문자 디바이스(`/dev/net/tun`)를 통해 유저스페이스 프로세스에게 그대로
넘겨줍니다. 즉 컨테이너가 패킷을 보내면 그 패킷은 물리 NIC나 브리지로 가는 대신 TAP 디바이스를 거쳐
RootlessKit이 실행한 유저모드 네트워크 스택 프로세스로 전달되고, 그 프로세스가 패킷의 내용(주로 TCP/UDP
페이로드)을 해석해서 호스트의 평범한 소켓 API로 다시 실제 통신을 수행합니다. 응답이 오면 그 반대 경로를
거쳐 TAP 디바이스를 통해 다시 컨테이너 네트워크 네임스페이스 안으로 주입됩니다.

이 구조를 그림으로 정리하면 다음과 같습니다.

```
[컨테이너] --- (veth/브리지, 자식 netns 내부에서는 평범하게 동작) --- [자식 netns의 TAP 디바이스]
                                                                        │
                                                          (이더넷 프레임을 유저스페이스로 전달)
                                                                        ▼
                                              [유저모드 네트워크 스택 프로세스]
                                              (slirp4netns / pasta / gvisor-tap-vsock)
                                                                        │
                                                (일반 사용자 권한의 소켓 API로 실제 통신 수행)
                                                                        ▼
                                                        [호스트의 부모 netns / 물리 네트워크]
```

여기서 중요한 것은 컨테이너 내부, 그리고 자식 네트워크 네임스페이스 내부에서는 여전히 dockerd가 12장에서
다룬 것과 비슷하게 자체 브리지와 veth pair를 만들어 컨테이너들을 서로 연결한다는 점입니다. 즉 자식
네임스페이스 "안쪽"의 위상은 rootful 환경과 크게 다르지 않습니다. 다만 그 자식 네임스페이스를 호스트의
실제 네트워크로 연결하는 마지막 한 구간만이 커널 라우팅 대신 유저스페이스 프록시로 대체된다는 것이
Rootless 네트워킹의 본질입니다. 이 한 구간이 유저스페이스를 거치기 때문에 필연적으로 커널 네이티브 경로
대비 처리량과 지연 시간에서 오버헤드가 발생하고, 이 오버헤드의 크기와 성격이 바로 다음 절에서 다룰
백엔드 선택 문제로 이어집니다.

## 17.4 2026년의 핵심 변화 — slirp4netns에서 gvisor-tap-vsock으로

이 유저모드 네트워크 스택 자리에 실제로 무엇을 꽂을 것인가는 Rootless Docker의 역사에서 여러 차례
바뀌어 온 지점입니다. 오랫동안 사실상의 기본값으로 자리잡았던 것은 **slirp4netns**였습니다. slirp4netns는
이름 그대로 1990년대에 만들어진 오래된 유저모드 TCP/IP 스택 구현인 "slirp" 계보를 네트워크 네임스페이스
환경에 맞게 이식한 C 언어 코드베이스입니다. 오래되었다는 것은 안정적이고 검증되었다는 뜻이기도 하지만,
동시에 C로 작성된 네트워크 패킷 파싱 코드 특유의 메모리 안전성 문제(버퍼 오버플로, use-after-free류
취약점)에서 자유롭지 않다는 뜻이기도 합니다. 유저모드 네트워크 스택은 컨테이너가 보내는 임의의 패킷을
파싱하는 코드이므로, 이 코드에 취약점이 있다면 컨테이너에서 조작한 패킷으로 그 유저모드 스택 프로세스
자체를 공격하는 경로가 열립니다. Rootless 모드를 쓰는 근본 목적이 "탈출 이후의 피해 반경을 줄이는 것"인데,
정작 그 마지막 방어선인 네트워크 스택 자체가 오래된 C 코드라는 것은 아이러니한 약점으로 지적되어 왔습니다.

이런 배경에서 Docker 25.0부터는 RootlessKit 기반의 **pasta**가 실험적인 대안으로 제공되기 시작했습니다.
pasta는 slirp 계열과 달리 컨테이너의 네트워크 설정(IP 주소, 라우팅)을 호스트의 실제 네트워크 설정과 최대한
그대로 반영하는 방식(passt/pasta의 설계 목표 자체가 "패킷을 변환하지 않고 그대로 통과시킨다"는 것에
가깝습니다)으로 동작해서, slirp4netns보다 나은 처리량과 지연 시간을 보이고 호스트 네트워크와의 통합
(예: 컨테이너가 호스트와 같은 서브넷에 있는 것처럼 보이게 하는 것)도 더 매끄럽다는 평가를 받았습니다.
다만 이 시점까지는 pasta가 기본값으로 승격되지는 않았고, slirp4netns가 설치되어 있으면 여전히 그쪽이
우선적으로 선택되는 구조였습니다.

2026년 현재 시점에서 가장 크게 달라진 지점은 여기입니다. **Docker v29.5부터 Rootless 모드의 기본 네트워크
드라이버가 slirp4netns에서 gvisor-tap-vsock으로 교체되었습니다.** gvisor-tap-vsock은 이름에서 짐작할 수
있듯 gVisor 프로젝트(4장에서 다룬, 유저스페이스에서 시스템 콜을 가로채 재구현하는 컨테이너 런타임
샌드박스와 같은 계보의 프로젝트)에서 파생된 네트워크 스택 구현으로, C가 아닌 **순수 Go 언어**로 작성되어
있습니다. Go는 메모리 안전성을 언어 차원에서 보장하는 가비지 컬렉션 언어이므로, slirp4netns가 겪어온
유형의 메모리 손상 취약점 클래스 자체가 원천적으로 줄어듭니다. Docker 프로젝트가 이 교체를 "성능 개선"이
아니라 명시적으로 "보안 강화"의 문맥에서 설명하고 있다는 점도 특징적입니다. 이 변화와 함께 최신 Docker
패키징에서는 slirp4netns가 더 이상 기본으로 함께 설치되지 않는 방향으로 정리되었으며, 필요하다면
RootlessKit의 네트워크 드라이버 설정을 통해 여전히 slirp4netns나 pasta를 명시적으로 선택할 수 있습니다.

세 가지 백엔드의 위치를 정리하면 다음과 같습니다.

| 항목 | slirp4netns | pasta | gvisor-tap-vsock |
|---|---|---|---|
| 구현 언어 | C | C (passt/pasta 코드베이스) | Go |
| 계보 | 1990년대 QEMU용 slirp의 재구현 | passt 프로젝트의 하위 도구 | gVisor 프로젝트에서 파생 |
| Docker 도입 시점 | Rootless Docker 초기(2019년경)부터 사실상 기본값 | Docker 25.0부터 실험적 옵션으로 제공 | Docker v29.5부터 신규 기본값 |
| 성능 특성 | 유저모드 스택 중 상대적으로 느린 편 | slirp4netns 대비 처리량/지연에서 우위, 호스트와의 통합이 매끈함 | pasta와 유사하거나 그 이상의 성능을 목표로 설계 |
| 보안 특성 | 오래된 C 코드베이스, 메모리 안전성 이슈 이력 존재 | 비교적 최신 C 코드베이스 | Go로 작성되어 메모리 안전성 취약점 클래스가 구조적으로 감소 |
| 2026년 현재 기본값 여부 | 과거 기본값이었으나 v29.5부터 후순위로 밀림 | 기본값은 아니며 명시적 선택 옵션 | Docker v29.5부터 신규 기본값 |

이 표에서 눈여겨볼 점은 "더 빠른 것"이 반드시 기본값으로 채택되지는 않았다는 사실입니다. 순수한 처리량만
놓고 보면 pasta가 gvisor-tap-vsock과 비슷하거나 우열을 가리기 어려운 경우도 보고되지만, Docker 프로젝트가
최종적으로 기본값으로 선택한 것은 구현 언어 수준의 메모리 안전성을 확보한 gvisor-tap-vsock이었습니다.
이는 Rootless 모드 자체가 "성능보다 보안을 우선하는 실행 모드"라는 정체성과 일관된 선택이라고 볼 수
있습니다.

## 17.5 Rootless 모드의 성능·기능 제약

유저스페이스를 경유하는 구조는 필연적으로 몇 가지 제약을 동반합니다. 실무에서 특히 자주 부딪히는 지점을
정리하면 다음과 같습니다.

**1024 미만 포트 바인딩.** 리눅스 커널은 전통적으로 1024 미만의 포트(이른바 well-known port)에 소켓을
`bind()`하는 것을 `CAP_NET_BIND_SERVICE` capability를 가진 프로세스에게만 허용합니다. Rootless 모드의
dockerd는 root가 아니므로 이 capability를 기본적으로 갖고 있지 않고, 따라서 컨테이너를 호스트의 80번이나
443번 포트에 직접 게시하려고 하면 권한 오류를 만나게 됩니다. 해결 방법은 몇 가지가 있는데, 가장 흔한
것은 호스트 커널의 `net.ipv4.ip_unprivileged_port_start` sysctl 값을 낮춰서 비특권 사용자도 해당 포트
이상을 바인드할 수 있게 허용하는 것이고, 그 외에 RootlessKit의 포트 드라이버 설정을 통해 우회하거나,
아예 리버스 프록시(예: 호스트의 nginx나 별도의 rootful 포트 포워더)를 앞단에 두어 1024 이상 포트로 받은
트래픽을 컨테이너로 넘기는 방식도 흔히 쓰입니다.

**호스트 네트워크와의 ping/ICMP 제약.** 유저모드 네트워크 스택은 TCP/UDP 소켓 API를 대리 수행하는 방식으로
동작하기 때문에, 이 API로 표현하기 애매한 ICMP Echo(ping) 요청은 백엔드에 따라 별도의 특수 처리가
필요합니다. 백엔드와 커널 설정(예: `net.ipv4.ping_group_range`)에 따라 컨테이너 안에서 외부 호스트로
ping이 되지 않거나 제한적으로만 동작하는 경우가 있으므로, 네트워크 연결성 자체가 문제인지 단순히 ICMP
경로만 막힌 것인지 구분해서 디버깅해야 합니다.

**macvlan/ipvlan처럼 물리 인터페이스에 직접 접근해야 하는 드라이버.** 14장에서 다룬 것처럼 macvlan과
ipvlan은 컨테이너에 물리 NIC(또는 그 서브인터페이스)를 사실상 그대로 노출시켜, 컨테이너가 물리 네트워크
세그먼트에 자체 MAC/IP 주소를 갖고 직접 나타나도록 하는 드라이버입니다. 이 드라이버들은 본질적으로 호스트의
물리 인터페이스를 커널 레벨에서 조작해야 하므로, 유저스페이스로 우회된 Rootless 네트워크 구조와는 전제
자체가 충돌합니다. 결과적으로 macvlan/ipvlan은 Rootless 모드에서 기본적으로 사용하기 어렵거나 별도의
권한 상승(특정 capability 부여, 혹은 애초에 rootful 데몬과의 병행 구성) 없이는 지원되지 않는다고 보는
것이 안전합니다. 물리망에 직접 붙어야 하는 워크로드라면 Rootless 모드보다는 rootful Docker에 다른
보안 계층(예: gVisor나 Kata 같은 4장에서 다룬 대안 런타임, 혹은 seccomp/AppArmor 강화)을 얹는 쪽이 더
현실적인 절충안일 수 있습니다.

## 17.6 실습 — 설치와 네트워크 설정 확인

Rootless Docker를 설치하고 네트워크 관련 상태를 확인하는 절차를 실제로 따라가 보겠습니다. 아래 명령은
일반 사용자 계정(root가 아닌)에서 실행합니다.

```bash
# 1) 사전 준비 패키지 확인(배포판에 따라 다름 — uidmap, dbus-user-session 등)
# Debian/Ubuntu 계열 예시
sudo apt-get install -y uidmap dbus-user-session

# 2) Docker 바이너리는 이미 설치되어 있다는 전제 하에, rootless 셋업 도구 실행
dockerd-rootless-setuptool.sh install

# 3) systemd 사용자 유닛으로 rootless 데몬 상태 확인
systemctl --user status docker

# 4) CLI가 rootless 컨텍스트를 쓰고 있는지 확인
docker context ls
```

설치가 끝나면 `docker info`로 현재 어떤 보안 옵션과 네트워크 구성이 적용되어 있는지 확인할 수 있습니다.

```bash
docker info
```

출력 중 `Security Options` 항목에 `rootless`가 표시되는지, 그리고 어떤 네트워크 드라이버가 실제로
쓰이고 있는지를 확인하는 것이 핵심입니다. 어떤 백엔드가 선택되었는지는 RootlessKit 프로세스의 실행
인자를 직접 들여다보는 편이 가장 확실합니다.

```bash
# rootlesskit 프로세스와 그 자식으로 뜬 유저모드 네트워크 스택 프로세스를 확인
ps -ef | grep -E "rootlesskit|slirp4netns|pasta|gvisor-tap-vsock"
```

특정 백엔드를 명시적으로 지정하고 싶다면 systemd 사용자 유닛에 오버라이드를 추가합니다.

```bash
mkdir -p ~/.config/systemd/user/docker.service.d
cat <<'EOF' > ~/.config/systemd/user/docker.service.d/override.conf
[Service]
Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_NET=gvisor-tap-vsock"
EOF

systemctl --user daemon-reload
systemctl --user restart docker
```

마지막으로 1024 미만 포트 바인딩 제약을 실제로 체감해 보고, sysctl 조정 후 어떻게 달라지는지 비교해
봅니다.

```bash
# 실패 사례 재현: 컨테이너를 호스트 80번 포트로 바로 게시
docker run -d -p 80:80 nginx:latest   # 대부분 권한 오류로 실패

# 비특권 포트 허용 범위를 낮춘 뒤 재시도(호스트 root 권한 필요 — rootless 데몬 자체와는 별개의 커널 설정)
sudo sysctl net.ipv4.ip_unprivileged_port_start=80
docker run -d -p 80:80 nginx:latest   # 이제 성공하는지 확인
```

## 핵심 요약

- Rootless Docker는 dockerd를 포함한 전체 스택을 root 권한 없이 실행하는 모드로, 컨테이너 탈출이 발생해도
  공격자가 도달하는 최종 권한을 일반 사용자 수준으로 제한하는 것이 목적입니다. 2장의 user namespace를
  이용해 컨테이너 안에서는 root처럼 보이지만 호스트에서는 비특권 UID로 매핑됩니다.
- 비루트 사용자는 veth pair를 다른 네트워크 네임스페이스로 옮기거나 브리지를 구성하는 등 커널 네트워크
  스택을 직접 조작할 권한이 없습니다. 이 제약 때문에 RootlessKit은 TAP 디바이스를 통해 패킷을 유저스페이스
  프로세스로 우회시키는 구조를 씁니다.
- 그 유저스페이스 프로세스 자리를 채우는 백엔드가 slirp4netns(오래된 C 코드, 오랜 기본값) → pasta
  (RootlessKit 기반, Docker 25.0+ 실험적 대안, 성능과 호스트 통합 우위) → **gvisor-tap-vsock(순수 Go,
  Docker v29.5부터 신규 기본값)** 순으로 변화해왔으며, 2026년 현재는 보안(메모리 안전성)을 이유로
  gvisor-tap-vsock이 기본값입니다.
- Rootless 모드는 1024 미만 포트 바인딩, ping/ICMP, 그리고 물리 인터페이스에 직접 접근해야 하는
  macvlan/ipvlan(14장)에서 제약을 갖습니다. 이런 워크로드는 sysctl 조정, 리버스 프록시, 혹은 rootful
  구성과의 병행을 고려해야 합니다.

## 실습

1. `dockerd-rootless-setuptool.sh install`로 Rootless Docker를 설치하고, `docker info`의
   `Security Options`에 `rootless`가 표시되는지 확인하세요.
2. `ps -ef | grep -E "rootlesskit|slirp4netns|pasta|gvisor-tap-vsock"`로 현재 환경에서 어떤 네트워크
   백엔드가 실제로 실행 중인지 확인하고, `DOCKERD_ROOTLESS_ROOTLESSKIT_NET` 환경변수로 다른 백엔드로
   전환해보세요.
3. 1024 미만 포트로 컨테이너를 게시해보고 실패를 재현한 다음, `net.ipv4.ip_unprivileged_port_start`
   sysctl 값을 조정해서 동일한 명령이 성공으로 바뀌는지 비교해보세요.
4. Rootless 환경에서 `docker network create -d macvlan ...`을 시도해보고 어떤 오류 메시지가 나오는지
   확인한 뒤, 14장에서 다룬 macvlan의 요구사항(물리 인터페이스 직접 접근)과 왜 충돌하는지 스스로 설명해보세요.
