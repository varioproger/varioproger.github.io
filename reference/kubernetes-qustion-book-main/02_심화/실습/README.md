# 실습 파일 안내

순서와 예상 결과는 [19장](../19_예측하며_배우는_실습.md)에 있다. 이 폴더 전체를 한꺼번에 apply하지 않는다. 기본 배포 후 선택 실험을 하나씩 적용하고 되돌린다.

| 경로 | 목적 |
|---|---|
| `app/` | 버전·Pod 이름·설정 값을 응답하는 Python 표준 라이브러리 HTTP 앱과 Dockerfile |
| `base/00-namespace.yaml` | `study` Namespace |
| `base/10-orders.yaml` | ServiceAccount, ConfigMap, Deployment, Service |
| `optional/hpa.yaml` | 메트릭 제공 체계가 있을 때 HPA 관찰 |
| `optional/pdb.yaml` | 자발적 중단 예산의 계산 관찰 |
| `optional/network-policy.yaml` | 집행 가능한 네트워크 구현에서 허용된 client만 ingress 허용 |
| `optional/rbac.yaml` | ServiceAccount에 Pod 조회만 허용 |
| `aws/ingress.yaml.example` | 일반 EKS + AWS Load Balancer Controller의 내부 ALB 읽기 예제 |
| `aws/storage.yaml.example` | 일반 EBS CSI의 StorageClass·PVC 읽기 예제 |

기본 실습은 Docker의 Linux 컨테이너 실행 환경, kind, kubectl을 준비한 별도 로컬 클러스터를 전제로 한다. 기본 image는 로컬 빌드 후 kind 노드에 적재한다. EKS에서는 이 이미지를 ECR 등의 접근 가능한 레지스트리에 올리고 Deployment의 주소를 바꿔야 한다.

AWS 예제는 확장자를 `.example`로 두었다. 계정의 controller·IAM·subnet·DNS 등 준비 없이 실행하는 파일이 아니며, 실제 적용하면 유료 자원이 생성될 수 있다. 이 집필에서는 적용하지 않았다.

앱은 구조 관찰용이다. 외부 의존성·인증·실제 주문 처리·운영용 HTTP 서버 성능·상세 draining은 구현하지 않았다. readiness와 liveness를 구분해서 관찰할 수 있으며, 모든 probe가 같은 성공 기준이라는 오해를 피하도록 `/ready`만 설정에 따라 실패하게 했다.

**검증 결과:** 문서 링크·코드 블록 닫힘, 13개 YAML 객체의 파싱과 주요 참조, 앱의 정상 응답·readiness 503·liveness 200·404 응답을 로컬에서 확인했다. Mermaid 17개는 코드 블록과 구조를 점검했으며 화면 렌더링은 검증하지 않았다. Docker·kind·kubectl이 현재 집필 환경의 PATH에 없어 이미지 빌드와 Kubernetes/EKS 실행 검증은 수행하지 않았다. 학습 환경에서는 심화 19장에 따라 server dry-run과 실제 상태를 확인한다.
