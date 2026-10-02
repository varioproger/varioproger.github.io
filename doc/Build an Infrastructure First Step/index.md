---
title: "Docker·K8s 인프라 구축 실습 순서"
nav_order: 6
has_children: true
permalink: /doc/infra-build-first-step/
---

# Docker & Kubernetes 인프라 구축 실습 순서 (First Step)

Docker 컨테이너 빌드업 / Kubernetes 기초&심화(CKA&CKAD) 교재 PDF를 분석해, **인프라를 처음부터 구축하는 순서**로 재배열한 실습 문서입니다.
각 Part는 Step별로 `[목적] → [이론] → [CLI/YAML] → [확인·주의]` 구조이며, 실습에 사용한 CLI를 모두 포함합니다.

> 문서 안의 비밀번호·키·계정 ID 등은 `<PASSWORD>`, `<AWS_ACCOUNT_ID>` 같은 자리표시자로 바꿨습니다. 실습 시 본인 환경의 값으로 바꿔 사용하세요.

| 순서 | 문서 | 내용 |
|---|---|---|
| 0 | [전체 구축 순서 (목차)](00_인프라_구축_순서_목차.md) | 전체 로드맵과 구축 흐름 요약 |
| 1 | [Part 01. Docker 기초 환경 구축](Part01_Docker_기초환경구축.md) | VirtualBox/Ubuntu → Docker 엔진 설치·업데이트 → Portainer, 기본 CLI |
| 2 | [Part 02. 이미지 · CLI · 네트워크](Part02_Docker_이미지_CLI_네트워크.md) | 이미지/Registry → 컨테이너 CLI → 네트워크·DNS → Nginx/HAProxy |
| 3 | [Part 03. 리소스 · 볼륨 · Dockerfile](Part03_Docker_리소스_볼륨_Dockerfile.md) | 모니터링 → CPU/Mem/Disk 제한 → volume → Dockerfile |
| 4 | [Part 04. Compose · Swarm · CI](Part04_Docker_Compose_Swarm_CI.md) | docker compose → Swarm → GitHub Actions |
| 5 | [Part 05. AWS ECS · Jenkins CI/CD](Part05_AWS_ECS_CICD_프로젝트.md) | ECR/ECS → Jenkins → 3-Tier 프로젝트 |
| 6 | [Part 06. K8s 클러스터 구축 · 관리도구](Part06_K8s_클러스터구축_관리도구.md) | kubeadm 클러스터/Calico → EKS → Dashboard·Grafana·k9s |
| 7 | [Part 07. K8s 아키텍처 · Pod · Service](Part07_K8s_아키텍처_Pod_Service.md) | 아키텍처 → Pod → Service/MetalLB/Ingress |
| 8 | [Part 08. K8s 볼륨 · 설정 · 워크로드](Part08_K8s_볼륨_설정_워크로드.md) | PV/PVC → ConfigMap/Secret → Deployment 등 · HPA |
| 9 | [Part 09. K8s 네임스페이스 · 보안 · 운영](Part09_K8s_네임스페이스_보안_운영.md) | Quota/LimitRange → RBAC/NetworkPolicy → 노드 운영·업그레이드 |
