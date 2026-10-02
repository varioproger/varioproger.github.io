---
title: "20장. etcd"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 20
---

# 20장. etcd

> **🎮 게임 서버 개발자에게** — etcd는 게임 서버로 치면 **여러 대가 복제하는 "월드 상태 DB"이고, 쓰기는 과반수 서버의 디스크에 fsync된 뒤에야 성공으로 응답하는 DB**다. 그래서 이 장은 이미 익숙한 두 감각이 그대로 쓰인다. 하나는 "fsync 지연이 곧 쓰기 지연"이라는 디스크 감각, 다른 하나는 "과반수가 살아 있어야 쓴다"는 가용성 감각이다. 새로운 점은 이 저장소가 값을 덮어쓰지 않고 **리비전(revision)을 계속 쌓는 MVCC**라는 것, 그리고 그 리비전이 곧 쿠버네티스의 `resourceVersion`이자 watch의 재개 지점이라는 것이다. 이 장의 핵심 결론은 하나다. **etcd를 잃으면 클러스터를 잃는다.**
>
> **🎯 실무에서 이 장이 필요한 순간**
> - `etcdserver: mvcc: database space exceeded`가 뜨면서 Pod를 만들 수도, 지울 수도 없다.
> - 컨트롤 플레인 노드 한두 대가 죽었는데 게임 서버가 계속 도는지, 새 방을 만들 수 있는지 판단해야 한다.
> - 클러스터 백업 정책을 정해야 하는데 "무엇을 어디에 두면 되는지" 모른다.

## 코어 — 이것만은 100%

> **한 문장:** etcd는 Raft 합의로 과반수의 디스크 fsync를 받아야 쓰기가 커밋되는 강한 일관성(CP) 키-값 저장소이고, 값을 덮어쓰지 않고 리비전을 쌓는 MVCC라서 압축·조각 모음·백업이 운영의 핵심이다.

1. **Raft 쓰기 = 과반수 fsync** — 리더가 로그를 복제하고 과반수가 디스크에 쓰고 ACK하면 커밋한다. 쓰기 지연의 하한은 디스크 fsync 지연이고, 노드는 홀수(3 또는 5)로 구성한다.
2. **CP 선택** — 쿼럼을 잃으면 쓰기와 선형화 읽기를 거부한다. 쿠버네티스에서는 변경이 멈추지만 이미 실행 중인 Pod와 기존 iptables 규칙은 계속 동작한다.
3. **키 구조와 MVCC** — `/registry/<resource>/<namespace>/<name>`, 값은 protobuf. 전역 revision이 `resourceVersion`이며 낙관적 동시성 제어(`409 Conflict`)와 watch 재개의 기반이다.
4. **압축 ≠ 용량 반환** — 압축은 과거 이력을 논리적으로 지울 뿐이고 파일 크기는 조각 모음(`defrag`)으로만 준다. DB가 `quota-backend-bytes`(기본 2GB)를 넘으면 클러스터가 쓰기 불가가 된다.
5. **백업 = 스냅샷** — `etcdctl snapshot save` 하나가 클러스터 전체 상태 백업이다. 노드 밖으로 복사해야 하고, 안에 모든 Secret이 있으므로 보안 대상이다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| DB 커밋 전 WAL `fsync` (저널링) | Raft 로그 + WAL fsync | 디스크에 확정돼야 성공 응답, 디스크가 느리면 전체가 느림 | 한 대의 fsync가 아니라 **과반수 노드 모두의** fsync를 기다린다. 가장 느린 과반 멤버가 지연을 정한다 |
| 마스터 서버 선출(하트비트 타임아웃) | 리더 선출(term, election timeout) | 하트비트가 끊기면 후보가 나서 새 마스터를 뽑는다 | 선출 타임아웃이 노드마다 **무작위**이고, 과반수 표가 없으면 아무도 리더가 되지 못한다. 디스크가 느려도 선출이 반복된다 |
| 게임 데이터 낙관적 락(버전 번호 비교 후 UPDATE) | `resourceVersion`과 `mod_revision` | "읽었을 때 버전과 같을 때만 쓰기" | 버전은 키 단위가 아니라 etcd **전역 단조 증가 카운터**다 |
| 로그/스냅샷 + 재생(리플레이) | MVCC 리비전 + watch 재생 | 과거 리비전이 있으니 "그 시점 이후 변경"을 재생할 수 있다 | 이력이 무한히 쌓이므로 **압축하지 않으면 DB가 터진다** |
| 서버 상태 덤프 파일 | `snapshot save` | 한 시점 전체 상태를 파일로 저장 | 복구는 덮어쓰기가 아니라 **새 Raft 클러스터를 새로 만드는** 작업이고, 스냅샷 이후의 변경은 유실된다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. etcd 노드를 3대에서 4대로 늘리면 장애 허용 수가 늘까?
> 2. etcd를 빠른 SSD가 아닌 네트워크 디스크에 두면 왜 위험할까?
> 3. 같은 키를 수정했는데 이전 값은 어디로 갈까? 그 결과 어떤 일이 생길까?
> 4. etcd가 쿼럼을 잃으면 이미 돌고 있는 게임 서버 Pod도 죽을까?
>
> **처리법:** 🛠 실습 `etcdctl endpoint status -w table`, `etcdctl get /registry/pods/default/ --prefix --keys-only`, `etcdctl snapshot save`/`status` → 바로 실행 · 🗺 관계도 Raft 쓰기 경로(리더→팔로워 fsync→커밋), 압축 → 조각 모음 → 파일 크기 · 📦 카드로 노드 수/쿼럼/허용 장애 표, 핵심 메트릭 기준(fsync P99 < 10ms)

### 이 장에서 배우는 것

- Raft의 리더 선출, 로그 복제, 과반수 원칙과 홀수 노드의 이유
- 쿠버네티스가 etcd를 쓰는 방식(키 구조, protobuf, MVCC, 낙관적 동시성, watch)
- CP 선택이 쿠버네티스 장애 양상에 미치는 영향
- 압축, 조각 모음, quota, fsync 중심의 성능·운영
- 스냅샷 백업과 복구의 의미와 한계

---

## 코어 1. Raft 쓰기 = 과반수 fsync

### 1.1 etcd가 선택된 이유

**한 줄 요약:** 강한 일관성과 watch, 이 두 가지 때문에 쿠버네티스는 etcd를 쓴다.

etcd는 분산 키-값 저장소(CNCF 프로젝트)로 강한 일관성(선형화 가능), Raft, MVCC, watch, 리스·트랜잭션·압축을 제공한다. 쿠버네티스가 고른 이유는 두 가지다.

1. **강한 일관성** — "Pod가 3개다"에 대해 모두가 같은 답을 봐야 한다.
2. **watch** — [18장](18-클러스터-아키텍처-총론.md)에서 본 모든 조정 루프의 기반이다.

kube-apiserver는 etcd의 **유일한 클라이언트**다(어그리게이션 API 서버 제외). 다른 컴포넌트는 반드시 apiserver를 거친다. apiserver는 상태를 저장하지 않으므로 재시작해도 클러스터는 그대로지만, etcd 데이터가 사라지면 클러스터가 사라진다.

### 1.2 리더 선출

**한 줄 요약:** 하트비트가 끊기면 후보가 term을 올리고 과반수 표를 얻어 리더가 된다.

역할은 Leader(쓰기를 받고 복제), Follower(받아서 적용), Candidate(선거 중) 셋이다.

```
① 모든 멤버가 Follower로 시작
② election timeout(기본 1000ms) 동안 리더 하트비트가 없으면
③ Candidate가 되어 term을 +1, 자신에게 투표, 다른 멤버에게 RequestVote
④ 과반의 표를 얻으면 Leader
⑤ heartbeat interval(기본 100ms)마다 하트비트로 리더십 유지
```

- **term(임기)** 은 논리적 시계다. 리더가 바뀔 때마다 증가하고 모든 메시지에 실려, 오래된 term의 메시지는 무시된다(스플릿 브레인 방지). 한 term에는 최대 한 명의 리더만 존재한다.
- **타임아웃에 무작위 지터**가 들어간다. 모든 멤버가 동시에 후보가 되어 표가 갈리는 것을 막기 위해서다.
- 후보는 자신보다 로그가 최신인 노드에게는 투표받지 못하도록 강제된다. 그래서 커밋된 데이터를 가진 노드만 리더가 되며, **한번 커밋된 엔트리는 어떤 리더가 와도 사라지지 않는다.**

### 1.3 쓰기 경로와 읽기 경로

**한 줄 요약:** 쓰기는 과반수의 디스크 fsync를 기다리고, 읽기는 기본적으로 리더 확인을 거치는 선형화 읽기다.

```
클라이언트(apiserver) → 아무 멤버 (Follower면 Leader로 전달)
    Leader가 로그 엔트리 추가
    모든 Follower에 복제 요청 (AppendEntries)
    과반(자신 포함)이 디스크에 fsync하고 ACK
    Leader가 커밋 → 상태 머신에 적용 → 클라이언트에 성공 응답
    다음 하트비트에 커밋 인덱스를 실어 Follower도 적용
```

> **★ 성능의 본질** 모든 쓰기가 **과반 멤버의 디스크 fsync**를 기다린다. etcd 쓰기 지연은 가장 느린 과반 멤버의 디스크 지연에 좌우된다. 네트워크 스토리지(EBS gp2, NFS)나 저성능 디스크는 부적합하고 로컬 NVMe SSD가 권장된다.

읽기는 기본이 **선형화(linearizable) 읽기**다. 리더가 `ReadIndex`를 기록하고, 하트비트로 자신이 여전히 리더임을 과반수로 확인한 뒤, 그 인덱스까지 적용되면 응답한다. "내가 방금 쓴 것은 반드시 읽힌다"를 보장한다. 직렬화(serializable) 읽기(`--consistency=s`)는 로컬 멤버에서 바로 읽어 빠르지만 오래된 데이터를 읽을 수 있고, apiserver는 대부분 선형화 읽기를 쓴다.

### 1.4 왜 홀수 노드인가

**한 줄 요약:** 과반수는 `⌊N/2⌋+1`, 허용 장애는 `⌊(N-1)/2⌋`이며 짝수는 비용만 늘린다.

| 노드 수(N) | 과반수 | 허용 장애 수 | 비고 |
|---|---|---|---|
| 1 | 1 | 0 | 개발·테스트용 |
| 2 | 2 | 0 | 의미 없음 |
| 3 | 2 | 1 | 가장 흔한 구성 |
| 4 | 3 | 1 | 3과 같은데 노드만 하나 더 든다 |
| 5 | 3 | 2 | 대규모·고가용 |
| 7 | 4 | 3 | 쓰기 성능 저하 시작 |

노드가 늘수록 기다려야 하는 ACK도 늘어 쓰기가 느려진다(가용성과 쓰기 지연은 트레이드오프). 7개 이상은 권장되지 않는다. 안전성은 "어떤 두 과반수 집합도 최소 한 노드가 겹친다"는 성질에서 나온다. 새 노드를 안전하게 추가하려면 etcd 3.4+의 **learner**(투표권 없이 로그만 따라잡는 멤버)로 추가한 뒤 승격(`member promote`)한다.

## 코어 2. CP 선택과 쿠버네티스 장애 양상

### 2.1 쿼럼을 잃으면

**한 줄 요약:** 잘못된 데이터를 돌려주느니 응답하지 않는 쪽을 택하고, 쿠버네티스는 변경만 멈추고 기존 워크로드는 유지한다.

CAP에서 etcd는 CP를 택한다. 5개 멤버가 3:2로 분단되면 3개 쪽은 읽기/쓰기를 계속하고, 2개 쪽은 쓰기와 선형화 읽기를 거부한다.

```
쿼럼 상실 시
 ✗ Pod 생성/삭제 불가, 배포 불가, 스케일링 불가, 컨트롤러의 조정 중단
 ✓ 이미 실행 중인 Pod는 계속 동작
 ✓ kube-proxy의 기존 iptables 규칙 유지 → 서비스 트래픽 정상
 ✓ kubelet은 로컬 상태로 컨테이너를 계속 관리
```

컨트롤 플레인이 완전히 죽어도 데이터 플레인은 계속 서비스한다. 새 변경이 반영되지 않을 뿐이다.

### 2.2 멤버 배치

**한 줄 요약:** 3개 AZ에 1개씩이 권장이고, 리전 간 분산은 쓰기 지연 때문에 권장되지 않는다.

```
[3개 AZ에 각 1개]  권장: AZ 하나가 죽어도 2/3로 쿼럼 유지
[2개 AZ에 2:1]    2개 있는 AZ가 죽으면 쿼럼 상실
[단일 AZ]         AZ 장애 시 전체 중단
```

모든 쓰기가 과반의 확인을 기다리므로 리전 간 지연(수십&#126;수백 ms)이 그대로 쓰기 지연이 된다. 토폴로지는 stacked(control-plane 노드에 etcd 동거, kubeadm 기본, 단순하지만 노드 장애가 etcd 손실이 되고 CPU·디스크를 경합)와 external(etcd 별도 노드, 장애 격리와 전용 디스크, 운영이 복잡)이 있다([18장](18-클러스터-아키텍처-총론.md)).

## 코어 3. 키 구조와 MVCC

### 3.1 /registry 키 구조와 protobuf

**한 줄 요약:** 오브젝트는 `/registry/<resource>/<namespace>/<name>` 키에 protobuf로 저장되고, 프리픽스 range 조회로 목록을 얻는다.

```
/registry/pods/default/web-6c8b4f9d7c-2xk4p
/registry/deployments/default/web
/registry/secrets/default/db-secret
/registry/namespaces/production
/registry/nodes/k8s-guide-worker           (클러스터 스코프는 namespace 계층 없음)
```

키는 렉시코그래픽 정렬된 B-tree(bbolt)에 저장되므로 `kubectl get pods -n default`는 `/registry/pods/default/` 프리픽스 조회 하나로 끝난다. 값은 JSON이 아니라 protobuf라 `etcdctl get` 출력이 읽기 어렵다(`auger` 같은 도구로 디코딩).

```bash
etcdctl get /registry/pods/default/ --prefix --keys-only
etcdctl get /registry --prefix --keys-only | sed 's|/registry/||' | cut -d/ -f1 | sort | uniq -c | sort -rn | head
```

저장 크기 제한은 기본 최대 요청 1.5MB, 쿠버네티스는 오브젝트당 1MB, 전체 DB는 기본 2GB(`--quota-backend-bytes`)다.

### 3.2 MVCC와 resourceVersion

**한 줄 요약:** 쓰기는 덮어쓰지 않고 새 리비전을 만들며, 그 전역 리비전이 곧 `resourceVersion`이다.

```
key: /registry/pods/default/web
  revision 100: {버전 1}
  revision 250: {버전 2}
  revision 380: {버전 3}  ← 현재
```

- **revision은 클러스터 전체에서 단조 증가하는 전역 카운터**다. 키가 달라도 쓰기마다 1씩 오른다.
- apiserver 응답의 `resourceVersion`이 바로 이 etcd revision이다.
- **낙관적 동시성 제어** — 수정 시 `resourceVersion`을 함께 보내면 etcd 트랜잭션이 "현재 `mod_revision`이 읽었던 값과 같을 때만 쓰기"를 보장한다. 그사이 바뀌었으면 `409 Conflict`.
- **watch 재개 지점**도 이 리비전이다. 과거 리비전이 압축 전까지 실제로 저장돼 있어 "그 시점 이후 변경"을 재생할 수 있다. 동시에 이것이 이력이 무한히 쌓이는 문제의 원인이다.

```bash
kubectl get pod web -o jsonpath='{.metadata.resourceVersion}'
etcdctl get /registry/pods/default/web --rev=250          # 과거 리비전 읽기
```

etcd watch는 gRPC 양방향 스트림이며 여러 watch를 하나의 TCP 연결에 다중화한다. apiserver가 리소스 종류별로 이 연결을 재사용하므로 연결 수가 억제된다([19장](19-kube-apiserver.md)의 watch cache가 이 위에 선다).

## 코어 4. 압축·조각 모음·quota

### 4.1 압축은 이력을 지울 뿐 파일을 줄이지 않는다

**한 줄 요약:** 압축 → 빈 페이지 재사용 가능, 파일 축소는 `defrag`가 한다.

MVCC 때문에 수정된 키의 이전 버전과 삭제된 키의 tombstone이 쌓인다. 압축 없이 방치하면 리비전 증가 → DB 파일 무한 증가 → `quota-backend-bytes` 초과 → 쓰기 거부로 이어진다.

- **압축(compaction)** 은 특정 리비전보다 오래된 이력을 지운다(최신 값은 유지). 수동은 `etcdctl compact <rev>`. 자동 압축은 `periodic`(시간 기준)·`revision`(개수 기준) 모드가 있고 보통 5분 안팎이 기본이다. 너무 짧으면 오래된 `resourceVersion`으로 watch를 재개하는 클라이언트가 `410 Gone`을 더 자주 받는다([19장](19-kube-apiserver.md)).
- **압축은 논리적 삭제일 뿐 파일 크기는 줄지 않는다.** 실제 공간을 반환하려면 **조각 모음(`defrag`)** 이 필요하다. `endpoint status`의 `DB SIZE`와 `DB SIZE IN USE`의 차이가 크면 신호다.

> **⚠️ 조각 모음 중에는 그 멤버가 응답하지 않는다.** 수 초&#126;수십 초가 걸리므로 **반드시 한 멤버씩** 한다. 클러스터 전체를 동시에 하면 쿼럼을 잃는다.

> **⚠️ DB 크기 초과 시 클러스터가 읽기 전용이 된다.** `etcdserver: mvcc: database space exceeded`가 뜨면 모든 쓰기가 거부되어 Pod를 만들 수도 지울 수도 없다. 압축과 조각 모음이 필요하다. 상한을 8GB까지 올리기도 하지만 DB가 클수록 압축·조각 모음·스냅샷 비용도 커지므로, 완료된 Job·오래된 Event 같은 불필요한 오브젝트를 줄이는 것이 먼저다.

### 4.2 성능 핵심: fsync와 타임아웃

**한 줄 요약:** 건강 기준은 WAL fsync P99 10ms 미만이고, 느린 디스크는 리더 선출 스톰으로 번진다.

fsync가 수십&#126;수백 ms로 늘면 리더가 하트비트를 제때 못 보내고 팔로워가 리더 부재로 오판해 불필요한 재선출이 반복된다. 디스크 문제가 선출 문제로 번진다.

| 메트릭 | 의미 | 건강 기준 |
|---|---|---|
| `etcd_disk_wal_fsync_duration_seconds` | WAL fsync 지연 (가장 중요) | P99 < 10ms |
| `etcd_disk_backend_commit_duration_seconds` | 백엔드 커밋 지연 | P99 < 25ms |
| `etcd_server_leader_changes_seen_total` | 리더 변경 횟수 | 거의 증가하지 않아야 |
| `etcd_network_peer_round_trip_time_seconds` | 피어 간 RTT | P99 < 50ms |
| `etcd_mvcc_db_total_size_in_bytes` | DB 크기 | 상한의 80% 미만 |

디스크는 etcd 전용 로컬 SSD(NVMe 권장)를 쓰고 NFS·gp2·공유 디스크는 피한다. 타임아웃은 `--heartbeat-interval=100`, `--election-timeout=1000`(ms)이며 **election-timeout은 heartbeat의 5&#126;10배**를 권장한다. RTT가 큰 환경에서는 늘려야 하고, 너무 짧으면 일시적 지연에도 선거가 일어나 불안정해진다.

etcd 부하를 줄이는 방법: 완료된 Pod/Job 정리, Event를 별도 etcd로 분리(`--etcd-servers-overrides=/events#...`), 불변 ConfigMap/Secret(`immutable: true`), 대용량 오브젝트 회피(큰 ConfigMap을 자주 갱신하면 리비전이 쌓인다).

## 코어 5. 백업과 복구

### 5.1 스냅샷이 곧 클러스터 백업

**한 줄 요약:** `snapshot save` 하나에 `/registry/` 아래 모든 것(Secret, RBAC, CRD 포함)이 담긴다.

```bash
ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
etcdctl snapshot status /tmp/etcd-backup.db -w table     # HASH, REVISION, TOTAL KEYS, TOTAL SIZE
```

- **노드 밖(S3 등 외부 스토리지)으로 복사**한다. 노드 로컬에만 두면 노드가 죽을 때 백업도 사라진다.
- **백업 파일에는 모든 Secret이 들어 있다.** 암호화하지 않은 상태라면 백업 자체가 보안 위험이다. apiserver의 `EncryptionConfiguration`([19장](19-kube-apiserver.md)) 적용이 여기서도 중요하다. 키 교체는 새 키를 두 번째로 추가 → 순서를 바꿔 새 키를 첫 번째로 → 전체 재암호화(`kubectl get secrets -A -o json | kubectl replace -f -`) → 옛 키 제거 순이고, 프로덕션에서는 KMS v2가 권장된다(로컬 키 파일은 노드에 평문 키가 남는다).
- 정기 백업은 CronJob으로 자동화할 수 있다. 백업 주기가 곧 잠재적 데이터 손실 윈도우다.

### 5.2 복구의 함의

**한 줄 요약:** 복구는 새 Raft 클러스터를 만드는 일이고, 스냅샷 이후 변경은 사라지며, 삭제된 리소스가 되살아날 수 있다.

단일 노드 복구는 대략 다음 순서다: static Pod 매니페스트를 옮겨 컨트롤 플레인을 정지 → 기존 `/var/lib/etcd`를 `.old`로 보관 → `etcdctl snapshot restore ... --data-dir=...` → 매니페스트 복원 후 재기동.

1. 복구된 클러스터는 새 member ID를 갖는다. 멀티 노드는 모든 노드에서 같은 스냅샷으로 각자 restore한 뒤 새 `--initial-cluster`로 동시에 새 클러스터를 형성한다.
2. 스냅샷 이후의 변경은 모두 유실된다.
3. 복구 후 apiserver가 새 데이터 디렉터리의 etcd에 다시 연결되도록 한다(static Pod의 `--data-dir` 경로 확인).
4. 백업 이후 삭제된 리소스(예: Pod)가 복구본에는 남아 있어 컨트롤러가 재조정하는 과도기가 생길 수 있다.

> **[보충]** Velero 등 별도 백업 도구는 쿠버네티스 API로 오브젝트를 덤프하는 방식이고, etcd 스냅샷은 API를 거치지 않고 저장 계층 전체를 떠낸다는 점이 차이다(원천 3장의 설명을 요약).

## 실무 적용

### 체크리스트

- [ ] etcd는 홀수(3 또는 5)이고, 3개 AZ에 1개씩 분산했다. 리전 간 분산은 피했다.
- [ ] etcd 디스크는 전용 로컬 SSD이며 `etcd_disk_wal_fsync_duration_seconds` P99가 10ms 미만이다.
- [ ] `etcd_mvcc_db_total_size_in_bytes`가 `quota-backend-bytes`의 80%를 넘으면 알림이 온다.
- [ ] 압축이 자동으로 돌고, 조각 모음은 한 멤버씩 순차로 수행하는 절차가 있다.
- [ ] 완료된 Job/Pod, 오래된 Event 등 불필요한 오브젝트가 쌓이지 않게 TTL을 설정했다.
- [ ] `snapshot save`가 정기 자동화되어 있고 외부 스토리지로 복사되며, 복구 절차를 실제로 리허설했다.
- [ ] Secret 저장 시 암호화(가능하면 KMS v2)를 적용했고 백업 파일 접근을 통제한다.
- [ ] 쿼럼 상실 시 변경은 멈추지만 실행 중인 Pod는 유지된다는 영향 범위를 팀이 공유했다.

### 시나리오로 확인하기

1. **상황:** 어느 날 `kubectl run`과 `kubectl delete`가 모두 `etcdserver: mvcc: database space exceeded`로 실패한다.
   **질문:** 원인과 복구 순서는?

   <details markdown="1"><summary>답 확인</summary>

   DB가 `quota-backend-bytes`(기본 2GB)를 초과해 모든 쓰기가 거부된 것이다. 이력 압축(`compact`)으로 과거 리비전을 지우고, 이어 조각 모음(`defrag`)으로 파일 크기를 줄인다. 조각 모음은 한 멤버씩 순차로 한다. 근본 대책은 불필요한 오브젝트(완료된 Job, 오래된 Event 등) 줄이기이고 자동 압축·정기 조각 모음·DB 크기 알림을 설정한다. → 코어 4

   </details>

2. **상황:** 3대 etcd 중 2대가 동시에 죽었다. 운영 중이던 게임 서버 Pod는 어떻게 되고, 무엇을 할 수 없나?
   **질문:** 영향 범위를 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   쿼럼(3노드 중 2)을 잃어 쓰기와 선형화 읽기가 거부되므로 Pod 생성·삭제·스케일링·배포가 불가능하고 컨트롤러 조정이 멈춘다. 그러나 이미 실행 중인 Pod는 kubelet이 로컬 상태로 계속 관리하고, kube-proxy의 기존 iptables 규칙도 유지되어 서비스 트래픽은 정상이다. 새 변경이 반영되지 않을 뿐이다. 복구는 죽은 멤버를 되살려 쿼럼을 회복하는 것이다. → 코어 2

   </details>

3. **상황:** 비용 절감을 위해 etcd 디스크를 공유 NFS로 옮겼더니 컨트롤 플레인이 느려지고 리더가 자주 바뀐다.
   **질문:** 왜 이런 일이 생기며 무엇을 봐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   모든 쓰기는 과반 멤버의 WAL fsync를 기다리므로 디스크 지연이 곧 쓰기 지연이다. fsync가 늘면 리더가 하트비트를 제때 못 보내 팔로워가 리더 부재로 판단하고 재선출이 반복된다. `etcd_disk_wal_fsync_duration_seconds`(P99 < 10ms)와 `etcd_server_leader_changes_seen_total`을 확인하고 etcd 전용 로컬 SSD로 되돌린다. → 코어 1, 4

   </details>

4. **상황:** 새벽 3시 백업 스냅샷으로 복구했는데, 그날 오후에 만든 Deployment가 없고 오전에 지운 Pod가 다시 나타났다.
   **질문:** 정상인가?

   <details markdown="1"><summary>답 확인</summary>

   정상이다. 복구는 스냅샷 시점의 상태로 새 Raft 클러스터를 만드는 것이라 그 이후 변경은 유실되고, 백업 이후 삭제된 리소스는 복구본에 남아 되살아날 수 있다. 컨트롤러가 재조정하는 과도기가 생긴다. 백업 주기가 곧 손실 윈도우이므로 주기를 업무 요건에 맞춘다. → 코어 5

   </details>

---

📖 출처: `Kubernetes_Internals_Network_Guide/01-내부-아키텍처/03-etcd와-데이터-계층.md`, `kubernetes-textbook-main/05-내부-동작-파헤치기/22-etcd.md`

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 쓰기: 클라이언트 → Leader 로그 추가 → ____ 복제 → 과반수 ____ fsync → ____ → 응답
         역할 3: ____ / ____ / ____      타임아웃: heartbeat ____ms, election ____ms (5~10배)
         과반수 = ____ ; 허용 장애 = ____ ; 3노드 ____, 5노드 ____ ; 짝수는 ____

[코어 2] etcd = CAP 중 ( ? ). 쿼럼 상실 시: 안 되는 것 ____ / 유지되는 것 ____

[코어 3] 키: /registry/____/____/____ ; 값 형식: ____
         revision = 전역 ____ 카운터 = k8s의 ____ ; 충돌 응답: ____

[코어 4] 압축 = ____ 삭제 / 파일 줄이기 = ____ ; 한도 초과 에러: ____ ; 기본 quota: ____
         건강 기준: wal_fsync P99 < ____ ms ; defrag는 ____ 멤버씩

[코어 5] 백업: etcdctl ____ save ; 복구 = 새 ____ 클러스터 ; 이후 변경 ____
```

### 2. 인출 질문

1. etcd 쓰기가 커밋되기까지의 경로를 설명하고, 쓰기 지연의 하한이 무엇인지 말하라.

   <details markdown="1"><summary>답 확인</summary>

   클라이언트 요청이 리더에 도달해 로그 엔트리가 추가되고, AppendEntries로 팔로워에 복제되며, 과반수(자신 포함)가 디스크에 fsync하고 ACK하면 리더가 커밋하고 상태 머신에 적용한 뒤 성공을 응답한다. 하한은 과반 멤버의 디스크 fsync 지연이다. → 코어 1

   </details>

2. 노드 4대가 3대보다 나을 게 없는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   4노드의 과반수는 3이라 허용 장애 수가 3노드와 같은 1이다. 노드는 하나 더 들고 쓰기 ACK 수가 늘어 지연만 증가한다. 허용 장애를 늘리려면 5노드(허용 2)로 간다. → 코어 1.4

   </details>

3. Raft에서 term과 무작위 election timeout은 각각 무엇을 막는가?

   <details markdown="1"><summary>답 확인</summary>

   term은 리더 교체마다 증가하는 논리적 시계로 오래된 리더의 메시지를 무시하게 해 스플릿 브레인을 막는다. 무작위 타임아웃은 모든 노드가 동시에 후보가 되어 표가 갈리는 충돌을 줄인다. → 코어 1.2

   </details>

4. 쿼럼을 잃어도 실행 중인 Pod가 죽지 않는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   etcd는 CP라서 쿼럼 상실 시 변경(쓰기)만 거부된다. 노드의 kubelet은 로컬 상태로 컨테이너를 계속 관리하고 kube-proxy의 iptables 규칙도 그대로라서 데이터 플레인은 계속 서비스한다. 컨트롤 플레인이 하는 "새 변경 반영"만 멈춘다. → 코어 2

   </details>

5. `resourceVersion`과 etcd revision의 관계, 그리고 `409 Conflict`가 나는 조건은?

   <details markdown="1"><summary>답 확인</summary>

   `resourceVersion`은 etcd의 전역 단조 증가 revision(키의 `mod_revision`)이다. 수정 요청이 읽었던 resourceVersion을 함께 보내면 etcd 트랜잭션이 현재 `mod_revision`과 같을 때만 쓰며, 그사이 바뀌었으면 409 Conflict다(낙관적 동시성 제어). → 코어 3.2

   </details>

6. 압축을 했는데 DB 파일 크기가 줄지 않는다. 왜 그렇고 어떻게 해결하나?

   <details markdown="1"><summary>답 확인</summary>

   압축은 과거 리비전을 논리적으로 지워 빈 페이지를 만들 뿐 boltdb 파일 크기는 줄지 않는다. 조각 모음(`defrag`)이 실제 공간을 반환하며, 수행 중에는 해당 멤버가 응답하지 않으므로 한 멤버씩 순차로 한다. `DB SIZE`와 `DB SIZE IN USE` 차이가 신호다. → 코어 4

   </details>

7. `database space exceeded`가 클러스터에 미치는 영향은?

   <details markdown="1"><summary>답 확인</summary>

   DB가 quota(기본 2GB)를 넘으면 모든 쓰기가 거부되어 Pod를 만들 수도 지울 수도 없는 읽기 전용 상태가 된다. 압축과 조각 모음으로 복구하고, 불필요한 오브젝트 증가를 줄이며, 크기 알림을 설정한다. → 코어 4

   </details>

8. 스냅샷 백업과 복구에서 반드시 기억할 주의점 세 가지는?

   <details markdown="1"><summary>답 확인</summary>

   (1) 백업은 노드 밖 스토리지로 복사한다. (2) 백업에는 모든 Secret이 있으므로 저장 시 암호화와 접근 통제가 필요하다. (3) 복구는 새 Raft 클러스터를 만드는 것이고 스냅샷 이후 변경은 유실되며 삭제된 리소스가 되살아날 수 있다. → 코어 5

   </details>

### 3. 기억 고리

- **C++ 유추:** DB 커밋 전 WAL fsync = Raft 로그 fsync ⚠️ 한 대가 아니라 **과반수**의 fsync를 기다리므로 가장 느린 과반 멤버가 지연을 정한다.
- **C++ 유추:** 낙관적 락(버전 비교 후 UPDATE) = `resourceVersion` ⚠️ 키별 버전이 아니라 etcd **전역 리비전**이다.
- **비유:** etcd = 국회의 의결. 과반수가 출석해 표결(fsync)해야 법안(쓰기)이 통과된다. 의결 정족수가 안 되면 아무것도 통과 못 하지만, 이미 집행 중인 사업(실행 중인 Pod)은 계속된다. ⚠️ 비유가 깨지는 지점: 회의록(MVCC 이력)이 계속 쌓여서 주기적으로 폐기(압축)하고 서고를 비워야(defrag) 한다.
- **묶음(3):** Raft 3역할(Leader/Follower/Candidate) / 운영 3종(압축·조각 모음·백업) / 홀수 노드 3·5·7.
- **대칭:** 압축(논리 삭제) ↔ 조각 모음(물리 반환), 선형화 읽기(안전) ↔ 직렬화 읽기(빠름), stacked(단순) ↔ external(격리), 쿼럼 상실 시 변경 ✗ ↔ 실행 중 워크로드 ✓.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "etcd에 쓰기 한 번이 커밋되기까지 무슨 일이 일어나는가"를 처음 듣는 사람에게 설명해 보세요. 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "etcd 디스크가 느리면 왜 리더가 계속 바뀌는가"를 WAL fsync와 하트비트 타임아웃으로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "etcd 노드를 4대로 늘리면 더 안전하다" vs B "홀수로 유지해야 한다" — 양쪽을 번갈아 변호해 보세요. (쿼럼, 허용 장애, 쓰기 지연, 네트워크 분할을 근거로)
- **AI 역할 반전:** "내가 압축과 조각 모음의 차이를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
