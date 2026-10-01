---
title: "부록 C. 오브젝트 레퍼런스"
---

# 부록 C. 오브젝트 레퍼런스

> 주요 오브젝트를 **"무엇을 위한 것인가 → 언제 쓰는가 → 최소 YAML → 함정"** 순서로 정리했다.
> 전체 필드는 `kubectl explain <kind>.spec --recursive`가 항상 최신이다.

---

## C.0 모든 오브젝트의 공통 구조

```yaml
apiVersion: apps/v1        # ① 어떤 API 그룹/버전인가
kind: Deployment           # ② 어떤 종류인가
metadata:                  # ③ 누구인가
  name: web
  namespace: default
  labels: {}               #    선택·그룹화용 (셀렉터에 쓰인다)
  annotations: {}          #    부가 정보 (셀렉터에 안 쓰인다)
spec:                      # ④ 원하는 상태 — 사람이 쓴다
  ...
status:                    # ⑤ 현재 상태 — 시스템이 쓴다. 사람은 쓰지 않는다
  ...
```

**`spec`과 `status`의 분리가 조정 루프의 양 끝이다.** 컨트롤러는 이 둘을 비교해 차이를 줄인다.

**metadata의 숨은 필드들**

| 필드 | 의미 | 상세 |
|---|---|---|
| `uid` | 클러스터 전체에서 유일. 재사용되지 않음 | 4.2절 |
| `resourceVersion` | 변경마다 증가. 낙관적 동시성 제어와 watch 재개에 사용 | 4.2절 |
| `generation` | **spec이 바뀔 때만** 증가 (status 변경은 무관) | 4.2절 |
| `ownerReferences` | 소유자. 가비지 컬렉션의 근거 | 4.2절 |
| `finalizers` | 이것이 남아 있으면 삭제가 완료되지 않는다 | 4.2절 |
| `deletionTimestamp` | 설정되면 `Terminating` 상태 | 6.4절 |

```bash
# API 그룹을 모를 때
kubectl api-resources | grep -i deployment
# deployments  deploy  apps/v1  true  Deployment
```

---

## C.1 워크로드

### Pod — 최소 배포 단위

**무엇인가**: 함께 배치되고 함께 살고 죽는 컨테이너 묶음. NET·IPC·UTS를 공유하고 MNT·PID는 분리한다.

**언제 쓰는가**: **직접 만들 일은 거의 없다.** 노드가 죽으면 그대로 사라지고 아무도 다시 만들어 주지 않는다. 학습이나 일회성 디버깅에만.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: web }
spec:
  serviceAccountName: web-sa
  automountServiceAccountToken: false     # API 접근이 필요 없으면 끈다
  terminationGracePeriodSeconds: 45
  securityContext:                        # Pod 수준 (모든 컨테이너에 상속)
    runAsNonRoot: true
    runAsUser: 10001
    fsGroup: 10001
    seccompProfile: { type: RuntimeDefault }

  initContainers:                         # 순차 실행, 완료돼야 다음
    - name: wait-db
      image: busybox
      command: ["sh","-c","until nc -z db 5432; do sleep 2; done"]
    - name: log-shipper                   # ★ 정식 사이드카 (v1.29+)
      image: fluent/fluent-bit:3.0
      restartPolicy: Always               #    메인보다 먼저 시작, 나중에 종료
      volumeMounts: [{ name: logs, mountPath: /logs }]

  containers:
    - name: app
      image: registry.example.com/web@sha256:abc...   # 다이제스트 고정
      imagePullPolicy: IfNotPresent
      ports:
        - { name: http, containerPort: 8080 }         # 이름을 주면 Service가 참조 가능
      env:
        - { name: LOG_LEVEL, value: info }
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef: { name: db-secret, key: password }
        - name: POD_NAME                              # Downward API
          valueFrom:
            fieldRef: { fieldPath: metadata.name }
        - name: MEM_LIMIT_MB
          valueFrom:
            resourceFieldRef: { resource: limits.memory, divisor: 1Mi }
      resources:
        requests: { cpu: 100m, memory: 128Mi }        # 스케줄러가 본다
        limits:   { memory: 512Mi }                   # 커널이 강제한다
      startupProbe:
        httpGet: { path: /healthz, port: http }
        periodSeconds: 10
        failureThreshold: 30                          # 최대 300초 허용
      livenessProbe:
        httpGet: { path: /healthz, port: http }       # 의존성 확인 금지
        periodSeconds: 10
        timeoutSeconds: 5
      readinessProbe:
        httpGet: { path: /readyz, port: http }        # 의존성 확인은 여기
        periodSeconds: 5
        timeoutSeconds: 3
      lifecycle:
        preStop:
          exec: { command: ["sleep","10"] }           # 엔드포인트 전파 대기
      securityContext:                                # 컨테이너 수준 (우선)
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: ["ALL"] }
      volumeMounts:
        - { name: config, mountPath: /etc/app, readOnly: true }
        - { name: tmp,    mountPath: /tmp }
        - { name: logs,   mountPath: /var/log/app }

  volumes:
    - name: config
      configMap: { name: app-config }
    - name: tmp
      emptyDir: { sizeLimit: 64Mi }
    - name: logs
      emptyDir: {}

  restartPolicy: Always                   # Always | OnFailure | Never
```

> **함정**
> - `ports`는 **선언일 뿐** 실제로 포트를 열지 않는다. 그럼에도 적는 이유는 문서화와 Service의 이름 참조.
> - `latest` 태그는 `imagePullPolicy`가 자동으로 `Always`가 된다. 재현성이 깨진다.
> - `readOnlyRootFilesystem: true`를 켜면 임시 파일을 쓸 곳이 없어 앱이 죽는다. `/tmp`에 `emptyDir` 필수.
> - Pod 안 모든 컨테이너가 `requests == limits`여야 Guaranteed QoS다. 사이드카 하나만 빠져도 Burstable이 된다.

**상세**: 5장, 6장 / **QoS**: 14.2절 / **보안**: 18.2절

---

### Deployment — 무상태 애플리케이션

**무엇인가**: ReplicaSet을 여러 개 관리하며 버전 전환과 롤백을 담당한다.

**언제 쓰는가**: **90%의 워크로드.** 웹 서버, API, 워커 등 각 인스턴스가 동등한 것.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  annotations:
    kubernetes.io/change-cause: "update to v1.2.3"    # rollout history에 표시
spec:
  replicas: 3                       # HPA가 관리한다면 이 필드를 제거한다
  revisionHistoryLimit: 5
  minReadySeconds: 10               # Ready 후 이만큼 버텨야 "사용 가능"
  progressDeadlineSeconds: 600
  strategy:
    type: RollingUpdate             # 또는 Recreate
    rollingUpdate:
      maxSurge: 1                   # 프로덕션 권장 조합
      maxUnavailable: 0             # 용량을 절대 줄이지 않는다
  selector:
    matchLabels: { app: web }       # ★ 생성 후 변경 불가
  template:
    metadata:
      labels: { app: web }          # selector와 일치해야 한다
    spec:
      ...                           # Pod 스펙
```

> **함정**
> - **`selector`는 immutable이다.** 바꾸려면 Deployment를 지우고 다시 만들어야 한다. 처음부터 **변하지 않을 최소한의 라벨만** 넣는다.
> - `maxUnavailable: 0`은 새 Pod가 뜰 자리가 있어야 진행된다. 클러스터에 여유가 없으면 **롤아웃이 영원히 멈춘다.**
> - 롤백은 **Pod 템플릿만** 되돌린다. DB 스키마와 ConfigMap 내용은 그대로다.
> - HPA와 함께 쓸 때 `replicas`를 매니페스트에 두면 GitOps와 충돌해 플래핑한다.

**상세**: 8.2절

---

### StatefulSet — 상태 저장 애플리케이션

**무엇인가**: 안정적 이름·스토리지·순서 세 가지를 보장한다.

**언제 쓰는가**: 각 인스턴스가 **고유한 정체성**을 가져야 할 때. DB 클러스터, 메시지 큐, 분산 스토리지.

```yaml
apiVersion: v1
kind: Service
metadata: { name: db-headless }
spec:
  clusterIP: None                   # ★ 헤드리스 — 개별 Pod DNS의 전제
  selector: { app: db }
  ports: [{ port: 5432, name: pg }]
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: db }
spec:
  serviceName: db-headless          # ★ 위 헤드리스 서비스
  replicas: 3
  podManagementPolicy: OrderedReady # 또는 Parallel (순서 불필요 시 빠르다)
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0                  # 이 인덱스 이상만 업데이트 (단계적 롤아웃)
  persistentVolumeClaimRetentionPolicy:   # v1.27+
    whenScaled: Retain
    whenDeleted: Retain
  selector:
    matchLabels: { app: db }
  template:
    metadata: { labels: { app: db } }
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          volumeMounts: [{ name: data, mountPath: /var/lib/postgresql/data }]
  volumeClaimTemplates:             # ★ Pod마다 고유 PVC 생성
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources: { requests: { storage: 50Gi } }
```

**얻는 것**

```
이름:     db-0, db-1, db-2 (재시작해도 유지)
DNS:      db-0.db-headless.default.svc.cluster.local
스토리지: data-db-0, data-db-1, data-db-2 (재연결됨)
순서:     생성은 0→1→2, 삭제는 2→1→0
업데이트: 높은 인덱스부터 역순
```

> **함정**
> - **스케일 다운해도 PVC는 삭제되지 않는다.** 의도된 동작(데이터 보호)이지만 비용이 남는다.
> - StatefulSet은 **리더 선출·복제·페일오버·백업을 해 주지 않는다.** 그건 앱이나 오퍼레이터의 일이다.
> - `--force --grace-period=0` 삭제는 같은 ID의 Pod가 둘 실행되는 스플릿 브레인을 만들 수 있다.
> - **프로덕션 DB라면 오퍼레이터(CloudNativePG, Strimzi)나 관리형 서비스를 먼저 검토하라.**

**상세**: 8.3절

---

### DaemonSet — 노드마다 하나씩

**언제 쓰는가**: 로그 수집기, 모니터링 에이전트, CNI 플러그인, CSI 노드 플러그인, 보안 에이전트.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata: { name: node-exporter, namespace: monitoring }
spec:
  selector:
    matchLabels: { app: node-exporter }
  updateStrategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 1 }
  template:
    metadata: { labels: { app: node-exporter } }
    spec:
      tolerations:
        - operator: Exists          # ★ 모든 테인트 감내 (에이전트에 흔함)
      hostNetwork: true             # 노드 네트워크 사용
      dnsPolicy: ClusterFirstWithHostNet   # ★ hostNetwork면 이것이 필수
      containers:
        - name: exporter
          image: prom/node-exporter:v1.8.0
          ports: [{ containerPort: 9100, hostPort: 9100 }]
          volumeMounts:
            - { name: rootfs, mountPath: /host, readOnly: true }
      volumes:
        - name: rootfs
          hostPath: { path: / }
```

> **함정**
> - **toleration이 없으면 컨트롤 플레인 노드에 배치되지 않는다.**
> - `hostNetwork: true`인데 `dnsPolicy`를 명시하지 않으면 **클러스터 Service 이름을 해석하지 못한다.**
> - `hostPath`와 `hostNetwork`는 보안 검토 대상이다. Pod Security Admission의 `baseline`이 이를 금지한다.
> - **Fargate에서는 DaemonSet이 동작하지 않는다.**

**상세**: 8.4절

---

### Job / CronJob — 배치 워크로드

```yaml
apiVersion: batch/v1
kind: Job
metadata: { name: migration }
spec:
  completions: 5                    # 성공해야 할 Pod 수
  parallelism: 2                    # 동시 실행 수
  completionMode: Indexed           # JOB_COMPLETION_INDEX 제공
  backoffLimit: 4
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 3600     # 완료 후 자동 삭제
  template:
    spec:
      restartPolicy: OnFailure      # ★ Always 사용 불가
      containers:
        - name: migrate
          image: myapp:1.2
          command: ["python","manage.py","migrate"]
---
apiVersion: batch/v1
kind: CronJob
metadata: { name: nightly-backup }
spec:
  schedule: "0 3 * * *"
  timeZone: "Asia/Seoul"            # ★ v1.27+. 없으면 UTC
  concurrencyPolicy: Forbid         # Allow | Forbid | Replace
  startingDeadlineSeconds: 300
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  suspend: false
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers: [{ name: backup, image: backup:1.0 }]
```

> **함정**
> - **`timeZone`을 빠뜨리면 UTC로 동작한다.** "새벽 3시"가 한국 시각 정오가 되는 사고가 흔하다.
> - 사이드카를 `containers`에 두면 **메인이 끝나도 Job이 완료되지 않는다.** `initContainers` + `restartPolicy: Always`로 정의해야 한다.
> - `restartPolicy: Never`가 디버깅에 유리하다(실패한 Pod가 남아 로그를 볼 수 있다).

**상세**: 8.5절

---

## C.2 네트워크

### Service — 고정 진입점

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP                   # ClusterIP | NodePort | LoadBalancer | ExternalName
  selector: { app: web }            # ★ 라벨로 Pod를 찾는다
  ports:
    - name: http                    # 포트가 2개 이상이면 필수
      port: 80                      # Service가 노출하는 포트
      targetPort: http              # 컨테이너 포트 (이름 참조 가능)
      protocol: TCP
  sessionAffinity: None             # 또는 ClientIP
  externalTrafficPolicy: Cluster    # Local이면 클라이언트 IP 보존
  internalTrafficPolicy: Cluster
```

**네 가지 타입**

| 타입 | 동작 | 언제 |
|---|---|---|
| `ClusterIP` (기본) | 클러스터 내부 가상 IP | 대부분 |
| `NodePort` | 모든 노드의 30000~32767 포트 | 개발, 자체 LB 뒤 |
| `LoadBalancer` | 클라우드 LB 프로비저닝 | 외부 노출 (비용 주의) |
| `ExternalName` | DNS CNAME만 생성 | 외부 서비스 별칭 |

**헤드리스 서비스**

```yaml
spec:
  clusterIP: None       # 가상 IP 없음 → DNS가 모든 Pod IP를 반환
```

필요한 경우: StatefulSet의 개별 Pod 접근, gRPC 클라이언트 사이드 로드밸런싱, 피어 디스커버리.

> **함정**
> - **엔드포인트가 비어 있는 것이 가장 흔한 실패**다. 셀렉터 오타, Pod가 Ready 아님, 네임스페이스 불일치.
> - `LoadBalancer` 하나당 클라우드 LB 하나가 생긴다. 여러 서비스는 Ingress로 통합한다.
> - gRPC처럼 연결을 오래 유지하는 클라이언트는 일반 Service에서 **로드밸런싱이 사실상 동작하지 않는다.**

**상세**: 9장 / **진단**: 9.7절

---

### Ingress — L7 라우팅

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod     # 인증서 자동 발급
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  ingressClassName: nginx           # ★ 어느 컨트롤러가 처리할지
  tls:
    - hosts: [shop.example.com]
      secretName: shop-tls          # ★ Ingress와 같은 네임스페이스여야 한다
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix        # Exact | Prefix | ImplementationSpecific
            backend:
              service:
                name: api
                port: { number: 80 }
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port: { name: http }
  defaultBackend:
    service: { name: fallback, port: { number: 80 } }
```

> **함정**
> - **Ingress 리소스만 만들면 아무 일도 일어나지 않는다.** IngressController가 별도로 설치되어야 한다. `ADDRESS`가 비어 있는 것이 그 신호다.
> - `pathType: Prefix`는 **세그먼트 단위**로 매칭된다. `/api`는 `/apifoo`에 매칭되지 않는다.
> - **실무 기능의 대부분이 비표준 애노테이션**이다. 컨트롤러를 바꾸면 다시 써야 한다 → Gateway API 검토.
> - TLS Secret은 반드시 **같은 네임스페이스**에 있어야 한다.

**상세**: 11장

---

### NetworkPolicy — 통신 제한

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-policy
  namespace: prod
spec:
  podSelector:
    matchLabels: { tier: api }      # 이 정책이 적용될 Pod
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector:                          # ① 같은 NS의 Pod
            matchLabels: { tier: frontend }
        - namespaceSelector:                    # ② 다른 NS 전체 (①과 OR)
            matchLabels: { team: platform }
      ports: [{ protocol: TCP, port: 8080 }]
  egress:
    - to:
        - namespaceSelector:                    # ★ DNS는 반드시 열어야 한다
            matchLabels: { kubernetes.io/metadata.name: kube-system }
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
    - to:
        - podSelector: { matchLabels: { tier: db } }
      ports: [{ protocol: TCP, port: 5432 }]
```

**AND / OR 규칙** — 하이픈 위치가 의미를 바꾼다

```yaml
# OR — 리스트의 별개 항목
from:
  - podSelector: { matchLabels: { app: a } }
  - namespaceSelector: { matchLabels: { team: b } }

# AND — 한 항목 안에 둘 다
from:
  - namespaceSelector: { matchLabels: { team: b } }
    podSelector: { matchLabels: { app: a } }
```

> **함정**
> - **CNI가 지원해야 동작한다.** kindnet과 Flannel은 무시한다(에러도 없다).
> - 정책이 하나라도 적용되면 그 Pod는 **기본 거부**가 된다.
> - **DNS 예외를 빠뜨리면 모든 것이 깨진다.** 정책 적용 후 장애의 90%가 이것이다.
> - L3/L4만 지원한다. HTTP 경로나 도메인 기반 제어는 Cilium 등 CNI 확장이 필요하다.

**상세**: 18.4절

---

## C.3 설정과 데이터

### ConfigMap / Secret

```yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: app-config }
immutable: true                     # ★ 변경 방지 + API 서버 부하 감소
data:
  LOG_LEVEL: "info"                 # ★ 값은 반드시 문자열
  MAX_CONN: "100"
  app.yaml: |
    server:
      port: 8080
---
apiVersion: v1
kind: Secret
metadata: { name: db-secret }
type: Opaque                        # kubernetes.io/tls, dockerconfigjson 등
stringData:                         # ★ 평문으로 쓰면 API 서버가 인코딩
  username: admin
  password: S3cur3P@ss
```

**주입 방법 비교**

| 방식 | 자동 갱신 | 언제 |
|---|---|---|
| `env` / `envFrom` | ❌ **절대 안 됨** | 단순 값 |
| 볼륨 마운트 | ✅ (최대 ~2분) | 설정 파일, 인증서 |
| 볼륨 + `subPath` | ❌ | 기존 디렉터리에 파일 하나 |

```yaml
# 환경변수
env:
  - name: LOG_LEVEL
    valueFrom:
      configMapKeyRef: { name: app-config, key: LOG_LEVEL }
envFrom:
  - configMapRef: { name: app-config }
  - secretRef: { name: db-secret }

# 볼륨 (권장 — 시크릿은 특히)
volumes:
  - name: cfg
    configMap:
      name: app-config
      items: [{ key: app.yaml, path: application.yaml }]
  - name: sec
    secret:
      secretName: db-secret
      defaultMode: 0400
```

> **함정**
> - **base64는 암호화가 아니다.** Secret의 실질적 이점은 노드에서 tmpfs에 저장된다는 것과 RBAC 분리뿐이다. 실제 보호는 **etcd 암호화(KMS)** 와 **외부 시크릿 관리**로 만든다.
> - 시크릿을 환경변수로 주입하면 `/proc/*/environ`, 에러 리포팅, 자식 프로세스 상속으로 유출될 수 있다. **볼륨이 안전하다.**
> - ConfigMap을 바꿔도 **Pod가 자동으로 재시작되지 않는다.** 체크섬 애노테이션(Helm)이나 내용 해시 이름(Kustomize)으로 롤아웃을 유도한다.
> - `data`의 값은 모두 문자열이어야 한다. `MAX_CONN: 100`은 에러다.

**상세**: 7장

---

### PVC / PV / StorageClass

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: data }
spec:
  accessModes: [ReadWriteOnce]      # RWO | ROX | RWX | RWOP
  storageClassName: fast-ssd        # 생략하면 기본 클래스
  resources:
    requests: { storage: 20Gi }
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Retain               # ★ 프로덕션은 Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer   # ★ 사실상 필수
```

**접근 모드**

| 모드 | 의미 | 지원 |
|---|---|---|
| `ReadWriteOnce` (RWO) | **하나의 노드**에서 읽기/쓰기 | 블록 스토리지 전부 |
| `ReadOnlyMany` (ROX) | 여러 노드에서 읽기 전용 | 일부 |
| `ReadWriteMany` (RWX) | 여러 노드에서 읽기/쓰기 | NFS 계열만 |
| `ReadWriteOncePod` (RWOP) | **하나의 Pod**에서만 | v1.29+ GA |

> **함정**
> - **RWO는 "하나의 Pod"가 아니라 "하나의 노드"** 다. 같은 노드의 여러 Pod가 동시에 마운트할 수 있다.
> - `volumeBindingMode: Immediate`는 멀티 AZ에서 볼륨과 Pod가 다른 AZ에 배치되어 **영구 Pending**에 빠질 수 있다.
> - `reclaimPolicy: Delete`(동적 프로비저닝 기본값)면 **PVC를 지우면 데이터가 사라진다.**
> - 볼륨 확장은 늘리는 것만 가능하다. 줄일 수 없다.

**상세**: 12장

---

## C.4 통제

### Namespace / ResourceQuota / LimitRange

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: team-a
  labels:
    team: alpha
    pod-security.kubernetes.io/enforce: baseline      # PSA
    pod-security.kubernetes.io/warn: restricted
---
apiVersion: v1
kind: ResourceQuota
metadata: { name: quota, namespace: team-a }
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    pods: "100"
    persistentvolumeclaims: "20"
    services.loadbalancers: "2"     # ★ 클라우드 LB 비용 통제
    count/deployments.apps: "30"
---
apiVersion: v1
kind: LimitRange
metadata: { name: defaults, namespace: team-a }
spec:
  limits:
    - type: Container
      default:        { cpu: 500m, memory: 512Mi }    # limits 기본값
      defaultRequest: { cpu: 100m, memory: 128Mi }    # requests 기본값
      min:            { cpu: 10m,  memory: 32Mi }
      max:            { cpu: "4",  memory: 8Gi }
      maxLimitRequestRatio: { memory: "4" }           # 오버커밋 제한
```

> **핵심 규칙**: 컴퓨트 쿼터가 있으면 **모든 컨테이너가 requests/limits를 명시해야 한다.** 그래서 LimitRange의 기본값과 **거의 항상 함께 쓴다.**

> **함정**: **네임스페이스는 보안 경계가 아니다.** 네트워크는 열려 있고 노드·커널·컨트롤 플레인은 공유된다. 격리하려면 NetworkPolicy + RBAC + PSA + 테인트를 조합해야 한다.

**상세**: 13장

---

### RBAC — Role / RoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: developer, namespace: dev }
rules:
  - apiGroups: ["", "apps"]         # ""는 코어 그룹
    resources: ["pods","deployments","services","configmaps"]
    verbs: ["get","list","watch","create","update","patch","delete"]
  - apiGroups: [""]
    resources: ["pods/log","pods/exec"]              # 서브리소스
    verbs: ["get","create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: dev-team, namespace: dev }
subjects:
  - kind: Group                     # User | Group | ServiceAccount
    name: "oidc:dev-team"
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole                 # ★ ClusterRole을 참조해 재사용
  name: edit                        #    적용 범위는 이 네임스페이스뿐
  apiGroup: rbac.authorization.k8s.io
```

**내장 ClusterRole**

| 이름 | 권한 |
|---|---|
| `cluster-admin` | 모든 것. 극소수에게만 |
| `admin` | 네임스페이스 안의 모든 것 + RBAC 관리 |
| `edit` | 읽기/쓰기. RBAC 관리 제외 |
| `view` | 읽기 전용. **Secret 제외** |

> **함정**
> - **`list`는 `get`보다 훨씬 위험하다.** `resourceNames`가 `list`/`watch`에는 적용되지 않는다. `secrets`에 `list` 권한은 네임스페이스 전체 자격증명 덤프와 같다.
> - **`pods` `create` 권한은 사실상 노드 root 권한**이다. hostPath와 특권 컨테이너로 노드를 장악할 수 있다. Pod Security Admission이 이를 막는다.
> - `system:masters` 그룹은 RBAC를 **우회한다.** `admin.conf`는 금고에 보관한다.

**상세**: 17.3절

---

### 스케줄링 제어

```yaml
spec:
  # ① 노드 어피니티 — 노드 라벨 기준
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:                    # 항목끼리 OR
          - matchExpressions:                 # 항목 안은 AND
              - { key: disktype, operator: In, values: [ssd] }
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 80
          preference:
            matchExpressions:
              - { key: topology.kubernetes.io/zone, operator: In, values: [ap-northeast-2a] }

    # ② Pod 안티어피니티 — 다른 Pod와 떨어뜨린다
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector: { matchLabels: { app: web } }
            topologyKey: kubernetes.io/hostname

  # ③ 토폴로지 분산 — 균등 배치 (안티어피니티보다 효율적)
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: ScheduleAnyway       # 또는 DoNotSchedule
      labelSelector: { matchLabels: { app: web } }
      matchLabelKeys: [pod-template-hash]     # ★ 롤아웃 시 필수

  # ④ 톨러레이션 — 테인트를 감내한다 ("허가"이지 "지시"가 아니다)
  tolerations:
    - key: workload
      operator: Equal
      value: gpu
      effect: NoSchedule                      # NoSchedule | PreferNoSchedule | NoExecute

  # ⑤ 우선순위
  priorityClassName: high-priority
```

> **핵심**: **테인트는 다른 Pod를 막고, 어피니티는 이 Pod를 유도한다.** 전용 노드에는 **둘 다 필요하다.** 톨러레이션만 주면 Pod가 일반 노드에도 갈 수 있다.

**상세**: 15장

---

### PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: web-pdb }
spec:
  maxUnavailable: 1                 # 또는 minAvailable
  selector:
    matchLabels: { app: web }
  unhealthyPodEvictionPolicy: AlwaysAllow     # v1.27+
```

> **함정**
> - `minAvailable`을 `replicas`와 같게 하면 **drain이 영원히 멈춘다.**
> - HPA와 함께 쓴다면 **`maxUnavailable`이 안전하다.** replicas가 변해도 의미가 유지된다.
> - **PDB는 kubelet의 자원 부족 축출을 막지 못한다.** 자발적 중단(drain, 오토스케일러)만 제어한다.

**상세**: 32.3절

---

### HorizontalPodAutoscaler

```yaml
apiVersion: autoscaling/v2          # ★ v1은 CPU만
kind: HorizontalPodAutoscaler
metadata: { name: web }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70    # ★ requests 대비 비율 (노드 용량 아님)
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies: [{ type: Percent, value: 100, periodSeconds: 15 }]
    scaleDown:
      stabilizationWindowSeconds: 300           # 최근 5분의 최댓값 기준
      policies: [{ type: Percent, value: 50, periodSeconds: 60 }]
```

**공식**: `desiredReplicas = ceil(currentReplicas × (현재 / 목표))`, 비율이 0.9~1.1이면 변경 없음.

> **함정**
> - **`Utilization`의 기준은 `requests`다.** requests를 바꾸면 HPA 동작이 완전히 달라진다.
> - **메모리 기반 HPA는 대개 부적절하다.** 메모리는 부하가 줄어도 반환되지 않아 스케일 인이 일어나지 않는다.
> - HPA가 관리하는 Deployment에서는 **`replicas` 필드를 제거**한다.

**상세**: 16.2절

---

## C.5 오브젝트 선택 결정 트리

```
워크로드가 끝나는가?
├─ 예
│   └─ 정해진 시각에 반복하는가?
│       ├─ 예 → CronJob
│       └─ 아니오 → Job
└─ 아니오
    └─ 모든 노드에 하나씩 필요한가?
        ├─ 예 → DaemonSet
        └─ 아니오
            └─ 각 인스턴스가 고유 ID·스토리지를 갖는가?
                ├─ 예 → StatefulSet (오퍼레이터를 먼저 검토)
                └─ 아니오 → Deployment  ← 90%

노출이 필요한가?
├─ 클러스터 내부만 → Service (ClusterIP)
├─ 개별 Pod 지목 필요 → 헤드리스 Service
├─ HTTP/HTTPS 외부 → Ingress (+ ClusterIP Service)
└─ TCP/UDP 외부 → Service (LoadBalancer)

데이터를 보관해야 하는가?
├─ Pod 수명과 같음 → emptyDir
├─ 설정 주입 → ConfigMap / Secret
└─ Pod보다 오래 → PVC
    └─ 여러 Pod가 동시 쓰기? → RWX 스토리지 (또는 오브젝트 스토리지 재검토)
```

---

## C.6 API 그룹 요약

| 그룹 | 주요 리소스 |
|---|---|
| `v1` (코어) | Pod, Service, ConfigMap, Secret, Namespace, Node, PV, PVC, ServiceAccount, Event |
| `apps/v1` | Deployment, StatefulSet, DaemonSet, ReplicaSet |
| `batch/v1` | Job, CronJob |
| `networking.k8s.io/v1` | Ingress, IngressClass, NetworkPolicy |
| `gateway.networking.k8s.io/v1` | Gateway, GatewayClass, HTTPRoute |
| `rbac.authorization.k8s.io/v1` | Role, RoleBinding, ClusterRole, ClusterRoleBinding |
| `policy/v1` | PodDisruptionBudget |
| `autoscaling/v2` | HorizontalPodAutoscaler |
| `storage.k8s.io/v1` | StorageClass, CSIDriver, VolumeAttachment |
| `scheduling.k8s.io/v1` | PriorityClass |
| `node.k8s.io/v1` | RuntimeClass |
| `discovery.k8s.io/v1` | EndpointSlice |
| `coordination.k8s.io/v1` | Lease |
| `certificates.k8s.io/v1` | CertificateSigningRequest |
| `admissionregistration.k8s.io/v1` | ValidatingWebhookConfiguration, ValidatingAdmissionPolicy |
| `apiextensions.k8s.io/v1` | CustomResourceDefinition |
| `apiregistration.k8s.io/v1` | APIService |

```bash
kubectl api-resources --api-group=apps -o wide
kubectl explain <kind>.spec --recursive | head -40
```
