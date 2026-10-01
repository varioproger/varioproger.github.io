---
title: "13장. API 오브젝트 모델, kubectl, YAML, 라벨"
parent: "3부. 쿠버네티스 핵심"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 13
---

# 13장. API 오브젝트 모델, kubectl, YAML, 라벨

## 이 장에서 배우는 것

- 모든 쿠버네티스 리소스가 따르는 공통 구조(apiVersion / kind / metadata / spec / status)를 이해한다.
- 라벨·셀렉터·애노테이션의 차이와 쓰임을 안다.
- kubeconfig와 컨텍스트, 명령형과 선언형(`create` vs `apply`)의 차이, kubectl의 핵심 명령 패턴과 YAML 작성 시 자주 하는 실수를 안다.
- 매니페스트 관리 도구(Helm, Kustomize)가 무엇을 해결하는지 개요를 안다.
- 학습용 클러스터(minikube, kind)가 무엇인지 개요를 안다.

---

## 1. 모든 것은 API 오브젝트다

쿠버네티스에는 수십 종의 리소스(Pod, Service, Deployment …)가 있지만 **모두 동일한 구조와 규칙**을 따른다. 규칙을 한 번 익히면 처음 보는 리소스도 `kubectl explain`으로 다룰 수 있다.

API 서버는 REST API이고, 리소스는 URL을 가진다. `kubectl`이 하는 일은 결국 이 URL을 호출하는 것이다(`kubectl get pods -v=8`로 확인 가능).

```
GET /api/v1/namespaces/default/pods/hello-6c8b4f9d7c-2xk4p
    └─┬─┘ └┬┘ └────────┬────────┘ └┬─┘ └────────┬────────┘
   코어그룹 버전    네임스페이스     리소스        이름
```

### API 그룹과 버전

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

### 네임스페이스 스코프

리소스는 네임스페이스에 속하거나(namespaced), 클러스터 전역이다(cluster-scoped). 노드, 네임스페이스 자체, PersistentVolume, StorageClass, ClusterRole 등이 클러스터 전역 리소스다.

```bash
kubectl api-resources --namespaced=true
kubectl api-resources --namespaced=false
```

## 2. 오브젝트의 공통 구조

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

12장에서 본 조정 루프가 바로 `spec`과 `status`를 비교해 차이를 줄이는 것이다.

### 소유 관계와 삭제

Deployment를 만들면 ReplicaSet과 Pod가 자동으로 생긴다. 이 관계는 `metadata.ownerReferences`에 기록된다. 소유자가 삭제되면 가비지 컬렉터가 소유된 오브젝트도 삭제하므로, **Deployment 하나를 지우면 ReplicaSet과 Pod가 모두 사라진다.**

```
Deployment/web
└─ ReplicaSet/web-6c8b4f9d7c
   ├─ Pod/web-6c8b4f9d7c-2xk4p
   ├─ Pod/web-6c8b4f9d7c-8mnvz
   └─ Pod/web-6c8b4f9d7c-klmno
```

또 **finalizers** 가 붙은 오브젝트는 삭제 요청을 받아도 즉시 사라지지 않고, 정리 작업이 끝나 파이널라이저 목록이 빌 때까지 남는다(예: 사용 중인 PVC 삭제 방지). 네임스페이스가 `Terminating`에서 멈추는 흔한 원인이다.

### Event: 무슨 일이 있었나

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

## 3. 라벨, 셀렉터, 애노테이션

### 라벨: 오브젝트를 묶는 유일한 방법

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

### 셀렉터

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

**느슨한 결합의 장점과 위험.** Service는 Pod의 이름을 모르고 라벨만 안다. 그래서 장애 Pod의 라벨만 바꾸면 Service에서 즉시 빠지고, ReplicaSet은 "하나 부족하다"며 새 Pod를 만든다. 서비스 용량을 유지한 채 문제 Pod를 격리해 분석할 수 있다.

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

### 애노테이션: 셀렉터에 쓰이지 않는 정보

| | 라벨 | 애노테이션 |
|---|---|---|
| 목적 | **선택**과 그룹화 | 부가 정보 저장 |
| 셀렉터 사용 | 가능 | 불가 |
| 크기 제한 | 값 63자 | 총 256KB |

애노테이션은 도구가 읽는 설정(`prometheus.io/scrape: "true"` 등), 배포 이력(`kubernetes.io/change-cause`), 담당 팀 같은 사람이 읽는 정보에 쓴다. `kubectl apply`도 마지막으로 적용한 매니페스트를 애노테이션(`kubectl.kubernetes.io/last-applied-configuration`)에 저장한다.

## 4. 학습용 클러스터: minikube와 kind

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

클러스터를 만든 뒤 `kubectl get pods -n kube-system`을 보면 12장의 컴포넌트가 실제로 떠 있다. etcd, kube-apiserver, kube-scheduler, kube-controller-manager는 kubelet이 로컬 파일로 직접 띄우는 **static Pod**이고, kube-proxy는 노드마다 하나씩(DaemonSet), coredns는 Deployment로 배포된다.

## 5. kubectl 기본기

kubectl은 API 서버와 대화하는 클라이언트다.

### kubeconfig와 컨텍스트

kubectl은 `~/.kube/config` 파일(kubeconfig)에서 접속 정보를 읽는다. 이 파일은 세 목록으로 이루어진다.

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

### 필수 명령 패턴

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

> **`apply` vs `create`** — `create`는 새로 만들기만 하며 이미 있으면 에러다. `apply`는 없으면 만들고 있으면 차이만 반영한다. 선언적 접근(12장)에 부합하므로 실무에서는 `apply`를 쓴다.

| | 명령형 (`create`, `run`, `set image`, `scale` 등) | 선언형 (`apply -f`) |
|---|---|---|
| 무엇을 전달하나 | "이것을 하라"는 동작 | "이 상태여야 한다"는 매니페스트 |
| 같은 명령을 두 번 실행 | `create`는 에러 | 차이가 없으면 아무 일도 없음 |
| 적합한 용도 | 학습, 임시 디버깅, 매니페스트 뼈대 생성 | 실제 운영(파일을 Git에 두고 이력 관리) |

**`apply`가 성공했다는 것은 앱이 정상 응답한다는 뜻이 아니다.** API 서버가 오브젝트를 받아 저장했다는 뜻일 뿐이고, 그 뒤 이미지 다운로드, IP 할당, 볼륨 연결, 앱 초기화가 각각 실패할 수 있다. 그래서 적용 후에는 `kubectl get pods`, `kubectl rollout status`로 실제 상태를 확인한다.

문제가 생기면 순서는 `get pods`(STATUS 확인) → `describe pod`(Events 확인) → `get events`다.

## 6. YAML 매니페스트 작성 규칙

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

### 매니페스트 작성 워크플로

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

### 매니페스트가 많아지면: Helm과 Kustomize 개요

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

원문은 **실무에서는 둘 다 쓴다**고 정리한다. Prometheus, cert-manager, ingress-nginx 같은 서드파티 앱은 제공되는 Helm 차트로 설치하고, 우리 애플리케이션은 Kustomize 오버레이로 환경별 차이를 관리하는 식이다. (설정 변경 시 롤아웃을 유도하는 두 도구의 기법은 16장에서 다룬다.)

## 핵심 요약

- 모든 오브젝트는 `apiVersion`, `kind`, `metadata`, `spec`(사람이 씀), `status`(시스템이 씀)로 구성된다.
- `apiVersion`은 API 그룹/버전을 나타낸다. 코어 그룹은 `v1`, 나머지는 `apps/v1` 같은 형태이며 `alpha`는 프로덕션 금지다.
- `ownerReferences`는 소유 관계(삭제 연쇄)를, `finalizers`는 정리 작업 전 삭제 지연을 담당한다. Event는 1시간만 보관된다.
- **라벨은 선택·그룹화**, **애노테이션은 부가 정보**다. 느슨한 라벨 결합 덕분에 Pod 격리 같은 기법이 가능하다. Deployment의 셀렉터는 변경할 수 없다.
- kind/minikube로 로컬 클러스터를 만들 수 있다. 프로덕션은 대개 매니지드 서비스를 쓴다.
- kubectl은 `apply`(선언적), `describe`/`logs`/`events`(진단), `explain`(문서)이 핵심이며, kubeconfig의 현재 컨텍스트를 항상 확인한다. `apply` 성공은 "저장됨"일 뿐 "정상 동작"이 아니다.
- 환경별 매니페스트가 늘어나면 Helm(템플릿·릴리스 관리)이나 Kustomize(base + 오버레이 패치)를 쓴다.

## 확인 질문

1. `spec`과 `status`는 각각 누가 쓰며, 조정 루프에서 어떤 역할을 하는가?
2. 라벨과 애노테이션의 차이는 무엇이고, Service가 Pod를 찾을 때 쓰는 것은 어느 쪽인가?
3. YAML에 `enabled: yes`나 `version: 1.10`을 따옴표 없이 쓰면 어떤 문제가 생길 수 있는가?

*원문 근거: kubernetes-textbook-main/02-워크로드-실행하기/04-쿠버네티스-API-오브젝트-모델.md (4.1 그룹·버전·스코프, 4.2 공통 구조·ownerReferences·finalizers·Spec과 Status, 4.3 라벨·셀렉터·애노테이션, 4.4 Event); 01-쿠버네티스로-가는-길/03-첫-클러스터-만들기.md (3.1 Minikube/kind, 3.2 kube-system 확인, 3.4 kubectl 기본기, 3.5 YAML 문법·워크플로); 부록/A-kubectl-치트시트.md (A.1&#126;A.3, 여러 kubeconfig 병합); 07-프로덕션-플레이북/30-패키징과-배포-파이프라인.md (들어가며, 30.1 Helm 개념, 30.2 Kustomize 접근·Helm vs Kustomize); kubernetes-qustion-book/02_심화/01_API와_제어_루프.md (4. apply 이후의 시간 순서)*
