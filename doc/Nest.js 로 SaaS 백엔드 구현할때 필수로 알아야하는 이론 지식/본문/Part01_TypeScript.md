---
title: "Part 1. TypeScript 타입 시스템 (NestJS의 언어)"
parent: "NestJS SaaS 백엔드 필수 이론"
nav_order: 1
---

# Part 1. TypeScript 타입 시스템 (NestJS의 언어) (출처: Effective TypeScript)

> **🎮 게임 서버 개발자에게** — TypeScript의 타입 검사는 C++ 컴파일러의 타입 검사와 같은 "컴파일 타임 안전망"이지만, 결정적으로 **컴파일 후 타입이 전부 지워진다.** C++에는 다형 클래스의 vtable·RTTI(`dynamic_cast`, `typeid`)가 남고 템플릿은 타입마다 코드가 실제로 만들어지지만, TS의 `interface`·`type`·제네릭은 실행 파일(JS)에 흔적이 없다. 또 C++처럼 "이름"이 아니라 "모양(구조)"으로 타입을 비교한다. 그래서 "타입을 선언했으니 들어온 데이터도 그 모양"이라는 C++식 직관(구조체에 캐스팅하면 레이아웃이 강제됨)이 여기서는 통하지 않는다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 요청 바디 DTO를 `interface`로 선언했더니 숫자 필드에 문자열이 들어와 DB까지 저장됐다.
> - `loadUser(userId, tenantId)`처럼 둘 다 `string`인 ID의 인자 순서를 바꿔 넣어 **다른 테넌트의 데이터**를 조회했는데 컴파일은 통과했다.
> - 구독 상태에 `'past_due'`를 추가했는데 상태별 처리 코드 한 곳이 빠져서 장애가 났다.

## 코어 — 이것만은 100%

> **한 문장:** TypeScript의 타입은 컴파일 후 사라지는 "값의 집합"에 대한 정적 약속이므로, `strict`로 검사 구멍을 막고 판별 유니온·리터럴 유니온·브랜드로 불가능한 상태를 아예 표현할 수 없게 만들되, 외부 입력은 `unknown`으로 받아 경계에서 한 번 런타임 검증(NestJS: DTO 클래스 + `ValidationPipe`)해야 한다.

1. **타입은 컴파일 후 사라진다** — `as`는 변환이 아니고, 인터페이스는 `instanceof`도 DI 토큰도 될 수 없다. 런타임에 남는 것은 `in`, 꼬리표 값, `class`뿐이며, "타입이 맞다"가 "런타임에도 맞다"를 보장하지 않는다(건전성 함정).
2. **검사 스위치는 켜고, 끄는 장치는 좁게** — 새 프로젝트는 처음부터 `"strict": true`. `any`, `as`, `!`, 사용자 정의 타입 가드(`is`)는 컴파일러가 검증하지 않는 약속이므로 범위를 좁히고, 검증 함수 안에 숨기고, 모르는 값은 `unknown`으로 받는다.
3. **타입 = 값의 집합, 비교는 구조(모양)로** — "대입 가능 = 부분집합", 타입은 열려 있다. 잉여 속성 검사는 별도 장치이고, `type`/`interface`/`readonly`/유틸리티 타입은 이 집합을 다루는 도구다. 이름이 아닌 모양으로 비교하므로 `userId`/`tenantId`가 섞인다 → 브랜드 타입으로 막는다.
4. **유효한 상태만 표현한다** — 독립된 boolean/optional 필드 대신 판별 유니온, `string` 대신 리터럴 유니온, 특수 값(`-1`) 대신 `| null`, `null`은 경계로 밀어낸다. 누락은 `never` 완전성 검사와 `Record<Union, V>`로 컴파일 단계에서 잡는다.
5. **경계에서 한 번 검증하고, NestJS가 기대는 런타임 장치를 안다** — 외부 입력은 `unknown` → 경계에서 한 번 검증(단일 진실 원천) → 안쪽은 타입을 신뢰. NestJS는 책이 피하라는 데코레이터(`experimentalDecorators` + `emitDecoratorMetadata`)와 파라미터 프로퍼티, 런타임에 존재하는 `class`를 DI의 전제로 삼고, 컨트롤러/서비스는 `async`로 `Promise<T>`를 반환한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| RTTI (`dynamic_cast`, `typeid`), vtable | 타입 소멸 (→ 코어 1) | 둘 다 컴파일 타임에 정적 타입으로 오류를 잡는다 | C++ 다형 클래스는 런타임에 타입 정보가 남지만, TS의 `interface`/`type`은 JS 출력에 **아무것도 남지 않는다.** `x instanceof SomeInterface`는 불가. 런타임에 남는 것은 `class`(JS 생성자 함수), `in`, 꼬리표 값뿐 |
| `static_cast<int>(d)`, `reinterpret_cast` | 타입 단언 `as` (→ 코어 2) | "컴파일러야, 이 타입이라고 믿어라" | `static_cast`는 실제 변환 코드를 만들지만 `val as number`는 **코드를 하나도 만들지 않는다.** 문자열은 문자열 그대로다. 진짜 변환은 `Number(val)` |
| 명목적 타이핑(클래스 이름이 다르면 다른 타입, `is-a`는 상속으로만) / strong typedef | 구조적 타이핑 + 브랜드 타입 (→ 코어 3) | `typedef std::string UserId;`가 `std::string`과 구분되지 않듯, TS 타입 별칭도 구분되지 않는다. 브랜드는 strong typedef(래퍼 타입)와 같은 발상 | C++은 이름이 다른 두 `struct`가 멤버가 같아도 호환되지 않지만, TS는 **모양만 같으면 클래스끼리도 호환**된다. 생성자 검증을 거쳤다는 보장도 없다. 브랜드는 런타임 래퍼 없이 타입에만 존재(zero cost) |
| 템플릿 (`template<typename T>`), type traits | 제네릭, 유틸리티 타입 `Pick`/`Partial`/`ReturnType` (→ 코어 3) | 타입을 매개변수로 받아 재사용하고, 타입에서 타입을 계산한다 | C++ 템플릿은 타입마다 코드를 **인스턴스화(코드 생성)** 하고 특수화로 동작을 바꿀 수 있다. TS 제네릭은 검사만 하고 지워져 JS 코드는 한 벌이며, 런타임에 `T`를 알 수 없다(그래서 `function f<T>(): T`는 단언과 같다) |
| `std::variant` + `std::visit`, enum 태그 + `union` 패킷 | 판별 유니온 + `never` 완전성 검사 (→ 코어 4) | 태그로 상태를 구분하고 상태별 필드를 묶는다 | `std::visit`은 처리하지 않은 대안이 있으면 컴파일 오류, `switch(enum)`은 `-Wswitch` 경고 수준이다. TS는 `assertUnreachable(x: never)` 패턴을 직접 써야 누락이 오류가 된다. 태그는 정수가 아니라 `'active'` 같은 문자열 리터럴 값이고, 메모리 공유(union) 개념은 없다 |
| 패킷 수신 시 길이·범위 검사 후 구조체로 해석 | 경계 검증 (`unknown` → Zod/`ValidationPipe`) (→ 코어 5) | 외부 바이트/데이터는 믿지 않고 **입구에서 한 번** 검증한 뒤 안쪽은 신뢰한다 | C++은 구조체 캐스트로 최소한 메모리 레이아웃은 강제되지만, JSON은 어떤 모양이든 올 수 있고 `body as CreateUserDto`는 **검증 0**이다. 필드 누락·타입 불일치·여분 필드(Mass Assignment)를 모두 런타임 코드로 막아야 한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. NestJS의 DTO를 `interface`로 선언하면 왜 요청 바디를 검증할 수 없을까?
> 2. `userId`와 `tenantId`(둘 다 `string`)의 인자 순서를 바꿔 넣어도 컴파일이 통과한다. TypeScript의 어떤 성질 때문이고, 어떻게 막을 수 있을까?
> 3. `isLoading`, `error?`, `data?` 세 필드로 요청 상태를 표현하면 무엇이 문제일까?
> 4. `any`와 `unknown`은 둘 다 "아무 값이나" 받는데, 무엇이 다를까?
> 5. C++의 `static_cast<int>(x)`와 TS의 `x as number`는 무엇이 다를까?
>
> **처리법:** 🛠 실습 `tsconfig.json`에 `"strict": true` 켜기, 같은 객체를 `: Person`(선언)과 `as Person`(단언)으로 써서 오류 차이 보기, 판별 유니온 + `assertUnreachable(x: never)` 완전성 검사, Zod 스키마에서 `z.infer`로 타입 파생 → 읽자마자 직접 실행 · 🗺 관계도 외부 입력(`unknown`) → 경계에서 검증(Zod, `ValidationPipe`) → 정확한 타입 → 안쪽은 신뢰 / 판별 유니온 ↔ 좁히기 ↔ `never` 완전성 검사 ↔ `Record` 매핑 · 📦 카드로 `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `noEmitOnError`, `experimentalDecorators`, `emitDecoratorMetadata`, 유틸리티 타입(`Pick`, `Partial`, `Readonly`, `ReturnType`), 원서 Item 번호
>
> **🔗 유추 주의:** 구조적 타이핑 ≈ JS의 "오리처럼 걸으면 오리" — 모양으로 판단한다는 점은 맞지만, 객체 리터럴의 잉여 속성 검사와 브랜드 타입(명목적 흉내)에서 깨진다 / 타입 ≈ 값의 집합 — "대입 가능 = 부분집합"은 맞지만 값이 가변이면 흔들린다. **스킵 읽기 (5~15분):** 소제목·표·굵은 글씨만 먼저 훑고 정독하세요.

---

NestJS는 TypeScript로 만든 프레임워크다. DTO, Entity, Provider, Guard 모두 "타입"이 뼈대다.
이 부에서는 타입 문법 자체보다 **"타입이 무엇을 보장하고 무엇을 보장하지 않는가"** 를 정리한다.
이 경계를 알아야 SaaS 백엔드에서 "타입은 맞는데 런타임에 터지는" 사고를 막을 수 있다.

> 💡 보충(원서 외): 각 절의 **"SaaS 관점"** 과 **"🔗 NestJS 연결"** 문단, 그리고 `Subscription`/`PLAN_LIMITS`/`UserRepo`/`Brand<UserId>`/Zod 스키마처럼 SaaS 도메인으로 바꿔 쓴 예시 코드는 원서(Effective TypeScript)에 없는 이 문서의 적용·보충이다. 원서 내용은 `📖 원문` 표기가 붙은 개념·규칙이다.

---

## 코어 1. 타입은 컴파일 후 사라진다

> 이 코어 하나로 `as`가 변환이 아닌 이유, `instanceof 인터페이스`가 안 되는 이유, DTO가 `class`인 이유, `ValidationPipe`/Zod가 필요한 이유, 인터페이스를 DI 토큰으로 못 쓰는 이유(5.2절), `private`이 런타임에 보이는 이유(5.2절)가 모두 설명된다.

### 1.1 JavaScript 위에 얹은 타입 층

**한 줄 요약:** TS는 JS의 상위집합이고, 타입 검사를 통과해도 런타임에 터질 수 있으며, 타입 오류가 있어도 JS는 그대로 출력된다.

- TypeScript는 JavaScript의 **상위집합(Superset)** 이다. 모든 JS 프로그램은 문법상 유효한 TS 프로그램이다. (반대는 아님: 타입 표기 같은 TS 문법은 JS가 아니다.)
- 다만 "타입 검사를 통과하는 프로그램"은 그중 일부일 뿐이다. 실무에서 TS를 쓴다는 것은 이 **검사를 통과하는 코드를 유지한다**는 뜻이다.
- 타입 시스템의 기준은 **"JS가 런타임에 실제로 하는 일을 모델링"** 하는 것이다. 예를 들어 `'2' + 3`은 JS에서 문자열 `"23"`이 되므로 TS도 허용한다.
- 그러면서도 "합법이지만 의심스러운 코드"는 막는다. `null + 7`, `[] + 12`, 인자 개수가 틀린 함수 호출은 JS에선 예외 없이 돌지만 TS는 오류로 표시한다.
- **타입 검사를 통과해도 런타임에 터질 수 있다.** TS는 의도적으로 완전히 "건전(sound)"하지 않다. (대표 지점은 1.3절)
  ```ts
  const names = ['Alice', 'Bob'];
  names[2].toUpperCase();   // 타입 오류 없음 → 실행하면 TypeError
  ```
  원인은 정적 타입(컴파일러가 아는 타입)과 실제 런타임 타입이 어긋나는 것이다. `any`를 쓸 때도 자주 발생한다.
- 타입 표기는 컴파일러에게 **의도를 알려 주는 것**이다. 정보를 줄수록 더 많은 오류(예: `capitol` 오타)를 잡아 준다.

- 타입 오류가 있어도 TS는 JS 코드를 **그대로 만들어 낸다.** 오류는 C/Java의 컴파일 실패가 아니라 "경고"에 가깝다. 그래서 커밋 시점에 오류 0개를 유지하는 습관이 필요하고, 출력을 막고 싶으면 `noEmitOnError` 옵션을 쓴다. (Item 3)

**SaaS 관점**: "TS로 짰으니 안전하다"가 아니라 "TS가 잡아 주는 범위와 못 잡는 범위를 안다"가 출발점이다. (보충) 타입 검사는 CI에서 통과를 강제해야 의미가 있다.

> 📖 원문: Ch.1 Item 1, Item 3 (일부)

### 1.2 타입은 런타임에 사라진다 (가장 중요한 사실)

**한 줄 요약:** `interface`·`type`·타입 표기는 컴파일 후 전부 지워지므로, 런타임 구분은 런타임에 남는 것(`in`, 꼬리표 값, `class`)으로 해야 한다.

컴파일하면 `interface`, `type`, 타입 표기는 **전부 지워진다.** 그래서 다음이 불가능하다.

| 하고 싶은 것 | 결과 |
|---|---|
| `x instanceof SomeInterface` | 오류 (인터페이스는 값이 아님) |
| `value as number`로 문자열을 숫자로 변환 | 변환 안 됨. 단지 "숫자라고 믿겠다"는 선언 |
| 타입만 다른 같은 이름 함수 오버로딩 구현 | 불가. 구현은 하나뿐 |
| 타입으로 런타임 성능 최적화 | 없음. 타입은 성능 비용도 없음(zero cost) |

```ts
function asNumber(val: number | string): number {
  return val as number;   // 컴파일러만 속이는 것. 실제 변환 없음
}
function asNumberOk(val: number | string): number {
  return Number(val);     // 진짜 변환은 JS 문법으로 해야 함
}
```

런타임에 타입을 구분하고 싶으면 **런타임에도 남는 것**을 써야 한다.
- 값의 존재 확인: `'height' in shape`
- **꼬리표(tag) 프로퍼티**: `shape.kind === 'rectangle'` (판별 유니온, 4.2·4.3절에서 자세히)
- `class`: 타입과 값(생성자)을 **둘 다** 만들기 때문에 `instanceof`가 가능

**SaaS 관점**: HTTP 요청 바디는 밖에서 들어오는 "그냥 JSON"이다. 컴파일된 코드는 `CreateUserDto`가 뭔지 모른다.
"타입을 선언했으니 안전하다"는 착각이 잘못된 데이터가 DB까지 가는 사고의 시작이다. (5.1절에서 해결책 정리)

> 🔗 NestJS 연결: `ValidationPipe`가 존재하는 이유가 바로 이것이다. 타입이 지워지므로, 클래스(값으로 남는 것) + 데코레이터 메타데이터로 런타임 검증을 한다.

> 📖 원문: Ch.1 Item 3

### 1.3 건전성(Soundness) 함정: TypeScript가 거짓말하는 곳

**한 줄 요약:** 정적 타입과 런타임 값이 어긋나는 대표 지점을 알고, 경계(입출력)에서 확인한 뒤 안쪽에서는 타입을 신뢰한다.

TypeScript는 의도적으로 "완전히 안전하지는" 않다. 정적 타입과 런타임 값이 어긋날 수 있는 대표 지점을 알아두자.

| 함정 | 예 | 대응 |
|---|---|---|
| `any` | `const n: any = 'x'; f(n)` | `unknown`, 범위 제한 |
| 타입 단언 (`as`, 타입 가드 `is`) | `hour as number` | 조건문으로 좁히기 |
| 배열/객체 인덱싱 | `xs[3]`이 `number`로 추론되지만 실제는 `undefined` | `noUncheckedIndexedAccess`, 값 타입에 `\| undefined` 추가 |
| 부정확한 타입 정의 | 라이브러리의 `.d.ts`가 실제 동작과 다름 | 타입 정의 수정/보강, 최후엔 단언 |
| 클래스 메서드 파라미터 (bivariance) | 자식이 부모와 다른 파라미터 타입으로 재정의해도 통과 | 부모·자식 메서드 시그니처를 일치시킴 |
| 파라미터 변경(mutation) | `Hen[]`을 `Animal[]` 받는 함수에 넘겨 다른 동물을 `push` | 파라미터는 `readonly`로 받고 변경하지 않음 |
| 함수 호출이 좁히기를 무효화하지 않음 | `if (x.a) { fn(x); x.a.length }` 사이에 `fn`이 `a`를 지울 수 있음 | 파라미터를 변경하지 않음, `Readonly`로 전달 |
| 열린 객체 타입 + optional 프로퍼티 | 엉뚱한 타입의 여분 프로퍼티가 optional 필드와 충돌 | 프로퍼티 이름을 구체적으로 짓기 |

(참고: 원서 Item 3은 `const r: ApiRes = await res.json()`처럼 외부 데이터를 타입으로 "선언"만 해도 런타임 값과 어긋날 수 있다고 경고한다. 해결책은 5.1절의 런타임 검증이다.)

핵심 태도: **"타입이 맞다"는 "런타임에도 맞다"를 보장하지 않는다.** 경계(입출력)에서 확인하고, 안쪽에서는 타입을 신뢰한다.

> 📖 원문: Ch.5 Item 48

---

## 코어 2. 검사 스위치는 켜고, 끄는 장치는 좁게

> 켜는 스위치: `strict`(2.1). 끄는 장치: `any`(2.2), `as`·`!`(2.3), 사용자 정의 타입 가드 `is`(2.4·4.1). 끄는 장치의 안전한 대체: `unknown`(2.4)과 "단언을 잘 타입된 함수 안에 숨기기"(2.5).

### 2.1 컴파일러 설정: tsconfig의 strict

**한 줄 요약:** 새 프로젝트는 처음부터 `"strict": true`(= `noImplicitAny` + `strictNullChecks` + 기타)를 `tsconfig.json`에 켜고, 필요하면 `noUncheckedIndexedAccess`까지 고려한다.

| 옵션 | 하는 일 | 안 켜면 |
|---|---|---|
| `noImplicitAny` | 타입을 못 정한 변수/파라미터를 오류로 표시 | 조용히 `any`가 되어 검사 무력화 |
| `strictNullChecks` | `null`/`undefined`를 다른 타입과 분리 | "undefined is not an object" 런타임 오류 |
| `strict` | 위 둘 + 기타 엄격 옵션 전부 켜기 | 검사 구멍이 남음 |

```ts
const x: number = null;            // strictNullChecks 켜면 오류
const y: number | null = null;     // 의도를 명시해야 함

const el = document.getElementById('status');
el.textContent = 'Ready';          // 오류: el은 null일 수 있음
if (el) { el.textContent = 'Ready'; }   // null 제거(좁히기) 후 사용
```

- 옵션은 명령줄이 아니라 **`tsconfig.json`** 으로 관리한다. 팀원과 도구가 같은 설정을 쓰게 하기 위해서다. (`tsc --init`으로 만들면 기본이 strict 모드다.)
- 새 프로젝트는 **처음부터 `"strict": true`**. 나중에 켜기는 프로젝트가 커질수록 어려워진다. `noImplicitAny`를 끄는 것은 JS에서 옮겨 오는 중간 단계에서만 허용되며, 그때도 임시로만 둔다.
- `!`(non-null 단언)로 null을 지울 수도 있지만 런타임 예외 위험이 있다. 조건문으로 좁히는 편이 안전하다(4.1절).
- `noUncheckedIndexedAccess`는 "strict보다 더 엄격"한 옵션이다. `arr[3]`이나 `obj[key]`를 `T | undefined`로 취급한다.
  편의성은 떨어지지만 배열/맵 조회 실수를 잡아준다. 존재를 알고 팀이 선택하자.
- 오류가 재현이 안 되면 **옵션 차이**를 먼저 의심한다. 팀이 같은 tsconfig를 쓰는지 확인.

**SaaS 관점**: `strictNullChecks`가 꺼진 코드베이스에서는 "사용자를 못 찾았을 때"의 `undefined`가 아무 경고 없이 흘러간다.
인증/권한/과금 로직에서 이런 실수는 곧 보안·정산 사고다.

> 🔗 NestJS 연결: `nest new`가 만든 기본 tsconfig는 strict 계열이 일부만 켜져 있는 경우가 많다. 프로젝트 시작 시 `strict: true`로 올려두자.

> 📖 원문: Ch.1 Item 2

### 2.2 `any`: 안전망을 끄는 스위치

**한 줄 요약:** `any`는 검사를 끄고 전염되므로, 쓴다면 "시간(변수 수명)"과 "공간(객체 범위)" 양쪽으로 가장 좁게 쓴다.

`any`는 타입 검사를 끈다. 어디로든 대입되고 무엇이든 받는다.

- 계약이 깨진다: `calculateAge(birthDate: Date)`에 `any`로 문자열을 넘겨도 통과.
- 자동완성/이름 바꾸기(rename) 같은 **언어 서비스가 사라진다.**
- **리팩터링 때 버그를 숨긴다.** 콜백 파라미터를 `any`로 두면, 나중에 호출 쪽 시그니처를 바꿔도 타입 검사를 통과한 채 런타임에 터진다.
- 타입 설계 자체를 숨기고, 타입 시스템에 대한 팀의 신뢰를 깎는다.
- **전염된다.** 함수가 `any`를 반환하면 그 값을 쓰는 모든 곳으로 `any`가 퍼진다. `JSON.parse()`, `response.json()`처럼 `any`를 돌려주는 표준 API가 대표적인 유입 경로다. (`req.body`도 프레임워크에 따라 비슷하다. — 보충)

지침:
- 쓴다면 **범위를 가장 좁게**, 이유를 주석으로. (Item 43, 45)
- 함수 반환값을 `any`로 두지 않는다. (호출자 전체로 퍼진다)
- 모르는 값에는 `any` 대신 **`unknown`** (2.4절).
- (보충) ESLint의 `no-explicit-any`, `no-unsafe-*` 규칙으로 팀 차원에서 제한한다. (원서 Item 43도 typescript-eslint의 `recommended-type-checked` 프리셋의 `no-unsafe-assignment`, `no-unsafe-return` 규칙이 `any` 확산을 잡아준다고 소개한다.)

**`any`는 "시간"과 "공간" 양쪽으로 범위를 좁힌다 (Item 43)**

- **시간(변수 수명) 축소** — 변수 자체를 `any`로 선언하면 함수가 끝날 때까지 그 변수는 전부 검사 밖이다. 문제 되는 그 표현식에만 `as any`를 붙이면 그 줄에서만 끝난다.
  ```ts
  const pizza: any = getPizza();   // 나쁨: 이후 pizza.slice()도 검사 안 됨
  eatSalad(pizza);

  const pizza2 = getPizza();
  eatSalad(pizza2 as any);         // 낫다: 이 인자에만 any, 이후엔 여전히 Pizza
  ```
- **함수 파라미터를 `any`로 바꾸지 않는다** — 그 함수를 부르는 프로그램 전체의 검사가 꺼진다.
- **`any`를 반환하지 않는다** — 반환값이 `any`면 호출한 쪽으로 조용히 퍼진다. 반환 타입을 명시해 두면 `any`가 실수로 "새어 나가는" 것을 막는다.
- **공간(객체 범위) 축소** — 객체 리터럴의 한 프로퍼티만 오류라면 객체 전체에 `as any`를 붙이지 말고 그 프로퍼티 값에만 붙인다. 나머지 프로퍼티는 계속 검사된다.
- **한 줄만 끄고 싶다면** `@ts-expect-error`가 `@ts-ignore`보다 낫다. 나중에 오류가 사라지면 TypeScript가 알려 줘서 지시자를 지울 수 있기 때문이다. 다만 이 지시자도 남용하면 그 줄에서 새로 생긴 오류를 못 본다.

> 📖 원문: Ch.1 Item 5, Ch.5 Item 43 (관련: Item 44~46)

### 2.3 타입 단언(`as`)보다 타입 선언(`:`)

**한 줄 요약:** 선언은 컴파일러가 값을 검증하고 단언은 컴파일러를 입 다물게 하므로, 단언은 "이미 검증을 마친 값"에만 주석과 함께 쓴다.

```ts
interface Person { name: string }

const a: Person = { name: 'Kim' };        // 선언: 값이 Person에 맞는지 검사함
const b = { } as Person;                  // 단언: "내가 책임질게" → 검사 생략, name이 없는데 통과
```
- **선언**은 컴파일러가 값을 검증한다. **단언**은 컴파일러를 입 다물게 한다.
- 단언은 잘못하면 그대로 런타임 오류로 이어진다. 특히 `!`(non-null 단언)도 같은 부류다.
- 단언이 필요한 정당한 경우는 "TypeScript보다 내가 더 잘 아는 경우"(예: 이미 검증을 마친 값)뿐이다. 그때는 **왜 유효한지 주석**을 남긴다.
- 화살표 함수 반환값에 타입 검사를 걸고 싶으면 `as Person` 대신 반환 타입을 적는다: `(name): Person => ({ name })`.
- 단언은 값을 바꾸지 못한다(변환이 아니다). 서로 겹치지 않는 타입끼리는 `as`가 거부되고, `as unknown as T`로 우회할 수 있지만 그만큼 수상한 코드라는 표시다.
- `as const`는 단언처럼 보여도 타입을 더 정확하게 만드는 안전한 문법이다.
- 단언을 쓰면 잉여 속성 검사(3.3절)도 사라진다.

**SaaS 관점**: `const user = await repo.findOne(...) as User;` 같은 코드는 "없을 수 있음"을 숨긴다. 이런 단언이 늘어날수록 404가 500으로 바뀐다.

> 📖 원문: Ch.2 Item 9

### 2.4 `any` 대신 `unknown`

**한 줄 요약:** `unknown`은 "값은 있는데 타입을 모른다"를 안전하게 표현하며, 좁히기 전에는 대입·접근·호출을 모두 막는다.

`unknown`은 "값은 있는데 무슨 타입인지 모른다"를 안전하게 표현한다.

| | `any` | `unknown` |
|---|---|---|
| 아무 타입에 대입 | 가능 | **불가** (검사 필요) |
| 프로퍼티 접근/호출 | 가능 | **불가** (좁힌 후에만) |
| 안전성 | 없음 | 있음 |

```ts
function parse(json: string): unknown {
  return JSON.parse(json);
}
const v = parse('{"name":"kim"}');
v.name;                           // 오류. 아직 뭔지 모름

function isNamed(v: unknown): v is { name: string } {
  return typeof v === 'object' && v !== null   // typeof null === 'object' 이므로 null 제외 필수
      && 'name' in v && typeof v.name === 'string';
}
if (isNamed(v)) v.name;           // OK (사용자 정의 타입 가드)
```
- `unknown`은 "값은 있지만 타입은 모르거나 신경 쓰지 않는" 경우에 쓴다. 좁히는 방법은 `instanceof`, 사용자 정의 타입 가드, 또는 (책임을 지는) 단언이다.
- 사용자 정의 타입 가드도 본문이 맞는지 컴파일러가 검증하지 않는다. 단언과 같은 수준의 약속이다.
- `function f<T>(): T`처럼 **반환에만 쓰는 타입 파라미터**는 단언과 같다. 안전한 척만 하니 피한다.
- `{}`(null/undefined 제외 전부), `object`(원시 값 제외), `Object`는 `unknown`보다 좁고 쓸 일이 드물다. 대부분 `unknown`이 더 적절하다.
- (보충) 외부에서 들어오는 값(요청 바디, 쿼리, 웹훅 페이로드, 큐 메시지, 캐시에서 꺼낸 값)을 `unknown`으로 다루는 습관을 들이자. `catch (e)`의 `e`도 `unknown`으로 두고 `e instanceof Error`로 좁힌다(`useUnknownInCatchVariables`는 strict에 포함).

> 📖 원문: Ch.5 Item 46

### 2.5 위험한 단언은 "잘 타입된 함수" 안에 숨기기

**한 줄 요약:** 어쩔 수 없는 단언은 시그니처를 망치지 말고 "검증 + 단언"을 한 함수 본문에 모아 숨긴다 — 경계 설계의 기본 원리.

어쩔 수 없이 `as`나 `any`를 써야 한다면, 구현을 안전하게 만들려고 **함수 시그니처를 망치지 말고** 단언을 함수 본문 안에 숨긴다. 시그니처는 사용자에게 보이는 공개 API이고 구현은 감춰진 세부 사항이기 때문이다. 시그니처를 `unknown` 반환으로 바꿔 버리면 호출하는 곳마다 단언이 흩어진다. 단언이 들어간 함수는 특히 단위 테스트를 꼼꼼히 하고, 왜 유효한지 주석을 단다.

```ts
// (보충) 원서 예시(fetchPeak)를 요청 바디 검증으로 바꾼 예
function parseCreateComment(body: unknown): CreateComment {
  if (!isCreateComment(body)) throw new BadRequestError();   // 검증
  return body;                                               // 이 안에서만 신뢰
}
```
- 코드 곳곳에 흩어진 `as`보다 "검증 + 단언"을 한 함수에 두면 검토할 지점이 줄어들고, 그 안에서 검증을 점점 강화하기도 쉽다.
- 이런 검증을 체계적으로 하는 방법이 5.1절(Item 74)이다.
- (보충) 정리하면 **검증 계층(경계)** 설계의 기본 원리는 "바깥은 `unknown`, 검증을 통과한 안쪽은 정확한 타입"이다.

> 📖 원문: Ch.5 Item 45

---

## 코어 3. 타입 = 값의 집합, 비교는 구조(모양)로

> 구조적 비교(3.1)와 집합 사고(3.2)가 뿌리다. 잉여 속성 검사(3.3)는 그 위에 얹은 **별도 장치**, `type`/`interface`(3.4)·`readonly`(3.5)·유틸리티 타입(3.6)은 집합을 정의·변형하는 도구, 브랜드(3.7)는 구조적 비교의 구멍(같은 모양의 ID 혼동)을 막는 명목적 흉내다.

### 3.1 구조적 타이핑(Structural Typing)

**한 줄 요약:** TS는 이름이 아니라 모양으로 타입 호환을 판단하고, 타입은 열려 있다 — 테스트는 쉬워지지만 같은 모양의 값이 섞인다.

TypeScript는 이름이 아니라 **모양(구조)** 으로 타입 호환을 판단한다. JS의 "오리처럼 걸으면 오리" 사고를 그대로 옮긴 것이다.

```ts
interface Vector2D { x: number; y: number }
interface NamedVector { name: string; x: number; y: number }

function length(v: Vector2D) { return Math.sqrt(v.x ** 2 + v.y ** 2); }
length({ name: 'a', x: 3, y: 4 } as NamedVector); // OK. 5
```

알아둘 점:
- 타입은 **열려(open) 있다.** `{x, y}`를 요구해도 `{x, y, z}`, `{x, y, address}`가 들어올 수 있다.
  - 그래서 `Object.keys(v)`로 순회하면 뜻밖의 키가 섞일 수 있다.
- **클래스도 구조적으로 비교**된다. 생성자에서 검증하는 클래스라도 모양만 같은 객체 리터럴이 타입 검사를 통과한다.
  - 생성자 검증이 "무조건 실행됐다"고 가정하면 안 된다. (Java/C#과 다른 점 — C++도 클래스 이름으로 비교하는 명목적 타이핑이라 같은 함정이 없다)
- 장점: 인터페이스를 **좁게** 정의하면 테스트가 쉬워진다. 진짜 DB 클라이언트 대신 `{ runQuery() {...} }` 같은 가짜 객체를 넘기면 된다.

```ts
// (보충) 원서 예시(getAuthors의 DB 인터페이스)를 바꾼 것
interface UserRepo { findById(id: string): Promise<User | null> }
// 실제 구현체가 이 모양만 만족하면 서비스는 UserRepo에만 의존 → 테스트에서 가짜 객체 주입 가능
```

**SaaS 관점**: "모양이 같으면 같은 타입"이라서 `userId`와 `tenantId`(둘 다 string)를 바꿔 넣어도 컴파일이 통과한다. 해결책은 3.7절의 브랜드 타입이다.

> 🔗 NestJS 연결: Provider를 인터페이스 모양으로 의존하고 테스트에서 `useValue: { findById: jest.fn() }`로 교체하는 방식이 구조적 타이핑 덕분에 가능하다. (단, 인터페이스는 런타임에 없으므로 DI 토큰은 클래스나 문자열/Symbol을 쓴다.)

> 📖 원문: Ch.1 Item 4

### 3.2 타입은 "값의 집합"이다

**한 줄 요약:** 타입 = 가질 수 있는 값들의 집합, "대입 가능 = 부분집합"(`extends`도 같은 뜻), `never`는 공집합·`unknown`은 전체집합.

타입을 **"가질 수 있는 값들의 집합(도메인)"** 으로 생각하면 규칙이 쉬워진다.

| 타입 | 집합으로 보면 |
|---|---|
| `never` | 공집합. 어떤 값도 대입 불가 (bottom 타입) |
| `'A'`, `12` 같은 리터럴 | 원소 1개짜리 집합 |
| `'A' \| 'B'` | 두 집합의 합집합(유니온) |
| `A & B` | 교집합 |
| `string`, `number` | 무한 집합 |
| `unknown` | 전체집합 (top 타입) |

핵심 규칙:
- **"대입 가능(assignable)" = "부분집합(subset of)"**, `extends`도 같은 뜻이다. 오류 메시지의 "not assignable"은 "부분집합이 아니다"로 읽으면 된다.
  ```ts
  type AB = 'A' | 'B';
  type AB12 = 'A' | 'B' | 12;
  const ab: AB = 'A';
  const ab12: AB12 = ab;   // OK: {A,B}는 {A,B,12}의 부분집합
  const back: AB = ab12;   // 오류: 12가 AB에 없음
  ```
- 객체 타입은 "이 조건을 만족하는 값 전부"를 뜻한다. 프로퍼티가 더 있어도 그 타입에 속할 수 있다(열린 타입). 그래서 `Person & Lifespan`은 두 인터페이스의 프로퍼티를 **모두** 가진 값들의 집합이다.
- 유니온과 `keyof`의 관계: `keyof (A & B) = keyof A | keyof B`, `keyof (A | B) = keyof A & keyof B`. 유니온에서는 "모든 멤버가 확실히 갖는 키"만 안전하게 접근할 수 있다는 뜻이다.
- 하위 타입에서 프로퍼티 타입을 **좁히는 것**은 가능(`number | null` → `number`)하지만 **넓히는 것**은 불가(`extends` 오류).
- 배열은 튜플에 대입 불가(길이가 다를 수 있으므로 부분집합이 아님), 튜플은 배열에 대입 가능.
- 모든 값 집합이 TS 타입으로 표현되는 것은 아니다. "정수 전체" 같은 타입은 없다.
- 값이 변할 수 있으면 이 사고법이 흔들린다. 불변 값으로 생각할 때 타입 검사가 가장 효과적이다(3.5절).

> 📖 원문: Ch.2 Item 7

### 3.3 잉여 속성 검사(Excess Property Checking)와 타입 검사는 다른 것

**한 줄 요약:** 객체 리터럴을 직접 대입할 때만 일어나는 별도의 오타 검사이며, 변수를 거치거나 `as`를 쓰면 사라진다.

구조적 타이핑상 여분의 프로퍼티가 있는 값도 원래는 대입 가능하다. 그런데 **객체 리터럴을 직접 대입**하면 TS가 별도의 추가 검사를 한다.

```ts
interface Options { title: string; darkMode?: boolean }

const a: Options = { title: 'x', darkmode: true };   // 오류: 오타를 잡음 (잉여 속성 검사)

const tmp = { title: 'x', darkmode: true };
const b: Options = tmp;                              // OK: 리터럴이 아니므로 검사 없음
const c = { title: 'x', darkmode: true } as Options; // OK: 단언을 쓰면 검사 없음
```
- 검사가 일어나는 곳: **선언된 타입이 있는 변수에 리터럴 대입, 함수 인자로 리터럴 전달, 선언된 반환 타입의 리터럴 반환**.
- 이는 "엄격한 객체 리터럴 검사" 또는 "신선도(freshness)"라 부르기도 한다. 옵션 객체의 **오타**를 잡는 용도다.
- 이 검사는 구조적 호환성 검사와 **별개 과정**이다. 이를 섞어 생각하면 "왜 이건 되고 저건 안 되지?"가 헷갈린다. 타입은 여전히 "닫혀 있지 않다".
- 모든 프로퍼티가 optional인 타입(**weak type**)은 별도 검사가 있다. 대입하려는 값과 **공통 프로퍼티가 하나도 없으면** 리터럴이 아니어도 오류다.
- 여분의 키를 일부러 허용하려면 인덱스 시그니처(`[k: string]: unknown`)를 쓴다.
- `as`를 쓰면 이 검사가 사라진다. 타입 선언(`:`)을 단언보다 선호하는 이유 중 하나다(2.3절).

**SaaS 관점**: 설정/옵션 객체(`{ retries: 3, timeuot: 1000 }`)의 오타는 조용히 기본값으로 동작하는 버그가 된다. 이 검사는 그것을 리터럴일 때 잡아 준다. 단, 요청 바디처럼 런타임에 들어온 데이터에는 아무 도움이 안 된다(5.1절).

> 📖 원문: Ch.2 Item 11

### 3.4 `type` vs `interface`

**한 줄 요약:** 대부분 둘 다 되지만 유니온·튜플·조건부/매핑 타입은 `type`만, 선언 병합은 `interface`만 되며, 새 코드는 가능하면 `interface`로 일관되게 — 그리고 값까지 만드는 것은 `class`뿐이다.

둘의 경계는 해가 갈수록 흐려져서, 대부분 어느 쪽으로든 쓸 수 있다. 차이는 다음과 같다.

| 항목 | interface | type |
|---|---|---|
| 객체 모양, 제네릭, 인덱스 시그니처, 재귀 | 가능 | 가능 |
| `class ... implements` 대상 | 가능 | 가능 (단순 객체 타입) |
| **유니온**(`A \| B`), 튜플, 배열 별칭, 조건부/매핑 타입 | 불가 | **가능** |
| 함수 타입 | 가능하지만 어색 | `type Fn = (x: number) => string` 이 더 간결 |
| **같은 이름 재선언 시 병합**(declaration merging) | **병합됨** | 오류 |
| 확장 | `extends` (충돌 시 **오류**로 알려 줌) | `&` (충돌해도 오류 없이 쓸 수 없는 타입이 됨) |

```ts
interface Person { name: string; age: string }
type TPerson = Person & { age: number };      // 오류 없음. 하지만 age가 string & number라 쓸 수 없는 타입
interface IPerson extends Person { age: number } // 오류로 즉시 알려 줌
```
- **결론(책의 권고)**: 새 코드에서는 가능하면 `interface`, 유니온이 필요하거나 함수 타입처럼 `type`이 더 깔끔할 때만 `type`. 이미 팀 스타일이 있으면 그것을 따른다. 너무 고민하지 말고 **일관성**을 지킨다.
- 인터페이스가 선호되는 이유: 오류 메시지·타입 표시에서 이름이 일관되게 유지되고, `extends` 시 호환성 검사를 더 해 준다.
- 병합 기능은 주로 타입 선언 파일(`.d.ts`)에서 쓰인다. 사용자 코드에서는 같은 모듈 안에서만 병합되어 전역 이름과의 우발적 충돌을 막는다.
- 이름에 `I`, `T` 접두사(`IUser`)는 요즘은 나쁜 스타일이다. 붙이지 않는다.
- `class`는 타입과 **값(런타임 객체)** 을 함께 만든다는 점이 둘과 결정적으로 다르다.

> 🔗 NestJS 연결: DTO는 검증 데코레이터 메타데이터가 필요해서 `interface`가 아니라 **`class`** 로 쓴다. 인터페이스는 컴파일 후 사라져 `ValidationPipe`가 참조할 수 없다. (1.2절과 연결)

> 📖 원문: Ch.2 Item 13

### 3.5 `readonly`로 우발적 변경(Mutation) 막기

**한 줄 요약:** 바꾸지 않는 파라미터는 `readonly T[]`/`Readonly<T>`로 받되, 이것은 얕고(shallow) 프로퍼티에만 영향을 준다.

변경(mutation)은 찾기 어려운 버그의 주된 원인이다. JS의 원시 값(string, number, boolean)은 원래 불변이지만 **배열과 객체는 가변**이다. 책의 예: 합계를 구하는 함수가 `arr.pop()`으로 배열을 비워 버려서 호출자의 배열이 망가진다. TS는 이걸 오류로 보지 않는다.

```ts
function arraySum(arr: readonly number[]) {
  let sum = 0;
  for (const n of arr) sum += n;   // arr.pop() 같은 변경 메서드는 readonly number[]에 없으므로 오류
  return sum;
}
```
- 함수가 파라미터를 바꾸지 않는다면 `readonly T[]` / `Readonly<T>`로 선언한다. 얻는 것: ① 본문에서 변경하면 오류 ② 호출자에게 "안 바꾼다"는 약속을 알림 ③ 호출자가 readonly 값도 넘길 수 있음.
- 가변 배열(`T[]`)은 `readonly T[]`에 대입 가능하지만 반대는 불가. (그래서 파라미터를 readonly로 받는 쪽이 더 넓게 호환된다.)
- **주의 1**: `readonly`/`Readonly<T>`는 **얕다(shallow)**. `obj.inner = ...`는 막지만 `obj.inner.x = 1`은 통과한다. 깊은 readonly는 직접 만들기 까다로우니 라이브러리(예: ts-essentials의 `DeepReadonly`)를 쓰라고 권한다.
- **주의 2**: `Readonly<T>`는 **프로퍼티에만** 영향을 준다. `Readonly<Date>`도 `setFullYear()`로 변경된다.
- `const`는 재할당을 막고, `readonly`는 내부 변경을 막는다. 서로 다르다.
- `readonly`는 전염된다. 한 함수에 붙이면 그 함수가 호출하는 함수들도 붙여야 한다. 계약이 명확해지므로 좋은 현상이다.

**SaaS 관점**: 요청 간에 공유되는 객체(전역 설정, 캐시, 플랜 표)를 어떤 함수가 몰래 바꾸면 **다른 요청/테넌트에 영향**이 간다. 읽기만 하는 함수의 파라미터를 `readonly`로 선언해 두면 이런 사고를 컴파일 단계에서 줄인다.

> 📖 원문: Ch.2 Item 14

### 3.6 타입 연산과 제네릭으로 중복 제거 (DRY)

**한 줄 요약:** 타입도 복붙하면 어긋나므로 인덱싱·`keyof`·매핑 타입·`Pick`/`Partial` 등으로 원본에서 파생하되, 우연히 같은 모양을 억지로 묶지는 않는다.

로직처럼 **타입도 복붙하면 어긋난다.** `Person`에 `middleName`을 추가했는데 복사해 둔 `PersonWithBirthDate`엔 빠지는 식이다. 타입 세계의 "함수 추출"에 해당하는 도구들이 있다.

| 도구 | 예 | 의미 |
|---|---|---|
| 타입에 이름 붙이기 | `type HTTPFunction = (url: string, opts: Options) => Promise<Response>` | 같은 시그니처 재사용 |
| `extends` / `&` | `interface B extends A { ... }` | 공통 필드를 기반 타입으로 |
| 인덱싱 | `State['userId']`, `Action['type']` | 다른 타입의 일부 타입 참조 |
| `keyof` | `keyof Options` | 키들의 유니온 |
| 매핑 타입 | `{ [K in keyof T]?: T[K] }` | 필드를 순회하며 변형 |
| `typeof` | `type Options = typeof INIT_OPTIONS` | 값의 모양에서 타입 도출 |
| `ReturnType<typeof fn>` | 함수의 반환 타입 | 함수 결과 모양 재사용 |

자주 쓰는 표준 제네릭(=타입을 받아 타입을 돌려주는 "함수"):
- `Pick<T, K>`: 지정한 필드만 골라낸 타입 (`{ [k in K]: T[k] }`)
- `Partial<T>`: 모든 필드를 선택적으로 (`{ [k in keyof T]?: T[k] }`)
- `Readonly<T>`: 모든 필드를 읽기 전용으로
- `ReturnType<F>`: 함수 F의 반환 타입
- (참고: `Omit`도 같은 계열의 표준 유틸리티지만 이 책의 해당 절에서는 다루지 않는다.)

```ts
interface Options { width: number; height: number; color: string; label: string }

class UIWidget {
  constructor(init: Options) { /* ... */ }
  update(options: Partial<Options>) { /* 일부만 수정 */ }
}
type SizeOnly = Pick<Options, 'width' | 'height'>;
```
- 값이 진실의 원천(schema 등)일 때만 `typeof`로 타입을 뽑는다. 보통은 **타입을 먼저 정의**하고 값이 그것을 만족하도록 하는 편이 명시적이다.
- **DRY를 과하게 적용하지 말 것.** `Product.id`와 `Customer.id`가 우연히 같은 모양이라고 `NamedAndIdentified`로 묶으면, 나중에 서로 다른 방향으로 바뀔 때 발목을 잡는다. "이름 붙이기 어렵다면 좋은 추상화가 아닐 수 있다."

**SaaS 관점**: 생성 입력 → 수정 입력(`Partial`) → 응답 타입(`Pick`으로 필요한 필드만)을 원본 하나에서 **파생**하면, 컬럼 추가 시 여러 DTO가 어긋나는 문제가 준다.

> 🔗 NestJS 연결: `@nestjs/mapped-types`의 `PartialType`, `PickType`, `OmitType`은 이 유틸리티 타입 개념을 **클래스와 검증 메타데이터까지 포함해** 런타임에도 만들어 주는 버전이다. (`class UpdateDto extends PartialType(CreateDto) {}`)

> 📖 원문: Ch.2 Item 15

### 3.7 브랜드(Brand)로 명목적 타이핑

**한 줄 요약:** 구조적으로 같은 `string`인 `UserId`/`TenantId`를 `T & { __brand }`로 구분해 섞이지 않게 한다 — 강제가 아니라 런타임 비용 없는 실수 방지.

구조적 타이핑에서는 `string`인 `UserId`와 `TenantId`가 서로 호환된다. 브랜드로 구분한다.

```ts
// (보충) 원서는 `string & { _brand: 'abs' }` 형태(AbsolutePath, Meters, SortedList)로 설명한다. 아래는 ID 구분용으로 일반화한 예
type Brand<T, B extends string> = T & { readonly __brand: B };
type UserId   = Brand<string, 'UserId'>;
type TenantId = Brand<string, 'TenantId'>;

const asUserId = (s: string) => s as UserId;   // 생성 지점을 한 곳에 제한

function loadUser(tenant: TenantId, user: UserId) { /* ... */ }
loadUser(userId, tenantId);   // 오류! 인자 순서를 바꾸면 컴파일 단계에서 잡힘
```
- 런타임 비용이 없다(타입에서만 존재). 객체에 `type: '2d'` 같은 실제 태그 값을 넣는 방식(판별 유니온)과 달리 `string`, `number` 같은 원시 타입에도 붙일 수 있다.
- 브랜드가 붙는 지점(타입 가드로 검증을 통과한 곳)을 한정하면 "검증된 값"의 증거가 된다. 원서의 예: `AbsolutePath`(절대 경로), `SortedList<T>`(정렬된 목록만 받는 이진 탐색), 단위 있는 숫자(`Meters`, `Seconds`).
- 한계: `as`로 누구나 만들 수 있으므로 **"강제"가 아니라 "실수 방지"** 도구다. 또 숫자 브랜드는 곱셈·나눗셈을 하면 브랜드가 사라져 `number`가 된다.
- 비공개 `unique symbol`을 브랜드 키로 쓰는 방법도 있다(사용자가 브랜드를 직접 흉내 내지 못함).

**SaaS 관점**: 멀티테넌트 시스템에서 `tenantId`, `userId`, `orgId`, `subscriptionId`가 모두 `string` 또는 `uuid`다. 인자를 바꿔 넣거나 다른 테넌트의 ID를 쿼리에 넣는 실수는 곧 **데이터 유출**이다. 브랜드 타입으로 서로 못 섞이게 하면 값싼 방어선이 된다.

> 📖 원문: Ch.7 Item 64

---

## 코어 4. 유효한 상태만 표현한다

> 이 코어(원서 Ch.4 타입 설계)가 이 책의 핵심이다. 타입 설계를 잘하면 코드가 단순해지고 버그의 상당수가 사라진다.
> 흐름: 좁히기(4.1)로 유니온을 다루는 법 → 유효한 상태만 표현(4.2) → 판별 유니온(4.3) → `null`은 경계로(4.4) → `string`보다 정밀하게(4.5) → 특수 값·optional 줄이기(4.6) → 누락을 컴파일 오류로 바꾸는 `never`(4.7)와 `Record`(4.8).

### 4.1 타입 좁히기(Narrowing)

**한 줄 요약:** 컴파일러는 제어 흐름을 따라가며 유니온을 위치별로 좁히지만, `typeof null`, `!x`, 콜백, 사용자 정의 타입 가드에서 함정이 있다.

유니온 타입(`A | B`)은 검사를 거치면 **같은 변수가 위치에 따라 다른 타입**을 갖게 된다. 컴파일러가 실행 경로를 따라가기 때문이다(제어 흐름 분석). C++/Java/Rust와 다른 TS의 특징이다.

```ts
function len(x: string | string[] | null) {
  if (x === null) return 0;                     // null 제외
  const list = Array.isArray(x) ? x : [x];      // string[] 로 통일
  return list.length;
}

const elem = document.getElementById('a');      // HTMLElement | null
if (!elem) throw new Error('없음');             // 던지거나 return 하면 아래는 non-null
elem.innerHTML = 'ok';
```
좁히기 도구:
- 조건 + **`throw`/`return`** (이후 코드에서 null 제거)
- `instanceof` (클래스 인스턴스)
- `'key' in obj` (프로퍼티 존재)
- `Array.isArray` 같은 내장 함수
- **꼬리표(tag) 프로퍼티** 비교 (`e.type === 'upload'`): 판별 유니온 (4.3절)
- 사용자 정의 타입 가드: `function isInput(el: Element): el is HTMLInputElement`

함정:
- `typeof x === 'object'`는 `null`도 통과한다 (`typeof null`이 `"object"`). null 제거용으로 쓰면 안 된다.
- `if (!x)`로 좁히면 `''`, `0`도 함께 걸려서 원하는 결과가 아닐 수 있다. `x === undefined` / `x == null`처럼 정확히 확인한다.
- **콜백 안에서는 좁히기가 풀린다.** 바깥에서 값이 나중에 바뀔 수 있기 때문이다 (`setTimeout(() => obj.value.toFixed())`). 값을 지역 `const`로 꺼내 쓰면 해결된다.
- 컴파일러가 관계를 못 따라가면 `as`로 덮기 전에 코드를 살짝 바꿔 본다. 예: `map.has(k)` 후 `map.get(k)!` 대신 `const v = map.get(k) ?? fallback`.
- 사용자 정의 타입 가드(`v is User`)는 **본문 검증을 컴파일러가 확인하지 않는다.** 단언과 같은 수준의 약속이다.

> 📖 원문: Ch.3 Item 22

### 4.2 항상 유효한 상태만 표현하는 타입

**한 줄 요약:** 상태를 독립 필드 여러 개로 두지 말고 가능한 상태 하나하나를 꼬리표로 구분한 별개 타입으로 표현해, 불가능한 조합이 존재하지 않게 한다.

나쁜 예: 상태를 여러 개의 독립된 필드로 표현.

```ts
interface State {
  isLoading: boolean;
  error?: string;
  data?: Result;
}
// isLoading=true 이면서 error도 있는 상태는? 뭘 보여줘야 하는가? 표현 가능하지만 의미 없음.
```

좋은 예: **가능한 상태 하나하나를 별개 타입으로**, 꼬리표로 구분.

```ts
type RequestState =
  | { state: 'pending' }
  | { state: 'error'; error: string }
  | { state: 'ok'; data: Result };

function render(s: RequestState) {
  switch (s.state) {
    case 'pending': return '로딩';
    case 'error':   return `오류: ${s.error}`;   // error 필드가 있음이 보장됨
    case 'ok':      return s.data;
  }
}
```
- 타입이 더 길어져도 **"불가능한 조합"이 아예 존재하지 않게** 된다. 그래서 처리 코드가 단순해지고 버그가 준다.
- 책의 실례: 두 개의 조종간 값을 각각 저장해 놓고 평균을 내도록 했다가 비극이 된 사고. 입력이 애매한 상태를 허용하는 순간 어떤 함수도 올바르게 구현할 수 없다.
- 규칙: 필드들 사이에 "이건 있으면 저건 반드시 없어야 해" 같은 암묵적 관계가 있으면 타입으로 옮겨라.

**SaaS 관점**: 구독(Subscription) 상태(`trialing`, `active`, `past_due`, `canceled`), 주문/결제 상태, 초대 상태 같은 도메인은 전부 이 패턴이다.
`status`, `canceledAt`, `trialEndsAt`을 독립 필드로 두면 "canceled인데 canceledAt이 null" 같은 **깨진 데이터**가 생긴다. 상태별로 필요한 필드를 묶어 표현하자.

```ts
// (보충) 원서 예시(pending/error/ok)를 구독 도메인에 옮긴 것
type Subscription =
  | { status: 'trialing'; trialEndsAt: Date }
  | { status: 'active';   currentPeriodEnd: Date }
  | { status: 'canceled'; canceledAt: Date };
```

> 📖 원문: Ch.4 Item 29

### 4.3 유니온을 가진 인터페이스 대신 인터페이스의 유니온 (판별 유니온)

**한 줄 요약:** 짝이 맞는 필드 조합만 표현하려면 꼬리표를 가진 인터페이스의 유니온을 쓰고, 꼬리표는 런타임에 남는 값이라 타입 소멸 문제도 푼다.

```ts
// 나쁨: layout과 paint가 서로 짝이 맞아야 하는데 타입은 조합을 다 허용
interface Layer { layout: FillLayout | LineLayout; paint: FillPaint | LinePaint }

// 좋음: 짝이 맞는 것만 표현
interface FillLayer { type: 'fill'; layout: FillLayout; paint: FillPaint }
interface LineLayer { type: 'line'; layout: LineLayout; paint: LinePaint }
type Layer = FillLayer | LineLayer;
```
- 꼬리표(`type`, `kind`, `status`)를 가진 유니온을 **판별 유니온(Discriminated Union / Tagged Union)** 이라 한다.
- 꼬리표는 **런타임에 존재하는 값**이라 `switch`로 좁히기가 되고, 1.2절의 "타입이 사라지는 문제"도 해결한다.
- 서로 짝인 optional 필드 두 개(`placeOfBirth?`, `dateOfBirth?`)는 하나의 객체(`birth?: {place, date}`)로 묶어 "둘 다 있거나 둘 다 없거나"를 표현한다.

> 🔗 NestJS 연결: 도메인 이벤트(`UserCreated | UserDeleted`), 웹훅 페이로드(`type` 필드로 구분), 결과 객체(`{ok:true,...} | {ok:false,...}`)에 자주 쓴다.

> 📖 원문: Ch.4 Item 34

### 4.4 `null`은 경계로 밀어내라

**한 줄 요약:** 별칭에 `null`을 섞지 말고, 함께 null인 값은 하나로 묶고, 객체는 데이터를 다 준비한 뒤 만들어 안쪽은 non-null로 유지한다.

**타입 별칭에 `null`을 섞지 않는다.**
```ts
type MaybeUser = User | null;   // 이렇게 별칭에 넣으면 어디서 null이 오는지 흐려짐
function getUser(id: string): User | null { ... }   // 사용 지점에서 드러내기
```

**두 값이 "같이 null이거나 같이 아니거나"이면 하나의 객체로 묶는다.**
```ts
// 나쁨: min이 null이면 max도 null이라는 관계가 타입에 없음
function extent(nums: number[]): (number | undefined)[]

// 좋음: 결과 전체가 null이거나 아니거나
function extent(nums: number[]): [number, number] | null
```
클래스도 같다. 여러 프로퍼티가 나중에 채워져 `user: User | null; posts: Post[] | null`이 되면 네 가지 조합이 생긴다.
→ **필요한 데이터를 모두 준비한 뒤에 객체를 생성**하자(비동기 정적 팩토리 `static async init()`).

```ts
class UserPosts {
  private constructor(readonly user: User, readonly posts: Post[]) {}
  static async load(id: string) {
    const [user, posts] = await Promise.all([fetchUser(id), fetchPosts(id)]);
    return new UserPosts(user, posts);   // 생성된 객체는 항상 완전함
  }
}
```

**SaaS 관점**: "부분적으로만 초기화된 객체"는 요청 처리 중 가장 흔한 NPE(null 접근)의 원천이다. 존재하지 않을 수 있음은 **가장 바깥(조회 함수 반환값)** 에서 한 번만 처리하고, 그 안쪽은 non-null을 유지하자.

> 🔗 NestJS 연결: 서비스에서 `findOne` 결과가 null이면 즉시 `NotFoundException`을 던지고, 이후 코드는 non-null로 다룬다. 비동기 초기화는 `useFactory` 비동기 Provider가 같은 목적이다.

> 📖 원문: Ch.4 Item 32, 33

### 4.5 `string`보다 정밀한 타입

**한 줄 요약:** 주석에 형식·허용 값이 적혀 있다면 "stringly typed" 신호이므로 `Date`, 리터럴 유니온, `keyof T`로 도메인을 좁힌다.

`string`은 도메인이 엄청나게 크다. 주석에 "YYYY-MM-DD", "live 또는 studio"라고 적혀 있다면 타입이 부족하다는 신호다. 이런 코드를 "stringly typed"라 부른다.

```ts
// 나쁨: 형식이 어긋나도 (예: 'August 17th, 1959', 'Studio') 컴파일 통과
interface Album { artist: string; title: string; releaseDate: string; recordingType: string }

// 좋음: 날짜는 Date, 한정된 값은 리터럴 유니온
type RecordingType = 'studio' | 'live';
interface Album { artist: string; title: string; releaseDate: Date; recordingType: RecordingType }
```
- 같은 `string`이 여러 파라미터에 있으면 순서를 바꿔 호출해도 컴파일이 통과한다 (`recordRelease(date, title)`).
- 이름 붙인 유니온에는 **문서 주석**을 달 수 있고, 함수 시그니처에서 허용 값이 바로 보인다.
- enum 대신 리터럴 유니온을 권한다 (5.2절 참고).
- 객체의 키 이름을 받는 함수는 `string` 대신 **`keyof T`** 를 쓴다. 더 정확히는 `<T, K extends keyof T>(obj: T, key: K): T[K]`로 반환 타입까지 정확해진다.
- 값이 외부에서 들어오면 런타임 검증이 별도로 필요하다(5.1절).

> 📖 원문: Ch.4 Item 35

### 4.6 특수 값에는 별도 타입, 선택적 프로퍼티는 아껴 쓰기

**한 줄 요약:** `-1`·`0`·`""` 같은 특수 값은 `| null`로 분리하고, optional은 누락을 숨기므로 필수로 두거나 "정규화 전/후" 두 타입으로 나눈다.

**특수 값(Special Values)**: `-1`, `0`, `""` 같은 "정상 값 자리에 섞인 실패/없음 표시"는 타입 검사를 무력화한다.
- 책의 예: `indexOf`는 못 찾으면 `-1`을 반환한다. 이 값이 `slice(0, -1)` 같은 곳에 흘러가면 뒤에서부터 세는 엉뚱한 동작을 한다. 타입은 둘 다 `number`라서 TS가 구별하지 못한다.
- 상품 가격을 "모르면 `-1`"로 두었다가 고객 카드에 **돈이 환급**된 사고 시나리오도 나온다.
- 해결: 특수 상황을 다른 타입으로 분리한다. `number | null`로 바꾸면 컴파일러가 "null 처리 안 했다"고 알려 준다.
- `-1` 같은 값을 쓰는 것은 `strictNullChecks`를 끄는 것과 비슷한 "비엄격 구멍"이다.
- `null`/`undefined`의 의미가 애매하면(예: null = 에러, undefined = 로딩) 판별 유니온(4.2절)으로 명시한다.

```ts
interface Product { title: string; priceDollars: number | null }   // null = 가격 미정
function total(p: Product) {
  if (p.priceDollars === null) throw new Error('가격 미정');       // 처리를 강제당함
  return p.priceDollars;
}
```

**선택적 프로퍼티(`?`) 제한**: 새 필드를 하위 호환 때문에 optional로 추가하면 편하지만 비용이 크다.
- 책의 예: `unitSystem?`을 옵션으로 추가하자, 한 호출에서 전달을 빠뜨려 화면에 미터법과 야드법이 섞였다. **필수로 바꾸면** 빠뜨린 모든 곳이 컴파일 오류로 드러난다.
- 기본값을 "주석"으로만 정의(`default is imperial`)하면 곳곳에 `?? 'imperial'`이 흩어지고, 누군가는 다른 기본값을 쓴다.
- 과거 데이터와의 호환이 필요하면 타입을 둘로 나눈다: **정규화 전 입력 타입**(optional 있음) → `normalize()` 한 곳에서 기본값 채움 → **정규화 후 타입**(필수). DB/JSON에서 읽은 옛 설정에 잘 맞는 패턴이다.
- optional이 N개면 조합은 2ᴺ개다. 서로 배타적인 옵션이면 상태 타입으로 모델링한다(4.2절).
- 정말 없을 수 있는 값(예: 미들네임)이나 외부 API 서술에는 optional이 적절하다.

**SaaS 관점**: 요금/할인/한도 같은 금액·수량에 `-1`, `0`을 "없음"으로 쓰면 정산 사고로 이어진다. 또 옵션 필드의 기본값은 한 곳에서만 채우자.

> 📖 원문: Ch.4 Item 36, 37

### 4.7 `never`로 완전성 검사(Exhaustiveness Checking)

**한 줄 요약:** `default`에서 `assertUnreachable(x: never)`를 부르면 판별 유니온의 처리 누락이 컴파일 오류가 된다.

판별 유니온에 새 케이스가 추가되었는데 `switch`에서 빼먹은 경우를 **컴파일 오류로** 바꾼다.

```ts
function assertUnreachable(x: never): never {
  throw new Error(`처리되지 않은 케이스: ${JSON.stringify(x)}`);
}

function statusLabel(s: Subscription): string {
  switch (s.status) {
    case 'trialing': return '체험 중';
    case 'active':   return '활성';
    case 'canceled': return '해지';
    default:         return assertUnreachable(s);   // 새 status가 추가되면 여기서 컴파일 오류
  }
}
```
- 남은 케이스가 있으면 `s`가 `never`가 아니므로 오류가 난다.
- 런타임에 `throw`하는 이유: JS나 `any`를 거쳐 예상 밖 값이 들어올 수 있기 때문이다.
- 반환 타입을 명시하면 누락 시 "return이 없다"는 오류로도 잡힌다. (`x satisfies never`도 같은 용도)

**SaaS 관점**: 결제 상태·이벤트 타입·권한 종류를 추가할 때, 처리 위치를 전부 찾아야 하는 부담을 컴파일러가 대신 져 준다.

> 📖 원문: Ch.7 Item 59

### 4.8 `Record`로 값 동기화 유지

**한 줄 요약:** `Record<유니온, 값>` 표는 모든 키가 반드시 있어야 하므로, 유니온에 새 멤버를 추가하면 표에서 컴파일 오류가 나 명시적 결정을 강제한다.

원서 예시는 "props 객체에 속성을 추가하면 다시 그릴지 여부도 반드시 정하게" 만드는 것이다. `Record<keyof Props, boolean>` 표를 두면 새 속성을 추가할 때 표에서 컴파일 오류가 나서, "다시 그린다(fail open)"/"안 그린다(fail closed)" 중 하나를 몰래 고르는 대신 **명시적으로 결정**하게 된다. 같은 표를 배열(`(keyof Props)[]`)로 만들면 이 강제가 없다. 아래는 이를 SaaS 도메인으로 옮긴 (보충) 예시다.

```ts
// (보충) 요금제 표 예시
type Plan = 'free' | 'pro' | 'enterprise';

const PLAN_LIMITS: Record<Plan, { seats: number; apiCalls: number }> = {
  free:       { seats: 3,   apiCalls: 1_000 },
  pro:        { seats: 20,  apiCalls: 100_000 },
  enterprise: { seats: 500, apiCalls: 10_000_000 },
  // 새 Plan을 추가하고 여기를 빼먹으면 컴파일 오류
};
```
- `Record<유니온, 값>`은 **모든 키가 반드시 존재**해야 하므로, 유니온과 매핑 테이블이 어긋나지 않는다.
- 키를 삭제하거나 이름을 바꿔도 같은 방식으로 오류가 난다. 즉 표가 유니온과 "정확히 같은 키"를 갖도록 강제한다.
- (보충) 반대로 `{[key: string]: V}`는 키 누락을 못 잡는다. 권한 → 허용 동작, 이벤트 → 핸들러, 에러 코드 → HTTP 상태 같은 표에 어울린다.

> 📖 원문: Ch.7 Item 61

---

## 코어 5. 경계에서 한 번 검증하고, NestJS가 기대는 런타임 장치를 안다

> 코어 1~4의 결론이 NestJS 코드로 내려오는 곳이다. 런타임 검증과 DTO(5.1) → NestJS가 전제로 삼는 언어 기능(5.2) → 컨트롤러/서비스의 기본 형태인 `async`/`await`(5.3).

### 5.1 런타임에 타입 복원하기: 검증과 DTO

**한 줄 요약:** 타입과 검증의 단일 진실 원천을 만들고(스펙에서 생성 / Zod 등 런타임 라이브러리 / TS 타입에서 스키마 생성), 바깥은 `unknown` → 경계에서 한 번 검증 → 안쪽은 신뢰한다.

이 부에서 NestJS와 가장 직접적으로 만나는 지점이다.

**문제**: 요청 바디를 `CreateComment` 인터페이스로 "선언"만 하면, 타입은 런타임에 사라지므로 실제 검증은 일어나지 않는다.
손으로 `typeof`를 줄줄이 쓰면 타입과 검증 코드가 **따로 놀아** 어긋난다. (진실의 원천이 둘)

원칙: **타입과 검증의 "단일 진실 원천(Single Source of Truth)"** 을 만든다. 방법은 세 가지다.

| 방법 | 원리 | 장점 | 단점 |
|---|---|---|---|
| 1. 다른 스펙에서 생성 | OpenAPI/GraphQL 스키마 → TS 타입 생성(`json-schema-to-typescript`), JSON Schema 검증기(Ajv)로 검증 | 이미 스펙이 있으면 새 진실 원천이 안 생겨서 **최우선 권장** | 생성 빌드 단계 필요 |
| 2. 런타임 라이브러리로 정의 | Zod 등으로 스키마를 값으로 정의하고 `z.infer`로 타입 파생 | 빌드 단계 없음, "정수", "이메일" 같은 제약 표현 쉬움 | TS와 별개의 정의 문법을 또 배움. 런타임 타입 체계가 전염되어 외부 라이브러리·DB 생성 타입 참조가 어려움 |
| 3. TS 타입에서 스키마 생성 | `typescript-json-schema`로 타입 → JSON Schema → 검증기(Ajv) | 기존 TS 타입/외부 타입을 그대로 진실 원천으로 씀 | 새 도구와 빌드 단계, 타입 수정 시 재생성(CI로 동기화 강제) |

선택 기준(원서): 스펙이 이미 있으면 1번. 아니면 "빌드 단계 하나 더"(3번)와 "타입 정의 방식 하나 더"(2번) 중 고른다. 외부 라이브러리의 TS 타입을 참조해야 하면 3번이 낫다.

원서의 문제 제기 예시는 요청 바디를 손으로 검사하는 코드다. `typeof` 줄줄이에 `Object.keys(body).length !== 3`으로 여분 필드까지 막아야 하고, 타입과 검사 코드가 서로 어긋날 수 있다.

```ts
// 원서 예시(CreateComment)에 (보충) 제약(uuid, min/max)을 덧붙인 Zod 예
import { z } from 'zod';

const CreateComment = z.object({
  postId: z.string().uuid(),
  title:  z.string().min(1).max(100),
  body:   z.string(),
});
type CreateComment = z.infer<typeof CreateComment>;   // 스키마에서 타입 파생

const comment = CreateComment.parse(req.body);        // 실패하면 예외 → catch에서 400 응답(원서도 try/catch로 400 처리)
// 이 줄 이후 comment는 검증이 끝난 정확한 타입
```

(보충) 정리하면 다음과 같은 "경계 설계"가 된다. (원서 Item 74의 결론을 저자가 실무 규칙으로 풀어쓴 것)
1. 바깥에서 들어오는 값은 **`unknown`** 으로 시작한다. (2.4절)
2. **경계에서 딱 한 번** 검증한다. (컨트롤러 입구)
3. 통과한 값만 정확한 타입으로 안쪽 서비스에 전달한다.
4. 안쪽에서는 타입을 신뢰하고 반복 검증하지 않는다. (단, 도메인 규칙 검증은 별개)

**SaaS 관점**: 외부 입력 검증은 보안(인젝션, 과다 필드 주입/Mass Assignment)과 데이터 정합성의 첫 번째 관문이다.
"알 수 없는 필드는 거부/제거"까지 포함해서 설계한다. 검증 없이 `as`로 넘긴 값이 DB에 저장되면 되돌리기 어렵다.

> 🔗 NestJS 연결: NestJS에서는 **class-validator + class-transformer** 조합의 `ValidationPipe`가 위 2번 방식을 클래스 기반으로 구현한 것이다. DTO 클래스가 타입이면서 검증 규칙(`@IsEmail()`, `@IsString()`)이다.
> `whitelist: true`, `forbidNonWhitelisted: true`로 잉여 필드를 제거/거부하고, `transform: true`로 문자열 쿼리 → 숫자 변환도 한다. Zod를 쓰고 싶다면 커스텀 Pipe로 같은 위치(경계)에 넣는다.

> 📖 원문: Ch.9 Item 74 (관련: Ch.1 Item 3, Ch.5 Item 46)

### 5.2 언어 기능: 데코레이터, 파라미터 프로퍼티, enum

**한 줄 요약:** 책은 런타임 코드를 만드는 옛 TS 기능을 피하라고 하지만, NestJS DI는 데코레이터 메타데이터·파라미터 프로퍼티·런타임에 존재하는 `class`를 전제로 하므로 왜 그런지 알고 쓴다.

책은 "TypeScript는 타입 공간에서만 혁신하고 런타임은 ECMAScript(TC39)가 정한다"는 원칙을 소개하며, 이 원칙에 어긋나는 옛 기능(enum, 파라미터 프로퍼티, namespace/삼중 슬래시, experimentalDecorators, `private` 등 가시성 키워드)은 되도록 피하라고 권한다.
그런데 NestJS는 이 중 일부(데코레이터, 파라미터 프로퍼티)를 **전제로** 한다(보충). 그래서 각각이 무엇인지 알고 쓰는 것이 필요하다.

| 기능 | 책의 권고 | NestJS와의 관계 (보충) |
|---|---|---|
| **enum** | 숫자 enum은 타입 안전하지 않고(number가 대입됨) 값이 읽기 어렵다. 문자열 enum은 안전하지만 명목 타이핑이라 JS 사용자와 TS 사용자의 사용법이 갈린다. 문자열 리터럴 유니온을 선호 | 필요하면 `as const` 배열 + 유니온이 대안. DB/Swagger 연동 시 문자열 enum도 실무에서 흔함 |
| **파라미터 프로퍼티** `constructor(private repo: Repo) {}` | 코드가 생성되는 몇 안 되는 문법. 사용하지 않는 파라미터처럼 보이고, 일반 프로퍼티와 섞이면 클래스 구조가 감춰짐. 책은 대체로 피하지만 의견이 갈리는 문법이라고 언급 | **NestJS 의존성 주입(DI)의 표준 문법.** 생성자 파라미터 타입으로 주입 대상을 찾음 |
| **데코레이터** `@Injectable()`, `@Get()` | `experimentalDecorators`는 표준(2023, stage 3)과 다른 옛 방식. 가능하면 꺼야 하지만 프레임워크가 요구하면 유지. 직접 만드는 비표준 데코레이터는 늘리지 말 것 | NestJS는 `experimentalDecorators` + `emitDecoratorMetadata`를 사용. 그 설정을 끄면 DI가 깨짐 |
| **`private` 키워드** | 타입 검사 때만 유효, 컴파일 후엔 사라져 런타임에 접근 가능. 진짜 비공개는 ES2022 `#field` | DI 필드는 관례상 `private readonly` |
| **namespace, 삼중 슬래시** | 옛 방식, 쓰지 말고 `import/export` 사용 | 쓸 일 없음 |

```ts
// (보충) 문자열 리터럴 유니온 + as const: enum 없이도 값과 타입을 함께 얻는 패턴
export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];   // 'owner' | 'admin' | 'member'
```

- `private`은 컴파일 후 사라진다. `(obj as any).secret`이나 `Object.entries(obj)`로 그대로 읽힌다. 비밀번호 해시 같은 것을 "private이니 안전하다"고 믿지 말 것. (책의 예는 `#passwordHash`로 진짜 비공개를 만드는 것이다.) 로그/직렬화 노출은 보충 설명이다.
- (보충) NestJS 프로젝트의 tsconfig에서 `experimentalDecorators`, `emitDecoratorMetadata`를 임의로 끄거나, SWC/esbuild 같은 트랜스파일러로 바꿀 때 메타데이터 지원 여부를 확인해야 한다.

> 🔗 NestJS 연결: `constructor(private readonly usersService: UsersService)` 한 줄이 "프로퍼티 선언 + 주입 + 할당"을 모두 한다. 파라미터 타입이 **클래스**여야 하는 이유는 인터페이스가 런타임에 없어서 DI 토큰으로 못 쓰기 때문이다.

> 📖 원문: Ch.9 Item 72

### 5.3 비동기 코드와 타입: 콜백 대신 `async`/`await`

**한 줄 요약:** `async` 함수는 항상 `Promise<T>`를 반환해 "반쯤 동기" 함수를 막고, 독립 작업은 `Promise.all`로 병렬화하며, reject 이유에는 타입이 없다.

- Promise는 콜백보다 **조합**이 쉽고 타입이 흘러가기 쉽다.
- `async` 함수는 항상 `Promise<T>`를 반환한다. 값이 즉시 있어도 마찬가지이며, 이 성질이 "어떤 때는 동기, 어떤 때는 비동기"인 혼란스러운 함수를 막아준다.
- 병렬 실행은 `Promise.all`, 타임아웃은 `Promise.race`로 조합한다. TypeScript가 결과 타입을 튜플로 추론해 준다.
- Promise를 반환하는 함수는 `async`로 선언한다.
- 주의: Promise의 **거부(reject) 이유(에러)는 타입이 없다.** `catch (e)`에서 좁혀서 다룬다.
- 동기 코드와 비동기 코드가 섞인 함수(캐시에 있으면 콜백을 바로 호출, 없으면 나중에 호출)는 실행 순서를 예측하기 어려운 버그를 만든다. `async` 함수는 항상 Promise를 돌려주므로 이런 "반쯤 동기" 함수를 막아 준다.

```ts
async function loadDashboard(userId: string) {
  const [profile, invoices] = await Promise.all([
    getProfile(userId),       // Promise<Profile>
    getInvoices(userId),      // Promise<Invoice[]>
  ]);
  return { profile, invoices };   // 타입 자동 추론
}
```
- (보충) 함정: `await`를 직렬로 나열하면 독립적인 호출도 순차 실행되어 응답이 느려진다. 독립적인 일은 `Promise.all`.
- (보충) 함정: `async` 함수를 `await` 없이 호출하면 `Promise`를 버리는 것이라 예외가 유실된다. `@typescript-eslint/no-floating-promises` 규칙을 켜자.

> 🔗 NestJS 연결: 컨트롤러/서비스 메서드는 `async`로 `Promise<T>`를 반환하는 것이 기본 형태다. 예외 필터와 인터셉터가 Promise 거부를 받아 처리한다.

> 📖 원문: Ch.3 Item 27

### 5.4 제외한 것들을 한 줄로

**한 줄 요약:** 고급 타입 프로그래밍·컴파일러 튜닝·마이그레이션은 필요할 때 찾아보면 된다.

여기서 다루지 않은 것은 "필수는 아니지만 알아두면 좋은" 범위다.
- 재귀·템플릿 리터럴·조건부 타입 등 **고급 타입 프로그래밍**은 라이브러리를 만들 때가 아니면 필요 없다.
- 컴파일러 성능 튜닝, DOM 타입, JS→TS 마이그레이션, `@types` 배포는 이 스택의 신규 백엔드 개발에서 우선순위가 낮다.
- 필요한 순간이 오면 그때 찾아보면 된다. 대부분의 일상 업무는 위 코어 1~5의 절들(원래 10개 절)로 충분하다.

---

## 실무 적용

### 체크리스트

- [ ] `tsconfig.json`에 `"strict": true`를 켰고, CI에서 `tsc --noEmit`(또는 빌드)으로 타입 오류 0개를 강제한다. (→ 코어 2)
- [ ] 타입은 런타임에 사라진다는 사실을 기억하고, **외부 입력(요청/웹훅/큐/캐시)은 `unknown`으로 받아 경계에서 검증**한다. (NestJS: DTO 클래스 + `ValidationPipe`) (→ 코어 1, 5)
- [ ] `any`는 쓰지 않는다. 쓴다면 가장 좁은 범위에, 이유와 함께. 모르는 값에는 `unknown`. (→ 코어 2)
- [ ] `as` 단언과 `!`는 "검증을 이미 끝낸 곳"에만 쓰고, 필요하면 검증 함수 안으로 숨긴다. (→ 코어 2)
- [ ] 상태는 독립된 boolean/optional 필드가 아니라 **판별 유니온(Discriminated Union)** 으로 표현해 불가능한 조합을 없앤다. (구독, 결제, 초대 상태 등) (→ 코어 4)
- [ ] `null`은 경계(조회 함수 반환값)에서 한 번만 처리하고, 안쪽 코드는 non-null 객체로 유지한다. 서로 연관된 nullable 필드는 하나로 묶는다. (→ 코어 4)
- [ ] `string` 대신 리터럴 유니온(`'free' | 'pro'`)을 쓰고, `Record<Union, V>` 매핑과 `never` 완전성 검사로 케이스 누락을 컴파일 단계에서 잡는다. (→ 코어 4)
- [ ] `userId`, `tenantId` 같이 서로 바뀌면 사고가 나는 ID는 **브랜드 타입**으로 구분한다. (→ 코어 3)
- [ ] DTO/응답 타입은 `Pick`/`Partial`(NestJS `PartialType`/`PickType`/`OmitType` 등)로 원본에서 **파생**해 중복을 없애고, 민감 필드(`passwordHash`)는 응답 타입에서 제외한다. (→ 코어 3)
- [ ] 비동기는 `async`/`await`, 독립 작업은 `Promise.all`. Promise를 버리지 않도록(`no-floating-promises`) 린트를 켠다. (→ 코어 5)
- [ ] NestJS의 DI와 데코레이터가 `emitDecoratorMetadata`, 파라미터 프로퍼티, **클래스(런타임에 존재하는 값)** 에 의존한다는 것을 이해하고, 인터페이스를 DI 토큰으로 쓰지 않는다. (→ 코어 5)

### 시나리오로 확인하기

1. **상황:** 게시글 생성 API의 요청 바디를 `interface CreatePostDto { title: string; price: number }`로 선언하고 컨트롤러에서 `body as CreatePostDto`로 받았다. C++에서 수신 버퍼를 패킷 구조체로 캐스팅하던 습관 그대로다. 그런데 DB에 `price`가 `"10"`(문자열)로 저장되고, 클라이언트가 몰래 보낸 `isAdmin: true` 필드까지 저장됐다.
   **질문:** 왜 컴파일러가 막지 못했고, 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `interface`와 `as`는 컴파일 후 전부 지워지므로 런타임에는 아무 검증도 일어나지 않는다(1.2절). `as`는 변환도 검증도 아닌 "믿겠다"는 선언이다(2.3절). 또 구조적 타이핑상 여분 필드도 허용되고, 잉여 속성 검사는 리터럴에만 동작하므로 런타임 데이터에는 도움이 안 된다(3.3절). DTO를 `class` + class-validator 데코레이터로 만들고 `ValidationPipe`에 `whitelist: true`, `forbidNonWhitelisted: true`(여분 필드 제거/거부), `transform: true`(문자열 → 숫자 변환)를 켠다. Zod를 쓴다면 커스텀 Pipe로 경계에 둔다. → 코어 1, 코어 5 (5.1절)

   </details>

2. **상황:** `loadUser(tenant: string, user: string)`를 호출하는 곳 중 한 곳이 `loadUser(userId, tenantId)`로 인자 순서를 바꿔 넣었다. 컴파일은 통과했고, 운영에서 다른 테넌트의 사용자 정보가 조회됐다.
   **질문:** 어떤 성질 때문에 통과했고, 값싸게 막는 방법은?

   <details markdown="1"><summary>답 확인</summary>

   TS는 이름이 아니라 모양으로 비교하므로 둘 다 `string`이면 호환된다(3.1절). C++에서 `typedef std::string UserId;`가 구분되지 않는 것과 같다. `type Brand<T, B> = T & { readonly __brand: B }`로 `UserId`, `TenantId`를 만들고 시그니처를 `loadUser(tenant: TenantId, user: UserId)`로 바꾸면 순서 실수가 컴파일 오류가 된다. 런타임 비용이 없고, 생성 지점(`asUserId` 등)을 한 곳에 제한한다. 단 `as`로 누구나 만들 수 있으니 "강제"가 아니라 "실수 방지"다. → 코어 3 (3.7절)

   </details>

3. **상황:** 요금제에 `'team'` 플랜을, 구독 상태에 `'past_due'`를 추가했다. 테스트는 통과했는데 운영에서 `team` 플랜 사용자의 한도가 `undefined`로 계산되고, 상태 라벨이 빈칸으로 나왔다.
   **질문:** 이런 누락을 배포 전에 컴파일러가 잡게 하려면?

   <details markdown="1"><summary>답 확인</summary>

   한도 표를 `{[key: string]: V}`가 아니라 `Record<Plan, { seats: number; apiCalls: number }>`로 선언하면 `Plan`에 새 멤버를 추가하는 순간 표에서 키 누락 컴파일 오류가 난다(4.8절). 상태별 처리 `switch`의 `default`에서 `assertUnreachable(s)`(파라미터 타입 `never`)를 부르면 처리하지 않은 케이스가 있을 때 `s`가 `never`가 아니라서 오류가 난다(4.7절). C++의 `std::visit`이 처리하지 않은 대안을 컴파일 오류로 만드는 것과 같은 효과를 직접 만드는 셈이다. → 코어 4

   </details>

4. **상황:** `const user = await repo.findOne(id) as User;` 다음 줄에서 `user.email`을 읽는다. 존재하지 않는 ID로 요청이 오면 클라이언트가 404 대신 500을 받는다.
   **질문:** 무엇이 문제이고 NestJS에서는 어떻게 처리하나?

   <details markdown="1"><summary>답 확인</summary>

   `as User`가 "없을 수 있음(`User | null`)"을 숨겼다. 이런 단언이 늘어날수록 404가 500으로 바뀐다(2.3절). 존재하지 않을 수 있음은 가장 바깥(조회 함수 반환값)에서 한 번만 처리하고 안쪽은 non-null로 유지한다(4.4절). 서비스에서 `findOne` 결과가 null이면 즉시 `NotFoundException`을 던지고 이후 코드는 non-null로 다룬다. `strictNullChecks`가 켜져 있어야 이런 누락이 컴파일 오류로 드러난다(2.1절). → 코어 2, 코어 4

   </details>

5. **상황:** 가입 처리 서비스에서 환영 메일 발송 `sendWelcomeEmail(user)`(async 함수)를 C++에서 스레드를 `detach`하듯 `await` 없이 호출했다. 메일 서버가 죽었는데 아무 로그도 없이 메일만 안 갔다.
   **질문:** 왜 오류가 사라졌고, 어떻게 막나?

   <details markdown="1"><summary>답 확인</summary>

   `async` 함수를 `await` 없이 호출하면 반환된 `Promise`를 버리는 것이라 거부(예외)가 유실된다(5.3절, 보충). NestJS의 예외 필터·인터셉터도 Promise 거부를 받아야 처리할 수 있다. `await`로 기다리거나, 의도적으로 백그라운드로 돌릴 때도 `.catch()`로 처리하고, `@typescript-eslint/no-floating-promises` 규칙을 켜서 린트 단계에서 막는다. 또 Promise의 거부 이유는 타입이 없으므로 `catch (e)`의 `e`는 `unknown`으로 받아 `e instanceof Error`로 좁힌다(2.4절). → 코어 5

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
Part 1. TypeScript 타입 시스템 — 한 문장: 타입은 컴파일 후 ( ? ) "값의 집합"에 대한 정적 약속
├─ 코어 1. 타입은 컴파일 후 사라진다
│   ├─ JS의 ( ? )집합 / 타입 오류가 있어도 JS를 ( ? ) → 막으려면 ( ? ) 옵션
│   ├─ 런타임 구분 수단 3가지: ( ? ), ( ? ), ( ? )
│   └─ 건전성 함정: any, 단언, ( ? ) 인덱싱, 부정확한 .d.ts, bivariance, 파라미터 ( ? )
├─ 코어 2. 검사 스위치는 켜고, 끄는 장치는 좁게
│   ├─ tsconfig: noImplicitAny / ( ? ) / strict / 더 엄격한 ( ? )
│   ├─ any: ( ? ) 축과 ( ? ) 축으로 범위를 좁힌다, ( ? ) > @ts-ignore
│   ├─ 선언(:) vs 단언(as) — 단언은 ( ? )을 마친 값에만
│   └─ unknown / 단언은 ( ? ) 안에 숨기기
├─ 코어 3. 타입 = 값의 집합, 비교는 구조로
│   ├─ 구조적 타이핑: 이름이 아니라 ( ? ) / 타입은 ( ? ) 있다
│   ├─ never = ( ? ), unknown = ( ? ), 대입 가능 = ( ? )
│   ├─ 잉여 속성 검사가 일어나는 3곳 / type vs interface / readonly는 ( ? )
│   └─ DRY 도구: Pick, Partial, ( ? ), ( ? ) / ( ? ) 타입으로 ID 구분
├─ 코어 4. 유효한 상태만 표현한다
│   ├─ 좁히기 → 유효한 상태만 → ( ? ) 유니온 → null은 ( ? )로
│   ├─ string보다 정밀 → 특수 값 대신 ( ? ) · optional은 아껴서
│   └─ ( ? ) 완전성 검사 / ( ? )로 매핑 동기화
└─ 코어 5. 경계 검증 + NestJS 런타임 장치
    ├─ 단일 진실 원천 3방법 ( ? ) / ( ? ) / ( ? ) → 경계 설계 4단계
    ├─ enum · 파라미터 프로퍼티 · 데코레이터 · private ↔ NestJS ( ? )
    └─ async 함수는 항상 ( ? ) 반환, 독립 작업은 ( ? )
```

### 2. 인출 질문

1. "타입 검사를 통과했다"가 "런타임에도 안전하다"를 뜻하지 않는 예를 하나 들고, `val as number`로 문자열을 숫자로 바꿀 수 없는 이유를 설명해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   `const names = ['Alice','Bob']; names[2].toUpperCase()`는 타입 오류가 없지만 실행하면 TypeError가 난다. 정적 타입과 런타임 값이 어긋나기 때문이다. 또 컴파일하면 `interface`, `type`, 타입 표기는 전부 지워지므로 `as number`는 "숫자라고 믿겠다"는 선언일 뿐 실제 변환이 없다. 진짜 변환은 `Number(val)` 같은 JS 문법으로 한다. 타입 오류가 있어도 TS는 JS를 그대로 출력하므로(막으려면 `noEmitOnError`) 커밋 시점에 오류 0개를 유지한다. → 코어 1 (1.1, 1.2절)

   </details>

2. 런타임에 값의 타입을 구분하려면 무엇을 써야 하나요? 이것이 NestJS `ValidationPipe`와 어떻게 연결되나요?

   <details markdown="1"><summary>답 확인</summary>

   런타임에도 남는 것을 써야 한다. `'height' in shape` 같은 프로퍼티 존재 확인, `shape.kind === 'rectangle'` 같은 꼬리표 프로퍼티, 그리고 타입과 값(생성자)을 둘 다 만드는 `class`(`instanceof` 가능)다. 타입이 지워지므로 NestJS는 클래스(값으로 남는 것) + 데코레이터 메타데이터로 런타임 검증을 한다. 그래서 DTO는 `interface`가 아니라 `class`로 쓴다. → 코어 1 (1.2절), 3.4절

   </details>

3. `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`는 각각 무엇을 하며, 끄면 SaaS에서 어떤 사고가 나나요?

   <details markdown="1"><summary>답 확인</summary>

   `noImplicitAny`는 타입을 못 정한 변수/파라미터를 오류로 표시한다(끄면 조용히 `any`가 되어 검사가 무력화). `strictNullChecks`는 `null`/`undefined`를 다른 타입과 분리한다(끄면 "사용자를 못 찾았을 때"의 `undefined`가 경고 없이 흘러가 인증·권한·과금 로직에서 보안·정산 사고가 된다). `noUncheckedIndexedAccess`는 strict보다 더 엄격한 옵션으로 `arr[3]`, `obj[key]`를 `T | undefined`로 취급한다. 새 프로젝트는 처음부터 `"strict": true`로 시작하고, 설정은 `tsconfig.json`으로 팀이 공유한다. → 코어 2 (2.1절)

   </details>

4. 구조적 타이핑의 장점 하나와 위험 두 가지를 말해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   장점: 인터페이스를 좁게 정의하면 진짜 DB 클라이언트 대신 모양만 맞는 가짜 객체를 넘길 수 있어 테스트가 쉽다(NestJS `useValue: { findById: jest.fn() }`). 위험: ① 타입이 열려 있어 `{x, y}`를 요구해도 `{x, y, z}`가 들어오므로 `Object.keys`로 순회하면 뜻밖의 키가 섞인다. ② 클래스도 구조적으로 비교되므로 생성자 검증이 "무조건 실행됐다"고 가정할 수 없다. ③ `userId`와 `tenantId`처럼 모양이 같은 값이 서로 바뀌어도 통과한다(해결: 브랜드 타입). → 코어 3 (3.1절)

   </details>

5. 타입을 "값의 집합"으로 보면 `never`, `unknown`, `A | B`, `A & B`는 각각 무엇이며, 오류 메시지 "not assignable"은 어떻게 읽나요?

   <details markdown="1"><summary>답 확인</summary>

   `never`는 공집합(bottom), `unknown`은 전체집합(top), `A | B`는 합집합, `A & B`는 교집합이다. "대입 가능(assignable)" = "부분집합"이며 `extends`도 같은 뜻이므로, "not assignable"은 "부분집합이 아니다"로 읽는다. 예: `'A' | 'B'`는 `'A' | 'B' | 12`에 대입되지만 반대는 12 때문에 안 된다. 또 `keyof (A | B) = keyof A & keyof B`라서 유니온에서는 모든 멤버가 확실히 갖는 키만 안전하게 접근할 수 있다. → 코어 3 (3.2절)

   </details>

6. `any`를 꼭 써야 할 때 범위를 "시간"과 "공간" 두 축으로 좁히는 방법은? 한 줄만 끄려면 무엇이 더 나은가요?

   <details markdown="1"><summary>답 확인</summary>

   시간 축: 변수 전체를 `any`로 선언하지 말고 문제 되는 표현식에만 `as any`를 붙인다(`eatSalad(pizza as any)`). 함수 파라미터나 반환값을 `any`로 두지 않는다(호출하는 쪽 전체로 퍼진다). 공간 축: 객체 리터럴 전체가 아니라 오류 난 프로퍼티 값에만 `as any`를 붙인다. 한 줄만 끄려면 `@ts-expect-error`가 `@ts-ignore`보다 낫다. 나중에 오류가 사라지면 TypeScript가 알려 주기 때문이다. `any`는 전염되고(`JSON.parse()`, `response.json()`이 대표 유입 경로), 언어 서비스를 없애고, 리팩터링 버그를 숨긴다. → 코어 2 (2.2절)

   </details>

7. 타입 선언(`:`)과 타입 단언(`as`)의 차이는? 단언이 정당한 경우와 그때 할 일은?

   <details markdown="1"><summary>답 확인</summary>

   선언은 컴파일러가 값이 타입에 맞는지 검증하고, 단언은 "내가 책임질게"라며 검사를 생략한다(`{} as Person`이 `name` 없이 통과). `!`(non-null 단언)도 같은 부류다. 단언이 정당한 경우는 "TypeScript보다 내가 더 잘 아는 경우"(이미 검증을 마친 값)뿐이고, 그때는 왜 유효한지 주석을 남긴다. 단언은 잉여 속성 검사도 없애므로 선언을 선호한다. `as const`는 단언처럼 보여도 타입을 더 정확히 만드는 안전한 문법이다. SaaS에서 `findOne(...) as User`는 "없을 수 있음"을 숨겨 404를 500으로 바꾼다. → 코어 2 (2.3절)

   </details>

8. 잉여 속성 검사는 어디서 일어나나요? `const tmp = {...}; const b: Options = tmp;`는 왜 오타가 있어도 통과하나요?

   <details markdown="1"><summary>답 확인</summary>

   객체 리터럴을 직접 쓸 때만 일어난다: ① 선언된 타입이 있는 변수에 리터럴 대입, ② 함수 인자로 리터럴 전달, ③ 선언된 반환 타입의 리터럴 반환. 이는 구조적 호환성 검사와 별개의 추가 검사("신선도")로, 옵션 객체의 오타를 잡는 용도다. `tmp`를 거치면 리터럴이 아니므로 이 검사가 없고, 구조적으로는 여분 프로퍼티가 허용되므로 통과한다(`as Options`도 검사를 없앤다). 모든 프로퍼티가 optional인 weak type은 공통 프로퍼티가 하나도 없으면 리터럴이 아니어도 오류다. 요청 바디 같은 런타임 데이터에는 도움이 안 된다. → 코어 3 (3.3절)

   </details>

9. `type`과 `interface`의 차이 3가지와 책의 권고는?

   <details markdown="1"><summary>답 확인</summary>

   ① 유니온, 튜플, 조건부/매핑 타입은 `type`만 가능하다. ② 같은 이름으로 재선언하면 `interface`는 병합(declaration merging)되고 `type`은 오류다. ③ 확장 시 `interface extends`는 충돌을 오류로 알려 주지만, `type`의 `&`는 오류 없이 쓸 수 없는 타입(예: `string & number`)을 만든다. 권고: 새 코드에서는 가능하면 `interface`, 유니온이 필요하거나 함수 타입처럼 `type`이 더 깔끔할 때만 `type`, 기존 팀 스타일이 있으면 일관성을 따른다. `I`/`T` 접두사는 붙이지 않는다. `class`는 둘과 달리 값까지 만든다. → 코어 3 (3.4절)

   </details>

10. `readonly`를 파라미터에 붙이면 무엇을 얻고, 주의할 점 두 가지는? `const`와는 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    얻는 것: ① 본문에서 변경하면 오류(`arr.pop()` 불가), ② 호출자에게 "안 바꾼다"는 약속을 알림, ③ 호출자가 readonly 값도 넘길 수 있음(가변 `T[]`는 `readonly T[]`에 대입되지만 반대는 불가). 주의: ① `readonly`/`Readonly<T>`는 얕다 — `obj.inner.x = 1`은 통과한다. ② 프로퍼티에만 영향을 줘서 `Readonly<Date>`도 `setFullYear()`로 바뀐다. `const`는 재할당을 막고 `readonly`는 내부 변경을 막는다. SaaS에서는 요청 간 공유되는 설정·캐시·플랜 표를 몰래 바꿔 다른 테넌트에 영향을 주는 사고를 줄인다. → 코어 3 (3.5절)

    </details>

11. 타입 중복을 없애는 도구를 3개 이상 대고, DRY를 과하게 적용하면 왜 안 되는지 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    타입에 이름 붙이기, `extends`/`&`, 인덱싱(`State['userId']`), `keyof`, 매핑 타입(`{[K in keyof T]?: T[K]}`), `typeof`, `ReturnType`, 표준 제네릭 `Pick`, `Partial`, `Readonly`가 있다. 생성 입력 → 수정 입력(`Partial`) → 응답(`Pick`)을 원본 하나에서 파생하면 컬럼 추가 시 DTO들이 어긋나지 않는다(NestJS `PartialType`, `PickType`, `OmitType`은 검증 메타데이터까지 포함한 런타임 버전). 하지만 `Product.id`와 `Customer.id`가 우연히 같은 모양이라고 묶으면 나중에 서로 다르게 바뀔 때 발목을 잡는다. "이름 붙이기 어렵다면 좋은 추상화가 아닐 수 있다." → 코어 3 (3.6절)

    </details>

12. 타입 좁히기(narrowing) 도구를 4개 이상 대고, 흔한 함정 세 가지를 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    도구: 조건 + `throw`/`return`, `instanceof`, `'key' in obj`, `Array.isArray`, 꼬리표 프로퍼티 비교, 사용자 정의 타입 가드(`el is HTMLInputElement`). 함정: ① `typeof x === 'object'`는 `null`도 통과한다. ② `if (!x)`는 `''`, `0`도 걸러 버린다. ③ 콜백 안에서는 좁히기가 풀린다(값이 나중에 바뀔 수 있으므로) — 지역 `const`로 꺼내 쓴다. 또 사용자 정의 타입 가드는 본문을 컴파일러가 확인하지 않으므로 단언과 같은 수준의 약속이다. → 코어 4 (4.1절)

    </details>

13. 구독 상태를 `status`, `canceledAt?`, `trialEndsAt?` 독립 필드로 두면 무엇이 문제이고, 판별 유니온은 어떻게 해결하나요? 꼬리표는 1.2절의 문제를 어떻게 푸나요?

    <details markdown="1"><summary>답 확인</summary>

    독립 필드는 "canceled인데 canceledAt이 null" 같은 의미 없는 조합(깨진 데이터)을 표현할 수 있게 만든다. 판별 유니온(`{status:'trialing'; trialEndsAt} | {status:'active'; currentPeriodEnd} | {status:'canceled'; canceledAt}`)은 상태별로 필요한 필드를 묶어 "불가능한 조합"이 아예 존재하지 않게 하므로 처리 코드가 단순해진다. 꼬리표(`status`, `type`, `kind`)는 런타임에 존재하는 값이라 `switch`로 좁힐 수 있어, 타입이 지워지는 문제도 해결한다. 같이 있어야 하는 optional 필드 두 개는 하나의 객체로 묶는다. → 코어 4 (4.2, 4.3절)

    </details>

14. "`null`은 경계로 밀어내라"는 무슨 뜻인가요? 특수 값 `-1`을 쓰면 왜 위험한가요?

    <details markdown="1"><summary>답 확인</summary>

    타입 별칭에 `null`을 섞지 말고(사용 지점에서 `User | null`로 드러냄), "같이 null이거나 같이 아닌" 값은 하나로 묶는다(`[number, number] | null`). 클래스는 필요한 데이터를 모두 준비한 뒤 생성한다(`static async load()`). 존재하지 않을 수 있음은 가장 바깥(조회 함수 반환값)에서 한 번만 처리하고(NestJS: 즉시 `NotFoundException`) 안쪽은 non-null로 유지한다. `-1`, `0`, `""` 같은 특수 값은 정상 값과 같은 타입이라 TS가 구별 못 한다(`indexOf`의 `-1`이 `slice`에 흘러감, 가격 `-1`로 환급 사고). `number | null`로 분리하면 처리를 강제당한다. → 코어 4 (4.4, 4.6절)

    </details>

15. 선택적 프로퍼티(`?`)를 남발하면 어떤 비용이 있고, 옛 데이터와 호환해야 할 때는 어떤 패턴을 쓰나요?

    <details markdown="1"><summary>답 확인</summary>

    새 필드를 optional로 추가하면 전달을 빠뜨린 호출이 컴파일 오류 없이 지나간다(책의 예: `unitSystem?` 누락으로 미터법과 야드법이 섞임). 기본값이 주석으로만 있으면 `?? 'imperial'`이 곳곳에 흩어지고, optional이 N개면 조합이 2ᴺ개가 된다. 호환이 필요하면 타입을 둘로 나눈다: 정규화 전 입력 타입(optional) → `normalize()` 한 곳에서 기본값을 채움 → 정규화 후 타입(필수). 정말 없을 수 있는 값이나 외부 API 서술에는 optional이 적절하다. → 코어 4 (4.6절)

    </details>

16. `any`와 `unknown`의 차이를 표로 말해 보고, 위험한 단언은 어디에 두어야 하는지 설명해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    `any`는 아무 타입에 대입되고 프로퍼티 접근·호출도 되며 안전성이 없다. `unknown`은 대입·접근·호출이 모두 불가하고, `instanceof`, 사용자 정의 타입 가드, 또는 책임지는 단언으로 좁힌 뒤에만 쓸 수 있다. 외부 값(요청 바디, 웹훅, 큐 메시지, 캐시 값, `catch (e)`)은 `unknown`으로 다룬다. 어쩔 수 없는 단언은 함수 시그니처를 망치지 말고 "잘 타입된 함수" 본문 안에 숨긴다(`parseCreateComment(body: unknown): CreateComment` 안에서 검증 후 반환). 검토 지점이 줄고 검증을 점점 강화하기 쉽다. `function f<T>(): T`처럼 반환에만 쓰는 타입 파라미터는 단언과 같으니 피한다. → 코어 2 (2.4, 2.5절)

    </details>

17. TypeScript가 "거짓말하는" 건전성 함정을 세 가지 이상 들어 보세요.

    <details markdown="1"><summary>답 확인</summary>

    `any`, 타입 단언(`as`, `is`), 배열/객체 인덱싱(`xs[3]`이 `number`로 추론되지만 실제는 `undefined`), 부정확한 `.d.ts`, 클래스 메서드 파라미터의 bivariance, 파라미터 변경(`Hen[]`을 `Animal[]` 받는 함수에 넘겨 다른 동물을 `push`), 함수 호출이 좁히기를 무효화하지 않음, 열린 객체 타입 + optional 프로퍼티 충돌. 핵심 태도: "타입이 맞다"는 "런타임에도 맞다"를 보장하지 않으므로 경계(입출력)에서 확인하고 안쪽에서는 타입을 신뢰한다. → 코어 1 (1.3절)

    </details>

18. `never`를 이용한 완전성 검사와 `Record<Plan, ...>` 매핑 표는 각각 어떤 누락을 컴파일 단계에서 잡나요?

    <details markdown="1"><summary>답 확인</summary>

    완전성 검사: `switch`의 `default`에서 `assertUnreachable(s)`(파라미터 타입 `never`)를 부르면, 판별 유니온에 새 케이스가 추가됐는데 처리를 빼먹었을 때 `s`가 `never`가 아니라서 오류가 난다. 런타임에 `throw`하는 것은 JS나 `any`를 거쳐 예상 밖 값이 들어올 수 있기 때문이다. `Record<Union, V>`는 모든 키가 반드시 있어야 하므로, 새 `Plan`을 추가하고 `PLAN_LIMITS`에 빼먹거나 키를 지우거나 이름을 바꾸면 오류가 난다. `{[key: string]: V}`나 배열로는 이 강제가 없다. → 코어 4 (4.7, 4.8절)

    </details>

19. 브랜드 타입은 어떻게 동작하고, 한계는 무엇인가요?

    <details markdown="1"><summary>답 확인</summary>

    `type Brand<T, B> = T & { readonly __brand: B }`로 `UserId`, `TenantId`를 만들면 구조적으로 같은 `string`이라도 서로 대입되지 않아 `loadUser(userId, tenantId)` 같은 순서 실수가 컴파일 오류가 된다. 타입에만 존재해 런타임 비용이 없고, 원시 타입에도 붙일 수 있으며, 생성 지점(검증을 통과한 곳)을 한정하면 "검증된 값"의 증거가 된다(`AbsolutePath`, `SortedList`). 한계: `as`로 누구나 만들 수 있으므로 "강제"가 아니라 "실수 방지"이고, 숫자 브랜드는 곱셈·나눗셈 후 `number`로 돌아간다. 멀티테넌트에서 ID 혼동은 곧 데이터 유출이므로 값싼 방어선이다. → 코어 3 (3.7절)

    </details>

20. 책은 enum, 파라미터 프로퍼티, `experimentalDecorators`, `private`을 피하라고 하는데 NestJS는 왜 일부를 전제로 하나요? 그리고 외부 입력의 "단일 진실 원천"을 만드는 3가지 방법과 선택 기준은?

    <details markdown="1"><summary>답 확인</summary>

    `constructor(private readonly usersService: UsersService)`는 프로퍼티 선언 + 주입 + 할당을 한 줄로 하는 NestJS DI의 표준 문법이고, DI는 `experimentalDecorators` + `emitDecoratorMetadata`로 생성자 파라미터 타입(런타임에 존재하는 **클래스**)을 읽어 주입 대상을 찾는다. 이 설정을 끄면 DI가 깨지고, 인터페이스는 DI 토큰이 될 수 없다. `private`은 컴파일 후 사라지므로 진짜 비공개는 `#field`다. enum 대신 리터럴 유니온(`as const` 배열)을 선호한다. 단일 진실 원천: ① 다른 스펙(OpenAPI 등)에서 타입 생성 — 스펙이 있으면 최우선, ② Zod 같은 런타임 라이브러리로 스키마를 정의하고 `z.infer`로 타입 파생 — 빌드 단계 없음, ③ TS 타입에서 JSON Schema 생성 — 외부 TS 타입을 참조해야 하면 유리. NestJS의 class-validator + `ValidationPipe`(`whitelist`, `forbidNonWhitelisted`, `transform`)는 ②를 클래스 기반으로 구현한 것이다. → 코어 5 (5.1, 5.2절)

    </details>

21. C++ 템플릿과 TS 제네릭, C++ RTTI와 TS 타입 소멸을 비교해 보세요. `function f<T>(): T`가 왜 단언과 같은지도 설명해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    C++ 템플릿은 사용된 타입마다 코드를 인스턴스화(생성)하고 특수화로 동작을 바꿀 수 있으며, 다형 클래스는 vtable/RTTI가 남아 `dynamic_cast`가 가능하다. TS 제네릭은 컴파일 타임 검사에만 쓰이고 지워지므로 JS 코드는 한 벌이며, 런타임에 `T`가 무엇인지 알 수 없다. 그래서 반환에만 `T`를 쓰는 함수는 실제로 `T`를 만들어 낼 근거 없이 호출자가 고른 타입을 "믿어라"라고 돌려주는 것이라 단언과 같다(2.4절). 런타임에 남는 것은 `class`(JS 생성자), `in`, 꼬리표 값뿐이다(1.2절). → 코어 1, 코어 2

    </details>

### 3. 기억 고리

- **C++ 유추 — RTTI vs 타입 소멸:** C++ 다형 클래스는 `dynamic_cast`로 런타임에 타입을 묻지만, TS는 `class`만 런타임에 남는다. ⚠️ 깨지는 곳: TS `class`의 `instanceof`도 구조적 타이핑 때문에 "타입 검사를 통과한 값 = 그 클래스 인스턴스"를 보장하지 않는다(모양만 같은 리터럴이 통과).
- **C++ 유추 — `static_cast` vs `as`:** 둘 다 "이 타입으로 보라"는 지시. ⚠️ 깨지는 곳: `static_cast<int>(3.7)`은 변환 코드를 만들지만 `as`는 코드를 하나도 만들지 않는다.
- **C++ 유추 — strong typedef vs 브랜드:** `struct UserId { std::string v; };`처럼 래퍼를 만들면 C++에서도 섞이지 않는다. ⚠️ 깨지는 곳: 브랜드는 래퍼 객체가 없고(zero cost) `as`로 누구나 만들 수 있어 "강제"가 아니라 "실수 방지"다.
- **C++ 유추 — `const` 정확성 vs `readonly`:** 둘 다 "안 바꾼다"는 계약을 시그니처에 적는다. ⚠️ 깨지는 곳: `readonly`는 얕고(중첩 객체는 변경 가능) 프로퍼티에만 걸려서 `Readonly<Date>`도 `setFullYear()`가 된다. C++처럼 const 멤버 함수만 호출하게 막지 않는다.
- **C++ 유추 — `private`:** C++ `private`도 컴파일 타임 접근 제어라는 점은 같다. ⚠️ 깨지는 곳: TS `private` 필드는 런타임에 일반 프로퍼티라 `Object.entries(obj)`로 그대로 읽힌다. 진짜 비공개는 `#field`.
- **비유:** 타입 = 설계도의 치수 표기. 건물이 완공되면(컴파일) 표기는 남지 않으므로, 현장에 들어오는 자재(요청 바디)는 입구에서 검수(`ValidationPipe`, Zod)해야 한다. ⚠️ 비유가 깨지는 지점: `class`는 예외로 런타임에 값(생성자)이 남고, 꼬리표 프로퍼티처럼 "값으로 넣어 둔 표기"도 남는다.
- **비유:** 판별 유니온 = 상태별로 서식이 다른 신청서. "해지" 서식에는 해지일 칸이 필수라 빈칸으로 낼 수 없다. ⚠️ 비유가 깨지는 지점: 외부에서 들어온 JSON은 서식을 지켰다는 보장이 없으므로 여전히 런타임 검증이 필요하다.
- **묶음(3의 법칙):** ① 런타임에 남는 3가지 — `in`, 꼬리표 값, `class`. ② 검사를 끄는 3형제 — `any`, `as`(+`!`), 타입 가드 `is`(기준: 컴파일러가 검증하지 않는 약속). ③ 누락을 컴파일 오류로 바꾸는 3도구 — 판별 유니온, `never` 완전성 검사, `Record<Union, V>`.
- **대칭·순서:** `any` ↔ `unknown`(검사를 끄는 top vs 검사를 강제하는 top) / 선언 `:` ↔ 단언 `as` / `interface extends`(충돌 시 오류) ↔ `type &`(쓸 수 없는 타입) / `const`(재할당) ↔ `readonly`(내부 변경). 경계 설계 순서: `unknown`으로 받기 → 경계에서 한 번 검증 → 정확한 타입으로 전달 → 안쪽은 신뢰.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "왜 NestJS DTO는 `interface`가 아니라 `class`여야 하고, 그래도 `ValidationPipe`가 필요한가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "패킷 구조체에 `reinterpret_cast` 하던 습관으로 `req.body as Dto`를 쓰면 왜 더 위험한가"를 RTTI·구조적 타이핑·타입 소멸 세 단어로 설명해 보세요.
- **랜덤 논리 게임:** A "검증 스키마는 Zod 같은 런타임 라이브러리로 정의하고 타입을 파생해야 한다" vs B "기존 TS 타입을 진실 원천으로 두고 JSON Schema를 생성해야 한다" — 빌드 단계, 정의 문법, 외부 타입 참조 측면에서 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 `any`/`unknown`, 타입 선언/단언, 판별 유니온을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 5줄을 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
