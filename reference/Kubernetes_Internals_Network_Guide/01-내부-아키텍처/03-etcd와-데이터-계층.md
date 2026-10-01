---
title: "3장. etcd와 데이터 계층"
---

# 3장. etcd와 데이터 계층

> **학습목표**
> - Raft 합의 알고리즘의 핵심 동작(리더 선출, 로그 복제, 과반수 원칙)을 설명할 수 있다.
> - etcd가 왜 홀수 노드로 구성되는지, 노드 수가 장애 허용치를 어떻게 결정하는지 계산할 수 있다.
> - kube-apiserver가 etcd에 쓰는 키 구조와 MVCC(revision) 모델을 이해한다.
> - watch 스트림의 내부 동작과 압축(compaction)이 왜 필요한지 설명할 수 있다.
> - 성능에 영향을 주는 핵심 파라미터(quota-backend-bytes, fsync 지연, 하트비트/선출 타임아웃)를 튜닝할 수 있다.
> - snapshot 기반 백업/복구 절차를 수행하고, stacked·external 토폴로지의 트레이드오프를 안다.

---

## 들어가며

2장에서 kube-apiserver의 요청 처리 경로를 따라가다 마지막에 이렇게 적었다. "내부 버전 → 스토리지 버전 → protobuf 직렬화 → 암호화 → etcd 쓰기." 그리고 watch cache가 etcd watch 하나를 수천 클라이언트에 fan-out한다고 했다.

이 장은 그 종착점을 연다. **kube-apiserver는 상태를 저장하지 않는다.** 모든 오브젝트, 모든 상태, 모든 이력은 etcd에 있다. API 서버가 재시작되어도 클러스터는 그대로지만, etcd 데이터가 사라지면 클러스터는 사라진다. **etcd는 쿠버네티스에서 유일하게 진짜 "상태"를 가진 컴포넌트다.**

etcd는 범용 분산 KV 스토어이지만, 쿠버네티스는 이를 특정한 방식으로만 사용한다. 이 장에서는 세 층을 본다.

```
① 합의 계층    Raft — 여러 etcd 노드가 어떻게 하나의 진실에 합의하는가
② 데이터 모델   MVCC — 쿠버네티스 오브젝트가 키/리비전으로 어떻게 저장되는가
③ 운영 계층    압축·방어·백업 — 이 저장소를 어떻게 건강하게 유지하는가
```

kube-apiserver는 etcd에 대해 **유일한 클라이언트**다(어그리게이션 API 서버 제외). 다른 모든 컴포넌트는 반드시 kube-apiserver를 거쳐야 etcd에 닿을 수 있다. 이 장의 실습에서만 예외적으로 etcdctl로 직접 접근해 내부를 들여다본다.

## 3.1 Raft 합의 알고리즘 핵심

### 왜 합의가 필요한가

etcd는 보통 3개 이상의 노드로 클러스터를 구성한다. 각 노드가 독립적으로 "지금 Pod `web`의 상태는 이거다"라고 답하면 클러스터는 무너진다. **여러 노드가 정확히 같은 데이터를 정확히 같은 순서로 반영해야 한다.** 이것이 분산 합의(consensus) 문제이고, etcd는 Raft 알고리즘으로 이를 푼다.

Raft는 세 가지 하위 문제로 나뉜다: **리더 선출**, **로그 복제**, **안전성(safety)**.

### 리더 선출

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ node A  │     │ node B  │     │ node C  │
│ Follower│     │ Follower│     │ Follower│
└─────────┘     └─────────┘     └─────────┘

election timeout(150~300ms, 무작위) 동안
리더로부터 하트비트를 못 받으면:

┌─────────┐
│ node A  │  term을 +1 하고 Candidate로 전환
│Candidate│  자신에게 투표 + 다른 노드에 투표 요청(RequestVote)
└────┬────┘
     │  과반수(quorum)의 표를 얻으면
     ▼
┌─────────┐     ┌─────────┐     ┌─────────┐
│ node A  │────▶│ node B  │     │ node C  │
│ Leader  │     │Follower │     │Follower │
└─────────┘     └─────────┘     └─────────┘
     │ 이후 하트비트(빈 AppendEntries)를 주기적으로 전송
     └────────────────────────────▶ node C
```

- **term**: 논리적 시간 단위. 리더가 바뀔 때마다 증가한다. 모든 메시지에 term이 포함되어 오래된 리더의 메시지를 구분한다.
- **election timeout이 노드마다 무작위**인 이유: 모든 노드가 동시에 후보가 되면 표가 갈려 아무도 과반수를 못 얻는다. 무작위 지연이 이 충돌 확률을 낮춘다.
- 한 term에는 **최대 한 명의 리더**만 존재할 수 있다(과반수 투표 원칙 때문).

### 로그 복제

리더만 쓰기를 받는다. 클라이언트(kube-apiserver)가 쓰기를 보내면:

```
kube-apiserver
     │ write(key, value)
     ▼
┌──────────┐
│  Leader  │ ① 자신의 로그에 엔트리 추가 (아직 미확정)
└────┬─────┘
     │ ② AppendEntries를 팔로워들에게 병렬 전송
     ▼
┌─────────┐  ┌─────────┐
│Follower1│  │Follower2│  각자 로그에 엔트리 추가 후 ACK
└────┬────┘  └────┬────┘
     │            │
     ▼            ▼
┌────────────────────────────┐
│ 리더가 과반수(자신 포함)의   │
│ ACK를 받으면 → 커밋(commit) │
└──────────────┬─────────────┘
               │ ③ 클라이언트에 성공 응답
               │ ④ 다음 하트비트에 커밋 인덱스 전파
               ▼
        팔로워들도 커밋 확정 → 상태 머신(mvcc)에 적용
```

**핵심**: 쓰기는 **과반수 노드의 디스크에 기록되어야** 커밋된 것으로 간주된다. 이것이 etcd 쓰기가 단일 노드 KV 스토어보다 느린 이유이자, 장애에도 데이터가 살아남는 이유다.

### Safety 속성과 과반수(quorum) 원칙

Raft의 안전성은 **"과반수 겹침(overlap)"**에서 나온다. 어떤 두 개의 과반수 집합도 최소 한 노드는 겹친다. 그래서:

- 새 리더를 뽑을 때 과반수의 투표가 필요하고, 그 과반수 중 최소 한 노드는 이전에 커밋된 모든 엔트리를 갖고 있다.
- Raft는 후보가 자신보다 **로그가 최신인 노드에게는 투표하지 않도록** 강제한다(로그의 마지막 term과 인덱스 비교). 그래서 커밋된 데이터를 가진 노드만 리더가 될 수 있다.
- 결과: **한번 커밋된 엔트리는 이후 어떤 리더가 와도 절대 사라지거나 덮어써지지 않는다.**

### 왜 홀수 노드인가 — 장애 허용치 계산

과반수는 `⌊N/2⌋ + 1`이다. 노드 수 N에 대해 장애를 견딜 수 있는 수는 `⌊(N-1)/2⌋`이다.

| 노드 수(N) | 과반수 | 허용 가능한 장애 수 | 비고 |
|---|---|---|---|
| 1 | 1 | 0 | 단일 장애점, 테스트용 |
| 2 | 2 | 0 | **의미 없음** — 1개만 죽어도 과반수 불가 |
| 3 | 2 | **1** | 가장 흔한 구성 |
| 4 | 3 | 1 | 3과 장애 허용치가 같은데 노드만 하나 더 든다 |
| 5 | 3 | **2** | 대규모/고가용 클러스터 |
| 6 | 4 | 2 | 5와 장애 허용치가 같음 |
| 7 | 4 | **3** | 매우 큰 클러스터, 쓰기 지연 증가 |

**짝수 노드가 의미 없는 이유가 표에 그대로 보인다.** 4노드는 3노드와 똑같이 1개 장애만 견디면서, 리더 선출 시 표가 갈릴 위험과 네트워크 파티션(2:2 분할) 위험만 추가로 진다. **etcd는 항상 홀수 개(3 또는 5)로 구성한다.**

노드가 늘어날수록 쓰기 하나가 확정되기까지 기다려야 하는 팔로워 ACK 수도 늘어난다. **가용성(장애 허용)과 쓰기 지연은 트레이드오프**다. 대부분의 프로덕션 클러스터는 3노드로 충분하고, 대규모 멀티 리전 클러스터에서만 5노드를 고려한다.

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint status --cluster -w table
```
```
+------------------+------------------+---------+---------+-----------+
|     ENDPOINT     |        ID        | VERSION | IS LEADER | RAFT TERM |
+------------------+------------------+---------+---------+-----------+
| https://127.0.0.1:2379 | a1b2c3d4e5f6 | 3.5.x  |  true   |    2      |
+------------------+------------------+---------+---------+-----------+
```

`kind` 3노드 클러스터(`k8s-guide`)는 컨트롤 플레인 노드가 1개뿐이므로 etcd도 단일 노드로 뜬다. 이 장의 Raft 논의는 개념적으로 이해하고, 멀티 노드 토폴로지는 3.6절에서 별도로 다룬다.

## 3.2 etcd 키 구조와 MVCC

### kube-apiserver가 쓰는 키 구조

kube-apiserver는 오브젝트를 저장할 때 예측 가능한 키 경로를 쓴다.

```
/registry/<group>/<resource>/<namespace>/<name>
```

group이 core(v1)인 리소스는 group 부분이 생략된다.

```
/registry/pods/default/web-7d8f9c-abcde
/registry/services/default/kubernetes
/registry/deployments/apps/default/nginx
/registry/configmaps/kube-system/coredns
/registry/secrets/default/my-secret
/registry/namespaces/default
```

클러스터 스코프 리소스는 `<namespace>` 계층이 없다.

```
/registry/nodes/k8s-guide-control-plane
/registry/clusterroles/cluster-admin
```

**이 키 구조 자체가 List 연산의 최적화 수단이다.** `kubectl get pods -n default`는 `/registry/pods/default/` 프리픽스 range 조회 하나로 끝난다. etcd의 키는 렉시코그래픽 순서로 정렬된 B-tree(bbolt)에 저장되므로 프리픽스 스캔이 빠르다.

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/kube-system/ --prefix --keys-only
```
```
/registry/pods/kube-system/coredns-6f7d8b-xk2p9
/registry/pods/kube-system/etcd-k8s-guide-control-plane
/registry/pods/kube-system/kube-apiserver-k8s-guide-control-plane
...
```

### MVCC 모델

etcd는 **MVCC(Multi-Version Concurrency Control)** 저장소다. 같은 키에 쓰기가 일어나도 **이전 값을 덮어쓰지 않는다.** 대신 새 리비전(revision)을 만든다.

```
revision(전역, 단조 증가)   key            value
────────────────────────────────────────────────
     100                /registry/pods/default/web   {replicas 준비중...}
     101                /registry/cm/default/config  {...}
     102                /registry/pods/default/web   {상태: Running}   ← key당 버전은 별도 유지
     103                /registry/pods/default/web   {상태: Ready}
```

- **revision은 etcd 클러스터 전체에서 단조 증가하는 전역 카운터다.** 모든 쓰기(키가 다르더라도)마다 1씩 증가한다.
- 각 키는 자신의 **버전(version)** — 그 키에 대한 쓰기 횟수 — 도 별도로 갖는다.
- kube-apiserver가 응답에 실어주는 `resourceVersion`이 바로 이 etcd revision이다(2장에서 본 watch의 `resourceVersion`과 동일한 값).

**낙관적 동시성 제어**가 여기서 나온다. kubectl이 오브젝트를 수정할 때 `resourceVersion`을 함께 보낸다. etcd는 트랜잭션(`Txn`)으로 "이 키의 현재 mod_revision이 내가 읽었던 값과 같을 때만 쓰기"를 보장한다. 값이 그 사이 바뀌었으면 `409 Conflict`를 반환한다.

```bash
kubectl get pod web -o jsonpath='{.metadata.resourceVersion}'
# 12345  ← 이것이 etcd의 mod_revision
```

**과거 리비전은 압축 전까지 계속 조회 가능하다.**

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/default/web --rev=100
```

이것이 watch가 "그 시점 이후의 변경들"을 재생할 수 있는 근거다 — **과거 리비전들이 실제로 저장되어 있기 때문이다.** 동시에, 이 리비전들이 무한정 쌓이면 저장소가 무한히 커진다는 문제로 이어진다(3.3절).

## 3.3 watch 구현과 압축(compaction)

### watch 스트림의 내부 동작

2장에서 kube-apiserver의 watch cache가 etcd watch 하나를 리소스 종류마다 유지한다고 했다. 그 etcd watch 자체는 이렇게 동작한다.

```
kube-apiserver                              etcd
     │  Watch(key_prefix="/registry/pods/", start_revision=12300)
     ├───────────────────────────────────────▶│
     │                                        │ ① MVCC 저장소에서 revision 12300
     │                                        │    이후의 모든 변경 이벤트를 재생
     │◀────────── PUT/DELETE 이벤트 스트림 ─────┤
     │                                        │ ② 이후 새 쓰기가 생길 때마다
     │◀────────── 실시간 이벤트 스트림 ─────────┤    즉시 전달 (gRPC 스트림, 단일 TCP 연결)
```

etcd watch는 **gRPC 양방향 스트림** 위에서 동작하며, 여러 watch 요청을 하나의 TCP 연결에 다중화(multiplexing)할 수 있다. kube-apiserver는 리소스 타입별로 이 연결을 재사용해 etcd에 대한 연결 수 자체를 억제한다.

### 압축(compaction)이 필요한 이유

MVCC 특성상 **삭제된 키조차 tombstone으로 남고, 수정된 키는 이전 버전이 계속 쌓인다.** 압축 없이는:

```
쓰기가 계속 발생 → 리비전이 끝없이 증가 → 각 리비전의 데이터가 bbolt(boltdb) 파일에 누적
                                        → db 파일 크기가 무한정 증가
                                        → 결국 quota-backend-bytes 한도 초과 → etcd가 쓰기 거부
```

**압축은 오래된 리비전들을 제거해 최신 상태만 남기는 작업이다.** 특정 리비전보다 오래된 버전들의 히스토리를 지운다(단, 최신 값 자체는 유지된다 — 이름이 헷갈리기 쉽지만 "현재 상태를 지우는 것"이 아니라 "과거 이력을 지우는 것"이다).

```bash
# 수동 압축 (특정 리비전까지)
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  compact 12000
```

### auto-compaction 설정

kube-apiserver가 관리하는 kubeadm 클러스터의 etcd static Pod는 기본적으로 주기적 자동 압축이 켜져 있다.

```bash
docker exec k8s-guide-control-plane \
  grep -A1 "auto-compaction" /etc/kubernetes/manifests/etcd.yaml
```
```yaml
- --auto-compaction-mode=periodic
- --auto-compaction-retention=5m
```

- **`periodic` 모드**: 지정한 시간(예: 5분, 1시간) 이전의 리비전을 주기적으로 압축한다.
- **`revision` 모드**: 리비전 개수 기준으로 압축한다(예: 최근 1000개만 남김).

**압축 주기를 너무 짧게 잡으면** 오래된 `resourceVersion`으로 watch를 재개하려는 클라이언트가 `410 Gone`을 더 자주 받는다(2장 참고). **너무 길게 잡으면** db 파일이 불필요하게 커진다. 대부분의 환경에서 기본값(5~10분)이면 충분하다.

### 압축 후에도 파일은 줄지 않는다 — 디프래그(defragmentation)

**압축은 논리적으로 리비전을 지울 뿐, boltdb 파일의 실제 디스크 공간을 즉시 반환하지 않는다.** 압축된 공간은 "빈 페이지"로 표시되어 **재사용 가능한 상태**가 될 뿐, 파일 자체는 줄어들지 않는다. 쓰기 패턴에 따라 이 빈 페이지들이 파편화(fragmentation)되어 db 파일 크기와 실제 사용량 사이의 괴리가 커진다.

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint status -w table
```
```
+-----------------+------------------+---------+---------+
|    ENDPOINT     |     DB SIZE      | DB SIZE IN USE      |
+-----------------+------------------+---------+---------+
| 127.0.0.1:2379  |     210 MB       |     45 MB           |
+-----------------+------------------+---------+---------+
```

**DB SIZE와 DB SIZE IN USE의 차이가 크면 디프래그가 필요하다는 신호다.**

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  defrag
```

**주의**: 디프래그는 해당 노드를 **일시적으로 블로킹**한다(파일을 재작성하는 동안). 멀티 노드 클러스터에서는 **한 번에 한 노드씩, 순차적으로** 실행해야 한다. 전체 노드를 동시에 디프래그하면 그 순간 쓰기가 전체적으로 멈출 수 있다.

## 3.4 성능 특성과 튜닝

### quota-backend-bytes

etcd db 파일의 최대 크기를 제한한다. 기본값은 **2GB**다.

```bash
docker exec k8s-guide-control-plane \
  grep quota-backend-bytes /etc/kubernetes/manifests/etcd.yaml
# --quota-backend-bytes=2147483648   (설정 안 되어 있으면 기본값 2GB 적용)
```

한도에 근접하면 etcd는 경고를 로그로 남기고, 초과하면 **`etcdserver: mvcc: database space exceeded`**와 함께 쓰기를 거부한다 — **클러스터 전체가 읽기 전용처럼 멈추는 심각한 장애다.** 압축과 디프래그를 정기적으로 수행하지 않으면 대규모 클러스터에서 실제로 발생한다.

```bash
kubectl get --raw /metrics | grep etcd_server_quota_backend_bytes
```

큰 클러스터(수만 개 오브젝트, 잦은 변경)에서는 이 값을 8GB 정도까지 올리기도 하지만, **etcd 공식 문서는 8GB를 상한 권장치로 명시한다.** db가 커질수록 압축/디프래그/스냅샷 비용도 커지므로, 한도를 올리는 것보다 **불필요한 오브젝트 증가(예: 완료된 Job, 오래된 이벤트)를 줄이는 것**이 먼저다.

### fsync 지연 민감도 — 왜 빠른 SSD가 필요한가

Raft 로그 복제에서 각 노드는 **엔트리를 디스크에 fsync한 뒤에야** ACK를 보낸다(메모리에만 있으면 그 노드가 죽었을 때 데이터가 사라지므로). 즉, **etcd 쓰기 지연의 하한은 디스크 fsync 지연이다.**

```
쓰기 요청 → 리더가 로그 append → fsync (디스크 물리 쓰기 확정) → 팔로워에 전파 → 과반수 fsync 완료 → 커밋
```

네트워크 스토리지(NFS), 회전식 HDD, 노이지 네이버가 있는 공유 SSD 환경에서는 fsync가 수십~수백 ms까지 늘어질 수 있다. 이는 **etcd 리더가 하트비트를 제때 못 보내는 상황**으로 이어지고, 팔로워가 리더 부재로 판단해 불필요한 재선출을 일으킨다 — **디스크 문제가 리더 선출 스톰으로 번진다.**

```bash
kubectl get --raw /metrics | grep etcd_disk_wal_fsync_duration_seconds
```

**`etcd_disk_wal_fsync_duration_seconds`의 P99가 10ms를 넘으면 경고 신호다.** etcd 공식 권장은 **로컬 NVMe/SSD**이며, 네트워크 스토리지나 공유 디스크는 권장하지 않는다.

### 하트비트/선출 타임아웃 튜닝

```bash
docker exec k8s-guide-control-plane \
  grep -E "heartbeat-interval|election-timeout" /etc/kubernetes/manifests/etcd.yaml
```
```yaml
- --heartbeat-interval=100      # ms, 리더가 하트비트를 보내는 주기
- --election-timeout=1000       # ms, 이 시간 동안 하트비트가 없으면 재선출 시도
```

**네트워크 왕복 지연(RTT)이 큰 환경(멀티 리전, WAN 간 etcd)에서는 이 값을 늘려야 한다.** RTT가 하트비트 간격에 가까우면 정상적인 지연도 리더 장애로 오판해 불필요한 재선출이 반복된다(리더십 스래싱). etcd 공식 권장은 **election-timeout이 heartbeat-interval의 최소 5~10배** 이상이어야 한다는 것이다.

반대로 **같은 데이터센터 내 저지연 환경에서 값을 과도하게 줄이면** 실제 장애 감지가 빨라지지만, 일시적 GC 정지나 네트워크 지터에도 재선출이 발생해 오히려 불안정해진다(5장에서 다룰 kube-controller-manager/kube-scheduler의 리더 선출 Lease 튜닝과 같은 트레이드오프).

### 핵심 메트릭 정리

| 메트릭 | 의미 | 경보 기준 |
|---|---|---|
| `etcd_disk_wal_fsync_duration_seconds` | WAL fsync 지연 ★ | P99 > 10ms |
| `etcd_disk_backend_commit_duration_seconds` | 백엔드(boltdb) 커밋 지연 | P99 > 25ms |
| `etcd_server_quota_backend_bytes` | 설정된 quota 한도 | 사용량과 비교 |
| `etcd_mvcc_db_total_size_in_bytes` | db 파일 총 크기 | quota 대비 근접 |
| `etcd_mvcc_db_total_size_in_use_in_bytes` | 실제 사용 중인 크기 | total과 괴리 크면 defrag |
| `etcd_server_leader_changes_seen_total` | 리더 교체 횟수 | 급증하면 네트워크/디스크 의심 |
| `etcd_network_peer_round_trip_time_seconds` | 노드 간 RTT | 타임아웃 설계 근거 |
| `etcd_server_proposals_failed_total` | 합의 실패한 제안 수 | 증가 중이면 이상 |

## 3.5 백업과 복구

### snapshot save

etcd는 **전체 키스페이스의 point-in-time 스냅샷**을 만드는 기능을 내장하고 있다. 이 스냅샷 하나가 **클러스터 전체 상태의 백업**이다 — Pod, Deployment, Secret, ConfigMap, RBAC, CRD 오브젝트까지 `/registry/` 아래 모든 것이 여기 담긴다.

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /tmp/etcd-snapshot-$(date +%Y%m%d%H%M).db
```
```
{"level":"info","msg":"created temporary db file","path":"/tmp/etcd-snapshot-....db.part"}
{"level":"info","msg":"saved","path":"/tmp/etcd-snapshot-....db"}
Snapshot saved at /tmp/etcd-snapshot-202609221030.db
```

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot status /tmp/etcd-snapshot-202609221030.db -w table
```
```
+----------+----------+------------+------------+
|   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
+----------+----------+------------+------------+
| a1b2c3d4 |   45231  |    1204    |   3.2 MB   |
+----------+----------+------------+------------+
```

**이 스냅샷 파일을 즉시 클러스터 밖(다른 스토리지, 오브젝트 스토리지 등)으로 복사해 두어야 한다.** 노드 로컬 디스크에만 두면 해당 노드가 사라졌을 때 백업도 함께 사라진다.

### snapshot restore와 그 함의

복구는 **새로운 etcd 데이터 디렉터리를 스냅샷으로부터 생성**하는 작업이다. 기존 데이터 디렉터리를 덮어쓰는 것이 아니다.

```bash
docker exec k8s-guide-control-plane etcdctl \
  snapshot restore /tmp/etcd-snapshot-202609221030.db \
  --data-dir=/var/lib/etcd-restored \
  --name=k8s-guide-control-plane \
  --initial-cluster=k8s-guide-control-plane=https://127.0.0.1:2380 \
  --initial-advertise-peer-urls=https://127.0.0.1:2380
```

**중요한 함의들**:

1. **복구된 클러스터는 새로운 member ID를 갖는다.** restore는 완전히 새로운 Raft 클러스터를 만드는 것과 같아서, 기존 멤버들과 클러스터 ID가 달라진다. 멀티 노드 클러스터를 복구할 때는 **모든 노드에서 같은 스냅샷으로 각자 restore한 뒤, 새 `--initial-cluster` 구성으로 동시에 새 클러스터를 형성**해야 한다.
2. **스냅샷 시점 이후의 변경사항은 모두 유실된다.** 스냅샷을 찍은 순간부터 장애 시점까지의 쓰기는 복구되지 않는다 — 정기 백업 주기가 곧 잠재적 데이터 손실 윈도우다.
3. **복구 후 kube-apiserver를 재시작해야** 새 데이터 디렉터리를 가리키는 etcd에 다시 연결된다. static Pod manifest의 `--data-dir` 경로를 restore한 디렉터리로 바꾸는 절차가 필요하다.
4. **오브젝트 UID는 유지되지만, 그 사이 삭제되었어야 할 리소스가 되살아날 수 있다.** 예를 들어 백업 이후 삭제된 Pod가 복구본에는 남아 있어, 컨트롤러가 이를 다시 인식하고 재조정하는 과도기가 생긴다.

**etcd 백업이 곧 전체 클러스터 백업인 이유가 여기 있다.** Velero 같은 별도 백업 도구도 결국 쿠버네티스 API를 통해 오브젝트를 덤프하는 방식이지만, etcd 스냅샷은 **API를 거치지 않고 저장 계층 자체를 통째로 떠낸다** — RBAC, Secret, CRD 정의, 커스텀 리소스 인스턴스까지 예외 없이 포함된다.

## 3.6 멀티 노드 etcd 토폴로지

### Stacked vs External

```
[Stacked etcd]                          [External etcd]

control-plane 노드 1개                   control-plane 노드            etcd 노드 (별도)
┌─────────────────────┐                 ┌──────────────┐            ┌──────────────┐
│ kube-apiserver       │                 │ kube-apiserver│───────────▶│    etcd      │
│ kube-scheduler       │                 │ kube-scheduler│            └──────────────┘
│ kube-controller-mgr  │                 │ controller-mgr│            ┌──────────────┐
│ etcd (같은 노드)      │                 └──────────────┘            │    etcd      │
└─────────────────────┘                                              └──────────────┘
   (kubeadm 기본값)                        컨트롤 플레인과 etcd가
                                            물리적으로 분리된 노드
```

| 구분 | Stacked | External |
|---|---|---|
| 구성 복잡도 | 낮음 (kubeadm 기본) | 높음 (etcd 클러스터 별도 운영) |
| 장애 격리 | control-plane 노드 장애 시 etcd도 함께 손실 | etcd 장애와 control-plane 장애가 분리됨 |
| 리소스 경합 | apiserver와 etcd가 같은 노드의 CPU/디스크 경합 | 없음 — etcd 전용 디스크/CPU 확보 가능 |
| 확장성 | control-plane 노드 수 = etcd 노드 수로 고정 | etcd 노드 수를 독립적으로 조정 가능 |
| 적합 대상 | 대부분의 클러스터, `kind`/`kubeadm` 기본 구성 | 대규모·고성능 요구 클러스터, 관리형 서비스(예: 일부 클라우드 EKS/GKE 내부 구성) |

`kind` 클러스터(`k8s-guide`)는 **stacked** 구성이다 — `k8s-guide-control-plane` 노드 안에 etcd static Pod가 함께 뜬다.

```bash
docker exec k8s-guide-control-plane crictl ps --name etcd
```

### Learner 멤버 — 안전한 노드 추가

etcd 3.4+는 **learner** 멤버 타입을 지원한다. 새 노드를 바로 투표권 있는(voting) 멤버로 추가하면, 그 노드가 아직 리더의 로그를 다 따라잡지 못한 상태에서 과반수 계산에 끼어들어 **일시적으로 클러스터의 장애 허용치를 낮추거나 쓰기 지연을 늘릴 위험**이 있다.

```
① 새 노드를 learner로 추가
   → 로그 복제는 받지만 투표에는 참여하지 않음
   → 리더의 최신 상태를 따라잡는 동안 quorum에 영향 없음

② 로그가 충분히 따라잡히면(caught up)
   → learner를 voting member로 승격
   → 이제부터 과반수 계산에 포함됨
```

```bash
# learner로 멤버 추가
etcdctl member add etcd-new --peer-urls=https://10.0.0.4:2380 --learner

# 따라잡음 확인 후 승격
etcdctl member promote <learner-member-id>
```

**이 메커니즘 덕분에 3노드 → 5노드로 확장하거나, 장애 노드를 교체할 때 일시적으로도 quorum이 불안정해지는 구간을 없앨 수 있다.** 프로덕션에서 etcd 멤버를 교체할 때는 항상 "하나를 지우고 하나를 바로 voting으로 추가"하는 대신, learner로 추가 → 승격 → (필요 시) 기존 멤버 제거의 순서를 권장한다.

## 실습: etcd 직접 들여다보기

**① 인증서 위치 확인 및 etcdctl 별칭 만들기**

```bash
docker exec k8s-guide-control-plane ls /etc/kubernetes/pki/etcd/
```
```
ca.crt  ca.key  healthcheck-client.crt  healthcheck-client.key
peer.crt  peer.key  server.crt  server.key
```

```bash
docker exec k8s-guide-control-plane bash -c '
export ETCDCTL_API=3
alias e="etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key"
'
```

**② /registry 아래 키 구조 탐색**

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  get /registry --prefix --keys-only | sed 's#/registry/##' | cut -d/ -f1 | sort -u
```
```
clusterrolebindings
clusterroles
configmaps
deployments.apps
endpointslices
namespaces
pods
secrets
services
serviceaccounts
...
```

**③ Pod를 만들고 원본 데이터 확인**

```bash
kubectl run etcd-demo --image=nginx:alpine
```

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  get /registry/pods/default/etcd-demo
```

**출력이 사람이 읽을 수 없는 바이너리(protobuf)로 나온다.** 2장에서 본 "스토리지 버전 → protobuf 직렬화"가 실제로 이렇게 저장된다는 증거다.

**④ resourceVersion과 etcd revision의 일치 확인**

```bash
kubectl get pod etcd-demo -o jsonpath='{.metadata.resourceVersion}{"\n"}'
```

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  get /registry/pods/default/etcd-demo --write-out=json | jq '.kvs[0].mod_revision'
```

**두 값이 일치하는지 확인한다.**

**⑤ 스냅샷 생성 및 크기 확인**

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  snapshot save /tmp/before-compact.db

docker exec k8s-guide-control-plane etcdctl snapshot status /tmp/before-compact.db -w table
```

**⑥ 압축 전후 리비전과 DB 크기 비교**

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  endpoint status -w table
```

현재 리비전을 확인한 뒤, 그보다 낮은 값으로 압축을 실행하고 다시 상태를 비교한다.

```bash
CUR_REV=$(docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  endpoint status --write-out=json | jq -r '.[0].Status.header.revision')

docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  compact $CUR_REV
```

**압축 후 이전 리비전을 조회해 보면 에러가 난다** — 이것이 압축의 효과다.

```bash
docker exec k8s-guide-control-plane etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  get /registry/pods/default/etcd-demo --rev=1
# Error: etcdserver: mvcc: required revision has been compacted
```

**⑦ 정리**

```bash
kubectl delete pod etcd-demo
docker exec k8s-guide-control-plane rm -f /tmp/before-compact.db
```

---

## 실습 과제

**과제 1 — 키 구조 매핑**
`Deployment`, `Job`, `NetworkPolicy`, `CustomResourceDefinition`을 각각 하나씩 만들고, etcd에서 각 오브젝트의 정확한 키 경로를 확인한다. group이 있는 리소스와 core(v1) 리소스의 키 경로 차이를 정리한다.

**과제 2 — mod_revision 추적**
Pod 하나를 만든 뒤 라벨을 세 번 연속 수정하고, 매번 `resourceVersion`(=mod_revision)이 어떻게 바뀌는지, 그리고 전역 revision과 어떻게 다른지(다른 리소스에 대한 쓰기가 그 사이 끼어들면 값이 연속적이지 않을 수 있음) 관찰한다.

**과제 3 — quota-backend-bytes 초과 시뮬레이션**
`--quota-backend-bytes`를 매우 작은 값(예: 16MB)으로 낮춘 테스트 환경을 상상하며, ConfigMap을 대량 생성해 `mvcc: database space exceeded` 오류가 발생하는 조건을 조사한다. 실제로 복구하려면 압축과 디프래그, 그리고 quota 상향 중 무엇을 먼저 해야 하는지 근거를 들어 설명한다.

**과제 4 — 스냅샷 백업/복구 드라이런**
스냅샷을 저장한 뒤, 별도 디렉터리에 `snapshot restore`로 복구해 새 데이터 디렉터리를 만들어 본다(실제로 클러스터에 반영하지 않고 파일 생성까지만). `snapshot status`로 원본과 복구본의 리비전·키 개수가 일치하는지 비교한다.

**과제 5 — 타임아웃 계산**
가상의 3개 리전에 분산된 etcd 클러스터(노드 간 RTT 평균 80ms)를 가정하고, etcd 공식 권장(`election-timeout` ≥ `heartbeat-interval` × 5~10)에 따라 적절한 `--heartbeat-interval`과 `--election-timeout` 값을 설계하고 근거를 적는다.

---

## 요약

- etcd는 **Raft 합의 알고리즘**으로 여러 노드 간 상태 일치를 보장한다. 리더만 쓰기를 받고, **과반수 노드가 디스크에 기록해야** 커밋이 확정된다.
- **홀수 노드 구성**이 원칙이다. 3노드는 1개, 5노드는 2개 장애를 견딘다. 짝수 노드는 같은 노드 수의 홀수 구성 대비 이점 없이 리더 선출 위험만 늘린다.
- kube-apiserver는 오브젝트를 `/registry/<group>/<resource>/<namespace>/<name>` 키에 저장한다. etcd는 **MVCC** 모델이라 모든 쓰기가 새 리비전을 만들고, `resourceVersion`은 곧 etcd의 revision이다.
- **watch**는 저장된 과거 리비전을 재생하는 방식으로 구현된다. 리비전이 무한정 쌓이는 것을 막기 위해 **압축(compaction)**이 필요하고, 압축 후 파편화된 공간을 되찾으려면 **디프래그**가 별도로 필요하다.
- **`quota-backend-bytes`(기본 2GB)**를 넘기면 쓰기가 전면 거부된다. **`etcd_disk_wal_fsync_duration_seconds`**가 etcd 성능의 가장 민감한 선행 지표이며, 느린 디스크는 곧 불필요한 리더 재선출로 이어질 수 있다.
- **snapshot save/restore**로 백업·복구한다. etcd 스냅샷 하나가 **클러스터 전체 상태의 백업**이며, 복구 시 새 member ID로 클러스터가 재구성된다는 점과 백업 시점 이후 데이터가 유실된다는 점을 반드시 고려해야 한다.
- **stacked**(컨트롤 플레인과 etcd 동거) 구성이 대부분의 클러스터에 적합하고, **external** 구성은 장애 격리·확장성이 필요한 대규모 환경에 쓴다. **learner 멤버**는 quorum에 영향을 주지 않고 새 노드를 안전하게 따라잡힌 뒤 승격시키는 메커니즘이다.

**다음 장에서는** etcd에 쓰인 상태를 바탕으로 Pod를 어느 노드에 배치할지 결정하는 kube-scheduler의 내부를 연다.
