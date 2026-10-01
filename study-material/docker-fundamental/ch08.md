---
title: "8장. BuildKit 아키텍처 — LLB, 프론트엔드, 솔버, 캐시"
---

# 8장. BuildKit 아키텍처 — LLB, 프론트엔드, 솔버, 캐시

7장에서는 `docker run`이 dockerd를 거쳐 containerd에 도달하는 경로를 추적했습니다. `docker build`도
같은 REST API 경로를 통해 dockerd에 도달하지만, 그 다음부터는 완전히 다른 세계로 들어갑니다. 이미지를
만드는 작업은 컨테이너를 실행하는 작업과 성격이 달라서, Docker는 오래전부터 빌드 전용의 별도 엔진을
두고 있습니다. 이 장에서는 그 빌드 엔진인 BuildKit이 왜 필요했는지, 그리고 내부적으로 어떤 구조로
Dockerfile을 이미지로 바꾸는지를 다룹니다.

## 레거시 빌더의 한계

BuildKit 이전에 Docker가 쓰던 빌더(흔히 "레거시 빌더"라고 부릅니다)의 동작 방식은 단순했습니다.
Dockerfile을 위에서부터 한 줄씩 읽어서, 각 명령어(`FROM`, `RUN`, `COPY`, …)를 순서대로 실행하고, 명령어
하나가 끝날 때마다 그 결과를 새 레이어로 커밋하는 방식이었습니다. 이 방식은 이해하기 쉽다는 장점이
있었지만, 실제 빌드 워크로드가 복잡해지면서 몇 가지 근본적인 한계가 드러났습니다.

가장 큰 문제는 **순차 실행**이었습니다. Dockerfile에 서로 의존 관계가 없는 여러 단계가 있어도 — 예를
들어 서로 다른 디렉터리에서 각각 의존성을 설치하는 두 개의 `RUN` 명령 — 레거시 빌더는 이를 병렬화할
방법이 없었습니다. 명령어 사이의 실제 데이터 의존성을 분석하는 게 아니라 파일에 적힌 순서 그대로
실행했기 때문입니다. 빌드 시간이 길어지는 만큼 이는 CI 파이프라인 비용과 개발자 피드백 루프 양쪽에
직접적인 손해로 이어졌습니다.

두 번째 문제는 **레이어 캐시 무효화**였습니다. 레거시 빌더의 캐시는 "이 명령어와 그 이전까지의 모든
레이어가 이전 빌드와 정확히 같으면 캐시를 재사용한다"는 단순한 규칙으로 동작했습니다. 문제는 이 규칙이
너무 거칠다는 데 있었습니다. Dockerfile 초반부의 `COPY` 한 줄만 바뀌어도 그 아래에 있는 모든 명령의
캐시가 통째로 무효화되었고, 실제로는 바뀐 파일과 아무 상관이 없는 `RUN apt-get install` 같은 무거운
단계까지 처음부터 다시 실행해야 했습니다. 캐시 마운트처럼 특정 디렉터리(패키지 매니저 캐시 등)만
재사용하고 싶은 세밀한 제어도 레거시 빌더의 모델로는 표현할 수 없었습니다.

세 번째 문제는 **빌드 콘텍스트와 실행 환경에 대한 유연성 부족**이었습니다. 레거시 빌더는 이미지를 만드는
방법이 사실상 Dockerfile 문법 하나로 고정되어 있었고, 원격 캐시를 다른 백엔드에 내보내거나, 멀티플랫폼
이미지를 하나의 빌드로 동시에 만들거나, 빌드 도중 비밀 값을 레이어에 남기지 않고 안전하게 주입하는 것
같은 요구를 해결하기 어려웠습니다.

BuildKit은 이 세 가지 문제 — 병렬화 불가, 거친 캐시 무효화, 경직된 빌드 모델 — 를 해결하기 위해 처음부터
다시 설계된 빌드 엔진입니다. Docker Engine 18.09부터 옵트인으로 제공되기 시작했고, 이후 여러 릴리스를
거치며 기본 빌더 자리를 완전히 대체했습니다. 지금 기준으로는 사실상 유일한 빌드 엔진이라고 봐도
무방하며, 과거 레거시 빌더를 다시 켜는 `DOCKER_BUILDKIT=0` 같은 우회로는 호환성 유지를 위해 남아있는
잔재로 이해하는 편이 정확합니다.

## BuildKit의 핵심 구조 — 프론트엔드, LLB, 솔버, 익스포터

BuildKit의 아키텍처는 빌드 과정을 네 개의 단계로 명확히 분리합니다.

```
Dockerfile (또는 다른 빌드 정의)
        │
        ▼
   프론트엔드 (Frontend)          ← Dockerfile을 파싱해서 LLB로 변환
        │
        ▼
     LLB (Low-Level Build)        ← 빌드 단계를 표현하는 DAG(방향성 비순환 그래프)
        │
        ▼
      솔버 (Solver)               ← DAG를 분석해 실행 순서를 최적화·병렬화
        │
        ▼
     익스포터 (Exporter)          ← 실행 결과를 이미지, OCI tar, 로컬 파일 등으로 출력
```

**프론트엔드**는 사람이 작성한 빌드 정의(대표적으로 Dockerfile)를 읽어서 BuildKit이 이해할 수 있는
중간 표현으로 바꾸는 역할을 합니다. 여기서 핵심은 프론트엔드가 BuildKit 본체에 하드코딩되어 있지 않고,
별도의 컨테이너 이미지로 배포된다는 점입니다. BuildKit은 빌드를 시작할 때 지정된 프론트엔드 이미지를
받아와서 격리된 환경에서 실행하고, 그 프론트엔드가 Dockerfile을 분석해 다음 단계인 LLB를 만들어냅니다.

**LLB(Low-Level Build definition)**는 BuildKit의 심장부에 해당하는 개념입니다. Dockerfile의 각 명령을
그대로 옮긴 것이 아니라, "이 파일 집합을 입력으로 받아 이 명령을 실행하면 이런 결과가 나온다"는 식의
연산들을 노드로, 그 연산들 사이의 의존 관계를 엣지로 표현한 콘텐츠 주소 기반의 DAG입니다. 여기서
"콘텐츠 주소 기반"이라는 표현이 중요한데, 각 노드는 자신의 입력(부모 노드들의 출력, 사용된 파일,
명령어 문자열 등)으로부터 계산되는 고유한 해시로 식별됩니다. 이 덕분에 같은 입력을 가진 노드는 어느
빌드에서 실행되었든 같은 것으로 취급될 수 있고, 이것이 바로 정교한 캐시 재사용의 기반이 됩니다.
LLB는 Dockerfile 전용 개념이 아니라 BuildKit이라는 엔진 자체의 언어이기 때문에, Dockerfile이 아닌
다른 방식으로 빌드를 정의하는 도구도 결국 이 LLB를 생성하기만 하면 BuildKit의 모든 최적화·캐시 기능을
그대로 활용할 수 있습니다.

**솔버(Solver)**는 이렇게 만들어진 DAG를 받아서 실제로 무엇을, 어떤 순서로, 어디까지 병렬로 실행할지
결정합니다. DAG 형태로 표현되어 있다는 것은 서로 의존 관계가 없는 노드들을 솔버가 명확히 구분할 수
있다는 뜻이고, 그런 노드들은 동시에 실행됩니다. 레거시 빌더가 Dockerfile에 적힌 순서를 그대로 따라갈
수밖에 없었던 것과 달리, BuildKit의 솔버는 그래프의 구조만 보고 병렬화 가능한 지점을 스스로 찾아냅니다.
또한 솔버는 각 노드의 실행 여부를 캐시 상태와 대조해서, 이미 같은 해시로 계산된 결과가 있다면 그 노드
자체를 건너뜁니다. 멀티스테이지 빌드에서 최종 이미지에 전혀 반영되지 않는 중간 스테이지의 산출물이
있다면, 솔버는 그래프를 분석해 그런 불필요한 계산 자체를 생략하기도 합니다.

**익스포터(Exporter)**는 솔버가 계산을 마친 결과물을 사용자가 원하는 최종 형태로 내보내는 계층입니다.
가장 흔한 형태는 컨테이너 이미지(도커 이미지 포맷 또는 OCI 이미지 포맷)로 로컬 이미지 스토어에 적재하거나
레지스트리로 바로 푸시하는 것이지만, 그 외에도 OCI 레이아웃을 tar 파일로 내보내거나, 빌드 결과물을
단순한 파일 트리로 로컬 디렉터리에 풀어내는 등 여러 출력 형식을 지원합니다. 하나의 빌드 결과를 여러
형식으로 동시에 내보내는 것도 가능합니다.

이 네 단계 분리가 주는 실질적인 이득은, 각 계층이 독립적으로 교체·확장 가능하다는 데 있습니다. 프론트엔드를
바꾸면 Dockerfile이 아닌 다른 문법으로 이미지를 정의할 수 있고, 익스포터를 바꾸면 같은 빌드 그래프를
전혀 다른 출력물로 내보낼 수 있습니다. 반면 LLB와 솔버, 즉 빌드의 "엔진" 부분은 그대로 유지되므로 캐시
효율이나 병렬 실행 같은 핵심 이점은 어떤 프론트엔드/익스포터 조합을 쓰든 동일하게 적용됩니다.

## 플러그형 프론트엔드와 `# syntax=` 지시자

BuildKit의 프론트엔드가 별도의 컨테이너 이미지로 배포된다는 사실은, 실무에서 거의 모든 Dockerfile
맨 위에 등장하는 다음 한 줄과 직접 연결됩니다.

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.20
...
```

`# syntax=` 지시자는 이 Dockerfile을 해석할 프론트엔드 이미지를 명시적으로 지정하는 역할을 합니다.
이 지시자가 없으면 BuildKit은 dockerd에 내장되어 있는 기본 프론트엔드 구현을 사용하는데, 이 내장
구현은 Docker Engine 자체의 릴리스 주기에 묶여 있어서 최신 Dockerfile 문법 기능(예: heredoc 문법,
`--mount` 옵션들, 최신 `COPY --link` 등)을 곧바로 쓰지 못할 수 있습니다. 반면 `# syntax=docker/dockerfile:1`
을 명시하면, BuildKit은 이 이미지를 레지스트리에서 받아와 컨테이너 샌드박스 안에서 실행하고, 그 결과로
얻어지는 최신 파서 구현을 사용합니다. 즉 이 한 줄은 "이 Dockerfile을 dockerd 버전과 무관하게, 항상
최신(혹은 지정한 버전의) 공식 Dockerfile 프론트엔드로 해석해 달라"는 명시적 선언입니다.

버전 표기 방식에도 규칙이 있습니다. `docker/dockerfile:1`처럼 메이저 버전만 지정하면 1.x 계열의 최신
안정 릴리스를 자동으로 따라가고, `docker/dockerfile:1.7`처럼 마이너 버전까지 지정하면 그 마이너 버전
내의 패치 릴리스까지만 따라갑니다. `docker/dockerfile:1.7.1`처럼 패치 버전까지 못박으면 완전히 고정된
불변 버전이 됩니다. 팀 전체가 동일한 Dockerfile 해석 결과를 보장받고 싶다면 마이너 버전 이상을 고정하는
것이 안전하고, 최신 기능을 계속 따라가고 싶다면 `1`만 지정하는 편이 일반적입니다. 아직 정식 채널에
들어오지 않은 실험적 기능을 미리 써보고 싶은 경우에는 `docker/dockerfile:1-labs`처럼 `-labs` 접미사가
붙은 채널을 사용할 수 있는데, 이 채널은 정식 채널보다 먼저 신규 문법을 제공하는 대신 마이너 버전 간에도
호환성이 깨질 수 있다는 점을 감안해야 합니다.

프론트엔드가 플러그형 구조라는 점은 Dockerfile이 BuildKit의 유일한 입력 형식이 아니라는 뜻이기도
합니다. 실제로 커뮤니티에는 Dockerfile 대신 다른 언어나 형식으로 이미지를 정의하려는 프론트엔드
구현들이 존재해 왔습니다. 이 책에서 그런 대안 프론트엔드를 깊이 다루지는 않지만, 핵심은 "Dockerfile은
BuildKit이 지원하는 여러 프론트엔드 중 압도적으로 가장 널리 쓰이는 하나일 뿐, BuildKit 자체와 동일한
개념이 아니다"라는 사실입니다. 9장에서 Dockerfile 문법 자체의 진화를 다룰 때 이 구분을 다시 상기하게
될 것입니다.

## 캐시 시스템 — 레이어 캐시에서 원격 캐시 백엔드까지

BuildKit의 캐시는 앞서 설명한 LLB의 콘텐츠 주소 기반 구조 위에서 동작하기 때문에, 레거시 빌더보다
훨씬 세밀한 단위로 재사용 여부를 판단합니다. 같은 입력(부모 레이어, 사용된 파일의 내용, 명령어 문자열,
빌드 인자 값 등)으로 계산된 적이 있는 노드는 다시 실행하지 않고 이전 결과를 그대로 재사용합니다. 이
자동 캐시는 별다른 설정 없이도 기본적으로 동작하며, Dockerfile을 캐시 친화적으로(자주 바뀌는 내용을
아래쪽에, 잘 안 바뀌는 내용을 위쪽에) 작성하는 것만으로도 상당한 효과를 얻을 수 있습니다.

여기서 한 단계 더 나아간 것이 **캐시 마운트**입니다. `RUN` 명령에 `--mount=type=cache`를 지정하면,
그 명령이 실행되는 동안에만 특정 디렉터리를 지속적인 캐시 볼륨으로 마운트할 수 있습니다. 대표적인
용도는 `apt`, `npm`, `pip`, `go build` 같은 패키지 매니저/빌드 도구의 캐시 디렉터리입니다.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
```

이 예시에서 `/root/.npm`은 일반적인 이미지 레이어로 커밋되지 않고, 빌드와 빌드 사이에 지속되는 별도의
캐시 저장소에 남습니다. `package.json`이 바뀌지 않는 한 `npm ci`는 매번 실행되지만, 이미 받아둔 패키지
캐시를 재사용하기 때문에 네트워크 다운로드 비용을 크게 줄일 수 있습니다. 캐시 마운트에는 몇 가지
옵션이 있는데, `id`로 같은 캐시를 여러 `RUN` 명령이나 여러 Dockerfile에서 공유하도록 이름을 지정할 수
있고, `sharing` 옵션으로 동시 접근 정책을 제어할 수 있습니다. 예를 들어 `sharing=locked`로 지정하면
동일한 캐시 마운트를 사용하는 여러 병렬 빌드가 캐시 파일을 동시에 건드리지 않도록 서로 순서를 기다리게
되는데, `apt`처럼 동시 쓰기에 취약한 도구를 캐시 마운트와 함께 쓸 때 특히 중요합니다.

또 하나의 축은 **캐시의 외부 저장과 재사용(export/import)**입니다. 로컬 빌드 캐시는 기본적으로 그
빌드를 실행한 머신에만 남기 때문에, CI 러너가 매번 새로운 머신에서 뜨는 환경에서는 캐시 이점을 거의
누릴 수 없습니다. 이를 해결하기 위해 BuildKit은 `--cache-to`로 캐시를 외부 백엔드로 내보내고,
`--cache-from`으로 이전에 내보낸 캐시를 불러오는 기능을 제공합니다.

```bash
# 캐시를 레지스트리에 별도 이미지로 내보내면서 빌드
docker buildx build \
  --cache-to type=registry,ref=myregistry.example.com/myapp:buildcache,mode=max \
  --cache-from type=registry,ref=myregistry.example.com/myapp:buildcache \
  -t myregistry.example.com/myapp:latest \
  --push .
```

지원되는 캐시 백엔드는 용도에 따라 다양합니다. `registry`는 캐시를 컨테이너 레지스트리에 별도의
이미지처럼 저장해서 여러 CI 러너나 여러 개발자가 공유할 수 있게 하고, `gha`는 GitHub Actions의 캐시
저장소를 그대로 활용해 GitHub Actions 환경에서의 캐시 재사용을 최적화합니다. `s3`(및 `azblob`)는 오브젝트
스토리지를 캐시 백엔드로 쓸 수 있게 해주며, `local`은 파일시스템 경로를 캐시 저장소로 사용해 같은 빌드
에이전트를 재사용하는 파이프라인에 적합합니다. `inline`은 별도의 캐시 저장소 없이 결과 이미지 자체에
캐시 메타데이터를 함께 인코딩하는 방식으로, `image` 익스포터와 함께 쓸 때 가장 간단하게 캐시 공유를
시작할 수 있는 방법입니다. `mode` 옵션은 얼마나 많은 중간 레이어를 캐시로 내보낼지를 결정하는데, 기본값인
`min`은 최종 이미지에 반영되는 레이어 위주로만 캐시를 내보내 저장 공간을 아끼고, `max`는 멀티스테이지
빌드의 중간 스테이지까지 포함한 모든 레이어를 캐시로 내보내 캐시 적중률을 높이는 대신 저장 공간과
전송 비용이 늘어납니다. 여러 캐시 소스를 동시에 `--cache-from`으로 지정하는 것도 가능해서, 예를 들어
현재 작업 중인 브랜치의 캐시와 `main` 브랜치의 캐시를 함께 참조해 적중률을 높이는 패턴이 CI 환경에서
흔히 쓰입니다.

## 2026년 현재 — rootless executor 강화와 Bake의 GA 전환

BuildKit과 그 주변 생태계는 계속 진화하고 있고, 2026년 9월 현재 시점에서 특히 짚어야 할 두 가지 변화가
있습니다.

첫째, **BuildKit 0.17**(2026년 1분기 릴리스)에서 rootless executor의 보안·격리 수준이 한층 강화되었습니다.
BuildKit은 오래전부터 root 권한 없이 빌드를 실행하는 rootless 모드를 지원해왔지만, 이는 컨테이너 실행
환경의 rootless 지원 전반이 그렇듯 격리 강도와 호환성 사이에서 계속 개선이 이루어지는 영역입니다.
0.17에서의 강화는 빌드 도중 실행되는 임의의 명령(어떤 Dockerfile이든 결국 `RUN`으로 임의 코드를 실행할
수 있다는 점을 생각하면, 빌드 자체도 잠재적으로 신뢰할 수 없는 코드를 실행하는 행위입니다)이 호스트에
영향을 미칠 수 있는 표면을 더 좁히는 방향으로 이루어졌습니다. 이는 특히 멀티테넌트 CI 환경, 즉 서로
신뢰하지 않는 여러 팀·프로젝트의 빌드를 같은 인프라에서 실행해야 하는 조직에게 중요한 개선입니다.
root 권한 없이 빌더를 띄울 수 있다는 것은 곧 빌드 프로세스가 호스트 커널에 대해 가지는 공격 표면을
근본적으로 줄인다는 뜻이고, rootless 네트워킹을 다루는 17장의 논의와도 맥락이 닿아 있습니다.

둘째, **Docker Bake**가 오랜 실험(experimental) 단계를 마치고 2025년 초 정식 기능(GA)으로 전환되었습니다.
Bake는 `docker build` 한 번으로 처리하기에는 번거로운 다중 타겟 빌드 — 예를 들어 하나의 모노레포에서
여러 서비스 이미지를 각기 다른 빌드 인자·플랫폼·태그로 동시에 빌드하는 상황 — 을 `docker-bake.hcl`
(HCL 외에도 YAML, JSON으로도 작성 가능) 파일에 선언적으로 정의하고, `docker buildx bake` 한 번으로
실행할 수 있게 해주는 기능입니다. 서로 의존 관계가 없는 빌드 타겟은 자동으로 병렬화되고, 여러 타겟이
같은 빌드 컨텍스트를 공유한다면 그 콘텍스트를 중복 전송하지 않도록 지능적으로 처리하는 등, 위에서 설명한
BuildKit의 DAG/솔버 모델이 주는 이점을 다중 타겟 빌드 수준까지 확장한 도구라고 볼 수 있습니다. GA 전환
이후로는 실무에서 CI 파이프라인의 빌드 설정을 셸 스크립트나 Makefile 대신 `docker-bake.hcl`로 옮기는
사례가 크게 늘었습니다. 이 장에서는 Bake가 BuildKit·buildx와 어떤 관계에 있는지 개념만 짚고 넘어가며,
`docker-bake.hcl`의 실제 문법(타겟 정의, 그룹, 변수, 매트릭스 빌드 등)은 9~10장에서 Dockerfile 진화 및
Compose 생태계와 함께 자세히 다룹니다.

이 외에도 실무적으로 눈여겨볼 만한 변화로, `docker buildx build`와 `docker buildx bake` 양쪽에
`--metadata-file` 플래그가 추가되어 빌드 결과에 대한 메타데이터(이미지 다이제스트, 빌드 참조,
프로버넌스 정보 등)를 JSON 파일로 저장할 수 있게 되었습니다. 이는 빌드 이후 단계에서 방금 만든 이미지의
정확한 다이제스트를 스크립트로 이어받아 배포 매니페스트에 자동으로 반영하는 등, CI/CD 자동화에서 특히
유용합니다.

```bash
docker buildx build --load --metadata-file metadata.json -t myapp:latest .
cat metadata.json
```

## `docker buildx`와 BuildKit의 관계

지금까지의 예제에서 이미 `docker build` 대신 `docker buildx build`를 여러 차례 사용했는데, 이 둘의
관계를 명확히 정리할 필요가 있습니다. `buildx`는 BuildKit을 구동하고 관리하기 위한 Docker CLI 플러그인
입니다. BuildKit 자체는 그저 gRPC로 빌드 요청을 받아 처리하는 데몬 프로세스이고, `buildx`는 그 데몬을
어디서(로컬 컨테이너, 쿠버네티스 파드, 원격 호스트) 어떻게 띄우고, 그 데몬에게 어떤 빌드 요청을 어떤
플랫폼·출력 형식으로 보낼지를 사용자 대신 관리해주는 상위 레이어입니다.

Docker Engine 23.0 이후로는 `docker build` 명령 자체가 내부적으로 `buildx`를 호출하도록 통합되었기
때문에, 평소에 `docker build`만 써도 사실상 BuildKit·buildx 경로를 그대로 타고 있는 경우가 많습니다.
다만 `buildx`가 제공하는 빌더 인스턴스 관리, 멀티플랫폼 빌드, 원격 빌더 연결 같은 고급 기능을 쓰려면
`docker buildx` 서브커맨드를 직접 다루어야 합니다.

빌더 인스턴스는 `docker buildx create`로 만듭니다.

```bash
docker buildx create --name mybuilder --driver docker-container --use
docker buildx inspect --bootstrap
```

여기서 중요한 개념은, 이렇게 만들어진 "빌더 인스턴스"가 추상적인 설정값이 아니라 실제로 어딘가에 떠
있는 BuildKit 데몬을 가리킨다는 점입니다. `docker-container` 드라이버를 쓰면 buildx는 로컬 Docker
Engine 위에 BuildKit을 실행하는 별도의 컨테이너를 하나 띄우고, 그 컨테이너 안의 BuildKit 데몬에게
이후의 모든 빌드 요청을 전달합니다. `kubernetes` 드라이버를 쓰면 같은 역할을 하는 BuildKit 파드가
쿠버네티스 클러스터 위에 뜨고, `remote` 드라이버를 쓰면 사용자가 별도로 운영 중인 BuildKit 데몬에
buildx가 그저 연결만 하는 방식입니다. 즉 "빌더를 만든다"는 행위는 실질적으로 "BuildKit 데몬을 하나
프로비저닝하거나, 이미 떠 있는 BuildKit 데몬에 연결 정보를 등록하는" 행위와 같습니다. 이 구조 덕분에
로컬 Docker Desktop 환경에서 쓰던 것과 동일한 빌드 설정으로, 더 크고 다양한 CPU 아키텍처를 가진 원격
빌더 팜에 그대로 빌드를 위임하는 것이 가능해집니다. 멀티플랫폼 빌드와 buildx의 세부 사용법은 9장에서
Dockerfile 진화와 함께 이어서 다룹니다.

## 핵심 요약

- 레거시 빌더는 Dockerfile을 순차적으로 실행하고 레이어 단위로만 캐시를 판단했기 때문에, 병렬화가
  불가능하고 캐시 무효화가 지나치게 거칠다는 근본적 한계가 있었다.
- BuildKit은 빌드를 프론트엔드(Dockerfile → LLB 변환) → LLB(콘텐츠 주소 기반 DAG) → 솔버(병렬화·캐시
  판단) → 익스포터(이미지/OCI tar 등 출력)의 네 계층으로 분리해 이 문제를 해결한다.
- 프론트엔드는 컨테이너 이미지로 배포되는 플러그형 구성 요소이며, `# syntax=docker/dockerfile:1`은 이
  Dockerfile을 해석할 프론트엔드 이미지 버전을 명시적으로 지정하는 지시자다.
- `--mount=type=cache`로 패키지 매니저 캐시 등을 레이어 밖에서 지속시킬 수 있고, `--cache-to`/`--cache-from`
  으로 캐시를 registry/gha/s3/local/inline 등 다양한 백엔드에 내보내고 불러올 수 있다.
- 2026년 현재 BuildKit 0.17에서 rootless executor의 격리가 강화되었고, Docker Bake는 2025년 초 GA로
  전환되어 다중 타겟 빌드를 `docker-bake.hcl`로 선언적으로 관리할 수 있게 되었다(문법은 9~10장에서 다룸).
- `docker buildx`는 BuildKit을 구동·관리하는 CLI 플러그인이며, `docker buildx create`로 만드는 빌더
  인스턴스는 실제로는 별도 컨테이너·파드·원격 호스트로 뜨는 BuildKit 데몬을 가리킨다.

## 실습

아래 실습은 BuildKit이 기본 활성화된 Docker Engine 29.x, `docker buildx` 플러그인이 설치된 리눅스
환경을 전제로 합니다.

```bash
# 1. 현재 buildx 빌더 목록과 기본 드라이버를 확인한다.
docker buildx ls
# 기대 결과: default 빌더가 docker 드라이버로 표시된다 (별도 생성 전 상태).

# 2. 캐시 마운트 효과를 비교하기 위한 Dockerfile을 준비한다.
mkdir -p /tmp/buildkit-demo && cd /tmp/buildkit-demo
cat > Dockerfile <<'EOF'
# syntax=docker/dockerfile:1
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
EOF
echo "requests==2.32.3" > requirements.txt

# 3. 첫 빌드 시간을 측정한다 (패키지를 새로 받아온다).
time docker buildx build -t buildkit-demo:1 --load .

# 4. requirements.txt를 건드리지 않고 다시 빌드해 레이어 캐시가 그대로 재사용되는지 확인한다.
time docker buildx build -t buildkit-demo:2 --load .
# 기대 결과: 2번째 빌드는 "CACHED" 로그와 함께 훨씬 짧은 시간에 끝난다.

# 5. requirements.txt에 패키지를 하나 추가한 뒤, 캐시 마운트 덕분에 다운로드 자체는 빨라도
#    pip install 단계는 다시 실행되는 것을 확인한다.
echo "click==8.1.7" >> requirements.txt
time docker buildx build -t buildkit-demo:3 --load .
# 기대 결과: RUN 단계는 다시 실행되지만(캐시 마운트 밖의 레이어 캐시는 무효화됨),
# pip 다운로드 자체는 캐시 마운트 덕분에 빠르게 끝난다.

# 6. 로컬 디렉터리를 캐시 백엔드로 사용해 export/import를 실습한다.
rm -rf /tmp/buildkit-cache
docker buildx build \
  --cache-to type=local,dest=/tmp/buildkit-cache,mode=max \
  --cache-from type=local,src=/tmp/buildkit-cache \
  -t buildkit-demo:4 --load .
ls /tmp/buildkit-cache
# 기대 결과: 캐시 블롭 파일들이 /tmp/buildkit-cache 아래에 생성된다.

# 7. --metadata-file로 빌드 메타데이터를 저장하고 이미지 다이제스트를 확인한다.
docker buildx build --load --metadata-file metadata.json -t buildkit-demo:5 .
grep "containerimage.digest" metadata.json

# 8. docker-container 드라이버로 별도의 buildx 빌더 인스턴스를 만들어, 이것이 실제로는
#    별도의 컨테이너로 뜬 BuildKit 데몬임을 확인한다.
docker buildx create --name demo-builder --driver docker-container --use
docker buildx inspect --bootstrap
docker ps --filter "name=buildx_buildkit_demo-builder"
# 기대 결과: buildx_buildkit_demo-builder0 라는 이름의 컨테이너가 실행 중으로 보인다.

# 9. 정리
docker buildx rm demo-builder
docker rmi buildkit-demo:1 buildkit-demo:2 buildkit-demo:3 buildkit-demo:4 buildkit-demo:5
```

다음 9장에서는 이 BuildKit 프론트엔드가 실제로 해석하는 대상인 Dockerfile 문법 자체가 어떻게 진화해
왔는지 — heredoc 문법, 캐시 마운트 옵션의 세부 사항, 그리고 buildx와 QEMU를 이용한 멀티플랫폼 빌드로
이어서 다룹니다.
