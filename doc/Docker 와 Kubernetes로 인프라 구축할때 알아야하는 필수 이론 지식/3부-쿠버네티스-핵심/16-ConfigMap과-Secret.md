---
title: "16장. ConfigMap과 Secret"
parent: "3부. 쿠버네티스 핵심"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 16
---

# 16장. ConfigMap과 Secret

## 이 장에서 배우는 것

- 이미지와 설정을 분리해야 하는 이유와 ConfigMap의 사용법을 이해한다.
- 환경변수 주입과 볼륨 마운트의 차이, 특히 **갱신 동작의 차이**를 안다.
- Secret의 한계(base64는 암호화가 아니다)와 실제 보호 수단을 이해한다.
- 설정이 바뀌었을 때 안전하게 롤아웃을 유도하는 패턴을 안다.

---

## 1. 왜 설정을 분리하는가

이미지는 불변이다(7장). 그런데 같은 애플리케이션을 개발·스테이징·프로덕션에 배포하려면 DB 주소, 로그 레벨, 기능 플래그가 달라야 한다. **설정을 이미지에 넣으면** 환경마다 다른 이미지를 빌드해야 하고, 그러면 "스테이징에서 테스트한 이미지"와 "프로덕션에 배포한 이미지"가 다른 산출물이 되어 테스트의 의미가 사라진다.

> **같은 이미지를 모든 환경에 배포하고, 설정만 환경별로 주입한다.**

쿠버네티스는 이를 위해 **ConfigMap**(일반 설정)과 **Secret**(민감 정보) 두 리소스를 제공한다.

## 2. ConfigMap

### 만드는 방법

```bash
kubectl create configmap app-config \
  --from-literal=LOG_LEVEL=info --from-literal=MAX_CONNECTIONS=100   # 리터럴
kubectl create configmap app-config --from-file=./app.properties      # 파일 (키 = 파일명)
kubectl create configmap app-config --from-file=./config-dir/         # 디렉터리 전체
kubectl create configmap app-config --from-env-file=./app.env         # .env 파일
```

선언형:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "info"              # 단순 키-값
  MAX_CONNECTIONS: "100"
  app.yaml: |                    # 파일 전체를 하나의 값으로
    server:
      port: 8080
      timeout: 30s
```

> **`data`의 값은 모두 문자열이어야 한다.** `MAX_CONNECTIONS: 100`이나 `DEBUG: true`는 에러이고, `"100"`, `"true"`로 써야 한다.

### 주입 방법 1: 환경변수

```yaml
containers:
  - name: app
    image: hello:1.0
    env:
      - name: LOG_LEVEL
        valueFrom:
          configMapKeyRef: { name: app-config, key: LOG_LEVEL }
    envFrom:                       # 전체 키를 한 번에
      - configMapRef: { name: app-config }
      - secretRef:    { name: app-secret }
```

`envFrom`은 간편하지만 주의가 필요하다.

- ConfigMap의 **모든 키**가 환경변수가 되므로, 나중에 키를 추가하면 의도치 않은 변수가 생길 수 있다.
- 키 이름이 환경변수로 유효하지 않으면(예: `app.yaml`) **조용히 건너뛴다.**
- 여러 소스에 같은 키가 있으면 나중 것이 이기며, `env`가 `envFrom`보다 우선한다.

> **환경변수는 절대 갱신되지 않는다.** ConfigMap을 수정해도 이미 실행 중인 Pod의 환경변수는 바뀌지 않는다. 프로세스의 환경변수는 시작 시점에 고정되기 때문이다. 반영하려면 Pod를 재생성해야 한다.

### 주입 방법 2: 볼륨 마운트

```yaml
spec:
  volumes:
    - name: config
      configMap:
        name: app-config
  containers:
    - name: app
      volumeMounts:
        - name: config
          mountPath: /etc/app
          readOnly: true
```

`items`를 생략하면 **모든 키가 파일**이 된다.

```
/etc/app/
├── LOG_LEVEL          (내용: info)
├── MAX_CONNECTIONS    (내용: 100)
└── app.yaml
```

**`subPath`의 함정.** 기존 디렉터리에 파일 하나만 끼워 넣을 때 `subPath`를 쓴다(`mountPath: /etc/nginx/nginx.conf`, `subPath: nginx.conf`). 다른 파일들은 유지되지만, **`subPath`로 마운트한 파일은 ConfigMap이 바뀌어도 자동 갱신되지 않는다.** 갱신이 필요하면 디렉터리 마운트를 쓴다.

### 볼륨 마운트의 자동 갱신

환경변수와 달리 **볼륨으로 마운트한 ConfigMap은 자동으로 갱신된다.** kubelet이 새 타임스탬프 디렉터리를 만들고 `..data` 심볼릭 링크를 원자적으로 교체하므로 부분적으로 갱신된 파일을 읽는 일이 없다. 지연은 kubelet 동기화 주기(기본 1분)와 캐시 TTL을 합쳐 **최대 2분 정도**다.

**파일이 바뀌어도 앱이 다시 읽지 않으면 소용없다.** 앱이 파일 변경을 감지하는 로직을 갖고 있거나, 아래 6절의 롤아웃 유도 패턴을 써야 한다.

### 세 방식 비교

| | 환경변수 | 볼륨 마운트 | 볼륨 + `subPath` |
|---|---|---|---|
| 자동 갱신 | 절대 안 됨 | 됨 (최대 &#126;2분 지연) | 안 됨 |
| 앱 수정 필요 | 없음 | 파일 읽기 로직 | 파일 읽기 로직 |
| 큰 설정 파일 | 부적합 | 적합 | 적합 |
| 대표 용도 | 단순 값, 12-factor 스타일 | 설정 파일, 인증서 | 기존 디렉터리에 파일 하나 추가 |

실습: 같은 ConfigMap을 환경변수(`GREETING`)와 볼륨(`app.conf`)으로 모두 주입한 Pod를 띄우고 ConfigMap을 `kubectl patch`로 수정하면, 1&#126;2분 뒤 환경변수 값은 그대로이고 파일 내용만 바뀐 것을 로그로 확인할 수 있다.

## 3. Secret

### ConfigMap과의 차이

Secret은 구조적으로 ConfigMap과 거의 같다.

| | ConfigMap | Secret |
|---|---|---|
| 데이터 필드 | `data`(평문) | `data`(base64) 또는 `stringData`(평문 입력) |
| etcd 저장 | 평문 | 평문 (**암호화 설정 안 하면**) |
| kubelet 캐싱 | 노드 디스크 | **tmpfs(메모리)** |
| 최대 크기 | 1MiB | 1MiB |

> **base64는 암호화가 아니다.**
>
> ```bash
> kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d
> ```
>
> 누구나 디코딩할 수 있다. base64는 바이너리 데이터를 안전하게 전송하기 위한 **인코딩**이지 보호 수단이 아니다. **Secret이 ConfigMap보다 실제로 나은 점은 두 가지뿐이다.** ① 노드에서 tmpfs(메모리)에 저장되어 디스크에 남지 않는다. ② RBAC로 권한을 분리할 수 있고, 로그·이벤트에 값이 노출되지 않도록 시스템이 더 조심한다. 실제 보호는 저장 시 암호화와 외부 시크릿 관리로 만들어야 한다.

### 만드는 방법

```bash
kubectl create secret generic db-secret \
  --from-literal=username=admin --from-literal=password='S3cur3P@ss'
kubectl create secret tls my-tls --cert=./tls.crt --key=./tls.key
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com --docker-username=user --docker-password=pass
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
stringData:              # 평문으로 쓰면 API 서버가 인코딩해 준다
  username: admin
  password: S3cur3P@ss
```

`stringData`를 쓰면 base64를 직접 계산할 필요가 없다. 타입에는 `Opaque`(기본), `kubernetes.io/tls`, `kubernetes.io/dockerconfigjson`, `kubernetes.io/basic-auth`, `kubernetes.io/ssh-auth` 등이 있고, 타입을 지정하면 API 서버가 필수 키를 검증해 준다.

### 주입 방법과 볼륨 권장

주입은 ConfigMap과 같다(`secretKeyRef`, `secret` 볼륨).

```yaml
volumes:
  - name: secret-vol
    secret:
      secretName: db-secret
      defaultMode: 0400        # 소유자만 읽기
```

**환경변수보다 볼륨을 권장한다.** 환경변수로 주입한 시크릿은 앱이 크래시할 때 에러 리포팅 도구가 환경변수를 통째로 전송하거나, 자식 프로세스에 자동 상속되거나, PID를 공유하면 같은 Pod의 다른 컨테이너가 `/proc/<pid>/environ`으로 읽는 등 유출 경로가 많다. 볼륨은 파일 권한으로 제어할 수 있고 갱신도 된다.

## 4. Downward API: Pod 자신의 정보 주입

앱이 자기 Pod 이름, 네임스페이스, 노드, IP를 알아야 할 때(로그 출처, 메트릭 라벨 등) 쓴다.

```yaml
env:
  - name: POD_NAME
    valueFrom: { fieldRef: { fieldPath: metadata.name } }
  - name: POD_NAMESPACE
    valueFrom: { fieldRef: { fieldPath: metadata.namespace } }
  - name: POD_IP
    valueFrom: { fieldRef: { fieldPath: status.podIP } }
  - name: NODE_NAME
    valueFrom: { fieldRef: { fieldPath: spec.nodeName } }
  - name: MEMORY_LIMIT_MB
    valueFrom:
      resourceFieldRef:
        resource: limits.memory
        divisor: 1Mi
```

`resourceFieldRef`는 JVM이나 Node.js처럼 컨테이너 메모리 한도를 알아야 힙 크기를 정할 수 있는 앱에 특히 유용하다. 라벨·애노테이션 **전체**는 환경변수가 아니라 `downwardAPI` 볼륨으로만 파일로 받을 수 있으며, 이 볼륨은 갱신된다.

## 5. Secret의 실제 보호

### 저장 시 암호화 (Encryption at Rest)

기본 설정에서 **Secret은 etcd에 평문으로 저장된다.** etcd 백업 파일을 얻은 사람은 모든 시크릿을 읽을 수 있다. API 서버에 `EncryptionConfiguration`을 주면(`--encryption-provider-config` 플래그) 암호화된다.

| 프로바이더 | 특징 |
|---|---|
| `identity` | 암호화 안 함(기본) |
| `aescbc` | AES-CBC. 널리 쓰였으나 `aesgcm` 권장 |
| `aesgcm` | AES-GCM. 빠르지만 키 교체가 잦아야 함 |
| `secretbox` | XSalsa20+Poly1305 |
| `kms` v2 | **외부 KMS 연동. 프로덕션 권장** |

KMS v2가 실질적인 정답이다. 데이터 암호화 키를 클라우드 KMS(AWS KMS, GCP Cloud KMS, Azure Key Vault)로 보호하므로 키가 etcd나 API 서버 디스크에 남지 않는다. 암호화 설정은 **새로 쓰이는 데이터에만** 적용되므로, 기존 Secret은 `kubectl get secrets -A -o json | kubectl replace -f -`로 다시 써야 한다.

### 외부 시크릿 관리

etcd 암호화를 해도 남는 문제가 있다. ① GitOps를 하려면 매니페스트가 Git에 있어야 하는데 Secret을 그대로 넣을 수 없다. ② 로테이션이 수동이다. ③ 누가 언제 읽었는지 감사 추적이 없다. 실무 해법은 셋이다.

| 방법 | 설명 | 적합한 상황 |
|---|---|---|
| **Workload Identity** (예: EKS IRSA) | 정적 자격 증명 자체를 없앤다. ServiceAccount 토큰이 IAM 역할로 교환되고 자동 로테이션된다 | 클라우드 리소스 접근(S3, RDS 등) |
| **External Secrets Operator** | 외부 저장소(AWS Secrets Manager, Vault 등)를 소스로 K8s Secret을 자동 생성·동기화. 매니페스트에 실제 값이 없어 Git에 안전 | 외부 SaaS API 키 등 |
| **Sealed Secrets** | 값을 클러스터 공개키로 암호화해 Git에 커밋. 클러스터 안의 컨트롤러만 복호화. 외부 시스템 불필요하나 로테이션은 수동 | 소규모 팀, 외부 시스템 없음 |

어떤 경우든 **etcd 암호화(KMS)** 는 기본으로 한다.

## 6. 설정 변경 시 롤아웃 유도하기

ConfigMap을 바꿔도 환경변수는 갱신되지 않고 볼륨은 앱이 다시 읽어야 반영된다. 게다가 Deployment의 spec이 바뀌지 않았으므로 컨트롤러는 아무 조치도 하지 않는다. 그래서 **설정이 바뀌면 Pod를 새로 만드는** 것이 가장 확실하다.

| 방법 | 설명 |
|---|---|
| **체크섬 애노테이션**(권장) | ConfigMap의 해시를 Pod 템플릿 애노테이션에 넣는다. 설정이 바뀌면 해시가 바뀌어 템플릿이 달라지고 롤링 업데이트가 자동 발생. Helm에서는 `checksum/config` 애노테이션에 설정 내용의 `sha256sum` 값을 넣는 패턴을 쓴다 |
| **Kustomize `configMapGenerator`** | 내용 해시를 이름에 붙여(`app-config-7d9f8b2c4k`) 내용이 바뀌면 새 ConfigMap이 생기고 Deployment 참조도 갱신되어 롤아웃. 이전 버전이 남아 롤백도 가능 |
| **수동 재시작** | `kubectl rollout restart deployment/app`. 간단하지만 자동화되지 않음 |
| **Reloader** | ConfigMap/Secret 변경을 감시해 관련 Deployment를 자동 재시작하는 오퍼레이터 |
| **불변 ConfigMap + 버전 이름** | `immutable: true` + 이름에 버전(`app-config-v2`). 실수로 프로덕션 설정을 바꾸는 사고를 막고 kubelet이 변경을 감시할 필요가 없어 API 서버 부하도 줄어든다. 새 이름으로 바꾸면 롤링 업데이트가 일어나고 이전 ConfigMap이 남아 롤백이 쉽다 |

## 핵심 요약

- **같은 이미지를 모든 환경에 배포하고 설정만 주입한다.** ConfigMap은 일반 설정, Secret은 민감 정보용이며 구조는 거의 같다.
- **환경변수는 절대 갱신되지 않고, 볼륨 마운트는 갱신된다**(최대 2분 지연). `subPath` 마운트는 갱신되지 않는다.
- **base64는 암호화가 아니다.** Secret의 실질적 이점은 노드 tmpfs 저장과 RBAC 분리뿐이며, 실제 보호는 etcd 암호화(KMS v2)와 외부 시크릿 관리로 만든다.
- 시크릿은 환경변수보다 **볼륨으로** 주입하는 편이 안전하다.
- **Downward API**로 Pod 이름·노드·IP·리소스 한도를 앱에 주입할 수 있다.
- 설정 변경 시 롤아웃을 유도하려면 체크섬 애노테이션, 내용 해시 이름, `rollout restart`, `immutable` ConfigMap 등을 쓴다.

## 확인 질문

1. ConfigMap을 수정했을 때, 환경변수로 주입된 값과 볼륨으로 마운트된 파일은 각각 어떻게 되는가?
2. "Secret은 base64로 저장되니 안전하다"는 말이 틀린 이유는 무엇이며, Secret이 ConfigMap보다 나은 점은 무엇인가?
3. 설정을 바꿨는데 Deployment가 아무 반응이 없을 때, Pod를 새로 만들게 하는 방법 두 가지를 말해 보라.

*원문 근거: kubernetes-textbook-main/02-워크로드-실행하기/07-설정과-시크릿.md (들어가며, 7.1 ConfigMap 만드는 방법·환경변수·볼륨·subPath·자동 갱신·비교, 7.2 Secret 차이·base64·타입·볼륨 권장, 7.3 Downward API, 7.4 저장 시 암호화, 7.5 외부 시크릿 관리(개요만), 7.6 설정 변경 시 롤아웃 유도)*
