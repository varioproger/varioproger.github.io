# 4장. 쿠버네티스 API 오브젝트 모델

> **학습목표**
> - API 그룹·버전·리소스·서브리소스의 관계를 설명할 수 있다.
> - 모든 오브젝트가 공유하는 공통 구조(TypeMeta / ObjectMeta / Spec / Status)를 이해한다.
> - 라벨과 셀렉터로 오브젝트를 그룹 지을 수 있고, 애노테이션과의 차이를 안다.
> - ownerReferences와 파이널라이저가 삭제 동작을 어떻게 바꾸는지 설명할 수 있다.
> - Event로 클러스터에서 벌어진 일을 추적할 수 있다.
> - `kubectl proxy`와 curl로 API 서버를 직접 호출할 수 있다.

---

## 들어가며: 왜 API를 먼저 배우는가

3장에서 Deployment와 Service를 만들어 봤다. 이제 곧바로 Pod로 넘어가고 싶겠지만, 그 전에 한 발 물러서서 **"쿠버네티스에서 오브젝트란 무엇인가"** 를 정리하고 가는 편이 훨씬 이득이다.

이유는 간단하다. 쿠버네티스에는 수십 종의 리소스가 있고, 확장하면 수백 종이 된다. 이것들을 하나씩 외우는 방식으로는 감당이 안 된다. 하지만 **모든 리소스는 동일한 구조와 동일한 규칙을 따른다.** 그 규칙을 한 번 익히면 처음 보는 리소스도 `kubectl explain` 몇 번으로 다룰 수 있다.

1장에서 말한 "쿠버네티스의 본질은 선언적 상태와 조정 루프"라는 문장에서, 이 장은 **"상태"가 저장되는 형식**을 다룬다.

## 4.1 API 그룹, 버전, 리소스, 서브리소스

### 모든 것은 REST 리소스다

쿠버네티스 API 서버는 REST API다. Pod, Service, Deployment는 모두 URL을 가진 리소스다.

```
GET /api/v1/namespaces/default/pods/hello-6c8b4f9d7c-2xk4p
    └─┬─┘ └┬┘ └────────┬────────┘ └┬─┘ └────────┬────────┘
   코어그룹 버전    네임스페이스     리소스        이름
```

`kubectl`이 하는 일도 결국 이 URL을 호출하는 것이다. 확인해 보자.

```bash
kubectl get pods -v=8 2>&1 | grep -E 'GET|Request'
```

```
I0901 10:23:11.123456   GET https://127.0.0.1:6443/api/v1/namespaces/default/pods?limit=500
```

`-v=6` 이상을 주면 kubectl이 어떤 HTTP 요청을 보내는지 볼 수 있다. 디버깅할 때 유용한 습관이다.

### API 그룹

리소스는 **그룹**으로 묶여 있다. URL 경로가 두 가지 형태인 이유가 여기 있다.

```
코어 그룹 (레거시, 그룹 이름이 빈 문자열)
  /api/v1/...
  → Pod, Service, ConfigMap, Secret, Namespace, Node, PersistentVolume ...

이름 있는 그룹
  /apis/<그룹>/<버전>/...
  → /apis/apps/v1/                    Deployment, StatefulSet, DaemonSet, ReplicaSet
  → /apis/batch/v1/                   Job, CronJob
  → /apis/networking.k8s.io/v1/       Ingress, NetworkPolicy
  → /apis/rbac.authorization.k8s.io/v1/  Role, RoleBinding, ClusterRole
  → /apis/storage.k8s.io/v1/          StorageClass, CSIDriver
  → /apis/apiextensions.k8s.io/v1/    CustomResourceDefinition
```

코어 그룹이 따로 있는 것은 역사적 이유다. 쿠버네티스 초기에는 그룹 개념이 없었고, 나중에 도입하면서 기존 리소스들은 그대로 두었다.

매니페스트의 `apiVersion` 필드가 이 그룹과 버전을 지정한다.

```yaml
apiVersion: v1              # 코어 그룹의 v1
kind: Pod

apiVersion: apps/v1         # apps 그룹의 v1
kind: Deployment

apiVersion: networking.k8s.io/v1
kind: Ingress
```

**그룹을 나눈 이유**는 셋이다. ① 리소스가 늘어나도 이름 충돌이 없다. ② 그룹별로 독립적으로 버전을 올릴 수 있다. ③ RBAC에서 그룹 단위로 권한을 줄 수 있다(17장).

### 버전과 안정성 단계

API 버전은 안정성을 나타낸다.

| 버전 | 의미 | 실무 지침 |
|---|---|---|
| `v1alpha1` | 실험적. 예고 없이 바뀌거나 사라질 수 있다. 기본 비활성 | 프로덕션 금지 |
| `v1beta1` | 잘 테스트됨. 하지만 필드가 바뀔 수 있다 | 신중하게. 마이그레이션 계획 필수 |
| `v1` | 안정. 하위 호환이 보장된다 | 권장 |

같은 리소스가 여러 버전으로 동시에 제공될 수 있다. 예를 들어 과거 Ingress는 `extensions/v1beta1` → `networking.k8s.io/v1beta1` → `networking.k8s.io/v1`로 이동했다. **어떤 버전으로 저장하든 etcd에는 하나의 스토리지 버전으로만 저장되고, 읽을 때 요청한 버전으로 변환된다.** 이 변환 메커니즘은 26장에서 CRD 버저닝을 다룰 때 다시 나온다.

폐기 예정 API를 찾는 법:

```bash
# 클러스터에서 사용 중인 폐기 예정 API 확인
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis

# 매니페스트 정적 검사 (별도 도구)
pluto detect-files -d ./manifests/
```

32장의 클러스터 업그레이드에서 이 점검이 필수 단계다.

### 리소스와 서브리소스

하나의 리소스는 여러 **서브리소스**를 가질 수 있다. 서브리소스는 별도의 엔드포인트이고, 별도의 RBAC 권한을 갖는다.

```
/api/v1/namespaces/default/pods/hello           ← 리소스 본체
/api/v1/namespaces/default/pods/hello/status    ← status 서브리소스
/api/v1/namespaces/default/pods/hello/log       ← 로그
/api/v1/namespaces/default/pods/hello/exec      ← 명령 실행
/api/v1/namespaces/default/pods/hello/portforward
/apis/apps/v1/namespaces/default/deployments/web/scale   ← 스케일
```

서브리소스가 분리되어 있어서 중요한 결과가 생긴다.

**① 권한을 분리할 수 있다.** "Pod를 볼 수는 있지만 `exec`으로 들어갈 수는 없는" 역할을 만들 수 있다.

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
  # pods/exec 이 없으므로 exec 불가
```

**② `scale` 서브리소스 덕분에 HPA가 범용적이다.** HPA는 Deployment인지 StatefulSet인지 커스텀 리소스인지 몰라도 `/scale` 엔드포인트만 있으면 스케일할 수 있다(16장). 26장에서 CRD에 `scale` 서브리소스를 붙이는 것도 이 때문이다.

**③ `status`를 분리하면 컨트롤러와 사용자의 쓰기 영역이 겹치지 않는다.** 사용자는 `spec`을, 컨트롤러는 `status`를 쓴다.

### 네임스페이스 스코프와 클러스터 스코프

리소스는 네임스페이스에 속하거나(namespaced), 클러스터 전역이다(cluster-scoped).

```bash
kubectl api-resources --namespaced=true | head
kubectl api-resources --namespaced=false
```

```
# 클러스터 스코프의 예
namespaces, nodes, persistentvolumes, storageclasses,
clusterroles, clusterrolebindings, customresourcedefinitions
```

URL에도 차이가 나타난다.

```
/api/v1/namespaces/default/pods    ← namespaced
/api/v1/nodes                       ← cluster-scoped
```

13장에서 네임스페이스를 다룰 때 "네임스페이스로 격리할 수 있는 것과 없는 것"의 경계가 바로 이 구분이다.

### API 탐색 명령 정리

```bash
kubectl api-versions                       # 사용 가능한 그룹/버전 전체
kubectl api-resources                      # 리소스 목록 (약칭, 그룹, 스코프 포함)
kubectl api-resources --api-group=apps     # 특정 그룹만
kubectl api-resources -o wide              # verbs(가능한 동작)까지 표시
```

`-o wide`의 VERBS 열이 유용하다.

```
NAME          SHORTNAMES   APIVERSION   NAMESPACED   KIND         VERBS
deployments   deploy       apps/v1      true         Deployment   [create delete get list patch update watch]
```

`watch`가 있다는 것에 주목하자. 이것이 25장에서 Informer가 동작하는 기반이다.

## 4.2 오브젝트의 공통 구조

모든 쿠버네티스 오브젝트는 네 부분으로 이루어진다.

```yaml
# ── TypeMeta ────────────────────────
apiVersion: apps/v1
kind: Deployment

# ── ObjectMeta ──────────────────────
metadata:
  name: hello
  namespace: default
  uid: 3f2a1b9c-4d5e-6f70-8192-a3b4c5d6e7f8
  resourceVersion: "142857"
  generation: 3
  creationTimestamp: "2026-09-01T10:00:00Z"
  labels:
    app: hello
  annotations:
    kubernetes.io/change-cause: "image updated to 1.1"

# ── Spec (원하는 상태) ────────────────
spec:
  replicas: 3
  ...

# ── Status (현재 상태, 시스템이 채움) ──
status:
  replicas: 3
  readyReplicas: 3
  observedGeneration: 3
  conditions:
    - type: Available
      status: "True"
```

### TypeMeta — 무엇인가

`apiVersion` + `kind`. 이 둘만 있으면 API 서버가 어떤 스키마로 파싱할지 결정할 수 있다. 매니페스트에서 절대 생략할 수 없는 이유다.

### ObjectMeta — 누구인가

식별과 관리를 위한 필드들이다. 중요한 것만 짚는다.

**`name`과 `uid`**
- `name`은 네임스페이스 안에서 유일하다. 삭제 후 같은 이름으로 다시 만들 수 있다.
- `uid`는 클러스터 전체에서 유일하며 재사용되지 않는다. **"같은 이름의 다른 오브젝트"를 구분하는 것은 uid다.**

이 차이가 중요한 순간이 있다. Pod를 삭제하고 같은 이름으로 다시 만들면 `name`은 같지만 `uid`는 다르다. 컨트롤러는 uid로 판단하므로 혼동하지 않는다.

**`resourceVersion` — 낙관적 동시성 제어**

오브젝트가 변경될 때마다 증가하는 불투명한 문자열이다. 두 가지 용도가 있다.

① **충돌 감지.** 업데이트 요청에 현재 알고 있는 `resourceVersion`을 담아 보낸다. 그 사이 다른 누군가가 오브젝트를 바꿨다면 값이 달라져 있고, API 서버는 `409 Conflict`를 반환한다.

```bash
# 두 터미널에서 동시에 편집하면 이런 에러를 본다
error: Operation cannot be fulfilled on deployments.apps "hello":
the object has been modified; please apply your changes to the latest version
```

이 때문에 컨트롤러는 항상 **"읽기 → 수정 → 쓰기, 실패하면 재시도"** 루프를 돈다. 27장에서 오퍼레이터를 만들 때 이 패턴을 직접 구현한다.

② **watch 재개 지점.** 클라이언트가 연결이 끊겼다가 재접속할 때 "이 resourceVersion 이후의 변경만 달라"고 요청할 수 있다. Informer의 핵심 메커니즘이다(25장).

**`generation`과 `observedGeneration`**

- `generation`: **spec이 바뀔 때마다** 증가한다(status 변경은 무관).
- `status.observedGeneration`: 컨트롤러가 **마지막으로 처리한** generation.

두 값을 비교하면 "컨트롤러가 내 변경을 아직 반영 중인지"를 알 수 있다.

```bash
kubectl get deploy hello -o jsonpath='{.metadata.generation} / {.status.observedGeneration}{"\n"}'
# 4 / 3   ← 아직 반영 중
# 4 / 4   ← 반영 완료
```

`kubectl rollout status`가 내부적으로 확인하는 값 중 하나다.

**`ownerReferences` — 소유 관계와 가비지 컬렉션**

3장에서 Deployment를 만들었더니 ReplicaSet과 Pod가 자동으로 생겼다. 이 관계가 기록되는 곳이다.

```bash
kubectl get pod -l app=hello -o jsonpath='{.items[0].metadata.ownerReferences}' | jq
```

```json
[
  {
    "apiVersion": "apps/v1",
    "kind": "ReplicaSet",
    "name": "hello-6c8b4f9d7c",
    "uid": "a1b2c3d4-...",
    "controller": true,
    "blockOwnerDeletion": true
  }
]
```

**가비지 컬렉터**는 이 참조를 따라간다. 소유자가 삭제되면 소유된 오브젝트도 삭제한다(cascade). 그래서 Deployment 하나를 지우면 ReplicaSet과 Pod가 모두 사라진다.

삭제 방식은 세 가지다.

```bash
# ① Background (기본) — 소유자 먼저 삭제, 자식은 GC가 비동기로 정리
kubectl delete deploy hello

# ② Foreground — 자식을 모두 지운 뒤 소유자 삭제
kubectl delete deploy hello --cascade=foreground

# ③ Orphan — 자식을 남긴다
kubectl delete deploy hello --cascade=orphan
kubectl get rs    # ReplicaSet이 살아남아 Pod를 계속 유지한다
```

`--cascade=orphan`은 컨트롤러를 교체하면서 Pod는 유지하고 싶을 때 쓰는 고급 기법이다.

**`finalizers` — 삭제를 붙잡아 두는 장치**

파이널라이저가 붙은 오브젝트는 **삭제 요청을 받아도 즉시 사라지지 않는다.** 대신 `metadata.deletionTimestamp`가 설정되고, 파이널라이저 목록이 빌 때까지 오브젝트가 남는다.

```yaml
metadata:
  name: my-pvc
  deletionTimestamp: "2026-09-01T10:30:00Z"   # 삭제 요청됨
  finalizers:
    - kubernetes.io/pvc-protection            # 아직 이게 남아 있어 삭제 안 됨
```

용도는 **정리 작업 보장**이다. PVC가 Pod에 사용 중이면 삭제를 막고(12장), 클라우드 로드밸런서를 만든 Service는 실제 LB를 지운 뒤에 사라진다.

> **⚠️ 자주 겪는 상황: 네임스페이스가 Terminating에서 멈춤**
> 담당 컨트롤러가 죽어 파이널라이저를 제거해 줄 주체가 없으면 오브젝트가 영원히 남는다.
> ```bash
> kubectl get ns stuck-ns -o jsonpath='{.spec.finalizers}'
> ```
> 원인을 먼저 찾되, 정말 불가피하면 파이널라이저를 직접 제거한다.
> ```bash
> kubectl patch ns stuck-ns -p '{"metadata":{"finalizers":[]}}' --type=merge
> ```
> **이것은 최후의 수단이다.** 정리되지 않은 외부 자원(클라우드 LB, 볼륨)이 남아 비용이 계속 청구될 수 있다.

27장에서 오퍼레이터에 파이널라이저를 직접 추가한다.

### Spec과 Status — 조정 루프의 양 끝

1장에서 본 조정 루프를 다시 떠올려 보자. 컨트롤러는 **`spec`(원하는 상태)** 과 **`status`(현재 상태)** 를 비교해 차이를 줄인다.

```
        spec.replicas: 3          ← 사람이 쓴다
             │
             ▼
        [컨트롤러가 비교]
             │
             ▼
        status.replicas: 2        ← 컨트롤러가 쓴다
        status.readyReplicas: 2
```

**`status`는 사람이 쓰지 않는다.** 매니페스트에 status를 적어도 무시된다. 저장된 오브젝트를 그대로 다른 클러스터에 적용하려 할 때 status와 시스템 필드를 걷어내야 하는 이유다.

```bash
# 지저분한 필드를 제거해 깨끗한 매니페스트 얻기
kubectl get deploy hello -o yaml | kubectl neat > clean.yaml
```

### Conditions — 상태를 표현하는 표준 패턴

`status.conditions`는 쿠버네티스 전반에서 쓰는 표준 구조다.

```yaml
status:
  conditions:
    - type: Available
      status: "True"           # "True" / "False" / "Unknown"
      lastTransitionTime: "2026-09-01T10:05:00Z"
      reason: MinimumReplicasAvailable
      message: Deployment has minimum availability.
    - type: Progressing
      status: "True"
      reason: NewReplicaSetAvailable
```

세 가지 값을 갖는 이유가 중요하다. `"Unknown"`은 **"아직 판단할 수 없다"** 를 의미한다. 노드가 응답하지 않을 때 `Ready=Unknown`이 되는데, 이것은 `Ready=False`(확실히 준비 안 됨)와 다르다. 15장의 테인트 기반 축출이 이 차이를 이용한다.

```bash
kubectl get deploy hello -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'
```

26장에서 커스텀 리소스에 status를 설계할 때 이 패턴을 그대로 따르는 것이 관례다.

## 4.3 라벨, 셀렉터, 애노테이션

### 라벨 — 오브젝트를 그룹 짓는 유일한 방법

쿠버네티스에는 "폴더"가 없다. 오브젝트를 묶는 유일한 수단이 **라벨**이다.

```yaml
metadata:
  labels:
    app: hello
    tier: frontend
    environment: production
    version: "1.2"
```

**라벨은 그저 태그가 아니다. 시스템의 동작을 결정한다.**

- Service는 라벨 셀렉터로 대상 Pod를 찾는다(9장).
- ReplicaSet은 라벨로 자기 Pod를 식별한다(8장).
- NetworkPolicy는 라벨로 통신을 허용할 대상을 지정한다(18장).
- 노드 라벨로 스케줄링 위치를 제어한다(15장).

**라벨 값의 제약**: 63자 이내, 영숫자로 시작하고 끝나며, 중간에 `-`, `_`, `.` 허용. 슬래시가 있으면 앞부분이 접두사(prefix)다.

```yaml
labels:
  app.kubernetes.io/name: hello       # 접두사가 있는 형태
```

**권장 표준 라벨**이 정해져 있다. Helm 차트나 오퍼레이터가 생성하는 리소스는 대부분 이것을 따른다.

```yaml
labels:
  app.kubernetes.io/name: hello           # 애플리케이션 이름
  app.kubernetes.io/instance: hello-prod  # 이 설치 인스턴스
  app.kubernetes.io/version: "1.2.0"
  app.kubernetes.io/component: api
  app.kubernetes.io/part-of: shop-system
  app.kubernetes.io/managed-by: helm
```

팀 규모가 커질수록 이 컨벤션의 가치가 커진다. 30장에서 Helm 차트를 만들 때 이 라벨들을 자동으로 붙인다.

### 셀렉터 두 종류

**등가 기반(equality-based)** — 단순하고 대부분의 경우 충분하다.

```yaml
selector:
  app: hello
  tier: frontend      # AND 조건
```

```bash
kubectl get pods -l app=hello
kubectl get pods -l app=hello,tier=frontend     # AND
kubectl get pods -l 'app!=hello'
```

**집합 기반(set-based)** — 더 표현력이 높다.

```yaml
selector:
  matchLabels:
    app: hello
  matchExpressions:
    - key: environment
      operator: In                # In, NotIn, Exists, DoesNotExist
      values: [production, staging]
    - key: deprecated
      operator: DoesNotExist
```

```bash
kubectl get pods -l 'environment in (production,staging)'
kubectl get pods -l 'version'          # 라벨이 존재하기만 하면
kubectl get pods -l '!version'         # 라벨이 없는 것
```

> **⚠️ Deployment의 selector는 변경할 수 없다**
> ```yaml
> spec:
>   selector:
>     matchLabels:
>       app: hello        # 생성 후 immutable
> ```
> 이것을 바꾸려면 Deployment를 삭제하고 다시 만들어야 한다. 처음 설계할 때 **변하지 않을 최소한의 라벨만** 셀렉터에 넣는 것이 요령이다. `version` 같은 자주 바뀌는 라벨은 셀렉터가 아니라 `template.metadata.labels`에만 둔다.

### 애노테이션 — 셀렉터에 쓰이지 않는 메타데이터

라벨과 애노테이션의 차이는 명확하다.

| | 라벨 | 애노테이션 |
|---|---|---|
| 목적 | **선택**과 그룹화 | 부가 정보 저장 |
| 셀렉터 사용 | ✅ | ❌ |
| 크기 제한 | 값 63자 | 총 256KB |
| 값 형식 | 제한적 | 임의 문자열(JSON 등 가능) |

애노테이션의 전형적 용도:

```yaml
metadata:
  annotations:
    # 도구가 읽는 설정
    nginx.ingress.kubernetes.io/rewrite-target: /
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"

    # 배포 이력
    kubernetes.io/change-cause: "rollback to 1.1 due to memory leak"

    # 사람이 읽는 정보
    team: platform
    oncall-slack: "#platform-oncall"
```

**시스템도 애노테이션을 쓴다.** `kubectl apply`는 마지막으로 적용한 매니페스트 전체를 `kubectl.kubernetes.io/last-applied-configuration`에 저장해 3-way merge에 사용한다.

```bash
kubectl get deploy hello -o jsonpath='{.metadata.annotations}' | jq keys
```

### 실습: 라벨로 오브젝트 조작하기

```bash
# 라벨 추가
kubectl label pod <pod-name> environment=dev

# 라벨 변경 (덮어쓰기)
kubectl label pod <pod-name> environment=staging --overwrite

# 라벨 제거 (뒤에 하이픈)
kubectl label pod <pod-name> environment-

# 라벨을 열로 표시
kubectl get pods -L app,environment

# 라벨로 일괄 삭제
kubectl delete pods -l environment=dev
```

**디버깅 요령 — Pod를 Service에서 떼어내기**

장애 중인 Pod를 살려 둔 채 트래픽만 차단하고 싶을 때가 있다.

```bash
# Service의 셀렉터가 app=hello 라면
kubectl label pod hello-6c8b4f9d7c-2xk4p app=hello-debug --overwrite
```

이 Pod는 즉시 Service의 엔드포인트에서 빠진다. 그런데 ReplicaSet도 이 Pod를 자기 것으로 인식하지 못하게 되므로, "3개가 부족하다"고 판단해 새 Pod를 하나 더 만든다. **결과적으로 서비스는 정상 용량을 유지한 채 문제 Pod를 격리해 분석할 수 있다.** 실무에서 매우 유용한 기법이다.

## 4.4 Event로 클러스터 관찰하기

Event는 "무슨 일이 일어났는지"를 기록하는 오브젝트다. 다른 리소스와 마찬가지로 API 오브젝트이며, etcd에 저장된다.

```bash
kubectl get events --sort-by=.lastTimestamp
```

```
LAST SEEN   TYPE      REASON              OBJECT             MESSAGE
2m          Normal    Scheduled           pod/hello-2xk4p    Successfully assigned default/hello-2xk4p to k8s-guide-worker
2m          Normal    Pulled              pod/hello-2xk4p    Container image "hello:1.0" already present on machine
2m          Normal    Created             pod/hello-2xk4p    Created container hello
2m          Normal    Started             pod/hello-2xk4p    Started container hello
30s         Warning   Unhealthy           pod/hello-8mnvz    Readiness probe failed: HTTP probe failed with statuscode: 500
```

`TYPE`은 `Normal`과 `Warning` 둘뿐이다. 문제를 찾을 때는 Warning부터 본다.

```bash
kubectl get events --field-selector type=Warning
kubectl get events --field-selector involvedObject.name=hello-2xk4p
kubectl get events -A --sort-by=.lastTimestamp | tail -20
kubectl get events -w                     # 실시간 관찰
```

`kubectl describe`의 하단 Events 섹션도 같은 데이터를 보여 준다. 실무에서 문제 해결의 첫 단계가 `describe`인 이유다.

> **⚠️ Event는 영구 보관되지 않는다**
> 기본 보관 기간은 **1시간**이다(`--event-ttl` 플래그로 조정). 어제 발생한 장애의 이벤트는 이미 사라졌다.
> 따라서 프로덕션에서는 이벤트를 외부로 내보내야 한다. 31장에서 이벤트 익스포터로 장기 보관하는 방법을 다룬다.

**자주 마주치는 Reason 목록**

| Reason | 의미 | 확인할 곳 |
|---|---|---|
| `FailedScheduling` | 배치할 노드를 찾지 못함 | 리소스 부족? 테인트? 어피니티? (15장) |
| `ImagePullBackOff` / `ErrImagePull` | 이미지를 가져올 수 없음 | 이미지 이름, 태그, 레지스트리 인증 |
| `CrashLoopBackOff` | 컨테이너가 반복 종료 | `kubectl logs --previous` (6장) |
| `Unhealthy` | 프로브 실패 | 프로브 설정과 앱 상태 (6장) |
| `OOMKilled` | 메모리 한도 초과 | `limits.memory` (14장) |
| `FailedMount` | 볼륨 마운트 실패 | PVC 상태, 노드 접근성 (12장) |
| `NodeNotReady` | 노드 이상 | 노드 상태, kubelet (20장) |
| `Preempted` | 우선순위가 높은 Pod에 밀려남 | PriorityClass (15장) |

## 4.5 실습: API 서버 직접 호출하기

`kubectl`이라는 껍데기를 벗고 API를 직접 만져 본다. 이 경험은 25장에서 client-go를 다룰 때 큰 도움이 된다.

**① kubectl proxy로 인증을 위임받기**

```bash
kubectl proxy --port=8001 &
```

이제 `localhost:8001`로 보낸 요청이 인증 정보와 함께 API 서버로 전달된다.

**② 리소스 목록 조회**

```bash
# API 그룹 목록
curl -s localhost:8001/apis | jq -r '.groups[].name'

# 코어 그룹의 리소스들
curl -s localhost:8001/api/v1 | jq -r '.resources[].name' | head -20

# Pod 목록
curl -s localhost:8001/api/v1/namespaces/default/pods | jq -r '.items[].metadata.name'
```

**③ 특정 오브젝트 조회**

```bash
curl -s localhost:8001/api/v1/namespaces/default/pods/<pod-name> \
  | jq '{name: .metadata.name, node: .spec.nodeName, phase: .status.phase}'
```

**④ 오브젝트 생성 — POST**

```bash
curl -s -X POST localhost:8001/api/v1/namespaces/default/pods \
  -H 'Content-Type: application/json' \
  -d '{
    "apiVersion": "v1",
    "kind": "Pod",
    "metadata": {"name": "api-made", "labels": {"made-by": "curl"}},
    "spec": {
      "containers": [{"name": "c", "image": "busybox", "command": ["sleep","3600"]}]
    }
  }' | jq '.metadata.name'

kubectl get pod api-made
```

kubectl 없이 Pod를 만들었다. **kubectl은 이 HTTP 요청을 편하게 만들어 주는 도구일 뿐이다.**

**⑤ watch — 변경 스트림 구독하기**

이것이 이 실습의 하이라이트다.

```bash
curl -s -N "localhost:8001/api/v1/namespaces/default/pods?watch=true" \
  | jq -c '{type: .type, name: .object.metadata.name, phase: .object.status.phase}'
```

연결이 유지된 채로 대기한다. 다른 터미널에서:

```bash
kubectl delete pod api-made
kubectl run test --image=busybox --command -- sleep 3600
```

첫 터미널에 이벤트가 실시간으로 흘러나온다.

```json
{"type":"MODIFIED","name":"api-made","phase":"Running"}
{"type":"DELETED","name":"api-made","phase":"Running"}
{"type":"ADDED","name":"test","phase":"Pending"}
{"type":"MODIFIED","name":"test","phase":"Running"}
```

**이 스트림이 쿠버네티스 전체를 움직이는 신경계다.** 모든 컨트롤러, kubelet, kube-proxy는 이 watch를 구독하고 있다가 변경을 감지하면 조정 루프를 돈다. 폴링이 아니라 푸시 방식이기 때문에 수천 개 오브젝트를 가진 클러스터에서도 반응이 빠르다.

25장에서 만들 Informer는 이 watch 위에 캐시와 재연결 로직을 얹은 것이다.

**⑥ 정리**

```bash
kubectl delete pod test --ignore-not-found
kill %1        # kubectl proxy 종료
```

## 4.6 kubectl explain — 문서 없이 필드 찾기

새 리소스를 만날 때마다 웹 문서를 뒤지는 대신 이 명령을 쓴다.

```bash
kubectl explain pod
kubectl explain pod.spec
kubectl explain pod.spec.containers
kubectl explain pod.spec.containers.livenessProbe
kubectl explain pod.spec.containers.resources --recursive
```

```
KIND:       Pod
VERSION:    v1
FIELD: containers <[]Container>
DESCRIPTION:
    List of containers belonging to the pod. Containers cannot currently be
    added or removed. There must be at least one container in a Pod.
FIELDS:
  args     <[]string>
  command  <[]string>
  env      <[]EnvVar>
  ...
```

**이 정보는 클러스터가 직접 제공한다.** API 서버가 OpenAPI 스펙을 게시하고 kubectl이 그것을 읽는 구조라, **설치된 CRD에도 그대로 동작한다.**

```bash
# 커스텀 리소스도 explain으로 탐색 가능
kubectl explain certificate.spec        # cert-manager를 설치했다면
```

26장에서 CRD에 OpenAPI 스키마를 잘 써야 하는 이유가 이것이다. 스키마가 곧 문서가 된다.

OpenAPI 스펙 원본을 직접 볼 수도 있다.

```bash
kubectl get --raw /openapi/v3 | jq -r 'keys[]' | head
```

---

## 실습 과제

**과제 1 — watch로 롤링 업데이트 관찰하기**
`kubectl proxy`와 curl watch를 띄워 둔 상태에서 Deployment의 이미지를 바꾼다. Pod가 생성·삭제되는 순서와 phase 전이를 기록하고, 왜 그 순서인지 설명해 본다(8장에서 답을 확인한다).

**과제 2 — 라벨로 카나리 만들기**
Service 셀렉터를 `app: hello`로 두고, `version: "1.0"` Pod 3개와 `version: "2.0"` Pod 1개를 띄운다. curl을 20번 반복해 두 버전의 응답 비율을 세어 본다. 라벨만으로 4:1 트래픽 분배를 구현한 셈이다. 이 방식의 한계는 무엇인가?

**과제 3 — 파이널라이저 실험**
직접 만든 ConfigMap에 임의의 파이널라이저를 붙여 본다.
```bash
kubectl create configmap fin-test --from-literal=a=b
kubectl patch configmap fin-test -p '{"metadata":{"finalizers":["example.com/my-finalizer"]}}' --type=merge
kubectl delete configmap fin-test        # 멈춘다
kubectl get configmap fin-test -o jsonpath='{.metadata.deletionTimestamp}'
```
그다음 파이널라이저를 제거해 삭제가 완료되는 것을 확인한다.

**과제 4 — 소유 관계 추적**
```bash
kubectl krew install tree      # 미설치 시
kubectl tree deployment hello
```
Deployment → ReplicaSet → Pod의 트리를 확인하고, 각 단계의 `ownerReferences`를 `-o yaml`로 직접 읽어 uid가 어떻게 연결되는지 확인한다.

---

## 요약

- 쿠버네티스 API는 **그룹 / 버전 / 리소스 / 서브리소스**로 조직된다. 코어 그룹은 `/api/v1`, 나머지는 `/apis/<그룹>/<버전>`이다. `v1alpha1`은 프로덕션 금지, `v1beta1`은 마이그레이션 계획 필수.
- 모든 오브젝트는 **TypeMeta**(무엇인가), **ObjectMeta**(누구인가), **Spec**(원하는 상태), **Status**(현재 상태)를 갖는다. spec은 사람이, status는 컨트롤러가 쓴다.
- `resourceVersion`은 **낙관적 동시성 제어**와 **watch 재개**에 쓰인다. `generation`과 `observedGeneration`을 비교하면 컨트롤러가 변경을 반영했는지 알 수 있다.
- `ownerReferences`는 **가비지 컬렉션**의 근거이고, `finalizers`는 **정리 작업이 끝날 때까지 삭제를 막는다.** 네임스페이스가 Terminating에서 멈추는 대부분의 원인이 파이널라이저다.
- **라벨은 선택을 위한 것, 애노테이션은 정보를 위한 것.** Deployment의 셀렉터는 변경 불가이므로 처음부터 최소한의 안정적인 라벨만 넣는다.
- **Event는 1시간만 보관된다.** 장기 분석이 필요하면 외부로 내보내야 한다.
- API 서버의 **watch 스트림**이 클러스터 전체의 신경계다. 모든 컨트롤러가 이것을 구독한다.

**다음 장에서는** 지금까지 배운 오브젝트 모델 위에서 가장 중요한 리소스인 Pod를 다룬다. 2장에서 실험한 리눅스 네임스페이스가 Pod의 정체를 어떻게 설명하는지 확인하고, 멀티 컨테이너 Pod와 세 가지 디자인 패턴을 실습한다.

---

**참고 원서**: *Kubernetes in Action, 2nd Ed.* 4장 / *Programming Kubernetes* 2장 / *The Kubernetes Bible* 4.4절
