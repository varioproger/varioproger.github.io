# 59장. 동적 프로그래밍과 DLR

> **이 장의 위치** — 57장에서 리플렉션으로 "이름만 아는 멤버"를 호출했고, 58장에서 IL을 직접 짜서 그 비용을 줄였다. 이 장은 세 번째 길을 판다. `dynamic` 키워드 하나로 바인딩 전체를 런타임으로 미루고, 그 뒤에서 **동적 언어 런타임(DLR, Dynamic Language Runtime)** 이 식 트리·호출 사이트·3계층 캐시를 동원해 리플렉션보다 빠르게 그 일을 해내는 구조를 본다. `dynamic`은 문법 한 줄이지만 컴파일러가 방출하는 코드는 생성 클래스 하나와 정적 필드 하나, 그리고 런타임에 컴파일되는 델리게이트다. 그 전부를 연다.
>
> **선수 지식** — 31장(식 트리와 해석되는 쿼리), 57장(리플렉션과 메타데이터), 54장(타입 시스템의 런타임 표현)
>
> **이 장에서 다루지 않는 것** — IL을 직접 방출하는 방법은 58장에서 다뤘다. COM 상호운용의 전체 그림과 `IDispatch` 마샬링은 60장에서 다룬다. 식 트리를 만들고 해석하는 방법 자체는 31장이다. 패턴 매칭으로 타입 분기를 쓰는 방법은 77장이다.

---

## 59.1 정적 바인딩 vs 동적 바인딩

### 바인딩이란 무엇인가

**바인딩(binding)** 은 타입·멤버·연산자를 **해석하는 과정**이다. 소스에 적힌 `d.Quack()`이라는 글자를 "어느 어셈블리의 어느 타입의 어느 메서드"로 확정하는 작업이 바인딩이다.

C#은 이 작업을 거의 전부 컴파일 타임에 한다. 그래서 오타는 컴파일 오류가 되고, 없는 메서드를 부르면 빌드가 실패한다. **동적 바인딩(dynamic binding)** 은 그 확정 시점을 컴파일 타임에서 런타임으로 미루는 것이다.

동적 바인딩이 필요한 상황은 정해져 있다. **컴파일 타임에 어떤 멤버가 존재한다는 것을 개발자는 알지만 컴파일러는 증명할 수 없을 때**다. 동적 언어(IronPython 등)와 상호운용할 때, COM 객체를 다룰 때, 그리고 그렇지 않으면 리플렉션을 써야 하는 상황에서 흔히 발생한다.

동적 타입은 상황별 키워드(contextual keyword) `dynamic`으로 선언한다.

```csharp
dynamic d = GetSomeObject();
d.Quack();
```

`dynamic`은 컴파일러에게 "긴장을 풀라"고 말한다. `d`의 런타임 타입에 `Quack` 메서드가 있을 것이라고 우리는 예상하지만, 그걸 정적으로 증명할 수는 없다. `d`가 `dynamic`이므로 컴파일러는 `Quack`을 `d`에 바인딩하는 일을 런타임까지 미룬다.

### 정적 타입 세 가지를 비교한다

같은 호출 `d.Quack()`을 `d`의 정적 타입만 바꿔가며 보면 차이가 선명해진다.

```csharp
Duck d = ...;
d.Quack();          // ① 정적 바인딩 — 컴파일러가 Duck.Quack을 찾는다
```

컴파일러는 `Duck`에서 매개변수 없는 `Quack` 메서드를 찾는다. 실패하면 선택적 매개변수를 받는 메서드, `Duck`의 기반 클래스의 메서드, `Duck`을 첫 매개변수로 받는 확장 메서드까지 검색을 넓힌다. 그래도 못 찾으면 컴파일 오류다. **어떤 메서드로 바인딩되든, 바인딩을 하는 주체는 컴파일러이고, 그 판단은 전적으로 피연산자의 정적 타입에 의존한다.** 이것이 정적 바인딩이다.

```csharp
object d = ...;
d.Quack();          // ② 컴파일 오류 CS1061
```

`d`에 담긴 값이 `Quack`이라는 메서드를 가진 객체일 수 있지만 컴파일러는 그걸 알 수 없다. 컴파일러가 가진 정보는 변수의 타입 `object`뿐이다.

```csharp
dynamic d = ...;
d.Quack();          // ③ 동적 바인딩 — 컴파일은 통과, 런타임에 해석
```

`dynamic`은 `object`와 마찬가지로 타입에 대해 아무것도 말하지 않는다. 차이는 **컴파일 타임에 알려지지 않은 방식으로 사용하는 것을 허용한다**는 점이다. 동적 객체는 컴파일 타임 타입이 아니라 **런타임 타입**을 기준으로 바인딩된다. 컴파일러는 동적으로 바인딩되는 식(일반적으로 `dynamic` 타입 값이 하나라도 포함된 식)을 만나면, 나중에 런타임에 바인딩을 수행할 수 있도록 그 식을 **포장(package)** 만 해둔다.

### 런타임에는 두 갈래가 있다

런타임에 동적 객체가 `IDynamicMetaObjectProvider`(줄여서 IDMOP)를 구현하고 있다면 그 인터페이스를 사용해 바인딩한다. 구현하고 있지 않다면, **컴파일러가 그 객체의 런타임 타입을 처음부터 알고 있었을 경우와 거의 같은 방식으로** 바인딩이 일어난다. 이 두 갈래를 각각 **커스텀 바인딩(custom binding)** 과 **언어 바인딩(language binding)** 이라고 부른다.

```text
                     소스 코드의  d.Quack()
                              │
                              ▼
            ┌─────────────────────────────────────┐
            │ 컴파일 타임: d의 정적 타입은?         │
            └─────────────────────────────────────┘
                  │                          │
        dynamic 아님                     dynamic
                  │                          │
                  ▼                          ▼
   ┌────────────────────────┐   ┌──────────────────────────────┐
   │ 정적 바인딩             │   │ 페이로드(payload) 방출        │
   │ · 멤버 확정             │   │ · CallSite<T> 정적 필드 생성  │
   │ · 오버로드 해석 완료    │   │ · CSharpBinder 생성 코드      │
   │ · call / callvirt 방출  │   │ · Target 델리게이트 호출 방출 │
   │ 실패 시 → 컴파일 오류   │   │ 실패해도 컴파일은 통과 ★      │
   └────────────────────────┘   └──────────────────────────────┘
                                             │
              ─────────── 런타임 ────────────┼───────────────────
                                             ▼
                          ┌──────────────────────────────────┐
                          │ 대상 객체가 IDynamicMetaObject-  │
                          │ Provider를 구현하는가?            │
                          └──────────────────────────────────┘
                              │                      │
                            예                     아니오
                              │                      │
                              ▼                      ▼
              ┌───────────────────────┐   ┌─────────────────────────┐
              │ 커스텀 바인딩          │   │ 언어 바인딩              │
              │ GetMetaObject() 호출   │   │ Microsoft.CSharp 바인더  │
              │ → DynamicMetaObject    │   │ → 리플렉션으로 멤버 해석 │
              │ (DynamicObject,        │   │ → C# 오버로드 규칙 적용  │
              │  ExpandoObject,        │   │                          │
              │  IronPython 객체, COM) │   │                          │
              └───────────────────────┘   └─────────────────────────┘
                              │                      │
                              └──────────┬───────────┘
                                         ▼
                              ┌────────────────────────┐
                              │ 규칙(rule) 생성 → 캐시  │
                              │ → 실행                  │
                              │ 실패 시 →               │
                              │ RuntimeBinderException  │
                              └────────────────────────┘
```

★ 표시가 이 장 전체의 위험 지점이다. 컴파일이 통과한다는 사실은 아무것도 보증하지 않는다.

### 커스텀 바인딩

커스텀 바인딩은 동적 객체가 `IDynamicMetaObjectProvider`를 구현할 때 일어난다. C#으로 작성한 타입에 IDMOP를 직접 구현할 수도 있고 그럴 만한 가치도 있지만, 더 흔한 경우는 **.NET 위에서 DLR로 구현된 동적 언어(IronPython, IronRuby 등)에서 얻은 IDMOP 객체**를 다루는 것이다. 그런 언어의 객체는 자기 위에서 수행되는 연산의 의미를 직접 통제하기 위해 IDMOP를 암묵적으로 구현한다.

간단한 커스텀 바인더의 예가 `DynamicObject`를 상속해 `TryInvokeMember`를 재정의하는 것이다. 실제로는 존재하지 않는 메서드 호출을 가로채 해석할 수 있다. 전체 예제와 나머지 가상 메서드는 59.8절에서 다룬다.

### 언어 바인딩

언어 바인딩은 동적 객체가 `IDynamicMetaObjectProvider`를 구현하지 **않을** 때 일어난다. 설계가 아쉬운 타입이나 .NET 타입 시스템 자체의 한계를 우회할 때 쓸모가 있다. 대표적인 문제가 숫자 타입이다. 숫자 타입에는 공통 인터페이스가 없었다.

```csharp
int x = 3, y = 4;
Console.WriteLine(Mean(x, y));      // 3

dynamic Mean(dynamic x, dynamic y) => (x + y) / 2;
```

이득은 분명하다. 숫자 타입마다 코드를 복제하지 않아도 된다. 대신 정적 타입 안전성을 잃고, 컴파일 오류 대신 런타임 예외를 감수하게 된다.

> **📌 이 문제는 지금 다른 해법이 있다**
>
> 위 예제는 원래 `dynamic`의 대표적 용례였지만, ※C# 11 의 **정적 추상 인터페이스 멤버**와 `INumber<T>` 계열 제네릭 수학 인터페이스가 나온 뒤로는 제네릭이 정답이다. (22.7절·22.8절)
>
> ```csharp
> static T Mean<T>(T x, T y) where T : INumber<T> => (x + y) / T.CreateChecked(2);
> ```
>
> 이쪽은 정적 타입 안전하고, 인라이닝되고, AOT에서도 돌아간다. `dynamic` 버전보다 모든 면에서 낫다. 2026년에 숫자 일반화를 위해 `dynamic`을 쓸 이유는 없다.

### 동적 바인딩이 우회하는 것과 우회하지 않는 것

여기서 리플렉션과의 결정적 차이가 나온다.

> **⚠️ `dynamic`은 리플렉션의 대체재가 아니다**
>
> 동적 바인딩은 **정적** 타입 안전성을 우회하지만 **런타임** 타입 안전성은 우회하지 않는다. 리플렉션(57.7절)과 달리 **멤버 접근성 규칙을 뚫을 수 없다.** `private` 메서드를 `dynamic`으로 호출하려 하면 `RuntimeBinderException`이 난다.
>
> ```csharp
> class Secret { private void Hidden() { } }
>
> dynamic d = new Secret();
> d.Hidden();   // RuntimeBinderException: 'Secret.Hidden()' is inaccessible
>               //                          due to its protection level
> ```
>
> 비공개 멤버에 접근해야 한다면 `dynamic`이 아니라 리플렉션(57.7절)이나 `[UnsafeAccessor]`(※.NET 8)를 써야 한다.

설계상 언어 런타임 바인딩은 **동적 객체의 런타임 타입이 컴파일 타임에 알려졌을 경우의 정적 바인딩과 최대한 똑같이** 동작한다. 앞의 `Mean` 예제도 `int`로 하드코딩했을 때와 결과가 동일하다. 정적 바인딩과 동적 바인딩의 동등성이 깨지는 가장 두드러진 예외는 **확장 메서드**인데, 이건 59.6절에서 다룬다.

### 바인더는 언어마다 다르다

DLR 위에서 동적 바인딩을 지원하는 모든 언어는 자기 언어에 맞는 **언어별 바인더**를 제공한다. 프로그래머를 놀라게 하지 않기 위해서다.

```csharp
dynamic Divide(dynamic x, dynamic y) => x / y;

Console.WriteLine(Divide(5, 2));    // 2   ← C# 바인더: 정수 나눗셈
```

같은 식을 VB.NET에서 VB 바인더로 평가하면 `2.5`가 나온다. VB의 `/` 연산자는 정수 피연산자에 대해서도 부동소수점 나눗셈이기 때문이다. **동적 식의 의미는 대상 객체가 아니라 호출한 언어의 바인더가 정한다.** 이 점을 놓치면 다중 언어 솔루션에서 원인을 찾기 어려운 버그가 생긴다.

### 네 가지 호출 방식 정리

| 방식 | 바인딩 시점 | 오버로드 해석 | 접근성 우회 | 대략적 비용(단일 호출) |
|---|---|---|---|---|
| 정적 호출 (`call`/`callvirt`) | 컴파일 타임 | 컴파일 타임 | 불가 | ~1 ns 이하 (인라이닝 시 0) |
| 가상 호출 (단일 디스패치) | 컴파일 타임에 슬롯 확정, 런타임에 슬롯 조회 | 컴파일 타임 | 불가 | ~1–2 ns |
| `dynamic` (다중 디스패치) | 런타임 | **런타임** | 불가 | 캐시 적중 시 수십 ns |
| 리플렉션 `MethodInfo.Invoke` | 런타임 | 호출자가 직접 | **가능** | 수십~수백 ns |

가상 호출은 CLR이 예전부터 지원해 온 제한적 동적 성질이다. 하지만 가상 호출에서 컴파일러는 **호출한 멤버의 이름과 시그니처를 기준으로 컴파일 타임에 특정 가상 멤버를 확정**해야 한다. 이 차이의 의미는 59.7절의 다중 디스패치에서 자세히 판다.

---

## 59.2 동적 언어 런타임(DLR)의 구조

### DLR은 "동적인 CLR"이 아니다

이름 때문에 오해하기 쉽지만, DLR은 CLR의 동적 버전이 **아니다.** DLR은 `System.Xml.dll` 같은 다른 라이브러리와 마찬가지로 **CLR 위에 얹힌 라이브러리**다. CLR에 특별한 동적 실행 모드가 있는 게 아니라, 평범한 관리 코드로 짜인 라이브러리가 리플렉션과 식 트리와 `DynamicMethod`를 조합해 동적 디스패치를 구현한다.

DLR의 주 역할은 **정적 타입 언어와 동적 타입 언어 양쪽에서 동적 프로그래밍을 통일하는 런타임 서비스를 제공하는 것**이다. 덕분에 C#, Visual Basic, IronPython, IronRuby가 모두 같은 프로토콜로 함수를 동적으로 호출한다. 서로의 라이브러리를 공유하고 다른 언어로 작성된 코드를 호출할 수 있는 이유가 이것이다.

DLR은 .NET에서 새 동적 언어를 만드는 일도 상대적으로 쉽게 만들었다. 동적 언어 저자는 IL을 방출할 필요 없이 **식 트리(expression tree) 수준**에서 작업한다. 31장에서 본 `System.Linq.Expressions`의 그 식 트리다.

그리고 DLR은 모든 소비자에게 **호출 사이트 캐싱(call-site caching)** 의 이득을 보장한다. 동적 바인딩 과정에서 내린, 잠재적으로 비싼 멤버 해석 결정을 불필요하게 반복하지 않게 하는 최적화다.

> **📌 왜 IL이 아니라 식 트리인가**
>
> IL을 방출하려면 평가 스택을 직접 관리하고 분기 레이블을 손으로 계산해야 한다(58장). 식 트리는 그보다 한 단계 높은 추상화라서 언어 구현자가 "이 객체의 이 멤버를 이 인수로 호출한다"는 의도만 기술하면 된다. 나머지 IL 생성은 `LambdaExpression.Compile()`이 처리한다.
>
> 이 선택에는 대가도 있다. `Compile()`은 내부적으로 `DynamicMethod`를 만들고 IL을 방출하므로 **런타임 코드 생성**이 필요하다. 이것이 59.10절에서 볼 Native AOT 비호환의 근본 원인이다.

### 구성 요소와 위치

이 장에서 다루는 타입은 대부분 `System.Dynamic` 네임스페이스에 있고, `CallSite<>`만 `System.Runtime.CompilerServices`에 있다.

```csharp
using System.Dynamic;                       // DynamicObject, ExpandoObject,
                                            // IDynamicMetaObjectProvider, *Binder
using System.Runtime.CompilerServices;      // CallSite, CallSite<T>, CallSiteBinder
using Microsoft.CSharp.RuntimeBinder;       // Binder, RuntimeBinderException,
                                            // CSharpArgumentInfo, CSharpBinderFlags
```

어셈블리 배치는 다음과 같다.

| 구성 요소 | 타입 예 | 실제 어셈블리(.NET) | 역할 |
|---|---|---|---|
| 호출 사이트 인프라 | `CallSite`, `CallSite<T>`, `CallSiteBinder` | `System.Linq.Expressions.dll` | 바인딩 결과를 캐시하고 델리게이트로 호출 |
| 동적 객체 프로토콜 | `IDynamicMetaObjectProvider`, `DynamicMetaObject`, `DynamicObject`, `ExpandoObject` | `System.Linq.Expressions.dll` | 객체가 자기 바인딩 의미를 직접 정의 |
| 식 트리 | `Expression`, `LambdaExpression` | `System.Linq.Expressions.dll` | 규칙(rule)의 표현 및 컴파일 |
| C# 언어 바인더 | `Microsoft.CSharp.RuntimeBinder.Binder` | `Microsoft.CSharp.dll` | C#의 오버로드·변환 규칙을 런타임에 재현 |
| COM 바인딩 | `ComBinder`(내부) 와 COM용 `DynamicMetaObject` 파생 타입 | .NET에서는 `Microsoft.CSharp.dll` 내부(`Microsoft.CSharp.RuntimeBinder.ComInterop`). .NET Framework에서는 `System.Dynamic.dll` | `IDispatch` 경유 호출 (Windows 전용) |
| 동적 언어 호스팅 | `ScriptEngine`, `ScriptScope`, `ScriptSource` | `Microsoft.Scripting.dll` (NuGet `DynamicLanguageRuntime`) | 스크립트 언어 호스팅 API |

> **⚠️ 어셈블리 이름은 시대에 따라 다르다**
>
> 오래된 문서에는 `CallSite<>`가 `System.Core.dll`에 있다고 쓰여 있다. **.NET Framework 기준**으로는 맞는 말이다. .NET(Core) 이후로는 `System.Linq.Expressions.dll`이며, `System.Core.dll`은 호환용 타입 전달(type forwarding) 파사드로만 남아 있다. `ildasm`으로 어셈블리 참조를 읽을 때 이름이 다르다고 당황할 필요가 없다.
>
> `Microsoft.CSharp.dll`도 마찬가지다. .NET Framework에서는 컴파일러 기본 응답 파일(`csc.rsp`)을 통해 참조되는 별도 어셈블리였고, 현대 SDK에서는 공유 프레임워크에 포함되어 자동 참조된다. 다만 **런타임에 로드되는 별개의 어셈블리라는 사실은 그대로다.**

### 계층 구조

```text
 ┌──────────────────────────────────────────────────────────────┐
 │  소스 언어                                                     │
 │  C#            VB.NET        IronPython        IronRuby       │
 └──────┬───────────┬───────────────┬─────────────────┬──────────┘
        │           │               │                 │
        ▼           ▼               ▼                 ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  언어별 바인더 (CallSiteBinder 파생)                            │
 │  Microsoft.CSharp   Microsoft.VisualBasic   Python   Ruby     │
 │  RuntimeBinder      CompilerServices        Binder   Binder   │
 └──────────────────────────┬───────────────────────────────────┘
                            │  "이 언어에서 이 연산은 이런 뜻"
                            ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  DLR 코어                                                      │
 │  ┌────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
 │  │ CallSite<T>    │  │ DynamicMetaObject│  │ 식 트리        │ │
 │  │ · Target       │  │ · 제약(restrict) │  │ Expression    │ │
 │  │ · Rules (L1)   │  │ · 식(expression) │  │ · Compile()   │ │
 │  └────────────────┘  └──────────────────┘  └───────────────┘ │
 │  ┌──────────────────────────────────────────────────────────┐│
 │  │ RuleCache<T>  (L2, 바인더별 공유)                          ││
 │  └──────────────────────────────────────────────────────────┘│
 └──────────────────────────┬───────────────────────────────────┘
                            │  LambdaExpression.Compile()
                            ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  CLR                                                          │
 │  DynamicMethod → JIT → 네이티브 코드 / 리플렉션 / 타입 시스템   │
 └──────────────────────────────────────────────────────────────┘
```

DLR은 CLR을 **사용하는** 층이지 CLR을 대체하거나 확장하는 층이 아니다. 이 그림이 그 사실을 말해준다.

### 페이로드와 호출 사이트

컴파일러가 동적 식을 만나면, 런타임에 그 식을 누가 평가할지 전혀 모른다. 다음 메서드를 보자.

```csharp
public dynamic Foo(dynamic x, dynamic y)
{
    return x / y;      // 동적 식
}
```

`x`와 `y`는 임의의 CLR 객체일 수도, COM 객체일 수도, 동적 언어가 호스팅하는 객체일 수도 있다. 따라서 컴파일러는 "알려진 타입의 알려진 메서드를 호출한다"는 평소의 정적 접근을 쓸 수 없다. 대신 컴파일러는 **연산을 기술하는 식 트리로 최종 귀결되는 코드**를 방출하고, 그 식 트리는 런타임에 DLR이 바인딩할 **호출 사이트(call site)** 가 관리한다. 호출 사이트는 본질적으로 호출자와 피호출자 사이의 중개자다.

이렇게 방출된 코드를 **페이로드(payload)** 라고 부른다. 페이로드에는 "이 연산은 이항 나눗셈이고, 피연산자는 두 개이며, 이 호출이 일어난 문맥 타입은 `C`다" 같은 정보가 들어간다. 런타임에 페이로드 코드는 **동적 식/변수가 지금 참조하는 객체의 실제 타입을 근거로 정확히 어떤 연산을 실행할지 결정한다.**

> **📌 DLR의 .NET Core 이식 상태**
>
> DLR의 상당 부분이 .NET Core 3.0부터 이식되었지만, .NET Framework 4.8의 DLR과 완전한 기능 동등성(feature parity)에 도달했다고 보기는 어렵다. 특히 COM 상호운용 경로는 Windows 전용이며 `System.Runtime.InteropServices` 설정에 따라 동작이 달라진다. 크로스 플랫폼을 대상으로 하는 코드에서 `dynamic`을 COM과 엮어 쓰는 설계는 피하는 편이 안전하다. (60.12절)

> **⚠️ `dynamic` 한 줄이 어셈블리 여러 개를 끌어온다**
>
> `dynamic`을 한 번이라도 실행하면 런타임에 `Microsoft.CSharp.dll`이 로드된다. 그리고 이것이 `System.Linq.Expressions.dll`을 끌어온다. .NET Framework에서는 COM 상호운용까지 얽히면 `System.Dynamic.dll`도 함께 올라왔다(.NET에서는 COM 바인더가 `Microsoft.CSharp.dll` 안에 있어 추가 어셈블리가 없다).
>
> 프로그램의 시작 시간과 메모리 사용량에 영향을 준다. 프로그램에서 동적 동작이 필요한 지점이 두어 곳뿐이라면, 어셈블리 로드 비용과 메모리 부담을 감수하기보다 리플렉션(관리 객체)이나 수동 캐스팅(COM 객체)으로 처리하는 편이 효율적일 수 있다. `dynamic`으로 얻는 문법적 단순화가 그 비용만큼의 값어치가 있는지는 **의식적으로 판단해야 하는 문제**다.

---

## 59.3 `dynamic`의 런타임 표현과 호출 사이트 캐싱

### `dynamic`과 `object`는 런타임에 같은 타입이다

`dynamic`과 `object` 사이에는 **깊은 등가성**이 있다. 메타데이터 수준에서 `dynamic`은 존재하지 않는다. 존재하는 것은 `object`와, 그 위에 붙은 특성 하나뿐이다.

```csharp
Console.WriteLine(typeof(List<dynamic>) == typeof(List<object>));   // True
Console.WriteLine(typeof(dynamic[]) == typeof(object[]));           // True
```

> **⚠️ `typeof(dynamic)`은 컴파일되지 않는다**
>
> 여러 문헌이 "런타임은 `typeof(dynamic) == typeof(object)`를 참으로 취급한다"고 서술하지만, 그 식은 **C#에서 아예 컴파일되지 않는다.**
>
> ```csharp
> Type t = typeof(dynamic);   // 컴파일 오류 CS1962:
>                             // The typeof operator cannot be used on the dynamic type
> ```
>
> 반면 `typeof(dynamic[])`과 `typeof(List<dynamic>)`은 **합법이고 참을 반환한다.** Roslyn은 `typeof`의 피연산자가 **그 자체로** `dynamic`일 때만 오류를 내고, `dynamic`을 포함하는 배열 타입이나 구성된 제네릭 타입은 허용한다. 등가성 주장은 "메타데이터에 기록되는 타입이 같다"는 뜻으로 읽어야 정확하다.

`object` 참조와 마찬가지로 `dynamic` 참조는 (포인터 타입을 제외한) 어떤 타입의 객체도 가리킬 수 있다.

```csharp
dynamic x = "hello";
Console.WriteLine(x.GetType().Name);    // String

x = 123;                                // 같은 변수인데도 오류 없음
Console.WriteLine(x.GetType().Name);    // Int32
```

**구조적으로 `object` 참조와 `dynamic` 참조에는 아무 차이가 없다.** `dynamic` 참조는 그것이 가리키는 객체에 대해 동적 연산을 가능하게 할 뿐이다. 그래서 `object`를 `dynamic`으로 변환해 아무 동적 연산이나 수행할 수 있다.

```csharp
object o = new System.Text.StringBuilder();
dynamic d = o;
d.Append("hello");
Console.WriteLine(o);       // hello
```

### `DynamicAttribute` — 메타데이터에 남는 흔적

필드·메서드 매개변수·반환 타입의 타입이 `dynamic`으로 지정되면, 컴파일러는 그 타입을 `System.Object`로 바꾸고 메타데이터의 해당 위치에 `System.Runtime.CompilerServices.DynamicAttribute` 인스턴스를 적용한다.

```csharp
public class Test
{
    public dynamic Foo;
}
```

이것은 다음과 정확히 같다.

```csharp
public class Test
{
    [System.Runtime.CompilerServices.DynamicAttribute]
    public object Foo;
}
```

이 특성 덕분에 그 타입의 소비자는 `Foo`를 `dynamic`으로 다뤄야 한다는 것을 알 수 있고, 동시에 동적 바인딩을 지원하지 않는 언어는 `object`로 폴백할 수 있다.

`ildasm`으로 확인하면 필드의 타입은 `object`이고 `dynamic`의 흔적은 커스텀 특성뿐이다.

```il
.field public object Foo
.custom instance void [System.Runtime]System.Runtime.CompilerServices
        .DynamicAttribute::.ctor() = ( 01 00 00 00 )
```

**지역 변수**를 `dynamic`으로 선언하면 변수의 타입도 `object`가 되지만, 지역 변수에는 `DynamicAttribute`가 붙지 **않는다.** 사용 범위가 메서드 안에서 자기완결적이기 때문이다.

> **⚠️ `dynamic`과 `object`만 다른 오버로드는 정의할 수 없다**
>
> `dynamic`이 실제로는 `Object`와 같으므로, 시그니처가 `dynamic`과 `object`로만 다른 메서드는 만들 수 없다.
>
> ```csharp
> class C
> {
>     void M(object x) { }
>     void M(dynamic x) { }   // 컴파일 오류 CS0111:
>                             // Type 'C' already defines a member called 'M'
>                             // with the same parameter types
> }
> ```
>
> 같은 이유로 `dynamic`을 확장하는 확장 메서드도 정의할 수 없다. `object`를 확장하는 메서드는 정의할 수 있고, 그것이 `dynamic`에 대해서도 동작한다 — 단, **확장 메서드 문법으로는 동적 호출이 불가능하다**는 별개의 제약이 있다(59.6절).

제네릭 타입 인수로도 `dynamic`을 쓸 수 있다. 이때도 컴파일러는 `dynamic`을 `Object`로 바꾸고 의미가 있는 메타데이터 위치마다 `DynamicAttribute`를 적용한다.

> **⚠️ 제네릭 코드 안에서는 동적 디스패치가 일어나지 않는다**
>
> `List<dynamic>`을 만들어도 `List<T>`의 코드는 이미 컴파일되어 있고 `T`를 `Object`로 간주한다. **제네릭 코드 안에는 페이로드가 생성되지 않았으므로 그 안에서는 어떤 동적 디스패치도 수행되지 않는다.** 동적 디스패치가 일어나는 곳은 `dynamic`이라고 적힌 **당신의** 코드가 컴파일된 지점뿐이다.

### 컴파일러가 실제로 방출하는 것

이제 4단 원칙의 2단계다. 다음 코드를 컴파일하면 무엇이 나오는가.

```csharp
class C
{
    public dynamic Foo(dynamic x, dynamic y) => x / y;
}
```

디컴파일하면 이런 모습이다.

```csharp
class C
{
    [CompilerGenerated]
    private static class <>o__0
    {
        public static CallSite<Func<CallSite, object, object, object>> <>p__0;
    }

    [return: Dynamic]
    public object Foo([Dynamic] object x, [Dynamic] object y)
    {
        if (<>o__0.<>p__0 == null)
        {
            <>o__0.<>p__0 = CallSite<Func<CallSite, object, object, object>>.Create(
                Microsoft.CSharp.RuntimeBinder.Binder.BinaryOperation(
                    CSharpBinderFlags.None,
                    ExpressionType.Divide,
                    typeof(C),                          // 호출 문맥 타입
                    new CSharpArgumentInfo[]
                    {
                        CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.None, null),
                        CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.None, null)
                    }));
        }
        return <>o__0.<>p__0.Target(<>o__0.<>p__0, x, y);
    }
}
```

읽어야 할 것이 네 가지다.

1. **호출 사이트는 정적 필드에 캐시된다.** 매 호출마다 다시 만드는 비용을 피하기 위해서다. 컴파일러는 `<>o__N`이라는 컴파일러 생성 정적 클래스를 만들고 그 안에 `<>p__M` 필드를 둔다. 소스에 동적 연산이 세 개 있으면 필드도 세 개다.
2. **바인더는 언어별이다.** `Microsoft.CSharp.RuntimeBinder.Binder`는 C# 전용이다. 세 번째 인수로 넘기는 `typeof(C)`는 **호출이 일어난 문맥 타입**이며, 접근성 검사의 기준이 된다. `private` 멤버를 같은 클래스 안에서 동적으로 호출할 수 있는 이유가 이 인수다.
3. **`CSharpArgumentInfo`가 인수마다 하나씩 붙는다.** 이것이 "이 인수는 정적으로 타입이 알려져 있다", "이 인수는 리터럴 상수다", "이 인수는 `ref`다", "이 인수는 명명된 인수 `name:`이다" 같은 정보를 전달한다. 59.6절에서 볼 "정적 타입도 최대한 활용한다"는 규칙이 여기서 구현된다.
4. **실제 동적 호출은 사이트의 `Target` 델리게이트를 호출하는 것**이다. 첫 인수로 사이트 자신을 넘기고, 그다음에 피연산자를 넘긴다.

IL로 보면 이렇다. 핵심 부분만 남기고 나머지는 생략했다.

```il
.method public hidebysig instance object
        Foo(object x, object y) cil managed
{
  .param [0]
  .custom instance void [System.Runtime]System.Runtime.CompilerServices
          .DynamicAttribute::.ctor() = ( 01 00 00 00 )
  // .param [1], [2] 에도 같은 DynamicAttribute 가 붙는다
  .maxstack  8

  IL_0000:  ldsfld     class [System.Linq.Expressions]System.Runtime.CompilerServices
                       .CallSite`1<class [System.Runtime]System.Func`4<...>>
                       C/'<>o__0'::'<>p__0'
  IL_0005:  brtrue.s   IL_0040
  // ... 바인더 생성 + CallSite<T>::Create 호출 + 정적 필드에 저장 ...
  IL_0040:  ldsfld     ... C/'<>o__0'::'<>p__0'
  IL_0045:  ldfld      !0 class ...CallSite`1<...>::Target
  IL_004a:  ldsfld     ... C/'<>o__0'::'<>p__0'
  IL_004f:  ldarg.1
  IL_0050:  ldarg.2
  IL_0051:  callvirt   instance !3 class [System.Runtime]System.Func`4<...>
                       ::Invoke(!0, !1, !2)
  IL_0056:  ret
}
```

**메서드 시그니처가 `object Foo(object, object)`라는 점을 보라.** 매개변수 타입도 반환 타입도 `object`이고, `dynamic`은 `.param` 지시자에 붙은 `DynamicAttribute`로만 존재한다. 이것이 "런타임 표현이 `object`와 동일하다"는 말의 IL 증거다.

### `Target`, 규칙, 그리고 `UpdateAndExecute`

`CallSite<T>`의 핵심 필드는 하나다.

```csharp
public partial class CallSite<T> : CallSite where T : class
{
    public T Target;            // 지금 이 사이트가 실행할 델리게이트
    internal T[] Rules;         // 이 사이트가 최근에 쓴 규칙들 (L1)
    // ...
}
```

사이트가 처음 만들어졌을 때 `Target`에는 **업데이트 델리게이트(update delegate)** 가 들어 있다. 이 델리게이트가 하는 일이 캐시 조회와 바인딩이다.

**규칙(rule)** 이란 "조건 + 본문"이 하나로 컴파일된 델리게이트다. 개념적으로 이렇게 생겼다.

```csharp
// x / y 에 대해 두 피연산자가 int일 때 생성되는 규칙(의사 표현)
(CallSite site, object x, object y) =>
{
    if (x is int && y is int)                    // ① 제약(restriction) 검사
        return (object)((int)x / (int)y);        // ② 본문
    return site.Update(site, x, y);              // ③ 불일치 → 캐시 계층으로 폴백
};
```

①이 **제약(restriction)** 이다. `DynamicMetaObject`가 들고 있는 `BindingRestrictions`가 이 조건을 만든다. 제약이 통과하면 ②의 본문이 곧바로 실행된다. **이 시점에는 리플렉션도, 바인딩도, 검색도 일어나지 않는다.** 타입 비교 두 번과 정수 나눗셈 한 번이 전부다. 이것이 `dynamic`이 리플렉션보다 빠른 이유다.

### 캐시 3계층 — L0 / L1 / L2

DLR은 캐시를 세 층으로 둔다. 계층 이름은 DLR 설계 문서와 런타임 소스에 그대로 등장한다(`CallSite.cs`의 주석 `Miss on Level 0, 1 and 2 caches. Create new rule`).

```text
        동적 호출 진입:  site.Target(site, x, y)
                    │
                    ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ L0 — Target 델리게이트 자체                                       │
 │  · 마지막으로 성공한 규칙이 그대로 Target에 들어 있다              │
 │  · 제약 검사 통과 → 즉시 실행. 여기서 끝나면 비용은 수 ns 수준     │
 │  · 사이트의 90%는 단형(monomorphic)이라 영원히 여기서 끝난다      │
 └────────────────┬───────────────────────────────────────────────┘
                  │ 제약 불일치 (Update 호출)
                  ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ L1 — CallSite<T>.Rules  (이 사이트 전용)                         │
 │  · 최근에 이 사이트에서 성공한 규칙 배열                          │
 │  · 최대 10개  (CallSite<T>.MaxRules = 10)                       │
 │  · 앞에서부터 순회하며 제약을 검사, 적중하면 그 규칙을 Target에    │
 │    올리고(승격) 두 칸 앞으로 이동시킨다                           │
 └────────────────┬───────────────────────────────────────────────┘
                  │ 전부 불일치
                  ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ L2 — RuleCache<T>  (바인더 인스턴스별, 여러 사이트가 공유)         │
 │  · CallSiteBinder.Cache 딕셔너리 안에 델리게이트 타입별로 보관     │
 │  · 최대 128개  (RuleCache<T>.MaxRules = 128)                    │
 │  · 적중하면 그 규칙을 L1에도 추가하고 캐시 안에서 앞으로 이동      │
 │  · 서로 다른 소스 위치의 사이트라도 바인더가 같으면 이득을 본다    │
 └────────────────┬───────────────────────────────────────────────┘
                  │ 전부 불일치 = 진짜 캐시 미스
                  ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ 바인딩 수행 (CallSiteBinder.Bind)                                │
 │  · IDMOP면 GetMetaObject() → Bind*(...)                        │
 │  · 아니면 C# 바인더가 리플렉션으로 멤버 해석 + 오버로드 결정       │
 │  · 결과를 식 트리로 만들고 Compile()로 델리게이트 생성            │
 │  · 새 규칙을 L1과 L2에 등록하고 Target에 올린다                  │
 │  · 해석 실패 → RuntimeBinderException                           │
 └────────────────────────────────────────────────────────────────┘
```

> **📌 숫자의 출처**
>
> `MaxRules = 10`(L1)과 `MaxRules = 128`(L2)은 추정이 아니라 `dotnet/runtime`의 `System.Linq.Expressions` 구현에 있는 상수다. L1은 `CallSite<T>` 안에, L2는 `RuleCache<T>` 안에 있다. 구현 세부사항이므로 향후 버전에서 바뀔 수 있지만, **"사이트별 소형 캐시 + 바인더별 대형 캐시"라는 구조 자체는 DLR 설계의 근간**이라 바뀌지 않는다.
>
> 소스 주석에 이런 문장도 있다. "90% sites stay monomorphic and will never need a matchmaker again." 실제 프로그램에서 동적 호출 사이트의 대부분은 한 가지 타입만 본다는 관찰이 이 설계를 정당화한다.

### 매치메이커 — 규칙이 "맞았는지" 어떻게 아는가

규칙 델리게이트는 제약이 불일치하면 폴백 경로로 빠지는데, 호출한 쪽은 "규칙이 실행됐는가, 폴백했는가"를 알아야 한다. DLR은 **매치메이커(matchmaker) 사이트**로 이를 해결한다. 캐시를 순회할 때 `_match` 플래그가 켜진 임시 `CallSite<T>` 인스턴스를 규칙에 넘기고, 규칙 본문이 폴백 경로로 들어가면 그 플래그를 끈다. 순회 코드는 규칙 실행 후 플래그를 보고 적중 여부를 판정한다.

이 구조 덕분에 **동적 호출의 정상 경로에 예외나 반환 코드가 개입하지 않는다.** 제약 불일치는 예외가 아니라 플래그다.

### 단형 / 다형 / 거대다형

호출 사이트가 보는 런타임 타입의 가짓수에 따라 성능이 극적으로 달라진다.

| 상태 | 사이트가 보는 타입 수 | 어느 계층에서 끝나는가 | 상대 비용 |
|---|---|---|---|
| 단형(monomorphic) | 1 | 거의 항상 L0 | 기준 (1배) |
| 다형(polymorphic) | 2 ~ 10 | L0 실패 시 L1 순회 | 2~6배 |
| 거대다형(megamorphic) | 10 초과 | L1 넘침 → 매번 L2 순회 | 10배 이상 |

> **⚠️ 루프 안에서 타입이 섞이면 캐시가 무너진다**
>
> ```csharp
> object[] items = { 1, "a", 2.0, 3L, 'c', 4m, DateTime.Now, /* ... 15종 ... */ };
>
> foreach (dynamic item in items)
>     Sink(item.ToString());       // 하나의 호출 사이트가 15가지 타입을 본다
> ```
>
> 이 사이트의 L1 캐시(10개)는 넘친다. 새 규칙이 앞에 추가되면서 가장 오래된 것이 밀려나므로, 타입이 순환하는 패턴에서는 **L1이 계속 미스**하고 매 호출마다 L2를 128개까지 선형 탐색하게 된다. `dynamic` 호출이 "가끔 100배 느리다"는 보고는 대개 이 상황이다.
>
> 해결책은 셋 중 하나다. (1) 타입별로 호출 사이트를 분리한다 — 즉 소스에서 서로 다른 위치에 동적 식을 둔다. (2) 패턴 매칭(`switch` 식)으로 정적 분기한다. (3) 애초에 `dynamic`을 쓰지 않는다.

> **📌 호출 사이트는 소스 위치마다 하나다**
>
> 컴파일러가 만드는 `<>p__M` 필드는 **소스의 동적 연산 하나당 하나**다. 같은 메서드를 여러 번 호출해도 사이트는 하나이고, 다른 소스 위치의 같은 연산은 다른 사이트다. 이 사실이 위의 조언 (1)의 근거다. 반면 L2 캐시는 **바인더 인스턴스별**이므로 `Binder.InvokeMember`가 반환하는 동일 바인더를 공유하는 사이트들끼리는 L2를 나눠 쓴다. C# 바인더 팩토리는 동등한 바인더를 재사용하는 최적화(`TryGetExisting`)를 하기 때문에, 같은 이름·같은 인수 형태의 호출은 실제로 L2를 공유할 가능성이 있다.

---

## 59.4 동적 변환, 동적 식, `RuntimeBinderException`

### 동적 변환은 양방향으로 암시적이다

`dynamic` 타입은 다른 모든 타입과 **양방향으로 암시적 변환**을 가진다.

```csharp
int i = 7;
dynamic d = i;      // int → dynamic (암시적, 박싱)
long j = d;         // dynamic → long (캐스트 불필요)
```

`object`와 대조하면 비대칭이 드러난다.

```csharp
object o = 123;     // OK: int → object (박싱)
int n1 = o;         // 컴파일 오류: object → int 암시적 변환 없음
int n2 = (int)o;    // OK: 명시적 캐스트 (언박싱)

dynamic d1 = 123;   // OK
int n3 = d1;        // OK: 캐스트 없이 언박싱
```

변환이 성공하려면 **동적 객체의 런타임 타입이 대상 정적 타입으로 암시적 변환 가능해야 한다.** 위 예제가 동작한 것은 `int`가 `long`으로 암시적 변환되기 때문이다.

```csharp
int i = 7;
dynamic d = i;
short j = d;        // RuntimeBinderException
```

`int`는 `short`로 **암시적** 변환되지 않으므로 실패한다. 값이 `short` 범위 안에 있는지는 무관하다. 판단 기준은 값이 아니라 타입이다.

> **⚠️ 여기서 나오는 예외는 상황에 따라 다르다**
>
> 동적 변환 실패의 예외 타입은 **코드 형태에 따라 갈린다.** 정확히 구분해야 한다.
>
> | 코드 | 결과 |
> |---|---|
> | `short j = d;` (`d`의 런타임 타입이 `int`) | `RuntimeBinderException` — C# 바인더가 "적용 가능한 암시적 변환 없음"으로 판단 |
> | `int n = (int)d;` (`d`의 런타임 타입이 `string`) | `InvalidCastException` — 변환 자체는 바인딩되지만 CLR 캐스트가 실패 |
> | `d.NoSuchMethod();` | `RuntimeBinderException` — 멤버 해석 실패 |
> | `(d as string)` | 예외 없음, `null` |
>
> 한 문헌은 "CLR이 런타임에 캐스트를 검증하며 호환되지 않으면 `InvalidCastException`을 던진다"고 쓰고, 다른 문헌은 "`RuntimeBinderException`이 난다"고 쓴다. **둘 다 맞고, 조건이 다르다.** 바인딩 단계에서 걸리면 `RuntimeBinderException`, 바인딩은 성공했는데 실행 단계의 캐스트에서 걸리면 `InvalidCastException`이다.

### `RuntimeBinderException`

멤버 바인딩이 실패하면 `Microsoft.CSharp.RuntimeBinder.RuntimeBinderException`이 발생한다. **런타임에 발생하는 컴파일 오류**라고 생각하면 된다.

```csharp
dynamic d = 5;
d.Hello();          // RuntimeBinderException:
                    // 'int' does not contain a definition for 'Hello'
```

메시지가 컴파일러의 CS1061 오류 메시지와 사실상 같다는 점에 주목하라. C# 바인더가 컴파일러의 바인딩 로직을 런타임에 재현하기 때문에 진단 메시지도 같은 문구를 쓴다.

```csharp
dynamic textData1 = "Hello";
try
{
    Console.WriteLine(textData1.ToUpper());    // HELLO
    Console.WriteLine(textData1.toupper());    // 여기서 예외
    Console.WriteLine(textData1.Foo(10, "ee", DateTime.Now));
}
catch (RuntimeBinderException ex)
{
    Console.WriteLine(ex.Message);
    // 'string' does not contain a definition for 'toupper'
}
```

C#은 대소문자를 구분하고 **동적 바인딩도 대소문자를 구분한다.** `toupper`는 존재하지 않는 멤버다. IDE의 IntelliSense는 `dynamic` 변수에 점을 찍었을 때 아무것도 제안하지 못하며, 아무 이름이나 입력해도 막지 않는다. 철자와 대소문자를 스스로 책임져야 한다.

> **⚠️ 예외 메시지는 계약이 아니다**
>
> `RuntimeBinderException.Message`의 문구는 문서화된 계약이 아니다. 런타임 버전과 지역화 설정에 따라 달라질 수 있다. **메시지 문자열을 파싱해 분기하는 코드를 쓰면 안 된다.** 어떤 멤버가 존재하는지 미리 알아야 한다면 `RuntimeBinderException`을 잡는 대신 오버로드 폴백을 설계하거나(59.7절), 리플렉션으로 존재 여부를 조회해야 한다.
>
> 참고로 DLR에는 `RuntimeBinderInternalCompilerException`이라는 별도 예외도 있다. 이름 그대로 바인더 내부의 예기치 못한 상태를 나타내며, 애플리케이션 코드가 잡아서 처리할 대상이 아니다.

> **📌 "이 연산이 성공할까?"를 미리 물어볼 방법은 없다**
>
> DLR에는 "이 동적 연산이 성공할지 시험해보는" API가 없다. 시도하고 예외를 잡는 것이 유일한 방법이며, 예외를 던지고 잡는 비용은 동적 호출 비용보다 몇 자릿수 크다. 예외를 흐름 제어에 쓰는 설계가 되면 성능이 무너진다.

### 동적 식은 전염된다

필드, 속성, 메서드, 이벤트, 생성자, 인덱서, 연산자, 변환 — 전부 동적으로 호출할 수 있다.

`dynamic` 피연산자를 포함하는 식은 **그 자체로 `dynamic`이 되는 것이 보통**이다. 타입 정보의 부재가 연쇄적으로 전파되기 때문이다.

```csharp
dynamic x = 2;
var y = x * 3;      // y의 정적 타입은 dynamic
```

여기에는 명확한 예외가 몇 가지 있다.

```csharp
dynamic x = 2;
var y = (int)x;                                     // ① y의 정적 타입은 int

dynamic capacity = 10;
var sb = new System.Text.StringBuilder(capacity);   // ② sb의 정적 타입은 StringBuilder
```

① **동적 식을 정적 타입으로 캐스트하면 정적 식이 된다.**
② **생성자 호출은 항상 정적 식을 산출한다.** 인수가 동적이어도 결과 타입은 생성하는 타입 그 자체다.

그 밖에 배열에 인덱스를 넘기는 경우, 델리게이트 생성 식 등 몇 가지 경계 사례에서도 동적 인수를 포함한 식이 정적이 된다. 다만 **배열이 아닌 인덱서**는 예외가 아니다 — `primary_expression`이 배열 타입일 때만 결과가 요소 타입이 되고, 그 외에는 결과가 `dynamic`이다.

| 식 | 결과의 정적 타입 | 비고 |
|---|---|---|
| `x * 3` (`x`가 `dynamic`) | `dynamic` | 전염 |
| `(int)x` | `int` | 캐스트는 전염을 끊는다 |
| `new StringBuilder(x)` | `StringBuilder` | 생성자는 항상 정적 |
| `arr[x]` (`arr`가 `int[]`) | `int` | 배열 인덱싱은 정적 |
| `M(x)` (`M`이 정적 메서드) | `dynamic` | 반환 타입을 알 수 없다 |
| `x is string` | `bool` | `is`는 항상 `bool` |
| `x?.Length` | `dynamic` | 전염 |
| `list[x]` (`list`가 `List<int>`) | `dynamic` | 배열이 아닌 인덱서는 인수만 동적이어도 결과가 `dynamic` |

### `void` 반환을 소비하면 런타임에 터진다

정적 타입 코드와 마찬가지로, `void` 반환 타입인 식의 결과를 소비하는 것은 금지된다. 차이는 **오류가 런타임에 발생한다**는 점이다.

```csharp
dynamic list = new List<int>();
var result = list.Add(5);       // RuntimeBinderException:
                                // Cannot implicitly convert type 'void' to 'object'
```

`List<int>.Add`는 `void`를 반환한다. 컴파일러는 `list`가 무엇인지 모르니 통과시키고, 런타임에 바인더가 거부한다.

### `foreach`와 `using`에서의 동적 처리

동적 식이 `foreach`의 컬렉션이나 `using`의 리소스로 지정되면, 컴파일러는 그 식을 각각 비제네릭 `System.IEnumerable` 인터페이스와 `System.IDisposable` 인터페이스로 캐스트하려 시도하는 코드를 생성한다. 캐스트가 성공하면 정상 동작하고, 실패하면 `RuntimeBinderException`이 발생한다.

```csharp
dynamic d = new int[] { 1, 2, 3 };
foreach (var n in d) Console.Write(n);      // 123  (IEnumerable로 캐스트 성공)

dynamic e = 42;
foreach (var n in e) { }                    // RuntimeBinderException
```

### 조건식에서의 제약

```csharp
dynamic d = GetSomething();
if (d) { }
```

이 코드는 `d`의 런타임 타입이 `bool`로 암시적 변환 가능하거나, 인터페이스가 아니면서 `true`/`false` 연산자를 정의하고 있어야 성립한다(22.5절). 다만 동적 연산의 결과가 `bool`이 될 수 없음이 **정적으로 확정되는** 형태라면 컴파일 오류 CS7083이 난다. `dynamic`이라고 해서 모든 검사가 런타임으로 미뤄지지는 않는다. 컴파일러는 할 수 있는 검사는 여전히 한다 — 이 원칙은 59.6절에서 본격적으로 다룬다.

---

## 59.5 `var` vs `dynamic`

### 한 줄로 요약하면

`var`와 `dynamic`은 겉모습이 닮았지만 차이는 깊다.

- **`var`** — "타입은 컴파일러가 알아내라."
- **`dynamic`** — "타입은 런타임이 알아내라."

```csharp
dynamic x = "hello";        // 정적 타입 dynamic, 런타임 타입 string
var y = "hello";            // 정적 타입 string,  런타임 타입 string

int i = x;                  // 런타임 오류 (string을 int로 변환 불가)
int j = y;                  // 컴파일 오류   (string을 int로 변환 불가)
```

같은 오류가 한쪽은 런타임에, 다른 쪽은 컴파일 타임에 잡힌다. 이 차이가 전부라고 해도 과언이 아니다.

### 대비표

| 항목 | `var` | `dynamic` |
|---|---|---|
| 정체 | 타입 추론을 위한 **문법적 축약** | 실제 타입(메타데이터상 `object`) |
| 타입 결정 시점 | 컴파일 타임 | 런타임 |
| 결정 후 | 완전한 정적 타입 — 이후 모든 검사가 정적 | 매 연산마다 런타임 바인딩 |
| 선언 위치 | **지역 변수만** (그리고 `foreach`·`using`·패턴 변수) | 지역 변수, 필드, 매개변수, 반환 타입, 제네릭 인수 |
| 초기화 | **필수** (`var x;` 불가) | 선택 (`dynamic x;` 가능) |
| 캐스트 대상 | 불가 (`(var)e` 없음) | 가능 (`(dynamic)e`) |
| 메타데이터 | 남지 않음 (추론된 실제 타입이 기록) | `object` + `DynamicAttribute` |
| IntelliSense | **정상 동작** | 동작하지 않음 |
| 멤버 오타 | 컴파일 오류 | `RuntimeBinderException` |
| 확장 메서드 / LINQ | 정상 | 사실상 사용 불가 (59.6절) |
| 성능 | 정적 코드와 동일 | 호출 사이트 + 캐시 조회 비용 |
| 트리밍 / AOT | 영향 없음 | 경고, 사실상 사용 불가 (59.10절) |

### `var`가 `dynamic`이 되는 순간

`var`로 선언한 변수의 **정적 타입이 `dynamic`이 될 수 있다.** 이게 실무에서 가장 헷갈리는 지점이다.

```csharp
dynamic x = "hello";
var y = x;          // y의 정적 타입은 dynamic!
int z = y;          // 런타임 오류
```

`var`는 "우변의 정적 타입을 그대로 가져온다"는 뜻이고, 우변의 정적 타입이 `dynamic`이니 `y`도 `dynamic`이다. `var`를 썼다고 해서 정적 타입 안전성이 회복되지는 않는다.

```csharp
dynamic d = 123;
var result = M(d);  // M의 오버로드를 컴파일 타임에 확정할 수 없으므로
                    // result의 정적 타입도 dynamic
```

컴파일러는 어떤 `M`이 호출될지 모르니 반환 타입도 모른다. 그래서 `result`를 `dynamic`으로 가정한다. 만약 런타임에 선택된 `M`의 반환 타입이 `void`라면 `RuntimeBinderException`이 발생한다.

> **⚠️ `dynamic`은 코드베이스를 조용히 오염시킨다**
>
> ```csharp
> dynamic config = LoadConfig();
> var timeout = config.Timeout;        // dynamic
> var ms = timeout * 1000;             // dynamic
> var span = TimeSpan.FromMilliseconds(ms);  // 여기는 정적 (생성자·정적 메서드)
> ```
>
> `var`만 보고 있으면 `timeout`과 `ms`가 정적 타입이라고 착각하기 쉽다. 실제로는 이 라인들이 모두 **호출 사이트를 하나씩 만들고**, 모두 런타임 오류 후보가 된다.
>
> IDE에서 `var` 위에 마우스를 올리면 `dynamic`이라고 표시된다. 습관적으로 확인하는 편이 좋다.

> **💡 경계에서만 `dynamic`을 쓰고 즉시 벗어나라**
>
> 실무에서 통하는 규칙은 하나다. **`dynamic`은 시스템 경계에서 값을 꺼내는 그 한 줄에서만 쓰고, 바로 정적 타입으로 캐스트해서 아래로 흘려보낸다.**
>
> ```csharp
> // 나쁨 — dynamic이 메서드 전체에 퍼진다
> dynamic row = reader.GetDynamicRow();
> var id = row.Id;
> var name = row.Name;
> Process(id, name);              // 호출 사이트 3개 + 런타임 오류 후보 3개
>
> // 좋음 — 경계에서 끊는다
> dynamic row = reader.GetDynamicRow();
> int id = (int)row.Id;           // 여기서 정적 타입으로 확정
> string name = (string)row.Name;
> Process(id, name);              // 이후는 전부 정적
> ```
>
> 두 번째 코드도 호출 사이트는 두 개 만들지만, `id`와 `name`이 정적 타입이므로 그 뒤의 모든 코드가 컴파일러의 검사를 받는다. 오류가 나더라도 **어디서 났는지가 명확하다.**

---

## 59.6 동적 식 안의 정적 타입, 호출 불가능한 함수

### 컴파일러는 "가능한 한 정적"이다

동적 바인딩에 동적 타입이 쓰인다는 것은 자명하다. 덜 자명한 것은 **정적 타입도 가능한 한 최대로 사용된다**는 사실이다.

```csharp
class Program
{
    static void Foo(object x, object y) { Console.WriteLine("oo"); }
    static void Foo(object x, string y) { Console.WriteLine("os"); }
    static void Foo(string x, object y) { Console.WriteLine("so"); }
    static void Foo(string x, string y) { Console.WriteLine("ss"); }

    static void Main()
    {
        object o = "hello";
        dynamic d = "goodbye";

        Foo(o, d);      // os
    }
}
```

`Foo(o, d)` 호출은 인수 중 하나(`d`)가 `dynamic`이므로 동적으로 바인딩된다. 하지만 `o`는 정적으로 알려져 있으므로 **바인딩이 런타임에 일어나더라도 그 정보를 활용한다.** 결과적으로 오버로드 해석은 `o`의 정적 타입(`object`)과 `d`의 런타임 타입(`string`)을 근거로 두 번째 구현을 고른다. 컴파일러는 **"할 수 있는 한 최대로 정적"** 이다.

이 정보는 59.3절에서 본 `CSharpArgumentInfo`로 바인더에 전달된다. `CSharpArgumentInfoFlags.UseCompileTimeType` 플래그가 붙은 인수는 런타임 타입이 아니라 컴파일 타임 타입으로 오버로드 해석에 참여한다.

> **⚠️ 상수 리터럴과 `null`도 정보로 전달된다**
>
> `CSharpArgumentInfoFlags`의 값은 `None`, `UseCompileTimeType`, `Constant`, `NamedArgument`, `IsRef`, `IsOut`, `IsStaticType` 일곱 개가 전부다. 즉 `d.M(null)`과 `d.M((string)null)`은 **서로 다른 오버로드로 해석될 수 있다.** 정적 코드에서와 같은 규칙이지만, 동적 코드에서는 그 사실을 잊기 쉽다.

### 동적 수신자 없는 동적 호출

`dynamic`의 전형적 용례는 **동적 수신자(dynamic receiver)** 다. 동적 객체가 동적 함수 호출의 수신자인 경우다.

```csharp
dynamic x = ...;
x.Foo();            // x가 수신자
```

하지만 **정적으로 알려진 함수를 동적 인수로 호출**할 수도 있다. 이런 호출은 동적 오버로드 해석의 대상이 되며, 다음이 포함된다.

- 정적 메서드
- 인스턴스 생성자
- 정적으로 타입이 알려진 수신자에 대한 인스턴스 메서드

```csharp
class Program
{
    static void Foo(int x)    => Console.WriteLine("int");
    static void Foo(string x) => Console.WriteLine("string");

    static void Main()
    {
        dynamic x = 5;
        dynamic y = "watermelon";

        Foo(x);     // int
        Foo(y);     // string
    }
}
```

어떤 `Foo`가 동적으로 바인딩되는지는 동적 인수의 런타임 타입에 달렸다.

### 동적 수신자가 없으면 컴파일러가 미리 검사한다

동적 수신자가 관여하지 않으므로, 컴파일러는 **그 동적 호출이 성공할 가능성이 있는지 기본적인 검사**를 정적으로 수행할 수 있다. 이름이 맞고 매개변수 개수가 맞는 함수가 존재하는지 본다. 후보가 하나도 없으면 컴파일 오류다.

```csharp
class Program
{
    static void Foo(int x)    => Console.WriteLine("int");
    static void Foo(string x) => Console.WriteLine("string");

    static void Main()
    {
        dynamic x = 5;

        Foo(x, x);      // 컴파일 오류 — 매개변수 개수가 맞는 후보 없음
        Fook(x);        // 컴파일 오류 — 그런 이름의 메서드 없음
    }
}
```

**`dynamic`은 만능 면죄부가 아니다.** 컴파일러가 검사할 수 있는 것은 여전히 검사한다.

### 호출할 수 없는 함수들

어떤 함수는 동적으로 호출할 수 없다. 다음 셋이다.

- **확장 메서드** (확장 메서드 문법으로)
- **인터페이스의 멤버**, 그 인터페이스로 캐스트해야만 호출할 수 있는 경우
- **서브클래스가 숨긴 기반 멤버**

왜 그런지 이해하면 동적 바인딩의 본질이 보인다. 동적 바인딩에는 두 정보가 필요하다. **호출할 함수의 이름**과 **그 함수를 호출할 객체**다. 그런데 위 세 시나리오에는 **컴파일 타임에만 알려지는 추가 타입**이 관여한다. 이 글을 쓰는 시점까지 그 추가 타입을 동적으로 지정할 방법은 없다.

| 호출 불가 대상 | 필요한 "추가 타입" | 그 타입이 사라지는 이유 | 실패 형태 | 우회 방법 |
|---|---|---|---|---|
| 확장 메서드 | 확장 메서드를 정의한 **정적 클래스** | `using` 지시자는 컴파일 후 소멸 | 수신자가 정적 타입이고 인수만 동적이면 컴파일 오류 CS1973, 수신자가 `dynamic`이면 런타임 `RuntimeBinderException` | 정적 메서드 문법으로 호출: `Ext.M(d, arg)` |
| 명시적 인터페이스 구현 | **인터페이스 타입** | 캐스트의 "렌즈"는 런타임에 남지 않음 | `RuntimeBinderException` | 인터페이스로 캐스트 후 정적 호출, 또는 헬퍼 오버로드(59.7절) |
| 다른 어셈블리의 `internal` 타입이 구현한 인터페이스 멤버 | **인터페이스 타입** | 위와 동일 | `RuntimeBinderException` (접근 불가) | 헬퍼 오버로드(59.7절) |
| 숨겨진 기반 멤버 (`new`로 가려진 것) | **기반 클래스 타입** | 캐스트/`base` 키워드는 컴파일 타임 개념 | `RuntimeBinderException` 또는 잘못된 멤버 호출 | 기반 타입으로 캐스트 후 정적 호출 |
| `base.M(dynamicArg)` | `base` 접근 | 동적 디스패치와 `base` 접근이 양립 불가 | 컴파일 오류 CS1971 (인덱서는 CS1972, 생성자 이니셜라이저는 CS1975) | 인수를 정적 타입으로 캐스트 |

### 확장 메서드

확장 메서드를 호출할 때 그 추가 타입은 암묵적이다. 확장 메서드가 정의된 **정적 클래스**가 그것이고, 컴파일러는 소스의 `using` 지시자를 근거로 그 클래스를 찾는다. 이 때문에 확장 메서드는 **컴파일 타임 전용 개념**이 된다. `using` 지시자는 단순 이름을 네임스페이스 한정 이름으로 매핑하는 역할을 마치고 컴파일과 함께 녹아 사라지기 때문이다.

```csharp
static class Ext
{
    public static string Twice(this string s) => s + s;
}

dynamic d = "ab";
Console.WriteLine(d.Twice());       // 컴파일은 통과, 런타임에 RuntimeBinderException
Console.WriteLine(Ext.Twice(d));    // "abab" — 정적 메서드 문법이면 동작한다
```

여기서는 **수신자 자체가 `dynamic`** 이므로 컴파일러가 확장 메서드 후보를 볼 수조차 없다. 그래서 컴파일은 통과하고 런타임에 `RuntimeBinderException`이 난다.

반면 **수신자는 정적 타입인데 인수만 동적인** 경우 — `"ab".Twice(d)` 같은 형태 — 컴파일러가 "이름은 맞는 확장 메서드가 있는데 동적 디스패치는 불가능하다"는 것을 알 수 있으므로 컴파일 오류 CS1973으로 잡아준다. 메시지는 이렇다.

```text
'string' has no applicable method named 'Twice' but appears to have an
extension method by that name. Extension methods cannot be dynamically
dispatched. Consider casting the dynamic arguments or calling the
extension method without the extension method syntax.
```

> **⚠️ LINQ는 `dynamic`과 사실상 함께 쓸 수 없다**
>
> LINQ 연산자는 전부 확장 메서드다. 따라서 `dynamic` 값에 대해 LINQ를 쓸 수 없다.
>
> ```csharp
> dynamic a = GetDynamicObject();
> var data = from d in a select d;    // 컴파일 오류 CS1979:
>                                     // Query expressions over source type 'dynamic'
>                                     // or with a join sequence of type 'dynamic'
>                                     // are not allowed
> ```
>
> 메서드 체인 문법(`a.Select(...)`)도 마찬가지로 실패한다. 정적 타입으로 캐스트한 뒤 쿼리해야 한다.

### 인터페이스 멤버

인터페이스를 통해 멤버를 호출할 때는 암시적·명시적 캐스트로 그 추가 타입을 지정한다. 그럴 필요가 있는 시나리오는 둘이다. **명시적으로 구현된 인터페이스 멤버**를 호출할 때, 그리고 **다른 어셈블리 내부의 `internal` 타입이 구현한 인터페이스 멤버**를 호출할 때다.

```csharp
interface IFoo { void Test(); }
class Foo : IFoo { void IFoo.Test() { } }
```

`Test`를 호출하려면 `IFoo`로 캐스트해야 한다. 정적 타입이라면 쉽다.

```csharp
IFoo f = new Foo();
f.Test();               // 인터페이스로의 암시적 캐스트
```

동적 타입이면 실패한다.

```csharp
IFoo f = new Foo();
dynamic d = f;
d.Test();               // RuntimeBinderException
```

굵게 표시한 암시적 캐스트는 컴파일러에게 "`f`에 대한 이후의 멤버 호출을 `Foo`가 아니라 `IFoo`에 바인딩하라"고 지시한다. 다시 말해 그 객체를 `IFoo` 인터페이스라는 **렌즈**를 통해 보라는 것이다. 그런데 그 렌즈는 런타임에 사라진다. 그래서 DLR은 바인딩을 완성할 수 없다. 사라진다는 사실은 이렇게 확인된다.

```csharp
Console.WriteLine(f.GetType().Name);    // Foo   ← IFoo가 아니다
```

숨겨진 기반 멤버를 호출할 때도 같은 상황이 된다. 캐스트나 `base` 키워드로 추가 타입을 지정해야 하는데, 그 추가 타입이 런타임에 소실된다.

> **📌 `Uncapsulator`**
>
> 인터페이스 멤버를 동적으로 호출해야 한다면 우회책으로 오픈소스 라이브러리 `Uncapsulator`가 있다. NuGet과 GitHub에서 구할 수 있으며, 이 문제를 해결하기 위해 커스텀 바인딩을 활용해 "`dynamic`보다 나은 `dynamic`"을 제공한다.
>
> ```csharp
> IFoo f = new Foo();
> dynamic uf = f.Uncapsulate();
> uf.Test();
> ```
>
> 기반 타입과 인터페이스를 **이름으로** 캐스트할 수 있고, 정적 멤버를 동적으로 호출할 수 있으며, 비공개 멤버에도 접근할 수 있다. 다만 비공개 멤버 접근은 내부적으로 리플렉션을 쓰므로 트리밍·AOT 제약을 그대로 받는다.

### 그 밖의 컴파일 타임 제약 목록

`dynamic`이 관여하면 컴파일러가 거부하는 상황이 생각보다 많다. 정리해두면 실수를 줄일 수 있다.

| 상황 | 오류 | 메시지 요지 |
|---|---|---|
| `typeof(dynamic)` | CS1962 | `typeof` 연산자를 `dynamic` 타입에 쓸 수 없다 |
| 식 트리 안의 동적 연산 | CS1963 | 식 트리는 동적 연산을 포함할 수 없다 |
| `dynamic`으로/에서의 사용자 정의 변환 | CS1964 | `dynamic` 타입으로의/에서의 사용자 정의 변환은 허용되지 않는다 |
| `dynamic`에서 파생 | CS1965 | `dynamic` 타입에서 파생할 수 없다 |
| 동적 인터페이스 구현 (`IFoo<dynamic>` 등) | CS1966 | 동적 인터페이스를 구현할 수 없다 |
| 제네릭 제약이 `dynamic` | CS1967 / CS1968 | 제약은 `dynamic` 타입일 수 없다 |
| `DynamicAttribute` 직접 사용 | CS1970 | `DynamicAttribute`를 쓰지 말고 `dynamic` 키워드를 써라 |
| `base.M(dynamicArg)` | CS1971 | `base` 접근식의 일부라 동적 디스패치를 할 수 없다 |
| `base[dynamicArg]` | CS1972 | 인덱서 접근에 대한 같은 문제 |
| 생성자 이니셜라이저에서의 동적 디스패치 | CS1975 | 생성자 이니셜라이저의 일부라 동적 디스패치를 할 수 없다 |
| 메서드 그룹을 동적 인수로 전달 | CS1976 | 메서드 그룹을 동적 디스패치 인수로 쓸 수 없다 |
| 람다를 동적 인수로 전달 | CS1977 | 델리게이트나 식 트리 타입으로 먼저 캐스트해야 한다 |
| 포인터 등 부적격 타입을 동적 인수로 전달 | CS1978 | 그 타입의 식을 동적 디스패치 인수로 쓸 수 없다 |
| `dynamic` 소스에 대한 쿼리식 | CS1979 | `dynamic`을 소스로 하는 쿼리식은 허용되지 않는다 |
| `in` 한정자 인수 | CS8364 | `in` 한정자 인수는 동적 디스패치 식에 쓸 수 없다 |
| 패턴에서 `dynamic` 사용 | CS8208 | 패턴에 `dynamic` 타입을 쓰는 것은 합법이 아니다 |
| `dynamic` 객체 분해 | CS8133 | 동적 객체를 분해할 수 없다 |
| 필요한 타입 누락 (`Microsoft.CSharp` 미참조) | CS1969 / CS1980 | 동적 식 컴파일에 필요한 타입을 찾을 수 없다 |
| `x is dynamic` | CS1981 (경고) | `dynamic`과의 `is` 호환성 검사는 `Object`와의 검사와 사실상 동일하다 |
| `[Conditional]` 메서드로의 동적 디스패치 | CS1974 (경고) | 적용 가능한 오버로드 중 조건부 메서드가 있어 런타임에 실패할 수 있다 |

> **⚠️ 람다는 동적 호출의 인수가 될 수 없다**
>
> ```csharp
> dynamic a = GetDynamicObject();
> a.Method(arg => Console.WriteLine(arg));     // 컴파일 오류 CS1977
> ```
>
> 대상 메서드가 `Action<string>`을 받는다는 것을 컴파일러가 알 수 없으므로 람다의 매개변수 타입을 추론할 수 없다. 명시적 델리게이트로 캐스트하면 통과한다.
>
> ```csharp
> a.Method((Action<string>)(arg => Console.WriteLine(arg)));
> ```
>
> 같은 이유로 메서드 그룹(`a.Method(Console.WriteLine)`)도 거부된다(CS1976).

> **💡 `dynamic`을 쓰기 전에 이 목록을 한 번 훑어라**
>
> 위 표의 항목 대부분은 "동적으로 하면 안 되는 것"이 아니라 "**동적으로 할 수 없는 것**"이다. 컴파일러가 지금 막아준다는 뜻이므로 그나마 다행이지만, 설계 단계에서 `dynamic`으로 해결하려던 문제가 이 목록에 걸린다면 방향을 바꾸는 편이 빠르다. 특히 패턴 매칭(CS8208)과 분해(CS8133)가 불가능하다는 점은 현대 C# 코드 스타일과 `dynamic`이 잘 맞지 않는다는 사실을 보여준다.

---

## 59.7 동적 멤버 오버로드 해석 — 방문자 패턴 단순화

### 단일 디스패치와 다중 디스패치

C#과 CLR은 오래전부터 제한적인 형태의 동적 성질을 지원해 왔다. **가상 메서드 호출**이다. 하지만 가상 호출은 C#의 동적 바인딩과 다르다. 가상 호출에서 컴파일러는 **호출한 멤버의 이름과 시그니처를 근거로 컴파일 타임에 특정 가상 멤버를 확정**해야 한다. 그 결과 두 가지가 따라온다.

- 호출식은 컴파일러가 완전히 이해할 수 있어야 한다. 예를 들어 대상 멤버가 필드인지 속성인지를 컴파일 타임에 결정해야 한다.
- **오버로드 해석은 전적으로 컴파일 타임 인수 타입을 근거로 컴파일러가 완결해야 한다.**

두 번째 항목의 귀결이 **단일 디스패치(single dispatch)** 다.

```csharp
animal.Walk(owner);         // Walk는 가상 메서드
```

개의 `Walk`를 호출할지 고양이의 `Walk`를 호출할지의 런타임 결정은 오직 수신자 `animal`의 타입에만 의존한다. 그래서 "단일"이다. `Walk`의 오버로드가 여러 종류의 `owner`를 받도록 정의되어 있어도, 어떤 오버로드가 선택될지는 `owner` 객체의 실제 런타임 타입과 무관하게 컴파일 타임에 정해진다. **호출될 메서드를 바꿀 수 있는 것은 수신자의 런타임 타입뿐이다.**

반면 동적 호출은 오버로드 해석을 런타임까지 미룬다.

```csharp
animal.Walk((dynamic)owner);
```

이제 어떤 `Walk`를 호출할지는 `animal`과 `owner` **양쪽의 타입**에 달려 있다. 수신자 타입에 더해 인수의 런타임 타입까지 결정에 기여하므로 이것을 **다중 디스패치(multiple dispatch)** 라고 부른다.

정적으로 알려진 메서드를 동적 타입 인수로 호출하는 것 — 이것이 **멤버 오버로드 해석을 컴파일 타임에서 런타임으로 미루는** 기법이며, 특정 프로그래밍 과제를 단순화한다. 방문자(Visitor) 디자인 패턴이 대표적이다.

### 방문자 패턴의 문제

방문자 패턴의 본질은 **기존 클래스를 수정하지 않고 클래스 계층에 메서드를 "추가"하는 것**이다. 유용하지만, 정적 형태의 이 패턴은 다른 대부분의 디자인 패턴에 비해 미묘하고 직관적이지 않다. 게다가 방문 대상 클래스가 `Accept` 메서드를 노출해 "방문자 친화적"이 되어야 하는데, 그 클래스가 내 통제 아래 있지 않으면 불가능하다.

동적 바인딩을 쓰면 같은 목표를 더 쉽게, 그리고 **기존 클래스를 수정하지 않고** 달성할 수 있다. 다음 클래스 계층을 보자.

```csharp
using System.Collections.ObjectModel;

class Person
{
    public string FirstName { get; set; }
    public string LastName  { get; set; }

    // Friends 컬렉션에는 Customer와 Employee가 섞여 들어올 수 있다
    public readonly IList<Person> Friends = new Collection<Person>();
}

class Customer : Person { public decimal CreditLimit { get; set; } }
class Employee : Person { public decimal Salary      { get; set; } }
```

`Person`의 상세 정보를 XML `XElement`로 내보내는 메서드를 쓰고 싶다고 하자. 가장 뻔한 해법은 `Person`에 `ToXElement()`라는 가상 메서드를 만들고 `Customer`와 `Employee`에서 재정의해 `CreditLimit`과 `Salary`까지 채우는 것이다. 그런데 이 방식에는 두 가지 문제가 있다.

- `Person`, `Customer`, `Employee` 클래스를 내가 소유하지 않을 수 있다. 그러면 메서드를 추가할 수 없다. (그리고 **확장 메서드는 다형적 동작을 주지 못한다.**)
- 세 클래스가 이미 충분히 클 수 있다. 흔한 안티패턴 하나가 **"신 객체(God Object)"** 인데, `Person` 같은 클래스가 기능을 계속 빨아들여 유지보수의 악몽이 되는 것이다. 좋은 해독제는 `Person`의 비공개 상태에 접근할 필요가 없는 함수를 `Person`에 추가하지 않는 것이다. `ToXElement`는 그런 함수의 훌륭한 후보다.

### 동적 오버로드 해석으로 다시 쓰기

동적 멤버 오버로드 해석을 쓰면 타입 기반의 지저분한 `switch` 없이 별도 클래스에 기능을 작성할 수 있다.

```csharp
using System.Xml.Linq;

class ToXElementPersonVisitor
{
    public XElement DynamicVisit(Person p) => Visit((dynamic)p);

    XElement Visit(Person p)
    {
        return new XElement("Person",
            new XAttribute("Type", p.GetType().Name),
            new XElement("FirstName", p.FirstName),
            new XElement("LastName", p.LastName),
            p.Friends.Select(f => DynamicVisit(f))
        );
    }

    XElement Visit(Customer c)          // 고객 전용 로직
    {
        XElement xe = Visit((Person)c); // "기반" 메서드 호출
        xe.Add(new XElement("CreditLimit", c.CreditLimit));
        return xe;
    }

    XElement Visit(Employee e)          // 직원 전용 로직
    {
        XElement xe = Visit((Person)e); // "기반" 메서드 호출
        xe.Add(new XElement("Salary", e.Salary));
        return xe;
    }
}
```

`DynamicVisit` 메서드가 **동적 디스패치**를 수행해 런타임에 결정된 가장 구체적인 `Visit` 버전을 호출한다. `Visit(Person p)` 안에서 `Friends` 컬렉션의 각 사람에 대해 `DynamicVisit`을 호출하는 줄에 주목하라. 이 덕분에 친구가 `Customer`나 `Employee`이면 올바른 오버로드가 호출된다.

`Visit((Person)c)`처럼 **정적 캐스트**를 쓴 것도 의도적이다. 캐스트가 동적 전염을 끊으므로(59.4절) 이 호출은 정적으로 `Visit(Person)`에 바인딩된다. 캐스트를 빼면 무한 재귀에 빠진다.

동작을 확인해보자.

```csharp
var cust = new Customer
{
    FirstName = "Joe", LastName = "Bloggs", CreditLimit = 123
};
cust.Friends.Add(
    new Employee { FirstName = "Sue", LastName = "Brown", Salary = 50000 }
);
Console.WriteLine(new ToXElementPersonVisitor().DynamicVisit(cust));
```

결과는 이렇다.

```xml
<Person Type="Customer">
  <FirstName>Joe</FirstName>
  <LastName>Bloggs</LastName>
  <Person Type="Employee">
    <FirstName>Sue</FirstName>
    <LastName>Brown</LastName>
    <Salary>50000</Salary>
  </Person>
  <CreditLimit>123</CreditLimit>
</Person>
```

`Person` 계층의 어떤 클래스도 수정하지 않았고, `Accept` 메서드도 없다.

### 변형 — 추상 기반 방문자

방문자 클래스를 여럿 만들 계획이라면 방문자용 추상 기반 클래스를 정의하는 것이 유용하다.

```csharp
abstract class PersonVisitor<T>
{
    public T DynamicVisit(Person p) => Visit((dynamic)p);

    protected abstract T Visit(Person p);
    protected virtual  T Visit(Customer c) => Visit((Person)c);
    protected virtual  T Visit(Employee e) => Visit((Person)e);
}
```

서브클래스는 자기만의 `DynamicVisit`을 정의할 필요가 없다. 동작을 특수화하고 싶은 `Visit` 버전만 재정의하면 된다.

```csharp
class ToXElementPersonVisitor : PersonVisitor<XElement>
{
    protected override XElement Visit(Person p)
        => new XElement("Person",
               new XAttribute("Type", p.GetType().Name),
               new XElement("FirstName", p.FirstName),
               new XElement("LastName", p.LastName),
               p.Friends.Select(f => DynamicVisit(f)));

    protected override XElement Visit(Customer c)
    {
        XElement xe = base.Visit(c);        // 기반 메서드를 자연스럽게 호출
        xe.Add(new XElement("CreditLimit", c.CreditLimit));
        return xe;
    }

    // Visit(Employee)도 같은 방식
}
```

`Person` 계층을 다루는 메서드가 한곳에 모이고, 구현자가 기반 메서드를 자연스럽게 호출할 수 있으며, `ToXElementPersonVisitor` 자체를 다시 서브클래싱할 수도 있다.

> **⚠️ `base.Visit(c)`는 동작하지만 `base.Visit((dynamic)c)`는 컴파일되지 않는다**
>
> 59.6절에서 본 CS1971이 여기서 나온다. `base` 접근은 동적 디스패치와 양립할 수 없다. 위 코드가 안전한 이유는 `base.Visit(c)`의 인수 `c`가 **정적 타입 `Customer`** 이기 때문이다.

> **⚠️ 폴백 오버로드가 없으면 런타임에 터진다**
>
> `Visit((dynamic)p)`에 넘어온 객체가 `Person` 계층 밖의 타입이라면 — 예를 들어 누군가 `IList<Person>`에 다른 것을 넣었다면 — `RuntimeBinderException`이 난다. 이 패턴을 쓸 때는 **가장 일반적인 매개변수 타입을 받는 오버로드가 반드시 하나 있어야 한다.** 위 예제에서는 `Visit(Person)`이 그 역할을 하지만, 계층 전체의 루트가 `object`인 상황이라면 `Visit(object)` 폴백을 두는 것이 안전하다.

### 제네릭 타입의 멤버를 익명으로 호출하기

C#의 엄격한 정적 타이핑은 양날의 검이다. 한편으로는 컴파일 타임에 어느 정도의 정확성을 강제한다. 다른 한편으로는 어떤 종류의 코드를 표현하기 어렵거나 불가능하게 만들고, 그럴 때 리플렉션에 의존하게 된다. 이런 상황에서 **동적 바인딩은 리플렉션보다 깔끔하고 빠른 대안**이다.

대표적인 예가 `T`를 모르는 상태에서 `G<T>` 타입의 객체를 다뤄야 하는 경우다.

```csharp
public class Foo<T> { public T Value; }
```

다음 메서드를 쓴다고 하자.

```csharp
static void Write(object obj)
{
    if (obj is Foo<>)                       // 불가능
        Console.WriteLine(((Foo<>)obj).Value);  // 불가능
}
```

컴파일되지 않는다. **바인딩되지 않은 제네릭 타입의 멤버는 호출할 수 없다.**

동적 바인딩은 두 가지 우회로를 준다. 첫째는 `Value` 멤버에 동적으로 접근하는 것이다.

```csharp
static void Write(dynamic obj)
{
    try { Console.WriteLine(obj.Value); }
    catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException) { /* ... */ }
}
```

`Value`라는 필드나 속성을 정의한 **어떤 객체와도** 동작한다는 장점이 있지만 문제가 둘이다. 첫째, 이런 식으로 예외를 잡는 것은 지저분하고 비효율적이다(그리고 DLR에게 "이 연산이 성공할까?"라고 미리 물어볼 방법이 없다). 둘째, `Foo`가 인터페이스(가령 `IFoo<T>`)일 때 `Value`가 명시적으로 구현되었거나 `IFoo<T>`를 구현한 타입이 접근 불가능하면 아예 동작하지 않는다.

### 더 나은 해법 — 오버로드 폴백

더 나은 해법은 `GetFooValue`라는 오버로드된 헬퍼 메서드를 만들고 동적 멤버 오버로드 해석으로 호출하는 것이다.

```csharp
static void Write(dynamic obj)
{
    object result = GetFooValue(obj);
    if (result != null) Console.WriteLine(result);
}

static T      GetFooValue<T>(Foo<T> foo) => foo.Value;
static object GetFooValue(object foo)    => null;
```

`GetFooValue`를 `object` 매개변수로도 오버로드했다는 점이 핵심이다. 이것이 **모든 타입에 대한 폴백**이 된다. 런타임에 C# 동적 바인더가 동적 인수로 `GetFooValue`를 호출할 때 가장 좋은 오버로드를 고른다. 문제의 객체가 `Foo<T>` 기반이 아니면 예외를 던지는 대신 `object` 매개변수 오버로드를 선택한다.

> **📌 예외를 잡는 쪽이 나은 경우도 있다**
>
> 대안으로 첫 번째 `GetFooValue` 오버로드만 만들고 `RuntimeBinderException`을 잡는 방법도 있다. 장점은 **`foo.Value`가 `null`인 경우를 구분할 수 있다**는 것이다. 단점은 예외를 던지고 잡는 성능 부담을 진다는 것이다.

이 기법의 실전 예를 보자. `IEnumerable`이나 `IGrouping<,>` 같은 객체를 이해하는 더 강력한 `ToString()`을 만드는 문제다. 57.8절에서 같은 문제를 리플렉션으로 훨씬 많은 수고를 들여 풀었다. 동적 바인딩 버전은 이렇게 우아하다.

```csharp
static string GetGroupKey<TKey, TElement>(IGrouping<TKey, TElement> group)
    => "Group with key=" + group.Key + ": ";

static string GetGroupKey(object source) => null;

public static string ToStringEx(object value)
{
    if (value == null) return "<null>";
    if (value is string s) return s;
    if (value.GetType().IsPrimitive) return value.ToString();

    StringBuilder sb = new StringBuilder();

    string groupKey = GetGroupKey((dynamic)value);      // 동적 디스패치
    if (groupKey != null) sb.Append(groupKey);

    if (value is IEnumerable)
        foreach (object element in ((IEnumerable)value))
            sb.Append(ToStringEx(element) + " ");

    if (sb.Length == 0) sb.Append(value.ToString());

    return "\r\n" + sb.ToString();
}
```

실행해보면 이렇다.

```csharp
Console.WriteLine(ToStringEx("xyyzzz".GroupBy(c => c)));

// Group with key=x: x
// Group with key=y: y y
// Group with key=z: z z z
```

> **⚠️ 왜 `d.Key`가 아니라 오버로드 해석이어야 했는가**
>
> 다음처럼 썼다면 실패한다.
>
> ```csharp
> dynamic d = value;
> try { groupKey = d.Key; }
> catch (RuntimeBinderException) { /* ... */ }
> ```
>
> LINQ의 `GroupBy` 연산자가 반환하는 타입은 `IGrouping<,>`를 구현하지만 **그 타입 자체가 `internal`이라 접근할 수 없기** 때문이다.
>
> ```csharp
> internal class Grouping : IGrouping<TKey, TElement>, ...
> {
>     public TKey Key;
>     // ...
> }
> ```
>
> `Key` 속성이 `public`으로 선언되어 있어도 그것을 담은 클래스가 `internal`이므로 접근 가능 범위는 `internal`로 제한된다. 결국 `IGrouping<,>` 인터페이스를 통해서만 접근할 수 있는데, 59.6절에서 본 것처럼 **동적 멤버를 호출할 때 DLR에게 특정 인터페이스로 바인딩하라고 지시할 방법은 없다.** 반면 오버로드 폴백 방식은 `GetGroupKey<TKey,TElement>(IGrouping<TKey,TElement>)`라는 **정적으로 알려진 시그니처**에 바인딩하므로 인터페이스 지정 문제가 발생하지 않는다.

### 2026년의 대안 — 패턴 매칭과 비교하면

방문자 패턴 문제를 지금 다시 푼다면 `switch` 식과 타입 패턴을 먼저 검토해야 한다(77.12절).

```csharp
static XElement ToXElement(Person p)
{
    XElement xe = new XElement("Person",
        new XAttribute("Type", p.GetType().Name),
        new XElement("FirstName", p.FirstName),
        new XElement("LastName", p.LastName),
        p.Friends.Select(ToXElement));

    switch (p)
    {
        case Customer c: xe.Add(new XElement("CreditLimit", c.CreditLimit)); break;
        case Employee e: xe.Add(new XElement("Salary", e.Salary));           break;
    }
    return xe;
}
```

두 방식의 성질은 이렇게 갈린다.

| 항목 | 동적 오버로드 해석 | `switch` + 타입 패턴 |
|---|---|---|
| 새 파생 타입 추가 시 | 오버로드 하나 추가, 나머지 코드 무변경 | `switch` 팔 하나 추가 — **모든 `switch`를 찾아 고쳐야 한다** |
| 누락 감지 | 런타임 (`RuntimeBinderException` 또는 폴백으로 조용히 흡수) | 컴파일러 경고 가능(완전성 검사, 77.14절) |
| 성능 | 호출 사이트 캐시 적중 시 수십 ns | `isinst` 연쇄, 수 ns |
| AOT / 트리밍 | 사용 불가 (59.10절) | 정상 |
| 오버로드 규칙 | C# 오버로드 해석 전체 규칙이 적용 — 미묘한 결과 가능 | 위에서 아래로 순서대로 — 예측 가능 |
| 인수 두 개 이상의 다중 디스패치 | **자연스럽게 지원** | 중첩 `switch` 또는 튜플 패턴 필요 |

> **💡 언제 동적 디스패치가 여전히 낫나**
>
> 판단 기준은 **디스패치 축의 개수**다.
>
> - 축이 하나(수신자 타입만)라면 → 가상 메서드나 패턴 매칭이 낫다. 정적이고 빠르고 완전성 검사를 받는다.
> - 축이 둘 이상(예: 충돌 처리기 `Collide(Shape a, Shape b)`, 연산자 디스패치)이라면 → 정적 코드로는 오버로드 조합이 폭발한다. 이때 `(dynamic)` 캐스트 한 번이 코드를 극적으로 줄인다.
> - 대상 타입이 **내 통제 밖**이고 계층이 자주 바뀐다면 → 동적 디스패치의 "코드 무변경" 성질이 값어치를 한다.
>
> 다만 세 경우 모두 Native AOT나 트리밍이 필요한 프로젝트에서는 선택지에서 빠진다. 그때는 소스 생성기(57.15절)로 디스패치 표를 컴파일 타임에 만드는 방법을 검토한다.

---

## 59.8 사용자 정의 바인딩 — `DynamicObject`, `ExpandoObject`

### 프로토콜의 시작점 — `IDynamicMetaObjectProvider`

객체는 `IDynamicMetaObjectProvider`를 구현해서 자기 자신의 바인딩 의미를 제공할 수 있다. 이 인터페이스에는 메서드가 하나뿐이다.

```csharp
public interface IDynamicMetaObjectProvider
{
    DynamicMetaObject GetMetaObject(Expression parameter);
}
```

C# 런타임 바인더는 동적 연산을 해석할 때 먼저 객체의 런타임 타입이 이 인터페이스를 구현하는지 검사한다. 구현한다면 `GetMetaObject`를 호출하고, 반환된 `DynamicMetaObject` 파생 타입이 그 객체에 대한 모든 멤버·메서드·연산자 바인딩을 처리한다. 구현하지 않는다면, C# 바인더는 그 객체를 평범한 C# 타입 인스턴스로 취급하고 리플렉션으로 연산을 수행한다.

`DynamicMetaObject`를 직접 구현하는 것은 상당한 작업이다. 반환하는 것이 값이 아니라 **식 트리 + 바인딩 제약**이기 때문이다. 훨씬 쉬운 길은 `DynamicObject`를 상속하는 것이다. `DynamicObject`가 이 인터페이스의 기본 구현을 제공한다.

### `DynamicObject`의 가상 메서드

```csharp
dynamic d = new Duck();
d.Quack();      // Quack method was called
d.Waddle();     // Waddle method was called

public class Duck : DynamicObject
{
    public override bool TryInvokeMember(
        InvokeMemberBinder binder, object[] args, out object result)
    {
        Console.WriteLine(binder.Name + " method was called");
        result = null;
        return true;
    }
}
```

`TryInvokeMember`를 재정의하면 소비자가 동적 객체에 대해 메서드를 호출할 수 있게 된다. `DynamicObject`는 다른 프로그래밍 구성 요소를 위한 가상 메서드도 노출한다. C#에 표현이 있는 구성 요소와의 대응은 다음과 같다.

| 메서드 | 대응하는 프로그래밍 구성 요소 | C# 예 |
|---|---|---|
| `TryInvokeMember` | 메서드 | `d.Quack(1, 2)` |
| `TryGetMember` / `TrySetMember` | 속성 또는 필드 | `d.Name` / `d.Name = "x"` |
| `TryGetIndex` / `TrySetIndex` | 인덱서 | `d[0]` / `d[0] = "x"` |
| `TryUnaryOperation` | `!` 같은 단항 연산자 | `-d`, `!d` |
| `TryBinaryOperation` | `==` 같은 이항 연산자 | `d + d` |
| `TryConvert` | 다른 타입으로의 변환(캐스트) | `(int)d` |
| `TryInvoke` | 객체 자신에 대한 호출 | `d("foo")` |
| `TryCreateInstance` | 인스턴스 생성 | 동적 언어에서 사용 |
| `TryDeleteMember` / `TryDeleteIndex` | 멤버·인덱스 삭제 | C#에는 대응 문법 없음 (Python `del`) |
| `GetDynamicMemberNames` | 멤버 이름 열거 | 디버거·동적 언어가 사용 |

이 메서드들은 성공하면 `true`를 반환해야 한다. **`false`를 반환하면 DLR은 언어 바인더로 폴백해 `DynamicObject`(서브클래스) 자신에게 일치하는 멤버가 있는지 찾는다.** 그것도 실패하면 `RuntimeBinderException`이 발생한다.

> **⚠️ `false` 반환은 "실패"가 아니라 "폴백 요청"이다**
>
> `TryGetMember`에서 `false`를 반환하면 예외가 나는 게 아니라 **서브클래스에 실제로 정의된 멤버를 찾는 단계로 넘어간다.** 이것을 이용하면 "실제 멤버가 있으면 그것을 쓰고, 없으면 동적으로 만들어내는" 하이브리드 객체를 만들 수 있다. 반대로 말하면, `TryGetMember`가 무조건 `true`를 반환하도록 짜면 **서브클래스의 실제 멤버가 영원히 가려진다.**

> **⚠️ 정적 타입으로 참조하면 `Try*`는 호출되지 않는다**
>
> ```csharp
> Duck duck = new Duck();
> duck.Quack();       // 컴파일 오류 — Duck에는 Quack이 없다
>
> dynamic d = duck;
> d.Quack();          // 동작
> ```
>
> 커스텀 바인딩은 **동적 바인딩 경로를 탈 때만** 작동한다. 변수를 `DynamicObject` 파생 타입으로 선언하면 평범한 정적 바인딩이 일어나고 `Try*` 메서드는 호출되지 않는다. `dynamic`으로 선언하거나 `(dynamic)`으로 캐스트해야 한다.

### `TryGetMember` / `TrySetMember` — XML 특성 래퍼

`XElement`(`System.Xml.Linq`)의 특성에 동적으로 접근하는 클래스로 두 메서드를 예시할 수 있다.

```csharp
using System.Dynamic;
using System.Xml.Linq;

static class XExtensions
{
    public static dynamic DynamicAttributes(this XElement e) => new XWrapper(e);

    class XWrapper : DynamicObject
    {
        XElement _element;
        public XWrapper(XElement e) { _element = e; }

        public override bool TryGetMember(GetMemberBinder binder,
                                          out object result)
        {
            result = _element.Attribute(binder.Name).Value;
            return true;
        }

        public override bool TrySetMember(SetMemberBinder binder, object value)
        {
            _element.SetAttributeValue(binder.Name, value);
            return true;
        }
    }
}
```

사용법은 이렇다.

```csharp
XElement x = XElement.Parse(@"<Label Text=""Hello"" Id=""5""/>");
dynamic da = x.DynamicAttributes();

Console.WriteLine(da.Id);       // 5
da.Text = "Foo";
Console.WriteLine(x.ToString()); // <Label Text="Foo" Id="5" />
```

> **⚠️ 없는 특성을 읽으면 `NullReferenceException`이 난다**
>
> 위 `TryGetMember`는 `_element.Attribute(binder.Name)`이 `null`을 반환할 가능성을 처리하지 않았다. `da.NoSuchAttribute`는 `RuntimeBinderException`이 아니라 `NullReferenceException`을 던진다. 커스텀 바인딩에서 발생하는 예외는 **바인딩 예외가 아니라 당신 코드의 예외**다. 실무 코드라면 이렇게 써야 한다.
>
> ```csharp
> public override bool TryGetMember(GetMemberBinder binder, out object result)
> {
>     XAttribute a = _element.Attribute(binder.Name);
>     result = a?.Value;
>     return a != null;      // 없으면 false → 폴백 → RuntimeBinderException
> }
> ```

### 데이터 리더 래퍼

`System.Data.IDataRecord`에 대해서도 같은 일을 하면 데이터 리더를 쓰기가 훨씬 편해진다.

```csharp
using System.Data;
using System.Dynamic;

public class DynamicReader : DynamicObject
{
    readonly IDataRecord _dataRecord;
    public DynamicReader(IDataRecord dr) { _dataRecord = dr; }

    public override bool TryGetMember(GetMemberBinder binder, out object result)
    {
        result = _dataRecord[binder.Name];
        return true;
    }
}

// 사용
using (IDataReader reader = someDbCommand.ExecuteReader())
{
    dynamic dr = new DynamicReader(reader);
    while (reader.Read())
    {
        int id           = dr.ID;
        string firstName = dr.FirstName;
        DateTime dob     = dr.DateOfBirth;
        // ...
    }
}
```

> **💡 마이크로 ORM이 하는 일이 바로 이것이다**
>
> Dapper의 `Query()`가 반환하는 `dynamic` 행 객체가 정확히 이 패턴이다. 다만 Dapper는 `DynamicObject`를 그대로 쓰지 않고 자체 `IDynamicMetaObjectProvider` 구현을 두어 컬럼 조회를 최적화한다. 프로덕션에서 이 패턴이 필요하다면 직접 만들기 전에 검증된 라이브러리를 먼저 검토하는 편이 낫다.

### 연산자와 호출 가로채기

`TryBinaryOperation`과 `TryInvoke`는 이렇게 쓴다.

```csharp
dynamic d = new Duck();
Console.WriteLine(d + d);           // foo
Console.WriteLine(d(78, 'x'));      // 123

public class Duck : DynamicObject
{
    public override bool TryBinaryOperation(BinaryOperationBinder binder,
                                            object arg, out object result)
    {
        Console.WriteLine(binder.Operation);    // Add
        result = "foo";
        return true;
    }

    public override bool TryInvoke(InvokeBinder binder,
                                   object[] args, out object result)
    {
        Console.WriteLine(args[0]);             // 78
        result = 123;
        return true;
    }
}
```

`binder.Operation`은 `System.Linq.Expressions.ExpressionType` 열거형 값이다(`Add`, `Subtract`, `Equal`, `LessThan` 등). 31장에서 본 식 트리 노드 종류와 같은 열거형이라는 점이 DLR과 식 트리의 관계를 다시 보여준다.

`DynamicObject`는 동적 언어를 위한 가상 메서드도 노출한다. 특히 `GetDynamicMemberNames`를 재정의하면 동적 객체가 제공하는 모든 멤버 이름 목록을 반환할 수 있다.

> **📌 `GetDynamicMemberNames`를 구현할 또 하나의 이유**
>
> Visual Studio 디버거가 이 메서드를 사용해 동적 객체의 뷰를 표시한다. 구현하지 않으면 디버거의 조사식 창에서 동적 멤버가 보이지 않아 디버깅이 크게 불편해진다. 구현 비용이 낮으니 항상 넣는 편이 좋다.

### 완전한 동작 예제 — 대소문자 무시 설정 객체

지금까지의 조각을 모아 실제로 쓸 만한 것을 하나 만들어보자. 대소문자를 구분하지 않고, 없는 키를 읽으면 기본값을 주고, 인덱서로도 접근할 수 있고, 멤버 목록을 디버거에 노출하는 설정 객체다.

```csharp
using System;
using System.Collections.Generic;
using System.Dynamic;

public sealed class Settings : DynamicObject
{
    readonly Dictionary<string, object> _map =
        new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

    readonly object _fallback;

    public Settings(object fallback = null) { _fallback = fallback; }

    public override bool TryGetMember(GetMemberBinder binder, out object result)
    {
        if (_map.TryGetValue(binder.Name, out result)) return true;
        result = _fallback;
        return true;                      // 없어도 폴백 값을 준다
    }

    public override bool TrySetMember(SetMemberBinder binder, object value)
    {
        _map[binder.Name] = value;
        return true;
    }

    public override bool TryDeleteMember(DeleteMemberBinder binder)
        => _map.Remove(binder.Name);

    public override bool TryGetIndex(GetIndexBinder binder,
                                     object[] indexes, out object result)
    {
        result = _fallback;
        if (indexes.Length != 1 || indexes[0] is not string key) return false;
        if (_map.TryGetValue(key, out object v)) result = v;
        return true;
    }

    public override bool TrySetIndex(SetIndexBinder binder,
                                     object[] indexes, object value)
    {
        if (indexes.Length != 1 || indexes[0] is not string key) return false;
        _map[key] = value;
        return true;
    }

    public override IEnumerable<string> GetDynamicMemberNames() => _map.Keys;
}
```

```csharp
dynamic s = new Settings(fallback: "(none)");
s.Timeout = 30;
s.RETRIES = 3;

Console.WriteLine(s.timeout);       // 30      — 대소문자 무시
Console.WriteLine(s["Retries"]);    // 3       — 인덱서
Console.WriteLine(s.Missing);       // (none)  — 폴백
```

`TryConvert`를 추가로 재정의하면 `(IDictionary<string, object>)s` 같은 캐스트도 가로챌 수 있다. `binder.Type`이 캐스트 대상 타입이고, `binder.Explicit`으로 명시적 캐스트인지 암시적 변환인지 구분한다.

> **⚠️ `override` 키워드를 빼먹으면 조용히 무시된다**
>
> `DynamicObject`를 상속할 때 가장 흔한 실수다. `public bool TrySetIndex(SetIndexBinder binder, ...)`처럼 `override` 없이 쓰면 그것은 그냥 새 메서드이고, DLR은 기반 클래스의 구현(항상 `false` 반환)을 호출한다. 결과적으로 `s["key"] = 1`이 아무 설명 없이 `RuntimeBinderException`을 낸다. CS0114 숨김 경고가 나긴 하지만 경고를 억제해둔 프로젝트에서는 놓치기 쉽다.

> **⚠️ 실제 멤버와 동적 멤버의 우선순위는 당신이 정한다**
>
> 위 `TryGetMember`는 키가 없어도 `true`를 반환하므로 **`Settings`에 실제로 정의된 어떤 public 멤버도 동적 접근 경로에서는 가려진다.** 실제 멤버를 우선하고 싶다면 딕셔너리에 없을 때 `false`를 반환해 언어 바인더로 폴백시켜야 한다. 어느 쪽이 옳은지는 설계 의도에 달렸지만, **선택을 하고 있다는 자각**은 반드시 필요하다.

### `ExpandoObject`

`DynamicObject`의 또 다른 단순한 응용은 문자열을 키로 딕셔너리에 객체를 저장하고 꺼내는 동적 클래스를 만드는 것이다. 그런데 이 기능은 **`ExpandoObject` 클래스로 이미 제공된다.**

```csharp
dynamic x = new ExpandoObject();
x.FavoriteColor  = ConsoleColor.Green;
x.FavoriteNumber = 7;

Console.WriteLine(x.FavoriteColor);     // Green
Console.WriteLine(x.FavoriteNumber);    // 7
```

`ExpandoObject`는 `IDictionary<string, object>`를 구현한다. 그래서 예제를 이어서 이렇게 쓸 수 있다.

```csharp
var dict = (IDictionary<string, object>)x;
Console.WriteLine(dict["FavoriteColor"]);   // Green
Console.WriteLine(dict["FavoriteNumber"]);  // 7
Console.WriteLine(dict.Count);              // 2
```

`ExpandoObject`가 구현하는 인터페이스는 정확히 세 개다.

| 인터페이스 | 용도 |
|---|---|
| `IDynamicMetaObjectProvider` | `dynamic`으로 접근할 때의 바인딩 |
| `IDictionary<string, object>` | 정적으로 키·값을 열거하고 조작 (`IEnumerable<KeyValuePair<string,object>>` 포함) |
| `INotifyPropertyChanged` | 멤버가 추가·변경될 때 알림 — 데이터 바인딩용 |

`INotifyPropertyChanged` 덕분에 UI 데이터 바인딩 대상으로 쓸 수 있다.

```csharp
dynamic person = new ExpandoObject();
((INotifyPropertyChanged)person).PropertyChanged +=
    (s, e) => Console.WriteLine($"changed: {e.PropertyName}");

person.Name = "Ada";        // changed: Name
person.Name = "Grace";      // changed: Name

var bag = (IDictionary<string, object>)person;
bag.Remove("Name");         // changed: Name
Console.WriteLine(bag.Count);   // 0
```

> **⚠️ `ExpandoObject`의 스레드 안전성은 제한적이다**
>
> 구현은 내부 잠금 객체를 두고 멤버 추가·변경·삭제를 그 잠금 아래에서 수행한다. 따라서 개별 연산 하나가 상태를 깨뜨리지는 않는다. 그러나 **읽고-판단하고-쓰는 복합 연산은 원자적이지 않고**, `IDictionary` 뷰의 열거 중 다른 스레드가 멤버를 추가하는 것도 보호되지 않는다. 문서 역시 인스턴스 멤버의 스레드 안전성을 보장하지 않는다. 공유가 필요하면 외부에서 잠금을 걸거나 불변 스냅숏을 만들어야 한다.
>
> 또한 `ExpandoObject`는 멤버 하나당 문자열 키와 값 슬롯을 소비한다. 필드가 정해진 데이터를 수만 개 만들 자리라면 레코드(`record`)나 클래스가 메모리와 속도 양쪽에서 압도적으로 낫다.

### 정적 멤버를 동적으로 호출하기

`dynamic`의 한계 중 하나는 **인스턴스 멤버에만 쓸 수 있다**는 것이다. `dynamic` 변수는 객체를 참조해야 하기 때문이다. 하지만 런타임에 결정되는 타입의 정적 멤버를 동적으로 호출하고 싶을 때가 있다. `DynamicObject` 래퍼로 흉내 낼 수 있다.

```csharp
using System.Collections.Generic;
using System.Dynamic;
using System.Linq;
using System.Reflection;

internal sealed class StaticMemberDynamicWrapper : DynamicObject
{
    private readonly TypeInfo _type;

    public StaticMemberDynamicWrapper(Type type) { _type = type.GetTypeInfo(); }

    public override IEnumerable<string> GetDynamicMemberNames()
        => _type.DeclaredMembers.Select(mi => mi.Name);

    public override bool TryGetMember(GetMemberBinder binder, out object result)
    {
        result = null;
        FieldInfo field = _type.DeclaredFields.FirstOrDefault(
            fi => fi.IsPublic && fi.IsStatic && fi.Name == binder.Name);
        if (field == null) return false;
        result = field.GetValue(null);
        return true;
    }

    public override bool TryInvokeMember(InvokeMemberBinder binder,
                                         object[] args, out object result)
    {
        MethodInfo method = _type.DeclaredMethods.FirstOrDefault(
            mi => mi.IsPublic && mi.IsStatic && mi.Name == binder.Name &&
                  mi.GetParameters().Length == args.Length);

        if (method == null) { result = null; return false; }

        result = method.Invoke(null, args);
        return true;
    }
}
```

조작하고 싶은 `Type`을 생성자에 넘겨 인스턴스를 만들고 `dynamic` 변수에 담은 뒤, 원하는 정적 멤버를 **인스턴스 멤버 문법으로** 호출한다.

```csharp
dynamic stringType = new StaticMemberDynamicWrapper(typeof(string));
var r = stringType.Concat("A", "B");    // String.Concat(string, string) 호출
Console.WriteLine(r);                   // AB
```

> **⚠️ 이 래퍼는 `dynamic`의 성능 이점을 얻지 못한다**
>
> 내부적으로 매 호출이 `MethodInfo.Invoke`이므로 호출 사이트 캐싱의 이득이 없다. 게다가 위 `TryInvokeMember`의 메서드 검색이 인수 **개수**만 비교하므로 `string.Concat`처럼 오버로드가 많은 메서드에서는 잘못된 오버로드가 선택되어 `ArgumentException`이 날 수 있다. 인수 타입까지 비교하는 로직이 추가로 필요하다. 정적 멤버를 반복 호출해야 한다면 57.13절의 델리게이트 컴파일이 훨씬 낫다.

---

## 59.9 동적 언어와 상호운용, C#과 스크립트 사이 상태 전달

### C#은 문자열을 실행할 수 없다

C#은 `dynamic` 키워드로 동적 바인딩을 지원하지만, **문자열로 기술된 식을 런타임에 실행하는 데까지 나아가지는 않는다.**

```csharp
string expr = "2 * 3";
// expr을 "실행"할 방법이 없다
```

문자열을 식 트리로 번역하려면 어휘 분석기와 의미 분석기가 필요하기 때문이다. 이 기능은 C# 컴파일러에 내장되어 있고 런타임 서비스로는 제공되지 않는다. 런타임에 C#이 제공하는 것은 **바인더**뿐이다. 바인더는 이미 만들어진 식 트리를 DLR이 어떻게 해석해야 하는지 지시할 뿐이다.

IronPython, IronRuby 같은 **진짜 동적 언어**는 임의의 문자열을 실행할 수 있다. 스크립팅, 동적 설정 시스템, 동적 규칙 엔진 구현 같은 작업에 유용하다. 그래서 애플리케이션의 대부분을 C#으로 작성하더라도 이런 작업을 위해 동적 언어를 불러 쓰는 것이 도움이 될 수 있다. 또한 .NET 라이브러리에 동등한 기능이 없는 API가 동적 언어로 작성되어 있다면 그것을 쓰고 싶을 수도 있다.

> **📌 Roslyn 스크립팅이라는 대안**
>
> NuGet 패키지 `Microsoft.CodeAnalysis.CSharp.Scripting`은 C# 문자열을 실행하는 API를 제공한다. 다만 실행 방식이 **코드를 프로그램으로 먼저 컴파일하는 것**이라, 같은 식을 반복 실행할 의도가 아니라면 컴파일 오버헤드 때문에 Python 상호운용보다 느리다.
>
> ```csharp
> using Microsoft.CodeAnalysis.CSharp.Scripting;
>
> int result = await CSharpScript.EvaluateAsync<int>("2 * 3");   // 6
> ```
>
> 반대로 같은 스크립트를 수천 번 실행한다면 컴파일 비용이 상각되어 Roslyn 쪽이 유리하다.

### IronPython 호스팅

다음 예제는 C# 안에서 런타임에 만들어진 식을 IronPython으로 평가한다. 계산기를 만드는 스크립트라고 보면 된다.

이 코드를 실행하려면 NuGet 패키지 `DynamicLanguageRuntime`(`System.Dynamic.Runtime` 패키지와 혼동하지 말 것)과 `IronPython`을 애플리케이션에 추가해야 한다.

```csharp
using System;
using IronPython.Hosting;
using Microsoft.Scripting;
using Microsoft.Scripting.Hosting;

int result = (int)Calculate("2 * 3");
Console.WriteLine(result);      // 6

object Calculate(string expression)
{
    ScriptEngine engine = Python.CreateEngine();
    return engine.Execute(expression);
}
```

문자열을 Python에 넘기는 것이므로, 식은 C#이 아니라 **Python의 규칙**에 따라 평가된다. 그래서 Python의 언어 기능을 쓸 수 있다. 리스트가 대표적이다.

```csharp
var list = (IEnumerable)Calculate("[1, 2, 3] + [4, 5]");
foreach (int n in list) Console.Write(n);       // 12345
```

C#에서 `+`는 리스트 연결이 아니지만 Python에서는 연결이다. 59.1절에서 본 "의미는 바인더가 정한다"는 원칙이 언어 호스팅 수준에서도 똑같이 적용된다.

### C#과 스크립트 사이 상태 전달

C#에서 Python으로 변수를 전달하려면 단계가 몇 개 더 필요하다. 다음 예제는 그 단계를 보여주며, 규칙 엔진의 기초로 삼을 만하다.

```csharp
// 다음 문자열은 파일이나 데이터베이스에서 올 수 있다
string auditRule = "taxPaidLastYear / taxPaidThisYear > 2";

ScriptEngine engine = Python.CreateEngine();
ScriptScope scope = engine.CreateScope();

scope.SetVariable("taxPaidLastYear", 20000m);
scope.SetVariable("taxPaidThisYear", 8000m);

ScriptSource source = engine.CreateScriptSourceFromString(
    auditRule, SourceCodeKind.Expression);

bool auditRequired = (bool)source.Execute(scope);
Console.WriteLine(auditRequired);       // True
```

`GetVariable`을 호출하면 변수를 되받을 수도 있다.

```csharp
string code = "result = input * 3";

ScriptEngine engine = Python.CreateEngine();
ScriptScope scope = engine.CreateScope();
scope.SetVariable("input", 2);

ScriptSource source = engine.CreateScriptSourceFromString(
    code, SourceCodeKind.SingleStatement);
source.Execute(scope);

Console.WriteLine(scope.GetVariable("result"));     // 6
```

두 번째 예제에서 `SourceCodeKind.Expression`이 아니라 `SourceCodeKind.SingleStatement`를 지정한 것에 주목하라. 엔진에게 "식이 아니라 문(statement)을 실행하겠다"고 알리는 것이다.

| `SourceCodeKind` | 의미 |
|---|---|
| `Expression` | 단일 식 — 값을 반환한다 |
| `SingleStatement` | 단일 문 — 스코프에 부작용만 남긴다 |
| `Statements` | 여러 문 |
| `File` | 파일 하나 전체 |
| `InteractiveCode` | 대화형 셸 입력 |
| `AutoDetect` | 자동 판별 |

타입은 .NET과 Python 세계 사이에서 자동으로 마샬링된다. 스크립트 쪽에서 .NET 객체의 멤버에 접근하는 것도 가능하다.

```csharp
string code = @"sb.Append(""World"")";

ScriptEngine engine = Python.CreateEngine();
ScriptScope scope = engine.CreateScope();

var sb = new StringBuilder("Hello");
scope.SetVariable("sb", sb);

ScriptSource source = engine.CreateScriptSourceFromString(
    code, SourceCodeKind.SingleStatement);
source.Execute(scope);

Console.WriteLine(sb.ToString());       // HelloWorld
```

반대로 Python이 만든 함수를 C#에서 `dynamic`으로 받아 호출할 수도 있다. 이때 Python 객체는 `IDynamicMetaObjectProvider`를 구현하므로 **커스텀 바인딩 경로**를 타고, C# 바인더가 아니라 Python 바인더가 호출 의미를 결정한다.

```csharp
var engine = Python.CreateEngine();
var scope = engine.CreateScope();

engine.Execute(@"
def greetings(name):
    return 'Hello ' + name.title() + '!'
", scope);

dynamic greetings = scope.GetVariable("greetings");
Console.WriteLine(greetings("world"));      // Hello World!
```

### IronPython / IronRuby의 현재 상태 ※

2026년 기준으로 이 생태계의 상태를 정확히 알아둘 필요가 있다.

| 프로젝트 | 상태 | 비고 |
|---|---|---|
| **DLR** (`DynamicLanguageRuntime` 패키지) | 유지보수 중 | Microsoft가 아니라 커뮤니티(IronLanguages 조직)가 관리. 원래 CodePlex에 있던 것을 GitHub로 이관 |
| **IronPython 3** | 활발하지는 않으나 개발 진행 중 | 대상은 **Python 3.4** 수준. 이후 버전의 일부 기능·동작이 포함되기도 한다. `.msi`, `.zip`, `.deb`, `.pkg`, NuGet으로 배포 |
| **IronPython 2** | 사실상 종료 | Python 2가 EOL이므로 신규 프로젝트에서 쓸 이유가 없다 |
| **IronRuby** | 사실상 중단 | 별도 활발한 릴리스 라인이 없다. 신규 프로젝트에서 선택지로 고려하지 않는 편이 안전하다 |

> **⚠️ IronPython을 "파이썬 라이브러리를 쓰기 위해" 도입하면 안 된다**
>
> IronPython은 CPython과 다른 구현이며, C 확장 모듈(`numpy`, `pandas` 등 네이티브 확장에 의존하는 대부분의 과학 계산 스택)을 그대로 쓸 수 없다. 대상 문법 수준도 Python 3.4대라서 f-문자열 이후의 현대 파이썬 코드가 그대로 돌아간다는 보장이 없다.
>
> IronPython이 여전히 값어치가 있는 용도는 **".NET 애플리케이션에 안전하게 임베드할 수 있는 스크립팅 엔진"** 이다. 파이썬 생태계를 쓰는 것이 목적이라면 CPython 프로세스를 별도로 띄우고 프로세스 간 통신을 하는 편이 현실적이다.

### 어떤 스크립팅 방법을 고를 것인가

| 방법 | 실행 대상 | 첫 실행 비용 | 반복 실행 비용 | AOT | 비고 |
|---|---|---|---|---|---|
| IronPython 호스팅 | Python 문자열 | 엔진 초기화(수백 ms 수준) | 낮음 | 불가 | 완전한 언어. 상태 전달 API가 잘 정리되어 있음 |
| Roslyn 스크립팅 | C# 문자열 | 컴파일(높음) | 델리게이트 캐시 시 매우 낮음 | 불가 | C# 문법 그대로. `ScriptOptions`로 참조·`using` 제어 |
| 식 트리 직접 구성 | 직접 만든 식 트리 | `Compile()` 비용 | 매우 낮음 | 제한적(인터프리터 모드) | 문법 파서를 직접 만들어야 함 (31.6절) |
| 수식 평가 라이브러리 | 제한된 수식 문자열 | 낮음 | 낮음 | 대체로 가능 | 규칙 엔진 용도에는 대개 이쪽이 정답 |
| 소스 생성기 | 컴파일 타임에 확정된 규칙 | 없음(빌드 타임) | 정적 코드와 동일 | 가능 | 규칙이 배포 시점에 고정되는 경우 (57.15절) |

> **⚠️ 신뢰할 수 없는 문자열을 실행하면 그것은 원격 코드 실행이다**
>
> IronPython도 Roslyn 스크립팅도 **임의의 .NET 코드를 실행할 수 있다.** 스크립트 안에서 `System.IO.File.Delete`를 부르거나 `Process.Start`를 호출하는 것을 언어 차원에서 막지 못한다.
>
> .NET Framework 시절에는 부분 신뢰(partial trust) AppDomain으로 격리를 시도할 수 있었지만, **.NET(Core) 이후로 코드 접근 보안(CAS)과 부분 신뢰 샌드박스는 존재하지 않는다.** 사용자 입력에서 온 스크립트를 실행해야 한다면 프로세스 격리, 컨테이너, OS 수준 권한 축소 같은 프로세스 밖의 수단을 써야 한다. 언어 런타임 안에서 해결하려는 시도는 실패한다.

### COM 경로 — `IDispatch`

동적 데이터가 COM 객체를 가리키고 있으면 식 트리는 **`IDispatch`** 라는 저수준 COM 인터페이스로 전달된다. COM이 자체적으로 가진 동적 서비스 집합이다. COM 객체를 `dynamic` 없이 다루는 것도 가능하지만 코드가 훨씬 복잡해진다.

```csharp
// dynamic 없이 — Excel Cells 인덱서가 object를 반환하므로 캐스트가 필요하다
((Range)excel.Cells[1, 1]).Value = "Text in cell A1";

// dynamic으로 — 캐스트 없이
excel.Cells[1, 1].Value = "Text in cell A1";
```

COM 상호운용 어셈블리를 만들 때 COM 메서드의 `VARIANT` 사용은 `dynamic`으로 변환되는데, 이것을 **다이나미피케이션(dynamification)** 이라고 부른다.

> **⚠️ COM 상호운용은 Windows 전용이다**
>
> COM 상호작용은 엄격히 Windows 패러다임이고 애플리케이션의 크로스 플랫폼 능력을 제거한다. `dynamic`으로 COM을 다루는 코드는 Linux·macOS에서 빌드는 되지만 실행 시 실패한다. 자세한 것은 60.12절에서 다룬다.

---

## 59.10 `dynamic`의 한계와 성능 비용

### 무엇이 얼마나 비싼가

4단 원칙의 마지막 단계다. 다음 벤치마크로 실제 비용의 자릿수를 확인한다.

```csharp
using BenchmarkDotNet.Attributes;
using System.Reflection;

public class Calc { public int Add(int x, int y) => x + y; }

public class DispatchBench
{
    readonly Calc _calc = new Calc();
    readonly MethodInfo _mi = typeof(Calc).GetMethod(nameof(Calc.Add));
    dynamic _dyn;

    public DispatchBench() { _dyn = _calc; }

    [Benchmark(Baseline = true)]
    public int Direct() => _calc.Add(10, 70);

    [Benchmark]
    public int Dynamic() => _dyn.Add(10, 70);       // 캐시 적중 경로

    [Benchmark]
    public int Reflection() => (int)_mi.Invoke(_calc, new object[] { 10, 70 });
}
```

측정 결과는 다음과 같다. **절대 수치는 하드웨어·런타임 버전·JIT 상태에 따라 크게 달라지므로 배율만 읽어야 한다.**

| 방식 | 1회 호출 비용 | 직접 호출 대비 | 할당 |
|---|---|---|---|
| 직접 호출 (인라이닝됨) | 0 ns 수준 | — | 없음 |
| 직접 호출 (인라이닝 차단) | 약 1 ns | 1배 | 없음 |
| 열린 델리게이트 호출 | 약 1–2 ns | 1~2배 | 없음 |
| **`dynamic` — 캐시 적중(L0)** | **약 15–30 ns** | **20~30배** | 없음(값 형식 인수는 박싱 발생) |
| `dynamic` — L1 순회 (다형) | 약 40–90 ns | 40~90배 | 없음 |
| `dynamic` — L2 순회 (거대다형) | 약 200 ns 이상 | 200배 이상 | 없음 |
| **`dynamic` — 사이트 첫 호출(콜드)** | **수십 μs ~ 수 ms** | 수만 배 이상 | 큼 (식 트리·델리게이트) |
| `MethodInfo.Invoke` (캐시된 `MethodInfo`) | 약 40–120 ns | 40~120배 | `object[]` + 박싱 |
| `Type.GetMethod` + `Invoke` (매번 조회) | 수백 ns | 수백 배 | 큼 |

> **📌 이 숫자를 어떻게 읽어야 하나**
>
> 한 문헌은 "오늘날의 하드웨어에서 단순한 동적 식의 일반적인 오버헤드는 100 ns 미만"이라고 서술한다. 위 표의 캐시 적중 행이 그 주장과 일치한다. **핵심은 세 가지다.**
>
> 1. 캐시가 적중하면 `dynamic`은 리플렉션보다 **빠르다.** 이것이 `dynamic`을 리플렉션 대신 쓸 근거가 된다.
> 2. 그래도 직접 호출보다 **20배 이상** 느리다. 뜨거운 루프에 넣을 물건이 아니다.
> 3. 첫 호출은 자릿수가 다르다. 사이트 하나당 한 번뿐이지만, 사이트가 수백 개면 시작 시간에 그대로 반영된다.
>
> `MethodInfo.Invoke`는 ※.NET 7~8 에 걸쳐 호출 경로가 재작성되어(※.NET 8 에서는 `MethodInvoker`도 추가됐다, 57.13절) 이전보다 크게 빨라졌다. 오래된 벤치마크 수치(수백 ns~1 μs)를 근거로 "`dynamic`이 리플렉션보다 10배 빠르다"고 말하는 자료는 현재 런타임에서는 과장이다. 실제 격차는 몇 배 수준이다.

### 첫 호출 비용의 내역

`dynamic` 사이트의 첫 호출에서 실제로 무슨 일이 일어나는지 분해하면 이렇다.

- **프로세스 전체에서 최초 1회** — `Microsoft.CSharp.dll` 로드(+JIT), `System.Linq.Expressions.dll` 로드, 바인더 인프라 초기화.
- **사이트마다 1회** — `CallSiteBinder` 생성 → `CallSite<T>.Create`로 업데이트 델리게이트 생성(식 트리 → `Compile()`) → 첫 바인딩(리플렉션으로 후보 수집 → C# 오버로드 해석 → 규칙을 식 트리로 구성 → `Compile()` → `DynamicMethod` 방출 → JIT).
- **새 런타임 타입을 볼 때마다 1회** — 위의 "첫 바인딩"을 반복. 기존 규칙은 캐시에 남는다.

식 트리 컴파일 결과인 `DynamicMethod`는 **익명 호스팅 동적 메서드 어셈블리(Anonymously Hosted DynamicMethods Assembly)** 라는 메모리 내 어셈블리에 놓인다. 이름은 .NET Framework 시절 진단 도구에서 자주 보이던 것이지만, 동적 메서드로 방출된 코드가 별도의 메모리 내 컨테이너에 놓인다는 사실 자체는 지금도 같다. 이 코드는 **JIT 대상이고, 언로드되지 않으며, 메모리를 점유한다.**

> **⚠️ `dynamic`은 메모리를 되돌려주지 않는다**
>
> 호출 사이트는 컴파일러 생성 클래스의 **정적 필드**에 저장된다(59.3절). 정적 필드는 그 타입을 담은 어셈블리 로드 컨텍스트가 살아 있는 한 수집되지 않는다. 사이트가 붙들고 있는 규칙 델리게이트와 그 배후의 동적 메서드도 마찬가지다.
>
> 즉 **한 번 실행된 동적 호출 사이트가 쓰는 메모리는 프로세스 수명 동안 회수되지 않는다.** 대부분의 애플리케이션에서는 문제가 아니지만, 플러그인을 반복 로드·언로드하는 구조(52.12절의 수집 가능 ALC)에서는 누수처럼 보이는 증가를 만들 수 있다.

### Native AOT와 트리밍 — 여기서 `dynamic`은 끝난다

이 절이 2026년에 `dynamic`을 판단하는 데 가장 중요하다.

`Microsoft.CSharp.RuntimeBinder.Binder`의 **모든 팩토리 메서드**에는 두 특성이 붙어 있다. `[RequiresDynamicCode]`는 ※.NET 7 에서 도입된 AOT 분석용 특성이다.

```csharp
[RequiresUnreferencedCode("Using dynamic types might cause types or members to be removed by trimmer.")]
[RequiresDynamicCode("The 'dynamic' feature requires runtime-code generation, which is incompatible with AOT.")]
public static CallSiteBinder BinaryOperation(...)
```

`CallSite<T>.Create`에도 `[RequiresDynamicCode]`가 붙어 있다. 결과적으로 `dynamic`을 쓰는 코드는 다음과 같이 취급된다.

| 배포 모드 | 결과 |
|---|---|
| 일반 JIT 배포 | 정상 동작 |
| 트리밍 활성화 (`PublishTrimmed=true`) | **IL2026 경고**. 동적으로만 참조되는 타입·멤버가 잘려나갈 수 있다. 잘리면 런타임에 `RuntimeBinderException` |
| ReadyToRun | 동작 (JIT 폴백이 남아 있음) |
| **Native AOT (`PublishAot=true`)** ※.NET 7+ | **IL3050 경고**. `dynamic`은 지원되지 않는다 |

> **⚠️ 트리밍에서 `dynamic`이 깨지는 방식은 조용하다**
>
> 트리머는 **정적으로 참조되지 않는 것**을 제거한다. `dynamic`으로만 접근하는 멤버는 정적 참조가 없으므로 제거 대상이다. 빌드는 성공하고, 경고는 IL2026 하나뿐이며, 실패는 배포 후 그 코드 경로가 처음 실행될 때 `RuntimeBinderException`으로 나타난다.
>
> `[DynamicallyAccessedMembers]`로 보존을 지시하는 방법(57.14절)은 리플렉션에는 통하지만 `dynamic`에는 잘 통하지 않는다. `dynamic`은 어떤 타입의 어떤 멤버에 접근할지를 특성으로 표현할 지점 자체가 없기 때문이다. 남는 수단은 `ILLink.Descriptors.xml`로 타입 전체를 보존하는 것인데, 그러면 트리밍의 이득이 사라진다.

> **⚠️ Native AOT에서는 실행 자체가 실패한다**
>
> `dynamic`은 런타임 코드 생성을 요구한다. 식 트리를 델리게이트로 컴파일해야 하고, 그것은 IL 방출이며, Native AOT에는 IL을 방출하고 JIT할 수단이 없다. 특성의 메시지가 그대로 그 사실을 말한다 — "The 'dynamic' feature requires runtime-code generation, which is incompatible with AOT."
>
> `System.Linq.Expressions`가 AOT에서 인터프리터 모드로 폴백하는 경로가 있어 **일부** 단순한 동적 연산이 우연히 동작할 수도 있다. 하지만 이것은 보증된 동작이 아니며, 조금만 복잡해지면 실패한다. **AOT 대상 프로젝트에서 `dynamic`은 쓰지 않는다**가 유일하게 안전한 규칙이다. (55.7절)

### 그 밖의 한계

지금까지 흩어져 나온 한계를 한자리에 모은다.

- **람다식·익명 메서드를 동적 호출의 인수로 넘길 수 없다** (CS1977). 대상 메서드가 실제로 델리게이트 매개변수를 받더라도 그렇다. 델리게이트로 명시적 캐스트하면 우회된다.
- **확장 메서드를 확장 메서드 문법으로 호출할 수 없다.** LINQ 연산자가 전부 확장 메서드이므로 **LINQ to Objects를 비롯한 LINQ 기술에서의 활용도가 크게 제한된다.**
- **IntelliSense가 동작하지 않는다.** 철자와 대소문자를 사람이 책임진다.
- **패턴 매칭 대상이 될 수 없고**(CS8208) **분해할 수 없다**(CS8133). 현대 C# 스타일과 잘 맞지 않는다.
- **식 트리에 동적 연산을 넣을 수 없다**(CS1963). 따라서 EF Core 같은 `IQueryable` 기반 라이브러리와 결합할 수 없다.
- **정적 멤버를 직접 호출할 수 없다.** `dynamic` 변수는 객체를 참조해야 한다(59.8절의 래퍼 참조).
- **접근성 규칙을 우회할 수 없다.** 비공개 멤버는 리플렉션의 영역이다.

### 2026년의 선택 기준 ※

같은 문제를 풀 수 있는 수단이 여섯 가지 있다. 어느 것을 골라야 하는가.

| 수단 | 바인딩 시점 | 타입 안전 | 상대 성능 | 트리밍/AOT | 적합한 상황 |
|---|---|---|---|---|---|
| **제네릭 + 정적 추상 멤버** ※C# 11 | 컴파일 타임 | 완전 | 최고 (인라이닝됨) | 완벽 | 타입은 다르지만 **연산의 형태가 같은** 경우. 숫자 일반화(22.8절) |
| **패턴 매칭** (`switch` 식) | 컴파일 타임 | 완전 | 매우 높음 | 완벽 | **닫힌 타입 집합**에 대한 분기. 계층이 안정적일 때 (77장) |
| **소스 생성기** | 컴파일 타임 | 완전 | 정적 코드와 동일 | 완벽 | 규칙이 **빌드 시점에 확정**되는 경우. 직렬화, 매핑, 디스패치 표 (57.15절) |
| **식 트리 + `Compile()`** | 런타임(1회) | 부분 | 컴파일 후 매우 높음 | 제한적 | 런타임에 **한 번 만들고 수없이 호출**하는 경우. 동적 쿼리(31.6절), 매퍼 |
| **`dynamic`** | 런타임(매번, 캐시됨) | 없음 | 중간 | **불가** | 타입이 **정말로** 런타임에만 알려지고, 호출 횟수가 많지 않으며, AOT가 필요 없는 경우 |
| **리플렉션** | 런타임(매번) | 없음 | 낮음 | 제한적(특성 필요) | **접근성을 뚫어야 하거나**, 메타데이터 자체를 조사해야 하는 경우 (57장) |

```text
                  "런타임에 타입이 정해지는 호출을 해야 한다"
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │ 가능한 타입 집합이 컴파일 타임에         │
              │ 확정되는가?                              │
              └────────────────────────────────────────┘
                    │ 예                      │ 아니오
                    ▼                         ▼
        ┌───────────────────────┐  ┌────────────────────────────┐
        │ 연산 형태가 타입별로   │  │ Native AOT / 트리밍이       │
        │ 동일한가?              │  │ 필요한가?                   │
        └───────────────────────┘  └────────────────────────────┘
           │ 예        │ 아니오        │ 예             │ 아니오
           ▼           ▼               ▼                ▼
     ┌──────────┐ ┌──────────┐  ┌──────────────┐ ┌──────────────┐
     │ 제네릭    │ │ 패턴 매칭 │  │ 소스 생성기   │ │ 호출 빈도는?  │
     │ 정적 추상 │ │ switch 식 │  │ 또는 재설계   │ │              │
     └──────────┘ └──────────┘  └──────────────┘ └──────┬───────┘
                                                    낮음 │ 높음
                                                        ▼   ▼
                                          ┌──────────────┐ ┌──────────────┐
                                          │ dynamic      │ │ 식 트리      │
                                          │ (비공개 접근이│ │ Compile()로  │
                                          │  필요하면     │ │ 델리게이트   │
                                          │  리플렉션)    │ │ 캐시         │
                                          └──────────────┘ └──────────────┘
```

> **💡 `dynamic`이 아직 최선인 세 가지 자리**
>
> 위 표를 보면 `dynamic`의 자리가 좁아 보인다. 실제로 좁다. 그래도 남아 있는 자리는 분명히 있다.
>
> 1. **COM 상호운용.** `IDispatch` 경유 호출에서 `dynamic`은 코드를 극적으로 줄인다. Windows 데스크톱 애플리케이션에서 Office 자동화를 다룬다면 여전히 첫 번째 선택이다. (60.12절)
> 2. **다중 디스패치.** 인수 두 개 이상의 타입 조합으로 분기해야 할 때 `(dynamic)` 캐스트 하나가 만들어내는 단순함은 대체하기 어렵다. (59.7절)
> 3. **동적 언어 상호운용.** IronPython 객체를 다룰 때는 애초에 다른 방법이 없다. (59.9절)
>
> 이 세 가지에 해당하지 않으면서 `dynamic`을 쓰고 있다면, 대개 더 나은 도구가 있다.

> **💡 `dynamic`을 도입할 때의 체크리스트**
>
> - [ ] 이 프로젝트는 Native AOT나 트리밍을 쓰지 않는가? (쓴다면 여기서 중단)
> - [ ] 동적 호출이 뜨거운 경로 밖에 있는가?
> - [ ] 하나의 호출 사이트가 보게 될 런타임 타입이 열 가지 이내인가?
> - [ ] 폴백 오버로드나 예외 처리가 준비되어 있는가?
> - [ ] `dynamic` 값이 메서드 경계를 넘어 퍼지지 않도록 즉시 정적 타입으로 변환하는가?
> - [ ] 이 코드 경로를 커버하는 테스트가 있는가? (컴파일러가 검사해주지 않으므로 테스트가 유일한 안전망이다)
>
> 여섯 항목 중 하나라도 아니라면 설계를 다시 봐야 한다.

---

## 이 장의 요약

- **동적 바인딩은 타입·멤버·연산자의 해석을 컴파일 타임에서 런타임으로 미루는 것**이다. 런타임에는 두 갈래로 갈린다 — 대상이 `IDynamicMetaObjectProvider`를 구현하면 **커스텀 바인딩**, 아니면 언어별 바인더가 처리하는 **언어 바인딩**이다.
- **DLR은 "동적인 CLR"이 아니라 CLR 위의 라이브러리**다. 식 트리를 공통 표현으로 삼아 C#·VB·IronPython·IronRuby가 같은 프로토콜로 동적 호출을 하게 만들고, 모든 소비자에게 호출 사이트 캐싱의 이득을 준다.
- **`dynamic`의 런타임 표현은 `object`와 완전히 같다.** 메타데이터에는 `object` + `DynamicAttribute`만 남는다. 그래서 `dynamic`과 `object`만 다른 오버로드는 정의할 수 없고(CS0111), `typeof(dynamic)`은 아예 컴파일되지 않는다(CS1962). `typeof(List<dynamic>) == typeof(List<object>)`는 참이다.
- **컴파일러는 동적 연산마다 `<>o__N.<>p__M` 정적 필드에 `CallSite<T>`를 만들고 `site.Target(site, args...)`를 호출하는 코드를 방출한다.** 바인더는 `Microsoft.CSharp.RuntimeBinder.Binder`가 만들고, 호출 문맥 타입과 인수별 `CSharpArgumentInfo`가 함께 전달된다.
- **캐시는 L0(`Target` 델리게이트) / L1(`CallSite<T>.Rules`, 최대 10) / L2(`RuleCache<T>`, 최대 128, 바인더별 공유)의 3계층**이다. 사이트 대부분은 단형이라 L0에서 끝나고, 타입이 열 가지를 넘으면 캐시가 무너져 비용이 자릿수로 뛴다.
- **`var`는 컴파일러에게, `dynamic`은 런타임에게 타입을 맡긴다.** `var y = dynamicValue;`의 `y`는 정적 타입이 `dynamic`이므로, `var`를 썼다고 안전해지지 않는다.
- **호출할 수 없는 함수가 셋 있다** — 확장 메서드(정의 정적 클래스), 캐스트가 필요한 인터페이스 멤버(인터페이스 타입), 숨겨진 기반 멤버(기반 타입). 공통 원인은 **컴파일 타임에만 존재하는 "추가 타입"이 런타임에 사라진다**는 것이다. LINQ가 `dynamic`과 함께 쓸 수 없는 이유도 여기 있다.
- **동적 멤버 오버로드 해석은 다중 디스패치를 준다.** 방문자 패턴을 `Visit((dynamic)p)` 한 줄로 대체할 수 있고, 언바운드 제네릭의 멤버 접근 문제를 오버로드 폴백으로 우아하게 푼다. 폴백 오버로드가 없으면 `RuntimeBinderException`이 난다.
- **`DynamicObject`를 상속하면 `Try*` 가상 메서드로 바인딩 의미를 직접 정의**할 수 있다. `false` 반환은 실패가 아니라 언어 바인더로의 폴백 요청이다. `ExpandoObject`는 `IDictionary<string,object>`와 `INotifyPropertyChanged`를 함께 구현한 기성 구현체다.
- **C#은 문자열을 실행할 수 없다.** 파서가 런타임 서비스가 아니기 때문이다. IronPython 호스팅 API(`ScriptEngine`/`ScriptScope`/`ScriptSource`)나 Roslyn 스크립팅으로 우회하되, 신뢰할 수 없는 문자열의 실행은 곧 원격 코드 실행이며 .NET(Core)에는 부분 신뢰 샌드박스가 없다.
- **비용은 캐시 적중 시 직접 호출의 20~30배, 첫 호출은 자릿수가 다르다.** 리플렉션보다는 빠르지만 뜨거운 경로에 넣을 물건은 아니다.
- **Native AOT에서 `dynamic`은 사용 불가다.** `Binder`의 모든 팩토리 메서드에 `[RequiresDynamicCode]`와 `[RequiresUnreferencedCode]`가 붙어 있어 IL3050·IL2026 경고가 나며, 트리밍에서는 동적으로만 참조되는 멤버가 조용히 제거되어 런타임에 깨진다.
- **2026년에 `dynamic`이 남아 있는 자리는 셋** — COM 상호운용, 다중 디스패치, 동적 언어 상호운용. 나머지는 제네릭·패턴 매칭·소스 생성기·식 트리가 더 낫다.

---

## 연습 문제

1. `dynamic x = 5; var y = x + 1;` 를 담은 메서드를 컴파일하고 ILSpy나 `ildasm`으로 열어라. 생성된 `<>o__N` 클래스와 `<>p__M` 필드가 각각 몇 개인지 세고, 동적 연산의 개수와 비교하라. 그다음 `+ 1`을 `+ 1 + 2`로 바꾸고 필드 수가 어떻게 변하는지 확인하라.
2. `dynamic` 호출 사이트 하나가 보는 런타임 타입 수를 1, 5, 12로 바꿔가며 BenchmarkDotNet으로 측정하라. 12에서 성능이 급격히 나빠지는 지점이 L1 캐시 상한(10)과 맞아떨어지는지 확인하라.
3. `object`를 매개변수로 받는 폴백 오버로드를 **제거**한 뒤 59.7절의 `GetGroupKey` 예제를 실행하라. 어떤 예외가 어느 시점에 나는가? 예외 메시지를 파싱해 분기하는 코드가 왜 나쁜지 그 메시지를 보고 설명하라.
4. `DynamicObject`를 상속한 클래스를 만들되 `TryGetMember`에서 **`override` 키워드를 빼고** 같은 시그니처의 메서드를 정의하라. 컴파일 경고가 무엇이고 런타임에 무슨 일이 일어나는지 확인한 뒤, `override`를 붙여 차이를 비교하라.
5. `ExpandoObject`에 `INotifyPropertyChanged`를 붙여 멤버 추가·변경·삭제를 로그로 남기는 코드를 작성하라. 그다음 두 스레드에서 동시에 서로 다른 멤버를 추가해보고 `Count`가 기대한 값이 되는지 반복 실행하며 확인하라.
6. `dynamic`을 한 번이라도 호출하는 콘솔 앱을 만들고, `AppDomain.CurrentDomain.GetAssemblies()`를 동적 호출 **전후**로 출력해 비교하라. 어떤 어셈블리가 추가로 로드되는가?
7. 같은 앱을 `dotnet publish -p:PublishTrimmed=true`로, 그다음 `-p:PublishAot=true`로 게시하라. 각각 어떤 경고 코드가 나오는지 기록하고, 트리밍 게시본을 실제로 실행해 `RuntimeBinderException`이 나는 코드 경로를 찾아라.
8. 59.7절의 방문자 예제를 `switch` 식 + 타입 패턴으로 다시 작성하라. `Person` 계층에 새 파생 클래스 `Contractor`를 추가했을 때 두 버전에서 각각 몇 개의 파일을 수정해야 하는지 세어보라.

---

**다음 장** — 60장「네이티브 및 COM 상호운용」에서는 관리 경계 밖으로 나간다. P/Invoke와 마샬링 규칙, `[LibraryImport]` 소스 생성 P/Invoke, 함수 포인터 `delegate*`를 다루고, 이 장에서 `IDispatch`라는 이름만 언급하고 넘어간 COM 상호운용의 전체 그림을 60.12절에서 완성한다.
