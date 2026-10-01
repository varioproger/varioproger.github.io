---
title: "2장. kube-apiserver 내부 구조"
---

# 2장. kube-apiserver 내부 구조

> **학습목표**
> - HTTP 요청이 API 서버 안에서 거치는 필터 체인 전체를 핸들러 래핑 구조로 설명할 수 있다.
> - 외부 버전 → 내부 버전(허브) → 스토리지 버전으로 이어지는 변환 모델과 그 이유를 설명할 수 있다.
> - 내장 API, CRD 기반 API, 어그리게이션 API(APIService)의 차이와 각각의 처리 경로를 구분할 수 있다.
> - watch cache가 etcd watch를 다수 클라이언트에 어떻게 fan-out하는지, resourceVersion 시맨틱을 설명할 수 있다.
> - API Priority & Fairness가 요청을 어떻게 분류하고 큐잉하는지 이해하고 FlowSchema를 작성할 수 있다.
> - `/livez`·`/readyz`, 핵심 메트릭, `--v=9`를 이용해 API 서버 동작을 진단할 수 있다.

---

## 들어가며

1장에서 "모든 컴포넌트 간 통신은 API 서버를 거친다"고 했다. 이 문장이 사실이라면, API 서버는 클러스터 전체에서 가장 많은 요청을 처리하는 단일 지점이며, 그 내부 구조 하나하나가 클러스터의 확장성과 안정성을 좌우한다.

이 장은 이 책 "내부 아키텍처" 축의 기술적 닻이다. 다른 어떤 장보다 API 서버의 소스 레벨 메커니즘을 깊게 다룬다. 여기서 다지는 개념 — 버전 변환의 허브 모델, watch cache, API Priority & Fairness — 은 8장(client-go)과 9장(CRD)에서 그대로 다시 등장하므로, 이 장을 정확히 이해하고 넘어가는 것이 2부 전체의 전제 조건이다.

## 2.1 필터 체인 상세

### 핸들러 래핑이라는 관점

API 서버의 요청 처리 경로를 이해하는 가장 정확한 방법은, 이것을 Go의 `http.Handler`를 겹겹이 감싸는 **데코레이터 체인**으로 보는 것이다. 실제 구현(`k8s.io/apiserver/pkg/server/filters`, `k8s.io/apiserver/pkg/endpoints/filters`)도 이 형태를 그대로 따른다. 개념적으로 표현하면 다음과 같다.

```go
// 개념적 표현 — 실제 코드는 DefaultBuildHandlerChain() 등에 분산되어 있다
handler := finalRESTHandler                     // 실제 라우팅 대상 핸들러
handler = withAuthorization(handler)             // 가장 안쪽부터 감싼다
handler = withImpersonation(handler)
handler = withPriorityAndFairness(handler)
handler = withAudit(handler)
handler = withAuthentication(handler)
handler = withRequestTimeout(handler)
handler = withPanicRecovery(handler)             // 가장 바깥쪽
```

요청은 가장 바깥쪽 래퍼부터 안쪽으로 통과하고, 응답은 반대 순서로 빠져나간다. 이 구조의 장점은 각 필터가 **자신의 관심사만 처리하고 다음 핸들러를 호출하는 것으로 위임을 끝낸다**는 데 있다 — 1장에서 강조한 "좁은 책임 경계" 원칙이 API 서버 내부 구현에도 그대로 적용된 것이다.

```
HTTP 요청
    ▼
┌───────────────────────────────────────────────────┐
│ ① panic 복구                                        │
│    핸들러 체인 어디서든 panic이 나면 500으로 변환하고    │
│    프로세스 자체는 죽지 않게 한다                       │
└─────────────────────┬───────────────────────────────┘
                      ▼
┌───────────────────────────────────────────────────┐
│ ② 요청 타임아웃                                       │
│    핸들러별로 다른 타임아웃(기본 다수 요청 처리 34초,      │
│    watch류는 예외) — 무한정 붙잡는 요청을 방지           │
└─────────────────────┬───────────────────────────────┘
                      ▼
┌───────────────────────────────────────────────────┐
│ ③ 인증 (Authentication)                             │
│    클라이언트 인증서, ServiceAccount 토큰, OIDC 등      │
│    여러 Authenticator를 순서대로 시도(union)           │
│    성공 시 요청 컨텍스트에 user.Info 부착               │
└─────────────────────┬───────────────────────────────┘
                      ▼
┌───────────────────────────────────────────────────┐
│ ④ 감사(Audit) 시작                                   │
│    이 시점부터 요청의 audit ID가 발급되고               │
│    이후 단계의 결과가 감사 로그에 누적 기록된다            │
└─────────────────────┬───────────────────────────────┘
                      ▼
┌───────────────────────────────────────────────────┐
│ ⑤ Impersonation 처리                                │
│    --as, --as-group 등으로 다른 사용자를 가장하는       │
│    요청인지 확인하고, 가장 권한(impersonate 동사)을      │
│    검사한 뒤 이후 단계의 user.Info를 교체               │
└─────────────────────┬───────────────────────────────┘
                      ▼
┌───────────────────────────────────────────────────┐
│ ⑥ API Priority & Fairness (큐잉)                    │
│    요청을 FlowSchema로 분류하고                        │
│    PriorityLevelConfiguration 큐에 넣어 대기시킨다       │
│    (2.4절에서 상세)                                   │
└─────────────────────┬───────────────────────────────┘
                      ▼
┌───────────────────────────────────────────────────┐
│ ⑦ 인가 (Authorization)                              │
│    Node, RBAC, Webhook 등 Authorizer 체인             │
│    하나라도 Allow하면 통과(Deny는 즉시 거부 가능)        │
└─────────────────────┬───────────────────────────────┘
                      ▼
              [ 라우팅 → REST 핸들러 → 어드미션 → 스토리지 ]
```

### 왜 이 순서인가

순서 자체가 설계 결정이다. 몇 가지만 짚는다.

**인증이 인가보다 먼저다.** 누구인지 모르면 무엇을 허용할지 판단할 수 없다. 당연해 보이지만, 인증 실패 시 401을, 인가 실패 시 403을 반환해야 하므로 이 순서가 강제된다.

**APF(큐잉)가 인가보다 먼저다.** 이것이 처음 보면 의아할 수 있다. "권한도 확인 안 된 요청을 왜 먼저 큐에 넣는가?" 답은 **APF 자체가 과부하 방지 장치이기 때문**이다. 인가 로직(특히 Webhook 기반 인가)도 CPU와 네트워크를 소비하는 작업이다. 인가 단계 자체가 과부하의 원인이 될 수 있으므로, 그보다 앞에서 동시성을 제어해야 한다. 다만 완전히 무방비는 아니다 — APF의 FlowSchema 매칭 자체는 인증된 `user.Info`(4번 단계에서 이미 부착됨)를 기준으로 이루어지므로, 최소한 "누가 보낸 요청인지"는 이미 알고 있는 상태에서 분류가 이루어진다.

**Impersonation이 APF보다 먼저다.** 가장한 사용자 기준으로 FlowSchema가 매칭되어야 정확한 분류가 되기 때문이다. 원래 사용자가 아니라 가장된 사용자의 신원으로 우선순위 큐가 결정된다.

## 2.2 버전 변환 허브 모델 상세

### 문제: 왜 N² 변환이 필요 없는가

쿠버네티스는 하나의 리소스를 여러 API 버전으로 노출한다. `apps/v1`, 과거의 `apps/v1beta1`, `apps/v1beta2` 같은 것들이다. 순진하게 구현하면 N개 버전이 있을 때 서로 변환하는 함수가 `N × (N-1)`개 필요하다 — 새 버전이 추가될 때마다 기존 모든 버전과의 변환 함수를 새로 작성해야 한다.

쿠버네티스는 이 문제를 **허브 앤 스포크(hub-and-spoke) 모델**로 해결한다.

```
        v1beta1 ──┐
                  ├──→ 내부 버전(__internal) ──→ 스토리지 버전 ──→ etcd
        v1 ────────┘        (허브)

        읽어올 때는 정확히 반대 방향으로 변환된다
```

**모든 버전이 오직 내부 버전(hub)으로만 변환되고, 내부 버전에서만 다른 버전으로 변환된다.** N개 버전이 있어도 "버전 X → 내부", "내부 → 버전 X" 두 방향의 함수만 버전마다 작성하면 되므로 `2N`개면 충분하다. 새 버전을 추가할 때도 기존 버전들과는 무관하게 내부 버전과의 변환 쌍만 추가하면 된다.

### Scheme, Codec, RESTMapper의 역할 분담

이 변환 모델을 실제로 구동하는 세 가지 핵심 구성 요소가 있다. client-go를 직접 다루는 8장에서 프로그래밍 인터페이스로 다시 만나게 되므로, 여기서는 API 서버 내부에서의 역할에 집중한다.

| 구성 요소 | 역할 |
|---|---|
| **Scheme** | Go 타입 ↔ GroupVersionKind(GVK) 매핑을 등록하는 레지스트리. "`apps/v1`의 `Deployment`는 이 Go 구조체다"를 안다. 버전 간 변환 함수(Conversion), 기본값 설정 함수(Defaulting)도 여기 등록된다 |
| **Codec** | 실제 직렬화/역직렬화를 수행. JSON, YAML, protobuf 세 가지 인코딩을 지원하며, `Accept`/`Content-Type` 헤더에 따라 선택된다. Scheme의 타입 정보를 이용해 바이트 스트림 ↔ Go 객체를 오간다 |
| **RESTMapper** | 리소스 이름(`pods`, `deployments`) ↔ GVK ↔ 실제 REST 엔드포인트 경로를 매핑. `kubectl get po`처럼 축약어나 복수형만으로도 올바른 리소스를 찾아내는 것은 RESTMapper 덕분이다 |

세 구성 요소의 관계를 하나의 요청으로 정리하면 이렇다.

```
클라이언트가 "deploy/web"을 v1으로 요청
        │
        ▼
RESTMapper: "deploy" → GroupVersionResource(apps, v1, deployments)
        │
        ▼
etcd에서 스토리지 버전(보통 가장 안정적인 버전)으로 저장된 바이트를 읽음
        │
        ▼
Codec: 바이트 → 스토리지 버전 Go 객체
        │
        ▼
Scheme의 변환 함수: 스토리지 버전 → 내부 버전 → 요청한 v1 (허브 경유)
        │
        ▼
Codec: v1 Go 객체 → 요청된 Accept 헤더 형식(JSON/protobuf)으로 직렬화
        │
        ▼
클라이언트에 응답
```

### storageVersionHash — 왜 필요한가

여러 버전 중 실제로 etcd에 저장되는 버전은 하나로 고정된다(스토리지 버전). client-go의 캐시나 일부 도구는 "이 리소스가 지난번과 같은 스토리지 버전으로 저장되고 있는가"를 빠르게 확인해야 할 때가 있는데, 매번 전체 스키마를 비교하는 대신 짧은 해시값으로 비교한다.

```bash
kubectl get --raw /apis/apps/v1 | jq '.resources[] | select(.name=="deployments") | .storageVersionHash'
```

이 값이 바뀌었다면 스토리지 버전 자체가 바뀌었다는 신호이며(예: 쿠버네티스 버전 업그레이드로 기본 저장 버전이 변경된 경우), 클라이언트 캐시를 무효화해야 할 수도 있다는 뜻이다.

**CRD에도 같은 원리가 적용된다.** 9장에서 CRD에 여러 버전을 정의하고 conversion webhook으로 버전 간 변환을 구현할 때, 바로 이 허브 모델의 축소판을 직접 작성하게 된다.

## 2.3 어그리게이션 계층

API 서버가 응답하는 모든 API가 API 서버 프로세스 내부에서 직접 구현되는 것은 아니다. 쿠버네티스는 세 가지 경로로 API를 제공한다.

```
                       kube-apiserver
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
    내장 API              CRD 기반 API          어그리게이션 API
  /api/v1                apiextensions-       APIService를 통해
  /apis/apps/v1          apiserver가 처리      다른 서버로 프록시
  (컴파일된 Go 코드)       (동적 등록)           (로컬 또는 원격)
```

**내장 API**는 API 서버 바이너리에 컴파일되어 들어간 리소스다. `Pod`, `Deployment`, `Service` 등이 여기 속하며, 성능이 가장 좋고 스토리지 계층과 직접 통합되어 있다.

**CRD 기반 API**는 `CustomResourceDefinition` 오브젝트를 만드는 순간 API 서버 프로세스 내부의 `apiextensions-apiserver`가 동적으로 새 엔드포인트를 등록해 처리한다. 별도 프로세스가 아니라 같은 API 서버 프로세스 안에서 처리되지만, 스키마 검증·저장 방식이 내장 API와는 다른 경로를 탄다(9장에서 상세).

**어그리게이션 API**는 `APIService` 오브젝트로 등록되며, 두 가지 경우로 나뉜다.

```yaml
# 로컬 참조 — 내장/CRD 기반 API를 나타낼 때 자동 생성됨
apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  name: v1.apps
spec:
  group: apps
  version: v1
  groupPriorityMinimum: 17800
  versionPriority: 15
```

```yaml
# 원격 서비스 참조 — 별도로 구현된 API 서버를 등록할 때
apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  name: v1beta1.metrics.k8s.io
spec:
  group: metrics.k8s.io
  version: v1beta1
  service:
    name: metrics-server
    namespace: kube-system
    port: 443
  insecureSkipTLSVerify: false
  caBundle: <base64 CA cert>
  groupPriorityMinimum: 100
  versionPriority: 100
```

`service` 필드가 있으면 이 API 그룹으로 오는 요청을 kube-apiserver가 **완전히 별도의 서버로 프록시**한다. `metrics.k8s.io`가 대표적인 예다.

```bash
kubectl get apiservices | grep -v Local
```

```
NAME                     SERVICE                      AVAILABLE
v1beta1.metrics.k8s.io   kube-system/metrics-server   True
```

metrics-server는 kube-apiserver와 완전히 독립된 바이너리이며 자체 인증서로 통신한다. kube-apiserver는 `/apis/metrics.k8s.io/v1beta1/...` 경로로 들어온 요청을 인증·인가까지만 자신이 처리하고, 그 이후는 해당 서비스로 그대로 전달한다. **어그리게이션 API 서버를 직접 구현하는 것**은 12장(스케줄러 플러그인과 커스텀 API 서버)에서 다룬다.

이 세 경로의 차이를 요약하면 다음과 같다.

| 구분 | 처리 위치 | 스키마 검증 | 대표 예 |
|---|---|---|---|
| 내장 API | API 서버 프로세스, 컴파일된 코드 | Go 타입 기반 | Pod, Deployment, Service |
| CRD 기반 API | API 서버 프로세스, 동적 등록 | OpenAPI v3 스키마(CRD에 명시) | 대부분의 오퍼레이터 커스텀 리소스 |
| 어그리게이션 API | 별도 프로세스로 프록시 | 해당 서버가 자체 구현 | metrics.k8s.io, 커스텀 API 서버 |

## 2.4 watch cache와 API Priority & Fairness

### 문제: 수천 개의 watch를 어떻게 감당하는가

쿠버네티스의 거의 모든 컨트롤러와 kubelet은 watch로 상태 변화를 감지한다(1.1절의 레벨 트리거 모델에서 "재조정 시점"을 알리는 신호가 바로 이 watch다). 클러스터 규모가 커지면 동시에 열리는 watch 연결이 수천 개에 이를 수 있는데, 이 모두가 etcd에 직접 watch를 걸면 etcd가 감당하지 못한다.

```
etcd
  │ (리소스 종류마다 etcd watch를 정확히 하나만 연다)
  ▼
┌──────────────────────────────────────┐
│   watch cache (API 서버 프로세스 메모리)  │
│   · 최근 이벤트를 순환 버퍼로 보관         │
│   · 현재 오브젝트 전체 상태의 스냅샷 유지    │
└─────────────────┬──────────────────────┘
                  │ (fan-out — 메모리 내 복사/전달)
     ┌────────────┼─────────────┬───────────┐
     ▼            ▼             ▼           ▼
 kubelet #1   kubelet #2   컨트롤러 A    Informer B
```

**핵심 설계**: API 서버는 각 리소스 종류(GroupVersionResource)마다 etcd watch를 **딱 하나만** 유지한다. 그 위에 붙는 클라이언트가 몇 개든 — 10개든 1만 개든 — etcd가 받는 부하는 늘지 않는다. API 서버가 자신의 메모리 안에서 이벤트를 복제해 나눠주기 때문이다. (API 서버 인스턴스가 여러 개인 HA 구성에서는 인스턴스마다 이 watch cache를 독립적으로 유지하므로, 실제로는 "API 서버 인스턴스 수만큼"의 etcd watch가 존재한다.)

### resourceVersion의 시맨틱

`resourceVersion`은 etcd의 논리적 시계(정확히는 MVCC 리비전, 3장에서 다룬다) 역할을 하며, watch 요청 시 어디서부터 이벤트를 받을지를 결정한다.

```
watch?resourceVersion=""       현재 상태를 모두 전송(초기 목록)한 뒤 그 이후 변경분부터 스트리밍
watch?resourceVersion="0"      캐시가 가진 임의의(가장 오래되지 않은) 시점부터 시작 — 가장 빠르지만
                                다소 오래된 데이터를 받을 수 있음
watch?resourceVersion="12345"  정확히 그 리비전 이후의 변경 이벤트만 수신
```

### 연결 재개와 410 Gone

클라이언트가 연결이 끊겼다가 마지막으로 받은 `resourceVersion`으로 재접속을 시도할 때, 그 리비전이 이미 watch cache의 순환 버퍼에서 밀려나 사라졌다면 API 서버는 다음을 반환한다.

```
410 Gone: too old resource version
```

이 경우 클라이언트는 **전체 목록을 다시 받아오는 것(relist)**부터 다시 시작해야 한다. Informer는 이 로직을 자동으로 처리하도록 구현되어 있다(8장에서 Reflector 구현을 직접 살펴본다).

**Bookmark 이벤트**는 이 문제의 발생 빈도를 낮추는 장치다.

```bash
curl -s "localhost:8001/api/v1/pods?watch=true&allowWatchBookmarks=true" | jq -c 'select(.type=="BOOKMARK")'
```

실제 오브젝트 변경이 없어도 API 서버는 주기적으로 "지금 resourceVersion은 여기까지 진행됐다"는 BOOKMARK 이벤트를 보낸다. 클라이언트는 이것으로 자신의 마지막 위치를 최신으로 유지할 수 있어, 재연결 시 너무 오래된 resourceVersion을 요청해 410을 받을 확률이 줄어든다.

### Streaming List와 watch cache 초기화 복원력

이 절의 내용을 실전에서 더 견고하게 만드는 두 가지 개선 사항이 있다.

**Streaming List**는 대량의 리스트 응답(예: 수만 개의 Pod를 한 번에 List)을 처리하는 방식을 바꾼다. 기존에는 API 서버가 응답 전체를 메모리에 모은 뒤 한 번에 직렬화했지만, Streaming List는 오브젝트 단위로 순차적으로 인코딩하며 스트리밍한다. 리스트 요청 하나가 API 서버 메모리를 순간적으로 크게 잡아먹는 문제를 줄인다. v1.33에서 기본 활성화된 베타로 제공되었고, **v1.34에서 GA로 승격**되었다.

**Resilient Watch Cache Initialization**은 watch cache가 아직 초기 List를 끝내지 못해 준비되지 않은 상태에서 watch/list 요청이 들어왔을 때의 동작을 바꾼다. 과거에는 이런 요청이 캐시가 준비될 때까지 무기한 대기하며 서버 자원(연결, 고루틴)을 붙잡고 있었다. 지금은 이 상태의 요청에 즉시 **429 Too Many Requests**를 반환해, 클라이언트가 표준적인 백오프 후 재시도를 하도록 유도한다. API 서버가 막 기동했거나 재시작 직후처럼 watch cache가 잠깐 준비되지 않은 구간에서, 밀려드는 요청이 그대로 쌓여 복구 자체를 지연시키는 상황을 막는 안전장치다.

### API Priority & Fairness (APF)

**문제**: APF 이전에는 `--max-requests-inflight` 플래그 하나로 API 서버 전체의 동시 요청 수만 제한했다. 이 방식의 결함은 **요청 종류를 구분하지 않는다**는 데 있었다. 오작동하는 컨트롤러 하나가 요청을 폭주시키면, 그 요청들이 전체 동시 처리 한도를 잠식해 kubelet의 노드 상태 보고나 리더 선출용 Lease 갱신 요청까지 밀려날 수 있었다. 이는 클러스터 전체의 연쇄 장애로 이어질 수 있는 심각한 결함이었다.

**해결**: APF는 요청을 **분류하고 큐를 분리**한다.

```
요청 → FlowSchema(어떤 큐로 갈지 분류) → PriorityLevelConfiguration(큐 + 동시성 배분)
```

```bash
kubectl get flowschemas
kubectl get prioritylevelconfigurations
```

```
NAME                          PRIORITYLEVEL     MATCHINGPRECEDENCE
exempt                        exempt            1
system-leader-election        leader-election   100
node-high                     node-high         400
system-node-high              node-high         400
kube-system-service-accounts  workload-high     900
service-accounts              workload-low      9000
global-default                global-default    9900
catch-all                     catch-all         10000
```

기본 우선순위 레벨은 다음과 같다.

| 레벨 | 대상 |
|---|---|
| `exempt` | `system:masters` 등 — 제한 없이 즉시 처리 |
| `system` | 핵심 시스템 컴포넌트 |
| `node-high` | kubelet의 노드/Pod 상태 보고 ★ |
| `leader-election` | 리더 선출 관련 요청(기아 상태 방지) |
| `workload-high` | kube-system 네임스페이스의 컨트롤러 |
| `workload-low` | 일반 사용자 워크로드의 ServiceAccount |
| `global-default` | 별도로 분류되지 않은 나머지 |
| `catch-all` | 어떤 FlowSchema에도 매칭되지 않은 요청 |

**핵심 효과**: 어떤 워크로드가 요청을 폭주시켜도, 그 요청은 자신이 속한 우선순위 레벨의 큐와 동시성 몫만 소진한다. **`node-high`와 `leader-election`에 배정된 몫은 침해받지 않으므로**, 클러스터의 핵심 기능(노드 상태 파악, 컨트롤러 활성 상태 유지)은 계속 동작한다.

**커스텀 FlowSchema 예시** — 특정 오퍼레이터의 ServiceAccount가 API 서버에 과도한 요청을 보내는 것이 확인되어, 이를 낮은 우선순위 큐로 격리하는 경우다.

```yaml
apiVersion: flowcontrol.apiserver.k8s.io/v1
kind: FlowSchema
metadata:
  name: isolate-noisy-operator
spec:
  priorityLevelConfiguration:
    name: workload-low
  matchingPrecedence: 500
  distinguisherMethod:
    type: ByUser
  rules:
    - subjects:
        - kind: ServiceAccount
          serviceAccount:
            name: noisy-operator
            namespace: default
      resourceRules:
        - verbs: ["*"]
          apiGroups: ["*"]
          resources: ["*"]
          clusterScope: true
          namespaces: ["*"]
```

`matchingPrecedence`가 낮을수록 먼저 매칭을 시도한다(숫자가 작을수록 우선). 여러 FlowSchema에 매칭될 수 있는 요청은 가장 낮은 `matchingPrecedence` 값을 가진 규칙에 배정된다.

**핵심 메트릭**

```bash
kubectl get --raw /metrics | grep -E 'apiserver_flowcontrol_(rejected|current_inqueue|current_executing)' | head
```

`apiserver_flowcontrol_rejected_requests_total`이 계속 증가한다면 특정 큐가 포화 상태라는 뜻이며, 해당 클라이언트는 **429 Too Many Requests**를 받고 백오프해야 한다. client-go의 기본 클라이언트는 이 응답을 자동으로 처리해 재시도하도록 구현되어 있다(8장).

## 2.5 스토리지 계층과 암호화

### 스토리지 버전과 직렬화

etcd에 실제로 기록되는 바이트는 요청받은 버전이 아니라 **스토리지 버전**으로 변환된 뒤, 기본적으로 **protobuf**로 직렬화된다. JSON보다 protobuf가 크기와 파싱 속도 면에서 유리하기 때문에 내부 저장용으로는 protobuf가 기본값이다(단, 사용자에게 보여줄 때는 요청한 Accept 헤더에 따라 JSON으로 다시 직렬화된다).

```
내부 버전 오브젝트
    │ (2.2절의 허브 모델로 변환)
    ▼
스토리지 버전 오브젝트
    │
    ▼
protobuf 직렬화
    │
    ▼
[선택적] 암호화 (EncryptionConfiguration 설정 시)
    │
    ▼
etcd 쓰기 (키: /registry/<group>/<resource>/<namespace>/<name>)
```

### EncryptionConfiguration — 저장 시 암호화

기본적으로 etcd에 저장되는 오브젝트(Secret 포함)는 **평문**이다. etcd 자체의 접근 제어(mTLS, 파일시스템 권한)에만 의존한다. 이것이 우려되는 경우 API 서버에 `EncryptionConfiguration`을 지정해 특정 리소스를 저장 전에 암호화할 수 있다.

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
      - configmaps
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64 encoded 32-byte key>
      - identity: {}   # 암호화 안 된 기존 데이터를 읽기 위한 폴백
```

이 설정 파일은 `kube-apiserver`에 `--encryption-provider-config` 플래그로 전달된다. `providers` 목록의 **첫 번째 항목이 새로 쓸 때 사용되는 방식**이고, 목록에 있는 나머지는 "기존에 이미 그 방식으로 저장된 데이터를 읽기 위한" 폴백으로 작동한다. 그래서 암호화를 처음 도입할 때는 `identity`(암호화 안 함)를 뒤에 남겨 기존 미암호화 데이터를 계속 읽을 수 있게 하고, 이후 전체 재저장(`kubectl get secrets --all-namespaces -o json | kubectl replace -f -` 류의 작업)을 거쳐 모든 데이터를 암호화된 형태로 전환한 뒤 `identity`를 제거하는 절차를 밟는다.

### 압축과의 상호작용 (3장 예고)

etcd는 MVCC(다중 버전 동시성 제어) 저장소라서, 같은 키에 대한 과거 리비전들이 계속 누적된다. API 서버 자체는 이 압축(compaction)을 직접 수행하지 않고 별도의 압축 주기에 위임하지만, watch cache의 순환 버퍼 크기나 리스트 요청의 성능은 이 압축 주기와 맞물려 있다. etcd의 리비전 구조, 압축 정책, 그리고 이것이 watch cache/410 Gone 발생 빈도에 미치는 영향은 3장에서 자세히 다룬다.

## 2.6 진단

### 헬스 엔드포인트

```bash
kubectl get --raw /livez
kubectl get --raw /livez?verbose
kubectl get --raw /readyz?verbose
```

```
[+]ping ok
[+]log ok
[+]etcd ok
[+]poststarthook/start-apiserver-admission-initializer ok
[+]poststarthook/generic-apiserver-start-informers ok
[+]informer-sync ok
[+]poststarthook/priority-and-fairness-config-consumer ok
...
readyz check passed
```

| 엔드포인트 | 용도 |
|---|---|
| `/livez` | 프로세스가 살아 있는가 — 실패 시 kubelet이 이 컨테이너를 재시작해야 한다는 신호 |
| `/readyz` | 지금 요청을 받을 준비가 되었는가 — 앞단 로드밸런서가 트래픽 분배 여부를 판단하는 근거 |
| `/healthz` | 레거시 엔드포인트(livez/readyz 이전 방식의 혼합). 새 도구는 livez/readyz를 쓰는 것이 권장된다 |

개별 체크 항목만 따로 확인할 수도 있다.

```bash
kubectl get --raw '/readyz/etcd'
kubectl get --raw '/readyz/informer-sync'
```

### 핵심 메트릭

```bash
kubectl get --raw /metrics > /tmp/apiserver-metrics.txt
```

| 메트릭 | 의미 | 경보 기준 예시 |
|---|---|---|
| `apiserver_request_duration_seconds` | 요청 처리 지연(히스토그램) | P99 > 1초 |
| `apiserver_request_total{code=~"5.."}` | 서버 오류 응답 수 | 비율 > 1% |
| `apiserver_current_inflight_requests` | 현재 처리 중인 요청 수 | 설정된 한도에 근접 |
| `apiserver_flowcontrol_rejected_requests_total` | APF에 의해 거부된 요청 | 지속 증가 |
| `apiserver_flowcontrol_current_executing_requests` | 우선순위 레벨별 현재 실행 중 요청 | 특정 레벨만 포화 |
| `etcd_request_duration_seconds` | API 서버가 관측한 etcd 응답 지연 ★ | P99 > 500ms |
| `apiserver_storage_objects` | 리소스 종류별 저장된 오브젝트 수 | 특정 리소스만 급증 |
| `apiserver_watch_events_total` | watch로 전송된 이벤트 수 | 비정상적 급증 |

**`etcd_request_duration_seconds`가 가장 중요한 선행 지표다.** API 서버가 아무리 건강해 보여도, etcd 응답이 느려지면 결국 모든 요청이 느려진다(3장에서 이 인과 관계를 자세히 다룬다).

### `kubectl --v=9`로 원시 HTTP 관찰

```bash
kubectl --v=9 get pods -n kube-system --field-selector metadata.name=etcd-k8s-guide-control-plane
```

`--v=9`는 kubectl이 실제로 보내는 HTTP 요청 헤더·바디, 그리고 서버 응답 헤더·바디까지 그대로 출력한다. 어떤 필터가 요청에 영향을 주는지 직접 확인하고 싶을 때(예: `Accept` 헤더에 따라 protobuf/JSON 중 무엇이 오가는지) 가장 직접적인 도구다.

```
I0922 ...] GET https://127.0.0.1:6443/api/v1/namespaces/kube-system/pods?fieldSelector=...
I0922 ...] Request Headers:
I0922 ...]     Accept: application/json;as=Table;v=v1;g=meta.k8s.io,...
I0922 ...]     User-Agent: kubectl/v1.3x.x (...)
I0922 ...] Response Status: 200 OK in 12 milliseconds
I0922 ...] Response Headers:
I0922 ...]     Content-Type: application/json
I0922 ...] Response Body: {"kind":"Table", ...}
```

`Accept` 헤더에 `as=Table`이 포함된 것을 볼 수 있는데, 이는 `kubectl get`이 사람이 읽기 좋은 테이블 형식 응답을 요청한다는 뜻이다(서버 사이드 프린팅). 이 메커니즘 덕분에 `kubectl get pods`의 열 형식(`NAME`, `READY`, `STATUS`, ...)이 클라이언트가 아니라 서버에서 결정된다.

### 감사 로깅 기초

API 서버는 `--audit-policy-file`로 지정된 정책에 따라 요청/응답을 감사 로그로 남길 수 있다. 정책은 요청의 민감도에 따라 기록 수준을 다르게 지정한다.

```yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: None
    resources:
      - group: ""
        resources: ["events"]
  - level: Metadata
    resources:
      - group: ""
        resources: ["secrets", "configmaps"]
  - level: RequestResponse
    verbs: ["create", "update", "patch", "delete"]
    resources:
      - group: "apps"
        resources: ["deployments"]
  - level: Metadata
```

`level`은 `None`(기록 안 함) → `Metadata`(누가/언제/무엇을 요청했는지만) → `Request`(요청 바디 포함) → `RequestResponse`(요청·응답 바디 모두)의 4단계다. Secret처럼 민감한 리소스는 `Metadata`로 제한해 바디(실제 시크릿 값)가 로그에 남지 않도록 하는 것이 일반적이다.

### 증상별 진단 표

| 증상 | 가능한 원인 | 확인 방법 |
|---|---|---|
| `kubectl` 전반이 느림 | etcd 지연, API 서버 과부하 | `etcd_request_duration_seconds`, `apiserver_current_inflight_requests` |
| `429 Too Many Requests` | APF 제한에 걸림 | `apiserver_flowcontrol_rejected_requests_total`, 관련 FlowSchema 확인 |
| `etcdserver: request timed out` | etcd 자체 문제 | 3장 참고 |
| 특정 리소스만 조회가 느림 | 해당 리소스 오브젝트 수 과다, 인덱스 부재 | `apiserver_storage_objects{resource=...}` |
| watch가 자주 끊기고 relist 발생 | watch cache 순환 버퍼 크기 대비 이벤트량 과다 | `apiserver_watch_events_total`, 410 Gone 빈도 |
| `Unable to connect to the server` | API 서버 다운, 인증서 만료 | static Pod 로그, `kubeadm certs check-expiration` |

## 실습: API 서버 내부 동작 직접 관찰하기

이 실습은 `kind` 3노드 클러스터(`k8s-guide`, 컨트롤 플레인 노드 `k8s-guide-control-plane`)를 전제로 한다.

**① `--v=9`로 원시 요청·응답 관찰**

```bash
kubectl --v=9 get pods -n default 2>&1 | grep -A5 "Request Headers"
kubectl --v=9 get pods -n default 2>&1 | grep -A3 "Response Status"
```

**② 스토리지 버전과 storageVersionHash 확인**

```bash
kubectl get --raw /apis/apps/v1 | jq '.resources[] | select(.name=="deployments") | {name, storageVersionHash}'
```

**③ 어그리게이션 API 확인**

```bash
kubectl get apiservices
kubectl get apiservices v1.apps -o yaml | grep -A3 spec
```

로컬(내장/CRD) API인지 원격 서비스로 프록시되는 API인지 `spec.service` 필드 유무로 구분한다.

**④ FlowSchema와 PriorityLevelConfiguration 조회**

```bash
kubectl get flowschemas -o wide
kubectl get prioritylevelconfigurations -o wide
```

```bash
# 특정 FlowSchema가 어떤 우선순위 레벨로 가는지 확인
kubectl get flowschema system-leader-election -o jsonpath='{.spec.priorityLevelConfiguration.name}'
```

**⑤ watch cache 관련 메트릭 확인**

```bash
kubectl get --raw /metrics | grep -E '^apiserver_watch_cache_' | head -20
```

**⑥ EncryptionConfiguration 적용해 보기**

```bash
# 32바이트 랜덤 키 생성
docker exec k8s-guide-control-plane bash -c \
  "head -c 32 /dev/urandom | base64"
```

출력된 키를 이용해 설정 파일을 만든다.

```bash
docker exec k8s-guide-control-plane mkdir -p /etc/kubernetes/enc
cat <<'EOF' | docker exec -i k8s-guide-control-plane tee /etc/kubernetes/enc/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <위에서 생성한 base64 키>
      - identity: {}
EOF
```

`/etc/kubernetes/manifests/kube-apiserver.yaml`에 `--encryption-provider-config=/etc/kubernetes/enc/encryption-config.yaml` 플래그와 해당 경로의 볼륨 마운트를 추가하면 static Pod가 자동으로 재시작되며 적용된다(2.5절의 파일 형식 그대로).

```bash
kubectl create secret generic enc-test --from-literal=password=hunter2

# etcd에서 직접 값을 확인 — 암호화되어 있으면 평문 "hunter2"가 보이지 않아야 한다
docker exec k8s-guide-control-plane sh -c \
  "ETCDCTL_API=3 etcdctl --cacert=/etc/kubernetes/pki/etcd/ca.crt \
   --cert=/etc/kubernetes/pki/etcd/server.crt \
   --key=/etc/kubernetes/pki/etcd/server.key \
   get /registry/secrets/default/enc-test" | strings | grep -i hunter2
# 암호화가 적용되었다면 아무것도 출력되지 않아야 한다
```

**⑦ 헬스 체크 세부 확인**

```bash
kubectl get --raw /readyz?verbose | grep -v "^\[+\]"
```

`[+]`가 아닌 항목이 있다면 어떤 체크가 실패하고 있는지 바로 드러난다.

## 실습 과제

**과제 1 — 버전 변환 관찰**
동일한 Deployment 오브젝트를 `kubectl --v=9 get deployment <name> -o json`으로 조회할 때와, `kubectl get --raw /apis/apps/v1beta1/...` 형태(클러스터에 해당 구버전이 남아 있다면)로 조회할 때 응답 바디의 차이를 비교한다. 차이가 없다면 왜 없는지, 있다면 어느 필드가 다른지 허브 모델로 설명해 본다.

**과제 2 — 410 Gone 재현**
`kubectl proxy`를 띄운 뒤 매우 오래된 `resourceVersion`으로 watch를 요청해 `410 Gone`을 직접 받아 본다.
```bash
kubectl proxy --port=8001 &
curl -s "localhost:8001/api/v1/pods?watch=true&resourceVersion=1"
```
Informer(client-go)가 이 상황을 어떻게 자동으로 처리하는지 8장 예습 삼아 조사해 본다.

**과제 3 — 커스텀 FlowSchema 작성**
특정 네임스페이스의 ServiceAccount가 보내는 모든 `list`/`watch` 요청만 `workload-low`로 격리하는 FlowSchema를 작성하고, 그 SA로 대량 요청을 발생시키면서 다른 우선순위 레벨(`workload-high` 등)의 요청 지연이 영향받지 않음을 `apiserver_flowcontrol_current_executing_requests` 메트릭으로 확인한다.

**과제 4 — EncryptionConfiguration 적용 전후 비교**
암호화 적용 전에 만든 Secret과 적용 후에 만든 Secret을 각각 etcd에서 직접 조회해, 적용 시점 이전 데이터는 `identity` 폴백 덕분에 여전히 읽히지만 평문으로 저장되어 있다는 것을 확인한다. 기존 Secret을 재저장(`kubectl replace` 등)해 암호화된 형태로 전환해 본다.

**과제 5 — 어그리게이션 API 직접 확인**
`metrics-server`를 설치(또는 이미 설치되어 있다면 확인)하고, `kubectl get apiservices v1beta1.metrics.k8s.io -o yaml`로 `spec.service`가 가리키는 대상을 확인한 뒤, `kubectl top nodes` 요청이 실제로는 API 서버가 아니라 이 서비스로 프록시된다는 것을 `kubectl --v=9 top nodes` 출력으로 검증한다.

## 요약

- API 서버의 필터 체인은 **panic 복구 → 타임아웃 → 인증 → 감사 시작 → Impersonation → APF 큐잉 → 인가**의 순서로 겹겹이 감싸인 핸들러 래핑 구조다. APF가 인가보다 먼저 오는 이유는 인가 로직 자체도 과부하의 원인이 될 수 있어 그 앞에서 동시성을 통제해야 하기 때문이다.
- 버전 변환은 **내부 버전(hub)을 경유**하는 모델이다. N개의 외부 버전이 있어도 `2N`개의 변환 함수만 있으면 되며, 이 원리는 CRD의 conversion webhook(9장)에도 그대로 적용된다. `Scheme`(타입 레지스트리), `Codec`(직렬화), `RESTMapper`(리소스명 매핑)가 이 변환을 구동하는 세 축이다.
- API는 **내장(컴파일된 코드) / CRD 기반(동적 등록, 같은 프로세스) / 어그리게이션(APIService, 로컬 또는 원격 프록시)** 세 경로로 제공된다. `metrics.k8s.io`처럼 완전히 별도 서버로 위임되는 경우가 어그리게이션의 대표 예다.
- **watch cache**는 리소스 종류당 etcd watch를 하나만 유지하고 이를 메모리에서 수천 클라이언트로 fan-out한다. 오래된 `resourceVersion`으로 재접속하면 `410 Gone`이 발생해 relist가 필요하며, **Bookmark 이벤트**가 이 발생 빈도를 낮춘다. **Streaming List**(v1.34 GA)는 대형 리스트 응답을 오브젝트 단위로 스트리밍해 메모리 급증을 줄이고, watch cache가 아직 초기화 중일 때는 무기한 대기 대신 **429**로 응답해 재시도를 유도한다.
- **APF**는 FlowSchema로 요청을 분류하고 PriorityLevelConfiguration 큐에 배분한다. 어떤 워크로드가 폭주해도 `node-high`(kubelet 보고)와 `leader-election`의 몫은 보장되어 클러스터 핵심 기능이 살아남는다.
- 스토리지 계층은 내부 버전을 스토리지 버전으로 바꾸고 **protobuf**로 직렬화한 뒤 etcd에 쓴다. `EncryptionConfiguration`으로 Secret 등을 저장 전 암호화할 수 있으며, `providers` 목록의 순서(쓰기 시 사용할 방식이 맨 앞)와 `identity` 폴백의 역할을 정확히 이해해야 안전하게 도입할 수 있다.
- 진단은 `/livez`(재시작 판단)·`/readyz`(트래픽 수신 판단) 엔드포인트, `etcd_request_duration_seconds`(가장 중요한 선행 지표), 그리고 `kubectl --v=9`로 원시 HTTP를 직접 관찰하는 것에서 시작한다.

**다음 장에서는** API 서버가 유일하게 신뢰하는 진실의 원천, etcd 내부로 들어간다. Raft 합의가 실제로 어떻게 리더를 뽑고 로그를 복제하는지, MVCC 키 구조와 압축이 이 장에서 다룬 watch cache·410 Gone과 어떻게 맞물리는지를 자세히 다룬다.
