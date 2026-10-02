---
title: "10장. cgroup"
parent: "2부. 컨테이너 커널 기능과 Docker"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 10
---

# 10장. cgroup

> **🎮 게임 서버 개발자에게** — 서버에 메모리 누수가 있으면 보통 프로세스가 커지다가 OOM으로 죽고, 스레드를 무한히 만드는 버그가 있으면 머신 전체가 멈춘다. 9장의 네임스페이스는 "무엇이 보이는가"만 정하므로, 이런 폭주를 막아 주지 못한다. cgroup은 프로세스 그룹에 **쓸 수 있는 양의 상한**(CPU 시간, 메모리, 디스크 I/O, 프로세스/스레드 수)을 거는 커널 기능이다. `docker run --memory=512m`은 결국 cgroup 제어 파일에 숫자 하나를 쓰는 일이고, 컨테이너가 "로그도 없이 갑자기 사라지는" 현상의 첫 번째 용의자는 cgroup OOM이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 컨테이너가 로그에 아무 에러도 없이 계속 재시작된다.
> - `--cpus`, `--memory` 같은 Docker 옵션이 실제로 커널의 어디에 반영되는지 파일로 확인해야 한다.
> - 서버(호스트)가 cgroup v1인지 v2인지, 드라이버가 systemd인지 cgroupfs인지 몰라서 설정 문서를 읽을 수 없다.

## 코어 — 이것만은 100%

> **한 문장:** cgroup은 프로세스 그룹의 자원 사용량 상한을 거는 커널 기능으로, 현재 표준은 모든 컨트롤러가 하나의 트리를 공유하는 v2이고, Docker 옵션은 컨트롤러의 제어 파일에 값을 쓰는 것이며, 메모리 한도를 넘으면 cgroup OOM killer가 SIGKILL로 종료시킨다.

1. **cgroup = 자원 축** — 네임스페이스가 가시성이라면 cgroup은 "얼마나 쓸 수 있는가"다. 없으면 컨테이너 하나가 호스트 메모리·CPU를 독점하는 noisy neighbor 문제가 생긴다.
2. **v2 unified hierarchy** — v1은 컨트롤러마다 독립 계층을 가져 유연했지만 어긋났다. v2는 모든 컨트롤러가 하나의 트리를 공유하고 프로세스는 단 하나의 cgroup 경로에만 속한다. 신규 환경은 v2가 사실상 표준이다.
3. **드라이버: systemd vs cgroupfs** — runc가 cgroup 디렉터리를 직접 만들면 cgroupfs, systemd에 D-Bus로 요청하면 systemd 드라이버다. systemd가 init인 배포판에서는 systemd 드라이버가 권장되고, 쿠버네티스에서는 kubelet과 런타임의 드라이버가 일치해야 한다.
4. **컨트롤러 4종과 Docker 옵션** — cpu(`--cpus`/`--cpu-shares`/`--cpuset-cpus`), memory(`--memory`/`--memory-swap`/`--memory-swappiness`), io(`--blkio-weight`/`--device-*-bps`/`--device-*-iops`), pids(`--pids-limit`). 모두 제어 파일(`cpu.max`, `memory.max`, `pids.max` 등)로 귀결된다.
5. **cgroup OOM과 `OOMKilled`** — 메모리 한도를 넘으면 그 cgroup 안에서 OOM killer가 프로세스를 SIGKILL하고, `docker inspect`의 `State.OOMKilled`가 `true`가 된다. 앱 로그에는 흔적이 없다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `setrlimit(RLIMIT_AS)`, `ulimit`으로 프로세스 자원 제한 | cgroup 자원 한도 | 자원 사용에 상한을 거는 커널 장치다 | rlimit은 **프로세스** 단위, cgroup은 **프로세스 그룹**(컨테이너 전체) 단위의 총량이다. 그룹 안 모든 프로세스·스레드가 한도를 공유한다 |
| 워커 스레드 풀 크기를 코어 수에 맞춤 | `--cpus` (`cpu.max`) | CPU 사용량의 상한을 정한다 | `--cpus=1.5`는 코어를 "고정 할당"하는 것이 아니라 CFS 대역폭 제어로 **시간 총량**을 제한한다. 코어를 특정 번호에 고정하는 것은 `--cpuset-cpus`다 |
| 메모리 누수 서버가 커져서 OOM으로 사망 | cgroup-aware OOM killer | 한도를 넘으면 커널이 프로세스를 죽인다 | 시스템 전체 메모리 부족이 아니라 **cgroup의 `memory.max` 초과**만으로 발동한다. 앱 로그에는 흔적이 없고 `State.OOMKilled`만 남는다 |
| 스레드 생성 폭주(`std::thread` 무한 생성) | `--pids-limit` (pids 컨트롤러) | 프로세스/스레드 수에 상한을 둔다 | cgroup의 pids는 **프로세스와 스레드 합산** 상한이다. 스레드를 많이 쓰는 게임 서버는 한도를 넉넉히 잡지 않으면 `clone` 실패로 만난다 |
| 서비스 매니저(systemd)가 프로세스를 관리 | cgroup 드라이버(systemd/cgroupfs) | 프로세스 생명주기를 누가 소유하느냐의 문제다 | cgroup 트리의 소유자가 둘이면 충돌한다. systemd가 init인 시스템에서는 systemd 드라이버로 **단일 소유**를 유지한다 |
| 프로세스별 `/proc/PID/limits` 확인 | `/sys/fs/cgroup/.../cpu.max` 등 제어 파일 | 파일 읽기로 현재 한도를 확인한다 | 위치가 드라이버와 배포판에 따라 달라진다(`system.slice/docker-<ID>.scope` 등). 경로가 다르면 `find`로 찾는다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 네임스페이스로 격리된 컨테이너가 호스트의 메모리를 전부 써 버릴 수 있을까?
> 2. `--cpus=1.5`와 `--cpuset-cpus=0,1`은 무엇이 다를까?
> 3. 컨테이너 안에서 `--memory` 한도를 넘으면 무슨 일이 벌어질까? 앱 로그에 남을까?
> 4. 내 호스트가 cgroup v1인지 v2인지는 어떻게 알 수 있을까?
>
> **처리법:** 🛠 실습 `docker info --format 'Cgroup Version: {{.CgroupVersion}}, Cgroup Driver: {{.CgroupDriver}}'`, `mount | grep cgroup`, `cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.max`, `docker inspect --format '{{.State.OOMKilled}}'` → 바로 실행 · 🗺 관계도 v1(컨트롤러별 계층) vs v2(단일 트리), 옵션 → 컨트롤러 → 제어 파일 매핑 · 📦 카드로 옵션-제어 파일 표(`cpu.max`, `cpu.weight`, `memory.max`, `pids.max`), 드라이버 2종

### 이 장에서 배우는 것

- cgroup이 필요한 이유(네임스페이스가 못 막는 자원 독점)
- cgroup v1의 구조적 한계와 v2 unified hierarchy
- cgroupfs와 systemd 드라이버, 그리고 kubelet과의 일치 문제
- cpu, memory, io, pids 컨트롤러와 Docker 옵션의 매핑
- cgroup OOM killer의 동작과 `OOMKilled` 확인법
- v1/하이브리드가 남아 있는 환경에서 모드를 확인하는 법

---

## 코어 1. cgroup = 자원 축

### 1.1 왜 cgroup이 필요한가

**한 줄 요약:** 네임스페이스만 적용된 프로세스는 독립 시스템처럼 느끼지만 호스트의 CPU와 메모리를 제한 없이 쓸 수 있다.

[9장](09-네임스페이스.md)의 네임스페이스는 "무엇이 보이는가"를 정한다. 보이는 것과 쓸 수 있는 양은 별개 문제다.

- 컨테이너 하나가 메모리 누수를 일으키면 호스트 전체가 스와핑에 빠지거나 OOM 상황에 몰릴 수 있다.
- CPU를 많이 쓰는 컨테이너 하나가 나머지 컨테이너의 응답 속도를 떨어뜨릴 수 있다.

이를 해결하는 커널 메커니즘이 **cgroups(control groups)**다. 이 장에서 쓰는 용어 정리: **컨트롤러(controller)**는 리소스 종류별로 자원을 관리하는 서브시스템(cpu, memory, blkio/io, pids 등)이다. 컨테이너 격리의 세 축(가시성=네임스페이스, 권한=capabilities/seccomp, 자원=cgroup) 중 마지막이 이 장이다.

→ CPU 쿼터와 스로틀링의 동작 원리는 1부에서 다뤘다: [1장 커널·시스템콜·스케줄러](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md)

## 코어 2. v1에서 v2로

### 2.1 cgroups v1의 구조와 한계

**한 줄 요약:** v1은 컨트롤러마다 독립 계층을 가질 수 있어 유연했지만, 그래서 "이 프로세스가 정확히 어떤 제한을 받는가"를 알기 어려웠다.

cgroups는 2007년 커널 2.6.24 무렵 도입되어 오랫동안 지금 "v1"이라 부르는 형태였다.

- 핵심 개념: **컨트롤러마다 독립적인 계층(hierarchy)을 가질 수 있다.** `cpu`용 트리와 `memory`용 트리를 완전히 다르게 구성할 수 있고, 한 프로세스가 `cpu` 계층에서는 그룹 A, `memory` 계층에서는 그룹 B에 속할 수도 있다.
- 문제: 일관된 정책("CPU도 이만큼, 메모리도 이만큼")을 걸려면 여러 계층에 같은 그룹 구조를 수작업으로 동기화해야 했다. 실무에서는 대부분의 도구(systemd, Docker)가 모든 컨트롤러를 동일한 트리로 마운트해 쓰는 관례를 따랐지만 커널이 강제하는 규칙은 아니었다. 하나의 프로세스가 여러 cgroup에 걸칠 수 있다는 점이 디버깅을 어렵게 만든 근본 원인이다.
- 그 밖에 컨트롤러마다 설계 시점이 달라 인터페이스 파일 이름과 동작이 일관되지 않았고, 비특권 사용자에게 **위임(delegation)**하는 모델도 불분명했다.

### 2.2 cgroups v2의 unified hierarchy

**한 줄 요약:** 모든 컨트롤러가 하나의 트리를 공유하고, 프로세스는 하나의 cgroup 경로에만 속한다.

- 커널 4.5(2016년)부터 사용 가능하다. 프로세스는 단 하나의 cgroup 경로에만 속하고, 그 경로에 어떤 컨트롤러를 활성화할지는 상위 cgroup의 `cgroup.subtree_control` 파일로 명시적으로 제어한다. "이 컨테이너에 CPU, 메모리, I/O 제한을 함께 건다"는 작업이 하나의 디렉터리 트리 안에서 일관되게 이루어진다.
- **위임 모델**을 명확히 정의해서 상위 프로세스가 하위 서브트리의 관리 권한을 안전하게 위임할 수 있다. rootless 컨테이너 런타임이나 systemd 사용자 세션이 각자 서브트리를 독립 관리하는 기반이다.
- 제약도 있다. 하나의 cgroup 안에 프로세스와 하위 cgroup이 섞일 수 없다는 "no internal process" 규칙 같은 것이다. 다소 엄격하지만 정책이 트리 전체에서 예측 가능하게 적용된다.

### 2.3 현재의 상태와 모드 확인

**한 줄 요약:** 주류 배포판은 v2가 기본이지만 legacy 환경은 v1/하이브리드가 남아 있으니 먼저 확인한다.

- 2026년 현재 주요 배포판(Ubuntu, Debian, Fedora, RHEL 계열, Arch 등)은 대부분 systemd 245 이상 및 최신 릴리스 기준으로 v2 unified hierarchy를 기본값으로 전환했다. 새 환경은 v2가 사실상 표준이다.
- v1이 남는 경우: 업그레이드 없이 오래 운영된 서버(오래된 커널은 v2가 아예 없거나 불완전), v1 전용 파일명(`memory.limit_in_bytes`, `blkio.weight` 등)에 하드코딩된 레거시 모니터링/자원 관리 도구, v2 전환이 검증되지 않은 오케스트레이션 스택 구성 요소.
- **하이브리드 모드**: 대부분 컨트롤러는 v2 unified hierarchy로 동작하면서 일부 레거시 컨트롤러만 v1 방식으로 별도 마운트되어 공존한다. `systemd.unified_cgroup_hierarchy=0` 커널 부팅 파라미터로 강제 전환하거나 일부 컨트롤러만 v1로 마운트하는 구성이다.

```bash
mount | grep cgroup
# v2 unified만 사용 중이면 cgroup2 타입 마운트 하나만 /sys/fs/cgroup에 보임
# v1 또는 하이브리드면 컨트롤러별 cgroup 타입 마운트가 여러 개 보임
# (/sys/fs/cgroup/cpu, /sys/fs/cgroup/memory 등)

docker info --format 'Cgroup Version: {{.CgroupVersion}}, Cgroup Driver: {{.CgroupDriver}}'
```

기존 인프라를 다룰 때는 `docker info`의 `Cgroup Version`을 먼저 확인하는 습관이 문제 해결 시간을 크게 줄인다.

## 코어 3. 드라이버: systemd vs cgroupfs

### 3.1 runc가 cgroup을 다루는 방식

**한 줄 요약:** runc는 OCI Runtime Spec의 `linux.resources` 값을 cgroup 제어 파일에 기록하며, 그 디렉터리를 만드는 주체가 드라이버로 갈린다.

runc는 컨테이너를 실행할 때 지정된 cgroup 경로 아래에 컨테이너 프로세스를 배치하고, `linux.resources`에 명시된 제한(CPU, 메모리, I/O, PID 수 등)을 제어 파일에 쓴다. `linux.resources`가 무엇인지는 [12장](12-OCI-표준과-런타임.md)에서 다룬다.

| 드라이버 | 방식 | 특징 |
|---|---|---|
| **cgroupfs** | runc(상위의 containerd, dockerd 포함)가 `/sys/fs/cgroup` 아래에 직접 디렉터리를 만들고 파일을 씀 | 단순하고 직접적. 그러나 systemd가 관리하는 시스템에서는 systemd도 자기 관점에서 트리를 관리하려 하므로 **두 관리 주체가 충돌**할 여지가 있다 |
| **systemd** | runc가 직접 조작하는 대신 systemd에 D-Bus API로 "이런 제한을 가진 scope/slice 유닛을 만들어 달라"고 요청 | systemd가 init으로 트리 전체를 소유하는 현대 배포판에서 권장. cgroup v2 + systemd init이면 사실상 표준 권장 |

최신 Docker Engine/containerd의 기본 설정은 systemd가 감지되는 환경에서 systemd 드라이버를 택하는 방향이지만, 정확한 기본값과 자동 감지는 Docker Engine 버전에 따라 다르므로 `docker info`로 직접 확인하는 것이 가장 확실하다. 명시적으로 지정하려면 `/etc/docker/daemon.json`에 쓴다.

```json
{
  "exec-opts": ["native.cgroupdriver=systemd"]
}
```

### 3.2 쿠버네티스에서의 주의

**한 줄 요약:** kubelet과 컨테이너 런타임의 cgroup 드라이버가 다르면 자원 제한이 안 걸리거나 Pod가 예기치 않게 실패한다.

Docker 단독 사용보다 쿠버네티스와 함께 쓸 때 훨씬 자주 부딪히는 문제다. 두 설정은 **항상 일치**해야 한다. kubelet 쪽 이야기는 3부에서 이어진다.

→ [23장 kubelet과 CRI](../3부-쿠버네티스-구성-요소/23-kubelet과-CRI.md)

## 코어 4. 컨트롤러와 Docker 옵션의 매핑

### 4.1 옵션 → 컨트롤러 → 제어 파일

**한 줄 요약:** Docker 자원 옵션은 대응하는 cgroup 컨트롤러의 제어 파일에 값을 기록하는 것으로 구현된다.

| 컨트롤러 | Docker 옵션 | cgroup v2 파일 / 비고 |
|---|---|---|
| cpu | `--cpus` | `cpu.max` (v1: `cpu.cfs_quota_us`/`cpu.cfs_period_us`) — CFS 대역폭 제어 |
| cpu | `--cpu-shares` | `cpu.weight` — 상대적 가중치 |
| cpuset | `--cpuset-cpus` | 특정 번호의 물리 코어에 고정 |
| memory | `--memory` | `memory.max` |
| memory | `--memory-swap` | 메모리+스왑 합산 상한 |
| memory | `--memory-swappiness` | 스왑 아웃 성향(0&#126;100) |
| io (v1: blkio) | `--blkio-weight`, `--device-read-bps`, `--device-write-bps`, `--device-read-iops`, `--device-write-iops` | 블록 디바이스 대역폭/IOPS |
| pids | `--pids-limit` | `pids.max` |

### 4.2 cpu 컨트롤러

**한 줄 요약:** `--cpus`는 시간 총량 상한, `--cpu-shares`는 경쟁 시의 상대 가중치, `--cpuset-cpus`는 코어 고정이다.

- `--cpus`: 사용 가능한 CPU 코어 수를 소수점으로 제한한다(`--cpus=1.5`는 코어 1.5개 분량). cgroup v2의 `cpu.max`를 이용한 CFS 대역폭 제어다.
- `--cpu-shares`: 여러 컨테이너가 CPU를 두고 경쟁할 때의 상대적 가중치다. **절대 상한이 아니라** 유휴 자원이 있을 때의 배분 비율을 조정하며, v2에서는 `cpu.weight`에 대응한다.
- `--cpuset-cpus`: 컨테이너가 실행될 수 있는 물리 CPU 코어를 특정 번호로 고정한다(`cpuset` 컨트롤러).

```bash
docker run -d --name limited --cpus="1.5" --cpu-shares=512 nginx:latest
cat /sys/fs/cgroup/system.slice/docker-*.scope/cpu.max   # cgroup v2 예시 경로
```

`cpu.max`의 첫 번째 값(quota)과 두 번째 값(period)의 비율이 `--cpus` 값에 해당한다. 쿼터를 다 쓰면 스로틀링된다는 점은 1장에서 설명했다.

### 4.3 memory 컨트롤러

**한 줄 요약:** `--memory`는 `memory.max`, `--memory-swap`을 같은 값으로 주면 스왑을 막는다.

- `--memory`: 최대 메모리(예: `--memory=512m`). v2의 `memory.max`에 대응한다.
- `--memory-swap`: 메모리와 스왑을 합친 총 상한이다. `--memory`와 같은 값이면 스왑을 아예 못 쓰게 막는 효과이고, `-1`이면 스왑 사용에 제한이 없는 식의 특수한 동작을 한다(정확한 동작은 Docker 버전별 문서 확인).
- `--memory-swappiness`: 커널이 해당 cgroup의 페이지를 얼마나 적극적으로 스왑 아웃할지의 성향(0&#126;100).

```bash
docker run -d --name memlimited --memory=512m --memory-swap=512m nginx:latest
cat /sys/fs/cgroup/system.slice/docker-*.scope/memory.max
```

### 4.4 io와 pids 컨트롤러

**한 줄 요약:** io는 디스크 경쟁에서 이웃을 보호하고, pids는 fork bomb로부터 호스트를 보호한다.

- **io**(v1 `blkio`, v2 `io`): 블록 디바이스 읽기/쓰기 대역폭이나 IOPS를 제한한다. `--blkio-weight`는 상대 가중치, `--device-read-bps`/`--device-write-bps`는 초당 바이트 상한, `--device-read-iops`/`--device-write-iops`는 초당 작업 횟수 상한이다. 여러 컨테이너가 같은 물리 디스크나 네트워크 스토리지를 공유할 때, 한 컨테이너의 대규모 로그 쓰기나 백업이 다른 컨테이너의 I/O 지연에 영향을 주지 않게 한다.
- **pids**: cgroup 안에서 생성될 수 있는 **프로세스/스레드 수의 총합**을 제한한다(`--pids-limit`). 프로세스를 무한 생성해 호스트의 PID 공간이나 메모리를 고갈시키는 공격/버그(fork bomb)로부터 보호한다. 네임스페이스만으로는 컨테이너 안에서 프로세스를 무한정 만드는 것 자체를 막지 못하므로, 9장의 "네임스페이스만으로 부족하다"는 논점을 자원 관점에서 보여 주는 대표 사례다.

```bash
docker run -d --name pidlimited --pids-limit=100 nginx:latest
cat /sys/fs/cgroup/system.slice/docker-*.scope/pids.max
```

## 코어 5. cgroup OOM과 OOMKilled

### 5.1 동작

**한 줄 요약:** `memory.max`를 넘으면 그 cgroup 안의 프로세스 하나가 SIGKILL로 종료되고, 앱 로그에는 흔적이 없다.

`--memory`로 상한을 건 컨테이너가 한도를 초과하면 커널은 해당 cgroup 안에서 **cgroup-aware OOM killer**를 동작시킨다.

- 시스템 전체 메모리가 부족할 때 발동하는 **전역 OOM killer와는 별개**다.
- 특정 cgroup의 메모리 사용량이 `memory.max`(v1은 `memory.limit_in_bytes`)를 초과하면, 그 cgroup 안의 프로세스 중 하나(보통 메모리 사용량이 가장 크거나 `oom_score_adj`가 높은 프로세스)를 골라 `SIGKILL`로 종료한다.
- 컨테이너가 이렇게 종료되면 `docker inspect`의 `State.OOMKilled`가 `true`다. 애플리케이션 로그에는 대개 아무 흔적이 없고 프로세스가 갑자기 사라진 것처럼 보인다. 재시작 정책으로 "이유 없이" 계속 재기동된다면 **가장 먼저 이 필드를 확인**한다.

```bash
docker inspect --format '{{.State.OOMKilled}}' <container-id-or-name>
```

### 5.2 관련 옵션

**한 줄 요약:** `--oom-kill-disable`은 반드시 `--memory`와 함께, 단독 사용은 위험하다.

- `--oom-kill-disable`: 컨테이너 cgroup의 OOM killer 발동을 비활성화한다. 단독으로 쓰면 한도를 초과한 프로세스가 즉시 종료되는 대신 메모리 회수를 위해 계속 대기(hang)할 수 있다. 반드시 `--memory`로 명확한 상한을 함께 지정해야 하며, 상한 없이 켜는 것은 호스트 전체의 메모리 고갈로 이어질 수 있다.
- `--oom-score-adj`: 전역 OOM killer가 누구를 먼저 죽일지 판단할 때 참고하는 가중치를 조정한다.

## 실무 적용

### 체크리스트

- [ ] cgroup이 네임스페이스가 못 막는 "자원 독점"을 막는 자원 축임을 설명할 수 있다.
- [ ] 내 호스트가 cgroup v1인지 v2인지, 드라이버가 systemd인지 cgroupfs인지 `docker info`와 `mount | grep cgroup`으로 확인했다.
- [ ] 쿠버네티스에서는 kubelet과 컨테이너 런타임의 cgroup 드라이버가 일치하는지 확인했다.
- [ ] `--cpus`(총량 상한), `--cpu-shares`(상대 가중치), `--cpuset-cpus`(코어 고정)를 구분하여 쓴다.
- [ ] 서버에 `--memory`를 걸었다면 최대 메모리 사용량(피크)을 측정한 뒤 여유를 두었는가? `--memory-swap`을 같은 값으로 주면 스왑을 막는다는 점을 알고 있는가?
- [ ] 스레드를 많이 쓰는 서버라면 `--pids-limit`이 스레드 수까지 포함한 총합 상한임을 고려해 넉넉히 정했는가?
- [ ] 컨테이너가 이유 없이 재시작하면 `docker inspect --format '{{.State.OOMKilled}}'`를 가장 먼저 확인한다.
- [ ] `--oom-kill-disable`을 쓸 때는 반드시 `--memory`를 함께 지정한다.

### 시나리오로 확인하기

1. **상황:** 게임 서버 컨테이너가 하루에 몇 번씩 재시작된다. 애플리케이션 로그에는 에러도 종료 메시지도 없다. `--memory=512m`으로 실행 중이다.
   **질문:** 가장 먼저 무엇을 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   `docker inspect --format '{{.State.OOMKilled}}' <컨테이너>`를 확인한다. `true`면 cgroup 메모리 한도(`memory.max`)를 초과해 cgroup OOM killer가 SIGKILL로 종료한 것이다. SIGKILL은 프로세스가 가로챌 수 없어 앱 로그에 흔적이 없다. 서버의 실제 메모리 피크를 측정해 한도를 재설정하거나 누수를 찾는다. → 코어 5

   </details>

2. **상황:** 새로 받은 서버가 어떤 cgroup 모드인지 모른다. 문서마다 `memory.limit_in_bytes`를 말하기도, `memory.max`를 말하기도 한다.
   **질문:** 어떻게 판단하고 어느 쪽을 보나?

   <details markdown="1"><summary>답 확인</summary>

   `docker info --format 'Cgroup Version: {{.CgroupVersion}}, Cgroup Driver: {{.CgroupDriver}}'`와 `mount | grep cgroup`을 본다. cgroup2 타입 마운트 하나만 `/sys/fs/cgroup`에 있으면 v2이고 `memory.max`를 본다. 컨트롤러별 마운트(`/sys/fs/cgroup/memory` 등)가 여러 개면 v1 또는 하이브리드이고 `memory.limit_in_bytes`를 본다. → 코어 2

   </details>

3. **상황:** 쿠버네티스 노드를 새로 구성했더니 Pod에 걸어 둔 리소스 제한이 제대로 적용되지 않고 일부 Pod가 예기치 않게 실패한다. 노드 OS는 systemd 기반이다.
   **질문:** 의심할 점은?

   <details markdown="1"><summary>답 확인</summary>

   kubelet과 컨테이너 런타임의 cgroup 드라이버 불일치다. 두 설정은 항상 일치해야 하며, systemd가 init인 배포판에서는 systemd 드라이버가 권장된다. cgroupfs와 systemd 두 관리 주체가 같은 트리를 서로 다르게 조작하는 상황을 피해야 한다. → 코어 3

   </details>

4. **상황:** 멀티스레드 서버를 `--pids-limit=100`으로 띄웠더니 접속이 많아지면서 스레드 생성이 실패한다.
   **질문:** 왜 그럴 수 있고 어떻게 하나?

   <details markdown="1"><summary>답 확인</summary>

   pids 컨트롤러는 cgroup 안의 프로세스와 스레드 수의 **총합**을 제한하므로, 워커·IO·타이머 스레드까지 합친 수가 100을 넘으면 생성이 막힌다. 서버의 실제 최대 스레드 수를 측정해 한도를 그보다 넉넉히 잡고, `pids.max`와 현재 값을 확인한다. 목적은 fork bomb 방어이지 정상 스레드를 막는 것이 아니다. → 코어 4

   </details>

---

📖 출처: `D:/varioproger.github.io-reference/doc/docker-fundamental/03_자원_제어의_진화.md`

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 격리 3축: 가시성 = ( ? ) / 권한 = ( ? )·( ? ) / 자원 = ( ? )

[코어 2] v1: 컨트롤러마다 ( ? ) 계층 → 어긋남      v2: ( ? ) 계층, 프로세스는 ( ? )개 cgroup 경로
         v2 활성 컨트롤러 제어: cgroup.____   확인: mount | grep ____ / docker info

[코어 3] 드라이버 2종: ( ? ) (직접 /sys/fs/cgroup) / ( ? ) (D-Bus로 위임)
         쿠버네티스: ____ 과 컨테이너 런타임의 드라이버는 반드시 ( ? )

[코어 4] --cpus → ____.max      --cpu-shares → ____.weight    --cpuset-cpus → 코어 ( ? )
         --memory → ____.max    --memory-swap = 메모리 + ( ? )   --pids-limit → ____.max
         io: --blkio-weight / --device-read-( ? ) / --device-write-( ? )

[코어 5] 한도 초과 → cgroup ( ? ) → ( ? )  → docker inspect State.______ = true
         --oom-kill-disable 은 반드시 ____ 와 함께
```

### 2. 인출 질문

1. 네임스페이스만으로는 왜 컨테이너 격리가 충분하지 않은가? 어떤 문제를 cgroup이 푸는가?

   <details markdown="1"><summary>답 확인</summary>

   네임스페이스는 보이는 것만 제한하므로 네임스페이스만 적용된 프로세스도 호스트의 CPU와 메모리를 제한 없이 쓸 수 있다. 한 컨테이너의 메모리 누수가 호스트를 OOM으로 몰거나 CPU 독점이 다른 컨테이너의 응답을 떨어뜨리는 noisy neighbor 문제를 cgroup이 상한으로 막는다. → 코어 1

   </details>

2. cgroup v1의 구조적 문제와 v2의 해결은?

   <details markdown="1"><summary>답 확인</summary>

   v1은 컨트롤러마다 독립 계층을 가져 한 프로세스가 컨트롤러별로 다른 그룹에 속할 수 있었고, 일관된 정책을 걸려면 여러 계층을 수동 동기화해야 했으며 인터페이스와 위임 모델도 불명확했다. v2는 모든 컨트롤러가 하나의 트리를 공유하고, 프로세스는 하나의 cgroup 경로에만 속하며, 위임 모델을 명확히 정의한다. → 코어 2

   </details>

3. cgroupfs 드라이버와 systemd 드라이버의 차이와 권장 조합은?

   <details markdown="1"><summary>답 확인</summary>

   cgroupfs는 runc/containerd/dockerd가 `/sys/fs/cgroup`에 직접 디렉터리를 만들고 파일을 쓰는 방식이고, systemd 드라이버는 systemd에 D-Bus로 scope/slice 유닛 생성을 요청하는 방식이다. systemd가 init인 현대 배포판, 특히 cgroup v2에서는 두 관리 주체의 충돌을 피하려고 systemd 드라이버가 권장되며, 쿠버네티스에서는 kubelet과 런타임의 드라이버가 일치해야 한다. → 코어 3

   </details>

4. `--cpus`, `--cpu-shares`, `--cpuset-cpus`는 각각 무엇을 정하는가?

   <details markdown="1"><summary>답 확인</summary>

   `--cpus`는 CFS 대역폭 제어(v2 `cpu.max`)로 쓸 수 있는 CPU 시간의 총량을 소수점 코어 단위로 제한한다. `--cpu-shares`는 경쟁 시 상대적 가중치(v2 `cpu.weight`)로 절대 상한이 아니다. `--cpuset-cpus`는 실행 가능한 물리 코어를 특정 번호로 고정한다. → 코어 4

   </details>

5. `--memory-swap`을 `--memory`와 같은 값으로 주면 어떻게 되는가?

   <details markdown="1"><summary>답 확인</summary>

   `--memory-swap`은 메모리와 스왑을 합친 총 상한이므로 `--memory`와 같게 주면 스왑을 아예 사용하지 못한다. `-1`이면 스왑 사용에 제한이 없는 특수한 동작을 한다(정확한 동작은 Docker 버전별 문서 확인). → 코어 4

   </details>

6. pids 컨트롤러는 왜 필요하고 무엇의 합계를 제한하는가?

   <details markdown="1"><summary>답 확인</summary>

   cgroup 안에서 생성될 수 있는 프로세스/스레드 수의 총합을 제한한다. 프로세스를 무한 생성해 호스트의 PID 공간이나 메모리를 고갈시키는 fork bomb 같은 버그/공격은 네임스페이스로는 막을 수 없으므로 `--pids-limit`으로 막는다. → 코어 4

   </details>

7. 컨테이너가 메모리 한도를 넘었을 때 무슨 일이 일어나며 어떻게 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   해당 cgroup 안에서 cgroup-aware OOM killer가 (보통 메모리 사용량이 가장 크거나 `oom_score_adj`가 높은) 프로세스를 SIGKILL로 종료한다. 전역 OOM killer와는 별개다. `docker inspect --format '{{.State.OOMKilled}}'`가 `true`이고, 앱 로그에는 대개 흔적이 없다. → 코어 5

   </details>

8. `--oom-kill-disable`을 단독으로 쓰면 왜 위험한가?

   <details markdown="1"><summary>답 확인</summary>

   한도를 초과한 프로세스가 종료되는 대신 메모리 회수를 위해 계속 대기(hang)할 수 있고, `--memory` 상한 없이 켜면 호스트 전체의 메모리 고갈로 이어질 수 있다. 반드시 `--memory`로 명확한 상한을 함께 지정한다. → 코어 5

   </details>

### 3. 기억 고리

- **C++ 유추:** `setrlimit`/`ulimit` = 프로세스 자원 제한 ⚠️ cgroup은 프로세스 그룹(컨테이너 전체)의 총량을 제한하며, 그룹 안 모든 프로세스·스레드가 한도를 함께 쓴다.
- **C++ 유추:** 메모리 누수 서버의 OOM 사망 = `--memory` 초과 ⚠️ 호스트 전체가 아니라 cgroup 한도만으로 발동하고, 앱이 가로챌 수 없는 SIGKILL이라 로그가 남지 않는다.
- **비유:** cgroup = 아파트 호실별 수도·전기 계량기와 차단기. 한 집이 많이 써도 다른 집에 영향이 없게 한다. ⚠️ 비유가 깨지는 지점: `--cpu-shares`는 차단기가 아니라 경쟁이 있을 때만 작동하는 배분 비율이라 유휴 자원이 있으면 한도 없이 쓸 수 있다.
- **비유:** cgroup v1 vs v2 = 부서별로 따로 만든 조직도(자원마다 다른 구조) vs 하나의 통합 조직도. ⚠️ 비유가 깨지는 지점: v2는 한 cgroup 안에 프로세스와 하위 cgroup이 섞일 수 없는 "no internal process" 같은 제약도 함께 도입했다.
- **묶음(3의 법칙):** 격리 3축(네임스페이스·capabilities/seccomp·cgroup) / 드라이버 선택 확인 3명령(`docker info`·`mount | grep cgroup`·`daemon.json`) / 컨테이너 재시작 원인 점검 1순위 `OOMKilled`.
- **대칭·순서:** 옵션 `--cpus`↔`--cpu-shares`(상한 vs 가중치), `--memory`↔`--memory-swap`(메모리 vs 메모리+스왑). v1(컨트롤러별 파일 `memory.limit_in_bytes`) ↔ v2(`memory.max`). 옵션 → 컨트롤러 → 제어 파일 → 커널 강제.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`docker run --memory=512m`을 치면 커널에서 실제로 무슨 일이 일어나고, 한도를 넘으면 어떻게 되는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "컨테이너가 로그 없이 재시작할 때 왜 `OOMKilled`부터 보는가"를 SIGKILL과 cgroup OOM으로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "cgroup v1이 더 유연하니 계속 써야 한다" vs B "v2 unified hierarchy가 일관성과 위임 모델 때문에 표준이다" — 양쪽을 번갈아 변호해 보세요. (계층 불일치, 디버깅 난이도, 레거시 도구 호환, rootless를 근거로)
- **AI 역할 반전:** "내가 `--cpus`, `--cpu-shares`, `--cpuset-cpus`의 차이를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/03_자원_제어의_진화.md (3.1&#126;3.6)*
