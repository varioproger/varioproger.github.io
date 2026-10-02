---
title: "13장. 쿠버네티스 네트워크 모델과 Pod 네트워크"
parent: "3부. 쿠버네티스 네트워크"
grand_parent: "Linux·Docker·Kubernetes 네트워크 필수 이론"
nav_order: 13
---

# 13장. 쿠버네티스 네트워크 모델과 Pod 네트워크

> **🎮 게임 서버 개발자에게** — 서버 한 대에서 게임룸 서버 프로세스를 여러 개 띄울 때는 7777, 7778, 7779처럼 프로세스마다 포트를 다르게 `bind()`했다. 포트가 **머신 하나의 전역 자원**이라서 생기는 일이다. 쿠버네티스는 이 전제를 뒤집는다. Pod마다 자기 IP가 있고, 모든 Pod가 같은 80번을 `listen`해도 충돌하지 않는다. 결정적으로 다른 점은 두 가지다. 첫째, 이 약속을 지키는 **구현은 쿠버네티스가 아니라 플러그인(CNI)** 이 맡고 쿠버네티스는 "무엇을 만족해야 하는가"만 정한다. 둘째, Pod의 네트워크는 앱 컨테이너가 아니라 아무 일도 하지 않는 **pause 컨테이너가 쥐고 있어서**, 앱이 죽었다 살아나도 IP가 그대로다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 같은 Pod 안의 사이드카에서 `localhost:8080`으로 앱에 붙었더니 되는데, 다른 Pod에서 Pod IP로 붙으면 거부된다 → 앱이 어느 주소에 `listen`하는지, 그리고 Pod 네트워크가 무엇으로 이루어지는지 알아야 한다.
> - 컨테이너가 재시작됐는데 Pod IP는 그대로이고 어떤 때는 바뀐다 → 무엇이 네트워크를 소유하는지(pause)와 Pod가 교체되는 것의 차이를 구분해야 한다.
> - "쿠버네티스 네트워크가 안 된다"는 말을 들었을 때, Pod 네트워크·이름·Service·진입 중 어느 층의 문제인지 쪼개서 질문해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** 쿠버네티스는 "모든 Pod는 고유 IP를 갖고 NAT 없이 서로 통신한다"는 규칙(IP-per-Pod)만 정하고, 그 규칙을 지키는 실제 배선은 CNI 플러그인이 하며, Pod 하나의 네트워크 네임스페이스는 pause 컨테이너가 소유해 그 안의 컨테이너들이 IP와 포트 공간을 함께 쓴다.

1. **IP-per-Pod는 "포트를 전역 자원에서 해방"하는 계약이다** — 모든 Pod가 NAT 없이 서로·노드와 통신하고, 자기가 보는 자기 IP와 남이 보는 IP가 같다. 대가는 클러스터 규모의 평평한 네트워크를 누군가 만들어야 한다는 것이고, 그 일을 쿠버네티스가 아닌 CNI 플러그인에 위임한다.
2. **Pod는 pause가 만든 네임스페이스에 컨테이너들이 `setns`로 합류하는 것이다** — "공유"의 실체는 `/proc/<pid>/ns/*`의 inode 번호가 같다는 것이고(net·ipc·uts 공유, mnt·pid 분리), pause는 PID 1로 좀비를 수거하며 CRI `RunPodSandbox` 안에서 만들어진다. 앱이 죽어도 IP가 유지된다. `hostNetwork: true` Pod만 예외다.
3. **IP 대역은 셋(노드·Pod·Service)이고, "네트워크 문제"는 네 가지 문제의 합이다** — Pod 네트워크, 이름, Service 전달, 외부 진입은 담당 부품이 다르다. 이 책 3부는 이 지도를 한 층씩 연다.

**이 장의 학습 목표**

- 쿠버네티스 네트워크 모델의 요구사항과, 이 모델을 선택한 이유(포트 충돌 제거)를 설명한다.
- 노드 CIDR·Pod CIDR·Service CIDR 세 대역을 구분하고, ClusterIP가 실재하지 않는 주소임을 안다.
- pause의 두 가지 일과 CRI 호출, `setns` 합류와 inode 비교를 설명한다. Pod를 "손으로 조립"하는 단계가 CNI의 일과 어떻게 대응하는지 안다.
- "통신 장애"를 네 가지 문제(Pod 네트워크 / 이름 / Service 전달 / 진입)로 쪼개 의심 부품을 고른다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 한 머신에서 프로세스마다 다른 포트로 `bind`/`listen` (7777, 7778...) | IP-per-Pod | 프로세스(컨테이너)마다 독립된 수신 지점이 있다 | Pod마다 자기 네트워크 네임스페이스와 IP가 있어 모두 같은 포트(예: 80)를 써도 충돌하지 않는다. 포트가 노드 전역 자원이 아니다 |
| 같은 머신의 두 프로세스가 `127.0.0.1`로 서로 통신 | 같은 Pod의 컨테이너끼리 `localhost` 통신 | 루프백으로 서로 붙는다 | 서로 다른 컨테이너(이미지·파일시스템·PID 공간이 다름)인데도 한 네트워크 스택을 공유한다. 같은 포트를 두 컨테이너가 동시에 쓸 수는 없다 |
| 서버 프로세스가 소켓을 쥐고 있다가 죽으면 소켓도 사라짐 | pause 컨테이너가 네임스페이스를 쥠 | 소켓(네트워크 자원)은 누군가가 쥐고 있어야 유지된다 | 소유자가 앱이 아니라 "아무 일도 안 하는" 별도 프로세스다. 앱이 죽어도 IP·네임스페이스가 남는다 |
| 서버 간 접속에 설정 파일의 IP를 사용 | NAT 없는 Pod 간 직접 통신 | 상대 IP로 `connect()`한다 | Pod IP는 일회용이라 재시작·재스케줄 때 바뀐다. 그래서 Service가 따로 필요하다([16장](../3부-쿠버네티스-네트워크/16-Service와-EndpointSlice.md)) |
| 네트워크 장비 벤더가 다른 데이터센터마다 설정이 다름 | "무엇"만 정하고 "어떻게"는 CNI에 위임 | 인터페이스(계약)와 구현을 분리한다 | 쿠버네티스에는 네트워크 구현이 아예 없다. CNI 플러그인이 없으면 Pod가 네트워크를 못 받는다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 같은 노드에 nginx Pod를 3개 띄워도 모두 80번을 쓸 수 있다. Docker의 `-p 8080:80` 방식과 무엇이 다르기에 가능할까?
> 2. Pod 안의 컨테이너 하나가 크래시했다가 재시작되면 Pod IP는 바뀔까?
> 3. 한 Pod 안의 컨테이너 두 개는 무엇을 공유하고 무엇을 공유하지 않을까?
> 4. 쿠버네티스는 Pod 간 통신을 "직접 구현"할까, 아니면 다른 누군가에게 맡길까?
> 5. Service의 IP(ClusterIP)로 ping을 보내면 응답이 올까?
>
> **처리법:** 🛠 실습 `kubectl get nodes -o jsonpath=...`로 `.spec.podCIDR` 확인, 노드에서 `crictl pods` / `ls -l /proc/$PID/ns/`로 pause와 앱 컨테이너의 네임스페이스 비교, `ip netns add` → veth → `ip route add default`로 Pod 조립(리눅스 머신 필요) · 🗺 관계도 노드 → Pod → Service → 진입 네 층, "pause ⊃ netns ⊃ {앱 컨테이너들}" · 📦 카드로 IP-per-Pod 규칙 4개, 세 대역 예시(`192.168.1.0/24`, `10.244.0.0/16`, `10.96.0.0/12`), net·ipc·uts 공유 / mnt·pid 분리 · 유추 비판(A) "Pod ≈ 서버 한 대"가 어디서 깨지는지 적어 보기

---

## 코어 1. IP-per-Pod는 "포트를 전역 자원에서 해방"하는 계약이다

### 1.1 세 규칙과 한 예외 — 경계 조건

**한 줄 요약:** 모든 Pod는 NAT 없이 다른 모든 Pod 및 노드와 통신하고, 자기가 보는 IP와 남이 보는 IP가 같다. `hostNetwork` Pod만 예외다.

> **입문 책에서 배운 것:** IP-per-Pod 네 규칙과, 그 덕에 같은 노드의 nginx 셋이 모두 80번을 쓴다는 것. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md)

> **[보충]** 원천끼리 4번째 규칙의 정의가 다르다. `Kubernetes_Internals_Network_Guide`는 4번째를 "hostNetwork 예외"로, `kubernetes-textbook-main`은 4번째를 "Pod가 보는 자기 IP = 남이 보는 IP"로 센다. 이 책은 앞의 원천을 따라 세 규칙 + hostNetwork 예외로 정리한다.

1. **Pod ↔ Pod: NAT 없음.** 노드가 같든 다르든 상관없다.
2. **노드 → Pod: NAT 없음.** kubelet의 헬스체크, 노드에서 실행되는 에이전트가 Pod IP로 직접 접근할 수 있어야 한다.
3. **Pod가 인식하는 자기 IP = 다른 Pod가 보는 그 Pod의 IP.** Pod 내부에서든 외부에서든 주소 체계가 갈라지지 않는다.
4. **예외 — `hostNetwork: true`.** 별도의 네트워크 네임스페이스 없이 노드의 네트워크 네임스페이스를 그대로 공유한다. 이 Pod의 IP는 곧 노드의 IP이고, 포트도 노드와 공유한다.

```
┌─────────────────────────── 노드 A ───────────────────────────┐
│  netns(Pod-1) 10.244.1.2   netns(Pod-2) 10.244.1.3            │
│         │                          │                          │
│         └──────────┬───────────────┘                          │
│                  루트 netns (노드 자체)                        │
│                  eth0: 192.168.1.10                            │
└──────────────────────────────┬────────────────────────────────┘
                                │  (NAT 없이 직접 라우팅)
┌──────────────────────────────┴────────────────────────────────┐
│                            노드 B                              │
│         eth0: 192.168.1.11                                     │
│  netns(Pod-3) 10.244.2.4   netns(Pod-4) hostNetwork            │
│                              (노드 IP 192.168.1.11 그대로 사용) │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 포트 매핑이 떠넘기던 네 가지 비용

**한 줄 요약:** 포트 매핑은 포트를 노드 전역 자원으로 만들고 그 비용을 앱·디스커버리·스케줄러에 퍼뜨린다. IP-per-Pod는 이를 한꺼번에 없애는 대신 평평한 네트워크를 요구한다.

> **입문 책에서 배운 것:** 포트 매핑에서는 포트가 전역 자원이라 nginx마다 8080·8081로 나눠야 한다. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md), Docker의 포트 매핑 내부는 [8장](../2부-Docker-네트워크/08-브리지-네트워크와-포트-게시.md)

입문 책이 "포트 충돌"로 요약한 문제를 원천은 **네 가지 비용**으로 나눈다. 설계자들은 이 복잡도를 **애플리케이션 개발자에게 떠넘기지 않기로** 했다(앱이 VM 위에서처럼 동작).

- 포트가 노드 단위의 전역 자원이 된다.
- 애플리케이션이 "내가 몇 번 포트로 노출됐는지" 알아야 한다.
- 서비스 디스커버리가 "호스트IP:포트" 쌍을 추적해야 한다.
- 스케줄러가 포트 충돌까지 고려해 배치해야 한다.

대가는 분명하다. **평평한 라우팅 가능 네트워크를 클러스터 규모로 만들어야 한다.** 노드가 3개든 3,000개든 이 평평함이 유지돼야 한다. 그 평평함을 누가, 어떻게 만드는지가 3부의 [14장](14-CNI-스펙과-IPAM.md)·[15장](15-CNI-플러그인과-패킷-경로.md)의 주제다.

### 1.3 왜 쿠버네티스가 직접 구현하지 않았는가

**한 줄 요약:** 네트워크 구현은 환경마다 달라서 "무엇을 만족해야 하는가"만 정하고 "어떻게 만드는가"는 플러그인 계약(CNI)으로 위임했다.

네트워크 구현은 환경마다 완전히 다르다. 베어메탈, 클라우드 VPC, 온프레미스 SDN, 에어갭 환경마다 최선의 구현이 다르고, 조직마다 기존에 쓰던 네트워크 정책 도구도 다르다. 쿠버네티스가 특정 구현을 강제했다면 그 구현이 맞지 않는 환경에서는 쿠버네티스 자체를 못 썼을 것이다. 그래서 요구사항만 정하고 구현은 **CNI 플러그인**이라는 계약으로 위임했다.

> **[보충]** C++ 개발자 입장에서는 "순수 가상 클래스(인터페이스)만 쿠버네티스가 정의하고, 구현 클래스는 Flannel·Calico·Cilium 등이 제공한다"는 구도로 보면 된다. 원천에는 이 비유가 없고, 원천은 컨트롤러 패턴이 "무엇을"과 "어떻게"를 분리한 것과 같은 철학이라고 설명한다.

## 코어 2. Pod는 pause가 소유한 네트워크 네임스페이스를 컨테이너들이 공유하는 것이다

### 2.1 pause의 정체 — PID 1, 그리고 누가 어떤 RPC로 만드는가

**한 줄 요약:** pause는 시그널을 기다리며 잠든 채 네임스페이스를 유지하고 좀비를 수거하는 아주 짧은 프로그램이며, 런타임이 CRI `RunPodSandbox` 안에서 만든다.

> **입문 책에서 배운 것:** pause가 NET·IPC·UTS를 소유해 앱이 재시작돼도 Pod IP가 유지된다. → [입문 책 15장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/3부-쿠버네티스-핵심/15-Pod.md)

pause(인프라 컨테이너·샌드박스라고도 부른다)의 소스는 놀랍도록 짧다.

```c
/* pause.c — 핵심만 */
static void sigdown(int signo) { _exit(0); }
static void sigreap(int signo) {
    while (waitpid(-1, NULL, WNOHANG) > 0);   /* 좀비 수거 */
}

int main() {
    signal(SIGINT,  sigdown);
    signal(SIGTERM, sigdown);
    signal(SIGCHLD, sigreap);
    for (;;) pause();          /* 시그널이 올 때까지 잠든다 */
}
```

pause는 두 가지 일을 한다. ① 네임스페이스를 살아 있게 유지한다(프로세스가 살아 있어야 네임스페이스가 유지된다). ② PID 1로서 좀비 프로세스를 수거한다. 두 번째는 `shareProcessNamespace: true`인 Pod에서 pause가 PID 1이 되는 이유다.

이 네임스페이스는 누가 만드는가. kubelet은 컨테이너 런타임에 CRI(gRPC)로 `RunPodSandbox`를 요청한다. 샌드박스는 "Pod의 네트워크 네임스페이스를 쥐고 있는 단위"이고, 이 요청 **안에서** 런타임이 pause 컨테이너를 만들고 CNI를 호출한다([14장](14-CNI-스펙과-IPAM.md)). CRI의 `RuntimeService`는 샌드박스와 컨테이너를 **별개의 RPC 묶음**으로 나눠 둔다.

- 샌드박스 RPC: `RunPodSandbox`(pause 컨테이너 생성 + 이 안에서 CNI 호출) / `StopPodSandbox` / `RemovePodSandbox` 등
- 컨테이너 RPC: `CreateContainer` / `StartContainer` / `StopContainer` 등

> **[보충]** 원천은 RPC 이름만 나열하고 호출 순서·역할 구분을 적지 않는다. 샌드박스가 앱 컨테이너보다 먼저 생기고 샌드박스 RPC가 Pod 네트워크 단위의 수명을 다룬다는 것은 이 책의 해석이다.

> **[보충]** C++ 소켓에 빗대면 pause는 "`socket()`으로 만든 리스닝 소켓의 fd를 대신 쥐고 있는 부모 프로세스"에 가깝다. 다만 pause가 쥐는 것은 소켓 하나가 아니라 인터페이스·IP·라우팅 테이블 전체(네트워크 네임스페이스)다. 이 비유는 원천에 없는 학습용이다.

### 2.2 "공유"의 커널 실체 — setns와 inode 번호

**한 줄 요약:** 컨테이너가 pause의 네임스페이스에 "합류"하는 것은 `setns` 시스템콜이고, 공유 여부는 `/proc/<pid>/ns/*`의 inode 번호가 같은지로 확인한다.

> **입문 책에서 배운 것:** NET·IPC·UTS 공유, MNT·PID 분리, 파일은 볼륨으로만 공유. → [입문 책 15장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/3부-쿠버네티스-핵심/15-Pod.md)

"공유"가 커널에서 정확히 무엇인지는 원천(`kubernetes-textbook-main` 19.1)이 정리한다. 네임스페이스를 다루는 시스템콜은 셋뿐이다.

| 시스템콜 | 하는 일 | 명령행 도구 |
|---|---|---|
| `clone(CLONE_NEW*)` | 새 네임스페이스와 함께 프로세스 생성 | `unshare --fork` |
| `unshare(CLONE_NEW*)` | 현재 프로세스를 새 네임스페이스로 분리 | `unshare` |
| `setns(fd, type)` | **기존 네임스페이스에 합류** | `nsenter` |

원천은 "**`setns`가 Pod의 핵심**"이라고 정리한다. 네임스페이스는 `/proc/<pid>/ns/`(`ls -l /proc/self/ns/`, `lsns -t net`)에 `net:[4026531840]` 형식으로 보이고, **대괄호 안 숫자가 inode 번호이며 두 프로세스가 같은 번호면 같은 네임스페이스를 공유한다.** 노드에서 샌드박스(pause)와 앱 컨테이너를 비교한다.

```bash
# 샌드박스(pause) 목록
crictl pods

# 특정 Pod의 샌드박스 상세
crictl inspectp <POD_ID> | jq '.status.metadata, .info.pid'

# 그 PID의 네임스페이스
POD_PID=$(crictl inspectp <POD_ID> | jq -r '.info.pid')
ls -l /proc/$POD_PID/ns/

# 같은 Pod의 앱 컨테이너
crictl ps --pod <POD_ID>
APP_PID=$(crictl inspect <CONTAINER_ID> | jq -r '.info.pid')
ls -l /proc/$APP_PID/ns/
```

두 출력을 비교하면 `net`, `ipc`, `uts`는 inode 번호가 같고(공유), `mnt`, `pid`는 다르다(분리). 런타임이 OCI 런타임(runc)에 넘기는 `config.json`에서 네임스페이스 설정을 직접 볼 수도 있다.

```bash
docker exec k8s-guide-worker sh -c \
  'find /run/containerd -name config.json 2>/dev/null | head -1 | xargs cat' | jq '.linux.namespaces, .linux.resources.memory'
```

(출력 예는 원천에 없다.) 결과적으로 한 Pod의 컨테이너들은 **같은 IP, 같은 포트 공간**을 쓴다. 그래서 서로 `localhost`로 통신할 수 있고, 같은 포트를 두 컨테이너가 동시에 쓸 수는 없다.

> **[보충]** "같은 포트를 동시에 쓸 수 없다"는 점은 원천이 한 문장으로 직접 적은 것이 아니라, "같은 IP, 같은 포트 공간" 공유와 서술에서 이끌어 낸 귀결이다. 같은 노드의 다른 Pod끼리는 netns가 달라 같은 포트를 써도 충돌하지 않는다는 점과 대비해 기억하면 된다.

네임스페이스 개념 자체는 [3장](../1부-리눅스-네트워크-기초/03-네트워크-네임스페이스.md)에서 다룬다.

### 2.3 Pod를 손으로 조립해 보기 — CNI의 일이 무엇인지

**한 줄 요약:** 빈 네임스페이스 만들기(pause) → veth로 연결하고 IP·게이트웨이 설정(CNI)이 Pod 네트워크의 전부이며, 컨테이너를 죽여도 IP가 유지된다.

원천(`kubernetes-textbook-main` 19.3)은 루트 권한이 있는 리눅스 머신(kind 노드 안이 안전)에서 Pod를 손으로 조립한다. 네트워크 부분만 옮긴다. 단계 1·2와 연결 확인은 원천의 명령 그대로이고, 컨테이너 A·B 실행은 원천에서 cgroup 등록·`echo` 출력 줄을 뺀 축약본이다.

```bash
# 단계 1: "pod-lab"이라는 네트워크 네임스페이스 = 우리의 pause
ip netns add pod-lab
ip netns exec pod-lab ip addr         # lo 하나뿐이고 DOWN 상태
```

```bash
# 단계 2: 네트워크 구성 (CNI 역할)
ip netns exec pod-lab ip link set lo up                  # ① 루프백 활성화
ip link add veth-host type veth peer name veth-pod       # ② veth 페어 생성
ip link set veth-pod netns pod-lab                       # ③ 한쪽 끝을 네임스페이스 안으로
ip netns exec pod-lab ip link set veth-pod name eth0     # ④ Pod 쪽 인터페이스 설정
ip netns exec pod-lab ip addr add 10.99.0.2/24 dev eth0
ip netns exec pod-lab ip link set eth0 up
ip addr add 10.99.0.1/24 dev veth-host                   # ⑤ 호스트 쪽 설정
ip link set veth-host up
ip netns exec pod-lab ip route add default via 10.99.0.1 # ⑥ Pod의 기본 게이트웨이
```

```bash
ping -c 2 10.99.0.2                          # 호스트 → Pod
ip netns exec pod-lab ping -c 2 10.99.0.1    # Pod → 호스트

# 외부 통신을 원한다면 NAT
iptables -t nat -A POSTROUTING -s 10.99.0.0/24 ! -o veth-host -j MASQUERADE
sysctl -w net.ipv4.ip_forward=1
ip netns exec pod-lab ping -c 2 8.8.8.8
```

원천은 "**우리가 만든 것이 Pod IP다**. `10.99.0.2`가 이 Pod의 주소다"라고 말한다. 그리고 컨테이너를 이 네임스페이스에 합류시킨다.

```bash
# 네트워크는 pod-lab에 합류, MNT/PID는 새로 만든다 (컨테이너 A: HTTP 서버)
ip netns exec pod-lab \
  unshare --mount --pid --fork --mount-proc \
  bash -c 'python3 -m http.server 8080' &

# 컨테이너 B: localhost로 A를 호출하면 성공한다 (NET 공유), ps에는 A가 안 보인다 (PID 분리)
ip netns exec pod-lab unshare --mount --pid --fork --mount-proc \
  bash -c 'curl -s localhost:8080 | head -5; ps aux'
```

앞 절의 inode 비교는 손으로 만든 Pod에도 적용된다. `ip netns pids pod-lab`로 찾은 PID마다 `readlink /proc/$p/ns/net`은 같고 `ns/pid`·`ns/mnt`는 달라야 한다. 원천은 "net은 같고 pid/mnt는 다르다. 이것이 Pod의 정의다"라고 정리한다. 마지막 단계가 pause의 존재 이유를 보여 준다.

```bash
# container-a를 죽인다
kill %1

# 네임스페이스와 IP는 그대로 살아 있다
ip netns exec pod-lab ip addr show eth0 | grep inet
# inet 10.99.0.2/24 ...                    ← 유지됨!
```

원천은 "pause 컨테이너(여기서는 `ip netns`가 만든 네임스페이스 파일)가 있기 때문에 IP가 보존된다"고 정리한다. 이 책의 관점에서 중요한 대응은 다음이다.

| 손으로 한 일 | 실제 쿠버네티스에서 누가 | 장 |
|---|---|---|
| `ip netns add pod-lab` (빈 네임스페이스) | 런타임이 `RunPodSandbox`로 만드는 pause 샌드박스 | 이 장 |
| veth 만들기, IP·게이트웨이 설정 | CNI 플러그인 (`ADD` 호출) | [14장](14-CNI-스펙과-IPAM.md) |
| `ip netns exec pod-lab unshare --mount --pid ...` (net 합류, mnt·pid 새로) | 각 앱 컨테이너의 격리와 합류 (`setns`) | 이 장 |
| 노드 간 경로 만들기 | 같은 CNI 플러그인이 고른 방식(오버레이/라우팅) | [15장](15-CNI-플러그인과-패킷-경로.md) |

> **[보충]** 이 실습은 이 책을 쓰는 환경(Windows)에서는 실행되지 않았고, 원천의 명령을 그대로 옮긴 것이다. 리눅스 머신에서 직접 실행해 확인하길 권한다. 정리는 `ip netns delete pod-lab`, `ip link delete veth-host`, 추가한 MASQUERADE 규칙 삭제 순이다.

### 2.4 예외: hostNetwork

**한 줄 요약:** `hostNetwork: true`이면 Pod의 IP는 노드 IP이고 포트도 노드와 공유한다.

`hostNetwork: true` Pod는 별도의 네트워크 네임스페이스를 갖지 않고 노드의 네트워크 네임스페이스를 그대로 쓴다. 포트도 노드와 공유되므로 "Pod마다 자기 포트 공간을 갖는다"는 IP-per-Pod의 성질이 이 Pod에는 해당하지 않는다.

> **[보충]** 원천은 hostNetwork Pod의 IP가 노드 IP이고 포트를 노드와 공유한다는 사실만 적는다. "그래서 같은 노드에 같은 포트를 쓰는 hostNetwork Pod 둘이 뜨면 충돌한다", "노드의 서버 프로세스 포트와 부딪힌다"는 귀결은 원천에 없는 추론이므로, 실제 클러스터에서 확인한 뒤 판단한다.

## 코어 3. IP 대역은 셋이고, "네트워크 문제"는 네 가지 문제의 합이다

### 3.1 IP 대역 세 가지 — 어디서 확인하고 누가 쪼개나

**한 줄 요약:** 세 대역의 정의는 입문 책에 있고, 이 장은 실제 클러스터에서 값을 읽는 위치와 Pod 대역이 노드별로 쪼개지는 경로를 잇는다.

> **입문 책에서 배운 것:** 노드·Pod·Service CIDR의 구분과, ClusterIP가 ping에 응답하지 않는다는 것. → [입문 책 21장](../../Docker%20와%20Kubernetes로%20인프라%20구축할때%20알아야하는%20필수%20이론%20지식/4부-노출-데이터-운영/21-네트워크-모델과-Service.md)

```bash
# 확인
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'
docker exec k8s-guide-control-plane grep -E 'service-cluster-ip-range|cluster-cidr' \
  /etc/kubernetes/manifests/kube-apiserver.yaml /etc/kubernetes/manifests/kube-controller-manager.yaml
```

첫 명령의 `.spec.podCIDR`이 노드별 Pod 대역이다. 이 값을 누가 클러스터 CIDR에서 잘라 기록하는지와 노드 수 상한 계산은 [14장](14-CNI-스펙과-IPAM.md) 코어 3이다. 둘째 명령은 kube-apiserver·kube-controller-manager 매니페스트에서 `service-cluster-ip-range`와 `cluster-cidr`를 grep한다. 원천은 이 명령의 출력 예를 주지 않으므로 어느 값이 어느 매니페스트에 있는지는 직접 확인한다. ClusterIP를 실제 Pod IP로 바꾸는 규칙은 [16장](16-Service와-EndpointSlice.md), [17장](17-kube-proxy-데이터플레인.md)에서 이어진다.

### 3.2 통신은 네 가지 서로 다른 문제다

**한 줄 요약:** Pod 네트워크, 이름, Service 전달, 외부 진입은 담당 부품이 달라서 "쿠버네티스 네트워크가 안 된다"로 합치면 원인 추적이 어려워진다.

`kubernetes-qustion-book`은 통신을 네 문제로 나눈다.

| 문제 | 의도 또는 대상 | 실제 구현 주체 | 이 책 |
|---|---|---|---|
| Pod가 통신할 인터페이스와 IP 필요 | Pod 네트워크 | CNI 플러그인과 노드 네트워크 구성 | 13&#126;15장 |
| 교체되는 Pod를 안정적인 이름으로 찾기 | Service와 DNS 이름 | CoreDNS와 API 대상 정보 | 16·18장 |
| Service 주소로 들어온 패킷을 Pod로 보내기 | Service, EndpointSlice | kube-proxy 또는 대체 데이터 경로 구현 | 16·17장 |
| 외부 HTTP를 앱으로 연결하기 | Ingress 또는 Gateway API | 해당 controller와 실제 LB·프록시 | 19장 |

원천의 경고를 그대로 옮긴다. DNS 응답이 맞아도 Pod까지 패킷이 못 갈 수 있고, Pod IP로 접속돼도 Service selector가 틀릴 수 있다. 그래서 장애는 층을 나눠 자른다.

```
① 앱이 Pod 안에서 실제 주소와 포트에 listen하는가? (127.0.0.1만 듣고 있으면 Pod IP 접근은 실패할 수 있다)
② Pod Ready와 Service selector가 맞는가? EndpointSlice에 대상과 포트가 있는가?
③ 호출 Pod에서 DNS가 해석되는가? DNS 서버까지의 연결은 허용됐는가?
④ DNS 대신 Service IP 또는 대상 Pod IP로 시험했을 때 어느 경계에서 달라지는가?
⑤ 외부 경로에서 LB listener·health check·target·Security Group이 맞는가?
```

이 책의 3부 전체 지도는 다음과 같다.

```
[13~15장] Pod 네트워크: pause가 쥔 netns + CNI가 배선 + 노드 간 패킷 운반
      │
[16~17장] Service 전달: Service/EndpointSlice(목록) + kube-proxy(규칙) → 커널이 DNAT
      │
[18장]    이름: CoreDNS가 Service 이름을 ClusterIP로
      │
[19장]    진입: Ingress/Gateway가 외부 HTTP를 Service로
```

패킷이 처음부터 끝까지 지나는 전체 그림은 [1장](../0부-큰-그림/01-패킷-한-개의-여정.md)에, 진단 플로차트는 [23장](../4부-진단/23-네트워크-장애-진단.md)에 있다.

## 실무 적용

### 체크리스트

- [ ] 쿠버네티스 네트워크 모델: Pod 간 NAT 없음, 노드↔Pod NAT 없음, Pod가 보는 자기 IP = 남이 보는 IP. `hostNetwork: true`만 노드의 네임스페이스·IP·포트를 공유하는 예외다.
- [ ] 쿠버네티스는 요구사항만 정의하고 구현은 CNI 플러그인에 위임한다. Pod가 IP를 못 받으면 CNI를 의심한다.
- [ ] 한 Pod의 컨테이너들은 net·ipc·uts를 공유하고 mnt·pid를 분리한다. 서로 `localhost`로 통신하며 같은 포트를 동시에 쓸 수 없다.
- [ ] 네임스페이스는 pause(샌드박스)가 쥐고 있어 앱 컨테이너가 재시작돼도 Pod IP는 유지된다. Pod 자체가 교체되면 IP는 바뀐다(Pod IP는 일회용).
- [ ] 노드 CIDR / Pod CIDR / Service CIDR을 구분한다. ClusterIP는 어떤 인터페이스에도 없으므로 ping 무응답이 장애가 아니다.
- [ ] 서버 앱은 Pod IP로 접근되려면 `127.0.0.1`이 아니라 Pod의 주소에서 `listen`해야 한다. 내부 접속에 Pod IP를 하드코딩하지 않는다.
- [ ] 통신 장애는 Pod 네트워크 / 이름 / Service 전달 / 진입 네 층으로 나눠 의심 부품을 고른다.

### 시나리오로 확인하기

1. **상황:** 게임 로비 서버 Pod에 로그 수집 사이드카가 붙어 있다. 사이드카가 `localhost:8080`으로 로비 서버 지표를 읽는 데는 문제가 없는데, 다른 Pod에서 로비 서버 Pod IP로 8080에 접속하면 연결이 거부된다.
   **질문:** 의심할 곳은?

   <details markdown="1"><summary>답 확인</summary>

   같은 Pod의 컨테이너는 네트워크 네임스페이스를 공유하므로 `localhost`로 붙는 것은 앱이 루프백에서 듣고 있기만 해도 된다. 다른 Pod가 Pod IP로 붙으려면 앱이 Pod IP로 들어오는 접속을 받는 주소(예: `0.0.0.0`)에서 `listen`해야 한다. `bind(127.0.0.1)`로 열어 두었다면 Pod IP 접근은 실패할 수 있다(`kubernetes-qustion-book`의 진단 1단계: "127.0.0.1만 들으면 Pod IP 접근은 실패할 수 있다"). 소켓 코드의 `bind` 주소부터 확인한다. → 코어 2, 코어 3

   </details>

2. **상황:** 로비 서버 Pod 안의 앱 컨테이너가 OOM으로 한 번 재시작됐다. 모니터링에서 Pod IP가 바뀌지 않았다. 다른 날 Deployment 롤링 업데이트 뒤에는 Pod IP가 바뀌었다.
   **질문:** 왜 한 번은 유지되고 한 번은 바뀌었나?

   <details markdown="1"><summary>답 확인</summary>

   네트워크 네임스페이스와 IP는 앱 컨테이너가 아니라 pause 컨테이너(샌드박스)가 소유한다. 앱 컨테이너만 재시작되면 pause가 그대로라 IP가 유지된다. 롤링 업데이트는 Pod 자체를 새로 만들어 새 샌드박스와 새 IP를 받으므로 바뀐다. Pod IP는 일회용이라는 뜻이며, 그래서 접속에는 Service가 필요하다. → 코어 2

   </details>

3. **상황:** 운영자가 "클러스터 네트워크가 다 죽었다"고 보고한다. 확인해 보니 `curl 로비서비스`가 실패한다.
   **질문:** "네트워크 문제"를 무엇부터 쪼개 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   하나의 문제가 아니라 네 가지 문제(Pod 네트워크·이름·Service 전달·진입)이고, 원천은 이를 다섯 단계로 자르라고 한다. ① 앱이 실제 주소·포트에서 listen하는가 ② Pod Ready와 Service selector, EndpointSlice에 대상이 있는가 ③ 호출 Pod에서 DNS가 해석되는가 ④ DNS 대신 Service IP 또는 Pod IP로 시험했을 때 어느 경계에서 달라지는가 ⑤ 외부 경로라면 LB·health check·Security Group. 이 순서로 자르면 Pod 네트워크(CNI)의 문제인지, 이름·Service·진입의 문제인지 갈린다. → 코어 3

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] IP-per-Pod 규칙: Pod↔Pod NAT ( ? ) / 노드↔Pod NAT ( ? ) /
         Pod가 보는 자기 IP = ( ? ) / 예외 = ( ? ): true
  이유: 포트 매핑이면 포트가 ( ? ) 자원 → IP-per-Pod는 포트 ( ? ) 없음
  구현 주체: 쿠버네티스 ( ? ), ( ? ) 플러그인이 구현

[코어 2] Pod 네임스페이스의 소유자 = ( ? ) 컨테이너 (하는 일 2가지: 네임스페이스 유지 / ( ? ) 수거)
  샌드박스 생성: kubelet →(CRI) ( ? ) → 런타임이 pause 생성 + ( ? ) 호출
  기존 netns에 합류하는 시스템콜 = ( ? ) (새로 만드는 것은 clone / ( ? ))
  공유 검증: /proc/<pid>/ns/* 의 ( ? ) 번호가 같다 → 공유: net / ( ? ) / ( ? )   분리: ( ? ) / ( ? )
  손 조립: ip netns add → ip link add type ( ? ) → 한쪽을 netns에 넣기 → IP·( ? ) 설정
  앱 컨테이너가 죽으면 Pod IP는 ( ? )

[코어 3] IP 대역: 노드 CIDR(실재) / Pod CIDR(( ? )가 라우팅) / Service CIDR(( ? ) IP)
  통신의 네 문제: Pod 네트워크 / ( ? ) / Service 전달 / ( ? )
```

### 2. 인출 질문

1. 쿠버네티스 네트워크 모델의 요구사항을 세 규칙 + 예외로 말해 보라.

   <details markdown="1"><summary>답 확인</summary>

   모든 Pod는 NAT 없이 다른 모든 Pod와 통신하고, 모든 노드는 NAT 없이 모든 Pod와 통신하며, Pod가 인식하는 자기 IP는 다른 Pod가 보는 그 IP와 같다. 예외는 `hostNetwork: true` Pod로, 노드의 네트워크 네임스페이스를 공유해 IP도 포트도 노드와 같다. → 코어 1 (1.1)

   </details>

2. 포트 매핑 방식의 문제 네 가지와 IP-per-Pod가 이를 어떻게 푸는지 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   포트 매핑에서는 포트가 노드 단위 전역 자원이 되고, 앱이 자기가 몇 번 포트로 노출됐는지 알아야 하며, 서비스 디스커버리가 "호스트IP:포트" 쌍을 추적해야 하고, 스케줄러가 포트 충돌까지 고려해야 한다. IP-per-Pod에서는 Pod마다 고유 IP를 받아 표준 포트를 그대로 쓰므로 포트 충돌 자체가 없고 앱은 VM 위에서처럼 동작한다. → 코어 1 (1.2)

   </details>

3. 쿠버네티스가 네트워크를 직접 구현하지 않은 이유는?

   <details markdown="1"><summary>답 확인</summary>

   베어메탈, 클라우드 VPC, 온프레미스 SDN, 에어갭 등 환경마다 최선의 구현이 다르고 조직마다 쓰던 정책 도구도 다르다. 특정 구현을 강제하면 맞지 않는 환경에서 쿠버네티스를 쓸 수 없으므로, 요구사항만 정하고 구현은 CNI라는 플러그인 계약으로 위임했다. → 코어 1 (1.3)

   </details>

4. pause 프로그램의 두 가지 일(코드 수준)과, 샌드박스를 만드는 CRI 호출은?

   <details markdown="1"><summary>답 확인</summary>

   ① `pause()`로 잠든 채 살아 있어 네임스페이스 유지, ② PID 1로서 `SIGCHLD`를 받아 `waitpid`로 좀비 수거. kubelet이 CRI `RunPodSandbox`를 요청하면 런타임이 그 안에서 pause 컨테이너를 만들고 CNI를 호출한다. 앱 컨테이너는 `CreateContainer`/`StartContainer` 등 별도 RPC다. → 코어 2 (2.1)

   </details>

5. 컨테이너가 pause의 네임스페이스에 "합류"하는 시스템콜은? net 공유·mnt/pid 분리는 노드에서 어떻게 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   `setns(fd, type)`(`clone`/`unshare`는 새로 만든다). `/proc/<pid>/ns/*`의 inode 번호가 같으면 같은 네임스페이스이므로, `crictl inspectp`/`inspect`로 얻은 PID로 `ls -l /proc/$PID/ns/`를 비교하면 `net`·`ipc`·`uts`는 같고 `mnt`·`pid`는 다르다. → 코어 2 (2.2)

   </details>

6. `ip netns` 손 조립에서 "CNI가 하는 일"에 해당하는 단계, 공유·분리의 검증법, 컨테이너를 죽여도 IP가 유지되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   빈 네임스페이스(pause 역할)를 만든 뒤, veth 페어를 만들어 한쪽을 네임스페이스에 넣고 `eth0` 이름·IP·기본 게이트웨이를 설정하는 단계가 CNI의 일이다. `ip netns pids pod-lab`의 각 PID에서 `readlink /proc/$p/ns/net`(같음)·`pid`·`mnt`(다름)를 비교한다. 네임스페이스 파일(pause 역할)이 살아 있어 IP가 남는다. → 코어 2 (2.2, 2.3)

   </details>

7. `hostNetwork: true` Pod에서 IP-per-Pod의 어떤 이점이 사라지는가?

   <details markdown="1"><summary>답 확인</summary>

   별도 네트워크 네임스페이스가 없고 노드의 네임스페이스를 공유하므로 Pod IP가 노드 IP이고 포트도 노드와 공유한다. Pod마다 독립된 포트 공간을 갖는다는 이점이 사라진다. → 코어 2 (2.4)

   </details>

8. 실제 클러스터에서 노드별 Pod CIDR과 클러스터의 Pod·Service 대역 설정은 어디서 읽나? Pod CIDR을 노드마다 쪼개는 층은 어느 장이 다루나?

   <details markdown="1"><summary>답 확인</summary>

   `kubectl get nodes -o jsonpath`로 `.spec.podCIDR`을 읽고, kube-apiserver·kube-controller-manager 매니페스트를 `grep -E 'service-cluster-ip-range|cluster-cidr'`한다. 클러스터 CIDR을 노드별로 쪼개 기록하는 층과 노드 수 상한 계산은 14장 코어 3이다. → 코어 3 (3.1)

   </details>

9. 통신의 네 가지 문제와 각 담당 부품을 말해 보라.

   <details markdown="1"><summary>답 확인</summary>

   Pod 네트워크(CNI 플러그인과 노드 네트워크 구성), Service와 DNS 이름(CoreDNS와 API 대상 정보), Service 주소 패킷의 Pod 전달(Service, EndpointSlice, kube-proxy 또는 대체 데이터 경로), 외부 HTTP 연결(Ingress/Gateway API와 controller, 실제 LB·프록시). → 코어 3 (3.2)

   </details>

### 3. 기억 고리

- **C++ 유추:** Pod ≈ 서버 한 대(자기 IP, 자기 포트 공간). 한 Pod의 컨테이너들 ≈ 같은 머신 위의 여러 프로세스(`127.0.0.1`로 통신). ⚠️ 깨지는 곳: 컨테이너들은 파일시스템·PID 공간이 분리돼 있고(mnt·pid), IP는 일회용이며 Pod가 교체되면 바뀐다. 그리고 "머신의 NIC 설정"을 하는 주체는 OS가 아니라 CNI 플러그인이다.
- **비유:** pause = 아파트 세대의 "전화 회선 계약자". 세대원(앱 컨테이너)이 나갔다 들어와도 회선(IP)은 그대로다. ⚠️ 비유가 깨지는 지점: 세대원이 전부 이사 가는 것(Pod 교체)은 회선도 함께 새로 받는 것이고, 회선을 놓아 주는 일은 pause의 의지가 아니라 샌드박스 삭제 때 CNI가 `DEL`로 정리한다.
- **묶음(3의 법칙):** 규칙 3개(Pod↔Pod, 노드↔Pod, 자기 IP = 남이 보는 IP) + 예외 1개 / 대역 3개(노드·Pod·Service) / 공유 3개(net·ipc·uts) vs 분리 2개(mnt·pid) / 네임스페이스 시스템콜 3개(`clone`·`unshare`·`setns`) / pause의 일 2개(유지·좀비 수거).
- **대칭·순서:** 3부 지도 — Pod 네트워크(13&#126;15) → Service 전달(16&#126;17) → 이름(18) → 진입(19). 대비 쌍: 포트 매핑(포트=전역 자원) ↔ IP-per-Pod(포트 충돌 없음).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "왜 쿠버네티스에서는 nginx 3개가 모두 80번을 쓸 수 있는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "컨테이너가 죽었다 살아나도 Pod IP가 안 바뀌는 이유"를 소켓·프로세스 언어로 설명해 보세요.
- **랜덤 논리 게임:** A "쿠버네티스가 네트워크를 표준 구현으로 내장해야 한다" vs B "요구사항만 정하고 CNI에 위임하는 것이 옳다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 IP-per-Pod와 pause 컨테이너의 역할을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 3개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: Kubernetes_Internals_Network_Guide/03-네트워크/13-네트워킹-모델과-CNI-스펙.md (13.1 쿠버네티스 네트워크 모델의 4대 요구사항); kubernetes-textbook-main/03-애플리케이션-노출과-데이터/09-서비스와-클러스터-네트워킹-기초.md (9.1 쿠버네티스 네트워크 모델, IP 대역 세 가지); kubernetes-textbook-main/05-내부-동작-파헤치기/19-Pod를-밑바닥부터-만들어-보기.md (19.1 세 개의 시스템콜·네임스페이스 inode, 19.2 pause 컨테이너의 역할, 19.3 Pod를 손으로 만들기 단계 6, 19.7 계층별 대응표의 runc config.json); Kubernetes_Internals_Network_Guide/01-내부-아키텍처/06-kubelet-런타임-kube-proxy-개요.md (6.2 CRI 아키텍처, RuntimeService의 샌드박스·컨테이너 RPC); kubernetes-qustion-book/02_심화/06_네트워크와_서비스_노출.md (네 가지 문제, 통신 장애 계층 분리)*
