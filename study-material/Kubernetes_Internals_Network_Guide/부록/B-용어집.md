---
title: "부록 B. 용어집"
---

# 부록 B. 용어집

한영 대조. 관련 장을 함께 표기했다.

## 내부 아키텍처 (1~6장)

| 한글 | 영문 | 설명 |
|---|---|---|
| 조정 루프 | Reconcile loop | 관찰(observe) → 비교(diff) → 조치(act)를 반복하는 컨트롤러의 기본 동작 방식 (1, 5장) |
| 레벨 트리거 | Level-triggered | "무엇이 바뀌었나"가 아니라 "지금 상태가 어떤가"로 판단하는 방식. 이벤트 유실에 강하다 (1, 5장) |
| 엣지 트리거 | Edge-triggered | 개별 이벤트에 반응하는 방식. 이벤트를 놓치면 영구히 처리되지 않을 수 있다 (1, 5장) |
| 필터 체인 | Filter chain | API 서버가 요청을 처리하기 전 거치는 인증·감사·APF·인가 등의 미들웨어 체인 (2장) |
| 버전 변환 허브 모델 | Hub-and-spoke conversion | 내부 버전을 허브로 삼아 N개 버전을 2N개 변환 함수로 처리하는 방식 (2장) |
| 어그리게이션 계층 | Aggregation layer | apiserver가 자신이 아닌 별도 서버로 요청을 프록시하는 확장 방식 (2, 12장) |
| watch cache | Watch cache | apiserver 메모리에 유지되는 순환 버퍼. etcd watch 하나를 다수 클라이언트에 fan-out한다 (2장) |
| API 우선순위와 공정성 | API Priority and Fairness (APF) | 요청을 FlowSchema로 분류하고 PriorityLevelConfiguration별 큐에 배분하는 과부하 제어 메커니즘 (2장) |
| Raft 합의 | Raft consensus | etcd가 사용하는 분산 합의 알고리즘. 리더 선출과 로그 복제로 안전성을 보장한다 (3장) |
| MVCC | Multi-Version Concurrency Control | etcd가 모든 쓰기를 새 리비전으로 기록하는 방식. 압축 전까지 이전 리비전도 조회 가능 (3장) |
| 압축 | Compaction | etcd에서 오래된 리비전을 제거해 저장 공간을 회수하는 작업 (3장) |
| 조각 모음 | Defragmentation | 압축 후 흩어진 디스크 공간을 재정리하는 작업 (3장) |
| 스케줄링 프레임워크 | Scheduling Framework | Filter/Score/Bind 등 확장점으로 구성된 kube-scheduler의 플러그인 아키텍처 (4, 12장) |
| 선점 | Preemption | 높은 우선순위 Pod를 위해 낮은 우선순위 Pod를 축출하는 스케줄러 동작 (4장) |
| Informer | Informer | Reflector-DeltaFIFO-Indexer로 구성된 client-go의 로컬 캐시·이벤트 통지 메커니즘 (5, 8장) |
| DeltaFIFO | DeltaFIFO | Informer 내부에서 변경 사항을 순서대로 보관하는 큐 자료구조 (5장) |
| 워크큐 | Workqueue | 조정이 필요한 키를 담는 큐. 중복 제거와 레이트 리밋을 내장한다 (5, 8장) |
| 리더 선출 | Leader election | HA 구성에서 컴포넌트 복제본 중 하나만 활성화되도록 하는 메커니즘. Lease 오브젝트 기반 (5장) |
| 가비지 컬렉터 | Garbage Collector (GC) | ownerReferences 기반으로 소유자가 사라진 자식 리소스를 정리하는 컨트롤러 (5장) |
| 파이널라이저 | Finalizer | 리소스 삭제를 컨트롤러의 정리 작업이 끝날 때까지 막는 메타데이터 필드 (5장) |
| PLEG | Pod Lifecycle Event Generator | kubelet이 컨테이너 런타임 상태를 주기적으로 relist해 이벤트를 생성하는 메커니즘 (6장) |
| CRI | Container Runtime Interface | kubelet과 컨테이너 런타임 사이의 gRPC 인터페이스 (6장) |
| static Pod | Static Pod | kubelet이 매니페스트 디렉터리를 직접 감시해 실행하는, apiserver 없이도 뜨는 Pod (6장) |

## 프레임워크 (7~12장)

| 한글 | 영문 | 설명 |
|---|---|---|
| ClientSet | Clientset | 코드로 생성된 타입 세이프 API 클라이언트 (8장) |
| 동적 클라이언트 | Dynamic client | GVK를 몰라도 unstructured 오브젝트로 다룰 수 있는 클라이언트 (8장) |
| Lister/Indexer | Lister / Indexer | Informer 캐시를 읽기 전용으로 조회하거나 커스텀 인덱스로 조회하는 인터페이스 (8장) |
| CRD | CustomResourceDefinition | 사용자 정의 리소스 타입을 apiserver에 등록하는 오브젝트 (9장) |
| 서브리소스 | Subresource | `/status`, `/scale`처럼 본체와 별도로 RBAC·쓰기 경로가 분리된 하위 API (9장) |
| 컨버전 웹훅 | Conversion webhook | CRD의 여러 버전 간 스키마 차이를 처리하는 웹훅 (9장) |
| controller-runtime | controller-runtime | Manager/Controller/Reconciler 추상화를 제공하는 오퍼레이터 개발 라이브러리 (10장) |
| Kubebuilder | Kubebuilder | controller-runtime 기반 스캐폴딩·코드 생성 도구 (10장) |
| Condition 패턴 | Condition pattern | status에 Type/Status/Reason/Message 구조로 상태를 표준화해 기록하는 관례 (10장) |
| envtest | envtest | 실제 apiserver+etcd 바이너리만으로 통합 테스트를 수행하는 도구 (10장) |
| 어드미션 웹훅 | Admission webhook | 오브젝트 생성/수정 시 apiserver가 외부 서버에 검증/변형을 위임하는 메커니즘 (11장) |
| AdmissionReview | AdmissionReview | 어드미션 웹훅이 주고받는 요청/응답 오브젝트 (11장) |
| ValidatingAdmissionPolicy | ValidatingAdmissionPolicy | CEL 표현식으로 apiserver 내부에서 직접 검증을 수행하는, 웹훅의 대안 (11장) |
| APIService | APIService | 어그리게이션 계층에서 특정 API 그룹을 어느 서비스가 제공하는지 등록하는 오브젝트 (2, 12장) |

## 네트워크 (13~19장)

| 한글 | 영문 | 설명 |
|---|---|---|
| CNI | Container Network Interface | 컨테이너 런타임과 네트워크 플러그인 사이의 스펙. ADD/DEL/CHECK 동작을 정의한다 (13장) |
| IPAM | IP Address Management | Pod IP 할당을 담당하는 CNI 서브 플러그인 (13장) |
| 오버레이 네트워크 | Overlay network | VXLAN 등으로 캡슐화해 L3 연결성 없이도 Pod 간 통신을 구현하는 방식 (13장) |
| 네이티브 라우팅 | Native routing | BGP 등으로 실제 라우팅 테이블을 전파해 캡슐화 없이 통신하는 방식 (13장) |
| EndpointSlice | EndpointSlice | Service의 백엔드 Pod 목록을 샤딩해서 담는 오브젝트. 구 Endpoints를 대체 (14장) |
| 헤드리스 서비스 | Headless Service | `clusterIP: None`. DNS가 Pod IP를 직접 반환한다 (14장) |
| externalTrafficPolicy | externalTrafficPolicy | 외부 트래픽을 로컬 노드의 Pod로만 보낼지(`Local`) 클러스터 전체로 보낼지(`Cluster`) 결정 (14장) |
| kube-proxy | kube-proxy | Service/EndpointSlice를 감시해 노드의 데이터플레인(iptables/IPVS/nftables)을 프로그래밍하는 데몬 (6, 15장) |
| IPVS | IP Virtual Server | 커널의 L4 로드밸런싱 모듈. kube-proxy의 대체 데이터플레인 모드 (15장) |
| nftables | nftables | iptables를 대체하는 차세대 리눅스 패킷 필터링 프레임워크 (15장) |
| CoreDNS | CoreDNS | 플러그인 체인 기반의 클러스터 DNS 서버 (16장) |
| ndots | ndots | 리졸버가 search domain을 시도하기 전 필요한 점(.) 개수 기준값 (16장) |
| NodeLocal DNSCache | NodeLocal DNSCache | 노드별 DNS 캐시 데몬. 중앙 CoreDNS 부하와 conntrack 경쟁을 줄인다 (16장) |
| Gateway API | Gateway API | GatewayClass/Gateway/HTTPRoute로 역할을 분리한 차세대 L7 라우팅 API (17장) |
| 서비스 메시 | Service mesh | 사이드카 프록시로 mTLS·트래픽 제어·관측성을 구현하는 인프라 계층 (17장) |
| 앰비언트 메시 | Ambient mesh | 사이드카 없이 노드 공유 프록시(ztunnel)로 구현하는 메시 아키텍처 (17장) |
| NetworkPolicy | NetworkPolicy | Pod 간 허용 트래픽을 정의하는 스펙. 자체 구현이 없고 CNI가 실제로 강제한다 (18장) |
| AdminNetworkPolicy | AdminNetworkPolicy | 클러스터 관리자가 네임스페이스 정책보다 우선하는 전역 규칙을 설정하는 API (18장) |
| eBPF | extended Berkeley Packet Filter | 커널 모듈 없이 검증된 프로그램을 커널 훅에서 실행하는 기술. Cilium의 기반 (19장) |
| XDP | eXpress Data Path | NIC 드라이버 직후 가장 이른 지점에서 패킷을 처리하는 eBPF 훅 (19장) |
| kube-proxy replacement | kube-proxy replacement | Cilium 등이 eBPF로 kube-proxy의 서비스 라우팅 기능을 완전히 대체하는 모드 (19장) |
| Hubble | Hubble | Cilium의 플로우 레벨 관측 도구 (19장) |
