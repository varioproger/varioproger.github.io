---
title: "4장. 가상 머신 vs 컨테이너, Docker의 전체 구조"
parent: "2부. 컨테이너와 Docker"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 4
---

# 4장. 가상 머신 vs 컨테이너, Docker의 전체 구조

## 이 장에서 배우는 것

- 가상 머신(VM)과 컨테이너가 격리하는 위치가 어떻게 다른지 설명한다.
- 컨테이너 격리가 "상대적으로 약하다"는 말의 의미를 이해한다.
- `docker run` 한 줄이 CLI → dockerd → containerd → shim → runc → 커널로 이어지는 흐름을 따라간다.
- 이미지(파일과 설정)와 실행 중인 컨테이너(프로세스)가 어떻게 다른지 구분한다.

---

## 4.1 컨테이너 vs 가상 머신

두 기술 모두 "격리된 실행 환경"을 제공하지만, **격리가 일어나는 위치가 다르다.**

```
┌──── 가상 머신 ────────────────┐   ┌──── 컨테이너 ─────────────────┐
│  앱 A     앱 B     앱 C       │   │  앱 A     앱 B     앱 C        │
│  라이브러리 라이브러리 라이브러리 │   │  라이브러리 라이브러리 라이브러리 │
│  게스트OS  게스트OS  게스트OS   │   │                              │
│  (커널)    (커널)    (커널)    │   │      ← 커널을 공유 →           │
│  ─────────────────────────   │   │  ─────────────────────────    │
│      하이퍼바이저             │   │      컨테이너 런타임            │
│  ─────────────────────────   │   │  ─────────────────────────    │
│      호스트 OS (커널)          │   │      호스트 OS (커널)          │
│      물리 하드웨어             │   │      물리 하드웨어             │
└──────────────────────────────┘   └──────────────────────────────┘
```

- **가상 머신**은 하드웨어를 가상화한다. 각 VM은 자기만의 커널을 갖고, 하이퍼바이저가 CPU·메모리·디바이스를 나눠 준다. 격리 경계가 하드웨어 수준이라 매우 강하다.
- **컨테이너**는 프로세스를 격리한다. 모든 컨테이너가 호스트의 커널 하나를 공유하고, 커널이 제공하는 격리 기능으로 서로를 보이지 않게 만든다. 컨테이너 안에서 `ps`를 실행하면 자기 프로세스만 보이지만, 호스트에서 보면 그냥 하나의 프로세스일 뿐이다.

| 비교 항목 | 가상 머신 | 컨테이너 |
|---|---|---|
| 격리 수준 | 하드웨어 (강함) | 커널 네임스페이스 (상대적으로 약함) |
| 부팅 시간 | 수십 초 &#126; 수 분 | 수십 밀리초 &#126; 수 초 |
| 이미지 크기 | 수 GB | 수 MB &#126; 수백 MB |
| 오버헤드 | 게스트 커널 + 하이퍼바이저 | 거의 없음 |
| 밀도 (호스트당) | 수십 개 | 수백 &#126; 수천 개 |
| 커널 | 각자 다른 커널·OS 가능 | 호스트 커널 공유 (리눅스만) |

### "컨테이너는 격리가 약하다"의 의미

컨테이너의 격리는 커널이 제공한다. 따라서 **커널에 취약점이 있으면 격리가 뚫릴 수 있다.** 커널 취약점으로 컨테이너를 탈출(container escape)하면 호스트 전체가 노출된다. VM은 하이퍼바이저까지 뚫어야 하므로 한 단계 더 어렵다.

그래서 신뢰할 수 없는 코드를 실행하는 환경에서는 **샌드박스 런타임**을 쓰기도 한다.

- **gVisor**: 사용자 공간에서 커널 시스템콜을 가로채 구현해 호스트 커널 노출 면적을 줄인다.
- **Kata Containers**: 컨테이너마다 경량 VM을 띄운다. VM 수준 격리 + 컨테이너 사용성.
- **Firecracker**: AWS Lambda·Fargate가 쓰는 마이크로 VM.

> **[보충]** 처음에는 "일반 컨테이너 = 호스트 커널을 함께 쓰는 보통 프로세스"라는 점만 기억해도 충분하다. 샌드박스 런타임은 보안 요구가 높을 때 고려하는 선택지다.

---

## 4.2 "Docker"라는 말 안에는 여러 역할이 있다

`docker build`와 `docker run`이 같은 명령어로 시작하기 때문에 "Docker라는 한 프로그램이 만들고 끝까지 실행한다"고 이해하기 쉽다. 실제로는 여러 구성 요소가 협력한다.

| 이름 | 무엇인가 | 역할 |
|---|---|---|
| Docker CLI | 사용자가 호출하는 클라이언트 | `docker build`, `docker run` 등 요청 전달 |
| Buildx / BuildKit | 빌드 클라이언트 / 빌드 엔진 | Dockerfile과 소스로 이미지 생성 |
| Docker Engine (`dockerd`) | Docker API와 관리 기능을 제공하는 데몬 | 이미지·네트워크·볼륨 등 Docker 방식으로 관리 |
| containerd | 컨테이너 런타임 데몬 | 이미지와 컨테이너 수명 관리 |
| runc | OCI Runtime 규격의 구현체 | 준비된 환경에서 컨테이너 프로세스를 시작 |
| kubelet | 쿠버네티스의 노드 에이전트 | 자기 노드의 Pod 실행을 런타임에 요청 |

---

## 4.3 `docker run` 한 줄의 여정

`docker run -d --name web nginx:latest`를 실행하면 아래 순서로 요청이 전달된다.

```
docker CLI
   │  REST API 호출 (Unix 소켓 /var/run/docker.sock)
   ▼
dockerd (Docker Engine 데몬)
   │  gRPC (/run/containerd/containerd.sock)
   ▼
containerd
   │  컨테이너마다 shim 프로세스를 띄움
   ▼
containerd-shim-runc-v2
   │  OCI Runtime Spec에 따라 runc를 실행
   ▼
runc
   │  네임스페이스 생성, cgroup 설정, 루트 파일시스템 교체, 권한 적용 후
   │  컨테이너의 시작 명령을 execve()로 실행하고 runc 자신은 종료
   ▼
Linux 커널 (namespaces, cgroups, seccomp, capabilities, overlayfs 등)
```

각 계층의 책임을 표로 정리하면 다음과 같다.

| 컴포넌트 | 주요 책임 | 통신 방식 |
|---|---|---|
| `docker` CLI | 사용자 명령을 REST API 호출로 변환 | HTTP over Unix 소켓 |
| `dockerd` | 이미지 관리, 네트워크, 볼륨, 빌드(BuildKit 위임), 컨테이너 수명의 상위 조정 | REST API 서버 + containerd gRPC 클라이언트 |
| `containerd` | 이미지 pull/저장, 레이어(스냅샷) 관리, 컨테이너·태스크 관리, CRI 제공 | gRPC 서버 |
| `containerd-shim-runc-v2` | 컨테이너 프로세스의 부모 역할, 입출력·종료 상태 처리 | shim API |
| `runc` | 네임스페이스/cgroup/마운트를 구성하고 컨테이너 프로세스를 실행 | CLI 인자 + `config.json` |

핵심은 **계층마다 프로세스 경계가 실제로 나뉘어 있다**는 점이다.

- `docker` CLI는 요청을 보내고 응답을 받으면 끝난다. 컨테이너가 도는 동안 CLI가 살아 있을 필요는 없다.
- dockerd와 containerd는 서로 다른 독립 데몬이다.
- containerd가 컨테이너를 만들 때마다 그 컨테이너를 전담하는 shim 프로세스가 생긴다. (Docker의 일반적인 경로 기준이며, 구현에 따라 shim 하나가 여러 컨테이너를 맡도록 묶일 수도 있다.)
- **runc는 컨테이너를 "시작하는 순간"에만 존재하는 일회성 프로세스**다. 환경을 준비한 뒤 `execve()`로 자기 자리를 컨테이너의 시작 명령(예: nginx)으로 통째로 바꾸므로, 컨테이너가 실행되는 동안에는 runc가 남아 있지 않다.

### dockerd가 하는 일, containerd·runc가 하지 않는 일

네트워크 브리지 생성, 포트 매핑을 위한 방화벽 규칙 삽입, 볼륨 관리, 빌드 요청을 BuildKit에 넘기는 일은 **dockerd의 몫**이다. containerd와 runc는 이런 것을 알지 못하고 "이미지를 컨테이너로 만들어 실행한다"는 역할에 집중한다.

---

## 4.4 shim은 왜 있는가

runc가 실행 직후 사라진다면, 컨테이너의 출력(stdout/stderr)은 누가 붙잡고, 컨테이너가 종료됐을 때 종료 코드는 누가 회수할까? 이 일을 하는 것이 `containerd-shim-runc-v2`다. shim은 컨테이너 프로세스의 **부모**로 남아 입출력을 유지하고, 종료되면 종료 코드를 회수해 containerd에 전달한다.

이 구조의 결과가 중요하다. **dockerd나 containerd가 재시작되어도 shim과 컨테이너 프로세스는 영향을 받지 않는다.** 그래서 Docker 데몬을 업그레이드하려고 재시작해도 실행 중이던 컨테이너가 죽지 않는다. 데몬이 다시 뜨면 기존 컨테이너 상태를 다시 연결한다. "상위 데몬의 생사가 실행 중인 워크로드의 생사와 분리되어 있다"는 의미다.

다만 "데몬을 내리고 새 버전으로 올리는" 계획된 업그레이드에서 컨테이너 중단을 더 확실하게 막으려면 `/etc/docker/daemon.json`에서 `live-restore` 옵션을 켜 둔다. 이 옵션을 켜면 dockerd가 정상 종료될 때 실행 중인 컨테이너를 멈추지 않고 그대로 둔 채 종료하고, 재시작 후 containerd에 남아 있는 태스크 목록으로 상태를 다시 구성한다. 운영 환경에서 무중단 dockerd 업그레이드를 고려한다면 활성화가 일반적으로 권장된다.

```json
{
  "live-restore": true
}
```

직접 확인해 볼 수 있다.

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

(PID는 예시이다.) 출력에서 `runc`가 보이지 않는 점을 눈여겨보자. 이미 사라졌기 때문이다.

---

## 4.5 이미지는 "실행 중인 컴퓨터"가 아니라 파일과 설정

Python 앱을 예로 들면 Dockerfile은 이런 모양이다(개념 예시).

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY app.py /app/app.py
CMD ["python", "/app/app.py"]
```

- 빌드 결과(이미지)에는 Python 실행 파일, 라이브러리, 앱 파일, 시작 명령 등의 정보가 들어간다.
- `CMD`는 "빌드할 때 서버를 실행하라"가 아니라 **나중에 컨테이너를 시작할 때 쓸 기본 명령을 기록**하는 것이다.
- Dockerfile은 빌드의 입력일 뿐이고, 런타임은 이미 만들어진 이미지를 읽어 실행한다.
- 이미지에 Debian·Ubuntu 계열 파일이 들어 있어도 **별도의 게스트 커널을 부팅하지 않는다.** 앱의 시스템 호출은 호스트 커널이 처리한다.
- 같은 이미지를 쓴다는 것은 실행 중 메모리 상태를 복사한다는 뜻이 아니다. 각 머신이 이미지의 파일·설정으로 **새 프로세스**를 시작한다.

### 이미지를 만든 도구와 실행하는 도구는 달라도 된다

빌드는 BuildKit이 맡고, 일반적인 Docker Engine 실행 경로는 containerd와 runc를 사용한다. 쿠버네티스 노드는 Docker CLI/dockerd를 거치지 않고 kubelet이 CRI로 containerd에 요청하며, containerd가 runc로 컨테이너를 시작한다. 둘 다 같은 규격(OCI)의 이미지를 읽기 때문에 가능하다.

```
Docker CLI → dockerd → containerd → shim/runc → 앱 프로세스 → 커널   (개발 머신)
kubelet  ──CRI──→ containerd → shim/runc → 앱 프로세스 → 커널         (쿠버네티스 노드)
```

(위 도식은 호출 관계를 단순화한 것이며 프로세스의 부모·자식 관계를 정확히 그린 것은 아니다.)

---

## 4.6 실제로 CPU에서 도는 것은 무엇인가

최종적으로 리눅스가 실행하는 것은 Python, Java, Go 바이너리 같은 **앱 프로세스**다. 컨테이너는 그 프로세스에 격리된 환경과 제약을 적용한 실행 방식이다.

| 커널 기능 | 컨테이너에 주는 효과 |
|---|---|
| PID namespace | 프로세스가 보는 PID 범위를 분리 (안과 밖의 PID가 다름) |
| Network namespace | 인터페이스·IP·포트 공간 분리 |
| Mount namespace 등 | 보이는 파일시스템 구성 분리 |
| cgroups | CPU·메모리 등의 사용을 측정·제한 |
| capabilities·seccomp 등 | 허용할 특권·시스템 호출 범위 제한 |

`앱 → containerd → runc → 커널`을 모든 CPU 연산이나 네트워크 패킷이 통과하는 경로로 읽으면 안 된다. containerd와 runc는 **실행을 준비하는 제어 경로**이고, 실행된 앱은 그 뒤로 호스트 커널과 직접 시스템 호출을 주고받는다. 이어지는 5&#126;6장에서 네임스페이스와 cgroups를 자세히 본다.

---

## 핵심 요약

- 가상 머신은 하드웨어를 가상화해 각자 커널을 갖고, 컨테이너는 호스트 커널을 공유하는 프로세스 격리다. 컨테이너는 가볍고 빠르지만 격리 경계가 커널이다.
- `docker run`은 CLI → dockerd → containerd → shim → runc → 커널 순으로 전달된다.
- runc는 시작 시점에만 존재하며 `execve()`로 컨테이너 명령으로 바뀐 뒤 사라진다. shim이 컨테이너의 부모로 남아 입출력과 종료 코드를 처리한다.
- dockerd/containerd가 재시작되어도 shim 덕분에 실행 중인 컨테이너는 계속 산다. 계획된 데몬 업그레이드에는 `live-restore`를 켜 두면 더 확실하다.
- 이미지는 파일과 설정이고, 컨테이너는 그 이미지로 시작한 격리된 프로세스다. 빌드 도구와 실행 도구는 규격(OCI)으로 연결되므로 같지 않아도 된다.

## 확인 질문

1. VM과 컨테이너는 각각 무엇을 가상화/격리하며, 커널은 어떻게 다른가?
2. `docker run` 후 컨테이너가 실행 중일 때 `ps`에서 runc가 보이지 않는 이유는?
3. dockerd를 재시작해도 컨테이너가 죽지 않는 것은 어떤 구성 요소 덕분인가?

*원문 근거: kubernetes-textbook-main/01-쿠버네티스로-가는-길/02-컨테이너의-이해.md (2.1 컨테이너 vs 가상 머신); docker-fundamental/01_Docker_아키텍처_개관.md (1.2 전체 실행 경로, 1.3 shim, 1.4 프로세스 트리, 1.5 컴포넌트 역할 경계); docker-fundamental/07_Docker_Engine_API와_CLI.md (daemon.json — live-restore); kubernetes-qustion-book/01_기초/03_Docker_이미지에서_실행까지.md (1 Docker라는 말, 2 이미지의 정체, 4 두 경로 비교, 6 실제로 CPU에서 돌아가는 것, 7 shim 대응 관계)*
