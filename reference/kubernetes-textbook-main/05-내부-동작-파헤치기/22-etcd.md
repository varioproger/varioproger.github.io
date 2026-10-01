# 22장. etcd

> **학습목표**
> - Raft 합의 알고리즘의 동작을 설명할 수 있다.
> - 쿠버네티스가 etcd를 어떻게 쓰는지(키 구조, MVCC, watch) 이해한다.
> - CAP 관점에서 etcd의 선택과 그 결과를 안다.
> - 저장 시 암호화를 구성하고 키를 교체할 수 있다.
> - 성능 병목을 진단하고 튜닝할 수 있다.
> - 백업과 복구를 직접 수행할 수 있다.

---

## 들어가며

21장에서 "etcd가 느려지면 모든 것이 느려진다"고 했다. 더 정확히 말하면,

> **etcd를 잃으면 클러스터를 잃는다.**

노드가 죽어도, API 서버가 죽어도 복구할 수 있다. 하지만 etcd 데이터가 사라지면 **클러스터의 모든 상태**가 사라진다. Deployment도, Service도, Secret도, RBAC도.

이 장은 그 저장소를 다룬다.

## 22.1 etcd란 무엇인가

### 성격

etcd는 **분산 키-값 저장소**다. CoreOS가 만들었고 지금은 CNCF 프로젝트다.

```
· 키-값 저장 (계층적 키 이름)
· 강한 일관성 (선형화 가능, linearizable)
· Raft 합의 알고리즘
· MVCC (다중 버전 동시성 제어)
· watch (변경 스트림)
· 리스, 트랜잭션, 압축
```

**쿠버네티스가 etcd를 고른 이유**는 두 기능 때문이다.

1. **강한 일관성** — "Pod가 3개다"에 대해 모두가 같은 답을 봐야 한다
2. **watch** — 21장에서 본 모든 조정 루프의 기반

### 클러스터 구성

```bash
kubectl get pods -n kube-system -l component=etcd
docker exec k8s-guide-control-plane crictl ps | grep etcd
```

**멤버 수는 홀수여야 한다.**

| 멤버 수 | 쿼럼(과반) | 견딜 수 있는 장애 | 비고 |
|---|---|---|---|
| 1 | 1 | 0 | 개발용 |
| **3** | 2 | **1** | ★ 일반적 |
| **5** | 3 | **2** | 대규모/고가용성 |
| 7 | 4 | 3 | 쓰기 성능 저하 시작 |
| 2 | 2 | **0** | ❌ 의미 없음 |
| 4 | 3 | 1 | ❌ 3과 같은데 비용만 늘어남 |

**짝수가 무의미한 이유**: 4개일 때 쿼럼은 3이므로 1개까지만 견딘다. 3개일 때와 같은데 서버만 하나 더 쓴다.

**멤버가 많을수록 쓰기가 느려진다.** 모든 쓰기가 과반의 확인을 받아야 하므로, 7개 이상은 권장되지 않는다.

## 22.2 Raft 합의 알고리즘

### 세 가지 역할

```
Leader     쓰기를 받고 로그를 복제한다. 클러스터에 하나
Follower   리더의 로그를 받아 적용한다
Candidate  선거 중인 상태
```

### 리더 선출

```
① 모든 멤버가 Follower로 시작
        ↓
② election timeout(기본 1000ms) 동안 리더의 하트비트가 없으면
        ↓
③ Candidate가 되어 term을 증가시키고 자신에게 투표, 다른 멤버에게 투표 요청
        ↓
④ 과반의 표를 얻으면 Leader가 된다
        ↓
⑤ heartbeat interval(기본 100ms)마다 하트비트를 보내 리더십 유지
```

**term(임기)** 은 논리적 시계다. 새 선거마다 증가하며, 오래된 term의 메시지는 무시된다. 이것으로 스플릿 브레인을 방지한다.

**타임아웃 값에 랜덤 지터**가 들어간다. 모든 멤버가 동시에 후보가 되어 표가 갈리는 것을 막기 위해서다.

### 쓰기 경로

```
클라이언트 → 아무 멤버 (Follower면 Leader로 전달)
                  ↓
              Leader가 로그 엔트리 추가
                  ↓
              모든 Follower에 복제 요청
                  ↓
              과반(자신 포함)이 **디스크에 fsync**하고 확인
                  ↓
              Leader가 커밋 → 상태 머신에 적용
                  ↓
              클라이언트에 성공 응답
                  ↓
              다음 하트비트에 커밋 인덱스를 실어 Follower도 적용
```

> **★ 여기서 성능의 본질이 드러난다**
>
> 모든 쓰기가 **과반 멤버의 디스크 fsync**를 기다린다. 따라서 etcd 쓰기 지연은 **가장 느린 과반 멤버의 디스크 지연**에 좌우된다.
>
> **네트워크 스토리지(EBS gp2, NFS)나 저성능 디스크는 etcd에 부적합하다.** 로컬 NVMe SSD가 권장된다.

### 읽기 경로

기본은 **선형화 가능(linearizable) 읽기**다.

```
① Leader가 ReadIndex를 기록
② 하트비트로 자신이 여전히 리더임을 확인 (과반 응답)
③ 그 인덱스까지 적용된 뒤 응답
```

**"내가 방금 쓴 것은 반드시 읽힌다"** 를 보장한다.

**직렬화(serializable) 읽기**도 있다.

```bash
etcdctl get /key --consistency=s      # 로컬 멤버에서 바로 읽는다
```

빠르지만 오래된 데이터를 읽을 수 있다. 쿠버네티스 API 서버는 대부분 선형화 읽기를 쓰고, `resourceVersion=0`인 목록 요청 등 일부에서만 완화한다(21.1절).

## 22.3 쿠버네티스의 etcd 사용법

### 키 구조

```
/registry/<resource-plural>/<namespace>/<name>
/registry/<cluster-scoped-resource>/<name>
```

```
/registry/pods/default/web-6c8b4f9d7c-2xk4p
/registry/deployments/default/web
/registry/services/specs/default/web
/registry/services/endpoints/default/web
/registry/secrets/default/db-secret
/registry/namespaces/production
/registry/nodes/k8s-guide-worker
/registry/clusterroles/cluster-admin
/registry/apiextensions.k8s.io/customresourcedefinitions/certificates.cert-manager.io
```

**직접 들여다보기**

```bash
docker exec -it k8s-guide-control-plane bash

export ETCDCTL_API=3
export ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt
export ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt
export ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key

# 최상위 키 구조
etcdctl get /registry --prefix --keys-only | \
  sed 's|/registry/||' | cut -d/ -f1 | sort | uniq -c | sort -rn | head -20

# 특정 Pod
etcdctl get /registry/pods/default/ --prefix --keys-only

# 값 확인 (protobuf라 읽기 어렵다)
etcdctl get /registry/pods/default/<pod-name> | head -c 500 | strings
```

> **⚠️ 값은 protobuf로 저장된다**
> API 서버는 JSON이 아니라 **protobuf**로 직렬화해 저장한다. 크기가 작고 파싱이 빠르기 때문이다. 그래서 `etcdctl get`의 출력이 사람이 읽기 어렵다.
>
> `auger` 같은 도구로 디코딩할 수 있다.
> ```bash
> etcdctl get /registry/pods/default/web -w json | jq -r .kvs[0].value | base64 -d | auger decode
> ```

### 오브젝트 수와 크기 확인

```bash
# 리소스별 개수
etcdctl get /registry --prefix --keys-only | \
  awk -F/ '{print $3}' | sort | uniq -c | sort -rn | head

# DB 크기
etcdctl endpoint status -w table
```
```
+------------------------+------------------+---------+---------+-----------+
|        ENDPOINT        |        ID        | VERSION | DB SIZE | IS LEADER |
+------------------------+------------------+---------+---------+-----------+
| https://127.0.0.1:2379 | 8e9e05c52164694d |  3.5.15 |  4.1 MB |      true |
+------------------------+------------------+---------+---------+-----------+
```

### MVCC와 리비전

etcd는 **모든 변경의 이력을 보관**한다.

```
key: /registry/pods/default/web
  revision 100: {버전 1}
  revision 250: {버전 2}
  revision 380: {버전 3}  ← 현재
```

```bash
# 특정 리비전 시점의 값 읽기
etcdctl get /registry/pods/default/web --rev=250
```

**이 리비전이 곧 쿠버네티스의 `resourceVersion`이다**(4.2절).

```bash
kubectl get pod web -o jsonpath='{.metadata.resourceVersion}'
```

**watch의 재개 지점**도 이 리비전이다(21.1절).

### 오브젝트 크기 제한

```
· 기본 최대 요청 크기: 1.5MB
· 쿠버네티스는 오브젝트당 1MB로 제한 (ConfigMap, Secret 등)
· 전체 DB 크기 기본 상한: 2GB (--quota-backend-bytes)
```

**대규모 클러스터에서는 DB 상한을 올린다.**

```yaml
--quota-backend-bytes=8589934592     # 8GB
```

> **⚠️ DB 크기 초과 시 클러스터가 읽기 전용이 된다**
> ```
> etcdserver: mvcc: database space exceeded
> ```
> **모든 쓰기가 거부된다.** Pod를 만들 수도, 지울 수도 없다. 압축과 조각 모음(22.5절)이 필요하다.

## 22.4 CAP 관점

### etcd의 선택

CAP 정리에 따르면 네트워크 분단(P)이 발생했을 때 일관성(C)과 가용성(A) 중 하나를 포기해야 한다.

**etcd는 CP를 선택한다.** 일관성을 지키고 가용성을 포기한다.

```
5개 멤버 클러스터가 3:2로 분단됨

  [3개 파티션]  쿼럼 유지 → 읽기/쓰기 계속
  [2개 파티션]  쿼럼 상실 → 쓰기 거부, 선형화 읽기도 거부
```

**쿼럼을 잃은 쪽은 아무것도 하지 않는다.** 잘못된 데이터를 반환하느니 응답하지 않는 쪽을 택한다.

### 쿠버네티스에 미치는 영향

**쿼럼 상실 시**

```
✗ Pod 생성/삭제 불가
✗ 배포 불가
✗ 스케일링 불가
✗ 컨트롤러의 조정 중단

✓ 이미 실행 중인 Pod는 계속 동작한다  ★
✓ kube-proxy의 기존 iptables 규칙은 유지 → 서비스 트래픽 정상
✓ kubelet은 로컬 상태로 컨테이너를 계속 관리
```

**이것이 쿠버네티스 설계의 중요한 특성이다.** 컨트롤 플레인이 완전히 죽어도 **데이터 플레인은 계속 서비스한다.** 새 변경이 반영되지 않을 뿐이다.

### 멤버 배치 전략

```
[3개 AZ에 각 1개]     ← 권장
  AZ 하나가 죽어도 2/3로 쿼럼 유지 ✓

[2개 AZ에 2:1]
  2개 있는 AZ가 죽으면 쿼럼 상실 ✗

[단일 AZ]
  AZ 장애 시 전체 중단 ✗
```

**리전 간 분산은 권장되지 않는다.** 22.2절에서 봤듯 모든 쓰기가 과반의 확인을 기다리므로, 리전 간 지연(수십~수백 ms)이 그대로 쓰기 지연이 된다.

## 22.5 성능과 튜닝

### 핵심 메트릭

```bash
# etcd 메트릭 (컨트롤 플레인 노드에서)
curl -sk --cert /etc/kubernetes/pki/etcd/server.crt \
     --key /etc/kubernetes/pki/etcd/server.key \
     https://127.0.0.1:2379/metrics | grep -E 'wal_fsync|backend_commit|leader_changes' | head
```

| 메트릭 | 의미 | 건강 기준 |
|---|---|---|
| `etcd_disk_wal_fsync_duration_seconds` | WAL fsync 지연 ★ | **P99 < 10ms** |
| `etcd_disk_backend_commit_duration_seconds` | 백엔드 커밋 지연 ★ | **P99 < 25ms** |
| `etcd_server_leader_changes_seen_total` | 리더 변경 횟수 | 거의 증가하지 않아야 |
| `etcd_network_peer_round_trip_time_seconds` | 피어 간 RTT | **P99 < 50ms** |
| `etcd_server_proposals_failed_total` | 실패한 제안 | 0에 가까워야 |
| `etcd_mvcc_db_total_size_in_bytes` | DB 크기 | 상한의 80% 미만 |
| `etcd_server_slow_apply_total` | 느린 적용 | 증가하면 문제 |

**`wal_fsync_duration`이 가장 중요하다.** 이 값이 높으면 디스크가 병목이다.

### 디스크 요구사항

```
· 로컬 SSD (NVMe 권장)
· 순차 IOPS: 최소 500, 권장 2000+
· fsync 지연: P99 < 10ms
· etcd 전용 디스크 (다른 워크로드와 분리)
```

**클라우드별 권장**

| 클라우드 | 권장 |
|---|---|
| AWS | io2 / gp3 (IOPS 프로비저닝), 인스턴스 스토어 |
| GCP | pd-ssd, Local SSD |
| Azure | Premium SSD, Ultra Disk |

**절대 피할 것**: NFS, gp2(버스트 크레딧 소진), 네트워크 파일 시스템, 다른 워크로드와 공유하는 디스크.

**디스크 성능 측정**

```bash
# fio로 fsync 지연 측정
fio --rw=write --ioengine=sync --fdatasync=1 \
    --directory=/var/lib/etcd --size=22m --bs=2300 \
    --name=etcd-test
# fsync/fdatasync percentiles의 99.00th가 10ms 미만이어야 한다
```

### 압축과 조각 모음

MVCC 때문에 이력이 계속 쌓인다. **압축**은 오래된 리비전을 지운다.

```yaml
# API 서버가 자동으로 수행 (기본 5분마다)
--etcd-compaction-interval=5m
```

```bash
# 수동 압축
REV=$(etcdctl endpoint status -w json | jq -r '.[0].Status.header.revision')
etcdctl compact $REV
```

**압축은 논리적 삭제일 뿐 파일 크기는 줄지 않는다.** 실제로 공간을 반환하려면 **조각 모음**이 필요하다.

```bash
etcdctl defrag --cluster
```

> **⚠️ 조각 모음 중에는 그 멤버가 응답하지 않는다**
> DB 크기에 따라 수 초에서 수십 초가 걸린다. **반드시 한 멤버씩** 수행한다.
> ```bash
> etcdctl --endpoints=https://10.0.1.10:2379 defrag
> # 완료 확인 후 다음 멤버
> etcdctl --endpoints=https://10.0.1.11:2379 defrag
> ```
>
> 클러스터 전체를 동시에 하면 쿼럼을 잃는다.

**자동화 권장**: DB 크기가 상한의 50%를 넘으면 알림을 걸고, 정기적으로(주 1회 등) 순차 조각 모음을 수행한다.

### 하트비트와 선거 타임아웃

```yaml
--heartbeat-interval=100      # ms
--election-timeout=1000       # ms (하트비트의 5~10배)
```

**지연이 큰 환경에서는 늘려야 한다.**

```
권장: heartbeat-interval ≈ 멤버 간 RTT의 최대값
      election-timeout ≈ heartbeat × 10
```

너무 짧으면 일시적 지연에도 리더 선거가 일어나 불안정해진다. `etcd_server_leader_changes_seen_total`이 자주 증가하면 이 값을 검토한다.

### etcd 부하를 줄이는 방법

**① 불필요한 오브젝트 정리**

```bash
# 완료된 Pod
kubectl delete pods -A --field-selector status.phase=Succeeded
kubectl delete pods -A --field-selector status.phase=Failed

# 완료된 Job (8.5절의 ttlSecondsAfterFinished 활용)
kubectl delete jobs -A --field-selector status.successful=1
```

**② Event 분리**

Event는 양이 많고 짧게 살다 사라진다(4.4절). 별도 etcd 클러스터로 분리할 수 있다.

```yaml
--etcd-servers-overrides=/events#https://etcd-events:2379
```

**③ 불변 ConfigMap/Secret**

7.6절에서 본 `immutable: true`는 kubelet의 watch 부담을 줄여 API 서버와 etcd 부하를 낮춘다.

**④ 대용량 오브젝트 피하기**

큰 ConfigMap을 자주 갱신하면 etcd에 리비전이 쌓인다. 큰 데이터는 오브젝트 스토리지나 PVC를 쓴다.

## 22.6 저장 시 암호화

7.4절에서 개념을 봤다. 여기서는 실제 구성과 키 교체를 다룬다.

### 암호화 없는 상태 확인

```bash
docker exec -it k8s-guide-control-plane bash
kubectl create secret generic demo --from-literal=password=SuperSecret123

export ETCDCTL_API=3
export ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt
export ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt
export ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key

etcdctl get /registry/secrets/default/demo | strings | grep -i super
# SuperSecret123          ← 평문!
```

### 암호화 설정

```bash
# 32바이트 키 생성
head -c 32 /dev/urandom | base64
```

```yaml
# /etc/kubernetes/enc/encryption-config.yaml
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
              secret: <생성한 base64 키>
      - identity: {}
```

```yaml
# kube-apiserver.yaml에 추가 (20.5절의 static Pod 편집)
spec:
  containers:
    - command:
        - kube-apiserver
        - --encryption-provider-config=/etc/kubernetes/enc/encryption-config.yaml
      volumeMounts:
        - name: enc
          mountPath: /etc/kubernetes/enc
          readOnly: true
  volumes:
    - name: enc
      hostPath:
        path: /etc/kubernetes/enc
        type: DirectoryOrCreate
```

### 기존 데이터 재암호화

**설정은 새로 쓰이는 데이터에만 적용된다.**

```bash
kubectl get secrets -A -o json | kubectl replace -f -
```

```bash
# 확인
etcdctl get /registry/secrets/default/demo | strings | head -3
# k8s:enc:aescbc:v1:key1:...     ← 암호화됨
```

### 키 교체

```
① 새 키를 두 번째 위치에 추가 → 복호화만 가능
   providers: [aescbc(key1), aescbc(key2), identity]
        ↓ API 서버 재시작
② 순서를 바꿔 새 키를 첫 번째로 → 새 쓰기는 key2로 암호화
   providers: [aescbc(key2), aescbc(key1), identity]
        ↓ API 서버 재시작
③ 모든 데이터를 재암호화
   kubectl get secrets -A -o json | kubectl replace -f -
        ↓
④ 옛 키 제거
   providers: [aescbc(key2), identity]
```

### KMS v2 — 프로덕션 권장

로컬 키 파일은 노드에 키가 평문으로 남는다는 문제가 있다. KMS는 이를 해결한다.

```yaml
resources:
  - resources: [secrets]
    providers:
      - kms:
          apiVersion: v2
          name: aws-kms
          endpoint: unix:///var/run/kmsplugin/socket.sock
          timeout: 3s
      - identity: {}
```

**KMS v2의 개선**
- DEK(데이터 암호화 키)를 로컬 캐시 → KMS 호출이 크게 줄어 성능이 좋다
- 키 ID 추적으로 **어떤 키로 암호화됐는지** 알 수 있다
- 자동 키 교체 감지

## 22.7 백업과 복구

### 백업

```bash
docker exec -it k8s-guide-control-plane bash

ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

```bash
# 검증
ETCDCTL_API=3 etcdctl snapshot status /tmp/etcd-backup.db -w table
```
```
+----------+----------+------------+------------+
|   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
+----------+----------+------------+------------+
| 2f4a1b9c |     4821 |       1247 |     4.1 MB |
+----------+----------+------------+------------+
```

**자동화 예시 (CronJob)**

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: etcd-backup
  namespace: kube-system
spec:
  schedule: "0 */6 * * *"
  timeZone: "Asia/Seoul"
  concurrencyPolicy: Forbid              # 8.5절
  jobTemplate:
    spec:
      template:
        spec:
          hostNetwork: true
          nodeSelector:
            node-role.kubernetes.io/control-plane: ""
          tolerations:
            - operator: Exists
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: registry.k8s.io/etcd:3.5.15-0
              command:
                - sh
                - -c
                - |
                  set -e
                  TS=$(date +%Y%m%d-%H%M%S)
                  ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-$TS.db \
                    --endpoints=https://127.0.0.1:2379 \
                    --cacert=/etc/kubernetes/pki/etcd/ca.crt \
                    --cert=/etc/kubernetes/pki/etcd/server.crt \
                    --key=/etc/kubernetes/pki/etcd/server.key
                  etcdctl snapshot status /backup/etcd-$TS.db -w table
                  # 7일 이상 된 백업 삭제
                  find /backup -name 'etcd-*.db' -mtime +7 -delete
              volumeMounts:
                - { name: certs,  mountPath: /etc/kubernetes/pki/etcd, readOnly: true }
                - { name: backup, mountPath: /backup }
          volumes:
            - name: certs
              hostPath: { path: /etc/kubernetes/pki/etcd }
            - name: backup
              hostPath: { path: /var/backups/etcd, type: DirectoryOrCreate }
```

> **⚠️ 백업을 노드에만 두면 안 된다**
> 노드가 죽으면 백업도 사라진다. **반드시 외부 스토리지(S3 등)로 복사**한다. 위 CronJob에 업로드 단계를 추가하거나, 사이드카로 동기화한다.
>
> 또한 **백업 파일에는 모든 Secret이 들어 있다.** 암호화되지 않은 상태라면 백업 자체가 심각한 보안 위험이다. 22.6절의 저장 시 암호화가 여기서도 중요하다.

### 복구

**단일 노드 복구**

```bash
# ① 컨트롤 플레인 정지 (static Pod 매니페스트를 옮긴다)
mkdir -p /tmp/manifests-backup
mv /etc/kubernetes/manifests/*.yaml /tmp/manifests-backup/
sleep 20    # kubelet이 Pod를 정리할 시간

# ② 기존 데이터 백업 후 제거
mv /var/lib/etcd /var/lib/etcd.old

# ③ 스냅샷에서 복원
ETCDCTL_API=3 etcdctl snapshot restore /tmp/etcd-backup.db \
  --data-dir=/var/lib/etcd \
  --name=k8s-guide-control-plane \
  --initial-cluster=k8s-guide-control-plane=https://127.0.0.1:2380 \
  --initial-advertise-peer-urls=https://127.0.0.1:2380

# ④ 소유권 확인
chown -R root:root /var/lib/etcd

# ⑤ 컨트롤 플레인 재시작
mv /tmp/manifests-backup/*.yaml /etc/kubernetes/manifests/

# ⑥ 확인
sleep 60
kubectl get nodes
kubectl get pods -A
```

**멀티 노드 복구**

각 멤버에서 같은 스냅샷으로 복원하되, `--initial-cluster`에 전체 멤버를 나열한다.

```bash
etcdctl snapshot restore /backup/etcd.db \
  --data-dir=/var/lib/etcd \
  --name=etcd-1 \
  --initial-cluster=etcd-1=https://10.0.1.10:2380,etcd-2=https://10.0.1.11:2380,etcd-3=https://10.0.1.12:2380 \
  --initial-advertise-peer-urls=https://10.0.1.10:2380 \
  --initial-cluster-token=restored-cluster      # ★ 새 토큰
```

**`--initial-cluster-token`을 새로 주는 것이 중요하다.** 옛 클러스터의 멤버가 실수로 합류하는 것을 막는다.

### 복구 후 확인 사항

```bash
# ① 노드 상태
kubectl get nodes

# ② 컨트롤 플레인
kubectl get pods -n kube-system

# ③ 워크로드
kubectl get deploy,sts,ds -A

# ④ 백업 시점 이후 생성된 리소스는 사라졌다
#    → 그 사이의 변경은 다시 적용해야 한다 (GitOps라면 자동, 30장)

# ⑤ 볼륨 상태 확인
kubectl get pv,pvc -A
```

> **⚠️ etcd 복구는 볼륨 데이터를 되돌리지 않는다**
> etcd에는 **PV/PVC 오브젝트**만 있고, 실제 데이터는 클라우드 디스크에 있다. etcd를 3일 전으로 되돌려도 디스크의 데이터는 현재 상태다.
>
> **불일치가 생길 수 있다.** 예를 들어 백업 이후 삭제된 PVC의 PV가 다시 나타나면, 이미 삭제된 클라우드 디스크를 가리킬 수 있다.
>
> 12.6절의 Velero는 오브젝트와 볼륨 스냅샷을 **함께** 백업하므로 이 문제가 덜하다.

## 22.8 실습: 백업과 복구 전 과정

**① 상태 만들기**

```bash
kubectl create namespace backup-test
kubectl create deployment app --image=nginx:alpine -n backup-test --replicas=2
kubectl create configmap important --from-literal=data=critical-value -n backup-test
kubectl get all -n backup-test
```

**② 백업**

```bash
docker exec k8s-guide-control-plane sh -c '
ETCDCTL_API=3 etcdctl snapshot save /tmp/backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key && \
ETCDCTL_API=3 etcdctl snapshot status /tmp/backup.db -w table'
```

**③ 재해 시뮬레이션**

```bash
kubectl delete namespace backup-test
kubectl get ns backup-test
# Error from server (NotFound)
```

**④ 복구**

```bash
docker exec k8s-guide-control-plane bash -c '
set -e
mkdir -p /tmp/mb
mv /etc/kubernetes/manifests/*.yaml /tmp/mb/
sleep 25
mv /var/lib/etcd /var/lib/etcd.old
ETCDCTL_API=3 etcdctl snapshot restore /tmp/backup.db \
  --data-dir=/var/lib/etcd \
  --name=k8s-guide-control-plane \
  --initial-cluster=k8s-guide-control-plane=https://127.0.0.1:2380 \
  --initial-advertise-peer-urls=https://127.0.0.1:2380
mv /tmp/mb/*.yaml /etc/kubernetes/manifests/
echo "restore done, waiting for control plane..."
'
```

**⑤ 확인**

```bash
sleep 90
kubectl get ns backup-test
kubectl get all -n backup-test
kubectl get configmap important -n backup-test -o jsonpath='{.data.data}'
# critical-value       ← 복구됨!
```

**⑥ 정리**

```bash
kubectl delete namespace backup-test
docker exec k8s-guide-control-plane rm -rf /var/lib/etcd.old /tmp/backup.db
```

## 22.9 etcd 진단

### 상태 확인

```bash
export ETCDCTL_API=3
export ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt
export ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt
export ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key

etcdctl endpoint health --cluster -w table
etcdctl endpoint status --cluster -w table
etcdctl member list -w table
etcdctl alarm list                        # 발생한 알람
```

### 증상별 대응

| 증상 | 원인 | 대응 |
|---|---|---|
| `etcdserver: request timed out` | 디스크 느림, 네트워크 지연 | `wal_fsync_duration` 확인, 디스크 교체 |
| `mvcc: database space exceeded` | DB 상한 초과 | 압축 + 조각 모음, `--quota-backend-bytes` 상향 |
| `etcdserver: too many requests` | 부하 과다 | APF 확인(21.2절), 클라이언트 조사 |
| 리더가 자주 바뀜 | 네트워크 불안정, 타임아웃 짧음 | `election-timeout` 상향, 네트워크 점검 |
| `context deadline exceeded` | 전반적 성능 저하 | 메트릭 종합 점검 |
| 멤버 하나가 unhealthy | 그 노드 문제 | 멤버 제거 후 재추가 |
| API 서버가 매우 느림 | etcd 지연 | `etcd_request_duration_seconds`(21.6절) |

### 알람 해제

```bash
etcdctl alarm list
# memberID:8e9e05c52164694d alarm:NOSPACE

# 압축과 조각 모음 후
etcdctl alarm disarm
```

### 멤버 교체

```bash
# ① 문제 멤버 제거
etcdctl member list
etcdctl member remove <MEMBER_ID>

# ② 새 멤버 추가
etcdctl member add etcd-new --peer-urls=https://10.0.1.20:2380

# ③ 새 노드에서 etcd 시작 (--initial-cluster-state=existing)
```

---

## 실습 과제

**과제 1 — MVCC 리비전 확인**
ConfigMap을 여러 번 수정하고, 각 리비전의 값을 `etcdctl get --rev=N`으로 조회한다. `kubectl`의 `resourceVersion`과 etcd 리비전이 어떻게 대응하는지 확인한다.

**과제 2 — 암호화 전후 비교**
22.6절의 절차로 암호화를 설정하고, Secret이 etcd에서 어떻게 보이는지 전후를 비교한다. 그다음 키 교체를 수행하고 옛 키를 제거해도 데이터를 읽을 수 있는지 확인한다.

**과제 3 — 디스크 성능 측정**
`fio`로 etcd 데이터 디렉터리의 fsync 지연을 측정한다. 그다음 인위적으로 디스크에 부하를 주고(`dd if=/dev/zero of=/var/lib/etcd/big bs=1M count=2000`) `etcd_disk_wal_fsync_duration_seconds`가 어떻게 변하는지, API 서버 응답 속도에 어떤 영향이 있는지 관찰한다.

**과제 4 — DB 크기 상한 도달 재현**
`--quota-backend-bytes`를 매우 작게(예: 16MB) 설정하고 ConfigMap을 대량 생성해 `database space exceeded`를 재현한다. 압축과 조각 모음으로 복구한다.

**과제 5 — 복구 시나리오 시간 측정**
22.8절의 전 과정을 수행하며 각 단계의 소요 시간을 기록해 **RTO(복구 목표 시간)** 를 산정한다. 백업 주기가 6시간이라면 **RPO(복구 시점 목표)** 는 얼마인가?

---

## 요약

- etcd는 **Raft 합의 기반의 강한 일관성 키-값 저장소**이며, 쿠버네티스는 그 **일관성**과 **watch** 때문에 채택했다.
- 멤버 수는 **홀수(3 또는 5)** 여야 하고, 짝수는 내결함성이 늘지 않으면서 비용만 증가한다. 멤버가 많을수록 쓰기가 느려진다.
- **모든 쓰기가 과반 멤버의 디스크 fsync를 기다린다.** 따라서 etcd 성능은 디스크에 좌우된다. **`etcd_disk_wal_fsync_duration_seconds`의 P99가 10ms 미만**이어야 하며, NFS나 gp2는 부적합하다.
- 키는 `/registry/<resource>/<namespace>/<name>` 구조이고 값은 **protobuf**로 저장된다. MVCC 리비전이 곧 쿠버네티스의 **`resourceVersion`** 이다.
- etcd는 **CP를 선택**한다. 쿼럼을 잃으면 쓰기와 선형화 읽기를 거부한다. 하지만 **이미 실행 중인 Pod는 계속 동작하고 서비스 트래픽도 정상**이다 — 컨트롤 플레인과 데이터 플레인의 분리가 만드는 특성이다.
- 멤버는 **3개 AZ에 하나씩** 배치한다. 리전 간 분산은 쓰기 지연 때문에 권장되지 않는다.
- **DB 크기 상한(기본 2GB)을 넘으면 클러스터가 읽기 전용이 된다.** 압축은 논리적 삭제일 뿐이고, 실제 공간 반환은 **조각 모음**이 필요하며 **반드시 한 멤버씩** 수행한다.
- 저장 시 암호화는 **KMS v2**가 프로덕션 권장이다. 설정은 새 쓰기에만 적용되므로 **기존 데이터는 재암호화**해야 한다.
- 백업은 `etcdctl snapshot save`로 하고 **반드시 외부 스토리지에 보관**한다. 백업 파일에는 모든 Secret이 들어 있으므로 그 자체가 보호 대상이다.
- **etcd 복구는 볼륨 데이터를 되돌리지 않는다.** 오브젝트와 볼륨을 함께 다루려면 Velero가 필요하다(12.6절).

**다음 장에서는** 5부의 마지막 주제인 네트워크를 연다. CNI 플러그인이 Pod에 네트워크를 붙이는 과정을 추적하고, 대규모 클러스터의 네트워크 장애를 계층별로 진단하는 법을 다룬다.

---

**참고 원서**: *Core Kubernetes* 12장
