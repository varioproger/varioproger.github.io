---
title: "5장. containerd 아키텍처 심화 — 플러그인, shim v2, Sandbox API"
---

# 5장. containerd 아키텍처 심화 — 플러그인, shim v2, Sandbox API

4장에서는 OCI 스펙이 무엇을 표준화하는지, 그리고 그 표준을 구현하는 런타임들이 어떻게 서로 교체 가능한
부품으로 존재하는지를 살펴봤습니다. 이번 장에서는 그 런타임들을 실제로 골라 쓰고 관리하는 상위 계층,
즉 containerd 자체의 내부 구조를 파고듭니다. 1장에서 dockerd → containerd → runc라는 실행 경로를
개괄적으로 봤다면, 여기서는 containerd가 왜 단순한 "runc 실행기"가 아니라 그 자체로 하나의 완결된
컨테이너 관리 플랫폼인지를 이해하는 데 집중합니다.

## 5.1 containerd의 전체 구조 — 클라이언트-서버와 gRPC API

containerd는 단일 바이너리로 배포되는 데몬이지만, 내부적으로는 클라이언트-서버 아키텍처를 따릅니다.
`containerd` 프로세스는 유닉스 소켓(보통 `/run/containerd/containerd.sock`)에 gRPC 서버를 열어 두고,
`dockerd`, `ctr`, Kubernetes의 kubelet(CRI를 통해)과 같은 클라이언트가 이 소켓으로 요청을 보냅니다.
dockerd 자신도 예외가 아니어서, `docker run`이 실행되면 dockerd는 자체적으로 컨테이너를 만드는 대신
`libcontainerd`라는 내부 클라이언트 계층을 통해 containerd에 gRPC 요청을 보냅니다.

이 API는 기능 단위로 여러 서비스로 나뉘어 있습니다. 실무에서 자주 마주치는 서비스들은 다음과 같습니다.

| 서비스 | 역할 |
|---|---|
| Content | 이미지 레이어, config 등 콘텐츠 주소화된 블롭을 저장·조회 |
| Images | 이미지 이름(태그)과 매니페스트 다이제스트의 매핑 관리 |
| Snapshots | 레이어를 겹쳐 쌓아 마운트 가능한 루트 파일시스템을 만드는 스냅샷 관리 |
| Containers | 컨테이너의 메타데이터(어떤 이미지, 어떤 스냅샷, 어떤 런타임을 쓰는지) 관리 |
| Tasks | 실제로 실행 중인 프로세스(태스크)의 시작·정지·시그널 전달 |
| Events | 컨테이너 생성/시작/종료 등 상태 변화를 구독 가능한 이벤트 스트림으로 제공 |
| Diff | 두 스냅샷 사이의 차이를 계산해 새 레이어를 만드는 기능 |

여기서 "컨테이너"와 "태스크"가 별개의 객체로 분리되어 있다는 점이 containerd 설계의 특징입니다.
컨테이너 객체는 "이 이미지로, 이 설정으로 실행할 예정"이라는 정적인 메타데이터를 나타내고, 태스크는
그 메타데이터를 바탕으로 실제로 뜬 프로세스(그리고 그 프로세스를 감독하는 shim)를 가리킵니다. 이 분리
덕분에 컨테이너 객체는 유지한 채 태스크만 재시작하거나, 태스크가 죽어도 컨테이너 정의 자체는 남겨 두는
식의 유연한 운용이 가능해집니다.

## 5.2 플러그인 시스템

containerd의 거의 모든 기능은 플러그인으로 구현되어 있습니다. 콘텐츠 스토어, 스냅샷터, 메타데이터 저장소,
런타임 shim 관리자 모두가 플러그인이며, `containerd`라는 바이너리는 이 플러그인들을 초기화 순서(의존성)에
따라 로드하고 서로 연결해 주는 조립자에 가깝습니다. 플러그인은 몇 가지 유형으로 나뉘는데, 대표적으로
containerd 프로세스 내부에서 직접 Go 인터페이스로 호출되는 내장 플러그인과, 별도 프로세스로 떠서 gRPC로
통신하는 프록시 플러그인이 있습니다. 후자의 방식 덕분에 스냅샷터나 콘텐츠 스토어 같은 컴포넌트를 containerd
자체를 재컴파일하지 않고도 외부 구현으로 완전히 교체할 수 있습니다. 예를 들어 `stargz` 같은 원격 스냅샷터,
또는 클라우드 벤더가 제공하는 커스텀 콘텐츠 스토어가 모두 이 프록시 플러그인 방식으로 붙습니다.

이 플러그인 구조가 실무에 미치는 영향은 명확합니다. "이 컨테이너는 overlayfs 스냅샷터로, 저 컨테이너는
다른 스토리지 백엔드로"라는 식의 조합이 containerd 설정 파일 수정만으로 가능해지고, 런타임 역시 4장에서
본 것처럼 `runtime_type` 설정 하나로 runc/gVisor/Kata 사이를 오갈 수 있습니다. 다음 절에서 다룰 shim v2가
바로 이 "런타임 플러그인"이 실제로 컨테이너 프로세스와 연결되는 지점입니다.

### 플러그인 종류와 설정에서 실제로 보이는 이름들

`/etc/containerd/config.toml`을 열어 보면 `[plugins."io.containerd.xxx.v1.yyy"]` 형태의 테이블이 여럿
나열되어 있는데, 이 문자열이 곧 플러그인의 정식 식별자입니다. 예를 들어 CRI 플러그인은
`io.containerd.grpc.v1.cri`, overlayfs 스냅샷터는 `io.containerd.snapshotter.v1.overlayfs`, runc용
런타임 shim 관리자는 `io.containerd.runc.v2`라는 식으로 각 컴포넌트가 고유한 이름공간을 갖습니다. 이
식별자 체계 덕분에 `ctr plugins list` 한 번으로 현재 이 containerd 인스턴스에 어떤 기능이 실제로
활성화되어 있는지, 그리고 각 플러그인이 정상적으로 초기화되었는지(`ok` 상태)를 한눈에 확인할 수 있습니다.

```bash
sudo ctr plugins list
# TYPE                            ID                  PLATFORMS      STATUS
# io.containerd.snapshotter.v1    overlayfs           linux/amd64    ok
# io.containerd.runtime.v2        task                linux/amd64    ok
# io.containerd.grpc.v1           cri                 linux/amd64    ok
# ...
```

일부 플러그인은 특정 커널 기능이나 바이너리가 없으면 `error` 상태로 표시되며, 이 목록이 실무에서 가장
먼저 확인하는 진단 지점이 됩니다. 예를 들어 데몬을 새로 올렸는데 특정 스냅샷터가 `error`로 뜬다면,
설정 파일의 오타보다 먼저 그 스냅샷터가 요구하는 커널 파일시스템 지원 여부를 의심해 볼 수 있습니다.

## 5.3 runtime v2 shim 아키텍처

### shim이 왜 필요한가

containerd가 runc를 직접 호출해서 컨테이너를 띄운다고 가정해 봅시다. 이 경우 containerd 프로세스가 각
컨테이너의 부모 프로세스이거나, 최소한 그 프로세스를 계속 감시하고 있어야 합니다. 그런데 containerd
자신이 업데이트나 장애로 재시작해야 하는 상황이 생기면 어떻게 될까요? containerd가 직접 컨테이너를 붙들고
있었다면, containerd가 죽는 순간 그 아래 딸린 컨테이너들도 함께 죽거나 최소한 고아 프로세스가 되어
버립니다. 이는 "데몬을 업데이트하려면 운영 중인 모든 컨테이너를 내려야 한다"는 뜻이 되어, 컨테이너
오케스트레이션의 안정성을 크게 해칩니다.

이 문제를 해결하기 위해 containerd는 각 컨테이너(정확히는 각 태스크)마다 별도의 짧은 수명이 아닌
"shim"이라는 경량 프로세스를 하나씩 두고, 실제 컨테이너 프로세스의 부모 역할은 이 shim이 맡도록
설계했습니다. shim은 containerd 데몬과 ttRPC(gRPC보다 가벼운 RPC 프로토콜)로 통신하며, containerd가
재시작되더라도 shim과 그 아래 컨테이너 프로세스는 영향을 받지 않고 계속 살아 있습니다. containerd가
다시 올라오면, 이미 떠 있는 shim들에 다시 접속해 상태를 복구합니다. 즉 shim은 "containerd 데몬의 수명과
컨테이너 프로세스의 수명을 분리해 주는 완충 계층"입니다.

### containerd-shim-runc-v2를 직접 확인하기

runc를 백엔드로 쓰는 shim의 실행 파일 이름은 `containerd-shim-runc-v2`입니다. 이 shim은 자신이 맡은
런타임(runc)의 바이너리를 호출해 실제 create/start 같은 OCI 라이프사이클 동작을 수행시키고, 그 결과로
생긴 컨테이너 프로세스를 자신의 자식으로 둡니다. 컨테이너를 하나 띄우고 `ps` 트리를 보면 이 구조가
그대로 드러납니다.

```bash
docker run -d --name shim-demo nginx:alpine
ps -eo pid,ppid,cmd | grep -E 'containerd-shim|nginx' | grep -v grep
```

출력에는 `containerd-shim-runc-v2` 프로세스 한 줄과, 그 프로세스를 부모(PPID)로 둔 `nginx` 프로세스가
함께 나타납니다. 컨테이너를 하나 더 띄우면 shim 프로세스도 하나 더 늘어나는 것을 볼 수 있는데, 이는
"태스크 하나당 shim 프로세스 하나"라는 원칙을 그대로 보여줍니다(같은 파드 안의 여러 컨테이너를 하나의
shim으로 묶는 Kata 같은 경우는 예외적으로 다루는데, 이는 뒤에서 다룰 Sandbox API와 관련이 있습니다).
`containerd list tasks` 명령이나 `ctr -n moby tasks list`(dockerd가 사용하는 네임스페이스는 기본적으로
`moby`입니다)로도 각 태스크가 어떤 PID를 갖는지 확인할 수 있습니다.

### ttrpc 소켓과 shim의 수명 관리

각 shim은 `/run/containerd/`(또는 배포판에 따라 유사한 경로) 아래에 자신만의 ttrpc 소켓 파일을 만들어
containerd가 다시 접속할 수 있는 지점을 남겨 둡니다. containerd 데몬이 재시작될 때 실제로 벌어지는 일은
"각 태스크의 메타데이터를 읽고, 그 태스크가 쓰던 소켓으로 다시 연결을 시도한다"는 것에 가깝습니다. 이
소켓이 살아 있고 shim 프로세스가 응답한다면 containerd는 해당 태스크를 running 상태로 그대로 복구하고,
반대로 shim이 이미 죽어 소켓이 응답하지 않는다면 그 태스크는 알 수 없음(unknown) 또는 정지 상태로
표시됩니다. gRPC 대신 ttRPC를 쓰는 이유도 이런 로컬 프로세스 간 통신에 최적화되어 있기 때문입니다.
ttRPC는 gRPC와 같은 protobuf 기반 인터페이스 정의를 재사용하면서도, HTTP/2 스택을 거치지 않는 훨씬
가벼운 프레이밍을 사용해 리소스가 빠듯한 환경에서도 다수의 shim을 부담 없이 띄울 수 있게 합니다.

## 5.4 Sandbox API — 파드와 VM 샌드박스를 위한 추상화

shim v2가 오랫동안 "컨테이너 하나 대 shim 하나"라는 비교적 단순한 모델로 운영되어 왔지만, Kubernetes의
파드처럼 여러 컨테이너가 네트워크 네임스페이스를 공유하며 하나의 단위로 뜨고 내려가야 하는 경우, 또는
Kata Containers처럼 컨테이너 여러 개가 VM 하나를 공유해야 하는 경우에는 "컨테이너"보다 한 단계 위의
추상화가 필요합니다. 이 필요를 채우기 위해 도입된 것이 Sandbox API입니다.

Sandbox API는 containerd 1.7에서 실험적(experimental) 기능으로 처음 등장했고, **2026년 현재 기준
containerd 2.x 계열에서 stable로 승격되었습니다.** 이 API는 "샌드박스"라는 1급 객체를 도입해, 파드나
VM처럼 여러 컨테이너가 공유하는 실행 환경(네트워크 네임스페이스, 경우에 따라 VM 자체)의 생성·조회·삭제를
표준 인터페이스로 다룰 수 있게 합니다. 구조적으로 Sandbox API는 기존 shim v2 인터페이스를 완전히 대체하는
것이 아니라, 그 위에 샌드박스 전용 생명주기 관리를 얹은 확장에 가깝습니다. CRI 플러그인은 이제 파드
샌드박스를 다룰 때 레거시 방식 대신 이 샌드박스 컨트롤러 구현을 통해 동작하도록 전환되었습니다. 이
샌드박스 컨트롤러 역할을 하는 별도 구현체(예: Kata의 shim, 또는 VM 기반 런타임들)를 흔히 "sandboxer"라고
부릅니다.

이 변화가 실무에 갖는 의미는, Kata Containers처럼 VM 기반 격리를 쓰는 런타임이 "컨테이너 개수만큼 shim을
띄우는" 비효율적인 모델(파드에 컨테이너가 N개면 shim이 2N+1개 필요했던 과거 방식) 대신, 파드 하나에
shim 하나, VM 하나만 두고 그 안에서 여러 컨테이너를 관리하는 효율적인 구조를 표준 API 위에서 구현할 수
있게 되었다는 점입니다.

### shim v2의 하위 호환성

Sandbox API가 새로 추가되었다고 해서 기존 shim v2 인터페이스가 깨지는 것은 아닙니다. containerd 2.x는
runtime v2 shim 인터페이스에 대해 하위 호환성을 유지합니다. 즉 containerd 1.x 시절에 만들어진 shim
구현체는 containerd 2.x 위에서도 그대로 동작합니다. 반대 방향은 성립하지 않는데, 2.x 전용으로 추가된
shim 라이브러리 기능(예: 샌드박스 컨트롤러 인터페이스)에 의존해 작성된 shim은 containerd 1.6 이하의
구버전에서는 동작하지 않습니다. 런타임 벤더의 shim을 업그레이드할 때는 이 방향성을 반드시 확인해야
합니다 — "새 containerd에서 옛 shim"은 안전하지만 "옛 containerd에서 새 shim"은 안전하지 않습니다.

## 5.5 CRI 플러그인과 Kubernetes 통합

containerd에는 Container Runtime Interface(CRI) 구현체가 플러그인 형태로 내장되어 있습니다. Kubernetes의
kubelet은 gRPC 기반 CRI 프로토콜로 컨테이너 런타임과 통신하도록 설계되어 있는데, containerd는 이 CRI
프로토콜을 직접 구현한 플러그인을 자체적으로 포함하고 있어서, 별도의 중개 프로세스 없이 kubelet이
containerd의 소켓에 곧바로 연결할 수 있습니다. 이는 과거 Kubernetes가 Docker Engine을 CRI 없는 상태로
쓰기 위해 두어야 했던 `dockershim`이라는 중개 계층(Kubernetes 1.20에서 지원 종료 예고, 1.24에서 제거)과
대비되는 지점입니다. dockerd 자체는 지금도 CRI를 구현하지 않으므로, Docker Engine을 Kubernetes의
런타임으로 쓰려면 `cri-dockerd`라는 별도 어댑터가 필요합니다.

정리하면 두 가지 사용 경로가 병존합니다.

- **Docker Engine 경유**: `docker` CLI/API → dockerd → libcontainerd → containerd(gRPC, 기본 네임스페이스는
  보통 `moby`) → shim → runc. 사람이 직접 `docker run`을 칠 때의 경로입니다.
- **Kubernetes 경유**: kubelet → containerd의 CRI 플러그인(gRPC, 네임스페이스는 보통 `k8s.io`) → shim → runc.
  dockerd는 이 경로에 전혀 관여하지 않습니다.

두 경로 모두 최종적으로 같은 containerd 데몬, 같은 shim v2 인터페이스로 수렴한다는 점이 중요합니다.
차이는 "누가 containerd에 요청을 보내는가"와 "어떤 containerd 네임스페이스를 쓰는가"일 뿐, 컨테이너를
실행하는 하위 메커니즘 자체는 동일합니다.

### Docker Engine과 "순수 containerd" 사용의 실질적 차이

이 두 경로의 차이는 단순히 API 클라이언트가 다르다는 데 그치지 않습니다. dockerd는 이미지 빌드,
`docker network`/`docker volume` 같은 사용자 편의 기능, 레거시 그래프 드라이버와의 호환 계층, 그리고
사람이 직접 다루기 좋은 REST API와 CLI라는 부가가치를 얹어 놓은 상위 레이어입니다. 반면 Kubernetes가
CRI를 통해 containerd를 직접 쓸 때는 이런 부가 기능이 전혀 끼어들지 않고, kubelet이 필요로 하는
최소한의 동작(파드 샌드박스 생성, 이미지 pull, 컨테이너 태스크 시작/정지)만 CRI 프로토콜로 요청합니다.
즉 "Docker Engine을 쓴다"는 것은 containerd 위에 dockerd라는 또 하나의 관리 계층을 얹는 선택이고,
"containerd를 직접 쓴다"는 것은 그 관리 계층을 걷어내고 오케스트레이터(kubelet)가 containerd의 저수준
API와 곧바로 대화하게 하는 선택입니다. CRI 플러그인 자체의 설정은 `/etc/containerd/config.toml`의
`[plugins."io.containerd.grpc.v1.cri"]` 테이블 아래에 모여 있으며, 4장에서 다룬 런타임별 `runtimes` 설정도
바로 이 테이블의 하위 항목입니다.

## 5.6 containerd 자체의 "네임스페이스" — 커널 네임스페이스와 혼동하지 말 것

여기서 반드시 짚어야 할 개념적 함정이 하나 있습니다. containerd에는 `ctr --namespace` 또는 `ctr -n`으로
지정하는 "네임스페이스"라는 용어가 있는데, 이는 2장에서 다룬 리눅스 커널 네임스페이스(pid, net, mnt 등)와
전혀 다른 개념입니다. containerd의 네임스페이스는 커널 격리 메커니즘이 아니라, **containerd 한 인스턴스
안에서 여러 사용자(또는 여러 상위 시스템)의 이미지·컨테이너·태스크 메타데이터를 서로 겹치지 않게
구분하기 위한 멀티테넌시 개념**입니다. 예를 들어 dockerd는 기본적으로 `moby`라는 containerd 네임스페이스
아래에 자신의 컨테이너들을 등록하고, Kubernetes(kubelet)는 `k8s.io` 네임스페이스를 사용합니다. 같은
호스트에서 같은 containerd 데몬을 dockerd와 kubelet이 함께 쓰더라도, 서로 다른 네임스페이스에 격리되어
있어 상대방의 컨테이너 목록을 보지 못합니다. 이것은 리소스 격리가 아니라 "이름공간 충돌 방지와 멀티
테넌트 메타데이터 분리"를 위한 장치이며, 실제 프로세스 격리는 여전히 커널 네임스페이스(2장)와 cgroup(3장)이
담당합니다.

## 5.7 ctr CLI로 containerd 직접 다뤄보기

`ctr`은 containerd에 기본 포함된 저수준 디버깅용 CLI입니다. dockerd를 거치지 않고 containerd의 gRPC API를
직접 호출하기 때문에, "dockerd가 실제로 무엇을 대신 해주고 있었는지"를 역으로 체감하기에 좋은 도구입니다.
공식 문서도 이 도구를 사람이 매일 쓰는 프로덕션 CLI가 아니라 디버깅/실습용으로 소개하고 있다는 점을
염두에 두어야 합니다(일상적인 운영에는 `nerdctl` 같은 사용자 친화적 CLI가 더 적합합니다).

```bash
# containerd에 등록된 네임스페이스 목록을 확인합니다.
sudo ctr namespaces list
# dockerd를 쓰고 있었다면 "moby"가, Kubernetes 노드라면 "k8s.io"가 보일 것입니다.

# default 네임스페이스에 이미지를 받아 봅니다.
sudo ctr images pull docker.io/library/alpine:latest

# default 네임스페이스에서 컨테이너를 실행합니다(대화형 종료 시 컨테이너도 함께 정리).
sudo ctr run --rm -t docker.io/library/alpine:latest demo sh

# 반면 dockerd가 관리 중인 컨테이너는 moby 네임스페이스에서 보입니다.
sudo ctr -n moby containers list
sudo ctr -n moby tasks list

# Content 서비스에 저장된 블롭을 다이제스트 단위로 직접 조회해 봅니다.
sudo ctr -n moby content ls
# 이미지 config, 매니페스트, 각 레이어가 sha256:... 형태의 다이제스트로 나열되는 것을
# 확인할 수 있습니다. 이는 6장에서 다룰 콘텐츠 주소화 저장소의 실체입니다.
```

마지막 두 줄이 핵심입니다. `docker ps`로 보이는 컨테이너와 `ctr -n moby containers list`로 보이는
컨테이너가 정확히 일치한다는 것을 확인하면, dockerd가 "자체적으로 컨테이너를 관리"하는 것이 아니라
"containerd의 moby 네임스페이스에 위임"하고 있을 뿐이라는 사실이 명확해집니다.

다음 6장에서는 여기서 언급한 스냅샷 서비스, 즉 이미지 레이어가 실제로 디스크에서 어떻게 겹쳐 쌓여
컨테이너의 루트 파일시스템이 되는지, 그리고 그 저장 방식이 레거시 graphdriver에서 containerd 네이티브
스냅샷터 모델로 어떻게 넘어갔는지를 자세히 다룹니다.

## 핵심 요약

- containerd는 유닉스 소켓 위에 gRPC API를 제공하는 데몬이며, Content/Images/Snapshots/Containers/Tasks/Events
  등 기능별 서비스로 나뉘어 있습니다. dockerd도 `libcontainerd`를 통해 이 API를 호출하는 클라이언트 중
  하나일 뿐입니다.
- containerd의 거의 모든 컴포넌트는 플러그인이며, 내장 플러그인과 별도 프로세스로 gRPC 연결되는 프록시
  플러그인 방식을 함께 지원해 스냅샷터·콘텐츠 스토어·런타임을 자유롭게 교체할 수 있습니다.
- runtime v2 shim은 컨테이너(태스크)마다 하나씩 떠서 실제 컨테이너 프로세스의 부모가 되며, containerd
  데몬이 재시작되어도 컨테이너가 죽지 않도록 하는 완충 계층입니다. runc용 shim의 실행 파일명은
  `containerd-shim-runc-v2`이며 `ps` 트리에서 직접 확인할 수 있습니다.
- Sandbox API는 containerd 1.7의 실험 기능에서 시작해 2026년 현재 containerd 2.x에서 stable로 승격되었고,
  파드나 VM처럼 여러 컨테이너가 공유하는 실행 환경을 1급 객체로 다룹니다. shim v2는 1.x 대상 shim이 2.x에서도
  동작하는 하위 호환성을 유지하지만 역방향은 보장되지 않습니다.
- CRI 플러그인이 containerd에 내장되어 있어 Kubernetes의 kubelet은 dockerd 없이 containerd에 직접
  연결됩니다. Docker Engine 경로(`moby` 네임스페이스)와 Kubernetes 경로(`k8s.io` 네임스페이스)는 같은
  containerd 데몬을 공유하면서도 서로 다른 containerd 네임스페이스로 분리됩니다.
- containerd의 "네임스페이스"는 커널 네임스페이스와 무관한 멀티테넌시용 메타데이터 구분 개념이며,
  `ctr -n <namespace>`로 지정합니다.

## 실습

```bash
# 1. containerd 소켓과 서비스 상태를 확인합니다.
sudo systemctl status containerd
sudo ctr version
# Server 버전이 2.3.x 계열인지 확인합니다.

# 2. 현재 등록된 네임스페이스를 확인합니다.
sudo ctr namespaces list

# 3. Docker로 컨테이너를 하나 띄우고, ps로 shim 프로세스를 확인합니다.
docker run -d --name shim-demo nginx:alpine
ps -eLo pid,ppid,cmd | grep -E 'containerd-shim-runc-v2|nginx: master' | grep -v grep
# containerd-shim-runc-v2 프로세스와, 그 프로세스를 PPID로 갖는 nginx 마스터 프로세스가
# 각각 한 줄씩 보이는지 확인합니다.

# 4. moby 네임스페이스에서 같은 컨테이너가 보이는지 ctr로 교차 확인합니다.
sudo ctr -n moby containers list
sudo ctr -n moby tasks list
# docker ps에서 본 컨테이너 ID(축약형이 아닌 전체 ID)와 일치하는지 비교합니다.

# 5. containerd 이벤트 스트림을 구독해, 컨테이너를 정지/삭제할 때 어떤 이벤트가
#    실시간으로 올라오는지 관찰합니다.
sudo ctr -n moby events &
docker stop shim-demo
docker rm shim-demo
# TaskExit, TaskDelete 같은 이벤트 타입이 순서대로 출력되는지 확인한 뒤,
# 백그라운드로 띄운 events 프로세스를 kill 명령으로 정리합니다.

# 6. default 네임스페이스에서 ctr만으로 컨테이너를 직접 띄워, dockerd 없이도
#    containerd 단독으로 컨테이너가 뜨는 과정을 체험합니다.
sudo ctr images pull docker.io/library/alpine:latest
sudo ctr run --rm -t docker.io/library/alpine:latest ctr-demo sh
```

3~4단계에서 `docker ps`와 `ctr -n moby containers list`의 결과가 정확히 일치하는 것을 확인하는 과정이
이번 장의 핵심 체험입니다. dockerd가 별도의 컨테이너 관리 로직을 갖고 있는 것이 아니라, containerd라는
동일한 엔진에 `moby`라는 이름의 네임스페이스로 접속해 위임하고 있을 뿐이라는 사실을 직접 눈으로 확인할
수 있습니다.
