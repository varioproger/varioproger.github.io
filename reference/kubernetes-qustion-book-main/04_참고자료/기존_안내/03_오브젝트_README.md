> 보존된 이전 안내문입니다. 아래 읽기 경로·문서 번호·작업 이력은 이전 편집 당시 기준입니다. 현재 학습 순서는 [전체 목차](../../README.md)를 따릅니다. PDF 원본은 현재 저장소에 없습니다.

# Kubernetes 오브젝트 상세 해설서

**Kubernetes API에 저장되는 오브젝트만 중심으로 읽는 별도 해설서**다. 각 오브젝트를 “왜 필요한가 → 무엇을 적는가 → 누가 처리하는가 → 무엇과 연결되는가 → 어떤 상태를 확인하는가” 순서로 설명한다. 기존 심화편의 짧은 사전을 확장해 주요 필드와 변경·삭제 동작까지 넣었다.

**49종의 오브젝트를 개별 항목으로 설명하며, 39개 YAML 예제와 6개 관계도를 포함한다.**

## 먼저 읽을 곳

처음이라면 [02. 공통 구조](../../02_심화/02_오브젝트의_공통_구조.md) → [Pod·Deployment](../../02_심화/04_실행_오브젝트.md) → [Service](../../02_심화/07_통신_오브젝트.md) → [ConfigMap·PVC](../../02_심화/09_설정과_저장소_오브젝트.md) 순서로 읽는다. 이후에는 이름을 찾아 필요한 항목만 읽어도 된다.

| 분류 | 상세 설명하는 오브젝트 |
|---|---|
| [02. 공통 구조](../../02_심화/02_오브젝트의_공통_구조.md) | metadata·spec·status, 이름·UID, label·selector, 소유·참조·삭제의 원리 |
| [04. 실행](../../02_심화/04_실행_오브젝트.md) | Pod, ReplicaSet, Deployment, StatefulSet, DaemonSet, Job, CronJob, ControllerRevision |
| [07. 통신](../../02_심화/07_통신_오브젝트.md) | Service, EndpointSlice, Ingress, IngressClass, NetworkPolicy |
| [09. 설정과 저장소](../../02_심화/09_설정과_저장소_오브젝트.md) | ConfigMap, Secret, PersistentVolumeClaim, PersistentVolume, StorageClass, VolumeAttachment, CSIDriver, CSINode |
| [11. 신원과 권한](../../02_심화/11_신원과_권한_오브젝트.md) | ServiceAccount, Role, RoleBinding, ClusterRole, ClusterRoleBinding |
| [14. 자원과 가용성](../../02_심화/14_자원과_가용성_오브젝트.md) | HorizontalPodAutoscaler, PodDisruptionBudget, ResourceQuota, LimitRange, PriorityClass, RuntimeClass |
| [12. 클러스터와 확장](../../02_심화/12_클러스터와_확장_오브젝트.md) | Namespace, Node, Lease, Event, CustomResourceDefinition, admission 관련 객체 |
| [17. 추가 설치하는 오브젝트](../../02_심화/17_추가_설치하는_오브젝트.md) | GatewayClass, Gateway, HTTPRoute, ReferenceGrant, VolumeSnapshot 계열, VerticalPodAutoscaler |

### 자주 찾는 오브젝트로 바로 이동

- 실행: [Pod](../../02_심화/04_실행_오브젝트.md#pod) · [ReplicaSet](../../02_심화/04_실행_오브젝트.md#replicaset) · [Deployment](../../02_심화/04_실행_오브젝트.md#deployment) · [StatefulSet](../../02_심화/04_실행_오브젝트.md#statefulset) · [DaemonSet](../../02_심화/04_실행_오브젝트.md#daemonset) · [Job](../../02_심화/04_실행_오브젝트.md#job) · [CronJob](../../02_심화/04_실행_오브젝트.md#cronjob)
- 통신: [Service](../../02_심화/07_통신_오브젝트.md#service) · [EndpointSlice](../../02_심화/07_통신_오브젝트.md#endpointslice) · [Ingress](../../02_심화/07_통신_오브젝트.md#ingress) · [NetworkPolicy](../../02_심화/07_통신_오브젝트.md#networkpolicy)
- 설정·데이터: [ConfigMap](../../02_심화/09_설정과_저장소_오브젝트.md#configmap) · [Secret](../../02_심화/09_설정과_저장소_오브젝트.md#secret) · [PVC](../../02_심화/09_설정과_저장소_오브젝트.md#persistentvolumeclaim) · [PV](../../02_심화/09_설정과_저장소_오브젝트.md#persistentvolume) · [StorageClass](../../02_심화/09_설정과_저장소_오브젝트.md#storageclass)
- 권한: [ServiceAccount](../../02_심화/11_신원과_권한_오브젝트.md#serviceaccount) · [Role](../../02_심화/11_신원과_권한_오브젝트.md#role) · [RoleBinding](../../02_심화/11_신원과_권한_오브젝트.md#rolebinding) · [ClusterRole](../../02_심화/11_신원과_권한_오브젝트.md#clusterrole) · [ClusterRoleBinding](../../02_심화/11_신원과_권한_오브젝트.md#clusterrolebinding)
- 자원·범위: [HPA](../../02_심화/14_자원과_가용성_오브젝트.md#horizontalpodautoscaler) · [PDB](../../02_심화/14_자원과_가용성_오브젝트.md#poddisruptionbudget) · [ResourceQuota](../../02_심화/14_자원과_가용성_오브젝트.md#resourcequota) · [LimitRange](../../02_심화/14_자원과_가용성_오브젝트.md#limitrange) · [Namespace](../../02_심화/12_클러스터와_확장_오브젝트.md#namespace) · [Node](../../02_심화/12_클러스터와_확장_오브젝트.md#node)

## 이 문서에서 말하는 오브젝트

Pod·Service·Deployment는 **API에 저장되는 기록**이다. kubelet·scheduler·containerd는 그 기록을 처리하는 프로그램이다. 오브젝트의 동작을 설명할 때 필요한 만큼 프로그램 이름을 함께 사용하지만, 프로그램을 오브젝트로 분류하지 않는다.

컨테이너, probe, volumeMount, affinity, securityContext는 일반적으로 **Pod 내부의 설정 항목**이다. 독립적인 `kind: Probe`나 `kind: Container` 오브젝트를 만들어 배포하는 구조가 아니다. `spec`은 필드이고, `Service`는 오브젝트 종류라는 수준 차이도 구분한다.

여기서 **N은 Namespace 범위**, **C는 클러스터 범위**다. 같은 Namespace에 있는 객체끼리도 소유 관계가 자동으로 생기는 것은 아니다.

## 예제와 출처

YAML은 필드 관계를 읽기 위한 예제다. `study` Namespace, `registry.example.com` 이미지, `demo` class, `driver.example.com` 등은 필요한 환경을 준비하거나 실제 값으로 바꿔야 한다. 예제들을 한꺼번에 적용하는 설치 패키지가 아니다. 시스템이 자동 생성하는 객체는 작성 예제 대신 조회할 필드를 설명한다.

공식 문서 확인일은 **2026-09-06**이며, 각 항목 끝에 직접 링크를 붙였다. 기본 오브젝트와 추가 CRD를 분리했다. 사용하는 클러스터 버전과 설치된 구현에 따라 지원 필드가 달라질 수 있으므로 `kubectl explain`과 해당 버전의 API 문서를 대조한다. 이 책은 핵심 오브젝트와 자주 만나는 보조 오브젝트를 다루며 전체 Kubernetes API의 모든 종류·필드를 열거하지는 않는다.

**검증 범위:** 로컬 문서 링크·코드 블록, YAML 파싱, 예제의 주요 selector·포트·객체 참조를 검사했다. 실제 Kubernetes API schema 검증·클러스터 적용·Mermaid 화면 렌더링은 수행하지 않았다.

[기존 Kubernetes·EKS 심화편](../../02_심화/README.md) · [전체 학습자료](../../README.md)
