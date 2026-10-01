---
title: "19장. Pod를 밑바닥부터 만들어 보기"
---

# 19장. Pod를 밑바닥부터 만들어 보기

> **학습목표**
> - 리눅스 네임스페이스·cgroup·capability·union FS를 정리하고 각각의 경계를 실험으로 확인한다.
> - pause 컨테이너가 네임스페이스를 소유하는 구조를 재현할 수 있다.
> - `unshare`, `ip netns`, `cgcreate`만으로 Pod와 동등한 격리 환경을 만들 수 있다.
> - cgroup v1과 v2의 차이를 이해하고 kubelet이 만드는 계층 구조를 읽을 수 있다.

---

## 들어가며

5부는 지금까지 "이렇게 동작한다"고 설명해 온 것들의 **내부를 직접 연다.**

첫 장의 목표는 명확하다. **`kubectl` 없이, 컨테이너 런타임 없이, 오직 리눅스 명령만으로 Pod를 만든다.** 2장에서 조각조각 실험했던 것을 하나로 조립하는 셈이다.

이 작업이 왜 가치가 있는가? 완성하고 나면 다음 문장들이 추상적 설명이 아니라 **직접 만들어 본 것**이 되기 때문이다.

- "Pod 안의 컨테이너는 localhost로 통신한다"
- "Pod IP는 컨테이너가 재시작해도 유지된다"
- "limits.memory를 넘으면 OOMKilled 된다"
- "컨테이너는 그냥 프로세스다"

## 19.1 리눅스 프리미티브 총정리

### 컨테이너를 이루는 것들

```
┌───────────────────────────────────────────────────┐
│                   "컨테이너"                        │
│                                                   │
│  namespaces   무엇을 볼 수 있는가                    │
│    PID, NET, MNT, UTS, IPC, USER, CGROUP, TIME    │
│                                                   │
│  cgroups      얼마나 쓸 수 있는가                    │
│    cpu, memory, io, pids, hugetlb                 │
│                                                   │
│  capabilities 무엇을 할 수 있는가                    │
│    CAP_NET_ADMIN, CAP_SYS_ADMIN, ...              │
│                                                   │
│  union FS     파일 시스템을 어떻게 쌓는가             │
│    overlayfs (lowerdir + upperdir → merged)       │
│                                                   │
│  seccomp/LSM  어떤 시스템콜을 호출할 수 있는가        │
│    seccomp-bpf, AppArmor, SELinux                 │
└───────────────────────────────────────────────────┘
```

**"컨테이너"라는 커널 객체는 존재하지 않는다.** 위 기능들을 조합한 프로세스를 우리가 컨테이너라고 부를 뿐이다. `ps aux`로 호스트에서 보면 그냥 프로세스다.

### 현재 프로세스의 네임스페이스 확인

```bash
ls -l /proc/self/ns/
```
```
lrwxrwxrwx cgroup -> 'cgroup:[4026531835]'
lrwxrwxrwx ipc    -> 'ipc:[4026531839]'
lrwxrwxrwx mnt    -> 'mnt:[4026531841]'
lrwxrwxrwx net    -> 'net:[4026531840]'
lrwxrwxrwx pid    -> 'pid:[4026531836]'
lrwxrwxrwx time   -> 'time:[4026531834]'
lrwxrwxrwx user   -> 'user:[4026531837]'
lrwxrwxrwx uts    -> 'uts:[4026531838]'
```

**대괄호 안의 숫자가 네임스페이스의 inode 번호다.** 두 프로세스가 같은 번호를 가지면 같은 네임스페이스를 공유하는 것이다. 이 사실이 뒤에서 Pod를 검증하는 도구가 된다.

```bash
lsns                    # 시스템의 모든 네임스페이스 목록
lsns -t net             # 네트워크 네임스페이스만
```

### 세 개의 시스템콜

네임스페이스를 다루는 시스템콜은 셋뿐이다.

| 시스템콜 | 하는 일 | 명령행 도구 |
|---|---|---|
| `clone(CLONE_NEW*)` | 새 네임스페이스와 함께 프로세스 생성 | `unshare --fork` |
| `unshare(CLONE_NEW*)` | 현재 프로세스를 새 네임스페이스로 분리 | `unshare` |
| `setns(fd, type)` | **기존 네임스페이스에 합류** | `nsenter` |

**`setns`가 Pod의 핵심이다.** pause 컨테이너가 만든 네임스페이스에 다른 컨테이너들이 합류하는 것이 바로 이 호출이다.

## 19.2 pause 컨테이너의 역할

### 왜 필요한가

5.1절에서 예고한 내용을 이제 정확히 설명할 수 있다.

**문제 상황**: Pod에 컨테이너 A와 B가 있고 네트워크를 공유해야 한다. 누가 네임스페이스를 소유해야 할까?

```
[방안 1] A가 소유하고 B가 합류
  → A가 크래시하면 네임스페이스가 사라진다
  → B의 네트워크도 끊기고, Pod IP가 바뀐다  ✗

[방안 2] 별도의 "빈" 프로세스가 소유
  → A, B가 모두 죽었다 살아나도 네임스페이스는 유지
  → Pod IP가 보존된다  ✓
```

**방안 2의 그 빈 프로세스가 pause다.** 인프라 컨테이너(infra container) 또는 샌드박스라고도 부른다.

### pause의 전부

소스 코드가 놀랍도록 짧다.

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

**두 가지 일을 한다.**
1. 네임스페이스를 살아 있게 유지한다(프로세스가 살아 있어야 네임스페이스가 유지된다)
2. **PID 1로서 좀비 프로세스를 수거한다**

두 번째가 중요하다. PID 네임스페이스에서 PID 1은 고아 프로세스를 입양해 `wait()`으로 정리할 의무가 있다. 이것을 하지 않으면 좀비가 쌓인다. `shareProcessNamespace: true`인 Pod에서 pause가 PID 1이 되는 이유다.

### 실제로 확인하기

```bash
docker exec -it k8s-guide-worker bash

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

**두 출력을 비교하면**:
- `net`, `ipc`, `uts` → **inode 번호가 같다** (공유)
- `mnt`, `pid` → **다르다** (분리)

**5장에서 표로 배운 내용이 커널 데이터로 확인된다.**

## 19.3 실습: Pod를 손으로 만들기

이제 조립한다. **루트 권한이 있는 리눅스 머신**이 필요하다. kind 노드 안에서 하는 것이 안전하다.

```bash
docker exec -it k8s-guide-worker bash
apt-get update -qq && apt-get install -y -qq iproute2 procps util-linux curl 2>/dev/null || true
```

### 단계 1: 네트워크 네임스페이스 만들기 (pause 역할)

```bash
# "pod-lab"이라는 네트워크 네임스페이스 = 우리의 pause
ip netns add pod-lab

# 확인
ip netns list
ls -l /var/run/netns/pod-lab
```

```bash
# 안을 들여다보면 lo 하나뿐이고 DOWN 상태다
ip netns exec pod-lab ip addr
```
```
1: lo: <LOOPBACK> mtu 65536 state DOWN
    link/loopback 00:00:00:00:00:00
```

**CNI 플러그인이 하는 일이 바로 이 빈 네임스페이스를 채우는 것이다**(23장).

### 단계 2: 네트워크 구성 (CNI 역할)

```bash
# ① 루프백 활성화 — localhost 통신에 필수
ip netns exec pod-lab ip link set lo up

# ② veth 페어 생성 (가상 랜선 한 쌍)
ip link add veth-host type veth peer name veth-pod

# ③ 한쪽 끝을 네임스페이스 안으로 넣는다
ip link set veth-pod netns pod-lab

# ④ Pod 쪽 인터페이스 설정
ip netns exec pod-lab ip link set veth-pod name eth0
ip netns exec pod-lab ip addr add 10.99.0.2/24 dev eth0
ip netns exec pod-lab ip link set eth0 up

# ⑤ 호스트 쪽 설정
ip addr add 10.99.0.1/24 dev veth-host
ip link set veth-host up

# ⑥ Pod의 기본 게이트웨이
ip netns exec pod-lab ip route add default via 10.99.0.1
```

**연결 확인**

```bash
ping -c 2 10.99.0.2                          # 호스트 → Pod
ip netns exec pod-lab ping -c 2 10.99.0.1    # Pod → 호스트
```

**우리가 만든 것이 Pod IP다.** `10.99.0.2`가 이 Pod의 주소다.

```bash
# 외부 통신을 원한다면 NAT
iptables -t nat -A POSTROUTING -s 10.99.0.0/24 ! -o veth-host -j MASQUERADE
sysctl -w net.ipv4.ip_forward=1
ip netns exec pod-lab ping -c 2 8.8.8.8
```

### 단계 3: cgroup으로 자원 제한

```bash
# cgroup 버전 확인
stat -fc %T /sys/fs/cgroup/
# cgroup2fs → v2
```

**cgroup v2 기준**

```bash
# Pod 수준 cgroup
mkdir -p /sys/fs/cgroup/pod-lab

# 하위 컨트롤러 활성화
echo "+cpu +memory +pids" > /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || true
echo "+cpu +memory +pids" > /sys/fs/cgroup/pod-lab/cgroup.subtree_control

# Pod 전체 제한 (limits와 대응)
echo "20000 100000" > /sys/fs/cgroup/pod-lab/cpu.max        # 0.2 코어
echo $((256*1024*1024)) > /sys/fs/cgroup/pod-lab/memory.max # 256Mi
echo 100 > /sys/fs/cgroup/pod-lab/pids.max

# 컨테이너별 하위 cgroup
mkdir -p /sys/fs/cgroup/pod-lab/container-a
mkdir -p /sys/fs/cgroup/pod-lab/container-b

echo $((128*1024*1024)) > /sys/fs/cgroup/pod-lab/container-a/memory.max
echo $((64*1024*1024))  > /sys/fs/cgroup/pod-lab/container-b/memory.max
```

**이 계층 구조가 kubelet이 만드는 것과 같은 모양이다.**

```
/sys/fs/cgroup/
└── kubepods.slice/                                  ← 모든 Pod의 부모
    ├── kubepods-besteffort.slice/                   ← QoS 클래스별 (14장)
    ├── kubepods-burstable.slice/
    │   └── kubepods-burstable-pod<UID>.slice/       ← Pod 하나
    │       ├── cri-containerd-<pause-id>.scope
    │       ├── cri-containerd-<container-a-id>.scope
    │       └── cri-containerd-<container-b-id>.scope
    └── (Guaranteed는 kubepods.slice 바로 아래)
```

실제로 확인해 보자.

```bash
find /sys/fs/cgroup/kubepods.slice -maxdepth 2 -type d 2>/dev/null | head -20
```

### 단계 4: 컨테이너 A 실행

```bash
# 별도 터미널을 열거나 백그라운드로

# 네트워크는 pod-lab에 합류, MNT/PID는 새로 만든다
ip netns exec pod-lab \
  unshare --mount --pid --fork --mount-proc \
  bash -c '
    # 자신을 cgroup에 등록
    echo $$ > /sys/fs/cgroup/pod-lab/container-a/cgroup.procs

    hostname                                    # UTS는 호스트와 공유 상태
    echo "=== container-a ==="
    echo "PID: $$"                              # 1이어야 한다
    ip addr show eth0 | grep inet               # Pod IP

    # 간단한 HTTP 서버
    while true; do
      printf "HTTP/1.1 200 OK\r\nContent-Length: 21\r\n\r\nhello from container-a" | nc -l -p 8080 -q 1
    done
  ' &
```

`nc`가 없으면 python으로 대체한다.

```bash
ip netns exec pod-lab unshare --mount --pid --fork --mount-proc \
  bash -c 'echo $$ > /sys/fs/cgroup/pod-lab/container-a/cgroup.procs;
           python3 -m http.server 8080' &
```

### 단계 5: 컨테이너 B 실행 — localhost 통신 확인

```bash
ip netns exec pod-lab \
  unshare --mount --pid --fork --mount-proc \
  bash -c '
    echo $$ > /sys/fs/cgroup/pod-lab/container-b/cgroup.procs
    echo "=== container-b ==="
    echo "PID: $$"
    echo "--- localhost로 container-a 호출 ---"
    curl -s localhost:8080 | head -5
    echo "--- ps 출력 (PID 네임스페이스 분리) ---"
    ps aux
  '
```

**결과가 이것이다.**

```
=== container-b ===
PID: 1                              ← 자기만의 PID 네임스페이스
--- localhost로 container-a 호출 ---
(container-a의 응답)                 ← NET 네임스페이스 공유!
--- ps 출력 ---
PID  COMMAND
1    bash                           ← container-a의 프로세스는 안 보임
```

**Pod를 만들었다.**

- 두 프로세스가 **같은 IP, 같은 포트 공간**을 쓴다 → localhost 통신 성공
- 각자 **다른 PID 네임스페이스**를 갖는다 → 서로의 프로세스가 안 보임
- 각자 **다른 MNT 네임스페이스**를 갖는다 → 파일 시스템 분리
- 각자 **다른 cgroup**에서 자원이 제한된다

### 단계 6: 네임스페이스 공유 검증

```bash
# 두 프로세스의 PID를 찾는다
PIDS=$(ip netns pids pod-lab)
echo "$PIDS"

for p in $PIDS; do
  echo "=== PID $p ==="
  readlink /proc/$p/ns/net    # 같아야 한다
  readlink /proc/$p/ns/pid    # 달라야 한다
  readlink /proc/$p/ns/mnt    # 달라야 한다
done
```

**net은 같고 pid/mnt는 다르다.** 이것이 Pod의 정의다.

### 단계 7: 메모리 제한 확인

```bash
ip netns exec pod-lab unshare --pid --fork \
  bash -c '
    echo $$ > /sys/fs/cgroup/pod-lab/container-b/cgroup.procs
    echo "메모리 한도: $(cat /sys/fs/cgroup/pod-lab/container-b/memory.max)"
    python3 -c "
import sys
data = []
for i in range(1, 30):
    data.append(bytearray(10*1024*1024))
    print(f\"allocated {i*10}MB\", flush=True)
"
  '
```

```
allocated 10MB
...
allocated 60MB
Killed                    ← 64Mi 한도 초과
```

```bash
echo $?
# 137                     ← 14장에서 본 exitCode
```

**`OOMKilled`의 정체를 직접 만들었다.**

### 단계 8: 컨테이너가 죽어도 IP가 유지되는지 확인

```bash
# container-a를 죽인다
kill %1

# 네임스페이스와 IP는 그대로 살아 있다
ip netns exec pod-lab ip addr show eth0 | grep inet
# inet 10.99.0.2/24 ...                    ← 유지됨!

# 새 프로세스가 같은 네임스페이스에 합류
ip netns exec pod-lab hostname -I
```

**pause 컨테이너(여기서는 `ip netns`가 만든 네임스페이스 파일)가 있기 때문에 IP가 보존된다.** 이것이 5.1절에서 설명한 그 구조다.

### 정리

```bash
ip netns delete pod-lab
ip link delete veth-host 2>/dev/null
rmdir /sys/fs/cgroup/pod-lab/container-a /sys/fs/cgroup/pod-lab/container-b
rmdir /sys/fs/cgroup/pod-lab
iptables -t nat -D POSTROUTING -s 10.99.0.0/24 ! -o veth-host -j MASQUERADE 2>/dev/null
```

## 19.4 cgroup v1과 v2

### 구조의 차이

**cgroup v1 — 컨트롤러마다 별도 계층**

```
/sys/fs/cgroup/
├── cpu/
│   └── kubepods/podXXX/containerYYY/
├── memory/
│   └── kubepods/podXXX/containerYYY/
├── blkio/
├── pids/
└── ...
```

같은 프로세스를 **각 컨트롤러 계층에 따로 등록**해야 한다. 계층이 서로 다를 수도 있어 혼란스러웠다.

**cgroup v2 — 단일 통합 계층**

```
/sys/fs/cgroup/
└── kubepods.slice/
    └── kubepods-burstable.slice/
        └── kubepods-burstable-podXXX.slice/
            ├── cgroup.controllers
            ├── cgroup.subtree_control
            ├── cpu.max
            ├── memory.max
            └── cri-containerd-YYY.scope/
```

**하나의 트리에 모든 컨트롤러가 있다.** 프로세스는 정확히 하나의 cgroup에만 속한다.

### 파일 이름 대조표

| 항목 | v1 | v2 |
|---|---|---|
| CPU 상한 | `cpu.cfs_quota_us` / `cpu.cfs_period_us` | `cpu.max` ("quota period") |
| CPU 가중치 | `cpu.shares` (2~262144) | `cpu.weight` (1~10000) |
| CPU 통계 | `cpu.stat` | `cpu.stat` |
| 메모리 상한 | `memory.limit_in_bytes` | `memory.max` |
| 메모리 소프트 | `memory.soft_limit_in_bytes` | `memory.high` ★ |
| 현재 사용량 | `memory.usage_in_bytes` | `memory.current` |
| PID 제한 | `pids.max` | `pids.max` |
| 프로세스 등록 | `tasks` / `cgroup.procs` | `cgroup.procs` |

### v2의 중요한 개선

**① `memory.high` — 부드러운 제한**

v1에는 하드 리밋뿐이라 넘으면 즉시 OOM Kill이었다. v2의 `memory.high`는 **넘으면 회수 압력을 가하고 프로세스를 스로틀링**한다. 죽이지 않고 늦춘다.

```bash
echo $((200*1024*1024)) > memory.high      # 이 지점부터 압력
echo $((256*1024*1024)) > memory.max       # 이 지점에서 OOM Kill
```

**② PSI (Pressure Stall Information)**

자원 경합으로 인한 지연을 정량화한다.

```bash
cat /sys/fs/cgroup/kubepods.slice/cpu.pressure
```
```
some avg10=2.34 avg60=1.87 avg300=1.02 total=12345678
full avg10=0.00 avg60=0.00 avg300=0.00 total=0
```

- **`some`**: 최소 하나의 태스크가 대기한 시간 비율
- **`full`**: 모든 태스크가 대기한 시간 비율

`memory.pressure`와 `io.pressure`도 있다. **kubelet의 축출 판단(14.4절)이 점점 PSI 기반으로 이동하고 있다.** CPU 사용률보다 "실제로 얼마나 답답한가"를 잘 나타내는 지표다.

**③ 위임(delegation)**

`cgroup.subtree_control`로 하위 계층에 컨트롤러 관리 권한을 넘길 수 있다. 컨테이너 안에서 다시 cgroup을 만드는 중첩 컨테이너 시나리오에 필요하다.

### 어느 것을 쓰는가

**v2가 표준이다.**
- Fedora 31+, Ubuntu 21.10+, RHEL 9+, Debian 11+ 가 기본 v2
- 쿠버네티스는 v1.25부터 cgroup v2를 GA로 지원
- v1은 유지보수 모드

```bash
# 클러스터 노드의 cgroup 버전 확인
kubectl get nodes -o json | jq -r '.items[].status.nodeInfo.kernelVersion'
docker exec k8s-guide-worker stat -fc %T /sys/fs/cgroup/
```

## 19.5 overlayfs 직접 만들기

2.4절에서 개념만 봤던 union filesystem을 조립해 본다.

```bash
mkdir -p /tmp/ofs/{lower1,lower2,upper,work,merged}

# 하위 레이어들 (이미지 레이어에 해당)
echo "from layer 1" > /tmp/ofs/lower1/a.txt
echo "from layer 1" > /tmp/ofs/lower1/shared.txt
echo "from layer 2" > /tmp/ofs/lower2/b.txt
echo "from layer 2 (overrides)" > /tmp/ofs/lower2/shared.txt

# 합치기 (lowerdir은 오른쪽이 아래, 왼쪽이 위)
mount -t overlay overlay \
  -o lowerdir=/tmp/ofs/lower2:/tmp/ofs/lower1,upperdir=/tmp/ofs/upper,workdir=/tmp/ofs/work \
  /tmp/ofs/merged

ls /tmp/ofs/merged/
# a.txt  b.txt  shared.txt

cat /tmp/ofs/merged/shared.txt
# from layer 2 (overrides)          ← 위 레이어가 이긴다
```

**copy-up 동작 확인**

```bash
# 하위 레이어의 파일을 수정
echo "modified" >> /tmp/ofs/merged/a.txt

# 원본은 그대로
cat /tmp/ofs/lower1/a.txt
# from layer 1

# upperdir에 사본이 생겼다
ls /tmp/ofs/upper/
# a.txt
cat /tmp/ofs/upper/a.txt
# from layer 1
# modified
```

**삭제는 whiteout 파일로 표현된다**

```bash
rm /tmp/ofs/merged/b.txt
ls -la /tmp/ofs/upper/
# c--------- b.txt        ← character device 0:0 = whiteout
ls /tmp/ofs/lower2/
# b.txt                   ← 원본은 살아 있다
```

**이것이 컨테이너 파일 시스템의 전부다.** 삭제해도 이미지 레이어는 그대로이므로 이미지 크기가 줄지 않는다. Dockerfile에서 `RUN apt-get install ... && rm -rf /var/lib/apt/lists/*`를 **한 줄로 묶어야 하는** 이유가 이것이다. 별도 레이어에서 지우면 whiteout만 추가되고 크기는 그대로다.

```bash
umount /tmp/ofs/merged
rm -rf /tmp/ofs
```

## 19.6 capability와 seccomp 실험

### capability 확인과 제거

```bash
# 현재 프로세스의 capability
grep Cap /proc/self/status
```
```
CapInh: 0000000000000000
CapPrm: 000001ffffffffff
CapEff: 000001ffffffffff        ← 유효 capability 비트마스크
CapBnd: 000001ffffffffff
```

```bash
capsh --decode=000001ffffffffff | tr ',' '\n' | head
```

**capability를 제거하고 실행**

```bash
# NET_ADMIN 없이 인터페이스 조작 시도 → 실패
capsh --drop=cap_net_admin -- -c 'ip link set lo down' 2>&1
# RTNETLINK answers: Operation not permitted
```

**컨테이너의 capability 확인**

```bash
kubectl run cap-test --rm -it --image=alpine --restart=Never -- \
  sh -c 'apk add -q libcap 2>/dev/null; capsh --print | head -3'
```

컨테이너 런타임은 기본적으로 **14개 정도만 남기고 나머지를 제거한다.**

```yaml
# 18장의 권장 설정
securityContext:
  capabilities:
    drop: ["ALL"]
    add: ["NET_BIND_SERVICE"]     # 1024 미만 포트만 필요하다면
```

### seccomp 프로파일 만들어 보기

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": ["read", "write", "exit", "exit_group", "rt_sigreturn",
                "brk", "mmap", "munmap", "openat", "close", "fstat"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

```yaml
# 노드의 /var/lib/kubelet/seccomp/profiles/ 에 배치 후
securityContext:
  seccompProfile:
    type: Localhost
    localhostProfile: profiles/minimal.json
```

**허용되지 않은 시스템콜을 호출하면 `EPERM`이 반환된다.** `SCMP_ACT_KILL`로 하면 프로세스가 즉시 죽는다.

실무에서는 **Security Profiles Operator**로 앱을 실행하며 사용하는 시스템콜을 기록해 프로파일을 자동 생성한다(18.2절).

## 19.7 정리: 계층별 대응표

지금까지 만든 것과 쿠버네티스 개념의 대응이다.

| 우리가 만든 것 | 쿠버네티스에서 | 관련 장 |
|---|---|---|
| `ip netns add pod-lab` | pause 컨테이너 생성 | 5.1절 |
| veth 페어 + IP 할당 | CNI 플러그인 `ADD` | 23장 |
| `unshare --mount --pid` | 각 컨테이너의 격리 | 5.1절 |
| `/sys/fs/cgroup/pod-lab/` | Pod 수준 cgroup | 14장 |
| `.../container-a/memory.max` | `limits.memory` | 14.3절 |
| `cpu.max` | `limits.cpu` | 14.3절 |
| OOM으로 인한 종료 (137) | `OOMKilled` | 6.1절, 14.3절 |
| overlayfs merged | 컨테이너 rootfs | 2.2절 |
| `capsh --drop` | `securityContext.capabilities.drop` | 18.2절 |
| seccomp 프로파일 | `seccompProfile` | 18.2절 |

**컨테이너 런타임(containerd/runc)이 하는 일이 정확히 이것이다.** 우리가 손으로 한 것을 OCI 스펙에 따라 자동화할 뿐이다.

```bash
# runc가 받는 config.json을 구경해 보자
docker exec k8s-guide-worker sh -c \
  'find /run/containerd -name config.json 2>/dev/null | head -1 | xargs cat' | jq '.linux.namespaces, .linux.resources.memory'
```

---

## 실습 과제

**과제 1 — 3컨테이너 Pod 만들기**
19.3절의 실습을 확장해 컨테이너를 셋으로 늘린다. 하나는 HTTP 서버, 하나는 그것을 주기적으로 호출하는 클라이언트, 하나는 공유 볼륨(bind mount)에 로그를 쓰는 사이드카로 구성한다. 5.6절의 사이드카 패턴을 밑바닥에서 재현하는 셈이다.

**과제 2 — PID 네임스페이스 공유**
`unshare --pid` 없이 두 프로세스를 같은 PID 네임스페이스에서 실행하고, `ps aux`에서 서로가 보이는 것을 확인한다. `shareProcessNamespace: true`와 같은 상태다. PID 1이 무엇인지도 확인한다.

**과제 3 — cgroup v2 PSI 관찰**
CPU를 과도하게 쓰는 프로세스를 cgroup에 넣고 `cpu.pressure`의 `some`/`full` 값이 어떻게 변하는지 기록한다. CPU 사용률과 PSI가 어떻게 다른 정보를 주는지 설명해 본다.

**과제 4 — 이미지 레이어와 whiteout**
Dockerfile을 두 가지로 작성한다.
```dockerfile
# A: 한 레이어에서 설치와 정리
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# B: 별도 레이어
RUN apt-get update && apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*
```
두 이미지의 크기를 비교하고, `docker history`로 각 레이어의 크기를 확인해 whiteout의 영향을 설명한다.

**과제 5 — 실제 Pod의 cgroup 추적**
클러스터에 Pod를 하나 띄우고, 노드에서 그 Pod의 cgroup 경로를 찾아 `memory.max`, `cpu.max`, `memory.current` 값을 읽는다. 매니페스트의 `resources`와 정확히 대응하는지 확인한다.
```bash
POD_UID=$(kubectl get pod <name> -o jsonpath='{.metadata.uid}')
docker exec k8s-guide-worker find /sys/fs/cgroup -name "*${POD_UID//-/_}*" -maxdepth 4
```

---

## 요약

- **"컨테이너"라는 커널 객체는 없다.** namespace(무엇을 보는가), cgroup(얼마나 쓰는가), capability(무엇을 하는가), overlayfs(파일을 어떻게 쌓는가), seccomp/LSM(어떤 시스템콜을 부르는가)의 조합일 뿐이다.
- `/proc/<pid>/ns/*`의 **inode 번호가 같으면 같은 네임스페이스**다. Pod 안의 컨테이너들은 `net`/`ipc`/`uts`가 같고 `mnt`/`pid`가 다르다.
- **`setns` 시스템콜이 Pod의 핵심**이다. pause 컨테이너가 만든 네임스페이스에 다른 컨테이너들이 합류한다.
- **pause 컨테이너**는 네임스페이스를 살려 두고 좀비를 수거한다. 이 덕분에 앱 컨테이너가 죽었다 살아나도 **Pod IP가 유지된다.**
- `ip netns` + `unshare` + cgroup만으로 Pod와 동등한 격리를 만들 수 있다. **컨테이너 런타임은 이것을 OCI 스펙에 따라 자동화할 뿐이다.**
- **cgroup v2가 표준**이다. 단일 계층 구조이고, `memory.high`(부드러운 제한)와 **PSI**(자원 압박 정량화)를 제공한다. kubelet의 축출 판단이 PSI 기반으로 이동 중이다.
- overlayfs에서 **수정은 copy-up, 삭제는 whiteout**이다. 별도 레이어에서 파일을 지워도 이미지 크기는 줄지 않는다.

**다음 장에서는** 이 모든 것을 자동으로 만들어 주는 주체, kubelet을 다룬다. PodSpec이 실제 컨테이너가 되기까지의 코드 경로를 따라간다.

---

**참고 원서**: *Core Kubernetes* 3장, 4장
