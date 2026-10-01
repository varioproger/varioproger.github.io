# 25장. client-go 기초

> **학습목표**
> - client-go와 관련 저장소들의 역할 분담을 안다.
> - Go에서 쿠버네티스 오브젝트가 어떻게 표현되는지(스킴, GVK/GVR) 이해한다.
> - ClientSet, dynamic client, discovery client를 상황에 맞게 쓸 수 있다.
> - Informer·Lister·워크큐로 21.3절의 컨트롤러 패턴을 직접 구현한다.
> - 낙관적 동시성 충돌을 올바르게 처리할 수 있다.

---

## 들어가며

4.5절에서 `kubectl proxy` + curl로 API를 직접 호출했다. watch 스트림도 봤다.

이 장은 그것을 Go 코드로 한다. 그리고 21.3절에서 **그림으로만 본** 컨트롤러 패턴을 실제로 구현한다.

## 25.1 저장소 구조

### 세 저장소의 역할

쿠버네티스 Go 생태계는 여러 저장소로 나뉘어 있다. 처음에는 혼란스럽지만 역할 분담이 명확하다.

```
k8s.io/api
  · 오브젝트 타입 정의 (Pod, Deployment, Service ...)
  · 순수 데이터 구조. 로직 없음
  · 그룹/버전별 패키지: core/v1, apps/v1, batch/v1 ...

k8s.io/apimachinery
  · 타입 시스템의 기반
  · TypeMeta, ObjectMeta, LabelSelector
  · 직렬화, 버전 변환, 스킴
  · runtime.Object 인터페이스
  · 오류 처리 (errors.IsNotFound 등)

k8s.io/client-go
  · API 서버와 통신하는 클라이언트
  · ClientSet, dynamic, discovery
  · Informer, Lister, 워크큐
  · kubeconfig 로딩, 인증
```

**의존 방향**: `client-go` → `api` → `apimachinery`

**추가 저장소들**

| 저장소 | 용도 |
|---|---|
| `k8s.io/code-generator` | 코드 생성 도구 (27.1절) |
| `k8s.io/apiextensions-apiserver` | CRD 타입 (26장) |
| `sigs.k8s.io/controller-runtime` | 고수준 컨트롤러 프레임워크 (27.3절) |
| `sigs.k8s.io/controller-tools` | CRD 매니페스트 생성 |

### 버전 정합성

**client-go의 버전은 쿠버네티스 버전과 연동된다.**

```
kubernetes v1.31  ↔  client-go v0.31.x
kubernetes v1.30  ↔  client-go v0.30.x
```

```go
// go.mod
require (
    k8s.io/api v0.31.0
    k8s.io/apimachinery v0.31.0
    k8s.io/client-go v0.31.0
)
```

**세 라이브러리의 버전을 반드시 일치시켜야 한다.** 섞으면 컴파일 에러나 런타임 패닉이 난다.

**호환 범위**: client-go는 API 서버와 **±1 마이너 버전**까지 호환된다(3.1절의 kubectl 규칙과 같다).

## 25.2 Go에서의 쿠버네티스 오브젝트

### 타입 구조

4.2절에서 본 공통 구조가 Go 타입으로 그대로 나타난다.

```go
package v1  // k8s.io/api/core/v1

type Pod struct {
    metav1.TypeMeta   `json:",inline"`           // apiVersion, kind
    metav1.ObjectMeta `json:"metadata,omitempty"` // name, labels, ...
    Spec              PodSpec   `json:"spec,omitempty"`
    Status            PodStatus `json:"status,omitempty"`
}
```

```go
pod := &corev1.Pod{
    ObjectMeta: metav1.ObjectMeta{
        Name:      "demo",
        Namespace: "default",
        Labels:    map[string]string{"app": "demo"},
    },
    Spec: corev1.PodSpec{
        Containers: []corev1.Container{{
            Name:  "app",
            Image: "nginx:alpine",
            Ports: []corev1.ContainerPort{{ContainerPort: 80}},
        }},
    },
}
```

**YAML과 1:1로 대응한다.** JSON 태그가 필드 이름을 결정한다.

### 포인터 헬퍼

옵셔널 필드는 포인터다. "설정하지 않음"과 "0으로 설정함"을 구분하기 위해서다.

```go
import "k8s.io/utils/ptr"

deploy := &appsv1.Deployment{
    Spec: appsv1.DeploymentSpec{
        Replicas: ptr.To(int32(3)),           // *int32
    },
}

// 읽을 때
if deploy.Spec.Replicas != nil {
    fmt.Println(*deploy.Spec.Replicas)
}
// 또는
fmt.Println(ptr.Deref(deploy.Spec.Replicas, 1))   // nil이면 1
```

**`ptr.To`가 없던 시절에는** `func int32Ptr(i int32) *int32 { return &i }` 같은 헬퍼를 직접 만들었다. 오래된 예제 코드에서 자주 보인다.

### GVK와 GVR

4.1절의 개념이 Go에서 두 형태로 나타난다.

```go
// GroupVersionKind — 타입을 가리킨다 (Go 타입 시스템 관점)
gvk := schema.GroupVersionKind{
    Group:   "apps",
    Version: "v1",
    Kind:    "Deployment",     // 단수, 대문자
}

// GroupVersionResource — REST 엔드포인트를 가리킨다 (HTTP 관점)
gvr := schema.GroupVersionResource{
    Group:    "apps",
    Version:  "v1",
    Resource: "deployments",   // 복수, 소문자
}
```

**Kind는 타입 이름, Resource는 URL 경로다.** 대부분 단순히 소문자 복수형이지만 예외가 있어(`Endpoints` → `endpoints`) 매핑이 필요하다.

**RESTMapper**가 이 변환을 한다.

```go
mapper := restmapper.NewDiscoveryRESTMapper(groupResources)
mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
// mapping.Resource 가 GVR
```

### Scheme — 타입 레지스트리

**Scheme은 GVK와 Go 타입을 연결하는 등록부**다.

```go
import (
    "k8s.io/apimachinery/pkg/runtime"
    "k8s.io/client-go/kubernetes/scheme"
)

// 내장 타입은 이미 등록되어 있다
gvks, _, err := scheme.Scheme.ObjectKinds(&corev1.Pod{})
// [/v1, Kind=Pod]

// 커스텀 타입 등록 (27장에서 사용)
var (
    GroupVersion  = schema.GroupVersion{Group: "example.com", Version: "v1"}
    SchemeBuilder = &scheme.Builder{GroupVersion: GroupVersion}
    AddToScheme   = SchemeBuilder.AddToScheme
)

func init() {
    SchemeBuilder.Register(&MyResource{}, &MyResourceList{})
}
```

**Scheme이 하는 일**
- GVK ↔ Go 타입 매핑
- 직렬화/역직렬화 (JSON, YAML, protobuf)
- 버전 변환 (21.1절의 허브 모델)
- DeepCopy 지원

## 25.3 클라이언트 만들기

### kubeconfig 로딩

```go
package main

import (
    "flag"
    "path/filepath"

    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
    "k8s.io/client-go/tools/clientcmd"
    "k8s.io/client-go/util/homedir"
)

func buildConfig(kubeconfig string) (*rest.Config, error) {
    // ① 클러스터 안에서 실행 중이면 ServiceAccount 토큰 사용 (17.4절)
    if cfg, err := rest.InClusterConfig(); err == nil {
        return cfg, nil
    }
    // ② 밖이면 kubeconfig 파일
    return clientcmd.BuildConfigFromFlags("", kubeconfig)
}

func main() {
    var kubeconfig string
    if home := homedir.HomeDir(); home != "" {
        kubeconfig = filepath.Join(home, ".kube", "config")
    }
    flag.StringVar(&kubeconfig, "kubeconfig", kubeconfig, "path to kubeconfig")
    flag.Parse()

    cfg, err := buildConfig(kubeconfig)
    if err != nil {
        panic(err)
    }

    // 레이트 리밋 설정 (기본값이 낮다)
    cfg.QPS = 50
    cfg.Burst = 100

    clientset, err := kubernetes.NewForConfig(cfg)
    if err != nil {
        panic(err)
    }
    _ = clientset
}
```

> **⚠️ 기본 QPS가 낮다**
> `rest.Config`의 기본값은 QPS 5, Burst 10이다. 대량의 API 호출을 하면 **클라이언트 측에서 스로틀링**된다.
> ```
> Waited for 1.5s due to client-side throttling, request: GET:...
> ```
> 이 로그가 보이면 QPS를 올린다. 단, 21.2절의 APF도 고려해 과도하게 올리지는 않는다.

**`rest.InClusterConfig()`** 는 Pod 안에서 다음을 읽는다(17.4절).
```
/var/run/secrets/kubernetes.io/serviceaccount/token
/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
환경변수 KUBERNETES_SERVICE_HOST, KUBERNETES_SERVICE_PORT
```

### ClientSet — 타입 안전 클라이언트

```go
ctx := context.Background()

// 조회
pods, err := clientset.CoreV1().Pods("default").List(ctx, metav1.ListOptions{
    LabelSelector: "app=demo",
    Limit:         500,
})
for _, p := range pods.Items {
    fmt.Printf("%s\t%s\t%s\n", p.Name, p.Status.Phase, p.Spec.NodeName)
}

// 단건 조회
pod, err := clientset.CoreV1().Pods("default").Get(ctx, "demo", metav1.GetOptions{})
if errors.IsNotFound(err) {
    // 없음
}

// 생성
created, err := clientset.CoreV1().Pods("default").Create(ctx, pod, metav1.CreateOptions{})

// 삭제
err = clientset.CoreV1().Pods("default").Delete(ctx, "demo", metav1.DeleteOptions{
    GracePeriodSeconds: ptr.To(int64(30)),
})

// 다른 그룹
deploys, _ := clientset.AppsV1().Deployments("default").List(ctx, metav1.ListOptions{})
jobs, _   := clientset.BatchV1().Jobs("default").List(ctx, metav1.ListOptions{})
nodes, _  := clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})   // 클러스터 스코프
```

**타입이 컴파일 시점에 검사된다.** 오타나 잘못된 필드는 빌드에서 걸린다.

### 업데이트 — 충돌 처리

4.2절에서 본 낙관적 동시성 제어를 다뤄야 한다.

```go
import "k8s.io/client-go/util/retry"

err := retry.RetryOnConflict(retry.DefaultRetry, func() error {
    // ① 최신 버전을 다시 읽는다
    d, err := clientset.AppsV1().Deployments("default").Get(ctx, "web", metav1.GetOptions{})
    if err != nil {
        return err
    }
    // ② 수정
    d.Spec.Replicas = ptr.To(int32(5))
    // ③ 쓰기 — resourceVersion이 맞지 않으면 Conflict
    _, err = clientset.AppsV1().Deployments("default").Update(ctx, d, metav1.UpdateOptions{})
    return err
})
```

**반드시 루프 안에서 다시 읽어야 한다.** 밖에서 읽은 오브젝트를 재사용하면 계속 충돌한다.

### Patch — 더 나은 방법

전체 오브젝트를 보내는 Update 대신, **바뀐 부분만** 보낸다. 충돌 가능성이 크게 준다.

```go
// ① Strategic Merge Patch (내장 타입만)
patch := []byte(`{"spec":{"replicas":5}}`)
_, err := clientset.AppsV1().Deployments("default").
    Patch(ctx, "web", types.StrategicMergePatchType, patch, metav1.PatchOptions{})

// ② JSON Patch (RFC 6902) — 정밀한 제어
patch = []byte(`[
  {"op":"replace","path":"/spec/replicas","value":5},
  {"op":"add","path":"/metadata/labels/updated-by","value":"my-controller"}
]`)
_, err = clientset.AppsV1().Deployments("default").
    Patch(ctx, "web", types.JSONPatchType, patch, metav1.PatchOptions{})

// ③ Merge Patch (RFC 7386) — CRD에도 동작
patch = []byte(`{"metadata":{"labels":{"env":"prod"}}}`)
_, err = clientset.AppsV1().Deployments("default").
    Patch(ctx, "web", types.MergePatchType, patch, metav1.PatchOptions{})
```

**Strategic Merge Patch의 특징**: 배열을 병합할 때 `patchMergeKey`를 보고 요소를 매칭한다. 예를 들어 컨테이너 목록에서 이름이 같은 것을 찾아 병합한다. **CRD에는 이 메타데이터가 없어 동작하지 않는다.**

### Server-Side Apply

가장 현대적인 방식이다. **필드 소유권**을 추적해 여러 액터가 같은 오브젝트를 안전하게 관리할 수 있다.

```go
import (
    appsv1ac "k8s.io/client-go/applyconfigurations/apps/v1"
)

apply := appsv1ac.Deployment("web", "default").
    WithSpec(appsv1ac.DeploymentSpec().
        WithReplicas(5))

_, err := clientset.AppsV1().Deployments("default").
    Apply(ctx, apply, metav1.ApplyOptions{
        FieldManager: "my-controller",   // ★ 소유권 식별자
        Force:        true,
    })
```

**필드 소유권 확인**

```bash
kubectl get deployment web -o jsonpath='{.metadata.managedFields}' | jq
```

```json
[
  { "manager": "kubectl-client-side-apply", "fieldsV1": {"f:spec": {"f:template": {...}}} },
  { "manager": "my-controller", "fieldsV1": {"f:spec": {"f:replicas": {}}} }
]
```

**컨트롤러가 관리하는 필드와 사용자가 관리하는 필드가 명확히 나뉜다.** 16.6절에서 본 "HPA와 GitOps의 replicas 충돌"이 SSA로 해결되는 방향이다.

### Dynamic Client — 타입 없이

CRD처럼 컴파일 시점에 타입을 모르는 리소스를 다룰 때 쓴다.

```go
import (
    "k8s.io/client-go/dynamic"
    "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

dyn, err := dynamic.NewForConfig(cfg)

gvr := schema.GroupVersionResource{
    Group:    "cert-manager.io",
    Version:  "v1",
    Resource: "certificates",
}

list, err := dyn.Resource(gvr).Namespace("default").List(ctx, metav1.ListOptions{})
for _, item := range list.Items {
    name := item.GetName()
    // 중첩 필드 접근
    dnsNames, found, _ := unstructured.NestedStringSlice(item.Object, "spec", "dnsNames")
    ready, found, _ := unstructured.NestedString(item.Object, "status", "conditions")
    fmt.Println(name, dnsNames, ready)
}
```

**`unstructured.Unstructured`는 `map[string]interface{}` 래퍼다.** 타입 안전성이 없는 대신 어떤 리소스든 다룰 수 있다.

**생성도 가능하다.**

```go
obj := &unstructured.Unstructured{
    Object: map[string]interface{}{
        "apiVersion": "example.com/v1",
        "kind":       "MyResource",
        "metadata":   map[string]interface{}{"name": "demo"},
        "spec":       map[string]interface{}{"size": int64(3)},
    },
}
_, err = dyn.Resource(gvr).Namespace("default").Create(ctx, obj, metav1.CreateOptions{})
```

> **숫자는 `int64`로 써야 한다.** `int`를 쓰면 직렬화에서 문제가 생긴다. 흔한 실수다.

### Discovery Client — API 탐색

```go
import "k8s.io/client-go/discovery"

dc, err := discovery.NewDiscoveryClientForConfig(cfg)

// 서버 버전
v, _ := dc.ServerVersion()
fmt.Println(v.GitVersion)

// 모든 그룹/리소스
_, apiResourceLists, _ := dc.ServerGroupsAndResources()
for _, list := range apiResourceLists {
    for _, r := range list.APIResources {
        fmt.Printf("%s/%s %s (namespaced=%v verbs=%v)\n",
            list.GroupVersion, r.Name, r.Kind, r.Namespaced, r.Verbs)
    }
}
```

`kubectl api-resources`가 하는 일이다(4.1절).

## 25.4 Informer와 Lister

### 왜 필요한가

컨트롤러가 조정할 때마다 API 서버를 호출하면 부하가 감당되지 않는다(21.3절).

```
❌ 나쁜 방식
for {
    pods, _ := clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
    reconcile(pods)
    time.Sleep(10 * time.Second)
}
// 10초마다 전체 목록을 가져온다 → API 서버 부하
```

**Informer는 watch로 상태를 로컬 캐시에 유지하고, 읽기는 캐시에서 처리한다.**

### 구조

```
   API 서버
      │ List → Watch
      ▼
┌─────────────────────────────────────────┐
│  Reflector                              │
│    · 초기 List로 캐시를 채운다             │
│    · Watch로 변경을 받는다                │
│    · 410 Gone이면 relist (21.1절)        │
└──────────────┬──────────────────────────┘
               ▼
        ┌─────────────┐
        │  DeltaFIFO  │
        └──────┬──────┘
               ▼
┌─────────────────────────────────────────┐
│  Informer (sharedIndexInformer)         │
│    ┌──────────────┐  ┌───────────────┐  │
│    │  Indexer     │  │ 이벤트 핸들러   │  │
│    │  (로컬 캐시)   │  │ Add/Update/Del│  │
│    └──────┬───────┘  └───────┬───────┘  │
└───────────┼──────────────────┼──────────┘
            ▼                  ▼
      ┌──────────┐        ┌─────────┐
      │  Lister  │        │ 워크큐   │
      │ (읽기 API)│        └─────────┘
      └──────────┘
```

### SharedInformerFactory

**여러 컨트롤러가 같은 리소스를 watch할 때 연결을 공유한다.** "Shared"가 그 뜻이다.

```go
import "k8s.io/client-go/informers"

factory := informers.NewSharedInformerFactory(clientset, 30*time.Minute)
//                                            resync 주기 ↑

podInformer := factory.Core().V1().Pods()
deployInformer := factory.Apps().V1().Deployments()

// 이벤트 핸들러 등록
podInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
    AddFunc: func(obj interface{}) {
        pod := obj.(*corev1.Pod)
        fmt.Println("ADD", pod.Name)
    },
    UpdateFunc: func(old, new interface{}) {
        oldPod := old.(*corev1.Pod)
        newPod := new.(*corev1.Pod)
        if oldPod.ResourceVersion == newPod.ResourceVersion {
            return    // resync로 인한 이벤트 (변경 없음)
        }
        fmt.Println("UPDATE", newPod.Name)
    },
    DeleteFunc: func(obj interface{}) {
        // ★ 삭제는 DeletedFinalStateUnknown일 수 있다
        pod, ok := obj.(*corev1.Pod)
        if !ok {
            tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
            if !ok {
                return
            }
            pod, ok = tombstone.Obj.(*corev1.Pod)
            if !ok {
                return
            }
        }
        fmt.Println("DELETE", pod.Name)
    },
})

stopCh := make(chan struct{})
defer close(stopCh)

factory.Start(stopCh)
factory.WaitForCacheSync(stopCh)   // ★ 캐시가 채워질 때까지 대기

<-stopCh
```

> **⚠️ `DeletedFinalStateUnknown`을 반드시 처리하라**
> watch 연결이 끊긴 사이에 오브젝트가 삭제되면, Informer는 relist 후 "이것이 없어졌다"는 것만 안다. 최종 상태를 모르므로 tombstone으로 감싸 전달한다.
>
> 이 처리를 빠뜨리면 **타입 단언에서 패닉**이 난다. 실무에서 흔한 버그다.

> **⚠️ `WaitForCacheSync`를 빠뜨리지 마라**
> 캐시가 채워지기 전에 조정을 시작하면 "리소스가 없다"고 판단해 **잘못된 삭제**를 할 수 있다.

### Resync의 의미

```go
factory := informers.NewSharedInformerFactory(clientset, 30*time.Minute)
```

**resync는 API 서버를 다시 호출하는 것이 아니다.** 캐시에 있는 모든 오브젝트에 대해 `UpdateFunc`를 다시 호출할 뿐이다.

**용도**: 21.3절에서 말한 "이벤트 유실에 대한 안전망"이다. 레벨 트리거이므로 주기적으로 전체를 다시 조정하면 놓친 것이 복구된다.

**0으로 하면 resync를 하지 않는다.** controller-runtime의 기본값은 10시간이다.

### Lister — 캐시에서 읽기

```go
podLister := podInformer.Lister()

// 네임스페이스 + 이름
pod, err := podLister.Pods("default").Get("web")
if errors.IsNotFound(err) { ... }

// 라벨 셀렉터
selector := labels.SelectorFromSet(labels.Set{"app": "web"})
pods, err := podLister.Pods("default").List(selector)

// 전체 네임스페이스
allPods, err := podLister.List(labels.Everything())
```

**API 서버를 호출하지 않는다.** 메모리 조회라 매우 빠르다.

> **⚠️ Lister가 반환하는 오브젝트를 수정하지 마라**
> 캐시의 포인터를 그대로 반환한다. 수정하면 캐시가 오염된다.
> ```go
> pod, _ := podLister.Pods("default").Get("web")
> pod.Labels["x"] = "y"          // ❌ 캐시 오염!
>
> podCopy := pod.DeepCopy()      // ✅
> podCopy.Labels["x"] = "y"
> clientset.CoreV1().Pods("default").Update(ctx, podCopy, metav1.UpdateOptions{})
> ```

### 필터링과 인덱스

**특정 네임스페이스나 라벨만 watch**하면 메모리를 절약할 수 있다.

```go
factory := informers.NewSharedInformerFactoryWithOptions(
    clientset,
    30*time.Minute,
    informers.WithNamespace("production"),
    informers.WithTweakListOptions(func(opts *metav1.ListOptions) {
        opts.LabelSelector = "managed-by=my-operator"
    }),
)
```

**커스텀 인덱스**로 조회를 빠르게 할 수 있다.

```go
podInformer.Informer().AddIndexers(cache.Indexers{
    "nodeName": func(obj interface{}) ([]string, error) {
        pod := obj.(*corev1.Pod)
        return []string{pod.Spec.NodeName}, nil
    },
})

// 특정 노드의 Pod를 O(1)로 조회
objs, err := podInformer.Informer().GetIndexer().ByIndex("nodeName", "worker-1")
```

## 25.5 실습: 첫 컨트롤러 만들기

**21.3절의 패턴을 그대로 구현한다.** 라벨이 없는 Pod에 자동으로 라벨을 붙이는 컨트롤러다.

### 프로젝트 준비

```bash
mkdir -p ~/k8s-guide/label-controller && cd ~/k8s-guide/label-controller
go mod init example.com/label-controller
go get k8s.io/client-go@v0.31.0 k8s.io/api@v0.31.0 k8s.io/apimachinery@v0.31.0
go get k8s.io/utils
```

### main.go

```go
package main

import (
    "context"
    "flag"
    "fmt"
    "os"
    "os/signal"
    "path/filepath"
    "syscall"
    "time"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/apimachinery/pkg/api/errors"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/types"
    "k8s.io/apimachinery/pkg/util/runtime"
    "k8s.io/apimachinery/pkg/util/wait"
    "k8s.io/client-go/informers"
    "k8s.io/client-go/kubernetes"
    listersv1 "k8s.io/client-go/listers/core/v1"
    "k8s.io/client-go/rest"
    "k8s.io/client-go/tools/cache"
    "k8s.io/client-go/tools/clientcmd"
    "k8s.io/client-go/util/homedir"
    "k8s.io/client-go/util/workqueue"
    "k8s.io/klog/v2"
)

const (
    managedLabel = "managed-by"
    managedValue = "label-controller"
)

type Controller struct {
    clientset kubernetes.Interface
    lister    listersv1.PodLister
    synced    cache.InformerSynced
    queue     workqueue.TypedRateLimitingInterface[string]
}

func NewController(clientset kubernetes.Interface, informer informers.SharedInformerFactory) *Controller {
    podInformer := informer.Core().V1().Pods()

    c := &Controller{
        clientset: clientset,
        lister:    podInformer.Lister(),
        synced:    podInformer.Informer().HasSynced,
        queue: workqueue.NewTypedRateLimitingQueue[string](
            workqueue.DefaultTypedControllerRateLimiter[string](),
        ),
    }

    podInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: c.enqueue,
        UpdateFunc: func(old, new interface{}) {
            oldPod := old.(*corev1.Pod)
            newPod := new.(*corev1.Pod)
            if oldPod.ResourceVersion == newPod.ResourceVersion {
                return // resync
            }
            c.enqueue(new)
        },
        // 삭제는 처리할 것이 없으므로 등록하지 않는다
    })

    return c
}

// ★ 오브젝트가 아니라 키(namespace/name)만 큐에 넣는다
func (c *Controller) enqueue(obj interface{}) {
    key, err := cache.MetaNamespaceKeyFunc(obj)
    if err != nil {
        runtime.HandleError(err)
        return
    }
    c.queue.Add(key)
}

func (c *Controller) Run(ctx context.Context, workers int) error {
    defer runtime.HandleCrash()
    defer c.queue.ShutDown()

    klog.Info("waiting for cache sync")
    if !cache.WaitForCacheSync(ctx.Done(), c.synced) {
        return fmt.Errorf("failed to sync caches")
    }
    klog.Info("cache synced, starting workers")

    for i := 0; i < workers; i++ {
        go wait.UntilWithContext(ctx, c.runWorker, time.Second)
    }

    <-ctx.Done()
    klog.Info("shutting down")
    return nil
}

func (c *Controller) runWorker(ctx context.Context) {
    for c.processNextItem(ctx) {
    }
}

func (c *Controller) processNextItem(ctx context.Context) bool {
    key, shutdown := c.queue.Get()
    if shutdown {
        return false
    }
    defer c.queue.Done(key)

    if err := c.reconcile(ctx, key); err != nil {
        // ★ 실패하면 지수 백오프로 재시도
        if c.queue.NumRequeues(key) < 5 {
            klog.Errorf("reconcile %s failed (retry %d): %v",
                key, c.queue.NumRequeues(key), err)
            c.queue.AddRateLimited(key)
            return true
        }
        klog.Errorf("dropping %s after too many retries: %v", key, err)
        c.queue.Forget(key)
        runtime.HandleError(err)
        return true
    }

    c.queue.Forget(key)   // ★ 성공하면 백오프 카운터 초기화
    return true
}

// 조정 함수 — 멱등해야 하고, 레벨 트리거여야 한다
func (c *Controller) reconcile(ctx context.Context, key string) error {
    ns, name, err := cache.SplitMetaNamespaceKey(key)
    if err != nil {
        return err
    }

    // ① 현재 상태를 캐시에서 읽는다
    pod, err := c.lister.Pods(ns).Get(name)
    if errors.IsNotFound(err) {
        klog.V(4).Infof("pod %s no longer exists", key)
        return nil // 삭제됨 — 할 일 없음
    }
    if err != nil {
        return err
    }

    // 시스템 네임스페이스는 건드리지 않는다
    if ns == "kube-system" || ns == "kube-public" || ns == "kube-node-lease" {
        return nil
    }

    // ② 원하는 상태와 비교
    if pod.Labels[managedLabel] == managedValue {
        return nil // 이미 원하는 상태 — 아무것도 하지 않는다 ★ 멱등성
    }

    // ③ 차이를 줄이는 조치
    klog.Infof("labeling pod %s", key)
    patch := fmt.Appendf(nil,
        `{"metadata":{"labels":{%q:%q}}}`, managedLabel, managedValue)
    _, err = c.clientset.CoreV1().Pods(ns).
        Patch(ctx, name, types.MergePatchType, patch, metav1.PatchOptions{})
    if errors.IsNotFound(err) {
        return nil // 그 사이 삭제됨
    }
    return err
}

func main() {
    klog.InitFlags(nil)
    var kubeconfig string
    if home := homedir.HomeDir(); home != "" {
        kubeconfig = filepath.Join(home, ".kube", "config")
    }
    flag.StringVar(&kubeconfig, "kubeconfig", kubeconfig, "path to kubeconfig")
    workers := flag.Int("workers", 2, "number of workers")
    flag.Parse()

    cfg, err := rest.InClusterConfig()
    if err != nil {
        cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
        if err != nil {
            klog.Fatal(err)
        }
    }
    cfg.QPS = 50
    cfg.Burst = 100

    clientset, err := kubernetes.NewForConfig(cfg)
    if err != nil {
        klog.Fatal(err)
    }

    factory := informers.NewSharedInformerFactory(clientset, 10*time.Minute)
    controller := NewController(clientset, factory)

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // graceful shutdown (6.4절의 개념이 컨트롤러에도 적용된다)
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    go func() {
        <-sigCh
        klog.Info("received signal, shutting down")
        cancel()
    }()

    factory.Start(ctx.Done())

    if err := controller.Run(ctx, *workers); err != nil {
        klog.Fatal(err)
    }
}
```

### 실행

```bash
go mod tidy
go run . -v=2
```

다른 터미널에서:

```bash
kubectl run test-a --image=nginx:alpine
kubectl run test-b --image=nginx:alpine

kubectl get pods --show-labels
```
```
NAME     READY   STATUS    LABELS
test-a   1/1     Running   managed-by=label-controller,run=test-a
test-b   1/1     Running   managed-by=label-controller,run=test-b
```

**컨트롤러가 라벨을 붙였다.**

**멱등성 확인**

```bash
kubectl label pod test-a managed-by-
# 즉시 다시 붙는다
kubectl get pod test-a --show-labels
```

**레벨 트리거 확인** (21장 과제 5의 재현)

```bash
# 컨트롤러를 정지 (Ctrl+C)
kubectl run test-c --image=nginx:alpine
kubectl get pod test-c --show-labels     # 라벨 없음

# 컨트롤러 재시작
go run . -v=2
kubectl get pod test-c --show-labels     # 라벨이 붙는다!
```

**이벤트를 놓쳤는데도 복구됐다.** 시작 시 List로 전체 상태를 받아 조정했기 때문이다. **이것이 레벨 트리거의 힘이다.**

### 정리

```bash
kubectl delete pod test-a test-b test-c --ignore-not-found
```

## 25.6 클러스터 안에서 실행하기

컨트롤러를 Pod로 배포하려면 RBAC이 필요하다(17.3절).

```yaml
# deploy.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: label-controller
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: label-controller
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch", "patch"]     # ★ 최소 권한
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: label-controller
subjects:
  - kind: ServiceAccount
    name: label-controller
    namespace: kube-system
roleRef:
  kind: ClusterRole
  name: label-controller
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: label-controller
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels: { app: label-controller }
  template:
    metadata:
      labels: { app: label-controller }
    spec:
      serviceAccountName: label-controller
      securityContext:                    # 18.2절
        runAsNonRoot: true
        runAsUser: 65532
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: controller
          image: label-controller:0.1
          args: ["-v=2"]
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          resources:                       # 14장
            requests: { cpu: 50m, memory: 64Mi }
            limits:   { memory: 256Mi }
```

**Dockerfile** (2.2절의 멀티 스테이지 빌드)

```dockerfile
FROM golang:1.22 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/controller .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/controller /controller
USER 65532:65532
ENTRYPOINT ["/controller"]
```

```bash
docker build -t label-controller:0.1 .
kind load docker-image label-controller:0.1 --name k8s-guide
kubectl apply -f deploy.yaml
kubectl logs -n kube-system -l app=label-controller -f
```

**여러 replica를 띄우려면 리더 선출이 필요하다**(21.4절). 27장에서 controller-runtime으로 간단히 처리한다.

---

## 실습 과제

**과제 1 — DeletedFinalStateUnknown 처리 확인**
`DeleteFunc`에 tombstone 처리 없이 타입 단언만 넣고, 컨트롤러를 정지한 상태에서 Pod를 삭제한 뒤 재시작해 패닉이 나는지 확인한다. 그다음 올바른 처리를 추가한다.

**과제 2 — 캐시 오염 재현**
Lister가 반환한 오브젝트를 DeepCopy 없이 수정하고, 이후 조회에서 수정된 값이 보이는 것을 확인한다. 이것이 왜 위험한지 설명한다.

**과제 3 — Dynamic Client로 CRD 다루기**
클러스터에 설치된 CRD(예: cert-manager의 Certificate) 하나를 dynamic client로 조회하고, `unstructured.NestedString`으로 status의 조건을 읽어 출력하는 프로그램을 작성한다.

**과제 4 — 워크큐 백오프 관찰**
`reconcile`이 항상 에러를 반환하도록 만들고, 로그의 재시도 간격이 지수적으로 늘어나는 것을 기록한다. 5회 후 드롭되는 것도 확인한다.

**과제 5 — Server-Side Apply 필드 소유권**
같은 Deployment의 `replicas`를 두 개의 다른 `FieldManager`로 Apply하고, `managedFields`가 어떻게 변하는지 관찰한다. 한쪽이 필드를 제거하면 어떻게 되는가?

---

## 요약

- Go 생태계는 **`k8s.io/api`**(타입), **`k8s.io/apimachinery`**(타입 시스템 기반), **`k8s.io/client-go`**(클라이언트)로 나뉘며 **버전을 반드시 일치**시켜야 한다.
- **GVK는 Go 타입을, GVR은 REST 경로를** 가리킨다. **Scheme**이 둘을 연결하고 직렬화·변환·DeepCopy를 제공한다.
- **ClientSet**은 타입 안전하고, **dynamic client**는 컴파일 시점에 모르는 리소스(CRD)를 다루며, **discovery client**는 API를 탐색한다.
- 업데이트는 **`retry.RetryOnConflict` 안에서 다시 읽고 수정**해야 한다. 더 나은 방법은 **Patch**이고, 가장 현대적인 것은 **Server-Side Apply**(필드 소유권 추적)다.
- **Informer**는 watch로 로컬 캐시를 유지하고, **Lister**로 API 호출 없이 읽는다. `WaitForCacheSync`를 반드시 호출하고, `DeletedFinalStateUnknown`을 처리하며, **Lister가 반환한 오브젝트는 DeepCopy 후 수정**한다.
- **resync는 API를 다시 호출하는 것이 아니라** 캐시의 오브젝트로 UpdateFunc를 재호출하는 것이다. 이벤트 유실에 대한 안전망이다.
- **워크큐에는 오브젝트가 아니라 키를 넣는다.** 처리 시점에 캐시에서 최신 상태를 읽고, 중복은 자동 제거되며, 실패는 지수 백오프로 재시도된다.
- 조정 함수는 **멱등**해야 한다. "이미 원하는 상태면 아무것도 하지 않는다"가 핵심이며, 이 덕분에 **이벤트를 놓쳐도 복구된다**(레벨 트리거).

**다음 장에서는** 이 컨트롤러가 다룰 **나만의 리소스 종류**를 정의한다. CRD로 API를 확장하고, 스키마 검증과 서브리소스, 버저닝까지 다룬다.

---

**참고 원서**: *Programming Kubernetes* 3장
