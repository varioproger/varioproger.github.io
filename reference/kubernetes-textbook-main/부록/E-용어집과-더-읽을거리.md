---
title: "부록 E. 용어집과 더 읽을거리"
---

# 부록 E. 용어집과 더 읽을거리

---

## E.1 용어집

> 한국어 문헌에서 번역이 갈리는 용어가 많다. 이 책은 **원어를 그대로 쓰는 것을 기본**으로 하되, 개념어는 한국어를 병기했다.

### 핵심 개념

| 용어 | 원어 | 설명 | 장 |
|---|---|---|---|
| **조정 루프** | reconciliation loop | 원하는 상태와 현재 상태를 비교해 차이를 줄이는 반복. 쿠버네티스의 근본 원리 | 1.3, 21.3 |
| **선언적** | declarative | 절차가 아니라 결과 상태를 기술하는 방식 | 1.3 |
| **레벨 트리거** | level-triggered | "무엇이 바뀌었나"가 아니라 "지금 상태가 어떤가"로 판단. 이벤트를 놓쳐도 복구된다 | 21.3 |
| **멱등성** | idempotency | 같은 조작을 여러 번 해도 결과가 같은 성질 | 27.4 |
| **인프라 드리프트** | infrastructure drift | 동일해야 할 시스템이 시간이 지나며 벌어지는 현상 | 1.1 |
| **블래스트 레이디어스** | blast radius | 침해나 장애가 번지는 범위 | 18.1 |
| **컨트롤 플레인 / 데이터 플레인** | control plane / data plane | 결정하는 쪽 / 실행하는 쪽 | 1.4 |

### 오브젝트

| 용어 | 설명 | 장 |
|---|---|---|
| **Pod** | NET·IPC·UTS를 공유하고 MNT·PID는 분리한 컨테이너 그룹. 최소 배포 단위 | 5 |
| **pause 컨테이너** | Pod의 네임스페이스를 소유하고 좀비를 수거하는 인프라 컨테이너 | 19.2 |
| **사이드카** | sidecar. 메인 컨테이너의 기능을 보조하는 컨테이너 | 5.6 |
| **앰배서더** | ambassador. 외부로 나가는 연결을 대리하는 컨테이너 | 5.6 |
| **어댑터** | adapter. 외부에 보이는 형식을 변환하는 컨테이너 | 5.6 |
| **ownerReferences** | 소유 관계. 부모 삭제 시 자식도 삭제(가비지 컬렉션)되는 근거 | 4.2 |
| **파이널라이저** | finalizer. 정리 작업이 끝날 때까지 삭제를 막는 장치 | 4.2 |
| **resourceVersion** | 낙관적 동시성 제어와 watch 재개에 쓰이는 버전 문자열 | 4.2 |
| **CRD** | CustomResourceDefinition. 새 리소스 종류를 정의하는 리소스 | 26 |
| **오퍼레이터** | operator. CRD + 컨트롤러로 앱의 운영 지식을 인코딩한 것 | 24.3 |

### 스케줄링과 리소스

| 용어 | 설명 | 장 |
|---|---|---|
| **requests / limits** | 스케줄러가 보는 값 / 커널이 강제하는 값 | 14.1 |
| **Allocatable** | 노드 용량에서 시스템 예약분을 뺀, 워크로드가 쓸 수 있는 양 | 14.1 |
| **QoS 클래스** | Guaranteed / Burstable / BestEffort. 축출 우선순위를 결정 | 14.2 |
| **압축 가능 자원** | compressible. CPU처럼 초과 시 대기시킬 수 있는 자원 | 14.3 |
| **스로틀링** | throttling. CPU 한도 초과 시 대기시키는 것 | 14.3 |
| **OOMKilled** | 메모리 한도 초과로 커널이 프로세스를 종료한 상태 (exitCode 137) | 14.3 |
| **축출** | eviction. 노드 자원 부족 시 kubelet이 Pod를 내보내는 것 | 14.4 |
| **테인트 / 톨러레이션** | taint / toleration. 노드가 거부 / Pod가 그 거부를 감내 | 15.4 |
| **어피니티 / 안티어피니티** | affinity / anti-affinity. 끌어당김 / 밀어냄 | 15.2, 15.3 |
| **토폴로지 분산 제약** | topologySpreadConstraints. 도메인 간 균등 배치 | 15.5 |
| **선점** | preemption. 고우선순위 Pod가 저우선순위 Pod를 밀어내는 것 | 15.6 |
| **오버커밋** | overcommit. requests 합보다 limits 합이 큰 상태 | 14.5 |
| **빈 패킹** | bin packing. 노드를 꽉 채워 배치하는 전략 | 15.8 |

### 네트워크

| 용어 | 설명 | 장 |
|---|---|---|
| **ClusterIP** | 어떤 인터페이스에도 붙어 있지 않은 가상 IP | 9.1 |
| **EndpointSlice** | Service 뒤의 Ready인 Pod IP 목록 (100개 단위로 분할) | 9.3 |
| **헤드리스 서비스** | headless. `clusterIP: None`. DNS가 모든 Pod IP를 반환 | 9.4 |
| **CNI** | Container Network Interface. Pod에 네트워크를 붙이는 플러그인 규격 | 23.1 |
| **오버레이** | overlay. Pod 패킷을 노드 간 패킷에 캡슐화하는 방식 (VXLAN 등) | 23.2 |
| **MTU** | 최대 전송 단위. 오버레이에서 줄어들어 큰 전송이 실패하는 원인 | 23.5 |
| **conntrack** | 커널의 연결 추적 테이블. 고갈되면 새 연결이 거부된다 | 23.4 |
| **ndots** | 짧은 이름에 search 도메인을 붙여 볼 기준. 기본 5가 성능 문제의 원인 | 10.3 |
| **남북 / 동서 트래픽** | north-south / east-west. 외부↔클러스터 / 서비스↔서비스 | 11.6 |
| **인그레스** | ingress. L7 라우팅. 리소스와 컨트롤러는 다른 것 | 11.1 |
| **서비스 메시** | service mesh. 사이드카 프록시로 동서 트래픽을 제어 | 11.6 |

### 스토리지

| 용어 | 설명 | 장 |
|---|---|---|
| **PV / PVC** | 실제 스토리지 조각 / 그에 대한 요청 | 12.2 |
| **StorageClass** | 스토리지의 "종류" 정의. 동적 프로비저닝의 기준 | 12.2 |
| **동적 프로비저닝** | dynamic provisioning. PVC를 보고 PV를 자동 생성 | 12.2 |
| **접근 모드** | RWO(하나의 **노드**) / ROX / RWX / RWOP(하나의 Pod) | 12.3 |
| **회수 정책** | reclaimPolicy. PVC 삭제 시 Delete(데이터 삭제) / Retain(보존) | 12.3 |
| **CSI** | Container Storage Interface. 스토리지 드라이버 표준 | 12.4 |
| **volumeBindingMode** | Immediate / WaitForFirstConsumer(멀티 AZ에서 사실상 필수) | 12.2 |

### 보안

| 용어 | 설명 | 장 |
|---|---|---|
| **RBAC** | Role-Based Access Control. Role × Binding 조합 | 17.3 |
| **어드미션** | admission. 인가 후 저장 전에 요청을 변형·검증하는 단계 | 17.5 |
| **PSA** | Pod Security Admission. 네임스페이스 라벨로 privileged/baseline/restricted 적용 | 18.3 |
| **워크로드 아이덴티티** | workload identity. SA 토큰을 클라우드 자격증명으로 교환. 정적 키를 없앤다 | 17.4 |
| **capability** | root 권한을 40여 개로 쪼갠 것 | 2.4, 18.2 |
| **seccomp** | 시스템콜 필터링 | 18.2 |
| **SBOM** | Software Bill of Materials. 이미지에 무엇이 들어 있는지의 명세 | 18.5 |
| **키리스 서명** | keyless signing. 장기 키 없이 OIDC 신원으로 서명 (Cosign) | 18.5 |
| **샌드박스 런타임** | gVisor, Kata 등 커널 노출을 줄인 런타임 | 2.1, 18.3 |

### 운영

| 용어 | 설명 | 장 |
|---|---|---|
| **PDB** | PodDisruptionBudget. 자발적 중단 시 동시에 내릴 수 있는 수 | 32.3 |
| **drain / cordon** | 노드에서 Pod를 빼내기 / 새 스케줄만 막기 | 32.3 |
| **자발적 / 비자발적 중단** | voluntary / involuntary disruption. PDB는 전자만 제어 | 32.3 |
| **버전 스큐** | version skew. 컴포넌트 간 허용되는 버전 차이 | 32.2 |
| **RTO / RPO** | 복구 목표 시간 / 복구 시점 목표 | 32.4 |
| **GitOps** | Git을 진실의 원천으로 삼고 에이전트가 지속적으로 조정 | 30.4 |
| **프로그레시브 딜리버리** | 메트릭을 보고 자동 승격·롤백하는 배포 | 30.5 |
| **SLI / SLO** | 서비스 수준 지표 / 목표 | 31.5 |
| **에러 예산 / 번 레이트** | error budget / burn rate. 허용 실패량 / 그 소진 속도 | 31.5 |
| **RED / USE** | Rate·Errors·Duration(서비스) / Utilization·Saturation·Errors(리소스) | 31.7 |
| **꼬리 샘플링** | tail sampling. 트레이스 완료 후 보관 여부를 결정 | 31.4 |

### 리눅스 기반

| 용어 | 설명 | 장 |
|---|---|---|
| **네임스페이스(리눅스)** | 시스템 자원의 뷰를 분리. PID/NET/MNT/UTS/IPC/USER/CGROUP/TIME | 2.4, 19.1 |
| **cgroup** | 프로세스 그룹의 자원 사용량 제한·측정 | 2.4, 19.4 |
| **PSI** | Pressure Stall Information. 자원 경합으로 인한 지연을 정량화 | 19.4 |
| **overlayfs** | 여러 레이어를 하나의 파일 시스템으로 합치는 union FS | 2.4, 19.5 |
| **copy-up / whiteout** | 하위 레이어 파일 수정 시 복사 / 삭제 표시 | 19.5 |
| **setns** | 기존 네임스페이스에 합류하는 시스템콜. Pod의 핵심 | 19.1 |
| **eBPF** | 커널에서 안전하게 프로그램을 실행하는 기술. Cilium의 기반 | 23.3 |

### 번역이 갈리는 용어

| 원어 | 이 책 | 다른 번역 |
|---|---|---|
| Deployment | 디플로이먼트 / Deployment | 배포(❌ 혼동 유발) |
| Ingress | 인그레스 / Ingress | 수신, 유입 |
| Namespace | 네임스페이스 | 이름공간 |
| Node | 노드 | 노드 |
| Label | 라벨 | 레이블 |
| Taint | 테인트 | 오염, 얼룩 |
| Toleration | 톨러레이션 | 용인, 감내 |
| Eviction | 축출 | 퇴거, 방출 |
| Draining | 드레인 | 비우기, 배출 |
| Reconciliation | 조정 | 재조정, 화해 |
| Rollout | 롤아웃 | 출시, 전개 |
| Probe | 프로브 | 검사, 탐침 |

---

## E.2 이 책의 원서

이 책은 다음 네 권을 재구성했다.

| 원서 | 이 책에서의 역할 | 원서를 더 볼 만한 이유 |
|---|---|---|
| **Kubernetes in Action, 2nd Ed.**<br>Marko Luksa (Manning) | 개념 설명의 기준선. 1~3부 서술 톤 | 설명의 명료함이 독보적. 처음 배우는 사람에게 최고 |
| **The Kubernetes Bible**<br>Kebbani, Tylenda, McKendrick (Packt) | 실무 폭. 설치~운영의 뼈대 | 3대 클라우드 실습이 상세 |
| **Core Kubernetes**<br>Vyas, Love (Manning) | 내부 동작. 5부 | 리눅스 프리미티브부터 파고드는 유일한 책 |
| **Programming Kubernetes**<br>Hausenblas, Schimanski (O'Reilly) | 확장·개발. 6부 | client-go와 API Machinery의 결정판 |

**이 책이 원서 대비 새로 쓴 부분** (2021~2022년 이후 변화)

```
GitOps (Argo CD, Flux)                       30.4절
Gateway API                                  11.5절
OpenTelemetry, Loki, SLO 기반 알림             31장
Karpenter, KEDA                              16장
Pod Security Admission (PSP 후계)             18.3절
ValidatingAdmissionPolicy (CEL)              17.5, 26.2절
Sigstore/Cosign 공급망 보안                    18.5절
정식 사이드카 (initContainers + Always)         5.5절
cgroup v2, PSI                               19.4절
eBPF 데이터 플레인 (Cilium)                    23.3절
Crossplane, vCluster, HNC                    13.6, 29.7절
프로그레시브 딜리버리                            30.5절
트러블슈팅 플레이북                              32.5절
```

---

## E.3 공식 문서와 명세

| 자원 | 용도 |
|---|---|
| [kubernetes.io/docs](https://kubernetes.io/docs/) | 공식 문서. 개념·튜토리얼·레퍼런스 |
| [API 레퍼런스](https://kubernetes.io/docs/reference/kubernetes-api/) | 모든 필드의 정의 |
| [kubernetes/enhancements (KEP)](https://github.com/kubernetes/enhancements) | 기능이 왜 그렇게 설계됐는지. **가장 깊은 자료** |
| [CHANGELOG](https://github.com/kubernetes/kubernetes/tree/master/CHANGELOG) | 릴리스별 변경. **"Urgent Upgrade Notes" 필독** |
| [kubernetes/community](https://github.com/kubernetes/community) | SIG 목록, 설계 문서 |
| [OCI 명세](https://github.com/opencontainers) | 이미지·런타임·배포 표준 |
| [CNI 명세](https://github.com/containernetworking/cni/blob/main/SPEC.md) | 23장의 근거 |
| [CSI 명세](https://github.com/container-storage-interface/spec) | 12장의 근거 |

> **KEP를 읽는 습관을 권한다.** "왜 이렇게 만들었는가"가 적혀 있어, 기능의 한계와 의도를 정확히 알 수 있다. 예: 정식 사이드카는 [KEP-753](https://github.com/kubernetes/enhancements/issues/753).

---

## E.4 도구 목록

### 필수

```bash
kubectl krew install ctx ns tree neat stern who-can view-secret

kubectx / kubens        # 컨텍스트·네임스페이스 전환
kube-ps1                # 프롬프트에 현재 컨텍스트 표시 (사고 예방)
k9s                     # 터미널 UI. 클러스터 탐색이 매우 빠르다
stern                   # 여러 Pod 로그 동시 스트리밍
```

### 진단

| 도구 | 용도 | 장 |
|---|---|---|
| `nicolaka/netshoot` | 네트워크 진단 컨테이너 (dig, curl, tcpdump, nmap) | 3.4 |
| `crictl` | CRI 직접 조작. kubectl이 안 될 때 | 20.3 |
| `sonobuoy` | 클러스터 적합성 검증 | 23.6 |
| `kubectl-debug` | 셸 없는 이미지 디버깅 (내장) | 5.3 |
| `popeye` | 클러스터 설정 점검 |  |
| `kube-capacity` | 노드별 리소스 요약 | 14 |

### 개발·확장

| 도구 | 용도 | 장 |
|---|---|---|
| `kubebuilder` | 오퍼레이터 스캐폴딩 | 27.3 |
| `operator-sdk` | Go/Ansible/Helm 오퍼레이터 | 27.5 |
| `controller-gen` | CRD·RBAC 매니페스트 생성 | 27.1 |
| `envtest` | 실제 API 서버로 통합 테스트 | 27.4 |
| `kopf` | Python 오퍼레이터 | 27.5 |

### 배포

| 도구 | 용도 | 장 |
|---|---|---|
| `helm` + `helm-diff` | 패키징, 변경 미리보기 | 30.1 |
| `kustomize` | 오버레이 | 30.2 |
| `argocd` / `flux` | GitOps | 30.4 |
| `kapp`, `ytt`, `kbld` | Carvel 툴킷 | 30.3 |
| `argo rollouts` / `flagger` | 프로그레시브 딜리버리 | 30.5 |

### 검증·보안

| 도구 | 용도 | 장 |
|---|---|---|
| `kubeconform` | 스키마 검증 | 30.6 |
| `kube-linter` | 모범 사례 위반 탐지 | 30.6 |
| `pluto` | 폐기 예정 API 탐지 | 32.2 |
| `trivy` | 이미지·클러스터 취약점 스캔 | 18.5 |
| `syft` / `grype` | SBOM 생성 / SBOM 기반 스캔 | 18.5 |
| `cosign` | 이미지 서명·검증 | 18.5 |
| `kubescape` / `kube-bench` | CIS 벤치마크 | 부록 D |
| `rakkess` / `kubectl-who-can` | RBAC 감사 | 17.3 |
| `kyverno` / `gatekeeper` | 정책 엔진 | 18.6 |

### 관측성·비용

| 도구 | 용도 | 장 |
|---|---|---|
| `kube-prometheus-stack` | Prometheus + Grafana + Alertmanager | 31.2 |
| `loki` + `promtail` | 로그 | 31.3 |
| `opentelemetry-collector` | 트레이스·메트릭 수집 | 31.4 |
| `tempo` / `jaeger` | 트레이스 저장·조회 | 31.4 |
| `hubble` (Cilium) | 네트워크 흐름 관측 | 23.3 |
| `falco` / `tetragon` | 런타임 위협 탐지 | 18.7 |
| `opencost` / `kubecost` | 비용 배분 | 13.7, 32.6 |
| `velero` | 백업·복원 | 12.6 |

---

## E.5 다음에 읽을 것

### 분야별 심화

| 관심사 | 추천 |
|---|---|
| **SRE 운영 원칙** | *Site Reliability Engineering* (Google, 무료 공개) — 31.5절 SLO의 원전 |
| **분산 시스템** | *Designing Data-Intensive Applications* — 22장 etcd/Raft의 배경 |
| **리눅스 내부** | *The Linux Programming Interface* — 19장의 프리미티브 |
| **네트워킹** | *Container Networking* (O'Reilly), Cilium 문서 — 23장 |
| **보안** | *Container Security* (Liz Rice) — 18장 |
| **오퍼레이터** | *Kubernetes Operators* (O'Reilly), controller-runtime 문서 — 27장 |
| **플랫폼 엔지니어링** | *Team Topologies*, *Platform Engineering on Kubernetes* |

### 커뮤니티

```
Kubernetes Slack       slack.k8s.io (#kubernetes-users, #kubernetes-novice)
SIG 미팅               공개. 유튜브에 녹화본
KubeCon                발표 영상 전체 공개
CNCF Landscape         landscape.cncf.io — 도구 지도
Kubernetes Podcast     구글이 운영. 릴리스 요약이 유용
Last Week in K8s       주간 뉴스레터
```

### 실습을 이어 가려면

```
① 이 책의 실습 과제를 시간 재며 다시 풀기
② kubeadm으로 VM 3대에 직접 클러스터 구축
③ 사내 워크로드 하나를 골라 이 책의 프로덕션 체크리스트(32.7절) 적용
④ 작은 오퍼레이터 하나 만들어 보기 (27장)
⑤ 일부러 고장 내고 32.5절 플레이북으로 진단하는 훈련
```

---

## E.6 마지막으로

이 책이 반복해서 말한 한 문장이 있다.

> **원하는 상태를 선언하면, 조정 루프가 그것을 유지한다.**

쿠버네티스에서 새로운 것을 만날 때마다 이 질문들을 던져 보자.

```
① 이것의 spec(원하는 상태)은 무엇인가?
② 누가 이것을 조정하는가?
③ 무엇을 소유하거나 참조하는가?
④ status에서 무엇을 보고 정상 여부를 판단하는가?
```

처음 보는 CRD든, 새로 나온 도구든, 다음 버전의 기능이든 — **같은 방식으로 읽힌다.**

버전은 계속 오르고 도구는 계속 바뀌지만, 이 패턴은 변하지 않는다.
