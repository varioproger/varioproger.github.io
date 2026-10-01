---
title: "73장. 진단 API"
parent: "3권 — 내부, 메모리, 성능"
grand_parent: "C# Complete Guide"
nav_order: 73
---

# 73장. 진단 API

> **이 장의 위치** — Part XIII「진단과 디버깅」의 첫 장이다. 앞의 Part XI·XII가 "메모리와 성능을 어떻게 측정하고 고치는가"를 다뤘다면, 여기서부터는 **애플리케이션 자신이 자기 상태를 기록하고 노출하는 방법**을 다룬다. IDE와 디버거는 개발 중에만 곁에 있다. 출시 후에는 애플리케이션이 직접 진단 정보를 모으고 남겨야 하며, 그때 쓰는 것이 `System.Diagnostics` 네임스페이스의 API 집합이다. 이 장은 그 API의 레퍼런스이자 함정 목록이다.
>
> **선수 지식** — 12장(네임스페이스와 전처리기), 20장(열거형과 특성), 32장(예외 처리), 66장(메모리 문제 진단)
>
> **이 장에서 다루지 않는 것** — 디버거를 붙이고 끊고 중단점을 거는 실제 디버깅 워크플로와 덤프 사후 분석은 74장에서, `ILogger` 기반 구조적 로깅·`System.Diagnostics.Metrics`·분산 추적은 75장에서, 메모리 관점의 `dotnet-counters`/`dotnet-trace`/`dotnet-dump` 활용은 66장에서 이미 다뤘다. `Stopwatch`를 이용한 벤치마킹 방법론은 67장의 주제이며 여기서는 API 레퍼런스로만 다룬다.

---

이 장에서 다루는 타입은 대부분 `System.Diagnostics` 네임스페이스에 있다.

```csharp
using System.Diagnostics;                  // Debug, Trace, Process, Stopwatch, StackTrace, ...
using System.Diagnostics.Tracing;          // EventSource, EventCounter (66.6절)
using System.Diagnostics.Eventing.Reader;  // EventLogWatcher (Windows 전용)
using System.Diagnostics.Metrics;          // Meter, Counter<T> (75.3절)
```

먼저 짚어야 할 사실이 하나 있다. **`System.Diagnostics`의 상당수는 Windows 전용이다.** Windows 이벤트 로그와 성능 카운터가 대표적이다. Microsoft는 플랫폼 종속 API가 BCL을 어지럽히는 것을 막기 위해 이것들을 별도 NuGet 패키지로 분리해 배포한다. 열댓 개가 넘는 Windows 전용 패키지가 있고, `Microsoft.Windows.Compatibility` 라는 "마스터" 패키지 하나로 한꺼번에 참조할 수도 있다.

| 기능 | 패키지 | 플랫폼 |
|---|---|---|
| `Debug`, `Trace`, `TraceListener`, `TraceSource` | 공유 프레임워크 내장 | 크로스 플랫폼 |
| `StackTrace`, `StackFrame` | 공유 프레임워크 내장 | 크로스 플랫폼 |
| `Process`, `ProcessThread` | 공유 프레임워크 내장 | 크로스 플랫폼(기능 제한 있음) |
| `Stopwatch` | 공유 프레임워크 내장 | 크로스 플랫폼 |
| `EventLog`, `EventLogTraceListener` | `System.Diagnostics.EventLog` | **Windows 전용** |
| `PerformanceCounter`, `PerformanceCounterCategory` | `System.Diagnostics.PerformanceCounter` | **Windows 전용** |
| `EventSource`, `EventCounter` | 공유 프레임워크 내장 | 크로스 플랫폼 |
| `Meter`, `Counter<T>`, `Histogram<T>` | 공유 프레임워크 내장 ※.NET 6 | 크로스 플랫폼 |

> **⚠️ NuGet 패키지가 설치된다고 Linux에서 동작하는 것은 아니다**
>
> `System.Diagnostics.EventLog`와 `System.Diagnostics.PerformanceCounter`는 **모든 플랫폼에서 복원(restore)되고 컴파일도 된다.** Linux에서도 빌드는 통과한다. 다만 실행 시점에 `PlatformNotSupportedException`이 날아온다. 컴파일 성공을 이식성의 증거로 착각하면 CI는 초록불인데 프로덕션에서 터진다. .NET 5부터는 `[SupportedOSPlatform("windows")]` 특성과 플랫폼 호환성 분석기(CA1416)가 이 실수를 **컴파일 경고**로 잡아준다. 경고를 끄지 마라.

---

## 73.1 조건부 컴파일 vs 정적 플래그 변수

진단 코드에는 늘 같은 딜레마가 붙는다. **개발 중에는 있어야 하고 배포본에는 없어야 하는 코드**를 어떻게 관리할 것인가. C#은 세 가지 답을 준다. 전처리기 지시문, 정적 플래그 변수, 그리고 `[Conditional]` 특성이다. 12.7절과 12.8절에서 문법 관점으로 이미 훑었으니, 여기서는 **진단 코드라는 구체적 용도**에 맞춰 세 방식의 컴파일 결과와 함의를 끝까지 판다.

### 전처리기 지시문 복습

전처리기 지시문(preprocessor directive)은 `#`으로 시작하고 반드시 독립된 줄에 놓인다. 논리적으로는 본 컴파일 전에 실행되지만(실제로는 컴파일러가 어휘 분석 단계에서 처리한다), 결과적으로 **`#if`로 배제된 코드는 어셈블리에 아예 존재하지 않는다.**

```csharp
#define TESTMODE            // #define 지시문은 파일 최상단에 와야 한다
                            // 심볼 이름은 관례적으로 대문자
using System;

class Program
{
    static void Main()
    {
#if TESTMODE
        Console.WriteLine("in test mode!");
#endif
    }
}

// 출력: in test mode!
```

첫 줄을 지우면 `Console.WriteLine` 문은 **주석 처리된 것과 똑같이** 실행 파일에서 완전히 제거된 채로 컴파일된다.

`#else`는 C#의 `else`에 대응하고, `#elif`는 `#else` 다음에 `#if`가 오는 것과 같다. `||`, `&&`, `!` 연산자로 or, and, not 연산을 한다.

```csharp
#if TESTMODE && !PLAYMODE
    // TESTMODE가 정의되어 있고 PLAYMODE는 정의되어 있지 않을 때
#endif
```

> **⚠️ 전처리기 심볼은 변수가 아니다**
>
> `#if`가 평가하는 것은 일반적인 C# 식이 아니다. 여기 등장하는 심볼은 정적 필드든 지역 변수든 **어떤 변수와도 아무 연관이 없다.** 이름이 같은 `bool` 필드가 있어도 무관하다. 심볼은 값이 없고 "정의되었나/아닌가" 두 상태만 있으며, `==`와 `!=`는 `true`/`false` 리터럴과의 비교에만 쓸 수 있다.

어셈블리 전체에 적용되는 심볼은 `.csproj`에서 정의한다.

```xml
<PropertyGroup>
  <DefineConstants>TESTMODE;PLAYMODE</DefineConstants>
</PropertyGroup>
```

어셈블리 수준에서 정의한 심볼을 특정 파일에서만 무효화하려면 그 파일 상단에서 `#undef`를 쓴다.

### 정적 플래그 변수 방식

같은 예제를 단순한 정적 필드로 구현할 수도 있다.

```csharp
static internal bool TestMode = true;

static void Main()
{
    if (TestMode) Console.WriteLine("in test mode!");
}
```

이 방식의 장점은 명백하다. **런타임 구성이 가능하다.** 환경 변수나 설정 파일로 값을 바꿀 수 있고, 재컴파일 없이 프로덕션에서 진단을 켰다 끌 수 있다. 그렇다면 왜 조건부 컴파일을 쓰는가? 조건부 컴파일만이 갈 수 있는 곳이 있기 때문이다.

- **특성을 조건부로 붙이기** — 변수로는 불가능하다.
- **변수의 선언 타입 바꾸기** — `#if` 안에서 `float`, 밖에서 `double`처럼.
- **`using` 지시문에서 네임스페이스나 타입 별칭 전환하기**

```csharp
using TestType =
#if V2
    MyCompany.Widgets.GadgetV2;
#else
    MyCompany.Widgets.Gadget;
#endif
```

조건부 컴파일 지시문 아래에서 **대규모 리팩터링**을 통째로 넣어둘 수도 있다. 옛 버전과 새 버전 사이를 즉시 오갈 수 있고, 여러 런타임 버전을 대상으로 컴파일하면서 가능한 곳에서만 최신 기능을 쓰는 라이브러리를 작성할 수 있다. 다중 타깃 프로젝트에서 SDK가 자동으로 정의해주는 `NET8_0_OR_GREATER` 같은 심볼이 정확히 이 용도다.

```csharp
public static int PopCount(uint value)
{
#if NET7_0_OR_GREATER
    return System.Numerics.BitOperations.PopCount(value);   // 하드웨어 명령
#else
    int c = 0; while (value != 0) { value &= value - 1; c++; } return c;
#endif
}
```

조건부 컴파일의 또 다른 장점은 **디버깅 코드가 배포에 포함되지 않는 어셈블리의 타입을 참조할 수 있다는 것**이다. 배포본에서 그 코드가 사라지므로 참조도 함께 사라진다.

> **📌 SDK가 자동으로 정의하는 심볼**
>
> SDK 스타일 프로젝트는 대상 프레임워크에 따라 심볼을 자동 정의한다. `net8.0`을 대상으로 하면 `NET`, `NET8_0`, `NET8_0_OR_GREATER`, `NET7_0_OR_GREATER`, `NET6_0_OR_GREATER`, ... `NETCOREAPP`, `NETCOREAPP3_1_OR_GREATER` 등이 모두 정의된다. `.NET Framework` 대상이면 `NETFRAMEWORK`, `NET48` 같은 심볼이 붙는다. 다중 타깃 라이브러리에서 `#if NETFRAMEWORK`로 갈라 쓰는 것이 표준 관행이다.

### `[Conditional]` 특성

로그를 남기는 메서드를 하나 썼다고 하자.

```csharp
static void LogStatus(string msg)
{
    string logFilePath = /* ... */;
    System.IO.File.AppendAllText(logFilePath, msg + "\r\n");
}
```

이것이 `LOGGINGMODE` 심볼이 정의되었을 때만 실행되게 하고 싶다. 첫 번째 해법은 `LogStatus` **호출부마다** `#if`로 감싸는 것이다.

```csharp
#if LOGGINGMODE
LogStatus("Message Headers: " + GetMsgHeaders());
#endif
```

결과는 이상적이지만 지겹다. 두 번째 해법은 `#if`를 `LogStatus` **메서드 안에** 넣는 것이다. 그런데 이러면 다음 호출이 문제가 된다.

```csharp
LogStatus("Message Headers: " + GetComplexMessageHeaders());
```

`GetComplexMessageHeaders`는 **항상 호출된다.** 로그를 끄더라도 성능 손해를 그대로 본다.

첫 번째 해법의 효과와 두 번째 해법의 편의를 합치는 것이 `System.Diagnostics`의 `Conditional` 특성이다.

```csharp
[Conditional("LOGGINGMODE")]
static void LogStatus(string msg)
{
    // ...
}
```

이제 컴파일러는 `LogStatus` 호출을 **`#if LOGGINGMODE`로 감싼 것처럼** 취급한다. 심볼이 정의되어 있지 않으면 호출은 컴파일 과정에서 **완전히 제거된다 — 인자 평가 식까지 함께.** 따라서 부수 효과를 일으키는 식도 함께 건너뛴다. `LogStatus`와 호출자가 서로 다른 어셈블리에 있어도 동작한다.

### 컴파일 결과 — IL로 확인하기

말로만 하면 믿기 어려우니 IL을 보자. 다음 코드를 `LOGGINGMODE` 없이 컴파일한다.

```csharp
using System.Diagnostics;

class Program
{
    static int counter = 0;

    static void Main()
    {
        LogStatus("count=" + Bump());
        System.Console.WriteLine(counter);   // 무엇이 출력되는가?
    }

    static int Bump() => ++counter;

    [Conditional("LOGGINGMODE")]
    static void LogStatus(string msg) => System.Console.Error.WriteLine(msg);
}
```

`Main`의 IL은 이렇게 나온다.

```il
.method private hidebysig static void  Main() cil managed
{
  .entrypoint
  // Code size       11 (0xb)
  .maxstack  8
  IL_0000:  ldsfld     int32 Program::counter
  IL_0005:  call       void [System.Console]System.Console::WriteLine(int32)
  IL_000a:  ret
}
```

**`LogStatus` 호출도, 문자열 연결도, `Bump()` 호출도 IL에 없다.** 출력은 `1`이 아니라 `0`이다. 이것이 `[Conditional]`이 "호출부를 지운다"는 말의 정확한 의미다.

> **⚠️ `[Conditional]` 메서드의 인자에 부수 효과를 넣지 마라**
>
> 위 예제의 `Bump()`처럼 상태를 바꾸는 식을 조건부 메서드의 인자에 넣으면, 심볼 정의 여부에 따라 **프로그램의 동작 자체가 달라진다.** 가장 악명 높은 사례는 이것이다.
>
> ```csharp
> Debug.Assert(list.Remove(item));   // ← 절대 하지 마라
> ```
>
> `Debug`의 모든 메서드는 `[Conditional("DEBUG")]`다. Release 빌드에서는 `list.Remove(item)` **자체가 실행되지 않는다.** 디버그 빌드에서는 정상인데 릴리스 빌드에서만 리스트에 항목이 남는, 재현이 지독하게 어려운 버그가 만들어진다. 단언에 넣을 식은 **읽기 전용이어야 한다**는 규칙을 예외 없이 지켜라.

### 조건성은 호출자 컴파일 시점에 결정된다

`[Conditional]`의 조건 검사는 **호출된 메서드가 컴파일될 때가 아니라 호출자가 컴파일될 때** 수행된다. 이 성질이 대단히 유용하다. `LogStatus` 같은 메서드를 담은 라이브러리를 **딱 한 벌만 빌드해서** 배포하면, 그 라이브러리를 쓰는 각 애플리케이션이 자기 빌드 구성에 따라 로그를 켜거나 끄게 된다.

```text
   [LoggingLib.dll]  ← 한 번만 빌드해서 NuGet에 올린다
        │  [Conditional("LOGGINGMODE")] static void LogStatus(string)
        │
   ┌────┴──────────────────────────────┐
   │                                   │
[AppA.csproj]                     [AppB.csproj]
DefineConstants=LOGGINGMODE       (심볼 없음)
   │                                   │
   ↓                                   ↓
호출이 IL에 남는다                호출이 IL에서 사라진다
```

`Conditional` 특성은 **런타임에는 완전히 무시된다.** 순수하게 컴파일러에 대한 지시일 뿐이다. 리플렉션으로 `LogStatus`를 찾아 `Invoke`하면 심볼과 무관하게 실행된다.

> **⚠️ `[Conditional]`은 리플렉션 호출과 델리게이트를 막지 못한다**
>
> 조건부 메서드는 IL 메타데이터에 **그대로 남아 있다.** 사라지는 것은 호출부뿐이다. 리플렉션으로 얻은 `MethodInfo`에 `Invoke`를 호출하면 정상 동작한다. 다만 **델리게이트로 변환하는 것은 컴파일 오류다**(CS1618). 델리게이트를 통한 호출은 컴파일 시점에 지울 수 없기 때문이다.
>
> ```csharp
> Action<string> a = LogStatus;   // CS1618: Conditional 특성 때문에 델리게이트를 만들 수 없다
> ```

### `[Conditional]`의 제약

컴파일러가 호출부를 안전하게 지우려면 몇 가지 조건이 필요하다.

| 제약 | 이유 | 위반 시 |
|---|---|---|
| 반환 타입이 `void`여야 한다 | 호출을 지우면 반환값 자리가 빈다 | CS0578 |
| `out` 매개변수를 가질 수 없다 | 호출이 사라지면 변수가 미할당 상태로 남는다 | CS0685 |
| `override` 메서드에 붙일 수 없다 | 조건성은 선언 계층의 최상위에서만 정한다 | CS0243 |
| 인터페이스 멤버의 구현일 수 없다 | 인터페이스를 통한 호출은 지울 수 없다 | CS0629 |
| 델리게이트로 변환할 수 없다 | 간접 호출은 컴파일 시점에 지울 수 없다 | CS1618 |
| 생성자·소멸자·연산자·명시적 인터페이스 구현에 붙일 수 없다 | 호출 제거가 의미를 갖지 않는다 | CS0577 |

`virtual` 메서드에는 붙일 수 있다. 이 경우 파생 클래스의 `override`는 특성을 명시하지 않아도 조건성을 물려받는다.

`[Conditional]`은 **특성 클래스 자체에도 붙일 수 있다.** 이 경우 심볼이 정의되지 않으면 그 특성이 메타데이터에 아예 방출되지 않는다.

```csharp
[Conditional("CONTRACTS_FULL")]
[AttributeUsage(AttributeTargets.Method)]
public sealed class PureAttribute : Attribute { }

// CONTRACTS_FULL이 없으면 아래 [Pure]는 메타데이터에 남지 않는다
[Pure] static int Square(int x) => x * x;
```

한 메서드에 `[Conditional]`을 **여러 개** 붙이면 **OR**로 동작한다. 어느 하나라도 정의되어 있으면 호출이 유지된다.

```csharp
[Conditional("DEBUG"), Conditional("VERBOSE")]
static void Trace(string msg) { /* ... */ }
```

### 세 방식 비교

| 항목 | `#if` 전처리기 | 정적 플래그 변수 | `[Conditional]` 특성 |
|---|---|---|---|
| **제거 시점** | 어휘 분석(컴파일 전) | 제거되지 않음 | 호출부 방출 시(컴파일) |
| **배포본에 코드가 남는가** | 아니오 | 예 | 메서드 본문은 남고 호출부는 사라짐 |
| **인자 평가** | 함께 제거 | 항상 수행 | 함께 제거 |
| **런타임 전환** | 불가 | **가능** | 불가 |
| **적용 범위** | 임의의 코드 구간 | `if` 문 안 | 메서드 호출 단위 |
| **선언 타입·`using`·특성 변경** | **가능** | 불가 | 불가 |
| **다른 어셈블리 경계 넘기** | 불가(파일/프로젝트 단위) | 가능 | **가능**(호출자 기준 판정) |
| **라이브러리를 한 벌만 빌드** | 불가 | 가능 | **가능** |
| **호출부 문법 부담** | 매 호출마다 3줄 | 없음 | 없음 |
| **주 용도** | 다중 타깃, 플랫폼 분기, 대규모 버전 전환 | 프로덕션에서 켜고 끄는 진단 | 디버그 전용 로깅·단언 |

정리하면 이렇다.

- **컴파일 대상 자체를 바꿔야 한다면** `#if`. 다중 타깃 라이브러리에서 API가 달라지는 지점이 대표적이다.
- **프로덕션에서 재시작 없이 켜고 꺼야 한다면** 정적 플래그(또는 구성 시스템). 진짜 운영 로깅은 전부 여기 속한다.
- **디버그 빌드에만 있어야 할 보조 코드라면** `[Conditional]`. 인자 평가까지 지워준다는 점이 결정적이다.

### 런타임 전환이 필요할 때 인자 평가를 피하는 법

`[Conditional]`은 런타임에 기능을 켜고 꺼야 할 때 쓸모가 없다. 그때는 변수 기반 접근으로 가야 하는데, 그러면 "조건부 로깅 메서드를 호출할 때 인자 평가를 우아하게 회피하는 법"이라는 문제가 다시 돌아온다. 함수형 접근이 이를 해결한다.

```csharp
using System;

class Program
{
    public static bool EnableLogging;

    static void LogStatus(Func<string> message)
    {
        string logFilePath = /* ... */;
        if (EnableLogging)
            System.IO.File.AppendAllText(logFilePath, message() + "\r\n");
    }
}
```

람다 식 덕분에 문법 부담 없이 호출할 수 있다.

```csharp
LogStatus(() => "Message Headers: " + GetComplexMessageHeaders());
```

`EnableLogging`이 `false`면 `GetComplexMessageHeaders`는 **평가되지 않는다.**

> **⚠️ 지연 평가 람다는 공짜가 아니다**
>
> `() => "Message Headers: " + GetComplexMessageHeaders()`는 지역 변수를 캡처하지 않으면 컴파일러가 델리게이트 인스턴스를 캐시한다(정적 람다 캐싱). 하지만 **지역 변수를 하나라도 캡처하면** 호출마다 클로저 클래스가 힙에 할당되고 델리게이트도 새로 만들어진다. 즉 로깅이 꺼져 있어도 **호출당 두 번의 할당**이 발생한다. 뜨거운 경로(hot path)에서는 이 비용이 문자열 연결 비용을 넘어설 수도 있다. 69장에서 다룬 할당 줄이기 관점에서 보면, 진짜 해법은 다음 절의 `IsEnabled` 게이트 패턴이다.

### ※ 현대적 대안 — 왜 새 코드는 `ILogger`를 쓰는가

`Debug`/`Trace`와 `[Conditional]` 조합은 .NET 1.0 시절의 설계다. 오늘날 애플리케이션 로깅은 `Microsoft.Extensions.Logging`의 `ILogger`로 수렴했고, 이유는 셋이다.

1. **런타임 수준 제어** — `LogLevel`을 구성 파일이나 환경 변수로 바꾼다. 재컴파일이 필요 없다.
2. **구조적 로그** — 메시지를 문자열로 뭉개지 않고 `{OrderId}` 같은 이름 있는 필드로 남긴다. 검색·집계가 가능해진다.
3. **비용 게이트** — `logger.IsEnabled(LogLevel.Debug)`로 미리 걸러 인자 평가를 건너뛴다. 소스 생성 로깅(`[LoggerMessage]`)을 쓰면 이 게이트와 문자열 포매팅이 컴파일 타임에 생성되어 할당이 0에 수렴한다.

```csharp
// [Conditional] 방식
Debug.WriteLine($"주문 {orderId} 처리 시작");     // Release에서 통째로 사라짐

// ILogger 방식 (75.1절, 75.2절)
if (logger.IsEnabled(LogLevel.Debug))
    logger.LogDebug("주문 {OrderId} 처리 시작", orderId);
```

그렇다고 이 장의 내용이 낡은 것은 아니다. `Trace`/`TraceListener`는 **라이브러리 저자에게 여전히 유효한 선택지**다. 의존성 주입 컨테이너가 없는 라이브러리, `Microsoft.Extensions.*`에 의존하고 싶지 않은 라이브러리는 `TraceSource`로 진단을 노출하고 소비자가 리스너를 붙이게 한다. 그리고 `[Conditional]`과 `Debug.Assert`는 로깅이 아니라 **불변식 검증** 도구이므로 `ILogger`가 대체하지 못한다. 자세히는 75장에서 다룬다.

---

## 73.2 `Debug`와 `Trace` 클래스 — `Assert`, `Fail`, `WriteIf`

`Debug`와 `Trace`는 기본적인 로깅과 단언(assertion) 기능을 제공하는 정적 클래스다. 두 클래스는 매우 비슷하고, 주된 차이는 **의도된 용도**다.

- `Debug` 클래스는 **디버그 빌드**를 위한 것이다.
- `Trace` 클래스는 **디버그 빌드와 릴리스 빌드 모두**를 위한 것이다.

이 의도는 코드로 강제된다.

- `Debug` 클래스의 모든 메서드는 `[Conditional("DEBUG")]`로 정의되어 있다.
- `Trace` 클래스의 모든 메서드는 `[Conditional("TRACE")]`로 정의되어 있다.

즉 `Debug`나 `Trace`에 대한 모든 호출은 `DEBUG` 또는 `TRACE` 심볼을 정의하지 않는 한 컴파일러가 제거한다.

### 빌드 심볼의 기본값

SDK 스타일 프로젝트의 기본값은 다음과 같다.

| 빌드 구성 | `DEBUG` | `TRACE` | 결과 |
|---|---|---|---|
| `Debug` | 정의됨 | 정의됨 | `Debug.*`와 `Trace.*` 모두 살아남는다 |
| `Release` | 정의 안 됨 | **정의됨** | `Debug.*`는 사라지고 `Trace.*`는 남는다 |

즉 `dotnet build`는 `DEBUG;TRACE`를, `dotnet build -c Release`와 `dotnet publish -c Release`는 `TRACE`만 정의한 채 컴파일한다.

> **⚠️ Release 빌드에서도 `Trace`는 살아 있다**
>
> 이것이 가장 흔한 오해다. "릴리스에서는 진단 코드가 다 빠진다"는 믿음으로 `Trace.Assert`를 조건 검사에 쓰면, 프로덕션에서 단언이 실패하는 순간 **기본 리스너가 프로세스를 종료시킨다.** `Trace`는 "출시 후에도 남기고 싶은 진단"이라는 명확한 의도가 있을 때만 쓰고, 개발 중 검증에는 `Debug`를 써라.
>
> 반대 방향의 실수도 있다. Release 빌드 성능을 측정하면서 `Trace.WriteLine`이 뜨거운 루프 안에 남아 있는 줄 모르는 경우다. 리스너가 파일에 쓰고 있다면 측정값이 통째로 오염된다.

`TRACE`를 끄고 싶다면 명시적으로 지정한다.

```xml
<PropertyGroup Condition="'$(Configuration)'=='Release'">
  <DefineConstants>$(DefineConstants.Replace('TRACE',''))</DefineConstants>
</PropertyGroup>
```

> **📌 `DEBUG` 심볼과 `<Optimize>`는 별개다**
>
> `DEBUG` 심볼의 정의 여부와 JIT 최적화 활성화 여부는 서로 다른 스위치다. `<Optimize>true</Optimize>`를 Debug 구성에 켤 수도 있고, Release 구성에서 `<DefineConstants>DEBUG</DefineConstants>`로 심볼만 되살릴 수도 있다. "Release 빌드인데 스택 트레이스가 정확하다"거나 "Debug 심볼이 있는데 인라이닝이 일어난다" 같은 혼란은 대개 이 둘을 하나로 착각한 데서 온다. 73.4절에서 이 구분이 다시 중요해진다.

### `Write`, `WriteLine`, `WriteIf`

`Debug`와 `Trace` 모두 `Write`, `WriteLine`, `WriteIf`, `WriteLineIf` 메서드를 제공한다. 기본적으로 이 메서드들은 메시지를 디버거의 출력 창으로 보낸다.

```csharp
Debug.Write("Data");
Debug.WriteLine(23 * 34);

int x = 5, y = 3;
Debug.WriteIf(x > y, "x is greater than y");
Debug.WriteLineIf(x > y, "x is greater than y");
```

`Write`와 `WriteLine`은 **범주(category)** 문자열을 두 번째 인자로 받는 오버로드가 있다. 출력을 후처리할 때 유용하다.

```csharp
Debug.WriteLine("연결 풀 고갈", "Database");
// 출력: Database: 연결 풀 고갈
```

들여쓰기 API도 있다. 중첩된 처리 단계를 시각적으로 표현할 때 쓴다.

```csharp
Debug.WriteLine("주문 처리 시작");
Debug.Indent();                       // IndentLevel++
Debug.WriteLine("재고 확인");         // →     재고 확인
Debug.Indent();
Debug.WriteLine("창고 A 조회");       // →         창고 A 조회
Debug.Unindent();                     // IndentLevel--
Debug.WriteLine("결제 승인");         // →     결제 승인
Debug.Unindent();
Debug.WriteLine("주문 처리 완료");
```

`IndentSize`는 기본값 4이고 `IndentLevel`로 직접 수준을 설정할 수도 있다.

> **⚠️ `Indent`/`Unindent`는 예외에 취약하다**
>
> `Indent()`와 `Unindent()` 사이에서 예외가 던져지면 `IndentLevel`이 복구되지 않는다. `Debug`/`Trace`의 들여쓰기 상태는 **정적이고 프로세스 전역**이므로, 한 번 어긋나면 이후 모든 출력이 밀린다. 게다가 멀티스레드 환경에서는 스레드끼리 들여쓰기 수준을 서로 밟는다. 실무에서는 `try`/`finally`로 감싸거나, 아예 쓰지 않는 편이 낫다.

### `Trace`의 세 가지 이벤트 메서드

`Trace` 클래스는 `TraceInformation`, `TraceWarning`, `TraceError` 메서드를 추가로 제공한다. 이들과 `Write` 계열의 동작 차이는 활성화된 `TraceListener`가 무엇이냐에 달려 있다(73.3절).

```csharp
Trace.TraceInformation("서비스 시작됨");
Trace.TraceWarning("연결 재시도 {0}회", retryCount);
Trace.TraceError("치명적 오류: {0}", ex.Message);
```

핵심 차이는 이렇다. `Write`/`WriteLine`은 리스너의 `Write`/`WriteLine`을 호출해 **메시지 문자열만** 전달한다. 반면 `TraceXxx`는 리스너의 `TraceEvent`를 호출해 **`TraceEventType` 심각도, 소스 이름, 이벤트 ID를 함께** 전달한다. 그래서 Windows 이벤트 로그 리스너를 붙이면 `Write`로 쓴 것은 전부 "정보"로, `TraceWarning`/`TraceError`로 쓴 것은 각각 "경고"/"오류"로 표시된다.

| 메서드 | 리스너에서 호출되는 것 | 심각도 전달 | 필터링 가능 |
|---|---|---|---|
| `Write`, `WriteLine` | `TraceListener.Write` / `.WriteLine` | 없음 | 아니오 |
| `WriteIf`, `WriteLineIf` | 조건이 참일 때만 위와 동일 | 없음 | 아니오 |
| `TraceInformation` | `TraceListener.TraceEvent` | `Information` | **예** |
| `TraceWarning` | `TraceListener.TraceEvent` | `Warning` | **예** |
| `TraceError` | `TraceListener.TraceEvent` | `Error` | **예** |
| `Fail` | `TraceListener.Fail` | — | 아니오 |

> **💡 `Write` 대신 `TraceXxx`를 써라**
>
> `Trace.Write`는 심각도 정보를 잃는다. 필터를 걸 수도 없고, `TraceOutputOptions`가 적용되지도 않는다. `Trace`를 쓰기로 했다면 `TraceInformation`/`TraceWarning`/`TraceError` 세 개만 쓰는 규칙을 팀에 두는 것이 낫다. 더 세밀한 심각도(`Verbose`, `Critical`)가 필요하면 `TraceSource`로 올라가라.

### `Fail`과 `Assert`

`Debug`와 `Trace` 모두 `Fail`과 `Assert` 메서드를 제공한다. `Fail`은 메시지를 해당 클래스의 `Listeners` 컬렉션에 있는 각 `TraceListener`로 보내고, 기본적으로는 디버그 출력으로 간다.

```csharp
Debug.Fail("File data.txt does not exist!");
Debug.Fail("파일 없음", "경로: " + path);   // 상세 메시지 오버로드
```

`Assert`는 `bool` 인자가 `false`일 때 단순히 `Fail`을 호출한다. 이것을 **단언한다(making an assertion)** 고 하며, 위반되면 코드에 버그가 있다는 뜻이다. 실패 메시지 지정은 선택 사항이다.

```csharp
Debug.Assert(File.Exists("data.txt"), "File data.txt does not exist!");

var result = Compute();
Debug.Assert(result != null);
```

### 단언과 예외는 다른 것이다

단언 대신 반대 조건일 때 예외를 던지는 방법도 있다. 메서드 인자를 검증할 때 흔한 관행이다.

```csharp
public void ShowMessage(string message)
{
    if (message == null) throw new ArgumentNullException(nameof(message));
    // ...
}
```

이런 "단언"은 **무조건 컴파일되며**, 실패했을 때의 결과를 `TraceListener`로 제어할 수 없다는 점에서 덜 유연하다. 그리고 엄밀히 말해 이것은 단언이 아니다.

이 구분은 개념적으로 중요하다.

| | 단언(`Debug.Assert`) | 인자 검증 예외(`ArgumentNullException`) |
|---|---|---|
| **무엇이 잘못되었다는 신호인가** | **현재 메서드의** 코드에 버그가 있다 | **호출자의** 코드에 버그가 있다 |
| **누가 고쳐야 하는가** | 이 메서드의 작성자 | 호출한 쪽 |
| **릴리스 빌드에 남는가** | 아니오(`Debug`) | 예 |
| **실패 시 동작을 바꿀 수 있는가** | 예(리스너로) | 아니오 |
| **복구 가능한가** | 아니오(버그다) | 호출자가 처리할 수 있다 |
| **검사 대상** | 내부 불변식, 사후 조건 | 공개 API의 사전 조건 |

> **💡 단언은 "여기까지 왔다면 이건 참이다"를 적는 곳이다**
>
> `Debug.Assert(index >= 0 && index < _items.Length)` 처럼, 이미 앞에서 검증했으므로 참일 수밖에 없는 것을 적어라. 참일지 아닐지 모르는 것(외부 입력, 네트워크 응답, 파일 내용)을 단언에 넣으면 그것은 단언이 아니라 검증이며, Release 빌드에서 조용히 사라져 아무것도 막지 못한다.
>
> 반대로 `public` API의 인자 검증은 반드시 예외로 하라. .NET 6부터 `ArgumentNullException.ThrowIfNull`, .NET 8부터 `ArgumentOutOfRangeException.ThrowIfNegative` 같은 정적 헬퍼가 있으므로 한 줄로 끝난다(32.4절).

### `Debug.Assert` 실패는 무엇을 하는가

기본 리스너(`DefaultTraceListener`)의 `Fail` 동작은 플랫폼과 런타임에 따라 다르다. 이것이 실무에서 자주 혼란을 부른다.

| 환경 | `Debug.Assert(false)` 결과 |
|---|---|
| .NET, 디버거 연결됨 | 메시지 출력 후 디버거에서 중단 |
| .NET, 디버거 없음, 콘솔 | 메시지를 표준 오류로 출력 후 **프로세스 강제 종료** |
| .NET Framework, 콘솔 앱 | 메시지 출력 후 프로세스 종료 |
| .NET Framework, GUI 앱 | **Abort/Retry/Ignore 대화상자** 표시 |

.NET Framework의 대화상자 동작은 `DefaultTraceListener.AssertUiEnabled`로 끌 수 있다.

> **⚠️ 서버 앱에서 `Debug.Assert`가 대화상자를 띄우면 장애다**
>
> .NET Framework 기반 Windows 서비스나 IIS 워커에서 `Debug.Assert`가 실패하면, 아무도 볼 수 없는 모달 대화상자가 뜨고 스레드가 영원히 멈춘다. 요청은 타임아웃되고 원인은 로그 어디에도 남지 않는다. .NET Framework 프로젝트를 유지보수한다면 앱 시작 시점에 다음을 넣어라.
>
> ```csharp
> // .NET Framework 전용 — .NET (Core)에는 Debug.Listeners가 없다
> var d = Debug.Listeners.OfType<DefaultTraceListener>().FirstOrDefault();
> if (d != null) d.AssertUiEnabled = false;
> ```

### ※ `Debug`에는 `Listeners`가 없다 — .NET과 .NET Framework의 갈림길

원서와 오래된 자료는 `Debug.Listeners`를 자연스럽게 언급하지만, **.NET(Core) 이후에는 `Debug` 클래스에 `Listeners` 속성이 없다.** `Debug`의 출력 경로는 `Trace`와 분리되어 `DebugProvider`라는 별도 확장점을 거친다.

```csharp
// .NET (Core) 전용 — Debug 출력을 가로채는 방법
sealed class MyDebugProvider : DebugProvider
{
    public override void Write(string message) => Console.Write($"[dbg] {message}");
    public override void WriteLine(string message) => Console.WriteLine($"[dbg] {message}");
    public override void Fail(string message, string detailMessage)
        => throw new InvalidOperationException($"단언 실패: {message} / {detailMessage}");
}

// 이전 공급자를 돌려받는다
DebugProvider previous = Debug.SetProvider(new MyDebugProvider());
// ※ DebugProvider/SetProvider의 공개 여부는 런타임 버전에 따라 다를 수 있으니
//    대상 프레임워크의 API 문서에서 확인하라.
```

이 차이는 실무에서 다음과 같이 나타난다.

| API | .NET Framework | .NET (Core) 이후 |
|---|---|---|
| `Trace.Listeners` | 있음 | **있음** |
| `Debug.Listeners` | 있음 | **없음** |
| `Debug.SetProvider(DebugProvider)` | 없음 | **있음** |
| `Debug.AutoFlush`, `IndentLevel` | 있음 | 있음 |
| `app.config`의 `<system.diagnostics>` 리스너 구성 | **동작함** | **무시됨**(코드로만 등록) |

> **⚠️ `app.config`로 리스너를 구성하던 코드는 .NET에서 조용히 죽는다**
>
> .NET Framework에서는 `app.config`의 `<system.diagnostics><trace><listeners>` 섹션으로 리스너를 선언적으로 추가할 수 있었다. **.NET(Core) 이후에는 이 구성이 완전히 무시된다.** 예외도 경고도 없다. 그냥 리스너가 붙지 않고, 로그가 사라진다. 마이그레이션 시 이 설정을 코드 등록(`Trace.Listeners.Add(...)`)으로 바꿔야 한다.

### 디버거와의 상호작용

`System.Diagnostics`의 정적 `Debugger` 클래스는 디버거와 상호작용하는 기본 기능을 제공한다. `Break`, `Launch`, `Log`, `IsAttached`가 그것이다.

```csharp
if (!Debugger.IsAttached)
    Debugger.Launch();      // 디버거를 띄우고 연결한다(실행은 계속)

Debugger.Break();           // 디버거를 띄우고 연결한 뒤 그 지점에서 실행을 중단한다

Debugger.Log(0, "Startup", "구성 로드 완료\n");   // 디버거 출력 창으로 직접 기록
```

Windows 서비스나 (역설적이게도) Visual Studio 디자이너처럼 IDE 안에서 디버그 모드로 시작할 수 없는 상황에서 초기 실행 지점을 잡을 때 쓴다. **연결과 중단의 실제 워크플로, 그리고 프로덕션 환경에서의 주의점은 74.1절에서 다룬다.**

> **⚠️ `Debugger.Break`를 실수로 배포하면 프로덕션이 멈춘다**
>
> `Debugger.Break()`는 `[Conditional]`이 아니다. Release 빌드에도 그대로 남는다. 디버거가 붙어 있지 않은 환경에서 호출되면 플랫폼에 따라 프로세스가 중단되거나(Windows에서는 JIT 디버거 등록 대화상자가 뜰 수 있다) 무시된다. 임시 디버깅용으로 넣었다면 **반드시 `#if DEBUG`로 감싸라.**

---

## 73.3 `TraceListener`와 리스너 플러시·종료

`Trace` 클래스에는 정적 `Listeners` 속성이 있고, 이는 `TraceListener` 인스턴스의 컬렉션(`TraceListenerCollection`)을 반환한다. 이 리스너들이 `Write`, `Fail`, `TraceXxx` 메서드가 뿜어낸 내용을 처리하는 주체다.

```text
  Trace.TraceWarning("Orange alert")
            ↓
  ┌───────────────────────────────────────────┐
  │  Trace.Listeners (TraceListenerCollection) │
  └───────────────────────────────────────────┘
       │            │              │
       ↓            ↓              ↓
  Filter?      Filter?        Filter?      ← TraceFilter.ShouldTrace
       │            │              │
       ↓            ↓              ↓
 TextWriter    Console       EventLog
 TraceListener TraceListener TraceListener
       │            │              │
       ↓            ↓              ↓
   trace.txt     stdout      Windows 이벤트 로그
                             (Windows 전용)
```

기본적으로 `Listeners` 컬렉션에는 리스너가 딱 하나(`DefaultTraceListener`) 들어 있다. 이 기본 리스너의 핵심 특징은 두 가지다.

- Visual Studio 같은 **디버거에 연결되어 있으면** 메시지를 디버그 출력 창에 쓴다. 그렇지 않으면 **메시지 내용을 버린다.**
- `Fail` 메서드가 호출되면(또는 단언이 실패하면) **애플리케이션을 종료시킨다.**

> **⚠️ 디버거 없이 실행하면 `Trace.WriteLine`은 아무 데도 가지 않는다**
>
> "로그가 안 남는다"는 문의의 절반은 이것이다. 기본 리스너는 디버거가 없으면 메시지를 **조용히 버린다.** 콘솔에도, 파일에도, 어디에도 남지 않고 예외도 나지 않는다. `Trace`를 쓸 생각이라면 애플리케이션 시작 시점에 **반드시 리스너를 하나 이상 등록**해야 한다.

### 미리 정의된 리스너

기본 리스너를 (선택적으로) 제거하고 직접 만든 것을 하나 이상 추가하면 동작을 바꿀 수 있다. `TraceListener`를 상속해 밑바닥부터 쓸 수도 있고, 미리 정의된 타입을 쓸 수도 있다.

| 리스너 | 출력 대상 | 가용성 |
|---|---|---|
| `DefaultTraceListener` | 디버거 출력 창(없으면 폐기) | 크로스 플랫폼 |
| `TextWriterTraceListener` | `Stream`, `TextWriter`, 또는 파일에 추가 | 크로스 플랫폼 |
| `ConsoleTraceListener` | 표준 출력(또는 표준 오류) | 크로스 플랫폼 |
| `DelimitedListTraceListener` | 구분자로 나뉜 텍스트(CSV 등) | 크로스 플랫폼 |
| `XmlWriterTraceListener` | XML 조각 스트림 | 크로스 플랫폼 |
| `EventLogTraceListener` | Windows 이벤트 로그 | **Windows 전용** |
| `EventProviderTraceListener` | ETW(Event Tracing for Windows) 하위 시스템 | **.NET Framework 전용** |
| `EventSchemaTraceListener` | 스키마 준수 XML 로그 | **.NET Framework 전용** |

`TextWriterTraceListener`가 계층의 뿌리다. `ConsoleTraceListener`, `DelimitedListTraceListener`, `XmlWriterTraceListener`는 모두 이것을 상속하며, 따라서 `Flush`/`Close` 의미론과 캐싱 동작을 공유한다(이 절 뒤쪽 참조).

다음 예제는 `Trace`의 기본 리스너를 지우고 세 개를 추가한다. 하나는 파일에 추가하고, 하나는 콘솔에 쓰고, 하나는 Windows 이벤트 로그에 쓴다.

```csharp
// 기본 리스너 제거
Trace.Listeners.Clear();

// trace.txt 파일에 이어 붙이는 리스너 추가
Trace.Listeners.Add(new TextWriterTraceListener("trace.txt"));

// 콘솔 출력 스트림을 얻어 리스너로 추가
System.IO.TextWriter tw = Console.Out;
Trace.Listeners.Add(new TextWriterTraceListener(tw));

// Windows 이벤트 로그 소스를 설정한 뒤 리스너를 만들어 추가한다.
// ⚠️ Windows 전용. CreateEventSource는 관리자 권한이 필요하므로
//    보통 애플리케이션 설치 과정에서 수행한다.
if (!EventLog.SourceExists("DemoApp"))
    EventLog.CreateEventSource("DemoApp", "Application");
Trace.Listeners.Add(new EventLogTraceListener("DemoApp"));
```

Windows 이벤트 로그의 경우, `Write`·`Fail`·`Assert` 메서드로 쓴 메시지는 이벤트 뷰어에 항상 **"정보"** 로 표시된다. 반면 `TraceWarning`과 `TraceError`로 쓴 메시지는 **경고**와 **오류**로 표시된다.

### 리스너 필터

`TraceListener`에는 `TraceFilter` 타입의 `Filter` 속성이 있다. 메시지가 그 리스너에 쓰일지 말지를 제어한다. 미리 정의된 하위 클래스(`EventTypeFilter`, `SourceFilter`)를 인스턴스화하거나, `TraceFilter`를 상속해 `ShouldTrace` 메서드를 재정의한다.

```csharp
var fileListener = new TextWriterTraceListener("errors.txt");

// Warning 이상만 이 리스너로 보낸다
fileListener.Filter = new EventTypeFilter(SourceLevels.Warning);
Trace.Listeners.Add(fileListener);
```

`SourceLevels`는 비트 플래그 조합이다.

| `SourceLevels` | 통과시키는 `TraceEventType` |
|---|---|
| `Off` | 없음 |
| `Critical` | `Critical` |
| `Error` | `Critical`, `Error` |
| `Warning` | `Critical`, `Error`, `Warning` |
| `Information` | 위 + `Information` |
| `Verbose` | 위 + `Verbose` |
| `ActivityTracing` | `Start`, `Stop`, `Suspend`, `Resume`, `Transfer` |
| `All` | 전부 |

범주별로 걸러내고 싶다면 `TraceFilter`를 직접 상속한다.

```csharp
sealed class CategoryFilter : TraceFilter
{
    readonly HashSet<string> _allowed;
    public CategoryFilter(params string[] allowed) => _allowed = new(allowed);

    public override bool ShouldTrace(
        TraceEventCache cache, string source, TraceEventType eventType, int id,
        string formatOrMessage, object[] args, object data1, object[] data)
        => _allowed.Contains(source);
}
```

> **⚠️ `Filter`는 `Write`/`WriteLine` 경로에 적용되지 않는다**
>
> `TraceFilter.ShouldTrace`는 `TraceEvent`/`TraceData` 경로에서만 호출된다. `Trace.Write`나 `Trace.WriteLine`으로 직접 쓴 메시지는 **필터를 통과하지 않고 리스너에 그대로 도달한다.** 필터를 걸어두고 "왜 안 걸러지지?" 하는 상황의 원인이 대부분 이것이다. 필터를 쓰려면 `TraceInformation`/`TraceWarning`/`TraceError` 또는 `TraceSource`를 써야 한다.

### 들여쓰기와 출력 옵션

`TraceListener`는 들여쓰기 제어를 위한 `IndentLevel`, `IndentSize` 속성과, 추가 데이터를 쓰기 위한 `TraceOutputOptions` 속성도 정의한다.

```csharp
TextWriterTraceListener tl = new TextWriterTraceListener(Console.Out);
tl.TraceOutputOptions = TraceOptions.DateTime | TraceOptions.Callstack;
```

`TraceOutputOptions`는 `TraceXxx` 메서드를 쓸 때 적용된다.

```csharp
Trace.TraceWarning("Orange alert");
```

```text
DiagTest.exe Warning: 0 : Orange alert
    DateTime=2007-03-08T05:57:13.6250000Z
    Callstack=
       at System.Environment.get_StackTrace()
       at ...
```

`TraceOptions`의 전체 목록은 다음과 같다.

| 값 | 추가되는 정보 | 비용 |
|---|---|---|
| `None` | 없음 | 0 |
| `LogicalOperationStack` | `CorrelationManager`의 논리 연산 스택 | 낮음 |
| `DateTime` | UTC 타임스탬프 | 낮음 |
| `Timestamp` | 고해상도 틱 카운터 | 낮음 |
| `ProcessId` | 프로세스 ID | 낮음 |
| `ThreadId` | 관리 스레드 ID | 낮음 |
| `Callstack` | **전체 호출 스택 문자열** | **매우 높음** |

> **⚠️ `TraceOptions.Callstack`은 메시지마다 스택을 뜬다**
>
> `Callstack` 옵션은 로그 한 줄마다 `Environment.StackTrace`를 호출한다. 이것은 스택 워킹과 문자열 생성을 수반하며, 호출당 마이크로초 단위가 아니라 **수십 마이크로초 이상** 걸릴 수 있고 상당한 문자열 할당을 만든다. 개발 중 특정 문제를 좁힐 때만 켜고, 프로덕션 구성에는 절대 남기지 마라.

### 커스텀 리스너 구현

`TraceListener`를 상속할 때 **반드시 구현해야 하는 것은 `Write(string)`과 `WriteLine(string)` 두 개**다. 나머지는 모두 기본 구현이 있다. 다음은 메시지를 순환 메모리 버퍼에 담아 두었다가 문제가 생겼을 때만 덤프하는 리스너다. 프로덕션에서 "직전 N개 로그"를 예외 발생 시점에만 남기고 싶을 때 쓰는 패턴이다.

```csharp
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;

public sealed class RingBufferTraceListener : TraceListener
{
    readonly ConcurrentQueue<string> _buffer = new();
    readonly int _capacity;
    readonly StringBuilder _pending = new();      // Write는 줄바꿈 없이 올 수 있다

    public RingBufferTraceListener(int capacity = 512) : base("RingBuffer")
        => _capacity = capacity;

    public override void Write(string message)
    {
        lock (_pending) _pending.Append(message);
    }

    public override void WriteLine(string message)
    {
        string line;
        lock (_pending)
        {
            _pending.Append(message);
            line = _pending.ToString();
            _pending.Clear();
        }

        _buffer.Enqueue($"{DateTime.UtcNow:O} {line}");
        while (_buffer.Count > _capacity)
            _buffer.TryDequeue(out _);
    }

    /// <summary>버퍼에 쌓인 최근 메시지를 순서대로 반환한다.</summary>
    public string[] Snapshot() => _buffer.ToArray();

    public override void Flush() { /* 메모리 버퍼이므로 할 일 없다 */ }
}
```

사용은 이렇다.

```csharp
var ring = new RingBufferTraceListener(256);
Trace.Listeners.Add(ring);

try
{
    RunApplication();
}
catch (Exception ex)
{
    // 문제가 생긴 순간에만 직전 256줄을 덤프한다
    File.WriteAllLines("crash-context.log", ring.Snapshot());
    File.AppendAllText("crash-context.log", ex.ToString());
    throw;
}
```

심각도까지 받고 싶다면 `TraceEvent`를 재정의한다.

```csharp
public override void TraceEvent(TraceEventCache eventCache, string source,
                                TraceEventType eventType, int id, string message)
{
    if (Filter != null &&
        !Filter.ShouldTrace(eventCache, source, eventType, id, message,
                            null, null, null))
        return;

    WriteLine($"[{eventType}] {source}({id}): {message}");
}
```

> **⚠️ 커스텀 리스너는 스레드 안전해야 한다**
>
> `Trace`는 `Trace.UseGlobalLock`이 `true`(기본값)일 때 전역 잠금으로 리스너 호출을 직렬화한다. 하지만 리스너의 `IsThreadSafe` 속성을 `true`로 반환하도록 만들면 **잠금이 생략된다.** 성능을 위해 `IsThreadSafe`를 켰다면 내부 동기화는 전적으로 리스너의 책임이다. 반대로 `UseGlobalLock`을 켠 채로 두면 고빈도 로깅에서 전역 잠금이 병목이 된다. 이 트레이드오프가 `Trace`가 고성능 로깅에 부적합한 근본 이유이고, `ILogger`와 `EventSource`가 존재하는 이유다.

### `TraceSource` — 이름 있는 진단 채널

`Trace`는 프로세스 전역 싱글턴이라 라이브러리마다 채널을 나눌 수 없다. `TraceSource`가 그 해법이다. 이름과 스위치를 갖는 독립된 트레이스 채널이며, 자기만의 `Listeners` 컬렉션을 가진다.

```csharp
static readonly TraceSource Source =
    new TraceSource("MyLib.Networking", SourceLevels.Warning);

static void Connect(string host)
{
    Source.TraceEvent(TraceEventType.Information, 1000, "연결 시도: {0}", host);
    // ...
    Source.TraceEvent(TraceEventType.Error, 1001, "연결 실패: {0}", host);
}
```

```csharp
// 소비자 쪽에서 채널별로 다르게 구성한다
Source.Switch.Level = SourceLevels.All;
Source.Listeners.Clear();
Source.Listeners.Add(new TextWriterTraceListener("network.log"));
```

> **💡 라이브러리는 `Trace`가 아니라 `TraceSource`를 노출하라**
>
> 라이브러리가 `Trace.WriteLine`을 직접 호출하면 소비자는 그 라이브러리의 로그만 따로 끄거나 다른 파일로 보낼 방법이 없다. `public static TraceSource`를 하나 노출하면 소비자가 수준과 리스너를 독립적으로 제어할 수 있다. `System.Net.Http`를 포함한 여러 BCL 컴포넌트가 오랫동안 이 패턴을 썼다. 다만 새 라이브러리라면 `EventSource`(66.6절)나 `ILogger`(75.1절)를 우선 검토하라.

### 플러시와 종료

`TextWriterTraceListener` 같은 일부 리스너는 최종적으로 **캐시가 적용되는 스트림**에 쓴다. 여기에는 두 가지 함의가 있다.

- 메시지가 출력 스트림이나 파일에 **즉시 나타나지 않을 수 있다.**
- 애플리케이션이 끝나기 전에 리스너를 닫거나 최소한 플러시해야 한다. 그러지 않으면 캐시에 있는 내용을 잃는다(파일에 쓰는 경우 기본적으로 **최대 4KB**).

`Trace`와 `Debug` 클래스는 모든 리스너에 대해 `Close`나 `Flush`를 호출하는 정적 `Close`·`Flush` 메서드를 제공한다(이는 다시 하위 라이터와 스트림의 `Close`/`Flush`를 호출한다). `Close`는 암묵적으로 `Flush`를 호출하고, 파일 핸들을 닫으며, 이후 데이터가 더 쓰이는 것을 막는다.

일반 규칙은 이렇다. **애플리케이션이 끝나기 전에 `Close`를 호출하고, 현재까지의 메시지가 확실히 기록되게 하고 싶을 때마다 `Flush`를 호출한다.** 스트림 기반이나 파일 기반 리스너를 쓰는 경우에 해당한다.

`Trace`와 `Debug`에는 `AutoFlush` 속성도 있으며, `true`면 메시지마다 `Flush`를 강제한다.

> **💡 파일·스트림 리스너를 쓴다면 `AutoFlush`를 켜라**
>
> 처리되지 않은 예외나 치명적 오류가 발생하면, **마지막 4KB의 진단 정보를 통째로 잃는다.** 그리고 그 4KB야말로 사고 원인이 적혀 있는 부분이다. 성능 손해를 감수하더라도 `Trace.AutoFlush = true`로 두는 것이 낫다. 로그가 없어서 원인을 못 찾는 것보다 로그 쓰기가 느린 편이 낫다.
>
> ```csharp
> Trace.AutoFlush = true;
> ```

`AutoFlush`를 켜지 않는다면 종료 경로를 확실히 잡아야 한다.

```csharp
AppDomain.CurrentDomain.ProcessExit += (_, _) => Trace.Close();
AppDomain.CurrentDomain.UnhandledException += (_, _) => Trace.Flush();
Console.CancelKeyPress += (_, _) => Trace.Flush();
```

> **⚠️ `ProcessExit`는 항상 실행되지 않는다**
>
> `Environment.FailFast`, `Process.Kill`, `SIGKILL`, 스택 오버플로, OOM 킬러에 의한 종료에서는 `ProcessExit`가 **실행되지 않는다.** 또한 런타임에 따라 `ProcessExit` 핸들러 전체에 시간 제한이 걸려 있어(특히 .NET Framework) 느린 플러시가 도중에 잘릴 수 있다. 종료 훅에만 의존하는 로깅 전략은 정확히 "프로세스가 비정상 종료했을 때" 실패한다. `AutoFlush`가 더 안전한 이유다.

### ※ `Trace.CorrelationManager`와 `Activity`

`Trace.CorrelationManager`는 `ActivityId`(`Guid`)와 `LogicalOperationStack`을 제공해 논리적 작업 단위를 상관(correlate)시키는 오래된 메커니즘이다. `TraceOptions.LogicalOperationStack`을 켜면 이 스택이 로그에 함께 남는다.

```csharp
Trace.CorrelationManager.StartLogicalOperation("주문처리");
try { /* ... */ }
finally { Trace.CorrelationManager.StopLogicalOperation(); }
```

**현대 .NET에서는 이 역할을 `System.Diagnostics.Activity`가 대체했다.** `Activity.Current`가 앰비언트 컨텍스트를 제공하고, `ActivityTraceId`/`ActivitySpanId`가 W3C Trace Context 규격의 128비트/64비트 식별자를 담아 프로세스 경계를 넘어 전파된다.

```csharp
Console.WriteLine(Activity.Current?.TraceId);   // ActivityTraceId (32자리 16진수)
Console.WriteLine(Activity.Current?.SpanId);    // ActivitySpanId  (16자리 16진수)
```

`ActivitySource`로 스팬을 만들고 전파하는 방법, OpenTelemetry와의 연동은 **75.4절과 75.5절에서 다룬다.** 여기서는 이 타입들이 `System.Diagnostics`에 존재하고 `Trace.CorrelationManager`의 후계자라는 사실만 짚어둔다.

---

## 73.4 `StackTrace`와 `StackFrame`으로 호출 스택 읽기

`StackTrace`와 `StackFrame` 클래스는 실행 호출 스택의 **읽기 전용 뷰**를 제공한다. 현재 스레드의 스택 트레이스나 `Exception` 객체의 스택 트레이스를 얻을 수 있다. 이런 정보는 주로 진단 목적으로 쓰이지만, 프로그래밍(꼼수)에도 쓸 수 있다. `StackTrace`는 완전한 호출 스택을, `StackFrame`은 그 안의 단일 메서드 호출을 나타낸다.

> **📌 호출자 이름만 필요하다면 호출자 정보 특성이 낫다**
>
> 호출한 메서드의 이름과 줄 번호만 알면 된다면, 호출자 정보 특성(`[CallerMemberName]`, `[CallerFilePath]`, `[CallerLineNumber]`)이 훨씬 쉽고 빠른 대안이다. 이들은 **컴파일 시점에 리터럴로 치환**되므로 런타임 비용이 0이다. 20.11절에서 다뤘다.
>
> ```csharp
> static void Log(string msg,
>                 [CallerMemberName] string member = null,
>                 [CallerLineNumber] int line = 0)
>     => Console.WriteLine($"{member}:{line} {msg}");
> ```

### 현재 스택 뜨기

인자 없이 — 또는 `bool` 인자 하나로 — `StackTrace` 객체를 인스턴스화하면 현재 스레드 호출 스택의 스냅숏을 얻는다. `bool` 인자가 `true`면 어셈블리의 `.pdb`(project debug) 파일이 있을 때 이를 읽어 **파일명, 줄 번호, 열 오프셋** 데이터에 접근하게 해준다. `.pdb` 파일은 `/debug` 스위치로 컴파일할 때 생성된다.

`StackTrace`를 얻은 뒤에는 `GetFrame`으로 특정 프레임을 조사하거나 `GetFrames`로 전체를 얻는다.

```csharp
using System;
using System.Diagnostics;

class Program
{
    static void Main() { A(); }
    static void A()    { B(); }
    static void B()    { C(); }

    static void C()
    {
        StackTrace s = new StackTrace(true);

        Console.WriteLine("Total frames:   " + s.FrameCount);
        Console.WriteLine("Current method: " + s.GetFrame(0).GetMethod().Name);
        Console.WriteLine("Calling method: " + s.GetFrame(1).GetMethod().Name);
        Console.WriteLine("Entry method:   "
                          + s.GetFrame(s.FrameCount - 1).GetMethod().Name);

        Console.WriteLine("Call Stack:");
        foreach (StackFrame f in s.GetFrames())
            Console.WriteLine(
                "  File: "   + f.GetFileName() +
                " Line: "    + f.GetFileLineNumber() +
                " Col: "     + f.GetFileColumnNumber() +
                " Offset: "  + f.GetILOffset() +
                " Method: "  + f.GetMethod().Name);
    }
}
```

출력은 이렇다.

```text
Total frames:   4
Current method: C
Calling method: B
Entry method:   Main
Call Stack:
  File: C:\Test\Program.cs Line: 15 Col: 4  Offset: 7 Method: C
  File: C:\Test\Program.cs Line: 12 Col: 22 Offset: 6 Method: B
  File: C:\Test\Program.cs Line: 11 Col: 22 Offset: 6 Method: A
  File: C:\Test\Program.cs Line: 10 Col: 25 Offset: 6 Method: Main
```

프레임 0이 **현재 메서드**이고, 인덱스가 커질수록 호출자 쪽으로 거슬러 올라간다. 마지막 프레임이 진입점이다.

### IL 오프셋과 줄 번호는 서로 다른 것을 가리킨다

> **⚠️ IL 오프셋은 "다음에 실행될" 명령의 오프셋이다**
>
> `GetILOffset()`이 반환하는 중간 언어(IL) 오프셋은 **지금 실행 중인 명령이 아니라 다음에 실행될 명령**의 오프셋이다. 그런데 이상하게도 줄 번호와 열 번호(`.pdb`가 있을 때)는 대개 **실제 실행 지점**을 가리킨다.
>
> 이유는 이렇다. CLR은 IL 오프셋으로부터 줄·열을 계산할 때 실제 실행 지점을 추론하려고 최선을 다한다. 컴파일러는 이것이 가능하도록 IL을 방출하며, 그 방법 중 하나가 IL 스트림에 `nop`(no-operation) 명령을 삽입하는 것이다.
>
> **최적화를 켜고 컴파일하면 `nop` 삽입이 비활성화된다.** 그래서 스택 트레이스가 다음에 실행될 문장의 줄·열 번호를 보여줄 수 있다. 게다가 최적화는 다른 재주도 부린다 — 메서드를 통째로 접어버리는(인라이닝) 것이 대표적이다.

### `ToString`과 예외 스택

`StackTrace` 전체의 핵심 정보를 얻는 지름길은 `ToString`을 호출하는 것이다.

```text
   at DebugTest.Program.C() in C:\Test\Program.cs:line 16
   at DebugTest.Program.B() in C:\Test\Program.cs:line 12
   at DebugTest.Program.A() in C:\Test\Program.cs:line 11
   at DebugTest.Program.Main() in C:\Test\Program.cs:line 10
```

`Exception` 객체를 `StackTrace`의 생성자에 넘기면 예외가 던져지기까지의 스택 트레이스를 얻을 수 있다.

```csharp
try { A(); }
catch (Exception ex)
{
    var st = new StackTrace(ex, fNeedFileInfo: true);
    foreach (StackFrame f in st.GetFrames())
        Log(f.GetMethod()?.DeclaringType?.FullName,
            f.GetMethod()?.Name,
            f.GetILOffset());
}
```

> **📌 `Exception.StackTrace`는 문자열이고 `StackTrace`는 객체다**
>
> `Exception`에는 이미 `StackTrace` 속성이 있지만, 이 속성은 단순한 **문자열**을 반환한다. `StackTrace` **객체**는 배포 후 — `.pdb` 파일이 없는 환경에서 — 예외를 기록할 때 훨씬 쓸모가 있다. 줄·열 번호 대신 **IL 오프셋**을 기록할 수 있기 때문이다. IL 오프셋과 `ildasm`이 있으면 메서드 안 어디에서 오류가 났는지 정확히 짚어낼 수 있다.

### ⚠️ 릴리스 빌드·트리밍·AOT에서의 열화

이 절의 예제들은 전부 **디버그 빌드에 `.pdb`가 곁에 있는** 이상적 상황을 가정한다. 실제 배포 환경에서 `StackTrace`가 얼마나 열화되는지 정리하면 다음과 같다.

| 환경 | 메서드 이름 | 줄·열 번호 | IL 오프셋 | 프레임 누락 |
|---|---|---|---|---|
| Debug + `.pdb` 동봉 | 정확 | **정확** | 정확 | 없음 |
| Release + portable `.pdb` 동봉 | 정확 | 대체로 정확(±1행) | 정확 | **인라이닝된 프레임 누락** |
| Release, `.pdb` 없음 | 정확 | `0` | 정확 | 인라이닝된 프레임 누락 |
| 트리밍(`PublishTrimmed`) | 정확 | `.pdb` 유무에 따름 | 정확 | 인라이닝된 프레임 누락 |
| Native AOT | **열화 가능** | 대개 없음 | `-1`(`OFFSET_UNKNOWN`) | 인라이닝 + 최적화 병합 |

> **⚠️ Native AOT에서는 스택 트레이스 메타데이터가 기본적으로 축소된다**
>
> Native AOT 게시본은 크기를 줄이기 위해 스택 트레이스용 메타데이터를 줄이거나 제거할 수 있다. 그 결과 `StackFrame.GetMethod()`가 `null`을 반환하거나, 메서드 이름이 사라져 트레이스가 `at <Module>.<Unknown>` 형태로 나올 수 있다. 이름을 보존하려면 다음을 켠다.
>
> ```xml
> <PropertyGroup>
>   <StackTraceSupport>true</StackTraceSupport>   <!-- 기본값이지만 명시해 둘 가치가 있다 -->
> </PropertyGroup>
> ```
>
> 반대로 크기를 최소화하려고 `<StackTraceSupport>false</StackTraceSupport>`를 켰다면, **프로덕션 예외 로그가 사실상 무용지물이 된다는 것**을 알고 켜야 한다. 트리밍·AOT가 리플렉션 기반 코드를 깨뜨리는 더 넓은 논의는 57.14절에 있다.

> **⚠️ 인라이닝된 프레임은 그냥 사라진다**
>
> Release 빌드에서 JIT은 작은 메서드를 호출자에 인라이닝한다. 인라이닝된 메서드는 **스택 프레임을 갖지 않으므로** `StackTrace`에 나타나지 않는다. "분명히 이 메서드를 거쳤는데 트레이스에 없다"는 상황의 원인이다. 특정 메서드를 반드시 트레이스에 남기고 싶다면 인라이닝을 막아야 한다.
>
> ```csharp
> [MethodImpl(MethodImplOptions.NoInlining)]
> static void MustAppearInStackTrace() { /* ... */ }
> ```
>
> 물론 이것은 성능 손해를 감수하는 결정이다. 진단을 위해 성능을 포기하는 셈이니 뜨거운 경로에는 쓰지 마라.

### `Environment.StackTrace`

한 줄로 현재 스택의 문자열 표현이 필요하다면 `Environment.StackTrace`가 있다.

```csharp
Console.WriteLine(Environment.StackTrace);
```

```text
   at System.Environment.get_StackTrace()
   at MyApp.Service.Handle(Request r) in /src/Service.cs:line 42
   at MyApp.Program.Main() in /src/Program.cs:line 12
```


내부적으로 `new StackTrace(true).ToString()`과 유사하게 동작하며 `.pdb`가 있으면 파일·줄 정보를 포함한다. `StackTrace` 객체를 만들 필요 없이 문자열만 있으면 될 때 편하다.

> **⚠️ `Environment.StackTrace`는 첫 프레임에 자기 자신을 포함한다**
>
> 위 출력의 첫 줄 `at System.Environment.get_StackTrace()`가 그것이다. 로그에 그대로 남기면 매번 쓸모없는 한 줄이 붙는다. `new StackTrace(skipFrames: 1, fNeedFileInfo: true)`를 쓰면 원하는 만큼 프레임을 건너뛸 수 있다.

### ※ `[StackTraceHidden]` — .NET 6

`System.Diagnostics.StackTraceHiddenAttribute`(※.NET 6)를 메서드·생성자·타입에 붙이면, **예외 스택 트레이스 문자열 생성 시 그 프레임이 생략된다.** BCL이 `ThrowHelper` 같은 예외 던지기 헬퍼를 감추는 데 쓰는 바로 그 특성이다.

```csharp
using System.Diagnostics;

static class Guard
{
    [StackTraceHidden]
    public static void NotNull<T>(T value, string name) where T : class
    {
        if (value is null) throw new ArgumentNullException(name);
    }
}
```

`Guard.NotNull`이 예외를 던져도 사용자가 보는 스택 트레이스는 `Guard.NotNull` 프레임 없이 **실제 호출 지점부터** 시작한다. 예외 로그에서 프레임워크 잡음을 걷어내는 데 매우 유용하다.

> **⚠️ `[StackTraceHidden]`은 문자열 생성에만 영향을 준다**
>
> 이 특성은 `Exception.StackTrace`와 `StackTrace.ToString()`이 만드는 **문자열**에서만 프레임을 감춘다. `StackTrace.GetFrames()`가 반환하는 프레임 배열에는 그대로 남아 있고, 디버거의 호출 스택 창에도 나타난다. "숨김"이 아니라 "출력에서 생략"이다. 그리고 이것은 **실행에 아무 영향을 주지 않는다** — 인라이닝 여부도 바꾸지 않는다.

### 디버거 특성 — 스택과 표시를 제어한다

`StackTrace`가 "런타임이 스택을 어떻게 보여주는가"의 문제라면, 디버거 특성은 "디버거가 코드와 데이터를 어떻게 보여주는가"의 문제다. 둘은 같은 목적을 공유한다. **잡음을 걷어내고 사람이 봐야 할 것만 남기는 것.**

`DebuggerStepThrough`와 `DebuggerHidden` 특성은 특정 메서드·생성자·클래스에 대해 단계별 실행(single-stepping)을 어떻게 처리할지 디버거에 제안한다.

`DebuggerStepThrough`는 사용자 상호작용 없이 함수를 통과해 지나가라고 요청한다. 자동 생성된 메서드나, 실제 작업을 다른 곳으로 전달하는 프록시 메서드에 유용하다. 후자의 경우, "진짜" 메서드 안에 중단점을 설정하면 디버거는 여전히 호출 스택에 프록시 메서드를 보여준다 — `DebuggerHidden` 특성을 함께 붙이지 않는 한. 이 둘을 프록시에 조합하면 사용자가 배관이 아니라 애플리케이션 로직에 집중하도록 도울 수 있다.

```csharp
[DebuggerStepThrough, DebuggerHidden]
void DoWorkProxy()
{
    // 준비 작업...
    DoWork();
    // 정리 작업...
}

void DoWork() { /* 진짜 메서드 */ }
```

전체 목록은 다음과 같다.

| 특성 | 적용 대상 | 효과 |
|---|---|---|
| `[DebuggerStepThrough]` | 클래스, 구조체, 생성자, 메서드 | 단계별 실행 시 **통과**한다. 내부 중단점은 여전히 걸린다 |
| `[DebuggerHidden]` | 클래스, 생성자, 메서드, 속성 | 호출 스택 창에서 **감춘다**. 내부 중단점도 **무시된다** |
| `[DebuggerNonUserCode]` | 클래스, 구조체, 생성자, 메서드, 속성 | "내 코드만(Just My Code)"이 켜져 있을 때 사용자 코드가 아닌 것으로 취급 |
| `[DebuggerDisplay]` | 클래스, 구조체, 델리게이트, 열거형, 필드, 속성, 어셈블리 | 감시 창에 **표시할 문자열 형식**을 지정 |
| `[DebuggerBrowsable]` | 필드, 속성, 인덱서 | 감시 창에서 멤버를 **숨기거나 펼침** 방식을 지정 |
| `[DebuggerTypeProxy]` | 클래스, 구조체, 어셈블리 | 감시 창에서 **대신 보여줄 대리 타입**을 지정 |
| `[DebuggerVisualizer]` | 어셈블리 | 사용자 정의 시각화 도구 등록(Visual Studio 전용) |
| `[DebuggerStepperBoundary]` | 메서드 | 단계별 실행 경계를 강제(스레드 전환 지점 등) |

`[DebuggerDisplay]`는 중괄호 안에 식을 넣는다.

```csharp
[DebuggerDisplay("{Name,nq} ({Items.Count}개, {IsActive ? \"활성\" : \"비활성\",nq})")]
public sealed class Basket
{
    public string Name { get; init; }
    public List<string> Items { get; } = new();
    public bool IsActive { get; set; }
}
```

`,nq`는 "no quotes"의 약자로 문자열을 따옴표 없이 표시하라는 뜻이다. 감시 창에서 `Basket` 인스턴스는 `{Basket}` 대신 `장바구니 (3개, 활성)`으로 보인다.

`[DebuggerBrowsable]`은 잡음을 줄인다.

```csharp
public sealed class Matrix
{
    [DebuggerBrowsable(DebuggerBrowsableState.Never)]
    readonly double[] _raw;            // 감시 창에 아예 나타나지 않는다

    [DebuggerBrowsable(DebuggerBrowsableState.RootHidden)]
    public double[] Values => _raw;    // 배열 자체 대신 원소들이 바로 펼쳐진다
}
```

`DebuggerBrowsableState`는 세 값을 갖는다. `Never`는 감시 창에 아예 표시하지 않고, `Collapsed`는 접힌 상태로 표시하며(기본값), `RootHidden`은 자신을 감추고 **자식 원소를 부모 자리에** 펼쳐 보여준다.

`[DebuggerTypeProxy]`는 복잡한 내부 구조를 가진 타입을 사람이 읽을 수 있는 형태로 바꿔 보여준다. BCL의 `Dictionary<TKey,TValue>`가 버킷 배열 대신 키-값 쌍 목록으로 보이는 것이 바로 이 특성 덕분이다.

```csharp
[DebuggerTypeProxy(typeof(RingBufferDebugView))]
public sealed class RingBuffer<T>
{
    internal T[] _items;
    internal int _head, _count;
    // ...

    sealed class RingBufferDebugView                 // 대리 타입은 대상을 받는 생성자 하나가 필요하다
    {
        readonly RingBuffer<T> _t;
        public RingBufferDebugView(RingBuffer<T> target) => _t = target;

        [DebuggerBrowsable(DebuggerBrowsableState.RootHidden)]
        public T[] Items => Enumerable
            .Range(0, _t._count)
            .Select(i => _t._items[(_t._head + i) % _t._items.Length])
            .ToArray();                              // 논리적 순서로 펼쳐 보여준다
    }
}
```

> **⚠️ `[DebuggerDisplay]`와 프록시의 식은 디버거가 평가한다 — 부수 효과에 주의**
>
> 감시 창은 이 식들을 **자동으로, 자주, 그리고 브레이크할 때마다** 평가한다. 식이 지연 초기화를 트리거하거나, 상태를 바꾸거나, 잠금을 잡거나, I/O를 하면 **디버깅 중에만 관찰되는 하이젠버그**가 만들어진다. 최악의 경우 디버거가 평가 타임아웃에 걸려 감시 창이 통째로 먹통이 된다. `[DebuggerDisplay]` 식과 프록시 속성은 **순수하고 값싸고 예외를 던지지 않아야 한다.**

> **⚠️ 디버거 특성은 "제안"이지 보장이 아니다**
>
> 이들은 모두 디버거에 대한 **힌트**다. Visual Studio는 대부분을 지원하지만 다른 디버거(WinDbg, lldb, Rider의 일부 모드)는 무시하거나 다르게 해석한다. 또한 `[DebuggerHidden]`은 "내 코드만" 설정이 꺼져 있으면 `[DebuggerNonUserCode]`와 동작이 달라진다. 그리고 이 특성들은 **런타임 동작을 전혀 바꾸지 않는다** — 예외 스택 트레이스 문자열에도 영향을 주지 않는다(그건 앞서 본 `[StackTraceHidden]`의 역할이다).

디버거를 실제로 붙이고, 중단점을 걸고, 이 특성들의 효과를 IDE에서 확인하는 워크플로는 **74.1절과 74.2절**에서 다룬다.

---

## 73.5 `Process`와 `ProcessThread` — 실행 중인 프로세스·스레드 조사

`Process.Start`로 새 프로세스를 띄우는 방법은 이미 봤다. `Process` 클래스는 그 밖에도 **같은 컴퓨터나 다른 컴퓨터에서 실행 중인 다른 프로세스를 조회하고 상호작용하는** 기능을 제공한다. `Process` 클래스는 .NET Standard 2.0의 일부지만, 플랫폼에 따라 기능이 제한된다.

### 실행 중인 프로세스 조사하기

`Process.GetProcessXXX` 메서드들은 이름이나 프로세스 ID로 특정 프로세스를 얻거나, 현재 또는 지정한 컴퓨터에서 실행 중인 모든 프로세스를 얻는다. 여기에는 관리 프로세스와 비관리 프로세스가 모두 포함된다. 각 `Process` 인스턴스는 이름, ID, 우선순위, 메모리·프로세서 사용량, 윈도 핸들 같은 통계를 매핑하는 풍부한 속성을 갖는다.

```csharp
foreach (Process p in Process.GetProcesses())
    using (p)
    {
        Console.WriteLine(p.ProcessName);
        Console.WriteLine("   PID:     " + p.Id);
        Console.WriteLine("   Memory:  " + p.WorkingSet64);
        Console.WriteLine("   Threads: " + p.Threads.Count);
    }
```

`Process.GetCurrentProcess`는 현재 프로세스를 반환한다. `Kill` 메서드를 호출하면 프로세스를 종료시킬 수 있다.

> **⚠️ `Process` 인스턴스는 반드시 `Dispose`하라**
>
> `Process` 객체는 운영체제 핸들(Windows에서는 프로세스 핸들, Unix에서는 파일 디스크립터)을 잡고 있다. `GetProcesses()`는 수백 개를 한 번에 만들어내므로 `Dispose`하지 않으면 핸들이 누적된다. 위 예제처럼 `using`으로 감싸거나, 필요한 정보만 뽑고 즉시 버려라. 파이널라이저가 결국 정리하긴 하지만 그때까지 핸들이 살아 있다.

### 실무에서 쓰는 속성들

```csharp
using Process p = Process.GetCurrentProcess();

Console.WriteLine($"이름:             {p.ProcessName}");
Console.WriteLine($"PID:              {p.Id}");
Console.WriteLine($"시작 시각:        {p.StartTime}");
Console.WriteLine($"CPU 시간:         {p.TotalProcessorTime} "
                + $"(사용자 {p.UserProcessorTime}, 커널 {p.PrivilegedProcessorTime})");
Console.WriteLine($"작업 집합:        {p.WorkingSet64:N0} bytes");
Console.WriteLine($"전용/가상 메모리: {p.PrivateMemorySize64:N0} / {p.VirtualMemorySize64:N0}");
Console.WriteLine($"스레드/핸들 수:   {p.Threads.Count} / {p.HandleCount}");
Console.WriteLine($"주 모듈:          {p.MainModule?.FileName}");
```

| 속성 | 의미 | 크로스 플랫폼 |
|---|---|---|
| `Id`, `ProcessName` | PID와 실행 파일 이름 | 예(Linux 주의 사항 아래) |
| `StartTime` | 프로세스 시작 시각 | 예 |
| `TotalProcessorTime` | 사용자 + 커널 CPU 시간 | 예 |
| `WorkingSet64` | 물리 메모리 상주 크기(RSS) | 예 |
| `PrivateMemorySize64` | 공유되지 않는 커밋 메모리 | 예 |
| `VirtualMemorySize64` | 가상 주소 공간 크기 | 예 |
| `HandleCount` | 열린 핸들 수 | Windows 중심 |
| `Threads` | `ProcessThread` 컬렉션 | 예(속성별 제한) |
| `Modules`, `MainModule` | 로드된 모듈 목록 | 예(권한 필요) |
| `PriorityClass` | 프로세스 우선순위 클래스 | 부분(아래 참조) |
| `ProcessorAffinity` | CPU 선호도 마스크 | **Windows/Linux만** |
| `MainWindowTitle`, `MainWindowHandle` | 주 창 정보 | **Windows 전용** |
| `Responding` | UI 응답 여부 | **Windows 전용** |
| `Kill()`, `Kill(bool entireProcessTree)` | 강제 종료(후자는 ※.NET Core 3.0) | 예 |
| `WaitForExit()`, `WaitForExitAsync()` | 종료 대기(후자는 ※.NET 5) | 예 |
| `Exited` 이벤트 + `EnableRaisingEvents` | 종료 알림 | 예 |

### ⚠️ `Process`가 Linux·컨테이너에서 다르게 동작하는 지점

`Process`는 API 표면이 크로스 플랫폼이지만, **의미론은 플랫폼마다 상당히 다르다.** 실무에서 부딪히는 지점을 정리한다.

> **⚠️ Linux에서 `ProcessName`은 15자에서 잘린다**
>
> Linux의 `Process.ProcessName`은 `/proc/[pid]/stat`의 `comm` 필드에서 온다. 이 필드는 커널이 **15자로 제한**한다. `MyVeryLongServiceName`이라는 실행 파일은 `MyVeryLongServi`로 보인다. 따라서 `Process.GetProcessesByName("MyVeryLongServiceName")`은 Linux에서 **아무것도 찾지 못한다.** 이름으로 프로세스를 찾는 코드는 Linux에서 조용히 실패한다. `/proc/[pid]/cmdline`을 직접 읽거나, 이름 대신 PID 파일을 쓰는 편이 안전하다.

> **⚠️ 컨테이너 안에서는 자기 PID 네임스페이스만 보인다**
>
> 컨테이너 안에서 `Process.GetProcesses()`를 호출하면 **같은 PID 네임스페이스의 프로세스만** 반환한다. 보통 애플리케이션 프로세스 하나(PID 1)와 그 자식들뿐이다. 호스트의 다른 프로세스는 존재하지 않는 것처럼 보인다. "스테이징에서는 되는데 쿠버네티스에서는 안 된다"는 문제의 흔한 원인이다.

> **⚠️ `WorkingSet64`는 cgroup 제한을 반영하지 않는다**
>
> 컨테이너에 512MB 메모리 제한이 걸려 있어도 `Process.VirtualMemorySize64`나 `Environment.WorkingSet`은 **호스트 기준**의 숫자를 보여준다. 컨테이너의 실제 한도를 알고 싶다면 GC가 인식하는 값을 봐야 한다.
>
> ```csharp
> var info = GC.GetGCMemoryInfo();
> Console.WriteLine($"런타임이 인식한 사용 가능 메모리: "
>                 + $"{info.TotalAvailableMemoryBytes:N0} bytes");
> Console.WriteLine($"높은 메모리 임계값: {info.HighMemoryLoadThresholdBytes:N0}");
> ```
>
> 런타임은 cgroup v1/v2의 메모리 제한을 읽어 GC 힙 예산을 조정한다(65장). `Process`는 그러지 않는다.

> **⚠️ 원격 컴퓨터 조회는 Windows 전용이다**
>
> `Process.GetProcesses(machineName)`과 `Process.GetProcessById(id, machineName)`은 Windows의 원격 성능 카운터 인프라에 의존한다. Unix에서 호출하면 `PlatformNotSupportedException`이 난다. 원격 진단이 필요하면 `dotnet-monitor` 같은 HTTP 기반 도구를 쓰는 것이 현대적 해법이다.

> **⚠️ `PriorityClass`의 값 범위가 플랫폼마다 다르다**
>
> Windows의 `ProcessPriorityClass`는 여섯 단계지만, Unix에서는 `nice` 값으로 매핑되며 일부 값만 유효하다. 그리고 우선순위를 **올리는** 것은 대개 권한이 필요해 `Win32Exception` 또는 `UnauthorizedAccessException`이 난다. 내리는 것만 항상 허용된다.

### 프로세스의 스레드 조사하기

`Process.Threads` 속성으로 다른 프로세스의 스레드를 열거할 수도 있다. 그런데 여기서 얻는 객체는 `System.Threading.Thread` 객체가 **아니다.** `ProcessThread` 객체이며, 동기화가 아니라 **관리(administrative) 작업**을 위한 것이다. `ProcessThread` 객체는 하위 스레드에 대한 진단 정보를 제공하고, 우선순위나 프로세서 선호도 같은 일부 측면을 제어할 수 있게 한다.

```csharp
public void EnumerateThreads(Process p)
{
    foreach (ProcessThread pt in p.Threads)
    {
        Console.WriteLine(pt.Id);
        Console.WriteLine("   State:    " + pt.ThreadState);
        Console.WriteLine("   Priority: " + pt.PriorityLevel);
        Console.WriteLine("   Started:  " + pt.StartTime);
        Console.WriteLine("   CPU time: " + pt.TotalProcessorTime);
    }
}
```

> **⚠️ `ProcessThread`는 관리 스레드가 아니다**
>
> `ProcessThread.Id`는 **운영체제 스레드 ID**이고, `Thread.CurrentThread.ManagedThreadId`는 **CLR 관리 스레드 ID**다. 둘은 전혀 다른 숫자 공간이며 서로 매핑할 공개 API가 없다. 게다가 `ProcessThread`에는 스레드 풀 스레드인지, 어떤 관리 메서드를 실행 중인지 알 방법이 전혀 없다. "어떤 스레드가 뭘 하고 있는지" 알고 싶다면 `ProcessThread`가 아니라 덤프 분석(74.5절)이나 `dotnet-stack`을 써야 한다.

`ProcessThread`의 속성별 플랫폼 지원은 특히 들쭉날쭉하다.

| 멤버 | Windows | Linux | macOS |
|---|---|---|---|
| `Id` | 지원 | 지원 | 지원 |
| `ThreadState` | 지원 | 지원 | 지원 |
| `TotalProcessorTime` | 지원 | 지원 | **미지원** |
| `StartTime` | 지원 | 지원 | **미지원** |
| `PriorityLevel` | 지원 | 지원(읽기) | **미지원** |
| `ProcessorAffinity` | 지원 | 미지원 | 미지원 |
| `WaitReason` | 지원 | **미지원** | **미지원** |
| `IdealProcessor`(설정) | 지원 | 미지원 | 미지원 |

> **⚠️ 미지원 멤버는 `PlatformNotSupportedException`을 던진다 — `null`을 반환하지 않는다**
>
> 크로스 플랫폼 진단 코드를 쓸 때 이것을 잊으면 진단 코드가 진단 대상보다 먼저 죽는다. `OperatingSystem.IsWindows()` 같은 가드로 감싸거나, 각 속성 접근을 `try`/`catch (PlatformNotSupportedException)`로 감싸라. 후자가 지저분해 보이지만 진단 코드에서는 정당한 선택이다.
>
> ```csharp
> static string Safe(Func<object> get)
> {
>     try { return get()?.ToString() ?? "(null)"; }
>     catch (PlatformNotSupportedException) { return "(미지원)"; }
>     catch (Exception ex) { return $"(오류: {ex.GetType().Name})"; }
> }
> ```

### 실전 — 자기 프로세스 진단 스냅숏

`Process`가 가장 유용한 용도는 사실 남의 프로세스를 들여다보는 것이 아니라 **자기 자신의 상태를 로그에 남기는 것**이다. 다음은 이식성을 고려한 스냅숏 함수다.

```csharp
using System.Diagnostics;
using System.Text;

static string CaptureDiagnosticSnapshot()
{
    var sb = new StringBuilder();
    using var p = Process.GetCurrentProcess();
    p.Refresh();                          // 캐시된 값을 갱신한다

    sb.AppendLine($"시각      : {DateTimeOffset.UtcNow:O}");
    sb.AppendLine($"프로세스  : {p.ProcessName} (PID {p.Id}), 가동 {DateTime.Now - p.StartTime}");
    sb.AppendLine($"CPU 시간  : {p.TotalProcessorTime}");
    sb.AppendLine($"작업 집합 : {p.WorkingSet64 / 1024 / 1024} MB, OS 스레드 {p.Threads.Count}개");

    // 런타임 관점의 수치는 Process가 아니라 GC/ThreadPool에서 얻는다
    var gc = GC.GetGCMemoryInfo();
    sb.AppendLine($"관리 힙   : {GC.GetTotalMemory(false) / 1024 / 1024} MB "
                + $"(사용 가능 {gc.TotalAvailableMemoryBytes / 1024 / 1024} MB)");
    sb.AppendLine($"GC 횟수   : G0={GC.CollectionCount(0)} "
                + $"G1={GC.CollectionCount(1)} G2={GC.CollectionCount(2)}");
    ThreadPool.GetAvailableThreads(out int w, out int io);
    sb.AppendLine($"풀 여유   : worker={w} io={io}, 보류 {ThreadPool.PendingWorkItemCount}건");

    return sb.ToString();
}
```

> **⚠️ `Process` 속성은 캐시된다 — `Refresh()`를 잊지 마라**
>
> `Process` 인스턴스는 속성을 처음 읽을 때 OS에서 값을 가져와 **캐시한다.** 루프를 돌며 `p.WorkingSet64`를 반복해서 읽으면 같은 값만 계속 나온다. 폴링하려면 매 반복마다 `p.Refresh()`를 호출해야 한다. 이 함정은 "메모리가 전혀 늘지 않는다"는 잘못된 결론으로 이어진다.

> **💡 자기 프로세스 폴링보다 `dotnet-counters`가 낫다**
>
> 위와 같은 스냅숏 코드는 사고 순간의 컨텍스트를 남길 때 가치가 있다. 하지만 **지속적인 모니터링**을 자체 코드로 구현하는 것은 대개 잘못된 선택이다. 폴링 스레드가 CPU를 쓰고, 값이 부정확하고, 저장·집계 인프라를 직접 만들어야 한다. 73.9절의 `dotnet-counters`나 75.3절의 `System.Diagnostics.Metrics`가 같은 일을 훨씬 적은 비용으로 한다.

---

## 73.6 Windows 이벤트 로그 쓰기·읽기·감시

> **⚠️ 이 절 전체가 Windows 전용이다**
>
> Windows 이벤트 로그는 Win32 플랫폼의 기능이다. `System.Diagnostics.EventLog` NuGet 패키지를 참조해야 하며, **Linux나 macOS에서 호출하면 `PlatformNotSupportedException`이 난다.** 컴파일은 통과한다. 크로스 플랫폼 대안은 이 절 끝에서 다룬다.

Win32 플랫폼은 Windows 이벤트 로그라는 형태로 중앙 집중식 로깅 메커니즘을 제공한다. 앞서 본 `Debug`와 `Trace` 클래스는 `EventLogTraceListener`를 등록하면 Windows 이벤트 로그에 쓴다. 그러나 `EventLog` 클래스를 쓰면 `Trace`나 `Debug`를 거치지 않고 **직접** 쓸 수 있다. 이 클래스로 이벤트 데이터를 읽고 감시할 수도 있다.

> **📌 왜 이벤트 로그인가**
>
> Windows 서비스 애플리케이션에서 Windows 이벤트 로그에 쓰는 것은 합리적이다. 뭔가 잘못되었을 때 "진단 정보를 어떤 특별한 파일에 써 뒀으니 보세요"라고 사용자에게 알릴 UI를 띄울 수 없기 때문이다. 또한 서비스가 이벤트 로그에 쓰는 것이 관행이므로, 서비스가 넘어졌을 때 관리자가 **가장 먼저 들여다볼 곳**이 바로 여기다.

표준 Windows 이벤트 로그는 세 개이며 다음 이름으로 식별된다.

- `Application`
- `System`
- `Security`

대부분의 애플리케이션은 `Application` 로그에 쓴다.

### 이벤트 로그에 쓰기

Windows 이벤트 로그에 쓰는 절차는 이렇다.

1. 세 이벤트 로그 중 하나를 고른다(보통 `Application`).
2. **소스 이름**을 정하고 필요하면 만든다(만드는 데는 관리자 권한이 필요하다).
3. 로그 이름, 소스 이름, 메시지 데이터로 `EventLog.WriteEntry`를 호출한다.

소스 이름은 애플리케이션을 쉽게 식별할 수 있는 이름이다. 쓰기 전에 반드시 등록해야 하며, `CreateEventSource` 메서드가 그 일을 한다.

```csharp
const string SourceName = "MyCompany.WidgetServer";

// CreateEventSource는 관리자 권한이 필요하므로
// 보통 애플리케이션 설치 과정에서 수행한다.
if (!EventLog.SourceExists(SourceName))
    EventLog.CreateEventSource(SourceName, "Application");

EventLog.WriteEntry(SourceName,
                    "Service started; using configuration file=...",
                    EventLogEntryType.Information);
```

`EventLogEntryType`은 `Information`, `Warning`, `Error`, `SuccessAudit`, `FailureAudit` 중 하나다. 각각 Windows 이벤트 뷰어에서 다른 아이콘으로 표시된다. 선택적으로 **범주**와 **이벤트 ID**(각각 임의로 정하는 숫자)를 지정할 수 있고, 선택적 이진 데이터도 제공할 수 있다.

```csharp
EventLog.WriteEntry(SourceName,
                    "주문 처리 실패",
                    EventLogEntryType.Error,
                    eventID: 5001,
                    category: 3,
                    rawData: System.Text.Encoding.UTF8.GetBytes(payload));
```

`CreateEventSource`는 머신 이름도 지정할 수 있다. 충분한 권한이 있다면 다른 컴퓨터의 이벤트 로그에 쓰기 위한 것이다.

> **⚠️ `SourceExists`조차 권한을 요구할 수 있다**
>
> `EventLog.SourceExists`는 레지스트리의 `HKLM\SYSTEM\CurrentControlSet\Services\EventLog` 아래를 훑는다. 비관리자 계정에서는 일부 로그의 하위 키를 읽지 못해 `SecurityException`이 날 수 있다. 관리자 권한이 필요한 것은 `CreateEventSource`뿐이라고 생각하고 `SourceExists`를 무방비로 호출하면, 권한이 낮은 서비스 계정에서 애플리케이션이 시작조차 못 한다. **소스 등록은 설치 프로그램에서 하고, 런타임 코드는 `WriteEntry`만 호출하는 구조**로 가라.

> **⚠️ 소스 이름은 전역이고 로그와 1:1로 묶인다**
>
> 소스 이름은 머신 전역 네임스페이스다. 이미 다른 로그(`System` 등)에 등록된 이름을 `Application`에 다시 등록하려 하면 실패한다. 또한 소스를 만든 직후 바로 쓰면 **이벤트 로그 서비스가 아직 캐시를 갱신하지 않아** 첫 항목이 엉뚱한 소스로 기록되거나 실패할 수 있다. 설치 후 재시작이 권장되는 이유다.

> **⚠️ `WriteEntry` 메시지에는 길이 제한이 있다**
>
> 단일 이벤트 로그 항목의 메시지는 약 32KB를 넘을 수 없고(`ArgumentException`), 이벤트 로그 자체도 최대 크기(`MaximumKilobytes`)와 넘침 정책(`OverflowAction`)을 갖는다. 기본 정책이 `OverwriteOlder`라면 오래된 항목이 지워지고, `DoNotOverwrite`라면 **로그가 가득 찬 뒤 쓰기가 실패한다.** 고빈도 로깅에 이벤트 로그를 쓰면 안 되는 이유다. 이벤트 로그는 **드물고 중요한 사건**을 위한 것이다.

### 이벤트 로그 읽기

이벤트 로그를 읽으려면 접근하려는 로그 이름과, 선택적으로 그 로그가 있는 다른 컴퓨터의 이름으로 `EventLog` 클래스를 인스턴스화한다. 그다음 `Entries` 컬렉션 속성으로 각 로그 항목을 읽는다.

```csharp
EventLog log = new EventLog("Application");

Console.WriteLine("Total entries: " + log.Entries.Count);

EventLogEntry last = log.Entries[log.Entries.Count - 1];
Console.WriteLine("Index:   " + last.Index);
Console.WriteLine("Source:  " + last.Source);
Console.WriteLine("Type:    " + last.EntryType);
Console.WriteLine("Time:    " + last.TimeWritten);
Console.WriteLine("Message: " + last.Message);
```

정적 메서드 `EventLog.GetEventLogs`로 현재(또는 다른) 컴퓨터의 모든 로그를 열거할 수 있다(전체 접근에는 관리자 권한이 필요하다).

```csharp
foreach (EventLog log in EventLog.GetEventLogs())
    Console.WriteLine(log.LogDisplayName);
```

이는 보통 최소한 `Application`, `Security`, `System`을 출력한다.

> **⚠️ `Entries`는 지연 로딩되는 컬렉션이다 — LINQ로 훑지 마라**
>
> `EventLogEntryCollection`은 인덱서로 접근할 때마다 이벤트 로그 서비스에 질의한다. `log.Entries.Where(e => e.TimeWritten > cutoff).ToList()` 같은 코드는 **수십만 개의 항목을 하나씩 마샬링**하며, 큰 로그에서는 수 분이 걸린다. 조건 검색이 필요하면 아래의 `EventLogQuery`를 써라.

### ※ 현대적 읽기 API — `EventLogQuery`와 `EventLogReader`

`System.Diagnostics.Eventing.Reader` 네임스페이스(같은 NuGet 패키지에 포함)는 Windows Vista에서 도입된 **Windows Event Log API**를 감싼다. XPath 기반 질의를 서버 쪽에서 수행하므로 훨씬 빠르고, 클래식 세 로그를 넘어 채널 단위 로그(`Microsoft-Windows-...`)에도 접근한다.

```csharp
using System.Diagnostics.Eventing.Reader;

// 지난 1시간 동안의 오류(Level=2) 항목만 서버 쪽에서 걸러 가져온다
var query = new EventLogQuery("Application", PathType.LogName,
    "*[System[(Level=2) and TimeCreated[timediff(@SystemTime) <= 3600000]]]");

using var reader = new EventLogReader(query);
for (EventRecord rec = reader.ReadEvent(); rec != null; rec = reader.ReadEvent())
    using (rec)
        Console.WriteLine($"{rec.TimeCreated:HH:mm:ss} "
                        + $"[{rec.ProviderName}] {rec.FormatDescription()}");
```

정리하면 이렇다. `EventLog`/`EventLogEntry`(.NET 1.0)는 클래식 3개 로그만 다루고 필터링이 클라이언트 쪽에서 일어나 느리다. `EventLogQuery`/`EventLogReader`(.NET 3.5)는 모든 채널을 대상으로 서버 쪽 XPath 필터를 쓰므로 빠르다. `EventLogWatcher`(.NET 3.5)는 같은 질의를 구독 기반 감시에 쓴다.

### 이벤트 로그 감시

Windows 이벤트 로그에 항목이 쓰일 때마다 `EntryWritten` 이벤트로 알림을 받을 수 있다. 이는 **로컬 컴퓨터의** 이벤트 로그에 대해 동작하며, 어떤 애플리케이션이 기록했든 상관없이 발생한다.

로그 감시를 켜는 방법은 이렇다.

1. `EventLog`를 인스턴스화하고 `EnableRaisingEvents` 속성을 `true`로 설정한다.
2. `EntryWritten` 이벤트를 처리한다.

```csharp
using (var log = new EventLog("Application"))
{
    log.EnableRaisingEvents = true;
    log.EntryWritten += DisplayEntry;
    Console.ReadLine();
}

void DisplayEntry(object sender, EntryWrittenEventArgs e)
{
    EventLogEntry entry = e.Entry;
    Console.WriteLine(entry.Message);
}
```

> **⚠️ `EntryWritten`은 이벤트를 놓친다**
>
> 이 메커니즘은 **5초 간격으로 폴링**하는 방식으로 구현되어 있고, 한 폴링 주기 안에 여러 항목이 쓰이면 그중 일부만 이벤트로 올라온다. 감사(audit) 용도처럼 항목을 하나도 놓치면 안 되는 경우에는 쓸 수 없다. 그럴 때는 `EventLogWatcher`를 써라. 구독 기반이라 누락이 없고 XPath 필터도 지원한다.
>
> ```csharp
> var q = new EventLogQuery("Application", PathType.LogName,
>                           "*[System[Provider[@Name='MyCompany.WidgetServer']]]");
> using var watcher = new EventLogWatcher(q);
> watcher.EventRecordWritten += (s, e) =>
>     Console.WriteLine(e.EventRecord?.FormatDescription());
> watcher.Enabled = true;
> ```

> **⚠️ `EntryWritten` 핸들러 안에서 다시 로그에 쓰지 마라**
>
> 자기 자신이 쓴 항목이 다시 이벤트를 발생시키고, 그 핸들러가 또 쓰는 **무한 루프**가 만들어진다. 이벤트 로그가 순식간에 가득 차고 디스크 I/O가 폭주한다. 로그 감시 핸들러는 반드시 다른 출력 경로(파일, 콘솔, 네트워크)를 써야 한다.

### 크로스 플랫폼 대안

| 목적 | Windows 전용 | 크로스 플랫폼 대안 |
|---|---|---|
| 운영체제 통합 로그에 쓰기 | `EventLog.WriteEntry` | Linux: `journald`(`systemd` 서비스의 표준 출력이 자동 수집) |
| 구조적 애플리케이션 로그 | `EventLogTraceListener` | `ILogger` + 구조적 싱크(75.1절) |
| 저수준 이벤트 추적 | ETW / `EventProviderTraceListener` | `EventSource` + EventPipe (66.6절) |
| 로그 감시·알림 | `EventLogWatcher` | 로그 수집 파이프라인(Fluent Bit, OTel Collector) |

> **💡 컨테이너 시대의 규칙 — 표준 출력에 쓰고 수집은 인프라에 맡겨라**
>
> 컨테이너로 배포하는 애플리케이션에서 OS 통합 로그에 쓰는 것은 안티패턴이다. 컨테이너는 수명이 짧고, 로그 파일과 함께 사라진다. 12-factor 원칙대로 **표준 출력으로 한 줄에 한 이벤트씩** 쓰고, 수집·보존·검색은 로그 수집기가 담당하게 하라. `ILogger`의 콘솔 공급자에 JSON 포매터를 붙이면 이것이 곧바로 구조적 로그가 된다(75.1절).

---

## 73.7 성능 카운터 — 열거, 읽기, 직접 만들기

> **⚠️ 이 절 전체가 Windows 전용이며 사실상 레거시다**
>
> 성능 카운터(performance counter)는 Windows 전용 기능이며 `System.Diagnostics.PerformanceCounter` NuGet 패키지가 필요하다. Linux나 macOS를 대상으로 한다면 73.9절의 크로스 플랫폼 진단 도구와 75.3절의 `System.Diagnostics.Metrics`를 봐야 한다. 이 절은 (1) 기존 Windows 시스템을 유지보수하는 독자와 (2) 성능 카운터가 왜 대체되었는지 이해하려는 독자를 위한 것이다.

지금까지 다룬 로깅 메커니즘은 나중에 분석할 정보를 남기는 데 유용하다. 그러나 애플리케이션(또는 시스템 전체)의 **현재 상태**를 파악하려면 더 실시간적인 접근이 필요하다. 이 요구에 대한 Win32의 해법이 성능 모니터링 인프라이며, 시스템과 애플리케이션이 노출하는 성능 카운터 집합과, 이를 실시간으로 모니터링하는 MMC(Microsoft Management Console) 스냅인으로 구성된다.

### 구조 — 범주, 카운터, 인스턴스

성능 카운터는 "System", "Processor", ".NET CLR Memory" 같은 **범주(category)** 로 묶인다. 이 범주들은 GUI 도구에서 "성능 개체(performance object)"라고도 불린다. 각 범주는 시스템이나 애플리케이션의 한 측면을 모니터링하는 관련 카운터 집합을 묶는다. ".NET CLR Memory" 범주의 카운터 예로는 "% Time in GC", "# Bytes in All Heaps", "Allocated bytes/sec" 등이 있다.

각 범주는 독립적으로 모니터링할 수 있는 하나 이상의 **인스턴스(instance)** 를 가질 수 있다. 예를 들어 "Processor" 범주의 "% Processor Time" 카운터가 그렇다. 다중 프로세서 머신에서 이 카운터는 CPU마다 인스턴스를 지원하며, 각 CPU의 사용률을 독립적으로 모니터링할 수 있게 한다.

```text
  범주 (Category / 성능 개체)
   └── "Processor"
        ├── 인스턴스 "0"      ── 카운터 "% Processor Time" → 값
        │                     └ 카운터 "% Idle Time"      → 값
        ├── 인스턴스 "1"      ── ...
        └── 인스턴스 "_Total" ── ...

  범주 "Memory"  (인스턴스 없음)
        └── 카운터 "Available MBytes" → 값
```

> **📌 성능 카운터 읽기에도 권한이 필요할 수 있다**
>
> 무엇에 접근하느냐에 따라 로컬 또는 대상 컴퓨터의 관리자 권한이 필요할 수 있다. 최소한 `Performance Monitor Users` 그룹 멤버십이 있어야 한다.

### 사용 가능한 카운터 열거하기

다음 예제는 컴퓨터의 모든 성능 카운터를 열거한다. 인스턴스가 있는 범주라면 각 인스턴스별로 카운터를 열거한다.

```csharp
PerformanceCounterCategory[] cats =
    PerformanceCounterCategory.GetCategories();

foreach (PerformanceCounterCategory cat in cats)
{
    Console.WriteLine("Category: " + cat.CategoryName);

    string[] instances = cat.GetInstanceNames();
    if (instances.Length == 0)
    {
        foreach (PerformanceCounter ctr in cat.GetCounters())
            Console.WriteLine("  Counter: " + ctr.CounterName);
    }
    else                                  // 인스턴스가 있는 카운터를 덤프한다
    {
        foreach (string instance in instances)
        {
            Console.WriteLine("  Instance: " + instance);
            if (cat.InstanceExists(instance))
                foreach (PerformanceCounter ctr in cat.GetCounters(instance))
                    Console.WriteLine("    Counter: " + ctr.CounterName);
        }
    }
}
```

> **⚠️ 결과는 1만 줄이 넘고 실행에 한참 걸린다**
>
> `PerformanceCounterCategory.InstanceExists`의 구현이 비효율적이기 때문이다. 실제 시스템에서는 더 상세한 정보를 **필요할 때만** 가져오도록 짜야 한다. 그리고 이 열거는 `PerformanceCounter` 객체를 수천 개 만들어내는데, 각각이 네이티브 리소스를 잡으므로 `Dispose`하지 않으면 핸들이 폭증한다.

실무에서는 범주를 먼저 좁힌 뒤 필요한 것만 조회한다. 다음은 .NET 관련 범주의 카운터 이름만 XML로 저장하는 압축판이다.

```csharp
var x = new XElement("counters",
    from cat in PerformanceCounterCategory.GetCategories()
    where cat.CategoryName.StartsWith(".NET")
    select new XElement("category",
        new XAttribute("name", cat.CategoryName),
        from c in cat.GetCounters()
        select new XElement("counter", new XAttribute("name", c.CounterName))));

x.Save("counters.xml");
```

### 성능 카운터 데이터 읽기

성능 카운터의 값을 얻으려면 `PerformanceCounter` 객체를 인스턴스화하고 `NextValue`나 `NextSample` 메서드를 호출한다. `NextValue`는 단순한 `float` 값을 반환하고, `NextSample`은 `CounterFrequency`, `TimeStamp`, `BaseValue`, `RawValue` 같은 더 고급 속성을 노출하는 `CounterSample` 객체를 반환한다.

`PerformanceCounter`의 생성자는 범주 이름, 카운터 이름, 그리고 선택적 인스턴스를 받는다. 모든 CPU의 현재 프로세서 사용률을 표시하려면 이렇게 한다.

```csharp
using PerformanceCounter pc = new PerformanceCounter(
    "Processor", "% Processor Time", "_Total");

Console.WriteLine(pc.NextValue());
```

현재 프로세스의 "실제"(즉, 전용) 메모리 소비를 표시하려면 이렇게 한다.

```csharp
string procName = Process.GetCurrentProcess().ProcessName;

using PerformanceCounter pc = new PerformanceCounter(
    "Process", "Private Bytes", procName);

Console.WriteLine(pc.NextValue());
```

> **⚠️ 비율 카운터의 첫 `NextValue()`는 항상 0이다**
>
> "% Processor Time"처럼 **비율(rate)** 을 계산하는 카운터는 두 샘플의 차이로 값을 낸다. 따라서 첫 호출에는 이전 샘플이 없어 0을 반환한다. 의미 있는 값을 얻으려면 한 번 호출해 버리고, 최소 1초(권장) 기다린 뒤 두 번째 호출의 값을 써야 한다.
>
> ```csharp
> pc.NextValue();               // 버린다
> Thread.Sleep(1000);
> Console.WriteLine(pc.NextValue());   // 이제 유효하다
> ```
>
> 모니터링 대시보드가 시작 직후 항상 0%를 보여주는 원인이 이것이다.

> **⚠️ 인스턴스 이름이 프로세스 이름과 충돌한다**
>
> "Process" 범주의 인스턴스 이름은 프로세스 **이름**이다. 같은 이름의 프로세스가 여러 개면 `MyApp`, `MyApp#1`, `MyApp#2`처럼 붙는다. 어느 번호가 내 프로세스인지 알려면 `Process` 범주의 "ID Process" 카운터를 각 인스턴스에 대해 읽어 PID와 비교하는 수밖에 없다. 게다가 프로세스가 죽고 새로 뜨면 **번호가 재배치된다.** 자기 프로세스를 모니터링하는 데 성능 카운터를 쓰는 것이 왜 나쁜 생각인지 보여주는 대표적 사례다.

`PerformanceCounter`는 `ValueChanged` 이벤트를 노출하지 않으므로, 변화를 모니터링하려면 **폴링**해야 한다. 다음 예제는 `EventWaitHandle`로 종료 신호를 받을 때까지 200ms마다 폴링한다.

```csharp
// System.Threading과 System.Diagnostics를 모두 import해야 한다
static void Monitor(string category, string counter, string instance,
                    EventWaitHandle stopper)
{
    if (!PerformanceCounterCategory.Exists(category))
        throw new InvalidOperationException("Category does not exist");
    if (!PerformanceCounterCategory.CounterExists(counter, category))
        throw new InvalidOperationException("Counter does not exist");

    if (instance == null) instance = "";   // "" == 인스턴스 없음 (null이 아니다!)
    if (instance != "" &&
        !PerformanceCounterCategory.InstanceExists(instance, category))
        throw new InvalidOperationException("Instance does not exist");

    float lastValue = 0f;
    using (PerformanceCounter pc =
           new PerformanceCounter(category, counter, instance))
        while (!stopper.WaitOne(200, false))
        {
            float value = pc.NextValue();
            if (value != lastValue)        // 값이 바뀌었을 때만 출력한다
            {
                Console.WriteLine(value);
                lastValue = value;
            }
        }
}
```

이 메서드로 프로세서와 하드디스크 활동을 동시에 모니터링할 수 있다.

```csharp
EventWaitHandle stopper = new ManualResetEvent(false);
new Thread(() => Monitor("Processor", "% Processor Time", "_Total", stopper)).Start();
new Thread(() => Monitor("LogicalDisk", "% Idle Time", "C:", stopper)).Start();

Console.WriteLine("Monitoring - press any key to quit");
Console.ReadKey();
stopper.Set();
```

### 카운터 만들기와 성능 데이터 쓰기

성능 카운터 데이터를 쓰기 전에 성능 범주와 카운터를 만들어야 한다. 성능 범주는 거기 속하는 **모든 카운터와 함께 한 단계로** 만들어야 한다.

```csharp
string category = "Nutshell Monitoring";

// 이 범주에 카운터 두 개를 만든다
string eatenPerMin = "Macadamias eaten so far";
string tooHard     = "Macadamias deemed too hard";

if (!PerformanceCounterCategory.Exists(category))
{
    CounterCreationDataCollection cd = new CounterCreationDataCollection();

    cd.Add(new CounterCreationData(eatenPerMin,
        "Number of macadamias consumed, including shelling time",
        PerformanceCounterType.NumberOfItems32));

    cd.Add(new CounterCreationData(tooHard,
        "Number of macadamias that will not crack, despite much effort",
        PerformanceCounterType.NumberOfItems32));

    PerformanceCounterCategory.Create(category, "Test Category",
        PerformanceCounterCategoryType.SingleInstance, cd);
}
```

새 카운터는 Windows 성능 모니터링 도구에서 "Add Counters"를 선택하면 나타난다. 나중에 같은 범주에 카운터를 더 정의하고 싶다면 **먼저 `PerformanceCounterCategory.Delete`로 옛 범주를 삭제해야 한다.**

> **📌 성능 카운터 생성·삭제에는 관리자 권한이 필요하다**
>
> 이 때문에 보통 애플리케이션 설치 과정의 일부로 수행한다.

카운터를 만든 뒤에는 `PerformanceCounter`를 인스턴스화하고 `ReadOnly`를 `false`로 설정한 다음 `RawValue`를 설정해 값을 갱신한다. `Increment`와 `IncrementBy` 메서드로 기존 값을 갱신할 수도 있다.

```csharp
string category = "Nutshell Monitoring";
string eatenPerMin = "Macadamias eaten so far";

using (PerformanceCounter pc =
       new PerformanceCounter(category, eatenPerMin, ""))
{
    pc.ReadOnly = false;
    pc.RawValue = 1000;
    pc.Increment();
    pc.IncrementBy(10);
    Console.WriteLine(pc.NextValue());     // 1011
}
```

자주 쓰는 `PerformanceCounterType` 값은 다음과 같다.

| 타입 | 의미 |
|---|---|
| `NumberOfItems32` / `NumberOfItems64` | 단순 누적 개수. 그대로 표시 |
| `RateOfCountsPerSecond32` / `...64` | 초당 증가량으로 표시 |
| `AverageTimer32` | 항목당 평균 시간. `AverageBase`와 짝을 이룬다 |
| `AverageCount64` | 항목당 평균 개수. `AverageBase`와 짝 |
| `ElapsedTime` | 경과 시간 |
| `RawFraction` + `RawBase` | 백분율 |

> **⚠️ "Base" 카운터는 반드시 바로 뒤에 등록해야 한다**
>
> `AverageTimer32`, `AverageCount64`, `RawFraction` 같은 타입은 분모 역할을 하는 `AverageBase`/`RawBase` 카운터가 **컬렉션에서 바로 다음 항목으로** 등록되어 있어야 한다. 순서를 어기면 `Create`가 실패하거나 값이 항상 0으로 나온다. 실무에서 성능 카운터가 "만들었는데 값이 안 보인다"고 하는 경우의 절반이 이 문제다.

> **⚠️ 성능 카운터는 프로세스 간 공유 메모리다 — 지저분하게 죽으면 남는다**
>
> 성능 카운터 범주는 레지스트리와 공유 메모리에 등록된다. 애플리케이션이 비정상 종료하면 인스턴스가 남아 성능 모니터에 유령 인스턴스로 계속 보일 수 있다. 또한 32비트/64비트 프로세스 간 카운터 접근에 제약이 있고, `lodctr`/`unlodctr` 도구로 카운터 목록이 손상되면 복구가 번거롭다. 이 취약함이 성능 카운터가 컨테이너 시대에 살아남지 못한 실질적 이유다.

### ※ 현대적 대안 — `System.Diagnostics.Metrics`

.NET 6부터 `System.Diagnostics.Metrics` 네임스페이스가 성능 카운터의 자리를 대신한다. OpenTelemetry 메트릭 규격에 맞춰 설계되었고, **크로스 플랫폼이며, 관리자 권한이 필요 없고, 프로세스 안에서 완결된다.**

```csharp
using System.Diagnostics.Metrics;

static readonly Meter MyMeter = new("MyCompany.WidgetServer", "1.0");

static readonly Counter<long> Eaten =
    MyMeter.CreateCounter<long>("macadamias.eaten", "개", "먹은 마카다미아 수");

static readonly Histogram<double> ShellTime =
    MyMeter.CreateHistogram<double>("macadamias.shell_time", "ms", "껍질 까는 시간");

static void Eat(double ms)
{
    Eaten.Add(1);
    ShellTime.Record(ms);
}
```

이 값은 `dotnet-counters`로 즉시 관찰할 수 있다.

```bash
dotnet-counters monitor --counters MyCompany.WidgetServer --process-id 1234
```

세 세대의 계측 API를 비교하면 이렇다.

| | `PerformanceCounter` | `EventCounter` | `Meter` / `Counter<T>` |
|---|---|---|---|
| **도입** | .NET 1.0 | .NET Core 3.0 | ※.NET 6 |
| **플랫폼** | **Windows 전용** | 크로스 플랫폼 | 크로스 플랫폼 |
| **권한** | 생성 시 관리자 | 불필요 | 불필요 |
| **저장 위치** | 레지스트리 + 공유 메모리 | 프로세스 내부 | 프로세스 내부 |
| **수집 경로** | PDH / MMC | EventPipe | EventPipe / OTel |
| **차원(태그)** | 인스턴스 이름 하나 | 없음 | **임의의 키-값 태그** |
| **집계 방식** | 카운터 타입에 고정 | 폴링/증분 | 계측기 종류별 |
| **OpenTelemetry 연동** | 없음 | 제한적 | **1급 지원** |

`Meter`, `Counter<T>`, `Histogram<T>`, `ObservableGauge<T>`의 상세한 사용법과 계측 설계는 **75.3절에서 다룬다.**

> **💡 새 코드에서 `PerformanceCounter`를 선택할 이유는 사실상 없다**
>
> 유일한 예외는 **다른 프로세스가 만든 기존 Windows 카운터를 읽어야 할 때**다(예: SQL Server나 IIS의 카운터를 애플리케이션에서 읽어 대시보드에 합치는 경우). 자기 애플리케이션의 지표를 노출하는 용도라면 `Meter`가 모든 면에서 낫다. 그리고 읽기 용도조차도, 요즘은 그 시스템이 자체 OpenTelemetry 익스포터를 제공하는 경우가 많다.

---

## 73.8 `Stopwatch`와 고해상도 타이밍

`Stopwatch` 클래스는 실행 시간을 측정하는 편리한 메커니즘을 제공한다. `Stopwatch`는 OS와 하드웨어가 제공하는 **가장 높은 해상도의 메커니즘**을 사용하며, 이는 보통 마이크로초 미만이다. 대조적으로 `DateTime.Now`와 `Environment.TickCount`의 해상도는 약 15ms다.

> **📌 이 절은 API 레퍼런스다**
>
> `Stopwatch`로 신뢰할 수 있는 성능 측정을 하는 방법 — 워밍업, 계층형 컴파일, 죽은 코드 제거, 이상치 처리 — 은 67.2절에서 이미 다뤘고, 제대로 된 벤치마킹은 67.3절의 BenchmarkDotNet의 몫이다. 여기서는 `Stopwatch`라는 **타입 자체의 정확한 사용법과 함정**만 다룬다.

### 기본 사용

`Stopwatch`를 쓰려면 `StartNew`를 호출한다. 이것은 `Stopwatch`를 인스턴스화하고 즉시 재기 시작한다. (또는 수동으로 인스턴스화한 뒤 `Start`를 호출해도 된다.) `Elapsed` 속성은 경과 구간을 `TimeSpan`으로 반환한다.

```csharp
Stopwatch s = Stopwatch.StartNew();
System.IO.File.WriteAllText("test.txt", new string('*', 30000000));
Console.WriteLine(s.Elapsed);        // 00:00:01.4322661
```

`Stopwatch`는 경과 "틱" 수를 `long`으로 반환하는 `ElapsedTicks` 속성도 노출한다. 틱에서 초로 변환하려면 `Stopwatch.Frequency`로 나눈다. 대개 가장 편리한 것은 `ElapsedMilliseconds` 속성이다.

`Stop`을 호출하면 `Elapsed`와 `ElapsedTicks`가 고정된다. "실행 중인" `Stopwatch` 때문에 백그라운드 활동이 발생하지는 않으므로 `Stop` 호출은 선택 사항이다.

| 멤버 | 반환/의미 |
|---|---|
| `Stopwatch.StartNew()` | 새 인스턴스를 만들고 즉시 시작 |
| `Start()` / `Stop()` | 시작 / 정지(누적된다) |
| `Restart()` | 0으로 되돌리고 다시 시작 |
| `Reset()` | 0으로 되돌리고 정지 상태 |
| `IsRunning` | 현재 측정 중인지 |
| `Elapsed` | `TimeSpan` (100ns 단위 틱 기반) |
| `ElapsedMilliseconds` | `long`, 밀리초 |
| `ElapsedTicks` | `long`, **스톱워치 틱** |
| `Stopwatch.Frequency` | `static readonly long`, 초당 스톱워치 틱 수 |
| `Stopwatch.IsHighResolution` | `static readonly bool`, 고해상도 타이머 사용 여부 |
| `Stopwatch.GetTimestamp()` | `static long`, 현재 원시 타임스탬프 |
| `Stopwatch.GetElapsedTime(long)` | ※.NET 7. 타임스탬프 이후 경과를 `TimeSpan`으로 |
| `Stopwatch.GetElapsedTime(long, long)` | ※.NET 7. 두 타임스탬프 사이의 경과 |

### ⚠️ `ElapsedTicks`는 `TimeSpan.Ticks`가 아니다

이것이 `Stopwatch`에서 가장 흔한 버그다.

> **⚠️ 두 종류의 "틱"을 섞지 마라**
>
> - `TimeSpan.Ticks`(= `sw.Elapsed.Ticks`)는 **100나노초** 단위로 고정되어 있다. 초당 1천만 틱이다.
> - `Stopwatch.ElapsedTicks`는 **`Stopwatch.Frequency` 단위**다. 이 값은 플랫폼과 하드웨어에 따라 다르다.
>
> Windows에서는 `Frequency`가 보통 10,000,000이라 두 값이 우연히 일치한다. **그래서 Windows에서 개발하면 버그가 드러나지 않는다.** 그런데 Linux에서 .NET은 `Frequency`가 1,000,000,000(나노초)인 경우가 많다. 다음 코드는 Windows에서는 맞고 Linux에서는 **100배 틀린 값**을 낸다.
>
> ```csharp
> // 틀렸다
> var elapsed = new TimeSpan(sw.ElapsedTicks);
>
> // 맞다
> var elapsed = sw.Elapsed;
> // 또는
> double seconds = (double)sw.ElapsedTicks / Stopwatch.Frequency;
> ```
>
> 규칙은 단순하다. **`TimeSpan`이 필요하면 `Elapsed`를 써라.** `ElapsedTicks`는 `Frequency`와 짝을 이룰 때만 쓴다.

플랫폼별 `Frequency`를 직접 확인해보면 명확해진다.

```csharp
Console.WriteLine($"IsHighResolution: {Stopwatch.IsHighResolution}");
Console.WriteLine($"Frequency:        {Stopwatch.Frequency:N0} ticks/sec");
Console.WriteLine($"해상도:           {1e9 / Stopwatch.Frequency:F1} ns/tick");
```

```text
# Windows 11 (QPC)
IsHighResolution: True
Frequency:        10,000,000 ticks/sec
해상도:           100.0 ns/tick

# Linux (clock_gettime CLOCK_MONOTONIC)
IsHighResolution: True
Frequency:        1,000,000,000 ticks/sec
해상도:           1.0 ns/tick
```

> **⚠️ `IsHighResolution`이 `false`면 해상도가 통째로 무너진다**
>
> 하드웨어나 OS가 고해상도 타이머를 제공하지 못하면 `Stopwatch`는 `DateTime.UtcNow` 기반으로 폴백하고, 해상도가 **약 15ms**로 떨어진다. 이 상황에서 1ms짜리 연산을 측정하면 0 아니면 15가 나온다. 오래된 가상화 환경이나 일부 임베디드 플랫폼에서 실제로 일어난다. 마이크로초 단위 측정을 신뢰하기 전에 `IsHighResolution`을 확인하는 습관을 들여라.

### 할당 없는 측정 — `GetTimestamp`와 ※.NET 7의 `GetElapsedTime`

`Stopwatch`는 클래스이므로 인스턴스를 만들 때마다 힙 할당이 일어난다. 초당 수십만 번 측정하는 코드에서는 이것이 문제가 된다. `Stopwatch.GetTimestamp()`는 정적 메서드이고 `long`을 반환하므로 **할당이 전혀 없다.**

```csharp
long start = Stopwatch.GetTimestamp();
DoWork();
long end = Stopwatch.GetTimestamp();

double ms = (end - start) * 1000.0 / Stopwatch.Frequency;
```

.NET 7부터는 나눗셈을 직접 하지 않아도 된다.

```csharp
long start = Stopwatch.GetTimestamp();
DoWork();
TimeSpan elapsed = Stopwatch.GetElapsedTime(start);        // ※.NET 7
```

> **💡 뜨거운 경로의 계측에는 `GetTimestamp`를 써라**
>
> `Stopwatch` 인스턴스 하나는 40바이트가량이다. 요청마다 하나씩 만들면 초당 10만 요청에서 4MB/s의 할당이 생긴다. `long` 두 개로 끝내면 할당이 0이 된다. 69장에서 다룬 할당 줄이기의 전형적인 사례다. 다만 계측 자체를 `Histogram<double>`(75.3절)로 기록한다면, 그쪽이 이미 이 패턴을 내부적으로 쓴다.

### ⚠️ 그 밖의 함정

> **⚠️ `Stopwatch`는 벽시계 시간(wall-clock)이지 CPU 시간이 아니다**
>
> `Stopwatch`는 스레드가 대기하거나 선점당한 시간, GC 일시 정지 시간, OS가 다른 프로세스를 실행한 시간을 **모두 포함한다.** 부하가 걸린 머신에서 측정하면 코드가 느려진 게 아니라 CPU를 못 받은 것일 수 있다. 순수한 CPU 소모를 알고 싶으면 `Process.TotalProcessorTime`이나 `Thread.CurrentThread` 기반의 커널 API를 봐야 한다.

> **⚠️ 여러 코어에 걸친 타임스탬프 비교는 미묘하다**
>
> 과거 멀티소켓 시스템에서는 코어마다 TSC(타임스탬프 카운터)가 어긋나 스레드가 코어를 옮기면 경과 시간이 **음수**로 나오는 일이 있었다. 현대 OS는 불변 TSC(invariant TSC)와 QPC 보정으로 이를 감춘다. 그래도 `end - start`가 음수이거나 비상식적으로 큰 값이 나오는 경우를 방어적으로 다루는 것이 안전하다 — 특히 가상 머신에서 라이브 마이그레이션이 일어난 경우.

> **⚠️ `Stopwatch`는 스레드 안전하지 않다**
>
> 여러 스레드가 같은 인스턴스에 `Start`/`Stop`을 호출하면 결과가 의미 없어진다. 스레드마다 별도 인스턴스를 쓰거나 `GetTimestamp`를 써라.

> **⚠️ 한 번의 측정으로 결론을 내지 마라**
>
> JIT 워밍업, 계층형 컴파일의 재컴파일, 캐시 상태, GC 타이밍 때문에 첫 실행은 이후 실행보다 훨씬 느리다. `Stopwatch`로 "A가 B보다 빠르다"고 판단하려면 반복 측정과 통계가 필요하고, 그 지점부터는 BenchmarkDotNet의 영역이다(67.3절). `Stopwatch`는 **"이 단계가 대략 몇 밀리초인가"** 를 아는 데까지가 적정 용도다.

---

## 73.9 크로스 플랫폼 진단 도구 — `dotnet-counters` / `dotnet-trace` / `dotnet-dump`

앞의 절들이 **애플리케이션 안에서 호출하는 API**를 다뤘다면, 이 절은 **밖에서 붙이는 도구**를 다룬다. 이 도구들은 관리자 권한을 요구하지 않으며 개발 환경과 프로덕션 환경 모두에 적합하다. 세 도구 모두 런타임에 내장된 **EventPipe** 인프라 위에서 동작한다 — Windows의 ETW, Linux의 LTTng에 대한 크로스 플랫폼 추상화다(66.6절).

```text
   [대상 .NET 프로세스]
        │  EventSource / EventCounter / Meter / 런타임 이벤트
        ↓
   ┌──────────────┐
   │  EventPipe   │  ← 런타임 내장. 관리자 권한 불필요
   └──────────────┘
        │ IPC (Unix 도메인 소켓 / 명명된 파이프)
        ↓
   dotnet-counters   dotnet-trace   dotnet-dump   dotnet-gcdump   dotnet-stack
   (실시간 수치)      (이벤트 기록)   (메모리 덤프)  (힙 스냅숏)     (스택 덤프)
```

### 도구 요약

| 도구 | 목적 | 대표 명령 | 산출물 | 오버헤드 |
|---|---|---|---|---|
| `dotnet-counters` | 실행 중 앱의 상태 개관 | `monitor`, `collect`, `list`, `ps` | 콘솔 / `.csv` / `.json` | 매우 낮음 |
| `dotnet-trace` | 상세 성능·이벤트 추적 | `collect`, `ps`, `list-profiles`, `convert` | `.nettrace` / `.speedscope.json` | 프로필에 따름 |
| `dotnet-dump` | 요청 시 또는 크래시 후 메모리 덤프 | `collect`, `analyze` | 코어 덤프 | 수집 중 프로세스 정지 |
| `dotnet-gcdump` | 관리 힙 그래프만 스냅숏 | `collect` | `.gcdump` | 유발 GC 1회 |
| `dotnet-stack` | 모든 스레드의 관리 스택 | `report` | 텍스트 | 낮음 |
| `dotnet-monitor` | 위 기능들을 HTTP API로 노출 | (사이드카로 실행) | HTTP/JSON | 낮음 |

설치는 전부 같은 방식이다.

```bash
dotnet tool install --global dotnet-counters
dotnet tool install --global dotnet-trace
dotnet tool install --global dotnet-dump
```

### `dotnet-counters`

`dotnet-counters` 도구는 .NET 프로세스의 메모리와 CPU 사용량을 모니터링하고 그 데이터를 콘솔(또는 파일)에 쓴다.

```bash
dotnet-counters monitor System.Runtime --process-id <ProcessID>
```

`System.Runtime`은 그 범주 아래의 모든 카운터를 모니터링하겠다는 뜻이다. 범주 이름이나 카운터 이름을 지정할 수 있다(`dotnet-counters list` 명령이 사용 가능한 모든 범주와 카운터를 나열한다). 출력은 계속 갱신되며 다음과 같이 보인다.

```text
Press p to pause, r to resume, q to quit.
    Status: Running

[System.Runtime]
    # of Assemblies Loaded                            63
    % Time in GC (since last GC)                       0
    Allocation Rate (Bytes / sec)                244,864
    CPU Usage (%)                                      6
    Exceptions / sec                                   0
    GC Heap Size (MB)                                  8
    Gen 0 GC / sec                                     0
    LOH Size (B)                               3,200,296
    Monitor Lock Contention Count / sec                0
    ThreadPool Completed Work Items / sec             15
    ThreadPool Queue Length                            0
    ThreadPool Threads Count                           9
    Working Set (MB)                                  52
```

| 명령 | 용도 |
|---|---|
| `list` | 카운터 이름과 설명 목록을 표시 |
| `ps` | 모니터링 가능한 dotnet 프로세스 목록 표시 |
| `monitor` | 선택한 카운터 값을 주기적으로 갱신하며 표시 |
| `collect` | 카운터 정보를 파일로 저장 |

| 옵션/인자 | 용도 |
|---|---|
| `--version` | `dotnet-counters` 버전 표시 |
| `-h`, `--help` | 도움말 표시 |
| `-p`, `--process-id` | 모니터링할 dotnet 프로세스 ID. `monitor`·`collect`에 적용 |
| `-n`, `--name` | 프로세스 이름으로 지정. `monitor`·`collect`에 적용 |
| `--counters` | 공급자 이름 또는 `공급자[카운터1,카운터2]` 목록 |
| `--refresh-interval` | 갱신 주기(초). `monitor`·`collect`에 적용 |
| `-o`, `--output` | 출력 파일 이름. `collect`에 적용 |
| `--format` | 출력 형식(`csv` 또는 `json`). `collect`에 적용 |

`collect`로 저장한 CSV에는 CPU 사용량, GC 데이터, 힙 정보, 예외 정보, 로드된 어셈블리 수, JIT 컴파일 정보가 시계열로 기록된다. 스프레드시트에서 바로 그려볼 수 있다.

> **⚠️ 어떤 지표를 봐야 하는지 모르면 숫자가 많아도 소용없다**
>
> `dotnet-counters`의 진짜 가치는 **1차 판별**에 있다. "할당률이 비정상인가", "% Time in GC가 높은가", "스레드 풀 큐가 쌓이는가"처럼 **어느 방향으로 파고들지** 정하는 도구다. 여기서 문제가 보이면 `dotnet-trace`나 PerfView로 넘어가고, 메모리 쪽이면 `dotnet-gcdump`/`dotnet-dump`로 간다. 메모리 관점의 판독 기준과 시나리오별 대응은 **66.8절과 66.11절**에서 이미 자세히 다뤘다.

`Meter` 기반의 사용자 정의 메트릭(75.3절)도 이름을 지정해 같이 볼 수 있다.

```bash
dotnet-counters monitor --counters System.Runtime,MyCompany.WidgetServer -p 1234
```

### `dotnet-trace`

추적(trace)은 메서드가 호출되거나 데이터베이스에 질의하는 것 같은, 프로그램 내 이벤트의 타임스탬프가 찍힌 기록이다. 추적은 성능 메트릭과 사용자 정의 이벤트를 포함할 수 있고, 지역 변수 값 같은 지역 컨텍스트도 담을 수 있다. 전통적으로 .NET Framework와 ASP.NET 같은 프레임워크는 ETW를 사용했다. .NET 5부터 애플리케이션 추적은 Windows에서 ETW로, Linux에서 LTTng로 기록된다.

```bash
dotnet-trace collect --process-id <ProcessId>
```

이 명령은 기본 프로필로 `dotnet-trace`를 실행한다. CPU와 .NET 런타임 이벤트를 수집해 `trace.nettrace` 파일에 쓴다. `--profile` 스위치로 다른 프로필을 지정할 수 있다. `gc-verbose`는 가비지 컬렉션과 샘플링된 객체 할당을 추적하고, `gc-collect`는 낮은 오버헤드로 가비지 컬렉션을 추적한다. `-o` 스위치로 다른 출력 파일명을 지정한다.

기본 출력은 `.nettrace` 파일이며 Windows 머신에서 **PerfView** 도구로 직접 분석할 수 있다. 또는 `dotnet-trace`가 **Speedscope** 호환 파일을 만들게 할 수도 있다. Speedscope는 무료 온라인 분석 서비스다. Speedscope 파일(`.speedscope.json`)을 만들려면 `--format Speedscope` 옵션을 쓴다. (도구 버전에 따라 `Chromium` 형식도 지원한다. 부록 C.2 참조.)

| 명령 | 용도 |
|---|---|
| `collect` | 카운터 정보를 파일로 기록 시작 |
| `ps` | 모니터링 가능한 dotnet 프로세스 목록 표시 |
| `list-profiles` | 각 프로필의 공급자와 필터 설명과 함께 미리 정의된 추적 프로필 나열 |
| `convert <file>` | `.nettrace`를 다른 형식으로 변환(`--format`: `NetTrace` / `Speedscope` / `Chromium`) |

애플리케이션은 사용자 정의 `EventSource`를 정의해 자체 이벤트를 방출할 수 있다.

```csharp
[EventSource(Name = "MyTestSource")]
public sealed class MyEventSource : EventSource
{
    public static MyEventSource Instance = new MyEventSource();

    MyEventSource() : base(EventSourceSettings.EtwSelfDescribingEventFormat) { }

    public void Log(string message, int someNumber)
    {
        WriteEvent(1, message, someNumber);
    }
}
```

`WriteEvent` 메서드는 단순 타입(주로 문자열과 정수)의 다양한 조합을 받도록 오버로드되어 있다. 다음처럼 호출한다.

```csharp
MyEventSource.Instance.Log("Something", 123);
```

`dotnet-trace`를 호출할 때 기록하려는 사용자 정의 이벤트 소스의 이름을 지정해야 한다.

```bash
dotnet-trace collect --process-id <ProcessId> --providers MyTestSource
```

> **⚠️ `--providers`를 지정하면 기본 프로필이 꺼진다**
>
> `--providers`만 주면 그 공급자만 수집된다. 런타임 이벤트(GC, JIT, 스레드 풀)를 함께 보고 싶다면 `--profile`을 명시적으로 함께 지정하거나 공급자 목록에 `Microsoft-Windows-DotNETRuntime`을 추가해야 한다. "내 이벤트는 보이는데 GC 정보가 없다"는 상황의 원인이다.

> **⚠️ `gc-verbose` 프로필은 오버헤드가 크다**
>
> 샘플링된 객체 할당 추적은 할당 경로에 훅을 건다. 할당이 많은 애플리케이션에서는 처리량이 눈에 띄게 떨어지고 추적 파일이 순식간에 기가바이트로 커진다. 프로덕션에서 켤 때는 **짧게 (`--duration 00:00:00:30` 같이 `dd:hh:mm:ss` 형식으로) 끊어서** 수집하라.

### `dotnet-dump`

덤프(dump)는 코어 덤프(core dump)라고도 하며, 프로세스 가상 메모리 상태의 스냅숏이다. 실행 중인 프로세스를 요청 시 덤프할 수도 있고, 애플리케이션이 크래시할 때 덤프를 생성하도록 OS를 구성할 수도 있다.

Ubuntu Linux에서는 다음 명령으로 애플리케이션 크래시 시 코어 덤프를 활성화한다(필요한 단계는 배포판마다 다를 수 있다).

```bash
ulimit -c unlimited
```

Windows에서는 `regedit.exe`로 로컬 머신 하이브의 `SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps` 아래에 실행 파일과 같은 이름의 키(예: `foo.exe`)를 만들고, 그 안에 `DumpFolder`(`REG_EXPAND_SZ`, 덤프를 쓸 경로), `DumpType`(`REG_DWORD`, 전체 덤프는 `2`), 선택적으로 `DumpCount`(`REG_DWORD`, 보관할 최대 덤프 수)를 추가한다.

설치한 뒤에는 프로세스를 종료하지 않고 요청 시 덤프를 시작할 수 있다.

```bash
dotnet-dump collect --process-id <YourProcessId>
```

다음 명령은 덤프 파일 분석을 위한 대화형 셸을 시작한다.

```bash
dotnet-dump analyze <dumpfile>
```

예외가 애플리케이션을 죽였다면 `printexception` 명령(줄여서 `pe`)으로 그 예외의 상세 정보를 표시할 수 있다. `dotnet-dump` 셸은 그 밖에도 수많은 명령을 지원하며 `help` 명령으로 목록을 볼 수 있다.

> **⚠️ 덤프 수집은 프로세스를 정지시킨다**
>
> `dotnet-dump collect`는 스냅숏을 뜨는 동안 대상 프로세스의 모든 스레드를 멈춘다. 힙이 큰 프로세스(수 GB)에서는 이 정지가 **수 초에서 수십 초**에 이를 수 있다. 로드 밸런서의 헬스 체크가 그 사이에 타임아웃되어 인스턴스가 제거될 수 있으니, 프로덕션에서 덤프를 뜨기 전에 해당 인스턴스를 먼저 트래픽에서 빼라. 관리 힙 구조만 필요하다면 훨씬 가벼운 `dotnet-gcdump`를 고려하라.

> **⚠️ 덤프는 프로세스 메모리 전체다 — 기밀 정보가 들어 있다**
>
> 전체 덤프에는 연결 문자열, 토큰, 복호화된 개인 정보, 요청 본문이 **평문으로** 들어 있다. 덤프 파일을 티켓에 첨부하거나 외부 지원 채널로 보내기 전에 조직의 데이터 처리 정책을 확인해야 한다. 이것은 기술적 문제가 아니라 규정 준수 문제이며, 실제 사고로 이어지는 경우가 드물지 않다.

> **⚠️ 덤프의 비트 수와 런타임 버전이 맞아야 분석된다**
>
> 64비트 프로세스의 덤프는 64비트 도구로 열어야 하고, SOS 확장은 덤프를 만든 런타임 버전과 맞아야 한다. `dotnet-dump analyze`는 필요한 진단 라이브러리를 자동으로 찾으려 시도하지만, 오프라인 환경이나 자체 포함(self-contained) 배포에서는 실패할 수 있다. 이런 경우 덤프와 함께 애플리케이션 디렉터리 전체를 보존해 두면 분석이 수월하다.

**덤프를 실제로 분석하는 워크플로 — SOS 명령, 스레드별 스택 읽기, 사고 재현 — 은 74.5절과 74.8절에서 다룬다.** 메모리 누수 관점의 덤프 분석은 66.9절에서 이미 다뤘다.

> **💡 프로덕션이라면 `dotnet-monitor`를 사이드카로 띄워라**
>
> 컨테이너 환경에서는 문제가 생긴 순간 컨테이너에 셸로 들어가 도구를 설치할 시간이 없다. `dotnet-monitor`는 위 도구들의 기능을 HTTP 엔드포인트로 노출하는 별도 프로세스이며, 쿠버네티스에서는 사이드카 컨테이너로 배포한다. "예외가 초당 N개를 넘으면 자동으로 덤프를 뜬다" 같은 **규칙 기반 자동 수집**도 지원한다. 사후에 "그때 덤프를 떴어야 했는데"라고 후회하지 않는 유일한 방법이다.

---

## 이 장의 요약

- **진단 코드를 배포본에서 지우는 방법은 셋이다.** `#if`는 컴파일 대상 자체를 바꿀 때, 정적 플래그는 런타임 전환이 필요할 때, `[Conditional]`은 디버그 전용 보조 코드에 쓴다.
- **`[Conditional]`은 호출부를 지운다.** 인자 평가 식까지 함께 사라지므로 부수 효과가 있는 식을 인자로 넘기면 빌드 구성에 따라 프로그램 동작이 달라진다. `Debug.Assert(list.Remove(x))`가 대표적 사고다.
- **`Debug`는 `DEBUG`, `Trace`는 `TRACE` 심볼에 묶인다.** SDK 기본값에서 **Release 빌드에도 `TRACE`는 정의된다.** `Trace.Assert`가 프로덕션에서 프로세스를 죽일 수 있다는 뜻이다.
- **단언과 인자 검증은 다른 것이다.** 단언은 현재 메서드의 버그를, 인자 검증 예외는 호출자의 버그를 가리킨다. 전자는 `Debug.Assert`, 후자는 예외다.
- **기본 `TraceListener`는 디버거가 없으면 메시지를 버린다.** `Trace`를 쓰려면 리스너를 직접 등록해야 하고, 파일·스트림 리스너를 쓴다면 `AutoFlush`를 켜거나 종료 시 `Close`를 보장해야 한다. .NET(Core)에는 `Debug.Listeners`가 없고 `app.config`의 리스너 구성도 무시된다.
- **`StackTrace`는 배포 환경에서 열화된다.** 인라이닝된 프레임은 사라지고, `.pdb`가 없으면 줄 번호가 0이 되며, Native AOT에서는 메서드 이름조차 사라질 수 있다. IL 오프셋은 "다음에 실행될" 명령을 가리킨다.
- **디버거 특성은 표시를 제어할 뿐 런타임 동작을 바꾸지 않는다.** 반대로 `[StackTraceHidden]`(※.NET 6)은 예외 트레이스 문자열에만 영향을 준다.
- **`Process`는 API 표면만 크로스 플랫폼이다.** Linux에서 `ProcessName`은 15자에서 잘리고, 컨테이너에서는 자기 PID 네임스페이스만 보이며, `WorkingSet64`는 cgroup 제한을 반영하지 않는다. 속성 값은 캐시되므로 `Refresh()`가 필요하다.
- **Windows 이벤트 로그와 성능 카운터는 Windows 전용이다.** 별도 NuGet 패키지가 필요하고 Linux에서는 컴파일만 통과한 뒤 런타임에 `PlatformNotSupportedException`이 난다. 각각 구조적 로깅과 `System.Diagnostics.Metrics`가 대체했다.
- **`Stopwatch.ElapsedTicks`는 `TimeSpan.Ticks`가 아니다.** 단위가 `Stopwatch.Frequency`이며 플랫폼마다 다르다. `TimeSpan`이 필요하면 언제나 `Elapsed`를 써라. 할당 없는 측정에는 `GetTimestamp`와 ※.NET 7의 `GetElapsedTime`을 쓴다.
- **`dotnet-counters`/`dotnet-trace`/`dotnet-dump`는 EventPipe 위에서 동작하며 권한이 필요 없다.** 개관 → 상세 추적 → 덤프 순으로 좁혀 들어가는 것이 표준 순서다.

---

## 연습 문제

1. `[Conditional("LOGGINGMODE")]` 메서드를 만들고, 인자에 정적 카운터를 증가시키는 식을 넣어라. 심볼을 정의했을 때와 안 했을 때 카운터 값을 출력해 차이를 확인하고, `ildasm`(또는 ILSpy)으로 `Main`의 IL을 비교하라.
2. 콘솔 앱에서 `Trace.WriteLine("hello")`만 호출하고 **디버거 없이** 실행하라. 출력이 어디에도 나타나지 않음을 확인한 뒤, `ConsoleTraceListener`를 등록해 다시 실행하고 차이를 확인하라.
3. `TraceListener`를 상속해 메시지를 JSON 한 줄로 표준 출력에 쓰는 리스너를 구현하라. `TraceEvent`를 재정의해 심각도와 소스 이름까지 포함시키고, `EventTypeFilter`를 붙여 `Warning` 이상만 통과하는지 검증하라.
4. 같은 코드를 Debug 구성과 Release 구성으로 각각 빌드해 `new StackTrace(true).ToString()`을 출력하라. 프레임 수와 줄 번호가 어떻게 달라지는가? 중간 메서드에 `[MethodImpl(MethodImplOptions.NoInlining)]`을 붙이면 결과가 어떻게 바뀌는가?
5. `Process.GetCurrentProcess()`를 루프에서 폴링해 `WorkingSet64`를 1초마다 출력하되, `Refresh()`를 **호출하지 않는** 버전과 호출하는 버전을 비교하라. 그다음 같은 프로그램을 컨테이너에서 실행해 `GC.GetGCMemoryInfo().TotalAvailableMemoryBytes`와 호스트 메모리를 비교하라.
6. Windows 머신이 있다면 `EventLog`로 `Application` 로그에 항목을 하나 쓰고 이벤트 뷰어에서 확인하라. 이어서 같은 코드를 Linux에서 실행해 어떤 예외가 어느 시점에 나는지 확인하라. 빌드 시 CA1416 경고가 나오는지도 확인하라.
7. `Stopwatch.Frequency`와 `Stopwatch.IsHighResolution`을 출력하는 프로그램을 Windows와 Linux(또는 WSL)에서 각각 실행하라. `new TimeSpan(sw.ElapsedTicks)`와 `sw.Elapsed`의 값을 나란히 출력해 두 플랫폼에서의 차이를 확인하라.
8. `dotnet-counters monitor`로 자신의 앱을 관찰하면서 의도적으로 초당 수만 개의 짧은 수명 객체를 할당하는 루프를 돌려라. `Allocation Rate`, `Gen 0 GC / sec`, `% Time in GC`가 어떻게 움직이는가? 그다음 `System.Diagnostics.Metrics.Counter<long>`을 하나 추가하고 `--counters`로 함께 관찰하라.

---

**다음 장** — 74장「디버깅 기법」에서는 이 장에서 API로만 훑은 디버거 통합을 실제 워크플로로 확장한다. 디버거를 붙이고 끊는 방법, 조건부 중단점과 추적점, 병렬·비동기 코드에서 스택이 왜 끊겨 보이는지, 그리고 프로덕션 덤프에서 사고를 재현해내는 절차를 다룬다. 이 장의 디버거 특성이 IDE에서 실제로 어떤 화면을 만드는지도 그때 확인한다.
