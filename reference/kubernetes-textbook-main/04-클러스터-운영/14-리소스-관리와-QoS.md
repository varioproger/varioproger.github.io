# 14장. 리소스 관리와 QoS

> **학습목표**
> - requests와 limits가 각각 스케줄링과 런타임에 미치는 영향을 구분할 수 있다.
> - 세 가지 QoS 클래스가 어떻게 결정되고 축출 순서에 어떤 영향을 주는지 안다.
> - CPU 스로틀링과 메모리 OOM의 비대칭성을 커널 수준에서 설명할 수 있다.
> - 노드 압박 상황에서 kubelet의 축출 로직을 이해한다.
> - 실제 사용량 데이터로 적정 requests/limits를 산정할 수 있다.

---

## 들어가며

13장에서 ResourceQuota를 쓰려면 모든 컨테이너가 requests/limits를 명시해야 한다고 했다. 그럼 그 값을 얼마로 정해야 할까?

이 질문에 잘못 답하면 두 가지 재앙이 온다.

- **너무 높게 잡으면**: 노드가 텅 비어 있는데도 스케줄되지 않는다. 비용이 낭비된다.
- **너무 낮게 잡으면**: 노드가 과부하되어 Pod들이 서로를 죽인다. 새벽 3시에 호출된다.

이 장은 그 값을 근거 있게 정하는 방법이다.

## 14.1 requests와 limits — 완전히 다른 두 값

### 역할의 차이

가장 흔한 오해가 이 둘을 비슷한 것으로 보는 것이다. **전혀 다른 시점에, 전혀 다른 주체가 사용한다.**

| | **requests** | **limits** |
|---|---|---|
| 누가 쓰는가 | **스케줄러** | **커널 (cgroup)** |
| 언제 쓰는가 | Pod 배치 결정 시 (한 번) | 실행 내내 |
| 의미 | "이만큼은 보장해 주세요" | "이 이상은 못 씁니다" |
| 초과 가능? | ✅ 가능 (여유가 있으면) | ❌ 불가 |
| 영향 | 어느 노드에 갈지 | CPU 스로틀링 / OOM Kill |

```yaml
resources:
  requests:
    cpu: 100m          # 스케줄러: "이 노드에 100m 여유가 있나?"
    memory: 128Mi
  limits:
    cpu: 500m          # 커널: "이 컨테이너는 최대 0.5 코어"
    memory: 512Mi      # 커널: "512Mi 넘으면 죽인다"
```

### 스케줄러의 계산

스케줄러는 **requests의 합**만 본다. 실제 사용량은 보지 않는다.

```
노드 용량: CPU 4코어, 메모리 8Gi
할당 가능(Allocatable): CPU 3.8코어, 메모리 7.2Gi   ← 시스템 예약분 제외

현재 배치된 Pod들의 requests 합: CPU 3.0, 메모리 5Gi
남은 여유: CPU 0.8, 메모리 2.2Gi

새 Pod가 requests.cpu: 1을 요구 → 배치 불가 (0.8 < 1)
```

**실제 CPU 사용률이 5%여도 마찬가지다.** 스케줄러는 requests만 본다.

```bash
kubectl describe node k8s-guide-worker | grep -A15 "Allocated resources"
```

```
Allocated resources:
  Resource           Requests      Limits
  --------           --------      ------
  cpu                750m (18%)    2100m (52%)
  memory             896Mi (11%)   2304Mi (29%)
```

**Requests의 백분율이 100%에 가까우면 더 이상 스케줄되지 않는다.** Limits는 100%를 넘어도 된다(오버커밋).

### Allocatable — 실제로 쓸 수 있는 양

노드의 전체 용량이 다 쓸 수 있는 것은 아니다.

```
Capacity (전체)
  - kube-reserved      (kubelet, 컨테이너 런타임용)
  - system-reserved    (OS, sshd, systemd용)
  - eviction-threshold (축출 임계값 여유분)
  ─────────────────────
  = Allocatable        ← 워크로드가 쓸 수 있는 양
```

```bash
kubectl get node k8s-guide-worker -o jsonpath='{.status.capacity}' | jq
kubectl get node k8s-guide-worker -o jsonpath='{.status.allocatable}' | jq
```

kubelet 설정에서 조정한다.

```yaml
# /var/lib/kubelet/config.yaml
kubeReserved:
  cpu: 200m
  memory: 512Mi
  ephemeral-storage: 1Gi
systemReserved:
  cpu: 200m
  memory: 512Mi
evictionHard:
  memory.available: "500Mi"
  nodefs.available: "10%"
```

**예약을 너무 적게 잡으면** 워크로드가 노드를 압박해 kubelet이나 컨테이너 런타임이 죽는다. 그러면 노드 전체가 `NotReady`가 된다. 대부분의 매니지드 서비스는 노드 크기에 비례한 예약값을 자동 설정한다.

### CPU와 메모리 단위

**CPU**
```yaml
cpu: 1        # 1 코어
cpu: "1"      # 동일
cpu: 1000m    # 동일 (millicore)
cpu: 100m     # 0.1 코어
cpu: 50m      # 0.05 코어 — 실무 최솟값 정도
```

"1 코어"는 클라우드에서 vCPU 1개, 즉 하이퍼스레드 하나를 의미한다.

**메모리**
```yaml
memory: 128Mi     # 128 * 1024^2 = 134,217,728 bytes  ★ 권장
memory: 128M      # 128 * 1000^2 = 128,000,000 bytes
memory: 1Gi       # 1024^3
memory: 1G        # 1000^3
```

> **⚠️ `Mi`와 `M`을 혼동하지 말 것**
> `1000Mi`는 약 1.05GB, `1000M`은 정확히 1GB다. 헷갈리면 항상 **`Mi`, `Gi`(2진 접두사)를 쓰자.** 대부분의 도구가 이 단위로 보고한다.

**임시 스토리지**도 제한할 수 있다.
```yaml
resources:
  requests:
    ephemeral-storage: 1Gi
  limits:
    ephemeral-storage: 4Gi
```
컨테이너의 쓰기 가능 레이어 + `emptyDir` + 로그의 합이다. 초과하면 Pod가 축출된다.

## 14.2 QoS 클래스

### 세 클래스와 결정 규칙

쿠버네티스는 requests/limits 설정에 따라 Pod를 세 등급으로 분류한다. **직접 지정할 수 없고 자동으로 결정된다.**

```
Guaranteed
  · 모든 컨테이너에 requests와 limits가 있고
  · CPU와 메모리 모두에서 requests == limits

Burstable
  · Guaranteed는 아니지만
  · 최소 하나의 컨테이너에 requests나 limits가 있음

BestEffort
  · 모든 컨테이너에 requests도 limits도 없음
```

```bash
kubectl get pod <name> -o jsonpath='{.status.qosClass}{"\n"}'
kubectl get pods -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
```

### 예시

```yaml
# Guaranteed
resources:
  requests: { cpu: 500m, memory: 512Mi }
  limits:   { cpu: 500m, memory: 512Mi }      # 완전히 동일

# Burstable ①
resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits:   { cpu: 500m, memory: 512Mi }      # 다름

# Burstable ② — limits만 있어도
resources:
  limits:   { memory: 512Mi }
  # requests가 없으면 limits와 같은 값으로 자동 설정된다
  # → 하지만 CPU에는 아무것도 없으므로 Burstable

# BestEffort
# resources 필드 자체가 없음
```

> **⚠️ 멀티 컨테이너의 함정**
> Pod 안의 **모든** 컨테이너가 조건을 만족해야 Guaranteed다. 사이드카 하나에 resources를 안 쓰면 **Pod 전체가 Burstable**이 된다.
> ```yaml
> containers:
>   - name: app
>     resources:
>       requests: { cpu: 500m, memory: 512Mi }
>       limits:   { cpu: 500m, memory: 512Mi }
>   - name: sidecar
>     # resources 없음 → Pod 전체가 Burstable
> ```

### QoS가 결정하는 것

**① 축출 우선순위** (14.4절에서 상세히)

```
BestEffort  → 가장 먼저 축출
Burstable   → 다음 (requests를 초과한 정도가 클수록 먼저)
Guaranteed  → 마지막
```

**② OOM Score 조정값**

리눅스 커널은 메모리가 부족할 때 `oom_score`가 높은 프로세스를 죽인다. kubelet은 QoS에 따라 `oom_score_adj`를 설정한다.

| QoS | `oom_score_adj` |
|---|---|
| Guaranteed | **-997** (거의 죽지 않음) |
| Burstable | 2 ~ 999 (requests 대비 비율로 계산) |
| BestEffort | **1000** (가장 먼저 죽음) |

```bash
# 컨테이너 안에서 확인
kubectl exec <pod> -- cat /proc/1/oom_score_adj
```

**③ CPU cgroup 가중치**

`cpu.weight`(v2) 또는 `cpu.shares`(v1)가 requests에 비례해 설정된다. CPU 경합 시 requests가 큰 컨테이너가 더 많은 시간을 받는다.

```
requests.cpu: 100m → cpu.shares = 102
requests.cpu: 500m → cpu.shares = 512
경합 시 대략 1:5 비율로 CPU를 나눠 받는다
```

## 14.3 CPU 스로틀링과 메모리 OOM — 비대칭성

이 절이 이 장에서 가장 중요하다. **CPU와 메모리는 근본적으로 다르게 동작한다.**

### 압축 가능한 자원 vs 불가능한 자원

| | **CPU** | **메모리** |
|---|---|---|
| 성질 | **압축 가능**(compressible) | **압축 불가능**(incompressible) |
| 초과 시 | 대기시킨다 (스로틀링) | **죽인다** (OOM Kill) |
| 회복 | 자동으로 회복 | 재시작 필요 |
| 증상 | 응답 지연 | `exitCode 137`, `OOMKilled` |

CPU는 "잠깐 기다려"가 가능하다. 메모리는 이미 할당된 것을 뺏을 수 없으므로 프로세스를 죽이는 수밖에 없다.

### CPU 스로틀링의 메커니즘

cgroup은 **CFS 대역폭 제어**로 CPU를 제한한다.

```
cpu.max = "50000 100000"
           └─quota─┘ └period┘

의미: 100ms(period)마다 50ms(quota)만 CPU를 쓸 수 있다 = 0.5 코어
```

**중요한 함정**: 이것은 평균이 아니라 **매 100ms 주기마다** 적용된다.

```
limits.cpu: 500m  →  매 100ms 중 50ms

시나리오: 요청 처리에 30ms의 CPU 작업이 필요한 앱
  · 요청 1개 → 30ms 사용 → 문제없음
  · 동시 요청 2개 → 60ms 필요 → 50ms에서 스로틀 → 다음 주기까지 대기
  · 결과: 지연 시간이 갑자기 100ms 이상 튄다
```

**멀티스레드 앱에서 특히 심각하다.**

```
limits.cpu: 1 (= 100ms 중 100ms)
스레드 4개가 각각 30ms씩 작업 → 총 120ms 필요
→ 100ms 소진 후 스로틀 → 나머지 20ms는 다음 주기에

결과: CPU 사용률은 100%가 아닌데도 지연이 발생한다
```

**스로틀링 확인**

```bash
# 컨테이너 안에서 (cgroup v2)
kubectl exec <pod> -- cat /sys/fs/cgroup/cpu.stat
```
```
usage_usec 12345678
nr_periods 1000
nr_throttled 234           ← 스로틀된 주기 수
throttled_usec 4567890     ← 스로틀된 총 시간
```

**`nr_throttled / nr_periods`가 스로틀링 비율**이다. 이 값이 높으면(> 5~10%) limits를 올려야 한다.

Prometheus 메트릭으로도 볼 수 있다(31장).
```promql
rate(container_cpu_cfs_throttled_periods_total[5m])
  / rate(container_cpu_cfs_periods_total[5m])
```

> **⚠️ CPU limits를 아예 설정하지 않는 선택**
>
> 일부 조직은 **CPU limits를 의도적으로 생략한다.** 이유:
> - CPU는 압축 가능하므로 초과해도 다른 Pod를 죽이지 않는다
> - cgroup의 `cpu.shares`가 requests 비율로 공정하게 나눠 준다
> - 여유 CPU를 놀리지 않고 활용할 수 있다
> - 스로틀링으로 인한 지연 스파이크를 없앤다
>
> **반대 의견**: 예측 가능성이 떨어지고, 한 Pod가 노드의 CPU를 다 쓰면 이웃이 느려진다. 또 성능 테스트 결과가 클러스터 상황에 따라 달라진다.
>
> **절충안**: 지연에 민감한 서비스는 limits 없이(또는 넉넉하게), 배치 워크로드는 limits를 걸어 통제한다. 다만 13장의 ResourceQuota가 있으면 limits가 필수이므로, 그런 환경에서는 **넉넉한 limits**가 현실적 답이다.

### 메모리 OOM

메모리는 회수할 수 없으므로 초과하면 커널이 프로세스를 죽인다.

```bash
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated}' | jq
```
```json
{
  "exitCode": 137,
  "reason": "OOMKilled",
  "finishedAt": "2026-09-01T10:19:58Z"
}
```

**두 종류의 OOM을 구분해야 한다.**

| 종류 | 원인 | 영향 범위 |
|---|---|---|
| **cgroup OOM** | 컨테이너가 자기 `limits.memory` 초과 | 그 컨테이너만 |
| **노드 OOM** | 노드 전체 메모리 고갈 | 여러 Pod, 심하면 kubelet까지 |

노드 OOM은 훨씬 위험하다. 14.4절의 축출이 이것을 예방하기 위해 존재한다.

**노드에서 OOM 로그 확인**
```bash
docker exec k8s-guide-worker dmesg | grep -i "killed process"
```

### JVM과 컨테이너 메모리 — 대표적 함정

Java 애플리케이션이 계속 OOMKilled 되는 흔한 시나리오다.

```yaml
resources:
  limits:
    memory: 2Gi
env:
  - name: JAVA_OPTS
    value: "-Xmx2g"        # ❌ 힙만 2GB
```

**JVM의 메모리는 힙만이 아니다.**

```
전체 메모리 = 힙(-Xmx)
            + 메타스페이스
            + 코드 캐시
            + 스레드 스택 (스레드당 ~1MB)
            + 다이렉트 버퍼
            + GC 오버헤드
            + JVM 자체
```

힙을 2GB로 잡으면 실제로는 2.5~3GB를 쓴다. limits가 2GB이므로 **OOMKilled**.

**올바른 설정**

```yaml
resources:
  limits:
    memory: 2Gi
env:
  - name: JAVA_OPTS
    value: "-XX:MaxRAMPercentage=70.0 -XX:InitialRAMPercentage=50.0"
```

`MaxRAMPercentage`는 **컨테이너의 메모리 한도를 인식**해 그 비율로 힙을 설정한다. JDK 10+ 에서 `UseContainerSupport`가 기본 활성화되어 cgroup 한도를 읽는다.

7장에서 본 Downward API로 명시적으로 전달할 수도 있다.

```yaml
env:
  - name: MEM_LIMIT_MB
    valueFrom:
      resourceFieldRef:
        resource: limits.memory
        divisor: 1Mi
```

**Node.js도 비슷한 문제가 있다.**
```yaml
env:
  - name: NODE_OPTIONS
    value: "--max-old-space-size=1536"    # limits가 2Gi일 때
```

### 실습: 스로틀링과 OOM 재현

**① CPU 스로틀링**

```yaml
# throttle-demo.yaml
apiVersion: v1
kind: Pod
metadata:
  name: throttle-demo
spec:
  containers:
    - name: burner
      image: busybox
      command:
        - sh
        - -c
        - |
          # 4개의 무한 루프 = 4코어를 원한다
          for i in 1 2 3 4; do
            (while true; do :; done) &
          done
          wait
      resources:
        requests: { cpu: 100m, memory: 32Mi }
        limits:   { cpu: 200m, memory: 64Mi }    # 0.2 코어만 허용
```

```bash
kubectl apply -f throttle-demo.yaml
sleep 20

# 실제 사용량 — limits에 묶여 있다
kubectl top pod throttle-demo

# 스로틀링 통계
kubectl exec throttle-demo -- cat /sys/fs/cgroup/cpu.stat
```

```
nr_periods 200
nr_throttled 199          ← 거의 모든 주기에서 스로틀됨
throttled_usec 15800000
```

**하지만 컨테이너는 죽지 않았다.** CPU는 압축 가능한 자원이기 때문이다.

**② 메모리 OOM**

```yaml
# oom-demo.yaml
apiVersion: v1
kind: Pod
metadata:
  name: oom-demo
spec:
  restartPolicy: Never
  containers:
    - name: hog
      image: python:3.12-alpine
      command:
        - python3
        - -c
        - |
          import time
          data = []
          for i in range(1, 200):
              data.append(bytearray(10 * 1024 * 1024))   # 10MB씩
              print(f"allocated {i*10}MB", flush=True)
              time.sleep(0.2)
      resources:
        requests: { cpu: 50m, memory: 64Mi }
        limits:   { cpu: 200m, memory: 128Mi }
```

```bash
kubectl apply -f oom-demo.yaml
kubectl logs -f oom-demo
```

```
allocated 10MB
allocated 20MB
...
allocated 110MB
(로그가 갑자기 끊긴다)
```

```bash
kubectl get pod oom-demo -o jsonpath='{.status.containerStatuses[0].state.terminated}' | jq
```
```json
{ "exitCode": 137, "reason": "OOMKilled" }
```

**CPU는 대기시키고, 메모리는 죽인다.** 이 비대칭성이 이 장의 핵심이다.

**③ QoS 클래스 확인**

```bash
kubectl get pods -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
kubectl exec throttle-demo -- cat /proc/1/oom_score_adj
```

**④ 정리**
```bash
kubectl delete pod throttle-demo oom-demo --ignore-not-found
```

## 14.4 노드 압박과 축출

### kubelet의 축출 로직

노드의 자원이 부족해지면 kubelet이 **Pod를 축출(evict)** 해서 노드를 보호한다. 노드 전체가 죽는 것보다 낫기 때문이다.

**감시하는 신호**

```yaml
evictionHard:
  memory.available: "500Mi"          # 사용 가능 메모리
  nodefs.available: "10%"            # 노드 파일 시스템 여유
  nodefs.inodesFree: "5%"
  imagefs.available: "15%"           # 이미지 저장소 여유
  pid.available: "10%"

evictionSoft:                        # 유예 시간 후 축출
  memory.available: "1Gi"
evictionSoftGracePeriod:
  memory.available: "1m30s"
```

**Hard vs Soft**
- **Hard**: 즉시 축출. graceful termination 없음(또는 최소)
- **Soft**: 유예 기간 동안 지속되면 축출. `terminationGracePeriodSeconds` 존중

### 축출 순서

kubelet은 다음 순서로 희생자를 고른다.

```
① QoS 클래스
   BestEffort → Burstable → Guaranteed

② 같은 QoS 안에서는: requests를 얼마나 초과했는가
   requests: 100Mi, 사용: 500Mi (400Mi 초과)  ← 먼저 축출
   requests: 100Mi, 사용: 150Mi (50Mi 초과)

③ Pod Priority (15장)
   낮은 우선순위부터
```

**정확한 순서는 구현에 따라 달라질 수 있지만, 원칙은 "약속보다 많이 쓰는 놈부터"다.**

```bash
kubectl get events --field-selector reason=Evicted -A
kubectl describe pod <evicted-pod>
```
```
Status:  Failed
Reason:  Evicted
Message: The node was low on resource: memory.
         Container app was using 892Mi, which exceeds its request of 128Mi.
```

### 노드 컨디션

압박 상태는 노드 컨디션으로도 표시된다.

```bash
kubectl describe node k8s-guide-worker | grep -A8 Conditions
```

```
Type              Status
----              ------
MemoryPressure    False
DiskPressure      False
PIDPressure       False
Ready             True
```

**`MemoryPressure=True`가 되면 새 BestEffort Pod가 그 노드에 스케줄되지 않는다.** 자동으로 테인트도 붙는다(15장).

### 축출을 예방하려면

1. **requests를 실제 사용량에 가깝게** 설정한다 (14.5절)
2. **중요한 워크로드는 Guaranteed로** 만든다
3. **`kube-reserved`/`system-reserved`를 넉넉히** 잡는다
4. **PodDisruptionBudget**을 설정한다(32장) — 단, PDB는 kubelet 축출을 막지 못한다. API 기반 축출(드레인)만 제어한다
5. **모니터링과 알림**을 건다(31장)

> **⚠️ PDB는 노드 압박 축출을 막지 못한다**
> PodDisruptionBudget은 `kubectl drain` 같은 **자발적 중단**만 제어한다. kubelet이 자원 부족으로 축출하는 것은 **비자발적 중단**이라 PDB를 무시한다. 노드가 위험하면 규칙보다 생존이 우선이기 때문이다.

## 14.5 적정값 산정 방법론

### 데이터 없이 정하지 말 것

가장 흔한 실수는 감으로 정하는 것이다. 근거 있는 절차는 이렇다.

**① 관측: 실제 사용량 수집**

```bash
# 즉석 확인 (metrics-server 필요)
kubectl top pods --containers
kubectl top nodes
```

```bash
# metrics-server 설치 (kind)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch -n kube-system deployment metrics-server --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

**Prometheus로 장기 데이터를 본다**(31장).

```promql
# CPU: 95 퍼센타일 사용량 (7일)
quantile_over_time(0.95,
  rate(container_cpu_usage_seconds_total{pod=~"web-.*",container!=""}[5m])[7d:5m]
)

# 메모리: 최대 사용량 (7일)
max_over_time(
  container_memory_working_set_bytes{pod=~"web-.*",container!=""}[7d]
)
```

**② 산정 공식**

```
requests.cpu    = P50 ~ P70 사용량        (평상시를 커버)
limits.cpu      = P95 ~ P99 × 1.5         (또는 설정하지 않음)

requests.memory = P95 사용량 × 1.1
limits.memory   = 최대 사용량 × 1.2 ~ 1.5
```

**왜 CPU와 메모리가 다른가?**
- **CPU**: 초과해도 스로틀링만 되므로 requests를 평균 근처로 잡아 밀도를 높인다.
- **메모리**: 초과하면 죽으므로 requests를 피크에 가깝게 잡아 안전하게 간다.

**③ 워크로드 유형별 지침**

| 유형 | requests | limits | QoS 목표 |
|---|---|---|---|
| **지연 민감 API** | 평균의 1.2배 | CPU 없음/넉넉히, 메모리 피크×1.3 | Burstable |
| **핵심 상태 저장(DB)** | 피크 수준 | requests와 동일 | **Guaranteed** |
| **배치/워커** | 평균 | 넉넉히 | Burstable |
| **개발/테스트** | 낮게 | 낮게 | Burstable |
| **시스템 DaemonSet** | 실측값 | requests × 2 | Burstable/Guaranteed |

**④ VPA를 권고 모드로 활용** (16장에서 상세히)

Vertical Pod Autoscaler를 **적용하지 않고 추천만 받는** 모드로 돌리면 훌륭한 산정 도구가 된다.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  updatePolicy:
    updateMode: "Off"          # ★ 추천만, 적용 안 함
```

```bash
kubectl describe vpa web-vpa
```
```
Recommendation:
  Container Recommendations:
    Container Name:  app
    Lower Bound:
      Cpu:     87m
      Memory:  262144k
    Target:
      Cpu:     150m           ← 이 값을 참고
      Memory:  314572k
    Upper Bound:
      Cpu:     1250m
      Memory:  1073741824
```

**⑤ 검증과 반복**

- 부하 테스트로 스로틀링 비율 확인
- OOMKilled 발생 여부 모니터링
- 노드 할당률(`Requests %`)이 70~80% 정도가 되도록 조정
- 분기마다 재검토

### 오버커밋 전략

```
노드 Allocatable:  CPU 4, 메모리 8Gi
Pod requests 합:   CPU 3.2, 메모리 6Gi     (80% — 스케줄 가능한 한계)
Pod limits 합:     CPU 8,   메모리 12Gi    (200%, 150% — 오버커밋)
```

**CPU 오버커밋은 안전하다.** 압축 가능하므로 경합해도 스로틀링만 된다. 2~4배도 흔하다.

**메모리 오버커밋은 위험하다.** 모든 Pod가 동시에 limits까지 쓰면 노드가 OOM에 빠진다. **1.2~1.5배 정도로 제한하는 것이 안전하다.**

13.3절의 `maxLimitRequestRatio`가 이것을 강제하는 수단이다.

---

## 실습 과제

**과제 1 — QoS 클래스 세 가지 만들어 보기**
Guaranteed, Burstable, BestEffort Pod를 각각 만들고 `oom_score_adj`를 비교한다. 그다음 노드 메모리를 고갈시키는 Pod를 띄워(주의: 실습 클러스터에서만) 어떤 순서로 축출되는지 관찰한다.

**과제 2 — 스로틀링 비율 측정과 튜닝**
CPU를 많이 쓰는 앱에 `limits.cpu`를 100m, 200m, 500m, 1로 바꿔 가며 `nr_throttled/nr_periods` 비율과 응답 지연(P99)을 기록한다. 스로틀링 비율이 5% 아래로 떨어지는 지점을 찾는다.

**과제 3 — JVM 메모리 함정 재현**
`-Xmx`를 컨테이너 limits와 같게 설정한 Java 앱을 만들어 OOMKilled를 재현한 뒤, `-XX:MaxRAMPercentage=70`으로 바꿔 해결되는 것을 확인한다. 두 경우의 실제 RSS를 `kubectl top pod`로 비교한다.

**과제 4 — VPA 권고 모드**
VPA를 `updateMode: "Off"`로 설치하고, 실제 부하를 준 워크로드에 붙인다. 30분~1시간 후 추천값과 자신이 처음 설정한 값을 비교한다.

**과제 5 — 노드 할당률 관리**
`kubectl describe node`로 Requests 백분율을 확인하고, requests를 절반으로 줄였을 때 얼마나 더 많은 Pod가 스케줄되는지 실험한다. 그다음 실제 사용량이 노드 용량을 넘으면 어떤 일이 생기는지 관찰한다.

---

## 요약

- **requests는 스케줄러가, limits는 커널이 쓴다.** 스케줄러는 requests 합만 보고 실제 사용량은 보지 않는다. 노드의 `Allocatable`은 시스템 예약분을 뺀 값이다.
- **QoS 클래스는 자동 결정된다.** 모든 컨테이너에서 requests == limits면 Guaranteed, 아무것도 없으면 BestEffort, 나머지는 Burstable. 사이드카 하나에 resources를 빠뜨리면 Pod 전체가 Burstable이 된다.
- **CPU는 압축 가능하고 메모리는 아니다.** CPU 초과는 스로틀링(대기), 메모리 초과는 OOM Kill(사망)이다. 이 비대칭성이 모든 설계 판단의 근거다.
- CFS 대역폭 제어는 **100ms 주기마다** 적용되므로, 평균 사용률이 낮아도 순간 스파이크에서 스로틀링이 발생한다. `nr_throttled/nr_periods`로 측정한다.
- **JVM은 힙 외의 메모리도 쓴다.** `-Xmx`를 limits와 같게 잡으면 OOMKilled 된다. `-XX:MaxRAMPercentage=70` 같은 비율 설정을 쓴다.
- 노드 압박 시 kubelet은 **BestEffort → Burstable(requests 초과 큰 순) → Guaranteed** 순으로 축출한다. **PDB는 이 축출을 막지 못한다.**
- 적정값은 **관측 → 산정 → 검증**의 순환으로 정한다. CPU requests는 P50~P70, 메모리 requests는 P95 기준이 출발점이며, VPA의 권고 모드가 좋은 도구다.
- **CPU 오버커밋은 안전하고 메모리 오버커밋은 위험하다.** 메모리는 1.2~1.5배 이내로 제한한다.

**다음 장에서는** 스케줄러가 requests 외에 어떤 조건들을 고려하는지 다룬다. 어피니티, 테인트, 토폴로지 분산, 우선순위로 Pod의 배치를 정밀하게 제어하는 방법을 살펴본다.

---

**참고 원서**: *The Kubernetes Bible* 20.1절 / *Kubernetes in Action, 2nd Ed.* 20장 / *Core Kubernetes* 4장
