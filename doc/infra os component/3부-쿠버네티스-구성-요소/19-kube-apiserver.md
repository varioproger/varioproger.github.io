---
title: "19장. kube-apiserver"
parent: "3부. 쿠버네티스 구성 요소"
grand_parent: "Linux·Docker·Kubernetes OS 구성 요소 필수 이론"
nav_order: 19
---

# 19장. kube-apiserver

> **🎮 게임 서버 개발자에게** — kube-apiserver는 게임 서버로 치면 **모든 클라이언트와 내부 서버가 거치는 게이트웨이 + 인증 서버 + 상태 DB 프록시 + 푸시 서버**를 한 프로세스에 합친 것이다. 요청이 들어오면 패킷 핸들러 체인(복구 → 타임아웃 → 로그인 인증 → 권한 검사 → 치트 검증)을 통과해 DB에 쓰이고, 변경은 구독자 수천 명에게 푸시된다. 새로운 점은 **구독(watch)이 시스템 전체의 심장**이라는 것이다. kubelet과 모든 컨트롤러가 이 구독 하나로 움직인다. 수천 개 구독을 DB가 감당할 수 있는 이유(watch cache)와, 폭주하는 클라이언트 하나가 중요한 요청(노드 하트비트)을 밀어내지 못하게 하는 장치(APF)가 이 장의 핵심이다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - `kubectl` 명령이 갑자기 느려지거나 `429 Too Many Requests`, `401`, `403`이 뜬다. 어느 단계의 문제인지 구분해야 한다.
> - 직접 만든 매치메이킹/오퍼레이터 컨트롤러가 API 서버에 요청을 쏟아 전체 클러스터가 느려진다.
> - 새 배포가 통째로 막히는데 원인이 어드미션 웹훅 서버가 죽은 것으로 보인다.

## 코어 — 이것만은 100%

> **한 문장:** kube-apiserver는 모든 요청을 "필터 체인(인증→감사→APF→인가) → 버전 변환 → 어드미션(Mutating→검증→Validating) → etcd 저장"의 정해진 순서로 처리하는 stateless 관문이고, 변경은 watch cache를 통해 수천 클라이언트에 fan-out한다.

1. **요청 처리 경로는 순서가 곧 설계다** — 인증(401) → 인가(403) → 어드미션 → 저장. 쿠버네티스에는 "사용자 오브젝트"가 없고 인증기는 username/groups 문자열만 뽑는다.
2. **어드미션은 Mutating → 스키마 검증 → Validating** — 기본값을 먼저 넣고 나중에 검증한다. `failurePolicy: Fail` 웹훅 서버가 죽으면 해당 리소스의 생성/수정이 전부 막힌다.
3. **버전 변환은 허브(내부 버전) 경유** — N개 버전에 2N개 변환 함수. etcd에는 스토리지 버전을 protobuf로 저장한다.
4. **watch cache가 etcd watch를 fan-out한다** — 리소스 종류당 etcd watch는 하나. 오래된 `resourceVersion`은 `410 Gone`이고 relist가 필요하다.
5. **APF가 폭주를 격리한다** — FlowSchema로 분류하고 PriorityLevel 큐로 나눠, 한 클라이언트가 노드 보고(`node-high`)와 리더 선출 몫을 침해하지 못하게 한다. 응답은 429.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 패킷 핸들러 파이프라인(복구→타임아웃→인증→권한→검증→처리) | 필터 체인(핸들러 래핑) | 바깥에서 안으로 통과하고 응답은 역순. 각 단계는 자기 관심사만 처리 | 단계 순서 자체가 규칙이다. 예: APF는 인증 뒤, 인가 앞. 인가도 비용이 드는 작업이라 그 앞에서 동시성을 통제한다 |
| 로그인 서버가 DB에서 계정 조회 | 인증 | 요청에서 신원을 확인한다 | 쿠버네티스에는 사용자 저장소가 없다. 인증서·토큰·OIDC 같은 외부 증거에서 문자열 신원을 추출할 뿐이다 |
| 패킷 프로토콜 버전 관리(v1/v2 호환) | 버전 변환 허브 | 서로 다른 버전의 클라이언트를 같은 저장 포맷에 연결 | 버전끼리 직접 변환하지 않고 항상 **내부 버전을 경유**해 2N개로 해결한다 |
| 수천 명 구독자에게 이벤트를 브로드캐스트하는 푸시 서버 | watch cache + fan-out | DB를 직접 구독시키지 않고 서버 메모리에서 복제 전송 | 오래된 구독 위치(`resourceVersion`)로 재접속하면 `410 Gone`. 이어받기가 안 되고 **전체 재조회(relist)** 가 필요하다 |
| 접속 큐/요청 레이트 리미터(방별·IP별) | API Priority & Fairness | 폭주 요청을 격리해 핵심 요청을 보호 | 단순 전역 제한이 아니라 **분류(FlowSchema) × 큐 배분(PriorityLevel)** 이고, 일부 레벨은 몫이 보장된다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 401과 403은 각각 어느 단계의 실패이고 무엇을 점검해야 할까?
> 2. 인증보다 인가가 먼저 오면 안 되는 이유는 쉽다. 그런데 큐잉(APF)이 인가보다 먼저 오는 이유는?
> 3. kubelet 수천 개가 동시에 watch하는데 etcd는 어떻게 버틸까?
> 4. 어드미션 웹훅 서버가 죽으면 왜 `kubectl apply`가 전부 실패할 수 있을까?
>
> **처리법:** 🛠 실습 `kubectl auth can-i --list`, `kubectl get --raw /readyz?verbose`, `kubectl get flowschemas`, `kubectl --v=9 get pods` → 바로 실행 · 🗺 관계도 요청 처리 7단계 + 어드미션 순서, 허브 변환 그림 · 📦 카드로 401/403, 우선순위 레벨 표, 위험 권한 표

### 이 장에서 배우는 것

- 요청이 apiserver 안에서 거치는 필터 체인과 그 순서의 이유
- 인증(사용자 오브젝트 없음), 인가(RBAC), 어드미션(Mutating/Validating, 웹훅 위험)
- 버전 변환 허브 모델과 내장/CRD/어그리게이션 API 세 경로
- watch cache, `resourceVersion`, `410 Gone`, Bookmark
- API Priority & Fairness와 진단(헬스, 메트릭)

---

## 코어 1. 요청 처리 경로와 인증·인가

### 1.1 핸들러 래핑과 필터 체인

**한 줄 요약:** 요청은 겹겹이 감싼 핸들러를 바깥에서 안으로 통과하고, 응답은 반대로 나간다.

API 서버의 요청 처리는 Go의 `http.Handler`를 겹겹이 감싼 **데코레이터 체인**이다. 각 필터는 자기 관심사만 처리하고 다음 핸들러를 호출해 위임한다.

```go
// 개념적 표현 — 실제 코드는 DefaultBuildHandlerChain() 등에 분산되어 있다
handler := finalRESTHandler                     // 실제 라우팅 대상 핸들러
handler = withAuthorization(handler)             // 가장 안쪽부터 감싼다
handler = withImpersonation(handler)
handler = withPriorityAndFairness(handler)
handler = withAudit(handler)
handler = withAuthentication(handler)
handler = withRequestTimeout(handler)
handler = withPanicRecovery(handler)             // 가장 바깥쪽
```

(C++로는 미들웨어를 `handler = Wrap(handler)`로 겹쳐 쌓는 것과 같다.) 전체 경로는 이렇다.

```
HTTP 요청
 ① 필터 체인: panic 복구 → 요청 타임아웃 → 인증 → 감사 시작
              → Impersonation → API Priority & Fairness(큐잉) → 인가
 ② 라우팅: /api/v1/namespaces/default/pods/web → 그룹/버전/리소스/이름 파싱 → REST 핸들러
 ③ 역직렬화 + 버전 변환: 외부 버전(v1) → 내부 버전(__internal)
 ④ 어드미션 체인: Mutating → 스키마 검증 → Validating
 ⑤ 스토리지 계층: 내부 → 스토리지 버전 → protobuf → (암호화) → etcd 쓰기
 ⑥ 응답: 스토리지 버전 → 내부 → 요청한 외부 버전 → JSON/protobuf 직렬화
```

필터 체인 순서의 이유는 세 가지다.

- **인증이 인가보다 먼저** — 누구인지 모르면 권한을 판단할 수 없다. 인증 실패는 401, 인가 실패는 403이다.
- **APF가 인가보다 먼저** — 인가(특히 Webhook 기반)도 CPU와 네트워크를 쓰는 작업이라 과부하의 원인이 될 수 있다. 그보다 앞에서 동시성을 제어한다. APF의 FlowSchema 매칭은 이미 인증된 `user.Info`를 기준으로 한다.
- **Impersonation이 APF보다 먼저** — `--as` 등으로 가장한 사용자의 신원 기준으로 우선순위 큐가 결정되어야 하기 때문이다.

### 1.2 인증: 사용자 오브젝트가 없다

**한 줄 요약:** 인증은 증거(인증서·토큰)에서 username과 groups 문자열을 뽑는 일이고, 사용자 관리는 외부 시스템의 몫이다.

```bash
kubectl get users        # error: the server doesn't have a resource type "users"
```

쿠버네티스는 사용자를 저장하지 않는다. 인증 성공 후 API 서버가 아는 것은 이것뿐이다.

```
username: "alice@example.com"
groups:   ["dev-team", "system:authenticated"]
uid:      "..."
extra:    {...}
```

예외는 **ServiceAccount**다. 이것만 실제 API 오브젝트이며 이름 형식은 `system:serviceaccount:<ns>:<name>`이다([30장](30-설정-보안.md)에서 다룬다).

여러 인증기를 순서대로 시도해 **하나라도 성공하면 통과**한다.

| 방식 | 핵심 |
|---|---|
| X.509 클라이언트 인증서 | CN → username, O → groups. **폐기(revocation) 불가**(CRL/OCSP 미지원). 유출 시 만료까지 유효하므로 짧은 유효기간, 부트스트랩·긴급 접근 용도로 제한 |
| OIDC | 사람 인증의 표준. 중앙 ID 관리, MFA, 짧고 폐기 가능한 토큰, 그룹을 IdP에서 관리 |
| ServiceAccount 토큰 | 워크로드용 |
| Webhook 토큰 인증 | 외부 서비스(클라우드 IAM)에 검증 위임 |
| 정적 토큰 파일 | 절대 쓰지 말 것. 평문 저장, 변경 시 재시작, 폐기 불가 |

특수 신원도 알아 둔다.

```
system:anonymous          인증되지 않은 요청
system:unauthenticated    익명 요청의 그룹
system:authenticated      인증된 모든 요청이 속하는 그룹
system:masters            cluster-admin과 동등. RBAC를 우회한다
```

`system:masters`는 인가 단계에 하드코딩되어 RBAC로 제한할 수 없다. kubeadm의 `admin.conf` 인증서가 `O=system:masters`이므로 이 파일은 평소에 쓰지 말고 금고에 보관한다. 폐기할 방법도 없다.

**401 vs 403**: 401은 신원 확인 실패(인증서·토큰·kubeconfig 문제), 403은 신원은 확인됐지만 권한이 없는 것(RBAC 문제)이다.

```bash
kubectl auth whoami                       # 나는 누구인가
kubectl auth can-i create pods            # 내가 이것을 할 수 있는가
kubectl auth can-i list secrets --as=system:serviceaccount:default:my-sa
kubectl auth can-i --list -n default      # 내가 할 수 있는 모든 것
```

### 1.3 인가: RBAC 네 리소스

**한 줄 요약:** Role/ClusterRole은 권한, RoleBinding/ClusterRoleBinding은 연결이며, RoleBinding+ClusterRole 조합이 실무 핵심이다.

| Binding | Role 참조 | 적용 범위 |
|---|---|---|
| RoleBinding | Role | 그 네임스페이스 |
| RoleBinding | **ClusterRole** | **그 네임스페이스에만** (재사용 패턴) |
| ClusterRoleBinding | ClusterRole | 클러스터 전체 |
| ClusterRoleBinding | Role | 불가능 |

내장 ClusterRole: `cluster-admin`(모든 것), `admin`(네임스페이스 안 모든 것+RBAC 관리), `edit`(읽기/쓰기, RBAC 제외), `view`(읽기 전용, **Secret 제외**).

세 가지를 기억한다.

- **`list`는 `get`보다 훨씬 위험하다.** secrets에 `list` 권한이 있으면 그 네임스페이스의 모든 시크릿을 덤프할 수 있다. `resourceNames`는 `list`/`watch`에 적용되지 않는다(이름 없이 전체를 요청하므로).
- **권한 상승 방지** — Role을 만들거나 수정하려면 그 안의 모든 권한을 이미 갖고 있거나 `escalate` 동사가 있어야 하고, RoleBinding은 참조 Role 권한 보유 또는 `bind` 권한이 필요하다. 없으면 `edit`만 가진 사용자가 스스로 `cluster-admin`이 될 수 있다.
- **`pods` `create` 권한은 사실상 노드 루트 권한이다.** hostPath 마운트나 특권 컨테이너로 노드를 장악할 수 있다. 주체는 그룹 기반으로 바인딩한다.

| 위험한 권한 | 이유 |
|---|---|
| `secrets` `list`/`get` | 자격증명 유출 |
| `pods/exec`, `pods/attach` | 컨테이너 침투 |
| `pods` `create` | hostPath, 특권 컨테이너로 노드 장악 |
| `nodes/proxy` | kubelet API 직접 호출 |
| `escalate`, `bind`, `impersonate` | 권한 상승 |
| `certificatesigningrequests/approval` | 임의 인증서 발급 |
| `serviceaccounts/token` | 임의 SA 토큰 발급 |

## 코어 2. 어드미션 컨트롤

### 2.1 위치와 순서

**한 줄 요약:** 인가를 통과한 요청이 etcd에 저장되기 직전에 Mutating(수정) → 스키마 검증 → Validating(거부) 순서로 개입한다.

```
인가 통과
 ① Mutating Admission   ← 요청을 수정한다 (내장 플러그인 + MutatingAdmissionWebhook)
 ② 스키마 검증 (OpenAPI)
 ③ Validating Admission ← 거부할 수 있다 (내장 + ValidatingAdmissionPolicy(CEL) + ValidatingAdmissionWebhook)
etcd 저장
```

Mutating이 먼저인 이유는 기본값을 주입한 뒤에 검증해야 하기 때문이다. LimitRange가 기본값을 넣고 ResourceQuota가 그 값으로 총량을 검사하는 순서가 그것이다.

| 내장 플러그인 | 역할 |
|---|---|
| `NamespaceLifecycle` | 없거나 종료 중인 네임스페이스에 생성 거부 |
| `LimitRanger`, `ResourceQuota` | 기본값 주입·범위 검사, 쿼터 검사 |
| `ServiceAccount` | SA 토큰 볼륨 주입 |
| `PodSecurity` | Pod Security Standards 강제 |
| `DefaultStorageClass` | PVC에 기본 StorageClass 주입 |
| `NodeRestriction` | kubelet이 자기 노드/Pod만 수정하도록 제한(침해된 노드의 kubelet이 다른 노드 Pod를 조작하는 것을 차단) |
| `Mutating/ValidatingAdmissionWebhook` | 외부 웹훅 호출 |

### 2.2 ValidatingAdmissionPolicy와 웹훅의 위험

**한 줄 요약:** 단순한 정책은 웹훅 서버 없이 CEL로 강제하고, 웹훅은 `failurePolicy`가 클러스터 가용성을 좌우한다.

ValidatingAdmissionPolicy(v1.30 GA)는 CEL 표현식으로 정책을 쓰며 외부 서버가 필요 없다. 웹훅 서버 가용성 문제가 없고 API 서버 안에서 실행돼 지연이 없으며, `validationActions: Warn`으로 점진 도입이 가능하다. 외부 데이터 조회나 복잡한 로직은 불가능해 그런 경우는 웹훅이 필요하다.

```yaml
validations:
  - expression: |
      object.spec.template.spec.containers.all(c,
        !c.image.endsWith(":latest"))
    message: "latest 태그는 사용할 수 없습니다"
```

> **⚠️ 웹훅의 위험** `failurePolicy: Fail`인 웹훅 서버가 죽으면 해당 리소스의 모든 생성/수정이 차단되어 클러스터가 마비될 수 있다. 대비책은 `namespaceSelector`로 `kube-system` 제외, 웹훅 서버 다중화, `timeoutSeconds` 짧게(5&#126;10초), 처음에는 `failurePolicy: Ignore`로 시작하는 것이다.

## 코어 3. 버전 변환 허브와 API 세 경로

### 3.1 허브 앤 스포크

**한 줄 요약:** 모든 버전은 내부 버전으로만 변환되므로 N개 버전에 2N개 함수면 된다.

```
        v1beta1 ──┐
                  ├──→ 내부 버전(__internal) ──→ 스토리지 버전 ──→ etcd
        v1 ────────┘        (허브)
        읽을 때는 정확히 반대 방향
```

버전끼리 직접 변환하면 `N × (N-1)`개가 필요하다. 그래서 `v1beta1`으로 만든 오브젝트를 `v1`로 읽을 수 있다. etcd에 실제로 쓰이는 바이트는 요청받은 버전이 아니라 **스토리지 버전**으로 변환된 뒤 기본적으로 **protobuf**로 직렬화된 것이다(사용자에게는 Accept 헤더에 따라 JSON으로 다시 직렬화). 이 모델을 구동하는 세 구성 요소는 다음과 같다.

| 구성 요소 | 역할 |
|---|---|
| Scheme | Go 타입 ↔ GroupVersionKind 매핑 레지스트리, 변환·기본값 함수 등록 |
| Codec | JSON/YAML/protobuf 직렬화·역직렬화(`Accept`/`Content-Type`에 따라 선택) |
| RESTMapper | 리소스 이름(`pods`, `deployments`, 축약어) ↔ GVK ↔ REST 경로 매핑 |

```bash
kubectl get --raw /apis/apps/v1 | jq '.resources[] | select(.name=="deployments") | .storageVersionHash'
```

### 3.2 내장 / CRD / 어그리게이션

**한 줄 요약:** API가 모두 apiserver 프로세스 안에서 구현되는 것은 아니다. `metrics.k8s.io`는 별도 서버로 프록시된다.

| 구분 | 처리 위치 | 스키마 검증 | 대표 예 |
|---|---|---|---|
| 내장 API | apiserver 프로세스, 컴파일된 코드 | Go 타입 기반 | Pod, Deployment, Service |
| CRD 기반 API | 같은 프로세스, 동적 등록 | OpenAPI v3 스키마 | 대부분의 오퍼레이터 커스텀 리소스 |
| 어그리게이션 API | 별도 프로세스로 프록시(`APIService`의 `service` 필드) | 해당 서버가 자체 구현 | metrics.k8s.io |

```bash
kubectl get apiservices | grep -v Local
# v1beta1.metrics.k8s.io   kube-system/metrics-server   True
```

어그리게이션 API는 apiserver가 인증·인가까지만 처리하고 그 이후를 해당 서비스로 전달한다.

## 코어 4. watch cache와 resourceVersion

### 4.1 etcd watch는 종류당 하나

**한 줄 요약:** 클라이언트가 1만 개여도 etcd가 받는 watch 부하는 늘지 않는다. apiserver가 메모리에서 복제해 나눠 준다.

```
etcd
  │ (리소스 종류마다 etcd watch를 정확히 하나만 연다)
  ▼
watch cache (apiserver 프로세스 메모리)
  · 최근 이벤트를 순환 버퍼로 보관
  · 현재 오브젝트 전체 상태의 스냅샷 유지
  │ fan-out
  ▼ kubelet #1, kubelet #2, 컨트롤러, Informer ...
```

> **[보충]** HA 구성에서는 apiserver 인스턴스마다 이 watch cache를 독립 유지하므로 실제 etcd watch 수는 "인스턴스 수 × 리소스 종류"다.

### 4.2 resourceVersion, 410 Gone, Bookmark

**한 줄 요약:** `resourceVersion`은 etcd의 논리적 시계이고, 너무 오래된 값으로 재접속하면 `410 Gone`을 받고 relist해야 한다.

```
watch?resourceVersion=""       현재 상태를 모두 전송한 뒤 이후 변경분부터 스트리밍
watch?resourceVersion="0"      캐시의 임의 시점에서 시작 (가장 빠르나 다소 오래된 데이터 가능)
watch?resourceVersion="12345"  정확히 그 리비전 이후의 변경만
```

연결이 끊겼다가 마지막 `resourceVersion`으로 재접속했는데 그 리비전이 순환 버퍼에서 밀려났다면 `410 Gone: too old resource version`이 온다. 클라이언트는 **전체 목록을 다시 받아(relist)** 재시작해야 하며, Informer가 이를 자동 처리한다([22장](22-컨트롤러-매니저.md)). **Bookmark** 이벤트는 변경이 없어도 주기적으로 "현재 resourceVersion은 여기까지"를 알려 클라이언트 위치를 최신으로 유지해 410 빈도를 줄인다.

대규모 클러스터에서 `list`는 위험하다. Pod가 5만 개일 때 전체 목록 요청은 수백 MB를 직렬화해 apiserver 메모리를 폭증시킨다. `kubectl get pods -A --chunk-size=500`으로 쪼개고, Streaming List는 전체를 메모리에 모으지 않고 스트리밍한다.

> ⚠️ `410 Gone`은 TCP 재접속 시 "마지막으로 받은 시퀀스 번호부터 이어받기"가 실패하는 것에 가깝다. 다만 게임 서버의 재접속 복구와 달리 여기서는 **버퍼에서 사라졌다면 스냅샷부터 다시 받는 것이 정식 절차**다. 그래서 Informer는 항상 list + watch 쌍으로 설계된다.

## 코어 5. API Priority & Fairness와 진단

### 5.1 APF: 분류하고 큐를 나눈다

**한 줄 요약:** 오작동 컨트롤러 하나가 kubelet 노드 보고나 리더 선출을 밀어내지 못하게, 요청을 분류해 우선순위 큐별 몫으로 격리한다.

과거에는 `--max-requests-inflight` 하나로 전체 동시 요청 수만 제한했다. 폭주하는 컨트롤러 하나가 한도를 잠식하면 kubelet의 노드 상태 보고나 Lease 갱신까지 밀려나 연쇄 장애로 번졌다. APF는 이를 요청 분류와 큐 분리로 해결한다.

```
요청 → FlowSchema(어떤 큐로 갈지 분류) → PriorityLevelConfiguration(큐 + 동시성 배분)
```

```bash
kubectl get flowschemas
kubectl get prioritylevelconfigurations
```

| 레벨 | 대상 |
|---|---|
| `exempt` | `system:masters` 등 제한 없음 |
| `system` | 핵심 시스템 컴포넌트 |
| `node-high` | kubelet의 노드/Pod 상태 보고 |
| `leader-election` | 리더 선출(기아 방지) |
| `workload-high` | kube-system의 컨트롤러 |
| `workload-low` | 일반 사용자 워크로드의 ServiceAccount |
| `global-default` / `catch-all` | 나머지 / 어디에도 매칭되지 않은 것 |

어떤 워크로드가 폭주해도 요청은 자신이 속한 레벨의 큐와 동시성 몫만 소진하므로 `node-high`와 `leader-election` 몫은 침해되지 않는다. 특정 오퍼레이터 ServiceAccount를 낮은 큐로 격리하려면 `FlowSchema`의 `priorityLevelConfiguration`을 `workload-low`로 지정하고 `matchingPrecedence`를 정한다. **낮을수록 먼저 매칭**한다.

`apiserver_flowcontrol_rejected_requests_total`이 계속 오르면 큐가 포화이고 해당 클라이언트는 **429**를 받아 백오프해야 한다. client-go 기본 클라이언트는 이를 자동 재시도한다.

### 5.2 저장 시 암호화와 감사

**한 줄 요약:** etcd의 Secret은 기본적으로 평문이고, `EncryptionConfiguration`의 providers 첫 항목이 쓰기에 쓰인다.

기본적으로 etcd에 저장되는 오브젝트(Secret 포함)는 평문이며 etcd의 접근 제어(mTLS, 파일 권한)에만 의존한다. `--encryption-provider-config`로 지정한 `EncryptionConfiguration`에서 `providers` 목록의 **첫 항목이 새로 쓸 때의 방식**이고 나머지는 기존 데이터를 읽기 위한 폴백이다. 처음 도입할 때는 `identity: {}`를 뒤에 남겨 미암호화 데이터를 읽고, 전체 재저장 후 제거한다.

감사(Audit)는 `--audit-policy-file`의 `level`로 `None` → `Metadata`(누가/언제/무엇) → `Request` → `RequestResponse` 4단계를 정한다. Secret은 `Metadata`로 제한해 값이 로그에 남지 않게 한다.

### 5.3 진단

**한 줄 요약:** `/livez`는 재시작 판단, `/readyz`는 트래픽 수신 판단이며, 가장 중요한 선행 지표는 `etcd_request_duration_seconds`다.

```bash
kubectl get --raw /livez?verbose
kubectl get --raw /readyz?verbose
kubectl get --raw '/readyz/etcd'
kubectl --v=9 get pods -n kube-system     # 원시 HTTP 요청·응답 확인
```

| 증상 | 가능한 원인 | 확인 |
|---|---|---|
| `kubectl` 전반이 느림 | etcd 지연, apiserver 과부하 | `etcd_request_duration_seconds`, `apiserver_current_inflight_requests` |
| `429 Too Many Requests` | APF 제한 | `apiserver_flowcontrol_rejected_requests_total`, FlowSchema |
| `etcdserver: request timed out` | etcd 자체 문제 | [20장](20-etcd.md) |
| watch가 자주 끊기고 relist | 순환 버퍼 대비 이벤트량 과다 | `apiserver_watch_events_total`, 410 빈도 |
| `Unable to connect to the server` | apiserver 다운, 인증서 만료 | static Pod 로그, `kubeadm certs check-expiration` |

`kubectl --v=9`의 `Accept` 헤더에 `as=Table`이 보이는 것은 서버 사이드 프린팅으로, `kubectl get`의 열 형식을 서버가 결정한다는 뜻이다.

## 실무 적용

### 체크리스트

- [ ] 요청 경로를 필터 체인(인증→감사→APF→인가) → 버전 변환 → 어드미션 → etcd 순서로 말할 수 있다.
- [ ] 401은 신원(인증서·토큰·kubeconfig), 403은 권한(RBAC)으로 진단한다. `kubectl auth can-i`를 쓴다.
- [ ] 사람 인증은 OIDC, 클라이언트 인증서는 폐기가 불가능하다는 점을 안다. `admin.conf`는 평소에 쓰지 않는다.
- [ ] 직접 만든 컨트롤러가 `list`를 반복 호출하지 않고 Informer(list+watch, 캐시)를 쓴다.
- [ ] 어드미션 웹훅은 `kube-system` 제외, 다중화, 짧은 `timeoutSeconds`, 초기 `failurePolicy: Ignore`를 적용했다.
- [ ] `secrets` `list`, `pods/exec`, `pods` `create`는 위험 권한으로 취급하고 그룹 기반으로 바인딩한다.
- [ ] etcd의 Secret은 기본 평문이므로 필요 시 `EncryptionConfiguration`을 적용했다.
- [ ] `/readyz?verbose`, `etcd_request_duration_seconds`, `apiserver_flowcontrol_rejected_requests_total`을 점검 목록에 넣었다.

### 시나리오로 확인하기

1. **상황:** 새로 만든 개발자 계정으로 `kubectl get pods`를 실행하니 `Forbidden`이 뜬다. 다른 날 인증서를 잘못 설정한 팀원은 `Unauthorized`를 받았다.
   **질문:** 두 증상의 차이와 점검 위치는?

   <details markdown="1"><summary>답 확인</summary>

   `Forbidden`은 403이고 신원은 확인됐지만 권한이 없는 것이므로 RBAC(Role/RoleBinding)을 점검하고 `kubectl auth can-i`로 검증한다. `Unauthorized`는 401이고 인증 단계 실패이므로 인증서·토큰·kubeconfig를 점검한다. 쿠버네티스에 사용자 오브젝트가 없으니 "계정이 없다"가 아니라 증거가 유효한지의 문제다. → 코어 1

   </details>

2. **상황:** 직접 만든 컨트롤러가 1초마다 전체 Pod `list`를 호출한다. 이후 클러스터 전체가 느려지고 다른 팀 요청에 429가 뜬다.
   **질문:** 무엇이 일어났고 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   대규모 `list`가 apiserver 메모리와 etcd에 부하를 준다. APF가 해당 ServiceAccount의 요청을 자신의 우선순위 큐에 가두며 429를 낸다. 해결은 Informer로 list+watch한 로컬 캐시를 읽게 하는 것이다. 임시로는 FlowSchema로 `workload-low`에 격리한다. `node-high`와 `leader-election` 몫은 보호되므로 클러스터가 무너지지는 않는다. → 코어 4, 5

   </details>

3. **상황:** 보안 정책 웹훅 서버(`failurePolicy: Fail`)가 배포 중 크래시했다. 이후 어떤 Deployment도 생성·수정되지 않는다.
   **질문:** 원인과 사전 대비책은?

   <details markdown="1"><summary>답 확인</summary>

   어드미션 단계에서 웹훅 호출이 실패하면 `Fail` 정책이 요청을 거부한다. 대비책은 `namespaceSelector`로 `kube-system` 제외, 웹훅 서버 다중화, `timeoutSeconds` 5&#126;10초, 초기에는 `Ignore`로 시작하는 것이다. 단순한 정책이면 ValidatingAdmissionPolicy(CEL)로 서버 없이 처리한다. → 코어 2

   </details>

4. **상황:** 감시 프로그램이 마지막 `resourceVersion`으로 watch를 재개했는데 `410 Gone: too old resource version`이 돌아왔다.
   **질문:** 어떻게 처리해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   그 리비전이 watch cache의 순환 버퍼에서 밀려난 것이다. 이어받기가 불가능하므로 전체 목록을 다시 조회(relist)하고 새 `resourceVersion`으로 watch를 재시작한다. Informer가 이를 자동 처리한다. Bookmark 이벤트를 받으면 위치가 최신으로 유지되어 빈도가 줄어든다. → 코어 4

   </details>

---

📖 출처: `Kubernetes_Internals_Network_Guide/01-내부-아키텍처/02-kube-apiserver-내부-구조.md`, `kubernetes-textbook-main/04-클러스터-운영/17-인증-인가-어드미션.md`, `kubernetes-textbook-main/05-내부-동작-파헤치기/21-컨트롤-플레인의-핵심.md`

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
[코어 1] 필터 체인: panic 복구 → 타임아웃 → ____ → 감사 → ____ → ____ → ____
         실패 코드: 인증 ( ? ) / 인가 ( ? )      사용자 오브젝트: ____
         RBAC: Role/ClusterRole = ____ , RoleBinding/ClusterRoleBinding = ____
         ClusterRole을 RoleBinding으로 → 범위: ____

[코어 2] Mutating → ____ → Validating     웹훅 failurePolicy: ____ 이면 서버 죽을 때 ____

[코어 3] 버전 N개 → 변환 함수 ____개 (허브 = ____)     etcd 저장 형식: ____
         API 세 경로: ____ / ____ / ____(APIService)

[코어 4] etcd watch는 리소스 종류당 ____ 개 → watch cache → ____
         너무 오래된 resourceVersion → ____ → ____(relist)

[코어 5] 요청 → ____ → ____ ; 보호되는 몫: ____, ____ ; 거부 응답: ____
```

### 2. 인출 질문

1. 요청이 apiserver에서 거치는 필터 체인 순서를 말하고, APF가 인가 앞에 있는 이유를 설명하라.

   <details markdown="1"><summary>답 확인</summary>

   panic 복구 → 타임아웃 → 인증 → 감사 시작 → Impersonation → APF → 인가 순이다. 인가(특히 Webhook)도 CPU·네트워크를 소비해 과부하 원인이 될 수 있으므로 그 앞에서 동시성을 제어한다. APF 분류는 이미 인증된 `user.Info`를 쓴다. → 코어 1.1

   </details>

2. 401과 403의 차이와 각각의 점검 대상은?

   <details markdown="1"><summary>답 확인</summary>

   401은 인증 실패(신원 확인 불가)로 인증서·토큰·kubeconfig를 본다. 403은 인가 실패(신원은 확인됨, 권한 없음)로 RBAC를 본다. → 코어 1.2

   </details>

3. 쿠버네티스에 사용자 오브젝트가 없다는 것은 어떤 의미이고, 클라이언트 인증서의 약점은?

   <details markdown="1"><summary>답 확인</summary>

   인증기가 증거(인증서, 토큰)에서 username과 groups 문자열만 추출하고 사용자 생성·삭제·비밀번호 같은 관리는 외부 시스템(CA, OIDC, IAM)의 일이라는 뜻이다(ServiceAccount만 오브젝트). 클라이언트 인증서는 CRL/OCSP가 없어 폐기가 불가능하고 유출 시 만료까지 유효하다. 그래서 사람 인증은 OIDC가 표준이다. → 코어 1.2

   </details>

4. 어드미션이 Mutating → Validating 순서인 이유와 웹훅 `Fail` 정책의 위험은?

   <details markdown="1"><summary>답 확인</summary>

   기본값을 주입한 뒤 검증해야 하기 때문이다(LimitRange가 값을 넣고 ResourceQuota가 검사). `failurePolicy: Fail` 웹훅 서버가 죽으면 해당 리소스의 모든 생성/수정이 차단되어 클러스터가 마비될 수 있다. → 코어 2

   </details>

5. 버전 변환 허브 모델이 N²가 아니라 2N인 이유는? etcd에는 어떤 형태로 저장되나?

   <details markdown="1"><summary>답 확인</summary>

   모든 버전이 내부 버전으로만, 내부 버전에서만 변환되므로 버전마다 "X→내부", "내부→X" 두 함수면 충분하다. etcd에는 요청 버전이 아니라 스토리지 버전으로 변환해 기본 protobuf로 직렬화해 저장한다. → 코어 3

   </details>

6. 수천 개 watch가 붙어도 etcd가 버티는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   apiserver가 리소스 종류마다 etcd watch를 하나만 유지하고, watch cache(메모리 순환 버퍼 + 현재 상태)에서 클라이언트들에게 이벤트를 복제해 전달(fan-out)하기 때문이다. → 코어 4.1

   </details>

7. `410 Gone`은 언제 나며 클라이언트는 무엇을 해야 하나? Bookmark의 역할은?

   <details markdown="1"><summary>답 확인</summary>

   재접속 시 마지막 `resourceVersion`이 watch cache 순환 버퍼에서 밀려났을 때 난다. 클라이언트는 전체 목록을 relist하고 새 위치로 watch를 재시작한다. Bookmark는 변경이 없어도 주기적으로 현재 resourceVersion을 알려 위치를 최신으로 유지시켜 410 빈도를 낮춘다. → 코어 4.2

   </details>

8. APF는 `--max-requests-inflight`의 어떤 결함을 해결하며 어떤 응답으로 거부하나?

   <details markdown="1"><summary>답 확인</summary>

   요청 종류를 구분하지 않아 폭주 컨트롤러 하나가 전체 한도를 잠식해 kubelet 노드 보고와 리더 선출까지 밀리던 결함이다. FlowSchema로 분류해 PriorityLevel 큐로 나누고 `node-high`, `leader-election` 몫을 보장한다. 큐가 포화되면 429를 반환하고 클라이언트는 백오프한다. → 코어 5.1

   </details>

### 3. 기억 고리

- **C++ 유추:** 패킷 핸들러 미들웨어 체인 = 필터 체인 ⚠️ 순서가 의미를 가진다. 특히 큐잉(APF)이 인가 앞에 있다는 점은 일반 서버 직관과 다를 수 있다.
- **C++ 유추:** 구독 서버의 이벤트 순환 버퍼 + 재접속 시퀀스 = watch cache + `resourceVersion` ⚠️ 버퍼에서 밀려나면 델타 복구가 아니라 전체 스냅샷(relist)을 받는 것이 정식 절차다.
- **비유:** APF = 공항의 우선 심사 라인. 폭주하는 단체 관광객이 있어도 승무원·응급 라인(node-high, leader-election)의 처리 몫은 따로 보장된다. ⚠️ 비유가 깨지는 지점: 대기가 아니라 큐가 가득 차면 429로 즉시 거부하고 클라이언트가 스스로 백오프한다.
- **묶음(3):** 관문 3단계(인증 → 인가 → 어드미션) / API 세 경로(내장·CRD·어그리게이션) / 어드미션 3구간(Mutating → 스키마 → Validating).
- **대칭:** 401(누구냐) ↔ 403(할 수 있냐), `get`(이름으로 하나) ↔ `list`(전부 덤프), Mutating(고친다) ↔ Validating(막는다), `/livez`(재시작) ↔ `/readyz`(트래픽).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`kubectl apply`가 apiserver에서 etcd에 쓰이기까지의 단계를 순서대로" 처음 듣는 사람에게 설명해 보세요. 막히는 단계 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "수천 개 구독자가 붙는데 DB가 안 터지는 구조(watch cache)와 `410 Gone`이 나는 이유"를 푸시 서버 비유로 1분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "어드미션 정책은 모두 웹훅으로 유연하게 구현하자" vs B "가능한 한 ValidatingAdmissionPolicy(CEL)로 하자" — 양쪽을 번갈아 변호해 보세요. (가용성, 지연, 표현력을 근거로)
- **AI 역할 반전:** "내가 APF와 필터 체인 순서를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
