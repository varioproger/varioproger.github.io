---
title: "8장. client-go와 API Machinery"
---

# 8장. client-go와 API Machinery

> **학습목표**
> - typed ClientSet, dynamic client, discovery client를 상황에 맞게 골라 쓸 수 있다.
> - SharedInformerFactory로 Informer를 만들고, Lister/Indexer로 로컬 캐시를 읽을 수 있다.
> - 이벤트 핸들러 → 워크큐 → 워커라는 5장의 내부 패턴을 애플리케이션 코드로 직접 조립할 수 있다.
> - `runtime.Scheme`과 `RESTMapper`가 왜 필요한지, 어떻게 GVK/GVR을 연결하는지 설명할 수 있다.
> - `fake` 클라이언트로 API 서버 없이 컨트롤러 로직을 단위 테스트할 수 있다.

---

## 들어가며

5장에서 컨트롤러 매니저 내부를 열어 Informer, DeltaFIFO, 워크큐라는 **자료구조**를 봤다. 그 장의 초점은 "쿠버네티스가 내부적으로 어떻게 동작하는가"였다.

이 장의 초점은 다르다. **내가 만드는 애플리케이션이 그 인프라를 어떻게 소비하는가.** 7장에서 지도로 본 8가지 확장 방법 중 ①(CRD+컨트롤러)과 ②(오퍼레이터)는 물론이고, 사실상 나머지 대부분(③ 웹훅 서버가 리소스를 조회할 때, ④ 스케줄러 플러그인이 파드 정보를 읽을 때)도 결국 client-go 위에서 동작한다. **client-go는 이 책 2부 전체의 공통 기반이다.**

```
k8s.io/api
  · 오브젝트 타입 정의 (Pod, Deployment, Service ...)
  · 순수 데이터 구조, 로직 없음

k8s.io/apimachinery
  · 타입 시스템의 기반 (TypeMeta, ObjectMeta, LabelSelector)
  · Scheme, 직렬화, 버전 변환 (2장의 허브 모델과 동일한 원리)
  · runtime.Object 인터페이스, errors.IsNotFound 등

k8s.io/client-go
  · API 서버와 통신하는 클라이언트 (ClientSet, dynamic, discovery)
  · Informer, Lister, Indexer, 워크큐
```

**의존 방향은 `client-go → api → apimachinery`다.** 세 라이브러리의 버전은 반드시 일치시켜야 한다.

```go
// go.mod
require (
    k8s.io/api v0.34.0
    k8s.io/apimachinery v0.34.0
    k8s.io/client-go v0.34.0
)
```

client-go 버전은 클러스터 버전과 **±1 마이너**까지 호환된다.

## 8.1 ClientSet 구조

client-go에는 세 가지 클라이언트가 있다. 무엇을 다루는지에 따라 골라 쓴다.

```
용도                                  클라이언트
────────────────────────           ─────────────
내장 리소스를 타입 안전하게 다룬다      typed ClientSet (kubernetes.Interface)
CRD처럼 컴파일 시점에 모르는            dynamic client (dynamic.Interface)
리소스를 다룬다
어떤 API가 존재하는지 탐색한다          discovery client
```

### typed ClientSet

`k8s.io/api`에 정의된 Go 구조체를 그대로 주고받는다. **필드 오타나 잘못된 타입은 컴파일 시점에 걸린다.**

```go
package main

import (
    "context"
    "fmt"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/apimachinery/pkg/api/errors"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
)

func run(cfg *rest.Config) error {
    clientset, err := kubernetes.NewForConfig(cfg)
    if err != nil {
        return err
    }
    ctx := context.Background()

    pods, err := clientset.CoreV1().Pods("default").List(ctx, metav1.ListOptions{
        LabelSelector: "app=demo",
    })
    if err != nil {
        return err
    }
    for _, p := range pods.Items {
        fmt.Printf("%s\t%s\t%s\n", p.Name, p.Status.Phase, p.Spec.NodeName)
    }

    _, err = clientset.CoreV1().Pods("default").Get(ctx, "web-0", metav1.GetOptions{})
    if errors.IsNotFound(err) {
        fmt.Println("web-0 없음")
    }

    // 다른 API 그룹도 같은 인터페이스로
    deploys, _ := clientset.AppsV1().Deployments("default").List(ctx, metav1.ListOptions{})
    nodes, _ := clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{}) // 클러스터 스코프
    _ = deploys
    _ = nodes
    return nil
}
```

`kubernetes.Interface`는 `CoreV1()`, `AppsV1()`, `BatchV1()` 같은 메서드로 그룹/버전별 하위 인터페이스에 접근한다. **CRD는 여기 나타나지 않는다** — 컴파일 시점에 client-go 자체가 CRD의 존재를 모르기 때문이다.

### dynamic client — 타입을 모르는 리소스

CRD처럼 컴파일 시점에 Go 타입이 없는 리소스는 `unstructured.Unstructured`(사실상 `map[string]interface{}` 래퍼)로 다룬다.

```go
import (
    "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
    "k8s.io/apimachinery/pkg/runtime/schema"
    "k8s.io/client-go/dynamic"
)

func listWebApps(cfg *rest.Config) error {
    dyn, err := dynamic.NewForConfig(cfg)
    if err != nil {
        return err
    }

    gvr := schema.GroupVersionResource{
        Group:    "example.com",
        Version:  "v1",
        Resource: "webapps", // ★ 소문자 복수형 — 9장에서 CRD로 정의
    }

    list, err := dyn.Resource(gvr).Namespace("default").List(context.Background(), metav1.ListOptions{})
    if err != nil {
        return err
    }
    for _, item := range list.Items {
        replicas, found, _ := unstructured.NestedInt64(item.Object, "spec", "replicas")
        ready, _, _ := unstructured.NestedString(item.Object, "status", "phase")
        fmt.Println(item.GetName(), "replicas:", replicas, "found:", found, "phase:", ready)
    }
    return nil
}
```

**생성도 가능하다.**

```go
obj := &unstructured.Unstructured{
    Object: map[string]interface{}{
        "apiVersion": "example.com/v1",
        "kind":       "WebApp",
        "metadata": map[string]interface{}{
            "name": "demo",
        },
        "spec": map[string]interface{}{
            "replicas": int64(3), // ★ 반드시 int64 — int를 쓰면 직렬화 오류
            "image":    "nginx:alpine",
        },
    },
}
_, err = dyn.Resource(gvr).Namespace("default").Create(context.Background(), obj, metav1.CreateOptions{})
```

> **타입 안전성을 잃는 대신 범용성을 얻는다.** 웹훅 서버나 범용 도구(예: 백업 도구, GitOps 엔진)가 "어떤 리소스든" 다뤄야 할 때 dynamic client를 쓴다. 특정 CRD 하나만 상대하는 컨트롤러라면, 9~10장에서 볼 code-generator로 typed 클라이언트를 생성하는 편이 안전하다.

### discovery client — API 탐색

`kubectl api-resources`가 내부적으로 하는 일이다. **어떤 그룹/버전/리소스가 서버에 존재하는지, 각 리소스가 네임스페이스 스코프인지, 어떤 동사(verb)를 지원하는지**를 런타임에 조회한다.

```go
import "k8s.io/client-go/discovery"

func exploreAPI(cfg *rest.Config) error {
    dc, err := discovery.NewDiscoveryClientForConfig(cfg)
    if err != nil {
        return err
    }

    v, err := dc.ServerVersion()
    if err != nil {
        return err
    }
    fmt.Println("서버 버전:", v.GitVersion)

    _, apiResourceLists, err := dc.ServerGroupsAndResources()
    if err != nil {
        return err // 부분 실패일 수 있다 — 일부 APIService가 죽어 있어도 나머지는 반환된다
    }
    for _, list := range apiResourceLists {
        for _, r := range list.APIResources {
            fmt.Printf("%s/%s  kind=%s  namespaced=%v  verbs=%v\n",
                list.GroupVersion, r.Name, r.Kind, r.Namespaced, r.Verbs)
        }
    }
    return nil
}
```

**용도**: dynamic client로 임의의 리소스를 다루기 전에, 그 리소스가 실제로 존재하는지·네임스페이스 스코프인지 확인할 때 쓴다. 7장에서 본 어그리게이션 API 서버(`metrics.k8s.io`)가 죽어 있으면 `ServerGroupsAndResources`가 그 그룹에 대해서만 에러를 반환하고 나머지는 정상 반환하는 **부분 실패 내성**을 갖는다는 점이 실무에서 중요하다.

## 8.2 Informer/Lister/Indexer 사용법

5장에서 Reflector → DeltaFIFO → Indexer라는 내부 구조를 봤다. 이 절은 **그 구조 위에 얹는 애플리케이션 코드**를 다룬다.

### 왜 매번 List하면 안 되는가

```go
// ❌ 나쁜 방식 — 폴링
for {
    pods, _ := clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
    reconcile(pods)
    time.Sleep(10 * time.Second)
}
```

10초마다 **클러스터 전체의 Pod 목록**을 API 서버에서 가져온다. Pod가 몇만 개인 클러스터에서는 이것만으로 API 서버에 상당한 부하를 준다. Informer는 이 문제를 "watch로 변경만 받고, 읽기는 로컬 캐시에서 처리"하는 방식으로 해결한다(5장에서 본 watch cache의 클라이언트 측 대응물이다).

### SharedInformerFactory

**"Shared"**의 의미는 명확하다. 한 프로세스 안에서 여러 컨트롤러가 같은 리소스(예: Pod)를 다뤄야 할 때, **watch 연결과 로컬 캐시를 하나만 만들어 공유**한다.

```go
package main

import (
    "context"
    "time"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/client-go/informers"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/tools/cache"
    "k8s.io/klog/v2"
)

func setupInformers(clientset kubernetes.Interface, stopCh <-chan struct{}) {
    factory := informers.NewSharedInformerFactory(clientset, 30*time.Second) // resync 주기

    podInformer := factory.Core().V1().Pods()
    deployInformer := factory.Apps().V1().Deployments()

    podInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            klog.Infof("ADD pod=%s/%s phase=%s", pod.Namespace, pod.Name, pod.Status.Phase)
        },
        UpdateFunc: func(oldObj, newObj interface{}) {
            oldPod := oldObj.(*corev1.Pod)
            newPod := newObj.(*corev1.Pod)
            if oldPod.ResourceVersion == newPod.ResourceVersion {
                return // resync로 인한 재호출 — 실제 변경 아님
            }
            klog.Infof("UPDATE pod=%s/%s phase=%s", newPod.Namespace, newPod.Name, newPod.Status.Phase)
        },
        DeleteFunc: func(obj interface{}) {
            pod, ok := obj.(*corev1.Pod)
            if !ok {
                // ★ watch가 끊긴 사이 삭제되면 최종 상태를 모른 채 tombstone으로 온다
                tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
                if !ok {
                    klog.Error("예상치 못한 타입")
                    return
                }
                pod, ok = tombstone.Obj.(*corev1.Pod)
                if !ok {
                    return
                }
            }
            klog.Infof("DELETE pod=%s/%s", pod.Namespace, pod.Name)
        },
    })

    factory.Start(stopCh)
    factory.WaitForCacheSync(stopCh) // ★ 초기 List가 끝날 때까지 대기
    _ = deployInformer
}
```

> **`DeletedFinalStateUnknown`을 빠뜨리면 프로덕션에서 패닉이 난다.** 컨트롤러가 잠시 멈췄다 재시작할 때 watch가 relist로 전환되는데, 이 사이에 삭제된 오브젝트는 "최종 상태"를 알 수 없어 tombstone으로 감싸져 전달된다. 타입 단언(`obj.(*corev1.Pod)`)만 믿으면 바로 이 지점에서 패닉이 난다.

> **`WaitForCacheSync`를 건너뛰지 마라.** 캐시가 아직 채워지지 않은 상태에서 Lister로 조회하면 "존재하지 않는다"는 잘못된 결과를 얻고, 이를 근거로 잘못된 생성/삭제를 할 수 있다.

### Resync의 의미

`NewSharedInformerFactory(clientset, 30*time.Second)`의 두 번째 인자는 **API 서버를 다시 호출하는 주기가 아니다.** 로컬 캐시에 있는 모든 오브젝트에 대해 `UpdateFunc`를 다시 호출하는 주기다.

```
resync 발생 시:
  API 서버 호출 없음
  캐시의 모든 오브젝트 → UpdateFunc(old, new) 재호출
  (old.ResourceVersion == new.ResourceVersion — 실제 변경 아님을 여기서 구분)
```

**5장에서 다룬 "이벤트 유실에 대한 안전망"이 바로 이것이다.** 컨트롤러가 웹훅 실패나 일시적 버그로 이벤트를 놓쳐도, 다음 resync 때 전체를 다시 훑으며 놓친 것을 바로잡을 기회를 얻는다. 0으로 설정하면 resync를 하지 않는다. 개발 중에는 짧게(수십 초), 운영에서는 컨트롤러의 특성에 맞게(수 분~수 시간) 설정한다.

### Lister — 캐시에서 읽기

```go
podLister := podInformer.Lister()

pod, err := podLister.Pods("default").Get("web-0")
if errors.IsNotFound(err) {
    // 없음
}

selector := labels.SelectorFromSet(labels.Set{"app": "web"})
pods, err := podLister.Pods("default").List(selector)

allPods, err := podLister.List(labels.Everything()) // 전체 네임스페이스
```

**API 서버를 호출하지 않는다.** 메모리 조회이므로 거의 즉시 반환된다.

> **Lister가 반환한 오브젝트를 직접 수정하지 마라.** 캐시 내부의 포인터를 그대로 돌려주기 때문에, 수정하면 **다른 컨트롤러가 보는 캐시까지 오염된다.**
> ```go
> pod, _ := podLister.Pods("default").Get("web-0")
> pod.Labels["x"] = "y"        // ❌ 캐시 오염
>
> podCopy := pod.DeepCopy()    // ✅
> podCopy.Labels["x"] = "y"
> clientset.CoreV1().Pods("default").Update(ctx, podCopy, metav1.UpdateOptions{})
> ```

### 커스텀 인덱스

라벨/이름이 아닌 다른 기준으로 자주 조회한다면 인덱스를 추가해 O(1) 조회를 얻는다.

```go
const nodeNameIndex = "byNodeName"

podInformer.Informer().AddIndexers(cache.Indexers{
    nodeNameIndex: func(obj interface{}) ([]string, error) {
        pod, ok := obj.(*corev1.Pod)
        if !ok {
            return nil, nil
        }
        if pod.Spec.NodeName == "" {
            return nil, nil
        }
        return []string{pod.Spec.NodeName}, nil
    },
})

// 특정 노드에 배치된 Pod를 전체 스캔 없이 조회
objs, err := podInformer.Informer().GetIndexer().ByIndex(nodeNameIndex, "worker-1")
```

**Indexer는 5장에서 본 Store의 확장이다.** 기본은 namespace/name 키로만 조회하지만, 커스텀 인덱스 함수를 등록하면 임의의 필드로 O(1) 조회가 가능해진다.

### 네임스페이스/라벨 필터링

전체 클러스터가 아니라 특정 범위만 watch하면 메모리를 아낀다.

```go
factory := informers.NewSharedInformerFactoryWithOptions(
    clientset,
    30*time.Second,
    informers.WithNamespace("production"),
    informers.WithTweakListOptions(func(opts *metav1.ListOptions) {
        opts.LabelSelector = "managed-by=my-operator"
    }),
)
```

## 8.3 Workqueue 사용 패턴

5장에서 워크큐가 "키만 넣고, 중복 제거하고, 실패는 레이트 리밋으로 재시도한다"고 배웠다. 이제 그것을 조립한다.

```
이벤트 핸들러                워크큐                    워커 고루틴
────────────           ──────────────           ────────────────────
AddFunc/UpdateFunc  →  queue.Add(key)      →    key := queue.Get()
                       (같은 키 중복 제거)          obj := lister.Get(key)  ← 캐시 읽기
                                                  err := reconcile(obj)
                                                  if err != nil:
                                                    queue.AddRateLimited(key)
                                                  else:
                                                    queue.Forget(key)
                                                  queue.Done(key)
```

```go
package main

import (
    "context"
    "fmt"
    "time"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/apimachinery/pkg/api/errors"
    "k8s.io/apimachinery/pkg/util/runtime"
    "k8s.io/apimachinery/pkg/util/wait"
    listersv1 "k8s.io/client-go/listers/core/v1"
    "k8s.io/client-go/tools/cache"
    "k8s.io/client-go/util/workqueue"
    "k8s.io/klog/v2"
)

type PodWatcher struct {
    lister listersv1.PodLister
    synced cache.InformerSynced
    queue  workqueue.TypedRateLimitingInterface[string]
}

func NewPodWatcher(informer cache.SharedIndexInformer, lister listersv1.PodLister) *PodWatcher {
    w := &PodWatcher{
        lister: lister,
        synced: informer.HasSynced,
        queue: workqueue.NewTypedRateLimitingQueue[string](
            workqueue.DefaultTypedControllerRateLimiter[string](),
        ),
    }

    informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc:    w.enqueue,
        UpdateFunc: func(_, newObj interface{}) { w.enqueue(newObj) },
        DeleteFunc: w.enqueue,
    })
    return w
}

// ★ 오브젝트가 아니라 "namespace/name" 키만 넣는다
func (w *PodWatcher) enqueue(obj interface{}) {
    key, err := cache.MetaNamespaceKeyFunc(obj)
    if err != nil {
        runtime.HandleError(err)
        return
    }
    w.queue.Add(key)
}

func (w *PodWatcher) Run(ctx context.Context, workers int) error {
    defer w.queue.ShutDown()

    if !cache.WaitForCacheSync(ctx.Done(), w.synced) {
        return fmt.Errorf("캐시 동기화 실패")
    }

    for i := 0; i < workers; i++ {
        go wait.UntilWithContext(ctx, w.runWorker, time.Second)
    }
    <-ctx.Done()
    return nil
}

func (w *PodWatcher) runWorker(ctx context.Context) {
    for w.processNextItem(ctx) {
    }
}

func (w *PodWatcher) processNextItem(ctx context.Context) bool {
    key, shutdown := w.queue.Get()
    if shutdown {
        return false
    }
    defer w.queue.Done(key)

    err := w.reconcile(ctx, key)
    if err == nil {
        w.queue.Forget(key) // ★ 성공 시 백오프 카운터 초기화
        return true
    }

    if w.queue.NumRequeues(key) < 5 {
        klog.Errorf("reconcile %s 실패(재시도 %d): %v", key, w.queue.NumRequeues(key), err)
        w.queue.AddRateLimited(key) // ★ 지수 백오프로 재시도
        return true
    }

    klog.Errorf("%s 재시도 한도 초과, 드롭: %v", key, err)
    w.queue.Forget(key)
    runtime.HandleError(err)
    return true
}

func (w *PodWatcher) reconcile(ctx context.Context, key string) error {
    ns, name, err := cache.SplitMetaNamespaceKey(key)
    if err != nil {
        return err
    }

    pod, err := w.lister.Pods(ns).Get(name)
    if errors.IsNotFound(err) {
        klog.V(4).Infof("pod %s 더 이상 존재하지 않음", key)
        return nil // 삭제됨 — 처리할 것 없음. 멱등성의 핵심.
    }
    if err != nil {
        return err
    }

    klog.Infof("조정: %s/%s phase=%s", pod.Namespace, pod.Name, pod.Status.Phase)
    return nil
}
```

**주목할 점**

- `queue.Add(key)`는 **키가 이미 큐에 있으면 아무것도 하지 않는다.** 1초에 100번 업데이트가 와도 조정은 한 번만 실행된다(디바운싱 효과).
- `queue.Done(key)`는 반드시 `defer`로 호출한다. 그래야 같은 키가 처리 중일 때 다시 들어와도 워크큐가 "처리 중" 표시를 정확히 관리한다.
- **성공하면 반드시 `Forget`을 호출한다.** 안 하면 다음 실패 때 이전 실패 횟수가 누적되어 불필요하게 긴 백오프가 걸린다.

```go
// 기본 레이트 리미터: 5ms에서 시작해 최대 1000초까지 지수적으로 증가
workqueue.DefaultTypedControllerRateLimiter[string]()
```

## 8.4 Scheme, Codec, RESTMapper

### Scheme — GVK와 Go 타입의 등록부

**`runtime.Scheme`은 "이 Go 타입은 이 GVK에 대응한다"는 매핑을 유지하는 레지스트리다.** 내장 타입은 client-go가 미리 등록해둔다.

```go
import (
    corev1 "k8s.io/api/core/v1"
    "k8s.io/client-go/kubernetes/scheme"
)

gvks, _, err := scheme.Scheme.ObjectKinds(&corev1.Pod{})
// gvks[0] == schema.GroupVersionKind{Group: "", Version: "v1", Kind: "Pod"}
```

CRD 타입을 다룰 때는 직접 등록해야 한다(9장에서 code-generator로 생성된 코드가 이 등록을 자동화한다).

```go
var (
    GroupVersion   = schema.GroupVersion{Group: "example.com", Version: "v1"}
    SchemeBuilder  = runtime.NewSchemeBuilder(addKnownTypes)
    AddToScheme    = SchemeBuilder.AddToScheme
)

func addKnownTypes(s *runtime.Scheme) error {
    s.AddKnownTypes(GroupVersion, &WebApp{}, &WebAppList{})
    metav1.AddToGroupVersion(s, GroupVersion)
    return nil
}
```

**Scheme이 실제로 담당하는 일**

| 역할 | 설명 |
|---|---|
| GVK ↔ Go 타입 매핑 | `ObjectKinds()`, `New()` |
| 직렬화/역직렬화 | JSON, YAML, protobuf 코덱과 연동 |
| 버전 변환 | 2장에서 본 허브 모델(내부 버전 경유)과 같은 원리 |
| DeepCopy 지원 | `runtime.Object` 인터페이스의 `DeepCopyObject()` |

### Codec — 직렬화의 실제 구현

Scheme이 "무엇을 어떻게 변환할지"를 알고 있다면, `runtime.Codec`은 **실제 바이트 스트림으로/에서 인코딩·디코딩하는 작업**을 한다. `CodecFactory`가 Scheme으로부터 JSON/YAML/protobuf 코덱을 만들어낸다.

```go
codecFactory := serializer.NewCodecFactory(scheme.Scheme)
yamlSerializer := codecFactory.LegacyCodec(corev1.SchemeGroupVersion)

var buf bytes.Buffer
_ = yamlSerializer.Encode(pod, &buf)
```

**직접 이 계층을 다룰 일은 드물다.** typed ClientSet과 dynamic client가 내부적으로 처리해준다. 하지만 커스텀 어드미션 웹훅(11장)이나 어그리게이션 API 서버(12장)를 만들 때는 이 계층을 직접 마주치게 된다.

### RESTMapper — GVK ↔ GVR

**GVK(GroupVersionKind)는 Go 타입 시스템 관점**이고 (`Kind: "Deployment"`, 단수·대문자), **GVR(GroupVersionResource)는 REST 엔드포인트 관점**이다 (`Resource: "deployments"`, 복수·소문자). 대부분은 단순 변환("Deployment" → "deployments")이지만 예외가 있다(`Endpoints` → `endpoints`, 복수형이 이미 단수형처럼 생겼다). 이 매핑을 **RESTMapper**가 담당한다.

```go
import (
    "k8s.io/client-go/discovery"
    "k8s.io/client-go/restmapper"
)

dc, _ := discovery.NewDiscoveryClientForConfig(cfg)
groupResources, err := restmapper.GetAPIGroupResources(dc)
mapper := restmapper.NewDiscoveryRESTMapper(groupResources)

gvk := schema.GroupVersionKind{Group: "apps", Version: "v1", Kind: "Deployment"}
mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
// mapping.Resource == schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
// mapping.Scope     == meta.RESTScopeNamespace
```

**왜 중요한가**: dynamic client는 GVR로 리소스를 요청한다(`dyn.Resource(gvr)`). 하지만 사람이 자연스럽게 다루는 건 GVK("Deployment 타입")다. **범용 도구(백업, GitOps, admission 검사기)가 YAML의 `kind` 필드만 보고 올바른 REST 엔드포인트를 찾아가려면 RESTMapper가 필수다.** `kubectl apply`가 내부적으로 이 매핑을 수행한다.

## 8.5 fake 클라이언트를 이용한 테스트

컨트롤러 로직을 검증할 때마다 실제 클러스터를 띄우는 것은 느리고 낭비다. `k8s.io/client-go/kubernetes/fake`는 **API 서버 없이 메모리 안에서 동작하는 가짜 ClientSet**을 제공한다.

```go
package controller

import (
    "context"
    "testing"

    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/types"
    "k8s.io/client-go/kubernetes/fake"
)

func TestReconcile_AddsLabel(t *testing.T) {
    existingPod := &corev1.Pod{
        ObjectMeta: metav1.ObjectMeta{Name: "web-0", Namespace: "default"},
    }

    clientset := fake.NewSimpleClientset(existingPod) // ★ 초기 상태를 미리 주입

    ctx := context.Background()
    _, err := clientset.CoreV1().Pods("default").Patch(
        ctx, "web-0", types.MergePatchType,
        []byte(`{"metadata":{"labels":{"managed-by":"my-controller"}}}`),
        metav1.PatchOptions{},
    )
    if err != nil {
        t.Fatalf("patch 실패: %v", err)
    }

    got, err := clientset.CoreV1().Pods("default").Get(ctx, "web-0", metav1.GetOptions{})
    if err != nil {
        t.Fatalf("get 실패: %v", err)
    }
    if got.Labels["managed-by"] != "my-controller" {
        t.Errorf("라벨이 붙지 않음: %v", got.Labels)
    }
}
```

**Informer와 함께 테스트하기**

fake 클라이언트는 `SharedInformerFactory`와도 그대로 조합된다. 실제 조정 루프 코드(8.3절의 `PodWatcher`)를 fake 클라이언트로 감싸 이벤트 시뮬레이션까지 검증할 수 있다.

```go
func TestPodWatcher_Reconcile(t *testing.T) {
    clientset := fake.NewSimpleClientset()
    factory := informers.NewSharedInformerFactory(clientset, 0)
    podInformer := factory.Core().V1().Pods()

    watcher := NewPodWatcher(podInformer.Informer(), podInformer.Lister())

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    factory.Start(ctx.Done())

    go watcher.Run(ctx, 1)

    // 이벤트 주입 — fake 클라이언트에 Create하면 watch가 이를 전달한다
    _, err := clientset.CoreV1().Pods("default").Create(ctx, &corev1.Pod{
        ObjectMeta: metav1.ObjectMeta{Name: "test", Namespace: "default"},
    }, metav1.CreateOptions{})
    if err != nil {
        t.Fatal(err)
    }

    // 워크큐가 비동기이므로 짧은 대기나 폴링으로 결과를 확인한다
    time.Sleep(100 * time.Millisecond)
}
```

> **주의**: fake 클라이언트의 watch 구현은 실제 API 서버의 watch와 **타이밍 보장이 다르다.** 단위 테스트에서 비동기 처리 결과를 확인할 때는 `time.Sleep`보다 `wait.PollUntilContextTimeout` 같은 폴링 방식이 더 안정적이다. 완전한 통합 테스트가 필요하면 7장에서 언급한 `envtest`(10장에서 상세)로 넘어간다.

**`ObjectTracker`로 세밀한 제어**

`fake.NewSimpleClientset`이 만드는 내부 `testing.ObjectTracker`에 직접 접근하면 리액션(reactor)을 추가해 특정 호출에서 에러를 강제로 발생시키는 등 실패 시나리오도 테스트할 수 있다.

```go
clientset.PrependReactor("create", "pods", func(action ktesting.Action) (bool, runtime.Object, error) {
    return true, nil, fmt.Errorf("시뮬레이션된 API 서버 에러")
})
```

이는 8.3절의 `AddRateLimited`/`Forget` 재시도 로직이 실제로 에러 경로를 타는지 검증할 때 유용하다.

## 실습: Pod watch 로거 만들기

7장 실습 과제 5에서 준비한 kind 클러스터를 그대로 쓴다. 8.1~8.2절의 개념을 하나로 묶어 **특정 네임스페이스의 Pod 추가/수정/삭제를 로그로 남기는 최소 프로그램**을 작성한다.

```bash
mkdir -p ~/k8s-guide/pod-watcher && cd ~/k8s-guide/pod-watcher
go mod init example.com/pod-watcher
go get k8s.io/client-go@v0.34.0 k8s.io/api@v0.34.0 k8s.io/apimachinery@v0.34.0
```

```go
// main.go
package main

import (
    "context"
    "flag"
    "os"
    "os/signal"
    "path/filepath"
    "syscall"
    "time"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/client-go/informers"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
    "k8s.io/client-go/tools/cache"
    "k8s.io/client-go/tools/clientcmd"
    "k8s.io/client-go/util/homedir"
    "k8s.io/klog/v2"
)

func main() {
    klog.InitFlags(nil)

    var kubeconfig, namespace string
    if home := homedir.HomeDir(); home != "" {
        kubeconfig = filepath.Join(home, ".kube", "config")
    }
    flag.StringVar(&kubeconfig, "kubeconfig", kubeconfig, "kubeconfig 경로")
    flag.StringVar(&namespace, "namespace", "default", "감시할 네임스페이스")
    flag.Parse()

    cfg, err := rest.InClusterConfig()
    if err != nil {
        cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
        if err != nil {
            klog.Fatal(err)
        }
    }
    cfg.QPS, cfg.Burst = 20, 40

    clientset, err := kubernetes.NewForConfig(cfg)
    if err != nil {
        klog.Fatal(err)
    }

    factory := informers.NewSharedInformerFactoryWithOptions(
        clientset, 30*time.Second, informers.WithNamespace(namespace),
    )
    podInformer := factory.Core().V1().Pods()

    podInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            klog.Infof("[ADD]    %s/%s phase=%s node=%s",
                pod.Namespace, pod.Name, pod.Status.Phase, pod.Spec.NodeName)
        },
        UpdateFunc: func(oldObj, newObj interface{}) {
            oldPod, newPod := oldObj.(*corev1.Pod), newObj.(*corev1.Pod)
            if oldPod.ResourceVersion == newPod.ResourceVersion {
                return
            }
            klog.Infof("[UPDATE] %s/%s phase=%s->%s",
                newPod.Namespace, newPod.Name, oldPod.Status.Phase, newPod.Status.Phase)
        },
        DeleteFunc: func(obj interface{}) {
            pod, ok := obj.(*corev1.Pod)
            if !ok {
                ts, ok := obj.(cache.DeletedFinalStateUnknown)
                if !ok {
                    return
                }
                pod, ok = ts.Obj.(*corev1.Pod)
                if !ok {
                    return
                }
            }
            klog.Infof("[DELETE] %s/%s", pod.Namespace, pod.Name)
        },
    })

    ctx, cancel := context.WithCancel(context.Background())
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    go func() { <-sigCh; klog.Info("종료 신호 수신"); cancel() }()

    factory.Start(ctx.Done())
    klog.Info("캐시 동기화 대기 중...")
    if !cache.WaitForCacheSync(ctx.Done(), podInformer.Informer().HasSynced) {
        klog.Fatal("캐시 동기화 실패")
    }
    klog.Info("동기화 완료, 이벤트 대기 중")

    <-ctx.Done()
}
```

```bash
go mod tidy
go run . -namespace=default -v=2
```

다른 터미널에서:

```bash
kubectl run watch-test --image=nginx:alpine
kubectl label pod watch-test env=test --overwrite
kubectl delete pod watch-test
```

**첫 실행 시 `[ADD]` 로그가 기존 Pod 전부에 대해 쏟아지는 것**을 볼 수 있다. 이것이 Informer의 초기 List 단계다. 이후 `kubectl run`/`label`/`delete`에 반응해 `[ADD]`/`[UPDATE]`/`[DELETE]`가 실시간으로 찍힌다.

**QPS 스로틀링 관찰**: `-namespace=""`(전체 네임스페이스, 코드에서는 `WithNamespace` 옵션을 제거해야 함)로 Pod가 매우 많은 클러스터에 연결하면 다음과 같은 로그가 보일 수 있다.

```
Waited for 1.2s due to client-side throttling, request: GET:...
```

`cfg.QPS`/`cfg.Burst` 기본값(각각 5, 10)이 낮기 때문이다. 실습 코드는 20/40으로 이미 높여뒀다.

---

## 실습 과제

**과제 1 — dynamic client로 CRD 조회**
클러스터에 아무 CRD든(예: 9장 실습에서 만들 `WebApp`, 없다면 임시로 `kubectl create -f`로 간단한 CRD를 하나 설치) dynamic client로 조회하고 `unstructured.NestedString`으로 특정 필드를 출력하는 프로그램을 작성한다.

**과제 2 — RESTMapper 직접 사용**
discovery client와 RESTMapper를 조합해, 사용자가 문자열로 입력한 `kind`(예: `"Pod"`, `"Deployment"`)를 GVR로 변환하고 그 GVR로 dynamic client가 실제 목록을 가져오는 범용 조회 도구를 작성한다.

**과제 3 — DeletedFinalStateUnknown 재현**
실습 코드의 `DeleteFunc`에서 tombstone 처리를 잠시 제거하고, 프로그램을 정지한 상태에서 Pod를 삭제한 뒤 재시작해 타입 단언 패닉이 발생하는지 확인한다. 그다음 원래 코드로 복원한다.

**과제 4 — fake 클라이언트로 실패 시나리오 테스트**
8.5절의 `PrependReactor` 패턴을 이용해 `Patch` 호출이 항상 실패하도록 만들고, 8.3절의 워크큐 재시도 로직이 `NumRequeues`를 올바르게 증가시키다 5회 후 드롭하는 것을 단위 테스트로 검증한다.

**과제 5 — 커스텀 인덱스로 조회 최적화**
8.2절의 `nodeNameIndex` 예제를 실제로 동작하는 프로그램에 넣고, 특정 노드에 배치된 Pod 수를 `ByIndex` 호출과 `List` + 필터링 두 가지 방식으로 각각 측정해 Pod 수가 많을 때 성능 차이를 비교한다.

---

## 요약

- Go 생태계는 **`k8s.io/api`**(타입 정의), **`k8s.io/apimachinery`**(타입 시스템 기반), **`k8s.io/client-go`**(클라이언트)로 나뉘고 세 버전을 반드시 일치시켜야 한다.
- **typed ClientSet**은 컴파일 시점 타입 안전성을, **dynamic client**는 CRD 같은 미지의 리소스를 `unstructured.Unstructured`로 다루는 범용성을, **discovery client**는 런타임 API 탐색을 제공한다.
- **SharedInformerFactory**는 watch 연결과 로컬 캐시를 여러 컨트롤러가 공유하게 한다. **`WaitForCacheSync`를 반드시 호출**하고, **`DeletedFinalStateUnknown`을 처리**하며, **Lister가 반환한 오브젝트는 DeepCopy 후 수정**한다.
- **resync는 API 재호출이 아니라** 캐시 오브젝트에 대한 `UpdateFunc` 재호출이다. 5장의 레벨 트리거 원칙에 따른 이벤트 유실 안전망이다.
- **워크큐에는 키만 넣는다.** 중복이 자동 제거되고, 실패는 `AddRateLimited`로 지수 백오프, 성공은 `Forget`으로 초기화한다.
- **`runtime.Scheme`**이 GVK↔Go 타입을 잇고, **`RESTMapper`**가 GVK↔GVR을 잇는다. dynamic client와 범용 도구를 만들 때 이 두 계층을 직접 다루게 된다.
- **`fake` 클라이언트**로 API 서버 없이 컨트롤러 로직을 단위 테스트할 수 있다. 완전한 통합 검증에는 `envtest`(10장)가 필요하다.

**다음 장에서는** 이 클라이언트들이 다룰 **나만의 리소스 타입**을 정의한다. CRD의 OpenAPI 스키마 검증, 서브리소스, 버저닝과 컨버전 웹훅까지 다룬다.
