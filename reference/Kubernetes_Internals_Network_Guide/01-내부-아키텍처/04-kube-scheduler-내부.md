---
title: "4장. kube-scheduler 내부"
---

# 4장. kube-scheduler 내부

> **학습목표**
> - 스케줄링 프레임워크의 확장점 파이프라인(QueueSort~PostBind)을 순서대로 설명할 수 있다.
> - activeQ/backoffQ/unschedulablePods 사이에서 Pod가 어떻게 이동하는지 이해한다.
> - NodeResourcesFit, PodTopologySpread 등 기본 플러그인의 판단 로직을 안다.
> - PriorityClass와 선점(preemption)이 희생 Pod를 어떻게 고르는지 설명할 수 있다.
> - `percentageOfNodesToScore`가 대규모 클러스터에서 왜 필요한지, 무엇을 트레이드오프하는지 안다.
> - 여러 스케줄러를 동시에 운영하는 방법과 그 용도를 안다.

---

## 들어가며

1장에서 컨트롤 플레인의 지도를 그리며 kube-scheduler를 "배치 결정을 내리는 컴포넌트"라고 짧게 소개했다. 3장에서는 그 배치 결정이 최종적으로 etcd에 어떻게 기록되는지—`/registry/pods/<ns>/<name>`의 `spec.nodeName` 필드에 값이 채워지는 하나의 쓰기로—를 다뤘다.

이 장은 그 쓰기가 일어나기 **직전**의 과정, 즉 "이 Pod를 어느 노드에 놓을 것인가"를 결정하는 kube-scheduler 내부를 연다. kube-scheduler도 결국 하나의 **컨트롤러**다(5장에서 다룰 Informer/워크큐 패턴을 그대로 쓴다). 차이는 조정 대상이 "Pod의 상태를 원하는 상태로 맞추는 것"이 아니라 "`nodeName`이 비어 있는 Pod에 노드 하나를 배정하는 것"이라는 점이다.

```
kube-scheduler가 하는 일 (한 문장)

  nodeName이 비어 있는 Pod를 watch → 후보 노드를 필터링·점수화 →
  최고점 노드를 골라 Binding 오브젝트를 API 서버에 생성
```

이 장에서는 그 "필터링·점수화"가 내부적으로 어떤 파이프라인으로 구성되어 있는지, 큐 안에서 Pod가 어떻게 대기하고 재시도되는지, 우선순위가 충돌할 때 무슨 일이 벌어지는지를 순서대로 본다.

## 4.1 스케줄링 프레임워크 아키텍처

### 확장점 파이프라인

kube-scheduler는 v1.19부터 **스케줄링 프레임워크(Scheduling Framework)**라는 플러그인 아키텍처로 재구성되었다. 각 단계가 "확장점(extension point)"이고, 여러 플러그인이 같은 확장점에 등록되어 순서대로 호출된다.

```
                     Pod가 스케줄링 큐에서 나옴
                              │
┌─────────────────────────────▼─────────────────────────────┐
│                     스케줄링 사이클 (동기, Pod당 1개씩)        │
│                                                            │
│  QueueSort   큐에서 어떤 Pod를 먼저 꺼낼지 정렬 기준 결정        │
│      │       (기본: 우선순위 높은 순 → 큐 진입 시각 순)          │
│      ▼                                                    │
│  PreFilter   Pod 전체에 대한 사전 계산/검증                    │
│      │       (예: PodTopologySpread의 스큐 계산 준비)          │
│      ▼                                                    │
│  Filter      노드 하나하나를 돌며 "이 노드에 배치 가능한가?"     │
│      │       (모든 노드에 대해 병렬 실행) → 통과한 노드만 남음     │
│      ▼                                                    │
│  ※ Filter를 통과한 노드가 하나도 없으면 → PostFilter로         │
│      │                                                     │
│  PostFilter  선점(preemption) 시도 — 4.4절                   │
│      │       (통과 노드가 있으면 이 단계는 건너뜀)               │
│      ▼                                                    │
│  PreScore    점수 계산 전 공통 상태 준비                        │
│      │                                                     │
│      ▼                                                    │
│  Score       통과한 노드마다 0~100점 부여                       │
│      │       여러 Score 플러그인의 가중합으로 최종 점수           │
│      ▼                                                    │
│  (Normalize) 플러그인 간 점수 스케일을 맞춤                      │
│      │                                                     │
│      ▼                                                    │
│  최고점 노드 선택 (동점이면 무작위)                              │
└──────────────────┬─────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  바인딩 사이클 (비동기 가능)                     │
│                                                              │
│  Reserve   선택된 노드에 리소스를 "가예약" (다른 Pod와 경합 방지)  │
│      │                                                       │
│      ▼                                                       │
│  Permit    바인딩을 허가/보류/거부 (배치 그룹 스케줄링 등에 사용)   │
│      │     (승인 대기하며 일정 시간 대기 가능)                    │
│      ▼                                                       │
│  PreBind   바인딩 직전 준비 작업 (예: 볼륨 attach 대기)           │
│      │                                                       │
│      ▼                                                       │
│  Bind      실제 Binding 오브젝트를 API 서버에 생성               │
│      │     → kube-apiserver가 Pod.spec.nodeName을 채움          │
│      ▼                                                       │
│  PostBind  바인딩 후 정리 작업 (알림, 로깅 등)                    │
└───────────────────────────────────────────────────────────────┘
```

### 왜 이렇게 나뉘어 있는가

**Filter와 Score의 역할이 다르다.** Filter는 "가능/불가능"의 이진 판단이고(예: 요청한 CPU가 노드에 없으면 무조건 탈락), Score는 "가능한 후보들 중 어디가 더 나은가"의 상대 평가다(예: 자원을 더 여유 있게 남기는 노드에 높은 점수).

**PreFilter/PreScore는 캐싱 최적화다.** 노드마다 반복 계산할 값을 미리 한 번만 계산해 `CycleState`(사이클 상태 저장소)에 넣어 두고, 이후 Filter/Score 단계에서 재사용한다.

**Reserve~PostBind이 별도 사이클인 이유**는 바인딩에 시간이 걸릴 수 있기 때문이다(예: PV 동적 프로비저닝 대기). **스케줄링 사이클은 한 번에 Pod 하나씩 순차 처리**하지만, **바인딩 사이클은 여러 Pod가 동시에 진행**될 수 있다 — 그래야 특정 Pod의 볼륨 마운트가 오래 걸려도 다른 Pod의 스케줄링이 막히지 않는다.

```bash
kubectl get pods -n kube-system -l component=kube-scheduler -o yaml | grep -A3 "kube-scheduler"
```

12장에서 이 확장점에 직접 커스텀 플러그인을 붙이는 방법(스케줄러 플러그인 개발)을 다룬다. 이 장에서는 **내장 파이프라인의 동작 원리**에 집중한다.

## 4.2 스케줄링 큐 내부

### 세 개의 큐

kube-scheduler는 처리 대상 Pod를 하나의 자료구조가 아니라 **역할이 다른 세 개의 큐/풀**로 관리한다.

```
                  새 Pod 감지 (Informer, 5장)
                          │
                          ▼
                  ┌───────────────┐
                  │   activeQ      │  ← 우선순위 힙(heap)
                  │  (스케줄 대기)  │     QueueSort 기준으로 정렬
                  └───────┬────────┘
                          │ Pop → 스케줄링 사이클 실행
                          ▼
              ┌───────────┴────────────┐
              │                        │
        스케줄 성공                 스케줄 실패
              │                        │
              ▼                        ▼
         (바인딩 사이클로)      ┌──────────────────┐
                              │  실패 사유는?       │
                              └─────┬────────┬─────┘
                                    │        │
                        일시적 실패(자원 부족 등)   구조적 실패(예: 매칭되는
                                    │            노드가 아예 없음)
                                    ▼                    │
                          ┌─────────────────┐            │
                          │   backoffQ       │            │
                          │ (지수 백오프 대기) │            │
                          └────────┬─────────┘            │
                                   │ 대기시간 경과            │
                                   ▼                       ▼
                          activeQ로 재진입          ┌──────────────────┐
                                                    │ unschedulablePods │
                                                    │  (보류 풀)         │
                                                    └─────────┬─────────┘
                                                              │ 클러스터 이벤트 발생 시
                                                              │ (노드 추가, 자원 해제 등)
                                                              ▼
                                                        activeQ로 재진입
```

- **activeQ**: 다음에 스케줄링을 시도할 Pod들의 우선순위 힙. `QueueSort` 플러그인(기본: 우선순위 내림차순, 동률이면 큐 진입 시각 오름차순)으로 정렬된다.
- **backoffQ**: 스케줄링에 실패했지만 **곧 재시도하면 성공할 가능성이 있는** Pod가 대기하는 큐. 대기 시간은 실패 횟수에 따라 지수적으로 늘어난다(예: 1초 → 2초 → 4초...).
- **unschedulablePods**: **당장 재시도해도 의미가 없는** Pod들의 보류 풀. 클러스터 상태가 바뀌는 이벤트(새 노드 추가, 다른 Pod 삭제로 자원 해제, NodeAffinity 대상 라벨 변경 등)가 발생해야 activeQ로 다시 옮겨진다.

### 왜 백오프가 필요한가

Pod 하나가 스케줄링에 실패했다고 매번 즉시 재시도하면, 자원이 없는 클러스터에서 **실패할 게 뻔한 재시도가 CPU를 계속 태운다.** 백오프는 **재시도 간격을 점점 늘려** 이 낭비를 줄인다. 동시에 완전히 재시도를 멈추지 않는 이유는, 다른 Pod가 그 사이 삭제되어 자원이 풀리는 등 **상황이 바뀔 수 있기 때문**이다.

**이벤트 기반 재큐잉**(unschedulablePods → activeQ)이 이 구조의 핵심 최적화다. "노드가 추가됨" 같은 이벤트가 오면, 그 이벤트와 **관련 있을 법한** Pod들만 골라 activeQ로 옮긴다(스케줄러는 각 실패 사유에 연관된 이벤트 클러스터를 추적한다). 모든 Pod를 무차별 재시도하지 않는다.

```bash
kubectl get --raw /metrics | grep scheduler_pending_pods
```
```
scheduler_pending_pods{queue="active"} 0
scheduler_pending_pods{queue="backoff"} 2
scheduler_pending_pods{queue="unschedulable"} 5
```

**`unschedulable` 큐에 오래 머무는 Pod가 많다면** 클러스터 자원 부족이나 제약 조건 불일치(어피니티, taint 등)를 의심해야 한다.

## 4.3 기본 플러그인 동작 원리

### NodeResourcesFit — requests vs allocatable

가장 기본적인 Filter/Score 플러그인이다. **Filter 단계**에서는 Pod의 `resources.requests` 합이 노드의 **allocatable**(할당 가능 용량, kubelet이 예약분을 뺀 값)을 넘는지 확인한다.

```
노드 allocatable:        CPU 3800m,  메모리 7Gi
이미 스케줄된 Pod 합계:    CPU 2000m,  메모리 4Gi
남은 여유:                CPU 1800m,  메모리 3Gi

새 Pod 요청: CPU 500m, 메모리 1Gi  →  통과 (Filter)
새 Pod 요청: CPU 2000m, 메모리 1Gi →  탈락 (CPU 부족)
```

```bash
kubectl describe node k8s-guide-worker | grep -A6 "Allocated resources"
```

**limits가 아니라 requests가 스케줄링 판단 기준이다.** limits는 kubelet이 실제 실행 시점에 cgroup으로 강제하는 상한일 뿐, 스케줄러의 배치 판단에는 requests만 쓰인다. 이것이 "요청보다 많은 limits를 설정해 오버커밋을 유도"하는 전략의 근거이자, 동시에 노드가 실제로는 requests 합보다 더 많이 쓰다가 자원 압박(memory pressure)에 빠질 수 있는 이유다.

**Score 단계**에서는 기본적으로 `LeastAllocated`(여유 자원이 많이 남는 노드에 높은 점수 — 부하 분산)와 `MostAllocated`(반대로 자원을 최대한 채우는 노드에 높은 점수 — 빈 노드를 줄여 오토스케일러가 노드를 축소하기 쉽게 함) 전략을 `scoringStrategy`로 선택할 수 있다.

### NodeAffinity

`requiredDuringSchedulingIgnoredDuringExecution`은 Filter에서 강제 조건으로, `preferredDuringSchedulingIgnoredDuringExecution`은 Score에서 가중치 조건으로 처리된다.

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:   # Filter: 이걸 안 만족하면 탈락
      nodeSelectorTerms:
        - matchExpressions:
            - key: disktype
              operator: In
              values: ["ssd"]
    preferredDuringSchedulingIgnoredDuringExecution:   # Score: 만족하면 가점
      - weight: 80
        preference:
          matchExpressions:
            - key: zone
              operator: In
              values: ["us-east-1a"]
```

**"IgnoredDuringExecution"이 붙는 이유**: 이 조건은 **스케줄링 시점에만** 평가된다. Pod가 이미 배치된 후 노드 라벨이 바뀌어 조건을 더 이상 만족하지 않아도 **Pod는 축출되지 않는다.** (참고: NodeAffinity와 별개로, 노드에 새 taint가 붙으면 `NoExecute` effect에 따라 축출될 수 있다 — 이는 taint-toleration 메커니즘이며 NodeAffinity와는 다른 경로다.)

### PodTopologySpread — 스큐(skew) 계산

여러 토폴로지 도메인(존, 노드 등)에 Pod를 고르게 분산시킨다. 핵심은 **skew(불균형도)** 계산이다.

```
skew = (해당 도메인의 매칭 Pod 수) - (모든 도메인 중 최솟값)

예: zone-a에 Pod 3개, zone-b에 Pod 1개인 상태에서 새 Pod를 배치할 때
   zone-a에 배치하면 skew = 4 - 1 = 3
   zone-b에 배치하면 skew = 2 - 1 = 1

maxSkew=1로 설정했다면 zone-a는 Filter에서 탈락, zone-b만 통과
```

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule   # Filter로 강제 (ScheduleAnyway면 Score로 완화)
    labelSelector:
      matchLabels:
        app: web
```

`whenUnsatisfiable: DoNotSchedule`은 조건을 못 지키면 아예 배치를 막는다(Filter). `ScheduleAnyway`는 강제하지 않고 스큐가 작은 쪽에 가점만 준다(Score) — NodeAffinity의 required/preferred 구도와 같은 패턴이다.

### InterPodAffinity — 다른 Pod와의 관계

"이미 떠 있는 어떤 Pod와 같은 도메인에 있어야 하는가/있으면 안 되는가"를 판단한다. `podAffinity`(끌어당김)와 `podAntiAffinity`(밀어냄) 모두 같은 메커니즘이며, 계산 비용이 노드 수뿐 아니라 **기존 Pod 수에도 비례**해 커진다는 점이 NodeAffinity와의 큰 차이다. 대규모 클러스터에서 InterPodAffinity를 남용하면 스케줄링 지연이 눈에 띄게 늘어난다.

### DRA(Dynamic Resource Allocation) 참고

GPU, FPGA처럼 표준 자원 모델(CPU/메모리 수량)만으로는 표현하기 어려운 디바이스를 스케줄링 결정에 직접 참여시키는 방법으로 **DRA(Dynamic Resource Allocation)**가 있다. `ResourceClaim`/`ResourceSlice` 같은 구조화된 파라미터로 디바이스를 표현하고, 스케줄러가 이를 Filter/Score 단계에서 함께 고려해 "어떤 노드의 어떤 디바이스를 이 Pod에 묶을지"까지 결정에 반영한다. DRA는 **GA** 상태이며, 6.4절에서 다루는 전통적인 디바이스 플러그인 방식과는 별개의 경로다. 이 책은 DRA의 내부 구현(ResourceSlice 관리, 드라이버 연동)을 깊이 다루지 않지만, "확장 자원이 스케줄링 판단에 들어오는 통로가 디바이스 플러그인 외에 하나 더 있다"는 점은 기억해 둘 가치가 있다.

## 4.4 우선순위와 선점(Preemption)

### PriorityClass

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority   # 또는 Never
description: "핵심 워크로드용 우선순위"
```

`value`가 클수록 우선순위가 높다. 이 값은 4.2절의 activeQ 정렬 기준(QueueSort)에도 쓰이고, 선점 시 "누구를 밀어낼지" 판단에도 쓰인다.

### 선점이 일어나는 조건

Filter 단계에서 **모든 노드가 탈락**하면(4.1절의 파이프라인에서 PostFilter로 진입) 기본 `DefaultPreemption` 플러그인이 동작한다.

```
새 Pod(우선순위 1000000)가 스케줄링 실패
        │
        ▼
PostFilter: 선점 가능한 노드 탐색
        │
        │  각 노드마다:
        │  ① 그 노드의 Pod 중 새 Pod보다 우선순위가 "낮은"것만 후보로 삼는다
        │  ② 후보들을 우선순위가 낮은 순으로 하나씩 "제거했다고 가정"하며
        │     새 Pod가 들어갈 수 있는지 시뮬레이션한다
        │  ③ 새 Pod가 들어갈 수 있는 최소한의 희생 Pod 집합을 찾는다
        │     (불필요하게 많은 Pod를 희생시키지 않는다)
        ▼
가장 적은 희생으로 가장 적합한 노드 하나를 선택
        │
        ▼
희생 Pod들에 optional graceful termination 후 삭제
        │
        ▼
새 Pod에는 아직 자리가 완전히 빌 때까지 nodeName을 즉시 할당하지 않고
".status.nominatedNodeName"만 기록 (이 노드를 노리고 있다는 표시)
        │
        ▼
희생 Pod들이 실제로 종료된 뒤, 다음 스케줄링 사이클에서 정식 배치
```

**핵심 규칙들**:

- **우선순위가 같거나 높은 Pod는 절대 선점 대상이 되지 않는다.** 아무리 자원이 급해도 동급 이상의 워크로드를 밀어내지 않는다.
- **`preemptionPolicy: Never`로 설정된 PriorityClass**는 자신이 높은 우선순위를 가져도 다른 Pod를 선점하지 않는다(줄만 서서 자연스러운 자원 해제를 기다린다). 배치성 워크로드에 유용하다.
- **`nominatedNodeName`**은 확정이 아니라 "예약 후보"다. 그 사이 다른 사정으로 다른 노드에 배치될 수도 있다.
- 희생 Pod는 **`terminationGracePeriodSeconds`를 존중하며 정상 종료** 절차를 거친다(즉시 강제 종료가 아니다) — 다만 우선순위가 매우 급한 선점 상황에서도 이 유예 시간만큼은 새 Pod의 배치가 지연된다는 뜻이기도 하다.

```bash
kubectl get pod <victim-pod> -o jsonpath='{.status.nominatedNodeName}'
kubectl get events --field-selector reason=Preempted
```

> **참고 — 인플레이스 리사이즈를 위한 선점(v1.37, 알파)**
> 지금까지의 선점은 모두 "아직 배치되지 않은 새 Pod"를 위한 것이었다. v1.37에는 조금 다른 상황을 다루는 알파 기능이 추가됐다 — **이미 실행 중인 Pod**가 인플레이스 리사이즈(6장에서 다룰 `InPlacePodVerticalScaling`)로 CPU/메모리를 늘려 달라고 요청했는데 노드에 여유 용량이 없어 kubelet이 그 요청을 `Deferred` 상태로 미뤄 둔 경우, `InPlacePodVerticalScalingSchedulerPreemption` 기능 게이트를 켜면 스케줄러가 우선순위 낮은 Pod를 선점해 자리를 만들어 준다. 아직 알파 단계이고 기본 비활성화 상태이므로, 이 절에서 다룬 "새 Pod를 위한 선점"과 혼동하지 않아야 한다.

## 4.5 스케줄러 성능 튜닝

### percentageOfNodesToScore

Filter를 통과한 노드 **전부**를 Score 단계에서 채점하면, 노드가 수천 대인 클러스터에서는 매 Pod 스케줄링마다 수천 번의 점수 계산이 필요해 **지연이 노드 수에 비례해 커진다.**

`percentageOfNodesToScore`는 **"Filter를 통과할 만한 후보가 충분히 모이면 나머지 노드는 더 보지 않고 그 안에서 최선을 고른다"**는 절충이다.

```
클러스터 노드 총 100대, percentageOfNodesToScore=50 이라면

노드 목록을 순회하며 Filter 실행
→ 통과한 노드가 50대(전체의 50%)에 도달하면 순회를 멈춘다
→ 그 50대만 Score 단계로 넘어간다
→ 나머지 50대는 이번 스케줄링에서는 아예 평가되지 않는다
```

**전제**: 다음 순회 시작 지점을 매번 바꾸므로(라운드로빈 방식으로 순회 시작 노드를 이동), 특정 노드 그룹만 계속 배제되는 편향은 생기지 않는다.

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
percentageOfNodesToScore: 50
```

**기본값은 클러스터 크기에 따라 스케줄러가 자동으로 결정한다**(노드가 적으면 100%에 가깝게, 매우 크면 낮은 비율로 자동 조정되는 선형 공식을 쓴다). 값을 명시적으로 낮추면 **스케줄링 처리량(throughput)은 늘지만, "이론상 가장 좋은 노드"를 놓칠 확률도 늘어난다** — 처리량과 배치 최적성의 트레이드오프다.

### 핵심 메트릭

```bash
kubectl get --raw /metrics | grep scheduler_scheduling_duration_seconds
kubectl get --raw /metrics | grep scheduler_pod_scheduling_attempts
kubectl get --raw /metrics | grep scheduler_preemption_attempts_total
```

| 메트릭 | 의미 |
|---|---|
| `scheduler_scheduling_duration_seconds` | 스케줄링 사이클 단계별 소요 시간(Filter/Score 등 세분화) |
| `scheduler_pod_scheduling_attempts` | Pod 하나가 스케줄링되기까지 시도한 횟수 — 높으면 자원 경합 의심 |
| `scheduler_pending_pods` | 큐별 대기 Pod 수(4.2절) |
| `scheduler_preemption_attempts_total` | 선점 시도 횟수 — 급증하면 우선순위 설계나 용량 재검토 신호 |
| `scheduler_scheduler_cache_size` | 스케줄러 내부 캐시(노드/Pod) 크기 |

**`scheduling_duration_seconds`의 `Filter` 단계가 유독 느리다면** InterPodAffinity 남용이나 노드 수 자체의 문제를, **`Score` 단계가 느리다면** 활성화된 Score 플러그인 수나 `percentageOfNodesToScore` 설정을 점검한다.

## 4.6 다중 스케줄러 구성

### 왜 여러 스케줄러를 두는가

기본 `default-scheduler` 외에 **다른 이름의 스케줄러 프로세스를 추가로 띄울 수 있다.** Pod는 `spec.schedulerName`으로 자신을 어느 스케줄러가 담당할지 지정한다.

```
kube-apiserver
       │ watch: nodeName == "" 인 Pod
       ├──────────────┬──────────────────┐
       ▼              ▼                  ▼
default-scheduler  batch-scheduler   (없음: my-custom-scheduler)
(schedulerName      (schedulerName    (schedulerName이 my-custom
 미지정 Pod 담당)     명시된 Pod만      이지만 그런 스케줄러가
                     골라서 담당)       실행 중이 아니면 영원히 Pending)
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: batch-job-pod
spec:
  schedulerName: batch-scheduler
  containers:
    - name: worker
      image: busybox
```

**`schedulerName`은 단지 문자열 필드다.** 쿠버네티스가 이 값을 검증하지 않는다 — 해당 이름으로 동작하는 스케줄러가 실제로 떠 있지 않으면 그 Pod는 **영원히 Pending 상태**로 남는다(4.2절의 unschedulablePods에 들어가지도 못한다. 애초에 어떤 스케줄러도 이 Pod를 watch 대상으로 집어가지 않기 때문이다).

### 실전에서의 용도

두 번째 kube-scheduler 바이너리를 다른 이름으로 그대로 띄우는 경우는 드물고, 보통은 **배치/HPC 스케줄링에 특화된 별도 스케줄러**를 이 메커니즘으로 끼워 넣는다.

| 용도 | 예시 |
|---|---|
| 갱 스케줄링(gang scheduling) — 여러 Pod를 원자적으로 함께 배치 | Volcano, Kueue |
| 배치 큐잉과 쿼터 기반 대기열 | Kueue |
| GPU 등 특수 자원 topology-aware 배치 | 커스텀 스케줄러 플러그인(12장) |
| A/B 테스트용 스케줄링 로직 실험 | 기본 스케줄러와 병행 운영 |

**기본 스케줄러를 완전히 대체하는 대신 특정 워크로드만 다른 스케줄러로 보내는 것이 일반적인 패턴이다.** 12장에서 스케줄러 프레임워크의 확장점(4.1절)에 커스텀 플러그인을 직접 붙이는 방법을 다루는데, 이는 "완전히 다른 스케줄러 프로세스"보다 훨씬 흔히 쓰이는 확장 방식이다 — 기본 파이프라인의 재활용(리소스 계산, 캐시 등)을 그대로 얻으면서 판단 로직만 갈아 끼울 수 있기 때문이다.

## 실습: 스케줄러 동작 관찰하기

**① 로그 레벨을 높여 Filter/Score 로그 보기**

```bash
docker exec k8s-guide-control-plane bash -c \
  "sed -i 's/- --v=2/- --v=4/' /etc/kubernetes/manifests/kube-scheduler.yaml"

sleep 20
kubectl logs -n kube-system kube-scheduler-k8s-guide-control-plane -f &
```

다른 터미널에서 Pod를 생성한다.

```bash
kubectl run sched-demo --image=nginx:alpine
```

**로그에서 각 노드에 대한 Filter 결과와 Score 결과를 확인한다.** 완료 후 원복한다.

```bash
docker exec k8s-guide-control-plane bash -c \
  "sed -i 's/- --v=4/- --v=2/' /etc/kubernetes/manifests/kube-scheduler.yaml"
kill %1 2>/dev/null
```

**② PriorityClass와 선점 관찰**

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: low-priority-demo
value: 100
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority-demo
value: 900000
```

```bash
kubectl apply -f priority-classes.yaml
```

노드 자원을 거의 채우는 낮은 우선순위 Pod들을 먼저 배치한다.

```bash
kubectl run filler --image=nginx:alpine --replicas=1 \
  --overrides='{"spec":{"priorityClassName":"low-priority-demo","containers":[{"name":"filler","image":"nginx:alpine","resources":{"requests":{"cpu":"1500m","memory":"512Mi"}}}]}}' 2>/dev/null || \
kubectl run filler --image=nginx:alpine \
  --overrides='{"spec":{"priorityClassName":"low-priority-demo","containers":[{"name":"filler","image":"nginx:alpine","resources":{"requests":{"cpu":"1500m","memory":"512Mi"}}}]}}'
```

자원이 부족한 상태에서 높은 우선순위 Pod를 넣는다.

```bash
kubectl run urgent --image=nginx:alpine \
  --overrides='{"spec":{"priorityClassName":"high-priority-demo","containers":[{"name":"urgent","image":"nginx:alpine","resources":{"requests":{"cpu":"1500m","memory":"512Mi"}}}]}}'
```

```bash
kubectl get events --field-selector reason=Preempted
kubectl get pods -o wide
```

**`filler` Pod가 축출되고 `urgent` Pod가 그 자리에 배치되는 것을 확인한다.**

**③ 존재하지 않는 schedulerName으로 Pending 관찰**

```bash
kubectl run ghost-scheduled --image=nginx:alpine \
  --overrides='{"spec":{"schedulerName":"no-such-scheduler"}}'
```

```bash
kubectl get pod ghost-scheduled
# STATUS: Pending (계속 유지됨)
kubectl describe pod ghost-scheduled | tail -15
kubectl get events --field-selector involvedObject.name=ghost-scheduled
```

**Events 항목에 스케줄링 시도 자체가 없는 것**(FailedScheduling 이벤트조차 없음)을 확인한다 — 어떤 스케줄러도 이 Pod를 담당하지 않기 때문이다.

**④ 정리**

```bash
kubectl delete pod sched-demo filler urgent ghost-scheduled --ignore-not-found
kubectl delete priorityclass low-priority-demo high-priority-demo
```

---

## 실습 과제

**과제 1 — Filter 탈락 사유 추적**
CPU 요청이 클러스터 총 allocatable보다 큰 Pod를 만들고, `kubectl describe pod`의 Events에 나오는 `FailedScheduling` 메시지에서 어떤 Filter 플러그인이 몇 개 노드를 탈락시켰는지 확인한다.

**과제 2 — PodTopologySpread 스큐 실험**
`maxSkew: 1`, `whenUnsatisfiable: DoNotSchedule`로 topologySpreadConstraints를 설정한 Deployment를 replicas 6으로 만들고(단일 노드 kind 클러스터이므로 `topologyKey`를 `kubernetes.io/hostname`으로 바꿔 워커 노드 3개 사이의 분산을 관찰), 각 노드에 몇 개씩 배치되는지 기록한다. `maxSkew`를 2, 3으로 바꿔 가며 분산 정도가 어떻게 달라지는지 비교한다.

**과제 3 — nominatedNodeName 관찰**
선점이 일어나는 순간 `kubectl get pod <new-pod> -o yaml -w`로 `status.nominatedNodeName`이 언제 채워지고, `spec.nodeName`이 언제 채워지는지 시간 차이를 관찰한다.

**과제 4 — preemptionPolicy: Never 비교**
과제 2의 높은 우선순위 PriorityClass에 `preemptionPolicy: Never`를 추가하고 같은 시나리오를 재현해, 이번에는 선점이 일어나지 않고 새 Pod가 Pending으로 남는 것을 확인한다.

**과제 5 — percentageOfNodesToScore 설정 실습**
`KubeSchedulerConfiguration`에 `percentageOfNodesToScore: 10`을 설정한 커스텀 스케줄러 설정 파일을 작성해 보고(실제 클러스터 크기가 작아 효과는 미미하더라도), 이 값이 대규모 클러스터에서 어떤 지표(`scheduling_duration_seconds`)에 영향을 줄지 예상해 적는다.

---

## 요약

- kube-scheduler는 **스케줄링 프레임워크** 위에서 동작한다. 확장점은 **QueueSort → PreFilter → Filter → PostFilter → PreScore → Score → Reserve → Permit → PreBind → Bind → PostBind** 순서로 이어지며, 앞쪽(Filter까지)은 스케줄링 사이클, 뒤쪽(Reserve부터)은 바인딩 사이클로 나뉜다.
- 스케줄링 대상 Pod는 **activeQ(대기) → backoffQ(일시적 실패, 지수 백오프) 또는 unschedulablePods(구조적 실패, 이벤트 기반 재큐잉)** 사이를 오간다. 백오프는 헛된 재시도로 인한 CPU 낭비를 줄인다.
- **NodeResourcesFit**은 requests(limits 아님) 기준으로 Filter/Score를 수행하고, **PodTopologySpread**는 `skew = 도메인별 개수 - 최솟값`으로 분산을 강제하거나 유도한다. **InterPodAffinity**는 기존 Pod 수에 비례해 계산 비용이 커진다.
- **선점**은 Filter를 모두 통과하지 못했을 때 우선순위가 낮은 Pod들 중 **최소한의 희생**으로 새 Pod가 들어갈 자리를 만드는 절차다. 동급 이상의 Pod는 절대 희생되지 않고, `preemptionPolicy: Never`는 선점 자체를 포기한다.
- **`percentageOfNodesToScore`**는 대규모 클러스터에서 모든 노드를 채점하는 대신 충분한 후보가 모이면 순회를 멈춰 **처리량과 배치 최적성을 트레이드오프**한다.
- `schedulerName`으로 **여러 스케줄러를 병행 운영**할 수 있다. 이름에 대응하는 스케줄러가 없으면 Pod는 조용히 Pending 상태로 남는다 — Volcano, Kueue 같은 배치 스케줄러가 이 메커니즘을 이용한다.

**다음 장에서는** kube-scheduler가 만든 `Binding` 이후, 나머지 모든 컨트롤러들이 공유하는 공통 패턴 — Informer, 워크큐, 조정 루프, 리더 선출, 가비지 컬렉터 — 을 깊게 파헤친다.
