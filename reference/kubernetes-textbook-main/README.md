---
title: "Kubernetes Complete Guide — 통합 목차 설계안"
---

# Kubernetes Complete Guide — 통합 목차 설계안

> 4권의 원서를 분석해 **입문자 → 실무자** 전 범위를 한 권으로 재구성한 목차입니다.
> 각 장에 학습목표·실습·출처 매핑을 함께 표기했습니다.

---

## 원서 분석 요약

| 코드 | 원서 | 강점 | 이 책에서의 역할 |
|---|---|---|---|
| **KB** | *The Kubernetes Bible* (Kebbani·Tylenda·McKendrick, 2021) | 워크로드 오브젝트 전반, 3대 클라우드 매니지드 K8s(GKE/EKS/AKS), Helm, 스케줄링·오토스케일링 | **실무 폭(breadth)** — 설치부터 운영까지의 뼈대 |
| **KIA** | *Kubernetes in Action, 2nd Ed.* (Marko Luksa, MEAP) | 개념 설명의 명료함, Pod 생명주기·API 오브젝트 모델, 단계적 학습 곡선 | **개념 설명의 기준선** — 1~3부 서술 톤과 순서 |
| **CK** | *Core Kubernetes* (Vyas·Love, 2022) | 리눅스 프리미티브(cgroup/namespace), CNI/CSI/CRI, etcd, 컨트롤 플레인 내부, 보안, 대규모 네트워크 트러블슈팅 | **내부 동작(depth)** — 4~5부 |
| **PK** | *Programming Kubernetes* (Hausenblas·Schimanski) | client-go, CRD, 코드 생성, Operator, Admission Webhook, Custom API Server | **확장·개발(extend)** — 6부 |

**중복 영역** (통합 시 한 곳으로 수렴): Pod 개념(KB4·KIA5·CK2), 아키텍처(KB2·CK1·CK11), 인증·인가(KB18·CK14), 스케줄링(KB19·KIA21), 오토스케일링(KB20·KIA22), 스토리지(KIA7·CK7·CK8), 서비스/인그레스(KB21·CK6.4).

**원서에 부족해 보강이 필요한 영역** (★ 표기): GitOps/CD 파이프라인, 관측성(로깅·메트릭·트레이싱)의 실전 구성, 멀티테넌시, 서비스 메시, Gateway API, 클러스터 업그레이드·백업·DR, 비용 최적화, CKA/CKAD 대비 정리.

---

## 전체 구조

| 부 | 제목 | 장 | 난이도 |
|---|---|---|---|
| I | 쿠버네티스로 가는 길 | 1–3 | ☆ 입문 |
| II | 워크로드 실행하기 | 4–8 | ☆☆ 기본 |
| III | 애플리케이션 노출과 데이터 | 9–12 | ☆☆ 기본~중급 |
| IV | 클러스터 운영 | 13–18 | ☆☆☆ 중급 |
| V | 내부 동작 파헤치기 | 19–23 | ☆☆☆☆ 심화 |
| VI | 쿠버네티스 확장하기 | 24–28 | ☆☆☆☆ 심화 |
| VII | 프로덕션 플레이북 | 29–32 | ☆☆☆ 실무 |
| — | 부록 | A–D | — |

---

# 1부. 쿠버네티스로 가는 길 (입문)

## 1장. 왜 쿠버네티스인가
**학습목표** · 모놀리스에서 컨테이너 오케스트레이션까지의 흐름을 설명하고, 쿠버네티스를 도입해야 할 때와 도입하지 말아야 할 때를 판단한다.
- 1.1 인프라 드리프트 문제와 자동화의 필요성
- 1.2 마이크로서비스와 배포 복잡도
- 1.3 쿠버네티스가 해결하는 것: 선언적 상태와 조정 루프(reconciliation)
- 1.4 아키텍처 한눈에 보기 — 컨트롤 플레인과 워커 노드
- 1.5 쿠버네티스를 쓰지 말아야 할 경우
- 1.6 생태계 지도: CNCF, 배포판, 매니지드 서비스
**실습** 없음(개념 장) · **출처** KIA 1 / CK 1 / KB 서두

## 2장. 컨테이너의 이해
**학습목표** · 이미지·레이어·레지스트리의 구조를 설명하고, 컨테이너가 리눅스 커널 기능 위에서 어떻게 격리되는지 실험으로 확인한다.
- 2.1 컨테이너 vs 가상 머신
- 2.2 이미지, 레이어, 레지스트리, OCI 표준
- 2.3 Docker/containerd 실습: 빌드·실행·푸시
- 2.4 컨테이너를 가능하게 하는 것 — namespaces, cgroups, capabilities
- 2.5 컨테이너 런타임의 계보: Docker → containerd → CRI-O
**실습** 샘플 앱 이미지 빌드 후 로컬 레지스트리에 푸시 / `unshare`·`nsenter`로 네임스페이스 직접 만들어 보기
**출처** KIA 2 / CK 1.3, CK 3.2

## 3장. 첫 클러스터 만들기
**학습목표** · 목적에 맞는 클러스터 설치 방식을 고르고, kubectl로 클러스터와 상호작용한다.
- 3.1 학습용: Minikube, kind
- 3.2 직접 구축: kubeadm으로 멀티노드 클러스터
- 3.3 매니지드: GKE / EKS / AKS 개요와 선택 기준
- 3.4 kubectl 기본기 — 컨텍스트, kubeconfig, 출력 포맷, 플러그인(krew)
- 3.5 YAML 문법과 매니페스트 작성 규칙
- 3.6 첫 애플리케이션 배포와 접속
**실습** kind로 3노드 클러스터 생성 → 샘플 앱 배포 → `kubectl port-forward`로 접속
**출처** KB 3 / KIA 3 / KB 2.3

---

# 2부. 워크로드 실행하기 (기본)

## 4장. 쿠버네티스 API 오브젝트 모델
**학습목표** · 모든 리소스에 공통된 구조(TypeMeta/ObjectMeta/Spec/Status)를 이해하고 API를 직접 탐색한다.
- 4.1 API 그룹, 버전, 리소스, 서브리소스
- 4.2 오브젝트의 공통 구조: apiVersion / kind / metadata / spec / status
- 4.3 라벨, 셀렉터, 애노테이션, 파이널라이저, ownerReferences
- 4.4 Event 오브젝트로 클러스터 관찰하기
- 4.5 `kubectl explain`, `--raw`, API 디스커버리
**실습** `kubectl proxy` + curl로 API 서버 직접 호출하기
**출처** KIA 4 / PK 2 / KB 4.4

## 5장. Pod: 최소 배포 단위
**학습목표** · Pod가 왜 컨테이너가 아닌 "컨테이너 그룹"인지 설명하고, Pod를 만들고 다룬다.
- 5.1 왜 Pod인가 — 공유 네임스페이스와 공동 스케줄링
- 5.2 Pod 매니페스트 작성과 생성
- 5.3 Pod와 상호작용: logs, exec, cp, port-forward
- 5.4 멀티 컨테이너 Pod와 볼륨 공유
- 5.5 Init 컨테이너
- 5.6 Pod 디자인 패턴 — 사이드카, 앰배서더, 어댑터
- 5.7 Pod 삭제와 정리
**실습** Init 컨테이너로 설정 파일을 내려받아 메인 컨테이너에 전달하는 Pod 구성
**출처** KIA 5 / CK 2 / KB 4, KB 5

## 6장. Pod 생명주기와 헬스 관리
**학습목표** · Pod 상태 전이를 읽고, 프로브와 종료 훅으로 안정적인 롤아웃을 만든다.
- 6.1 Pod의 status와 컨디션 읽기
- 6.2 재시작 정책과 컨테이너 상태
- 6.3 liveness / readiness / startup 프로브 설계
- 6.4 postStart · preStop 훅과 graceful shutdown
- 6.5 Pod 생명주기 전체 흐름
- 6.6 흔한 실패 패턴: CrashLoopBackOff, ImagePullBackOff, OOMKilled
**실습** 프로브를 잘못 설정해 롤아웃이 멈추는 상황 재현 후 수정
**출처** KIA 6 / KB 10

## 7장. 설정과 시크릿
**학습목표** · 이미지와 설정을 분리하고, 민감 정보를 안전하게 주입한다.
- 7.1 ConfigMap: 환경변수·볼륨 마운트 주입
- 7.2 Secret의 종류와 한계(base64는 암호화가 아니다)
- 7.3 Downward API로 Pod 메타데이터 주입
- 7.4 etcd 저장 시 암호화(EncryptionConfiguration)
- 7.5 외부 시크릿 관리 연동 — External Secrets, Vault, 클라우드 KMS ★
- 7.6 설정 변경 시 롤아웃 유도 패턴
**실습** ConfigMap 해시를 애노테이션에 넣어 설정 변경 시 자동 롤링 업데이트
**출처** KB 6 / KIA 8 / CK 12.7 / CK 14.3

## 8장. 워크로드 컨트롤러
**학습목표** · 워크로드 성격에 맞는 컨트롤러를 선택하고 롤아웃 전략을 운용한다.
- 8.1 ReplicationController에서 ReplicaSet으로
- 8.2 Deployment: 무상태 애플리케이션
  - 롤링 업데이트, maxSurge/maxUnavailable, 리비전과 롤백
  - 배포 전략: 블루-그린, 카나리
- 8.3 StatefulSet: 상태 저장 애플리케이션
  - 안정적 네트워크 ID, 순서 보장, volumeClaimTemplates, 버전 릴리스
- 8.4 DaemonSet: 노드마다 하나씩
- 8.5 Job과 CronJob: 배치 워크로드
- 8.6 컨트롤러 선택 결정 트리
**실습** 동일한 앱을 Deployment와 StatefulSet으로 각각 배포해 차이 관찰 / 카나리 배포 수행
**출처** KB 10–13 / KIA 11, 13, 14

---

# 3부. 애플리케이션 노출과 데이터 (기본~중급)

## 9장. 서비스와 클러스터 네트워킹 기초
**학습목표** · Service 타입별 동작 원리를 설명하고 서비스 디스커버리를 구성한다.
- 9.1 쿠버네티스 네트워크 모델의 4가지 요구사항
- 9.2 Service 타입: ClusterIP, NodePort, LoadBalancer, ExternalName
- 9.3 Endpoints와 EndpointSlice
- 9.4 헤드리스 서비스와 StatefulSet
- 9.5 kube-proxy 모드: iptables vs IPVS
**실습** 서비스 뒤 Pod를 늘려가며 `iptables -t nat -L`로 규칙 변화 추적
**출처** KB 21.1 / CK 5.2 / KIA 10

## 10장. DNS와 서비스 디스커버리
**학습목표** · CoreDNS의 이름 해석 경로를 추적하고 DNS 문제를 진단한다.
- 10.1 CoreDNS 구조와 Corefile
- 10.2 서비스·Pod의 FQDN 규칙
- 10.3 resolv.conf, ndots, 검색 도메인이 만드는 지연
- 10.4 DNS 캐싱과 NodeLocal DNSCache ★
**실습** ndots 설정을 바꿔가며 DNS 쿼리 수를 비교 측정
**출처** CK 10

## 11장. 인그레스와 외부 트래픽 라우팅
**학습목표** · L7 라우팅을 설계하고 TLS를 종료한다.
- 11.1 Ingress 오브젝트와 IngressController의 관계
- 11.2 NGINX Ingress Controller 실습
- 11.3 TLS 종료와 cert-manager를 통한 인증서 자동화 ★
- 11.4 클라우드 통합: AWS ALB, Azure Application Gateway, GCP GCLB
- 11.5 Gateway API — Ingress의 다음 세대 ★
- 11.6 서비스 메시 개관: 언제 필요하고 언제 과한가 ★
**실습** 경로 기반 라우팅 + 자동 발급 TLS 인증서로 두 서비스 노출
**출처** KB 21 / CK 6.4 + 보강

## 12장. 스토리지: 볼륨에서 CSI까지
**학습목표** · 워크로드의 스토리지 요구를 분류하고 동적 프로비저닝을 구성한다.
- 12.1 볼륨의 기본: emptyDir, hostPath, projected
- 12.2 PersistentVolume / PersistentVolumeClaim / StorageClass
- 12.3 동적 프로비저닝과 볼륨 바인딩 모드
- 12.4 접근 모드, 회수 정책, 볼륨 확장
- 12.5 CSI(Container Storage Interface) 아키텍처
- 12.6 실제 CSI 드라이버 들여다보기
- 12.7 상태 저장 워크로드 스토리지 설계와 백업 ★
**실습** kind 클러스터에서 PVC 생성 → 동적 프로비저닝 확인 → 볼륨 확장
**출처** KIA 7, 12 / CK 7, 8

---

# 4부. 클러스터 운영 (중급)

## 13장. 네임스페이스와 멀티테넌시
**학습목표** · 네임스페이스로 자원을 분리하고 쿼터로 소비를 통제한다.
- 13.1 네임스페이스의 역할과 한계
- 13.2 ResourceQuota
- 13.3 LimitRange
- 13.4 멀티테넌시 패턴: 소프트 vs 하드 격리 ★
- 13.5 계층적 네임스페이스와 vCluster 개요 ★
**실습** 팀별 네임스페이스에 쿼터를 적용하고 초과 시 동작 확인
**출처** KB 8 / KIA 9 + 보강

## 14장. 리소스 관리와 QoS
**학습목표** · requests/limits가 스케줄링과 축출에 미치는 영향을 설명하고 적정값을 산정한다.
- 14.1 requests와 limits의 의미
- 14.2 QoS 클래스: Guaranteed / Burstable / BestEffort
- 14.3 CPU 스로틀링과 메모리 OOM
- 14.4 노드 압박(node pressure)과 축출 순서
- 14.5 적정 리소스 산정 방법론 ★
**실습** 부하 발생기로 CPU 스로틀링과 OOMKill을 각각 재현
**출처** KB 20.1 / KIA 20 / CK 4

## 15장. 고급 스케줄링
**학습목표** · 워크로드 배치 요구사항을 스케줄러 기능으로 표현한다.
- 15.1 kube-scheduler의 필터링·스코어링 단계
- 15.2 nodeSelector와 Node Affinity
- 15.3 Pod Affinity / Anti-Affinity
- 15.4 Taints와 Tolerations
- 15.5 Topology Spread Constraints ★
- 15.6 PriorityClass와 선점(preemption) ★
- 15.7 스케줄링 프로파일과 커스텀 스케줄러
**실습** AZ에 균등 분산되도록 토폴로지 제약 구성 후 노드 하나를 차단(cordon)해 재배치 관찰
**출처** KB 19 / KIA 21 + 보강

## 16장. 오토스케일링
**학습목표** · Pod와 노드 수준의 오토스케일링을 함께 설계한다.
- 16.1 Horizontal Pod Autoscaler — 메트릭, 알고리즘, 안정화 윈도
- 16.2 Vertical Pod Autoscaler와 HPA와의 충돌
- 16.3 Cluster Autoscaler와 Karpenter ★
- 16.4 커스텀·외부 메트릭 기반 스케일링(KEDA) ★
- 16.5 스케일링 설계 시 흔한 함정
**실습** 부하 테스트로 HPA 동작을 관찰하고 스케일 인 지연을 튜닝
**출처** KB 20 / KIA 22 + 보강

## 17장. 인증, 인가, 어드미션
**학습목표** · API 요청이 통과하는 3단계 관문을 설명하고 최소 권한 RBAC를 설계한다.
- 17.1 요청 처리 파이프라인: 인증 → 인가 → 어드미션
- 17.2 인증 방식: 인증서, 토큰, OIDC, ServiceAccount
- 17.3 RBAC: Role, ClusterRole, 바인딩, 권한 최소화
- 17.4 ServiceAccount 토큰 프로젝션과 워크로드 아이덴티티 ★
- 17.5 클라우드 IAM 연동: EKS IRSA, GKE Workload Identity, AKS + Entra ID
- 17.6 어드미션 컨트롤러 개요와 내장 플러그인
**실습** 개발자용 네임스페이스 한정 Role 설계 후 `kubectl auth can-i`로 검증
**출처** KB 18 / CK 14.2–14.3 / KIA 23 / PK 2.3

## 18장. 워크로드 보안
**학습목표** · 컨테이너·Pod·노드 각 층위의 공격 표면을 줄인다.
- 18.1 블래스트 레이디어스(blast radius) 사고 방식
- 18.2 컨테이너 보안: 비루트 실행, 읽기 전용 루트FS, capability 제거
- 18.3 securityContext와 Pod Security Admission(PSP의 후계) ★
- 18.4 노드 보안: kubelet 인증, 커널 하드닝, seccomp/AppArmor
- 18.5 NetworkPolicy로 트래픽 잠그기
- 18.6 이미지 공급망 보안: 스캐닝, 서명, 어드미션 정책 ★
- 18.7 정책 엔진: OPA Gatekeeper, Kyverno ★
**실습** 기본 거부(default-deny) NetworkPolicy 적용 후 필요한 통신만 허용해 나가기
**출처** CK 13, 14 / KIA 24, 25 + 보강

---

# 5부. 내부 동작 파헤치기 (심화)

## 19장. Pod를 밑바닥부터 만들어 보기
**학습목표** · 리눅스 프리미티브만으로 Pod와 동일한 격리 환경을 재현한다.
- 19.1 리눅스 프리미티브 총정리: namespace, cgroup, union FS, capability
- 19.2 쿠버네티스가 각 프리미티브를 쓰는 방식
- 19.3 pause 컨테이너의 정체
- 19.4 손으로 만드는 Pod
- 19.5 cgroup으로 프로세스 자원 제한하기 (cgroup v1 vs v2)
**실습** `unshare` + `cgcreate`로 2컨테이너 Pod 흉내내기
**출처** CK 3, 4

## 20장. kubelet과 노드
**학습목표** · kubelet이 PodSpec을 실제 컨테이너로 바꾸는 경로를 추적한다.
- 20.1 kubelet의 책임과 동기화 루프
- 20.2 CRI(Container Runtime Interface)
- 20.3 kubelet의 인터페이스들: CRI, CNI, CSI, Device Plugin
- 20.4 static Pod와 노드 부트스트랩
- 20.5 kubelet의 자원 관리와 축출
- 20.6 cAdvisor·메트릭 수집 경로
**실습** `crictl`로 kubelet이 만든 컨테이너를 직접 조회하고 로그 경로 확인
**출처** CK 9, 4.4–4.6

## 21장. 컨트롤 플레인의 핵심
**학습목표** · API 서버·컨트롤러 매니저·스케줄러의 협업 구조를 설명한다.
- 21.1 kube-apiserver 상세: 요청 처리, 감사, 어그리게이션
- 21.2 kube-controller-manager와 내장 컨트롤러들
- 21.3 컨트롤러 패턴: watch–diff–act 루프와 리더 선출
- 21.4 cloud-controller-manager
- 21.5 kube-scheduler 재방문
**실습** 컨트롤러 매니저 로그로 ReplicaSet 조정 과정을 추적
**출처** CK 11 / KIA 16, 18 / KB 2

## 22장. etcd
**학습목표** · etcd의 일관성 모델과 운영 리스크를 이해하고 백업·복구를 수행한다.
- 22.1 데이터 스토어로서의 etcd와 Raft
- 22.2 쿠버네티스가 etcd를 쓰는 방식: 키 구조와 watch
- 22.3 CAP 관점에서 본 etcd
- 22.4 저장 시 암호화
- 22.5 성능·내결함성·하트비트 튜닝
- 22.6 백업과 복구 실전
**실습** `etcdctl`로 스냅샷 백업 → 클러스터 손상 → 복구
**출처** CK 12

## 23장. CNI와 대규모 네트워크 트러블슈팅
**학습목표** · CNI 플러그인의 데이터 경로를 추적하고 네트워크 장애를 계층별로 진단한다.
- 23.1 CNI 스펙과 플러그인 체인
- 23.2 오버레이 vs 라우팅 방식
- 23.3 Calico와 Antrea 심층 비교
- 23.4 kube-proxy와 iptables 규칙 해부
- 23.5 Sonobuoy로 클러스터 적합성 검증
- 23.6 `ip`, `arp`, `tcpdump`로 경로 추적하는 법
- 23.7 네트워크 장애 진단 플로차트
**실습** Pod 간 통신 실패 시나리오 3종을 만들어 계층별로 원인 특정
**출처** CK 5, 6

---

# 6부. 쿠버네티스 확장하기 (심화 / 개발자)

## 24장. 확장 지점 지도
**학습목표** · 요구사항에 맞는 확장 방식을 선택한다.
- 24.1 "쿠버네티스를 프로그래밍한다"는 것의 의미
- 24.2 확장 패턴 분류: CRD, 어그리게이션, 웹훅, 스케줄러 확장, CNI/CSI/CRI 플러그인
- 24.3 컨트롤러 vs 오퍼레이터
- 24.4 선택 가이드: 언제 CRD로 충분하고 언제 그 이상이 필요한가
**출처** PK 1

## 25장. client-go 기초
**학습목표** · Go로 쿠버네티스 API를 다루는 표준 도구를 익힌다.
- 25.1 저장소 구조: client-go, api, apimachinery
- 25.2 Go에서의 쿠버네티스 오브젝트와 스킴
- 25.3 ClientSet, dynamic client, discovery client
- 25.4 Informer, Lister, 캐시, 워크큐
- 25.5 API Machinery 심층: 직렬화, 변환, 버전
- 25.6 의존성 관리
**실습** Informer로 Pod 이벤트를 구독해 로그로 출력하는 프로그램 작성
**출처** PK 3

## 26장. 커스텀 리소스
**학습목표** · CRD를 설계·검증·버전 관리한다.
- 26.1 CRD 정의와 디스커버리
- 26.2 스키마 검증(OpenAPI v3)과 구조적 스키마
- 26.3 고급 기능: 서브리소스(status/scale), printer columns, 기본값, 프루닝
- 26.4 개발자 관점의 커스텀 리소스 사용
- 26.5 커스텀 리소스 버저닝과 변환 웹훅
**실습** 상태·스케일 서브리소스를 갖춘 CRD 정의 후 kubectl로 조작
**출처** PK 4, 9.1

## 27장. 오퍼레이터 만들기
**학습목표** · 조정 루프를 구현해 운영 지식을 코드로 옮긴다.
- 27.1 코드 생성 자동화: deepcopy, client, informer, 태그
- 27.2 sample-controller 따라 만들기
- 27.3 Kubebuilder / controller-runtime
- 27.4 Operator SDK
- 27.5 다른 접근법: Metacontroller, KUDO, 파이썬·자바 프레임워크
- 27.6 조정 루프 작성 원칙 — 멱등성, 에러 처리, 재큐, 관측성
**실습** Kubebuilder로 간단한 오퍼레이터 구현(예: 백업 스케줄 CRD)
**출처** PK 5, 6

## 28장. 어드미션 웹훅과 커스텀 API 서버
**학습목표** · 정책과 변형을 API 경로에 주입하고, CRD의 한계를 넘는 확장을 구현한다.
- 28.1 Mutating / Validating Admission Webhook
- 28.2 웹훅 운영 시 주의점: 실패 정책, 지연, 순환 의존
- 28.3 어그리게이션 계층 아키텍처
- 28.4 커스텀 API 서버 작성과 배포
- 28.5 오퍼레이터·컨트롤러 출하하기: 패키징, 라이프사이클 관리, 프로덕션 배포
**실습** 특정 라벨이 없는 Pod를 거부하는 Validating Webhook 배포
**출처** PK 7, 8, 9.2

---

# 7부. 프로덕션 플레이북 (실무)

## 29장. 매니지드 쿠버네티스 실전
**학습목표** · GKE/EKS/AKS의 차이를 이해하고 목적에 맞게 클러스터를 구성한다.
- 29.1 매니지드 vs 자체 구축 의사결정
- 29.2 GKE: 노드 풀, Autopilot, Workload Identity
- 29.3 EKS: 노드 그룹, Fargate, IRSA, VPC CNI
- 29.4 AKS: 노드 풀, Entra ID 통합, Application Gateway
- 29.5 3사 비교표와 이식성 확보 전략
- 29.6 IaC로 클러스터 관리 — Terraform / Crossplane ★
**실습** 동일한 앱을 두 클라우드에 배포하고 매니페스트 차이를 최소화
**출처** KB 3, 14, 15, 16, 18.3 + 보강

## 30장. 패키징과 배포 파이프라인
**학습목표** · 매니페스트를 재사용 가능하게 관리하고 배포를 자동화한다.
- 30.1 Helm: 차트 구조, 값, 릴리스, 훅
- 30.2 Kustomize: 오버레이 방식
- 30.3 Carvel 툴킷(ytt, kapp, imgpkg)
- 30.4 GitOps: Argo CD / Flux ★
- 30.5 프로그레시브 딜리버리와 자동 롤백 ★
- 30.6 어떤 도구를 언제 쓰는가
**실습** Helm 차트 작성 → Argo CD로 GitOps 배포 → 롤백
**출처** KB 17 / CK 15 + 보강

## 31장. 관측성
**학습목표** · 로그·메트릭·트레이스를 수집해 문제를 빠르게 좁힌다.
- 31.1 관측성의 세 기둥과 쿠버네티스에서의 수집 경로
- 31.2 메트릭: Prometheus, kube-state-metrics, cAdvisor, ServiceMonitor
- 31.3 로깅: 노드 에이전트 패턴, Fluent Bit, Loki ★
- 31.4 트레이싱: OpenTelemetry ★
- 31.5 대시보드와 알림 설계: SLI/SLO 기반 ★
- 31.6 이벤트와 감사 로그 활용
**실습** kube-prometheus-stack 설치 후 앱 SLO 대시보드와 알림 규칙 작성
**출처** CK 4.6 / KIA 27 + 보강

## 32장. 클러스터 라이프사이클과 장애 대응
**학습목표** · 업그레이드·백업·재해 복구 절차를 수립하고, 장애 상황을 체계적으로 진단한다.
- 32.1 고가용성 컨트롤 플레인 설계
- 32.2 버전 스큐 정책과 무중단 업그레이드 절차
- 32.3 노드 유지보수: cordon, drain, PodDisruptionBudget
- 32.4 백업과 재해 복구: etcd, Velero ★
- 32.5 트러블슈팅 플레이북 — 증상별 진단 경로
- 32.6 비용 최적화와 용량 계획 ★
- 32.7 프로덕션 준비 체크리스트
**실습** 클러스터를 한 마이너 버전 업그레이드하며 무중단 유지 / 장애 시나리오 3종 진단
**출처** KB 2.8 / KIA 19, 26 / CK 14.5 + 보강

---

# 부록

- **부록 A. kubectl 치트시트** — 자주 쓰는 명령, JSONPath, 디버깅 원라이너
- **부록 B. YAML 매니페스트 레퍼런스** — 주요 오브젝트별 필드 요약
- **부록 C. CKA / CKAD 시험 도메인 매핑** ★ — 시험 항목 ↔ 이 책의 장·절 대응표
- **부록 D. 용어집과 더 읽을거리** — 원서 4권 및 CNCF 프로젝트 링크
