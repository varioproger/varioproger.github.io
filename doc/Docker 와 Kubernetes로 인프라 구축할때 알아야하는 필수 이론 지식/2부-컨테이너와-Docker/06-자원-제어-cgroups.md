---
title: "6장. 자원 제어 — cgroups"
parent: "2부. 컨테이너와 Docker"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 6
---

# 6장. 자원 제어 — cgroups

## 이 장에서 배우는 것

- 네임스페이스만으로는 자원 사용을 제한할 수 없고, 이를 cgroups가 담당함을 이해한다.
- cgroups v2의 핵심 아이디어(하나의 통합 계층)를 안다.
- Docker의 `--cpus`, `--memory`, `--pids-limit` 같은 옵션이 cgroup 제어 파일로 이어지는 관계를 안다.
- 메모리 한도를 넘으면 OOM Killer가 컨테이너를 종료하고, `OOMKilled`로 확인할 수 있음을 안다.

---

## 6.1 왜 cgroups가 필요한가

5장의 네임스페이스는 "무엇이 보이는가"를 정한다. 하지만 보이는 것과 쓸 수 있는 자원의 양은 별개다. 네임스페이스만 적용된 프로세스는 독립된 시스템에 있는 것처럼 느끼지만, 여전히 호스트의 CPU와 메모리를 제한 없이 가져다 쓸 수 있다.

- 컨테이너 하나가 메모리 누수를 일으키면 호스트 전체가 스와핑이나 OOM 상황에 몰릴 수 있다.
- CPU를 많이 쓰는 컨테이너 하나가 다른 컨테이너의 응답 속도를 떨어뜨릴 수 있다.

이 문제를 해결하는 커널 기능이 **cgroups(control groups)** 다. 프로세스 그룹의 자원 사용량을 **제한하고 측정**한다.

---

## 6.2 cgroups v2의 구조

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

---

## 6.3 Docker/containerd/runc는 cgroup을 어떻게 다루나

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

## 6.4 CPU, 메모리 한도 — Docker 옵션과 cgroup의 대응

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

`--pids-limit`은 포크 폭탄처럼 프로세스를 무한히 만들어 호스트를 고갈시키는 상황을 막는다. 네임스페이스만으로는 이를 막을 수 없다는 점에서 "네임스페이스만으로는 격리가 완전하지 않다"는 5장 내용을 자원 관점에서 보여 준다.

### CPU와 메모리는 한도를 넘었을 때 다르게 동작한다

(Kubernetes 종합서 2.4절의 설명이다.) 메모리는 한도를 넘으면 종료되고, CPU는 한도를 넘으면 스로틀링(대기)된다. CPU 한도는 `cpu.max` 값 `20000 100000`처럼 "100ms 주기 중 20ms만 사용"(= 0.2 CPU)의 형태로 표현된다. 메모리는 넘으면 **죽고**, CPU는 넘으면 **느려진다**. 쿠버네티스의 `resources.limits.memory`와 `OOMKilled`도 결국 이 메커니즘의 결과다.

---

## 6.5 OOM Killer와 `OOMKilled`

`--memory`로 상한을 건 컨테이너가 그 한도를 넘으면, 커널은 해당 cgroup 안에서 자체적으로 **OOM killer**를 동작시킨다. 시스템 전체 메모리가 부족할 때 동작하는 전역 OOM killer와는 별개로, 특정 cgroup의 사용량이 `memory.max`를 초과했을 때 그 cgroup의 프로세스 하나를 골라 `SIGKILL`로 종료한다.

종료된 컨테이너는 `State.OOMKilled`가 `true`로 표시된다. 애플리케이션 로그에는 흔적 없이 프로세스가 갑자기 사라진 것처럼 보이므로, **이유 없이 재시작을 반복하는 컨테이너라면 가장 먼저 이 필드를 확인**한다.

```bash
docker inspect --format '{{.State.OOMKilled}}' <container-id-or-name>
```

- `--oom-kill-disable`: 해당 cgroup의 OOM killer를 끈다. 반드시 `--memory`로 명확한 상한을 함께 지정해야 하며, 상한 없이 쓰면 호스트 메모리 고갈로 이어질 수 있어 위험하다.

---

## 6.6 직접 확인해 보기

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

## 핵심 요약

- 네임스페이스는 가시성만 정할 뿐 자원 사용량은 제한하지 못한다. 자원 제한과 측정은 cgroups가 담당한다.
- cgroups v2는 모든 컨트롤러가 하나의 통합 계층을 공유하며, 현재 주류 배포판의 기본값이다.
- runc는 cgroupfs 또는 systemd 드라이버로 cgroup을 만들고, systemd가 init인 환경에서는 systemd 드라이버가 권장된다. 쿠버네티스에서는 kubelet과 런타임의 드라이버가 일치해야 한다.
- `--cpus`/`--memory`/`--pids-limit` 등 Docker 옵션은 cgroup 제어 파일(`cpu.max`, `memory.max`, `pids.max`)에 값을 쓰는 것이다.
- 메모리 한도를 넘으면 OOM killer가 SIGKILL로 종료하고, `docker inspect`의 `State.OOMKilled`로 확인한다.

## 확인 질문

1. 네임스페이스만 적용된 컨테이너가 호스트 메모리를 다 써 버릴 수 있는 이유는?
2. `docker run --memory=512m ...`을 하면 커널의 어느 cgroup 제어 파일에 값이 쓰이는가?
3. 컨테이너가 로그 없이 갑자기 재시작될 때 가장 먼저 확인할 필드는 무엇인가?

*원문 근거: docker-fundamental/03_자원_제어의_진화.md (도입부, 3.1·3.2 v2 unified hierarchy 개념만 요약(v1 세부는 생략), 3.3 cgroup 드라이버, 3.4 주요 컨트롤러와 Docker 옵션 매핑, 3.5 OOM Killer, 3.6 하이브리드 모드, 실습); kubernetes-textbook-main/01-쿠버네티스로-가는-길/02-컨테이너의-이해.md (2.4 cgroups — 버전 확인, CPU 스로틀링 설명)*
