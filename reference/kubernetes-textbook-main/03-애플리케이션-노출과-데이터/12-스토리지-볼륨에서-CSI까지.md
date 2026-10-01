---
title: "12장. 스토리지: 볼륨에서 CSI까지"
---

# 12장. 스토리지: 볼륨에서 CSI까지

> **학습목표**
> - 워크로드의 스토리지 요구를 세 가지로 분류하고 적절한 볼륨 타입을 고를 수 있다.
> - PV / PVC / StorageClass의 관계와 바인딩 과정을 설명할 수 있다.
> - 동적 프로비저닝을 구성하고 볼륨 바인딩 모드의 차이를 안다.
> - 접근 모드·회수 정책·볼륨 확장을 실무 관점에서 판단할 수 있다.
> - CSI 아키텍처의 구성 요소와 마운트 과정을 추적할 수 있다.
> - 상태 저장 워크로드의 백업 전략을 설계할 수 있다.

---

## 들어가며

2장에서 컨테이너의 파일 시스템 변경은 휘발성이라고 했다. overlayfs의 upperdir은 컨테이너가 사라지면 함께 사라진다. 5장에서는 `emptyDir`로 컨테이너 간 파일을 공유했지만, 그것도 Pod가 삭제되면 없어진다.

이 장은 **레이어 구조 밖으로 나가는 방법**을 다룬다.

## 12.1 스토리지 요구의 세 가지 유형

모든 스토리지 요구는 대략 셋 중 하나다. 이 분류를 먼저 하면 선택이 쉬워진다.

| 유형 | 수명 | 공유 범위 | 볼륨 타입 |
|---|---|---|---|
| **① 임시 스크래치** | Pod와 동일 | 같은 Pod 내 컨테이너 | `emptyDir` |
| **② 설정·시크릿 주입** | Pod와 동일 (내용은 외부에서 관리) | 같은 Pod | `configMap`, `secret`, `downwardAPI`, `projected` |
| **③ 영구 데이터** | Pod보다 오래 | Pod를 넘어 유지 | `persistentVolumeClaim` |

7장에서 ②를, 5장에서 ①을 이미 다뤘다. 이 장의 주제는 ③이다.

### ① 임시 볼륨

```yaml
volumes:
  # 디스크 기반 스크래치
  - name: scratch
    emptyDir:
      sizeLimit: 1Gi

  # 메모리 기반 (tmpfs) — 빠르지만 컨테이너 메모리 한도를 소비한다
  - name: cache
    emptyDir:
      medium: Memory
      sizeLimit: 256Mi
```

`emptyDir`은 **컨테이너 재시작에는 살아남지만 Pod 삭제에는 사라진다.** 6장에서 본 재시작과 재생성의 차이가 여기서도 적용된다.

> **`medium: Memory`는 메모리를 소비한다**
> tmpfs에 쓴 데이터는 컨테이너의 메모리 사용량에 포함된다. 1GB를 쓰면 `limits.memory`에서 1GB가 차감되고, 초과하면 `OOMKilled`다(14장). 캐시 용도로 크게 잡을 때 주의해야 한다.

**`generic ephemeral volume`** (v1.23+ GA)이라는 중간 형태도 있다. PVC의 기능(동적 프로비저닝, 특정 StorageClass)을 쓰면서 수명은 Pod와 같게 한다.

```yaml
volumes:
  - name: scratch
    ephemeral:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          storageClassName: fast-ssd
          resources:
            requests:
              storage: 100Gi
```

큰 임시 공간이 필요한 데이터 처리 작업에 유용하다. Pod가 삭제되면 볼륨도 자동 삭제된다.

### hostPath — 쓰지 말아야 할 이유

```yaml
volumes:
  - name: host-data
    hostPath:
      path: /var/lib/mydata
      type: DirectoryOrCreate
```

노드의 파일 시스템을 직접 마운트한다. **일반 애플리케이션에서는 쓰면 안 된다.**

- Pod가 다른 노드로 옮겨가면 **데이터가 없다.** 스케줄링과 데이터가 분리되어 있다.
- 노드의 파일 시스템에 접근하는 것은 **심각한 보안 위험**이다. `/`를 마운트하면 노드를 장악할 수 있다(18장).
- 노드가 죽으면 데이터도 죽는다.

**정당한 용도는 시스템 컴포넌트뿐이다.** DaemonSet으로 도는 로그 수집기가 `/var/log/pods`를 읽거나, 모니터링 에이전트가 `/proc`을 읽는 경우(8.4절).

로컬 디스크의 성능이 필요하다면 `hostPath` 대신 **Local PersistentVolume**을 쓴다. 노드 어피니티가 자동으로 붙어 Pod가 데이터가 있는 노드로 스케줄된다.

## 12.2 PV / PVC / StorageClass

### 세 리소스의 역할

쿠버네티스는 스토리지를 **요구하는 쪽**과 **제공하는 쪽**을 분리한다.

```
   개발자                          클러스터 운영자
     │                                  │
     ▼                                  ▼
┌──────────┐                    ┌──────────────┐
│   PVC    │  "10Gi 짜리         │ StorageClass │  "이런 종류의
│          │   빠른 디스크 주세요" │              │   스토리지를 제공한다"
└────┬─────┘                    └──────┬───────┘
     │                                 │
     │         ┌──────────┐            │
     └────────►│    PV    │◄───────────┘
       바인딩   │          │  프로비저너가 생성
               └────┬─────┘
                    │
              실제 스토리지 (EBS, 디스크, NFS ...)
```

| 리소스 | 스코프 | 누가 만드는가 | 의미 |
|---|---|---|---|
| **PersistentVolume (PV)** | 클러스터 | 운영자 또는 프로비저너 | 실제 스토리지 조각 |
| **PersistentVolumeClaim (PVC)** | 네임스페이스 | 개발자 | 스토리지 요청 |
| **StorageClass (SC)** | 클러스터 | 운영자 | 스토리지 "종류"의 정의 |

**개발자는 PV를 직접 다루지 않는다.** PVC로 요청하면 시스템이 알아서 PV를 붙여 준다.

### PVC — 개발자가 쓰는 것

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard        # 생략하면 기본 StorageClass
  resources:
    requests:
      storage: 10Gi
```

Pod에서 사용:

```yaml
spec:
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
  containers:
    - name: app
      volumeMounts:
        - name: data
          mountPath: /var/lib/data
```

### PV — 시스템이 만드는 것

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pvc-3f2a1b9c-4d5e
spec:
  capacity:
    storage: 10Gi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Delete
  storageClassName: standard
  volumeMode: Filesystem            # 또는 Block
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: vol-0abc123def456
    fsType: ext4
  nodeAffinity:                     # 이 볼륨에 접근 가능한 노드
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: topology.ebs.csi.aws.com/zone
              operator: In
              values: [ap-northeast-2a]
```

**`nodeAffinity`가 중요하다.** EBS 볼륨은 특정 AZ에 묶여 있으므로, 그 AZ의 노드에만 붙을 수 있다. 스케줄러가 이것을 고려한다.

### StorageClass — 스토리지의 "종류"

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:                         # 프로비저너별로 다름
  type: gp3
  iops: "6000"
  throughput: "250"
  encrypted: "true"
  kmsKeyId: "arn:aws:kms:..."
reclaimPolicy: Delete               # 또는 Retain
allowVolumeExpansion: true          # ★ 나중에 늘릴 수 있는가
volumeBindingMode: WaitForFirstConsumer
mountOptions:
  - noatime
```

```bash
kubectl get storageclass
# NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE
# standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer
```

**여러 클래스를 정의해 티어를 만든다.**

```
fast-ssd      → NVMe, 높은 IOPS, 비쌈    → 데이터베이스
standard      → 범용 SSD                 → 일반 애플리케이션
cold-hdd      → 마그네틱, 저렴           → 아카이브, 로그
shared-nfs    → NFS, RWX 지원            → 여러 Pod가 공유
```

### 바인딩 과정

```
① PVC 생성
     │
     ▼
② PV 컨트롤러가 매칭되는 PV를 찾는다
     │  (용량 ≥ 요청, accessMode 호환, storageClass 일치)
     │
     ├─ 있음 → 바인딩 (정적 프로비저닝)
     │
     └─ 없음 → StorageClass의 프로비저너 호출
                    │
                    ▼
              ③ 실제 스토리지 생성 (EBS 볼륨 등)
                    │
                    ▼
              ④ PV 오브젝트 생성 후 바인딩 (동적 프로비저닝)
```

**바인딩은 1:1이며 배타적이다.** 한 PVC는 하나의 PV에만, 한 PV는 하나의 PVC에만 바인딩된다. 10Gi를 요청했는데 100Gi PV가 매칭되면 **100Gi 전체를 차지한다.**

```bash
kubectl get pvc
# NAME   STATUS   VOLUME                CAPACITY   ACCESS MODES   STORAGECLASS
# data   Bound    pvc-3f2a1b9c-4d5e     10Gi       RWO            standard
```

**PVC의 상태**

| STATUS | 의미 |
|---|---|
| `Pending` | 매칭되는 PV가 없거나 프로비저닝 대기 중 |
| `Bound` | PV와 연결됨 |
| `Lost` | 바인딩된 PV가 사라짐 |

### volumeBindingMode — 중요한 선택

```yaml
volumeBindingMode: Immediate            # 또는 WaitForFirstConsumer
```

**`Immediate`**: PVC가 생성되는 즉시 PV를 만들고 바인딩한다.

**문제**: 멀티 AZ 클러스터에서 볼륨이 `ap-northeast-2a`에 생겼는데, 스케줄러가 Pod를 `2c` 노드에 배치하려 하면 **영원히 스케줄되지 않는다.**

```
PVC 생성 → EBS 볼륨이 AZ-a에 생성됨
Pod 생성 → 스케줄러: "AZ-c에 여유가 있네" → 배치 시도
        → 볼륨이 AZ-a에 있어서 마운트 불가 → Pending 영구화
```

**`WaitForFirstConsumer`** (권장): Pod가 스케줄될 때까지 기다렸다가, **결정된 노드에 맞춰** 볼륨을 만든다.

```
PVC 생성 → 대기 (Pending)
Pod 생성 → 스케줄러가 노드 결정 (리소스, 어피니티 고려)
        → 그 노드의 AZ에 볼륨 생성
        → 마운트 성공
```

**대부분의 클라우드 StorageClass는 이것이 기본값이다.** 직접 만든다면 반드시 이렇게 설정하자.

## 12.3 접근 모드, 회수 정책, 볼륨 확장

### 접근 모드 (accessModes)

| 모드 | 약칭 | 의미 |
|---|---|---|
| `ReadWriteOnce` | RWO | **하나의 노드**에서 읽기/쓰기 |
| `ReadOnlyMany` | ROX | 여러 노드에서 읽기 전용 |
| `ReadWriteMany` | RWX | **여러 노드**에서 읽기/쓰기 |
| `ReadWriteOncePod` | RWOP | **하나의 Pod**에서만 (v1.29+ GA) |

> **⚠️ RWO는 "하나의 Pod"가 아니라 "하나의 노드"다**
> 같은 노드에 있는 여러 Pod는 RWO 볼륨을 동시에 마운트할 수 있다. 이것이 데이터 손상의 원인이 되기도 한다.
>
> 정말 단일 Pod만 접근하게 하려면 **`ReadWriteOncePod`** 를 쓴다.

**어떤 스토리지가 RWX를 지원하는가?**

| 스토리지 | RWO | RWX |
|---|---|---|
| AWS EBS, GCP PD, Azure Disk | ✅ | ❌ |
| AWS EFS, Azure Files, GCP Filestore | ✅ | ✅ |
| NFS | ✅ | ✅ |
| CephFS, GlusterFS, Longhorn | ✅ | ✅ |
| 로컬 디스크 | ✅ | ❌ |

**블록 스토리지는 대부분 RWX를 지원하지 않는다.** 여러 Pod가 파일을 공유해야 한다면 파일 스토리지(NFS 계열)를 써야 하고, 성능은 블록보다 떨어진다.

> **RWX가 정말 필요한지 다시 생각해 보자**
> "여러 Pod가 같은 파일에 접근해야 한다"는 요구는 대개 아키텍처 문제의 신호다.
> - 업로드 파일 저장 → **오브젝트 스토리지(S3)** 가 정답
> - 캐시 공유 → Redis
> - 로그 수집 → 중앙 로그 시스템 (31장)
>
> RWX는 성능과 비용 면에서 불리하다. 대안을 먼저 검토하자.

### 회수 정책 (reclaimPolicy)

PVC가 삭제됐을 때 PV와 실제 데이터를 어떻게 할지 정한다.

| 정책 | 동작 |
|---|---|
| `Delete` | PV와 **실제 스토리지를 삭제**한다. 데이터가 사라진다 |
| `Retain` | PV를 `Released` 상태로 두고 **데이터를 보존**한다. 수동 정리 필요 |
| `Recycle` | (폐기됨) |

**대부분의 동적 프로비저닝 StorageClass는 `Delete`가 기본값이다.**

```bash
kubectl delete pvc data      # → 실제 EBS 볼륨까지 삭제됨!
```

> **⚠️ 프로덕션 데이터에는 `Retain`을 쓰자**
> ```yaml
> reclaimPolicy: Retain
> ```
> 실수로 PVC를 지워도 데이터가 남는다. 대신 정리를 수동으로 해야 한다.
>
> **개별 PV만 바꿀 수도 있다.**
> ```bash
> kubectl patch pv <pv-name> -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
> ```
> 중요한 볼륨에는 이 명령을 습관화하자.

**`Retain`된 PV 재사용하기**

```bash
# ① PVC 삭제 후 PV는 Released 상태
kubectl get pv
# STATUS: Released

# ② claimRef를 제거하면 다시 Available이 된다
kubectl patch pv <pv-name> -p '{"spec":{"claimRef": null}}'

# ③ 새 PVC가 바인딩될 수 있다
```

### 볼륨 확장

```yaml
# StorageClass에서 허용해야 한다
allowVolumeExpansion: true
```

```bash
# PVC의 요청 크기를 늘린다
kubectl patch pvc data -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'

# 상태 확인
kubectl get pvc data -o jsonpath='{.status.conditions}'
```

**확장은 늘리는 것만 가능하다. 줄일 수 없다.**

확장 과정은 두 단계다.
1. **볼륨 확장**: 클라우드 API로 디스크 크기 증가 (온라인 가능)
2. **파일 시스템 확장**: `resize2fs` 등으로 FS 확대

과거에는 Pod 재시작이 필요했지만, 현재는 대부분 **온라인 확장**이 가능하다(`ExpandInUsePersistentVolumes`).

```bash
kubectl get pvc data
# CAPACITY가 바로 바뀌지 않을 수 있다. conditions를 확인하자
kubectl describe pvc data
# Conditions:
#   Type: FileSystemResizePending    ← Pod 재시작 필요한 경우
```

## 12.4 CSI — Container Storage Interface

### 왜 CSI인가

2장에서 CRI(런타임 인터페이스)를 봤다. 스토리지에도 같은 이야기가 있다.

**과거(in-tree 플러그인)**: 모든 스토리지 드라이버 코드가 **쿠버네티스 본체 안에** 있었다.

```
kubernetes/
  pkg/volume/
    aws_ebs/
    gce_pd/
    azure_disk/
    cephfs/
    glusterfs/
    ... 수십 개
```

**문제**
- 스토리지 벤더가 버그를 고치려면 쿠버네티스 릴리스를 기다려야 했다
- 드라이버 버그가 kubelet이나 컨트롤러 매니저를 죽일 수 있었다
- 쿠버네티스 코드베이스가 계속 비대해졌다
- 벤더의 자격증명이 컨트롤 플레인에 있어야 했다

**CSI**는 스토리지 드라이버를 **클러스터 밖의 별도 컴포넌트**로 분리한다. gRPC 인터페이스로 통신하며, 벤더가 독립적으로 개발·배포할 수 있다.

**in-tree 플러그인은 모두 CSI로 마이그레이션됐다.** v1.31에서 대부분 제거됐다.

### CSI 아키텍처

CSI 드라이버는 두 부분으로 배포된다.

```
┌─────────── 컨트롤러 플레인 (Deployment, 보통 1~2 replica) ───────────┐
│                                                                    │
│  ┌────────────────┐  ┌──────────────┐  ┌───────────────┐          │
│  │ external-      │  │ external-    │  │ external-     │          │
│  │ provisioner    │  │ attacher     │  │ resizer       │  사이드카  │
│  └───────┬────────┘  └──────┬───────┘  └───────┬───────┘          │
│          └──────────────────┼──────────────────┘                  │
│                             ▼                                     │
│                    ┌─────────────────┐                            │
│                    │  CSI 드라이버     │ → 클라우드 API 호출          │
│                    │  (Controller)   │   (볼륨 생성/삭제/연결)       │
│                    └─────────────────┘                            │
└────────────────────────────────────────────────────────────────────┘

┌─────────── 노드 플러그인 (DaemonSet, 모든 노드) ─────────────────────┐
│                                                                    │
│  ┌──────────────────┐         ┌─────────────────┐                 │
│  │ node-driver-     │         │  CSI 드라이버     │                 │
│  │ registrar        │         │  (Node)         │ → 실제 마운트     │
│  └──────────────────┘         └─────────────────┘                 │
└────────────────────────────────────────────────────────────────────┘
```

**사이드카 컨테이너들**은 쿠버네티스 프로젝트가 제공하는 공통 부품이다. 벤더는 CSI 드라이버 본체만 구현하면 된다.

| 사이드카 | 역할 | 대응 CSI 호출 |
|---|---|---|
| `external-provisioner` | PVC 감시 → 볼륨 생성 | `CreateVolume` / `DeleteVolume` |
| `external-attacher` | VolumeAttachment 감시 → 노드에 연결 | `ControllerPublishVolume` |
| `external-resizer` | PVC 크기 변경 감시 | `ControllerExpandVolume` |
| `external-snapshotter` | VolumeSnapshot 처리 | `CreateSnapshot` |
| `node-driver-registrar` | kubelet에 드라이버 등록 | - |
| `livenessprobe` | 드라이버 헬스체크 | `Probe` |

### 볼륨이 Pod에 마운트되기까지

전체 흐름을 따라가 보자.

```
① PVC 생성
        ↓
② external-provisioner가 감지
        ↓
③ CSI CreateVolume 호출 → 클라우드에 실제 볼륨 생성 (예: EBS vol-abc)
        ↓
④ PV 오브젝트 생성 및 PVC와 바인딩
        ↓
⑤ Pod가 스케줄됨 (노드 결정)
        ↓
⑥ external-attacher가 VolumeAttachment 생성
        ↓
⑦ CSI ControllerPublishVolume → 볼륨을 노드에 연결 (EBS attach)
        ↓
⑧ kubelet이 CSI NodeStageVolume 호출
        → 노드의 글로벌 경로에 마운트 + 포맷
        /var/lib/kubelet/plugins/kubernetes.io/csi/.../globalmount
        ↓
⑨ kubelet이 CSI NodePublishVolume 호출
        → Pod의 볼륨 디렉터리로 바인드 마운트
        /var/lib/kubelet/pods/<pod-uid>/volumes/...
        ↓
⑩ 컨테이너 시작 (해당 경로가 mountPath로 보인다)
```

**⑧과 ⑨가 나뉜 이유**: 같은 노드의 여러 Pod가 같은 볼륨을 쓸 때, 스테이지(포맷·마운트)는 한 번만 하고 퍼블리시(바인드 마운트)만 여러 번 한다.

**노드에서 직접 확인해 보기**

```bash
docker exec k8s-guide-worker sh -c 'ls /var/lib/kubelet/pods/*/volumes/ 2>/dev/null | head'
docker exec k8s-guide-worker mount | grep kubelet
```

20장에서 kubelet의 볼륨 관리자를 더 깊이 다룬다.

### VolumeSnapshot

CSI는 스냅샷도 표준화했다.

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: ebs-snapclass
driver: ebs.csi.aws.com
deletionPolicy: Retain
---
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: data-snapshot-20260901
spec:
  volumeSnapshotClassName: ebs-snapclass
  source:
    persistentVolumeClaimName: data
```

**스냅샷에서 복원**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-restored
spec:
  storageClassName: fast-ssd
  dataSource:
    name: data-snapshot-20260901
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 10Gi
```

**PVC 복제**도 가능하다.

```yaml
  dataSource:
    name: data
    kind: PersistentVolumeClaim
```

> **⚠️ 스냅샷 ≠ 애플리케이션 백업**
> 볼륨 스냅샷은 **디스크의 특정 시점 이미지**다. 데이터베이스가 트랜잭션 중이었다면 일관성 없는 상태가 찍힐 수 있다.
>
> 일관된 백업을 위해서는:
> - 애플리케이션 수준 백업 (`pg_dump`, `mysqldump`)
> - 스냅샷 전에 파일 시스템 플러시/락 (`fsfreeze`)
> - Velero의 백업 훅으로 앱에 준비 신호 전달
>
> 12.6절에서 다룬다.

## 12.5 실습: 동적 프로비저닝

kind 클러스터에는 `local-path-provisioner`가 기본 설치되어 있다. 실제 클라우드 CSI 드라이버와 흐름은 동일하다.

**① StorageClass 확인**

```bash
kubectl get storageclass
kubectl describe storageclass standard
```

```
Name:            standard
IsDefaultClass:  Yes
Provisioner:     rancher.io/local-path
ReclaimPolicy:   Delete
VolumeBindingMode: WaitForFirstConsumer
```

**② PVC 생성 — 아직 Pending**

```yaml
# pvc-demo.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: demo-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
```

```bash
kubectl apply -f pvc-demo.yaml
kubectl get pvc demo-data
```

```
NAME        STATUS    VOLUME   CAPACITY   STORAGECLASS
demo-data   Pending                       standard
```

```bash
kubectl describe pvc demo-data | tail -5
# Normal  WaitForFirstConsumer  waiting for first consumer to be created before binding
```

**`WaitForFirstConsumer`의 동작을 직접 확인한 것이다.** Pod가 없으니 어느 노드에 만들지 결정할 수 없어 대기한다.

**③ Pod 생성 → 바인딩**

```yaml
# pod-with-pvc.yaml
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: demo-data
  containers:
    - name: app
      image: busybox
      command:
        - sh
        - -c
        - |
          echo "written at $(date) by $(hostname)" >> /data/log.txt
          cat /data/log.txt
          sleep 3600
      volumeMounts:
        - name: data
          mountPath: /data
```

```bash
kubectl apply -f pod-with-pvc.yaml
kubectl get pvc demo-data
```

```
NAME        STATUS   VOLUME                                     CAPACITY
demo-data   Bound    pvc-a1b2c3d4-5e6f-7890-abcd-ef1234567890   1Gi
```

**Pod가 생기자 PV가 만들어지고 바인딩됐다.**

```bash
kubectl get pv
kubectl logs writer
# written at Mon Sep  1 10:23:11 UTC 2026 by writer
```

**④ 데이터 영속성 확인** — 핵심 실습

```bash
# Pod 삭제
kubectl delete pod writer

# PVC와 PV는 남아 있다
kubectl get pvc,pv

# 같은 PVC로 Pod 재생성
kubectl apply -f pod-with-pvc.yaml
kubectl logs writer
```

```
written at Mon Sep  1 10:23:11 UTC 2026 by writer    ← 이전 기록이 남아 있다!
written at Mon Sep  1 10:26:45 UTC 2026 by writer    ← 새 기록
```

**Pod가 사라져도 데이터가 유지됐다.** 이것이 PVC의 핵심이다.

**⑤ 노드 어피니티 확인**

```bash
kubectl get pv -o jsonpath='{.items[0].spec.nodeAffinity}' | jq
```

local-path 프로비저너는 볼륨이 특정 노드의 디렉터리이므로 nodeAffinity가 붙는다. Pod가 다른 노드로 옮겨갈 수 없다.

**⑥ 실제 저장 위치 확인**

```bash
NODE=$(kubectl get pod writer -o jsonpath='{.spec.nodeName}')
docker exec $NODE find /opt/local-path-provisioner -name log.txt 2>/dev/null
docker exec $NODE cat $(docker exec $NODE find /opt/local-path-provisioner -name log.txt 2>/dev/null | head -1)
```

**⑦ 회수 정책 실험**

```bash
PV=$(kubectl get pvc demo-data -o jsonpath='{.spec.volumeName}')

# Retain으로 변경
kubectl patch pv $PV -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'

# Pod와 PVC 삭제
kubectl delete pod writer
kubectl delete pvc demo-data

# PV는 Released 상태로 남아 있다
kubectl get pv
```

```
NAME       CAPACITY   RECLAIM POLICY   STATUS     CLAIM
pvc-a1b2   1Gi        Retain           Released   default/demo-data
```

**데이터가 보존됐다.** `Delete`였다면 PV와 데이터가 모두 사라졌을 것이다.

**⑧ 정리**

```bash
kubectl delete pv $PV
```

## 12.6 상태 저장 워크로드의 백업 전략

### 세 가지 계층

백업은 한 가지 방법으로 충분하지 않다. 계층을 나눠 생각한다.

```
① 애플리케이션 수준 — 논리적 백업
   pg_dump, mysqldump, mongodump
   · 일관성 보장 ✅
   · 다른 버전·다른 환경으로 복원 가능 ✅
   · 대용량에서 느림 ❌

② 볼륨 수준 — 물리적 스냅샷
   VolumeSnapshot, 클라우드 스냅샷
   · 빠름 ✅
   · 일관성은 앱 협조 필요 ⚠️
   · 같은 스토리지 시스템에 종속 ❌

③ 클러스터 수준 — 오브젝트 + 볼륨
   Velero
   · 네임스페이스 전체를 복원 가능 ✅
   · 클러스터 마이그레이션·DR에 필수 ✅
```

### Velero

쿠버네티스 리소스와 볼륨을 함께 백업하는 표준 도구다.

```bash
# 설치 (AWS 예)
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.10.0 \
  --bucket my-backup-bucket \
  --backup-location-config region=ap-northeast-2 \
  --snapshot-location-config region=ap-northeast-2
```

**백업**

```bash
# 네임스페이스 전체
velero backup create shop-backup --include-namespaces shop

# 스케줄 백업
velero schedule create daily-shop \
  --schedule="0 3 * * *" \
  --include-namespaces shop \
  --ttl 720h
```

**복원**

```bash
velero restore create --from-backup shop-backup
# 다른 네임스페이스로 복원 (테스트용)
velero restore create --from-backup shop-backup \
  --namespace-mappings shop:shop-test
```

**백업 훅 — 일관성 확보**

앞서 말한 "스냅샷은 일관성을 보장하지 않는다" 문제를 훅으로 해결한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  annotations:
    pre.hook.backup.velero.io/container: postgres
    pre.hook.backup.velero.io/command: '["/bin/bash","-c","psql -c \"SELECT pg_start_backup(''velero'');\""]'
    post.hook.backup.velero.io/container: postgres
    post.hook.backup.velero.io/command: '["/bin/bash","-c","psql -c \"SELECT pg_stop_backup();\""]'
```

스냅샷 전후에 데이터베이스에 신호를 보내 일관된 상태를 만든다.

### 복구 테스트

> **테스트하지 않은 백업은 백업이 아니다.**
>
> 정기적으로 다음을 수행해야 한다.
> 1. 백업에서 별도 네임스페이스로 복원
> 2. 데이터 무결성 검증
> 3. RTO(복구 목표 시간)와 RPO(복구 시점 목표) 측정
> 4. 절차를 문서화하고 팀이 연습

32장에서 재해 복구 절차를 다룰 때 이 주제를 확장한다.

### 쿠버네티스에서 DB를 운영해야 하는가

8.3절에서 던진 질문을 다시 꺼낸다. 스토리지 관점에서 보면 고려사항이 더 명확해진다.

**매니지드 DB(RDS, Cloud SQL)가 대신 해 주는 것**
- 자동 백업과 시점 복구(PITR)
- 자동 페일오버
- 읽기 복제본 관리
- 버전 업그레이드
- 성능 인사이트

**쿠버네티스에서 직접 운영할 때 필요한 것**
- 위 모든 것을 오퍼레이터나 사람이 구현
- 스토리지 성능 튜닝 (IOPS, 지연)
- 볼륨 확장 계획
- 스냅샷 일관성 보장

**직접 운영이 정당화되는 경우**
- 멀티 클라우드나 온프레미스 이식성이 필수
- 매니지드가 지원하지 않는 확장·설정이 필요
- 비용이 규모의 경제로 유리해지는 시점
- 성숙한 오퍼레이터가 있고(CloudNativePG, Strimzi) 팀이 그것을 운영할 역량이 있다

## 12.7 스토리지 문제 진단

```bash
# ① PVC 상태
kubectl get pvc
kubectl describe pvc <name>          # Events가 핵심

# ② PV 상태
kubectl get pv
kubectl describe pv <name>

# ③ StorageClass 존재 여부
kubectl get storageclass

# ④ CSI 드라이버 상태
kubectl get csidrivers
kubectl get pods -n kube-system -l app=ebs-csi-controller
kubectl logs -n kube-system <csi-controller-pod> -c csi-provisioner

# ⑤ VolumeAttachment (노드 연결 상태)
kubectl get volumeattachment

# ⑥ Pod의 마운트 이벤트
kubectl describe pod <name> | grep -A10 Events
```

**증상별 원인표**

| 증상 | 원인 | 대응 |
|---|---|---|
| PVC가 `Pending` + `WaitForFirstConsumer` | 정상. Pod를 만들면 바인딩된다 | - |
| PVC가 `Pending` + 이벤트 없음 | StorageClass 없음, 기본 클래스 미지정 | `kubectl get sc` |
| PVC가 `Pending` + `ProvisioningFailed` | CSI 드라이버 오류, 권한 부족, 쿼터 초과 | CSI 컨트롤러 로그 |
| Pod가 `Pending` + `node(s) had volume node affinity conflict` | 볼륨 AZ와 노드 AZ 불일치 | `WaitForFirstConsumer` 사용 |
| Pod가 `ContainerCreating` + `FailedMount` | 볼륨 attach 실패, 다른 노드에 붙어 있음 | `VolumeAttachment` 확인 |
| `Multi-Attach error` | RWO 볼륨을 여러 노드에서 마운트 시도 | 이전 Pod가 완전히 종료되길 대기 |
| PVC 삭제가 안 됨 (`Terminating`) | 파이널라이저 `pvc-protection` — 사용 중인 Pod 존재 | Pod 먼저 삭제 (4.2절) |
| 볼륨 확장이 반영 안 됨 | `allowVolumeExpansion: false`, 파일 시스템 확장 대기 | SC 확인, Pod 재시작 |
| 디스크 가득 참 | 모니터링 부재 | `kubelet_volume_stats_available_bytes` 알림 (31장) |

**`Multi-Attach error`가 흔한 사고다.** 노드가 갑자기 죽으면 그 노드의 볼륨 연결이 해제되지 않은 채 남는다. 새 노드에서 Pod가 뜨려 하면 충돌한다. 대개 6분(`--node-monitor-grace-period` 관련) 후 자동 해결되지만, 급하면 수동으로 `VolumeAttachment`를 삭제해야 할 수도 있다.

---

## 실습 과제

**과제 1 — 바인딩 모드 비교**
`volumeBindingMode: Immediate`인 StorageClass를 만들고 PVC를 생성해, Pod 없이도 즉시 `Bound`가 되는 것을 확인한다. `WaitForFirstConsumer`와 비교해 멀티 노드 환경에서 어떤 문제가 생길 수 있는지 설명해 본다.

**과제 2 — StatefulSet과 PVC 재사용**
8장의 StatefulSet 실습을 다시 하되, 이번에는 PVC에 집중한다.
```bash
kubectl scale statefulset web --replicas=1     # 2개 축소
kubectl get pvc                                # PVC는 남아 있다
kubectl scale statefulset web --replicas=3     # 다시 확대
kubectl logs web-2                             # 예전 데이터가 그대로인가?
```

**과제 3 — 회수 정책 실험**
같은 데이터를 담은 PVC 두 개를 `Delete`와 `Retain` 정책으로 만들고, 각각 삭제한 뒤 실제 저장소에 데이터가 남았는지 확인한다. `Retain`된 PV를 새 PVC로 재사용하는 절차(claimRef 제거)를 수행한다.

**과제 4 — 볼륨 확장**
`allowVolumeExpansion: true`인 StorageClass로 PVC를 만들고 1Gi → 3Gi로 확장한다. 컨테이너 안에서 `df -h`로 확장 전후를 비교하고, Pod 재시작이 필요한지 확인한다.

**과제 5 — 스냅샷과 복원**
kind에 CSI 스냅샷 CRD와 `csi-driver-host-path`를 설치하고, 데이터를 쓴 볼륨의 스냅샷을 만든 뒤 데이터를 삭제한다. 스냅샷에서 새 PVC를 복원해 데이터가 돌아오는지 확인한다.

---

## 요약

- 스토리지 요구는 **임시 스크래치(`emptyDir`)**, **설정 주입(ConfigMap/Secret)**, **영구 데이터(PVC)** 셋으로 분류된다. `medium: Memory`는 컨테이너 메모리 한도를 소비한다는 점에 주의한다.
- **`hostPath`는 시스템 컴포넌트 외에는 쓰지 않는다.** 데이터가 노드에 묶이고 보안 위험이 크다. 로컬 디스크 성능이 필요하면 Local PV를 쓴다.
- **PVC는 요청, PV는 실제 볼륨, StorageClass는 종류의 정의**다. 개발자는 PVC만 다루고 나머지는 시스템이 처리한다.
- **`volumeBindingMode: WaitForFirstConsumer`가 사실상 필수다.** `Immediate`는 멀티 AZ에서 볼륨과 Pod가 다른 AZ에 배치되어 영구 Pending에 빠질 수 있다.
- **RWO는 "하나의 Pod"가 아니라 "하나의 노드"** 다. 단일 Pod 보장이 필요하면 `ReadWriteOncePod`를 쓴다. RWX는 블록 스토리지에서 지원되지 않으므로, 파일 공유 요구는 오브젝트 스토리지 등 대안을 먼저 검토한다.
- 동적 프로비저닝의 기본 `reclaimPolicy: Delete`는 **PVC를 지우면 데이터가 사라진다.** 프로덕션 볼륨은 `Retain`으로 바꿔 두자.
- **CSI**는 스토리지 드라이버를 쿠버네티스 본체에서 분리한 표준이다. 컨트롤러(Deployment)와 노드 플러그인(DaemonSet)으로 배포되며, `NodeStageVolume`(노드 마운트)과 `NodePublishVolume`(Pod 바인드 마운트) 두 단계로 볼륨을 붙인다.
- **볼륨 스냅샷은 애플리케이션 백업이 아니다.** 일관성을 위해 앱 수준 백업이나 백업 훅이 필요하다. Velero로 오브젝트와 볼륨을 함께 백업하고, **복구를 정기적으로 테스트**해야 한다.

**3부를 마치며** — 이제 워크로드를 띄우고(2부), 바깥과 연결하고, 데이터를 보관할 수 있다. 4부에서는 **여러 팀과 여러 워크로드가 한 클러스터를 나눠 쓰는 상황**을 다룬다. 네임스페이스로 격리하고, 리소스를 배분하고, 스케줄링을 제어하고, 자동으로 확장하고, 권한과 보안을 설계한다.

---

**참고 원서**: *Kubernetes in Action, 2nd Ed.* 7장, 12장 / *Core Kubernetes* 7장, 8장
