---
title: "12장. OCI 표준과 런타임"
parent: "2부. 컨테이너 커널 기능과 Docker"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 12
---

# 12장. OCI 표준과 런타임

> **🎮 게임 서버 개발자에게** — 클라이언트와 서버가 서로 다른 언어·회사로 만들어져도 통신이 되는 것은 **패킷 규격(프로토콜)**을 합의했기 때문이다. OCI(Open Container Initiative)는 컨테이너 세계의 패킷 규격이다. "이 JSON(config.json)과 이 디렉터리(rootfs)를 주면 컨테이너를 만들어라"는 실행 규격과 "이미지는 이런 구조로 만들고 이런 HTTP API로 주고받는다"는 이미지 규격을 정해 두었기 때문에, 구현체(runc, crun, gVisor, Kata)를 갈아 끼워도 위쪽(containerd, 쿠버네티스)은 그대로다. 9장(네임스페이스)과 10장(cgroup)이 "커널이 하는 일"이었다면, 이 장은 "그 둘을 어떤 순서와 설정으로 조합할지를 정한 표준과, 그 표준을 실행하는 프로그램들"이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - `docker run`을 치면 마지막에 `runc`가 뜬다는 이야기를 들었는데, runc가 정확히 무엇을 받아 무엇을 하는지 모르겠다.
> - 멀티 아키텍처(amd64/arm64) 이미지를 레지스트리에서 받을 때 어떤 구조로 골라지는지 알아야 한다.
> - 신뢰할 수 없는 사용자 코드를 돌리는 서비스를 설계하는데 runc만으로 충분한지, gVisor나 Kata가 필요한지 판단해야 한다.

## 코어 — 이것만은 100%

> **한 문장:** OCI는 컨테이너 실행(Runtime Spec: 번들 = config.json + rootfs, create/start/kill/delete), 이미지(Image Spec: 매니페스트·config·레이어, 인덱스), 배포(Distribution Spec: `/v2/` HTTP API)를 표준화했고, runc는 실행 표준의 참조 구현일 뿐이어서 격리 모델이 다른 crun, gVisor, Kata, youki를 `runtime_type`/`RuntimeClass`로 갈아 끼울 수 있다.

1. **OCI의 세 스펙** — Runtime / Image / Distribution. 구현을 강제하지 않고 인터페이스와 포맷만 규정한다. 2015년 Docker가 libcontainer를 runc로 기부하며 결성됐다.
2. **번들과 config.json, 그리고 라이프사이클** — runc는 이미지를 모르고 번들(`config.json` + `rootfs/`)만 안다. `linux.namespaces`는 9장, `linux.resources`는 10장의 설정을 JSON으로 옮긴 것이다. 상태는 creating → created → running → stopped, `create`와 `start`가 분리되어 있다.
3. **이미지 스펙과 배포 스펙** — 매니페스트(config 참조 + 레이어 다이제스트 목록), 이미지 config, 레이어(tar). 멀티 아키텍처는 이미지 인덱스가 매니페스트들을 가리킨다. 푸시/풀은 `/v2/...` HTTP API다.
4. **런타임 생태계** — runc(참조 구현, 커널 공유), crun(C, 저오버헤드), gVisor(유저스페이스 커널 Sentry), Kata(경량 VM), youki(Rust). 같은 config.json을 받는 교체 가능한 부품이다.
5. **선택과 설정** — 신뢰 경계와 성능 요구로 고른다. containerd `config.toml`의 `runtime_type`과 쿠버네티스 `RuntimeClass`의 `handler`, dockerd `daemon.json`의 `runtimes`/`--runtime`.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 클라이언트·서버가 지키는 패킷 규격(프로토콜 명세) | OCI 스펙 | 구현이 달라도 규격을 지키면 상호운용된다 | 규격이 **세 개**(실행/이미지/배포)로 나뉜다. 실행 규격은 네트워크 패킷이 아니라 "디렉터리 + JSON 파일 + 명령 4개"다 |
| 서버 설정 파일(JSON/INI)을 읽어 소켓·스레드 풀을 구성 | `config.json`과 runc | 설정 파일을 읽어 시스템 자원을 만든다 | runc는 설정 파일에 적힌 **네임스페이스·cgroup 설정을 `clone()`/`unshare()`/`setns()` 같은 커널 API 호출로 번역**하는 얇은 계층이다 |
| `socket()`/`bind()`/`listen()`으로 준비하고 `accept` 루프는 나중에 시작 | `create`와 `start` 분리 | 준비 단계와 실제 시작을 나눈다 | created 상태에서는 네임스페이스·마운트·cgroup 배치가 끝나 있지만 사용자 프로그램(`process.args`)은 아직 안 떴다. 이 틈에 상위 계층이 네트워크 인터페이스를 넣는 등 후처리를 한다 |
| 인터페이스(추상 클래스)와 구현 클래스 교체 | OCI 스펙과 runc/crun/gVisor/Kata | 호출하는 쪽 코드를 바꾸지 않고 구현을 교체한다 | 구현마다 **격리 방식 자체**가 다르다(커널 공유 / 유저스페이스 커널 / VM). 성능과 보안 경계가 달라지는 교체다 |
| 버전별 바이너리 + 플랫폼별 빌드(x64/ARM) | 이미지 인덱스(멀티 아키텍처) | 하나의 이름으로 플랫폼별 산출물을 고른다 | 인덱스가 매니페스트 목록을 가리키고, 클라이언트가 자기 아키텍처의 매니페스트를 골라 그 레이어만 받는다 |
| 서비스 간 HTTP API 규약 | Distribution Spec `/v2/` | 클라이언트와 레지스트리가 같은 API를 쓴다 | `docker pull`, `ctr images pull` 등 어떤 클라이언트도 내부적으로 같은 API를 호출한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. runc는 이미지(레이어, 매니페스트)를 이해할까? 그렇다면 누가 이미지를 풀어 runc에 넘길까?
> 2. 컨테이너 생성과 시작이 `create`/`start` 두 단계로 나뉜 이유는 무엇일까?
> 3. `docker pull`할 때 레지스트리와 클라이언트는 어떤 규약으로 대화할까?
> 4. 서로 신뢰하지 않는 고객의 코드를 한 호스트에서 돌려야 한다면 runc만으로 충분할까?
>
> **처리법:** 🛠 실습 `runc spec`, `sudo runc create --bundle /tmp/mybundle demo1`, `sudo runc state demo1`, `sudo crun run --bundle ...` → 바로 실행 · 🗺 관계도 dockerd → containerd → runc(번들 = rootfs + config.json) → 커널(namespace·cgroup), 이미지 인덱스 → 매니페스트 → config + 레이어 · 📦 카드로 config.json 주요 필드 표, 라이프사이클 4상태, 미디어 타입 표, 런타임 5종 비교

### 이 장에서 배우는 것

- OCI가 왜 만들어졌고 어떤 세 스펙을 관리하는지
- 번들(config.json + rootfs)과 create/start/kill/delete/state 라이프사이클
- Image Spec의 매니페스트/config/레이어/인덱스, 미디어 타입, Docker v2 포맷과의 관계
- Distribution Spec의 `/v2/` 엔드포인트
- runc, crun, gVisor(runsc), Kata Containers, youki의 차이와 선택 기준
- containerd, 쿠버네티스 RuntimeClass, dockerd에서 런타임을 지정하는 방법

---

## 코어 1. OCI의 세 스펙

### 1.1 왜 만들어졌나

**한 줄 요약:** 단일 기업의 구현에 종속된 사실상 표준을 벤더 중립 표준으로 바꾸려는 2015년의 합의다.

- Docker는 2013년 공개 이후 컨테이너의 사실상(de facto) 표준이 됐다. 이미지 포맷과 실행 방식이 Docker 내부 구현에 종속되면 다른 벤더의 호환 도구나, 여러 런타임을 고르려는 쿠버네티스 같은 오케스트레이터에 불안 요소였다.
- 2014년 CoreOS가 데몬 중심 구조에 문제를 제기하며 `rkt`와 이를 뒷받침하는 App Container Specification(appc, 이미지 포맷 ACI)을 내놓아 진영이 갈라질 조짐이 있었다.
- 이를 막기 위해 2015년 6월 리눅스 파운데이션 산하에 **OCI**가 결성됐다. Docker와 CoreOS가 창립 멤버였고, Docker는 자사 실행 엔진의 핵심이던 `libcontainer`를 분리해 독립 실행 파일로 만들어 기부했다. 이것이 오늘날의 **runc**다. appc 진영도 이후 OCI 작업에 합류했고 appc/ACI는 2016년 이후 사실상 개발이 종료됐다.

### 1.2 세 개의 스펙

**한 줄 요약:** 실행 / 이미지 / 배포를 각각 표준화하고, 구현은 강제하지 않는다.

| 스펙 | 정의하는 것 |
|---|---|
| **Runtime Specification** | 컨테이너를 생성·실행·종료하는 방법 |
| **Image Specification** | 이미지의 구조(레이어, 설정, 매니페스트) |
| **Distribution Specification** | 이미지를 레지스트리에 올리고 받는 API(push/pull 프로토콜) |

세 스펙 모두 "구현을 하나로 강제하지 않고 서로 다른 구현이 상호운용되도록 인터페이스와 포맷만 규정한다"는 철학을 공유한다. 그래서 runc 대신 crun, Docker Hub 대신 사설 레지스트리, containerd 대신 CRI-O를 써도 이미지와 실행 방식의 근본 구조가 같다.

## 코어 2. Runtime Spec: 번들, config.json, 라이프사이클

### 2.1 번들(bundle)

**한 줄 요약:** 번들은 `config.json` + `rootfs/`이고, runc는 이미지가 아니라 번들만 안다.

번들은 실행의 기본 입력 단위인 디스크 상의 디렉터리로, 최소한 다음 둘을 포함한다.

- `config.json`: 컨테이너 설정을 담은 JSON 파일
- 루트 파일시스템(보통 `rootfs/`): 컨테이너 안에서 `/`로 보일 파일시스템 트리

runc를 포함한 대부분의 저수준 런타임은 **이미지를 이해하지 못한다.** containerd가 이미지를 받아 레이어를 풀고 rootfs로 배치하고 설정을 config.json으로 직렬화한 뒤에야 runc를 호출한다. "이미지 → 번들" 변환은 상위 계층(containerd, 그 위의 dockerd)의 책임이고, 이 역할 분리 덕분에 이미지 포맷이 바뀌어도 runc는 손댈 필요가 없다. 상위 계층 구조는 [13장 Docker 아키텍처](13-Docker-아키텍처.md), rootfs의 실체인 레이어 합성은 [11장](11-이미지-레이어-overlayfs.md)이다.

### 2.2 config.json의 주요 구조

**한 줄 요약:** `linux.namespaces`와 `linux.resources`가 9장과 10장 설정을 JSON으로 옮긴 자리다.

| 필드 | 설명 |
|---|---|
| `ociVersion` | 이 config.json이 따르는 Runtime Spec 버전 |
| `root.path` | rootfs 경로, `root.readonly`로 읽기 전용 지정 |
| `mounts` | 컨테이너 내부에 추가로 마운트할 항목(`/proc`, `/dev`, `/sys` 등) |
| `process` | 실행할 프로그램(`args`), 환경 변수(`env`), 작업 디렉터리(`cwd`), 실행 사용자(`user`), capabilities 등 |
| `hostname` | UTS 네임스페이스에 설정될 호스트명 |
| `linux.namespaces` | 새로 만들거나 공유할 네임스페이스 목록과 종류(`pid`, `network`, `mount`, `uts`, `ipc`, `user`, `cgroup` 등) |
| `linux.resources` | cgroup으로 제어할 한도(`memory`, `cpu`, `pids`, `blockIO` 등) |
| `linux.cgroupsPath` | 컨테이너가 속할 cgroup 경로 |
| `hooks` | 라이프사이클 시점(`prestart`, `createRuntime`, `poststart`, `poststop` 등)에 실행할 외부 프로그램 |

- `linux.namespaces`는 [9장](09-네임스페이스.md)의 네임스페이스 종류를 나열하는 자리다. config.json이 "무엇을 새로 만들지"를 선언하고, runc는 이를 읽어 `clone()`/`unshare()`/`setns()` 계열 시스템 콜을 실제로 호출하는 **실행자**다.
- `linux.resources`는 [10장](10-cgroup.md)에서 다룬 cgroup 컨트롤러 설정값을 JSON으로 옮긴 것이다.
- 결국 runc의 본질은 **"config.json에 적힌 네임스페이스·cgroup 설정을 커널 API 호출로 번역하는 얇은 계층"**이다. `process`의 capabilities는 [9장](09-네임스페이스.md) 코어 5에서 말한 권한 축이 명세되는 자리다.

### 2.3 라이프사이클

**한 줄 요약:** creating → created → running → stopped. `create`와 `start`를 분리한 것이 핵심 설계다.

- **creating**: 런타임이 환경 구성 중
- **created**: 환경 구성은 끝났지만 사용자 프로그램(`process.args`)은 아직 실행 전
- **running**: 사용자 프로그램 실행 중
- **stopped**: 프로세스 종료

```bash
# 번들로 컨테이너 생성: 네임스페이스/마운트/cgroup까지 준비되지만 process.args는 아직 안 실행됨
runc create --bundle /path/to/bundle mycontainer

# created 상태에서 실제 사용자 프로그램 실행
runc start mycontainer

# 시그널 전송
runc kill mycontainer SIGTERM

# stopped 컨테이너가 점유하던 자원(cgroup, 네임스페이스 등) 정리
runc delete mycontainer

# 현재 상태를 JSON으로 조회
runc state mycontainer
```

`create`와 `start`를 분리했기 때문에, create 단계에서 격리가 전부 끝난 시점에 상위 계층(containerd의 shim)이 관찰용 프로세스를 붙이거나 네트워크 인터페이스를 컨테이너 네임스페이스 안으로 옮기는 후처리를 **안전하게** 끼워 넣을 수 있다. "컨테이너는 만들어졌지만 애플리케이션은 아직 세상과 통신할 준비가 안 된" 중간 상태를 표준적으로 활용하는 것이다. `hooks`의 `createRuntime`, `createContainer`, `prestart`, `poststart` 훅이 이 틈에서 실행된다.

runc는 이 스펙의 **참조 구현(reference implementation)**이다. 유일하게 허용된 구현이 아니라 스펙 준수 여부를 판단하는 기준점이라는 뜻이다. 뒤의 crun, gVisor, Kata, youki는 모두 이 config.json 포맷과 create/start/kill/delete 인터페이스를 구현하면서 내부 격리 방식은 전혀 다르다.

## 코어 3. Image Spec과 Distribution Spec

### 3.1 이미지의 구조

**한 줄 요약:** 매니페스트(참조) → 이미지 config + 레이어 tar, 여러 아키텍처는 인덱스가 묶는다.

Runtime Spec이 "준비된 rootfs를 어떻게 실행하는가"라면 Image Spec은 "그 rootfs를 어떻게 내려받고 조립하는가"다.

- **이미지 매니페스트(Image Manifest)**: 이미지 config에 대한 참조와 레이어들의 다이제스트 목록을 담은 JSON 문서
- **이미지 config**: 실행 시 기본값(`Cmd`, `Entrypoint`, `Env`, `WorkingDir`, 노출 포트 등)과, 레이어가 어떤 순서로 쌓였는지에 대한 `rootfs.diff_ids`
- **레이어(layer, diff)**: 파일시스템 변경분을 담은 tar 아카이브. 단독으로는 완전한 파일시스템이 아니며 순서대로 겹쳐야 rootfs가 된다
- **이미지 인덱스(Image Index)**: 매니페스트들의 목록을 가리키는 상위 문서. 흔히 말하는 "멀티 아키텍처 이미지"/"매니페스트 리스트"다. `docker buildx build --platform linux/amd64,linux/arm64`로 만든 이미지를 받을 때, 클라이언트는 인덱스를 읽고 자기 아키텍처의 매니페스트를 골라 그 레이어만 받는다

각 객체는 미디어 타입 문자열로 구분된다.

| 객체 | 미디어 타입 |
|---|---|
| 이미지 매니페스트 | `application/vnd.oci.image.manifest.v1+json` |
| 이미지 인덱스 | `application/vnd.oci.image.index.v1+json` |
| 이미지 config | `application/vnd.oci.image.config.v1+json` |
| 레이어(비압축 tar) | `application/vnd.oci.image.layer.v1.tar` |
| 레이어(gzip 압축) | `application/vnd.oci.image.layer.v1.tar+gzip` |
| 레이어(zstd 압축) | `application/vnd.oci.image.layer.v1.tar+zstd` |

레이어와 config를 다이제스트로 식별해 공유하는 저장 방식은 [11장](11-이미지-레이어-overlayfs.md)의 콘텐츠 주소화다.

### 3.2 Docker 이미지 포맷과의 관계

**한 줄 요약:** OCI 이미지는 Docker v2 포맷을 기반으로 설계돼 구조가 거의 같고, 차이는 주로 미디어 타입이다.

- Docker의 포맷은 "Docker Image Manifest V2, Schema 2"(`application/vnd.docker.distribution.manifest.v2+json`)다. OCI Image Spec은 이를 기반으로 설계돼 config 참조 하나 + 레이어 목록이라는 뼈대와 다이제스트 식별 원칙이 같다.
- 차이는 미디어 타입 문자열과 일부 확장 필드(OCI의 `annotations` 등)다. BuildKit은 기본적으로 OCI 포맷으로 만들고, Docker Hub를 포함한 주요 레지스트리는 두 미디어 타입을 모두 받아들인다.
- 아주 오래된 레지스트리/도구 체인 일부는 OCI 미디어 타입을 인식하지 못한다. 상호운용 문제가 생기면 **미디어 타입 차이를 가장 먼저** 의심한다.

### 3.3 Distribution Spec

**한 줄 요약:** `/v2/` 아래의 HTTP API로 매니페스트와 블롭을 주고받는다.

```text
GET  /v2/                              # API 버전 확인, 인증 필요 여부 프로브
GET  /v2/<name>/manifests/<reference>  # 매니페스트 조회 (reference는 태그 또는 다이제스트)
GET  /v2/<name>/blobs/<digest>         # 레이어·config 등 블롭 다운로드
POST /v2/<name>/blobs/uploads/         # 블롭 업로드 시작 (push)
PUT  /v2/<name>/manifests/<reference>  # 매니페스트 업로드 (push 마무리)
```

`docker pull`, `docker push`, `ctr images pull` 등 어떤 클라이언트도 내부적으로 이 API를 호출한다. 표준화돼 있어서 Docker Hub, GitHub Container Registry, 사설 Harbor, 클라우드 관리형 레지스트리를 같은 클라이언트로 다룰 수 있다.

## 코어 4. runc와 대체 런타임 생태계

### 4.1 다섯 가지 런타임

**한 줄 요약:** 모두 config.json을 입력받고 create/start/kill/delete를 구현하므로 containerd 입장에서는 교체 가능한 부품이다.

| 런타임 | 구현/격리 방식 | 특징과 주의점 |
|---|---|---|
| **runc** | Go, `libcontainer`로 네임스페이스·cgroup·capability·seccomp를 직접 수행 | Runtime Spec의 참조 구현. 표준 리눅스 커널 기능만 사용. **호스트와 같은 커널을 공유**하므로 커널 취약점이 있으면 격리도 영향받는다 |
| **crun** | Red Hat 주도, C로 재작성 | GC·멀티스레드 런타임 초기화 비용이 없어 바이너리·메모리가 작고 cold start가 짧다. 이점은 "자주, 짧게 뜨고 사라지는" 워크로드에서 두드러지고 steady state 차이는 미미. OpenShift의 기본 런타임 |
| **gVisor (runsc)** | 유저스페이스 커널 **Sentry**(Go)가 시스템 콜을 가로채 처리. 파일시스템은 별도 프로세스 **Gofer**에 9P 유사 프로토콜로 위임 | 호스트 커널에 열리는 시스템 콜 표면적이 seccomp로 걸러진 극히 일부로 줄어든다. 대가: 시스템 콜이 잦으면 성능 저하, `io_uring` 등 최신 커널 기능에 의존하는 앱이 기동에서 실패할 수 있어 **사전 검증 필수** |
| **Kata Containers** | 컨테이너(또는 Pod)마다 **별도 커널을 가진 경량 VM**. 하이퍼바이저는 Cloud Hypervisor(기본), Firecracker, QEMU 중 선택 | 게스트 커널이 호스트 커널과 분리돼 커널 취약점이 다른 테넌트로 전이되기 어렵다. VM 부팅 지연과 메모리 오버헤드는 runc/crun보다 크다. shim v2를 활용해 Pod당 VM을 하나만 띄운다 |
| **youki** | Rust | 메모리 안전성으로 C/Go 구현의 특정 버그 클래스를 줄이는 것이 목표. cgroup v1/v2, rootless, seccomp를 지향. 성숙도가 올라왔지만 생태계 검증 기간이 짧아 도입 전 자체 검증을 권장 |

gVisor의 시스템 콜 트랩은 플랫폼 계층(ptrace 기반의 systrap, 또는 KVM 기반)이 가로채 Sentry로 넘기는 방식이다. 즉 "유저 → 커널" 경계([1장](../1부-리눅스-OS-구성-요소/01-커널-시스템콜-스케줄러.md))를 소프트웨어 커널 한 겹이 가로막는 구조다.

### 4.2 언제 runc가 아닌 런타임을 쓰는가

**한 줄 요약:** "보안이면 무조건 gVisor/Kata"가 아니라 신뢰 경계와 성능 요구를 함께 본다.

- **신뢰할 수 있는 내부 워크로드, 컨테이너가 많고 자주 뜨고 내려감(CI 러너, 서버리스 스케일-투-제로)**: runc의 표준 격리로 충분하고, crun으로 바꾸면 시작 지연을 더 줄일 수 있다.
- **멀티테넌시 SaaS에서 서로 신뢰하지 않는 고객 코드 실행**: 커널 공유 자체가 위험이므로 격리 경계를 커널 인터페이스 앞단(gVisor)이나 커널 아래(Kata)로 밀어내는 런타임을 검토한다.
- **신뢰할 수 없는 임의 코드 실행(사용자 업로드 스크립트를 그대로 실행하는 온라인 코드 실행기)**: 전형적으로 gVisor 또는 Kata가 요구된다.
- **레거시 앱이 `io_uring` 등 최신 커널 기능에 의존**: gVisor 도입 전에 Sentry 지원 여부를 확인한다.
- **하드웨어 수준 격리가 컴플라이언스 요구**: Kata의 VM 경계가 감사 관점에서 설명하기 쉬운 경우가 많다.

## 코어 5. 런타임 선택과 설정

### 5.1 containerd와 쿠버네티스 RuntimeClass

**한 줄 요약:** containerd `config.toml`에 런타임을 등록하고, `RuntimeClass.handler`가 그 이름과 이어진다.

같은 호스트, 같은 containerd 위에서 워크로드별로 다른 런타임을 쓰는 것은 드문 일이 아니다. `/etc/containerd/config.toml`에 등록한다.

```toml
[plugins."io.containerd.grpc.v1.cri".containerd]
  default_runtime_name = "runc"

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
  runtime_type = "io.containerd.runc.v2"

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc]
  runtime_type = "io.containerd.runsc.v1"

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.kata]
  runtime_type = "io.containerd.kata.v2"
```

각 런타임 이름(`runc`, `runsc`, `kata`)은 쿠버네티스 `RuntimeClass`의 `handler` 필드와 이어진다.

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
---
apiVersion: v1
kind: Pod
metadata:
  name: untrusted-workload
spec:
  runtimeClassName: gvisor
  containers:
  - name: app
    image: myregistry/app:latest
```

### 5.2 dockerd에서의 지정

**한 줄 요약:** `daemon.json`의 `runtimes` 또는 `--add-runtime`으로 등록하고 `docker run --runtime=`으로 고른다.

```json
{
  "default-runtime": "runc",
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc"
    }
  }
}
```

```bash
docker run --runtime=runsc -it --rm alpine sh
```

두 경로 모두 결국 containerd 설정의 `runtime_type`이 어떤 **shim**(`io.containerd.runc.v2`, `io.containerd.runsc.v1`, `io.containerd.kata.v2` 등)으로 컨테이너를 실행할지 정한다는 점이 같다. containerd와 shim의 구조는 [13장 Docker 아키텍처](13-Docker-아키텍처.md), 쿠버네티스 쪽 CRI 연결은 [23장 kubelet과 CRI](../3부-쿠버네티스-구성-요소/23-kubelet과-CRI.md)에서 이어진다.

### 5.3 직접 해 보기

**한 줄 요약:** create → created, start → running 전이를 눈으로 확인하고, 같은 번들을 crun으로도 돌려 본다.

```bash
runc --version                      # 예: runc version 1.5.1, spec: 1.3.0
mkdir -p /tmp/mybundle/rootfs
cd /tmp/mybundle
docker export "$(docker create alpine)" | tar -C rootfs -xf -
runc spec                           # 기본 config.json 생성
sudo runc create --bundle /tmp/mybundle demo1
sudo runc state demo1               # "status": "created"
sudo runc start demo1
sudo runc state demo1               # "status": "running" (곧바로 stopped일 수도 있음)
sudo runc kill demo1 SIGKILL 2>/dev/null
sudo runc delete demo1
sudo crun run --bundle /tmp/mybundle demo2   # 같은 config.json을 crun으로
```

> **[보충]** `runc spec`이 만드는 기본 config.json은 `process.terminal`이 `true`라서, 터미널 없이 `runc create`를 하면 `--console-socket` 관련 오류가 날 수 있다. 그럴 때는 config.json에서 `"terminal": false`로 바꾸고 실습한다.

`runc spec`이 만든 기본 config.json에서 `process.args`가 `["sh"]`인지, `linux.namespaces`에 pid/network/ipc/uts/mount가 나열됐는지 확인한다. 이 모든 조각을 손으로 조립해 보는 과정은 [17장](17-컨테이너를-손으로-만들기.md)에서 이어진다.

## 실무 적용

### 체크리스트

- [ ] runc는 이미지가 아니라 번들(`config.json` + `rootfs/`)만 이해하고, 이미지를 번들로 바꾸는 것은 containerd(와 dockerd)의 책임임을 설명할 수 있다.
- [ ] config.json의 `linux.namespaces`가 9장, `linux.resources`가 10장의 설정에 대응함을 안다.
- [ ] `create`(격리 구성 완료, 프로그램 미실행)와 `start`(프로그램 실행)가 분리된 이유를 설명할 수 있다.
- [ ] 이미지 매니페스트/config/레이어/인덱스 4객체와 멀티 아키텍처 이미지의 선택 흐름을 안다.
- [ ] 레지스트리 연동 문제가 생기면 OCI vs Docker v2 미디어 타입 차이를 먼저 의심한다.
- [ ] 워크로드의 신뢰 수준에 따라 runc / crun / gVisor / Kata 중 어떤 격리 모델이 필요한지 판단할 수 있다.
- [ ] gVisor 도입 전에 대상 워크로드(특히 `io_uring` 사용)가 실제로 정상 동작하는지 사전 검증한다.
- [ ] `runc --version`, `docker info`, containerd `config.toml`로 현재 사용 중인 런타임을 확인할 수 있다.

### 시나리오로 확인하기

1. **상황:** 팀원이 "runc에 이미지 이름을 넘기면 컨테이너가 뜨는 것 아니냐"고 묻는다.
   **질문:** 어떻게 바로잡나?

   <details markdown="1"><summary>답 확인</summary>

   runc는 이미지를 이해하지 못한다. containerd가 이미지를 받아 레이어를 풀어 rootfs로 배치하고 설정을 config.json으로 직렬화한 번들(config.json + rootfs/)을 만든 뒤에야 runc를 호출한다. 이미지 → 번들 변환은 상위 계층의 책임이고, 그 덕분에 이미지 포맷이 바뀌어도 runc는 손댈 필요가 없다. → 코어 2

   </details>

2. **상황:** 사용자가 업로드한 스크립트를 그대로 실행해 주는 온라인 코드 실행 서비스를 만든다. 기본 runc 컨테이너로 충분한지 묻는다.
   **질문:** 어떻게 판단하나?

   <details markdown="1"><summary>답 확인</summary>

   runc는 호스트와 같은 커널을 공유하므로 커널 취약점이 있으면 컨테이너 격리도 영향받는다. 신뢰할 수 없는 임의 코드는 전형적으로 gVisor(유저스페이스 커널로 시스템 콜 표면적 축소) 또는 Kata(경량 VM으로 커널 분리)가 요구되는 시나리오다. gVisor를 택하면 시스템 콜 잦은 워크로드의 성능 저하와 `io_uring` 등 최신 커널 기능 의존 앱의 기동 실패 가능성을 사전 검증한다. 쿠버네티스라면 `RuntimeClass`로 해당 Pod에만 적용한다. → 코어 4, 코어 5

   </details>

3. **상황:** `docker buildx build --platform linux/amd64,linux/arm64`로 올린 이미지를 ARM 서버와 x86 서버가 같은 이름으로 pull한다. 동료가 "두 서버가 같은 파일을 받는 것이냐"고 묻는다.
   **질문:** 어떻게 설명하나?

   <details markdown="1"><summary>답 확인</summary>

   그 이름은 이미지 인덱스(매니페스트 리스트)를 가리킨다. 클라이언트는 인덱스를 읽고 자기 아키텍처에 맞는 매니페스트를 골라, 그 매니페스트가 가리키는 레이어만 `/v2/<name>/blobs/<digest>`로 내려받는다. 서버마다 받는 레이어가 다르다. → 코어 3

   </details>

4. **상황:** 컨테이너를 만들면서 네트워크 인터페이스를 컨테이너의 네임스페이스에 넣는 후처리를 프로그램 시작 전에 끝내야 한다.
   **질문:** OCI 라이프사이클의 어떤 특성을 쓰나?

   <details markdown="1"><summary>답 확인</summary>

   `create`와 `start`의 분리다. create가 끝난 created 상태에서는 네임스페이스·마운트·cgroup 배치가 모두 끝났지만 사용자 프로그램은 아직 실행되지 않았다. 이 시점에 상위 계층(shim)이 후처리를 끼워 넣거나 `hooks`(`createRuntime`, `createContainer`, `prestart`)를 실행한 뒤 `start`로 프로그램을 띄운다. → 코어 2

   </details>

---

📖 출처: `D:/varioproger.github.io-reference/doc/docker-fundamental/04_컨테이너_런타임_표준.md`

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] OCI 결성 ( ? )년, 리눅스 파운데이션 / Docker의 ____ → runc 기부 / 경쟁 진영 CoreOS ____(appc)
         3스펙: ( ? ) / ( ? ) / ( ? )

[코어 2] 번들 = ____.json + ____/       runc는 ( ? )를 모르고 번들만 안다
         linux.namespaces ← ( ? )장    linux.resources ← ( ? )장
         상태: creating → ( ? ) → running → ( ? )       명령: create / start / kill / delete / ____
         create 후 start 전 틈: ____ 또는 hooks 실행

[코어 3] 이미지: ( ? ) → config + ( ? )     멀티 아키텍처 = 이미지 ( ? )
         미디어 타입: application/vnd.____.image.manifest.v1+json
         배포 API: GET /v2/<name>/manifests/<ref> , GET /v2/<name>/blobs/<____>

[코어 4] runc(Go, 참조 구현·커널 ( ? )) / crun(( ? ) 언어, cold start ↓) /
         gVisor(runsc: ( ? )가 시스콜 처리, Gofer) / Kata(별도 ( ? ) 가진 경량 VM) / youki(( ? ) 언어)

[코어 5] containerd: runtime_type = io.containerd.____.v2     쿠버네티스: RuntimeClass.____ = runsc
         dockerd: daemon.json "____" , docker run --____=runsc
```

### 2. 인출 질문

1. OCI가 만들어진 배경과 세 스펙은?

   <details markdown="1"><summary>답 확인</summary>

   Docker가 사실상 표준이 되면서 단일 기업 구현에 종속되는 불안이 커졌고, CoreOS의 rkt/appc로 진영이 갈라질 조짐이 있어 2015년 6월 리눅스 파운데이션 산하에 OCI가 결성됐다. Docker의 libcontainer가 runc로 기부됐다. 세 스펙은 Runtime(실행), Image(이미지 구조), Distribution(레지스트리 push/pull API)이다. → 코어 1

   </details>

2. 번들이란 무엇이고 왜 runc는 이미지를 몰라도 되는가?

   <details markdown="1"><summary>답 확인</summary>

   번들은 `config.json`과 루트 파일시스템(`rootfs/`)을 담은 디렉터리다. containerd가 이미지를 받아 레이어를 풀어 rootfs로 배치하고 설정을 config.json으로 직렬화한 뒤 runc를 호출하므로, runc는 번들만 알면 된다. 이 역할 분리 덕분에 이미지 포맷이 바뀌어도 runc는 변경이 필요 없다. → 코어 2

   </details>

3. config.json의 `linux.namespaces`와 `linux.resources`는 무엇에 대응하는가?

   <details markdown="1"><summary>답 확인</summary>

   `linux.namespaces`는 새로 만들거나 공유할 네임스페이스 목록(9장), `linux.resources`는 cgroup으로 제어할 자원 한도(10장)를 JSON으로 표현한 것이다. runc는 이 선언을 `clone()`/`unshare()`/`setns()` 등 커널 API 호출과 cgroup 제어 파일 기록으로 번역하는 얇은 계층이다. → 코어 2

   </details>

4. 컨테이너의 네 상태와 `create`/`start`가 분리된 이유는?

   <details markdown="1"><summary>답 확인</summary>

   creating(구성 중) → created(환경 구성 끝, 프로그램 미실행) → running(프로그램 실행 중) → stopped(종료)다. create 단계에서 격리 구성이 모두 끝나 있으므로 그 시점에 상위 계층이 관찰용 프로세스를 붙이거나 네트워크 인터페이스를 컨테이너 네임스페이스에 옮기는 등의 후처리를 안전하게 끼워 넣을 수 있다. hooks도 이 틈에서 실행된다. → 코어 2

   </details>

5. 이미지 매니페스트, 이미지 config, 레이어, 이미지 인덱스는 각각 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   매니페스트는 config 참조와 레이어 다이제스트 목록을 담은 JSON, config는 `Cmd`·`Entrypoint`·`Env` 등 런타임 기본 설정과 `rootfs.diff_ids`, 레이어는 파일시스템 변경분 tar(순서대로 겹쳐야 완전한 rootfs), 인덱스는 여러 매니페스트(아키텍처별)를 가리키는 상위 문서다. → 코어 3

   </details>

6. Distribution Spec의 핵심 엔드포인트는?

   <details markdown="1"><summary>답 확인</summary>

   `GET /v2/`(버전/인증 프로브), `GET /v2/<name>/manifests/<reference>`(태그 또는 다이제스트로 매니페스트 조회), `GET /v2/<name>/blobs/<digest>`(블롭 다운로드), `POST /v2/<name>/blobs/uploads/`(블롭 업로드 시작), `PUT /v2/<name>/manifests/<reference>`(매니페스트 업로드). `docker pull`, `ctr images pull` 모두 이 API를 쓴다. → 코어 3

   </details>

7. runc, crun, gVisor, Kata의 격리 방식 차이를 한 줄씩 말해 보라.

   <details markdown="1"><summary>답 확인</summary>

   runc는 호스트 커널을 공유하며 네임스페이스·cgroup 등 표준 커널 기능으로 격리한다. crun은 격리 방식은 같고 C로 재작성돼 시작 지연과 메모리가 작다. gVisor는 Sentry라는 유저스페이스 커널이 시스템 콜을 가로채 처리해 호스트 커널 표면적을 줄인다. Kata는 컨테이너/Pod마다 별도 커널을 가진 경량 VM에서 실행한다. → 코어 4

   </details>

8. 쿠버네티스에서 특정 Pod만 gVisor로 실행하려면 어떤 설정이 연결되는가?

   <details markdown="1"><summary>답 확인</summary>

   containerd `config.toml`에 `runtimes.runsc`(`runtime_type = "io.containerd.runsc.v1"`)를 등록하고, 쿠버네티스에 `RuntimeClass`(`handler: runsc`)를 만들어 Pod의 `spec.runtimeClassName`에 지정한다. 런타임 이름과 `handler`가 이어진다. → 코어 5

   </details>

### 3. 기억 고리

- **C++ 유추:** 추상 인터페이스 + 교체 가능한 구현 클래스 = OCI 스펙 + runc/crun/gVisor/Kata ⚠️ 구현 교체가 단순한 성능 차이가 아니라 격리 모델(커널 공유 / 유저스페이스 커널 / VM) 자체를 바꾼다.
- **C++ 유추:** `socket/bind/listen` 후 `accept` 루프 시작 = `create` 후 `start` ⚠️ 이 사이는 네트워크 연결이 아니라 네임스페이스·마운트·cgroup 구성이 끝난 상태이며, 상위 계층의 후처리를 끼워 넣는 용도다.
- **비유:** OCI 스펙 = 해운 컨테이너 규격(ISO). 규격이 같으면 어떤 배·크레인에서도 다룬다. ⚠️ 비유가 깨지는 지점: 해운 컨테이너는 한 가지 물리 규격이지만, OCI는 실행·이미지·배포 세 스펙으로 나뉘고 실행 구현마다 격리 방식이 서로 다르다.
- **비유:** runc = 설계도(config.json)를 읽고 시공하는 시공사, 이미지는 자재 꾸러미. 시공사는 설계도와 자재(rootfs)만 보고 짓는다. ⚠️ 비유가 깨지는 지점: runc는 "짓는" 일을 하는 것이 아니라 커널 API를 호출해 격리를 구성하는 얇은 번역 계층이고, 자재를 풀어 주는 일(이미지 → 번들)은 containerd가 한다.
- **묶음(3의 법칙):** OCI 3스펙(Runtime·Image·Distribution) / 격리 수준 3단(runc 커널 공유 · gVisor 유저스페이스 커널 · Kata VM) / 런타임을 지정하는 3곳(containerd `config.toml`·쿠버네티스 `RuntimeClass`·dockerd `daemon.json`).
- **대칭·순서:** `create` ↔ `start`, `kill` ↔ `delete`. 이미지 → 번들(containerd) → 컨테이너(runc). 인덱스 → 매니페스트 → config + 레이어.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`docker run` 마지막 단계에서 runc가 받는 입력은 무엇이고, 무엇을 하는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "OCI 스펙이 왜 필요했고, runc가 참조 구현이라는 것은 무슨 뜻인가"를 프로토콜 명세와 구현 교체에 빗대어 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "컨테이너는 격리되어 있으니 모든 워크로드에 runc면 충분하다" vs B "신뢰 경계에 따라 gVisor나 Kata가 필요하다" — 양쪽을 번갈아 변호해 보세요. (커널 공유, 시스템 콜 표면적, 시작 지연, `io_uring` 호환성을 근거로)
- **AI 역할 반전:** "내가 OCI Runtime Spec의 번들과 라이프사이클을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/04_컨테이너_런타임_표준.md (4.1&#126;4.6)*
