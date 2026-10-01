---
title: "부록 A. 버전별 주요 변경사항 총정리 (Docker Engine 20.10 → 29.x)"
---

# 부록 A. 버전별 주요 변경사항 총정리 (Docker Engine 20.10 → 29.x)

이 부록의 목적은 새로운 내용을 설명하는 것이 아니라, 이 교재 본문 곳곳에서 "2026년 현재"라는 표현과 함께
언급한 버전별 변화를 한자리에 시간순으로 모아두는 것입니다. Docker 생태계는 변화가 빠른 편이라, 이 교재를
나중에 다시 펼쳐보는 독자가 "본문에서 설명한 내용 중 어디까지가 여전히 유효하고 어디부터 낡은 정보일
가능성이 있는지"를 빠르게 가늠할 수 있도록 하는 것이 이 표의 역할입니다. 정확한 버전 번호나 도입 시점은
가능한 한 Docker 공식 릴리스 노트(`docs.docker.com/engine/release-notes`)와 프로젝트 공식 발표를 기준으로
정리했으며, 확정하기 어려운 세부 시점은 "대략"이라는 표현으로 낮춰서 표기했습니다.

## A.1 타임라인 개요

| 시점(대략) | 버전 | 변화 | 관련 장 |
|---|---|---|---|
| 2021년 초 | Docker Engine 20.10 전후 | cgroup v2 지원이 실험적으로 도입되기 시작 | [3장](ch03.md) |
| 2022년 | Docker Engine 23.x, containerd 1.6+ | cgroup v2가 systemd 기반 최신 배포판에서 사실상 표준 환경으로 자리잡음 | [3장](ch03.md) |
| 2023년 | Docker Engine 24.x | BuildKit이 기본 빌더로 완전히 자리잡음, Buildx/Bake 생태계 성숙 | [8장](ch08.md), [9장](ch09.md) |
| 2024년 | Docker Engine 25.x | Rootless 네트워킹에 pasta가 RootlessKit 기반 실험적 대안으로 추가 | [17장](ch17.md) |
| 2025년 초 | BuildKit 0.17 전후 | Docker Bake가 GA(정식 기능)로 전환, BuildKit 0.17에서 rootless executor 관련 개선 | [8장](ch08.md), [9장](ch09.md), [10장](ch10.md) |
| 2025년 | Docker Engine 28.x | 게시(publish)하지 않은 포트로의 인바운드 트래픽을 기본적으로 차단하도록 네트워킹 하드닝 | [12장](ch12.md), [16장](ch16.md) |
| 2025년 하반기 ~ 2026년 | containerd 2.0/2.x | Sandbox API가 stable로 승격 | [5장](ch05.md) |
| 2026년 초 | Docker Engine 29.0 | containerd 이미지 스토어가 신규 설치 기본값으로 전환, 레거시 graphdriver는 유지보수 모드로 전환(deprecated 경로) | [1장](ch01.md), [6장](ch06.md) |
| 2026년 초 | Docker Engine 29.0 | 실험적 `nftables` 방화벽 백엔드 추가(`firewall-backend=nftables`, Swarm 모드 미지원) | [16장](ch16.md) |
| 2026년 | moby/moby | Go 모듈 경로가 `github.com/moby/moby/v2`로 재편되는 모듈화 진행 | [1장](ch01.md), [10장](ch10.md) |
| 2026년 중반 | Docker Engine 29.5 | Rootless 기본 네트워크 백엔드가 slirp4netns에서 **gvisor-tap-vsock**으로 전환(보안 강화 목적) | [17장](ch17.md) |
| 2026년 9월(현재) | Docker Engine 29.8.1 | 최신 안정 버전. containerd v2.3.x, runc v1.5.x 번들. IPv6는 여전히 opt-in 상태 유지 | [18장](ch18.md) |

## A.2 항목별 상세

### cgroup v2로의 전환 (3장)

cgroup v1의 다중 계층 구조는 리소스 컨트롤러 간 일관성 문제와 관리 복잡성 때문에 오랫동안 비판받아
왔습니다. cgroup v2의 unified hierarchy는 Docker Engine 20.10 전후로 실험적 지원이 시작되었고, systemd가
cgroup v2를 기본으로 채택한 최신 배포판(예: Ubuntu 22.04+, Fedora 최신 버전 계열, Debian 12+)이 널리
보급되면서 자연스럽게 사실상의 표준 환경으로 자리잡았습니다. 3장에서 다룬 것처럼 cgroup v1 환경도 여전히
지원되지만, 신규 환경이라면 cgroup v2를 전제로 설계하는 것이 현재의 기본 노선입니다.

### containerd 2.0의 Sandbox API stable 승격 (5장)

Kubernetes CRI와의 통합, 그리고 VM 기반 샌드박스(Kata Containers 등) 지원을 염두에 두고 설계된
Sandbox API는 containerd 2.0/2.x 계열에서 stable API로 승격되었습니다. 5장에서 다룬 shim v2와 CRI
플러그인 구조가 이 API 위에서 더 명확한 계약을 갖게 되었다는 것이 실무적으로 중요한 지점입니다.

### containerd 이미지 스토어의 기본값 전환, 레거시 graphdriver deprecated (1장/6장)

Docker Engine 29부터는 신규 설치 시 containerd의 콘텐츠 스토어/스냅샷터 기반 이미지 관리 방식이 기본값이
되었습니다. 이는 1장에서 다룬 "containerd가 dockerd의 부속품이 아니라 독립적인 런타임 계층"이라는 흐름의
연장선이며, 6장에서 다룬 overlay2 기반 레거시 graphdriver 경로는 기존 환경과의 호환을 위해 계속
지원되지만 신규 기능 추가보다는 유지보수 위주로 전환되었습니다. 참고로 이 전환은 user namespace remap이
활성화된 환경에서는 호환성 문제로 일시적으로 비활성화되는 예외가 있었으므로, 해당 구성을 쓰는 환경이라면
실제 적용 전 현재 버전 기준의 세부 동작을 다시 확인하는 것이 안전합니다.

### moby/moby의 Go 모듈 재편 (1장/10장)

moby/moby 저장소의 Go 모듈 경로가 `github.com/moby/moby/v2`로 재편되는 모듈화 작업이 진행되었습니다.
1장에서 다룬 dockerd 자체의 코드베이스 구조, 그리고 10장에서 다룬 Moby 프로젝트 생태계(다른 프로젝트가
moby/moby의 컴포넌트를 라이브러리로 가져다 쓰는 방식)에 영향을 주는 변화이며, 이 저장소를 직접 의존성으로
가져다 쓰는 서드파티 도구를 유지보수하고 있다면 import 경로 변경에 유의해야 합니다.

### BuildKit 0.17과 Docker Bake GA (8장/9장/10장)

BuildKit은 2025년 초 0.17 버전대에서 rootless executor 관련 개선을 포함한 업데이트를 거쳤고, 비슷한
시기에 Docker Bake(`docker-bake.hcl` 기반 다중 빌드 오케스트레이션)가 실험 단계를 벗어나 GA(정식 기능)로
전환되었습니다. 8장에서 다룬 LLB 솔버와 프론트엔드 구조, 9장의 멀티플랫폼 빌드, 10장의 Compose/Bake
생태계가 이 시점을 기점으로 한층 더 실무 기본값에 가까워졌다고 볼 수 있습니다. BuildKit 자체는 이후에도
계속 버전이 올라가고 있으므로, 정확한 최신 버전과 세부 변경 내역은 항상 현재 사용 중인 Docker Engine
배포판이 번들하는 BuildKit 버전을 기준으로 확인하는 것을 권장합니다.

### Docker Engine 28의 네트워킹 하드닝 (12장/16장)

Docker Engine 28부터는 `-p`/`--publish`로 명시적으로 게시하지 않은 포트로 들어오는 인바운드 트래픽을
기본적으로 차단하는 방향으로 네트워킹 기본값이 바뀌었습니다. 12장에서 다룬 "Docker가 iptables 규칙을
앞단에 끼워 넣어 사실상 방화벽을 우회한다"는 오래된 통념은 이 변화 이후로는 절반만 맞는 말이 되었습니다.
16장에서 다룬 방화벽 백엔드 자체(iptables/nftables)와는 별개로, "기본 정책이 허용에서 차단 쪽으로
옮겨갔다"는 이 변화의 방향성을 구분해서 기억해둘 필요가 있습니다.

### Docker Engine 29의 실험적 nftables 방화벽 백엔드 (16장)

Docker Engine 29는 `firewall-backend` 데몬 옵션을 통해 `nftables`를 실험적으로 선택할 수 있게 했습니다.
16장에서 다룬 것처럼 이 백엔드는 아직 Swarm 모드를 지원하지 않으며, 마이그레이션 시 커널의 IP 포워딩
설정이 요구사항을 충족하지 못하면 데몬 시작 자체가 실패할 수 있다는 점도 실무에서 자주 부딪히는 지점입니다.

### Rootless 기본 네트워크 백엔드 전환 (17장)

Rootless Docker의 유저스페이스 네트워크 스택은 오랫동안 slirp4netns가 사실상의 기본값이었으나, Docker
25.0 전후로 RootlessKit 기반 pasta가 실험적 대안으로 추가되었고, 최종적으로 **Docker v29.5부터
gvisor-tap-vsock이 신규 기본값**으로 자리잡았습니다. 17장에서 다룬 것처럼 이 전환의 핵심 동기는 성능이
아니라 순수 Go 구현에 따른 메모리 안전성, 즉 보안 강화입니다.

### IPv6의 현재 상태 — 여전히 opt-in (18장)

2026년 9월 현재도 Docker의 IPv6 지원은 데몬 또는 네트워크 단위로 명시적으로 활성화해야 하는 opt-in
기능입니다. 18장에서 다룬 것처럼 `daemon.json`의 `ipv6` 옵션이나 `docker network create --ipv6`가 그
활성화 경로이며, 이 기본값 자체가 바뀌었다는 공식 발표는 이 교재 집필 시점까지 없습니다. 이 항목은
이 부록 전체에서 유일하게 "아직 바뀌지 않은 것"을 명시적으로 못박아두는 항목이기도 합니다.

## A.3 이 표를 읽는 방법

이 표에 정리된 시점들은 대부분 "대략"이라는 단서가 붙어 있습니다. Docker Engine, containerd, BuildKit,
RootlessKit은 각자 독립적인 릴리스 주기를 가진 별개의 프로젝트이고, 어떤 변화가 실험적 기능으로 처음
등장한 시점과 기본값으로 승격된 시점 사이에는 대개 한두 개 마이너 버전만큼의 간격이 있습니다. 따라서
이 표의 목적은 "정확한 버전 번호를 암기하는 것"이 아니라, 본문에서 "2026년 현재"라고 표현한 내용이
독자가 실제로 쓰는 환경의 버전보다 미래의 이야기는 아닌지, 혹은 반대로 독자의 환경에서는 이미 한참 전에
기본값으로 자리잡아 더 이상 특기할 필요가 없는 이야기는 아닌지를 스스로 판단하는 기준점으로 삼는
것입니다. 실제 운영 환경에 적용하기 전에는 반드시 해당 시점 기준 Docker 공식 릴리스 노트를 직접 대조해
확인하시기 바랍니다.
