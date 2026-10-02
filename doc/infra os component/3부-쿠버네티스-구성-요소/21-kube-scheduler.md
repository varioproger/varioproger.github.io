---
title: "21장. kube-scheduler"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 21
---

# 21장. kube-scheduler

> **🎮 게임 서버 개발자에게** — 스케줄러는 게임 서버로 치면 **새 방(룸) 하나를 어느 게임 서버 머신에 올릴지 정하는 방 배정기**다. 머신들의 남은 CPU·메모리를 보고, 불가능한 머신을 걸러 내고(Filter), 남은 후보에 점수를 매겨(Score) 가장 좋은 곳에 배정한다. 중요한 한 가지는 **배정만 하고 실행은 하지 않는다**는 점이다. 방을 실제로 띄우는 일은 그 머신의 에이전트(kubelet)가 한다. 그리고 판단의 근거가 되는 숫자는 실제 사용량이 아니라 **Pod가 선언한 `requests`**다. 이 한 가지를 오해하면 "노드는 한가한데 Pod가 Pending"이라는 상황을 설명하지 못한다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 새 게임 서버 Pod가 `Pending`이고 이벤트에 `0/5 nodes are available: ...`이 찍혔는데 읽는 법을 모른다.
> - GPU 노드나 전용 노드 풀에 특정 Pod만 올리고 싶은데 테인트만 걸었더니 엉뚱한 노드에도 올라간다.
> - 존(AZ) 하나가 죽어도 게임 서버가 고르게 분산되어 살아남게 하고 싶다.

## 코어 — 이것만은 100%

> **한 문장:** kube-scheduler는 `nodeName`이 빈 Pod를 watch해 **Filter(가능/불가능) → Score(0&#126;100점)** 로 최적 노드를 골라 Binding을 기록하는 컨트롤러이며, 판단 기준은 실제 사용량이 아니라 `requests`다.

1. **Filter → Score → Bind** — 불가능한 노드를 제거하고 남은 노드에 점수를 매겨 최고점(동점은 무작위)을 고른다. 스케줄러의 일은 Binding으로 `spec.nodeName`을 채우는 순간 끝난다.
2. **requests가 기준이다** — `NodeResourcesFit`은 Pod `requests` 합을 노드 `allocatable`과 비교한다. limits는 스케줄링에 쓰이지 않고 실행 시점에 cgroup이 강제한다([25장](25-Pod-생명주기와-리소스.md)).
3. **실패한 Pod는 세 큐를 오간다** — activeQ(대기) → backoffQ(일시 실패, 지수 백오프) 또는 unschedulablePods(구조적 실패, 클러스터 이벤트가 있어야 재시도).
4. **배치 제어 도구는 방향이 다르다** — 어피니티/토폴로지 분산은 Pod가 고르고, 테인트는 노드가 거부한다. 톨러레이션은 허가일 뿐 지시가 아니다.
5. **우선순위와 선점** — Filter에서 전멸하면 낮은 우선순위 Pod를 최소한만 밀어내 자리를 만든다. 동급 이상은 희생되지 않는다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 방 생성 시 서버 머신 선택(남은 슬롯, 지역, 부하) | Filter + Score | 불가능한 후보를 거르고 점수로 순위를 매긴다 | 점수는 **현재 실제 부하**가 아니라 선언된 `requests` 합 기준이다. 노드가 한가해도 requests가 다 차 있으면 Pending이다 |
| 메모리 풀에 슬롯을 먼저 예약(reserve)하고 나중에 commit | Reserve → Bind | 경합 방지를 위해 먼저 가예약 | 스케줄링 사이클은 Pod 하나씩 순차 처리, 바인딩은 여러 개 동시 진행될 수 있다 |
| 접속 대기열 + 재시도 백오프 | activeQ / backoffQ / unschedulablePods | 실패한 요청을 지수 백오프로 재시도 | "구조적으로 안 되는 Pod"는 타이머가 아니라 **클러스터 이벤트(노드 추가, 자원 해제)** 가 있어야 재시도된다 |
| 우선순위 큐에서 낮은 우선순위 작업을 쫓아내기 | 선점(preemption) | 중요한 작업이 자리를 얻으면 덜 중요한 작업이 밀린다 | 희생 Pod는 즉시 kill이 아니라 `terminationGracePeriodSeconds`를 지키며 종료되고, 같거나 높은 우선순위는 절대 희생되지 않는다 |
| 전용 서버에 접속 화이트리스트(방화벽) + 클라이언트 라우팅 규칙 | 테인트(노드 거부) + 어피니티(Pod 유도) | 둘이 합쳐져야 "전용"이 된다 | 방화벽만 있으면 허가받은 클라이언트가 **일반 서버에도** 갈 수 있다. 톨러레이션은 허가이지 지시가 아니다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 노드 CPU 사용률이 20%인데 새 Pod가 `Insufficient cpu`로 Pending일 수 있을까?
> 2. 스케줄러가 죽으면 이미 떠 있는 Pod도 영향을 받을까?
> 3. GPU 노드에 테인트를 걸고 GPU Pod에 톨러레이션만 주면 충분할까?
> 4. 우선순위가 높은 Pod가 뜨려고 낮은 Pod를 죽일 때, 아무 Pod나 죽일까?
>
> **처리법:** 🛠 실습 `kubectl describe pod <pending>`의 FailedScheduling 읽기, `kubectl describe node | grep -A6 "Allocated resources"`, `kubectl taint nodes ...` → 바로 실행 · 🗺 관계도 스케줄링 사이클(Filter→Score)과 세 큐 이동도 · 📦 카드로 FailedScheduling 메시지 → 원인 표, 테인트 effect 3종, 우선순위 체계

### 이 장에서 배우는 것

- 스케줄링 프레임워크의 확장점 파이프라인과 Filter/Score의 역할
- Pod가 세 개의 큐를 오가는 방식과 백오프의 이유
- NodeResourcesFit, NodeAffinity, 테인트·톨러레이션, 토폴로지 분산 제약
- PriorityClass와 선점의 규칙
- `percentageOfNodesToScore`, 다중 스케줄러, Pending 진단

---

## 코어 1. Filter → Score → Bind

### 1.1 하는 일 한 문장

**한 줄 요약:** nodeName이 빈 Pod를 watch → 후보 노드를 필터링·점수화 → 최고점 노드에 대해 Binding 생성.

kube-scheduler도 결국 하나의 컨트롤러다([22장](22-컨트롤러-매니저.md)의 Informer/워크큐 패턴을 그대로 쓴다). 조정 대상이 "nodeName이 빈 Pod에 노드 하나를 배정하는 것"일 뿐이다. 배치 이후 상태를 감시하지 않고, 실행도 하지 않는다([18장](18-클러스터-아키텍처-총론.md)).

### 1.2 확장점 파이프라인

**한 줄 요약:** 스케줄링 사이클(Pod당 순차) 뒤에 바인딩 사이클(동시 가능)이 이어진다.

```
Pod가 스케줄링 큐에서 나옴
스케줄링 사이클 (동기, Pod당 1개씩)
  QueueSort  → 큐 정렬 (기본: 우선순위 높은 순 → 큐 진입 시각 순)
  PreFilter  → Pod 전체에 대한 사전 계산/검증
  Filter     → 노드마다 "배치 가능한가?" (병렬) → 통과한 노드만 남음
  PostFilter → Filter 통과 노드가 0개일 때만: 선점 시도
  PreScore   → 점수 계산 전 공통 상태 준비
  Score      → 통과한 노드마다 0~100점, 여러 플러그인의 가중합
  최고점 노드 선택 (동점이면 무작위)
바인딩 사이클 (비동기 가능)
  Reserve    → 선택된 노드에 리소스 가예약 (다른 Pod와 경합 방지)
  Permit     → 바인딩 허가/보류/거부
  PreBind    → 바인딩 직전 준비 (예: 볼륨 attach 대기)
  Bind       → Binding 오브젝트를 API 서버에 생성 → Pod.spec.nodeName 채워짐
  PostBind   → 정리/알림
```

- **Filter**는 가능/불가능의 이진 판단(요청 CPU가 노드에 없으면 탈락), **Score**는 가능한 후보 중 상대 평가다.
- PreFilter/PreScore는 노드마다 반복할 계산을 한 번만 해서 `CycleState`에 저장하는 캐싱 최적화다.
- 바인딩이 별도 사이클인 이유는 시간이 걸릴 수 있기 때문이다(예: 볼륨 대기). 한 Pod의 볼륨이 오래 걸려도 다른 Pod의 스케줄링이 막히지 않는다.

Filter에서 전멸하면 Pod는 `Pending`이 되고 이벤트에 이유가 남는다.

```
Warning  FailedScheduling  0/5 nodes are available:
  2 Insufficient cpu,
  1 node(s) had untolerated taint {gpu: true},
  2 node(s) didn't match Pod's node affinity/selector.
```

각 숫자가 "어떤 이유로 몇 개 노드가 제외됐는가"이며, 이 메시지를 읽는 법이 진단의 핵심이다.

### 1.3 NodeResourcesFit: requests vs allocatable

**한 줄 요약:** 스케줄링 판단에는 limits가 아니라 requests만 쓰인다.

```
노드 allocatable:        CPU 3800m,  메모리 7Gi
이미 스케줄된 Pod 합계:    CPU 2000m,  메모리 4Gi
남은 여유:                CPU 1800m,  메모리 3Gi

새 Pod 요청: CPU 500m,  메모리 1Gi → 통과
새 Pod 요청: CPU 2000m, 메모리 1Gi → 탈락 (CPU 부족)
```

```bash
kubectl describe node <node> | grep -A6 "Allocated resources"
```

`allocatable`은 kubelet이 예약분을 뺀 할당 가능 용량이다. limits는 kubelet이 실행 시점에 cgroup으로 강제하는 상한이고, 스케줄러는 requests 합만 본다. 그래서 노드가 requests 합보다 실제로 더 많이 쓰다가 메모리 압박에 빠질 수 있다. Score 단계에서는 `LeastAllocated`(여유가 많은 노드 선호, 부하 분산)와 `MostAllocated`(꽉 채우는 노드 선호, 빈 노드를 줄여 오토스케일러가 축소하기 쉬움)를 `scoringStrategy`로 고른다.

노드의 Pod 수 상한도 Filter에 걸린다(`Too many pods`, 기본 110).

## 코어 2. 세 개의 큐

### 2.1 activeQ, backoffQ, unschedulablePods

**한 줄 요약:** 실패한 Pod를 "곧 될 것 같으면 백오프로, 안 될 구조면 보류 풀에서 이벤트를 기다리게" 나눠 헛된 재시도를 줄인다.

```
새 Pod 감지 → activeQ (우선순위 힙, QueueSort 기준)
   Pop → 스케줄링 사이클
      성공 → 바인딩 사이클
      실패 → 일시적(자원 부족 등)   → backoffQ (지수 백오프: 1초→2초→4초...) → activeQ 재진입
           → 구조적(매칭 노드 없음) → unschedulablePods
                                     → 클러스터 이벤트(노드 추가, 자원 해제, 라벨 변경) → activeQ 재진입
```

- 매번 즉시 재시도하면 실패할 게 뻔한 재시도가 CPU를 태운다. 백오프가 간격을 늘리되 완전히 멈추지는 않는다. 다른 Pod가 삭제되어 자원이 풀릴 수 있기 때문이다.
- **이벤트 기반 재큐잉**이 핵심 최적화다. 노드 추가 같은 이벤트가 오면 그 이벤트와 관련 있을 법한 Pod만 activeQ로 옮긴다.

```bash
kubectl get --raw /metrics | grep scheduler_pending_pods
# scheduler_pending_pods{queue="active"} / {queue="backoff"} / {queue="unschedulable"}
```

`unschedulable` 큐에 오래 머무는 Pod가 많으면 자원 부족이나 제약 조건 불일치(어피니티, 테인트)를 의심한다.

## 코어 3. 배치 제어: 어피니티, 테인트, 토폴로지 분산

### 3.1 노드 어피니티

**한 줄 요약:** `required`는 Filter(강제), `preferred`는 Score(가점)이며 `IgnoredDuringExecution`이라 이미 뜬 Pod는 쫓겨나지 않는다.

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:     # Filter: 안 맞으면 탈락
      nodeSelectorTerms:
        - matchExpressions:
            - { key: disktype, operator: In, values: ["ssd"] }
    preferredDuringSchedulingIgnoredDuringExecution:    # Score: 맞으면 가점
      - weight: 80
        preference:
          matchExpressions:
            - { key: zone, operator: In, values: ["us-east-1a"] }
```

조건은 스케줄링 시점에만 평가된다. 이후 노드 라벨이 바뀌어 조건이 깨져도 Pod는 축출되지 않는다(필요하면 별도 컴포넌트 Descheduler). Pod 어피니티/안티어피니티는 다른 Pod의 위치를 기준으로 하며, `topologyKey`가 "같은 곳"의 정의(`kubernetes.io/hostname` = 같은 노드, `topology.kubernetes.io/zone` = 같은 AZ)를 정한다. 계산 비용이 기존 Pod 수에도 비례해, 대규모 클러스터에서 남용하면 스케줄링 지연이 커진다. 고가용성 분산에는 `preferred`를 쓴다. `required`는 replicas가 노드 수보다 많으면 일부가 영원히 Pending이다.

### 3.2 테인트와 톨러레이션

**한 줄 요약:** 테인트는 노드가 Pod를 거부하는 것이고, 톨러레이션은 "견딜 수 있다"는 허가이지 그 노드로 가라는 지시가 아니다.

| effect | 동작 |
|---|---|
| `NoSchedule` | 톨러레이션 없는 Pod는 새로 배치되지 않음. 기존 Pod는 유지 |
| `PreferNoSchedule` | 가능하면 피하지만 다른 곳이 없으면 배치(Score 단계) |
| `NoExecute` | 기존 Pod도 축출 |

```bash
kubectl taint nodes node-1 gpu=true:NoSchedule      # 추가
kubectl taint nodes node-1 gpu=true:NoSchedule-     # 제거 (끝에 하이픈)
```

> **⚠️ 톨러레이션만으로는 부족하다.** GPU 노드에 테인트를 걸고 GPU Pod에 톨러레이션을 주면 그 Pod가 GPU 노드에 **갈 수 있게** 될 뿐 일반 노드에도 갈 수 있다. 전용 노드 풀은 **테인트(다른 Pod를 막는다) + 라벨·nodeAffinity(이 Pod를 유도한다)** 를 함께 써야 한다.

내장 테인트(`not-ready`, `unreachable`, `memory-pressure`, `disk-pressure`, `pid-pressure`, `unschedulable`(cordon), `control-plane` 등)가 자동으로 붙는다. 모든 Pod에는 `not-ready`/`unreachable` `NoExecute` 톨러레이션이 `tolerationSeconds: 300`으로 자동 추가되어, **노드 장애 시 Pod가 5분 후에 옮겨지는** 이유가 된다. 짧게 줄이면 빠른 페일오버가 되지만 일시적 문제에도 대량 이동하여 불안정해질 수 있다.

### 3.3 토폴로지 분산 제약

**한 줄 요약:** `maxSkew`로 도메인 간 Pod 수 편차를 명시적으로 제어한다.

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule      # Filter로 강제 (ScheduleAnyway면 Score로 완화)
    labelSelector:
      matchLabels: { app: web }
```

```
skew = (해당 도메인의 매칭 Pod 수) - (모든 도메인 중 최솟값)
maxSkew:1, replicas:6, AZ 3개 → 2,2,2 가능 / 3,2,1 불가(편차 2)
zone-a 3개, zone-b 1개일 때 zone-a에 놓으면 skew 4-1=3 → 탈락, zone-b에 놓으면 2-1=1
```

안티어피니티로는 "균등" 분산이 안 된다(`preferred`로도 4,1,1이 될 수 있다). `DoNotSchedule`은 AZ 하나가 장애일 때 새 Pod가 아예 안 뜰 수 있으므로 노드/AZ 분산은 `ScheduleAnyway`가 안전하다는 것이 원문의 권장이다.

## 코어 4. 우선순위와 선점

### 4.1 PriorityClass와 선점 규칙

**한 줄 요약:** Filter에서 모든 노드가 탈락하면 낮은 우선순위 Pod를 최소한만 밀어내 자리를 만든다.

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority   # 또는 Never
```

`value`는 activeQ 정렬(QueueSort)과 선점 대상 판단에 쓰인다. 내장 `system-cluster-critical`, `system-node-critical`은 시스템 컴포넌트용이므로 일반 워크로드에 쓰면 안 된다.

```
PostFilter(DefaultPreemption):
 ① 노드의 Pod 중 새 Pod보다 우선순위가 "낮은" 것만 후보
 ② 낮은 순으로 제거했다고 가정하며 새 Pod가 들어가는지 시뮬레이션
 ③ 가장 적은 희생으로 가능한 노드 선택
 → 희생 Pod에 graceful termination 후 삭제
 → 새 Pod에는 status.nominatedNodeName만 기록 (확정이 아니라 "예약 후보")
 → 희생 Pod가 실제 종료된 뒤 다음 사이클에서 정식 배치
```

- **같거나 높은 우선순위의 Pod는 절대 선점되지 않는다.**
- `preemptionPolicy: Never`는 높은 우선순위를 가져도 선점하지 않고 줄만 선다(배치성 워크로드용).
- 희생 Pod는 `terminationGracePeriodSeconds`를 존중하므로 새 Pod 배치가 그만큼 지연된다.
- 선점당한 Pod는 `Reason: Preempted`이며 컨트롤러가 다시 만들어 준다.

> **⚠️ PriorityClass 남용** 모두가 high를 쓰면 의미가 없어지고, 저우선순위가 계속 선점당해 기아(starvation)에 빠진다. 대책은 PriorityClass 생성 권한 제한(RBAC), ResourceQuota `scopeSelector`, `preemptionPolicy: Never`, PodDisruptionBudget(선점도 최선 노력으로만 존중)이다.

## 코어 5. 성능, 다중 스케줄러, Pending 진단

### 5.1 percentageOfNodesToScore

**한 줄 요약:** 충분한 후보가 모이면 나머지 노드는 평가하지 않아 처리량을 얻고, 최적 노드를 놓칠 확률을 감수한다.

노드가 수천 개면 매 Pod마다 전부 채점하는 지연이 노드 수에 비례해 커진다. 예를 들어 노드 100대에 `percentageOfNodesToScore: 50`이면 Filter 통과 노드가 50대에 도달할 때 순회를 멈추고 그 안에서 Score를 한다. 순회 시작 지점을 매번 바꿔 특정 노드 그룹만 배제되는 편향을 막는다. 기본값은 노드 수에 따라 자동 결정된다(작으면 100%에 가깝게). "항상 최적"이 아니라 "충분히 좋은 노드를 빠르게"이다. 핵심 메트릭은 `scheduler_scheduling_duration_seconds`, `scheduler_pod_scheduling_attempts`(높으면 자원 경합), `scheduler_pending_pods`, `scheduler_preemption_attempts_total`(급증 시 우선순위 설계·용량 재검토)이다.

### 5.2 다중 스케줄러

**한 줄 요약:** `spec.schedulerName`은 검증되지 않는 문자열이라 담당 스케줄러가 없으면 Pod는 조용히 영원히 Pending이다.

기본 `default-scheduler` 외에 다른 이름의 스케줄러를 띄우고 Pod가 `schedulerName`으로 지정한다. 해당 이름의 스케줄러가 없으면 어떤 스케줄러도 그 Pod를 집어가지 않아 `FailedScheduling` 이벤트조차 없이 Pending으로 남는다. 실전에서는 갱 스케줄링(여러 Pod를 원자적으로 함께 배치)이 필요한 배치·AI 워크로드에 Volcano, Kueue 등이 이 메커니즘으로 끼어든다. 시간이 지나 배치가 최적에서 멀어지면 Descheduler가 조건에 맞지 않는 Pod를 축출해 재배치를 유도한다(PDB를 설정하고 신중히 도입).

### 5.3 FailedScheduling 메시지 해독

**한 줄 요약:** `describe pod`의 Events가 첫 진단이고, 메시지의 사유별 대응이 정해져 있다.

```bash
kubectl describe pod <pod> | grep -A10 Events
kubectl describe node <node> | grep -A15 "Allocated resources"
kubectl logs -n kube-system -l component=kube-scheduler --tail=100
```

| 메시지 | 원인 | 대응 |
|---|---|---|
| `Insufficient cpu/memory` | requests를 만족할 여유 없음 | requests 낮추기, 노드 추가 |
| `had untolerated taint {k: v}` | 테인트에 막힘 | toleration 추가 |
| `didn't match Pod's node affinity/selector` | 어피니티 불만족 | 노드 라벨 확인 |
| `had volume node affinity conflict` | 볼륨 AZ 불일치 | `WaitForFirstConsumer` ([29장](29-스토리지.md)) |
| `didn't match pod anti-affinity rules` | 안티어피니티 충돌 | `required` → `preferred` |
| `unschedulable` | cordon 상태 | `kubectl uncordon` |
| `Too many pods` | 노드의 Pod 수 상한(기본 110) | 노드 추가, `maxPods` 조정 |

## 실무 적용

### 체크리스트

- [ ] 모든 컨테이너에 `requests`를 명시했다(스케줄링은 requests 합 기준이라는 점을 안다).
- [ ] Pending Pod는 `kubectl describe pod`의 `FailedScheduling` 메시지 숫자를 읽고 원인별로 대응한다.
- [ ] 전용 노드 풀은 테인트와 nodeAffinity(또는 nodeSelector)를 함께 적용한다.
- [ ] 고가용성 분산은 `topologySpreadConstraints`(`maxSkew`)나 `preferred` 안티어피니티를 쓰고, `required` 때문에 replicas가 Pending이 되지 않는지 확인했다.
- [ ] PriorityClass 체계(critical/high/normal/low/batch)를 정하고 생성 권한과 사용량을 제한했다. 시스템용 `system-*`는 쓰지 않았다.
- [ ] 노드 장애 시 Pod 이동 지연(기본 `tolerationSeconds: 300`)이 서비스 요구에 맞는지 점검했다.
- [ ] `schedulerName`을 지정한 Pod가 있다면 해당 스케줄러가 실제로 실행 중이다.
- [ ] `scheduler_pending_pods`, `scheduler_pod_scheduling_attempts`를 모니터링에 넣었다.

### 시나리오로 확인하기

1. **상황:** 노드 CPU 사용률은 모두 30%대인데 새 게임 서버 Pod가 `0/5 nodes are available: 5 Insufficient cpu`로 Pending이다.
   **질문:** 왜 이런 일이 생기며 어떻게 대응하나?

   <details markdown="1"><summary>답 확인</summary>

   스케줄러는 실제 사용량이 아니라 Pod가 선언한 `requests`의 합을 노드 `allocatable`과 비교한다. 기존 Pod들의 requests가 과대 설정돼 합이 allocatable을 채웠다면 실제 사용률이 낮아도 Filter에서 탈락한다. `kubectl describe node`의 Allocated resources를 확인해 requests를 현실에 맞게 낮추거나 노드를 추가한다. → 코어 1

   </details>

2. **상황:** GPU 노드에 `gpu=true:NoSchedule` 테인트를 걸고 GPU 게임 서버 Pod에 톨러레이션을 추가했다. 그런데 일부 Pod가 일반 노드에 올라갔다.
   **질문:** 왜인가, 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   톨러레이션은 "테인트를 견딜 수 있다"는 허가이지 그 노드로 가라는 지시가 아니다. 일반 노드에도 갈 수 있다. GPU 노드에 라벨을 붙이고 Pod에 `requiredDuringScheduling` nodeAffinity(또는 nodeSelector)를 더해 유도한다. 테인트는 다른 Pod를 막고, 어피니티는 이 Pod를 유도한다. → 코어 3

   </details>

3. **상황:** 스케줄러를 점검하려고 중지했다. 그동안 새 Deployment를 만들었다.
   **질문:** 기존 Pod와 새 Pod는 어떻게 되나?

   <details markdown="1"><summary>답 확인</summary>

   기존 Pod는 이미 kubelet이 실행 중이라 영향이 없다. 새 Pod는 오브젝트로 생기지만 `nodeName`이 비어 `Pending`으로 남는다. 스케줄러를 되살리면 nodeName 빈 Pod를 다시 관찰해 즉시 배치한다. 스케줄러는 배정만 할 뿐 실행하지 않기 때문이다. → 코어 1

   </details>

4. **상황:** 낮은 우선순위 배치 Pod가 가득 찬 노드에 높은 우선순위 Pod가 들어오자 일부 배치 Pod가 사라지고 `Reason: Preempted`가 보였다. 동급 우선순위 Pod는 영향이 없었다.
   **질문:** 선점은 어떤 규칙으로 일어났나?

   <details markdown="1"><summary>답 확인</summary>

   Filter에서 모든 노드가 탈락하자 PostFilter의 선점이 동작했다. 새 Pod보다 낮은 우선순위의 Pod만 후보로 삼아 가장 적은 희생으로 자리가 나는 노드를 골랐고, 희생 Pod는 graceful termination 후 삭제됐다. 새 Pod는 `nominatedNodeName`만 기록한 뒤 희생 Pod가 종료되면 정식 배치된다. 동급 이상은 절대 희생되지 않는다. 배치 Pod의 재시작이 이어지는 기아가 걱정되면 `preemptionPolicy: Never`나 ResourceQuota `scopeSelector`로 제한한다. → 코어 4

   </details>

---

📖 출처: `Kubernetes_Internals_Network_Guide/01-내부-아키텍처/04-kube-scheduler-내부.md`, `kubernetes-textbook-main/04-클러스터-운영/15-고급-스케줄링.md`

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] watch(nodeName ____) → ____(가능/불가능) → ____(0~100) → 최고점(동점 ____) → ____
         사이클: 스케줄링(순차) = QueueSort/PreFilter/Filter/PostFilter/PreScore/Score
                 바인딩(동시) = ____ / Permit / PreBind / Bind / PostBind
         판단 기준: ____ vs 노드 ____ (limits 아님)

[코어 2] activeQ → 실패 → 일시적: ____ (지수 백오프) / 구조적: ____ (이벤트 대기)

[코어 3] required = ____ , preferred = ____ ; IgnoredDuringExecution = ____
         테인트 effect: NoSchedule / ____ / ____ ; 톨러레이션 = ____ (지시 X)
         skew = 도메인 Pod 수 - ____ ; DoNotSchedule = ____ , ScheduleAnyway = ____

[코어 4] Filter 전멸 → ____ → 낮은 우선순위 중 ____ 희생 → nominatedNodeName
         절대 희생 안 되는 것: ____ ; Never = ____

[코어 5] percentageOfNodesToScore = ____ vs 최적성 ; schedulerName 없음 → ____
```

### 2. 인출 질문

1. 스케줄러가 하는 일과 하지 않는 일은?

   <details markdown="1"><summary>답 확인</summary>

   nodeName이 빈 Pod를 watch해 Filter/Score로 노드를 골라 Binding을 만든다. Pod를 직접 실행하지 않고(kubelet의 일), 배치 후 상태를 감시하지 않으며, 실행 중 리소스 초과를 강제하지 않는다(kubelet과 커널의 몫). → 코어 1

   </details>

2. Filter와 Score의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   Filter는 "이 노드에 배치 가능한가"의 이진 판단으로 불가능하면 탈락시키고, Score는 통과한 후보에 0&#126;100점을 부여해 상대 평가한다. 여러 Score 플러그인의 가중합 최고점이 선택되고 동점이면 무작위다. → 코어 1.2

   </details>

3. 스케줄링이 requests 기준이라는 것의 함정은?

   <details markdown="1"><summary>답 확인</summary>

   실제 사용량이 낮아도 requests 합이 allocatable을 채우면 Pending이 된다(`Insufficient cpu`). 반대로 limits를 requests보다 높게 설정하면 노드의 실제 사용이 requests 합을 넘어 메모리 압박에 빠질 수 있다. limits는 kubelet이 실행 시 cgroup으로 강제한다. → 코어 1.3

   </details>

4. backoffQ와 unschedulablePods는 어떻게 다르고, 왜 나눴나?

   <details markdown="1"><summary>답 확인</summary>

   backoffQ는 곧 재시도하면 성공할 수 있는 일시적 실패 Pod가 지수 백오프로 대기하는 큐이고, unschedulablePods는 당장 재시도가 무의미한 구조적 실패 Pod가 노드 추가·자원 해제 같은 클러스터 이벤트가 올 때까지 머무는 보류 풀이다. 헛된 재시도로 인한 CPU 낭비를 줄이기 위해서다. → 코어 2

   </details>

5. 테인트와 톨러레이션, 어피니티의 관계를 전용 GPU 풀 구성으로 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   노드에 테인트(`workload=gpu:NoSchedule`)와 라벨을 함께 붙여 다른 Pod를 막고, GPU Pod에는 톨러레이션(허가)과 nodeAffinity(유도)를 모두 준다. 톨러레이션만 주면 일반 노드에도 갈 수 있다. → 코어 3.2

   </details>

6. `maxSkew: 1`, replicas 6, AZ 3개에서 허용되는 분포와 허용되지 않는 분포는?

   <details markdown="1"><summary>답 확인</summary>

   2,2,2는 편차 0으로 허용, 3,2,1은 편차 2라 `DoNotSchedule`에서는 허용되지 않는다. skew는 해당 도메인의 Pod 수에서 모든 도메인 중 최솟값을 뺀 값이다. `ScheduleAnyway`는 강제 대신 가점만 준다. → 코어 3.3

   </details>

7. 선점이 희생 Pod를 고르는 규칙과 `nominatedNodeName`의 의미는?

   <details markdown="1"><summary>답 확인</summary>

   새 Pod보다 우선순위가 낮은 Pod만 후보로 삼아 가장 적은 희생으로 새 Pod가 들어가는 노드를 고른다. 동급 이상은 희생되지 않는다. `nominatedNodeName`은 확정이 아닌 예약 후보 표시이며 희생 Pod가 실제 종료된 뒤 다음 사이클에서 정식 배치된다. → 코어 4

   </details>

8. 존재하지 않는 `schedulerName`을 지정하면 어떻게 되고, 이벤트에는 무엇이 보이는가?

   <details markdown="1"><summary>답 확인</summary>

   `schedulerName`은 검증되지 않는 문자열이라 담당 스케줄러가 없으면 어떤 스케줄러도 그 Pod를 집어가지 않아 영원히 Pending이고, `FailedScheduling` 이벤트조차 생기지 않는다. → 코어 5.2

   </details>

### 3. 기억 고리

- **C++ 유추:** 방 배정기(남은 슬롯 필터링 후 점수 매기기) = Filter → Score ⚠️ 점수의 근거는 실시간 부하가 아니라 선언된 `requests`다.
- **C++ 유추:** 접속 대기열 재시도 백오프 = backoffQ ⚠️ 구조적 실패는 시간이 아니라 **클러스터 이벤트**가 재시도의 열쇠다.
- **비유:** 테인트·톨러레이션 = VIP 라운지 입장 제한. 라운지(노드)가 입장권 없는 손님을 막고(테인트), 입장권(톨러레이션)은 들어갈 자격만 줄 뿐 라운지로 안내해 주지는 않는다(어피니티가 안내). ⚠️ 비유가 깨지는 지점: `NoExecute`는 이미 안에 있는 손님도 내보낸다.
- **묶음(3):** 스케줄러 3큐(active/backoff/unschedulable) / 테인트 effect 3종 / 선점 규칙(낮은 것만, 최소 희생, 동급 불가).
- **대칭:** Filter(탈락) ↔ Score(가점), required ↔ preferred, 테인트(노드가 거부) ↔ 어피니티(Pod가 선택), `MostAllocated`(빈 노드를 만들어 비용 절감) ↔ `LeastAllocated`(분산).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "Pod 하나가 Pending에서 노드에 배정되기까지 스케줄러 내부에서 일어나는 일"을 처음 듣는 사람에게 설명해 보세요. 막히는 단계 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "노드는 한가한데 Pod가 `Insufficient cpu`로 Pending인 이유"를 requests와 실제 부하의 차이로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "requests를 크게 잡아 안전하게 배치하자" vs B "requests를 실제 사용량에 맞춰 낮게 잡자" — 양쪽을 번갈아 변호해 보세요. (Pending, 비용, 메모리 압박, QoS를 근거로)
- **AI 역할 반전:** "내가 테인트·톨러레이션·어피니티를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
