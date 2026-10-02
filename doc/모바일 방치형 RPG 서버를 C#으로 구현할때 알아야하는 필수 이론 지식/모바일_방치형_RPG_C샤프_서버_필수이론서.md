---
title: "한 권으로 보기"
parent: "C# 방치형 RPG 서버 필수 이론"
nav_order: 99
search_exclude: true
---

# 모바일 방치형 RPG 서버를 위한 C# 필수 이론서

C#으로 HTTP 웹 백엔드(모바일 방치형 RPG 게임 서버)를 처음 만드는 사람이 알아야 할 선수 지식을, 폴더 안의 C#/.NET/ASP.NET Core 책 11권 원문을 근거로 정리한 책입니다.

## 읽는 법
- `> 📖 출처:` 줄은 그 절의 근거가 된 책 이름, 장, 절 제목입니다. `L12077-12235`처럼 쓴 숫자는 책 PDF/EPUB을 텍스트로 변환한 작업 파일의 줄 번호라서 책의 쪽 번호가 아닙니다. 위치는 장과 절 제목으로 찾으세요.
- `> 📚 참고(doc, 책 외):` 줄은 11권에 근거가 없어 doc 폴더 문서(C# Complete Guide, Node.js Complete Guide, NestJS 교재)를 근거로 보강한 절의 출처입니다. 이 표시가 붙은 절은 전체가 책 외 내용입니다(제4부 2-3·3-5, 제10부 12절, 제11부 4-4, 제12부 12.4 끝).
- `> 🔧 보충(책 외):` 블록과 "방치형 RPG 서버에서는" 문단은 책에 없는 게임 서버 맥락 설명입니다. 이 표시가 없는 설명은 원문에서 확인한 내용입니다.
- 모든 절은 원문 대조 검증을 거쳤습니다. 책마다 말이 다른 곳은 어느 책의 설명인지 밝혀 두었습니다.
- 제8-13부 예제는 .NET SDK로 실제 빌드하거나 실행해 확인했습니다. 제1-7부 예제는 눈으로 검토했습니다(단, 제4부의 📚 보강 절 예제는 실행해 확인했습니다). Docker와 CI 설정 예제는 실행하지 않았습니다.
- 각 부는 "코어 — 이것만은 100%"로 시작하고 본문 절을 코어 단위로 다시 묶었습니다. C++·TCP 게임 서버 경험과의 비교 표와 실무 시나리오가 붙어 있습니다.
- 목차 선정 근거는 `00_필수_목차_리스트.md`에 있습니다.

## 차례
**C# 기초** 1. 문법 기초 / 2. 객체지향 / 3. 메모리와 성능 기초 / 4. 델리게이트·예외·현대 C# / 5. .NET 기본 라이브러리 / 6. 비동기와 시간 흐름
**웹 서버** 7. 웹 API 기초 / 8. ASP.NET Core 핵심 동작 / 9. 설계 원칙과 패턴 / 10. EF Core 데이터 접근 / 11. 인증과 보안 기초 / 12. 백그라운드 서비스·캐시·외부 호출 / 13. 아키텍처·테스트·배포 기초

---

---

# 제1부. C# 문법 기초

> **🎮 게임 서버 개발자에게** — C# 문법의 겉모양(문장·`;`·`{ }`·`if`/`for`/`switch`·연산자 우선순위)은 C++과 거의 같아서 금방 읽힙니다. 결정적으로 다른 것은 **메모리 의미론**입니다. C#에서는 `struct`와 `class`가 "값으로 복사되느냐, 참조(관리되는 포인터 비슷한 것)로 공유되느냐"를 가르고, 객체는 `delete` 없이 GC가 치웁니다. 또 C++에서 UB이던 것들(부호 있는 정수 오버플로, 초기화 안 된 지역 변수 읽기, 배열 범위 밖 접근, null 역참조)이 C#에서는 **정해진 동작**(조용한 wraparound, 컴파일 오류, 예외)으로 바뀝니다. 이 차이를 모르면 C++ 습관대로 짠 코드가 "컴파일은 되는데 수치가 이상한" 버그를 냅니다.
>
> **🎯 실무에서 이 장이 필요한 순간** — ① 오프라인 보상을 지급했더니 어떤 유저의 골드가 음수가 됐다(조용한 int 오버플로). ② 영웅 스탯을 메서드에 넘겨 강화했는데 저장해 보니 수치가 그대로다(struct 복사본을 수정). ③ 전투 계산 중 "대상이 이미 죽어서 사라진" 순간 요청 하나가 `NullReferenceException`으로 500 에러를 낸다.

## 코어 — 이것만은 100%

> **한 문장:** C# 코드는 문장·메서드·클래스·네임스페이스로 묶이고, **값 타입은 복사·참조 타입은 공유(그리고 null 가능)**되며, 방치형 서버의 큰 숫자는 `long`부터 시작해 **조용한 오버플로와 실수 오차**를 의식하고, **null 연산자와 제어문**으로 안전한 전투·보상 루프를 만든다.

1. **코드의 골격** — 문장(`;`) → 메서드 → 클래스(필드·생성자·메서드) → 네임스페이스로 묶이고, `dotnet` 도구가 어셈블리로 컴파일한다. 인스턴스 멤버는 객체마다, `static` 멤버는 타입 전체에 하나.
2. **값 타입 vs 참조 타입 (결정적 지식)** — struct·숫자·bool·char·enum은 대입·전달 시 통째로 복사, class·배열·string·델리게이트·인터페이스는 참조만 복사되어 같은 객체를 공유한다. 스택/힙 배치, 기본값, 매개변수 전달(값·`ref`·`out`·`in`)이 모두 여기서 나온다.
3. **숫자는 정해진 비트다** — 정수는 `int`/`long`이 1급 시민이고 재화·데미지는 `long`부터. 정수 오버플로는 기본적으로 예외 없이 감아 돌며 `checked`로만 잡힌다. 실수→정수는 버림, double은 빠르지만 0.1도 근사, decimal은 정확하지만 약 10배 느리다.
4. **null 방어** — null 참조의 멤버를 쓰면 `NullReferenceException`. `&&`의 단락 평가, `?.`(null이면 조용히 null), `??`(대체값), `??=`(null일 때만 대입)로 막는다.
5. **문자열·배열·제어문** — string은 불변·`$"..."` 보간, 배열은 고정 길이·범위 검사·`^1`/`..`, 그리고 if / switch(식) / for / foreach / while / break / continue / return으로 자동 전투·보상 루프를 만든다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| C++ `struct` vs `class` | C# `struct` vs `class` | 둘 다 필드·메서드·생성자를 가진 사용자 정의 타입 | C++에서는 기본 접근 지정자 차이뿐이지만, C#에서 `struct`는 **값 타입**(대입 시 복사), `class`는 **참조 타입**(대입 시 참조만 복사, 같은 객체 공유)이다. 의미가 완전히 다르다 |
| `T*` / `std::shared_ptr<T>` 를 복사해 같은 객체를 가리킴 | class 변수(참조) | 대입하면 "가리키는 값"만 복사되고 두 변수가 같은 객체를 본다. null(nullptr)일 수 있다 | `->`·`*`·포인터 산술이 없고 `delete`도 없다. 객체는 항상 힙에 있고 GC가 회수하므로 dangling 포인터는 없지만 소멸 시점도 정할 수 없다. 참조 카운트가 아니다 |
| 부호 있는 정수 오버플로 = UB, unsigned는 wraparound | C# 정수 오버플로 | 고정 비트 폭의 2의 보수 정수다 | C#은 기본(unchecked)에서 부호 있는 정수도 **정의된 wraparound**(`int.MaxValue + 1 == int.MinValue`). 컴파일러가 "오버플로는 없다"고 가정해 최적화하지도 않는다. `checked`를 쓰면 `OverflowException`으로 바뀐다 |
| `T&` / `const T&` / 출력용 포인터 인자 | `ref` / `in` / `out` | 원본 변수를 직접 다룬다 | 호출하는 쪽에도 `ref`/`out`을 **반드시 적어야** 한다. `out`은 메서드가 반드시 값을 채워야 한다는 규칙이 컴파일러로 강제된다. 기본 전달은 값 복사인데 class는 "참조가 값으로" 복사된다 |
| `std::string`(가변, 값 의미론) | C# `string` | `==`가 내용을 비교한다 | C# string은 **참조 타입이면서 불변**이다. `+=`는 매번 새 문자열을 만든다. 반복 조립은 `StringBuilder` |
| nullptr 역참조 → 세그폴트(프로세스 사망) | null 멤버 접근 → `NullReferenceException` | 둘 다 "아무것도 안 가리키는 참조"를 따라간 버그다 | C#에서는 잡을 수 있는 예외라 요청 하나만 실패한다. 대신 `?.`·`??` 같은 언어 차원의 방어 연산자가 있다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `int` 골드가 21억을 넘는 순간 서버에서는 무슨 일이 생길까? 예외가 날까, 아니면 다른 일이 생길까? C++이라면?
> 2. struct 변수를 다른 변수에 대입한 뒤 원본을 바꾸면 복사본도 바뀔까? class라면 무엇이 다를까?
> 3. `0.1`을 열 번 더한 double 값은 `1.0`과 `==`로 같을까? decimal이라면?
> 4. `target?.Name ?? "대상 없음"` 한 줄은 `target`이 null일 때 어떤 순서로 평가될까?
> 5. 메서드에 `int`를 넘겨 그 안에서 값을 바꾸면 호출한 쪽 변수도 바뀔까? 바꾸고 싶다면 무엇을 써야 할까?
>
> **처리법:** 🛠 실습 `dotnet new console` / `dotnet run`, `checked(a * b)` 오버플로 실험, `0.1` 누적 비교, `ref`/`out` TryBuy 예제 → 읽자마자 직접 실행 · 🗺 관계도 문장 → 메서드 → 클래스 → 네임스페이스 / 값·참조 타입 → 스택·힙 → 매개변수 전달(값·ref·out·in) · 📦 카드로 리터럴 접미사(`F`·`D`·`M`·`U`·`L`·`UL`), double 15-16자리 vs decimal 28-29자리(약 10배 느림), 기본값(null·0·`'\0'`·false), 인덱스 `^1`·범위 `..` 규칙
>
> **스킵 읽기 (5~15분):** 소제목·표·굵은 글씨만 먼저 훑고, 위 답을 고친 다음 정독하세요. 값 타입/참조 타입 비유(종이 복사본 건네기 vs 같은 사물함 번호 알려 주기)가 어디까지 맞고 어디서 깨지는지도 따져 보세요.

---

**이 부의 학습 목표**
1. 변수, 타입, 메서드, 클래스로 이루어진 C# 프로그램의 기본 모양을 읽고 쓸 수 있다.
2. 값 타입과 참조 타입, null의 차이를 이해하고, 방치형 RPG 서버가 계산하는 큰 숫자(재화·데미지)를 담을 타입(int/long/double/decimal)을 고를 수 있다.
3. 문자열 보간, 배열, 연산자(`??`, `?.`), 조건문과 반복문으로 서버가 계산하는 간단한 자동 전투·보상 루프를 작성할 수 있다.

> 📌 이 부의 예제는 모두 "top-level statements" 방식(Main 없이 바로 코드 작성)으로 쓴다. 원문 예제를 방치형 RPG 이름(gold, damage, hero)으로 바꿔 간단히 만들었다.

---

## 코어 1. 코드의 골격 — 문장·메서드·타입·네임스페이스

> C++과 거의 같은 부분이다. 빠르게 훑되, 표시한 ⚠️ 차이(어셈블리·`@` 식별자·`const`의 의미·`var`)만 챙기자.

### 1.1 첫 프로그램: 문장, 메서드, using

**한 줄 요약:** C# 프로그램은 세미콜론으로 끝나는 "문장"들이 위에서 아래로 실행되는 것이고, 반복해서 쓸 코드는 "메서드"로 묶는다.

> 📖 출처: C# 12 in a Nutshell 2장 "A First C# Program" (텍스트 L2045-2148)

**핵심 설명**
- 문장(statement)은 `;`로 끝나며 순서대로 실행된다. 중괄호 `{ }`로 묶으면 "문장 블록"이 된다.
- 메서드는 입력(매개변수)을 받아 출력(반환 타입)을 돌려주는 코드 묶음이다. 반환할 값이 없으면 `void`를 쓴다.
- `Console`처럼 자주 쓰는 타입은 `System` 같은 "네임스페이스" 안에 있다. `using System;`을 쓰면 매번 `System.`을 붙이지 않아도 된다.
- 메서드 말고도 연산자(`*`), 생성자, 프로퍼티, 이벤트, 인덱서 등도 "함수"의 한 종류다.

```csharp
using System;

int gold = 12 * 30;               // 문장 1: 계산 결과를 변수에 저장
Console.WriteLine(gold);          // 문장 2: 메서드 호출 (360 출력)
Console.WriteLine(CalcDamage(50)); // 메서드에 인자 50을 넘김

int CalcDamage(int attack)        // 매개변수 1개, int를 반환
{
    int damage = attack * 2;
    return damage;
}
```

> 🔧 보충(책 외): **C++과 비교** — `using System;`은 C++의 `using namespace std;`에 가깝다(헤더 `#include`는 없다. 참조한 어셈블리의 타입은 바로 보인다). C#에는 클래스 밖의 자유 함수가 없고, 위 예제의 `CalcDamage`처럼 top-level 코드 안의 메서드는 컴파일러가 숨은 클래스 안에 넣어 준다. 선언 순서도 상관없어서 전방 선언이 필요 없다.

**방치형 RPG 서버에서는** 골드 획득, 데미지 계산 같은 규칙을 작은 메서드로 쪼개 두면 API 요청 처리 코드에서 재사용하기 쉽고, 나중에 업그레이드나 밸런스 수정도 훨씬 쉬워진다.

### 1.2 컴파일과 dotnet 도구

**한 줄 요약:** C# 소스(.cs)는 컴파일러가 "어셈블리"로 만들어 주고, 명령줄에서는 `dotnet` 도구로 만들고 실행한다.

> 📖 출처: C# 12 in a Nutshell 2장 "Compilation" (텍스트 L2150-2204)

**핵심 설명**
- 컴파일러는 `.cs` 파일들을 어셈블리(배포·패키징 단위, 앱 또는 라이브러리)로 바꾼다.
- 문장으로 바로 시작하는 코드(top-level statements)가 있으면 그것이 프로그램의 시작점(entry point)이 된다. 없으면 `Main` 메서드가 시작점이다.
- 명령줄에서는 `dotnet new console -n 이름`으로 프로젝트를 만들고, `dotnet run` / `dotnet build`로 실행·빌드한다.

> 🔧 보충(책 외): 이 프로젝트는 HTTP 웹 백엔드(게임 서버)이므로 `dotnet new`/`dotnet run`/`dotnet build`가 서버를 만들고 실행하는 기본 도구가 된다. 이 절의 콘솔 프로젝트는 서버 로직을 연습하는 출발점으로 생각하면 된다.

> 🔧 보충(책 외): **C++과 비교** — 어셈블리(.dll/.exe)에는 기계어가 아니라 IL(중간 언어)과 타입 메타데이터가 들어 있고, 실행 시 .NET 런타임이 JIT로 기계어를 만든다. 그래서 헤더·링커 단계가 없고, 라이브러리의 타입 정보가 어셈블리 자체에 실려 있다. `.csproj`는 CMakeLists에 해당하는 빌드 정의 파일이다.

**방치형 RPG 서버에서는** 웹 서버를 만들기 전, 콘솔 프로젝트에서 데미지·보상 계산 같은 로직만 먼저 실험해 보면 빠르게 검증할 수 있다.

### 1.3 식별자, 키워드, 주석

**한 줄 요약:** 이름 짓는 규칙(대소문자 구분, camelCase/PascalCase)을 지키고, 예약어는 이름으로 쓰지 않는다.

> 📖 출처: C# 12 in a Nutshell 2장 "Syntax / Identifiers and Keywords / Comments" (텍스트 L2206-2429)

**핵심 설명**
- 식별자는 우리가 짓는 이름(클래스, 메서드, 변수)이다. 글자나 밑줄로 시작하고, **대소문자를 구분**한다.
- 관례: 매개변수, 지역 변수, private 필드는 `camelCase`, 그 외(클래스, 메서드 등)는 `PascalCase`.
- 키워드(`int`, `class`, `if` ...)는 컴파일러가 특별하게 보는 단어다. 대부분 예약어라 이름으로 쓸 수 없다. 꼭 써야 하면 `@using`처럼 `@`를 붙인다.
- 주석은 `//`(한 줄)와 `/* ... */`(여러 줄) 두 가지다.

```csharp
int heroLevel = 1;        // 지역 변수: camelCase
// int class = 3;         // 오류: class는 예약어
int @class = 3;           // @를 붙이면 가능(하지만 굳이 쓰지 않는 게 좋다)

/* 여러 줄
   주석 */
int MaxLevel() => 100;    // 메서드 이름: PascalCase
```

> 🔧 보충(책 외): **C++과 비교** — 주석 문법은 같다. 다른 점은 메서드 이름까지 PascalCase(`Console.WriteLine`)라는 관례와, 예약어를 이름으로 쓰게 해 주는 `@` 접두사다(C++에는 없음). `int MaxLevel() => 100;`의 `=>`는 본문이 식 하나인 메서드를 짧게 쓰는 문법이다.

**방치형 RPG 서버에서는** `goldPerSecond`, `HeroData`처럼 일관된 이름 규칙을 처음부터 정해 두면 스킬·아이템·API가 수십 개로 늘어나도 코드가 읽기 쉽다.

### 1.4 타입, 변수, 상수, 미리 정의된 타입

**한 줄 요약:** 타입은 값의 "설계도"이고, 변수는 그 값을 담는 칸이며, 상수(`const`)는 바뀌지 않는 칸이다.

> 📖 출처: C# 12 in a Nutshell 2장 "Type Basics / Predefined Type Examples" (텍스트 L2431-2511)

**핵심 설명**
- 모든 값은 어떤 타입의 인스턴스다. 타입이 "어떤 값들이 가능한지"와 "무슨 기능이 있는지"를 정한다.
- `int`(정수), `string`(문자열), `bool`(true/false)은 컴파일러가 직접 지원하는 미리 정의된 타입이다.
- 거의 모든 타입에 `ToString()`이 있어 문자열로 바꿀 수 있다.
- `const`는 선언과 동시에 값을 정해야 하고 이후 바꿀 수 없다.

```csharp
const int MaxLevel = 100;          // 상수
int level = 1;                     // 변수(나중에 바뀜)
string heroName = "Arthur";
bool isAlive = true;
string info = heroName + " Lv." + level.ToString();
```

> 🔧 보충(책 외): **C++과 비교** — C#의 `const`는 C++의 `const`보다 `constexpr`에 가깝다. 컴파일 시점에 값이 정해지는 상수(숫자·문자열 등)에만 쓸 수 있고, 실행 중에 정해지는 값을 "한 번만 대입"하려면 `readonly` 필드를 쓴다. 또 `int`가 `ToString()`을 가진 것처럼, 숫자 같은 기본 타입도 메서드를 가진 .NET 타입(`int` = `System.Int32`)이다.

**방치형 RPG 서버에서는** 최대 레벨, 기본 공격 속도 같은 "고정 규칙 값"은 `const`로 두어 서버 코드에서 실수로 바뀌는 것을 막는다.

### 1.5 사용자 정의 타입: 필드, 생성자, 메서드

**한 줄 요약:** `class`로 내가 원하는 타입을 만들고, `new`로 그 실체(인스턴스)를 만든다.

> 📖 출처: C# 12 in a Nutshell 2장 "Custom Types" (텍스트 L2512-2617)

**핵심 설명**
- 타입 안에는 데이터 멤버(필드)와 기능 멤버(메서드, 생성자 등)가 들어간다.
- 미리 정의된 타입과 내가 만든 타입은 구조가 거의 같다. 둘 다 "데이터 + 그 데이터를 쓰는 기능"이다.
- `new 타입(...)`으로 인스턴스를 만들면 곧바로 **생성자**가 호출되어 초기화한다. 생성자는 메서드와 비슷하지만 이름이 타입 이름과 같고 반환 타입이 없다.

```csharp
Hero hero = new Hero(10);           // 생성자 호출
Console.WriteLine(hero.Attack(3));  // 30

public class Hero
{
    int power;                          // 필드
    public Hero(int startPower)         // 생성자
    {
        power = startPower;
    }
    public int Attack(int multiplier)   // 메서드
    {
        return power * multiplier;
    }
}
```

> 🔧 보충(책 외): **C++과 비교** — 문법은 C++ 클래스와 거의 같지만 ⚠️ `Hero hero = new Hero(10);`은 C++의 `Hero hero(10);`(스택 객체)이 아니라 `Hero* hero = new Hero(10);`에 가깝다. class 인스턴스는 항상 힙에 만들어지고 변수에는 참조만 들어간다. 대신 `delete`가 없고 GC가 회수하며, 멤버 접근은 `->`가 아니라 `.`이다. 클래스 선언 끝에 `;`도 붙이지 않는다. 자세한 차이는 → 코어 2.

**방치형 RPG 서버에서는** 영웅, 몬스터, 아이템을 각각 하나의 class로 만들고 필드에 레벨·공격력 같은 데이터를 담게 된다. 이런 class는 나중에 DB 저장·API 응답의 바탕이 된다.

### 1.6 인스턴스 멤버 vs static 멤버, public, 네임스페이스

**한 줄 요약:** 기본 멤버는 "객체마다" 있고, `static` 멤버는 "타입 전체에 하나"만 있다. `public`은 밖에 공개한다는 뜻이다.

> 📖 출처: C# 12 in a Nutshell 2장 "Instance versus static members / The public keyword / Defining namespaces / Namespaces" (텍스트 L2619-2743, L6470-6526)

**핵심 설명**
- 인스턴스 멤버는 객체 하나하나에 속한다(`p1.Name`). `static` 멤버는 타입 이름으로 접근한다(`Panda.Population`).
- `public`이 없으면 기본은 private이라 클래스 밖에서 접근할 수 없다. 공개할 것만 public으로 열고 나머지는 숨기는 것이 캡슐화다.
- 네임스페이스는 타입 이름의 영역(domain)이며, 계층 구조로 타입을 정리해 찾기 쉽게 하고 이름 충돌을 막는다. `namespace A.B.C`처럼 점으로 중첩 계층을 만들고, 사용하는 쪽에서는 `using`으로 가져오거나 전체 이름(`A.B.C.타입`)으로 쓴다. 네임스페이스는 어셈블리와 별개이고 public/private 같은 접근 수준에도 영향을 주지 않는다.

> 🔧 보충(책 외): 네임스페이스를 "폴더"에 빗대는 것은 이해를 돕기 위한 비유일 뿐 원문의 표현이 아니다.

```csharp
Monster m1 = new Monster("Slime");
Monster m2 = new Monster("Goblin");
Console.WriteLine(m1.Name);            // Slime  (인스턴스 멤버)
Console.WriteLine(Monster.Count);      // 2      (static 멤버)

public class Monster
{
    public string Name;                // 몬스터마다 다름
    public static int Count;           // 전체에서 하나
    public Monster(string name) { Name = name; Count++; }
}
```

> 🔧 보충(책 외): **C++과 비교** — static 멤버의 의미는 C++과 같다. 다만 접근은 `Monster::Count`가 아니라 `Monster.Count`(네임스페이스 구분자도 `::`가 아니라 `.`)이고, 접근 지정자는 `public:` 구역 방식이 아니라 **멤버마다** 붙인다. ⚠️ C++ 게임 서버에서 전역/static 싱글톤에 상태를 두던 습관은 위험하다. ASP.NET Core 서버는 여러 요청을 스레드 풀에서 동시에 처리하므로 static 필드는 사실상 "모든 유저가 동시에 만지는 공유 변수"다.

**방치형 RPG 서버에서는** "서버 전체에서 하나만 필요한 값"에 static이 어울리지만, 서버는 여러 요청을 동시에 처리하므로 static에 유저별 상태를 두면 유저끼리 섞이는 사고가 난다. 남용하면 코드가 엉키므로 [제9부](09_제9부_설계원칙과_패턴.md)의 Singleton 주의점을 함께 기억하자.

### 1.7 var와 target-typed new

**한 줄 요약:** `var`는 컴파일러가 타입을 알아서 정해 주는 것이고, `new()`는 타입 이름 반복을 줄여 준다.

> 📖 출처: C# 12 in a Nutshell 2장 "var--Implicitly Typed Local Variables / Target-Typed new Expressions" (텍스트 L5115-5201)

**핵심 설명**
- `var x = "hello";`는 `string x = "hello";`와 완전히 같다. 타입은 **컴파일 때 고정**되므로, 나중에 다른 타입을 넣으면 오류다.
- 오른쪽만 봐서 타입을 알기 어려우면 가독성이 떨어질 수 있다(`var x = r.Next();`).
- `List<Monster> list = new();`처럼 타입을 왼쪽에서 알 수 있으면 `new()`만으로 만들 수 있다.

```csharp
var heroName = "Arthur";           // string
var level = 5;                     // int
// level = "five";                 // 컴파일 오류
System.Text.StringBuilder sb = new();   // 타입 생략 new
```

> 🔧 보충(책 외): **C++과 비교** — `var`는 C++의 `auto`와 같은 컴파일 타임 타입 추론이다(동적 타입이 아니다). 다만 `auto`와 달리 지역 변수에만 쓸 수 있다.

**방치형 RPG 서버에서는** `var`는 긴 제네릭 타입을 줄여 주지만, 골드처럼 `int`/`long` 구분이 중요한 값은 타입을 직접 써서 실수를 막는 편이 안전하다.

> 🔧 보충(책 외): 마지막 문장의 "직접 쓰는 편이 안전하다"는 권장은 집필자의 의견이며, 책은 var의 가독성 저하 가능성만 언급한다.

---

## 코어 2. 값 타입 vs 참조 타입 — 복사냐 공유냐

> C++ 개발자가 가장 크게 착각하는 곳이다. C++에서는 **어떤 타입이든** 값으로 둘지(`Hero h;`) 포인터로 둘지(`Hero* h`) 쓰는 쪽이 고른다. C#에서는 **타입을 정의할 때** 정해진다. `struct`로 만들면 항상 값처럼, `class`로 만들면 항상 참조로 다뤄진다. 이 하나로 대입 결과, 배열 칸의 null, 스택/힙 배치, 매개변수 전달 결과가 모두 설명된다.

### 2.1 값 타입과 참조 타입

**한 줄 요약:** 값 타입은 "복사본"이 만들어지고, 참조 타입은 "같은 물건을 가리키는 주소"가 복사된다.

> 📖 출처: C# 12 in a Nutshell 2장 "Value Types Versus Reference Types" (텍스트 L2930-3037, L3078-3112)

**핵심 설명**
- **값 타입**: 숫자 타입, `char`, `bool`, 그리고 `struct`, `enum`. 변수 안에 값 자체가 들어 있어서 대입하면 통째로 복사되고, 서로 영향을 주지 않는다.
- **참조 타입**: `class`, 배열, 델리게이트, 인터페이스, 그리고 `string`. 변수에는 객체를 가리키는 참조가 들어 있어서 대입하면 참조만 복사되고, 두 변수가 같은 객체를 본다.
- 메모리 면에서 값 타입은 필요한 필드 크기만큼만 차지하지만, 참조 타입은 객체 + 참조가 따로 있고 객체에 최소 8바이트의 관리 정보가 붙는다.

```csharp
// 값 타입(struct): 복사됨
StatV a = new StatV { Atk = 7 };
StatV b = a;
a.Atk = 9;
Console.WriteLine(b.Atk);   // 7  (b는 그대로)

// 참조 타입(class): 같은 객체를 공유
StatR c = new StatR { Atk = 7 };
StatR d = c;
c.Atk = 9;
Console.WriteLine(d.Atk);   // 9  (d도 바뀜)

struct StatV { public int Atk; }
class  StatR { public int Atk; }
```

> 🔧 보충(책 외): **C++과 비교** — 위 예제를 C++로 옮기면 `StatV`는 `StatV b = a;`(멤버 단위 복사), `StatR`은 `StatR* d = c;`(포인터 복사)와 같은 동작이다. ⚠️ 함정 세 가지:
> - C++에서 `struct`와 `class`는 기본 접근 지정자만 다르지만, C#에서는 **복사 의미론 자체**가 다르다. "작은 데이터니까 struct"라고 C++ 감각으로 고르면, 수정하려던 것이 복사본이 되는 버그가 난다.
> - C#의 `new`는 "힙 할당"이라는 뜻이 아니다. `new StatV { ... }`는 값을 만드는 문법일 뿐이고, struct는 힙에 따로 할당되지 않는다(→ 2.2).
> - C# 참조는 C++ `T&`(별명, 재바인딩 불가)가 아니라 포인터에 가깝다. 다른 객체를 다시 가리킬 수 있고 null일 수 있다. 그렇다고 `shared_ptr`처럼 참조 카운트로 해제되지도 않는다(GC가 도달 가능성으로 판단).

**방치형 RPG 서버에서는** 한 요청 처리 안에서 영웅 정보를 class로 두면 전투 계산과 보상 계산이 "같은 영웅 객체"를 공유해서 한쪽 변경이 다른 쪽에 바로 보인다. 반대로 struct를 넘기면 복사본이 바뀌어 "왜 수치가 안 변하지?"가 될 수 있으니 주의한다.

### 2.2 스택과 힙

**한 줄 요약:** 지역 변수와 매개변수는 스택에, 객체(참조 타입 인스턴스)는 힙에 살며, 힙 객체는 가비지 컬렉터가 치운다.

> 📖 출처: C# 12 in a Nutshell 2장 "The Stack and the Heap" (텍스트 L4431-4520)

**핵심 설명**
- **스택**: 메서드가 실행될 때 지역 변수와 매개변수가 쌓이고, 메서드가 끝나면 자동으로 사라진다.
- **힙**: `new`로 만든 객체가 사는 곳. 더 이상 아무도 쓰지 않으면 가비지 컬렉터(GC)가 나중에 회수한다. C#에서는 객체를 직접 삭제할 수 없다.
- 값 타입 인스턴스는 "변수가 선언된 곳"에 산다. 예를 들어 클래스의 필드나 배열 요소라면 그것도 힙에 있다.
- `static` 필드도 힙에 저장되며 프로그램이 끝날 때까지 남는다.

```csharp
void Fight()
{
    int damage = 10;               // 스택: Fight가 끝나면 사라짐
    var log = new System.Text.StringBuilder(); // 객체는 힙, log(참조)는 스택
    log.Append("hit");
}   // 여기서 log가 가리키던 객체는 GC 회수 대상이 된다
```

> 🔧 보충(책 외): **C++과 비교** — C++에서는 `Hero h;`(스택)와 `new Hero`(힙)를 호출하는 쪽이 고르지만, C#에서는 class 인스턴스를 스택에 둘 수 없다. ⚠️ 그리고 `Fight()`가 끝나도 `StringBuilder` 객체가 그 자리에서 "소멸"하지 않는다. "회수 대상"이 될 뿐 실제 회수 시점은 GC가 정하므로, C++ 소멸자처럼 스코프 종료 시점에 정리 코드를 돌리는 RAII는 그대로 성립하지 않는다(C#은 이를 `IDisposable`/`using`으로 **명시적으로** 표현한다. 다른 부에서 다룸).

**방치형 RPG 서버에서는** 요청을 처리할 때마다 몬스터 같은 객체를 `new`로 만들면 힙에 쌓이고, 더 이상 쓰이지 않는 것은 GC가 회수한다. 자세한 대책은 [제3부](03_제3부_메모리와_성능_기초.md)(메모리와 성능)에서 다룬다.

> 🔧 보충(책 외): "동시 요청이 많을 때 객체를 계속 만들면 GC가 자주 돌아 응답이 느려질 수 있다"는 식의 서버 성능 관점은 이 절의 원문에 없는 설명이다.

### 2.3 확실한 할당과 기본값

**한 줄 요약:** 지역 변수는 값을 넣기 전에 읽을 수 없고, 필드와 배열 요소는 자동으로 기본값(0, null, false)이 들어간다.

> 📖 출처: C# 12 in a Nutshell 2장 "Definite Assignment / Default Values" (텍스트 L4522-4583)

**핵심 설명**
- 지역 변수는 읽기 전에 반드시 값이 있어야 하고(안 그러면 컴파일 오류), 필드·배열 요소는 런타임이 자동 초기화한다.
- 기본값: 참조 타입은 `null`, 숫자와 enum은 `0`, `char`는 `'\0'`, `bool`은 `false`. `default` 키워드로 어떤 타입의 기본값도 얻을 수 있다(`decimal d = default;`).
- struct의 기본값은 각 필드의 기본값이다.

```csharp
int x;
// Console.WriteLine(x);      // 컴파일 오류: 값이 없음

int[] gold = new int[2];
Console.WriteLine(gold[0]);   // 0 (자동 초기화)
decimal d = default;          // 0
```

> 🔧 보충(책 외): **C++과 비교** — C++에서 초기화하지 않은 지역 변수를 읽는 것은 UB(쓰레기 값)이고, 생성자에서 빠뜨린 POD 멤버도 쓰레기 값일 수 있다. C#은 지역 변수는 **컴파일 오류**로 막고, 필드·배열 요소는 **항상 0/null/false로 채운다**. "초기화 깜빡해서 쓰레기 값" 류의 버그는 사라지는 대신, "0이 들어 있어서 조용히 넘어가는" 버그로 모양이 바뀐다.

**방치형 RPG 서버에서는** 신규 유저처럼 DB에 아직 저장된 데이터가 없을 때 필드가 0/null이라는 점을 알고 있으면 "처음 시작" 상태를 안전하게 다룰 수 있다.

### 2.4 매개변수 전달: 값, ref, out, in

**한 줄 요약:** 기본은 "복사본 전달"이고, `ref`/`out`/`in`은 "원본 변수 자체를 전달"한다.

> 📖 출처: C# 12 in a Nutshell 2장 "Parameters / Passing arguments by value / The ref modifier / The out modifier / The in modifier" (텍스트 L4584-4875)

**핵심 설명**
- 기본(값 전달): 인자의 **복사본**이 전달되어 메서드 안에서 바꿔도 원본은 그대로다. 참조 타입을 전달할 때는 "참조가 복사"되므로, 같은 객체는 바꿀 수 있지만 참조 변수 자체를 다른 객체로 바꾸는 것은 호출자에게 영향이 없다.
- `ref`: 원본 변수를 직접 다룬다. 호출할 때도 `ref`를 써야 한다. 넘기기 전에 값이 있어야 한다.
- `out`: `ref`와 비슷하지만 넘기기 전에 값이 없어도 되고, **메서드가 끝나기 전에 반드시 값을 채워야** 한다. 값을 여러 개 돌려줄 때 많이 쓴다. `out int x`처럼 즉석 선언 가능하고, 필요 없는 값은 `out _`(버림)로 무시한다.
- `in`: 읽기 전용 참조 전달. 큰 struct를 복사하지 않고 넘길 때 유용하다.

```csharp
int gold = 100;
AddGold(gold);          // 복사본 전달
Console.WriteLine(gold); // 100 (안 바뀜)

AddGoldRef(ref gold);   // 원본 전달
Console.WriteLine(gold); // 150

if (TryBuy(gold, 120, out int left))
    Console.WriteLine($"구매 성공, 남은 골드 {left}");

void AddGold(int g)         { g += 50; }
void AddGoldRef(ref int g)  { g += 50; }
bool TryBuy(int have, int price, out int remain)
{
    remain = have - price;   // out은 반드시 채워야 함
    return remain >= 0;
}
```

> 🔧 보충(책 외): **C++과 비교** — 대응 관계는 `ref int g` ≈ `int& g`, `in BigStruct s` ≈ `const BigStruct& s`, `out int x` ≈ "출력용 `int&`/`int*`"이다. ⚠️ 다른 점: ① 호출하는 쪽에도 `ref`/`out`을 적어야 하므로 "원본이 바뀔 수 있다"가 호출부에서 보인다(C++ `T&`는 호출부에서 안 보임). ② `out`은 "반드시 채운다"를 컴파일러가 강제한다. ③ class 객체를 그냥 넘기는 것은 C++의 `Hero* h`를 값으로 넘기는 것과 같아서, `h.Hp = 0`은 원본 객체를 바꾸지만 `h = new Hero()`는 호출자에게 보이지 않는다. 호출자 변수 자체를 바꾸려면 `ref Hero h`(≈ `Hero*& h`)가 필요하다.

**방치형 RPG 서버에서는** "구매 가능하면 true, 결과 수치는 out으로" 형태(TryXXX 패턴, [제4부](04_제4부_델리게이트_예외_현대C샤프.md))를 쓰면 서버의 상점·업그레이드 요청 처리 코드가 깔끔해진다.

### 2.5 params, 선택 매개변수, 명명된 인자

**한 줄 요약:** 인자 개수를 가변으로(`params`), 생략 가능하게(기본값), 이름으로 지정해서(`name:`) 호출할 수 있다.

> 📖 출처: C# 12 in a Nutshell 2장 "The params modifier / Optional parameters / Named arguments" (텍스트 L4877-5024)

**핵심 설명**
- `params`: 마지막 매개변수에만 쓸 수 있고 배열 타입이다. `Sum(1, 2, 3)`처럼 원하는 만큼 인자를 넘긴다.
- 선택 매개변수: 선언에서 기본값을 주면 호출할 때 생략 가능하다. 기본값은 상수 식(또는 `default` 식 등)이어야 하고, `ref`/`out`에는 쓸 수 없으며, 필수 매개변수는 선택 매개변수보다 앞에 온다(`params`는 항상 마지막).
- 명명된 인자: `Foo(x: 1, y: 2)`처럼 이름으로 넘긴다. 순서를 바꿀 수 있고, 선택 매개변수 중 원하는 것만 지정할 때 편하다.

```csharp
long total = SumGold(100, 250, 40);                 // params
Console.WriteLine(SumGold());                       // 0 (빈 배열)
Spawn("Slime");                                     // 나머지는 기본값
Spawn("Boss", hp: 5000);                            // 원하는 것만 지정

long SumGold(params long[] amounts)
{
    long sum = 0;
    foreach (long a in amounts) sum += a;
    return sum;
}
void Spawn(string name, int hp = 100, int level = 1)
    => Console.WriteLine($"{name} HP{hp} Lv{level}");
```

> 🔧 보충(책 외): **C++과 비교** — 선택 매개변수는 C++의 기본 인자와 같다. `params`는 C 가변 인자(`...`)나 가변 템플릿이 아니라 "컴파일러가 배열을 만들어 넘겨 주는 문법"이라 타입이 안전하다. 명명된 인자는 C++에 없는 기능이라, C++에서 옵션 구조체를 따로 만들던 자리를 대신하기 좋다.

**방치형 RPG 서버에서는** 몬스터 생성처럼 옵션이 많은 메서드에서 선택 매개변수 + 명명된 인자를 쓰면 호출부가 읽기 쉬워진다.

---

## 코어 3. 숫자는 정해진 비트다 — 타입 선택, 변환, 오버플로 (방치형의 큰 숫자)

> int 오버플로 wraparound, 실수→정수 캐스트의 버림, 큰 정수→float 정밀도 손실, double 0.1 누적 오차·NaN, decimal의 순환소수 오차가 모두 "정해진 비트로 수를 담는다"에서 나온다. C++ 개발자에게 익숙한 이야기지만, **C++에서 UB이던 부분이 C#에서는 정의된 동작**이라는 점이 핵심 차이다.

### 3.1 숫자 타입 종류와 선택

**한 줄 요약:** 정수는 `int`/`long`, 실수는 `double`/`decimal`이 기본 선택이다.

> 📖 출처: C# 12 in a Nutshell 2장 "Predefined Type Taxonomy / Numeric Types" (텍스트 L3114-3217)

**핵심 설명**
- 정수: `sbyte, short, int, long`(부호 있음), `byte, ushort, uint, ulong`(부호 없음). 책은 **`int`와 `long`이 1급 시민**이라 하고, 나머지는 호환성이나 공간 절약이 중요할 때 쓴다고 말한다.
- 크기: `int` 32비트, `long` 64비트. 원문 본문에서 확인되는 범위는 `int`의 -2^31 ~ 2^31-1뿐이다. `long`은 표가 잘려 하한(-2^63)만 보이고, 나머지 타입의 범위 수치는 확인되지 않아 싣지 않는다.
- 실수: `float`(32비트), `double`(64비트), `decimal`(128비트). float/double은 과학·그래픽 계산에, `decimal`은 정확한 10진수 계산이 필요한 금융 계산에 쓰인다.
- 참고로 .NET에는 아주 큰 정수용 `BigInteger`, 128비트 정수 `Int128`도 있다(원문 노트).

```csharp
int  hp    = 1_000_000;          // 밑줄로 자릿수 구분 가능
long gold  = 5_000_000_000L;     // int 범위(약 21억)를 넘으니 long
double crit = 1.5;               // 소수점이 있으면 기본 double
decimal price = 9.99M;           // decimal은 M 접미사 필요
float speed = 2.5F;              // float는 F 접미사 필요
```

> 🔧 보충(책 외): **C++과 비교** — C#의 정수 크기는 플랫폼과 무관하게 고정이다(`int`는 항상 `System.Int32`, `long`은 항상 `System.Int64`). ⚠️ C++에서 `long`은 Windows(MSVC, LLP64)에서 32비트, 리눅스 64비트(LP64)에서 64비트지만, C#의 `long`은 언제나 64비트로 `int64_t`에 해당한다. 또 C#의 `byte`는 부호 없음(`uint8_t`), `sbyte`가 부호 있음이며, `char`는 1바이트가 아니라 16비트 UTF-16 코드 단위다. `decimal`에 해당하는 표준 타입은 C++에 없다.

**방치형 RPG 서버에서는** 서버가 계산하는 골드나 데미지는 금방 21억(int 한계)을 넘으므로 처음부터 `long`(더 커지면 [제5부](05_제5부_NET_기본_라이브러리.md)의 `BigInteger`)로 설계하는 편이 안전하다.

> 🔧 보충(책 외): 방치형 게임에서는 "1.5A", "3.2B" 같은 단위 표기까지 갈 만큼 숫자가 커진다. 이런 규모는 long도 넘으므로, 서버 초반에 재화 타입과 DB 저장 방식(컬럼 타입 등)을 정하는 일이 중요하다는 게임 쪽 관점이다.

### 3.2 숫자 리터럴과 접미사

**한 줄 요약:** 소수점이 있으면 `double`, 없으면 `int`(안 맞으면 `uint`, `long`, `ulong`)로 자동 판단되며, `F`/`M`/`L` 접미사로 타입을 명시한다.

> 📖 출처: C# 12 in a Nutshell 2장 "Numeric Literals" (텍스트 L3219-3303)

**핵심 설명**
- 기본 규칙: 소수점 또는 `E`가 있으면 double. 없으면 int → uint → long → ulong 중 값이 들어가는 첫 타입.
- 접미사: `F`(float), `D`(double), `M`(decimal), `U`(uint), `L`(long), `UL`(ulong). 특히 **`F`와 `M`은 꼭 붙여야** 하는 경우가 많다(안 붙이면 double로 인식돼 컴파일 오류).
- `1_000_000`처럼 밑줄로 읽기 쉽게 쓸 수 있다.

```csharp
long big = 3_000_000_000;   // int에는 안 들어가서 uint 리터럴로 추론된 뒤 long에 대입됨
float f = 4.5F;             // 4.5만 쓰면 double이라 오류
decimal d = -1.23M;         // M 없으면 오류
```

> 🔧 보충(책 외): **C++과 비교** — C++에서 `float f = 4.5;`는 경고 정도로 넘어가는 축소 변환이지만, C#에서는 double → float 암시적 변환이 없어 **컴파일 오류**다. 자릿수 구분자는 C++14의 `1'000'000` 대신 `1_000_000`을 쓴다.

**방치형 RPG 서버에서는** 큰 상수를 쓸 때 `1_000_000_000`처럼 밑줄을 넣으면 0의 개수 실수를 줄일 수 있다.

### 3.3 숫자 변환

**한 줄 요약:** 값이 다 들어가면 자동(암시적) 변환, 잘릴 수 있으면 `(타입)` 캐스트(명시적 변환)가 필요하다.

> 📖 출처: C# 12 in a Nutshell 2장 "Numeric Conversions" (텍스트 L3305-3360)

**핵심 설명**
- 정수끼리: 목적 타입이 원래 타입의 모든 값을 담을 수 있으면 자동, 아니면 캐스트(`int` → `long` 자동, `int` → `short` 캐스트).
- 실수 → 정수는 항상 캐스트이며, 소수부는 **반올림 없이 버려진다**(반올림하려면 `Convert` 계열 사용, [제5부](05_제5부_NET_기본_라이브러리.md)).
- 큰 정수를 `float`로 바꾸면 크기는 유지되지만 정밀도가 떨어질 수 있다(원문: 100000001 → 100000000).
- 정수는 `decimal`로 자동 변환된다. 그 밖의 decimal 관련 숫자 변환(decimal에서 정수로, float/double과의 변환 등)은 모두 명시적이다.
- `float`는 `double`로 자동 변환되지만 반대는 명시적이다. 모든 정수 타입은 실수 타입으로 자동 변환된다.

```csharp
int level = 12345;
long big = level;              // 자동
short small = (short)level;    // 명시적

double dps = 12.9;
int shown = (int)dps;          // 12 (버림, 반올림 아님)
```

> 🔧 보충(책 외): **C++과 비교** — 버림 규칙은 C++과 같다. 다른 점은 C++이 `int` → `short`, `double` → `int`를 경고만 내고 암시적으로 허용하는 반면, C#은 손실 가능 변환에 **캐스트를 강제**한다는 것이다. 또 범위를 벗어난 실수 → 정수 변환은 C++에서 UB지만, C#에서는 unchecked 문맥에서 예외 없이 지정되지 않은 값이 나오고 `checked` 문맥(→ 3.4)에서는 `OverflowException`이 난다.

**방치형 RPG 서버에서는** `(int)` 캐스트로 소수 데미지·보상을 정수로 만들면 항상 내림이 된다는 점, 큰 long을 float로 바꾸면 값이 어긋난다는 점을 기억하자. 이 값이 API 응답과 DB에 그대로 들어간다.

### 3.4 정수 연산: 나눗셈과 오버플로, checked

**한 줄 요약:** 정수 나눗셈은 나머지를 버리고, 정수 오버플로는 **조용히 값이 뒤집힌다**. `checked`를 쓰면 예외로 알 수 있다.

> 📖 출처: C# 12 in a Nutshell 2장 "Specialized Operations on Integral Types (Division, Overflow, Overflow check operators)" (텍스트 L3389-3485)

**핵심 설명**
- 정수 나눗셈은 0 방향으로 나머지를 버린다(`2 / 3 == 0`). 값이 0인 변수로 나누면 실행 중 `DivideByZeroException`이 나고, 리터럴/상수 0으로 나누면 컴파일 오류다.
- 오버플로: 기본 상태에서는 예외 없이 "감아 돌기(wraparound)"가 일어난다. `int.MinValue`에서 1을 빼면 `int.MaxValue`가 된다.
- `checked(...)` 또는 `checked { }` 블록 안에서는 범위를 넘으면 `OverflowException`이 발생한다. 약간의 성능 비용이 있다.
- `decimal`은 항상 검사되고, `double`/`float`은 예외 대신 무한대 값이 된다.
- 프로젝트 전체를 checked로 만들 수도 있고, 그때 일부만 `unchecked`로 끌 수도 있다.

```csharp
int hp = int.MaxValue;
hp++;                               // 조용히 -2147483648 로 뒤집힘!
Console.WriteLine(hp);

int a = 1_000_000, b = 1_000_000;
try
{
    int total = checked(a * b);     // 10^12은 int 범위 초과 -> 예외
}
catch (OverflowException)
{
    Console.WriteLine("데미지가 int 범위를 넘었다!");
}

long safe = (long)a * b;            // 애초에 long으로 계산하면 OK
```

> 🔧 보충(책 외): **C++과 비교 — 가장 중요한 차이**
> - C++에서 **부호 있는** 정수 오버플로는 UB다. 컴파일러가 "오버플로는 일어나지 않는다"고 가정하고 최적화하므로(예: `x + 1 > x`를 항상 true로 접음) 결과를 예측할 수 없다. 부호 없는 정수만 모듈로 연산으로 정의되어 있다.
> - C#은 기본(unchecked) 상태에서 부호 있는 정수도 **2의 보수 wraparound로 정의**되어 있다. 그래서 "UB라서 최적화가 이상하게 된다"는 문제는 없지만, 대신 **아무 신호 없이 음수 골드가 만들어진다**. C++처럼 sanitizer(`-fsanitize=undefined`)가 잡아 주지도 않는다.
> - 0으로 나누기도 C++에서는 UB(대개 하드웨어 예외로 프로세스 종료)지만, C#에서는 잡을 수 있는 `DivideByZeroException`이다.
> - ⚠️ `(long)a * b`와 `(long)(a * b)`는 다르다. 뒤의 것은 int 곱셈이 이미 감아 돈 뒤에 long으로 바꾸므로 소용없다. 이 점은 C++과 같다.

**방치형 RPG 서버에서는** 골드나 데미지가 갑자기 음수가 되는 버그의 대표 원인이 바로 이 조용한 int 오버플로다. `long`으로 시작하고, 곱셈이 큰 곳(오프라인 보상 계산 등)은 `checked`로 안전망을 걸어 두자.

### 3.5 double vs decimal, 반올림 오차

**한 줄 요약:** `double`은 빠르지만 0.1 같은 값을 정확히 못 담고, `decimal`은 정확하지만 느리다.

> 📖 출처: C# 12 in a Nutshell 2장 "Special Float and Double Values / double Versus decimal / Real Number Rounding Errors" (텍스트 L3525-3646)

**핵심 설명**
- `float`와 `double`은 2진수 기반이라 소수 부분이 있는 대부분의 리터럴이 근사값이다. 원문 예: `float x = 0.1f`를 10번 더하면 1.0000001이 된다.
- `decimal`은 10진수 기반이라 0.1은 정확하지만, 1/6 같은 순환소수는 decimal도 오차가 생긴다.
- 표 요약: double은 유효 15-16자리, 프로세서가 직접 지원해 빠름 / decimal은 유효 28-29자리, 프로세서 비직접 지원이라 double보다 약 10배 느림.
- 오차가 쌓이면 `==` 비교가 깨질 수 있어 실수의 동등 비교는 조심해야 한다.
- double은 `NaN`, 무한대 같은 특수 값이 있고, `NaN == NaN`은 false이므로 `double.IsNaN`으로 검사한다.

```csharp
double sum = 0;
for (int i = 0; i < 10; i++) sum += 0.1;
Console.WriteLine(sum == 1.0);        // False (오차)

decimal money = 0;
for (int i = 0; i < 10; i++) money += 0.1M;
Console.WriteLine(money == 1.0M);     // True

Console.WriteLine(double.IsNaN(0.0 / 0.0)); // True
```

> 🔧 보충(책 외): **C++과 비교** — `float`/`double`은 C++과 같은 IEEE 754 타입이라 0.1 오차, NaN, 무한대의 성질이 똑같다(`std::isnan`에 해당하는 것이 `double.IsNaN`). 새로운 것은 `decimal`뿐이다.

**방치형 RPG 서버에서는** 초당 수익 증가율, 공격 속도 같은 "성장률 배수"는 double로 충분하다. 그러나 "정확히 맞아야 하는 재화"(유료 재화 등)를 소수로 다룬다면 decimal이 후보다.

> 🔧 보충(책 외): 골드처럼 개수가 정수인 재화는 소수 없이 `long`이 가장 단순하고 오차가 없으며, 서버가 계산한 값을 그대로 DB에 저장하기에도 좋다는 것이 일반적인 관례다. 이 판단은 책 내용이 아니다.

---

## 코어 4. null 방어 — 식·연산자와 `?.` / `??` / `??=`

> 연산자 우선순위·복합 대입·단락 평가는 C++과 같다. 새로 익힐 것은 ① `bool`이 숫자와 섞이지 않는다는 것, ② null 역참조가 크래시가 아니라 예외라는 것, ③ C++에 없는 null 연산자 3형제다.

### 4.1 null

**한 줄 요약:** null은 "참조가 아무 객체도 가리키지 않음"이며, 그 상태에서 멤버를 쓰면 실행 중 오류가 난다.

> 📖 출처: C# 12 in a Nutshell 2장 "Null" (텍스트 L3038-3077)

**핵심 설명**
- 참조 타입 변수에는 `null`을 넣을 수 있다. null인 변수의 멤버를 쓰면 `NullReferenceException`이 발생한다.
- 값 타입(`int`, `struct`)에는 보통 null을 넣을 수 없다(컴파일 오류). null을 담고 싶은 값 타입은 "nullable 값 타입"(`int?`)이라는 별도 기능을 쓴다([제4부](04_제4부_델리게이트_예외_현대C샤프.md)에서 다룸).
- 책은 nullable 참조 타입 기능이 실수로 인한 NullReferenceException을 줄여 준다고 소개한다.

```csharp
Monster target = null;
Console.WriteLine(target == null);   // True
// Console.WriteLine(target.Name);   // 실행 중 오류: NullReferenceException

int gold = 0;        // OK
// int bad = null;   // 컴파일 오류
```

> 🔧 보충(책 외): **C++과 비교** — C++의 nullptr 역참조는 UB이고 보통 세그폴트로 프로세스가 죽는다. C#의 `NullReferenceException`은 잡을 수 있는 예외라서, 웹 서버에서는 대개 그 요청 하나만 500 오류로 실패하고 서버는 계속 돈다. 그렇다고 안전한 것은 아니다. 처리 도중 예외가 나면 "골드는 차감됐는데 아이템은 안 들어간" 반쯤 처리된 상태가 남을 수 있다.

**방치형 RPG 서버에서는** "현재 공격 대상"이나 "DB에서 찾은 유저"처럼 없을 수도 있는 값이 흔하다. 없을 때를 항상 확인하는 습관(→ 4.4의 `?.`, `??`)이 필수다.

### 4.2 bool과 비교·조건 연산자

**한 줄 요약:** 조건은 `bool`로 판단하고, `&&`/`||`는 앞에서 결과가 정해지면 뒤를 건너뛴다(단락 평가).

> 📖 출처: C# 12 in a Nutshell 2장 "Boolean Type and Operators / Equality and Comparison Operators / Conditional Operators" (텍스트 L3648-3776)

**핵심 설명**
- `bool`은 `true`/`false` 두 값이고 숫자와 상호 변환되지 않는다.
- `==`, `!=`, `<`, `>`, `<=`, `>=`는 항상 `bool`을 낸다. 값 타입은 "값이 같은가", **참조 타입은 기본적으로 "같은 객체인가"를** 비교한다.
- `&&`(그리고), `||`(또는), `!`(아님). `&&`/`||`는 단락 평가라서 `if (sb != null && sb.Length > 0)` 같은 null 안전 검사가 가능하다.
- 삼항 연산자 `조건 ? a : b`는 조건이 참이면 a, 아니면 b를 낸다.

```csharp
int hp = 30, maxHp = 100;
bool lowHp = hp < maxHp * 0.3;
Monster target = null;

if (target != null && target.Hp > 0)   // target이 null이면 뒤는 실행 안 됨
    Console.WriteLine("공격!");

string state = lowHp ? "위험" : "정상";

class Monster { public int Hp; }
```

> 🔧 보충(책 외): **C++과 비교** — "bool은 숫자와 상호 변환되지 않는다"는 것은 C++ 습관을 직접 막는다. `if (count)`, `if (ptr)`, `while (n--)`처럼 정수·포인터를 조건에 바로 쓸 수 없고 `count != 0`, `target != null`로 써야 한다. 덕분에 `if (hp = 0)` 같은 대입 실수는 컴파일 오류가 된다. 참조 타입의 `==`가 "같은 객체인가"를 본다는 것은 C++에서 두 포인터를 `==`로 비교하는 것과 같다(단 string은 예외, → 5.1).

**방치형 RPG 서버에서는** "대상이 있고 살아 있으면 공격" 같은 조건이 서버가 계산하는 자동 전투 루프의 핵심이며, 단락 평가가 null 오류를 막아 준다.

### 4.3 식과 연산자 기초

**한 줄 요약:** 식은 "값을 만드는 코드"이고, 연산자로 조합하며, 우선순위와 결합 방향이 계산 순서를 정한다.

> 📖 출처: C# 12 in a Nutshell 2장 "Expressions and Operators / Assignment Expressions / Operator Precedence and Associativity" (텍스트 L5203-5314)

**핵심 설명**
- 식은 상수, 변수, 연산자로 조합한 것이다. 메서드 호출(`Math.Log(1)`)도 식이다.
- 대입도 값을 가지는 식이라 `a = b = c = 0`처럼 쓸 수 있다.
- 복합 대입: `x *= 2`는 `x = x * 2`와 같다. (`+=`, `-=`도 같은 원리.)
- 우선순위: `*`가 `+`보다 먼저. 헷갈리면 괄호를 쓰자. 대부분의 이항 연산자는 왼쪽에서 오른쪽으로, 대입·`??`·삼항은 오른쪽에서 왼쪽으로 계산한다.

```csharp
long gold = 100;
gold += 50;              // 150
gold *= 2;               // 300
long a, b;
a = b = 0;               // 둘 다 0
long result = 1 + 2 * 3; // 7  (2*3 먼저)
long result2 = (1 + 2) * 3; // 9
```

> 🔧 보충(책 외): **C++과 비교** — 우선순위·결합 방향은 C++과 거의 같다. 다른 점은 C#이 피연산자를 **왼쪽에서 오른쪽 순서로 평가하도록 정해 두었다**는 것이다. C++에서 `f() + g()`의 호출 순서가 정해지지 않았던 것과 달리, C#에서는 항상 `f()`가 먼저 호출된다.

**방치형 RPG 서버에서는** 서버가 계산하는 수익 공식(예: `기본 * (1 + 보너스) * 배수`)에 괄호를 명확히 써 두면 계산 순서 버그를 피할 수 있다.

### 4.4 null 연산자: `??`, `??=`, `?.`

**한 줄 요약:** `??`는 "null이면 대신 이 값", `??=`는 "null이면 여기에 대입", `?.`는 "null이면 그냥 null로 끝내고 넘어가기"이다.

> 📖 출처: C# 12 in a Nutshell 2장 "Null Operators (Null-Coalescing Operator / Null-Coalescing Assignment Operator / Null-Conditional Operator)" (텍스트 L5532-5635)

**핵심 설명**
- `a ?? b`: a가 null이 아니면 a, null이면 b. a가 null이 아니면 b는 계산하지 않는다.
- `a ??= b`: a가 null일 때만 b를 대입. `if (a == null) a = b;`와 같다.
- `a?.Foo()` / `a?.Prop` / `a?[i]`: a가 null이면 **예외 없이** 결과가 null이다. 뒤에 `.`이 더 이어져도 통째로 단락된다.
- 결과가 값 타입(int)이면 null을 받을 수 없으므로 `int?`로 받아야 한다(`int? len = sb?.ToString().Length;`).
- `?.`와 `??`를 함께 쓰면 "null이면 기본값"이 한 줄로 된다. void 메서드에도 `obj?.Method();` 형태로 쓸 수 있다.

```csharp
Monster target = null;

string name = target?.Name ?? "대상 없음";   // target이 null이면 "대상 없음"
int? hp = target?.Hp;                        // null (int?로 받음)
target?.TakeDamage(10);                      // null이면 아무 일도 안 함

string title = null;
title ??= "초보 모험가";                      // null이라서 대입됨

class Monster
{
    public string Name = "Slime";
    public int Hp = 10;
    public void TakeDamage(int d) { Hp -= d; }
}
```

> 🔧 보충(책 외): **C++과 비교** — C++에는 이 연산자들이 없어서 `if (target) target->TakeDamage(10);`, `auto name = target ? target->Name : "대상 없음";`처럼 매번 직접 썼다. ⚠️ 함정: `target?.TakeDamage(10)`은 null일 때 **조용히 아무 일도 하지 않는다**. "대상이 없으면 요청 자체가 잘못된 것"인 상황에서 `?.`를 쓰면 버그를 숨기게 되므로, 그런 곳은 명시적으로 검사하고 오류로 처리해야 한다.

**방치형 RPG 서버에서는** 전투 계산 중 "대상이 죽어서 사라진 순간"이나 "요청한 데이터가 DB에 없는 경우"가 자주 생기므로, `target?.TakeDamage(...)`와 `?? 기본값` 패턴이 NullReferenceException을 막는 가장 간단한 방어책이다.

---

## 코어 5. 문자열·배열·제어문 — 자동 전투·보상 루프 만들기

> 제어문은 C++과 거의 같으니 빠르게 넘기되, ⚠️ 표시(불변 string, 범위 검사 배열, fall-through 없는 switch, 안쪽 블록의 같은 이름 금지)만 챙기자.

### 5.1 문자와 문자열, 보간

**한 줄 요약:** 문자열은 `"..."`, 값을 끼워 넣을 때는 `$"...{식}..."`(문자열 보간)을 쓴다.

> 📖 출처: C# 12 in a Nutshell 2장 "Strings and Characters / String Type" (텍스트 L3778-4030)

**핵심 설명**
- `char`는 문자 하나(작은따옴표 `'A'`), `string`은 **불변**(수정 불가)의 문자 나열이다. string은 참조 타입이지만 `==`는 내용 비교를 한다.
- `\n`(줄바꿈), `\t`(탭) 같은 이스케이프 문자가 있다. 역슬래시를 그대로 쓰려면 `@"..."`(축자 문자열) 또는 `"""..."""`(원시 문자열, C# 11)을 쓴다. 원시 문자열은 JSON 같은 텍스트를 쓸 때 편하다.
- `+`로 이어 붙일 수 있지만, 반복해서 이어 붙이면 비효율적이라 `StringBuilder`를 권한다([제5부](05_제5부_NET_기본_라이브러리.md)·[제3부](03_제3부_메모리와_성능_기초.md)).
- **문자열 보간** `$"..."`: 중괄호 안에 아무 식이나 넣을 수 있고, 콜론 뒤에 서식을 붙일 수 있다(`{value:X2}`). 콜론이 삼항 연산자와 겹치면 괄호로 감싼다.
- 순서 비교(`<`, `>`)는 문자열에는 안 되고 `CompareTo`를 써야 한다.

```csharp
string name = "Arthur";
long gold = 1_234_567;
int level = 12;

string msg = $"{name} Lv.{level} / 골드: {gold:N0}";   // N0 = 천 단위 구분
Console.WriteLine(msg);

string status = $"HP 상태: {(level > 10 ? "강함" : "약함")}"; // 삼항은 괄호로

string json = """{ "name": "Arthur", "level": 12 }""";  // 원시 문자열
```

> 🔧 보충(책 외): `{gold:N0}`의 `N0` 서식은 이 절의 원문에는 없는 예시다(원문은 `X2` 예시만 나옴). 서식 문자열의 자세한 목록은 원문의 다른 장("String.Format and composite format strings")에 있다.

> 🔧 보충(책 외): **C++과 비교** — `std::string`은 가변이고 값 의미론(대입하면 복사)이지만, C# `string`은 **참조 타입 + 불변**이다. 대입해도 참조만 복사되는데, 어차피 내용을 바꿀 수 없으니 값처럼 안전하게 쓸 수 있다. ⚠️ 대신 `s += "x"`는 기존 문자열을 고치는 것이 아니라 매번 **새 문자열 객체를 힙에 만든다**. 루프 안에서 이어 붙이면 C++의 `std::string::append`와 달리 할당이 반복된다. `s[0] = 'A'` 같은 인덱스 수정도 불가능하다. 또 C# `char`는 16비트(UTF-16)라서 한글 한 글자가 `char` 하나에 들어간다(이모지 등 일부 문자는 두 개 필요). 보간 `$"..."`는 `std::format`과 비슷한 역할이다.

**방치형 RPG 서버에서는** "획득 골드: +12,345 (초당 300)" 같은 응답 메시지나 로그 문자열을 만들 때 보간이 가장 깔끔하다. 다만 요청마다 대량의 문자열을 이어 붙이면 부담이 되므로 꼭 필요한 곳에서만 만들자([제3부](03_제3부_메모리와_성능_기초.md)에서 다룸).

### 5.2 배열

**한 줄 요약:** 배열은 같은 타입 값을 연속 메모리에 담은 **고정 길이** 목록이다.

> 📖 출처: C# 12 in a Nutshell 2장 "Arrays / Default Element Initialization / Simplified Array Initialization Expressions / Bounds Checking" (텍스트 L4046-4171, L4321-4423)

**핵심 설명**
- `타입[] 이름 = new 타입[길이]`. 인덱스는 0부터 시작하고 `Length`로 길이를 알 수 있다. 한 번 만들면 **길이를 바꿀 수 없다**(가변 길이는 `List` 등, [제5부](05_제5부_NET_기본_라이브러리.md)).
- 초기화: `int[] a = { 1, 2, 3 };` 또는 C# 12의 `int[] a = [1, 2, 3];`(컬렉션 식). `var a = new[] {1, 2, 3}`도 가능하다.
- 만들면 각 칸이 기본값(숫자는 0)으로 채워진다. 요소가 **class(참조 타입)면 칸이 전부 null**이라서 각각 `new`로 만들어 넣어야 한다. struct라면 칸마다 값이 바로 들어 있다.
- 배열 자체는 항상 참조 타입이라 `int[] a = null;`도 가능하다.
- 범위 밖 인덱스는 `IndexOutOfRangeException`을 던진다(런타임이 항상 검사).
- 다차원: 사각형 `int[,]`과 배열의 배열 `int[][]`(가변 배열).

```csharp
int[] upgradeCost = { 100, 250, 600, 1500 };
Console.WriteLine(upgradeCost.Length);   // 4

for (int i = 0; i < upgradeCost.Length; i++)
    Console.WriteLine($"{i}단계 비용: {upgradeCost[i]}");

Monster[] wave = new Monster[3];         // 칸은 전부 null
for (int i = 0; i < wave.Length; i++)
    wave[i] = new Monster();             // 하나씩 만들어 채움

// upgradeCost[4] = 1;                   // IndexOutOfRangeException

class Monster { public int Hp = 10; }
```

> 🔧 보충(책 외): **C++과 비교** — ⚠️ `new Monster[3]`은 C++처럼 기본 생성자를 3번 불러 객체 3개를 만드는 것이 아니라, **참조 3칸(전부 null)**만 만든다. C++로 치면 `Monster* wave[3] = {}`에 가깝다. 또 C++ 배열·`std::vector::operator[]`은 범위를 검사하지 않아 범위 밖 접근이 UB(메모리 오염)지만, C# 배열은 항상 검사해서 예외를 던진다. 배열 변수는 C++의 고정 배열(값)이 아니라 힙 배열 객체에 대한 참조이므로, 대입하면 배열이 복사되지 않고 공유된다(→ 코어 2).

**방치형 RPG 서버에서는** 업그레이드 단계별 비용표, 스테이지별 몬스터 체력표처럼 "번호로 찾는 고정 데이터"에 배열이 잘 맞는다. 서버가 이 표로 비용을 검증하므로 클라이언트가 보낸 값을 믿지 않는다. class 배열은 각 칸을 채우기 전에는 null이라는 점을 꼭 기억하자.

### 5.3 인덱스(^)와 범위(..)

> 🔧 보충(책 외): 서버 개발에서는 선택 학습

**한 줄 요약:** `^1`은 "뒤에서 첫 번째", `..`는 "구간 자르기"이다.

> 📖 출처: C# 12 in a Nutshell 2장 "Indices and Ranges" (텍스트 L4173-4231)

**핵심 설명**
- `arr[^1]`은 마지막, `arr[^2]`는 끝에서 두 번째 요소다.
- `arr[..2]`는 앞 두 개, `arr[2..]`는 인덱스 2부터 끝까지, `arr[2..3]`은 인덱스 2 하나. **끝 숫자는 포함하지 않는다**.
- `arr[^2..]`처럼 조합할 수 있다.

```csharp
int[] dmgLog = { 10, 20, 30, 40, 50 };
int last = dmgLog[^1];          // 50
int[] top2 = dmgLog[..2];       // {10, 20}
int[] recent3 = dmgLog[^3..];   // {30, 40, 50}
```

> 🔧 보충(책 외): **C++과 비교** — 범위의 끝을 포함하지 않는 것은 C++ 반복자 구간 `[begin, end)`와 같은 규칙이다. ⚠️ 다만 배열에 범위(`..`)를 쓰면 `std::span`처럼 원본을 가리키는 뷰가 아니라 **새 배열로 복사**된다.

**방치형 RPG 서버에서는** "최근 전투 로그 3개만 응답에 담기"처럼 뒤쪽 몇 개만 골라낼 때 쓸 수 있다.

### 5.4 선언문과 지역 변수 범위

**한 줄 요약:** 지역 변수의 유효 범위는 그것이 선언된 `{ }` 블록 전체이고, 같은 이름을 안쪽 블록에서 다시 만들 수 없다.

> 📖 출처: C# 12 in a Nutshell 2장 "Statements / Declaration Statements / Expression Statements" (텍스트 L5636-5750)

**핵심 설명**
- `int a = 1, b = 2;`처럼 같은 타입 변수를 여러 개 선언할 수 있다. `const`는 선언과 함께 초기화해야 하고 바꿀 수 없다.
- 블록 밖에서는 안쪽 변수를 쓸 수 없다. 이름이 겹치면 컴파일 오류다.
- 식 문장으로 쓸 수 있는 것은 대입(증감 포함), 메서드 호출, 객체 생성뿐이다.

```csharp
int gold = 0;
{
    int bonus = 10;      // 이 블록 안에서만 유효
    gold += bonus;
}
// Console.WriteLine(bonus); // 오류: 범위 밖
```

> 🔧 보충(책 외): **C++과 비교** — ⚠️ C++은 안쪽 블록에서 바깥 변수와 같은 이름을 다시 선언하는 것(shadowing)을 허용하지만, C#은 같은 메서드 안에서 이를 **컴파일 오류**로 막는다. 또 C++에서는 `a + b;` 같은 무의미한 식 문장이 경고에 그치지만, C#에서는 오류다.

**방치형 RPG 서버에서는** 보너스 계산 같은 임시 값을 블록 안에서 선언하면 그 블록 밖으로 새어 나가지 않는다는 점을 기억해 두면 된다.

### 5.5 if / else

**한 줄 요약:** 조건이 참일 때만 실행하고, `else if` 사슬로 여러 경우를 나눈다.

> 📖 출처: C# 12 in a Nutshell 2장 "Selection Statements (The if statement)" (텍스트 L5751-5897)

**핵심 설명**
- `if (조건) 문장;` 뒤에 `else`를 붙일 수 있다. `else`는 가장 가까운 `if`에 붙는다.
- 중괄호를 쓰면 의도가 분명해진다. `else if`를 이어 붙이는 형태는 관용적으로 쓰인다.

```csharp
int hp = 25, maxHp = 100;

if (hp <= 0)
    Console.WriteLine("사망");
else if (hp < maxHp * 0.3)
    Console.WriteLine("위험");
else
    Console.WriteLine("정상");
```

> 🔧 보충(책 외): **C++과 비교** — 문법은 같다. 조건식이 반드시 `bool`이어야 한다는 점만 다르다(→ 4.2).

**방치형 RPG 서버에서는** 체력 구간에 따라 자동 스킬 발동, 회복 포션 사용 같은 전투 판정이 대부분 if 사슬이다.

### 5.6 switch 문과 switch 식

**한 줄 요약:** 하나의 값을 여러 경우로 나눌 때는 switch, 값을 "돌려받고" 싶을 때는 더 짧은 **switch 식**이 편하다.

> 📖 출처: C# 12 in a Nutshell 2장 "The switch statement (Switching on types / Switch expressions)" (텍스트 L5899-6195)

**핵심 설명**
- switch 문: 각 `case` 끝에 `break`, `return` 등 점프문이 반드시 있어야 한다(다음 case로 흘러가지 않음). 여러 case를 나란히 적으면 같은 코드를 공유한다. `default`는 나머지 경우다.
- 상수 switch는 숫자, `bool`, `char`, `string`, `enum`에 쓸 수 있다.
- 타입/패턴으로도 분기할 수 있다(`case int i:`, `when` 조건). 패턴은 [제4부](04_제4부_델리게이트_예외_현대C샤프.md)에서 다룬다.
- **switch 식**(C# 8): `값 switch { 패턴 => 결과, ... }`. `_`가 default 역할이다. `_`를 빼고 어느 것도 맞지 않으면 예외가 난다. 여러 값을 튜플로 묶어 분기할 수도 있다.

```csharp
int rank = 2;

string grade = rank switch      // switch 식
{
    1 => "전설",
    2 => "영웅",
    3 => "희귀",
    _ => "일반"
};

switch (rank)                    // switch 문
{
    case 1:
    case 2:
        Console.WriteLine("고급 아이템");
        break;
    default:
        Console.WriteLine("일반 아이템");
        break;
}
```

> 🔧 보충(책 외): **C++과 비교** — ⚠️ C++에서는 `break`를 빼먹으면 다음 case로 조용히 흘러가는(fall-through) 버그가 나지만, C#은 코드가 있는 case 끝에 점프문이 없으면 **컴파일 오류**다. 위 예제의 `case 1: case 2:`처럼 빈 case를 나란히 쌓는 것만 허용된다. 의도적으로 다음 case로 가려면 `goto case 2;`를 명시한다. 또 C++ switch는 정수형만 되지만 C#은 `string`으로도 분기할 수 있다. switch 식은 C++에 대응하는 것이 없다.

**방치형 RPG 서버에서는** 아이템 등급별 배율, 몬스터 종류별 행동처럼 "종류에 따라 값을 고르는" 서버 계산 코드에 switch 식이 잘 맞는다.

### 5.7 while / do-while / for / foreach

**한 줄 요약:** 조건이 참인 동안 반복하거나(`while`), 횟수로 반복하거나(`for`), 목록을 하나씩 돌린다(`foreach`).

> 📖 출처: C# 12 in a Nutshell 2장 "Iteration Statements" (텍스트 L6197-6313)

**핵심 설명**
- `while`: 조건을 **먼저** 검사한다. `do-while`: 몸체를 **먼저 한 번 실행한 뒤** 검사한다(최소 1회 실행).
- `for (초기화; 조건; 증감)`: 세 부분 중 무엇이든 생략할 수 있다. `for(;;)`는 무한 루프다.
- `foreach (타입 x in 열거 가능한 것)`: 배열, 문자열 등 "열거 가능한" 객체의 요소를 차례로 꺼낸다.

```csharp
int[] enemyHp = { 30, 50, 80 };
int totalDamage = 40;

foreach (int hp in enemyHp)                 // 목록 순회
    Console.WriteLine($"적 HP {hp}");

for (int i = 0; i < enemyHp.Length; i++)    // 인덱스가 필요할 때
    enemyHp[i] -= totalDamage;

int tick = 0;
while (tick < 3)                            // 조건 반복
{
    Console.WriteLine($"틱 {tick}");
    tick++;
}
```

> 🔧 보충(책 외): **C++과 비교** — `foreach (int hp in enemyHp)`는 C++의 `for (int hp : enemyHp)`(범위 기반 for)에 해당한다. ⚠️ 반복 변수는 요소의 복사본(값 타입일 때)이며 C#에서는 읽기 전용이라 `hp -= 10`처럼 대입할 수 없다. 원소를 바꾸려면 위 예제처럼 인덱스 `for`를 쓴다. C++의 `for (auto& hp : v)` 같은 "참조로 순회하며 수정"은 기본 foreach로는 안 된다.

**방치형 RPG 서버에서는** "매 틱마다 모든 영웅이 공격하고 몬스터가 맞는" 전투나 "오프라인 시간만큼 보상을 계산하는" 반복을 서버가 수행하므로, foreach/for/while이 그 계산 루프의 뼈대가 된다.

### 5.8 break, continue, return (그리고 goto, throw)

**한 줄 요약:** `break`는 반복을 끝내고, `continue`는 이번 회차만 건너뛰고, `return`은 메서드를 끝낸다.

> 📖 출처: C# 12 in a Nutshell 2장 "Jump Statements" (텍스트 L6315-6455)

**핵심 설명**
- `break`: 가장 가까운 반복문(또는 switch)을 종료한다.
- `continue`: 몸체의 나머지를 건너뛰고 다음 반복으로 간다(원문 예: 짝수 건너뛰기).
- `return`: 메서드를 끝내며, 반환 타입이 있으면 그 값을 함께 돌려준다. 메서드 안 어디서든, 여러 번 쓸 수 있다.
- `throw`: 예외를 던져 오류를 알린다([제4부](04_제4부_델리게이트_예외_현대C샤프.md)). `goto`는 같은 블록 안의 레이블이나 switch의 다른 `case`로 실행을 옮기는 문장이다.

> 🔧 보충(책 외): 초보자가 `goto`를 쓸 일은 거의 없다는 것은 집필자의 의견이다.

```csharp
int[] enemyHp = { 0, 40, 0, 25, 60 };

for (int i = 0; i < enemyHp.Length; i++)
{
    if (enemyHp[i] <= 0) continue;        // 죽은 적은 건너뜀
    Console.WriteLine($"공격 대상: {i}");
    if (enemyHp[i] > 50) break;           // 강한 적을 찾으면 반복 종료
}

int FindFirstAlive(int[] hps)
{
    for (int i = 0; i < hps.Length; i++)
        if (hps[i] > 0) return i;         // 찾으면 즉시 종료
    return -1;
}
```

**방치형 RPG 서버에서는** "죽은 몬스터는 건너뛰기(continue)", "첫 번째 살아있는 몬스터를 찾으면 바로 반환(return)" 같은 흐름 제어가 서버의 자동 타게팅 계산에 자주 쓰인다.

---

## 실무 적용

### 체크리스트
- [ ] 문장 → 메서드 → 클래스 → 네임스페이스로 코드가 묶인다. (→ 코어 1)
- [ ] struct/숫자는 복사, class/배열/string은 참조 공유. 참조는 null일 수 있다. (→ 코어 2)
- [ ] 큰 숫자는 `long`부터. int 오버플로는 조용히 뒤집히며 `checked`로 잡을 수 있다. 실수는 double/decimal의 차이를 알고 고른다. (→ 코어 3)
- [ ] 문자열은 `$"..."` 보간, 배열은 고정 길이 + 0부터 인덱스(`^1`, `..` 지원). (→ 코어 5)
- [ ] `??`, `??=`, `?.`로 null 오류를 막는다. (→ 코어 4)
- [ ] if / switch(식) / for / foreach / while / break / continue / return으로 서버가 계산하는 자동 전투 루프를 만든다. (→ 코어 5)
- [ ] (C++ 습관 점검) 수정하려는 데이터를 `struct`로 만들어 메서드에 넘기고 있지 않은가? static 필드에 유저별 상태를 두지 않았는가? 곱셈 전에 `long`으로 바꿨는가(`(long)a * b`)? (→ 코어 1·2·3)

### 시나리오로 확인하기

1. **상황:** 오프라인 보상을 `int reward = goldPerSec * offlineSeconds;`로 계산했다. 초당 골드가 큰 고레벨 유저 몇 명의 골드가 지급 직후 음수가 됐다는 CS가 들어왔다. 서버 로그에는 예외가 하나도 없다. C++ 서버에서는 "UB니까 어차피 테스트에서 터지겠지"라고 넘겼던 부분이다.
   **질문:** 원인은 무엇이고, 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   C#의 정수 오버플로는 기본(unchecked) 상태에서 예외 없이 감아 돈다. 곱이 `int` 상한(2^31-1, 약 21억)을 넘어 음수로 뒤집힌 것이고, 정의된 동작이라 예외도 로그도 없다. ① 재화는 처음부터 `long`으로 설계하고, ② 곱셈은 `(long)a * b`처럼 **곱하기 전에** 넓힌다(`(long)(a * b)`는 이미 뒤집힌 뒤라 소용없음), ③ 큰 곱셈이 일어나는 오프라인 보상 계산 같은 곳은 `checked`로 감싸 `OverflowException`을 받아 거부·로그 처리한다. 더 커지면 `BigInteger` 등도 검토한다. → 코어 3 (3.1, 3.4)

   </details>

2. **상황:** 영웅 스탯을 `struct HeroStat { public int Atk; }`로 만들었다. `void Enhance(HeroStat s) { s.Atk += 10; }`을 호출한 뒤 저장했는데 공격력이 그대로다. C++에서 "작은 POD는 struct"로 쓰던 습관 그대로다.
   **질문:** 왜 안 바뀌었고, 해결책은 무엇인가?

   <details markdown="1"><summary>답 확인</summary>

   C#의 `struct`는 값 타입이라 메서드에 넘길 때 **복사본**이 전달되고, `Enhance`는 그 복사본만 바꿨다. C++의 `struct`/`class` 차이(기본 접근 지정자)와 달리 C#에서는 복사 의미론 자체가 다르다. 해결은 ① 변경 가능한 엔티티를 `class`로 만들거나(참조 공유), ② `ref HeroStat s`로 원본 변수를 넘기거나(호출부에도 `ref`), ③ 바뀐 값을 반환받아 다시 대입한다. → 코어 2 (2.1, 2.4)

   </details>

3. **상황:** 자동 전투 API에서 "현재 대상"이 이미 죽어 제거된 순간 요청이 오면 `target.TakeDamage(dmg)`에서 500 에러가 난다. 누군가 모든 곳을 `target?.TakeDamage(dmg)`로 바꾸자고 제안했다.
   **질문:** 원인은 무엇이고, 제안을 그대로 받아도 될까?

   <details markdown="1"><summary>답 확인</summary>

   null 참조의 멤버를 쓰면 `NullReferenceException`이 발생한다(C++처럼 프로세스가 죽지는 않지만 그 요청은 실패한다). `?.`는 null이면 예외 없이 아무 일도 하지 않으므로 "대상이 없을 수도 있는 것이 정상"인 자리에는 맞다. 하지만 대상이 없으면 요청 자체가 잘못된 경우라면 `?.`가 버그를 조용히 숨긴다. 그런 곳은 `if (target == null)`로 명시 검사하고 오류 응답을 내야 한다. 표시용 값은 `target?.Name ?? "대상 없음"`처럼 `??`로 기본값을 준다. → 코어 4 (4.1, 4.4)

   </details>

4. **상황:** 유료 재화 환산 비율을 `double`로 누적 계산한 뒤 `if (total == expected)`로 결제 검증을 했더니 가끔 검증이 실패한다.
   **질문:** 무엇이 문제이고, 어떤 타입을 써야 하나?

   <details markdown="1"><summary>답 확인</summary>

   double은 2진수 기반이라 0.1 같은 값도 근사값이며, 오차가 쌓이면 `==` 비교가 깨진다(0.1을 10번 더해도 `== 1.0`이 False). 정확히 맞아야 하는 값은 decimal(유효 28-29자리, 10진수 기반, 약 10배 느림)이나, 개수로 셀 수 있으면 정수 `long`으로 다룬다. 단 1/6 같은 순환소수는 decimal도 오차가 생긴다. → 코어 3 (3.5)

   </details>

5. **상황:** C++ 서버에서 하던 대로 `public static class Session { public static long CurrentUserGold; }`에 "지금 처리 중인 유저의 골드"를 넣어 두고 여러 메서드에서 읽게 했다. 부하 테스트에서 다른 유저의 골드가 응답에 섞여 나온다.
   **질문:** 왜 그런가?

   <details markdown="1"><summary>답 확인</summary>

   static 멤버는 타입 전체에 하나뿐이고(힙에 있으며 프로그램 끝까지 남는다), 서버는 여러 요청을 동시에 처리한다. 따라서 static에 유저별 상태를 두면 요청끼리 같은 변수를 덮어써 유저끼리 섞인다. 요청별 상태는 인스턴스(지역 변수, 요청마다 만든 객체)에 두고, static에는 "서버 전체에서 하나만 필요한 값"만 둔다([제9부](09_제9부_설계원칙과_패턴.md)의 Singleton 주의점). → 코어 1 (1.6), 코어 2 (2.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
제1부 C# 문법 기초  —  한 문장: ( ? )
├─ 코어 1 골격: 문장(;) → ( ? ) → 클래스 → ( ? ) / 컴파일 → ( ? ) / dotnet new·run·build
│   ├─ 이름 규칙: 지역 변수 ( ? )Case, 클래스·메서드 ( ? )Case, 예약어는 ( ? )를 붙여야
│   ├─ 미리 정의된 타입 / const / class(필드·생성자·메서드) / 인스턴스 vs ( ? ) 멤버 / public / 네임스페이스
│   └─ var = C++의 ( ? ) / target-typed ( ? )
├─ 코어 2 값 타입(____) vs 참조 타입(____)
│   ├─ 스택(지역 변수·매개변수) vs 힙(객체, ( ? )가 회수)
│   ├─ 확실한 할당(지역 변수) / 기본값: 참조 ( ? ), 숫자 ( ? ), char ( ? ), bool ( ? )
│   └─ 전달: 값 / ref(≈ C++ ( ? )) / out(반드시 ( ? )) / in(≈ C++ ( ? )) / params·선택·명명 인자
├─ 코어 3 숫자
│   ├─ 정수 1급 시민: ( ? ), ( ? )  — C# long은 항상 ( ? )비트
│   ├─ 리터럴: 소수점 있으면 ( ? ), 없으면 int→uint→long→ulong / 접미사 F·D·M·U·L·UL
│   ├─ 변환: 암시적 vs 명시적, 실수→정수는 ( 반올림? 버림? )
│   ├─ 오버플로: 기본 ( ? ) (C++ 부호 있는 정수는 ( ? )), checked → ( ? )Exception, 나눗셈 0 → ( ? )
│   └─ double(유효 __자리, 빠름) vs decimal(유효 __자리, 약 __배 느림), NaN 검사 = ( ? )
├─ 코어 4 null → ( ? )Exception / bool은 숫자와 ( ? ) / 단락 평가·삼항 / 우선순위·결합 방향 / ??  ??=  ?.
└─ 코어 5 string(불변, $"" 보간, @"", """ """) / 배열(고정 길이, 범위 검사, class 배열 칸은 ( ? )) / ^1, ..
    └─ 범위(안쪽 같은 이름 금지) / if / switch 문(fall-through ( ? )) vs switch 식(_ ) / while·do-while·for·foreach / break·continue·return
```

### 2. 인출 질문

1. 값 타입과 참조 타입을 각각 3가지 이상 들고, 대입했을 때 동작 차이를 설명해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   값 타입은 숫자 타입, `char`, `bool`, `struct`, `enum`이고 변수에 값 자체가 들어 있어 대입하면 통째로 복사되어 서로 영향을 주지 않는다. 참조 타입은 `class`, 배열, 델리게이트, 인터페이스, `string`이며 대입하면 참조만 복사되어 두 변수가 같은 객체를 본다. → 코어 2 (2.1)

   </details>

2. 인스턴스 멤버와 static 멤버의 차이는 무엇이고, 서버에서 static에 유저별 상태를 두면 왜 위험한가요?

   <details markdown="1"><summary>답 확인</summary>

   인스턴스 멤버는 객체마다 따로 있고(`m1.Name`), static 멤버는 타입 전체에 하나만 있어 타입 이름으로 접근한다(`Monster.Count`). 서버는 여러 요청을 동시에 처리하므로 static에 유저별 상태를 두면 유저끼리 섞이는 사고가 난다. → 코어 1 (1.6)

   </details>

3. 네임스페이스는 무엇을 해 주고, 무엇에는 영향을 주지 않나요?

   <details markdown="1"><summary>답 확인</summary>

   네임스페이스는 타입 이름의 영역으로, 계층 구조로 타입을 정리하고 이름 충돌을 막는다. `using`으로 가져오거나 전체 이름으로 쓴다. 어셈블리와는 별개이며 public/private 같은 접근 수준에도 영향을 주지 않는다. → 코어 1 (1.6)

   </details>

4. null인 참조 변수의 멤버를 쓰면 어떻게 되나요? `int`에 null을 넣으려면?

   <details markdown="1"><summary>답 확인</summary>

   실행 중 `NullReferenceException`이 발생한다. 값 타입에는 보통 null을 넣을 수 없고(컴파일 오류), null을 담으려면 nullable 값 타입 `int?`를 쓴다([제4부](04_제4부_델리게이트_예외_현대C샤프.md)). → 코어 4 (4.1)

   </details>

5. 책이 "1급 시민"이라 부른 정수 타입은 무엇이고, 방치형 서버에서 골드를 `int`가 아닌 `long`으로 시작하라는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   `int`와 `long`이다. `int`는 32비트로 상한이 약 21억(2^31-1)인데, 서버가 계산하는 골드·데미지는 금방 이를 넘으므로 처음부터 64비트 `long`(더 커지면 `BigInteger`)으로 설계하는 편이 안전하다. → 코어 3 (3.1)

   </details>

6. 리터럴 `4.5`를 `float` 변수에 바로 대입하면 왜 오류가 나나요? 정수 리터럴의 타입은 어떻게 정해지나요?

   <details markdown="1"><summary>답 확인</summary>

   소수점이나 `E`가 있는 리터럴은 기본이 `double`이라 `float`에 암시적으로 들어가지 않는다. `4.5F`처럼 접미사를 붙여야 한다(decimal은 `M`). 소수점이 없으면 int → uint → long → ulong 중 값이 들어가는 첫 타입이 된다. → 코어 3 (3.2)

   </details>

7. `(int)12.9`의 결과는? 큰 정수를 `float`로 바꾸면 어떤 문제가 생기나요?

   <details markdown="1"><summary>답 확인</summary>

   12다. 실수 → 정수 캐스트는 반올림 없이 소수부를 버린다(반올림하려면 `Convert` 계열). 큰 정수를 float로 바꾸면 크기는 유지되지만 정밀도가 떨어진다(원문 예: 100000001 → 100000000). → 코어 3 (3.3)

   </details>

8. `int.MaxValue`에 1을 더하면 어떻게 되나요? 이것을 예외로 알아차리려면? C++과는 무엇이 다른가요?

   <details markdown="1"><summary>답 확인</summary>

   기본 상태에서는 예외 없이 감아 돌아(wraparound) `int.MinValue`(-2147483648)가 된다. `checked(...)` 식이나 `checked { }` 블록 안에서는 `OverflowException`이 발생한다(약간의 성능 비용). `decimal`은 항상 검사되고, double/float은 예외 대신 무한대가 된다. C++에서 부호 있는 정수 오버플로는 UB지만 C#에서는 정의된 wraparound다. → 코어 3 (3.4)

   </details>

9. 정수 나눗셈 `2 / 3`의 결과와, 0으로 나눌 때 변수와 리터럴의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   0이다(0 방향으로 나머지를 버림). 값이 0인 변수로 나누면 실행 중 `DivideByZeroException`, 리터럴/상수 0으로 나누면 컴파일 오류다. → 코어 3 (3.4)

   </details>

10. double과 decimal을 정밀도·속도·용도로 비교하고, 0.1을 10번 더한 결과를 각각 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    double은 2진수 기반으로 유효 15-16자리, 프로세서가 직접 지원해 빠르다. decimal은 10진수 기반 유효 28-29자리, 약 10배 느리며 금융 계산처럼 정확한 10진 계산에 쓴다. 0.1을 10번 더하면 double은 `== 1.0`이 False, decimal은 True다. 단 1/6 같은 순환소수는 decimal도 오차가 생긴다. → 코어 3 (3.5)

    </details>

11. `NaN == NaN`은 무엇이고, NaN은 어떻게 검사하나요?

    <details markdown="1"><summary>답 확인</summary>

    false다. 그래서 `double.IsNaN(x)`로 검사한다. → 코어 3 (3.5)

    </details>

12. `&&`/`||`의 단락 평가가 null 오류를 어떻게 막아 주나요? 참조 타입의 `==`는 기본적으로 무엇을 비교하나요?

    <details markdown="1"><summary>답 확인</summary>

    `if (target != null && target.Hp > 0)`에서 앞이 false면 뒤를 평가하지 않으므로 null인 객체의 멤버에 접근하지 않는다. 참조 타입의 `==`는 기본적으로 "같은 객체인가"를 비교한다(단 string은 참조 타입이지만 내용 비교). → 코어 4 (4.2), 코어 5 (5.1)

    </details>

13. 문자열 보간에서 삼항 연산자를 쓸 때 주의점과, 원시 문자열(`"""..."""`)이 편한 상황은?

    <details markdown="1"><summary>답 확인</summary>

    보간의 콜론(서식 지정)이 삼항 연산자의 콜론과 겹치므로 `{(조건 ? a : b)}`처럼 괄호로 감싼다. 원시 문자열은 역슬래시·따옴표를 그대로 쓸 수 있어 JSON 같은 텍스트를 쓸 때 편하다. 또 string은 불변이라 반복 이어 붙이기에는 `StringBuilder`가 권장된다. → 코어 5 (5.1)

    </details>

14. `new Monster[3]`을 만든 직후 각 칸에는 무엇이 들어 있나요? struct 배열과 비교해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    class(참조 타입) 배열이므로 칸이 전부 null이고 각각 `new`로 만들어 넣어야 한다. struct 배열이면 칸마다 기본값으로 채워진 값이 바로 들어 있다. 배열은 고정 길이이며 범위 밖 인덱스는 `IndexOutOfRangeException`. → 코어 5 (5.2)

    </details>

15. `arr[^1]`, `arr[..2]`, `arr[2..3]`은 각각 무엇을 뜻하나요?

    <details markdown="1"><summary>답 확인</summary>

    `^1`은 마지막 요소, `..2`는 앞 두 개(인덱스 0, 1), `2..3`은 인덱스 2 하나다. 범위의 끝 숫자는 포함하지 않는다. → 코어 5 (5.3)

    </details>

16. 스택과 힙에는 각각 무엇이 살고, 값 타입이 힙에 있을 수도 있는 경우는?

    <details markdown="1"><summary>답 확인</summary>

    스택에는 지역 변수와 매개변수가 쌓였다가 메서드가 끝나면 사라진다. 힙에는 `new`로 만든 객체가 살고, 더 이상 쓰이지 않으면 GC가 회수한다(직접 삭제 불가). 값 타입은 "선언된 곳"에 살므로 클래스의 필드나 배열 요소라면 힙에 있다. static 필드도 힙에 있으며 프로그램 끝까지 남는다. → 코어 2 (2.2)

    </details>

17. 지역 변수와 필드의 초기화 규칙 차이, 그리고 타입별 기본값을 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    지역 변수는 값을 넣기 전에 읽으면 컴파일 오류(확실한 할당)이고, 필드·배열 요소는 런타임이 자동 초기화한다. 기본값은 참조 타입 null, 숫자·enum 0, char `'\0'`, bool false이며 `default`로 어떤 타입의 기본값도 얻을 수 있다. → 코어 2 (2.3)

    </details>

18. `ref`와 `out`의 차이, 그리고 참조 타입을 값으로 전달했을 때 메서드 안에서 할 수 있는 것과 없는 것은?

    <details markdown="1"><summary>답 확인</summary>

    `ref`는 넘기기 전에 값이 있어야 하고, `out`은 값이 없어도 되지만 메서드가 끝나기 전에 반드시 채워야 한다(여러 값 반환, TryXXX 패턴). `in`은 읽기 전용 참조로 큰 struct 복사를 피한다. 참조 타입을 값으로 넘기면 참조가 복사되므로 같은 객체의 내용은 바꿀 수 있지만, 매개변수를 다른 객체로 바꿔도 호출자 변수에는 영향이 없다. → 코어 2 (2.4)

    </details>

19. 선택 매개변수의 제약 3가지와 명명된 인자의 장점은?

    <details markdown="1"><summary>답 확인</summary>

    기본값은 상수 식(또는 `default` 등)이어야 하고, `ref`/`out`에는 쓸 수 없으며, 필수 매개변수가 선택 매개변수보다 앞에 온다(`params`는 항상 마지막). 명명된 인자(`hp: 5000`)는 순서를 바꿀 수 있고 선택 매개변수 중 원하는 것만 지정할 수 있다. → 코어 2 (2.5)

    </details>

20. `??`, `??=`, `?.`의 의미와, `target?.Hp`를 `int`가 아닌 `int?`로 받아야 하는 이유는? 그리고 switch 식에서 `_`가 없고 아무것도 맞지 않으면?

    <details markdown="1"><summary>답 확인</summary>

    `a ?? b`는 a가 null이면 b(아니면 b는 계산 안 함), `a ??= b`는 a가 null일 때만 대입, `a?.X`는 a가 null이면 예외 없이 결과가 null이고 뒤 체인도 통째로 단락된다. 결과가 null일 수 있으므로 값 타입은 `int?`로 받아야 한다. switch 식은 `_`가 default 역할이며, 없이 어느 패턴도 맞지 않으면 예외가 난다. → 코어 4 (4.4), 코어 5 (5.6)

    </details>

21. C++ 개발자가 C# switch 문에서 `break`를 빼먹으면 어떻게 되나요? `if (count)`는 왜 안 되나요?

    <details markdown="1"><summary>답 확인</summary>

    C#은 다음 case로 흘러가지 않으므로, 코드가 있는 case 끝에 `break`·`return` 같은 점프문이 없으면 컴파일 오류다(빈 case를 나란히 쌓는 것만 허용). `bool`은 숫자와 상호 변환되지 않으므로 조건식은 반드시 `bool`이어야 하고 `count != 0`처럼 써야 한다. → 코어 5 (5.6), 코어 4 (4.2)

    </details>

### 3. 기억 고리

- **C++ 유추:** C# `class` 변수 ≈ GC가 관리하는 `T*`(대입하면 포인터만 복사, null 가능, `.`으로 접근) / C# `struct` ≈ C++ 값 객체(대입하면 멤버 복사). ⚠️ 깨지는 곳: C++에서는 같은 타입을 값으로도 포인터로도 쓸 수 있지만 C#은 **타입 정의가** 복사/공유를 정한다. `delete`도 소멸 시점도 없다.
- **C++ 유추:** `ref` ≈ `T&`, `in` ≈ `const T&`, `out` ≈ 출력용 `T&`. ⚠️ 깨지는 곳: 호출부에도 `ref`/`out`을 써야 하고, `out`은 반드시 채워야 한다.
- **C++ 유추:** C# 정수 오버플로 ≈ C++의 **unsigned** 오버플로(정의된 wraparound). ⚠️ 깨지는 곳: C#은 부호 있는 정수에도 적용되고, C++의 부호 있는 오버플로는 UB다.
- **비유:** 값 타입 = 서류 복사본을 건네주기, 참조 타입 = 같은 사물함 번호를 알려 주기(누가 사물함 안을 바꾸면 모두에게 보인다). ⚠️ 비유가 깨지는 지점: `string`은 참조 타입이지만 불변이고 `==`가 내용 비교를 하므로 "사물함 공유"의 부작용이 드러나지 않는다. 또 참조를 값으로 넘긴 메서드가 "사물함 번호 자체"를 바꿔도 호출자 쪽 번호는 그대로다.
- **비유:** int 오버플로 = 자동차 주행거리계가 999999에서 000000으로 넘어가는 것(경고 없음). ⚠️ 깨지는 지점: int는 최댓값 다음이 0이 아니라 음수 최솟값이며, `checked`를 걸면 "경고등"(예외)을 켤 수 있다.
- **묶음(3의 법칙):** null 연산자 3형제 `??`(대체) / `??=`(빈 곳 채우기) / `?.`(조용히 통과). 실수 타입 3형제 float / double / decimal. 반복 점프 3형제 break(루프 끝) / continue(이번 회차만) / return(메서드 끝). C++ UB → C# 정의된 동작 3형제: 부호 있는 오버플로(wraparound) / 초기화 안 된 지역 변수(컴파일 오류) / 범위 밖 배열 접근(예외).
- **대칭·순서:** while(먼저 검사) ↔ do-while(먼저 실행) / ref(들어올 때 값 필요) ↔ out(나갈 때 값 필요) / 암시적 변환(손실 없음) ↔ 명시적 캐스트(손실 가능) / 스택(메서드 끝에 자동 소멸) ↔ 힙(GC가 나중에 회수).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "방치형 서버에서 골드가 갑자기 음수가 되는 이유와 막는 법"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "C#에서 `struct`와 `class`는 C++처럼 접근 지정자 차이가 아니다"를 위 시나리오 2(강화가 반영되지 않는 버그)를 예로 2분 안에 설명해 보세요. `ref`/`in`이 C++의 무엇에 해당하는지도 덧붙이세요.
- **랜덤 논리 게임:** A "재화·성장 수치는 double로 충분하다(빠르고 범위가 넓다)" vs B "정확해야 하는 값은 decimal 또는 정수 long이어야 한다(오차·`==` 비교 문제)" — 양쪽을 번갈아 변호해 보세요. 추가 라운드: A "`var`로 간결하게" vs B "int/long 구분이 중요한 값은 타입을 직접 쓴다".
- **AI 역할 반전:** "내가 C#의 값 타입·참조 타입과 ref/out 전달 방식을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제2부. 객체지향 프로그래밍

> **🎮 게임 서버 개발자에게** — C++로 `class Monster { virtual void TakeDamage(int); }` 계층을 짜 본 경험은 거의 그대로 통한다. 결정적으로 다른 점은 세 가지다. ① C#에서는 `override`를 빼먹으면 재정의가 아니라 "숨기기"가 된다. ② `struct`와 `class`는 접근 지정자 기본값 차이가 아니라 **값 타입 vs 참조 타입**이라는 완전히 다른 의미다. ③ 제네릭은 템플릿처럼 보이지만 런타임에 구체화되고, `where` 제약이 허락한 멤버만 쓸 수 있다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 보스 몬스터만 데미지 절반 규칙이 적용되지 않는다는 버그 리포트가 왔다 — `override` 대신 숨기기가 되어 있었다.
> - 클라이언트가 보낸 골드 값이 그대로 DB에 저장되는 구멍을 막아야 한다 — `private set` + 검증 메서드.
> - 클라이언트가 보낸 아이템 등급 정수 `999`가 enum으로 캐스트되어 보상 계산이 이상해졌다.

## 코어 — 이것만은 100%

> **한 문장:** 클래스는 필드·프로퍼티·메서드로 "데이터 + 행동"을 묶고 접근 제한자로 내부를 감추며, 구현을 공유하면 상속(virtual/override)·독립 능력이면 인터페이스로 다형성을 만들고, 작고 불변인 단일 값만 struct로, 타입이 달라도 같은 코드는 박싱 없는 제네릭으로 재사용한다.

1. **캡슐화된 클래스** — 필드·프로퍼티·생성자로 "데이터 + 행동"을 묶고, 필드는 private, 필요한 것만 public 프로퍼티/메서드로 연다(`{ get; private set; }`, `init`). 골드 같은 값은 정해진 메서드로만 바뀌게 한다.
2. **다형성(상속 + 인터페이스)** — 부모 타입 변수가 자식 객체를 가리킬 수 있고, `virtual`/`override`면 변수 타입이 아니라 **실제 객체**의 버전이 실행된다. 클래스 상속은 하나, 인터페이스 구현은 여러 개.
3. **값 타입과 박싱 비용** — 값 타입(struct·enum)을 object/인터페이스에 담으면 박싱(힙 복사)이 일어나고, 언박싱은 원래 타입과 정확히 일치해야 한다. 기본은 class이고, struct는 단일 값·16바이트 미만·불변·박싱이 잦지 않을 때만. enum은 정수 기반 값 타입이라 정의되지 않은 값도 담길 수 있다.
4. **제네릭** — `T` 자리표시 타입으로 한 번 작성한 코드를 여러 타입에 재사용한다. object 방식과 달리 박싱·캐스팅이 없고 잘못된 타입을 컴파일 시점에 막는다. `where` 제약이 허락한 기능만 쓸 수 있다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `virtual` 함수 + `override`(선택) | `virtual` / `override` | 부모 타입 참조로 불러도 실제 객체의 구현이 실행되는 동적 디스패치. 메서드는 기본 비가상 | C#은 `override` 키워드가 **필수**다. 빼먹으면 재정의가 아니라 숨기기(경고, `new`와 같은 효과)가 되어 부모 타입 변수로 부르면 부모 버전이 실행된다 |
| 다중 상속, 순수 가상 클래스 | 단일 클래스 상속 + 인터페이스 다중 구현 | 순수 가상 함수만 있는 추상 클래스 ≈ 인터페이스 | 클래스 부모는 **하나만**. 다이아몬드 상속이 없다. 인터페이스는 인스턴스 필드를 못 가지며, C# 8부터는 기본 구현(본문)도 둘 수 있다 |
| `struct` vs `class`(기본 접근 지정자만 다름), 아무 타입이나 스택/힙 선택 | `struct`(값 타입) vs `class`(참조 타입) | struct는 대입 시 값이 통째로 복사된다(C++ 값 의미론과 비슷) | 의미가 완전히 다르다. class 인스턴스는 항상 GC 힙에 있고 변수는 참조다. struct는 상속 불가·null 불가. 객체마다 스택/힙을 고르는 C++과 달리 **타입을 정의할 때** 결정된다 |
| 템플릿, C++20 concepts | 제네릭 + `where` 제약 | `List<T>`처럼 타입 인자로 코드를 재사용, 타입 안전 | 템플릿은 컴파일 타임 인스턴스화 + 덕 타이핑이지만, C# 제네릭은 런타임에 구체화되며 제약(`where T : IComparable<T>`)이 허락한 멤버만 호출할 수 있다. 특수화·비타입 매개변수 같은 템플릿 메타프로그래밍은 없다 |
| `std::any` + `std::any_cast` | `object` + 박싱/언박싱 | 값의 복사본을 담고, 꺼낼 때 정확한 타입이 맞아야 한다(`int`를 `long`으로 꺼내면 실패) | 박싱은 `object`/인터페이스 자리에 값 타입을 넣는 순간 **암묵적으로** 일어나 눈에 잘 안 띈다. 모든 타입의 공통 부모 `object`는 C++에 없다 |
| `public`/`protected`/`private`, `friend` | 접근 제한자 6종 | 클래스 멤버 기본값은 private | `internal`(같은 어셈블리) 계열이 추가되고 `friend`가 없다. C# struct 멤버도 기본 private. public/private 상속 같은 "상속 접근 지정"은 없다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `Monster m = new Boss();` 후 `m.TakeDamage(100)`을 부르면 Monster 버전과 Boss 버전 중 무엇이 실행될까? `override` 대신 `new`로 숨겼다면?
> 2. `const`와 `static readonly`는 둘 다 "바뀌지 않는 값"인데 왜 둘 다 있을까?
> 3. `object o = 9;` 다음에 `(long)o`로 꺼내면 어떻게 될까?
> 4. 클래스는 부모를 하나만 가질 수 있는데, "공격받을 수 있음"과 "보상을 줌"을 동시에 표현하려면?
> 5. struct가 class보다 빠르다면 왜 기본은 class로 정의하라고 할까?
>
> **처리법:** 🛠 실습 Monster/Slime/Boss 상속 예제, `private set` + `AddGold`, `[Flags]` 버프 `|` `&` `^`, `Strongest<T>` 제약 예제 → 읽자마자 직접 실행 · 🗺 관계도 클래스 → 멤버(필드·프로퍼티·생성자) → 상속·다형성(virtual/override/abstract/sealed) ↔ 인터페이스 / object → 박싱 ↔ 제네릭 / struct ↔ class · 📦 카드로 접근 제한자 6종 표, struct 선택 4조건(단일 값·16바이트 미만·불변·박싱 드묾), 제네릭 제약(`class`·`struct`·`new()`·기반 타입)

**학습 목표**
1. 클래스·프로퍼티·생성자로 Hero, Monster, Item 같은 "데이터 + 행동" 덩어리를 만들 수 있다.
2. 상속(virtual/override/abstract)과 인터페이스의 차이를 알고, 몬스터 종류와 공통 행동을 설계할 수 있다.
3. struct·enum·제네릭 컬렉션(`List<T>` 등)을 언제, 왜 쓰는지 판단할 수 있다.

> 🔧 보충(책 외): 이 문서는 C#으로 만드는 방치형 RPG **HTTP 게임 서버**를 전제로 한다. Hero, Monster, Item은 화면 오브젝트가 아니라 API 요청을 처리할 때 서버가 다루는 데이터·규칙 덩어리이며, 골드·보상 같은 값은 서버가 계산하고 DB에 저장한다.

> 🔧 보충(책 외): 이 부의 코드 예제는 설명용 조각이다. 한 파일에 그대로 붙여 실행하려면 `var hero = ...`, `Monster m = ...`처럼 클래스 밖에 놓인 실행 문장을 파일 맨 위에, 클래스·enum 선언을 그 아래에 두어야 컴파일된다(최상위 문장은 타입 선언보다 앞에 와야 한다).

---

## 코어 1. 캡슐화된 클래스 — 데이터 + 행동을 묶고 내부를 감춘다

> 이 코어의 질문: "Hero의 골드는 누가, 어떤 경로로 바꿀 수 있는가?" 필드·const/readonly(1.1)로 데이터를 정의하고, 생성자·프로퍼티(1.2)로 초기 상태와 접근 창구를 만들고, 접근 제한자(1.3)로 그 창구 외의 길을 막는다.

### 1.1 클래스, 필드, const/readonly, 메서드, 오버로딩

**한 줄 요약:** 클래스는 참조 타입 설계도이고, 필드는 데이터, 메서드는 행동이다.

> 📖 출처: C# 12 in a Nutshell 3장 "Classes / Fields / Constants / Methods / Overloading methods" (텍스트 L7058-7360)

**핵심 설명**
- **필드**는 클래스 안의 변수다. 초기화하지 않으면 기본값(0, false, null)이 들어간다. 비공개 필드는 `_hp`처럼 밑줄로 시작하는 관례가 흔하다.
- **readonly**: 선언 시점이나 그 타입의 생성자에서만 값을 넣을 수 있고, 이후 변경 불가.
- **const**: 컴파일 때 계산되어 사용하는 곳마다 값이 그대로 치환되는 상수. bool·char·string·기본 숫자 타입·enum만 쓸 수 있다. 실행할 때마다 달라질 수 있는 값이나, 나중 버전에서 바뀔 수 있는 값은 `static readonly`가 알맞다.
- **메서드**: 서명(이름 + 매개변수 타입 순서)이 타입 안에서 유일해야 한다. 매개변수 이름과 반환 타입은 서명에 포함되지 않으므로, 반환 타입만 다른 메서드는 함께 둘 수 없다. 이름이 같아도 서명이 다르면 오버로딩이다.
- 식이 하나뿐인 메서드는 `=>`로 짧게 쓸 수 있다(식 본문 메서드).

```csharp
class Hero
{
    public const int MaxLevel = 100;          // 컴파일 시 고정
    readonly string _name;                    // 생성자에서만 대입
    public int Gold = 0;                      // 필드 초기값

    public Hero(string name) => _name = name;

    public void Attack(int damage) { /* ... */ }
    public void Attack(int damage, float critRate) { /* 오버로딩 */ }
    public int DoubleGold() => Gold * 2;      // 식 본문 메서드
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 "최대 레벨", "기본 공격 주기" 같은 절대 안 변하는 값은 const, 유저마다 다른 골드·레벨은 일반 필드나 프로퍼티로 둔다. 서버는 요청마다 이 값을 DB에서 읽어 계산하므로 유저별 값과 전 유저 공통 규칙 값을 구분해 두면 편하다.

### 1.2 생성자, 객체 초기화자, this, 프로퍼티, 인덱서, primary constructor

**한 줄 요약:** 생성자는 객체의 초기 상태를 만들고, 프로퍼티는 필드처럼 보이지만 안에 로직을 넣을 수 있는 접근 창구다.

> 📖 출처: C# 12 in a Nutshell 3장 "Instance Constructors / Object Initializers / The this Reference / Properties / Indexers / Primary Constructors (C# 12)" (텍스트 L7362-7480, L7616-7786, L7787-8186, L8187-8335)

**핵심 설명**
- **생성자**: 클래스 이름과 같고 반환 타입이 없는 메서드. 생성자를 하나라도 직접 만들면 컴파일러가 만들어 주던 매개변수 없는 생성자는 사라진다. 다른 생성자를 `: this(...)`로 불러 중복을 줄일 수 있고, 이때 불려 간 생성자가 먼저 실행된다.
- **객체 초기화자**: `new Hero { Name = "A", Level = 1 }`처럼 생성 직후 접근 가능한 필드/프로퍼티를 채우는 문법.
- **this**: 자기 자신을 가리킨다. 매개변수 이름과 필드 이름이 같을 때 `this.name = name`으로 구분한다.
- **프로퍼티**: `get`/`set` 접근자를 가진 멤버. 외부에서는 필드처럼 쓰지만 내부에서 검증·계산이 가능하다.
  - 자동 프로퍼티 `{ get; set; }`은 숨은 필드를 컴파일러가 만들어 준다.
  - `{ get; private set; }`이면 밖에서는 읽기만 가능.
  - 계산 프로퍼티: `public int Dps => Attack * AttackSpeed;`
  - **init 접근자(C# 9)**: 객체 초기화자, 프로퍼티 초기화식, 생성자에서만 값을 넣을 수 있고 이후엔 읽기 전용이 된다.
- **인덱서**: `this[int i]`를 정의해 객체를 배열처럼 `obj[3]`로 접근하게 한다(문자열 `s[0]`이 그 예).
- **primary constructor(C# 12)**: `class Hero(string name, int level)`처럼 클래스 이름 옆에 매개변수를 쓰면, 그 매개변수가 객체 생존 기간 내내 클래스 안 어디서든 접근 가능하다. 생성자에 초기화 코드를 따로 넣을 수 없고, 프로퍼티에 검증 로직을 넣기도 어려워 프로토타입이나 단순한 경우에 적합하다. 매개변수 없는 기본 생성자는 만들어지지 않는다.

```csharp
class Hero
{
    public string Name { get; init; } = "무명";       // init 전용
    public int Level { get; private set; } = 1;       // 밖에서는 읽기만
    public long Gold { get; private set; }

    public long GoldPerSec => Level * 10L;            // 계산 프로퍼티

    public void AddGold(long amount)                  // 값 검증은 메서드/setter에서
    {
        if (amount < 0) return;
        Gold += amount;
    }
}

var hero = new Hero { Name = "용사" };                 // 객체 초기화자

class Monster(string name, int hp)                    // primary constructor
{
    public void Print() => Console.WriteLine($"{name} HP:{hp}");
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 골드처럼 함부로 바뀌면 안 되는 값을 `private set` 프로퍼티로 막고 `AddGold` 같은 메서드로만 변경하게 하면, 클라이언트가 보낸 값을 그대로 대입하는 실수를 막고 버그도 찾기 쉽다. 요청 본문으로 받는 DTO에는 `init` 프로퍼티가 잘 맞는다. 인덱서는 입문 단계에서 자주 쓰지 않으니 "이런 게 있다" 정도만 알아도 충분하다.

### 1.3 접근 제한자

**한 줄 요약:** 접근 제한자로 "누가 이 멤버를 볼 수 있는지" 정해 내부를 보호한다(캡슐화).

> 📖 출처: C# 12 in a Nutshell 3장 "Access Modifiers" (텍스트 L10090-10237)

**핵심 설명**

| 제한자 | 의미 |
|---|---|
| `public` | 어디서나 접근 가능 |
| `internal` | 같은 어셈블리(프로젝트) 안에서만. 중첩되지 않은 타입의 기본값 |
| `private` | 그 타입 안에서만. 클래스·struct 멤버의 기본값 |
| `protected` | 그 타입과 자식 클래스에서만 |
| `protected internal` | protected와 internal의 합집합(둘 중 하나라도 만족하면 접근 가능) |
| `private protected` | 그 타입 안, 또는 같은 어셈블리에 있는 자식 클래스에서만 (protected나 internal 단독보다 좁다) |

- `public`은 enum과 인터페이스 멤버의 암묵적 접근성이기도 하다.
- 타입은 멤버의 접근성 상한을 정한다(internal 클래스의 public 멤버는 사실상 internal).
- override할 때는 부모 멤버와 접근성이 같아야 한다(`protected virtual`을 `public override`로 바꾸면 오류). → 코어 2의 2.1
- 자식 클래스 자체는 부모 클래스보다 덜 공개될 수는 있어도 더 공개될 수는 없다(internal 부모를 public 자식이 상속하면 오류).

```csharp
class Hero
{
    long _gold;                        // private(기본): 외부 접근 불가
    public long Gold => _gold;         // 읽기만 공개
    protected int Attack = 10;         // 자식(예: Mage)에서 사용 가능
    public void AddGold(long g) => _gold += g;
}
```

> 🔧 보충(책 외): "필드는 private, 필요한 것만 public 프로퍼티/메서드로" 원칙을 지키면 나중에 DB 저장·조회 방식이나 밸런스 규칙을 수정할 때 영향 범위가 작아진다. 서버 상태는 정해진 메서드로만 바뀌게 해야 클라이언트 요청으로 값이 임의로 조작되는 것을 막기 쉽다.

---

## 코어 2. 다형성 — 상속으로 구현을 물려주고, 인터페이스로 능력을 약속한다

> 이 코어의 질문: "몬스터 종류가 늘어도 전투 코드의 if문을 늘리지 않으려면?" 실행되는 코드는 변수 타입이 아니라 **실제 객체 타입**이 정한다(동적 디스패치). 구현을 공유하는 계통은 클래스 상속(2.1), 계통이 달라도 같은 행동을 약속하려면 인터페이스(2.2).

### 2.1 상속, 다형성, 업캐스팅/as/is, virtual·override, abstract, base, sealed

**한 줄 요약:** 부모 클래스의 기능을 자식이 물려받고, 같은 이름의 행동을 자식마다 다르게 바꿀 수 있다.

> 📖 출처: C# 12 in a Nutshell 3장 "Inheritance / Polymorphism / Casting and Reference Conversions / Virtual Function Members / Abstract Classes and Abstract Members / Sealing / The base Keyword / Constructors and Inheritance" (텍스트 L8725-9425)

**핵심 설명**
- **상속**: `class Slime : Monster`처럼 쓰면 Slime이 Monster의 멤버를 모두 갖는다. 클래스는 부모를 **하나만** 가질 수 있다.
- **다형성**: `Monster m = new Slime();`처럼 부모 타입 변수가 자식 객체를 가리킬 수 있다. 자식은 부모의 모든 기능을 가지므로 가능하다(반대는 불가).
- **업캐스팅**(자식 → 부모)은 항상 성공한다. **다운캐스팅**(부모 → 자식)은 명시적 캐스트가 필요하고, 실패하면 `InvalidCastException`이 난다.
- **as**: 다운캐스팅이 실패하면 예외 대신 `null`을 준다. **is**: 변환 가능 여부를 검사하며, `is Slime s`처럼 변수를 바로 만들 수도 있다.
- **virtual / override**: 부모가 `virtual`로 표시한 멤버를 자식이 `override`로 바꿔 쓴다. 변수가 부모 타입이어도 실제 객체의 자식 버전이 실행된다. 시그니처, 반환 타입, 접근성이 같아야 한다(반환 타입은 C# 9부터 더 파생된 타입으로 좁히는 것이 허용된다).
- **abstract**: 추상 클래스는 직접 `new` 할 수 없고, 추상 멤버는 구현 없이 선언만 한다. 자식이 반드시 구현해야 한다.
- **base**: 자식 안에서 부모 구현을 부르거나(`base.Method()`) 부모 생성자를 호출(`: base(...)`)한다. 부모 생성자는 자동 상속되지 않아 자식이 필요한 생성자를 직접 정의해야 하며, 부모 생성자가 항상 먼저 실행된다. `base`를 생략하면 부모의 매개변수 없는 생성자가 자동 호출되므로, 부모에 그런 생성자가 없으면 자식이 `: base(...)`를 반드시 써야 한다.
- **sealed**: 클래스나 override 멤버에 붙이면 더 이상 상속/재정의를 막는다. 클래스를 sealed로 만드는 쪽이 더 흔하다.
- **주의**: `new` 한정자로 멤버를 "숨기는" 것은 override와 다르다. 부모 타입 변수로 부르면 부모 버전이 실행된다(`new`는 의도적으로 숨긴다는 표시일 뿐 컴파일러 경고만 없앤다). 또 생성자 안에서 virtual 메서드를 부르는 것은 위험하다. 자식이 override한 메서드가 아직 초기화되지 않은 상태의 객체를 만질 수 있기 때문이다.
- **as와 캐스트의 선택**: 실패할 수 있어 결과를 분기할 때는 `as`(또는 `is`), 타입을 확신하는 경우에는 캐스트가 적합하다. 캐스트는 실패 원인을 정확히 알려 주는 `InvalidCastException`을 던진다.

```csharp
abstract class Monster
{
    public string Name { get; }
    public int Hp { get; protected set; }
    protected Monster(string name, int hp) { Name = name; Hp = hp; }

    public abstract int RewardGold { get; }          // 자식이 반드시 구현
    public virtual void TakeDamage(int dmg) => Hp -= dmg;   // 기본 동작
}

class Slime : Monster
{
    public Slime() : base("슬라임", 50) { }
    public override int RewardGold => 5;
}

sealed class Boss : Monster
{
    public Boss() : base("드래곤", 5000) { }
    public override int RewardGold => 500;
    public override void TakeDamage(int dmg)
        => base.TakeDamage(dmg / 2);                 // 방어력 절반, 기본 동작 재사용
}

Monster m = new Boss();          // 업캐스팅
m.TakeDamage(100);               // Boss 버전이 실행됨
if (m is Boss b) Console.WriteLine(b.Name);
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 전투·보상 계산 요청을 처리할 때 "몬스터 리스트를 돌며 `TakeDamage`, `RewardGold`만 호출"하고 종류별 차이는 override가 처리하게 하면 if문 도배를 피할 수 있다. 보상 골드는 클라이언트가 알려 주는 값이 아니라 서버 쪽 계산으로 정한다.

> 🔧 보충(책 외): C++ 개발자가 가장 자주 밟는 함정 — C++에서는 부모 함수가 `virtual`이면 자식에서 같은 시그니처로 선언하기만 해도 재정의되지만(`override`는 선택), C#에서는 `override`를 빼먹으면 재정의가 아니라 숨기기로 처리되고 컴파일러는 경고(CS0114)만 낸다. 경고를 무시하면 위 Boss의 "데미지 절반" 규칙이 `Monster` 타입 변수로 부를 때 적용되지 않는다. 또 C++과 마찬가지로 부모에서 `virtual`(또는 `abstract`)이 아닌 메서드는 재정의할 수 없다.

### 2.2 인터페이스 (기본/명시적 구현/기본 인터페이스 멤버)

**한 줄 요약:** 인터페이스는 "이런 행동을 할 수 있다"는 약속만 정의하고, 여러 클래스가 각자 방식으로 구현한다.

> 📖 출처: C# 12 in a Nutshell 3장 "Interfaces / Extending an Interface / Explicit Interface Implementation / Interfaces and Boxing / Default Interface Members / Writing a Class Versus an Interface" (텍스트 L10239-10440, L10576-10636, L10722-10782)

**핵심 설명**
- 인터페이스는 상태(인스턴스 필드)를 갖지 않고 행동(메서드·프로퍼티·이벤트·인덱서)만 선언한다. 멤버는 기본적으로 abstract이자 public이다(C# 8부터는 기본 구현과 접근 제한자를 둘 수 있지만, 입문 단계에서는 선언만 하는 형태로 생각하면 된다). 구현하는 쪽은 모든 멤버를 public으로 구현해야 한다.
- 클래스(와 struct)는 **여러 인터페이스**를 구현할 수 있다(클래스 상속은 하나뿐). 구현 객체는 인터페이스 변수에 암묵적으로 변환해 담을 수 있다.
- 인터페이스끼리도 상속할 수 있다(`IRedoable : IUndoable`).
- **명시적 구현**: `void IFoo.Bar()`처럼 쓰면 인터페이스 타입으로 캐스트했을 때만 호출된다. 두 인터페이스의 멤버 시그니처가 충돌할 때 해결하거나, 일반 사용에 방해가 되는 특수한 멤버를 숨길 때 쓴다.
- struct를 인터페이스 변수에 담으면 박싱이 일어난다(struct 변수로 구현 멤버를 직접 호출할 때는 박싱이 없다). → 코어 3
- **기본 구현(C# 8)**: 인터페이스 멤버에 본문을 넣어 구현을 선택 사항으로 만들 수 있다. 널리 쓰이는 라이브러리의 인터페이스에 멤버를 추가해도 기존 구현이 깨지지 않게 하려는 목적이다. 기본 구현은 항상 명시적 구현처럼 동작해서, 클래스가 따로 구현하지 않았다면 인터페이스 타입으로 캐스트해야 호출할 수 있다.
- **클래스 vs 인터페이스**: 자연스럽게 구현을 공유하는 타입끼리는 클래스 상속, 구현이 서로 독립적인 능력(책의 예: 날 수 있는 생물, 육식 동물)은 인터페이스로 만든다.

```csharp
interface IAttackable
{
    int Hp { get; }
    void TakeDamage(int dmg);
}

interface IRewardGiver
{
    long RewardGold { get; }
}

class Slime : IAttackable, IRewardGiver      // 여러 인터페이스 구현
{
    public int Hp { get; private set; } = 50;
    public long RewardGold => 5;
    public void TakeDamage(int dmg) => Hp -= dmg;
}

class Tree : IAttackable                     // 보상이 없는 오브젝트
{
    public int Hp { get; private set; } = 10;
    public void TakeDamage(int dmg) => Hp -= dmg;
}

void Hit(IAttackable target) => target.TakeDamage(10);   // 누구든 공격 가능
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 "공격받을 수 있음(IAttackable)", "보상을 줌(IRewardGiver)"처럼 공통 행동을 인터페이스로 나누면 상속 계통이 다른 클래스도 같은 방식으로 다룰 수 있다. 또 `IHeroRepository` 같은 저장소 인터페이스를 두면 DB 구현을 테스트용 가짜 구현으로 바꿔 끼우기 쉽다.

---

## 코어 3. 값 타입과 박싱 비용 — object, struct, enum

> 이 코어의 질문: "이 값은 복사되는가, 참조되는가? 힙에 몰래 복사되지는 않는가?" 모든 타입의 부모 `object`에 값 타입을 넣으면 박싱이 생기고(3.1), 그 비용과 복사 의미론 때문에 struct는 좁은 조건에서만 고르며(3.2), enum도 정수 기반 값 타입이라 정의되지 않은 값까지 담을 수 있다(3.3).

### 3.1 object 타입, 박싱/언박싱, GetType, ToString

**한 줄 요약:** 모든 타입의 최상위 부모는 `object`이고, 값 타입을 object에 넣으면 힙에 복사(박싱)되어 비용이 든다.

> 📖 출처: C# 12 in a Nutshell 3장 "The object Type / Boxing and Unboxing / Static and Runtime Type Checking / The GetType Method and typeof Operator / The ToString Method" (텍스트 L9605-9836)

**핵심 설명**
- `object`는 모든 타입의 부모라 무엇이든 담을 수 있다. 값 타입(int 등)도 담을 수 있는데, 이때 **박싱**(값을 힙 객체로 복사)이 일어나고 꺼낼 때는 명시적 캐스트로 **언박싱**한다.
- 언박싱은 원래 타입과 **정확히** 일치해야 한다. `object o = 9;` 후 `(long)o`는 예외이고 `(int)o`가 맞다.
- 박싱은 값을 복사하므로, 박싱 후 원본을 바꿔도 박스된 값은 그대로다.
- 값 타입을 인터페이스 변수에 담을 때도 박싱이 일어난다.
- **GetType()**: 실행 시점에 객체의 실제 타입(`System.Type`)을 돌려준다. `typeof(X)`는 타입 이름으로 컴파일 시점에 얻는다.
- **ToString()**: 타입 인스턴스의 기본 문자열 표현. 직접 만든 클래스에서 `override`하면 `Console.WriteLine(obj)`에 원하는 문자열이 나온다(안 하면 타입 이름이 나온다).
- 박싱·언박싱은 성능 저하를 부르므로 피하라는 것이 High-Performance Programming in C# and .NET의 조언이고(3.2 참고), 제네릭(코어 4의 4.1)이 박싱과 캐스팅을 줄여 준다.

```csharp
int gold = 100;
object boxed = gold;          // 박싱
int back = (int)boxed;        // 언박싱

class Item
{
    public string Name = "";
    public override string ToString() => Name;   // Console.WriteLine(item) 가능
}
Console.WriteLine(new Item { Name = "검" }.GetType().Name); // Item
```

> 🔧 보충(책 외): 서버에서는 박싱이 쌓이면 가비지가 늘어 요청 처리 지연과 처리량 저하의 원인이 될 수 있으므로, 요청마다 반복 실행되는 전투·보상 계산 코드 안에서는 `object`에 값을 넣는 코드를 피하는 것이 좋다(자세한 내용은 [제3부](03_제3부_메모리와_성능_기초.md)).

### 3.2 struct, readonly struct, struct vs class 선택

**한 줄 요약:** struct는 상속이 없는 값 타입이며, 작고 불변인 "하나의 값"을 표현할 때만 쓰고 기본은 class다.

> 📖 출처: C# 12 in a Nutshell 3장 "Structs / Struct Construction Semantics / Read-Only Structs and Functions" (텍스트 L9880-10023), High-Performance Programming in C# and .NET 3장 "Choosing between a struct and a class" (텍스트 L4012-4051)

**핵심 설명**
- **struct는 값 타입**이다. 대입하면 값이 통째로 복사되고, `null`이 될 수 없으며, 기본값은 모든 필드가 0/null인 상태다. 상속은 불가(object/ValueType만)하고 finalizer도 없다.
- 값 타입은 인스턴스마다 힙 객체를 만들 필요가 없어, 많이 만들 때 이득이 있다(값 타입 배열은 힙 할당이 한 번뿐이고 값이 배열 안에 나란히 놓인다).
- 구조체는 항상 값을 0으로 채우는 암묵적 기본 생성자를 가지며, `default`나 배열 생성으로 만든 인스턴스는 직접 정의한 초기화를 거치지 않는다. 그래서 책은 기본값 자체가 유효한 상태가 되도록 설계하고, 필드 초기화나 매개변수 없는 생성자는 혼란을 부르니 신중히 쓰라고 권한다.
- **readonly struct**: 모든 필드가 readonly임을 강제해 의도를 분명히 하고 컴파일러가 최적화하기 쉽게 한다. 메서드 단위로 `readonly`를 붙일 수도 있다.
- **선택 기준(High-Performance Programming in C# and .NET)**: Microsoft 권고는 "타입은 기본적으로 class로 정의"하는 것이다. 다른 객체 안에 포함되거나 수명이 짧은 타입이면 struct를 고려하고, 그때는 (1) 논리적으로 단일 값을 나타내고 (2) 인스턴스 크기가 16바이트 미만이며 (3) 불변이고 (4) 박싱·언박싱이 잦지 않아야 한다. 큰 값 타입은 대입할 때 통째로 복사되어 참조 타입보다 비용이 클 수 있고, 벤치마크 결과도 상황에 따라 struct와 class의 우열이 달라진다고 설명한다.

```csharp
readonly struct DamageResult            // 작고 불변인 값 하나
{
    public readonly int Amount;
    public readonly bool IsCritical;
    public DamageResult(int amount, bool isCritical)
        => (Amount, IsCritical) = (amount, isCritical);
}

class Hero { public int Level; }        // 상태가 바뀌는 대상은 class
```

> 🔧 보충(책 외): 서버에서 Hero, Monster처럼 상태가 계속 바뀌는 대상은 class, "데미지 계산 결과 한 번"처럼 작은 값은 struct 후보다. 확신이 없으면 class로 시작하면 된다.

> 🔧 보충(책 외): C++에서 `struct`와 `class`는 기본 접근 지정자만 다르고, 어떤 타입이든 스택에 둘지 `new`로 힙에 둘지 사용하는 쪽이 고른다. C#에서는 **타입을 선언할 때** 값 타입(struct)인지 참조 타입(class)인지가 정해지고, class 인스턴스는 항상 GC 힙에 만들어진다. 그래서 C++ 습관대로 "가벼운 데이터 묶음이니 struct"로 정의하면, 상태를 바꾸는 코드에서 복사본만 바뀌는 버그(`var h = heroes[0]; h.Gold += 10;`은 리스트 안 값을 바꾸지 않는다)를 만나기 쉽다. 위 선택 기준대로 불변(readonly struct)으로 두면 이 함정이 원천 차단된다.

### 3.3 enum, Flags enum

**한 줄 요약:** enum은 이름 붙은 상수 묶음으로, 등급·상태 같은 "정해진 선택지"를 안전하게 표현한다.

> 📖 출처: C# 12 in a Nutshell 3장 "Enums / Enum Conversions / Flags Enums / Type-Safety Issues" (텍스트 L10783-11054)

**핵심 설명**
- enum은 값 타입이고, 각 이름은 내부적으로 정수(기본 int, 0부터 증가)에 대응된다. 값을 직접 지정하거나 기반 타입(`: byte`)을 바꿀 수도 있다.
- 정수와는 명시적 캐스트로 변환한다: `(int)ItemGrade.Rare`, `(ItemGrade)2`. 숫자 리터럴 `0`만은 캐스트 없이 대입 가능하다(첫 멤버를 기본값으로 쓰는 경우가 많음).
- **Flags enum**: 값을 2의 거듭제곱(1, 2, 4, 8...)으로 두고 `[Flags]`를 붙이면 `|`(합치기), `&`(포함 검사), `^`(토글)로 여러 값을 조합할 수 있다. 조합 가능한 enum에는 `[Flags]`를 붙이고 이름을 복수형으로 짓는 것이 관례이며(`[Flags]`가 없으면 조합된 값의 `ToString()`이 이름 대신 숫자를 낸다), 책의 예시처럼 `None = 0`을 두면 "아무 플래그도 없음"을 표현할 수 있다.
- **주의**: enum은 정수 캐스트나 `++` 같은 연산으로 정의되지 않은 값(예: `(ItemGrade)999`)도 담을 수 있다. 분기 처리 시 마지막 `else`에서 예외를 던지거나 `Enum.IsDefined`로 검사하라고 책은 권한다(`Enum.IsDefined`는 Flags enum에는 통하지 않는다).

```csharp
enum ItemGrade { Common, Rare, Epic, Legendary }   // 0,1,2,3

[Flags]
enum HeroBuffs { None = 0, AttackUp = 1, SpeedUp = 2, GoldUp = 4 }

var buffs = HeroBuffs.AttackUp | HeroBuffs.GoldUp;      // 합치기
bool hasGoldUp = (buffs & HeroBuffs.GoldUp) != 0;       // 포함 검사
buffs ^= HeroBuffs.AttackUp;                             // 토글(끄기)

ItemGrade g = ItemGrade.Epic;
int multiplier = g switch
{
    ItemGrade.Common => 1,
    ItemGrade.Rare => 2,
    ItemGrade.Epic => 5,
    ItemGrade.Legendary => 10,
    _ => throw new ArgumentException("잘못된 등급")
};
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 아이템 등급·몬스터 종류·재화 종류를 enum으로 두면 문자열 오타 버그가 사라진다. DB에 정수로 기록되거나 API 요청·응답으로 오갈 수 있으니 중간에 순서를 바꾸지 않도록 값을 명시하는 편이 안전하다. 클라이언트가 보낸 정수를 enum으로 캐스트할 때는 정의되지 않은 값일 수 있으므로 위의 `Enum.IsDefined` 검사나 마지막 `else` 예외 처리로 검증한다.

---

## 코어 4. 제네릭 — 박싱 없이, 타입 안전하게 재사용한다

> 이 코어의 질문: "`List<Monster>`의 `<Monster>`는 왜 붙는가?" 코어 3의 object 방식이 가진 박싱·런타임 캐스트 실패 문제를 타입 매개변수 `T`로 푼다. `where` 제약은 템플릿의 덕 타이핑 대신 "T로 무엇을 할 수 있는지"를 명시한다.

### 4.1 제네릭 타입/메서드, 제약, default

**한 줄 요약:** 제네릭은 `T`라는 자리표시 타입을 두어 한 번 작성한 코드를 여러 타입에 안전하게 재사용하는 기능이다.

> 📖 출처: C# 12 in a Nutshell 3장 "Generics / Generic Types / Why Generics Exist / Generic Methods / The default Generic Value / Generic Constraints" (텍스트 L11171-11607)

**핵심 설명**
- `Stack<T>`처럼 타입 이름 뒤에 `<T>`를 붙여 만든다. 사용할 때 `Stack<int>`처럼 실제 타입을 채운다.
- 제네릭이 없으면 종류별 클래스를 복붙하거나 `object` 기반으로 만들어야 한다. 후자는 **박싱과 다운캐스팅이 필요하고 잘못된 타입을 넣어도 컴파일 오류가 나지 않아 실행 중에 예외가 난다**. 제네릭은 타입 안전성을 높이고 박싱·캐스팅을 줄인다.
- `Stack<T>`는 열린 타입, `Stack<int>`는 닫힌 타입이며 실제로는 닫힌 타입만 만들 수 있다.
- **제네릭 메서드**: `static void Swap<T>(ref T a, ref T b)`. 호출 시 타입 인자는 보통 추론된다.
- 타입 매개변수는 여러 개일 수 있다(`Dictionary<TKey, TValue>`).
- **default**: `default(T)`(또는 `default`)는 T의 기본값을 준다. 참조 타입은 null, 값 타입은 0으로 채운 값.
- **제약(where)**: T에 조건을 걸어 그 조건이 허용하는 기능을 쓸 수 있게 한다.
  - `where T : 클래스이름/인터페이스` (특정 기반 클래스 또는 인터페이스 구현)
  - `where T : class` / `struct` (참조 타입 / 값 타입)
  - `where T : new()` (매개변수 없는 생성자 필요)

```csharp
var monsters = new List<Monster>();        // 제네릭 컬렉션
monsters.Add(new Slime());
// monsters.Add("문자열");                  // 컴파일 오류 -> 안전
Monster first = monsters[0];               // 캐스팅 불필요

var dropTable = new Dictionary<ItemGrade, int>();   // 키, 값 두 타입

static T Strongest<T>(T a, T b) where T : IComparable<T>   // 제약
    => a.CompareTo(b) > 0 ? a : b;

int best = Strongest(300, 500);            // 500

static T Create<T>() where T : new() => new T();
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 `List<Item>`(인벤토리 조회 결과), `Dictionary<int, HeroData>`(메모리에 올려 둔 기준 데이터 테이블), `Queue<Monster>`(처리 대기 목록)처럼 제네릭 컬렉션이 거의 모든 곳에 쓰인다. 직접 제네릭 클래스를 만드는 일은 드물지만 "왜 `<Monster>`가 붙는지"는 반드시 이해해야 한다. 컬렉션 종류별 선택은 [제5부](05_제5부_NET_기본_라이브러리.md)에서 다룬다.

> 🔧 보충(책 외): C++ 템플릿과의 차이 — 템플릿은 컴파일 타임에 타입마다 코드를 찍어 내고, 본문에서 `a < b`처럼 아무 연산이나 써 두면 인스턴스화할 때 비로소 검사한다(덕 타이핑). C# 제네릭은 IL에 제네릭 형태 그대로 남아 런타임(JIT)에 구체화되며, 본문을 컴파일할 때 이미 `where` 제약이 보장하는 멤버만 쓸 수 있다. 그래서 위 `Strongest<T>`는 `where T : IComparable<T>` 없이는 `CompareTo`를 부를 수 없다. 템플릿 특수화나 비타입 템플릿 매개변수(`std::array<int, 4>`의 `4` 같은 것)에 해당하는 기능은 없다.

---

## 실무 적용

### 체크리스트
- [ ] 필드는 private, 필요한 것만 public 프로퍼티/메서드로 연다. 골드 같은 서버 상태는 `{ get; private set; }` + `AddGold` 같은 검증 메서드로만 바꾼다. → 코어 1
- [ ] 요청 본문 DTO에는 `init` 프로퍼티, 전 유저 공통 규칙 값은 const, 나중 버전에서 바뀔 수 있는 값은 `static readonly`. → 코어 1
- [ ] 자식 클래스에서 재정의할 메서드에는 반드시 `override`를 붙이고, CS0114(숨기기) 경고를 무시하지 않는다. → 코어 2
- [ ] 생성자 안에서 virtual 메서드를 부르지 않는다. → 코어 2
- [ ] 종류별 차이는 override/인터페이스로 처리해 전투 코드의 if문 도배를 피한다. 계통이 다른 객체의 공통 행동은 인터페이스(`IAttackable`, `IRewardGiver`)로, 저장소는 `IHeroRepository`처럼 인터페이스로 둔다. → 코어 2
- [ ] 요청마다 반복되는 전투·보상 계산 코드에서 값 타입을 `object`/인터페이스 변수에 넣지 않는다(박싱). → 코어 3
- [ ] 타입은 기본 class. struct는 단일 값·16바이트 미만·불변·박싱 드묾을 모두 만족할 때만, 가능하면 `readonly struct`. → 코어 3
- [ ] enum은 DB·API에 정수로 오가므로 값을 명시하고, 클라이언트가 보낸 정수는 `Enum.IsDefined`나 switch의 마지막 `_ => throw`로 검증한다. → 코어 3
- [ ] 컬렉션은 `List<T>`·`Dictionary<TKey, TValue>` 같은 제네릭을 쓰고, object 기반 컬렉션을 쓰지 않는다. → 코어 4

### 시나리오로 확인하기

1. **상황:** C++ 서버에서 하던 대로 `Boss : Monster`에 `public void TakeDamage(int dmg) => base.TakeDamage(dmg / 2);`를 선언했다(부모는 `virtual`). 빌드는 성공했는데, 전투 루프가 `List<Monster>`를 돌며 `TakeDamage`를 부르면 보스가 데미지를 그대로 받는다.
   **질문:** 원인은 무엇이고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   C#에서는 `override` 키워드가 없으면 재정의가 아니라 숨기기(`new`와 같은 효과)가 되고 컴파일러는 경고만 낸다. 숨긴 멤버는 부모 타입(`Monster`) 변수로 부르면 부모 버전이 실행된다. `public override void TakeDamage(...)`로 고친다. 진짜 다형성은 `virtual`/`override` 조합일 때만 생긴다. → 코어 2 (2.1)

   </details>

2. **상황:** 골드 보상 API의 요청 DTO와 도메인 `Hero`에 모두 `public long Gold { get; set; }`를 두고, 요청을 받아 `hero.Gold = request.Gold;`로 저장했다. 어느 날 골드가 수십억인 계정이 나타났다.
   **질문:** 구조적으로 무엇이 잘못됐고, 이 장의 도구로 어떻게 막나?

   <details markdown="1"><summary>답 확인</summary>

   서버 상태(골드)가 아무 경로로나 대입될 수 있게 열려 있었다. `Gold`를 `{ get; private set; }`으로 막고 `AddGold(long amount)`처럼 검증하는 메서드로만 바뀌게 한다. 보상 골드는 클라이언트가 알려 주는 값이 아니라 서버 쪽 계산(예: `RewardGold` override)으로 정한다. DTO에는 `init` 프로퍼티가 잘 맞는다. → 코어 1 (1.2, 1.3)

   </details>

3. **상황:** 클라이언트가 보낸 등급 정수를 `(ItemGrade)request.Grade`로 캐스트해 보상 배율을 if/else로 고른다. 마지막 `else`가 "Legendary 배율"로 되어 있었고, 누군가 `999`를 보내 전설 보상을 받아 갔다. 또 기획 요청으로 enum 중간에 `Uncommon`을 끼워 넣었더니 DB에 저장된 기존 아이템 등급이 한 칸씩 밀렸다.
   **질문:** 두 문제의 원인과 대책은?

   <details markdown="1"><summary>답 확인</summary>

   enum은 정수 캐스트로 정의되지 않은 값(`(ItemGrade)999`)도 담을 수 있다. `Enum.IsDefined`로 검사하거나 마지막 `else`/`_`에서 예외를 던진다. enum 이름은 내부적으로 0부터 증가하는 정수이므로 중간에 끼워 넣으면 이후 값이 바뀐다. DB·API로 오가는 enum은 값을 명시해 순서를 고정한다. → 코어 3 (3.3)

   </details>

4. **상황:** 전투 로그 수집기를 "범용"으로 만들겠다며 `void Record(string key, object value)`를 만들고 전투 루프에서 데미지(int)마다 호출했다. 부하 테스트에서 GC가 자주 돌고 응답 지연이 튄다.
   **질문:** 무엇이 가비지를 만들고, 어떻게 바꿔야 하나?

   <details markdown="1"><summary>답 확인</summary>

   int를 `object` 매개변수에 넘길 때마다 박싱(힙 복사)이 일어난다. 박싱이 쌓이면 가비지가 늘어 지연과 처리량 저하의 원인이 된다. `Record<T>(string key, T value)` 같은 제네릭이나 타입별 오버로드로 박싱을 없앤다. 값 타입을 인터페이스 변수에 담아도 박싱이 일어나는 점도 함께 확인한다. → 코어 3 (3.1), 코어 4 (4.1)

   </details>

5. **상황:** C++ 습관으로 영웅 상태를 `struct HeroState { public long Gold; public int Level; }`로 정의해 `List<HeroState>`에 담았다. `var h = heroes[0]; h.Gold += 100;` 후 저장했는데 골드가 그대로다.
   **질문:** 왜 반영되지 않았고, 어떻게 설계해야 했나?

   <details markdown="1"><summary>답 확인</summary>

   C# struct는 값 타입이라 대입하면 값이 통째로 복사된다. `h`는 복사본이므로 리스트 안 값은 바뀌지 않는다. 상태가 계속 바뀌는 대상은 class로 정의한다. struct는 단일 값·16바이트 미만·불변·박싱이 잦지 않을 때(예: `readonly struct DamageResult`)만 고른다. → 코어 3 (3.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
객체지향 — 한 문장: ( ? )
├─ 코어 1 캡슐화된 클래스
│   ├─ 1.1 필드 / readonly(언제 대입?) / const(허용 타입? 대안 ____ ) / 메서드 서명(포함 X: ____ ) / 오버로딩 / =>
│   ├─ 1.2 생성자(: this(...)) / 객체 초기화자 / this / 프로퍼티(자동, private set, 계산, init) / 인덱서 / primary constructor(제약 ____ )
│   └─ 1.3 접근 제한자 public / internal / private / protected / protected internal / private protected (멤버 기본 ( ? ), 타입 기본 ( ? ))
├─ 코어 2 다형성
│   ├─ 2.1 상속(부모 __개) / 다형성 / 업캐스팅 vs 다운캐스팅(실패 시 ____ ) / as(실패 시 ____ ) / is
│   │     └─ virtual·override(C#은 override ( 필수? 선택? )) / abstract / base / sealed / new 숨기기 vs override / 생성자 안 virtual 호출 위험
│   └─ 2.2 인터페이스(상태 X, 여러 개) / 명시적 구현 / struct→인터페이스 = ( ? ) / 기본 구현(C# 8) / 클래스 vs 인터페이스 기준
├─ 코어 3 값 타입과 박싱 비용
│   ├─ 3.1 object / 박싱·언박싱(정확히 일치) / GetType vs typeof / ToString override
│   ├─ 3.2 struct(값, null 불가, 상속 불가) / readonly struct / 선택 4조건 ( ? ) ( ? ) ( ? ) ( ? )
│   └─ 3.3 enum(기본 int, 0부터) / [Flags] (2의 거듭제곱, | & ^) / 정의되지 않은 값 → ( ? )로 검사
└─ 코어 4 제네릭
    └─ 4.1 이유(object 방식의 문제 ____ ) / 열린 vs 닫힌 타입 / 제네릭 메서드 / default(T) / where 제약 / 템플릿과 차이( ? 타임 구체화)
```

### 2. 인출 질문

1. `readonly`와 `const`의 차이는? 나중 버전에서 바뀔 수 있는 값에는 무엇이 알맞나요?

   <details markdown="1"><summary>답 확인</summary>

   `const`는 컴파일 때 계산되어 사용하는 곳마다 값이 치환되며 bool·char·string·기본 숫자·enum만 가능하다. `readonly`는 선언 시점이나 그 타입의 생성자에서만 대입할 수 있다. 실행마다 달라질 수 있거나 나중 버전에서 바뀔 수 있는 값은 `static readonly`가 알맞다. → 코어 1 (1.1)

   </details>

2. 반환 타입만 다른 두 메서드를 한 클래스에 둘 수 있나요? 이유는?

   <details markdown="1"><summary>답 확인</summary>

   둘 수 없다. 메서드 서명은 이름 + 매개변수 타입 순서이고, 매개변수 이름과 반환 타입은 서명에 포함되지 않는다. 이름이 같아도 매개변수 타입이 다르면 오버로딩이다. → 코어 1 (1.1)

   </details>

3. 생성자를 하나라도 직접 만들면 무엇이 사라지나요? `: this(...)`로 다른 생성자를 부르면 실행 순서는?

   <details markdown="1"><summary>답 확인</summary>

   컴파일러가 자동으로 만들어 주던 매개변수 없는 생성자가 사라진다. `: this(...)`로 불려 간 생성자가 먼저 실행된다. → 코어 1 (1.2)

   </details>

4. `{ get; private set; }`과 `{ get; init; }`은 각각 언제 값을 넣을 수 있나요? 서버에서 각각 어디에 어울리나요?

   <details markdown="1"><summary>답 확인</summary>

   `private set`은 클래스 안에서만 대입 가능하고 밖에서는 읽기만 된다(골드를 `AddGold` 같은 메서드로만 바꾸게 할 때). `init`은 객체 초기화자·프로퍼티 초기화식·생성자에서만 넣을 수 있고 이후 읽기 전용이다(요청 본문 DTO에 잘 맞음). → 코어 1 (1.2)

   </details>

5. primary constructor(C# 12)의 특징과 한계는?

   <details markdown="1"><summary>답 확인</summary>

   `class Hero(string name, int level)`처럼 쓰면 매개변수가 객체 생존 기간 내내 클래스 안 어디서나 접근 가능하다. 하지만 생성자에 초기화 코드를 따로 넣을 수 없고 프로퍼티에 검증 로직을 넣기 어려우며, 매개변수 없는 기본 생성자가 만들어지지 않아 프로토타입이나 단순한 경우에 적합하다. → 코어 1 (1.2)

   </details>

6. `protected internal`과 `private protected`의 차이는? 클래스·struct 멤버와 중첩되지 않은 타입의 기본 접근성은?

   <details markdown="1"><summary>답 확인</summary>

   `protected internal`은 합집합(자식 클래스이거나 같은 어셈블리면 접근 가능), `private protected`는 그 타입 안 또는 같은 어셈블리에 있는 자식 클래스에서만(더 좁음). 멤버의 기본은 `private`, 중첩되지 않은 타입의 기본은 `internal`이다. → 코어 1 (1.3)

   </details>

7. override할 때 접근성 규칙과, 자식 클래스의 공개 범위 규칙은?

   <details markdown="1"><summary>답 확인</summary>

   override는 부모 멤버와 접근성이 같아야 한다(`protected virtual`을 `public override`로 바꾸면 오류). 자식 클래스는 부모보다 덜 공개될 수는 있어도 더 공개될 수는 없다(internal 부모를 public 자식이 상속하면 오류). 또 타입이 멤버 접근성의 상한을 정한다. → 코어 1 (1.3)

   </details>

8. 다운캐스팅이 실패할 때 명시적 캐스트와 `as`는 각각 어떻게 동작하고, 언제 무엇을 고르나요?

   <details markdown="1"><summary>답 확인</summary>

   캐스트는 `InvalidCastException`을 던지고, `as`는 예외 대신 null을 준다. 실패할 수 있어 결과로 분기할 때는 `as`(또는 `is Slime s` 패턴), 타입을 확신할 때는 실패 원인을 정확히 알려 주는 캐스트가 적합하다. 업캐스팅은 항상 성공한다. → 코어 2 (2.1)

   </details>

9. `override`와 `new`(멤버 숨기기)는 부모 타입 변수로 호출했을 때 어떻게 다른가요? C++과 달리 `override`를 빼먹으면?

   <details markdown="1"><summary>답 확인</summary>

   `override`는 변수가 부모 타입이어도 실제 객체(자식)의 버전이 실행된다. `new`로 숨긴 경우 부모 타입 변수로 부르면 부모 버전이 실행된다. `new`는 의도적으로 숨긴다는 표시로 컴파일러 경고만 없앤다. C#에서 `override`를 빼먹으면 재정의가 아니라 숨기기로 처리되고 경고만 나온다(본문 보충). → 코어 2 (2.1)

   </details>

10. 부모 생성자와 자식 생성자의 관계를 설명하고, 부모에 매개변수 없는 생성자가 없으면 어떻게 해야 하나요? 생성자 안에서 virtual 메서드를 부르면 왜 위험한가요?

    <details markdown="1"><summary>답 확인</summary>

    부모 생성자는 자동 상속되지 않아 자식이 직접 정의해야 하며, 부모 생성자가 항상 먼저 실행된다. `base`를 생략하면 부모의 매개변수 없는 생성자가 호출되므로, 그런 생성자가 없으면 `: base(...)`를 반드시 써야 한다. 생성자 안의 virtual 호출은 자식이 override한 메서드가 아직 초기화되지 않은 상태의 객체를 만질 수 있어 위험하다. → 코어 2 (2.1)

    </details>

11. abstract 클래스/멤버와 sealed는 각각 무엇을 강제하나요?

    <details markdown="1"><summary>답 확인</summary>

    추상 클래스는 직접 `new` 할 수 없고, 추상 멤버는 구현 없이 선언만 하며 자식이 반드시 구현해야 한다. sealed는 클래스나 override 멤버에 붙여 더 이상의 상속/재정의를 막는다(클래스에 붙이는 쪽이 더 흔함). → 코어 2 (2.1)

    </details>

12. 인터페이스의 명시적 구현은 언제 쓰고, 어떻게 호출되나요? 기본 인터페이스 멤버(C# 8)의 목적은?

    <details markdown="1"><summary>답 확인</summary>

    `void IFoo.Bar()`처럼 구현하면 인터페이스 타입으로 캐스트했을 때만 호출된다. 두 인터페이스의 시그니처 충돌 해결이나 일반 사용에 방해되는 멤버를 숨길 때 쓴다. 기본 구현은 널리 쓰이는 라이브러리 인터페이스에 멤버를 추가해도 기존 구현이 깨지지 않게 하려는 것이며, 항상 명시적 구현처럼 동작한다. → 코어 2 (2.2)

    </details>

13. 클래스 상속과 인터페이스 중 무엇을 고를지 책의 기준은?

    <details markdown="1"><summary>답 확인</summary>

    자연스럽게 구현을 공유하는 타입끼리는 클래스 상속, 구현이 서로 독립적인 능력(날 수 있는 생물, 육식 동물 같은)은 인터페이스로 만든다. 클래스 상속은 하나뿐이지만 인터페이스는 여러 개 구현할 수 있다. → 코어 2 (2.2)

    </details>

14. `object o = 9;` 후 `(long)o`의 결과는? 박싱 후 원본을 바꾸면 박스된 값은?

    <details markdown="1"><summary>답 확인</summary>

    예외가 난다. 언박싱은 원래 타입과 정확히 일치해야 하므로 `(int)o`가 맞다. 박싱은 값을 힙 객체로 복사하므로 원본을 바꿔도 박스된 값은 그대로다. 값 타입을 인터페이스 변수에 담을 때도 박싱이 일어난다. → 코어 3 (3.1)

    </details>

15. `GetType()`과 `typeof`의 차이, 그리고 ToString을 override하지 않으면 무엇이 출력되나요?

    <details markdown="1"><summary>답 확인</summary>

    `GetType()`은 실행 시점에 객체의 실제 타입을, `typeof(X)`는 타입 이름으로 컴파일 시점에 `System.Type`을 얻는다. ToString을 override하지 않으면 `Console.WriteLine(obj)`에 타입 이름이 나온다. → 코어 3 (3.1)

    </details>

16. struct의 특성(대입·null·상속)과, 직접 정의한 초기화를 거치지 않는 경우는?

    <details markdown="1"><summary>답 확인</summary>

    struct는 값 타입이라 대입 시 통째로 복사되고, null이 될 수 없으며, 상속이 불가하고 finalizer도 없다. 항상 0으로 채우는 암묵적 기본 생성자가 있고, `default`나 배열 생성으로 만든 인스턴스는 직접 정의한 초기화를 거치지 않는다. 그래서 기본값 자체가 유효한 상태가 되도록 설계하라고 권한다. → 코어 3 (3.2)

    </details>

17. struct를 고려할 때의 4가지 조건과, 큰 struct가 오히려 불리할 수 있는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    (1) 논리적으로 단일 값 (2) 인스턴스 크기 16바이트 미만 (3) 불변 (4) 박싱·언박싱이 잦지 않음. Microsoft 권고는 기본적으로 class이며, 큰 값 타입은 대입할 때마다 통째로 복사되어 참조 타입보다 비용이 클 수 있다. → 코어 3 (3.2)

    </details>

18. Flags enum을 만드는 규칙과 `|`, `&`, `^`의 역할은? enum에 정의되지 않은 값이 들어올 위험은 어떻게 막나요?

    <details markdown="1"><summary>답 확인</summary>

    값을 2의 거듭제곱(1, 2, 4, 8...)으로 두고 `[Flags]`를 붙이며 이름은 복수형, `None = 0`을 둘 수 있다. `|`는 합치기, `&`는 포함 검사, `^`는 토글이다. enum은 캐스트로 `(ItemGrade)999` 같은 값도 담을 수 있으므로 마지막 else에서 예외를 던지거나 `Enum.IsDefined`로 검사한다(Flags enum에는 IsDefined가 통하지 않음). → 코어 3 (3.3)

    </details>

19. 제네릭이 없을 때 object 기반 컬렉션의 문제 두 가지와, `default(T)`의 값은?

    <details markdown="1"><summary>답 확인</summary>

    박싱과 다운캐스팅이 필요하고, 잘못된 타입을 넣어도 컴파일 오류가 나지 않아 실행 중에 예외가 난다. 제네릭은 타입 안전성을 높이고 박싱·캐스팅을 줄인다. `default(T)`는 참조 타입이면 null, 값 타입이면 0으로 채운 값이다. → 코어 4 (4.1)

    </details>

20. 제네릭 제약 `where T : new()`, `where T : IComparable<T>`, `where T : class`는 각각 무엇을 허용/요구하나요? 제약이 없으면 C++ 템플릿처럼 `a.CompareTo(b)`를 쓸 수 있나요?

    <details markdown="1"><summary>답 확인</summary>

    `new()`는 매개변수 없는 생성자를 요구해 `new T()`를 쓸 수 있게 한다. `IComparable<T>`(인터페이스/기반 클래스 제약)는 그 구현을 요구해 `a.CompareTo(b)`를 쓸 수 있게 한다. `class`/`struct`는 참조 타입/값 타입으로 제한한다. 제약이 허용하는 기능만 T에 쓸 수 있으므로, 제약 없이는 `CompareTo`를 부를 수 없다(템플릿의 덕 타이핑과 다름, 본문 보충). → 코어 4 (4.1)

    </details>

### 3. 기억 고리

- **C++ 유추:** `virtual`/`override` = C++ 가상 함수와 같은 동적 디스패치. ⚠️ C#은 `override`를 반드시 써야 하고, 빼먹으면 숨기기가 된다.
- **C++ 유추:** 제네릭 ≈ 템플릿. ⚠️ 런타임에 구체화되고, `where` 제약이 허락한 멤버만 쓸 수 있다(덕 타이핑 없음).
- **C++ 유추:** 박싱 ≈ `std::any`에 값 복사본 담기(`any_cast`는 정확한 타입이어야 함). ⚠️ C#은 `object`/인터페이스 자리에 값 타입을 넣으면 **암묵적으로** 일어난다.
- **C++ 유추:** C++ `struct`/`class` ≠ C# `struct`/`class`. ⚠️ C#에서는 값 타입 vs 참조 타입이라는 의미 차이이며, 타입 정의 시점에 결정된다.
- **비유:** virtual/override = 같은 "공격하라" 명령에 병사마다 자기 방식으로 반응하는 것(명령하는 쪽은 병사 계급표만 보면 된다). ⚠️ 비유가 깨지는 지점: `new`로 숨긴 멤버는 "부모 계급표"로 부르면 부모 버전이 실행된다 — 진짜 다형성은 `virtual`/`override`일 때만.
- **비유:** 인터페이스 ≈ 자격증(이 능력이 있다는 약속), 상속 ≈ 가문(구현을 물려받음). 자격증은 여러 개 딸 수 있지만 가문은 하나다. ⚠️ 깨지는 지점: C# 8 기본 구현은 인터페이스에도 본문이 생긴다.
- **비유:** 박싱 = 동전(값)을 상자에 넣어 창고(힙)에 맡기는 것. 꺼낼 때는 넣은 것과 정확히 같은 종류여야 한다(int로 넣고 long으로 못 꺼냄). ⚠️ 깨지는 지점: 상자에 들어간 것은 복사본이라 원래 동전을 바꿔도 상자 속 값은 그대로다.
- **묶음(3의 법칙):** 다형성 키워드 3단계 `virtual`(바꿔도 됨) → `abstract`(반드시 바꿔야 함) → `sealed`(더는 못 바꿈). 타입 검사 3형제 캐스트(예외) / `as`(null) / `is`(bool + 변수). 프로퍼티 쓰기 제한 3단계 `set` / `private set` / `init`.
- **대칭·순서:** class(참조·상속 가능·기본 선택) ↔ struct(값·상속 불가·작고 불변) / 클래스 상속(하나, 구현 공유) ↔ 인터페이스(여러 개, 능력 약속) / 업캐스팅(항상 성공) ↔ 다운캐스팅(실패 가능) / 박싱 ↔ 언박싱.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "몬스터 종류가 늘어도 전투 코드에 if문을 늘리지 않는 방법(override와 인터페이스)"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "C#의 struct는 C++ struct가 아니다", "override를 빼먹으면 무슨 일이 생기나", "제네릭은 왜 `where` 없이는 `<` 연산도 못 쓰나"를 C++ 코드와 나란히 놓고 2분씩 설명해 보세요.
- **랜덤 논리 게임:** A "데미지 결과 같은 작은 값은 struct로 만들어야 한다(힙 할당 없음)" vs B "기본은 class다(큰 struct 복사 비용, 박싱, 기본값 함정)" — 양쪽을 번갈아 변호해 보세요. 추가 라운드: A "공통 기능은 추상 부모 클래스로" vs B "공통 행동은 인터페이스로".
- **AI 역할 반전:** "내가 C#의 상속·다형성과 인터페이스의 차이를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제3부. 메모리와 성능 기초

> **🎮 게임 서버 개발자에게** — C++ 서버에서 `new`/`delete`, 스마트 포인터, 패킷 버퍼 풀, RAII로 직접 하던 메모리·자원 관리가 C#에서는 둘로 갈라진다. **메모리는 GC가 대신 회수**하지만(그래서 `delete`가 없고 회수 시점도 내가 정하지 못한다), **파일·소켓·타이머 같은 자원은 여전히 내가 `using`/`Dispose`로 명시해서** 닫아야 한다. 결정적인 차이는 GC가 도는 동안 스레드가 멈출 수 있다는 점이다. C++에서 "할당은 느리다"였던 감각이 C#에서는 "쓰레기를 많이 만들면 나중에 GC 멈춤으로 돌아온다"로 바뀐다. 이 부를 객체지향 바로 뒤에 두는 이유가 이것이다. 이후 모든 C# 코드를 이 감각으로 읽어야 한다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 평균 응답은 빠른데 가끔 일부 요청만 수십~수백 ms씩 튄다(p99 지연) — 요청 경로의 할당이 GC를 자주 깨우고 있다.
> - 재시작 없이 며칠 돌린 서버의 메모리가 계속 오른다. `delete`를 빼먹을 일도 없는데 왜? — 오래 사는 객체의 이벤트·static 캐시가 쓰지 않는 객체를 붙들고 있다.
> - DB 연결 풀이 고갈되거나 파일 핸들이 쌓인다 — `IDisposable`을 `using` 없이 썼다(C++ RAII처럼 스코프만 벗어나면 정리된다고 착각).

## 코어 — 이것만은 100%

> **한 문장:** 힙에 만든 객체는 GC가 루트에서 닿지 않는 것을 세대별로 나중에 한꺼번에 치우며 그동안 스레드가 멈출 수 있으므로, 핫 경로에서는 박싱·문자열 `+=`·매번 `new`를 줄여 쓰레기를 덜 만들고, GC가 못 치우는 자원과 참조(Dispose·이벤트·타이머)는 직접 정리하되, 모든 최적화는 측정 후에 한다.

1. **메모리 배치: 스택·힙과 숨은 할당(박싱)** — 스택은 메서드 종료와 함께 즉시 정리되고, `new`로 만든 객체는 힙에 산다. 값 타입은 "선언된 그 자리"에 살며, 값 타입을 `object`/인터페이스에 담으면 박싱으로 힙에 몰래 새 객체가 생긴다.
2. **GC: 루트·세대·멈춤** — GC는 루트에서 닿지 않는 객체를 Gen0 → Gen1 → Gen2 세대별로 주기적으로 회수한다. 비용은 할당보다 해제(수집) 쪽이며 살아 있는 객체 수에 비례하고, 수집 중에는 스레드가 멈출 수 있다. "Gen0에서 죽거나, 오래 살아 Gen2에 머물게".
3. **할당 줄이기: 문자열·풀·struct·컬렉션** — 숨은 할당(문자열 `+=`, 매 요청 `new`, 옛 컬렉션, 인터페이스로 감싼 `foreach`)은 `StringBuilder`·재사용/풀·작은 불변 struct·제네릭 컬렉션으로 줄인다. 단, 핫 경로에서만, 반드시 측정(프로파일링) 후에.
4. **GC가 못 하는 정리: Dispose·이벤트·타이머** — GC는 메모리만 회수한다. 파일·소켓·타이머 같은 자원은 `using`/`Dispose`로, 이벤트 구독은 `-=`로 직접 정리해야 한다. C#의 누수는 "잊혀진 참조"다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `new`/`delete`, `unique_ptr`/`shared_ptr` | `new` + 가비지 컬렉션(GC) | 객체를 힙에 만들고 포인터(참조)로 다룬다 | `delete`가 없다. 회수 시점은 GC가 정하고 비결정적이다. 참조 카운트가 아니라 루트에서 추적하므로 `shared_ptr`가 새던 순환 참조도 루트에서 닿지 않으면 회수된다. 대신 수집 중 스레드가 멈출 수 있다(stop-the-world) |
| 객체마다 스택/힙을 고름 (`Monster m;` vs `new Monster`) | 값 타입(struct) / 참조 타입(class) | 값 타입 지역 변수는 스택에, 메서드가 끝나면 즉시 사라진다 | 위치를 **타입이** 정한다. class 인스턴스는 `new`로 힙에, 값 타입은 "선언된 그 자리"(클래스 필드면 힙). 참조 대입은 주소 복사라 같은 객체를 공유한다 |
| 소멸자 `~T()` (스코프 끝에서 즉시 호출) | finalizer `~T()` | 문법이 같고 "정리 코드"를 둔다 | **소멸자가 아니다.** GC 이후 finalizer 스레드에서 비결정적으로 호출되고, 그 객체는 다음 수집에서야 회수된다. 일상적인 정리 수단이 아니라 Dispose를 잊었을 때의 백업이다 |
| RAII (스코프를 벗어나면 소멸자가 자원 해제) | `IDisposable` + `using` | 블록이 끝나면 예외가 나도 정리된다(결정적 해제) | **`using`을 직접 써야만** 동작한다. 그냥 지역 변수로 두면 스코프를 벗어나도 아무 일도 없다. 멤버 소멸자 자동 연쇄도 없어서, disposable 필드를 가진 클래스는 스스로 `IDisposable`을 구현해 넘겨 줘야 한다 |
| 패킷 버퍼 풀, 프리 리스트 | `ArrayPool<T>`, 오브젝트 풀 | 다 쓴 버퍼를 반납해 재사용한다. 반납 후 사용(use-after-return)은 버그 | 목적이 malloc 비용보다 **GC 압박(쓰레기·승격) 줄이기**다. `Rent(n)`은 n보다 큰 배열을 줄 수 있다 |
| 메모리 누수 = `delete` 누락, 전역 리스너 목록에 `shared_ptr`를 넣고 안 뺌 | 관리 메모리 누수 = 잊혀진 참조(이벤트 구독, static 캐시, 타이머) | 오래 사는 쪽이 붙든 참조 때문에 해제되지 않는다 | `delete` 누락형 누수는 없다. 남은 것은 뒤쪽 유형뿐이고, 이벤트 `+=`는 눈에 안 띄게 구독자를 붙든다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `Monster same = m; same.Hp = 50;` 을 하면 왜 `m.Hp`도 바뀔까?
> 2. `ArrayList`에 `int`를 넣는 것과 `List<int>`에 넣는 것은 메모리에서 무엇이 다를까?
> 3. GC가 도는 순간 서버 응답이 튀는(p99 지연) 이유는 무엇일까?
> 4. C#에는 `delete`가 없는데, 메모리 누수는 어떻게 생길 수 있을까?
> 5. `foreach`는 언제 `for`와 똑같고, 언제 더 비쌀까?
>
> **처리법:** 🛠 실습 `StringBuilder` 이어 붙이기, `ArrayPool<T>.Shared.Rent/Return`, `using`/`Dispose`, 이벤트 `+=`/`-=` 짝 → 바로 실행 · 🗺 관계도 할당 → 쓰레기 → GC(세대·루트) → 일시 정지 → 응답 지연, 그리고 이를 줄이는 문자열·풀·struct·Dispose·이벤트 해제 · 📦 카드로 LOH 기준(85,000/80,000바이트), Gen0 1ms 미만·전체 수집 최대 100ms, 객체 오버헤드 16바이트(64비트), struct 16바이트 미만 권고, StringBuilder 벤치마크(21.22KB vs 3.13KB)

**이 부의 학습 목표**
1. 변수가 스택과 힙 중 어디에 사는지, 박싱이 왜 숨은 비용인지 설명할 수 있다.
2. 가비지 컬렉션(GC)이 무엇이고, 왜 "할당을 많이 하면 서버 응답이 순간 느려질 수 있는지" 이해한다.
3. 문자열·오브젝트 풀·Dispose·이벤트 해제·foreach 같은 일상 코드에서 메모리 낭비를 피하는 습관을 갖는다.

> 🔧 보충(책 외): 이 부는 "GC 내부 알고리즘"이 아니라 "내 코드가 어떤 쓰레기를 만들고, 어떻게 줄이는가"에 초점을 둡니다. 아래 코드는 모두 설명용 짧은 예제이며 C#으로 만드는 HTTP 웹 백엔드(게임 서버)에서 그대로 적용할 수 있도록 특정 프레임워크에 종속되지 않게 작성했습니다.

> 🔧 보충(책 외): 이 부는 객체지향([제2부](02_제2부_객체지향.md)) 바로 다음에 읽도록 배치했습니다. 4.2절의 이벤트(`event`, `+=`/`-=`)와 람다, `using` 문, `foreach`의 정체(`IEnumerable<T>`)는 [제4부](04_제4부_델리게이트_예외_현대C샤프.md)에서, 제네릭 컬렉션(`List<T>`, `Dictionary<K,V>`)은 [제5부](05_제5부_NET_기본_라이브러리.md)에서 자세히 배웁니다. 지금은 이벤트 구독을 "C++의 콜백/리스너 등록", `-=`를 "등록 해제" 정도로 이해하고 읽으면 충분하며, [제4부](04_제4부_델리게이트_예외_현대C샤프.md)을 마친 뒤 4.2절을 다시 읽어 보세요.

---

## 코어 1. 메모리 배치 — 스택·힙과 숨은 할당(박싱)

> 이 코어의 질문: "이 변수의 데이터는 어디에 살고, 언제 사라지는가?" 스택/힙과 값/참조의 저장 방식(1.1)을 알면, 값 타입이 `object`에 담길 때 왜 힙에 몰래 객체가 생기는지(1.2 박싱)가 바로 따라 나온다. [제2부](02_제2부_객체지향.md)에서 본 값 타입·참조 타입과 박싱을 여기서는 "메모리와 GC 비용" 관점으로 다시 본다.

### 1.1 스택 vs 힙, 값/참조 저장 방식

**한 줄 요약:** 스택은 "메서드가 끝나면 바로 치워지는 작업대", 힙은 "GC가 나중에 치워주는 창고"다.

> 📖 출처: C# 12 in a Nutshell 2장 "The Stack and the Heap" (텍스트 L4431-4520), High-Performance Programming in C# and .NET 3장 "Understanding the various types of memory used in C#" (텍스트 L3690-3790), Pro .NET Memory Management 4장 "Reference Types" (텍스트 L8132-8176)

**핵심 설명**
- **스택**: 메서드의 지역 변수와 매개변수가 쌓이는 곳. 메서드에 들어가면 쌓이고, 나오면 즉시 사라진다. 정리 비용이 거의 없고 예측 가능하다.
- **힙**: `new`로 만든 객체(참조 타입 인스턴스)가 사는 곳. 더 이상 아무도 참조하지 않으면 GC가 알아서 회수한다. C#에서는 객체를 직접 삭제할 수 없다.
- 값 타입(int, struct 등)은 "**선언된 그 자리**"에 산다. 지역 변수면 스택, 클래스의 필드나 배열 원소라면 그 객체와 함께 힙에 있다.
- 참조 타입 변수는 "주소"만 담고, 실제 데이터는 힙에 있다. 변수를 다른 변수에 대입하면 데이터가 아니라 주소만 복사된다.
- static 필드도 힙에 있으며 프로그램이 끝날 때까지 살아 있다.
- High-Performance Programming in C# and .NET은 비용이 할당할 때보다 **해제할 때** 생기며, 스택의 해제가 힙보다 예측하기 쉽다고 설명한다. 객체를 많이 만들수록 GC가 할 일이 늘어난다.
- Pro .NET Memory Management는 "참조 타입은 힙에 산다"는 말이 완전히 정확하지는 않다고 덧붙인다. 참조 타입 데이터를 어디에 둘지는 표준이 정하지 않고, 런타임이 다른 곳에서 공유되지 않음을 증명하면 스택에 둘 수도 있다(.NET 8 시점에는 부분 지원이며 기본 꺼짐). 입문 단계에서는 "`new`로 만든 객체는 힙"으로 이해하면 충분하다.

```csharp
class Monster { public int Hp; }      // 클래스 = 참조 타입 (힙)
struct Damage { public int Value; }   // 구조체 = 값 타입

void Attack()
{
    int gold = 100;               // 스택
    Damage dmg = new Damage();    // 스택 (지역 변수라서)
    Monster m = new Monster();    // 변수 m은 스택, Monster 객체는 힙
    Monster same = m;             // 주소만 복사: m과 same은 같은 객체
    same.Hp = 50;                 // m.Hp도 50
}   // 메서드 종료: gold, dmg, m, same은 즉시 사라짐. Monster 객체는 GC가 나중에 회수
```

> 🔧 보충(책 외): **게임 서버에서는** 요청 하나를 처리할 때마다 몬스터·아이템 같은 객체를 수천 개씩 `class`로 만들고 버리면, 동시에 들어오는 요청 수만큼 힙이 빠르게 쓰레기로 차오릅니다. "객체를 꼭 새로 만들어야 하는가?"를 먼저 묻는 것이 이 부 전체의 출발점입니다.

### 1.2 박싱과 언박싱의 비용

**한 줄 요약:** 박싱은 값 타입(int 등)을 `object`에 담으면서 힙에 몰래 새 객체를 만드는 일이라, 자주 하면 쓰레기가 쌓인다.

> 📖 출처: High-Performance Programming in C# and .NET 3장 "Boxing and unboxing" (텍스트 L4188-4297), Pro .NET Memory Management 4장 "Boxing and Unboxing" (텍스트 L8990-9080), Pro .NET Memory Management 6장 "Boxing" (텍스트 L14437-14500), Writing High-Performance .NET Code 5장 "Avoid Boxing" (텍스트 L9631-9670)

**핵심 설명**
- 박싱은 두 단계다. (1) 힙에 상자 객체를 할당 (2) 값을 그 안에 복사. 나중에 GC가 이 상자도 치워야 한다.
- 언박싱은 상자에서 값을 꺼내 복사하는 것. 언박싱 자체는 힙 할당을 만들지 않지만, 박싱이 없으면 언박싱도 없다. 문제의 핵심은 박싱이다.
- 박싱은 대부분 **암시적**으로 일어나 눈에 잘 안 띈다. 흔한 경우:
  1. 값 타입을 `object` 매개변수에 넘길 때 (`string.Format("{0}", i)` 등)
  2. struct를 자신이 구현한 **인터페이스 타입**으로 넘길 때
  3. 옛날식 컬렉션(`ArrayList`, `Hashtable`, 비제네릭 `Queue`/`Stack`)에 값 타입을 넣을 때
- 해결 방향: 제네릭 컬렉션(`List<int>`)을 쓰면 박싱이 없다. 인터페이스로 받을 때는 제네릭 메서드(`Helper<T>(T data) where T : IFoo`)로 박싱을 피할 수 있다.

```csharp
int gold = 500;
object boxed = gold;          // 박싱: 힙에 상자 생성
int back = (int)boxed;        // 언박싱: 값 꺼내 복사

var bad  = new System.Collections.ArrayList();
bad.Add(gold);                // 매번 박싱!
var good = new List<int>();
good.Add(gold);               // 박싱 없음
```

> 🔧 보충(책 외): **게임 서버에서는** 골드·데미지 계산 값을 `object`나 옛 컬렉션에 담아 모든 요청마다 주고받으면 눈에 안 보이는 쓰레기가 요청 수만큼 쌓입니다. 숫자는 `List<long>`처럼 제네릭 타입으로 다루세요.

---

## 코어 2. GC — 루트·세대·멈춤

> 이 코어의 질문: "버린 객체는 언제, 어떤 비용으로 사라지는가?" 루트에서 닿지 않으면 쓰레기이고, 세대별로 나눠 치우며, 치우는 동안 스레드가 멈출 수 있다. 코어 3의 모든 기법은 이 비용을 줄이려는 것이고, 코어 4의 누수는 "루트에서 닿는 한 회수되지 않는다"에서 나온다.

### 2.1 가비지 컬렉션 개요와 세대

**한 줄 요약:** GC는 "아무도 안 쓰는 객체"를 가끔 한꺼번에 치우는 자동 청소부인데, 청소하는 동안 프로그램이 잠깐 멈출 수 있다.

> 📖 출처: C# 12 in a Nutshell 12장 "Automatic Garbage Collection" / "Roots" / "How the GC Works" / "Generational collection" / "Forcing Garbage Collection" (텍스트 L41362-41465, L41809-41902, L42042-42054), High-Performance Programming in C# and .NET 4장 "Object generations and avoiding memory issues" (텍스트 L4450-4474), Writing High-Performance .NET Code 2장 "Memory Management" GC 개요 (텍스트 L3050-3075, L3405-3425). LOH 기준값은 텍스트 L41903-41908

**핵심 설명**
- **GC가 하는 일**: 메모리를 직접 해제하지 않아도 CLR이 자동으로 회수한다. 단, 객체를 버린 즉시가 아니라 **주기적으로, 정해진 시각 없이** 일어난다.
- **살아 있다는 기준(루트)**: 실행 중인 메서드(호출 스택에 있는 메서드 포함)의 지역 변수·매개변수, static 변수, 종료(finalization) 대기 큐의 객체에서 따라갈 수 있는 객체만 "산 객체"다. 어디서도 닿지 않으면(서로 순환 참조해도) 쓰레기다.
- **수집 시점**: GC는 `new`로 할당할 때 일정량이 쌓였거나 메모리를 줄여야 할 때 시작한다. 객체를 버린 뒤 실제 회수까지의 지연은 예측할 수 없다(C# 12 in a Nutshell).
- **세대(generation)**: 새 객체는 Gen0에서 시작하고, 한 번의 수집에서 살아남으면 Gen1, 그 외 나머지는 Gen2다. C# 12 in a Nutshell은 "많은 객체가 빨리 버려지지만 일부는 오래 산다"는 점을 이용해 젊은 세대를 자주, Gen2를 드물게 청소한다고 설명한다.
- **비용 감각(C# 12 in a Nutshell의 매우 대략적 수치)**: Gen0 수집은 1ms 미만일 수 있어 보통 눈치채기 어렵지만, 큰 객체 그래프를 가진 프로그램의 전체 수집은 100ms까지 걸릴 수 있다. 수치는 조건에 따라 크게 달라진다. 수집 중에는 스레드가 멈출 수 있고, Writing High-Performance .NET Code는 Gen0/Gen1 수집 동안 프로그램이 일시 정지하며 Gen2 수집은 설정에 따라 일부를 백그라운드 스레드로 처리한다고 설명한다.
- Writing High-Performance .NET Code: GC 시간은 "할당한 객체 수"가 아니라 수집 대상 세대에서 **살아 있는 객체 수**에 거의 비례한다. 수집 전에 참조를 끊은 객체는 GC 시간에 기여하지 않는다.
- **큰 객체**: 기준 크기를 넘는 객체는 별도의 큰 객체 힙(LOH)에 들어가며, Gen2 수집 때만 정리된다. 기준값은 책마다 다르다. C# 12 in a Nutshell은 "현재 85,000바이트"라 하고, High-Performance Programming in C# and .NET은 80,000바이트로 적는다. 정확한 값보다 "큰 배열을 자주 새로 만들지 말라"는 방향이 중요하다. C# 12 in a Nutshell은 LOH를 두는 이유를 큰 객체를 옮기는(압축) 비용과 Gen0 수집이 잦아지는 것을 피하기 위해서라고 설명한다.
- **Writing High-Performance .NET Code의 핵심 원칙**: "객체는 Gen0에서 죽거나, 아니면 오래 살아 Gen2에 머물게 하라." 즉 짧게 쓰고 버리든지, 오래 붙들고 재사용하든지 둘 중 하나가 좋다.
- `GC.Collect()`로 강제 수집은 가능하지만, C# 12 in a Nutshell은 대체로 GC가 시점을 정하게 두는 편이 성능이 좋다고 한다. 강제 수집은 Gen0 객체를 불필요하게 상위 세대로 올리고 GC의 자체 조절을 방해할 수 있기 때문이다(오래 잠들어 있는 서비스 같은 예외는 있다).

```csharp
// 매 틱(또는 매 요청)마다 새 리스트를 만들면 Gen0에 쓰레기가 계속 쌓인다
void OnTickBad()
{
    var targets = new List<Monster>();   // 매 틱 할당
    // ... 사용 ...
}

// 한 번 만들어 재사용하면 쓰레기가 생기지 않는다
readonly List<Monster> _targets = new();
void OnTickGood()
{
    _targets.Clear();                    // 비우고 다시 사용
    // ... 사용 ...
}
```

> 🔧 보충(책 외): **게임 서버에서는** 전투 계산이나 보상 처리 같은 요청 처리 경로가 초당 수천 번 실행될 수 있습니다. 여기서 쓰레기를 계속 만들면 GC가 자주 깨어나고, GC가 돌 때 스레드가 멈출 수 있어 일부 요청의 응답이 튀는 지연(p99 지연)이 생깁니다. 서버는 오래 떠 있는 프로세스이고 동시 요청이 많아 작은 낭비도 누적됩니다. 이 부의 나머지는 모두 "쓰레기를 덜 만드는 법"입니다.

> 🔧 보충(책 외): 서버에서는 GC 동작 모드(서버 GC/워크스테이션 GC, 동시(백그라운드) GC 등)를 설정으로 고를 수 있습니다. 이 설정들은 이 책 원문이 다룬 내용이 아니므로, 배포 환경에서 실제 지연과 메모리 사용량을 측정해 결정하는 습관을 권합니다.

---

## 코어 3. 할당 줄이기 — 문자열·풀·struct·컬렉션

> 이 코어의 질문: "핫 경로에서 쓰레기를 어떻게 덜 만드는가?" 세 도구로 묶어 기억한다. **문자열**(불변이라 `+=`가 새 객체 → `StringBuilder`, 3.1) · **재사용**(풀/`Clear()`, 3.2) · **값 타입과 제네릭**(작은 불변 struct, 제네릭 컬렉션, 감싸지 않은 `foreach`, 3.3). 그리고 모든 절의 공통 단서: 핫 경로에서만, 측정 후에.

### 3.1 문자열 불변성과 할당 줄이기

**한 줄 요약:** 문자열은 한번 만들면 못 바꾸므로, 바꾸는 것처럼 보이는 코드는 사실 매번 새 문자열을 만든다.

> 📖 출처: Pro .NET Memory Management 4장 "Strings" (텍스트 L8485-8600), Pro .NET Memory Management 6장 "String Concatenation and Formatting" (텍스트 L14835-14908), Writing High-Performance .NET Code 6장 "Strings" (텍스트 L11650-11665)

**핵심 설명**
- `string`은 **불변**이다. `s[0] = 'X'`는 컴파일 오류. `+=`는 값을 수정하는 게 아니라 **새 문자열을 만들고** 옛것은 쓰레기로 버린다.
- Pro .NET Memory Management는 `+=`를 네 번 쓰면 임시 문자열이 네 개 생기는 예를 든다(각 `+=`가 `string.Concat` 호출로 바뀐다). 각각 수명이 짧지만, 할당을 줄이는 것이 성능 개선의 흔한 방법이라고 강조한다.
- 복잡한 문자열을 만들거나 컬렉션의 값을 모아 이어 붙일 땐 `StringBuilder`를 고려한다. Pro .NET Memory Management의 벤치마크(64번 반복해 이어 붙이기, .NET 8)에서 `+=` 방식은 약 21.22KB, `StringBuilder`는 약 3.13KB를 할당했다(약 7배 차이). Pro .NET Memory Management 본문은 이를 "열 배 정도"라고 표현한다.
- 반대로 **두세 조각만** 붙일 때는 그냥 `+`가 낫다고 Pro .NET Memory Management는 말한다(내부적으로 `string.Concat`이 문자열 데이터를 직접 채운다).
- Writing High-Performance .NET Code: 문자열은 사람이 읽는 텍스트 데이터다. 프로그램이 텍스트 처리가 목적이 아니라면 가능한 한 문자열이 아닌 표현을 택하고, 판단용이라면 enum이나 숫자를 쓰며 문자열 비교 자체를 피하라고 한다.

```csharp
// 나쁜 예: 반복문에서 계속 새 문자열 생성
string log = "";
for (int i = 0; i < 100; i++)
    log += $"[{i}] 몬스터 처치\n";

// 좋은 예: 하나의 StringBuilder에 이어 붙임
var sb = new System.Text.StringBuilder();
for (int i = 0; i < 100; i++)
    sb.Append('[').Append(i).Append("] 몬스터 처치\n");
string result = sb.ToString();

// 두세 조각이면 + 도 충분
int level = 12;
string label = "Lv." + level + " 용사";
```

> 🔧 보충(책 외): **게임 서버에서는** 요청마다 로그·응답 문자열을 `+=`로 반복해서 이어 붙이면 동시 요청 수만큼 임시 문자열이 쌓입니다. 전투 로그처럼 긴 문자열은 `StringBuilder`를 쓰고, 상태 판단용 값은 문자열 비교 대신 enum이나 숫자를 쓰세요.

### 3.2 할당 회피: 오브젝트 풀, 배열 풀

**한 줄 요약:** 풀(pool)은 "다 쓴 객체를 버리지 않고 창고에 반납했다가 다시 꺼내 쓰는" 방식이다.

> 📖 출처: Pro .NET Memory Management 6장 "Avoiding Allocations" / "Creating a Lot of Objects – Use Object Pool" / "Creating Arrays – Use ArrayPool" (텍스트 L13193-13245, L13596-13618, L13941-13972), C# 12 in a Nutshell 12장 "Array Pooling" (텍스트 L42113-42158), Writing High-Performance .NET Code 2장 (텍스트 L3405-3411)

**핵심 설명**
- **왜?** Pro .NET Memory Management는 할당을 피하는 것이 .NET 메모리 최적화에서 가장 효과적인 방법 중 하나라고 하면서도, 모든 줄을 따질 필요는 없고 성능이 중요한 **핫 경로**부터 분석하라고 조언한다. 1분에 한 번 실행되는 줄의 할당량은 대개 중요하지 않다.
- **풀링을 고려할 때(Pro .NET Memory Management)**: (1) 한 사이클이 아까운 핫 경로에서 할당되는 객체 (2) 초기화 비용이 큰 객체 (3) 수명이 짧지만 Gen1/Gen2로 승격될 만큼은 긴 객체. Pro .NET Memory Management는 이를 "midlife crisis"라 부르며 최악의 경우로 꼽고, 풀링으로 수명을 늘려 재사용하면 해결된다고 한다.
- 반대로 만들자마자 곧바로 버리는 객체는 Gen0에서 빨리 치워지므로 굳이 풀링하지 않아도 될 수 있다(Pro .NET Memory Management).
- **배열 풀**: `ArrayPool<T>.Shared.Rent(최소길이)`로 빌리고 `Return(배열)`로 반납한다(`System.Buffers`). 공유 풀은 크기별 버킷(16, 32, 64, ... 요소)으로 배열을 관리하므로 요청보다 큰 배열이 올 수 있고, 작은 배열이 오지는 않는다. 값 타입 배열을 풀링하는 편이 더 효율적이다(Pro .NET Memory Management). 반납한 뒤에 계속 쓰면 자신의 코드뿐 아니라 같은 풀을 쓰는 다른 API도 망가뜨릴 수 있다(C# 12 in a Nutshell).
- Pro .NET Memory Management는 좋은 오브젝트 풀을 만들기가 쉽지 않다고 한다. 특히 동기화 부담 없이 스레드 안전하게 만들기 어렵고, 단순한 구현은 원래 할당보다 성능이 나빠질 수 있다고 경고한다. Pro .NET Memory Management는 Roslyn 컴파일러의 `ObjectPool`을 바탕으로 한 검증된 예제(Listing 6-29)를 제시한다.

```csharp
// 배열 풀 (.NET 기본 제공, using System.Buffers; 필요)
int[] buffer = ArrayPool<int>.Shared.Rent(100);
try   { /* buffer 사용 (길이는 100 이상일 수 있음) */ }
finally { ArrayPool<int>.Shared.Return(buffer); }
```

> 🔧 보충(책 외): 아래 간단 오브젝트 풀은 설명용 자작 예제로, 책의 Roslyn 풀 구현을 단순화한 것이 아니며 단일 스레드에서만 안전합니다. 서버는 여러 요청이 동시에 처리되므로 이 예제를 그대로 공유해서 쓰면 안 됩니다. 실무에서는 직접 만든 풀보다 `ArrayPool<T>`처럼 검증된 풀을 우선 쓰세요.

```csharp
class BattleResult { public int Value; public float Life; }

class BattleResultPool
{
    private readonly Stack<BattleResult> _free = new();

    public BattleResult Rent(int value)
    {
        var t = _free.Count > 0 ? _free.Pop() : new BattleResult(); // 창고에 없을 때만 new
        t.Value = value; t.Life = 1f;                               // 재사용 전 초기화 필수
        return t;
    }

    public void Return(BattleResult t) => _free.Push(t);            // 다 쓰면 반납
}
```

> 🔧 보충(책 외): **게임 서버에서는** 요청마다 커다란 응답 버퍼나 계산용 배열을 새로 만들면 LOH·Gen2 압박으로 응답 지연이 생길 수 있어, `ArrayPool<T>` 같은 검증된 풀이 유력한 후보입니다. 반납한 버퍼를 계속 쓰지 않도록 주의하고, 효과는 측정으로 확인하세요.

### 3.3 클래스/구조체·컬렉션·foreach 관련 성능 팁

**한 줄 요약:** 작은 데이터는 struct, 옛 컬렉션은 금지, 인터페이스로 감싼 foreach는 조심 — 이 세 가지만 기억하면 된다.

> 📖 출처: Writing High-Performance .NET Code 5장 "Classes and Structs" / "Avoid Boxing" / "for vs. foreach" (텍스트 L9363-9395, L9631-9660, L9910-10006), Writing High-Performance .NET Code 6장 "Collections to Avoid" (텍스트 L11105-11140), High-Performance Programming in C# and .NET 3장 "Choosing between a struct and a class" (텍스트 L4010-4052)

**핵심 설명**
- **class 인스턴스는 힙에 있고**, 객체마다 고정 오버헤드(64비트에서 16바이트, 메서드 테이블 포인터와 sync block)가 붙는다. 필드가 없는 객체도 정렬 때문에 64비트에서 24바이트로 보인다. struct는 오버헤드가 없고 필드 크기의 합만 차지하며, 지역 변수면 스택, 클래스 필드면 그 객체 메모리 안에 들어간다(Writing High-Performance .NET Code).
- 데이터 16바이트짜리 100만 개 배열로 비교하면, class 배열은 참조 + 객체 오버헤드 때문에 64비트에서 40MB 이상, struct 배열은 16MB다(Writing High-Performance .NET Code의 계산). struct 배열은 값이 연속으로 놓여 CPU 캐시에도 유리하다.
- **struct 선택 기준(High-Performance Programming in C# and .NET, Microsoft 권고)**: 기본은 class. 다른 객체 안에 포함되거나 수명이 짧다면 struct를 고려하고, 그때는 (1) 논리적으로 값 하나를 나타내고 (2) 크기가 16바이트 미만이며 (3) 불변이고 (4) 박싱·언박싱이 잦지 않아야 한다. 반면 Writing High-Performance .NET Code는 정확한 최대 크기 숫자에 집착하지 말고 struct를 작게, 가능하면 불변으로 하되 실제 사용 패턴을 프로파일링해 판단하라고 한다.
- **컬렉션(Writing High-Performance .NET Code)**: `ArrayList`, `Hashtable`, `Queue`, `SortedList`, `Stack`, `ListDictionary`, `HybridDictionary` 같은 옛 컬렉션은 하위 호환용으로만 남아 있어 새 코드에서 쓰지 않는다. `object`를 담기 때문에 캐스팅과 박싱이 생긴다. 크기가 고정된 배열이나 제네릭 컬렉션(`List<T>`, `Dictionary<K,V>`)을 쓴다.
- **foreach(Writing High-Performance .NET Code)**: 단순한 `foreach`는 컴파일러가 일반 `for`로 바꾸기도 한다. 예제에서 배열을 그대로 `foreach`하면 `for`처럼 컴파일되지만, 같은 배열을 `IEnumerable<int>`로 바꿔 `foreach`하면 가상 메서드 호출 4번, try-finally, 열거자 변수의 메모리 할당이 생겨 CPU와 메모리를 더 쓴다. Writing High-Performance .NET Code는 표준 `for`가 모든 경우에서 훨씬 빨랐다고 하면서도, 간단한 테스트에서는 성능이 같게 나올 수 있다고 한다. 교훈은 "추상화(`foreach` + `IEnumerable`)를 씌우면 단순한 최적화가 사라진다"는 것이다.
- 위 내용은 **핫 경로에서만** 신경 쓰면 된다. 어차피 한 번 실행되는 코드까지 최적화할 필요는 없다(Pro .NET Memory Management의 조언).

```csharp
struct StatBonus            // 작고 불변인 값 하나 → struct 후보
{
    public readonly int Atk;
    public readonly int Hp;
    public StatBonus(int atk, int hp) { Atk = atk; Hp = hp; }
}

Monster[] monsters = new Monster[10];
foreach (var m in monsters) { }        // 배열 그대로: for와 동일하게 컴파일됨

IEnumerable<Monster> seq = monsters;
foreach (var m in seq) { }             // 인터페이스로 감싸면: 열거자 할당·가상 호출 발생

for (int i = 0; i < monsters.Length; i++) { }   // 배열 인덱스로 직접 순회
```

> 🔧 보충(책 외): **게임 서버에서는** 요청마다 반복 실행되는 전투 계산의 몬스터 순회는 배열을 직접 `for`/`foreach`로 돌리고, 배열이나 컬렉션을 `IEnumerable<T>`로 감싸 넘기는 것은 신중히 하세요. 스탯 보너스 같은 작은 값 묶음은 불변 struct가 좋은 후보이지만, 자주 `object`/인터페이스로 넘겨 박싱이 생기지 않는지 함께 확인하세요. "몬스터 순회" 같은 구체적 게임 맥락 적용은 필자의 연결입니다. `List<T>`를 직접 `foreach`하는 경우의 비용은 이 절의 근거(Writing High-Performance .NET Code)가 다루지 않은 부분이므로 직접 측정해 보세요. 책의 실제 근거는 배열/IEnumerable 비교와 struct 권고이며, 성능 최적화는 반드시 측정(프로파일링) 후 결정하라는 것이 책 전체의 공통 조언입니다.

---

## 코어 4. GC가 못 하는 정리 — Dispose·이벤트·타이머

> 이 코어의 질문: "GC가 있는데 왜 아직도 새는가?" 두 갈래다. ① GC는 **메모리만** 회수하므로 파일·소켓·타이머 같은 자원은 `using`/`Dispose`로 직접 반납한다(4.1, C++ RAII의 자리). ② GC는 **루트에서 닿는 객체를 절대 회수하지 않으므로** 잊혀진 참조(이벤트 구독, 활성 타이머, static 캐시)가 쓰지 않는 객체를 살려 둔다(4.2).

### 4.1 IDisposable, 정리(Dispose) 패턴

**한 줄 요약:** `Dispose`는 파일·소켓·타이머처럼 GC가 대신 처리해 주지 못하는 자원을 "내가 직접, 제때" 반납하는 약속이다.

> 📖 출처: C# 12 in a Nutshell 12장 "IDisposable, Dispose, and Close" / "Standard Disposal Semantics" / "When to Dispose" / "Calling Dispose from a Finalizer" (텍스트 L40915-41075, L41535-41650, 필드 가이드라인은 L42344-42345), High-Performance Programming in C# and .NET 4장 "Implementing the IDisposable pattern" (텍스트 L5095-5130)

**핵심 설명**
- **구분**: GC는 *메모리*를 자동 회수한다. 반면 열린 파일, 잠금, OS 핸들 같은 자원의 정리(Disposal)는 프로그래머가 명시적으로 한다(C# 12 in a Nutshell).
- 이런 타입은 `IDisposable`을 구현하며 `Dispose()` 메서드를 가진다. C#의 **`using`** 은 블록이 끝나면(예외가 나도) 자동으로 `Dispose()`를 호출해 주는 문법이다.
- **관례 규칙**: (1) `Dispose`된 객체는 되살릴 수 없다 (2) `Dispose`를 여러 번 불러도 오류가 없어야 한다 (3) 다른 disposable을 소유하면 내 `Dispose`가 그것도 호출한다.
- **언제?** C# 12 in a Nutshell의 안전한 규칙은 "잘 모르겠으면 Dispose하라". 예외는 내가 소유하지 않은 객체(예: static 필드로 얻은 공유 객체), Dispose가 원치 않는 동작을 하는 경우, 설계상 Dispose가 불필요한 경우다.
- 클래스가 `IDisposable`을 구현한 객체를 필드에 담으면 그 클래스도 `IDisposable`을 구현하는 것이 좋다(C# 12 in a Nutshell의 가이드라인, 4.2절 타이머 부분).
- **finalizer(`~클래스()`)** 를 이용한 백업 패턴(`Dispose(bool disposing)` + `GC.SuppressFinalize`)도 있다. C# 12 in a Nutshell은 이 패턴이 Dispose를 잊은 사용자에 대한 백업이 되지만 메모리 해제와 자원 해제를 묶고 finalization 스레드의 부담을 늘린다고 지적한다. 또한 finalizer가 있는 객체는 GC 후 finalizer 스레드에서 처리된 뒤 다음 수집에서야 회수된다. 단순한 `Dispose()`만 구현하는 방식은 sealed 클래스에 적합하며, sealed가 아닌 타입은 처음부터 백업 패턴을 따를 이유가 크다고 C# 12 in a Nutshell은 말한다.

```csharp
// (using System.IO; 필요)
string json = "{}";
// 파일 저장: using이 끝나면 파일 핸들이 자동으로 닫힌다
using (var writer = new StreamWriter("save.json"))
{
    writer.Write(json);
}

// C# 8 이후 간단 형태: 현재 블록이 끝날 때 Dispose
using var reader = new StreamReader("save.json");
string text = reader.ReadToEnd();

// 직접 만들 때 (sealed 클래스의 간단한 형태)
sealed class AutoBattle : IDisposable
{
    public void Dispose() { /* 타이머 중지, 구독 해제 등 */ }
}
```

> 🔧 보충(책 외): **게임 서버에서는** DB 연결, `HttpClient` 같은 네트워크 자원, 파일 스트림, 주기 타이머 등 `IDisposable`을 `using`으로 감싸는 습관이 중요합니다. 서버는 오래 실행되므로 정리하지 않은 자원이 쌓이면 연결 고갈이나 메모리 증가로 이어집니다. 주기 작업 타이머를 쓰는 객체는 `Dispose`에서 타이머를 꼭 끕니다(4.2절 참고). 참고로 `HttpClient`처럼 재사용이 권장되는 타입은 요청마다 만들지 않고 공유하는 것이 일반적이며, 이 내용은 책 원문이 아닙니다.

> 🔧 보충(책 외): **C++ 개발자 주의** — C#의 finalizer는 C++ 소멸자와 문법(`~클래스()`)만 같습니다. 스코프를 벗어날 때 불리지 않고, 언제 불릴지(또는 프로세스 종료 전에 불릴지) 보장되지 않습니다. C++의 RAII에 해당하는 것은 finalizer가 아니라 `IDisposable` + `using`이며, `using`을 쓰지 않으면 스코프를 벗어나도 아무 정리도 일어나지 않습니다. `using` 문법 자체는 [제4부](04_제4부_델리게이트_예외_현대C샤프.md)의 예외 처리와 함께 다시 다룹니다.

### 4.2 메모리 누수의 흔한 원인: 이벤트 구독

**한 줄 요약:** 이벤트를 `+=`로 구독해 놓고 `-=` 하지 않으면, 쓰지 않는 객체가 GC에 회수되지 못하고 계속 남는다.

> 📖 출처: C# 12 in a Nutshell 12장 "Managed Memory Leaks" (텍스트 L42160-42272, "Timers" L42274-42346), High-Performance Programming in C# and .NET 4장 "How using events can be a source of memory leaks" (텍스트 L5690-5730, L5991-5998)

> 🔧 보충(책 외): 이벤트(`event`)·델리게이트·람다는 [제4부](04_제4부_델리게이트_예외_현대C샤프.md)에서 정식으로 배웁니다. 지금은 "발행자가 구독자의 메서드를 리스너 목록에 등록해 두었다가 일이 생기면 호출한다(C++의 콜백/옵저버 등록)"는 정도로 읽고, 핵심인 "등록 = 발행자가 구독자 참조를 붙든다"만 가져가세요. 타이머로 주기 작업을 만드는 방법은 [제6부](06_제6부_비동기와_시간흐름.md)에서 다룹니다.

**핵심 설명**
- C#에는 C++식 메모리 누수는 없지만, **"잊혀진 참조 때문에 쓰지 않는 객체가 계속 살아 있는" 누수**는 생긴다(C# 12 in a Nutshell).
- 이벤트 핸들러는 대상(구독자) 객체에 대한 참조를 붙든다(대상이 static 메서드면 제외). 이벤트를 가진 쪽(발행자)이 구독자보다 오래 살면 구독자는 회수되지 못한다(C# 12 in a Nutshell, High-Performance Programming in C# and .NET).
- 이벤트가 발생하지 않거나 핸들러가 별로 하는 일이 없으면 눈에 띄지 않아서 발견이 늦다(C# 12 in a Nutshell).
- **해결책(High-Performance Programming in C# and .NET이 정리한 3가지)**: (1) 익명 메서드로 구독(C# 7.0부터는 로컬 메서드도) (2) 다 쓰면 `-=`로 **구독 해제** (3) 약한 참조 핸들러(weak-handler) 패턴. 입문자는 (2)를 습관으로 삼는다. C# 12 in a Nutshell은 `Dispose`에서 구독을 해제하는 방식을 예로 든다.
- **타이머도 비슷하다(C# 12 in a Nutshell)**: `System.Timers.Timer`는 런타임이 활성 타이머를 붙들고 있어서, 타이머가 그 핸들러를 통해 붙든 객체(예: `Foo`)도 회수되지 못한다. `Timer`가 `IDisposable`이므로 `Dispose`하면 타이머가 멈추고 런타임의 참조도 사라진다.

> 🔧 보충(책 외): 위 (1)에서 익명 메서드나 람다가 바깥의 `this`나 필드를 사용하면 그 객체를 캡처해 참조를 붙들 수 있습니다. 또 `-=`로 해제하려면 같은 메서드를 가리켜야 하므로, 람다로 구독했다면 나중에 해제할 수 있게 변수에 담아 두어야 합니다. 이 주의점은 책의 설명이 아니라 필자의 보충입니다.

```csharp
// 설명용 최소 Player (using System; 필요)
class Player
{
    public event Action<long> GoldChanged;
}

class GoldAuditLogger : IDisposable
{
    private readonly Player _player;

    public GoldAuditLogger(Player player)
    {
        _player = player;
        _player.GoldChanged += OnGoldChanged;   // 구독
    }

    private void OnGoldChanged(long gold) { /* 감사 로그 기록 */ }

    public void Dispose()
    {
        _player.GoldChanged -= OnGoldChanged;   // 해제 (안 하면 GoldAuditLogger가 계속 살아남음)
    }
}
```

> 🔧 보충(책 외): **게임 서버에서는** 메모리에 오래 캐시해 둔 `Player` 같은 객체(싱글톤이나 static 컬렉션)의 이벤트를 요청마다 구독만 하고 해제하지 않으면, 요청이 쌓일수록 죽은 핸들러 객체가 누적되고 이벤트도 여러 번 실행됩니다. 서버는 재시작 없이 오래 실행되므로 이런 누수가 치명적입니다. 같은 이유로 static 컬렉션 캐시가 무한히 커지지 않도록 크기나 만료 기준을 두어야 합니다. "구독한 곳과 해제하는 곳은 짝"이라고 외워 두세요.

---

## 실무 적용

### 체크리스트

이 부의 체크리스트(원문 부록):

- [ ] 요청 처리 경로/반복 틱 코드 안에서 `new`를 쓰는 곳이 있는가? → 재사용 또는 풀링
- [ ] `+=`로 문자열을 반복해서 이어 붙이는가? → `StringBuilder`, 불필요한 문자열 생성 제거
- [ ] `object`, `ArrayList`, `string.Format`으로 숫자를 넘기고 있는가? → 박싱 확인
- [ ] 이벤트를 `+=` 했으면 `-=` 하는 곳이 있는가?
- [ ] `IDisposable`(파일, 타이머, DB 연결 등)을 `using`/`Dispose`로 정리하는가?
- [ ] 최적화 전에 실제로 측정했는가?

코어별로 덧붙이는 확인 항목:

- [ ] (코어 2) `GC.Collect()`를 호출하는 코드가 있는가? → 대체로 GC가 시점을 정하게 둔다
- [ ] (코어 2·3) 요청마다 85,000바이트 안팎을 넘는 큰 배열을 새로 만드는가? → LOH·Gen2 압박, `ArrayPool<T>` 후보
- [ ] (코어 3) 직접 만든 오브젝트 풀을 여러 요청이 공유하는가? → 스레드 안전 확인, 검증된 풀 우선
- [ ] (코어 3) 핫 경로에서 배열·컬렉션을 `IEnumerable<T>`로 감싸 `foreach`하는가?
- [ ] (코어 4) `IDisposable` 필드를 가진 클래스가 스스로 `IDisposable`을 구현하는가?
- [ ] (코어 4) static 컬렉션 캐시에 크기나 만료 기준이 있는가?

### 시나리오로 확인하기

1. **상황:** 보상 계산 API의 평균 응답은 5ms인데, 부하 테스트에서 일부 요청이 100ms 넘게 튄다. 코드를 보니 요청마다 `new List<Monster>()`와 전투 로그 문자열 `+=` 루프가 있다. C++ 서버였다면 "할당은 할당 시점에만 비용"이라 대수롭지 않게 넘겼을 코드다.
   **질문:** 왜 일부 요청만 튀며, 무엇부터 해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   C#에서 비용은 할당보다 **해제(수집)** 쪽에서 생긴다. 요청마다 만든 쓰레기가 쌓이면 GC가 자주 깨어나고, 수집 중에는 스레드가 멈출 수 있어 그 순간에 걸린 요청만 지연된다(p99 지연). 객체가 많을수록, 특히 살아남아 상위 세대로 가는 객체가 많을수록 수집 비용이 커진다. 대응: 리스트는 필드로 두고 `Clear()`로 재사용, 긴 로그는 `StringBuilder`, 큰 배열은 `ArrayPool<T>`. 단, 먼저 측정해 그 경로가 실제 핫 경로인지 확인한다. → 코어 2, 코어 3

   </details>

2. **상황:** 며칠째 재시작 없이 돈 서버의 메모리가 계속 오른다. 요청마다 `new GoldAuditLogger(cachedPlayer)`를 만들어 쓰고 버리는데, `cachedPlayer`는 static 캐시에 들어 있는 유저 객체다. 감사 로그도 요청이 쌓일수록 같은 골드 변경에 여러 번 찍힌다.
   **질문:** `delete` 누락도 없는데 무엇이 새는가?

   <details markdown="1"><summary>답 확인</summary>

   이벤트 핸들러는 구독자 객체를 붙든다. 발행자(`cachedPlayer`)가 static 캐시를 통해 루트에서 닿으므로, 거기 `+=`로 등록된 모든 `GoldAuditLogger`도 루트에서 닿아 회수되지 않는다. 핸들러가 누적되니 이벤트도 여러 번 실행된다. 해결: `Dispose`에서 `-=`로 해제하고 `using`으로 감싼다. 구독한 곳과 해제하는 곳은 짝. → 코어 2(루트), 코어 4

   </details>

3. **상황:** C++ 습관대로 "스코프만 벗어나면 정리된다"고 생각해 `var writer = new StreamWriter("save.json");`을 지역 변수로 쓰고 끝냈다. 같은 파일을 다시 열려 하니 "다른 프로세스가 사용 중" 오류가 난다.
   **질문:** 무엇이 잘못됐고, finalizer가 결국 닫아 주지 않나?

   <details markdown="1"><summary>답 확인</summary>

   C#에는 스코프 종료 시 자동 소멸자가 없다. GC는 메모리만 회수하며, 파일 핸들 같은 자원은 `using`(또는 `Dispose()` 호출)으로 명시해야 블록 끝에서 예외가 나도 닫힌다. finalizer 백업은 GC 이후 finalizer 스레드에서 비결정적으로 실행되므로 "언젠가"이지 "지금"이 아니다. → 코어 4

   </details>

4. **상황:** 동료가 "작은 값은 다 struct로 바꾸면 GC가 없어지니 빠르다"며 아이템 정보(이름, 설명, 스탯 10개)를 struct로 바꾸고, 이를 `IComparable` 인터페이스 변수와 `ArrayList`에 담아 정렬한다.
   **질문:** 무엇이 문제인가?

   <details markdown="1"><summary>답 확인</summary>

   struct 권고 조건(값 하나, 16바이트 미만, 불변, 박싱이 잦지 않음)을 어겼다. 크기가 커서 복사 비용이 크고, 인터페이스 변수와 `ArrayList`에 담을 때마다 박싱되어 오히려 힙 할당이 늘어난다. 기본은 class이고, 옛 컬렉션 대신 `List<T>`, 판단은 프로파일링으로. → 코어 1(박싱), 코어 3

   </details>

5. **상황:** 응답 직렬화를 위해 요청마다 200KB 바이트 배열을 `new byte[200_000]`으로 만든다. 메모리 그래프를 보면 Gen2 수집이 자주 일어난다.
   **질문:** 왜 Gen0이 아니라 Gen2가 문제이며, 대안은?

   <details markdown="1"><summary>답 확인</summary>

   기준(85,000 또는 80,000바이트)을 넘는 객체는 LOH에 들어가고 Gen2 수집 때만 정리된다. 큰 배열을 자주 새로 만들면 비싼 Gen2 수집을 부른다. `ArrayPool<byte>.Shared.Rent`/`Return`으로 재사용하되, 받은 배열이 요청보다 클 수 있음과 반납 후 사용 금지를 지킨다. → 코어 2, 코어 3

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
이 부: 메모리와 성능 — 한 문장: 힙 객체는 ( ? )가 나중에 치우며 그동안 ( ? ) → 쓰레기를 줄이고, 못 치우는 것은 직접 정리, 최적화는 ( ? ) 후
├─ 코어 1 메모리 배치
│   ├─ 1.1 스택: ( ? ) 이 쌓임 → 메서드 종료 시 ( ? )
│   │      힙: ( ? ) 로 만든 객체 → ( ? ) 가 회수
│   │      값 타입은 "( ? ) 자리"에 산다 / 참조 대입 = ( ? ) 복사 / 비용은 할당보다 ( ? ) 때
│   └─ 1.2 박싱 2단계: (1) ____ (2) ____ / 흔한 경우 3가지: ____, ____, ____ / 해결 ____
├─ 코어 2 GC
│   └─ 2.1 루트: ____, ____, ____
│          세대: Gen0 → ( ? ) → Gen2 / GC 시간 ∝ ( ? ) 객체 수 / Gen0 ( ? )ms 미만, 전체 최대 ( ? )ms
│          LOH: 기준 ( ? ) 바이트, ( ? ) 수집 때만 정리
│          원칙: "Gen0에서 ( ? ) 아니면 Gen2에서 ( ? )" / GC.Collect()는 ( ? )
├─ 코어 3 할당 줄이기
│   ├─ 3.1 문자열 불변 → += 는 ( ? ) / 많이 붙이면 ( ? ), 두세 조각은 ( ? ) / 판단용은 ( ? )
│   ├─ 3.2 풀링 고려 3조건: ____, ____, ____ ("midlife crisis") / ArrayPool: Rent·Return 주의점 ( ? )
│   └─ 3.3 class 오버헤드 ( ? ) 바이트 vs struct / struct 조건 4가지: ____, ____, ____, ____
│          금지 컬렉션 예: ____ / 대안 ____ / foreach: 배열 그대로 = ( ? ), IEnumerable로 감싸면 = ( ? )
└─ 코어 4 GC가 못 하는 정리
    ├─ 4.1 Dispose 관례 3규칙: ____, ____, ____ / using = ( ? ) / finalizer 백업 패턴의 단점 ( ? )
    └─ 4.2 이벤트 누수: 발행자가 ( ? ) 보다 오래 살면 / 해결 3가지 ____ / 타이머도 ( ? )
```

### 2. 인출 질문

1. 값 타입 변수는 어디에 저장되나요? "값 타입은 항상 스택"이 틀린 이유는?

   <details markdown="1"><summary>답 확인</summary>

   값 타입은 "선언된 그 자리"에 산다. 지역 변수면 스택이지만, 클래스의 필드나 배열 원소라면 그 객체와 함께 힙에 있다. → 코어 1 (1.1)

   </details>

2. `Monster same = m; same.Hp = 50;` 후 `m.Hp`가 50이 되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   참조 타입 변수는 주소만 담기 때문에 대입하면 데이터가 아니라 주소만 복사된다. `m`과 `same`은 힙의 같은 객체를 가리킨다. → 코어 1 (1.1)

   </details>

3. 박싱은 어떤 두 단계로 이루어지며, 암시적으로 일어나는 흔한 경우 세 가지는?

   <details markdown="1"><summary>답 확인</summary>

   (1) 힙에 상자 객체 할당 (2) 값을 그 안에 복사. 흔한 경우: 값 타입을 `object` 매개변수에 넘길 때(`string.Format` 등), struct를 자신이 구현한 인터페이스 타입으로 넘길 때, `ArrayList` 같은 비제네릭 컬렉션에 넣을 때. 해결은 제네릭 컬렉션과 제네릭 메서드(`where T : IFoo`). → 코어 1 (1.2)

   </details>

4. GC가 "살아 있다"고 판단하는 기준(루트)은 무엇이고, 서로 순환 참조하는 두 객체는 어떻게 되나요?

   <details markdown="1"><summary>답 확인</summary>

   실행 중인 메서드의 지역 변수·매개변수, static 변수, finalization 대기 큐의 객체에서 따라갈 수 있는 객체만 산 객체다. 루트에서 닿지 않으면 서로 순환 참조해도 쓰레기다. → 코어 2 (2.1)

   </details>

5. 세대(Gen0/1/2) 구조를 쓰는 이유와, GC 시간이 무엇에 비례하는지 설명하세요.

   <details markdown="1"><summary>답 확인</summary>

   많은 객체는 빨리 버려지고 일부만 오래 산다는 점을 이용해 젊은 세대를 자주, Gen2를 드물게 청소한다. GC 시간은 할당한 객체 수가 아니라 수집 대상 세대에서 살아 있는 객체 수에 거의 비례한다. → 코어 2 (2.1)

   </details>

6. "Gen0에서 죽거나, 아니면 오래 살아 Gen2에 머물게 하라"는 원칙과 풀링 조건의 "midlife crisis"는 어떻게 연결되나요?

   <details markdown="1"><summary>답 확인</summary>

   짧게 쓰고 버리든지 오래 붙들고 재사용하든지 둘 중 하나가 좋다. 수명이 짧지만 Gen1/Gen2로 승격될 만큼은 긴 객체가 최악(midlife crisis)이며, 풀링으로 수명을 늘려 재사용하면 해결된다. → 코어 2 (2.1), 코어 3 (3.2)

   </details>

7. LOH란 무엇이며 언제 정리되나요? 기준값은?

   <details markdown="1"><summary>답 확인</summary>

   기준 크기를 넘는 큰 객체가 들어가는 별도 힙으로, Gen2 수집 때만 정리된다. C# 12 in a Nutshell은 85,000바이트, High-Performance Programming 책은 80,000바이트로 적는다. 요점은 "큰 배열을 자주 새로 만들지 말라". → 코어 2 (2.1)

   </details>

8. `GC.Collect()`로 강제 수집하는 것을 권하지 않는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   Gen0 객체를 불필요하게 상위 세대로 올리고 GC의 자체 조절을 방해할 수 있기 때문이다. 대체로 GC가 시점을 정하게 두는 편이 성능이 좋다(오래 잠들어 있는 서비스 같은 예외는 있다). → 코어 2 (2.1)

   </details>

9. 문자열 `+=`를 반복문에서 쓰면 왜 나쁜가요? 반대로 그냥 `+`가 나은 경우는?

   <details markdown="1"><summary>답 확인</summary>

   `string`은 불변이라 `+=`마다 새 문자열을 만들고 옛것은 쓰레기가 된다(벤치마크: `+=` 약 21.22KB vs `StringBuilder` 약 3.13KB). 두세 조각만 붙일 때는 `string.Concat`이 직접 채우므로 `+`가 낫다. → 코어 3 (3.1)

   </details>

10. 오브젝트 풀링을 고려할 세 가지 조건과, 풀링이 필요 없을 수 있는 객체는?

    <details markdown="1"><summary>답 확인</summary>

    (1) 핫 경로에서 할당되는 객체 (2) 초기화 비용이 큰 객체 (3) 수명이 짧지만 Gen1/Gen2로 승격될 만큼은 긴 객체. 만들자마자 곧바로 버리는 객체는 Gen0에서 빨리 치워지므로 굳이 풀링하지 않아도 될 수 있다. → 코어 3 (3.2)

    </details>

11. `ArrayPool<T>.Shared.Rent(100)`의 결과 배열 길이에 대해 무엇을 가정해야 하고, 반납 후 주의점은?

    <details markdown="1"><summary>답 확인</summary>

    크기별 버킷으로 관리되므로 요청보다 큰 배열이 올 수 있다(작은 배열은 오지 않는다). 반납한 뒤 계속 쓰면 자신의 코드뿐 아니라 같은 풀을 쓰는 다른 API도 망가뜨릴 수 있다. 또 직접 만든 풀은 스레드 안전하게 만들기 어려워 검증된 풀을 우선 쓴다. → 코어 3 (3.2)

    </details>

12. GC가 있는데도 `Dispose`가 필요한 이유와 `Dispose` 관례 규칙 세 가지는?

    <details markdown="1"><summary>답 확인</summary>

    GC는 메모리만 회수하고 파일·잠금·OS 핸들 같은 자원은 프로그래머가 명시적으로 정리해야 한다. 규칙: (1) Dispose된 객체는 되살릴 수 없다 (2) 여러 번 불러도 오류가 없어야 한다 (3) 소유한 다른 disposable도 Dispose한다. `using`은 예외가 나도 Dispose를 호출한다. → 코어 4 (4.1)

    </details>

13. finalizer 기반 백업 패턴(`Dispose(bool)` + `GC.SuppressFinalize`)의 장단점은?

    <details markdown="1"><summary>답 확인</summary>

    Dispose를 잊은 사용자에 대한 백업이 되지만, 메모리 해제와 자원 해제를 묶고 finalization 스레드 부담을 늘린다. finalizer가 있는 객체는 finalizer 스레드 처리 후 다음 수집에서야 회수된다. sealed 클래스는 단순 `Dispose()`만으로 충분하다. → 코어 4 (4.1)

    </details>

14. 이벤트 구독이 메모리 누수를 만드는 원리와 해결책 세 가지는?

    <details markdown="1"><summary>답 확인</summary>

    이벤트 핸들러는 구독자 객체에 대한 참조를 붙들므로, 발행자가 구독자보다 오래 살면 구독자가 회수되지 못한다. 해결: (1) 익명/로컬 메서드로 구독 (2) 다 쓰면 `-=`로 해제 (3) 약한 참조 핸들러 패턴. 입문자는 (2), 특히 `Dispose`에서 해제를 습관으로. → 코어 4 (4.2)

    </details>

15. `System.Timers.Timer`가 누수를 일으키는 이유와 해결법은?

    <details markdown="1"><summary>답 확인</summary>

    런타임이 활성 타이머를 붙들고 있어서, 타이머가 핸들러를 통해 붙든 객체도 회수되지 못한다. `Timer`는 `IDisposable`이므로 `Dispose`하면 타이머가 멈추고 런타임의 참조도 사라진다. → 코어 4 (4.2)

    </details>

16. 데이터 16바이트짜리 100만 개를 class 배열과 struct 배열로 만들면 크기가 어떻게 다르며 왜 그런가요?

    <details markdown="1"><summary>답 확인</summary>

    class 배열은 참조 + 객체마다 고정 오버헤드(64비트에서 16바이트) 때문에 40MB 이상, struct 배열은 필드 크기 합만 차지해 16MB다. struct 배열은 값이 연속으로 놓여 CPU 캐시에도 유리하다. → 코어 3 (3.3)

    </details>

17. struct를 고려할 때의 네 가지 조건(Microsoft 권고)은? Writing High-Performance .NET Code의 다른 관점은?

    <details markdown="1"><summary>답 확인</summary>

    (1) 논리적으로 값 하나 (2) 16바이트 미만 (3) 불변 (4) 박싱·언박싱이 잦지 않음. 기본은 class. Writing High-Performance .NET Code는 정확한 크기 숫자에 집착하지 말고 작게, 가능하면 불변으로 하되 프로파일링해 판단하라고 한다. → 코어 3 (3.3)

    </details>

18. 같은 배열을 `IEnumerable<int>`로 바꿔 `foreach`하면 무엇이 추가로 생기나요?

    <details markdown="1"><summary>답 확인</summary>

    배열을 그대로 `foreach`하면 `for`처럼 컴파일되지만, `IEnumerable<int>`로 감싸면 가상 메서드 호출 4번, try-finally, 열거자 변수의 메모리 할당이 생긴다. 교훈: 추상화를 씌우면 단순한 최적화가 사라진다. → 코어 3 (3.3)

    </details>

19. C++의 소멸자와 C#의 finalizer, 그리고 RAII와 `using`은 각각 어떻게 대응하나요?

    <details markdown="1"><summary>답 확인</summary>

    finalizer는 문법만 소멸자와 같을 뿐, GC 이후 finalizer 스레드에서 비결정적으로 호출되는 백업 수단이다. C++ RAII에 해당하는 것은 `IDisposable` + `using`이며, `using`을 명시해야만 블록 끝(예외 포함)에서 `Dispose()`가 호출된다. → 코어 4 (4.1)

    </details>

### 3. 기억 고리

- **C++ 유추:** `new`/`delete` + 스마트 포인터 → `new` + GC. 같은 점은 힙에 만들고 참조로 다룬다는 것. ⚠️ 깨지는 곳: `delete`가 없고 회수 시점이 비결정적이며, 수집 중 스레드가 멈출 수 있다. 참조 카운트가 아니라 루트 추적이라 순환 참조도 회수된다.
- **C++ 유추:** RAII → `IDisposable` + `using`. ⚠️ 깨지는 곳: `using`을 써야만 동작하고, finalizer(`~T()`)는 소멸자가 아니다.
- **C++ 유추:** 전역 리스너 목록에 넣고 안 뺀 `shared_ptr` → 이벤트 `+=` 후 `-=` 누락. ⚠️ 깨지는 곳: C#에서는 `+=` 한 줄이 눈에 안 띄게 참조를 만든다.
- **비유:** 스택 = 메서드가 끝나면 바로 치우는 작업대, 힙 = 청소부(GC)가 가끔 한꺼번에 치우는 창고. ⚠️ 비유가 깨지는 지점: 값 타입도 클래스 필드면 힙(창고)에 있고, 런타임은 공유되지 않음이 증명된 참조 타입을 스택에 둘 수도 있다. 청소 시점도 "정해진 시각 없이" 온다.
- **비유:** 이벤트 구독 = 발행자가 구독자의 손목을 잡고 있는 것. 손을 놓지(`-=`) 않으면 구독자는 떠날(회수될) 수 없다. ⚠️ 깨지는 지점: 대상이 static 메서드면 붙들 객체가 없고, 발행자가 먼저 죽으면 문제가 없다.
- **묶음(3의 법칙):** 쓰레기 줄이기 3도구 = 문자열(`StringBuilder`) · 재사용(풀/`Clear()`) · 값 타입(struct, 제네릭 컬렉션으로 박싱 회피). GC가 못 하는 정리 3가지 = 자원(`Dispose`) · 이벤트(`-=`) · 타이머(`Dispose`).
- **대칭·순서:** 박싱 ↔ 언박싱(할당 있음 ↔ 할당 없음), class ↔ struct(오버헤드·힙 ↔ 필드 합·제자리), 배열 `foreach` ↔ `IEnumerable` `foreach`. 흐름: 할당 → Gen0 → (생존) Gen1 → Gen2 → 수집 중 일시 정지 → 응답 지연.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "왜 요청마다 `new`를 많이 하면 게임 서버의 p99 응답이 튈 수 있는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "C#에는 `delete`도 소멸자 호출 시점도 없는데, 소켓·파일은 어떻게 제때 닫고 메모리 누수는 어디서 생기는가"를 RAII·`shared_ptr`에 빗대어 설명하고, 유추가 깨지는 지점(finalizer ≠ 소멸자, `using` 명시 필요, 이벤트 참조)을 반드시 짚으세요.
- **랜덤 논리 게임:** A "작은 데이터는 struct로 만들어야 한다" vs B "기본은 class이고 struct는 조건이 맞을 때만" — 양쪽을 번갈아 변호해 보세요(박싱, 16바이트, 불변, 프로파일링을 근거로).
- **AI 역할 반전:** "내가 .NET GC의 세대와 루트, LOH를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습 골격 채우기
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제4부. 함수형 도구·예외·현대 C#

> **🎮 게임 서버 개발자에게** — 델리게이트는 `std::function`, 이벤트는 옵저버/시그널-슬롯, 람다는 C++ 람다, `using`은 RAII 스코프 정리, `int?`는 `std::optional<int>`에 대응한다. 결정적으로 다른 점은 이것들이 **GC 위에서** 돈다는 것이다. 람다는 변수 자체를 캡처해 그 수명을 늘리고(댕글링 대신 누수 위험), 델리게이트 하나에 여러 메서드가 쌓이며(멀티캐스트), 소멸자가 스코프 끝에서 자동 호출되지 않으므로 `using`을 직접 써야 정리된다. 예외에는 `noexcept`가 없고 대신 `finally`가 있다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 서버를 오래 띄워 두면 메모리가 계속 오른다 — 이벤트 구독을 해제하지 않은 객체가 붙잡혀 있다.
> - 슬롯별 보상 처리 콜백을 루프로 등록했더니 전부 마지막 슬롯만 처리한다 — 반복 변수 캡처.
> - 요청 본문이 깨진 JSON일 때 서버 프로세스가 죽지 않고 "잘못된 요청"을 돌려줘야 한다. 그런데 로그의 스택 트레이스가 엉뚱한 줄을 가리킨다 — `throw ex;`.

## 코어 — 이것만은 100%

> **한 문장:** 델리게이트·Func/Action·람다로 동작을 값처럼 넘기고 이벤트로 변화를 안전하게 알리며, try/catch/finally·using·TryXXX로 실패해도 서버가 계속 동작하게 하고, 이터레이터·nullable·확장 메서드·튜플·record·패턴 매칭으로 짧고 안전하게 쓴다.

1. **동작을 값으로(델리게이트 → 이벤트)** — 델리게이트는 "이 모양의 메서드"를 담는 객체이고, `Func`(반환 있음)/`Action`(void)으로 대부분 대체된다. `+=`로 여러 개를 쌓을 수 있고(멀티캐스트), `event`는 바깥에서 `+=`/`-=`만 허용하는 제한된 델리게이트다.
2. **람다와 클로저** — 람다가 캡처한 바깥 변수는 "호출할 때"의 값으로 읽히고 델리게이트가 사는 동안 수명이 늘어난다(for 반복 변수 함정, 캡처 할당).
3. **실패 처리** — 구체적인 catch부터, `finally`는 return해도 실행, `using`은 `try/finally { Dispose(); }`. 다시 던질 땐 `throw;`. 흔히 실패하는 작업은 bool + out의 TryXXX.
4. **필요할 때 만드는 시퀀스** — `foreach`는 `MoveNext`/`Current` 커서의 소비자, `yield return` 이터레이터는 생산자이며 실제로 순회할 때 실행된다(지연 실행). 컬렉션 식 `[ ]`로 짧게 채운다.
5. **현대 C# 데이터 문법** — `int?`(`Nullable<T>`)·`string?`(컴파일러 경고)으로 "없음"을 타입에 드러내고, 확장 메서드·튜플·record(구조적 동등성 + `with` 비파괴 변경)·패턴 매칭(`is`·switch 식에서 모양으로 분기)·특성(`[라벨]`)으로 짧고 안전하게 쓴다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 함수 포인터, `std::function` | 델리게이트, `Func`/`Action` | 시그니처가 맞는 호출 가능한 것을 담아 나중에 호출(콜백) | 델리게이트는 **멀티캐스트**(`+=`로 여러 메서드를 쌓아 한 번에 호출)가 기본 기능이다. C++에는 대응물이 없다. 또 불변이라 `+=`는 새 델리게이트를 만든다. 인스턴스 메서드를 담으면 그 객체를 GC가 살려 둔다 |
| 옵저버 패턴, 시그널-슬롯 | `event` | 방송자와 구독자를 분리, 구독/해제 | 언어 키워드로 "바깥에서는 `+=`/`-=`만" 강제된다. 구독자가 사라져도 자동 해제되지 않으므로 `-=`를 안 하면 구독자가 계속 살아남는다. 같은 프로세스 안에서만 동작 |
| 람다 캡처 `[&]` / `[=]` | 람다 클로저 | 바깥 지역 변수를 람다 안에서 사용 | C#은 값/참조 캡처를 고를 수 없고 **변수 자체**를 캡처한다(참조 캡처와 비슷). 대신 캡처된 변수의 수명이 델리게이트만큼 늘어나 댕글링이 생기지 않는다. 값 복사를 원하면 지역 변수에 복사해서 캡처한다 |
| `try`/`catch`/`throw;`, `noexcept` | `try`/`catch`/`finally`, `throw;` | 호출 스택을 거슬러 올라가며 처리할 곳을 찾고, catch 안 `throw;`는 같은 예외를 다시 던진다 | `noexcept`·예외 명세가 없다. `finally`가 있고, `catch (X) when (조건)` 필터가 있다. `throw ex;`는 스택 정보를 잃는다. 던지는 것은 모두 `System.Exception` 계열이다 |
| RAII, 스코프 끝 소멸자 | `using` / `using var`, `IDisposable` | 블록이 끝나면(예외로 빠져나가도) 자원 정리가 보장된다 | **명시해야 동작한다.** `using` 없이 만든 객체는 스코프를 벗어나도 `Dispose`가 불리지 않는다. GC/finalizer의 정리 시점은 비결정적이라 소멸자를 대신하지 못한다 |
| `std::optional<int>` | `int?`(`Nullable<T>`) | `HasValue`/`Value`, 값이 없을 때 `Value` 접근은 예외 | 산술 연산이 null을 전파하고(`null + 1` → null), `<`/`>` 비교는 false가 된다. `string?` 같은 nullable 참조 타입은 런타임 타입이 아니라 컴파일러 경고일 뿐이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. 델리게이트 필드에 `event` 키워드를 붙이면 바깥 코드가 할 수 없게 되는 일은 무엇일까?
> 2. for 루프에서 `i`를 캡처한 람다 3개를 나중에 실행하면 왜 `0 1 2`가 아니라 `3 3 3`이 나올까?
> 3. catch 안에서 `throw;`와 `throw ex;`는 무엇이 다를까?
> 4. `yield return`을 쓴 메서드를 호출만 하고 순회하지 않으면 안의 코드는 실행될까?
> 5. record 두 개의 내용이 같으면 `==`는 true일까, false일까? class라면?
>
> **처리법:** 🛠 실습 `Wallet.GoldChanged` 이벤트, for 루프 캡처 버그 재현, try/catch/finally + `using var`, `TryBuyUpgrade`, `WaveHp` 이터레이터, record `with`, 프로퍼티 패턴 switch → 읽자마자 직접 실행 · 🗺 관계도 델리게이트 → Func/Action → 멀티캐스트 → 이벤트 → 람다·클로저 / 예외 → finally → using → TryXXX / 이터레이터 ↔ foreach ↔ LINQ / 튜플 ↔ record ↔ 패턴 매칭 · 📦 카드로 표준 예외 타입 목록(`ArgumentException`, `InvalidOperationException` 등), 표준 이벤트 패턴 3요소, 패턴 종류(타입·상수·관계·조합자·튜플·프로퍼티·리스트), 버전별 기능(C# 9 static 람다, C# 11 리스트 패턴, C# 12 컬렉션 식)

**학습 목표**
1. 메서드를 "값"처럼 넘기는 델리게이트·람다·이벤트로 "골드가 바뀌면 관련 후속 처리가 알아서 실행되는" 서버 내부 알림 구조를 만들 수 있다.
2. try/catch/finally, using, TryXXX 패턴으로 잘못된 요청 본문·DB 데이터 오류 같은 실패 상황에서도 서버가 죽지 않고 오류 응답을 돌려주게 처리할 수 있다.
3. 이터레이터, nullable, 확장 메서드, 튜플, record, 패턴 매칭, 특성 등 현대 C#의 편의 문법을 읽고 쓸 수 있다.

---

## 코어 1. 동작을 값으로 — 델리게이트, Func/Action, 멀티캐스트, 이벤트

> 이 코어의 질문: "골드가 바뀌면 로그·업적·랭킹 처리가 알아서 실행되게 하려면?" 메서드를 담는 객체(델리게이트, 1.1)를 미리 만들어진 `Func`/`Action`(1.2)으로 쓰고, 여러 개를 쌓아(멀티캐스트, 1.3) 바깥에서는 구독만 하도록 제한하면 이벤트(1.4)가 되며, .NET 관례 형식이 표준 이벤트 패턴(1.5)이다.

### 1.1 델리게이트란?

**한 줄 요약:** 델리게이트는 "이 모양의 메서드를 대신 호출해 주는 객체"다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Delegates" (텍스트 L12077-12235)

- 델리게이트 타입은 반환형과 매개변수 목록만 정한다. 그 모양이 맞는 메서드라면 무엇이든 담을 수 있다.
- 호출하는 쪽과 실제 메서드가 분리(decoupling)된다. 콜백(callback)과 같은 개념이다.
- 메서드를 인자로 받는 메서드를 "고차 함수"라고 한다. 실행할 동작을 나중에 끼워 넣는 "플러그인 메서드"를 만들 수 있다.
- 대상 메서드는 지역/static/인스턴스 메서드 모두 가능하다. 인스턴스 메서드를 담으면 델리게이트가 그 객체도 함께 붙잡는다(객체의 수명이 늘어남).

```csharp
DamageFormula f = Normal;                        // 메서드를 변수에 담기
Console.WriteLine(f(5));                         // 50
f = Crit;                                        // 동작 교체
Console.WriteLine(f(5));                         // 125

long Normal(int level) => level * 10;
long Crit(int level)   => level * 25;

delegate long DamageFormula(int level);          // 델리게이트 타입 선언 (최상위 문장 뒤에 둔다)
```

**방치형 RPG 서버에서는** "일반 공격/치명타/스킬"처럼 계산식만 다른 동작을 델리게이트 하나로 갈아 끼울 수 있다.

### 1.2 Func와 Action

**한 줄 요약:** 델리게이트 타입을 매번 선언하지 말고 미리 만들어진 `Func`(값 반환)와 `Action`(반환 없음)을 쓰자.

> 📖 출처: C# 12 in a Nutshell Ch4 "The Func and Action Delegates" (텍스트 L12490-12525), "Generic Delegate Types" (L12437-12489)

- `Func<입력들..., 반환형>`: 마지막 타입 인자가 반환형. `Func<int,long>`은 int를 받아 long을 돌려준다.
- `Action<입력들...>`: 반환값이 없다(void).
- 제네릭 델리게이트라 어떤 반환형·매개변수 타입에도 쓸 수 있다(매개변수는 최대 16개). 이 둘로 다루지 못하는 경우는 `ref`/`out`/포인터 매개변수뿐이다.
- 제네릭이 없던 시절에 만들어진 .NET 라이브러리는 아직도 직접 선언한 델리게이트 타입을 많이 쓴다(역사적 이유).

```csharp
Func<int, long> damage = level => level * 10L;   // 값을 돌려줌
Action<string> log = msg => Console.WriteLine(msg); // 돌려주는 값 없음
log($"피해량: {damage(3)}");
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 `Action`은 "끝났을 때 실행할 것"(보상 지급 후 로그 기록 등), `Func`은 "서버가 계산하는 규칙"(업그레이드 비용 공식)을 넘길 때 쓴다.

### 1.3 멀티캐스트 델리게이트

**한 줄 요약:** 델리게이트 하나에 메서드를 `+=`로 여러 개 쌓아 두면 한 번 호출로 모두 실행된다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Multicast Delegates" (텍스트 L12319-12436)

- `+=`로 추가, `-=`로 제거. 추가한 순서대로 호출된다.
- `null` 델리게이트에 `+=`를 해도 정상 동작한다(새로 대입한 것과 같음).
- 델리게이트는 불변이라 `+=`는 사실 새 델리게이트를 만들어 다시 대입하는 것이다.
- 반환값이 있는 멀티캐스트는 마지막에 실행된 메서드의 반환값만 돌려받는다(앞의 메서드도 실행은 되지만 반환값은 버려진다). 그래서 보통 void로 쓴다.

```csharp
Action<long> onGoldChanged = g => Console.WriteLine($"변동 로그 기록: {g}");
onGoldChanged += g => Console.WriteLine($"업적 검사: {g}");
onGoldChanged(1000);   // 두 동작이 차례로 실행
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 "골드가 오르면 변동 로그 기록 + 업적 검사 + 랭킹 집계 대기열 등록"처럼 한 사건에 여러 서버 내부 반응을 붙이는 데 멀티캐스트가 자연스럽게 맞는다는 점을 연결한 설명이다.

> 🔧 보충(책 외): C++의 `std::function`은 호출 대상을 하나만 담는다. 여러 콜백을 부르려면 `std::vector<std::function<...>>`을 직접 관리해야 하는데, C# 델리게이트는 이 목록 관리(`+=`/`-=`, 순서대로 호출)가 델리게이트 자체에 들어 있다.

### 1.4 이벤트(event)란?

**한 줄 요약:** 이벤트는 "방송하는 쪽(broadcaster)"과 "구독하는 쪽(subscriber)"을 안전하게 연결하는, 제한된 델리게이트다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Events" (텍스트 L12793-12957)

- 방송자는 언제 알릴지 결정한다. 구독자는 `+=`/`-=`로 듣기 시작/중단만 한다. 구독자끼리는 서로 모른다.
- `event` 키워드를 붙이면 바깥 코드는 `+=`와 `-=`만 가능하다. 다음 짓을 막아 준다.
  - 다른 구독자를 `=`로 덮어쓰기
  - `null`로 전부 지우기
  - 바깥에서 마음대로 호출(방송)하기
- 값이 실제로 바뀔 때만 이벤트를 쏘는 패턴이 흔하다(`if (gold == value) return;`).

```csharp
var wallet = new Wallet();
wallet.GoldChanged += g => Console.WriteLine($"골드 변동 기록: {g}");
wallet.Gold = 500;                           // 골드 변동 기록: 500

public class Wallet
{
    long gold;
    public event Action<long> GoldChanged;   // 이벤트 선언

    public long Gold
    {
        get => gold;
        set
        {
            if (gold == value) return;       // 변화 없으면 알리지 않음
            gold = value;
            GoldChanged?.Invoke(gold);       // 구독자가 있으면 알림
        }
    }
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 보상 계산 로직은 `Gold`만 올리고, 변동 로그 기록·업적 검사 같은 후속 처리는 `GoldChanged`를 구독해서 각자 수행한다(서버 내부 도메인 이벤트). 계산 로직이 후속 처리를 몰라도 되어 코드가 깔끔해진다. 다만 이 이벤트는 프로세스 안에서만 동작하므로, 서버를 여러 대로 늘리면 DB나 메시지 큐 같은 별도 수단이 필요하다.

### 1.5 표준 이벤트 패턴

**한 줄 요약:** .NET 라이브러리 관례는 `EventArgs` 상속 클래스 + `EventHandler<T>` + `OnXxx` 메서드 세 가지다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Standard Event Pattern" (텍스트 L12958-13262)

- 정보를 담는 클래스는 `EventArgs`를 상속하고, 담은 정보를 기준으로 이름을 짓는다.
- 델리게이트는 `(object sender, TEventArgs e)` 두 매개변수, 반환 void. 미리 만들어진 `EventHandler<TEventArgs>`를 쓰면 된다.
- 델리게이트 이름은 `EventHandler`로 끝나야 한다는 규칙도 있다.
- 이벤트를 쏘는 일은 `protected virtual void OnXxx(...)` 메서드에 모으고(이름은 이벤트 이름 앞에 `On`, 인자는 `EventArgs` 하나), 안에서 `Xxx?.Invoke(this, e)`로 호출한다. 책은 `?.Invoke`를 null 검사와 스레드 안전을 함께 챙기는, 이벤트 호출의 가장 좋은 일반적 방법이라고 설명한다.
- 추가 정보가 없으면 `EventHandler`와 `EventArgs.Empty`를 쓴다.

```csharp
public class GoldChangedEventArgs : EventArgs
{
    public readonly long OldGold;
    public readonly long NewGold;
    public GoldChangedEventArgs(long o, long n) { OldGold = o; NewGold = n; }
}

public class Wallet2
{
    long gold;
    public event EventHandler<GoldChangedEventArgs> GoldChanged;
    protected virtual void OnGoldChanged(GoldChangedEventArgs e)
        => GoldChanged?.Invoke(this, e);

    public void Add(long amount)
    {
        long old = gold;
        gold += amount;
        OnGoldChanged(new GoldChangedEventArgs(old, gold));
    }
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 이 형식을 지키면 "이전 값/새 값"을 함께 넘겨 재화 변동 로그(`+120`)나 이상 증가 탐지 같은 후속 처리를 만들기 쉽다. 간단한 서버에서는 `Action<long>` 이벤트로 줄여 써도 된다.

> 🔧 보충(책 외): 구독을 해제(`-=`)하지 않으면 구독자 객체가 계속 살아남아 메모리 누수로 이어질 수 있다. 책이 직접 다루는 내용은 아니며, 1.1의 "델리게이트가 대상 인스턴스를 붙잡는다"는 사실에서 이어지는 추론이다.

---

## 코어 2. 람다와 클로저 — 그 자리에서 쓰는 동작, 붙잡힌 변수

> 이 코어의 질문: "람다가 바깥 변수를 쓰면, 그 변수는 언제 읽히고 언제까지 살아 있는가?" 람다 문법(2.1), 변수 캡처의 의미와 함정(2.2), 지역 메서드와의 선택(2.3).

### 2.1 람다식

**한 줄 요약:** 람다는 이름 없는 메서드를 그 자리에서 `(매개변수) => 식` 으로 쓰는 문법이다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Lambda Expressions" (텍스트 L13367-13503)

- 형식: `(매개변수) => 식 또는 { 문장 블록 }`. 매개변수가 하나이고 타입이 추론되면 괄호를 생략할 수 있다.
- 주로 `Func`/`Action`에 대입한다. 매개변수 타입은 보통 추론된다.
- 매개변수가 없으면 `()`, 쓰지 않는 매개변수는 `_`로 버릴 수 있다(C# 9).
- C# 10부터 `var`로 받을 수 있고, C# 12부터 기본값 매개변수도 가능하다.

```csharp
Func<int, long> upgradeCost = lv => 100L * lv * lv;
Func<int, int, int> total = (a, b) => a + b;
Action heal = () => Console.WriteLine("회복!");
Console.WriteLine(upgradeCost(3));   // 900
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 "n초 뒤 실행"하는 콜백, 리스트 정렬/필터 조건(`x => x.Rarity > 3`), 요청 처리 후 실행할 후속 동작에 람다를 쓴다.

### 2.2 변수 캡처(클로저)

**한 줄 요약:** 람다는 바깥 변수를 붙잡아 쓸 수 있고, 값은 "만들 때"가 아니라 "호출할 때" 읽힌다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Capturing Outer Variables" (텍스트 L13504-13763)

- 람다가 바깥 지역변수/매개변수/필드를 쓰면 그것을 "캡처"했다고 하며, 이런 람다를 클로저라 부른다.
- 캡처된 변수는 델리게이트가 살아 있는 동안 수명이 늘어난다.
- 캡처된 값은 호출 시점의 값이다. 나중에 바깥에서 바꾸면 람다 결과도 바뀐다.
- 람다 안에서 만든 지역변수는 호출마다 새로 만들어진다.
- for 루프의 반복 변수를 캡처하면 모든 람다가 같은 변수를 공유해서 `012`가 아니라 `333`이 나온다. 루프 안에서 `int copy = i;`처럼 복사한 뒤 캡처하면 해결된다(foreach는 C# 5부터 문제없음).
- 캡처하면 내부적으로 숨은 클래스가 만들어져 작은 메모리 할당이 생긴다. 캡처를 막고 싶으면 `static` 람다(`static n => n * 2`)를 쓴다(C# 9).

```csharp
int bonus = 2;
Func<int, int> withBonus = dmg => dmg * bonus;
bonus = 10;
Console.WriteLine(withBonus(5));       // 50 (호출 시점의 bonus)

var skills = new Action[3];
for (int i = 0; i < 3; i++)
{
    int slot = i;                       // 반복 변수 복사
    skills[i] = () => Console.WriteLine($"스킬 {slot}");
}
foreach (var s in skills) s();          // 스킬 0, 1, 2
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 스킬 슬롯별 처리 동작을 루프로 만들 때 반복 변수를 복사하지 않으면 모든 동작이 마지막 슬롯을 처리하는 버그가 생긴다. 요청마다 자주 실행되는 코드에서는 캡처로 인한 할당도 신경 쓸 만하다.

> 🔧 보충(책 외): C++ 람다는 캡처 목록에서 값(`[=]`)과 참조(`[&]`)를 고르고, 참조로 캡처한 지역 변수가 스코프를 벗어나면 댕글링 참조가 된다. C# 람다는 고를 수 없이 **변수 자체**를 캡처한다. 동작은 참조 캡처와 비슷하지만(호출 시점의 값을 읽음), 캡처된 변수는 위에서 말한 숨은 클래스로 옮겨져 델리게이트가 살아 있는 동안 함께 살아남으므로 댕글링이 생기지 않는다. 값 캡처처럼 "그 순간의 값"을 고정하고 싶으면 위 예제처럼 지역 변수에 복사한 뒤 캡처한다.

### 2.3 람다 vs 지역 메서드 (참고)

**한 줄 요약:** 재귀·오버헤드는 지역 메서드, 델리게이트 매개변수에 넘길 때는 람다가 유리하다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Lambda Expressions Versus Local Methods" (텍스트 L13764-13787)

- 지역 메서드는 재귀가 쉽고, 델리게이트 타입을 안 써도 되고, 오버헤드가 조금 적다.
- 하지만 델리게이트 매개변수를 받는 메서드에 넘길 때는 람다가 더 간결하다.

---

## 코어 3. 실패 처리 — try/catch/finally, using, 예외 던지기, TryXXX

> 이 코어의 질문: "요청 하나가 실패해도 서버 프로세스는 살아서 오류 응답을 돌려주는가? 자원은 반드시 닫히는가?" 잡고 마무리하는 구조(3.1), RAII에 해당하는 자원 정리(3.2), 알리는 쪽의 규칙(3.3), 흔한 실패는 예외 없이(3.4).

### 3.1 try / catch / finally

**한 줄 요약:** `try`에서 오류가 나면 `catch`가 처리하고, `finally`는 성공/실패와 상관없이 마무리 작업을 한다.

> 📖 출처: C# 12 in a Nutshell Ch4 "try Statements and Exceptions", "The catch Clause", "The finally Block" (텍스트 L13837-14142)

- 예외를 처리하는 곳이 없으면 프로그램이 종료된다. 호출 스택을 거슬러 올라가며 처리할 곳을 찾는다.
- `catch`는 특정 예외 타입부터 쓰고, 더 넓은 `Exception`은 마지막에 둔다(위에서부터 검사, 하나만 실행).
- `catch (X ex) when (조건)`으로 조건이 맞을 때만 잡을 수 있다(예외 필터). 조건이 false면 그 catch는 무시되고 다음 catch를 검사한다.
- `Exception`을 통째로 잡는 것은 복구가 가능하거나, 로그 후 다시 던지거나, 최후의 방어선일 때만 한다.
- `finally`는 `return`으로 빠져나가도 실행된다. 무한 루프나 프로세스의 갑작스러운 종료만이 이를 막을 수 있다.
- 예외 처리는 비용이 크다(수백 클록 이상). 미리 확인 가능한 오류(0으로 나누기 등)는 `if`로 막는 편이 낫다.

```csharp
try
{
    string json = File.ReadAllText(dataPath);
    var data = ParsePlayerData(json);     // 파싱 실패 시 예외 발생 가능
}
catch (FileNotFoundException)
{
    Console.WriteLine("데이터 없음: 기본 데이터로 시작");
}
catch (Exception ex)
{
    Console.WriteLine($"데이터 손상: {ex.Message}");
    // 백업 데이터 사용 또는 기본 데이터로 시작
}
finally
{
    Console.WriteLine("로딩 시도 종료");
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 요청 본문이 깨졌거나 DB에서 읽은 데이터가 이상할 때 서버 프로세스가 죽지 않고, 오류를 로그로 남긴 뒤 적절한 오류 응답(예: 잘못된 요청)을 돌려주는 것이 try/catch의 핵심 용도다. `ParsePlayerData`, `dataPath`는 예제용 가상의 이름이다. 실제 JSON 파싱과 파일 읽기는 [제5부](05_제5부_NET_기본_라이브러리.md)에서 다룬다.

> 🔧 보충(책 외): C++과 비교하면 — C#에는 `noexcept`나 예외 명세가 없어 어떤 메서드든 예외를 던질 수 있다고 보고 코드를 짜야 한다. 대신 C++에 없는 `finally` 블록과 `when` 예외 필터가 있다. C++에서는 아무 타입이나 던질 수 있지만 C#에서 던지는 것은 `System.Exception` 계열 객체다.

### 3.2 using 문과 using 선언

**한 줄 요약:** `IDisposable` 객체(파일, 스트림 등)는 `using`으로 감싸면 끝날 때 자동으로 `Dispose`되어 정리된다.

> 📖 출처: C# 12 in a Nutshell Ch4 "The using statement", "using declarations" (텍스트 L14143-14211)

- `using`은 내부적으로 `try { ... } finally { Dispose(); }`와 같다.
- 중괄호를 생략한 `using var x = ...;` 형태(C# 8)는 그 변수가 속한 블록이 끝날 때 정리된다.

```csharp
using var reader = new StreamReader(dataPath);   // 블록 끝에서 자동 정리
string first = reader.ReadLine();
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 파일, DB 연결처럼 제한된 자원을 요청마다 열고 닫는 일이 많다. 닫는 것을 잊으면 자원이 고갈되어 서버가 느려지거나 멈출 수 있어, `using`이 안전장치가 된다.

> 🔧 보충(책 외): `using var`는 C++의 RAII(스코프를 벗어나면 소멸자가 자원 해제)와 거의 같은 효과를 낸다. 차이는 **명시해야만 동작한다**는 점이다. C#에서 `using` 없이 `new StreamReader(...)`만 하면 변수가 스코프를 벗어나도 `Dispose`가 호출되지 않고, GC나 finalizer가 언젠가 정리할 때까지 파일 핸들이 열려 있다. finalizer는 C++ 소멸자와 달리 호출 시점이 비결정적이므로 자원 정리를 맡기면 안 된다.

### 3.3 예외 던지기와 다시 던지기

**한 줄 요약:** 잘못된 인자/상태는 `throw new ...`로 알리고, 로그만 남길 때는 `throw;`로 다시 던진다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Throwing Exceptions", "Rethrowing an exception", "Key Properties of System.Exception", "Common Exception Types" (텍스트 L14212-14407)

- 자주 쓰는 예외: `ArgumentException`(잘못된 인자), `ArgumentNullException`, `ArgumentOutOfRangeException`(범위 밖), `InvalidOperationException`(객체 상태가 부적절), `NotSupportedException`, `NotImplementedException`, `ObjectDisposedException`.
- 인자 null 검사는 `ArgumentNullException.ThrowIfNull(x)`로 줄일 수 있다(.NET 6).
- `catch` 안에서 `throw;`로 다시 던지면 원래 스택 정보가 유지된다. `throw ex;`는 스택 정보가 사라지므로 피한다.
- 다른 예외로 감쌀 때는 원본을 `innerException`으로 넘긴다.
- 주요 속성: `Message`, `StackTrace`, `InnerException`.

```csharp
void Buy(int cost, long gold)
{
    if (cost < 0) throw new ArgumentOutOfRangeException(nameof(cost));
    if (gold < cost) throw new InvalidOperationException("골드 부족");
    // 구매 처리
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 "있을 수 없는 값(음수 비용)"은 예외로 버그를 빨리 드러내는 용도로 쓰고, "골드 부족" 같은 흔한 상황은 다음 3.4처럼 예외 없이 실패 응답으로 처리하는 편이 좋다. 클라이언트가 보낸 값은 조작될 수 있으므로 서버가 반드시 다시 검증한다. "흔한 상황은 예외 없이"라는 판단은 서버 맥락의 조언이며, 책은 "예외는 정상 흐름 밖의 오류에 쓴다"(3.4 참고)고 설명한다.

### 3.4 TryXXX 패턴

**한 줄 요약:** 실패가 예상되는 작업은 `bool`을 반환하고 결과는 `out`으로 주는 `TryXXX` 메서드로 만든다.

> 📖 출처: C# 12 in a Nutshell Ch4 "The TryXXX Method Pattern", "Alternatives to Exceptions" (텍스트 L14408-14456)

- 책은 오류가 정상 흐름 밖에 있거나 바로 호출한 쪽이 감당할 수 없으면 예외를 던지라고 한다. 경우에 따라서는 두 방식을 모두 제공하는 것이 최선이며, `int.Parse`(실패 시 예외)와 `int.TryParse`(false 반환, 결과는 `out`)가 대표적인 쌍이다.
- 오류 코드 반환 방식은 단순하고 예측 가능한 실패에는 통하지만, 드문 오류로 확장하면 메서드 시그니처가 지저분해진다. 연산자나 프로퍼티에는 적용할 수도 없다.

```csharp
long gold = 300;

if (!TryBuyUpgrade(ref gold, 500))
    Console.WriteLine("골드가 부족합니다");

bool TryBuyUpgrade(ref long gold, long cost)
{
    if (gold < cost) return false;   // 실패는 예외 대신 false
    gold -= cost;
    return true;
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 업그레이드 구매 요청 검증, 요청으로 들어온 문자열 파싱처럼 자주 실패할 수 있는 곳은 Try 패턴이 알맞다. 위 `TryBuyUpgrade`는 `out` 대신 `ref`로 골드를 갱신하는 변형 예시이며, 책의 예는 `TryParse`뿐이다.

---

## 코어 4. 필요할 때 만드는 시퀀스 — 열거, 컬렉션 식, 이터레이터

> 이 코어의 질문: "`foreach`는 무엇을 돌리고, `yield return` 메서드의 코드는 언제 실행되는가?" 소비자 쪽 커서(4.1), 컬렉션을 짧게 채우는 문법(4.2), 생산자 쪽 이터레이터와 지연 실행(4.3). LINQ가 이 원리 위에 있다.

### 4.1 열거(foreach의 정체)

**한 줄 요약:** `foreach`는 "다음 값으로 이동(`MoveNext`) + 현재 값(`Current`)"이라는 커서를 대신 돌려 주는 문법이다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Enumeration" (텍스트 L14457-14534)

- 열거자(enumerator)는 읽기 전용·앞으로만 가는 커서, 열거 가능 객체(enumerable)는 그런 커서를 만들어 주는 객체다(`IEnumerable<T>`).
- `GetEnumerator()`가 있거나 `IEnumerable<T>`를 구현한 타입이면 `foreach`로 돌 수 있다.

### 4.2 컬렉션 초기화와 컬렉션 식

**한 줄 요약:** 컬렉션을 만들면서 값을 채우는 짧은 문법이고, C# 12에서는 `[ ... ]`로 더 짧게 쓴다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Collection Initializers and Collection Expressions" (텍스트 L14535-14620)

- 초기화자: `new List<int> {1, 2, 3}` (컴파일러가 `Add`를 호출해 줌).
- 컬렉션 식(C# 12): `List<int> list = [1, 2, 3];`. 대입되는 타입(배열, `List` 등)에 맞춰 만들어진다.
- 딕셔너리는 `{ {5,"five"} }` 또는 인덱서 형태 `[3] = "three"`로 초기화한다.

```csharp
List<int> upgradeLevels = [1, 2, 3];
int[] rewards = [100, 500, 1000];
var itemNames = new Dictionary<int, string> { [1] = "나무검", [2] = "철검" };
```

**방치형 RPG 서버에서는** 초기 아이템 목록, 스테이지별 보상 테이블 같은 시작 데이터를 짧게 적을 때 쓴다.

### 4.3 이터레이터(yield)

**한 줄 요약:** `yield return`을 쓰면 값을 하나씩 "필요할 때" 만들어 내는 열거 가능 시퀀스를 쉽게 만들 수 있다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Iterators", "Iterator Semantics", "Composing Sequences" (텍스트 L14621-14881)

- `foreach`가 열거자의 소비자라면, 이터레이터는 생산자다. `yield return`마다 호출한 쪽으로 값을 하나 넘기고, 다시 부르면 그 자리부터 이어서 실행된다.
- 이터레이터 메서드를 호출하는 것만으로는 코드가 실행되지 않는다. `foreach` 등으로 실제로 순회할 때 실행된다(지연 실행).
- 중간에 끝내려면 `return` 대신 `yield break`를 쓴다.
- `catch`가 붙은 `try` 안에서는 `yield return`을 쓸 수 없고, `catch`/`finally` 블록 안에서도 쓸 수 없다. `finally`만 있는 `try` 안에서는 쓸 수 있다.
- 이터레이터끼리 이어 붙여 필터링할 수 있고, 각 요소는 마지막 순간에 계산된다. LINQ가 이 원리를 이용한다.

```csharp
IEnumerable<long> WaveHp(int waves)
{
    long hp = 100;
    for (int i = 0; i < waves; i++)
    {
        yield return hp;      // 하나 넘기고 여기서 잠시 멈춤
        hp *= 2;
    }
}

foreach (long hp in WaveHp(5))
    Console.Write(hp + " ");   // 100 200 400 800 1600
```

**방치형 RPG 서버에서는** "무한히 커지는 웨이브 체력" 같은 수열을 배열로 미리 다 만들지 않고 필요한 만큼만 뽑아 쓰는 데 유용하다.

> 🔧 보충(책 외): 지연 실행의 함정 — 이터레이터 메서드 맨 앞에 `if (waves < 0) throw new ArgumentOutOfRangeException(...)` 같은 인자 검사를 넣어도, 메서드를 호출하는 시점에는 실행되지 않고 처음 순회할 때 비로소 실행된다. 그래서 잘못된 인자 오류가 엉뚱한 곳(순회하는 코드)에서 터질 수 있다. 즉시 검사가 필요하면 검사하는 일반 메서드가 내부 이터레이터(지역 함수 등)를 반환하도록 나눈다. C++20 코루틴 제너레이터(`co_yield`)를 써 봤다면 같은 "멈췄다 이어 가는" 모델이다.

---

## 코어 5. 현대 C# 데이터 문법 — null, 확장, 튜플·record, 패턴, 특성

> 이 코어의 질문: "값이 '없음'을 어떻게 타입에 드러내고, 데이터 묶음을 어떻게 짧고 안전하게 만들고 분기하는가?" "없음"의 표현(5.1 `int?`, 5.2 `string?`), 기존 타입에 기능 붙이기(5.3), 값 묶음(5.4 튜플, 5.5 record), 모양으로 분기(5.6 패턴 매칭), 코드에 붙이는 라벨(5.7 특성).

### 5.1 Nullable 값 타입 (`int?`)

**한 줄 요약:** 값 타입 뒤에 `?`를 붙이면 "값이 없음(null)"을 표현할 수 있다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Nullable Value Types" ~ "Nullable Value Types and Null Operators" (텍스트 L14882-15165)

- `int i = null;`은 오류지만 `int? i = null;`은 된다. `T?`는 `Nullable<T>` 구조체이며 `HasValue`와 `Value`를 가진다.
- `HasValue`가 false일 때 `Value`를 읽으면 `InvalidOperationException`이 난다.
- `T`에서 `T?`로는 암시적 변환, 반대는 명시적 변환이다.
- 덧셈 등 대부분의 연산은 한쪽이 null이면 결과도 null, 비교(`<`, `>`)는 null이 끼면 false다. `==`는 null끼리 같다.
- `??`(기본값 지정)와 `?.`(null이면 건너뜀)와 잘 어울린다.
- "-1을 없음의 표시로 쓰는" 방식은 실수하기 쉽고 타입에 드러나지 않아 nullable이 더 안전하다.

```csharp
int? equippedWeaponId = null;              // 무기 미장착
int id = equippedWeaponId ?? 0;            // 없으면 0
Console.WriteLine(equippedWeaponId.HasValue); // False
equippedWeaponId = 7;
Console.WriteLine(equippedWeaponId.Value);    // 7
```

**방치형 RPG 서버에서는** "아직 장착 안 한 슬롯", "아직 도전 기록이 없는 최고 점수"처럼 값이 없을 수 있는 숫자에 `int?`가 알맞다.

### 5.2 Nullable 참조 타입 (`string?`)

**한 줄 요약:** 켜 두면 컴파일러가 "null일 수 있는데 그냥 쓰는 코드"에 경고를 띄워 준다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Nullable Reference Types", "The Null-Forgiving Operator" (텍스트 L15271-15417)

- 프로젝트 파일 `<Nullable>enable</Nullable>` 또는 `#nullable enable`로 켠다.
- 켜면 참조 타입은 기본적으로 null 불가이고, null을 허용하려면 `string?`처럼 `?`를 붙인다. 컴파일러 경고일 뿐 실행 시 타입 차이는 없다.
- `s!.Length`의 `!`(널 포기 연산자)는 경고를 끄는 것일 뿐이라 위험할 수 있다. 가능하면 `if (s != null)`로 검사한다.
- 컴파일러의 검사가 완벽하지는 않다(배열 요소가 채워졌는지는 모른다).

```csharp
#nullable enable
string name = "용사";
string? nickname = null;                   // null 가능 표시
if (nickname != null) Console.WriteLine(nickname.Length);
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 요청 본문(DTO)이나 DB 데이터의 "없을 수도 있는 필드"에 `?`를 붙여 NullReferenceException을 미리 잡는 데 도움이 된다.

### 5.3 확장 메서드

**한 줄 요약:** 기존 타입을 고치지 않고 마치 원래 있던 메서드처럼 새 메서드를 붙이는 문법이다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Extension Methods" (텍스트 L15418-15645)

- static 클래스의 static 메서드에서 첫 매개변수 앞에 `this`를 붙이면 된다.
- 컴파일하면 그냥 static 메서드 호출로 바뀐다. 사용하려면 그 클래스의 네임스페이스를 `using`으로 가져와야 한다.
- 같은 이름의 인스턴스 메서드가 있으면 인스턴스 메서드가 항상 우선한다.
- 메서드를 이어서 호출하는 체이닝이 쉬워진다.

```csharp
long gold = 2_500_000;
Console.WriteLine(gold.ToShort());   // 2M

public static class NumberExtensions
{
    public static string ToShort(this long n)
        => n >= 1_000_000 ? $"{n / 1_000_000}M" : n >= 1_000 ? $"{n / 1_000}K" : n.ToString();
}
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 `ToShort()` 같은 도우미를 숫자 타입에 붙여 로그나 관리자용 화면 문자열을 깔끔하게 만들 수 있다. 다만 API 응답에는 줄여 쓴 문자열이 아니라 원래 숫자를 내려주고 표시 형식은 클라이언트에 맡기는 편이 일반적이다. 위 `ToShort` 로직은 확장 메서드 문법을 보여 주기 위한 간단한 예시이며, 소수점 처리 등은 생략했다.

### 5.4 튜플

**한 줄 요약:** 이름 있는 값 묶음을 즉석에서 만들고, 메서드가 값을 여러 개 반환하게 해 준다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Tuples" (텍스트 L15763-16090)

- `(string, int)` 같은 튜플은 값 타입이며 요소를 읽고 쓸 수 있다. 복사하면 별개의 복사본이다.
- 요소에 이름을 붙일 수 있다: `(string name, int age)`.
- 분해(deconstruction)로 한 번에 변수에 나눠 담을 수 있다: `var (name, age) = GetPerson();`.
- 내용이 같으면 `Equals`/`==`가 true이고 해시도 지원해서 딕셔너리 키로도 쓸 수 있다.
- 이름 있는 튜플의 이름은 소스 코드와 컴파일러 안에서만 존재하고, 런타임에는 대부분 사라진다(내부적으로는 `ValueTuple<...>`의 `Item1`, `Item2`...). 책은 record를 이름 붙은 요소가 강하게 타입 지정되는 대안으로 소개한다.

```csharp
(long gold, int gems) GetOfflineReward(int minutes)
    => (minutes * 10L, minutes / 60);

var (gold, gems) = GetOfflineReward(120);
Console.WriteLine($"골드 {gold}, 보석 {gems}");
```

**방치형 RPG 서버에서는** 서버가 계산하는 오프라인 보상처럼 "골드와 보석을 함께" 돌려주는 짧은 반환에 알맞다. out 매개변수보다 읽기 쉽다.

### 5.5 record

**한 줄 요약:** record는 "바뀌지 않는 데이터 묶음"을 한 줄로 정의하게 해 주는, 값 비교와 복사 수정이 내장된 타입이다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Records" (텍스트 L16091-16930)

- 기본은 class(`record`, `record class`와 같은 뜻)이고, C# 10부터 `record struct`도 가능하다. 매개변수 목록을 쓴 `record struct`는 `readonly`를 붙이지 않으면 init 전용이 아니라 쓰기 가능한 프로퍼티를 만든다.
- `record Item(string Name, int Power);`처럼 매개변수 목록만 쓰면 init 전용 프로퍼티, 생성자, 분해 메서드를 컴파일러가 만들어 준다.
- 구조적 동등성: 내용(값)이 같으면 같은 것으로 취급한다(`==` 포함). 또한 `ToString()`이 프로퍼티를 보기 좋게 출력해 준다.
- `with` 식으로 "일부만 바꾼 새 복사본"을 만든다(비파괴적 변경). 원본은 그대로다.
- 구조적 동등성은 배열/컬렉션이 들어 있거나 지연 계산 값이 있으면 기대와 다르게 동작할 수 있다(책은 이를 취약하다고 표현).
- 프로퍼티 검증이 필요하면 매개변수 목록 대신 직접 프로퍼티와 생성자를 쓰는 편이 낫다.

```csharp
var sword = new Item("나무검", 10, 1);
var upgraded = sword with { Level = 2, Power = 15 };   // 새 복사본

Console.WriteLine(sword);                    // Item { Name = 나무검, Power = 10, Level = 1 }
Console.WriteLine(sword == upgraded);        // False (내용이 다름)
Console.WriteLine(sword == new Item("나무검", 10, 1)); // True

record Item(string Name, int Power, int Level);
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 아이템/스킬 "기본 스펙 데이터"나 API 응답용 데이터(DTO)를 record로 정의해 실수로 값이 바뀌는 것을 막고, 강화된 아이템은 `with`로 새로 만드는 방식이 데이터 관리에 편하다. "데이터를 불변으로 둔다"는 설계 조언은 서버 맥락의 제안이다. 책은 불변 타입이 버그를 줄인다는 일반론(Records 'Background')을 설명한다.

### 5.6 패턴 매칭

**한 줄 요약:** `is`와 `switch` 식에서 값의 모양(타입, 범위, 속성, 위치)으로 분기하는 문법이다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Patterns", "Constant/Relational/Combinators/var/Tuple and Positional/Property/List Patterns" (텍스트 L16932-17329)

- 사용 위치: `is` 뒤, `switch` 문, `switch` 식.
- 타입 패턴: `obj is string s`. 상수 패턴: `x is 3`.
- 관계 패턴(C# 9): `x is > 100`, `bmi switch { < 18.5m => ... }`.
- 조합자 `and`, `or`, `not`: `n is >= 1 and <= 9`, `obj is not string`.
- 튜플/위치 패턴: `(season, daytime) switch { (Season.Spring, true) => ... }`. record의 분해도 사용 가능.
- 프로퍼티 패턴: `{ Scheme: "http", Port: 80 }`처럼 객체 속성 값으로 매칭.
- 리스트 패턴(C# 11): `numbers is [0, .., 4]`.
- 책은 복잡한 패턴 switch는 간단한 `if`로 바꿀 수 있는 경우가 많다고 덧붙인다.

```csharp
Console.WriteLine(Grade(new Item("용사검", 120, Rarity.Epic)));   // 강력한 영웅
Console.WriteLine(DamageLabel(500));                              // 보통

string Grade(Item item) => item switch
{
    { Rarity: Rarity.Legendary }              => "전설",
    { Rarity: Rarity.Epic, Power: > 100 }     => "강력한 영웅",
    { Rarity: Rarity.Epic }                   => "영웅",
    { Power: >= 50 and < 100 }                => "쓸만함",
    _                                          => "일반",
};

string DamageLabel(long dmg) => dmg switch
{
    < 100  => "약함",
    < 1000 => "보통",
    _      => "강함"
};

enum Rarity { Common, Rare, Epic, Legendary }
record Item(string Name, int Power, Rarity Rarity);
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 아이템 등급별 보상 배율 분기, 요청 종류별 검증 규칙 선택처럼 "조건이 여러 갈래"인 곳을 읽기 쉽게 정리하는 데 알맞다.

### 5.7 특성(Attribute)이란?

**한 줄 요약:** 특성은 코드 요소(클래스, 메서드, 매개변수 등)에 `[대괄호]`로 붙이는 "추가 정보 라벨"이다.

> 📖 출처: C# 12 in a Nutshell Ch4 "Attributes", "Attribute Classes", "Named and Positional Attribute Parameters" (텍스트 L17330-17394)

- `System.Attribute`를 상속한 클래스로 정의하고, 이름 끝의 `Attribute`는 생략할 수 있다: `[Obsolete]`.
- `[Obsolete]`는 컴파일러가 알아보고, 표시한 코드를 쓰면 경고를 낸다.
- 매개변수를 가질 수 있다. 생성자에 대응하는 "위치 매개변수"와 이름으로 지정하는 "이름 있는 매개변수(`Namespace="..."`)"가 있다.
- 어셈블리에 붙일 때(`[assembly: ...]`)처럼 대상을 명시할 수도 있다.
- 직접 특성을 만드는 방법은 원서 18장에서 다루며, 이 원고에서는 다루지 않는다.

```csharp
[Obsolete("대신 NewCalcDamage를 쓰세요")]
long OldCalcDamage(int level) => level * 10L;
```

> 🔧 보충(책 외): 방치형 RPG 서버에서는 웹 프레임워크(예: ASP.NET Core)의 `[HttpGet]`, `[ApiController]`, `[Required]` 같은 특성을 자주 만나게 되므로, "대괄호 라벨은 프레임워크에 정보를 전달하는 것" 정도로 알아 두면 충분하다. 이 특성 이름들은 이 책(C# 12 in a Nutshell)에는 나오지 않으며, 본 절의 서버 문맥 자체가 보충이다.

---

## 실무 적용

### 체크리스트

**이 부 요약**
- [ ] 델리게이트/`Action`/`Func` -> 이벤트 -> 람다로 "동작을 값처럼 넘기고, 변화를 알린다." → 코어 1, 2
- [ ] try/catch/finally, using, TryXXX로 "실패해도 서버가 계속 동작하게 한다." → 코어 3
- [ ] 이터레이터, nullable, 확장 메서드, 튜플, record, 패턴 매칭으로 "짧고 안전하게 쓴다." → 코어 4, 5

**구현 전 점검**
- [ ] 값이 바뀌는 쪽은 `event`로 알리고, 이벤트 호출은 `?.Invoke`로 한다. 값이 실제로 바뀔 때만 쏜다. → 코어 1
- [ ] 수명이 짧은 객체가 수명이 긴 객체의 이벤트를 구독했다면 반드시 `-=`로 해제한다. 서버 내부 이벤트는 프로세스 안에서만 동작한다는 점을 기억한다. → 코어 1
- [ ] 루프에서 람다를 만들 때 반복 변수를 지역 변수에 복사해 캡처한다. 요청마다 도는 코드에서는 캡처 할당을 의식하고, 필요하면 `static` 람다. → 코어 2
- [ ] catch는 구체적인 타입부터, `Exception` 전체는 복구·로그 후 재throw·최후 방어선일 때만. 다시 던질 땐 `throw;`(not `throw ex;`), 감쌀 땐 `innerException`. → 코어 3
- [ ] 파일·스트림·DB 연결 같은 `IDisposable`은 항상 `using`/`using var`. C++처럼 스코프 끝 자동 정리를 기대하지 않는다. → 코어 3
- [ ] "있을 수 없는 값"은 예외(`ArgumentOutOfRangeException` 등), "골드 부족"처럼 흔한 실패는 TryXXX/실패 응답. 미리 확인 가능한 오류는 `if`로 막는다. → 코어 3
- [ ] 이터레이터는 순회해야 실행된다(지연 실행). 인자 검사가 즉시 필요하면 분리한다. → 코어 4
- [ ] "없을 수 있는 값"은 -1 같은 매직 넘버 대신 `int?`, 참조 타입은 nullable 참조 타입을 켜고 `string?`으로 표시한다. `!`는 남용하지 않는다. → 코어 5
- [ ] 불변 데이터(기본 스펙·DTO)는 record + `with`, 단 배열/컬렉션을 담은 record의 `==`는 믿지 않는다. → 코어 5

### 시나리오로 확인하기

1. **상황:** 요청마다 만드는 `AchievementTracker` 객체가 싱글턴 `Wallet`의 `GoldChanged` 이벤트에 `+=`로 구독한다. 서버를 며칠 띄워 두면 메모리가 계속 오르고, 업적 검사 로그가 요청 수보다 훨씬 많이 찍힌다.
   **질문:** 무엇이 객체를 붙잡고 있고, 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   이벤트(델리게이트)에 인스턴스 메서드를 담으면 델리게이트가 그 객체를 함께 붙잡는다. 수명이 긴 `Wallet`의 이벤트에 구독한 뒤 `-=`로 해제하지 않으면 요청이 끝나도 `AchievementTracker`가 살아남아 누수가 되고, 계속 호출되어 로그도 늘어난다(본문 보충의 추론). 처리가 끝나면 `-=`로 해제하거나, 구독자를 요청마다 만들지 않도록 구조를 바꾼다. → 코어 1 (1.1, 1.5)

   </details>

2. **상황:** 스킬 슬롯 3개에 대해 `for (int i = 0; i < 3; i++) handlers.Add(() => ProcessSlot(i));`로 처리 동작을 등록하고 나중에 실행했다. C++에서 `[=]`로 캡처하던 감각이었다. 그런데 모든 동작이 존재하지 않는 슬롯 3을 처리하려다 실패한다.
   **질문:** 왜 그렇고, 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   C# 람다는 값 복사가 아니라 변수 자체를 캡처하고, 값은 호출할 때 읽힌다. for 루프의 `i`는 하나의 변수라 모든 람다가 공유하며, 루프가 끝난 뒤 호출하면 마지막 값 3을 본다. 루프 안에서 `int slot = i;`로 복사해 `slot`을 캡처하면 반복마다 새 변수가 생겨 해결된다. foreach는 C# 5부터 이 문제가 없다. → 코어 2 (2.2)

   </details>

3. **상황:** C++ RAII 습관대로 `var reader = new StreamReader(path);`로 파일을 읽고 메서드를 빠져나왔다. 부하가 걸리자 "파일이 다른 프로세스에서 사용 중" 오류와 핸들 고갈이 생긴다.
   **질문:** 원인과 대책은?

   <details markdown="1"><summary>답 확인</summary>

   C#에는 스코프 끝에서 자동으로 불리는 소멸자가 없다. `using` 없이 만든 `IDisposable`은 변수가 스코프를 벗어나도 `Dispose`되지 않고, GC/finalizer가 언제 정리할지 모른다. `using var reader = new StreamReader(path);`로 바꾸면 블록 끝에서 `try/finally { Dispose(); }`와 같이 정리된다. 닫는 것을 잊으면 자원이 고갈되어 서버가 느려지거나 멈출 수 있다. → 코어 3 (3.2)

   </details>

4. **상황:** 구매 API에서 골드 부족을 `throw new InvalidOperationException("골드 부족")`으로 알리고, 상위에서 `catch (Exception ex) { Log(ex); throw ex; }`로 로그 후 다시 던진다. 트래픽이 몰리면 CPU가 튀고, 진짜 버그가 났을 때 로그의 스택 트레이스는 항상 이 catch 줄을 가리킨다.
   **질문:** 두 가지 문제를 각각 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   (1) 예외 처리는 비용이 크다(수백 클록 이상). "골드 부족"처럼 흔한 실패는 `TryBuyUpgrade` 같은 TryXXX(bool 반환)나 실패 응답으로 처리하고, 예외는 "음수 비용" 같은 정상 흐름 밖 오류에 쓴다. (2) `throw ex;`는 원래 스택 정보를 잃는다. `throw;`로 다시 던지면 스택이 유지된다. → 코어 3 (3.1, 3.3, 3.4)

   </details>

5. **상황:** `IEnumerable<long> WaveHp(int waves)` 맨 앞에 `if (waves < 0) throw new ArgumentOutOfRangeException(nameof(waves));`를 넣고, 요청 처리 초입에서 `var seq = WaveHp(req.Waves);`를 호출해 검증했다고 생각했다. 그런데 예외는 한참 뒤 응답을 만드는 `foreach`에서 터졌다.
   **질문:** 왜 검증 시점이 밀렸나?

   <details markdown="1"><summary>답 확인</summary>

   `yield return`을 쓴 이터레이터 메서드는 호출만으로는 코드가 실행되지 않고, `foreach` 등으로 실제로 순회할 때 실행된다(지연 실행). 인자 검사도 이터레이터 본문 안에 있으면 순회 시점으로 밀린다. 검사를 하는 일반 메서드와 실제 `yield` 하는 내부 이터레이터로 나누면 호출 시점에 검사된다(본문 보충). → 코어 4 (4.3)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
함수형 도구·예외·현대 C# — 한 문장: ( ? )
├─ 코어 1 동작을 값으로
│   ├─ 1.1 델리게이트: 모양(반환형+매개변수) / 고차 함수 / 인스턴스 메서드 → 객체 ( ? )
│   ├─ 1.2 Func<..., ( ? )> vs Action / 못 쓰는 경우 ____
│   ├─ 1.3 멀티캐스트(+=, 불변, 반환값은 ( ? )만) — C++ std::function에는 ( 있다? 없다? )
│   ├─ 1.4 이벤트: event가 막는 3가지 ( ? ) ( ? ) ( ? ) / 프로세스 ( 안? 밖? )
│   └─ 1.5 표준 패턴 EventArgs + ____ + On____ / ?.Invoke / -= 안 하면 ____
├─ 코어 2 람다와 클로저
│   ├─ 2.1 (x) => 식 / _ 버리기 / var 람다
│   ├─ 2.2 클로저(값은 ( 만들 때? 호출할 때? )) / 수명 연장 / for 캡처 → ____ 로 해결 / static 람다
│   └─ 2.3 지역 메서드와 비교
├─ 코어 3 실패 처리
│   ├─ 3.1 try/catch(구체 → 넓은 순서, when 필터)/finally(return해도 실행) / noexcept ( 있다? 없다? )
│   ├─ 3.2 using = try + finally { ( ? ) } / using var / RAII와 차이 ____
│   ├─ 3.3 throw new / throw; vs throw ex; / innerException / ThrowIfNull
│   └─ 3.4 TryXXX: bool 반환 + ( ? ) / Parse vs TryParse
├─ 코어 4 시퀀스: MoveNext + Current / 컬렉션 식 [ ] / yield return·yield break / 지연 실행 / try-catch 안 yield 금지
└─ 코어 5 현대 C#
    ├─ 5.1 int?(HasValue, Value → 없으면 ( ? )Exception) / 5.2 string?(경고일 뿐) / ! 널 포기
    ├─ 5.3 확장 메서드(this 첫 매개변수, 인스턴스 메서드 우선)
    ├─ 5.4 튜플(값 타입, 이름은 런타임에 사라짐) / 5.5 record(동등성, with)
    ├─ 5.6 패턴 7종 ( ? )
    └─ 5.7 특성 [Obsolete] / 위치 매개변수 vs 이름 있는 매개변수
```

### 2. 인출 질문

1. 델리게이트가 호출자와 대상 메서드를 분리한다는 것은 무슨 뜻이고, 인스턴스 메서드를 담으면 어떤 부수 효과가 있나요?

   <details markdown="1"><summary>답 확인</summary>

   델리게이트 타입은 반환형과 매개변수 목록만 정하므로 모양이 맞는 어떤 메서드든 담아 나중에 갈아 끼울 수 있다(콜백, 플러그인 메서드). 인스턴스 메서드를 담으면 델리게이트가 그 객체도 붙잡아 객체의 수명이 늘어난다. → 코어 1 (1.1)

   </details>

2. `Func<int, long>`과 `Action<string>`은 각각 무엇을 뜻하나요? 이 둘로 표현할 수 없는 경우는?

   <details markdown="1"><summary>답 확인</summary>

   `Func<int, long>`은 int를 받아 long을 반환(마지막 타입 인자가 반환형), `Action<string>`은 string을 받고 반환값이 없다. `ref`/`out`/포인터 매개변수가 있는 경우만 다루지 못한다(매개변수는 최대 16개). → 코어 1 (1.2)

   </details>

3. 반환값이 있는 멀티캐스트 델리게이트를 호출하면 어떤 값을 받나요? `+=`는 내부적으로 무엇을 하나요?

   <details markdown="1"><summary>답 확인</summary>

   추가한 순서대로 모두 실행되지만 마지막에 실행된 메서드의 반환값만 돌려받는다(그래서 보통 void). 델리게이트는 불변이라 `+=`는 새 델리게이트를 만들어 다시 대입하는 것이며, null 델리게이트에 `+=`해도 정상 동작한다. → 코어 1 (1.3)

   </details>

4. `event` 키워드는 바깥 코드의 어떤 행동을 막나요?

   <details markdown="1"><summary>답 확인</summary>

   바깥 코드는 `+=`와 `-=`만 할 수 있다. 다른 구독자를 `=`로 덮어쓰기, null로 전부 지우기, 바깥에서 마음대로 호출(방송)하기를 막는다. → 코어 1 (1.4)

   </details>

5. .NET 표준 이벤트 패턴의 3요소와, 이벤트 호출에 `?.Invoke`를 권하는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   `EventArgs`를 상속한 정보 클래스, `(object sender, TEventArgs e)` 모양의 `EventHandler<TEventArgs>`, 이벤트를 쏘는 `protected virtual void OnXxx(e)` 메서드다. 책은 `Xxx?.Invoke(this, e)`가 null 검사와 스레드 안전을 함께 챙기는 가장 좋은 일반적 방법이라고 설명한다. 추가 정보가 없으면 `EventArgs.Empty`. → 코어 1 (1.5)

   </details>

6. 서버 내부 이벤트(`GoldChanged`)의 장점과 한계는?

   <details markdown="1"><summary>답 확인</summary>

   보상 계산 로직은 `Gold`만 올리고 로그 기록·업적 검사 같은 후속 처리는 구독자가 각자 하므로 계산 로직이 후속 처리를 몰라도 된다. 하지만 프로세스 안에서만 동작해 서버를 여러 대로 늘리면 DB나 메시지 큐 같은 별도 수단이 필요하다(본문 보충). → 코어 1 (1.4)

   </details>

7. 람다가 캡처한 변수 `bonus`를 람다 생성 후에 10으로 바꾸고 호출하면 결과는? 캡처의 비용은?

   <details markdown="1"><summary>답 확인</summary>

   캡처된 값은 호출 시점에 읽히므로 바뀐 10이 반영된다(예: `5 * 10 = 50`). 캡처된 변수는 델리게이트가 살아 있는 동안 수명이 늘고, 내부적으로 숨은 클래스가 만들어져 작은 메모리 할당이 생긴다. 캡처를 막으려면 `static` 람다(C# 9). → 코어 2 (2.2)

   </details>

8. for 루프 반복 변수 캡처 버그는 왜 생기고 어떻게 고치나요? C++의 참조 캡처와는 어디가 다른가요?

   <details markdown="1"><summary>답 확인</summary>

   모든 람다가 같은 반복 변수 하나를 공유하므로 루프가 끝난 뒤 호출하면 모두 마지막 값(3)을 본다. 루프 안에서 `int slot = i;`처럼 복사한 지역 변수를 캡처하면 반복마다 새 변수가 생겨 해결된다. foreach는 C# 5부터 문제없다. C++ 참조 캡처와 달리 캡처된 변수의 수명이 늘어나 댕글링은 생기지 않는다(본문 보충). → 코어 2 (2.2)

   </details>

9. 람다와 지역 메서드는 각각 언제 유리한가요?

   <details markdown="1"><summary>답 확인</summary>

   지역 메서드는 재귀가 쉽고 델리게이트 타입이 필요 없으며 오버헤드가 조금 적다. 델리게이트 매개변수를 받는 메서드에 넘길 때는 람다가 더 간결하다. → 코어 2 (2.3)

   </details>

10. catch 블록의 순서 규칙과 예외 필터(`when`)의 동작, 그리고 `Exception`을 통째로 잡아도 되는 경우는?

    <details markdown="1"><summary>답 확인</summary>

    위에서부터 검사해 하나만 실행되므로 구체적인 예외 타입을 먼저, `Exception`을 마지막에 둔다. `catch (X ex) when (조건)`은 조건이 false면 무시되고 다음 catch를 검사한다. `Exception` 전체를 잡는 것은 복구 가능할 때, 로그 후 다시 던질 때, 최후의 방어선일 때만이다. → 코어 3 (3.1)

    </details>

11. `finally`는 언제 실행되지 않나요? 예외 처리 비용 관점에서 0으로 나누기 같은 오류는 어떻게 다루라고 하나요?

    <details markdown="1"><summary>답 확인</summary>

    `finally`는 return으로 빠져나가도 실행되며, 무한 루프나 프로세스의 갑작스러운 종료만이 막는다. 예외 처리는 비용이 크므로(수백 클록 이상) 미리 확인 가능한 오류는 `if`로 막는 편이 낫다. → 코어 3 (3.1)

    </details>

12. `using` 문은 무엇과 같고, `using var x = ...;`는 언제 정리되나요? C++ RAII와 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    `using`은 `try { ... } finally { Dispose(); }`와 같아 `IDisposable` 객체를 끝날 때 자동 정리한다. 중괄호 없는 `using var`(C# 8)는 그 변수가 속한 블록이 끝날 때 정리된다. RAII와 달리 `using`을 명시해야만 동작한다(본문 보충). → 코어 3 (3.2)

    </details>

13. `throw;`와 `throw ex;`의 차이, 그리고 잘못된 인자와 부적절한 객체 상태에 쓰는 표준 예외는?

    <details markdown="1"><summary>답 확인</summary>

    `throw;`는 원래 스택 정보를 유지하고 `throw ex;`는 스택 정보가 사라지므로 피한다. 다른 예외로 감쌀 때는 원본을 `innerException`으로 넘긴다. 잘못된 인자는 `ArgumentException`(null이면 `ArgumentNullException`, 범위 밖이면 `ArgumentOutOfRangeException`), 객체 상태가 부적절하면 `InvalidOperationException`. null 검사는 `ArgumentNullException.ThrowIfNull(x)`(.NET 6). → 코어 3 (3.3)

    </details>

14. 책은 언제 예외를 던지라고 하나요? TryXXX 패턴과 오류 코드 반환 방식의 장단점은?

    <details markdown="1"><summary>답 확인</summary>

    오류가 정상 흐름 밖에 있거나 바로 호출한 쪽이 감당할 수 없을 때 예외를 던진다. 경우에 따라 `int.Parse`(예외)와 `int.TryParse`(bool + out)처럼 두 방식을 모두 제공하는 것이 최선이다. 오류 코드 반환은 단순하고 예측 가능한 실패에는 통하지만 드문 오류로 확장하면 시그니처가 지저분해지고 연산자·프로퍼티에는 적용할 수 없다. → 코어 3 (3.4)

    </details>

15. 이터레이터 메서드의 실행 시점, 중간 종료 방법, `yield return`을 쓸 수 없는 위치는?

    <details markdown="1"><summary>답 확인</summary>

    호출만으로는 실행되지 않고 foreach 등으로 실제로 순회할 때 실행된다(지연 실행). `yield return`마다 값을 하나 넘기고 다시 부르면 그 자리부터 이어 간다. 중간 종료는 `yield break`. catch가 붙은 try 안, catch/finally 블록 안에서는 쓸 수 없고, finally만 있는 try 안에서는 쓸 수 있다. → 코어 4 (4.3)

    </details>

16. `int?`에서 `HasValue`가 false일 때 `Value`를 읽으면? null이 낀 덧셈과 `<` 비교의 결과는?

    <details markdown="1"><summary>답 확인</summary>

    `InvalidOperationException`이 난다. 대부분의 연산은 한쪽이 null이면 결과도 null, 비교(`<`, `>`)는 null이 끼면 false, `==`는 null끼리 같다. `T?`는 `Nullable<T>` 구조체이며 T→T?는 암시적, 반대는 명시적 변환이다. "-1을 없음으로" 쓰는 방식보다 안전하다. → 코어 5 (5.1)

    </details>

17. nullable 참조 타입을 켜면 무엇이 달라지고, `!` 연산자는 무엇을 하나요?

    <details markdown="1"><summary>답 확인</summary>

    `<Nullable>enable</Nullable>`이나 `#nullable enable`로 켜면 참조 타입은 기본적으로 null 불가로 보고, null을 허용하려면 `string?`처럼 표시한다. 컴파일러 경고일 뿐 실행 시 타입 차이는 없고, 검사도 완벽하지 않다(배열 요소 등). `s!`의 널 포기 연산자는 경고를 끌 뿐이라 위험할 수 있어 `if (s != null)` 검사가 낫다. → 코어 5 (5.2)

    </details>

18. 확장 메서드는 어떻게 정의하고, 같은 이름의 인스턴스 메서드가 있으면 어떻게 되나요?

    <details markdown="1"><summary>답 확인</summary>

    static 클래스의 static 메서드에서 첫 매개변수 앞에 `this`를 붙인다. 컴파일 결과는 그냥 static 메서드 호출이며, 쓰려면 그 네임스페이스를 `using`해야 한다. 같은 이름의 인스턴스 메서드가 있으면 인스턴스 메서드가 항상 우선한다. → 코어 5 (5.3)

    </details>

19. 튜플 요소 이름은 런타임에 어떻게 되나요? 튜플과 record를 비교해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    튜플은 값 타입이고 내용이 같으면 `==`가 true이며 분해가 가능하지만, 요소 이름은 소스와 컴파일러 안에서만 존재하고 런타임에는 대부분 사라진다(`Item1`, `Item2`). record는 이름 붙은 요소가 강하게 타입 지정되는 대안이다. → 코어 5 (5.4)

    </details>

20. record의 매개변수 목록이 자동으로 만들어 주는 것, 구조적 동등성, `with` 식, 그리고 구조적 동등성이 취약해지는 경우는?

    <details markdown="1"><summary>답 확인</summary>

    init 전용 프로퍼티, 생성자, 분해 메서드를 만들어 준다(`record struct`는 `readonly`가 없으면 쓰기 가능한 프로퍼티). 내용이 같으면 `==`가 true이고 ToString이 프로퍼티를 보기 좋게 출력한다. `with`는 일부만 바꾼 새 복사본을 만들고 원본은 그대로다. 배열·컬렉션이나 지연 계산 값이 있으면 동등성이 기대와 다를 수 있다. → 코어 5 (5.5)

    </details>

21. 패턴 매칭의 종류를 예와 함께 나열하고, 사용할 수 있는 위치를 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    타입(`obj is string s`), 상수(`x is 3`), 관계(`x is > 100`, C# 9), 조합자(`and`/`or`/`not`), 튜플/위치(`(a, b) switch { (X, true) => ... }`), 프로퍼티(`{ Rarity: Rarity.Epic, Power: > 100 }`), 리스트(`[0, .., 4]`, C# 11). `is` 뒤, switch 문, switch 식에서 쓴다. 복잡한 패턴 switch는 간단한 if로 바꿀 수 있는 경우가 많다. → 코어 5 (5.6)

    </details>

22. 특성(Attribute)이란 무엇이고, 위치 매개변수와 이름 있는 매개변수의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    코드 요소에 `[대괄호]`로 붙이는 추가 정보 라벨로, `System.Attribute`를 상속한 클래스이며 이름 끝 `Attribute`는 생략 가능하다(`[Obsolete]`는 사용 시 컴파일러 경고). 위치 매개변수는 특성 생성자에 대응하고, 이름 있는 매개변수는 `Namespace="..."`처럼 이름으로 지정한다. → 코어 5 (5.7)

    </details>

### 3. 기억 고리

- **C++ 유추:** 델리게이트 ≈ `std::function`. ⚠️ 멀티캐스트(`+=`로 여러 대상)는 C++에 없고, 인스턴스 메서드를 담으면 GC가 그 객체를 살려 둔다.
- **C++ 유추:** 람다 캡처 ≈ `[&]` 참조 캡처. ⚠️ C#은 값/참조를 고를 수 없이 변수 자체를 캡처하고, 그 변수의 수명이 델리게이트만큼 늘어난다(댕글링 대신 누수·할당).
- **C++ 유추:** `using var` ≈ RAII 스코프 정리. ⚠️ 명시해야만 동작하고, finalizer는 소멸자가 아니다(호출 시점 비결정적).
- **C++ 유추:** 예외 ≈ C++ 예외. ⚠️ `noexcept`가 없고 `finally`·`when` 필터가 있으며, `throw ex;`는 스택을 잃는다.
- **C++ 유추:** `int?` ≈ `std::optional<int>`. ⚠️ 연산이 null을 전파하고 비교는 false. `string?`은 런타임 타입이 아니라 컴파일러 경고뿐.
- **비유:** 이벤트 = 방송국. 방송국(클래스)만 송출하고, 청취자는 채널을 켜고(`+=`) 끌(`-=`) 뿐이며 서로를 모른다. ⚠️ 비유가 깨지는 지점: 실제 방송과 달리 방송국이 청취자 목록(델리게이트)을 붙잡고 있어서, 끄지 않은 청취자 객체는 계속 살아남을 수 있고, 이 "방송"은 같은 프로세스 안에서만 들린다.
- **비유:** 클로저 = 변수의 "사진"이 아니라 변수로 통하는 "창문"을 가져가는 것. 그래서 호출할 때 창밖(현재 값)을 본다. ⚠️ 깨지는 지점: 람다 안에서 새로 만든 지역 변수는 호출마다 새로 생기므로 공유되지 않는다.
- **묶음(3의 법칙):** 실패 처리 3도구 try/catch/finally · using · TryXXX. 동작 전달 3단계 델리게이트 → Func/Action → 람다. 불변 데이터 3형제 튜플(가볍고 이름은 런타임에 사라짐) · record(구조적 동등성 + with) · readonly struct([제2부](02_제2부_객체지향.md)).
- **대칭·순서:** `throw;`(스택 유지) ↔ `throw ex;`(스택 손실) / `Parse`(예외) ↔ `TryParse`(false) / `foreach`(소비자) ↔ 이터레이터 `yield`(생산자) / `int?`(값 타입 null, 런타임 구조체) ↔ `string?`(참조 타입, 컴파일러 경고뿐).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "골드가 바뀌면 로그 기록과 업적 검사가 자동으로 실행되게 만드는 방법(이벤트)"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "C# 람다 캡처는 왜 `[=]`가 아닌가", "`using var`는 RAII와 무엇이 같고 무엇이 다른가", "델리게이트가 `std::function`보다 하나 더 가진 기능(멀티캐스트)"을 각각 1분씩 C++ 코드와 비교하며 설명해 보세요.
- **랜덤 논리 게임:** A "골드 부족 같은 실패는 예외로 알려야 한다(호출자가 놓칠 수 없다)" vs B "흔히 일어나는 실패는 TryXXX로 bool을 돌려줘야 한다(예외는 비싸고 정상 흐름 밖 오류용)" — 양쪽을 번갈아 변호해 보세요. 추가 라운드: A "여러 값 반환은 튜플로" vs B "record로".
- **AI 역할 반전:** "내가 C#의 람다 변수 캡처와 for 루프 캡처 버그를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제5부. .NET 기본 라이브러리

> **🎮 게임 서버 개발자에게** — 이 부는 C++ 서버에서 쓰던 STL 컨테이너·`<chrono>`·`<random>`·`<ranges>`·JSON 라이브러리에 해당하는 .NET 기본 도구 상자다. 이름과 역할은 대부분 1:1로 대응하지만, 결정적으로 다른 점이 세 가지 있다. 웹 서버는 한 요청을 스레드 풀의 아무 스레드에서나 처리하므로 "공유 객체 하나"(정적 `Random` 등)가 쉽게 깨지고, 클래스 변수는 값이 아니라 참조(포인터에 가까움)라서 `==`와 컨테이너 키의 의미가 달라지며, LINQ는 C++20 view처럼 순회할 때 계산된다. 클라이언트 값을 믿지 않고 서버 시계·서버 난수만 기준으로 삼는 원칙은 TCP 게임 서버와 똑같다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 점검 뒤 "오프라인 보상이 0이거나 수십 년치로 나온다", "일일 퀘스트가 한국 시각 오전 9시에 초기화된다"는 문의가 들어온다 (UTC·시간대·`TimeProvider`).
> - 부하 테스트 중 뽑기 결과가 한 등급으로 쏠리거나, 토큰·쿠폰 코드가 추측 가능하다는 보안 지적을 받는다 (`Random.Shared`·`RandomNumberGenerator`).
> - 응답 목록이 요청마다 다르게 나오거나 같은 계산이 여러 번 돈다, 혹은 없는 아이템 ID로 조회하다 500 에러가 난다 (LINQ 지연 실행·`TryGetValue`).

## 코어 — 이것만은 100%

> **한 문장:** 서버는 시간(UTC 저장, `TimeProvider` 주입, 게임 시간대로 "오늘" 판정)·숫자와 난수(`TryParse` + 범위 검사, `BigInteger`, 스레드 안전한 `Random.Shared`)·문자열과 동등성(불변, Ordinal 비교, 값 vs 참조)을 "서버가 유일한 기준"이라는 원칙으로 다루고, 컬렉션은 "어떻게 찾을까"로 고르며 LINQ는 순회할 때 실행된다는 점을 의식하고, 프로세스 밖으로 나가는 데이터는 JSON으로 주고받고 자원은 `using`으로 닫는다.

1. **시간 — 서버 시계가 유일한 기준** — 저장·비교는 UTC(`DateTime`은 Kind를 무시하고 틱만 비교하므로 섞지 말 것, `DateTimeOffset`은 같은 순간이면 같음). 경과 시간은 `TimeSpan.Total...`, "지금"은 `TimeProvider`를 주입받아 묻고, 일일 초기화는 게임 기준 시간대로 바꿔 `DateOnly`로 판정한다.
2. **숫자와 난수 — 입력은 검증하고 확률은 서버가 굴린다** — 클라이언트 문자열은 `TryParse` + `InvariantCulture` + 범위 검사, 캐스트는 잘라내고 `Convert`는 은행가 반올림, `long`을 넘는 재화는 `BigInteger`. 서버 난수는 `Random.Shared`(스레드 안전), 추측되면 안 되는 값은 `RandomNumberGenerator`, 뽑기는 정수 가중치 합 안에서 하나 뽑기.
3. **문자열과 동등성 — 불변과 "같다"의 기준** — string은 불변이라 결과를 받아야 하고 반복 결합은 `StringBuilder`. `==`는 Ordinal + 대소문자 구분, 무시하려면 `StringComparison.OrdinalIgnoreCase`. 값 타입은 내용, 클래스는 참조가 같아야 같고 `==`는 컴파일 시점에 결정된다. enum은 멤버·정수·문자열로 변환되지만 범위를 검증하지 않고, Guid는 겹치지 않는 ID다.
4. **컬렉션과 LINQ — 찾는 방식으로 고르고, 순회할 때 계산된다** — 번호로 → List, 키로 → Dictionary(O(1), `TryGetValue`), 중복 제거·포함 검사 → HashSet, 순서 규칙 → Queue(FIFO)/Stack(LIFO). `Where/Select/OrderBy`는 원본을 바꾸지 않고 지연 실행(순회할 때마다 재평가), `ToList`·`Count`·`First`는 즉시 실행.
5. **경계 밖의 데이터 — JSON과 파일, 그리고 닫기** — API 본문은 `System.Text.Json`(Reader/Writer · `JsonDocument`(Dispose 필수) · `JsonNode`(수정 가능))으로, 아주 큰 수는 문자열로 주고받는다. 파일·스트림은 `using`으로 닫고(Flush 자동), 게임 데이터는 파일이 아니라 DB에 둔다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `std::chrono::system_clock::now()`, `duration`, C++20 `zoned_time` | `DateTime.UtcNow`/`DateTimeOffset`, `TimeSpan`, `TimeZoneInfo`, `TimeProvider` | 시각(time_point)과 간격(duration)을 구분하고, 두 시각을 빼면 간격이 나온다 | `chrono`는 시계 종류가 타입에 박혀 서로 다른 시계를 섞으면 컴파일 에러지만, `DateTime`은 Local/Utc를 섞어도 컴파일되고 비교 시 Kind를 무시해 조용히 틀린다. 시계를 바꿔 끼우려면 템플릿 인자가 아니라 `TimeProvider`를 생성자로 주입한다 |
| `std::mt19937` + `uniform_int_distribution`, `std::discrete_distribution`, `std::random_device` | `Random.Shared.Next(n)`, 직접 짜는 가중치 뽑기, `RandomNumberGenerator` | 시드가 같으면 같은 수열(재현 가능), 게임 확률용과 보안용 난수를 구분한다 | `mt19937`도 스레드 안전하지 않아 보통 `thread_local`로 두지만, .NET은 `Random.Shared` 하나로 해결된다. 가중치 뽑기는 `discrete_distribution` 같은 표준 도구가 없어 직접 구현한다 |
| `std::vector` / `unordered_map` / `unordered_set` / `queue`·`stack` / `map` | `List<T>` / `Dictionary` / `HashSet` / `Queue`·`Stack` / `SortedDictionary` | 내부 구조와 복잡도(끝 추가 분할 상환 O(1), 해시 조회 O(1), 트리 조회 O(log n))가 거의 같다 | `unordered_map::operator[]`는 없는 키를 읽으면 기본값을 **삽입**하지만 C# 인덱서 읽기는 **예외**다(`TryGetValue` 사용). `queue::pop`은 void이고 빈 컨테이너는 UB지만 `Dequeue`는 값을 반환하고 비면 예외. 클래스 요소는 객체가 아니라 참조가 담긴다 |
| C++20 ranges/views (`views::filter`, `views::transform`) | LINQ (`Where`, `Select`, 지연 실행) | 만들 때가 아니라 순회할 때 계산되고, 원본을 바꾸지 않으며, 순회할 때마다 다시 계산된다 | LINQ는 원본 컬렉션 객체를 참조로 잡아 쿼리를 만든 뒤 추가된 요소도 반영된다. 순회 **도중** 원본 `List`를 수정하면 C++은 반복자 무효화(UB)지만 C#은 `InvalidOperationException` 예외다. 열거자·람다가 힙에 할당되어 GC 부담이 생길 수 있다. 결과 고정은 `ToList()`(≈ C++23 `ranges::to<std::vector>`) |
| 포인터 비교 `pa == pb`, `unordered_map<Hero*, …>` | 클래스의 참조 동등성, `Equals`/`IEquatable<T>` | 클래스 변수끼리 `==`는 "같은 객체를 가리키는가"를 본다 | C++은 객체를 값으로 두고 `operator==`를 직접 정의하는 것이 기본이지만, C# 클래스는 기본이 참조 비교이고 `==`는 컴파일 시점 타입으로 결정된다(`object`로 박싱된 5와 5는 다르다). string·record는 내용 비교로 재정의되어 있다 |
| `std::ofstream`의 RAII(소멸자에서 close), `std::stoi`·`std::from_chars`, `nlohmann::json` | `using`/`Dispose`, `int.TryParse`, `JsonNode`/`JsonDocument` | 자원은 범위를 벗어날 때 닫고, 숫자 파싱 실패를 예외 또는 결과 값으로 알리며, JSON을 DOM 트리로 읽고 쓴다 | C#은 `using`을 써야만 범위 끝에서 닫힌다(안 쓰면 GC가 비결정적 시점에). `from_chars`는 로캘 무관이지만 C# `Parse`는 기본이 현재 문화권이라 `InvariantCulture`를 지정해야 한다. `JsonDocument`는 풀링된 메모리를 써서 `Dispose`가 필수다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. 오프라인 보상을 계산할 때 왜 클라이언트가 보낸 시각이 아니라 서버의 UTC 시각을 써야 할까? 한국의 "매일 0시 초기화"는 UTC로 몇 시일까?
> 2. 정적 `Random` 하나를 여러 요청이 동시에 쓰면 무슨 일이 생길까? (C++이라면 `mt19937` 하나를 여러 스레드가 공유하는 상황)
> 3. 내용이 같은 두 Hero 객체를 `==`로 비교하면 true일까? `object x = 5, y = 5; x == y`는?
> 4. "해금한 스킬 목록"에는 List, Dictionary, HashSet 중 무엇이 맞을까? 없는 키를 `dict[key]`로 읽으면 C++ `unordered_map`처럼 기본값이 생길까?
> 5. LINQ 쿼리를 만든 뒤 원본 리스트에 요소를 추가하면 결과에 반영될까?
>
> **처리법:** 🛠 실습 `OfflineRewardService` + `FakeTimeProvider.Advance`, `Gacha.Roll` 가중치 뽑기, `TryGetValue`, `Where/OrderByDescending/Select/ToList` 체인, 지연 실행 `10|20|` 재현, `JsonObject` → `ToJsonString` → `JsonNode.Parse` → 읽자마자 직접 실행 · 🗺 관계도 시간(TimeSpan ↔ DateTime/DateTimeOffset ↔ TimeProvider ↔ DateOnly·TimeZoneInfo) / 숫자(TryParse·Math·BigInteger·Random.Shared) / 컬렉션 선택 기준 / LINQ(지연 vs 즉시) / JSON · 🔗 유추 LINQ ≈ 컨베이어 벨트(원문 비유) — 어디서 깨지는지(벨트는 "순회할 때"만 돌고, 순회할 때마다 처음부터 다시 돈다) · 📦 카드로 컬렉션 복잡도 표(O(1)·O(n)·O(log n)), `Hours` vs `TotalHours`, `Convert`의 은행가 반올림, Guid 2^128, `Random.Shared`(.NET 6)·`TimeProvider`(.NET 8)·`MinBy/MaxBy`(.NET 6)·`JsonNode`(.NET 6) 도입 버전

---

**이 부의 학습 목표**
1. 문자열, 날짜/시간, 숫자(BigInteger, Random)를 다루는 기본 도구를 알고, "오프라인 경과 시간 → 보상" 계산을 서버 시간(UTC) 기준으로 직접 짤 수 있다.
2. List / Dictionary / HashSet / Queue / Stack의 차이를 알고 상황에 맞게 고른다.
3. LINQ로 합계·정렬·검색을 하고, JSON으로 API 요청/응답 본문을 만들고 읽는 흐름을 이해한다. 파일 입출력은 서버에서 저장을 DB로 하므로 선택 학습이다.

> 표기 안내: `📖 출처`는 원문 위치(줄 번호는 변환 텍스트 기준), `🔧 보충(책 외)`는 책에 없는 설명, `📚 참고(doc, 책 외)`는 doc 폴더 문서를 근거로 보강한 절입니다. 코드는 원문 예제를 참고해 방치형 RPG 서버 맥락의 이름으로 새로 작성했습니다.

> 재구성 안내: 원래 1~8장 순서(문자열 → 시간 → 숫자 → Enum·Guid·동등성 → 컬렉션 → LINQ → JSON → 파일)를 다섯 개 코어로 다시 묶었습니다. 원래 장 → 새 위치: 2장 → 코어 1, 3장 → 코어 2, 1장·4장 → 코어 3, 5장·6장 → 코어 4, 7장·8장 → 코어 5.

---

## 코어 1. 시간 — 서버 시계가 유일한 기준

> 원래 2장 "날짜·시간: TimeSpan, DateTime/DateTimeOffset, UTC". 시각과 간격을 구분하고(1.1), 저장·비교 기준을 UTC 하나로 통일하고(1.2), "지금"과 "오늘"을 묻는 방법을 바꿔 끼울 수 있게 만든다(1.3).

### 1.1 TimeSpan — "시간의 길이"
**한 줄 요약:** `TimeSpan`은 "2시간 30분" 같은 시간 간격을 담는 구조체다.

> 📖 출처: C# 12 in a Nutshell 6장 "Dates and Times — TimeSpan" (텍스트 L21260-21367)

**핵심 설명**
- 만드는 방법은 세 가지: 생성자, `FromHours`/`FromMinutes`/`FromSeconds` 등, 그리고 **두 시각을 뺄셈**하는 것.
- `+`, `-`, `<`, `>` 연산자를 쓸 수 있다.
- `Hours`, `Minutes`는 "시계의 그 자리 숫자"(0~59 등)이고, `TotalHours`, `TotalMinutes`, `TotalSeconds`는 **전체를 그 단위로 환산한 double** 값이다. 경과 시간 계산에는 `Total...`을 쓴다.
- 기본값은 `TimeSpan.Zero`.

```csharp
TimeSpan t = TimeSpan.FromHours(2) + TimeSpan.FromMinutes(30);
Console.WriteLine(t);               // 02:30:00
Console.WriteLine(t.TotalMinutes);  // 150  (Minutes 프로퍼티는 30)
```

**방치형 RPG 서버에서는** 스킬 쿨타임·버프 지속 시간의 만료 판정, 응답에 담을 "다음 보상까지 남은 시간"을 서버가 표현하는 기본 단위다.

### 1.2 DateTime vs DateTimeOffset, 그리고 UTC
**한 줄 요약:** `DateTime`은 시간대 표시를 무시하고 비교하므로, 한 가지 기준(보통 UTC)으로 통일해서 쓰거나 `DateTimeOffset`을 쓴다. 현재 UTC 시각은 `DateTime.UtcNow` / `DateTimeOffset.UtcNow`다.

> 📖 출처: C# 12 in a Nutshell 6장 "DateTime and DateTimeOffset", "The current DateTime/DateTimeOffset", "DateTime and Time Zones", "DateTimeOffset and Time Zones" (텍스트 L21369-21441, L21569-21590, L21757-21840)

**핵심 설명**
- 둘 다 불변 구조체이고 날짜+시간을 담는다.
- `DateTime`은 시간대 정보를 3가지 상태 표시(Local / Utc / Unspecified)로만 가진다. **비교할 때는 이 표시를 무시하고 틱(ticks) 값만 비교**한다. 그래서 Local 시각과 Utc 시각을 섞어 비교하면 원하는 결과가 나오지 않는다.
- `DateTimeOffset`은 UTC와의 차이(offset)를 함께 저장해서, 두 값이 **같은 순간**을 가리키면 같다고 판단한다. 원문은 대부분의 경우 이쪽 논리가 낫다고 한다.
- `DateTime`으로 이 문제를 피하려면 앱 전체를 UTC 하나로 통일해야 하는데, 원문은 로컬 `DateTime`을 섞어 쓰기 쉽다는 점을 단점으로 든다.
- `Now`는 지금 컴퓨터의 로컬 시각, `UtcNow`는 UTC 시각이다.
- `DateTime`을 `DateTime`에서 빼면 `TimeSpan`이 된다. `AddDays`, `AddHours` 등으로 더하고 뺀다.

```csharp
DateTime lastSaved = DateTime.UtcNow;                 // 마지막 접속 시각 기록(서버 시간)
// ... 시간이 흐른 뒤 다음 요청이 들어옴 ...
TimeSpan away = DateTime.UtcNow - lastSaved;          // DateTime - DateTime = TimeSpan
Console.WriteLine($"{away.TotalMinutes:F1}분 동안 자리를 비웠습니다");
```

**방치형 RPG 서버에서는** "마지막 접속 시각을 서버 시간(UTC)으로 DB에 저장 → 다음 요청 때 지금과의 차이를 TimeSpan으로 계산 → 보상 지급"이 오프라인 보상의 기본 골격이다. (이 흐름은 위 원문 내용을 조합한 것이며, 원문에 오프라인 보상 예제가 있는 것은 아니다.)

> 🔧 보충(책 외): 클라이언트 시계는 사용자가 바꿀 수 있어 믿을 수 없다. 서버는 클라이언트가 보낸 시각이 아니라 서버 시간(UTC)만 기준으로 오프라인 보상을 계산해야 한다. 아래는 최소 골격이다.
> ```csharp
> TimeSpan away = DateTime.UtcNow - lastSaved;
> if (away < TimeSpan.Zero) away = TimeSpan.Zero;          // 음수 경과 시간 방어(서버 시각 보정 등)
> if (away > TimeSpan.FromHours(8)) away = TimeSpan.FromHours(8); // 오프라인 최대 8시간(게임 규칙 예시)
> long offlineGold = (long)(away.TotalSeconds * goldPerSecond);
> ```

### 1.3 서버 시간 다루기: TimeProvider와 일일 초기화
**한 줄 요약:** 서비스 코드에서는 `DateTime.UtcNow`를 직접 부르지 말고 `TimeProvider`를 주입받아 "지금"을 묻는다. "오늘"이 언제 바뀌는지(일일 초기화)는 UTC가 아니라 게임이 정한 시간대 기준으로 계산한다.

> 📚 참고(doc, 책 외): C# Complete Guide vol2 37장 37.3 "`DateOnly`와 `TimeOnly`", 37.6 "`TimeZoneInfo`", 37.9 "시간 의존성 제거 — `TimeProvider`"

**핵심 설명**
- **왜 `DateTime.UtcNow`를 직접 쓰면 곤란한가:** 정적 프로퍼티라 바꿔 끼울 수 없다. "8시간 뒤 보상", "자정 직전·직후"를 테스트하려면 실제로 기다리거나 PC 시계를 바꿔야 한다.
- **`TimeProvider`(.NET 8):** BCL이 제공하는 표준 "시계" 추상 클래스다. 실제 시계는 `TimeProvider.System`이고, `GetUtcNow()`가 지금 시각을 `DateTimeOffset`으로 돌려준다. 서비스는 생성자로 `TimeProvider`를 받고, DI 컨테이너에 `TimeProvider.System`을 등록한다(DI는 [제9부](09_제9부_설계원칙과_패턴.md)·[제8부](08_제8부_ASP_NET_Core_핵심_동작.md)).
- **테스트에서는** `Microsoft.Extensions.TimeProvider.Testing` 패키지의 `FakeTimeProvider`를 넣는다. `Advance(TimeSpan.FromHours(3))`처럼 시계를 원하는 만큼 즉시 앞으로 밀 수 있다(테스트는 [제13부](13_제13부_아키텍처_테스트_배포_기초.md)).
- **`DateOnly`(.NET 6):** 시각 없이 "날짜만" 담는 타입이다. "마지막으로 초기화한 날", "출석한 날"처럼 날짜만 의미 있는 값에 쓰면, 시·분·초가 섞여 비교가 틀어지는 실수를 막는다.
- **일일 초기화는 시간대가 필요하다:** 한국 서비스의 "매일 0시 초기화"는 UTC로 15:00이다. 저장·비교는 UTC로 하되, "오늘이 며칠인가"를 정할 때만 `TimeZoneInfo.ConvertTime`으로 게임 기준 시간대로 바꾼다. .NET 6부터 `FindSystemTimeZoneById`는 윈도우 ID(`"Korea Standard Time"`)와 IANA ID(`"Asia/Seoul"`)를 모두 받는다.

```csharp
// 오프라인 보상: "지금"을 주입받은 시계에서 얻는다
public class OfflineRewardService(TimeProvider time)
{
    private static readonly TimeSpan MaxAway = TimeSpan.FromHours(8);

    public long Calculate(DateTimeOffset lastSeenUtc, long goldPerSecond)
    {
        TimeSpan away = time.GetUtcNow() - lastSeenUtc;   // DateTime.UtcNow 대신
        if (away < TimeSpan.Zero) away = TimeSpan.Zero;
        if (away > MaxAway) away = MaxAway;
        return (long)away.TotalSeconds * goldPerSecond;
    }
}

// 일일 초기화: 한국 시각 0시 기준으로 "오늘"을 정한다
public class DailyState { public DateOnly LastResetDate { get; set; } }

public class DailyResetService(TimeProvider time)
{
    private static readonly TimeZoneInfo Kst = TimeZoneInfo.FindSystemTimeZoneById("Asia/Seoul");

    public bool TryReset(DailyState player)
    {
        DateTimeOffset nowKst = TimeZoneInfo.ConvertTime(time.GetUtcNow(), Kst); // UTC → 한국 시각
        DateOnly today = DateOnly.FromDateTime(nowKst.DateTime);                 // 날짜만 꺼냄

        if (player.LastResetDate >= today) return false;   // 오늘은 이미 초기화함
        player.LastResetDate = today;                      // 일일 퀘스트·출석 등 초기화
        return true;
    }
}

// Program.cs: builder.Services.AddSingleton(TimeProvider.System);
// 테스트:     var fake = new FakeTimeProvider(시작시각); fake.Advance(TimeSpan.FromHours(3));
```

**방치형 RPG 서버에서는** 오프라인 보상, 일일 퀘스트·출석 초기화, 이벤트 시작·종료, 버프 만료가 모두 "지금이 언제인가"에 달려 있다. 시계를 주입받게 만들어 두면 이 규칙들을 몇 밀리초 만에 테스트할 수 있다.

> 🔧 보충(책 외): 위 코드는 .NET 8에서 `FakeTimeProvider`로 실행해 확인했다. 3시간을 밀면 초당 10골드 기준 108,000골드, 13시간을 밀면 8시간 상한이 걸려 288,000골드가 나왔고, UTC 14:59(한국 23:59)에는 초기화되지 않다가 UTC 15:00(한국 다음 날 0:00)에 초기화됐다. chiseled(distroless) 같은 최소 구성 리눅스 컨테이너 이미지에는 시간대 데이터(tzdata)가 빠져 있을 수 있어 `FindSystemTimeZoneById`가 예외를 던질 수 있으니, 배포 이미지에 tzdata가 있는지 확인한다([제13부](13_제13부_아키텍처_테스트_배포_기초.md) Docker). 전 세계 서비스라면 "모든 플레이어가 같은 기준 시각"인지 "지역별 0시"인지를 기획과 먼저 정해야 한다.

## 코어 2. 숫자와 난수 — 입력은 검증하고 확률은 서버가 굴린다

> 원래 3장 "숫자 다루기: Parse/TryParse, Math, BigInteger, Random". 들어온 문자열을 안전하게 숫자로 바꾸고(2.1), 계산하고(2.2), `long`을 넘는 수를 다루고(2.3), 확률을 굴린다(2.4 → 서버판 2.5).

### 2.1 Parse와 TryParse (문자열 → 숫자)
**한 줄 요약:** 사용자·파일에서 온 문자열은 실패할 수 있으니 `TryParse`로 안전하게 바꾼다.

> 📖 출처: C# 12 in a Nutshell 6장 "Formatting and Parsing — ToString and Parse" (텍스트 L22159-22207), "Working with Numbers — Conversions" (L23287-23330)

**핵심 설명**
- `int.Parse("123")`은 실패하면 `FormatException`을 던진다. `int.TryParse("123", out int v)`는 예외 대신 `false`를 돌려준다. 실패가 예상되면 `TryParse`가 더 빠르고 깔끔하다고 원문이 설명한다.
- `Parse`/`ToString`은 컴퓨터의 문화권 설정을 따른다. 독일에서는 `"1.234"`가 1234가 된다. 저장·불러오기용 문자열은 `CultureInfo.InvariantCulture`를 지정하면 안전하다.
- 숫자 변환 정리: 암시적 캐스트(손실 없음), 명시적 캐스트 `(int)d`(소수 **잘라냄**), `Convert.ToInt32(d)`(**반올림**). 원문은 `Convert`가 "짝수 쪽으로" 반올림하는 은행가 반올림을 쓴다고 설명한다(L23050).

```csharp
using System.Globalization;

if (int.TryParse("250", out int level))
    Console.WriteLine($"레벨 {level}");
else
    Console.WriteLine("숫자가 아닙니다");

double rate = double.Parse("1.5", CultureInfo.InvariantCulture); // 1.5배 배율
```

**방치형 RPG 서버에서는** API 요청 본문·쿼리 문자열·설정 파일의 문자열을 숫자로 바꿀 때마다 필요하다.

> 🔧 보충(책 외): 클라이언트가 보낸 값은 형식이 틀리거나 조작되었을 수 있다. 서버는 `TryParse`로 검사한 뒤 값의 범위까지 확인하는 편이 안전하다.

### 2.2 Math 클래스
**한 줄 요약:** `Math`는 반올림·최대/최소·거듭제곱 등을 제공하는 정적 클래스다.

> 📖 출처: C# 12 in a Nutshell 6장 "Working with Numbers — Math" (텍스트 L23332-23368)

**핵심 설명**
- 반올림 계열: `Round`, `Truncate`, `Floor`(항상 내림), `Ceiling`(항상 올림). 음수에서도 Floor는 내림, Ceiling은 올림이다.
- `Max`, `Min`(두 값), `Abs`, `Sqrt`, `Pow`, `Log` 등이 있다. 값이 여러 개(배열/리스트)면 LINQ의 `Max`/`Min`을 쓴다.

```csharp
int cost = (int)Math.Ceiling(100 * Math.Pow(1.15, 10)); // 업그레이드 비용: 기본 100, 레벨마다 15%씩 증가
int hp   = Math.Max(0, currentHp - damage);            // HP가 음수가 되지 않게
```

**방치형 RPG 서버에서는** 서버가 계산하는 "비용이 지수적으로 늘어나는 업그레이드"(`Math.Pow`)와 HP 하한 처리(`Math.Max`)가 대표적 쓰임이다.

> 🔧 보충(책 외): 지수 증가 공식(기본값 × 1.15^레벨)은 방치형 게임에서 흔한 설계 관행이지, 책의 내용이 아니다.

### 2.3 BigInteger — 끝없이 커지는 숫자
**한 줄 요약:** `BigInteger`는 자릿수 제한 없이 정확한 정수를 다룬다(`using System.Numerics;`).

> 📖 출처: C# 12 in a Nutshell 6장 "Working with Numbers — BigInteger" (텍스트 L23370-23427)

**핵심 설명**
- 다른 정수 타입에서 `BigInteger`로는 암시적 변환이 된다. 아주 큰 수는 `BigInteger.Pow(10, 100)`이나 `BigInteger.Parse("...")`로 만든다.
- 사칙연산·나머지·비교 연산자가 모두 오버로딩되어 있어 일반 숫자처럼 쓴다.
- `double`로 명시적 캐스트하면 정밀도를 잃을 수 있다(원문이 googol 예제로 보여 준다).
- C#에는 BigInteger 리터럴이 없다. 코드에 큰 숫자를 직접 쓸 수 없고 위 방법으로 만들어야 한다.
- `ToString()`은 모든 자릿수를 출력한다.

```csharp
using System.Numerics;

BigInteger gold = 1;
for (int i = 0; i < 100; i++)
    gold *= 1_000;                       // 1000의 100제곱, long은 이미 넘쳤다
Console.WriteLine(gold.ToString().Length); // 301자리
```

**방치형 RPG 서버에서는** 골드가 `long`(약 9.2×10^18)을 훌쩍 넘는 게임이라면, 서버가 계산하는 재화를 BigInteger로 두는 선택지가 있다. 정확한 정수 계산이 되는 대신, 아래 보충의 단점도 함께 고려한다.

> 🔧 보충(책 외): 서버는 재화를 정확한 값으로 계산해 DB에 저장하고, API 응답에서는 큰 수를 문자열로 내려 주는 방식이 흔하다("1.5K, 2.3M" 같은 단위 표기는 보통 클라이언트 몫이다). 또 BigInteger는 일반 정수보다 연산이 느리고 메모리를 더 쓰므로, 필요한 재화에만 쓰는 편이 좋다.

### 2.4 Random — 드롭과 크리티컬
**한 줄 요약:** `Random` 인스턴스는 하나를 만들어 재사용하고, `Next(n)`·`NextDouble()`로 확률을 굴린다.

> 📖 출처: C# 12 in a Nutshell 6장 "Working with Numbers — Random" (텍스트 L23501-23567)

**핵심 설명**
- `Next(n)`은 0 이상 n 미만의 정수, `NextDouble()`은 0~1 사이 실수를 만든다.
- 같은 시드(seed)를 주면 같은 수열이 나온다(재현 가능). 시드를 안 주면 원문 설명으로는 시스템 시간으로 만든다(.NET Framework 기준. .NET Core/.NET 5 이후에는 무작위 시드를 쓴다).
- **함정:** 시스템 시계의 해상도 때문에, 짧은 간격에 `new Random()`을 여러 번 만들면 같은 값이 나올 수 있다(.NET Framework에서 생기는 문제). 원문은 정적 `Random` 하나를 두는 패턴을 권한다.
- `Random`은 스레드 안전하지 않고, 암호용으로는 부적합하다(보안용은 `RandomNumberGenerator`).
- .NET 8부터 `GetItems`(컬렉션에서 n개 뽑기), `Shuffle`(섞기)도 있다.

```csharp
static readonly Random rng = new Random();   // 한 번만 만들어 재사용

bool isCrit = rng.NextDouble() < 0.10;       // 크리티컬 확률 10%
int damage  = 50 * (isCrit ? 2 : 1);
bool drop   = rng.Next(100) < 5;             // 0~99 중 5 미만 = 5% 드롭
```

**방치형 RPG 서버에서는** 크리티컬, 아이템 드롭, 뽑기 모두 이 몇 줄이 기본이다. 확률은 클라이언트가 아니라 서버가 굴려야 조작을 막을 수 있다.

> 🔧 보충(책 외): 웹 서버는 여러 요청을 동시에 처리하므로, 위 원문의 "`Random`은 스레드 안전하지 않다"는 점이 서버에서는 특히 중요하다. 위 예제의 정적 `rng`를 여러 요청이 동시에 쓰면 안 된다. 서버에서 쓰는 방법은 바로 다음 2.5에서 다룬다.

### 2.5 서버에서의 난수: Random.Shared와 가중치 뽑기
**한 줄 요약:** 서버 코드에서는 `new Random()` 대신 스레드 안전한 `Random.Shared`를 쓰고, 뽑기 확률표는 "가중치 합 안에서 숫자 하나 뽑기"로 구현한다.

> 📚 참고(doc, 책 외): C# Complete Guide vol2 39장 "`Random`과 `RandomNumberGenerator`", ".NET 6이 바꾼 것 — `Random.Shared`"

**핵심 설명**
- **정적 `Random` 하나를 공유할 때의 문제:** 여러 스레드가 동시에 `Next`를 부르면 내부 상태가 깨져 0만 계속 나오는 상태에 빠질 수 있다. 웹 서버는 요청을 여러 스레드에서 동시에 처리하므로 실제로 일어나는 일이다.
- **`Random.Shared`(.NET 6):** 미리 만들어진 공유 인스턴스로, 스레드 안전하고 잠금 경합도 없다. 2.4의 "스레드 안전" 문제가 사라지고, (.NET Framework에서 있던) "같은 시드" 함정도 신경 쓸 필요가 없다. 새 코드에서 `new Random()`이 필요한 경우는 "같은 시드로 같은 결과를 재현"해야 할 때(시뮬레이션 재현, 테스트) 정도다.
- **`Random`과 `RandomNumberGenerator`의 구분:** `Random`은 빠르지만 다음 값을 추측할 수 있는(결정적) 난수다. 게임 확률(드롭·크리티컬·뽑기)에는 `Random.Shared`면 충분하다. 반면 추측되면 안 되는 값(토큰, 비밀번호 초기화 코드, 쿠폰 코드)은 `RandomNumberGenerator`(예: `RandomNumberGenerator.GetInt32(0, 100)`)로 만든다.
- **가중치 뽑기:** 등급별 가중치(일반 900, 희귀 90, 전설 10)를 모두 더한 값(1000) 안에서 숫자 하나를 뽑고, 그 숫자가 어느 구간에 떨어지는지 앞에서부터 찾는다. 확률을 퍼센트(소수)로 두는 것보다 정수 가중치로 두는 편이 합이 정확히 맞고 기획 데이터로 관리하기 쉽다.

```csharp
public record GachaEntry(string ItemId, int Weight);

public static class Gacha
{
    public static string Roll(IReadOnlyList<GachaEntry> table)
    {
        int total = table.Sum(e => e.Weight);       // 900 + 90 + 10 = 1000
        int r = Random.Shared.Next(total);          // 0 ~ 999, 여러 요청이 동시에 불러도 안전

        foreach (var entry in table)
        {
            if (r < entry.Weight) return entry.ItemId; // r이 이 구간 안에 떨어졌다
            r -= entry.Weight;                         // 다음 구간으로 넘어간다
        }
        throw new InvalidOperationException("가중치 표가 비어 있습니다.");
    }
}

var table = new List<GachaEntry> { new("common", 900), new("rare", 90), new("legend", 10) };
string item = Gacha.Roll(table);   // 약 90% common, 9% rare, 1% legend
```

**방치형 RPG 서버에서는** 뽑기·드롭·강화 성공 판정을 반드시 서버에서 굴리고, 확률표(가중치)는 코드가 아니라 설정이나 DB에 두어 기획자가 바꿀 수 있게 한다(옵션 패턴은 [제9부](09_제9부_설계원칙과_패턴.md)·[제8부](08_제8부_ASP_NET_Core_핵심_동작.md)). 결과는 DB에 기록해 두어야 유저 문의나 확률 검증에 대응할 수 있다.

> 🔧 보충(책 외): 위 `Roll`을 .NET 8에서 `Parallel.For`로 10만 번 동시에 호출해 확인했다. common 약 89,950회, rare 약 9,060회, legend 약 990회로 가중치 비율과 맞았다. 뽑기 확률 공개와 기록 보관 의무는 나라와 플랫폼 정책마다 다르므로 운영 전에 확인한다.

## 코어 3. 문자열과 동등성 — 불변과 "같다"의 기준

> 원래 1장 "문자열 처리 · StringBuilder · 비교"와 4장 "Enum 변환 · Guid · 동등성 비교". 문자열은 불변이라 결과를 받아야 하고(3.1·3.2), "같은가"는 비교 방식(3.3)과 타입 종류(3.6)가 정한다. 그 사이에 값을 다른 모습으로 바꾸는 enum(3.4)과 겹치지 않는 ID인 Guid(3.5)가 있다.

### 3.1 string의 기본 다루기 (검색, 자르기, 합치기, 서식)
**한 줄 요약:** string은 "바꿀 수 없는(불변)" 글자 묶음이라, 자르거나 바꾸는 메서드는 항상 새 문자열을 돌려준다.

> 📖 출처: C# 12 in a Nutshell 6장 "String and Text Handling" — String, Searching/Manipulating/Splitting and joining, String.Format (텍스트 L20545-20798)

**핵심 설명**
- `Contains`, `StartsWith`, `EndsWith`는 true/false, `IndexOf`는 위치(없으면 -1)를 알려준다.
- `Substring`, `Replace`, `Trim`, `PadLeft` 등은 원본을 바꾸지 않고 **새 문자열을 반환**한다. (`s.Trim();`만 쓰고 결과를 안 받으면 아무 일도 안 일어난 것과 같다.)
- `Split`은 문자열을 배열로 쪼개고, `string.Join`은 배열을 하나로 합친다.
- string은 참조 타입이라 `null`일 수 있다. 비었는지 볼 때는 `string.IsNullOrEmpty`가 편하다.
- `$"..."` 보간 문자열로 변수를 문자열 안에 넣는다. `{값,너비:서식}`으로 정렬·서식도 줄 수 있다(예: `{gold,10:N0}`). 너비가 양수면 오른쪽 정렬, 음수면 왼쪽 정렬이다.

```csharp
string line = "Slime,30,12";                 // 몬스터 이름, HP, 골드
string[] parts = line.Split(',');            // ["Slime","30","12"]
string name = parts[0].Trim();
Console.WriteLine($"{name}을(를) 처치! +{parts[2]} 골드");
Console.WriteLine(string.Join(" / ", parts)); // Slime / 30 / 12
```

**방치형 RPG 서버에서는** 서버 로그 메시지("+12 골드"), CSV/텍스트로 된 아이템 데이터 파싱, API 응답 메시지 조합에 거의 매일 쓴다.

> 🔧 보충(책 외): 서버는 요청이 몰리면 요청마다 문자열을 새로 만드는 비용(GC)이 쌓일 수 있다. 이 주제는 [제3부](03_제3부_메모리와_성능_기초.md)에서 다룬다.

### 3.2 StringBuilder — 문자열을 반복해서 이어 붙일 때
**한 줄 요약:** 반복문 안에서 글자를 계속 붙일 때는 `+` 대신 `StringBuilder`를 쓴다.

> 📖 출처: C# 12 in a Nutshell 6장 "StringBuilder" (텍스트 L20995-21041)

**핵심 설명**
- `StringBuilder`는 "수정 가능한 문자열"이다. `Append`, `Insert`, `Remove`, `Replace`를 지원한다.
- 원문은 반복해서 `Append`하는 방식이 일반 문자열을 계속 `+`로 이어 붙이는 것보다 훨씬 효율적이라고 설명한다.
- 다 만든 뒤 `ToString()`으로 결과를 얻는다. `AppendLine`은 줄바꿈까지 붙인다.
- 비울 때 `Length = 0`을 해도 내부 용량은 줄지 않는다(원문 경고). 메모리를 돌려주려면 새로 만들어야 한다.

```csharp
using System.Text;

var sb = new StringBuilder();
for (int i = 1; i <= 3; i++)
    sb.AppendLine($"{i}층 클리어 보상: {i * 100} 골드");
Console.WriteLine(sb.ToString());
```

**방치형 RPG 서버에서는** 전투 로그, 오프라인 보상 요약 응답 메시지처럼 서버가 여러 줄을 조립할 때 쓴다.

### 3.3 문자열 비교: 같은지 vs 순서
**한 줄 요약:** `==`는 대소문자를 구분하는 정확한 비교이고, 대소문자 무시나 문화권 규칙이 필요하면 `StringComparison`을 지정한다.

> 📖 출처: C# 12 in a Nutshell 6장 "Comparing Strings" (텍스트 L20800-20993), "Char" 절의 ToUpper/ToLower 설명 (텍스트 L20435-20449)

**핵심 설명**
- .NET은 "같은가(equality)"와 "누가 먼저인가(order)"를 다른 개념으로 다룬다.
- 두 가지 알고리즘이 있다. **Ordinal**은 글자 코드값 그대로 비교(빠르고 결정적), **Culture** 방식은 해당 언어의 알파벳 규칙으로 비교한다.
- `==`와 인자 없는 `Equals`는 항상 Ordinal + 대소문자 구분이다.
- 대소문자 무시는 `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)`처럼 쓴다. 정적 버전은 null이 들어와도 안전하다.
- `ToUpper/ToLower`는 사용자 언어 설정의 영향을 받아 버그가 날 수 있다(터키에서는 `char.ToUpper('i') == 'I'`가 false). 원문은 항상 영어 규칙을 쓰는 `ToUpperInvariant/ToLowerInvariant`를 안내한다.
- 순서 비교는 다르다. `CompareTo`는 문화권 규칙을 따르는 대소문자 구분 비교이고, 원문은 순서를 정할 때는 문화권 방식이 거의 항상 낫다고 설명한다.

```csharp
string input = "sword";
bool same = string.Equals(input, "SWORD", StringComparison.OrdinalIgnoreCase); // true
Console.WriteLine(same);
```

**방치형 RPG 서버에서는** 아이템 ID, API 요청으로 들어온 문자열 값, 저장 키를 비교할 때 `OrdinalIgnoreCase`를 습관으로 두면 언어 설정 때문에 생기는 버그를 피할 수 있다.

### 3.4 Enum 변환
**한 줄 요약:** enum은 "이름 ↔ 정수 ↔ 문자열"로 바꿔 쓴다. 저장할 때 특히 중요하다.

> 📖 출처: C# 12 in a Nutshell 6장 "Enums — Enum Conversions, Enumerating Enum Values" (텍스트 L23589-23777)

**핵심 설명**
- enum 값은 세 가지 모습을 가진다: enum 멤버, 정수, 문자열.
- 정수 ↔ enum은 명시적 캐스트 `(int)Rarity.Epic`, `(Rarity)3`으로 바꾼다.
- 문자열로는 `ToString()`, 문자열에서 enum으로는 `Enum.Parse`(못 찾으면 `ArgumentException`).
- `Enum.GetValues`, `Enum.GetNames`로 모든 멤버를 나열할 수 있다.
- 주의: enum은 컴파일러가 검사해 줄 뿐, 런타임에서 범위를 검증하지 않는다. `(Rarity)999`도 에러 없이 만들어진다. (원문은 `b += 1234;` 예로 설명한다.)

```csharp
enum Rarity { Common, Rare, Epic, Legendary }

int saved = (int)Rarity.Epic;                        // 2 (저장용)
Rarity loaded = (Rarity)saved;                       // Epic
Rarity fromText = (Rarity)Enum.Parse(typeof(Rarity), "Rare");

foreach (Rarity r in Enum.GetValues(typeof(Rarity)))
    Console.WriteLine(r);
```

**방치형 RPG 서버에서는** 아이템 등급, 직업, 스킬 종류를 enum으로 두고, API 요청/응답과 DB 저장에서 위 변환을 쓴다.

> 🔧 보충(책 외): DB 저장과 API 응답에서는 나중에 enum 순서를 바꿔도 깨지지 않도록 문자열 이름이나 명시적 숫자(`Common = 0`)로 저장하는 편이 안전하다.

### 3.5 Guid — 겹치지 않는 ID
**한 줄 요약:** `Guid.NewGuid()`는 사실상 세상에서 유일한 16바이트 ID를 만든다.

> 📖 출처: C# 12 in a Nutshell 6장 "The Guid Struct" (텍스트 L23824-23856)

**핵심 설명**
- 원문은 2^128(약 3.4×10^38)개의 서로 다른 Guid가 가능하다고 설명한다.
- 문자열(예: `0d57629c-7d6e-...`)로 표현되고, 생성자에 문자열을 넣어 복원한다.
- 구조체라서 `==`로 값 비교가 된다. `Guid.Empty`(모두 0)는 "없음" 표시로 자주 쓰인다.

```csharp
Guid itemId = Guid.NewGuid();
Console.WriteLine(itemId);          // 예: 0d57629c-7d6e-4847-97cb-9e2fc25083fe
```

**방치형 RPG 서버에서는** 같은 종류라도 인스턴스가 다른 장비(강화 수치가 서로 다른 검 두 자루)를 구분하는 고유 ID로, 서버가 DB의 아이템 인스턴스 키로 쓸 수 있다.

### 3.6 동등성 비교: `==`, `Equals`, 참조 vs 값
**한 줄 요약:** 값 타입은 "내용이 같으면 같다", 클래스는 기본적으로 "같은 객체여야 같다".

> 📖 출처: C# 12 in a Nutshell 6장 "Equality Comparison — Value vs Referential Equality, Standard Equality Protocols" (텍스트 L23858-24190)

**핵심 설명**
- **값 동등성:** 값 타입(int, struct 등)의 기본. 구조체는 모든 멤버가 같으면 같다고 보는 "구조적 동등성"을 가지며, 이는 `Equals`를 호출할 때 확인된다.
- **참조 동등성:** 클래스의 기본. 내용이 같아도 서로 다른 객체면 `==`는 false. (원문 기준 예외: 익명 타입과 record는 재정의되어 있고, `string`과 `Uri`처럼 내용으로 비교하도록 만든 클래스도 있다.)
- `==`는 컴파일 시점에 결정된다. 그래서 `object x = 5, y = 5; x == y`는 **false**(박싱된 서로 다른 객체 비교)지만 `x.Equals(y)`는 true다.
- `object.Equals(a, b)`(정적)는 null에도 안전하다. `object.ReferenceEquals`는 무조건 참조 비교.
- `IEquatable<T>`를 구현하면 박싱 없이 빠르게 비교할 수 있다(성능 민감 코드).

```csharp
class Hero { public int Level; }

var a = new Hero { Level = 5 };
var b = new Hero { Level = 5 };
Console.WriteLine(a == b);        // False  (다른 객체)
var c = a;
Console.WriteLine(a == c);        // True   (같은 객체를 가리킴)
```

**방치형 RPG 서버에서는** `list.Contains(hero)`나 `Dictionary`의 키로 클래스를 쓸 때 "같다"의 기준이 참조라는 점을 알고 있어야 예상 밖 결과를 피한다. 그래서 키는 int/enum/Guid 같은 값 타입이나 string을 쓰는 것이 무난하다.

> 🔧 보충(책 외): 위 마지막 문장의 "무난하다"는 입문자를 위한 실용 조언이며 원문의 권고가 아니다.

## 코어 4. 컬렉션과 LINQ — 찾는 방식으로 고르고, 순회할 때 계산된다

> 원래 5장 "컬렉션: List, Dictionary, HashSet, Queue, Stack, 배열 선택 기준"과 6장 "LINQ 기초 (Where / Select / OrderBy / 합계 등)". 컨테이너를 고르는 기준은 "어떻게 찾을 건가"이고(4.1~4.5), 그 컨테이너 위에서 걸러 내고 정렬하고 합치는 도구가 LINQ다(4.6~4.8). LINQ의 결정적 원리는 지연 실행이다(4.9).

### 4.1 `List<T>` — 크기가 변하는 배열
**한 줄 요약:** 가장 많이 쓰는 컬렉션. 끝에 추가는 빠르고, 중간 삽입/삭제는 느리다.

> 📖 출처: C# 12 in a Nutshell 7장 "Lists, Queues, Stacks, and Sets — `List<T>` and ArrayList" (텍스트 L26494-26750), High-Performance Programming in C# and .NET 6장 "Deciding between using arrays or collections" (텍스트 L8420-8467)

**핵심 설명**
- 원문은 `List<T>`를 가장 흔히 쓰는 컬렉션으로 소개한다. 내부에 배열을 두고 꽉 차면 더 큰 배열로 교체한다.
- `Add`(끝 추가)는 효율적이고, `Insert`/`Remove`는 뒤 요소를 밀어야 해서 느릴 수 있다(특히 앞쪽).
- 인덱서 `list[0]`, `Count`, `RemoveAt`, `RemoveAll(조건)`, `foreach`를 지원한다.
- 정렬되지 않은 리스트에서 값 검색은 하나씩 확인해야 해서 느리다.
- 배열은 크기가 고정이고 가볍고 빠르다. `List<T>`는 자라고 줄 수 있고 메서드가 풍부하다(High-Performance Programming in C# and .NET의 비교 요지). C# 12 in a Nutshell은 `List<T>`가 비제네릭 `ArrayList`보다 박싱이 없어 빠르고 캐스트도 필요 없다고 설명하고, High-Performance Programming in C# and .NET은 `System.Collections` 대신 `System.Collections.Generic`의 컬렉션을 쓰라고 권한다.

```csharp
var inventory = new List<string>();
inventory.Add("Wooden Sword");
inventory.Add("Potion");
inventory.RemoveAll(item => item == "Potion");
Console.WriteLine(inventory.Count);      // 1
```

**방치형 RPG 서버에서는** 인벤토리, 파티 멤버, 스테이지 목록처럼 "순서 있는 목록"에 `List<T>`를 기본으로 쓴다.

### 4.2 `Dictionary<TKey,TValue>` — 키로 바로 찾기
**한 줄 요약:** 키를 주면 값을 매우 빠르게(O(1)) 찾는 사전.

> 📖 출처: C# 12 in a Nutshell 7장 "Dictionaries — `IDictionary<TKey,TValue>`, `Dictionary<TKey,TValue>` and Hashtable" (텍스트 L27230-27500)

**핵심 설명**
- 해시테이블 기반이라 키로 조회가 빠르다. `ContainsKey`는 빠르지만 `ContainsValue`는 느린 연산이다.
- `d[key] = value`는 없으면 추가, 있으면 **덮어쓰기**. `Add`는 같은 키가 있으면 예외.
- 없는 키를 `d[key]`로 읽으면 예외가 난다. 안전하게는 `TryGetValue`를 쓴다.
- 순회하면 `KeyValuePair`(Key, Value)가 나온다. `Keys`, `Values`로 한쪽만 볼 수도 있다.
- 문자열 키 대소문자를 무시하려면 `new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase)`.

```csharp
var itemPrice = new Dictionary<string, int>
{
    ["Potion"] = 50,
    ["Iron Sword"] = 300,
};

if (itemPrice.TryGetValue("Potion", out int price))
    Console.WriteLine($"포션 가격: {price}");
itemPrice["Potion"] = 60;                    // 가격 갱신
```

**방치형 RPG 서버에서는** 아이템 ID → 아이템 데이터(이름, 가격, 효과) 표를 `Dictionary`로 만들어 두면, 인벤토리에는 ID만 저장하고 필요할 때 조회할 수 있다.

### 4.3 `HashSet<T>` — 중복 없는 집합
**한 줄 요약:** 중복을 자동으로 무시하고, "들어 있나?" 확인이 빠른 컬렉션.

> 📖 출처: C# 12 in a Nutshell 7장 "`HashSet<T>` and `SortedSet<T>`" (텍스트 L27089-27189)

**핵심 설명**
- `Contains`가 해시 기반이라 빠르다. 같은 값을 다시 `Add`해도 조용히 무시된다.
- 위치(인덱스)로 접근할 수 없고 순서 보장도 없다. 정렬된 집합이 필요하면 `SortedSet<T>`.
- `UnionWith`(합집합), `IntersectWith`(교집합), `ExceptWith`(차집합) 같은 집합 연산이 있다.

```csharp
var unlockedSkills = new HashSet<string>();
unlockedSkills.Add("Fireball");
bool added = unlockedSkills.Add("Fireball");  // false, 이미 있음
Console.WriteLine(unlockedSkills.Contains("Fireball")); // true
```

**방치형 RPG 서버에서는** "해금한 스킬/업적/도감" 목록처럼 중복이 없어야 하고 자주 "가졌나?"를 확인하는 곳에 알맞다.

### 4.4 `Queue<T>`와 `Stack<T>` — 순서 규칙이 정해진 목록
**한 줄 요약:** Queue는 먼저 넣은 것부터(FIFO), Stack은 나중에 넣은 것부터(LIFO) 꺼낸다.

> 📖 출처: C# 12 in a Nutshell 7장 "`Queue<T>` and Queue", "`Stack<T>` and Stack" (텍스트 L26898-27067)

**핵심 설명**
- Queue: `Enqueue`(뒤에 넣기), `Dequeue`(앞에서 꺼내기), `Peek`(꺼내지 않고 보기), `Count`.
- Stack: `Push`, `Pop`, `Peek`, `Count`.
- 둘 다 인덱스로 접근하지 못한다. 내부는 배열이라 넣고 빼는 것이 매우 빠르다(내부 크기 조정 시점 제외).
- 비어 있을 때 `Dequeue`/`Pop`은 예외를 던지므로 `Count` 확인이 필요하다.

```csharp
var rewardQueue = new Queue<int>();
rewardQueue.Enqueue(100);      // 보상 지급 순서대로 쌓기
rewardQueue.Enqueue(250);
int next = rewardQueue.Dequeue();   // 100부터
```

**방치형 RPG 서버에서는** 순서대로 처리할 보상 지급 요청·작업 대기열에 Queue, 되돌릴 수 있는 처리 이력에 Stack을 쓸 수 있다.

### 4.5 무엇을 고를까 (선택 기준)
**한 줄 요약:** "어떻게 찾을 건가"로 고른다. 번호로 → List, 키로 → Dictionary, 중복 제거 → HashSet, 순서 규칙 → Queue/Stack.

> 📖 출처: High-Performance Programming in C# and .NET 6장 "Choosing the right collection" (텍스트 L8139-8198), C# 12 in a Nutshell 7장 (텍스트 L27230-27288)

| 하고 싶은 일 | 컬렉션 | 원문이 말하는 특징 |
|---|---|---|
| 키로 빠른 조회 | Dictionary | 조회·수정 O(1) |
| 중복 없는 집합 | HashSet | 조회·수정 O(1), 키=값인 사전과 비슷 |
| 인덱스로 접근, 순서 유지 | List | 인덱스 조회 O(1), 값으로 찾기 O(n) |
| 먼저 온 순서 처리 | Queue | FIFO |
| 나중에 온 것부터 처리 | Stack | LIFO |
| 키 순서로 정렬 유지 | SortedDictionary 등 | 조회 O(log n), 속도와 정렬의 절충 |

- 원문은 성능이 중요한 코드라면 `System.Collections`(비제네릭) 대신 `System.Collections.Generic`을 쓰고, 최종 선택은 벤치마크로 확인하라고 조언한다.

**방치형 RPG 서버에서는** 처음에는 List와 Dictionary 둘이면 대부분 해결된다. 나머지는 필요가 생길 때 꺼내 쓰면 된다.

### 4.6 LINQ란, 그리고 Where/OrderBy/Select 체인
**한 줄 요약:** LINQ는 컬렉션에 `.Where(...).OrderBy(...).Select(...)`처럼 메서드를 이어서 데이터를 걸러 내고 정렬하고 바꾸는 도구다(`using System.Linq;` 필요).

> 📖 출처: C# 12 in a Nutshell 8장 "LINQ Fundamentals — Getting Started, Fluent Syntax, Chaining Query Operators" (텍스트 L29025-29294)

**핵심 설명**
- LINQ는 `IEnumerable<T>`를 구현한 모든 컬렉션(배열, List 등)에 쓸 수 있다.
- `Where`(조건 걸러내기), `OrderBy`(정렬), `Select`(각 요소를 다른 모양으로 변환)는 표준 쿼리 연산자이고, 확장 메서드다.
- 원문은 이를 "컨베이어 벨트"에 비유한다. 데이터가 왼쪽에서 오른쪽으로 흘러 필터 → 정렬 → 변환 순으로 처리된다.
- 쿼리 연산자는 **원본을 바꾸지 않고** 새 시퀀스를 돌려준다.
- 인자로 받는 `n => n.Length >= 4` 같은 식이 람다식이다.
- 동일 기능을 `from ... where ... select ...` 형태로도 쓸 수 있으나(쿼리 구문), 이 책에서는 메서드 체인(fluent) 방식이 가장 기본이고 유연하다고 소개한다.

```csharp
using System.Linq;

var heroes = new List<(string Name, int Power)>
{
    ("Arin", 120), ("Bora", 80), ("Cody", 200),
};

var strongNames = heroes
    .Where(h => h.Power >= 100)          // 전투력 100 이상만
    .OrderByDescending(h => h.Power)     // 높은 순
    .Select(h => h.Name)                 // 이름만 뽑기
    .ToList();                           // Cody, Arin
```

**방치형 RPG 서버에서는** "장착 가능한 아이템만 골라 응답하기", "전투력 순으로 영웅 정렬" 같은 API 응답용 목록을 만들 때 자주 쓴다.

### 4.7 합계·평균·최대·개수 (집계)
**한 줄 요약:** `Sum`, `Average`, `Min`, `Max`, `Count`로 목록 전체를 한 줄로 요약한다.

> 📖 출처: C# 12 in a Nutshell 9장 "LINQ Operators — Aggregation Methods" (텍스트 L35953-36149), "MinBy and MaxBy" (L35925-35944)

**핵심 설명**
- `Count()`는 개수, 조건을 주면 조건에 맞는 개수(`Count(c => char.IsDigit(c))`).
- `Sum(선택식)`은 합계. 선택식으로 "무엇을 더할지" 지정한다(`names.Sum(s => s.Length)`).
- `Average`의 결과는 `double`(또는 decimal/float)이다. `int avg = ...Average()`는 컴파일 에러.
- `Min`/`Max`는 값 자체를, `MinBy`/`MaxBy`(.NET 6+)는 **그 값을 가진 요소**를 돌려준다. 같은 값이 여럿이면 첫 요소를 돌려준다.
- `Aggregate`는 직접 누적 방식을 정하는 고급 연산자다(seed + 누적식).
- 빈 시퀀스에 `MinBy`/`MaxBy`를 쓰면 요소 타입이 null 가능일 때는 null을, 아닐 때는 예외를 얻는다(원문 L35943-35944).
- `Sum`/`Average`는 숫자 타입(int, long, float, double, decimal)에 맞춰 만들어져 있고, `Min`/`Max`는 `IComparable<T>`를 구현한 타입이면 쓸 수 있다.

```csharp
long totalPower = heroes.Sum(h => (long)h.Power);       // 전투력 합계
double avgPower = heroes.Average(h => h.Power);         // 평균
var top = heroes.MaxBy(h => h.Power);                   // 가장 센 영웅 (Cody)
```

**방치형 RPG 서버에서는** "전체 영웅 공격력 합 = 총 DPS", "장비 옵션 합산"처럼 서버가 스탯을 합산해 검증·응답하는 곳에 쓴다.

> 🔧 보충(책 외): 원문은 `Sum`이 위에 나열한 숫자 타입에 맞춰져 있다고만 설명하며 `BigInteger`는 언급하지 않는다. `BigInteger`를 합칠 때는 `Aggregate(BigInteger.Zero, (a, b) => a + b)`처럼 쓸 수 있다(원문의 `Aggregate` seed 예제를 응용한 것).

### 4.8 하나 고르기·있는지 확인·자르기·정렬
**한 줄 요약:** `First`/`FirstOrDefault`, `Any`, `Take`, `OrderBy/ThenBy`, `ToDictionary`만 알아도 실전 대부분을 해결한다.

> 📖 출처: C# 12 in a Nutshell 9장 "Element Operators" (텍스트 L35833-35944), "Quantifiers" (L36300-36349), "Take/Skip" (L33198-33244), "Ordering" (L34988-35058), "ToDictionary" (L35769-35785)

**핵심 설명**
- `First`는 첫 요소(없으면 예외), `FirstOrDefault`는 없으면 기본값(int는 0, 클래스는 null). `Single`은 정확히 하나여야 하는 가장 까다로운 버전이다.
- `Any(조건)`은 조건에 맞는 요소가 **하나라도** 있는지, 인자 없이 쓰면 "비어 있지 않은지"를 본다. `Contains`는 특정 값 포함 여부.
- `Take(n)`은 앞에서 n개, `Skip(n)`은 앞 n개를 건너뛴다. 함께 쓰면 페이지 나누기가 된다.
- `OrderBy(...).ThenBy(...)`로 정렬 기준을 여럿 쓸 수 있다. 같은 키 사이의 순서는 `ThenBy`가 없으면 보장되지 않는다. `orderby`를 두 번 쓰면 안 된다는 경고도 원문에 있다(쿼리 구문).
- `ToList`, `ToArray`, `ToDictionary`는 결과를 **즉시** 컬렉션으로 만든다. `ToDictionary`의 키는 중복되면 안 된다(예외).

```csharp
bool hasLegend = items.Any(i => i.Rarity == Rarity.Legendary);
var top3 = heroes.OrderByDescending(h => h.Power).Take(3).ToList();
var byName = heroes.ToDictionary(h => h.Name);            // 이름 → 영웅
var boss = heroes.FirstOrDefault(h => h.Power > 1000);    // 없으면 기본값(여기서는 default 튜플)
```

**방치형 RPG 서버에서는** "상위 3명 응답", "전설 아이템 보유 여부 확인", "이름으로 찾기 쉽게 Dictionary 만들기"에 바로 쓴다.

### 4.9 지연 실행(Deferred Execution) 주의점
**한 줄 요약:** LINQ 쿼리는 "만들 때"가 아니라 "순회할 때" 실행된다. 결과를 고정하려면 `ToList()`.

> 📖 출처: C# 12 in a Nutshell 8장 "Deferred Execution" (텍스트 L29905-30031)

**핵심 설명**
- `Where`, `Select`, `OrderBy` 등 대부분의 연산자는 지연 실행이다. 쿼리를 만들고 나서 원본에 요소를 추가하면 그 요소도 결과에 반영된다.
- 순회할 때마다 다시 계산(재평가)된다. 비용이 큰 쿼리를 여러 번 순회하면 그만큼 반복된다.
- `Count`, `First` 같은 단일 값 연산자와 `ToArray`/`ToList`/`ToDictionary`/`ToHashSet`은 **즉시 실행**된다.
- 쿼리 결과를 "그 시점의 스냅샷"으로 얼려 두고 싶을 때 `ToList()`를 쓴다.

```csharp
var numbers = new List<int> { 1 };
var query = numbers.Select(n => n * 10);   // 아직 실행 안 됨
numbers.Add(2);
foreach (var n in query) Console.Write(n + "|");   // 10|20|
```

**방치형 RPG 서버에서는** 한 요청을 처리하는 동안 같은 LINQ 쿼리를 여러 번 순회하면 그만큼 반복 계산되므로, 한 번 `ToList()`로 고정해 두고 쓰는 편이 낫다.

> 🔧 보충(책 외): 요청이 많은 서버에서 LINQ를 반복하면 임시 객체가 생겨 GC 부담이 될 수 있다. 자세한 내용은 [제3부](03_제3부_메모리와_성능_기초.md) 참고.

## 코어 5. 경계 밖의 데이터 — JSON과 파일, 그리고 닫기

> 원래 7장 "JSON 직렬화 (API 요청/응답 본문)"와 8장 "파일 읽기·쓰기 기초 (저장 파일)". 프로세스 밖으로 나가는 데이터는 네트워크(JSON, 5.1)나 디스크(파일, 5.2~5.4)로 간다. 둘 다 "형식을 맞추고, 자원을 닫고, 받은 값은 다시 검증한다"가 공통 원리다.

### 5.1 System.Text.Json 개요와 JsonNode로 읽고 쓰기
**한 줄 요약:** JSON은 가볍고 읽기 쉬운 텍스트 형식이며, .NET은 `System.Text.Json`으로 이를 기본 지원한다.

> 📖 출처: C# 12 in a Nutshell 11장 "Working with JSON" — JsonNode, Making updates with JsonNode, Constructing a JsonNode DOM (텍스트 L40019-40052, L40555-40870)

**핵심 설명**
- 원문은 JSON을 XML의 대안으로 소개한다. XML의 고급 기능(네임스페이스, 스키마 등)은 없지만 단순하고 깔끔하다는 것이 장점이다.
- 예전에는 .NET에 JSON 지원이 없어 Json.NET 같은 외부 라이브러리를 썼고, 지금은 Microsoft의 내장 API가 처음부터 단순하고 매우 효율적으로 설계되었다고 소개한다.
- 이 책이 직접 다루는 도구는 세 가지다: `Utf8JsonReader/Writer`(앞으로만 읽고 쓰는 저수준), `JsonDocument`(읽기 전용 DOM), `JsonNode`(읽기/쓰기 DOM).
- **`JsonNode`**(.NET 6에서 추가)는 쓰기 가능한 DOM을 위해 만들어졌고 읽기에도 쓸 수 있다. `JsonNode.Parse(문자열)`로 읽고, 인덱서로 접근해 `(int)node["Level"]`처럼 캐스트로 값을 꺼낸다. 캐스트가 되는 타입은 숫자 타입, `char`, `bool`, `DateTime`, `DateTimeOffset`, `Guid`, `string`(과 nullable 버전)이다.
- `JsonObject`/`JsonArray`는 수정 가능하다. `node["Color"] = "White";` 처럼 값을 바꾸거나 추가하고, `ToJsonString()`으로 압축된 JSON 문자열을 얻는다(`ToString()`은 들여쓰기된 문자열).
- 객체 초기화 구문으로 JSON을 코드에서 직접 만들 수도 있다.
- 주의: `JsonDocument`는 풀링된 메모리를 쓰므로 사용 후 반드시 `Dispose`(`using`)해야 하고 읽기 전용이다. DOM을 수정해야 한다면 `JsonNode`가 더 낫다고 원문이 말하며, `JsonNode`는 해제할 필요가 없다.

```csharp
using System.Text.Json.Nodes;

var response = new JsonObject
{
    ["hero"] = "Arin",
    ["level"] = 12,
    ["gold"] = "123456789012345678901234567890",   // 아주 큰 수는 문자열로
    ["lastLoginUtc"] = DateTime.UtcNow.ToString("O"),
};
string json = response.ToJsonString();

JsonNode loaded = JsonNode.Parse(json);
int level = (int)loaded["level"];
```

**방치형 RPG 서버에서는** API 응답 본문(골드, 레벨, 마지막 접속 시각, 인벤토리)을 JSON 문자열로 만들어 내려 주고, 클라이언트가 보낸 요청 본문 JSON을 읽어 값을 꺼낸다. 클라이언트가 보낸 값은 조작되었을 수 있으므로 서버가 다시 검증한다.

> 🔧 보충(책 외): 원문은 클래스를 통째로 JSON으로 바꿔 주는 `JsonSerializer`를 이 책 본문에서 다루지 않고 온라인 부록으로 미룬다(L40049-40051). 실무에서는 요청/응답 본문을 클래스(DTO)로 다루며 아래처럼 `JsonSerializer`가 훨씬 간단하다(웹 프레임워크가 이 변환을 대신해 주는 경우도 많다).
> ```csharp
> using System.Text.Json;
> public class PlayerDto { public int Level { get; set; } public string Gold { get; set; } = "0"; public string LastLoginUtc { get; set; } = ""; }
>
> string json = JsonSerializer.Serialize(new PlayerDto { Level = 12, Gold = "1000" });
> PlayerDto data = JsonSerializer.Deserialize<PlayerDto>(json)!;
> ```
> 또 JSON 숫자는 표준 숫자 타입 범위에 맞춰 다뤄지므로, BigInteger 같은 매우 큰 수는 문자열로 주고받거나 저장했다가 `BigInteger.Parse`로 되돌리는 방식을 쓰는 것이 안전하다(이 부분도 책의 내용이 아닌 실용 조언이다).

> 🔧 보충(책 외): 서버 개발에서는 게임 데이터를 파일이 아니라 DB([제10부](10_제10부_EF_Core_데이터_접근.md))에 저장한다. 아래 5.2~5.4(원래 8장 "파일 읽기·쓰기 기초")는 선택 학습.

### 5.2 File 클래스로 통째로 읽고 쓰기
**한 줄 요약:** 작은 저장 파일은 `File.WriteAllText`, `File.ReadAllText` 한 줄씩이면 충분하다.

> 📖 출처: C# 12 in a Nutshell 15장 "FileStream — Shortcut methods on the File class" (텍스트 L49094-49168)

**핵심 설명**
- 한 번에 파일 전체를 다루는 정적 메서드: `ReadAllText`(문자열), `ReadAllLines`(문자열 배열), `ReadAllBytes`, `WriteAllText`, `WriteAllLines`, `WriteAllBytes`, `AppendAllText`(이어 쓰기, 로그에 좋음).
- `ReadLines`는 `ReadAllLines`와 달리 게으르게(lazy) 한 줄씩 읽어 메모리를 아낀다.
- `File.Exists(path)`로 파일이 있는지 확인한다(File 클래스 목록: L50731-50736).
- 파일명은 절대 경로 또는 "현재 디렉터리 기준" 상대 경로. 원문은 현재 디렉터리가 실행 파일 위치와 같다고 믿지 말라고 경고한다.
- `File.Create`는 기존 내용을 지우고, `File.OpenWrite`는 기존 내용을 유지한 채 앞에서부터 덮어써서 옛 내용이 섞일 수 있다.

```csharp
string path = "save.json";

File.WriteAllText(path, json);                 // 저장
if (File.Exists(path))
{
    string text = File.ReadAllText(path);      // 불러오기
    Console.WriteLine(text);
}
```

**방치형 RPG 서버에서는** 설정 파일이나 밸런스 데이터(JSON/CSV)를 읽어 들일 때 이 메서드들을 쓸 수 있다. 플레이어 데이터 저장은 DB가 맡는다.

### 5.3 Stream과 using — 닫는 습관
**한 줄 요약:** 파일 스트림은 다 쓰면 반드시 닫아야 하고, `using`이 그것을 자동으로 해 준다.

> 📖 출처: C# 12 in a Nutshell 15장 "Closing and Flushing" (텍스트 L49028-49050), "Stream Adapters — StreamReader/StreamWriter" (L49694-49850)

**핵심 설명**
- 스트림은 바이트만 다룬다. 글자를 읽고 쓰려면 `StreamReader`/`StreamWriter` 같은 어댑터를 덧씌운다.
- 스트림은 파일 핸들 같은 자원을 잡으므로 `using` 블록으로 감싸 사용 후 반드시 해제한다. `Dispose`와 `Close`는 같고, 여러 번 호출해도 오류가 없다.
- 파일 스트림 같은 스트림은 성능을 위해 내부 버퍼를 쓰므로, 쓴 데이터가 곧바로 파일에 반영되지 않을 수 있다. `Flush`가 버퍼를 즉시 기록하게 하고, 스트림을 닫을 때 `Flush`가 자동으로 호출된다.

```csharp
using (var writer = new StreamWriter("log.txt"))
{
    writer.WriteLine("Stage 1 cleared");
    writer.WriteLine("Boss defeated");
}   // 블록을 벗어나면 자동으로 닫힘
```

**방치형 RPG 서버에서는** 로그나 데이터 파일을 스트림으로 직접 쓸 때 `using`으로 감싸 두면 파일 핸들이 확실히 해제되고 버퍼도 기록된다.

### 5.4 앱 전용 저장 폴더
**한 줄 요약:** 경로는 `Path.Combine`으로 만들고, 설정·앱 데이터는 `Environment.GetFolderPath`로 얻는 앱 데이터 폴더 아래 앱 이름 폴더에 두는 것이 원문이 말하는 표준 방식이다.

> 📖 출처: C# 12 in a Nutshell 15장 "Path", "Special Folders" (텍스트 L51385-51474), "Specifying a filename" 경고 (L49159-49168)

**핵심 설명**
- `Path.Combine(폴더, 파일명)`은 구분자(`\` 또는 `/`)를 알아서 맞춰 준다.
- `Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)`(또는 `LocalApplicationData`)로 앱 데이터 폴더를 얻는다. 원문은 그 안에 **앱 이름의 하위 폴더**를 만들어 쓰는 것이 표준 방식이라고 안내한다.
- 폴더가 없으면 `Directory.CreateDirectory`로 만든다(원문은 `Directory.Exists`로 먼저 확인한 뒤 만든다). 원문은 대부분의 특별 폴더가 Unix 계열에서는 경로가 없다고도 언급한다.

```csharp
string dir = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "IdleRpg");
if (!Directory.Exists(dir))
    Directory.CreateDirectory(dir);             // 폴더가 없으면 만든다
string savePath = Path.Combine(dir, "save.json");
```

**방치형 RPG 서버에서는** 설정·로그 파일을 어디에 둘지 정해야 할 때 쓴다.

> 🔧 보충(책 외): 클라우드·컨테이너로 배포된 서버는 로컬 디스크가 인스턴스 재시작이나 확장 때 사라질 수 있고, 여러 서버가 디스크를 공유하지도 않는다. 그래서 플레이어 상태 같은 게임 데이터는 파일 경로가 아니라 DB에 저장하고, 파일은 설정·로그 정도에 쓰는 것이 일반적이다. 이 내용은 책의 내용이 아니다.

## 실무 적용

### 체크리스트
- [ ] 마지막 접속 시각·이벤트 시각은 서버 UTC로 저장하고, `DateTime`을 쓴다면 앱 전체를 UTC로 통일했다(Local과 Utc를 섞어 비교하지 않는다). 섞일 위험이 있으면 `DateTimeOffset`. → 코어 1
- [ ] 오프라인 보상은 클라이언트가 보낸 시각이 아니라 서버 시간만으로 계산하고, 음수 경과 시간은 0으로, 최대 시간(예: 8시간)으로 상한을 건다. 경과 시간은 `Total...` 프로퍼티로 읽는다. → 코어 1
- [ ] 서비스는 `DateTime.UtcNow`를 직접 부르지 않고 `TimeProvider`를 주입받는다(`AddSingleton(TimeProvider.System)`), 테스트는 `FakeTimeProvider.Advance`로 시간을 민다. → 코어 1
- [ ] 일일 초기화는 `TimeZoneInfo.ConvertTime`으로 게임 기준 시간대로 바꾼 뒤 `DateOnly`로 판정하고, 배포 이미지(chiseled 등)에 tzdata가 있는지 확인했다. 전 세계 서비스면 "같은 기준 시각"인지 "지역별 0시"인지 기획과 정했다. → 코어 1
- [ ] 클라이언트가 보낸 숫자 문자열은 `TryParse`로 검사하고 범위까지 확인한다. 저장·불러오기용 문자열 변환에는 `CultureInfo.InvariantCulture`를 지정한다. → 코어 2
- [ ] `(int)` 캐스트는 잘라내고 `Convert.ToInt32`는 은행가 반올림이라는 점을 알고 계산식을 고른다. 올림이 필요한 비용은 `Math.Ceiling`. → 코어 2
- [ ] `long`을 넘는 재화만 `BigInteger`로 두고(느리고 메모리를 더 씀), API 응답·JSON에서는 문자열로 내려 준다. → 코어 2·5
- [ ] 서버 코드에는 정적 `new Random()`을 공유하지 않고 `Random.Shared`를 쓴다. 토큰·비밀번호 초기화 코드·쿠폰 코드는 `RandomNumberGenerator`. → 코어 2
- [ ] 뽑기·드롭·강화 판정은 서버에서 굴리고, 확률표는 정수 가중치로 설정/DB에 두며, 결과를 DB에 기록한다. 확률 공개·기록 보관 의무를 운영 전에 확인했다. → 코어 2
- [ ] `Trim`·`Replace` 등의 결과를 변수에 받는다. 반복 결합은 `StringBuilder`. 문자열 키·ID 비교는 `OrdinalIgnoreCase`, 대소문자 변환은 `ToUpperInvariant/ToLowerInvariant`. → 코어 3
- [ ] enum은 DB·API에 문자열 이름이나 명시적 숫자로 저장하고, 들어온 값이 정의된 범위인지 따로 확인한다(enum은 런타임에 검증하지 않는다). → 코어 3
- [ ] 컨테이너 키·`Contains` 대상이 클래스라면 "같다"가 참조 비교라는 점을 의식한다. 키는 int/enum/Guid/string이 무난하다. → 코어 3
- [ ] 컬렉션은 "어떻게 찾을 건가"로 골랐다(번호 → List, 키 → Dictionary, 포함 검사 → HashSet, 순서 규칙 → Queue/Stack). 처음엔 List와 Dictionary 둘이면 대부분 해결되고, 최종 선택은 벤치마크로 확인한다. → 코어 4
- [ ] Dictionary에서 없을 수 있는 키는 `TryGetValue`로 읽고, `Dequeue`/`Pop` 전에 `Count`를 확인한다. → 코어 4
- [ ] 한 요청에서 여러 번 순회하는 LINQ 쿼리는 `ToList()`로 고정한다. `Average`는 double로 받고, `First` 대신 없을 수 있으면 `FirstOrDefault`, 정렬 동률은 `ThenBy`. → 코어 4
- [ ] `JsonDocument`와 스트림은 `using`으로 감싸 해제한다. 클라이언트가 보낸 JSON 값은 서버가 다시 검증한다. → 코어 5
- [ ] 플레이어 데이터는 파일이 아니라 DB에 둔다(컨테이너 로컬 디스크는 사라질 수 있고 서버끼리 공유되지 않는다). 파일 경로는 `Path.Combine`으로, 현재 디렉터리를 실행 파일 위치로 가정하지 않는다. → 코어 5

### 시나리오로 확인하기
1. **상황:** 한국 서비스의 일일 퀘스트가 자정이 아니라 한국 시각 오전 9시에 초기화된다는 문의가 들어왔다. 코드는 `DateOnly.FromDateTime(DateTime.UtcNow)`를 마지막 초기화 날짜와 비교하고 있다. (C++ 서버에서 `gmtime`의 날짜를 그대로 "오늘"로 쓰던 습관이다.)
   **질문:** 원인은 무엇이고 어떻게 고쳐야 하나? 테스트는 어떻게 하나?

   <details markdown="1"><summary>답 확인</summary>

   UTC 날짜는 UTC 0시에 바뀌고, UTC 0시는 한국 시각 오전 9시다(한국 0시 = UTC 15:00). 저장·비교는 UTC로 두되 "오늘이 며칠인가"를 정할 때만 `TimeZoneInfo.ConvertTime(time.GetUtcNow(), Kst)`로 게임 기준 시간대(`"Asia/Seoul"`)로 바꾸고 `DateOnly`로 판정한다. "지금"은 주입받은 `TimeProvider`에서 얻고, 테스트에서는 `FakeTimeProvider`로 UTC 14:59 → 15:00을 만들어 초기화 여부를 확인한다. 배포 이미지에 tzdata가 없으면 `FindSystemTimeZoneById`가 예외를 던질 수 있다. → 코어 1 (1.3)

   </details>

2. **상황:** 부하 테스트에서 뽑기 결과가 갑자기 전부 `common`만 나온다. 코드는 `static readonly Random rng = new Random();`를 모든 요청이 공유한다. (C++ 서버라면 메인 로직 스레드 하나에서만 굴려서 문제가 없던 패턴이다.)
   **질문:** 왜 이런 일이 생기고, 어떻게 고쳐야 하나? 같은 코드로 쿠폰 코드를 만들어도 되나?

   <details markdown="1"><summary>답 확인</summary>

   웹 서버는 요청을 여러 스레드에서 동시에 처리하는데 `Random`은 스레드 안전하지 않다. 여러 스레드가 동시에 `Next`를 부르면 내부 상태가 깨져 0만 계속 나올 수 있고, 가중치 뽑기에서 r = 0이면 항상 첫 구간(`common`)이 뽑힌다. `Random.Shared`(.NET 6, 스레드 안전, 잠금 경합 없음)로 바꾼다. 쿠폰 코드·토큰처럼 추측되면 안 되는 값은 `Random`이 아니라 `RandomNumberGenerator`로 만든다. → 코어 2 (2.4, 2.5)

   </details>

3. **상황:** C++에서 `price = itemPrice[id];`처럼 `unordered_map`을 읽던 습관대로 C#에서 `int price = itemPrice[request.ItemId];`를 썼다. 클라이언트가 없는 아이템 ID를 보내자 요청이 실패한다.
   **질문:** C++과 무엇이 다르고, 어떻게 써야 하나?

   <details markdown="1"><summary>답 확인</summary>

   C++ `unordered_map::operator[]`는 없는 키를 읽으면 기본값을 삽입하고 돌려주지만, C# `Dictionary`는 없는 키를 `d[key]`로 읽으면 예외가 난다. 없을 수 있는 키는 `TryGetValue`로 읽고 false면 "잘못된 요청"으로 응답한다. 반대로 쓰기 `d[key] = value`는 없으면 추가, 있으면 덮어쓰기이고, `Add`는 같은 키가 있으면 예외다. 클라이언트가 보낸 ID는 조작되었을 수 있으므로 항상 서버가 검증한다. → 코어 4 (4.2), 코어 2 (2.1의 보충)

   </details>

4. **상황:** 랭킹 API가 `var ranked = heroes.Where(h => h.Power >= 100).OrderByDescending(h => h.Power);`를 만든 뒤 `ranked.Count()`로 총 수를 넣고, 다시 `ranked`를 순회해 목록을 넣는다. 그 사이 다른 코드가 `heroes`에 영웅을 추가하자 총 수와 목록 길이가 다르게 나오고, 프로파일러에는 정렬이 두 번 찍힌다.
   **질문:** 원인과 해결책은?

   <details markdown="1"><summary>답 확인</summary>

   `Where`·`OrderBy`는 지연 실행이라 쿼리는 순회할 때마다 원본의 현재 상태로 처음부터 다시 계산된다. `Count()`(즉시 실행)와 이후 순회가 각각 따로 실행되어 정렬이 두 번 돌고, 그 사이 원본에 추가된 요소가 뒤쪽 결과에만 반영됐다. 쿼리를 한 번 `ToList()`로 스냅샷을 만들어 두고 그 리스트의 `Count`와 요소를 쓴다. 반복되는 LINQ는 임시 객체로 GC 부담도 될 수 있다. → 코어 4 (4.9)

   </details>

5. **상황:** C++에서 `std::ofstream`은 스코프를 벗어나면 소멸자가 닫아 주므로, C#에서도 `var w = new StreamWriter("log.txt"); w.WriteLine("Boss defeated");`만 쓰고 끝냈다. 파일이 비어 있거나 다른 곳에서 파일을 열 수 없다는 오류가 난다.
   **질문:** 무엇이 RAII와 다르고, 어떻게 고쳐야 하나? 이 파일에 플레이어 세이브를 저장해도 되나?

   <details markdown="1"><summary>답 확인</summary>

   스트림은 내부 버퍼를 써서 쓴 데이터가 곧바로 파일에 반영되지 않을 수 있고, 파일 핸들 같은 자원을 잡고 있다. C#은 스코프를 벗어난다고 자동으로 닫히지 않으므로 `using` 블록(또는 `using` 선언)으로 감싸야 범위 끝에서 `Dispose`(= `Close`)가 불리고 그때 `Flush`도 자동으로 된다. 플레이어 데이터는 파일이 아니라 DB에 둔다. 컨테이너·클라우드의 로컬 디스크는 재시작·확장 때 사라질 수 있고 서버끼리 공유되지 않는다. → 코어 5 (5.3, 5.4)

   > 🔧 보충(책 외): `using`을 빠뜨리면 핸들은 GC가 객체를 정리하는 비결정적 시점까지 잡혀 있을 수 있고, `StreamWriter`의 버퍼에 남은 내용은 기록되지 않은 채 사라질 수 있다. C++ 소멸자와 C# finalizer는 호출 시점이 결정적이냐 아니냐가 다르다.

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
.NET 기본 라이브러리 — 서버가 유일한 기준 + 찾는 방식으로 고르기 + 순회할 때 계산
├─ 코어 1 시간
│   ├─ TimeSpan: Minutes vs ( ? )Minutes / 만드는 법 3가지(생성자, From..., 두 시각의 ( ? ))
│   ├─ DateTime(비교 시 Kind ( ? )) vs DateTimeOffset(같은 ( ? )이면 같음) / UtcNow
│   ├─ 오프라인 보상: 서버 UTC 저장 → 차이 → 음수는 ( ? ), 상한 ( ? )시간
│   └─ TimeProvider(GetUtcNow, 테스트 = ( ? )) / DateOnly / TimeZoneInfo("Asia/Seoul") / KST 0시 = UTC ( ? )시 / 컨테이너 ( ? ) 확인
├─ 코어 2 숫자와 난수
│   ├─ Parse(→ ( ? )Exception) vs TryParse / InvariantCulture / 캐스트(잘라냄) vs Convert(( ? ) 반올림)
│   ├─ Math: Floor·Ceiling·Round·Truncate·Max·Pow
│   ├─ BigInteger: 리터럴 ( 있음? 없음? ), double 캐스트 시 ( ? )
│   └─ Random: 재사용, 스레드 안전 ( O/X ) → Random.Shared / RandomNumberGenerator / 가중치 뽑기 알고리즘
├─ 코어 3 문자열과 동등성
│   ├─ 불변(Trim 결과를 ( ? )해야) / Split·Join / StringBuilder(Length=0 해도 ( ? ))
│   ├─ 비교 Ordinal vs Culture / == 는 ( ? ) + 대소문자 구분 / ToUpper____
│   ├─ Enum 변환(정수·문자열, Enum.Parse, 범위 검증 ( O/X )) / Guid(2^___)
│   └─ 동등성: 값 vs 참조, == 은 ( 컴파일? 런타임? ) 결정 / IEquatable<T>
├─ 코어 4 컬렉션과 LINQ
│   ├─ List / Dictionary(없는 키 읽기 → ( ? )) / HashSet / Queue / Stack / 선택표(O(1)·O(n)·O(log n))
│   └─ LINQ: Where·OrderBy·Select / Sum·Average(→ ( ? ) 타입)·MaxBy / First vs FirstOrDefault / Any / Take·Skip / 지연 vs 즉시
└─ 코어 5 경계 밖의 데이터
    ├─ JSON: Utf8JsonReader/Writer · JsonDocument(( ? ) 필수) · JsonNode(수정 가능) / 큰 수는 ( ? )로
    └─ (선택) File.ReadAllText / Stream + using + Flush / Path.Combine / 특별 폴더 / 게임 데이터는 ( ? )에
```

### 2. 인출 질문

1. `TimeSpan`의 `Minutes`와 `TotalMinutes`는 어떻게 다르고, 경과 시간 계산에는 무엇을 쓰나요?

   <details markdown="1"><summary>답 확인</summary>

   `Minutes`는 시계의 그 자리 숫자(2시간 30분이면 30), `TotalMinutes`는 전체를 분으로 환산한 double(150)이다. 경과 시간 계산에는 `Total...`을 쓴다. TimeSpan은 생성자, `FromHours` 등, 두 시각의 뺄셈으로 만든다. → 코어 1 (1.1)

   </details>

2. `DateTime`과 `DateTimeOffset`은 비교 방식이 어떻게 다른가요?

   <details markdown="1"><summary>답 확인</summary>

   `DateTime`은 시간대를 Local/Utc/Unspecified 표시로만 가지며 비교할 때 이 표시를 무시하고 틱 값만 비교한다. 그래서 Local과 Utc를 섞으면 틀린 결과가 나온다. `DateTimeOffset`은 UTC와의 차이를 함께 저장해 같은 순간이면 같다고 판단하며, 원문은 대부분 이쪽이 낫다고 한다. `DateTime`을 쓰려면 앱 전체를 UTC로 통일해야 한다. → 코어 1 (1.2)

   </details>

3. 오프라인 보상 계산의 기본 골격과, 서버가 추가로 해야 할 방어는?

   <details markdown="1"><summary>답 확인</summary>

   마지막 접속 시각을 서버 UTC로 DB에 저장 → 다음 요청 때 `UtcNow - lastSaved`로 TimeSpan 계산 → 보상 지급. 클라이언트 시계는 조작 가능하므로 서버 시간만 기준으로 하고, 음수 경과 시간은 0으로, 최대 시간(예: 8시간)으로 상한을 건다(보충). → 코어 1 (1.2)

   </details>

4. 서비스 코드에서 `DateTime.UtcNow`를 직접 부르면 왜 곤란하고, `TimeProvider`는 이를 어떻게 해결하나요?

   <details markdown="1"><summary>답 확인</summary>

   정적 프로퍼티라 바꿔 끼울 수 없어 "8시간 뒤", "자정 직전·직후"를 테스트하려면 실제로 기다리거나 PC 시계를 바꿔야 한다. `TimeProvider`(.NET 8)를 생성자로 주입받아 `GetUtcNow()`로 묻고, 운영에서는 `TimeProvider.System`, 테스트에서는 `FakeTimeProvider`의 `Advance`로 시계를 즉시 앞으로 민다. → 코어 1 (1.3)

   </details>

5. 한국 서비스의 일일 초기화는 어떻게 판정하고, 컨테이너 배포 시 주의점은?

   <details markdown="1"><summary>답 확인</summary>

   한국 0시는 UTC 15:00이다. 저장·비교는 UTC로 하되 "오늘이 며칠인가"를 정할 때만 `TimeZoneInfo.ConvertTime`으로 게임 기준 시간대(`"Asia/Seoul"`)로 바꾸고 `DateOnly`로 마지막 초기화 날짜와 비교한다. chiseled 같은 최소 리눅스 이미지에는 tzdata가 없을 수 있어 `FindSystemTimeZoneById`가 예외를 던질 수 있다. → 코어 1 (1.3)

   </details>

6. `Parse`와 `TryParse`의 차이, 문화권 문제, 캐스트와 `Convert`의 반올림 차이는?

   <details markdown="1"><summary>답 확인</summary>

   `int.Parse`는 실패 시 `FormatException`, `TryParse`는 false를 반환해 실패가 예상되면 더 빠르고 깔끔하다. Parse/ToString은 문화권 설정을 따르므로(독일에서 "1.234" = 1234) 저장용은 `CultureInfo.InvariantCulture`를 지정한다. `(int)d`는 소수를 잘라내고, `Convert.ToInt32(d)`는 짝수 쪽으로 반올림하는 은행가 반올림을 쓴다. → 코어 2 (2.1)

   </details>

7. `BigInteger`의 특징과 단점은?

   <details markdown="1"><summary>답 확인</summary>

   자릿수 제한 없이 정확한 정수를 다룬다(`System.Numerics`). 다른 정수 타입에서 암시적 변환되고 연산자가 모두 오버로딩되어 있지만, 리터럴이 없어 `Pow`나 `Parse`로 만들어야 하고, double로 캐스트하면 정밀도를 잃을 수 있다. 일반 정수보다 느리고 메모리를 더 써 필요한 재화에만 쓰는 편이 좋다(보충). → 코어 2 (2.3)

   </details>

8. 정적 `Random` 하나를 웹 서버에서 공유하면 생기는 문제와 해결책, 그리고 `RandomNumberGenerator`가 필요한 경우는?

   <details markdown="1"><summary>답 확인</summary>

   `Random`은 스레드 안전하지 않아 여러 스레드가 동시에 `Next`를 부르면 내부 상태가 깨져 0만 나오는 상태에 빠질 수 있다. .NET 6의 `Random.Shared`는 스레드 안전하고 잠금 경합도 없다. `Random`은 다음 값을 추측할 수 있으므로 토큰·비밀번호 초기화 코드·쿠폰 코드처럼 추측되면 안 되는 값은 `RandomNumberGenerator`로 만든다. → 코어 2 (2.4, 2.5)

   </details>

9. 가중치 뽑기 알고리즘을 설명하고, 확률을 정수 가중치로 두는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   모든 가중치의 합(예: 900 + 90 + 10 = 1000) 안에서 `Random.Shared.Next(total)`로 숫자 하나를 뽑고, 앞에서부터 "r이 이 가중치보다 작으면 당첨, 아니면 r에서 가중치를 빼고 다음 구간"으로 찾는다. 정수 가중치는 합이 정확히 맞고 기획 데이터로 관리하기 쉽다. 확률표는 설정이나 DB에 두고 결과는 기록한다. → 코어 2 (2.5)

   </details>

10. `s.Trim();`만 쓰고 결과를 받지 않으면 왜 아무 일도 일어나지 않나요? 반복문에서 문자열을 이어 붙일 때 무엇을 쓰나요?

    <details markdown="1"><summary>답 확인</summary>

    string은 불변이라 `Trim`, `Replace`, `Substring` 등은 원본을 바꾸지 않고 새 문자열을 반환하기 때문이다. 반복해서 이어 붙일 때는 수정 가능한 `StringBuilder`의 `Append`를 쓰고 마지막에 `ToString()`한다. `Length = 0`으로 비워도 내부 용량은 줄지 않는다. → 코어 3 (3.1, 3.2)

    </details>

11. `==`의 문자열 비교 방식과, 대소문자를 무시한 비교 방법은? `ToUpper` 대신 무엇을 권하나요?

    <details markdown="1"><summary>답 확인</summary>

    `==`와 인자 없는 `Equals`는 항상 Ordinal(글자 코드값) + 대소문자 구분이다. 대소문자 무시는 `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)`(정적 버전은 null에도 안전). `ToUpper/ToLower`는 문화권 설정 영향(터키의 i 문제)을 받으므로 `ToUpperInvariant/ToLowerInvariant`를 쓴다. 순서 비교에는 문화권 방식이 거의 항상 낫다. → 코어 3 (3.3)

    </details>

12. enum을 DB나 API에 저장할 때 주의점과, enum이 런타임에 검증하지 않는 것은?

    <details markdown="1"><summary>답 확인</summary>

    enum은 멤버·정수·문자열 세 모습으로 변환되며(`(int)`, `(Rarity)3`, `Enum.Parse`), 컴파일러가 검사할 뿐 런타임에 범위를 검증하지 않아 `(Rarity)999`도 만들어진다. 순서를 바꿔도 깨지지 않도록 문자열 이름이나 명시적 숫자로 저장하는 편이 안전하다(보충). → 코어 3 (3.4)

    </details>

13. `object x = 5, y = 5;`일 때 `x == y`와 `x.Equals(y)`의 결과와 그 이유는? 클래스를 Dictionary 키로 쓸 때 주의점은?

    <details markdown="1"><summary>답 확인</summary>

    `x == y`는 false, `x.Equals(y)`는 true다. `==`는 컴파일 시점에 결정되어 object끼리는 참조 비교(박싱된 서로 다른 객체)가 되고, `Equals`는 실제 타입의 값 비교를 한다. 클래스는 기본이 참조 동등성이라 내용이 같아도 다른 객체면 다르므로, 키는 int/enum/Guid 같은 값 타입이나 string이 무난하다. 빠른 비교는 `IEquatable<T>`. → 코어 3 (3.6)

    </details>

14. `List<T>`에서 빠른 연산과 느린 연산은? 배열과 비교하면?

    <details markdown="1"><summary>답 확인</summary>

    끝에 `Add`와 인덱스 조회는 빠르고, `Insert`/`Remove`(특히 앞쪽)는 뒤 요소를 밀어야 해서 느리며, 정렬되지 않은 리스트에서 값 검색은 O(n)이다. 배열은 크기가 고정이고 가볍고 빠르며, List는 자라고 줄며 메서드가 풍부하다. 비제네릭 `ArrayList`보다 박싱이 없어 빠르다. → 코어 4 (4.1)

    </details>

15. Dictionary에서 `d[key] = value`, `Add`, 없는 키 읽기는 각각 어떻게 동작하나요?

    <details markdown="1"><summary>답 확인</summary>

    `d[key] = value`는 없으면 추가, 있으면 덮어쓰기. `Add`는 같은 키가 있으면 예외. 없는 키를 `d[key]`로 읽으면 예외이므로 `TryGetValue`를 쓴다. `ContainsKey`는 빠르지만 `ContainsValue`는 느리다. → 코어 4 (4.2)

    </details>

16. HashSet, Queue, Stack의 핵심 특징과 공통 제약은?

    <details markdown="1"><summary>답 확인</summary>

    HashSet은 중복을 무시하고(`Add`가 false 반환) `Contains`가 빠르며 순서 보장·인덱스 접근이 없다(정렬은 `SortedSet`). Queue는 FIFO(`Enqueue`/`Dequeue`), Stack은 LIFO(`Push`/`Pop`)이며 둘 다 인덱스 접근이 불가하고, 비어 있을 때 `Dequeue`/`Pop`은 예외를 던져 `Count` 확인이 필요하다. → 코어 4 (4.3, 4.4)

    </details>

17. `Average`의 결과 타입, `Max`와 `MaxBy`의 차이, `First`와 `FirstOrDefault`의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    `Average`는 double(또는 decimal/float)이라 int로 받으면 컴파일 에러다. `Max`는 값 자체를, `MaxBy`(.NET 6+)는 그 값을 가진 요소를 돌려준다. `First`는 없으면 예외, `FirstOrDefault`는 없으면 기본값(int는 0, 클래스는 null)이며, `Single`은 정확히 하나여야 한다. → 코어 4 (4.7, 4.8)

    </details>

18. LINQ의 지연 실행이란 무엇이고, 즉시 실행되는 연산자는? 서버에서 왜 `ToList()`로 고정하나요?

    <details markdown="1"><summary>답 확인</summary>

    `Where`, `Select`, `OrderBy` 등은 만들 때가 아니라 순회할 때 실행되어, 쿼리 생성 후 원본에 추가한 요소도 반영되고 순회할 때마다 재평가된다. `Count`, `First` 같은 단일 값 연산자와 `ToArray/ToList/ToDictionary/ToHashSet`은 즉시 실행된다. 한 요청에서 같은 쿼리를 여러 번 순회하면 반복 계산되므로 `ToList()`로 스냅샷을 만들어 쓴다. → 코어 4 (4.9)

    </details>

19. 책이 다루는 JSON 도구 세 가지와, `JsonDocument`와 `JsonNode`의 차이는? 아주 큰 수는 JSON으로 어떻게 주고받나요?

    <details markdown="1"><summary>답 확인</summary>

    `Utf8JsonReader/Writer`(앞으로만 읽고 쓰는 저수준), `JsonDocument`(읽기 전용 DOM), `JsonNode`(읽기/쓰기 DOM, .NET 6). `JsonDocument`는 풀링된 메모리를 써서 반드시 `Dispose`해야 하고 읽기 전용이며, `JsonNode`는 수정 가능하고 해제가 필요 없다. 클래스 통째 변환은 `JsonSerializer`(보충). BigInteger 같은 큰 수는 문자열로 주고받고 `BigInteger.Parse`로 되돌리는 편이 안전하다(보충). → 코어 5 (5.1)

    </details>

20. 스트림을 `using`으로 감싸야 하는 이유와 `Flush`의 역할은? 서버에서 플레이어 데이터를 파일에 저장하지 않는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    스트림은 파일 핸들 같은 자원을 잡으므로 사용 후 반드시 해제해야 하고(`Dispose` = `Close`, 여러 번 호출해도 됨), 내부 버퍼 때문에 쓴 데이터가 즉시 파일에 반영되지 않을 수 있어 `Flush`가 즉시 기록하며 닫을 때 자동 호출된다. 클라우드·컨테이너 서버의 로컬 디스크는 재시작·확장 때 사라질 수 있고 서버끼리 공유되지 않으므로 게임 데이터는 DB에 둔다(보충). → 코어 5 (5.3, 5.4)

    </details>

21. (C++ 비교) `std::unordered_map`, `std::queue`, C++20 view에 익숙한 사람이 C#의 `Dictionary` 인덱서 읽기, `Queue.Dequeue`, LINQ에서 각각 놀라게 되는 점은?

    <details markdown="1"><summary>답 확인</summary>

    `unordered_map::operator[]`는 없는 키를 읽으면 기본값을 삽입하지만 C# 인덱서 읽기는 예외다(`TryGetValue` 사용). `queue::pop`은 값을 돌려주지 않고 빈 큐에서는 UB지만, `Dequeue`는 값을 돌려주고 비어 있으면 예외를 던진다(`Count` 확인). LINQ는 view처럼 순회할 때 계산되고 순회할 때마다 다시 계산되며, 원본 컬렉션을 참조로 잡고 있어 쿼리를 만든 뒤 추가한 요소도 반영된다. 고정하려면 `ToList()`. → 코어 4

    </details>

22. (C++ 비교) C++에서 `mt19937`을 스레드마다 `thread_local`로 두던 이유와, C# 서버에서 같은 목적으로 쓰는 것은? `std::discrete_distribution`에 해당하는 것은?

    <details markdown="1"><summary>답 확인</summary>

    난수 엔진은 내부 상태를 가지므로 여러 스레드가 공유하면 깨진다. C#의 `Random`도 스레드 안전하지 않으며, 서버 코드에서는 스레드 안전하고 잠금 경합이 없는 `Random.Shared`(.NET 6)를 쓴다. 가중치 뽑기는 BCL에 대응 도구가 없어, 정수 가중치 합 안에서 `Random.Shared.Next(total)`로 하나 뽑고 앞에서부터 구간을 빼 가며 찾는 코드를 직접 짠다. → 코어 2 (2.5)

    </details>

### 3. 기억 고리

- **C++ 유추:** `List`/`Dictionary`/`HashSet`/`Queue`/`Stack` ≈ `vector`/`unordered_map`/`unordered_set`/`queue`/`stack`. ⚠️ 깨지는 곳: 없는 키 읽기는 삽입이 아니라 예외, 빈 `Dequeue`/`Pop`은 UB가 아니라 예외, 클래스 요소는 객체가 아니라 참조가 담긴다.
- **C++ 유추:** LINQ ≈ C++20 ranges view(지연, 원본 불변, 순회마다 재계산). ⚠️ 깨지는 곳: 열거자·람다가 힙에 할당되어 GC 부담이 될 수 있고, 결과 고정은 `ToList()`.
- **C++ 유추:** `TimeSpan`/`DateTime` ≈ `chrono::duration`/`time_point`. ⚠️ 깨지는 곳: `DateTime`은 Local과 Utc를 섞어도 컴파일되고 비교 시 Kind를 무시해 조용히 틀린다. 시계 교체는 템플릿 인자가 아니라 `TimeProvider` 주입.
- **C++ 유추:** 클래스 변수의 `==` ≈ 포인터 비교. ⚠️ 깨지는 곳: `==`는 컴파일 시점 타입으로 결정되어 `object`로 박싱된 `5 == 5`는 false이고, string·record는 내용 비교로 재정의되어 있다.
- **C++ 유추:** `using` ≈ RAII. ⚠️ 깨지는 곳: `using`을 써야만 범위 끝에서 닫힌다.
- **비유:** LINQ 쿼리 = 컨베이어 벨트 설계도(원문 비유). 설계도를 만든다고 물건이 흐르지 않고, `foreach`나 `ToList()`로 스위치를 켤 때 흐른다. ⚠️ 비유가 깨지는 지점: 실제 벨트와 달리 스위치를 켤 때마다 원본 창고(원본 컬렉션)의 **현재** 재고로 처음부터 다시 돌린다 — 결과를 고정하려면 `ToList()`로 상자에 담아 둬야 한다.
- **비유:** `TimeProvider` = 벽시계를 직접 보지 않고 "시계 담당자"에게 지금 몇 시냐고 묻는 것. 테스트에서는 담당자를 `FakeTimeProvider`로 바꿔 시간을 마음대로 빨리 감는다. ⚠️ 깨지는 지점: 담당자를 바꿔도 코드 안에 `DateTime.UtcNow`를 직접 부르는 곳이 남아 있으면 그 부분은 여전히 진짜 시계를 본다.
- **묶음(3의 법칙):** 시간 3층 — 저장·비교는 UTC / "지금"은 TimeProvider / "오늘"은 게임 시간대 + DateOnly. 난수 3단계 — `new Random(seed)`(재현) / `Random.Shared`(서버 기본) / `RandomNumberGenerator`(보안). JSON 도구 3종 — Reader/Writer / JsonDocument / JsonNode.
- **대칭·순서:** List(번호) ↔ Dictionary(키) ↔ HashSet(있나?) / Queue FIFO ↔ Stack LIFO / `Parse`(예외) ↔ `TryParse`(false) / 지연 실행(Where·Select) ↔ 즉시 실행(ToList·Count·First) / `First`(예외) ↔ `FirstOrDefault`(기본값) / 캐스트(잘라냄) ↔ `Convert`(은행가 반올림).
- **결정적 지식 두 개:** ① 서버가 시간과 확률의 유일한 기준이다 — 클라이언트 시계·값을 믿지 않는다는 원칙 하나로 UTC 기준 오프라인 보상, 경과 시간 상한/음수 방어, `TimeProvider` 주입, 서버 측 `Random.Shared` 뽑기와 기록, `TryParse` 검증이 모두 설명된다. ② 지연 실행 — 순회할 때 계산된다는 원리로 원본 변경 반영, 반복 순회 시 재계산 비용, `ToList` 스냅샷의 필요, 즉시 실행 연산자의 구분이 설명된다.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "방치형 서버가 오프라인 보상과 일일 초기화를 시간 조작 없이 정확하게 계산하는 방법"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "`unordered_map`처럼 `dict[key]`로 읽으면 왜 안 되는지, 왜 `mt19937` 하나 공유하듯 `static Random`을 공유하면 안 되는지, LINQ가 ranges view와 무엇이 같고 다른지"를 3분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "재화는 BigInteger로 두어야 한다(long 한계 없음, 정확한 정수)" vs B "필요한 곳이 아니면 long이 낫다(BigInteger는 느리고 메모리를 더 쓰며 JSON·DB에서 문자열 변환이 필요)" — 양쪽을 번갈아 변호해 보세요. 추가 라운드: A "`DateTime`을 UTC로 통일하면 충분" vs B "`DateTimeOffset`이 낫다".
- **AI 역할 반전:** "내가 LINQ의 지연 실행과 즉시 실행, 그리고 서버에서 ToList()로 고정하는 이유를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 5개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

## 작성 메모

**목차 8개 항목을 모두 다뤘다.** 근거 위치는 각 절 제목 아래 `📖 출처`에 있다. 책에 정확히 대응하지 않아 조정한 부분은 다음과 같다. (괄호 안의 장 번호는 재구성 전 이 부 안의 장 번호이고, 화살표 뒤가 지금 위치다.)

1. **JSON 직렬화 (7장 → 코어 5의 5.1):** 지시받은 C# 12 in a Nutshell 11장 범위(L38863~L40897)에는 `Utf8JsonReader/Writer`, `JsonDocument`, `JsonNode`만 있고, 클래스를 자동 변환하는 `JsonSerializer`는 "온라인 부록에서 다룬다"고 쓰여 있다(L40049-40051). 그래서 본문은 책의 `JsonNode` 중심으로 쓰고, `JsonSerializer` 예제는 `🔧 보충(책 외)`로 분리했다. 목차 항목 자체(저장/불러오기)는 유지했다.
2. **파일 읽기·쓰기 (8장 → 코어 5의 5.2~5.4):** C# 12 in a Nutshell 15장의 `File` 단축 메서드(L49132-49157), `using`/Flush(L49028-49050), `StreamReader/Writer`(L49694 이후), `Path`/`SpecialFolders`(L51385-51474)를 근거로 썼다. 서버에서는 저장을 DB로 하므로 이 장은 선택 학습이며, 서버 배포 환경의 파일 저장 한계는 책에 없어 보충으로만 표시했다.
3. **LINQ (6장 → 코어 4의 4.6~4.9):** 8·9장 중 기초 연산자만 골랐다. Join, GroupBy, 쿼리 구문 상세, EF Core/IQueryable, PLINQ는 제외했다(목차의 제외 항목에 따름).
4. **컬렉션 (5장 → 코어 4의 4.1~4.5):** High-Performance Programming in C# and .NET 6장에서는 "Choosing the right collection"(L8139-8198)과 배열 vs 컬렉션 비교(L8420-8467)만 사용했다. BenchmarkDotNet, DB 샘플, IEnumerable vs IEnumerator 부분은 입문 범위를 벗어나 제외했다.
5. **BigInteger 관련:** BigInteger를 게임 단위 표기(K, M, aa)로 바꾸는 방법, JSON에서 큰 수 저장 방식은 책에 없어 모두 보충으로 표시했다.
6. **오프라인 보상 계산:** 책의 근거는 `TimeSpan`, `DateTime.UtcNow`, 두 시각의 뺄셈뿐이다. 최대 시간 제한과 시계 조작 방어 코드는 보충으로 표시했다.
7. **서버 관점 조정:** 프로젝트가 HTTP 웹 백엔드(게임 서버)로 확정되어, 각 절의 연결 문장과 보충을 서버 전제(서버 시간 UTC 기준 오프라인 보상, 클라이언트 조작 불신, API 요청/응답 JSON, DB 저장)로 고쳤다. 📖 출처 설명은 바꾸지 않았다.
8. 제외한 대표 항목: 정규식, 텍스트 인코딩 상세, Calendar, TimeZoneInfo 상세(서머타임 규칙, 사용자 지정 시간대 등), 서식 문자열 표, XmlConvert, 특수 컬렉션(BitArray, LinkedList 상세, 불변/동시성 컬렉션), 파일 압축·암호화·FileSystemWatcher.
9. **doc 폴더 기반 보강(2-3, 3-5 → 지금 1.3, 2.5):** 11권에 근거가 없지만 서버에 꼭 필요한 `TimeProvider`·`DateOnly`·일일 초기화용 시간대 변환, `Random.Shared`·가중치 뽑기를 doc 폴더의 C# Complete Guide(37장, 39장)를 근거로 추가했다. 두 절 전체가 책 외 내용이므로 `📚 참고(doc, 책 외)`로 표시했고, 예제는 .NET 8에서 실행해 확인했다.

---

# 제6부. 비동기와 시간 흐름

> **🎮 게임 서버 개발자에게** — `async`/`await`는 C++에서 IOCP로 하던 일, 즉 "I/O를 걸어 두고 스레드는 다른 일을 하다가 완료 통지가 오면 워커 스레드에서 이어 처리"를 언어가 대신 해 주는 것이다. 완료 콜백과 상태 저장을 직접 짜는 대신, 컴파일러가 메서드를 C++20 코루틴처럼 상태 기계로 바꿔 지역 변수까지 보존해 준다. 결정적으로 다른 점은 `Task`가 `std::future`처럼 결과·예외를 운반하지만 대개 **이미 실행 중**이고, `.Result`로 막아 기다리는 순간 이 모든 이점이 사라진다는 것이다. 공유 상태 보호는 익숙한 그대로지만, C# `lock`은 재진입 가능하고 그 안에서 `await`할 수 없다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 동시 접속이 늘자 DB 호출을 기다리는 요청 스레드가 묶여 다른 요청까지 밀린다 — 대기 구간을 `await` 없이 막고 있었다.
> - 같은 유저의 보상 API가 동시에 두 번 들어와 메모리의 골드가 한 번만 더해지거나 이중 지급됐다 — 공유 가변 상태를 `lock` 없이 `+=` 했다.
> - 점검 배포로 서버를 내릴 때 주기 작업 루프가 멈추지 않거나, 클라이언트가 끊었는데도 무거운 계산이 끝까지 돈다 — `CancellationToken`을 전달하지 않았다.

## 코어 — 이것만은 100%

> **한 문장:** 비동기(`async/await`)는 기다리는 동안 스레드를 놀리지 않고 풀어 주는 방법이라 서버 확장성의 핵심이며, `Task` 가 결과·예외·취소를 운반하므로 끝까지 `await` 하고(`.Result`·`async void` 회피), 여러 요청이 공유하는 가변 상태는 최소화하거나 `lock`/`SemaphoreSlim` 으로 보호하고, 주기 작업은 `PeriodicTimer` 나 `while + await Task.Delay` 로 만든다.

1. **스레드를 놀리지 않는다: 스레드풀과 async/await** — 동시성 = 멀티스레딩·병렬·비동기. 스레드는 비싸므로(약 1MB, 시작 수백 μs) 스레드풀(`Task.Run`)을 쓰고, `await` 는 미완료 작업을 만나면 메서드를 멈추고 스레드를 돌려준 뒤 완료 시 이어 달린다. "async 는 끝까지".
2. **Task가 운반한다: 예외·취소·진행** — `Task` 가 예외를 담아 `await` 지점에서 다시 던지고, `CancellationToken` 으로 취소를 협력적으로 전달하며, `IProgress<T>` 로 진행을 보고한다. `.Wait()`/`.Result` 는 교착 위험, `async void` 는 예외 처리에 좋은 해법이 없다.
3. **공유 상태를 지킨다: lock과 SemaphoreSlim** — 필드·static·캡처 변수는 스레드 간 공유되어 `x++` 도 안전하지 않다. `lock`(await 불가) 또는 `SemaphoreSlim(1).WaitAsync()` 로 보호하되, 최선은 공유 상태 자체를 줄이는 것이다. `lock` 은 한 프로세스 안에서만 유효하다.
4. **시간 흐름: 타이머와 주기 작업** — 주기 반복은 `Sleep` 스레드 대신 `PeriodicTimer`/`while + await Task.Delay`. 다중 스레드 타이머 콜백은 스레드 안전해야 하고, 잊힌 타이머는 누수 원인이다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| IOCP: overlapped I/O를 걸고 완료 통지를 워커 스레드가 받아 이어 처리 | `async`/`await` | I/O를 기다리는 동안 스레드를 붙잡지 않고, 완료되면 (보통 스레드풀의) 스레드에서 다음 처리를 이어 간다 | 완료 콜백·세션 상태 저장을 직접 짜지 않는다. 컴파일러가 메서드를 **상태 기계**(C++20 코루틴과 비슷)로 바꿔 지역 변수까지 보존한다. 이미 끝난 작업이면 멈추지 않고 그대로 진행한다. 이어 달리는 스레드는 컨텍스트에 따라 원래 스레드일 수도, 아닐 수도 있다 |
| `std::future` / `std::promise` | `Task` / `Task<T>` | 나중에 나올 결과 또는 예외를 담는 객체. 꺼낼 때 예외가 다시 던져진다 | `Task`는 보통 만들어질 때 **이미 실행 중**(hot)이다. `future.get()`처럼 `.Result`로 막아 기다리면 스레드를 낭비하고 교착까지 날 수 있다. `await`로 막지 않고 기다린다 |
| `std::thread`, 직접 만든 워커 스레드 풀 | 스레드풀 + `Task.Run` | 스레드 생성 비용 때문에 미리 만든 스레드를 재사용한다 | 런타임이 프로세스 공용 스레드풀을 관리한다. `new Thread()`는 낡은 방식이다. 요청 처리도 이 풀에서 돌므로, 막는(blocking) 코드는 다른 요청까지 밀어낸다 |
| `std::mutex` + `std::lock_guard` | `lock` 문 | 블록을 벗어나면(예외 포함) 자동으로 풀리는 상호 배제 | C# `lock`은 Monitor 기반이라 **같은 스레드가 다시 들어갈 수 있다**(재진입 가능, `std::mutex`는 불가라 `std::recursive_mutex`가 필요). `lock` 안에서는 `await` 불가. 잠금 객체로 `this`·`Type`·`string`을 쓰지 않는다 |
| 세마포어(`std::counting_semaphore`) | `SemaphoreSlim(1)` + `WaitAsync()` | 카운트 1이면 상호 배제로 쓸 수 있다 | **`await` 가능**: 기다리는 동안 스레드를 막지 않는다. 대신 재진입 불가이고, `finally`에서 `Release()`를 직접 짝 맞춰야 한다 |
| 종료 플래그(`std::atomic<bool> stop`), C++20 `std::stop_token` | `CancellationTokenSource` / `CancellationToken` | 요청하는 쪽과 확인하는 쪽이 분리된 협력적 취소. 확인하지 않는 코드는 멈추지 않는다 | 토큰을 `Task.Delay` 같은 비동기 API에 넘기면 대기 자체가 즉시 끝나고 `OperationCanceledException`으로 표현된다. 한 번 취소된 Source는 재사용 불가. 타임아웃도 같은 토큰으로 표현한다 |
| 서버 틱 루프 (`while(running){ Update(); Sleep(dt); }`) | `PeriodicTimer` / `while + await Task.Delay` | 일정 간격으로 같은 일을 반복한다 | 전용 스레드를 `Sleep`으로 붙잡지 않는다. `System.Threading.Timer` 콜백은 이전 콜백이 안 끝나도 다른 스레드에서 또 실행된다(중첩 가능). 방치형 서버에서는 유저별 틱 대신 요청 시점에 경과 시간으로 계산하는 것이 일반적이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요.
> 1. `await` 는 스레드를 "기다리게" 하는 걸까, "풀어 주는" 걸까? `Thread.Sleep` 과 `Task.Delay` 는 무엇이 다를까?
> 2. `.Result` 로 비동기 결과를 억지로 기다리면 무슨 일이 생길 수 있을까?
> 3. `async void` 메서드에서 던진 예외는 어디로 갈까?
> 4. `_gold++` 한 줄짜리 코드가 왜 여러 요청이 동시에 부르면 틀린 값을 만들까?
> 5. `lock` 은 서버가 여러 대일 때도 재화 이중 지급을 막아 줄까?
>
> **처리법:** 🛠 실습 `await Task.Delay`, `Task.Run`, `Progress<T>`, `CancellationTokenSource` + `ThrowIfCancellationRequested`, `lock`/`SemaphoreSlim.WaitAsync`, `PeriodicTimer.WaitForNextTickAsync` → 바로 실행 · 🗺 관계도 동시성 = 멀티스레딩·병렬·비동기 / Task ↔ 예외·취소·진행 보고 / 공유 상태 ↔ lock ↔ 타이머 콜백의 스레드 안전 · 📦 카드로 스레드 1개 ≈ 1MB·시작 수백 μs, 다중 스레드 타이머 정밀도 10~20ms, `OperationCanceledException`, `SemaphoreSlim(1)`

**학습 목표**
1. 스레드·스레드풀·비동기의 차이를 알고, "왜 await 를 쓰는가"를 설명할 수 있다.
2. `async/await`, `Task`, `Task.Delay`, `IProgress<T>`, `CancellationToken` 으로 서버의 전투 시뮬레이션·오프라인 보상 계산 같은 작업을 요청 스레드를 막지 않고 안전하게 만들 수 있다.
3. 여러 요청(스레드)이 같은 메모리 값(캐시, 정적 필드의 골드 등)을 건드릴 때의 위험과 `lock`, 그리고 타이머 대신 쓸 수 있는 `PeriodicTimer` 를 이해한다.

---

## 코어 1. 스레드를 놀리지 않는다 — 스레드풀과 async/await

> 이 코어의 질문: "기다리는 동안 스레드는 무엇을 하는가?" 스레드는 비싸므로 풀에서 재사용하고(1.1), 기다릴 때는 `await`로 스레드를 돌려준 뒤 완료되면 이어 달린다(1.2). 이 하나의 원리에서 GUI 반응성, 서버 확장성, `Task.Delay` vs `Sleep`, "async는 끝까지"가 모두 나온다.

### 1.1 동시성 개요: 스레드, 스레드풀, 왜 비동기인가

**한 줄 요약:** 동시성은 "한 번에 여러 일을 하는 것"이고, 비동기는 스레드를 놀리지 않고 기다리는 방법이다.

> 📖 출처: Concurrency in C# Cookbook 1장 "Introduction to Concurrency / Introduction to Asynchronous Programming" (텍스트 L396-547), C# 12 in a Nutshell 14장 "Threading", "The Thread Pool" (텍스트 L44413-44657, L45477-45552)

**핵심 설명**
- **동시성(Concurrency)** = 한 번에 하나 이상의 일을 하는 것. 그 방법이 여러 가지다.
  - **멀티스레딩**: 여러 실행 흐름(스레드)을 쓰는 방법.
  - **병렬 처리**: 일을 쪼개 여러 CPU 코어에 나눠 주는 방법.
  - **비동기 프로그래밍**: "시작해 두면 나중에 끝나는 작업"을 쓰되, 기다리는 동안 스레드를 붙잡지 않는 방법.
- **스레드**는 독립적으로 진행되는 실행 경로다. 한 프로세스 안의 여러 스레드는 메모리를 공유한다(이 "공유"가 3.1절의 위험 원인).
- 스레드를 새로 시작할 때마다 지역 변수용 스택 등을 준비하느라 수백 마이크로초가 들고, 스레드가 살아 있는 동안 약 1MB 메모리를 차지한다(C# 12 in a Nutshell). 그래서 미리 만들어 둔 스레드를 재활용하는 **스레드풀**이 있다. `Task.Run` 이 스레드풀에서 작업을 실행하는 가장 쉬운 방법이다.
- Concurrency in C# Cookbook 저자는 `new Thread()` 를 직접 쓰는 순간 이미 낡은 코드가 된다고 말하며, 더 높은 수준의 도구(Task, async)를 쓰라고 권한다.
- 비동기의 이점은 두 가지다. GUI 프로그램에서는 **반응성**(오래 걸리는 일을 기다리는 동안 UI 스레드를 풀어 주므로 화면이 멈추지 않음), 서버에서는 확장성이다. 둘 다 "스레드를 놀리지 않는다"는 같은 원리에서 나온다.

```csharp
// 스레드풀에서 무거운 계산을 실행 (호출한 요청 스레드는 자유)
int power = await Task.Run(() => CalculateTotalPower(heroes));
```

> 🔧 보충(책 외): 이 절의 "UI 스레드 반응성"은 서버에서는 "요청을 처리하는 스레드풀 스레드를 붙잡지 않는 것"(확장성)에 해당한다. ASP.NET Core 서버는 동시에 들어오는 많은 HTTP 요청을 소수의 스레드풀 스레드로 처리하므로, DB 조회나 외부 API 호출을 기다리며 스레드를 막으면 다른 요청이 밀린다. 그래서 대기 구간은 `await` 로 처리한다.

> 🔧 보충(책 외): 방치형 RPG 서버에서는 "1초마다 한 번 때리기" 같은 실시간 루프를 요청 하나가 붙들고 있기보다, 요청 시점에 경과 시간으로 결과를 계산하는 설계가 일반적이다. 요청 스레드에서 `Sleep` 하지 말고, 기다려야 할 때는 `await` 를 쓴다.

> 🔧 보충(책 외): **C++ 개발자 주의** — "요청마다 스레드 하나"로 블로킹 I/O를 하던 구조를 떠올리면 안 된다. ASP.NET Core의 요청 처리는 IOCP 워커 풀처럼 소수의 공용 스레드를 나눠 쓰는 구조에 가깝다. 그래서 한 요청이 스레드를 막으면 그 비용을 다른 요청이 치른다.

---

### 1.2 async/await 기본, Task, 반환 형태, Task.Delay

**한 줄 요약:** `async` 메서드 안에서 `await` 로 기다리면, 기다리는 동안 스레드는 다른 일을 하고 끝나면 이어서 실행된다.

> 📖 출처: Concurrency in C# Cookbook 1장 "Introduction to Asynchronous Programming" (텍스트 L527-733), Concurrency in C# Cookbook 2장 2.1 "Pausing for a Period of Time" (텍스트 L1304-1411), C# 12 in a Nutshell 14장 "Asynchronous Functions in C#" (텍스트 L46452-46630), "Tasks" (L45554-45600)

**핵심 설명**
- `async` 는 메서드에 붙이는 표시로, 그 안에서 `await` 를 쓸 수 있게 한다. 컴파일러가 메서드를 "여러 조각으로 나눈 상태 기계"로 바꿔 준다.
- `await` 를 만나면: 작업이 이미 끝났으면 그냥 계속 진행, 아직이면 메서드를 잠시 멈추고 호출자에게 돌아간다. 작업이 끝나면 멈춘 지점부터 이어 달린다. 지역 변수와 반복문 변수는 그대로 보존된다.
- **반환 형태**
  - 값이 없으면 `Task`, 값이 있으면 `Task<T>`.
  - 결과가 대부분 즉시 나오는 경우 할당을 줄이는 `ValueTask<T>` 도 있다.
  - `async void` 는 이벤트 핸들러가 아니면 피한다(2.1절).
- `Task.Delay(시간)` 은 "그 시간 뒤에 끝나는 Task"를 돌려준다. `Thread.Sleep` 과 달리 스레드를 막지 않는다.
- 대부분의 경우 await 이후 코드는 원래 컨텍스트(UI라면 UI 스레드)에서 이어진다.
- **"async 는 끝까지"**: `task.Wait()`, `.Result`, `GetAwaiter().GetResult()` 로 억지로 동기 코드에서 기다리면 교착(deadlock)이 날 수 있다. 원문 예에서는 UI 처럼 한 번에 스레드 하나만 들이는 컨텍스트에서 그렇다(호출 스레드가 컨텍스트를 막고 있어 await 이후가 재개되지 못함). async 를 쓰면 호출하는 쪽도 await 하도록 위로 퍼뜨린다.

```csharp
async Task AutoAttackLoopAsync(Hero hero, Monster monster)
{
    while (monster.Hp > 0)
    {
        monster.Hp -= hero.Damage;
        await Task.Delay(TimeSpan.FromSeconds(1)); // 1초 쉬기 (스레드는 안 막힘)
    }
}
```

> 🔧 보충(책 외): 서버에서 `async/await` 가 가장 흔히 쓰이는 곳은 컨트롤러 액션이 DB(`SaveChangesAsync` 등)나 외부 서비스(결제 검증 등)를 호출하며 기다리는 부분이다. 액션을 `async Task<IActionResult>` 로 만들고 호출 체인 전체를 `await` 로 이어 요청 스레드를 막지 않는다. 위 `while` + `await Task.Delay` 전투 루프는 문법 설명용 예제이며, 실제 서버에서는 요청 안에서 오래 도는 루프를 두지 않는 것이 보통이다.

> 🔧 보충(책 외): **C++ 개발자 주의** — `Task`는 `std::future`와 달리 대개 만들어진 순간 이미 실행 중(hot)입니다. `var t = SaveAsync();`만 써도 저장은 시작되며, `await t`는 "시작"이 아니라 "결과 기다리기"입니다. 또 ASP.NET Core에는 UI 같은 단일 스레드 동기화 컨텍스트가 없어 원문의 교착 시나리오가 그대로 재현되지는 않지만, `.Result`로 막으면 스레드풀 스레드를 붙잡아 부하 시 스레드풀 고갈(모든 요청 지연)로 이어질 수 있으므로 서버에서도 "async는 끝까지"를 지킵니다.

---

## 코어 2. Task가 운반한다 — 예외·취소·진행

> 이 코어의 질문: "시작해 둔 작업의 실패·중단·진척은 어떻게 돌아오는가?" 모두 `Task`와 그 주변 타입이 운반한다. 예외는 Task에 담겨 `await`에서 다시 던져지고(2.1), 취소는 토큰으로 협력적으로 전달되며(2.2), 진척은 `IProgress<T>`로 보고된다(2.3). 묶어서 "Task가 운반하는 3가지 = 결과 · 예외 · 취소".

### 2.1 예외 처리(async), async void 주의

**한 줄 요약:** `async Task` 의 예외는 `await` 하는 곳에서 평범한 `try/catch` 로 잡는다. `async void` 는 예외를 잡기 어렵다.

> 📖 출처: Concurrency in C# Cookbook 2장 2.8 "Handling Exceptions from async Task Methods" (텍스트 L2070-2170), 2.9 "Handling Exceptions from async void Methods" (텍스트 L2172-2281), Concurrency in C# Cookbook 1장 (텍스트 L540-545, L643-691)

**핵심 설명**
- async 메서드 안에서 던져진 예외는 **반환된 Task 에 담긴다**. 그 Task 를 `await` 하는 순간 다시 던져지므로 `try/catch` 로 자연스럽게 잡힌다. 원래의 스택 트레이스도 보존된다.
- Task 를 await 하지 않고 버리면 예외가 눈에 띄지 않을 수 있으니, 만든 Task 는 결국 await 한다.
- `Task.WhenAll` 처럼 여러 예외가 있을 수 있는 경우 await 는 첫 번째 예외만 다시 던진다.
- `async void` 는 예외를 담을 Task 가 없어서, 예외가 그 시점의 동기화 컨텍스트로 터진다. 원문의 결론: "좋은 해법이 없다". 가능하면 `Task` 를 반환하도록 바꾸고, 이벤트 핸들러처럼 어쩔 수 없을 때만 쓰며 **메서드 전체를 try 로 감싸서** 직접 처리하라고 권한다.

```csharp
async Task SaveAsync() { await Task.Delay(100); throw new InvalidOperationException("저장 실패"); }

async Task OnSaveClickedAsync()
{
    try { await SaveAsync(); }
    catch (InvalidOperationException) { Log("저장에 실패했어요"); }
}

// 이벤트 핸들러처럼 void 가 꼭 필요할 때: 통째로 try 로 감싼다
async void OnSaveEvent()
{
    try { await OnSaveClickedAsync(); }
    catch (Exception e) { Log(e); }
}
```

> 🔧 보충(책 외): 서버에서는 컨트롤러 액션과 서비스 메서드를 `async Task` 계열로 만들고 반드시 `await` 해서, DB·외부 호출의 예외가 요청 처리 흐름에서 잡히고 로그에 남게 한다. 결과를 기다리지 않고 버린 Task(fire-and-forget)나 `async void` 안의 예외는 응답과 무관하게 조용히 사라지거나 문제를 일으킬 수 있어 서버에서 특히 피한다. 요청과 별개로 돌아야 하는 주기 작업은 [제12부](12_제12부_백그라운드_서비스_캐시_외부호출.md)의 백그라운드 서비스에서 다루며, 거기서도 예외를 try/catch 로 로그에 남긴다.

---

### 2.2 취소: CancellationToken

**한 줄 요약:** 시작한 비동기 작업을 "이제 그만"이라고 멈추게 하는 표준 방법이 `CancellationToken` 이다.

> 📖 출처: Concurrency in C# Cookbook 10장 10.1~10.4 "Issuing Cancellation Requests / Responding by Polling / Canceling Due to Timeouts / Canceling async Code" (텍스트 L7790-8163), C# 12 in a Nutshell 14장 "Cancellation" (텍스트 L47867-48020)

**핵심 설명**
- 역할 분리: `CancellationTokenSource` 가 **취소를 요청**(`Cancel()`)하고, 그 `Token` 은 작업 쪽에 전달되어 **취소 여부를 확인만** 한다.
- 취소를 지원하려면 메서드가 `CancellationToken` 매개변수를 받고, 호출하는 비동기 API(예: `Task.Delay(시간, token)`)에 **그대로 전달**한다. 취소되면 `OperationCanceledException` 이 던져지고 대기가 즉시 끝난다.
- 반복문을 직접 돌리는 경우에는 주기적으로 `token.ThrowIfCancellationRequested()` 로 확인한다. 아주 빠른 루프라면 매번이 아니라 몇 번에 한 번만 확인해도 된다(예: `i % 1000 == 0`).
- 취소를 요청하는 순간 이미 끝나가던 작업은 확인 없이 정상 완료될 수도 있다(경쟁 상태). 취소 요청 뒤의 결과는 취소 예외, 정상 완료, 취소와 무관한 다른 예외 세 가지 중 하나다. 취소를 확인하지 않는 코드는 쉽게 멈출 수 없다.
- 한 번 `Cancel` 한 Source 는 영구히 취소 상태다. 다시 하려면 새로 만든다.
- 타임아웃도 취소의 한 종류다: `new CancellationTokenSource(TimeSpan.FromSeconds(5))` 또는 `CancelAfter`.
- 취소는 일종의 특수한 오류로 취급되어 `OperationCanceledException` 으로 표현된다. 그래서 호출하는 쪽에서 `try/catch (OperationCanceledException)` 로 받아 처리한다.

```csharp
CancellationTokenSource _battleCts;

async Task StartBattleAsync()
{
    _battleCts = new CancellationTokenSource();
    try
    {
        while (true)
        {
            hero.Attack(monster);
            await Task.Delay(1000, _battleCts.Token); // 취소되면 여기서 예외
        }
    }
    catch (OperationCanceledException) { /* 전투 중단: 정상 종료 */ }
}

void StopBattle()
{
    _battleCts?.Cancel();
}
```

> 🔧 보충(책 외): ASP.NET Core 에서는 클라이언트가 요청 도중 연결을 끊으면 그 사실이 `HttpContext.RequestAborted` 토큰으로 전달되고, 컨트롤러 액션에서 `CancellationToken` 매개변수로 받을 수도 있다. 이 토큰을 DB 호출이나 `Task.Delay` 에 그대로 넘기면, 응답받을 사람이 없는 작업을 중간에 멈춰 서버 자원 낭비를 줄일 수 있다. 다만 재화 차감처럼 중간에 끊기면 안 되는 작업은 취소 시점에 데이터가 어중간해지지 않도록 트랜잭션과 함께 설계해야 한다([제10부](10_제10부_EF_Core_데이터_접근.md)).

> 🔧 보충(책 외): 루프가 계속 돌면 아무도 받지 않는 작업이 서버 자원을 계속 쓴다. 원문 예제는 `using var cts` 로 Source 를 정리한다. 위 코드에서 `Dispose` 를 뺀 것은, 루프가 아직 토큰을 쓰는 중에 Source 를 정리하는 실수를 피하려는 단순화다.

---

### 2.3 진행 상황 보고 IProgress

> 🔧 보충(책 외): 서버 개발에서는 선택 학습

**한 줄 요약:** 오래 걸리는 작업이 `IProgress<T>.Report()` 로 진행률을 알리면, 호출한 쪽이 화면(UI)을 안전하게 갱신할 수 있다.

> 📖 출처: Concurrency in C# Cookbook 2장 2.3 "Reporting Progress" (텍스트 L1559-1621), C# 12 in a Nutshell 14장 "Progress Reporting", "`IProgress<T>` and `Progress<T>`" (텍스트 L48022-48132)

**핵심 설명**
- 작업 메서드는 `IProgress<T>` 를 매개변수로 받고 중간중간 `Report(값)` 를 호출한다. 호출하는 쪽은 `Progress<T>` 를 만들어 넘긴다.
- 왜 `Action` 콜백이 아니라 `Progress<T>` 인가? 콜백은 작업용 스레드에서 실행되어 UI를 건드리면 위험하다. `Progress<T>` 는 **만들어진 시점의 컨텍스트를 기억**했다가 그 컨텍스트에서 콜백을 실행한다. UI 스레드에서 만들면 콜백에서 UI를 바로 갱신해도 된다.
- 관례상 `IProgress<T>` 인자는 `null` 일 수 있으므로 `progress?.Report(...)` 로 부른다.
- `Report` 는 보통 비동기로 전달되므로 `T` 는 값 타입이나 불변 타입이 안전하다.
- 진행 보고를 지원하는 메서드는 취소도 함께 지원하는 것이 좋다(2.2절).

```csharp
Task CalculateOfflineRewardAsync(TimeSpan away, IProgress<double> progress = null)
{
    // Task.Run 으로 스레드풀에서 계산하므로 호출한 스레드(요청 스레드)는 막히지 않는다
    return Task.Run(() =>
    {
        int totalTicks = (int)away.TotalSeconds;
        for (int i = 0; i < totalTicks; i++)
        {
            // ... 한 틱 분량의 골드/경험치 계산 ...
            if (i % 1000 == 0) progress?.Report((double)i / totalTicks);
        }
        progress?.Report(1.0);
    });
}

// 호출 (진행률을 서버 로그로 남김)
var progress = new Progress<double>(p => logger.LogInformation("보상 계산 진행률 {Percent:P0}", p));
await CalculateOfflineRewardAsync(TimeSpan.FromHours(8), progress);
```

> 🔧 보충(책 외): 서버에서는 화면을 갱신할 UI가 없으므로 `IProgress<T>` 를 "서버 내부 작업의 진행 로그"를 남기는 용도로 생각하면 된다. 예를 들어 오래 걸리는 보상 재계산이나 데이터 이전 작업의 진행률을 로그에 기록하는 식이다. 일반적인 HTTP 요청 하나는 한 번의 응답으로 끝나므로, 진행률을 클라이언트에 계속 알려 주려면 별도 설계(상태 조회 API 등)가 필요하다.

---

## 코어 3. 공유 상태를 지킨다 — lock과 SemaphoreSlim

> 이 코어의 질문: "두 요청이 같은 골드를 동시에 고치면?" 스레드는 메모리를 공유하므로(1.1) 필드·static·캡처 변수는 `x++` 조차 위험하다. 보호 수단은 `lock`(동기)과 `SemaphoreSlim`(비동기)이지만, 최선은 공유 상태를 줄이는 것이고, `lock`은 한 프로세스 안에서만 통한다.

### 3.1 공유 상태 위험, lock, 스레드 안전 기초

**한 줄 요약:** 여러 스레드가 같은 변수를 동시에 고치면 값이 틀어진다. `lock` 으로 한 번에 한 스레드만 들어가게 막는다.

> 📖 출처: C# 12 in a Nutshell 14장 "Local Versus Shared State", "Locking and Thread Safety" (텍스트 L44657-44900), Concurrency in C# Cookbook 12장 12.1 "Blocking Locks", 12.2 "Async Locks" (텍스트 L9725-9896)

**핵심 설명**
- 지역 변수는 스레드마다 별도의 스택에 있어 안전하다. 그러나 **필드, static 변수, 람다로 캡처한 변수**는 스레드끼리 공유되어 위험하다.
- `x++` 조차 안전하지 않다. 내부적으로 "읽기 → 더하기 → 쓰기" 세 단계라서, 두 스레드가 동시에 하면 한 번만 증가할 수 있다. (원문 경고)
- 해결책: `lock (잠금객체) { ... }`. 한 스레드가 안에 있는 동안 다른 스레드는 대기한다. 이렇게 보호된 코드를 "스레드 안전(thread safe)"하다고 한다.
- 락 사용 지침(Concurrency in C# Cookbook): (1) 잠금 객체는 `private readonly object` 필드로 두고 밖에 노출하지 않는다. `lock(this)`, `Type` 이나 `string` 인스턴스에 대한 lock 금지(밖에서 접근 가능해 교착 위험). (2) 락이 무엇을 보호하는지 주석으로 적는다. (3) 락 안의 코드는 최소로. (4) 락 안에서 이벤트 호출 같은 "임의 코드"를 실행하지 않는다.
- `lock` 안에서는 `await` 를 쓸 수 없다. 비동기 코드에서는 `SemaphoreSlim(1)` 의 `WaitAsync()` 를 쓴다.
- 락은 만능이 아니고 교착(deadlock)을 만들 수도 있다. 가능하면 **공유 상태 자체를 줄이는 것**이 최선이다.
- 참고: UI 스레드에서 도는 async 메서드는 `await` 지점에서만 다른 코드에 끼어들 수 있어서(의사 동시성) 스레드 안전 문제가 훨씬 단순하다(C# 12 in a Nutshell L46740-46752).

```csharp
class Wallet
{
    private readonly object _lock = new object(); // gold 를 보호
    private long _gold;

    public void AddGold(long amount)
    {
        lock (_lock) { _gold += amount; }
    }
    public long Gold { get { lock (_lock) { return _gold; } } }
}

// 비동기 코드에서는 (아래 필드와 메서드는 클래스 안에 둔다):
private readonly SemaphoreSlim _mutex = new SemaphoreSlim(1);
async Task SpendAsync(long cost)
{
    await _mutex.WaitAsync();
    try { /* gold 확인 후 차감, await 사용 가능 */ }
    finally { _mutex.Release(); }
}
```

> 🔧 보충(책 외): 웹 서버에서는 여러 요청이 동시에 처리되므로, 캐시나 `static` 필드 같은 메모리 객체를 요청들이 함께 수정하면 위 `x++` 문제가 그대로 생긴다. 예를 들어 같은 유저의 골드를 담은 메모리 객체를 두 요청이 동시에 더하거나 빼면 값이 사라지거나, 재화가 이중 지급될 수 있다. 가장 쉬운 방법은 요청 간에 공유되는 가변 상태를 최소화하고(요청마다 지역 변수 사용), 재화의 진짜 원본은 메모리가 아니라 DB에 두는 것이다. `lock` 은 서버 한 대의 프로세스 안에서만 효과가 있고, 서버가 여러 대이거나 DB 데이터를 고치는 경우의 동시성은 `lock` 으로 해결되지 않는다. 이는 [제10부](10_제10부_EF_Core_데이터_접근.md)(DB 동시성)에서 다룬다.

> 🔧 보충(책 외): "공유 상태는 최소화하고 재화는 DB에서 관리한다"는 설계 규칙은 저자의 서술이 아니라 위 원문 개념(공유 상태 최소화)을 서버에 적용한 제안이다.

> 🔧 보충(책 외): **C++ 개발자 주의** — C# `lock`은 `Monitor` 기반이며 같은 스레드가 이미 잡은 락에 다시 들어갈 수 있습니다(재진입 가능). `std::mutex`를 같은 스레드에서 두 번 잠그면 정의되지 않은 동작이라 `std::recursive_mutex`가 필요했던 것과 다릅니다. 반대로 `SemaphoreSlim`은 소유 스레드 개념이 없어 재진입되지 않으므로, 이미 `WaitAsync`로 잡은 상태에서 같은 세마포어를 다시 기다리는 메서드를 호출하면 스스로 교착됩니다. 또 단순한 정수 증감은 C++ `std::atomic`처럼 `Interlocked.Increment`/`Interlocked.Add`로도 처리할 수 있지만, "골드 확인 후 차감"처럼 여러 단계가 한 덩어리여야 하는 경우는 락이 필요합니다.

---

## 코어 4. 시간 흐름 — 타이머와 주기 작업

> 이 코어의 질문: "1초마다 무언가를 하려면?" 전용 스레드를 `Sleep`으로 붙잡지 않고(코어 1의 원리), `PeriodicTimer`나 `while + await Task.Delay`로 반복하며, 취소 토큰으로 멈춘다(2.2). 다중 스레드 타이머 콜백은 공유 상태 문제(코어 3)를 그대로 안고 있다.

### 4.1 타이머

**한 줄 요약:** 일정 간격 반복은 타이머로 하되, 요즘은 `async` 루프나 `PeriodicTimer` 가 더 간단하다.

> 📖 출처: C# 12 in a Nutshell 21장 "Timers" (텍스트 L65731-66024; 12장 "Timers" L42274-42303 는 타이머 미해제 누수 언급)

**핵심 설명**
- 일정 간격 반복을 위해 스레드를 만들어 `Sleep` 하는 방식은 스레드 하나를 계속 붙잡는 데다 실행 시각이 점점 밀린다. 타이머는 이 문제를 피한다.
- **PeriodicTimer** (.NET 6+): `while (await timer.WaitForNextTickAsync())` 로 비동기 반복을 쉽게 만든다. 타이머를 `Dispose` 하면 루프가 끝난다. 원문은 async/await 이후로는 전통적 타이머가 대개 필요 없고 `while + await Task.Delay` 패턴으로 충분하다고 설명한다.
- **다중 스레드 타이머** (`System.Threading.Timer`, `System.Timers.Timer`): 스레드풀에서 콜백이 실행되므로 매번 다른 스레드일 수 있고, 이전 콜백이 끝나지 않아도 시간이 되면 또 실행된다. 그래서 콜백은 **스레드 안전해야** 한다. 정밀도는 대체로 10~20ms 수준.
- **단일 스레드 타이머** (WPF/WinForms 전용): UI 스레드에서 실행되어 스레드 안전 걱정이 없지만, 핸들러가 오래 걸리면 UI가 멈춘다. 다른 환경(서비스 등)에서는 동작하지 않는다.
- 잊힌 타이머는 메모리 누수의 원인이 될 수 있다(C# 12 in a Nutshell L42276, [제3부](03_제3부_메모리와_성능_기초.md)의 이벤트·타이머 누수 설명). `System.Threading.Timer` 는 `Dispose` 로 멈추고 정리한다(텍스트 L65864).

```csharp
// 1초마다 초당 수입 적용
var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));

async Task IncomeLoopAsync(CancellationToken token)
{
    try
    {
        while (await timer.WaitForNextTickAsync(token))
            wallet.AddGold(goldPerSecond);
    }
    catch (OperationCanceledException) { }
}
```

> 🔧 보충(책 외): 서버에서 타이머는 "서버 주기 작업"(만료된 세션 정리, 랭킹 갱신, 일일 초기화 등)에 쓰인다. 이런 작업은 보통 요청과 별개로 도는 백그라운드 서비스에서 `PeriodicTimer` 로 구현하며, [제12부](12_제12부_백그라운드_서비스_캐시_외부호출.md)에서 다룬다. 다만 유저의 "초당 골드 증가"를 서버 타이머로 유저마다 돌리기보다, 마지막 접속 시각과 현재 시각의 차이로 요청 시점에 계산하는 방식이 일반적이다([제5부](05_제5부_NET_기본_라이브러리.md)의 날짜·시간 설명). 서버가 꺼져 있는 동안은 타이머가 돌지 않기 때문이다.

> 🔧 보충(책 외): `PeriodicTimer.WaitForNextTickAsync(CancellationToken)` 오버로드로 2.2절의 취소와 결합하는 예는 원문 예제에는 없으며, 두 개념을 합친 설명용 코드다.

> 🔧 보충(책 외): **C++ 개발자 주의** — C++ 서버의 "틱 스레드에서 `Update()` 후 `Sleep(dt)`" 루프를 그대로 옮기면 스레드풀 스레드 하나를 계속 붙잡게 됩니다. `PeriodicTimer` 루프는 한 번에 한 소비자가 `await`로 다음 틱을 기다리므로 이전 처리가 끝나기 전에 다음 처리가 겹쳐 실행되지 않지만, `System.Threading.Timer` 콜백은 겹칠 수 있다는 차이를 기억하세요.

---

## 실무 적용

### 체크리스트

- [ ] (코어 1) DB·외부 API·파일 대기 구간을 모두 `await` 로 처리하는가? 요청 경로에 `Thread.Sleep` 이 없는가?
- [ ] (코어 1) `new Thread()` 대신 `Task.Run`(스레드풀)이나 async 를 쓰는가?
- [ ] (코어 1·2) `.Result`, `.Wait()`, `GetAwaiter().GetResult()` 로 비동기 결과를 막아 기다리는 곳이 없는가? ("async 는 끝까지")
- [ ] (코어 2) 만든 Task 는 결국 `await` 하는가? 버려진 Task(fire-and-forget)의 예외가 사라지지 않는가?
- [ ] (코어 2) `async void` 는 이벤트 핸들러에만 쓰고, 메서드 전체를 try 로 감쌌는가?
- [ ] (코어 2) 오래 걸리는 메서드가 `CancellationToken` 을 받아 하위 비동기 API 에 그대로 넘기고, 직접 도는 루프에서는 `ThrowIfCancellationRequested()` 로 확인하는가?
- [ ] (코어 2) 재화 차감처럼 중간에 끊기면 안 되는 작업은 취소 시점에 데이터가 어중간해지지 않게 트랜잭션과 함께 설계했는가?
- [ ] (코어 3) 요청 간에 공유되는 가변 상태(캐시, static 필드)를 최소화했는가? 남은 것은 `lock` 또는 `SemaphoreSlim` 으로 보호하는가?
- [ ] (코어 3) 잠금 객체가 `private readonly object` 이고, 락 안 코드는 최소이며, 락 안에서 이벤트 같은 임의 코드를 부르지 않는가?
- [ ] (코어 3) 여러 서버·DB 데이터의 동시성을 `lock` 으로 해결하려 하지 않았는가?
- [ ] (코어 4) 주기 작업은 `PeriodicTimer`/`while + await Task.Delay` 로 만들고, 다중 스레드 타이머 콜백은 스레드 안전한가? 다 쓴 타이머는 `Dispose` 하는가?
- [ ] (코어 4) 유저별 초당 수입을 서버 타이머로 돌리지 않고 경과 시간으로 계산하는가?

### 시나리오로 확인하기

1. **상황:** 동시 접속 테스트에서 요청이 늘자 응답이 일제히 느려진다. 덤프를 보니 많은 스레드풀 스레드가 `repository.GetUserAsync(id).Result` 에서 멈춰 있다. 작성자는 C++의 `future.get()` 처럼 "어차피 결과가 필요하니 기다리는 것"이라고 생각했다.
   **질문:** 무엇이 문제이고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `.Result` 는 결과가 나올 때까지 스레드를 막는다. 서버는 소수의 스레드풀 스레드로 많은 요청을 처리하므로, 막힌 스레드만큼 다른 요청이 밀린다(확장성 상실). UI 같은 단일 스레드 컨텍스트에서는 교착까지 날 수 있다. 호출하는 쪽을 `async Task` 로 바꾸고 `await` 를 위로 퍼뜨린다("async 는 끝까지"). (보충: 부하 시 스레드풀 고갈로 이어질 수 있다.) → 코어 1, 코어 2

   </details>

2. **상황:** 같은 유저가 보상 수령 버튼을 연타해 요청 두 개가 거의 동시에 도착했다. 서버는 메모리 캐시의 `_wallet.Gold += reward;` 로 골드를 더한다. 결과 골드가 한 번분만 늘거나, 다른 경우에는 이중 지급됐다.
   **질문:** 원인과 대응은? 서버를 여러 대로 늘리면 `lock` 만으로 충분한가?

   <details markdown="1"><summary>답 확인</summary>

   `+=`(`x++`)는 읽기 → 더하기 → 쓰기 세 단계라 두 스레드가 끼어들면 값이 사라진다. 같은 프로세스 안이라면 `lock`(await 가 필요하면 `SemaphoreSlim(1).WaitAsync()`)으로 보호할 수 있지만, 최선은 공유 가변 상태를 줄이고 재화의 원본을 DB에 두는 것이다. `lock` 은 한 프로세스 안에서만 효과가 있어 여러 서버나 DB 데이터 동시성은 해결하지 못한다([제10부](10_제10부_EF_Core_데이터_접근.md)). → 코어 3

   </details>

3. **상황:** 이벤트 핸들러 대신 편하다며 `async void ProcessRewardAsync()` 를 만들어 호출했다. 내부의 DB 저장이 가끔 실패하는데 로그에도 안 남고, 호출한 쪽의 `try/catch` 에도 안 잡힌다.
   **질문:** 왜 안 잡히고 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   `async void` 는 예외를 담을 Task 가 없어서 예외가 호출자에게 돌아가지 않고 그 시점의 동기화 컨텍스트로 터진다. `async Task` 로 바꾸고 호출하는 쪽에서 `await` 하면 예외가 `await` 지점에서 원래 스택 트레이스와 함께 다시 던져져 `try/catch` 로 잡힌다. 이벤트 핸들러처럼 void 가 불가피하면 메서드 전체를 try 로 감싼다. → 코어 2

   </details>

4. **상황:** 점검 배포를 위해 서버를 내리는데, 오프라인 보상을 몇 분씩 재계산하는 작업이 끝까지 돌아 종료가 늦어진다. 클라이언트가 이미 연결을 끊은 요청도 계산이 계속된다.
   **질문:** 무엇을 빠뜨렸나?

   <details markdown="1"><summary>답 확인</summary>

   협력적 취소를 연결하지 않았다. 메서드가 `CancellationToken` 을 받아 `Task.Delay`·DB 호출 같은 하위 비동기 API 에 그대로 넘기고, 직접 도는 루프에서는 몇 번에 한 번 `ThrowIfCancellationRequested()` 로 확인해야 한다. 요청 쪽은 `HttpContext.RequestAborted`(액션의 `CancellationToken` 매개변수)로 연결 끊김을 받을 수 있다. 단, 재화 차감 같은 작업은 중간에 끊겨도 데이터가 어중간해지지 않게 트랜잭션과 함께 설계한다. → 코어 2

   </details>

5. **상황:** C++ 서버 습관대로 `System.Threading.Timer` 로 1초마다 전체 유저 랭킹을 갱신하는 콜백을 걸었다. 유저가 늘어 갱신이 1초를 넘기자 랭킹 데이터가 가끔 깨진다.
   **질문:** 원인과 대안은?

   <details markdown="1"><summary>답 확인</summary>

   다중 스레드 타이머는 이전 콜백이 끝나지 않아도 시간이 되면 스레드풀의 다른 스레드에서 또 실행된다. 두 콜백이 같은 랭킹 데이터를 동시에 고쳐 깨진 것이다. 콜백을 스레드 안전하게 만들거나, 백그라운드 서비스([제12부](12_제12부_백그라운드_서비스_캐시_외부호출.md))에서 `while (await timer.WaitForNextTickAsync(token))` 루프로 바꿔 한 번에 하나씩 처리한다. 다 쓴 타이머는 `Dispose` 해 누수를 막는다. → 코어 4, 코어 3

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
이 부: 비동기와 시간 흐름 — 한 문장: await는 기다리는 동안 ( ? )를 풀어 준다 → Task가 ( ? )·( ? )·( ? )를 운반 → 공유 상태는 ( ? ) → 주기 작업은 ( ? )
├─ 코어 1 스레드를 놀리지 않는다
│   ├─ 1.1 동시성 3방법: ____, ____, ____ / 스레드 비용 ( ? ) → ( ? ) 풀 → Task.Run
│   │      비동기 이점: GUI = ( ? ), 서버 = ( ? )
│   └─ 1.2 await 동작: 완료면 ( ? ), 미완료면 ( ? ) → 완료 후 ( ? ) / 컴파일러가 ( ? )로 변환
│          반환형: Task / Task<T> / ( ? ) / async void는 ( ? )
│          Task.Delay vs Thread.Sleep: ( ? ) / "async는 끝까지" 위반 시 ( ? )
├─ 코어 2 Task가 운반한다
│   ├─ 2.1 예외: Task에 담겨 ( ? )에서 재던짐 / WhenAll은 ( ? ) / async void = ( ? )
│   ├─ 2.2 CTS = ( ? ) / Token = ( ? ) / 취소 결과 3가지 ____, ____, ____ / 타임아웃 = ( ? )
│   └─ 2.3 IProgress<T>: Progress<T>는 ( ? )를 기억 / progress?.Report / T는 ( ? ) 타입
├─ 코어 3 공유 상태
│   └─ 3.1 공유되는 것: ____, ____, ____ / x++ = 읽기→( ? )→쓰기
│          락 지침 4가지: ____ / lock 안에 await ( ? ) → ( ? ) / lock 범위 = ( ? ) 안
└─ 코어 4 시간 흐름
    └─ 4.1 Sleep 루프 문제 ( ? ) / PeriodicTimer / 다중 스레드 타이머 특징 ( ? ) / 단일 스레드 타이머 ( ? )
```

### 2. 인출 질문

1. 동시성을 이루는 세 가지 방법과, 그중 비동기가 다른 둘과 다른 점은?

   <details markdown="1"><summary>답 확인</summary>

   멀티스레딩(여러 실행 흐름), 병렬 처리(일을 쪼개 여러 코어에), 비동기 프로그래밍(나중에 끝나는 작업을 쓰되 기다리는 동안 스레드를 붙잡지 않음). 비동기의 핵심은 "스레드를 놀리지 않는다"는 것이다. → 코어 1 (1.1)

   </details>

2. 스레드풀이 존재하는 이유와 `new Thread()` 대신 쓸 것은?

   <details markdown="1"><summary>답 확인</summary>

   스레드를 시작할 때마다 수백 마이크로초가 들고 살아 있는 동안 약 1MB를 차지하므로 미리 만든 스레드를 재활용한다. `Task.Run` 이 스레드풀에서 작업을 실행하는 가장 쉬운 방법이며, Cookbook 저자는 `new Thread()` 를 쓰면 이미 낡은 코드라고 한다. → 코어 1 (1.1)

   </details>

3. 비동기의 이점은 GUI와 서버에서 각각 무엇이며, 공통 원리는?

   <details markdown="1"><summary>답 확인</summary>

   GUI에서는 반응성(UI 스레드를 풀어 화면이 멈추지 않음), 서버에서는 확장성(요청 스레드를 붙잡지 않아 다른 요청이 밀리지 않음). 둘 다 "스레드를 놀리지 않는다"는 같은 원리다. → 코어 1 (1.1)

   </details>

4. `await` 를 만났을 때 일어나는 일을 작업 완료 여부별로 설명하세요.

   <details markdown="1"><summary>답 확인</summary>

   이미 끝났으면 그대로 계속 진행한다. 아직이면 메서드를 잠시 멈추고 호출자에게 돌아가며, 작업이 끝나면 멈춘 지점부터 이어 실행한다. 지역 변수와 반복문 변수는 보존된다. 컴파일러가 메서드를 상태 기계로 바꿔 이를 구현한다. → 코어 1 (1.2)

   </details>

5. async 메서드의 반환 형태 네 가지와 각각 언제 쓰나요?

   <details markdown="1"><summary>답 확인</summary>

   값이 없으면 `Task`, 값이 있으면 `Task<T>`, 결과가 대부분 즉시 나와 할당을 줄이고 싶으면 `ValueTask<T>`, `async void` 는 이벤트 핸들러가 아니면 피한다. → 코어 1 (1.2)

   </details>

6. `Task.Delay` 와 `Thread.Sleep` 의 차이는?

   <details markdown="1"><summary>답 확인</summary>

   `Task.Delay` 는 그 시간 뒤에 끝나는 Task를 돌려주어 `await` 하면 스레드를 막지 않는다. `Thread.Sleep` 은 스레드 자체를 막는다. → 코어 1 (1.2)

   </details>

7. "async 는 끝까지"를 어기고 `.Result`/`.Wait()` 로 기다리면 왜 교착이 날 수 있나요?

   <details markdown="1"><summary>답 확인</summary>

   UI처럼 한 번에 스레드 하나만 들이는 컨텍스트에서, 호출 스레드가 결과를 기다리며 컨텍스트를 막고 있으면 await 이후 코드가 그 컨텍스트에서 재개되지 못해 서로 기다리게 된다. 그래서 호출하는 쪽도 await 하도록 위로 퍼뜨린다. → 코어 1 (1.2)

   </details>

8. 진행 보고에 `Action` 콜백 대신 `Progress<T>` 를 쓰는 이유와 사용 관례는?

   <details markdown="1"><summary>답 확인</summary>

   콜백은 작업 스레드에서 실행되어 UI를 건드리면 위험하지만, `Progress<T>` 는 만들어진 시점의 컨텍스트를 기억했다가 거기서 콜백을 실행한다. 관례: 인자가 null일 수 있어 `progress?.Report(...)`, 비동기 전달이므로 `T` 는 값 타입이나 불변 타입, 취소도 함께 지원. → 코어 2 (2.3)

   </details>

9. async 메서드에서 던진 예외는 어디에 담기고 언제 다시 던져지나요? `Task.WhenAll` 은?

   <details markdown="1"><summary>답 확인</summary>

   반환된 Task에 담기고, 그 Task를 `await` 하는 순간 원래 스택 트레이스와 함께 다시 던져져 `try/catch` 로 잡힌다. `Task.WhenAll` 처럼 예외가 여럿이어도 await 는 첫 번째 예외만 던진다. await 하지 않고 버린 Task의 예외는 눈에 띄지 않을 수 있다. → 코어 2 (2.1)

   </details>

10. `async void` 가 위험한 이유와 어쩔 수 없이 쓸 때의 처리법은?

    <details markdown="1"><summary>답 확인</summary>

    예외를 담을 Task가 없어 예외가 동기화 컨텍스트로 바로 터진다(원문: 좋은 해법이 없다). 가능하면 `Task` 반환으로 바꾸고, 이벤트 핸들러처럼 필요할 때만 쓰며 메서드 전체를 try로 감싼다. → 코어 2 (2.1)

    </details>

11. `CancellationTokenSource` 와 `CancellationToken` 의 역할 분리, 그리고 취소를 지원하는 메서드가 할 일은?

    <details markdown="1"><summary>답 확인</summary>

    Source는 `Cancel()` 로 취소를 요청하고, Token은 작업 쪽에서 취소 여부를 확인만 한다. 메서드는 `CancellationToken` 매개변수를 받아 호출하는 비동기 API(`Task.Delay(시간, token)` 등)에 그대로 넘기고, 직접 도는 루프에서는 주기적으로 `ThrowIfCancellationRequested()` 를 호출한다. 취소되면 `OperationCanceledException`. → 코어 2 (2.2)

    </details>

12. 취소를 요청한 뒤 나올 수 있는 결과 세 가지와, 한 번 Cancel한 Source를 다시 쓸 수 있는지?

    <details markdown="1"><summary>답 확인</summary>

    취소 예외, 정상 완료(이미 끝나가던 작업, 경쟁 상태), 취소와 무관한 다른 예외. 한 번 Cancel한 Source는 영구히 취소 상태라 다시 하려면 새로 만든다. 타임아웃은 `new CancellationTokenSource(TimeSpan)` 이나 `CancelAfter` 로 표현한다. → 코어 2 (2.2)

    </details>

13. 스레드 간에 공유되어 위험한 변수는 무엇이고, `x++` 는 왜 안전하지 않나요?

    <details markdown="1"><summary>답 확인</summary>

    지역 변수는 스레드마다 별도 스택에 있어 안전하지만 필드, static 변수, 람다로 캡처한 변수는 공유된다. `x++` 는 내부적으로 읽기 → 더하기 → 쓰기 세 단계라 두 스레드가 동시에 하면 한 번만 증가할 수 있다. → 코어 3 (3.1)

    </details>

14. `lock` 사용 지침 네 가지는?

    <details markdown="1"><summary>답 확인</summary>

    (1) 잠금 객체는 `private readonly object` 필드로 두고 노출하지 않는다(`lock(this)`, Type, string 금지) (2) 무엇을 보호하는지 주석으로 적는다 (3) 락 안 코드는 최소로 (4) 락 안에서 이벤트 호출 같은 임의 코드를 실행하지 않는다. → 코어 3 (3.1)

    </details>

15. `lock` 안에서 `await` 를 쓸 수 없을 때 대안은? 그리고 락보다 나은 최선책은?

    <details markdown="1"><summary>답 확인</summary>

    `SemaphoreSlim(1)` 의 `await WaitAsync()` 후 `finally` 에서 `Release()`. 락은 교착을 만들 수도 있으므로 가능하면 공유 상태 자체를 줄이는 것이 최선이다. (보충: 서버에서 `lock` 은 한 프로세스 안에서만 효과가 있어 여러 서버·DB 동시성은 [제10부](10_제10부_EF_Core_데이터_접근.md)에서 다룬다.) → 코어 3 (3.1)

    </details>

16. 일정 간격 반복을 `Sleep` 스레드로 하면 생기는 문제와 `PeriodicTimer` 의 사용법은?

    <details markdown="1"><summary>답 확인</summary>

    스레드 하나를 계속 붙잡고 실행 시각이 점점 밀린다. `PeriodicTimer` 는 `while (await timer.WaitForNextTickAsync())` 로 비동기 반복을 만들고, `Dispose` 하면 루프가 끝난다. 원문은 async 이후 전통적 타이머가 대개 필요 없고 `while + await Task.Delay` 로 충분하다고 한다. → 코어 4 (4.1)

    </details>

17. 다중 스레드 타이머와 단일 스레드 타이머의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    다중 스레드 타이머(`System.Threading.Timer`, `System.Timers.Timer`)는 스레드풀에서 콜백이 실행되어 매번 다른 스레드일 수 있고 이전 콜백이 안 끝나도 또 실행되므로 콜백이 스레드 안전해야 한다(정밀도 10~20ms). 단일 스레드 타이머(WPF/WinForms)는 UI 스레드에서 실행되어 스레드 안전 걱정은 없지만 핸들러가 길면 UI가 멈추고 다른 환경에선 동작하지 않는다. → 코어 4 (4.1)

    </details>

18. C# `lock` 과 C++ `std::mutex`, 그리고 `SemaphoreSlim` 의 차이를 재진입과 `await` 관점에서 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    C# `lock` 은 Monitor 기반이라 같은 스레드가 다시 들어갈 수 있다(재진입 가능). `std::mutex` 는 재진입이 안 되어 `std::recursive_mutex` 가 필요했다. `lock` 안에서는 `await` 불가. `SemaphoreSlim(1)` 은 `WaitAsync()` 로 스레드를 막지 않고 기다릴 수 있지만 재진입은 안 된다. → 코어 3 (3.1)

    </details>

### 3. 기억 고리

- **C++ 유추:** IOCP 완료 통지 + 워커 스레드 → `async`/`await`. 같은 점은 I/O 대기 중 스레드를 붙잡지 않고 완료 후 이어 처리한다는 것. ⚠️ 깨지는 곳: 완료 콜백과 상태 저장을 직접 쓰지 않고 컴파일러가 상태 기계(코루틴)로 만들어 준다. 이미 완료된 작업이면 멈추지 않는다.
- **C++ 유추:** `std::future` → `Task`. ⚠️ 깨지는 곳: Task 는 대개 이미 실행 중(hot)이고, `.get()` 같은 `.Result` 는 서버에서 금기다.
- **C++ 유추:** `std::mutex` → `lock`. ⚠️ 깨지는 곳: C# `lock` 은 재진입 가능, 안에서 `await` 불가. `await` 가 필요하면 `SemaphoreSlim`.
- **비유:** `await` = 식당에서 진동벨을 받고 자리로 돌아가는 손님. 점원(스레드)은 그 사이 다른 손님을 받고, 벨이 울리면(작업 완료) 이어서 처리한다. ⚠️ 비유가 깨지는 지점: 작업이 이미 끝나 있으면 벨 없이 그대로 진행하고, 이어 처리하는 스레드가 원래 스레드와 같다는 보장은 컨텍스트에 따라 다르다.
- **비유:** `CancellationTokenSource`/`Token` = 리모컨과 수신기. 리모컨은 "멈춰" 신호만 보내고, 수신기(작업)가 확인해야 실제로 멈춘다. ⚠️ 깨지는 지점: 확인하지 않는 코드는 신호를 무시하며, 이미 끝나가던 작업은 정상 완료될 수도 있다.
- **묶음(3의 법칙):** Task가 운반하는 3가지 = 결과 · 예외 · 취소. 피해야 할 3가지 = `.Result`/`.Wait()` · `async void` · `Thread.Sleep`. 공유되는 3가지 변수 = 필드 · static · 캡처 변수.
- **대칭·순서:** `Thread.Sleep` ↔ `Task.Delay`, `lock` ↔ `SemaphoreSlim.WaitAsync`, 다중 스레드 타이머 ↔ 단일 스레드 타이머. 취소 흐름: CTS 생성 → Token 전달 → `Cancel()` → `OperationCanceledException` → `catch`.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "왜 서버 컨트롤러에서 DB 호출을 `await` 로 기다려야 하는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "`async`/`await` 는 IOCP 완료 통지를 언어가 대신 짜 주는 것"이라는 문장으로 시작해, 상태 기계·Task(hot)·`.Result` 금지·`lock` 재진입까지 설명해 보세요. 유추가 깨지는 지점을 반드시 함께 말합니다.
- **랜덤 논리 게임:** A "공유 상태는 `lock` 으로 보호하면 된다" vs B "공유 상태 자체를 줄이는 것이 최선이다" — 양쪽을 번갈아 변호해 보세요(교착, `await` 불가, 프로세스 범위 한계를 근거로).
- **AI 역할 반전:** "내가 async/await 동작과 예외·취소 전파를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습 골격 채우기
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제7부. 웹 API 기초

> **🎮 게임 서버 개발자에게** — 이 부는 TCP 세션 서버의 "접속 → 세션 객체 → 패킷 opcode로 핸들러 분기 → 바이너리 역직렬화 → 결과 패킷 송신"에 해당하는 일을 HTTP 위에서 하는 방법이다. 결정적 차이는 **연결이 곧 유저 상태가 아니라는 것**이다. HTTP 서버는 요청 하나를 받아 응답 하나를 돌려주면 그 요청을 잊으므로(무상태), 클라이언트는 매 요청에 "누구인지"를 실어 보내고, 서버는 먼저 말을 걸 수 없다. opcode 대신 "메서드 + URL"이, 바이너리 구조체 대신 필드 이름으로 매칭되는 JSON이, 결과 코드 필드 대신 표준 HTTP 상태 코드가 쓰인다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 네트워크가 끊긴 순간 클라이언트가 "보상 수령" 요청을 재시도했더니 보상이 두 번 들어갔다는 문의가 온다 (메서드의 멱등성).
> - 클라이언트가 보낸 JSON에 `gold` 필드를 끼워 넣어 재화가 바뀌었다는 보안 제보를 받는다 (DTO로 입력 통제).
> - 응답 필드 이름을 바꿨더니 아직 업데이트하지 않은 구버전 앱이 파싱 오류로 튕긴다, 혹은 `/api/heroes/abc` 가 400이 아니라 404를 돌려줘 클라이언트 팀이 "라우트가 없다"고 오해한다 (API 계약·라우트 제약).

## 코어 — 이것만은 100%

> **한 문장:** 웹 API는 무상태 HTTP 위에서 "리소스(명사) URL + 메서드(동작) → 상태 코드 + JSON"으로 대화하며, ASP.NET Core는 `Program.cs`에서 만든 앱이 요청을 라우팅 → 모델 바인딩 → 검증을 거쳐 핸들러(Minimal API 또는 컨트롤러)에 넘기고, DTO로 입출력을 통제해 내부 모델을 숨긴 채 System.Text.Json으로 응답하며, 그 약속을 API 계약(OpenAPI/Swagger)으로 고정한다.

1. **무상태 요청/응답 — HTTP의 대화 규칙** — 요청은 메서드 + 경로 (+ 헤더·본문), 응답은 상태 코드 (+ 헤더·본문). 서버는 지난 요청을 기억하지 않으므로 요청마다 누구인지(토큰)를 싣고, 서버는 먼저 말을 걸 수 없어 푸시가 필요하면 폴링이나 실시간 기술(SignalR 등)을 쓴다. 상태 코드는 "어떻게 됐는지"(2xx/3xx/4xx/5xx)를 표준으로 알린다.
2. **리소스 중심 설계 — URL은 명사, 동작은 메서드** — 복수 명사 URL, 관계는 중첩, 필터·정렬·페이지는 쿼리, CRUD로 애매한 동작은 하위 리소스. GET은 안전, PUT/DELETE는 멱등, POST/PATCH는 둘 다 아니므로 "재시도해도 안전한가"가 메서드로 드러난다. REST는 스타일이지 규칙이 아니다.
3. **앱 골격과 핸들러 — `Program.cs`, Minimal API, 컨트롤러** — 빌더 생성 → 서비스 등록 → `Build()` → 미들웨어 → 엔드포인트 매핑 → `Run()`. 핸들러는 `MapGet` 등으로 직접 매핑(Minimal API)하거나 `[ApiController]` 클래스에 모은다(컨트롤러). 어느 쪽이든 아래의 라우팅·바인딩·JSON은 같고, 팀이 하나로 통일하는 것이 중요하다. Swagger UI로 시험한다.
4. **요청 입구 3단계 — 라우팅 → 모델 바인딩 → 검증** — 라우팅은 URL·메서드로 핸들러를 고르고(제약 불일치는 404, 그래서 제약은 검증용이 아님), 바인딩은 경로·쿼리·헤더·본문(본문은 하나)의 문자열을 C# 타입으로 바꾸며(변환 실패 400, JSON 아님 415), 검증은 DataAnnotations로 값의 규칙을 확인한다(컨트롤러는 자동 400). 클라이언트 값은 절대 믿지 않는다.
5. **입출력 통제 — DTO·API 계약·JSON 설정** — 입력 DTO에 없는 필드는 바인딩되지 않고 출력 DTO에 없는 필드는 나가지 않는다(과다 바인딩·데이터 손실·순환 참조 방지). 엔드포인트마다 URI·메서드·입력·출력(+상태 코드)을 계약으로 고정하고 버전 전략을 미리 정하며, JSON 옵션(이름 규칙·enum 문자열·null 생략)은 `Program.cs`에서 전역으로 맞춘다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 접속 시 만든 세션 객체에 로그인 유저·캐릭터 상태를 들고 있다가, 같은 연결로 오는 패킷을 그 세션으로 처리 | HTTP 무상태 요청/응답 (`HttpContext`는 요청 하나 단위) | 클라이언트가 보내고 서버가 처리해 돌려준다. ASP.NET Core 안의 Kestrel이 소켓 수신·파싱 계층을 맡는다 | 연결(세션)이 상태를 들지 않는다. HTTP/1.1이 TCP 연결을 재사용(keep-alive)해도 요청끼리는 독립이고, 다음 요청은 다른 서버 인스턴스로 갈 수 있다. 그래서 매 요청에 토큰을 싣고, 상태는 DB 등 서버 밖에 둔다 |
| 패킷 헤더의 opcode로 핸들러 테이블(`switch`/`std::unordered_map<opcode, handler>`)을 찾아 호출 | 라우팅: 메서드 + URL 템플릿 → 핸들러 | "요청 종류 키 → 처리 함수" 디스패치라는 구조가 같다 | 키가 정수가 아니라 문자열 경로 템플릿 + 메서드이고, 경로 안에 파라미터(`{id:int}`)가 박힌다. 맞는 핸들러가 없으면 내가 처리하지 않아도 프레임워크가 404/405를 자동 응답한다 |
| 바이너리 패킷을 구조체로 역직렬화(필드 순서·크기 고정, 길이 헤더) | 모델 바인딩 + System.Text.Json 역직렬화 | 수신 바이트를 타입 있는 객체로 바꿔 핸들러에 넘긴다 | 텍스트 JSON이고 **필드 이름**으로 매칭한다. 순서는 상관없고, DTO에 없는 필드는 무시된다(그래서 DTO가 곧 화이트리스트). 변환 실패는 핸들러 호출 전에 400으로 끝난다 |
| 응답 패킷의 결과 코드(`enum ResultCode { Ok, NotEnoughGold, ... }`) | HTTP 상태 코드(200/201/400/404/409/500 ...) | 처리 결과를 숫자 코드로 알려 클라이언트가 분기한다 | 코드 체계가 표준이라 프록시·클라이언트 라이브러리 같은 중간 장비가 해석한다. "200 + 본문에 자체 에러 코드"는 권장되지 않는다. 게임 고유의 세부 사유는 Problem Details 본문에 담는다 |
| 서버가 아무 때나 세션에 `Send()`로 푸시(보상 알림, 채팅) | 폴링 / 긴 폴링 / SSE / WebSocket(SignalR) | 서버 → 클라이언트 알림이 필요하다는 요구 자체는 같다 | 순수 HTTP 요청/응답에서는 서버가 먼저 말을 걸 수 없다. 푸시가 필요하면 WebSocket 같은 별도 연결을 추가해야 하고, 그 순간 다시 연결 상태를 관리하는 세계로 돌아간다 |
| 프로토콜 버전 필드를 비교해 구버전 클라이언트를 접속 거부·강제 업데이트 | API 계약 + 버전 전략(`/api/v2/`, 헤더) | 서버와 클라이언트가 같은 메시지 형식을 약속해야 한다 | JSON은 모르는 필드를 무시하므로 "필드 추가만 하기"로 구버전과 공존할 수 있다. 삭제·이름 변경이 깨지는 변경이다. TCP 재전송이 보장하던 "한 번만 도착"도 없어서, 클라이언트 재시도로 같은 요청이 두 번 올 수 있다(멱등성) |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·그림·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. 서버가 "지난 요청"을 기억하지 않는다면, 클라이언트는 매 요청에 무엇을 실어 보내야 할까? 서버가 클라이언트에게 먼저 말을 걸려면 무엇이 필요할까?
> 2. 같은 DELETE를 두 번 보내면 결과 상태와 응답은 각각 어떻게 될까? 멱등이란 무엇일까?
> 3. `/api/heroes/abc` 처럼 라우트 제약에 안 맞는 요청이 400이 아니라 404가 되는 것은 왜 문제일까?
> 4. DB 엔티티를 그대로 요청 본문으로 받으면 어떤 사고가 날 수 있을까?
>
> **처리법:** 🛠 실습 `dotnet new webapi`/`dotnet run`/`dotnet watch`, `MapGet`·`MapGroup`·`Results`, `[ApiController]` 컨트롤러, DataAnnotations 검증, 입력/출력 DTO, `ConfigureHttpJsonOptions`, Swagger 추가 → 읽자마자 직접 실행 · 🗺 관계도 요청 → 라우팅 → 모델 바인딩 → 검증 → 입력 DTO → 로직 → 출력 DTO → JSON 직렬화 → 상태 코드 응답 · 🔗 유추 API 계약 ≈ 식당 메뉴판(이 주문을 하면 이게 나온다), DTO ≈ 주문서 양식(적힌 칸만 받는다) — 어디까지 맞고 어디서 깨지는지 · 📦 카드로 상태 코드(200/201/204/400/401/403/404/405/409/415/500), 메서드 성질(안전·멱등), 라우트 제약 문법, 포트 범위(5000-5300/7000-7300), JSON 옵션 이름

**이 부의 학습 목표**
1. HTTP 요청/응답, 메서드, 상태 코드와 REST 설계 관례(리소스 URL, 메서드 매핑)를 설명할 수 있다.
2. ASP.NET Core 프로젝트를 만들어 실행하고, Minimal API와 컨트롤러로 `/api/heroes` 같은 엔드포인트를 만들 수 있다.
3. 라우팅, 모델 바인딩, 검증, DTO, JSON 설정을 이해하고, 폴링과 실시간 통신의 차이를 구분할 수 있다.

> 공통 안내: 아래 예제는 모두 `dotnet new web`(또는 webapi) 프로젝트의 `Program.cs`에 넣으면 되는 완결된 코드입니다(암시적 using 사용, .NET 8 기준). 최상위 문장이 먼저, 타입(record/class) 선언은 뒤에 옵니다.

---

## 코어 1. 무상태 요청/응답 — HTTP의 대화 규칙

> 원래 8.1 "웹 API와 HTTP: 요청/응답, 메서드, 상태 코드"와 8.9 "실시간 API 개요: 폴링 vs 실시간". 요청 하나 → 응답 하나로 끝나는 대화 형식(1.1), 그 대화의 동사와 결과 표시(1.2), 그리고 이 형식 때문에 생기는 한계 "서버는 먼저 말을 걸 수 없다"(1.3)를 한 묶음으로 본다.

### 1.1 웹 API와 HTTP 요청/응답
**한 줄 요약:** 웹 API는 "URL로 요청을 보내면 서버가 데이터로 응답해 주는 창구"이고, 그 대화 규칙이 HTTP입니다.

> 📖 출처: ASP.NET Core in Action 1장 "1.4.1 How does an HTTP web request work?" (텍스트 L1442-1530), ASP.NET Core in Action 1.4.2 Kestrel/HttpContext (텍스트 L1560-1567), ASP.NET Core in Action 5.1 (텍스트 L5099-5101), Web API Development with ASP.NET Core 8 1장 "What is a web API?" (텍스트 L1560-1571)

**핵심 설명**
- HTTP는 클라이언트가 요청(request)을 보내면 서버가 응답(response)을 돌려주는, 상태를 기억하지 않는(stateless) 프로토콜입니다.
- 요청은 동사(GET, POST 같은 메서드) + 경로(path)로 이뤄지고, 보통 헤더(키-값 쌍)와, 필요하면 본문(body)이 붙습니다.
- 응답은 상태 코드(성공/실패 표시)와 선택적으로 헤더, 본문으로 이뤄집니다.
- ASP.NET Core 앱 안에는 Kestrel이라는 웹 서버가 있어서, 받은 요청을 `HttpContext`라는 객체로 바꿔 내 코드에 넘겨줍니다(ASP.NET Core in Action 1.4.2).
- 웹 API는 HTML 대신 주로 JSON 같은 "데이터"를 응답합니다. 모바일 앱도 서버 입장에서는 브라우저 SPA와 비슷한 클라이언트입니다(ASP.NET Core in Action 5.1).

```csharp
// Program.cs : 요청의 메서드와 경로를 그대로 돌려주는 가장 작은 API
var app = WebApplication.Create(args);

app.MapGet("/api/heroes/{id}", (int id, HttpRequest req) =>
    $"{req.Method} {req.Path} -> 영웅 {id}번 조회");

app.Run();
```

```text
요청:  GET /api/heroes/7 HTTP/1.1
       Host: localhost:5000
       Accept: application/json
응답:  200 OK
       Content-Type: text/plain; charset=utf-8
       GET /api/heroes/7 -> 영웅 7번 조회
```

**방치형 RPG 서버에서는**: 모바일 클라이언트가 `GET /api/heroes/7` 같은 요청을 보내면 서버가 JSON 한 덩이로 답합니다. 서버는 "지난 요청"을 기억하지 못하므로, 요청마다 누구인지(토큰 등)와 필요한 정보를 매번 실어 보내야 합니다.

### 1.2 메서드와 상태 코드
**한 줄 요약:** 메서드는 "무엇을 하고 싶은지", 상태 코드는 "어떻게 됐는지"를 알려 주는 약속입니다.

> 📖 출처: Architecting ASP.NET Core Applications 4장 "HTTP methods / HTTP status codes" (텍스트 L5676-5810), Web API Development with ASP.NET Core 8 1장 "Assigning response codes" (텍스트 L2920-3067)

**핵심 설명**
- 자주 쓰는 메서드: GET(조회), POST(생성), PUT(전체 교체), PATCH(부분 수정), DELETE(삭제). 이를 묶어 CRUD라고 부릅니다(Architecting ASP.NET Core Applications).
- 상태 코드는 앞자리로 묶입니다: 2xx 성공, 3xx 리다이렉션, 4xx 클라이언트 잘못, 5xx 서버 잘못(Web API Development with ASP.NET Core 8, Architecting ASP.NET Core Applications). 5xx 뒤의 재시도에 대해서는 Architecting ASP.NET Core Applications이 "클라이언트가 할 수 있는 일이 없다"는 취지로, Web API Development with ASP.NET Core 8은 "나중에 재시도할 수 있다"는 취지로 서술이 서로 다릅니다.
- 자주 쓰는 코드: 200 OK, 201 Created(생성됨, `Location` 헤더 동반), 204 No Content, 400 Bad Request(잘못된 입력), 401 Unauthorized(로그인 필요), 403 Forbidden(권한 없음), 404 Not Found, 409 Conflict(현재 상태와 충돌), 500 Internal Server Error(Architecting ASP.NET Core Applications 표 4.2).
- 책은 "생성했는데 200에 본문으로 자체 코드를 넣는 방식"을 권장하지 않습니다. 중간 장비(프록시 등)가 표준 코드를 기준으로 동작하기 때문입니다(Web API Development with ASP.NET Core 8).

```csharp
var app = WebApplication.Create(args);

// 같은 경로라도 메서드가 다르면 다른 핸들러가 실행된다
app.MapGet("/api/heroes", () => Results.Ok(new[] { "Arthur", "Merlin" }));
app.MapPost("/api/heroes", () => Results.Created("/api/heroes/3", new { id = 3 }));
app.MapDelete("/api/heroes/{id}", (int id) => Results.NoContent());

app.Run();
// 존재하는 경로에 맞지 않는 메서드로 요청하면 405 Method Not Allowed (ASP.NET Core in Action 5.2.2)
```

**방치형 RPG 서버에서는**: 클라이언트가 응답 본문을 파싱하기 전에 상태 코드만으로 "성공/입력오류/서버오류"를 분기합니다. 4xx(내 요청 문제)와 5xx(서버 문제)를 구분해 두면 앱이 재시도할지 사용자에게 알릴지 결정하기 쉽습니다.

### 1.3 폴링의 한계와 실시간 통신 방식
**한 줄 요약:** 요청/응답 방식에서 서버는 먼저 말을 걸 수 없어서 클라이언트가 계속 물어봐야(폴링) 하고, 서버가 먼저 알려 주는 방식이 실시간 API입니다.

> 원래 8.9.1. 1.1의 "무상태 요청/응답"에서 바로 따라 나오는 한계라 이 코어로 옮겼다.

> 📖 출처: Web API Development with ASP.NET Core 8 1장 "Real-time APIs" (텍스트 L3751-3892)

**핵심 설명**
- 폴링(polling)은 클라이언트가 주기적으로 요청해 변화를 확인하는 방식입니다. 간격이 짧으면 서버 부하가 커지고, 길면 최신 상태를 늦게 알게 됩니다(Web API Development with ASP.NET Core 8). 변경 감지 로직도 복잡해지고 요청 제한(rate limit)에 걸릴 수 있습니다.
- 실시간 API는 서버가 이벤트를 클라이언트로 밀어 주는(push) 방식이라 요청 수가 줄고 반응이 빠릅니다.
- 기술 종류(Web API Development with ASP.NET Core 8): 긴 폴링(long polling, 응답을 미루다 데이터가 생기면 응답), SSE(서버→클라이언트 단방향 스트림), WebSocket(한 연결에서 양방향), gRPC 스트리밍(주로 서버 간 통신).
- ASP.NET Core의 SignalR은 WebSocket을 기본으로 쓰다가 안 되면 SSE, 긴 폴링 순으로 자동 대체합니다. 게임, 알림, 대시보드 같은 곳에 적합하다고 소개합니다(Web API Development with ASP.NET Core 8).
- 이 책에서는 구현 상세(SignalR 등)는 다루지 않고 개념만 소개합니다.

```csharp
// 서버: 상태를 조회하는 평범한 GET 엔드포인트 (폴링의 대상)
var app = WebApplication.Create(args);
app.MapGet("/api/heroes/1/status", () => new { level = 3, exp = 120 });
app.Run();
```

```csharp
// 클라이언트(콘솔 예시): 30초마다 상태를 물어보는 폴링
using var http = new HttpClient { BaseAddress = new Uri("http://localhost:5000") };
using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
while (await timer.WaitForNextTickAsync())
{
    string json = await http.GetStringAsync("/api/heroes/1/status");
    Console.WriteLine(json);
}
```

> 🔧 보충(책 외): 방치형 게임은 접속 시 "오프라인 동안 쌓인 보상"을 한 번 요청해 받는 구조가 많아, 대부분의 기능은 폴링조차 필요 없이 요청/응답만으로 충분합니다. 채팅·실시간 랭킹·길드 알림처럼 서버가 먼저 알려야 하는 기능에서만 실시간 기술을 검토하면 됩니다. 이는 이 책들의 내용이 아니라 설계 판단에 대한 제안입니다.

**방치형 RPG 서버에서는**: 우선 REST(요청/응답)로 시작하고, 서버 푸시가 꼭 필요한 기능이 생길 때 SignalR 도입을 검토하는 순서를 권합니다. 폴링을 쓴다면 간격을 넉넉히 잡아 서버 부하를 관리하세요.

---

## 코어 2. 리소스 중심 설계 — URL은 명사, 동작은 메서드

> 원래 8.2 "REST API 설계: 리소스, URL, HTTP 메서드 매핑, 응답 코드". REST가 무엇이고 왜 무상태가 확장에 유리한지(2.1), 그리고 URL·메서드·상태 코드를 실제로 짝짓는 방법과 메서드의 안전·멱등 성질(2.2).

### 2.1 REST와 리소스 중심 설계
**한 줄 요약:** REST는 "세상을 리소스(명사)로 보고, HTTP 메서드로 다루자"는 스타일이지 엄격한 규칙이 아닙니다.

> 📖 출처: Web API Development with ASP.NET Core 8 1장 "What is a REST API? / The constraints of REST / Is my web API RESTful?" (텍스트 L1573-1665, L1790-1833), Architecting ASP.NET Core Applications 4장 "REST and HTTP" (텍스트 L5646-5675)

**핵심 설명**
- REST의 제약(Web API Development with ASP.NET Core 8은 Fielding 논문 기준 여섯 가지를 듭니다): 클라이언트-서버 분리, 무상태(요청에 필요한 정보를 모두 담음), 캐시 가능성, 계층형 시스템, 통일된 인터페이스, 그리고 선택 사항인 코드 온디맨드.
- 책은 "REST는 스타일이지 규칙이 아니며, 다 지키는지 논쟁하는 것보다 동작하게 만드는 게 중요하다"고 말합니다. 다만 새 프로젝트라면 관례를 따르라고 합니다.
- 관례: 기본 URL + HTTP 메서드의 의미 + 미디어 타입(`application/json`) (Web API Development with ASP.NET Core 8).
- 무상태 덕분에 서버 용량을 늘리기(scale out) 쉽습니다. 서버가 클라이언트의 세션 상태를 기억하지 않아도 되기 때문입니다(Web API Development with ASP.NET Core 8).

```csharp
// 리소스 = Hero. URL은 명사, 동작은 메서드가 표현한다
//   GET    /api/heroes        영웅 목록
//   GET    /api/heroes/{id}   영웅 한 명
//   POST   /api/heroes        영웅 생성
//   DELETE /api/heroes/{id}   영웅 삭제
```

**방치형 RPG 서버에서는**: 리소스 후보는 `heroes`, `players`, `items`, `stages` 같은 명사입니다. "골드 획득" 같은 동작은 뒤에서 설명하듯 하위 리소스나 수정으로 표현합니다.

### 2.2 URL 설계와 메서드·응답 코드 매핑
**한 줄 요약:** URL은 복수 명사로, 관계는 중첩으로, 동작은 메서드로, 결과는 알맞은 상태 코드로 표현합니다.

> 📖 출처: Web API Development with ASP.NET Core 8 1장 "Designing a REST-based API" 중 "Designing the URL paths / Mapping API operations to HTTP methods / Assigning response codes" (텍스트 L1838-1865, L2184-2225, L2481-2495, L2920-3067)

**핵심 설명**
- 설계 순서(Web API Development with ASP.NET Core 8): 리소스 식별 → 관계 정의 → 동작 식별 → URL 경로 설계 → 메서드 매핑 → 응답 코드 지정 → 문서화.
- URL 규칙: 동사 대신 명사, 컬렉션은 복수형(`/posts`, `/posts/{postId}`), 부모-자식은 중첩(`/posts/{postId}/comments`). 너무 깊은 중첩은 피합니다.
- 필터·정렬·페이지는 쿼리 문자열로: `/posts?search=keyword`, `?sort=date`, `?page=2`.
- CRUD로 표현하기 애매한 동작(예: 게시)은 하위 리소스(`/posts/{id}/publish`)로 두거나, `IsPublished` 필드를 바꾸는 수정으로 취급합니다.
- 메서드의 성질(Web API Development with ASP.NET Core 8 표 1.4): GET은 안전(safe, 상태를 안 바꿈), PUT/DELETE는 멱등(idempotent, 같은 요청을 반복해도 결과 상태가 같음), POST와 PATCH는 안전하지도 멱등하지도 않습니다. 멱등이라고 응답까지 같다는 뜻은 아니어서, 삭제를 반복하면 두 번째는 404가 나올 수 있다고 책은 설명합니다.
- 책의 매핑표(Web API Development with ASP.NET Core 8 표 1.5)는 게시(`publish`) 같은 하위 동작에 PUT을 씁니다.

```csharp
var app = WebApplication.Create(args);
var heroes = new List<Hero> { new(1, "Arthur", 1) };
var api = app.MapGroup("/api/heroes");

api.MapGet("/", () => heroes);                                    // 200
api.MapGet("/{id:int}", (int id) =>
    heroes.FirstOrDefault(x => x.Id == id) is { } hero
        ? Results.Ok(hero)                                        // 200
        : Results.NotFound());                                    // 404
api.MapPost("/", (Hero hero) =>
{
    heroes.Add(hero);
    return Results.Created($"/api/heroes/{hero.Id}", hero);       // 201 + Location
});
api.MapDelete("/{id:int}", (int id) =>
{
    heroes.RemoveAll(x => x.Id == id);
    return Results.NoContent();                                   // 204 (이 예제는 이미 없어도 204)
});

app.Run();

record Hero(int Id, string Name, int Level);
```

> 🔧 보충(책 외): 이 예제의 `List<Hero>`는 스레드 안전하지 않습니다. ASP.NET Core in Action은 5장 예제에서 같은 이유로 `ConcurrentDictionary`를 씁니다(텍스트 L5427, L5551). 실제 서버에서는 DB를 쓰게 됩니다([제10부](10_제10부_EF_Core_데이터_접근.md)).

**방치형 RPG 서버에서는**: `GET /api/heroes`, `POST /api/heroes/{id}/upgrade`(강화 같은 동작은 하위 리소스), `GET /api/players/{id}/heroes`처럼 설계합니다. 멱등성은 "네트워크 끊겨 재시도해도 안전한가"를 판단하는 기준이라, 재화가 걸린 POST는 특히 주의가 필요합니다.

> 🔧 보충(책 외): Web API Development with ASP.NET Core 8은 `publish`에 PUT을 매핑하지만, 강화는 반복하면 레벨이 계속 오르는 동작이라 이 책의 예제는 POST로 표기합니다(책과 다른 설계 판단).

---

## 코어 3. 앱 골격과 핸들러 — `Program.cs`, Minimal API, 컨트롤러

> 원래 8.3 "ASP.NET Core 프로젝트 만들기·실행·Swagger"와 8.4 "Minimal API와 컨트롤러 기반 API의 기본". 서버 프로세스의 뼈대를 세우고(3.1) 시험 화면을 붙인 뒤(3.2), 요청을 처리할 핸들러를 두 가지 방식 중 하나로 매단다(3.3 Minimal API, 3.4 컨트롤러).

### 3.1 프로젝트 생성과 실행
**한 줄 요약:** `dotnet new webapi`로 만들고 `dotnet run`으로 띄우면 서버가 로컬 포트에서 요청을 기다립니다.

> 📖 출처: Web API Development with ASP.NET Core 8 2장 "Creating a simple REST web API project / Building and running the project" (텍스트 L4048-4240), ASP.NET Core in Action 3장 "3.4 Understanding the project layout ~ 3.7 Adding functionality" (텍스트 L2937-3480)

**핵심 설명**
- 생성: `dotnet new webapi -n MyFirstApi -controllers`(컨트롤러형). `-minimal`(`--use-minimal-apis`)은 Minimal API 형이며, `-controllers`도 `-minimal`도 주지 않으면 Minimal API가 만들어집니다(Web API Development with ASP.NET Core 8).
- 빌드는 `dotnet build`, 실행은 `dotnet run`. `dotnet run`은 개발용이고 운영 배포에는 `dotnet publish`를 씁니다(Web API Development with ASP.NET Core 8). 코드 변경을 즉시 반영하려면 `dotnet watch`(Hot Reload).
- 포트는 `Properties/launchSettings.json`에 있고, 프로젝트를 만들 때 HTTP는 5000-5300, HTTPS는 7000-7300 범위에서 무작위로 골라집니다(Web API Development with ASP.NET Core 8).
- 주요 파일(ASP.NET Core in Action 3.4~3.6): `.csproj`(대상 프레임워크, NuGet 패키지), `appsettings.json`(설정), `Program.cs`(앱 정의).
- `Program.cs`의 흐름(ASP.NET Core in Action 3.6~3.7): `WebApplicationBuilder`를 만들고 서비스를 등록한 뒤 `Build()`로 `WebApplication`을 얻고, 그 위에 미들웨어와 엔드포인트를 정의한 다음 `Run()`으로 서버를 시작합니다. 아래 번호는 이 흐름을 설명하기 위한 표기입니다.

```csharp
var builder = WebApplication.CreateBuilder(args);   // 1. 빌더 생성
builder.Services.AddSingleton(new GameInfo("Idle Heroes", "1.0"));  // 2. 서비스 등록
var app = builder.Build();                          // 3. 앱 빌드
                                                    // 4. (미들웨어는 이 자리에 추가)
app.MapGet("/api/info", (GameInfo info) => info);   // 5. 엔드포인트 매핑
app.Run();                                          // 6. 서버 시작

record GameInfo(string Name, string Version);
```

**방치형 RPG 서버에서는**: 이 `Program.cs`가 서버의 출발점입니다. 이후 부에서 배울 DI, 설정, DB, 인증을 서비스 등록(2번)과 미들웨어(4번) 자리에 추가하게 됩니다.

### 3.2 Swagger UI로 API 시험하기
**한 줄 요약:** Swagger UI는 브라우저에서 내 API 목록을 보고 버튼으로 바로 호출해 볼 수 있는 시험 화면입니다.

> 📖 출처: Web API Development with ASP.NET Core 8 2장 "Testing the API endpoint / Swagger UI / HttpRepl" (텍스트 L4243-4300), ASP.NET Core in Action 11장 "11.1 Adding an OpenAPI description / 11.2 Testing your APIs with Swagger UI" (텍스트 L13245-13447)

**핵심 설명**
- 브라우저는 GET 요청은 쉽게 보내지만 POST 같은 요청은 그렇지 않아서, Swagger UI, Postman, HttpRepl 같은 도구로 시험합니다(Web API Development with ASP.NET Core 8 2장). ASP.NET Core in Action은 Postman과 Swagger UI를 씁니다.
- OpenAPI는 API를 설명하는 언어 독립적 명세이고, Swagger는 그 관련 도구 이름입니다(ASP.NET Core in Action 11.1). 클라이언트 코드 자동 생성 등 다른 도구도 이 명세를 활용합니다.
- 추가법(ASP.NET Core in Action): `Swashbuckle.AspNetCore` 패키지 설치 → `AddEndpointsApiExplorer()`, `AddSwaggerGen()` 등록 → `UseSwagger()`, `UseSwaggerUI()`. `/swagger` 경로로 접속합니다(문서 JSON은 `/swagger/v1/swagger.json`). Web API Development with ASP.NET Core 8은 책 기준 템플릿에 이 기능(Swashbuckle)이 기본으로 들어 있다고 설명합니다.

> 🔧 보충(책 외): 이 PC의 SDK 10.0.401로 `dotnet new webapi`를 만들어 보니 `Microsoft.AspNetCore.OpenApi` 패키지와 `AddOpenApi()`/`MapOpenApi()`를 쓰고 Swashbuckle은 들어 있지 않았습니다. 최신 템플릿에서 아래 예제를 쓰려면 `dotnet add package Swashbuckle.AspNetCore`가 필요합니다.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddEndpointsApiExplorer();   // 엔드포인트 정보 수집
builder.Services.AddSwaggerGen();             // OpenAPI 문서 생성기

var app = builder.Build();
if (app.Environment.IsDevelopment())          // 개발 환경에서만 노출 (Architecting ASP.NET Core Applications 6장 예제와 같은 방식)
{
    app.UseSwagger();
    app.UseSwaggerUI();                       // https://localhost:포트/swagger
}

app.MapGet("/api/ping", () => "pong");
app.Run();
```

**방치형 RPG 서버에서는**: 클라이언트 개발자와 API 계약을 맞출 때 Swagger 화면 하나가 곧 문서가 됩니다(계약 자체는 코어 5의 5.2). 운영 서버에는 노출하지 않도록 개발 환경 조건을 두는 편이 안전합니다.

### 3.3 Minimal API: 핸들러를 직접 매핑
**한 줄 요약:** Minimal API는 `MapGet/MapPost` 등으로 URL과 함수(핸들러)를 바로 연결하는 가벼운 방식입니다.

> 📖 출처: ASP.NET Core in Action 5장 "5.2 Defining minimal API endpoints / 5.3 Generating responses with IResult / 5.5 Organizing your APIs with route groups" (텍스트 L5186-5470, L5472-5660, L6513-6660), Architecting ASP.NET Core Applications 5장 "Minimal APIs" (텍스트 L6746-6840), Web API Development with ASP.NET Core 8 2장 "Using DI in minimal APIs" (텍스트 L5600-5645)

**핵심 설명**
- 핸들러는 람다, 로컬 함수, 정적/인스턴스 메서드 무엇이든 됩니다(ASP.NET Core in Action 5.2.3).
- 반환 규칙(ASP.NET Core in Action 5.3): `void`는 200 빈 본문, `string`은 text/plain, `IResult`는 원하는 상태 코드, 그 밖의 객체는 JSON 200으로 직렬화됩니다.
- `Results`/`TypedResults` 도우미로 `Ok`, `Created`, `NotFound`, `BadRequest`, `NoContent` 등을 만듭니다. `TypedResults`는 구체 타입이라 테스트와 문서화에 유리합니다.
- 오류 형식은 웹 표준 Problem Details(`Results.Problem`, `ValidationProblem`)를 쓰면 일관됩니다(ASP.NET Core in Action 5.3.2).
- 엔드포인트가 많아지면 `MapGroup("/api/heroes")`로 공통 접두사와 필터를 묶습니다(ASP.NET Core in Action 5.5).
- Minimal API도 DI를 지원해서, 서비스 인터페이스를 핸들러 파라미터로 받으면 컨테이너가 구현체를 넣어 줍니다(Web API Development with ASP.NET Core 8 2장 "Using DI in minimal APIs").

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<HeroService>();
var app = builder.Build();

var heroes = app.MapGroup("/api/heroes");
heroes.MapGet("/{id:int}", (int id, HeroService svc) =>
    svc.Find(id) is { } hero ? TypedResults.Ok(hero) : Results.Problem(statusCode: 404));

app.Run();

public record Hero(int Id, string Name, int Level);
public class HeroService
{
    private readonly Dictionary<int, Hero> _db = new() { [1] = new Hero(1, "Arthur", 5) };
    public Hero? Find(int id) => _db.TryGetValue(id, out var h) ? h : null;
}
```

**방치형 RPG 서버에서는**: 작고 명확한 API(로그인, 보상 수령 등)를 빨리 만들 때 좋습니다. 엔드포인트가 늘면 `MapGroup`으로 묶어 정리합니다(Architecting ASP.NET Core Applications은 엔드포인트가 많은 큰 프로젝트에서 정리하기가 더 어렵다는 점을 단점으로 꼽습니다).

### 3.4 컨트롤러 기반 API와 선택 기준
**한 줄 요약:** 컨트롤러는 클래스 하나에 관련 엔드포인트(액션)를 모으고 특성(attribute)으로 설정하는 전통적 방식입니다.

> 📖 출처: Web API Development with ASP.NET Core 8 2장 "Understanding the MVC pattern / Creating a new model and controller / What is the difference between minimal APIs and controller-based APIs?" (텍스트 L4509-4680, L5647-5650), ASP.NET Core in Action 20장 "20.4 Using common conventions with [ApiController] / 20.6 Choosing between web API controllers and minimal APIs" (텍스트 L25530-25730, L25979-26115), Architecting ASP.NET Core Applications 6장 "Anatomy of ASP.NET Core web APIs" (텍스트 L9044-9120)

**핵심 설명**
- 컨트롤러는 `ControllerBase`를 상속하고 `[ApiController]`를 붙입니다. 웹 API는 뷰가 없으므로 모델과 컨트롤러만 있는 MVC입니다(Web API Development with ASP.NET Core 8).
- `[Route("api/[controller]")]`의 `[controller]`는 클래스 이름에서 `Controller`를 뺀 값(`Heroes`)으로 치환됩니다(Web API Development with ASP.NET Core 8).
- `[ApiController]`가 해 주는 일(ASP.NET Core in Action 20.4): 특성 라우팅 강제, 모델 검증 실패 시 자동 400, 복합 타입 파라미터의 `[FromBody]` 추론, 오류 상태를 ProblemDetails로 변환.
- 선택 기준(ASP.NET Core in Action 20.6): 콘텐츠 협상·복잡한 필터가 필요하거나 기존 컨트롤러 자산이 있으면 컨트롤러, 성능·단순함·신규 프로젝트면 Minimal API가 유리합니다. 결국 취향 문제라는 점도 명시합니다. 한 앱에서 섞어 써도 되지만 일관성을 우선하라고 조언합니다.
- 책마다 결론이 다릅니다. Web API Development with ASP.NET Core 8 저자는 Minimal API가 모델 바인딩, 모델 검증 같은 컨트롤러의 전체 기능을 지원하지 않는다(나중에 추가될 수도 있다)고 보고, 그래서 이 책에서는 컨트롤러 기반을 주로 쓰고 Minimal API는 자세히 다루지 않는다고 말합니다. ASP.NET Core in Action 저자는 반대로 다른 강한 이유가 없는 새 프로젝트라면 Minimal API를 기본으로 하라고 권합니다. 어느 쪽이든 아래 내용(라우팅, 바인딩, DTO)은 공통입니다.

```csharp
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();

public record Hero(int Id, string Name, int Level);

[ApiController]
[Route("api/[controller]")]                    // => /api/heroes
public class HeroesController : ControllerBase
{
    private static readonly List<Hero> Db = new() { new(1, "Arthur", 5) };

    [HttpGet("{id:int}")]
    public ActionResult<Hero> Get(int id)
    {
        var hero = Db.FirstOrDefault(h => h.Id == id);
        return hero is null ? NotFound() : Ok(hero);
    }
}
```

**방치형 RPG 서버에서는**: 두 방식 모두 결국 같은 라우팅·바인딩·JSON 위에서 동작하므로 어느 쪽을 골라도 뒤 부의 내용은 그대로 적용됩니다. 팀이 익숙한 쪽 하나로 통일하는 것이 가장 중요합니다.

---

## 코어 4. 요청 입구 3단계 — 라우팅 → 모델 바인딩 → 검증

> 원래 8.5 "라우팅"과 8.6 "모델 바인딩과 검증". 요청이 핸들러 코드에 닿기 전에 프레임워크가 하는 일을 순서대로 본다: 어느 핸들러인가(4.1 Minimal API 템플릿, 4.2 컨트롤러 특성 라우팅) → 문자열을 C# 값으로(4.3) → 그 값이 규칙에 맞는가(4.4). 각 단계의 실패는 서로 다른 상태 코드(404/405, 400/415, 400)로 끝난다.

### 4.1 라우트 템플릿과 제약 조건
**한 줄 요약:** 라우팅은 "들어온 요청의 URL·메서드를 보고 어떤 핸들러를 실행할지 고르는 일"입니다.

> 📖 출처: ASP.NET Core in Action 6장 "6.1 What is routing? / 6.3 Exploring the route template syntax" (텍스트 L6781-6940, L7155-7430), Web API Development with ASP.NET Core 8 3장 "Routing / Route constraints" (텍스트 L5699-5745, L5821-5872)

**핵심 설명**
- 라우트 템플릿은 리터럴 세그먼트(`heroes`)와 라우트 파라미터(`{id}`)로 구성됩니다. 리터럴은 대소문자를 구분하지 않습니다(ASP.NET Core in Action 6.3.1).
- 선택적 파라미터 `{slot?}`(맨 끝에만 가능)와 기본값 `{name=all}`이 있습니다(ASP.NET Core in Action 6.3.2).
- 제약 조건: `{id:int}`, `{id:guid}`, `{level:min(1)}`, `{id:int:range(1,100)}` 처럼 콜론으로 붙입니다(ASP.NET Core in Action 표 6.2, Web API Development with ASP.NET Core 8).
- 주의: 제약은 입력 검증용이 아닙니다. 맞지 않으면 404가 나가므로, 잘못된 입력은 400으로 알리는 편이 낫다고 두 책 모두 말합니다(ASP.NET Core in Action 6.3.3, Web API Development with ASP.NET Core 8).
- 두 템플릿이 같은 URL에 겹치면 예외가 납니다(Web API Development with ASP.NET Core 8의 `AmbiguousMatchException` 예). 겹치지 않게 설계하세요.

```csharp
var app = WebApplication.Create(args);

app.MapGet("/api/heroes/{id:int}", (int id) => $"hero {id}");
app.MapGet("/api/heroes/{id:int}/items/{slot?}",
    (int id, string? slot) => $"hero {id}, slot {slot ?? "전체"}");
app.MapGet("/api/players/{playerId:guid}", (Guid playerId) => $"player {playerId}");
// GET /api/heroes/abc  -> int 제약에 맞지 않아 404

app.Run();
```

**방치형 RPG 서버에서는**: 영웅 ID는 정수, 플레이어 ID는 GUID처럼 형태가 정해져 있으면 제약을 걸어 엉뚱한 URL이 핸들러까지 오지 않게 합니다. 단 "레벨이 범위 밖" 같은 값 검증은 제약이 아니라 검증(4.4)으로 처리합니다.

### 4.2 컨트롤러의 특성 라우팅과 메서드 매핑
**한 줄 요약:** 컨트롤러에서는 `[Route]`와 `[HttpGet]` 같은 특성이 라우트 템플릿을 대신 지정합니다.

> 📖 출처: Web API Development with ASP.NET Core 8 3장 "What is attribute routing? / Mapping HTTP methods to action methods" (텍스트 L5708-5820), ASP.NET Core in Action 20장 "20.3 Attribute routing" (텍스트 L25202-25530)

**핵심 설명**
- 컨트롤러 클래스의 `[Route]`와 액션 메서드의 `[HttpGet("...")]`가 합쳐져 최종 경로가 됩니다. 메서드 쪽이 `/`로 시작하면 합치지 않고 절대 경로가 됩니다(ASP.NET Core in Action 20.3.1).
- 액션은 HTTP 메서드 특성(`[HttpGet]`, `[HttpPost]`, `[HttpPut]`, `[HttpDelete]`, `[HttpPatch]`) 하나를 붙이는 것이 좋습니다(ASP.NET Core in Action 20.3.3). 경로는 맞는데 메서드가 다르면 405입니다.
- 액션 이름은 URL에 영향이 없고(`[action]` 토큰을 쓰지 않는 한), REST에서는 메서드로 구분합니다(Web API Development with ASP.NET Core 8).
- URL 소문자화는 `AddRouting(o => o.LowercaseUrls = true)`로 설정합니다(Web API Development with ASP.NET Core 8). 매칭 자체는 원래 대소문자를 구분하지 않아서, 이 설정은 `Url.Action`이나 `CreatedAtAction`의 `Location` 헤더처럼 프레임워크가 만들어 내는 URL의 표기에만 영향을 줍니다.
- 컨트롤러(Web API Development with ASP.NET Core 8)나 액션(ASP.NET Core in Action)에 `[Route]`를 여러 개 달아 같은 것을 여러 URL로 노출하는 것은 혼란을 주므로 권장하지 않습니다.

```csharp
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddRouting(o => o.LowercaseUrls = true);
var app = builder.Build();
app.MapControllers();
app.Run();

[ApiController]
[Route("api/[controller]")]
public class HeroesController : ControllerBase
{
    [HttpGet]                                   // GET /api/heroes
    public IActionResult List() => Ok(new[] { "Arthur", "Merlin" });

    [HttpGet("{id:int}")]                       // GET /api/heroes/3
    public IActionResult Get(int id) => Ok($"hero {id}");

    [HttpPost("{id:int}/upgrade")]              // POST /api/heroes/3/upgrade
    public IActionResult Upgrade(int id) => NoContent();
}
```

**방치형 RPG 서버에서는**: "영웅 강화"처럼 CRUD에 딱 맞지 않는 동작을 `{id}/upgrade` 같은 하위 경로로 표현하는 방식은 Web API Development with ASP.NET Core 8이 예로 든 `{id}/publish`와 같은 패턴입니다. 다만 Web API Development with ASP.NET Core 8은 publish에 PUT을 썼고, 이 책은 2.2의 보충대로 반복 시 결과가 달라지는 강화에 POST를 썼습니다.

### 4.3 모델 바인딩: 요청을 C# 값으로
**한 줄 요약:** 모델 바인딩은 요청의 문자열(경로, 쿼리, 헤더, 본문)을 핸들러 파라미터의 C# 타입으로 자동 변환해 줍니다.

> 📖 출처: ASP.NET Core in Action 7장 "7.1 Extracting values from a request with model binding / 7.2 Binding simple types / 7.3 Binding complex types to the JSON body / 7.5 Making parameters optional with nullables" (텍스트 L7893-8130, L8271-8362, L8464-8560), Web API Development with ASP.NET Core 8 3장 "Binding source attributes" (텍스트 L5874-5943)

**핵심 설명**
- 바인딩 원천(ASP.NET Core in Action 7.1): 라우트 값, 쿼리 문자열, 헤더, JSON 본문, DI 서비스, 커스텀 바인딩.
- 단순 타입(`int`, `string` 등): 이름이 라우트 파라미터와 같으면 경로에서, 아니면 쿼리 문자열에서 가져옵니다. 헤더는 `[FromHeader]`를 써야 합니다(ASP.NET Core in Action 7.2).
- 복합 타입(클래스/record): 기본적으로 JSON 본문에서 역직렬화합니다. 본문에 바인딩되는 파라미터는 하나만 가능합니다(ASP.NET Core in Action 7.3). GET은 본문 바인딩을 하지 않는 것이 관례이고, 시도하면 런타임 예외가 납니다.
- 변환 실패(예: `int`에 "two")나 필수 값 누락은 400 Bad Request입니다. 선택적으로 만들려면 `int?`처럼 nullable로 선언하거나 기본값을 줍니다(ASP.NET Core in Action 7.2, 7.5).
- 본문이 JSON이 아니면 415 Unsupported Media Type이 나갑니다(ASP.NET Core in Action 7.3).
- 컨트롤러는 `[ApiController]` 아래에서 추론 규칙이 같은 방향입니다: 복합 타입 → 본문, 라우트에 있는 이름 → 라우트, 단순 타입 → 쿼리(Web API Development with ASP.NET Core 8).

```csharp
using Microsoft.AspNetCore.Mvc;

var app = WebApplication.Create(args);

// GET /api/heroes/3/log?page=2   (헤더 X-Device: iphone)
app.MapGet("/api/heroes/{id:int}/log",
    (int id,                                       // 경로에서
     int? page,                                    // 쿼리에서, 없으면 null
     [FromHeader(Name = "X-Device")] string device // 헤더에서
    ) => $"hero {id}, page {page ?? 1}, device {device}");

// POST /api/heroes  본문 {"id":1,"name":"Arthur","level":1}
app.MapPost("/api/heroes", (Hero hero) => Results.Created($"/api/heroes/{hero.Id}", hero));

app.Run();

record Hero(int Id, string Name, int Level);
```

**방치형 RPG 서버에서는**: 페이지·조회 조건은 쿼리 문자열, 대상 식별은 경로, 변경할 내용은 JSON 본문, 기기/앱 버전 같은 부가 정보는 헤더로 받는 식으로 역할을 나눕니다.

### 4.4 입력 검증(Validation)
**한 줄 요약:** 클라이언트가 보낸 값은 절대 믿지 말고, 사용하기 전에 규칙(필수, 범위, 길이)으로 검증합니다.

> 📖 출처: ASP.NET Core in Action 7장 "7.10 Handling user input with model validation" (텍스트 L8953-9330, 7.10.3은 L9197~), ASP.NET Core in Action 20장 "20.4 Using common conventions with [ApiController]" (텍스트 L25530-25700)

**핵심 설명**
- 요청 데이터는 악의적이지 않아도 형식 오류·범위 오류가 흔하므로, 도메인이나 DB를 건드리기 전에 검증하라고 ASP.NET Core in Action은 강조합니다(7.10.1).
- 규칙은 DataAnnotations 특성으로 선언합니다: `[Required]`, `[StringLength]`, `[Range]`, `[EmailAddress]` 등(ASP.NET Core in Action 7.10.2). 속성 간 규칙은 `IValidatableObject`로 보완할 수 있습니다. 복잡한 비즈니스 규칙은 별도 코드에서 검증하라고 조언합니다.
- 컨트롤러(`[ApiController]`)는 검증 실패 시 자동으로 400(검증 오류 Problem Details)을 반환합니다(ASP.NET Core in Action 20.4).
- Minimal API는 기본 내장 검증이 없습니다. ASP.NET Core in Action은 .NET 7 기준으로 "검증을 기본 제공하지 않고 필터로 붙이게 했다"고 설명하고(7.10, 7.10.3), 필터를 직접 쓰거나 `MinimalApis.Extensions` 패키지의 `WithParameterValidation()`을 쓰는 방법을 소개합니다. Web API Development with ASP.NET Core 8도 Minimal API에는 모델 검증이 없다고 적습니다. 반면 ASP.NET Core in Action은 MVC와 Razor Pages에서는 검증이 핵심 내장 기능이라고 말합니다.

> 🔧 보충(책 외): SDK 10.0.401에서 `builder.Services.AddValidation()`을 등록하고 DataAnnotations를 단 record를 Minimal API로 받아 보니 잘못된 값에 400이 반환되었습니다. 즉 최신 .NET에는 책에 없는 내장 지원이 있습니다. 어느 버전에서 생겼는지는 책으로 확인되지 않으니 사용 중인 버전에서 직접 확인하세요.

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();

public class CreateHeroRequest
{
    [Required, StringLength(20)]
    public string Name { get; set; } = "";

    [Range(1, 100)]
    public int Level { get; set; } = 1;
}

[ApiController]
[Route("api/heroes")]
public class HeroesController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(CreateHeroRequest req)
        => Created("/api/heroes/1", req);   // Name이 비었거나 Level이 200이면 400이 자동 반환
}
```

**방치형 RPG 서버에서는**: "강화 횟수 -1", "구매 수량 0" 같은 비정상 값은 검증 단계에서 400으로 막습니다. 검증은 서버가 반드시 해야 하는 방어선이고, 클라이언트(모바일 앱)의 검증은 편의일 뿐 신뢰할 수 없습니다.

---

## 코어 5. 입출력 통제 — DTO·API 계약·JSON 설정

> 원래 8.7 "DTO 패턴과 API 계약"과 8.8 "JSON 직렬화 설정". 서버 경계를 넘나드는 데이터의 모양을 서버가 정한다: 무엇이 들어오고 나가는가(5.1 DTO), 그것을 클라이언트와 어떻게 약속하는가(5.2 계약), 바이트로는 어떻게 쓰이는가(5.3 JSON).

### 5.1 DTO: 도메인 모델과 API 입출력을 분리
**한 줄 요약:** DTO는 API가 주고받는 데이터만 담은 전용 객체로, 내부 모델(DB 엔티티)을 그대로 노출하지 않게 막아 줍니다.

> 📖 출처: Architecting ASP.NET Core Applications 4장 "The Data Transfer Object (DTO) pattern" (텍스트 L5955-6130), Architecting ASP.NET Core Applications 5장 "Using Minimal APIs with Data Transfer Objects" (텍스트 L8428-8800)

**핵심 설명**
- 목표: 엔드포인트의 입력과 출력을 통제하고, 내부 구조와 외부 API를 느슨하게 결합하는 것(Architecting ASP.NET Core Applications 4장). 그러면 내부 모델을 바꿔도 클라이언트에 영향이 없습니다.
- 흐름: 요청 → 역직렬화/바인딩으로 입력 DTO → 도메인 로직 → 출력 DTO → 직렬화로 응답(Architecting ASP.NET Core Applications 그림 4.2, 5.5).
- 엔티티를 그대로 받으면 위험합니다. Architecting ASP.NET Core Applications은 PUT에서 클라이언트가 계약 목록을 빠뜨리면 데이터가 지워지는 예를 보여 줍니다. 입력 DTO(`UpdateCustomer(string Name)`)로 바꾸면 이름만 바뀝니다(Architecting ASP.NET Core Applications 5장).
- 보안 측면: 로그인 DTO에 `IsAdmin`이 없으면 악의적 사용자가 그 필드를 바인딩할 수 없습니다(Architecting ASP.NET Core Applications 4장).
- 출력 DTO로 여러 번 호출할 데이터를 한 번에 묶거나 구조를 평평하게 만들 수 있습니다.

```csharp
var app = WebApplication.Create(args);
var db = new List<HeroEntity>
{
    new() { Id = 1, Name = "Arthur", Level = 3, Gold = 1_000, IsBanned = false }
};

// 출력 DTO: 필요한 필드만 (Gold, IsBanned는 내보내지 않음)
app.MapGet("/api/heroes/{id:int}", (int id) =>
    db.FirstOrDefault(h => h.Id == id) is { } e
        ? Results.Ok(new HeroResponse(e.Id, e.Name, e.Level))
        : Results.NotFound());

// 입력 DTO: 클라이언트가 바꿀 수 있는 것은 이름뿐
app.MapPut("/api/heroes/{id:int}", (int id, RenameHeroRequest req) =>
{
    var e = db.FirstOrDefault(h => h.Id == id);
    if (e is null) return Results.NotFound();
    e.Name = req.Name;
    return Results.Ok(new HeroResponse(e.Id, e.Name, e.Level));
});

app.Run();

record HeroResponse(int Id, string Name, int Level);
record RenameHeroRequest(string Name);
class HeroEntity
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Level { get; set; }
    public long Gold { get; set; }
    public bool IsBanned { get; set; }
}
```

**방치형 RPG 서버에서는**: 클라이언트가 보낸 JSON에 `gold` 필드를 끼워 넣어도 입력 DTO에 없으면 무시되어, 재화 조작을 구조적으로 어렵게 만듭니다. 골드 같은 값은 서버가 계산하고, 클라이언트는 결과만 받습니다.

### 5.2 API 계약
**한 줄 요약:** API 계약은 "이 URL에 이 메서드로 이런 입력을 보내면 이런 출력·상태 코드가 온다"는 서버와 클라이언트의 약속 문서입니다.

> 📖 출처: Architecting ASP.NET Core Applications 4장 "API contracts" (텍스트 L6132-6200), ASP.NET Core in Action 11장 "11.1 Adding an OpenAPI description to your app" (텍스트 L13245-13270)

**핵심 설명**
- 엔드포인트마다 최소한 URI, HTTP 메서드, 입력(본문·경로·쿼리·헤더), 출력(본문+상태 코드)을 명시합니다(Architecting ASP.NET Core Applications). 입력과 출력은 대부분 DTO입니다.
- 계약을 적는 방법: 문서 파일, Markdown, 또는 OpenAPI 표준(Swagger)이 있고, 표준을 쓰면 자동화 도구를 활용할 수 있습니다(Architecting ASP.NET Core Applications, ASP.NET Core in Action).
- 계약을 한번 공개하면 바꾸기 어렵기에 버전 관리 전략(URL에 `/v2/`를 넣거나 헤더로 지정)을 미리 정해 두라고 합니다(Architecting ASP.NET Core Applications 4장 Versioning).

```csharp
// 계약을 코드로 표현: 입력 DTO, 출력 DTO, 상태 코드가 시그니처에 드러난다
//   POST /api/v1/heroes/{id}/upgrade
//   입력:  UpgradeRequest(int Times)
//   출력:  200 UpgradeResponse | 400 (검증 실패) | 404 (영웅 없음)
public record UpgradeRequest(int Times);
public record UpgradeResponse(int NewLevel, long GoldLeft);
```

> 🔧 보충(책 외): 모바일 앱은 스토어 심사·배포 때문에 구버전 앱이 오래 남습니다. 그래서 응답 필드는 추가만 하고 삭제·이름 변경은 피하며, 필요하면 `/api/v2/`를 새로 여는 식의 운영이 일반적입니다(Architecting ASP.NET Core Applications의 versioning 논의를 게임에 적용한 것).

**방치형 RPG 서버에서는**: 서버와 모바일 클라이언트가 서로 다른 시기에 배포되므로 계약이 곧 안전장치입니다. Swagger 문서(3.2)를 계약서로 삼아 양쪽이 같은 화면을 보게 하세요.

### 5.3 System.Text.Json 기본과 설정
**한 줄 요약:** ASP.NET Core는 기본으로 `System.Text.Json`을 써서 객체를 JSON으로 바꾸고, 옵션으로 이름 규칙·enum 표현·null 처리를 조절합니다.

> 📖 출처: Architecting ASP.NET Core Applications 5장 "Configuring JSON serialization" (텍스트 L7772-7860, L20755-20770), ASP.NET Core in Action 7장 "Configuring JSON binding with System.Text.Json" (텍스트 L8304-8335), Web API Development with ASP.NET Core 8 "Using System.Text.Json instead of Newtonsoft.Json" (텍스트 L22334-22361), Web API Development with ASP.NET Core 8 6장 순환 참조 (텍스트 L10428-10433)

**핵심 설명**
- `System.Text.Json`은 .NET Core 3.0부터 들어온 고성능 라이브러리로, 최신 웹 API 템플릿의 기본입니다. Newtonsoft.Json은 필요할 때만 별도 패키지로 쓰라고 권합니다(Web API Development with ASP.NET Core 8).
- Minimal API에서는 `builder.Services.ConfigureHttpJsonOptions(...)`로 전역 옵션을 바꿉니다. 컨트롤러는 `AddControllers().AddJsonOptions(...)`를 씁니다(Architecting ASP.NET Core Applications 5·6장).
- 자주 쓰는 설정: `PropertyNamingPolicy`(예: CamelCase, KebabCaseLower), enum을 문자열로(`JsonStringEnumConverter`), null 속성 생략(`DefaultIgnoreCondition = WhenWritingNull`)(Architecting ASP.NET Core Applications).
- Minimal API에서는 직렬화 라이브러리를 Newtonsoft로 바꿀 수 없습니다(ASP.NET Core in Action 7.3). 컨트롤러 쪽은 `Microsoft.AspNetCore.Mvc.NewtonsoftJson` 패키지로 바꿀 수 있지만 Web API Development with ASP.NET Core 8은 특별한 이유가 없으면 System.Text.Json을 권합니다.
- ASP.NET Core in Action(.NET 7)은 Minimal API의 JSON 옵션을 `ConfigureRouteHandlerJsonOptions`로 바꾸는 예를 보여 주고, Architecting ASP.NET Core Applications(.NET 8)는 `ConfigureHttpJsonOptions`를 씁니다. 아래 예제는 Architecting ASP.NET Core Applications 방식입니다. 또 Architecting ASP.NET Core Applications의 예시 출력을 보면 웹 기본 옵션에서도 이름이 이미 camelCase(`firstName`)로 나가므로, 아래 `CamelCase` 지정은 명시적으로 드러내기 위한 것입니다. enum 문자열 변환은 기본값이 아니라 Architecting ASP.NET Core Applications이 "전역으로 바꾸곤 한다"고 소개하는 설정입니다.
- 순환 참조가 있는 엔티티는 `[JsonIgnore]`나 `ReferenceHandler.IgnoreCycles`로 해결할 수 있습니다(Web API Development with ASP.NET Core 8 6장) — DTO를 쓰면 애초에 이 문제가 줄어듭니다.

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());          // enum -> "Warrior"
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});
var app = builder.Build();

app.MapGet("/api/heroes/1", () => new HeroDto(1, "Arthur", HeroClass.Warrior, null));
// 결과: {"id":1,"name":"Arthur","class":"Warrior"}   (Title이 null이라 생략)

app.Run();

enum HeroClass { Warrior, Mage }
record HeroDto(int Id, string Name, HeroClass Class, string? Title);
```

> 🔧 보충(책 외): 방치형 게임의 재화는 매우 큰 수가 됩니다. JSON 숫자는 클라이언트 언어에 따라 큰 정수(약 9천조 이상)를 정확히 다루지 못할 수 있어, 아주 큰 값은 `"1234567890123456789012"` 같은 문자열로 주고받는 방식이 흔합니다(BigInteger는 [제5부](05_제5부_NET_기본_라이브러리.md) 참고). 이는 이 책들에 나온 내용이 아니라 보충 설명입니다.

**방치형 RPG 서버에서는**: 클라이언트 쪽 JSON 파서의 기대(camelCase인지, enum이 숫자인지 문자열인지)와 서버 설정을 미리 맞춰 두면 필드 이름 불일치 버그를 막을 수 있습니다. 설정은 `Program.cs` 한 곳에서 전역으로 정하세요.

---

## 실무 적용

### 체크리스트
- [ ] 클라이언트는 요청마다 누구인지(토큰 등)와 필요한 정보를 실어 보낸다. 서버는 "지난 요청"이나 연결에 유저 상태를 기대지 않는다. → 코어 1
- [ ] 클라이언트가 상태 코드만으로 성공/입력 오류(4xx)/서버 오류(5xx)를 분기할 수 있게, 생성은 201(+`Location`), 본문 없음은 204, 충돌은 409처럼 표준 코드를 쓴다. "200 + 본문 자체 코드"는 쓰지 않는다. → 코어 1
- [ ] 서버 푸시가 꼭 필요한 기능(채팅·실시간 랭킹·길드 알림)이 아니면 요청/응답으로 시작한다. 폴링을 쓰면 간격을 넉넉히 잡는다. → 코어 1
- [ ] URL은 복수 명사, 관계는 중첩(너무 깊게 X), 필터·정렬·페이지는 쿼리, 강화 같은 동작은 하위 리소스(`/api/heroes/{id}/upgrade`)로 둔다. → 코어 2
- [ ] 재화가 걸린 POST는 "네트워크가 끊겨 재시도해도 안전한가"(멱등성)를 따로 검토한다. → 코어 2
- [ ] 예제의 `List<Hero>` 같은 공유 컬렉션은 스레드 안전하지 않다. 실제 서버는 DB(또는 `ConcurrentDictionary`)를 쓴다. → 코어 2
- [ ] `Program.cs`의 서비스 등록 자리와 미들웨어 자리를 구분해 둔다. 운영 배포는 `dotnet run`이 아니라 `dotnet publish`. → 코어 3
- [ ] Swagger UI는 `IsDevelopment()` 조건 안에서만 노출한다(최신 템플릿은 Swashbuckle이 없으니 패키지를 추가하거나 `AddOpenApi()`를 쓴다). → 코어 3
- [ ] Minimal API와 컨트롤러 중 팀이 익숙한 쪽 하나로 통일한다. 엔드포인트가 늘면 `MapGroup`으로 묶는다. → 코어 3
- [ ] 라우트 제약(`{id:int}`, `{playerId:guid}`)은 ID 형태 거르기에만 쓰고, 범위·값 검증은 검증 단계에서 400으로 처리한다. 겹치는 템플릿을 만들지 않는다. → 코어 4
- [ ] 대상 식별은 경로, 조회 조건은 쿼리, 변경 내용은 JSON 본문(하나만), 기기·앱 버전은 헤더로 받는다. → 코어 4
- [ ] "강화 횟수 -1", "구매 수량 0" 같은 비정상 값을 DataAnnotations 등으로 서버에서 막는다. 클라이언트 검증은 편의일 뿐이다. Minimal API는 사용 중인 .NET 버전의 검증 지원을 확인한다. → 코어 4
- [ ] 엔티티를 그대로 받거나 내보내지 않는다. 입력 DTO에 `gold`·`IsAdmin` 같은 필드를 두지 않고, 출력 DTO에서 `Gold`·`IsBanned` 같은 내부 필드를 뺀다. → 코어 5
- [ ] 엔드포인트마다 URI·메서드·입력·출력(+상태 코드)을 계약으로 남기고, 응답 필드는 추가만 하며 깨지는 변경은 `/api/v2/`로 연다. → 코어 5
- [ ] JSON 옵션(camelCase, enum 문자열 여부, null 생략)을 `Program.cs`에서 전역으로 정하고 클라이언트 파서와 맞춘다. 아주 큰 재화 값은 문자열로 주고받는다. → 코어 5

### 시나리오로 확인하기
1. **상황:** TCP 서버에서 하던 대로 "로그인한 유저"를 서버 메모리의 정적 딕셔너리에 연결 단위로 들고 있다가, 다음 요청에서 그 값을 꺼내 쓰도록 만들었다. 개발 PC에서는 잘 되는데, 서버를 두 대로 늘린 스테이징에서 "가끔 로그인이 풀린다"는 보고가 들어온다.
   **질문:** 원인은 무엇이고, HTTP 서버에서는 어떻게 설계해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   HTTP는 상태를 기억하지 않는 요청/응답 프로토콜이고, 무상태라는 전제 덕분에 서버를 여러 대로 늘리기(scale out) 쉽다. 연속된 요청이 같은 서버, 같은 연결로 온다는 보장이 없으므로 한 서버의 메모리에 둔 "현재 유저"는 다른 서버에서 보이지 않는다. 클라이언트가 요청마다 누구인지(토큰 등)와 필요한 정보를 실어 보내게 하고, 서버는 그것으로 매번 판단한다. → 코어 1 (1.1, 2.1)

   </details>

2. **상황:** 보상 수령 API를 `POST /api/rewards/claim`으로 만들었다. 지하철에서 응답을 받기 직전에 연결이 끊긴 클라이언트가 같은 요청을 다시 보냈고, 보상이 두 번 지급됐다. TCP 서버 시절에는 같은 패킷이 앱 레벨에서 두 번 도착하는 일을 거의 신경 쓰지 않았다.
   **질문:** 메서드 성질 관점에서 무엇을 놓쳤나?

   <details markdown="1"><summary>답 확인</summary>

   POST는 안전하지도 멱등하지도 않다. 같은 요청을 반복하면 결과 상태가 달라질 수 있다(GET은 안전, PUT/DELETE는 멱등). 멱등성은 "네트워크가 끊겨 재시도해도 안전한가"를 판단하는 기준이므로 재화가 걸린 POST는 특히 주의해야 한다. 클라이언트는 응답을 못 받으면 재시도하므로, 서버는 같은 요청이 두 번 오는 상황을 전제로 설계한다. → 코어 2 (2.2)

   > 🔧 보충(책 외): 흔한 해법은 클라이언트가 요청마다 고유 키를 붙이고 서버가 처리한 키를 기록해 두 번째 요청에는 처음 결과를 돌려주는 것이다. 멱등성 키 구현은 [제10부](10_제10부_EF_Core_데이터_접근.md)의 멱등성 키 설명을 참고한다.

   </details>

3. **상황:** 클라이언트 팀이 "`GET /api/heroes/abc` 를 보내면 404가 와서 라우트가 배포되지 않은 줄 알았다"고 한다. 또 레벨 범위를 `{level:range(1,100)}` 제약으로 막아 두었더니, 레벨 200을 보낸 요청도 404가 났다.
   **질문:** 무엇이 잘못됐고, 어떻게 나눠야 하나?

   <details markdown="1"><summary>답 확인</summary>

   라우트 제약은 입력 검증용이 아니다. 제약에 맞지 않으면 "그런 경로가 없다(404)"가 나가서 잘못된 입력(400)이라는 사실을 알려 주지 못한다. 제약은 정수 ID·GUID처럼 형태가 정해진 값으로 엉뚱한 URL이 핸들러까지 오지 않게 하는 데만 쓰고, "레벨이 범위 밖" 같은 값 검증은 DataAnnotations(`[Range(1, 100)]`) 같은 검증 단계에서 400으로 처리한다. 컨트롤러(`[ApiController]`)는 검증 실패 시 400을 자동으로 돌려준다. → 코어 4 (4.1, 4.4)

   </details>

4. **상황:** 영웅 이름 변경 API가 `HeroEntity`를 그대로 본문으로 받는다. 어느 날 이름만 바꾼 유저의 골드가 0이 되었고, 다른 유저는 요청 JSON에 `"gold": 99999999`를 넣어 보냈다.
   **질문:** 두 사고의 공통 원인과 해결책은?

   <details markdown="1"><summary>답 확인</summary>

   엔티티를 그대로 입력으로 받았기 때문이다. 빠진 필드는 기본값으로 덮어써져 데이터가 지워지고(Architecting ASP.NET Core Applications의 PUT 계약 목록 예), 끼워 넣은 필드는 그대로 바인딩된다(로그인 DTO의 `IsAdmin` 예와 같은 구조). 입력 DTO(`RenameHeroRequest(string Name)`)로 바꾸면 이름만 바뀌고 `gold`는 무시된다. 출력도 `HeroResponse`처럼 필요한 필드만 담는다. 골드는 서버가 계산한다. → 코어 5 (5.1)

   </details>

5. **상황:** 응답 DTO의 `exp` 필드 이름을 `experience`로 바꿔 배포했더니, 아직 스토어 업데이트를 받지 못한 구버전 앱에서 경험치가 0으로 보인다는 문의가 쏟아진다.
   **질문:** 이 변경을 어떻게 했어야 하나?

   <details markdown="1"><summary>답 확인</summary>

   API 계약은 한번 공개하면 바꾸기 어렵다. 모바일 앱은 구버전이 오래 남으므로 응답 필드는 추가만 하고 삭제·이름 변경은 피하며, 꼭 필요하면 `/api/v2/`처럼 새 버전을 연다(보충). 버전 관리 전략(URL의 `/v2/` 또는 헤더)은 미리 정해 두고, 계약은 OpenAPI(Swagger)로 적어 양쪽이 같은 문서를 본다. → 코어 5 (5.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
웹 API 기초
├─ 코어 1 무상태 요청/응답
│   ├─ 1.1 HTTP: ( ? ) 프로토콜 / 요청 = 메서드+경로+( ? )+( ? ) / Kestrel → ( ? )
│   ├─ 1.2 메서드 5개 ____ / 상태 코드 계열 2xx·3xx·4xx·5xx / 주요 코드 ____
│   └─ 1.3 폴링 한계 ____ / 실시간 4종 ____ / SignalR 대체 순서 ( ? )
├─ 코어 2 리소스 중심 설계
│   ├─ 2.1 REST 제약 6가지 ____ / 관례 3가지 ____ / 무상태 → ( ? ) 쉬움
│   └─ 2.2 설계 순서 리소스→관계→동작→URL→메서드→( ? )→문서화
│          URL 규칙 ____ / 안전·멱등 표 GET=( ? ) PUT·DELETE=( ? ) POST·PATCH=( ? )
├─ 코어 3 앱 골격과 핸들러
│   ├─ 3.1 dotnet new webapi (-controllers / -minimal) / run vs publish vs watch / Program.cs 6단계 ____
│   ├─ 3.2 Swagger: 패키지 ( ? ) → 등록 2개 → Use 2개 / 노출 조건 ( ? )
│   ├─ 3.3 Minimal API: 반환 규칙 void/string/IResult/객체 / Results vs TypedResults / MapGroup
│   └─ 3.4 컨트롤러: ControllerBase + [ApiController]가 해 주는 4가지 ____ / 선택 기준 ( ? )
├─ 코어 4 요청 입구 3단계
│   ├─ 4.1 라우팅: 리터럴·파라미터·선택적{x?}·기본값{x=v}·제약{id:int} / 제약 불일치 = ( ? )
│   ├─ 4.2 특성 라우팅: [Route]+[HttpGet] 결합, "/"로 시작하면 ( ? ) / LowercaseUrls 영향 ( ? )
│   ├─ 4.3 바인딩 원천 ____ / 단순 타입 규칙 ( ? ) / 복합 타입 = ( ? ) / 400·415 조건
│   └─ 4.4 검증: DataAnnotations ____ / 컨트롤러 자동 ( ? ) / Minimal API(책 기준) ( ? )
└─ 코어 5 입출력 통제
    ├─ 5.1 DTO 흐름 요청→입력DTO→로직→출력DTO→응답 / 위험 예 ( ? ) / 보안 예 ( ? )
    ├─ 5.2 API 계약 4요소 ____ / 버전 전략 ( ? )
    └─ 5.3 JSON: System.Text.Json / Minimal ( ? ) vs 컨트롤러 ( ? ) / 옵션 3가지 ____ / 순환 참조 ( ? )
```

### 2. 인출 질문

1. HTTP 요청과 응답은 각각 무엇으로 구성되며, "무상태"는 서버 설계에 어떤 의미가 있나요?

   <details markdown="1"><summary>답 확인</summary>

   요청은 메서드 + 경로, 보통 헤더, 필요하면 본문으로 이뤄지고, 응답은 상태 코드와 선택적 헤더·본문으로 이뤄진다. 서버는 지난 요청을 기억하지 않으므로 클라이언트가 요청마다 누구인지(토큰 등)와 필요한 정보를 실어 보낸다. 무상태 덕분에 scale out이 쉽다. → 코어 1 (1.1), 코어 2 (2.1)

   </details>

2. ASP.NET Core에서 요청이 내 코드에 도달하기까지 Kestrel의 역할은?

   <details markdown="1"><summary>답 확인</summary>

   ASP.NET Core 앱 안의 웹 서버인 Kestrel이 받은 요청을 `HttpContext` 객체로 바꿔 내 코드에 넘겨준다. → 코어 1 (1.1)

   </details>

3. 상태 코드 400, 401, 403, 404, 409의 차이는? 생성했는데 200 + 본문 자체 코드로 응답하면 안 되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   400 잘못된 입력, 401 로그인 필요, 403 권한 없음, 404 없음, 409 현재 상태와 충돌. 프록시 같은 중간 장비가 표준 코드를 기준으로 동작하므로 생성은 201(`Location` 헤더 동반)처럼 표준 코드를 써야 한다. → 코어 1 (1.2)

   </details>

4. 폴링의 한계와 실시간 통신 기술 네 가지, SignalR의 전송 대체 순서는?

   <details markdown="1"><summary>답 확인</summary>

   간격이 짧으면 서버 부하, 길면 늦은 반영이며 변경 감지 로직이 복잡하고 rate limit에 걸릴 수 있다. 실시간 기술: 긴 폴링, SSE(단방향), WebSocket(양방향), gRPC 스트리밍(주로 서버 간). SignalR은 WebSocket → SSE → 긴 폴링 순으로 자동 대체한다. → 코어 1 (1.3)

   </details>

5. REST의 여섯 가지 제약과, 책이 REST를 대하는 태도는?

   <details markdown="1"><summary>답 확인</summary>

   클라이언트-서버 분리, 무상태, 캐시 가능성, 계층형 시스템, 통일된 인터페이스, 선택 사항인 코드 온디맨드. REST는 스타일이지 규칙이 아니며 다 지키는지 논쟁하기보다 동작하게 만드는 게 중요하지만, 새 프로젝트라면 관례를 따르라고 한다. → 코어 2 (2.1)

   </details>

6. URL 설계 규칙과, CRUD로 표현하기 애매한 동작(예: 게시, 강화)의 처리법은?

   <details markdown="1"><summary>답 확인</summary>

   동사 대신 명사, 컬렉션은 복수형, 부모-자식은 중첩(너무 깊게는 X), 필터·정렬·페이지는 쿼리 문자열. 애매한 동작은 하위 리소스(`/posts/{id}/publish`)로 두거나 `IsPublished` 같은 필드 수정으로 취급한다. → 코어 2 (2.2)

   </details>

7. 안전(safe)과 멱등(idempotent)의 뜻과 각 메서드의 성질은? 멱등이면 응답도 같은가요?

   <details markdown="1"><summary>답 확인</summary>

   안전은 상태를 바꾸지 않음, 멱등은 같은 요청을 반복해도 결과 상태가 같음. GET은 안전, PUT/DELETE는 멱등, POST/PATCH는 둘 다 아니다. 멱등이라도 응답은 다를 수 있어 삭제를 반복하면 두 번째는 404가 나올 수 있다. 그래서 반복 시 레벨이 계속 오르는 강화는 이 책에서 POST로 표기한다. → 코어 2 (2.2)

   </details>

8. `dotnet new webapi` 에서 `-controllers` 와 `-minimal` 을 모두 생략하면? `dotnet run`·`publish`·`watch` 의 용도는?

   <details markdown="1"><summary>답 확인</summary>

   Minimal API 형으로 만들어진다. `dotnet run` 은 개발용 실행, `dotnet publish` 는 운영 배포, `dotnet watch` 는 코드 변경 즉시 반영(Hot Reload). 포트는 `Properties/launchSettings.json` 에 있다. → 코어 3 (3.1)

   </details>

9. `Program.cs` 의 기본 흐름을 순서대로 말하세요.

   <details markdown="1"><summary>답 확인</summary>

   `WebApplication.CreateBuilder` 로 빌더 생성 → `builder.Services` 에 서비스 등록 → `Build()` 로 `WebApplication` 얻기 → 미들웨어 추가 → 엔드포인트 매핑 → `Run()` 으로 서버 시작. → 코어 3 (3.1)

   </details>

10. OpenAPI와 Swagger의 관계, 그리고 Swagger UI를 개발 환경에서만 노출하는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    OpenAPI는 API를 설명하는 언어 독립적 명세이고 Swagger는 관련 도구 이름이다. `AddEndpointsApiExplorer()`/`AddSwaggerGen()` 등록 후 `UseSwagger()`/`UseSwaggerUI()` 로 `/swagger` 에 노출한다. 운영 서버에 노출하지 않도록 `IsDevelopment()` 조건을 두는 편이 안전하다. (보충: 최신 템플릿은 Swashbuckle 대신 `AddOpenApi()` 를 쓴다.) → 코어 3 (3.2)

    </details>

11. Minimal API 핸들러의 반환 타입별 응답 규칙과 `TypedResults` 의 장점은?

    <details markdown="1"><summary>답 확인</summary>

    `void` 는 200 빈 본문, `string` 은 text/plain, `IResult` 는 원하는 상태 코드, 그 밖의 객체는 JSON 200. `TypedResults` 는 구체 타입이라 테스트와 문서화에 유리하다. 오류는 Problem Details로 일관되게 낸다. → 코어 3 (3.3)

    </details>

12. `[ApiController]` 가 해 주는 네 가지와, Minimal API vs 컨트롤러 선택 기준은?

    <details markdown="1"><summary>답 확인</summary>

    특성 라우팅 강제, 모델 검증 실패 시 자동 400, 복합 타입 파라미터의 `[FromBody]` 추론, 오류 상태를 ProblemDetails로 변환. 콘텐츠 협상·복잡한 필터·기존 컨트롤러 자산이 있으면 컨트롤러, 성능·단순함·신규 프로젝트면 Minimal API. 결국 취향이며 일관성이 우선이다(두 책의 결론은 서로 다르다). → 코어 3 (3.4)

    </details>

13. 라우트 제약(`{id:int}`)을 입력 검증용으로 쓰면 안 되는 이유는? 두 템플릿이 같은 URL에 겹치면?

    <details markdown="1"><summary>답 확인</summary>

    제약에 맞지 않으면 404가 나가므로, 잘못된 입력은 400으로 알리는 편이 낫다. 제약은 형태가 정해진 ID 등으로 엉뚱한 URL이 핸들러까지 오지 않게 하는 용도다. 두 템플릿이 겹치면 `AmbiguousMatchException` 같은 예외가 난다. → 코어 4 (4.1)

    </details>

14. 특성 라우팅에서 최종 경로는 어떻게 결정되며, `LowercaseUrls = true` 는 무엇에 영향을 주나요?

    <details markdown="1"><summary>답 확인</summary>

    컨트롤러의 `[Route]` 와 액션의 `[HttpGet("...")]` 등이 합쳐지고, 액션 쪽이 `/` 로 시작하면 합치지 않고 절대 경로가 된다. 경로는 맞는데 메서드가 다르면 405. 매칭은 원래 대소문자를 구분하지 않으므로 `LowercaseUrls` 는 `Url.Action`·`CreatedAtAction` 의 `Location` 처럼 프레임워크가 만드는 URL 표기에만 영향을 준다. → 코어 4 (4.2)

    </details>

15. 모델 바인딩에서 단순 타입과 복합 타입은 각각 어디서 값을 가져오나요? 400과 415는 언제 나오나요?

    <details markdown="1"><summary>답 확인</summary>

    단순 타입은 이름이 라우트 파라미터와 같으면 경로, 아니면 쿼리(헤더는 `[FromHeader]` 필요). 복합 타입은 JSON 본문에서 역직렬화하며 본문 바인딩 파라미터는 하나만 가능하고 GET에서는 하지 않는다. 변환 실패나 필수 값 누락은 400(선택적이면 `int?` 나 기본값), 본문이 JSON이 아니면 415. → 코어 4 (4.3)

    </details>

16. 입력 검증은 어떻게 선언하며, 컨트롤러와 Minimal API(책 기준)의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    `[Required]`, `[StringLength]`, `[Range]`, `[EmailAddress]` 같은 DataAnnotations로 선언하고 속성 간 규칙은 `IValidatableObject`, 복잡한 비즈니스 규칙은 별도 코드로 검증한다. `[ApiController]` 컨트롤러는 실패 시 자동 400을 반환하고, Minimal API는 책 기준으로 내장 검증이 없어 필터나 `WithParameterValidation()` 을 쓴다(보충: 최신 SDK에는 `AddValidation()` 이 있다). → 코어 4 (4.4)

    </details>

17. DTO를 쓰지 않고 엔티티를 그대로 받으면 생기는 문제 두 가지는?

    <details markdown="1"><summary>답 확인</summary>

    PUT에서 클라이언트가 계약 목록을 빠뜨리면 데이터가 지워지는 데이터 손실(입력 DTO `UpdateCustomer(string Name)` 로 바꾸면 이름만 바뀜), 그리고 로그인에 `IsAdmin` 같은 필드를 악의적으로 바인딩하는 보안 문제. DTO는 입출력을 통제하고 내부 모델과 외부 API를 느슨하게 결합한다. → 코어 5 (5.1)

    </details>

18. API 계약에 최소한 명시할 네 가지와, 공개 후 변경을 대비한 전략은?

    <details markdown="1"><summary>답 확인</summary>

    URI, HTTP 메서드, 입력(본문·경로·쿼리·헤더), 출력(본문 + 상태 코드). 한번 공개하면 바꾸기 어려우므로 URL에 `/v2/` 를 넣거나 헤더로 지정하는 버전 관리 전략을 미리 정한다. 표준(OpenAPI)으로 적으면 자동화 도구를 쓸 수 있다. → 코어 5 (5.2)

    </details>

19. Minimal API와 컨트롤러에서 JSON 옵션을 바꾸는 방법과 자주 쓰는 설정 세 가지는?

    <details markdown="1"><summary>답 확인</summary>

    Minimal API는 `builder.Services.ConfigureHttpJsonOptions(...)`, 컨트롤러는 `AddControllers().AddJsonOptions(...)`. 자주 쓰는 설정: `PropertyNamingPolicy`(CamelCase 등), `JsonStringEnumConverter`(enum을 문자열로), `DefaultIgnoreCondition = WhenWritingNull`. Minimal API는 Newtonsoft로 바꿀 수 없다. 순환 참조는 `[JsonIgnore]`/`ReferenceHandler.IgnoreCycles`, 또는 DTO로 줄인다. → 코어 5 (5.3)

    </details>

20. TCP 서버의 "opcode → 핸들러 테이블"과 ASP.NET Core 라우팅은 무엇이 같고 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    "요청 종류 키 → 처리 함수"로 디스패치한다는 구조는 같다. 라우팅의 키는 정수 opcode가 아니라 HTTP 메서드 + 문자열 URL 템플릿이고, 경로 안에 파라미터(`{id:int}`)가 들어가며, 맞는 핸들러가 없으면 프레임워크가 404(경로 없음)나 405(메서드 불일치)를 자동으로 응답한다. 바이너리 구조체 역직렬화 대신 모델 바인딩이 필드 이름 기준으로 JSON을 C# 타입으로 바꾼다. → 코어 4

    </details>

### 3. 기억 고리

- **C++ 유추:** 웹 API 핸들러 ≈ TCP 서버의 패킷 핸들러, 라우팅 ≈ opcode 디스패치, 모델 바인딩 ≈ 패킷 역직렬화, 상태 코드 ≈ 응답 패킷의 결과 코드. ⚠️ 깨지는 곳: 세션 객체가 없다(무상태, 매 요청에 토큰). 서버가 먼저 `Send()`할 수 없다(푸시는 SignalR 등 별도 연결). JSON은 필드 이름으로 매칭되어 DTO에 없는 필드는 무시된다. TCP 재전송과 달리 클라이언트 재시도로 같은 요청이 두 번 올 수 있다(멱등성).
- **비유:** API 계약 = 식당 메뉴판, DTO = 주문서 양식. 메뉴판에 없는 요리는 주문할 수 없고, 주문서에 `gold` 칸이 없으면 손님이 적어 넣어도 주방(서버)은 무시한다. ⚠️ 비유가 깨지는 지점: 메뉴판은 마음대로 바꿔도 되지만 API 계약은 구버전 앱이 남아 있어 바꾸기 어렵고, 그래서 버전 전략이 필요하다.
- **비유:** 라우트 제약 = 건물 출입구의 모양 검사(정수 ID만 통과), 검증 = 안내 데스크의 서류 검사. ⚠️ 깨지는 지점: 출입구에서 막히면 "그런 곳 없음(404)"이 되어 잘못된 입력이라는 사실(400)을 알려 주지 못한다.
- **묶음(3의 법칙):** 입구 3단계 = 라우팅 · 모델 바인딩 · 검증. 메서드 성질 3분류 = 안전(GET) · 멱등(PUT/DELETE) · 둘 다 아님(POST/PATCH). JSON 옵션 3가지 = 이름 규칙 · enum 문자열 · null 생략.
- **대칭·순서:** 4xx(내 요청 문제) ↔ 5xx(서버 문제), Minimal API ↔ 컨트롤러, 입력 DTO ↔ 출력 DTO, 폴링(pull) ↔ 실시간(push). REST 설계 순서: 리소스 → 관계 → 동작 → URL → 메서드 → 응답 코드 → 문서화.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "`POST /api/heroes/3/upgrade` 요청이 들어와 JSON 응답이 나가기까지 ASP.NET Core 안에서 일어나는 일"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리 TCP 서버의 로그인 → 세션 → 패킷 처리 흐름이 HTTP API에서는 어떻게 바뀌는가"를 세션 객체·opcode·결과 코드·서버 푸시 네 가지를 짚어 설명해 보세요. 특히 "왜 매 요청에 토큰을 싣는가"와 "왜 보상 POST는 두 번 올 수 있는가"를 빠뜨리지 마세요.
- **랜덤 논리 게임:** A "새 프로젝트는 Minimal API가 기본이다(ASP.NET Core in Action)" vs B "기능이 완전한 컨트롤러 기반이 낫다(Web API Development with ASP.NET Core 8)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 HTTP 메서드의 안전성·멱등성과 상태 코드 선택을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제8부. ASP.NET Core 핵심 동작

> **🎮 게임 서버 개발자에게** — ASP.NET Core는 C++ 서버에서 직접 짜던 accept 루프·패킷 디스패처·필터 체인·매니저 초기화 코드·설정 로더·로거를 프레임워크가 대신 쥐고 있는 "호스트"다. 단위는 패킷이 아니라 HTTP 요청 하나(`HttpContext`)이며, 이것이 `Program.cs`에 적은 순서대로 미들웨어 체인을 **들어갔다가 거꾸로 나온다**. 결정적으로 다른 점은 객체 생성이다. `main()`에서 매니저 싱글턴을 손으로 조립하던 대신 DI 컨테이너가 등록 정보대로 만들어 넣어 주고, C++ 서버에는 거의 없던 "요청 하나 동안만 사는(Scoped)" 수명이 기본 단위가 된다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 점검 배포 중 새로 뜬 서버가 밸런스 데이터를 다 읽기도 전에 유저 요청을 받아 오류가 쏟아진다, 혹은 DB 점검 중 멀쩡한 서버들이 줄줄이 재시작된다 (헬스 체크 liveness/readiness).
> - 보상 API에서 예외가 났는데 클라이언트에 스택 트레이스가 그대로 보이거나, 모바일 클라이언트가 오류 응답을 파싱하지 못한다 (파이프라인 순서, `UseExceptionHandler`, Problem Details).
> - 개발 PC에서는 멀쩡한데 운영 서버에서만 오프라인 보상 시간이 다르게 동작한다, 혹은 Singleton 서비스가 요청마다 새로 만들어져야 할 객체를 붙잡고 있다 (설정 우선순위, DI 수명과 캡티브 의존성).

## 코어 — 이것만은 100%

> **한 문장:** ASP.NET Core 서버는 추가한 순서대로 양방향으로 실행되는 미들웨어 파이프라인 위에서, DI 컨테이너가 수명(Singleton/Scoped/Transient)에 맞춰 서비스를 넣어 주고, 여러 프로바이더에서 합친 설정을 검증된 옵션 클래스로 받으며, `ILogger` 로그·Problem Details 오류 응답·헬스 체크로 "운영 가능한" 틀을 갖춘다.

1. **파이프라인 — 추가 순서대로 감싸는 양방향 체인** — 미들웨어는 `HttpContext`를 받아 `await next(context)` 전후로 실행되는 부품이며, `Use*`로 추가한 순서가 곧 실행 순서다. `next`를 부르지 않으면 단락(short-circuit), 뒤쪽 예외를 잡을 미들웨어는 앞쪽에, `MapGet`은 미들웨어가 아니라 엔드포인트다.
2. **DI 수명 — 짧은 수명을 긴 수명이 붙잡지 않는다** — 의존 대상은 `new` 하지 않고 컨테이너에 등록해 생성자로 받는다. Transient(매번 새로) · Scoped(요청당 하나, DB 컨텍스트) · Singleton(앱 전체 하나, 스레드 안전 필수). 자기보다 수명이 같거나 긴 것에만 의존하고(캡티브 의존성 금지), 루트에서 Scoped를 꺼낼 땐 스코프를 만든다.
3. **설정 — 나중 프로바이더가 이기고, 잘못된 값은 시작할 때 실패** — 프로바이더를 합치되 나중 것이 덮어쓴다(명령줄 > 환경 변수 > User Secrets > 환경별 json > appsettings.json). 비밀은 저장소에 두지 않고, 옵션 패턴(`IOptions<T>` 계열) + `ValidateOnStart()`로 시작 시 실패시킨다.
4. **운영 3종 — 로그는 템플릿으로, 오류는 Problem Details로, 상태는 live/ready로** — `ILogger<T>` + 메시지 템플릿(구조화, 민감 정보 금지), 운영에서는 `UseExceptionHandler` + Problem Details(스택 트레이스 노출 금지), 헬스 체크는 liveness(응답 가능만)와 readiness(의존 대상 포함)로 나눈다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 패킷 처리 필터 체인 (복호화 → 압축 해제 → 인증 → 디스패치) | 미들웨어 파이프라인 | 등록한 순서대로 각 단계가 한 가지 일을 하고 다음으로 넘기며, 중간 단계가 "여기서 끝"을 선언해 뒤를 건너뛸 수 있다(단락) | 대개 단방향인 필터 체인과 달리 **양방향**이다. `await next()`가 돌아온 뒤 같은 미들웨어가 응답 쪽 코드를 한 번 더 실행한다(마트료시카). 예외도 이 길을 거꾸로 거슬러 오르므로 잡는 쪽이 앞에 있어야 한다. 응답 전송이 시작된 뒤에는 헤더를 고칠 수 없다 |
| 서버 시작 시 `main()`에서 `DBManager`·`SessionManager` 같은 매니저 싱글턴들을 만들고 서로의 포인터를 넘겨 조립하던 코드 | DI 컨테이너 + 등록(`AddSingleton/AddScoped/AddTransient`) + 생성자 주입 | 객체 그래프를 시작 지점 한 곳에서 조립하고, 각 클래스는 자기가 쓸 부품을 밖에서 받는다 | 조립 코드를 손으로 쓰지 않고 "타입 → 구현 + 수명"만 등록하면 컨테이너가 생성자 매개변수를 보고 알아서 만든다. **Scoped(HTTP 요청 하나 동안만 사는 객체)** 는 C++ 서버에 직접 대응하는 개념이 거의 없다(패킷 하나 처리하는 동안만 쓰는 컨텍스트 객체 정도). 긴 수명이 짧은 수명을 붙잡으면 캡티브 의존성이 된다 |
| 시작 시 ini/json 설정 파일을 읽어 `Config` 구조체에 채우던 설정 로더 | 설정 프로바이더 + 옵션 패턴(`IOptions<T>`) + `ValidateOnStart()` | 하드코딩 대신 파일의 값을 타입 있는 구조체로 받아 쓰고, 잘못된 값이면 서버를 띄우지 않는다 | 파일 하나가 아니라 JSON·환경별 JSON·User Secrets·환경 변수·명령줄을 **겹쳐서** 나중 것이 이긴다. 환경 변수 계층 키는 `__`. `IOptionsSnapshot`/`IOptionsMonitor`로 재시작 없이 변경을 반영할 수도 있다 |
| spdlog·자체 로그 매크로 (`LOG_INFO("player {} ...", id)`) | `ILogger<T>` + 메시지 템플릿 | 레벨(Trace~Critical)별로 출력하고, 출력 대상(콘솔·파일)은 설정으로 바꾼다 | 자리표시자에 **이름**(`{PlayerId}`)을 붙이면 문자열이 아니라 값으로 저장되어 구조화 로그에서 검색할 수 있다. `ILogger<T>`의 `T`가 카테고리가 되어 클래스별로 레벨을 조절한다 |
| 패킷 처리 중 예외를 잡아 로그를 남기고 그 세션을 끊던 최상위 `try/catch`, 크래시 덤프 | `UseExceptionHandler` + Problem Details(RFC 7807) | 처리되지 않은 예외를 맨 바깥에서 한 번에 잡아 기록하고 서버 프로세스는 계속 산다 | 세션을 끊는 대신 **500 응답(Problem Details JSON)** 을 돌려준다. 스택 트레이스를 응답에 실으면 안 되고, "골드 부족" 같은 예상 가능한 실패는 예외가 아니라 4xx 응답으로 돌려주는 편이 낫다 |
| 하트비트 패킷, 모니터링 포트·관리 콘솔 | 헬스 체크(`MapHealthChecks`), liveness / readiness | 외부 도구가 주기적으로 "살아 있나"를 묻고 이상하면 조치한다 | 묻는 쪽이 로드 밸런서·쿠버네티스 같은 오케스트레이터라서 **응답 결과로 트래픽 차단이나 컨테이너 재시작이 자동으로 일어난다.** 그래서 liveness에 DB 같은 남의 상태를 넣으면 연쇄 재시작이 생긴다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. 예외 처리 미들웨어를 파이프라인 맨 뒤에 두면 무슨 일이 생길까? (C++ 서버라면 `try/catch`를 디스패처 안쪽에만 둔 상황)
> 2. Singleton 서비스가 Scoped 서비스(예: DB 컨텍스트)를 생성자로 받으면 무엇이 깨질까?
> 3. `appsettings.json` 과 환경 변수에 같은 키가 있으면 어느 값이 이길까?
> 4. 로그에 `$"Player {id}"` 대신 `"Player {PlayerId}", id` 를 쓰는 이유는?
> 5. liveness 검사에서 DB 상태까지 확인하면 왜 위험할까?
>
> **처리법:** 🛠 실습 `app.Use(async (ctx, next) => ...)`, 클래스 미들웨어 + `UseMiddleware<T>`, `AddSingleton/AddScoped/AddTransient`, `CreateAsyncScope`, `AddOptions<T>().Bind().ValidateDataAnnotations().ValidateOnStart()`, `ILogger<T>`, `UseExceptionHandler`, `AddHealthChecks`/`MapHealthChecks` → 읽자마자 직접 실행 · 🗺 관계도 파이프라인 순서 ↔ 예외 처리 위치, DI 수명 ↔ 캡티브 의존성, 설정 프로바이더 ↔ 환경 ↔ 옵션 인터페이스, liveness ↔ readiness · 🔗 유추 미들웨어 파이프라인 ≈ 마트료시카(바깥 층이 안쪽을 감쌈) — 어디까지 맞고 어디서 깨지는지 따져 보기 · 📦 카드로 설정 우선순위 표, `ASPNETCORE_ENVIRONMENT`, 환경 변수 `__` 구분자, 로그 레벨 6단계, Problem Details 필드(RFC 7807), Healthy/Degraded/Unhealthy, 503

---

> 학습 목표
> 1. 요청 하나가 미들웨어 파이프라인을 어떻게 오가는지 설명하고, 순서가 왜 중요한지 안다.
> 2. DI 등록과 수명(Singleton/Scoped/Transient), 설정(appsettings·옵션 패턴)을 올바르게 고른다.
> 3. 로깅, 예외 처리(오류 응답), 헬스 체크로 "운영 가능한" 서버의 기본 틀을 갖춘다.

> 코드 예제 공통 전제: `Microsoft.NET.Sdk.Web` 프로젝트(.NET 8, C# 12), 암시적 using 켜짐. 예제의 `Program.cs`에서 최상위 문장은 타입 선언보다 앞에 두었다.

> 읽는 순서 안내: 이 부는 [제7부](07_제7부_웹_API_기초.md)(웹 API 기초) 바로 다음, 설계 원칙을 배우기 **전에** 읽는다. 그래서 DI·옵션 패턴은 "ASP.NET Core에서 어떻게 쓰는가"를 이 부 안에서 이해할 수 있게 썼고, "왜 이렇게 설계하는가"(인터페이스에 의존하기, Composition Root, Chain of Responsibility, Options 패턴의 설계 의도)는 [제9부](09_제9부_설계원칙과_패턴.md)에서 이 부의 코드를 다시 꺼내 되짚는다.

> 재구성 안내: 원래 6개 장(1장 요청 처리 흐름 → 2장 의존성 주입 → 3장 설정 → 4장 로깅 → 5장 예외 처리 → 6장 헬스 체크)을 네 개 코어로 다시 묶었다. 원래 장 → 새 위치: 1장 → 1.1, 2장 → 2.1, 3장 → 3.1, 4장 → 4.1, 5장 → 4.2, 6장 → 4.3.

---

## 코어 1. 파이프라인 — 추가 순서대로 감싸는 양방향 체인

> 원래 1장 "요청 처리 흐름". 요청 하나가 서버 안에서 지나가는 길이다. 이 길의 모양(양방향, 순서 = 실행 순서, 단락)을 알면 코어 4의 예외 처리 미들웨어를 왜 맨 앞에 두는지가 저절로 설명된다.

### 1.1 요청 처리 흐름과 미들웨어 파이프라인

**한 줄 요약:** 요청은 미들웨어라는 부품을 차례로 통과해 엔드포인트에 닿고, 응답은 같은 길을 거꾸로 되돌아온다.

> 📖 출처: ASP.NET Core in Action 4장 "Handling requests with the middleware pipeline" (텍스트 L3765-4571), Web API Development with ASP.NET Core 8 4장 "Middleware" (텍스트 L7871-8624)

**핵심 설명**
- 미들웨어는 요청/응답을 다루는 작은 부품이다. 여러 개를 이어 붙인 것이 파이프라인이며(ASP.NET Core in Action), 각 미들웨어는 인증·로깅 같은 한 가지 일을 하고 다음으로 넘긴다(Web API Development with ASP.NET Core 8).
- 파이프라인은 **양방향**이다. 요청이 들어갈 때 한 번, 응답이 나올 때 역순으로 한 번, 각 미들웨어가 실행 기회를 얻는다. 러시아 인형(마트료시카)처럼 바깥 층이 안쪽 층을 감싼다고 생각하면 쉽다(ASP.NET Core in Action).
- 미들웨어는 `HttpContext`(요청 한 건의 정보를 담은 상자)를 받는다. `await next(context)`를 부르면 다음 미들웨어로 가고, 부르지 않고 응답을 직접 만들면 뒤쪽은 실행되지 않는다. 이를 **단락(short-circuit)** 이라 한다.
- `Use*` 메서드로 추가하며 **추가한 순서가 곧 실행 순서**다. 에러 처리 미들웨어처럼 뒤쪽 예외를 잡아야 하는 것은 앞쪽에 둔다(ASP.NET Core in Action). (예외 처리 미들웨어 자체는 → 4.2)
- `MapGet` 등은 미들웨어가 아니라 **엔드포인트 정의**다. `WebApplication`은 엔드포인트 미들웨어를 맨 끝에 자동 추가하고, 처리할 곳이 없으면 404를 돌려준다(ASP.NET Core in Action).
- 주의: `next` 호출이 끝난 뒤에는 응답 헤더/상태 코드를 바꾸면 이미 전송된 경우 예외가 난다. 바꿀 것은 `next` 전에 바꾼다(Web API Development with ASP.NET Core 8).
- 직접 만들 때 클래스 미들웨어는 `RequestDelegate`를 받는 public 생성자와 `HttpContext`를 첫 매개변수로 받는 `Invoke`/`InvokeAsync` 메서드를 갖는다. 등록은 `UseMiddleware<T>()`를 감싼 확장 메서드로 하는 것이 관례다(Web API Development with ASP.NET Core 8, ASP.NET Core in Action). 미들웨어 클래스가 특정 부모 클래스나 인터페이스를 상속할 필요는 없다(Web API Development with ASP.NET Core 8).

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// 1) 요청 시간 측정: next 전후에 실행되는 양방향 미들웨어
app.Use(async (context, next) =>
{
    var started = DateTime.UtcNow;
    await next(context);   // 안쪽(뒤쪽) 미들웨어와 엔드포인트 실행
    var elapsedMs = (DateTime.UtcNow - started).TotalMilliseconds;
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
    logger.LogInformation("{Path} -> {Status} ({Elapsed:F0}ms)",
        context.Request.Path, context.Response.StatusCode, elapsedMs);
});

// 2) 클라이언트 버전 헤더 검사: 조건 불충족 시 next를 부르지 않고 단락
app.UseMiddleware<ClientVersionMiddleware>();

// 3) 엔드포인트 (미들웨어가 아님)
app.MapGet("/api/heroes", () => new[] { new Hero(1, "Arthur"), new Hero(2, "Merlin") });

app.Run();

public record Hero(int Id, string Name);

public class ClientVersionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Headers.ContainsKey("X-Client-Version"))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("X-Client-Version header is required.");
            return; // 단락: 엔드포인트까지 가지 않는다
        }
        await next(context);
    }
}
```

**방치형 RPG 서버에서는**: 모든 API 앞에 "요청 로깅 → 클라이언트 버전 검사 → (인증) → 엔드포인트" 순으로 미들웨어를 쌓게 된다. 순서를 바꾸면 결과가 달라지므로 `Program.cs`의 줄 순서를 파이프라인 설계도로 읽는 습관이 필요하다.

> 🔧 보충(책 외): `X-Client-Version` 헤더 검사는 예시용 시나리오이며, 책의 예제(상관관계 ID, 복권 미들웨어)를 게임 맥락으로 바꾼 것이다.

> 🔧 보충(책 외): C++ 서버의 패킷 필터 체인과 가장 크게 다른 점은 위 코드의 1번 미들웨어다. `await next(context)` 한 줄을 사이에 두고 "요청 쪽 코드"와 "응답 쪽 코드"가 같은 메서드 안에 있다. 시간 측정·로그처럼 앞뒤를 모두 봐야 하는 일을 한 미들웨어에서 끝낼 수 있는 이유다. 설계 패턴으로 보면 이 구조는 Chain of Responsibility의 "파이프라인" 변형이며, 그 원리는 [제9부](09_제9부_설계원칙과_패턴.md)에서 되짚는다.

---

## 코어 2. DI 수명 — 짧은 수명을 긴 수명이 붙잡지 않는다

> 원래 2장 "의존성 주입". 이 부에서 처음 만나는 DI를 "ASP.NET Core에서 쓰는 방법" 중심으로 다룬다. 핵심 규칙은 하나다: **수명이 짧은 것을 수명이 긴 것이 붙잡으면 안 된다.** 캡티브 의존성, 루트 컨테이너에서 Scoped를 꺼낼 때의 누수, Singleton의 스레드 안전·사용자 데이터 누출 문제가 모두 이 규칙에서 나온다.

### 2.1 의존성 주입 등록과 수명(Singleton/Scoped/Transient)

**한 줄 요약:** 객체를 `new` 하지 않고 컨테이너에 "등록"해 두면, 프레임워크가 필요한 곳에 만들어 넣어 주며 수명은 등록 방식이 결정한다.

> 📖 출처: ASP.NET Core in Action 9장 "Understanding lifetimes: When are services created?" 및 "Resolving scoped services outside a request" (텍스트 L10915-11463), Web API Development with ASP.NET Core 8 2장 "Dependency injection" (텍스트 L5089-5490), Architecting ASP.NET Core Applications 8장 "Object lifetime" (텍스트 L11154-11220)

**핵심 설명**
- 클라이언트 클래스가 의존 대상을 직접 `new` 하면 서로 단단히 묶여 교체·테스트가 어렵다. ASP.NET Core는 **생성자 주입**을 쓴다. 인터페이스와 구현을 만들고, `builder.Services`(컨테이너)에 등록하고, 생성자 매개변수로 받는다(Web API Development with ASP.NET Core 8). C# 12 기본 생성자로 필드 선언을 생략할 수도 있다(Web API Development with ASP.NET Core 8).
- 수명 세 가지(ASP.NET Core in Action, Web API Development with ASP.NET Core 8, Architecting ASP.NET Core Applications 공통):
  - **Transient**: 요청받을 때마다 새로 생성. 상태 없는 가벼운 서비스용.
  - **Scoped**: 웹에서는 **요청 하나당 하나**. 한 요청 안에서는 같은 객체를 공유, 다음 요청은 새 객체. DB 컨텍스트가 대표 사례.
  - **Singleton**: 앱이 살아있는 동안 하나. 여러 요청 스레드가 동시에 쓰므로 **스레드 안전**해야 한다(ASP.NET Core in Action).
- Architecting ASP.NET Core Applications의 선택 요령: 가능하면 Singleton, 어려우면 Scoped, 그것도 안 되면 Transient. 다만 사용자별 데이터를 들고 있는 객체는 Singleton으로 두면 다른 사용자에게 새어 나갈 수 있다.
- **캡티브 의존성(captive dependency)**: Singleton이 Scoped 서비스를 주입받으면 그 Scoped 객체가 앱 종료까지 붙잡혀 "요청마다 새로"라는 약속이 깨진다. 규칙은 "자기보다 수명이 **같거나 긴** 것만 의존"이다. 개발 환경에서는 프레임워크가 이를 검사해 앱 시작 시(또는 그 의존성을 처음 쓸 때) 예외를 던진다. 이 검사는 성능 비용이 있어 기본적으로 개발 환경에서만 켜진다(ASP.NET Core in Action).
- `app.Services`(루트 컨테이너)에서 Scoped/Transient를 직접 꺼내면 앱 종료까지 남아 메모리가 샌다. 필요하면 `CreateScope()`나 `CreateAsyncScope()`로 스코프를 만들고 그 안에서 꺼낸다. ASP.NET Core in Action은 가능하면 `CreateAsyncScope()`를 쓰라고 하고, Web API Development with ASP.NET Core 8의 예제는 `CreateScope()`를 쓴다.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<GoldLedger>();              // 앱 전체에서 하나
builder.Services.AddScoped<IHeroService, HeroService>();  // 요청마다 하나
builder.Services.AddTransient<RewardCalculator>();        // 주입될 때마다 새로

var app = builder.Build();

// 시작 시 Scoped 서비스가 필요하면 스코프를 만들어 사용
await using (var scope = app.Services.CreateAsyncScope())
{
    var heroes = scope.ServiceProvider.GetRequiredService<IHeroService>();
    Console.WriteLine($"Starter hero: {heroes.Find(1)?.Name}");
}

app.MapGet("/api/heroes/{id:int}", (int id, IHeroService heroes) =>
    heroes.Find(id) is { } hero ? Results.Ok(hero) : Results.NotFound());
app.MapPost("/api/gold/{amount:long}", (long amount, GoldLedger ledger) => ledger.Add(amount));

app.Run();

public record Hero(int Id, string Name);

public interface IHeroService { Hero? Find(int id); }

public class HeroService(GoldLedger ledger) : IHeroService   // Scoped -> Singleton 의존은 OK
{
    private readonly GoldLedger _ledger = ledger;   // 실제 코드에서는 이 Singleton을 사용한다
    private static readonly Hero[] All = { new(1, "Arthur"), new(2, "Merlin") };
    public Hero? Find(int id) => All.FirstOrDefault(h => h.Id == id);
}

public class GoldLedger
{
    private long _gold;
    public long Add(long amount) => Interlocked.Add(ref _gold, amount); // 동시 요청에 안전
}

public class RewardCalculator
{
    public long Calc(int level) => level * 100L;
}
```

**방치형 RPG 서버에서는**: 게임 밸런스 테이블처럼 읽기 전용 공용 데이터는 Singleton, 플레이어 데이터를 다루는 서비스와 DB 컨텍스트는 Scoped가 기본이다. 반대로 Singleton 안에서 Scoped 서비스를 잡고 있지 않은지 늘 확인한다.

> 🔧 보충(책 외): `Interlocked.Add`로 Singleton의 카운터를 안전하게 만든 것은 예시 구현이다. 책은 "Singleton은 스레드 안전해야 한다"는 원칙만 다룬다. (여러 요청이 공유 상태를 건드릴 때의 위험과 `lock`은 [제6부](06_제6부_비동기와_시간흐름.md))

> 🔧 보충(책 외): C++ 서버 개발자가 DI를 처음 볼 때 붙잡을 그림은 이렇다. 예전에는 `main()`에서 `auto db = new DBManager(); auto hero = new HeroManager(db);`처럼 순서를 맞춰 손으로 조립했다. ASP.NET Core에서는 `builder.Services.Add...`로 "이 타입을 달라고 하면 이 구현을 이 수명으로 줘라"만 적어 두면, 컨테이너가 생성자 매개변수를 보고 필요한 것을 먼저 만들어 넣는다. 위 코드에서 엔드포인트 람다의 `IHeroService heroes` 매개변수도 컨테이너가 채운다. 수명 관리(언제 만들고 언제 버리는지)도 컨테이너 몫이며, 스코프가 끝날 때 컨테이너가 만든 `IDisposable` 서비스를 정리한다. 왜 구현 대신 인터페이스로 받는지(DIP), `Program.cs`가 왜 "조립 지점(Composition Root)"인지, Singleton 패턴을 직접 짜지 않고 이 Singleton 수명을 쓰는 이유는 [제9부](09_제9부_설계원칙과_패턴.md)에서 이 코드를 다시 보며 되짚는다.

---

## 코어 3. 설정 — 나중 프로바이더가 이기고, 잘못된 값은 시작할 때 실패

> 원래 3장 "설정". 두 가지 원리로 정리된다. ① 설정은 여러 곳에서 읽어 **겹치며 나중 것이 이긴다**(그래서 운영 값은 코드를 고치지 않고 환경 변수로 덮어쓴다). ② 설정은 타입 있는 옵션 클래스로 받고 **시작할 때 검증**한다(그래서 잘못된 밸런스 값은 유저가 아니라 배포 단계에서 터진다). 옵션 인터페이스 세 가지의 차이는 코어 2의 수명(Singleton/Scoped)으로 설명된다.

### 3.1 설정: appsettings.json, 환경, 옵션 패턴

**한 줄 요약:** 바뀔 수 있는 값(연결 문자열, 게임 수치)은 코드 밖 설정에 두고, 타입이 있는 옵션 클래스로 받아 쓴다.

> 📖 출처: ASP.NET Core in Action 10장 "Configuring an ASP.NET Core application" (텍스트 L11535-12500, L12707-12960), Web API Development with ASP.NET Core 8 3장 "Configuration" / "Environments" (텍스트 L5948-7087), Architecting ASP.NET Core Applications 9장 "Validating our options objects" (텍스트 L14539-14700)

**핵심 설명**

*① 어디서 읽고, 무엇이 이기나*
- **설정(setting)** 은 앱 동작을 바꾸는 값, **비밀(secret)** 은 비밀번호·API 키 같은 민감한 설정이다. 코드 밖으로 빼두면 재컴파일 없이 바꿀 수 있고, 소스 저장소에 비밀이 올라가는 사고도 줄어든다(ASP.NET Core in Action).
- 설정은 여러 **프로바이더**(JSON 파일, 환경 변수, 명령줄 등)에서 키-값으로 읽어 하나로 합친다. **나중에 추가된 프로바이더가 같은 키를 덮어쓴다**(ASP.NET Core in Action). Web API Development with ASP.NET Core 8의 우선순위 표: 명령줄 > 환경 변수 > 사용자 비밀(개발 환경) > `appsettings.{환경}.json` > `appsettings.json`.
- 비밀은 `appsettings.json`에 넣지 않는다. 로컬은 User Secrets, 서버는 환경 변수가 흔한 방법이다. 둘 다 암호화되지는 않으므로 "저장소에 안 올리기"용이라는 점을 기억한다(ASP.NET Core in Action).
- **환경**은 `ASPNETCORE_ENVIRONMENT` 값(`Development`/`Staging`/`Production`)으로 정해지고, 없으면 Production이다. `IsDevelopment()` 같은 메서드로 확인하고, `appsettings.Development.json`처럼 환경별 파일이 기본 파일 위에 덮어써진다(ASP.NET Core in Action).
- 환경 변수로 계층 키를 줄 때는 `:` 대신 `__`(밑줄 두 개)를 쓰는 것이 리눅스 등에서 안전하다. 예를 들어 `Game__GoldPerSecond`는 `Game:GoldPerSecond`로 읽힌다(ASP.NET Core in Action, Web API Development with ASP.NET Core 8).

*② 타입 있는 옵션 클래스로 받고, 시작할 때 검증한다*
- **옵션 패턴**: 설정 섹션을 POCO 클래스(인자 없는 public 생성자, 프로퍼티)에 바인딩하고 `IOptions<T>`로 주입받는다. 문자열 키 오타와 형 변환 실수가 줄어든다(ASP.NET Core in Action, Web API Development with ASP.NET Core 8). 단, 옵션 클래스 프로퍼티 이름과 JSON 키가 어긋나면 조용히 기본값이 남을 수 있으니 오타를 조심하고 아래 검증을 함께 쓴다(ASP.NET Core in Action).
- 옵션 인터페이스 세 가지(수명은 → 코어 2): `IOptions<T>`는 Singleton이라 파일이 바뀌어도 처음 값을 유지하고, `IOptionsSnapshot<T>`(Scoped)는 요청마다 새로 만들어져 변경을 반영하며(대신 매 요청 재계산 비용이 든다), `IOptionsMonitor<T>`(Singleton)는 Singleton에서도 변경 반영이 필요할 때 쓴다(ASP.NET Core in Action, Web API Development with ASP.NET Core 8).
- Architecting ASP.NET Core Applications은 `ValidateOnStart()`를 기본으로 권한다. 설정이 잘못되면 실행 중 뒤늦게가 아니라 **시작 시점에 실패**하게 한다. 데이터 애노테이션 검증은 `ValidateDataAnnotations()`로 켠다.

`appsettings.json`
```json
{
  "Game": { "OfflineRewardMaxHours": 8, "GoldPerSecond": 2.5 }
}
```

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// "Game" 섹션을 GameSettings에 바인딩 + 시작 시 검증
builder.Services.AddOptions<GameSettings>()
    .Bind(builder.Configuration.GetSection(GameSettings.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

var app = builder.Build();

app.MapGet("/api/settings", (IOptions<GameSettings> options) => options.Value);
app.MapGet("/api/env", (IWebHostEnvironment env) =>
    new { env.EnvironmentName, IsDev = env.IsDevelopment() });

app.Run();

public class GameSettings
{
    public const string SectionName = "Game";

    [Range(1, 72)]
    public int OfflineRewardMaxHours { get; set; } = 8;

    [Range(0.1, 1000.0)]
    public double GoldPerSecond { get; set; } = 1.0;
}
```

**방치형 RPG 서버에서는**: 오프라인 보상 최대 시간, 초당 골드 같은 밸런스 수치와 DB 연결 문자열을 설정으로 빼 두면, 배포 없이 환경 변수로 운영 값을 바꿀 수 있다. 잘못된 수치(0 이하 등)는 서버가 켜질 때 막는다.

> 🔧 보충(책 외): `Game` 섹션 이름과 항목들은 예시 값이다. `.Bind(...)`는 책의 `Configure<T>(GetSection(...))`와 같은 역할을 하는 `OptionsBuilder` 방식이다.

> 🔧 보충(책 외): C++ 서버의 설정 로더와 비교하면, "하나의 파일을 읽어 구조체에 채운다"가 아니라 "여러 출처를 순서대로 겹쳐 최종 키-값 표를 만들고, 그 표의 한 섹션을 구조체에 채운다"는 2단계다. 운영 서버에서 값이 예상과 다르면 파일만 볼 것이 아니라 위 우선순위대로(명령줄 → 환경 변수 → …) 같은 키가 있는지 위에서부터 확인한다. 설정 값을 왜 작은 객체로 나눠 밖에서 넣어 주는지(Options 패턴의 설계 의도)는 [제9부](09_제9부_설계원칙과_패턴.md)에서 되짚는다.

---

## 코어 4. 운영 3종 — 로그는 템플릿으로, 오류는 Problem Details로, 상태는 live/ready로

> 원래 4~6장 "로깅"·"예외 처리와 오류 응답"·"헬스 체크". 눈앞에서 디버거를 붙일 수 없는 서버를 "운영 가능하게" 만드는 세 도구다. 셋 다 같은 질문에 답한다: **무슨 일이 있었나(로그) · 실패를 클라이언트에 어떻게 알리나(오류 응답) · 지금 트래픽을 받아도 되나(헬스 체크).**

### 4.1 로깅

**한 줄 요약:** 서버는 눈앞에서 디버깅할 수 없으므로, 무슨 일이 있었는지 `ILogger`로 남겨 두어야 나중에 원인을 찾는다.

> 📖 출처: Web API Development with ASP.NET Core 8 4장 "Logging" (텍스트 L7136-7870, 특히 L7816-7866), Architecting ASP.NET Core Applications 10장 "Logging Patterns" (텍스트 L15690-16336), ASP.NET Core in Action 26장 "Monitoring and troubleshooting errors with logging" (텍스트 L33135-33720)

**핵심 설명**
- 로그는 크게 감사/분석용, 오류 기록, 오류 직전의 "빵부스러기" 기록으로 쓰인다. ASP.NET Core 자체도 요청·EF Core 쿼리를 많이 남겨 주므로, 직접 남길 로그는 의미 있는 것에 집중한다(ASP.NET Core in Action).
- 구조: 코드에서는 `ILogger`만 쓰고, 어디에 쓸지는 **프로바이더**(콘솔, 파일 등)가 정한다. 기본 빌더가 콘솔 등을 이미 등록하므로 코드 수정 없이 목적지를 바꿀 수 있다(ASP.NET Core in Action, Architecting ASP.NET Core Applications).
- 가장 흔한 방법은 클래스에 `ILogger<T>`를 주입하는 것이다(주입은 → 코어 2). `T`가 로그의 **카테고리**(어느 클래스의 로그인지)가 된다(ASP.NET Core in Action, Architecting ASP.NET Core Applications).
- **로그 레벨**(심각한 것부터): Critical, Error, Warning, Information, Debug, Trace. Architecting ASP.NET Core Applications의 표는 운영에서 Trace는 끄고, Debug는 문제를 조사할 때만 켜며, Information 이상은 켜 두되 ASP.NET Core 자체의 Information 로그는 줄이라고 권한다. Trace는 민감 정보를 담을 수 있어 운영에서 켜지 않는다(ASP.NET Core in Action, Architecting ASP.NET Core Applications, Web API Development with ASP.NET Core 8).
- **메시지 템플릿**: `"Player {PlayerId}"`처럼 자리표시자와 인자를 따로 넘긴다. 보간 문자열(`$"..."`)과 출력은 같지만, 템플릿은 로그가 꺼진 레벨일 때 문자열 처리를 건너뛰어 가볍고, 구조화 로그에서 값으로 검색할 수 있다(ASP.NET Core in Action, Architecting ASP.NET Core Applications). 예외는 별도 인자로 넘기면 함께 기록된다(ASP.NET Core in Action).
- 레벨은 설정으로 조절한다(설정은 → 코어 3). `Logging:LogLevel`에 `Default`와 카테고리별(예: `Microsoft`) 최소 레벨을 적고, 환경별 파일로 덮어쓴다(Architecting ASP.NET Core Applications). `AddJsonConsole()`로 콘솔을 JSON 구조화 로그로 바꿀 수 있다(Architecting ASP.NET Core Applications).
- 남길 것: 검증 실패, 인증·인가 실패, 예외, 시작/종료, 위험한 작업, 중요한 비즈니스 이벤트. **남기지 말 것**: 비밀번호·키·연결 문자열, 개인정보, 결제 정보(Web API Development with ASP.NET Core 8).

`appsettings.json`(로그 레벨)
```json
{
  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } }
}
```

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddScoped<IdleRewardService>();
var app = builder.Build();

app.MapPost("/api/players/{playerId:int}/claim",
    (int playerId, int offlineMinutes, IdleRewardService rewards) =>
        Results.Ok(new { gold = rewards.Claim(playerId, offlineMinutes) }));

app.Run();

public class IdleRewardService(ILogger<IdleRewardService> logger)
{
    public long Claim(int playerId, int offlineMinutes)
    {
        logger.LogInformation("Claim start. Player {PlayerId}, offline {Minutes}min",
            playerId, offlineMinutes);

        if (offlineMinutes > 24 * 60)
        {
            logger.LogWarning("Offline time capped. Player {PlayerId}, requested {Minutes}min",
                playerId, offlineMinutes);
            offlineMinutes = 24 * 60;
        }

        long gold = Math.Max(offlineMinutes, 0) * 600L;
        try
        {
            Persist(playerId, gold);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogError(ex, "Failed to save reward. Player {PlayerId}", playerId);
            throw;
        }
        return gold;
    }

    private static void Persist(int playerId, long gold)
    {
        if (playerId <= 0) throw new InvalidOperationException("Invalid player id.");
    }
}
```

**방치형 RPG 서버에서는**: "보상 수령", "재화 차감 실패", "비정상적으로 큰 오프라인 시간 요청" 같은 이벤트에 Player ID를 값으로 남기면, 유저 문의가 왔을 때 로그 검색만으로 상황을 재구성할 수 있다.

> 🔧 보충(책 외): 보상 계산식(분당 600골드)과 24시간 상한은 예시 값이다.

### 4.2 예외 처리와 오류 응답

**한 줄 요약:** 처리되지 않은 예외는 500이 되므로, 예외 처리 미들웨어를 앞쪽에 두고 클라이언트가 파싱할 수 있는 JSON 오류 응답(Problem Details)을 내보낸다.

> 📖 출처: Web API Development with ASP.NET Core 8 16장 "Error handling" (텍스트 L23453-23590, L23744-23855), ASP.NET Core in Action 4장 "Handling errors using middleware" (텍스트 L4573-4937)

**핵심 설명**
- 파이프라인에서 던져진 예외는 앞쪽 미들웨어 방향으로 거슬러 올라가고, 아무도 잡지 않으면 서버는 500을 돌려준다(ASP.NET Core in Action). (그래서 잡는 미들웨어는 앞쪽에 둔다 → 코어 1) 스택 트레이스가 응답에 실리면 공격자에게 정보를 주므로 운영에서는 절대 노출하지 않는다(Web API Development with ASP.NET Core 8).
- 개발 환경에서는 상세 정보를 보여 주는 개발자 예외 페이지를 쓰고(`WebApplication`이 Development에서 자동 추가), 운영에서는 `UseExceptionHandler("/error")` 미들웨어를 쓴다. 이 미들웨어는 예외를 잡으면 요청 경로를 오류 경로로 바꿔 파이프라인을 다시 실행해 응답을 만들고, 상태 코드를 500으로 맞춘다(ASP.NET Core in Action).
- 함정: 이미 응답 전송이 시작됐으면 바꿀 수 없고, 오류 처리 경로 자체가 예외를 던지면 날것의 500이 나간다. 오류 처리 코드는 최대한 단순하게 만든다(ASP.NET Core in Action).
- 오류 응답 형식은 **Problem Details**(RFC 7807)를 쓴다. 주요 필드는 `type`, `title`, `status`, `detail`, `instance`이며 `application/problem+json`으로 내려간다(Web API Development with ASP.NET Core 8).
- 입력 검증 실패는 400과 함께 문제 세부 정보(`ValidationProblemDetails`, 필드별 `errors`)를 돌려준다(Web API Development with ASP.NET Core 8). 단순한 애노테이션 검증으로 부족하면 FluentValidation 같은 라이브러리를 쓸 수 있다(Web API Development with ASP.NET Core 8).

> 🔧 보충(책 외): 실무에서는 "예상 가능한 실패"(없는 영웅 -> 404, 잘못된 입력 -> 400)는 예외를 던지지 않고 정상적인 4xx 응답으로 돌려주고, "예상 밖 오류"만 예외 처리 미들웨어에 맡기는 식으로 나누어 생각하면 편하다. 이 구분은 책의 표현이 아니다. (예상 가능한 실패를 서비스 계층에서 결과 객체로 표현하는 Operation Result 패턴은 [제9부](09_제9부_설계원칙과_패턴.md))

```csharp
using Microsoft.AspNetCore.Diagnostics;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/error");   // 운영: 상세 정보 없는 오류 응답
}

// 예외가 잡히면 이 경로가 다시 실행되어 응답을 만든다
app.Map("/error", (HttpContext context, ILogger<Program> logger) =>
{
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    if (feature is not null)
    {
        logger.LogError(feature.Error, "Unhandled exception at {Path}", feature.Path);
    }
    return Results.Problem(title: "서버 내부 오류가 발생했습니다.", statusCode: 500);
});

// 예상 가능한 실패는 예외 대신 정상적인 4xx 응답으로
app.MapPost("/api/heroes/{id:int}/upgrade", (int id, UpgradeRequest request) =>
{
    if (id != 1) return Results.NotFound();
    if (request.Levels <= 0)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["levels"] = new[] { "levels must be greater than 0." }
        });
    }
    return Results.Ok(new { id, addedLevels = request.Levels });
});

// 예상 밖 오류 시연용: 예외 -> UseExceptionHandler -> 500 Problem Details
// (핸들러는 Development가 아닐 때만 등록했으므로 ASPNETCORE_ENVIRONMENT=Production 등으로 실행해야 보인다)
app.MapGet("/api/crash", () => { throw new InvalidOperationException("boom"); });

app.Run();

public record UpgradeRequest(int Levels);
```

**방치형 RPG 서버에서는**: 모바일 클라이언트는 오류 JSON의 `status`/`title`을 읽어 팝업을 띄운다. "골드 부족" 같은 게임 규칙 위반은 400/409 응답으로, DB 장애 같은 예상 밖 오류는 500 Problem Details로 통일해 두면 클라이언트 처리가 단순해진다.

> 🔧 보충(책 외): 책은 컨트롤러 기반 `/error` 예제(Web API Development with ASP.NET Core 8)와 `MapGet("/error", ...)`로 문자열을 돌려주는 예제(ASP.NET Core in Action)를 보여 준다. 위 코드는 이를 미니멀 API 형태로 바꾼 것이라 `Results.Problem`, `Results.ValidationProblem`, `app.Map`으로 오류 경로를 여는 부분은 책 예제가 아니다(`IExceptionHandlerFeature`로 예외를 꺼내 로그를 남기는 방식은 Web API Development with ASP.NET Core 8 컨트롤러 예제와 같다). ASP.NET Core in Action의 Listing 10.15에는 `AddProblemDetails` 호출이 있으나 표기가 미심쩍어 예제에 넣지 않았다. 게임 시나리오도 보충 설명이다.

### 4.3 헬스 체크

**한 줄 요약:** 서버가 살아 있는지, 요청을 받을 준비가 됐는지를 알려 주는 전용 엔드포인트를 두면 운영 도구가 이를 보고 트래픽을 보내거나 재시작한다.

> 📖 출처: Web API Development with ASP.NET Core 8 16장 "Health checks" (텍스트 L23856-24065)

**핵심 설명**
- 헬스 체크는 앱 상태를 돌려주는 엔드포인트다. 상태는 Healthy, Degraded, Unhealthy 중 하나다. 로드 밸런서나 쿠버네티스 같은 오케스트레이터가 이를 보고 비정상 인스턴스로 트래픽을 끊거나 컨테이너를 재시작한다(Web API Development with ASP.NET Core 8).
- 기본: `AddHealthChecks()`로 서비스를 등록하고 `MapHealthChecks("경로")`로 엔드포인트를 연다. 정상이면 200과 `Healthy` 텍스트가 나온다(Web API Development with ASP.NET Core 8).
- 커스텀 검사는 `IHealthCheck`의 `CheckHealthAsync`를 구현하고 `AddCheck<T>(이름, tags: ...)`로 등록한다. 외부 서비스나 DB 상태를 확인할 때 쓴다. `MapHealthChecks`의 `Predicate`로 이름이나 태그별로 실행할 검사를 골라 엔드포인트를 나눌 수 있고(Web API Development with ASP.NET Core 8), 비정상이면 503이 나간다. `Predicate`를 안 주면 등록된 모든 검사가 실행된다(Web API Development with ASP.NET Core 8).
- EF Core를 쓰면 `AddDbContextCheck<T>`(전용 패키지)로 DB 검사를 쉽게 추가한다(Web API Development with ASP.NET Core 8).
- **liveness(살아 있나)** 는 "응답할 수 있는가"만 본다. 다른 서비스 상태까지 확인하면 남의 장애 때문에 멀쩡한 앱이 재시작되는 연쇄 실패가 생길 수 있다. **readiness(트래픽 받을 준비됐나)** 는 초기화·의존 대상 상태를 반영한다. 시작이 오래 걸리면 startup 프로브를 따로 쓴다(Web API Development with ASP.NET Core 8). 프로브 검사는 빨라야 한다(Web API Development with ASP.NET Core 8).

```csharp
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<GameDataStore>();
builder.Services.AddHealthChecks()
    // liveness: 다른 의존 대상은 보지 않고 "응답 가능"만 확인
    .AddCheck("self", () => HealthCheckResult.Healthy("alive"), tags: new[] { "live" })
    // readiness: 게임 데이터 로딩 여부 등 준비 상태 확인
    .AddCheck<GameDataHealthCheck>("game-data", tags: new[] { "ready" });

var app = builder.Build();

app.MapHealthChecks("/healthz/live",
    new HealthCheckOptions { Predicate = check => check.Tags.Contains("live") });
app.MapHealthChecks("/healthz/ready",
    new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });

app.Run();

public class GameDataStore
{
    public bool IsLoaded { get; private set; } = true; // 실제로는 시작 시 밸런스 데이터 로딩 후 true
}

public class GameDataHealthCheck(GameDataStore store) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var result = store.IsLoaded
            ? HealthCheckResult.Healthy("game data loaded")
            : HealthCheckResult.Unhealthy("game data not loaded");
        return Task.FromResult(result);
    }
}
```

**방치형 RPG 서버에서는**: `/healthz/live`는 프로세스가 응답하는지만, `/healthz/ready`는 DB 연결과 밸런스 데이터 로딩을 확인하도록 나눈다. 배포 중인 새 서버가 준비되기 전에 유저 요청이 가지 않게 막을 수 있다.

> 🔧 보충(책 외): `GameDataStore`와 `/healthz/live`·`/healthz/ready` 경로 이름은 예시이고, 람다로 검사를 등록하는 `AddCheck("self", () => ...)` 형태는 책에 없는 오버로드다(책은 `AddCheck<T>`만 보여 준다). 책은 태그/이름별 `Predicate` 필터링과 liveness/readiness 개념을 설명하며, 두 엔드포인트를 이렇게 구성한 코드는 이를 조합한 것이다.

---

## 실무 적용

### 체크리스트
- [ ] `Program.cs`의 `Use*` 줄 순서를 파이프라인 설계도로 읽는다: 예외 처리 → 요청 로깅 → 클라이언트 버전 검사 → (인증) → 엔드포인트. 뒤쪽 예외를 잡을 미들웨어는 앞쪽에 있다. → 코어 1
- [ ] 미들웨어에서 응답 헤더·상태 코드는 `next` **전에** 바꾼다. 단락할 때는 응답을 직접 쓰고 `return`한다. → 코어 1
- [ ] 클래스 미들웨어는 `RequestDelegate`를 받는 public 생성자 + `InvokeAsync(HttpContext)` 형태이고, `UseMiddleware<T>()`를 감싼 확장 메서드로 등록한다. → 코어 1
- [ ] 서비스는 `new` 하지 않고 등록 + 생성자 주입으로 받는다. 수명은 "가능하면 Singleton → Scoped → Transient"로 고르되, 사용자별 데이터를 든 객체와 DB 컨텍스트는 Scoped. → 코어 2
- [ ] Singleton 서비스는 스레드 안전하고, 생성자에 Scoped 서비스를 받지 않는다(캡티브 의존성). 이 검사는 기본적으로 개발 환경에서만 켜지므로 개발 환경에서 반드시 한 번 띄워 본다. → 코어 2
- [ ] 시작 시 Scoped 서비스가 필요하면 `app.Services`에서 바로 꺼내지 않고 `CreateAsyncScope()`로 스코프를 만든다. → 코어 2
- [ ] 비밀(연결 문자열 비밀번호, API 키)은 `appsettings.json`에 없다. 로컬은 User Secrets, 서버는 환경 변수(둘 다 암호화는 아님). → 코어 3
- [ ] 운영 서버의 `ASPNETCORE_ENVIRONMENT`를 확인했다(없으면 Production). 환경 변수 계층 키는 `__`(`Game__GoldPerSecond`). → 코어 3
- [ ] 밸런스 수치는 옵션 클래스 + `ValidateDataAnnotations()` + `ValidateOnStart()`로 받아 잘못된 값이면 시작 시 실패한다. 프로퍼티 이름과 JSON 키 오타를 검증으로 잡는다. 변경 반영이 필요하면 `IOptionsSnapshot`(Scoped)·`IOptionsMonitor`(Singleton). → 코어 3
- [ ] 로그는 `ILogger<T>` + 메시지 템플릿(`"Player {PlayerId}", id`)으로 남기고, 비밀번호·키·연결 문자열·개인정보·결제 정보는 남기지 않는다. 운영에서 Trace는 끄고 `Microsoft.AspNetCore`는 Warning으로 줄인다. → 코어 4
- [ ] 운영에서는 `UseExceptionHandler`로 500 Problem Details(`application/problem+json`)를 내보내고 스택 트레이스를 노출하지 않는다. 오류 처리 경로 코드는 최대한 단순하다. → 코어 4
- [ ] "골드 부족"·없는 영웅·잘못된 입력 같은 예상 가능한 실패는 예외가 아니라 4xx(`NotFound`, `ValidationProblem`, 409 등)로 돌려준다. → 코어 4
- [ ] 헬스 체크를 `/healthz/live`(응답 가능만)와 `/healthz/ready`(DB·밸런스 데이터 로딩)로 나눴고, 프로브 검사는 빠르다. 시작이 오래 걸리면 startup 프로브를 따로 둔다. → 코어 4

### 시나리오로 확인하기
1. **상황:** 요청 로깅 미들웨어 안에서 난 예외가 Problem Details가 아니라 날것의 500으로 나간다. `Program.cs`를 보니 `app.Use(요청 로깅)` 다음 줄에 `app.UseExceptionHandler("/error")`가 있다. (C++ 서버에서 `try/catch`를 패킷 디스패처 안쪽에만 두고, 그 앞의 복호화 필터에서 난 예외는 잡지 못하던 것과 같은 구조다.)
   **질문:** 원인은 무엇이고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `Use*`로 추가한 순서가 곧 실행 순서이고, 예외는 앞쪽 미들웨어 방향으로 거슬러 올라간다. 예외 처리 미들웨어보다 **앞에** 있는 요청 로깅 미들웨어의 예외는 아무도 잡지 않아 서버가 그냥 500을 돌려준다. `UseExceptionHandler`를 파이프라인 맨 앞으로 옮긴다. 이미 응답 전송이 시작된 뒤의 예외는 예외 처리 미들웨어도 응답을 바꿀 수 없고, `/error` 경로 자체가 예외를 던져도 날것의 500이 나가므로 오류 처리 코드는 단순하게 둔다. → 코어 1 (1.1), 코어 4 (4.2)

   </details>

2. **상황:** 랭킹 계산 결과를 캐시하려고 `RankingCache`를 Singleton으로 등록하고, 생성자에서 플레이어 데이터를 읽는 Scoped `IHeroService`(내부에 DB 컨텍스트)를 받았다. 개발 PC에서는 시작하자마자 예외가 났는데, 누군가 "운영 설정으로 띄우면 뜬다"며 그대로 배포했다. (C++ 서버라면 매니저 싱글턴이 다른 매니저 포인터를 들고 있는 것은 아주 흔한 구조였다.)
   **질문:** 무엇이 잘못됐고, 개발 환경의 예외는 왜 운영에서는 안 났나? 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   캡티브 의존성이다. Singleton이 Scoped 서비스를 붙잡아 그 Scoped 객체(와 DB 컨텍스트)가 앱 종료까지 살아남고, "요청마다 새로"라는 약속이 깨진다. 프레임워크의 수명 검사는 성능 비용 때문에 기본적으로 개발 환경에서만 켜지므로 운영에서는 조용히 뜬 것이다. 규칙은 "자기보다 수명이 같거나 긴 것에만 의존"이다. `RankingCache`를 Scoped로 내리거나, 꼭 Singleton이어야 하면 필요할 때마다 스코프를 만들어 그 안에서 Scoped 서비스를 꺼낸다. → 코어 2 (2.1)

   > 🔧 보충(책 외): Singleton 안에서 스코프를 만들 때는 보통 `IServiceScopeFactory`를 주입받아 `CreateAsyncScope()`를 호출한다. 또 EF Core의 DB 컨텍스트는 여러 스레드가 동시에 쓰도록 설계되지 않았기 때문에, Singleton에 붙잡힌 DB 컨텍스트는 동시 요청에서 예외나 데이터 꼬임으로 이어질 수 있다(DB 컨텍스트는 [제10부](10_제10부_EF_Core_데이터_접근.md)).

   </details>

3. **상황:** `appsettings.json`의 `Game:OfflineRewardMaxHours`는 8인데, 운영 서버에서는 12시간치 보상이 지급된다. 코드는 `IOptions<GameSettings>`로 값을 받는다. 다른 운영자는 "아예 0으로 바꿔서 오프라인 보상을 막자"고 한다.
   **질문:** 12는 어디서 왔을 가능성이 있고 어떤 순서로 확인하나? 0으로 바꾸면 어떻게 되나?

   <details markdown="1"><summary>답 확인</summary>

   설정은 여러 프로바이더를 합치며 나중 것이 같은 키를 덮어쓴다. 우선순위(명령줄 > 환경 변수 > 사용자 비밀(개발 환경) > `appsettings.{환경}.json` > `appsettings.json`)대로 위에서부터 확인한다: 실행 인자, 환경 변수 `Game__OfflineRewardMaxHours`, `ASPNETCORE_ENVIRONMENT`에 맞는 `appsettings.Production.json`(환경 변수가 없으면 Production). 또 `IOptions<T>`는 Singleton이라 파일을 바꿔도 처음 값을 유지하므로, 재시작 없이 반영하려면 `IOptionsSnapshot`/`IOptionsMonitor`가 필요하다. 0으로 바꾸면 `[Range(1, 72)]` + `ValidateOnStart()` 때문에 서버가 시작 단계에서 실패한다(의도된 안전장치). → 코어 3 (3.1)

   </details>

4. **상황:** DB 점검 공지를 걸고 DB를 잠시 내렸더니, 점검과 상관없는 API 서버 컨테이너들까지 전부 재시작을 반복한다. liveness 엔드포인트에 `AddDbContextCheck<T>`가 들어 있다.
   **질문:** 왜 이런 연쇄가 생기고, 헬스 체크를 어떻게 나눠야 하나?

   <details markdown="1"><summary>답 확인</summary>

   오케스트레이터는 liveness가 실패하면 컨테이너를 재시작한다. liveness에서 DB 같은 다른 서비스 상태까지 확인하면 남의 장애 때문에 멀쩡한 앱이 재시작되는 연쇄 실패가 생긴다. liveness(`/healthz/live`)는 "응답할 수 있는가"만 보고, DB·밸런스 데이터 로딩 같은 의존 대상은 readiness(`/healthz/ready`)에 태그로 묶어 넣는다. readiness가 실패하면(503) 재시작 대신 트래픽만 끊긴다. 시작이 오래 걸리면 startup 프로브를 따로 두고, 프로브 검사는 빨라야 한다. → 코어 4 (4.3)

   </details>

5. **상황:** "Player 1234가 어제 보상을 못 받았다"는 문의가 왔는데, 로그 검색 도구에서 PlayerId로 필터가 되지 않는다. 코드는 `logger.LogInformation($"Claim start. Player {playerId}")`였고, 같은 코드 근처에서 결제 영수증 원문도 로그로 남기고 있었다.
   **질문:** 무엇을 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   보간 문자열 대신 메시지 템플릿(`"Claim start. Player {PlayerId}", playerId`)을 쓴다. 출력은 같지만 템플릿은 구조화 로그에서 값으로 검색할 수 있고, 로그가 꺼진 레벨일 때 문자열 처리를 건너뛰어 가볍다. 예외는 별도 인자(`LogError(ex, ...)`)로 넘긴다. 결제 정보·개인정보·비밀번호·키·연결 문자열은 로그에 남기지 않는다. 콘솔을 JSON 구조화 로그로 바꾸려면 `AddJsonConsole()`. → 코어 4 (4.1)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
ASP.NET Core 핵심 동작 — 한 문장: ( ? ) 위에서 DI가 ( ? )에 맞춰 넣고, 설정은 ( ? ), 운영은 ( ? )·( ? )·( ? )
├─ 코어 1 파이프라인 (1.1)
│        ( ? )방향 / HttpContext / next 안 부르면 ( ? ) / 순서 = ( ? )
│        엔드포인트 미들웨어는 ( ? )에 자동 / next 후 헤더 변경 = ( ? )
│        클래스 미들웨어 조건: ____, ____ / 등록 관례 ( ? )
│        C++ 필터 체인과 다른 점: ( ? )
├─ 코어 2 DI 수명 (2.1)
│        생성자 주입 / Transient·Scoped·Singleton 각각 ____
│        선택 요령 ( ? )→( ? )→( ? ) / 캡티브 의존성 = ( ? ) / 규칙 ( ? )
│        수명 검사는 ( ? ) 환경에서만 / 루트 컨테이너에서 Scoped 꺼내기 → ( ? )
├─ 코어 3 설정 (3.1)
│        설정 vs 비밀 / 프로바이더 우선순위 ____ > ____ > ____ > ____ > ____
│        환경 변수 ( ? ), 기본 환경 ( ? ) / 계층 키 구분자 ( ? )
│        IOptions(( ? ) 수명, 변경 ( ? )) / IOptionsSnapshot(( ? )) / IOptionsMonitor(( ? ))
│        ValidateDataAnnotations + ( ? )
└─ 코어 4 운영 3종
         4.1 로그 용도 3가지 / ILogger<T>의 T = ( ? ) / 프로바이더
             레벨 6단계 ____ / 메시지 템플릿 장점 2가지 ____ / 남기지 말 것 ____
         4.2 미처리 예외 = ( ? ) / 개발: ( ? ) / 운영: UseExceptionHandler 동작 ( ? )
             함정 2가지 ____ / Problem Details 필드 ____ / 검증 실패 = ( ? )
         4.3 상태 3가지 ____ / AddHealthChecks + MapHealthChecks / IHealthCheck / Predicate·태그 / 비정상 = ( ? )
             liveness vs readiness vs startup
```

### 2. 인출 질문

1. 미들웨어 파이프라인이 "양방향"이라는 말은 무슨 뜻이며, 단락(short-circuit)이란?

   <details markdown="1"><summary>답 확인</summary>

   요청이 들어갈 때 한 번, 응답이 나올 때 역순으로 한 번 각 미들웨어가 실행 기회를 얻는다(마트료시카처럼 바깥이 안쪽을 감쌈). `await next(context)` 를 부르지 않고 응답을 직접 만들면 뒤쪽 미들웨어와 엔드포인트가 실행되지 않는데 이것이 단락이다. → 코어 1 (1.1)

   </details>

2. 미들웨어 순서가 중요한 이유와, 예외 처리 미들웨어를 어디에 두어야 하나요?

   <details markdown="1"><summary>답 확인</summary>

   `Use*` 로 추가한 순서가 곧 실행 순서다. 예외는 앞쪽 미들웨어 방향으로 거슬러 올라가므로, 뒤쪽 예외를 잡아야 하는 에러 처리 미들웨어는 앞쪽에 둔다. → 코어 1 (1.1), 코어 4 (4.2)

   </details>

3. `MapGet` 은 미들웨어인가요? 처리할 엔드포인트가 없으면?

   <details markdown="1"><summary>답 확인</summary>

   미들웨어가 아니라 엔드포인트 정의다. `WebApplication` 이 엔드포인트 미들웨어를 맨 끝에 자동 추가하고, 처리할 곳이 없으면 404를 돌려준다. → 코어 1 (1.1)

   </details>

4. `next` 호출 뒤에 응답 헤더나 상태 코드를 바꾸면 어떻게 되나요?

   <details markdown="1"><summary>답 확인</summary>

   응답이 이미 전송된 경우 예외가 난다. 바꿀 것은 `next` 전에 바꾼다. → 코어 1 (1.1)

   </details>

5. 클래스 미들웨어를 만들 때 필요한 형태와 등록 관례는?

   <details markdown="1"><summary>답 확인</summary>

   `RequestDelegate` 를 받는 public 생성자와 `HttpContext` 를 첫 매개변수로 받는 `Invoke`/`InvokeAsync` 메서드. 특정 부모 클래스나 인터페이스를 상속할 필요는 없다. 등록은 `UseMiddleware<T>()` 를 감싼 확장 메서드로 하는 것이 관례다. → 코어 1 (1.1)

   </details>

6. DI 수명 세 가지의 생성 시점과 대표 용도는?

   <details markdown="1"><summary>답 확인</summary>

   Transient: 요청받을 때마다 새로(상태 없는 가벼운 서비스). Scoped: 웹 요청 하나당 하나(DB 컨텍스트, 플레이어 데이터 서비스). Singleton: 앱이 살아 있는 동안 하나(읽기 전용 공용 데이터), 여러 요청 스레드가 동시에 쓰므로 스레드 안전해야 한다. 사용자별 데이터를 Singleton에 두면 다른 사용자에게 샐 수 있다. → 코어 2 (2.1)

   </details>

7. 캡티브 의존성이란 무엇이고, 이를 막는 규칙과 프레임워크의 검사는?

   <details markdown="1"><summary>답 확인</summary>

   Singleton이 Scoped 서비스를 주입받아 그 Scoped 객체가 앱 종료까지 붙잡혀 "요청마다 새로"라는 약속이 깨지는 것. 규칙: 자기보다 수명이 같거나 긴 것에만 의존한다. 개발 환경에서는 프레임워크가 검사해 시작 시(또는 처음 쓸 때) 예외를 던지며, 성능 비용 때문에 기본적으로 개발 환경에서만 켜진다. → 코어 2 (2.1)

   </details>

8. 앱 시작 시 Scoped 서비스가 필요할 때 `app.Services` 에서 바로 꺼내면 왜 안 되나요?

   <details markdown="1"><summary>답 확인</summary>

   루트 컨테이너에서 Scoped/Transient를 꺼내면 앱 종료까지 남아 메모리가 샌다. `CreateAsyncScope()`(권장) 또는 `CreateScope()` 로 스코프를 만들고 그 안에서 꺼낸다. → 코어 2 (2.1)

   </details>

9. 설정 프로바이더의 우선순위와 "덮어쓰기" 원리는?

   <details markdown="1"><summary>답 확인</summary>

   여러 프로바이더에서 키-값을 읽어 합치며 나중에 추가된 프로바이더가 같은 키를 덮어쓴다. 우선순위: 명령줄 > 환경 변수 > 사용자 비밀(개발 환경) > `appsettings.{환경}.json` > `appsettings.json`. → 코어 3 (3.1)

   </details>

10. 비밀은 어디에 두어야 하며, User Secrets와 환경 변수는 암호화되나요?

    <details markdown="1"><summary>답 확인</summary>

    `appsettings.json` 에 넣지 않고 로컬은 User Secrets, 서버는 환경 변수를 쓰는 것이 흔하다. 둘 다 암호화되지는 않으므로 "저장소에 안 올리기"용이다. → 코어 3 (3.1)

    </details>

11. 환경은 어떻게 정해지며, 환경 변수로 계층 키를 줄 때의 구분자는?

    <details markdown="1"><summary>답 확인</summary>

    `ASPNETCORE_ENVIRONMENT` 값(Development/Staging/Production)으로 정해지고 없으면 Production이다. `appsettings.Development.json` 같은 환경별 파일이 기본 파일 위에 덮어써진다. 계층 키는 `:` 대신 `__` 를 쓰는 것이 안전하다(`Game__GoldPerSecond` → `Game:GoldPerSecond`). → 코어 3 (3.1)

    </details>

12. `IOptions<T>`, `IOptionsSnapshot<T>`, `IOptionsMonitor<T>` 의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    `IOptions<T>` 는 Singleton이라 파일이 바뀌어도 처음 값을 유지한다. `IOptionsSnapshot<T>` 는 Scoped로 요청마다 새로 만들어 변경을 반영하지만 매 요청 재계산 비용이 든다. `IOptionsMonitor<T>` 는 Singleton에서도 변경 반영이 필요할 때 쓴다. → 코어 3 (3.1)

    </details>

13. 옵션 패턴에서 `ValidateOnStart()` 를 권하는 이유와, 프로퍼티 이름 오타의 위험은?

    <details markdown="1"><summary>답 확인</summary>

    설정이 잘못되면 실행 중 뒤늦게가 아니라 시작 시점에 실패하게 하려고 Architecting ASP.NET Core Applications이 기본으로 권한다(`ValidateDataAnnotations()` 와 함께). 옵션 클래스 프로퍼티 이름과 JSON 키가 어긋나면 조용히 기본값이 남을 수 있어 검증이 필요하다. → 코어 3 (3.1)

    </details>

14. 로그 레벨 여섯 단계와 운영 환경에서의 권장 설정은?

    <details markdown="1"><summary>답 확인</summary>

    Critical, Error, Warning, Information, Debug, Trace(심각한 것부터). 운영에서는 Trace는 끄고(민감 정보 위험), Debug는 조사할 때만, Information 이상은 켜 두되 ASP.NET Core 자체의 Information 로그는 줄인다(`Logging:LogLevel` 의 카테고리별 설정). → 코어 4 (4.1)

    </details>

15. 메시지 템플릿(`"Player {PlayerId}", id`)이 보간 문자열보다 나은 점과, 로그에 남기지 말아야 할 것은?

    <details markdown="1"><summary>답 확인</summary>

    출력은 같지만 로그가 꺼진 레벨일 때 문자열 처리를 건너뛰어 가볍고, 구조화 로그에서 값으로 검색할 수 있다. 예외는 별도 인자로 넘기면 함께 기록된다. 남기지 말 것: 비밀번호·키·연결 문자열, 개인정보, 결제 정보. → 코어 4 (4.1)

    </details>

16. `UseExceptionHandler("/error")` 는 어떻게 동작하며, 어떤 함정이 있나요?

    <details markdown="1"><summary>답 확인</summary>

    예외를 잡으면 요청 경로를 오류 경로로 바꿔 파이프라인을 다시 실행해 응답을 만들고 상태 코드를 500으로 맞춘다. 함정: 이미 응답 전송이 시작됐으면 바꿀 수 없고, 오류 처리 경로 자체가 예외를 던지면 날것의 500이 나간다. 그래서 오류 처리 코드는 단순하게 한다. 개발 환경에서는 개발자 예외 페이지가 자동 추가된다. → 코어 4 (4.2)

    </details>

17. Problem Details의 주요 필드와 콘텐츠 형식, 그리고 운영에서 스택 트레이스를 숨기는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    RFC 7807 형식으로 `type`, `title`, `status`, `detail`, `instance` 필드를 가지며 `application/problem+json` 으로 내려간다. 검증 실패는 400 + `ValidationProblemDetails`(필드별 `errors`). 스택 트레이스는 공격자에게 정보를 주므로 운영에서 절대 노출하지 않는다. → 코어 4 (4.2)

    </details>

18. 헬스 체크의 세 가지 상태와 기본 등록 방법, 커스텀 검사 방법은?

    <details markdown="1"><summary>답 확인</summary>

    Healthy, Degraded, Unhealthy. `AddHealthChecks()` 로 등록하고 `MapHealthChecks("경로")` 로 열면 정상일 때 200과 `Healthy` 가 나온다. 커스텀은 `IHealthCheck.CheckHealthAsync` 를 구현해 `AddCheck<T>(이름, tags: ...)` 로 등록하고, `Predicate` 로 태그·이름별로 골라 엔드포인트를 나눈다. 비정상이면 503. EF Core는 `AddDbContextCheck<T>`. → 코어 4 (4.3)

    </details>

19. liveness와 readiness의 차이와, liveness에서 다른 서비스 상태를 확인하면 안 되는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    liveness는 "응답할 수 있는가"만 보고, readiness는 초기화·의존 대상 상태를 반영해 트래픽을 받을 준비가 됐는지 본다. liveness에서 다른 서비스까지 확인하면 남의 장애 때문에 멀쩡한 앱이 재시작되는 연쇄 실패가 생길 수 있다. 시작이 오래 걸리면 startup 프로브를 따로 쓰고, 프로브 검사는 빨라야 한다. → 코어 4 (4.3)

    </details>

20. C++ 서버의 패킷 필터 체인과 미들웨어 파이프라인은 어디까지 같고 어디서 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    같은 점: 등록 순서대로 단계가 실행되고, 각 단계가 한 가지 일을 하고 넘기며, 중간에서 처리를 끝내 뒤를 건너뛸 수 있다(단락). 다른 점: 미들웨어는 양방향이라 `await next()`가 돌아온 뒤 같은 미들웨어가 응답 쪽 코드를 한 번 더 실행하고, 예외도 이 길을 거꾸로 거슬러 오른다(그래서 예외 처리는 맨 앞). 응답 전송이 시작된 뒤에는 헤더를 바꿀 수 없다. → 코어 1 (1.1)

    </details>

21. `main()`에서 매니저 싱글턴들을 손으로 조립하던 코드와 DI 컨테이너는 무엇이 다른가요? C++ 서버에 없던 수명은?

    <details markdown="1"><summary>답 확인</summary>

    객체 그래프를 시작 지점에서 조립한다는 점은 같지만, DI 컨테이너는 "타입 → 구현 + 수명" 등록만 받고 생성자 매개변수를 보고 알아서 만들어 넣는다. C++ 서버에 거의 없던 개념이 **Scoped**(HTTP 요청 하나 동안만 사는 객체)이며, Singleton이 Scoped를 붙잡으면 캡티브 의존성이 된다. → 코어 2 (2.1)

    </details>

### 3. 기억 고리

- **C++ 유추:** 미들웨어 파이프라인 ≈ 패킷 처리 필터 체인. ⚠️ 깨지는 곳: 필터 체인은 대개 단방향이지만 미들웨어는 `next` 전후로 두 번 실행 기회가 있는 양방향이고, 예외가 앞쪽으로 거슬러 올라가므로 예외 처리 미들웨어는 맨 앞에 있어야 한다.
- **C++ 유추:** DI 컨테이너 ≈ 서버 시작 시 매니저 싱글턴들을 조립하던 코드. ⚠️ 깨지는 곳: 수명이 셋이고, 그중 **Scoped는 요청 단위**다. 매니저(Singleton)가 요청 단위 객체를 멤버로 붙잡으면 캡티브 의존성이다.
- **C++ 유추:** 옵션 패턴 ≈ 설정 파일 로더. ⚠️ 깨지는 곳: 파일 하나가 아니라 JSON·환경별 JSON·User Secrets·환경 변수·명령줄이 겹쳐 나중 것이 이기고, 검증(`ValidateOnStart`)과 재시작 없는 변경 반영(`IOptionsMonitor`)이 붙는다.
- **C++ 유추:** `UseExceptionHandler` ≈ 패킷 처리 최상위 `try/catch`. ⚠️ 깨지는 곳: 세션을 끊지 않고 500 Problem Details를 응답한다. 스택 트레이스는 응답에 싣지 않는다.
- **비유:** 미들웨어 파이프라인 = 마트료시카. 요청은 바깥 인형부터 안으로 들어가고 응답은 안에서 밖으로 나온다. ⚠️ 비유가 깨지는 지점: 인형과 달리 미들웨어는 `next` 를 부르지 않고 중간에서 되돌아갈(단락) 수 있고, 응답 전송이 시작된 뒤에는 바깥 층이 헤더를 고칠 수 없다.
- **비유:** 캡티브 의존성 = 평생 회원(Singleton)이 하루 입장권(Scoped)을 영원히 쥐고 있는 것. 입장권은 매일 새로 발급돼야 하는데 그 하나가 계속 재사용된다. ⚠️ 깨지는 지점: 반대 방향(Scoped가 Singleton에 의존)은 문제없다.
- **묶음(3의 법칙):** DI 수명 3 = Transient · Scoped · Singleton. 옵션 인터페이스 3 = IOptions · IOptionsSnapshot · IOptionsMonitor. 헬스 상태 3 = Healthy · Degraded · Unhealthy. 운영 기본 틀 3 = 로깅 · 예외 처리 · 헬스 체크.
- **대칭·순서:** 개발자 예외 페이지(개발) ↔ `UseExceptionHandler`(운영), liveness ↔ readiness, 예상 가능한 실패(4xx) ↔ 예상 밖 오류(500). 설정 우선순위: 명령줄 > 환경 변수 > User Secrets > 환경별 json > appsettings.json.
- **결정적 지식 두 개:** ① "파이프라인은 추가 순서대로 감싸는 양방향 구조다" — 예외 처리 미들웨어를 앞에 두는 이유, 단락, `next` 후 헤더 변경 불가, `UseExceptionHandler`의 재실행 동작이 모두 이 원리로 설명된다. ② "수명이 짧은 것을 긴 것이 붙잡으면 안 된다" — 캡티브 의존성, 루트 컨테이너에서 Scoped 꺼내기 누수, Singleton의 스레드 안전·사용자 데이터 누출 문제가 이 원리로 설명된다.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "요청 하나가 `Program.cs` 의 미들웨어들을 지나 엔드포인트에 닿고, 예외가 나면 어떻게 Problem Details 500이 되는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리 서버의 패킷 필터 체인과 매니저 초기화 코드가 ASP.NET Core에서는 각각 무엇이 되고, 왜 예외 처리 미들웨어는 맨 앞이어야 하며, 왜 매니저(Singleton)가 DB 컨텍스트를 멤버로 들고 있으면 안 되는지"를 3분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "서비스는 가능하면 Singleton으로 등록해 재사용해야 한다(Architecting ASP.NET Core Applications의 선택 요령)" vs B "Scoped가 안전하다(스레드 안전·사용자 데이터 누출·캡티브 의존성)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 ASP.NET Core 설정 프로바이더 우선순위와 옵션 패턴을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제9부. 설계 원칙과 패턴

> **🎮 게임 서버 개발자에게** — 매니저 싱글턴, 순수 가상 함수로 갈아 끼우던 패킷 핸들러, 패킷 필터 체인, 에러 코드 반환, 콜백 등록을 C++ 서버에서 써 왔다면 이 부의 패턴 대부분은 이미 손에 익은 것이다. 이 부의 목적은 바로 앞 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)에서 "일단 따라 쓴" `AddScoped`·생성자 주입·`UseMiddleware`·`IOptions<T>`가 **어떤 원리(SoC·DIP·OCP)에서 나왔는지 되짚는 것**이다. 결정적으로 다른 점은 두 가지다. C#/ASP.NET Core에서는 "하나만 있는 객체"를 Singleton 패턴으로 직접 만들지 않고 DI 컨테이너의 수명에 맡기며, 상속보다 인터페이스 + 조합(생성자로 받기)을 기본으로 한다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 새 직업·스킬을 추가할 때마다 전투 계산 서비스의 거대한 `switch`를 고치다가 기존 스킬이 깨진다 (SoC·OCP·Strategy·Chain).
> - `GameConfigHolder.Instance`나 `DateTime.UtcNow`를 코드 곳곳에서 직접 불러, 오프라인 보상 계산을 가짜 시간·가짜 설정으로 테스트할 수 없다 (Singleton 안티패턴 → DI).
> - "골드 부족"마다 예외를 던져 로그가 Error로 도배되고 클라이언트는 500을 받는다, 혹은 지갑 서비스가 업적·로그·저장 서비스를 모두 직접 호출해 하나를 고치면 셋이 흔들린다 (Operation Result·이벤트).

## 코어 — 이것만은 100%

> **한 문장:** 좋은 설계는 "바뀌는 이유"별로 관심사를 나누고(SoC·SRP), 구체가 아닌 인터페이스에 의존해 밖에서 부품을 넣어 주는 것(DIP·DI)이며, Strategy·Factory·Decorator·Chain 같은 패턴과 Options·Operation Result·이벤트는 모두 "기존 코드를 고치지 않고 교체·확장한다(OCP)"는 같은 목표의 도구이되, KISS·YAGNI로 과설계를 경계한다. [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)에서 쓴 DI 컨테이너·미들웨어·옵션 패턴은 이 원리들을 프레임워크가 구현해 둔 것이다.

1. **바뀌는 이유로 나누고, 필요한 만큼만 — 원칙** — 코드 냄새(God class, 긴 메서드, Control Freak)를 알아채고 SoC로 나누되, DRY는 "같은 이유로 바뀌는가"로 판단하고 KISS·YAGNI로 이점이 복잡도보다 클 때만 추상화한다. SOLID는 규칙이 아니라 지침이다.
2. **인터페이스에 의존하고 밖에서 넣는다 — DI·Options의 뿌리** — Strategy(방식 교체)가 DI의 뼈대이고, Abstract Factory(관련 객체 세트 생성)는 "객체 그래프 조립" 문제로 이어진다. 의존 대상은 안에서 `new` 하지 말고 생성자 주입으로 받아 Composition Root 한 곳에서 조립하며, Singleton 패턴 대신 DI의 singleton 수명을 쓴다. 설정 값도 작은 객체로 나눠 밖에서 넣는다(Options).
3. **고치지 않고 감싸고, 잇고, 뼈대를 물려준다 — 구조·행동 패턴** — Decorator(같은 인터페이스로 감싸 기능 추가), Composite(leaf와 그룹을 같게), Adapter(인터페이스 변환), Facade(사용법 단순화), Template Method(뼈대는 부모, 세부는 자식), Chain(처리 가능한 담당자에게 넘기기, 그 "파이프라인" 변형이 미들웨어).
4. **실패와 변화를 값과 신호로 — Operation Result와 이벤트** — 예상되는 실패는 Operation Result로 예외 없이 표현하고, 상태 변화는 이벤트(broadcaster/subscriber, Observer)로 방송해 서로 몰라도 반응하게 한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| `static SessionManager& Instance()` 같은 매니저 싱글턴(함수 로컬 static, C++11부터 초기화가 스레드 안전) | Singleton 패턴 → DI 컨테이너의 singleton 수명 | 프로세스에 인스턴스 하나만 두고 계속 재사용한다 | C#도 정적 프로퍼티 초기화로 스레드 안전하게 만들 수 있지만, 이 부의 출처는 C#에서 Singleton 패턴을 안티패턴으로 본다. "하나만"은 컨테이너가 보장하고, 쓰는 쪽은 인터페이스로 받아 테스트에서 가짜로 바꿔 끼운다. 전역 `Instance` 호출이 코드 곳곳에 퍼지지 않는다 |
| 순수 가상 함수만 있는 추상 클래스를 두고 패킷 핸들러·AI 행동을 갈아 끼우던 구조 | 인터페이스 + Strategy, DIP | 호출하는 쪽은 추상 타입만 알고, 가상 호출로 구현이 바뀐다 | C# `interface`는 별도 언어 요소이고, 클래스는 하나만 상속하지만 인터페이스는 여러 개 구현할 수 있다. 어떤 구현을 넣을지는 생성자 주입으로 **밖에서** 정한다 |
| `main()`에서 매니저들을 순서대로 만들고 서로의 포인터와 설정 로더가 읽은 `Config` 구조체를 넘겨 주던 초기화 코드 | Composition Root(Pure DI) → [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 `Program.cs` 등록, Options 패턴 | 객체 그래프와 설정을 프로그램 시작 지점 한 곳에서 조립한다 | ASP.NET Core에서는 손으로 조립하지 않고 컨테이너에 "타입 → 구현 + 수명"만 등록한다. 수명에는 요청 단위(Scoped)가 있고, 설정은 여러 출처를 겹친 뒤 옵션 클래스로 바인딩된다 |
| 패킷 처리 필터 체인 (복호화 → 압축 해제 → 인증 → 디스패치) | Chain of Responsibility, 그 "파이프라인" 변형 = 미들웨어 | 처리자가 줄을 서서 자기 일을 하고 다음으로 넘긴다 | 고전 Chain은 "처리할 수 있는 하나가 처리하면 끝"이고, 모두가 일하고 넘기는 것은 "파이프라인" 변형이다. ASP.NET Core 미들웨어는 여기에 더해 응답이 역순으로 되돌아오는 양방향 구조다 |
| `enum ErrorCode` 반환, `bool TryXxx(..., out)`, C++23 `std::expected` | Operation Result 패턴 | 예상되는 실패를 예외가 아니라 반환값으로 알린다 | C#에서는 `record` 계층 + 정적 팩토리(`Success`/`Failure`) + 패턴 매칭(`r is FailedUpgrade f`)으로 실패 이유까지 담는다. 예외는 디스크 꽉 참 같은 예외적 사건에만 쓴다 |
| `std::vector<std::function<void(Event)>>` 콜백 리스트, 옵저버 | `event EventHandler<T>` (broadcaster/subscriber) | 등록·해제·알림의 구조, 방송자는 구독자를 모른다 | 이벤트 구독은 방송자가 구독자의 델리게이트를 **강하게 참조**한다. C++에서는 구독자를 파괴한 뒤 남은 콜백(dangling)이 위험이었다면, C#에서는 해제(`-=`)를 잊으면 구독자가 GC에 수거되지 못하는 메모리 누수가 위험이다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. 코드가 "비슷하게 생겼다"면 무조건 한 곳으로 합쳐야 할까?
> 2. 이 책은 왜 C#에서 Singleton을 안티패턴이라고까지 말할까? 그럼 "하나만 필요한 것"은 어떻게 만들까? (C++ 서버의 매니저 싱글턴과 비교해 보자)
> 3. 클래스 안에서 `new` 로 부품을 직접 만들면 무엇이 곤란해질까? [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)에서 `builder.Services.AddScoped<IHeroService, HeroService>()`로 등록하고 생성자로 받은 것은 이 문제를 어떻게 푸는가?
> 4. Decorator와 Chain of Responsibility, Adapter와 Facade는 각각 무엇이 다를까? ASP.NET Core 미들웨어는 어느 쪽에 가까울까?
> 5. "골드 부족" 같은 실패는 예외로 던져야 할까, 결과 객체로 돌려줘야 할까?
>
> **처리법:** 🛠 실습 `ISkill` Strategy 교체, 생성자 주입 + Composition Root, `CriticalSkill` Decorator, `DamageHandler` Chain, `UpgradeResult` 정적 팩토리, `EventHandler<T>` 이벤트 → 읽자마자 직접 실행 · 🗺 관계도 원칙(SoC·DRY·KISS·YAGNI·SOLID) → 패턴(Strategy·Factory·Decorator·Chain…) → DI·Options·Operation Result·이벤트 → [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 DI 컨테이너·미들웨어·옵션 패턴으로 이어지는 관계 · 🔗 유추 DI ≈ 콘센트(인터페이스)와 플러그(구현), Adapter ≈ 여행용 전원 어댑터, Decorator ≈ 폰 케이스 — 어디까지 맞고 어디서 깨지는지 따져 보기 · 📦 카드로 SOLID 각 글자, 수명 3종(Transient/Scoped/Singleton)과 고려 순서, `IOptions`/`IOptionsSnapshot`/`IOptionsMonitor`, 표준 이벤트 델리게이트 규칙

---

**학습 목표**
1. "나쁜 코드의 냄새"를 알아채고, SoC·DRY·KISS·YAGNI·SOLID 같은 기본 원칙으로 코드를 정리하는 감각을 얻는다.
2. Strategy, Singleton(주의점), Factory, Decorator, Facade, Chain of Responsibility 등 자주 쓰는 패턴의 "아이디어"를 이해한다.
3. DI, Options, Operation Result, 이벤트(Observer)를 C# HTTP 게임 서버의 구조(스킬 교체, 밸런스 설정, 구매/강화 결과의 API 응답 매핑, 서비스 간 알림)에 연결한다.

> 🔧 보충(책 외): 이 부의 주 출처(Marcotte)는 ASP.NET Core 웹 개발서입니다. 이 프로젝트는 C#으로 만드는 HTTP 웹 백엔드(게임 서버)로 확정되었으므로, 이 부에서는 컨트롤러·HTTP 요청 같은 웹 전용 코드는 다루지 않고 "설계 아이디어"만 게임 예제로 다시 썼습니다. 웹 관련 자세한 내용은 앞의 [제7부](07_제7부_웹_API_기초.md)·[제8부](08_제8부_ASP_NET_Core_핵심_동작.md)와 뒤의 [제10부](10_제10부_EF_Core_데이터_접근.md)~[제13부](13_제13부_아키텍처_테스트_배포_기초.md)에서 다룹니다. 코드 예제의 이름(hero, gold 등)은 모두 이 책에서 새로 만든 것입니다. 각 항 끝의 "방치형 RPG 서버에서는" 문단과 비유 일부도 이 책의 활용 제안이며 원문 내용이 아닙니다.

> 읽는 순서 안내: 이 부는 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)(ASP.NET Core 핵심 동작) 다음에 읽는다. 앞에서 DI 등록·수명, 미들웨어 파이프라인, 옵션 패턴을 "어떻게 쓰는가"로 먼저 익혔으므로, 여기서는 각 코어 첫머리의 **"앞에서 본 것 ↔ 원리"** 상자에서 그 코드를 다시 꺼내 "왜 그렇게 생겼는가"를 되짚는다.

> 재구성 안내: 원래 5개 장 9개 항(1 코드 냄새·SoC·DRY·KISS·YAGNI → 2 SOLID → 3 Strategy·Singleton·Abstract Factory → 4 DI → 5 Options → 6 Decorator·Facade·Composite·Adapter → 7 Template Method·Chain → 8 Operation Result → 9 이벤트)을 네 개 코어로 다시 묶었다. 원래 항 → 새 위치: 1 → 1.1, 2 → 1.2, 3 → 2.1, 4 → 2.2, 5 → 2.3, 6 → 3.1, 7 → 3.2, 8 → 4.1, 9 → 4.2.

---

## 코어 1. 바뀌는 이유로 나누고, 필요한 만큼만 — 원칙

> 원래 1장 "원칙"(1·2항). 이 부의 나머지 모든 패턴은 여기 두 원리 위에 선다. ① **바뀌는 이유 단위로 나눈다(SoC/SRP)** — DRY의 판단 기준, God class 해체, Singleton의 SRP 위반, Options의 작은 객체 분리, 이벤트로 지갑과 업적 분리가 모두 이 원리로 설명된다. ② **구현이 아니라 인터페이스에 의존한다(DIP)** — 코어 2·3의 거의 모든 패턴이 여기서 나온다. 그리고 반대 방향의 브레이크로 KISS·YAGNI가 있다.
>
> **앞에서 본 것 ↔ 원리:** [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 예제는 요청 로깅·클라이언트 버전 검사·예외 처리를 각각 다른 미들웨어로, 로깅·설정·헬스 체크를 각각 다른 서비스로 나눴다. 하나의 `GameService`나 하나의 거대한 미들웨어에 몰아넣지 않은 것이 SoC다.

### 1.1 코드 냄새·안티패턴, SoC, DRY, KISS, YAGNI

**한 줄 요약:** 코드가 "왠지 이상하다"는 신호를 알아보고, 역할을 나누고, 중복을 줄이고, 단순하게, 필요할 때만 만든다.

> 📖 출처: Architecting ASP.NET Core Applications 1장 "Anti-patterns and code smells" (텍스트 L1262-1360), 3장 "Separation of concerns" ~ "YAGNI" (텍스트 L3883-4051)

**핵심 설명**
- **안티패턴**: 좋아 보여서 쓰지만 결국 해가 되는 검증된 나쁜 방식. 대표 예가 **God class**(모든 걸 알고 관리하는 거대 클래스). 아무도 건드리기 싫고, 건드리면 앱이 깨진다. 해결은 책임을 여러 클래스로 쪼개는 것.
- **코드 냄새**: 문제가 "있을 수 있다"는 신호일 뿐 반드시 문제는 아니다. 예: 설명 주석이 많이 필요한 메서드, 10~15줄을 훌쩍 넘는 **긴 메서드**(주석으로 구간을 나눈 메서드, 거대한 switch), 내부에서 `new`로 의존 대상을 직접 만드는 것(Control Freak).
- **SoC(관심사 분리)**: 프로그램을 "관심사"별 조각으로 나눠 서로 최대한 독립시킨다. 한 곳을 고쳐도 다른 곳이 안 흔들린다.
- **DRY(반복 금지)**: 같은 로직이 여러 곳에 있으면 한 곳으로 모은다. 단, 책은 "코드가 비슷하다"가 아니라 "같은 이유로 바뀌는가(관심사)"를 기준으로 모으라고 경고한다. 비슷해 보여도 바뀌는 이유가 다르면 따로 두는 게 낫다.
- **KISS(단순하게)**: 부품이 많을수록 고장 난다. 인터페이스·계층을 추가할 때 얻는 이점이 늘어난 복잡도보다 클 때만 추가한다. 프로토타입에 대기업 수준의 설계는 과하다.
- **YAGNI**: 지금 필요 없는 기능은 "나중에 필요할지도"로 미리 만들지 않는다.

```csharp
// 냄새: 한 메서드가 전투, 골드 지급, 응답 구성을 모두 함 (God class의 씨앗)
void OnMonsterDead()
{
    hero.Exp += 10;          // 성장
    gold += monster.Reward;  // 경제
    response.Gold = gold;    // 응답 구성
}

// 개선: 관심사별로 나눔
void OnMonsterDead()
{
    growth.AddExp(10);
    wallet.Add(monster.Reward);
    // 응답 구성은 별도 단계에서 (알림이 필요하면 4.2 참고)
}
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** 처음엔 GameService 하나에 전투 정산/경제/저장/응답 구성을 다 넣기 쉽다. 서비스 클래스를 역할별(성장, 지갑, 저장소 등)로 나눠 두면 콘텐츠와 API가 늘어도 덜 무너진다. 다만 KISS·YAGNI도 함께 기억해, 처음부터 모든 걸 추상화하지는 말자.

### 1.2 SOLID 5원칙

**한 줄 요약:** 유연하고 테스트하기 쉬운 클래스를 만들기 위한 다섯 가지 지침. 규칙이 아니라 "지침"이다.

> 📖 출처: Architecting ASP.NET Core Applications 3장 "The SOLID principles" (텍스트 L4055-4076), SRP (L4078-4105), OCP (L4234-4257), LSP (L4387-4426), ISP (L4942-4957), DIP (L5281-5305)

**핵심 설명** (책도 작은 도구는 엄격히 지키지 않아도 된다고 말한다)

| 원칙 | 쉬운 뜻 | 비유 |
|---|---|---|
| **S** 단일 책임 | 클래스가 바뀌는 이유는 하나뿐이어야 한다 | 각 부분이 맡은 일이 하나면 요구사항이 바뀌어도 영향이 작다 |
| **O** 개방/폐쇄 | 확장에는 열려 있고 수정에는 닫혀 있다. 밖에서 동작을 바꿀 수 있어야 한다. 상속보다 조합을 권장 | 레고는 작은 블록을 조합해 만들면 고치기 쉽다 |
| **L** 리스코프 치환 | 부모 자리에 자식을 넣어도 프로그램이 깨지거나 예상 밖으로 동작하면 안 된다 | Bird의 Fly를 기대하는데 날 수 없는 Penguin을 넣으면 문제 |
| **I** 인터페이스 분리 | 클라이언트별로 작은 인터페이스 여러 개가 범용 인터페이스 하나보다 낫다 | "모든 것을 지배하는 인터페이스"는 God class와 같다 |
| **D** 의존성 역전 | 구체 클래스가 아니라 추상에 의존한다. 책은 인터페이스를 쓰는 것이 가장 좋은 방법이라고 한다 | (원문은 Dependency Injection Principles, Practices, and Patterns의 콘센트 비유를 DI 설명에 사용, 2.2) |

```csharp
// S: 저장은 SaveService(저장소)가, 전투 계산은 Battle이 담당
// D: Battle은 구체 클래스가 아니라 인터페이스에 의존
public interface IDamageRule { long Calc(long atk, long def); }

public class Battle
{
    private readonly IDamageRule _rule;
    public Battle(IDamageRule rule) => _rule = rule; // 밖에서 넣어 줌
    public long Attack(long atk, long def) => _rule.Calc(atk, def);
}
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** "새 직업/새 스킬을 추가할 때 기존 전투 계산 서비스를 고치지 않아도 되게" 만드는 것이 O의 목표다. 아래 Strategy(2.1)가 바로 그 도구다.

> 🔧 보충(책 외): C++ 서버 경험으로 옮기면 D는 "상위 로직(`Battle`)이 순수 가상 함수만 있는 추상 클래스(`IDamageRule`)에만 의존하고, 구체 클래스는 바깥에서 포인터로 넘겨받는 것"과 같다. 차이는 C#에서는 이 "바깥"을 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 DI 컨테이너가 맡는다는 점이다. 또 C#에서는 같은 이름의 `interface` 키워드가 따로 있고, 클래스는 하나만 상속하되 인터페이스는 여러 개 구현할 수 있어 I(인터페이스 분리)를 적용하기 쉽다.

---

## 코어 2. 인터페이스에 의존하고 밖에서 넣는다 — DI·Options의 뿌리

> 원래 2장 "생성·교체 패턴"(3항)과 3장 "의존성 주입과 설정"(4·5항). 흐름은 한 줄로 이어진다: **Strategy**(방식을 밖에서 갈아 끼움 = DI의 뼈대) → **Abstract Factory**(관련 객체 세트를 밖에서 정함 = 객체 그래프 조립 문제) → **Singleton 패턴의 한계**(하나만 두기는 클래스가 아니라 조립하는 쪽의 일) → **DI**(생성자 주입 + Composition Root + 수명) → **Options**(설정 값도 밖에서 넣기).
>
> **앞에서 본 것 ↔ 원리:** [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)에서 `builder.Services.AddScoped<IHeroService, HeroService>()`로 등록하고 `HeroService(GoldLedger ledger)`처럼 생성자로 받았다. 여기서 ① 엔드포인트가 `HeroService`가 아니라 `IHeroService`를 받는 것이 DIP(1.2)와 Strategy(2.1), ② `Program.cs`의 등록부가 Composition Root(2.2), ③ `AddSingleton<GoldLedger>()`가 Singleton 패턴 대신 쓰는 "singleton 수명"(2.1·2.2), ④ `AddOptions<GameSettings>().Bind(...)`가 Options 패턴(2.3)의 프레임워크 구현이다.

### 2.1 Strategy, Singleton, Abstract Factory

**한 줄 요약:** Strategy는 "방식을 갈아 끼우기", Abstract Factory는 "관련 객체 세트를 한 번에 만들기", Singleton은 "하나만 두기(웬만하면 피하기)".

> 📖 출처: Architecting ASP.NET Core Applications 7장 "The Strategy design pattern" (텍스트 L9776-9830, 10045-10068), "The Abstract Factory design pattern" (L10075-10108, 10383-10408), "The Singleton design pattern" (L10412-10475, 10604-10627, 10706-10730)

**Strategy**
- 알고리즘(전략)을 사용하는 클래스(Context) 밖으로 빼서, 실행 중에 골라 쓰게 하는 패턴. 구성은 Context, `IStrategy` 인터페이스, 여러 구체 전략이다.
- Context는 어떤 전략이 들어왔는지 모른다. 그래서 코드 수정 없이 동작이 바뀌고(OCP), 상속 대신 조합을 쓰게 된다. 책은 이것이 의존성 주입(DI)의 뼈대라고 한다.

```csharp
public interface ISkill { long Damage(long atk); }
public class Slash : ISkill { public long Damage(long atk) => atk * 2; }
public class Fireball : ISkill { public long Damage(long atk) => atk * 5; }

public class Hero
{
    public ISkill Skill { get; set; } = new Slash();   // 언제든 교체 가능
    public long Attack(long atk) => Skill.Damage(atk);
}
// hero.Skill = new Fireball();  // 스킬 교체 끝. Hero 코드는 그대로
```

**Abstract Factory**
- "서로 관련된 객체 묶음(가족)"의 생성을 추상화한다. 소비자는 추상 객체를 요청하고 추상 객체를 받으므로, 생성 과정이 소비자와 분리된다. 책의 예는 `IVehicleFactory`(`CreateCar()`, `CreateBike()`)와 이를 구현한 `LowEndVehicleFactory`, `HighEndVehicleFactory`다. 각 공장은 자기 가족(자동차와 자전거 둘 다)을 만든다.
- 책은 `MidRangeVehicleFactory`를 새로 추가해도 소비자(테스트 코드)를 고칠 필요가 없음을 보여 준다. 반대로 `CreateHighEndBike()` 같은 구체 메서드를 모두 담은 큰 인터페이스(`ILargeVehicleFactory`)를 쓰면, 소비자가 특정 메서드에 묶여 동작을 바꾸려면 코드를 고쳐야 하고(OCP 위반), 중급 모델을 추가할 때 인터페이스 자체가 바뀌어 구현체도 모두 수정해야 한다(ISP 위반 포함).
- 책은 특정 공장을 소비자에게 넘겨 결과를 바꾸는 것을 "객체 그래프를 조립하는 문제"로 옮기는 것이라고 설명한다. (그 조립을 한 곳에서 하는 것이 2.2의 Composition Root다)

```csharp
public interface IMonster { }
public interface IReward { }
public class ForestMonster : IMonster { }
public class ForestReward : IReward { }
public class DesertMonster : IMonster { }
public class DesertReward : IReward { }

public interface IStageFactory { IMonster CreateMonster(); IReward CreateReward(); }
public class ForestStageFactory : IStageFactory
{
    public IMonster CreateMonster() => new ForestMonster();
    public IReward CreateReward() => new ForestReward();
}
public class DesertStageFactory : IStageFactory
{
    public IMonster CreateMonster() => new DesertMonster();
    public IReward CreateReward() => new DesertReward();
}
// 소비자는 IStageFactory만 받는다. 새 지역 공장을 추가해도 소비자 코드는 그대로.
```

**Singleton**
- 클래스의 인스턴스를 하나로 제한하고 계속 재사용한다: private 정적 필드 + private 생성자 + 공개 정적 메서드(또는 프로퍼티)로 이루어진다.
- 아래의 `??=` 방식은 스레드 안전하지 않다고 책은 지적한다. 책은 `lock`을 쓰는 방법 대신, 정적 프로퍼티 초기화(`public static X Instance { get; } = new();`)로 언어에 맡기는 편이 낫다고 한다. 이때 `=>`로 쓰면 호출할 때마다 새 인스턴스가 생기니 주의(아래 코드는 학습용 고전형).
- **책의 결론은 강하다.** C#에서 Singleton은 안티패턴이며 원칙적으로 쓰지 말고 DI를 쓰라고 한다. 이유: 클래스가 "자기 자신 + 자기 생성 관리" 두 책임을 가져 SRP를 깨고, 수정 없이 확장하기 어려우며(OCP 위반), 테스트가 어렵다. 전역 상태(Ambient Context)는 강한 결합, 교체 곤란, 예상 못한 곳에서 값이 망가지는 문제, 잡동사니 누적을 부른다. 대신 DI에서 "singleton 수명"으로 하나만 유지한다.

```csharp
public class GameConfigHolder                  // 고전적 Singleton
{
    private static GameConfigHolder? _instance;
    private GameConfigHolder() { }
    public static GameConfigHolder Instance => _instance ??= new GameConfigHolder();
}
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** Strategy를 스킬/자동 공격 방식/재화 획득 공식 교체에 쓰기 좋다.

> 🔧 보충(책 외): 서버에서 "하나만 필요한 것"(밸런스 설정 캐시, 저장소 클라이언트 등)은 위처럼 Singleton을 직접 구현하지 말고, DI 컨테이너의 Singleton 수명으로 등록해 컨테이너가 수명을 관리하게 한다(위 책의 결론과 같은 방향, 다음 2.2와 앞의 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md) 참조). 이렇게 하면 인터페이스로 받아 쓰고 테스트에서 교체할 수 있다. 서버는 여러 요청이 동시에 하나의 인스턴스를 쓰므로, 상태가 있다면 스레드 안전해야 한다는 점(2.2)도 기억하자.

> 🔧 보충(책 외): C++ 서버의 `static SessionManager& Instance() { static SessionManager s; return s; }`(함수 로컬 static)도 C++11부터 초기화가 스레드 안전하다는 점에서 위 "정적 프로퍼티 초기화" 방식과 닮았다. 그러나 책이 문제 삼는 것은 초기화의 스레드 안전이 아니라 **누구나 `Instance`로 전역에서 꺼내 쓰는 구조** 자체(SRP·OCP 위반, 테스트 곤란, 전역 상태)다. [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 `AddSingleton<GoldLedger>()`는 인스턴스가 하나라는 점은 같지만, 쓰는 쪽은 생성자로 받기만 하므로 이 문제가 없다.

### 2.2 의존성 주입(DI) 개념과 수명

**한 줄 요약:** 필요한 부품을 클래스 안에서 `new` 하지 말고 밖에서 넣어 준다. 그러면 부품 교체가 쉬워진다.

> 📖 출처: Architecting ASP.NET Core Applications 8장 "Dependency Injection" (텍스트 L10990-11063, 11154-11210, 11605-11625, 13311-13345), Dependency Injection Principles, Practices, and Patterns 1장 "1.1 Writing maintainable code" ~ "1.2 Hello DI!" (텍스트 L983-1003, 1159-1230, 1384-1422)

**핵심 설명**
- Dependency Injection Principles, Practices, and Patterns는 DI를 목적이 아니라 수단이라고 한다. DI는 느슨한 결합을 가능하게 하고, 느슨한 결합은 유지보수를 쉽게 한다. 핵심 격언은 "구현이 아니라 인터페이스에 맞춰 프로그래밍하라".
- 비유: 헤어드라이어를 벽에 직결(강한 결합)하면 고장 때 전기를 끊고 뜯어내야 한다. 콘센트(인터페이스)와 플러그(구현)를 쓰면 마음대로 바꿔 꽂는다.
- 클래스 안에서 의존 대상을 `new`로 직접 만드는 것은 코드 냄새(Control Freak)이다. 책은 `new`가 본질적으로 틀린 것은 아니며, 바뀔 수 있는 의존성(volatile)에 특히 문제이고 안정적인(stable) 의존성에는 사용을 최소화하면 된다고 본다. 대신 **생성자 주입**(필요한 것을 생성자 매개변수로 받기)이 가장 권장되는 방법이다.
- **컨테이너(IoC)**: 어떤 부품을 넣을지 계획(composition root)을 적어 두면 자동으로 조립해 주는 도구(레고 계획서와 조립 로봇). 컨테이너 없이 Main에서 직접 조립하는 방식도 있다(Dependency Injection Principles, Practices, and Patterns의 "Pure DI").
- **수명(Lifetime)**: Transient(요청할 때마다 새로), Scoped(웹 요청당 하나), Singleton(앱 전체에서 하나). 책은 가능하면 singleton, 안 되면 scoped, 그래도 안 되면 transient 순으로 고려하라고 한다(재사용이 많을수록 메모리·GC 부담이 준다). 여러 소비자가 공유하는 상태 있는 singleton은 스레드 안전해야 한다.
  - > 🔧 보충(책 외): 게임 서버는 HTTP 요청을 처리하므로 Scoped(요청당 하나)도 실제로 쓴다. 예를 들어 한 요청 안에서 유저 데이터를 읽고 강화 결과를 저장하는 서비스는 Scoped, 밸런스 설정처럼 읽기 전용으로 공유하는 것은 Singleton이 어울린다. 자세한 등록 방법은 앞의 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)를 참조(캡티브 의존성 같은 수명 규칙도 거기서 다뤘다).

```csharp
public interface IWallet { void Add(long gold); }
public class Wallet : IWallet { public long Gold; public void Add(long g) => Gold += g; }

public class MonsterKillHandler
{
    private readonly IWallet _wallet;
    public MonsterKillHandler(IWallet wallet) => _wallet = wallet; // 생성자 주입
    public void OnKill(long reward) => _wallet.Add(reward);
}

// 조립(Composition Root): 프로그램 시작 지점 한 곳에서만 new
var handler = new MonsterKillHandler(new Wallet());
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** Singleton 대신 "지갑, 저장소, 시간 계산기" 같은 서비스를 DI 컨테이너에 등록해 두고, 컨테이너가 수명을 관리하며 생성자로 넣어 주게 한다(ASP.NET Core의 등록 방법은 앞의 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md) 참조). 그러면 오프라인 보상 계산을 가짜 시간으로 시험하기도 쉽다.

> 🔧 보충(책 외): 컨테이너 없이 "생성자로 넘겨 주기"만 익혀도 DI의 핵심은 잡을 수 있다. 서버에서는 프레임워크가 컨테이너를 제공하므로 그 위에서 이 개념을 그대로 쓴다.

> 🔧 보충(책 외): 위 코드의 마지막 줄(`new MonsterKillHandler(new Wallet())`)은 컨테이너 없이 손으로 조립하는 Pure DI이고, C++ 서버의 `main()`에서 매니저들을 만들어 포인터를 넘기던 초기화 코드와 같은 모양이다. [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 `Program.cs`는 같은 자리(Composition Root)에서 `builder.Services.AddScoped<IWallet, Wallet>()`처럼 **등록만** 하고 실제 `new`는 컨테이너에 맡긴 버전이다. 손으로 조립할 때는 없던 것이 수명이며, 특히 Scoped(요청 단위)는 C++ 서버에 직접 대응하는 개념이 거의 없다.

### 2.3 Options 패턴 (설정·밸런스 값 분리)

**한 줄 요약:** 코드를 고치지 않고 바꿀 수 있도록 설정 값을 별도 객체로 분리한다.

> 📖 출처: Architecting ASP.NET Core Applications 9장 "Application Configuration and the Options Pattern" (텍스트 L13400-13418, 13440-13470, 13475-13540, 13549-13557)

**핵심 설명**
- Options 패턴의 목표는 실행 시점의 설정을 사용해 코드 수정 없이 동작을 바꾸는 것이다. 설정은 문자열 하나일 수도, 서브시스템 전체 설정 객체일 수도 있다.
- 설정을 여러 개의 작은 객체로 나눈다(SoC). 설정을 어디서 읽는지(json 파일, 환경 변수 등)는 조립 지점만 알고 소비 코드는 모른다.
- 값을 지정하지 않으면 기본값(int는 0)이 들어가므로, 프로퍼티 초기값(`= 20`)으로 안전한 기본값을 주는 방법이 있다(환경별로 달라지는 값이나 비밀 값에는 쓰지 말라는 주의도 있다).
- .NET의 옵션 인터페이스 종류(IOptions, IOptionsSnapshot, IOptionsMonitor 등)는 웹 수명 개념과 엮여 있다. 이 부에서는 이름만 알면 되고, 실제 수명(IOptions = Singleton, IOptionsSnapshot = Scoped, IOptionsMonitor = Singleton)과 쓰임새는 앞의 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)에서 봤다. 그중 IOptionsMonitor는 설정 변경 알림을 지원한다.

```csharp
public class BalanceOptions
{
    public double CritChance { get; set; } = 0.05;   // 안전한 기본값
    public long BaseGoldPerSec { get; set; } = 10;
    public double UpgradeCostGrowth { get; set; } = 1.15;
}

public class GoldCalculator
{
    private readonly BalanceOptions _opt;
    public GoldCalculator(BalanceOptions opt) => _opt = opt;
    public long PerSecond(int level) => _opt.BaseGoldPerSec * level;
}
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** 밸런스(성장 배율, 드랍률, 오프라인 보상 최대 시간)를 코드에 박아 두면 수정 때마다 다시 빌드·배포해야 한다. 설정 파일이나 DB의 값으로 빼고 위와 같은 설정 객체로 받아 서비스에 넣어 주면 조정이 쉬워진다.

> 🔧 보충(책 외): 위의 `IOptions` 등은 ASP.NET Core / Microsoft.Extensions 라이브러리 기능으로, 서버에서는 설정 파일의 값을 설정 객체에 바인딩해 DI로 주입하는 데 쓴다(앞의 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md) 참조). [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 `GameSettings` + `AddOptions<GameSettings>().Bind(...).ValidateOnStart()`가 바로 위 `BalanceOptions` 개념의 프레임워크 버전이다. 위 예제처럼 "설정 클래스를 만들어 밖에서 넣는다"는 개념이 핵심이다. JSON 파일에서 읽는 방법은 [제5부](05_제5부_NET_기본_라이브러리.md)(JSON 직렬화)를 참고.

---

## 코어 3. 고치지 않고 감싸고, 잇고, 뼈대를 물려준다 — 구조·행동 패턴

> 원래 4장 "구조·행동 패턴"(6·7항, 개요 수준). 모두 OCP(기존 코드를 고치지 않고 확장)를 서로 다른 모양으로 구현한다: **감싸기**(Decorator — 같은 인터페이스로 덧붙이기, Adapter — 모양 맞추기, Facade — 입구 단순화), **트리**(Composite), **뼈대 물려주기**(Template Method), **줄 세우기**(Chain of Responsibility).
>
> **앞에서 본 것 ↔ 원리:** [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 미들웨어 파이프라인은 책이 Chain of Responsibility의 **"파이프라인" 변형**이라 부르는 것이다(3.2). 각 미들웨어가 `await next(context)`로 다음 처리자에게 넘기고, `next`를 부르지 않는 단락은 "내가 처리했으니 여기서 끝"에 해당한다. 다음 처리자를 생성자로 받는 클래스 미들웨어(`ClientVersionMiddleware(RequestDelegate next)`)의 모양도 책이 권하는 Chain 구현(다음 처리자를 생성자 주입으로 받는 private 필드)과 같다.

### 3.1 Decorator, Facade, Composite, Adapter

**한 줄 요약:** 기존 클래스를 고치지 않고 밖에서 기능을 덧붙이거나, 모양을 맞추거나, 단순한 입구를 만든다.

> 📖 출처: Architecting ASP.NET Core Applications 11장 "Structural Patterns": Decorator (텍스트 L16476-16494, 16851-16875), Composite (L16879-16917), Adapter (L17410-17429), Facade (L17575-17603), 정리 (L18300-18324)

**핵심 설명**
- **Decorator**: 같은 인터페이스를 구현하면서 원본 객체를 하나 감싸(wrap) 기능을 덧붙인다. 원본 코드는 그대로다(OCP). 꾸민 객체를 또 꾸며도 된다(겹겹이). 인터페이스가 너무 크면 데코레이터 만들기가 어렵다는 것이 "냄새" 신호.
- **Composite**: 개별 요소(leaf)와 그룹(composite)이 같은 인터페이스를 가져서, 사용하는 쪽이 둘을 구분하지 않는다. 트리 구조를 자기 관리 노드로 만든다. 책의 서점 예제에서 공통 인터페이스 `IComponent`는 `Count`, `Type` 두 프로퍼티뿐이다. leaf인 `Book`은 `Count`가 1이고, 그룹 역할의 `BookComposite`는 자식들의 `Count` 합을 돌려주며 `Add`/`Remove`와 읽기 전용 `Children`을 가진다. `Store`, `Section`, `Set` 등이 이를 상속하고, 그룹 안에 그룹을 넣을 수 있다.
- **Adapter**: 이미 있는 클래스의 인터페이스가 우리가 원하는 것과 다를 때, 중간에 변환 클래스를 둔다. 수정할 수 없는 외부 코드에 유용. (여행용 전원 어댑터)
- **Facade**: 복잡한 여러 클래스(서브시스템)를 쓰기 쉬운 하나의 입구로 감싼다. Adapter는 "인터페이스 변환", Facade는 "사용법 단순화"라는 점이 다르다.

```csharp
// Decorator: 스킬에 "크리티컬 2배"를 덧붙임 (ISkill은 2.1의 것)
public class CriticalSkill : ISkill
{
    private readonly ISkill _inner;
    public CriticalSkill(ISkill inner) => _inner = inner;
    public long Damage(long atk) => _inner.Damage(atk) * 2;
}
// var skill = new CriticalSkill(new Fireball());

// Composite: 아이템 한 개도, 아이템 세트도 똑같이 "Power"를 묻는다
public interface IPowerSource { long Power { get; } }
public class Sword : IPowerSource { public long Power => 50; }
public class EquipSet : IPowerSource
{
    private readonly List<IPowerSource> _parts = new();
    public void Add(IPowerSource part) => _parts.Add(part);
    public long Power => _parts.Sum(p => p.Power);  // 하위 요소에 위임 (using System.Linq 필요)
}
// var set = new EquipSet(); set.Add(new Sword()); set.Add(new EquipSet());  // 세트 안에 세트도 가능

// Facade: 여러 서브시스템 호출을 한 메서드로
public class OfflineRewardFacade
{
    public long Claim(DateTime lastSeen) { /* 시간 계산 + 골드 계산 + 저장 */ return 0; }
}
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** 버프/장비 효과 겹치기는 Decorator, 장비 세트·스킬 트리는 Composite, 외부 결제 검증 서비스 같은 외부 API를 우리 인터페이스로 맞추는 것은 Adapter, "오프라인 보상 받기" 같은 복잡한 처리를 서비스 하나의 입구로 만드는 것은 Facade가 어울린다.

### 3.2 Template Method, Chain of Responsibility

**한 줄 요약:** Template Method는 "순서는 부모가, 세부는 자식이", Chain of Responsibility는 "처리할 수 있는 담당자에게 순서대로 넘기기".

> 📖 출처: Architecting ASP.NET Core Applications 12장 "Behavioral Patterns": Template Method (텍스트 L18396-18422, 18842-18871), Chain of Responsibility (L18877-18947)

**핵심 설명**
- **Template Method**: 알고리즘의 뼈대를 기반 클래스에 두고, 일부 단계는 자식 클래스가 구현(abstract)하거나 재정의(virtual)한다. 중복 로직이 줄고 확장이 쉽다. 상속을 쓰는 패턴이라 LSP를 깨지 않도록 주의(새 예외를 던지는 것 등).
- **Chain of Responsibility**: 처리자(handler)들이 줄을 서서, 각자 자기가 처리할 수 있으면 처리하고 아니면 다음 처리자에게 넘길지 스스로 정한다. 중앙 관리자가 없고 각 처리자가 독립적이라 테스트와 확장이 쉽다. 책은 다음 처리자를 `IHandler` 인터페이스에 두지 말고 생성자 주입으로 받는 private 필드로 두라고 한다. 큰 switch/if 덩어리(긴 메서드 냄새)를 나눌 때 도움이 된다. 자주 요청되는 처리자를 앞쪽에 두면 효율적이다. 체인 끝에는 예외를 던지거나 아무 일도 안 하는 종단 처리자를 둘 수 있다. 처리자가 자기 일을 한 뒤 넘기기도 하는 방식은 책이 "파이프라인"(ASP.NET Core 미들웨어)이라 부르는 변형이다. Decorator는 "책임을 덧붙이고", Chain은 "처리 능력을 여러 객체로 나눈다"는 차이가 있다(폰 케이스 vs 문제 해결 단계).

```csharp
// Template Method: 전투 한 턴의 뼈대
public abstract class Enemy
{
    public void TakeTurn()          // 뼈대(순서 고정)
    {
        PickTarget();
        DoAttack();                 // 세부는 자식이
        GiveReward();
    }
    protected virtual void PickTarget() { }
    protected abstract void DoAttack();
    protected virtual void GiveReward() { }
}

// Chain 방식의 피해 계산 파이프라인 (방어 → 실드 ...): 위 "파이프라인" 변형에 가깝다
public abstract class DamageHandler
{
    private readonly DamageHandler? _next;
    protected DamageHandler(DamageHandler? next) => _next = next;
    protected long Next(long dmg) => _next?.Handle(dmg) ?? dmg;   // 다음이 없으면 종단
    public abstract long Handle(long dmg);
}
public class DefenseHandler : DamageHandler
{
    public DefenseHandler(DamageHandler? next) : base(next) { }
    public override long Handle(long dmg) => Next(Math.Max(0, dmg - 5));
}
public class ShieldHandler : DamageHandler
{
    public ShieldHandler(DamageHandler? next) : base(next) { }
    public override long Handle(long dmg) => Next(dmg / 2);
}
// var chain = new DefenseHandler(new ShieldHandler(null));
// long result = chain.Handle(100);   // (100-5)/2 = 47
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** 보스/몬스터별 전투 정산 진행은 Template Method, 서버의 데미지 계산 단계(방어력 감소, 회피, 보호막)는 Chain으로 나누면 규칙을 하나씩 추가하기 쉽다.

> 🔧 보충(책 외): 위 `DamageHandler` 체인과 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 미들웨어를 나란히 놓으면 차이가 보인다. `DamageHandler`는 다음 처리자의 **반환값**만 받아 끝나는 단방향이지만, 미들웨어는 `await next(context)`가 돌아온 뒤에도 같은 미들웨어가 응답 쪽 코드를 실행하는 양방향이다. 그래서 미들웨어는 "Chain의 파이프라인 변형"이면서 동시에 바깥 층이 안쪽을 감싸는 Decorator(마트료시카)처럼도 보인다. C++ 서버의 패킷 필터 체인은 대개 앞의 단방향 쪽에 가깝다.

---

## 코어 4. 실패와 변화를 값과 신호로 — Operation Result와 이벤트

> 원래 5장 "결과 표현과 이벤트"(8·9항). 둘 다 "호출하는 쪽과 불리는 쪽을 덜 묶는" 도구다. Operation Result는 예상되는 실패를 예외가 아닌 **값**으로 돌려주고, 이벤트는 상태 변화를 받는 쪽을 모르는 채 **신호**로 방송한다.
>
> **앞에서 본 것 ↔ 원리:** [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)에서 "예상 가능한 실패(없는 영웅 → 404, 잘못된 입력 → 400)는 예외를 던지지 않고 정상적인 4xx 응답으로, 예상 밖 오류만 예외 처리 미들웨어(500 Problem Details)로" 나눴다. 서비스 계층에서 그 "예상 가능한 실패"를 표현하는 도구가 Operation Result(4.1)다. 서비스가 결과 객체를 돌려주면 엔드포인트가 이를 4xx/2xx로 매핑한다.

### 4.1 Operation Result 패턴 (실패를 예외 없이 표현)

**한 줄 요약:** 성공/실패와 이유를 담은 "결과 객체"를 돌려주어, 예상되는 실패를 예외 없이 다룬다.

> 📖 출처: Architecting ASP.NET Core Applications 13장 "The Operation Result pattern" (텍스트 L19740-19832), 정적 팩토리 변형 (L20440-20465)

**핵심 설명**
- 메서드가 성공 여부(필수), 결과 값, 실패 이유(메시지), 부가 정보(경고, 심각도)를 하나의 객체로 반환한다. 성공/실패 이분법이 아니라 "부분 성공" 같은 상태도 표현할 수 있다.
- 실패가 정상 흐름의 일부이거나(경고 등) 사용자에게 친절한 메시지를 보여줄 때 유용하다. 책은 결과 객체를 반환하는 메서드는 일반적으로 예외를 던지지 않는 것이 규칙이라고 한다. 디스크 꽉 참처럼 예외적 사건은 예외가 적절하다.
- 책은 추상 결과 클래스와 성공용/실패용 하위 클래스를 두고, 정적 팩토리 메서드(`Success`, `Failure`)로만 만들게 하는 변형을 보여 준다. 이렇게 하면 각 결과가 필요한 데이터만 갖고, 성공 여부 판단은 결과 클래스가 아니라 작업 메서드가 명시적으로 정한다. 책의 예는 하위 클래스를 private 중첩 클래스로 감췄다. 다만 책은 static 설계는 확장·테스트가 어려울 수 있으니 조심하라고 한다.

> 🔧 보충(책 외): [제4부](04_제4부_델리게이트_예외_현대C샤프.md)의 `TryXXX` 패턴과 비슷한 정신이라는 연결은 이 책의 정리이다.

```csharp
public abstract record UpgradeResult
{
    private UpgradeResult() { }
    public abstract bool Succeeded { get; }
    public static UpgradeResult Success(long level) => new SuccessfulUpgrade(level);
    public static UpgradeResult Failure(string reason) => new FailedUpgrade(reason);

    public sealed record SuccessfulUpgrade(long NewLevel) : UpgradeResult
    {
        public override bool Succeeded => true;
    }
    public sealed record FailedUpgrade(string Reason) : UpgradeResult
    {
        public override bool Succeeded => false;
    }
}

public UpgradeResult TryUpgrade(long gold, long cost, long level)
{
    if (gold < cost) return UpgradeResult.Failure("골드가 부족합니다");
    if (level >= 100) return UpgradeResult.Failure("최대 레벨입니다");
    return UpgradeResult.Success(level + 1);
}

// var r = TryUpgrade(gold, cost, level);
// if (r is UpgradeResult.FailedUpgrade f) message = f.Reason;   // 예외 없이 실패 이유를 꺼내 응답 메시지로
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** "골드 부족", "최대 레벨", "쿨타임 중" 같은 흔한 실패는 요청마다 나올 수 있으므로 예외보다 결과 객체가 자연스럽다. 강화·구매 서비스가 Operation Result를 돌려주면, API 계층에서 성공은 성공 응답으로, 실패는 이유를 담은 오류 응답으로 매핑하면 된다(API 응답 형태는 앞의 [제7부](07_제7부_웹_API_기초.md)·[제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 4xx·Problem Details 참조).

> 🔧 보충(책 외): C++ 서버에서 `enum ErrorCode`를 돌려주던 것과 같은 정신이다. C#판의 장점은 실패 **이유와 데이터**를 타입으로 함께 담고(`FailedUpgrade(string Reason)`), `r is UpgradeResult.FailedUpgrade f` 같은 패턴 매칭으로 꺼낸다는 점이다. C++23의 `std::expected<T, E>`와 비슷한 역할이다.

### 4.2 이벤트 기반 설계 = Observer 개념 연결

**한 줄 요약:** 값이 바뀌면 방송(broadcast)하고, 관심 있는 쪽만 구독해서 반응한다.

> 📖 출처: C# 12 in a Nutshell 4장 "Events" (텍스트 L12793-12830), "Standard Event Pattern" (텍스트 L12958-13011); 발행/구독 개념: Architecting ASP.NET Core Applications 19장 "Overview of the Publish-Subscribe pattern" (텍스트 L29023-29033). ("Observer"라는 용어 자체는 Architecting ASP.NET Core Applications에 등장하지 않음, 아래 보충 참고)

**핵심 설명**
- C# 12 in a Nutshell: 델리게이트를 쓰면 **broadcaster**(방송하는 쪽)와 **subscriber**(구독하는 쪽) 두 역할이 자연스럽게 생긴다. 방송자는 델리게이트를 호출해 알리고, 구독자는 `+=`/`-=`로 스스로 듣기 시작/중단한다. 구독자는 다른 구독자를 모르고 방해하지도 않는다.
- `event` 키워드는 이 패턴을 언어 차원에서 정리한 것이다. 밖에서는 `+=`, `-=`만 가능하고 직접 호출·덮어쓰기는 불가능하다(구독자끼리 간섭 방지).
- 표준 패턴: `EventArgs`를 상속해 전달 정보를 담는다(이름은 담는 정보에 맞춘다). 델리게이트는 반환 void, 인자 두 개(첫째는 보낸 이 object, 둘째는 EventArgs의 하위 클래스), 이름은 EventHandler로 끝나야 하며, 제네릭 `EventHandler<TEventArgs>`를 쓰면 된다.
- Architecting ASP.NET Core Applications의 Pub-Sub 설명도 같은 결: 발행자는 구독자를 모르고 메시지를 내보내기만 한다(fire and forget).
- 코어 1의 SoC(1.1)/DIP(1.2)와 연결된다: 지갑은 업적이나 저장 로직을 몰라도 되고, 그쪽이 지갑의 변화를 구독한다.

```csharp
public class GoldChangedEventArgs : EventArgs
{
    public long NewGold { get; }
    public GoldChangedEventArgs(long newGold) => NewGold = newGold;
}

public class Wallet
{
    public long Gold { get; private set; }
    public event EventHandler<GoldChangedEventArgs>? GoldChanged;   // 방송

    public void Add(long amount)
    {
        Gold += amount;
        GoldChanged?.Invoke(this, new GoldChangedEventArgs(Gold));  // 구독자가 없으면 무시
    }
}

// 구독하는 쪽(예: 업적 서비스)
long lastGold = 0;
var wallet = new Wallet();
wallet.GoldChanged += (s, e) => lastGold = e.NewGold;
// 구독이 더 필요 없어지면 wallet.GoldChanged -= ...  (해제를 잊으면 메모리 누수, 제3부 참고)
```

> 🔧 보충(책 외): **방치형 RPG 서버에서는** 골드/레벨/스테이지가 바뀔 때 업적, 로그, 저장 등이 각자 구독해서 반응하게 하면 서로 코드를 몰라도 된다. 다만 서버는 요청이 동시에 들어오므로, 프로세스 내부 이벤트는 요청 하나 안에서 끝나는 가벼운 알림에 쓰고, 오래 걸리는 후처리나 여러 서버에 걸친 알림은 별도 구조가 필요할 수 있다(웹 관련 부 [제7부](07_제7부_웹_API_기초.md)~[제13부](13_제13부_아키텍처_테스트_배포_기초.md) 참조, 백그라운드 처리는 [제12부](12_제12부_백그라운드_서비스_캐시_외부호출.md)).

> 🔧 보충(책 외): 이런 "변화를 구독해서 알리는 구조"를 GoF 디자인 패턴에서는 **Observer 패턴**이라 부른다. 위 C# 12 in a Nutshell·Architecting ASP.NET Core Applications 원문은 이 이름을 직접 쓰지 않고 broadcaster/subscriber, Pub-Sub이라는 표현을 쓴다. "이벤트 = Observer의 C# 내장 구현"이라는 연결은 이 책의 정리이다. 또 `GoldChanged` 예제와 구독 해제 시점(메모리 누수 연결)은 게임 맥락 설명으로 보충한 것이다.

> 🔧 보충(책 외): C++ 서버의 `std::vector<std::function<...>>` 콜백 리스트와 구조는 같지만 수명 위험의 방향이 반대다. C++에서는 구독자 객체를 파괴했는데 콜백이 남아 있으면 댕글링 호출이 위험했다. C#에서는 방송자의 이벤트가 구독자의 델리게이트(그리고 그 대상 객체)를 참조하고 있어서, 방송자가 오래 살면 해제(`-=`)를 잊은 구독자도 GC에 수거되지 못하고 계속 살아남는다. 특히 Singleton으로 등록된 서비스의 이벤트에 Scoped 객체가 구독하면 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 캡티브 의존성과 비슷한 문제가 된다.

---

## 실무 적용

### 체크리스트
- [ ] 서비스 클래스가 "바뀌는 이유" 하나만 갖는다(성장·지갑·저장소·응답 구성 분리). GameService 하나에 다 넣은 God class가 자라고 있지 않다. → 코어 1
- [ ] 비슷해 보이는 코드를 합치기 전에 "같은 이유로 바뀌는가"를 묻는다(DRY). 추상화는 이점이 늘어난 복잡도보다 클 때만, "나중에 필요할지도"는 만들지 않는다(KISS·YAGNI). → 코어 1
- [ ] 상위 로직은 구체 클래스가 아니라 인터페이스에 의존하고(DIP), 새 직업·스킬은 기존 전투 코드를 고치지 않고 새 전략 클래스를 추가하는 것으로 끝난다(OCP·Strategy). → 코어 1·2
- [ ] 클래스 안에서 바뀔 수 있는(volatile) 의존 대상을 `new` 하지 않는다(Control Freak). 생성자 주입으로 받고, 조립은 `Program.cs`(Composition Root) 한 곳에서만 한다. → 코어 2
- [ ] "하나만 필요한 것"을 고전 Singleton(`Instance`)으로 직접 만들지 않고 DI의 singleton 수명으로 등록한다. 상태가 있는 singleton은 스레드 안전하다. 수명 고려 순서는 singleton → scoped → transient(사용자별 데이터는 Scoped). → 코어 2
- [ ] 밸런스 수치는 코드에 박지 않고 작은 설정 객체로 나눠 밖에서 넣는다(Options). 안전한 기본값은 프로퍼티 초기값으로 주되, 환경별 값·비밀 값에는 쓰지 않는다. → 코어 2
- [ ] 효과 겹치기는 Decorator, 세트·트리는 Composite, 외부 API 모양 맞추기는 Adapter, 복잡한 처리의 단일 입구는 Facade로 고른다. 인터페이스가 너무 커서 Decorator 만들기가 어렵다면 인터페이스 분리(ISP) 신호다. → 코어 3
- [ ] 거대한 switch/if 계산 단계는 Chain으로 나누고, 다음 처리자는 생성자 주입 private 필드로 받는다. Template Method의 자식은 LSP를 깨지 않는다(새 예외 금지 등). → 코어 3
- [ ] "골드 부족·최대 레벨·쿨타임" 같은 예상되는 실패는 예외 대신 Operation Result로 돌려주고, API 계층에서 4xx로 매핑한다. 디스크 꽉 참 같은 예외적 사건만 예외. → 코어 4
- [ ] 서비스 간 알림은 표준 이벤트 패턴(`EventHandler<TEventArgs>`, `EventArgs` 상속)으로 하고, 구독은 필요 없어지면 `-=`로 해제한다. 오래 걸리는 후처리·여러 서버에 걸친 알림은 프로세스 내부 이벤트로 하지 않는다. → 코어 4

### 시나리오로 확인하기
1. **상황:** 전투 계산 서비스에 `switch (skillType)`이 200줄이다. 새 스킬 "번개"를 추가하다 `case` 하나를 잘못 건드려 기존 "파이어볼" 대미지가 바뀌었다. 팀원은 "비슷한 case끼리 공통 함수로 합치자(DRY)"고 한다. (C++ 서버에서 opcode `switch` 디스패처가 비대해지던 것과 같은 모양이다.)
   **질문:** 어떤 원칙·패턴으로 고쳐야 하고, 팀원의 DRY 제안에서 조심할 점은?

   <details markdown="1"><summary>답 확인</summary>

   거대한 switch는 긴 메서드 냄새이고, 새 스킬마다 기존 코드를 고쳐야 하므로 OCP 위반이다. `ISkill` 인터페이스(Strategy)로 스킬마다 클래스를 나누면 새 스킬은 클래스 추가로 끝나고 `Hero`/전투 코드는 그대로다. 대미지 계산이 여러 단계(방어력 감소, 회피, 보호막)라면 Chain으로 나눈다. DRY는 "코드가 비슷하다"가 아니라 "같은 이유로 바뀌는가"로 판단한다. 두 스킬 공식이 비슷해 보여도 밸런스 조정 이유가 다르면 합치지 않는 편이 낫다. → 코어 1 (1.1, 1.2), 코어 2 (2.1), 코어 3 (3.2)

   </details>

2. **상황:** 오프라인 보상 서비스가 `GameConfigHolder.Instance.MaxHours`와 `DateTime.UtcNow`를 직접 부른다. 단위 테스트에서 "13시간 뒤 접속하면 8시간치만 지급"을 확인하고 싶은데 시간과 설정을 바꿀 방법이 없다. (C++ 서버에서 `ConfigManager::Instance()`를 어디서나 부르던 습관이다.)
   **질문:** 문제의 원리와 고치는 방법은?

   <details markdown="1"><summary>답 확인</summary>

   고전 Singleton과 전역 상태(Ambient Context)는 강한 결합·교체 곤란·테스트 곤란을 부른다(책: C#에서 Singleton은 안티패턴, SRP·OCP 위반). 의존 대상(설정, 시계)을 생성자 주입으로 받고(Control Freak 제거, DIP), `Program.cs`(Composition Root)에서 DI의 singleton 수명으로 등록한다. 설정은 Options 패턴의 설정 객체로 받는다. 테스트에서는 가짜 설정·가짜 시간을 생성자로 넣으면 된다. → 코어 2 (2.1, 2.2, 2.3)

   > 🔧 보충(책 외): 시계 추상화로는 .NET 8의 `TimeProvider`를 주입하고 테스트에서 `FakeTimeProvider`를 쓰는 방법이 있다([제5부](05_제5부_NET_기본_라이브러리.md)).

   </details>

3. **상황:** 강화 API에서 "골드 부족"일 때 `throw new InvalidOperationException("골드 부족")`을 던진다. 이벤트 기간에 로그가 Error로 도배되고, 예외 처리 미들웨어 때문에 클라이언트는 매번 500 "서버 내부 오류" 팝업을 띄운다.
   **질문:** 무엇이 잘못됐고, 서비스와 API 계층을 어떻게 나눠야 하나?

   <details markdown="1"><summary>답 확인</summary>

   "골드 부족"은 요청마다 나올 수 있는 예상되는 실패다. 서비스는 Operation Result(`UpgradeResult.Failure("골드가 부족합니다")`)를 돌려주고, 결과 객체를 반환하는 메서드는 일반적으로 예외를 던지지 않는다. API 계층(엔드포인트)은 성공은 성공 응답으로, 실패는 이유를 담은 4xx 오류 응답으로 매핑한다. 예외와 `UseExceptionHandler`의 500 Problem Details는 DB 장애·디스크 꽉 참 같은 예상 밖·예외적 사건에만 남긴다. → 코어 4 (4.1), [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 예외 처리

   </details>

4. **상황:** 골드가 바뀔 때마다 지갑 서비스가 업적 서비스·로그 서비스·저장 서비스를 직접 호출한다. 업적 규칙을 하나 바꿨는데 지갑 코드까지 수정·재배포해야 했다. 누군가 이벤트로 바꾸자 했고, 바꾼 뒤에는 메모리 사용량이 서서히 늘어난다.
   **질문:** 이벤트로 바꾸는 이유와, 메모리가 느는 원인 후보는?

   <details markdown="1"><summary>답 확인</summary>

   지갑이 업적·로그·저장을 직접 알면 바뀌는 이유가 섞인다(SoC 위반). 지갑은 `GoldChanged` 이벤트를 방송(broadcaster)만 하고, 업적·로그·저장이 각자 구독(subscriber)하면 서로의 코드를 몰라도 된다. 메모리 증가는 구독 해제(`-=`)를 잊은 것이 첫 후보다. 방송자가 구독자의 델리게이트를 참조하므로, 방송자가 오래 살면(예: singleton) 해제되지 않은 구독자도 수거되지 못한다. 프로세스 내부 이벤트는 요청 하나 안에서 끝나는 가벼운 알림에만 쓰고, 오래 걸리는 후처리는 별도 구조로 뺀다. → 코어 4 (4.2), 메모리 누수는 [제3부](03_제3부_메모리와_성능_기초.md)

   </details>

5. **상황:** C++ 서버 출신 동료가 [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 `Program.cs`를 보고 "`builder.Services.Add...`랑 `app.Use...`가 수십 줄인데, 그냥 `main()`에서 `new` 하고 함수 포인터 체인 만들면 되지 않나?"라고 묻는다.
   **질문:** 이 두 묶음은 각각 어떤 설계 원리·패턴이며, 손으로 하는 것과 무엇이 다른가?

   <details markdown="1"><summary>답 확인</summary>

   `builder.Services.Add...` 묶음은 Composition Root다. 손으로 조립하는 Pure DI(`new MonsterKillHandler(new Wallet())`)와 같은 자리지만, 등록만 하고 실제 생성은 컨테이너가 생성자 매개변수를 보고 해 주며, 수명(Transient/Scoped/Singleton)을 관리한다. Scoped(요청 단위)는 손 조립에는 없던 개념이다. `app.Use...` 묶음은 Chain of Responsibility의 "파이프라인" 변형(미들웨어)이며, 다음 처리자를 생성자로 받는 구조도 책이 권하는 Chain 구현과 같다. 둘 다 "구현이 아니라 인터페이스에 맞춰 프로그래밍"하고 조립을 한 곳에 모으기 위한 것이다. → 코어 2 (2.2), 코어 3 (3.2)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
설계 원칙과 패턴 — 결정적 원리 2개: ( ? )로 나눈다 / ( ? )에 의존한다 (브레이크: ( ? )·( ? ))
├─ 코어 1 원칙
│   ├─ 1.1 안티패턴 예 ( ? ) / 코드 냄새 예 ____, ____, ____
│   │      SoC / DRY(기준: ( ? )) / KISS / YAGNI
│   └─ 1.2 SOLID: S=____ O=____ L=____ I=____ D=____
├─ 코어 2 DI·Options의 뿌리   (앞에서 본 것: AddScoped<IHeroService, HeroService> / AddSingleton / AddOptions)
│   ├─ 2.1 Strategy(Context·IStrategy·구체 전략, DI의 ( ? ))
│   │      Abstract Factory(( ? ) 생성, 큰 인터페이스는 ( ? )·( ? ) 위반, "( ? ) 조립 문제")
│   │      Singleton(구성 3요소 ____ / 스레드 안전한 방법 ( ? ) / 결론: ( ? ))
│   ├─ 2.2 DI는 목적? 수단? ( ? ) / 콘센트 비유 / 생성자 주입 / Composition Root / Pure DI
│   │      수명 3종 ____ / 고려 순서 ( ? ) → ( ? ) → ( ? )
│   └─ 2.3 Options: 목표 ( ? ) / 작은 객체로 분리 / 기본값 주의 / IOptionsMonitor = ( ? )
├─ 코어 3 구조·행동 패턴   (앞에서 본 것: 미들웨어 = ( ? )의 ( ? ) 변형)
│   ├─ 3.1 Decorator / Composite / Adapter / Facade (Adapter vs Facade 차이 ( ? ))
│   └─ 3.2 Template Method(주의 ( ? )) / Chain(다음 처리자는 ( ? )로) / 파이프라인 변형
└─ 코어 4 결과와 이벤트   (앞에서 본 것: 예상 가능한 실패 = ( ? ) 응답)
    ├─ 4.1 Operation Result: 담는 것 ____ / 규칙 ( ? ) / 정적 팩토리 Success·Failure
    └─ 4.2 이벤트: broadcaster·subscriber / event 키워드의 제한 ( ? ) / 표준 패턴 규칙 ____
```

### 2. 인출 질문

1. 안티패턴과 코드 냄새의 차이는? 각각의 대표 예를 드세요.

   <details markdown="1"><summary>답 확인</summary>

   안티패턴은 좋아 보여서 쓰지만 결국 해가 되는 검증된 나쁜 방식(예: God class)이다. 코드 냄새는 문제가 "있을 수 있다"는 신호일 뿐 반드시 문제는 아니다(예: 설명 주석이 많이 필요한 메서드, 10~15줄을 훌쩍 넘는 긴 메서드, 내부에서 `new` 로 의존 대상을 만드는 Control Freak). → 코어 1 (1.1)

   </details>

2. DRY를 적용할 때 책이 경고하는 판단 기준은?

   <details markdown="1"><summary>답 확인</summary>

   "코드가 비슷하다"가 아니라 "같은 이유로 바뀌는가(관심사)"를 기준으로 모은다. 비슷해 보여도 바뀌는 이유가 다르면 따로 두는 게 낫다. → 코어 1 (1.1)

   </details>

3. KISS와 YAGNI는 각각 무엇을 말하나요?

   <details markdown="1"><summary>답 확인</summary>

   KISS: 부품이 많을수록 고장 나므로 인터페이스·계층은 이점이 늘어난 복잡도보다 클 때만 추가한다. YAGNI: 지금 필요 없는 기능을 "나중에 필요할지도"로 미리 만들지 않는다. → 코어 1 (1.1)

   </details>

4. SOLID 다섯 원칙을 한 줄씩 설명하세요.

   <details markdown="1"><summary>답 확인</summary>

   S 단일 책임: 바뀌는 이유는 하나. O 개방/폐쇄: 확장에 열리고 수정에 닫힘(상속보다 조합). L 리스코프 치환: 부모 자리에 자식을 넣어도 깨지지 않아야 함(Penguin과 Fly). I 인터페이스 분리: 작은 인터페이스 여럿이 범용 하나보다 낫다. D 의존성 역전: 구체가 아니라 추상(인터페이스)에 의존. 규칙이 아니라 지침이다. → 코어 1 (1.2)

   </details>

5. Strategy 패턴의 구성 요소와, 이것이 OCP·DI와 연결되는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   Context, `IStrategy` 인터페이스, 여러 구체 전략. Context는 어떤 전략이 들어왔는지 모르므로 코드 수정 없이 동작이 바뀌고(OCP) 상속 대신 조합을 쓰게 된다. 책은 이것이 DI의 뼈대라고 한다. → 코어 2 (2.1)

   </details>

6. Abstract Factory에서 `CreateHighEndBike()` 같은 구체 메서드를 모두 담은 큰 인터페이스를 쓰면 어떤 문제가 생기나요?

   <details markdown="1"><summary>답 확인</summary>

   소비자가 특정 메서드에 묶여 동작을 바꾸려면 코드를 고쳐야 하고(OCP 위반), 중급 모델을 추가할 때 인터페이스 자체가 바뀌어 구현체를 모두 수정해야 한다(ISP 위반 포함). 작은 `IVehicleFactory` 를 쓰면 `MidRangeVehicleFactory` 를 추가해도 소비자는 그대로다. → 코어 2 (2.1)

   </details>

7. 고전적 Singleton(`_instance ??= new ...`)의 문제와 책이 권하는 대안 두 가지는?

   <details markdown="1"><summary>답 확인</summary>

   `??=` 방식은 스레드 안전하지 않다. 구현이 필요하면 정적 프로퍼티 초기화(`{ get; } = new();`, `=>` 로 쓰면 매번 새 인스턴스이니 주의)로 언어에 맡긴다. 그러나 책의 결론은 C#에서 Singleton은 안티패턴(SRP·OCP 위반, 테스트 곤란, 전역 상태 문제)이므로 DI의 singleton 수명을 쓰라는 것이다. → 코어 2 (2.1)

   </details>

8. DI는 목적인가 수단인가? 콘센트 비유로 설명하세요.

   <details markdown="1"><summary>답 확인</summary>

   수단이다. DI는 느슨한 결합을 가능하게 하고, 느슨한 결합이 유지보수를 쉽게 한다("구현이 아니라 인터페이스에 맞춰 프로그래밍하라"). 헤어드라이어를 벽에 직결하면(강한 결합) 고장 때 뜯어내야 하지만, 콘센트(인터페이스)와 플러그(구현)를 쓰면 바꿔 꽂을 수 있다. → 코어 2 (2.2)

   </details>

9. `new` 는 항상 나쁜가요? 가장 권장되는 주입 방식은?

   <details markdown="1"><summary>답 확인</summary>

   본질적으로 틀린 것은 아니며, 바뀔 수 있는(volatile) 의존성에 특히 문제이고 안정적인(stable) 의존성은 사용을 최소화하면 된다. 가장 권장되는 방식은 생성자 주입이며, `new` 는 Composition Root 한 곳에서 조립할 때 쓴다. → 코어 2 (2.2)

   </details>

10. DI 수명 세 가지와 책이 권하는 고려 순서, 그리고 그 이유는?

    <details markdown="1"><summary>답 확인</summary>

    Transient(요청할 때마다 새로), Scoped(웹 요청당 하나), Singleton(앱 전체에서 하나). 가능하면 singleton → scoped → transient 순으로 고려한다. 재사용이 많을수록 메모리·GC 부담이 줄기 때문이다. 단, 공유되는 상태 있는 singleton은 스레드 안전해야 한다. → 코어 2 (2.2)

    </details>

11. Options 패턴의 목표와, 기본값 처리 시 주의점은?

    <details markdown="1"><summary>답 확인</summary>

    실행 시점 설정으로 코드 수정 없이 동작을 바꾸는 것. 설정은 작은 객체 여러 개로 나누고, 어디서 읽는지는 조립 지점만 안다. 값을 안 주면 기본값(int는 0)이 들어가므로 프로퍼티 초기값으로 안전한 기본값을 줄 수 있지만, 환경별로 달라지는 값이나 비밀 값에는 쓰지 않는다. 변경 알림은 `IOptionsMonitor`. → 코어 2 (2.3)

    </details>

12. Decorator와 Composite는 각각 무엇을 하며, Decorator가 만들기 어려워지는 신호는?

    <details markdown="1"><summary>답 확인</summary>

    Decorator는 같은 인터페이스를 구현하며 원본을 감싸 기능을 덧붙인다(겹겹이 가능, OCP). 인터페이스가 너무 크면 만들기 어렵다는 것이 냄새 신호다. Composite는 leaf와 그룹이 같은 인터페이스를 가져 사용하는 쪽이 둘을 구분하지 않게 하며, 그룹 안에 그룹을 넣는 트리를 만든다. → 코어 3 (3.1)

    </details>

13. Adapter와 Facade의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    Adapter는 이미 있는 클래스(특히 수정할 수 없는 외부 코드)의 인터페이스를 원하는 모양으로 변환한다(여행용 전원 어댑터). Facade는 복잡한 여러 클래스(서브시스템)를 쓰기 쉬운 하나의 입구로 감싸 사용법을 단순화한다. → 코어 3 (3.1)

    </details>

14. Template Method의 구조와 주의할 점은?

    <details markdown="1"><summary>답 확인</summary>

    알고리즘 뼈대(순서)를 기반 클래스에 두고, 일부 단계를 자식이 구현(abstract)하거나 재정의(virtual)한다. 중복이 줄고 확장이 쉽다. 상속을 쓰므로 새 예외를 던지는 등 LSP를 깨지 않도록 주의한다. → 코어 3 (3.2)

    </details>

15. Chain of Responsibility에서 다음 처리자를 어떻게 두라고 하나요? Decorator와의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    다음 처리자를 `IHandler` 인터페이스에 두지 말고 생성자 주입으로 받는 private 필드로 둔다. 자주 요청되는 처리자를 앞에 두고, 끝에는 예외를 던지거나 아무것도 안 하는 종단 처리자를 둘 수 있다. Decorator는 책임을 덧붙이고, Chain은 처리 능력을 여러 객체로 나눈다(폰 케이스 vs 문제 해결 단계). 처리 후 넘기는 변형이 파이프라인(미들웨어)이다. → 코어 3 (3.2)

    </details>

16. Operation Result 패턴은 무엇을 담으며, 언제 예외 대신 쓰나요?

    <details markdown="1"><summary>답 확인</summary>

    성공 여부(필수), 결과 값, 실패 이유, 부가 정보(경고, 심각도)를 하나의 객체로 반환하며 부분 성공도 표현한다. 실패가 정상 흐름의 일부이거나 친절한 메시지가 필요할 때 쓰고, 결과 객체를 반환하는 메서드는 일반적으로 예외를 던지지 않는다. 디스크 꽉 참 같은 예외적 사건은 예외가 적절하다. → 코어 4 (4.1)

    </details>

17. 책이 보여 준 Operation Result의 정적 팩토리 변형의 장점과 주의점은?

    <details markdown="1"><summary>답 확인</summary>

    추상 결과 클래스와 성공/실패 하위 클래스(private 중첩으로 숨김)를 두고 `Success`, `Failure` 로만 만들게 해, 각 결과가 필요한 데이터만 갖고 성공 여부는 작업 메서드가 명시적으로 정한다. 단 static 설계는 확장·테스트가 어려울 수 있으니 조심한다. → 코어 4 (4.1)

    </details>

18. C# `event` 키워드가 일반 델리게이트 필드보다 나은 점과, 표준 이벤트 패턴의 규칙은?

    <details markdown="1"><summary>답 확인</summary>

    밖에서는 `+=`, `-=` 만 가능하고 직접 호출·덮어쓰기가 불가능해 구독자끼리 간섭을 막는다. 표준 패턴: `EventArgs` 를 상속해 정보를 담고, 델리게이트는 반환 void·인자 두 개(보낸 이 object, EventArgs 하위 클래스)·이름은 EventHandler로 끝나며, 제네릭 `EventHandler<TEventArgs>` 를 쓴다. → 코어 4 (4.2)

    </details>

19. [제8부](08_제8부_ASP_NET_Core_핵심_동작.md)에서 쓴 `AddScoped<IHeroService, HeroService>()`·`AddSingleton<GoldLedger>()`·`UseMiddleware<T>()`·`AddOptions<T>().Bind(...)`는 각각 이 부의 어떤 원리·패턴에 해당하나요?

    <details markdown="1"><summary>답 확인</summary>

    `IHeroService`로 받는 것은 DIP와 Strategy(DI의 뼈대), 등록부 전체(`Program.cs`)는 Composition Root, `AddSingleton`은 고전 Singleton 패턴 대신 쓰는 DI의 singleton 수명, `UseMiddleware<T>()`로 쌓는 미들웨어는 Chain of Responsibility의 파이프라인 변형, `AddOptions<T>().Bind(...)`는 Options 패턴의 프레임워크 구현이다. → 코어 2 (2.1~2.3), 코어 3 (3.2)

    </details>

20. C++ 서버의 매니저 싱글턴(`static T& Instance()`)과 DI의 singleton 수명은 무엇이 같고 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    인스턴스가 하나이고 계속 재사용된다는 점은 같다(함수 로컬 static은 C++11부터 초기화가 스레드 안전, C#은 정적 프로퍼티 초기화). 다른 점: 책이 문제 삼는 것은 초기화가 아니라 누구나 `Instance`로 전역에서 꺼내 쓰는 구조(SRP·OCP 위반, 테스트 곤란, 전역 상태)다. DI의 singleton 수명은 "하나만"을 컨테이너가 보장하고, 쓰는 쪽은 인터페이스로 생성자에서 받으므로 테스트에서 바꿔 끼울 수 있다. 상태가 있으면 스레드 안전해야 하는 것은 둘 다 같다. → 코어 2 (2.1, 2.2)

    </details>

### 3. 기억 고리

- **C++ 유추:** DI 컨테이너 ≈ 서버 시작 시 매니저 싱글턴들을 조립하던 `main()` 코드(= Composition Root). ⚠️ 깨지는 곳: 등록만 하고 생성은 컨테이너가 하며, 수명이 셋이고 그중 Scoped는 요청 단위라 C++ 서버에 직접 대응하는 개념이 거의 없다.
- **C++ 유추:** 미들웨어 파이프라인 ≈ 패킷 처리 필터 체인 = Chain of Responsibility의 파이프라인 변형. ⚠️ 깨지는 곳: 고전 Chain은 "처리할 수 있는 하나가 처리하면 끝", 미들웨어는 모두가 일하고 넘기며 응답이 역순으로 돌아오는 양방향이다.
- **C++ 유추:** 옵션 패턴 ≈ 설정 파일 로더가 채운 `Config` 구조체를 넘겨 주기. ⚠️ 깨지는 곳: 설정은 작은 객체 여러 개로 나누고(SoC), 어디서 읽는지는 조립 지점만 안다. 프레임워크 버전은 여러 출처를 겹치고 시작 시 검증한다.
- **C++ 유추:** Operation Result ≈ `enum ErrorCode` / `std::expected`, 이벤트 ≈ `std::function` 콜백 리스트. ⚠️ 깨지는 곳: 이벤트 해제를 잊으면 C++처럼 댕글링이 아니라 반대로 구독자가 수거되지 않는 메모리 누수가 된다.
- **비유:** DI = 콘센트와 플러그. 벽에 직결한 헤어드라이어는 뜯어내야 바꾸지만, 콘센트(인터페이스)에 꽂으면 플러그(구현)만 바꾼다. ⚠️ 비유가 깨지는 지점: 실제 DI에는 "언제 새로 만들고 언제 공유하는지"라는 수명(Transient/Scoped/Singleton) 개념이 있고, 공유 singleton은 스레드 안전까지 신경 써야 한다.
- **비유:** Decorator = 폰 케이스(같은 폰인데 기능이 덧붙음), Chain = 문제 해결 단계(처리할 수 있는 담당자에게 넘김). ⚠️ 깨지는 지점: Chain의 "파이프라인" 변형에서는 각 처리자가 자기 일을 하고도 다음으로 넘기므로 Decorator와 비슷해 보인다.
- **묶음(3의 법칙):** 생성·교체 패턴 3 = Strategy · Abstract Factory · Singleton. 행동/구조의 "감싸기" 3 = Decorator(덧붙이기) · Adapter(변환) · Facade(단순화). 결과·알림·설정 3 = Operation Result · 이벤트 · Options.
- **대칭·순서:** Adapter(인터페이스 변환) ↔ Facade(사용법 단순화), Decorator(책임 추가) ↔ Chain(처리 능력 분할), 예외(예외적 사건) ↔ Operation Result(예상되는 실패). 수명 고려 순서: singleton → scoped → transient.
- **결정적 지식 두 개:** ① "구현이 아니라 인터페이스에 맞춰 프로그래밍하라(DIP)" — Strategy, Abstract Factory, Decorator, Chain, DI, 테스트 교체 가능성이 모두 이 원리 하나로 설명된다. ② "바뀌는 이유 단위로 나눈다(SoC/SRP)" — DRY의 판단 기준, God class 해체, Singleton의 SRP 위반, Options의 작은 객체 분리, 이벤트로 지갑과 업적 분리가 이 원리로 설명된다.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "새 스킬을 추가할 때 전투 코드를 고치지 않으려면 어떻게 설계하는가(OCP·Strategy·DI)"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "왜 ASP.NET Core에서는 `ConfigManager::Instance()` 같은 싱글턴을 안 쓰고 `Program.cs`에 등록만 하는지, 그리고 `app.Use...` 미들웨어가 우리 패킷 필터 체인과 어떤 패턴으로 이어지는지"를 3분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "처음부터 인터페이스와 계층으로 확장성을 확보해야 한다(SOLID·OCP)" vs B "지금 필요 없는 추상화는 만들지 않는다(KISS·YAGNI)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 DI와 수명, 그리고 Singleton 패턴이 안티패턴인 이유를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제10부. 데이터 접근 (EF Core)

> **🎮 게임 서버 개발자에게** — C++ 게임 서버에서 DB 스레드가 저장 프로시저를 호출하거나 직접 쓴 SQL을 실행하고, 유저 데이터는 메모리에 캐시해 두었다가 주기적으로 DB에 flush하던 일을 이 부에서는 EF Core가 맡는다. SQL은 LINQ에서 **생성**되고, "무엇이 바뀌었나(dirty 플래그)"는 `DbContext`가 **스냅샷과 비교해 자동 추적**하며, flush는 `SaveChanges` 한 번(= 한 트랜잭션, Unit of Work)이 된다. 결정적으로 다른 점은 수명이다. 웹 서버에는 세션 동안 살아 있는 유저 객체가 없다. `DbContext`는 HTTP 요청 하나 동안만 살고, 요청마다 DB에서 다시 읽어 고친 뒤 응답 전에 저장하고 버려진다. 그래서 "한 유저의 데이터는 한 세션 스레드만 고친다"는 전제가 사라지고, 같은 플레이어의 요청이 동시에·반복해서 들어오는 문제를 DB 수준(동시성 토큰, 트랜잭션, 유니크 제약)에서 막아야 한다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 보상 API가 응답 유실 뒤 재시도로 두 번 호출되어 골드가 두 번 지급됐다는 CS가 들어온다 (멱등성 키 + 유니크 제약).
> - 같은 계정을 폰과 태블릿에서 동시에 쓰는 유저의 골드가 복사되거나, "골드는 빠졌는데 아이템은 안 들어왔다"는 문의가 온다 (동시성 토큰, `SaveChanges` 한 번 / 트랜잭션).
> - 랭킹·영웅 목록 API가 데이터가 늘수록 느려지고 메모리를 많이 먹는다, 또는 점검 배포 때 새 컬럼이 없어 서버가 500을 낸다 (`IQueryable`·`AsNoTracking`·페이징, 마이그레이션).

## 코어 — 이것만은 100%

> **한 문장:** EF Core는 C# 클래스·관계를 테이블로 매핑하고(모델), `IQueryable`로 쌓은 쿼리를 실행 시점에 SQL로 내보내며(조회), `DbContext`가 엔티티 상태를 추적하다가 `SaveChanges` 한 번(= 한 트랜잭션, Unit of Work)으로 INSERT/UPDATE/DELETE를 만들어 내는 창구이고(쓰기), 웹에서는 요청당 하나(Scoped·async)로 쓰고 스키마는 마이그레이션으로 코드와 맞추며(수명·운영), 재화 이중 처리는 동시성 토큰(동시 수정)·트랜잭션(부분 반영)·멱등성 키+유니크 제약(반복 요청)으로 각각 막는다(방어).

1. **모델 — 테이블은 클래스, 창구는 `DbContext`** — 테이블 = 클래스, 열 = 속성, 행 = 객체. 규칙으로 자동 매핑하고 필요한 부분만 어노테이션·Fluent API로 덮어쓴다(충돌 시 Fluent API 승). 관계는 탐색 속성 + 외래 키로 표현하고(1:N, 1:1은 종속 쪽 명시, N:M은 연결 테이블 자동), 삭제 동작(Cascade/ClientSetNull/Restrict)을 정한다.
2. **조회 — `IQueryable`은 실행 메서드에서 SQL이 된다** — `DbSet` → LINQ 연산 → 실행 메서드(`ToListAsync`, `First`, `Count`, `foreach`)에서 SQL이 나간다. 필터·정렬·페이징은 실행 전에 두고, 관련 데이터는 기본으로 안 불러오며(Eager/Explicit/Select/Lazy), 읽기만 할 때는 `AsNoTracking`, 대량 변경은 `ExecuteUpdate`.
3. **쓰기 — 변경 추적과 `SaveChanges` 한 번(Unit of Work)** — 엔티티 상태(Added/Unchanged/Modified/Deleted/Detached)를 보고 `SaveChanges`가 SQL을 만든다. `SaveChanges` 한 번은 "전부 성공 아니면 전부 취소"이므로 로직은 저장을 모르게 두고 끝에서 한 번만 부르며, 여러 번 저장을 묶을 때만 명시적 트랜잭션을 쓴다. 재화·레벨 값은 클라이언트 값을 믿지 않고 ID만 받아 서버가 다시 조회해 계산한다.
4. **수명과 운영 — 요청당 `DbContext` 하나, 스키마는 마이그레이션** — `AddDbContext`는 Scoped(요청당 1개, 요청 끝에 Dispose). `DbContext`는 스레드에 안전하지 않고, 백그라운드에서는 `IServiceScopeFactory`로 스코프를 직접 만든다. 웹에서는 항상 async. 스키마 변경은 `migrations add`(파일만) → 검토 → `database update`로 코드와 함께 버전 관리한다.
5. **방어 — 동시 수정은 동시성 토큰, 반복 요청은 멱등성 키 + 유니크 제약** — 동시성 토큰은 "동시에 고친 것"(0행 갱신 → `DbUpdateConcurrencyException` → 409)을, 멱등성 키 + 유니크 제약은 "시간 차를 두고 다시 온 같은 요청"을 막는다. 둘은 서로를 대체하지 못하고, 트랜잭션도 이 둘을 대신하지 못한다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 저장 프로시저 호출, 직접 쓴 SQL 문자열 + 결과셋을 구조체에 복사하는 코드 | EF Core 엔티티 매핑 + LINQ 쿼리 (코어 1·2) | 결국 DB에서 SQL이 실행되고, 결과 행이 메모리 객체가 된다 | SQL을 사람이 쓰지 않고 EF Core가 **생성**한다. C#에서는 되지만 SQL로 번역되지 않는 코드(사용자 정의 메서드를 `Where`에 쓰기 등)가 생기고, `AsEnumerable()` 한 줄로 테이블 전체를 메모리로 읽을 수도 있으므로 나가는 SQL을 로그로 확인해야 한다. 복잡한 보고서 쿼리는 여전히 직접 SQL이 나을 때가 있다 |
| 메모리에 캐시한 유저 객체의 dirty 플래그 (바뀐 필드만 골라 UPDATE) | 변경 추적: `DetectChanges`가 읽은 시점 스냅샷과 비교 (코어 3) | 바뀐 열만 UPDATE한다 | 플래그를 직접 세우지 않고 스냅샷 비교로 자동 판단한다. 추적은 `DbContext`가 살아 있는 요청 하나 동안만 유효하고, `AsNoTracking`으로 읽은 객체나 `ExecuteUpdate`로 바꾼 행은 추적 밖이다. 세션 내내 살아 있는 캐시 객체가 아니다 |
| 주기적 DB flush (모아 둔 변경을 한 트랜잭션으로 저장) | `SaveChanges` 한 번 = Unit of Work (코어 3) | 여러 변경을 모아 한 번에, 하나라도 거부되면 전부 취소되는 단위로 저장한다 | 타이머로 몇 초마다 flush하는 것이 아니라 **요청이 끝나기 전(응답 전)** 에 저장한다. 그래서 "서버가 죽으면 마지막 flush 이후 진행이 날아간다"는 구조가 아니라, 응답을 받은 변경은 이미 DB에 있다 |
| DB 전용 스레드(커넥션을 한 스레드가 독점하고 작업 큐로 요청을 받음) | 요청당 `DbContext` 하나(Scoped) + async (코어 4) | 한 DB 작업 문맥을 여러 스레드가 동시에 쓰지 않는다 | 전용 DB 스레드가 없다. 요청을 처리하는 스레드가 직접 `await`로 DB를 호출하고, 기다리는 동안 스레드를 반납한다. `DbContext`는 요청마다 새로 만들고 버리며, 하나를 여러 Task가 동시에 쓰면 예외다 |
| 세션 단일 소유: 한 유저의 데이터는 그 세션(또는 그 유저를 맡은 로직 스레드)만 고치므로 경쟁이 없다 | 낙관적 동시성 토큰 (`RowVersion`) (코어 5) | "같은 데이터를 두 곳에서 동시에 고치면 안 된다"는 문제의식 | HTTP에는 소유자가 없다. 같은 플레이어의 요청이 여러 기기·재시도로 동시에 들어와 서로 다른 스레드(또는 서버)에서 처리된다. 잠그는 대신 `UPDATE ... WHERE RowVersion = @원래값`이 0행이면 충돌로 판정한다 |
| 패킷 시퀀스 번호·요청 ID로 중복 패킷 무시 | 멱등성 키 + `(PlayerId, RequestId)` 유니크 제약 (코어 5) | 요청마다 고유 번호를 붙여 이미 처리한 것은 다시 처리하지 않는다 | 처리 기록을 서버 메모리가 아니라 **DB에 지급과 같은 트랜잭션으로** 남겨야 한다(다음 요청은 다른 서버·다른 `DbContext`가 받는다). 키는 클라이언트가 만들고 재시도 때 **같은 키**를 다시 보내야 하며, 동시에 온 같은 키는 유니크 제약이 최종적으로 거부한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·그림·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. `db.Heroes.Where(...)`와 `db.Heroes.AsEnumerable().Where(...)`는 DB로 나가는 SQL이 어떻게 다를까?
> 2. 웹 서버에서 `DbContext` 하나를 모든 요청이 함께 쓰면 무슨 일이 생길까? (C++ 서버의 "DB 스레드 하나가 커넥션 하나를 쓰는" 구조를 그대로 옮기면?)
> 3. 클라이언트가 "영웅 레벨"을 직접 보내 `Update()`로 저장하는 방식은 왜 위험할까?
> 4. 두 요청이 같은 플레이어의 골드를 동시에 깎으면 어떤 결과가 나올까? 둘 다 성공 응답을 받을까?
> 5. 동시성 토큰이 있는데도 "응답을 못 받아 다시 보낸 같은 보상 요청"은 왜 막지 못할까?
>
> **처리법:** 🛠 실습 `AddDbContext`, `FindAsync` → 속성 변경 → `SaveChangesAsync`, `Include`/`Select` 쿼리, `dotnet ef migrations add` / `database update`, `BeginTransactionAsync`/`CommitAsync`, `ExecuteUpdateAsync` → 읽자마자 직접 실행해 보기 · 🗺 관계도 엔티티 상태(Added/Unchanged/Modified/Deleted/Detached) → `SaveChanges`(= 한 트랜잭션) → 동시성 토큰·명시적 트랜잭션·멱등성 키+유니크 제약이 각각 막는 문제 · 🔗 유추 `DbContext` ≈ 장바구니와 계산대(변경을 담아 두었다가 `SaveChanges`에서 한 번에 결제) — 요청이 끝나면 버려지고 두 사람이 동시에 쓸 수 없다는 점에서 깨지는지 따져 보기 · 📦 카드로 기본 매핑(`string`→`nvarchar(max)`, `decimal(18,2)`, enum→`int`), 로딩 4종 이름, `DeleteBehavior` 값들, 격리 수준 4개(기본 ReadCommitted), 풀 크기 기본 1024, `__EFMigrationsHistory`

---

**학습 목표**
1. EF Core가 C# 클래스와 DB 테이블을 어떻게 이어 주는지 이해하고, `DbContext`로 조회·생성·수정·삭제를 할 수 있다.
2. 웹 서버에서 `DbContext`를 올바르게(DI, 요청당 1개, async) 쓰고, 관계·마이그레이션·추적 옵션 같은 실무 설정을 알아본다.
3. 게임 서버에서 가장 위험한 문제인 재화·아이템 이중 처리를 동시성 토큰, 트랜잭션, 멱등성 키로 막는 원리를 이해한다.

> 이 부의 예제는 공용 모델(`Player`, `Hero`, `GameDbContext`)을 1.1절에서 한 번 정의하고, 이후 절에서 그대로 가져다 씁니다.
> 각 절 출처의 `L숫자`는 원문 텍스트 파일의 줄 번호입니다. 원문은 요약해서 옮겼습니다.

> 재구성 안내: 원래 4개 장 12개 절(1장 시작하기: 1·2절 / 2장 읽기와 쓰기: 3·4·5절 / 3장 웹 서버에서의 EF Core: 6·7절 / 4장 안전하게 다루기: 8·9·10·11·12절)을 다섯 개 코어로 다시 묶었습니다. 원래 절 → 새 위치: 1절 → 1.1, 2절 → 1.2, 5절 → 1.3, 3절 → 2.1, 11절 → 2.2, 4절 → 3.1, 6절 → 3.2, 9절 → 3.3, 7절 → 4.1, 10절 → 4.2, 8절 → 5.1, 12절 → 5.2. 본문 안의 절 참조도 새 번호로 바꾸었습니다.

---


## 코어 1. 모델 — 테이블은 클래스, 창구는 `DbContext`

> 원래 1장 "EF Core 시작하기"(1·2절)와 2장의 5절 "관계". ORM이 무엇을 무엇에 대응시키는지와 `DbContext`의 역할을 잡고(1.1), 규칙 → 어노테이션 → Fluent API 순으로 매핑을 덮어쓰는 법(1.2), 그리고 엔티티 사이의 관계와 그 갱신·삭제 규칙(1.3)을 본다. C++ 서버에서 "결과셋을 구조체로 옮기는 코드"를 손으로 쓰던 부분이 전부 여기로 들어간다.

### 1.1 ORM과 EF Core 개념, DbContext
**한 줄 요약:** EF Core는 "테이블은 클래스, 행은 객체"로 바꿔 주는 번역기이고, 그 창구가 `DbContext`다.

> 📖 출처: Entity Framework Core in Action 1장 "An overview of EF Core" (텍스트 L1516-1573), Entity Framework Core in Action 2장 "Creating the application's DbContext" (텍스트 L2978-3090), Web API Development with ASP.NET Core 8 5장 "Why use ORM?" / "Configuring the DbContext class" (텍스트 L8688-8813)

**핵심 설명**
- ORM(Object-Relational Mapper)은 DB 테이블·열을 C# 클래스·속성에 연결해 준다. 테이블 = 클래스, 열 = 속성, 행 = 객체, SQL의 `WHERE` = LINQ의 `Where`에 대응한다(Entity Framework Core in Action 표 1.1).
- SQL 문자열을 직접 쓰면 스키마가 바뀔 때마다 고쳐야 하고 타입 안전성도 없다. ORM은 이를 C# 코드로 옮겨 실수를 줄인다. 다만 성능이 중요한 복잡한 보고서 쿼리는 SQL을 직접 쓰는 편이 나을 때도 있다(Web API Development with ASP.NET Core 8).
- 단점도 있다. EF Core가 DB를 너무 잘 감춰서, C#에서는 되지만 DB로는 번역이 안 되는 코드를 쓰기 쉽다(예: 식 본문 속성 `FullName`으로 `Where`/`OrderBy`). 그래서 내부에서 어떤 SQL이 나가는지 로그로 확인하는 습관이 중요하다(Entity Framework Core in Action).
- `DbContext`는 DB 연결을 유지하고, 객체의 변경을 추적하고, 트랜잭션을 관리하고, 저장(`SaveChanges`)을 맡는 클래스다(Web API Development with ASP.NET Core 8). `DbSet<T>` 속성 하나가 테이블 하나에 대응한다. 옵션(DB 종류, 연결 문자열)은 생성자로 받는다(Entity Framework Core in Action).
- `DbSet` 속성을 `{ get; set; }` 대신 `=> Set<Player>()`로 쓰는 것은 nullable 참조 형식 경고를 없애려는 방법이다. Web API Development with ASP.NET Core 8은 `!`(null 허용 연산자)를 쓰거나 경고를 그냥 두어도 된다고 함께 소개한다.
- `DbContext`는 `IDisposable`이므로 직접 만들었다면 `using`으로 정리해야 한다(Entity Framework Core in Action). 웹 서버에서는 DI가 대신 관리한다(4.1절).

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

public class Player
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public long Gold { get; set; }
    public List<Hero> Heroes { get; set; } = new();
    [Timestamp] public byte[]? RowVersion { get; set; } // 5.1절에서 설명하는 동시성 토큰
}

public class Hero
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Level { get; set; }
    public int PlayerId { get; set; }   // 외래 키
    public Player? Player { get; set; } // 탐색 속성
}

public class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<Player> Players => Set<Player>(); // Players 테이블
    public DbSet<Hero> Heroes => Set<Hero>();      // Heroes 테이블
}
```

**방치형 RPG 서버에서는**: 플레이어·영웅·아이템 같은 게임 데이터는 대부분 `DbSet` 하나로 표현되고, `GameDbContext` 하나가 서버의 DB 창구가 된다.

> 🔧 보충(책 외): 이 부의 이후 예제는 위 `GameDbContext`가 이미 있다고 가정한다. 또 `Player.RowVersion`의 `[Timestamp]`가 값을 자동으로 채워 주는 것은 SQL Server 기준이다(5.1절 참고).

### 1.2 엔티티 모델과 매핑 (규칙, 어노테이션, Fluent API)
**한 줄 요약:** 아무 설정을 안 해도 EF Core가 규칙으로 매핑해 주고, 필요한 부분만 어노테이션이나 Fluent API로 덮어쓴다.

> 📖 출처: Web API Development with ASP.NET Core 8 5장 "Configuring the mapping between models and database" (텍스트 L9515-10240, 규칙 L9528, 어노테이션 L9700, Fluent API L9887, 설정 분리 L10161), Entity Framework Core in Action 4장 테이블 이름 규칙 설명 (텍스트 L6482-6487)

**핵심 설명**
- **규칙(convention)**: `Id` 또는 `<클래스명>Id`는 기본 키, 열 이름은 속성 이름이다. 테이블 이름은 `DbSet` 속성 이름이고(Entity Framework Core in Action), `DbSet`이 없는 엔티티는 클래스 이름이 된다. SQL Server 기준으로 `string`은 `nvarchar(max)`, `decimal`은 `decimal(18,2)`, `enum`은 기본적으로 `int`로 저장된다(Web API Development with ASP.NET Core 8 표 5.1). 외래 키 열에는 자동으로 인덱스가 만들어진다(Web API Development with ASP.NET Core 8).
- **데이터 어노테이션**: 클래스·속성 위에 `[Table]`, `[Column]`, `[Key]`, `[Required]`, `[MaxLength]` 같은 특성을 붙인다. 설정이 모델 클래스 안에 들어가므로 이해하기 쉽지만, 클래스가 DB 설정으로 오염된다는 단점이 있다(Web API Development with ASP.NET Core 8).
- **Fluent API**: `OnModelCreating`에서 `HasMaxLength`, `IsRequired`, `HasIndex`, `HasConversion` 등을 호출한다. 같은 속성을 어노테이션과 Fluent API 양쪽에서 설정하면 Fluent API가 이기며, Web API Development with ASP.NET Core 8은 Fluent API를 권장한다.
- Web API Development with ASP.NET Core 8은 최적의 성능을 위해 엔티티마다 매핑을 명시하라고 권한다. 문자열이 `nvarchar(max)`가 되는 기본값이 항상 효율적이진 않기 때문이다. 엔티티가 많아지면 `IEntityTypeConfiguration<T>` 클래스로 설정을 나누고 `ApplyConfigurationsFromAssembly`로 한꺼번에 적용한다. 이때 설정 클래스는 `DbContext`와 같은 어셈블리에 있어야 하고 적용 순서는 통제할 수 없다. 순서가 중요하면 하나씩 직접 호출한다.
- 매핑을 바꿀 때마다 `dotnet ef migrations add`로 새 마이그레이션을 만들고 DB에 적용해야 한다(4.2절). 타입을 바꾸는 매핑 변경은 데이터가 잘릴 수 있다(예: `nvarchar(max)` -> `varchar(32)`는 32자로 잘림).

```csharp
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public enum ItemGrade { Common, Rare, Epic }

[Table("Items")]                       // 어노테이션 방식
public class Item
{
    [Key] public int Id { get; set; }
    [Required, MaxLength(32)] public string Name { get; set; } = "";
    public ItemGrade Grade { get; set; }
}

public class ItemConfiguration : IEntityTypeConfiguration<Item> // Fluent API 방식
{
    public void Configure(EntityTypeBuilder<Item> builder)
    {
        builder.Property(i => i.Grade).HasConversion<string>().HasMaxLength(16); // enum을 문자열로 저장
        builder.HasIndex(i => i.Name);
    }
}

public class ConfiguredDbContext(DbContextOptions<ConfiguredDbContext> options) : DbContext(options)
{
    public DbSet<Item> Items => Set<Item>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
        => modelBuilder.ApplyConfigurationsFromAssembly(typeof(ConfiguredDbContext).Assembly);
}
```

**방치형 RPG 서버에서는**: 이름 길이 제한, 등급(enum) 문자열 저장, 검색용 인덱스 같은 설정이 여기에 들어간다.

> 🔧 보충(책 외): 게임 데이터는 값이 나중에 추가되는 enum이 많다. `int`로 저장하면 enum 순서를 바꿀 때 기존 데이터의 의미가 어긋날 수 있어, 문자열 저장을 고려할 만하다(책은 문자열 저장 방법만 다룬다).

### 1.3 관계: 일대다, 일대일, 다대다
**한 줄 요약:** 클래스 안의 탐색 속성과 외래 키 속성으로 관계를 표현하고, EF Core가 대부분 규칙으로 알아낸다.

> 📖 출처: Web API Development with ASP.NET Core 8 6장 "Understanding one-to-many / one-to-one / many-to-many relationships" (텍스트 L10304-11070), Entity Framework Core in Action 3장 "Handling relationships in updates" (텍스트 L5099-5879, 삭제 관계 L5997-6095)

**핵심 설명**
- 용어: **주(principal) 엔티티**는 기본 키를 가진 쪽(부모), **종속(dependent) 엔티티**는 외래 키를 가진 쪽(자식). **탐색 속성**은 관련 엔티티를 가리키는 속성이다(컬렉션형, 참조형).
- **일대다**: 한쪽에 `List<자식>`, 다른 쪽에 `부모?` 참조와 `부모Id`. 탐색 속성만 있어도 규칙으로 인식된다(외래 키 속성이 없으면 EF Core가 그림자 외래 키를 만든다). 명시하려면 `HasMany().WithOne().HasForeignKey()` 또는 `HasOne().WithMany()`를 쓰며, 한쪽에서만 설정하면 된다(Web API Development with ASP.NET Core 8).
- **일대일**: 양쪽이 참조 속성을 갖고, 어느 쪽이 종속인지 외래 키로 명시해야 한다: `HasOne().WithOne().HasForeignKey<종속>(...)`. 외래 키가 없으면 EF Core가 종속 쪽을 마음대로 고를 수 있다(Web API Development with ASP.NET Core 8).
- **다대다**: 양쪽에 컬렉션 속성만 두면 EF Core가 연결 테이블을 자동 생성한다. 테이블·열 이름을 바꾸거나 연결에 추가 열이 필요하면 연결 엔티티를 직접 정의하고 `UsingEntity`로 설정한다(Web API Development with ASP.NET Core 8). 연결 엔티티 방식은 `Include`로 연결 테이블을 정렬·필터할 수 있고, 직접 연결 방식은 코딩이 훨씬 쉽지만 연결 테이블에 접근할 수 없다(Entity Framework Core in Action).
- **부모를 저장하면 새 자식도 함께 INSERT**된다. 기존 부모에 자식을 추가하는 방법은 둘이다. (1) 부모를 조회해 컬렉션에 추가하고 저장한다(부모의 수정, PUT). (2) 자식을 만들어 외래 키를 채워 저장한다(자식의 생성, POST). 자식이 적으면 (1)이 흔하고, 자식이 아주 많으면 (2)처럼 자식 전용 엔드포인트를 두는 편이 효율적이다(Web API Development with ASP.NET Core 8). 외래 키만 바꾸어 관계를 옮기면 부모와 컬렉션을 로드하지 않아도 되어 성능에 유리하다(Entity Framework Core in Action).
- **관계를 갱신할 때는 기존 관계를 먼저 로드**해야 한다(Entity Framework Core in Action). 일대일에서 기존 항목이 있는데 로드하지 않고 새로 붙이면 외래 키 중복 예외가 난다. 일대다 컬렉션을 통째로 새 컬렉션으로 교체할 때도 `Include`로 먼저 로드해야 옛 항목이 지워지고(외래 키가 null 불가일 때 기본 동작), 로드하지 않으면 옛 항목이 그대로 남아 새 항목과 합쳐진다. 로드하지 않고 직접 행을 만드는 방식은 성능에 유리하지만 관계 관리를 직접 해야 한다.
- **삭제와 관계**: 필수(외래 키 null 불가) 관계는 기본이 연쇄 삭제(Cascade)라 부모를 지우면 자식도 지워진다. 외래 키가 null 가능하면 `null`로 바꾸는 방식(`ClientSetNull`)을 쓸 수 있고, 둘 다 아니면 DB가 오류를 낸다(Entity Framework Core in Action, Web API Development with ASP.NET Core 8). 연쇄 삭제가 DB 수준으로 설정돼 있으면 `Include` 없이도 자식이 지워지지만, Entity Framework Core in Action은 자식을 로드해야 EF Core가 알고 삭제한다고 설명한다. Web API Development with ASP.NET Core 8은 DB가 연쇄 삭제를 지원하지 않을 수 있으므로 `ClientCascade`/`ClientSetNull` 사용을 권한다. 주문 내역처럼 남겨야 하는 자식이 있으면 `Restrict`로 부모 삭제를 막을 수 있다(Entity Framework Core in Action).
- 주의(Web API Development with ASP.NET Core 8): 양방향 탐색 속성이 있는 엔티티를 그대로 JSON으로 내보내면 순환 참조 예외가 난다. `ReferenceHandler.IgnoreCycles`나 `[JsonIgnore]`로 해결한다. 이 예외는 데이터가 DB에 저장된 뒤에 발생한다.
- 주의(Web API Development with ASP.NET Core 8): 다대다에서 관련 엔티티를 통째로 담아 저장하면 같은 제목의 엔티티가 중복 생성될 수 있다. 유니크 인덱스, 존재 확인, ID만 보내는 별도 엔드포인트로 막는다.

```csharp
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

public class Account { public int Id { get; set; } public AccountProfile? Profile { get; set; } }
public class AccountProfile
{
    public int Id { get; set; }
    public string Nickname { get; set; } = "";
    public int AccountId { get; set; }          // 일대일의 종속 쪽 외래 키
    public Account? Account { get; set; }
}
public class Skill { public int Id { get; set; } public List<SkillTag> Tags { get; set; } = new(); }
public class SkillTag { public int Id { get; set; } public List<Skill> Skills { get; set; } = new(); } // 다대다

public static class RelationSetup
{
    public static void Configure(ModelBuilder mb)
    {
        // 일대다: Player 1 --- N Hero (1.1절의 모델)
        mb.Entity<Player>().HasMany(p => p.Heroes).WithOne(h => h.Player)
            .HasForeignKey(h => h.PlayerId).OnDelete(DeleteBehavior.Cascade);
        // 일대일: 종속 쪽(AccountProfile)을 명시
        mb.Entity<AccountProfile>().HasOne(p => p.Account).WithOne(a => a.Profile)
            .HasForeignKey<AccountProfile>(p => p.AccountId);
        // 다대다: Skill.Tags <-> SkillTag.Skills 는 규칙만으로 연결 테이블 자동 생성
    }

    public static void AddJson(WebApplicationBuilder builder)
        => builder.Services.AddControllers().AddJsonOptions(o =>
            o.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles);
}
```

```csharp
public static class HeroRelationUpdates
{
    // 컬렉션 통째 교체: Include로 먼저 로드해야 옛 항목이 삭제된다(Entity Framework Core in Action 3.4.3)
    public static async Task ReplaceHeroesAsync(GameDbContext db, int playerId, List<Hero> newHeroes)
    {
        var player = await db.Players.Include(p => p.Heroes).SingleAsync(p => p.Id == playerId);
        player.Heroes = newHeroes;
        await db.SaveChangesAsync();
    }

    // 외래 키만 바꿔 관계 이동: 부모와 컬렉션을 로드하지 않아도 된다(Entity Framework Core in Action 3.4.5)
    public static async Task MoveHeroAsync(GameDbContext db, int heroId, int newPlayerId)
    {
        var hero = await db.Heroes.FindAsync(heroId);
        if (hero is null) return;
        hero.PlayerId = newPlayerId;
        await db.SaveChangesAsync();
    }
}
```

**방치형 RPG 서버에서는**: 플레이어-영웅은 일대다, 계정-프로필은 일대일, 영웅 스킬-태그는 다대다의 전형이다.

> 🔧 보충(책 외): 위 클래스 이름(Account, Skill 등)은 이해를 돕기 위한 가상의 예다. 책의 예는 Invoice/Contact/Movie이다.

---


## 코어 2. 조회 — `IQueryable`은 실행 메서드에서 SQL이 된다

> 원래 2장의 3절 "조회"와 4장의 11절 "추적 vs 비추적 쿼리, IQueryable, 일괄 업데이트". 쿼리가 언제 SQL로 나가는지(2.1), 그리고 무엇을 DB에서 하고 무엇을 메모리에서 할지·추적을 켤지 끌지·대량 변경을 어떻게 할지(2.2)를 본다. 직접 SQL을 쓰던 C++ 서버와 달리 "어떤 SQL이 나가는지"가 코드에 드러나지 않으므로, 이 코어의 규칙이 곧 성능 규칙이다.

### 2.1 조회: LINQ 쿼리, 필터·정렬·페이징, 관련 데이터 로딩
**한 줄 요약:** `DbSet`에 LINQ를 이어 붙이고 마지막에 `ToListAsync()` 같은 실행 메서드를 부르면 그때 SQL이 나간다.

> 📖 출처: Entity Framework Core in Action 2장 "Understanding database queries" / "Loading related data" / "Adding sorting, filtering, and paging" (텍스트 L3163-3618, L4014-4030), Web API Development with ASP.NET Core 8 5장 "Basic LINQ queries" (텍스트 L9107-9262), Web API Development with ASP.NET Core 8 6장 "Querying data" (텍스트 L10473-10525)

**핵심 설명**
- 쿼리는 세 부분이다. (1) `DbSet` 접근 (2) `Where`/`OrderBy`/`Skip`/`Take` 같은 LINQ 연산 (3) 실행 메서드(`ToList`, `First`, `Count`, `foreach` 등). 실행 전까지는 식(expression tree)으로만 쌓여 있다. 필터·정렬·페이징을 실행 메서드 앞에 두어야 DB 안에서 처리된다(Entity Framework Core in Action).
- 한 건 찾기(Web API Development with ASP.NET Core 8): `Find`는 기본 키로 찾고 이미 추적 중이면 DB를 안 간다(없으면 null). `Single`은 정확히 1건이어야 하고(0건·2건 이상이면 예외), `SingleOrDefault`는 0건이면 기본값(null)을 주되 2건 이상이면 예외다. `First`는 여러 건이어도 첫 번째를 주고 0건이면 예외, `FirstOrDefault`는 0건이면 null이다. `Find`/`...OrDefault` 계열은 null 체크를 잊지 않는다. (참고로 Entity Framework Core in Action 저자는 `Find`가 추적 확인 때문에 `SingleOrDefault`보다 약간 느리다고 하며 `SingleOrDefault`를 선호한다.)
- 페이징: `OrderBy...` -> `Skip((page-1)*pageSize)` -> `Take(pageSize)`. 페이징에는 정렬이 꼭 필요하다(Entity Framework Core in Action).
- 관련 데이터는 기본으로 안 불러온다. `Include`를 안 하면 관련 컬렉션은 채워지지 않는다(Entity Framework Core in Action은 기본값이 null이라고 설명). 불러오는 방법은 네 가지다(Entity Framework Core in Action): **Eager**(`Include`/`ThenInclude`, 한 번에 효율적으로, 대신 필요 없는 데이터까지 읽음), **Explicit**(`Entry(x).Collection(...).Load()`, 나중에, 대신 DB 왕복이 늘어남), **Select**(필요한 열만 골라 DTO로, 대신 열마다 코드를 써야 함), **Lazy**(접근할 때 자동 조회, `virtual` 탐색 속성과 `UseLazyLoadingProxies`가 필요하고 DB 접근이 많아져 성능에 나쁨).
- `Include`는 조인 때문에 중복 데이터가 커질 수 있고, 자식이 수백~수천 건이면 목록 화면에 부적합하다. 이럴 땐 `AsSplitQuery()`로 쿼리를 나누거나 아예 Include를 안 쓴다. 쿼리를 나누면 DB 왕복이 늘고, 두 쿼리 사이에 데이터가 바뀌면 결과가 어긋날 수 있으니 장단점을 따져 쓴다(Web API Development with ASP.NET Core 8).

```csharp
using Microsoft.EntityFrameworkCore;

public record HeroSummary(int Id, string Name, int Level);

public static class HeroQueries
{
    // 필터 -> 정렬 -> 페이징 -> 필요한 열만 선택(Select loading) -> 마지막에 실행
    public static Task<List<HeroSummary>> GetPageAsync(GameDbContext db, int playerId, int page, int pageSize)
        => db.Heroes
            .Where(h => h.PlayerId == playerId)
            .OrderByDescending(h => h.Level)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(h => new HeroSummary(h.Id, h.Name, h.Level))
            .ToListAsync();

    // Eager loading: 플레이어와 영웅 목록을 함께 로드
    public static Task<Player?> GetWithHeroesAsync(GameDbContext db, int playerId)
        => db.Players.Include(p => p.Heroes).FirstOrDefaultAsync(p => p.Id == playerId);
}
```

**방치형 RPG 서버에서는**: `GET /api/heroes?page=1&pageSize=20` 같은 목록 API는 위의 필터-정렬-페이징-Select 패턴을 그대로 쓴다.

> 🔧 보충(책 외): 응답에 엔티티를 그대로 내보내기보다 `HeroSummary` 같은 DTO로 내보내면 순환 참조(1.3절)와 과다 노출 문제를 함께 피할 수 있다.

### 2.2 추적 vs 비추적 쿼리, IQueryable, 일괄 업데이트
**한 줄 요약:** 읽기만 할 때는 `AsNoTracking`, 필터는 DB에서 실행되도록 `IQueryable` 상태로, 대량 변경은 `ExecuteUpdate`로 처리한다.

> 📖 출처: Web API Development with ASP.NET Core 8 7장 "Understanding the difference between tracking versus no-tracking queries" / "IQueryable and IEnumerable" / "Client evaluation versus server evaluation" / "Using bulk operations" (텍스트 L11257-11742), Entity Framework Core in Action 2장 "The two types of database queries" (텍스트 L3234-3258)

**핵심 설명**
- **추적 쿼리(기본)**: 읽어 온 엔티티를 `DbContext`가 추적해서 수정하고 저장할 수 있다. 대신 메모리와 시간이 든다. 같은 키를 `Find`로 다시 찾으면 DB에 안 가고 추적 중인 객체를 돌려준다. 그래서 `ExecuteUpdate` 같은 추적 밖의 변경이 있었다면 `Find`가 옛 값을 돌려줄 수 있고, 이때는 `Single`/`SingleOrDefault`로 DB에서 다시 읽는다(Web API Development with ASP.NET Core 8).
- **비추적 쿼리**: `AsNoTracking()`을 붙이면 더 빠르고 가볍지만, 그 엔티티는 수정해도 `SaveChanges`에 반영되지 않는다. 수정할 일이 없는 GET 조회에 적합하다. 전체 기본값을 바꾸려면 `UseQueryTrackingBehavior(NoTracking)`을 쓰고, 필요한 쿼리만 `AsTracking()`으로 되돌린다(Web API Development with ASP.NET Core 8).
- **IQueryable vs IEnumerable**: `IQueryable`인 동안에는 `Where`, `OrderBy`, `Skip`, `Take`가 SQL로 합쳐져 DB에서 실행된다. `AsEnumerable()`을 먼저 부르면 전체를 메모리로 가져온 뒤 C#에서 걸러 매우 비효율적이다(Web API Development with ASP.NET Core 8은 로그로 `ORDER BY`/`OFFSET`이 빠진 SQL을 보여 준다). `ToList`/`ToArray`, `Single`, `First`, `Count`, `foreach`가 쿼리를 즉시 실행한다(Web API Development with ASP.NET Core 8).
- **서버 vs 클라이언트 평가**: DB로 번역되는 부분(서버 평가)이 기본이다. 사용자 정의 C# 메서드는 번역되지 않으므로 마지막 `Select` 정도에만 쓰고, `Where`에 쓰면 EF Core 3.0 이후로는 예외가 난다. 데이터가 적어 안전하다고 확신할 때만 `AsEnumerable()`/`ToList()`로 명시적으로 클라이언트 평가를 한다(Web API Development with ASP.NET Core 8, Entity Framework Core in Action).
- **일괄 업데이트(EF Core 7+)**: `ExecuteUpdate`/`ExecuteDelete`는 엔티티를 불러오지 않고 한 번의 SQL로 여러 행을 바꾼다. 추적을 거치지 않으므로 `SaveChanges`가 필요 없이 즉시 실행되고, 이미 로드된 객체는 옛 값 그대로라는 점에 주의한다(Web API Development with ASP.NET Core 8). 문자열로 SQL을 쓰는 `ExecuteSql`과 달리 강한 타입 지원이 있다. 원시 SQL은 `FromSql`처럼 보간 문자열이면 매개변수화되어 SQL 인젝션에서 안전하지만, `...Raw` 계열은 개발자가 직접 책임져야 한다(Web API Development with ASP.NET Core 8).

```csharp
using Microsoft.EntityFrameworkCore;

public static class QueryTips
{
    // 좋음: 읽기 전용 + 필터/정렬/페이징을 DB에서 실행
    public static Task<List<Hero>> GetTopHeroesAsync(GameDbContext db, int minLevel, int page)
        => db.Heroes.AsNoTracking()
            .Where(h => h.Level >= minLevel)
            .OrderByDescending(h => h.Level)
            .Skip(page * 20).Take(20)   // page는 0부터 시작
            .ToListAsync();

    // 나쁨: AsEnumerable() 때문에 모든 영웅을 메모리로 읽은 뒤 C#에서 필터링
    public static List<Hero> GetTopHeroesBad(GameDbContext db, int minLevel)
        => db.Heroes.AsEnumerable().Where(h => h.Level >= minLevel).ToList();

    // 일괄 업데이트: 로드 없이 한 번의 UPDATE. SaveChanges 불필요
    public static Task<int> GiveGoldToAllAsync(GameDbContext db, long bonus)
        => db.Players.ExecuteUpdateAsync(s => s.SetProperty(p => p.Gold, p => p.Gold + bonus));
}
```

**방치형 RPG 서버에서는**: 랭킹·목록 조회는 `AsNoTracking` + 페이징, 이벤트 보상 일괄 지급이나 일일 초기화는 `ExecuteUpdate` 후보다.

> 🔧 보충(책 외): 일괄 업데이트는 추적을 거치지 않으므로 5.1절의 `DbUpdateConcurrencyException` 방식이 그대로 적용되지 않는다고 보는 것이 안전하다(책은 이 점을 직접 다루지 않는다). `p => p.Gold + bonus`처럼 값에 식을 쓰는 형태는 책 예제(고정 값)를 확장한 것으로, EF Core 8에서 컴파일하고 SQLite로 실행해 `Gold`가 100에서 150이 되는 것을 확인했다. 이 실행에서 이미 로드해 둔 객체의 `Gold`는 100 그대로였고 `Find`로 다시 찾아도 100이었다.

---


## 코어 3. 쓰기 — 변경 추적과 `SaveChanges` 한 번(Unit of Work)

> 원래 2장의 4절 "생성·수정·삭제와 엔티티 상태", 3장의 6절 "비즈니스 로직과 DB 코드 분리", 4장의 9절 "트랜잭션". 결정적 원리는 하나다: **`SaveChanges` 한 번 = 하나의 트랜잭션.** 상태 추적이 SQL을 만들고(3.1), 그래서 로직은 저장을 모르게 두고 바깥에서 한 번만 저장하며(3.2), 여러 번 저장해야 할 때만 명시적 트랜잭션으로 묶는다(3.3). C++ 서버의 "변경을 모았다가 flush 한 번"과 같은 발상이지만, flush 시점이 타이머가 아니라 요청의 끝이다.

### 3.1 생성·수정·삭제와 엔티티 상태
**한 줄 요약:** 엔티티에는 상태(State)가 붙고, `SaveChanges`가 상태를 보고 INSERT/UPDATE/DELETE를 만든다.

> 📖 출처: Entity Framework Core in Action 3장 "Introducing EF Core's entity State" / "Creating new rows" / "Updating database rows" / "Deleting entities" (텍스트 L4416-4711 상태·생성, L4712-5098 수정, L5880-6095 삭제), Web API Development with ASP.NET Core 8 5장 "Creating an entity" / "Updating an entity" (텍스트 L9264-9431)

**핵심 설명**
- 상태 다섯 가지: `Added`(새 행, INSERT), `Unchanged`(변경 없음, 무시), `Modified`(UPDATE), `Deleted`(DELETE), `Detached`(추적 안 함). `AsNoTracking` 없이 쿼리로 읽어 온 엔티티는 `Unchanged`로 시작하고, 속성을 바꾸면 `Modified`가 된다(Entity Framework Core in Action, Web API Development with ASP.NET Core 8). `Add`/`Remove`가 상태를 `Added`/`Deleted`로 바꾸고, 저장에 성공하면 새로 넣은 엔티티도 `Unchanged`가 된다(Entity Framework Core in Action).
- **생성**: 엔티티를 `Add`하고 `SaveChanges`. DB가 만든 기본 키(IDENTITY)는 저장 뒤 객체에 채워진다(Entity Framework Core in Action). 부모 엔티티만 `Add`해도 그에 딸린 새 자식 엔티티가 함께 INSERT된다(Entity Framework Core in Action). 이미 DB에 있는 엔티티(예: 기존 Author)를 새 엔티티와 연결할 때는 추적 중인 인스턴스를 조회해서 연결해야 다시 INSERT되지 않는다(Entity Framework Core in Action).
- **수정**: 읽기 -> 속성 변경 -> `SaveChanges`. `SaveChanges` 안의 `DetectChanges`가 처음 읽은 스냅샷과 비교해 바뀐 열만 UPDATE한다(Entity Framework Core in Action).
- 웹에서는 요청마다 `DbContext`가 새로 생기므로 "연결이 끊긴 수정(disconnected update)"이 된다(Entity Framework Core in Action). 방법은 두 가지다. (1) 기본 키와 바꿀 값만 받아서(DTO) 다시 조회한 뒤 그 속성만 고친다. 데이터가 적어 빠르고, 클라이언트가 가격 같은 값을 조작하지 못해 더 안전하다. 대신 복사할 속성 코드를 써야 한다(Entity Framework Core in Action). (2) 전체 데이터를 받아 `Update`(또는 `Entry(x).State = Modified`)로 저장한다. 다시 읽지 않아 빠르지만, 상태가 `Modified`이므로 값이 바뀌었든 아니든 모든 열이 UPDATE되고(Web API Development with ASP.NET Core 8), 데이터를 보내는 쪽을 믿어야 한다(Entity Framework Core in Action).
- `Find`는 추적 중이면 DB를 가지 않지만, `ExecuteUpdate`처럼 추적을 거치지 않은 변경이 있었다면 옛 값을 돌려줄 수 있다(Web API Development with ASP.NET Core 8, 2.2절).
- **삭제**: `Remove` 후 `SaveChanges`. 관계가 있는 엔티티를 지울 때의 동작은 1.3절에서 다룬다. 실제로 지우지 않고 `SoftDeleted` 플래그와 전역 쿼리 필터(`HasQueryFilter`)로 숨기는 소프트 삭제도 있다. 필터를 무시하려면 `IgnoreQueryFilters()`를 쓴다(Entity Framework Core in Action).
- `SaveChanges`는 작업 끝에 한 번만 부르는 것이 원칙이다. 생성·수정·삭제가 섞여 있어도 DB가 하나라도 거부하면 전부 거부되는 단위(Unit of Work, 내부적으로 DB 트랜잭션)가 되기 때문이다(Entity Framework Core in Action).

```csharp
using Microsoft.EntityFrameworkCore;

public static class HeroCommands
{
    public static async Task<Hero> CreateAsync(GameDbContext db, int playerId, string name)
    {
        var hero = new Hero { PlayerId = playerId, Name = name, Level = 1 };
        db.Heroes.Add(hero);               // State = Added
        await db.SaveChangesAsync();       // INSERT, hero.Id가 채워짐
        return hero;
    }

    public static async Task<bool> LevelUpAsync(GameDbContext db, int heroId)
    {
        var hero = await db.Heroes.FindAsync(heroId);  // Unchanged로 추적 시작
        if (hero is null) return false;
        hero.Level++;                                  // 변경 감지 대상
        await db.SaveChangesAsync();                   // UPDATE Heroes SET Level = ...
        return true;
    }

    public static async Task<bool> DeleteAsync(GameDbContext db, int heroId)
    {
        var hero = await db.Heroes.FindAsync(heroId);
        if (hero is null) return false;
        db.Heroes.Remove(hero);            // State = Deleted
        await db.SaveChangesAsync();
        return true;
    }
}
```

**방치형 RPG 서버에서는**: "영웅 레벨업" API는 클라이언트가 레벨 값을 보내는 것이 아니라 영웅 ID만 받고 서버가 다시 조회해서 계산해야 한다. 그래야 값 조작을 막을 수 있다.

> 🔧 보충(책 외): 책의 "받은 값을 신뢰하지 않는다"는 보안 설명을 게임에 적용한 예다. 재화·레벨 같은 값은 항상 서버가 계산한다.

### 3.2 비즈니스 로직과 DB 코드 분리
**한 줄 요약:** 규칙을 계산하는 코드는 DB를 모르게 만들고, 불러오기와 `SaveChanges`는 바깥의 실행 담당이 맡는다.

> 📖 출처: Entity Framework Core in Action 4장 "The questions to ask and the decisions you need to make before you start coding" / "Using a design pattern to implement complex business logic" (텍스트 L6193-6330, L6331-6398)

**핵심 설명**
- 비즈니스 규칙은 사람이 읽을 수 있는 문장(예: "책 가격은 음수일 수 없다")이고, 그것을 구현한 코드가 비즈니스 로직이다. 난이도는 검증, 단순, 복잡 세 단계로 나눠 볼 수 있다(Entity Framework Core in Action).
- 복잡한 로직을 위한 다섯 가지 지침(Entity Framework Core in Action): (1) 로직이 DB 구조를 먼저 정의한다 (2) 로직에는 잡음(웹·화면 관련 코드)이 없어야 한다 (3) 로직은 데이터가 메모리에 있는 것처럼 작성한다 (4) DB 접근 코드는 별도 프로젝트로 분리한다(로직마다 짝이 되는 DB 접근 클래스를 둔다) (5) 로직은 `SaveChanges`를 직접 부르지 않고, 서비스 계층의 실행 클래스가 오류가 없을 때만 호출한다.
- 이 방식은 비즈니스 로직을 쓰고, 테스트하고, 성능을 조율하기 쉽게 만들어 준다(Entity Framework Core in Action). 단순한 로직은 빠르게 작성하고, 복잡한 로직에만 이런 구조적인 접근을 쓰라는 것이 책의 조언이다. 세 단계는 엄격한 규칙이 아니라 논의를 위한 기준이다.
- 오류를 위로 전달하는 방법은 예외를 던지는 것과 상태 객체로 오류 목록을 돌려주는 것 두 가지이며, 책의 예제는 후자를 쓴다(Entity Framework Core in Action). 아래 예제의 `string?` 반환도 같은 발상이다.
- 책은 이 방식을 "트랜잭션 스크립트(절차형) 패턴"이라 부르며, 도메인 모델이 빈약하다는 비판(anemic domain model)이 있음도 밝힌다.

```csharp
using Microsoft.EntityFrameworkCore;

// 순수 로직: EF Core를 전혀 모른다. 메모리 객체만 다룬다.
public static class HeroShopRules
{
    public static string? TryBuyHero(Player player, long price, string heroName)
    {
        if (player.Gold < price) return "골드가 부족합니다.";
        player.Gold -= price;
        player.Heroes.Add(new Hero { Name = heroName, Level = 1 });
        return null; // null이면 성공
    }
}

// 실행 담당: 불러오기 -> 로직 실행 -> 오류 없을 때만 SaveChanges 한 번
public class HeroShopService(GameDbContext db)
{
    public async Task<string?> BuyAsync(int playerId, string heroName, long price)
    {
        var player = await db.Players.Include(p => p.Heroes)
            .SingleOrDefaultAsync(p => p.Id == playerId);
        if (player is null) return "플레이어가 없습니다.";

        var error = HeroShopRules.TryBuyHero(player, price, heroName);
        if (error is not null) return error;

        await db.SaveChangesAsync();
        return null;
    }
}
```

**방치형 RPG 서버에서는**: "영웅 소환", "장비 강화" 같은 규칙은 순수 로직에 넣어 단위 테스트하고, 컨트롤러는 서비스만 호출한다.

> 🔧 보충(책 외): 위 `HeroShopRules/HeroShopService`는 책의 지침을 게임에 옮긴 단순화 예시다. 책은 별도 프로젝트와 인터페이스(`IBizAction`)까지 구성하지만, 이 예제의 서비스는 DB 접근을 직접 하므로 지침 (4)는 따르지 않았다. 또 `Player`에 동시성 토큰이 있으면 이 저장 단계에서 `DbUpdateConcurrencyException`이 날 수 있으므로 5.1절처럼 처리한다.

### 3.3 트랜잭션
**한 줄 요약:** 트랜잭션은 여러 DB 쓰기를 "모두 성공 아니면 모두 취소"로 묶는 장치다.

> 📖 출처: Entity Framework Core in Action 3장 사이드바 "Why you should call SaveChanges only once at the end of your changes" (텍스트 L4644-4666), Entity Framework Core in Action 4장 "Using transactions to daisy-chain a sequence of business logic code" (텍스트 L7569-7831)

**핵심 설명**
- `SaveChanges` 한 번은 DB 트랜잭션 안에서 실행된다. 생성·수정·삭제가 섞여 있어도 DB가 하나라도 거부하면 전부 거부된다. 그래서 가능하면 `SaveChanges`를 끝에서 한 번만 부르는 것이 원칙이다(Unit of Work, Entity Framework Core in Action).
- 앞 단계가 저장한 값을 다음 단계가 읽어야 하는 등 여러 번 저장해야 하는데 전체를 하나로 묶고 싶으면 명시적 트랜잭션을 쓴다. `context.Database.BeginTransaction()`을 `using`으로 열면(Entity Framework Core in Action):
  - `Commit()` 전까지 쓰기는 다른 DB 사용자에게 보이지 않는다.
  - `Commit()` 없이 `using`이 끝나면 Dispose 때문에 자동으로 롤백된다. 롤백하면 그 트랜잭션 안의 쓰기는 모두 사라진다.
- 책의 예(`RunnerTransact2WriteDb`)는 단계 1을 실행해 오류가 없으면 `SaveChanges`, 이어서 단계 2도 같은 방식으로 실행하고, 모두 오류가 없을 때만 `Commit`을 부른다. 오류가 있으면 그냥 빠져나가 롤백되게 한다. 각 단계의 로직은 자신이 트랜잭션 안에서 도는지 알 필요가 없다.
- 단점(Entity Framework Core in Action): DB 접근이 복잡해져 디버깅이 조금 어려워질 수 있고 트랜잭션이 성능 문제를 일으킬 수도 있다. 또 `EnableRetryOnFailure`(실패 시 재시도) 옵션을 쓴다면 비즈니스 로직이 여러 번 호출될 수 있음을 고려해야 한다.

```csharp
using Microsoft.EntityFrameworkCore;

public static class GoldTransfer
{
    public static async Task<bool> SendGoldAsync(GameDbContext db, int fromId, int toId, long amount)
    {
        await using var tx = await db.Database.BeginTransactionAsync(); // 트랜잭션 시작
        var sender = await db.Players.FindAsync(fromId);
        var receiver = await db.Players.FindAsync(toId);
        if (sender is null || receiver is null || sender.Gold < amount)
            return false;                  // Commit 없이 나가면 Dispose -> 롤백

        sender.Gold -= amount;
        await db.SaveChangesAsync();       // 1단계 저장(아직 다른 사용자에게 안 보임)
        receiver.Gold += amount;
        await db.SaveChangesAsync();       // 2단계 저장
        await tx.CommitAsync();            // 여기서 한꺼번에 확정
        return true;
    }
}
```

**방치형 RPG 서버에서는**: "골드 차감 + 아이템 지급"처럼 둘 중 하나만 반영되면 안 되는 작업을 하나의 트랜잭션(또는 한 번의 `SaveChanges`)으로 묶는다.

> 🔧 보충(책 외): 책의 코드는 동기 `BeginTransaction`이다. 웹에서는 async 원칙(4.1절)에 따라 `BeginTransactionAsync`/`CommitAsync`를 쓴다. 한 번의 `SaveChanges`로 끝낼 수 있는 작업이라면 명시적 트랜잭션은 필요 없으니, 꼭 필요할 때만 쓴다.
>
> 🔧 보충(책 외, SQLite로 직접 실행해 확인): 위 `SendGoldAsync`에서 잔액 부족이면 `Commit` 없이 반환되어 잔액이 그대로였고(100에서 30 이체 후 999 이체 시도 -> 70/30 유지), 첫 저장 뒤 예외를 던지면 차감이 롤백되어 값이 유지됐다. 한 번의 `SaveChanges`에 정상 엔티티와 외래 키 위반 엔티티를 함께 넣자 정상 엔티티도 저장되지 않았다. 다만 트랜잭션이 5.1절의 동시 수정 문제를 자동으로 없애 주지는 않는다. 잔액 확인과 차감은 여전히 "읽고 나서 쓰는" 두 단계이므로, 같은 계정에 요청이 동시에 오는 경우에는 5.1절의 동시성 토큰 같은 장치가 따로 필요하다. 토큰이 있으면 위 코드의 `SaveChangesAsync`에서 `DbUpdateConcurrencyException`이 날 수 있고, 예외로 빠져나가면 `using`이 롤백한다(SQL Server에서는 실행해 보지 못했다).

---


## 코어 4. 수명과 운영 — 요청당 `DbContext` 하나, 스키마는 마이그레이션

> 원래 3장의 7절 "웹 앱에서 DbContext: DI 등록, 수명, async"와 4장의 10절 "마이그레이션". `DbContext`가 언제 생기고 언제 버려지는지(4.1), 그리고 DB 구조를 코드와 함께 버전 관리하고 운영 DB에 적용하는 방법(4.2)을 본다. C++ 서버의 "DB 스레드 + 커넥션 하나", "DBA가 돌리는 스키마 변경 스크립트"에 해당하는 운영 측면이다.

### 4.1 웹 앱에서 DbContext: DI 등록, 수명, async
**한 줄 요약:** `AddDbContext`로 등록하면 요청마다 새 `DbContext`가 생기고 요청이 끝나면 버려지며, DB 호출은 항상 async로 한다.

> 📖 출처: Entity Framework Core in Action 5장 "The lifetime of a service created by DI" (텍스트 L8100-8170), "Making the application's DbContext available via DI" (텍스트 L8192-8358), "Using async/await for better scalability" (텍스트 L9295-9453), "Running parallel tasks" (텍스트 L9454-9566), Web API Development with ASP.NET Core 8 5장 (텍스트 L8827-8834, L9083-9090), Web API Development with ASP.NET Core 8 7장 "Understanding DbContext pooling" (텍스트 L11188-11256)

**핵심 설명**
- 연결 문자열은 `appsettings.json`(개발용은 `appsettings.Development.json`)에 두고 `GetConnectionString`으로 읽는다. 배포할 때 바꿀 수 있어야 하기 때문이다(Entity Framework Core in Action, Web API Development with ASP.NET Core 8).
- `AddDbContext<T>`는 `DbContext`를 **Scoped**로 등록한다. 즉 한 HTTP 요청 안에서는 같은 인스턴스를 공유하고(여러 클래스에 주입해도 같은 것), 요청이 끝나면 Dispose된다. 그래서 여러 클래스가 한 작업을 나눠 하고 마지막에 `SaveChanges` 한 번으로 저장할 수 있다(Entity Framework Core in Action).
- `DbContext`는 스레드에 안전하지 않다. 같은 인스턴스를 여러 작업(Task)이 동시에 쓰면 예외가 난다. 요청마다 새로 만드는 것이 이 문제도 해결한다(Entity Framework Core in Action).
- 백그라운드 작업에서는 `IServiceScopeFactory`로 스코프를 직접 만들고 그 안에서 `DbContext`를 얻는다. 반복 실행이라면 매번 새 인스턴스를 써야 지난 실행의 데이터가 다음 실행에 영향을 주지 않는다(Entity Framework Core in Action).
- async를 쓰면 DB를 기다리는 동안 스레드를 반납해 더 많은 동시 사용자를 처리한다. 동기 버전이 아주 약간 빠르지만 그 차이는 작아서, 책은 웹에서는 항상 async 사용이라는 Microsoft 지침을 따르라고 한다. async 메서드에는 취소 토큰(`CancellationToken`)을 선택적으로 넘길 수 있다(Entity Framework Core in Action).
- 처리량이 매우 높을 때는 `AddDbContextPool`로 `DbContext` 인스턴스를 재사용할 수 있다(반납 시 상태를 초기화하며, 풀 크기 기본값은 1024). 하지만 대부분의 앱에는 필요 없고, 켜기 전후로 성능을 측정해 확인하라고 한다(Web API Development with ASP.NET Core 8).

```csharp
using Microsoft.EntityFrameworkCore;

public static class DbRegistration
{
    public static void AddGameDb(WebApplicationBuilder builder)
    {
        builder.Services.AddDbContext<GameDbContext>(options =>
            options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
        // 처리량이 아주 높다면: AddDbContextPool<GameDbContext>(...) (먼저 측정할 것)
    }

    public static void MapHeroApi(WebApplication app)
    {
        // GameDbContext는 요청 범위에서 자동 주입되고, 호출은 async
        app.MapGet("/api/heroes/{id:int}", async (int id, GameDbContext db) =>
            await db.Heroes.FindAsync(id) is { } hero ? Results.Ok(hero) : Results.NotFound());
    }
}

public class PlayerCounter(IServiceScopeFactory scopeFactory)
{
    // 백그라운드에서는 직접 스코프를 만들어 DbContext를 얻는다
    public async Task<int> CountAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Players.CountAsync(ct);
    }
}
```

**방치형 RPG 서버에서는**: 컨트롤러가 `GameDbContext`를 주입받아 쓰고, 오프라인 보상 계산 같은 주기 작업은 위 `PlayerCounter`처럼 스코프를 직접 만든다([제12부](12_제12부_백그라운드_서비스_캐시_외부호출.md)).

> 🔧 보충(책 외): 위 예제의 `Results.Ok(hero)`는 [제7부](07_제7부_웹_API_기초.md)의 Minimal API 문법을 쓴 것이다. 실제로는 엔티티 대신 DTO 반환을 권장한다.

### 4.2 마이그레이션
**한 줄 요약:** 마이그레이션은 C# 모델의 변경 이력을 코드 파일로 남겨 DB 구조를 코드와 맞추는 기능이다.

> 📖 출처: Entity Framework Core in Action 2장 "Creating a database for your own application" (텍스트 L3092-3157), Entity Framework Core in Action 5장 "Using EF Core's migration feature to change the database's structure" (텍스트 L9068-9295), Entity Framework Core in Action 9장 "Understanding the complexities of changing your application's database" (텍스트 L15583-15661), Entity Framework Core in Action 9장 스냅샷 설명 (텍스트 L15721-15777), Web API Development with ASP.NET Core 8 5장 "Creating the database" (텍스트 L8837-8906), ASP.NET Core in Action 12장 "Managing changes with migrations" (텍스트 L15478-15625)

**핵심 설명**
- DB에는 데이터가 있어서 배포할 때마다 DB를 통째로 갈아엎을 수 없다. 그래서 스키마 변경을 코드와 함께 버전으로 관리하는 것이 좋은 관행이다. EF Core의 방식이 마이그레이션이며, 데이터 모델이 어떻게 바뀌었는지 기록하는 C# 코드 파일이다(ASP.NET Core in Action).
- 흐름(Web API Development with ASP.NET Core 8): (1) `dotnet tool install --global dotnet-ef` (2) `dotnet ef migrations add 이름`으로 `Up()`/`Down()`이 든 마이그레이션 파일 생성. 이 시점엔 DB가 바뀌지 않는다 (3) `dotnet ef database update`로 DB에 적용. 적용 이력은 `__EFMigrationsHistory` 테이블에 기록되며 직접 수정하지 않는다. `database update`는 앱을 빌드하고, 연결 문자열의 DB가 없으면 만들고, 아직 적용되지 않은 마이그레이션을 적용한다(ASP.NET Core in Action). 생성된 마이그레이션 파일은 적용 전에 열어서 무슨 일을 하는지 확인하라고 권한다(ASP.NET Core in Action).
- `add`는 현재 모델과 마지막 마이그레이션 때 저장된 스냅샷(`...ModelSnapshot.cs`)을 비교해 차이를 코드로 만든다. 스냅샷 덕분에 DB에 직접 접속하지 않아도 이전 상태를 알 수 있다(Entity Framework Core in Action, ASP.NET Core in Action).
- 마이그레이션 파일을 함부로 수정·삭제하면 안 된다. 되돌리려면 `dotnet ef migrations remove`를 쓴다(Web API Development with ASP.NET Core 8). 복잡한 변경(데이터가 사라지는 변경 등)은 표준 마이그레이션을 검토한 뒤 직접 고쳐야 할 때가 있다(Entity Framework Core in Action).
- 컬럼·테이블 삭제 같은 변경은 데이터를 잃을 수 있다. 롤백해도 테이블은 다시 만들어지지만 지워진 데이터는 영영 돌아오지 않는다(ASP.NET Core in Action, Entity Framework Core in Action).
- 운영 DB에 적용하는 방법(Entity Framework Core in Action): 앱 시작 시 `Database.Migrate()` 호출, CI/CD에서 적용, 별도 앱으로 적용, SQL 스크립트 추출 후 적용. 가장 쉬운 것이 시작 시 적용이다. 배포하면 새 앱이 시작될 때 자동으로 적용되어 잊을 일이 없지만, 서버를 여러 대로 늘리는 환경(scaling out)에는 맞지 않는 한계가 있다. Entity Framework Core in Action은 Microsoft가 SQL 명령으로 운영 DB를 갱신하는 방식을 가장 견고하다고 권한다고 밝힌다. 시작 시 마이그레이션에서 행이 수만 개인 데이터를 EF Core로 갱신하다가 앱 시작이 너무 늦어 Azure가 타임아웃시킨 사례도 소개한다.
- 시작 시 마이그레이션 코드는 예외가 나면 로그를 남기고 다시 던져(`throw`) 앱이 계속 뜨지 않게 하는 것이 책의 예다(Entity Framework Core in Action). 시드 데이터는 마이그레이션(`HasData`)으로 넣거나 마이그레이션 뒤 코드로 넣을 수 있다(Entity Framework Core in Action).

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add InitialDb      # 마이그레이션 파일만 생성
dotnet ef database update               # DB에 실제 적용
```

```csharp
using Microsoft.EntityFrameworkCore;

public static class DbMigrationExtensions
{
    // Program.cs에서: var app = builder.Build(); await app.MigrateDatabaseAsync();
    public static async Task MigrateDatabaseAsync(this IHost host)
    {
        using var scope = host.Services.CreateScope();                 // 스코프를 직접 만든다
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        await db.Database.MigrateAsync();                              // 미적용 마이그레이션 적용
    }
}
```

**방치형 RPG 서버에서는**: 새 기능(예: 장비 슬롯)을 추가하면 엔티티 수정 -> `migrations add` -> 테스트 DB에서 검증 -> 운영 적용 순서로 간다.

> 🔧 보충(책 외): 운영 DB에서는 자동 마이그레이션을 서버 여러 대가 동시에 실행할 수 있어 주의해야 한다(책도 "여러 인스턴스에서는 한계"라고 언급한다). 게임 서버라면 배포 파이프라인에서 적용하는 방식을 고려한다.

---


## 코어 5. 방어 — 동시 수정은 동시성 토큰, 반복 요청은 멱등성 키 + 유니크 제약

> 원래 4장의 8절 "동시성 충돌"과 12절 "중복 요청 막기". 재화 이중 처리는 "무엇이 겹쳐서 생기는 사고인가"로 나눈다. **동시에** 같은 행을 고치면 동시성 토큰(5.1), **시간 차를 두고 같은 요청이 다시** 오면 멱등성 키와 유니크 제약(5.2), 한 작업의 **일부만** 반영되면 트랜잭션·`SaveChanges` 한 번(3.3)이다. C++ TCP 서버에서는 한 유저를 한 세션이 소유하고 한 연결 안에서는 패킷이 중복되지 않아 덜 드러나던 문제가, HTTP에서는 기본으로 생긴다.

### 5.1 동시성 충돌 (재화·아이템 동시 수정)
**한 줄 요약:** 두 요청이 같은 행을 동시에 고치면 한쪽 결과가 조용히 사라지는데, 버전 열(동시성 토큰)로 이를 감지해 예외로 만든다.

> 📖 출처: Web API Development with ASP.NET Core 8 7장 "Understanding concurrency conflicts" (텍스트 L11744-11992)

**핵심 설명**
- 문제 상황(Web API Development with ASP.NET Core 8의 재고 예제): 재고 15개에서 클라이언트 A와 B가 거의 동시에 10개를 판다. 둘 다 "15개니까 충분하다"고 확인한 뒤 각자 `15 - 10 = 5`로 저장한다. 실제로는 20개를 팔았는데 재고는 5개가 되어 데이터가 틀어진다. 두 요청 모두 성공 응답을 받는다.
- 해결 방식 두 가지(Web API Development with ASP.NET Core 8): **비관적 제어**는 DB 잠금으로 다른 클라이언트의 수정을 막는다. 잠금 관리 비용이 커서 동시 접속이 많으면 성능 문제가 생길 수 있고, EF Core는 이를 기본 지원하지 않는다. **낙관적 제어**는 잠금 없이 버전 열로 충돌을 감지한다. EF Core는 이쪽을 지원한다.
- 낙관적 제어의 동작: EF Core가 `UPDATE ... WHERE Id = @id AND RowVersion = @원래값`을 보낸다. 그 사이 누가 고쳐서 버전 값이 달라졌다면 0행이 갱신되고 EF Core가 `DbUpdateConcurrencyException`을 던진다(Web API Development with ASP.NET Core 8은 SQL Server에서 이 WHERE 절을 확인했다).
- 토큰 종류: (1) DB가 자동 관리하는 `rowversion`(SQL Server): `[Timestamp] byte[]` 또는 `IsRowVersion()`. 수정할 때 값을 직접 갱신할 필요가 없다. 다만 이 타입은 SQL Server용이며, SQLite 같은 다른 DB는 지원하지 않을 수 있으니 DB 문서를 확인해야 한다. (2) 앱이 관리하는 토큰: `[ConcurrencyCheck] Guid Version` 또는 `IsConcurrencyToken()`. SQL Server에서도 쓸 수 있지만 엔티티를 수정할 때마다 `Version = Guid.NewGuid()`처럼 새 값을 직접 넣어야 한다.
- 충돌이 나면 예외를 잡아 로그를 남기고 `409 Conflict`를 돌려주어 클라이언트가 결과를 보고 다시 시도하게 한다(Web API Development with ASP.NET Core 8).
- 격리 수준(SQL Server는 ReadUncommitted, ReadCommitted, RepeatableRead, Serializable, 기본은 ReadCommitted)은 높을수록 일관성이 좋지만 동시성이 떨어진다. 책은 이 정도만 소개하고 자세한 내용은 다루지 않는다(Web API Development with ASP.NET Core 8).

```csharp
using Microsoft.EntityFrameworkCore;

// 1.1절의 Player에는 [Timestamp] byte[]? RowVersion 이 있다.
public static class GoldSpender
{
    public static async Task<IResult> SpendAsync(GameDbContext db, int playerId, long cost)
    {
        var player = await db.Players.FindAsync(playerId);
        if (player is null) return Results.NotFound();
        if (player.Gold < cost) return Results.BadRequest("골드가 부족합니다.");

        player.Gold -= cost;
        try
        {
            await db.SaveChangesAsync();   // UPDATE ... WHERE Id=@id AND RowVersion=@old
        }
        catch (DbUpdateConcurrencyException)
        {
            // 그 사이 다른 요청이 같은 플레이어를 수정했다. 로그를 남기고 재시도를 유도.
            return Results.Conflict("동시에 변경되었습니다. 다시 시도해 주세요.");
        }
        return Results.Ok(player.Gold);
    }
}
```

**방치형 RPG 서버에서는**: 같은 계정의 골드 소모, 아이템 사용, 보상 수령은 여러 기기·재시도로 동시에 들어올 수 있다. 버전 열이 없으면 골드가 복사되거나 아이템이 이중 지급될 수 있다.

> 🔧 보충(책 외): 위 게임 시나리오(골드·보상 이중 처리)는 책의 재고 예제를 게임에 옮긴 해석이다. 또 다른 방법으로 `Where(p => p.Id == id && p.Gold >= cost).ExecuteUpdateAsync(...)`처럼 조건과 차감을 한 SQL로 처리해 반환된 행 수로 성공 여부를 판단할 수 있다(책은 ExecuteUpdate를 일괄 처리용으로만 소개하며 2.2절 참고).
>
> 🔧 보충(책 외, SQLite로 직접 실행해 확인): (1) 위 `Player`처럼 `[Timestamp] byte[]`만 붙이고 SQLite를 쓰면 `RowVersion`이 채워지지 않고(null) 쿼리가 `WHERE Id = @id AND RowVersion IS NULL`로 나가서, 두 요청이 같은 골드 100에서 70씩 차감해도 예외 없이 둘 다 성공하고 골드가 30이 됐다. 즉 이 방식은 SQL Server처럼 `rowversion`을 자동 관리하는 DB에서만 보호가 된다(SQL Server에서는 실행해 보지 못했고 Web API Development with ASP.NET Core 8의 설명을 따른 것이다). (2) 같은 실험을 `[ConcurrencyCheck] Guid Version`으로 하고 저장 전에 `Version = Guid.NewGuid()`를 넣었더니 두 번째 요청에서 `DbUpdateConcurrencyException`("expected to affect 1 row(s), but actually affected 0")이 났고 골드는 30으로 남았다. 반대로 `Version`을 새 값으로 바꾸지 않으면 충돌을 전혀 감지하지 못했다. (3) `Where(p => p.Id == id && p.Gold >= 70).ExecuteUpdateAsync(...)`를 두 번 연속 실행하니 갱신된 행이 각각 1, 0이었다(잔액 부족이면 0행). 이 방식은 추적 중인 엔티티에는 반영되지 않는다.

### 5.2 중복 요청 막기: 멱등성 키와 유니크 제약
**한 줄 요약:** 모바일 클라이언트는 같은 요청을 두 번 보낼 수 있으므로, 요청마다 고유 ID(멱등성 키)를 받아 "이미 처리한 요청이면 지난 결과만 돌려준다"로 만들고, 마지막 방어선은 DB의 유니크 제약에 맡긴다.

> 📚 참고(doc, 책 외): Node.js Complete Guide 29장 29.5 "멱등성과 메시징 복원력"(방법 2: 멱등성 키와 처리 기록 테이블, 방법 3: 유니크 제약), C# Complete Guide vol2 43장 "재시도와 멱등성". 이 절 전체가 11권 밖의 보강 내용이다.

**핵심 설명**
- **중복은 반드시 생긴다**: 서버는 보상을 지급하고 응답을 보냈는데 지하철에서 응답이 사라지면, 클라이언트는 실패로 알고 다시 보낸다. 버튼 연타, 앱의 자동 재시도도 같다. 5.1절의 동시성 토큰은 "동시에 고친 것"을 잡지만, **시간 차를 두고 다시 온 같은 요청**은 정상 요청처럼 보여서 막지 못한다.
- **멱등(idempotent)**: 같은 요청을 여러 번 보내도 결과가 한 번 보낸 것과 같은 성질이다([제7부](07_제7부_웹_API_기초.md)의 멱등 설명). `Gold = 500`(값으로 덮어쓰기)은 멱등하지만 `Gold += 100`(더하기)은 멱등하지 않다. 보상 수령·구매는 본질적으로 "더하기"라 별도 장치가 필요하다.
- **멱등성 키 방식**: 클라이언트가 행동 하나마다 `Guid` 같은 고유 ID를 만들어 보내고(예: `Idempotency-Key` 헤더), 재시도할 때는 **같은 ID를 다시** 보낸다. 서버는 처리한 ID와 그 결과를 테이블에 기록하고, 이미 있는 ID면 아무것도 바꾸지 않고 기록된 결과를 돌려준다.
- **기록과 지급은 같은 트랜잭션으로**: "골드 지급"과 "처리 기록 추가"를 한 번의 `SaveChanges`(3.3절)로 저장한다. 따로 저장하면 "지급은 했는데 기록은 못 한" 틈으로 중복이 새어 나간다.
- **"조회 후 추가"만으로는 부족하다**: 같은 ID의 요청 두 개가 거의 동시에 오면 둘 다 "기록 없음"을 보고 둘 다 지급할 수 있다. `(PlayerId, RequestId)`에 **유니크 인덱스**를 걸어 두면 DB가 두 번째 저장을 거부(`DbUpdateException`)하고, 그 트랜잭션의 지급도 함께 취소된다. 정확성을 코드가 아니라 스키마에 새기는 것이다.

```csharp
using Microsoft.EntityFrameworkCore;

// 처리 기록 테이블. 1.1절의 GameDbContext에 DbSet<RewardClaim>을 추가하고
// OnModelCreating에서 (PlayerId, RequestId) 유니크 인덱스를 건다.
public class RewardClaim
{
    public long Id { get; set; }
    public int PlayerId { get; set; }
    public string RequestId { get; set; } = "";   // 클라이언트가 만든 멱등성 키
    public long Reward { get; set; }              // 그때 지급한 결과(재요청 때 그대로 돌려줌)
}

// GameDbContext 안:
// public DbSet<RewardClaim> RewardClaims => Set<RewardClaim>();
// protected override void OnModelCreating(ModelBuilder modelBuilder)
//     => modelBuilder.Entity<RewardClaim>()
//            .HasIndex(c => new { c.PlayerId, c.RequestId })
//            .IsUnique();                         // 같은 플레이어의 같은 요청 ID는 한 번만

public enum ClaimStatus { Granted, Duplicate, PlayerNotFound, Conflict }

public record ClaimResult(ClaimStatus Status, long Reward = 0);

public static class RewardClaimer
{
    public static async Task<ClaimResult> ClaimAsync(
        GameDbContext db, int playerId, string requestId, long reward)
    {
        // 1) 이미 처리한 요청이면 아무것도 바꾸지 않고 지난번 결과를 돌려준다
        var done = await FindClaimAsync(db, playerId, requestId);
        if (done is not null) return new ClaimResult(ClaimStatus.Duplicate, done.Reward);

        // 2) 처음 보는 요청이면 지급 + 처리 기록을 함께 저장한다
        var player = await db.Players.FindAsync(playerId);
        if (player is null) return new ClaimResult(ClaimStatus.PlayerNotFound);
        player.Gold += reward;
        db.RewardClaims.Add(new RewardClaim { PlayerId = playerId, RequestId = requestId, Reward = reward });

        try
        {
            await db.SaveChangesAsync();   // 한 번의 SaveChanges = 한 트랜잭션(3.3절)
        }
        catch (DbUpdateConcurrencyException)
        {
            // 5.1절의 충돌: 다른 요청이 같은 플레이어를 먼저 고쳤다. 아무것도 저장되지 않았으므로
            // 클라이언트는 "같은 요청 ID로" 다시 시도하면 된다.
            // DbUpdateConcurrencyException은 DbUpdateException의 자식이라 반드시 먼저 잡는다.
            db.ChangeTracker.Clear();
            return new ClaimResult(ClaimStatus.Conflict);
        }
        catch (DbUpdateException)
        {
            // 같은 요청 ID가 동시에 들어와 다른 쪽이 먼저 저장했다(유니크 제약 위반).
            // 이 요청의 지급도 함께 취소되었다. 실패한 변경을 추적에서 지우고 먼저 저장된 결과를 돌려준다.
            db.ChangeTracker.Clear();
            done = await FindClaimAsync(db, playerId, requestId);
            if (done is not null) return new ClaimResult(ClaimStatus.Duplicate, done.Reward);
            throw;                         // 유니크 위반이 아닌 다른 저장 실패
        }
        return new ClaimResult(ClaimStatus.Granted, reward);
    }

    private static Task<RewardClaim?> FindClaimAsync(GameDbContext db, int playerId, string requestId)
        => db.RewardClaims.AsNoTracking()
             .SingleOrDefaultAsync(c => c.PlayerId == playerId && c.RequestId == requestId);
}
```

```csharp
// Program.cs: 헤더의 멱등성 키를 받아 결과를 HTTP 상태 코드로 바꾼다
// using Microsoft.AspNetCore.Mvc;  ([FromHeader]에 필요)
app.MapPost("/api/rewards/daily/claim", async (
    [FromHeader(Name = "Idempotency-Key")] string requestId, GameDbContext db) =>
{
    // playerId는 실제로는 토큰의 클레임에서 꺼낸다(제11부)
    var result = await RewardClaimer.ClaimAsync(db, playerId: 1, requestId, reward: 100);
    return result.Status switch
    {
        ClaimStatus.PlayerNotFound => Results.NotFound(),
        ClaimStatus.Conflict => Results.Conflict("잠시 후 같은 요청 ID로 다시 시도해 주세요."),
        _ => Results.Ok(result)   // Granted, Duplicate 모두 200과 같은 지급 결과
    };
});
```

**방치형 RPG 서버에서는**: 오프라인 보상 수령, 우편 받기, 상점 구매, 강화처럼 **재화가 늘거나 줄어드는 POST 요청**에는 멱등성 키를 받는다. 클라이언트(Unity 등)는 버튼을 누를 때 `Guid.NewGuid()`로 ID를 하나 만들고, 응답을 못 받아 재시도할 때는 새 ID가 아니라 그 ID를 그대로 보내야 한다. 같은 ID에 같은 결과가 돌아오므로 클라이언트 화면도 어긋나지 않는다.

> 🔧 보충(책 외): 위 코드를 EF Core 8 + SQLite로 실행해 확인했다. 같은 ID로 세 번 요청하면 첫 번째만 `Granted`였고 나머지 두 번은 `Duplicate`에 골드는 한 번만 늘었으며, 새 ID는 다시 지급됐다. `Idempotency-Key` 헤더가 없으면 필수 매개변수라서 `400`이 났다. 저장 직전에 같은 ID 기록을 다른 연결로 먼저 넣어 "동시에 들어온 두 요청"을 흉내 내자, 유니크 제약 위반이 나서 이 요청의 지급은 취소되었고 먼저 저장된 결과가 `Duplicate`로 돌아왔다(골드는 한 번만 증가). `Conflict` 경로는 SQL Server의 `rowversion`이 있어야 일어나므로 실행해 보지 못했다(5.1절 보충 참고). `DbUpdateException`은 유니크 위반 외의 저장 실패에도 나므로, 위 코드는 다시 조회해 기록이 있을 때만 중복으로 판단하고 그 밖의 경우는 예외를 다시 던진다. 저장에 실패한 `DbContext`에는 실패한 변경이 남아 있으므로 `ChangeTracker.Clear()`로 지운 뒤에 계속 쓴다. 처리 기록은 계속 쌓이므로 보관 기간(예: 며칠)을 정해 백그라운드 작업([제12부](12_제12부_백그라운드_서비스_캐시_외부호출.md))으로 지운다. 멱등성 키는 "같은 요청의 반복"을 막을 뿐, 서로 다른 요청이 같은 재화를 동시에 고치는 문제는 여전히 5.1절의 동시성 토큰이 맡는다.

---


## 실무 적용

### 체크리스트
- [ ] 실제로 나가는 SQL을 로그로 확인했다. C#에서는 되지만 DB로 번역되지 않는 코드(사용자 정의 메서드를 `Where`에, 식 본문 속성으로 `OrderBy`)가 없다. → 코어 1·2
- [ ] 문자열 길이·enum 저장 방식·인덱스를 엔티티마다 명시했고(`nvarchar(max)` 기본값에 기대지 않음), 매핑을 바꿀 때마다 마이그레이션을 만들었다. → 코어 1·4
- [ ] 일대일 관계는 `HasForeignKey<종속>()`으로 종속 쪽을 명시했고, 부모 삭제 시 남겨야 할 자식(구매·우편 내역 등)은 `Restrict`로 막았다. → 코어 1
- [ ] 목록 API는 필터 → 정렬 → 페이징 → `Select`(DTO) → 실행 순서이고, 읽기 전용 조회에는 `AsNoTracking`을 붙였다. `AsEnumerable()`/`ToList()`를 `Where` 앞에 두지 않았다. → 코어 2
- [ ] 자식이 많은 `Include`는 `AsSplitQuery()` 또는 `Select`로 바꿨다. → 코어 2
- [ ] `ExecuteUpdate`/`ExecuteDelete` 뒤에는 이미 로드된 객체와 `Find` 결과가 옛 값일 수 있음을 고려했다. → 코어 2
- [ ] 재화·레벨 값은 클라이언트에서 받지 않고, ID만 받아 서버가 다시 조회해 계산한다(`Update()`로 통째 저장하지 않음). → 코어 3
- [ ] 한 API 요청의 변경은 `SaveChanges` 한 번으로 저장하고, 비즈니스 로직은 `SaveChanges`를 직접 부르지 않는다. 여러 번 저장해야 할 때만 `BeginTransactionAsync` → `CommitAsync`로 묶는다. → 코어 3
- [ ] `GameDbContext`는 `AddDbContext`(Scoped)로 등록했고, 싱글톤·정적 필드에 보관하거나 여러 Task가 동시에 쓰지 않는다. 백그라운드 작업은 `IServiceScopeFactory`로 스코프를 만든다. → 코어 4
- [ ] 모든 DB 호출이 async이며, 연결 문자열은 `appsettings.json`에 있다. `AddDbContextPool`은 측정 후에만 켠다. → 코어 4
- [ ] 생성된 마이그레이션 파일을 적용 전에 검토했고(특히 컬럼·테이블 삭제), 운영 적용 방식(시작 시 / CI/CD / 별도 앱 / SQL 스크립트)을 서버 대수에 맞게 골랐다. → 코어 4
- [ ] 재화가 바뀌는 엔티티에 동시성 토큰이 있고, 사용하는 DB에서 실제로 동작함을 확인했다(SQLite는 `[Timestamp]`가 채워지지 않음 → `[ConcurrencyCheck] Guid` + 매번 새 값). `DbUpdateConcurrencyException`은 로그 + 409로 응답한다. → 코어 5
- [ ] 재화가 늘거나 줄어드는 POST에는 `Idempotency-Key`를 받고, 처리 기록과 지급을 한 번의 `SaveChanges`로 저장하며, `(PlayerId, RequestId)` 유니크 인덱스를 걸었다. 처리 기록은 보관 기간 뒤 백그라운드 작업으로 지운다. → 코어 5

### 시나리오로 확인하기
1. **상황:** C++ 서버의 "DB 스레드 하나가 커넥션 하나를 계속 쓰는" 구조를 흉내 내어 `GameDbContext`를 싱글톤으로 등록하고 모든 요청이 공유하게 했다. 부하 테스트에서 간헐적으로 예외가 나고, 다른 요청에서 고친 엔티티가 엉뚱한 요청의 `SaveChanges`에 섞여 저장된다.
   **질문:** 원인은 무엇이고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `DbContext`는 스레드에 안전하지 않아서 같은 인스턴스를 여러 작업이 동시에 쓰면 예외가 난다. 또 `DbContext`는 읽은 엔티티를 계속 추적하므로, 공유하면 한 요청이 고친 변경이 다른 요청의 `SaveChanges`에 함께 실려 나간다. `AddDbContext`로 등록해 Scoped(요청당 1개, 요청 끝에 Dispose)로 쓰고, 백그라운드 작업은 `IServiceScopeFactory`로 스코프를 직접 만들어 매번 새 인스턴스를 얻는다. 처리량이 정말 높으면 공유가 아니라 `AddDbContextPool`(반납 시 상태 초기화)을 측정 후 쓴다. → 코어 4 (4.1)

   </details>

2. **상황:** "강화" API를 C++ 서버의 습관대로 단계마다 바로 저장하도록 짰다: 재료 아이템 삭제 → `SaveChangesAsync()` → 골드 차감 → `SaveChangesAsync()` → 강화 결과 반영 → `SaveChangesAsync()`. 두 번째 저장 직후 예외가 나자 "재료와 골드는 사라졌는데 강화는 안 됐다"는 문의가 들어왔다.
   **질문:** 무엇이 잘못됐고 어떻게 바꿔야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `SaveChanges`는 한 번이 하나의 트랜잭션이다. 세 번 나눠 부르면 세 개의 트랜잭션이 되어 앞의 두 개는 이미 확정된다. 변경을 모두 마친 뒤 끝에서 `SaveChanges`를 한 번만 부르면 하나라도 실패할 때 전부 취소된다(Unit of Work). 로직은 `SaveChanges`를 직접 부르지 않고 실행 담당이 오류가 없을 때만 호출하는 구조(3.2)가 이를 자연스럽게 강제한다. 앞 단계가 저장한 값을 다음 단계가 읽어야 해서 꼭 여러 번 저장해야 한다면 `BeginTransactionAsync`로 묶고 모두 성공했을 때만 `CommitAsync`한다(`Commit` 없이 `using`이 끝나면 롤백). → 코어 3 (3.1, 3.2, 3.3)

   </details>

3. **상황:** 한 유저가 폰과 태블릿으로 같은 계정에 동시에 접속해 상점 구매를 연타했더니 골드 100에서 70짜리 상품을 두 번 샀는데 골드가 30으로 남았다. C++ 서버에서는 한 유저의 데이터를 한 세션만 고쳐서 이런 일이 없었다. 개발 환경은 SQLite이고 `Player`에는 `[Timestamp] byte[] RowVersion`이 있다.
   **질문:** 왜 동시성 토큰이 있는데도 막지 못했고, 어떻게 해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   HTTP 서버에는 세션 단일 소유가 없어서 같은 플레이어의 요청이 동시에 처리된다. 두 요청이 모두 "100이니까 충분"을 보고 각자 30으로 저장하면 한쪽 결과가 조용히 사라진다(lost update). 낙관적 동시성은 `UPDATE ... WHERE Id = @id AND RowVersion = @원래값`이 0행이면 `DbUpdateConcurrencyException`으로 이를 잡는데, `[Timestamp]`(rowversion)는 SQL Server가 자동 관리하는 타입이라 SQLite에서는 값이 null로 남고 `RowVersion IS NULL` 조건으로 나가 충돌을 감지하지 못했다. SQLite라면 `[ConcurrencyCheck] Guid Version`을 쓰고 수정할 때마다 `Version = Guid.NewGuid()`를 넣는다. 또는 `Where(p => p.Id == id && p.Gold >= cost).ExecuteUpdateAsync(...)`로 조건과 차감을 한 SQL로 처리해 갱신 행 수(1/0)로 판단한다. 충돌은 로그 + `409 Conflict`로 응답한다. 트랜잭션만으로는 해결되지 않는다(읽고 쓰는 두 단계는 그대로다). → 코어 5 (5.1), 코어 3 (3.3)

   </details>

4. **상황:** 일일 보상 API에 동시성 토큰을 잘 걸었다. 그런데 지하철에서 보상을 받은 유저가 "실패" 화면을 보고 다시 눌렀더니 보상이 두 번 들어왔다.
   **질문:** 동시성 토큰이 왜 이 경우를 못 막았고, 무엇을 추가해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   서버는 첫 요청을 정상 처리하고 저장까지 끝냈다. 응답만 유실됐을 뿐이므로, 두 번째 요청은 시간 차를 두고 온 새 요청이고 그 사이 다른 수정과 겹치지 않아 동시성 토큰에는 아무 문제가 없다. 보상 수령은 `Gold += 100`(더하기)이라 멱등하지 않다. 클라이언트가 행동마다 `Guid`로 멱등성 키를 만들어 `Idempotency-Key` 헤더로 보내고 재시도 때 같은 키를 다시 보내게 한다. 서버는 지급과 처리 기록(`RewardClaim`)을 한 번의 `SaveChanges`로 저장하고, 이미 기록된 키면 아무것도 바꾸지 않고 지난 결과를 돌려준다. 같은 키 두 요청이 거의 동시에 오는 경우를 위해 `(PlayerId, RequestId)` 유니크 인덱스를 걸어 두 번째 저장을 DB가 거부(`DbUpdateException`)하게 한다. C++ 서버의 패킷 시퀀스 번호와 달리 이 기록은 서버 메모리가 아니라 DB에 있어야 한다. → 코어 5 (5.2)

   </details>

5. **상황:** 랭킹 API가 출시 초기에는 빨랐는데 유저가 늘자 응답이 수 초로 늘고 서버 메모리가 치솟는다. 코드는 `db.Heroes.AsEnumerable().Where(h => h.Level >= minLevel).OrderByDescending(h => h.Level).Take(20).ToList()`이고, 다른 목록 API는 `Include(p => p.Heroes)`로 플레이어마다 영웅 수천 개를 함께 읽는다.
   **질문:** 각각 무엇이 문제이고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `AsEnumerable()`을 먼저 부르면 그 뒤의 `Where`/`OrderBy`/`Take`가 SQL에 들어가지 않아 테이블 전체를 메모리로 읽은 뒤 C#에서 거른다(로그에 `ORDER BY`/`OFFSET`이 빠진 SQL이 보인다). `IQueryable` 상태에서 필터 → 정렬 → 페이징을 이어 붙이고 마지막에 `ToListAsync()`로 실행하며, 읽기 전용이므로 `AsNoTracking()`을 붙인다. `Include`는 조인 때문에 중복 데이터가 커지므로 자식이 수백~수천 건이면 목록에 부적합하다. `Select`로 필요한 열만 DTO로 뽑거나, `AsSplitQuery()`로 나눈다(왕복 증가·쿼리 사이 데이터 어긋남 주의). → 코어 2 (2.1, 2.2)

   </details>

---


## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
제10부 EF Core — 한 문장: 모델 → 조회 → 쓰기(SaveChanges 한 번 = ____) → 수명·운영 → 방어 3종
├─ 코어 1 모델
│   ├─ ORM: 테이블 = ____, 열 = ____, 행 = ____, WHERE = ____
│   ├─ DbContext 역할: 연결 유지 / ( ? ) / 트랜잭션 / 저장
│   ├─ 매핑 3단: 규칙 → ( ? ) → Fluent API (충돌 시 ____ 이 이김)
│   └─ 관계: 1:N / 1:1(____ 명시) / N:M(____ 자동 생성)
│        삭제: Cascade / ClientSetNull / ____ (부모 삭제 막기)
├─ 코어 2 조회
│   ├─ 쿼리 3부분: DbSet → LINQ 연산 → ( ? )
│   ├─ 한 건 찾기: Find / Single / SingleOrDefault / First / FirstOrDefault
│   ├─ 로딩 4종: Eager / ( ? ) / Select / ( ? )
│   └─ 추적 vs ____ / IQueryable vs ____ / ExecuteUpdate(____ 불필요, 로드된 객체는 옛 값)
├─ 코어 3 쓰기
│   ├─ 상태 5종: Added, ____, Modified, Deleted, ____
│   ├─ 연결 끊긴 수정: (1) ____ 후 속성만 변경  (2) Update로 통째 저장
│   ├─ 로직 분리: 순수 로직(DB 모름) + 실행 담당(____ 한 번)
│   └─ 트랜잭션: BeginTransaction → SaveChanges × n → ____ (없이 using 종료 = ____)
├─ 코어 4 수명과 운영
│   ├─ DI: AddDbContext = ( ? ) 수명 / 백그라운드 = ____ / async / AddDbContextPool(측정 후)
│   └─ 마이그레이션: migrations add(파일만) → ( ? ) / 스냅샷 / 운영 적용 4방법
└─ 코어 5 방어
    ├─ 동시성: 비관적(잠금) vs 낙관적(UPDATE ... WHERE RowVersion=@old → 0행 → ____ → 409)
    └─ 멱등성: 키 기록 + 지급을 ____ 으로 / 최후 방어선 = ____
```

### 2. 인출 질문

1. ORM은 DB의 무엇을 C#의 무엇에 대응시키나요? EF Core가 DB를 "너무 잘 감춘다"는 단점은 무엇이고 어떤 습관으로 보완하나요?

   <details markdown="1"><summary>답 확인</summary>

   테이블 = 클래스, 열 = 속성, 행 = 객체, SQL `WHERE` = LINQ `Where`에 대응한다. 단점은 C#에서는 되지만 DB로 번역되지 않는 코드(예: 식 본문 속성 `FullName`으로 `Where`/`OrderBy`)를 쉽게 쓴다는 것이다. 그래서 실제로 나가는 SQL을 로그로 확인하는 습관이 중요하다. → 코어 1 (1.1)

   </details>

2. 매핑의 세 방법(규칙, 데이터 어노테이션, Fluent API)은 어떤 관계인가요? 같은 속성을 두 방식에서 설정하면 어느 쪽이 이기나요?

   <details markdown="1"><summary>답 확인</summary>

   아무 설정이 없으면 규칙으로 매핑되고(`Id`/`<클래스명>Id`는 기본 키, 테이블 이름은 `DbSet` 속성 이름 등), 필요한 부분만 어노테이션이나 Fluent API로 덮어쓴다. 어노테이션은 이해하기 쉽지만 모델 클래스가 DB 설정으로 오염된다. 둘이 충돌하면 Fluent API가 이기며 책은 Fluent API를 권장한다. 엔티티가 많으면 `IEntityTypeConfiguration<T>`로 나누고 `ApplyConfigurationsFromAssembly`로 적용한다(적용 순서는 통제 불가). → 코어 1 (1.2)

   </details>

3. 일대일 관계에서 `HasForeignKey<종속>()`을 명시해야 하는 이유는? 일대다 컬렉션을 통째로 교체할 때 `Include` 없이 하면 어떻게 되나요?

   <details markdown="1"><summary>답 확인</summary>

   일대일은 양쪽 모두 참조 속성이라 외래 키를 명시하지 않으면 EF Core가 종속 쪽을 마음대로 고를 수 있다. 관계를 갱신할 때는 기존 관계를 먼저 로드해야 한다. 컬렉션 교체 시 `Include`로 로드하지 않으면 옛 항목이 지워지지 않고 남아 새 항목과 합쳐진다(로드하면 외래 키가 null 불가일 때 옛 항목이 삭제된다). 반대로 외래 키만 바꿔 관계를 옮기면 부모와 컬렉션을 로드하지 않아도 되어 유리하다. → 코어 1 (1.3)

   </details>

4. 부모 엔티티를 지울 때 자식은 어떻게 되나요? `Cascade`, `ClientSetNull`, `Restrict`를 구분해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   외래 키가 null 불가인 필수 관계는 기본이 연쇄 삭제(`Cascade`)라 부모를 지우면 자식도 지워진다. 외래 키가 null 가능하면 `ClientSetNull`로 자식의 외래 키를 null로 바꿀 수 있다. 주문 내역처럼 남겨야 하는 자식이 있으면 `Restrict`로 부모 삭제를 막는다. 둘 다 아니면 DB가 오류를 낸다. Web API 책은 DB가 연쇄 삭제를 지원하지 않을 수 있어 `ClientCascade`/`ClientSetNull`을 권한다. → 코어 1 (1.3)

   </details>

5. EF Core 쿼리의 세 부분은 무엇이고, SQL은 언제 실제로 나가나요? 필터·정렬·페이징은 어디에 두어야 하나요?

   <details markdown="1"><summary>답 확인</summary>

   (1) `DbSet` 접근 (2) `Where`/`OrderBy`/`Skip`/`Take` 같은 LINQ 연산 (3) 실행 메서드(`ToList`, `First`, `Count`, `foreach` 등). 실행 전까지는 식 트리로만 쌓여 있다가 실행 메서드에서 SQL이 나간다. 필터·정렬·페이징을 실행 메서드 앞에 두어야 DB 안에서 처리되고, 페이징에는 정렬이 꼭 필요하다. → 코어 2 (2.1)

   </details>

6. `Find`, `Single`, `SingleOrDefault`, `First`, `FirstOrDefault`는 0건·여러 건일 때 각각 어떻게 동작하나요?

   <details markdown="1"><summary>답 확인</summary>

   `Find`는 기본 키로 찾고 이미 추적 중이면 DB에 가지 않으며 없으면 null이다. `Single`은 정확히 1건이어야 하고 0건·2건 이상이면 예외, `SingleOrDefault`는 0건이면 null, 2건 이상이면 예외다. `First`는 여러 건이어도 첫 번째를 주고 0건이면 예외, `FirstOrDefault`는 0건이면 null이다. `Find`/`...OrDefault` 계열은 null 체크를 잊지 않는다. → 코어 2 (2.1)

   </details>

7. 관련 데이터를 불러오는 네 가지 방법과 각각의 대가를 말해 보세요. `Include`가 부담스러울 때는 어떻게 하나요?

   <details markdown="1"><summary>답 확인</summary>

   Eager(`Include`/`ThenInclude`, 한 번에 효율적이지만 필요 없는 데이터까지 읽음), Explicit(`Entry(x).Collection(...).Load()`, 나중에 읽지만 DB 왕복 증가), Select(필요한 열만 DTO로, 열마다 코드 작성), Lazy(접근 시 자동 조회, `virtual`+`UseLazyLoadingProxies` 필요, DB 접근이 많아 성능에 나쁨). 자식이 많아 조인 중복이 커지면 `AsSplitQuery()`로 나누거나 Include를 안 쓴다. 나누면 왕복이 늘고 쿼리 사이에 데이터가 바뀌면 어긋날 수 있다. → 코어 2 (2.1)

   </details>

8. 추적/비추적 쿼리, `IQueryable`/`IEnumerable`, 서버/클라이언트 평가를 각각 한 줄로 구분해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   추적 쿼리(기본)는 수정·저장이 가능하지만 메모리와 시간이 들고, `AsNoTracking`은 빠르고 가볍지만 수정해도 저장에 반영되지 않아 GET 조회에 적합하다. `IQueryable`인 동안은 `Where`/`OrderBy`/`Skip`/`Take`가 SQL로 합쳐지지만, `AsEnumerable()`을 먼저 부르면 전체를 메모리로 읽은 뒤 C#에서 거른다. 사용자 정의 C# 메서드는 DB로 번역되지 않으므로 마지막 `Select`에만 쓰고, `Where`에 쓰면 EF Core 3.0 이후 예외가 난다. → 코어 2 (2.2)

   </details>

9. `ExecuteUpdate`/`ExecuteDelete`의 특징과 주의점은? 이 방식에서 `Find`가 옛 값을 돌려줄 수 있는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   엔티티를 불러오지 않고 한 번의 SQL로 여러 행을 바꾸며, 추적을 거치지 않아 `SaveChanges` 없이 즉시 실행된다(EF Core 7+, 강한 타입 지원). 이미 로드된 객체는 옛 값 그대로이고, `Find`는 추적 중인 객체가 있으면 DB에 가지 않으므로 옛 값을 돌려줄 수 있다. 이때는 `Single`/`SingleOrDefault`로 DB에서 다시 읽는다. 추적 밖이라 5.1절의 동시성 예외 방식이 그대로 적용되지 않는다고 보는 것이 안전하다(보충). → 코어 2 (2.2)

   </details>

10. 엔티티 상태 다섯 가지를 말하고, 쿼리로 읽어 온 엔티티의 속성을 바꾼 뒤 `SaveChanges`를 부르면 내부에서 무슨 일이 일어나는지 설명해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    `Added`(INSERT), `Unchanged`(무시), `Modified`(UPDATE), `Deleted`(DELETE), `Detached`(추적 안 함). `AsNoTracking` 없이 읽은 엔티티는 `Unchanged`로 시작하고, 속성을 바꾸면 `SaveChanges` 안의 `DetectChanges`가 처음 읽은 스냅샷과 비교해 바뀐 열만 UPDATE한다. 저장에 성공하면 엔티티는 다시 `Unchanged`가 된다. → 코어 3 (3.1)

    </details>

11. 웹의 "연결이 끊긴 수정" 두 방법을 비교하고, 게임 서버의 레벨업 API는 어느 쪽이어야 하는지 이유와 함께 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    (1) 기본 키와 바꿀 값만 받아 다시 조회한 뒤 그 속성만 고친다: 데이터가 적고, 클라이언트가 값을 조작하지 못해 안전하지만 복사 코드를 써야 한다. (2) 전체 데이터를 받아 `Update`로 저장한다: 다시 읽지 않아 빠르지만 모든 열이 UPDATE되고 보내는 쪽을 믿어야 한다. 레벨업은 영웅 ID만 받고 서버가 다시 조회해 계산하는 (1)이어야 값 조작을 막을 수 있다. → 코어 3 (3.1)

    </details>

12. `SaveChanges`를 작업 끝에 한 번만 부르라는 원칙의 근거는 무엇인가요?

    <details markdown="1"><summary>답 확인</summary>

    `SaveChanges` 한 번은 DB 트랜잭션 안에서 실행되어, 생성·수정·삭제가 섞여 있어도 하나라도 거부되면 전부 거부되는 단위(Unit of Work)가 된다. 끝에서 한 번 부르면 "골드 차감 + 아이템 지급" 같은 작업이 함께 반영되거나 함께 취소된다. 본문의 SQLite 실험에서도 정상 엔티티와 외래 키 위반 엔티티를 한 번에 저장하자 정상 엔티티도 저장되지 않았다. → 코어 3 (3.1, 3.3)

    </details>

13. 복잡한 비즈니스 로직을 DB 코드와 분리하는 지침에서, 로직이 `SaveChanges`를 직접 부르지 않는 이유는 무엇이고 무엇이 좋아지나요?

    <details markdown="1"><summary>답 확인</summary>

    로직은 데이터가 메모리에 있는 것처럼 작성하고(DB를 모름), 불러오기와 저장은 서비스 계층의 실행 담당이 맡아 오류가 없을 때만 `SaveChanges`를 한 번 부른다. 그래서 로직이 오류를 내면 아무것도 저장되지 않는다. 로직을 쓰고, 테스트하고, 성능을 조율하기 쉬워진다. 오류는 예외 또는 상태 객체(오류 목록)로 전달하며 책 예제는 후자를 쓴다. → 코어 3 (3.2)

    </details>

14. 명시적 트랜잭션에서 `Commit()` 없이 `using`이 끝나면 어떻게 되나요? 트랜잭션을 쓰면 동시 수정 문제도 자동으로 사라지나요?

    <details markdown="1"><summary>답 확인</summary>

    Dispose 때문에 자동으로 롤백되어 그 안의 쓰기가 모두 사라진다. `Commit()` 전까지 쓰기는 다른 DB 사용자에게 보이지 않는다. 하지만 트랜잭션이 동시 수정 문제를 자동으로 없애 주지는 않는다. 잔액 확인과 차감은 여전히 "읽고 나서 쓰는" 두 단계이므로 동시성 토큰 같은 장치가 따로 필요하다. 또 `EnableRetryOnFailure`를 쓰면 로직이 여러 번 호출될 수 있음을 고려해야 한다. → 코어 3 (3.3)

    </details>

15. `AddDbContext`가 등록하는 수명은 무엇이고, 그것이 해결하는 두 문제는? 백그라운드 작업에서는 어떻게 `DbContext`를 얻나요?

    <details markdown="1"><summary>답 확인</summary>

    Scoped다. 한 요청 안에서는 같은 인스턴스를 공유해 여러 클래스가 일을 나누고 마지막에 `SaveChanges` 한 번으로 저장할 수 있고, 요청마다 새로 만들어 스레드에 안전하지 않은 `DbContext`를 여러 작업이 동시에 쓰는 문제를 피한다. 백그라운드에는 요청 스코프가 없으므로 `IServiceScopeFactory`로 스코프를 직접 만들어 꺼내고, 반복 실행이면 매번 새 인스턴스를 쓴다. → 코어 4 (4.1)

    </details>

16. 마이그레이션의 흐름을 명령어로 말해 보세요. `migrations add` 시점에 DB는 바뀌나요? 스냅샷 파일은 무슨 역할을 하나요?

    <details markdown="1"><summary>답 확인</summary>

    `dotnet tool install --global dotnet-ef` → `dotnet ef migrations add 이름`(`Up()`/`Down()`이 든 파일만 생성, DB는 안 바뀜) → `dotnet ef database update`(DB에 적용, 이력은 `__EFMigrationsHistory`). `add`는 현재 모델과 마지막 마이그레이션 때 저장한 스냅샷(`...ModelSnapshot.cs`)을 비교해 차이를 코드로 만든다. 그래서 DB에 접속하지 않아도 이전 상태를 안다. 되돌리기는 파일 삭제가 아니라 `migrations remove`. → 코어 4 (4.2)

    </details>

17. 운영 DB에 마이그레이션을 적용하는 방법들과, "앱 시작 시 `Database.Migrate()`" 방식의 장점과 한계는?

    <details markdown="1"><summary>답 확인</summary>

    앱 시작 시 적용, CI/CD에서 적용, 별도 앱으로 적용, SQL 스크립트 추출 후 적용이 있다. 시작 시 적용은 가장 쉽고 잊을 일이 없지만, 서버를 여러 대로 늘리는 환경에는 맞지 않고, 큰 데이터 갱신으로 시작이 늦어져 타임아웃된 사례도 있다. Microsoft는 SQL 명령으로 갱신하는 방식을 가장 견고하다고 권한다. 컬럼·테이블 삭제는 롤백해도 데이터가 돌아오지 않는다. → 코어 4 (4.2)

    </details>

18. 재고 15개에서 두 클라이언트가 거의 동시에 10개씩 팔면 무슨 일이 생기나요? 낙관적 동시성 제어는 이를 어떻게 감지하고, 서버는 어떻게 응답하나요?

    <details markdown="1"><summary>답 확인</summary>

    둘 다 "15개니까 충분"하다고 보고 각자 5로 저장해, 20개를 팔았는데 재고가 5가 되고 둘 다 성공 응답을 받는다. 낙관적 제어는 잠금 없이 `UPDATE ... WHERE Id = @id AND RowVersion = @원래값`을 보내고, 그 사이 버전이 바뀌었으면 0행이 갱신되어 `DbUpdateConcurrencyException`이 난다. 예외를 잡아 로그를 남기고 `409 Conflict`로 재시도를 유도한다. 비관적 제어(DB 잠금)는 비용이 크고 EF Core가 기본 지원하지 않는다. → 코어 5 (5.1)

    </details>

19. `[Timestamp] byte[]`와 `[ConcurrencyCheck] Guid Version`은 어떻게 다른가요? 본문의 SQLite 실험에서 드러난 함정은?

    <details markdown="1"><summary>답 확인</summary>

    `[Timestamp]`(rowversion)는 SQL Server가 값을 자동 관리하므로 수정 때 직접 갱신할 필요가 없지만, SQLite처럼 지원하지 않는 DB에서는 값이 null로 남아 `RowVersion IS NULL` 조건으로 나가 충돌을 감지하지 못했다(골드 100에서 70씩 두 번 차감이 모두 성공해 30). `[ConcurrencyCheck] Guid`는 앱이 관리하는 토큰이라 수정할 때마다 `Version = Guid.NewGuid()`를 직접 넣어야 하며, 넣으면 충돌이 감지되고 안 넣으면 전혀 감지되지 않았다. → 코어 5 (5.1 보충)

    </details>

20. 동시성 토큰이 있어도 멱등성 키가 따로 필요한 이유는? "이미 처리했는지 조회 후 추가"만으로 부족한 이유와, 마지막 방어선은 무엇인가요?

    <details markdown="1"><summary>답 확인</summary>

    동시성 토큰은 "동시에 고친 것"만 잡고, 응답을 못 받아 시간 차를 두고 다시 온 같은 요청은 정상 요청처럼 보여 막지 못한다. 그래서 클라이언트가 행동마다 고유 ID를 보내고(재시도 때 같은 ID), 서버는 지급과 처리 기록을 한 번의 `SaveChanges`로 저장한다. 같은 ID 두 요청이 거의 동시에 오면 둘 다 "기록 없음"을 볼 수 있으므로 `(PlayerId, RequestId)` 유니크 인덱스가 두 번째 저장을 거부(`DbUpdateException`)하게 해 지급까지 함께 취소한다. → 코어 5 (5.2)

    </details>

21. C++ 서버에서 유저 객체를 메모리에 캐시하고 dirty 플래그로 바뀐 필드만 주기적으로 flush하던 방식과, EF Core의 변경 추적 + `SaveChanges`는 무엇이 같고 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    같은 점: 바뀐 것만 골라 UPDATE하고, 모아 둔 변경을 한 트랜잭션으로 저장한다. 다른 점: (1) dirty 플래그를 직접 세우지 않고 `DetectChanges`가 읽은 시점의 스냅샷과 비교해 자동으로 찾는다. (2) 추적은 `DbContext`가 살아 있는 요청 하나 동안만 유효하다. 세션 내내 살아 있는 캐시 객체가 아니라 요청마다 DB에서 다시 읽고 버린다. (3) 저장 시점이 타이머가 아니라 요청의 끝(응답 전)이다. (4) `AsNoTracking`으로 읽은 객체나 `ExecuteUpdate`로 바꾼 행은 추적 밖이다. → 코어 3 (3.1), 코어 2 (2.2), 코어 4 (4.1)

    </details>

22. C++ TCP 서버에서는 드물던 "같은 유저 데이터의 동시 수정"과 "같은 요청의 중복"이 HTTP 서버에서는 왜 기본으로 생기나요?

    <details markdown="1"><summary>답 확인</summary>

    TCP 서버에서는 흔히 한 유저를 한 세션(또는 그 유저를 맡은 로직 스레드)이 소유해 순서대로 처리하고, 한 연결 안에서는 TCP가 중복 없이 순서대로 전달한다. HTTP 서버에는 그런 소유자가 없어 같은 플레이어의 요청이 여러 기기·재시도로 들어와 서로 다른 스레드에서 동시에 처리되고(→ 동시성 토큰), 응답이 유실되면 클라이언트가 새 요청으로 다시 보낸다(→ 멱등성 키 + 유니크 제약). 처리 상태도 서버 메모리가 아니라 DB에 있어야 다음 요청이 볼 수 있다. → 코어 5

    </details>

### 3. 기억 고리

- **C++ 유추:** `SaveChanges` = 주기적 DB flush(모아 둔 변경을 한 트랜잭션으로). ⚠️ 깨지는 곳: flush 시점이 타이머가 아니라 **요청의 끝**이고, 변경을 담는 `DbContext`도 요청이 끝나면 버려진다. 세션 내내 살아 있는 캐시가 없다.
- **C++ 유추:** `DbContext` = DB 스레드가 쥔 커넥션 하나. ⚠️ 깨지는 곳: 전용 스레드가 없고 요청마다 새로 만들며, 여러 Task가 동시에 쓰면 예외다. 공유하려면 Scoped가 아니라 `AddDbContextPool`(측정 후).
- **C++ 유추:** 멱등성 키 = 패킷 시퀀스 번호로 중복 패킷 무시. ⚠️ 깨지는 곳: 기록이 메모리가 아니라 DB에 지급과 같은 트랜잭션으로 있어야 하고, 동시에 온 같은 키는 유니크 제약이 최종 판정한다.
- **비유:** `DbContext` = 장바구니와 계산대. 물건(변경)을 담아 두었다가 계산대(`SaveChanges`)에서 한 번에 결제하고, 하나라도 결제가 거부되면 전체가 취소된다. ⚠️ 비유가 깨지는 지점: 이 장바구니는 요청 하나가 끝나면 버려지고(Scoped), 두 사람이 동시에 밀 수 없으며(스레드 비안전), 결제 뒤에도 물건이 `Unchanged` 상태로 바구니에 남아 계속 추적된다.
- **비유:** 멱등성 키 = 영수증 번호. 같은 영수증으로는 두 번 환불받을 수 없다. ⚠️ 비유가 깨지는 지점: 영수증 번호를 서버가 아니라 클라이언트가 만들고, 재시도 때 같은 번호를 다시 보내야만 효과가 있다.
- **묶음(3의 법칙):** 재화 이중 처리 방어 3종 = **동시성 토큰**(동시 수정) / **트랜잭션·SaveChanges 한 번**(부분 반영) / **멱등성 키+유니크 제약**(반복 요청). 기준: "무엇이 겹쳐서 생기는 사고인가".
- **대칭·순서:** 추적 ↔ 비추적, `IQueryable` ↔ `IEnumerable`, 서버 평가 ↔ 클라이언트 평가, 비관적 ↔ 낙관적. 쿼리 순서는 필터 → 정렬 → 페이징 → Select → 실행, 마이그레이션 순서는 엔티티 수정 → `migrations add` → 파일 검토 → `database update`.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "같은 보상 요청이 두 번 와도 골드가 한 번만 늘게 하는 방법"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리 C++ 서버는 유저 데이터를 메모리에 들고 있다가 주기적으로 저장했는데, 왜 C# 웹 서버에서는 요청마다 DB에서 읽고 바로 저장하나? 그러면 동시성은 누가 지켜 주나?"라는 질문에 세션 소유 → 요청당 `DbContext`, flush → `SaveChanges` 한 번, 세션 직렬화 → 동시성 토큰, 시퀀스 번호 → 멱등성 키 순서로 답해 보세요.
- **랜덤 논리 게임:** A "연결 끊긴 수정은 ID와 바꿀 값만 받아 다시 조회해서 고쳐야 한다" vs B "전체 데이터를 받아 `Update`로 한 번에 저장하는 편이 낫다" — 속도·안전·코드량을 근거로 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 EF Core의 엔티티 상태와 `SaveChanges`, 동시성 토큰, 멱등성 키를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 5개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습 골격 채우기
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제11부. 인증과 보안 기초

> **🎮 게임 서버 개발자에게** — TCP 게임 서버에서는 접속 직후 로그인 패킷 한 번으로 인증하고, 그 뒤로는 "이 소켓 = 이 계정"이라는 세션 객체가 서버 메모리에 남아 모든 패킷의 주인을 알려 준다. HTTP API에는 그런 연결이 없다. 요청마다 다른 연결·다른 서버 인스턴스로 갈 수 있으므로, 요청 하나하나가 "나는 누구다"라는 증명(JWT Bearer 토큰)을 스스로 들고 와야 하고, 서버는 세션 테이블을 찾는 대신 서명을 검증한다. 그 대가로 "킥하면 즉시 끊긴다"가 사라진다. 발급한 토큰은 만료될 때까지 취소할 수 없다. 인가(이 영웅이 이 플레이어 것인가)와 입력 불신(SQL 인젝션), 남용 제한(속도 제한)은 소켓 서버에서 하던 일과 원리가 같다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 운영자가 "이 계정을 지금 당장 차단해 달라"고 한다. TCP 서버처럼 세션을 끊으면 될 줄 알았는데, 차단 뒤에도 그 계정의 API 호출이 한 시간 동안 계속 성공한다 (자체 완결형 토큰은 취소 불가 → 짧은 수명 + 리프레시 토큰).
> - 로그인한 유저가 `/api/heroes/{id}`의 숫자만 바꿔 남의 영웅을 삭제했다는 신고가 들어온다 (IDOR → 리소스 기반 인가).
> - 서버를 3대로 늘렸더니 "로그인 1분에 5번" 제한이 15번까지 뚫리고, LTE 망 유저들이 서로 엮여 429를 받는다 (속도 제한의 카운터 위치와 파티션 키).

## 코어 — 이것만은 100%

> **한 문장:** 연결에 계정을 귀속시키는 TCP 세션과 달리, HTTP API는 요청마다 서명된 JWT로 "누구인가"(`ClaimsPrincipal`)를 다시 만들고(인증, 401), 인가 미들웨어가 역할·클레임 정책과 리소스 소유 검사로 "해도 되는가"를 판단하며(인가, 403), 그 바깥은 HTTPS·매개변수화·속도 제한으로 지킨다 — 단, 이 모두는 "누가"를 보증할 뿐 "요청 내용이 정직한가"는 보증하지 않는다.

1. **인증 → 인가 파이프라인** — 인증(누구인가, 실패 시 401)이 먼저, 인가(해도 되는가, 실패 시 403)가 다음이다. 인증 미들웨어가 `HttpContext.User`를 채우고 인가 미들웨어가 엔드포인트 메타데이터(`[Authorize]`·`RequireAuthorization`)로 통과/차단한다. 순서는 라우팅 → `UseAuthentication()` → `UseAuthorization()` → 엔드포인트.
2. **JWT — 요청마다 들고 오는 서명된 신분증** — `헤더.페이로드.서명`. 서명으로 위조는 막지만 내용은 암호화되지 않아 누구나 읽는다. 서버에 세션을 두지 않는 자체 완결형이라 어느 서버든 오프라인으로 검증할 수 있지만 발급 후 취소할 수 없으므로, 수명을 짧게 하고 리프레시 토큰으로 갱신한다. 발급은 Issuer·Audience·비밀 키, 개발 중엔 `dotnet user-jwts`.
3. **인가는 점점 세밀해진다** — 역할(`Roles`, 쉼표 OR / 겹치기 AND) → 클레임 정책(`RequireClaim`·`RequireAssertion`) → 요구사항+핸들러(요구사항끼리 AND, 핸들러끼리 OR) → 리소스 기반(`IAuthorizationService`, IDOR 방어). "로그인만 확인"은 인가가 아니다.
4. **경계 방어 — 전송·입력·데이터·빈도** — HTTPS만 열기(API는 HTTP를 아예 듣지 않음, HSTS는 브라우저 전용), 입력을 SQL과 분리(LINQ/`FromSql` 보간), CORS는 브라우저 JS 규칙·비밀번호는 해시로만, 남용은 속도 제한(429, 인증 전 IP / 인증 후 플레이어 ID).

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 접속 후 로그인 패킷 1회 인증 → `Session` 객체에 `accountId` 저장, 이후 패킷은 소켓으로 주인 식별 | JWT Bearer 인증: 매 요청 `Authorization: Bearer <토큰>` → 인증 미들웨어가 `HttpContext.User` 생성 | "이 요청의 주인은 누구인가"를 핸들러 실행 전에 프레임워크 단계에서 확정해 둔다 | TCP는 연결이 신분을 기억하지만 HTTP는 요청마다 증명을 다시 내야 한다. 서버는 세션 테이블을 찾지 않고 서명만 검증하므로(무상태), 어느 인스턴스로 가도 같은 결과다 |
| 운영자 킥/밴 = 소켓 `close` + 세션 삭제 → 즉시 효과 | 자체 완결형 토큰의 취소 불가, 짧은 수명 + 리프레시 토큰 | 둘 다 "로그인 이후의 권한"을 서버가 통제하고 싶어 한다 | 이미 발급한 JWT는 `exp`까지 유효하다. 즉시 차단하려면 서버 쪽 상태(차단 목록 등)를 다시 들여와야 하고, 그만큼 무상태의 장점이 줄어든다 |
| 세션 키·인증 티켓을 패킷에 실어 보내는 방식 | Bearer 토큰 = "가진 사람이 곧 주인" | 문자열 하나가 곧 신분이다 | 소켓 세션을 가로채려면 연결 자체를 탈취해야 하지만, Bearer 토큰은 복사만 하면 어디서든 그대로 쓸 수 있다. 그래서 HTTPS 필수, URL 쿼리 금지, 짧은 수명 |
| 패킷 핸들러 안의 `if (item.ownerId != session.accountId) return;` 소유 검사 | 리소스 기반 인가(`IAuthorizationService.AuthorizeAsync`), IDOR | 요청 대상 데이터의 주인을 서버가 확인한다는 원리는 같다 | HTTP는 대상 ID가 URL에 그대로 드러나 숫자만 바꿔 보내기 쉽다. 검사를 정책·핸들러로 선언적으로 분리할 수 있다 |
| 세션별 패킷 빈도 제한(스피드핵·매크로 차단), 문자열 쿼리 조립 금지 | `AddRateLimiter`(429), 매개변수화 쿼리 | 클라이언트 입력과 빈도를 믿지 않는다 | 카운터가 프로세스 메모리에 있으면 서버 여러 대에서 합산되지 않는다(TCP는 유저가 한 서버에 붙어 있어 문제가 덜했다). 로그인 전 요청은 셀 계정이 없어 IP로 센다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. 로그인하지 않은 요청과, 로그인은 했지만 권한이 없는 요청은 각각 어떤 상태 코드를 받을까?
> 2. JWT에는 서명이 있는데, 왜 페이로드에 비밀번호나 골드 같은 값을 넣으면 안 될까? TCP 세션처럼 "로그아웃시키면 끝"이 왜 안 될까?
> 3. `/api/heroes/{id}` 삭제 API에 "로그인한 사용자만"이라는 조건만 걸면 무엇이 뚫릴까?
> 4. 모바일 앱이 클라이언트인데 HSTS를 켜면 효과가 있을까?
> 5. 서버를 3대로 늘리면 "IP당 1분에 5번" 요청 제한은 실제로 몇 번까지 허용될까?
>
> **처리법:** 🛠 실습 `AddAuthentication().AddJwtBearer(...)`, `UseAuthentication()` → `UseAuthorization()` 순서, 로그인 API의 토큰 발급 코드, `dotnet user-jwts create`, `AddAuthorizationBuilder().AddPolicy(...)`, `AddRateLimiter`/`RequireRateLimiting` → 읽자마자 직접 실행 · 🗺 관계도 인증 미들웨어 → `ClaimsPrincipal`(`HttpContext.User`) → 인가 미들웨어 → 역할 / 클레임·정책 / 요구사항·핸들러 / 리소스 기반 인가, 그리고 TCP 세션 흐름(로그인 패킷 → 세션 맵)과 나란히 그리기 · 🔗 유추 인증/인가 ≈ 공항의 여권 확인/탑승권·등급 카드 검사(책의 비유) — Bearer 토큰은 "가진 사람이 곧 주인"이고 발급 후 취소할 수 없다는 점에서 비유가 어디서 깨지는지 따져 보기 · 📦 카드로 표준 클레임(`sub`, `iss`, `aud`, `iat`, `nbf`, `exp`), 상태 코드 401·403·429(기본 503), `IDX10603`/`IDX10720`, `user-jwts` 옵션, 307 리다이렉트, 속도 제한 알고리즘 4종

---

> **학습 목표**
> 1. 인증(누구인가)과 인가(무엇을 할 수 있는가)를 구분하고, ASP.NET Core에서 각각이 어느 미들웨어에서 처리되는지 설명할 수 있다.
> 2. JWT의 구조(헤더.페이로드.서명)와 Bearer 토큰 흐름을 이해하고, 토큰을 발급·검증하는 최소 코드를 읽고 쓸 수 있다.
> 3. 역할·클레임·정책 기반 인가와 리소스 기반 인가를 구분하고, HTTPS·SQL 인젝션·IDOR 같은 기본 보안 위협의 방어 원칙과 요청 속도 제한(Rate Limiting)을 안다.

> 참고: 이 부의 예제 중 JWT를 다루는 코드는 NuGet 패키지 `Microsoft.AspNetCore.Authentication.JwtBearer`(발급 코드는 `System.IdentityModel.Tokens.Jwt`도)가 필요하다. 각 예제는 별도의 `Program.cs`라고 생각하고, 최상위 문장(Program.cs 본문)을 먼저 쓰고 타입 선언(클래스·레코드)은 그 뒤에 둔다.

> 표기 안내: `📖 출처`는 원문 위치(줄 번호는 변환 텍스트 기준), `🔧 보충(책 외)`는 책에 없는 설명, `📚 참고(doc, 책 외)`는 doc 폴더 문서를 근거로 보강한 절입니다.

> 재구성 안내: 원래 4개 장(1장 인증과 인가 → 2장 JWT → 3장 역할·정책 기반 인가 → 4장 HTTPS와 기본 보안 위협)을 네 개 코어로 다시 묶었습니다. 원래 절 → 새 위치: 1-1·1-2 → 코어 1 (1.1·1.2), 2-1 → 2.1, 2-2 → 2.3, 2-3 → 2.4 (2.2 "TCP 로그인 세션 vs JWT"는 새로 덧붙인 보충), 3-1~3-4 → 코어 3 (3.1~3.4), 4-1~4-4 → 코어 4 (4.1~4.4).

---

## 코어 1. 인증 → 인가 파이프라인

> 이 코어의 질문: "요청의 주인은 누구이고(인증), 그 주인이 이걸 해도 되나(인가)?" TCP 서버에서 로그인 패킷 처리 후 세션에 계정을 붙이던 일이 HTTP에서는 미들웨어 두 개로 나뉜다.

### 1.1 인증 vs 인가

**한 줄 요약:** 인증은 "너 누구야?"를 확인하는 것이고, 인가는 "그 사람이 이걸 해도 돼?"를 확인하는 것이다.

> 📖 출처: Web API Development with ASP.NET Core 8 8장 "Getting started with authentication and authorization" (텍스트 L12108-12137), ASP.NET Core in Action 24장 "Introduction to authorization" (텍스트 L29975-30120)

**핵심 설명**

- 두 책 모두 같은 식으로 정의한다. 인증(Authentication)은 요청을 보낸 사람이 누구인지 알아내는 과정이고, 인가(Authorization)는 그 요청한 행동이 허용되는지 판단하는 과정이다.
- 순서는 항상 인증이 먼저다. 누구인지 알아야 권한을 따질 수 있기 때문이다. 책에서는 공항에 비유한다. 여권을 보여 주고 탑승권을 받는 단계가 인증이고, 그 탑승권 번호(클레임)를 보여 주며 보안 검색대를 지나고, 마일리지 등급 카드(이것도 클레임)로 라운지에 들어가는 단계가 인가다. 책은 "탑승권 번호가 있기만 하면 되는 경우"와 "등급 클레임의 값이 Gold여야 하는 경우"를 나눠 설명한다.
- 전통적인 웹 앱은 로그인 때 받은 쿠키로 인증하지만, API 앱은 보통 쿠키 대신 요청 헤더로 인증한다(ASP.NET Core in Action 24.1). 우리가 만드는 게임 서버는 API이므로 헤더 방식(코어 2의 JWT)을 쓴다.
- 인증에 실패하면 `401 Unauthorized`, 인증은 됐지만 권한이 없으면 `403 Forbidden`이 돌아온다(Web API Development with ASP.NET Core 8 8장 예제에서 각각 확인).
- 책에서 "클레임(claim)"은 사용자에 대한 정보 한 조각으로, 타입과 값(선택)으로 이루어진다고 정의한다(ASP.NET Core in Action 24.1).

**예제 코드**

```csharp
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAuthentication().AddJwtBearer(); // 인증: 헤더의 토큰으로 "누구인지" 확인
builder.Services.AddAuthorization();                 // 인가: 규칙을 평가할 서비스

var app = builder.Build();
app.UseAuthentication(); // 먼저 인증
app.UseAuthorization();  // 그 다음 인가

// 로그인 없이 누구나 호출 가능
app.MapGet("/api/ping", () => "pong").AllowAnonymous();

// 인증된 사용자만 호출 가능 (안 되면 401)
app.MapGet("/api/heroes", () => new[] { "Knight", "Archer" }).RequireAuthorization();

// 인증 결과로 만들어진 ClaimsPrincipal을 받아서 사용
app.MapGet("/api/me", (ClaimsPrincipal user) => user.Identity?.Name ?? "unknown")
   .RequireAuthorization();

app.Run();
```

`AddJwtBearer()`를 인자 없이 호출하는 형태는 ASP.NET Core in Action 25.3의 예제와 같다. .NET 7부터는 설정 파일의 `Authentication:Schemes:Bearer` 항목(발급자·대상·서명 키)을 자동으로 읽는 규약이 있어 코드에 옵션을 적지 않아도 되며, 개발 중에는 `dotnet user-jwts`가 이 설정을 `appsettings.Development.json`에 넣어 준다(ASP.NET Core in Action 25.4, 2.4절). 이 예제는 인증/인가의 구조를 보여 주는 뼈대이고, 코드에서 검증 옵션을 직접 지정하는 방법은 2.3절에서 다룬다.

> 🔧 보충(책 외): 위 예제를 그대로 실행하면 검증에 쓸 키 설정이 없으므로 어떤 토큰도 통과하지 못한다. 설정이나 2.3절의 옵션이 있어야 실제 로그인이 동작한다.

**방치형 RPG 서버에서는**: `/api/ping`이나 로그인 API는 익명으로 열어 두고, 골드·영웅을 다루는 `/api/heroes` 같은 API는 전부 `RequireAuthorization()` 뒤에 둔다. 그 위에서 "이 영웅이 이 플레이어 것인가"를 가르는 일이 인가다.

---

### 1.2 미들웨어 순서와 ClaimsPrincipal

**한 줄 요약:** 인증 미들웨어가 요청을 "누구의 것"으로 바꿔 `HttpContext.User`에 넣고, 인가 미들웨어가 그것을 보고 통과/차단을 결정한다.

> 📖 출처: ASP.NET Core in Action 24장 "Authorization in ASP.NET Core" (텍스트 L30121-30240), ASP.NET Core in Action 25.6 (텍스트 L32769-32830), Web API Development with ASP.NET Core 8 8장 "Creating a sample project..." 중 Authorize/AllowAnonymous 설명 (텍스트 L12139-12322), Web API Development with ASP.NET Core 8 8장 "Understanding the authorization process" (텍스트 L12701-12910)

**핵심 설명**

- 인증 미들웨어는 쿠키(또는 API의 경우 Bearer 토큰)를 해석해서 `ClaimsPrincipal`을 만들고 `HttpContext.User`에 넣는다. 그 뒤의 모든 코드는 이 값을 볼 수 있다(ASP.NET Core in Action 24.2).
- 인가 미들웨어는 라우팅이 고른 엔드포인트의 메타데이터(`[Authorize]` 등)를 읽고, 규칙을 만족하지 못하면 파이프라인을 끊어 엔드포인트를 실행하지 않는다(ASP.NET Core in Action 24.2).
- 순서 규칙: `UseAuthorization()`은 라우팅과 `UseAuthentication()` 뒤, 엔드포인트 실행 앞에 있어야 한다. `WebApplication`이 자동으로 맞춰 주지만 위치를 직접 정하면 이 순서를 지켜야 한다(ASP.NET Core in Action 24.2 NOTE).
- 컨트롤러는 `[Authorize]` 특성을 클래스나 메서드에 붙이고, `[AllowAnonymous]`가 붙으면 `[Authorize]`보다 우선한다(Web API Development with ASP.NET Core 8 8장). Minimal API는 `RequireAuthorization()` / `AllowAnonymous()`를 쓰며 특성 방식과 동등하다(ASP.NET Core in Action 25.6).
- 내부적으로 인가 미들웨어 -> `IPolicyEvaluator` -> `IAuthorizationService` -> 핸들러 순으로 호출된다(Web API Development with ASP.NET Core 8 8장).

**예제 코드**

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddAuthentication().AddJwtBearer();
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

[ApiController]
[Route("api/[controller]")]
[Authorize]                       // 이 컨트롤러 전체가 인증 필요
public class HeroesController : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll() => Ok(new[] { "Knight", "Archer" });

    [AllowAnonymous]              // 이 메서드만 익명 허용
    [HttpGet("ranking")]
    public IActionResult Ranking() => Ok(new[] { "Alice", "Bob" });
}
```

**방치형 RPG 서버에서는**: 전체 컨트롤러에 `[Authorize]`를 기본으로 걸고, 랭킹 조회처럼 공개해도 되는 일부만 `[AllowAnonymous]`로 여는 "기본은 잠금" 방식이 실수를 줄인다.

> 🔧 보충(책 외): "기본은 잠금, 예외만 열기"는 실수 방지를 위한 일반적인 관행으로 덧붙인 조언이다. 책은 두 특성의 동작 규칙만 설명한다.

---

## 코어 2. JWT — 요청마다 들고 오는 서명된 신분증

> 이 코어의 질문: "연결이 신분을 기억하지 않는다면, 요청은 무엇으로 자기 주인을 증명하나?" 구조(2.1) → TCP 세션과의 차이(2.2) → 발급·검증(2.3) → 개발 중 테스트(2.4) 순서로 본다.

### 2.1 Bearer 토큰과 JWT의 구조

**한 줄 요약:** JWT는 `헤더.페이로드.서명` 세 조각을 점으로 이은 문자열이며, 서명 덕분에 내용을 위조할 수 없지만 내용 자체는 암호화되어 있지 않다.

> 📖 출처: Web API Development with ASP.NET Core 8 8장 "Understanding the JWT token structure" (텍스트 L12327-12391), ASP.NET Core in Action 25장 "Understanding bearer token authentication" (텍스트 L32034-32265)

**핵심 설명**

- Bearer 토큰은 "가진 사람이 곧 주인"인 토큰이다. 책은 돈에 비유한다. 가지고 있으면 누구나 쓸 수 있으므로 비밀번호처럼 지켜야 하고, URL 쿼리 문자열에 넣으면 로그에 남을 수 있으니 피하라고 한다(ASP.NET Core in Action 25.2).
- JWT의 세 부분(Web API Development with ASP.NET Core 8 8장, ASP.NET Core in Action 25.2):
  - 헤더: 서명 알고리즘 정보(예: `HS256`).
  - 페이로드: 클레임(정보) 모음.
  - 서명: 헤더와 페이로드를 비밀 키로 계산한 값. 이 덕분에 중간에 클레임을 바꾸면 검증에서 걸린다.
- 헤더와 페이로드는 Base64Url로 인코딩되어 있을 뿐이다. 책도 "JWT는 기본적으로 암호화되지 않아서 누구나 내용을 읽을 수 있다"고 분명히 말한다(ASP.NET Core in Action 25.2). 그래서 비밀번호 같은 민감한 값은 페이로드에 넣지 않는다.
- 자주 보는 표준 클레임: `sub`(주체), `iss`(발급자), `aud`(대상), `iat`(발급 시각), `nbf`(이 시각 전엔 무효), `exp`(만료 시각)(Web API Development with ASP.NET Core 8 8장).
- 받은 JWT의 서명은 항상 검증해야 하며 ASP.NET Core는 기본으로 검증한다. 인증 미들웨어는 서명, 대상(`aud`), 만료 여부를 확인한 뒤 통과하면 `ClaimsPrincipal`을 만들어 `HttpContext.User`에 넣는다(ASP.NET Core in Action 25.2). 서명에 쓰는 키 재료는 토큰을 만든 쪽과 검증하는 API가 공유해야 한다(ASP.NET Core in Action 25.2).
- 자체 완결형(self-contained) 액세스 토큰은 모든 정보가 토큰 안에 있어 오프라인으로 검증할 수 있는 것이 장점이지만, 그 때문에 발급 후 취소할 수 없다는 약점이 있다. 그래서 수명을 짧게 두고(책은 5분 정도로 짧은 예를 든다), 만료되면 리프레시 토큰으로 새 액세스 토큰을 받는다. 리프레시 토큰을 탈취당하면 공격자가 사용자 행세를 할 수 있으므로 더 철저히 보호해야 한다(ASP.NET Core in Action 25.2).
- 내용을 숨기고 싶다면 JWT를 암호화 봉투로 감싸는 JWE라는 표준이 따로 있고 ASP.NET Core도 지원한다고 책은 언급한다(ASP.NET Core in Action 25.2).

**예제 코드**

```csharp
using System.IdentityModel.Tokens.Jwt;

// 토큰을 서명 검증 없이 "읽기만" 해서 페이로드가 그대로 보임을 확인하는 예.
// ReadJwtToken은 검증을 하지 않는다. 여기서 읽은 값을 인증 결과로 믿으면 안 된다.
static void PrintClaims(string token)
{
    var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
    Console.WriteLine($"alg = {jwt.Header.Alg}");
    foreach (var c in jwt.Claims)
        Console.WriteLine($"{c.Type} = {c.Value}");
    Console.WriteLine($"만료(UTC) = {jwt.ValidTo:u}");
}

// 사용 예 (token 문자열은 2.3절에서 발급한 값):
// PrintClaims(token);
```

**방치형 RPG 서버에서는**: 토큰에는 `playerId` 정도만 넣고, 골드·레벨 같은 게임 상태는 넣지 않는다. 토큰은 누구나 읽을 수 있고, 상태는 서버 DB가 진실이어야 하기 때문이다.

> 🔧 보충(책 외): "게임 상태를 토큰에 넣지 않는다"는 판단은 게임 서버 맥락의 권장이다. 책이 직접 말하는 것은 "JWT는 암호화되지 않았다"와 "토큰은 취소하기 어렵다"는 점이다.

---

### 2.2 TCP 로그인 세션 vs JWT 무상태 인증

**한 줄 요약:** TCP 서버는 "연결"이 신분을 기억하고(상태 저장), JWT API는 "요청"이 신분 증명을 매번 들고 온다(무상태). 그래서 확장은 쉬워지고, 즉시 취소는 어려워진다.

> 🔧 보충(책 외): 이 절 전체는 TCP 게임 서버 경험이 있는 독자를 위해 덧붙인 비교다. 책이 직접 말하는 근거는 2.1의 "자체 완결형 토큰은 오프라인으로 검증할 수 있지만 발급 후 취소할 수 없다", "키 재료는 발급자와 검증하는 API가 공유한다", 1.1의 "API 앱은 쿠키 대신 요청 헤더로 인증한다"이며, 나머지는 일반적인 서버 설계 지식이다.

**핵심 설명**

- **TCP 로그인 세션(익숙한 방식)**: 클라이언트가 접속 → 첫 로그인 패킷으로 계정·비밀번호(또는 플랫폼 토큰)를 확인 → 서버가 `Session` 객체에 `accountId`를 기록하고 세션 맵(`socket → session`, `accountId → session`)에 등록 → 이후 패킷은 "어느 소켓으로 왔는가"만으로 주인이 정해진다. 인증은 연결당 한 번이고, 신분은 **서버 메모리의 상태**다.
- **HTTP + JWT(이 부의 방식)**: HTTP 요청은 서로 독립적이고, 같은 클라이언트라도 요청마다 다른 연결이나 로드 밸런서 뒤의 다른 서버 인스턴스로 갈 수 있다. 그래서 요청이 `Authorization: Bearer <토큰>`으로 신분 증명을 **매번** 들고 오고, 인증 미들웨어가 요청마다 서명·대상·만료를 검증해 `ClaimsPrincipal`을 새로 만든다. 서버는 세션 테이블을 찾지 않으며, 서명 키만 공유하면 어느 인스턴스든 같은 토큰을 검증할 수 있다. 신분은 **토큰 안의 클레임**이다.

| 비교 항목 | TCP 로그인 세션 | JWT Bearer (무상태) |
|---|---|---|
| 인증 시점 | 접속 직후 1회 | 요청마다 (서명 검증) |
| 신분이 사는 곳 | 서버 메모리의 세션 객체(소켓에 귀속) | 클라이언트가 들고 다니는 토큰의 클레임 |
| "지금 요청한 계정" 얻기 | `session->accountId` | `user.FindFirstValue(ClaimTypes.NameIdentifier)` |
| 서버 증설 | 유저가 특정 서버 프로세스에 붙어 있어 세션 이전·라우팅이 필요 | 키만 공유하면 아무 인스턴스나 처리 가능 |
| 강제 로그아웃·밴 | 소켓을 끊고 세션을 지우면 즉시 효과 | 이미 발급한 토큰은 `exp`까지 유효. 즉시 막으려면 서버 쪽 상태가 다시 필요 |
| 중복 로그인 감지 | 세션 맵에서 같은 `accountId`를 찾아 기존 세션 킥 | 토큰만으로는 알 수 없다. 서버 쪽에 "현재 유효한 로그인" 기록을 따로 둬야 한다 |
| 탈취 위험 | 연결 자체를 가로채야 한다 | 토큰 문자열만 복사하면 어디서든 쓸 수 있다(→ HTTPS, 짧은 수명) |
| 게임 상태 | 세션 객체에 캐시해 두고 쓰기도 한다 | 토큰에 넣지 않는다. 매 요청 DB(또는 캐시)가 진실 |

- **유추가 깨지는 곳 ①: 즉시 취소.** TCP에서는 "끊으면 끝"이지만 자체 완결형 JWT는 그렇지 않다. 그래서 액세스 토큰 수명을 짧게(분 단위) 두고, 차단·로그아웃은 "리프레시 토큰 재발급을 거절"하는 지점에서 걸리게 한다. 즉시성이 꼭 필요하면 토큰의 식별자(`jti`)나 계정별 "토큰 버전"을 Redis·DB에 두고 요청마다 대조하는데, 이것은 서버 상태를 다시 들여오는 것이므로 무상태의 장점(조회 없는 검증)과 맞바꾸는 선택이다.
- **유추가 깨지는 곳 ②: 세션 객체 ≠ 토큰.** TCP 세션에는 레벨·골드 같은 게임 상태를 캐시해 두기도 하지만, 토큰의 클레임은 발급 시점의 사진이고 누구나 읽을 수 있다. 토큰에는 `playerId` 같은 식별자만 넣고, 게임 상태는 요청마다 서버 저장소에서 읽는다(2.1, 3.3 보충).
- **유추가 깨지는 곳 ③: 소켓이 없으니 IP·계정 단위로 센다.** 세션별 패킷 빈도 제한은 4.4의 속도 제한으로 옮겨 가며, 인증 전 요청(로그인)은 셀 계정이 없어 IP로 센다.
- **같은 점:** "핸들러가 실행되기 전에 요청의 주인을 확정해 둔다", "요청 대상 데이터의 주인과 요청자를 비교한다(3.4)", "클라이언트 값을 믿지 않는다"는 원리는 그대로다.
- **참고:** 서버가 세션 저장소(메모리·Redis)를 두고 클라이언트에는 세션 ID 쿠키만 주는 "서버 세션" 방식도 있다. 이것은 TCP 세션 모델에 더 가깝고(즉시 취소 쉬움, 대신 저장소 조회 필요), 1.1에서 말한 전통적인 웹 앱의 쿠키 인증이 이 계열이다. 이 부는 API 서버에 맞는 JWT 방식을 다룬다.

**방치형 RPG 서버에서는**: 방치형은 "로그인 → 보상 수령 몇 번 → 앱 종료"처럼 짧고 띄엄띄엄한 요청이 대부분이라, 연결을 유지하는 TCP 세션보다 요청마다 토큰을 들고 오는 HTTP API가 잘 맞는다. 대신 "밴 즉시 반영", "다른 기기 로그인 시 기존 기기 끊기" 같은 요구가 기획에 있다면, 그 부분만큼은 서버 쪽 상태(리프레시 토큰 저장소, 차단 목록 등)를 설계에 넣어야 한다.

---

### 2.3 토큰 발급과 검증 설정

**한 줄 요약:** 로그인 API가 비밀 키로 서명한 JWT를 발급하고, 이후 요청마다 `Authorization: Bearer <토큰>` 헤더로 보내면 `AddJwtBearer`가 같은 키로 검증한다.

> 📖 출처: Web API Development with ASP.NET Core 8 8장 "Creating a sample project with authentication and authorization" (텍스트 L12139-12322), ASP.NET Core in Action 25장 "Adding JWT bearer authentication to minimal APIs" (텍스트 L32269-32345)

**핵심 설명**

- 책의 흐름: `POST /account/login`에서 사용자 이름과 비밀번호를 확인 -> 맞으면 JWT 발급 -> 클라이언트가 이후 요청 헤더에 `Bearer` 접두사(뒤에 공백)와 함께 토큰을 실어 보낸다(Web API Development with ASP.NET Core 8 8장).
- 발급에 필요한 것은 발급자(Issuer), 대상(Audience), 서명용 비밀 키다. 책은 `appsettings.json`의 `JwtConfig`에 넣어 읽는다. 단 이는 데모용이며 실서비스에서는 비밀 키를 안전한 곳(예: Azure Key Vault)에 보관하라고 한다(Web API Development with ASP.NET Core 8 8장).
- HS256 서명 키는 128비트 초과여야 한다는 오류(`IDX10603`)가 나올 수 있고, 그럴 때 비밀 키를 16자 이상(16 x 8 = 128비트)으로 하라고 책은 안내한다(Web API Development with ASP.NET Core 8 8장).
- 책은 직접 토큰을 발급하는 방식보다, 대규모 시스템에서는 ID 공급자를 두어 인증을 한곳에 모으고 가능하면 제3자 ID 공급자 서비스를 쓰라고 권한다. 사용자 관리는 대개 핵심 사업이 아니기 때문이다(ASP.NET Core in Action 25장 요약).

> 🔧 보충(책 외): 책이 제시한 최소 길이는 16자이지만, .NET 8의 JWT 라이브러리(Microsoft.IdentityModel 7.x 이상)는 HS256 키가 256비트(32바이트) 이상이어야 하며 짧으면 `IDX10720` 오류를 낸다. 그래서 이 책의 예제는 32자 이상의 키 문자열을 쓴다.
- 검증 쪽은 `AddJwtBearer`의 `TokenValidationParameters`에 발급자·대상·서명 키를 지정한다(Web API Development with ASP.NET Core 8 8장). 만료 시각도 검증된다(아래 코드는 기본값 사용).
- 비밀번호 확인과 사용자 저장은 책에서 ASP.NET Core Identity의 `UserManager`(`CheckPasswordAsync` 등)가 담당한다. 비밀번호는 해시로 저장된다(Web API Development with ASP.NET Core 8 8장, ASP.NET Core in Action 29.4.4).
- 인증 실패 시 `401`과 함께 `WWW-Authenticate` 헤더가 내려온다(ASP.NET Core in Action 25.3).

**예제 코드**

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// 데모용 값. 비밀 키를 소스 코드에 적어 두면 안 된다.
// 책은 실서비스에서는 안전한 저장소(예: Azure Key Vault)에 두라고 한다.
var jwt = new JwtSettings(
    Issuer: "idle-rpg-server",
    Audience: "idle-rpg-client",
    Secret: "change-me-please-32-chars-or-more!!");

builder.Services.AddSingleton(jwt);
builder.Services.AddAuthentication().AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidIssuer = jwt.Issuer,
        ValidAudience = jwt.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret))
    };
});
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapPost("/api/login", (LoginRequest req, JwtSettings s) =>
{
    // 데모: 실제로는 DB의 비밀번호 해시와 비교한다 (책에서는 UserManager.CheckPasswordAsync)
    if (req.Password != "demo-pass") return Results.Unauthorized();

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(s.Secret));
    var descriptor = new SecurityTokenDescriptor
    {
        Subject = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, req.PlayerId),
            new Claim(ClaimTypes.Name, req.PlayerId)
        }),
        Expires = DateTime.UtcNow.AddHours(1),
        Issuer = s.Issuer,
        Audience = s.Audience,
        SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256Signature)
    };
    var handler = new JwtSecurityTokenHandler();
    var token = handler.WriteToken(handler.CreateToken(descriptor));
    return Results.Ok(new { token });
});

app.MapGet("/api/me", (ClaimsPrincipal user) =>
    Results.Ok(new { playerId = user.FindFirstValue(ClaimTypes.NameIdentifier) }))
   .RequireAuthorization();

app.Run();

public record JwtSettings(string Issuer, string Audience, string Secret);
public record LoginRequest(string PlayerId, string Password);
```

호출 예: `GET /api/me` 요청에 헤더 `Authorization: Bearer <위에서 받은 token>`을 붙인다.

**방치형 RPG 서버에서는**: 모바일 클라이언트는 로그인 응답의 토큰을 저장해 두고 이후 모든 API 호출 헤더에 붙인다. 서버는 토큰에서 `playerId`를 꺼내 "지금 요청한 플레이어"로 사용한다.

> 🔧 보충(책 외): 위 예제는 설명을 위해 비밀번호 비교를 고정값으로 대체했고, 클라이언트가 보낸 `PlayerId`를 그대로 신뢰한다. 이대로 운영하면 고정 비밀번호를 아는 누구나 다른 플레이어의 토큰을 받을 수 있으므로 절대 그대로 쓰면 안 되며, 실제로는 계정 DB에서 확인해야 한다. 책은 Identity + 사용자 DB로 처리하는 방식을 보여 준다. 또한 "방치형 게임이라 모바일이 오랜 시간 뒤에 접속하므로 토큰 갱신(리프레시) 정책이 중요하다"는 점은 게임 맥락의 보충이다.

---

### 2.4 로컬 테스트와 Swagger에서 토큰 쓰기

**한 줄 요약:** 개발 중에는 `dotnet user-jwts`로 테스트 토큰을 만들거나 Swagger UI의 Authorize 버튼에 토큰을 넣어 보호된 API를 호출해 볼 수 있다.

> 📖 출처: ASP.NET Core in Action 25장 "Using the user-jwts tool for local JWT testing" (텍스트 L32386-32616), ASP.NET Core in Action 25.5 "Describing your authentication requirements to OpenAPI" (텍스트 L32617-32768), Web API Development with ASP.NET Core 8 8장 "Configuring the Swagger UI to support authorization" (텍스트 L12439-12500)

**핵심 설명**

- .NET 7부터 SDK에 `user-jwts` 도구가 들어 있어 별도 설치 없이 프로젝트 폴더에서 `dotnet user-jwts create`로 테스트용 JWT를 만들 수 있다. 이 도구는 작은 ID 공급자처럼 동작한다(ASP.NET Core in Action 25.4).
- `create`는 세 가지를 한다. (1) 아직 User Secrets가 없으면 켠다. (2) 서명 키 재료를 User Secrets에 저장한다. (3) `appsettings.Development.json`에 유효한 대상(`ValidAudiences`, `launchSettings.json`의 주소들)과 발급자(`dotnet-user-jwts`) 설정을 추가해 JWT 인증이 그 토큰을 받아들이게 한다. 그 뒤 토큰을 만들어 콘솔에 출력한다(ASP.NET Core in Action 25.4.1).
- 자주 쓰는 옵션: `--name`(sub와 unique_name), `--claim <키>=<값>`(클레임 추가, 여러 번 가능), `--scope <값>`, 토큰만 출력하는 `--output token`. 관리 명령은 `list`, `clear`, `remove`, `print`, `key`(서명 키 보기/초기화, 초기화하면 이전 토큰은 모두 무효)다(ASP.NET Core in Action 25.4.2-25.4.3).
- 토큰으로 호출할 때는 `Authorization: Bearer <토큰>` 형식이어야 한다. 헤더 이름이나 `Bearer`를 잘못 쓰거나 공백을 빼먹으면 401이 온다(ASP.NET Core in Action 25.4.1).
- 주의: 이 도구가 만든 토큰과 User Secrets는 암호화되지 않는다(프로젝트 폴더 밖에 저장되므로 프로젝트에 두는 것보다는 낫다). 로컬 테스트용으로만 쓰고, 운영에서는 진짜 ID 공급자가 만든 토큰을 써야 한다. 그래서 도구는 `appsettings.json`이 아니라 `appsettings.Development.json`만 고친다(ASP.NET Core in Action 25.4.3).
- Swagger UI에서 토큰을 쓰려면 `AddSwaggerGen`에 Bearer 보안 정의와 요구 사항을 추가해야 한다. 그러면 Authorize 버튼이 생기고, 값에 `Bearer ` 접두사(공백 포함)와 토큰을 입력한다(Web API Development with ASP.NET Core 8 8장, ASP.NET Core in Action 25.5).
- 책은 인증을 나중에 붙이려고 미루거나 로컬 테스트를 위해 꺼 두지 말고, 요구 사항을 알게 되는 즉시 실제 인증/인가를 붙이라고 강하게 권한다(ASP.NET Core in Action 25.5).

**예제 코드**

```bash
# 프로젝트 폴더에서 (ASP.NET Core in Action 25.4)
dotnet user-jwts create
# 이름과 클레임을 지정하는 예 (ASP.NET Core in Action 25.4.2)
dotnet user-jwts create --name player-1 --claim Subscription=Premium
# 출력된 토큰으로 호출
# curl -H "Authorization: Bearer <토큰>" https://localhost:5001/api/heroes
```

**방치형 RPG 서버에서는**: 개발 단계에서는 `user-jwts` 토큰으로 `/api/heroes` 같은 보호된 API를 빠르게 시험하고, 배포 환경에서는 진짜 로그인 API가 발급한 토큰만 쓰도록 분리한다.

> 🔧 보충(책 외): user-jwts의 자동 연동은 `AddJwtBearer()`를 인자 없이 써서 설정 파일 규약을 따를 때 이야기다. 2.3절처럼 코드에서 `TokenValidationParameters`를 직접 지정하면 발급자·대상·키가 user-jwts가 만든 값과 달라 그 토큰이 통과하지 못할 수 있다. 위 curl의 포트 번호도 예시일 뿐이며 실제 주소는 `launchSettings.json`을 따른다.

---

## 코어 3. 인가는 점점 세밀해진다 — 역할 → 클레임 정책 → 요구사항·핸들러 → 리소스

> 이 코어의 질문: "판단에 필요한 정보가 토큰 안에 있나, 밖(대상 데이터)에 있나?" 토큰만 보면 되는 역할·클레임에서 시작해, 대상 데이터의 주인을 봐야 하는 리소스 기반 인가로 끝난다.

### 3.1 역할 기반 인가

**한 줄 요약:** 사용자에게 Administrator, User 같은 역할을 주고, 토큰에 역할 클레임을 넣어 `[Authorize(Roles = ...)]`로 접근을 제한한다.

> 📖 출처: Web API Development with ASP.NET Core 8 8장 "Role-based authorization" (텍스트 L12507-12618), ASP.NET Core in Action 24장 "Using policies for claims-based authorization" 중 Role-based vs claims-based 상자 (텍스트 L30574-30594)

**핵심 설명**

- 역할(role)은 권한 묶음이다. 한 사용자가 여러 역할을 가질 수 있고 한 역할이 여러 사용자에게 붙을 수 있다(Web API Development with ASP.NET Core 8 8장).
- 토큰 발급 시 `ClaimTypes.Role` 클레임으로 역할을 넣는다(Web API Development with ASP.NET Core 8 8장). 이후 `[Authorize(Roles = "Administrator")]`처럼 쓴다.
- 쉼표로 여러 역할을 나열하면 "그중 하나만 있으면 통과(OR)", `[Authorize]`를 여러 번 겹쳐 쓰면 "모두 있어야 통과(AND)"다(Web API Development with ASP.NET Core 8 8장).
- 역할이 부족하면 `403 Forbidden`이 반환된다(Web API Development with ASP.NET Core 8 8장).
- 정책으로도 표현 가능하다: `policy.RequireRole(...)`. `RequireRole`에 여러 역할을 주면 그중 하나만 있으면 된다(Web API Development with ASP.NET Core 8 8장).
- 책의 예제에서 Administrator 역할만 가진 사용자는 User 역할 전용 API에 접근할 수 없다. 관리자에게 User 역할도 함께 주거나 `Roles`에 여러 역할을 나열해 해결한다(Web API Development with ASP.NET Core 8 8장).
- 주의: ASP.NET Core in Action 저자는 역할 기반은 예전 방식이라 주로 호환성 때문에 쓰이며, 새 앱은 클레임 기반을 권장한다고 말한다. 역할은 "클레임을 부여하는 기준"으로 쓰는 것이 낫다고 한다(ASP.NET Core in Action 24.3). 두 책의 입장이 다르므로 알아 두자.

**예제 코드**

```csharp
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAuthentication().AddJwtBearer();
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("AdminOnly", p => p.RequireRole(AppRoles.Admin));

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

// 역할을 attribute로 지정 (Minimal API에서도 [Authorize] 사용 가능)
app.MapGet("/api/admin/players",
    [Authorize(Roles = AppRoles.Admin)] () => new[] { "player-1", "player-2" });

// 같은 규칙을 정책 이름으로 지정
app.MapPost("/api/admin/gold-grant", () => Results.Ok("지급 완료"))
   .RequireAuthorization("AdminOnly");

app.Run();

public static class AppRoles
{
    public const string Admin = "Administrator";
    public const string Player = "Player";
}
```

**방치형 RPG 서버에서는**: 운영자 전용 API(보상 지급, 유저 조회)는 `Administrator` 역할로 막고, 일반 플레이어 토큰으로 호출하면 403이 나오도록 한다.

---

### 3.2 클레임 기반 인가와 정책

**한 줄 요약:** 토큰에 담긴 클레임(키-값)을 검사하는 규칙을 "정책"에 이름을 붙여 등록하고, 엔드포인트에 그 이름을 지정한다.

> 📖 출처: Web API Development with ASP.NET Core 8 8장 "Claim-based authorization" (텍스트 L12621-12698), ASP.NET Core in Action 24장 "Using policies for claims-based authorization" (텍스트 L30443-30573)

**핵심 설명**

- 클레임은 키-값 쌍이고, 책은 타입과 값이 대소문자를 구분한다고 설명한다(Web API Development with ASP.NET Core 8 8장). 다만 ASP.NET Core의 `HasClaim`, `FindFirst`, 정책의 `RequireClaim`은 타입을 대소문자 구분 없이 비교하고 값만 구분하므로, 값의 대소문자를 정확히 맞추는 것이 중요하다. 역할도 사실은 특별한 클레임이다(Web API Development with ASP.NET Core 8 8장).
- 정책(policy)은 요청이 인가되기 위한 요구 조건 모음이다(ASP.NET Core in Action 24.3). `AuthorizationPolicyBuilder`의 간단한 메서드:
  - `RequireAuthenticatedUser()`: 로그인만 되어 있으면 통과.
  - `RequireClaim(타입, 값들)`: 그 클레임이 있어야 하고, 값을 주면 그중 하나여야 함.
  - `RequireAssertion(함수)`: 직접 짠 조건식이 true여야 함.
  (ASP.NET Core in Action 표 24.1)
- 정책 이름은 상수로 두면 오타를 막을 수 있다고 책이 권한다(Web API Development with ASP.NET Core 8 8장).
- 정책을 붙이지 않은 `[Authorize]`는 "로그인만 하면 됨"이다.

**예제 코드**

```csharp
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAuthentication().AddJwtBearer();
builder.Services.AddAuthorizationBuilder()
    // "Subscription" 클레임이 있고 값이 Premium이어야 함
    .AddPolicy(Policies.PremiumOnly, p => p.RequireClaim("Subscription", "Premium"))
    // 직접 조건식: 클레임 두 개를 함께 검사
    .AddPolicy(Policies.VerifiedPlayer, p => p.RequireAssertion(ctx =>
        ctx.User.HasClaim(c => c.Type == ClaimTypes.NameIdentifier) &&
        ctx.User.HasClaim("EmailVerified", "true")));

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/shop/premium-pack", () => "프리미엄 팩")
   .RequireAuthorization(Policies.PremiumOnly);
app.MapGet("/api/mail/claim", () => "우편 수령")
   .RequireAuthorization(Policies.VerifiedPlayer);

app.Run();

public static class Policies
{
    public const string PremiumOnly = "PremiumOnly";
    public const string VerifiedPlayer = "VerifiedPlayer";
}
```

**방치형 RPG 서버에서는**: "프리미엄 구독자만 접근 가능한 상점" 같은 조건을 클레임+정책으로 선언해 두면 컨트롤러 코드에 `if`를 흩뿌리지 않아도 된다.

---

### 3.3 커스텀 정책: 요구사항과 핸들러

**한 줄 요약:** 복잡한 규칙은 "요구사항(무엇이 필요한가)"과 "핸들러(어떻게 확인하는가)"를 나눠 직접 만든다.

> 📖 출처: Web API Development with ASP.NET Core 8 8장 "Policy-based authorization" (텍스트 L12912-12976), ASP.NET Core in Action 24장 "Creating custom policies for authorization" (텍스트 L30608-30830)

**핵심 설명**

- 정책은 하나 이상의 요구사항(`IAuthorizationRequirement`)으로 이루어지고, 각 요구사항은 하나 이상의 핸들러가 검사한다(ASP.NET Core in Action 24.4.1).
- 정책이 만족되려면 모든 요구사항이 만족되어야 한다(AND). 한 요구사항은 핸들러 중 하나만 성공해도 만족된다(OR)(ASP.NET Core in Action 24.4.1).
- 요구사항은 `IAuthorizationRequirement`를 구현하는 단순한 클래스다. 이 인터페이스는 멤버가 없는 마커이며, 요구사항에는 DI를 쓸 수 없지만 핸들러에서는 쓸 수 있다(ASP.NET Core in Action 24.4.2).
- 핸들러는 `AuthorizationHandler<T>`를 상속해 `HandleRequirementAsync`를 구현하고, 조건을 만족하면 `context.Succeed(requirement)`를 호출한다. 핸들러가 할 수 있는 일은 성공 처리, 아무것도 안 하기, 명시적 실패 셋이다(ASP.NET Core in Action 24.4.2). 조건이 안 맞을 때는 보통 아무것도 안 하면 된다. 같은 요구사항을 다른 핸들러가 만족시킬 수도 있기 때문이다.
- 확실히 막고 싶을 때는 `context.Fail()`을 부르고, 옵션 `InvokeHandlersAfterFailure`를 `false`로 두어 나머지 핸들러 실행을 멈추게 한다. 핸들러가 여럿이면 실행 순서를 기대하면 안 된다(Web API Development with ASP.NET Core 8 8장).
- 핸들러는 DI 컨테이너에 `IAuthorizationHandler`로 등록해야 한다(Web API Development with ASP.NET Core 8 8장).

**예제 코드**

```csharp
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAuthentication().AddJwtBearer();
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("CanEnterRaid", p => p.AddRequirements(new MinLevelRequirement(30)));
builder.Services.AddSingleton<IAuthorizationHandler, MinLevelHandler>();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapPost("/api/raids/enter", () => Results.Ok("입장"))
   .RequireAuthorization("CanEnterRaid");
app.Run();

public class MinLevelRequirement : IAuthorizationRequirement
{
    public int MinLevel { get; }
    public MinLevelRequirement(int minLevel) => MinLevel = minLevel;
}

public class MinLevelHandler : AuthorizationHandler<MinLevelRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, MinLevelRequirement requirement)
    {
        var levelClaim = context.User.FindFirst("AccountLevel");
        if (levelClaim is not null &&
            int.TryParse(levelClaim.Value, out var level) &&
            level >= requirement.MinLevel)
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask; // 실패 시엔 Succeed를 호출하지 않으면 됨
    }
}
```

**방치형 RPG 서버에서는**: "계정 레벨 30 이상만 레이드 입장" 같은 조건은 요구사항/핸들러로 만들 수 있다. 다만 아래 보충 참고.

> 🔧 보충(책 외): 레벨처럼 자주 바뀌는 게임 상태를 토큰 클레임으로 판단하면 토큰 발급 시점의 값이 낡을 수 있다. 실제 서버는 핸들러 안에서 DB를 조회하거나 엔드포인트에서 확인하는 편이 안전하다. 책은 핸들러에서 DI를 쓸 수 있다는 점(ASP.NET Core in Action 24.4.2)만 다룬다.

---

### 3.4 리소스 기반 인가와 IDOR

**한 줄 요약:** "이 영웅은 이 플레이어의 것인가"처럼 대상 데이터를 봐야 결정되는 인가는 `IAuthorizationService`로 리소스를 넘겨 검사한다.

> 📖 출처: ASP.NET Core in Action 24.5 "Controlling access with resource-based authorization" (텍스트 L31034-31410), ASP.NET Core in Action 25장 "Applying authorization policies to minimal API endpoints" (텍스트 L32769-32926), ASP.NET Core in Action 29장 "Preventing insecure direct object references" (텍스트 L37555-37594)

**핵심 설명**

- 리소스 기반 인가는 리소스(예: 레시피)의 내용을 알아야 판단할 수 있는 경우(내가 만든 것만 수정 가능 등)에 쓴다(ASP.NET Core in Action 25.6).
- 절차: (1) `AuthorizationHandler<TRequirement, TResource>`를 만들어 DI에 등록, (2) 엔드포인트에 `IAuthorizationService` 주입, (3) `AuthorizeAsync(user, resource, policy)` 호출, 실패하면 `403 Forbidden`(ASP.NET Core in Action 25.6).
- URL에 `/Recipes/Edit/120`처럼 DB 번호가 드러나면 사용자가 숫자를 바꿔 남의 데이터에 접근하려 할 수 있다. 이것이 IDOR(insecure direct object reference)다(ASP.NET Core in Action 29.4.3).
- 해결책은 리소스 기반 인가다. UI에서 버튼을 숨기는 것은 보안 수단이 아니다. GUID를 쓰면 추측이 어려워지지만 문제를 가릴 뿐 해결은 아니라고 책은 말한다(ASP.NET Core in Action 29.4.3).

**예제 코드**

```csharp
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAuthentication().AddJwtBearer();
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("HeroOwner", p => p.AddRequirements(new HeroOwnerRequirement()));
builder.Services.AddSingleton<IAuthorizationHandler, HeroOwnerHandler>();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapDelete("/api/heroes/{id}", async (int id, ClaimsPrincipal user, IAuthorizationService authz) =>
{
    var hero = new Hero(id, "player-1", "Knight"); // 실제로는 DB에서 조회
    var result = await authz.AuthorizeAsync(user, hero, "HeroOwner");
    if (!result.Succeeded) return Results.Forbid();
    // ... 삭제 수행 ...
    return Results.NoContent();
}).RequireAuthorization();

app.Run();

public record Hero(int Id, string OwnerId, string Name);
public class HeroOwnerRequirement : IAuthorizationRequirement { }

public class HeroOwnerHandler : AuthorizationHandler<HeroOwnerRequirement, Hero>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, HeroOwnerRequirement requirement, Hero hero)
    {
        var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId == hero.OwnerId) context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
```

**방치형 RPG 서버에서는**: `/api/heroes/{id}` 같은 API는 로그인만으로 통과시키면 안 되고, 반드시 그 영웅의 주인이 요청자인지 확인해야 한다. 단순하게는 조회 시 `WHERE OwnerId = 토큰의 playerId` 조건을 함께 거는 방법도 같은 목적을 이룬다.

책도 `IAuthorizationService` 방식이 프레임워크에 대한 의존을 만든다는 점을 인정하며, 도메인 안에서 단순한 비즈니스 로직 검사로 하는 방식이 더 나을 수도 있고 둘을 섞어 써도 된다고 한다. 예컨대 `[Authorize]`로 익명 접근만 막고 세부 검사는 도메인에서 하는 식이다(ASP.NET Core in Action 24.5 상자, ASP.NET Core in Action 25.6). 어느 쪽이든 익명 접근은 선언적으로 막아 둔다.

> 🔧 보충(책 외): "조회 쿼리에 `OwnerId` 조건을 함께 거는 방식"은 책의 비즈니스 로직 검사 개념을 데이터 조회에 적용한 실무적 예시로 덧붙인 것이다. 책의 예제는 `IAuthorizationService`를 사용한다.

---

## 코어 4. 경계 방어 — 전송·입력·데이터·빈도

> 이 코어의 질문: "누구인지 확인한 뒤에도 무엇이 새는가?" 전송 구간(HTTPS) → 입력(SQL 인젝션) → 브라우저 출처와 저장 데이터(CORS·비밀번호) → 요청 빈도(속도 제한). 모두 "클라이언트를 믿지 않는다"는 TCP 서버의 원칙과 같은 뿌리다.

### 4.1 HTTPS

**한 줄 요약:** HTTP는 평문이라 같은 네트워크의 누구나 읽고 바꿀 수 있으므로, 운영 서버는 항상 HTTPS(TLS로 암호화)를 써야 한다.

> 📖 출처: Web API Development with ASP.NET Core 8 8장 "Always use HTTPS" (텍스트 L13471-13484), Web API Development with ASP.NET Core 8 15장 "Using HTTPS instead of HTTP" (텍스트 L21698-21708), ASP.NET Core in Action 28장 "Why do I need HTTPS?" (텍스트 L35634-35799), "Using the ASP.NET Core HTTPS development certificates" (텍스트 L35800-35830), "Enforcing HTTPS for your whole app" (텍스트 L36005-36370)

**핵심 설명**

- HTTP 요청은 암호화되지 않은 평문이다. 카페 공용 Wi-Fi처럼 같은 네트워크의 공격자가 비밀번호 등을 읽거나 요청/응답을 조작하거나 인증 쿠키를 훔칠 수 있다(ASP.NET Core in Action 28.1). HTTPS는 TLS 인증서로 이를 막는다.
- 로컬 개발에서는 .NET SDK가 처음 `dotnet` 명령을 실행할 때 HTTPS 개발용 인증서를 설치하고, 기본 템플릿 앱은 그것을 쓴다. 다만 이 인증서는 기본적으로 신뢰되지 않으므로 처음 SDK를 설치했을 때 `dotnet dev-certs https --trust`를 실행해야 하고, 운영에는 쓸 수 없다. 운영에서는 신뢰받는 인증 기관(CA)의 인증서를 써야 한다(Web API Development with ASP.NET Core 8 8장, Web API Development with ASP.NET Core 8 15장, ASP.NET Core in Action 28.2와 28장 요약). Let's Encrypt로 사실상 무료 발급이 가능하다(ASP.NET Core in Action 28.1).
- 클라우드나 리버스 프록시가 HTTPS를 대신 처리(SSL/TLS 오프로딩)하고 앱은 HTTP로 받는 구성도 흔하다(ASP.NET Core in Action 28.1). 이때 `UseHttpsRedirection`이 제대로 동작하려면 프록시가 `X-Forwarded-Proto` 헤더로 원래 요청이 HTTPS였음을 알려 주고 앱이 그것을 읽어야 한다(ASP.NET Core in Action 28.4.2).
- 기본 웹 API 템플릿은 HTTP와 HTTPS를 모두 열 수 있다. Web API Development with ASP.NET Core 8은 HTTPS만 쓰기를 권하며 `app.UseHttpsRedirection()`으로 HTTP 요청을 HTTPS로 리다이렉트하라고 한다(Web API Development with ASP.NET Core 8 8장, Web API Development with ASP.NET Core 8 15장). 이 미들웨어는 기본적으로 307 리다이렉트를 쓴다(ASP.NET Core in Action 28.4.2).
- ASP.NET Core in Action은 웹 API라면 더 나은 방법이 있다고 한다. 브라우저만 클라이언트가 아니고 HTTP 요청이 단 한 번만 나가도 위험할 수 있으므로, 아예 HTTP를 듣지 않는 것이 API 앱의 최선이다. 예를 들어 환경 변수 `ASPNETCORE_URLS=https://*:5001`로 HTTPS 주소만 열면 되고, 그러면 리다이렉트 미들웨어도 필요 없다(ASP.NET Core in Action 28.4.3).
- HSTS는 브라우저에게 "앞으로 HTTPS만 써라"라고 알려 주는 `Strict-Transport-Security` 헤더다. HTTPS 응답에만 실을 수 있고, 브라우저에서 시작된 요청에만 의미가 있어 서버 간 통신이나 모바일 앱에는 효과가 없다. 운영 환경에서만 켜고, 한 번 켜면 `MaxAge` 기간 동안은 HTTPS를 계속 유지해야 하므로 처음에는 짧은 값으로 시작한다. 리다이렉트 미들웨어와 함께 쓴다(ASP.NET Core in Action 28.4.1-28.4.2).

**예제 코드**

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

if (app.Environment.IsProduction())
{
    app.UseHsts(); // 로컬 개발에서는 켜지 않는다 (ASP.NET Core in Action 28.4.1). 브라우저용이라 모바일 앱에는 효과 없음
}
app.UseHttpsRedirection(); // HTTP 요청을 HTTPS로 리다이렉트

app.MapGet("/api/ping", () => "pong");
app.Run();
```

**방치형 RPG 서버에서는**: 로그인 요청에는 비밀번호가, 모든 요청에는 Bearer 토큰이 실린다. HTTPS가 아니면 이 값들이 그대로 노출되므로 운영 서버는 HTTPS만 열어야 한다. 클라이언트가 모바일 앱이므로 HSTS는 효과가 없다는 점(ASP.NET Core in Action 28.4.1)에서, 위의 "HTTP를 아예 듣지 않는다" 방식이 더 잘 맞는다.

> 🔧 보충(책 외): 모바일 클라이언트가 HTTPS 인증서 오류를 무시하도록 만들어 두는 실수를 하면 HTTPS의 의미가 사라진다는 주의는 게임 맥락의 보충이다.

---

### 4.2 SQL 인젝션과 안전한 입력 처리

**한 줄 요약:** 사용자 입력을 문자열로 이어 붙여 SQL을 만들면 위험하다. EF Core의 LINQ나 매개변수화된 쿼리를 쓰면 안전하다.

> 📖 출처: ASP.NET Core in Action 29장 "Avoiding SQL injection attacks with EF Core and parameterization" (텍스트 L37458-37553), Web API Development with ASP.NET Core 8 7장 raw SQL 쿼리 절 (텍스트 L11562-11602)

**핵심 설명**

- SQL 인젝션은 공격자가 입력에 SQL을 섞어 데이터베이스를 마음대로 조작하는 공격이다. 책은 이를 가장 위험한 위협 중 하나로 꼽고, 웹에서 10년 넘게 1위 취약점이었다고 한다(ASP.NET Core in Action 29.4.2).
- EF Core의 일반적인 LINQ 쿼리는 자동으로 매개변수화되어 안전하다(ASP.NET Core in Action 29.4.2).
- 위험은 직접 SQL 문자열을 이어 붙일 때(`FromSqlRaw` + 문자열 연결) 생긴다. 안전한 방법은 입력을 SQL과 분리해서 넘기는 것이다(ASP.NET Core in Action 29.4.2).
- ASP.NET Core in Action이 보이는 안전한 형태는 SQL 안에 `{0}` 같은 자리 표시자를 두고 값을 인자로 따로 넘기는 `FromSqlRaw`다. 저수준 ADO.NET을 써도 매개변수화된 쿼리를 써야 하며, NoSQL에서도 같은 원칙이 적용된다(ASP.NET Core in Action 29.4.2).
- Web API Development with ASP.NET Core 8은 EF Core 7 이후의 `FromSql`이 보간 문자열(`$"..."`)을 `FormattableString`으로 받아 값들을 자동으로 DB 매개변수로 바꿔 주므로 안전하다고 설명한다. 단 컬럼명처럼 매개변수화할 수 없는 부분은 `FromSqlRaw`를 쓰며 개발자가 책임져야 한다(Web API Development with ASP.NET Core 8 7장).

**예제 코드**

```csharp
using Microsoft.EntityFrameworkCore;

public class Hero
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public class GameDb : DbContext
{
    public GameDb(DbContextOptions<GameDb> options) : base(options) { }
    public DbSet<Hero> Heroes => Set<Hero>();
}

public static class HeroQueries
{
    // 안전 1: LINQ (자동으로 매개변수화됨)
    public static Task<List<Hero>> FindByLinq(GameDb db, string name) =>
        db.Heroes.Where(h => h.Name == name).ToListAsync();

    // 안전 2: FromSql + 보간 문자열 (name이 DB 매개변수로 전달됨)
    public static Task<List<Hero>> FindBySql(GameDb db, string name) =>
        db.Heroes.FromSql($"SELECT * FROM Heroes WHERE Name = {name}").ToListAsync();

    // 위험(하지 말 것): 문자열 연결
    // db.Heroes.FromSqlRaw("SELECT * FROM Heroes WHERE Name = '" + name + "'")
}
```

**방치형 RPG 서버에서는**: 영웅 이름, 길드 이름, 채팅 검색처럼 클라이언트가 보낸 문자열은 전부 "믿으면 안 되는 입력"이다. 평소엔 LINQ만 쓰고, 직접 SQL이 필요할 때는 반드시 매개변수화한다.

---

### 4.3 CORS와 사용자 데이터 보호

**한 줄 요약:** CORS는 브라우저의 JavaScript가 다른 출처의 API를 부르는 것을 제어하는 규칙이고, 사용자 데이터는 "최소한만 저장하고 비밀번호는 해시로만" 다룬다.

> 📖 출처: ASP.NET Core in Action 29장 "Calling your web APIs from other domains using CORS" (텍스트 L36918-37340), "Protecting your users' passwords and data" (텍스트 L37595-37650), Web API Development with ASP.NET Core 8 8장 "Using a strong password policy" (텍스트 L13486-13505), "Checking the OWASP Top 10" (텍스트 L13736-13741)

**핵심 설명**

- 브라우저는 동일 출처 정책으로 JavaScript가 다른 출처(스킴, 도메인, 포트 중 하나라도 다름)의 API를 호출하는 것을 막는다. API 서버가 CORS 응답 헤더로 "이 출처는 허용"이라고 알려 주면 풀린다(ASP.NET Core in Action 29.3). `AddCors`에 정책을 만들고 `UseCors`로 적용한다(ASP.NET Core in Action 29장 요약). `WithOrigins`에 주소를 쓸 때 끝에 `/`를 붙이면 절대 일치하지 않는다. 또 브라우저가 다른 출처 요청을 막는 데는 이유가 있으므로, 실제로 다른 도메인의 앱이 API를 불러야 할 때까지는 CORS를 켜지 말라고 책은 조언한다(ASP.NET Core in Action 29.3.2).
- 이 부분은 브라우저 안의 JavaScript에 적용되는 규칙이다(ASP.NET Core in Action 29.3 정의 참고). 웹 관리자 페이지 같은 클라이언트가 있을 때 필요하다.
- 사용자 데이터 보호 원칙(ASP.NET Core in Action 29.4.4): 필요 없는 데이터는 저장하지 않는다, 비밀번호는 BCrypt/PBKDF2 같은 비용이 큰 알고리즘의 해시로만 저장한다, 다중 인증(MFA)을 허용한다, 약한 비밀번호를 막는다, 계정 존재 여부를 노출하지 않는다.
- 비밀번호 정책은 Identity의 옵션으로 설정한다(예: 길이 8자 이상, 대소문자·숫자·특수문자 요구, 이메일 중복 금지). 로그인에 여러 번 실패하면 계정을 잠가 무차별 대입 공격을 막는 기능도 소개한다(Web API Development with ASP.NET Core 8 8장).
- 책은 보안을 지속적인 과정으로 다루라고 하며, OWASP Top 10 목록과 .NET 보안 치트시트를 정기적으로 확인하라고 권한다(Web API Development with ASP.NET Core 8 8장).

**예제 코드**

```csharp
var builder = WebApplication.CreateBuilder(args);

// 관리자 웹 페이지(브라우저)에서만 GET 허용하는 CORS 정책
builder.Services.AddCors(options =>
{
    options.AddPolicy("AdminWeb", policy => policy
        .WithOrigins("https://admin.example.com")
        .WithMethods("GET")
        .AllowAnyHeader());
});

var app = builder.Build();
app.UseCors("AdminWeb");
app.MapGet("/api/stats", () => new { players = 120 });
app.Run();
```

**방치형 RPG 서버에서는**: 모바일 네이티브 앱은 브라우저가 아니므로 CORS의 영향을 받지 않는다고 볼 수 있고, 웹 기반 운영 도구를 붙일 때 CORS가 필요해진다. 비밀번호는 절대 평문 저장하지 않는다.

> 🔧 보충(책 외): "네이티브 모바일 앱은 CORS의 영향을 받지 않는다"는 것은 책의 "브라우저 JavaScript에 적용" 설명에서 이끌어 낸 추론이다. 또한 "클라이언트가 보낸 골드 증가량·전투 결과 같은 값을 믿지 말고 서버가 계산한다"는 치팅 방지 원칙은 책 범위 밖의 게임 서버 관행이며, 이 부에서 배운 인증·인가는 "누가 요청했는가"를 보증할 뿐 "요청 내용이 정직한가"까지 보증하지 않는다는 점만 짚어 둔다.

---

### 4.4 요청 속도 제한(Rate Limiting)

**한 줄 요약:** 한 사용자(또는 IP)가 정해진 시간 안에 보낼 수 있는 요청 수에 상한을 두고, 넘으면 `429 Too Many Requests`로 거절한다. ASP.NET Core(.NET 7+)는 이를 `AddRateLimiter`/`UseRateLimiter` 미들웨어로 기본 제공한다.

> 📚 참고(doc, 책 외): C# Complete Guide vol2 51장 "ASP.NET Core에는 요청 단위 부하 차단 미들웨어가 있다", NestJS 교재 26장 "Rate limiting"(로그인 무차별 대입, 사용자 ID 기준 추적, 여러 서버에서의 저장소 문제). 이 절 전체가 11권 밖의 보강 내용이다.

**핵심 설명**
- **왜 필요한가**: 로그인 API에 제한이 없으면 봇이 비밀번호를 수십만 번 대입해 볼 수 있다(무차별 대입). 게임 API에서는 매크로가 보상·뽑기 API를 초당 수백 번 두드려 서버와 DB를 지치게 하거나 버그를 노린다. 인증·인가(이 부 코어 1~3)는 "누구인가"만 확인하므로, "얼마나 자주"는 따로 막아야 한다.
- **알고리즘 종류**(`System.Threading.RateLimiting`): 고정 창(Fixed Window, "1분에 5번"), 슬라이딩 창(Sliding Window, 창 경계에 몰리는 요청을 완화), 토큰 버킷(Token Bucket, 일정 속도로 채워지는 토큰만큼 허용해 순간 몰림을 일부 허용), 동시성 제한(Concurrency, 동시에 처리 중인 요청 수). 입문 단계에서는 고정 창으로 충분하다.
- **무엇을 기준으로 셀까(파티션 키)**: 로그인처럼 인증 전 요청은 IP로, 로그인 후 게임 API는 **플레이어 ID**(토큰의 클레임)로 센다. 모바일 통신사 망(LTE/5G)에서는 많은 사용자가 같은 공인 IP를 공유하므로, 로그인 후까지 IP로 세면 엉뚱한 사용자가 함께 막힌다.
- **설정 요점**: 거절 시 기본 상태 코드는 `503`이므로 `RejectionStatusCode`를 `429`로 바꾼다. 플레이어 ID로 세려면 `UseRateLimiter`를 `UseAuthentication` 뒤에 두어야 `User`가 채워져 있다. 정책은 엔드포인트에 `RequireRateLimiting("정책이름")`으로 붙인다.

```csharp
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
// (인증·인가 등록은 2.3절 예제와 같다고 가정)

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests; // 기본값은 503

    // 로그인: IP마다 1분에 5번
    options.AddPolicy("login", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1)
            }));

    // 게임 API: 플레이어마다 1초에 10번
    options.AddPolicy("per-player", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromSeconds(1)
            }));
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();            // 인증 뒤: User에서 플레이어 ID를 꺼낼 수 있다

app.MapPost("/api/login", () => Results.Ok("token")).RequireRateLimiting("login");
app.MapPost("/api/gacha/roll", () => Results.Ok("item"))
   .RequireAuthorization()
   .RequireRateLimiting("per-player");
app.Run();
```

**방치형 RPG 서버에서는**: 로그인·회원가입·쿠폰 입력처럼 대입 공격 대상이 되는 API는 IP 기준으로 빡빡하게, 보상·뽑기·강화 같은 게임 API는 플레이어 기준으로 "정상 플레이로는 닿지 않는 수치"로 건다. 방치형은 사람이 직접 누르는 요청이 많지 않으므로, 상한에 자주 걸리는 계정은 매크로를 의심해 로그로 남겨 둘 만하다.

> 🔧 보충(책 외): 위 `login` 정책을 .NET 8에서 실행해 7번 연속 호출하니 상태 코드가 `200` 5번 뒤 `429` 2번이었다. 이 미들웨어의 카운터는 **서버 프로세스 메모리**에 있으므로, 서버를 3대로 늘리면 사용자는 사실상 3배까지 보낼 수 있다(NestJS 교재가 같은 함정을 짚는다). 정확한 전체 제한이 필요하면 Redis 같은 공유 저장소 기반 구현이나 API 게이트웨이·로드 밸런서의 제한 기능을 쓴다. 또 로드 밸런서 뒤에서는 `RemoteIpAddress`가 로드 밸런서 주소가 되므로 전달된 헤더(Forwarded Headers) 설정을 함께 확인한다. 속도 제한은 "남용을 줄이는 장치"이지 치팅 방지 자체는 아니며, 값 검증과 서버 계산([제7부](07_제7부_웹_API_기초.md)의 모델 바인딩과 입력 검증, [제10부](10_제10부_EF_Core_데이터_접근.md)의 "받은 값을 믿지 않고 서버가 다시 계산" 설명)이 여전히 기본이다.

---

## 실무 적용

### 체크리스트
- [ ] 파이프라인이 라우팅 → `UseAuthentication()` → `UseAuthorization()` → (`UseRateLimiter()`) → 엔드포인트 순서인가? (→ 코어 1, 4.4)
- [ ] 게임 데이터를 다루는 API는 기본 잠금(`[Authorize]`/`RequireAuthorization()`)이고, 핑·로그인·랭킹처럼 공개할 것만 `AllowAnonymous`로 열었는가? (→ 1.2)
- [ ] 토큰 검증에 발급자·대상·서명 키를 지정했고(2.3), 비밀 키는 소스 코드·`appsettings.json`이 아니라 안전한 저장소에 두었는가? HS256 키는 32바이트 이상인가(`IDX10720`)? (→ 2.3)
- [ ] 토큰에는 `playerId` 같은 식별자만 넣고 비밀번호·골드·레벨 같은 값은 넣지 않았는가? 클라이언트가 보낸 `PlayerId`가 아니라 토큰 클레임에서 플레이어를 꺼내는가? (→ 2.1, 2.3)
- [ ] 액세스 토큰 수명을 짧게 두고 리프레시 토큰으로 갱신하는가? 밴·강제 로그아웃이 필요하면 서버 쪽 상태(리프레시 토큰 저장소, 차단 목록)를 설계했는가? (→ 2.1, 2.2 보충)
- [ ] 토큰을 URL 쿼리 문자열에 싣지 않는가? `user-jwts` 토큰은 로컬 테스트에서만 쓰는가? (→ 2.1, 2.4)
- [ ] 운영자 API는 역할/정책으로 막고, 정책 이름은 상수로 두었는가? (→ 3.1, 3.2)
- [ ] 자주 바뀌는 게임 상태(레벨 등)는 토큰 클레임이 아니라 DB에서 확인하는가? (→ 3.3 보충)
- [ ] ID가 URL에 드러나는 API(`/api/heroes/{id}` 등)마다 리소스 소유 검사(`IAuthorizationService` 또는 `WHERE OwnerId = playerId`)가 있는가? (→ 3.4)
- [ ] 운영 서버는 HTTPS만 열었는가(API는 HTTP를 아예 듣지 않기), 개발 인증서를 운영에 쓰지 않았는가, 클라이언트가 인증서 오류를 무시하지 않는가? (→ 4.1)
- [ ] 직접 SQL은 LINQ·`FromSql` 보간·자리 표시자로 매개변수화했고, `FromSqlRaw` + 문자열 연결은 없는가? (→ 4.2)
- [ ] CORS는 웹 운영 도구처럼 실제로 필요할 때만 켜고, 비밀번호는 해시로만 저장하며 계정 잠금·비밀번호 정책을 설정했는가? OWASP Top 10을 정기적으로 확인하는가? (→ 4.3)
- [ ] 로그인·쿠폰 API는 IP 기준, 게임 API는 플레이어 ID 기준으로 속도 제한을 걸고 거절 코드를 429로 바꾸었는가? 서버 여러 대·로드 밸런서 뒤의 IP 문제를 확인했는가? (→ 4.4)

### 시나리오로 확인하기

1. **상황:** 매크로 계정을 발견한 운영자가 계정을 DB에서 "정지" 상태로 바꿨다. TCP 서버 시절처럼 이제 끝났다고 생각했는데, 그 계정의 보상 수령 API 호출이 한동안 계속 200으로 성공한다. 액세스 토큰 만료는 24시간으로 잡혀 있다.
   **질문:** 왜 막히지 않았고, 어떻게 설계해야 하나?

   <details markdown="1"><summary>답 확인</summary>

   자체 완결형 JWT는 서버가 세션을 들고 있지 않고 서명·대상·만료만 검증하므로, DB의 계정 상태가 바뀌어도 이미 발급한 토큰은 `exp`까지 유효하다. TCP의 "소켓을 끊으면 끝"에 해당하는 동작이 없다. 책의 처방대로 액세스 토큰 수명을 짧게(책은 5분 정도의 예) 두고, 만료 때 리프레시 토큰으로 재발급받는 순간에 계정 상태를 확인해 거절한다. 즉시성이 꼭 필요하면 차단 목록이나 계정별 토큰 버전을 서버 저장소에 두고 요청마다 대조하는 방법이 있지만, 이것은 서버 상태를 다시 들여오는 대가가 있다(보충). → 코어 2 (2.1, 2.2)

   </details>

2. **상황:** `DELETE /api/heroes/{id}`에 `RequireAuthorization()`만 걸어 두었다. 한 유저가 id 숫자를 바꿔 가며 호출해 다른 유저의 영웅을 지웠다.
   **질문:** 무엇이 빠졌고, 어떻게 고치나? id를 GUID로 바꾸면 해결인가?

   <details markdown="1"><summary>답 확인</summary>

   인증("로그인했는가")만 있고 인가 중 리소스 기반 검사("이 영웅의 주인이 요청자인가")가 빠진 IDOR다. `AuthorizationHandler<TRequirement, Hero>`를 만들어 `IAuthorizationService.AuthorizeAsync(user, hero, "HeroOwner")`로 검사하고 실패하면 403을 주거나, 조회 시 `WHERE OwnerId = 토큰의 playerId`를 함께 건다(보충). GUID는 추측을 어렵게 할 뿐 문제를 가린다. TCP 서버에서 패킷 핸들러마다 하던 소유 검사와 같은 원리다. → 코어 3 (3.4)

   </details>

3. **상황:** 로그인 API에 `options.AddPolicy("login", ...)`로 IP당 1분 5회 제한을 걸었다. 서버를 3대로 늘리자 공격자가 1분에 15번 시도에 성공했고, 반대로 같은 통신사 LTE를 쓰는 정상 유저들이 게임 API에서 429를 받는다는 문의가 왔다. 게임 API에도 IP 기준 정책을 그대로 썼다.
   **질문:** 두 문제의 원인과 대책은?

   <details markdown="1"><summary>답 확인</summary>

   ① 속도 제한 미들웨어의 카운터는 서버 프로세스 메모리에 있어 인스턴스끼리 합산되지 않는다. 정확한 전체 제한이 필요하면 Redis 같은 공유 저장소 기반 구현이나 API 게이트웨이·로드 밸런서의 제한을 쓴다. 로드 밸런서 뒤라면 `RemoteIpAddress`가 로드 밸런서 주소가 되므로 Forwarded Headers 설정도 확인한다. ② LTE/5G 망에서는 많은 사용자가 같은 공인 IP를 공유한다. 로그인 후 게임 API는 토큰 클레임의 플레이어 ID로 세고, 그러려면 `UseRateLimiter`를 `UseAuthentication` 뒤에 둔다. 또 기본 거절 코드는 503이므로 `RejectionStatusCode`를 429로 바꾼다. → 코어 4 (4.4)

   </details>

4. **상황:** 레이드 입장 조건(계정 레벨 30 이상)을 토큰의 `AccountLevel` 클레임으로 검사하는 핸들러를 만들었다. 레벨 29에서 로그인한 유저가 그 세션 중에 30을 찍었는데 입장이 거부되고, 반대로 레벨이 깎이는 패널티를 받은 유저는 계속 입장한다.
   **질문:** 원인과 올바른 위치는?

   <details markdown="1"><summary>답 확인</summary>

   토큰 클레임은 발급 시점의 사진이라 자주 바뀌는 게임 상태를 담으면 낡는다. TCP 세션 객체처럼 서버가 갱신해 주는 캐시가 아니다. 핸들러 안에서 DB를 조회하거나(핸들러는 DI를 쓸 수 있다) 엔드포인트에서 확인한다. 토큰에는 `playerId` 정도만 넣는다. → 코어 2·3 (2.1 보충, 3.3 보충)

   </details>

5. **상황:** 개발 중 `dotnet user-jwts create`로 만든 토큰은 잘 통과했는데, 2.3절처럼 `TokenValidationParameters`를 코드로 지정한 뒤로 같은 토큰이 401이 된다. 또 다른 개발자는 Swagger의 Authorize 칸에 `Bearer` 없이 토큰만 넣고 401을 받았다.
   **질문:** 각각의 원인은?

   <details markdown="1"><summary>답 확인</summary>

   ① user-jwts의 자동 연동은 `AddJwtBearer()`를 인자 없이 써서 `appsettings.Development.json`의 `Authentication:Schemes:Bearer` 규약을 따를 때 이야기다. 코드에서 발급자·대상·키를 직접 지정하면 user-jwts가 만든 값(발급자 `dotnet-user-jwts`, User Secrets의 키)과 달라 통과하지 못할 수 있다(보충). ② 헤더 값은 `Bearer `(공백 포함) + 토큰 형식이어야 하며, 헤더 이름이나 `Bearer`를 잘못 쓰거나 공백을 빼먹으면 401이다. → 코어 2 (2.4)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
제11부 인증과 보안 — "누가"(인증) → "해도 되나"(인가) → 경계 방어, 단 "내용이 정직한가"는 ( ? )
├─ 코어 1 인증 → 인가 파이프라인
│   ├─ 인증 = ____ (실패 ___) / 인가 = ____ (실패 ___)
│   ├─ API는 쿠키 대신 ____ 로 인증 / 결과는 ClaimsPrincipal → HttpContext.____
│   └─ 순서: 라우팅 → Use____ → Use____ → 엔드포인트 / [AllowAnonymous] 가 [Authorize] 보다 ( ? )
├─ 코어 2 JWT — 요청마다 들고 오는 신분증
│   ├─ 구조: ____ . ____ . ____ (Base64Url, 암호화 ( ? ), 숨기려면 ____)
│   ├─ 표준 클레임: sub / iss / ____ / iat / nbf / ____
│   ├─ 자체 완결형: 오프라인 검증 장점 ↔ ( ? ) 약점 → 짧은 수명 + ____ 토큰
│   ├─ TCP 세션과 비교: 신분이 사는 곳(세션 객체 vs ____) / 킥·밴 즉시성 ( O/X ) / 증설 시 ( ? )
│   ├─ 발급 3요소: Issuer / Audience / ____ (HS256 키 길이: 책 IDX10603 16자, .NET 8 ____ 32바이트)
│   └─ 로컬 테스트: dotnet ____ create (User Secrets + appsettings.____.json) / Swagger Authorize "Bearer "
├─ 코어 3 인가는 점점 세밀해진다
│   ├─ 역할: Roles="A,B" = ( ? ) / [Authorize] 여러 개 = ( ? ) / 두 책의 입장 차이
│   ├─ 클레임 정책: RequireAuthenticatedUser / RequireClaim / ____ (값은 대소문자 ( ? ))
│   ├─ 커스텀: 요구사항(____ 인터페이스, 요구사항끼리 ( ? )) + 핸들러(context.____, 핸들러끼리 ( ? ))
│   └─ 리소스 기반: IAuthorizationService.AuthorizeAsync(user, ____, policy) → ____ 방어
└─ 코어 4 경계 방어
    ├─ HTTPS: 평문 위험 / dev-certs / API는 HTTP를 ( ? ) / 리다이렉트 ___ / HSTS는 ____ 전용
    ├─ SQL 인젝션: LINQ·FromSql 보간 = 안전 / ____ + 문자열 연결 = 위험
    ├─ CORS: ____ 안의 JS 규칙 / 비밀번호 = ____ 로만 저장 / OWASP Top 10
    └─ Rate Limiting: 알고리즘 4종 / 파티션 키(로그인 전 ____, 후 ____) / 503 → ____ / 서버 여러 대 함정
```

### 2. 인출 질문

1. 인증과 인가를 정의하고, 각각 실패하면 어떤 상태 코드가 돌아오는지 말해 보세요. 왜 인증이 먼저인가요?

   <details markdown="1"><summary>답 확인</summary>

   인증은 요청을 보낸 사람이 누구인지 알아내는 과정이고, 인가는 그 사람이 요청한 행동이 허용되는지 판단하는 과정이다. 인증 실패는 `401 Unauthorized`, 인증은 됐지만 권한이 없으면 `403 Forbidden`이다. 누구인지 알아야 권한을 따질 수 있으므로 인증이 항상 먼저다. → 코어 1 (1.1)

   </details>

2. 인증 미들웨어와 인가 미들웨어는 각각 무엇을 하나요? 순서 규칙은?

   <details markdown="1"><summary>답 확인</summary>

   인증 미들웨어는 쿠키나 Bearer 토큰을 해석해 `ClaimsPrincipal`을 만들고 `HttpContext.User`에 넣는다. 인가 미들웨어는 라우팅이 고른 엔드포인트의 메타데이터(`[Authorize]` 등)를 읽어, 규칙을 만족하지 못하면 파이프라인을 끊는다. `UseAuthorization()`은 라우팅과 `UseAuthentication()` 뒤, 엔드포인트 실행 앞에 있어야 한다. → 코어 1 (1.2)

   </details>

3. 컨트롤러에 `[Authorize]`, 한 메서드에 `[AllowAnonymous]`가 붙어 있으면 그 메서드는 어떻게 되나요? Minimal API에서는 무엇을 쓰나요?

   <details markdown="1"><summary>답 확인</summary>

   `[AllowAnonymous]`가 `[Authorize]`보다 우선하므로 그 메서드는 익명으로 호출된다. Minimal API는 `RequireAuthorization()`/`AllowAnonymous()`를 쓰며 특성 방식과 동등하다. 게임 서버에서는 "기본은 잠금, 예외만 열기"가 실수를 줄인다(보충). → 코어 1 (1.2)

   </details>

4. JWT의 세 부분은 무엇이고, 서명은 무엇을 보장하며 무엇을 보장하지 않나요?

   <details markdown="1"><summary>답 확인</summary>

   헤더(서명 알고리즘, 예: `HS256`), 페이로드(클레임 모음), 서명(헤더와 페이로드를 비밀 키로 계산한 값)이다. 서명 덕분에 중간에 클레임을 바꾸면 검증에서 걸린다. 하지만 헤더와 페이로드는 Base64Url 인코딩일 뿐 암호화되지 않아 누구나 읽을 수 있으므로 민감한 값은 넣지 않는다(숨기려면 JWE). → 코어 2 (2.1)

   </details>

5. Bearer 토큰을 "돈"에 비유하는 이유와, URL 쿼리 문자열에 넣지 말라는 이유는?

   <details markdown="1"><summary>답 확인</summary>

   Bearer 토큰은 가진 사람이 곧 주인이라, 가지고 있으면 누구나 쓸 수 있다. 그래서 비밀번호처럼 지켜야 한다. 쿼리 문자열에 넣으면 로그에 남아 노출될 수 있다. → 코어 2 (2.1)

   </details>

6. 자체 완결형 액세스 토큰의 장점과 약점은 무엇이고, 약점을 어떻게 보완하나요?

   <details markdown="1"><summary>답 확인</summary>

   모든 정보가 토큰 안에 있어 오프라인으로 검증할 수 있는 것이 장점이지만, 그 때문에 발급 후 취소할 수 없다. 그래서 수명을 짧게 두고(책은 5분 정도의 예), 만료되면 리프레시 토큰으로 새 액세스 토큰을 받는다. 리프레시 토큰을 탈취당하면 사용자 행세가 가능하므로 더 철저히 보호한다. → 코어 2 (2.1)

   </details>

7. TCP 게임 서버의 로그인 세션과 JWT 인증은 "신분이 어디에 사는가", "언제 인증하는가", "강제 로그아웃이 즉시 되는가" 세 가지 면에서 어떻게 다른가요?

   <details markdown="1"><summary>답 확인</summary>

   TCP는 접속 직후 한 번 인증하고 신분이 서버 메모리의 세션 객체(소켓에 귀속)에 산다. 소켓을 끊고 세션을 지우면 즉시 끝난다. JWT는 요청마다 토큰의 서명·대상·만료를 검증하고, 신분은 클라이언트가 들고 다니는 토큰의 클레임에 산다. 서버는 세션 테이블을 찾지 않아 키만 공유하면 어느 인스턴스든 검증할 수 있지만, 이미 발급한 토큰은 만료 전까지 취소할 수 없다. 즉시 차단이 필요하면 차단 목록·리프레시 토큰 저장소 같은 서버 상태를 다시 들여와야 한다(보충). → 코어 2 (2.2)

   </details>

8. JWT 표준 클레임 여섯 가지와 그 뜻을 말해 보세요. 인증 미들웨어는 토큰에서 무엇을 확인하나요?

   <details markdown="1"><summary>답 확인</summary>

   `sub`(주체), `iss`(발급자), `aud`(대상), `iat`(발급 시각), `nbf`(이 시각 전엔 무효), `exp`(만료 시각). 인증 미들웨어는 서명, 대상(`aud`), 만료 여부를 확인한 뒤 통과하면 `ClaimsPrincipal`을 만들어 `HttpContext.User`에 넣는다. 서명 키 재료는 발급자와 검증하는 API가 공유해야 한다. → 코어 2 (2.1)

   </details>

9. 토큰 발급에 필요한 세 값은 무엇이고, 비밀 키는 어디에 두어야 하나요? 키 길이와 관련한 오류는?

   <details markdown="1"><summary>답 확인</summary>

   발급자(Issuer), 대상(Audience), 서명용 비밀 키. 책은 데모로 `appsettings.json`에 넣지만 실서비스에서는 Azure Key Vault 같은 안전한 저장소에 두라고 한다. 책은 HS256 키가 128비트를 넘어야 한다는 `IDX10603`(16자 이상)을 안내하지만, .NET 8의 라이브러리는 256비트(32바이트) 이상을 요구해 짧으면 `IDX10720`이 나므로 예제는 32자 이상 키를 쓴다(보충). 검증 쪽은 `TokenValidationParameters`에 같은 발급자·대상·키를 지정한다. → 코어 2 (2.3)

   </details>

10. 2.3절의 로그인 예제를 그대로 운영하면 왜 안 되나요? 게임 상태(골드·레벨)를 토큰에 넣지 않는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    비밀번호를 고정값과 비교하고 클라이언트가 보낸 `PlayerId`를 그대로 믿으므로, 고정 비밀번호를 아는 누구나 다른 플레이어의 토큰을 받을 수 있다. 실제로는 계정 DB의 비밀번호 해시와 비교해야 한다(책은 Identity의 `UserManager.CheckPasswordAsync`). 토큰은 누구나 읽을 수 있고 발급 후 취소도 어려우므로, 게임 상태는 서버 DB가 진실이어야 하고 토큰에는 `playerId` 정도만 넣는다. → 코어 2 (2.1, 2.3 보충)

    </details>

11. `dotnet user-jwts create`가 하는 세 가지 일은 무엇이고, 운영에서 쓰면 안 되는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    (1) User Secrets가 없으면 켜고 (2) 서명 키 재료를 User Secrets에 저장하고 (3) `appsettings.Development.json`에 유효한 대상·발급자 설정을 추가한 뒤 토큰을 출력한다. 이 토큰과 User Secrets는 암호화되지 않으므로 로컬 테스트용으로만 쓰고, 운영에서는 진짜 ID 공급자의 토큰을 쓴다. 그래서 도구는 `appsettings.json`이 아니라 Development 파일만 고친다. 2.3절처럼 코드에서 검증 옵션을 직접 지정하면 이 토큰이 통과하지 못할 수 있다(보충). → 코어 2 (2.4)

    </details>

12. `[Authorize(Roles = "A,B")]`와 `[Authorize(Roles = "A")]`·`[Authorize(Roles = "B")]`를 겹쳐 쓴 것은 어떻게 다른가요? 역할 기반에 대한 두 책의 입장 차이는?

    <details markdown="1"><summary>답 확인</summary>

    쉼표로 나열하면 그중 하나만 있어도 통과(OR), 여러 번 겹쳐 쓰면 모두 있어야 통과(AND)다. 역할이 부족하면 403이다. Web API 책은 역할 기반을 그대로 소개하지만, ASP.NET Core in Action 저자는 역할 기반은 주로 호환성 때문에 쓰이는 예전 방식이라 새 앱은 클레임 기반을 권하고 역할은 "클레임을 부여하는 기준"으로 쓰라고 한다. → 코어 3 (3.1)

    </details>

13. 정책 빌더의 간단한 메서드 세 가지는? 클레임을 비교할 때 대소문자에서 주의할 점은?

    <details markdown="1"><summary>답 확인</summary>

    `RequireAuthenticatedUser()`(로그인만 되면 통과), `RequireClaim(타입, 값들)`(클레임이 있고 값이 그중 하나), `RequireAssertion(함수)`(직접 짠 조건식이 true). `HasClaim`, `FindFirst`, `RequireClaim`은 타입은 대소문자 구분 없이 비교하지만 값은 구분하므로 값의 대소문자를 정확히 맞춰야 한다. 정책 이름은 상수로 두어 오타를 막는다. → 코어 3 (3.2)

    </details>

14. 커스텀 정책에서 요구사항과 핸들러의 AND/OR 규칙은? 조건을 만족하지 못할 때 핸들러는 보통 무엇을 하나요?

    <details markdown="1"><summary>답 확인</summary>

    정책이 만족되려면 모든 요구사항이 만족되어야 하고(AND), 한 요구사항은 핸들러 중 하나만 성공해도 만족된다(OR). 그래서 조건이 안 맞으면 보통 아무것도 하지 않는다(다른 핸들러가 만족시킬 수 있으므로). 확실히 막으려면 `context.Fail()`과 `InvokeHandlersAfterFailure = false`를 쓴다. 요구사항은 멤버 없는 마커 인터페이스 `IAuthorizationRequirement`를 구현하고 DI를 못 쓰지만, 핸들러는 DI를 쓸 수 있고 `IAuthorizationHandler`로 등록해야 한다. → 코어 3 (3.3)

    </details>

15. "계정 레벨 30 이상만 레이드 입장"을 토큰 클레임으로 판단하면 어떤 위험이 있나요?

    <details markdown="1"><summary>답 확인</summary>

    레벨처럼 자주 바뀌는 게임 상태를 토큰 클레임으로 판단하면 토큰 발급 시점의 낡은 값으로 판단하게 된다. 실제 서버는 핸들러 안에서 DB를 조회하거나(핸들러는 DI 사용 가능) 엔드포인트에서 확인하는 편이 안전하다. → 코어 3 (3.3 보충)

    </details>

16. IDOR란 무엇이고 해결책은 무엇인가요? 버튼 숨기기나 GUID 사용은 왜 해결책이 아닌가요?

    <details markdown="1"><summary>답 확인</summary>

    URL에 드러난 DB 번호(예: `/Recipes/Edit/120`)를 바꿔 남의 데이터에 접근하는 공격이다. 해결책은 리소스 기반 인가로, `IAuthorizationService.AuthorizeAsync(user, resource, policy)`로 리소스 주인을 확인하고 실패하면 403을 준다(또는 도메인 로직 검사, 조회에 `OwnerId` 조건 추가). UI에서 버튼을 숨기는 것은 보안 수단이 아니고, GUID는 추측을 어렵게 할 뿐 문제를 가린다. → 코어 3 (3.4)

    </details>

17. 운영 서버가 HTTPS를 써야 하는 이유와, 웹 API에 가장 좋은 방법은? HSTS가 모바일 게임에 효과가 없는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    HTTP는 평문이라 같은 네트워크의 공격자가 비밀번호·토큰을 읽거나 요청을 조작할 수 있다. `UseHttpsRedirection()`(기본 307)으로 리다이렉트할 수 있지만, HTTP 요청이 한 번만 나가도 위험할 수 있으므로 API는 아예 HTTP를 듣지 않는 것이 최선이다(예: `ASPNETCORE_URLS=https://*:5001`). HSTS는 브라우저에서 시작된 요청에만 의미가 있어 서버 간 통신이나 모바일 앱에는 효과가 없다. 개발 인증서(`dotnet dev-certs https --trust`)는 운영에 쓸 수 없다. → 코어 4 (4.1)

    </details>

18. SQL 인젝션에 안전한 쿼리 형태와 위험한 형태를 구분해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    안전: EF Core LINQ(자동 매개변수화), `FromSql($"... {name}")`(보간 문자열이 `FormattableString`으로 DB 매개변수가 됨), 자리 표시자 `{0}`를 두고 값을 따로 넘기는 `FromSqlRaw`. 위험: `FromSqlRaw`에 사용자 입력을 문자열로 이어 붙이는 것. 컬럼명처럼 매개변수화할 수 없는 부분은 개발자가 직접 책임진다. 원칙은 "입력을 SQL과 분리해서 넘긴다". → 코어 4 (4.2)

    </details>

19. CORS는 누구에게 적용되는 규칙이고, 네이티브 모바일 게임 서버에 언제 필요해지나요? 사용자 데이터 보호 원칙도 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    브라우저 안의 JavaScript가 다른 출처(스킴·도메인·포트 중 하나라도 다름)의 API를 부르는 것을 제어하는 규칙이다. 네이티브 앱은 브라우저가 아니므로 영향을 받지 않는다고 볼 수 있고(보충), 웹 기반 운영 도구를 붙일 때 필요하다. 실제로 필요할 때까지 켜지 말고, `WithOrigins` 주소 끝에 `/`를 붙이지 않는다. 데이터 보호: 필요 없는 데이터는 저장하지 않기, 비밀번호는 BCrypt/PBKDF2 같은 비싼 해시로만, MFA 허용, 약한 비밀번호 차단, 계정 존재 여부 노출 금지. → 코어 4 (4.3)

    </details>

20. 속도 제한에서 무엇을 기준으로 셀지(파티션 키)는 어떻게 정하나요? 모바일 통신망에서 로그인 후까지 IP로 세면 무슨 문제가 생기나요?

    <details markdown="1"><summary>답 확인</summary>

    로그인처럼 인증 전 요청은 IP로, 로그인 후 게임 API는 토큰 클레임의 플레이어 ID로 센다. LTE/5G 망에서는 많은 사용자가 같은 공인 IP를 공유하므로 IP로 세면 엉뚱한 사용자가 함께 막힌다. 플레이어 ID로 세려면 `UseRateLimiter`를 `UseAuthentication` 뒤에 두어야 `User`가 채워져 있다. → 코어 4 (4.4)

    </details>

21. ASP.NET Core 속도 제한 미들웨어의 기본 거절 상태 코드는? 서버를 여러 대로 늘리면 어떤 함정이 있나요?

    <details markdown="1"><summary>답 확인</summary>

    기본은 `503`이므로 `RejectionStatusCode`를 `429 Too Many Requests`로 바꾼다. 카운터가 서버 프로세스 메모리에 있어 서버를 3대로 늘리면 사실상 3배까지 보낼 수 있다. 정확한 전체 제한에는 Redis 같은 공유 저장소나 API 게이트웨이·로드 밸런서의 기능을 쓴다. 로드 밸런서 뒤에서는 `RemoteIpAddress`가 로드 밸런서 주소가 되므로 Forwarded Headers 설정도 확인한다. 속도 제한은 남용을 줄일 뿐 치팅 방지 자체는 아니다. → 코어 4 (4.4 보충)

    </details>

### 3. 기억 고리

- **C++ 유추:** TCP 로그인 세션(`socket → Session{accountId}`) ≈ JWT 인증(`요청 → ClaimsPrincipal{NameIdentifier}`). 둘 다 핸들러 실행 전에 "요청의 주인"을 확정한다. ⚠️ 깨지는 곳: 세션은 서버 메모리의 상태라 끊으면 즉시 끝나지만, JWT는 클라이언트가 들고 다니는 서명된 사본이라 만료 전에는 취소되지 않고, 복사만 하면 누구나 쓸 수 있으며, 게임 상태를 캐시하는 곳이 아니다.
- **C++ 유추:** 패킷 핸들러의 `ownerId == session.accountId` 검사 ≈ 리소스 기반 인가. ⚠️ 깨지는 곳: HTTP는 대상 ID가 URL에 그대로 보여 조작이 더 쉽고, 검사를 정책·핸들러로 선언적으로 분리할 수 있다.
- **비유:** 인증/인가 = 공항(책의 비유). 여권을 보여 주고 탑승권을 받는 것이 인증, 탑승권 번호로 보안 검색대를 지나고 등급 카드(Gold)로 라운지에 들어가는 것이 인가다. ⚠️ 비유가 깨지는 지점: 탑승권과 달리 Bearer 토큰은 훔친 사람이 그대로 쓸 수 있고, 누구나 내용을 읽을 수 있으며, 발급 후 취소할 수 없다.
- **비유:** JWT = 투명한 봉투에 든 서명된 편지. 누구나 내용을 읽을 수 있지만, 서명 때문에 내용을 바꾸면 들킨다. ⚠️ 비유가 깨지는 지점: 서명을 확인하려면 받는 쪽(API)도 같은 키 재료를 가지고 있어야 하고, `ReadJwtToken`처럼 서명을 확인하지 않고 읽은 값은 믿으면 안 된다.
- **묶음(3의 법칙):** 인가의 세 단계 = **역할**(묶음 권한) → **클레임 정책**(키-값 조건) → **리소스 기반**(대상 데이터의 주인). 기준: 판단에 필요한 정보가 토큰 밖으로 얼마나 나가는가.
- **대칭·순서:** 401(누구인지 모름) ↔ 403(알지만 안 됨), 요구사항 AND ↔ 핸들러 OR, 역할 쉼표 OR ↔ 겹쳐 쓰기 AND, 상태 저장 세션(즉시 취소·조회 필요) ↔ 무상태 JWT(취소 불가·조회 없음). 파이프라인 순서: 라우팅 → 인증 → 인가 → (속도 제한) → 엔드포인트.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "로그인부터 `/api/heroes/{id}` 삭제 요청이 처리되기까지 서버 안에서 일어나는 일"을 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "왜 HTTP API에선 로그인 세션을 서버에 안 들고 있느냐, 그럼 밴은 어떻게 하느냐"는 질문에 TCP 세션 맵과 대비해 1분 안에 답해 보세요(요청마다 검증, 키만 공유하면 어느 서버든 처리, 대신 즉시 취소 불가 → 짧은 수명·리프레시 토큰·필요하면 서버 상태).
- **랜덤 논리 게임:** A "인가는 역할 기반으로 충분하다(단순하고 이해하기 쉽다)" vs B "새 앱은 클레임 기반 정책을 써야 한다(역할은 클레임을 부여하는 기준일 뿐)" — 두 책의 입장을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 JWT 구조와 인증·인가 미들웨어, IDOR 방어를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제12부. 백그라운드 서비스·캐시·외부 호출

> **🎮 게임 서버 개발자에게** — 이 부는 게임 서버의 타이머 스레드·틱 루프(주기 정산), 기획 데이터·랭킹을 들고 있는 전역 메모리 캐시, 결제 영수증 검증 같은 외부 서버 호출, 그리고 서버 종료 시 스레드를 멈추는 종료 플래그에 해당하는 일을 ASP.NET Core에서 하는 방법이다. 결정적 차이는 둘이다. 첫째, 상주 작업이 **DI 컨테이너의 수명 규칙** 안에 있어서 싱글톤 일꾼은 요청 단위 객체(`DbContext`)를 붙잡을 수 없고 매번 스코프를 만들어 빌려 쓴다. 둘째, 웹 서버는 **같은 프로세스를 여러 대 띄운다는 전제**라서 프로세스 메모리에 둔 타이머와 캐시가 인스턴스마다 따로 돈다. 종료는 C++20 `std::stop_token`처럼 협력적이지만, 취소가 예외로 전파되고 토큰을 비동기 호출 체인 끝까지 넘겨야 한다는 점이 다르다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 서버를 두 대로 늘렸더니 1분마다 도는 방치 보상 정산이 두 번씩 실행되어 골드가 두 배로 쌓인다 (백그라운드 서비스 중복 실행).
> - 외부 결제 검증 서버가 느려지자 우리 API 전체가 줄줄이 느려지고, 트래픽이 몰린 날 "소켓을 열 수 없다"는 오류가 나며, 자동 재시도 때문에 결제가 두 번 승인될 뻔했다 (`IHttpClientFactory`·타임아웃·재시도·멱등성).
> - 점검 배포 때 정산 루프가 저장 도중에 끊기거나, 반대로 종료가 한참 걸린다. 서버마다 랭킹이 다르게 보인다는 문의도 들어온다 (취소 토큰 전달·캐시 공유 범위).

## 코어 — 이것만은 100%

> **한 문장:** 요청 밖의 주기 작업은 싱글톤 `BackgroundService`에서 매번 스코프를 직접 만들어 돌리고, 자주 읽히는 공용 데이터는 성격에 맞는 캐시에 두며 목록은 페이지로 잘라 읽기 부하를 줄이고, 외부 호출은 `IHttpClientFactory`와 타임아웃·재시도·서킷 브레이커로 감싸며, 이 모든 작업은 취소 토큰을 끝까지 전달해 협력적으로 멈춘다.

1. **요청 밖의 상주 일꾼 — `BackgroundService`와 직접 만드는 스코프** — `BackgroundService`의 `ExecuteAsync`에서 `while` + `Task.Delay`로 주기 작업을 돌린다. 등록은 `AddHostedService`, 수명은 싱글톤이라 `DbContext`(스코프)를 생성자로 받을 수 없으므로 반복마다 `CreateScope()`로 새 스코프를 만들고 `using`으로 해제한다. 서버가 여러 대면 인스턴스마다 중복 실행된다.
2. **읽기 부하 줄이기 — 캐시는 위치·공유·무효화로 고르고, 목록은 페이지로 자른다** — 인메모리(빠름, 인스턴스별, 재시작 시 소멸), 분산(공유·재시작 후 유지, 직렬화·네트워크 비용), 응답 캐시(클라이언트 쪽, 서버가 무효화 불가), 출력 캐시(서버 쪽, 무효화 가능). 만료는 절대 + 슬라이딩, `GetOrCreateAsync`로 null도 캐시. 큰 목록은 필터 → 정렬 → `Skip/Take`로 잘라 `PaginatedList`로 준다.
3. **외부 호출은 팩토리와 회복 탄력성으로 감싼다** — `new HttpClient()`를 매번 만들면 소켓 고갈, 싱글톤 하나면 DNS 변경 미감지. `IHttpClientFactory`가 핸들러를 풀로 재사용하고 주기적으로 교체해 둘 다 피한다. 외부 서버는 언젠가 느려지거나 실패하므로 타임아웃·재시도(지수 백오프 + 지터)·서킷 브레이커를 붙이되, 재시도는 멱등한 요청에만.
4. **취소는 협력적이다 — 토큰을 끝까지 넘겨 스스로 멈춘다** — `CancellationTokenSource`가 신호를 보내고, 토큰을 받은 코드가 아래 계층까지 전달하거나 폴링해서 스스로 멈추며, 취소는 `OperationCanceledException`으로 표현된다. 앱 종료는 `stoppingToken`으로, 외부 호출 시간 제한은 타임아웃 토큰으로 같은 방식을 쓴다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 시작 때 띄우는 타이머 스레드·틱 루프(`std::thread` + `sleep_until`, 타이머 큐) | `BackgroundService.ExecuteAsync` + `Task.Delay(…, stoppingToken)`, `AddHostedService` | 앱이 살아 있는 동안 요청과 무관하게 주기적으로 일한다. 서버 시작 때 함께 뜨고 종료 때 함께 멈춘다 | 스레드를 직접 만들지 않고 `async` 루프로 돈다(`await Task.Delay` 대기 중에는 스레드를 점유하지 않는다). 수명은 호스트가 관리하고(`StartAsync`/`StopAsync`), 서버를 여러 대 띄우면 같은 루프가 인스턴스마다 돌아 중복 실행된다 |
| 틱 루프가 들고 있는 전역 DB 커넥션 / 스레드별 커넥션 | 반복마다 `IServiceScopeFactory.CreateScope()` → `DbContext` → `using`으로 해제 | 작업 단위마다 DB 작업 객체를 확보하고 다 쓰면 반납한다 | 객체를 직접 `new` 하지 않고 DI 컨테이너에서 꺼낸다. 싱글톤(백그라운드 서비스)은 스코프 수명 객체를 생성자로 받을 수 없고, `DbContext`는 스레드에 안전하지 않으며 변경 추적 데이터가 쌓이므로 오래 들고 있으면 안 된다 |
| 서버 메모리에 올려 둔 기획 데이터·랭킹 전역 맵 | `IMemoryCache`, `IDistributedCache`(Redis 등), 응답·출력 캐시 | 자주 읽고 드물게 바뀌는 값을 DB 대신 메모리에서 꺼낸다 | 게임 서버는 보통 "이 프로세스가 진실"이지만, 웹 서버는 인스턴스가 여러 대라 프로세스 메모리 캐시는 서로 다른 값을 들 수 있다. 공유하려면 분산 캐시(직렬화·네트워크 비용)로 간다. 만료 정책과 null 결과 캐시도 직접 정해야 한다 |
| 결제 영수증 검증용 HTTP 호출(libcurl 등)과 연결 재사용, 재시도 루프 | `IHttpClientFactory` 타입 클라이언트 + `AddStandardResilienceHandler()` | 연결을 재사용해야 하고, 외부 서버 실패에 타임아웃·재시도로 대비한다 | `HttpClient`는 `IDisposable`이라 `using`으로 매번 만들고 버리기 쉬운데, 그러면 소켓이 `TIME_WAIT`로 남아 포트가 바닥난다. 반대로 영원히 하나만 쓰면 DNS 변경을 못 따라간다. 팩토리가 핸들러 수명을 따로 관리해 둘 다 해결한다 |
| 종료 플래그(`std::atomic<bool> running`) 확인 후 `join`, C++20 `std::jthread`/`std::stop_token` | `CancellationTokenSource` / `CancellationToken`, `ThrowIfCancellationRequested()` | 취소는 협력적이다. 요청하는 쪽과 확인하는 쪽이 나뉘고, 확인하지 않는 코드는 멈추지 않는다 | 취소가 `OperationCanceledException` **예외**로 전파된다. 토큰을 `Task.Delay`·DB·HTTP 호출에 넘기면 대기 중에도 즉시 깨어나므로, 플래그를 루프 맨 위에서만 보는 것으로는 부족하고 비동기 호출 체인 끝까지 토큰을 넘겨야 한다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·그림·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. `BackgroundService`의 생성자로 `GameDbContext`를 주입받으면 왜 문제가 될까? 서버를 두 대 띄우면 백그라운드 서비스는 몇 번 실행될까?
> 2. 요청마다 `using var client = new HttpClient()`를 쓰면 트래픽이 많을 때 무슨 일이 생길까? 반대로 하나만 계속 쓰면? 결제 승인 POST를 실패할 때마다 자동으로 재시도하면 어떤 사고가 날 수 있을까?
> 3. 서버 두 대가 각자 `IMemoryCache`에 랭킹을 캐시하면 무엇이 어긋날까?
> 4. `CancellationToken`으로 "취소"를 요청하면 실행 중인 코드는 강제로 멈출까?
>
> **처리법:** 🛠 실습 `BackgroundService`+`AddHostedService`, `IServiceScopeFactory.CreateScope()`, `AddMemoryCache`+`GetOrCreateAsync`, `AddHttpClient<T>()`+`AddStandardResilienceHandler()`, `PaginatedList<T>`, `new CancellationTokenSource(TimeSpan)` → 읽자마자 직접 실행 · 🗺 관계도 싱글톤 백그라운드 서비스 → 스코프 직접 생성 → `DbContext`, 캐시 4종(위치·공유·무효화 기준), `HttpClient` 수명 ↔ 핸들러 수명 분리 · 🔗 유추 `BackgroundService` ≈ 앱과 함께 출근해 퇴근 신호(`stoppingToken`)까지 일하는 상주 일꾼 — 서버를 여러 대 띄우면 일꾼도 여러 명이 되어 같은 일을 중복한다는 점에서 어디서 깨지는지 · 📦 카드로 `TIME_WAIT` 약 240초(윈도우), 핸들러 교체 약 2분, 출력 캐시 기본 60초·GET/HEAD 200만 지원, `PaginatedList` 속성 이름들, `OperationCanceledException`

**이 부의 학습 목표**
- 요청과 상관없이 주기적으로 도는 작업(`BackgroundService`)을 만들고, 그 안에서 DbContext 같은 스코프 서비스를 안전하게 쓴다.
- 메모리·분산·응답·출력 캐시의 차이를 알고, 상황에 맞는 캐시를 고른다.
- `IHttpClientFactory`로 외부 API를 호출하고(타임아웃·재시도 포함), 큰 목록은 페이지 단위로 나눠 돌려주며, 취소 토큰으로 작업을 깔끔히 멈춘다.

---

## 코어 1. 요청 밖의 상주 일꾼 — `BackgroundService`와 직접 만드는 스코프

> 원래 "제1장. 백그라운드에서 일하기"(12.1, 12.2). 앱과 함께 뜨고 지는 주기 작업의 틀(1.1)과, 그 일꾼이 싱글톤이라 생기는 수명 문제를 스코프를 직접 만들어 푸는 방법(1.2).

### 1.1 BackgroundService / IHostedService로 주기 작업 실행
**한 줄 요약:** 웹 요청이 없어도 앱이 살아 있는 동안 계속 돌아가는 "상주 일꾼"을 만들려면 `BackgroundService`를 상속하고 `ExecuteAsync`를 구현한다.

> 📖 출처: ASP.NET Core in Action ASP.NET Core in Action 34장 "34.1 Running background tasks with IHostedService" (텍스트 L42706-43005)

**핵심 설명**
- 책은 백그라운드 작업을 "요청에 대한 응답이 아니라 뒤에서 처리하는 일"로 설명한다. 이메일 큐 처리, 메시지 소비, 일일 정산 같은 배치가 예다. 이런 일을 뒤로 빼면 화면(API 응답)이 느려지지 않는다.
- `IHostedService`는 `StartAsync`와 `StopAsync` 두 메서드를 가진 인터페이스다. 앱 시작 직후 시작되고 앱 종료 직전에 멈춘다. (책은 기본 웹 서버 Kestrel도 사실 이 인터페이스로 돌아간다고 언급한다.)
- `StartAsync`는 앱 시작 과정의 일부로 실행되므로 여기서 `await`로 오래 붙잡으면 앱 시작이 막힌다. 그래서 오래 도는 작업에는 추상 클래스 `BackgroundService`를 쓰고 `ExecuteAsync` 하나만 재정의하는 것이 권장 패턴이다.
- `ExecuteAsync`가 받는 `CancellationToken`은 앱이 종료될 때 신호를 준다. 책의 예제는 `while` 루프로 일을 하고 `Task.Delay(5분, stoppingToken)`로 쉰다.
- 등록은 `AddHostedService<T>()`. **싱글톤**으로 등록된다.
- 책의 예제에서 백그라운드 서비스가 값을 캐시에 채워 두고, API는 그 캐시만 읽는다. 이러면 API가 항상 빠르다. 단점은 첫 갱신 전에 요청이 오면 값이 없다는 것. 이를 막으려면 `StartAsync`에서 첫 갱신을 마칠 때까지 시작을 막는 방법도 있지만, 실패하면 앱이 아예 시작하지 못할 수 있다고 책은 경고한다.

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

public class IdleRewardService : BackgroundService
{
    private readonly ILogger<IdleRewardService> _logger;

    public IdleRewardService(ILogger<IdleRewardService> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("보상 계산 주기 실행: {Now}", DateTime.UtcNow);
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
```

```csharp
// Program.cs (위 클래스는 별도 파일)
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHostedService<IdleRewardService>();
var app = builder.Build();
app.MapGet("/", () => "ok");
app.Run();
```

**방치형 RPG 서버에서는**: "1분마다 전체 영웅의 방치 보상을 정산" 같은 주기 작업의 틀이 바로 이것이다.

> 🔧 보충(책 외): 책은 여러 서버 인스턴스를 띄우면 각 인스턴스마다 백그라운드 서비스가 중복 실행된다고 지적하고(ASP.NET Core in Action 34.3.3, 텍스트 L43814-43856), 해결책으로 별도 워커 앱 분리나 Quartz.NET 클러스터링을 소개한다. 방치형 서버에서 보상을 "접속 시 경과 시간으로 계산"하는 방식은 백그라운드 정산 자체를 줄이는 대안이지만, 이는 게임 설계 관점의 제안이며 책의 내용이 아니다.

### 1.2 스코프가 있는 서비스를 백그라운드에서 쓰기
**한 줄 요약:** 백그라운드 서비스는 싱글톤이라 DbContext(스코프)를 생성자로 받을 수 없으니, 일할 때마다 직접 스코프를 만들어 꺼내 쓴다.

> 📖 출처: ASP.NET Core in Action ASP.NET Core in Action 34장 "34.1.2 Using scoped services in background tasks" (텍스트 L43007-43118), Entity Framework Core in Action EF Core in Action 5장 "5.11 Running parallel tasks: How to provide the DbContext" (텍스트 L9455-9654)

**핵심 설명**
- 백그라운드 서비스는 앱 시작 때 한 번만 만들어져 싱글톤이 된다. 싱글톤은 자기보다 수명이 짧은 서비스(스코프)를 생성자로 받을 수 없다([제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 "captive dependency" 문제).
- 웹 요청에서는 프레임워크가 요청마다 스코프를 만들어 준다. 백그라운드에는 요청이 없으니 스코프도 없다. 해결책은 **직접 만드는 것**이다.
- ASP.NET Core in Action은 `IServiceProvider.CreateScope()`를, Entity Framework Core in Action은 `IServiceScopeFactory`를 주입받아 `CreateScope()`하는 방식을 보여 준다. 스코프에서 `ServiceProvider.GetRequiredService<DbContext>()`로 꺼낸다.
- 반드시 `using`으로 스코프를 해제해야 한다. 그래야 스코프가 만든 `IDisposable` 서비스가 정리되어 메모리 누수를 막는다(ASP.NET Core in Action).
- EF Core의 DbContext는 스레드 안전하지 않다. 병렬로 도는 작업에 같은 인스턴스를 공유하면 예외가 난다. 또 반복 실행할 때 매번 새 DbContext를 써야 지난 실행의 추적 데이터가 영향을 주지 않는다(Entity Framework Core in Action).
- Entity Framework Core in Action의 예제는 1시간마다 리뷰 수를 세어 로그로 남기며, `stoppingToken`을 `CountAsync`에 전달한다.

```csharp
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

public class Hero
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public long Gold { get; set; }
    public long GoldPerMinute { get; set; }
}

public class GameDbContext : DbContext
{
    public GameDbContext(DbContextOptions<GameDbContext> options) : base(options) { }
    public DbSet<Hero> Heroes => Set<Hero>();
}

public class GoldTickService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GoldTickService> _logger;

    public GoldTickService(IServiceScopeFactory scopeFactory, ILogger<GoldTickService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await DoWorkAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private async Task DoWorkAsync(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope(); // 반복마다 새 스코프
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var heroes = await db.Heroes.ToListAsync(stoppingToken);
        foreach (var h in heroes) h.Gold += h.GoldPerMinute;
        await db.SaveChangesAsync(stoppingToken);
        _logger.LogInformation("{Count}명 정산 완료", heroes.Count);
    }
}
```

**방치형 RPG 서버에서는**: 주기 정산에서 Hero 테이블을 갱신할 때 이 패턴이 그대로 쓰인다. 반복마다 스코프를 새로 만드는 것이 핵심이다.

> 🔧 보충(책 외): 위 예제는 영웅 전체를 메모리에 올려 갱신하므로 규모가 커지면 부적합하다. 실제로는 일괄 업데이트나 배치 분할을 고려해야 한다([제10부](10_제10부_EF_Core_데이터_접근.md) 참고). 책의 예는 단순한 카운트/저장 수준이다.

---

## 코어 2. 읽기 부하 줄이기 — 캐시는 위치·공유·무효화로 고르고, 목록은 페이지로 자른다

> 원래 "제2장. 캐시와 외부 호출"의 12.3(캐싱)과 12.5(페이지네이션). 둘 다 "DB와 네트워크에 가는 읽기 부담을 줄인다"는 같은 목적이라 한 코어로 묶었다: 같은 데이터를 반복해서 꺼내지 않기(2.1), 많은 데이터를 한 번에 꺼내지 않기(2.2).

### 2.1 캐싱: 메모리, 분산, 응답, 출력 캐시
**한 줄 요약:** 자주 읽히고 잘 안 바뀌는 데이터는 DB에서 매번 꺼내지 말고 임시 저장소(캐시)에 두고 재사용한다.

> 📖 출처: Web API Development with ASP.NET Core 8 Web API Development with ASP.NET Core 8, 15장 "Optimizing the performance by implementing caching" (텍스트 L22364-23024)

**핵심 설명**
책은 네 가지를 소개한다.
1. **인메모리 캐시(`IMemoryCache`)**: 앱 프로세스의 메모리에 키-값으로 저장. 빠르고 쉽지만 앱을 재시작하면 사라지고, 서버를 여러 대 띄우면 인스턴스끼리 공유되지 않는다. 등록은 `AddMemoryCache()`.
2. **분산 캐시(`IDistributedCache`)**: Redis, SQL Server 같은 공유 저장소. 여러 인스턴스가 함께 쓰고 재시작해도 남는다. 대신 네트워크 I/O가 늘고, 키는 문자열이어야 하며 값은 `byte[]`(또는 문자열)라 직렬화가 필요하다.
3. **응답 캐시**: HTTP `Cache-Control` 헤더로 클라이언트나 중간 프록시(CDN 등)가 저장하게 하는 방식(`[ResponseCache(Duration = 60)]`). 브라우저가 `max-age=0`을 보내면 효과가 없어지는 등 클라이언트 설정에 좌우되고, 서버가 클라이언트에 저장된 응답을 무효화할 수 없다. (책은 서버 쪽 응답 캐시 미들웨어가 따로 있다고만 언급하고 다루지 않는다.)
4. **출력 캐시(ASP.NET Core 7.0+)**: 서버 쪽 미들웨어로 캐시 동작을 설정하므로 클라이언트의 HTTP 캐시 설정과 무관하고, 데이터가 바뀌면 서버에서 무효화할 수 있다. Redis 같은 외부 저장소도 쓸 수 있다. 다만 GET/HEAD 요청의 200 OK 응답만 지원하고 `Authorization`, `Set-Cookie` 헤더는 지원하지 않는다. 기본 만료는 60초이며 `OutputCache` 특성에 정책 이름을 주어 엔드포인트마다 만료를 달리할 수 있다.

주의할 점(책 내용):
- **만료 정책**: 절대 만료(정해진 시간 후 삭제), 슬라이딩 만료(안 쓰면 삭제). 슬라이딩만 쓰면 계속 살아남을 수 있으니 절대 만료를 함께 둔다.
- **`GetOrCreateAsync`**: `TryGetValue`로 확인한 뒤 결과가 있을 때만 `Set`하면, 존재하지 않는 ID는 캐시가 채워지지 않아 매 요청이 DB를 친다. `GetOrCreateAsync`는 null 결과도 캐시하므로 이를 막아 준다.
- **크기 제한**: 큰 객체를 캐시할 때는 `SetSize`, `Size`, `SizeLimit`으로 캐시 크기를 제한할 수 있다.
- **키 설계**: 사용자별 데이터는 키에 사용자 ID를 넣어 다른 사용자에게 섞이지 않게 한다.
- 캐시를 갱신할 때는 DB를 먼저 조회한 뒤 캐시를 교체한다(먼저 지우면 그 사이 요청이 DB로 몰린다).
- 캐시를 쓸 수 없을 때 원본 데이터 저장소로 대체(fallback)하는 경로를 둔다.
- 인메모리 캐시를 여러 인스턴스에서 쓰려면 같은 사용자를 같은 인스턴스로 보내는 세션 어피니티가 필요하다고 책은 설명하며, 대안이 분산 캐시다. 메모리 캐시를 먼저 보고 없으면 분산 캐시를 조회하는 식으로 둘을 함께 쓸 수도 있다고 한다.

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Memory;

public record RankEntry(string Name, long Gold);

public class RankingService
{
    private readonly IMemoryCache _cache;

    public RankingService(IMemoryCache cache)
    {
        _cache = cache;
    }

    public Task<List<RankEntry>?> GetTop10Async()
    {
        return _cache.GetOrCreateAsync("ranking:top10", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
            await Task.Delay(100); // DB 조회를 흉내 낸 지연
            return new List<RankEntry> { new("용사", 12000), new("궁수", 9800) };
        });
    }
}
```

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<RankingService>();
var app = builder.Build();
app.MapGet("/api/ranking", (RankingService s) => s.GetTop10Async());
app.Run();
```

**방치형 RPG 서버에서는**: 랭킹, 상점 목록, 게임 설정 데이터처럼 모든 유저가 똑같이 보는 값이 캐시 후보다. 반대로 각 유저의 골드 잔액처럼 자주 바뀌는 값은 캐시하지 않는 편이 안전하다.

> 🔧 보충(책 외): 캐시 대상 선정은 게임 설계 판단이다. 예제의 `entry.AbsoluteExpirationRelativeToNow` 설정은 .NET 표준 API로, 책은 같은 옵션을 `MemoryCacheEntryOptions`로 보여 준다.

### 2.2 페이지네이션
**한 줄 요약:** 목록은 한 번에 다 주지 말고 "몇 번째 페이지, 몇 개씩"으로 잘라 주고, 다음 페이지가 있는지도 알려 준다.

> 원래 12.5. 원문에서는 HttpClientFactory(12.4) 뒤에 있었다.

> 📖 출처: Web API Development with ASP.NET Core 8 Web API Development with ASP.NET Core 8, 15장 "Using pagination for large collections" (텍스트 L22091-22178)

**핵심 설명**
- 큰 컬렉션을 통째로 돌려주면 서버 조회·처리 시간이 길어지고, 응답이 커져 네트워크가 막히고, 클라이언트도 파싱·화면 그리기에 힘들어진다고 책은 설명한다.
- 구현은 EF Core의 `Skip()`과 `Take()`로 한다. 읽기 전용이면 `AsNoTracking()`을 함께 쓴다.
- 클라이언트가 "다음 페이지가 있나?"를 알 수 있도록 `PageIndex`, `PageSize`, `TotalPages`, `HasPreviousPage`, `HasNextPage`, `Items`를 담은 `PaginatedList<T>` 클래스를 만들어 응답한다.
- 순서: **필터링(Where) → 정렬(OrderBy) → 페이징(Skip/Take)**. 먼저 걸러서 정렬 대상을 줄이는 것이 효율적이다.
- (같은 Web API Development with ASP.NET Core 8은 GraphQL에서 커서 방식과 오프셋 방식도 소개하지만, 이 책에서는 다루지 않는다.)

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;

public class PaginatedList<T> where T : class
{
    public int PageIndex { get; }
    public int PageSize { get; }
    public int TotalPages { get; }
    public List<T> Items { get; } = new();

    public PaginatedList(List<T> items, int count, int pageIndex = 1, int pageSize = 10)
    {
        PageIndex = pageIndex;
        PageSize = pageSize;
        TotalPages = (int)Math.Ceiling(count / (double)pageSize);
        Items.AddRange(items);
    }

    public bool HasPreviousPage => PageIndex > 1;
    public bool HasNextPage => PageIndex < TotalPages;
}

public class Hero
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public long Gold { get; set; }
}

public class GameDbContext : DbContext
{
    public GameDbContext(DbContextOptions<GameDbContext> options) : base(options) { }
    public DbSet<Hero> Heroes => Set<Hero>();
}

public static class HeroQueries
{
    public static async Task<PaginatedList<Hero>> GetPageAsync(
        GameDbContext db, int pageIndex, int pageSize)
    {
        var query = db.Heroes.AsNoTracking().OrderByDescending(h => h.Gold);
        var count = await query.CountAsync();
        var items = await query.Skip((pageIndex - 1) * pageSize).Take(pageSize).ToListAsync();
        return new PaginatedList<Hero>(items, count, pageIndex, pageSize);
    }
}
```
엔드포인트에서는 `GET /api/heroes?pageIndex=1&pageSize=10`처럼 두 값을 쿼리 문자열로 받아 `HeroQueries.GetPageAsync`를 호출하면 된다.

**방치형 RPG 서버에서는**: 랭킹 목록, 우편함, 인벤토리 목록 같은 "많아질 수 있는 목록" API에 적용한다.

> 🔧 보충(책 외): 클라이언트가 `pageSize=100000`처럼 큰 값을 보내는 것을 막기 위해 서버에서 상한을 두는 것이 안전하다. 이 상한 검증은 책의 예제에는 없다.

---

## 코어 3. 외부 호출은 팩토리와 회복 탄력성으로 감싼다

> 원래 "제2장. 캐시와 외부 호출"의 12.4(HttpClientFactory)와 그 끝의 보강 "외부 호출 실패에 대비하기". 연결을 어떻게 만들고 재사용하는가(3.1)와, 상대가 느리거나 실패할 때 어떻게 버티는가(3.2).

### 3.1 HttpClientFactory
**한 줄 요약:** 외부 API를 호출할 때는 `new HttpClient()`를 직접 만들지 말고 `IHttpClientFactory`(또는 타입 클라이언트)를 DI로 받아 쓴다.

> 📖 출처: ASP.NET Core in Action 33장 "Calling remote APIs with IHttpClientFactory" 33.1~33.2 (텍스트 L41604-42303), Web API Development with ASP.NET Core 8 15장 "Using HttpClientFactory to manage HttpClient instances" (텍스트 L23026-23405)

**핵심 설명**
- **왜 직접 만들면 안 되나(ASP.NET Core in Action 33.1)**: `HttpClient`는 `IDisposable`이라 `using`으로 요청마다 만들고 버리기 쉽다. 그런데 버려도 소켓은 즉시 닫히지 않고 `TIME_WAIT` 상태로 한동안(윈도우 240초) 남는다. 요청이 많으면 포트가 바닥나는 **소켓 고갈**이 생긴다.
- **싱글톤 하나만 쓰면**: 소켓 문제는 없지만, 연결을 계속 붙잡고 있어 **DNS 변경을 감지하지 못한다**(서버 주소가 바뀌어도 옛 서버로 계속 보냄).
- **팩토리의 해법(ASP.NET Core in Action 33.2.1)**: `HttpClient` 수명과 실제 연결을 처리하는 핸들러 수명을 분리한다. 핸들러를 풀로 재사용하고(약 2분) 주기적으로 새 핸들러로 교체해 두 문제를 모두 피한다. 책은 이 시간을 "two minutes"로 설명한다.
- **세 가지 사용법**
  1. `factory.CreateClient()`: 기존 `HttpClient` 코드의 대체로 가장 간단.
  2. **이름 있는 클라이언트**: `AddHttpClient("이름", client => {...})`로 기본 주소·헤더를 한곳에 설정하고 `CreateClient("이름")`으로 받는다. 이름은 대소문자를 구분하니 오타 주의.
  3. **타입 클라이언트**: `HttpClient`를 생성자로 받는 클래스를 만들고 `AddHttpClient<T>()`로 등록한다. 외부 API 호출 로직을 한 클래스에 캡슐화해 문자열 이름이 필요 없다. 책은 "이름 있는 클라이언트를 감싼 것"으로 이해하라고 한다. 인터페이스와 함께 `AddHttpClient<IFoo, Foo>()`로 등록하면 테스트가 쉬워진다.
- Web API Development with ASP.NET Core 8은 `GetFromJsonAsync<T>()`, `PostAsync()` 등의 메서드를 표로 정리하고, 타입 클라이언트로 컨트롤러를 깔끔하게 만드는 예를 보인다.
- 타입 클라이언트는 짧은 수명(transient)이라, 핸들러 교체 이점을 살리려면 싱글톤(백그라운드 서비스)에 직접 주입하지 말라고 ASP.NET Core in Action은 조언한다. 책의 예제는 `IServiceProvider`로 그때그때 꺼냈고(서비스 로케이터 패턴, 텍스트 L42992-42997), 저자 스스로 다소 지저분하다고 인정한다.
- 일시적 오류(네트워크 끊김 등)에는 Polly 라이브러리로 재시도 핸들러를 붙일 수 있다고 소개된다(ASP.NET Core in Action 33.3, L42305-42340). 책은 언급만 하므로, 바로 아래 3.2의 보강에서 개념을 정리한다.

```csharp
// StoreApiClient.cs
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;

public record PurchaseReceipt(string OrderId, bool Valid);

public class StoreApiClient
{
    private readonly HttpClient _http;

    public StoreApiClient(HttpClient http)
    {
        _http = http;
        _http.BaseAddress = new System.Uri("https://store.example.com/");
    }

    public Task<PurchaseReceipt?> VerifyAsync(string orderId, CancellationToken ct)
    {
        return _http.GetFromJsonAsync<PurchaseReceipt>($"receipts/{orderId}", ct);
    }
}
```

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpClient<StoreApiClient>();
var app = builder.Build();
app.MapGet("/api/receipts/{orderId}",
    async (string orderId, StoreApiClient client, CancellationToken ct) =>
        await client.VerifyAsync(orderId, ct));
app.Run();
```

**방치형 RPG 서버에서는**: 인앱 결제 영수증 검증이나 푸시 알림 서비스 호출처럼 외부 서버와 통신할 때 타입 클라이언트로 한 클래스에 모아 두면 관리가 쉽다.

> 🔧 보충(책 외): `store.example.com`과 영수증 검증 흐름은 가상의 예이며, 실제 결제 검증 API는 서비스마다 다르다.

### 3.2 외부 호출 실패에 대비하기: 타임아웃·재시도·서킷 브레이커
**한 줄 요약:** 외부 서버는 언젠가 느려지거나 실패하므로, 호출에 타임아웃·재시도·서킷 브레이커를 붙인다. .NET 8에서는 `Microsoft.Extensions.Http.Resilience` 패키지의 `AddStandardResilienceHandler()` 한 줄로 이 묶음을 붙일 수 있다.

> 원래 12.4 끝의 보강 절.

> 📚 참고(doc, 책 외): C# Complete Guide vol2 43장 "회복 탄력성 — Polly 연동", 51장 "재시도·서킷 브레이커"(Polly v8, `AddStandardResilienceHandler`), Node.js Complete Guide 29장 29.6 "재시도, 지수 백오프, 서킷 브레이커"

**핵심 설명**
- **타임아웃**: 상대가 응답하지 않을 때 무한정 기다리지 않게 한다. 기다리는 동안 우리 서버의 요청도 함께 쌓인다.
- **재시도 + 지수 백오프 + 지터**: 일시적 오류(네트워크 순단, 5xx)는 잠시 뒤 다시 하면 성공할 때가 많다. 재시도 간격을 200ms, 400ms, 800ms처럼 늘리고(지수 백오프), 약간의 무작위 값(지터)을 섞어 모든 서버가 동시에 다시 몰리는 "재시도 폭풍"을 피한다.
- **서킷 브레이커**: 실패가 계속되면 한동안 호출 자체를 멈추고 바로 실패시킨다. 이미 쓰러진 외부 서버를 계속 두드리지 않고, 우리 서버의 스레드·연결도 아낀다.
- **재시도 전에 멱등성 확인**: 재시도는 "같은 요청이 두 번 실행되어도 안전할 때"만 정당하다. 조회(GET)는 대체로 안전하지만, 결제 승인 같은 POST를 자동 재시도하면 이중 처리가 날 수 있다. 이때는 상대 API가 멱등성 키를 지원하는지 확인하고 같은 키로 재시도한다([제10부](10_제10부_EF_Core_데이터_접근.md)의 멱등성 키 설명).

```csharp
// dotnet add package Microsoft.Extensions.Http.Resilience
builder.Services.AddHttpClient<StoreApiClient>()
    .AddStandardResilienceHandler();   // 타임아웃 + 재시도(지수 백오프, 지터) + 서킷 브레이커 등 기본 묶음
```

**방치형 RPG 서버에서는**: 결제 영수증 검증, 푸시 알림, 외부 로그인(구글·애플) 확인처럼 외부 서버에 기대는 기능이 주 대상이다. 외부 서버가 끝내 실패하면 "잠시 후 다시 시도" 응답을 주고, 영수증처럼 놓치면 안 되는 일은 DB에 "검증 대기"로 기록해 두었다가 백그라운드 작업(1.1)이 다시 처리하게 만들 수 있다.

> 🔧 보충(책 외): 위 등록 코드는 .NET 8과 `Microsoft.Extensions.Http.Resilience` 8.10에서 컴파일해 확인했다(실제 외부 호출 실패 상황은 실행해 보지 않았다). 기본 묶음의 세부 수치(재시도 횟수, 타임아웃 등)는 패키지 버전에 따라 다를 수 있으니 문서를 확인하고, 필요하면 옵션으로 조정한다. 재시도를 여러 계층(클라이언트 앱, 우리 서버, 외부 SDK)에서 동시에 걸면 시도 횟수가 곱해진다는 점도 기억해 둔다.

---

## 코어 4. 취소는 협력적이다 — 토큰을 끝까지 넘겨 스스로 멈춘다

> 원래 "제3장. 취소와 정상 종료"(12.6). 코어 1의 `stoppingToken`, 코어 3의 타임아웃이 모두 이 하나의 메커니즘 위에 있다.

### 4.1 비동기 코드 취소와 서비스 종료
**한 줄 요약:** 취소는 "그만해 달라는 신호(`CancellationToken`)"를 받은 코드가 스스로 멈추는 협력 방식이며, 서비스 종료도 같은 신호로 알린다.

> 📖 출처: Concurrency in C# Cookbook Concurrency in C# Cookbook 10장 "Cancellation" 10.1~10.4 (텍스트 L7768-8163), ASP.NET Core in Action 34장 "34.1 Running background tasks with IHostedService" (텍스트 L42706-42872)

**핵심 설명**
- **협력적 취소**: 취소는 요청할 수 있을 뿐 강제할 수 없다. 코드가 토큰을 확인하도록 작성되어 있어야 멈춘다. 그래서 가능한 한 자기 코드에서도 취소를 지원하라고 Concurrency in C# Cookbook은 권한다.
- **두 역할**: 신호를 보내는 쪽은 `CancellationTokenSource`(`Cancel()` 호출), 받는 쪽은 `CancellationToken`이다.
- **취소는 예외로 표현**: 취소된 코드는 `OperationCanceledException`(또는 `TaskCanceledException`)을 던진다. 취소가 실제로 이뤄지기 전에 작업이 끝나 정상 완료될 수도 있다(경쟁 상태).
- **취소 지원 메서드 규칙**: `CancellationToken`을 매개변수(보통 마지막)로 받는다. 안 쓰는 호출자를 위해 기본값(`= default`)이나 `CancellationToken.None`을 쓸 수 있다.
- **비동기 코드 취소(10.4)**: 가장 쉬운 방법은 토큰을 아래 계층에 그대로 넘기는 것. 토큰을 받는 API(`Task.Delay` 등)를 호출한다면 그 메서드도 토큰을 받아 전달한다.
- **루프는 폴링(10.2)**: 낮은 계층 API가 없는 반복문은 `ThrowIfCancellationRequested()`를 주기적으로 호출한다.
- **타임아웃(10.3)**: `new CancellationTokenSource(TimeSpan)` 또는 `CancelAfter()`로 일정 시간 뒤 자동 취소한다. 취소될 코드가 토큰을 관찰해야 한다.
- **서버에서의 취소(10.1 논의)**: ASP.NET은 요청 타임아웃/클라이언트 연결 끊김을 나타내는 토큰을 제공한다.
- **서비스 종료(ASP.NET Core in Action 34.1)**: `BackgroundService.ExecuteAsync`의 `stoppingToken`이 앱 종료 시 취소된다. `while (!stoppingToken.IsCancellationRequested)` 루프와 `Task.Delay(…, stoppingToken)`로 종료 신호에 반응한다.

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;

public class GracefulTickService : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await DoWorkAsync(stoppingToken);                       // 토큰을 아래로 전달
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // 종료 신호로 인한 정상적인 취소: 오류가 아니다
        }
    }

    private static async Task DoWorkAsync(CancellationToken ct)
    {
        await Task.Delay(100, ct); // 실제로는 DB/HTTP 호출에도 ct를 넘긴다
    }
}

public static class TimeoutSample
{
    public static async Task RunWithTimeoutAsync()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(10), cts.Token);
        }
        catch (OperationCanceledException)
        {
            Console.WriteLine("5초 타임아웃으로 취소됨");
        }
    }
}
```

**방치형 RPG 서버에서는**: 서버를 배포(재시작)할 때 정산 루프가 중간에 어정쩡하게 끊기지 않도록 `stoppingToken`을 DB·HTTP 호출까지 전달하고, 외부 API 호출에는 타임아웃 토큰을 붙여 응답 지연이 서버 전체를 붙잡지 않게 한다.

> 🔧 보충(책 외): 위 예제에서 `Task.Delay`에 토큰을 넘기면 대기 중에도 종료 신호에 바로 깨어난다. 이때 던져지는 `OperationCanceledException`을 `catch`로 삼키는 부분은 책의 코드가 아니라 보충이다(ASP.NET Core in Action의 예제는 catch 없이 루프만 돈다).

> 🔧 보충(책 외): 종료 시 정산을 "저장 도중"에 끊지 않으려면 한 번의 정산 단위를 작게 나누고 트랜잭션으로 묶는 것이 좋다([제10부](10_제10부_EF_Core_데이터_접근.md) 참고). 이는 설계 조언이며 이 절 출처의 내용이 아니다. 여러 취소 토큰을 연결하는 방법은 Concurrency in C# Cookbook 10.8에 있으나 여기서는 다루지 않았다.

---

## 실무 적용

### 체크리스트
- [ ] 오래 도는 주기 작업은 `StartAsync`에서 붙잡지 말고 `BackgroundService.ExecuteAsync`의 `while` + `Task.Delay(…, stoppingToken)` 루프로 만들고, `AddHostedService<T>()`로 등록한다(싱글톤). → 코어 1
- [ ] 서버를 여러 대 띄울 계획이면 백그라운드 서비스가 인스턴스마다 중복 실행된다는 점을 전제로, 별도 워커 앱 분리나 Quartz.NET 클러스터링, 또는 "접속 시 경과 시간으로 계산" 같은 설계 대안을 검토한다. → 코어 1
- [ ] 백그라운드 서비스 생성자로 `DbContext` 같은 스코프 서비스를 받지 않는다. `IServiceScopeFactory`로 반복마다 `CreateScope()`하고 `using`으로 해제한다. → 코어 1
- [ ] 캐시를 첫 갱신 전에 읽는 요청이 있을 수 있음을 처리한다(`StartAsync`에서 막으면 갱신 실패 시 앱이 시작하지 못할 수 있다). → 코어 1
- [ ] 캐시는 "모두가 똑같이 보는, 잘 안 바뀌는 값"(랭킹·상점 목록·설정 데이터)에 쓰고, 골드 잔액 같은 자주 바뀌는 개인 값은 캐시하지 않는다. → 코어 2
- [ ] 서버가 여러 대면 인메모리 캐시는 인스턴스마다 다르다. 세션 어피니티 또는 분산 캐시(또는 메모리 → 분산 2단 조회)를 고른다. → 코어 2
- [ ] 만료는 절대 만료를 반드시 함께 두고, `GetOrCreateAsync`로 null 결과도 캐시하며, 큰 객체는 `SizeLimit`으로 제한하고, 사용자별 키에는 사용자 ID를 넣는다. → 코어 2
- [ ] 캐시 갱신은 "DB 먼저 조회 → 캐시 교체" 순서로 하고, 캐시를 못 쓸 때 원본 저장소로 가는 경로를 둔다. → 코어 2
- [ ] 많아질 수 있는 목록(랭킹·우편함·인벤토리)은 필터 → 정렬 → `Skip/Take`로 자르고, `PaginatedList`로 다음 페이지 여부를 알려 주며, `pageSize` 상한을 둔다. 읽기 전용이면 `AsNoTracking()`. → 코어 2
- [ ] `new HttpClient()`를 요청마다 만들지도, 싱글톤 하나로 영원히 쓰지도 않는다. 외부 API는 타입 클라이언트(`AddHttpClient<T>()`)로 한 클래스에 모으고, 싱글톤에 직접 주입하지 않는다. → 코어 3
- [ ] 외부 호출에 타임아웃·재시도(지수 백오프 + 지터)·서킷 브레이커를 붙인다(`AddStandardResilienceHandler()`). 기본 수치는 패키지 버전별로 확인한다. → 코어 3
- [ ] 결제 승인 같은 POST를 자동 재시도하기 전에 멱등성(상대 API의 멱등성 키 지원)을 확인하고, 여러 계층의 재시도가 곱해지지 않게 한다. 끝내 실패한 영수증은 "검증 대기"로 기록해 백그라운드에서 다시 처리한다. → 코어 3
- [ ] 취소를 지원하는 메서드는 `CancellationToken`을 마지막 매개변수로 받고(`= default` 허용), `Task.Delay`·DB·HTTP 호출까지 그대로 넘긴다. 토큰을 받는 API가 없는 루프는 `ThrowIfCancellationRequested()`로 폴링한다. → 코어 4
- [ ] 종료 신호로 생긴 `OperationCanceledException`은 오류로 기록하지 않는다. 정산 단위는 작게 나누고 트랜잭션으로 묶는다. → 코어 4

### 시나리오로 확인하기
1. **상황:** C++ 서버에서 하던 대로 "서버 시작 때 정산 타이머를 하나 띄운다"는 생각으로 `GoldTickService`를 만들었다. 단일 서버에서는 문제가 없었는데, 트래픽 때문에 API 서버를 세 대로 늘린 뒤부터 유저들의 방치 골드가 평소의 세 배로 쌓인다.
   **질문:** 원인은 무엇이고, 어떤 선택지가 있나?

   <details markdown="1"><summary>답 확인</summary>

   `AddHostedService`로 등록한 백그라운드 서비스는 앱(인스턴스)마다 하나씩 뜬다. 서버를 세 대 띄우면 같은 정산 루프가 세 번 돈다. 책은 별도 워커 앱으로 분리하거나 Quartz.NET 클러스터링을 쓰는 방법을 소개한다. 보상을 "접속 시 경과 시간으로 계산"해 백그라운드 정산 자체를 줄이는 것은 게임 설계 관점의 대안(보충)이다. → 코어 1 (1.1)

   </details>

2. **상황:** 정산 서비스 생성자에서 `GameDbContext`를 바로 주입받아 필드에 저장하고, 매분 같은 인스턴스로 조회·저장하도록 만들었다. C++ 틱 루프가 DB 커넥션 하나를 계속 들고 있던 것과 같은 방식이다.
   **질문:** 무엇이 문제이고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   백그라운드 서비스는 싱글톤이고, 싱글톤은 자기보다 수명이 짧은 스코프 서비스(`DbContext`)를 생성자로 받을 수 없다([제8부](08_제8부_ASP_NET_Core_핵심_동작.md)의 captive dependency). 또 `DbContext`는 스레드에 안전하지 않고, 같은 인스턴스를 반복해서 쓰면 지난 실행의 추적 데이터가 영향을 준다. `IServiceScopeFactory`를 주입받아 반복마다 `CreateScope()` → `GetRequiredService<GameDbContext>()`로 꺼내고 `using`으로 스코프를 해제한다. → 코어 1 (1.2)

   </details>

3. **상황:** 랭킹 API에 `IMemoryCache`를 붙였더니 DB 부하는 줄었지만, 같은 유저가 새로 고침할 때마다 랭킹 순위가 바뀌어 보인다는 문의가 온다. API 서버는 로드 밸런서 뒤에 두 대 있다.
   **질문:** 왜 그런가? 선택지는?

   <details markdown="1"><summary>답 확인</summary>

   인메모리 캐시는 앱 프로세스 메모리에 있어 인스턴스끼리 공유되지 않는다. 두 서버가 서로 다른 시점에 캐시를 채워 각자 다른 값을 들고 있고, 요청이 어느 서버로 가느냐에 따라 다른 랭킹이 보인다. 같은 사용자를 같은 인스턴스로 보내는 세션 어피니티를 쓰거나, 여러 인스턴스가 함께 쓰는 분산 캐시(`IDistributedCache`, Redis 등)로 옮긴다(직렬화·네트워크 비용 감수). 메모리 캐시를 먼저 보고 없으면 분산 캐시를 조회하는 2단 구성도 가능하다. → 코어 2 (2.1)

   </details>

4. **상황:** 영수증 검증 코드에서 `using var client = new HttpClient();`로 매번 클라이언트를 만들었다. 이벤트 날 트래픽이 몰리자 소켓 관련 오류가 나기 시작했고, 그날 외부 결제 서버까지 느려지자 우리 API 전체가 응답하지 않았다. 급히 "실패하면 무조건 3번 재시도"를 넣었더니 결제가 이중 승인될 뻔했다.
   **질문:** 세 문제를 각각 어떻게 풀어야 하나?

   <details markdown="1"><summary>답 확인</summary>

   (1) `HttpClient`를 버려도 소켓은 `TIME_WAIT`로 한동안(윈도우 240초) 남아 포트가 바닥난다(소켓 고갈). 싱글톤 하나로 바꾸면 DNS 변경을 못 따라가므로, `IHttpClientFactory`(타입 클라이언트 `AddHttpClient<T>()`)로 핸들러를 풀로 재사용하고 약 2분마다 교체하게 한다. (2) 응답 없는 외부 서버를 무한정 기다리면 우리 요청이 쌓이므로 타임아웃을 두고, 실패가 계속되면 서킷 브레이커로 바로 실패시킨다. (3) 재시도는 같은 요청이 두 번 실행되어도 안전할 때만 정당하다. 결제 승인 POST는 상대 API의 멱등성 키를 확인해 같은 키로 재시도하고, 재시도 간격은 지수 백오프 + 지터로 둔다. `AddStandardResilienceHandler()`가 타임아웃·재시도·서킷 브레이커 묶음을 붙인다. → 코어 3 (3.1, 3.2)

   </details>

5. **상황:** 점검 배포 때 서버를 내리면, 어떤 때는 정산 루프가 `Task.Delay(TimeSpan.FromMinutes(1))` 대기에 걸려 종료가 늦어지고, 어떤 때는 정산 도중 저장이 반쯤 된 상태로 끊긴다. 로그에는 `OperationCanceledException`이 오류로 잔뜩 찍힌다.
   **질문:** 각각 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   취소는 협력적이라 토큰을 확인하는 코드만 멈춘다. `Task.Delay`와 DB·HTTP 호출에 `stoppingToken`을 넘기면 대기 중에도 종료 신호에 바로 깨어난다. 종료 신호로 던져진 `OperationCanceledException`은 정상 취소이므로 `catch`로 잡아 오류로 취급하지 않는다(이 catch는 보충). 저장 도중 끊기지 않게 하려면 정산 단위를 작게 나누고 트랜잭션으로 묶는다(설계 조언, [제10부](10_제10부_EF_Core_데이터_접근.md) 참고). → 코어 4 (4.1)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
백그라운드·캐시·외부 호출
├─ 코어 1 상주 일꾼
│   ├─ IHostedService: Start____ / Stop____ (StartAsync를 오래 붙잡으면 → ( ? ))
│   ├─ BackgroundService: ____Async 하나만 재정의, 등록 AddHostedService (수명 = ____)
│   ├─ 여러 인스턴스 → ( ? ) 실행 → 워커 분리 / Quartz.NET 클러스터링
│   └─ 스코프 서비스 쓰기: IServiceScopeFactory → ____ → GetRequiredService, ____ 으로 해제
├─ 코어 2 읽기 부하 줄이기
│   ├─ 캐시 4종: 인메모리 / ____ / 응답 캐시(Cache-Control) / ____ 캐시(7.0+)
│   ├─ 만료: 절대 + ____ (슬라이딩만 쓰면 ( ? ))
│   ├─ GetOrCreateAsync: ____ 결과도 캐시 → DB 반복 조회 방지
│   └─ 페이지네이션: ____ → 정렬 → Skip/Take, PaginatedList(HasNextPage …), pageSize 상한
├─ 코어 3 외부 호출
│   ├─ HttpClient 문제: 매번 생성 = ____ 고갈 / 싱글톤 = ____ 미감지
│   ├─ 팩토리 사용법: CreateClient() / ____ 클라이언트 / ____ 클라이언트
│   └─ 회복 탄력성: 타임아웃 / 재시도(지수 백오프 + ____) / ____ 브레이커 — 재시도 전 ( ? ) 확인
└─ 코어 4 협력적 취소
    ├─ 보내는 쪽 ____ / 받는 쪽 ____ / 취소 = ____Exception
    ├─ 토큰은 매개변수 ( ? ) 에, = default 허용
    ├─ 아래로 전달 / 루프는 ____ / 타임아웃 = CancelAfter
    └─ 서비스 종료: stoppingToken + Task.Delay(…, stoppingToken)
```

### 2. 인출 질문

1. `IHostedService`와 `BackgroundService`는 어떤 관계인가요? 오래 도는 작업을 `StartAsync`에서 `await`로 붙잡으면 무슨 일이 생기나요?

   <details markdown="1"><summary>답 확인</summary>

   `IHostedService`는 `StartAsync`/`StopAsync`를 가진 인터페이스로, 앱 시작 직후 시작되고 종료 직전에 멈춘다. `StartAsync`는 앱 시작 과정의 일부라 여기서 오래 붙잡으면 앱 시작이 막힌다. 그래서 오래 도는 작업은 추상 클래스 `BackgroundService`를 상속해 `ExecuteAsync` 하나만 재정의하는 것이 권장 패턴이다. 등록은 `AddHostedService<T>()`이고 싱글톤이다. → 코어 1 (1.1)

   </details>

2. 백그라운드 서비스가 캐시를 채우고 API는 캐시만 읽는 구조의 장단점은? 단점을 막는 방법과 그 위험은?

   <details markdown="1"><summary>답 확인</summary>

   API가 항상 빠르다는 장점이 있지만, 첫 갱신 전에 요청이 오면 값이 없다. `StartAsync`에서 첫 갱신을 마칠 때까지 시작을 막는 방법이 있지만, 갱신이 실패하면 앱이 아예 시작하지 못할 수 있다고 책은 경고한다. → 코어 1 (1.1)

   </details>

3. 서버 인스턴스를 여러 대 띄우면 백그라운드 서비스에 어떤 문제가 생기고, 책은 어떤 해결책을 소개하나요?

   <details markdown="1"><summary>답 확인</summary>

   각 인스턴스마다 백그라운드 서비스가 중복 실행된다. 책은 별도 워커 앱으로 분리하거나 Quartz.NET 클러스터링을 쓰는 방법을 소개한다. 보상을 "접속 시 경과 시간으로 계산"해 백그라운드 정산 자체를 줄이는 것은 게임 설계 관점의 대안(보충)이다. → 코어 1 (1.1 보충)

   </details>

4. 백그라운드 서비스에서 `DbContext`를 생성자로 받을 수 없는 이유와 올바른 사용법을 설명해 보세요. 왜 반복마다 새 스코프를 만드나요?

   <details markdown="1"><summary>답 확인</summary>

   백그라운드 서비스는 싱글톤이고, 싱글톤은 자기보다 수명이 짧은 스코프 서비스를 생성자로 받을 수 없다(captive dependency). 백그라운드에는 요청이 없어 스코프도 없으므로 `IServiceScopeFactory`(또는 `IServiceProvider`)로 `CreateScope()`해 `GetRequiredService<GameDbContext>()`로 꺼내고, `using`으로 스코프를 해제해 `IDisposable` 서비스를 정리한다. `DbContext`는 스레드에 안전하지 않고, 매번 새로 써야 지난 실행의 추적 데이터가 영향을 주지 않는다. → 코어 1 (1.2)

   </details>

5. 캐시 네 가지(인메모리, 분산, 응답, 출력)를 저장 위치·공유·무효화 측면에서 비교해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   인메모리(`IMemoryCache`): 앱 프로세스 메모리, 빠르지만 재시작 시 사라지고 인스턴스끼리 공유되지 않는다. 분산(`IDistributedCache`, Redis 등): 여러 인스턴스가 공유하고 재시작해도 남지만 네트워크 I/O가 늘고 문자열 키·`byte[]` 값이라 직렬화가 필요하다. 응답 캐시: `Cache-Control` 헤더로 클라이언트·프록시가 저장하며, 클라이언트 설정에 좌우되고 서버가 무효화할 수 없다. 출력 캐시(7.0+): 서버 쪽 미들웨어라 클라이언트 설정과 무관하고 서버에서 무효화할 수 있지만, GET/HEAD의 200 응답만 지원하고 `Authorization`·`Set-Cookie` 헤더는 지원하지 않으며 기본 만료는 60초다. → 코어 2 (2.1)

   </details>

6. 절대 만료와 슬라이딩 만료의 차이는? 슬라이딩만 쓰면 어떤 문제가 생기나요?

   <details markdown="1"><summary>답 확인</summary>

   절대 만료는 정해진 시간이 지나면 삭제되고, 슬라이딩 만료는 일정 시간 쓰이지 않으면 삭제된다. 슬라이딩만 쓰면 계속 접근되는 항목이 영원히 살아남아 낡은 값이 남을 수 있으므로 절대 만료를 함께 둔다. → 코어 2 (2.1)

   </details>

7. `TryGetValue`로 확인한 뒤 결과가 있을 때만 `Set`하는 코드보다 `GetOrCreateAsync`가 나은 이유는?

   <details markdown="1"><summary>답 확인</summary>

   존재하지 않는 ID처럼 결과가 null이면 앞의 방식은 캐시가 채워지지 않아 매 요청이 DB를 친다. `GetOrCreateAsync`는 null 결과도 캐시하므로 이를 막아 준다. → 코어 2 (2.1)

   </details>

8. 캐시를 갱신할 때 "먼저 지우고 나중에 채우면" 무엇이 문제인가요? 사용자별 데이터의 키 설계와, 게임에서 캐시 대상 선정 기준은?

   <details markdown="1"><summary>답 확인</summary>

   먼저 지우면 그 사이 요청이 모두 DB로 몰리므로 DB를 먼저 조회한 뒤 캐시를 교체한다. 사용자별 데이터는 키에 사용자 ID를 넣어 다른 사용자에게 섞이지 않게 한다. 캐시를 쓸 수 없을 때를 대비해 원본 저장소로 대체하는 경로도 둔다. 게임에서는 랭킹·상점 목록·설정 데이터처럼 모두가 똑같이 보는 값이 후보이고, 골드 잔액처럼 자주 바뀌는 개인 값은 캐시하지 않는 편이 안전하다. → 코어 2 (2.1)

   </details>

9. 큰 목록을 통째로 돌려주면 어떤 문제가 생기나요? 페이지네이션 쿼리의 순서와, 응답에 담을 정보는?

   <details markdown="1"><summary>답 확인</summary>

   서버 조회·처리 시간이 길어지고, 응답이 커져 네트워크가 막히며, 클라이언트도 파싱·그리기에 힘들어진다. 순서는 필터링(Where) → 정렬(OrderBy) → 페이징(Skip/Take)이고 읽기 전용이면 `AsNoTracking()`을 함께 쓴다. 응답에는 `PageIndex`, `PageSize`, `TotalPages`, `HasPreviousPage`, `HasNextPage`, `Items`를 담은 `PaginatedList<T>`를 준다. 클라이언트가 큰 `pageSize`를 보내지 못하게 서버에서 상한을 둔다(보충). → 코어 2 (2.2)

   </details>

10. 요청마다 `new HttpClient()`를 만들고 버리는 방식과, 싱글톤 하나만 쓰는 방식은 각각 어떤 문제가 있나요? `IHttpClientFactory`는 어떻게 둘 다 피하나요?

    <details markdown="1"><summary>답 확인</summary>

    매번 만들고 버리면 소켓이 즉시 닫히지 않고 `TIME_WAIT`로 한동안(윈도우 240초) 남아, 요청이 많으면 포트가 바닥나는 소켓 고갈이 생긴다. 싱글톤 하나만 쓰면 연결을 계속 붙잡아 DNS 변경을 감지하지 못한다. 팩토리는 `HttpClient` 수명과 실제 연결을 처리하는 핸들러 수명을 분리해, 핸들러를 풀로 재사용하고 약 2분마다 새 핸들러로 교체한다. → 코어 3 (3.1)

    </details>

11. `IHttpClientFactory`의 세 가지 사용법을 말해 보세요. 타입 클라이언트를 백그라운드 서비스(싱글톤)에 직접 주입하지 말라는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    (1) `factory.CreateClient()`(기존 코드의 단순 대체) (2) 이름 있는 클라이언트(`AddHttpClient("이름", ...)`로 기본 주소·헤더를 한곳에 설정, 이름은 대소문자 구분) (3) 타입 클라이언트(`HttpClient`를 생성자로 받는 클래스를 `AddHttpClient<T>()`로 등록, 호출 로직을 캡슐화하고 문자열 이름 불필요). 타입 클라이언트는 짧은 수명(transient)이라 싱글톤에 주입하면 붙잡혀서 핸들러 교체 이점을 잃는다. 책은 `IServiceProvider`로 그때그때 꺼냈다. → 코어 3 (3.1)

    </details>

12. 외부 호출의 회복 탄력성 세 장치(타임아웃, 재시도, 서킷 브레이커)는 각각 무엇을 막나요? 지수 백오프와 지터는 왜 쓰나요?

    <details markdown="1"><summary>답 확인</summary>

    타임아웃은 응답 없는 상대를 무한정 기다리며 우리 서버 요청이 쌓이는 것을 막는다. 재시도는 네트워크 순단·5xx 같은 일시적 오류를 넘긴다. 간격을 200ms, 400ms, 800ms처럼 늘리고(지수 백오프) 무작위 값(지터)을 섞어 모든 서버가 동시에 다시 몰리는 재시도 폭풍을 피한다. 서킷 브레이커는 실패가 계속되면 한동안 호출을 멈추고 바로 실패시켜, 쓰러진 외부 서버를 두드리지 않고 우리 자원도 아낀다. .NET 8에서는 `AddStandardResilienceHandler()` 한 줄로 이 묶음을 붙일 수 있다. → 코어 3 (3.2)

    </details>

13. 자동 재시도를 걸기 전에 확인해야 할 것은 무엇인가요? 재시도를 여러 계층에 동시에 걸면 어떻게 되나요?

    <details markdown="1"><summary>답 확인</summary>

    같은 요청이 두 번 실행되어도 안전한지(멱등성)를 확인해야 한다. GET은 대체로 안전하지만 결제 승인 같은 POST를 자동 재시도하면 이중 처리가 날 수 있으므로, 상대 API가 멱등성 키를 지원하는지 확인하고 같은 키로 재시도한다. 클라이언트 앱·우리 서버·외부 SDK에서 동시에 재시도하면 시도 횟수가 곱해진다. 끝내 실패하면 "잠시 후 다시 시도"를 응답하고, 놓치면 안 되는 일은 DB에 "검증 대기"로 기록해 백그라운드 작업이 다시 처리하게 할 수 있다. → 코어 3 (3.2)

    </details>

14. "협력적 취소"란 무엇인가요? 취소에 관여하는 두 타입과, 취소가 어떻게 표현되는지 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    취소는 요청할 수 있을 뿐 강제할 수 없고, 코드가 토큰을 확인하도록 작성되어 있어야 멈춘다. 신호를 보내는 쪽은 `CancellationTokenSource`(`Cancel()`), 받는 쪽은 `CancellationToken`이다. 취소된 코드는 `OperationCanceledException`(또는 `TaskCanceledException`)을 던지며, 취소가 이뤄지기 전에 작업이 정상 완료될 수도 있다(경쟁 상태). → 코어 4 (4.1)

    </details>

15. 취소를 지원하는 메서드를 만들 때의 규칙과, 비동기 코드·루프·타임아웃 각각에서 취소를 다루는 방법은?

    <details markdown="1"><summary>답 확인</summary>

    `CancellationToken`을 매개변수(보통 마지막)로 받고, 안 쓰는 호출자를 위해 `= default`나 `CancellationToken.None`을 허용한다. 비동기 코드는 토큰을 아래 계층(`Task.Delay`, DB·HTTP 호출)에 그대로 넘긴다. 낮은 계층 API가 없는 루프는 `ThrowIfCancellationRequested()`로 주기적으로 폴링한다. 타임아웃은 `new CancellationTokenSource(TimeSpan)`이나 `CancelAfter()`로 만들며 취소될 코드가 토큰을 관찰해야 한다. → 코어 4 (4.1)

    </details>

16. `BackgroundService`가 앱 종료 신호에 반응하는 방법은? 예제에서 `OperationCanceledException`을 `catch`로 삼키는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    `ExecuteAsync`의 `stoppingToken`이 앱 종료 시 취소되므로 `while (!stoppingToken.IsCancellationRequested)` 루프와 `Task.Delay(…, stoppingToken)`으로 반응한다. `Task.Delay`에 토큰을 넘기면 대기 중에도 바로 깨어나며 `OperationCanceledException`을 던지는데, 이는 종료 신호로 인한 정상 취소라 오류가 아니므로 잡아서 삼킨다(이 catch는 책 코드가 아닌 보충). 배포 때 정산이 어정쩡하게 끊기지 않도록 정산 단위를 작게 나누고 트랜잭션으로 묶는다(설계 조언). → 코어 4 (4.1)

    </details>

17. C++ 틱 루프의 종료 플래그(`std::atomic<bool>`)나 C++20 `std::stop_token`과 .NET의 `CancellationToken`은 무엇이 같고 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    둘 다 협력적이다. 멈추라는 요청과 그것을 확인하는 코드가 나뉘고, 확인하지 않는 코드는 멈추지 않는다. .NET에서는 취소가 `OperationCanceledException` 예외로 전파되고, 토큰을 `Task.Delay`·DB·HTTP 같은 비동기 호출에 넘기면 대기 중에도 즉시 깨어난다. 그래서 루프 맨 위에서 플래그를 보는 것만으로는 부족하고 호출 체인 끝까지 토큰을 전달해야 한다. → 코어 4

    </details>

### 3. 기억 고리

- **C++ 유추:** `BackgroundService` ≈ 서버 시작 때 띄우는 틱 루프 스레드, `CancellationToken` ≈ `std::stop_token`, `IHttpClientFactory` ≈ 직접 관리하던 HTTP 연결 풀. ⚠️ 깨지는 곳: 웹 서버는 여러 대를 띄우므로 틱 루프·메모리 캐시가 인스턴스마다 따로 돈다. 싱글톤 일꾼은 `DbContext`를 들고 있지 못하고 매번 스코프를 빌린다. 취소는 예외로 전파되고 토큰을 비동기 호출 끝까지 넘겨야 한다.
- **비유:** `BackgroundService` = 앱과 함께 출근해 퇴근 신호(`stoppingToken`)를 들을 때까지 일하는 상주 일꾼. 일할 때마다 새 작업복(스코프)을 받아 입고 벗는다. ⚠️ 비유가 깨지는 지점: 서버가 여러 대면 일꾼도 여러 명이 되어 서로 모르고 같은 정산을 중복하며, 퇴근 신호는 강제 퇴근이 아니라 일꾼이 확인해야만 효과가 있다.
- **비유:** `IHttpClientFactory` = 택시 회사의 배차 시스템. 손님(`HttpClient`)은 그때그때 부르지만 실제 차(핸들러·연결)는 회사가 돌려 쓰고 주기적으로 교체한다. ⚠️ 비유가 깨지는 지점: 타입 클라이언트를 싱글톤에 붙잡아 두면 같은 차를 계속 쓰게 되어 교체 이점이 사라진다.
- **묶음(3의 법칙):** 외부 호출 회복 탄력성 3종 = **타임아웃**(기다림 제한) / **재시도**(일시적 오류 넘기기, 지수 백오프+지터) / **서킷 브레이커**(계속 실패하면 멈춤). 기준: 상대가 느릴 때, 잠깐 실패할 때, 오래 실패할 때.
- **대칭·순서:** 인메모리 ↔ 분산(속도 vs 공유), 응답 캐시 ↔ 출력 캐시(클라이언트 쪽 vs 서버 쪽, 무효화 불가 vs 가능), `CancellationTokenSource`(보냄) ↔ `CancellationToken`(받음). 페이징 순서: 필터 → 정렬 → Skip/Take.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "백그라운드 정산 서비스가 1분마다 DB의 영웅 골드를 갱신하고, 서버 배포 때 깔끔하게 멈추는 구조"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리 게임 서버의 정산 타이머 스레드와 결제 검증 호출을 ASP.NET Core로 옮기면 무엇이 바뀌는가"를 서버 대수(중복 실행·캐시 불일치), 객체 수명(스코프), 연결 관리(팩토리), 종료(토큰) 네 가지로 설명해 보세요.
- **랜덤 논리 게임:** A "랭킹 캐시는 인메모리 캐시로 충분하다(빠르고 쉽다)" vs B "분산 캐시를 써야 한다(여러 인스턴스가 공유하고 재시작해도 남는다)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 `IHttpClientFactory`가 소켓 고갈과 DNS 문제를 함께 푸는 원리와 재시도의 조건을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명

---

# 제13부. 아키텍처·테스트·배포 기초

> **🎮 게임 서버 개발자에게** — 이 부는 C++ 서버에서 "패킷 핸들러 → 컨텐츠 로직 → DB 작업"으로 코드를 나누고, 빌드 머신에서 바이너리를 만들어 점검 공지 후 서버에 복사·재시작하던 일을 .NET 웹 서버 방식으로 다시 배우는 장이다. 결정적으로 다른 점은 세 가지다. 의존 방향을 뒤집어 핵심 로직이 DB를 모르게 만들고(그래야 DB 없이 테스트된다), 테스트는 사람이 봇을 붙여 확인하는 대신 코드로 써서 매 커밋마다 자동으로 돌리며, 배포 단위는 실행 파일 하나가 아니라 런타임·설정까지 묶은 **불변 이미지**다. 테스트 코드 작성이나 컨테이너가 처음이어도 괜찮다. 이 부는 그 출발점을 다룬다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 방치 보상 계산식을 고쳤는데 "정확히 8시간 상한일 때" 골드가 틀리게 지급됐다는 CS가 점검 다음 날 들어온다 (단위 테스트·경계값).
> - 개발 PC와 테스트 서버에서는 잘 되던 서버가 운영 서버에 올리자 런타임 버전·설정 차이로 뜨지 않는다 ("내 컴퓨터에서는 되는데" → Docker 이미지·CI).
> - 통합 테스트를 돌렸더니 개발 DB에 테스트 영웅이 쌓이고 외부 결제 검증 API가 실제로 호출됐다 (`ConfigureTestServices`·테스트 DB 분리).

## 코어 — 이것만은 100%

> **한 문장:** 비즈니스 로직을 중심(Core)에 두고 의존성이 바깥에서 안쪽으로만 향하게 하면(1), 로직을 가짜 구현으로 DB 없이 단위 테스트하고(2), `WebApplicationFactory`로 진짜 앱을 메모리에 띄워 "요청 → 응답"을 통합 테스트할 수 있으며(3), CI가 이 테스트들을 매 PR마다 돌려 통과한 코드만 불변 Docker 이미지로 만들어 어디서나 같은 방식으로 배포한다(4).

1. **의존성은 안쪽으로 — 모놀리식에서 Clean Architecture까지** — 모놀리식은 "하나의 단위로 배포되는 앱"이고, 계층(논리)과 티어(물리)는 다르다. 전통 계층(UI→BLL→DAL)은 로직이 DB 세부에 의존하므로, Core(엔티티·인터페이스·도메인 서비스)가 아무것도 모르게 하고 Infrastructure가 Core의 인터페이스를 구현하며 `Program.cs`(조립 지점)에서 DI로 연결한다.
2. **단위 테스트 — 인터페이스 뒤에 가짜를 끼워 로직만 빠르게** — 테스트는 단위·통합·E2E로 나누고 빠른 테스트를 많이, 투자 대비 효과로 균형을 잡는다. xUnit의 `[Fact]`(AAA)·`[Theory]`(동치 분할·경계값)로 규칙을 못 박고, 의존성은 인터페이스 뒤의 가짜 구현으로 격리한다.
3. **통합 테스트 — 진짜 앱을 메모리에서 띄우고, 통제 못 하는 것만 바꾼다** — `WebApplicationFactory<Program>`은 실제 설정·DI·미들웨어로 앱을 TestServer 위에 띄워 라우팅·모델 바인딩·유효성 검사까지 검증한다. 외부 API·시간은 `ConfigureTestServices`로, DB는 테스트 전용(SQLite 인메모리 등)으로 바꿔 끼운다.
4. **불변 이미지와 자동 파이프라인 — 빌드·테스트·배포를 사람 손에서 뗀다** — CI는 커밋마다 restore → build → test, CD는 산출물(Docker 이미지)을 환경에 배포한다. 이미지는 불변 패키지, 컨테이너는 그 실행 인스턴스이며 영속 데이터는 컨테이너 밖에 둔다. Dockerfile은 멀티스테이지로, 워크플로는 `.github/workflows/*.yml`로 기록된다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 서버 프로세스 하나(네트워크·컨텐츠·DB 스레드가 한 실행 파일)를 통째로 띄우고, 동접이 늘면 같은 서버를 한 대 더 띄움 | 모놀리식 애플리케이션 | 하나의 단위로 배포되고, 확장하려면 전체를 복제한다 | 웹 서버는 요청마다 상태를 들고 있지 않는 것이 전제라, 같은 이미지를 복제해 로드밸런서 뒤에 두는 확장이 자연스럽다. 메모리에만 있는 상태는 인스턴스끼리 공유되지 않는다 |
| 패킷 핸들러 → 컨텐츠 로직 → DB 작업 큐(DB 스레드) | 3계층 UI → BLL → DAL | 역할별로 코드를 나누고 위에서 아래로 호출한다 | 계층은 논리 구분일 뿐이고, 물리적으로 따로 배포되는 단위는 "티어"라고 따로 부른다. 전통 계층은 로직이 DB에 묶여 테스트에 DB가 필요해진다 |
| 순수 가상 함수만 있는 추상 클래스(인터페이스) + 구현 클래스를 `main`에서 생성해 포인터로 넘김 | Core의 인터페이스 + Infrastructure 구현 + `Program.cs`에서 DI 등록 | "구현이 아니라 인터페이스에 의존하고, 조립은 한곳에서"라는 발상이 같다 | C++에서는 조립을 직접 `new`/`make_unique`로 하지만 .NET은 DI 컨테이너가 생성자를 보고 런타임에 주입한다. 의존 방향은 `.csproj` 프로젝트 참조로 강제되어, Core가 Infrastructure를 참조하지 않으면 그 타입을 아예 쓸 수 없다 |
| `assert`, 테스트용 `main`, 더미 클라이언트(봇)를 접속시켜 손으로 확인 | xUnit `[Fact]`/`[Theory]`, `WebApplicationFactory` 통합 테스트 | 입력을 넣고 기대 결과와 비교한다 | xUnit은 특성(`[Fact]`)이 붙은 메서드를 리플렉션으로 찾아 실행하고 "예외가 없으면 통과"다. 통합 테스트는 실제 포트로 접속하는 봇과 달리 TestServer로 프로세스 안에서 요청을 보낸다(포트·별도 프로세스 없음) |
| 빌드 머신에서 수동 빌드 → 바이너리·설정 파일을 서버에 복사 → 점검 공지 후 재시작 | CI/CD 파이프라인 + Docker 이미지·컨테이너 | 빌드 산출물을 서버로 옮겨 실행한다는 큰 흐름은 같다 | 빌드·테스트가 매 커밋/PR마다 깨끗한 환경에서 자동으로 돌고, 테스트가 실패하면 병합 전에 막힌다. 산출물은 실행 파일만이 아니라 런타임·설정까지 묶은 불변 이미지라 개발·테스트·운영에서 똑같이 실행된다 |
| 프로세스 하나 / VM 한 대 | 컨테이너 | 격리된 실행 환경에서 앱이 돈다 | 컨테이너는 VM과 달리 게스트 OS 없이 호스트 커널을 공유해 가볍다. 컨테이너 안에 쓴 파일은 컨테이너가 사라지면 함께 사라지므로, 서버 로컬 디스크에 세이브 파일을 쓰던 습관은 버리고 볼륨·DB에 둔다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. 먼저 제목과 소제목만 보고 "이 장은 ___ 을(를) 설명한다"를 한 문장으로 적어 두고, 소제목·표·굵은 글씨만 5~15분 훑은 뒤 그 예측문을 고친 다음 정독해도 좋습니다.
> 1. 솔루션을 Core·Infrastructure·Web 세 프로젝트로 나눠도 왜 여전히 "모놀리식"일까?
> 2. 전통적인 UI → BLL → DAL 계층에서 비즈니스 로직을 테스트하려면 왜 DB가 필요해질까?
> 3. `WebApplicationFactory`로 앱을 그대로 띄워 테스트하면 어떤 사고가 날 수 있을까?
> 4. SQLite 인메모리 DB로 테스트할 때 연결을 직접 열어 두지 않으면 무슨 일이 생길까?
> 5. Dockerfile에서 `.csproj`만 먼저 복사해 `dotnet restore`하는 이유는 무엇일까?
>
> **처리법:** 🛠 실습 `dotnet new xunit`/`dotnet test`, `[Fact]`·`[Theory]`+`[InlineData]`, `WebApplicationFactory<Program>`+`CreateClient()`, `ConfigureTestServices`+`RemoveAll<T>`, SQLite `DataSource=:memory:`, `docker build`/`docker run -p`, `.github/workflows/ci.yml` → 읽자마자 직접 실행 · 🔗 유추 Docker 이미지/컨테이너 ≈ 클래스/인스턴스(하나의 이미지로 여러 컨테이너) — 컨테이너의 쓰기 계층은 컨테이너가 사라지면 함께 사라진다는 점 등 어디서 깨지는지 따져 보기 · 🗺 관계도 Core ← Infrastructure, Core ← Web(의존은 안쪽으로) → 인터페이스 의존 → 가짜 구현으로 단위 테스트 → 통합 테스트 → CI(빌드·테스트) → 이미지 → CD · 📦 카드로 xUnit 패키지 이름(`Microsoft.NET.Test.Sdk`, `xunit`, `xunit.runner.visualstudio`, `coverlet.collector`), Assert 메서드 목록, `docker` 명령·플래그(`-d`, `-p 호스트:컨테이너`), `EXPOSE 8080`, GitHub Actions 키워드(`on`/`jobs`/`steps`/`uses`/`run`) → 지금 외우지 말고 플래시카드로

**학습 목표**
1. 모놀리식, 계층, Clean Architecture가 무엇이고 "의존성은 안쪽으로만"이라는 규칙이 왜 필요한지 설명할 수 있다. (→ 코어 1)
2. xUnit으로 단위 테스트를 작성하고, `WebApplicationFactory`로 API 통합 테스트를 작성할 수 있다. (→ 코어 2, 3)
3. CI/CD, Docker 이미지·컨테이너, Dockerfile, GitHub Actions 워크플로의 큰 그림을 읽을 수 있다. (→ 코어 4)

---

## 코어 1. 의존성은 안쪽으로 — 모놀리식에서 Clean Architecture까지

> 원래 1장 "웹 앱 아키텍처". 배포 단위가 하나인 앱(1.1)을 역할별로 나누고(1.2), 의존 방향을 뒤집어 로직을 중심에 둔 뒤(1.3), 그 구조를 프로젝트와 `Program.cs` 조립으로 실제화한다(1.4). 이 코어의 결과물(인터페이스에만 의존하는 Core)이 코어 2·3의 테스트를 가능하게 한다.

### 1.1 모놀리식 애플리케이션

**한 줄 요약:** 모놀리식은 "전체가 한 덩어리로 배포되는 앱"이고, 처음 시작하기에 가장 단순한 구조다.

> 📖 출처: Architecting Modern Web Applications with ASP.NET Core and Azure Ch4 "What is a monolithic application? / All-in-one applications" (텍스트 L854-889)

**핵심 설명**
- 모놀리식 앱은 자기 프로세스 안에서 핵심 동작을 모두 실행하고, 통째로 하나의 단위로 배포됩니다. 서버를 늘려야 하면 앱 전체를 복제합니다.
- 새 ASP.NET Core 프로젝트는 프로젝트 하나에 화면·비즈니스·데이터 접근 코드가 모두 들어 있는 "all-in-one" 모놀리스로 시작합니다.
- 프로젝트 하나에서는 폴더로 관심사를 나눕니다. 문제는 앱이 커지면 어떤 폴더가 어떤 폴더에 의존해도 되는지 알 수 없게 되고, 결국 "스파게티 코드"가 되기 쉽다는 점입니다.
- 그래서 앱은 보통 "계층별 여러 프로젝트"로 진화합니다(1.2절). 여러 프로젝트로 나눠도 배포는 여전히 하나이므로 여전히 모놀리식입니다.

```csharp
// 가장 단순한 all-in-one 서버: 한 파일에 라우팅 + 로직 + 데이터가 모두 있다.
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var heroes = new List<Hero> { new(1, "Arthur", 100) };   // 데이터(메모리)

app.MapGet("/api/heroes", () => heroes);                  // 화면(API) + 로직이 한곳에

app.Run();

public record Hero(int Id, string Name, long Gold);
```

**방치형 RPG 서버에서는**: 처음에는 이렇게 프로젝트 하나로 시작해도 충분합니다. 다만 골드 계산 같은 규칙이 늘어나면 곧 나눠야 하므로 다음 절의 계층 구조를 미리 알아 두세요.

---

### 1.2 계층(Layer)과 티어(Tier)

**한 줄 요약:** 계층은 코드를 "역할별로 나눈 논리적 구획"이고, 티어는 "실제로 따로 배포되는 물리적 서버"다.

> 📖 출처: Architecting Modern Web Applications with ASP.NET Core and Azure Ch4 "What are layers? / Traditional N-Layer architecture" (텍스트 L893-955), Architecting ASP.NET Core Applications Ch14 "Introducing layering / Layers versus tiers versus assemblies" (텍스트 L21153-21400)

**핵심 설명**
- 가장 흔한 3계층은 UI(표현) → 비즈니스 로직(BLL, 도메인) → 데이터 접근(DAL)입니다. UI는 BLL만 호출하고, BLL만 DAL을 호출합니다.
- 계층을 나누면 ① 공통 기능을 재사용하고 ② 한 계층을 바꿔도 영향 범위가 줄며 ③ 테스트 때 진짜 DB 대신 가짜 구현을 끼울 수 있습니다.
- 계층(layer)은 논리적 구분이고, 티어(tier)는 물리적 구분입니다. 3계층 앱을 서버 한 대에 배포하면 "1티어 3계층"입니다. DB를 클라우드에 따로 두면 2티어가 됩니다.
- 어셈블리(.dll)와 계층은 1:1이 아닙니다. 다만 책은 대부분의 경우 계층마다 프로젝트를 나누기를 권합니다.
- 전통적 계층의 약점: 의존 방향이 위에서 아래(UI→BLL→DAL)라서 가장 중요한 비즈니스 로직이 DB 구현 세부사항에 의존하고, 테스트하려면 테스트용 DB가 필요해집니다. 이 문제를 푸는 것이 다음 절입니다.

```csharp
// 계층을 흉내 낸 최소 예: UI(엔드포인트) -> BLL(Service) -> DAL(Repository)
var repo = new HeroRepository();          // DAL
var service = new HeroService(repo);      // BLL
Console.WriteLine(service.GetTitle(1));   // UI 역할

class HeroRepository { public string FindName(int id) => "Arthur"; }
class HeroService(HeroRepository repo)
{
    public string GetTitle(int id) => $"Hero {repo.FindName(id)}";
}
```

**방치형 RPG 서버에서는**: "API 컨트롤러(UI) → 골드 계산 서비스(BLL) → DB 저장소(DAL)"로 나누면 각자 맡은 일이 분명해집니다.

---

### 1.3 Clean Architecture

**한 줄 요약:** Clean Architecture는 비즈니스 로직을 중심에 두고, DB·UI 같은 바깥 세부사항이 안쪽에 의존하도록 뒤집은(의존성 역전) 계층 구조다.

> 📖 출처: Architecting Modern Web Applications with ASP.NET Core and Azure Ch4 "Clean architecture" (텍스트 L991-1059), Architecting ASP.NET Core Applications Ch14 "Clean Architecture" (텍스트 L22124-22231), Web API Development with ASP.NET Core 8 Ch17 "Clean architecture" (텍스트 L25320-25339)

**핵심 설명**
- 이름은 여러 가지(Hexagonal, Ports-and-Adapters, Onion, Clean)로 불리지만 핵심은 같습니다. 업무 규칙과 모델을 중심에 두고, 인프라·UI가 중심에 의존합니다.
- 구성은 세 덩어리입니다.
  - **Core**(Application Core): 엔티티, 인터페이스, 도메인 서비스(유스케이스). 다른 계층에 의존하지 않습니다. DB 호출·파일·HTTP 요청도 여기서 직접 하지 않습니다.
  - **Infrastructure**: EF Core `DbContext`, 저장소(Repository) 구현, 파일·메일 같은 외부 연동 구현. Core에 정의된 인터페이스를 구현합니다.
  - **UI(Web)**: 컨트롤러·미들웨어·`Program.cs`. Core의 인터페이스만 보고 일합니다.
- **의존성 규칙**: 의존성은 바깥에서 안쪽으로만 향합니다. Core는 "데이터가 어떻게 저장되는지" 모릅니다.
- 실행 시에는 구현체가 필요하므로 `Program.cs`(composition root, 조립 지점)에서 DI로 인터페이스와 구현을 연결합니다.
- 장점: Core를 DB 없이 단위 테스트할 수 있고, 인프라·UI를 바꿔도 Core는 영향받지 않습니다.
- 책의 조언: 로직이 없는 단순 조회까지 껍데기 서비스를 만들 필요는 없지만, 비즈니스 로직이 생기면 컨트롤러가 아니라 서비스에 두라고 합니다.

```csharp
// Core: 인터페이스와 규칙만 있다(DB를 모른다).
public record Hero(int Id, string Name, long Gold);

public interface IHeroRepository
{
    Task<Hero?> FindAsync(int id);
    Task SaveAsync(Hero hero);
}

public class RewardService(IHeroRepository repo)
{
    public async Task<Hero?> AddGoldAsync(int id, long gold)
    {
        var hero = await repo.FindAsync(id);
        if (hero is null || gold <= 0) return null;
        var updated = hero with { Gold = hero.Gold + gold };
        await repo.SaveAsync(updated);
        return updated;
    }
}
```

**방치형 RPG 서버에서는**: 방치 보상 계산 규칙은 Core에, EF Core 저장은 Infrastructure에, HTTP 엔드포인트는 Web에 둡니다. 보상 계산이 DB 없이 테스트된다는 점이 다음 코어(코어 2, 단위 테스트)와 바로 이어집니다.

---

### 1.4 Clean Architecture의 프로젝트 배치와 조립

**한 줄 요약:** 어떤 타입을 어느 프로젝트에 넣을지 정해 두고, `Program.cs`에서 DI로 연결한다.

> 📖 출처: Architecting Modern Web Applications with ASP.NET Core and Azure Ch4 "Organizing code in Clean Architecture" (텍스트 L1061-1131), Architecting ASP.NET Core Applications Ch14 "Clean Architecture" (텍스트 L22183-22226)

**핵심 설명**
- Core에 들어가는 것: 엔티티, 인터페이스, 도메인 서비스, 사용자 정의 예외, Guard 절 등. 필요하면 외부 의존이 없는 단순 DTO도 둡니다.
- Infrastructure에 들어가는 것: `DbContext`, 마이그레이션, 저장소 구현, `FileLogger` 같은 인프라 서비스.
- UI에 들어가는 것: 컨트롤러, 필터, 미들웨어, 그리고 시작 코드(`Program.cs`).
- UI가 Infrastructure 타입을 직접 `new` 하거나 정적 호출하면 안 됩니다. 구현 타입 참조는 조립 지점 한 곳으로 제한합니다. (책은 조립을 위해 UI 프로젝트가 Infrastructure를 참조하는 것을 현실적으로 허용합니다.)
- 프로젝트 참조 방향은 Web → Core, Infrastructure → Core 입니다(조립을 위해 Web → Infrastructure 참조도 허용).

```csharp
// Web 프로젝트의 Program.cs (조립 지점). 아래 타입들은 예제용으로 한 파일에 모았다.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IHeroRepository, InMemoryHeroRepository>(); // Infrastructure 구현 연결
builder.Services.AddScoped<RewardService>();                              // Core 서비스

var app = builder.Build();
app.MapPost("/api/heroes/{id}/reward/{gold}",
    async (int id, long gold, RewardService svc) =>
        await svc.AddGoldAsync(id, gold) is { } hero ? Results.Ok(hero) : Results.NotFound());
app.Run();

// ---- Core ----
public record Hero(int Id, string Name, long Gold);
public interface IHeroRepository
{
    Task<Hero?> FindAsync(int id);
    Task SaveAsync(Hero hero);
}
public class RewardService(IHeroRepository repo)
{
    public async Task<Hero?> AddGoldAsync(int id, long gold)
    {
        var hero = await repo.FindAsync(id);
        if (hero is null || gold <= 0) return null;
        var updated = hero with { Gold = hero.Gold + gold };
        await repo.SaveAsync(updated);
        return updated;
    }
}

// ---- Infrastructure (실제로는 EF Core 구현) ----
public class InMemoryHeroRepository : IHeroRepository
{
    private readonly Dictionary<int, Hero> _store = new() { [1] = new Hero(1, "Arthur", 100) };
    public Task<Hero?> FindAsync(int id) => Task.FromResult(_store.GetValueOrDefault(id));
    public Task SaveAsync(Hero hero) { _store[hero.Id] = hero; return Task.CompletedTask; }
}
```

**방치형 RPG 서버에서는**: 솔루션을 `Game.Core`, `Game.Infrastructure`, `Game.Web` 세 프로젝트로 시작하면 이후 테스트·DB 교체가 쉬워집니다.

> 🔧 보충(책 외): 위 예제는 한 파일에 모았지만 실제로는 프로젝트별로 파일을 나눕니다. 인메모리 저장소는 예제용이며, 서버가 여러 대로 늘면 메모리 저장은 공유되지 않으므로 DB를 써야 합니다.

---

## 코어 2. 단위 테스트 — 인터페이스 뒤에 가짜를 끼워 로직만 빠르게

> 원래 2장 "자동화 테스트와 단위 테스트". 어떤 테스트를 얼마나 둘지 정하고(2.1), 테스트 프로젝트를 만들고(2.2), 한 규칙을 `[Fact]`로(2.3), 여러 값을 `[Theory]`로(2.4) 못 박은 뒤, 의존성이 있는 코드는 인터페이스 뒤에 가짜를 끼워 격리한다(2.5). C++ 서버에서 봇을 붙여 손으로 확인하던 일을, 밀리초 단위로 끝나는 코드로 바꾸는 것이 핵심이다.

### 2.1 자동화 테스트의 종류와 균형

**한 줄 요약:** 테스트는 단위·통합·E2E로 나뉘며, 빠른 테스트를 많이, 느린 테스트를 적게 두되 "투자 대비 효과"로 균형을 잡는다.

> 📖 출처: Architecting ASP.NET Core Applications Ch2 "An overview of automated testing / Finding the right balance" (텍스트 L1839-2050), Web API Development with ASP.NET Core 8 Ch9 "Introduction to testing in ASP.NET Core" (텍스트 L13796-13816)

**핵심 설명**
- **단위 테스트**: 메서드·클래스 같은 작은 단위를 검증. 빠르고 DB 같은 인프라에 의존하지 않습니다.
- **통합 테스트**: 컴포넌트끼리(예: 코드와 DB, 요청 파이프라인) 함께 동작하는지 검증. 인프라가 필요해 더 느립니다.
- **E2E 테스트**: 사용자 관점에서 애플리케이션 전체 동작(예: 버튼 클릭, 웹 API 엔드포인트로 PUT 요청)을 검증합니다. 보통 실제 인프라 위에서 돌리며 가장 느립니다.
- 전통적인 **테스트 피라미드**는 단위 테스트가 가장 많고 E2E가 가장 적은 모양입니다. 책은 REST API처럼 통합이 많은 시스템에서는 통합 테스트 비중을 키우는 **테스트 다이아몬드**를 자주 씁니다. 복잡한 알고리즘은 단위 테스트, 큰 범위는 통합 테스트 몇 개로 덮는 식입니다.
- 강조점은 "실행 속도": 테스트가 빨라야 코드를 망가뜨렸을 때 바로 압니다.
- 코드 커버리지 숫자에 집착하지 말 것. 좋은 테스트 하나가 형편없는 테스트 100%보다 낫습니다.
- 테스트하기 쉬운 코드는 좋은 설계의 신호입니다(테스트가 코드의 첫 번째 사용자가 되므로).

```csharp
// 단위 테스트에 적합한 대상: 입력이 같으면 결과가 항상 같은 순수 계산
public static class OfflineReward
{
    public static long Calculate(long goldPerSecond, TimeSpan away, TimeSpan cap)
    {
        var effective = away > cap ? cap : away;
        return goldPerSecond * (long)effective.TotalSeconds;
    }
}
```

**방치형 RPG 서버에서는**: 방치 보상 계산 같은 규칙은 단위 테스트로 촘촘히, "요청을 보내면 골드가 늘어난다" 같은 흐름은 통합 테스트 몇 개로 확인하는 구성이 잘 맞습니다.

---

### 2.2 xUnit 테스트 프로젝트 만들기와 `dotnet test`

**한 줄 요약:** `dotnet new xunit`으로 테스트 프로젝트를 만들고, 앱 프로젝트를 참조한 뒤 `dotnet test`로 실행한다.

> 📖 출처: Architecting ASP.NET Core Applications Ch2 "Introducing the xUnit framework / How to create an xUnit test project" (텍스트 L2504-2552), ASP.NET Core in Action Ch35 "Creating your first test project with xUnit / Running tests with dotnet test" (텍스트 L44199-44358), Web API Development with ASP.NET Core 8 Ch9 "Setting up the unit tests project" (텍스트 L13865-13917)

**핵심 설명**
- xUnit은 ASP.NET Core와 함께 가장 많이 쓰이는 테스트 프레임워크입니다(ASP.NET Core in Action 저자의 경험 기준이며, ASP.NET Core 프레임워크 프로젝트 자체도 xUnit을 씁니다).
- 테스트 프로젝트는 일반 .NET 프로젝트에 다음 NuGet 패키지가 붙은 것입니다: `Microsoft.NET.Test.Sdk`(테스트 실행에 필요), `xunit`, `xunit.runner.visualstudio`(러너), 선택적으로 `coverlet.collector`(커버리지 수집).
- 이름 규칙: 테스트 대상이 `MyProject`이면 테스트 프로젝트는 `MyProject.Tests`. 폴더는 흔히 `src/`와 `test/`로 나눕니다.
- 테스트하려면 테스트 프로젝트가 앱 프로젝트를 **참조**해야 합니다. 템플릿이 만들어 주는 예제 테스트 `UnitTest1.cs`는 내용이 비어 있으니 지우고 직접 작성하면 됩니다(Web API Development with ASP.NET Core 8).
- `dotnet test`는 복원·빌드 후 테스트를 돌립니다. 솔루션 폴더에서 실행하면 솔루션의 모든 테스트 프로젝트를 실행합니다. 내부적으로 Visual Studio가 쓰는 것과 같은 .NET SDK 인프라를 호출하므로 Visual Studio에서 실행해도 같은 결과가 나옵니다.
- xUnit에서 테스트는 "예외를 던지지 않으면 통과"입니다.

```bash
# 터미널 명령 (C# 코드가 아니라 CLI)
dotnet new xunit -n Game.Tests
dotnet sln add Game.Tests/Game.Tests.csproj
dotnet add Game.Tests/Game.Tests.csproj reference Game.Core/Game.Core.csproj
dotnet test
```

**방치형 RPG 서버에서는**: `Game.Tests`(단위)와 `Game.IntegrationTests`(통합)로 프로젝트를 분리하면 빠른 테스트만 자주 돌리기 쉽습니다. 책도 단위·통합 프로젝트를 나누기를 권합니다(Web API Development with ASP.NET Core 8 Ch10 L15331).

---

### 2.3 `[Fact]`, Assert, Arrange-Act-Assert

**한 줄 요약:** `[Fact]`가 붙은 public 메서드가 테스트이고, `Assert`로 기대값과 실제값을 비교한다.

> 📖 출처: Architecting ASP.NET Core Applications Ch2 "Key xUnit features / Assertions" (텍스트 L2554-2802), Web API Development with ASP.NET Core 8 Ch9 "Writing unit tests without dependencies" (텍스트 L13919-14032), ASP.NET Core in Action Ch35 "Creating your first test project with xUnit" (텍스트 L44261-44290)

**핵심 설명**
- `[Fact]` 메서드는 public이며 매개변수가 없고, public 비정적 클래스 안에 있어야 합니다. `async Task`도 가능합니다.
- 테스트는 **Arrange(준비) - Act(실행) - Assert(검증)** 3단계로 쓰면 읽기 쉽습니다.
- 자주 쓰는 Assert: `Equal`(같다), `NotEqual`, `Same`(같은 인스턴스), `Null`/`NotNull`, `IsType<T>`, `Throws<TException>`(예외 발생). 책은 `NotEqual`보다 `Equal`로 정확히 확인하는 편이 결함을 놓치지 않는다고 조언합니다.
- 테스트 이름은 목적이 드러나게 짓습니다. 예: `SendEmailAsync_ShouldLogError_WhenEmailSendingFails`는 좋은 이름이고 `SendEmailAsyncTest`는 나쁜 이름입니다(Web API Development with ASP.NET Core 8).
- 단위 테스트는 구현 세부사항이 아니라 "입력 → 기대 결과"라는 동작을 검증해야 합니다.

```csharp
using Xunit;

public class OfflineRewardTests
{
    [Fact]
    public void Calculate_ReturnsGoldPerSecondTimesSeconds()
    {
        // Arrange
        long goldPerSecond = 5;
        var away = TimeSpan.FromSeconds(60);
        var cap = TimeSpan.FromHours(8);

        // Act
        long gold = OfflineReward.Calculate(goldPerSecond, away, cap);

        // Assert
        Assert.Equal(300, gold);
    }

    [Fact]
    public void Calculate_CapsAwayTime()
    {
        long gold = OfflineReward.Calculate(1, TimeSpan.FromHours(24), TimeSpan.FromHours(8));
        Assert.Equal(8 * 3600, gold);
    }
}

public static class OfflineReward   // 테스트 대상 (앞 절과 동일)
{
    public static long Calculate(long goldPerSecond, TimeSpan away, TimeSpan cap)
    {
        var effective = away > cap ? cap : away;
        return goldPerSecond * (long)effective.TotalSeconds;
    }
}
```

**방치형 RPG 서버에서는**: "8시간 상한", "0 이하 골드는 거부" 같은 규칙을 하나씩 `[Fact]`로 못 박아 두면, 나중에 계산식을 고쳐도 안전합니다.

---

### 2.4 `[Theory]`와 `[InlineData]`로 여러 값 한 번에 검사

**한 줄 요약:** `[Theory]`는 같은 테스트를 여러 입력값으로 반복 실행하며, 값은 `[InlineData]` 등으로 넘긴다.

> 📖 출처: Architecting ASP.NET Core Applications Ch2 "TheoryAttribute / InlineDataAttribute / MemberDataAttribute" (텍스트 L2805-3097), Architecting ASP.NET Core Applications Ch2 "Test case creation: Equivalence partitioning / Boundary value analysis" (텍스트 L2369-2424)

**핵심 설명**
- `[Theory]` + 데이터 특성(`[InlineData]`, `[MemberData]`, `[ClassData]`)으로 데이터 기반 테스트를 만듭니다. 값 개수는 메서드 매개변수 개수와 같아야 합니다.
- `[InlineData]`는 작은 상수 집합에 적합하고, 케이스마다 결과가 따로 표시됩니다.
- 데이터가 많거나 재사용할 때는 `[MemberData]`로 정적 멤버를 참조합니다. 참조하는 멤버는 반드시 static이어야 합니다. 타입 안전한 `TheoryData<...>`가 `IEnumerable<object[]>`보다 실수가 적습니다. 다른 클래스의 멤버는 `MemberType = typeof(...)`로 지정하고, 여러 `[MemberData]`를 한 메서드에 함께 붙일 수도 있습니다(원문 Architecting ASP.NET Core Applications L2850-3100; `[ClassData]`는 원문에서 이름만 언급).
- 어떤 값을 고를지: 입력을 같은 결과를 내는 그룹으로 나누어 대표값만 고르고(동치 분할), 경계값(예: 1~100이면 0, 1, 2, 99, 100, 101)을 함께 검사합니다(경계값 분석).

```csharp
using Xunit;

public class OfflineRewardTheoryTests
{
    [Theory]
    [InlineData(1, 0, 0)]          // 0초 -> 0골드
    [InlineData(1, 10, 10)]        // 10초 -> 10골드
    [InlineData(2, 10, 20)]
    [InlineData(1, 28800, 28800)]  // 정확히 상한(8시간)
    [InlineData(1, 28801, 28800)]  // 상한 초과 -> 상한으로 제한
    public void Calculate_Works(long goldPerSecond, int awaySeconds, long expected)
    {
        var gold = OfflineReward.Calculate(
            goldPerSecond, TimeSpan.FromSeconds(awaySeconds), TimeSpan.FromHours(8));
        Assert.Equal(expected, gold);
    }

    public static TheoryData<long, int, long> Data => new()
    {
        { 3, 100, 300 },
        { 0, 100, 0 },
    };

    [Theory]
    [MemberData(nameof(Data))]
    public void Calculate_FromMemberData(long gps, int seconds, long expected) =>
        Assert.Equal(expected,
            OfflineReward.Calculate(gps, TimeSpan.FromSeconds(seconds), TimeSpan.FromHours(8)));
}

public static class OfflineReward
{
    public static long Calculate(long goldPerSecond, TimeSpan away, TimeSpan cap)
    {
        var effective = away > cap ? cap : away;
        return goldPerSecond * (long)effective.TotalSeconds;
    }
}
```

**방치형 RPG 서버에서는**: 상한 시간 전후(경계)의 값을 `InlineData`로 나열하면 "정확히 상한일 때" 같은 흔한 버그를 잡을 수 있습니다.

---

### 2.5 의존성이 있는 코드 테스트: 인터페이스와 가짜 구현(Mock)

**한 줄 요약:** 클래스가 인터페이스에 의존하면, 테스트에서는 가짜 구현을 끼워 그 클래스만 따로 검증할 수 있다.

> 📖 출처: Web API Development with ASP.NET Core 8 Ch9 "Writing unit tests with dependencies" (텍스트 L14034-14146), ASP.NET Core in Action Ch35 "An introduction to testing in ASP.NET Core" (텍스트 L44148-44169)

**핵심 설명**
- 단위 테스트는 한 단위만 검사해야 하므로, 그 단위가 의존하는 것(DB, 메일 발송 등)은 가짜(mock/stub)로 대체해 격리합니다. 그렇지 않으면 실패했을 때 어느 쪽 잘못인지 알 수 없습니다.
- 그러려면 코드가 구체 클래스가 아니라 **인터페이스**에 의존해야 합니다. ASP.NET Core in Action은 인터페이스로 의존하면 구현을 다른 것으로 바꿔 끼울 수 있고, 이것이 클래스를 테스트 가능하게 만드는 핵심 습관이라고 설명합니다. 또 ASP.NET Core 프레임워크는 정적 타입을 피하고 구체 클래스 대신 인터페이스를 쓰도록 만들어져 테스트하기 쉽다고 합니다.
- 책(Web API Development with ASP.NET Core 8)은 Moq 라이브러리로 `Mock<IEmailSender>`를 만들어 `Setup`(동작 지정), `Verify`(호출 확인)를 쓰는 방법을 보여줍니다. 작은 프로젝트에서는 아래처럼 직접 만든 가짜 클래스로도 충분합니다.
- `ILogger`의 `LogInformation` 등은 확장 메서드라 직접 mock 하기 어렵고, 결국 `Log()`만 mock 해야 한다는 점도 책이 짚습니다.

```csharp
using Xunit;

public class RewardServiceTests
{
    // 테스트용 가짜 저장소: DB 없이 메모리에만 저장
    private class FakeRepo : IHeroRepository
    {
        public Hero? Saved;
        public Task<Hero?> FindAsync(int id) => Task.FromResult<Hero?>(new Hero(id, "Arthur", 100));
        public Task SaveAsync(Hero hero) { Saved = hero; return Task.CompletedTask; }
    }

    [Fact]
    public async Task AddGoldAsync_IncreasesGoldAndSaves()
    {
        var repo = new FakeRepo();
        var service = new RewardService(repo);

        var result = await service.AddGoldAsync(1, 50);

        Assert.Equal(150, result!.Gold);
        Assert.Equal(150, repo.Saved!.Gold);
    }

    [Fact]
    public async Task AddGoldAsync_RejectsNonPositiveGold()
    {
        var service = new RewardService(new FakeRepo());
        Assert.Null(await service.AddGoldAsync(1, -5));
    }
}

public record Hero(int Id, string Name, long Gold);
public interface IHeroRepository
{
    Task<Hero?> FindAsync(int id);
    Task SaveAsync(Hero hero);
}
public class RewardService(IHeroRepository repo)
{
    public async Task<Hero?> AddGoldAsync(int id, long gold)
    {
        var hero = await repo.FindAsync(id);
        if (hero is null || gold <= 0) return null;
        var updated = hero with { Gold = hero.Gold + gold };
        await repo.SaveAsync(updated);
        return updated;
    }
}
```

**방치형 RPG 서버에서는**: 코어 1(1.3절)에서 Core가 `IHeroRepository`에만 의존하도록 만든 이유가 여기서 드러납니다. DB 없이 골드 지급 로직을 밀리초 단위로 검증할 수 있습니다.

---

## 코어 3. 통합 테스트 — 진짜 앱을 메모리에서 띄우고, 통제 못 하는 것만 바꾼다

> 원래 3장 "통합 테스트". 단위 테스트가 놓치는 것(3.1)을 `WebApplicationFactory`로 앱 전체를 메모리에서 띄워 잡고(3.2), 그렇게 띄운 "진짜 앱"이 외부 서비스(3.3)와 DB(3.4)를 실제로 건드리지 않도록 그 부분만 바꿔 끼운다. 바꿔 끼울 수 있는 이유는 코어 1에서 인터페이스로 등록해 두었기 때문이다.

### 3.1 통합 테스트란 무엇이고 단위 테스트와 어떻게 다른가

**한 줄 요약:** 통합 테스트는 라우팅·모델 바인딩·유효성 검사 같은 ASP.NET Core 기능까지 포함해 "요청 → 응답"을 검증한다.

> 📖 출처: Web API Development with ASP.NET Core 8 Ch10 "Writing integration tests" (텍스트 L15320-15331), ASP.NET Core in Action Ch35 "An introduction to testing in ASP.NET Core" (텍스트 L44167-44197), Architecting ASP.NET Core Applications Ch2 "Integration testing" (텍스트 L1941-1954)

**핵심 설명**
- 각 부품이 따로는 잘 동작해도 합치면 안 될 수 있습니다. 그래서 여러 컴포넌트를 함께 검증하는 통합 테스트가 필요합니다.
- 컨트롤러 인스턴스를 직접 `new` 하는 단위 테스트는 라우팅·모델 바인딩·유효성 검사 같은 ASP.NET Core 기능을 거치지 않습니다. 통합 테스트는 이를 포함합니다.
- 통합 테스트는 보통 mock 없이 실제 의존성을 씁니다. 대신 단위 테스트보다 느리므로 "핵심 흐름 위주로 적게" 씁니다.
- ASP.NET Core는 프로세스 안에서 서버를 돌리는 Test Host를 제공해, 포트·별도 프로세스 없이 전체 앱에 요청을 보낼 수 있습니다.
- 책은 통합 테스트 프로젝트를 단위 테스트 프로젝트와 분리하기를 권합니다. 따로 실행할 수 있고 설정도 다르게 줄 수 있기 때문입니다.
- 테스트 대상 앱을 SUT(System Under Test)라고 부릅니다.

```bash
dotnet new xunit -n Game.IntegrationTests
dotnet add Game.IntegrationTests reference Game.Web/Game.Web.csproj
dotnet add Game.IntegrationTests package Microsoft.AspNetCore.Mvc.Testing
```

**방치형 RPG 서버에서는**: "POST 요청으로 골드를 지급하면 200과 갱신된 영웅이 돌아온다"처럼 API 계약을 잠그는 용도로 씁니다.

---

### 3.2 `WebApplicationFactory`로 앱을 메모리에서 띄워 호출하기

**한 줄 요약:** `WebApplicationFactory<Program>`이 실제 앱을 메모리에서 실행하고, `CreateClient()`로 얻은 `HttpClient`로 요청을 보낸다.

> 📖 출처: ASP.NET Core in Action Ch36 "Testing your application with WebApplicationFactory" (텍스트 L45407-45538), Web API Development with ASP.NET Core 8 Ch10 "Writing basic integration tests with WebApplicationFactory" (텍스트 L15354-15402)

**핵심 설명**
- `Microsoft.AspNetCore.Mvc.Testing` 패키지의 `WebApplicationFactory<T>`는 앱의 실제 설정, DI 등록, 미들웨어 파이프라인을 그대로 써서 앱을 메모리에서 띄웁니다. 내부적으로 Kestrel을 TestServer로 바꿉니다. 패키지 이름에 Mvc가 들어 있어도 MVC를 안 쓰는 앱에도 쓸 수 있습니다.
- 사용 순서: ① 패키지 설치 ② (책 ASP.NET Core in Action 기준) 테스트 프로젝트 SDK를 `Microsoft.NET.Sdk.Web`으로 설정(설정 파일·정적 파일을 찾기 위해 필요하다고 설명) ③ 테스트 클래스에 `IClassFixture<WebApplicationFactory<Program>>` 구현 ④ 생성자로 팩토리 주입 ⑤ `CreateClient()`로 요청.
- 최상위 문장을 쓰는 앱의 `Program` 클래스는 기본이 internal이라 테스트에서 안 보입니다. 앱에 `public partial class Program { }`를 추가하거나 `InternalsVisibleTo`를 씁니다.
- 좋은 통합 테스트는 앱 내부 구현이 아니라 "입력에 대한 동작"만 검증합니다. 구현이 조금만 바뀌어도 깨지는 테스트(brittle)를 피하기 위해서입니다.
- 주의: 팩토리가 띄운 앱은 진짜 앱처럼 동작하므로, 그대로 두면 실제 DB에 쓰거나 외부 API를 부를 수 있습니다(3.3, 3.4절).

> 🔧 보충(책 외): 아래 예제를 .NET 10 SDK + xUnit 2.9 + `Microsoft.AspNetCore.Mvc.Testing` 10.0으로 실제 실행해 통과를 확인했습니다. 이때 테스트 프로젝트 SDK는 기본값 `Microsoft.NET.Sdk` 그대로였습니다. 즉 이 단순한 예제에서는 Web SDK 설정 없이도 동작했지만, 설정·정적 파일을 읽는 앱이라면 책의 안내를 따르세요.

```csharp
// ---- 앱 (Game.Web/Program.cs) ----
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/api/heroes", () => new[] { new Hero(1, "Arthur", 100) });
app.Run();

public record Hero(int Id, string Name, long Gold);
public partial class Program { }   // 테스트 프로젝트에서 접근할 수 있게 public으로 노출
```

```csharp
// ---- 테스트 (Game.IntegrationTests) ----
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

public class HeroesApiTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task GetHeroes_ReturnsOkAndList()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/heroes");

        response.EnsureSuccessStatusCode();   // 200~299
        var heroes = await response.Content.ReadFromJsonAsync<List<Hero>>();
        Assert.NotNull(heroes);
        Assert.Single(heroes);
    }
}
```

**방치형 RPG 서버에서는**: 엔드포인트의 경로, 상태 코드, JSON 모양을 바꿨을 때 클라이언트(모바일 앱)가 깨지는 일을 배포 전에 잡아 줍니다.

---

### 3.3 테스트에서 의존성 바꿔 끼우기 (`ConfigureTestServices`)

**한 줄 요약:** 외부 API·시간·메일처럼 통제하기 어려운 의존성은 테스트용 구현으로 교체하고, 나머지는 진짜를 쓴다.

> 📖 출처: ASP.NET Core in Action Ch36 "Replacing dependencies in WebApplicationFactory / Reducing duplication by creating a custom WebApplicationFactory" (텍스트 L45540-45760), Web API Development with ASP.NET Core 8 Ch10 "Testing with mock services" (텍스트 L15615-15669)

**핵심 설명**
- 팩토리로 띄운 앱은 기본적으로 "Development" 환경과 같은 연결 문자열·설정을 씁니다. 그래서 외부 서비스가 호출될 수 있습니다.
- 서비스를 인터페이스로 등록해 두었다면(책은 `ICurrencyConverter`와 테스트용 `StubCurrencyConverter` 예), `WithWebHostBuilder(...)` 안의 `ConfigureTestServices`에서 기존 등록을 제거(`RemoveAll<T>`)하고 테스트용 구현을 등록합니다. `ConfigureTestServices`는 앱의 서비스 등록 이후에 실행되므로 덮어쓸 수 있습니다.
- `WithWebHostBuilder`는 새 팩토리를 반환하며 원본은 바뀌지 않습니다. 여러 테스트에서 같은 교체를 반복한다면 `WebApplicationFactory<Program>`을 상속한 **사용자 정의 팩토리**에서 `ConfigureWebHost`를 override 해 한 곳에 모읍니다.
- 책의 조언: 실서비스 앱 코드 안에 "테스트일 때는 가짜를 쓴다"는 분기를 넣지 말고 테스트 프로젝트에서만 교체하라고 합니다.
- Web API Development with ASP.NET Core 8은 통합 테스트가 원칙적으로 mock이 아닌 실제 서비스를 써야 하지만, 외부 서비스(예: 메일 발송)는 테스트 환경에서 접근이 안 되거나, 호출 제한·비용이 생기거나, 운영에 영향을 줄 수 있어 이런 경우에 한해 mock으로 바꾸면 유용하다고 설명합니다.

> 🔧 보충(책 외): 아래 `IClock`·`FixedClock`·`/api/time` 예제는 책에 없는 집필자 창작입니다. 책의 `ICurrencyConverter`/`StubCurrencyConverter` 교체 예제와 같은 구조(인터페이스로 등록 → `RemoveAll` → 테스트용 구현 등록)를 시계에 적용해 본 것입니다. 3.2절의 Web 프로젝트에 `IClock` 관련 코드를 추가하고 .NET 10 SDK에서 실제로 실행해 통과를 확인했습니다.

```csharp
// ---- 앱 쪽 (Program.cs에 추가): 시간을 인터페이스로 ----
// builder.Services.AddSingleton<IClock, SystemClock>();   // builder.Build() 전에 등록
// app.MapGet("/api/time", (IClock clock) => clock.UtcNow.Year);
// public interface IClock { DateTime UtcNow { get; } }
// public class SystemClock : IClock { public DateTime UtcNow => DateTime.UtcNow; }

// ---- 테스트 쪽 ----
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

// IClock은 앱 프로젝트에 public으로 선언되어 있다고 가정한다.
public class FixedClock : IClock
{
    public DateTime UtcNow => new(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);
}

public class CustomFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IClock>();                  // 진짜 시계 제거
            services.AddSingleton<IClock, FixedClock>();   // 고정 시계 등록
        });
    }
}

public class TimeApiTests(CustomFactory factory) : IClassFixture<CustomFactory>
{
    [Fact]
    public async Task Time_UsesFixedClock()
    {
        var client = factory.CreateClient();
        var text = await client.GetStringAsync("/api/time");
        Assert.Equal("2030", text);
    }
}
```

**방치형 RPG 서버에서는**: 외부 결제 검증 API처럼 통제하기 어려운 의존성을 인터페이스로 만들어 두고 테스트에서만 바꿔 끼우면 됩니다. 시간도 같은 방식으로 다룰 수 있습니다(아래 보충 참고).

> 🔧 보충(책 외): 방치 보상이 현재 시각에 좌우되므로 시계를 교체하는 활용은 위 창작 예제에 딸린 설명이며, 책의 내용이 아닙니다. 위 앱 쪽 주석 코드를 앱 프로젝트에 넣어야 테스트가 통과합니다.

---

### 3.4 테스트용 데이터베이스 분리

**한 줄 요약:** 테스트는 운영 DB가 아니라 별도 DB(또는 SQLite 인메모리)를 쓰고, 테스트마다 깨끗한 상태에서 시작한다.

> 📖 출처: ASP.NET Core in Action Ch36 "Isolating the database with an in-memory EF Core provider" (텍스트 L45770-45990), Web API Development with ASP.NET Core 8 Ch10 "Testing with a database context" (텍스트 L15405-15613)

**핵심 설명**
- 진짜 DB에 쓰는 테스트는 느리고, 반복 실행이 어렵고, DB 설정에 좌우됩니다. 그래서 테스트 전용 DB를 씁니다.
- Web API Development with ASP.NET Core 8 방식: 사용자 정의 팩토리의 `ConfigureWebHost`에서 등록된 `DbContextOptions<T>`를 찾아 제거하고, 테스트용 연결 문자열로 `AddDbContext`를 다시 등록합니다(책은 SQL Server LocalDB를 사용). 시작할 때 DB를 만들고 시드 데이터를 넣으며, 데이터를 바꾼 테스트 뒤에는 정리합니다. xUnit은 테스트 클래스를 병렬 실행하므로, 같은 DB를 쓰는 클래스는 컬렉션(`[Collection]`)으로 묶어 순차 실행해야 충돌하지 않습니다.
- ASP.NET Core in Action 방식: EF Core의 두 가지 인메모리 공급자 중 `Microsoft.EntityFrameworkCore.Sqlite`(인메모리 모드)가 더 실제 관계형 DB에 가깝습니다. `Microsoft.EntityFrameworkCore.InMemory`는 제약조건도 검사하지 않아 Microsoft가 대체로 권하지 않는다고 책이 설명합니다.
- SQLite 인메모리 DB는 **연결이 닫히면 사라집니다.** 여러 DbContext가 공유하려면 직접 `connection.Open()` 해 두어야 합니다. 또한 SQL Server용 마이그레이션은 SQLite에 적용할 수 없으므로 `EnsureCreated()`로 만듭니다.
- 운영과 같은 종류의 DB를 쓰면 문제를 더 잘 잡는다는 점에서, Docker로 진짜 DB를 띄우는 방법도 책이 언급합니다.

```csharp
// 필요 패키지: Microsoft.EntityFrameworkCore.Sqlite, xunit
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

public class HeroEntity
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public long Gold { get; set; }
}

public class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<HeroEntity> Heroes => Set<HeroEntity>();
}

public class HeroDbTests
{
    [Fact]
    public void CanSaveAndLoadHero()
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();   // 열어 두어야 DB가 유지된다

        var options = new DbContextOptionsBuilder<GameDbContext>().UseSqlite(connection).Options;

        using (var context = new GameDbContext(options))
        {
            context.Database.EnsureCreated();   // 마이그레이션 대신 스키마 생성
            context.Heroes.Add(new HeroEntity { Id = 1, Name = "Arthur", Gold = 100 });
            context.SaveChanges();
        }

        using (var context = new GameDbContext(options))   // 새 컨텍스트로 다시 읽기
        {
            var hero = context.Heroes.Single(h => h.Id == 1);
            Assert.Equal(100, hero.Gold);
        }
    }
}
```

**방치형 RPG 서버에서는**: 골드 저장·조회 쿼리를 이런 인메모리 DB 테스트로 검증하면 진짜 DB 서버 없이도 CI에서 빠르게 돌 수 있습니다.

---

## 코어 4. 불변 이미지와 자동 파이프라인 — 빌드·테스트·배포를 사람 손에서 뗀다

> 원래 4장 "Docker 컨테이너 기본과 CI/CD 개요". 전체 흐름(4.1 CI/CD)을 먼저 잡고, 그 흐름이 실어 나르는 산출물인 이미지·컨테이너(4.2), 이미지를 만드는 레시피(4.3 Dockerfile), 이미지를 돌리는 명령(4.4), 그리고 매 PR마다 코어 2·3의 테스트를 자동으로 돌리는 워크플로(4.5)로 이어진다. C++ 서버에서 "빌드 머신에서 빌드 → 바이너리 복사 → 점검 공지 후 재시작"을 사람이 하던 일을, 같은 이미지로 어디서나 똑같이 되게 자동화하는 것이 핵심이다.

### 4.1 CI/CD가 무엇인가

**한 줄 요약:** CI/CD는 코드를 올리면 자동으로 빌드·테스트하고(CI), 통과한 결과를 자동으로 배포하는(CD) 파이프라인이다.

> 📖 출처: Web API Development with ASP.NET Core 8 Ch14 "Introduction to CI/CD / CI/CD concepts and terminologies / Understanding the importance of CI/CD" (텍스트 L20427-20516), Architecting ASP.NET Core Applications Ch2 "An overview of automated testing" (텍스트 L1897-1907)

**핵심 설명**
- **CI(지속적 통합)**: 개발자가 코드 변경을 자주 합치고, 그때마다 자동으로 빌드·테스트해 충돌과 회귀를 빨리 발견하는 실천입니다.
- **CD**: 지속적 전달 또는 지속적 배포. 실무에서는 대체로 "빌드·테스트한 앱을 개발/스테이징/운영 환경에 자동으로 배포"하는 것을 뜻합니다.
- 전형적 흐름: 변경 커밋·PR 생성 → CI가 빌드+테스트(실패하면 개발자에게 알림) → 승인 후 main 병합 → CI가 산출물(binary, Docker 이미지 등) 발행 → CD가 대상 환경에 배포.
- 용어: **파이프라인**(자동화된 절차), **빌드**, **테스트**, **산출물(artifact)**(빌드 결과물), **트리거**(파이프라인을 시작하는 이벤트, PR·병합·수동), **배포**. 운영 배포는 안전을 위해 수동 트리거로 두기도 합니다.
- 이점: 빠른 피드백, 수작업·실수 감소, 환경 간 일관성("내 컴퓨터에서는 되는데" 방지), 품질 향상, 빠른 릴리스.
- Architecting ASP.NET Core Applications도 CI 파이프라인에서 자동화 테스트를 돌려 코드 변경을 검증하고, 이어서 CD 파이프라인이 애플리케이션을 운영 환경에 배포한다고 설명합니다. 자동화가 사람의 실수 위험을 줄여 준다는 점도 함께 짚습니다.

> 🔧 보충(책 외): 아래 코드는 "테스트 실패 시 배포 중단"이라는 발상을 보여 주려는 집필자 창작이며 책의 예제가 아닙니다. 주석의 세 명령은 4.5절 GitHub Actions 템플릿의 restore/build/test 단계에서 가져왔습니다.

```csharp
// CI가 실행하는 일은 결국 이런 명령들이다 (스크립트에 그대로 들어감)
// dotnet restore
// dotnet build --no-restore
// dotnet test --no-build
// 아래는 "테스트가 실패하면 배포하지 않는다"는 발상을 코드로 흉내 낸 것
var testsPassed = true;
Console.WriteLine(testsPassed ? "deploy" : "stop");
```

**방치형 RPG 서버에서는**: 골드·보상 로직을 고치는 PR마다 테스트가 자동 실행되면, 실수로 재화 계산이 틀린 서버가 배포되는 사고를 줄일 수 있습니다.

---

### 4.2 컨테이너와 Docker 이미지

**한 줄 요약:** 컨테이너는 앱과 실행에 필요한 모든 것을 한 상자에 담아 어디서나 똑같이 실행하게 해 주는 기술이다.

> 📖 출처: Web API Development with ASP.NET Core 8 Ch14 "What is containerization?" (텍스트 L20524-20548), Architecting Modern Web Applications with ASP.NET Core and Azure Ch4 "Monolithic applications and containers / Monolithic application deployed as a container" (텍스트 L1133-1219)

**핵심 설명**
- 컨테이너는 가볍고 격리된 이동 가능한 실행 환경입니다. VM과 달리 게스트 OS를 따로 두지 않고 호스트 OS의 커널을 공유해서 더 가볍습니다.
- **이미지**는 앱 코드, 런타임, 설정을 묶은 불변의 패키지이고, **컨테이너**는 그 이미지를 실행한 인스턴스입니다. 같은 이미지로 컨테이너를 여러 개 만들 수 있어(확장), 죽으면 몇 초 만에 다시 만들 수 있습니다.
- 이미지는 **레지스트리**(Docker Hub, Azure Container Registry 등)에 보관합니다.
- 컨테이너 안의 쓰기 계층은 컨테이너가 사라지면 함께 사라집니다. 영속 데이터는 컨테이너 안이 아니라 **볼륨** 등에 저장해야 합니다.
- Architecting Modern Web Applications with ASP.NET Core and Azure: 모놀리식 앱도 컨테이너 하나로 배포할 수 있습니다. 확장은 같은 컨테이너를 복제하고 앞에 로드밸런서를 두면 되고, 이미지는 빠르게 시작하며 불변이라 "내 컴퓨터에서는 되는데"를 줄입니다. 반면 일부 기능만 확장하고 싶어도 전체를 복제해야 한다는 한계가 있습니다. 책은 마이크로서비스가 복잡도를 늘리므로 모놀리식 컨테이너가 더 나은 경우도 많다고 정리합니다.

```csharp
// 컨테이너에 담긴 서버는 "환경"에서 설정을 받는 것이 자연스럽다.
var port = Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS") ?? "(default)";
Console.WriteLine($"Listening port setting: {port}");
```

**방치형 RPG 서버에서는**: 개발 PC, 테스트 서버, 운영 서버에서 같은 이미지를 실행하므로 환경 차이로 인한 버그가 줄어듭니다. 게임 데이터(DB)는 컨테이너 밖에 두어야 합니다.

> 🔧 보충(책 외): 위 코드와 환경 변수 이름(ASPNETCORE_HTTP_PORTS)은 책에 없는 집필자 예시입니다. 책에서 컨테이너가 8080 포트를 듣는다는 것은 Dockerfile의 `EXPOSE`와 로그(`Now listening on: http://[::]:8080`)로 나타납니다. 실제 포트 설정 방식은 .NET 버전에 따라 다를 수 있으니 사용 버전 문서를 확인하세요.

---

### 4.3 Dockerfile 읽기

**한 줄 요약:** Dockerfile은 이미지를 만드는 레시피이고, .NET 앱은 "SDK로 빌드하고 런타임만 남기는" 멀티스테이지 빌드를 쓴다.

> 📖 출처: Web API Development with ASP.NET Core 8 Ch14 "Understanding Dockerfiles / Building a Docker image의 Dockerfile 작성 팁" (텍스트 L20604-20740)

**핵심 설명**
- 책이 보여주는 기본 Dockerfile(Visual Studio가 생성)의 흐름:
  1. `FROM ...aspnet:8.0 AS base`: 실행용 런타임 이미지를 base로 지정. `USER app`으로 root가 아닌 사용자로 실행, `EXPOSE`는 컨테이너가 듣는 포트를 알림(호스트에 공개하는 것은 아님).
  2. `FROM ...sdk:8.0 AS build`: SDK 이미지로 빌드. `.csproj`만 먼저 복사해 `dotnet restore`, 그 다음 전체 소스를 복사해 `dotnet build`.
  3. `FROM build AS publish`: `dotnet publish`로 배포용 결과물 생성.
  4. `FROM base AS final`: 런타임 이미지 위에 publish 결과만 복사하고 `ENTRYPOINT`로 시작 명령을 지정.
- **멀티스테이지**: 최종 이미지에는 마지막 단계만 남으므로 SDK가 빠져 이미지가 작아집니다.
- **레이어 캐시**: 변하지 않는 층을 앞에 두면 재빌드가 빨라집니다. `.csproj`를 먼저 복사해 restore 하는 이유는, 소스만 바뀌고 패키지는 안 바뀌었을 때 restore 층을 재사용하기 위해서입니다. `.dockerignore`로 `bin/`, `obj/` 등 불필요한 파일을 뺍니다.
- 컨테이너는 Linux 이미지를 권장합니다(더 작고 클라우드 지원이 넓음).

```dockerfile
# Game.Web/Dockerfile (책의 구조를 따른 예: 프로젝트명만 게임 맥락으로 변경, 책 원본의 EXPOSE 8081과 WORKDIR "/src/." 줄은 생략)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
USER app
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["Game.Web.csproj", "."]
RUN dotnet restore "./Game.Web.csproj"
COPY . .
RUN dotnet build "Game.Web.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
RUN dotnet publish "Game.Web.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Game.Web.dll"]
```

**방치형 RPG 서버에서는**: 이 Dockerfile 한 장이 곧 "우리 서버를 어디서든 같은 방식으로 빌드·실행하는 방법"의 기록입니다.

---

### 4.4 이미지 빌드와 컨테이너 실행 명령

**한 줄 요약:** `docker build`로 이미지를 만들고, `docker run -p`로 컨테이너를 실행하며 포트를 연결한다.

> 📖 출처: Web API Development with ASP.NET Core 8 Ch14 "Building a Docker image / Running a Docker container" (텍스트 L20699-20710, L20750-20850)

**핵심 설명**
- `docker build -t 이름[:태그] .` : 현재 폴더의 Dockerfile로 이미지를 만듭니다. 태그를 생략하면 `latest`입니다.
- `docker images` : 이미지 목록. `docker rmi 이미지` : 이미지 삭제(그 이미지로 만든 컨테이너는 중지한 뒤 `docker rm`으로 먼저 삭제).
- `docker run -d -p 80:8080 --name 이름 이미지` : `-d`는 백그라운드 실행, `-p 호스트포트:컨테이너포트`는 포트 연결. 앞이 호스트, 뒤가 컨테이너 포트이므로 헷갈리지 않도록 주의하라고 책이 강조합니다.
- `docker ps`(실행 중 목록), `docker ps -a`(전체), `docker stop`, `docker restart`, `docker rm`, `docker logs 이름`(로그), `docker stats`(자원 사용).
- 호스트 포트가 이미 사용 중이면 다른 포트(예: `-p 5000:8080`)를 씁니다.

```bash
# 터미널 명령
docker build -t gameserver:v1 .
docker run -d -p 5000:8080 --name gameserver gameserver:v1
docker ps
docker logs gameserver
# 확인: http://localhost:5000/api/heroes
docker stop gameserver
```

**방치형 RPG 서버에서는**: 같은 이미지를 `-p`만 바꿔 여러 개 띄우면 서버를 수평 확장하는 모습을 로컬에서 흉내 낼 수 있습니다. 단, 서버 인스턴스가 늘면 메모리에만 있는 상태는 공유되지 않는다는 점을 기억하세요.

> 🔧 보충(책 외): "인스턴스가 늘면 메모리 상태가 공유되지 않는다"는 일반적인 서버 설계 상식이며 책의 해당 절에 나온 문장은 아닙니다.

---

### 4.5 GitHub Actions로 만드는 CI 워크플로

**한 줄 요약:** 저장소의 `.github/workflows/*.yml` 파일 하나가 "코드가 올라오면 빌드하고 테스트한다"는 자동화를 정의한다.

> 📖 출처: Web API Development with ASP.NET Core 8 Ch14 "GitHub Actions / Creating GitHub Actions" (텍스트 L21448-21553)

**핵심 설명**
- GitHub Actions는 GitHub가 제공하는 CI/CD 도구입니다. 워크플로는 YAML 파일이며 `.github/workflows` 폴더에 둡니다.
- 구조: `on`(트리거: push, pull_request와 대상 브랜치), `jobs`(작업), `steps`(단계). 각 단계는 미리 만들어진 `uses`(액션) 또는 직접 쓰는 `run`(명령)입니다.
- 책의 기본 .NET 템플릿은 checkout → .NET 설치 → `dotnet restore` → `dotnet build` → `dotnet test`로 구성됩니다. 책의 샘플 앱이 .NET 8이므로 `dotnet-version`을 `8.0.x`로 바꾸라고 안내합니다(템플릿 기본값은 6.0.x).
- PR에서 이 워크플로가 자동으로 돌고 테스트가 실패하면 PR에 실패가 표시되어, 병합 전에 문제를 고칠 수 있습니다.
- 책은 이어서 Docker 이미지를 빌드해 레지스트리(ACR)에 올리는 워크플로도 다룹니다(여기서는 클라우드 리소스 세부는 생략).

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup .NET
      uses: actions/setup-dotnet@v3
      with:
        dotnet-version: 8.0.x
    - name: Restore dependencies
      run: dotnet restore
    - name: Build
      run: dotnet build --no-restore
    - name: Test
      run: dotnet test --no-build --verbosity normal
```

**방치형 RPG 서버에서는**: 코어 2·3(단위·통합 테스트)에서 만든 테스트가 이 워크플로의 마지막 `dotnet test` 단계에서 매 PR마다 자동 실행됩니다. 여기서 통과한 코드만 병합하고, 병합된 코드로 Docker 이미지를 만들어 배포하는 것이 기본 흐름입니다.

> 🔧 보충(책 외): 액션 버전(`@v3`)은 책 출간 시점 기준이며, 실제로는 최신 버전을 확인해 사용하세요. 서버 배포 대상(클라우드 종류)은 이 책 범위에서 다루지 않습니다.

---

## 실무 적용

### 체크리스트

**아키텍처 (→ 코어 1)**
- [ ] 솔루션을 `Game.Core` / `Game.Infrastructure` / `Game.Web`으로 나누고, 프로젝트 참조가 Web → Core, Infrastructure → Core 방향인지 확인했다 (조립을 위한 Web → Infrastructure는 허용).
- [ ] Core에는 엔티티·인터페이스·도메인 서비스만 있고, DB 호출·파일·HTTP 요청을 직접 하지 않는다.
- [ ] 구현 타입을 `new` 하거나 정적 호출하는 곳은 `Program.cs`(조립 지점) 한 곳뿐이다.
- [ ] 비즈니스 로직이 생기면 컨트롤러가 아니라 서비스에 둔다 (로직 없는 단순 조회까지 껍데기 서비스를 만들 필요는 없다).
- [ ] 인메모리 저장소는 예제·테스트용이다. 서버가 여러 대가 되면 DB를 쓴다.

**테스트 (→ 코어 2, 3)**
- [ ] 단위 테스트(`Game.Tests`)와 통합 테스트(`Game.IntegrationTests`) 프로젝트를 분리했다.
- [ ] 방치 보상 같은 규칙은 `[Fact]`(AAA)로, 상한 경계 전후 값은 `[Theory]` + `[InlineData]`로 못 박았다 (0, 일반 값, 정확히 상한, 상한 초과).
- [ ] 테스트 이름이 목적을 드러낸다 (`메서드_기대동작_조건`).
- [ ] 커버리지 숫자보다 "좋은 테스트"와 실행 속도를 본다.
- [ ] 통합 테스트용으로 앱에 `public partial class Program { }`를 추가했다.
- [ ] 외부 API·시간·메일 같은 통제 불가 의존성은 `ConfigureTestServices` + `RemoveAll<T>`로 테스트 프로젝트에서만 교체한다 (앱 코드에 "테스트면 가짜" 분기 금지).
- [ ] 테스트는 운영/개발 DB가 아니라 테스트 전용 DB를 쓴다. SQLite 인메모리는 연결을 열어 두고 `EnsureCreated()`, 같은 DB를 쓰는 테스트 클래스는 `[Collection]`으로 묶는다.

**배포 (→ 코어 4)**
- [ ] Dockerfile이 멀티스테이지(base/build/publish/final)이고 `.csproj`를 먼저 복사해 restore 한다. `.dockerignore`로 `bin/`, `obj/`를 뺐다.
- [ ] 컨테이너 안에 영속 데이터를 쓰지 않는다 (게임 DB는 컨테이너 밖, 볼륨 등).
- [ ] `docker run -p 호스트:컨테이너` 순서를 확인했다.
- [ ] `.github/workflows/ci.yml`이 PR마다 restore → build → test를 돌리고, 실패하면 병합하지 않는다.
- [ ] 액션 버전(`@v3` 등)은 최신 버전을 확인해 쓴다.

### 시나리오로 확인하기

1. **상황:** 방치 보상 `RewardService`가 생성자에서 `new GameDbContext(...)`로 DB에 직접 접근한다. 상한 계산 버그를 고치고 테스트를 쓰려 했더니 테스트마다 DB 서버가 떠 있어야 하고, 실패하면 계산이 틀린 건지 DB 연결 문제인지 알 수 없다. C++ 서버에서 컨텐츠 로직이 DB 작업 객체를 직접 들고 있던 습관 그대로다.
   **질문:** 구조적 원인은 무엇이고 어떻게 바꿔야 하나?

   <details markdown="1"><summary>답 확인</summary>

   전통 계층(UI → BLL → DAL)처럼 비즈니스 로직이 DB 구현 세부에 의존하고 있어서, 로직을 테스트하려면 테스트용 DB가 필요해진다. Core에 `IHeroRepository` 같은 인터페이스를 정의하고 `RewardService`는 그 인터페이스만 생성자로 받게 바꾼다. EF Core 구현은 Infrastructure에 두고 `Program.cs`에서 DI로 연결한다. 그러면 테스트에서는 `FakeRepo` 같은 가짜 구현을 끼워 DB 없이 밀리초 단위로 로직만 검증할 수 있고, 실패하면 로직 문제임이 분명해진다. → 코어 1(1.2, 1.3, 1.4), 코어 2(2.5)

   </details>

2. **상황:** `WebApplicationFactory<Program>`으로 "보상 지급 API" 통합 테스트를 돌렸더니, 개발 DB에 테스트 영웅 데이터가 쌓이고 외부 결제 검증 API 호출 기록이 남았다. 급한 마음에 앱 코드에 `if (isTest) 가짜 사용` 분기를 넣으려 한다.
   **질문:** 왜 이런 일이 생겼고, 올바른 해결책은?

   <details markdown="1"><summary>답 확인</summary>

   팩토리가 띄운 앱은 앱의 실제 설정·DI·미들웨어를 그대로 쓰는 "진짜 앱"이고 기본적으로 Development 환경과 같은 연결 문자열·설정을 쓰므로, 실제 DB에 쓰고 외부 API를 부른다. 앱 코드에 테스트 분기를 넣지 말고(책의 조언), 사용자 정의 팩토리의 `ConfigureWebHost`에서 `ConfigureTestServices`로 외부 서비스 등록을 `RemoveAll<T>()`로 지우고 테스트용 구현을 등록한다. DB는 등록된 `DbContextOptions<T>`를 제거하고 테스트용 연결 문자열(또는 SQLite 인메모리)로 `AddDbContext`를 다시 등록한다. → 코어 3(3.2, 3.3, 3.4)

   </details>

3. **상황:** 테스트 서버에서는 잘 되던 서버를, 늘 하던 대로 운영 서버에 빌드 결과물을 복사하고 점검 공지 후 재시작했다. 그런데 운영 서버의 .NET 런타임 버전과 설정 파일이 달라 서버가 뜨지 않아 점검이 연장됐다.
   **질문:** 코어 4의 방식이라면 무엇이 달라지나?

   <details markdown="1"><summary>답 확인</summary>

   이미지는 앱 코드·런타임·설정을 묶은 불변 패키지이므로, 개발 PC·테스트 서버·운영 서버에서 같은 이미지를 실행하면 환경 차이로 인한 버그("내 컴퓨터에서는 되는데")가 줄어든다. 사람이 손으로 빌드·복사하는 대신 CI가 매 PR마다 restore → build → test를 돌리고, 병합된 코드로 이미지를 만들어 레지스트리에 올린 뒤 CD가 대상 환경에 배포한다. 수작업·실수가 줄고, 운영 배포는 안전을 위해 수동 트리거로 둘 수도 있다. → 코어 4(4.1, 4.2, 4.5)

   > 🔧 보충(책 외): 이미지에 `gameserver:v1`처럼 태그를 붙여 두면, 문제가 생겼을 때 이전 태그의 이미지로 다시 실행하는 방식으로 되돌리기 쉽습니다. 다만 무중단 배포(접속 중인 요청을 끊지 않고 교체)는 이 부의 범위가 아니며 오케스트레이션 도구의 영역입니다.

   </details>

4. **상황:** 편의상 영웅 데이터를 컨테이너 안의 SQLite 파일(`/app/game.db`)에 저장했다. 새 버전 이미지로 컨테이너를 교체하자 모든 유저의 골드가 초기화됐다. 서버 PC 로컬 디스크에 세이브 파일을 쓰던 습관이 원인이다.
   **질문:** 무엇이 잘못됐나?

   <details markdown="1"><summary>답 확인</summary>

   컨테이너 안의 쓰기 계층은 컨테이너가 사라지면 함께 사라진다. 이미지는 불변이고 컨테이너는 그 실행 인스턴스일 뿐이므로, 영속 데이터(게임 DB)는 컨테이너 안이 아니라 볼륨 등 컨테이너 밖에 두어야 한다. 또 같은 이미지를 여러 개 띄우면 각 컨테이너의 로컬 데이터는 서로 공유되지 않는다. → 코어 4(4.2, 4.4)

   </details>

5. **상황:** SQLite 인메모리 테스트에서 `UseSqlite("DataSource=:memory:")`처럼 연결 문자열만 넘겼더니, `EnsureCreated()`를 분명히 호출했는데도 그 뒤 저장하거나 새 `DbContext`로 읽을 때 테이블이 없다는 오류가 난다. 또 다른 날에는 같은 테스트 DB를 쓰는 두 테스트 클래스가 가끔씩만 실패한다.
   **질문:** 두 문제의 원인과 해결책은?

   <details markdown="1"><summary>답 확인</summary>

   SQLite 인메모리 DB는 연결이 닫히면 사라진다. 연결 문자열만 넘기면 연결이 닫히는 순간 DB가 없어지므로, `SqliteConnection`을 직접 만들어 `connection.Open()` 해 두고 그 연결을 `UseSqlite(connection)`으로 여러 DbContext가 공유해야 한다. 가끔씩만 실패하는 문제는 xUnit이 테스트 클래스를 병렬로 실행하기 때문이며, 같은 DB를 쓰는 클래스는 `[Collection]`으로 묶어 순차 실행한다. → 코어 3(3.4)

   > 🔧 보충(책 외): 이때 보이는 오류는 보통 `SQLite Error 1: 'no such table: Heroes'` 형태입니다. 연결 문자열만 넘기면 EF Core가 작업마다 연결을 열고 닫으므로, 다음 작업은 새로 열린 빈 메모리 DB를 보게 되기 때문입니다.

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
제13부 아키텍처·테스트·배포 — 한 문장: 의존성은 ____ 으로 → DB 없이 ____ 테스트 → 메모리에서 ____ 테스트 → CI가 PR마다 → 불변 ____ 로 배포
├─ 코어 1 의존성은 안쪽으로 (아키텍처)
│   ├─ 모놀리식 = 하나의 단위로 ____ / 확장 = 앱 전체 ( ? )
│   ├─ 계층(____적) vs 티어(____적) — 3계층 앱을 서버 1대에 = ( ? )
│   ├─ 전통 계층: UI → BLL → DAL, 약점 = 로직이 ____ 에 의존
│   └─ Clean: Core(엔티티·____·도메인 서비스) ← Infrastructure(DbContext·____ 구현) / Web(컨트롤러·미들웨어)
│        규칙: 의존성은 ____ 에서 ____ 으로 / 조립 지점 = ____
├─ 코어 2 단위 테스트
│   ├─ 종류: 단위 / 통합 / ____ — 피라미드 vs ( ? )
│   ├─ 프로젝트: dotnet new ____ / 앱 프로젝트 ____ / dotnet test
│   ├─ [Fact]: public, 매개변수 없음 / AAA = ____ - ____ - ____
│   ├─ [Theory] + InlineData / MemberData(____ 멤버, TheoryData) — 값 고르기: ____ 분할, ____ 분석
│   └─ 의존성 격리: ____ 에 의존 → 가짜 구현(Mock/Fake)
├─ 코어 3 통합 테스트
│   ├─ 단위와 차이: 라우팅·모델 바인딩·____ 포함
│   ├─ WebApplicationFactory<Program> → ____() / Program 노출: public partial class Program
│   ├─ 의존성 교체: WithWebHostBuilder / ConfigureTestServices → ____<T> → 테스트용 등록
│   └─ 테스트 DB: SQLite 인메모리(연결 ____ 유지, ____Created) / InMemory 공급자(____ 미검사) / [Collection]
└─ 코어 4 불변 이미지와 자동 파이프라인 (Docker와 CI/CD)
    ├─ CI = 자동 ____·____ / CD = 자동 ____
    ├─ 이미지(불변) vs 컨테이너(____) / 영속 데이터 = ____
    ├─ Dockerfile: base(aspnet) → build(sdk) → publish → final (____ 빌드), .csproj 먼저 = ____ 캐시
    ├─ docker run -d -p ____:____
    └─ GitHub Actions: on / jobs / steps(uses·run): checkout → setup-dotnet → restore → build → ____
```

### 2. 인출 질문

1. 모놀리식 애플리케이션의 정의는? 프로젝트를 계층별로 여러 개로 나눠도 여전히 모놀리식인 이유는?

   <details markdown="1"><summary>답 확인</summary>

   자기 프로세스 안에서 핵심 동작을 모두 실행하고 통째로 하나의 단위로 배포되는 앱이며, 서버를 늘리려면 앱 전체를 복제한다. 여러 프로젝트로 나눠도 배포는 여전히 하나이므로 모놀리식이다. 프로젝트 하나에서 폴더로만 나누면 앱이 커질 때 의존 규칙이 흐려져 스파게티 코드가 되기 쉬워 계층별 프로젝트로 진화한다. → 코어 1(1.1)

   </details>

2. 계층(layer)과 티어(tier)는 어떻게 다른가요? 3계층 앱을 서버 한 대에 배포하면 무엇이라 부르나요?

   <details markdown="1"><summary>답 확인</summary>

   계층은 코드를 역할별로 나눈 논리적 구획이고, 티어는 실제로 따로 배포되는 물리적 구분이다. 3계층 앱을 서버 한 대에 배포하면 "1티어 3계층"이고, DB를 클라우드에 따로 두면 2티어가 된다. 어셈블리와 계층도 1:1은 아니지만 책은 대부분 계층마다 프로젝트를 나누기를 권한다. → 코어 1(1.2)

   </details>

3. 계층을 나누면 얻는 세 가지 이점과, 전통적인 UI → BLL → DAL 계층의 약점은 무엇인가요?

   <details markdown="1"><summary>답 확인</summary>

   공통 기능 재사용, 한 계층을 바꿔도 영향 범위가 줄어듦, 테스트 때 진짜 DB 대신 가짜 구현을 끼울 수 있음. 약점은 의존 방향이 위에서 아래라 가장 중요한 비즈니스 로직이 DB 구현 세부에 의존하게 되고, 그래서 로직을 테스트하려면 테스트용 DB가 필요해진다는 것이다. → 코어 1(1.2)

   </details>

4. Clean Architecture의 세 덩어리와 각각에 들어가는 것, 그리고 의존성 규칙을 말해 보세요. 실행 시 구현체는 어디서 연결하나요?

   <details markdown="1"><summary>답 확인</summary>

   Core: 엔티티, 인터페이스, 도메인 서비스(사용자 정의 예외, Guard 절 등), 다른 계층에 의존하지 않고 DB·파일·HTTP를 직접 다루지 않는다. Infrastructure: `DbContext`, 마이그레이션, 저장소 구현, 외부 연동 구현(Core의 인터페이스를 구현). UI(Web): 컨트롤러, 필터, 미들웨어, `Program.cs`. 의존성은 바깥에서 안쪽으로만 향하고, 실행 시에는 조립 지점인 `Program.cs`에서 DI로 인터페이스와 구현을 연결한다. 그 덕분에 Core를 DB 없이 단위 테스트할 수 있다. → 코어 1(1.3, 1.4)

   </details>

5. Clean Architecture에서 UI가 Infrastructure 타입을 직접 `new` 하면 왜 안 되나요? 프로젝트 참조 방향은 어떻게 되나요?

   <details markdown="1"><summary>답 확인</summary>

   구현 타입 참조는 조립 지점 한 곳으로 제한해야 하기 때문이다. UI가 구현을 직접 만들거나 정적 호출하면 Core의 인터페이스만 보고 일한다는 구조가 무너진다. 참조 방향은 Web → Core, Infrastructure → Core이고, 조립을 위해 Web → Infrastructure 참조는 현실적으로 허용한다. 로직 없는 단순 조회까지 껍데기 서비스를 만들 필요는 없지만, 로직이 생기면 컨트롤러가 아니라 서비스에 둔다. → 코어 1(1.3, 1.4)

   </details>

6. 단위·통합·E2E 테스트를 구분하고, 테스트 피라미드와 테스트 다이아몬드의 차이를 설명해 보세요.

   <details markdown="1"><summary>답 확인</summary>

   단위: 메서드·클래스 같은 작은 단위, 빠르고 인프라에 의존하지 않는다. 통합: 컴포넌트끼리(코드와 DB, 요청 파이프라인) 함께 동작하는지, 더 느리다. E2E: 사용자 관점에서 앱 전체 동작, 실제 인프라 위에서 가장 느리다. 피라미드는 단위가 가장 많고 E2E가 가장 적은 모양이고, 다이아몬드는 REST API처럼 통합이 많은 시스템에서 통합 테스트 비중을 키운 모양이다. 핵심은 실행 속도와 투자 대비 효과다. → 코어 2(2.1)

   </details>

7. 코드 커버리지와 "테스트하기 쉬운 코드"에 대해 책은 무엇이라 하나요?

   <details markdown="1"><summary>답 확인</summary>

   커버리지 숫자에 집착하지 말라고 한다. 좋은 테스트 하나가 형편없는 테스트로 채운 100%보다 낫다. 테스트가 코드의 첫 번째 사용자가 되므로, 테스트하기 쉬운 코드는 좋은 설계의 신호다. → 코어 2(2.1)

   </details>

8. xUnit 테스트 프로젝트에 필요한 패키지와, 앱 코드를 테스트하기 위한 필수 설정은? `dotnet test`를 솔루션 폴더에서 실행하면?

   <details markdown="1"><summary>답 확인</summary>

   `Microsoft.NET.Test.Sdk`(실행에 필요), `xunit`, `xunit.runner.visualstudio`(러너), 선택적으로 `coverlet.collector`(커버리지). 테스트 프로젝트가 앱 프로젝트를 참조해야 한다(`dotnet add ... reference ...`). 이름은 흔히 `MyProject.Tests`. `dotnet test`는 복원·빌드 후 테스트를 돌리며, 솔루션 폴더에서 실행하면 모든 테스트 프로젝트를 실행한다. → 코어 2(2.2)

   </details>

9. `[Fact]` 테스트 메서드의 조건과 통과 기준은? Arrange-Act-Assert와 좋은 테스트 이름의 예를 들어 보세요.

   <details markdown="1"><summary>답 확인</summary>

   public이고 매개변수가 없으며, public 비정적 클래스 안에 있어야 한다(`async Task` 가능). xUnit에서 테스트는 예외를 던지지 않으면 통과다. 준비(Arrange) - 실행(Act) - 검증(Assert) 3단계로 쓰고, 이름은 `SendEmailAsync_ShouldLogError_WhenEmailSendingFails`처럼 목적이 드러나게 짓는다(`SendEmailAsyncTest`는 나쁜 예). `NotEqual`보다 `Equal`로 정확히 확인하는 편이 결함을 놓치지 않는다. → 코어 2(2.2, 2.3)

   </details>

10. `[Theory]`에 값을 넘기는 방법들과 각각의 규칙은? `[InlineData]` 값 개수는 무엇과 맞아야 하나요?

    <details markdown="1"><summary>답 확인</summary>

    `[InlineData]`(작은 상수 집합, 케이스마다 결과가 따로 표시), `[MemberData]`(데이터가 많거나 재사용할 때, 참조 멤버는 반드시 static, 타입 안전한 `TheoryData<...>` 권장, 다른 클래스는 `MemberType = typeof(...)`), `[ClassData]`. 값 개수는 메서드 매개변수 개수와 같아야 한다. → 코어 2(2.4)

    </details>

11. 동치 분할과 경계값 분석으로 테스트 값을 고르는 방법을, "방치 보상 8시간 상한"에 적용해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    동치 분할은 입력을 같은 결과를 내는 그룹으로 나눠 대표값만 고르는 것이고, 경계값 분석은 경계와 그 양옆(예: 1~100이면 0, 1, 2, 99, 100, 101)을 함께 검사하는 것이다. 방치 보상에서는 0초, 상한 미만의 일반 값, 정확히 상한(28800초), 상한 초과(28801초)를 `[InlineData]`로 나열해 "정확히 상한일 때" 같은 흔한 버그를 잡는다. → 코어 2(2.4)

    </details>

12. DB나 메일 발송에 의존하는 클래스를 단위 테스트하려면 무엇이 필요한가요? `ILogger`를 mock 할 때의 주의점은?

    <details markdown="1"><summary>답 확인</summary>

    단위 테스트는 한 단위만 검사해야 하므로 의존하는 것을 가짜(mock/stub)로 대체해 격리한다. 그러려면 코드가 구체 클래스가 아니라 인터페이스에 의존해야 한다. 책은 Moq로 `Mock<IEmailSender>`를 만들어 `Setup`/`Verify`를 쓰고, 작은 프로젝트는 직접 만든 가짜 클래스로도 충분하다. `LogInformation` 등은 확장 메서드라 직접 mock 하기 어려워 결국 `Log()`를 mock 해야 한다. → 코어 2(2.5)

    </details>

13. 통합 테스트는 컨트롤러를 직접 `new` 하는 단위 테스트와 무엇이 다른가요? Test Host는 무엇을 가능하게 하나요?

    <details markdown="1"><summary>답 확인</summary>

    컨트롤러를 직접 만드는 단위 테스트는 라우팅·모델 바인딩·유효성 검사 같은 ASP.NET Core 기능을 거치지 않지만, 통합 테스트는 이를 포함해 "요청 → 응답"을 검증한다. 보통 mock 없이 실제 의존성을 쓰고, 느리므로 핵심 흐름 위주로 적게 쓴다. Test Host는 프로세스 안에서 서버를 돌려 포트·별도 프로세스 없이 전체 앱에 요청을 보낼 수 있게 한다. 통합 테스트 프로젝트는 단위 테스트와 분리한다. → 코어 3(3.1)

    </details>

14. `WebApplicationFactory<Program>`으로 통합 테스트를 쓰는 순서를 말해 보세요. 최상위 문장을 쓰는 앱에서 `Program`이 테스트에 안 보이는 문제는 어떻게 푸나요?

    <details markdown="1"><summary>답 확인</summary>

    `Microsoft.AspNetCore.Mvc.Testing` 설치 → (책 기준) 테스트 프로젝트 SDK를 `Microsoft.NET.Sdk.Web`으로 → 테스트 클래스에 `IClassFixture<WebApplicationFactory<Program>>` 구현 → 생성자로 팩토리 주입 → `CreateClient()`로 요청. 팩토리는 앱의 실제 설정·DI·미들웨어를 그대로 쓰고 Kestrel을 TestServer로 바꾼다. `Program`은 기본이 internal이므로 `public partial class Program { }`를 추가하거나 `InternalsVisibleTo`를 쓴다. 좋은 통합 테스트는 구현이 아니라 입력에 대한 동작만 검증한다. → 코어 3(3.2)

    </details>

15. 통합 테스트에서 외부 API 같은 의존성을 바꿔 끼우는 방법과, 책이 말하는 금지 사항은?

    <details markdown="1"><summary>답 확인</summary>

    팩토리로 띄운 앱은 Development와 같은 설정을 써서 외부 서비스가 실제로 호출될 수 있다. 인터페이스로 등록된 서비스를 `WithWebHostBuilder(...)` 안의 `ConfigureTestServices`에서 `RemoveAll<T>()`로 제거하고 테스트용 구현을 등록한다(앱 등록 이후 실행되므로 덮어쓸 수 있다). `WithWebHostBuilder`는 새 팩토리를 반환하고, 반복되면 `WebApplicationFactory<Program>`을 상속해 `ConfigureWebHost`를 override 한다. 실서비스 코드에 "테스트일 때는 가짜" 분기를 넣지 말고 테스트 프로젝트에서만 교체한다. mock은 외부 서비스처럼 접근 불가·비용·운영 영향이 있을 때에 한한다. → 코어 3(3.3)

    </details>

16. 테스트용 DB로 SQLite 인메모리 모드를 쓸 때의 주의점 두 가지와, `InMemory` 공급자를 권하지 않는 이유는? 같은 DB를 쓰는 테스트 클래스가 여럿이면?

    <details markdown="1"><summary>답 확인</summary>

    SQLite 인메모리 DB는 연결이 닫히면 사라지므로 `connection.Open()`으로 열어 두고 공유해야 하며, SQL Server용 마이그레이션은 적용할 수 없으므로 `EnsureCreated()`로 스키마를 만든다. `Microsoft.EntityFrameworkCore.InMemory`는 제약조건도 검사하지 않아 실제 관계형 DB와 거리가 멀다. xUnit은 테스트 클래스를 병렬 실행하므로 같은 DB를 쓰는 클래스는 `[Collection]`으로 묶어 순차 실행한다. 운영과 같은 DB를 Docker로 띄우는 방법도 있다. → 코어 3(3.4)

    </details>

17. CI와 CD는 각각 무엇이고, 전형적인 흐름은 어떻게 되나요? 주요 용어(파이프라인, 산출물, 트리거)도 설명해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    CI(지속적 통합)는 코드 변경을 자주 합치고 그때마다 자동으로 빌드·테스트해 충돌과 회귀를 빨리 찾는 실천이다. CD(지속적 전달/배포)는 빌드·테스트한 앱을 개발/스테이징/운영 환경에 자동으로 배포하는 것이다. 흐름: 커밋·PR → CI 빌드+테스트(실패 시 알림) → 승인 후 main 병합 → 산출물(바이너리, Docker 이미지) 발행 → CD가 배포. 파이프라인은 자동화된 절차, 산출물은 빌드 결과물, 트리거는 파이프라인을 시작하는 이벤트(PR·병합·수동)다. 운영 배포는 수동 트리거로 두기도 한다. → 코어 4(4.1)

    </details>

18. 컨테이너는 VM과 무엇이 다른가요? 이미지와 컨테이너의 관계, 그리고 게임 DB 데이터를 어디에 두어야 하는지 말해 보세요.

    <details markdown="1"><summary>답 확인</summary>

    컨테이너는 게스트 OS 없이 호스트 OS 커널을 공유해 VM보다 가볍다. 이미지는 앱 코드·런타임·설정을 묶은 불변 패키지(레지스트리에 보관)이고, 컨테이너는 그 이미지를 실행한 인스턴스로 같은 이미지로 여러 개 만들 수 있다. 컨테이너의 쓰기 계층은 컨테이너가 사라지면 함께 사라지므로 영속 데이터(게임 DB)는 볼륨 등 컨테이너 밖에 둔다. 모놀리식도 컨테이너 하나로 배포하고 복제+로드밸런서로 확장할 수 있지만 일부 기능만 확장할 수는 없다. → 코어 4(4.2)

    </details>

19. .NET Dockerfile의 네 단계와 멀티스테이지 빌드의 이점은? `.csproj`를 먼저 복사해 restore 하는 이유와 `EXPOSE`의 의미는?

    <details markdown="1"><summary>답 확인</summary>

    base(`aspnet` 런타임, `USER app`, `EXPOSE`) → build(`sdk`로 restore·build) → publish(`dotnet publish`) → final(base 위에 publish 결과만 복사, `ENTRYPOINT`). 최종 이미지에는 마지막 단계만 남아 SDK가 빠지므로 작아진다. `.csproj`를 먼저 복사해 restore 하면 소스만 바뀌고 패키지는 그대로일 때 restore 레이어 캐시를 재사용해 재빌드가 빨라진다(`.dockerignore`로 `bin/`, `obj/` 제외). `EXPOSE`는 컨테이너가 듣는 포트를 알릴 뿐 호스트에 공개하는 것이 아니다. → 코어 4(4.3)

    </details>

20. `docker run -d -p 5000:8080 --name gameserver gameserver:v1`의 각 부분은 무엇을 뜻하나요? 이 이미지를 CI에서 자동으로 검증하는 GitHub Actions 워크플로의 구조는?

    <details markdown="1"><summary>답 확인</summary>

    `-d`는 백그라운드 실행, `-p 5000:8080`은 호스트 5000번을 컨테이너 8080번에 연결(앞이 호스트, 뒤가 컨테이너), `--name`은 컨테이너 이름, 마지막은 이미지 `이름:태그`(태그 생략 시 `latest`). 워크플로는 `.github/workflows/*.yml`에 두고 `on`(push/pull_request와 브랜치) → `jobs` → `steps`(`uses` 액션 또는 `run` 명령)로 구성되며, checkout → setup-dotnet(`8.0.x`) → `dotnet restore` → `dotnet build --no-restore` → `dotnet test --no-build` 순이다. 테스트가 실패하면 PR에 표시되어 병합 전에 고칠 수 있다. → 코어 4(4.4, 4.5)

    </details>

21. C++ 서버의 "추상 클래스 포인터를 `main`에서 구현으로 채워 넘기기"와 Clean Architecture의 DI 조립은 무엇이 같고 무엇이 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    "구현이 아니라 인터페이스에 의존하고, 구현을 고르는 곳은 한 곳(조립 지점)"이라는 발상이 같다. 다른 점은 .NET에서는 `Program.cs`에서 `AddSingleton<IHeroRepository, ...>`처럼 등록만 하면 DI 컨테이너가 생성자를 보고 런타임에 주입한다는 것, 그리고 의존 방향이 프로젝트 참조(Web → Core, Infrastructure → Core)로 강제된다는 것이다. 테스트에서는 같은 인터페이스에 가짜 구현을 끼우거나(단위), `ConfigureTestServices`로 등록을 바꾼다(통합). → 코어 1(1.3, 1.4), 코어 2(2.5), 코어 3(3.3)

    </details>

22. "바이너리 복사 → 점검 공지 → 재시작" 배포와 "CI → Docker 이미지 → CD" 배포를 비교해 보세요. 무엇이 자동화되고, 무엇이 불변이 되나요?

    <details markdown="1"><summary>답 확인</summary>

    빌드·테스트가 매 커밋/PR마다 자동으로 돌고(CI), 실패하면 PR에 표시되어 병합 전에 막힌다. 병합된 코드로 산출물(Docker 이미지)을 발행하고 CD가 대상 환경에 배포한다(운영은 수동 트리거로 두기도 함). 이미지는 앱 코드·런타임·설정을 묶은 불변 패키지라 개발·테스트·운영에서 똑같이 실행되어 "내 컴퓨터에서는 되는데"가 줄어든다. 반면 컨테이너 안에 쓴 데이터는 사라지므로 영속 데이터는 밖에 둔다. → 코어 4(4.1, 4.2, 4.5)

    </details>

### 3. 기억 고리

- **C++ 유추:** Core 인터페이스 + `Program.cs` DI ≈ 순수 가상 클래스 + `main`에서 구현 주입. ⚠️ 조립을 DI 컨테이너가 런타임에 하고, 의존 방향은 `.csproj` 참조로 강제된다.
- **C++ 유추:** `WebApplicationFactory` 통합 테스트 ≈ 더미 클라이언트(봇)를 붙여 요청을 보내 보기. ⚠️ 실제 포트·별도 프로세스 없이 TestServer로 프로세스 안에서 요청이 가고, 결과는 사람이 아니라 `Assert`가 판정한다.
- **C++ 유추:** Docker 이미지 배포 ≈ 빌드한 바이너리를 서버에 복사해 실행. ⚠️ 이미지는 런타임·설정까지 묶은 불변 패키지이고, 컨테이너 안에 쓴 파일은 컨테이너와 함께 사라진다.
- **비유:** Clean Architecture = 콘센트 규격. Core가 콘센트 모양(인터페이스)을 정하면, Infrastructure의 가전(EF Core 저장소)이 그 규격에 맞는 플러그를 만들고, `Program.cs`가 실제로 꽂는다. 테스트 때는 같은 규격의 가짜 플러그(FakeRepo)를 꽂는다. ⚠️ 비유가 깨지는 지점: 조립을 위해 Web 프로젝트가 Infrastructure를 참조하는 것은 현실적으로 허용되고, 로직 없는 단순 조회까지 규격을 만들 필요는 없다.
- **비유:** Docker 이미지/컨테이너 = 클래스/인스턴스. 하나의 이미지로 컨테이너를 여러 개 만든다. ⚠️ 비유가 깨지는 지점: 이미지는 불변이고, 컨테이너 안에 쓴 데이터는 컨테이너가 사라지면 함께 사라지므로 영속 데이터는 볼륨에 둔다.
- **묶음(3의 법칙):** Clean Architecture 3덩어리 = **Core / Infrastructure / Web**. 테스트 3종 = **단위 / 통합 / E2E**. Dockerfile 핵심 3단 = **SDK로 빌드 → publish → 런타임 이미지에 결과만**.
- **대칭·순서:** 계층(논리) ↔ 티어(물리), 피라미드 ↔ 다이아몬드, 이미지(불변) ↔ 컨테이너(실행), `-p 호스트:컨테이너`. CI 순서: checkout → setup-dotnet → restore → build → test. 테스트 3단계: Arrange → Act → Assert.
- **코어 4개를 한 줄로:** 안쪽으로 의존(1) → 가짜로 단위 테스트(2) → 메모리에서 통합 테스트(3) → CI가 돌리고 불변 이미지로 배포(4).

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "방치 보상 계산 규칙을 고친 PR이 테스트를 거쳐 Docker 이미지로 배포되기까지"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리는 점검 때 바이너리 복사하고 재시작하면 되는데 왜 테스트 코드·CI·Docker까지 필요해?"라고 묻는 동료에게, ① 로직을 인터페이스 뒤로 빼면 봇 없이 밀리초 단위로 검증된다 ② 테스트를 PR마다 자동으로 돌리면 재화 계산이 틀린 서버가 병합 전에 막힌다 ③ 불변 이미지는 "운영 서버에서만 안 뜨는" 환경 차이를 없앤다 — 세 가지로 설명해 보세요.
- **랜덤 논리 게임:** A "REST API 서버는 테스트 다이아몬드처럼 통합 테스트 비중을 키워야 한다" vs B "테스트 피라미드처럼 빠른 단위 테스트를 가장 많이 두어야 한다" — 실행 속도와 투자 대비 효과를 근거로 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 Clean Architecture의 의존성 규칙과 `WebApplicationFactory`로 의존성을 바꿔 끼우는 통합 테스트를 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습 골격 채우기
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
