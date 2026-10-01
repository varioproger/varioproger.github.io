---
title: "1장. Docker 아키텍처 개관 — dockerd에서 containerd까지"
---

# 1장. Docker 아키텍처 개관 — dockerd에서 containerd까지

`docker run nginx` 한 줄을 입력하면 화면에는 몇 초 안에 컨테이너가 떠 있는 결과만 보입니다. 하지만 그 이면에서는
CLI 프로세스가 소켓을 통해 데몬에 요청을 보내고, 데몬이 다시 별도의 데몬에게 작업을 위임하고, 그 데몬이 또
별도의 프로세스를 fork해서 마지막에야 커널의 `clone()`과 `exec()`가 호출되는, 생각보다 긴 여정이 벌어집니다.
이 장에서는 그 여정 전체를 하나씩 분해합니다. 이후 장에서 다룰 네임스페이스(2장), cgroups(3장), OCI 스펙(4장),
containerd 내부 구조(5장)는 모두 이 장에서 그리는 큰 그림 위에 놓이는 세부 사항이므로, 여기서 각 컴포넌트의
역할과 경계를 명확히 잡아두는 것이 이후 전체 학습의 기반이 됩니다.

## 1.1 왜 하나의 프로그램이 아니라 여러 계층인가

Docker를 처음 접하면 "컨테이너를 실행하는 프로그램"이 하나로 통합되어 있을 것이라고 생각하기 쉽습니다.
실제로 2013~2014년의 초기 Docker는 지금보다 훨씬 단일체(monolithic)에 가까웠습니다. `docker` 데몬 하나가
이미지 관리, 컨테이너 실행, 네트워크 설정을 모두 직접 처리했습니다. 이 구조에는 몇 가지 문제가 있었습니다.

첫째, Docker 회사(당시 dotCloud)가 만든 컨테이너 실행 방식이 사실상의 표준이 되어가면서, 다른 벤더나
플랫폼(특히 Kubernetes 생태계)이 Docker에 종속되지 않고도 컨테이너를 실행할 수 있는 공통 규격이 필요해졌습니다.
이 요구가 2015년 **OCI(Open Container Initiative)** 의 출범으로 이어졌고, 컨테이너를 실행하는 저수준 런타임의
동작 방식을 명세화한 **OCI Runtime Specification**과 이미지 포맷을 정의한 **OCI Image Specification**이
표준화되었습니다. runc는 이 Runtime Spec의 참조 구현으로 Docker가 자체 개발해 기부한 도구입니다.

둘째, dockerd라는 하나의 프로세스가 컨테이너의 생명주기까지 직접 붙들고 있으면, dockerd를 업그레이드하거나
재시작할 때마다 실행 중이던 모든 컨테이너가 함께 죽어야 하는 문제가 있었습니다. 운영 환경에서 데몬을 패치할
때마다 서비스가 끊기는 것은 받아들이기 어려운 제약입니다. 이 문제를 해결하기 위해 Docker는 컨테이너 실행을
담당하는 부분을 별도 프로세스로 분리하고, 그 실행 담당 프로세스가 dockerd보다 오래 살아남을 수 있는 구조를
설계했습니다. 이것이 containerd이고, 더 나아가 containerd 자체도 재시작될 수 있도록 실제 컨테이너 프로세스의
부모 역할을 하는 shim이라는 계층을 한 번 더 두었습니다. 이런 지향점을 흔히 "데몬리스(daemonless)"라고
부르는데, 정확히는 "상위 데몬이 없어도 컨테이너 프로세스 자체는 계속 살아있을 수 있다"는 의미입니다.

셋째, containerd는 2017년 CNCF(Cloud Native Computing Foundation)에 기부되어 Docker사만의 프로젝트가
아니라 커뮤니티가 함께 관리하는 중립적인 프로젝트가 되었습니다. 이 덕분에 containerd는 Docker뿐 아니라
Kubernetes의 CRI(Container Runtime Interface) 구현체로도 널리 쓰이게 되었고, 실제로 오늘날 대부분의 관리형
Kubernetes 클러스터는 containerd를 직접 노드의 컨테이너 런타임으로 사용합니다(dockerd를 거치지 않습니다).
즉 지금은 containerd가 dockerd의 "부속품"이 아니라, dockerd와 Kubernetes kubelet이 공통으로 의존하는
독립적인 런타임 계층이라고 이해하는 편이 정확합니다.

## 1.2 전체 실행 경로: CLI에서 커널까지

`docker run -d --name web nginx:latest`를 실행했을 때 각 계층이 어떤 역할을 하는지 순서대로 따라가 보겠습니다.

```
docker CLI
   │  (REST API 호출, Unix 도메인 소켓 /var/run/docker.sock)
   ▼
dockerd (Docker Engine 데몬)
   │  (내부적으로 libcontainerd를 통해 containerd 클라이언트 API 호출, gRPC over
   │   /run/containerd/containerd.sock)
   ▼
containerd (containerd 데몬)
   │  (Runtime v2 shim API 호출 — 컨테이너 하나(또는 태스크 그룹)마다 shim 프로세스 fork)
   ▼
containerd-shim-runc-v2 (컨테이너별 shim 프로세스)
   │  (OCI Runtime Spec에 따라 runc를 서브프로세스로 실행)
   ▼
runc
   │  (clone()/unshare()로 네임스페이스 생성, cgroup 설정, pivot_root, capabilities 적용 후
   │   최종적으로 execve()로 컨테이너의 엔트리포인트 프로세스를 실행하고 runc 자신은 종료)
   ▼
Linux Kernel (namespaces, cgroups, seccomp, capabilities, overlayfs 등)
```

이 그림에서 중요한 것은 각 화살표가 단순히 "호출한다"는 의미가 아니라, 계층마다 프로세스 경계가 실제로
나뉘어 있다는 점입니다. `docker` CLI는 요청을 보내고 응답을 받으면 그걸로 끝나는 클라이언트일 뿐이며, 컨테이너가
실행되는 동안 CLI 프로세스가 살아있을 필요는 전혀 없습니다. dockerd와 containerd는 서로 다른 바이너리로
컴파일되어 다른 systemd 유닛으로 관리되는 완전히 독립된 데몬입니다. 그리고 containerd가 컨테이너를 하나
생성할 때마다 그 컨테이너를 전담하는 shim 프로세스가 새로 fork됩니다. 즉 컨테이너 100개를 띄우면 최소 100개의
shim 프로세스가 떠 있게 됩니다(정확히는 컨테이너 단위가 아니라 태스크 단위이며, 대부분의 경우 컨테이너 하나당
shim 하나로 대응됩니다).

runc는 조금 특별합니다. runc는 컨테이너를 "실행하는 순간"에만 잠깐 존재하는 일회성 프로세스입니다. runc는
네임스페이스를 만들고, cgroup에 프로세스를 등록하고, 루트 파일시스템을 pivot_root로 교체하고, capabilities와
seccomp 프로파일을 적용한 다음, 최종적으로 컨테이너의 엔트리포인트(예: `nginx -g daemon off;`)를 `execve()`로
실행합니다. `execve()`는 프로세스를 새로 만들지 않고 현재 프로세스의 이미지를 통째로 교체하는 시스템 콜이므로,
이 순간 이후로는 runc 프로세스 자체가 사라지고 그 자리를 nginx 프로세스가 대신 차지합니다. 결과적으로 컨테이너가
실제로 실행되고 있는 동안에는 runc 프로세스가 존재하지 않으며, 남아있는 것은 shim과 컨테이너의 실제 워크로드
프로세스(그리고 그 자식들)뿐입니다.

## 1.3 shim이 존재하는 이유 — daemonless의 핵심

여기서 자연스럽게 드는 의문이 있습니다. runc가 실행만 하고 사라진다면, 컨테이너 프로세스의 stdout/stderr는
누가 붙잡고 있으며, 컨테이너가 종료됐을 때 그 exit code는 누가 회수(reap)하는가 하는 문제입니다. 리눅스에서
자식 프로세스가 종료되면 부모가 `wait()` 계열 시스템 콜로 종료 상태를 회수해야 좀비 프로세스가 남지 않습니다.
runc는 이미 사라진 뒤이므로 이 역할을 할 수 없습니다.

이 역할을 하는 것이 바로 `containerd-shim-runc-v2`입니다. shim은 runc를 서브프로세스로 실행시키는
주체이면서 동시에, runc가 `execve()`로 자신을 컨테이너 프로세스로 치환한 뒤에도 그 컨테이너 프로세스의
**부모 프로세스**로 남습니다(정확히는 리눅스 프로세스 트리 상에서 컨테이너의 초기 프로세스가 shim의 자식이
되도록 설계되어 있습니다). shim은 컨테이너의 stdio를 파이프나 콘솔로 유지하고, containerd가 로그를 스트리밍할
수 있도록 소켓을 열어두고, 컨테이너 프로세스가 종료되면 그 exit code를 회수해 containerd에 이벤트로 전달하는
역할을 합니다.

이 구조가 만들어내는 가장 중요한 성질은, **dockerd와 containerd가 모두 죽거나 재시작되어도 shim과 그 자식인
컨테이너 프로세스는 영향을 받지 않는다**는 것입니다. dockerd를 업그레이드하기 위해 `systemctl restart docker`를
실행해도, 그 데몬이 관리하던 shim들은 고아 프로세스가 되어 리눅스 커널의 init(PID 1) 프로세스(또는 subreaper로
설정된 containerd)에게 재입양될 뿐, 계속 실행됩니다. dockerd가 다시 뜨면 containerd에 다시 연결해서 기존에
떠 있던 컨테이너들의 상태를 다시 동기화합니다. 이것이 바로 "daemonless" 지향점의 실체입니다. 정확히는 데몬
자체가 없는 것이 아니라, **상위 데몬의 생사가 실행 중인 워크로드의 생사와 분리되어 있다**는 의미로 이해하는
것이 맞습니다.

## 1.4 프로세스 트리로 직접 확인하기

이론만으로는 감이 잘 오지 않으므로, 실제로 리눅스 호스트에서 컨테이너를 하나 띄우고 프로세스 트리를 들여다
보겠습니다.

```bash
# 컨테이너 하나를 백그라운드로 실행
docker run -d --name web nginx:latest

# 프로세스 트리를 트리 형태로 확인
ps -ef --forest | grep -E "dockerd|containerd|nginx" 
```

전형적인 출력은 다음과 비슷한 형태를 보입니다(PID는 예시입니다).

```
root   1000  ... /usr/bin/dockerd -H fd://
root   1050  ... \_ /usr/bin/containerd
root   2101  ...     \_ /usr/bin/containerd-shim-runc-v2 -namespace moby -id <container-id>
root   2130  ...         \_ nginx: master process nginx -g daemon off;
www    2170  ...             \_ nginx: worker process
```

여기서 눈여겨봐야 할 점은 dockerd와 containerd가 부모-자식 관계로 표시되긴 하지만(containerd가 dockerd에
의해 fork되어 시작되었기 때문), shim은 containerd의 직계 자식으로 fork된 뒤 곧바로 자신을 별도의 세션으로
분리(setsid 등)하여 dockerd/containerd와의 생명주기 결합을 끊습니다. 그래서 `pstree -p`로 보면 shim이
containerd 아래 매달려 있는 것처럼 보이지만, 실제로 dockerd나 containerd를 죽여도 shim과 nginx 프로세스는
살아있는 것을 확인할 수 있습니다.

```bash
# containerd를 강제로 재시작해도 컨테이너는 살아있는지 확인
systemctl restart containerd
docker ps   # 여전히 web 컨테이너가 Up 상태로 보임

# shim의 부모 PID 확인 (재시작 전후 비교)
ps -o pid,ppid,cmd -p $(pgrep -f "shim-runc-v2.*<container-id>")
```

`containerd`를 재시작한 직후 shim의 PPID를 확인하면, 잠깐 1(또는 containerd가 subreaper로 설정한 자기 자신의
새 PID)로 바뀌었다가 containerd가 다시 기동하면서 기존 shim들을 다시 인식(recover)하는 과정을 관찰할 수
있습니다. 이 재인식 과정은 containerd가 자신의 상태 디렉터리(`/run/containerd`, `/var/lib/containerd`)에
남겨둔 메타데이터와 shim이 열어둔 소켓을 통해 이루어집니다. 즉 상태는 프로세스의 메모리가 아니라 디스크와
소켓 파일에 있기 때문에 데몬이 재시작되어도 복구가 가능합니다.

## 1.5 각 컴포넌트의 정확한 역할 경계

지금까지의 흐름을 컴포넌트별 책임으로 다시 정리하면 다음과 같습니다.

| 컴포넌트 | 주요 책임 | 통신 방식 |
|---|---|---|
| `docker` CLI | 사용자 명령을 REST API 호출로 변환 | HTTP over Unix 소켓 (`/var/run/docker.sock`) 또는 TCP |
| `dockerd` | 이미지 관리, 네트워크(libnetwork/CNM), 볼륨, 빌드(BuildKit 위임), 컨테이너 라이프사이클의 상위 조정 | REST API 서버 + containerd gRPC 클라이언트(libcontainerd) |
| `containerd` | 이미지 pull/저장(content store), 스냅샷/레이어 관리, 컨테이너·태스크 관리, CRI 제공 | gRPC 서버 (`/run/containerd/containerd.sock`) |
| `containerd-shim-runc-v2` | 컨테이너 프로세스의 부모 역할, stdio/로그 스트림 유지, exit 처리, 저수준 런타임 호출 | Runtime v2 shim API (ttrpc) |
| `runc` | OCI Runtime Spec에 따라 네임스페이스/cgroup/마운트를 구성하고 컨테이너 프로세스를 execve로 실행 | CLI 인자 + config.json (OCI bundle) |

dockerd가 하는 일 중 상당수는 사실 "컨테이너를 실행하는 일" 자체가 아니라 그 주변 기능이라는 점도
짚어둘 필요가 있습니다. 네트워크 브리지 생성, 포트 매핑을 위한 iptables/nftables 규칙 삽입, 볼륨 마운트
관리, 빌드 요청을 BuildKit으로 위임하는 것, Swarm 모드의 오케스트레이션 등은 모두 dockerd의 몫이며,
containerd나 runc는 이런 것들을 전혀 알지 못합니다. containerd와 runc는 순수하게 "이미지를 컨테이너로
실체화하고 실행한다"는 역할에 집중되어 있습니다. 이 경계는 7장(Docker Engine API와 CLI)과 11장(libnetwork과
CNM)에서 다시 자세히 다룹니다.

## 1.6 2026년 현재의 아키텍처 변화

이 교재를 집필하는 시점(2026년 9월) 기준으로, 위에서 설명한 기본 골격 자체는 유지되지만 몇 가지 중요한
변화가 있었습니다. 이 변화들은 오래된 자료를 참고할 때 반드시 주의해야 할 지점입니다.

### containerd 이미지 스토어의 기본값 전환

Docker Engine은 오랫동안 두 가지 이미지/스토리지 관리 경로를 병행해 왔습니다. 하나는 dockerd가 자체적으로
구현한 graphdriver(overlay2, devicemapper 등) 기반의 전통적인 경로이고, 다른 하나는 containerd의 content
store와 snapshotter를 그대로 사용하는 경로입니다. containerd 이미지 스토어는 Docker Engine 23~24 무렵부터
옵트인(opt-in) 기능으로 존재해 왔지만, **Docker Engine 29부터는 신규 설치 시 containerd 이미지 스토어가
기본값**이 되었습니다. 이는 이미지의 레이어 저장과 조회를 담당하는 스토리지 스택 전체가 dockerd의 자체 구현이
아니라 containerd 쪽으로 완전히 일원화되었다는 의미입니다. 다만 기존에 이미 legacy graphdriver로 운영 중이던
설치본이 자동으로 강제 마이그레이션되는 것은 아니며, 관리자가 명시적으로 전환하지 않는 한 기존 방식이
그대로 유지됩니다. legacy graphdriver 경로는 deprecated 상태로 표시되어 향후 릴리스에서 제거될 예정이지만,
당장 폐지된 것은 아닙니다. 이 주제는 6장(이미지와 스토리지)에서 스냅샷터와 overlay2의 관계를 포함해 훨씬
자세히 다룹니다.

### moby/moby의 Go 모듈 재편

Docker Engine의 오픈소스 코드베이스인 moby/moby 프로젝트는 오랜 기간 Go 모듈 경로가 `github.com/docker/docker`
로 고정되어 있었는데, 프로젝트가 성숙해지면서 이 루트 모듈 경로가 `github.com/moby/moby/v2`로 재편되었습니다.
이는 단순한 이름 변경이 아니라, Go 모듈 버저닝 규칙(메이저 버전이 2 이상이면 모듈 경로에 버전 접미사가
붙어야 한다는 규칙)에 맞춰 moby 프로젝트가 독립적인 버전 체계를 갖춘 성숙한 모듈로 재정비되었다는 신호이기도
합니다. 이 프로젝트를 라이브러리로 임포트하거나 소스를 직접 빌드해본 개발자라면 import 경로가 달라졌다는
점을 기억해 둘 필요가 있습니다.

### 실험적 embedded-containerd

지금까지 설명한 구조에서 containerd는 항상 dockerd와는 별도의 프로세스였습니다. 이 분리 자체가 앞서 설명한
독립적인 업그레이드/재시작 가능성의 근거였습니다. 그런데 2026년 현재 Docker Engine에는 실험적으로
**embedded-containerd**라는 기능이 존재합니다. 이는 containerd를 별도 프로세스로 fork하는 대신, dockerd
프로세스 내부에서 containerd의 코드를 라이브러리 형태로 구동하는 방식입니다. 소규모 환경이나 리소스가
제한된 엣지 환경에서 프로세스 수를 줄이고 배포를 단순화하려는 목적으로 이해할 수 있습니다. 다만 이 기능은
아직 실험적(experimental) 단계이며, 앞서 설명한 "containerd가 재시작되어도 컨테이너가 살아있다"는 이점이
embedded 모드에서는 dockerd 자체의 생사와 결합될 수 있다는 트레이드오프가 있습니다. 프로덕션에서는 신중하게
접근해야 하는 기능이며, 표준 배포 형태는 여전히 containerd를 별도 프로세스로 두는 것입니다.

### containerd Runtime v2와 Sandbox API

containerd 쪽에서도 진화가 있었습니다. 2.0/2.x 계열에서 **Sandbox API**가 experimental 단계를 벗어나 stable로
승격되었습니다. Sandbox API는 gVisor나 Kata Containers처럼 컨테이너를 경량 VM 안에서 격리해 실행하는 런타임을
containerd가 좀 더 일관된 방식으로 다룰 수 있게 해주는 추상화 계층입니다. 기존에는 이런 VM 기반 런타임들이
각자의 방식으로 containerd와 통합해야 했지만, Sandbox API가 안정화되면서 "샌드박스"라는 개념 자체를
containerd의 일급 객체로 다룰 수 있게 되었습니다. 이 부분은 4장(OCI Runtime과 런타임 생태계)과 5장(containerd
아키텍처 심화)에서 gVisor, Kata Containers와 함께 자세히 살펴봅니다. 한 가지 안심할 수 있는 부분은, 이런
변화에도 불구하고 Runtime v2 shim 인터페이스 자체는 containerd 1.x 시절과 하위 호환을 유지하고 있다는
점입니다. 즉 이 장에서 설명한 shim의 기본 동작 원리는 containerd 버전이 올라가도 크게 달라지지 않습니다.

### 버전 정리

이 교재가 기준으로 삼는 조합은 다음과 같습니다. 실습 중 버전이 다르게 나온다면 이 표를 기준으로 차이를
가늠해 보시기 바랍니다.

| 컴포넌트 | 버전(2026-09 기준) |
|---|---|
| Docker Engine | 29.8.1 (2026-09-03 릴리스) |
| containerd | v2.3.5 (moby가 번들로 pin) |
| runc | v1.5.1 (moby가 번들로 pin) |

```bash
# 현재 설치된 버전과 번들 조합 확인
docker version
docker info --format '{{.ServerVersion}} / containerd: {{.ContainerdCommit.ID}} / runc: {{.RuncCommit.ID}}'
```

## 1.7 이 장에서 아직 다루지 않은 것들

의도적으로 이 장에서는 각 계층의 "내부 구현"까지는 파고들지 않았습니다. 네임스페이스가 정확히 어떻게 격리를
만들어내는지는 2장에서, cgroup으로 자원을 어떻게 제한하는지는 3장에서, OCI 스펙이 정의하는 config.json의
정확한 구조와 runc가 그것을 어떻게 해석하는지는 4장에서, containerd의 플러그인 구조와 CRI 서버는 5장에서,
이미지 레이어와 snapshotter의 관계는 6장에서 각각 이어받아 다룹니다. 이 장의 목적은 그 모든 세부 사항이
어느 계층에 속하는지 지도를 그리는 것이었습니다. 다음 장부터는 이 지도 위의 각 지점을 하나씩 확대해서
들여다보게 됩니다.

## 핵심 요약

- Docker의 실행 경로는 `docker` CLI → dockerd(REST API) → containerd(gRPC) → containerd-shim-runc-v2 →
  runc → 커널의 네임스페이스/cgroups 순으로 이어진다.
- 계층이 분리된 이유는 OCI 표준화를 통한 벤더 중립성 확보, 그리고 상위 데몬(dockerd, containerd)이
  재시작되어도 실행 중인 컨테이너가 죽지 않도록 하기 위함이다.
- runc는 네임스페이스/cgroup/마운트를 구성한 뒤 `execve()`로 컨테이너 프로세스를 실행하고 자기 자신은
  사라지는 일회성 프로세스다.
- shim(`containerd-shim-runc-v2`)은 컨테이너 프로세스의 실질적 부모로 남아 stdio 스트리밍과 exit code
  회수를 담당하며, 이것이 "daemonless" 지향점의 핵심 메커니즘이다.
- containerd는 2017년 CNCF로 이관되어 Docker 전용 프로젝트가 아니라 Kubernetes CRI 구현체로도 널리
  쓰이는 중립적 프로젝트가 되었다.
- 2026년 현재, Docker Engine 29부터 containerd 이미지 스토어가 신규 설치 기본값이며, moby/moby는
  `github.com/moby/moby/v2` 모듈 경로로 재편되었고, 실험적 embedded-containerd 기능이 존재한다.
- containerd 2.x의 Sandbox API가 stable로 승격되어 VM 기반 런타임 통합이 강화되었지만, Runtime v2 shim
  인터페이스는 여전히 하위 호환을 유지한다.

## 실습

다음 실습은 일반적인 systemd 기반 Linux 배포판(Docker Engine 29.x, containerd 2.3.x)을 전제로 합니다.
root 권한 또는 `docker` 그룹 권한이 필요합니다.

```bash
# 1) 설치된 버전과 번들 정보 확인
docker version
docker info --format '{{.ServerVersion}} / {{.CgroupVersion}} / {{.CgroupDriver}}'
# 확인 포인트: ServerVersion이 29.x대인지, CgroupVersion이 2인지 확인합니다.

# 2) 컨테이너 하나를 실행하고 프로세스 트리 확인
docker run -d --name web nginx:latest
pstree -p $(pgrep -x dockerd) | head -30
# 확인 포인트: dockerd 아래 containerd, 그 아래 containerd-shim-runc-v2, 그 아래
# nginx 프로세스가 계층적으로 보이는지 확인합니다. pstree가 없다면 `ps -ef --forest`로 대체합니다.

# 3) shim 프로세스만 따로 확인
ps -eo pid,ppid,cmd | grep "shim-runc-v2" | grep -v grep
# 확인 포인트: shim 프로세스의 인자에 --namespace moby와 컨테이너 ID가 포함되어 있는지 확인합니다.

# 4) dockerd를 재시작해도 컨테이너가 살아있는지 확인
systemctl restart docker
docker ps
# 확인 포인트: web 컨테이너의 STATUS가 Up 상태를 유지하며, CREATED 이후 경과 시간이 초기화되지
# 않는지(즉 컨테이너 자체가 재시작된 것이 아니라 dockerd만 재시작되었는지) 확인합니다.

# 5) containerd 소켓과 상태 디렉터리 확인
ls -l /run/containerd/containerd.sock
sudo ls /run/containerd/io.containerd.runtime.v2.task/moby/
# 확인 포인트: 실행 중인 컨테이너 ID와 동일한 이름의 디렉터리가 존재하며, 그 안에 shim이 사용하는
# 소켓과 로그 파일이 있는지 확인합니다.

# 6) 정리
docker rm -f web
```

다음 장에서는 이 실행 경로의 마지막 단계, 즉 runc가 커널에 요청하는 격리 메커니즘 중 가장 근본적인
Linux Namespaces를 하나씩 뜯어봅니다.
