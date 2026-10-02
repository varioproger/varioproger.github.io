---
title: "11장. 이미지·레이어·overlayfs"
parent: "2부. 컨테이너 커널 기능과 Docker"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 11
---

# 11장. 이미지·레이어·overlayfs

> **🎮 게임 서버 개발자에게** — 게임 서버 빌드 산출물은 보통 "바이너리 + 설정 + 에셋"이고 배포할 때마다 거의 같다. 컨테이너 이미지는 이 점을 이용해 **변경분(diff)만 겹겹이 쌓은** 구조로 만들어진다. `fork()` 뒤에 부모와 자식이 페이지를 공유하다가 쓸 때만 복사하는 copy-on-write를 알고 있다면, overlayfs의 동작은 파일 단위의 같은 아이디어다. 이 장은 `/var/lib/docker/overlay2/` 아래에서 "컨테이너의 쓰기 레이어"가 실제로는 평범한 디렉터리라는 사실을 확인하고, 이미지 pull 때 `Already exists`가 뜨는 이유(콘텐츠 주소화)와 Docker Engine v29에서 저장소 기본값이 바뀐 사실을 다룬다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 같은 베이스 이미지를 쓰는 서버 이미지 열 개를 받아도 디스크가 열 배가 되지 않는 이유를 설명해야 한다.
> - 컨테이너 안에서 파일을 지웠는데 이미지 크기가 줄지 않고, 컨테이너를 지우면 쓴 데이터가 사라진다.
> - Docker Engine을 v29로 올렸더니 `--storage-opt size=`가 안 걸리고 디스크 사용량이 늘었다.

## 코어 — 이것만은 100%

> **한 문장:** 이미지는 순서가 있는 읽기 전용 레이어(변경분)의 집합이고, overlayfs가 lowerdir(이미지) + upperdir(컨테이너 쓰기 레이어)를 merged 뷰로 합쳐 보여 주며(쓰기는 copy-on-write), 모든 블롭은 내용의 해시(다이제스트)로 식별되어 디스크에 한 벌만 공유된다.

1. **레이어 = 변경분(diff)의 스택** — Dockerfile 명령마다 직전 상태와의 차이만 레이어가 된다. 같은 베이스 레이어는 디스크에 한 벌이고, 컨테이너의 변경은 쓰기 가능한 별도 레이어에만 기록돼 원본 이미지는 절대 수정되지 않는다.
2. **overlayfs 4디렉터리와 CoW** — lowerdir(읽기 전용, 콜론으로 여러 개) / upperdir(쓰기 가능 1개) / merged(통합 뷰) / workdir(내부 작업용). 수정은 upperdir로 복사 후 수정(CoW), 삭제는 upperdir에 whiteout 표시.
3. **저장소 두 모델과 v29 기본값 전환** — 레거시 graphdriver는 `/var/lib/docker/overlay2/`, containerd 스냅샷터는 `/var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/`. Docker Engine v29부터 신규 설치의 기본값은 containerd 이미지 스토어이고 기존 설치는 자동 마이그레이션되지 않는다.
4. **콘텐츠 주소화와 참조 계수 GC** — 블롭은 `sha256:...` 다이제스트로 식별되고, 같은 내용은 한 벌만 저장된다. 삭제는 참조 계수로 판단되어 `prune` 때 즉시 지워지는 것과 아닌 것이 갈린다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `fork()` 후 자식이 쓸 때만 페이지를 복사(copy-on-write) | overlayfs의 copy-on-write | 읽는 동안은 공유, 수정할 때만 복사본을 만든다 | 단위가 **페이지가 아니라 파일**이다. 큰 파일의 한 바이트만 수정해도 upperdir로 그 파일을 먼저 복사한다 |
| 빌드 시스템의 증분 빌드(바뀐 오브젝트만 재컴파일) | 이미지 레이어 캐시 | 이전 결과를 재사용하고 변경분만 새로 만든다 | 레이어는 파일시스템 변경분(diff)을 순서대로 쌓은 것이다. 순서가 중요해서 앞 레이어가 바뀌면 뒤 레이어를 재사용할 수 없다 |
| git이 객체를 SHA 해시로 저장 | 콘텐츠 주소화 저장소 | 이름이 아니라 내용의 해시로 식별한다 | 이미지 태그(`latest`)는 이름표일 뿐이고 실체는 다이제스트다. 이름이 다르거나 이미지가 달라도 레이어 내용이 같으면 한 벌만 저장된다 |
| 공유 라이브러리(`.so`)를 여러 프로세스가 공유 | 베이스 레이어 공유 | 같은 내용을 한 번만 보관해서 여럿이 쓴다 | 프로세스 메모리가 아니라 **디스크 상**의 공유이고, 지울 때는 참조하는 이미지·컨테이너·스냅샷이 모두 사라져야 블롭이 지워진다 |
| 서버가 쓰는 임시 파일/로그 디렉터리 | 컨테이너 쓰기 레이어(upperdir) | 서버가 쓴 파일이 쌓이는 곳이다 | 컨테이너를 지우면 쓰기 레이어도 **같이 사라진다**. 남겨야 하는 데이터는 볼륨/바인드 마운트로 빼야 한다([14장](14-볼륨-바인드마운트-tmpfs.md)) |
| 파일 삭제는 `unlink()`로 실제 제거 | whiteout | 삭제된 것처럼 보이게 한다 | lowerdir의 파일은 지워지지 않고 upperdir에 "지워졌다" 표시만 남는다. 레이어에 있던 파일을 지워도 이미지 용량은 줄지 않는다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 컨테이너를 지워도 이미지가 멀쩡하고, 같은 이미지로 컨테이너를 여러 개 띄워도 서로 간섭하지 않는 이유는?
> 2. 이미지 레이어에 있던 파일을 컨테이너 안에서 지우면 실제로 무슨 일이 일어날까?
> 3. 이미지를 받을 때 `Already exists`가 찍히는 레이어는 어떻게 이미 있다는 것을 알까?
> 4. Docker Engine이 쓰는 이미지 저장소가 `overlay2`인지 containerd 이미지 스토어인지 어떻게 알 수 있을까?
>
> **처리법:** 🛠 실습 `docker inspect --format '{{json .GraphDriver}}' <ctr>`, `mount | grep overlay`, `docker system df -v`, `sudo ctr -n moby snapshots tree` → 바로 실행 · 🗺 관계도 lowerdir ... lowerdir + upperdir → merged, 이미지 ↔ 매니페스트 ↔ 블롭(다이제스트) · 📦 카드로 overlayfs 4디렉터리 표, 저장소 경로 2개, graphdriver 계보(aufs, devicemapper, btrfs/zfs, overlay2)

### 이 장에서 배우는 것

- 이미지 레이어가 무엇이고 왜 쌓는 구조인지
- overlayfs의 lowerdir/upperdir/merged/workdir와 copy-on-write, whiteout
- 실제 디스크에서 레이어 구조를 확인하는 방법과 `overlay2/l/` 심볼릭 링크의 이유
- 레거시 graphdriver와 containerd 스냅샷터의 차이, v29 기본값 전환의 실무 영향
- 콘텐츠 주소화 저장소와 참조 계수 기반 가비지 컬렉션

---

## 코어 1. 레이어 = 변경분의 스택

### 1.1 레이어와 유니온 파일시스템

**한 줄 요약:** 이미지는 하나의 거대한 스냅샷이 아니라 순서가 있는 변경분(diff)의 여러 겹이다.

컨테이너 이미지는 순서가 있는 여러 겹의 변경분(diff)으로 이루어져 있다. `FROM ubuntu`로 시작해 `RUN apt-get install`, `COPY app /app` 같은 Dockerfile 명령을 거칠 때마다 **직전 상태와 비교한 변경 사항만** 새 레이어로 기록된다. 이 레이어들을 쌓아 하나의 통합 뷰로 보여 주는 기술이 **유니온 파일시스템**이고, 리눅스에서는 `overlayfs`가 사실상 표준이다.

### 1.2 쌓는 구조의 이점 두 가지

**한 줄 요약:** 베이스 레이어를 물리적으로 공유하고, 컨테이너의 쓰기는 별도 레이어에만 기록된다.

1. 같은 베이스 이미지를 쓰는 여러 이미지/컨테이너가 베이스 레이어를 디스크에서 **물리적으로 공유**한다. `ubuntu:24.04` 기반 이미지 열 개를 받아도 베이스 레이어는 디스크에 한 벌이다.
2. 컨테이너가 실행 중 파일을 바꿔도 그 변경은 **별도의 쓰기 가능 레이어**에만 기록되고 원본 이미지 레이어는 수정되지 않는다. 컨테이너를 지워도 이미지가 멀쩡한 이유, 같은 이미지로 컨테이너를 여러 개 띄워도 간섭이 없는 이유다.

이미지의 표준 구조(매니페스트, config, 레이어 tar)는 [12장](12-OCI-표준과-런타임.md)에서 다룬다.

## 코어 2. overlayfs의 네 디렉터리와 CoW

### 2.1 네 역할

**한 줄 요약:** lowerdir은 읽기 전용 여러 겹, upperdir은 쓰기 가능 한 겹, merged가 컨테이너가 보는 `/`다.

overlayfs 마운트는 네 가지 역할의 디렉터리로 구성된다.

| 디렉터리 | 역할 |
|---|---|
| **lowerdir** | 읽기 전용 레이어. 이미지 레이어가 해당하며 콜론(`:`)으로 여러 개를 나열해 쌓는다. overlay2 드라이버는 커널 버전에 따라 다르지만 일반적으로 최대 128개 안팎의 lowerdir을 지원한다 |
| **upperdir** | 쓰기 가능한 **단일** 레이어. 컨테이너가 만드는 모든 변경(생성, 수정, 삭제)이 여기 기록된다 |
| **merged** | 컨테이너 프로세스가 `/`로 보는, lowerdir과 upperdir을 합친 통합 뷰 |
| **workdir** | overlayfs가 파일 교체 같은 내부 연산을 원자적으로 처리하는 작업용 디렉터리. 사용자가 직접 다룰 일은 없다 |

merged를 컨테이너의 `/`로 만드는 데 [9장](09-네임스페이스.md)의 마운트 네임스페이스와 `pivot_root`가 쓰인다.

### 2.2 copy-on-write와 whiteout

**한 줄 요약:** 수정은 upperdir로 복사 후 수정, 삭제는 upperdir에 whiteout 표시.

- **수정**: 이미지 레이어에 있던 파일을 컨테이너 안에서 수정하면 overlayfs는 그 파일을 upperdir로 먼저 **복사**한 뒤 복사본을 수정한다(copy-on-write). 원본 lowerdir 파일은 손대지 않으므로 같은 lowerdir을 공유하는 다른 컨테이너에 영향이 없다.
- **삭제**: lowerdir의 파일이 실제로 지워지는 것이 아니라 upperdir에 "이 파일은 지워졌다"는 표시(**whiteout**)를 남긴다.

### 2.3 실제 디스크에서 확인하기

**한 줄 요약:** `GraphDriver` 정보와 `mount` 출력에 네 경로가 그대로 나온다.

레거시 overlay2 그래프 드라이버를 쓰는 경우 구조는 `/var/lib/docker/overlay2/` 아래에 그대로 나타난다.

```bash
docker inspect --format '{{json .GraphDriver}}' <container> | python3 -m json.tool
# LowerDir, UpperDir, MergedDir, WorkDir 네 경로가 표시됨

mount | grep overlay | grep <컨테이너ID의 앞부분>
```

```text
overlay on /var/lib/docker/overlay2/<id>/merged type overlay (rw,relatime,
lowerdir=/var/lib/docker/overlay2/l/XXXX:/var/lib/docker/overlay2/l/YYYY,
upperdir=/var/lib/docker/overlay2/<id>/diff,
workdir=/var/lib/docker/overlay2/<id>/work)
```

`lowerdir`에 나열된 경로가 실제 레이어 디렉터리가 아니라 `overlay2/l/` 아래의 **짧은 심볼릭 링크**라는 점이 눈에 띈다. overlayfs 마운트 시 `lowerdir` 옵션 문자열 길이에 커널 한계가 있어, 레이어가 많아져 전체 경로를 나열하면 제한에 걸릴 수 있다. Docker는 이를 피하려고 각 레이어 디렉터리에 대응하는 짧은 이름의 심볼릭 링크를 `overlay2/l/`에 만들어 마운트에 쓴다.

컨테이너 안에서 파일을 하나 만들고 호스트에서 바로 확인하면 "쓰기 레이어"가 호스트 디스크의 평범한 디렉터리임이 분명해진다.

```bash
docker run -d --name overlay-demo nginx:alpine
docker exec overlay-demo sh -c 'echo hello > /tmp/marker.txt'
sudo cat /var/lib/docker/overlay2/$(docker inspect --format '{{.Id}}' overlay-demo)/diff/tmp/marker.txt
docker rm -f overlay-demo
```

## 코어 3. 저장소 두 모델과 v29 전환

### 3.1 containerd 스냅샷터의 경로 구조

**한 줄 요약:** 개념은 같고 관리 주체와 디렉터리가 다르다. 스냅샷은 숫자 ID로 식별하고 부모-자식 관계는 메타데이터 DB에 있다.

containerd가 자체적으로 이미지를 관리하는 경로에서는 스냅샷 데이터가 `/var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/` 아래 저장된다.

- lowerdir/upperdir/merged/workdir 개념은 동일하지만, 관리 단위는 Docker의 그래프 드라이버가 아니라 containerd의 Snapshots 서비스이고 각 스냅샷은 **숫자 스냅샷 ID**로 식별된다.
- `snapshots/<ID>/` 아래에 `fs/`(overlay2의 `diff/`에 해당하는 실제 내용)와 `work/`가 생긴다.
- 어느 스냅샷이 어느 스냅샷 위에 쌓였는지는 containerd의 bolt 기반 메타 스토어에 부모-자식 관계로 기록되고 `ctr snapshots`로 조회한다.

```bash
sudo ls /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/
sudo ctr -n moby snapshots list
sudo ctr -n moby snapshots tree    # 레이어 공유 구조를 트리로 확인
```

### 3.2 레거시 graphdriver의 계보

**한 줄 요약:** aufs, devicemapper, btrfs/zfs는 레거시이고, overlay2가 사실상 기본이 되었다.

Docker Engine은 오랫동안 dockerd가 직접 관리하는 **graphdriver** 추상화로 이미지 저장소를 관리해 왔고, 이는 containerd가 이미지 저장까지 담당하기 이전부터 존재하던 유산이다.

- **aufs**: 초창기 기본 드라이버. 메인라인 커널에 포함되지 않아 배포판마다 패치가 필요했고, 이 부담이 overlayfs로 옮겨간 배경 중 하나다.
- **devicemapper**: 블록 장치 기반 씬 프로비저닝으로 레이어를 관리. 블록 단위로 동작하지만 설정이 까다롭고 컨테이너 밀도가 높아질수록 성능 저하가 두드러졌다.
- **btrfs / zfs**: 해당 파일시스템의 스냅샷·클론 기능을 쓰는 드라이버. 이미 그 파일시스템을 운영 중인 환경에서 선택됐지만 범용성이 낮았다.
- **overlay2**: 리눅스 커널 4.x부터 다중 lowerdir을 지원하는 overlayfs가 메인라인에 안정적으로 포함되면서, 특수 패치나 파일시스템 없이 쓸 수 있는 사실상 기본값이 됐다.

새로 구축하는 환경에서 aufs, devicemapper, btrfs, zfs 드라이버를 의도적으로 선택할 이유는 거의 없다.

### 3.3 Docker Engine v29: 기본값이 뒤집혔다

**한 줄 요약:** v29부터 신규 설치는 containerd 이미지 스토어가 기본이고, 기존 설치는 자동 전환되지 않는다.

containerd는 처음부터 **스냅샷터(snapshotter)**라는 자체 추상화를 이미지 저장의 기본 모델로 썼다. graphdriver와 snapshotter는 비슷한 문제(레이어를 쌓아 루트 파일시스템 만들기)를 풀지만 설계가 다른 별개의 코드 경로다. Docker Engine은 오랫동안 둘을 모두 유지하면서 기본은 graphdriver, containerd 이미지 스토어는 선택 기능으로 제공해 왔다.

- **Docker Engine v29부터** 신규 설치의 기본은 containerd 이미지 스토어이고, 레거시 그래프 드라이버는 유지보수 모드로 들어가 향후 제거가 예고되었다.
- 이미 운영 중인 기존 설치는 업그레이드 시 **자동 마이그레이션되지 않으며**, 관리자가 명시적으로 전환하지 않는 한 레거시 경로를 계속 쓴다.

```bash
docker info --format '{{.DriverStatus}}'
docker info | grep -A2 'Storage Driver'
```

containerd 이미지 스토어를 쓰면 `docker info` 출력 형태와 `docker inspect`의 `GraphDriver` 항목 형식도 이전과 달라진다.

### 3.4 전환에 따른 실무 영향

**한 줄 요약:** 용량 제한 옵션 무력화, 디스크 사용 증가, userns-remap 호환성 세 가지를 검증한다.

- **`--storage-opt size=` 같은 레거시 옵션이 조용히 무시될 수 있다.** 레거시 overlay2는 컨테이너별 쓰기 레이어 크기를 제한하는 이 옵션을 지원했지만, containerd 이미지 스토어 경로는 옵션을 받아주면서도 실제로 용량 제한을 강제하지 않는 사례가 보고되어 있다(프로젝트 쿼터 지원 검증 로직이 다르기 때문). 용량 제한을 운영 정책으로 썼다면 전환 후 한도가 실제로 걸리는지 재검증한다.
- **디스크 사용량이 늘 수 있다.** containerd 스냅샷터 경로는 레이어를 압축된 형태와 압축이 풀린 형태로 함께 보관하는 경우가 있어 사용량이 늘어난 사례가 보고된다. 스토리지가 빠듯하면 용량 계획에 반영한다.
- **`userns-remap`과의 조합이 아직 완전하지 않을 수 있다.** 보안 강화를 위해 쓰고 있다면 전환 전에 호환 여부를 확인한다.

실무 접근은 "신규 설치는 기본값을 받아들이고, 기존 운영 환경은 위 항목을 검증한 뒤 계획적으로 전환"이다. 어떤 방식인지 모호하면 `docker info`의 드라이버 이름이 출발점이다. 이 책의 경로 설명은 레거시 overlay2 기준이며, containerd 이미지 스토어라면 3.1의 스냅샷터 경로로 바꿔 읽는다.

## 코어 4. 콘텐츠 주소화와 참조 계수 GC

### 4.1 콘텐츠 주소화 저장소

**한 줄 요약:** 모든 블롭을 이름이 아니라 내용의 해시(다이제스트)로 식별해서 같은 내용은 한 벌만 저장한다.

containerd의 콘텐츠 스토어는 모든 블롭(레이어 tar, 이미지 config 등)을 파일 이름이 아니라 **암호학적 해시(다이제스트, 예: `sha256:abcdef...`)**로 식별하고 저장한다(content-addressable storage).

- "내용이 같으면 다이제스트도 같다"(그 역도 사실상 성립한다. 해시 충돌은 실용적으로 무시할 확률이다).
- 그래서 서로 다른 이미지 태그, 심지어 다른 이미지 이름이라도 레이어 내용이 같으면 디스크에는 한 벌만 저장되고 여러 이미지가 그 블롭을 함께 참조한다.
- 이미지 pull 로그의 `Already exists`는 그 레이어의 다이제스트가 이미 로컬 콘텐츠 스토어에 있어 다운로드를 건너뛰었다는 뜻이다. 빌드 캐시와 멀티 스테이지 빌드가 빠른 것, 같은 베이스 이미지를 쓰는 여러 이미지를 받아도 디스크 사용량이 이미지 개수에 선형으로 늘지 않는 것이 모두 이 덕분이다.

### 4.2 참조 계수 기반 가비지 컬렉션

**한 줄 요약:** 어떤 이미지·컨테이너·스냅샷도 참조하지 않는 블롭만 지운다.

공유의 반대편에는 정리 문제가 있다. 이미지 하나를 지운다고 그 블롭을 곧바로 지우면 다른 이미지가 참조하던 데이터도 사라진다. containerd는 블롭마다 참조 관계를 메타데이터로 추적하다가 **더 이상 어떤 이미지·컨테이너·스냅샷도 참조하지 않는** 블롭만 지우는 참조 계수 방식의 GC를 수행한다. `docker image prune`이나 `docker system prune`을 해도 즉시 지워지는 레이어와 그렇지 않은 레이어가 갈리는 이유다.

```bash
docker system df       # 이미지/컨테이너/볼륨/빌드 캐시별 요약 (RECLAIMABLE 확인)
docker system df -v    # 레이어 단위 상세

docker pull alpine:3.20
docker pull curlimages/curl:latest
# 공통 레이어에 대해 "Already exists"가 있는지 pull 로그 확인
```

컨테이너 밖에 데이터를 두는 세 방식(named volume, bind mount, tmpfs)과 볼륨 드라이버 플러그인은 이 장의 쓰기 레이어와 짝을 이루는 주제로 [14장](14-볼륨-바인드마운트-tmpfs.md)에서 다룬다. 이미지가 빌드되는 과정은 [15장](15-빌드-BuildKit-Dockerfile.md), 이 구조를 전부 손으로 조립해 보는 것은 [17장](17-컨테이너를-손으로-만들기.md)이다.

## 실무 적용

### 체크리스트

- [ ] 이미지는 순서가 있는 읽기 전용 레이어(diff)의 스택이고, 컨테이너의 변경은 쓰기 레이어(upperdir)에만 기록됨을 설명할 수 있다.
- [ ] lowerdir/upperdir/merged/workdir를 구분하고, 수정은 CoW(upperdir로 복사 후 수정), 삭제는 whiteout임을 안다.
- [ ] 컨테이너를 지우면 쓰기 레이어도 사라진다는 점을 알고, 지속해야 하는 서버 데이터(세이브, 로그 등)는 볼륨/바인드 마운트로 뺐다.
- [ ] 내 호스트가 레거시 overlay2인지 containerd 이미지 스토어인지 `docker info`로 확인했다.
- [ ] Docker Engine v29로 올릴 때, `--storage-opt size=` 강제 여부와 디스크 사용량 증가, `userns-remap` 호환성을 사전에 검증했다.
- [ ] `docker system df -v`로 이미지/컨테이너/볼륨/빌드 캐시 사용량을 주기적으로 확인한다.
- [ ] `Already exists` 로그와 이미지 크기 합계가 단순합보다 작은 이유를 콘텐츠 주소화로 설명할 수 있다.

### 시나리오로 확인하기

1. **상황:** 컨테이너 안에서 이미지 레이어에 들어 있던 큰 로그 파일을 `rm`으로 지웠는데 이미지 크기는 그대로다.
   **질문:** 왜인가?

   <details markdown="1"><summary>답 확인</summary>

   이미지 레이어는 읽기 전용이라 실제로 지워지지 않는다. 삭제는 upperdir에 whiteout 표시를 남겨 merged 뷰에서만 보이지 않게 할 뿐이고, lowerdir의 원본 파일은 그대로 디스크에 있다. 수정의 경우에도 upperdir로 복사(CoW)된 뒤 수정된다. → 코어 2

   </details>

2. **상황:** 서버가 컨테이너 안 `/app/save/` 디렉터리에 플레이어 데이터를 파일로 쓴다. 컨테이너를 재배포하자 데이터가 사라졌다.
   **질문:** 왜 사라졌고 어떻게 해야 하는가?

   <details markdown="1"><summary>답 확인</summary>

   그 파일은 컨테이너의 쓰기 레이어(upperdir)에 기록되고, 컨테이너를 지우면 쓰기 레이어도 함께 사라진다. 재시작·교체에도 살아남아야 하는 데이터는 named volume이나 bind mount로 컨테이너 밖에 둔다. → 코어 1, [14장](14-볼륨-바인드마운트-tmpfs.md)

   </details>

3. **상황:** Docker Engine을 v29로 업그레이드한 새 서버에서 `--storage-opt size=10G`로 쓰기 레이어 크기를 제한했는데 컨테이너가 10G를 넘게 쓴다. 디스크 사용량도 이전 서버보다 많다.
   **질문:** 의심할 점은?

   <details markdown="1"><summary>답 확인</summary>

   신규 설치는 v29부터 containerd 이미지 스토어가 기본값이다. 이 경로는 `--storage-opt size=`를 받아주면서도 실제 용량 제한을 강제하지 않는 사례가 보고되어 있고(프로젝트 쿼터 검증 로직이 다름), 레이어를 압축/비압축 형태로 함께 보관해 디스크 사용량이 늘 수 있다. `docker info`로 저장 방식을 확인하고 한도를 재검증하며 용량 계획에 반영한다. → 코어 3

   </details>

4. **상황:** `alpine:3.20`과 같은 베이스를 쓰는 `curlimages/curl`을 받았는데 일부 레이어가 다운로드되지 않고 `Already exists`로 표시된다. 디스크 사용량은 두 이미지의 단순합보다 작다.
   **질문:** 원리는?

   <details markdown="1"><summary>답 확인</summary>

   콘텐츠 스토어는 블롭을 내용의 다이제스트로 식별하므로, 같은 내용의 레이어는 이미 있으면 다운로드를 건너뛰고 한 벌만 저장해 여러 이미지가 함께 참조한다. 그래서 이미지 크기 합계가 단순합보다 작다. → 코어 4

   </details>

---

📖 출처: `D:/varioproger.github.io-reference/doc/docker-fundamental/06_이미지와_스토리지.md`

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 이미지 = 순서가 있는 ( ? ) 레이어의 스택  /  이점: ( ? ) 공유 + 쓰기는 ( ? ) 레이어에만

[코어 2] overlayfs 4디렉터리: ( ? ) (읽기 전용·여러 개, 구분자 ':') / ( ? ) (쓰기·1개)
                              / ( ? ) (컨테이너가 보는 /) / ( ? ) (내부 작업용)
         수정 = ( ? )-on-( ? )   삭제 = ( ? ) 표시     overlay2/l/ 심볼릭 링크 이유: ____ 길이 한계

[코어 3] 레거시: /var/lib/docker/____       containerd: /var/lib/containerd/io.containerd.snapshotter.v1.____
         레거시 계보: aufs / ( ? ) / btrfs·zfs / ( ? )
         Docker Engine v( ? )부터 신규 설치 기본 = ( ? ) 이미지 스토어, 기존 설치는 ( ? )
         전환 검증 3가지: --storage-opt size= / 디스크 사용량 / ( ? )

[코어 4] 블롭 식별 = sha256 ( ? ) → 같은 내용은 ( ? ) 벌    pull 로그 "____"
         GC = ( ? ) 방식: 이미지·컨테이너·( ? ) 모두 참조 안 할 때 삭제
```

### 2. 인출 질문

1. 이미지를 레이어로 쌓는 구조의 두 가지 이점은?

   <details markdown="1"><summary>답 확인</summary>

   첫째, 같은 베이스 이미지를 쓰는 여러 이미지/컨테이너가 베이스 레이어를 디스크에서 물리적으로 공유한다(베이스 레이어는 한 벌). 둘째, 컨테이너의 변경은 별도의 쓰기 가능 레이어에만 기록되고 원본 이미지 레이어는 수정되지 않아, 컨테이너를 지워도 이미지가 멀쩡하고 같은 이미지의 컨테이너끼리 간섭하지 않는다. → 코어 1

   </details>

2. overlayfs의 lowerdir, upperdir, merged, workdir를 각각 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   lowerdir은 읽기 전용 이미지 레이어(콜론으로 여러 개), upperdir은 컨테이너가 쓰는 단일 쓰기 가능 레이어, merged는 컨테이너 프로세스가 `/`로 보는 통합 뷰, workdir은 파일 교체 같은 내부 연산을 원자적으로 처리하는 작업용 디렉터리다. → 코어 2

   </details>

3. 이미지 레이어에 있는 파일을 컨테이너 안에서 수정/삭제하면 각각 어떻게 처리되는가?

   <details markdown="1"><summary>답 확인</summary>

   수정은 파일을 upperdir로 먼저 복사한 뒤 복사본을 수정한다(copy-on-write). 삭제는 lowerdir 파일을 지우지 않고 upperdir에 "지워졌다"는 whiteout 표시를 남긴다. 어느 쪽도 원본 lowerdir은 손대지 않는다. → 코어 2

   </details>

4. `mount | grep overlay` 출력에서 lowerdir 경로가 `overlay2/l/XXXX` 같은 짧은 링크인 이유는?

   <details markdown="1"><summary>답 확인</summary>

   overlayfs 마운트 시 `lowerdir` 옵션 문자열 길이에는 커널 한계가 있어, 레이어가 많으면 전체 경로를 나열할 때 제한에 걸릴 수 있다. Docker가 각 레이어 디렉터리에 대응하는 짧은 심볼릭 링크를 `overlay2/l/`에 만들어 마운트에 쓰기 때문이다. → 코어 2

   </details>

5. 레거시 graphdriver 저장소와 containerd 스냅샷터 저장소는 경로와 식별 방식이 어떻게 다른가?

   <details markdown="1"><summary>답 확인</summary>

   레거시는 `/var/lib/docker/overlay2/` 아래 dockerd의 그래프 드라이버가 관리하고, containerd는 `/var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/` 아래 Snapshots 서비스가 관리한다. 후자는 숫자 스냅샷 ID로 식별하며 `fs/`(overlay2의 `diff/`에 해당)와 `work/`를 두고, 부모-자식 관계는 bolt 메타 스토어에 기록되어 `ctr snapshots`로 조회한다. → 코어 3

   </details>

6. Docker Engine v29 이후 이미지 스토어 전환에서 확인해야 할 세 가지는?

   <details markdown="1"><summary>답 확인</summary>

   (1) `--storage-opt size=` 같은 레거시 옵션이 조용히 무시되어 용량 제한이 강제되지 않을 수 있다. (2) 압축·비압축 형태를 함께 보관해 디스크 사용량이 늘 수 있다. (3) `userns-remap`과의 조합이 아직 완전하지 않을 수 있다. 신규 설치는 기본값을 따르고, 기존 환경은 검증 후 계획적으로 전환한다. → 코어 3

   </details>

7. 콘텐츠 주소화 저장소가 pull의 `Already exists`와 디스크 절약을 어떻게 가능하게 하는가?

   <details markdown="1"><summary>답 확인</summary>

   블롭을 파일 이름이 아니라 내용의 암호학적 해시(다이제스트)로 식별하므로, 내용이 같은 레이어는 이름이나 이미지가 달라도 다이제스트가 같다. 이미 로컬 스토어에 있으면 다운로드를 건너뛰고(`Already exists`), 디스크에는 한 벌만 저장되어 여러 이미지가 참조한다. → 코어 4

   </details>

8. `docker image prune` 후에도 일부 레이어가 남는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   여러 이미지가 같은 블롭을 참조하므로, containerd는 참조 계수 방식으로 어떤 이미지·컨테이너·스냅샷도 참조하지 않는 블롭만 지운다. 다른 곳이 참조 중인 레이어는 남는다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** `fork()`의 페이지 copy-on-write = overlayfs의 파일 copy-on-write ⚠️ 단위가 페이지가 아니라 파일 전체이고, 삭제는 실제 제거가 아니라 whiteout 표시다.
- **C++ 유추:** git의 SHA 해시 객체 저장 = 콘텐츠 주소화 블롭 ⚠️ 태그는 이름표일 뿐이고, 삭제는 참조 계수(이미지·컨테이너·스냅샷의 참조 여부)로 판단된다.
- **비유:** 이미지 레이어 = 투명 필름(OHP) 여러 장을 겹친 그림. 아래 필름(lowerdir)은 건드리지 않고 맨 위 한 장(upperdir)에만 덧그린다. ⚠️ 비유가 깨지는 지점: 지우개로 지우는 것이 아니라 "지워졌다"는 흰색 표시(whiteout)를 덧입히는 것이라, 아래 필름의 용량은 줄지 않는다.
- **비유:** 콘텐츠 주소 = 책의 ISBN. 출판사·표지가 달라도 내용이 같으면 같은 번호라 서점(디스크)에 한 권만 둔다. ⚠️ 비유가 깨지는 지점: ISBN은 사람이 붙이는 번호이지만 다이제스트는 내용에서 계산한 해시라 내용이 한 바이트만 달라도 완전히 다른 값이 된다.
- **묶음(3의 법칙):** 쓰기 레이어와 짝인 컨테이너 밖 저장 3종(named volume·bind mount·tmpfs) / 전환 검증 3가지(`--storage-opt`·디스크 사용량·`userns-remap`) / 저장소 확인 3명령(`docker info`·`docker inspect`·`docker system df`).
- **대칭·순서:** lowerdir(읽기 전용, 여러 개) ↔ upperdir(쓰기, 한 개) → merged. 레거시 `overlay2/<id>/diff` ↔ containerd `snapshots/<ID>/fs`. 계보 aufs → devicemapper/btrfs/zfs → overlay2 → containerd 이미지 스토어(v29).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "컨테이너가 보는 `/`는 어떻게 만들어지고, 안에서 파일을 수정/삭제하면 디스크에서 무슨 일이 일어나는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "같은 베이스를 쓰는 이미지가 많아도 디스크가 선형으로 늘지 않는 이유"를 레이어 공유와 다이제스트로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "기존 운영 서버도 Docker Engine v29로 올리면 자동으로 새 이미지 스토어로 바뀌니 걱정 없다" vs B "기존 설치는 자동 전환되지 않고 전환 시 검증할 항목이 있다" — 양쪽을 번갈아 변호해 보세요. (기본값 전환 범위, `--storage-opt`, 디스크 사용량, `userns-remap`을 근거로)
- **AI 역할 반전:** "내가 overlayfs의 lowerdir/upperdir와 copy-on-write를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: docker-fundamental/06_이미지와_스토리지.md (6.1&#126;6.5, 6.7)*
