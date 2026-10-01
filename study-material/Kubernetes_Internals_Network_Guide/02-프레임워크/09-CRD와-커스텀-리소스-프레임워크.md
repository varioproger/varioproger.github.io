---
title: "9장. CRD와 커스텀 리소스 프레임워크"
---

# 9장. CRD와 커스텀 리소스 프레임워크

> **학습목표**
> - CRD를 OpenAPI v3 구조적 스키마로 정의하고 검증·기본값·프루닝을 설정할 수 있다.
> - `/status`, `/scale` 서브리소스를 왜 분리하는지, RBAC에 어떤 영향을 주는지 설명할 수 있다.
> - 여러 버전을 서빙하면서 하나의 저장 버전을 유지하는 전략과 컨버전 웹훅의 필요 조건을 안다.
> - `additionalPrinterColumns`와 `categories`로 `kubectl get` 사용성을 개선할 수 있다.
> - CRD로 충분한 경우와 어그리게이션 API 서버가 필요한 경우를 구분할 수 있다.

---

## 들어가며

7장에서 CRD를 확장 방법 ①로 분류하고, 8장에서 그 CRD를 dynamic client로 조회하는 코드를 봤다. 이 장은 그 사이에 있는 조각 — **CRD 자체를 어떻게 정의하는가**를 다룬다.

`CustomResourceDefinition`은 겉보기엔 YAML 하나 적용하는 것처럼 단순해 보이지만, 실제로는 **2장에서 본 kube-apiserver의 요청 처리 경로 전체(스키마 검증, 버전 변환, 서브리소스 라우팅)를 사용자가 정의한 리소스에 대해 재현**하는 시스템이다. `apiextensions-apiserver`라는 별도 컴포넌트(kube-apiserver 안에서 함께 동작한다)가 이 재현을 담당한다.

```
CRD를 적용하면 벌어지는 일

kubectl apply -f webapp-crd.yaml
        │
        ▼
apiextensions-apiserver가 다음을 즉시 만든다:
  · /apis/example.com/v1/webapps 라우트
  · OpenAPI 스키마 기반 검증기
  · etcd 저장 경로 (내장 리소스와 동일한 etcd, 별도 저장소 아님 ★)
  · RBAC 대상 리소스 (ClusterRole의 resources: ["webapps"]로 참조 가능)
  · watch/list 지원 (Informer가 그대로 동작)
        │
        ▼
kubectl get webapps    ← 마치 내장 리소스처럼 동작
```

**핵심 전제 하나를 먼저 박아둔다.** CRD로 만든 리소스는 **내장 리소스와 완전히 같은 etcd에, 같은 방식으로 저장된다.** 이것이 CRD의 가장 큰 장점(검증/RBAC/watch를 공짜로 얻는다)이자 가장 큰 한계(커스텀 저장 로직이나 비-CRUD 의미론을 넣을 수 없다)다. 9.5절에서 이 한계를 다시 짚는다.

## 9.1 CRD 정의와 OpenAPI v3 스키마 검증

### 최소 CRD

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: webapps.example.com        # ★ 반드시 <plural>.<group> 형식
spec:
  group: example.com
  names:
    kind: WebApp
    plural: webapps
    singular: webapp
    shortNames: ["wa"]
  scope: Namespaced                 # 또는 Cluster
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required: ["image"]
              properties:
                image:
                  type: string
                replicas:
                  type: integer
                  minimum: 0
                  maximum: 100
                  default: 1
```

`kubectl apply -f`로 이걸 등록하면 즉시 `kubectl get webapps`, `kubectl create -f`가 동작한다.

### 구조적 스키마(Structural Schema)의 강제 조건

**v1 CRD부터는 구조적 스키마가 필수다.** 다음 조건을 만족해야 apiextensions-apiserver가 받아들인다.

| 조건 | 의미 |
|---|---|
| 모든 필드에 `type`이 명시되어야 한다 | `additionalProperties`만으로 타입을 생략할 수 없다 |
| `properties`가 있으면 형제 레벨에 임의 필드를 허용하지 않는다 | 스키마 밖 필드는 기본적으로 **프루닝(제거)**된다 |
| 루트에는 `x-kubernetes-preserve-unknown-fields: true`를 함부로 쓰지 않는다 | 구조적 스키마의 취지(모든 필드가 알려져야 한다)를 깨기 때문 |

**프루닝의 실제 동작**

```yaml
# 사용자가 보낸 요청
spec:
  image: nginx:alpine
  replicas: 3
  extraField: "이건 스키마에 없음"    # ← 스키마에 정의되지 않음
```

```
스키마에 없는 extraField는 저장 전에 자동으로 제거된다
(에러가 아니라 조용히 사라진다 — 오타를 낸 사용자가 혼란스러울 수 있으니
 필드명을 신중히 문서화해야 한다)
```

**필수 필드와 기본값**

```yaml
schema:
  openAPIV3Schema:
    type: object
    properties:
      spec:
        type: object
        required: ["image"]          # ★ 없으면 요청 자체가 거부됨 (검증 실패)
        properties:
          image:
            type: string
            pattern: '^[a-z0-9./:_-]+$'
          replicas:
            type: integer
            minimum: 0
            default: 1                # ★ 사용자가 생략하면 API 서버가 채워 넣음
          env:
            type: array
            items:
              type: object
              required: ["name", "value"]
              properties:
                name:  { type: string }
                value: { type: string }
```

`default`는 **어드미션 체인의 기본값 주입 단계**(2장에서 본 스키마 검증 근처)에서 적용된다. 사용자가 `replicas`를 생략하면 API 서버가 `1`을 채워 넣은 뒤 저장한다. Mutating 웹훅(11장)과 달리 별도 서비스 호출 없이 API 서버 안에서 처리되어 **지연시간이 없다.**

**검증 실패 예시**

```bash
kubectl apply -f - <<EOF
apiVersion: example.com/v1
kind: WebApp
metadata:
  name: bad-webapp
spec:
  replicas: 999      # maximum: 100 위반
EOF
```

```
The WebApp "bad-webapp" is invalid: spec.replicas: Invalid value: 999:
spec.replicas in body should be less than or equal to 100
error: WebApp "bad-webapp" is invalid: spec.image: Required value
```

**CEL(Common Expression Language) 검증**도 v1.25에서 베타로 도입되어 v1.29부터 정식(GA) 기능으로 스키마 안에 직접 넣을 수 있다. 필드 간 관계를 검증할 때 유용하다(예: "replicas가 3 이상이면 반드시 anti-affinity를 설정해야 한다").

```yaml
x-kubernetes-validations:
  - rule: "self.replicas < 10 || has(self.antiAffinity)"
    message: "replicas가 10 이상이면 antiAffinity가 필요합니다"
```

이 방식은 11장에서 다룰 `ValidatingAdmissionPolicy`와 같은 CEL 엔진을 쓴다. **웹훅 없이 API 서버 안에서 정책을 검증**할 수 있다는 점에서 CRD 스키마 검증과 어드미션 정책의 경계가 점점 흐려지고 있다.

## 9.2 서브리소스

### 왜 `/status`를 분리하는가

5장에서 "조정 함수는 status만 써야 한다"는 원칙을 배웠다. **서브리소스는 이 원칙을 API 서버 수준에서 강제하는 메커니즘이다.**

```yaml
versions:
  - name: v1
    served: true
    storage: true
    subresources:
      status: {}      # ★ /status 서브리소스 활성화
```

활성화하면 두 개의 별도 엔드포인트가 생긴다.

```
PUT /apis/example.com/v1/namespaces/default/webapps/my-site           ← spec 수정
PUT /apis/example.com/v1/namespaces/default/webapps/my-site/status    ← status 수정
```

```bash
kubectl patch webapp my-site --type=merge -p '{"spec":{"replicas":5}}'
# → 일반 PATCH, RBAC의 "webapps" 리소스 권한 필요

kubectl patch webapp my-site --subresource=status --type=merge \
  -p '{"status":{"readyReplicas":5}}'
# → "webapps/status" 서브리소스 권한이 별도로 필요
```

**RBAC에서 완전히 다른 리소스로 취급된다.**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: webapp-editor         # 사용자용 — spec만 수정 가능
rules:
  - apiGroups: ["example.com"]
    resources: ["webapps"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
    # ★ "webapps/status"가 없으므로 이 역할로는 status를 못 건드린다
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: webapp-controller      # 컨트롤러용 — status만 수정 가능
rules:
  - apiGroups: ["example.com"]
    resources: ["webapps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["example.com"]
    resources: ["webapps/status"]
    verbs: ["get", "update", "patch"]
```

**효과**: 일반 사용자가 `kubectl edit webapp`으로 `spec`을 바꿀 수는 있어도, **컨트롤러가 계산한 `status.readyReplicas`를 직접 조작할 수는 없다.** GitOps 도구가 실수로 status까지 덮어쓰는 사고도 이 분리로 방지된다. 내장 리소스(Deployment, Pod 등)도 정확히 같은 원리로 나뉘어 있다.

> **한 가지 더**: `/status` 서브리소스가 활성화되면, **일반 PUT/PATCH(스펙 경로)로 보낸 요청에서 `status` 필드는 조용히 무시된다.** 이 사실을 모르면 "왜 status를 같이 보냈는데 반영이 안 되지?"라는 혼란에 빠지기 쉽다.

### `/scale` 서브리소스 — HPA 호환

```yaml
versions:
  - name: v1
    served: true
    storage: true
    subresources:
      status: {}
      scale:
        specReplicasPath: .spec.replicas
        statusReplicasPath: .status.readyReplicas
        labelSelectorPath: .status.selector   # ★ HPA가 파드를 세는 데 필요
```

`scale`을 정의하면 CRD가 `autoscaling/v1.Scale` 타입으로 응답하는 `/scale` 엔드포인트를 얻는다. **HPA가 Deployment를 다루는 것과 똑같이 이 CRD도 다룰 수 있다.**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-webapp-hpa
spec:
  scaleTargetRef:
    apiVersion: example.com/v1
    kind: WebApp                # ★ 내장 타입이 아니어도 HPA가 인식한다
    name: my-site
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
```

`labelSelectorPath`가 중요하다. HPA는 "이 WebApp이 관리하는 Pod가 몇 개인지" 알아야 CPU 사용률 평균을 계산할 수 있는데, 그 대상 Pod 집합을 찾는 유일한 방법이 라벨 셀렉터이기 때문이다. **컨트롤러는 `status.selector`에 자신이 관리하는 Pod들의 라벨 셀렉터 문자열을 반드시 채워 넣어야 한다.**

## 9.3 버저닝 전략과 컨버전 웹훅

### served와 storage의 분리

2장에서 본 "버전 변환의 허브 모델"이 CRD에도 그대로 적용된다. 다만 CRD는 **내부 버전이라는 별도 개념 없이, 지정한 storage 버전 자체가 허브 역할**을 한다.

```yaml
versions:
  - name: v1alpha1
    served: true     # 이 버전으로 요청을 받을 수 있다
    storage: false    # etcd에는 이 형태로 저장되지 않는다
    schema: { ... }
  - name: v1beta1
    served: true
    storage: false
    schema: { ... }
  - name: v1
    served: true
    storage: true     # ★ 정확히 하나만 storage: true여야 한다
    schema: { ... }
```

```
쓰기: v1alpha1로 생성 → v1(storage)으로 변환 → etcd
읽기: etcd의 v1 데이터 → 요청한 버전(v1beta1)으로 변환 → 응답

         v1alpha1 ──┐
                    ├──→ v1 (storage, 허브) ──→ etcd
         v1beta1 ────┘
```

**세 버전이 스키마상 호환된다면(필드 이름만 다르고 의미는 같다면) 변환이 자동이다.** 예를 들어 필드가 추가되기만 했다면 별도 웹훅 없이 기본 변환(no-op에 가까운)으로 충분하다.

### 컨버전 웹훅이 필요한 경우

**필드 이름이 바뀌거나 구조가 달라지면(예: `spec.image`가 `v1alpha1`에서 `spec.container.image`로 이동) 자동 변환으로는 부족하다.** 이때 별도의 컨버전 웹훅 서버를 등록한다.

```yaml
spec:
  conversion:
    strategy: Webhook
    webhook:
      clientConfig:
        service:
          name: webapp-conversion-webhook
          namespace: webapp-system
          path: /convert
      conversionReviewVersions: ["v1"]
```

웹훅 서버는 `ConversionReview` 요청을 받아 변환된 오브젝트를 반환한다.

```go
package main

import (
    "encoding/json"
    "net/http"

    apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/runtime"
)

func handleConvert(w http.ResponseWriter, r *http.Request) {
    var review apiextensionsv1.ConversionReview
    if err := json.NewDecoder(r.Body).Decode(&review); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    response := &apiextensionsv1.ConversionResponse{
        UID:              review.Request.UID,
        ConvertedObjects: make([]runtime.RawExtension, 0, len(review.Request.Objects)),
        Result:           metav1.Status{Status: metav1.StatusSuccess},
    }

    for _, obj := range review.Request.Objects {
        converted, err := convertToVersion(obj, review.Request.DesiredAPIVersion)
        if err != nil {
            response.Result = metav1.Status{
                Status:  metav1.StatusFailure,
                Message: err.Error(),
            }
            break
        }
        response.ConvertedObjects = append(response.ConvertedObjects, converted)
    }

    review.Response = response
    json.NewEncoder(w).Encode(review)
}

// convertToVersion: v1alpha1의 spec.image를 v1의 spec.container.image로 옮기는 등
// 필드 구조 차이를 실제로 매핑하는 로직 (여기서는 스텁)
func convertToVersion(obj runtime.RawExtension, targetVersion string) (runtime.RawExtension, error) {
    // 실제 구현에서는 obj.Raw를 unstructured로 파싱해 필드를 재배치한다
    return obj, nil
}
```

**컨버전 웹훅도 어드미션 웹훅(11장)과 마찬가지로 TLS 인증서가 필요하고(cert-manager로 자동화하는 경우가 많다), 요청 경로의 동기적 관문이 된다.** 웹훅이 죽으면 **해당 CRD의 버전 간 변환이 필요한 모든 요청**(예: 오래된 컨트롤러가 `v1alpha1`으로 List하는데 storage는 `v1`인 경우)이 실패한다. 7장에서 강조한 "동기적 확장점의 위험"이 여기도 그대로 적용된다.

> **버전을 늘릴 때의 실무 원칙**
> 1. 가능하면 **필드 추가만으로** 새 버전을 만들어 자동 변환이 되게 한다.
> 2. 구조 변경이 불가피하면 컨버전 웹훅을 준비하되, **웹훅의 가용성을 컨트롤러 매니저급으로 취급**한다(여러 레플리카, 헬스체크, 낮은 타임아웃).
> 3. 오래된 버전은 `served: false`로 전환한 뒤(스토리지에는 여전히 존재할 수 있음) 유예 기간을 두고 완전히 제거한다. 3.1절 스타일의 kubectl deprecation 정책과 같은 절차를 문서화해둔다.

## 9.4 프린터 컬럼과 카테고리

### additionalPrinterColumns — `kubectl get` 커스터마이징

기본적으로 CRD는 `kubectl get webapps`를 실행하면 `NAME`과 `AGE`만 보여준다. 실무에서 유용한 정보(replicas, ready 상태, 이미지)를 보려면 프린터 컬럼을 정의한다.

```yaml
versions:
  - name: v1
    served: true
    storage: true
    additionalPrinterColumns:
      - name: Image
        type: string
        jsonPath: .spec.image
      - name: Desired
        type: integer
        jsonPath: .spec.replicas
      - name: Ready
        type: integer
        jsonPath: .status.readyReplicas
      - name: Phase
        type: string
        jsonPath: .status.phase
      - name: Age
        type: date
        jsonPath: .metadata.creationTimestamp
```

```bash
kubectl get webapps
```

```
NAME      IMAGE          DESIRED   READY   PHASE     AGE
my-site   nginx:alpine   3         3       Running   2m
```

`kubectl get deployments`가 `READY`/`UP-TO-DATE`/`AVAILABLE` 컬럼을 보여주는 것과 원리가 같다 — 내장 리소스도 내부적으로 같은 메커니즘을 쓴다.

**`-o wide` 전용 컬럼**도 가능하다.

```yaml
additionalPrinterColumns:
  - name: Selector
    type: string
    jsonPath: .status.selector
    priority: 1     # ★ priority가 0보다 크면 -o wide에서만 보인다
```

### categories — 그룹 조회

```yaml
spec:
  names:
    kind: WebApp
    plural: webapps
    categories: ["all"]     # ★ kubectl get all에 포함시킨다
```

```bash
kubectl get all
```

```
NAME                    READY   STATUS
pod/my-site-7d9f8-x2z1  1/1     Running

NAME                       IMAGE          DESIRED   READY
webapp.example.com/my-site nginx:alpine   3         3
```

**커스텀 카테고리**도 만들 수 있다(예: `categories: ["storage-operators"]`로 여러 CRD를 묶어 `kubectl get storage-operators`처럼 조회). 여러 CRD를 제공하는 오퍼레이터 패키지에서 관련 리소스를 한 번에 보고 싶을 때 유용하다.

## 9.5 CRD vs 어그리게이션 API 선택 기준

이 장 서두에서 "CRD는 내장 리소스와 같은 etcd에, 같은 방식으로 저장된다"고 못 박았다. 이 전제가 무너지는 순간 CRD로는 부족해진다.

| 기준 | CRD로 충분 | 어그리게이션 API 서버 필요 |
|---|---|---|
| 저장 위치 | etcd (기본 제공) | 커스텀 백엔드 (시계열 DB, 외부 시스템, 계산된 값) |
| 의미론 | CRUD (Create/Read/Update/Delete + Watch) | 비-CRUD (예: `TokenReview`처럼 저장 없이 요청마다 계산) |
| 검증 | OpenAPI 스키마 + CEL로 충분 | 복잡한 크로스 리소스 검증, 외부 시스템 조회가 필요한 검증 |
| 데이터 규모 | 일반적인 클러스터 리소스 규모 | 매우 큰 시계열 데이터, 페이지네이션이 복잡한 커스텀 쿼리 |
| 예시 | `WebApp`, `Certificate`, 대부분의 오퍼레이터 CRD | `metrics.k8s.io`(실시간 계산), `custom.metrics.k8s.io` |

**`metrics.k8s.io`가 CRD가 아닌 이유**: 노드/파드의 CPU·메모리 사용률은 **매 요청 시점의 최신 값을 즉시 계산**해서 반환해야 한다. etcd에 이 값을 계속 쓰는 것은 낭비이고, watch 의미론도 맞지 않는다(값이 초 단위로 바뀌는데 매번 etcd 이벤트를 만들 수는 없다). 그래서 metrics-server는 완전히 별도의 API 서버로 구현되고, kube-apiserver가 `APIService` 등록을 통해 요청을 그쪽으로 프록시한다.

**CRD의 한계를 우회하려는 시도들**

- "CRD의 status에 대량의 시계열 데이터를 넣고 싶다" → etcd 오브젝트 크기 제한(기본 1.5MiB)에 걸린다. 시계열은 별도 저장소가 맞다.
- "CRD 검증에서 외부 데이터베이스를 조회해야 한다" → OpenAPI 스키마/CEL은 오브젝트 내부 필드만 볼 수 있다. 외부 조회가 필요하면 Validating 웹훅(11장)으로 가야 하고, 그래도 부족하면 어그리게이션 API 서버 수준의 커스텀 로직이 필요하다.
- "리소스마다 완전히 다른 저장 정책(TTL, 압축)을 적용하고 싶다" → CRD는 다른 내장 리소스와 같은 etcd 정책을 공유한다. 독립적인 저장 정책이 필요하면 어그리게이션 API다.

**판단 기준을 한 문장으로**: **"이 리소스가 결국 유저가 선언한 desired state이고, 컨트롤러가 그 상태를 향해 조정해가는 구조인가?"**라면 CRD가 맞다. **"이 API가 상태를 저장하는 게 아니라 매 요청마다 뭔가를 계산하거나, 완전히 다른 저장소를 앞에 두고 프록시해야 하는가?"**라면 어그리게이션 API 서버다. 12장에서 직접 만들어 본다.

**한 가지 더 짚어야 할 것**: CRD를 정의하는 것과 그 CRD를 실제로 조정하는 컨트롤러를 작성하는 것은 별개의 작업이다. 이 장은 전자만 다뤘다. **"이 WebApp을 실제로 실행 중인 Deployment로 바꾸는 로직"은 다음 장의 몫이다.**

## 실습: WebApp CRD 정의와 서브리소스 동작 확인

**① CRD 적용**

```yaml
# webapp-crd.yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: webapps.example.com
spec:
  group: example.com
  names:
    kind: WebApp
    plural: webapps
    singular: webapp
    shortNames: ["wa"]
    categories: ["all"]
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      subresources:
        status: {}
        scale:
          specReplicasPath: .spec.replicas
          statusReplicasPath: .status.readyReplicas
          labelSelectorPath: .status.selector
      additionalPrinterColumns:
        - name: Image
          type: string
          jsonPath: .spec.image
        - name: Desired
          type: integer
          jsonPath: .spec.replicas
        - name: Ready
          type: integer
          jsonPath: .status.readyReplicas
        - name: Age
          type: date
          jsonPath: .metadata.creationTimestamp
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required: ["image"]
              properties:
                image:
                  type: string
                  pattern: '^[a-zA-Z0-9._/:-]+$'
                replicas:
                  type: integer
                  minimum: 0
                  maximum: 20
                  default: 1
            status:
              type: object
              properties:
                readyReplicas:
                  type: integer
                phase:
                  type: string
                selector:
                  type: string
```

```bash
kubectl apply -f webapp-crd.yaml
kubectl get crd webapps.example.com
```

**② 정상 인스턴스 생성**

```yaml
# my-site.yaml
apiVersion: example.com/v1
kind: WebApp
metadata:
  name: my-site
  namespace: default
spec:
  image: nginx:alpine
  replicas: 3
```

```bash
kubectl apply -f my-site.yaml
kubectl get webapps
kubectl get wa      # shortNames 확인
```

```
NAME      IMAGE          DESIRED   READY   AGE
my-site   nginx:alpine   3         <none>  5s
```

**③ 잘못된 인스턴스로 검증 확인**

```bash
kubectl apply -f - <<EOF
apiVersion: example.com/v1
kind: WebApp
metadata:
  name: bad-site
spec:
  image: "invalid image name with spaces"
  replicas: 999
EOF
```

`pattern` 위반과 `maximum` 위반 두 가지 에러 메시지를 확인한다.

**④ status 서브리소스 vs spec 분리 확인**

```bash
# spec 경로로 status를 바꾸려 해도 무시된다
kubectl patch webapp my-site --type=merge -p '{"status":{"readyReplicas":3}}'
kubectl get webapp my-site -o jsonpath='{.status}'
# → 비어 있음 (일반 patch 경로는 status를 무시한다)

# status 서브리소스 경로로만 반영된다
kubectl patch webapp my-site --subresource=status --type=merge \
  -p '{"status":{"readyReplicas":3,"phase":"Running","selector":"app=my-site"}}'
kubectl get webapp my-site -o jsonpath='{.status}'
```

**⑤ RBAC 분리 확인**

```bash
kubectl create serviceaccount webapp-viewer
kubectl create clusterrole webapp-view --verb=get,list,watch --resource=webapps
kubectl create clusterrolebinding webapp-viewer-binding \
  --clusterrole=webapp-view --serviceaccount=default:webapp-viewer

kubectl auth can-i patch webapps --subresource=status \
  --as=system:serviceaccount:default:webapp-viewer
# no
```

`webapp-view` 역할에는 `webapps/status` 권한이 없으므로 거부된다. 서브리소스별 RBAC 분리가 실제로 작동하는 것을 확인한 것이다.

**⑥ 정리**

```bash
kubectl delete webapp my-site
kubectl delete clusterrolebinding webapp-viewer-binding
kubectl delete clusterrole webapp-view
kubectl delete serviceaccount webapp-viewer
# CRD 자체는 10장 실습에서 계속 쓰므로 남겨둔다
```

---

## 실습 과제

**과제 1 — CEL 검증 추가**
`WebApp`의 스키마에 `x-kubernetes-validations`를 추가해 "`replicas`가 10 이상이면 `spec`에 `antiAffinity: true` 필드가 반드시 있어야 한다"는 규칙을 만들고, 이를 위반하는 오브젝트가 거부되는지 확인한다.

**과제 2 — 두 버전 정의와 자동 변환 확인**
`v1alpha1`(필드명 `size`)과 `v1`(필드명 `replicas`, storage 버전)을 함께 정의하되 필드 이름이 다르므로 자동 변환이 실패함을 확인한다. 그다음 최소한의 컨버전 웹훅(9.3절 스텁을 완성) 없이 `served: false`로 전환하는 마이그레이션 절차만으로 문제를 회피하는 방법도 설계해본다.

**과제 3 — categories 커스터마이징**
`categories: ["all", "myoperator"]`처럼 커스텀 카테고리를 추가하고 `kubectl get myoperator`가 이 CRD를 포함해 조회되는 것을 확인한다.

**과제 4 — 프루닝 관찰**
스키마에 정의되지 않은 필드(`spec.extraField`)를 포함해 오브젝트를 생성한 뒤, `kubectl get webapp my-site -o yaml`에서 그 필드가 조용히 사라졌는지 확인한다. 이 동작이 사용자에게 혼란을 줄 수 있는 이유를 서술한다.

**과제 5 — scale 서브리소스로 HPA 연동**
9.2절의 `scale` 서브리소스가 설정된 `WebApp`에 대해 `kubectl scale webapp my-site --replicas=5`가 동작하는지 확인하고, HPA 오브젝트를 하나 만들어 `scaleTargetRef`로 이 `WebApp`을 가리키게 한 뒤 `kubectl get hpa`로 인식되는지(실제 스케일은 컨트롤러가 없으므로 발생하지 않음을 함께 확인) 관찰한다.

---

## 요약

- CRD는 **내장 리소스와 같은 etcd에, 같은 방식으로 저장된다.** OpenAPI v3 **구조적 스키마**가 필수이며, 스키마에 없는 필드는 자동으로 **프루닝**된다. `required`/`default`/CEL(`x-kubernetes-validations`)로 검증과 기본값을 API 서버 안에서 처리한다.
- **`/status` 서브리소스**는 5장의 "조정 함수는 status만 쓴다" 원칙을 API 서버 수준에서 강제한다. `spec`과 `status`는 **완전히 다른 RBAC 리소스**(`webapps`, `webapps/status`)로 취급된다.
- **`/scale` 서브리소스**는 `specReplicasPath`/`statusReplicasPath`/`labelSelectorPath`를 지정해 HPA가 내장 리소스처럼 이 CRD를 스케일 대상으로 다룰 수 있게 한다.
- 여러 버전을 서빙할 때 **정확히 하나만 `storage: true`**여야 하며, 이 storage 버전이 허브 역할을 한다. 필드 이름/구조가 호환되면 자동 변환으로 충분하지만, 구조가 달라지면 **컨버전 웹훅**이 필요하고 이는 요청 경로의 동기적 관문이 된다.
- **`additionalPrinterColumns`**로 `kubectl get`의 표시 정보를 커스터마이징하고, **`categories`**로 `kubectl get all` 같은 그룹 조회에 포함시킬 수 있다.
- CRD는 **CRUD 의미론과 etcd 저장을 전제로 한다.** 비-CRUD 의미론(매 요청 계산)이나 커스텀 저장 백엔드가 필요하면 CRD로는 부족하고 **어그리게이션 API 서버**(12장)가 필요하다.

**다음 장에서는** 이 CRD를 실제로 조정하는 **컨트롤러**를 만든다. controller-runtime과 Kubebuilder로 8장의 Informer/워크큐 패턴을 구조화하고, 리더 선출과 `envtest` 기반 테스트까지 오퍼레이터 프레임워크 전체를 다룬다.
