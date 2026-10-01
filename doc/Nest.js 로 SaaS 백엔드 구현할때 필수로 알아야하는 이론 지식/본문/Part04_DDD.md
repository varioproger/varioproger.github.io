---
title: "Part 4. 도메인 주도 설계(DDD) 핵심"
parent: "NestJS SaaS 백엔드 필수 이론"
nav_order: 4
---

# Part 4. 도메인 주도 설계(DDD) 핵심 (출처: Learning Domain-Driven Design)

DDD는 "코드를 비즈니스 문제에 맞춰 설계하는 방법"이다. 크게 두 덩어리로 나뉜다.

| 구분 | 질문 | 다루는 것 |
|---|---|---|
| 전략적 설계(Strategic) | "무엇을, 어디까지, 어떻게 나눌까?" | 서브도메인, 유비쿼터스 언어, 바운디드 컨텍스트, 컨텍스트 맵 |
| 전술적 설계(Tactical) | "그 안의 코드를 어떻게 짤까?" | Transaction Script ~ Domain Model, Aggregate, 아키텍처 패턴 |

SaaS 백엔드는 결제, 구독, 권한, 알림처럼 규칙이 많고 계속 바뀐다. 이때 "모든 곳에 같은 방식으로" 코드를 짜면 어디선가 반드시 무너진다. DDD의 핵심 교훈은 **"중요한 곳에는 정교하게, 단순한 곳에는 단순하게"** 이다.

---

### 1. 서브도메인(Subdomain): 어디에 공을 들일까

#### 1.1 비즈니스 도메인과 서브도메인
- **비즈니스 도메인**: 회사가 고객에게 제공하는 서비스 영역 (예: 프로젝트 관리 SaaS).
- **서브도메인**: 그 서비스를 이루는 작은 업무 영역. 하나만으로는 회사가 성공할 수 없고, 모두 합쳐져야 한다.
- 서브도메인은 "설계해서 만드는 것"이 아니라 **비즈니스가 이미 갖고 있는 것을 발견**하는 것이다.

#### 1.2 세 가지 종류

| 종류 | 설명 | 복잡도 | 변경 빈도 | 구현 전략 |
|---|---|---|---|---|
| **핵심(Core)** | 경쟁사와 차별되는 부분 | 높음 | 높음 | 직접 만든다, 최고 인력, 고급 설계 |
| **일반(Generic)** | 모든 회사가 똑같이 하는 일 (인증, 결제 처리, 이메일 발송) | 높음(하지만 이미 풀린 문제) | 낮음 | 사서 쓰거나 오픈소스 채택 |
| **지원(Supporting)** | 핵심을 돕지만 차별점은 아님 (쿠폰 관리, 단순 관리자 화면) | 낮음 | 낮음 | 직접 만들되 단순하게(CRUD), 외주도 가능 |

- 핵심 서브도메인은 기술적이지 않을 수도 있다. (예: 보석 회사의 핵심은 온라인 쇼핑몰이 아니라 "보석 디자인")
- 구분이 헷갈릴 때 쓰는 질문:
  - "이걸 따로 팔아도 돈이 될까?" → 예이면 핵심.
  - "직접 대충 만드는 게 외부 솔루션 연동보다 싸고 쉬운가?" → 예이면 지원, 아니면 일반.
- 서브도메인은 너무 크게 잡지 말고, **같은 행위자·같은 비즈니스 엔티티·밀접한 데이터를 다루는 일관된 유스케이스 묶음** 정도까지 쪼갠다. 특히 핵심은 잘게 쪼개서 일반/지원 기능을 덜어낸다(원서 예: 고객센터 부서를 쪼개 보면 헬프데스크·전화는 일반, 근무 편성은 지원, 사례 배정 알고리즘은 핵심). 일반/지원은 더 쪼개도 새 통찰이 없으면 멈춰도 된다.
- 핵심 서브도메인이 반드시 소프트웨어일 필요는 없다. 소프트웨어와 무관한 경쟁력은 그렇게 인정하고, 만들 시스템과 관련된 부분에 집중한다.

#### 1.3 예시: 프로젝트 관리 SaaS
> 💡 보충(원서 외): 아래 표는 SaaS 맥락에 맞춘 저자 예시다. 원서의 예시는 Gigmaster(추천 엔진=핵심, 암호화·결제·인증=일반, 외부 서비스 연동=지원)와 BusVNext(경로 알고리즘=핵심, 프로모션 관리=지원)이다.

| 서브도메인 | 종류 | 선택 |
|---|---|---|
| 작업 자동화 규칙 엔진 (우리만의 강점) | 핵심 | 직접 구현, 도메인 모델 |
| 로그인/SSO | 일반 | Auth0/Keycloak 등 사용 |
| 결제/청구서 | 일반 | Stripe 등 연동 |
| 이메일 발송 | 일반 | SES/SendGrid 연동 |
| 팀 초대, 프로필 관리 | 지원 | 단순 CRUD |

**왜 중요한가?** (보충) 인증을 직접 개발하느라 몇 달을 쓰고 정작 핵심 기능은 부실해지는 실수를 막아 준다. 팀 시간을 어디에 쓸지 정하는 기준이 된다.

> 📖 원문: 1장 (Analyzing Business Domains)

---

### 2. 유비쿼터스 언어(Ubiquitous Language): 한 가지 말로 통일하기

- 문제: 도메인 전문가 → 분석가 → 설계자 → 개발자로 전달될 때마다 내용이 변질된다 (전화 게임).
- 해결: **모두가 같은 용어를 쓴다.** 대화, 문서, 이슈, **코드의 클래스·메서드 이름**까지 전부.
- 규칙:
  - 비즈니스 용어만 쓴다. ("active-placements 테이블에 레코드가 있으면" ❌ / "활성 배치가 하나 이상이면 게시할 수 있다" ✅)
  - 한 용어는 한 가지 뜻만 갖는다. 같은 뜻에 다른 단어를 쓰지도 않는다.
  - 모호한 용어(예: policy가 '규정'과 '보험 계약' 둘 다 뜻함)는 각각 별도 용어로 쪼갠다. 동의어(user/visitor/account)도 대개 서로 다른 개념이므로 구분해서 쓴다.
  - 언어는 한 번 정하고 끝이 아니라 계속 다듬는 과정이다. 도메인 이해가 깊어지면 언어도 함께 바꾼다.
  - 도구: 위키 용어집(모두가 함께 고친다)은 명사에 강하고, 행동·규칙은 유스케이스나 Gherkin 테스트(Given/When/Then)로 보완한다. 도구보다 실제로 그 말을 쓰는 것이 우선이다.
- 모델은 현실의 복사본이 아니라 **문제 해결에 필요한 것만 남긴 추상화**다. 지도처럼 목적에 맞는 것만 그린다.

> 💡 보충(원서 외): 아래 코드는 이해를 돕는 저자 예시다.
```ts
// 나쁜 예: 기술 용어 위주
user.status = 3;
// 좋은 예: 도메인 용어 그대로
subscription.cancel(CancellationReason.TooExpensive);
subscription.renew();
```

**왜 중요한가?** "이 상태값 3이 뭐였더라?" 같은 오해 비용이 사라지고, 기획자와 개발자가 같은 문장으로 대화할 수 있다.

> 📖 원문: 2장 (Discovering Domain Knowledge)

---

### 3. 바운디드 컨텍스트(Bounded Context): 모델의 경계

#### 3.1 왜 필요한가
도메인 전문가들의 머릿속 모델이 서로 다를 수 있다. 원서의 텔레마케팅 회사 예시에서 "리드(lead)"라는 단어를 보자.

| 부서 | "리드"의 의미 |
|---|---|
| 마케팅 | 누군가 상품에 관심을 보였다는 알림, 즉 연락처를 받은 **사건** |
| 영업 | 영업 과정 전체의 생명주기를 뜻하는 복잡한 엔티티, 오래 걸리는 **프로세스** |

마케팅 관점으로 단순화하면 영업에는 부족하고, 영업 모델을 마케팅에 가져오면 과하다. 전통적 해법은 회사 전체를 아우르는 하나의 거대한 모델(벽 하나를 덮는 ERD)인데, 결국 아무 데도 잘 맞지 않고 데이터 일관성 유지가 어려워진다. `MarketingLead`, `SalesLead` 같은 접두사로 구분하는 것도 인지 부담이 크고 실제 대화(아무도 접두사를 안 쓴다)와 어긋난다.

**해결**: 언어를 작게 나누고 각각에 **명시적인 적용 범위**를 준다. 그게 바운디드 컨텍스트다.
- 유비쿼터스 언어는 "회사 전체에서" 통하는 게 아니라 **하나의 바운디드 컨텍스트 안에서만** 통한다.
- 컨텍스트 안에서는 용어의 의미가 일관돼야 하고, 밖에서는 같은 단어가 다른 뜻이어도 된다.

#### 3.2 서브도메인과 바운디드 컨텍스트의 차이

| | 서브도메인 | 바운디드 컨텍스트 |
|---|---|---|
| 성격 | 발견한다 (비즈니스 현실) | **설계한다** (우리의 결정) |
| 기준 | 비즈니스 전략과 유스케이스 | 모델·언어의 일관성 |
| 크기 | 비즈니스가 정함 | 좁게도 넓게도 가능 |

#### 3.3 크기와 소유
- 크기 자체는 좋은 기준이 아니다. **모델이 유용한가**가 기준이다.
- 너무 작게 쪼개면 통합 비용이 커지고, 하나의 응집된 기능을 여러 컨텍스트로 찢으면 항상 같이 배포해야 한다.
- **한 컨텍스트는 한 팀이 소유**한다. (한 팀이 여러 컨텍스트를 가질 수는 있다.)
- 바운디드 컨텍스트는 물리적 경계(독립 서비스/프로젝트로 구현·진화·버전 관리)이고, 그 안의 서브도메인은 논리적 경계(네임스페이스·모듈·패키지)다. 논리적 경계가 물리적 경계보다 훨씬 싸게 고칠 수 있다(10장).
- 더 잘게 나누는 이유로는 새 팀 구성, 비기능 요구(독립 배포 주기, 독립 확장) 등이 있다.

> 💡 보충(원서 외): 아래 코드는 저자가 만든 TS 예시다.
```ts
// 같은 "Lead"라도 컨텍스트별로 서로 다른 모델
// marketing/domain/lead.ts
export class Lead { constructor(readonly email: string, readonly source: string) {} }
// sales/domain/lead.ts
export class Lead { /* 상담 이력, 상태 전이, 후속 연락 일정 등 */ }
```

> 🔗 NestJS 연결: 바운디드 컨텍스트는 보통 **NestJS Module(또는 모듈 묶음)** 하나로 표현한다. 다른 모듈의 내부 클래스를 마구 import하지 않고, `exports`한 공개 서비스/이벤트로만 소통하게 하면 경계가 지켜진다.

**왜 중요한가?** 거대한 공용 `User`/`Order` 엔티티가 모든 기능을 얽어 놓는 "진흙덩어리"를 막아 준다. SaaS에서 빌링, 조직/권한, 핵심 기능 도메인을 나누는 기준이다.

> 📖 원문: 3장 (Managing Domain Complexity)

---

### 4. 컨텍스트 통합과 컨텍스트 맵

바운디드 컨텍스트끼리는 서로 통신할 수밖에 없다. 그 접점을 **계약(contract)** 이라 하고, 팀 간 관계에 따라 패턴이 달라진다.

#### 4.1 협력 관계 (팀 간 소통이 잘 될 때)
- **파트너십(Partnership)**: 양쪽이 그때그때 조율해 함께 맞춘다. 잦은 동기화와 지속적 통합이 필요.
- **공유 커널(Shared Kernel)**: 모델 일부를 두 컨텍스트가 같이 소유하고 함께 수정한다.
  - 범위는 최소로(주로 통합 계약과 데이터 구조). 변경 시 관련 컨텍스트 통합 테스트를 모두 돌려야 한다.
  - "중복 비용 > 조율 비용"일 때만 쓴다.

#### 4.2 고객-공급자 관계 (상류 upstream ↔ 하류 downstream)

| 패턴 | 힘의 균형 | 하류의 태도 |
|---|---|---|
| **순응자(Conformist)** | 상류가 강함 | 상류의 모델을 그대로 받아들임 (업계 표준 API일 때 등) |
| **부패방지 계층(ACL, Anticorruption Layer)** | 상류가 강함 | 받아들이지 않고 **내 모델로 번역**하는 계층을 둠 |
| **공개 호스트 서비스(OHS, Open-Host Service)** | 하류(소비자)가 강함 | 상류가 내부 모델과 분리된 **공개 언어(published language)** 를 제공 |

- **ACL을 써야 할 때**: 하류에 핵심 서브도메인이 있을 때, 상류(레거시/외부 API)의 모델이 엉망일 때, 상류 계약이 자주 바뀔 때.
  "엉망에 순응하면 나도 엉망이 된다."
- **OHS**: 내부 구현을 바꿔도 공개 API는 유지하고, 여러 버전을 동시에 제공할 수 있다.

#### 4.3 결별(Separate Ways)
협력 비용이 중복 비용보다 크면 각자 따로 구현한다. 로깅 라이브러리 같은 일반 기능에 적합하고, **핵심 서브도메인에는 피한다.**

#### 4.4 컨텍스트 맵(Context Map)
컨텍스트들과 그 사이 관계(위 패턴)를 그린 지도다. 시스템 전체 그림, 팀 간 소통 상태, 조직 문제(예: 모든 하류가 ACL을 쓰면 상류가 문제)를 보여 준다. 각 팀이 자기 연동 부분을 갱신하도록 공동 관리한다.

> 💡 보충(원서 외): 아래 코드는 원서에 없는 저자의 TS 예시다(Stripe 필드는 예시용).
```ts
// ACL 예: 외부 결제사의 응답 모델을 우리 도메인 모델로 번역
class StripeBillingAdapter implements BillingGateway {
  async charge(cmd: ChargeCommand): Promise<ChargeResult> {
    const res = await this.stripe.paymentIntents.create({ amount: cmd.amount.cents, currency: cmd.amount.currency });
    // 외부 status 문자열을 우리 도메인 용어로 번역
    return res.status === 'succeeded' ? ChargeResult.paid(res.id) : ChargeResult.failed(res.last_payment_error?.message);
  }
}
```

> 🔗 NestJS 연결: 외부 서비스 연동 클래스(Provider)를 도메인 코드와 분리해 두고 인터페이스(토큰)로 주입하면 그대로 ACL이 된다.

**왜 중요한가?** SaaS는 결제사, 이메일, 인증 공급자, 레거시 시스템 등 외부와 연동이 많다. 외부 모델이 내 도메인 코드 속으로 스며드는 것을 막는 방법이 바로 ACL이다.

> 📖 원문: 4장 (Integrating Bounded Contexts)

---

### 5. 단순한 로직 구현: Transaction Script와 Active Record

이제 컨텍스트 **안쪽**을 어떻게 구현할지 본다. 비즈니스 로직 구현 패턴은 네 가지이며, 단순한 것부터 소개한다.

#### 5.1 Transaction Script
- 요청 하나(유스케이스 하나)를 **절차적 함수 하나**로 처리한다.
- 유일한 필수 조건: **트랜잭션적이어야 한다.** 성공하거나 실패하되, 중간 상태로 남아서는 안 된다.
- 지원 서브도메인, ETL, 외부 시스템 연동 어댑터에 적합. 핵심 서브도메인에는 **쓰지 않는다** (로직이 중복되고 진흙덩어리가 된다).

가장 쉽게 틀리는 패턴이라는 점이 중요하다(원서: 실제 장애 상당수가 트랜잭션 처리 오류였다). 흔한 데이터 손상 3가지(코드는 원서의 C# 예시를 TS로 각색):

**① 트랜잭션 없이 여러 쓰기**
```ts
// 나쁨: 두 번째가 실패하면 첫 번째만 반영됨
await db.query('UPDATE users SET last_visit=$1 WHERE id=$2', [at, userId]);
await db.query('INSERT INTO visits_log(user_id, visited_at) VALUES ($1,$2)', [userId, at]);

// 좋음: 하나의 트랜잭션으로 묶기
await db.transaction(async (tx) => {
  await tx.query('UPDATE users SET last_visit=$1 WHERE id=$2', [at, userId]);
  await tx.query('INSERT INTO visits_log(user_id, visited_at) VALUES ($1,$2)', [userId, at]);
});
```

**② DB 쓰기 + 메시지 발행(이중 쓰기)**
DB와 메시지 브로커는 하나의 트랜잭션으로 묶을 수 없다(분산 트랜잭션은 복잡하고 확장이 어려워 보통 피한다). DB 저장 후 발행이 실패하면 다른 시스템은 변경을 모른다. → **Outbox 패턴**(9절)이나 CQRS(8절)로 해결.

**③ 보이지 않는 분산 트랜잭션 (재시도로 인한 중복)**
`UPDATE users SET visits = visits + 1` 같은 단일 쿼리도, 성공했는데 응답이 유실되면 호출자가 재시도해서 **2가 증가**한다.
- 해결: **멱등성(Idempotency)** 확보 (같은 요청을 여러 번 해도 결과가 같게; 원서 예시는 호출자가 방문 횟수 값을 직접 넘겨 그 값으로 설정) 또는 **낙관적 동시성 제어(Optimistic Concurrency Control)** (읽었던 값과 같을 때만 갱신).

```ts
// 기대하는 이전 값이 맞을 때만 갱신 -> 재실행해도 결과가 변하지 않음
await db.query(
  'UPDATE users SET visits = visits + 1 WHERE id = $1 AND visits = $2',
  [userId, expectedVisits],
);
```

#### 5.2 Active Record
- 복잡한 **데이터 구조**(1:N, N:M 관계 등)를 다루지만 로직은 단순할 때 쓴다.
- 데이터 구조 객체(active record)가 스스로 저장/조회(CRUD)를 한다. 필드는 대개 public getter/setter이며, 로직은 그 객체를 다루는 Transaction Script가 담당한다.
- Transaction Script + ORM 편의라고 보면 된다. 지원 서브도메인이나 일반 서브도메인 연동에 적합.
- "빈약한 도메인 모델(anemic domain model)"이라 부르기도 하지만, 로직이 단순하면 문제가 아니다. **단순한 곳에 복잡한 패턴을 쓰는 것이 오히려 해롭다.**

> 🔗 NestJS 연결: TypeORM `@Entity`만 두고 Service가 로직을 다 처리하는 흔한 NestJS 구조가 사실상 Active Record(또는 Transaction Script)다. 단순 CRUD 모듈에는 이걸로 충분하다.

**실용적 조언**: 정합성 100%가 필요 없는 곳(예: 대량 IoT 이벤트 수집)도 있다. 위험과 비용을 따져서 의도적으로 타협하라.

**왜 중요한가?** SaaS 백엔드 코드의 대부분은 사실 이 두 패턴이다. 그래서 트랜잭션, 멱등성, 낙관적 락을 정확히 지키는 것이 데이터 정합성의 기본기다.

> 📖 원문: 5장 (Implementing Simple Business Logic)

---

### 6. 복잡한 로직 구현: Domain Model

로직이 CRUD를 넘어 **복잡한 상태 전이, 규칙, 불변식(invariant, 항상 지켜져야 하는 규칙)** 로 얽혀 있을 때 쓴다. 예를 들어 다음 같은 요구사항이다.

- 티켓에는 우선순위별 응답 제한 시간(SLA)이 있다.
- SLA를 넘기면 고객이 상위 관리자에게 에스컬레이션할 수 있고, 이때 제한 시간이 33% 줄어든다.
- 에스컬레이션된 티켓은 고객이나 관리자만 닫을 수 있다.

이런 규칙을 Active Record + 서비스에 흩뿌리면 로직이 중복되고 하나만 놓쳐도 상태가 망가진다.

**Domain Model 원칙**
- 비즈니스 로직을 **데이터와 함께** 객체에 넣는다. (행동이 있는 객체)
- 객체는 DB, 프레임워크 등 **인프라를 전혀 모르는 순수 객체(POJO/POCO)** 여야 한다.
- 이름과 구조가 유비쿼터스 언어를 따른다.
- 빌딩 블록: **Value Object, Aggregate(엔티티 포함), Domain Event, Domain Service.**

#### 6.1 Value Object (값 객체)
- **값 자체로 식별**되는 객체. ID가 없다. 값이 하나라도 다르면 다른 객체다.
- **불변(immutable)** 이다. 변경 대신 새 인스턴스를 반환한다.
- **원시 타입 집착(Primitive Obsession)** 해소: 이메일·전화번호·금액·국가코드를 모두 `string`/`number`로 다루면 검증이 여기저기 중복되고 실수하기 쉽다.
- 검증과 관련 로직을 한곳에 모으고, 코드가 도메인 언어로 읽힌다.
- **가능하면 항상** 쓰는 것이 좋다. 특히 **금액(Money)** 은 반올림/통화 버그를 막기 위해 꼭 값 객체로 만든다.

> 💡 보충(원서 외): Money 코드는 저자 예시다(원서 예시는 Color, Height, PhoneNumber 값 객체이며, 금액은 값 객체로 만들라고 권고만 한다).
```ts
export class Money {
  private constructor(readonly cents: number, readonly currency: string) {}
  static of(cents: number, currency: string): Money {
    if (!Number.isInteger(cents)) throw new Error('cents must be integer');
    return new Money(cents, currency);
  }
  add(other: Money): Money {
    if (other.currency !== this.currency) throw new Error('currency mismatch');
    return new Money(this.cents + other.cents, this.currency); // 새 객체 반환
  }
  equals(o: Money) { return this.cents === o.cents && this.currency === o.currency; }
}
```

#### 6.2 Entity (엔티티)
- 값이 같아도 **ID로 구분**되는 객체. 시간이 지나며 상태가 변한다. (동명이인은 다른 사람)
- 단독 패턴이 아니라 **Aggregate의 일부**로만 쓴다.

#### 6.3 Aggregate (애그리거트)
가장 중요한 패턴이다. **"함께 일관성을 지켜야 하는 객체 묶음"** 이다.

핵심 규칙:
1. **일관성 경계**: 상태는 Aggregate의 **공개 메서드(명령, command)** 를 통해서만 바뀐다. 외부는 읽기만 한다. 규칙 검증은 그 안에서 전부 한다.
2. **트랜잭션 경계**: **트랜잭션 하나에 Aggregate 인스턴스 하나만** 수정한다. 여러 Aggregate를 한 트랜잭션에서 고쳐야 한다면 경계를 잘못 잡은 신호다.
3. **루트(Aggregate Root)** 가 유일한 진입점이다. 내부 엔티티는 루트를 통해서만 접근한다.
4. **작게 유지**한다. 강한 일관성이 필요한 것만 안에 넣고, 나머지는 **ID로만 참조**한다(다른 Aggregate 객체를 직접 들고 있지 않는다).
   - 판단 기준: "이 데이터가 잠시 오래된 값이어도(결과적 일관성) 규칙이 깨지지 않는가?" → 그렇다면 밖에 둔다.
5. **동시성 제어**: 버전 필드로 낙관적 락을 건다. 두 요청이 동시에 같은 Aggregate를 수정할 때 나중 것이 덮어쓰지 못하게 한다.
6. 상태 변경 결과를 **Domain Event**로 발행한다.

> 💡 보충(원서 외): 아래 Ticket 코드는 원서의 C# 예시를 참고해 저자가 각색한 TS 코드다(원서의 에스컬레이션 조건은 "아직 에스컬레이션 전이고 응답 제한 시간이 소진됨").
```ts
export class Ticket {
  private events: DomainEvent[] = [];
  private constructor(
    readonly id: string,
    private status: 'OPEN' | 'ESCALATED' | 'CLOSED',
    private messages: Message[],
    private version: number,
    private assignedAgentId: string,   // 다른 Aggregate는 ID로만 참조
  ) {}

  escalate(reason: string, now: Date) {
    if (this.status !== 'OPEN') return;           // 불변식 보호
    if (!this.isSlaExpired(now)) throw new Error('SLA not expired yet');
    this.status = 'ESCALATED';
    this.events.push(new TicketEscalated(this.id, reason, now)); // 과거형 이름
  }
  pullEvents() { const e = this.events; this.events = []; return e; }
  // ...
}

// 애플리케이션 서비스 흐름: 로드 -> 명령 실행 -> 저장 -> (이벤트 전달)
async escalate(id: string, reason: string) {
  const ticket = await this.repo.load(id);
  ticket.escalate(reason, new Date());
  await this.repo.save(ticket);   // UPDATE ... WHERE id=? AND version=? (낙관적 락)
}
```

```sql
-- 낙관적 락: 읽었을 때의 버전과 같을 때만 반영
UPDATE tickets SET status = $1, version = version + 1
WHERE id = $2 AND version = $3;   -- 0행이면 동시 수정 충돌 -> 재시도/에러
```

**복잡도가 줄어드는 이유**: 값이 서로 독립적일수록(자유도가 많을수록) 예측이 어렵다. Aggregate와 Value Object는 "이 값이 바뀌면 저 값은 이렇게 바뀐다"는 불변식을 안에 묶어 자유도를 줄인다.

#### 6.4 Domain Event (도메인 이벤트)
- 비즈니스에서 **이미 일어난 의미 있는 일**을 기술하는 메시지. 이름은 **과거형** (`TicketEscalated`, `InvoicePaid`).
- Aggregate의 공개 인터페이스의 일부다. 다른 Aggregate·프로세스·외부 시스템이 구독해 반응한다.
- 이벤트 이름은 도메인에서 일어난 일을 정확히 반영해야 한다.
- 신뢰성 있게 발행하는 방법은 9절(Outbox)에서 다룬다.

```ts
export class TicketEscalated {
  constructor(
    readonly ticketId: string,
    readonly reason: string,
    readonly occurredAt: Date,
  ) {}
}
```

#### 6.5 Domain Service (도메인 서비스)
- 어느 Aggregate·Value Object에도 자연스럽게 속하지 않거나, **여러 Aggregate의 데이터를 읽어 계산**해야 하는 로직을 담는 **상태 없는(stateless)** 객체.
- 예: 티켓 + 부서 정책 + 근무 교대표를 종합해 "응답 마감 시각" 계산.
- **주의**: "여러 Aggregate를 한 트랜잭션에서 수정하는 우회로"가 아니다. 마이크로서비스의 "서비스"와도 무관하다.

> 🔗 NestJS 연결: Domain Model 클래스는 `@Injectable`이나 TypeORM 데코레이터 없이 **순수 TS 클래스**로 둔다. Domain Service는 순수 클래스이거나, 필요하면 `@Injectable()` Provider로 등록한다. 검증은 DTO(Pipe)에서 형식만, 비즈니스 규칙은 Aggregate 안에서 지킨다.

**왜 중요한가?** 구독 상태 전이, 청구, 권한 정책 같은 핵심 규칙이 서비스 곳곳에 복붙되어 있는 것이 SaaS 장애의 흔한 원인이다. Aggregate는 규칙을 한곳에 가둬 "잘못된 상태를 만들 수 없게" 한다.

> 📖 원문: 6장 (Tackling Complex Business Logic)

---

### 7. 이벤트 소싱(Event Sourcing) 개요

#### 7.1 개념
- 일반 방식은 **현재 상태**만 저장한다. → "어떻게 이 상태가 됐는지"는 사라진다.
- 이벤트 소싱은 **상태 변경 이벤트를 모두 순서대로 저장**하고, 이 이벤트 목록이 **진실의 원천(source of truth)** 이다.
- 현재 상태는 이벤트를 처음부터 순서대로 적용(**프로젝션, projection**)해서 복원한다.
- 은행 원장(ledger)과 같은 방식이다. 잔액은 거래 내역을 합산하면 나온다.

> 💡 보충(원서 외): 아래 TS 코드는 원서의 Lead 예시(lead-initialized, followup-set, order-submitted, payment-confirmed 이벤트)를 크게 단순화한 저자 각색이다.
```ts
// 이벤트 저장소 (append-only)
[
  { type: 'LeadInitialized', ... },
  { type: 'FollowupSet', ... },
  { type: 'OrderSubmitted', ... },
  { type: 'PaymentConfirmed', ... },
]

// 상태 복원 = 이벤트를 순서대로 적용
class LeadState {
  status = 'NEW'; followups = 0; version = -1;
  apply(e: LeadEvent) {
    if (e.type === 'FollowupSet') this.followups++;
    if (e.type === 'PaymentConfirmed') this.status = 'CONVERTED';
    this.version++;
  }
}
```

#### 7.2 Event-Sourced Domain Model의 작업 순서
1. Aggregate의 이벤트를 로드
2. 이벤트로 상태 표현을 복원(projection)
3. 명령을 실행해 새 이벤트 생성 (상태 플래그를 직접 바꾸지 않고 이벤트를 만들어 적용)
4. 새 이벤트를 저장소에 커밋 (`expectedVersion`으로 낙관적 락; 버전이 낡았으면 동시성 예외)

같은 이벤트에서 검색용(과거 이름·전화번호 포함), 분석용(후속 연락 횟수) 등 여러 모델을 투영할 수 있고, 버전 N까지만 적용하면 과거 시점 상태가 된다. 이벤트 저장소는 수정·삭제 없이 append-only이며 최소한 '특정 엔티티의 이벤트 조회'와 '추가'를 지원해야 한다.

#### 7.3 장점

| 장점 | 설명 |
|---|---|
| 타임 트래블 | 과거 어느 시점의 상태든 복원, 버그 재현 |
| 깊은 통찰 | 같은 이벤트로 검색용/분석용 등 새로운 모델을 언제든 추가 |
| 감사 로그 | 강한 일관성의 완전한 이력 (금융·법적 요구에 적합) |
| 정교한 동시성 처리 | 충돌 시 "그 사이에 어떤 이벤트가 추가됐나"를 보고 판단 가능 |

#### 7.4 단점

- 학습 곡선이 가파르다 (사고방식 자체가 다르다).
- **이벤트 스키마 변경(버전 관리)** 이 어렵다. 이벤트는 불변이기 때문이다(원서는 이 주제만 다룬 별도 책이 있다고 언급).
- 아키텍처가 복잡해진다 (움직이는 부품이 늘고, 8장에서 보듯 CQRS가 필수).

#### 7.5 자주 나오는 질문
- **성능**: 이벤트가 쌓이면 복원이 느려지지 않나? → 원서 기준으로 성능 저하는 Aggregate당 1만 개 이상일 때부터 체감되고, 대부분 시스템에서 Aggregate 평균 수명은 이벤트 100개를 넘지 않는다. 정말 문제일 때만 **스냅샷(snapshot)** (캐시된 상태 + 그 이후 이벤트만 적용)을 쓰고, 그 전에 Aggregate 경계부터 다시 점검한다. 규모 문제는 Aggregate ID로 이벤트 저장소를 샤딩해 푼다.
- **삭제(GDPR)**: append-only인데 개인정보는? → **forgettable payload**: 민감한 값을 암호화해 이벤트에 넣고, 키는 별도 키 저장소(키=Aggregate ID)에 둔다. 삭제 요청 시 그 키만 지운다.
- **"로그 테이블에 남기면 안 돼?"** → 상태와 로그를 따로 쓰면 하나가 누락될 수 있고, 트리거 히스토리는 "무엇이 바뀌었나"만 있고 "왜"가 없다.

**언제 쓰나?** 돈을 추적하거나, 법적으로 감사 로그가 필요하거나, 행동 분석이 매우 중요한 **핵심** 서브도메인일 때만. 대부분의 SaaS 기능에는 과하다.

**왜 중요한가?** 결제·정산·원장 기능을 설계할 때 "이력이 곧 진실"이라는 선택지를 알고 있으면 감사·환불·정정 요구에 유연하게 대응할 수 있다. 다만 도입 대가도 정확히 알아야 한다.

> 📖 원문: 7장 (Modeling the Dimension of Time)

---

### 8. 아키텍처 패턴: Layered, Ports & Adapters, CQRS

비즈니스 로직만 있는 게 아니다. UI/API, DB, 외부 시스템과 어떻게 엮을지 정해야 로직이 여기저기 새지 않는다.

#### 8.1 계층형 아키텍처(Layered Architecture)

```
Presentation(API/이벤트 구독) -> Business Logic -> Data Access(DB, 외부 API, 메시지 버스)
```
- 각 계층은 **바로 아래 계층에만** 의존한다.
- **서비스 계층(Service/Application Layer)** 을 추가하기도 한다: 요청을 받아 트랜잭션·순서 조율만 담당하는 얇은 계층. (물리적 서비스가 아니라 논리적 경계다.)
- **Transaction Script**나 **Active Record**와 궁합이 좋다.
- 단점: 비즈니스 로직이 데이터 접근 계층에 의존하기 때문에, 인프라를 모르는 순수 Domain Model을 만들기 어렵다.
- 참고: 레이어(논리적 구분, 함께 배포)와 티어(물리적 분리, 독립 배포)는 다른 개념이다.

#### 8.2 Ports & Adapters (헥사고날 / 클린 / 어니언)
- 의존성 방향을 **뒤집는다(DIP, 의존성 역전 원칙)**. 비즈니스 로직이 중심에 있고 인프라에 의존하지 않는다.
- 도메인이 **Port(인터페이스)** 를 정의하고, 인프라가 **Adapter(구현체)** 를 제공한다. 실제 연결은 DI로 한다.
- **Domain Model / Event-sourced Domain Model**에 적합하다.

> 💡 보충(원서 외): 아래 Port/Adapter·NestJS 코드는 저자 예시다(원서 예시는 IMessaging 포트와 SQSBus 어댑터).
```ts
// domain(또는 application) 쪽: Port
export interface TicketRepository {
  load(id: string): Promise<Ticket>;
  save(t: Ticket): Promise<void>;
}
export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');

// infrastructure 쪽: Adapter
@Injectable()
export class TypeOrmTicketRepository implements TicketRepository { /* ... */ }

// module: 포트에 어댑터를 연결
@Module({
  providers: [{ provide: TICKET_REPOSITORY, useClass: TypeOrmTicketRepository }],
})
export class TicketModule {}
```

> 🔗 NestJS 연결: NestJS의 DI 컨테이너와 커스텀 Provider 토큰(`provide: TOKEN, useClass`)이 Ports & Adapters를 구현하기 좋은 도구다. 테스트에서는 어댑터를 in-memory 구현으로 교체하면 된다.

#### 8.3 CQRS (Command-Query Responsibility Segregation)
- **쓰기 모델(command model)** 과 **읽기 모델(read model)** 을 분리한다.
  - 쓰기 모델: 비즈니스 규칙과 불변식을 지키는 **유일한 강한 일관성의 원천**.
  - 읽기 모델(프로젝션): 조회에 최적화된 사본. 읽기 전용이며 **언제든 지우고 원본에서 재생성**할 수 있어야 한다. (DB의 materialized view와 비슷)
- 이유: 조회 요구(검색, 리포트, 대시보드)가 쓰기 모델 하나로 감당이 안 될 때, 여러 DB(관계형 + 검색엔진 + 캐시)를 함께 쓸 때(polyglot persistence), 이벤트 소싱에서 필수.
- 프로젝션 방식
  - **동기(catch-up subscription)**: 체크포인트 이후 변경분을 주기적으로 읽어 갱신. 재생성이 쉽다(체크포인트를 0으로).
  - **비동기(메시지 버스)**: 빠르지만 **순서 뒤바뀜/중복** 문제가 생길 수 있다.
  - 권장: 동기 방식을 기본으로 하고 필요하면 비동기를 덧붙인다.
- 흔한 오해: "Command는 아무것도 반환하면 안 된다"는 틀렸다. 성공/실패와 필요한 데이터를 **강한 일관성 모델에서** 돌려주는 것이 좋다.

> 💡 보충(원서 외): 아래는 `@nestjs/cqrs` 스케치로 원서에 없다.
```ts
// 쓰기: 규칙 실행 (강한 일관성)
@CommandHandler(EscalateTicketCommand)
class EscalateTicketHandler { /* Ticket.escalate() 호출 후 저장 */ }

// 읽기: 조회에 최적화된 별도 모델(예: 요약 테이블, 검색 인덱스)
@QueryHandler(GetTicketSummaryQuery)
class GetTicketSummaryHandler { /* 읽기 전용 테이블/뷰에서 바로 조회 */ }
```

> 🔗 NestJS 연결: `@nestjs/cqrs`의 `CommandBus / QueryBus / EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`가 이 패턴의 도구다. 다만 라이브러리를 쓴다고 곧 CQRS는 아니다. 쓰기/읽기 **모델이 실제로 분리**될 때 가치가 있다.

#### 8.4 적용 범위
이 패턴들은 시스템 전체에 하나만 쓰는 게 아니다. 한 바운디드 컨텍스트 안에서도 **서브도메인(모듈)마다** 다르게 선택한다. (지원 모듈은 계층형, 핵심 모듈은 Ports & Adapters + Domain Model.) 세로로 모듈 경계를 나누면 모놀리스도 **모듈러 모놀리스**가 되어 진흙덩어리를 피할 수 있다.

**왜 중요한가?** "Controller-Service-Repository만 쓰면 되지"에서 한 걸음 나아가, 핵심 도메인 코드를 프레임워크와 DB 변화로부터 보호하는 방법을 알 수 있다.

> 📖 원문: 8장 (Architectural Patterns)

---

### 9. 통신 패턴: Outbox, Saga, Process Manager

#### 9.1 모델 번역(Model Translation)
4절의 ACL/OHS를 구현하는 방법.
- **무상태(stateless)** 번역: 요청/메시지를 가로채 모델만 변환(프록시). 동기는 코드 안이나 API Gateway에서, 비동기는 메시지 프록시에서 처리한다.
- **상태 있는(stateful)** 번역: 여러 요청을 모아 배치 처리하거나 여러 출처 데이터를 합칠 때. 별도 저장소가 필요하다(BFF도 여기에 속함).
- 도메인 이벤트를 그대로 외부에 내보내지 말고 **공개 이벤트(published language)** 로 변환한다. 내부 구현이 노출되기 때문이다.

#### 9.2 Outbox 패턴: 이벤트를 유실 없이 발행하기
이벤트 발행 방식의 잘못된 예:
- Aggregate 안에서 바로 메시지 발행 → DB 커밋 전에 발행되거나, 롤백돼도 이벤트는 나가 버림.
- DB 커밋 후에 발행 → 그 사이 서버가 죽거나 브로커가 다운되면 **이벤트가 영영 유실**.

**Outbox 절차**
1. Aggregate 상태 변경과 **발행할 이벤트를 같은 DB 트랜잭션으로 저장** (outbox 테이블).
2. 릴레이(relay)가 outbox에서 미발행 이벤트를 읽는다. (pull: 폴링 퍼블리셔, 인덱스 필요 / push: 트랜잭션 로그 tailing, 예: DynamoDB Streams)
3. 브로커에 발행한다.
4. 발행 성공 후 발행 완료로 표시(또는 삭제).

- 보장 수준: **최소 한 번(at-least-once)**. 릴레이가 발행 후 표시 전에 죽으면 중복 발행되므로 **소비자는 멱등하게 처리**해야 한다.
- NoSQL(다중 문서 트랜잭션 없음)이면 Aggregate 문서 안에 outbox 배열을 넣는다.

> 💡 보충(원서 외): 아래 Outbox 코드는 저자의 TS 예시다.
```ts
await db.transaction(async (tx) => {
  await tx.save(ticket);                                   // 상태
  await tx.insert('outbox', ticket.pullEvents().map(e => ({  // 이벤트
    id: randomUUID(), type: e.constructor.name, payload: JSON.stringify(e), publishedAt: null,
  })));
});
// 별도 워커: SELECT ... WHERE published_at IS NULL -> 브로커 발행 -> published_at 갱신
```

#### 9.3 Saga
- Aggregate 규칙상 한 트랜잭션에 하나만 수정할 수 있으니, **여러 Aggregate/컨텍스트에 걸친 업무 흐름**은 이벤트로 이어 붙인다.
- Saga는 이벤트를 구독하고 **다음 명령을 발행**한다. 실패 시 **보상 행위(compensating action)** 로 되돌린다.
- 예: 캠페인 활성화 → 게시 요청 → (확정이면 게시됨 표시 / 거절이면 캠페인을 거절 상태로 보상)
- 각 단계는 **결과적 일관성**이다. Saga를 "잘못 그은 Aggregate 경계를 땜질하는 용도"로 남용하지 말 것. 강한 일관성이 필요한 작업은 같은 Aggregate여야 한다.

#### 9.4 Process Manager
- 단순한 "이벤트 → 명령" 매핑인 Saga와 달리, **비즈니스 로직에 따라 다음 단계를 결정**하는 중앙 조율자.
- 구분법: **if-else로 분기가 생기면** Process Manager다. 또 Saga는 특정 이벤트로 암묵적으로 시작하지만, Process Manager는 **명시적으로 시작**하고 자기 ID와 상태를 가진다.
- 예: 출장 예약(항공권 경로 계산 → 직원 승인 → 거절 시 재경로 → 항공권 예약 → 호텔 예약 → 호텔 없으면 항공권 취소).
- 명령 실행은 Outbox처럼 별도 릴레이가 하게 해서 프로세스 도중 죽어도 안전하게 한다.

> 🔗 NestJS 연결: `@nestjs/cqrs`의 `@Saga()` 데코레이터는 이벤트 스트림(RxJS)을 받아 명령을 내보내는 방식으로 위 Saga를 구현한다. Outbox 릴레이는 `@nestjs/schedule`이나 BullMQ 워커로 구현하는 경우가 많다.

**왜 중요한가?** "결제는 성공했는데 알림/권한 부여 이벤트가 유실됨" 같은 SaaS의 전형적 사고를 막는 핵심 패턴이다. 주문·구독·결제 흐름에서 거의 반드시 만난다.

> 📖 원문: 9장 (Communication Patterns)

---

### 10. 설계 휴리스틱: 무엇을 언제 쓸까

DDD 도구를 전부 쓰라는 게 아니다. **서브도메인 유형 → 구현 패턴 → 아키텍처 → 테스트 전략** 순으로 정한다.

#### 10.1 바운디드 컨텍스트 경계
- 크기가 아니라 모델이 기준. **처음에는 넓게** 잡고, 도메인 지식이 쌓이면 나눈다. (논리적 경계 수정이 물리적 경계 수정보다 훨씬 싸다.)
- 하나의 변경이 여러 컨텍스트를 동시에 건드린다면 경계를 잘못 잡은 신호다.

#### 10.2 비즈니스 로직 패턴 선택 (위에서 아래로 질문)

| 질문 | 예이면 |
|---|---|
| 돈/금융 거래를 추적하거나, 감사 로그·깊은 분석이 필요한가? | **Event-sourced Domain Model** |
| 비즈니스 로직이 복잡한가 (규칙·불변식·알고리즘)? | **Domain Model** |
| 데이터 구조가 복잡한가? | **Active Record** |
| 그 외 | **Transaction Script** |

#### 10.3 아키텍처와 테스트

| 로직 패턴 | 아키텍처 | 테스트 전략 |
|---|---|---|
| Transaction Script | 최소 3계층 | 역피라미드 (E2E 비중 큼) |
| Active Record | 계층형 + 서비스 계층 | 다이아몬드 (통합 테스트 비중 큼) |
| Domain Model | Ports & Adapters | 피라미드 (단위 테스트 비중 큼) |
| Event-sourced | Ports & Adapters + CQRS | 피라미드 |

- CQRS는 어떤 패턴이든 **여러 저장 모델이 필요할 때** 추가한다.
- 핵심 서브도메인에 단순 패턴만 필요해진다면 "정말 핵심인가?" 가정을 재검토할 기회다.
- 이는 어디까지나 경험칙이다. 팀이 한 방식에 익숙하면 그렇게 통일하는 것도 합리적일 수 있다. 원칙은 **단순한 도구부터, 꼭 필요할 때만 고급 패턴**이다.

> 📖 원문: 10장 (Design Heuristics)

---

### 11. 마이크로서비스와 DDD 경계

- **마이크로서비스 = 바운디드 컨텍스트**이지만, **모든 바운디드 컨텍스트가 마이크로서비스는 아니다.**
  - 바운디드 컨텍스트: 유효한 **가장 넓은** 경계 (여기까지는 모놀리스도 OK).
  - 마이크로서비스: 유효한 **가장 좁은** 경계.
  - 너무 넓으면 진흙덩어리(Big Ball of Mud), 너무 좁으면 **분산 진흙덩어리(Distributed Big Ball of Mud)**.
- 좋은 서비스는 **깊은 모듈(deep module)**: 인터페이스는 단순하고 내부 구현은 풍부하다. 함수 하나만 감싼 서비스는 얕아서 시스템 복잡도만 키운다.
- 경계를 정하는 기준
  - **Aggregate**: 가장 좁은 경계. Aggregate 하나를 서비스로 만들면 대체로 너무 잘게 쪼개진다.
  - **서브도메인**: 응집된 유스케이스 묶음이라 **안전한 기준**. 대부분의 경우 여기에 맞추면 된다.
  - **바운디드 컨텍스트**: 넓은 경계로 남겨 두는 것이 더 나을 때도 많다.
- OHS(공개 언어)와 ACL로 서비스 인터페이스를 줄이면 서비스가 더 "깊어진다".

> 🔗 NestJS 연결: 처음에는 **모듈러 모놀리스**(NestJS Module로 경계 분리)로 시작해 논리적 경계를 검증한 뒤, 필요할 때 마이크로서비스(NestJS Microservices)로 분리하는 것이 안전하다.

**왜 중요한가?** "처음부터 서비스 20개"로 시작해 배포·통신·정합성 비용에 짓눌리는 실패를 피하는 기준이 된다.

> 📖 원문: 14장 (Microservices)

---

### 12. 이벤트 기반 아키텍처(EDA)와 이벤트의 종류

#### 12.1 개념 정리
- **EDA**: 컴포넌트끼리 **비동기 이벤트 메시지**로 통신하는 방식. **이벤트 소싱과는 다르다.** (EDA는 서비스 *사이*의 통신, 이벤트 소싱은 서비스 *안*의 저장 방식.)
- **이벤트**: 이미 일어난 일. 거부할 수 없고 되돌리려면 보상 명령을 낸다. 이름은 과거형.
- **명령(Command)**: 해야 할 일. 대상이 거부할 수 있다.
- 이벤트는 메타데이터(type, event-id, correlation-id, timestamp)와 payload로 구성한다.

#### 12.2 이벤트 3종류

| 종류 | 내용 | 언제 쓰나 |
|---|---|---|
| **이벤트 알림(Event Notification)** | "무슨 일이 있었다" + 상세 조회 링크(ID) 정도만 | 최신 상태를 다시 조회해야 할 때, 민감 정보를 메시지에 싣기 싫을 때 |
| **상태 이전 이벤트(Event-Carried State Transfer, ECST)** | 변경된 상태 전체(또는 변경 필드) 포함 | 소비자가 로컬 사본을 유지하고, 결과적 일관성을 받아들일 때 (생산자 장애에도 동작) |
| **도메인 이벤트(Domain Event)** | 비즈니스 사건을 그대로 모델링 (`married`) | 주로 컨텍스트 **내부** 모델링용. 외부 공개는 신중히 |

#### 12.3 분산 진흙덩어리를 만드는 결합 3가지
내부 도메인 이벤트를 그대로 여러 팀이 구독하면 생기는 문제:
- **시간적 결합(Temporal)**: 처리 순서에 의존(예: "5분 지연시켜서 순서를 맞추자" → 언제든 깨짐).
- **기능적 결합(Functional)**: 여러 소비자가 같은 프로젝션 로직을 중복 구현 → 함께 바뀌어야 함.
- **구현 결합(Implementation)**: 생산자가 이벤트를 추가/변경하면 모든 소비자가 영향을 받음.

**해결**: 공개 전용 이벤트(ECST 등 소비자용 모델)를 따로 정의하고, 순서 의존은 이벤트 알림으로 풀어 준다.

#### 12.4 이벤트 기반 설계 휴리스틱
1. **최악을 가정하라**: 네트워크는 느리고, 서버는 죽고, 이벤트는 **순서가 바뀌고 중복된다.** → Outbox로 발행하고, 소비자는 **중복 제거(idempotent consumer)** 와 순서 처리를 하며, 보상이 필요하면 Saga/Process Manager.
2. **공개 이벤트와 비공개 이벤트를 구분하라**: 내부 도메인 이벤트를 그대로 노출하지 말고 공개 언어로 번역한다.
3. **일관성 요구로 종류를 고르라**: 결과적 일관성으로 충분하면 ECST, 마지막 쓰기를 반드시 읽어야 하면 이벤트 알림 후 조회.

> 💡 보충(원서 외): 아래 멱등 소비자 코드는 저자 예시다(원서는 "구독자가 중복 제거·순서 복원을 할 수 있게 발행하라"까지만 언급).
```ts
// 소비자 쪽 멱등 처리: 이미 처리한 event-id는 무시
async handle(evt: { eventId: string; /* ... */ }) {
  const inserted = await this.db.query(
    'INSERT INTO processed_events(id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [evt.eventId]);
  if (inserted.rowCount === 0) return; // 중복
  await this.doWork(evt);              // (같은 트랜잭션에서 수행하는 것이 안전)
}
```

> 🔗 NestJS 연결: `@nestjs/microservices`의 이벤트 패턴(`@EventPattern`)과 BullMQ/Kafka/RabbitMQ 소비자는 기본적으로 중복 전달이 가능하다고 보고 설계해야 한다.

**왜 중요한가?** 웹훅, 큐, 알림처럼 이벤트가 SaaS 곳곳을 오간다. "이벤트를 쓰면 느슨하게 결합된다"는 착각 없이, 종류를 고르고 안전하게 다루는 기준을 준다.

> 📖 원문: 15장 (Event-Driven Architecture)

---

### ✅ 이 부 핵심 체크리스트

- [ ] 서비스의 서브도메인을 핵심/일반/지원으로 나누고, 일반 기능(인증, 결제, 메일)은 사서 쓰고 있다.
- [ ] 코드의 클래스·메서드 이름이 기획자·도메인 전문가가 쓰는 말과 같다 (유비쿼터스 언어).
- [ ] 같은 단어가 다른 뜻으로 쓰이는 곳은 바운디드 컨텍스트(NestJS 모듈)로 나눴고, 모듈 간에는 공개 인터페이스/이벤트로만 통신한다.
- [ ] 외부 API/레거시 연동은 ACL(어댑터)로 감싸 외부 모델이 도메인 속에 새지 않게 한다.
- [ ] 단순 CRUD에는 Transaction Script/Active Record를 쓰되, 다중 쓰기는 트랜잭션으로 묶고 재시도에 안전(멱등/낙관적 락)하게 만든다.
- [ ] 복잡한 규칙이 있는 핵심 영역은 Aggregate로 캡슐화하고, **한 트랜잭션에 Aggregate 하나만** 수정하며, 다른 Aggregate는 ID로만 참조한다.
- [ ] 금액·이메일 같은 개념은 Value Object(불변)로 만들어 원시 타입 집착을 피한다.
- [ ] 이벤트 소싱은 돈·감사·분석이 핵심일 때만 고려하고, 스키마 변경과 CQRS 복잡도라는 대가를 알고 선택한다.
- [ ] DB 저장과 이벤트 발행은 Outbox로 묶고, 소비자는 중복·순서 뒤바뀜을 견디게(멱등) 만든다.
- [ ] 여러 Aggregate/서비스에 걸친 흐름은 Saga/Process Manager와 보상 행위로 설계한다.
- [ ] 패턴은 서브도메인별로 고른다 (단순한 곳은 단순하게). 처음엔 모듈러 모놀리스로 시작하고, 마이크로서비스는 서브도메인 경계에 맞춰 필요할 때 분리한다.
