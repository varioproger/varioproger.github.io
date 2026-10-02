---
title: "17장. ConfigMap과 Secret"
parent: "3부. 쿠버네티스 핵심"
grand_parent: "Docker와 Kubernetes 필수 이론"
nav_order: 17
---

# 17장. ConfigMap과 Secret

> **🎮 게임 서버 개발자에게** — C++ 서버에서 `server.ini`나 `config.json`을 실행 파일 옆에 두고 기동 시 읽던 것, 그것을 쿠버네티스가 "리소스"로 관리해 주는 것이 ConfigMap과 Secret이다. 결정적 차이는 **주입 방식에 따라 갱신 여부가 갈린다**는 것이다. 환경변수로 넣으면 프로세스가 죽을 때까지 그대로이고, 파일로 넣으면 바뀌지만 서버가 다시 읽어야 의미가 있다. 그리고 Secret의 base64는 XOR 난독화보다도 약한 "인코딩"일 뿐이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 점검 없이 로그 레벨만 바꾸려고 ConfigMap을 고쳤는데 서버가 그대로 `info`로 찍는다.
> - 크래시 리포트(에러 리포팅 도구)에 DB 비밀번호가 통째로 실려 나갔다.
> - "Secret은 base64니까 Git에 올려도 된다"는 PR이 올라왔다.

## 코어 — 이것만은 100%

> **한 문장:** 같은 이미지를 모든 환경에 배포하고 설정은 ConfigMap·Secret으로 주입하되, 환경변수는 절대 갱신되지 않고 볼륨은 갱신되며(`subPath` 제외), base64는 암호화가 아니므로 Secret은 etcd 암호화(KMS)와 외부 시크릿 관리로 보호하고, 설정 변경은 Pod를 새로 만드는 롤아웃 유도로 반영한다.

1. **이미지와 설정 분리** — 같은 이미지 + 환경별 설정 주입. ConfigMap(일반 설정)과 Secret(민감 정보)은 구조가 거의 같다.
2. **주입 방식이 갱신을 결정한다** — 환경변수 = 절대 안 됨(프로세스 시작 시 고정), 볼륨 마운트 = 됨(최대 ~2분, 앱이 다시 읽어야 함), `subPath` = 안 됨. Downward API로 Pod 자신의 정보도 같은 방식으로 주입한다.
3. **Secret의 진실: base64는 인코딩** — 실질적 이점은 tmpfs 저장과 RBAC 분리뿐이다. 보호는 etcd 암호화(KMS v2) + 외부 시크릿 관리로 만들고, 주입은 볼륨을 권장한다.
4. **설정 변경은 Pod를 새로 만들어 반영한다** — ConfigMap만 바꾸면 Deployment spec이 그대로라 컨트롤러가 반응하지 않는다. 체크섬 애노테이션·해시 이름·`rollout restart`·Reloader·불변 ConfigMap으로 롤아웃을 유도한다.

**이 장의 학습 목표**
- 이미지와 설정을 분리해야 하는 이유와 ConfigMap의 사용법을 이해한다. (→ 코어 1)
- 환경변수 주입과 볼륨 마운트의 차이, 특히 **갱신 동작의 차이**를 안다. (→ 코어 2)
- Secret의 한계(base64는 암호화가 아니다)와 실제 보호 수단을 이해한다. (→ 코어 3)
- 설정이 바뀌었을 때 안전하게 롤아웃을 유도하는 패턴을 안다. (→ 코어 4)

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 실행 파일 옆의 `server.ini`, 빌드마다 `#define`으로 서버 주소 박기 | ConfigMap으로 설정 분리 | 바이너리와 설정을 떼어 같은 빌드를 여러 환경에 쓴다 | 설정은 클러스터의 API 오브젝트다. 값은 모두 문자열이고, 최대 1MiB이며, 파일을 직접 복사해 넣는 것이 아니라 kubelet이 주입한다 |
| `getenv()`로 읽는 프로세스 환경변수 | `env` / `envFrom` 주입 | 시작 시점에 고정되어 바꾸려면 재시작해야 한다 | 쿠버네티스에서 "재시작"은 컨테이너 재시작이 아니라 **Pod 재생성**이어야 반영된다. ConfigMap을 고쳐도 자동으로 일어나지 않는다 |
| 설정 파일 hot reload (inotify 감시 후 재로드) | ConfigMap 볼륨 자동 갱신 | 파일 내용이 바뀌고, 앱이 다시 읽어야 반영된다 | 파일을 덮어쓰는 것이 아니라 `..data` 심볼릭 링크를 원자적으로 교체한다. 지연이 최대 2분 정도이고, `subPath` 마운트는 아예 갱신되지 않는다 |
| 설정 파일의 DB 비밀번호를 XOR·Base64로 "숨기기" | Secret의 `data`(base64) | 평문이 바로 눈에 보이지 않을 뿐이다 | 보호 수단이 아니다. 진짜 보호는 etcd 저장 시 암호화(KMS)·RBAC·외부 시크릿 관리라는 **별도 계층**에서 만든다 |
| 패치 배포 = 서버 프로세스 재기동 | 롤아웃 유도(체크섬 애노테이션 등) | 새 설정을 확실히 반영하는 방법은 새로 띄우는 것 | 사람이 재기동하는 것이 아니라, Pod 템플릿을 바꿔 Deployment 컨트롤러가 롤링 업데이트하게 만든다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 환경마다 설정이 다르면 이미지를 환경별로 따로 빌드하면 안 되는 이유는?
> 2. ConfigMap을 수정하면 실행 중인 Pod의 환경변수는 바뀔까? 마운트된 파일은?
> 3. Secret이 base64로 저장된다면, 그것은 안전한 걸까?
> 4. ConfigMap만 바꿨을 때 Deployment가 아무 반응도 하지 않는 이유는?
>
> **처리법:** 🛠 실습 `kubectl create configmap/secret`, 같은 ConfigMap을 환경변수와 볼륨으로 주입한 뒤 `kubectl patch`로 수정해 갱신 차이 관찰, `base64 -d`로 Secret 디코딩 → 바로 실행 · 🗺 관계도 이미지 ↔ 설정 분리, ConfigMap ↔ Secret, 주입 방식(env / 볼륨 / subPath) ↔ 갱신 여부, Secret 보호(etcd 암호화·외부 시크릿 관리), 롤아웃 유도 패턴 · 📦 카드로 최대 크기 1MiB, 갱신 지연 최대 ~2분, Secret 타입 목록, 암호화 프로바이더 목록, Downward API fieldPath

---

## 코어 1. 이미지와 설정 분리

### 1.1 왜 설정을 분리하는가

**한 줄 요약:** 같은 이미지를 모든 환경에 배포해야 테스트한 산출물이 곧 배포한 산출물이 된다.

이미지는 불변이다([8장](../2부-컨테이너와-Docker/08-이미지-레이어-레지스트리-OCI.md)). 그런데 같은 애플리케이션을 개발·스테이징·프로덕션에 배포하려면 DB 주소, 로그 레벨, 기능 플래그가 달라야 한다. **설정을 이미지에 넣으면** 환경마다 다른 이미지를 빌드해야 하고, 그러면 "스테이징에서 테스트한 이미지"와 "프로덕션에 배포한 이미지"가 다른 산출물이 되어 테스트의 의미가 사라진다.

> **같은 이미지를 모든 환경에 배포하고, 설정만 환경별로 주입한다.**

쿠버네티스는 이를 위해 **ConfigMap**(일반 설정)과 **Secret**(민감 정보) 두 리소스를 제공한다.

### 1.2 ConfigMap 만드는 방법

**한 줄 요약:** 리터럴·파일·디렉터리·.env로 만들 수 있고, 선언형 `data`의 값은 모두 문자열이어야 한다.

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

## 코어 2. 주입 방식이 갱신을 결정한다

### 2.1 주입 방법 1: 환경변수

**한 줄 요약:** 환경변수는 프로세스 시작 시점에 고정되므로 절대 갱신되지 않는다.

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

### 2.2 주입 방법 2: 볼륨 마운트와 `subPath`의 함정

**한 줄 요약:** 볼륨으로 마운트하면 키마다 파일이 되고, `subPath`로 파일 하나만 끼워 넣으면 갱신되지 않는다.

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

### 2.3 볼륨 마운트의 자동 갱신

**한 줄 요약:** kubelet이 `..data` 심볼릭 링크를 원자적으로 교체해 최대 2분 정도 뒤 갱신하지만, 앱이 다시 읽어야 의미가 있다.

환경변수와 달리 **볼륨으로 마운트한 ConfigMap은 자동으로 갱신된다.** kubelet이 새 타임스탬프 디렉터리를 만들고 `..data` 심볼릭 링크를 원자적으로 교체하므로 부분적으로 갱신된 파일을 읽는 일이 없다. 지연은 kubelet 동기화 주기(기본 1분)와 캐시 TTL을 합쳐 **최대 2분 정도**다.

**파일이 바뀌어도 앱이 다시 읽지 않으면 소용없다.** 앱이 파일 변경을 감지하는 로직을 갖고 있거나, 아래 코어 4의 롤아웃 유도 패턴을 써야 한다.

### 2.4 세 방식 비교

**한 줄 요약:** 갱신은 "볼륨 마운트(디렉터리)"만 되고, 환경변수와 `subPath`는 안 된다.

| | 환경변수 | 볼륨 마운트 | 볼륨 + `subPath` |
|---|---|---|---|
| 자동 갱신 | 절대 안 됨 | 됨 (최대 &#126;2분 지연) | 안 됨 |
| 앱 수정 필요 | 없음 | 파일 읽기 로직 | 파일 읽기 로직 |
| 큰 설정 파일 | 부적합 | 적합 | 적합 |
| 대표 용도 | 단순 값, 12-factor 스타일 | 설정 파일, 인증서 | 기존 디렉터리에 파일 하나 추가 |

실습: 같은 ConfigMap을 환경변수(`GREETING`)와 볼륨(`app.conf`)으로 모두 주입한 Pod를 띄우고 ConfigMap을 `kubectl patch`로 수정하면, 1&#126;2분 뒤 환경변수 값은 그대로이고 파일 내용만 바뀐 것을 로그로 확인할 수 있다.

### 2.5 Downward API: Pod 자신의 정보 주입

**한 줄 요약:** Pod 이름·네임스페이스·노드·IP·리소스 한도를 같은 env/볼륨 방식으로 앱에 넣는다.

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

## 코어 3. Secret — base64는 암호화가 아니다

### 3.1 ConfigMap과의 차이

**한 줄 요약:** Secret은 구조가 ConfigMap과 거의 같고, 실질적 차이는 노드 tmpfs 저장과 RBAC 분리뿐이다.

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

### 3.2 만드는 방법

**한 줄 요약:** `generic`·`tls`·`docker-registry`로 만들고, 선언형은 `stringData`로 평문을 쓰면 API 서버가 인코딩한다.

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

### 3.3 주입 방법과 볼륨 권장

**한 줄 요약:** 주입 방식은 ConfigMap과 같지만, 시크릿은 유출 경로가 적은 볼륨으로 넣는다.

주입은 ConfigMap과 같다(`secretKeyRef`, `secret` 볼륨).

```yaml
volumes:
  - name: secret-vol
    secret:
      secretName: db-secret
      defaultMode: 0400        # 소유자만 읽기
```

**환경변수보다 볼륨을 권장한다.** 환경변수로 주입한 시크릿은 앱이 크래시할 때 에러 리포팅 도구가 환경변수를 통째로 전송하거나, 자식 프로세스에 자동 상속되거나, PID를 공유하면 같은 Pod의 다른 컨테이너가 `/proc/<pid>/environ`으로 읽는 등 유출 경로가 많다. 볼륨은 파일 권한으로 제어할 수 있고 갱신도 된다.

### 3.4 저장 시 암호화 (Encryption at Rest)

**한 줄 요약:** 기본은 etcd 평문 저장이며, 프로덕션은 KMS v2로 암호화하고 기존 Secret은 다시 써야 한다.

기본 설정에서 **Secret은 etcd에 평문으로 저장된다.** etcd 백업 파일을 얻은 사람은 모든 시크릿을 읽을 수 있다. API 서버에 `EncryptionConfiguration`을 주면(`--encryption-provider-config` 플래그) 암호화된다.

| 프로바이더 | 특징 |
|---|---|
| `identity` | 암호화 안 함(기본) |
| `aescbc` | AES-CBC. 널리 쓰였으나 `aesgcm` 권장 |
| `aesgcm` | AES-GCM. 빠르지만 키 교체가 잦아야 함 |
| `secretbox` | XSalsa20+Poly1305 |
| `kms` v2 | **외부 KMS 연동. 프로덕션 권장** |

KMS v2가 실질적인 정답이다. 데이터 암호화 키를 클라우드 KMS(AWS KMS, GCP Cloud KMS, Azure Key Vault)로 보호하므로 키가 etcd나 API 서버 디스크에 남지 않는다. 암호화 설정은 **새로 쓰이는 데이터에만** 적용되므로, 기존 Secret은 `kubectl get secrets -A -o json | kubectl replace -f -`로 다시 써야 한다.

### 3.5 외부 시크릿 관리

**한 줄 요약:** Git 커밋·로테이션·감사 추적 문제는 Workload Identity·External Secrets Operator·Sealed Secrets로 푼다.

etcd 암호화를 해도 남는 문제가 있다. ① GitOps를 하려면 매니페스트가 Git에 있어야 하는데 Secret을 그대로 넣을 수 없다. ② 로테이션이 수동이다. ③ 누가 언제 읽었는지 감사 추적이 없다. 실무 해법은 셋이다.

| 방법 | 설명 | 적합한 상황 |
|---|---|---|
| **Workload Identity** (예: EKS IRSA) | 정적 자격 증명 자체를 없앤다. ServiceAccount 토큰이 IAM 역할로 교환되고 자동 로테이션된다 | 클라우드 리소스 접근(S3, RDS 등) |
| **External Secrets Operator** | 외부 저장소(AWS Secrets Manager, Vault 등)를 소스로 K8s Secret을 자동 생성·동기화. 매니페스트에 실제 값이 없어 Git에 안전 | 외부 SaaS API 키 등 |
| **Sealed Secrets** | 값을 클러스터 공개키로 암호화해 Git에 커밋. 클러스터 안의 컨트롤러만 복호화. 외부 시스템 불필요하나 로테이션은 수동 | 소규모 팀, 외부 시스템 없음 |

어떤 경우든 **etcd 암호화(KMS)** 는 기본으로 한다.

## 코어 4. 설정 변경은 Pod를 새로 만들어 반영한다

### 4.1 설정 변경 시 롤아웃 유도하기

**한 줄 요약:** Pod 템플릿이 바뀌어야 Deployment가 움직이므로, 설정 변경을 템플릿 변경(또는 재시작)으로 바꿔 준다.

ConfigMap을 바꿔도 환경변수는 갱신되지 않고 볼륨은 앱이 다시 읽어야 반영된다. 게다가 Deployment의 spec이 바뀌지 않았으므로 컨트롤러는 아무 조치도 하지 않는다. 그래서 **설정이 바뀌면 Pod를 새로 만드는** 것이 가장 확실하다.

| 방법 | 설명 |
|---|---|
| **체크섬 애노테이션**(권장) | ConfigMap의 해시를 Pod 템플릿 애노테이션에 넣는다. 설정이 바뀌면 해시가 바뀌어 템플릿이 달라지고 롤링 업데이트가 자동 발생. Helm에서는 `checksum/config` 애노테이션에 설정 내용의 `sha256sum` 값을 넣는 패턴을 쓴다 |
| **Kustomize `configMapGenerator`** | 내용 해시를 이름에 붙여(`app-config-7d9f8b2c4k`) 내용이 바뀌면 새 ConfigMap이 생기고 Deployment 참조도 갱신되어 롤아웃. 이전 버전이 남아 롤백도 가능 |
| **수동 재시작** | `kubectl rollout restart deployment/app`. 간단하지만 자동화되지 않음 |
| **Reloader** | ConfigMap/Secret 변경을 감시해 관련 Deployment를 자동 재시작하는 오퍼레이터 |
| **불변 ConfigMap + 버전 이름** | `immutable: true` + 이름에 버전(`app-config-v2`). 실수로 프로덕션 설정을 바꾸는 사고를 막고 kubelet이 변경을 감시할 필요가 없어 API 서버 부하도 줄어든다. 새 이름으로 바꾸면 롤링 업데이트가 일어나고 이전 ConfigMap이 남아 롤백이 쉽다 |

## 실무 적용

### 체크리스트

- [ ] **같은 이미지를 모든 환경에 배포하고 설정만 주입한다.** ConfigMap은 일반 설정, Secret은 민감 정보용이며 구조는 거의 같다. (→ 코어 1)
- [ ] ConfigMap `data` 값은 모두 따옴표로 감싼 문자열로 쓴다(`"100"`, `"true"`). (→ 코어 1)
- [ ] **환경변수는 절대 갱신되지 않고, 볼륨 마운트는 갱신된다**(최대 2분 지연). `subPath` 마운트는 갱신되지 않는다. 갱신이 필요하면 디렉터리 마운트 + 앱의 재로드 로직을 둔다. (→ 코어 2)
- [ ] `envFrom`을 쓰면 키 추가 시 의도치 않은 변수, 유효하지 않은 키 무시, 우선순위(`env` > `envFrom`, 나중 소스 승)를 점검한다. (→ 코어 2)
- [ ] **Downward API**로 Pod 이름·노드·IP·리소스 한도를 앱에 주입할 수 있다. 힙 크기를 정해야 하는 런타임은 `resourceFieldRef`를 쓴다. (→ 코어 2)
- [ ] **base64는 암호화가 아니다.** Secret의 실질적 이점은 노드 tmpfs 저장과 RBAC 분리뿐이며, 실제 보호는 etcd 암호화(KMS v2)와 외부 시크릿 관리로 만든다. 암호화를 켠 뒤 기존 Secret을 다시 쓴다. (→ 코어 3)
- [ ] 시크릿은 환경변수보다 **볼륨으로**(`defaultMode: 0400`) 주입하는 편이 안전하다. (→ 코어 3)
- [ ] 설정 변경 시 롤아웃을 유도하려면 체크섬 애노테이션, 내용 해시 이름, `rollout restart`, Reloader, `immutable` ConfigMap 등을 쓴다. (→ 코어 4)

### 시나리오로 확인하기

1. **상황:** 접속자가 몰리는 시간에 디버깅하려고 `kubectl edit configmap app-config`로 `LOG_LEVEL`을 `debug`로 바꿨다. 10분이 지나도 로그는 여전히 `info`다. C++ 서버였다면 "설정 파일 바꿨으니 다음 틱에 읽겠지" 하고 기다렸을 것이다.
   **질문:** 왜 반영되지 않았고, 어떻게 해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `LOG_LEVEL`을 환경변수(`env`/`envFrom`)로 주입했다면 프로세스 시작 시점에 고정되어 절대 갱신되지 않는다. 또한 ConfigMap만 바꾸면 Deployment spec이 그대로라 컨트롤러도 아무 조치를 하지 않는다. `kubectl rollout restart deployment/app`으로 Pod를 새로 만들거나, 평소에 체크섬 애노테이션·`configMapGenerator`·Reloader로 설정 변경이 롤아웃으로 이어지게 해 둔다. 재기동 없이 바꾸고 싶은 값이라면 디렉터리 볼륨으로 마운트하고 앱이 파일을 다시 읽게 만든다(최대 2분 지연). → 코어 2, 코어 4

   </details>

2. **상황:** nginx 설정을 `mountPath: /etc/nginx/nginx.conf`, `subPath: nginx.conf`로 넣어 두었다. ConfigMap을 고친 뒤 5분이 지났는데 컨테이너 안의 파일 내용이 예전 그대로다.
   **질문:** 원인과 해결책은?

   <details markdown="1"><summary>답 확인</summary>

   `subPath`로 마운트한 파일은 ConfigMap이 바뀌어도 자동 갱신되지 않는다. 갱신이 필요하면 디렉터리 마운트를 쓰거나, Pod를 새로 만드는 롤아웃 유도 패턴(체크섬 애노테이션 등)을 쓴다. → 코어 2, 코어 4

   </details>

3. **상황:** 앱이 크래시했는데 에러 리포팅 도구로 전송된 리포트에 DB 비밀번호가 보인다. Secret은 `envFrom: - secretRef`로 주입했다.
   **질문:** 왜 새어 나갔고, 무엇을 바꿔야 하나?

   <details markdown="1"><summary>답 확인</summary>

   환경변수로 주입한 시크릿은 에러 리포팅 도구가 환경변수를 통째로 전송하거나, 자식 프로세스에 자동 상속되거나, PID를 공유하면 같은 Pod의 다른 컨테이너가 `/proc/<pid>/environ`으로 읽는 등 유출 경로가 많다. `secret` 볼륨으로 바꾸고 `defaultMode: 0400`처럼 파일 권한으로 제어한다. 볼륨은 갱신도 된다. → 코어 3

   </details>

4. **상황:** 동료가 "Secret 매니페스트는 base64라 사람이 못 읽으니 Git에 그대로 커밋해도 된다"며 PR을 올렸다.
   **질문:** 무엇이 틀렸고, Git에 매니페스트를 두려면 어떻게 해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   base64는 인코딩일 뿐 누구나 `base64 -d`로 디코딩한다. Git에 두려면 실제 값이 매니페스트에 없게 하는 External Secrets Operator(외부 저장소를 소스로 동기화)나, 클러스터 공개키로 암호화해 커밋하는 Sealed Secrets를 쓴다. 클라우드 리소스 접근용 자격 증명이라면 Workload Identity로 정적 자격 증명 자체를 없앤다. 어떤 경우든 etcd 암호화(KMS)는 기본이다. → 코어 3

   </details>

5. **상황:** C++ 서버에서 하던 대로 스테이징용·프로덕션용 이미지를 빌드 옵션만 바꿔 따로 만들기로 했다.
   **질문:** 이 방식의 문제는?

   <details markdown="1"><summary>답 확인</summary>

   "스테이징에서 테스트한 이미지"와 "프로덕션에 배포한 이미지"가 다른 산출물이 되어 테스트의 의미가 사라진다. 같은 이미지를 모든 환경에 배포하고 환경별 차이는 ConfigMap·Secret으로 주입한다. → 코어 1

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
코어 1. 이미지와 설정 분리
  왜 분리? 설정을 이미지에 넣으면 → ____
  ConfigMap 생성: --from-literal / --from-file / ( ? ) / --from-env-file
  data 값은 모두 ____

코어 2. 주입 방식이 갱신을 결정한다
  주입: env(configMapKeyRef) / envFrom(주의 3가지: ____, ____, ____) / 볼륨
  갱신: env ____ / 볼륨 ____(최대 ____분, ..data 심볼릭 링크) / subPath ____
  Downward API: fieldRef(____, ____, ____) / resourceFieldRef(____)

코어 3. Secret — base64는 ( ? ) ≠ 암호화
  ConfigMap과 차이: data(____) / stringData / etcd ____ / kubelet 캐싱 ____
  실제 이점 2가지: ____, ____
  주입은 ____ 권장 (환경변수 유출 경로: ____, ____, ____)
  Encryption at Rest: identity(기본) → ... → ( ? ) 권장, 기존 Secret은 ____
  외부 관리: ( ? ) / ( ? ) / ( ? )

코어 4. 롤아웃 유도
  체크섬 애노테이션 / ( ? ) / rollout restart / Reloader / ( ? )
```

### 2. 인출 질문

1. ConfigMap을 수정했을 때, 환경변수로 주입된 값과 볼륨으로 마운트된 파일은 각각 어떻게 되는가? (확인 질문 1)

   <details markdown="1"><summary>답 확인</summary>

   환경변수는 프로세스 시작 시점에 고정되므로 절대 갱신되지 않고, 반영하려면 Pod를 재생성해야 한다. 볼륨으로 마운트한 파일은 kubelet이 `..data` 심볼릭 링크를 원자적으로 교체해 최대 2분 정도 뒤 자동 갱신된다. 단 `subPath` 마운트는 갱신되지 않고, 파일이 바뀌어도 앱이 다시 읽지 않으면 소용없다. → 코어 2

   </details>

2. "Secret은 base64로 저장되니 안전하다"는 말이 틀린 이유는 무엇이며, Secret이 ConfigMap보다 나은 점은 무엇인가? (확인 질문 2)

   <details markdown="1"><summary>답 확인</summary>

   base64는 바이너리 데이터를 안전하게 전송하기 위한 인코딩일 뿐 누구나 `base64 -d`로 디코딩할 수 있고, 기본 설정에서는 etcd에도 평문으로 저장된다. Secret의 실질적 이점은 ① 노드에서 tmpfs(메모리)에 저장되어 디스크에 남지 않는다 ② RBAC로 권한을 분리할 수 있고 로그·이벤트 노출을 시스템이 더 조심한다, 두 가지뿐이다. → 코어 3

   </details>

3. 설정을 바꿨는데 Deployment가 아무 반응이 없을 때, Pod를 새로 만들게 하는 방법 두 가지를 말해 보라. (확인 질문 3)

   <details markdown="1"><summary>답 확인</summary>

   Deployment의 spec이 바뀌지 않았으므로 컨트롤러는 조치하지 않는다. ① ConfigMap 해시를 Pod 템플릿 애노테이션에 넣는 체크섬 애노테이션(Helm `checksum/config`) ② Kustomize `configMapGenerator`로 내용 해시를 이름에 붙이기 ③ `kubectl rollout restart` ④ Reloader ⑤ `immutable: true` + 버전 이름 중 두 가지를 들면 된다. → 코어 4

   </details>

4. 환경마다 다른 이미지를 빌드하지 않고 설정을 분리해야 하는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   설정을 이미지에 넣으면 환경마다 다른 이미지를 빌드해야 하고, "스테이징에서 테스트한 이미지"와 "프로덕션에 배포한 이미지"가 다른 산출물이 되어 테스트의 의미가 사라진다. 그래서 같은 이미지를 모든 환경에 배포하고 설정만 주입한다. → 코어 1

   </details>

5. `envFrom`을 쓸 때 주의할 점은?

   <details markdown="1"><summary>답 확인</summary>

   ConfigMap의 모든 키가 환경변수가 되어 나중에 키를 추가하면 의도치 않은 변수가 생길 수 있고, `app.yaml`처럼 환경변수로 유효하지 않은 키는 조용히 건너뛰며, 같은 키가 여러 소스에 있으면 나중 것이 이기고 `env`가 `envFrom`보다 우선한다. → 코어 2

   </details>

6. 시크릿을 환경변수보다 볼륨으로 주입하라고 권하는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   환경변수는 크래시 시 에러 리포팅 도구가 통째로 전송하거나, 자식 프로세스에 자동 상속되거나, PID를 공유하면 같은 Pod의 다른 컨테이너가 `/proc/<pid>/environ`으로 읽는 등 유출 경로가 많다. 볼륨은 파일 권한(`defaultMode: 0400`)으로 제어할 수 있고 갱신도 된다. → 코어 3

   </details>

7. etcd 저장 시 암호화에서 권장되는 프로바이더와, 설정 후 주의할 점은?

   <details markdown="1"><summary>답 확인</summary>

   기본은 `identity`(암호화 안 함)이고, 프로덕션 권장은 외부 KMS와 연동해 키가 etcd나 API 서버 디스크에 남지 않는 `kms` v2다. 암호화 설정은 새로 쓰이는 데이터에만 적용되므로 기존 Secret은 `kubectl get secrets -A -o json | kubectl replace -f -`로 다시 써야 한다. → 코어 3

   </details>

8. Workload Identity, External Secrets Operator, Sealed Secrets는 각각 어떤 상황에 맞나?

   <details markdown="1"><summary>답 확인</summary>

   Workload Identity(예: EKS IRSA)는 정적 자격 증명 자체를 없애 클라우드 리소스(S3, RDS) 접근에 맞다. External Secrets Operator는 외부 저장소(Secrets Manager, Vault)에서 K8s Secret을 자동 동기화해 외부 SaaS API 키 등에 맞다. Sealed Secrets는 클러스터 공개키로 암호화해 Git에 커밋하며 외부 시스템이 없는 소규모 팀에 맞다(로테이션은 수동). 어느 경우든 etcd 암호화(KMS)는 기본이다. → 코어 3

   </details>

9. Downward API의 `resourceFieldRef`는 어떤 앱에 유용한가?

   <details markdown="1"><summary>답 확인</summary>

   JVM이나 Node.js처럼 컨테이너 메모리 한도를 알아야 힙 크기를 정할 수 있는 앱에 유용하다(`limits.memory`를 `divisor: 1Mi`로 받음). 라벨·애노테이션 전체는 `downwardAPI` 볼륨으로만 받을 수 있다. → 코어 2

   </details>

### 3. 기억 고리

- **C++ 유추:** 환경변수 주입 = `getenv()`로 기동 시 한 번 읽는 값, 볼륨 마운트 = 실행 중 다시 읽을 수 있는 설정 파일. ⚠️ 깨지는 곳: 파일은 덮어쓰기가 아니라 `..data` 심볼릭 링크 교체로 최대 2분 늦게 바뀌고, `subPath`면 아예 안 바뀌며, "재기동"은 컨테이너 재시작이 아니라 Pod 재생성이어야 한다.
- **비유:** 환경변수 주입 = 출발 전에 손에 쥐여 준 종이 쪽지(다시 받으려면 재출발=Pod 재생성), 볼륨 마운트 = 벽에 걸린 게시판(관리자가 바꾸면 바뀌지만, 직원이 다시 봐야 의미가 있다). ⚠️ 비유가 깨지는 지점: 게시판도 즉시가 아니라 최대 2분 정도 늦게 바뀌고, `subPath`로 붙인 쪽지 한 장은 게시판이어도 갱신되지 않는다.
- **묶음(3의 법칙):** 주입 3방식(env·볼륨·subPath)과 갱신 여부(안 됨·됨·안 됨) / 외부 시크릿 관리 3가지(Workload Identity·External Secrets Operator·Sealed Secrets) / etcd 암호화 후에도 남는 문제 3가지(Git에 못 넣음·수동 로테이션·감사 추적 없음).
- **대칭·순서:** ConfigMap(`data` 평문, 노드 디스크) ↔ Secret(`data` base64 / `stringData`, tmpfs). 인코딩(base64) ↔ 암호화(KMS).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "ConfigMap을 바꿨는데 앱이 왜 그대로인가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "ini 파일 고치면 다음 틱에 다시 읽잖아?"라고 묻는 동료에게 환경변수·볼륨·`subPath`의 갱신 차이와 Pod 재생성이 필요한 이유를 설명해 보세요.
- **랜덤 논리 게임:** A "외부 시스템 없이 Sealed Secrets로 Git에 암호화해 커밋하는 게 간단하고 충분하다" vs B "External Secrets Operator로 외부 저장소를 진실의 원천으로 두어야 로테이션·감사가 된다" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 ConfigMap·Secret의 주입 방식과 Secret 보호 방법을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

*원문 근거: kubernetes-textbook-main/02-워크로드-실행하기/07-설정과-시크릿.md (들어가며, 7.1 ConfigMap 만드는 방법·환경변수·볼륨·subPath·자동 갱신·비교, 7.2 Secret 차이·base64·타입·볼륨 권장, 7.3 Downward API, 7.4 저장 시 암호화, 7.5 외부 시크릿 관리(개요만), 7.6 설정 변경 시 롤아웃 유도)*
