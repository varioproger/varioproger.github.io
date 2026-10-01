---
title: "Part 1. TypeScript 타입 시스템 (NestJS의 언어)"
parent: "NestJS SaaS 백엔드 필수 이론"
nav_order: 1
---

# Part 1. TypeScript 타입 시스템 (NestJS의 언어) (출처: Effective TypeScript)

NestJS는 TypeScript로 만든 프레임워크다. DTO, Entity, Provider, Guard 모두 "타입"이 뼈대다.
이 부에서는 타입 문법 자체보다 **"타입이 무엇을 보장하고 무엇을 보장하지 않는가"** 를 정리한다.
이 경계를 알아야 SaaS 백엔드에서 "타입은 맞는데 런타임에 터지는" 사고를 막을 수 있다.

> 💡 보충(원서 외): 각 절의 **"SaaS 관점"** 과 **"🔗 NestJS 연결"** 문단, 그리고 `Subscription`/`PLAN_LIMITS`/`UserRepo`/`Brand<UserId>`/Zod 스키마처럼 SaaS 도메인으로 바꿔 쓴 예시 코드는 원서(Effective TypeScript)에 없는 이 문서의 적용·보충이다. 원서 내용은 `📖 원문` 표기가 붙은 개념·규칙이다.

---

### 1. TypeScript는 어떤 언어인가

#### 1.1 JavaScript 위에 얹은 타입 층
- TypeScript는 JavaScript의 **상위집합(Superset)** 이다. 모든 JS 프로그램은 문법상 유효한 TS 프로그램이다. (반대는 아님: 타입 표기 같은 TS 문법은 JS가 아니다.)
- 다만 "타입 검사를 통과하는 프로그램"은 그중 일부일 뿐이다. 실무에서 TS를 쓴다는 것은 이 **검사를 통과하는 코드를 유지한다**는 뜻이다.
- 타입 시스템의 기준은 **"JS가 런타임에 실제로 하는 일을 모델링"** 하는 것이다. 예를 들어 `'2' + 3`은 JS에서 문자열 `"23"`이 되므로 TS도 허용한다.
- 그러면서도 "합법이지만 의심스러운 코드"는 막는다. `null + 7`, `[] + 12`, 인자 개수가 틀린 함수 호출은 JS에선 예외 없이 돌지만 TS는 오류로 표시한다.
- **타입 검사를 통과해도 런타임에 터질 수 있다.** TS는 의도적으로 완전히 "건전(sound)"하지 않다.
  ```ts
  const names = ['Alice', 'Bob'];
  names[2].toUpperCase();   // 타입 오류 없음 → 실행하면 TypeError
  ```
  원인은 정적 타입(컴파일러가 아는 타입)과 실제 런타임 타입이 어긋나는 것이다. `any`를 쓸 때도 자주 발생한다.
- 타입 표기는 컴파일러에게 **의도를 알려 주는 것**이다. 정보를 줄수록 더 많은 오류(예: `capitol` 오타)를 잡아 준다.

- 타입 오류가 있어도 TS는 JS 코드를 **그대로 만들어 낸다.** 오류는 C/Java의 컴파일 실패가 아니라 "경고"에 가깝다. 그래서 커밋 시점에 오류 0개를 유지하는 습관이 필요하고, 출력을 막고 싶으면 `noEmitOnError` 옵션을 쓴다. (Item 3)

**SaaS 관점**: "TS로 짰으니 안전하다"가 아니라 "TS가 잡아 주는 범위와 못 잡는 범위를 안다"가 출발점이다. (보충) 타입 검사는 CI에서 통과를 강제해야 의미가 있다.

> 📖 원문: Ch.1 Item 1, Item 3 (일부)

#### 1.2 타입은 런타임에 사라진다 (가장 중요한 사실)
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
- **꼬리표(tag) 프로퍼티**: `shape.kind === 'rectangle'` (판별 유니온, 4장에서 자세히)
- `class`: 타입과 값(생성자)을 **둘 다** 만들기 때문에 `instanceof`가 가능

**SaaS 관점**: HTTP 요청 바디는 밖에서 들어오는 "그냥 JSON"이다. 컴파일된 코드는 `CreateUserDto`가 뭔지 모른다.
"타입을 선언했으니 안전하다"는 착각이 잘못된 데이터가 DB까지 가는 사고의 시작이다. (10장에서 해결책 정리)

> 🔗 NestJS 연결: `ValidationPipe`가 존재하는 이유가 바로 이것이다. 타입이 지워지므로, 클래스(값으로 남는 것) + 데코레이터 메타데이터로 런타임 검증을 한다.

> 📖 원문: Ch.1 Item 3

---

### 2. 컴파일러 설정: tsconfig의 strict

#### 2.1 세 가지 핵심 옵션
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
- `!`(non-null 단언)로 null을 지울 수도 있지만 런타임 예외 위험이 있다. 조건문으로 좁히는 편이 안전하다(5.1절).
- `noUncheckedIndexedAccess`는 "strict보다 더 엄격"한 옵션이다. `arr[3]`이나 `obj[key]`를 `T | undefined`로 취급한다.
  편의성은 떨어지지만 배열/맵 조회 실수를 잡아준다. 존재를 알고 팀이 선택하자.
- 오류가 재현이 안 되면 **옵션 차이**를 먼저 의심한다. 팀이 같은 tsconfig를 쓰는지 확인.

**SaaS 관점**: `strictNullChecks`가 꺼진 코드베이스에서는 "사용자를 못 찾았을 때"의 `undefined`가 아무 경고 없이 흘러간다.
인증/권한/과금 로직에서 이런 실수는 곧 보안·정산 사고다.

> 🔗 NestJS 연결: `nest new`가 만든 기본 tsconfig는 strict 계열이 일부만 켜져 있는 경우가 많다. 프로젝트 시작 시 `strict: true`로 올려두자.

> 📖 원문: Ch.1 Item 2

---

### 3. 타입 시스템의 기본 개념

#### 3.1 구조적 타이핑(Structural Typing)
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
  - 생성자 검증이 "무조건 실행됐다"고 가정하면 안 된다. (Java/C#과 다른 점)
- 장점: 인터페이스를 **좁게** 정의하면 테스트가 쉬워진다. 진짜 DB 클라이언트 대신 `{ runQuery() {...} }` 같은 가짜 객체를 넘기면 된다.

```ts
// (보충) 원서 예시(getAuthors의 DB 인터페이스)를 바꾼 것
interface UserRepo { findById(id: string): Promise<User | null> }
// 실제 구현체가 이 모양만 만족하면 서비스는 UserRepo에만 의존 → 테스트에서 가짜 객체 주입 가능
```

**SaaS 관점**: "모양이 같으면 같은 타입"이라서 `userId`와 `tenantId`(둘 다 string)를 바꿔 넣어도 컴파일이 통과한다. 해결책은 7장의 브랜드 타입이다.

> 🔗 NestJS 연결: Provider를 인터페이스 모양으로 의존하고 테스트에서 `useValue: { findById: jest.fn() }`로 교체하는 방식이 구조적 타이핑 덕분에 가능하다. (단, 인터페이스는 런타임에 없으므로 DI 토큰은 클래스나 문자열/Symbol을 쓴다.)

> 📖 원문: Ch.1 Item 4

#### 3.2 타입은 "값의 집합"이다
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
- 값이 변할 수 있으면 이 사고법이 흔들린다. 불변 값으로 생각할 때 타입 검사가 가장 효과적이다(4.4절).

> 📖 원문: Ch.2 Item 7

#### 3.3 `any`: 안전망을 끄는 스위치
`any`는 타입 검사를 끈다. 어디로든 대입되고 무엇이든 받는다.

- 계약이 깨진다: `calculateAge(birthDate: Date)`에 `any`로 문자열을 넘겨도 통과.
- 자동완성/이름 바꾸기(rename) 같은 **언어 서비스가 사라진다.**
- **리팩터링 때 버그를 숨긴다.** 콜백 파라미터를 `any`로 두면, 나중에 호출 쪽 시그니처를 바꿔도 타입 검사를 통과한 채 런타임에 터진다.
- 타입 설계 자체를 숨기고, 타입 시스템에 대한 팀의 신뢰를 깎는다.
- **전염된다.** 함수가 `any`를 반환하면 그 값을 쓰는 모든 곳으로 `any`가 퍼진다. `JSON.parse()`, `response.json()`처럼 `any`를 돌려주는 표준 API가 대표적인 유입 경로다. (`req.body`도 프레임워크에 따라 비슷하다. — 보충)

지침:
- 쓴다면 **범위를 가장 좁게**, 이유를 주석으로. (Item 43, 45)
- 함수 반환값을 `any`로 두지 않는다. (호출자 전체로 퍼진다)
- 모르는 값에는 `any` 대신 **`unknown`** (6장).
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

---

### 4. 타입 선언과 단언, 그리고 `type` vs `interface`

#### 4.1 타입 단언(`as`)보다 타입 선언(`:`)
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

**SaaS 관점**: `const user = await repo.findOne(...) as User;` 같은 코드는 "없을 수 있음"을 숨긴다. 이런 단언이 늘어날수록 404가 500으로 바뀐다.

> 📖 원문: Ch.2 Item 9

#### 4.2 잉여 속성 검사(Excess Property Checking)와 타입 검사는 다른 것
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
- `as`를 쓰면 이 검사가 사라진다. 타입 선언(`:`)을 단언보다 선호하는 이유 중 하나다.

**SaaS 관점**: 설정/옵션 객체(`{ retries: 3, timeuot: 1000 }`)의 오타는 조용히 기본값으로 동작하는 버그가 된다. 이 검사는 그것을 리터럴일 때 잡아 준다. 단, 요청 바디처럼 런타임에 들어온 데이터에는 아무 도움이 안 된다(10장).

> 📖 원문: Ch.2 Item 11

#### 4.3 `type` vs `interface`
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

#### 4.4 `readonly`로 우발적 변경(Mutation) 막기
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

#### 4.5 타입 연산과 제네릭으로 중복 제거 (DRY)
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

---

### 5. 유니온, 좁히기, 그리고 유효한 상태만 표현하기

이 장이 이 책의 핵심이다. 타입 설계를 잘하면 코드가 단순해지고 버그의 상당수가 사라진다.

#### 5.1 타입 좁히기(Narrowing)
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
- **꼬리표(tag) 프로퍼티** 비교 (`e.type === 'upload'`): 판별 유니온 (5.3절)
- 사용자 정의 타입 가드: `function isInput(el: Element): el is HTMLInputElement`

함정:
- `typeof x === 'object'`는 `null`도 통과한다 (`typeof null`이 `"object"`). null 제거용으로 쓰면 안 된다.
- `if (!x)`로 좁히면 `''`, `0`도 함께 걸려서 원하는 결과가 아닐 수 있다. `x === undefined` / `x == null`처럼 정확히 확인한다.
- **콜백 안에서는 좁히기가 풀린다.** 바깥에서 값이 나중에 바뀔 수 있기 때문이다 (`setTimeout(() => obj.value.toFixed())`). 값을 지역 `const`로 꺼내 쓰면 해결된다.
- 컴파일러가 관계를 못 따라가면 `as`로 덮기 전에 코드를 살짝 바꿔 본다. 예: `map.has(k)` 후 `map.get(k)!` 대신 `const v = map.get(k) ?? fallback`.
- 사용자 정의 타입 가드(`v is User`)는 **본문 검증을 컴파일러가 확인하지 않는다.** 단언과 같은 수준의 약속이다.

> 📖 원문: Ch.3 Item 22

#### 5.2 항상 유효한 상태만 표현하는 타입
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

#### 5.3 유니온을 가진 인터페이스 대신 인터페이스의 유니온 (판별 유니온)
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

#### 5.4 `null`은 경계로 밀어내라
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

#### 5.5 `string`보다 정밀한 타입
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
- enum 대신 리터럴 유니온을 권한다 (9장 참고).
- 객체의 키 이름을 받는 함수는 `string` 대신 **`keyof T`** 를 쓴다. 더 정확히는 `<T, K extends keyof T>(obj: T, key: K): T[K]`로 반환 타입까지 정확해진다.
- 값이 외부에서 들어오면 런타임 검증이 별도로 필요하다(10장).

> 📖 원문: Ch.4 Item 35

#### 5.6 특수 값에는 별도 타입, 선택적 프로퍼티는 아껴 쓰기
**특수 값(Special Values)**: `-1`, `0`, `""` 같은 "정상 값 자리에 섞인 실패/없음 표시"는 타입 검사를 무력화한다.
- 책의 예: `indexOf`는 못 찾으면 `-1`을 반환한다. 이 값이 `slice(0, -1)` 같은 곳에 흘러가면 뒤에서부터 세는 엉뚱한 동작을 한다. 타입은 둘 다 `number`라서 TS가 구별하지 못한다.
- 상품 가격을 "모르면 `-1`"로 두었다가 고객 카드에 **돈이 환급**된 사고 시나리오도 나온다.
- 해결: 특수 상황을 다른 타입으로 분리한다. `number | null`로 바꾸면 컴파일러가 "null 처리 안 했다"고 알려 준다.
- `-1` 같은 값을 쓰는 것은 `strictNullChecks`를 끄는 것과 비슷한 "비엄격 구멍"이다.
- `null`/`undefined`의 의미가 애매하면(예: null = 에러, undefined = 로딩) 판별 유니온(5.2절)으로 명시한다.

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
- optional이 N개면 조합은 2ᴺ개다. 서로 배타적인 옵션이면 상태 타입으로 모델링한다(5.2절).
- 정말 없을 수 있는 값(예: 미들네임)이나 외부 API 서술에는 optional이 적절하다.

**SaaS 관점**: 요금/할인/한도 같은 금액·수량에 `-1`, `0`을 "없음"으로 쓰면 정산 사고로 이어진다. 또 옵션 필드의 기본값은 한 곳에서만 채우자.

> 📖 원문: Ch.4 Item 36, 37

---

### 6. `unknown`과 안전한 단언

#### 6.1 `any` 대신 `unknown`
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

#### 6.2 위험한 단언은 "잘 타입된 함수" 안에 숨기기
어쩔 수 없이 `as`나 `any`를 써야 한다면, 구현을 안전하게 만들려고 **함수 시그니처를 망치지 말고** 단언을 함수 본문 안에 숨긴다. 시그니처는 사용자에게 보이는 공개 API이고 구현은 감춰진 세부 사항이기 때문이다. 시그니처를 `unknown` 반환으로 바꿔 버리면 호출하는 곳마다 단언이 흩어진다. 단언이 들어간 함수는 특히 단위 테스트를 꼼꼼히 하고, 왜 유효한지 주석을 단다.

```ts
// (보충) 원서 예시(fetchPeak)를 요청 바디 검증으로 바꾼 예
function parseCreateComment(body: unknown): CreateComment {
  if (!isCreateComment(body)) throw new BadRequestError();   // 검증
  return body;                                               // 이 안에서만 신뢰
}
```
- 코드 곳곳에 흩어진 `as`보다 "검증 + 단언"을 한 함수에 두면 검토할 지점이 줄어들고, 그 안에서 검증을 점점 강화하기도 쉽다.
- 이런 검증을 체계적으로 하는 방법이 10장(Item 74)이다.
- (보충) 정리하면 **검증 계층(경계)** 설계의 기본 원리는 "바깥은 `unknown`, 검증을 통과한 안쪽은 정확한 타입"이다.

> 📖 원문: Ch.5 Item 45

#### 6.3 건전성(Soundness) 함정: TypeScript가 거짓말하는 곳
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

(참고: 원서 Item 3은 `const r: ApiRes = await res.json()`처럼 외부 데이터를 타입으로 "선언"만 해도 런타임 값과 어긋날 수 있다고 경고한다. 해결책은 10장의 런타임 검증이다.)

핵심 태도: **"타입이 맞다"는 "런타임에도 맞다"를 보장하지 않는다.** 경계(입출력)에서 확인하고, 안쪽에서는 타입을 신뢰한다.

> 📖 원문: Ch.5 Item 48

---

### 7. 실전 레시피: 완전성 검사, 매핑 동기화, 브랜드 타입

#### 7.1 `never`로 완전성 검사(Exhaustiveness Checking)
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

#### 7.2 `Record`로 값 동기화 유지
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

#### 7.3 브랜드(Brand)로 명목적 타이핑
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

### 8. 비동기 코드와 타입

#### 8.1 콜백 대신 `async`/`await`
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

---

### 9. 언어 기능: 데코레이터, 파라미터 프로퍼티, enum

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

---

### 10. 런타임에 타입 복원하기: 검증과 DTO

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
1. 바깥에서 들어오는 값은 **`unknown`** 으로 시작한다. (6장)
2. **경계에서 딱 한 번** 검증한다. (컨트롤러 입구)
3. 통과한 값만 정확한 타입으로 안쪽 서비스에 전달한다.
4. 안쪽에서는 타입을 신뢰하고 반복 검증하지 않는다. (단, 도메인 규칙 검증은 별개)

**SaaS 관점**: 외부 입력 검증은 보안(인젝션, 과다 필드 주입/Mass Assignment)과 데이터 정합성의 첫 번째 관문이다.
"알 수 없는 필드는 거부/제거"까지 포함해서 설계한다. 검증 없이 `as`로 넘긴 값이 DB에 저장되면 되돌리기 어렵다.

> 🔗 NestJS 연결: NestJS에서는 **class-validator + class-transformer** 조합의 `ValidationPipe`가 위 2번 방식을 클래스 기반으로 구현한 것이다. DTO 클래스가 타입이면서 검증 규칙(`@IsEmail()`, `@IsString()`)이다.
> `whitelist: true`, `forbidNonWhitelisted: true`로 잉여 필드를 제거/거부하고, `transform: true`로 문자열 쿼리 → 숫자 변환도 한다. Zod를 쓰고 싶다면 커스텀 Pipe로 같은 위치(경계)에 넣는다.

> 📖 원문: Ch.9 Item 74 (관련: Ch.1 Item 3, Ch.5 Item 46)

---

### 11. 제외한 것들을 한 줄로

여기서 다루지 않은 것은 "필수는 아니지만 알아두면 좋은" 범위다.
- 재귀·템플릿 리터럴·조건부 타입 등 **고급 타입 프로그래밍**은 라이브러리를 만들 때가 아니면 필요 없다.
- 컴파일러 성능 튜닝, DOM 타입, JS→TS 마이그레이션, `@types` 배포는 이 스택의 신규 백엔드 개발에서 우선순위가 낮다.
- 필요한 순간이 오면 그때 찾아보면 된다. 대부분의 일상 업무는 위 10개 절로 충분하다.

---

### ✅ 이 부 핵심 체크리스트

- [ ] `tsconfig.json`에 `"strict": true`를 켰고, CI에서 `tsc --noEmit`(또는 빌드)으로 타입 오류 0개를 강제한다.
- [ ] 타입은 런타임에 사라진다는 사실을 기억하고, **외부 입력(요청/웹훅/큐/캐시)은 `unknown`으로 받아 경계에서 검증**한다. (NestJS: DTO 클래스 + `ValidationPipe`)
- [ ] `any`는 쓰지 않는다. 쓴다면 가장 좁은 범위에, 이유와 함께. 모르는 값에는 `unknown`.
- [ ] `as` 단언과 `!`는 "검증을 이미 끝낸 곳"에만 쓰고, 필요하면 검증 함수 안으로 숨긴다.
- [ ] 상태는 독립된 boolean/optional 필드가 아니라 **판별 유니온(Discriminated Union)** 으로 표현해 불가능한 조합을 없앤다. (구독, 결제, 초대 상태 등)
- [ ] `null`은 경계(조회 함수 반환값)에서 한 번만 처리하고, 안쪽 코드는 non-null 객체로 유지한다. 서로 연관된 nullable 필드는 하나로 묶는다.
- [ ] `string` 대신 리터럴 유니온(`'free' | 'pro'`)을 쓰고, `Record<Union, V>` 매핑과 `never` 완전성 검사로 케이스 누락을 컴파일 단계에서 잡는다.
- [ ] `userId`, `tenantId` 같이 서로 바뀌면 사고가 나는 ID는 **브랜드 타입**으로 구분한다.
- [ ] DTO/응답 타입은 `Pick`/`Partial`(NestJS `PartialType`/`PickType`/`OmitType` 등)로 원본에서 **파생**해 중복을 없애고, 민감 필드(`passwordHash`)는 응답 타입에서 제외한다.
- [ ] 비동기는 `async`/`await`, 독립 작업은 `Promise.all`. Promise를 버리지 않도록(`no-floating-promises`) 린트를 켠다.
- [ ] NestJS의 DI와 데코레이터가 `emitDecoratorMetadata`, 파라미터 프로퍼티, **클래스(런타임에 존재하는 값)** 에 의존한다는 것을 이해하고, 인터페이스를 DI 토큰으로 쓰지 않는다.
