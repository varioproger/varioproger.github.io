---
title: "7장. 자원 제어 — cgroups"
parent: "2부. 컨테이너와 Docker"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 7
---

# 7장. 자원 제어 — cgroups

> **🎮 게임 서버 개발자에게** — `setrlimit()`으로 서버 프로세스의 메모리·프로세스 수 상한을 걸어 본 적이 있다면 절반은 안다. cgroups는 그것을 **프로세스 그룹(컨테이너) 단위**로, 측정까지 하면서 거는 커널 기능이다. 결정적 차이는 한도를 넘었을 때의 반응이다. 메모리는 `std::bad_alloc` 같은 처리 가능한 실패가 오는 게 아니라 커널이 `SIGKILL`로 프로세스를 지워 버리고, CPU는 죽이지 않는 대신 주기마다 멈춰 세워 서버 틱을 늦춘다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 게임 서버 컨테이너가 크래시 로그 한 줄 없이 계속 재시작될 때
> - `--cpus`를 걸었더니 평균 CPU는 여유로운데 틱 지연이 주기적으로 튈 때
> - 쿠버네티스 노드를 구성하면서 kubelet과 containerd의 cgroup 설정을 맞춰야 할 때

## 코어 — 이것만은 100%

> **한 문장:** 네임스페이스가 못 막는 자원 사용량은 cgroups가 제한·측정하며, Docker의 `--cpus`/`--memory`/`--pids-limit`은 결국 cgroup 제어 파일에 값을 쓰는 것이고, 한도를 넘으면 CPU는 느려지고(스로틀링) 메모리는 죽는다(OOM kill, `OOMKilled`).

1. **보이는 것과 쓰는 양은 별개** — 네임스페이스는 가시성만 정할 뿐 자원 사용량은 제한하지 못한다. 자원을 제한하고 측정하는 것은 cgroups다.
2. **v2는 하나의 계층, 드라이버는 둘** — cgroups v2는 모든 컨트롤러가 하나의 통합 계층을 공유하고 프로세스는 단 하나의 경로에만 속한다. runc는 cgroupfs 또는 systemd 드라이버로 cgroup을 만들며, 쿠버네티스에서는 kubelet과 런타임의 드라이버가 일치해야 한다.
3. **Docker 옵션 = 제어 파일에 값 쓰기** — `--cpus`→`cpu.max`, `--cpu-shares`→`cpu.weight`, `--memory`→`memory.max`, `--pids-limit`→`pids.max`.
4. **CPU는 느려지고 메모리는 죽는다** — CPU 한도 초과는 스로틀링(대기)이고, 메모리 한도 초과 시 그 cgroup 안의 OOM killer가 프로세스 하나를 SIGKILL로 종료하며 `State.OOMKilled: true`가 남는다.

**이 장에서 배우는 것**

- 네임스페이스만으로는 자원 사용을 제한할 수 없고, 이를 cgroups가 담당함을 이해한다. → 코어 1
- cgroups v2의 핵심 아이디어(하나의 통합 계층)를 안다. → 코어 2
- Docker의 `--cpus`, `--memory`, `--pids-limit` 같은 옵션이 cgroup 제어 파일로 이어지는 관계를 안다. → 코어 3
- 메모리 한도를 넘으면 OOM Killer가 컨테이너를 종료하고, `OOMKilled`로 확인할 수 있음을 안다. → 코어 4

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `setrlimit()`로 프로세스 자원 상한 걸기 | cgroups | 커널이 자원 사용 상한을 강제한다 | 프로세스 하나가 아니라 프로세스 그룹(컨테이너) 단위이고, 상한뿐 아니라 사용량 측정까지 하며, 계층 구조로 관리된다 |
| 메모리 부족 시 `new`가 `std::bad_alloc`을 던지거나 `malloc`이 `NULL` 반환 | `memory.max` 초과 → cgroup OOM kill | 메모리 한도라는 개념은 같다 | 앱이 처리할 실패 값을 받는 것이 아니라 커널이 cgroup 안의 프로세스 하나를 `SIGKILL`로 종료한다. 핸들러도 로그도 남지 않는다 |
| 다른 프로세스와 CPU를 나눠 쓰다 틱이 밀리는 현상 | `cpu.max` 스로틀링 | CPU를 못 받으면 처리가 늦어진다 | 경쟁이 없어도 주기(예: 100ms) 안의 쿼터를 다 쓰면 다음 주기까지 강제로 대기한다. 평균 사용률이 낮아도 지연이 튈 수 있다 |
| 워커 스레드를 무한히 만드는 버그, 포크 폭탄 | `pids.max` (`--pids-limit`) | 프로세스·스레드 개수를 제한해 호스트 고갈을 막는다 | PID 네임스페이스는 보이는 범위만 나눌 뿐 개수를 막지 못한다. 개수 제한은 cgroup의 일이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 네임스페이스로 격리된 컨테이너가 호스트 메모리를 몽땅 써 버리는 것은 가능할까?
> 2. CPU 한도를 넘은 컨테이너와 메모리 한도를 넘은 컨테이너는 각각 어떻게 될까?
> 3. 컨테이너가 로그 한 줄 없이 계속 재시작된다면 무엇부터 확인해야 할까?
> 4. kubelet과 컨테이너 런타임이 cgroup을 서로 다른 방식으로 관리하면 무슨 일이 생길까?
>
> **처리법:** 🛠 실습 `stat -fc %T /sys/fs/cgroup/`, `docker info --format ...CgroupVersion...`, `docker run --cpus --memory --pids-limit` 후 `cpu.max`/`memory.max` 읽기, `polinux/stress`로 OOM 유발 후 `docker inspect`로 `State.OOMKilled` 확인 → 읽자마자 실행 · 🗺 관계도 Docker 옵션 → OCI `linux.resources` → runc → cgroup 드라이버(cgroupfs/systemd) → 제어 파일, 한도 초과 시 CPU = 스로틀링 / 메모리 = OOM kill · 📦 카드로 옵션↔제어 파일 표(`--cpus`→`cpu.max`, `--cpu-shares`→`cpu.weight`, `--memory`→`memory.max`, `--pids-limit`→`pids.max`), `cpu.max` 값 형식 `20000 100000`, `cgroup2fs`/`tmpfs`

---

## 코어 1. 보이는 것과 쓰는 양은 별개

### 1.1 왜 cgroups가 필요한가

**한 줄 요약:** 네임스페이스만 적용된 프로세스는 호스트의 CPU와 메모리를 제한 없이 쓸 수 있으므로, 자원을 제한·측정하는 cgroups가 필요하다.

[6장](06-컨테이너-격리-네임스페이스.md)의 네임스페이스는 "무엇이 보이는가"를 정한다. 하지만 보이는 것과 쓸 수 있는 자원의 양은 별개다. 네임스페이스만 적용된 프로세스는 독립된 시스템에 있는 것처럼 느끼지만, 여전히 호스트의 CPU와 메모리를 제한 없이 가져다 쓸 수 있다.

- 컨테이너 하나가 메모리 누수를 일으키면 호스트 전체가 스와핑이나 OOM 상황에 몰릴 수 있다.
- CPU를 많이 쓰는 컨테이너 하나가 다른 컨테이너의 응답 속도를 떨어뜨릴 수 있다.

이 문제를 해결하는 커널 기능이 **cgroups(control groups)** 다. 프로세스 그룹의 자원 사용량을 **제한하고 측정**한다.

---

## 코어 2. v2는 하나의 계층, 드라이버는 둘

### 2.1 cgroups v2의 구조

**한 줄 요약:** v2는 모든 컨트롤러가 하나의 계층을 공유하고, 프로세스는 단 하나의 경로에만 속한다. 지금 쓰는 버전부터 확인한다.

과거(v1)에는 CPU, 메모리 등 **컨트롤러(자원 종류별 서브시스템)마다 별도의 계층 트리**를 가질 수 있었다. 유연하지만 한 프로세스가 컨트롤러마다 다른 그룹에 속할 수 있어, 계층이 어긋나면 "이 프로세스가 정확히 어떤 제한을 받는가"를 파악하기 어려웠다.

**cgroups v2(unified hierarchy)** 는 이를 단순하게 재설계했다.

- **모든 컨트롤러가 하나의 동일한 계층 구조를 공유**한다.
- 프로세스는 단 하나의 cgroup 경로에만 속한다.
- 어떤 컨트롤러를 켤지는 상위 cgroup의 `cgroup.subtree_control` 파일로 명시한다.
- 상위 프로세스가 하위 서브트리의 관리 권한을 안전하게 위임할 수 있어, rootless 컨테이너나 systemd 사용자 세션의 기반이 된다.

현재 주요 리눅스 배포판 대부분이 v2를 기본으로 사용한다. 다만 오래된 환경에는 v1 또는 v1/v2 혼합 모드가 남아 있을 수 있어, 먼저 확인하는 습관이 좋다.

```bash
docker info --format 'Cgroup Version: {{.CgroupVersion}}, Cgroup Driver: {{.CgroupDriver}}'
mount | grep cgroup
# v2만 사용 중이면 cgroup2 타입 마운트 하나만 /sys/fs/cgroup에 보임

stat -fc %T /sys/fs/cgroup/
# cgroup2fs → v2, tmpfs → v1
```

### 2.2 Docker/containerd/runc는 cgroup을 어떻게 다루나

**한 줄 요약:** runc가 OCI `linux.resources`의 제한을 제어 파일에 기록하고, cgroup 디렉터리는 cgroupfs 또는 systemd 드라이버가 만든다.

runc는 컨테이너를 실행할 때 지정된 cgroup 경로 아래에 프로세스를 배치하고, OCI 명세의 `linux.resources`에 적힌 제한을 해당 cgroup의 제어 파일에 기록한다. cgroup 디렉터리를 만들고 관리하는 **드라이버**는 두 가지다.

| 드라이버 | 방식 | 비고 |
|---|---|---|
| cgroupfs | `/sys/fs/cgroup` 아래에 직접 디렉터리를 만들고 파일을 씀 | 단순하지만 systemd와 충돌 여지 |
| systemd | systemd에 "이런 제한의 scope/slice를 만들어 달라"고 요청 | systemd가 init인 현대 배포판에서 권장 |

```json
{
  "exec-opts": ["native.cgroupdriver=systemd"]
}
```

(`/etc/docker/daemon.json`에서 드라이버를 지정하는 예.) 쿠버네티스에서는 **kubelet과 컨테이너 런타임의 cgroup 드라이버가 일치해야** 한다. 다르면 자원 제한이 제대로 걸리지 않거나 Pod가 예기치 않게 실패하는 문제가 잘 알려져 있다.

---

## 코어 3. Docker 옵션 = 제어 파일에 값 쓰기

### 3.1 CPU, 메모리 한도 — Docker 옵션과 cgroup의 대응

**한 줄 요약:** `--cpus`·`--memory`·`--pids-limit`은 각각 `cpu.max`·`memory.max`·`pids.max`에 값을 쓴다.

Docker의 자원 제한 옵션은 결국 cgroup 컨트롤러의 제어 파일에 값을 쓰는 것이다.

| 컨트롤러 | Docker 옵션 | 의미 | v2 제어 파일 |
|---|---|---|---|
| cpu | `--cpus=1.5` | 사용 가능한 CPU 코어 수 상한 (CFS 대역폭 제어) | `cpu.max` |
| cpu | `--cpu-shares` | 경쟁 시 상대적 가중치 (절대 상한 아님) | `cpu.weight` |
| cpu | `--cpuset-cpus` | 실행할 물리 코어 고정 | (cpuset 컨트롤러) |
| memory | `--memory=512m` | 메모리 최대치 | `memory.max` |
| memory | `--memory-swap` | 메모리+스왑 합산 상한 | |
| io | `--blkio-weight`, `--device-read-bps` 등 | 디스크 I/O 가중치/대역폭/IOPS 제한 | |
| pids | `--pids-limit=100` | 생성 가능한 프로세스/스레드 수 상한 | `pids.max` |

```bash
docker run -d --name limited --cpus="1.5" --memory=512m --pids-limit=100 nginx:latest
cat /sys/fs/cgroup/system.slice/docker-*.scope/cpu.max     # cgroup v2 예시 경로
cat /sys/fs/cgroup/system.slice/docker-*.scope/memory.max
```

`--pids-limit`은 포크 폭탄처럼 프로세스를 무한히 만들어 호스트를 고갈시키는 상황을 막는다. 네임스페이스만으로는 이를 막을 수 없다는 점에서 "네임스페이스만으로는 격리가 완전하지 않다"는 [6장](06-컨테이너-격리-네임스페이스.md) 내용을 자원 관점에서 보여 준다.

---

## 코어 4. CPU는 느려지고 메모리는 죽는다

### 4.1 CPU와 메모리는 한도를 넘었을 때 다르게 동작한다

**한 줄 요약:** 메모리는 넘으면 종료, CPU는 넘으면 스로틀링(대기). `cpu.max`의 `20000 100000`은 0.2 CPU다.

(Kubernetes 종합서 2.4절의 설명이다.) 메모리는 한도를 넘으면 종료되고, CPU는 한도를 넘으면 스로틀링(대기)된다. CPU 한도는 `cpu.max` 값 `20000 100000`처럼 "100ms 주기 중 20ms만 사용"(= 0.2 CPU)의 형태로 표현된다. 메모리는 넘으면 **죽고**, CPU는 넘으면 **느려진다**. 쿠버네티스의 `resources.limits.memory`와 `OOMKilled`도 결국 이 메커니즘의 결과다.

### 4.2 OOM Killer와 `OOMKilled`

**한 줄 요약:** `memory.max`를 넘으면 cgroup OOM killer가 프로세스 하나를 SIGKILL하고, 흔적은 `State.OOMKilled`에만 남는다.

`--memory`로 상한을 건 컨테이너가 그 한도를 넘으면, 커널은 해당 cgroup 안에서 자체적으로 **OOM killer**를 동작시킨다. 시스템 전체 메모리가 부족할 때 동작하는 전역 OOM killer와는 별개로, 특정 cgroup의 사용량이 `memory.max`를 초과했을 때 그 cgroup의 프로세스 하나를 골라 `SIGKILL`로 종료한다.

종료된 컨테이너는 `State.OOMKilled`가 `true`로 표시된다. 애플리케이션 로그에는 흔적 없이 프로세스가 갑자기 사라진 것처럼 보이므로, **이유 없이 재시작을 반복하는 컨테이너라면 가장 먼저 이 필드를 확인**한다.

```bash
docker inspect --format '{{.State.OOMKilled}}' <container-id-or-name>
```

- `--oom-kill-disable`: 해당 cgroup의 OOM killer를 끈다. 반드시 `--memory`로 명확한 상한을 함께 지정해야 하며, 상한 없이 쓰면 호스트 메모리 고갈로 이어질 수 있어 위험하다.

### 4.3 직접 확인해 보기

**한 줄 요약:** 한도를 건 컨테이너의 제어 파일을 읽고, 일부러 메모리 한도를 넘겨 `OOMKilled: true`를 확인한다.

cgroup v2가 켜진 systemd 기반 리눅스를 전제로 한다.

```bash
# 1) 제한을 건 컨테이너 실행 후 제어 파일 확인
docker run -d --name resourcetest --cpus="0.5" --memory="256m" --pids-limit=50 \
  polinux/stress stress --vm 1 --vm-bytes 200M --timeout 60s
CID=$(docker inspect -f '{{.Id}}' resourcetest)
cat /sys/fs/cgroup/system.slice/docker-${CID}.scope/memory.max    # 268435456 (256MiB)

# 2) 의도적으로 한도 초과 -> OOM 확인
docker run --name oomtest --memory=50m polinux/stress stress --vm 1 --vm-bytes 150M --timeout 20s
docker inspect --format '{{.State.OOMKilled}}' oomtest             # true

# 3) 정리
docker rm -f resourcetest oomtest
```

(경로는 cgroup 드라이버 설정에 따라 다를 수 있다. 다르면 `find /sys/fs/cgroup -name "*${CID:0:12}*"`로 찾는다.)

---

## 실무 적용

### 체크리스트

- [ ] 네임스페이스는 가시성만 정할 뿐 자원 사용량은 제한하지 못한다. 자원 제한과 측정은 cgroups가 담당한다. 운영 컨테이너에 `--memory`·`--cpus`·`--pids-limit`을 걸었는가?
- [ ] cgroups v2는 모든 컨트롤러가 하나의 통합 계층을 공유하며, 현재 주류 배포판의 기본값이다. 오래된 환경이라면 `stat -fc %T /sys/fs/cgroup/`로 v1/v2를 먼저 확인했는가?
- [ ] runc는 cgroupfs 또는 systemd 드라이버로 cgroup을 만들고, systemd가 init인 환경에서는 systemd 드라이버가 권장된다. 쿠버네티스에서는 kubelet과 런타임의 드라이버가 일치해야 한다.
- [ ] `--cpus`/`--memory`/`--pids-limit` 등 Docker 옵션은 cgroup 제어 파일(`cpu.max`, `memory.max`, `pids.max`)에 값을 쓰는 것이다.
- [ ] 메모리 한도를 넘으면 OOM killer가 SIGKILL로 종료하고, `docker inspect`의 `State.OOMKilled`로 확인한다.
- [ ] `--oom-kill-disable`을 쓴다면 반드시 `--memory` 상한을 함께 지정했는가?

### 시나리오로 확인하기

1. **상황:** 게임 서버 컨테이너가 피크 시간마다 재시작된다. 크래시 덤프도, 서버 로그의 에러도 없다. C++ 습관대로 "메모리가 부족하면 `bad_alloc` 로그가 남았을 것"이라며 메모리 원인을 배제했다.
   **질문:** 무엇을 놓쳤고, 무엇부터 확인해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `--memory`로 상한을 건 컨테이너가 `memory.max`를 넘으면 커널이 그 cgroup 안에서 OOM killer를 동작시켜 프로세스 하나를 `SIGKILL`로 종료한다. 앱 로그에는 흔적 없이 갑자기 사라진 것처럼 보인다. `docker inspect --format '{{.State.OOMKilled}}' <이름>`부터 확인한다. → 코어 4

   </details>

2. **상황:** 서버 컨테이너에 `--cpus=1`을 걸었다. 모니터링상 평균 CPU 사용률은 여유가 있는데, 틱 처리 시간이 주기적으로 튄다.
   **질문:** 어떤 메커니즘을 의심해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   CPU 한도는 죽이지 않고 스로틀링(대기)한다. `cpu.max`는 `20000 100000`(100ms 주기 중 20ms, 0.2 CPU)처럼 주기당 쿼터로 표현되므로, 쿼터를 다 쓰면 다음 주기까지 기다려야 한다. 메모리는 넘으면 죽고, CPU는 넘으면 느려진다. → 코어 4

   > **[보충]** 쿼터는 주기 안에서 모든 스레드가 쓴 CPU 시간의 합으로 소진된다. 그래서 워커 스레드 여러 개가 짧은 순간 동시에 바쁘면 평균 사용률은 낮아도 주기 초반에 쿼터를 다 써 버리고 나머지 시간 동안 멈출 수 있다.

   </details>

3. **상황:** 한 호스트에 매치 서버와 로비 서버를 같이 올리고, 매치 서버가 CPU를 독점하지 못하게 `--cpu-shares`를 낮게 줬다. 그런데 로비 서버가 한가할 때 매치 서버가 CPU를 거의 다 쓰고 있다.
   **질문:** 설정이 잘못 먹은 것인가?

   <details markdown="1"><summary>답 확인</summary>

   아니다. `--cpu-shares`(`cpu.weight`)는 경쟁할 때의 상대적 가중치일 뿐 절대 상한이 아니다. 경쟁자가 없으면 다 쓸 수 있다. 절대 상한이 필요하면 `--cpus`(`cpu.max`, CFS 대역폭 제어)를 쓰고, 특정 코어에 고정하려면 `--cpuset-cpus`를 쓴다. → 코어 3

   </details>

4. **상황:** 새로 구성한 쿠버네티스 노드에서 Pod가 예기치 않게 실패하거나 자원 제한이 제대로 걸리지 않는다. 확인해 보니 kubelet은 cgroupfs, containerd는 systemd 드라이버로 설정돼 있다.
   **질문:** 무엇이 문제인가?

   <details markdown="1"><summary>답 확인</summary>

   쿠버네티스에서는 kubelet과 컨테이너 런타임의 cgroup 드라이버가 일치해야 한다. 다르면 자원 제한이 제대로 걸리지 않거나 Pod가 예기치 않게 실패하는 문제가 잘 알려져 있다. systemd가 init인 현대 배포판에서는 둘 다 systemd 드라이버로 맞추는 것이 권장된다. → 코어 2

   </details>

5. **상황:** "OOM으로 서버가 죽는 것보다 느려지는 게 낫다"며 `--oom-kill-disable`만 켜고 `--memory`는 주지 않았다.
   **질문:** 무엇이 위험한가?

   <details markdown="1"><summary>답 확인</summary>

   `--oom-kill-disable`은 해당 cgroup의 OOM killer를 끄는 옵션이라 반드시 `--memory`로 명확한 상한을 함께 지정해야 한다. 상한 없이 쓰면 컨테이너 하나의 메모리 누수가 호스트 메모리 고갈로 이어질 수 있다. → 코어 4

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 보이는 것과 쓰는 양은 별개
왜 필요? 네임스페이스 = ( ? )만 / 자원 사용량은 못 막음 → 메모리 누수, CPU 독점
cgroups = 프로세스 그룹 자원을 ____ 하고 ____

[코어 2] v2는 하나의 계층, 드라이버는 둘
v1: 컨트롤러마다 ____ 트리     v2: ____ 계층 하나 + 프로세스는 경로 ____개
켤 컨트롤러 지정 파일: ____     확인: stat -fc %T → ____(v2) / ____(v1)
runc ← OCI ____ → 드라이버: ____ (직접 파일) / ____ (scope/slice 요청)
k8s 주의: kubelet ↔ 런타임 드라이버 ( ? )

[코어 3] Docker 옵션 = 제어 파일에 값 쓰기
--cpus        → ____      (넘으면 ____)
--cpu-shares  → ____      (상대 가중치)
--memory      → ____      (넘으면 ____)
--pids-limit  → ____      (막는 것: ____)

[코어 4] CPU는 느려지고 메모리는 죽는다
cpu.max "20000 100000" = ____ ms 주기 중 ____ ms = ____ CPU
OOM: memory.max 초과 → cgroup OOM killer → ____ → State.____ = true
--oom-kill-disable 은 반드시 ____ 와 함께
```

### 2. 인출 질문

1. 네임스페이스만 적용된 컨테이너가 호스트 메모리를 다 써 버릴 수 있는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   네임스페이스는 "무엇이 보이는가"만 정하고 쓸 수 있는 자원의 양은 제한하지 않기 때문이다. 독립된 시스템처럼 느껴도 호스트의 CPU와 메모리를 제한 없이 가져다 쓸 수 있어, 메모리 누수 하나가 호스트 전체를 스와핑이나 OOM에 몰아넣을 수 있다. → 코어 1 (1.1)

   </details>

2. `docker run --memory=512m ...`을 하면 커널의 어느 cgroup 제어 파일에 값이 쓰이는가?

   <details markdown="1"><summary>답 확인</summary>

   cgroup v2의 `memory.max`다. 예를 들어 `/sys/fs/cgroup/system.slice/docker-<ID>.scope/memory.max`에서 확인할 수 있다(경로는 드라이버 설정에 따라 다를 수 있다). → 코어 3 (3.1)

   </details>

3. 컨테이너가 로그 없이 갑자기 재시작될 때 가장 먼저 확인할 필드는 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   `docker inspect`의 `State.OOMKilled`다. 메모리 한도를 넘으면 cgroup OOM killer가 SIGKILL로 종료하므로 앱 로그에는 흔적 없이 프로세스가 갑자기 사라진 것처럼 보인다. → 코어 4 (4.2)

   </details>

4. cgroups v1의 문제와 v2가 바꾼 점은 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   v1은 컨트롤러마다 별도 계층 트리를 가질 수 있어, 한 프로세스가 컨트롤러마다 다른 그룹에 속해 "정확히 어떤 제한을 받는가"를 파악하기 어려웠다. v2는 모든 컨트롤러가 하나의 계층을 공유하고 프로세스가 단 하나의 경로에만 속하며, 켤 컨트롤러는 상위의 `cgroup.subtree_control`로 명시하고, 하위 서브트리 관리 권한을 안전하게 위임할 수 있다(rootless 컨테이너, systemd 사용자 세션의 기반). → 코어 2 (2.1)

   </details>

5. CPU 한도와 메모리 한도는 넘었을 때 어떻게 다르게 동작하며, `cpu.max`의 `20000 100000`은 무슨 뜻인가?

   <details markdown="1"><summary>답 확인</summary>

   메모리는 넘으면 **죽고**(OOM kill), CPU는 넘으면 **느려진다**(스로틀링, 대기). `20000 100000`은 100ms 주기 중 20ms만 사용, 즉 0.2 CPU를 뜻한다. → 코어 4 (4.1)

   </details>

6. `--cpus`와 `--cpu-shares`는 어떻게 다른가?

   <details markdown="1"><summary>답 확인</summary>

   `--cpus`는 사용 가능한 CPU 코어 수의 절대 상한(CFS 대역폭 제어, `cpu.max`)이다. `--cpu-shares`는 경쟁할 때의 상대적 가중치(`cpu.weight`)일 뿐 절대 상한이 아니다. → 코어 3 (3.1)

   </details>

7. `--pids-limit`은 무엇을 막으며, 왜 [6장](06-컨테이너-격리-네임스페이스.md)의 "네임스페이스만으로는 부족하다"를 보여 주는 예인가?

   <details markdown="1"><summary>답 확인</summary>

   포크 폭탄처럼 프로세스를 무한히 만들어 호스트를 고갈시키는 상황을 막는다(`pids.max`). PID 네임스페이스는 프로세스가 보이는 범위만 나눌 뿐 생성 개수를 제한하지 못하므로, 자원 축(cgroups)이 따로 필요하다는 것을 보여 준다. → 코어 3 (3.1)

   </details>

8. `--oom-kill-disable`을 쓸 때의 주의점은?

   <details markdown="1"><summary>답 확인</summary>

   해당 cgroup의 OOM killer를 끄는 옵션이므로 반드시 `--memory`로 명확한 상한을 함께 지정해야 한다. 상한 없이 쓰면 호스트 메모리 고갈로 이어질 수 있어 위험하다. → 코어 4 (4.2)

   </details>

### 3. 기억 고리

- **C++ 유추:** cgroups = 컨테이너 단위로 거는 `setrlimit()`. ⚠️ 깨지는 곳: 메모리 한도 초과는 `bad_alloc`처럼 잡을 수 있는 실패가 아니라 `SIGKILL`이고, CPU 한도는 실패가 아니라 주기마다 멈춰 세우는 스로틀링이다.
- **비유:** cgroups = 공유 오피스의 계량기와 차단기. 네임스페이스(칸막이)로 서로 안 보여도 전기(CPU)·수도(메모리)는 계량기로 재고 상한을 건다. ⚠️ 비유가 깨지는 지점: 상한을 넘었을 때 반응이 자원마다 다르다. CPU는 차단이 아니라 "다음 주기까지 대기"(스로틀링)이고, 메모리는 그 칸의 프로세스 하나를 강제로 내보낸다(SIGKILL).
- **묶음(3의 법칙):** Docker 옵션 3대장(`--cpus`·`--memory`·`--pids-limit`) ↔ 제어 파일 3개(`cpu.max`·`memory.max`·`pids.max`) / v2의 3원칙(하나의 계층·하나의 경로·`subtree_control`로 켜기).
- **대칭·순서:** CPU 초과 = 느려짐 ↔ 메모리 초과 = 죽음. cgroupfs(직접 쓰기) ↔ systemd(요청하기). 순서: Docker 옵션 → OCI `linux.resources` → runc → 드라이버 → 제어 파일 → 커널.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`--memory=512m` 컨테이너가 600MB를 쓰려 할 때 일어나는 일"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "컨테이너로 옮긴 서버가 로그 없이 죽는 이유와 틱이 튀는 이유"를 `setrlimit`·`bad_alloc`·CPU 경쟁 경험과 비교해 설명해 보세요.
- **랜덤 논리 게임:** A "cgroup 드라이버는 단순한 cgroupfs가 낫다" vs B "systemd가 init이면 systemd 드라이버여야 한다" — 양쪽을 번갈아 변호해 보세요. (systemd와의 충돌, kubelet과의 드라이버 일치를 근거로)
- **AI 역할 반전:** "내가 cgroups v2 구조와 Docker 옵션↔제어 파일 대응, OOMKilled를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/03_자원_제어의_진화.md (도입부, 3.1·3.2 v2 unified hierarchy 개념만 요약(v1 세부는 생략), 3.3 cgroup 드라이버, 3.4 주요 컨트롤러와 Docker 옵션 매핑, 3.5 OOM Killer, 3.6 하이브리드 모드, 실습); kubernetes-textbook-main/01-쿠버네티스로-가는-길/02-컨테이너의-이해.md (2.4 cgroups — 버전 확인, CPU 스로틀링 설명)*
