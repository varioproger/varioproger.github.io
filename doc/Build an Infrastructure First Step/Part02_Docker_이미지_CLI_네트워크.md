---
title: "Part 02. Docker 이미지 관리 · 컨테이너 CLI · 네트워크 · Proxy"
parent: "Docker·K8s 인프라 구축 실습 순서"
nav_order: 2
---

# Part 02. Docker 이미지 관리 · 컨테이너 CLI · 네트워크 · Proxy

> 출처: Docker 컨테이너 빌드업! ch4(이미지 관리) / ch5(컨테이너 운용 CLI) / ch6(Docker network) 자료 027~039.
> 실습 환경: hostos1(192.168.56.101), hostos2(192.168.56.102), 사용자 kevin, Ubuntu 22.04 호스트. 이미지/컨테이너/Docker Hub 계정명(dbgurum 등)은 강의 예시 값이다.
> 참고: 처음에는 원본 PDF 텍스트 추출 시 한글이 일부 소실되어 영문/명령/도식 기준으로 정리했으나, 이후 PDF(027~039)를 페이지 이미지로 렌더링해 한글 본문(슬라이드 요약 + 강사 설명)을 직접 읽고 각 Step 의 `[원문 한글 자료 기반 보강 - 0NN]` 블록으로 보강/정정했다. 027~039 의 모든 페이지를 읽었다. (PDF 의 설명문은 영상 STT 기반 요약이므로 일부 고유명사는 "확정 아님"으로 표기했다.)

---

## 전체 구축 순서 (목차)

| Step | 주제 |
|---|---|
| 1 | Docker 이미지 이해와 구조 (pull / inspect / history / layer / UnionFS) |
| 2 | Docker Hub 로그인과 Access Token |
| 3 | 이미지 tag 와 Docker Hub push / 다른 호스트에서 pull |
| 4 | 이미지 save / load (파일 이전) 와 이미지·컨테이너 삭제 |
| 5 | Private Docker Registry 구성 |
| 6 | insecure-registries 설정과 Private Registry push / pull 실습 |
| 7 | 컨테이너 격리 기술 (chroot, namespace, overlay2) 과 lifecycle |
| 8 | 컨테이너 운용 CLI (1): 이미지 빌드, run 옵션, top / port / stats, cAdvisor, logs, inspect, cp |
| 9 | 컨테이너 운용 CLI (2): events, stop/pause, kill, attach/exec, diff, commit, export/import |
| 10 | 컨테이너 네트워크 이해 (docker0, CNM, veth, iptables, docker-proxy) |
| 11 | 사용자 정의 네트워크 생성 / 조회 / connect / disconnect |
| 12 | Docker DNS 와 --net-alias (Round Robin) |
| 13 | 컨테이너 Proxy 개념 (Forward / Reverse, Nginx, HAProxy L4/L7) |
| 14 | [실습] Nginx 를 활용한 Reverse Proxy / Load Balancing |
| 15 | [실습] HAProxy 를 활용한 Reverse Proxy (L7 URI 라우팅) |

---

## Step 1. Docker 이미지 이해와 구조

### [목적]
- 컨테이너 실행의 재료인 Docker image 가 무엇인지, 어떻게 받고(pull) 내부(메타 정보, Dockerfile 명령, layer)를 어떻게 확인하는지 익힌다.

### [이론 설명]
- **Docker image = 불변(Immutable), 읽기 전용(Read-Only)**. Container runtime 이 사용하는 stateless 한 실행 재료이며, 이미지 안에는 애플리케이션 실행에 필요한 package, library, source, 환경 설정이 들어 있다. 이미지를 수정하려면 Dockerfile 을 고쳐 새로 build 한다.
- **이미지 workflow**: Dockerfile 작성 -> `docker build` -> `docker images` 로 확인 -> `docker run`(또는 docker compose) 으로 실행 -> 태그(v1.0 -> v1.1 ...)로 버전 관리 -> Docker Hub / registry 에 `push`, 다른 호스트에서 `pull`. (GitHub 의 Dockerfile 을 `git clone` 받아 build 하는 방법도 있음. 실행 중 변경은 `docker commit` 으로 이미지화할 수 있으나, 원칙은 Dockerfile 수정 후 build.)
- 이미지 관련 명령 분류: build / save·load / ls·rm·tag·inspect·history / push·pull·search / run.
- **이미지 이름 구조**: `[registry]/[namespace]/name:[tag]`. 생략하면 `docker.io`(Docker Hub), `library`(공식 이미지), `latest` 가 기본값이다. Private registry(IP:5000), AWS ECR, Google GCR(gcr.io) 등은 주소를 명시해야 한다.
- **Layer**: pull 시 보이는 `Pull complete` 하나하나가 layer 이다. 이미 로컬에 있는 layer 는 `Already exists` 로 재사용(저장공간·다운로드 절약). 예) httpd:2.4 는 실제로 5개 layer(그중 첫 layer 는 `Already exists`). (OS layer 3 + httpd + 웹소스 구성은 강사가 개념 설명용으로 든 슬라이드 예시이며 실제 pull layer 내용과 1:1 대응이 아니다.) layer 는 `/var/lib/docker` 아래 overlay2 에 저장된다.
- **UnionFS(UFS)**: 여러 read-only layer 를 하나의 파일시스템처럼 합쳐 보여주는 기술. `docker run` 시 이미지 layer 위에 **read-write container layer** 가 하나 추가된다. 컨테이너를 삭제하면 이 layer 가 사라지며(저장하려면 `docker commit`), inspect 의 GraphDriver 에 보이는 LowerDir / UpperDir / MergedDir / WorkDir 가 이 구조이다.
- inspect 와 history 의 차이: inspect 는 이미지의 최종 메타정보(ID, 태그, 생성일, ContainerConfig, GraphDriver, RootFS 등), history 는 Dockerfile 에 해당하는 빌드 단계(명령)별 이력을 보여준다.

**[원문 한글 자료 기반 보강 - 027 Clip 1]**
- **Registry / Repository**: registry 는 이미지를 저장·배포하는 서버(예: Docker Hub), 그 안에 이미지 이름별로 묶인 저장 공간이 repository. 강사는 이미지를 "다운로드(pull)/업로드(push)" 할 수 있는 곳을 보통 registry 라고 부른다고 설명한다. 4장 구성: Clip1 이미지 이해/구조 확인, Clip2 Docker Hub repositories 에 image push(tag, login), Clip3 docker registry 구성과 관리, Clip4 registry 를 이용한 image upload/download 실습.
- **이미지 = 컨테이너의 인프라**. 슬라이드 문구: "docker image 는 Container runtime 에 필요한 바이너리, 라이브러리 및 설정 값 등을 포함하고, 변경되는 상태 값을 보유하지 않고(stateless) 변하지 않는다(Immutable, RO)". 컨테이너가 동작하려면 필요한 애플리케이션/패키지/라이브러리/환경 변수를 담은 그릇이 이미지이며, 받은 이미지든 직접 build 한 이미지든 **기존 이미지를 직접 수정할 수는 없다**.
- **"그럼 이미지는 수정할 수 없나?"** - 이미지 자체는 수정 불가이나, (1) 이미지를 컨테이너로 만들고 (2) 그 컨테이너에서 변경을 적용한 뒤 (3) 그 결과로 **새 이미지**를 만드는 것은 가능하다(= `docker commit`, 또는 Dockerfile 로 다시 build). "기존 이미지는 수정되지 않고, 변경 사항은 새 이미지로 만든다."
- **일반적인 컨테이너 애플리케이션 서비스 개발 과정(슬라이드 8단계 도표)**: (1) 애플리케이션 코드 개발 -> (2) 베이스 이미지를 이용한 Dockerfile 작성(베이스 이미지, OS 환경, 필요한 라이브러리·바이너리·패키지·환경 변수) -> (3) `docker build` 로 새 이미지 생성(`docker images` 로 조회) -> (4-1) 생성된 이미지로 컨테이너 실행(빌드가 성공해도 반드시 `docker run` 으로 정상 동작 확인) / (4-2) docker compose 를 이용한 다중 컨테이너 실행 -> (5) 서비스 테스트(이미지가 만들어지는 것과 "구동"은 별개이므로 잘못된 설정은 run 단계에서 드러남) -> (6) 로컬 및 원격 저장소에 이미지 저장(push) -> (7) GitHub 등으로 Dockerfile 관리(이미지 대신 Dockerfile 과 웹소스를 GitHub 에 공유, `git clone` 으로 받아 build) -> (8) 동일 환경에서 지속적 개발·업데이트(v1.0 -> 1.1 -> 1.2 ..., 구조가 크게 바뀌면 2.1, 2.2 ...). 업데이트 버전을 만드는 방법은 두 가지: 컨테이너를 돌려 내부 변경 후 `docker commit` 하거나, Dockerfile 을 고쳐 다시 build. 이 전 과정을 자동화(통합·배포·전달)하는 것이 CI/CD 로 이어진다.
- **이미지 관련 명령 workflow 그림**: build(Dockerfile -> 이미지) / ls·rm·tag·inspect·history / save·load(파일 저장/복원) / pull·push·search / run / Automated Build(GitHub 의 Dockerfile 로 Docker Hub 가 자동 빌드). 강사: "이미지는 반드시 run 이 돼야 쓸모가 있고, run 이 안 되는 이미지는 가치가 없다." 이 clip 은 이미 가진 이미지의 조회·내부 구조 파악과 registry 에서 내려받기(pull)에 초점.
- **pull 시 주소 표기**: 이미지 이름에 주소를 생략해도 되는 것은 기본 registry 주소(`docker.io/library/`)가 이미 기본값으로 포함되어 있기 때문. 태그를 생략하면 무조건 최신(latest). 다른 경로(private registry, ECR/GCR 등)에서 받을 때는 **반드시 앞단에 주소를 명시**해야 하며, 이 주소는 뒤에서 배울 push(tag + login) 때 이미지 이름에 그대로 붙이는 주소이기도 하다. 로컬 registry 의 기본 포트는 5000. 예) `gcr.io/google-samples/hello-app:1.0` 은 구글 GCR 이 공개한 이미지.
- **`docker image` 를 빼고 `docker inspect` 만 쓰면 컨테이너 inspect 가 되므로**, 이미지 대상은 반드시 `docker image inspect` 라고 쓴다.
- **inspect 주요 정보 -> JSON 키**: image ID `Id`, 생성일 `Created`, Docker 버전 `DockerVersion`, CPU 아키텍처 `Architecture`, 이미지 다이제스트 `RootFS`/`RepoDigests`, 레이어 저장 정보 `GraphDriver`. `Id` 는 sha256 해시값으로 된 이름표, `RepoTags` 는 리파지토리 주소(httpd:2.4), `RepoDigests` 는 다이제스트 값(이미지가 /var/lib/docker 의 도커 전용 영역에 저장되므로 이 값으로 구분), `Created` 는 이미지가 만들어진 시점.
- **inspect 에 "Container" / Hostname 이 나오는 이유(이미지 불변의 법칙의 흔적)**: 이미지는 수정되지 않으므로 Dockerfile 로 빌드할 때 (베이스 이미지를 컨테이너로 만들어 -> COPY/패키지 설치/환경 값 적용 -> `docker commit` 에 해당하는 과정으로 새 이미지 생성)을 Dockerfile 의 **라인(step) 수만큼 반복**한다("이미지 -> 컨테이너 -> 이미지 -> 컨테이너 ..."). 그 최종 컨테이너의 ID 가 흔적으로 남아 ContainerConfig 의 Hostname 으로 보인다.
- **ExposedPorts / Env / Cmd**: httpd 는 `{"80/tcp": {}}` 로 80 포트 노출, Env 에 PATH(/usr/local/apache2/bin ...), HTTPD_PREFIX=/usr/local/apache2, HTTPD_VERSION=2.4.57, HTTPD_SHA256, HTTPD_PATCHES. `Cmd: ["httpd-foreground"]` 는 컨테이너로 돌릴 때 httpd 데몬을 **포그라운드**로 실행하겠다는 의미. **이미지는 정적, 컨테이너는 동적**이므로, 정적 이미지가 동적 컨테이너로 바뀔 때 무엇이 동작할지 정해 둔 부분이 CMD 이다(메인 프로세스가 종료되면 컨테이너도 종료되므로 웹서버를 포그라운드로 실행).
- **GraphDriver / RootFS**: Architecture "amd64", Os "linux", 예시 Size 145187511(바이트). GraphDriver 는 이미지가 layer 구조이며 각 layer 가 하단의 어떤 경로에 저장되는지 알려 주며 이름은 `overlay2`, 경로는 LowerDir / MergedDir / UpperDir / WorkDir (`/var/lib/docker/overlay2/...`). 처음 받은 httpd 는 총 5개 layer 이고 RootFS Layers 에 sha256 값 5개로 표현된다. 5개 layer 를 실제 컨테이너로 돌릴 때는 각각 쓰는 게 아니라 **하나로 합쳐서** 쓰며, MergedDir 이 합쳐 놓은 이미지의 경로이고, 변경이 발생하면 diff(Upper) 쪽에 기록된다.
- **--format**: inspect 결과가 매우 길 때 필요한 값만 뽑는 옵션. JSON 트리 구조의 키 경로를 점(.)으로 연결해 `{{ }}` 안에 쓰고, 두 가지를 함께 보려면 하나의 `--format` 문자열 안에 `{{ }}` 를 나란히 쓴다.
- **history 와 inspect 의 역할 구분**: inspect 는 이미지의 현재 구성(ID, 환경 변수, 포트, layer 저장 정보 등), history 는 이미지를 만든 배경(Dockerfile 의 어떤 키워드가 쓰였는지)을 알려 준다. history 는 Dockerfile 이 만들어낼 때 CMD, EXPOSE, COPY, ENV, WORKDIR 같은 키워드의 파라미터가 흔적으로 남으므로 이를 확인할 수 있다. 맨 위(최신)가 CMD ["httpd-foreground"], EXPOSE 80, COPY, ENV, WORKDIR ... 순으로 아래로 갈수록 오래된 단계이고, 맨 아래 `ADD file:...` 80.5MB 는 베이스 OS(Debian) 이미지의 layer. **포트를 사용하는 이미지는 반드시 EXPOSE 정보를 확인하라**고 강사는 당부한다. `<missing>` 은 중간 단계 이미지 ID 가 로컬에 없다는 표시.
- **Dockerfile 확인법**: Docker Hub(hub.docker.com)에 로그인해 httpd 검색 -> 2.4 태그 클릭 -> 연결된 GitHub(docker-library/httpd 2.4/Dockerfile) 에서 `FROM debian:bullseye-slim`(Debian bullseye slim 베이스), 아파치 설치용 라이브러리, ENV HTTPD_VERSION 2.4.57, EXPOSE 80, CMD ["httpd-foreground"] 를 확인. 강사: 나중에 Dockerfile 을 직접 만들 때는 **공식 이미지의 Dockerfile 을 참고**하면 된다. 새로운 이미지를 처음 가져다 쓸 때는 반드시 이런 정보를 파악하라.
- **layer 개념 예시(슬라이드 [example], 개념 설명용이며 실제 pull 결과의 내용 대응은 아님)**: 하위 세 계층은 Debian 리눅스에 아파치를 깔고 환경 변수를 정의한 layer(OS 계층), 그 위에 아파치(httpd) 서버 layer, 맨 위에 신규 웹소스를 적용한 웹소스 layer 로 구성. "이미지는 불변이므로 layer 는 바뀌지 않고 위에 쌓인다" - 기존 layer 는 바꿀 수 없고 그 위에 패키지를 설치하거나 파일을 COPY, 웹소스를 넣으면 **신규 layer 가 위에 쌓인다**. layer 구조의 장점 두 가지: (1) 이미 받은 layer 를 **재활용**해 공간 효율이 좋다. (2) 언제든 layer 를 **교체해서 조립**하듯 쓸 수 있다.
- **컨테이너 layer 와 UnionFS**: 슬라이드: "이미지는 불변이며 read only 형태로 만들어지고, `docker run` 명령으로 컨테이너를 생성하면 [Container layer]가 read write 로 추가된다." 변경 후 컨테이너를 그냥 stop 하면 이미지에는 전혀 적용되지 않고 그 컨테이너에서만 사용된 것으로 끝나므로, 변경 정보를 포함한 **신규 이미지**를 만들려면 `docker commit`. 여러 layer 를 하나의 FS 로 사용하게 해 주는 기능이 UFS(Union File System) - 앞의 inspect 에서 본 MergedDir 이 이렇게 합쳐진 결과의 경로. (강사가 "스냅샷"이라고 표현했다는 STT 기록이 있으나 정확한 표현은 불확실.)
- 영상 구성 메모: busybox 는 4.86MB, `gcr.io/google-samples/hello-app:1.0` 은 26.8MB 로 확인. (CHEAT SHEET) 셀프 체크: Immutable/Read-Only 의 의미와 "수정" 절차, pull 시 tag 생략 때의 기본 태그와 마지막 줄 전체 주소, 기본 registry 가 아닌 곳 지정법(로컬 registry 기본 포트 5000), CREATED 의 의미, inspect 의 Container/Hostname 이유, `--format` 으로 Os·ExposedPorts 한 번에 보기, history vs inspect 와 `--no-trunc`, "Already exists" 의미, layer 저장 경로와 read-write layer 반영 명령(`docker commit`).

### [사용한 CLI]

**1) 이미지 pull (기본 형식과 다양한 표기)**
```bash
# docker [image] pull [options] name[:tag]
docker pull debian[:latest]                         # 기본값: docker.io, tag=latest
docker pull library/debian:10
docker pull docker.io/library/debian:10             # 전체 경로 (위 두 개와 동일)
docker pull index.docker.io/library/debian:10
# private registry / 타 클라우드 registry
docker pull 192.168.56.101:5000/debian:10
docker pull gcr.io/google-samples/hello-app:1.0

docker pull busybox            # "Using default tag: latest" 출력, Pull complete = layer 다운로드
docker pull httpd:2.4          # 5 layer, 일부 "Already exists"
docker images                  # 로컬 이미지 목록 (busybox 4.86MB, hello-app 26.8MB 등)
```
- 출력 예: `Digest: sha256:...`, `Status: Downloaded newer image for busybox:latest`.

**2) 이미지 상세 정보: inspect**
```bash
docker image inspect httpd:2.4      # JSON 출력
# 주요 항목: Id, RepoTags, RepoDigests, Created, ContainerConfig(Hostname, ExposedPorts, Env, Cmd),
#            DockerVersion, Architecture, Os, Size, GraphDriver(overlay2), RootFS(Layers)

# --format : Go template 로 특정 항목만 추출
docker image inspect --format="{{.Os}}" httpd:2.4                                  # linux
docker image inspect --format="{{.ContainerConfig.ExposedPorts}}" httpd:2.4        # map[80/tcp:{}]
docker image inspect --format="{{.ContainerConfig.ExposedPorts}} {{.Os}}" httpd:2.4
```
- 자료 설명: ExposedPorts `80/tcp`, Env(PATH, HTTPD_PREFIX=/usr/local/apache2, HTTPD_VERSION=2.4.57 등), Cmd `["httpd-foreground"]`. ContainerConfig 의 `Container`/Hostname 은 이미지를 만들 때 사용된 임시 컨테이너 ID 의 흔적이다.

**3) 이미지 이력: history**
```bash
docker image history httpd:2.4                              # CREATED BY 가 "..." 로 잘림
docker image history httpd:2.4 --no-trunc                   # 잘림 없이 전체 명령 출력
docker image history httpd:2.4 --no-trunc > httpd24.txt     # 파일로 저장해 확인
```
- `<missing>` 는 중간 layer 의 이미지 ID 가 로컬에 없다는 뜻. 하단의 `ADD file:...` (80.5MB)은 기반 OS(Debian) layer. CMD / EXPOSE / COPY / ENV / WORKDIR 등 Dockerfile 명령이 역순(최신이 위)으로 보인다.
- Docker Hub 의 이미지 상세 / GitHub(docker-library/httpd 2.4/Dockerfile)에서 원본 Dockerfile(`FROM debian:bullseye-slim` ...)을 확인할 수 있다.

**4) layer 저장 위치 확인 (root 필요)**
```bash
sudo su -
cd /var/lib/docker/image/overlay2/distribution/diffid-by-digest/sha256/
ls 49d*      # pull 시 출력된 layer ID 로 시작하는 파일 확인
ls 52a*
ls e3*
```

### [확인 방법/주의점]
- `docker pull` 출력의 `Pull complete` / `Already exists` 로 layer 재사용 여부를 확인한다.
- `docker images` 의 CREATED 는 "이미지가 만들어진 시점"이지 pull 시점이 아니다 (예: busybox 2 weeks ago). 강사 설명: 내려받은 시각이 아니라 **원본 제작자가 만들었거나 업데이트한 시점**.
- `docker image history` 결과의 CREATED BY 는 `...` 로 잘리므로 전체를 보려면 `--no-trunc`. 출력이 길어 화면으로는 의미가 없으므로 `> httpd24.txt` 로 리다이렉트해 텍스트 파일로 확인(강사 방법).
- `docker inspect` 만 쓰면 컨테이너 대상이 되므로 이미지는 `docker image inspect` 로 쓴다.
- 이미지를 pull 하면 /var/lib/docker/image/overlay2/distribution/diffid-by-digest/sha256/ 에 layer 별 sha256 이름의 파일로 분산 저장된다. 앞 pull 결과의 layer 식별자(49d, 52a, e3 ...)로 `ls 49d*` 처럼 조회하면 실제 sha256 이름의 파일이 나타난다(root 권한 필요).
- `/var/lib/docker` 하위는 root 권한이 필요하므로 `sudo su -` 로 전환.
- 이미지는 변경 불가가 원칙: 필요한 변경은 Dockerfile 수정 후 build, 태그(버전)로 관리.

---

## Step 2. Docker Hub 로그인과 Access Token

### [목적]
- Docker Hub(public registry)에 이미지를 올리기 위한 인증(login)을 수행하고, 비밀번호 대신 Access Token 으로 안전하게 로그인한다.

### [이론 설명]
- **registry**: Dockerfile / docker commit 으로 만든 이미지를 저장하는 서버(저장소). Public(예: hub.docker.com)과 Private registry 가 있다. `docker push` 하려면 `docker login` 후 이미지 이름을 `계정/이미지:태그` 형태로 `docker tag` 해야 한다.
- 로그인 시 자격 증명은 `~/.docker/config.json` 에 **암호화되지 않고(base64 인코딩)** 저장된다는 WARNING 이 나온다. base64 는 암호화가 아니라 단순 인코딩이므로 `base64 -d` 로 복원된다 -> 작업 후 `docker logout` 권장.
- **Access Token**: 비밀번호 대신 쓰는 토큰. Docker Hub > Account Settings > Security > New Access Token. Description 입력, 권한 Read / Write / Delete 선택 후 Generate -> Copy and Close (토큰은 생성 시 한 번만 표시). Token 은 Active / Inactive 로 관리하며 Inactive 로 바꾸면 로그인 시 `unauthorized` 오류가 난다. (정정: 이전 문서의 "2단계 인증 활성화 필요" 는 자료에서 확인되지 않는다. Security 화면에 Access Tokens 영역의 New Access Token 버튼과, 그 아래 별도로 Enable Two-Factor Authentication 버튼이 있을 뿐이다.)

**[원문 한글 자료 기반 보강 - 028 Clip 2]**
- **registry 란**: Dockerfile 로 만든 이미지나 `docker commit` 으로 만든 이미지를 저장해 두는 곳. 누구나 받을 수 있는 **Public registry** 와 회사 내부에서만 접근하도록 한 **Private registry** 가 있다. 이번 실습은 Docker 제공 hub.docker.com 사용. 베이스 이미지(nginx 같은 것)는 굳이 따로 올릴 필요가 없고, Dockerfile 이나 `docker commit` 으로 새로 만든 이미지를 **보관·백업**하는 용도로 registry 를 주로 쓴다.
- **`docker push` 전에 필요한 두 단계(슬라이드)**: 1) `docker login` - hub.docker.com 에 가입한 본인 ID 와 암호로 현재 로컬에 계정을 등록(해제는 `docker logout`, 강사는 이것을 "본인 인증 과정"이라 표현). 2) `docker tag` - hub.docker.com 의 본인 계정 Repositories 에 넣기 위한 태그를 붙임. 강사는 이를 "주소 달기"에 비유: **계정명/** 아래에 이미지 이름을 쓰고 콜론 뒤에 태그(버전이나 OS 특징 등). Docker Hub 에는 수많은 사용자가 있으므로 "누구의 계정 밑에 저장할지"를 이미지 이름 앞에 계정명/ 으로 적어 주어야 올바른 곳에 저장된다.
- **Docker 의 로그인(접근) 방법은 세 가지**: 비밀번호, 토큰, 그리고 OTP 같은 별도 요소를 함께 쓰는 2단계 인증(Two-Factor Authentication). 강사는 비밀번호와 토큰 두 가지를 시연.
- **경고 "unencrypted" 의 의미**: "당신의 암호는 /home/kevin/.docker/config.json 에 암호화되지 않은(unencrypted) 상태로 저장된다". cat 으로 열어 보면 암호처럼 보이는 문자열이지만 실제로는 암호화가 아니라 **base64 인코딩**이다. 강사는 `echo 'welcome fastcampus' | base64` -> `base64 -d` 로 인코딩/디코딩을 시연하며 이것이 "보안상 취약하다"고 짚었다. **다른 사람의 자리·공용 서버에서 login 했다면 반드시 `docker logout` 으로 인증을 해제**하라고 권했다.
- **Access Token(토큰)**: 비밀번호 대신 쓸 수 있는 "대체 암호"로, 여러 개를 만들 수 있고 언제든지 접근 권한을 회수(비활성화·삭제)할 수 있다. 생성 위치: 오른쪽 위 본인 계정 클릭 -> Account Settings -> 왼쪽 Security -> Access Tokens 의 New Access Token. Access Token Description 은 자유롭게 기재(강사: "docker project"), Access permissions 기본값은 Read, Write, Delete(읽기 전용 권한으로 만들면 그 토큰으로 로그인한 사용자는 읽기만 가능). **Generate 를 누르면 토큰 값이 한 번만 보이므로 Copy and Close 로 복사**한다. 이 값은 비밀번호처럼 공개되면 안 되므로 강사는 시연 후 삭제한다고 했다(문서에도 값은 적지 않음).
- **토큰 파일 로그인**: 홈 디렉터리 등 원하는 위치에 `.access_token` 파일을 만들어 토큰 저장 -> `cat .access_token | docker login --username 계정 --password-stdin`. `--password-stdin` 은 "비밀번호를 표준 입력(stdin)으로 받겠다"는 뜻으로, 파이프(|)로 넘겨 준 .access_token 파일의 내용이 비밀번호 역할을 한다. 성공 후에도 같은 "unencrypted" 경고가 나오며, config.json 의 `auths` 안 base64 값은 이제 이 토큰의 인코딩 값이다.
- **토큰을 Inactive 로 바꾸면 로그인이 막힌다**: 토큰 파일을 홈에 두었으니 내가 자리를 비운 사이 누군가 같은 방법으로 로그인할 수 있다는 것이 강사의 걱정. 먼저 `docker logout` 후 웹의 Docker Hub 토큰 관리에서 토큰의 Edit -> Inactive -> Save. Inactive 상태에서는 위처럼 `unauthorized` 오류가 나고, 다시 Active 로 바꾸고 저장하면 같은 명령이 `Login Succeeded`. 강사는 push 실습을 위해 `docker logout` 후 **암호 방식으로 다시 login** 했으며, 로그인 후에는 언제나 `docker info` 로 확인하라고 강조.

### [사용한 CLI]
```bash
# 대화형 로그인 (Username / Password 입력)
docker login
#   WARNING! Your password will be stored unencrypted in /home/kevin/.docker/config.json.
#   Login Succeeded

# 로그인 확인
docker info | grep Username          # Username: dbgurum

# base64 가 암호화가 아님을 확인
echo 'welcome fastcampus' | base64               # d2VsY29tZSBmYXN0Y2FtcHVzCg==
echo d2VsY29tZSBmYXN0Y2FtcHVzCg== | base64 -d    # welcome fastcampus

# 로그아웃 (config.json 의 자격 정보 제거)
docker logout                        # Removing login credentials for https://index.docker.io/v1/
docker info | grep Username          # (출력 없음)
```

**Access Token 으로 로그인**
```bash
vi .access_token                     # 발급받은 토큰(dckr_pat_...) 한 줄 저장
cat .access_token | docker login --username dbgurum --password-stdin
#   --username       : Docker Hub 계정
#   --password-stdin : 비밀번호(토큰)를 표준입력(파이프)으로 전달 -> 명령 이력/화면에 노출 방지
docker info | grep Username
cat /home/kevin/.docker/config.json  # "auths" 항목(auth 값은 base64) 확인
```
- Token 을 Inactive 로 바꾼 뒤 로그인하면 `Error response from daemon: Get "https://registry-1.docker.io/v2/": unauthorized: incorrect username or password`. 다시 Active 로 바꾸면 `Login Succeeded`.

### [확인 방법/주의점]
- `Login Succeeded` 와 `docker info | grep Username` 으로 확인.
- config.json 은 평문(base64) 저장이므로 공용 서버에서는 작업 후 반드시 `docker logout`. 토큰 파일 관리 주의.
- 토큰이 노출되면 Docker Hub 에서 Inactive 처리 / 삭제.
- (강사 주의) 비밀번호 방식은 base64 로 쉽게 복원 가능하므로 취약 -> 공용 서버 사용 후 `docker logout`. 토큰 파일(.access_token)을 홈에 방치하면 자리를 비운 사이 누군가 같은 방법으로 로그인할 수 있다. 토큰 값은 생성 시 한 번만 표시되므로 복사해 두고, 문서/공개 영상에 노출 금지(마스킹).
- 로그인 후에는 언제나 `docker info | grep Username` 으로 로그인 계정을 확인.

---

## Step 3. 이미지 tag 와 Docker Hub push / 다른 호스트에서 pull

### [목적]
- 로컬 이미지를 Docker Hub 저장소에 올리고(push), 다른 호스트(hostos2)에서 내려받아(pull) 실행한다.

### [이론 설명]
- push 대상 이름은 `<Docker Hub 계정>/<repository>:<tag>` 이어야 하므로 `docker image tag` 로 **같은 이미지에 새 이름(별칭)** 을 붙인다. tag 는 복사가 아니라 같은 IMAGE ID 를 가리키는 이름 추가이다.
- push 시 `Pushed` 는 새로 올린 layer, `Layer already exists` 는 Hub 에 이미 있는 layer 이다. 마지막 `digest` 가 해당 태그의 고유 식별값.
- Docker Hub 저장소는 기본 Public 이며, Create repository 에서 Visibility 를 Private 로 만들 수 있다(무료 계정은 private 개수 제한). Docker Hub 의 안내: `docker tag local-image:tagname new-repo:tagname`, `docker push new-repo:tagname`.
- 이미지 공유 방법 3가지: (1) Docker Hub 등 registry push, (2) Dockerfile 을 GitHub 에 올려 받아 build, (3) `docker save` / `load` 로 파일 전달.

**[원문 한글 자료 기반 보강 - 028 Clip 2]**
- 예제 이미지: `myweb:v1.0` 은 파일 복사(copy)로 만든 이미지(2장에서 제작), `myweb:v1.1` 은 그것을 hub 에서 공유받았다는 전제로 다시 빌드해 만든 버전(강사 설명).
- 태그 명령은 대상이 이미지뿐이라 `image` 를 생략(`docker tag`)해도 되지만, 이미지 관련 명령에는 `docker image ...` 를 명시하는 것을 권장한다고 강사가 말했다. Repositories 에 올리려면 이미지명 앞에 **본인 계정명**을 붙여야 하며 로그인한 계정과 일치하는 리파지토리로 업로드된다. **태그는 주소(이름)를 달아 줄 뿐이므로 이미지 ID 는 바뀌지 않는다**(예: myweb:v1.0 과 dbgurum/myweb:v1.0 이 같은 IMAGE ID 34d2c432bcb3 -> 새 이미지가 생긴 것이 아니라 이름표가 하나 더 붙은 것).
- push 출력의 `Pushed` 는 새로 올린 layer, `Layer already exists` 는 Docker Hub 에 이미 같은 layer 가 있어 다시 올리지 않았다는 뜻. 마지막 줄의 digest 는 올라간 이미지를 식별하는 해시값.
- **Docker Hub 웹에서 확인**: 웹에서 myweb 리파지토리를 따로 만든 적이 없는데도 push 하면 `계정명/myweb` 리파지토리가 **자동으로 생성**된다. 자동 생성된 리파지토리는 **Public**(누구나 받을 수 있음). Private 이 필요하면 웹의 Create repository 에서 이름을 넣고 Visibility 를 Private 으로 선택해 만든다. **계정당 Private 리파지토리는 하나만 만들 수 있다**(강사). Create repository 화면의 Pro tip 에도 `docker tag local-image:tagname new-repo:tagname`, `docker push new-repo:tagname` 형식이 안내된다. 절차 요약: **login -> tag(꼬리표 달기) -> push**.
- v1.1 도 같은 방식으로 tag + push 하면 리파지토리의 Tags 에 v1.1 이 "a few seconds ago" 로 추가된다(이 리파지토리의 태그가 5개가 됨).
- **다른 서버(hostos2)에서 검증**: 강사 말: "이미지는 컨테이너를 목적으로 하기 때문에 컨테이너가 돌아가지 않는 이미지는 의미가 없다." hostos2 는 hostos1 을 복제한 뒤 호스트 이름과 IP 만 바꾼 서버. hostos2 에서는 **로그인 없이(익명 상태로) pull** 이 되었다(Public 리파지토리이기 때문). 이어 `docker run -d -p 9001:80` -> `docker ps` 로 포트 확인 -> `curl localhost:9001` 로 서비스 응답 확인. 올라간 이미지가 정상이라고 보장할 수 없으니 항상 이런 확인 작업을 하라고 당부.
- **이미지 공유 방법 3가지(슬라이드 정리)**: ① registry 에 push 하여 공유(방금 실습한 hub.docker.com 방식) ② Dockerfile 과 소스를 GitHub 에 올려 공유(받는 사람이 직접 build) ③ `docker save` 로 파일 백업 후 전달, `docker load` 로 공유(이미지를 tar 파일로 만들어 서버 간 이전).

### [사용한 CLI]
```bash
# (hostos1) 이미지 확인 후 tag -> push
docker images
docker info | grep Username                         # dbgurum 로그인 상태 확인
docker image tag myweb:v1.0 dbgurum/myweb:v1.0      # docker image tag <원본:태그> <계정/이름:태그>
docker images | grep myweb                          # 두 이름의 IMAGE ID 가 동일함(34d2c432bcb3)
docker push dbgurum/myweb:v1.0
#   The push refers to repository [docker.io/dbgurum/myweb]
#   f9f93473fc62: Pushed / 8d68b6b128f7: Layer already exists
#   v1.0: digest: sha256:13d3bf... size: 2198

# 다른 버전도 동일하게
docker image tag myweb:v1.1 dbgurum/myweb:v1.1
docker push dbgurum/myweb:v1.1
```

```bash
# (hostos2, 192.168.56.102) 다른 호스트에서 pull 후 실행
hostname                                        # hostos2
docker pull dbgurum/myweb:v1.0                  # Public 저장소이므로 로그인 없이 pull 가능
docker images | grep myweb
docker run -d -p 9001:80 dbgurum/myweb:v1.0     # -d 백그라운드, -p 호스트9001:컨테이너80
docker ps                                       # 9001 포트 매핑 확인
curl localhost:9001
```

### [확인 방법/주의점]
- `docker images | grep myweb` 에서 원본과 새 이름의 IMAGE ID 일치 확인.
- Docker Hub 웹의 Repositories > Tags 에 push 한 태그가 표시되는지 확인.
- push 전에 `docker login` 상태여야 한다. Public 저장소는 누구나 pull 가능하므로 민감한 이미지는 Private 로 생성.

---

## Step 4. 이미지 save / load (파일 이전) 와 이미지·컨테이너 삭제

### [목적]
- registry 없이 이미지를 tar 파일로 저장해 다른 서버로 옮기고(save/load), 불필요한 이미지와 컨테이너를 정리한다.

### [이론 설명]
- `docker image save` 는 이미지(layer 포함)를 tar 로 저장, `docker image load` 는 tar 에서 이미지를 복원한다. `| gzip`, `| bzip2` 로 압축하면 용량이 줄어든다(예: phpserver:1.0 tar 331M, gzip 102M, bzip2 93M). 압축 파일도 load 가 바로 읽는다.
- 이미지 삭제: `docker image rm` = `docker rmi` (rmi = rm image). 형식 `docker rmi [옵션] {이름[:태그] | ID}`.
- 같은 IMAGE ID 에 태그가 여러 개일 때 하나를 지우면 `Untagged` 만 되고, 마지막 태그를 지울 때 `Deleted` 된다.
- 해당 이미지를 쓰는 컨테이너가 있으면 `conflict: unable to remove repository reference ... (must force) - container ... is using its referenced image` 오류 -> **컨테이너 stop -> rm 후 이미지 삭제**.
- 일괄 삭제는 `$( ... )` 명령 치환을 활용하고, Exited 컨테이너 정리는 alias 로 만들어 둔다.

**[원문 한글 자료 기반 보강 - 028 Clip 2]**
- **save/load 개념**: 이미지는 레이어(Layer) 구조의 파일이며, 그 파일들을 직접 저장하는 명령이 `docker save`. 예: 1번 서버의 이미지를 2번 서버로 옮길 때 `docker save` 로 파일을 받고, 2번 서버에서 `docker load` 로 등록. (강사는 실습 준비로 2번 서버 이미지를 rmi 로 지웠는데, myweb:v1.1 은 연결된 컨테이너가 있어 conflict 로 삭제되지 않았고 myweb:v1.0 은 "Untagged: myweb:v1.0" 으로 태그만 제거되었다.)
- **save 규칙**: ① 왜 `.tar` 인가 - 이미지는 여러 계층으로 되어 있어 계층 구조를 하나의 파일로 묶는(tar) 저장. ② **압축은 파이프로 직접 붙여야 한다** - 파일 이름만 .tar.gz / .tar.bz2 로 쓰면 실제로는 압축 없는 tar 만 만들어지고 압축은 수행되지 않는다. 그래서 `| gzip`, `| bzip2` 를 함께 쓴다. phpserver:1.0 은 tar 331M -> gzip 약 100M(슬라이드 102M) -> bzip2 93M 로 줄었다(강사: "gzip 과 bzip2 는 대략 10% 정도 압축률 차이"). phpserver:1.0 은 강사의 GitHub 소스로 빌드한 이미지(빌드 실습은 별도).
- **전송과 load**: `scp` 는 다른 서버로 파일을 안전하게 복사하는 명령(2번 서버에 backup 경로가 있다고 가정). **load 는 압축 종류와 상관없이** 역방향 리다이렉션(`<`)으로 tar.gz / tar.bz2 파일을 그대로 넘기면 된다(save 할 때와 달리 gzip 같은 명령을 따로 붙일 필요 없음). 로드되면 묶여 있던 레이어들이 화면에 나열되고 `phpserver:1.0` 이미지가 등록된다. 컨테이너로 실행하고 curl 로 결과까지 확인하는 절차를 거친다.
- **이미지 삭제 배경**: Docker Hub 에서 받은 이미지는 종류에 따라 작게는 몇 MB(강사 예: 알파인 리눅스 계열)부터 크게는 몇 GB(머신러닝 관련 패키지, 예: TensorFlow 계열은 2GB 이상도 많다)까지 다양하다. 계속 내려받기만 하면 로컬 서버의 저장 공간이 부족해질 수 있으므로, `docker image save` 로 백업하거나 주기적으로 업무에 쓰는 이미지와 안 쓰는 이미지를 구분해 **불필요한 이미지를 삭제**하는 것이 좋다. `rmi` 는 "rm image" 의 줄임으로 `docker image rm` 과 같은 기능의 옵션(별칭).
- **$( ... ) 는 셸의 "명령 치환" 기능**: 괄호 안 명령의 결과가 바깥 명령의 인자로 들어간다(강사: "리눅스 쉘 기능"). `docker images -q` 는 이미지 ID 만 출력, 이를 rmi 에 넘겨 전체 삭제. `grep debian` 은 debian 이 들어간 것만, `grep -v centos` 의 `-v` 는 제외(centos 를 뺀 나머지). 슬라이드의 grep 예시는 결과를 인자로 넘기면 ID 열 외의 열도 같이 들어가므로 실제로는 awk '{print $3}' 등으로 ID 열만 뽑는 경우가 많다(영상 밖 보충). 삭제 명령은 되돌릴 수 없으므로 먼저 `$( )` 안쪽 명령만 실행해 대상이 무엇인지 확인하는 습관이 안전하다.
- **컨테이너가 쓰고 있는 이미지는 지워지지 않는다(라이브 시연)**: 이미지는 컨테이너의 "모체". 컨테이너는 이미지를 기준으로 **스냅샷**을 만들고 그 위에 프로세스 레이어를 붙인 구조이므로, 컨테이너가 이미지를 사용 중이면 그 이미지는 삭제할 수 없다. 삭제 전에 연결된 컨테이너가 있는지 확인한다. 시연: `docker run -d -p 8001:80 --name=myweb myweb:v1.0` 후 `docker image rm myweb:v1.0` 은 "Untagged: myweb:v1.0" 만 되고, `docker image rm dbgurum/myweb:v1.0` 은 conflict 오류. "myweb:v1.0 을 지웠는데 왜 지워졌을까?" - 같은 IMAGE ID(34d2c432bcb3)에 붙은 이름표가 dbgurum/myweb:v1.0 으로 하나 더 남아 있었기 때문에 이름표 하나만 지워진(Untagged) 것이다(다른 이름표가 없었다면 그 시점에 바로 오류). conflict 오류의 `container f48bc3e3f239 is using its referenced image 34d2c432bcb3` 는 "이미지는 리파지토리 이름이 아니라 **이미지 ID 를 기준으로** 판단"된다는 뜻.
- **stop 만으로는 부족하고 rm 까지 해야 한다**: `docker stop` 은 실행 중인 **프로세스**만 멈춘다. 컨테이너가 남아 있는 한 이미지의 **스냅샷**이 남아 있어 여전히 이미지를 참조한다. `docker rm` 으로 컨테이너(스냅샷)까지 제거해야 이미지 삭제가 가능(각각 "프로세스 제거"와 "스냅샷 제거"). 같은 이미지를 참조하는 컨테이너가 둘(f48bc3e3f239, 92ba8eab5fbf)이면 같은 절차를 두 번 반복한다. **에러 메시지는 정답에 가까운 정보를 준다** - "누군가 이 이미지를 사용 중"이라는 내용을 읽고 원인을 찾으라는 당부.
- **`docker ps -a`**: 종료(Exited)된 컨테이너가 계속 남아 있으므로 하나씩 `docker rm 컨테이너ID` 로 지울 수도 있으나 번거롭다 -> `--filter 'status=exited'` 로 Exited 컨테이너만 골라(`-a -q`) ID 를 rm 에 넘기는 alias 를 만든다. 살아 있는(Up) 컨테이너는 제외된다. 이 alias 를 계속 쓰려면 홈 디렉터리의 `.bashrc` 에 넣고 `source .bashrc`(또는 `. .bashrc`) 로 적용. 실행하면 죽어 있는 컨테이너만 제거되고 살아 있는 컨테이너는 유지된다.
- **정리 사례 centos:7**: `docker ps -a` 로 centos:7 을 쓰는 컨테이너(mycontainer)가 있음을 확인 -> `docker image rm centos:7` 은 conflict 오류 -> `docker stop` -> `docker rm` 후 삭제. 컨테이너 stop 과 rm, 두 절차를 거치는 이유는 프로세스를 제거하는 것과 스냅샷을 제거하는 것이 각각 별개이기 때문.

### [사용한 CLI]
```bash
# 이미지 파일로 저장 (hostos1)
mkdir save_lab && cd $_
docker image save phpserver:1.0 > phpserver1.tar
docker image save phpserver:1.0 | gzip > phpserver1.tar.gz
docker image save phpserver:1.0 | bzip2 > phpserver1.tar.bz2
ls -lh                                   # 331M / 102M / 93M

# 다른 서버로 복사 후 load (hostos2)
scp phpserver1.tar.gz kevin@hostos2:/home/kevin/backup/phpserver1.tar.gz
docker image load < phpserver1.tar.gz    # Loaded image: phpserver:1.0
docker images
docker run -itd -p 8200:80 phpserver:1.0
curl localhost:8200
```

```bash
# 이미지 삭제
docker image rm [옵션] {이름[:태그] | ID}
docker rmi      [옵션] {이름[:태그] | ID}

docker rmi myweb:v1.1                     # (hostos2) 연결된 컨테이너가 있어 conflict 오류
docker rmi myweb:v1.0                     # (hostos2) Untagged: myweb:v1.0
docker image rm myweb:v1.0                # Untagged: myweb:v1.0  (다른 태그가 남아 있으면 이름만 제거)
docker image rm dbgurum/myweb:v1.0        # 컨테이너가 사용 중이면 conflict 오류

# 컨테이너가 이미지를 사용 중일 때: stop -> rm -> 이미지 삭제
docker run -d -p 8001:80 --name=myweb myweb:v1.0
docker ps
docker stop f48bc3e3f239                  # 컨테이너 중지 (ID 또는 이름)
docker rm f48bc3e3f239                    # 컨테이너 삭제
docker image rm dbgurum/myweb:v1.0        # 여전히 conflict: 같은 이미지를 쓰는 두 번째 컨테이너(92ba8eab5fbf)
docker stop 92ba8eab5fbf
docker rm 92ba8eab5fbf
docker image rm dbgurum/myweb:v1.0        # Untagged / Deleted: sha256:...
docker ps -a                              # 중지된 컨테이너까지 확인
docker rm 1710eaa50453 6752eee6fe34 676e066d020f   # Exited 컨테이너를 ID 여러 개로 한 번에 삭제

# 자료 예시(centos:7): 사용 중 컨테이너 때문에 삭제 실패 -> stop -> rm
docker image rm centos:7                  # conflict ... container 0b5612583dfa is using its referenced image
docker stop 0b5612583dfa
docker rm 0b5612583dfa
```

```bash
# 일괄 삭제
docker rmi $(docker images -q)                     # 모든 이미지 (-q: ID 만 출력)
docker rmi $(docker images | grep debian)          # debian 이 포함된 이미지 (자료의 예시. ID 열만 추출하려면 awk 등 필요)
docker rmi $(docker images | grep -v centos)       # centos 를 제외한 이미지 (-v: 제외)

# Exited 컨테이너 일괄 삭제 alias (~/.bashrc 에 등록)
vi .bashrc
alias cexrm='docker rm $(docker ps --filter 'status=exited' -a -q)'
source .bashrc          # 또는 . .bashrc
alias                   # 등록 확인
cexrm                   # Exited 상태 컨테이너 ID 들이 삭제됨
```
- 자료 예시(centos:7): `docker ps -a` -> `docker image rm centos:7` 오류 -> `docker stop 0b5612583dfa` -> `docker rm 0b5612583dfa`.

### [확인 방법/주의점]
- save 한 tar 는 `ls -lh` 로 크기 비교, load 후 `docker images` 로 확인.
- 이미지 삭제가 conflict 로 실패하면 `docker ps -a` 로 해당 이미지를 쓰는 (중지 포함) 컨테이너를 찾아 `stop` -> `rm`.
- `docker rmi $(docker images -q)` 등 일괄 삭제는 복구가 불가능하므로 실행 전 목록을 확인한다. alias 는 `.bashrc` 에 넣고 `source` 해야 적용된다.

---

## Step 5. Private Docker Registry 구성

### [목적]
- Docker Hub 에 의존하지 않는 사내 Private registry 컨테이너(`registry`)를 만들어 이미지를 저장·조회한다.

### [이론 설명]
- Docker Hub = public registry, 직접 구축한 registry = private registry. 사내 보안/네트워크 정책상 외부 공개가 어려울 때 사용. (정정: 029 자료에서는 대용량 이미지 저장 방법으로 뒤에서 배울 **Nexus** 같은 private registry 를 권장한다고만 확인된다. Harbor/CNCF 언급은 029 에서는 확인되지 않았다.)

**[원문 한글 자료 기반 보강 - 029 Clip 3]**
- **Private registry 가 필요한 이유(슬라이드 핵심)**: 기업 내부에서 만든 프로젝트용 이미지를 **public registry 에 올리는 경우는 없다**. 이미지에는 네트워크, OS, 미들웨어 설정 등의 정보가 들어 있으므로 **보안상** Docker Hub 처럼 불특정 다수에게 공개되는 곳에는 올릴 수 없다 -> **"Private Registry"를 구축**한다. Docker registry 는 docker image 를 회사 서버에서 개별적으로 구축·관리하는 서비스이며, 사내에 private docker registry 를 만들려면 Docker Hub 에 공개된 공식 이미지 `registry` 를 사용한다. 적은 용량의 container service 로 사용하기에 적합하다.
- 강사 설명: 회사 서버 한 대에 registry 서버를 만들어 쓰는 것이 일반적이며, 이 registry 이미지에 올리는 push 와 내려받는 pull 은 앞에서 배운 Docker Hub 와 동일하게 적용된다. 사내에서 이미지를 공유하거나 테스트할 때 많이 쓰이나, 다만 용량이 큰 경우에는 부하가 걸릴 수 있으므로 뒤에 배울 Nexus 같은 private registry 로 대용량 이미지를 저장하는 방법도 권장한다고 했다.
- 이미지 이름은 그대로 `registry`(공식), 크기 약 24MB. 강사: "다운받은 이미지는 항상 history 와 inspect 로 전체 구조를 파악하라". 이번에 필요한 정보는 "registry 컨테이너를 띄울 때 **어떤 포트**를 써야 하는가"이고, history 에서 **EXPOSE 5000**(5000 포트 사용)과 **VOLUME [/var/lib/registry]**(데이터가 저장되는 경로)를 읽을 수 있다. 이 EXPOSE 5000 을 근거로 호스트 쪽에도 같은 5000번 포트를 열었다. (`<missing>` 은 중간 레이어 이미지 ID 가 로컬에 표시되지 않는다는 뜻.)
- **run 옵션 강사 설명**: `-d` 백그라운드(detach) / `-v 호스트경로:/var/lib/registry` 호스트 경로(왼쪽)와 컨테이너 경로(오른쪽)를 볼륨으로 연결해 registry 안의 데이터를 보존(볼륨은 뒤에서 자세히) / `-p 5000:5000` registry 컨테이너가 5000번을 expose 하므로 호스트의 5000번 포트와 연결(슬라이드 하단 필기: 호스트 : 컨테이너) / `--restart=always` 문제가 생겨 중단되어도 자동으로 다시 시작 / `--name=local-registry` 컨테이너 이름 / `registry` 사용할 이미지 이름.
- `-p 5000:5000` 은 "외부에서 5000번으로 들어오면 컨테이너 내부의 5000번으로 전달"해 주는 의미이며 `docker-proxy` 가 그 역할. `docker ps` 와 `netstat -nlp | grep 5000` 양쪽에서 5000번 포트가 정상적으로 올라왔는지 확인(netstat 은 슬라이드에만 있고 영상 터미널에서 실행하는 장면은 확인되지 않음).
- **curl 로 registry 내부 조회**: registry 는 REST API 를 제공하며 curl 의 GET 요청으로 저장된 저장소(repository) 목록을 볼 수 있다. 192.168.56.101 은 실습 호스트 주소, 5000 은 방금 열어 둔 포트, `/v2/_catalog` 는 registry 의 기본 조회 주소. 아직 올린 이미지가 없으므로 `{"repositories":[]}`. 
- **Docker registry 기본 설정에는 로그인 기능이 없다.** 로그인을 쓰려면 registry 에 SSL 인증서를 넣고 계정을 만드는 방법이 있으나 이번 클립에서는 다루지 않고, **로그인 없이 tag 를 설정한 뒤 push** 만 해 본다(강사).
- `registry` 이미지는 24MB 정도로 가볍고, history/inspect 로 보면 `EXPOSE 5000`, `VOLUME [/var/lib/registry]` 가 있다 -> 포트 5000, 저장 데이터 경로 /var/lib/registry.
- registry 는 REST API 를 제공한다: `/v2/_catalog`(저장소 목록), `/v2/<이름>/tags/list`(태그 목록).

### [사용한 CLI]
```bash
docker pull registry
docker images | grep registry                 # registry latest 24MB
docker image history registry:latest          # EXPOSE 5000, VOLUME [/var/lib/registry] 확인
docker image inspect registry:latest

# registry 컨테이너 실행
docker run -d \
  -v /home/kevin/registry_data:/var/lib/registry \
  -p 5000:5000 \
  --restart=always \
  --name=local-registry \
  registry
```
| 옵션 | 설명 |
|---|---|
| `-d` | 백그라운드(detach) 실행 |
| `-v /home/kevin/registry_data:/var/lib/registry` | 호스트 디렉터리를 registry 데이터 경로에 마운트 (컨테이너가 삭제되어도 이미지 보존) |
| `-p 5000:5000` | 호스트 5000 -> 컨테이너 5000 (registry 기본 포트) |
| `--restart=always` | Docker 재시작/장애 시 자동 재시작 |
| `--name=local-registry` | 컨테이너 이름 |

```bash
docker ps | grep local                        # Up ..., 0.0.0.0:5000->5000/tcp  local-registry
sudo netstat -nlp | grep 5000                 # docker-proxy 가 5000 LISTEN

# registry 내용 조회 (REST API)
curl -X GET http://192.168.56.101:5000/v2/_catalog            # {"repositories":[]}  (처음엔 비어 있음)
curl -X GET http://192.168.56.101:5000/v2/myweb/tags/list     # {"name":"myweb","tags":["v1.0"]}
```

### [확인 방법/주의점]
- `docker ps` 에서 포트 매핑, `netstat` 에서 5000 LISTEN(docker-proxy) 확인.
- 빈 registry 의 `_catalog` 는 `{"repositories":[]}`. push 후 목록이 나타난다.
- 데이터 보존을 위해 반드시 `-v` 로 볼륨을 지정한다.

---

## Step 6. insecure-registries 설정과 Private Registry push / pull 실습

### [목적]
- HTTP 로 동작하는 private registry 에 push / pull 하기 위한 Docker daemon 설정을 하고, 두 호스트(hostos1 = registry 서버, hostos2 = 클라이언트) 사이에서 이미지를 주고받는다.

### [이론 설명]
- private registry 에 push 하려면 이미지 이름을 `<registry IP:포트>/<이름>:<태그>` 로 tag 해야 한다 (Docker Hub 의 `계정/이름` 자리에 registry 주소가 온다).
- 기본적으로 Docker 는 registry 에 **HTTPS** 로 접속한다. SSL 인증서가 없는 registry(HTTP)로 push/pull 하면 `http: server gave HTTP response to HTTPS client` 오류 -> Docker daemon 에 해당 registry 를 **insecure-registry** 로 등록해야 한다. (이 설정은 registry 를 사용하는 **모든 클라이언트 호스트**에서 필요하다.)
- 설정 방법 2가지(자료에 모두 제시): `/etc/init.d/docker` 의 `DOCKER_OPTS`, 또는 `/etc/docker/daemon.json`. 변경 후 Docker 재시작.
- registry 에 같은 base layer 가 이미 있으면 `Layer already exists` 로 전송 생략.
- `docker image | grep` 는 `docker image` 가 하위 명령(COMMAND) 필요한 명령이라 오류가 난다 -> `docker images | grep` 사용.

**[원문 한글 자료 기반 보강 - 029 Clip 3]**
- **tag 는 주소 같은 것**: Docker Hub 이름은 내 계정 주소이지만, 우리 registry 는 호스트의 5000번 포트에 연결되어 있으므로 **주소:포트/이미지명** 을 명시해야 한다. `docker image tag dbgurum/myweb:v1.0 192.168.56.101:5000/myweb:v1.0` = (원본 이미지: Docker Hub 계정/이미지명:태그) -> (새 이름: registry 주소:포트/이미지명:태그). tag 는 이미지를 복사하지 않고 **같은 이미지에 이름 하나를 더 붙이는** 작업이므로 IMAGE ID(34d2c432bcb3)와 크기는 그대로. (슬라이드에는 원본이 myweb:v1.0 으로 적혀 있으나 실제 터미널에서는 방금 받은 dbgurum/myweb:v1.0 을 원본으로 사용했다. 명령 형태 `docker image tag 원본 주소:포트/이름:태그` 는 같다.) 앞서 지운 myweb 이미지를 hub 계정에서 다시 pull 하면 이미 같은 레이어가 로컬에 있어 `Already exists` 가 나온다.
- **push 실패 원인**: Docker 는 registry 를 Docker Hub(docker.io)로 기본 지정하고 있어(HTTPS 접속) 오류가 발생. `server gave HTTP response to HTTPS client` 는 Docker 가 HTTPS 로 접속했는데 registry 가 HTTP 로 응답했다는 뜻이다(이 registry 에는 SSL 인증서를 설정하지 않았기 때문). 해결: **내 registry 주소를 Docker 데몬(dockerd)에게 "insecure registry(HTTPS 없이 접속을 허용할 registry)"로 등록**.
- **insecure-registry 등록 = 두 줄 작업**: 슬라이드는 두 파일을 수정한 뒤 Docker 를 재시작하는 절차이며, 강사는 "이 두 줄의 작업만 하면 된다"고 했다. `/etc/init.d/docker` 는 **기존 파일에 한 줄을 추가**(31라인 부근 DOCKER_OPTS 영역에 `DOCKER_OPTS=--insecure-registry 192.168.56.101:5000` 을 적는다 - **오타 조심**), `/etc/docker/daemon.json` 은 **원래 없던 파일이므로 새로 만든다**. 두 설정 모두 내 registry 의 주소:포트(192.168.56.101:5000)를 "안전하지 않은(HTTPS 가 아닌) registry"로 허용한다는 뜻이다. **설정 파일을 바꾼 뒤에는 `sudo systemctl restart docker.service` 로 Docker 를 재시작해야 반영**된다(영상에서는 두 파일 모두에 같은 주소를 적용).
- **등록 확인과 push 성공**: `docker info` 아래쪽 `Insecure Registries` 항목에 넣은 주소(192.168.56.101:5000, 127.0.0.0/8)가 보여야 한다. 실패했던 push 를 다시 실행하면 이번에는 **레이어 단위로 업로드**된다(Docker Hub push 때와 동일). 마지막으로 curl 로 `/v2/_catalog`(-> `{"repositories":["myweb"]}`)와 `/v2/myweb/tags/list`(-> `{"name":"myweb","tags":["v1.0"]}`)를 조회. 강사 정리: "registry 를 만들고 이미지를 **업로드하는 과정까지** 살펴봤다." 내려받기(pull)는 이 영상에서 직접 시연하지 않았고 강사는 "push/pull 이 동일하게 적용된다"고 말한 수준.

### [사용한 CLI]

**1) 이미지 tag 후 push 시도 (오류 재현)**
```bash
docker pull dbgurum/myweb:v1.0
docker image tag dbgurum/myweb:v1.0 192.168.56.101:5000/myweb:v1.0
docker push 192.168.56.101:5000/myweb:v1.0
#   Get "https://192.168.56.101:5000/v2/": http: server gave HTTP response to HTTPS client
```

**2) insecure-registry 설정**
```bash
# 방법 1) /etc/init.d/docker (자료 기준 31행 부근 DOCKER_OPTS)
sudo vi /etc/init.d/docker
DOCKER_OPTS=--insecure-registry 192.168.56.101:5000

# 방법 2) /etc/docker/daemon.json
sudo vi /etc/docker/daemon.json
```
```json
{ "insecure-registries": ["192.168.56.101:5000"] }
```
```bash
# Docker 재시작 후 반영 확인
sudo systemctl restart docker.service
docker info
#   Insecure Registries:
#     192.168.56.101:5000
#     127.0.0.0/8
```

**3) push 및 registry 확인 (hostos1)**
```bash
docker push 192.168.56.101:5000/myweb:v1.0      # 레이어들 Pushed, digest 출력
curl -X GET http://192.168.56.101:5000/v2/_catalog          # {"repositories":["myweb"]}
curl -X GET http://192.168.56.101:5000/v2/myweb/tags/list   # {"name":"myweb","tags":["v1.0"]}

# v1.1 도 tag + push (공통 layer 는 Layer already exists)
docker image tag myweb:v1.1 192.168.56.101:5000/myweb:v1.1
docker images | grep 192
docker push 192.168.56.101:5000/myweb:v1.1
curl -X GET http://192.168.56.101:5000/v2/myweb/tags/list   # {"name":"myweb","tags":["v1.0","v1.1"]}
```

**4) 클라이언트(hostos2) 에서 pull**
```bash
curl -X GET http://192.168.56.101:5000/v2/_catalog          # 조회(HTTP) 는 insecure 설정과 무관하게 가능
docker pull 192.168.56.101:5000/myweb:v1.0
#  insecure 설정 전: Error response from daemon: Get "https://192.168.56.101:5000/v2/": http: server gave HTTP response to HTTPS client
# -> hostos2 에서도 위 2) 설정(/etc/docker/daemon.json 등 + systemctl restart docker.service + docker info 확인) 수행 후 재시도
docker pull 192.168.56.101:5000/myweb:v1.0
docker images | grep 192
docker image tag 192.168.56.101:5000/myweb:v1.0 dev_http:1.1    # (자료 예시) 이름 변경 tag (정정: 태그명은 1.0 이 아니라 v1.0)
docker images
docker run -d -p 8100:80 --name myweb-server dev_http:1.1

# (hostos2, insecure 설정 전) hostos2 에서 tag 후 push 해도 같은 오류
docker image tag myweb:v1.1 192.168.56.101:5000/myweb:v1.1
docker push 192.168.56.101:5000/myweb:v1.1
#   Get "https://192.168.56.101:5000/v2/": http: server gave HTTP response to HTTPS client
```

**5) 신규 이미지 실습: build -> run -> tag -> push -> 다른 호스트 pull/run (phpserver:1.0)**
```bash
git clone https://github.com/hylee-kevin/fastcampus.git
cd fastcampus/ch04
ls                                        # Dockerfile index.php index.php2 index.php3 ...
cat Dockerfile
cat index.php
docker build -t phpserver:1.0 .           # FROM php:7.2-apache, ADD index.php /var/www/html/index.php
docker images | grep phpserver            # 410MB
docker run -it -d -p 8004:80 -h phpserver --name=phpserver phpserver:1.0
docker ps | grep phpserver
curl localhost:8004                       # Container Name : phpserver ... Welcome to the Container world~!

docker image tag phpserver:1.0 192.168.56.101:5000/phpserver:1.0
docker push 192.168.56.101:5000/phpserver:1.0
curl -X GET http://192.168.56.101:5000/v2/_catalog                  # {"repositories":["myweb","phpserver"]}
curl -X GET http://192.168.56.101:5000/v2/phpserver/tags/list       # {"name":"phpserver","tags":["1.0"]}

# (hostos2)
curl -X GET http://192.168.56.101:5000/v2/_catalog                  # {"repositories":["myweb","phpserver"]}
curl -X GET http://192.168.56.101:5000/v2/phpserver/tags/list       # {"name":"phpserver","tags":["1.0"]}
docker pull 192.168.56.101:5000/phpserver:1.0
docker images | grep 192
docker run -it -d -p 8004:80 -h phpserver --name=phpserver 192.168.56.101:5000/phpserver:1.0
docker ps | grep php
curl localhost:8004
```

### [확인 방법/주의점]
- `docker info` 의 **Insecure Registries** 목록에 registry 주소가 보여야 한다. 설정만 하고 `systemctl restart docker.service` 를 안 하면 반영되지 않는다.
- push 후 `curl .../v2/_catalog`, `.../v2/<이름>/tags/list` 로 이미지/태그 확인.
- 클라이언트 호스트마다 insecure-registries 설정이 필요하다. 운영에서는 SSL(openssl 인증서) 구성 또는 Harbor / Nexus 같은 registry 사용을 고려(자료 언급).

**[원문 한글 자료 기반 보강 - 030 Clip 4]**
- **시나리오**: hostos1 = registry server, hostos2 = client 로 private push/pull 실습. 앞 클립에서 올린 v1.0 에 이어 이번에는 **v1.1** 을 올리고 두 서버를 오가며 push/pull. 이미지 이름은 `레지스트리주소:포트/저장소이름:태그` 형태이며, 주소를 앞에 붙이지 않으면 docker 는 기본값인 Docker Hub 에 올리려 하므로 private registry 에 올릴 때는 `docker image tag` 로 주소가 붙은 새 이름을 만든 뒤 push 한다(같은 이미지에 이름을 하나 더 붙이는 것이므로 이미지 ID 는 그대로).
- **hostos1 에서 v1.1 push**: 먼저 `curl .../v2/myweb/tags/list` 로 v1.0 만 올라 있음을 확인 -> `docker image tag myweb:v1.1 192.168.56.101:5000/myweb:v1.1` -> push. v1.0 과 v1.1 은 **대부분의 레이어를 공유**하므로 이미 registry 에 있는 레이어는 `Layer already exists` 로 건너뛰고 바뀐 레이어만 `Pushed`. 카탈로그에는 저장소(myweb) 하나, 그 안의 태그는 v1.0, v1.1 두 개로 "사이좋게" 올라간다(강사 역할 예시: hostos1 은 이미지를 만들어 올리는 팀, hostos2 는 받아 쓰는 팀).
- **hostos2 에서 오류(핵심)**: hostos2 는 로컬 registry 서버가 아니므로 **1번 서버에 있는 registry 주소를 2번 서버의 docker 에도 등록**해야 한다. 등록하는 주소는 **192.168.56.101:5000(registry 가 있는 서버의 IP 와 포트)** 이며, 강사는 **2번 서버 자신의 IP 인 102번을 쓰면 절대 안 된다**고 강조("해당 registry 서버의 주소"를 쓰는 것이기 때문). hostos2 에서 `tag` 후 `push` 하면 앞서와 같은 `server gave HTTP response to HTTPS client` 오류가 난다.
- **조회는 되지만 pull 은 오류**: hostos2 에서 `curl -X GET .../v2/_catalog`, `.../tags/list` 는 insecure 등록 없이도 **조회는 동일하게 잘 된다**(v1.0, v1.1 모두 보임). 강사: "읽는 것(HTTP 조회)은 다 되는데 pull/push 에서 문제가 생길 수 있다". 이 상태에서 `docker pull 192.168.56.101:5000/myweb:v1.0` 은 같은 오류. (영상 중 처음에 myweb:1.0 으로 입력했다가 태그 목록에 있는 v1.0 으로 고쳐 다시 실행 - registry 에 있는 실제 태그 이름은 v1.0.)
- **hostos2 설정 순서**: 앞서 1번 서버에서 한 방법 그대로 -> `sudo vi /etc/init.d/docker` (31행 부근 DOCKER_OPTS= 줄에 내 registry 주소, "1번 서버에 5000번 포트를 쓰는 registry 를 등록") -> `sudo vi /etc/docker/daemon.json` 신규 작성(`{ "insecure-registries": ["192.168.56.101:5000"] }`, vi 에서 `:wq`) -> `sudo systemctl restart docker.service` -> `docker info` 의 Insecure Registries 에 1번 서버의 registry(192.168.56.101:5000)가 등록된 것 확인. daemon.json 은 Docker 데몬(dockerd)의 설정 파일이며 데몬 설정을 바꾸면 재시작해야 적용된다. 이후 pull 성공.
- **주의(오타)**: `docker image | grep 192` 는 ls 등 하위 명령이 빠진 입력이라 `docker image` 의 사용법(도움말)만 출력된다 -> `docker images | grep 192` (또는 `docker image ls`). 영상 중 첫 curl 도 옵션 문자가 잘못 입력되어 `Could not resolve host` 오류가 났고 다시 입력해 성공.
- **샘플 이미지 phpserver:1.0 (4장 앞 실습에서 썼던 이미지)**: GitHub(hylee-kevin/fastcampus)를 clone -> `ch04` 디렉터리(Dockerfile, index.php, index.php2, index.php3 ...). Dockerfile 은 베이스 이미지를 가져오고 몇 가지를 복사(COPY/ADD)하는 5줄 정도(FROM php:7.2-apache, ADD index.php /var/www/html/index.php). 빌드는 레이어가 하나씩 만들어지며 단계별 소요 시간이 표시된다(예: Building 43.3s (5/7)). 이미지는 phpserver:1.0, **410MB**. **빌드한 이미지는 반드시 컨테이너로 실행해 확인**한 뒤(예: `docker run -it -d -p 8004:80 -h phpserver --name=phpserver phpserver:1.0` 후 `curl localhost:8004` -> "Container Name : phpserver ... Welcome to the Container world~!") registry 에 push 하며 push 전에 tag 를 먼저 건다. `-h` 는 컨테이너의 hostname 지정. 슬라이드의 이미지 ID(35dbb7ccd414)는 예시이며 실제 화면의 ID 는 7a70be7bd298 (410MB).
- **push/확인**: `docker image tag phpserver:1.0 192.168.56.101:5000/phpserver:1.0` 두 이름의 IMAGE ID 동일 -> push(레이어 15개 Pushed) -> `curl _catalog` 로 myweb, phpserver 두 저장소 확인, 태그 목록 `{"name":"phpserver","tags":["1.0"]}`. hostos2 에서 카탈로그와 태그를 확인한 뒤 같은 주소로 `docker pull`(insecure 설정을 해 두었으므로 오류 없음) -> `docker run -it -d -p 8004:80 -h phpserver --name=phpserver 192.168.56.101:5000/phpserver:1.0` -> `curl localhost:8004` 로 동일 결과 확인. 즉 private registry 가 서버 사이의 이미지 전달 통로 역할을 한다.
- **마무리/실무 권장**: 이 로컬 registry 컨테이너는 큰 용량의 이미지보다는 **간단한 작은 이미지 위주**로 사용하기를 권장한다. 실제 업무에서는 CNCF(오픈소스 재단)에서 볼 수 있는 **Harbor** 같은 오픈소스 registry 나 **Nexus** 등이 글로벌하게 많이 쓰이며 그런 registry 를 만들어 활용하는 방법도 권장한다(강사의 "Harbor", "Nexus", "cncf" 발음은 음성 인식이 불명확하여 문맥상 가장 가능성이 높은 표기이며 확정 아님).
- 확인 포인트: `-h` 옵션은 컨테이너 hostname 지정, `-p 8004:80` 은 호스트 8004 -> 컨테이너 80.

---

## Step 7. 컨테이너 격리 기술과 lifecycle

### [목적]
- 컨테이너가 "이미지 snapshot + 프로세스(PID 1)" 이며 리눅스 chroot/pivot_root/namespace 로 격리된다는 것을 직접 확인하고, 컨테이너 lifecycle(create -> start -> stop -> rm)을 이해한다.

### [이론 설명]
- **컨테이너 = 이미지 snapshot + 격리된 프로세스(PID 1)**. 이미지(read-only layer) 위에 read-write container layer 가 얹히고, namespace/cgroup 으로 격리·자원 제한된다. 컨테이너 파일은 `/var/lib/docker/overlay2/<hash>/` 의 `diff`(변경분) / `merged`(합쳐진 뷰) 에 존재한다. (containerd, runc 는 컨테이너 런타임 구성요소로 언급만 됨.)
- 컨테이너 안에서 확인하는 격리 기술:

| 명령 | 확인 내용 | 관련 기술 |
|---|---|---|
| `ls` | 이미지 OS 디렉터리 구조가 루트(/)로 보임 | chroot, pivot_root |
| `df -h` | overlay 루트, /etc/hosts 등은 호스트 파일 마운트 | mount namespace |
| `hostname` | 컨테이너 ID(또는 지정한 이름) | UTS namespace |
| `ps -ef` | 실행한 프로세스(bash)가 PID 1 | PID / IPC namespace |
| `ifconfig` | 독립된 eth0, IP(172.17.0.x) | network namespace |

- namespace 종류(lsns 출력): time, cgroup, pid, user, uts, ipc, net, mnt. Description: chroot(루트 디렉터리 변경), pivot_root(루트 파일시스템 교체), Mount ns(마운트 격리), UTS ns(hostname), PID ns(프로세스 번호 격리), Network ns(IP/Port/라우팅/NIC), IPC ns(프로세스 간 통신 자원).
- **Lifecycle**: `create`(이미지 snapshot 으로 컨테이너 생성, 상태 Created) -> `start`(프로세스 시작, container layer 활성) -> `stop`(프로세스 종료, container layer 는 보존) -> `rm`(container layer 삭제). **`docker run = [pull] + create + start + [command]`**.
- 최소 이미지(ubuntu:16.04)에는 `ifconfig`(net-tools)가 없다(`command not found`) -> `apt update` 후 설치 필요.

**[원문 한글 자료 기반 보강 - 031 Clip 1]**
- **챕터 5 소개**: 컨테이너 CLI 를 하나의 컨테이너에 다양한 명령을 적용해 보며 익히는 챕터(총 3개 클립: Clip1 컨테이너 격리 기술, Clip2 컨테이너 관리를 위한 CLI(1), Clip3 컨테이너 관리를 위한 CLI(2)). 명령어 자체는 도커 공식 문서에도 있으므로 "실제 환경에서 어떤 형태로 쓰이는지"를 하나의 컨테이너로 따라 해 보는 데 초점. 도커는 원래 **LXC(Linux Container)** 격리 기술에서 출발했고 지금은 **containerd, runc** 같은 구조의 도커 엔진으로 바뀌었다(컨테이너를 실제로 만들고 실행하는 도커 내부 구성 요소, 이 클립에서 자세히 다루지 않음).
- **컨테이너 = 이미지 스냅샷 + 프로세스(PID=1)**. 이미지를 복제한 것을 여기서는 **스냅샷**이라 부르고, 그 스냅샷 위에 **프로세스**를 쓰기 때문에 컨테이너를 "프로세스 격리 기술"이라고 표현한다. 스냅샷은 **패키지·라이브러리·소스·환경 설정·디렉터리 구성**을 하나로 묶어 둔 것(패키징). `docker run -it --rm --name=mycontainer ubuntu:14.04 bash` 의 맨 끝 `bash` 는 컨테이너 **내부에서 실행할 명령**(우분투 14.04 이미지로 mycontainer 를 만들고 그 안의 bash 셸로 들어간다). 우분투 14.04 는 측정 도구가 많이 설치되어 있어 간단한 테스트에 좋아 이번 실습에서 사용. 패키징 표준 기술(OCI)은 9장 부근 Dockerfile 에서 다시 언급 예정.
- **이미지는 /var/lib/docker 영역에 저장**: `df -h` 에서 `/dev/sdb1 100G` 가 `/var/lib/docker` 에 마운트된 것은 리눅스 설치 때 도커 전용 디스크를 나눠 둔 것을 상기시키는 화면. 이미지도 여기에 저장되고, 컨테이너를 run 하면 이 영역 안에 이미지의 스냅샷(복제본)이 만들어진다. 이미지는 **레이어의 집합**(union file system, 계층 구조)이며 기본적으로 **read-only**(수정 불가). 그 위에 **read-write 가 가능한 컨테이너 레이어(프로세스 레이어)**를 하나 더 올리면, 컨테이너의 주인인 **PID 1번 프로세스**(OS 컨테이너의 init, nginx 같은 애플리케이션)가 자리를 잡는다. 이때 커널 기술인 **cgroup, namespace** 가 네트워크 설정, CPU, 메모리, 디스크 같은 자원(리소스)을 배치한다. 강사 정리: "컨테이너는 격리 기술이다. 프로세스를 격리한다." 여기서 독립이란 **PID 1번을 가지면서 그 환경 전체를 방처럼 가둬 두고 독립적으로 운영할 수 있다**는 의미.
- **컨테이너 안에서 확인하는 격리 결과(슬라이드 말풍선)**: `ls` -> 컨테이너에 들어오면 기본 작업 디렉터리는 `/` 로 열려 있고(WORKDIR 기본값) OS 의 / 와 비슷한 디렉터리(bin, etc, lib ...)가 보이지만 **호스트와 똑같은 영역은 아님**. 이처럼 자기만의 최상위 경로로 만들어 주는 기술이 **chroot(change root), pivot_root** 이고 LXC 계열 리눅스 기술(독립적인 루트 파일 시스템 보장). `df -h` -> 컨테이너가 쓰는 파일 시스템 트리가 구성되어 나오며(overlay 등), `/etc/hosts` 등은 호스트의 sdb1 장치가 컨테이너 안으로 물려(마운트된) 항목. `/etc/hosts`, `/etc/hostname`, `/etc/resolv.conf` 등을 복제해서 컨테이너가 동작하는 데 필요한 영역을 자리 잡아 준다. 이처럼 컨테이너 내부 파일 시스템 트리를 따로 구성하는 기술이 **mount namespace**. `hostname` -> 모든 OS 는 호스트명을 가지며 컨테이너별로 고유한 호스트명을 갖게 해 주는 것이 **UTS namespace**(컨테이너 ID 가 그대로 그 컨테이너의 호스트명). `ps -ef` -> ps 는 process status 의 약어(강사 설명). 컨테이너 안에서 `ps -ef` 를 치면 bash 가 UID root, **PID 1, PPID 0** 으로 보이고 방금 친 ps -ef 는 PID 19 로 보인다. 호스트의 systemd(PID 1)와 분리된 독립적인 PID 1 이 생기는 것이 **PID namespace**, 프로세스 간 통신(IPC)에 필요한 자원을 따로 두는 것이 **IPC namespace**. `ifconfig` -> 네트워크가 동작하려면 이더넷(eth0), MAC 주소, IP 주소, 라우팅 테이블, 포트, iptables 같은 정보가 필요한데 이것들을 컨테이너별로 배치해 주는 것이 **network namespace**(eth0 에 inet addr 172.17.0.3, 마스크 255.255.0.0). 강사 결론: chroot 부터 network namespace 까지 여러 기술이 합쳐져서 컨테이너 내부에 독립된 프로세스 환경이 만들어진다. 컨테이너는 "어려운 가상화"가 아니라, 디렉터리 하나를 마운트해서 프로세스 영역으로 만든 **프로세스 격리 기술**.
- **격리 기술 표(슬라이드 Description)**: chroot = 프로세스의 루트 디렉터리를 변경, 격리하여 가상의 루트 디렉터리를 생성 / pivot_root = 루트 파일시스템 자체를 바꿔, 컨테이너가 전용 루트 파일시스템을 가지도록 함(chroot 보완) / Mount namespace = namespace 내에 파일 시스템 트리를 구성 / UTS namespace = 컨테이너에 대한 hostname 격리를 수행하여 고유한 hostname 보유 가능 / PID namespace = PID 와 프로세스를 분리(systemd 와 분리) / Network namespace = 네트워크 리소스(IP, Port, route table, ethernet ...) 할당 / IPC namespace = 전용의 process table 보유. chroot/pivot_root 는 루트 파일시스템을 만드는 기술, UTS 는 컨테이너별 고유 호스트명 보장, PID 는 호스트 OS 의 PID 1(Ubuntu, CentOS 모두 systemd)과 분리된 또 하나의 PID 1 을 만들어 주는 것. `lsns` 는 시스템 전체 namespace 목록(time, cgroup, pid, user, uts, ipc, net, mnt)을 확인하는 명령(강사는 "전체적인 namespace 목록을 확인할 수 있다"고만 설명).
- **lifecycle 표(슬라이드)**: `docker container create` = image 의 snapshot 으로 /var/lib/docker 영역에 생성(스냅샷만 만들어진 "껍데기"이며 동작하지 않는다) / `docker container start` = 읽고 쓰기가 가능한 Process 영역, 즉 container layer 를 생성하여 동적 컨테이너를 구성(스냅샷에 프로세스(PID 1)가 붙어 컨테이너가 동작) / `docker container stop` = 생성된 container layer 를 삭제(프로세스가 사라지고 이미지 스냅샷만 남음. 다시 start 하면 재사용 가능) / `docker container rm` = 생성된 snapshot 을 삭제(더 안 쓰겠다면 /var/lib/docker 영역에서 완전히 제거). 이 4단계를 **한 번에 처리하는 것이 `docker (container) run`** (이미지 관련 명령은 image 를 붙이는 것이 기본 규칙이지만 컨테이너 명령은 `container` 를 붙여도, `docker run` 처럼 생략해도 된다).
- **수동 lifecycle 실습 주의점**: `docker pull ubuntu:16.04`(이미 있으면 `Image is up to date`) -> `docker create -it --name=myubuntu16-1 ubuntu:16.04` -> `docker ps -a | grep my` 에서 STATUS **Created** 는 "스냅샷만 만든 껍데기"이지 컨테이너로 동작 중이라는 뜻이 아니다(동작 중이면 `Up (몇 초 전)`, `-a` 는 멈춘 컨테이너까지 보여 주는 옵션). 컨테이너 이름에는 규칙이 없고 이름을 주지 않으면 도커가 단어 조합으로 자동 생성하지만 의미 있게 짓는 것이 좋다. `start` 하면 `Up 4 seconds`, `stop` 하면 `Exited (0) 3 seconds ago`, 한 번 stop 한 컨테이너도 다시 `start` 하면 프로세스 영역이 가동되어 재사용 가능(Up 2 seconds). **스냅샷을 버리기 전에는 반드시 프로세스가 죽어 있어야(stop 상태) `docker rm` 으로 삭제가 가능**하다. rm 뒤 `docker ps -a | grep my` 로 컨테이너가 완전히 제거된 것을 확인. (영상 중 `docker star^C` 는 오타 후 Ctrl+C 로 취소한 것.) 슬라이드 순서상 `docker start` 후 `docker attach myubuntu16-1` 로 접속한다(앞쪽 CLI 블록에서 attach 가 rm 뒤에 적힌 것은 순서 오류이며 실제로는 start 다음에 attach/exec).
- **docker run 한 줄**: create + start 를 `docker run -it --name=myubuntu16-2 ubuntu:16.04 bash` 로 대신(수동으로 할 때는 컨테이너 안으로 들어가지 못하므로 start 된 상태에서 attach 또는 exec 로 접속). 컨테이너 안에서 `ls`(chroot/pivot_root), `df -h`(mount namespace), `hostname`(UTS), `ps -ef`(PID namespace) 확인. `ifconfig` 는 `command not found` - 우분투 16.04 컨테이너에는 ifconfig 명령이 없다. 도구가 필요하면 우분투/데비안 계열은 apt, 레드햇/센토스 계열은 yum 으로 설치하되 **설치 전에 먼저 `apt update`/`yum update` 로 패키지 목록을 갱신**하라(ifconfig 는 net-tools 패키지에 들어 있음, 설치 명령 자체는 화면에 나오지 않음).
- **컨테이너 = process 이자 image snapshot (확인 실습)**: `docker run -it --name=mycontainer ubuntu:14.04 bash`. 로컬에 이미지가 없으면 `Unable to find image ... locally` 가 뜨고 도커가 알아서 Docker Hub 에서 받아온다(run = pull + create + start + command). bash 를 붙였기 때문에 컨테이너가 만들어지자마자 컨테이너 내부 프롬프트로 떨어지며 호스트명은 이번에는 컨테이너 ID(0764a3b11c60). 컨테이너 안에서 `echo 'fastcampus!' > mycontainer.txt` 후 `ls`, `cat`. **별도 터미널(새 창)** 에서 `ps -ef | grep mycontainer` -> 호스트의 일반 리눅스 프로세스로 `docker run -it --name=mycontainer ubuntu:14.04 bash` 가 조회된다 = 컨테이너는 동적인 프로세스. 스냅샷은 read-only 이며 그 위의 read-write 프로세스 영역 그 상태 그대로를 새 이미지로 만드는 작업이 `docker commit`(뒤에서 다룸).
- **호스트에서 파일 위치 찾기**: 컨테이너에서 **Ctrl+P, Q** 로 종료하지 않고 빠져나온 뒤 `sudo su -` 로 root -> `find /var/lib/docker -name mycontainer.txt` -> `/var/lib/docker/overlay2/<hash>/diff/mycontainer.txt` 와 `.../merged/mycontainer.txt` 두 곳에 나온다. `merged` 디렉터리로 이동해 `ls` 하면 컨테이너 안의 `ls` 결과와 똑같다. overlay2 는 이미지 레이어와 컨테이너 레이어를 겹쳐 하나의 파일 시스템처럼 보여 주는 스토리지 드라이버이고 diff 는 컨테이너에서 변경된 내용, merged 는 겹쳐 보이는 최종 모습(강사는 입문자 보증으로 "스토리지 드라이버 영역에 해시값을 가진 merged 영역"이라고만 설명). 즉 **컨테이너 안의 파일 시스템 = 호스트 /var/lib/docker 아래 merged 디렉터리**. (슬라이드의 해시 값은 예시이며 실제 시연에서는 다른 해시 디렉터리가 나온다.)
- **양방향 확인**: 호스트 쪽 merged 디렉터리에서 `touch mycontainer2.txt` 후 다른 터미널에서 `docker exec -it mycontainer bash` -> `ls` 하면 `mycontainer2.txt` 도 보인다. 컨테이너 내부 자료와 /var/lib/docker 의 overlay2 영역이 양쪽에서 동일하게 반영되며 한쪽은 실제로 동작하는 영역, 다른 쪽은 파일 수준으로만 볼 수 있는 스냅샷 영역이라고 설명. 강사 마무리: **컨테이너의 실제 모습 = 이미지 스냅샷이 /var/lib/docker 영역에 만들어지고 그것을 프로세스 영역과 연결해 동적인 컨테이너로 보여 주는 것**.

### [사용한 CLI]
```bash
# run = pull + create + start + command
docker run -it --rm --name=mycontainer ubuntu:14.04 bash
#   -i -t : 대화형 + 터미널, --rm : 종료 시 컨테이너 자동 삭제, --name : 컨테이너 이름
df -h /var/lib/docker            # (호스트) /var/lib/docker 가 별도 디스크(/dev/sdb1)로 마운트된 예

# 컨테이너 내부에서 격리 확인
root@7a3e9b12fb1b:/# ls
root@7a3e9b12fb1b:/# df -h
root@7a3e9b12fb1b:/# hostname
root@7a3e9b12fb1b:/# ps -ef
root@7a3e9b12fb1b:/# ifconfig

# 호스트에서 namespace 확인
lsns
```

```bash
# lifecycle 단계별 실행
docker pull ubuntu:16.04
docker images | grep ubuntu
docker create -it --name=myubuntu16-1 ubuntu:16.04     # 생성만 (STATUS: Created)
docker ps -a | grep my
docker start myubuntu16-1                               # Up N seconds
docker stop myubuntu16-1                                # Exited (0) ...
docker start myubuntu16-1
docker stop myubuntu16-1
docker rm myubuntu16-1                                  # 삭제 (ps -a 에서 사라짐)
docker attach myubuntu16-1                              # 실행 중 컨테이너에 접속 (create+start 방식일 때)

# run 한 번으로 create+start
docker run -it --name=myubuntu16-2 ubuntu:16.04 bash
root@5e660232dbfe:/# ps -ef
root@5e660232dbfe:/# ifconfig               # bash: ifconfig: command not found
root@5e660232dbfe:/# apt update             # (ifconfig 는 net-tools 패키지에 포함 - 자료 설명)
```

**컨테이너 = 프로세스 + 이미지 snapshot 확인**
```bash
docker run -it --name=mycontainer ubuntu:14.04 bash    # (Unable to find image locally -> 자동 pull)
root@0764a3b11c60:/# echo 'fastcampus!' > mycontainer.txt
root@0764a3b11c60:/# ls ; cat mycontainer.txt
# (Ctrl+P, Q 로 컨테이너를 종료하지 않고 빠져나옴)

ps -ef | grep mycontainer          # 호스트에서 'docker run ...' 프로세스로 확인

sudo su -
find /var/lib/docker -name mycontainer.txt
#   /var/lib/docker/overlay2/<hash>/diff/mycontainer.txt
#   /var/lib/docker/overlay2/<hash>/merged/mycontainer.txt
cd /var/lib/docker/overlay2/<hash>/merged
ls ; cat mycontainer.txt
touch mycontainer2.txt              # 호스트에서 merged 에 파일 생성
# 다른 터미널에서
docker exec -it mycontainer bash
ls                                  # mycontainer2.txt 가 컨테이너 안에서도 보임
```

### [확인 방법/주의점]
- `docker ps -a` 의 STATUS: `Created` / `Up N seconds` / `Exited (0) ...`.
- `docker rm` 은 컨테이너를 stop 한 뒤 수행(실행 중이면 오류). rm 후에는 container layer 와 데이터도 삭제된다.
- 컨테이너 안에서 만든 파일은 호스트 `/var/lib/docker/overlay2/.../diff` 와 `merged` 에서 확인된다 (`/var/lib/docker` 에 접근하려면 root).
- 컨테이너를 종료하지 않고 빠져나올 때: `Ctrl+P, Ctrl+Q` (exec/attach 시 `read escape sequence` 표시).

---

## Step 8. 컨테이너 운용 CLI (1): 빌드, run 옵션, 모니터링, 로그, inspect, cp

### [목적]
- Node.js 예제 앱으로 이미지를 build -> run 하고, 컨테이너를 모니터링(top/port/stats/cAdvisor), 로그 관리(logs, 로그 크기 제한), 상세 조회(inspect), 파일 복사(cp)와 재시작(restart)을 익힌다.

### [이론 설명]
- 컨테이너 CLI 분류(자료): 생성 `create, run` / 제어 `stop, pause, unpause, restart, kill, rm` / 조회 `inspect, ps, logs, top, stats` / 기타 `cp`, `export / import`. 이미지 전달용 `save / load` 와 달리 `export` 는 컨테이너 파일시스템을 tar 로 내보낸다. (공식 레퍼런스: https://docs.docker.com/engine/reference/commandline/container/)
- 컨테이너 포트 공개(`-p`)는 호스트의 `docker-proxy` 프로세스가 처리한다 (`docker port`, `netstat`, `ps -ef` 로 확인).
- **docker logs** 는 컨테이너의 표준 출력(stdout)/표준 에러(stderr)를 보여준다. 기본 Logging Driver 는 `json-file` 이며 `/var/lib/docker/containers/<컨테이너ID>/<ID>-json.log` 에 계속 쌓이므로 방치하면 디스크가 가득 찰 수 있다 -> 비우기(truncate) 또는 daemon.json / run 옵션으로 로테이션(max-size, max-file) 설정.
- 컨테이너가 실행 직후 `Exited(1)` 로 종료되면 `docker ps` 에는 안 보이고 `docker ps -a` 에서 보인다 -> `docker logs` 로 원인 확인 (예: MySQL 은 root 비밀번호 환경변수 필수).
- docker inspect 로 얻는 정보: namespace 별 설정(컨테이너 ID, IP, MAC, Gateway, Networks), cgroup 자원 제한(Unlimit 이면 제한 없음) 등.

**[원문 한글 자료 기반 보강 - 032 Clip 2]**
- **챕터 5 명령어 지도**: 챕터 5 는 컨테이너를 실제로 운영·관리할 때 쓰는 명령어를 다루며 분량이 많아 CLI(1)/CLI(2) 두 클립으로 나눴다. 도커 공식 문서의 command line reference(https://docs.docker.com/engine/reference/commandline/container/)에 컨테이너·이미지·네트워크 등의 명령이 모두 정리되어 있으니 참고. 큰 키워드는 **이미지와 컨테이너**이며 앞선 챕터는 이미지(pull/push, 이미지 관리, tag, login), 이번 챕터는 **컨테이너**. 컨테이너를 만드는 명령: `create`, `run` / 운영에 필요한 명령: `stop`, `pause`, `unpause`, `restart`, `kill`, `rm` / 상태를 보는 명령: `inspect`, `ps`, `logs`, `top`, `stats`(기본적인 리소스 메트릭/통계 정보. 그림에는 없지만 `cp` 같은 명령도 있음). 이미지를 백업할 때는 `save/load`, 실행 중인 **동적 상태의 컨테이너를 파일로 내보낼 때는 `export`**, 다시 넣을 때는 `import`. **이미지는 정적이라 save 한 파일을 load 하면 바로 run 이 된다. 반면 컨테이너를 파일로 가져와 import 한 뒤 그것을 run 하면 에러가 발생할 수 있다**(이 에러는 해당 명령을 다룰 때 설명, 이 클립에는 export/import 실습 없음).
- **테스트 이미지 noderun:1.0**: 소스는 강사가 미리 만들어 두었고 작업 디렉터리는 `~/fastcampus/ch05`. runapp.js 는 요청이 오면 콘솔에 `Your request arrived.` 를, 연결되면 `Your Connected.` 를 출력하고 응답으로 `HostName: (컨테이너의 호스트명)` 을 돌려준다. Dockerfile 설명(9장에서 본격 다룸): `FROM node:20-alpine3.17` 베이스(부모) 이미지 / `RUN apk add --no-cache tini curl` 알파인 리눅스라서 패키지 설치에 apk 를 쓴다 / `WORKDIR /app` /app 디렉터리를 만들고 그 위치로 이동(cd) / `COPY runapp.js .` 바깥(빌드 위치)에 있는 runapp.js 를 현재 경로(/app)로 가져온다 / `EXPOSE 6060` 소스가 6060 포트를 listen 하므로 6060 포트를 노출(expose)해 둔다 / `ENTRYPOINT ["/sbin/tini", "--"]`, `CMD ["node","runapp.js"]` 컨테이너 안에서 runapp.js 를 실행하는 명령(tini 를 통해 실행). `-t noderun:1.0` 은 "noderun:1.0 이라는 태그의 이미지를 만들어라", 마지막 `.` 은 "현재 디렉터리의 Dockerfile 을 빌드하라"는 뜻. 이미지 크기 약 183MB 는 대부분 베이스 이미지에서 온 것이고 runapp.js 는 거의 차지하지 않는다(슬라이드 예시 ID/크기 2ddb250a6232 / 182MB 와 실습 화면 bfb8cfb53735 / 183MB 는 실행 때마다 다른 값). `docker image history noderun:1.0` 으로 Dockerfile 에 넣은 명령이 층(레이어)별로 쌓인 내용 확인(`<missing>` 은 베이스 이미지 node:20-alpine 의 레이어).
- **docker run 옵션 강사 부연**: `-itd` 는 -i, -t, -d 를 함께 쓴 것. `-p 6060:6060` 호스트 6060 포트로 들어오는 트래픽을 컨테이너 6060 포트로 연결(publish). `--name=node-run` 컨테이너 이름. `-h node-run` 컨테이너의 **호스트명**을 node-run 으로 지정 - 원래는 컨테이너 ID 가 호스트명이 되는데, 내부의 UTS namespace 가 컨테이너 ID 대신 node-run 이라는 호스트명을 갖게 된다. `curl localhost:6060` -> `HostName: node-run` 은 runapp.js 의 HostName 메시지에 지정한 호스트명을 읽어 돌려주도록 만든 것. 이 클립의 실습 컨테이너는 node-run 이며 이후 top/port/stats/logs/inspect/cp 실습은 모두 이 컨테이너에 적용(실습 화면의 컨테이너 ID 앞자리는 4d8fd0de2b83, 예시 ID 와 다름).
- **run 옵션표 강사 부연**: `-i, --interactive` 대화식 모드 열기(컨테이너 내부에 명령을 주고받는 작업이 필요할 때 사용), `-t` TTY(단말 디바이스) 할당, 보통 -i 와 -t 를 붙여 `-it` 으로 많이 씀 / `-d, --detach=true` 백그라운드에서 컨테이너 실행 후 컨테이너 ID 출력(뒷단에서 백그라운드로 운영) / `--name` 실행되는 컨테이너에 이름 부여(미지정 시 자동 부여: 딕셔너리 워드 랜덤 선택). 의미 전달이 어려울 수 있으니 가급적 `--name` 으로 이름을 줄 것을 권장 / `--rm` 컨테이너 종료 시 자동으로 컨테이너 제거(stop 후 rm 하는 두 단계를 줄일 수 있어 테스트용 컨테이너에 유용) / `--restart` 컨테이너 종료 시 적용할 재시작 정책 `[no | on-failure | on-failure:횟수 | always]`. **기본은 no(재시작 안 함). always 로 만들면 예기치 않게 중단돼도 알아서 재시작**. 재시작 횟수가 많다면 내부 문제가 있다는 신호이므로 살펴볼 것. 쿠버네티스는 기본값이 always / `--env`(슬라이드 후반부는 `--env, -e`) 환경변수 지정(여러 개면 -e 를 여러 번 써도 되고, 아주 많으면 `--env-file` 로 환경 변수 파일을 만들어 지정) / `-v, --volume=호스트경로:컨테이너경로` 호스트 경로와 컨테이너 경로의 공유 볼륨 설정(Bind mount 라고도 함, 호스트와 컨테이너 간 디렉터리 공유, NFS 와 유사한 개념이며 별도 챕터에서 다룸) / `-h` 컨테이너 호스트명 지정(미지정 시 컨테이너 ID 가 호스트명으로 등록, 컨테이너 ID 는 식별력이 떨어지므로 -h 로 호스트명을 지정하기도 함) / `-p [Host 포트]:[Container 포트], --publish` 호스트 N 번 포트로 들어온 트래픽을 컨테이너의 M 번 포트로 전달 / `-P, --publish-all=[true|false]` 컨테이너 내부의 노출된(expose) 포트들을 호스트의 임의 포트에 게시. 명시하지 않으면 도커가 가진 임의 포트를 호스트 포트로 잡고, 이미지에 EXPOSE 된 컨테이너 포트와 자동 연결(암시적 포트 매핑) / `--workdir, -w` 컨테이너에 들어갈 때 시작 경로를 지정, 경로가 없으면 자동으로 만들어 들어감, 보통 애플리케이션 소스 경로를 지정. 강사는 이 옵션들이 실제 운영에서 상당히 유용하니 주의 깊게 쓰라고 하며, 이 표 외에도 옵션이 더 있으니 공식 레퍼런스를 참고하라고 했다.
- **docker top / port**: 리눅스의 top 은 시스템 전체의 상태(리소스, 프로세스)를 보여 주지만, `docker top` 은 작은 가상화 단위인 **컨테이너 내부에서 실행 중인 프로세스** 정보를 보여 준다(runapp.js 를 돌리는 프로세스: `/sbin/tini -- node runapp.js`, `node runapp.js`). `docker port` 는 컨테이너에 매핑된 포트만 따로 볼 때 쓴다. 결과가 두 줄인 것은 앞의 것이 IPv4(0.0.0.0), 뒤의 것이 IPv6([::])이기 때문. `-p` 를 쓰면 호스트에 **docker-proxy** 프로세스가 등장한다. `sudo netstat -nlp | grep 6060` 으로 6060 포트를 잡고 있는 프로세스가 docker-proxy 임을 확인하고, `ps -ef` 로 보면 "프로토콜 TCP 로 호스트 IP 0.0.0.0 의 6060 트래픽을 컨테이너 IP 172.17.0.6 의 6060 포트로 전달하라"는 의미의 인자가 붙어 있다(docker-proxy 의 역할). (화면의 PID 6160 은 실습 당시 값.)
- **docker stats**: 컨테이너의 CPU·메모리·네트워크·디스크 I/O·프로세스 수 같은 **자원 소비 통계를 실시간 스트림**으로 계속 갱신해 보여 준다. 별도 터미널에서 `curl localhost:6060` 을 여러 번 치면 NET I/O 값이 바뀌는 것을 볼 수 있고, 멈출 때는 Ctrl+C. 컨테이너 이름을 여러 개 뒤에 붙이면 여러 컨테이너의 통계를 동시에 볼 수 있다. top/port 는 프로세스·열린 포트를 보여 주는 기본 정보이고 stats 는 실시간 스트림 데이터이므로, 그 시점의 값을 한 번만 찍고 끝내려면 **`--no-stream`** 옵션(슬라이드: "스트림 통계 비활성화").
- **cAdvisor**: stats 가 보여 주는 값이 컨테이너 표준 메트릭의 일부이며 이를 더 자세히 수집·시각화하는 도구로 구글이 제공하는 오픈 소스 컨테이너 모니터링 도구 cAdvisor 를 소개(자원 소비 파트에서 다시 자세히 다룰 예정). `--restart=always` 앞서 설명한 재시작 정책(이후 cAdvisor 를 계속 쓸 예정이라 always). `--volume` 여러 줄은 호스트 경로를 컨테이너에 공유(볼륨은 아직 배우지 않았으므로 지금은 형태만 소개), `ro` 는 읽기 전용, `rw` 는 읽기/쓰기. `--publish=9559:8080` 컨테이너 내부 포트는 8080 이지만 8080 은 흔히 쓰이는 범용 포트라 중복 가능성이 있어 호스트 쪽에는 쓰지 않고 **9559** 로 잡았다. `--detach=true --name=cadvisor` 백그라운드 실행, 이름 cadvisor. `docker ps` 에서 처음 실행한 직후에는 `starting` 으로 보이다가 2~3초 뒤 `healthy` 가 되면 정상 동작이 시작된 것. 브라우저에서 호스트 IP 의 9559 포트(192.168.56.101:9559)로 접속하면 cAdvisor 화면이 나오고 **Docker Containers** 에서 실행 중인 컨테이너(cadvisor, node-run 등)를 골라 CPU 할당(코어), 메모리, 네트워크 트래픽을 실시간 차트로 볼 수 있다. 외부에서 접근하면 그 네트워크 트래픽이 그래프에 잡히며 앞서 본 docker stats 값과 같은 성격의 메트릭.
- **docker logs**: 컨테이너 안에서 일어나는 일 중 **표준 출력(stdout)과 표준 에러(stderr)** 로 나오는 내용을 `docker logs` 로 본다(stdin, stdout, stderr 세 가지 중 출력 계열). `-f` 는 실시간 follow(리눅스 `tail -f` 와 같은 구조). node-run 의 주 목적은 runapp.js 를 돌리는 것이므로 그 프로그램이 찍는 메시지가 곧 표준 출력이며, 별도 터미널에서 3초마다 `curl` 을 날리면 `Your Connected.` / `Your request arrived.` 가 쌓인다.
- **로그가 쌓이면 디스크 full 의 원인**: `docker info | grep -i log` -> 기본 **Logging Driver 는 json-file**(그 밖에 awslogs, fluentd, gcplogs, gelf, journald, local, logentries, splunk, syslog 등 다양한 방식으로 내보낼 수 있음). 컨테이너를 많이 돌리면 컨테이너마다 json 로그가 계속 발생하므로 관리하지 않으면 **디스크 full 이 될 수 있다**(슬라이드: "출력되는 로그 양이 큰 경우, disk full error 의 원인이 되기도 함"). 로그는 `/var/lib/docker/containers/<컨테이너 ID>/<ID>-json.log` 파일에 쌓이며 시간이 지나면 용량이 계속 커진다(예: 14728 바이트 -> 16K).
- **방법 1 - 로그 파일 비우기**: `sudo truncate -s 0 <로그 파일>` 로 0바이트로 만들어 버린다(실행 후에도 컨테이너가 계속 돌고 있으므로 0바이트에서 다시 쌓이기 시작, 시연에서 182바이트가 됨. 강사: "그냥 지우는 방법"). 로그를 따로 백업할 수도 있지만 정기적으로(예: 리눅스 crontab) 로그 파일을 0바이트로 만들어 버리는 방법도 있다고 소개.
- **방법 2 - 로그 로테이션(더 현명한 방법)**: 컨테이너에서 발생하는 **로그 크기를 제한**. 도커 데몬 설정 파일 `/etc/docker/daemon.json` 에 `max-size 30m, max-file 10`(30MB 짜리 파일을 최대 10개만 유지 = 로그 로테이션)을 넣는다. 앞서 프라이빗 레지스트리를 만들 때 넣었던 `insecure-registries` 항목을 유지한 채 log-driver 와 log-opts 를 함께 포함시킨다. 저장 후 **데몬을 재시작해야 daemon.json 이 적용**되며 `systemctl status docker.service` 로 `active (running)` 확인. 이제부터 만드는 모든 컨테이너는 이 로그 로테이션 설정을 따른다.
- **방법 3 - 개별 컨테이너 단위**: 슬라이드의 "또는," 아래 명령처럼 `docker run` 에 `--log-driver`, `--log-opt` 옵션을 붙이면 그 컨테이너(node-run2)만 제한을 받는다(영상에서 실행 화면은 나오지 않음, 강사는 각자 돌려 보라고 권함). **로그 크기를 제한하는 방법은 두 가지: (1) daemon.json 에 넣어 도커 전체(이후 생성 컨테이너 전부)에 적용, (2) docker run 의 `--log-driver / --log-opt` 로 컨테이너 개별 적용.**
- **로그로 컨테이너가 안 뜬 이유 찾기(MySQL 예)**: `docker run -itd --name=mydb mysql:5.7-debian` 후 `docker ps` 에는 안 보이고 `docker ps -a` 로 보면 **Exited (1)**(종료 코드 1). 종료 코드에는 0, 1, 127 등이 있지만 정확히 **왜 시작되지 않았는지는 `docker logs mydb` 로 알 수 있다**(이미 종료된 컨테이너의 로그이므로 -f 없이 조회). 로그가 세 환경 변수 중 하나를 반드시 지정하라고 알려 주고(`MYSQL_ROOT_PASSWORD`, `MYSQL_ALLOW_EMPTY_PASSWORD`, `MYSQL_RANDOM_ROOT_PASSWORD`), 도커 허브 설명에도 MySQL 이미지는 `MYSQL_ROOT_PASSWORD` 를 받게 되어 있다. 해결: 같은 이름으로 다시 만들려면 `docker rm mydb` 로 지운 뒤 `-e` 로 root 비밀번호 환경 변수를 넣어 다시 실행하면 `Up`. (비밀번호 값은 교육용 예시이며, 음성 자막은 "패스 1,2,3,4" 로 잘못 인식되어 화면 표기를 따랐다.) **컨테이너가 안 뜰 때는 `ps -a` -> `logs` 순서로 원인을 찾는다**(강사: 에러·문제가 발생했을 때 컨테이너 내부에서 발생한 로그를 확인하는 용도로 주로 쓴다).
- **docker inspect**: 이미지는 `docker image inspect`, 만들어진 컨테이너의 내부 정보는 `docker inspect` 또는 `docker container inspect`(컨테이너 단어는 생략 가능). 이미지는 정적이고 컨테이너는 동적이라는 차이가 있으며 동적이라는 것은 곧 **네트워킹**을 갖는다는 뜻. inspect 로 확인할 수 있는 정보: 내부에 설정된 여러 **환경 설정** / **네트워킹**(네트워크 namespace 가 엔드포인트 ID 를 통해 컨테이너의 이더넷 IP, MAC 주소 등을 세팅, 하단에서 컨테이너가 어떤 포트와 IP 를 쓰는지 알 수 있음. 예: SandboxKey, Gateway 172.17.0.1, IPAddress 172.17.0.4, IPPrefixLen 16, MacAddress 02:42:ac:11:00:04, Networks.bridge) / **자원 활용**(자원 할당은 cgroup 에 의해 이뤄지는데 **기본값은 Unlimit**(할당 제한 없음), 이 부분은 뒤에서 다룸).
- **docker cp / restart**: 운영 중인 애플리케이션의 소스가 바뀌었을 때(CI/CD 로 자동화하는 방법은 나중에 배움) 실행 중인 node-run 에 새 소스를 넣어 본다. runapp.js 의 로그 메시지의 "Your" 를 `fastcampus` 로 바꿔 `docker cp runapp.js node-run:/app/runapp.js`(Successfully copied 2.05kB). `docker cp` 는 리눅스의 scp 와 같은 형태로, scp 가 `호스트명:경로` 라면 docker cp 는 **컨테이너명:경로**. 그런데 copy 직후 `docker logs` 를 보면 여전히 예전 메시지가 나온다 - 실행 중인 node 프로세스가 이미 옛 코드를 메모리에 올려 두었기 때문이므로 **`docker restart node-run` 이 필요**하다. 재시작 후 로그를 보면 새 메시지로 바뀐 것을 확인.
- **docker cp 사용 형태**: 컨테이너 -> 호스트: `docker container cp <컨테이너명 또는 ID>:<컨테이너 내의 파일 경로> <호스트 디렉터리>`, 호스트 -> 컨테이너: `docker container cp <호스트 파일> <컨테이너명 또는 ID>:<컨테이너 내의 파일 경로>`. (슬라이드의 주석은 /etc/passwd 라고 적혀 있지만 그 아래 실제 명령은 컨테이너의 `/var/log/` 를 호스트로 복사하는 형태.) **설정 파일 교체**: nginx 를 웹서버로 쓰다가 프록시(reverse proxy)로 바꾸려면 nginx.conf 를 수정해야 한다. webserver 컨테이너의 /etc/nginx/nginx.conf 를 호스트로 꺼내 수정한 뒤 원래 위치로 덮어쓰고 컨테이너를 재시작하면 웹서버였던 nginx 가 프록시로 전환된다. **강사 권장: 소스는 단순히 copy 만으로 끝날 수 있지만, nginx 처럼 구동과 관련된 설정 파일(configuration)은 적용하려면 반드시 restart 가 필요하다.** 

### [사용한 CLI]

**1) 예제 앱 파일 (~/fastcampus/ch05)**
```javascript
// runapp.js
const http = require('http');
const server = http.createServer().listen(6060);
server.on('request', (req, res) => {
      console.log('Your request arrived.');
      res.write("HostName: " + process.env.HOSTNAME + "\n");
      res.end();
});
server.on('connection', (socket) => {
      console.log("Your Connected.");
});
```
```dockerfile
# Dockerfile
FROM node:20-alpine3.17
RUN apk add --no-cache tini curl
WORKDIR /app
COPY runapp.js .
EXPOSE 6060
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "runapp.js"]
```
| Dockerfile 명령 | 설명 |
|---|---|
| `FROM node:20-alpine3.17` | 베이스 이미지 |
| `RUN apk add --no-cache tini curl` | Alpine 패키지 매니저 apk 로 tini, curl 설치 |
| `WORKDIR /app` | 작업 디렉터리 지정(cd 효과) |
| `COPY runapp.js .` | 호스트 파일을 컨테이너 /app 로 복사 |
| `EXPOSE 6060` | 6060 포트 사용을 문서화 |
| `ENTRYPOINT ["/sbin/tini", "--"]` / `CMD ["node","runapp.js"]` | tini 를 통해 runapp.js 실행 |

```bash
docker build -t noderun:1.0 .                 # -t 이름:태그, 마지막 '.' = Dockerfile 이 있는 현재 디렉터리
docker images | grep noderun                  # 183MB
docker image history noderun:1.0
```

**2) docker run 형식과 주요 옵션**
```bash
# docker [container] run [option] docker_image [command]
docker run -itd -p 6060:6060 --name=node-run -h node-run noderun:1.0
docker ps | grep node
curl localhost:6060                           # HostName: node-run
```
| 옵션 | 설명 |
|---|---|
| `-i, --interactive` / `-t` / `-d, --detach=true` | 표준입력 유지 / 가상 TTY / 백그라운드 실행 (`-itd` 로 합쳐 사용) |
| `--name` | 컨테이너 이름 지정 (미지정 시 자동 생성) |
| `--rm` | 컨테이너 종료 시 자동 삭제 |
| `--restart` | 재시작 정책 `[no \| on-failure \| on-failure:n \| always]` (기본 no) |
| `--env, -e` | 환경 변수 전달 (`--env-file` 로 파일 지정 가능) |
| `-v, --volume=호스트:컨테이너` | 볼륨 / bind mount |
| `-h` | 컨테이너 hostname 지정 (기본: 컨테이너 ID) |
| `-p [호스트포트]:[컨테이너포트], --publish` | 포트 매핑 (호스트 N -> 컨테이너 M) |
| `-P, --publish-all` | EXPOSE 된 포트를 호스트의 임의 포트(32768~)에 자동 매핑 |
| `--workdir, -w` | 컨테이너 작업 디렉터리 지정 |

**3) 모니터링: top / port / stats**
```bash
docker top node-run             # 컨테이너 내부 프로세스 (tini, node runapp.js)
docker port node-run            # 6060/tcp -> 0.0.0.0:6060, [::]:6060
sudo netstat -nlp | grep 6060   # docker-proxy 가 LISTEN
ps -ef | grep 6160              # /usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 6060 -container-ip 172.17.0.6 -container-port 6060
docker stats                    # CPU %, MEM USAGE / LIMIT, NET I/O, BLOCK I/O, PIDS 실시간 (Ctrl+C 종료)
docker stats node-run
docker stats --no-stream        # 1회만 출력
```

**4) cAdvisor 로 시각적 모니터링**
```bash
docker run \
   --restart=always \
   --volume=/:/rootfs:ro \
   --volume=/var/run:/var/run:rw \
   --volume=/sys/fs/cgroup:/sys/fs/cgroup:ro \
   --volume=/var/lib/docker/:/var/lib/docker:ro \
   --volume=/dev/disk/:/dev/disk:ro \
   --publish=9559:8080 \
   --detach=true \
   --name=cadvisor \
   --privileged \
   --device=/dev/kmsg \
   gcr.io/cadvisor/cadvisor:latest
docker ps | grep cadvisor       # Up ... (healthy)  (starting 후 healthy)
# 브라우저: http://192.168.56.101:9559  -> Docker Containers 에서 컨테이너별 CPU/메모리/네트워크 확인
```
- `:ro` 읽기 전용, `:rw` 읽기/쓰기. 호스트 9559 -> 컨테이너 8080.

**5) docker logs 와 로그 관리**
```bash
# 부하 생성(터미널 1) + 로그 follow(터미널 2)
while true; do curl 192.168.56.101:6060; sleep 3; done
docker logs -f node-run                    # -f : follow (tail -f 처럼 실시간)

docker info | grep -i log                  # Logging Driver: json-file  (사용 가능 드라이버 목록 포함)
sudo ls -l /var/lib/docker/containers                 # 컨테이너 ID 별 디렉터리 목록
sudo ls -l /var/lib/docker/containers/<컨테이너ID>/    # <ID>-json.log 확인

# 방법 1) 로그 파일 비우기
sudo ls -lh /var/lib/docker/containers/<컨테이너ID>/
sudo truncate -s 0 /var/lib/docker/containers/<컨테이너ID>/<컨테이너ID>-json.log   # 크기 0으로 (정기적 실행은 crontab 등 활용)
```
```bash
# 방법 2) daemon.json 으로 전체 컨테이너 로그 로테이션 설정
sudo vi /etc/docker/daemon.json
```
```json
{ "insecure-registries": ["192.168.56.101:5000"],
  "log-driver": "json-file",
  "log-opts": {
     "max-size": "30m",
     "max-file": "10"
  }
}
```
```bash
sudo systemctl restart docker.service
sudo systemctl status docker.service        # active (running)

# 방법 3) 컨테이너 단위로 run 옵션 지정 (이미 있는 컨테이너에는 적용되지 않으므로 새로 run)
docker run -itd -p 6062:6060 --name=node-run2 \
  -h node-run --log-driver json-file --log-opt max-size=30m --log-opt max-file=10 \
  noderun:1.0
```
- 30MB 파일 10개까지 유지 = 최대 약 300MB.

**6) 컨테이너가 종료될 때 원인 분석 (MySQL 예)**
```bash
docker run -itd --name=mydb mysql:5.7-debian
docker ps | grep mydb            # 안 보임
docker ps -a | grep mydb         # Exited (1)
docker logs mydb
#   [ERROR] Database is uninitialized and password option is not specified
#   You need to specify one of the following as an environment variable:
#   - MYSQL_ROOT_PASSWORD / - MYSQL_ALLOW_EMPTY_PASSWORD / - MYSQL_RANDOM_ROOT_PASSWORD
docker rm mydb
docker run -itd --name=mydb -e MYSQL_ROOT_PASSWORD=<PASSWORD> mysql:5.7-debian
docker ps -a | grep mydb         # Up
```
- (자료의 비밀번호는 실습용 예시 값. 실제 환경에서는 안전한 값 사용.)

**7) 컨테이너 상세 조회**
```bash
docker container inspect node-run      # = docker inspect node-run (컨테이너 대상)
#   SandboxKey, Gateway(172.17.0.1), IPAddress(172.17.0.4), MacAddress, Networks.bridge ...
```

**8) 파일 복사(cp)와 재시작(restart)**
```bash
vi runapp.js        # 로그 메시지를 'fastcampus request arrived.' / 'fastcampus Connected.' 로 수정
docker cp runapp.js node-run:/app/runapp.js       # Successfully copied 2.05kB
docker restart node-run
docker ps | grep node                             # Up N seconds (재시작 확인)
docker logs -f node-run

# 형식
docker container cp <컨테이너명>:<컨테이너 경로> <호스트 경로>      # 컨테이너 -> 호스트
docker container cp <호스트 경로> <컨테이너명>:<컨테이너 경로>      # 호스트 -> 컨테이너

# 예시
docker run -itd --name=my_container centos
docker cp my_container:/var/log/ /home/kevin/centos_log/
touch local.txt
docker cp ./local.txt my_container:/tmp/local.txt
docker exec -it my_container ls /tmp

# nginx 설정 파일 가져오기 / 수정본 넣고 재시작 (reverse proxy 설정 등에 활용)
docker run -d -p 7777:80 --name=webserver nginx:1.25.0-alpine
docker cp webserver:/etc/nginx/nginx.conf /home/kevin/nginx.conf
docker cp nginx.conf webserver:/etc/nginx/nginx.conf
docker restart webserver
```

### [확인 방법/주의점]
- `docker top` / `docker stats` / cAdvisor 로 프로세스·자원 사용량 확인. `docker ps` 에서 cAdvisor 가 `healthy` 가 될 때까지 몇 초 걸린다.
- 컨테이너가 안 떠 있으면 먼저 `docker ps -a`, 그리고 `docker logs <컨테이너>`. 종료 코드가 0/1/127 등이면 오류 확인.
- 로그는 크기 제한 설정이 없으면 계속 증가한다. daemon.json 변경 후엔 Docker 재시작이 필요하며, 이미 만들어진 컨테이너에는 적용되지 않는다(새로 run).
- `docker cp` 는 scp 와 유사하게 `대상:경로` 형식. 설정 파일을 복사한 뒤에는 `docker restart` 로 반영.

---

## Step 9. 컨테이너 운용 CLI (2): events, stop/pause, kill, attach/exec, diff, commit, export/import

### [목적]
- 컨테이너 상태 제어(stop/start/pause/unpause/kill)와 이벤트 확인, 접속(attach/exec), 변경 확인(diff), 이미지화(commit), 파일시스템 내보내기/가져오기(export/import)를 익힌다.

### [이론 설명]
- `docker events`(= `docker system events`): Docker 에서 발생하는 이벤트를 실시간 출력. `--until`, `--since`, `--filter "key=value"` 옵션 사용(자료: 기본 최근 1000건).
- `docker stop` 은 SIGTERM(15)을 보내 정상 종료(Exited 0 또는 143), `docker kill` 은 기본 SIGKILL(9)로 강제 종료(Exited 137). `docker pause` 는 Linux freezer cgroup 으로 프로세스를 일시 정지(STATUS `Up ... (Paused)`), `unpause` 로 재개.
- 종료 코드(exit code): 0 정상, 1 애플리케이션 오류, 125 docker run 자체 오류, 126 명령 실행 불가, 127 명령 없음, 134 비정상 종료(SIGABRT), 137 SIGKILL, 139 세그멘테이션 오류(SIGSEGV), 143 SIGTERM, 255 범위 초과. 신호로 종료된 경우 128 + 신호번호 (9 -> 137, 15 -> 143).
- **attach vs exec**: attach 는 컨테이너의 메인 프로세스(PID 1)의 입출력에 붙는 것이라 Ctrl+C 시 컨테이너가 종료될 수 있다. exec 는 실행 중 컨테이너에서 **새 프로세스**를 실행하므로 종료해도 컨테이너는 영향이 없다. 빠져나올 때 `Ctrl+P, Ctrl+Q`.
- **diff**: 컨테이너 파일시스템 변경 내역. `A`(추가), `D`(삭제), `C`(변경).
- **commit**: 컨테이너의 변경된 상태를 새 이미지로 저장(권장은 Dockerfile 로 build).
- **export/import**: `docker export` 는 컨테이너 파일시스템을 tar 로 내보내고, `docker import` 로 이미지화한다. `save/load` 와 달리 layer/메타정보(CMD 등)가 사라지므로 import 한 이미지를 run 하면 `No command specified` -> import 시 `--change` 로 CMD 지정하거나 Dockerfile 로 CMD 를 추가해 build.

**[원문 한글 자료 기반 보강 - 033 Clip 3]**
- (참고) 위 이론의 "attach 는 Ctrl+C 시 컨테이너가 종료될 수 있다"는 033 자료에서 명시적으로 확인되지 않는다(자료는 "멈출 때는 Ctrl 키 조합"이라고만 설명). 아래 강사 정리를 기준으로 한다.
- **docker events**: 정식 명령은 `docker system events`. 명령을 건 **순간부터** Docker 엔진 내부에서 발생하는 이벤트(시그널)를 한 줄씩 실시간 출력한다. 앞서 계속 돌려 둔 curl 루프(3초 간격으로 6060 포트에 요청)를 그대로 두고, 지금까지 로그(logs)와 자원 사용량(stats)으로 상태를 봤다면 이번에는 다른 방법인 events 를 소개. 화면에는 cAdvisor 컨테이너가 헬스체크를 하는 `exec_create / exec_start / exec_die` 이벤트가 계속 올라오는 것을 볼 수 있다. events 는 **마지막 1000개 이벤트만 기록**하며 옵션으로 조회 범위를 좁힐 수 있다: `--until time(h|m|s)`(10분 전, 1시간 전 등 정해 준 시간까지의 이벤트), `--since date1 date2`(특정 날짜와 날짜 사이 이벤트 출력), `--filter "key=value"`(키=값 조건으로 걸러 해당 이벤트만 조회).
- **stop / start**: curl 루프를 잠시 멈추고 `docker stop node-run` 을 실행하면 events 창에 컨테이너 `kill`(시그널 전달) -> 브리지 네트워크 연결 해제(network disconnect) -> 컨테이너 `die`(종료) 순서로 이벤트가 찍힌다. 이어서 `docker start node-run` 을 하면 네트워크를 다시 연결하고 컨테이너를 시작하는 이벤트가 기록된다. 강사 정리: "start 는 프로세스를 기동하고 stop 은 프로세스를 죽이는 작업인데, 내부적으로는 네트워크 연결·해제까지 함께 수행한다." `docker stop` 은 컨테이너의 메인 프로세스에 **SIGTERM(정상 종료 요청)** 을 보내므로 `docker ps -a` STATUS 에 `Exited (143 or 0)` 가 남는다(143 = 128 + 15, 15 가 SIGTERM).
- **pause / unpause**: `docker pause node-run` 을 실행하면 events 창에 `container pause` 가 기록되고, 이 상태에서 curl 루프를 돌려도 **응답이 오지 않는다**(프로세스가 움직이지 않는 상태이기 때문). `docker unpause node-run` 을 하면 다시 프로세스가 동작하고 curl 루프에 `HostName: node-run` 응답이 다시 나타난다. 슬라이드 주석대로 pause 는 리눅스의 **freezer cgroup** 으로 프로세스를 일시 중지하는 방식이며 STATUS 는 `Up ... (Paused)`. start/stop/pause/unpause 는 모두 컨테이너의 **운영 상태**를 바꾸는 명령이고 그 결과는 docker events 에 이벤트로 남는다.
- **kill 과 시그널**: `kill` 은 프로세스에 "시그널"을 보내는 명령이고 `kill -l` 로 종류를 볼 수 있다. 강사도 전부 써 본 것은 아니며 보통 많이 쓰는 것은 **정상 종료 15번(SIGTERM)과 강제 종료(SIGKILL, 9번)**. `docker kill` 은 컨테이너에 SIGKILL(강제 종료 시그널)을 보내 즉시 멈추는 명령(리눅스에 kill 이 있듯이 도커에도 docker kill). 실습: 터미널3 에서 `docker exec -it node-run sh` 로 접속해 둔 상태(Alpine Linux v3.17.4 임을 `cat /etc/os-release` 로 확인, /app 디렉터리)에서 터미널4 에서 `docker kill node-run` -> events 창에 `container kill ... signal=9` 이벤트가 기록되고 접속해 있던 세션은 끊어진다. (슬라이드 주석에는 "docker start 는 SIGKILL 보냄"이라고 적혀 있으나 실제 명령은 `docker kill node-run`.) 이후 `docker ps -a` 의 STATUS 는 `Exited (137)`.
- **exit code 표(슬라이드)**: 0 의도적으로 중지(컨테이너가 자동으로 중지되었음을 나타내기 위해 개발자가 사용) / 1 신청 오류(애플리케이션 오류 또는 이미지 사양의 잘못된 참조로 인해 컨테이너가 중지됨) / 125 컨테이너 실행 실패 오류(docker run 명령이 성공적으로 실행되지 않음) / 126 명령 호출 오류(이미지 사양에 지정된 명령을 호출할 수 없음) / 127 파일 또는 디렉터리를 찾을 수 없음(이미지 사양에 지정된 파일 또는 디렉터리를 찾을 수 없음) / 128 종료 시 잘못된 인수가 사용되었음(잘못된 종료 코드로 종료가 실행됨, 유효한 코드는 0-255 사이의 정수) / 134 비정상 종료(SIGABRT: 컨테이너가 abort() 함수를 사용하여 자체적으로 중단됨) / 137 즉시 종료(SIGKILL: 운영 체제에 의해 즉시 종료됨) / 139 분할 결함(SIGSEGV: 할당되지 않은 메모리에 액세스하려고 시도하여 종료됨) / 143 단계적 종료(SIGTERM: 곧 종료될 것이라는 경고를 받은 후 종료됨, graceful) / 255 종료 상태가 범위를 벗어남(종료 코드가 허용 가능한 범위를 벗어나 반환, 오류의 원인을 알 수 없음). 강사 설명: 0번은 내가 의도적으로 멈춘 **정상 종료**, **137번은 앞에서 본 kill 시그널로 강제 종료**가 요청되어 끝났다는 뜻, **143번은 SIGTERM(15번)으로 정상 종료된 것으로 graceful shutdown** 이라 부른다(종료 코드 = 128 + 시그널 번호이므로 9번 -> 137, 15번 -> 143).
- **docker kill vs 리눅스 kill 비교**: 컨테이너도 결국 호스트의 프로세스이므로 호스트에서 `ps -ef` 로 조회할 수 있고, 여기서 얻은 PID 에 리눅스 `kill -9 PID` 를 던져 보라고 권했다(강사 설명에 따르면 이 경우에는 접속해 있던 세션만 끊어질 뿐 컨테이너 자체는 죽지 않았고, docker kill 은 컨테이너를 137 코드로 중단시켰다). 직접 두 방식을 비교해 볼 가치가 있다는 강조. (이전 문서의 "호스트에서 kill -9 PID 해도 비슷하게 종료 코드 137" 은 자료와 상충하므로 위 강사 설명을 따른다.)
- **attach**: 샘플 컨테이너 `docker run -d --name top-container ubuntu:22.04 /usr/bin/top -b`(배치 모드: 화면을 갱신하지 않고 계속 출력)를 백그라운드(-d)로 실행했기 때문에 화면에는 아무것도 나오지 않는다. 여기에 `docker attach top-container` 로 붙으면 컨테이너 안에서 실행 중인 top 의 출력이 계속 화면에 흘러나온다.
- **exec 두 가지 방식**: `docker run -itd --name=my_container alpine sh` 로 띄우고 `docker exec -d my_container touch /tmp/exec_test`(**-d: 명령을 백그라운드로 실행하고 결과를 기다리지 않음**, /tmp 아래 exec_test 파일이 만들어짐), `docker exec -it my_container sh`(**-it: 컨테이너 안 셸에 직접 들어가 대화형으로 작업**, 화면의 `read escape sequence` 는 **Ctrl+P, Ctrl+Q** 로 컨테이너를 종료하지 않고 빠져나올 때 나오는 메시지), `docker exec -it my_container ls /tmp`(들어가지 않고 명령 한 번만 실행해 결과만 받기). 강사 정리: **attach 는 컨테이너 안에서 돌아가는 로그·출력을 가볍게 조회할 때, 멈출 때는 Ctrl 키 조합. exec 는 말 그대로 실행이므로 컨테이너 안에서 파일을 만들거나 작업을 수행할 때 쓴다. 작업이 많으면 들어가서(-it) 하고, 간단한 조회는 exec 로 명령만 던져도 된다.**
- **docker diff**: 실행 중인 컨테이너에서 **이미지 원본 대비 파일·디렉터리가 어떻게 변경되었는지** 보여 준다. 기호: `A`(A file or directory was added, 추가), `D`(deleted, 삭제), `C`(changed, 변경). 실습에서 컨테이너에 접속해 file1 을 만들었다 지우고(`touch file1`, `rm file1`) 사용자 kevin 을 추가(`adduser kevin`)한 뒤 diff 를 실행하면 총 11건 변경: `C /etc`, `C /etc/group`, `C /etc/passwd`, `C /etc/passwd-`, `C /etc/shadow-`, `C /etc/group-`, `C /etc/shadow`, `C /home`, `A /home/kevin`, `C /root`, `A /root/.ash_history`. 슬라이드의 예시와 실제 결과는 다를 수 있다(중간에 컨테이너를 죽였다 살렸기 때문). 또 **만들었다가 지운 file1 은 완전히 삭제되었으므로 기록에 남지 않는다**(추가만 했다면 A 로 남았을 것).
- **docker commit**: 기존 이미지로 띄운 컨테이너 안에서 작업한 뒤 **변경된 상태 그대로 새 이미지로 저장**하고 싶을 때 쓴다. 강사는 앞 실습에서 `docker cp` 로 runapp.js 를 다시 넣어 로그 메시지가 "fastcampus Connected." 로 바뀐 node-run 컨테이너를 예로 들었다. `docker commit node-run node-run:2.0`(또는 슬라이드의 `noderun:2.0`) -> `docker images` 로 새 이미지 확인(용량은 거의 그대로, 글자만 바꿨기 때문) -> `docker run -itd --name=node-run3 -p 6063:6060 <새 이미지>` -> curl 응답의 HostName 은 컨테이너 ID 로 나오고(이 이미지로 만든 컨테이너는 호스트 이름을 따로 주지 않았으므로), 로그에는 변경된 "fastcampus Connected." 메시지가 나온다. **실행 중인 컨테이너의 변경 사항을 아예 새 이미지로 저장하고 싶을 때 docker commit 이 유용**하다. **오류 주의**: 이미지 이름에 하이픈이 있는지(node-run) 없는지(noderun) 꼭 확인하라. 실제 실습 화면에서 강사가 `node-run:2.0` 으로 commit 해 놓고 `noderun:2.0` 으로 run 하여 `Unable to find image 'noderun:2.0' locally` / `pull access denied for noderun, repository does not exist or may require 'docker login'` 오류가 났고(없는 이름은 Docker Hub 에서 pull 을 시도하다 "pull access denied"), `node-run:2.0` 으로 고쳐 정상 실행.
- **export / import 개념**: 컨테이너를 이미지로 만드는 commit 과 달리, **파일로 내보내는 명령이 `docker export`**, 그 파일을 다시 넣는 명령이 `docker import`. export 는 실행 중인 컨테이너의 파일 시스템을 **tar 아카이브**로 내보내며 컨테이너 백업이나 마이그레이션(서버 이전)에 쓸 수 있다. **`image save` 는 레이어(layer) 단위 정보를 모두 담지만, `export` 는 이미지의 레이어 내용을 포함하지 않고 컨테이너 안의 파일 시스템 전체를 하나의 레이어로 통합**해서 가져온다. 그래서 save 로 만든 tar 와 다르고 실행 방식도 달라진다.
- **export 실습과 서버 간 전달(scp)**: `docker export node-run > node-run.tar`(리다이렉트로 파일 저장, 용량에 따라 시간이 걸림), `tar tvf node-run.tar` 로 내용 확인(usr/share/ca-certificates/..., var/spool/... 처럼 파일 시스템 전체를 통째로 하나로 가져온 것을 확인). `sudo scp node-run.tar kevin@192.168.56.102:/home/kevin` 으로 2번 서버(hostos2)에 전달. **처음에는 호스트 이름(hostos2)이 이름 풀이에 실패(`Could not resolve hostname hostos2: Temporary failure in name resolution`)** 해서 IP 로 바꿨더니 **사용자 이름을 붙이지 않아 root 로 접속을 시도해 `Permission denied`** 가 났고, 사용자 이름(`kevin@`)을 붙여 전송이 진행되었다.
- **import 와 "No command specified" 오류**: 2번 서버에서 `cat node-run.tar | docker import - node-run:3.0`("-" 는 표준 입력(파이프로 넘긴 tar)에서 읽는다는 뜻). 2번 서버에는 node 관련 이미지가 전혀 없으므로 `docker images` 에 node-run:3.0 이 새로 생긴다. 이 이미지로 컨테이너를 실행하면 `docker: Error response from daemon: No command specified.` 오류. 슬라이드 설명: 이 오류는 export 를 통해 만들어진 이미지가 **단순히 컨테이너의 파일시스템을 아카이빙해서 만든 이미지**이기 때문이며, 그래서 컨테이너를 run 할 때 **실행할 명령(CMD)** 이 요구된다. "컨테이너가 갖고 있던 파일 시스템 전체는 가져오지만 그 안에서 동작하던 기본 실행 명령은 가져올 수 없다." (참고: 영상에서 먼저 `noderun:3.0` 으로 이름 오타를 내어 `pull access denied for noderun` 오류가 한 번 더 났다 - 이미지명은 `node-run:3.0` 이다.)
- **해결법 1 - import 시 `--change` 로 CMD 추가**: 잘못 만든 node-run:3.0 을 `docker rmi` 로 지운 뒤 `docker import --change 'CMD ["node", "/app/runapp.js"]' node-run.tar node-run:3.0` -> CMD 값이 이미지와 함께 등록되므로 정상 실행되고 6064 포트로 curl 하면 HostName 이 컨테이너 ID 로 응답.
- **해결법 2 - Dockerfile 로 CMD 추가 후 build**: CMD 없이 import 한 이미지(node-run:4.0)를 **부모(베이스) 이미지**로 삼고 Dockerfile 에서 CMD 만 추가해 build(강사: Dockerfile 은 다음 장에서 "베이스 이미지에 CMD 만 추가한다" 정도로 간단히). `docker build -t node-run:5.0 -f Dockerfile_noderun4 .`(`-f` 로 Dockerfile 이름 지정) -> `docker run -itd --name=node-run5 -p 6065:6060 node-run:5.0` -> `curl localhost:6065`. **강사 결론: 컨테이너를 백업하려고 export/import 를 할 때는 "No command specified" 오류가 반드시 발생한다는 점을 알아 두고, 그래서 import 시 `--change` 옵션으로 CMD 를 넣거나 Dockerfile 로 빌드하는 방법을 권장한다.** (이미지 ID/크기: node-run:3.0 ~ 5.0 모두 약 182MB.)

### [사용한 CLI]

**1) events / stop / start / pause / unpause**
```bash
# 터미널 1: 부하 생성
while true; do curl 192.168.56.101:6060; sleep 3; done
# 터미널 2: 이벤트 모니터링
docker events          # docker system events 와 동일, --until time(h|m|s), --since date1 date2, --filter "key=value"
# 터미널 3: 제어
docker stop node-run
docker ps -a           # Exited (143 or 0)
docker start node-run
docker pause node-run
docker unpause node-run
docker ps -a           # STATUS: Up 10 seconds (Paused) <- pause 상태일 때
```

**2) 시그널 목록과 docker kill**
```bash
kill -l                # 9) SIGKILL, 15) SIGTERM 등 시그널 목록
docker exec -it node-run sh    # /app # (Alpine Linux)
/app # cat /etc/os-release     # Alpine Linux v3.17.4 확인
docker kill node-run           # (다른 터미널에서 실행) 접속 세션이 끊어짐
docker ps -a           # Exited (137) 1 second ago
docker start node-run  # kill 후에도 다시 start 가능
```
- events 에서 `container kill ... signal=9`, `exitCode=137` 확인.
- 호스트에서 `ps -ef` 로 PID 를 찾아 `kill -9 PID` 해 볼 것을 강사가 권했다(정정: 강사 설명에 따르면 이 경우 접속해 있던 세션만 끊어지고 컨테이너는 죽지 않았으며, docker kill 은 컨테이너를 137 로 중단시켰다. 이전 문서의 "비슷하게 137" 은 자료와 상충).

**3) attach / exec**
```bash
docker run -d --name top-container ubuntu:22.04 /usr/bin/top -b
docker attach top-container                 # top 출력에 직접 붙음

docker run -itd --name=my_container alpine sh
docker exec -d my_container touch /tmp/exec_test      # -d : 백그라운드로 명령 실행(결과 출력 없음)
docker exec -it my_container sh                       # 컨테이너 안에서 sh 접속 (Ctrl+P,Q 로 빠져나옴)
docker exec -it my_container ls /tmp                  # 접속 없이 단일 명령 실행
```

**4) diff / commit**
```bash
docker exec -it node-run sh
/app # touch file1
/app # rm file1
/app # adduser kevin
docker diff node-run
#   C /etc
#   C /etc/group, C /etc/passwd, C /etc/shadow ...
#   A /home/kevin
#   A /root/.ash_history

docker commit node-run noderun:2.0          # docker commit <컨테이너> <새이미지:태그>
docker images | grep noderun
docker run -itd --name=node-run3 -p 6063:6060 noderun:2.0
while true; do curl 192.168.56.101:6063; sleep 1; done
docker logs -f node-run3                    # 수정된 코드('fastcampus Connected.') 확인

# (실제 터미널 진행) 이미지명을 node-run:2.0 으로 commit 한 경우
docker commit node-run node-run:2.0
docker images | grep node
docker run -itd --name=node-run3 -p 6063:6060 noderun:2.0     # 오류: Unable to find image 'noderun:2.0' locally / pull access denied
docker run -itd --name=node-run3 -p 6063:6060 node-run:2.0    # 정확한 이름으로 실행
while true; do curl 192.168.56.101:6063; sleep 1; done          # HostName: <컨테이너ID>
docker logs -f node-run3
```
- 자료 주의: 컨테이너 이름 `node-run` 과 이미지 이름 `noderun` 을 혼동하면 `docker commit node-run node-run:2.0` 으로 만든 이미지를 `noderun:2.0` 으로 run 할 때 `pull access denied for noderun` 오류가 난다 -> 정확한 이름(`node-run:2.0`)으로 run.

**5) export / import (다른 호스트로 이전)**
```bash
# (hostos1) 컨테이너 파일시스템 export
docker ps                                    # export 대상 컨테이너(node-run) 확인
docker export node-run > node-run.tar
ls
tar tvf node-run.tar                         # tar 내용 확인
sudo scp node-run.tar kevin@192.168.56.102:/home/kevin     # 계정명(kevin@) 명시, 호스트명 해석 실패 시 IP 사용(root 로 접속하면 Permission denied)

# (hostos2) import
cat node-run.tar | docker import - node-run:3.0
docker images | grep node
docker run -itd --name=node-run3 -p 6064:6060 node-run:3.0
#   docker: Error response from daemon: No command specified.
```
```bash
# 해결 1) import 시 --change 로 CMD 지정
docker rmi node-run:3.0
docker import --change 'CMD ["node", "/app/runapp.js"]' node-run.tar node-run:3.0
docker run -itd --name=node-run3 -p 6064:6060 node-run:3.0
docker ps -a | grep node
curl localhost:6064                          # HostName: <컨테이너ID>

# 해결 2) Dockerfile 로 CMD 추가해 build
cat node-run.tar | docker import - node-run:4.0
vi Dockerfile_noderun4
```
```dockerfile
FROM node-run:4.0
CMD ["node", "/app/runapp.js"]
```
```bash
docker build -t node-run:5.0 -f Dockerfile_noderun4 .     # -f : Dockerfile 이름 지정
docker run -itd --name=node-run5 -p 6065:6060 node-run:5.0
docker ps | grep node-run5
curl localhost:6065
```

### [확인 방법/주의점]
- 종료 코드(143/137 등)로 종료 방식을 구분. docker stop 은 graceful(SIGTERM), kill 은 즉시 강제 종료(SIGKILL).
- `docker events` 로 stop / kill / pause / exec_create 등 이벤트 흐름 확인.
- exec 로 접속하고 `exit` 하면 컨테이너는 유지된다. 컨테이너 유지하며 빠져나올 때 `Ctrl+P, Q`.
- export/import 는 CMD, 환경변수 등 이미지 메타가 사라진다 -> `--change` 사용. 이미지 layer 와 메타를 유지하려면 `save/load` 사용.

---

## Step 10. 컨테이너 네트워크 이해

### [목적]
- Docker 컨테이너 네트워크가 리눅스 네트워크 기술(bridge, network namespace, veth pair, iptables NAT, docker-proxy)로 구현됨을 이해하고 직접 확인한다.

### [이론 설명]
- **docker network = Linux network 기술의 조합**: 네트워크 namespace, bridge, veth pair, iptables.
- **docker0 / bridge**: Linux bridge 는 OSI Layer 2 장치(MAC 주소 기반). 기본 `bridge` 네트워크(docker CLI 이름)가 호스트의 `docker0`(172.17.0.1/16) 에 해당. 사용자 정의 bridge 의 기본 대역: 172.{17-31}.0.0/16(65,536 IP) 또는 192.168.{0-240}.0/20(4,096). 만들 때마다 172.18, 172.19 ... 순으로 할당. 대역은 사설 IP(RFC 1918)에서 선택.
- **CNM(Container Network Model)** 구성: **Sandbox**(컨테이너 네트워크 환경: eth0, port, route table, DNS 설정 - network namespace), **Endpoint**(Sandbox 를 Network 에 연결하는 인터페이스: veth), **Network**(Endpoint 들의 그룹, 예: Bridge). **libnetwork** 는 CNM 의 구현체로 Service Discovery(Docker DNS), Load Balancing 등을 제공하며 Pluggable 드라이버를 지원: Bridge(단일 호스트), Overlay(멀티 호스트), MACvlan(기존 VLAN). `docker network ls` 의 DRIVER 열에서 확인.
- **veth(virtual ethernet device)**: 쌍(pair)으로 만들어지는 가상 이더넷 장치. 한쪽은 컨테이너의 eth0, 다른 쪽은 호스트의 vethXXXX 로 docker0(bridge)에 연결된다. 양방향 통신 가능한 하나의 케이블 개념.
- **iptables NAT**: 컨테이너(172.17.x.x)에서 외부로 나갈 때 MASQUERADE(SNAT), 호스트 포트로 들어온 요청은 DNAT 로 컨테이너 IP:포트로 전달.
- **overlay network**: 여러 Docker Host 에 걸친 컨테이너들을 하나의 네트워크처럼 연결(Docker swarm, ch.11 에서 다룸).
- **docker-proxy**: `-p`/`-P` 로 포트를 공개하면 호스트에서 docker-proxy 프로세스가 LISTEN 하며, iptables DNAT 규칙과 함께 컨테이너로 트래픽을 전달.

**[원문 한글 자료 기반 보강 - 034 Clip 1]**
- **챕터 6 구성**: Clip1 컨테이너 네트워크 이해, Clip2 사용자 정의 네트워크, Clip3 docker DNS(가벼운 로드밸런싱), Clip4~6 컨테이너 proxy(Nginx, HAProxy 활용). Docker 엔진 설치 시 **docker0** 이 기본 브리지 인터페이스(172.17.0.1)로 할당되는데, 이 기본 네트워크에는 **DNS 기능이 없고 테스트용에 가깝다**. 일반 서비스는 **독립된 사용자 정의 네트워크 대역**을 쓰기를 권장한다. 기본 브리지 대역 하나는 약 65,536개의 IP 를 제공하므로 필요하면 서브넷팅으로 대역을 좁힐 수 있다.
- **도커 네트워크는 리눅스 네트워크다**: 슬라이드 - "Docker network 는 커널의 네트워크 스택의 하부로, 상부에는 네트워크 드라이버를 생성한다. 즉 docker network = Linux network 와 같다." 도커 네트워크 아키텍처는 **CNM(Container Networking Model)** 이라는 인터페이스 집합 위에 구축되며, OS·인프라에 구애받지 않고 인프라 스택과 관계없이 애플리케이션이 동일한 네트워크 환경을 가질 수 있다. 리눅스 네트워킹 빌딩 블록: **리눅스 브리지, 네트워크 네임스페이스, veth pair, iptables** - 이 조합이 복잡한 네트워크 정책의 전달 규칙, 네트워크 분할, 관리 도구를 제공한다. **도커 네트워크 정보를 조회할 때는 도커 명령뿐 아니라 OS(리눅스)의 네트워크 명령어도 함께 쓸 수 있어야 한다**고 강사가 강조(도커가 리눅스 네트워크를 그대로 가져다 쓰기 때문). 용어: 브리지(bridge)는 여러 네트워크 인터페이스를 한 네트워크처럼 묶어 주는 소프트웨어 스위치, 네임스페이스는 커널 자원(여기서는 네트워크 스택)을 프로세스별로 따로 보이게 하는 격리 기능.
- **리눅스 브리지와 docker0**: 리눅스 브리지는 커널 내부의 **물리적 스위치를 가상으로 구현한 OSI Layer 2 Device**. 트래픽을 검사하여 **동적으로 학습한 MAC 주소**를 기반으로 트래픽을 전달(L2 서비스의 핵심은 MAC 주소). bridge network 의 기본 대역(슬라이드): 172.{17-31}.0.0/16(65536개), 192.168.{0-240}.0/20(4096개). 사용자 정의 브리지를 대역 지정 없이 만들면 172.18, 172.19 ... 식으로 순서대로 사용되고 특정 대역을 직접 지정할 수도 있다. 이 대역들은 사설 네트워크(10.x, 172.16~31.x, 192.168.x)로 쓰기로 한 국제 약속(RFC 1918)의 범위. **docker0 는 리눅스 쪽(ifconfig 등 OS 도구)에서, bridge 는 도커 엔진 쪽(docker 명령)에서 관리하는 같은 연결의 양면** - 강사는 "하나의 연결체"라 표현. 컨테이너 -> bridge -> docker0 -> 호스트의 실제 인터페이스를 거쳐 외부와 통신.
- **네트워크 네임스페이스**: 커널에 **격리된 네트워크 스택**(자체 인터페이스, 라우트, 방화벽 규칙)을 보유. 컨테이너와 리눅스의 보안 측면에서 컨테이너를 격리하는 데 사용. 도커 네트워크를 구성하지 않으면 같은 호스트의 두 컨테이너가 서로, 또는 호스트와 통신할 수 없음을 보장한다. 일반적으로 CNM 네트워크 드라이버는 각 컨테이너에 별도의 네임스페이스를 구현. **같은 사용자 정의 네트워크에 묶인 컨테이너끼리는 통신이 보장되지만, 서로 다른 네트워크의 컨테이너 사이는 기본적으로 보장되지 않으며 필요하면 연결하도록 별도로 구성해야 한다.**
- **CNM 3요소(슬라이드)**: **Sandbox** = 격리된 네트워크 스택. Ethernet(eth0), port, route table, DNS 구성 등이 포함(컨테이너 안에 들어가면 lo 와 eth0 가 보이는데 이것이 샌드박스 안에서 구성된 것) / **Endpoint** = 가상 이더넷 인터페이스(MAC 주소와 IP 를 제공하고 그 주소로 접근하게 함) / **Network** = 가상 스위치, Bridge(컨테이너는 기본적으로 브리지 네트워크에 연결되는 구조). **CNM 이 설계 문서(모델)라면 libnetwork 는 그에 대한 표준 구현체**. 슬라이드: Docker Engine - API - Libnetwork(Docker core network: Sandboxes/Endpoints/Networks/Service Discovery/Load Balancing) - Pluggable Interface - 드라이버들. libnetwork 위에는 Service Discovery 와 Load Balancing 기능이 얹히며 이는 뒤 클립(docker DNS)과 docker swarm 에서 다룬다. Pluggable Interface 에는 **Bridge driver(Single Host), Overlay driver(Multi Host), MACvlan driver(existing VLANs)** 가 연결됨 - 필요에 따라 싱글이든 멀티든 원하는 드라이버를 꽂아(plug) 쓸 수 있는 구조. `docker network ls` 의 DRIVER 열이 바로 이 드라이버를 보여 준다.
- **veth**: 슬라이드 - "veth 는 OS 2계층 서비스로 컨테이너 내부에 제공되는 네트워크 인터페이스 eth0 와 한 쌍(pair)으로 제공되어 docker0 와 가상의 '터널링 네트워크'를 제공한다." 브리지는 컨테이너에 직접 연결되지 못하므로 중간에 터널 역할을 하는 **veth** 가 존재한다. veth 는 두 네트워크 네임스페이스 사이의 연결선으로 동작하며 각 네임스페이스에 단일 인터페이스가 있는 **전이중 링크(full duplex link)**. 한 인터페이스의 트래픽을 다른 인터페이스로 전달하고 컨테이너 쪽 끝은 내부(보통 ethN), 다른 쪽은 도커 ethN 으로 연결. 강사: 브리지에는 컨테이너 대신 **veth 인터페이스들이 나열**되며, veth 개수가 곧 docker0(브리지)에 붙은 컨테이너 개수. docker0 에는 IP 테이블 설정을 직접 하지 않아도 도커가 **NAT(DNAT/SNAT)** 를 사용하기 때문에 iptables 와 직접 연관된다.
- **조회 명령어 매핑(슬라이드 그림)**: 컨테이너 내부(eth0) - `ifconfig / route / ip addr` / bridge - `brctl show` / docker0(172.17.0.1) - `ifconfig` / 방화벽(iptables) - `iptables` / 호스트 NIC - `ifconfig`.
- **`docker network ls` 읽는 법**: `bridge` 라는 이름의 네트워크가 곧 docker0(강사: "이름이 bridge 인데 이게 도커 제로"). `host` 드라이버는 호스트 네트워크를 그대로 사용, `none`(null 드라이버)은 네트워크를 쓰지 않는 옵션. overlay/macvlan 같은 항목은 docker info 의 플러그인 목록에서 확인할 수 있다. **bridge 는 Single Host 라 같은 호스트의 컨테이너끼리만 통신하며, 다른 호스트 사이는 overlay(docker swarm 설치 후 사용)가 필요하다.**
- **실습 순서와 주의점**: ① `sudo apt install bridge-utils` 로 `brctl` 설치(brctl 은 bridge-utils 패키지에 들어 있어 수강생 환경에 없으면 먼저 설치해야 함) -> `brctl show` ② `docker run -it -d --name=fast-ubuntu ubuntu:14.04` 후 `brctl show` 의 docker0 아래 **veth 가 1개 추가**(예: veth322cf4d, 새 항목이 순서대로 들어가지 않는다는 점도 짚음). 실행 전 docker0 에 veth 8개 -> 9개. ③ `docker exec -it fast-ubuntu route` 의 기본 게이트웨이 **172.17.0.1 은 호스트의 docker0**. 호스트에서 `route` 를 치면 172.17.0.0/16(255.255.0.0) 경로가 docker0 로 이어짐. 예시에서 fast-ubuntu 는 172.17.0.10, eth0 의 인터페이스 번호는 53 이며 `@if54` 가 짝(veth)의 번호 54 를 가리킴. (14.04 이미지에는 ip/route 같은 네트워크 도구가 들어 있어 사용한 것이며 다른 이미지에는 없는 경우가 많다.) ④ `docker network inspect bridge` 는 이 브리지에 붙은 **컨테이너 목록**(예: mydb 172.17.0.6, my_container 172.17.0.7, fast-ubuntu 172.17.0.10, local-registry 172.17.0.4 등을 EndpointID/MAC/IPv4Address 와 함께)을 보여 주며 Config 의 Subnet 172.17.0.0/16, Gateway 172.17.0.1 이 있고 IPAM(IP Address Management)에 의해 관리된다. Options 에는 `com.docker.network.bridge.name: docker0`, `enable_icc: true`, `driver.mtu: 1500` 등. 컨테이너 안에서 본 IP·MAC 은 바깥에서 `docker inspect` 로도 확인할 수 있다(네트워크 도구가 없는 컨테이너라면 inspect 로 IP 정도는 확인 가능). 이 정보들은 네트워크 네임스페이스(샌드박스)에 의해 구성된 것.
- **veth 짝 찾기(수강생 질문 "어떤 vethXXXX 가 어느 컨테이너의 것인가?")**: 도커 자체에는 이를 조회하는 명령이 없어 리눅스의 `/sys/class/net` 에서 확인한다(도커 네트워크가 리눅스 네트워크와 같은 경로 값으로 만들어지기 때문). **핵심 규칙: 컨테이너 eth0 의 번호는 짝인 veth 번호보다 하나 작다.** 슬라이드: "Container 의 네트워크(eth0)는 vethxxxxxxx 의 숫자보다 하나 작은 값을 가진다". `docker exec fast-ubuntu ip addr show eth0` 의 `eth0@if54`(자기 번호 53)와 호스트 `sudo cat /sys/class/net/veth322cf4d/ifindex` = 54, 컨테이너 안 `cat /sys/class/net/eth0/iflink` = 54 -> 서로를 가리키는 짝(번호는 실행할 때마다 달라질 수 있음). 이 방법은 운영 중 특정 veth 가 어떤 컨테이너의 것인지 궁금할 때 쓴다.
- **iptables NAT**: 외부에서는 호스트 IP(192.168.56.x)의 포트로 들어오지만 컨테이너 안은 172.17.x.x 대역이므로 **주소를 바꿔 주는 NAT(Network Address Translation) 규칙**이 필요하다. 이를 NAPT(포트 변환), 흔히 말하는 포트포워딩과 같은 원리라고 설명. 도커는 이 규칙을 `iptables` 에 **자동 등록**한다. `sudo iptables -t nat -L -n` 에서 POSTROUTING 의 `MASQUERADE all 172.17.0.0/16 -> 0.0.0.0/0`, 컨테이너별 MASQUERADE(예: 172.17.0.9 tcp dpt:6060), DOCKER 체인의 `DNAT tcp dpt:9559 to:172.17.0.2:8080`, `dpt:5000 to:172.17.0.4:5000`, `dpt:6063 to:172.17.0.9:6060`. **docker ps 에서 보이던 포트 매핑(예: 6063 -> 안쪽 6060)이 곧 DNAT 규칙**이며 슬라이드 그림에 iptables 방화벽 벽돌을 그려 넣은 이유도 이 규칙을 iptables 로 조회할 수 있음을 보여 주기 위해서.
- **네트워크 관련 run 옵션 부연**: `--add-host=[Host명:IP Address]` 컨테이너 /etc/hosts 에 Host 명과 IP 설정 / `--dns=[IP Address]` DNS 서버 IP 설정(/etc/resolv.conf, 예 168.126.63.1~3 / 8.8.8.8) / `--mac-address=[MAC Address]` 컨테이너 MAC 주소 설정(컨테이너 MAC 을 바꿀 일은 흔치 않다고 언급) / `--expose=[포트 번호]` 컨테이너 내부에서 Host 로 노출될 포트 번호 지정(원래 Dockerfile 에서 노출할 포트를 미리 기술할 때 쓰는 개념이고 docker run 옵션으로 주면 개별 포트(예: 관리용 포트)를 따로 열 수 있다) / `--net=[bridge | none | host]` 컨테이너의 네트워크 설정(기본값은 bridge(docker0), 사용자가 만든 네트워크 이름도 줄 수 있다. **none** 은 컨테이너에 네트워크를 주지 않는 것, **host** 는 컨테이너 네트워크를 따로 만들지 않고 호스트(우분투) 네트워크에 직접 연결하는 것으로 뒤 실습에서 다룸) / `-h, --hostname="Host명"` 컨테이너 Host 명 설정(default: container ID 가 호스트명) / `-P, --publish-all=[true|false]` 컨테이너 내부의 노출된 포트를 호스트 임의의(32768~) 포트와 연결(암시적) / `-p [Host 포트 번호]:[Container 포트 번호]`, `--publish published=5000, target=80` Host 와 Container 의 포트를 매핑(명시적, 슬라이드 표기는 그대로 옮김. 강사: 소문자 -p 는 호스트 포트와 컨테이너 포트를 사람이 직접 지정하는 방식, 대문자 -P 는 임시(랜덤) 포트를 자동 할당하는 방식) / `--link=[container:container_id]` 동일 Host 의 다른 Container 에서 액세스 시 IP 대신 container 의 이름을 이용해 통신 가능.
- **/etc/hosts 와 --add-host**: 강사는 먼저 서버 자체의 `/etc/hosts` 를 예로 든다. 서로 신뢰하는 서버의 이름과 IP 를 기재해 두면 SSH/SCP 등에서 IP 대신 **호스트 이름(hostos2)** 으로 접속할 수 있다. 컨테이너에도 같은 설정을 docker run 시점에 넣는 옵션이 `--add-host`. 확인: `cat /etc/hosts` 에 `192.168.0.100 fastcampus.co.kr` 가 등록됨. `--dns` 는 컨테이너 resolv.conf 에 DNS 서버(구글 DNS 8.8.8.8 등)를 넣고, `--mac-address` 확인은 `docker inspect --format="{{ .Config.MacAddress }}"` 로 한다.
- **docker-proxy (포트 매핑의 정체)**: 슬라이드 요약 - docker-proxy 는 **kernel 이 아닌 사용자 영역**에서 수행되므로 kernel 과 상관없이 호스트가 받은 패킷을 그대로 컨테이너의 포트로 전달한다. 포트를 외부로 노출하도록 설정하면 docker host 에 **docker-proxy 라는 프로세스가 자동으로 생성**된다. `docker run -d -P --name=myweb --expose=40001 nginx:1.25.0` 은 `-P` 를 쓰면 이미지에 선언된 EXPOSE 포트(nginx 는 EXPOSE 80, 강사가 `docker image history nginx:1.25.0` 에서 확인)와 `--expose` 로 준 40001 이 모두 호스트의 임시 포트(32768~ 범위)에 연결된다(실습: 80 -> 32771, 40001 -> 32770). 강사는 임시 포트가 컨테이너 안쪽 80번을 어떻게 알았는지를 `docker image history nginx:1.25.0` 로 보여 주며 "EXPOSE 80" 을 읽어 붙인 것이라고 설명. 그리고 `netstat` 로 해당 포트를 LISTEN 하는 것이 docker-proxy 이며, `ps -ef` 로 PID 를 조회하면 "호스트 0.0.0.0 의 해당 포트로 오면 컨테이너 172.17.0.11 의 80 으로 전달"이라는 인자가 보인다. 같은 정보가 iptables 에도 DNAT 로 등록되어(위 화면의 172.17.0.11 항목) 도커 프락시가 중간에서 **중계(proxy)** 역할을 한다.
- **overlay 네트워크 예고**: Overlay network 는 **서로 다른 Host(node)에서 서비스되는 컨테이너를 하나의 네트워크로 연결**하는 데 쓰고, 생성에는 overlay network driver 를 사용. 여러 Docker Host 안의 Docker Daemon 간 통신을 관리하는 가상 네트워크이며 컨테이너는 overlay 의 서브넷 IP 대역을 받아 서로 통신한다. 따라서 서로 다른 Docker Host 의 컨테이너도 같은 서버에 있는 것처럼 통신할 수 있다. **Docker swarm 으로 구현**(ch.11). overlay 네트워크는 `docker network inspect {network-ID}` 로 조회(슬라이드). 지금까지 다룬 것은 **단일 호스트의 bridge** 이고 단일 호스트 환경에서는 overlay 를 쓸 수 없다. 강사 마무리: 이런 네트워크 흐름을 이해해야 **장애로 통신이 막힐 때 각 지점(컨테이너-veth-브리지-docker0-iptables-호스트 NIC)을 차례로 점검**해 어디서 끊겼는지 찾을 수 있다.

### [사용한 CLI]

**1) docker0 / 네트워크 목록**
```bash
ifconfig docker0                  # 172.17.0.1 netmask 255.255.0.0
docker network ls
#   NETWORK ID   NAME     DRIVER   SCOPE
#   ...          bridge   bridge   local     <- docker0
#   ...          host     host     local
#   ...          none     null     local
```

**2) 컨테이너 네트워크 확인**
```bash
sudo apt install bridge-utils     # brctl 명령 제공
brctl show                        # docker0 에 연결된 veth 목록
docker run -it -d --name=fast-ubuntu ubuntu:14.04
brctl show                        # veth 가 1개 추가됨
docker exec -it fast-ubuntu ip addr       # eth0@if54, 172.17.0.10/16
docker exec -it fast-ubuntu route         # default via 172.17.0.1 (docker0)
route                                     # (호스트) 172.17.0.0/16 -> docker0
ifconfig
```

**3) IP / MAC / 네트워크 정보 조회**
```bash
docker network inspect bridge                       # Subnet 172.17.0.0/16, Gateway 172.17.0.1, Containers(EndpointID, MacAddress, IPv4Address), IPAM, Options(com.docker.network.bridge.name: docker0 등)
docker inspect -f "{{ .NetworkSettings.IPAddress }}" fast-ubuntu
docker inspect fast-ubuntu | grep IPAddress
docker inspect fast-ubuntu | grep Mac
```

**4) 컨테이너 eth0 와 호스트 veth 의 짝 찾기 (ifindex / iflink)**
```bash
docker exec veth_test1 ip addr show eth0                 # 240: eth0@if241 -> 상대 인터페이스 번호 241
sudo su -
cat /sys/class/net/vethdc3aced/ifindex                    # 241
docker exec -it veth_test1 bash
cat /sys/class/net/eth0/iflink                            # 241

# 자료의 fast-ubuntu 예
sudo cat /sys/class/net/veth322cf4d/ifindex               # 54
docker exec -it fast-ubuntu bash
cat /sys/class/net/eth0/iflink                            # 54
```
- 컨테이너 eth0 은 `eth0@if54`(자기 번호 53, 상대 54), 호스트 veth 의 ifindex 가 54 -> 서로 한 쌍.

**5) iptables NAT 확인**
```bash
sudo iptables -t nat -L -n
#   Chain POSTROUTING : MASQUERADE all 172.17.0.0/16 -> 0.0.0.0/0
#   Chain DOCKER      : DNAT tcp dpt:9559 to:172.17.0.2:8080, dpt:5000 to:172.17.0.4:5000, dpt:6063 to:172.17.0.9:6060 ...
```

**6) docker run 의 네트워크 관련 옵션**
| 옵션 | 설명 |
|---|---|
| `--add-host=[Host:IP]` | 컨테이너 `/etc/hosts` 에 호스트명-IP 추가 |
| `--dns=[IP]` | 컨테이너 DNS 서버 지정 (`/etc/resolv.conf`) |
| `--mac-address=[MAC]` | 컨테이너 MAC 주소 지정 |
| `--expose=[포트]` | 컨테이너 포트 노출 (Dockerfile EXPOSE 와 유사) |
| `--net=[bridge \| none \| host]` | 네트워크 선택 (기본 bridge = docker0) |
| `-h, --hostname` | 컨테이너 hostname |
| `-P, --publish-all` | EXPOSE 포트를 호스트 임의 포트(32768~)에 매핑 |
| `-p [호스트포트]:[컨테이너포트]`, `--publish published=5000,target=80` | 지정 포트 매핑 |
| `--link=[container:container_id]` | 컨테이너 연결(IP 자동 연동, 구식 방식) |

```bash
# DNS 지정
docker run -it --dns=8.8.8.8 centos bash
[root@83417a39224b /]# cat /etc/resolv.conf              # nameserver 8.8.8.8

# MAC 주소 지정
docker run -d --mac-address="92:d0:c6:0a:29:33" centos:7
docker inspect --format="{{ .Config.MacAddress }}" c268f1  # 92:d0:c6:0a:29:33

# 호스트명-IP 등록
docker container run -it --add-host=fastcampus.co.kr:192.168.0.100 centos:7 bash
[root@4e0aaf8a3b17 /]# cat /etc/hosts                    # 192.168.0.100 fastcampus.co.kr

# 호스트 /etc/hosts 에 hostos1/hostos2 등록 (ssh/scp 시 이름 사용)
sudo vi /etc/hosts      # 192.168.56.101 hostos1 ...
ssh kevin@hostos2
```

**7) -P 와 docker-proxy**
```bash
docker image history nginx:1.25.0        # EXPOSE 80 확인
docker run -d -P --name=myweb --expose=40001 nginx:1.25.0
docker port myweb
#   80/tcp    -> 0.0.0.0:32771
#   40001/tcp -> 0.0.0.0:32770
sudo netstat -nlp | grep 32773           # docker-proxy LISTEN (자료에는 포트/PID 일부 예시 값 상이)
ps -ef | grep 75516                      # /usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port ... -container-ip 172.17.0.11 -container-port 80
sudo iptables -t nat -L -n               # 172.17.0.11 대상 DNAT (32770->40001, 32771->80)
```

### [확인 방법/주의점]
- 컨테이너 IP 는 재시작/재생성 시 바뀔 수 있다(`docker inspect` 로 확인).
- `brctl` 은 bridge-utils 설치 후 사용. veth 는 컨테이너 생성/삭제에 따라 증감.
- `--add-host`, `--dns`, `--mac-address` 는 `docker run` 시점 옵션.

---

## Step 11. 사용자 정의 네트워크 생성 / 조회 / connect / disconnect

### [목적]
- 기본 bridge 대신 사용자 정의 bridge 네트워크를 만들어 컨테이너를 격리/연결하고, 컨테이너 이름으로 통신(Docker DNS)하며, 실행 중 네트워크를 추가/제거한다.

### [이론 설명]
- 기본 bridge(docker0)는 컨테이너 간 이름 기반 통신(Service Discovery)이 지원되지 않지만, **사용자 정의 bridge 네트워크에서는 Docker DNS 로 컨테이너 이름으로 통신**할 수 있다. 서로 다른 네트워크의 컨테이너는 기본적으로 통신 불가(`ping: unknown host`).
- `--net` 옵션 값: `bridge`(기본 docker0, 172.17.0.0/16), `none`(네트워크 없음), `container:[이름|ID]`(다른 컨테이너와 네트워크 공유), `host`(호스트 네트워크 그대로 사용, 호스트 IP 사용), `macvlan`, `사용자 정의 NETWORK 이름`, `overlay`(Docker Swarm).
- `--net=host`: 별도 IP 가 없고(inspect 의 IPAddress 가 빈 값) 컨테이너 프로세스가 호스트 포트를 직접 사용하므로 `-p`/docker-proxy 가 필요 없다(대신 포트 충돌 주의).
- 새 bridge 네트워크는 호스트에 `br-<네트워크ID 앞 12자리>` 브리지 인터페이스로 생성되고(172.18.0.1 등) 라우팅 테이블에 해당 대역이 추가된다. 컨테이너는 veth 를 통해 이 bridge 에 연결.
- `--subnet`, `--ip-range`, `--gateway` 로 대역을 직접 지정할 수 있다. CIDR 예: /24 = 256개(254 사용 가능), /26 = 64개.
- 컨테이너는 여러 네트워크에 동시에 연결(connect)될 수 있다(eth0, eth1 ...). 활성 컨테이너(active endpoint)가 있는 네트워크는 삭제할 수 없다 -> disconnect 후 rm.

**[원문 한글 자료 기반 보강 - 035 Clip 2]**
- **사용자 정의 네트워크가 필요한 이유**: 앞 클립에서 본 기본 네트워크는 docker0 뿐이었고 기능이 적고 제한이 있어, **애플리케이션 서비스 단위로 독립된 사용자 정의 네트워크**를 따로 만들어 쓰는 것이 이번 클립의 출발점. 뒤에 배울 **Docker Compose** 도 같은 원리: Compose 는 컨테이너 여러 개를 한 번에 띄우면서 스스로 독립된 네트워크를 만들어 그 컨테이너들을 묶어 주며, 이것이 곧 사용자 정의 네트워크이고 마이크로서비스(MSA)처럼 서비스별 네트워크를 따로 운영하려는 의도. docker 는 기본적으로 Host OS 와 bridge 로 연결하고 `--net` 옵션으로 네트워크를 선택한다. `docker network create` 로 "사용자 정의 bridge 네트워크"를 생성하며, 여기에 연결된 컨테이너는 **컨테이너 이름이나 IP 주소로 서로 통신** 가능하다. Overlay network(docker swarm)나 커스텀 플러그인을 쓰면 multi-host 연결도 가능(슬라이드).
- **--net 옵션 값(슬라이드 표 + 강사 보충)**: `bridge` = 기본값(default: docker0 - 172.17.0.0/16, 컨테이너가 docker0 브리지에 연결됨, 예 172.17.0.2~) / `none` = 네트워크에 접속하지 않음, 무지정(격리용) - 해당 컨테이너는 네트워크를 쓰지 못함 / `container:[container_name|id]` = 다른 Container 의 네트워크를 사용(첫 컨테이너의 네트워크를 두 번째 컨테이너가 **공유**(같이 씀)) / `host` = Container 가 Host OS 의 네트워크를 사용(컨테이너 자체 네트워크 없이 호스트 네트워크를 직접 사용) / `macvlan` = 물리적 네트워크에 컨테이너 mac 주소를 통한 직접적 연결 구현 시 사용(컨테이너 MAC 주소로 물리망에 직접 연결) / `NETWORK(사용자의 network name)` = 사용자 정의 network 사용(docker network create 로 만든 이름을 `--net` 에 넣으면 그 대역으로 할당됨). Overlay 는 Docker Swarm 에서 만나게 될 또 다른 드라이버 형태라고 강사가 짧게 언급.
- **host 네트워크 (`--net=host`)**: 보통 nginx 를 띄울 때는 `-p` 옵션으로 호스트 포트를 컨테이너 포트에 연결하며 이 경우 외부 요청이 docker-proxy 를 거쳐 컨테이너로 전달된다. 그런데 host 네트워크는 도커가 만든 별도 네트워크가 아니라 **호스트의 네트워크를 그대로 가져다 쓰는 방식**. 영상에서 `docker run -d --name=nginx_host --net=host nginx:1.25.0`(-p 없음). 호스트에 nginx 를 설치한 적이 없는데도 브라우저에서 호스트 IP(192.168.56.101)로 접속하면 **Welcome to nginx!** 가 나온다(기본 포트 80). 호스트에서 `sudo netstat -nlp | grep 80` 으로 80번 포트를 LISTEN 하는 것이 `nginx: master` 임을, `ps -ef | grep <PID>` 로 호스트 프로세스 목록에 `nginx: master process nginx -g daemon off;` 와 `nginx: worker process` 가 호스트 사용자(systemd+) 아래 보이는 것을 확인. `docker inspect nginx_host | grep -i ipa` -> `IPAddress` 가 빈 문자열(**자체 IP 없음**). 호스트 IP 의 80 포트를 그대로 사용하며 docker0 을 거치지 않는다. 슬라이드의 -p 사용 시에는 docker-proxy 를 이용하지만 host 네트워크에서는 호스트 운영체제가 nginx 프로세스(PID)를 직접 갖는다. 슬라이드에는 `--name` 이 대시 하나(-name)로 잘못 인쇄되어 있으나 터미널 실제 명령은 `--name=nginx_host`. **장점**: 포트 포워딩(-p)과 docker-proxy 를 거치지 않고 트래픽을 다이렉트로 전달할 수 있다. **단점**: 호스트의 포트를 그대로 점유하므로 같은 포트를 쓰는 컨테이너를 여러 개 띄울 수 없고 컨테이너 간 격리가 약해진다.
- **docker network create**: `docker network create [-d|--driver bridge] mynet`(bridge 가 기본값이라 생략 가능). `docker network ls` 에서 DRIVER 를 따로 주지 않아도 `mynet` 은 `bridge` 로 잡힌다. 생성하면 호스트에 **`br-<네트워크ID 앞 12자리>`** 형태의 리눅스 bridge 인터페이스(예 br-e5a1353a48f3)가 하나 생기고 `route`/`ifconfig` 에 나타난다(`ifconfig` 맨 위에 같은 이름의 인터페이스가 잡히고 route 에는 172.18.0.0/255.255.0.0 대역이 잡힘, /16 이므로 65,536개 IP). 그 IP(예: 172.18.0.1)가 이 네트워크의 **Gateway**. 대역을 지정하지 않으면 도커가 172.18.0.0/16 처럼 빈 대역을 순서대로 골라 준다(다음에 만들면 172.19.x 대역). `docker network inspect mynet`(이름 또는 네트워크 ID 로 조회) 결과 IPAM Config 의 Subnet 172.18.0.0/16, Gateway 172.18.0.1 이고 아직 컨테이너를 붙이지 않아 `Containers` 가 비어 있다.
- **mynet 에 컨테이너 연결**: 터미널을 각각 따로 열어 `docker run --net=mynet -it --name=net-check1 ubuntu:14.04 bash`, `docker run --net=mynet -it --name=net-check2 ubuntu:14.04 bash`. 각각 172.18.0.2(net-check1), 172.18.0.3(net-check2)를 받고 route 에 172.18.0.0 대역이 eth0 으로 잡히며 default gateway 가 hostos1(172.18.0.1)이다. 컨테이너를 붙인 뒤 `docker network inspect mynet` 하면 `net-check1(172.18.0.2/16)` 과 `net-check2(172.18.0.3/16)` 두 개가 Containers 항목에 나타나고, `brctl show` 에서 mynet 의 bridge(br-e5a1353a48f3)에 두 개의 veth 인터페이스가 붙어 있다(veth 쌍 복습: 컨테이너 안쪽 eth0 의 짝이 호스트의 vethXXXX 이고, 그 veth 가 bridge 에 꽂혀 있는 구조).
- **컨테이너 이름으로 통신 (Docker DNS)**: `ping -c 2 net-check2` (-c 2: 2번만 ping). 한 번도 IP 를 입력한 적이 없는데 결과에 net-check2 = 172.18.0.3 이라는 IP 가 자동으로 찾아진다. **사용자 정의 네트워크에는 자체 DNS 가 들어 있어 컨테이너 이름과 IP 가 여기에 등록**된다. 같은 사용자 정의 네트워크(mynet)에 연결된 컨테이너끼리는 이름으로 IP 를 찾아 통신할 수 있고 이를 **Docker DNS 에 의한 Service Discovery(서비스 검색)**(슬라이드: 컨테이너를 검색해 주는 서비스)라 부른다. 이 자동 이름 해석은 **기본 bridge(docker0)에서는 동작하지 않고** 사용자 정의 네트워크에서 제공되는 기능이므로, 실무에서는 서비스 간 통신을 이름으로 처리하기 위해 사용자 정의 네트워크를 쓰는 경우가 많다.
- **대역을 직접 지정한 네트워크 (vswitch-net)**: 방금 만든 mynet 은 한 줄짜리 기본값이어서 대역 미지정(또 만들면 172.19.0.0/16 대역으로 만들어짐, 전체 대역이 65,536개 규모). "그 전체가 아니라 특정 대역만 쓰고 싶다"면 사용자 정의 네트워크를 커스텀할 수 있고 192.168.x 같은 IP 와도 상관없다. 옵션 의미: `--driver bridge`(네트워크 드라이버 지정, 기본값이므로 생략 가능) / `--subnet 172.30.1.0/24`(네트워크 전체 대역, **CIDR 표기만 가능**(255.255.255.0 같은 서브넷 마스크 표기는 안 됨), 256개 중 254개 사용 가능) / `--ip-range 172.30.1.0/24`(그중 컨테이너에 나눠 줄 IP 범위, subnet 이하로 조정 가능. 예: /26 이면 64개 사용(/24=256개, /25=절반, /26=그 절반), 슬라이드 예: 172.30.1.100/26) / `--gateway 172.30.1.1`(게이트웨이 주소, 보통 대역의 첫 번째 주소 사용). 강사는 subnet, ip-range, gateway 세 가지를 함께 쓰라고 안내(보충: 실제 Docker 에서는 `--subnet` 만으로도 생성되지만 강의에서는 세 옵션을 같이 지정). 생성 후 `route` 에 172.30.1.0 / 255.255.255.0 이 `br-3edde1f96b75`(네트워크 ID 앞 12자리 일치)로 잡힌다. (화면에서 명령을 붙여넣는 과정에서 두 번째 줄 줄바꿈 기호가 어긋나 보이지만 네트워크는 정상 생성됨.)
- **net1(자동 IP) / net2(--ip 지정)**: 게이트웨이가 172.30.1.1 이므로 첫 컨테이너 net1 은 자동으로 **172.30.1.2** 를 받고, 특정 IP 를 쓰고 싶으면 `--ip` 옵션으로 지정(net2 = 172.30.1.100, inspect 로 확인). `docker network inspect vswitch-net` 으로 net1, net2 가 연결된 것을 볼 수 있다. 확인 명령 모음: `docker inspect net1 | grep IPAddress`, `brctl show`(vswitch-net 의 bridge 에 veth 두 개), `route`, `ip route`(`172.30.1.0/24 dev br-3edde1f96b75 proto kernel scope link src 172.30.1.1`), `docker exec net1 ip addr`(eth0 172.30.1.2/24, `eth0@if73` 형태), `docker exec -it net1 bash` 로 ifconfig 확인. 강사: 지금까지 만들고 확인하는 데 쓴 도구들은 앞에서 본 것들과 같다.
- **네트워크 구조도(docker network topology)**: 이 환경에서는 호스트의 `enp0s8` 인터페이스(192.168.56.101)를 사용하고 그 IP 로 접근한 요청은 **iptables 의 라우팅 정보(DNAT 등)** 를 거쳐 어떤 네트워크로 갈지 정해지며, 그 뒤 해당 bridge(docker0 또는 사용자 정의 bridge)를 지나 **veth** 를 통해 컨테이너의 IP 로 전달된다. 도식 라벨: ① Network namespace(컨테이너 내부는 자체 네트워크 네임스페이스를 가지며 안쪽에 eth0 가 있음, 예: my-web eth0 -> 172.17.0.2) ② Bridge network(veth 쌍의 반대편이 bridge(docker0 172.17.0.1 / 사용자 정의 fc-net 172.18.0.1)에 연결됨. 강사: bridge 는 OSI 2계층(L2) 기능으로 만들어짐) ③ iptables 의 DNAT/SNAT 를 이용한 routing(외부 NIC(enp0s8)와 bridge 사이의 주소 변환·라우팅). 예: mynet(172.18.0.0/16) 같은 네트워크를 새로 만들면 게이트웨이는 172.18.0.1 이고 거기에 붙이는 첫 컨테이너는 172.18.0.2 를 갖게 된다. 강사 정리: bridge 가 결국 리눅스 커널 위에서 동작하는 소프트웨어적인 부분이며, 구조적으로 iptables 를 거쳐 들어가는 과정이라고 이해하면 된다.
- **서로 다른 네트워크의 컨테이너는 통신되지 않는다(실습)**: net-check1/net-check2 는 mynet(172.18.x)에, net1/net2 는 vswitch-net(172.30.x)에 있다. 같은 네트워크(net-check1)로는 ping 이 나가지만 다른 네트워크의 net1 로 `ping -c 2 net1` 을 치면 `ping: unknown host net1`. **전체 네트워크가 한 호스트에 다 있더라도 bridge 네트워크 간의 통신은 기본적으로 막혀 있다. 다른 네트워크의 컨테이너는 이름조차 찾지 못한다(unknown host).** 프론트엔드/백엔드/DB 를 서로 다른 네트워크에 두었을 때 트래픽을 어떻게 전달할지가 다음 주제.
- **docker network connect / disconnect**: 해결책이 바로 connect. **실행 중인 컨테이너에 다른 네트워크의 인터페이스(엔드포인트)를 하나 더 붙여 주는 방식**. 슬라이드 예제는 add-net 컨테이너에 fc-net2 를 연결. 실습: net-check2 를 호스트 `docker network create fc-net2`(대역 172.19.0.0/16, br-dfdfbcc6800d) -> `docker network connect fc-net2 net-check2` -> 연결 즉시 컨테이너 안에서 ifconfig 를 치면 **eth1** 이 생기고 172.19.0.2(HWaddr 02:42:ac:13:00:02)를 받은 것이 보인다(기존 eth0 는 172.18.0.3). 이렇게 connect 는 컨테이너의 인터페이스를 하나 더 붙여 통신이 가능하도록 설정한다. `docker network inspect fc-net2` 를 하면 Subnet 172.19.0.0/16, Gateway 172.19.0.1 이며 Containers 에 `net-check2 (172.19.0.2/16)` 가 엔드포인트로 연결되어 있다. **실수 주의**: 강사가 컨테이너 안에서 `docker network create` 를 잘못 실행해 `docker: command not found` 가 나왔다(컨테이너 안에는 docker CLI 가 없음) -> 호스트 터미널에서 다시 만들었다.
- **삭제 시 오류와 disconnect**: connect 상태에서 `docker network rm fc-net2` 를 하면 `Error response from daemon: error while removing network: network fc-net2 id ... has active endpoints`. 여기서 말하는 **active endpoint** 는 앞에서 본 net-check2 의 연결. 먼저 `docker network disconnect fc-net2 net-check2` 로 컨테이너를 뺀 뒤 rm 하면 된다. disconnect 하면 컨테이너 안 ifconfig 의 eth1 이 바로 사라지는 것을 확인할 수 있다(eth0, lo 만 남음). **connect 는 컨테이너에 네트워크 인터페이스(엔드포인트)를 추가하고, disconnect 는 제거한다. 연결된 컨테이너가 남아 있는 네트워크는 삭제할 수 없으므로 disconnect 후 `docker network rm` 순서로 진행.**
- **front-net / back-net 3계층 실습**: 프론트(my-web), 백엔드(my-was), DB(my-db) 3계층에서 밖에 노출되는 네트워크와 백엔드-DB 쪽 네트워크를 **분리**하려는 상황. 앞에서 본 것처럼 서로 다른 네트워크끼리는 기본 통신이 안 되므로, 양쪽 네트워크에 걸쳐야 하는 컨테이너에 **엔드포인트를 하나 더** 붙인다. 도식: 각 컨테이너는 샌드박스(Sandbox) 안의 **네트워크 네임스페이스**와 **엔드포인트**를 가지며, my-db 와 my-was 는 Backend Network(back-net)에, my-web 은 Frontend Network(front-net)에 붙어 있고, connect 로 my-web 에 back-net 용 엔드포인트가 하나 더 추가된다(connect 도 네트워크 네임스페이스를 이용해 연결을 구현하는 것이라고 설명). 상황에 따라 my-web 쪽에 붙일 수도, 다른 쪽에 붙일 수도 있는데 이 영상에서는 프론트(my-web) 쪽에 back-net 을 connect 로 붙였다. 결과적으로 front-net 에는 my-web 만, back-net 에는 my-web, my-was, my-db 세 컨테이너가 붙는다(back-net 에는 엔드포인트가 3개). `route` 로 각 컨테이너의 대역을 확인하고 `network inspect` 로 연결 상태를 확인. 통신 확인: my-web 에 접속해 my-was 와 my-db 로 ping 을 던지면 정상 응답(예: my-was.front-net 172.21.0.3, my-db.back-net 172.22.0.3), my-was 에서 my-web 과 my-db 도 정상(슬라이드 예시 출력은 슬라이드에 적힌 그대로). **이런 구조가 필요하면 서로 다른 네트워크를 만들고 connect / disconnect 로 조절**하면 된다. 마지막으로 컨테이너 삭제 후 네트워크 삭제까지 직접 실습으로 마무리하라고 강사가 권했다. **정리 순서: 컨테이너 stop -> rm -> network rm.** 컨테이너가 네트워크에 연결된 채로는 network rm 이 실패한다(9-3 의 active endpoints 오류).

### [사용한 CLI]

**1) host 네트워크**
```bash
docker run -d --name=nginx_host --net=host nginx:1.25.0
# 브라우저에서 호스트 IP(192.168.56.101)로 접속 -> Welcome to nginx!
sudo netstat -nlp | grep 80               # nginx: master 가 호스트 80 LISTEN
curl localhost:80
ps -ef | grep 20128
docker inspect nginx_host | grep -i ipa   # "IPAddress": ""  (자체 IP 없음)
```

**2) 사용자 정의 네트워크 생성/조회**
```bash
docker network create mynet               # 기본 driver=bridge (-d / --driver bridge 생략 가능)
docker network ls
route                                      # 172.18.0.0/16 -> br-e5a1353a48f3
ifconfig                                   # br-e5a1353a48f3: inet 172.18.0.1
docker network inspect mynet              # Subnet 172.18.0.0/16, Gateway 172.18.0.1, Containers
```

**3) mynet 에 컨테이너 연결 (--net)**
```bash
docker run --net=mynet -it --name=net-check1 ubuntu:14.04 bash    # 172.18.0.2
docker run --net=mynet -it --name=net-check2 ubuntu:14.04 bash    # 172.18.0.3
# 컨테이너 안에서
ifconfig
route
# 호스트에서
docker network inspect mynet
brctl show                                # br-e5a1353a48f3 에 veth 2개
```

**4) 이름으로 통신 (Docker DNS)**
```bash
# net-check1 안에서
ping -c 2 net-check2        # -c 2 : 2회만 ping, 컨테이너 이름으로 IP 해석됨
# net-check2 안에서
ping -c 2 net-check1
```

**5) 대역 지정 네트워크 생성 + IP 지정**
```bash
docker network create \
  --driver bridge \
  --subnet 172.30.1.0/24 \
  --ip-range 172.30.1.0/24 \
  --gateway 172.30.1.1 \
  vswitch-net
docker network ls
route                                   # 172.30.1.0/24 -> br-3edde1f96b75

docker run --net=vswitch-net -itd --name=net1 ubuntu:14.04                       # 자동 할당 172.30.1.2
docker run --net=vswitch-net -itd --name=net2 --ip 172.30.1.100 ubuntu:14.04     # IP 직접 지정
docker inspect net1 | grep -i ipa
docker inspect net2 | grep IPAddress
brctl show
route
ip route                                # 172.30.1.0/24 dev br-3edde1f96b75 proto kernel scope link src 172.30.1.1
docker exec net1 ip addr
docker exec -it net1 bash               # ifconfig 로 eth0 확인
```
| 옵션 | 설명 |
|---|---|
| `--driver bridge` | 네트워크 드라이버 |
| `--subnet 172.30.1.0/24` | 네트워크 대역 (CIDR) |
| `--ip-range 172.30.1.0/24` | 컨테이너에 할당할 IP 범위 (subnet 의 부분 범위로 제한 가능, 예: 172.30.1.100/26) |
| `--gateway 172.30.1.1` | 게이트웨이(= bridge 의 IP) |

**6) 다른 네트워크 간 통신 불가 확인**
```bash
# net-check2(mynet) 안에서
ping -c 2 net-check1     # 성공
ping -c 2 net1           # ping: unknown host net1  (vswitch-net 의 컨테이너)
```

**7) 실행 중 컨테이너에 네트워크 연결 / 해제**
```bash
docker network create fc-net2
docker network ls
route                                          # 172.19.0.0/16 -> br-dfdfbcc6800d
docker network connect fc-net2 net-check2      # net-check2 에 eth1(172.19.0.2) 추가
# net-check2 안에서 ifconfig -> eth0(172.18.0.3), eth1(172.19.0.2)
docker network inspect fc-net2                 # Containers: net-check2

docker network rm fc-net2
#   Error response from daemon: error while removing network: network fc-net2 id ... has active endpoints
docker network disconnect fc-net2 net-check2   # 연결 해제 (eth1 사라짐)
docker network rm fc-net2                      # 삭제 가능
```

**8) 3-Tier 실습: front-net / back-net**
```bash
docker network create --driver=bridge back-net
docker network create --driver=bridge front-net
docker run --name=my-web -itd --net=front-net ubuntu:14.04
docker run --name=my-was -itd --net=back-net  ubuntu:14.04
docker run --name=my-db  -itd --net=back-net  ubuntu:14.04
docker network connect back-net my-web          # my-web 은 front-net + back-net 양쪽에 연결
docker exec my-web route
docker exec my-was route
docker exec my-db route
docker network inspect front-net                # my-web
docker network inspect back-net                 # my-web / my-was / my-db

docker exec -it my-web bash
ping -c 1 my-was ; ping -c 1 my-db
docker exec -it my-was bash
ping -c 1 my-web ; ping -c 1 my-db

# 정리: disconnect -> stop -> rm -> network rm
docker network disconnect front-net my-was      # 슬라이드 원문 그대로 (슬라이드 ping 출력에 my-was.front-net 으로 나와 슬라이드 예제에서는 my-was 가 front-net 에 연결된 상태)
# 참고: 위의 영상 흐름(connect back-net my-web)대로 실습했다면 대응되는 해제는 아래 명령
# docker network disconnect back-net my-web
# (어느 쪽이든 이어지는 stop → rm → network rm 으로 정리되므로 결과는 같음)
docker stop my-web my-was my-db
docker rm my-web my-was my-db
docker network rm back-net
docker network rm front-net
```
- 설계 의도: 웹은 외부와 맞닿는 front-net, WAS/DB 는 back-net, 웹만 두 네트워크에 연결해 DB 를 직접 노출하지 않음.

### [확인 방법/주의점]
- `docker network ls`, `docker network inspect <이름>` (Subnet/Gateway/Containers), 호스트 `route`/`ifconfig`/`ip route`/`brctl show` 로 생성된 `br-<ID>` 확인.
- 네트워크 삭제 전에 연결된 컨테이너를 모두 disconnect 하거나 stop -> rm (active endpoints 오류).
- `--ip` 는 사용자 정의 네트워크에서만 지정 가능(subnet 이 지정된 네트워크 사용 시 권장).
- host 네트워크는 호스트 포트를 직접 사용하므로 포트 충돌에 주의.
- 자료 참고: docker network 명령 오류 중 `docker: command not found` 는 호스트가 아닌 컨테이너 안에서 실행해서 발생한 것(호스트 터미널에서 실행).

---

## Step 12. Docker DNS 와 --net-alias (Round Robin)

### [목적]
- Docker 내장 DNS(127.0.0.11)로 컨테이너 이름/alias 를 IP 로 해석하는 방식을 이해하고, 동일 alias 를 여러 컨테이너에 부여해 DNS Round Robin 으로 요청이 분산되는 것을 확인한다.

### [이론 설명]
- 사용자 정의 bridge 네트워크에서는 Docker 내장 DNS 서버(**127.0.0.11**)가 컨테이너 이름과 `--net-alias` 를 IP 로 해석한다 (기본 docker0 bridge 에서는 이 DNS 가 동작하지 않음). 컨테이너의 `/etc/hostname`, `/etc/hosts`, `/etc/resolv.conf` 가 Docker 에 의해 구성/관리된다.
- **--net-alias**: 컨테이너에 네트워크 별칭(별명)을 부여. **동일한 alias 를 여러 컨테이너에 주면 DNS 가 해당 alias 에 대해 여러 IP(A 레코드)를 반환**하고, 조회할 때마다 순서가 바뀌는 **Round Robin** 으로 요청이 분산된다(target group 개념).
- libnetwork 가 Service Discovery 를 구현하며 `--name` 과 `--net-alias` 가 DNS 에 등록된다.
- 주의: 이 방식은 DNS 순서에 의한 단순 분산이다. (정정: "헬스체크 없음/죽은 컨테이너도 응답에 포함될 수 있음"은 036 자료에서 확인되지 않는 일반론이므로 자료 근거 내용이 아니다. 자료는 DNS 기반의 "간단한 부하 분산"이라고만 설명한다.)

**[원문 한글 자료 기반 보강 - 036 Clip 3]**
- **이번 클립 내용**: 사용자 정의 네트워크의 장점 중 하나인 **자체 DNS 서비스**. (1) Docker DNS 의 장점 설명, (2) 사용자 정의 네트워크에 연결된 컨테이너가 DNS 에 자동 등록되는 것 확인, (3) 이 DNS 로 로드 밸런싱·프록시처럼 부하를 나누는 동작을 실습. DNS 는 이름(예: es1)을 IP 주소(예: 172.20.0.2)로 바꿔 주는 "전화번호부" 같은 서비스, 로드 밸런싱은 들어오는 요청을 여러 서버에 나눠 보내 한 곳에 부하가 몰리지 않게 하는 방식.
- **슬라이드 요약**: Docker 컨테이너는 IP 를 사용자 정의 네트워크의 컨테이너 이름으로 자동 확인하는 **DNS 서버가 Docker 호스트에 생성**된다(127.0.0.11). **Docker 의 기본 docker0 bridge driver 에는 DNS 가 포함되어 있지 않으므로 DNS 는 내장된 docker0 bridge driver 에서 작동하지 않는다.** 동일 네트워크 alias 할당을 통해 하나의 타겟 그룹을 만들어 요청에 **Round Robin** 방식으로 응답한다. 컨테이너 생성 시 호스트 시스템에서 `/etc/hostname`, `/etc/hosts`, `/etc/resolv.conf` 세 파일을 복사하여 컨테이너 내부에 적용하여 컨테이너 간에 이름으로 찾기가 가능해진다(resolv.conf 는 "이름을 물어볼 DNS 서버가 어디인지"를 적어 두는 파일). 강사 강조: 기본 네트워크(docker0)의 기능이 미비하므로 **DNS search 기능이나 DNS 를 활용한 프록시 기능을 쓰려면 반드시 사용자 정의 네트워크를 만들어야 하며 이것이 첫 번째 요구사항**, 두 번째는 **`--net-alias` 옵션**(--net-alias 로 묶은 컨테이너들을 하나의 **타겟 그룹**(트래픽을 받는 대상)으로 보고 그룹으로 온 트래픽을 그 안의 컨테이너들이 나눠 받는 것. 기본 방식은 Round Robin(차례대로 돌아가며 응답)).
- **DNS 동작 구성(libnetwork, 슬라이드 34)**: libnetwork 는 핵심 네트워킹 뿐만 아니라 **서비스 검색 기능 제공을 통해 모든 컨테이너가 이름으로 서로를 찾을 수 있게** 한다(`--name` 또는 `--net-alias` 사용 시 DNS 에 등록). 흐름: 컨테이너 안에서 `ping net1-container` 처럼 이름으로 ping 을 보내면 먼저 컨테이너 내부의 **DNS resolver** 가 자기 안의 정보에서 이름의 IP 를 찾고, 찾으면 바로 돌려주고 찾지 못하면 **Docker 엔진이 가진 DNS 서버**에 물어본다. Docker DNS 가 등록된 정보를 확인해 IP 를 알려 주면 ping 을 요청한 컨테이너로 전달되고 마지막으로 `64 bytes from ...` 같은 ping 응답이 출력. Docker 엔진 안에 DNS 서버가, 컨테이너 안에 DNS 관련 기술이 이미 포함되어 있으므로 이를 잘 활용하면 여러 서비스로 확장할 수 있다. libnetwork 는 (강사 표현으로) 컨테이너 네트워크 모델(CNM)의 구현체이며 기본 네트워크 기능 외에 **서비스 검색** 기능을 갖는다.
- **[실습 1] fc-net + Elasticsearch es1/es2**: 기존 네트워크를 써도 되지만 구분을 위해 새 네트워크 `fc-net`(Fast Campus net 의 줄임)을 생성. `route` 로 fc-net 에 할당된 대역 확인 - 실습 터미널에서는 **172.20.0.0**(iface br-71c169525ae4)이며 교재 슬라이드 예시(172.19.0.x)와 실제 터미널(172.20.0.x)의 IP 가 다른 것은 실습 환경마다 할당되는 대역이 다르기 때문이다. 검색 엔진인 **Elasticsearch** 이미지(7.17.10)를 이름 es1, es2 로 두 개 띄운다. 두 컨테이너 모두 `--net=fc-net` 에 연결하고 `--net-alias=esnet-tg` 로 같은 alias 를 준다(esnet-tg 가 하나의 논리적 그룹(타겟 그룹)이 됨). 컨테이너가 열어 두는 포트는 각각 9200 과 9300 이라 호스트에는 각각 9201/9301, 9202/9302 로 연결했고, 환경 변수 `discovery.type=single-node` 로 단일 노드로 운영(Docker Hub 의 Elasticsearch 설명에 나와 있다고 안내). `docker ps | grep es` 로 es1, es2 모두 Up 상태 확인(포트 표기 예: 0.0.0.0:9201->9200/tcp, 0.0.0.0:9301->9300/tcp). `docker inspect es1 | grep -i ipa` -> es1 = 172.20.0.2, es2 = 172.20.0.3(화면의 첫 `"IPAddress": ""` 는 기본 bridge 용 필드이고 실제 IP 는 네트워크 fc-net 항목 안에 있음).
- **busybox nslookup**: 같은 네트워크(fc-net)에서 임시 컨테이너를 띄워 DNS 를 조회. busybox 는 아주 가벼운 리눅스 이미지이며 `nslookup`(DNS 확인 명령)이 들어 있다. `--rm` 은 컨테이너가 종료되면 자동 삭제, `-it` 는 터미널과 연결. 응답의 Server/Address(127.0.0.11, 127.0.0.11:53)는 "어느 DNS 서버에서 쿼리를 요청했는지"(슬라이드 주석). `nslookup esnet-tg` 를 조회하면 es1(172.20.0.2)과 es2(172.20.0.3)의 주소가 함께 응답 - **alias 이름 하나가 그룹 안의 컨테이너 IP 들이 DNS 에 등록**되어 있다는 뜻. IP 로 역조회하면 `2.0.20.172.in-addr.arpa name = es1.fc-net`, `3.0.20.172.in-addr.arpa name = es2.fc-net` 처럼 컨테이너 이름이 나온다.
- **es3 추가 시 자동 등록**: "같은 그룹, 같은 네트워크에 es3 를 띄우면?" -> es3 를 추가(`-p 9203:9200 -p 9303:9300`)한 뒤 다시 nslookup 하면 **주소가 3개(172.20.0.3, 172.20.0.4, 172.20.0.2)로 증가**. 추가한 컨테이너가 자동으로 목록에 올라온 것이 **Docker 에 DNS 가 있다는 증거**. 역조회(결과 표시까지 시간이 조금 걸릴 수 있음)도 정상.
- **centos:8 에서 curl 반복 요청**: `docker run -it --rm --name=request-container --net=fc-net centos:8 bash` 후 `curl -s esnet-tg:9200` (타겟 그룹 이름 뒤에 Elasticsearch 포트 9200, 모든 컨테이너가 9200 포트로 연결되어 있어 esnet-tg:9200 으로 조회하면 됨). **요청을 보낼 때마다 응답의 `name` 이 다른 컨테이너로 바뀐다**(예: 3ce83359a9b5 / 10d929a4fede / a0795b728bcf) - 마치 타겟 그룹으로 온 요청에 그룹 안 컨테이너들이 돌아가며 응답하는 Round Robin 방식(각 컨테이너가 단일 노드로 실행되었으므로 `cluster_uuid` 도 서로 다르다). 다른 네트워크에서도 같은 방식으로 각 컨테이너가 응답할 것이라고 덧붙임.
- **docker inspect 로 alias 확인**: 컨테이너가 어떤 네트워크에 어떤 alias 로 묶여 있는지 알고 싶을 때 실무에서도 자주 쓴다. `docker inspect es1` -> `Networks > fc-net > Aliases: ["esnet-tg", "<컨테이너 ID 앞부분(예: eca69cd10625)>"]`. 직접 준 alias(esnet-tg)와 컨테이너 ID 앞부분이 함께 들어 있다(슬라이드 주석: "target group 으로 등록된 --net-alias 를 조회한다").
- **[실습 2] DNS 를 활용한 docker proxy(Load balancing) - 3단계**: (1) 사용자 정의 Bridge network 생성 (2) `--net-alias` 를 이용한 target group 생성 (3) 등록된 DNS 등록 확인("dig" tool). 조건이 두 가지, 즉 사용자 정의 브리지 네트워크 생성과 net-alias 로 타겟 그룹 생성이면 DNS 에 등록되는 구조(alias 에 포함된 컨테이너들의 IP 주소가 Docker DNS(Service discovery, 127.0.0.11)에 등록되는 관계)를 구분하고 그 안에서 dig 로 확인한다. 사용자 정의 네트워크 이름 `netlb` 는 "네트워크 로드 밸런서"의 줄임. 172.200.1.0/24 대역(256개 주소)으로 만들고 `route` 로 대역 확인(br-d20abd1b247f). `--net-alias tg-net` 타겟 그룹으로 ubuntu:14.04 컨테이너 3개(nettest1~3)를 띄우고 IP 확인: nettest1 = 172.200.1.2, nettest2 = 172.200.1.3, nettest3 = 172.200.1.4. 그룹으로 트래픽을 보낼 `frontend` 컨테이너를 같은 netlb 네트워크에 만들고 타겟 그룹 이름 `tg-net` 으로 ping. **ping 을 여러 번 던지면 요청마다 그룹의 다른 컨테이너가 응답**한다. 강사: 정확하게 1-2-3-4 순서의 Round Robin 으로 떨어지는 느낌은 아니지만(화면에서는 nettest1, nettest2, nettest2, nettest3 순), 2번·3번·4번 IP 의 컨테이너들이 트래픽을 나눠 받는 것을 확인할 수 있다.
- **dnsutils 와 dig**: 응답하는 컨테이너들이 DNS 에 어떻게 등록되어 있는지 보려고 frontend 컨테이너 안에서 `apt update` -> `apt-get -y install dnsutils` 로 dnsutils 를 설치한 뒤 `dig tg-net` 을 실행. 강사가 **DNS 조회 도구 dig(Domain Information Groper)** 를 소개. 결과: `ANSWER SECTION` 에 `tg-net. 600 IN A 172.200.1.3 / .4 / .2` 세 건, `SERVER: 127.0.0.11#53(127.0.0.11)` - 쿼리에 응답한 서버가 **127.0.0.11, 53번 포트의 Docker DNS** 라는 점이 DNS 서버가 있다는 증거. **A 레코드**는 "이름 하나가 어떤 IPv4 주소를 가리키는가"를 적은 DNS 항목이며, 같은 이름(tg-net)에 A 레코드가 여러 개 있으면 이름 하나로 여러 서버가 응답한다는 뜻이고 이것이 DNS 를 이용한 간단한 부하 분산의 기반. 600 은 TTL(캐시 유지 시간, 초).
- **nettest4 추가**: 별도 터미널에서 `docker run -itd --name=nettest4 --net=netlb --net-alias=tg-net ubuntu:14.04` 후 `dig tg-net` 재실행 -> **A 레코드가 3개에서 4개(172.200.1.6 추가)로 늘어나고 응답 크기(MSG SIZE)도 90에서 112로 커졌다.** 이후 ping 에서는 4번, 6번, 2번, 3번처럼 계속 다른 컨테이너가 응답을 받을 수 있다는 것이 DNS 서버의 주된 역할이라고 정리. DNS 기술이 필요한 애플리케이션이라면 이런 방식으로 서비스를 구현하는 것도 좋은 방법.

### [사용한 CLI]

**[실습 1] fc-net + Elasticsearch 2~3대 + busybox nslookup**
```bash
docker network create fc-net
docker network ls
route                                     # 172.20.0.0/16 -> br-71c169525ae4

docker run -d --name=es1 --net=fc-net --net-alias=esnet-tg -p 9201:9200 -p 9301:9300 -e "discovery.type=single-node" elasticsearch:7.17.10
docker run -d --name=es2 --net=fc-net --net-alias=esnet-tg -p 9202:9200 -p 9302:9300 -e "discovery.type=single-node" elasticsearch:7.17.10
docker ps | grep es

docker inspect es1 | grep -i ipa          # 172.20.0.2
docker inspect es2 | grep -i ipa          # 172.20.0.3

# DNS 조회용 임시 컨테이너 (--rm: 종료 시 삭제)
docker run -it --rm --name=request-container --net=fc-net busybox nslookup esnet-tg
#   Server: 127.0.0.11 / Address: 127.0.0.11:53
#   Name: esnet-tg  Address: 172.20.0.3
#   Name: esnet-tg  Address: 172.20.0.2
docker run -it --rm --name=request-container --net=fc-net busybox nslookup 172.20.0.2     # 역방향: es1.fc-net
docker run -it --rm --name=request-container --net=fc-net busybox nslookup 172.20.0.3     # 역방향: es2.fc-net

# 3번째 컨테이너 추가 -> DNS 결과에 자동 반영
docker run -d --name=es3 --net=fc-net --net-alias=esnet-tg -p 9203:9200 -p 9303:9300 -e "discovery.type=single-node" elasticsearch:7.17.10
docker run -it --rm --name=request-container --net=fc-net busybox nslookup esnet-tg       # 3개 IP

# centos:8 컨테이너에서 curl 로 반복 요청 -> 응답의 name 이 번갈아 바뀜
docker run -it --rm --name=request-container --net=fc-net centos:8 bash
[root@... /]# curl -s esnet-tg:9200

# alias 확인
docker inspect es1       # Networks > fc-net > Aliases: ["esnet-tg", "<컨테이너ID 앞부분>"]
docker inspect es2
```

**[실습 2] netlb + nettest1~3 + frontend (ping / dig)**
```bash
docker network create \
  --driver bridge \
  --subnet 172.200.1.0/24 \
  --ip-range 172.200.1.0/24 \
  --gateway 172.200.1.1 \
  netlb
route
docker network ls

docker run -itd --name=nettest1 --net=netlb --net-alias tg-net ubuntu:14.04
docker run -itd --name=nettest2 --net=netlb --net-alias tg-net ubuntu:14.04
docker run -itd --name=nettest3 --net=netlb --net-alias tg-net ubuntu:14.04
docker inspect nettest1 | grep IPAddress    # 172.200.1.2
docker inspect nettest2 | grep IPAddress    # 172.200.1.3
docker inspect nettest3 | grep IPAddress    # 172.200.1.4

docker run -it --name=frontend --net=netlb ubuntu:14.04 bash
root@...:/# ping -c 1 tg-net      # 호출할 때마다 nettest1 / nettest2 / nettest3 로 번갈아 응답
root@...:/# ping -c 2 tg-net
root@...:/# apt update
root@...:/# apt-get -y install dnsutils     # dig 사용을 위해 설치
root@...:/# dig tg-net
#   ;; ANSWER SECTION:
#   tg-net. 600 IN A 172.200.1.3
#   tg-net. 600 IN A 172.200.1.4
#   tg-net. 600 IN A 172.200.1.2
#   ;; SERVER: 127.0.0.11#53(127.0.0.11)

# 4번째 컨테이너 추가 -> dig 결과 ANSWER 4개 (172.200.1.6 추가)
docker run -itd --name=nettest4 --net=netlb --net-alias=tg-net ubuntu:14.04
docker ps
root@...:/# dig tg-net
root@...:/# ping -c 2 tg-net
```

### [확인 방법/주의점]
- `nslookup esnet-tg` / `dig tg-net` 의 SERVER 가 `127.0.0.11` 인지(Docker 내장 DNS), 컨테이너를 추가하면 응답 IP 개수가 늘어나는지 확인.
- `curl -s esnet-tg:9200` 반복 시 응답의 `name` 이 번갈아 나타남(Round Robin, 응답 속 name 은 각 노드 이름).
- `dig` 의 A 레코드 = 도메인 이름에 대한 IPv4 주소. TTL 600 은 자료 출력값.
- 같은 alias 를 쓰려면 같은 사용자 정의 네트워크에 있어야 한다. Elasticsearch 예시 이미지 버전 7.17.10, `-e "discovery.type=single-node"` 는 자료 그대로.

---

## Step 13. 컨테이너 Proxy 개념 (Forward / Reverse, Nginx, HAProxy)

### [목적]
- 서비스 앞단에 Proxy(Load Balancer)를 두는 이유와, Forward / Reverse Proxy 의 차이, Nginx 와 HAProxy(L4/L7)의 특성을 이해한다.

### [이론 설명]
- **Proxy 가 없을 때의 문제**: 클라이언트가 서버(또는 DB)에 직접 접속하면 서버 장애 시 서비스 전체가 중단되는 **SPOF**(단일 장애점)가 되고, 특정 서버에 부하가 집중되는 Hotspot 이 생긴다. 서버를 2~3대로 늘리고 그 앞에 부하분산(Load Balancing)을 두어 해결.
- **Proxy**: 클라이언트와 서버 사이에서 대신 요청을 전달하는 서버. 용도에 따라 forward proxy / reverse proxy.

| 기능 | 해당 Proxy |
|---|---|
| Load Balancing(클러스터 분산) | Reverse (R) |
| Caching(HTML, JS, CSS 등 정적 자원) | Forward, Reverse |
| 클라이언트 접근 통제/익명화 등 | Forward (F) |
| 서버 보호 / 숨김 | Reverse (R) |
| SSL 처리(인증서 한 곳에서 처리) | Reverse (R) |

- **Forward Proxy**: client -> proxy -> internet. 클라이언트를 대신해 외부(인터넷)에 접속(client 를 숨김).
- **Reverse Proxy**: internet(client) -> proxy -> 내부 서버들. 서버 앞단에서 요청을 받아 내부 서버로 분산(예: 서버 3대에 1,2,3,1,2,3 순서 = round-robin). 서버 정보를 숨김.
- **Nginx**: 대표적인 웹서버이자 **Reverse Proxy**. Kubernetes 의 `nginx ingress controller`, API Gateway, MSA 의 MicroGateway 등에서도 사용. 설정 파일은 `/etc/nginx/nginx.conf`. 부하분산 방식: **round-robin**(기본), **least_conn**(연결이 가장 적은 서버), **ip_hash**(클라이언트 IP 기반 고정). (참고: https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/) 컨테이너로 쓰는 Nginx 는 EXPOSE 80 이다.
- **HAProxy**: L4/L7 로드밸런서, TCP/HTTP 프록시. 특징: SSL 처리, Load Balancing, **Active health check**(서버 상태를 능동적으로 점검), KeepAlived 와 함께 **Active-Passive** 고가용성(HA) 구성 가능. 설정 파일은 `haproxy.cfg`.
  - **L4(Layer 4, `mode tcp`)**: IP/Port 기반으로 분산 (예: web1~3 round-robin).
  - **L7(Layer 7, `mode http`)**: HTTP 요청의 **URI**(예: /item, /basket) 등 내용을 기반으로 라우팅. 예: example.com/item -> web1,2 / example.com/basket -> web3,4 (각 그룹 내 round-robin).

**[원문 한글 자료 기반 보강 - 037 Clip 4]** (이 클립은 실습이 아닌 개념 설명 클립이며 명령어 실습은 다음 클립부터)
- **Proxy / Load Balancer 가 없는 구성의 문제(슬라이드 "No config proxy! no Load Balancer!?")**: 사용자(client) -> 인터넷 -> 웹서버 -> DB 서버로 직접 요청이 가는 일반적인 구조에서 (1) Proxy 구성이 없으면 사용자의 요청이 직접 웹서버에 전달되어 서버 부담이 가중된다. (2) 단일 웹서버 구성은 장애 발생 시 서비스 가용성에 치명적이다. (3) 다중 웹서버로 구성해도 요청한 부하를 적절히 분산시키지 못하면 한 서버에 부하가 몰리는 **Hotspot** 이 발생할 수 있다. (4) 최종 사용자 관점의 응답 시간 만족을 얻기 힘들다. 웹서버가 한 대뿐이면 그 한 지점의 장애가 전체 서비스 장애로 번지는 **싱글 포인트 페일리어(SPOF, 단일 장애점)**. 그래서 보통 웹서버를 2~3대로 늘려 클러스터로 구성하는데, 요청을 분산시켜 주는 기술(로드 밸런서, 프록시)이 적절히 분산하지 못하면 서버가 여러 대여도 한 서버에 부하가 몰리는 Hotspot 이 생긴다. **서버를 두 대 이상 쓰는 모든 이유의 핵심은 최종 사용자의 응답 시간 만족도**이며, 강사는 응답 시간 기준을 보통 3초 또는 5초로 잡고 3초를 기준으로 한다면 3초 이내에 응답하는 것을 기본 룰로 삼는다고 설명. 프록시는 서버의 안정성과 빠른 응답 시간을 함께 확보하기 위한 수단.
- **프록시의 정의**: 요청자와 응답자 간의 중계 역할, 즉 통신을 대리 수행하는 서버가 **proxy server**. 클라이언트와 서버 사이에 중계기를 하나 세운다고 생각하면 되며, 프록시 서버의 위치에 따라 **forward proxy** 와 **reverse proxy** 로 구분한다.
- **프록시 활용 표(슬라이드의 (F)=Forward, (R)=Reverse)**: Load Balancing - Reverse(R) - 다중 호스트(Cluster)를 활용하여 트래픽 분산 / 캐시 서버 - Forward, Reverse(F,R) - 자주 쓰이는 HTML, JS, CSS 등 정적 파일을 caching 하여 서버 부하와 네트워크 트래픽을 줄이고 빠르게 응답 / 접근 차단 - Forward(F) - 학교 및 사내망에서 보안을 위해 특정 사이트 접근 차단 / 무중단 배포 - Reverse(R) - 무중단 배포를 통한 서비스 지속 / SSL 암호화 - Reverse(R) - SSL 암호화 적용으로 보안 강화. 강사: 이 중 **로드 밸런싱은 보통 리버스 프록시로 구현**하며, 이번 챕터에서 다룰 Nginx 와 HAProxy 를 모두 리버스 프록시 개념으로 접근한다.
- **포워드 프록시**: 슬라이드 - forward proxy 는 client 와 internet 사이에 있어서 client 정보가 서버에 노출되지 않는다. 클라이언트의 요청을 직접 받는 곳이 포워드 프록시이고, 클라이언트는 프록시를 통해 인터넷을 거쳐 실제 웹서버에 정보를 요청한다. 서버 입장에서는 프록시에서 온 요청으로만 보이므로 클라이언트 정보가 드러나지 않는다.
- **리버스 프록시**: Reverse Proxy 는 client 요청을 서버 대신 받아서 전달. **client 에게 서버가 노출되지 않는다.** 그림에서 프록시는 인터넷과 웹서버들 사이에 놓여 있다. 클라이언트는 프록시 주소만 알고 있고, 프록시가 웹서버 3대에 요청을 1번, 2번, 3번, 1번, 2번, 3번 순으로 돌아가며 전달하는(라운드 로빈) 부하를 분산. 구분표: Forward Proxy = client 와 internet 사이, client 정보가 서버에 노출되지 않음 / Reverse Proxy = internet 과 웹서버 사이, client 에게 서버가 노출되지 않음, 부하 분산에 많이 사용. **강사는 포워드 프록시보다 리버스 프록시가 더 많이 사용되는 편**이라고 말했다. 앞에서는 도커 자체 기능(강의 음성에서 "네트워크 얼라이어스"로 들리는 방법 - 화면상 확인 불가)으로 비슷한 구성을 보았고, 이번에는 상용 서비스로도 쓰이는 오픈스 소프트웨어 Nginx 로 구현해 본다고 소개.
- **Nginx 특징**: 기본 구성 값으로 "웹 서버"를 실행하며 **동일 계열 점유율이 제일 높다**. 추가 구성으로 "Reverse Proxy" 구현이 가능. **Kubernetes 의 ingress controller 로 "nginx ingress controller" 선택이 가능**, **API 트래픽 처리를 고급 HTTP 처리 기능으로 사용 가능한 "API Gateway" 구성**이 가능, **MSA 트래픽 처리를 위한 MicroGateway** 로 사용 가능. 설정은 (linux 기준) `/etc/nginx` 하위의 `nginx.conf` 변경을 통해 구성. 강사 설명: 지금까지는 Nginx 공식(official) 이미지를 내려받아 컨테이너로 **웹서버** 기능을 서비스하는 용도로 많이 써 왔다. 하지만 nginx.conf 설정 값을 리버스 프록시 방식으로 바꾸면 같은 Nginx 를 웹서버가 아닌 리버스 프록시로도 구현할 수 있다. Nginx 에는 오픈소스 버전과 상용 버전이 있다. 쿠버네티스에서는 인그레스 컨트롤러가 도메인이나 IP 뒤에 오는 /A, /B, /C 같은 경로(URI)에 따라 트래픽을 나누어 주는데 여러 컨트롤러 중 Nginx ingress controller 가 자주 쓰이며 쿠버네티스에서는 이를 자주 사용한다고 했다. 마이크로서비스 구조에서는 Nginx 로 마이크로 게이트웨이를 만들어 외부 트래픽이 들어오는 하나의 진입점으로 쓸 수 있다. (입문자 설명: ingress controller 는 쿠버네티스 클러스터 밖에서 들어오는 요청을 내부 서비스로 연결해 주는 구성요소, API Gateway 는 여러 API 요청을 한곳에서 받아 알맞은 서비스로 넘겨 주는 관문.)
- **Nginx 리버스 프록시의 동작과 부하 분산 방식(슬라이드)**: 클라이언트 요청이 **80 포트로 들어오면 준비해 둔 애플리케이션 서버의 주소로 각 서버로 트래픽을 분배**한다. **기본 분배 방식(LoadBalancing)은 round-robin 방식으로 처리**, 요청이 적은 서버로 분배하는 **least_conn** 방식, IP 당 서버를 분배하는 **ip_hash** 등 여러 가지 부하 분산 알고리즘을 사용할 수 있다. 참고 링크 https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/ (강사: 이 사이트에 가 보면 언급한 세 가지 외에도 대략 6개 정도의 부하 분산 알고리즘이 제공된다고 안내). 강사 설명: Nginx 의 기본 노출(EXPOSE) 포트는 80번이라, 80번 포트로 들어온 요청을 뒷단의 웹서버들 중 하나로 차례대로 전달하는 부하 분산 패턴을 **라운드 로빈**(기본값)으로 사용한다. 알고리즘을 바꾸면 뒷단으로 전달하는 부하 분산 패턴을 조정할 수 있다. 결론: **Nginx 는 설정 파일(nginx.conf)만 바꾸면 웹서버가 아닌 리버스 프록시로 동작하며, 기본 부하 분산 방식은 round-robin.** 이 클립에서는 설정 예시를 직접 실행하지 않고 개념만 소개.
- **HAProxy**: 슬라이드 - **하드웨어 기반의 L4 / L7 스위치를 대체하기 위한 오픈소스 소프트웨어 솔루션**. **TCP 및 HTTP 기반 애플리케이션을 위한 고가용성(Active-Passive), Load Balancing 및 프록시 기능을 제공하는 매우 빠르고 안정적인 무료 Reverse Proxy**. 주요 기능: ① **SSL 지원** - SSL 기능 탑재 가능(Nginx 프록시도 가능) ② **Load Balancing** - Nginx 프록시도 로드 밸런싱 가능 ③ **Active health check** - 뒷단 웹서버들에 주기적으로 헬스 체크를 하여, 응답이 없는(active 하지 않은) 서버로는 트래픽을 보내지 않음 ④ **KeepAlived(proxy 이중화)** - 프록시 서버를 Active-Passive 로 구성. Active 쪽 HAProxy 에 문제가 생기면 Passive 쪽이 Active 로 바뀌어 서비스를 지속. 강사는 헬스 체크와 KeepAlived 를 HAProxy 가 가진 좀 더 고급 기술로 소개하며 "HA(High Availability, 고가용성)라는 말을 실현한 구성품"이 HAProxy 라고 표현했다(KeepAlived 등은 추가 구성이 필요할 수도 있다고도 언급). 이 모든 기능은 **haproxy.cfg** 설정 파일을 수정하여 구현. (KeepAlived 구성은 이 자료 범위에 실습 없음.)
- **HAProxy L4 (Layer 4, TCP 모드)**: OSI 7 계층 중 Layer 4 는 IP 를 이용한 트래픽 전달이 특징. HAProxy L4 구성 시 **IP 와 Port 를 기반으로 사용자 요청 트래픽을 전달**하도록 구성, 요청에 대한 처리는 웹서버로 구성된 web1~3 에 round-robin 방식으로 부하 분산. 강사 설명: OSI 7계층으로 만들려면 설정의 **mode 값에 tcp** 를 지정. 그러면 IP 와 포트를 기반으로 사용자 요청 트래픽을 전달하며, 그림처럼 web1, web2, web3 를 1,2,3,1,2,3 순서의 라운드 로빈으로 호출하는 L4 프록시가 된다(앞서 본 Nginx 설명과 비슷).
- **HAProxy L7 (Layer 7, HTTP 모드)**: OSI 7 계층 중 Layer 7 은 **HTTP 기반의 URI 를 이용한 트래픽 전달**이 특징. 동일한 도메인(example.com)의 하위에 존재하는 여러 웹 애플리케이션 서버를 사용할 수 있다. `example.com/item` 또는 `example.com/basket` 으로 연결된다. 사용자의 요청과 설정에 따른 부하 분산. 강사 설명: **mode 를 http 로 설정**하면 IP 또는 도메인 뒤에 붙는 **/경로** 주소 체계로 분기할 수 있다. URI 는 Uniform Resource Identifier(자원 식별자)의 약자로, /item, /basket 같은 경로가 곧 "어느 서비스로 보낼지"를 가리키는 식별자가 된다. 슬라이드처럼 /item 요청은 web1, web2 로 이루어진 그룹으로, /basket 요청은 별도의 web3, web4 그룹으로 전달하고 각 그룹 안에서도 1번, 2번, 1번, 2번 식으로 라운드 로빈 구성이 가능하다. 강사는 이것을 **HAProxy L7 의 또 다른 장점**으로 짚었다. 비교: HAProxy L4 = Layer 4 (mode tcp) / 분기 기준 IP 와 Port / 구성 web1~3 round-robin, HAProxy L7 = Layer 7 (mode http) / 분기 기준 HTTP 의 URI (/item, /basket) / URI 별 웹서버 그룹으로 분산.
- **다음 클립 예고**: 다음 챕터에서 Nginx 를 이용한 프록시와 HAProxy 를 이용한 프록시를 직접 구현하며(음성에서 5장, 6장으로 언급), HAProxy 는 L4 와 L7 중 **L7 위주**로 설정 값을 조금씩 바꿔 가며 URI 기법을 다양하게 보여 줄 예정이라고 했다. (문서 내 "음성 인식 불명확" 표기: 본 자료의 일부 용어 - 예: "네트워크 얼라이어스" - 는 화면상 확인 불가.)

### [사용한 CLI]
- 이 Step 은 개념 단계로 별도 CLI 없음. 구체 명령/설정은 Step 14 (Nginx), Step 15 (HAProxy) 참고.
- 설정 키워드 요약: Nginx `upstream`, `proxy_pass`, `weight`, `least_conn`, `ip_hash` / HAProxy `mode tcp`, `mode http`, `frontend`, `backend`, `acl`, `use_backend`.

### [확인 방법/주의점]
- 단일 서버 구성은 SPOF 와 부하 집중 위험이 있으므로 Proxy + 다중 서버 구성.
- HAProxy 자체도 단일 장애점이 될 수 있어 KeepAlived 로 Active-Passive 이중화.
- L4 는 IP/Port, L7 은 URI 기반이므로 경로별로 서버 그룹을 나누려면 L7(mode http).

---

## Step 14. [실습] Nginx 를 활용한 Reverse Proxy / Load Balancing

### [목적]
- 호스트에 설치한 Nginx(80)가 5001~5003 포트의 컨테이너 3대에 요청을 분산하도록 `nginx.conf` 를 구성하고, 이후 Nginx 도 컨테이너로 만들어 동일한 구성을 구현한다. 마지막으로 weight 로 분산 비율을 조정한다.

### [이론 설명]
- 구조: Client -> Nginx(80, reverse proxy) -> alb-node01~03 컨테이너(5001~5003).
- `upstream`: Nginx 가 요청을 분산할 서버 그룹. `proxy_pass`: 받은 요청을 upstream 그룹으로 전달. 별도 방식을 지정하지 않으면 기본 round-robin.
- 호스트 Nginx 설정에서는 컨테이너 포트를 `-p` 로 호스트에 공개했으므로 `127.0.0.1:5001` 로 접근 가능하다. **Nginx 를 컨테이너로 옮기면 127.0.0.1 은 그 컨테이너 자신**을 가리키므로 호스트 IP(192.168.56.101)로 바꿔야 한다.
- **weight**: 서버별 가중치(분산 비율). 60:20:20 = 3:1:1 의 비율로 5001 서버가 더 많이 처리.
- **cgroup 이슈**: 실습 이미지(dbgurum/nginxlb:1.0)가 `/sys/fs/cgroup/memory/memory.limit_in_bytes` 를 읽는데, 호스트가 cgroup v2(Ubuntu 22.04 기본)이면 해당 파일이 없어 컨테이너가 `Exited(1)` 로 종료된다. 해결: 이미지를 cgroup v2 대응으로 바꾸거나, **호스트를 cgroup v1 로 전환**(자료에서 선택한 방법).

**[원문 한글 자료 기반 보강 - 038 Clip 5]**
- **이번 실습의 흐름**: 앞 클립에서 소개한 프록시 개념을 **실제로 만들어 보는 첫 번째 실습**. 먼저 컨테이너가 아니라 **도커 호스트인 Ubuntu 에 Nginx 를 직접 설치**하고 `nginx.conf` 를 수정해 리버스 프록시로 바꾼다(클라이언트가 호스트 80번 포트로 요청하면 뒤의 컨테이너들로 부하가 분산되는 과정). 그다음 호스트에 만든 Nginx 를 **컨테이너로 바꿔** 같은 일을 시키고, 마지막으로 **가중치(weight)** 기법으로 특정 컨테이너에 요청을 더 많이 보내는 방법까지 다룬다. 전체 순서: 구조 소개 -> apt update / apt install nginx -> cgroup 문제 해결 -> docker run x3 (alb-node01~03, 5001~5003) -> 호스트 nginx.conf 리버스 프록시 (upstream + proxy_pass, 재시작 후 1->2->3 순환 확인) -> 호스트 Nginx 제거 -> Nginx 컨테이너 프록시(8001, docker cp + restart, curl 확인) -> weight 60:20:20(= 3:1:1). 용어: **리버스 프록시** = 클라이언트 요청을 대신 받아 뒤쪽(백엔드) 서버로 전달해 주는 중간 서버, **로드 밸런싱** = 여러 서버에 요청을 나눠 보내는 것, **upstream** = Nginx 에서 요청을 넘길 백엔드 서버들의 목록.
- **호스트 Nginx 설치**: 설치 전 `apt update` 로 패키지 목록을 갱신한 뒤 Nginx 를 설치(강사는 apt 또는 apt-get 을 사용했고 버전을 따로 지정하지 않았음). 설치 후 `sudo nginx -v` -> `nginx version: nginx/1.18.0 (Ubuntu)`, `systemctl status nginx.service` 에서 `active (running)`, `sudo netstat -nlp | grep 80` 에서 80번을 Nginx(`nginx: master`)가 LISTEN 하는 것을 확인. **주의(강사): 이전 실습에서 `--net host` 로 80번 포트를 쓰는 컨테이너를 띄웠다면, 그 컨테이너를 삭제하지 않은 채 호스트에 Nginx 를 설치하면 포트 충돌로 Nginx 가 active 가 되지 않고 멈춰 있게 된다. 반드시 80번을 쓰는 컨테이너가 없는지 먼저 확인하라.**
- **백엔드 컨테이너가 바로 Exited(1) 되는 오류와 cgroup v2 -> v1 해결**: 강사가 실습용으로 만들어 둔 이미지 `dbgurum/nginxlb:1.0` 으로 컨테이너(alb-node01)를 실행했는데 곧바로 종료. **에러가 나면 `docker logs` 로 확인하는 것이 가장 좋은 방법**: `cat: /sys/fs/cgroup/memory/memory.limit_in_bytes: No such file or directory`. 원인: 현재 도커(강의에서는 24 버전)는 **cgroup 버전 2** 를 사용하는데, 예전 버전에서 만든 강사의 이미지가 cgroup v2 를 받아들이지 못해 에러가 난다. 해결 방법은 두 가지: (1) 이미지를 업그레이드하거나, (2) 기존 이미지를 쓰려면 **cgroup 버전을 1로 낮춘다**. 이 강의는 (2)를 택했다. `docker rm alb-node01` -> `docker info`(Cgroup Driver: systemd, Cgroup Version: 2) -> `sudo sed -i '/^GRUB_CMDLINE_LINUX/ s/"$/ systemd.unified_cgroup_hierarchy=0"/' /etc/default/grub` -> `sudo update-grub` -> `sudo reboot` -> `docker info` 가 `Cgroup Driver: cgroupfs`, `Cgroup Version: 1` (Ubuntu 22.04.2 LTS, Kernel 5.19.0-43-generic 화면). **grub 은 커널 부팅 때 사용하는 설정이라 update-grub 후에는 재부팅이 권장**되며 재부팅 후 새 터미널을 다시 접속해야 한다. 강사는 이 에러가 자신과 같은 환경에서 이 이미지를 쓰는 수강생 대부분이 겪을 것이라고 설명했고, 다른 종류의 에러도 발생할 수 있다고 덧붙였다. sed 명령 보충: `/etc/default/grub` 의 `GRUB_CMDLINE_LINUX` 줄 끝(닫는 따옴표 앞)에 `systemd.unified_cgroup_hierarchy=0` 커널 옵션을 붙여 systemd 가 통합(v2) cgroup 대신 v1 구조를 쓰게 하는 작업. **오타 주의**: 이 화면에서 첫 시도는 `-name=alb-node01`(하이픈 1개)로 잘못 입력해 `docker: invalid reference format.` 에러가 났고, `--name`(하이픈 2개)으로 고쳐 다시 실행하자 이미지 pull 이 진행되었다. 옵션은 하이픈 두 개를 정확히 써야 한다.
- **백엔드 3대 실행/확인**: 재부팅 후 alb-node01 하나를 먼저 실행해 정상 기동(Up)을 확인하고, 같은 방식으로 02, 03 을 띄운다. 각 컨테이너는 `-e SERVER_PORT` 로 자신의 포트 번호를 환경 변수로 받고, 같은 `-p` 로 컨테이너와 호스트에 같은 포트를 열며, `-h` 로 컨테이너 호스트 이름을 지정한다. 이 이미지는 접속하면 `Listening: 500x, Hosting: alb-node0x` 문구를 보여 준다. 3개 컨테이너가 모두 5001~5003 포트로 매핑되어 호스트에서 리슨 중인지 `netstat` 로 확인(번거롭지만 꼭 해야 하는 확인 작업이라고 강조). 브라우저에서 호스트 주소(192.168.56.101)의 80번으로 접속하면 지금은 **Welcome to nginx!**(호스트에 설치한 Nginx 의 기본 웹서버 화면)가 나오고 5001, 5002, 5003 번으로 직접 접속하면 각각 alb-node01~03 화면. **목표는 80번으로 접속했을 때 Welcome 화면 대신 1->2->3번 컨테이너 화면이 돌아가며 보이게 하는 것.**
- **nginx.conf 읽는 법**: `listen 80 default_server;` 80번 포트로 들어오는 트래픽을 받는다 / `location / { ... }` 주소가 `/`(모든 요청)일 때의 처리 규칙 / `proxy_pass http://backend-alb;` 요청을 `backend-alb` 라는 이름의 upstream 으로 넘긴다(이 한 줄이 프록시 역할의 핵심) / `upstream backend-alb { server ...; }` 요청을 받을 서버 목록(여기서는 로컬(127.0.0.1)의 5001, 5002, 5003번 포트) / 별도의 분산 방식을 적지 않았기 때문에 기본값인 **라운드 로빈(순서대로 돌아가며 전달)** 으로 동작. 기존 설정은 `sudo mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.org` 로 백업. **설정을 저장한 뒤에는 반드시 Nginx 를 재시작(restart)해야 적용**된다. 재시작 후 status 가 active 가 되지 않는다면 nginx.conf 에 오타가 있다는 뜻이므로 설정을 다시 확인할 것. 설정이 적용되면 80번 접속 시 Welcome 화면이 아니라 1번, 2번, 3번이 차례로 보인다. Nginx 의 웹서버 기능을 프록시로 바꾸는 것은 설정만 바꾸면 되는 간단한 일.
- **호스트 Nginx 제거(컨테이너 전환 준비)**: 호스트에 설치한 Nginx 를 컨테이너로 바꾼다. 먼저 `sudo systemctl stop nginx.service` 로 Nginx 를 중지하고, **삭제하기 전에 nginx.conf 를 현재 디렉터리로 복사해 백업**(다음 단계에서 다시 쓰기 위해, `sudo cp ...`)한 다음 `sudo apt autoremove nginx` 로 제거. Nginx 가 지워지면 **80 포트의 점유자가 사라진다**. 이 상태에서는 80번으로 접속해도 아무것도 나오지 않지만, 5001~5003번으로 직접 접속하면 컨테이너가 살아 있으므로 정상적으로 응답 = 앞단의 프록시만 없어진 상태.
- **Nginx 컨테이너를 프록시로**: 순서 (1) Nginx 컨테이너를 띄운다 (2) nginx.conf 를 `docker cp` 로 컨테이너에 넣는다 (3) 컨테이너를 `restart` 한다. 그러면 그 컨테이너가 프록시로 바뀌어 클라이언트 요청을 받아 뒤의 5001~5003 컨테이너로 전달한다. 프록시 컨테이너는 호스트의 **8001** 포트로 열었으므로(`docker run -d -p 8001:80 --name=proxy-container nginx:1.25.0-alpine`) 이제 8001번으로 접속한다. 이 시점에 8001번으로 접속하면 Nginx 기본 화면(Welcome to nginx!). **nginx.conf 수정 시 달라지는 부분은 `upstream` 의 서버 주소 하나뿐**: 컨테이너 안에서 `127.0.0.1`(localhost)은 "이 컨테이너 자기 자신"을 뜻하므로 호스트에 열린 5001~5003 포트에 닿지 못한다(별도 네트워크를 지정하지 않은 기본 상태). 그래서 **호스트 IP(192.168.56.101)로 바꿔 준다.** 컨테이너는 호스트 위에 떠 있는 것이라고 강사가 설명. 컨테이너에 있던 기존 nginx.conf 는 `sudo rm -rf` 후 vi 로 다시 작성하는 모습. 설정 파일을 넣은 뒤 **컨테이너를 재시작해야 적용**된다. `curl localhost:8001` 로 요청하면 alb-node01 -> 02 -> 03 순서로 돌아가며 응답(라운드 로빈). 호스트에 있던 Nginx 를 컨테이너로 옮기고 nginx.conf 만 바꿔 넣으면 원하는 방향으로 로드 밸런싱하는 **프록시 컨테이너**를 만들 수 있다는 것이 이 단계의 결론.
- **가중치(weight)**: 백엔드 서버마다 **요청을 받는 비율을 다르게 주는 설정**. 강사는 60, 20, 20 을 주었고 이는 비율로 **3:1:1** 이다. 즉 5001번 컨테이너가 3번 들어갈 때 5002, 5003 번에는 각각 한 번씩만 들어간다. 같은 설정 파일의 server 줄 끝에 `weight=값` 을 추가한다. 저장한 뒤 컨테이너에 복사 -> 재시작 -> 브라우저에서 새로고침하면 이전에는 1, 2, 3, 1, 2, 3 으로 균등하게 돌던 것이 이제는 **1번이 훨씬 더 자주** 보인다. 이 밖의 분산 알고리즘은 강사가 링크로 안내한 Nginx 공식 문서를 참고하라고 했다.
- (참고) 앞 [확인 방법] 의 "컨테이너 안에서 nginx reload" 는 038 자료에서 확인되지 않는 일반론이며, 자료는 `docker cp` 후 `docker restart` 만 사용한다.

### [사용한 CLI]

**1) 호스트 Nginx 설치 상태 확인**
```bash
sudo apt update
sudo apt install nginx             # (자료: nginx 1.18.0 설치 상태 확인)
sudo nginx -v                      # nginx version: nginx/1.18.0 (Ubuntu)
sudo systemctl status nginx.service   # active (running)
sudo netstat -nlp | grep 80        # nginx master 가 80 LISTEN
```

**2) 백엔드 컨테이너 실행 시 cgroup 오류 확인 및 cgroup v1 전환**
```bash
docker run -it -d -e SERVER_PORT=5001 -p 5001:5001 -h alb-node01 -u root --name=alb-node01 dbgurum/nginxlb:1.0
docker ps -a | grep node           # Exited (1)
docker logs alb-node01
#   cat: /sys/fs/cgroup/memory/memory.limit_in_bytes: No such file or directory
docker rm alb-node01
docker info                        # Cgroup Driver: systemd / Cgroup Version: 2

# cgroup v1 로 전환
sudo sed -i '/^GRUB_CMDLINE_LINUX/ s/"$/ systemd.unified_cgroup_hierarchy=0"/' /etc/default/grub
sudo update-grub
sudo reboot
docker info                        # Cgroup Driver: cgroupfs / Cgroup Version: 1
```
- sed 설명: `/etc/default/grub` 의 `GRUB_CMDLINE_LINUX` 줄 끝(닫는 따옴표 앞)에 `systemd.unified_cgroup_hierarchy=0` 을 추가 -> update-grub 후 재부팅.
- (자료 주의: `-name=alb-node01` 처럼 `--` 를 `-` 하나만 쓰면 `docker: invalid reference format` 오류.)

**3) 백엔드 컨테이너 3대 실행**
```bash
docker run -it -d -e SERVER_PORT=5001 -p 5001:5001 -h alb-node01 -u root --name=alb-node01 dbgurum/nginxlb:1.0
docker run -it -d -e SERVER_PORT=5002 -p 5002:5002 -h alb-node02 -u root --name=alb-node02 dbgurum/nginxlb:1.0
docker run -it -d -e SERVER_PORT=5003 -p 5003:5003 -h alb-node03 -u root --name=alb-node03 dbgurum/nginxlb:1.0
docker ps -a | grep node
sudo netstat -nlp | grep 5001
sudo netstat -nlp | grep 5002
sudo netstat -nlp | grep 5003
```
- `-e SERVER_PORT` : 컨테이너 앱 포트, `-p` : 포트 공개, `-h` : hostname, `-u root` : 실행 사용자. 응답은 `Listening: 500x, Hosting: alb-node0x` 형태.

**4) 호스트 Nginx 의 nginx.conf 구성**
```bash
sudo mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.org      # 원본 백업
sudo vi /etc/nginx/nginx.conf
```
```nginx
events { worker_connections 1024; }

http {
   # List of application servers
   upstream backend-alb {
        server 127.0.0.1:5001;
        server 127.0.0.1:5002;
        server 127.0.0.1:5003;
   }

   # Configuration for the server
   server {
        # Running port
        listen 80 default_server;

        # Proxying the connections
        location / {
           proxy_pass           http://backend-alb;
        }
   }
}
```
```bash
sudo systemctl restart nginx.service
sudo systemctl status nginx.service
# 브라우저(192.168.56.101:80) 새로고침 -> 5001, 5002, 5003 순으로 응답 (round-robin)
```
| 설정 | 설명 |
|---|---|
| `listen 80 default_server;` | 80 포트로 요청 수신 |
| `location / { ... }` | 루트(/) 이하 모든 경로 처리 |
| `proxy_pass http://backend-alb;` | 요청을 upstream `backend-alb` 로 전달 |
| `upstream backend-alb { server ...; }` | 분산 대상 서버 목록 |

**5) 호스트 Nginx 정리(자료에서 컨테이너 방식 전환 전 수행)**
```bash
sudo systemctl stop nginx.service       # 호스트 Nginx 중지 (자료: 삭제 전 먼저 중지)
sudo cp /etc/nginx/nginx.conf ...       # 설정 파일 백업 (자료 화면 기준)
sudo apt autoremove nginx               # 호스트 Nginx 제거 후 5001 접속 가능 여부 확인 (80 포트 해제)
```

**6) Nginx 를 컨테이너로 구성**
```bash
docker run -d -p 8001:80 --name=proxy-container nginx:1.25.0-alpine
docker ps | grep proxy                  # 0.0.0.0:8001->80/tcp  proxy-container
# 브라우저 8001 -> Welcome to nginx!
```
```bash
vi nginx.conf       # upstream 의 127.0.0.1 을 호스트 IP 로 변경
```
```nginx
events { worker_connections 1024; }

http {
   upstream backend-alb {
        server 192.168.56.101:5001;
        server 192.168.56.101:5002;
        server 192.168.56.101:5003;
   }

   server {
        listen 80 default_server;

        location / {
           proxy_pass           http://backend-alb;
        }
   }
}
```
```bash
docker cp nginx.conf proxy-container:/etc/nginx/nginx.conf     # Successfully copied
docker restart proxy-container
curl localhost:8001      # Listening: 5001, Hosting: alb-node01
curl localhost:8001      # Listening: 5002, Hosting: alb-node02
curl localhost:8001      # Listening: 5003, Hosting: alb-node03
```

**7) weight (가중치) 적용**
```nginx
upstream backend-alb {
      server 192.168.56.101:5001 weight=60;
      server 192.168.56.101:5002 weight=20;
      server 192.168.56.101:5003 weight=20;
}
```
```bash
docker cp nginx.conf proxy-container:/etc/nginx/nginx.conf
docker restart proxy-container
docker ps | grep proxy
curl localhost:8001      # 반복 호출 -> 5001 서버가 더 자주 응답 (3:1:1)
```

### [확인 방법/주의점]
- 반복 `curl`/브라우저 새로고침으로 응답 서버(Listening/Hosting) 가 순환하는지 확인(기본 round-robin). weight 적용 후 5001 비중이 높아지는지 확인.
- 컨테이너 Nginx 의 upstream 에는 `127.0.0.1` 이 아닌 호스트 IP 사용. 설정 변경은 `docker cp` 후 `docker restart`(또는 컨테이너 안에서 nginx reload) 필요.
- 호스트에서 80 포트를 이미 Nginx 가 쓰고 있으면 컨테이너 80 매핑과 충돌하므로 8001 등 다른 호스트 포트 사용(자료는 호스트 Nginx 제거 후 컨테이너 사용).
- nginx.conf 수정 전에는 원본 백업(`nginx.conf.org`).
- cgroup v1 전환은 호스트 시스템 설정 변경 및 재부팅이 필요하므로 영향 범위 확인 후 진행.

---

## Step 15. [실습] HAProxy 를 활용한 Reverse Proxy (L7 URI 라우팅)

### [목적]
- 사용자 정의 네트워크(proxy-net)에서 echo 웹 컨테이너 3대를 HAProxy 컨테이너 뒤에 두고, `haproxy.cfg` 로 (1) 기본 round-robin, (2) URI 별 서버 지정(/echo-web1 등), (3) /item /basket 그룹별 분산을 구현한다. 통계 페이지(8404)도 확인한다.

### [이론 설명]
- haproxy.cfg 구성 요소: `global`(전역 설정), `defaults`(공통 기본값: mode, timeout, log), `frontend`(클라이언트 요청을 받는 쪽: bind, default_backend, acl), `backend`(요청을 전달할 서버 그룹: balance, server).
- `mode http` = L7, `mode tcp` = L4. `server s1 echo-web1:8080 check` 에서 이름은 같은 네트워크의 컨테이너 이름(Docker DNS), `check` 는 헬스체크 활성화.
- Nginx 와 달리 HAProxy 는 컨테이너 이름으로 서버를 지정(같은 사용자 정의 네트워크 사용 -> Docker DNS 가 이름 해석).
- `acl 이름 path_beg /경로` : 요청 URI 가 해당 경로로 시작하면 조건 성립, `use_backend <backend> if <acl>` : 조건에 맞으면 지정 backend 로 전달. 조건에 안 맞으면 `default_backend`.
- 8404 통계(stats) 페이지에서 frontend/backend 별 서버 상태(UP), 세션, 마지막 체크 등을 확인한다(`stats refresh 10s` = 10초 자동 갱신).

**[원문 한글 자료 기반 보강 - 039 Clip 6]**
- **실습 소개(슬라이드 "HAProxy L7")**: 앞 클립에서는 Nginx 를 컨테이너 프록시(로드 밸런서)로 구현했고, 이번 마지막 클립에서는 같은 일을 **HAProxy** 로 구현한다. **프록시(proxy)** 는 클라이언트와 서버 사이에서 요청을 대신 받아 뒤쪽 서버로 전달해 주는 중계자이고, 여러 서버로 나눠 보내면 로드 밸런서 역할. HAProxy 에는 **L4 레벨과 L7 레벨**이 있고 설정 파일에 **mode tcp** 를 쓰면 L4, **mode http** 를 쓰면 L7 로 동작한다. 이번 실습은 **L7 의 HTTP 모드**로 진행(L4 는 IP 와 포트 수준으로만 분배하고, L7 은 HTTP 요청의 URI 같은 내용까지 보고 분배할 수 있다는 점이 다르다). **세 가지 실습 모두 `haproxy.cfg` 설정 파일의 내용만 바꾸면 동일하게 구현**된다: ① 기본 mode http 방식 - IP 로 접근하면 echo 컨테이너 3개가 순서대로 응답(라운드 로빈) ② URI 방식 1 - IP 주소 뒤에 /echo-web1, /echo-web2, /echo-web3 처럼 경로(리소스 식별자)를 붙이면 해당 컨테이너가 응답 ③ URI 방식 2 - /item, /basket 경로 뒤에 컨테이너를 2대씩 묶어 두고 그룹 안에서 내부 로드 밸런싱.
- **proxy-net 전용 네트워크**: 먼저 HAProxy 와 백엔드 컨테이너가 함께 쓸 `proxy-net` 브리지 네트워크를 만든다. **사용자 정의 네트워크에서는 컨테이너 이름으로 서로를 찾을 수 있어서 설정 파일에 IP 대신 컨테이너 이름(echo-web1 등)을 적을 수 있다.** `route` 명령으로 호스트 라우팅 테이블을 보면 이 네트워크의 대역과 `br-` 로 시작하는 브리지 인터페이스가 생긴 것을 확인할 수 있다(슬라이드 예시는 172.21.0.0/16, br-42660fd744bd. 강사의 실습 환경에서는 172.19.0.0 대역이 잡혔다고 언급).
- **echo 컨테이너 3개**: 뒤에서 요청을 받을 서버는 강사가 메시지만 출력하도록 만든 이미지 `dbgurum/haproxy:echo`. 요청을 받으면 "Request served by (컨테이너 호스트명)" 과 받은 HTTP 요청 정보를 돌려준다. `-h` 옵션으로 호스트명을 컨테이너 이름과 똑같이 지정해서 응답만 봐도 어느 컨테이너가 처리했는지 알 수 있게 한다. 이 이미지는 **8080 포트**에서 서비스한다(docker ps 의 8080/tcp).
- **haproxy.cfg 작성(기본 mode http)**: 설정 파일 이름은 HAProxy 의 기본값인 **haproxy.cfg**. 강사는 홈 작업 디렉터리(~/fastcampus/ch06)에 `conf` 폴더를 만들고 그 안에서 vi 로 미리 준비한 설정 내용을 붙여 넣는다(이 설정 값은 HAProxy 사이트에서도 구할 수 있어서 나중에는 일반적인 형태만 수정한다고 함). 폴더를 따로 만드는 이유는 곧 **볼륨(-v)으로 폴더째 컨테이너 안에 넣어 주기 때문**(볼륨은 아직 배우지 않았지만 "현재 경로의 내용을 컨테이너 안에 넣어 주는 기능"으로 이해). 블록별 의미(강사 설명): `global` = 기본값 그대로 사용하는 전역 설정(통계용 소켓, 로그 출력 등) / `defaults`·`mode http` = 기본 모드. **mode http 는 7레벨(L7), mode tcp 는 4레벨(L4)**. 클라이언트/연결/서버 대기시간(timeout)도 여기서 설정 / `frontend stats`·`bind *:8404` = HAProxy 자체적으로 트래픽 통계(stats)를 수집, 그 통계 페이지를 **8404 포트**로 열어 둠. `stats refresh 10s` = 10초마다 갱신 / `frontend myfrontend`·`bind :80` = 80번으로 들어오는 트래픽을 받는 입구. `default_backend webservers` = 별도 규칙이 없으면 webservers 로 전달(Nginx 의 proxy_pass / upstream 과 비슷한 개념) / `backend webservers` = 실제로 요청을 처리할 서버 목록. `s1`, `s2`, `s3` 는 별칭(alias)이고 그 뒤가 컨테이너 이름:포트. 컨테이너 내부 포트 8080 으로 보내므로 8080 을 `-p` 로 퍼블리시할 필요가 없다. `check` 는 서버 상태 점검(보충 설명).
- **HAProxy 컨테이너 실행 옵션**: `-d` 백그라운드 / `--name=haproxy-container` 컨테이너 이름 / `--net=proxy-net` echo 컨테이너와 같은 네트워크에 연결(그래야 컨테이너 이름으로 통신) / `-p 80:80` **프런트(서비스) 포트**, 호스트에 이미 80번을 쓰는 컨테이너나 프로그램이 있으면 충돌하니 주의하라고 강사가 강조 / `-p 8404:8404` 통계(stats)를 보는 전용 포트 / `-v $(pwd):/usr/local/etc/haproxy:ro` 현재 경로(conf 폴더, haproxy.cfg 포함)를 컨테이너의 `/usr/local/etc/haproxy` 에 **읽기 전용(ro)** 으로 넣음 / `haproxytech/haproxy-alpine:2.5` Docker Hub 에 올린 HAProxy 2.5 버전 이미지. `docker ps` 로 echo 컨테이너 3개와 haproxy-container 가 모두 올라왔고 포트 80 과 8404 가 열려 있는 것을 확인(`docker port haproxy-container`). `curl localhost:80` 을 반복하면 응답이 **echo-web1 -> echo-web2 -> echo-web3** 순서로 돌아간다 = **라운드 로빈**(서버를 차례대로 돌아가며 배정하는 방식). 브라우저로 호스트 IP(예: 192.168.56.101)에 접속해도 같은 식으로 web1, web2, web3 가 번갈아 나온다. 이 단계는 HAProxy 가 가진 **기본 구성 + http 모드만 사용**한 상태이고 다음 단계에서 URI 규칙을 추가해 더 고급 형태로 바꾼다.
- **8404 통계 페이지**: 브라우저에서 `호스트IP:8404` 로 접속하면 HAProxy 의 통계 보고서(HAProxy 2.4~2.6 Statistics Report)가 나온다. 설정 파일의 프런트엔드 `stats`, `myfrontend`, 그리고 백엔드 `webservers` 의 서버 `s1`, `s2`, `s3`(앞서 정한 별칭)를 각각 볼 수 있고 세션, 받은/주고받은 바이트, 에러, 서버 상태(UP, LastChk 등)까지 확인된다. `stats refresh 10s` 가 있어 10초 단위로 갱신되므로 80번으로 여러 번 요청을 보낸 뒤 10초쯤 지나면 백엔드 쪽 세션·트래픽 수치가 변한 것을 볼 수 있다.
- **URI 방식 1(경로별로 컨테이너 지정)**: 설정 파일에서 앞부분(global, defaults, frontend stats)은 동일하고 **frontend myfrontend 아래쪽만 달라진다**. 이전에는 bind 와 default_backend 뿐이었지만 이번에는 **acl**(접근 제어 규칙)과 **use_backend**(그 규칙에 맞으면 어느 backend 로 보낼지)를 추가한다. acl 이름은 사용자가 마음대로 정할 수 있는 "일종의 룰". **`path_beg /echo-web1` 은 요청 경로(URI)가 /echo-web1 로 시작하는지 검사하는 조건**이고, 조건에 맞으면 `use_backend` 가 해당 backend(echo-web1_backend)로 요청을 전달한다. 이전에는 URI 없이 접속만 해도 1,2,3 이 돌아갔지만(default_backend webservers, 라운드 로빈), 이제는 주소 뒤에 `/echo-web1`, `/echo-web2`, `/echo-web3` 를 붙이면 해당 컨테이너로만 간다. **각 backend 에는 서버가 1대씩이므로 이것은 로드 밸런싱이 아니라 "특정 컨테이너로 계속 전달"하는 방식**. URI 를 지정하지 않으면 기본(webservers)대로 1, 2, 3 이 돌아간다. (이 부분의 URI 호출 화면은 영상에서 별도로 보이지 않고, 강사의 구두 설명으로 확인.)
- **설정 적용 방법(컨테이너 재생성)**: 강사는 Nginx 때처럼 설정 파일을 컨테이너 안에 복사하는 방법도 있지만, 이번에는 **컨테이너를 내렸다가 새로 올리는 방식**을 택했다. 설정 폴더를 마운트하고 있으므로 새 컨테이너가 바뀐 haproxy.cfg 를 읽는다: `vi haproxy.cfg` -> `docker stop haproxy-container` -> `docker rm haproxy-container` -> `docker run ...`(동일 명령) -> `docker ps`, `docker port haproxy-container` 로 확인. 이후 `curl localhost:80`(기본 경로)으로 이전처럼 1,2,3 이 돌아가고, `/echo-web1` 등 URI 를 붙이면 해당 컨테이너로만 전달.
- **URI 방식 2(/item, /basket 그룹별 로드 밸런싱)**: 앞의 방식을 업그레이드한 형태. 주소 뒤에 `/item`, `/basket` 을 붙이고, 각 경로마다 **컨테이너 2대씩**을 배치한다. 그러면 /item 으로 계속 접속하면 1번, 2번 컨테이너에서 번갈아(1-2-1-2), /basket 으로 접속하면 3번, 4번 컨테이너에서 번갈아(3-4-3-4) 로드 밸런싱이 된다(슬라이드 그림의 "web1, web2 / web1, web2" 는 그룹 안의 두 컨테이너). 이 설정에서는 acl 4개(echo-web1-item / echo-web2-item 은 `path_beg /item`, echo-web3-basket / echo-web4-basket 은 `path_beg /basket`)와 use_backend 4줄(item 계열은 echo-web1_backend, basket 계열은 echo-web2_backend)을 쓴다. **/item 으로 들어오면 echo-web1_backend(1번-2번 컨테이너), /basket 으로 들어오면 echo-web2_backend(3번-4번 컨테이너)로 보낸다. 방식 1처럼 backend 를 컨테이너마다 따로 두지 않고 한 backend 안에 서버 2대씩 그룹으로 묶어 두는 것이 핵심**이며 그래서 그룹 안에서 라운드 로빈이 일어난다. 아무 경로 없이(/) 접속하면 default_backend 인 webservers 의 서버 전체(1,2,3,4)로 돈다. **주의: 슬라이드의 webservers 블록에서 s4 줄은 `echo-web3-basket:8080` 으로 적혀 있는데(슬라이드 원문), 실제 컨테이너 이름은 `echo-web4-basket` 이므로 직접 따라 할 때는 컨테이너 이름과 맞는지 확인하라.**
- **컨테이너 4대 + HAProxy 재구성**: 기존 컨테이너를 버리고 새로 4대를 띄운다(echo-web1-item, echo-web2-item, echo-web3-basket, echo-web4-basket). 설정 파일의 `server` 뒤 주소는 컨테이너의 **호스트명**으로 잡혀 있으므로 컨테이너 이름과 호스트명(-h)을 똑같이 하고 그 이름을 설정 파일에 그대로 적어 주면 된다. 슬라이드 명령대로 HAProxy 컨테이너를 stop -> rm 한 뒤 다시 run. 결과 확인: `curl localhost:80`(경로 없음)은 item 컨테이너 2개와 basket 컨테이너 2개가 돌아가며 응답(default_backend), `curl localhost:80/item` -> echo-web1-item, echo-web2-item 이 번갈아(1번, 2번, 1번, 2번), `curl localhost:80/basket` -> echo-web3-basket, echo-web4-basket 이 번갈아(3번, 4번, 3번, 4번). 이 방식으로 원하는 HAProxy 기법을 구성해 보라고 하면서, 컨테이너를 새로 등록하더라도 **server 줄의 호스트명(컨테이너 이름)만 정확히 맞춰 주면 라운드 로빈이 잘 구현되는 것**을 확인할 수 있다고 정리. 이 클립으로 **6장 컨테이너 서비스를 위한 docker network 관리**가 끝난다.

### [사용한 CLI]

**1) 네트워크와 echo 서버 3대**
```bash
docker network create proxy-net
docker network ls
route                                   # 172.21.0.0/16 -> br-42660fd744bd

docker run -d --name=echo-web1 --net=proxy-net -h echo-web1 dbgurum/haproxy:echo
docker run -d --name=echo-web2 --net=proxy-net -h echo-web2 dbgurum/haproxy:echo
docker run -d --name=echo-web3 --net=proxy-net -h echo-web3 dbgurum/haproxy:echo
docker ps -a | grep echo                # 내부 포트 8080/tcp
```
- 이 이미지는 "Request served by <hostname>" 및 요청 헤더를 응답. `-h` 로 hostname 을 달리 줘서 어느 서버가 응답했는지 구분.

**2) haproxy.cfg 작성 (기본: mode http, round-robin)**
```bash
cd fastcampus/ch06
mkdir conf && cd $_
vi haproxy.cfg
```
```haproxy
global
   stats socket /var/run/api.sock user haproxy group haproxy mode 660 level admin expose-fd listeners
   log stdout format raw local0 info

defaults
   mode http
   timeout client 10s
   timeout connect 5s
   timeout server 10s
   timeout http-request 10s
   log global

frontend stats
   bind *:8404
   stats enable
   stats uri /
   stats refresh 10s

frontend myfrontend
   bind :80
   default_backend webservers

backend webservers
   server s1 echo-web1:8080 check
   server s2 echo-web2:8080 check
   server s3 echo-web3:8080 check
```
| 항목 | 설명 |
|---|---|
| `global` | HAProxy 전역 설정(stats socket, log) |
| `defaults` / `mode http` | 공통 기본값. http=L7, tcp=L4. timeout 값들(client/connect/server/http-request) |
| `frontend stats` | `bind *:8404`, `stats enable`, `stats uri /`, `stats refresh 10s` 로 통계 페이지 제공 |
| `frontend myfrontend` | `bind :80` 으로 80 포트 수신, `default_backend webservers` |
| `backend webservers` | 서버 그룹. `server s1 echo-web1:8080 check` (이름 s1, 대상 컨테이너:포트, 헬스체크) |

**3) HAProxy 컨테이너 실행**
```bash
docker run -d --name=haproxy-container --net=proxy-net \
  -p 80:80 -p 8404:8404 \
  -v $(pwd):/usr/local/etc/haproxy:ro \
  haproxytech/haproxy-alpine:2.5
docker ps
docker port haproxy-container           # 80/tcp, 8404/tcp
curl localhost:80
#   Request served by echo-web1
#   GET / HTTP/1.1
#   Host: localhost ...
# 반복 호출 시 echo-web1 -> echo-web2 -> echo-web3 순환
# 브라우저: http://192.168.56.101:8404  (HAProxy Statistics Report)
```
| 옵션 | 설명 |
|---|---|
| `-d` / `--name=haproxy-container` | 백그라운드 실행 / 컨테이너 이름 |
| `--net=proxy-net` | echo 서버와 같은 네트워크(이름 해석 가능) |
| `-p 80:80` | 서비스(부하분산) 포트 |
| `-p 8404:8404` | 통계 페이지 포트 |
| `-v $(pwd):/usr/local/etc/haproxy:ro` | conf 디렉터리(haproxy.cfg)를 설정 경로에 읽기 전용(ro) 마운트 |
| `haproxytech/haproxy-alpine:2.5` | HAProxy 2.5 이미지 |

**4) URI 기반 라우팅 1: 경로별 서버 지정 (/echo-web1, /echo-web2, /echo-web3)**
```haproxy
frontend myfrontend
   bind :80
   default_backend webservers

   acl echo-web1 path_beg /echo-web1
   acl echo-web2 path_beg /echo-web2
   acl echo-web3 path_beg /echo-web3

   use_backend echo-web1_backend if echo-web1
   use_backend echo-web2_backend if echo-web2
   use_backend echo-web3_backend if echo-web3

backend webservers
   balance roundrobin
   server s1 echo-web1:8080 check
   server s2 echo-web2:8080 check
   server s3 echo-web3:8080 check

backend echo-web1_backend
   server s1 echo-web1:8080 check

backend echo-web2_backend
   server s2 echo-web2:8080 check

backend echo-web3_backend
   server s3 echo-web3:8080 check
```
```bash
# 설정 변경 반영: 컨테이너 중지/삭제 후 재생성 (conf 디렉터리에서 실행)
vi haproxy.cfg
docker stop haproxy-container
docker rm haproxy-container
docker run -d --name=haproxy-container --net=proxy-net -p 80:80 -p 8404:8404 -v $(pwd):/usr/local/etc/haproxy:ro haproxytech/haproxy-alpine:2.5
docker ps
docker port haproxy-container
curl localhost:80              # 기본: webservers 로 1,2,3 순환
curl localhost:80/echo-web1    # URI 가 /echo-web1 로 시작 -> echo-web1 고정 (path_beg)
```

**5) URI 기반 라우팅 2: /item, /basket 그룹 분산 (서버 4대)**
```bash
docker run -d --name=echo-web1-item   --net=proxy-net -h echo-web1-item   dbgurum/haproxy:echo
docker run -d --name=echo-web2-item   --net=proxy-net -h echo-web2-item   dbgurum/haproxy:echo
docker run -d --name=echo-web3-basket --net=proxy-net -h echo-web3-basket dbgurum/haproxy:echo
docker run -d --name=echo-web4-basket --net=proxy-net -h echo-web4-basket dbgurum/haproxy:echo
```
```haproxy
frontend myfrontend
   bind :80
   default_backend webservers

   acl echo-web1-item   path_beg /item
   acl echo-web2-item   path_beg /item
   acl echo-web3-basket path_beg /basket
   acl echo-web4-basket path_beg /basket

   use_backend echo-web1_backend if echo-web1-item
   use_backend echo-web1_backend if echo-web2-item
   use_backend echo-web2_backend if echo-web3-basket
   use_backend echo-web2_backend if echo-web4-basket

backend webservers                        # 기본(그 외 경로)
   balance roundrobin
   server s1 echo-web1-item:8080 check
   server s2 echo-web2-item:8080 check
   server s3 echo-web3-basket:8080 check
   server s4 echo-web4-basket:8080 check

backend echo-web1_backend                  # /item 그룹
   server s1 echo-web1-item:8080 check
   server s2 echo-web2-item:8080 check

backend echo-web2_backend                  # /basket 그룹
   server s3 echo-web3-basket:8080 check
   server s4 echo-web4-basket:8080 check
```
```bash
# haproxy-container 를 stop -> rm -> run 으로 재생성 후 확인
docker stop haproxy-container && docker rm haproxy-container
docker run -d --name=haproxy-container --net=proxy-net -p 80:80 -p 8404:8404 -v $(pwd):/usr/local/etc/haproxy:ro haproxytech/haproxy-alpine:2.5
curl localhost:80          # 기본 backend: 4대 순환
curl localhost:80/item     # echo-web1-item <-> echo-web2-item 번갈아
curl localhost:80/basket   # echo-web3-basket <-> echo-web4-basket 번갈아
```

### [확인 방법/주의점]
- `docker ps` 에서 echo 서버와 haproxy-container 가 Up 이고 `docker port haproxy-container` 에 80 / 8404 가 보이는지 확인. `curl localhost:80` 반복 시 `Request served by echo-webN` 이 순환.
- 8404 통계 페이지에서 서버 상태(UP)와 세션 변화를 확인(10초마다 새로고침).
- haproxy.cfg 를 수정했으면 컨테이너를 `stop -> rm -> run` 으로 다시 띄운다(자료 방식). 이때 conf 디렉터리 안에서 `$(pwd)` 를 사용해야 마운트 경로가 올바르다.
- backend 에서 `server` 로 지정하는 컨테이너 이름이 존재하고 같은 네트워크에 있어야 한다(없는 이름은 해석 실패). 자료의 URI 2 예제에서 `echo-web4-basket` 처럼 서버 이름을 정확히 일치시킬 것(자료 예제는 일부 서버명이 혼용되어 있음).
- `mode http`(L7)에서 URI 라우팅이 가능, IP/Port 만 볼 때는 `mode tcp`(L4).

---

## 부록: 본 파트 명령어 빠른 참조

| 분류 | 명령 |
|---|---|
| 이미지 | `docker pull`, `docker images`, `docker image inspect [--format]`, `docker image history [--no-trunc]`, `docker image tag`, `docker push`, `docker image save/load`, `docker image rm` / `docker rmi`, `docker build -t [-f]` |
| 인증 | `docker login`, `docker logout`, `cat .access_token \| docker login --username U --password-stdin`, `docker info \| grep Username` |
| Registry | `docker run -d -v ... -p 5000:5000 --restart=always --name=local-registry registry`, `curl -X GET http://IP:5000/v2/_catalog`, `.../v2/<이름>/tags/list`, `/etc/docker/daemon.json` (insecure-registries), `systemctl restart docker.service` |
| 컨테이너 lifecycle | `docker create`, `start`, `stop`, `pause`, `unpause`, `restart`, `kill`, `rm`, `run`, `attach`, `exec [-d] [-it]` |
| 조회/모니터링 | `docker ps [-a]`, `top`, `port`, `stats [--no-stream]`, `logs [-f]`, `inspect`, `events`, `diff`, `lsns`, cAdvisor |
| 파일/이미지화 | `docker cp`, `commit`, `export`, `import [--change]` |
| 로그 관리 | `truncate -s 0 <json.log>`, `daemon.json` log-driver/log-opts, `--log-driver --log-opt` |
| 네트워크 | `docker network create/ls/inspect/connect/disconnect/rm`, `--net`, `--net-alias`, `--subnet/--ip-range/--gateway`, `--ip`, `--dns`, `--add-host`, `--mac-address`, `--expose`, `-p/-P`, `brctl show`, `ip addr`, `route`, `ip route`, `iptables -t nat -L -n`, `nslookup`, `dig` |
| Proxy | Nginx `upstream` / `proxy_pass` / `weight`, HAProxy `frontend` / `backend` / `acl path_beg` / `use_backend` / `mode http\|tcp` |
