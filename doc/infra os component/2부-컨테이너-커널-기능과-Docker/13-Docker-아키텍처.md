---
title: "13장. Docker 아키텍처"
parent: "2부. 컨테이너 커널 기능과 Docker"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 13
---

# 13장. Docker 아키텍처

> **🎮 게임 서버 개발자에게** — `docker run` 한 줄이 "프로그램 하나가 서버를 띄운다"로 보이지만, 실제로는 프로세스 다섯 개가 소켓으로 요청을 넘기며 이어 달리는 릴레이다. 관리 도구(CLI)가 서버에 명령을 보내고, 서버가 하위 데몬에게 위임하고, 마지막에 `fork`/`exec`로 내 프로세스가 뜬다. 이 구조를 모르면 "`docker` 데몬을 재시작해도 게임 서버가 안 죽는 이유", "`docker.sock`을 왜 함부로 열면 안 되는가", "쿠버네티스 노드에서는 왜 `docker ps`가 비어 있는가"를 설명할 수 없다. 핵심은 하나다. **관리하는 프로세스의 수명과 워크로드(내 서버 프로세스)의 수명이 일부러 분리되어 있다.**
>
> **🎯 실무에서 이 장이 필요한 순간**
> - Docker 데몬을 업그레이드하려고 `systemctl restart docker`를 쳐야 하는데, 접속자가 붙어 있는 게임 서버 컨테이너가 같이 죽을까 봐 겁난다.
> - 동료가 "원격에서 편하게 관리하게 `tcp://0.0.0.0:2375`를 열자"고 하고, 나는 그게 왜 위험한지 설명해야 한다.
> - 쿠버네티스 노드에 SSH로 들어가 `docker ps`를 쳤더니 아무것도 안 나오는데, 컨테이너는 분명히 돌고 있다.

## 코어 — 이것만은 100%

> **한 문장:** `docker` CLI는 REST 클라이언트일 뿐이고, 요청은 dockerd → containerd → shim → runc → 커널로 프로세스 경계마다 넘어가며, runc는 `execve`로 사라지고 shim이 컨테이너의 부모로 남기 때문에 상위 데몬이 재시작돼도 컨테이너는 산다.

1. **실행 경로는 프로세스 경계로 나뉜 다섯 계층** — `docker` CLI → `dockerd` → `containerd` → `containerd-shim-runc-v2` → `runc` → 커널. 쪼갠 이유는 벤더 중립(OCI)과 "데몬을 고쳐도 컨테이너는 살아야 한다"는 요구다.
2. **CLI는 소켓 위의 REST 클라이언트, dockerd는 편의 기능 조립자** — CLI는 `/var/run/docker.sock`에 HTTP 요청을 보낼 뿐이고, 포트 게시·네트워크·볼륨 같은 Docker 고유 개념은 dockerd가 containerd가 이해하는 저수준 요청으로 번역한다. 이 소켓에 접근할 수 있다는 것은 호스트 root와 같다.
3. **runc는 일회성, shim이 부모** — runc는 네임스페이스·cgroup을 구성하고 `execve()`로 내 프로세스가 된 뒤 사라진다. 이후 stdio 유지와 exit code 회수는 shim의 몫이고, 그래서 dockerd·containerd가 죽어도 컨테이너는 영향받지 않는다.
4. **containerd는 서비스+플러그인 구조이고 Docker와 쿠버네티스가 공유** — Content/Snapshots/Containers/Tasks 같은 gRPC 서비스를 제공한다. kubelet은 dockerd 없이 containerd에 직접 붙으며, containerd의 "네임스페이스"(`moby`, `k8s.io`)는 커널 네임스페이스와 무관한 이름 구분이다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 관리용 어드민 클라이언트가 로컬 소켓으로 명령을 보냄 | `docker` CLI ↔ dockerd (유닉스 소켓 REST) | 클라이언트는 요청만 보내고 일은 서버가 한다. 클라이언트가 죽어도 서버는 산다 | 어드민 포트와 달리 이 소켓은 **호스트 root 권한과 동급**이다. 소켓 파일 권한(`docker` 그룹)이 곧 인증이다 |
| `fork()` 후 부모가 `waitpid()`로 자식 종료 상태를 회수 | shim이 컨테이너 프로세스의 부모로 `wait` | 자식을 회수할 부모가 반드시 필요하다는 점 | runc가 `execve`로 자기 자신을 컨테이너 프로세스로 **치환**하기 때문에, 부모 역할은 별도 프로세스(shim)가 맡아야 한다 |
| 마스터/런처 프로세스를 분리해 워커를 안 죽이고 마스터만 교체(핫 업그레이드) | dockerd/containerd 재시작 시 컨테이너 생존 | 관리 프로세스 수명과 워크로드 수명을 분리하는 설계 | "daemonless"는 데몬이 없다는 뜻이 아니라 **상위 데몬의 생사가 워크로드의 생사와 분리돼 있다**는 뜻이다 |
| 내부 gRPC 서비스(인증, 매치메이킹 등)를 쪼개서 운영 | containerd의 Content/Images/Snapshots/Containers/Tasks 서비스 | 기능 단위로 API가 나뉘고 클라이언트가 여러 종류다 | containerd의 "네임스페이스"는 멀티테넌시용 메타데이터 구분이다. 커널 네임스페이스(9장)와 이름만 같다 |
| `ps -ef --forest`로 프로세스 트리 확인 | dockerd - containerd - shim - 컨테이너 프로세스 트리 | 부모-자식 관계로 구조를 읽는다 | 트리에는 containerd 아래 shim이 매달려 보이지만, shim은 `setsid` 등으로 생명주기 결합을 끊어 둔 상태다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `docker run -d nginx`를 친 터미널(CLI 프로세스)이 끝나도 nginx가 계속 도는 이유는 무엇일까?
> 2. `systemctl restart docker`를 하면 실행 중인 컨테이너는 어떻게 될까? 그 답의 근거는 어느 프로세스에 있을까?
> 3. 사용자를 `docker` 그룹에 넣는 것이 사실상 root 권한을 주는 것과 같다고 하는 이유는?
> 4. 쿠버네티스 노드에서 `docker ps`가 비어 있는데 컨테이너가 돌고 있다면 어디서 확인해야 할까?
>
> **처리법:** 🛠 실습 `ps -ef --forest | grep -E "dockerd|containerd|nginx"`, `curl --unix-socket /var/run/docker.sock http://localhost/version`, `sudo ctr -n moby containers list` → 바로 실행 · 🗺 관계도 CLI → dockerd → containerd → shim → runc → 커널 (화살표마다 프로세스 경계), 컨테이너 vs 태스크 · 📦 카드로 포트/소켓 표(`/var/run/docker.sock`, `/run/containerd/containerd.sock`), 컴포넌트별 책임 표, containerd 네임스페이스 `moby`/`k8s.io`

### 이 장에서 배우는 것

- `docker run` 한 줄이 커널에 도달하기까지 거치는 계층과 각 계층의 책임 경계
- `docker` CLI가 REST 클라이언트라는 사실과, 그것이 보안·원격 접속·도구 생태계에 주는 의미
- runc가 사라지고 shim이 남는 구조와 "dockerd를 재시작해도 컨테이너가 사는" 이유
- containerd의 서비스·플러그인 구조, Docker 경로와 쿠버네티스(CRI) 경로의 차이

---

## 코어 1. 실행 경로는 프로세스 경계로 나뉜 다섯 계층

### 1.1 왜 하나의 프로그램이 아니라 여러 계층인가

**한 줄 요약:** 벤더 중립 표준(OCI)과 "상위 데몬을 재시작해도 컨테이너는 살아야 한다"는 요구가 계층을 낳았다.

초기 Docker(2013&#126;2014년)는 `docker` 데몬 하나가 이미지 관리, 컨테이너 실행, 네트워크 설정을 모두 직접 처리하는 단일체에 가까웠다. 이 구조는 세 방향에서 한계에 부딪혔다.

- **표준화 요구:** Docker가 사실상 표준이 되자 다른 벤더와 쿠버네티스 생태계가 Docker에 종속되지 않고 컨테이너를 실행할 공통 규격이 필요해졌다. 이것이 2015년 **OCI**(Open Container Initiative)로 이어졌고, runc는 OCI Runtime Spec의 참조 구현이다(12장).
- **재시작 문제:** dockerd가 컨테이너 생명주기를 직접 붙들고 있으면, dockerd를 패치할 때마다 모든 컨테이너가 같이 죽어야 한다. 그래서 실행 담당을 별도 프로세스(containerd)로 분리하고, 그 containerd조차 재시작될 수 있도록 실제 컨테이너의 부모 역할을 shim에게 맡겼다.
- **중립적 프로젝트화:** containerd는 2017년 CNCF에 기부되어 쿠버네티스의 CRI 구현체로도 널리 쓰인다. 오늘날 대부분의 관리형 쿠버네티스 클러스터는 dockerd를 거치지 않고 containerd를 직접 쓴다. containerd는 dockerd의 부속품이 아니라 **dockerd와 kubelet이 공통으로 의존하는 독립 런타임 계층**이다.

### 1.2 `docker run`이 커널까지 가는 길

**한 줄 요약:** CLI → dockerd → containerd → shim → runc → 커널, 화살표마다 실제 프로세스 경계가 있다.

```
docker CLI
   │  (REST API, Unix 도메인 소켓 /var/run/docker.sock)
   ▼
dockerd (Docker Engine 데몬)
   │  (libcontainerd → containerd 클라이언트 API, gRPC over /run/containerd/containerd.sock)
   ▼
containerd
   │  (Runtime v2 shim API — 컨테이너(태스크)마다 shim 프로세스 fork)
   ▼
containerd-shim-runc-v2 (컨테이너별 shim)
   │  (OCI Runtime Spec에 따라 runc를 서브프로세스로 실행)
   ▼
runc
   │  (clone()/unshare()로 네임스페이스 생성, cgroup 설정, pivot_root, capabilities 적용,
   │   최종적으로 execve()로 엔트리포인트 실행 후 runc 자신은 종료)
   ▼
Linux Kernel (namespaces, cgroups, seccomp, capabilities, overlayfs 등)
```

각 컴포넌트의 책임은 다음처럼 갈린다.

| 컴포넌트 | 주요 책임 | 통신 방식 |
|---|---|---|
| `docker` CLI | 사용자 명령을 REST API 호출로 변환 | HTTP over Unix 소켓(`/var/run/docker.sock`) 또는 TCP |
| `dockerd` | 이미지 관리, 네트워크(libnetwork), 볼륨, 빌드(BuildKit 위임), 컨테이너 생명주기의 상위 조정 | REST API 서버 + containerd gRPC 클라이언트(libcontainerd) |
| `containerd` | 이미지 pull/저장(content store), 스냅샷/레이어 관리, 컨테이너·태스크 관리, CRI 제공 | gRPC 서버(`/run/containerd/containerd.sock`) |
| `containerd-shim-runc-v2` | 컨테이너 프로세스의 부모, stdio/로그 스트림 유지, exit 처리, 저수준 런타임 호출 | Runtime v2 shim API(ttrpc) |
| `runc` | OCI Runtime Spec에 따라 네임스페이스/cgroup/마운트를 구성하고 `execve`로 컨테이너 프로세스 실행 | CLI 인자 + `config.json`(OCI bundle) |

경계를 정확히 알아 두면 문제 위치를 좁힐 수 있다. 네트워크 브리지 생성, 포트 매핑용 iptables 규칙 삽입, 볼륨 마운트 관리, 빌드를 BuildKit으로 위임하는 일은 **dockerd의 몫**이다. containerd와 runc는 이런 것을 전혀 모르고 "이미지를 컨테이너로 실체화해 실행한다"는 일에만 집중한다.

### 1.3 프로세스 트리로 직접 확인하기

**한 줄 요약:** 컨테이너 하나당 shim 프로세스가 하나 떠 있고, 실제 워크로드는 shim의 자식이다.

```bash
docker run -d --name web nginx:latest
ps -ef --forest | grep -E "dockerd|containerd|nginx"
```

```
root   1000  ... /usr/bin/dockerd -H fd://
root   1050  ... \_ /usr/bin/containerd
root   2101  ...     \_ /usr/bin/containerd-shim-runc-v2 -namespace moby -id <container-id>
root   2130  ...         \_ nginx: master process nginx -g daemon off;
www    2170  ...             \_ nginx: worker process
```

컨테이너를 100개 띄우면 최소 100개의 shim이 뜬다(정확히는 컨테이너가 아니라 태스크 단위지만 대부분 1:1이다). runc는 이 트리에 없다. 컨테이너가 실행되는 동안 runc는 이미 `execve`로 nginx가 되어 사라졌기 때문이다. 이것은 1부에서 본 `fork`/`exec`와 같은 메커니즘이다([프로세스](../1부-리눅스-OS-구성-요소/02-프로세스.md)).

## 코어 2. CLI는 소켓 위의 REST 클라이언트, dockerd는 편의 기능 조립자

### 2.1 `docker` CLI는 컨테이너를 실행하지 않는다

**한 줄 요약:** CLI의 일은 명령을 HTTP 요청으로 바꿔 보내고 응답을 예쁘게 출력하는 것뿐이다.

많은 사람이 `docker` 바이너리가 이미지 다운로드, 레이어 조립, 네임스페이스 생성, 프로세스 실행을 직접 한다고 오해한다. 실제로는 전부 dockerd와 그 하위의 containerd, runc가 한다. CLI와 dockerd 사이는 기본적으로 유닉스 도메인 소켓 `/var/run/docker.sock`(대개 `/run/docker.sock`의 심볼릭 링크) 위의 HTTP다. 아래처럼 CLI 없이 `curl`로 같은 요청을 재현할 수 있다.

```bash
curl --unix-socket /var/run/docker.sock http://localhost/version
curl --unix-socket /var/run/docker.sock http://localhost/containers/json      # docker ps와 같은 정보원
curl --unix-socket /var/run/docker.sock http://localhost/v1.51/info           # 버전 명시
```

URL의 `localhost`는 의미 없는 자리채움이다. 이 사실에서 다음이 자연스럽게 설명된다.

- 사용자에게 소켓 접근 권한(대개 `docker` 그룹)이 필요한 이유 — 소켓이 파일이므로 표준 파일 권한(owner, group, mode)이 접근 통제다.
- `DOCKER_HOST` 환경 변수(또는 `docker context`)만 바꾸면 `tcp://`, `ssh://`로 원격 Docker 호스트를 다룰 수 있는 이유 — CLI에게는 "다른 엔드포인트에 같은 REST 요청을 보내는 것"일 뿐이다.
- Portainer, Lazydocker, VS Code Docker 확장 같은 도구가 CLI 없이 컨테이너를 제어하는 이유 — 같은 REST API를 직접 호출한다.

### 2.2 dockerd 내부 계층: 고수준 개념을 저수준으로 번역한다

**한 줄 요약:** dockerd 안에서 일어나는 일은 "REST 요청을 containerd gRPC 요청으로 재번역"하는 것이다.

```
docker CLI ──HTTP──▶ API 서버(요청 파싱, 인증/인가 훅, 버전 협상)
                      ▶ 라우터/핸들러(URL 경로 → containers, images, networks, volumes …)
                        ▶ daemon 패키지(컨테이너 상태 머신, 이미지 참조 해석, 볼륨/네트워크 연결)
                          ▶ libcontainerd(containerd 클라이언트 래퍼)
                            ▶ containerd gRPC API ▶ shim ▶ runc ▶ 컨테이너 프로세스
```

`daemon` 패키지가 dockerd의 두뇌다. containerd는 이미지, 컨테이너, 태스크, 스냅샷 같은 저수준 원시 개념만 안다. "포트를 게시한다", "이 네트워크에 연결한다", "이 볼륨을 마운트한다" 같은 Docker 특유의 상위 개념은 daemon 패키지가 조립해 containerd가 이해하는 요청으로 변환한다.

그렇다면 dockerd 없이 containerd만으로 컨테이너를 띄울 수 있는가? 가능하다. `ctr`이나 `nerdctl`이 dockerd를 거치지 않고 containerd에 직접 요청한다. 다만 포트 게시, 사용자 정의 브리지, 볼륨 드라이버 같은 dockerd의 편의 기능은 별도로 구현해야 한다(nerdctl은 그 상당수를 다시 구현해 Docker CLI와 비슷한 경험을 준다).

### 2.3 API 버전 협상과 daemon.json

**한 줄 요약:** API는 경로에 버전을 넣고 자동 협상하며, 데몬 동작은 `/etc/docker/daemon.json`으로 설정한다.

API URL에는 `/v1.51/containers/json`처럼 버전이 들어간다. 클라이언트가 버전을 고정하지 않으면 양쪽이 공통으로 지원하는 가장 높은 버전으로 자동 협상되고, `docker version`에서 양쪽의 `API version`을 볼 수 있다. 협상을 끄고 강제하려면 `DOCKER_API_VERSION=1.43 docker info`처럼 환경 변수를 쓴다. 하위 호환은 "best effort"라서 버전 차이가 너무 크면 일부 필드가 비거나 엔드포인트가 404를 낼 수 있다.

실무에서 자주 건드리는 `daemon.json` 키는 다음과 같다.

| 키 | 역할 |
|---|---|
| `hosts` | dockerd가 요청을 받을 엔드포인트(`unix://`, `tcp://`) |
| `log-driver` / `log-opts` | 컨테이너 로그 기본 드라이버(`json-file`, `journald`, `local` 등)와 옵션 |
| `storage-driver` | 이미지/컨테이너 스토리지 드라이버(`overlay2` 등) |
| `registry-mirrors` / `insecure-registries` | 미러 레지스트리 / TLS 검증 없이 허용할 레지스트리 |
| `default-address-pools` | 사용자 정의 브리지/오버레이에 할당할 IP 대역 풀([16장](16-Docker-네트워크.md)) |
| `default-runtime` | 기본 OCI 런타임(기본값 `runc`) |
| `live-restore` | 데몬 재시작 중에도 실행 중인 컨테이너를 유지할지 여부 |

커맨드라인 플래그와 `daemon.json`의 항목이 겹치면 충돌하므로 두 방식을 섞지 않는다. 수정 후에는 `sudo systemctl restart docker`로 반영한다.

### 2.4 이 소켓에 접근할 수 있다는 것 = 호스트 root

**한 줄 요약:** 인증 없이 TCP로 Docker API를 열면 호스트의 root를 내주는 것이다.

dockerd는 root로 동작하고(rootless 모드는 예외), API로 호스트 루트 파일시스템을 통째로 바인드 마운트한 컨테이너에서 셸을 열 수 있다. 그래서 "이 API를 호출할 수 있는 사람 = 이 호스트의 root"다. 인증 없이 `2375` 포트가 열린 Docker 호스트를 스캔해 암호화폐 채굴 컨테이너를 심는 공격이 오랫동안 반복되어 왔다. TCP 노출이 꼭 필요하면 다음을 지킨다.

- `tlsverify`와 `tlscacert`, `tlscert`, `tlskey`로 **클라이언트 인증서까지 검증하는 mTLS**를 강제한다.
- `0.0.0.0`이 아니라 필요한 인터페이스·VPN 대역으로 한정하고 방화벽/보안 그룹으로 추가 제한한다.
- 가능하면 TCP 노출을 피하고 `ssh://` 컨텍스트나 SSH 터널로 유닉스 소켓에 접근한다. 인증과 암호화를 SSH에 위임할 수 있다.

## 코어 3. runc는 일회성, shim이 부모

### 3.1 runc는 `execve`로 사라진다

**한 줄 요약:** runc는 컨테이너를 "실행하는 순간"에만 존재하는 일회성 프로세스다.

runc는 네임스페이스를 만들고, cgroup에 등록하고, `pivot_root`로 루트 파일시스템을 교체하고, capabilities와 seccomp 프로파일을 적용한 뒤 컨테이너의 엔트리포인트(예: `nginx -g daemon off;`)를 `execve()`로 실행한다. `execve()`는 프로세스를 새로 만들지 않고 **현재 프로세스의 이미지를 통째로 교체**하므로, 그 순간부터 runc는 사라지고 그 자리를 nginx가 차지한다. 컨테이너가 도는 동안 남는 것은 shim과 워크로드 프로세스(와 그 자식)뿐이다.

### 3.2 shim이 존재하는 이유

**한 줄 요약:** runc가 사라지면 stdout 유지와 종료 회수를 할 부모가 없으므로 shim이 그 일을 맡는다.

자식이 종료되면 부모가 `wait()` 계열 호출로 종료 상태를 회수해야 좀비가 남지 않는다([시그널](../1부-리눅스-OS-구성-요소/03-시그널.md)과 [프로세스](../1부-리눅스-OS-구성-요소/02-프로세스.md)). runc는 이미 없으므로 이 역할을 할 수 없다. `containerd-shim-runc-v2`는 runc를 실행시키는 주체이면서, runc가 `execve`로 자신을 컨테이너 프로세스로 치환한 뒤에도 그 **부모**로 남는다. shim이 하는 일은 다음과 같다.

- 컨테이너의 stdio를 파이프/콘솔로 유지하고, containerd가 로그를 스트리밍하도록 소켓을 열어 둔다.
- 컨테이너가 종료되면 exit code를 회수해 containerd에 이벤트로 전달한다.
- containerd와 ttrpc(gRPC보다 가벼운 RPC)로 통신하고, 자신의 ttrpc 소켓 파일을 남겨 containerd가 재접속할 지점을 만든다.

### 3.3 상위 데몬이 죽어도 컨테이너가 사는 이유

**한 줄 요약:** 상태는 프로세스 메모리가 아니라 디스크와 소켓 파일에 있어서, 데몬이 다시 뜨면 shim에 재접속해 복구한다.

`systemctl restart docker`를 해도 shim은 고아가 되어 init(PID 1) 또는 subreaper로 설정된 containerd에게 재입양될 뿐 계속 실행된다. dockerd가 다시 뜨면 containerd에 재연결해 현재 태스크 목록을 조회하고 자신의 내부 상태(컨테이너 메타데이터, 네트워크 연결 정보)를 맞춘다. containerd가 재시작될 때도 `/run/containerd`, `/var/lib/containerd`의 메타데이터와 shim의 소켓으로 태스크를 running 상태 그대로 복구한다(shim이 이미 죽어 소켓이 응답하지 않으면 unknown/정지로 표시된다).

```bash
systemctl restart containerd
docker ps   # 여전히 web 컨테이너가 Up
ps -o pid,ppid,cmd -p $(pgrep -f "shim-runc-v2.*<container-id>")   # 재시작 전후 PPID 비교
```

`live-restore`는 이 생존을 더 명시적으로 만든다. 켜 두면 dockerd가 정상 종료될 때 컨테이너를 멈추지 않고 두며, 재시작 후 containerd의 태스크 목록으로 상태를 다시 구성한다. 꺼져 있어도 shim 기반 생존은 동작하지만, 계획된 업그레이드에서 중단을 더 확실히 막으려면 켜 두는 것이 일반적으로 권장된다.

dockerd가 재시작되는 몇 초 동안 `docker` 명령은 연결 거부 오류를 내지만, 실행 중인 컨테이너의 애플리케이션 트래픽에는 영향이 없다. 컨테이너 입장에서 dockerd 재시작은 "관리자가 자리를 비운 것"이지 "건물이 무너진 것"이 아니다. 단, 데몬이 없는 동안에는 새 컨테이너 생성·네트워크 변경 같은 관리 작업이 불가능하다는 점은 당연히 감수해야 한다.

## 코어 4. containerd는 서비스+플러그인 구조이고 Docker와 쿠버네티스가 공유

### 4.1 서비스와 "컨테이너 vs 태스크"

**한 줄 요약:** containerd는 유닉스 소켓의 gRPC 서버이고, 정적 정의(컨테이너)와 실행 중인 프로세스(태스크)를 분리한다.

| 서비스 | 역할 |
|---|---|
| Content | 이미지 레이어, config 등 콘텐츠 주소화된 블롭 저장·조회 |
| Images | 이미지 이름(태그)과 매니페스트 다이제스트의 매핑 |
| Snapshots | 레이어를 겹쳐 마운트 가능한 루트 파일시스템을 만드는 스냅샷 관리 |
| Containers | 컨테이너 메타데이터(어떤 이미지, 스냅샷, 런타임) |
| Tasks | 실제 실행 중인 프로세스의 시작·정지·시그널 전달 |
| Events | 컨테이너 생성/시작/종료 등 상태 변화 이벤트 스트림 |
| Diff | 두 스냅샷의 차이로 새 레이어 생성 |

**컨테이너**는 "이 이미지로 이 설정으로 실행할 예정"이라는 정적 메타데이터이고, **태스크**는 그것을 바탕으로 실제로 뜬 프로세스(와 감독하는 shim)다. 덕분에 컨테이너 객체는 둔 채 태스크만 재시작하거나, 태스크가 죽어도 정의는 남기는 운용이 가능하다. dockerd도 `libcontainerd`를 통해 이 API를 호출하는 클라이언트 중 하나일 뿐이다. 이미지 저장 쪽도 Docker Engine 29부터는 신규 설치 기본값이 containerd 이미지 스토어로 바뀌었다(레거시 graphdriver는 deprecated, 기존 설치는 자동 마이그레이션되지 않음. 11장 참고).

### 4.2 플러그인 구조

**한 줄 요약:** 콘텐츠 스토어, 스냅샷터, 런타임 shim 관리자까지 거의 모두 플러그인이고, `ctr plugins list`가 첫 진단 지점이다.

`/etc/containerd/config.toml`의 `[plugins."io.containerd.xxx.v1.yyy"]` 테이블 이름이 곧 플러그인 식별자다. 예를 들어 CRI 플러그인은 `io.containerd.grpc.v1.cri`, overlayfs 스냅샷터는 `io.containerd.snapshotter.v1.overlayfs`, runc용 shim 관리자는 `io.containerd.runc.v2`다. 내장 플러그인과 별도 프로세스로 gRPC 연결되는 프록시 플러그인이 있어서, 스냅샷터나 콘텐츠 스토어를 containerd를 재컴파일하지 않고 교체할 수 있고 런타임도 `runtime_type` 설정으로 runc/gVisor/Kata를 오갈 수 있다(12장).

```bash
sudo ctr plugins list
# TYPE                            ID                  PLATFORMS      STATUS
# io.containerd.snapshotter.v1    overlayfs           linux/amd64    ok
# io.containerd.runtime.v2        task                linux/amd64    ok
# io.containerd.grpc.v1           cri                 linux/amd64    ok
```

필요한 커널 기능이나 바이너리가 없으면 STATUS가 `error`로 뜬다. 설정 파일 오타를 의심하기 전에 그 스냅샷터가 요구하는 커널 파일시스템 지원 여부부터 보는 것이 순서다.

### 4.3 두 경로: Docker 경유와 쿠버네티스 경유

**한 줄 요약:** 두 경로는 같은 containerd와 shim v2로 수렴하고, 차이는 "누가 요청을 보내는가"와 "어떤 containerd 네임스페이스를 쓰는가"뿐이다.

- **Docker 경유:** `docker` CLI → dockerd → libcontainerd → containerd(네임스페이스 `moby`) → shim → runc.
- **쿠버네티스 경유:** kubelet → containerd의 CRI 플러그인(네임스페이스 `k8s.io`) → shim → runc. dockerd는 관여하지 않는다.

containerd에는 CRI 구현이 플러그인으로 내장되어 있어 kubelet이 중개 없이 containerd 소켓에 바로 붙는다. 과거 Docker Engine을 쓰려면 `dockershim`이라는 중개 계층이 필요했고(Kubernetes 1.20에서 지원 종료 예고, 1.24에서 제거), dockerd 자체는 지금도 CRI를 구현하지 않아서 Docker Engine을 쿠버네티스 런타임으로 쓰려면 `cri-dockerd` 어댑터가 필요하다. "Docker Engine을 쓴다"는 것은 containerd 위에 dockerd라는 관리 계층을 하나 더 얹는 선택이고, "containerd를 직접 쓴다"는 것은 그 계층을 걷어내고 kubelet이 containerd와 곧바로 대화하는 선택이다([23장](../3부-쿠버네티스-구성-요소/23-kubelet과-CRI.md)).

### 4.4 containerd 네임스페이스는 커널 네임스페이스가 아니다

**한 줄 요약:** `ctr -n`의 네임스페이스는 메타데이터 이름 구분이고, 실제 격리는 여전히 커널 네임스페이스와 cgroup이 한다.

containerd의 네임스페이스는 한 인스턴스 안에서 여러 사용자(상위 시스템)의 이미지·컨테이너·태스크 메타데이터가 겹치지 않게 나누는 멀티테넌시 장치다. dockerd는 `moby`, kubelet은 `k8s.io`를 쓰므로 같은 containerd를 공유해도 서로의 컨테이너 목록이 보이지 않는다. 쿠버네티스 노드에서 `docker ps`가 비어 있는 이유가 이것이다. 프로세스 격리를 담당하는 커널 네임스페이스는 [9장](09-네임스페이스.md), cgroup은 [10장](10-cgroup.md)에서 다룬다.

```bash
sudo ctr namespaces list                 # moby, k8s.io 등
sudo ctr -n moby containers list         # docker ps 와 같은 컨테이너가 보인다
sudo ctr -n moby tasks list              # 각 태스크의 PID
sudo ctr -n moby content ls              # sha256:... 다이제스트로 나열된 블롭
```

`docker ps`와 `ctr -n moby containers list`의 결과가 일치한다는 것은 dockerd가 자체적으로 컨테이너를 관리하는 것이 아니라 containerd의 `moby` 네임스페이스에 위임하고 있다는 증거다. `ctr`은 공식 문서도 디버깅/실습용으로 소개하는 저수준 도구이고 일상 운영에는 `nerdctl` 같은 도구가 더 적합하다.

## 실무 적용

### 체크리스트

- [ ] `docker run` 한 줄이 CLI → dockerd → containerd → shim → runc → 커널로 가며 runc는 `execve` 후 사라진다는 것을 설명할 수 있다.
- [ ] 문제가 생기면 계층별 책임으로 위치를 좁힌다. 포트 게시·네트워크·볼륨은 dockerd, 이미지/스냅샷/태스크는 containerd, 부모/로그/exit는 shim, 네임스페이스/cgroup 구성은 runc.
- [ ] dockerd/containerd 재시작은 컨테이너를 죽이지 않는다는 것과 그 근거(shim이 부모, 상태는 디스크·소켓)를 안다. 계획된 업그레이드를 위해 `live-restore` 사용을 검토했는가?
- [ ] `docker` 그룹 = 사실상 root라는 점을 알고 권한 부여를 통제한다.
- [ ] Docker API를 TCP로 노출하지 않는다. 필요하면 mTLS(`tlsverify`)를 강제하거나 `ssh://` 컨텍스트를 쓴다.
- [ ] `daemon.json`과 데몬 플래그를 섞어 쓰지 않고, 수정 후 데몬을 재시작해 반영한다.
- [ ] 쿠버네티스 노드에서는 `docker ps`가 아니라 containerd(`ctr -n k8s.io ...`)를 본다. containerd 네임스페이스와 커널 네임스페이스를 혼동하지 않는다.

### 시나리오로 확인하기

1. **상황:** 보안 패치로 dockerd를 업그레이드하려고 `systemctl restart docker`를 해야 한다. 접속자가 붙어 있는 게임 서버 컨테이너가 같이 죽을까 걱정이다.
   **질문:** 컨테이너는 어떻게 되며, 무엇을 더 해 두면 좋은가?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너의 실제 프로세스를 쥔 것은 dockerd가 아니라 `containerd-shim-runc-v2`이므로 컨테이너는 죽지 않고, 애플리케이션 트래픽도 영향이 없다. 재시작 동안 `docker` 명령만 몇 초간 연결 거부 오류를 낸다. dockerd가 돌아오면 containerd에 재연결해 상태를 복구한다. 계획된 업그레이드라면 `daemon.json`의 `live-restore`를 켜 두어 컨테이너 중단을 더 확실히 막는다. → 코어 3

   </details>

2. **상황:** 동료가 원격 관리를 편하게 하겠다며 `daemon.json`의 `hosts`에 `tcp://0.0.0.0:2375`를 추가하자고 한다.
   **질문:** 왜 위험하고 대안은 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   Docker API 호출 권한은 사실상 호스트 root와 동급이다(호스트 루트 파일시스템을 바인드 마운트한 컨테이너로 호스트를 장악할 수 있다). 인증 없는 2375 포트는 실제로 채굴 컨테이너 설치 공격의 표적이었다. 꼭 필요하면 `tlsverify`+`tlscacert`/`tlscert`/`tlskey`로 클라이언트 인증서까지 검증하고, 인터페이스·방화벽으로 범위를 좁힌다. 가능하면 TCP 노출 없이 `ssh://` 컨텍스트나 SSH 터널로 유닉스 소켓에 접근한다. → 코어 2

   </details>

3. **상황:** 쿠버네티스 노드에 SSH로 들어가 `docker ps`를 쳤더니 비어 있는데 파드는 정상 동작 중이다.
   **질문:** 컨테이너는 어디서 확인하나?

   <details markdown="1"><summary>답 확인</summary>

   kubelet은 dockerd를 거치지 않고 containerd의 CRI 플러그인에 직접 붙으며 `k8s.io` containerd 네임스페이스를 쓴다. `docker ps`는 `moby` 네임스페이스의 컨테이너만 보여 주므로 비어 있다. `sudo ctr -n k8s.io containers list`처럼 네임스페이스를 지정해 containerd를 직접 본다. 이 `k8s.io`는 커널 네임스페이스가 아니라 메타데이터 구분이다. → 코어 4

   </details>

4. **상황:** 컨테이너를 하나 띄우고 `ps -ef --forest`를 보니 runc 프로세스는 없고 `containerd-shim-runc-v2` 아래에 내 서버 프로세스가 바로 보인다.
   **질문:** runc는 어디로 갔고, shim은 왜 거기 있나?

   <details markdown="1"><summary>답 확인</summary>

   runc는 네임스페이스·cgroup 구성을 마치고 `execve()`로 자기 이미지를 서버 프로세스로 교체했으므로 더 이상 존재하지 않는다. 부모가 사라졌으니 stdio를 유지하고 종료 시 exit code를 `wait`로 회수해 containerd에 전달할 프로세스가 필요하고, 그것이 shim이다. 컨테이너당 shim이 하나씩 떠 있다. → 코어 3

   </details>

📖 출처: docker-fundamental/01_Docker_아키텍처_개관.md, docker-fundamental/05_containerd_아키텍처_심화.md, docker-fundamental/07_Docker_Engine_API와_CLI.md

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] docker CLI ─(____ 소켓)→ ( ? ) ─(gRPC)→ ( ? ) ─(ttrpc)→ ( ? ) → ( ? ) → 커널
         계층을 쪼갠 이유 2가지: ____ 표준(2015)  /  데몬 재시작해도 ____ 생존

[코어 2] CLI = ____ 클라이언트.  dockerd 내부: API서버→라우터→( ? )→libcontainerd→containerd
         소켓 접근 권한 = 호스트 ____.   TCP 노출 시 필수: ____

[코어 3] runc: namespace/cgroup/pivot_root/caps → ____ → 자신은 사라짐
         shim: 컨테이너의 ____, stdio 유지, ____ 회수.   상태는 ____와 ____ 파일에

[코어 4] containerd 서비스: Content / Images / ____ / Containers / ____ / Events
         컨테이너(정적) vs ____(실행 중).  네임스페이스: Docker=____ , 쿠버네티스=____ (커널 ns 아님)
```

### 2. 인출 질문

1. `docker run`이 커널에 닿기까지 거치는 컴포넌트를 순서대로 말하고, 각각의 통신 방식을 말해 보라.

   <details markdown="1"><summary>답 확인</summary>

   `docker` CLI → (HTTP over 유닉스 소켓 `/var/run/docker.sock`) dockerd → (libcontainerd, gRPC over `/run/containerd/containerd.sock`) containerd → (Runtime v2 shim API, ttrpc) `containerd-shim-runc-v2` → (CLI 인자 + `config.json`) runc → 커널의 namespaces, cgroups, seccomp, overlayfs 등. 계층마다 실제 프로세스 경계가 있다. → 코어 1

   </details>

2. 계층을 여러 개로 쪼갠 이유 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   (1) 표준화: Docker 의존 없이 컨테이너를 실행할 공통 규격(OCI Runtime/Image Spec)이 필요했고 runc는 그 참조 구현이다. (2) 재시작 문제: dockerd가 컨테이너 생명주기를 붙들면 데몬 패치 때마다 컨테이너가 죽으므로, 실행 담당을 containerd로, 부모 역할을 shim으로 분리했다. containerd가 CNCF로 가며 쿠버네티스(CRI)도 이를 직접 쓰게 됐다. → 코어 1

   </details>

3. `docker` CLI가 REST 클라이언트임을 직접 확인하는 방법과, 그 사실이 설명해 주는 현상 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   `curl --unix-socket /var/run/docker.sock http://localhost/containers/json`처럼 CLI 없이 같은 요청을 재현한다. 설명되는 것: 사용자에게 `docker` 그룹(소켓 파일 권한)이 필요한 이유, `DOCKER_HOST`/`docker context`로 원격 호스트를 다룰 수 있는 이유, Portainer 같은 서드파티 도구가 CLI 없이 동작하는 이유. → 코어 2

   </details>

4. dockerd의 daemon 패키지와 containerd의 역할 차이를 "포트 게시"를 예로 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   포트 게시, 네트워크 연결, 볼륨 마운트 같은 Docker 고유의 상위 개념은 dockerd의 daemon 패키지가 처리하고 containerd가 이해하는 저수준 요청(이미지, 컨테이너, 태스크, 스냅샷)으로 번역한다. 포트 매핑용 iptables 규칙 삽입은 dockerd의 몫이며 containerd와 runc는 그런 것을 전혀 모른다. → 코어 2

   </details>

5. runc가 컨테이너가 도는 동안 프로세스 목록에 보이지 않는 이유와, 그 때문에 shim이 필요한 이유는?

   <details markdown="1"><summary>답 확인</summary>

   runc는 `execve()`로 현재 프로세스 이미지를 컨테이너의 엔트리포인트로 교체하므로 그 순간 runc가 사라진다. 그러면 stdout/stderr를 붙잡고 종료 시 exit code를 `wait`로 회수해 줄 부모가 없다. shim이 컨테이너 프로세스의 부모로 남아 stdio를 유지하고 exit code를 회수해 containerd에 이벤트로 전달한다. → 코어 3

   </details>

6. dockerd나 containerd를 재시작해도 컨테이너가 살아남는 메커니즘과 `live-restore`의 역할은?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너 프로세스의 부모가 shim이고 shim은 상위 데몬과 생명주기가 분리되어 있다(고아가 되면 init/subreaper에 재입양). 상태는 프로세스 메모리가 아니라 `/run/containerd`, `/var/lib/containerd`의 메타데이터와 shim 소켓에 있어, 데몬이 다시 뜨면 재접속해 복구한다. `live-restore`는 dockerd 정상 종료 시 컨테이너를 멈추지 않도록 명시해 계획된 업그레이드에서 중단을 확실히 막는다. → 코어 3

   </details>

7. containerd에서 "컨테이너"와 "태스크"의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너는 이미지·설정·스냅샷·런타임을 가리키는 정적 메타데이터이고, 태스크는 그에 따라 실제로 뜬 프로세스(와 감독하는 shim)다. 덕분에 컨테이너 정의를 유지한 채 태스크만 재시작하거나 태스크가 죽어도 정의를 남길 수 있다. → 코어 4

   </details>

8. 쿠버네티스 노드의 `docker ps`가 비어 있는 이유와 containerd 네임스페이스의 정체는?

   <details markdown="1"><summary>답 확인</summary>

   kubelet은 dockerd 없이 containerd CRI 플러그인에 붙어 `k8s.io` 네임스페이스를 쓰고, dockerd는 `moby`를 쓴다. containerd 네임스페이스는 멀티테넌시용 메타데이터 구분이지 커널 네임스페이스(pid, net, mnt 등)가 아니다. 확인은 `ctr -n k8s.io containers list`처럼 한다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** 어드민 클라이언트 → 서버 소켓 = `docker` CLI → dockerd ⚠️ 이 소켓은 어드민 포트가 아니라 호스트 root 권한 그 자체이므로, 접근 권한을 서버 계정 관리 수준으로 다뤄야 한다.
- **C++ 유추:** `fork`+`waitpid` 하는 부모 프로세스 = shim ⚠️ 실행 직전에 `execve`로 자기를 자식으로 치환하는 주체(runc)가 따로 있고, 그래서 부모 역할이 별도 프로세스로 분리된다.
- **비유:** 5계층 = 릴레이 계주. 바통(요청)을 주고받을 때마다 주자(프로세스)가 바뀌고, 마지막 주자(runc)는 바통이 곧 자기 자신(워크로드)이 되어 트랙에서 사라진다. ⚠️ 비유가 깨지는 지점: 계주와 달리 앞 주자들(dockerd, containerd)이 쓰러져도 마지막 결과(컨테이너)는 shim 덕분에 계속 달린다.
- **비유:** 재시작해도 안 죽는 컨테이너 = 건물 관리자가 자리를 비운 상황이지 건물이 무너진 게 아님. ⚠️ 비유가 깨지는 지점: 관리자가 없는 동안 새 입주(컨테이너 생성)나 시설 변경(네트워크 수정)은 못 한다.
- **묶음(3의 법칙):** daemon.json 점검 3가지(hosts·live-restore·default-address-pools) / TCP 노출 시 3원칙(mTLS·범위 제한·ssh 우선) / shim의 일 3가지(stdio·소켓·exit 회수).
- **대칭·순서:** 순서 CLI→dockerd→containerd→shim→runc→커널. 대칭: Docker 경로(`moby`, dockerd 경유) ↔ 쿠버네티스 경로(`k8s.io`, CRI 직결). 컨테이너(정적) ↔ 태스크(동적).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`docker run` 한 줄이 내 서버 프로세스가 되기까지"를 처음 듣는 사람에게 다섯 계층의 이름과 역할로 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "dockerd를 재시작해도 게임 서버 컨테이너가 안 죽는 이유"를 shim과 `execve`로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "원격 관리가 편하니 Docker API를 TCP 2375로 열자" vs B "Docker 소켓 접근은 곧 호스트 root이니 열지 말자" — 양쪽을 번갈아 변호해 보세요. (mTLS, `ssh://` 컨텍스트, 공격 사례를 근거로)
- **AI 역할 반전:** "내가 runc와 shim의 역할 차이를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
