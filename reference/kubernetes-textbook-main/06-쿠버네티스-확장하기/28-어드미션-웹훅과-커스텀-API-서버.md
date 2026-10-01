# 28장. 어드미션 웹훅과 커스텀 API 서버

> **학습목표**
> - Mutating과 Validating 웹훅을 구현하고 등록할 수 있다.
> - 웹훅 운영의 위험(가용성, 지연, 순환 의존)을 이해하고 대비할 수 있다.
> - 변환 웹훅으로 CRD 버전 마이그레이션을 완성할 수 있다.
> - 어그리게이션 계층의 구조와 커스텀 API 서버의 용도를 안다.
> - 오퍼레이터를 프로덕션에 출하하는 절차를 수립할 수 있다.

---

## 들어가며

26장에서 CEL 검증으로 많은 것을 할 수 있다는 걸 봤다. 그런데 CEL로 안 되는 것들이 있다.

- 다른 리소스를 조회해야 하는 검증 ("이 이름의 Secret이 존재하는가?")
- 외부 시스템 조회 ("이 이미지가 스캔을 통과했는가?")
- 복잡한 기본값 주입 (사이드카 컨테이너 삽입)
- CRD 버전 변환

이 장은 그 영역을 다룬다.

## 28.1 어드미션 웹훅

### 위치 복습

17.5절에서 본 파이프라인이다.

```
인가 통과
    ↓
① Mutating Admission
   · 내장 플러그인 (LimitRanger, ServiceAccount, ...)
   · MutatingAdmissionWebhook       ← 여기
    ↓
② 스키마 검증 (OpenAPI + CEL)
    ↓
③ Validating Admission
   · 내장 플러그인 (ResourceQuota, PodSecurity, ...)
   · ValidatingAdmissionPolicy (CEL)
   · ValidatingAdmissionWebhook     ← 여기
    ↓
etcd 저장
```

**Mutating이 먼저**이므로, 변형된 결과가 검증을 받는다.

### 프로토콜

API 서버가 **`AdmissionReview`** 를 POST하고, 웹훅이 같은 타입으로 응답한다.

**요청**

```json
{
  "apiVersion": "admission.k8s.io/v1",
  "kind": "AdmissionReview",
  "request": {
    "uid": "705ab4f5-6393-11e8-b7cc-42010a800002",
    "kind": {"group":"apps","version":"v1","kind":"Deployment"},
    "resource": {"group":"apps","version":"v1","resource":"deployments"},
    "namespace": "default",
    "name": "web",
    "operation": "CREATE",
    "userInfo": {"username":"alice","groups":["dev-team"]},
    "object": { ... 전체 오브젝트 ... },
    "oldObject": null,
    "dryRun": false
  }
}
```

**응답 — 허용**

```json
{
  "apiVersion": "admission.k8s.io/v1",
  "kind": "AdmissionReview",
  "response": {
    "uid": "705ab4f5-6393-11e8-b7cc-42010a800002",
    "allowed": true
  }
}
```

**응답 — 거부**

```json
{
  "response": {
    "uid": "...",
    "allowed": false,
    "status": {
      "code": 403,
      "message": "team 라벨이 필요합니다"
    }
  }
}
```

**응답 — 변형 (Mutating)**

```json
{
  "response": {
    "uid": "...",
    "allowed": true,
    "patchType": "JSONPatch",
    "patch": "<base64로 인코딩된 JSON Patch>"
  }
}
```

**패치 원본**

```json
[
  {"op":"add","path":"/metadata/labels/injected-by","value":"my-webhook"},
  {"op":"add","path":"/spec/template/spec/securityContext","value":{"runAsNonRoot":true}}
]
```

**경고 메시지**도 보낼 수 있다.

```json
{
  "response": {
    "allowed": true,
    "warnings": ["latest 태그 사용은 권장되지 않습니다"]
  }
}
```

```bash
kubectl apply -f deploy.yaml
# Warning: latest 태그 사용은 권장되지 않습니다
# deployment.apps/web created
```

**점진 도입에 매우 유용하다.** 차단하기 전에 경고로 시작한다.

## 28.2 Kubebuilder로 웹훅 만들기

27장의 프로젝트에 이어서 진행한다.

```bash
cd ~/k8s-guide/webapp-operator

kubebuilder create webhook \
  --group demo --version v1 --kind WebApp \
  --defaulting --programmatic-validation
```

```
api/v1/webapp_webhook.go       ← 여기를 편집
config/webhook/                ← 웹훅 등록 매니페스트
config/certmanager/            ← 인증서 자동 발급 (11.3절)
```

### 구현

```go
// api/v1/webapp_webhook.go
package v1

import (
    "context"
    "fmt"
    "strings"

    apierrors "k8s.io/apimachinery/pkg/api/errors"
    "k8s.io/apimachinery/pkg/runtime"
    "k8s.io/apimachinery/pkg/util/validation/field"
    "k8s.io/utils/ptr"
    ctrl "sigs.k8s.io/controller-runtime"
    logf "sigs.k8s.io/controller-runtime/pkg/log"
    "sigs.k8s.io/controller-runtime/pkg/webhook"
    "sigs.k8s.io/controller-runtime/pkg/webhook/admission"
)

var webapplog = logf.Log.WithName("webapp-webhook")

func (r *WebApp) SetupWebhookWithManager(mgr ctrl.Manager) error {
    return ctrl.NewWebhookManagedBy(mgr).For(r).Complete()
}

// ───────────────────────── Mutating ─────────────────────────

// +kubebuilder:webhook:path=/mutate-demo-example-com-v1-webapp,mutating=true,failurePolicy=fail,sideEffects=None,groups=demo.example.com,resources=webapps,verbs=create;update,versions=v1,name=mwebapp.kb.io,admissionReviewVersions=v1

var _ webhook.Defaulter = &WebApp{}

func (r *WebApp) Default() {
    webapplog.Info("defaulting", "name", r.Name)

    // ① 스키마 기본값으로 표현할 수 없는 로직
    if r.Spec.Tier == "production" {
        // 프로덕션은 최소 3 replica
        if r.Spec.Replicas == nil || *r.Spec.Replicas < 3 {
            r.Spec.Replicas = ptr.To(int32(3))
        }
        // 프로덕션은 리소스 요청 필수
        if r.Spec.Resources.Requests == nil {
            r.Spec.Resources.Requests = defaultProdResources()
        }
    }

    // ② 표준 라벨 주입 (4.3절)
    if r.Labels == nil {
        r.Labels = map[string]string{}
    }
    if _, ok := r.Labels["app.kubernetes.io/name"]; !ok {
        r.Labels["app.kubernetes.io/name"] = r.Name
    }
    r.Labels["app.kubernetes.io/managed-by"] = "webapp-operator"
}

// ───────────────────────── Validating ─────────────────────────

// +kubebuilder:webhook:path=/validate-demo-example-com-v1-webapp,mutating=false,failurePolicy=fail,sideEffects=None,groups=demo.example.com,resources=webapps,verbs=create;update;delete,versions=v1,name=vwebapp.kb.io,admissionReviewVersions=v1

var _ webhook.Validator = &WebApp{}

func (r *WebApp) ValidateCreate() (admission.Warnings, error) {
    webapplog.Info("validate create", "name", r.Name)
    return r.validate()
}

func (r *WebApp) ValidateUpdate(old runtime.Object) (admission.Warnings, error) {
    webapplog.Info("validate update", "name", r.Name)

    oldApp, ok := old.(*WebApp)
    if !ok {
        return nil, fmt.Errorf("expected WebApp, got %T", old)
    }

    var allErrs field.ErrorList

    // 불변 필드 검사
    if oldApp.Spec.Port != r.Spec.Port {
        allErrs = append(allErrs, field.Invalid(
            field.NewPath("spec", "port"), r.Spec.Port,
            "port는 생성 후 변경할 수 없습니다"))
    }

    // 티어 다운그레이드 금지
    if oldApp.Spec.Tier == "production" && r.Spec.Tier != "production" {
        allErrs = append(allErrs, field.Invalid(
            field.NewPath("spec", "tier"), r.Spec.Tier,
            "production에서 하위 티어로 변경할 수 없습니다"))
    }

    warnings, err := r.validate()
    if err != nil {
        return warnings, err
    }
    if len(allErrs) > 0 {
        return warnings, apierrors.NewInvalid(
            GroupVersion.WithKind("WebApp").GroupKind(), r.Name, allErrs)
    }
    return warnings, nil
}

func (r *WebApp) ValidateDelete() (admission.Warnings, error) {
    // 프로덕션 리소스는 애노테이션 없이 삭제 금지
    if r.Spec.Tier == "production" {
        if r.Annotations["demo.example.com/allow-delete"] != "true" {
            return nil, fmt.Errorf(
                "production WebApp을 삭제하려면 " +
                "demo.example.com/allow-delete=true 애노테이션이 필요합니다")
        }
    }
    return nil, nil
}

func (r *WebApp) validate() (admission.Warnings, error) {
    var allErrs field.ErrorList
    var warnings admission.Warnings

    // 이미지 태그 검증
    if strings.HasSuffix(r.Spec.Image, ":latest") {
        allErrs = append(allErrs, field.Invalid(
            field.NewPath("spec", "image"), r.Spec.Image,
            "latest 태그는 사용할 수 없습니다"))
    }

    // 다이제스트 사용 권장 (경고만)
    if !strings.Contains(r.Spec.Image, "@sha256:") {
        warnings = append(warnings,
            "다이제스트(@sha256:...)로 이미지를 고정하는 것이 권장됩니다")
    }

    // 승인된 레지스트리
    allowed := []string{"registry.example.com/", "docker.io/library/", "nginx", "registry.k8s.io/"}
    ok := false
    for _, p := range allowed {
        if strings.HasPrefix(r.Spec.Image, p) {
            ok = true
            break
        }
    }
    if !ok {
        allErrs = append(allErrs, field.Invalid(
            field.NewPath("spec", "image"), r.Spec.Image,
            "승인되지 않은 레지스트리입니다"))
    }

    // 환경변수 이름 중복
    seen := map[string]bool{}
    for i, e := range r.Spec.Env {
        if seen[e.Name] {
            allErrs = append(allErrs, field.Duplicate(
                field.NewPath("spec", "env").Index(i).Child("name"), e.Name))
        }
        seen[e.Name] = true
    }

    if len(allErrs) == 0 {
        return warnings, nil
    }
    return warnings, apierrors.NewInvalid(
        GroupVersion.WithKind("WebApp").GroupKind(), r.Name, allErrs)
}
```

### 다른 리소스를 조회하는 웹훅

`webhook.Validator` 인터페이스는 클라이언트에 접근할 수 없다. 클러스터를 조회해야 한다면 **커스텀 핸들러**를 만든다.

```go
// internal/webhook/webapp_handler.go
type WebAppValidator struct {
    Client  client.Client
    decoder admission.Decoder
}

func (v *WebAppValidator) Handle(ctx context.Context, req admission.Request) admission.Response {
    app := &demov1.WebApp{}
    if err := v.decoder.Decode(req, app); err != nil {
        return admission.Errored(http.StatusBadRequest, err)
    }

    // ★ 클러스터 조회
    if app.Spec.SecretRef != "" {
        var secret corev1.Secret
        key := types.NamespacedName{Name: app.Spec.SecretRef, Namespace: app.Namespace}
        if err := v.Client.Get(ctx, key, &secret); err != nil {
            if apierrors.IsNotFound(err) {
                return admission.Denied(
                    fmt.Sprintf("Secret %q가 존재하지 않습니다", app.Spec.SecretRef))
            }
            return admission.Errored(http.StatusInternalServerError, err)
        }
    }

    // 네임스페이스 쿼터 확인
    var apps demov1.WebAppList
    if err := v.Client.List(ctx, &apps, client.InNamespace(app.Namespace)); err != nil {
        return admission.Errored(http.StatusInternalServerError, err)
    }
    if req.Operation == admissionv1.Create && len(apps.Items) >= 10 {
        return admission.Denied("네임스페이스당 WebApp은 10개까지입니다")
    }

    return admission.Allowed("")
}
```

```go
// cmd/main.go
mgr.GetWebhookServer().Register("/validate-webapp",
    &webhook.Admission{Handler: &WebAppValidator{Client: mgr.GetClient()}})
```

> **⚠️ 웹훅에서 클러스터를 조회할 때의 함정**
>
> **① 캐시된 클라이언트는 오래된 데이터를 반환할 수 있다.** 방금 만든 Secret이 아직 캐시에 없을 수 있다. 정확성이 중요하면 `mgr.GetAPIReader()`로 직접 읽는다.
>
> **② 조회가 지연을 만든다.** 어드미션은 요청 경로에 있으므로, 웹훅이 느리면 **모든 관련 요청이 느려진다.**
>
> **③ 경쟁 조건이 있다.** "10개까지"를 검증해도 동시에 두 요청이 오면 11개가 될 수 있다. **어드미션은 원자적 검증을 보장하지 않는다.** 정확한 쿼터가 필요하면 ResourceQuota 같은 별도 메커니즘이 필요하다.

### 웹훅 등록

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: webapp-validating-webhook
  annotations:
    cert-manager.io/inject-ca-from: webapp-operator-system/webapp-serving-cert
webhooks:
  - name: vwebapp.kb.io
    admissionReviewVersions: ["v1"]
    sideEffects: None                    # ★ dry-run 지원 여부
    failurePolicy: Fail                  # ★ Fail | Ignore
    timeoutSeconds: 5                    # ★ 최대 30
    matchPolicy: Equivalent
    clientConfig:
      service:
        namespace: webapp-operator-system
        name: webapp-operator-webhook-service
        path: /validate-demo-example-com-v1-webapp
        port: 443
      caBundle: <base64>
    rules:
      - apiGroups: ["demo.example.com"]
        apiVersions: ["v1"]
        operations: ["CREATE", "UPDATE", "DELETE"]
        resources: ["webapps"]
        scope: Namespaced
    # ★ 시스템 네임스페이스 제외 — 매우 중요
    namespaceSelector:
      matchExpressions:
        - key: kubernetes.io/metadata.name
          operator: NotIn
          values: [kube-system, kube-public, webapp-operator-system]
    objectSelector: {}
```

**주요 필드**

| 필드 | 의미 |
|---|---|
| `failurePolicy` | 웹훅 호출 실패 시 `Fail`(거부) 또는 `Ignore`(허용) |
| `timeoutSeconds` | 1~30. 기본 10 |
| `sideEffects` | `None`(권장), `NoneOnDryRun`, `Some`, `Unknown` |
| `matchPolicy` | `Equivalent`(다른 버전 요청도 매칭, 권장) 또는 `Exact` |
| `namespaceSelector` | 어떤 네임스페이스에 적용할지 |
| `objectSelector` | 어떤 라벨의 오브젝트에 적용할지 |
| `reinvocationPolicy` | Mutating만. `Never` 또는 `IfNeeded`(다른 웹훅이 변형하면 다시 호출) |

### 인증서 관리

**웹훅은 반드시 HTTPS여야 하고, API 서버가 인증서를 신뢰해야 한다.**

**방법 1: cert-manager** (권장, 11.3절)

```yaml
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: selfsigned
  namespace: webapp-operator-system
spec:
  selfSigned: {}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: webapp-serving-cert
  namespace: webapp-operator-system
spec:
  dnsNames:
    - webapp-operator-webhook-service.webapp-operator-system.svc
    - webapp-operator-webhook-service.webapp-operator-system.svc.cluster.local
  issuerRef:
    kind: Issuer
    name: selfsigned
  secretName: webhook-server-cert
```

애노테이션으로 `caBundle`이 자동 주입된다.

```yaml
metadata:
  annotations:
    cert-manager.io/inject-ca-from: webapp-operator-system/webapp-serving-cert
```

**방법 2: 자체 생성** — 오퍼레이터가 시작 시 인증서를 만들고 웹훅 설정에 CA를 주입한다. cert-manager 의존성이 없다는 것이 장점이다.

## 28.3 웹훅 운영의 위험

> 이 절은 이 장에서 가장 중요하다. **웹훅 하나가 클러스터 전체를 마비시킬 수 있다.**

### 위험 1: 가용성

```
failurePolicy: Fail 인 웹훅의 서버가 죽으면
    ↓
해당 리소스의 모든 CREATE/UPDATE가 거부된다
    ↓
· 새 Pod를 만들 수 없다
· Deployment 롤아웃이 멈춘다
· 심하면 클러스터를 복구할 수 없다
```

**실제 사고 시나리오**

```
① 웹훅이 Pod 리소스에 적용되어 있다 (사이드카 주입 등)
② 웹훅 서버 Pod가 노드 장애로 죽는다
③ 새 웹훅 Pod를 만들려 한다
④ 그 Pod 생성 요청이 웹훅을 거쳐야 한다
⑤ 웹훅이 없으므로 거부된다
⑥ 데드락 ★
```

**대비책**

```yaml
# ① 자기 자신의 네임스페이스를 제외 — 가장 중요
namespaceSelector:
  matchExpressions:
    - key: kubernetes.io/metadata.name
      operator: NotIn
      values: [kube-system, my-webhook-system]

# ② 짧은 타임아웃
timeoutSeconds: 5

# ③ 처음에는 Ignore로 시작
failurePolicy: Ignore
```

```yaml
# ④ 웹훅 서버를 다중화하고 분산
spec:
  replicas: 3
  template:
    spec:
      topologySpreadConstraints:      # 15.5절
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels: {app: webhook}
      priorityClassName: system-cluster-critical    # 15.6절
```

```yaml
# ⑤ PodDisruptionBudget (32장)
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2
  selector:
    matchLabels: {app: webhook}
```

**`objectSelector`로 옵트인 방식**을 쓰면 더 안전하다.

```yaml
objectSelector:
  matchLabels:
    webhook.example.com/enabled: "true"
```

라벨이 있는 오브젝트만 웹훅을 거친다. **범위가 명시적이라 사고 반경이 작다.**

### 위험 2: 지연

**어드미션은 요청 경로에 있다.** 웹훅이 100ms 걸리면 모든 관련 요청이 100ms 느려진다.

```
Deployment 롤아웃 시 Pod 100개 생성
  × 웹훅 200ms
  = 20초 추가
```

**대책**
- 웹훅 로직을 극도로 가볍게 유지한다
- 외부 시스템 조회를 피한다 (필요하면 캐싱)
- `objectSelector`로 대상을 좁힌다
- 21.6절의 `apiserver_admission_webhook_admission_duration_seconds` 메트릭을 모니터링한다

```bash
kubectl get --raw /metrics | grep apiserver_admission_webhook_admission_duration_seconds | head
```

### 위험 3: 순환 의존

```
웹훅 → Secret 조회 → Secret 생성 시 웹훅 호출 → ...
```

**웹훅이 조회하는 리소스에 자기 웹훅이 적용되면 안 된다.**

### 위험 4: 무한 변형

Mutating 웹훅이 오브젝트를 계속 바꾸면 API 서버가 수렴을 감지하지 못한다.

```go
// ❌ 매번 다른 값
obj.Annotations["mutated-at"] = time.Now().String()

// ✅ 멱등적
if _, ok := obj.Annotations["mutated"]; !ok {
    obj.Annotations["mutated"] = "true"
}
```

**`reinvocationPolicy: IfNeeded`** 를 쓰면 다른 웹훅이 오브젝트를 바꿨을 때 다시 호출된다. 이때 멱등하지 않으면 무한 루프가 된다.

### 위험 5: dry-run 파괴

```yaml
sideEffects: None
```

**`sideEffects: None`이면 웹훅이 클러스터 밖에 부수 효과가 없다는 선언**이다. dry-run 요청에도 호출된다.

부수 효과가 있는데 `None`이라고 하면, `kubectl apply --dry-run=server`가 실제 변경을 일으킨다. **정확히 선언해야 한다.**

### 웹훅 대신 쓸 수 있는 것

| 요구 | 대안 |
|---|---|
| 단순 검증 | **ValidatingAdmissionPolicy (CEL)** — 17.5절, 26.2절 |
| 기본값 주입 | **CRD 스키마 default** — 26.2절 |
| 정책 강제 | **Kyverno, Gatekeeper** — 18.6절 (검증된 구현) |
| 사후 교정 | **컨트롤러** — 어드미션이 아니라 조정 루프로 |

> **웹훅은 최후의 수단이다.** CEL로 되면 CEL로, 정책 엔진으로 되면 정책 엔진으로. 직접 웹훅을 만드는 것은 다른 방법이 없을 때다.

## 28.4 변환 웹훅

26.5절에서 미룬 것을 완성한다.

### 허브 버전 지정

```go
// api/v1/webapp_conversion.go
package v1

// v1을 허브로 선언 (21.1절의 허브 모델)
func (*WebApp) Hub() {}
```

### 스포크 버전 구현

```go
// api/v1beta1/webapp_conversion.go
package v1beta1

import (
    "encoding/json"

    "sigs.k8s.io/controller-runtime/pkg/conversion"
    demov1 "example.com/webapp-operator/api/v1"
)

const storagePreserveKey = "conversion.demo.example.com/v1-only-fields"

// v1beta1 → v1
func (src *WebApp) ConvertTo(dstRaw conversion.Hub) error {
    dst := dstRaw.(*demov1.WebApp)

    dst.ObjectMeta = src.ObjectMeta
    dst.Spec.Image = src.Spec.Image
    dst.Spec.Replicas = src.Spec.Replicas
    dst.Spec.Port = src.Spec.Port

    // v1beta1의 spec.environment → v1의 spec.tier (이름 변경)
    dst.Spec.Tier = src.Spec.Environment

    // v1beta1의 spec.cpu/memory → v1의 spec.resources (구조 변경)
    if src.Spec.CPU != "" || src.Spec.Memory != "" {
        dst.Spec.Resources = buildResources(src.Spec.CPU, src.Spec.Memory)
    }

    // ★ 이전 변환에서 보존한 v1 전용 필드 복원
    if data, ok := src.Annotations[storagePreserveKey]; ok {
        var preserved struct {
            Env []corev1.EnvVar `json:"env,omitempty"`
        }
        if err := json.Unmarshal([]byte(data), &preserved); err == nil {
            dst.Spec.Env = preserved.Env
        }
        delete(dst.Annotations, storagePreserveKey)
    }

    dst.Status.Phase = src.Status.Phase
    dst.Status.ReadyReplicas = src.Status.ReadyReplicas
    return nil
}

// v1 → v1beta1
func (dst *WebApp) ConvertFrom(srcRaw conversion.Hub) error {
    src := srcRaw.(*demov1.WebApp)

    dst.ObjectMeta = src.ObjectMeta
    dst.Spec.Image = src.Spec.Image
    dst.Spec.Replicas = src.Spec.Replicas
    dst.Spec.Port = src.Spec.Port
    dst.Spec.Environment = src.Spec.Tier
    dst.Spec.CPU, dst.Spec.Memory = splitResources(src.Spec.Resources)

    // ★ v1beta1에 없는 필드를 애노테이션에 보존 (무손실 왕복)
    if len(src.Spec.Env) > 0 {
        preserved := struct {
            Env []corev1.EnvVar `json:"env,omitempty"`
        }{Env: src.Spec.Env}
        if data, err := json.Marshal(preserved); err == nil {
            if dst.Annotations == nil {
                dst.Annotations = map[string]string{}
            }
            dst.Annotations[storagePreserveKey] = string(data)
        }
    }

    dst.Status.Phase = src.Status.Phase
    dst.Status.ReadyReplicas = src.Status.ReadyReplicas
    return nil
}
```

**애노테이션 보존 기법이 핵심이다.** 이것이 없으면 `v1 → v1beta1 → v1` 왕복에서 데이터가 사라진다.

### 등록

```go
// api/v1beta1/webapp_types.go
// +kubebuilder:storageversion    ← v1에 붙인다 (하나만)
```

```bash
make manifests
kubectl apply -f config/crd/bases/
```

### 검증

```bash
# v1beta1으로 생성
kubectl apply -f - <<EOF
apiVersion: demo.example.com/v1beta1
kind: WebApp
metadata: { name: conv-test }
spec:
  image: nginx:1.27-alpine
  environment: staging
  cpu: "200m"
EOF

# v1으로 조회 — 변환된다
kubectl get webapp.v1.demo.example.com conv-test -o yaml | grep -A5 spec:
# tier: staging               ← environment가 tier로 변환됨
# resources: {requests: {cpu: 200m}}

# 다시 v1beta1으로 조회
kubectl get webapp.v1beta1.demo.example.com conv-test -o yaml
```

**왕복 테스트**

```bash
kubectl get webapp.v1beta1.demo.example.com conv-test -o yaml > roundtrip.yaml
kubectl apply -f roundtrip.yaml
kubectl get webapp.v1.demo.example.com conv-test -o jsonpath='{.spec}' | jq
# 원본과 같아야 한다
```

## 28.5 커스텀 API 서버

### 언제 필요한가

24.2절에서 말한 대로 **드물다.** CRD로 안 되는 좁은 경우들이다.

| 요구 | 이유 |
|---|---|
| **etcd에 저장하고 싶지 않다** | metrics-server처럼 휘발성 데이터 |
| **외부 시스템이 진실의 원천** | 기존 DB를 쿠버네티스 API로 노출 |
| **커스텀 서브리소스** | `/logs`, `/exec` 같은 스트리밍 엔드포인트 |
| **protobuf 지원** | CRD는 JSON만 |
| **매우 높은 처리량** | 초당 수만 건의 쓰기 |

### 어그리게이션 구조

```
        클라이언트
             │
             ▼
    ┌────────────────────┐
    │   kube-apiserver   │
    │  ┌──────────────┐  │
    │  │ 어그리게이터   │  │  APIService에 등록된 경로를 프록시
    │  └───────┬──────┘  │
    └──────────┼─────────┘
               │ (mTLS + 사용자 정보 헤더)
               ▼
    ┌─────────────────────┐
    │  커스텀 API 서버      │  일반 Pod로 실행
    │  · 자체 인증/인가      │
    │  · 자체 스토리지       │
    └─────────────────────┘
```

```yaml
apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  name: v1alpha1.pizza.example.com
spec:
  group: pizza.example.com
  version: v1alpha1
  groupPriorityMinimum: 1000
  versionPriority: 15
  service:
    namespace: pizza-system
    name: pizza-apiserver
    port: 443
  caBundle: <base64>
```

```bash
kubectl get apiservices
kubectl api-resources --api-group=pizza.example.com
```

### 인증 위임

**커스텀 API 서버는 인증과 인가를 kube-apiserver에 위임할 수 있다.**

```
① 클라이언트 → kube-apiserver (인증됨)
② kube-apiserver → 커스텀 API 서버
   헤더에 사용자 정보 전달:
     X-Remote-User: alice
     X-Remote-Group: dev-team
③ 커스텀 API 서버가 SubjectAccessReview로 인가 확인
   → kube-apiserver에 "alice가 이걸 할 수 있나?" 질의
```

**`front-proxy` 인증서**로 이 헤더를 신뢰한다. 아무나 헤더를 위조할 수 없도록 하는 장치다.

```bash
docker exec k8s-guide-control-plane grep requestheader \
  /etc/kubernetes/manifests/kube-apiserver.yaml
```

### 구현 개요

`k8s.io/apiserver` 라이브러리를 쓴다.

```go
import (
    genericapiserver "k8s.io/apiserver/pkg/server"
    genericoptions "k8s.io/apiserver/pkg/server/options"
)

func NewCommandStartServer() *cobra.Command {
    o := &Options{
        RecommendedOptions: genericoptions.NewRecommendedOptions(
            "/registry/pizza.example.com",
            Codecs.LegacyCodec(v1alpha1.SchemeGroupVersion),
        ),
    }
    // 인증/인가를 kube-apiserver에 위임
    o.RecommendedOptions.Authentication = genericoptions.NewDelegatingAuthenticationOptions()
    o.RecommendedOptions.Authorization = genericoptions.NewDelegatingAuthorizationOptions()
    ...
}
```

**REST 스토리지 구현**

```go
type pizzaStorage struct {
    // 메모리, 외부 DB, 무엇이든 가능
}

func (s *pizzaStorage) Get(ctx context.Context, name string, opts *metav1.GetOptions) (runtime.Object, error) { ... }
func (s *pizzaStorage) List(ctx context.Context, opts *metainternalversion.ListOptions) (runtime.Object, error) { ... }
func (s *pizzaStorage) Create(ctx context.Context, obj runtime.Object, ...) (runtime.Object, error) { ... }
func (s *pizzaStorage) Watch(ctx context.Context, opts *metainternalversion.ListOptions) (watch.Interface, error) { ... }
```

**참조 구현**
- [sample-apiserver](https://github.com/kubernetes/sample-apiserver)
- [apiserver-builder-alpha](https://github.com/kubernetes-sigs/apiserver-builder-alpha)
- metrics-server (실전 사례)

**운영 주의**: APIService가 `Available=False`가 되면 **`kubectl get all`, `kubectl api-resources` 등이 실패한다.** 커스텀 API 서버의 가용성이 클러스터 사용성에 직결된다.

```bash
kubectl get apiservices | grep -v True
```

## 28.6 오퍼레이터 출하하기

27장에서 만든 오퍼레이터를 프로덕션에 배포하는 절차다.

### 패키징 선택지

| 방식 | 특징 |
|---|---|
| **Kustomize** (Kubebuilder 기본) | 오버레이로 환경별 구성. 30.2절 |
| **Helm 차트** | 값 기반 설정, 널리 익숙함. 30.1절 |
| **OLM 번들** | Operator Lifecycle Manager. OperatorHub 배포 |

**Helm 차트로 만들기**

```bash
# CRD는 crds/ 디렉터리에 (Helm이 특별 취급)
mychart/
├── Chart.yaml
├── values.yaml
├── crds/
│   └── webapps.yaml          # helm install 시 먼저 생성됨
└── templates/
    ├── deployment.yaml
    ├── rbac.yaml
    ├── service.yaml
    └── webhook.yaml
```

> **⚠️ Helm은 `crds/`의 CRD를 업그레이드하지 않는다**
> `helm upgrade`는 `crds/` 디렉터리를 무시한다. CRD 변경은 **수동으로 적용**해야 한다.
> ```bash
> kubectl apply -f crds/
> helm upgrade my-operator ./mychart
> ```
> 이것이 오퍼레이터 배포에서 가장 흔한 함정이다.

### 버전 관리

```
오퍼레이터 이미지 버전:  v1.2.3
CRD API 버전:          v1alpha1 → v1beta1 → v1
```

**둘은 독립적이다.** 오퍼레이터를 여러 번 업그레이드해도 API 버전은 유지될 수 있다.

**호환성 매트릭스를 문서화한다.**

```
오퍼레이터 v1.x  →  CRD v1alpha1, v1beta1 지원
오퍼레이터 v2.x  →  CRD v1beta1, v1 지원 (v1alpha1 제거)
```

### 업그레이드 절차

```
① CRD 업데이트 (새 필드는 항상 optional로)
     ↓
② 오퍼레이터 이미지 업데이트
     ↓
③ 조정이 정상 동작하는지 확인
     ↓
④ (버전 변경 시) 스토리지 마이그레이션 — 26.5절
     ↓
⑤ 구 API 버전 served: false
```

**하위 호환성 규칙**
- 필수 필드를 추가하지 않는다 (기존 리소스가 무효가 된다)
- 필드를 제거하지 않는다 (deprecated로 표시하고 무시)
- 필드의 타입이나 의미를 바꾸지 않는다 (새 필드를 추가한다)
- 기본값 변경은 신중하게 (기존 리소스의 동작이 바뀐다)

### 프로덕션 체크리스트

```
■ 신뢰성
  □ 리더 선출 활성화 (21.4절)
  □ replicas ≥ 2
  □ PodDisruptionBudget (32장)
  □ 리소스 requests/limits 설정 (14장)
  □ liveness/readiness 프로브 (6장)

■ 보안 (18장)
  □ 최소 권한 RBAC — 필요한 리소스와 동사만
  □ 전용 ServiceAccount
  □ securityContext: runAsNonRoot, drop ALL, readOnlyRootFilesystem
  □ NetworkPolicy로 통신 제한
  □ 이미지 스캐닝과 서명

■ 관측성 (31장)
  □ 메트릭 노출 (controller-runtime 기본 + 커스텀)
  □ ServiceMonitor 제공
  □ 이벤트 기록
  □ 구조화된 로깅
  □ 알림 규칙: 조정 실패율, 큐 깊이, 리더 전환

■ 웹훅 (있다면)
  □ 인증서 자동 갱신 (cert-manager)
  □ failurePolicy와 timeoutSeconds 검토
  □ namespaceSelector로 시스템 네임스페이스 제외 ★
  □ 웹훅 서버 다중화

■ 문서
  □ CRD 필드 설명 (kubectl explain에 나타난다)
  □ 예제 매니페스트
  □ 업그레이드 가이드와 호환성 매트릭스
  □ 트러블슈팅 가이드

■ 테스트
  □ 단위 테스트
  □ envtest 통합 테스트 (27.4절)
  □ 실제 클러스터에서의 e2e 테스트
  □ 업그레이드 경로 테스트
```

### 알림 예시

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: webapp-operator
spec:
  groups:
    - name: webapp-operator
      rules:
        - alert: OperatorReconcileErrors
          expr: |
            rate(controller_runtime_reconcile_errors_total{controller="webapp"}[5m]) > 0.1
          for: 10m
          labels: { severity: warning }
          annotations:
            summary: "WebApp 조정 에러율이 높습니다"

        - alert: OperatorQueueGrowing
          expr: workqueue_depth{name="webapp"} > 50
          for: 15m
          labels: { severity: warning }

        - alert: OperatorNotLeading
          expr: |
            sum(leader_election_master_status{name="webapp-operator"}) == 0
          for: 5m
          labels: { severity: critical }
          annotations:
            summary: "리더가 없습니다 — 조정이 멈췄습니다"
```

---

## 실습 과제

**과제 1 — 경고 후 차단 전략**
`latest` 태그 검증을 처음에는 `admission.Warnings`로만 반환하도록 만들고, 사용자가 경고를 보는 것을 확인한다. 그다음 에러로 바꿔 차단되는 것을 비교한다. 18장에서 배운 점진 도입 원칙의 적용이다.

**과제 2 — 웹훅 가용성 사고 재현**
Pod 리소스에 `failurePolicy: Fail`인 웹훅을 등록하고, 웹훅 서버를 0으로 스케일한 뒤 새 Pod를 만들려 시도한다. 어떤 에러가 나는지, 어떻게 복구하는지 확인한다. **(반드시 실습 클러스터에서)**

**과제 3 — 순환 의존 만들어 보기**
웹훅이 자기 네임스페이스에도 적용되도록 `namespaceSelector`를 제거하고, 웹훅 Pod를 재시작해 데드락을 재현한다. `namespaceSelector`를 복원해 해결한다.

**과제 4 — 무손실 변환 검증**
28.4절의 변환 웹훅에서 애노테이션 보존 코드를 제거하고, `v1 → v1beta1 → v1` 왕복 후 `spec.env`가 사라지는 것을 확인한다. 코드를 복원해 보존되는 것을 검증한다.

**과제 5 — 웹훅 지연 측정**
웹훅에 인위적인 `time.Sleep(500 * time.Millisecond)`를 넣고, Deployment replicas를 50으로 늘렸을 때 총 소요 시간을 측정한다. `apiserver_admission_webhook_admission_duration_seconds` 메트릭도 확인한다.

---

## 요약

- 어드미션 웹훅은 **`AdmissionReview`** 를 주고받으며, Mutating은 **base64 인코딩된 JSON Patch**를 반환한다. **`warnings`로 차단 없이 경고만 보낼 수 있어 점진 도입에 유용하다.**
- 웹훅에서 클러스터를 조회할 때는 **캐시 지연, 요청 경로 지연, 경쟁 조건** 세 가지를 주의한다. 어드미션은 **원자적 검증을 보장하지 않는다.**
- **웹훅의 가장 큰 위험은 가용성이다.** `failurePolicy: Fail`인 웹훅 서버가 죽으면 해당 리소스의 모든 변경이 차단되고, 자기 자신을 복구할 수 없는 **데드락**이 생길 수 있다.
- 필수 대비책: **`namespaceSelector`로 시스템·자기 네임스페이스 제외**, 짧은 `timeoutSeconds`, 웹훅 서버 다중화와 PDB, 처음에는 `failurePolicy: Ignore`, 가능하면 `objectSelector`로 옵트인.
- **웹훅은 최후의 수단이다.** CEL(ValidatingAdmissionPolicy, CRD 스키마)로 되면 그것을, 정책 강제는 검증된 정책 엔진(Kyverno, Gatekeeper)을 쓴다.
- 변환 웹훅은 **허브 모델**로 구현하며, **새 버전에만 있는 필드를 애노테이션에 보존**해야 왕복에서 데이터를 잃지 않는다.
- **커스텀 API 서버는 드물게 필요하다.** etcd에 저장하고 싶지 않거나, 외부 시스템이 진실의 원천이거나, 커스텀 서브리소스가 필요할 때다. **APIService가 `Available=False`면 `kubectl get all`까지 실패**하므로 가용성이 중요하다.
- 출하 시 하위 호환성 규칙: **필수 필드를 추가하지 않고, 필드를 제거하지 않으며, 의미를 바꾸지 않는다.** **Helm은 `crds/`를 업그레이드하지 않으므로** CRD 변경은 수동 적용이 필요하다.

**6부를 마치며** — 이제 쿠버네티스를 확장할 수 있다. 확장 지점을 파악하고(24장), API를 다루고(25장), 리소스를 정의하고(26장), 컨트롤러를 만들고(27장), 정책을 주입하고 출하한다(28장).

7부에서는 마지막으로 **프로덕션 운영**을 다룬다. 매니지드 쿠버네티스를 실전 구성하고, GitOps로 배포를 자동화하고, 관측성을 갖추고, 업그레이드와 장애에 대응하는 방법을 살펴본다.

---

**참고 원서**: *Programming Kubernetes* 7장, 8장, 9.2절
