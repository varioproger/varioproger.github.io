---
title: "12장. 스케줄러 플러그인과 커스텀 API 서버"
---

# 12장. 스케줄러 플러그인과 커스텀 API 서버

> **학습목표**
> - 스케줄러 프레임워크의 `FilterPlugin`/`ScorePlugin` 인터페이스를 구현할 수 있다.
> - `KubeSchedulerConfiguration`의 `profiles`로 플러그인을 활성화하고 배치할 수 있다.
> - 어그리게이션 API 서버의 구조와 CRD로 부족한 상황을 구분할 수 있다.
> - `custom.metrics.k8s.io` 같은 실제 사례를 통해 어그리게이션 API가 HPA와 연결되는 방식을 이해한다.
> - `kubectl get apiservices`로 클러스터의 API 확장 지점을 스스로 진단할 수 있다.

---

## 들어가며

2부의 마지막 장이다. 10장에서 리소스 조정을, 11장에서 리소스 검증을 확장했다. 이 장은 두 가지 남은 확장 지점을 다룬다. **어떤 노드에 Pod를 배치할지**(스케줄러)와 **API 서버 자체가 제공하는 API의 형태**(어그리게이션)다.

4장에서 kube-scheduler의 내부 구조와 스케줄링 프레임워크의 확장점(`QueueSort`, `Filter`, `Score`, `Bind` 등)을 개념적으로 살펴봤다. 이 장에서는 그 확장점에 실제로 Go 코드를 꽂아 **아웃오브트리(out-of-tree) 플러그인**을 만든다.

또한 7장에서 CRD로는 안 되는 좁은 경우들이 있다고 언급했다. 이 장 후반부에서 그 경우들 — etcd에 저장하고 싶지 않은 데이터, 외부 시스템이 진실의 원천인 경우 — 을 다루는 **어그리게이션 API 서버**를 만든다.

```
2부 전체 지도
┌─────────────────────────────────────────────────────┐
│ 7장  확장 지점 지도 — 전체 그림                            │
│ 8장  client-go — 저수준 컨트롤러                          │
│ 9장  CRD — 커스텀 리소스 스키마                             │
│ 10장 controller-runtime — CRD를 조정하는 오퍼레이터         │
│ 11장 어드미션 웹훅 — 리소스가 저장되기 "전"에 개입              │
│ 12장 스케줄러 플러그인 — 배치 결정에 개입 (이 장, 앞부분)       │
│      커스텀 API 서버 — API 서버 자체를 확장 (이 장, 뒷부분)     │
└─────────────────────────────────────────────────────┘
```

## 12.1 스케줄러 프레임워크 플러그인 작성

### 왜 아웃오브트리 플러그인인가

4장에서 본 것처럼 스케줄링은 **필터링(배치 불가능한 노드 제거) → 스코어링(남은 노드에 점수 부여) → 바인딩**의 단계를 거친다. 각 단계는 확장점이며, 인트리(in-tree) 플러그인들이 기본 동작을 채운다.

조직 고유의 배치 규칙 — "특정 라벨이 있는 노드를 선호한다", "GPU 종류에 따라 가중치를 다르게 준다", "특정 팀의 워크로드는 전용 노드 풀에만" — 은 `nodeAffinity`나 `taint/toleration`으로 표현되지 않을 만큼 복잡할 때가 있다. 이럴 때 **커스텀 스케줄러 플러그인**을 만든다.

> **참고 — DRA(Dynamic Resource Allocation)도 결국 같은 확장점이다**
>
> GPU 같은 특수 하드웨어를 스케줄링에 반영하는 문제는 7장에서 본 ⑤ 디바이스 플러그인만의 영역이 아니다. **DRA**(v1.34 GA)는 `ResourceClaim`/`DeviceClass` 같은 API로 "어떤 속성을 가진 디바이스가 필요한가"를 선언하면, 이를 실제 배치에 반영하는 로직이 스케줄링 프레임워크에 **내장 플러그인** 형태로 들어가 Filter/Score/Reserve 단계에 개입한다. 즉 DRA는 이 절에서 다루는 것과 같은 확장점을 커뮤니티가 이미 구조화된 built-in 플러그인으로 만들어 둔 사례다. 따라서 "GPU를 속성 기반으로 골라 배치"하는 요구라면, 처음부터 아웃오브트리 플러그인을 직접 짜기보다 DRA의 `ResourceClaim`/`DeviceClass`로 표현되는지부터 확인하는 것이 우선이다. 아웃오브트리 플러그인은 DRA로도 표현할 수 없는 조직 고유의 배치 정책(랙 분산, 팀별 우선순위 등)에 남겨둔다.

### FilterPlugin과 ScorePlugin 인터페이스

```go
// framework.FilterPlugin — 이 노드가 후보에서 제외되어야 하는가
type FilterPlugin interface {
    Plugin
    Filter(ctx context.Context, state *framework.CycleState,
        pod *v1.Pod, nodeInfo *framework.NodeInfo) *framework.Status
}

// framework.ScorePlugin — 남은 노드에 점수(0~100)를 매긴다
type ScorePlugin interface {
    Plugin
    Score(ctx context.Context, state *framework.CycleState,
        pod *v1.Pod, nodeName string) (int64, *framework.Status)
    ScoreExtensions() ScoreExtensions
}

type Plugin interface {
    Name() string
}
```

**`Filter`는 이진 판단이다.** `Success`를 반환하면 이 노드는 후보로 남고, `Unschedulable`을 반환하면 이 Pod는 이 노드에 절대 배치될 수 없다.

**`Score`는 상대적 선호도다.** 필터를 통과한 노드들 사이에서 어느 쪽이 더 나은지 0~100 사이의 점수로 표현한다. 여러 `ScorePlugin`의 점수가 가중합되어 최종 노드가 정해진다.

### 예시 — 특정 라벨이 있는 노드를 선호하는 Score 플러그인

```go
// pkg/plugins/nodelabelpreference/node_label_preference.go
package nodelabelpreference

import (
    "context"

    v1 "k8s.io/api/core/v1"
    "k8s.io/apimachinery/pkg/runtime"
    "k8s.io/kubernetes/pkg/scheduler/framework"
)

const Name = "NodeLabelPreference"

type Args struct {
    metav1.TypeMeta `json:",inline"`
    // 선호할 라벨 키/값
    PreferredLabel string `json:"preferredLabel"`
    PreferredValue string `json:"preferredValue"`
}

type NodeLabelPreference struct {
    handle framework.Handle
    args   Args
}

var _ framework.ScorePlugin = &NodeLabelPreference{}

func New(ctx context.Context, obj runtime.Object, h framework.Handle) (framework.Plugin, error) {
    args, ok := obj.(*Args)
    if !ok {
        return nil, fmt.Errorf("want Args, got %T", obj)
    }
    return &NodeLabelPreference{handle: h, args: *args}, nil
}

func (pl *NodeLabelPreference) Name() string { return Name }

func (pl *NodeLabelPreference) Score(
    ctx context.Context, state *framework.CycleState,
    pod *v1.Pod, nodeName string) (int64, *framework.Status) {

    nodeInfo, err := pl.handle.SnapshotSharedLister().NodeInfos().Get(nodeName)
    if err != nil {
        return 0, framework.NewStatus(framework.Error, err.Error())
    }

    if v, ok := nodeInfo.Node().Labels[pl.args.PreferredLabel]; ok && v == pl.args.PreferredValue {
        return 100, nil   // 선호 조건에 맞는 노드는 만점
    }
    return 0, nil
}

func (pl *NodeLabelPreference) ScoreExtensions() framework.ScoreExtensions {
    return nil   // NormalizeScore가 필요 없으면 nil
}
```

**Filter 플러그인 예시** — 특정 라벨이 없는 노드를 아예 후보에서 제외하고 싶다면.

```go
func (pl *NodeLabelPreference) Filter(
    ctx context.Context, state *framework.CycleState,
    pod *v1.Pod, nodeInfo *framework.NodeInfo) *framework.Status {

    if _, ok := nodeInfo.Node().Labels[pl.args.PreferredLabel]; !ok {
        // 이 Pod가 특정 어노테이션으로 "전용 노드 필수"를 요청했다면만 걸러낸다
        if pod.Annotations["scheduling.example.com/require-preferred-node"] == "true" {
            return framework.NewStatus(framework.Unschedulable,
                "선호 라벨이 없는 노드입니다")
        }
    }
    return framework.NewStatus(framework.Success)
}
```

### 아웃오브트리 스케줄러 바이너리 빌드

**`scheduler-plugins`** 저장소(kubernetes-sigs)가 제공하는 프레임워크로, 여러 플러그인을 하나의 `kube-scheduler` 바이너리에 컴파일해 넣는다.

```go
// cmd/scheduler/main.go
package main

import (
    "os"

    "k8s.io/component-base/cli"
    _ "k8s.io/component-base/logs/json/register"
    "k8s.io/kubernetes/cmd/kube-scheduler/app"

    "example.com/scheduler-plugins/pkg/plugins/nodelabelpreference"
)

func main() {
    command := app.NewSchedulerCommand(
        app.WithPlugin(nodelabelpreference.Name, nodelabelpreference.New),
    )
    code := cli.Run(command)
    os.Exit(code)
}
```

```bash
go build -o kube-scheduler-custom ./cmd/scheduler
docker build -t registry.example.com/kube-scheduler-custom:v1 .
```

**핵심은 이것이 별도의 바이너리라는 점이다.** 표준 `kube-scheduler` 이미지에 코드를 추가할 수 없으므로, 원하는 플러그인을 링크한 커스텀 바이너리를 새로 빌드해야 한다.

## 12.2 스케줄러 설정으로 플러그인 활성화

### KubeSchedulerConfiguration의 profiles

빌드한 플러그인은 자동으로 활성화되지 않는다. **`KubeSchedulerConfiguration`의 `profiles`** 에서 확장점별로 활성화/비활성화를 명시해야 한다.

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
leaderElection:
  leaderElect: true
clientConnection:
  kubeconfig: /etc/kubernetes/scheduler.conf
profiles:
  - schedulerName: default-scheduler
    plugins:
      score:
        enabled:
          - name: NodeLabelPreference
            weight: 3
        disabled:
          - name: NodeResourcesBalancedAllocation   # 기본 플러그인을 끌 수도 있다
      filter:
        enabled:
          - name: NodeLabelPreference
    pluginConfig:
      - name: NodeLabelPreference
        args:
          apiVersion: kubescheduler.config.k8s.io/v1
          kind: NodeLabelPreferenceArgs
          preferredLabel: hardware-tier
          preferredValue: gpu-a100
```

`profiles`는 **배열**이라는 점이 중요하다. 기본 프로필(`default-scheduler`) 외에 **여러 스케줄러 프로필**을 동시에 정의할 수 있다.

### 실행 모델 두 가지

**① 별도 스케줄러로 실행** — 기존 `default-scheduler`는 그대로 두고, 커스텀 스케줄러를 **다른 이름**으로 추가 배포한다. Pod가 `spec.schedulerName`으로 선택한다.

```yaml
profiles:
  - schedulerName: default-scheduler
    # 기본 플러그인 그대로
  - schedulerName: gpu-scheduler
    plugins:
      score:
        enabled:
          - name: NodeLabelPreference
            weight: 5
```

```yaml
apiVersion: v1
kind: Pod
metadata: { name: gpu-workload }
spec:
  schedulerName: gpu-scheduler    # ★ 이 스케줄러가 이 Pod를 처리한다
  containers: [...]
```

```bash
kubectl -n kube-system get deploy gpu-scheduler
```

**이 방식이 훨씬 안전하다.** 커스텀 스케줄러에 버그가 있어도 `default-scheduler`로 스케줄되는 나머지 워크로드는 영향받지 않는다.

**② 기본 스케줄러를 교체** — 플러그인을 컴파일해 넣은 바이너리로 `kube-scheduler` static Pod 자체를 대체한다. 클러스터의 **모든** Pod가 이 스케줄러를 거치므로, 버그가 클러스터 전체의 스케줄링을 멈출 수 있다.

```bash
docker exec k8s-guide-control-plane \
  sed -i 's#image: registry.k8s.io/kube-scheduler.*#image: registry.example.com/kube-scheduler-custom:v1#' \
  /etc/kubernetes/manifests/kube-scheduler.yaml
```

> **⚠️ 운영 권장**: 검증되지 않은 플러그인은 반드시 **별도 스케줄러 이름**으로 먼저 도입한다. 일부 워크로드에만 `schedulerName`을 지정해 영향 범위를 좁히고, 충분히 검증된 뒤에만 기본 스케줄러 교체를 고려한다. 이것은 11장에서 어드미션 웹훅을 `failurePolicy: Ignore`로 먼저 도입하라고 한 것과 같은 원칙이다 — **새로운 확장점은 점진적으로 도입하고 사고 반경을 좁힌다.**

### 동작 확인

```bash
kubectl get pods -n kube-system -l component=gpu-scheduler
kubectl logs -n kube-system -l component=gpu-scheduler | grep -i "score\|filter"

kubectl get events --field-selector reason=Scheduled -o wide
```

```bash
kubectl describe pod gpu-workload | grep -A3 Events
# Scheduled  gpu-scheduler  Successfully assigned default/gpu-workload to node-a100-1
```

`Events`의 스케줄러 이름 필드로 어떤 스케줄러가 이 결정을 내렸는지 확인할 수 있다.

## 12.3 어그리게이션 API 서버 구조

### 언제 CRD로 부족한가

CRD(9장)는 **etcd에 저장되는 구조화된 데이터**를 표현하는 데 최적화되어 있다. 다음과 같은 경우에는 CRD로 표현하기 어렵거나 부적절하다.

| 요구 | 이유 |
|---|---|
| **etcd에 저장하고 싶지 않다** | 메트릭처럼 휘발성이고 고빈도로 갱신되는 데이터를 굳이 영속화할 필요가 없다 |
| **외부 시스템이 진실의 원천** | 이미 존재하는 DB, 모니터링 시스템의 데이터를 쿠버네티스 API 형태로 노출만 하고 싶다 |
| **계산된(virtual) 리소스** | 저장되는 게 아니라 요청 시점에 계산해서 응답하는 리소스 |
| **커스텀 스토리지 백엔드나 프로토콜** | protobuf 전용, 스트리밍 응답 등 CRD의 REST 규약을 벗어나는 동작 |

**대부분의 경우 CRD로 충분하다.** 어그리게이션 API 서버는 이런 좁은 요구가 명확할 때만 고려하는 무거운 선택지다.

### 구조

```
                    클라이언트 (kubectl 등)
                          │
                          ▼
            ┌──────────────────────────┐
            │      kube-apiserver        │
            │   ┌────────────────────┐   │
            │   │   어그리게이터        │   │  APIService로 등록된 GroupVersion의
            │   └─────────┬──────────┘   │  요청을 해당 Service로 프록시
            └─────────────┼──────────────┘
                          │ mTLS + X-Remote-User 등 사용자 정보 헤더
                          ▼
            ┌──────────────────────────┐
            │     커스텀 API 서버         │  일반 Pod로 실행
            │  · 자체 인증/인가 (위임 가능)  │
            │  · 자체 스토리지 (메모리/외부DB)│
            └──────────────────────────┘
```

**`APIService`** 오브젝트가 어그리게이터에게 "이 GroupVersion은 이 Service로 보내라"고 알려준다.

```yaml
apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  name: v1alpha1.metrics.example.com
spec:
  group: metrics.example.com
  version: v1alpha1
  groupPriorityMinimum: 1000
  versionPriority: 15
  service:
    namespace: metrics-system
    name: custom-metrics-apiserver
    port: 443
  caBundle: <base64>
  # ⚠️ 개발/테스트에서만: TLS 검증을 건너뛴다
  # insecureSkipTLSVerify: true
```

> **⚠️ `insecureSkipTLSVerify`는 프로덕션에서 쓰지 않는다**
> 이 옵션을 켜면 어그리게이터가 백엔드 Service의 인증서를 검증하지 않는다. 클러스터 내부 네트워크가 침해당하면 누구든 그 이름의 Service를 만들어 API 응답을 가로챌 수 있다. **`caBundle`을 정확히 설정하는 것이 정석이다.**

```bash
kubectl get apiservices
kubectl api-resources --api-group=metrics.example.com
```

### 인증·인가 위임

**커스텀 API 서버가 직접 사용자를 인증할 필요는 없다.** kube-apiserver에 위임할 수 있다.

```
① 클라이언트 → kube-apiserver (일반적인 인증 절차)
② kube-apiserver → 커스텀 API 서버로 프록시
   요청 헤더에 사용자 정보를 실어 보낸다:
     X-Remote-User: alice
     X-Remote-Group: dev-team
③ 커스텀 API 서버는 이 헤더를 신뢰하되,
   실제 인가 여부는 SubjectAccessReview로 kube-apiserver에 재확인한다
   → "alice가 이 리소스에 이 동사를 쓸 수 있는가?"
```

**`front-proxy` 인증서**가 이 헤더를 신뢰할 수 있게 하는 장치다. front-proxy CA로 서명된 클라이언트 인증서로 접속한 요청만 이 헤더를 주입할 수 있으므로, 아무나 `X-Remote-User` 헤더를 위조해 다른 사용자를 사칭할 수 없다.

```bash
docker exec k8s-guide-control-plane grep -A2 requestheader \
  /etc/kubernetes/manifests/kube-apiserver.yaml
```

### 구현 스케치 — k8s.io/apiserver 라이브러리

```go
package main

import (
    genericapiserver "k8s.io/apiserver/pkg/server"
    genericoptions "k8s.io/apiserver/pkg/server/options"
    "k8s.io/apiserver/pkg/registry/rest"
)

type ServerOptions struct {
    RecommendedOptions *genericoptions.RecommendedOptions
}

func NewServerOptions() *ServerOptions {
    o := &ServerOptions{
        RecommendedOptions: genericoptions.NewRecommendedOptions(
            "/registry/metrics.example.com",
            Codecs.LegacyCodec(v1alpha1.SchemeGroupVersion),
        ),
    }
    // 인증/인가를 kube-apiserver에 위임
    o.RecommendedOptions.Authentication = genericoptions.NewDelegatingAuthenticationOptions()
    o.RecommendedOptions.Authorization = genericoptions.NewDelegatingAuthorizationOptions()
    // etcd에 저장하지 않으므로 기본 etcd 옵션은 비활성화
    o.RecommendedOptions.Etcd = nil
    return o
}

func (o *ServerOptions) Config() (*genericapiserver.RecommendedConfig, error) {
    serverConfig := genericapiserver.NewRecommendedConfig(Codecs)
    if err := o.RecommendedOptions.ApplyTo(serverConfig); err != nil {
        return nil, err
    }
    return serverConfig, nil
}
```

**REST 스토리지를 직접 구현한다.** CRD였다면 API 서버가 자동으로 만들어 줬을 부분을 손으로 채운다.

```go
type metricStorage struct {
    // 메모리 맵, 외부 DB, Prometheus 클라이언트 — 무엇이든 가능
    prometheusClient promv1.API
}

func (s *metricStorage) NewList() runtime.Object { return &v1alpha1.MetricValueList{} }

func (s *metricStorage) List(
    ctx context.Context, opts *metainternalversion.ListOptions) (runtime.Object, error) {

    // etcd가 아니라 Prometheus에 실시간 질의
    result, _, err := s.prometheusClient.Query(ctx, "http_requests_total", time.Now())
    if err != nil {
        return nil, err
    }
    return convertToMetricValueList(result), nil
}

func (s *metricStorage) Get(
    ctx context.Context, name string, opts *metav1.GetOptions) (runtime.Object, error) {
    // 단일 항목도 매 요청마다 계산하거나 외부에서 조회한다 — etcd 조회가 아니다
    ...
}
```

**참조 구현**: [sample-apiserver](https://github.com/kubernetes/sample-apiserver), 그리고 다음 절에서 다룰 **metrics-server**가 실전에서 검증된 사례다.

### 운영상 주의

**`APIService`가 `Available=False`가 되면 그 GroupVersion만 실패하는 게 아니다.** `kubectl get all`, `kubectl api-resources`처럼 여러 API 그룹을 순회하는 명령이 통째로 느려지거나 실패할 수 있다.

```bash
kubectl get apiservices | grep -v True
```

```
NAME                       SERVICE                              AVAILABLE
v1beta1.metrics.k8s.io     kube-system/metrics-server           False (FailedDiscoveryCheck)
```

**커스텀 API 서버의 가용성이 클러스터 전체의 사용성에 직결된다.** 리더 선출, 다중 replica, PDB 같은 10장의 오퍼레이터 운영 원칙이 여기서도 그대로 적용된다.

## 12.4 커스텀 메트릭 API 서버 예시

### custom.metrics.k8s.io와 external.metrics.k8s.io

가장 널리 쓰이는 어그리게이션 API 사례가 메트릭 계열이다. 세 가지 API 그룹이 있다.

| API 그룹 | 제공하는 것 | 대표 구현 |
|---|---|---|
| `metrics.k8s.io` | 노드/Pod의 CPU·메모리 사용량 | metrics-server |
| `custom.metrics.k8s.io` | 쿠버네티스 오브젝트에 결부된 임의 메트릭 (예: Pod당 큐 길이) | Prometheus Adapter |
| `external.metrics.k8s.io` | 쿠버네티스 오브젝트와 무관한 외부 메트릭 (예: 클라우드 큐의 메시지 수) | Prometheus Adapter, KEDA |

**Prometheus Adapter**가 이 구조를 잘 보여준다. 데이터의 진실의 원천은 **Prometheus**이지 etcd가 아니다.

```
         HPA
          │ "이 Deployment의 큐 길이 메트릭을 알려줘"
          ▼
   kube-apiserver (어그리게이터)
          │ /apis/custom.metrics.k8s.io/v1beta2/...
          ▼
   Prometheus Adapter (커스텀 API 서버)
          │ PromQL 변환 규칙 적용
          ▼
      Prometheus
          │ 저장된 시계열 데이터에서 즉시 계산
          ▼
   결과를 MetricValue로 변환해 반환
```

```yaml
# Prometheus Adapter의 규칙 설정 예시 — PromQL을 쿠버네티스 메트릭 API로 매핑
rules:
  - seriesQuery: 'queue_messages_ready{namespace!="",pod!=""}'
    resources:
      overrides:
        namespace: { resource: "namespace" }
        pod: { resource: "pod" }
    name:
      matches: "queue_messages_ready"
      as: "queue_length"
    metricsQuery: 'avg(queue_messages_ready{<<.LabelMatchers>>}) by (<<.GroupBy>>)'
```

### HPA와의 연결

4장·10장에서 다룬 HPA(HorizontalPodAutoscaler)는 CPU/메모리 외에 **임의의 메트릭**으로 스케일할 수 있는데, 그 값을 바로 이 어그리게이션 API에서 읽어온다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: queue-worker }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: queue-worker }
  minReplicas: 1
  maxReplicas: 20
  metrics:
    - type: Object
      object:
        metric: { name: queue_length }
        describedObject:
          apiVersion: v1
          kind: Service
          name: queue-service
        target: { type: Value, value: "30" }
    - type: External
      external:
        metric: { name: sqs_messages_visible, selector: { matchLabels: { queue: "orders" } } }
        target: { type: AverageValue, averageValue: "10" }
```

```
HPA 컨트롤러(kube-controller-manager 안)
    │ 주기적으로 조회
    ▼
/apis/custom.metrics.k8s.io/v1beta2/namespaces/default/services/queue-service/queue_length
    │
    ▼
어그리게이터 → Prometheus Adapter → Prometheus → 값 반환
    │
    ▼
HPA가 현재값과 target을 비교해 replicas 계산
```

```bash
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta2/namespaces/default/services/queue-service/queue_length" | jq
kubectl describe hpa queue-worker
```

**이 구조 전체가 "커스텀 API 서버가 왜 필요한가"에 대한 가장 좋은 답이다.** 큐 길이 메트릭은 초 단위로 바뀌는 휘발성 데이터이고, 진실의 원천은 Prometheus다. 이것을 CRD로 만들어 etcd에 매초 쓴다면 etcd에 불필요한 부하를 줄 뿐 아니라 데이터의 이중 관리 문제가 생긴다. **어그리게이션 API는 이 데이터를 등록·저장하지 않고, 요청이 올 때마다 계산해서 그 자리에서 응답한다.**

## 실습: Score 플러그인 스케치와 APIService 조사

**① Score 플러그인 스케치** — 12.1절의 `NodeLabelPreference`를 실제로 컴파일하지 않아도 되는 스켈레톤으로 정리한다. 목표는 특정 라벨(`hardware-tier=gpu-a100`)이 있는 노드에 가산점을 주는 것이다.

```go
// pkg/plugins/nodelabelpreference/node_label_preference.go
package nodelabelpreference

const Name = "NodeLabelPreference"

type NodeLabelPreference struct {
    handle framework.Handle
    args   Args
}

func (pl *NodeLabelPreference) Name() string { return Name }

func (pl *NodeLabelPreference) Score(
    ctx context.Context, state *framework.CycleState,
    pod *v1.Pod, nodeName string) (int64, *framework.Status) {

    nodeInfo, err := pl.handle.SnapshotSharedLister().NodeInfos().Get(nodeName)
    if err != nil {
        return 0, framework.NewStatus(framework.Error, err.Error())
    }
    if nodeInfo.Node().Labels["hardware-tier"] == "gpu-a100" {
        return 100, nil
    }
    return 0, nil
}

func (pl *NodeLabelPreference) ScoreExtensions() framework.ScoreExtensions { return nil }
```

**② KubeSchedulerConfiguration 프로필 작성** — 별도 스케줄러 이름(`gpu-scheduler`)으로 등록한다.

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
profiles:
  - schedulerName: gpu-scheduler
    plugins:
      score:
        enabled: [{ name: NodeLabelPreference, weight: 5 }]
    pluginConfig:
      - name: NodeLabelPreference
        args: { preferredLabel: hardware-tier, preferredValue: gpu-a100 }
```

이 설정 파일과 12.1절의 바이너리 빌드를 결합하면, GPU 노드에 `hardware-tier=gpu-a100` 라벨을 붙이고 `schedulerName: gpu-scheduler`를 지정한 Pod가 그 노드로 우선 배치되는 실제 오퍼레이터를 만들 수 있다. (전체 빌드·배포는 `scheduler-plugins` 저장소의 예제를 참고한다.)

**③ 클러스터의 APIService 조사** — 실습 kind 클러스터에서 실제로 어떤 API가 로컬(내장)이고 어떤 것이 실제 Service로 백엔드되어 있는지 확인한다.

```bash
kubectl get apiservices
```

```
NAME                                   SERVICE                        AVAILABLE
v1.                                    Local                          True
v1.apps                                Local                          True
v1.authentication.k8s.io               Local                          True
v1.metrics.k8s.io                      kube-system/metrics-server     True
v1beta1.metrics.k8s.io                 kube-system/metrics-server     True
```

(`metrics.k8s.io`는 v1.37에서 `v1`으로 GA 승격했다. 필드와 의미는 `v1beta1`과 동일하며, 기존 클라이언트 호환을 위해 `v1beta1`도 당분간 함께 서빙된다 — 이렇게 같은 API 그룹의 두 버전이 각각 별도의 `APIService`로 나타날 수 있다.)

```bash
# Local이 아닌 것만 추린다 — 진짜 어그리게이션 API
kubectl get apiservices -o json | \
  jq -r '.items[] | select(.spec.service != null) | "\(.metadata.name)\t\(.spec.service.namespace)/\(.spec.service.name)"'
```

```bash
# metrics-server가 실제로 무엇을 하는지 원본 요청으로 확인
kubectl get --raw /apis/metrics.k8s.io/v1/nodes | jq '.items[0]'
```

`SERVICE` 컬럼이 `Local`인 것은 kube-apiserver 프로세스 내부에 내장된 API(모든 핵심 리소스, CRD 포함)이고, 실제 네임스페이스/이름이 적힌 것만 12.3절에서 다룬 **진짜 어그리게이션 API**다.

## 실습 과제

**과제 1 — Filter 플러그인 추가**
`NodeLabelPreference`에 `Filter`를 추가해, Pod에 `scheduling.example.com/require-gpu: "true"` 어노테이션이 있으면 `hardware-tier=gpu-a100` 라벨이 없는 노드를 아예 후보에서 제외하도록 만든다. Score와 Filter를 함께 등록했을 때의 동작을 설명한다.

**과제 2 — 두 스케줄러 공존 확인**
`default-scheduler`와 `gpu-scheduler`를 함께 설정하고, `schedulerName`을 지정하지 않은 일반 Pod와 지정한 Pod가 각각 어떤 스케줄러의 로그에 나타나는지 `kubectl logs`로 비교한다.

**과제 3 — APIService 장애 재현**
`metrics-server`를 0으로 스케일한 뒤 `kubectl get apiservices`로 `Available=False`가 되는 것을 관찰하고, `kubectl top nodes`와 `kubectl get all -A`가 어떻게 영향받는지 확인한다.

**과제 4 — custom.metrics.k8s.io 원시 조회**
클러스터에 Prometheus Adapter나 유사한 어댑터가 있다면(없다면 개념만으로) `kubectl get --raw`로 `custom.metrics.k8s.io` 경로를 직접 호출해 HPA가 실제로 무엇을 조회하는지 관찰한다.

**과제 5 — CRD 대 어그리게이션 API 판단 연습**
다음 세 가지 요구 각각에 대해 CRD로 할지 어그리게이션 API로 할지 결정하고 근거를 서술한다. (a) 조직의 배포 승인 이력을 영구 기록, (b) 초당 갱신되는 실시간 노드 온도 센서 값, (c) 외부 SaaS의 요금제 정보를 읽기 전용으로 노출.

---

## 요약

- 스케줄링 프레임워크의 확장점(4장)에 실제 코드를 꽂으려면 **`framework.FilterPlugin`/`framework.ScorePlugin`** 인터페이스를 구현한 아웃오브트리 플러그인을 작성하고, 이를 **별도의 `kube-scheduler` 바이너리로 컴파일**해야 한다.
- `Filter`는 노드를 후보에서 제외하는 이진 판단이고, `Score`는 남은 노드 사이의 상대적 선호도를 0~100으로 매긴다.
- 활성화는 **`KubeSchedulerConfiguration`의 `profiles`** 로 한다. `plugins.score/filter`로 켜고 끄고, `pluginConfig`로 인자를 넘긴다.
- **별도의 `schedulerName`으로 도입하는 것이 안전하다.** 기본 스케줄러를 교체하면 버그가 클러스터 전체의 배치를 멈출 수 있다 — 웹훅을 `Ignore`로 먼저 도입하는 것과 같은 원칙이다.
- **어그리게이션 API 서버**는 `APIService`로 등록되어 kube-apiserver가 특정 GroupVersion 요청을 별도 Service로 프록시하는 구조다. **인증·인가는 kube-apiserver에 위임**할 수 있고, `front-proxy` 인증서가 사용자 정보 헤더의 위조를 막는다.
- CRD로 충분하지 않은 좁은 경우 — **etcd에 저장하고 싶지 않은 휘발성 데이터, 외부 시스템이 진실의 원천, 계산된 가상 리소스** — 에서만 커스텀 API 서버를 고려한다.
- **`custom.metrics.k8s.io`/`external.metrics.k8s.io`**(Prometheus Adapter 등)는 어그리게이션 API의 대표 사례다. 메트릭 값을 etcd에 저장하지 않고 요청 시점에 Prometheus에서 계산해 응답하며, 이 값을 HPA가 읽어 오토스케일링에 사용한다.
- **`APIService`가 `Available=False`가 되면 `kubectl get all` 같은 광범위한 명령까지 실패할 수 있다.** 커스텀 API 서버의 가용성은 클러스터 전체의 사용성과 직결되므로, 오퍼레이터와 동일한 수준의 운영 원칙(다중 replica, 헬스체크)을 적용해야 한다.

**2부를 마치며** — 확장 지점 지도(7장)에서 시작해 client-go(8장), CRD(9장), 오퍼레이터(10장), 어드미션(11장), 스케줄러와 API 서버(12장)까지 쿠버네티스를 확장하는 모든 공식 경로를 다뤘다. **3부에서는 네트워킹으로 초점을 옮겨**, CNI 스펙부터 Service, kube-proxy 데이터플레인, DNS, Ingress·Gateway API·서비스 메시, NetworkPolicy, 그리고 eBPF 데이터플레인까지 클러스터 네트워크의 내부를 낱낱이 파헤친다.
