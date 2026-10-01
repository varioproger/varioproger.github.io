---
title: "부록 D. CKA / CKAD 시험 도메인 매핑"
parent: "Kubernetes 부록"
grand_parent: "Kubernetes Complete Guide"
nav_order: 1068
---

# 부록 D. CKA / CKAD 시험 도메인 매핑

> CNCF 인증 시험은 **전부 실습형**이다. 객관식이 없고, 실제 클러스터에서 문제를 해결한다.
> 이 부록은 시험 도메인을 이 책의 장·절과 연결하고, 준비 전략을 정리한다.
>
> ⚠️ 시험 도메인과 비중은 개정되므로 **응시 전 반드시 [CNCF 공식 커리큘럼](https://github.com/cncf/curriculum)을 확인**하라.

---

## D.1 세 시험 비교

| | **CKAD** | **CKA** | **CKS** |
|---|---|---|---|
| 정식 명칭 | Certified Kubernetes **Application Developer** | Certified Kubernetes **Administrator** | Certified Kubernetes **Security Specialist** |
| 관점 | 앱을 **올리는** 사람 | 클러스터를 **운영하는** 사람 | 클러스터를 **지키는** 사람 |
| 시간 | 2시간 | 2시간 | 2시간 |
| 문항 | 15~20 | 15~20 | 15~20 |
| 합격선 | 66% | 66% | 67% |
| 선수 조건 | 없음 | 없음 | **CKA 보유 필수** |
| 난이도 | 속도가 관건 | 폭이 넓다 | 깊이가 필요 |
| 이 책 범위 | 1~3부 중심 | 1~5부 + 7부 | 4부 + 18장 중심 |

**추천 순서**: CKAD → CKA → CKS. CKAD가 진입이 쉽고, 그 지식이 CKA에 그대로 쓰인다.

---

## D.2 CKAD 도메인 매핑

### ① Application Design and Build (20%)

| 시험 항목 | 이 책 |
|---|---|
| 컨테이너 이미지 정의·빌드·수정 | **2.2, 2.3절** |
| Job과 CronJob 이해 | **8.5절** |
| 멀티 컨테이너 Pod 디자인 패턴 | **5.4, 5.6절** |
| 영구/임시 볼륨 활용 | **12.1, 12.5절** |

**핵심 실습**
```bash
# 사이드카·앰배서더·어댑터 패턴을 각각 구현할 수 있어야 한다
# init 컨테이너로 의존성 대기
# emptyDir로 컨테이너 간 파일 공유
```

### ② Application Deployment (20%)

| 시험 항목 | 이 책 |
|---|---|
| Deployment와 롤링 업데이트 | **8.2절** |
| 블루-그린, 카나리 배포 | **8.2절** (전략 부분) |
| Helm으로 기존 패키지 설치 | **30.1절** |
| Kustomize 사용 | **30.2절** |

**핵심 실습**
```bash
kubectl set image deployment/web app=nginx:1.27 --record
kubectl rollout status/history/undo deployment/web
kubectl apply -k overlays/prod
helm install / upgrade / rollback
```

### ③ Application Observability and Maintenance (15%)

| 시험 항목 | 이 책 |
|---|---|
| API 폐기(deprecation) 이해 | **4.1절**, 32.2절 |
| 프로브와 헬스체크 구현 | **6.2절** ★ |
| 컨테이너 로그 모니터링 | **5.3절**, 31.3절 |
| 애플리케이션 디버깅 | **6.5절** ★ |

**핵심 실습**
```bash
kubectl logs <pod> --previous          # ★ 가장 많이 쓴다
kubectl describe pod <pod>
kubectl exec / kubectl debug
# liveness/readiness/startup을 문제 요구에 맞게 작성
```

### ④ Application Environment, Configuration and Security (25%)

| 시험 항목 | 이 책 |
|---|---|
| CRD와 오퍼레이터 개요 | **24장, 26장** |
| 인증·인가·어드미션 개요 | **17장** |
| requests, limits, 쿼터 | **13.2, 13.3, 14.1절** |
| ConfigMap | **7.1절** |
| Secret | **7.2절** |
| ServiceAccount | **17.4절** |
| SecurityContext | **18.2절** |

**핵심 실습**
```bash
kubectl create configmap/secret ... --dry-run=client -o yaml
# env, envFrom, volume 세 가지 주입 방식 모두
# securityContext: runAsUser, runAsNonRoot, capabilities
# ServiceAccount 생성 후 Pod에 연결
```

### ⑤ Services and Networking (20%)

| 시험 항목 | 이 책 |
|---|---|
| NetworkPolicy | **18.4절** ★ |
| Service로 애플리케이션 노출 | **9.2절** |
| Ingress 규칙 | **11.2절** |

**핵심 실습**
```bash
kubectl expose deployment web --port=80 --target-port=8080
# NetworkPolicy를 요구사항대로 작성 (AND/OR 구분 주의)
# Ingress 경로·호스트 라우팅
```

---

## D.3 CKA 도메인 매핑

### ① Cluster Architecture, Installation and Configuration (25%)

| 시험 항목 | 이 책 |
|---|---|
| RBAC 관리 | **17.3절** ★ |
| kubeadm으로 클러스터 설치 | **3.1절**, 32.2절 |
| 고가용성 클러스터 관리 | **32.1절** |
| 인프라 프로비저닝 | 29.7절 |
| 버전 업그레이드 | **32.2절** ★ |
| etcd 백업과 복원 | **22.7절** ★★ |

**시험에서 가장 자주 나오는 것**
```bash
# etcd 백업·복원 — 거의 반드시 나온다
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=... --cert=... --key=...
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd.db --data-dir=/var/lib/etcd-new

# 클러스터 업그레이드
kubeadm upgrade plan
kubeadm upgrade apply v1.31.0
kubectl drain <node> --ignore-daemonsets
kubeadm upgrade node
kubectl uncordon <node>

# RBAC
kubectl create role dev --verb=get,list --resource=pods
kubectl create rolebinding dev-bind --role=dev --user=alice
kubectl auth can-i list pods --as=alice
```

### ② Workloads and Scheduling (15%)

| 시험 항목 | 이 책 |
|---|---|
| Deployment와 롤링 업데이트·롤백 | **8.2절** |
| ConfigMap과 Secret으로 앱 설정 | **7장** |
| 애플리케이션 스케일링 | 8.2절, 16.2절 |
| 워크로드 배치 제어 | **15장** ★ |
| 매니페스트 관리 도구 | 30.1, 30.2절 |

**핵심 실습**
```bash
# nodeSelector, 어피니티, 테인트/톨러레이션
kubectl taint nodes node1 key=value:NoSchedule
kubectl label node node1 disktype=ssd
# static Pod 만들기 (20.5절) — 자주 나온다
```

### ③ Services and Networking (20%)

| 시험 항목 | 이 책 |
|---|---|
| 노드의 호스트 네트워킹 설정 | **9.1절**, 23.2절 |
| Pod 간 연결 | **9장, 23장** |
| ClusterIP, NodePort, LoadBalancer | **9.2절** |
| Ingress 컨트롤러와 리소스 | **11장** |
| CoreDNS 설정과 사용 | **10장** ★ |
| CNI 플러그인 선택 | **23.3절** |

**핵심 실습**
```bash
kubectl expose ...
# 서비스가 안 될 때 진단 (9.7절 순서)
kubectl get endpointslices
kubectl run t --rm -it --image=busybox -- nslookup <svc>
```

### ④ Storage (10%)

| 시험 항목 | 이 책 |
|---|---|
| StorageClass | **12.2절** |
| 볼륨 타입, 접근 모드, 회수 정책 | **12.1, 12.3절** |
| PVC와 PV | **12.2절** ★ |
| 애플리케이션에 스토리지 연결 | **12.5절** |

### ⑤ Troubleshooting (30%) ★ 가장 큰 비중

| 시험 항목 | 이 책 |
|---|---|
| 클러스터·노드 로깅 평가 | **20.8절, 31.3절** |
| 애플리케이션 모니터링 | **31.2절** |
| 컨테이너 로그 관리 | **5.3절** |
| 애플리케이션 실패 문제 해결 | **6.5절** ★ |
| 클러스터 컴포넌트 실패 문제 해결 | **20.8, 21.6, 22.9절** ★ |
| 네트워킹 문제 해결 | **9.7, 10.6, 23.6절** ★ |

> **CKA의 30%가 트러블슈팅이다.** **32.5절의 플레이북**을 반복 훈련하는 것이 합격의 핵심이다.

**시험에 자주 나오는 고장 유형**

| 증상 | 원인 | 확인 |
|---|---|---|
| 노드 `NotReady` | kubelet 정지, 설정 오류 | `systemctl status kubelet`, `journalctl -u kubelet` |
| API 서버 접근 불가 | static Pod 매니페스트 오류 | `/etc/kubernetes/manifests/`, `crictl logs` |
| Pod `Pending` | 리소스 부족, 테인트, PVC | `kubectl describe pod` Events |
| Service 연결 안 됨 | 셀렉터 불일치, 포트 오류 | `kubectl get endpointslices` |
| DNS 실패 | CoreDNS 다운, 설정 | `kubectl -n kube-system logs -l k8s-app=kube-dns` |
| kubelet 인증서 만료 | 갱신 누락 | `kubeadm certs check-expiration` |

---

## D.4 CKS 도메인 매핑 (참고)

CKA 보유가 선수 조건이다. 이 책의 4부와 18장이 핵심이다.

| 도메인 | 비중 | 이 책 |
|---|---|---|
| Cluster Setup | 15% | 18.4절(NetworkPolicy), 11.3절(TLS), 20.7절(kubelet 보안) |
| Cluster Hardening | 15% | **17장 전체**, 32.2절(업그레이드) |
| System Hardening | 10% | **18.2절**(securityContext, seccomp, AppArmor), 19.6절 |
| Minimize Microservice Vulnerabilities | 20% | **18.3절**(PSA), 18.4절, 샌드박스 런타임, 7.4절(etcd 암호화) |
| Supply Chain Security | 20% | **18.5절**(스캐닝·서명·검증), 2.2절(최소 이미지) |
| Monitoring, Logging and Runtime Security | 20% | **18.7절**(Falco, 감사 로그), 31.6절 |

**CKS 특유의 도구**
```bash
trivy image myapp:1.0                    # 취약점 스캔
kube-bench run                           # CIS 벤치마크
falco                                    # 런타임 탐지
cosign verify ...                        # 이미지 서명 검증
apparmor_parser / seccomp 프로파일
```

---

## D.5 학습 계획

### CKAD — 4주

| 주차 | 학습 | 실습 목표 |
|---|---|---|
| 1주 | 1~3장, 5~7장 | kind 클러스터 구축, Pod·ConfigMap·Secret 자유롭게 |
| 2주 | 8장, 9장, 11장 | Deployment 롤아웃/롤백, Service·Ingress 구성 |
| 3주 | 12~14장, 18.2·18.4절 | PVC, requests/limits, NetworkPolicy, securityContext |
| 4주 | 모의고사 반복 | **시간 내 완료**에 집중 |

### CKA — 8주

| 주차 | 학습 | 실습 목표 |
|---|---|---|
| 1~2주 | 1~8장 | 기본기. kubeadm으로 직접 클러스터 구축해 보기 |
| 3주 | 9~12장 | 네트워킹과 스토리지 |
| 4주 | 13~18장 | RBAC, 스케줄링, 쿼터 |
| 5주 | 20~22장 | kubelet, 컨트롤 플레인, **etcd 백업·복원 반복** |
| 6주 | 32장 | **업그레이드 절차 3회 이상 직접 수행** |
| 7주 | 32.5절 플레이북 | 일부러 고장 내고 고치기 |
| 8주 | 모의고사 | killer.sh 등 |

### 실습 환경

```bash
# 이 책 3장의 kind 클러스터로 대부분 가능하다
kind create cluster --config kind-cluster.yaml

# 단, CKA의 kubeadm·etcd·업그레이드 문제는
# VM 2~3대(멀티패스, VirtualBox, 클라우드)로 직접 구축해 봐야 한다
multipass launch --name cp --cpus 2 --memory 4G
multipass launch --name w1 --cpus 2 --memory 4G
```

---

## D.6 시험 당일 전략

### 환경 설정 (첫 1분)

```bash
alias k=kubectl
export do="--dry-run=client -o yaml"
export now="--grace-period=0 --force"
complete -F __start_kubectl k

# vim (~/.vimrc)
set ts=2 sw=2 et ai number
```

### 시간 관리

```
① 전체 문제를 2분 안에 훑고 배점을 확인한다
② 배점이 높고 쉬운 것부터 푼다
③ 막히면 즉시 넘어간다 (플래그 표시)
④ 마지막 20분을 남겨 두고 미해결 문제로 돌아온다
```

**한 문제에 8분을 넘기면 넘어간다.** 15문제 × 8분 = 120분이므로 여유가 거의 없다.

### 컨텍스트 확인 습관

**모든 문제가 서로 다른 클러스터·네임스페이스를 쓴다.**

```bash
# 문제마다 주어지는 명령을 반드시 먼저 실행한다
kubectl config use-context <given-context>

# 네임스페이스를 문제에서 지정하면
k config set-context --current --namespace=<ns>
# 또는 매번 -n <ns>
```

**컨텍스트를 바꾸지 않아 오답 처리되는 것이 가장 흔한 실수다.**

### 문서 활용

시험 중 **kubernetes.io 공식 문서 한 개 탭**을 열 수 있다.

```
자주 여는 페이지를 미리 익혀 두자:
· Pod / Deployment / Service 예제
· NetworkPolicy 예제 (복잡해서 복사가 빠르다)
· PersistentVolume 예제
· RBAC 예제
```

**하지만 `kubectl explain`이 대개 더 빠르다.**

```bash
k explain pod.spec.tolerations
k explain networkpolicy.spec.ingress --recursive
```

### 답안 검증

```bash
# 만들었으면 반드시 확인
k get <resource> -n <ns>
k describe <resource> <name>

# Pod가 실제로 Running인지
k get pods -n <ns> -w

# 파일로 답을 쓰는 문제는 경로를 다시 확인
cat /opt/answer.txt
```

---

## D.7 자주 나오는 문제 유형과 명령

**① 매니페스트 생성**
```bash
k run nginx --image=nginx --restart=Never $do > pod.yaml
k create deploy web --image=nginx --replicas=3 $do > d.yaml
k expose deploy web --port=80 --target-port=8080 $do > svc.yaml
k create job j --image=busybox $do -- /bin/sh -c 'echo hi' > job.yaml
k create cj c --image=busybox --schedule="*/1 * * * *" $do -- date > cj.yaml
```

**② 특정 값 추출해 파일로**
```bash
k get pods -o jsonpath='{.items[*].metadata.name}' > /opt/names.txt
k get nodes -o jsonpath='{.items[*].status.nodeInfo.osImage}' > /opt/os.txt
k logs web | grep ERROR > /opt/errors.txt
k top pod --sort-by=cpu --no-headers | head -1 | awk '{print $1}' > /opt/top.txt
```

**③ 노드 관리**
```bash
k cordon node1
k drain node1 --ignore-daemonsets --delete-emptydir-data
k uncordon node1
k taint node node1 key=val:NoSchedule
```

**④ static Pod** (20.5절)
```bash
# 노드에 SSH 후
mkdir -p /etc/kubernetes/manifests
k run static-web --image=nginx $do > /etc/kubernetes/manifests/static-web.yaml
# 20초 내에 <name>-<nodename> 형태로 나타난다
```

**⑤ etcd 백업·복원** (22.7절)
```bash
# 인증서 경로는 kube-apiserver 매니페스트에서 확인
grep etcd /etc/kubernetes/manifests/kube-apiserver.yaml

ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/backup.db

ETCDCTL_API=3 etcdctl snapshot restore /opt/backup.db --data-dir=/var/lib/etcd-restore
# 그다음 etcd.yaml의 hostPath를 새 디렉터리로 변경
```

**⑥ 트러블슈팅**
```bash
# 순서를 몸에 익힌다
k get pods -A | grep -v Running
k describe pod <pod> | tail -20
k logs <pod> --previous
k get events -A --sort-by=.lastTimestamp | tail -20

# 노드 문제라면
ssh node1
systemctl status kubelet
journalctl -u kubelet -n 50 --no-pager
crictl ps -a
```

---

## D.8 준비 자원

| 자원 | 설명 |
|---|---|
| [CNCF 커리큘럼](https://github.com/cncf/curriculum) | **공식 도메인 목록.** 반드시 최신판 확인 |
| [killer.sh](https://killer.sh) | 시험 등록 시 **2회 무료 제공.** 실제보다 어렵다 |
| [Kubernetes 공식 문서](https://kubernetes.io/docs/) | 시험 중 열람 가능 |
| [kubernetes/examples](https://github.com/kubernetes/examples) | 예제 매니페스트 |
| CKAD/CKA 연습 문제 저장소 | GitHub에 다수 (dgkanatsios, bmuschko 등) |

> **시험 응시권은 1회 무료 재응시가 포함된다.** 첫 시도에서 떨어져도 부담이 적으니, 준비가 80% 정도 됐다고 느끼면 응시해 보는 것도 방법이다. 실제 시험 환경을 경험하는 것 자체가 큰 학습이다.

---

## D.9 이 책만으로 부족한 부분

정직하게 말하면, 시험 대비에는 이 책 외에 **손으로 반복하는 시간**이 필요하다.

| 영역 | 이 책이 주는 것 | 추가로 필요한 것 |
|---|---|---|
| 개념 이해 | ✅ 충분 | — |
| YAML 작성 | ✅ 예제 다수 | **속도** — 반복 타이핑 |
| 트러블슈팅 논리 | ✅ 플레이북 | **고장 사례 경험** — 일부러 고장 내기 |
| kubeadm 실습 | 개요 수준 | **VM으로 직접 구축** 2~3회 |
| 시험 환경 적응 | ❌ | **모의고사** (killer.sh) |

**가장 효과적인 준비**: 이 책의 각 장 실습 과제를 **시간을 재면서** 수행하는 것이다. 개념은 이미 안다는 전제에서, 손이 얼마나 빠른지가 합격을 가른다.
