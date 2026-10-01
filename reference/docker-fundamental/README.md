---
title: "Docker 내부구조 · 프레임워크 · 네트워크 완전 정복"
---

# Docker 내부구조 · 프레임워크 · 네트워크 완전 정복

Docker를 사용법이 아니라 **동작 원리**로 이해하기 위한 교재입니다. Linux 커널의 격리 메커니즘부터
containerd/runc로 이어지는 실행 경로, BuildKit 기반 빌드 프레임워크, 그리고 libnetwork부터
nftables 전환까지 이어지는 네트워크 스택을 다룹니다.

## 대상 독자

- `docker run`, `docker build`, `docker compose up`을 실무에서 써봤고, 그 "다음 단계"가 궁금한 개발자/운영자
- 컨테이너 네트워크 장애(포트가 안 열린다, 컨테이너 간 통신이 안 된다, DNS가 안 잡힌다)를 로그 이상으로
  파고들어 원인을 찾아야 하는 SRE/인프라 엔지니어
- Kubernetes를 쓰기 전에 그 기반이 되는 컨테이너 런타임 자체를 이해하고 싶은 사람

## 왜 이 교재가 필요한가

Docker 관련 자료 중 상당수는 2018~2023년 사이에 쓰였고, 그사이 다음과 같은 근본적인 변화가 있었습니다.

- **실행 경로**: `dockerd` → `containerd` → `runc`로 이어지는 구조 자체는 유지되지만, Docker Engine 29부터는
  **containerd의 이미지 스토어가 신규 설치 기본값**이 되어 레거시 graphdriver 경로는 사실상 유지보수 모드로
  전환되었습니다.
- **네트워크 보안 기본값**: Docker Engine 28부터 게시(publish)하지 않은 포트로 들어오는 인바운드 트래픽을
  기본적으로 차단하도록 바뀌었습니다. 과거 "Docker가 방화벽을 무시한다"는 통설은 이제 절반만 맞습니다.
- **방화벽 백엔드**: Docker Engine 29에서 `iptables` 외에 **nftables 네이티브 백엔드**가 실험적으로
  추가되었습니다(단, Swarm 모드 미지원).
- **Rootless 네트워킹**: 오랫동안 기본값이던 `slirp4netns`가 Docker 29.5부터 **gvisor-tap-vsock**로
  교체되었습니다.
- **빌드**: BuildKit이 사실상 유일한 빌드 엔진이 되었고, Bake(`docker-bake.hcl`)가 GA로 전환되었습니다.

이 교재는 이런 변화를 반영해 "지금 기준"으로 다시 정리한 자료입니다. 각 장에서 시간에 따라 바뀐 부분은
"2026년 현재" 식으로 명시적으로 표시해 두었으니, 오래된 자료와 비교할 때 기준점으로 활용하시기 바랍니다.

## 구성

전체 목차는 [00-목차.md](00-목차.md)를 참고하세요. 크게 3부로 구성되어 있습니다.

1. **1부. Docker 내부 아키텍처** — namespaces, cgroups, OCI 스펙, containerd, 스토리지 드라이버
2. **2부. 프레임워크 & 빌드 시스템** — Engine API, BuildKit, Dockerfile, Compose v2, Moby 생태계
3. **3부. 네트워킹** — libnetwork/CNM, 브리지/오버레이/macvlan, DNS, nftables 전환, rootless, IPv6

## 읽는 방법

각 장은 이전 장의 내용을 전제로 쓰였으므로 순서대로 읽는 것을 권장하지만, 이미 기초를 알고 있다면
3부(네트워킹)만 발췌해서 읽어도 무방하도록 필요한 선행 개념은 해당 장에서 짧게 다시 짚어줍니다.

각 장 끝에는 다음 두 섹션이 있습니다.

- **핵심 요약**: 그 장에서 반드시 기억해야 할 내용을 압축한 목록
- **실습**: 실제 리눅스 환경(커널 5.15+ 또는 6.x, Docker Engine 29.x)에서 개념을 직접 확인해보는 명령어

## 전제 환경

- Linux 호스트 (커널 5.15 이상 권장, cgroup v2 unified hierarchy 사용)
- Docker Engine 29.x (containerd 2.3.x, runc 1.5.x 번들)
- 예제 중 일부는 `nsenter`, `ip`, `nft`/`iptables`, `ctr`, `bridge` 등 리눅스 네트워킹/컨테이너 도구에
  대한 root 권한 실행을 전제로 합니다.

## 참고 자료 안내

이 폴더에는 참고용으로 수집한 원서(Docker Up & Running 3rd Ed., Docker Networking Cookbook,
Container Security, Linux Containers and Virtualization 등)가 함께 있습니다. 이 교재의 본문은
해당 원서를 발췌·번역한 것이 아니라, Docker/OCI/containerd 공식 문서와 소스코드, 그리고 2026년
현재 기준 최신 릴리스 노트를 바탕으로 새로 집필한 내용입니다. 원서들은 더 깊은 배경지식이나
실습 예제가 필요할 때 교차 참고용으로 활용하시기 바랍니다.
