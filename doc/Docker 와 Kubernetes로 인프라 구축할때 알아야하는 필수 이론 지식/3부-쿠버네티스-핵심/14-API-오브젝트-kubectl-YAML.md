---
title: "14장. API 오브젝트 모델, kubectl, YAML, 라벨"
parent: "3부. 쿠버네티스 핵심"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 14
---

# 14장. API 오브젝트 모델, kubectl, YAML, 라벨

> **🎮 게임 서버 개발자에게** — 게임 서버에서 패킷 헤더의 ID와 버전을 보고 어떤 구조체로 역직렬화할지 정하듯, 쿠버네티스 API 서버는 `apiVersion`+`kind`를 보고 어떤 스키마로 YAML을 해석할지 정한다. 결정적으로 다른 점은 이것이 "한 번 처리하고 끝나는 요청"이 아니라 **etcd에 저장되어 계속 맞춰지는 상태 오브젝트**라는 것, 그리고 오브젝트끼리 포인터나 이름이 아니라 **라벨이라는 속성 쿼리로 느슨하게** 연결된다는 것이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - `kubectl apply`가 성공했다고 "배포 완료"를 공지했는데, 실제로는 Pod가 이미지 pull에 실패하고 있었다.
> - 개발 클러스터인 줄 알고 실행한 `kubectl delete`가 라이브 클러스터에서 실행됐다.
> - 장애 난 Pod 하나를 지우지 않고 트래픽에서만 빼서 원인을 분석하고 싶다.

## 코어 — 이것만은 100%

> **한 문장:** 모든 쿠버네티스 리소스는 apiVersion·kind·metadata·spec·status라는 같은 구조의 API 오브젝트이고, 오브젝트끼리는 라벨·셀렉터로 느슨하게 묶이며, 우리는 kubeconfig의 현재 컨텍스트로 접속한 kubectl로 YAML 매니페스트를 `apply`해 원하는 상태를 선언한다.

1. **모든 것은 같은 구조의 API 오브젝트** — REST URL을 가진 리소스이고, apiVersion+kind(스키마), metadata(이름·라벨·uid·ownerReferences·finalizers), spec(사람이 씀), status(시스템이 씀)로 구성된다.
2. **라벨은 선택, 애노테이션은 부가 정보** — Service·ReplicaSet·NetworkPolicy는 라벨 셀렉터로 대상을 찾는다(느슨한 결합). Deployment 셀렉터는 생성 후 바꿀 수 없다.
3. **kubectl은 현재 컨텍스트로 가고, 선언형 `apply`가 기본** — 컨텍스트는 (클러스터, 사용자, 기본 네임스페이스) 조합이다. `apply` 성공은 "저장됨"일 뿐이므로 `get pods` → `describe` → `get events`로 실제 상태를 확인한다.
4. **YAML은 따옴표·들여쓰기 함정을 피하고, 많아지면 도구로 관리** — 뼈대 생성 → 수정 → 서버 검증 → diff → apply 워크플로, 환경별 차이는 Helm(템플릿)·Kustomize(패치).

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 패킷 헤더의 패킷 ID + 프로토콜 버전 → 어떤 구조체로 역직렬화할지 결정 | `apiVersion` + `kind` | 이 둘이 본문(spec)을 어떤 스키마로 해석할지 정한다 | 패킷은 처리하고 버리지만 오브젝트는 etcd에 저장되어 계속 조정된다. 버전에 alpha/beta/v1이라는 **안정성 등급**이 붙는다 |
| 부모 객체가 자식을 소유(`unique_ptr` 트리, 부모 소멸 시 자식도 소멸) | `ownerReferences` + 가비지 컬렉터 | 소유자를 지우면 소유된 것도 지워진다(Deployment → ReplicaSet → Pod) | 소멸자처럼 즉시·동기적으로 호출되지 않는다. 가비지 컬렉터가 정리하고, `finalizers`가 남아 있으면 삭제가 **지연**된다 |
| 세션 매니저에서 "채널 3번에 있는 세션 전부"를 조건으로 골라 브로드캐스트 | 라벨 셀렉터 | 포인터·이름이 아니라 **속성 조건**으로 대상 집합을 고른다 | 대상 집합이 계속 다시 평가되어, 라벨만 바꾸면 즉시 Service·ReplicaSet의 대상에서 빠진다. 셀렉터가 겹치는 두 컨트롤러는 서로의 Pod를 빼앗으려 든다 |
| 운영 툴의 접속 대상 프로필(QA 서버 / 라이브 서버) | kubeconfig의 context | 어느 서버에 명령이 가는지가 "현재 선택된 프로필"에 달려 있다 | 별도 확인 없이 `current-context`로 바로 간다. 라이브 컨텍스트에서의 실수가 가장 흔한 사고다 |
| DB의 INSERT vs UPSERT | `kubectl create` vs `kubectl apply` | `create`는 이미 있으면 에러, `apply`는 없으면 만들고 있으면 차이만 반영 | `apply` 성공은 "API 서버가 저장했다"일 뿐, 이후 이미지 pull·IP 할당·볼륨·앱 초기화가 각각 실패할 수 있다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 쿠버네티스에는 폴더가 없다면, Service는 수많은 Pod 중 자기 대상을 무엇으로 찾을까?
> 2. Deployment 하나를 지우면 그 아래 ReplicaSet과 Pod는 왜 같이 사라질까?
> 3. `kubectl apply`가 성공했다면 앱이 정상 동작한다는 뜻일까?
> 4. YAML에 `country: NO` 라고 쓰면 무슨 일이 생길까?
>
> **처리법:** 🛠 실습 `kind create cluster`, `kubectl explain`, `kubectl create ... --dry-run=client -o yaml` → `apply --dry-run=server` → `diff` → `apply` 워크플로, `kubectl label` · 🗺 관계도 apiVersion/kind/metadata/spec/status, ownerReferences·finalizers, 라벨 ↔ 셀렉터 ↔ 애노테이션, kubeconfig(clusters·users·contexts) · 📦 카드로 API 그룹별 리소스 표, 라벨 63자·애노테이션 256KB, Event 보관 1시간, Event Reason 목록, kubectl 명령 패턴

**이 장에서 배우는 것**

- 모든 쿠버네티스 리소스가 따르는 공통 구조(apiVersion / kind / metadata / spec / status)를 이해한다.
- 라벨·셀렉터·애노테이션의 차이와 쓰임을 안다.
- kubeconfig와 컨텍스트, 명령형과 선언형(`create` vs `apply`)의 차이, kubectl의 핵심 명령 패턴과 YAML 작성 시 자주 하는 실수를 안다.
- 매니페스트 관리 도구(Helm, Kustomize)가 무엇을 해결하는지 개요를 안다.
- 학습용 클러스터(minikube, kind)가 무엇인지 개요를 안다.

---

## 코어 1. 모든 것은 같은 구조의 API 오브젝트

### 1.1 리소스는 URL을 가진 REST 오브젝트다

**한 줄 요약:** 규칙이 하나이므로, 한 번 익히면 처음 보는 리소스도 `kubectl explain`으로 다룬다.

쿠버네티스에는 수십 종의 리소스(Pod, Service, Deployment …)가 있지만 **모두 동일한 구조와 규칙**을 따른다. 규칙을 한 번 익히면 처음 보는 리소스도 `kubectl explain`으로 다룰 수 있다.

API 서버는 REST API이고, 리소스는 URL을 가진다. `kubectl`이 하는 일은 결국 이 URL을 호출하는 것이다(`kubectl get pods -v=8`로 확인 가능).

```
GET /api/v1/namespaces/default/pods/hello-6c8b4f9d7c-2xk4p
    └─┬─┘ └┬┘ └────────┬────────┘ └┬─┘ └────────┬────────┘
   코어그룹 버전    네임스페이스     리소스        이름
```

### 1.2 API 그룹과 버전

**한 줄 요약:** `apiVersion`은 그룹/버전이고, 버전은 안정성 등급이다(alpha는 프로덕션 금지).

리소스는 **그룹**으로 묶이고, 매니페스트의 `apiVersion`이 그룹과 버전을 지정한다.

| apiVersion | 대표 리소스 |
|---|---|
| `v1` (코어 그룹) | Pod, Service, ConfigMap, Secret, Namespace, Node, PersistentVolume |
| `apps/v1` | Deployment, StatefulSet, DaemonSet, ReplicaSet |
| `batch/v1` | Job, CronJob |
| `networking.k8s.io/v1` | Ingress, NetworkPolicy |
| `rbac.authorization.k8s.io/v1` | Role, RoleBinding, ClusterRole |
| `storage.k8s.io/v1` | StorageClass |

API 버전은 안정성을 나타낸다.

| 버전 | 의미 | 실무 지침 |
|---|---|---|
| `v1alpha1` | 실험적. 예고 없이 바뀌거나 사라질 수 있다 | 프로덕션 금지 |
| `v1beta1` | 잘 테스트됨. 하지만 필드가 바뀔 수 있다 | 신중하게. 마이그레이션 계획 필수 |
| `v1` | 안정. 하위 호환 보장 | 권장 |

어떤 `apiVersion`을 써야 할지 모를 때는 `kubectl api-resources | grep -i deployment`로 확인한다.

### 1.3 네임스페이스 스코프

**한 줄 요약:** 리소스는 네임스페이스에 속하거나 클러스터 전역이다.

리소스는 네임스페이스에 속하거나(namespaced), 클러스터 전역이다(cluster-scoped). 노드, 네임스페이스 자체, PersistentVolume, StorageClass, ClusterRole 등이 클러스터 전역 리소스다.

```bash
kubectl api-resources --namespaced=true
kubectl api-resources --namespaced=false
```

### 1.4 오브젝트의 공통 구조

**한 줄 요약:** apiVersion·kind(무엇인가) / metadata(누구인가) / spec(원하는 상태, 사람) / status(현재 상태, 시스템).

```yaml
apiVersion: apps/v1          # ① 어떤 API 그룹/버전인가   (TypeMeta)
kind: Deployment             # ② 어떤 종류인가            (TypeMeta)
metadata:                    # ③ 누구인가: 이름·라벨 등     (ObjectMeta)
  name: hello
  namespace: default
  labels:
    app: hello
spec:                        # ④ 원하는 상태 (kind마다 구조가 다름)
  replicas: 3
status:                      # ⑤ 현재 상태 (시스템이 채운다)
  readyReplicas: 3
```

- **apiVersion + kind**: API 서버가 어떤 스키마로 파싱할지 결정한다. 생략할 수 없다.
- **metadata**: `name`은 네임스페이스 안에서 유일하고, `uid`는 클러스터 전체에서 유일하며 재사용되지 않는다. 같은 이름으로 다시 만들어도 `uid`는 다르다.
- **spec**: 사람이 쓰는 "원하는 상태".
- **status**: 컨트롤러가 쓰는 "현재 상태". 매니페스트에 적어도 무시된다.

[13장](13-왜-쿠버네티스인가.md)에서 본 조정 루프가 바로 `spec`과 `status`를 비교해 차이를 줄이는 것이다.

### 1.5 소유 관계와 삭제

**한 줄 요약:** `ownerReferences`는 삭제를 연쇄시키고, `finalizers`는 정리가 끝날 때까지 삭제를 붙잡는다.

Deployment를 만들면 ReplicaSet과 Pod가 자동으로 생긴다. 이 관계는 `metadata.ownerReferences`에 기록된다. 소유자가 삭제되면 가비지 컬렉터가 소유된 오브젝트도 삭제하므로, **Deployment 하나를 지우면 ReplicaSet과 Pod가 모두 사라진다.**

```
Deployment/web
└─ ReplicaSet/web-6c8b4f9d7c
   ├─ Pod/web-6c8b4f9d7c-2xk4p
   ├─ Pod/web-6c8b4f9d7c-8mnvz
   └─ Pod/web-6c8b4f9d7c-klmno
```

또 **finalizers** 가 붙은 오브젝트는 삭제 요청을 받아도 즉시 사라지지 않고, 정리 작업이 끝나 파이널라이저 목록이 빌 때까지 남는다(예: 사용 중인 PVC 삭제 방지). 네임스페이스가 `Terminating`에서 멈추는 흔한 원인이다.

### 1.6 Event: 무슨 일이 있었나

**한 줄 요약:** 문제 해결의 첫 단계이며, Warning부터 보고, 1시간만 보관된다.

Event는 클러스터에서 일어난 일을 기록하는 오브젝트다. `kubectl describe`의 하단 Events 섹션이 같은 데이터를 보여 주며, 문제 해결의 첫 단계다. TYPE은 `Normal`과 `Warning` 둘뿐이고 문제를 찾을 때는 Warning부터 본다. 기본 보관 기간은 **1시간**이라 오래된 장애의 이벤트는 사라진다.

```bash
kubectl get events --sort-by=.lastTimestamp
kubectl get events --field-selector type=Warning
```

| Reason | 의미 |
|---|---|
| `FailedScheduling` | 배치할 노드를 찾지 못함 |
| `ImagePullBackOff` / `ErrImagePull` | 이미지를 가져올 수 없음 |
| `CrashLoopBackOff` | 컨테이너가 반복 종료 |
| `Unhealthy` | 프로브 실패 |
| `OOMKilled` | 메모리 한도 초과 |
| `FailedMount` | 볼륨 마운트 실패 |

---

## 코어 2. 라벨은 선택, 애노테이션은 부가 정보

### 2.1 라벨: 오브젝트를 묶는 유일한 방법

**한 줄 요약:** 폴더가 없으므로 라벨(key=value)로 묶고, 라벨은 시스템의 동작을 결정한다.

쿠버네티스에는 "폴더"가 없다. 오브젝트를 묶는 수단은 **라벨**(key=value)이다.

```yaml
metadata:
  labels:
    app: hello
    tier: frontend
    environment: production
```

라벨은 단순한 태그가 아니라 **시스템의 동작을 결정**한다. Service는 라벨 셀렉터로 대상 Pod를 찾고, ReplicaSet은 라벨로 자기 Pod를 식별하고, NetworkPolicy는 라벨로 통신 대상을 지정하며, 노드 라벨로 스케줄링 위치를 제어한다.

값은 63자 이내이며 영숫자로 시작하고 끝나야 한다. 권장 표준 라벨이 있다.

```yaml
labels:
  app.kubernetes.io/name: hello
  app.kubernetes.io/instance: hello-prod
  app.kubernetes.io/version: "1.2.0"
  app.kubernetes.io/component: api
  app.kubernetes.io/part-of: shop-system
```

### 2.2 셀렉터

**한 줄 요약:** 등가 기반과 집합 기반이 있고, Deployment 셀렉터는 생성 후 바꿀 수 없다.

**등가 기반** — 단순하다.

```bash
kubectl get pods -l app=hello
kubectl get pods -l app=hello,tier=frontend     # AND
kubectl get pods -l 'app!=hello'
```

**집합 기반** — 더 표현력이 높다.

```yaml
selector:
  matchLabels:
    app: hello
  matchExpressions:
    - key: environment
      operator: In          # In, NotIn, Exists, DoesNotExist
      values: [production, staging]
```

> **주의** — Deployment의 `selector`는 생성 후 바꿀 수 없다. 변하지 않을 최소한의 라벨만 셀렉터에 넣고, `version`처럼 자주 바뀌는 라벨은 `template.metadata.labels`에만 둔다.

### 2.3 느슨한 결합의 장점과 위험

**한 줄 요약:** 라벨만 바꾸면 Pod를 격리할 수 있지만, 셀렉터가 겹치면 컨트롤러끼리 Pod를 빼앗는다.

Service는 Pod의 이름을 모르고 라벨만 안다. 그래서 장애 Pod의 라벨만 바꾸면 Service에서 즉시 빠지고, ReplicaSet은 "하나 부족하다"며 새 Pod를 만든다. 서비스 용량을 유지한 채 문제 Pod를 격리해 분석할 수 있다.

```bash
kubectl label pod <pod-name> app=hello-debug --overwrite
```

반대로 셀렉터가 겹치는 컨트롤러 두 개를 만들면 서로 상대의 Pod를 자기 것으로 세고 지우려 든다.

라벨 조작 명령:

```bash
kubectl label pod <pod> environment=dev                 # 추가
kubectl label pod <pod> environment=staging --overwrite # 변경
kubectl label pod <pod> environment-                    # 제거 (하이픈)
kubectl get pods -L app,environment                     # 라벨을 열로 표시
```

### 2.4 애노테이션: 셀렉터에 쓰이지 않는 정보

**한 줄 요약:** 도구 설정·배포 이력·담당 팀 같은 부가 정보를 담고, 셀렉터에는 쓸 수 없다.

| | 라벨 | 애노테이션 |
|---|---|---|
| 목적 | **선택**과 그룹화 | 부가 정보 저장 |
| 셀렉터 사용 | 가능 | 불가 |
| 크기 제한 | 값 63자 | 총 256KB |

애노테이션은 도구가 읽는 설정(`prometheus.io/scrape: "true"` 등), 배포 이력(`kubernetes.io/change-cause`), 담당 팀 같은 사람이 읽는 정보에 쓴다. `kubectl apply`도 마지막으로 적용한 매니페스트를 애노테이션(`kubectl.kubernetes.io/last-applied-configuration`)에 저장한다.

---

## 코어 3. kubectl은 현재 컨텍스트로 가고, 선언형 `apply`가 기본

### 3.1 학습용 클러스터: minikube와 kind

**한 줄 요약:** 학습은 Minikube·kind·k3d, 직접 구축은 kubeadm 등, 프로덕션 표준은 매니지드.

클러스터를 만드는 방법은 목적에 따라 나뉜다.

| 목적 | 방법 | 특징 |
|---|---|---|
| 학습·개발 | Minikube, kind, k3d | 노트북에서 몇 분 만에 만들고 쉽게 버린다 |
| 직접 구축 | kubeadm, Kubespray, Talos | 온프레미스. 컨트롤 플레인까지 직접 운영 |
| 매니지드 | GKE, EKS, AKS | 컨트롤 플레인을 클라우드가 운영. 프로덕션 표준 |

- **Minikube**: VM 또는 컨테이너를 노드로 쓰는 로컬 도구. `minikube start`로 시작하고, 애드온(`minikube addons enable ingress` 등)이 편리하다.
- **kind (Kubernetes IN Docker)**: 각 노드가 Docker 컨테이너다. 멀티 노드 클러스터(예: 컨트롤 플레인 1 + 워커 2)를 노트북에서 만들 수 있고, 생성은 1&#126;2분, 삭제는 몇 초다.

```bash
kind create cluster --name quick       # 가장 단순한 단일 노드 클러스터
kubectl get nodes -o wide
kind delete cluster --name quick
```

클러스터를 만든 뒤 `kubectl get pods -n kube-system`을 보면 [13장](13-왜-쿠버네티스인가.md)의 컴포넌트가 실제로 떠 있다. etcd, kube-apiserver, kube-scheduler, kube-controller-manager는 kubelet이 로컬 파일로 직접 띄우는 **static Pod**이고, kube-proxy는 노드마다 하나씩(DaemonSet), coredns는 Deployment로 배포된다.

### 3.2 kubeconfig와 컨텍스트

**한 줄 요약:** kubectl은 API 서버와 대화하는 클라이언트이고, 명령은 항상 `current-context`가 가리키는 클러스터로 간다.

kubectl은 API 서버와 대화하는 클라이언트다. kubectl은 `~/.kube/config` 파일(kubeconfig)에서 접속 정보를 읽는다. 이 파일은 세 목록으로 이루어진다.

```yaml
apiVersion: v1
kind: Config
clusters:                      # 어떤 클러스터들이 있는가 (API 서버 주소, CA 인증서)
  - name: kind-k8s-guide
    cluster:
      server: https://127.0.0.1:6443
      certificate-authority-data: LS0tLS1CRUdJTi...
users:                         # 어떤 자격 증명이 있는가 (클라이언트 인증서·키 등)
  - name: kind-k8s-guide
    user:
      client-certificate-data: LS0tLS1CRUdJTi...
      client-key-data: LS0tLS1CRUdJTi...
contexts:                      # 클러스터 + 사용자 + 네임스페이스 조합
  - name: kind-k8s-guide
    context:
      cluster: kind-k8s-guide
      user: kind-k8s-guide
      namespace: default
current-context: kind-k8s-guide  # 지금 kubectl이 쓰는 컨텍스트
```

즉 **컨텍스트**는 (클러스터, 사용자, 기본 네임스페이스)의 조합이고, kubectl 명령은 항상 `current-context`가 가리키는 클러스터로 간다.

```bash
kubectl config get-contexts               # 목록
kubectl config current-context            # 현재
kubectl config use-context kind-k8s-guide # 전환
kubectl config set-context --current --namespace=dev   # 기본 네임스페이스 변경

# 여러 kubeconfig 파일을 함께 쓰기
export KUBECONFIG=~/.kube/config:~/.kube/prod-config
```

> **[보충]** kubeconfig의 `users` 항목에는 클러스터에 접속할 수 있는 자격 증명이 들어 있다. 이 파일은 비밀번호처럼 다루고, Git 저장소나 공유 폴더에 올리지 않는다.

> **실무에서 가장 흔한 사고**는 프로덕션 컨텍스트인 줄 모르고 명령을 실행하는 것이다. 프롬프트에 현재 컨텍스트를 표시하는 `kube-ps1`이나 전환 도구 `kubectx`/`kubens`를 쓰길 권한다.

### 3.3 필수 명령 패턴

**한 줄 요약:** 조회(`get`) · 진단(`describe`/`logs`/`exec`) · 탐색(`explain`) · 적용(`apply`/`diff`/`--dry-run=server`).

```bash
# 조회
kubectl get pods                    # 현재 네임스페이스
kubectl get pods -A                 # 모든 네임스페이스
kubectl get pods -o wide            # 노드·IP까지
kubectl get pods -w                 # 변화를 실시간 추적
kubectl get pods -l app=web         # 라벨 셀렉터

# 상세 정보와 디버깅
kubectl describe pod <name>         # 이벤트 포함 상세 (문제 해결 1순위)
kubectl logs <pod>
kubectl logs <pod> -c <container>   # 멀티 컨테이너 중 하나
kubectl logs <pod> --previous       # 재시작 전 로그
kubectl exec -it <pod> -- sh

# 출력 포맷
kubectl get pod <name> -o yaml
kubectl get pods -o jsonpath='{.items[*].metadata.name}'

# API 탐색
kubectl api-resources
kubectl explain pod.spec.containers

# 적용과 삭제
kubectl apply -f manifest.yaml
kubectl diff -f manifest.yaml
kubectl apply -f manifest.yaml --dry-run=server
kubectl delete -f manifest.yaml
```

`kubectl explain`은 클러스터가 직접 제공하는 문서다. 웹 문서를 뒤지기 전에 먼저 써 본다.

### 3.4 `apply` vs `create`, 그리고 `apply` 성공의 의미

**한 줄 요약:** 운영은 `apply`. 그러나 `apply` 성공은 "저장됨"일 뿐 "정상 동작"이 아니다.

> **`apply` vs `create`** — `create`는 새로 만들기만 하며 이미 있으면 에러다. `apply`는 없으면 만들고 있으면 차이만 반영한다. 선언적 접근([13장](13-왜-쿠버네티스인가.md))에 부합하므로 실무에서는 `apply`를 쓴다.

| | 명령형 (`create`, `run`, `set image`, `scale` 등) | 선언형 (`apply -f`) |
|---|---|---|
| 무엇을 전달하나 | "이것을 하라"는 동작 | "이 상태여야 한다"는 매니페스트 |
| 같은 명령을 두 번 실행 | `create`는 에러 | 차이가 없으면 아무 일도 없음 |
| 적합한 용도 | 학습, 임시 디버깅, 매니페스트 뼈대 생성 | 실제 운영(파일을 Git에 두고 이력 관리) |

**`apply`가 성공했다는 것은 앱이 정상 응답한다는 뜻이 아니다.** API 서버가 오브젝트를 받아 저장했다는 뜻일 뿐이고, 그 뒤 이미지 다운로드, IP 할당, 볼륨 연결, 앱 초기화가 각각 실패할 수 있다. 그래서 적용 후에는 `kubectl get pods`, `kubectl rollout status`로 실제 상태를 확인한다.

문제가 생기면 순서는 `get pods`(STATUS 확인) → `describe pod`(Events 확인) → `get events`다.

---

## 코어 4. YAML 매니페스트 작성과 관리

### 4.1 YAML 매니페스트 작성 규칙

**한 줄 요약:** 탭 금지, 불리언·숫자처럼 보이는 문자열은 따옴표, 설정 파일은 `|`.

문법은 단순하지만 실수하기 쉬운 지점이 있다.

1. **탭 문자 금지.** 들여쓰기는 스페이스만 쓴다.
2. **불리언·숫자처럼 보이는 문자열은 따옴표로 감싼다.**
   ```yaml
   data:
     enabled: "yes"     # 따옴표 없으면 true로 해석될 수 있다
     country: "NO"      # 따옴표 없으면 false
     version: "1.10"    # 따옴표 없으면 숫자 1.1
   ```
3. **리스트 들여쓰기**는 두 가지 형태(하이픈을 부모와 같은 열에 두거나 들여쓰기) 모두 유효하므로 팀 내에서 통일한다.
4. **`---`로 여러 오브젝트를 한 파일에** 담을 수 있다.
5. **멀티라인 문자열**: `|`는 개행을 보존하고, `>`는 개행을 공백으로 접는다. 설정 파일을 ConfigMap에 담을 때는 거의 항상 `|`를 쓴다.

### 4.2 매니페스트 작성 워크플로

**한 줄 요약:** 처음부터 손으로 쓰지 말고 뼈대 생성 → 수정 → 서버 검증 → diff → 적용.

처음부터 손으로 다 쓸 필요는 없다.

```bash
# ① 명령형으로 뼈대 생성
kubectl create deployment web --image=nginx:alpine --dry-run=client -o yaml > deployment.yaml
# ② 파일을 열어 필요한 필드 추가·수정
# ③ 서버 측 검증 (실제 적용 없이)
kubectl apply -f deployment.yaml --dry-run=server
# ④ 기존 상태와의 차이 확인
kubectl diff -f deployment.yaml
# ⑤ 적용
kubectl apply -f deployment.yaml
```

### 4.3 매니페스트가 많아지면: Helm과 Kustomize 개요

**한 줄 요약:** Helm은 템플릿+릴리스 관리, Kustomize는 base+오버레이 패치. 실무는 둘 다 쓴다.

`kubectl apply -f`만으로는 곧 한계가 온다. 환경(dev/prod)마다 replica 수, 이미지 태그, 리소스 값이 다른데 파일을 통째로 복사해 관리하면 금방 어긋난다. 이를 위한 대표 도구가 둘이다.

- **Helm** — **템플릿** 방식. **차트(chart)** 는 매니페스트 템플릿 묶음이고, **값(values)** 을 주입해 렌더링한 결과를 **릴리스(release)** 로 설치·추적한다. 릴리스 이력과 롤백(`helm rollback`)을 제공한다.
- **Kustomize** — **패치** 방식. 그 자체로 유효한 YAML인 `base/`를 두고, `overlays/dev`, `overlays/prod`에서 바뀌는 부분만 덧씌운다. `kubectl apply -k`로 kubectl에 내장되어 있다.

| | Helm | Kustomize |
|---|---|---|
| 방식 | 템플릿 렌더링 | YAML 패치 |
| 원본 파일 | 그 자체로는 유효한 YAML이 아님 | 유효한 YAML |
| 배포 | 별도 도구(`helm`) 필요 | `kubectl -k` 내장 |
| 릴리스 추적·롤백 | 있음 | 없음 |
| 서드파티 앱 설치 | 표준 | 어려움 |
| 학습 곡선 | 중간&#126;높음 | 낮음 |

원문은 **실무에서는 둘 다 쓴다**고 정리한다. Prometheus, cert-manager, ingress-nginx 같은 서드파티 앱은 제공되는 Helm 차트로 설치하고, 우리 애플리케이션은 Kustomize 오버레이로 환경별 차이를 관리하는 식이다. (설정 변경 시 롤아웃을 유도하는 두 도구의 기법은 [17장](17-ConfigMap과-Secret.md)에서 다룬다.)

---

## 실무 적용

### 체크리스트

- [ ] 모든 오브젝트는 `apiVersion`, `kind`, `metadata`, `spec`(사람이 씀), `status`(시스템이 씀)로 구성된다.
- [ ] `apiVersion`은 API 그룹/버전을 나타낸다. 코어 그룹은 `v1`, 나머지는 `apps/v1` 같은 형태이며 `alpha`는 프로덕션 금지다. 모르면 `kubectl api-resources`로 확인한다.
- [ ] `ownerReferences`는 소유 관계(삭제 연쇄)를, `finalizers`는 정리 작업 전 삭제 지연을 담당한다. Event는 1시간만 보관된다.
- [ ] **라벨은 선택·그룹화**, **애노테이션은 부가 정보**다. 느슨한 라벨 결합 덕분에 Pod 격리 같은 기법이 가능하다. Deployment의 셀렉터는 변경할 수 없으므로 변하지 않을 최소 라벨만 넣는다.
- [ ] kind/minikube로 로컬 클러스터를 만들 수 있다. 프로덕션은 대개 매니지드 서비스를 쓴다.
- [ ] kubectl은 `apply`(선언적), `describe`/`logs`/`events`(진단), `explain`(문서)이 핵심이며, kubeconfig의 현재 컨텍스트를 항상 확인한다(`kube-ps1`, `kubectx`/`kubens`). kubeconfig 파일은 비밀번호처럼 다룬다.
- [ ] `apply` 성공은 "저장됨"일 뿐 "정상 동작"이 아니다. `get pods`, `rollout status`로 확인하고, 문제 시 `get pods` → `describe pod` → `get events`.
- [ ] YAML: 탭 금지, `yes`/`NO`/`1.10` 같은 값은 따옴표, 설정 파일은 `|`.
- [ ] 환경별 매니페스트가 늘어나면 Helm(템플릿·릴리스 관리)이나 Kustomize(base + 오버레이 패치)를 쓴다.

### 시나리오로 확인하기

1. **상황:** 배포 담당자가 `kubectl apply -f deploy.yaml`이 `configured`로 끝나자 "배포 완료"를 공지했다. 10분 뒤 새 버전이 전혀 서비스되지 않고 있다는 제보가 왔다. 예전 C++ 서버 배포 스크립트처럼 "명령이 성공하면 끝"이라고 생각한 것이다.
   **질문:** 무엇을 오해했고, 무엇을 확인했어야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `apply` 성공은 API 서버가 오브젝트를 받아 저장했다는 뜻일 뿐이다. 그 뒤 이미지 다운로드, IP 할당, 볼륨 연결, 앱 초기화가 각각 실패할 수 있다. `kubectl get pods`, `kubectl rollout status`로 실제 상태를 확인하고, 문제가 있으면 `get pods` → `describe pod`(Events, 예: `ImagePullBackOff`) → `get events` 순으로 본다. → 코어 3

   </details>

2. **상황:** 개발 클러스터의 테스트 네임스페이스를 정리하려고 `kubectl delete`를 실행했는데, 직전에 다른 작업으로 `use-context`를 라이브 클러스터로 바꿔 둔 상태였다.
   **질문:** 왜 이런 일이 생기며, 어떤 장치로 막나?

   <details markdown="1"><summary>답 확인</summary>

   kubectl 명령은 별도 확인 없이 항상 kubeconfig의 `current-context`가 가리키는 클러스터로 간다. 프로덕션 컨텍스트인 줄 모르고 명령을 실행하는 것이 실무에서 가장 흔한 사고다. 프롬프트에 현재 컨텍스트를 표시하는 `kube-ps1`, 전환 도구 `kubectx`/`kubens`를 쓰고, 실행 전 `kubectl config current-context`로 확인한다. → 코어 3

   </details>

3. **상황:** Pod 3개 중 하나만 응답이 이상하게 느리다. 지우면 원인 분석 증거가 사라지고, 그냥 두면 유저 요청이 그 Pod로 간다.
   **질문:** 서비스 용량을 유지하면서 그 Pod만 격리하려면?

   <details markdown="1"><summary>답 확인</summary>

   그 Pod의 라벨을 바꾼다(`kubectl label pod <pod-name> app=hello-debug --overwrite`). Service는 라벨 셀렉터로만 Pod를 찾으므로 즉시 대상에서 빠지고, ReplicaSet은 "하나 부족하다"며 새 Pod를 만들어 용량이 유지된다. 격리된 Pod는 그대로 남아 분석할 수 있다. → 코어 2

   </details>

4. **상황:** 서버 설정을 ConfigMap으로 옮기면서 `country: NO`, `version: 1.10`을 따옴표 없이 적었다. 앱이 국가 코드를 `false`로, 버전을 `1.1`로 읽는다.
   **질문:** 원인과 해결은?

   <details markdown="1"><summary>답 확인</summary>

   YAML은 따옴표 없는 `NO`를 불리언 false로, `1.10`을 숫자 1.1로 해석할 수 있다(`yes`는 true). 불리언·숫자처럼 보이는 문자열은 따옴표로 감싼다. → 코어 4

   </details>

5. **상황:** 테스트용 네임스페이스를 지웠는데 몇 시간째 `Terminating`에서 멈춰 있다. 어제 저녁 장애 원인을 찾으려고 `kubectl get events`를 봤더니 아무것도 없다.
   **질문:** 두 현상을 각각 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   `finalizers`가 붙은 오브젝트는 정리 작업이 끝나 목록이 빌 때까지 삭제되지 않고 남는다(예: 사용 중인 PVC 삭제 방지). 이것이 네임스페이스가 `Terminating`에서 멈추는 흔한 원인이다. Event는 기본 보관 기간이 1시간이라 오래된 장애의 이벤트는 사라진다. → 코어 1

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1. API 오브젝트
  URL: /api/v1/namespaces/( ? )/( ? )/( ? )
  apiVersion: 코어 = ____ / Deployment = ____ / Job = ____ / Ingress = ____
  버전 안정성: alpha(____) → beta(____) → v1(____)
  스코프: namespaced vs ( ? ) — 예: ____, ____
  공통 구조: apiVersion / kind / metadata / ( ? ) / ( ? )
  ownerReferences → ( ? )   finalizers → ( ? )
  Event: Normal / ( ? ), 보관 ____

코어 2. 라벨·셀렉터·애노테이션
  셀렉터: 등가 기반 vs ( ? ) 기반 (In, NotIn, ____, ____)
  라벨 ____자 / 애노테이션 총 ____
  느슨한 결합: 장점(____) / 위험(____)
  Deployment 셀렉터: 생성 후 ____

코어 3. 클러스터와 kubectl
  학습용: ____, ____ / 직접 구축 / 매니지드
  kubeconfig: clusters / ( ? ) / ( ? ) + current-context
  create vs apply: ____
  apply 성공 = ____ (≠ 정상 동작)
  문제 해결 순서: ( ? ) → ( ? ) → ( ? )

코어 4. YAML 규칙 5가지 / 작성 워크플로 5단계
  Helm(____ 방식) vs Kustomize(____ 방식)
```

### 2. 인출 질문

1. (확인 질문 1) `spec`과 `status`는 각각 누가 쓰며, 조정 루프에서 어떤 역할을 하는가?

   <details markdown="1"><summary>답 확인</summary>

   `spec`은 사람이 쓰는 "원하는 상태", `status`는 컨트롤러가 쓰는 "현재 상태"다(매니페스트에 status를 적어도 무시된다). 조정 루프는 둘을 비교해 차이를 줄이는 방향으로 움직인다. → 코어 1

   </details>

2. (확인 질문 2) 라벨과 애노테이션의 차이는 무엇이고, Service가 Pod를 찾을 때 쓰는 것은 어느 쪽인가?

   <details markdown="1"><summary>답 확인</summary>

   라벨은 선택과 그룹화용으로 셀렉터에 쓸 수 있고 값은 63자 이내다. 애노테이션은 도구 설정·배포 이력·담당 팀 같은 부가 정보용으로 셀렉터에 쓸 수 없고 총 256KB까지다. Service는 **라벨** 셀렉터로 Pod를 찾는다. → 코어 2

   </details>

3. (확인 질문 3) YAML에 `enabled: yes`나 `version: 1.10`을 따옴표 없이 쓰면 어떤 문제가 생길 수 있는가?

   <details markdown="1"><summary>답 확인</summary>

   `yes`는 불리언 true로, `NO`는 false로, `1.10`은 숫자 1.1로 해석될 수 있다. 불리언·숫자처럼 보이는 문자열은 따옴표로 감싸야 한다. → 코어 4

   </details>

4. Deployment를 지우면 ReplicaSet과 Pod가 함께 사라지는 이유는? 네임스페이스가 `Terminating`에서 멈추는 흔한 원인은?

   <details markdown="1"><summary>답 확인</summary>

   소유 관계가 `metadata.ownerReferences`에 기록되어 있어, 소유자가 삭제되면 가비지 컬렉터가 소유된 오브젝트도 삭제한다. `finalizers`가 붙은 오브젝트는 정리 작업이 끝나 목록이 빌 때까지 남아 있으므로, 이것이 네임스페이스가 Terminating에서 멈추는 흔한 원인이다. → 코어 1

   </details>

5. 라벨의 느슨한 결합을 이용해 장애 Pod를 격리하는 방법과, 반대로 생기는 위험은?

   <details markdown="1"><summary>답 확인</summary>

   장애 Pod의 라벨만 바꾸면(`kubectl label pod <pod> app=hello-debug --overwrite`) Service에서 즉시 빠지고, ReplicaSet은 하나 부족하다며 새 Pod를 만들어 용량이 유지된 채 문제 Pod를 분석할 수 있다. 반대로 셀렉터가 겹치는 컨트롤러 두 개를 만들면 서로 상대의 Pod를 자기 것으로 세고 지우려 든다. → 코어 2

   </details>

6. Deployment 셀렉터에는 어떤 라벨을 넣어야 하나?

   <details markdown="1"><summary>답 확인</summary>

   Deployment의 `selector`는 생성 후 바꿀 수 없으므로 변하지 않을 최소한의 라벨만 넣고, `version`처럼 자주 바뀌는 라벨은 `template.metadata.labels`에만 둔다. → 코어 2

   </details>

7. kubeconfig의 구성과 "컨텍스트"의 의미, 실무에서 가장 흔한 사고는?

   <details markdown="1"><summary>답 확인</summary>

   kubeconfig는 clusters(API 서버 주소·CA), users(자격 증명), contexts(클러스터+사용자+기본 네임스페이스 조합)와 current-context로 이루어진다. kubectl은 항상 current-context의 클러스터로 간다. 가장 흔한 사고는 프로덕션 컨텍스트인 줄 모르고 명령을 실행하는 것이라 kube-ps1, kubectx/kubens를 권한다. 파일 자체도 비밀번호처럼 다룬다. → 코어 3

   </details>

8. `create`와 `apply`의 차이, 그리고 `apply` 성공이 의미하는 것은?

   <details markdown="1"><summary>답 확인</summary>

   `create`는 새로 만들기만 하며 이미 있으면 에러, `apply`는 없으면 만들고 있으면 차이만 반영하므로 선언적 접근에 맞다. `apply` 성공은 API 서버가 오브젝트를 저장했다는 뜻일 뿐이고, 이미지 다운로드·IP 할당·볼륨 연결·앱 초기화는 그 뒤에 각각 실패할 수 있어 `get pods`, `rollout status`로 확인한다. → 코어 3

   </details>

9. Helm과 Kustomize는 각각 어떤 방식이며, 실무에서는 어떻게 나눠 쓰나?

   <details markdown="1"><summary>답 확인</summary>

   Helm은 템플릿 방식으로 차트에 values를 주입해 릴리스로 설치·추적하며 롤백을 제공한다. Kustomize는 패치 방식으로 유효한 YAML인 base에 overlays로 바뀌는 부분만 덧씌우고 `kubectl apply -k`로 내장되어 있다. 실무에서는 서드파티 앱은 Helm 차트로, 우리 앱의 환경별 차이는 Kustomize 오버레이로 관리하는 식으로 둘 다 쓴다. → 코어 4

   </details>

### 3. 기억 고리

- **C++ 유추:** `apiVersion`+`kind` = 패킷 ID + 프로토콜 버전(어떤 구조체로 해석할지). ⚠️ 깨지는 곳: 오브젝트는 처리하고 버려지는 패킷이 아니라 etcd에 저장되어 계속 조정되는 상태다.
- **C++ 유추:** `ownerReferences` = `unique_ptr` 소유 트리. ⚠️ 깨지는 곳: 소멸자처럼 즉시 동기 호출되지 않고, 가비지 컬렉터가 정리하며 `finalizers`가 삭제를 붙잡을 수 있다.
- **비유:** 라벨 = 오브젝트 이마에 붙인 이름표, 셀렉터 = "이 이름표 단 사람 모여!"라는 호출. 이름표를 떼면 호출에서 빠진다(Pod 격리). ⚠️ 비유가 깨지는 지점: 한 오브젝트에 여러 라벨을 붙일 수 있고, 여러 컨트롤러가 동시에 같은 라벨로 호출하면 서로 Pod를 빼앗으려 하는 충돌이 생긴다.
- **묶음(3의 법칙):** 오브젝트 정체(apiVersion·kind·metadata) / 원하는 상태(spec) / 현재 상태(status). kubeconfig 3목록 = clusters·users·contexts. 문제 해결 3단계 = get pods → describe pod → get events.
- **대칭·순서:** 라벨(선택) ↔ 애노테이션(부가 정보), create(명령형) ↔ apply(선언형), Helm(템플릿) ↔ Kustomize(패치). 매니페스트 워크플로: 뼈대 생성 → 수정 → 서버 검증 → diff → apply.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Service는 Pod 이름을 모르는데 어떻게 트래픽을 보내는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "세션 매니저가 포인터 목록을 들고 있는 대신 '채널=3' 같은 조건으로 매번 대상을 고른다면 무엇이 편하고 무엇이 위험한가"로 라벨 셀렉터를 설명해 보세요.
- **랜덤 논리 게임:** A "환경별 매니페스트는 Helm 템플릿으로 관리해야 한다" vs B "유효한 YAML을 유지하는 Kustomize 오버레이가 낫다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 쿠버네티스 오브젝트 구조와 라벨·셀렉터를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main/02-워크로드-실행하기/04-쿠버네티스-API-오브젝트-모델.md (4.1 그룹·버전·스코프, 4.2 공통 구조·ownerReferences·finalizers·Spec과 Status, 4.3 라벨·셀렉터·애노테이션, 4.4 Event); 01-쿠버네티스로-가는-길/03-첫-클러스터-만들기.md (3.1 Minikube/kind, 3.2 kube-system 확인, 3.4 kubectl 기본기, 3.5 YAML 문법·워크플로); 부록/A-kubectl-치트시트.md (A.1&#126;A.3, 여러 kubeconfig 병합); 07-프로덕션-플레이북/30-패키징과-배포-파이프라인.md (들어가며, 30.1 Helm 개념, 30.2 Kustomize 접근·Helm vs Kustomize); kubernetes-qustion-book/02_심화/01_API와_제어_루프.md (4. apply 이후의 시간 순서)*
