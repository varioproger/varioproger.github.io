---
title: "5장. BCL 전체 지도"
parent: "1권 — 언어"
grand_parent: "C# Complete Guide"
nav_order: 5
---

# 5장. BCL 전체 지도

> **이 장의 위치** — Part I의 마지막 장이다. 2장에서 BCL이 무엇인지 이름을 붙였고, 3장에서 코드가 실행되는 경로를 봤고, 4장에서 프로젝트가 어느 런타임을 대상으로 하는지 정했다. 이제 남은 질문은 하나다 — **그 런타임 안에 무엇이 들어 있는가.** 이 장은 그 목록이자 지도다.
>
> **선수 지식** — 2장(C#이라는 언어, .NET이라는 플랫폼), 4장(프로젝트, 대상 프레임워크, 배포 형태). 특히 2.4절의 CLR/BCL/런타임/SDK 포함 관계와 4.4절의 참조 어셈블리 개념을 전제한다.
>
> **이 장에서 다루지 않는 것** — 여기 나오는 모든 타입의 사용법. 이 장은 **어디에 무엇이 있는지**만 알려주고, 각 영역의 실제 사용법은 해당 장으로 넘긴다. 애플리케이션 계층의 실전 사용은 81장, Roslyn API의 구체적 활용은 57.15절과 83.4절에서 다룬다.

---

## 5.1 시스템 타입과 텍스트 처리

### 이 장을 읽는 법 — 다른 장과 다르다

이 장은 **읽고 끝내는 장이 아니라 되돌아오는 장**이다. 다른 장은 앞에서 뒤로 한 번 읽으면 역할이 끝나지만, 이 장은 앞으로 수십 번 다시 펼치게 된다.

앞으로 실무에서 마주칠 질문은 대부분 이 형태다.

- "파일 하나를 통째로 읽어서 줄 단위로 나누고 싶다. 무엇을 쓰지?"
- "HTTP 요청에 타임아웃을 걸어야 한다. `HttpClient` 어디에 있더라?"
- "이 JSON을 객체로 바꾸는 게 `Newtonsoft.Json`이 아니라 BCL에도 있던가?"

**이 질문들의 공통점은 "모르는 것"이 문법이 아니라 위치라는 것이다.** C# 문법은 500페이지면 다 배운다. 그런데 BCL은 타입이 수천 개다. 전부 외우는 사람은 없고, 외울 필요도 없다. 필요한 것은 두 가지다.

1. **"이 기능은 대략 어느 영역에 있다"는 감각.** 이 장의 5.1~5.9절이 그 감각을 만든다.
2. **작업 이름으로 찾는 색인.** 이 장의 5.10절이 그것이다. 90개가 넘는 "하고 싶은 일"을 API 이름과 장 번호로 연결한다.

읽는 순서를 제안하면 이렇다. **처음에는 5.1~5.9를 훑어라.** 표를 정독하지 말고, 각 영역의 이름과 대표 타입 두어 개만 눈에 익혀라. 30분이면 된다. 그다음부터는 **5.10절만 펼쳐라.** 필요한 행을 찾고, 오른쪽 끝의 장 번호로 이동한다.

> **💡 이 장의 목표는 "외우기"가 아니라 "짐작하기"다**
>
> 좋은 .NET 개발자와 그렇지 않은 개발자의 차이는 API를 몇 개 외웠는가가 아니다. **모르는 기능을 만났을 때 어느 네임스페이스부터 뒤질지 3초 안에 결정할 수 있는가**다.
>
> 예를 들어 "터미널 색을 바꾸고 싶다"는 요구를 받았다고 하자. 감각이 있는 사람은 `System.Console`을 먼저 연다. `System.Drawing`이나 `System.Text`를 먼저 여는 사람은 30분을 더 쓴다. 이 장은 그 3초를 만드는 장이다.

### BCL 전체 구조 다이어그램

BCL은 평평한 타입 더미가 아니다. 아래 그림이 이 장 전체의 목차이자, 앞으로 되돌아올 좌표계다.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  애플리케이션 계층 — 앱 종류를 고르면 따라오는 것 (5.9절 · 81장)            │
│  ┌──────────────┐┌────────────────┐┌──────────┐┌────────┐┌────────────┐  │
│  │ ASP.NET Core ││ Windows Desktop││ WinUI 3  ││ MAUI   ││ Blazor     │  │
│  │ 웹·API·gRPC  ││ WPF·WinForms   ││ WinAppSDK││ 모바일 ││ 웹 UI in C#│  │
│  └──────────────┘└────────────────┘└──────────┘└────────┘└────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                            ↑ 이 아래에 얹힌다
┌──────────────────────────────────────────────────────────────────────────┐
│  BCL — 기본 클래스 라이브러리. 앱 종류와 무관하게 항상 있는 것             │
│                                                                          │
│  ① 핵심 타입          ② 데이터 구조        ③ 데이터 표현                  │
│  ─────────────       ─────────────       ─────────────                   │
│  System              System.Collections  System.Text.Json                │
│  System.Text         System.Linq         System.Xml(.Linq)               │
│  System.Globalization System.Buffers     System.Runtime.Serialization    │
│  (5.1절)             (5.2절)             (5.3절 · 5.7절)                 │
│                                                                          │
│  ④ 입출력·통신        ⑤ 실행·동시성        ⑥ 런타임·메타데이터            │
│  ─────────────       ─────────────       ─────────────                   │
│  System.IO           System.Threading    System.Reflection               │
│  System.Net(.Http)   ...Tasks            System.Runtime.Loader           │
│  System.IO.Compression ...Channels       System.Reflection.Emit          │
│  (5.4절)             (5.4절 · 5.6절)     (5.5절)                         │
│                                                                          │
│  ⑦ 진단·관측          ⑧ 보안              ⑨ 저수준·상호운용              │
│  ─────────────       ─────────────       ─────────────                   │
│  System.Diagnostics  System.Security     System.Runtime.InteropServices  │
│  ...Metrics          ...Cryptography     System.Runtime.Intrinsics       │
│  ...Tracing                              System(Span·Memory)             │
│  (5.4절)             (5.6절)             (5.7절)                         │
└──────────────────────────────────────────────────────────────────────────┘
                            ↑ 이 아래에 얹힌다
┌──────────────────────────────────────────────────────────────────────────┐
│  CLR — JIT · GC · 타입 로더 · 예외 처리 · 스레드 (52~60장, 61~66장)       │
└──────────────────────────────────────────────────────────────────────────┘
```

*그림 5-1. BCL의 9개 영역과 그 위아래 계층. 각 영역 안의 네임스페이스는 대표만 적었다.*

이 그림에서 읽어야 할 것은 세 가지다.

**첫째, 가로 방향에 위계가 없다.** ①번 영역이 ⑤번 영역보다 근본적이라는 뜻이 아니다. 그냥 성격이 다를 뿐이다. 다만 ①번 핵심 타입은 나머지 전부가 의존한다.

**둘째, 세로 방향에는 위계가 있다.** 애플리케이션 계층은 BCL을 쓰고, BCL은 CLR을 쓴다. 반대 방향 의존은 없다. 그래서 **콘솔 앱이든 ASP.NET Core 앱이든 MAUI 앱이든 `List<T>`와 `HttpClient`는 똑같이 쓴다.** 배운 것이 그대로 이월된다는 뜻이고, 이것이 .NET을 배울 가치가 있는 이유 중 하나다.

**셋째, 이 그림에 없는 것이 있다.** 데이터베이스 접근(`System.Data`), 의존성 주입(`Microsoft.Extensions.DependencyInjection`), 로깅 추상화(`Microsoft.Extensions.Logging`) 같은 것들이다. 이들은 BCL과 애플리케이션 계층의 경계에 걸쳐 있고, 5.9절에서 따로 다룬다.

### 네임스페이스와 어셈블리는 1:1이 아니다

이 장을 시작하기 전에 반드시 짚어야 하는 것이 있다. **네임스페이스 이름과 DLL 파일 이름은 같지 않다.** 이 사실을 모르면 이 장의 표가 거짓말처럼 보인다.

| 개념 | 정체 | 결정하는 사람 | 언제 존재하나 |
|---|---|---|---|
| **네임스페이스** | 타입 이름의 논리적 접두사 | 타입을 만든 사람이 소스에 적는다 | 컴파일 타임 개념. 런타임에는 타입의 전체 이름 일부로만 남는다 |
| **어셈블리** | 배포와 로딩의 물리적 단위(`.dll`) | 프로젝트 하나가 어셈블리 하나 | 런타임의 로딩 단위. 버전·서명·의존성을 갖는다 |

둘의 관계는 **다대다**다.

```text
네임스페이스 → 어셈블리 (하나의 네임스페이스가 여러 어셈블리에 흩어진다)

  System.Diagnostics ┬─→ System.Private.CoreLib.dll        (Debug, Stopwatch)
                     ├─→ System.Diagnostics.Process.dll    (Process)
                     └─→ System.Diagnostics.DiagnosticSource.dll
                                                           (Activity, Meter)

어셈블리 → 네임스페이스 (하나의 어셈블리가 여러 네임스페이스를 담는다)

  System.Private.CoreLib.dll ┬─→ System
                             ├─→ System.Collections.Generic
                             ├─→ System.IO
                             ├─→ System.Threading
                             ├─→ System.Reflection
                             └─→ ... (수십 개)
```

*그림 5-2. 네임스페이스와 어셈블리의 다대다 관계.*

**런타임의 핵심 타입 대부분은 `System.Private.CoreLib.dll` 단 하나에 들어 있다.** `object`, `string`, `int`, `List<T>`, `Dictionary<TKey,TValue>`, `Task`, `Exception`이 전부 이 한 파일 안에 있다. 이름에 `Private`가 붙어 있지만 그것이 실제로 로드되는 물건이다.

그러면 컴파일할 때 참조하는 `System.Runtime.dll`은 무엇인가. **참조 어셈블리이고, 그 안의 타입 대부분은 타입 전달자(type forwarder)다**(4.4절). 타입 전달자는 "이 이름의 타입은 사실 저 어셈블리에 있다"는 이정표일 뿐 구현이 없다. 이 메커니즘의 CLR 쪽 세부는 52.8절에서 다룬다.

직접 확인해보는 것이 가장 빠르다.

```csharp
using System.Reflection;

Type[] types =
[
    typeof(string),
    typeof(List<int>),
    typeof(System.Text.Json.JsonSerializer),
    typeof(System.Linq.Enumerable),
    typeof(Console),
    typeof(System.Text.RegularExpressions.Regex),
    typeof(System.Net.Http.HttpClient),
];

foreach (Type t in types)
    Console.WriteLine($"{t.FullName,-55} -> {t.Assembly.GetName().Name}");
```

실행 결과다(.NET 8 기준. 런타임 버전에 따라 달라질 수 있다).

```text
System.String                                           -> System.Private.CoreLib
System.Collections.Generic.List`1[[System.Int32, ...]]  -> System.Private.CoreLib
System.Text.Json.JsonSerializer                         -> System.Text.Json
System.Linq.Enumerable                                  -> System.Linq
System.Console                                          -> System.Console
System.Text.RegularExpressions.Regex                    -> System.Text.RegularExpressions
System.Net.Http.HttpClient                              -> System.Net.Http
```

`string`과 `List<int>`는 네임스페이스가 서로 다른데 같은 어셈블리에서 왔다. `JsonSerializer`부터는 네임스페이스와 어셈블리 이름이 우연히 일치하지만, **그것은 규칙이 아니라 그렇게 이름을 지은 결과다.**

> **⚠️ "네임스페이스를 참조한다"는 말은 없다**
>
> 초보자가 가장 자주 만드는 오해다. `using System.Text.Json;`을 썼는데 컴파일이 안 되면 "네임스페이스를 못 찾는다"고 생각한다. 실제로 일어난 일은 **그 네임스페이스의 타입을 담은 어셈블리를 참조하지 않았다**는 것이다.
>
> `using` 지시문은 이름을 짧게 쓰게 해주는 편의 문법일 뿐, 무언가를 가져오지 않는다(12.2절). 가져오는 것은 `.csproj`의 `<PackageReference>`나 `<ProjectReference>`다(4.7절).
>
> 그래서 오류 메시지 `CS0246: 형식 또는 네임스페이스 이름 'X'을(를) 찾을 수 없습니다`를 만나면 고칠 곳은 `using` 줄이 아니라 프로젝트 파일이다.

> **📌 파사드 어셈블리 — 껍데기만 남은 이름들**
>
> `mscorlib.dll`, `netstandard.dll`, `System.Core.dll` 같은 어셈블리는 오늘날 .NET에도 존재한다. 그런데 그 안에는 **타입 정의가 하나도 없고 타입 전달자만 있다.** .NET Framework 시절이나 .NET Standard를 대상으로 컴파일된 오래된 라이브러리가 이 이름을 참조하기 때문에 호환용으로 남겨둔 것이다.
>
> 그래서 디스어셈블러로 IL을 읽다가 `[mscorlib]System.Object`와 `[System.Runtime]System.Object`와 `[System.Private.CoreLib]System.Object`를 다 만날 수 있다. **셋 다 같은 타입이다**(3.3절의 박스도 같은 이야기다).

> **⚠️ NuGet이 필요한 네임스페이스가 섞여 있다**
>
> 이 장의 표에 나오는 네임스페이스가 전부 아무 프로젝트에서나 바로 쓰이는 것은 아니다. 크게 세 부류다.
>
> 1. **런타임에 항상 포함** — `System`, `System.Collections.Generic`, `System.IO`, `System.Text.Json` 등. `using`만 쓰면 된다.
> 2. **애플리케이션 계층에 포함** — `Microsoft.Extensions.*`의 상당수는 ASP.NET Core 공유 프레임워크에 들어 있다. 콘솔 앱에서 쓰려면 NuGet 패키지가 필요하다.
> 3. **항상 NuGet** — `System.Threading.Tasks.Dataflow`, `Microsoft.CodeAnalysis.*`(Roslyn), `System.Management`(Windows 전용) 등.
>
> **어느 부류인지는 .NET 버전마다 바뀐다.** 확실한 확인 방법은 하나뿐이다 — `using`을 쓰고 빌드해보는 것. `CS0246`이 나면 2번이나 3번이다.

### 네임스페이스 이름을 읽는 법

BCL의 네임스페이스 이름에는 규칙이 있다. 규칙을 알면 **처음 보는 이름에서도 성격을 짐작할 수 있다.**

| 이름 패턴 | 뜻 | 예 |
|---|---|---|
| `System.*` | .NET 표준 라이브러리. 런타임이나 공식 패키지로 제공된다 | `System.IO`, `System.Text.Json` |
| `Microsoft.Extensions.*` | 애플리케이션 공통 인프라. 특정 앱 종류에 묶이지 않는다 | `Microsoft.Extensions.Logging` |
| `Microsoft.AspNetCore.*` | ASP.NET Core 전용 | `Microsoft.AspNetCore.Builder` |
| `Microsoft.*` (그 외) | Microsoft가 만들었지만 표준 라이브러리는 아닌 것 | `Microsoft.EntityFrameworkCore` |
| `*.Generic` | 같은 개념의 제네릭 버전. 비제네릭 원본이 따로 있다 | `System.Collections.Generic` |
| `*.Extensions` | 기존 타입에 확장 메서드나 추상화를 얹는 계층 | `Microsoft.Extensions.DependencyInjection` |
| `*.Internal`, `*.Private.*` | 공개 API가 아니다. 직접 쓰지 마라 | `System.Private.CoreLib` |
| `*.InteropServices` | 관리 경계 바깥과의 접점 | `System.Runtime.InteropServices` |
| `*.CompilerServices` | 컴파일러가 쓰라고 만들어둔 것. 사람이 직접 쓸 일은 드물다 | `System.Runtime.CompilerServices` |

> **⚠️ 네임스페이스 계층은 상속도 포함도 아니다**
>
> `System.Collections.Generic`은 `System.Collections`의 "하위"처럼 보인다. 그런데 이것은 **이름의 계층일 뿐 어떤 종류의 포함 관계도 아니다.**
>
> 구체적으로 두 가지를 뜻한다.
>
> 1. `using System.Collections;`를 썼다고 `System.Collections.Generic`의 타입을 짧은 이름으로 쓸 수 있게 되지 않는다. 두 줄을 다 써야 한다(12.2절).
> 2. `System.Collections.Generic.List<T>`가 `System.Collections`의 어떤 타입을 상속하는 것도 아니다. 상속 관계는 이름과 무관하게 타입이 각자 선언한다.
>
> 이름이 계층적으로 보이는 것은 **사람이 찾기 쉽게 하려는 정리 방식**일 뿐이다. `System.Private.CoreLib.dll` 하나에 열 개가 넘는 네임스페이스가 들어 있다는 사실이 이를 증명한다.

> **💡 이름만 보고 "런타임 것인지 아닌지" 판단하지 마라**
>
> `System.`으로 시작하면 런타임에 포함되고 `Microsoft.`로 시작하면 NuGet일 것 같지만, 반례가 많다.
>
> - `System.Threading.Tasks.Dataflow` — `System.`이지만 NuGet 패키지다.
> - `Microsoft.Extensions.Logging.Abstractions` — ASP.NET Core 공유 프레임워크에 포함되어 있어 웹 프로젝트에서는 바로 쓴다.
>
> 이름은 **소유자와 성격**을 알려줄 뿐 배포 방식을 알려주지 않는다. 배포 방식은 빌드해보면 안다.

### `System` 네임스페이스 — 모든 것의 뿌리

가장 근본적인 타입들은 `System` 네임스페이스에 **직접** 들어 있다. 하위 네임스페이스가 아니라 바로 그 자리다.

여기에 있는 것은 C#의 내장 타입, `Exception` 기반 클래스, `Enum`·`Array`·`Delegate` 기반 클래스, 그리고 `Nullable`, `Type`, `DateTime`, `TimeSpan`, `Guid`다. 수학 함수(`Math`), 난수 생성(`Random`), 타입 간 변환(`Convert`, `BitConverter`)도 여기 있다. `IDisposable` 인터페이스와 가비지 컬렉터를 조작하는 `GC` 클래스도 마찬가지다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System` | `Object`, `String`, `Int32`, `Double`, `Boolean` | C# 내장 타입의 실체. `int`는 `System.Int32`의 별칭이다 | 6장, 7장, 8장, 15장 |
| `System` | `Exception`, `ArgumentException`, `InvalidOperationException` | 예외 계층의 뿌리 | 32장 |
| `System` | `Array`, `Enum`, `Delegate`, `MulticastDelegate` | 배열·열거형·델리게이트의 기반 클래스 | 9장, 20장, 26장 |
| `System` | `Nullable<T>`, `ValueTuple<...>` | 널 가능 값 타입, 튜플의 CLR 표현 | 21장, 77장 |
| `System` | `Type`, `Activator`, `AppContext` | 런타임 타입 정보와 동적 생성의 진입점 | 15.4절, 57장 |
| `System` | `DateTime`, `DateTimeOffset`, `TimeSpan`, `DateOnly`, `TimeOnly`, `TimeProvider` | 날짜와 시간 | 37장 |
| `System` | `Guid`, `Random`, `Math`, `Convert`, `BitConverter` | 유틸리티 — 식별자, 난수, 수학, 변환 | 39장, 38.9절 |
| `System` | `IDisposable`, `IAsyncDisposable`, `GC` | 결정적 정리와 가비지 컬렉터 조작 | 33장, 34장, 65.8절 |
| `System` | `IFormattable`, `IComparable<T>`, `IEquatable<T>`, `IParsable<T>` | .NET 전체가 공유하는 표준 프로토콜 | 25장, 38.1절 |
| `System` | `Span<T>`, `ReadOnlySpan<T>`, `Memory<T>` | 할당 없는 메모리 뷰 | 68장 |
| `System` | `Console`, `Environment` | 콘솔 입출력, 프로세스 환경 | 39.8절 |

> **📌 `int`와 `System.Int32`는 완전히 같은 것이다**
>
> `int i = 0;`과 `System.Int32 i = 0;`은 컴파일 결과가 **바이트 단위로 동일하다.** C#의 내장 타입 키워드는 전부 `System` 네임스페이스 타입의 별칭이다.
>
> 이 사실이 실무에서 의미를 갖는 지점이 있다. `Int32.Parse`와 `int.Parse`는 같은 메서드이고, `nameof(int)`는 컴파일되지 않지만 `typeof(int).Name`은 `"Int32"`를 준다. 그리고 리플렉션으로 타입을 찾을 때는 `"System.Int32"`라고 써야지 `"int"`라고 쓰면 못 찾는다(57.1절).

`System` 네임스페이스가 정의하는 표준 프로토콜 인터페이스들은 이 책 곳곳에서 계속 등장한다. **BCL의 응집력은 이 인터페이스들에서 나온다.** `IFormattable`을 구현하면 `string.Format`이 알아서 써주고, `IComparable<T>`를 구현하면 `Array.Sort`가 알아서 써주고, `IDisposable`을 구현하면 `using` 문이 알아서 써준다. 이 구조를 이해하는 것이 6장과 18장의 목표다.

### 텍스트 처리 — `System.Text`

문자열은 `System`에 있지만, **문자열을 다루는 도구**는 `System.Text` 아래에 있다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Text` | `StringBuilder` | `string`의 가변(mutable) 사촌. 반복 연결에 쓴다 | 35.6절 |
| `System.Text` | `Encoding`, `UTF8Encoding`, `Encoder`, `Decoder` | 바이트와 문자 사이의 변환. UTF-8·UTF-16·BOM | 35.8절, 35.9절 |
| `System.Text` | `Rune`, `StringBuilder.AppendJoin` | 유니코드 코드 포인트 단위 처리 | 35.2절 |
| `System.Text` | `CompositeFormat` | 형식 문자열을 미리 파싱해 재사용 ※.NET 8 | 38.3절 |
| `System.Text.Unicode` | `UnicodeRanges`, `Utf8` | 유니코드 범위 지정, UTF-8 직접 변환 | 69.7절 |
| `System.Text.RegularExpressions` | `Regex`, `Match`, `MatchCollection`, `[GeneratedRegex]` | 패턴 기반 검색·치환 | 36장 |
| `System.Globalization` | `CultureInfo`, `NumberFormatInfo`, `DateTimeFormatInfo`, `TextInfo` | 문화권에 따른 포매팅·파싱·비교 | 38장 |
| `System.Buffers` | `SearchValues<T>`, `ArrayPool<T>`, `IBufferWriter<T>` | 고성능 검색과 버퍼 재사용 | 69.3절, 69.6절 |

> **⚠️ 문자열 비교는 기본값이 상황마다 다르다**
>
> `string.Equals(a, b)`는 서수(ordinal) 비교이고, `string.Compare(a, b)`는 **현재 문화권** 비교이고, `a.StartsWith(b)`도 문화권 비교다. 같은 클래스의 메서드인데 기본 동작이 다르다.
>
> 그래서 터키어 로캘에서 `"FILE".StartsWith("fi", ...)` 류의 코드가 예상과 다르게 동작하는 사고가 실제로 난다. 정확한 규칙과 대처법은 35.4절에서 다룬다. **지금 기억할 것은 하나 — 비교 메서드를 쓸 때는 `StringComparison`을 명시하는 습관을 들여라.**

> **💡 `System.Text.Json`은 텍스트 처리가 아니다**
>
> 이름이 `System.Text`로 시작하니 텍스트 영역처럼 보이지만, 실제로는 데이터 직렬화 영역이다(5.3절). 이름이 이렇게 붙은 이유는 **JSON을 UTF-8 바이트 위에서 직접 처리하는 설계**를 강조하기 위해서다. `Newtonsoft.Json`이 `string`을 거치는 것과 대비된다.
>
> 네임스페이스 이름의 접두사로 영역을 추측하는 것은 대체로 통하지만, 이런 예외가 있다. 5.10절의 역인덱스를 쓰는 편이 안전하다.

---

## 5.2 컬렉션과 쿼리

### 컬렉션 — `System.Collections.*`

.NET은 항목의 모음을 관리하는 클래스를 여러 종류 제공한다. 리스트 기반 구조와 딕셔너리 기반 구조가 모두 있고, 이들은 **공통 특성을 통일하는 표준 인터페이스 집합**과 함께 동작한다. 이 인터페이스 집합이 있기 때문에 `foreach`가 모든 컬렉션에서 똑같이 동작하고, LINQ가 모든 컬렉션을 똑같이 쿼리한다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Collections` | `IEnumerable`, `ICollection`, `IList`, `ArrayList`, `Hashtable` | 비제네릭 컬렉션. **신규 코드에서는 쓰지 않는다** | 24.1절, 24.2절 |
| `System.Collections.Generic` | `List<T>`, `Dictionary<TKey,TValue>`, `HashSet<T>` | 일상적으로 쓰는 제네릭 컬렉션 | 24.4절, 24.6절, 24.7절 |
| `System.Collections.Generic` | `Queue<T>`, `Stack<T>`, `LinkedList<T>`, `SortedList<TKey,TValue>`, `PriorityQueue<TElement,TPriority>` | 특수 자료구조 | 24.5절 |
| `System.Collections.Generic` | `IEnumerable<T>`, `IReadOnlyList<T>`, `IEqualityComparer<T>`, `IComparer<T>` | 컬렉션 계약과 비교자 주입 | 24.2절, 24.13절 |
| `System.Collections.Frozen` | `FrozenDictionary<TKey,TValue>`, `FrozenSet<T>` | 한 번 만들고 계속 읽기만 하는 고성능 읽기 전용 컬렉션 ※.NET 8 | 24.11절 |
| `System.Collections.Immutable` | `ImmutableArray<T>`, `ImmutableList<T>`, `ImmutableDictionary<TKey,TValue>` | 범용 불변 컬렉션. 수정하면 새 인스턴스가 나온다 | 24.10절 |
| `System.Collections.Specialized` | `NameValueCollection`, `BitVector32`, `OrderedDictionary` | 강한 타입의 특수 목적 컬렉션 | 24.8절 |
| `System.Collections.ObjectModel` | `Collection<T>`, `KeyedCollection<TKey,TItem>`, `ReadOnlyCollection<T>` | 직접 컬렉션을 만들 때 쓰는 기반 클래스 | 24.9절 |
| `System.Collections.Concurrent` | `ConcurrentDictionary<TKey,TValue>`, `ConcurrentQueue<T>`, `ConcurrentBag<T>`, `BlockingCollection<T>` | 스레드 안전 컬렉션 | 24.12절, 50.10절 |

> **⚠️ 비제네릭 컬렉션은 "쓸 수 있다"가 아니라 "있다"에 가깝다**
>
> `ArrayList`와 `Hashtable`은 제네릭이 없던 C# 1.0 시절의 유물이다. 여전히 컴파일되고 동작하지만 신규 코드에서 쓸 이유가 없다. 두 가지가 망가진다.
>
> 1. **타입 안전성** — `ArrayList`에 `int`와 `string`을 섞어 넣어도 컴파일러가 막지 않는다.
> 2. **성능** — 값 타입을 넣을 때마다 박싱이 일어난다(15.2절). 100만 개를 넣으면 힙 객체가 100만 개 생긴다.
>
> 이 두 문제가 제네릭이 존재하는 이유 자체다(23.1절). 레거시 코드에서 만나면 그대로 두되, 새로 쓰지는 마라.

> **⚠️ "불변"과 "읽기 전용"은 다르다**
>
> `ReadOnlyCollection<T>`는 **읽기 전용 뷰**다. 원본 리스트를 감싸기만 하므로, 원본이 바뀌면 뷰를 통해 보이는 내용도 바뀐다.
>
> `ImmutableList<T>`는 **불변**이다. 만든 뒤에는 아무도 바꿀 수 없고, `Add`를 호출하면 원본이 아니라 새 인스턴스가 반환된다.
>
> 스레드 안전성을 기대하고 `ReadOnlyCollection<T>`를 반환했다가 사고가 나는 경우가 있다. 정확한 차이와 각각의 비용은 24.10절에서 다룬다.

> **💡 컬렉션 선택은 Big-O만으로 결정되지 않는다**
>
> 교과서는 "검색이 잦으면 `Dictionary`, 순회가 잦으면 `List`"라고 가르친다. 맞는 말이지만 절반이다. 원소가 10개인 컬렉션이라면 `Dictionary`의 해시 계산 비용이 `List`의 선형 검색보다 비쌀 수 있다.
>
> 상수 인자와 캐시 지역성까지 포함한 실제 선택 기준은 24.15절과 72.6절에서 측정값과 함께 다룬다.

### 컬렉션을 30초 안에 고르는 표

24장 전체가 이 주제이지만, 지도 단계에서 쓸 수 있는 요약이 필요하다. **아래 표의 첫 열에서 자신의 상황을 찾아라.**

| 이런 상황이면 | 이것을 쓴다 | 이유 |
|---|---|---|
| 순서대로 담고 인덱스로 접근한다 | `List<T>` | 인덱스 접근이 상수 시간. 가장 흔한 기본값 |
| 키로 값을 찾는다 | `Dictionary<TKey,TValue>` | 평균 상수 시간 조회 |
| 값이 있는지만 확인한다 | `HashSet<T>` | 중복 제거와 포함 검사에 특화 |
| 항상 정렬된 상태여야 한다 | `SortedDictionary<TKey,TValue>`, `SortedSet<T>` | 순회가 키 순서. 조회는 로그 시간 |
| 먼저 넣은 것을 먼저 꺼낸다 | `Queue<T>` | FIFO |
| 나중에 넣은 것을 먼저 꺼낸다 | `Stack<T>` | LIFO |
| 우선순위가 높은 것을 먼저 꺼낸다 | `PriorityQueue<TElement,TPriority>` | 힙 기반 |
| 크기가 고정이고 성능이 중요하다 | `T[]` (배열) | 간접 계층이 없다 |
| 만든 뒤 절대 바뀌지 않는다 | `ImmutableArray<T>`, `FrozenDictionary<TKey,TValue>` | 스레드 안전 + 조회 최적화 |
| 여러 스레드가 동시에 읽고 쓴다 | `ConcurrentDictionary<TKey,TValue>` | 내부적으로 잠금을 잘게 나눈다 |
| 스레드 사이로 항목을 넘긴다 | `Channel<T>`, `BlockingCollection<T>` | 프로듀서/컨슈머 전용 |
| 외부에 노출하지만 수정은 막는다 | `IReadOnlyList<T>` 반환 | 계약으로 의도를 표현 |

> **⚠️ `LinkedList<T>`는 거의 항상 답이 아니다**
>
> 자료구조 수업은 "중간 삽입이 잦으면 연결 리스트"라고 가르친다. **현대 CPU에서는 대체로 틀린 조언이다.**
>
> `LinkedList<T>`는 노드마다 힙 객체를 하나씩 만들고, 노드들이 메모리 여기저기에 흩어진다. 순회할 때마다 캐시 미스가 나고, 그 비용이 `List<T>`의 중간 삽입 시 배열 복사 비용을 넘어서는 경우가 흔하다.
>
> 정확한 비교와 측정값은 24.15절과 72.6절에서 다룬다. 지금 기억할 것 — **Big-O가 같거나 유리해도 실제로 느릴 수 있다.**

### 쿼리 — LINQ

**LINQ(Language-Integrated Query, 언어 통합 쿼리)** 는 로컬 컬렉션과 원격 컬렉션(예: SQL Server 테이블) 양쪽에 대해 타입 안전한 쿼리를 수행하게 해준다. LINQ의 큰 장점은 **여러 도메인에 걸쳐 일관된 쿼리 API를 제공한다**는 점이다. 메모리 안의 `List<T>`를 거르는 코드와 데이터베이스 테이블을 거르는 코드가 거의 같은 모양이 된다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Linq` | `Enumerable`, `Queryable`, `IGrouping<TKey,TElement>`, `ILookup<TKey,TElement>` | LINQ to Objects와 PLINQ. 확장 메서드 100여 개의 본체 | 29장, 30장 |
| `System.Linq` | `ParallelEnumerable`, `ParallelQuery<T>` | PLINQ — 쿼리를 여러 코어에 나눠 실행 | 50.3절 |
| `System.Linq.Expressions` | `Expression<TDelegate>`, `Expression`, `ExpressionVisitor` | 식 트리를 직접 만들고 분석한다 | 31장 |
| `System.Xml.Linq` | `XDocument`, `XElement`, `XAttribute` | LINQ to XML | 42장 |

> **📌 `Enumerable`이라는 클래스 하나가 LINQ의 절반이다**
>
> `Where`, `Select`, `OrderBy`, `GroupBy`, `Sum`... 우리가 LINQ라고 부르는 연산자 대부분은 `System.Linq.Enumerable`이라는 **정적 클래스의 확장 메서드**다.
>
> 이 사실이 중요한 이유는, LINQ가 언어 기능이 아니라 **라이브러리 기능**임을 뜻하기 때문이다. 컴파일러가 하는 일은 쿼리 식(`from x in xs where ...`)을 메서드 호출로 번역하는 것뿐이다(29.3절). 그래서 자신만의 `Where`를 정의해 LINQ 동작을 갈아끼울 수 있고, 실제로 EF Core가 그렇게 한다(31.7절).

> **⚠️ `System.Linq`의 `Where`와 `System.Linq.Queryable`의 `Where`는 다른 메서드다**
>
> 전자는 `Func<T,bool>` 델리게이트를 받아 **지금 여기서** 실행한다. 후자는 `Expression<Func<T,bool>>` 식 트리를 받아 **다른 곳으로 번역해 보낸다**(예: SQL).
>
> 겉보기 코드가 똑같은데 어느 쪽이 선택되느냐는 대상의 정적 타입이 `IEnumerable<T>`인지 `IQueryable<T>`인지에 달렸다. 이 한 글자 차이가 "쿼리 전체를 메모리로 끌어온 뒤 필터링"과 "DB에서 필터링"을 가른다. 프로덕션 성능 사고의 단골이며, 31.4절에서 정면으로 다룬다.

---

## 5.3 XML과 JSON

XML과 JSON은 .NET에서 폭넓게 지원된다. 두 형식은 성격이 달라서 API 구조도 다르다.

### XML — `System.Xml.*`

XML을 다루는 방식은 크게 세 가지다. DOM 방식(전체를 메모리에 올린다), 스트리밍 방식(앞으로만 읽는다), 직렬화 방식(타입과 XML을 자동 매핑한다).

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Xml.Linq` | `XDocument`, `XElement`, `XAttribute`, `XName` | LINQ to XML DOM. 오늘날 XML을 다루는 기본 선택 | 42.2절 ~ 42.10절 |
| `System.Xml` | `XmlReader`, `XmlWriter` | 저수준 고성능 스트리밍 리더/라이터. 큰 문서에 쓴다 | 42.11절 ~ 42.13절 |
| `System.Xml` | `XmlDocument`, `XmlNode` | 구식 W3C DOM API. 레거시 코드에서 만난다 | 42.1절 |
| `System.Xml.Schema` | `XmlSchema`, `XmlSchemaSet` | XSD 스키마 검증 | 42.14절 |
| `System.Xml.Serialization` | `XmlSerializer`, `[XmlElement]`, `[XmlAttribute]` | .NET 타입의 선언적 XML 직렬화 | 42.14절 |
| `System.Xml.XPath` | `XPathNavigator`, `XPathDocument` | XPath 쿼리 언어 | 42.5절 |
| `System.Xml.Xsl` | `XslCompiledTransform` | XSLT 스타일시트 변환 | 42.1절 |

### JSON — `System.Text.Json`

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Text.Json` | `JsonSerializer`, `JsonSerializerOptions` | 객체 ↔ JSON 변환. 가장 자주 쓰는 진입점 | 41.2절 |
| `System.Text.Json` | `Utf8JsonReader`, `Utf8JsonWriter` | 할당을 최소화하는 저수준 리더/라이터 | 41.3절 |
| `System.Text.Json` | `JsonDocument`, `JsonElement` | 읽기 전용 DOM. 스키마를 모를 때 | 41.4절 |
| `System.Text.Json.Nodes` | `JsonNode`, `JsonObject`, `JsonArray`, `JsonValue` | 수정 가능한 DOM | 41.4절 |
| `System.Text.Json.Serialization` | `JsonConverter<T>`, `[JsonPropertyName]`, `[JsonPolymorphic]`, `JsonSerializerContext` | 커스텀 변환, 다형 직렬화, 소스 생성 | 41.5절, 41.6절 |
| `System.Net.Http.Json` | `GetFromJsonAsync`, `PostAsJsonAsync` (확장 메서드) | HTTP 응답을 곧바로 객체로 | 43.4절 |

> **📌 `System.Text.Json` vs `Newtonsoft.Json`**
>
> `Newtonsoft.Json`(Json.NET)은 오랫동안 사실상의 표준이었고 지금도 널리 쓰인다. `System.Text.Json`은 .NET Core 3.0에서 BCL에 들어온 후발주자다.
>
> 큰 방향은 이렇다. `System.Text.Json`은 **UTF-8 바이트 위에서 직접 동작해 더 빠르고 할당이 적으며, Native AOT와 트리밍에 대응한다**(41.6절). `Newtonsoft.Json`은 **기능이 더 많고 관대하다** — 주석 허용, 유연한 타입 변환, 풍부한 확장점.
>
> 신규 프로젝트라면 `System.Text.Json`으로 시작하고, 막히는 기능이 나올 때 옮기는 편이 낫다. 선택 기준의 세부는 41.9절에서 비교한다.

> **⚠️ `System.Text.Json`의 기본값은 엄격하다**
>
> 기본 설정에서 대소문자를 구분하고, 주석을 허용하지 않고, 후행 쉼표를 허용하지 않고, `string`을 숫자 필드에 자동 변환하지 않는다.
>
> `Newtonsoft.Json`에서 넘어온 코드가 "왜 값이 전부 `null`이지"라고 헤매는 원인 1위가 **대소문자**다. 서버가 `camelCase`로 보내는데 C# 프로퍼티는 `PascalCase`인 상황이다. `JsonSerializerOptions.PropertyNameCaseInsensitive`나 `PropertyNamingPolicy`로 해결한다(41.2절).

> **⚠️ `BinaryFormatter`는 제거됐다**
>
> `System.Runtime.Serialization.Formatters.Binary.BinaryFormatter`는 오랫동안 .NET의 바이너리 직렬화 수단이었으나, **역직렬화 과정에서 임의 코드 실행이 가능한 구조적 취약점** 때문에 .NET 5부터 단계적으로 폐기됐고 .NET 9에서 구현이 제거됐다.
>
> 레거시 코드에서 이것을 발견했다면 그것은 기술 부채가 아니라 **보안 사고 대기 상태**다. 배경과 대체 수단은 41.7절과 41.8절에서 다룬다.

### XML과 JSON 중 무엇을 쓰나

| 기준 | XML | JSON |
|---|---|---|
| 주 용도 | 문서 지향. 설정, 문서, 레거시 시스템 연동 | 데이터 지향. 웹 API, 설정 |
| 스키마 검증 | XSD로 표준화되어 있다 | JSON Schema가 있으나 BCL 내장 지원은 없다 |
| 네임스페이스 | 표준 기능 | 없다 |
| 주석 | 지원 | 표준에는 없다(파서 옵션으로 허용 가능) |
| 크기 | 태그 반복으로 더 크다 | 더 작다 |
| .NET 기본 API | `XDocument` (LINQ to XML) | `JsonSerializer` |
| 이 책 | 42장 | 41장 |

실무 기본값은 단순하다. **새로 만드는 것이면 JSON, 이미 XML인 것과 대화해야 하면 XML.** `.csproj`가 XML인 것처럼(4.1절) 빌드 시스템과 오래된 엔터프라이즈 시스템에는 XML이 깊이 박혀 있어서, XML을 아예 안 만나기는 어렵다.

> **📌 `.csproj`를 읽는 것도 XML 처리다**
>
> 4장에서 계속 편집한 `.csproj` 파일이 XML이다. 빌드 도구를 만들거나 프로젝트 파일을 자동으로 고치는 스크립트를 쓸 일이 생기면, 그 순간 `XDocument`가 필요해진다.
>
> ```csharp
> XDocument proj = XDocument.Load("MyApp.csproj");
> string? tfm = proj.Descendants("TargetFramework").FirstOrDefault()?.Value;
> Console.WriteLine(tfm);   // 예: net8.0
> ```
>
> 세 줄이다. 이것이 `XDocument`가 여전히 쓸모 있는 이유다(42.3절).

---

## 5.4 진단, 동시성, 스트림, 네트워킹

이 절은 성격이 다른 네 영역을 묶었다. 공통점은 **애플리케이션이 자기 자신 바깥과 상호작용하는 방식**이라는 것이다. 진단은 자신을 관찰하고, 동시성은 시간을 나눠 쓰고, 스트림은 저장소와 주고받고, 네트워킹은 다른 기계와 주고받는다.

### 데이터 접근 — `System.Data`와 그 위

데이터베이스와 통신하고 데이터를 처리하는 타입은 `System.Data`와 그 아래에 있다. 그런데 오늘날 대부분의 코드는 이 계층을 직접 쓰지 않고 **그 위에 얹힌 계층**을 쓴다.

```text
   당신의 코드
        ↓
┌───────────────────────┐
│  EF Core (ORM)        │  엔티티 클래스 ↔ 테이블 자동 매핑, 변경 추적, LINQ → SQL
├───────────────────────┤
│  Dapper (마이크로 ORM)  │  SQL은 직접 쓰고, 결과를 객체로 매핑만
├───────────────────────┤
│  ADO.NET              │  DbConnection · DbCommand · DbDataReader
│  (System.Data)        │  가장 낮은 관리 계층
├───────────────────────┤
│  데이터베이스 드라이버   │  Microsoft.Data.SqlClient, Npgsql, ...
└───────────────────────┘
        ↓
   데이터베이스
```

*그림 5-4. 데이터 접근 계층. 위로 갈수록 편하고 아래로 갈수록 통제가 강하다.*

| 계층 | 대표 타입·패키지 | 성격 | 이 책 |
|---|---|---|---|
| ADO.NET | `DbConnection`, `DbCommand`, `DbDataReader`, `DataTable` (`System.Data`) | 연결·명령·읽기의 기본 추상화 | 81.7절 |
| 드라이버 | `Microsoft.Data.SqlClient`, `Npgsql`(NuGet) | DB 제품별 구현 | 81.7절 |
| 마이크로 ORM | Dapper(NuGet) | SQL 직접 작성 + 객체 매핑 | 72.3절, 81.7절 |
| ORM | `Microsoft.EntityFrameworkCore`, `DbContext` | 모델 정의, 변경 추적, 마이그레이션 | 31.7절, 31.8절, 81.6절 |

> **⚠️ ORM은 SQL을 몰라도 되게 해주지 않는다**
>
> EF Core는 LINQ를 SQL로 번역한다(31.7절). 편하지만, **번역 결과가 무엇인지 모르면 성능 사고가 난다.**
>
> 가장 흔한 것이 N+1 문제다. 부모 100개를 조회하고 각각의 자식을 접근하면 쿼리가 101번 나간다. 코드에는 반복문 하나만 보이므로 눈치채기 어렵다.
>
> 그래서 실무 규칙은 **"생성된 SQL을 로그로 볼 수 있게 해두고 개발한다"** 이다. 진단과 대처는 72.4절에서 다룬다.

### 진단 — `System.Diagnostics.*`

로깅과 어설션, 다른 프로세스와의 상호작용, Windows 이벤트 로그 기록, 성능 모니터링에 필요한 타입들이 `System.Diagnostics`와 그 하위에 정의되어 있다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Diagnostics` | `Debug`, `Trace`, `TraceListener` | 어설션과 추적 출력. `Debug`는 디버그 빌드에서만 살아남는다 | 73.2절, 73.3절 |
| `System.Diagnostics` | `Stopwatch` | 고해상도 경과 시간 측정 | 73.8절, 67.2절 |
| `System.Diagnostics` | `Process`, `ProcessStartInfo`, `ProcessThread` | 외부 프로세스 실행·조사·종료 | 73.5절 |
| `System.Diagnostics` | `StackTrace`, `StackFrame` | 호출 스택을 코드로 읽는다 | 73.4절 |
| `System.Diagnostics` | `Activity`, `ActivitySource` | 분산 추적 — 요청 하나가 서비스 여러 개를 지나가는 경로 | 75.4절 |
| `System.Diagnostics` | `EventLog` (Windows 전용) | Windows 이벤트 로그 읽기·쓰기·감시 | 73.6절 |
| `System.Diagnostics.Metrics` | `Meter`, `Counter<T>`, `Histogram<T>`, `ObservableGauge<T>` | 메트릭 계측 | 75.3절 |
| `System.Diagnostics.Tracing` | `EventSource`, `EventListener` | ETW/EventPipe로 나가는 구조적 이벤트 | 66.6절 |
| `System.Diagnostics.CodeAnalysis` | `[NotNullWhen]`, `[MemberNotNull]`, `[DynamicallyAccessedMembers]` | 컴파일러와 트리머에게 주는 힌트 | 21.9절, 57.14절 |
| `Microsoft.Extensions.Logging` | `ILogger<T>`, `LogLevel`, `[LoggerMessage]` | 애플리케이션 로깅의 표준 추상화 | 75.1절, 75.2절 |

> **⚠️ `Debug.Assert`는 릴리스 빌드에서 사라진다**
>
> `Debug` 클래스의 메서드에는 `[Conditional("DEBUG")]`가 붙어 있다. 즉 `DEBUG` 심볼이 정의되지 않은 빌드에서는 **호출 자체가 컴파일 결과에서 제거된다**(12.8절, 20.10절).
>
> 그래서 `Debug.Assert(SaveToDatabase())`처럼 **부수 효과가 있는 식**을 인자로 넘기면, 릴리스 빌드에서 그 저장이 아예 일어나지 않는다. 인자 안에 부수 효과를 넣지 마라. 이것은 문법 오류가 아니라 **빌드 구성에 따라서만 나타나는 논리 오류**이므로 테스트를 통과하고 프로덕션에서 터진다.

> **💡 `Console.WriteLine` 디버깅을 졸업하는 순서**
>
> 초보 단계에서는 `Console.WriteLine`으로 값을 찍는다. 그다음 `Debug.WriteLine`을 배우고, 그다음 `ILogger`를 배우고, 마지막에 `ActivitySource`와 `Meter`를 배운다.
>
> 이 순서가 곧 73장 → 75장의 순서다. 지금 단계에서 할 일은 **"찍어보기 말고 다른 방법이 있다"는 것만 알아두는 것**이다.

### 동시성과 비동기 — `System.Threading.*`

현대 애플리케이션의 상당수는 한 번에 두 가지 이상을 처리해야 한다. C# 5.0 이후로는 비동기 함수와 태스크·태스크 결합자 같은 고수준 구성 요소 덕분에 이 일이 훨씬 쉬워졌다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Threading` | `Thread`, `ThreadPool` | OS 스레드 직접 다루기, 스레드 풀 | 45장, 46.1절 |
| `System.Threading` | `CancellationToken`, `CancellationTokenSource` | 협력적 취소 프로토콜 | 46.8절 |
| `System.Threading` | `Interlocked`, `Volatile`, `Monitor`, `Lock` ※.NET 9 | 원자 연산과 잠금 | 48장 |
| `System.Threading` | `SemaphoreSlim`, `ManualResetEventSlim`, `Barrier`, `CountdownEvent` | 신호와 처리량 제한 | 48.11절, 49장 |
| `System.Threading` | `ThreadLocal<T>`, `AsyncLocal<T>`, `[ThreadStatic]` | 스레드·비동기 흐름별 상태 | 49.8절, 49.9절 |
| `System.Threading.Tasks` | `Task`, `Task<TResult>`, `ValueTask<TResult>` | 비동기 연산의 표현 | 46장, 47.5절 |
| `System.Threading.Tasks` | `TaskCompletionSource<T>`, `TaskScheduler`, `Parallel` | 태스크 수동 제어, 데이터 병렬 | 46.5절, 50.6절 |
| `System.Threading.Channels` | `Channel<T>`, `ChannelReader<T>`, `ChannelWriter<T>` | 비동기 프로듀서/컨슈머 큐 | 51.1절 |
| `System.Threading.Tasks.Dataflow` | `ActionBlock<T>`, `TransformBlock<TIn,TOut>` | 블록을 연결한 데이터 흐름 파이프라인(NuGet) | 51.1절 |
| `System.Runtime.CompilerServices` | `TaskAwaiter`, `AsyncTaskMethodBuilder`, `ConfiguredTaskAwaitable` | `await`가 컴파일된 뒤 실제로 호출하는 것들 | 47.6절, 47.7절 |

> **⚠️ 비동기와 병렬은 다른 문제다**
>
> 초보자가 가장 자주 섞는 두 개념이다.
>
> - **비동기(asynchrony)** — "기다리는 동안 스레드를 놓아준다." 문제는 **대기**다. 네트워크 응답, 디스크 읽기처럼 CPU가 할 일이 없는 시간을 낭비하지 않는 것이 목적이다.
> - **병렬(parallelism)** — "CPU 코어를 여러 개 동시에 쓴다." 문제는 **계산량**이다.
>
> `async`/`await`로 CPU 계산이 빨라지지 않고, `Parallel.For`로 서버 처리량이 늘지 않는다(오히려 준다). 이 구분이 47.1절과 50.1절의 출발점이다.

> **⚠️ `System.Threading.Tasks.Dataflow`는 NuGet 패키지다**
>
> 이름이 `System.`으로 시작해서 런타임에 포함된 것처럼 보이지만, 별도 패키지(`System.Threading.Tasks.Dataflow`)를 설치해야 한다. 5.1절의 박스에서 말한 세 번째 부류다.

### 스트림과 입출력 — `System.IO.*`

.NET은 저수준 입출력을 **스트림 기반 모델**로 제공한다. 스트림은 파일과 네트워크 연결에 직접 읽고 쓰는 데 쓰이며, 압축이나 암호화 기능을 추가하기 위해 **연결하거나(chain) 데코레이터 스트림으로 감쌀 수 있다.**

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.IO` | `Stream`, `FileStream`, `MemoryStream`, `BufferedStream` | 스트림 추상화와 백킹 스토어 | 40.1절 ~ 40.4절 |
| `System.IO` | `StreamReader`, `StreamWriter`, `BinaryReader`, `BinaryWriter` | 스트림 위에 얹는 텍스트·바이너리 어댑터 | 40.5절, 40.6절 |
| `System.IO` | `File`, `Directory`, `FileInfo`, `DirectoryInfo`, `Path` | 파일·디렉터리 조작과 경로 계산 | 40.10절 |
| `System.IO` | `FileSystemWatcher` | 파일 시스템 변경 감시 | 40.11절 |
| `System.IO.Compression` | `GZipStream`, `DeflateStream`, `BrotliStream`, `ZipArchive`, `ZipFile` | 압축·아카이브 | 40.7절 ~ 40.9절 |
| `System.Formats.Tar` | `TarFile`, `TarReader`, `TarWriter` | tar 아카이브 ※.NET 7 | 40.9절 |
| `System.IO.MemoryMappedFiles` | `MemoryMappedFile`, `MemoryMappedViewAccessor` | 메모리 매핑 파일, 프로세스 간 공유 메모리 | 40.14절 |
| `System.IO.Pipes` | `NamedPipeServerStream`, `AnonymousPipeClientStream` | 프로세스 간 파이프 통신 | 40.3절 |
| `System.IO.Pipelines` | `Pipe`, `PipeReader`, `PipeWriter` | 제로 카피에 가까운 고성능 파싱(NuGet) | 72.1절 |

> **📌 데코레이터 패턴을 배우기 가장 좋은 실물 예제**
>
> `Stream`의 구조는 디자인 패턴 교과서에 실릴 만하다. `FileStream`(실제 저장소) 위에 `GZipStream`(압축)을 감싸고, 그 위에 `CryptoStream`(암호화)을 감싸고, 그 위에 `StreamWriter`(텍스트 인코딩)를 감싼다. **각 계층은 자기 일만 하고, 아래 계층이 무엇인지 모른다.**
>
> ```csharp
> using var file = File.Create("data.gz");
> using var gzip = new GZipStream(file, CompressionMode.Compress);
> using var writer = new StreamWriter(gzip);
> writer.WriteLine("압축되어 저장된다");
> ```
>
> 이 4줄이 왜 이 순서여야 하고 `using`의 해제 순서가 왜 중요한지는 40.1절과 33.5절에서 다룬다.

> **⚠️ 비동기 파일 I/O는 기본적으로 진짜 비동기가 아니다**
>
> `new FileStream(path, FileMode.Open)`으로 만든 스트림에 `ReadAsync`를 호출하면, 겉보기에는 비동기지만 **내부적으로는 동기 읽기를 스레드 풀 스레드에서 수행**할 수 있다. 실제 OS 수준 겹침(overlapped) I/O를 쓰려면 생성 시점에 `FileOptions.Asynchronous`(또는 `useAsync: true`)를 지정해야 한다.
>
> 즉 **`Async`가 붙었다고 자동으로 스레드가 절약되는 것이 아니다.** 정확한 조건은 40.15절에서 다룬다.

### 네트워킹 — `System.Net.*`

HTTP, TCP/IP, SMTP 같은 표준 네트워크 프로토콜 대부분은 `System.Net`의 타입을 통해 직접 접근할 수 있다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Net.Http` | `HttpClient`, `HttpRequestMessage`, `HttpResponseMessage`, `HttpContent` | HTTP 클라이언트. 웹 API 호출의 기본 | 43.4절 ~ 43.6절 |
| `System.Net.Http` | `HttpMessageHandler`, `SocketsHttpHandler`, `IHttpClientFactory` | 요청 파이프라인 구성과 수명 관리 | 43.7절, 43.9절 |
| `System.Net` | `IPAddress`, `IPEndPoint`, `Dns`, `WebUtility`, `CookieContainer` | 주소·포트·DNS·쿠키 | 43.2절, 43.11절 |
| `System` | `Uri`, `UriBuilder` | URI 파싱과 조립 (`System` 네임스페이스에 있다) | 43.3절 |
| `System.Net.Sockets` | `Socket`, `TcpClient`, `TcpListener`, `UdpClient` | TCP·UDP·IP 직접 사용 | 43.12절 |
| `System.Net.Mail` | `SmtpClient`, `MailMessage` | SMTP 메일 전송 | 43.13절 |
| `System.Net.WebSockets` | `ClientWebSocket`, `WebSocket` | 양방향 지속 연결 | 43.10절 |
| `System.Net.Security` | `SslStream`, `RemoteCertificateValidationCallback` | TLS 위에서 직접 통신 | 43.12절 |
| `System.Net.NetworkInformation` | `Ping`, `NetworkInterface` | 네트워크 상태 조회 | 43.11절 |

> **⚠️ `HttpClient`를 `using`으로 감싸지 마라**
>
> `HttpClient`는 `IDisposable`이므로 `using`을 붙이는 것이 자연스러워 보인다. **그런데 그렇게 하면 프로덕션에서 소켓 고갈(socket exhaustion)이 난다.**
>
> `Dispose`가 호출돼도 내부 TCP 연결은 OS의 `TIME_WAIT` 상태로 일정 시간 남는다. 요청마다 새 인스턴스를 만들고 버리면 사용 가능한 포트가 고갈되고, 어느 순간 `SocketException`이 시작된다. 부하가 걸릴 때만 나타나므로 개발 환경에서는 절대 재현되지 않는다.
>
> 올바른 방법은 인스턴스를 재사용하거나 `IHttpClientFactory`를 쓰는 것이다. 전체 이야기는 43.9절에서 다룬다. **`IDisposable`이라고 해서 항상 즉시 해제하는 것이 정답은 아니라는 것**을 보여주는 대표 사례이기도 하다(33.4절).

> **📌 `WebClient`와 `HttpWebRequest`는 레거시다**
>
> 오래된 예제 코드에서 자주 보이는 `WebClient`, `HttpWebRequest`, `WebRequest`는 .NET Framework 시절의 API다. 오늘날 .NET에서도 동작하지만 사용이 권장되지 않으며, 일부는 명시적으로 폐기(obsolete) 표시가 되어 있다.
>
> 검색 결과에서 이 이름들이 보이면 **오래된 글**이라는 신호다. `HttpClient`로 대체된 방식을 찾아라.

---

## 5.5 어셈블리·리플렉션·특성, 동적 프로그래밍

### 어셈블리와 리플렉션

C# 프로그램이 컴파일되어 만들어지는 어셈블리는 **실행 명령(IL로 저장된다)** 과 **메타데이터**로 이루어진다. 메타데이터는 프로그램의 타입, 멤버, 특성을 기술한다. **리플렉션(reflection)** 을 통해 이 메타데이터를 런타임에 조사할 수 있고, 메서드를 동적으로 호출하는 것 같은 일을 할 수 있다. `Reflection.Emit`을 쓰면 **새 코드를 실행 중에 만들어낼 수도 있다.**

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Reflection` | `Assembly`, `Module`, `AssemblyName` | 어셈블리를 로드하고 그 안을 들여다본다 | 52.4절, 52.6절, 57.10절 |
| `System.Reflection` | `MemberInfo`, `MethodInfo`, `PropertyInfo`, `FieldInfo`, `ConstructorInfo`, `ParameterInfo` | 멤버 조회와 동적 호출 | 57.5절, 57.6절 |
| `System.Reflection` | `BindingFlags`, `CustomAttributeData` | 조회 범위 제어, 특성 데이터 읽기 | 57.7절, 57.11절 |
| `System.Reflection.Emit` | `DynamicMethod`, `ILGenerator`, `AssemblyBuilder`, `TypeBuilder` | 런타임에 IL을 생성한다 | 58장 |
| `System.Reflection.Metadata` | `MetadataReader`, `BlobReader` | 어셈블리를 로드하지 않고 메타데이터만 읽는다 | 57.10절 |
| `System.Runtime.Loader` | `AssemblyLoadContext`, `AssemblyDependencyResolver` | 어셈블리 격리와 언로드. 플러그인 시스템의 기반 | 52.9절 ~ 52.14절 |
| `System` | `Type`, `Activator`, `AppDomain`(레거시) | 타입 조회와 인스턴스 생성 | 57.1절, 57.3절 |
| `System.Runtime.CompilerServices` | `[MethodImpl]`, `[CallerMemberName]`, `RuntimeHelpers`, `Unsafe` | 컴파일러·런타임과의 계약 지점 | 20.11절, 55.4절, 68.12절 |
| `System.Resources` | `ResourceManager`, `ResourceSet` | 임베드된 리소스와 위성 어셈블리 | 53장 |

### 어셈블리를 들여다보는 최소 코드

리플렉션 전체는 57장이지만, **"BCL이 이렇게 자기 자신을 노출한다"** 는 감각은 지금 한 번 보는 편이 낫다.

```csharp
using System.Reflection;

// 1) 어떤 타입이 속한 어셈블리 얻기
Assembly core = typeof(string).Assembly;
Console.WriteLine(core.FullName);                       // 이름·버전·공개 키 토큰
Console.WriteLine(core.Location);                       // 디스크상의 실제 경로
Console.WriteLine($"공개 타입 수: {core.GetExportedTypes().Length}");

// 2) 내 프로그램이 참조하는 어셈블리 목록
foreach (AssemblyName r in Assembly.GetEntryAssembly()!.GetReferencedAssemblies())
    Console.WriteLine($"  → {r.Name} {r.Version}");
```

세 줄짜리 코드가 알려주는 것이 많다. `core.Location`은 실행 중인 런타임의 설치 경로를 그대로 보여주고(4.9절에서 본 프레임워크 종속 배포의 실물이다), `GetExportedTypes().Length`는 **어셈블리 하나에 공개 타입이 몇 천 개 단위로 들어 있다**는 것을 숫자로 보여준다.

`GetReferencedAssemblies()`가 출력하는 목록은 **컴파일 시점에 실제로 쓰인 어셈블리만** 담는다. `.csproj`에 참조를 걸어놨더라도 코드에서 타입을 하나도 안 쓰면 이 목록에 나오지 않는다. 참조와 실제 의존의 차이가 여기서 보인다(4.7절).

> **📌 리플렉션은 "메타데이터를 읽는 API"다**
>
> 3.3절에서 관리 모듈 안에 IL과 메타데이터가 함께 들어 있다고 했다. 위 코드는 **그 메타데이터를 읽는 것**이다. 파일을 파싱하는 것이 아니라, 이미 CLR이 로드해 메모리에 올려둔 구조를 조회한다.
>
> 그래서 리플렉션은 "특별한 도구"가 아니라 **어셈블리 형식의 자연스러운 귀결**이다. 메타데이터가 없는 C++ 네이티브 DLL로는 이 일을 할 수 없다.

### 특성 — 코드에 붙이는 메타데이터

특성(attribute)은 별도의 네임스페이스가 아니다. **`System` 네임스페이스의 `Attribute` 클래스를 상속한 클래스라면 무엇이든 특성이 된다.** 그래서 특성은 BCL 전역에 흩어져 있다.

| 특성 계열 | 대표 특성 | 누가 읽는가 | 이 책 |
|---|---|---|---|
| 컴파일러가 읽는 것 | `[Obsolete]`, `[Conditional]`, `[CallerMemberName]` | Roslyn 컴파일러 | 20.10절, 20.11절 |
| 런타임이 읽는 것 | `[Serializable]`, `[StructLayout]`, `[ThreadStatic]` | CLR | 54.4절, 49.8절 |
| 도구가 읽는 것 | `[DebuggerDisplay]`, `[DebuggerStepThrough]` | 디버거 | 74.2절 |
| 라이브러리가 읽는 것 | `[JsonPropertyName]`, `[XmlElement]` | 직렬화기 | 41.5절, 42.14절 |
| 트리머·AOT가 읽는 것 | `[DynamicallyAccessedMembers]`, `[RequiresUnreferencedCode]` | 게시 도구 | 57.14절 |
| 직접 만드는 것 | 사용자 정의 특성 | 당신의 리플렉션 코드 | 20.6절 ~ 20.9절 |

> **📌 특성은 "붙여두면 저절로 동작하는 것"이 아니다**
>
> 특성은 **메타데이터일 뿐이고, 누군가가 읽어야 의미가 생긴다.** 자신이 만든 `[MyValidation]` 특성을 프로퍼티에 붙여도, 그것을 읽어서 검증을 수행하는 코드를 직접 쓰지 않으면 아무 일도 일어나지 않는다.
>
> 반대로 `[Obsolete]`가 경고를 내는 이유는 **컴파일러가 그 특성을 특별히 알고 있기 때문**이다. 위 표는 결국 "누가 읽는가"로 특성을 분류한 것이고, 그것이 특성을 이해하는 가장 정확한 각도다(20.9절).

> **⚠️ 리플렉션은 트리밍과 Native AOT를 깨뜨린다**
>
> `Type.GetType("MyApp.Handlers." + name)`처럼 **문자열로 타입을 찾는 코드**는 컴파일 시점에 무엇이 필요한지 알 수 없다. 그런데 트리밍(trimming)과 Native AOT는 "쓰이지 않는 코드"를 지워서 크기를 줄인다(4.9절).
>
> 결과적으로 개발 중에는 잘 돌던 코드가 **게시(publish)한 뒤에만 `TypeLoadException`이나 `MissingMethodException`으로 죽는다.** 이 문제의 진단과 대처는 57.14절에서 다룬다. 지금 알아둘 것은 **"리플렉션에는 배포 형태에 따른 대가가 있다"** 는 사실이다.

### 동적 프로그래밍 — `System.Dynamic`

동적 프로그래밍의 패턴과 **동적 언어 런타임(DLR, Dynamic Language Runtime)** 을 활용하는 타입들은 `System.Dynamic`에 있다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Dynamic` | `DynamicObject`, `ExpandoObject`, `IDynamicMetaObjectProvider` | 멤버 접근을 런타임에 가로채는 사용자 정의 동적 객체 | 59.8절 |
| `Microsoft.CSharp.RuntimeBinder` | `RuntimeBinderException` | `dynamic` 호출이 런타임에 실패했을 때 나는 예외 | 59.4절 |
| `System.Linq.Expressions` | `Expression`, `CallSite<T>` | DLR의 호출 사이트 캐싱 기반 구조 | 59.2절, 59.3절 |

> **⚠️ `dynamic`은 `var`가 아니다**
>
> `var x = GetValue();`는 **컴파일 타임에 타입이 정해진다.** 단지 그 타입 이름을 적지 않았을 뿐이고, IL에는 구체 타입이 박혀 있다.
>
> `dynamic x = GetValue();`는 **컴파일 타임에 타입 검사를 하지 않는다.** 모든 멤버 접근이 런타임에 해석되고, 없는 멤버를 부르면 컴파일은 통과하고 실행 중에 `RuntimeBinderException`이 난다.
>
> 이름이 비슷해서 헷갈리기 쉽지만 정반대의 물건이다. 자세한 비교는 59.5절에 있다.

---

## 5.6 암호화, 고급 스레딩, 병렬 프로그래밍

### 암호화 — `System.Security.Cryptography`

.NET은 널리 쓰이는 해싱·암호화 프로토콜을 폭넓게 지원한다. 해싱, 대칭 암호화, 공개키 암호화, 그리고 Windows 데이터 보호 API가 모두 포함된다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System.Security.Cryptography` | `SHA256`, `SHA512`, `MD5`(레거시), `HMACSHA256` | 해시와 메시지 인증 코드 | 44.3절 |
| `System.Security.Cryptography` | `Rfc2898DeriveBytes` | 비밀번호 해싱 — 솔트와 반복 횟수 | 44.4절 |
| `System.Security.Cryptography` | `Aes`, `ICryptoTransform`, `CryptoStream` | 대칭 암호화. 스트림 체이닝으로 파일 암호화 | 44.5절 |
| `System.Security.Cryptography` | `RSA`, `ECDsa`, `RSAEncryptionPadding` | 공개키 암호화와 디지털 서명 | 44.7절 |
| `System.Security.Cryptography` | `RandomNumberGenerator` | 암호학적으로 안전한 난수 | 44.8절, 39.5절 |
| `System.Security.Cryptography` | `ProtectedData` (Windows 전용) | Windows 데이터 보호(DPAPI) | 44.2절 |
| `System.Security.Cryptography.X509Certificates` | `X509Certificate2`, `X509Store` | 인증서 로드와 검증 | 43.12절 |
| `System.Security` | `SecureString`(사용 비권장) | 메모리 내 민감 문자열 | 44.9절 |

> **⚠️ 암호 알고리즘을 직접 구현하지 마라**
>
> 이 규칙에는 예외가 없다. 논문에 나온 알고리즘을 그대로 옮겨 적어도, 타이밍 공격·패딩 오라클·부적절한 초기화 벡터 같은 실전 공격 표면은 알고리즘 명세에 나오지 않는다.
>
> `System.Security.Cryptography`의 구현은 대부분 **OS가 제공하는 검증된 암호 라이브러리**를 호출한다. 그것을 쓰는 것이 옳다. 흔한 실수 카탈로그는 44.9절에 정리했다.

> **⚠️ `Random`은 보안용이 아니다**
>
> `System.Random`은 빠르지만 **예측 가능한** 의사 난수 생성기다. 세션 토큰, 비밀번호 재설정 링크, 암호 키를 `Random`으로 만들면 취약점이다.
>
> 보안이 관련되면 `System.Security.Cryptography.RandomNumberGenerator`를 쓴다. 두 타입의 정확한 용도 구분은 39.5절에 있다.

### 고급 스레딩

C#의 비동기 함수는 저수준 기법의 필요를 크게 줄여 동시성 프로그래밍을 쉽게 만들었다. 그러나 여전히 **신호 구조체, 스레드 로컬 저장소, 읽기/쓰기 잠금** 같은 것이 필요한 때가 있다.

| 주제 | 대표 타입 | 언제 필요한가 | 이 책 |
|---|---|---|---|
| 배타적 잠금 | `lock` 문, `Monitor`, `Lock` ※.NET 9 | 공유 상태를 한 번에 한 스레드만 만지게 한다 | 48.5절, 48.15절 |
| 비배타적 잠금 | `SemaphoreSlim`, `ReaderWriterLockSlim` | 동시 접근 수를 제한하거나 읽기는 여럿 허용한다 | 48.11절 |
| 원자 연산 | `Interlocked`, `Volatile` | 잠금 없이 카운터를 증가시킨다 | 48.4절 |
| 신호 | `ManualResetEventSlim`, `AutoResetEvent`, `CountdownEvent`, `Barrier` | 스레드끼리 "이제 진행해도 된다"를 알린다 | 49.1절 ~ 49.6절 |
| 크로스 프로세스 | `Mutex`, `EventWaitHandle` | 프로세스가 여럿일 때 조율한다. 중복 실행 방지 등 | 48.10절, 49.4절 |
| 스레드 로컬 상태 | `[ThreadStatic]`, `ThreadLocal<T>`, `AsyncLocal<T>` | 스레드나 비동기 흐름마다 별도 값을 유지한다 | 49.8절, 49.9절 |
| 타이머 | `PeriodicTimer`, `System.Threading.Timer`, `System.Timers.Timer` | 주기적 실행 | 49.10절, 46.6절 |

> **💡 잠금이 필요하다고 느끼면 먼저 설계를 의심하라**
>
> `lock`을 쓰기 시작하면 데드락·경합·성능 저하가 따라온다. 그런데 상당수의 경우 **잠금이 필요 없게 설계를 바꿀 수 있다.**
>
> - 상태를 공유하지 않는다 → 각 작업이 자기 데이터만 만진다(50.4절).
> - 상태를 불변으로 만든다 → 아무도 바꾸지 않으면 잠글 것이 없다(19.8절).
> - 메시지로 넘긴다 → `Channel<T>`로 소유권을 이전한다(51.1절).
>
> 이 세 가지가 안 될 때 비로소 잠금이다. 순서를 지키면 동시성 버그의 대부분이 사라진다.

### 병렬 프로그래밍 — PFX

멀티코어 프로세서를 활용하는 라이브러리와 타입들이다. 태스크 병렬성, 명령형 데이터 병렬성, 함수형 병렬성(PLINQ)에 대한 API가 포함된다.

| 구성 요소 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| PLINQ | `AsParallel()`, `ParallelQuery<T>`, `WithDegreeOfParallelism` | LINQ 쿼리를 여러 코어에 나눈다. 가장 선언적 | 50.3절, 50.5절 |
| 데이터 병렬 | `Parallel.For`, `Parallel.ForEach`, `Parallel.ForEachAsync` | 루프를 병렬화한다 | 50.6절, 50.7절 |
| 태스크 병렬 | `Parallel.Invoke`, `Task.Run`, `Task.WhenAll` | 서로 다른 작업 여러 개를 동시에 | 50.8절, 46.9절 |
| 파티셔닝 | `Partitioner`, `OrderablePartitioner<T>` | 작업을 코어에 나누는 전략 제어 | 50.6절 |
| 동시성 컬렉션 | `IProducerConsumerCollection<T>`, `BlockingCollection<T>` | 병렬 작업 사이의 데이터 전달 | 50.10절, 50.11절 |
| 예외 처리 | `AggregateException`, `Flatten()`, `Handle()` | 여러 스레드에서 난 예외를 하나로 모은다 | 50.9절, 32.13절 |

> **⚠️ 병렬화가 항상 빨라지는 것은 아니다**
>
> `AsParallel()`을 붙이면 무료로 빨라질 것 같지만, 실제로는 **작업 분할·스레드 조율·결과 병합** 비용이 든다. 항목당 작업이 가벼우면 이 오버헤드가 이득을 넘어서 **더 느려진다.**
>
> 그리고 서버 애플리케이션에서는 특히 위험하다. 이미 요청 여러 개가 코어를 나눠 쓰고 있는데 요청 하나가 코어를 독점하면 전체 처리량이 떨어진다(51.6절). 판단 기준은 50.2절에서 다룬다.

---

## 5.7 `Span<T>`·`Memory<T>`, 상호운용, 정규식, 직렬화

### `Span<T>`와 `Memory<T>` — 메모리 관리자의 부담 줄이기

성능 핫스팟을 미세 최적화하는 것을 돕기 위해, CLR은 **메모리 관리자에 걸리는 부하를 줄이는 방식으로 프로그래밍할 수 있게 해주는 타입들**을 제공한다. 그중 핵심이 `Span<T>`와 `Memory<T>`다.

| 네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `System` | `Span<T>`, `ReadOnlySpan<T>` | 배열·문자열·스택 메모리의 한 구간을 **복사 없이** 가리킨다 | 68.2절 ~ 68.5절 |
| `System` | `Memory<T>`, `ReadOnlyMemory<T>` | `Span<T>`를 필드에 저장하거나 `await`를 건널 때 | 68.6절 |
| `System` | `MemoryExtensions` | `AsSpan()`, `Slice()` 등 스팬 확장 메서드의 본체 | 68.4절 |
| `System.Buffers` | `ArrayPool<T>`, `MemoryPool<T>`, `IMemoryOwner<T>` | 배열을 빌려 쓰고 돌려준다 | 69.3절 |
| `System.Buffers` | `SearchValues<T>` | 여러 값 중 하나를 찾는 최적화된 검색 ※.NET 8 | 69.6절 |
| `System.Runtime.InteropServices` | `MemoryMarshal`, `CollectionsMarshal` | 스팬과 다른 표현 사이의 변환(위험하지만 빠르다) | 68.8절 |

**왜 이것이 중요한가.** `"hello world".Substring(0, 5)`는 새 문자열을 **힙에 할당한다.** 같은 일을 `"hello world".AsSpan(0, 5)`로 하면 할당이 **0**이다. 원본의 앞 5글자를 가리키는 포인터와 길이만 만들 뿐이다.

이 차이가 초당 수만 번 실행되는 파싱 루프에서는 GC 압력의 차이로 나타난다. 다만 `Span<T>`에는 **`ref struct` 제약**이라는 대가가 있다 — 필드에 담을 수 없고, `async` 메서드 안에서 `await`를 건널 수 없고, 람다에 캡처할 수 없다. 그 이유와 회피법이 68장 전체다.

> **📌 `Span<T>`는 언어와 런타임이 함께 만든 타입이다**
>
> `Span<T>`는 평범한 라이브러리 타입이 아니다. 안전하게 쓰이려면 **컴파일러가 특별한 규칙을 강제하고(`ref struct`), JIT이 특별한 최적화를 해야 한다.**
>
> 그래서 `Span<T>`는 C# 7.2와 .NET Core 2.1이 함께 나올 때 도입됐다. 언어와 라이브러리와 런타임이 한 몸이라는 것을 보여주는 대표 사례다(2.4절의 "언어가 요구하는 타입" 이야기와 같은 맥락이다).

> **⚠️ `Span<T>`를 기본값으로 쓰지 마라**
>
> `Span<T>`가 좋다는 말을 듣고 모든 메서드 시그니처를 `ReadOnlySpan<char>`로 바꾸는 사람이 있다. 대개 손해다.
>
> `ref struct` 제약 때문에 호출 측 코드가 뒤틀리고(`async` 메서드에서 못 쓴다), 가독성이 떨어지고, 정작 그 코드가 핫 패스가 아니라면 이득이 0이다.
>
> 판단 순서는 이렇다 — **① 측정해서 병목임을 확인하고 ② 그 병목이 할당 때문임을 확인한 다음 ③ 그때 `Span<T>`를 꺼낸다.** 67장이 ①과 ②를 다루고, 68장이 ③을 다룬다. 순서를 뒤집으면 복잡도만 늘어난다.

### 상호운용 — `System.Runtime.InteropServices`

네이티브 코드와 **COM(Component Object Model)** 코드 양쪽과 상호 운용할 수 있다. 네이티브 상호운용은 비관리 DLL의 함수를 호출하고, 콜백을 등록하고, 데이터 구조를 매핑하고, 네이티브 데이터 타입과 상호 운용하게 해준다. COM 상호운용은 (Windows에서) COM 타입을 호출하고 .NET 타입을 COM에 노출하게 해준다.

| 대상 | 대표 타입·구문 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| P/Invoke | `[DllImport]`, `[LibraryImport]` ※.NET 7 | 비관리 DLL의 함수 호출 | 60.1절, 60.9절 |
| 마샬링 | `Marshal`, `[MarshalAs]`, `[StructLayout]` | 관리/비관리 데이터 표현 변환 | 60.2절, 60.3절 |
| 비관리 메모리 | `NativeMemory`, `Marshal.AllocHGlobal`, `SafeHandle` | 힙 바깥의 메모리를 직접 다룬다 | 60.15절, 33.7절 |
| 함수 포인터 | `delegate*`, `[UnmanagedCallersOnly]` | 델리게이트 없는 저비용 콜백 | 60.11절 |
| COM | `ComWrappers`, `[ComImport]`, `Marshal.ReleaseComObject` | COM 컴포넌트 호출과 노출(Windows) | 60.12절 ~ 60.14절 |
| 하드웨어 내장 함수 | `System.Runtime.Intrinsics`, `Vector128<T>`, `Vector256<T>` | CPU SIMD 명령을 C#에서 직접 | 71.1절, 71.2절 |

> **⚠️ P/Invoke 시그니처가 틀리면 조용히 메모리가 깨진다**
>
> `[DllImport]` 선언은 **컴파일러가 검증할 방법이 없다.** 네이티브 함수가 `int`를 받는데 C# 쪽에서 `long`으로 선언해도 컴파일은 통과한다. 실행 시점에 스택이 어긋나고, 운이 좋으면 즉시 크래시하고, 운이 나쁘면 **엉뚱한 메모리를 덮어쓴 채 한참 동안 정상처럼 동작한다.**
>
> 관리 코드의 타입 안전성이 경계 바깥에서는 보장되지 않는다는 것을 가장 뚜렷하게 보여주는 지점이다(2.6절). 60장은 이 경계를 안전하게 건너는 방법을 다룬다.

### 정규식과 직렬화

정규식은 문자열에서 문자 패턴을 찾는 데 쓰인다(36장). 직렬화는 객체를 바이너리나 텍스트 표현으로 저장하고 복원하는 여러 시스템을 가리킨다 — 통신에도 쓰이고, 파일 저장·복원에도 쓰인다.

| 시스템 | 대표 타입 | 형식 | 이 책 |
|---|---|---|---|
| JSON 직렬화 | `JsonSerializer` | 텍스트(UTF-8) | 41.2절 |
| XML 직렬화 | `XmlSerializer` | 텍스트(XML) | 42.14절 |
| 데이터 계약 직렬화 | `DataContractSerializer` | XML | 41.1절 |
| 바이너리 직렬화 | `BinaryFormatter` — **제거됨** | 바이너리 | 41.7절 |
| 정규식 | `Regex`, `[GeneratedRegex]` ※.NET 7 | — | 36장 |

> **💡 형식을 고르는 순서**
>
> 새 프로젝트에서 직렬화 형식을 고를 때의 실무 기본값은 이렇다.
>
> 1. **HTTP API로 주고받는다** → JSON(`System.Text.Json`). 논쟁의 여지가 거의 없다.
> 2. **설정 파일이다** → JSON. 사람이 자주 손대야 하면 YAML(서드파티)도 고려한다.
> 3. **서비스 간 고성능 통신이다** → gRPC/Protobuf(43.14절).
> 4. **레거시 시스템과 맞춰야 한다** → XML.
> 5. **.NET 프로세스끼리만, 최고 속도로** → 그래도 `BinaryFormatter`는 아니다. 41.9절을 봐라.
>
> 판단 기준의 세부는 41.1절에 있다.

---

## 5.8 Roslyn 컴파일러 API

### C# 컴파일러는 C#으로 쓰여 있다

이 절은 다른 절과 성격이 다르다. 여기서 다루는 것은 애플리케이션이 일상적으로 쓰는 BCL이 아니라, **컴파일러 자체를 라이브러리로 쓰는 방법**이다.

C# 컴파일러 자체가 C#으로 작성되어 있다. 프로젝트 이름은 **"Roslyn"** 이고, 그 라이브러리들은 **NuGet 패키지로 공개되어 있다.** 이 라이브러리를 쓰면 소스 코드를 어셈블리로 컴파일하는 것 말고도 컴파일러의 기능을 여러 방식으로 활용할 수 있다 — 예를 들어 **코드 분석 도구와 리팩터링 도구를 작성**할 수 있다.

```text
소스 코드
   ↓  [파싱]
SyntaxTree ────────── 구문 트리. "코드가 어떻게 생겼는가"
   ↓  [의미 분석]      (SyntaxNode, SyntaxToken, SyntaxTrivia)
SemanticModel ─────── 의미 모델. "이 이름이 실제로 무엇을 가리키는가"
   ↓  [코드 생성]      (ISymbol, ITypeSymbol, IMethodSymbol)
IL + 메타데이터
```

*그림 5-3. Roslyn이 소스를 어셈블리로 바꾸는 단계와 각 단계에서 노출되는 API.*

핵심은 **컴파일러의 중간 산출물이 전부 공개 API로 노출된다**는 것이다. 예전 컴파일러는 소스를 넣으면 DLL이 나오는 블랙박스였다. Roslyn은 그 안쪽의 구문 트리와 의미 모델을 밖에서 조회하고 조작하게 열어놨다. 이 설계가 "컴파일러를 서비스로(compiler as a service)"라고 불린다.

| 패키지·네임스페이스 | 대표 타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| `Microsoft.CodeAnalysis` | `SyntaxTree`, `SyntaxNode`, `SyntaxToken`, `Compilation` | 언어 중립 공통 API | 83.4절 |
| `Microsoft.CodeAnalysis.CSharp` | `CSharpSyntaxTree`, `CSharpCompilation`, `SyntaxFactory` | C# 전용 파싱과 컴파일 | 83.4절 |
| `Microsoft.CodeAnalysis.CSharp.Syntax` | `ClassDeclarationSyntax`, `MethodDeclarationSyntax`, `InvocationExpressionSyntax` | 구문 노드 타입들 | 83.4절 |
| `Microsoft.CodeAnalysis` | `SemanticModel`, `ISymbol`, `ITypeSymbol`, `IMethodSymbol` | 이름이 무엇을 가리키는지 해석한다 | 57.15절 |
| `Microsoft.CodeAnalysis.Diagnostics` | `DiagnosticAnalyzer`, `Diagnostic` | 사용자 정의 코드 분석기(경고·오류) | 79.13절 |
| `Microsoft.CodeAnalysis` | `IIncrementalGenerator` | 소스 생성기 — 컴파일 중에 코드를 만들어 넣는다 | 57.15절 |
| `Microsoft.CodeAnalysis.CodeFixes` | `CodeFixProvider` | IDE의 "빠른 수정" 전구 아이콘 | 79.13절 |
| `Microsoft.CodeAnalysis.CSharp.Scripting` | `CSharpScript` | C# 코드 문자열을 실행한다 | 83.4절 |

### 최소 예제 — 소스에서 메서드 목록 뽑기

Roslyn API가 어떤 모양인지 감을 잡는 데는 짧은 예제 하나면 충분하다. `Microsoft.CodeAnalysis.CSharp` 패키지를 참조한 콘솔 프로젝트에서 실행한다.

```csharp
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

// 소스 코드를 문자열로 준다 — 파일에서 읽어도 된다
SyntaxTree tree = CSharpSyntaxTree.ParseText(@"
class Greeter
{
    public string Hello(string name) => ""Hello, "" + name;
    private int Count(int a, int b) => a + b;
}");

SyntaxNode root = tree.GetRoot();

foreach (MethodDeclarationSyntax m in root.DescendantNodes()
                                          .OfType<MethodDeclarationSyntax>())
{
    Console.WriteLine($"{m.Identifier.Text} — 매개변수 {m.ParameterList.Parameters.Count}개");
}
```

출력은 이렇다.

```text
Hello — 매개변수 1개
Count — 매개변수 2개
```

여기서 중요한 것은 결과가 아니라 **구조**다. 소스 코드가 `SyntaxNode`의 트리로 바뀌었고, 그 트리를 LINQ로 순회했다(`DescendantNodes()`는 `IEnumerable<SyntaxNode>`를 준다). **컴파일러의 내부 자료구조가 평범한 .NET 컬렉션 API로 노출되어 있다**는 것이 Roslyn 설계의 핵심이다.

여기서 한 걸음 더 나가면 `SemanticModel`이 필요해진다. 구문 트리만으로는 `Hello`가 반환하는 `string`이 **어느 어셈블리의 어떤 타입인지** 알 수 없기 때문이다. 그 단계부터가 진짜 코드 분석이고, 57.15절과 83.4절에서 다룬다.

> **⚠️ 구문 트리는 "코드가 무엇을 뜻하는지" 모른다**
>
> 위 예제의 `string`은 `SyntaxToken`으로는 그냥 `"string"`이라는 글자다. 그것이 `System.String`인지, 아니면 누군가 `using string = MyLib.Text;`로 별칭을 만든 것인지 구문 트리는 판단하지 않는다(12.5절).
>
> 그 판단이 `SemanticModel`의 일이다. **분석기를 만들 때 구문 트리만 보고 판단하면 오탐이 나는 이유가 이것이다.**

### 실제로 언제 만나는가

Roslyn API를 직접 호출하는 코드를 쓰는 개발자는 소수다. 그러나 **Roslyn이 만든 결과물은 매일 만난다.**

| 만나는 형태 | 정체 | 이 책 |
|---|---|---|
| IDE의 빨간 밑줄과 전구 아이콘 | `DiagnosticAnalyzer` + `CodeFixProvider` | 79.13절 |
| `.editorconfig`로 강제하는 코딩 규칙 | 내장 분석기 규칙 | 79.13절 |
| `[GeneratedRegex]`가 만드는 정규식 코드 | 소스 생성기 | 36.8절 |
| `[LoggerMessage]`가 만드는 로깅 코드 | 소스 생성기 | 75.2절 |
| `[JsonSerializable]`이 만드는 JSON 코드 | 소스 생성기 | 41.6절 |
| `[LibraryImport]`가 만드는 P/Invoke 코드 | 소스 생성기 | 60.9절 |
| `record`가 만드는 `Equals`·`ToString` | 컴파일러 내장 생성 | 19.3절 |

> **📌 소스 생성기는 리플렉션의 컴파일 타임 대안이다**
>
> 위 표의 `[GeneratedRegex]`, `[LoggerMessage]`, `[JsonSerializable]`, `[LibraryImport]`에는 공통 패턴이 있다. **예전에는 런타임에 리플렉션이나 동적 코드 생성으로 하던 일을, 컴파일 타임에 소스 코드를 생성해서 대체한다.**
>
> 얻는 것은 세 가지다 — 시작이 빠르고(런타임 분석이 없다), 트리밍과 Native AOT에서 깨지지 않고(57.14절), 생성된 코드를 IDE에서 읽을 수 있다.
>
> 이것이 최근 .NET의 큰 흐름 중 하나다. 자세히는 57.15절에서 다루고, Roslyn 소스를 직접 읽는 방법은 83.4절에 있다.

> **⚠️ Roslyn 패키지는 반드시 버전을 맞춰야 한다**
>
> 분석기나 소스 생성기를 만들 때 `Microsoft.CodeAnalysis.CSharp` 패키지 버전은 **그것을 로드할 컴파일러 버전보다 높으면 안 된다.** 높으면 IDE나 빌드에서 로드에 실패하고, 오류 메시지가 원인을 잘 알려주지 않는다.
>
> 실무 규칙은 "지원해야 하는 가장 낮은 SDK에 맞춰 패키지 버전을 고정하라"다.

---

## 5.9 애플리케이션 계층 — ASP.NET Core, Windows Desktop, WinUI 3, MAUI

### 두 갈래 — 씬 클라이언트와 리치 클라이언트

UI 기반 애플리케이션은 두 범주로 나뉜다. **씬 클라이언트(thin client)** 는 결국 웹사이트다. **리치 클라이언트(rich client)** 는 최종 사용자가 컴퓨터나 모바일 기기에 내려받아 설치하는 프로그램이다.

씬 클라이언트를 C#으로 작성하려면 **ASP.NET Core**가 있고, Windows·Linux·macOS에서 실행된다. ASP.NET Core는 **웹 API 작성용으로도 설계**되어 있다.

리치 클라이언트에는 선택지가 여럿이다.

| 계층 | 실행 플랫폼 | 성격 | 이 책 |
|---|---|---|---|
| **ASP.NET Core** | Windows / Linux / macOS | 웹사이트, REST API, 마이크로서비스 | 81.3절 ~ 81.5절 |
| **Windows Desktop** (WPF · Windows Forms) | Windows 7~11 데스크톱 | 전통적 Windows 리치 클라이언트 | 81.8절 |
| **WinUI 3** (Windows App SDK) | Windows 10 이상 데스크톱 | UWP의 후계 | 81.8절 |
| **UWP** | Windows 10 이상 데스크톱과 Xbox·HoloLens 등 | Windows Store 앱 | 81.8절 |
| **MAUI** (구 Xamarin) | iOS · Android (+ macOS·Windows) | 모바일 우선 크로스 플랫폼 | 81.8절 |
| **Blazor** | 브라우저(WebAssembly) 또는 서버 | 클라이언트 코드를 JavaScript 대신 C#으로 | 81.8절 |

**서드파티 크로스 플랫폼 UI 라이브러리도 있다.** 대표적으로 Avalonia가 있고, MAUI와 달리 **Linux에서도 실행되며** 데스크톱 플랫폼에서 Catalyst나 WinUI 같은 간접 계층에 의존하지 않아 개발과 디버깅이 단순하다.

> **📌 애플리케이션 계층은 BCL을 대체하지 않는다**
>
> ASP.NET Core를 배운다는 것은 `List<T>`와 `HttpClient`를 다시 배운다는 뜻이 아니다. **BCL 위에 웹 요청 처리에 필요한 것이 얹힐 뿐이다.**
>
> 이것이 이 책이 1권과 2권에서 언어와 BCL을 먼저 다지고, 애플리케이션 계층을 81장 한 장으로 몰아둔 이유다. 계층을 바꿔도 밑의 90%는 그대로 쓴다.

### ASP.NET Core

ASP.NET Core는 ASP.NET의 **경량 모듈식 후계자**이며, 웹사이트·REST 기반 웹 API·마이크로서비스를 만드는 데 적합하다. React와 Angular라는 두 인기 단일 페이지 애플리케이션 프레임워크와 함께 동작할 수도 있다.

ASP.NET Core는 널리 쓰이는 **MVC(Model-View-Controller) 패턴**을 지원하고, **Blazor**라는 더 새로운 기술도 지원한다. Blazor에서는 클라이언트 측 코드를 JavaScript 대신 C#으로 작성한다.

ASP.NET Core는 Windows·Linux·macOS에서 실행되며 **자체 프로세스에서 셀프 호스팅**할 수 있다. .NET Framework 시절의 전임자(ASP.NET)와 달리, `System.Web`과 웹 폼(Web Forms)이 남긴 역사적 짐에 의존하지 않는다.

씬 클라이언트 아키텍처가 리치 클라이언트에 대해 갖는 일반적 이점은 이렇다.

- 클라이언트 쪽 **배포가 전혀 필요 없다.**
- 클라이언트는 **웹 브라우저를 지원하는 어떤 플랫폼에서도** 실행된다.
- **업데이트 배포가 쉽다.**

| 영역 | 대표 네임스페이스·타입 | 무엇에 쓰는가 | 이 책 |
|---|---|---|---|
| 호스팅·시작 | `Microsoft.AspNetCore.Builder`, `WebApplication` | 앱 구성과 실행 | 81.3절 |
| 미들웨어 | `IApplicationBuilder`, `HttpContext` | 요청 파이프라인 | 81.3절 |
| 최소 API | `MapGet`, `MapPost`, `Results` | 컨트롤러 없는 엔드포인트 | 81.3절 |
| MVC·Razor | `Controller`, `IActionResult`, Razor Pages | 뷰가 있는 웹 앱 | 81.4절 |
| 의존성 주입 | `Microsoft.Extensions.DependencyInjection`, `IServiceCollection` | 서비스 등록과 수명 관리 | 80.2절, 81.3절 |
| 구성 | `Microsoft.Extensions.Configuration`, `IConfiguration`, `IOptions<T>` | 설정 파일·환경 변수·비밀 | 81.3절 |
| 호스팅 서비스 | `Microsoft.Extensions.Hosting`, `IHostedService`, `BackgroundService` | 워커 서비스, 백그라운드 작업 | 81.1절 |
| 캐싱 | `Microsoft.Extensions.Caching.Memory`, `IMemoryCache`, `IDistributedCache` | 메모리·분산 캐시 | 72.5절 |
| 데이터 접근 | `System.Data`, `Microsoft.EntityFrameworkCore`, Dapper | DB 연결·쿼리·매핑 | 81.6절, 81.7절 |

> **📌 `Microsoft.Extensions.*`는 웹 전용이 아니다**
>
> 이름 때문에 ASP.NET Core의 일부처럼 보이지만, `Microsoft.Extensions.DependencyInjection`, `.Logging`, `.Configuration`, `.Hosting`은 **애플리케이션 종류와 무관한 범용 라이브러리**다. 콘솔 앱, 워커 서비스, 심지어 데스크톱 앱에서도 그대로 쓴다.
>
> 다만 콘솔 앱에서 쓰려면 NuGet 패키지를 명시적으로 추가해야 한다(5.1절의 박스, 부류 2번).

### Windows Desktop — WPF와 Windows Forms

Windows Desktop 애플리케이션 계층은 리치 클라이언트를 작성하기 위한 **두 개의 UI API**를 제공한다. WPF와 Windows Forms이며, 둘 다 Windows Desktop/Server 7부터 11까지에서 실행된다.

**WPF**는 2006년에 도입되어 지금까지 개선되어 왔다. 전임자인 Windows Forms와 달리 WPF는 **DirectX로 컨트롤을 직접 렌더링**하고, 그 결과 다음의 이점을 갖는다.

- 임의 변환, 3D 렌더링, 멀티미디어, **진짜 투명도** 같은 정교한 그래픽을 지원한다. 스타일과 템플릿을 통해 스키닝이 된다.
- 주 측정 단위가 **픽셀 기반이 아니어서**, 어떤 DPI 설정에서도 올바르게 표시된다.
- 레이아웃 지원이 폭넓고 유연해서, **요소가 겹칠 위험 없이 지역화**할 수 있다.
- DirectX를 쓰기 때문에 렌더링이 빠르고 **그래픽 하드웨어 가속**을 활용할 수 있다.
- 신뢰할 수 있는 **데이터 바인딩**을 제공한다.
- UI를 **XAML 파일에 선언적으로** 기술할 수 있고, 이 파일은 "코드 비하인드" 파일과 독립적으로 유지된다. 외관과 기능의 분리에 도움이 된다.

WPF는 크기와 복잡도 때문에 배우는 데 시간이 걸린다. WPF 애플리케이션을 작성하는 타입들은 `System.Windows` 네임스페이스와 그 하위 전부에 있다. 단 `System.Windows.Forms`는 예외다.

**Windows Forms**는 2000년 .NET Framework 첫 버전과 함께 출시된 리치 클라이언트 API다. WPF에 비하면 상대적으로 단순한 기술이며, 전형적인 Windows 애플리케이션을 작성하는 데 필요한 기능 대부분을 제공한다. **레거시 애플리케이션 유지보수에서 여전히 중요한 비중**을 차지한다. 그러나 WPF와 비교하면 단점이 많고, 대부분은 그것이 GDI+와 Win32 컨트롤 라이브러리를 감싼 래퍼라는 사실에서 나온다.

- DPI 인식 메커니즘을 제공하기는 하지만, **개발자와 다른 DPI 설정을 쓰는 클라이언트에서 깨지는 애플리케이션을 쓰기가 여전히 너무 쉽다.**
- 비표준 컨트롤을 그리는 API가 GDI+인데, 꽤 유연하기는 해도 **넓은 영역을 렌더링할 때 느리고**(이중 버퍼링이 없으면 깜빡일 수 있다).
- 컨트롤에 **진짜 투명도가 없다.**
- 대부분의 컨트롤이 **합성적(compositional)이지 않다.** 예를 들어 탭 컨트롤 헤더 안에 이미지 컨트롤을 넣을 수 없다. 리스트 뷰·콤보 박스·탭 컨트롤을 커스터마이즈하는 일은 WPF에서는 사소하지만 Windows Forms에서는 시간이 오래 걸리고 고통스럽다.
- **동적 레이아웃을 안정적으로 올바르게 구현하기가 어렵다.**

마지막 항목은 WPF를 선호할 훌륭한 이유다. "사용자 경험"이 아니라 그냥 UI만 필요한 업무 애플리케이션을 작성하더라도 그렇다. WPF의 `Grid` 같은 레이아웃 요소는 레이블과 텍스트 박스를 항상 정렬되게 배치하기 쉽게 해준다 — **언어 변경 지역화 후에도**, 지저분한 로직 없이, 깜빡임 없이. 게다가 화면 해상도의 최소 공통분모에 맞출 필요가 없다. WPF 레이아웃 요소는 처음부터 크기 변경에 제대로 적응하도록 설계됐다.

긍정적인 면에서는, Windows Forms가 **배우기 상대적으로 쉽고 서드파티 컨트롤이 여전히 많다.**

Windows Forms 타입은 `System.Windows.Forms`(`System.Windows.Forms.dll`)와 `System.Drawing`(`System.Drawing.dll`) 네임스페이스에 있다. 후자에는 커스텀 컨트롤을 그리기 위한 **GDI+ 타입**도 들어 있다.

> **⚠️ WPF·Windows Forms는 Windows 전용이다**
>
> 당연해 보이지만 실무에서 사고가 난다. 이 두 계층을 쓰는 프로젝트는 TFM이 `net8.0-windows` 형태여야 하고(4.2절), 그 순간 **Linux 빌드 서버에서 빌드가 깨진다.**
>
> 그리고 이 계층을 참조하는 클래스 라이브러리도 함께 Windows 전용이 된다. 도메인 로직을 UI 프로젝트에서 분리해야 하는 실용적 이유가 여기 있다 — 분리해두면 그 부분은 크로스 플랫폼으로 남고 테스트도 어디서나 돈다.

### UWP와 WinUI 3

**UWP**는 Windows 10 이상의 데스크톱과 기기를 대상으로 하는 **터치 우선 UI**를 작성하기 위한 리치 클라이언트 API다. "Universal(범용)"이라는 말은 Xbox, Surface Hub, HoloLens, 그리고 (당시의) Windows Phone을 포함한 여러 Windows 10 기기에서 실행되는 능력을 가리킨다.

UWP API는 XAML을 쓰고 WPF와 다소 비슷하다. 핵심 차이는 이렇다.

- UWP 앱의 **주된 배포 방식은 Windows Store**다.
- UWP 앱은 멀웨어 위협을 줄이기 위해 **샌드박스에서 실행된다.** 그래서 임의의 파일을 읽거나 쓸 수 없고 관리자 권한 상승으로 실행될 수 없다.
- UWP는 관리 런타임이 아니라 **운영체제(Windows)의 일부인 WinRT 타입에 의존한다.** 이 때문에 앱을 작성할 때 Windows 버전 범위를 지정해야 하고(예: Windows 10 빌드 17763부터 18362까지), 결국 오래된 API를 대상으로 하거나 고객에게 최신 Windows 업데이트 설치를 요구해야 한다.

이런 차이가 만든 한계 때문에, UWP는 WPF와 Windows Forms만큼의 인기를 얻지 못했다. 이를 해결하기 위해 마이크로소프트는 UWP를 **Windows App SDK**라는 새 기술로 변형했고, 그 UI 계층이 **WinUI 3**다.

Windows App SDK는 **WinRT API를 운영체제에서 런타임으로 옮겨서**, 완전한 관리 인터페이스를 노출하고 특정 운영체제 버전 범위를 대상으로 할 필요를 없앤다. 추가로 이런 것도 한다.

- Windows Desktop API(Windows Forms와 WPF)와 **더 잘 통합된다.**
- **Windows Store 샌드박스 바깥에서 실행**되는 애플리케이션을 작성할 수 있다.
- (UWP가 .NET Core 2.2에 묶여 있던 것과 달리) **최신 .NET 위에서 실행된다.**

이런 개선에도 불구하고 WinUI 3는 고전적인 Windows Desktop API만큼의 폭넓은 인기를 얻지는 못했다. Windows App SDK는 집필 시점 기준으로 Xbox나 HoloLens를 지원하지 않으며, **최종 사용자가 별도 다운로드를 설치해야 한다.**

> **💡 새 Windows 데스크톱 앱을 지금 시작한다면**
>
> 원서의 서술은 사실 관계이고, 여기서부터는 저자의 판단이다.
>
> - **사내 업무 애플리케이션이고 Windows만 지원한다** → WPF. 자료가 압도적으로 많고 서드파티 컨트롤 생태계가 성숙했다.
> - **기존 Windows Forms 앱을 유지보수한다** → 그대로 둔다. 전면 재작성의 비용 대비 이득이 거의 없다.
> - **Windows 11의 최신 룩앤필이 요구사항이다** → WinUI 3. 다만 별도 런타임 배포를 감수해야 한다.
> - **나중에 macOS나 Linux도 지원할 가능성이 있다** → 처음부터 크로스 플랫폼 UI를 고른다(MAUI 또는 Avalonia).
> - **어차피 사내 배포이고 브라우저로 충분하다** → ASP.NET Core. 배포 문제가 사라진다.
>
> 어느 쪽이든 **도메인 로직을 UI에서 분리해두면** 나중에 계층을 바꿀 때 잃는 것이 적다(81.8절).

### MAUI

**MAUI**(구 Xamarin)는 iOS와 Android를 대상으로 하는 모바일 앱을 C#으로 개발하게 해준다. Catalyst와 Windows App SDK를 통해 macOS와 Windows를 대상으로 하는 크로스 플랫폼 데스크톱 앱도 만들 수 있다.

iOS와 Android에서 실행되는 CLR/BCL은 **Mono**라고 부른다(오픈소스 Mono 런타임의 파생). 역사적으로 Mono는 .NET과 완전히 호환되지는 않았고, Mono와 .NET 양쪽에서 도는 라이브러리는 .NET Standard를 대상으로 했다(4.3절). 그러나 **.NET 6부터 Mono의 공개 인터페이스가 .NET에 병합되어, 사실상 Mono가 .NET의 한 구현이 되었다.**

MAUI는 **통합 프로젝트 인터페이스, 핫 리로드, Blazor Desktop과 하이브리드 앱 지원**을 포함한다.

> **📌 "런타임이 여러 개"라는 사실이 여기서 다시 나온다**
>
> 2.4절의 박스에서 CoreCLR·Mono·Native AOT를 언급했다. MAUI가 그 이야기의 실물이다. **같은 C# 코드가 데스크톱에서는 CoreCLR 위에서, iOS에서는 Mono(그리고 AOT 컴파일) 위에서 돈다.**
>
> 그래서 iOS에서는 런타임 코드 생성이 금지되고, 그 결과 `Reflection.Emit`에 의존하는 라이브러리가 동작하지 않을 수 있다. 배포 대상이 런타임을 고르고, 런타임이 사용 가능한 기능을 고른다. 이 연결고리는 4.9절과 57.14절에서 반복된다.

### `dotnet new` 템플릿과 계층의 대응

계층 이야기가 추상적으로 들린다면, **명령 하나로 실물을 만들어보는 것이 가장 빠르다.** 3.1절에서 `dotnet new console`을 썼다. 다른 템플릿도 같은 방식이다.

| 명령 | 만들어지는 것 | 어느 계층인가 | 이 책 |
|---|---|---|---|
| `dotnet new console` | 콘솔 애플리케이션 | BCL만 | 3.1절, 81.1절 |
| `dotnet new classlib` | 클래스 라이브러리 | BCL만 | 81.2절 |
| `dotnet new worker` | 워커 서비스(백그라운드 상시 실행) | 호스팅 계층 | 81.1절 |
| `dotnet new webapi` | REST API | ASP.NET Core | 81.3절, 81.5절 |
| `dotnet new mvc` | MVC 웹 애플리케이션 | ASP.NET Core | 81.4절 |
| `dotnet new razor` | Razor Pages 웹 애플리케이션 | ASP.NET Core | 81.4절 |
| `dotnet new blazor` | Blazor 애플리케이션 | ASP.NET Core | 81.8절 |
| `dotnet new wpf` | WPF 애플리케이션(Windows 전용) | Windows Desktop | 81.8절 |
| `dotnet new winforms` | Windows Forms 애플리케이션(Windows 전용) | Windows Desktop | 81.8절 |
| `dotnet new maui` | MAUI 애플리케이션 | MAUI 워크로드 | 81.8절 |
| `dotnet new xunit` | 단위 테스트 프로젝트 | 테스트 | 80.1절 |
| `dotnet new sln` | 솔루션 파일 | — | 4.8절 |

```bash
# 설치된 템플릿 전체 목록
dotnet new list

# 일부 템플릿은 워크로드를 먼저 설치해야 한다 (예: MAUI)
dotnet workload list
```

> **📌 템플릿이 만드는 `.csproj`를 먼저 봐라**
>
> 새 템플릿을 처음 쓸 때 가장 유익한 습관은, 생성된 `.csproj`를 열어 **`Sdk` 속성과 `TargetFramework`가 무엇으로 되어 있는지 확인하는 것**이다.
>
> - `dotnet new console` → `Sdk="Microsoft.NET.Sdk"`, `net8.0`
> - `dotnet new webapi` → `Sdk="Microsoft.NET.Sdk.Web"`, `net8.0`
> - `dotnet new wpf` → `Sdk="Microsoft.NET.Sdk"` + `UseWPF`, `net8.0-windows`
>
> 이 한 줄 차이가 "어떤 애플리케이션 계층이 딸려오는가"를 결정한다(4.1절, 4.2절). **계층은 마법이 아니라 프로젝트 파일 한 줄이다.**

### BCL이 열어주는 애플리케이션 종류

애플리케이션 계층을 UI 관점에서만 보면 그림이 좁다. BCL과 그 위의 라이브러리들이 실제로 가능하게 하는 애플리케이션 종류를 나열하면 이렇다.

| 애플리케이션 종류 | 무엇인가 | 이 책 |
|---|---|---|
| **웹 서비스** | 인터넷으로 오가는 메시지를 처리하는 메서드 | 81.5절 |
| **HTML 기반 웹 애플리케이션** | DB 질의와 웹 서비스 호출 결과를 조합해 브라우저에 표시한다 | 81.3절, 81.4절 |
| **리치 GUI 애플리케이션** | 컨트롤·메뉴·터치·마우스·키보드 이벤트를 다루고 OS와 직접 정보를 교환한다 | 81.8절 |
| **콘솔 애플리케이션** | UI 요구가 매우 단순할 때. 컴파일러·유틸리티·도구가 보통 이 형태다 | 81.1절 |
| **서비스(데몬)** | OS의 서비스 관리자가 제어하는 상시 실행 프로그램 | 81.1절 |
| **클래스 라이브러리(컴포넌트)** | 위의 어떤 애플리케이션에도 넣을 수 있는 독립 어셈블리 | 81.2절 |

> **💡 처음 배울 때는 콘솔 앱만 써라**
>
> 이 표를 보고 조급해질 필요가 없다. **이 책 1권과 2권의 예제는 거의 전부 콘솔 애플리케이션이다.** UI 프레임워크를 배우는 데 드는 시간이 언어와 BCL을 배우는 것을 방해하기 때문이다.
>
> 콘솔 앱에서 `Console.WriteLine`으로 결과를 확인하는 것이 초라해 보일 수 있지만, **실행 경로가 가장 짧아서 실험에 최적이다.** 3.8절에서 권한 SharpLab 습관과 같은 이유다.

---

## 5.10 "이 기능은 어디에 있나" 역인덱스

### 사용법

여기까지는 **"영역 → 타입"** 방향의 지도였다. 이 절은 반대 방향이다 — **"하고 싶은 일 → 타입"**.

실무에서 필요한 것은 대체로 이 방향이다. "지금 나는 문자열에서 숫자만 뽑아내고 싶다"에서 출발하지, "`System.Text.RegularExpressions`에 무엇이 있더라"에서 출발하지 않는다.

표의 네 번째 열이 **이 책의 장·절 번호**다. 답이 필요하면 거기로 가면 된다.

### 이 절을 쓰는 세 가지 상황

| 상황 | 하는 일 | 예 |
|---|---|---|
| **막혔을 때** | 하고 싶은 일을 한국어 한 문장으로 만들고 그 문장을 표에서 찾는다 | "JSON을 읽고 싶다" → `JsonSerializer.Deserialize<T>` |
| **리뷰할 때** | 남의 코드에 보이는 API가 어느 영역인지 확인하고 그 장으로 간다 | `BinaryFormatter`가 보인다 → 41.7절을 열고 지적한다 |
| **학습 계획을 세울 때** | 표를 훑으며 모르는 행에 표시한다. 표시가 몰린 영역이 다음에 읽을 Part다 | 동시성 표의 절반을 모른다 → Part IX |

세 번째 용법이 의외로 유용하다. **"내가 무엇을 모르는지"를 아는 것이 학습의 절반**이고, 이 표는 그 목록으로 쓰라고 만든 것이다. 더 체계적인 자기 점검은 84장의 체크리스트가 담당한다.

> **⚠️ 여기 적힌 것은 "출발점"이지 "정답"이 아니다**
>
> 같은 목적을 이루는 방법은 대개 여러 개다. 이 표는 **가장 자주 쓰이는 기본 선택지 하나**를 적었다. 성능이나 특수 요구사항이 있으면 해당 장에서 다른 선택지를 보게 된다.
>
> 예를 들어 "파일을 읽고 싶다" 행에는 `File.ReadAllText`가 적혀 있지만, 파일이 1GB라면 그것은 틀린 답이다. 그 판단이 40장의 내용이다.

### 문자열과 텍스트

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 문자열을 자르고 싶다 | `Substring`, `AsSpan().Slice()`, 범위 연산자 `s[1..4]` | `System.String`, `System.MemoryExtensions` | 35.3절, 9.3절 |
| 문자열을 구분자로 나누고 싶다 | `string.Split` | `System` | 35.3절 |
| 문자열을 합치고 싶다 | `string.Join`, `string.Concat` | `System` | 35.3절 |
| 반복문에서 문자열을 계속 이어붙인다 | `StringBuilder` | `System.Text` | 35.6절 |
| 문자열에 값을 끼워 넣고 싶다 | 보간 문자열 `$"{x}"` | 언어 기능 | 8.3절, 35.7절 |
| 앞뒤 공백을 없애고 싶다 | `Trim`, `TrimStart`, `TrimEnd` | `System.String` | 35.3절 |
| 대소문자를 무시하고 비교하고 싶다 | `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)` | `System` | 35.4절 |
| 문자열이 비었는지 확인하고 싶다 | `string.IsNullOrEmpty`, `IsNullOrWhiteSpace` | `System` | 35.3절 |
| 문자열에서 패턴을 찾고 싶다 | `Regex.Match`, `[GeneratedRegex]` | `System.Text.RegularExpressions` | 36.1절, 36.8절 |
| 여러 줄 문자열을 코드에 그대로 쓰고 싶다 | 원시 문자열 리터럴 `"""..."""` ※C# 11 | 언어 기능 | 8.3절 |
| 이모지를 한 글자로 세고 싶다 | `Rune`, `StringInfo` | `System.Text`, `System.Globalization` | 35.2절 |
| 파일 인코딩을 바꾸고 싶다 | `Encoding.UTF8`, `Encoding.GetEncoding` | `System.Text` | 35.8절, 35.9절 |
| 문자열 할당을 없애고 싶다 | `ReadOnlySpan<char>`, `string.Create` | `System` | 68.5절, 69.5절 |

### 숫자, 날짜, 변환

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 문자열을 숫자로 바꾸고 싶다 | `int.TryParse`, `double.Parse` | `System` | 38.1절 |
| 숫자를 자릿수 맞춰 출력하고 싶다 | `value.ToString("N2")`, `$"{value:C}"` | `System`, `System.Globalization` | 38.3절 |
| 돈 계산을 정확히 하고 싶다 | `decimal` | `System` | 7.7절 |
| 반올림하고 싶다 | `Math.Round`, `MidpointRounding` | `System` | 39.1절, 7.8절 |
| 아주 큰 정수를 다루고 싶다 | `BigInteger` | `System.Numerics` | 39.2절 |
| 난수가 필요하다 | `Random.Shared.Next` | `System` | 39.5절 |
| 보안용 난수가 필요하다 | `RandomNumberGenerator.GetBytes` | `System.Security.Cryptography` | 44.8절 |
| 고유 식별자를 만들고 싶다 | `Guid.NewGuid()` | `System` | 39.7절 |
| 현재 시각을 얻고 싶다 | `DateTimeOffset.UtcNow`, `TimeProvider` ※.NET 8 | `System` | 37.2절, 37.9절 |
| 날짜만 다루고 싶다 | `DateOnly`, `TimeOnly` ※.NET 6 | `System` | 37.3절 |
| 시간대를 변환하고 싶다 | `TimeZoneInfo.ConvertTime` | `System` | 37.6절 |
| 경과 시간을 재고 싶다 | `Stopwatch` | `System.Diagnostics` | 73.8절 |
| 비트를 조작하고 싶다 | `BitOperations`, `BitConverter` | `System.Numerics`, `System` | 39.6절, 38.9절 |

### 컬렉션과 쿼리

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 값을 순서대로 담고 싶다 | `List<T>` | `System.Collections.Generic` | 24.4절 |
| 키로 값을 찾고 싶다 | `Dictionary<TKey,TValue>` | `System.Collections.Generic` | 24.7절 |
| 중복을 제거하고 싶다 | `HashSet<T>`, `Distinct()` | `System.Collections.Generic`, `System.Linq` | 24.6절, 30.2절 |
| 우선순위대로 꺼내고 싶다 | `PriorityQueue<TElement,TPriority>` | `System.Collections.Generic` | 24.5절 |
| 컬렉션을 조건으로 거르고 싶다 | `Where()` | `System.Linq` | 30.2절 |
| 컬렉션을 변환하고 싶다 | `Select()` | `System.Linq` | 30.3절 |
| 정렬하고 싶다 | `OrderBy()`, `List<T>.Sort`, `Array.Sort` | `System.Linq`, `System.Collections.Generic` | 30.5절, 24.3절 |
| 그룹으로 묶고 싶다 | `GroupBy()`, `ToLookup()` | `System.Linq` | 30.6절, 30.8절 |
| 합계·평균을 구하고 싶다 | `Sum()`, `Average()`, `Aggregate()` | `System.Linq` | 30.10절 |
| 두 컬렉션을 합치고 싶다 | `Concat()`, `Union()`, `Zip()` | `System.Linq` | 30.7절, 30.4절 |
| 조건에 맞는 첫 항목을 찾고 싶다 | `FirstOrDefault()`, `SingleOrDefault()` | `System.Linq` | 30.9절, 30.13절 |
| 읽기 전용으로 노출하고 싶다 | `IReadOnlyList<T>`, `ReadOnlyCollection<T>` | `System.Collections.Generic`, `...ObjectModel` | 24.10절 |
| 절대 바뀌지 않는 컬렉션이 필요하다 | `ImmutableArray<T>` | `System.Collections.Immutable` | 24.10절 |
| 만들고 나서 읽기만 하는데 아주 빨라야 한다 | `FrozenDictionary<TKey,TValue>` ※.NET 8 | `System.Collections.Frozen` | 24.11절 |
| 여러 스레드가 동시에 쓴다 | `ConcurrentDictionary<TKey,TValue>` | `System.Collections.Concurrent` | 24.12절 |
| 값을 하나씩 만들어 내보내고 싶다 | `yield return` | 언어 기능 | 28.3절 |
| 비동기로 하나씩 내보내고 싶다 | `IAsyncEnumerable<T>`, `await foreach` | `System.Collections.Generic` | 28.9절 |

### 파일과 스트림

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 파일을 통째로 읽고 싶다 | `File.ReadAllTextAsync`, `File.ReadAllLinesAsync` | `System.IO` | 40.10절 |
| 큰 파일을 조금씩 읽고 싶다 | `FileStream` + `StreamReader`, `File.ReadLines` | `System.IO` | 40.3절, 40.5절 |
| 파일에 쓰고 싶다 | `File.WriteAllTextAsync`, `StreamWriter` | `System.IO` | 40.10절, 40.5절 |
| 파일이 있는지 확인하고 싶다 | `File.Exists`, `Directory.Exists` | `System.IO` | 40.10절 |
| 경로를 조립하고 싶다 | `Path.Combine`, `Path.GetFileName` | `System.IO` | 40.10절, 40.12절 |
| 디렉터리를 재귀 탐색하고 싶다 | `Directory.EnumerateFiles(..., SearchOption.AllDirectories)` | `System.IO` | 40.10절 |
| 파일 변경을 감시하고 싶다 | `FileSystemWatcher` | `System.IO` | 40.11절 |
| 임시 파일이 필요하다 | `Path.GetTempFileName`, `Path.GetTempPath` | `System.IO` | 40.10절 |
| 압축하고 싶다 | `GZipStream`, `ZipFile.CreateFromDirectory` | `System.IO.Compression` | 40.7절, 40.8절 |
| 메모리 위에서 스트림을 쓰고 싶다 | `MemoryStream` | `System.IO` | 40.3절 |
| 큰 파일에 임의 접근하고 싶다 | `MemoryMappedFile` | `System.IO.MemoryMappedFiles` | 40.14절 |
| 프로세스끼리 데이터를 주고받고 싶다 | `NamedPipeServerStream`, `MemoryMappedFile` | `System.IO.Pipes`, `...MemoryMappedFiles` | 40.3절, 40.14절 |

### 데이터 표현 — JSON, XML, 직렬화

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| JSON을 읽고 싶다 | `JsonSerializer.Deserialize<T>` | `System.Text.Json` | 41.2절 |
| 객체를 JSON으로 만들고 싶다 | `JsonSerializer.Serialize` | `System.Text.Json` | 41.2절 |
| 스키마를 모르는 JSON을 뒤지고 싶다 | `JsonDocument`, `JsonNode` | `System.Text.Json(.Nodes)` | 41.4절 |
| JSON 프로퍼티 이름을 바꾸고 싶다 | `[JsonPropertyName]`, `JsonNamingPolicy` | `System.Text.Json.Serialization` | 41.5절 |
| AOT에서도 JSON이 동작하게 하고 싶다 | `[JsonSerializable]` + `JsonSerializerContext` | `System.Text.Json.Serialization` | 41.6절 |
| XML을 읽고 쓰고 싶다 | `XDocument`, `XElement` | `System.Xml.Linq` | 42.2절 ~ 42.7절 |
| 아주 큰 XML을 처리하고 싶다 | `XmlReader` | `System.Xml` | 42.11절 |
| 객체와 XML을 자동 매핑하고 싶다 | `XmlSerializer` | `System.Xml.Serialization` | 42.14절 |
| CSV를 다루고 싶다 | BCL에 전용 타입이 없다. 직접 파싱하거나 서드파티 | — | 40.5절 |
| 설정 파일을 읽고 싶다 | `IConfiguration` (`appsettings.json`) | `Microsoft.Extensions.Configuration` | 81.3절 |

### 네트워크

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 웹 페이지를 내려받고 싶다 | `HttpClient.GetStringAsync` | `System.Net.Http` | 43.4절 |
| REST API를 호출하고 객체로 받고 싶다 | `HttpClient.GetFromJsonAsync<T>` | `System.Net.Http.Json` | 43.4절 |
| 헤더를 붙여 요청하고 싶다 | `HttpRequestMessage` + `SendAsync` | `System.Net.Http` | 43.5절 |
| 파일을 업로드하고 싶다 | `MultipartFormDataContent`, `StreamContent` | `System.Net.Http` | 43.6절 |
| 요청에 타임아웃을 걸고 싶다 | `HttpClient.Timeout`, `CancellationTokenSource(TimeSpan)` | `System.Net.Http`, `System.Threading` | 43.4절, 51.4절 |
| 요청을 재시도하고 싶다 | BCL에 전용 타입이 없다. 직접 구현하거나 Polly 같은 서드파티 | — | 51.4절 |
| `HttpClient` 인스턴스를 어떻게 관리할지 모르겠다 | `IHttpClientFactory` | `System.Net.Http` | 43.9절 |
| URL을 조립·분해하고 싶다 | `Uri`, `UriBuilder` | `System` | 43.3절 |
| 호스트 이름을 IP로 바꾸고 싶다 | `Dns.GetHostAddressesAsync` | `System.Net` | 43.11절 |
| TCP로 직접 통신하고 싶다 | `TcpClient`, `TcpListener`, `Socket` | `System.Net.Sockets` | 43.12절 |
| 실시간 양방향 통신이 필요하다 | `ClientWebSocket`, SignalR(서드파티 계층) | `System.Net.WebSockets` | 43.10절 |
| 메일을 보내고 싶다 | `SmtpClient`, `MailMessage` | `System.Net.Mail` | 43.13절 |
| 서비스 간 고성능 통신이 필요하다 | gRPC | `Grpc.Net.Client`(NuGet) | 43.14절 |

### 동시성과 비동기

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| I/O를 기다리는 동안 스레드를 놓아주고 싶다 | `async` / `await` | 언어 기능 | 47장 |
| CPU 작업을 백그라운드로 보내고 싶다 | `Task.Run` | `System.Threading.Tasks` | 46.3절 |
| 여러 비동기 작업을 동시에 기다리고 싶다 | `Task.WhenAll`, `Task.WhenAny` | `System.Threading.Tasks` | 46.9절 |
| 작업을 취소하고 싶다 | `CancellationTokenSource`, `CancellationToken` | `System.Threading` | 46.8절 |
| 일정 시간 뒤에 실행하고 싶다 | `Task.Delay`, `PeriodicTimer` | `System.Threading.Tasks`, `System.Threading` | 46.6절, 49.10절 |
| 공유 변수를 안전하게 바꾸고 싶다 | `lock`, `Interlocked` | 언어 기능, `System.Threading` | 48.5절, 48.4절 |
| 동시 실행 개수를 제한하고 싶다 | `SemaphoreSlim` | `System.Threading` | 48.11절 |
| 비동기 코드에서 잠그고 싶다 | `SemaphoreSlim.WaitAsync` (`lock`은 쓸 수 없다) | `System.Threading` | 51.3절 |
| 프로듀서/컨슈머 큐가 필요하다 | `Channel<T>`, `BlockingCollection<T>` | `System.Threading.Channels`, `...Concurrent` | 51.1절, 50.11절 |
| 루프를 여러 코어에 나누고 싶다 | `Parallel.For`, `AsParallel()` | `System.Threading.Tasks`, `System.Linq` | 50.6절, 50.3절 |
| 진행률을 보고하고 싶다 | `IProgress<T>`, `Progress<T>` | `System` | 46.12절 |
| 콜백 기반 API를 `await` 하고 싶다 | `TaskCompletionSource<T>` | `System.Threading.Tasks` | 46.5절 |
| 중복 실행을 막고 싶다(프로세스 단위) | `Mutex` | `System.Threading` | 48.10절 |

### 진단, 성능, 런타임

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 로그를 남기고 싶다 | `ILogger<T>` | `Microsoft.Extensions.Logging` | 75.1절 |
| 로깅 비용을 없애고 싶다 | `[LoggerMessage]` | `Microsoft.Extensions.Logging` | 75.2절 |
| 성능을 정확히 측정하고 싶다 | BenchmarkDotNet(NuGet) | — | 67.3절 |
| 할당량을 알고 싶다 | `MemoryDiagnoser`, `GC.GetAllocatedBytesForCurrentThread` | — , `System` | 67.5절, 65.8절 |
| 메모리 사용량을 보고 싶다 | `GC.GetGCMemoryInfo`, `dotnet-counters` | `System` | 65.8절, 66.8절 |
| 메모리 누수를 찾고 싶다 | `dotnet-gcdump`, PerfView, WinDbg+SOS | — | 66.7절 ~ 66.9절 |
| 외부 프로그램을 실행하고 싶다 | `Process.Start` | `System.Diagnostics` | 73.5절 |
| 명령줄 인자를 읽고 싶다 | `args`, `Environment.GetCommandLineArgs` | 언어 기능, `System` | 3.7절, 39.8절 |
| 환경 변수를 읽고 싶다 | `Environment.GetEnvironmentVariable` | `System` | 39.8절 |
| 현재 OS를 알고 싶다 | `OperatingSystem.IsWindows()`, `RuntimeInformation` | `System`, `System.Runtime.InteropServices` | 40.12절 |
| 런타임에 타입을 찾고 싶다 | `Type.GetType`, `Assembly.GetTypes` | `System`, `System.Reflection` | 57.1절, 57.10절 |
| 플러그인을 동적으로 로드하고 싶다 | `AssemblyLoadContext` | `System.Runtime.Loader` | 52.9절, 52.14절 |
| 리플렉션이 너무 느리다 | 델리게이트 캐싱, 식 트리, 소스 생성기 | `System.Linq.Expressions` 외 | 57.12절, 57.13절 |
| 네이티브 함수를 호출하고 싶다 | `[LibraryImport]`, `[DllImport]` | `System.Runtime.InteropServices` | 60.1절, 60.9절 |

### 보안, 검증, 그 밖

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 해시를 구하고 싶다 | `SHA256.HashData` | `System.Security.Cryptography` | 44.3절 |
| 비밀번호를 저장하고 싶다 | `Rfc2898DeriveBytes`(솔트 + 충분한 반복) | `System.Security.Cryptography` | 44.4절 |
| 데이터를 암호화하고 싶다 | `Aes` + `CryptoStream` | `System.Security.Cryptography` | 44.5절 |
| 서명하고 검증하고 싶다 | `RSA`, `ECDsa` | `System.Security.Cryptography` | 44.7절 |
| 인수가 null인지 검사하고 싶다 | `ArgumentNullException.ThrowIfNull` | `System` | 21.10절 |
| 인수 범위를 검사하고 싶다 | `ArgumentOutOfRangeException.ThrowIfNegative` 계열 ※.NET 8 | `System` | 32.4절 |
| 리소스를 확실히 정리하고 싶다 | `using` 문/선언, `IDisposable` | 언어 기능, `System` | 33.5절 |
| 비동기 리소스를 정리하고 싶다 | `await using`, `IAsyncDisposable` | 언어 기능, `System` | 33.6절 |
| 객체를 지연 생성하고 싶다 | `Lazy<T>` | `System` | 34.7절 |
| 캐시가 객체를 붙잡지 않게 하고 싶다 | `WeakReference<T>`, `ConditionalWeakTable<TKey,TValue>` | `System`, `System.Runtime.CompilerServices` | 34.5절, 34.9절 |
| 의존성을 주입하고 싶다 | `IServiceCollection`, `IServiceProvider` | `Microsoft.Extensions.DependencyInjection` | 80.2절 |
| 단위 테스트를 쓰고 싶다 | xUnit(NuGet) | — | 80.1절 |
| 시간에 의존하는 코드를 테스트하고 싶다 | `TimeProvider` ※.NET 8 | `System` | 37.9절, 80.4절 |
| 코드 스타일을 팀에 강제하고 싶다 | `.editorconfig` + 분석기 | — | 79.13절 |

### 타입, 객체, 예외

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 객체가 같은지 비교하고 싶다 | `Equals`, `IEquatable<T>`, `==` 오버로딩 | `System` | 25.2절, 25.3절 |
| 해시 코드를 만들고 싶다 | `HashCode.Combine` | `System` | 25.4절 |
| 정렬 기준을 정의하고 싶다 | `IComparable<T>`, `IComparer<T>` | `System`, `System.Collections.Generic` | 25.6절, 25.7절 |
| 객체를 복사하고 싶다 | `with` 식(레코드), 복사 생성자 | 언어 기능 | 19.4절 |
| 타입이 무엇인지 런타임에 확인하고 싶다 | `is` 패턴, `GetType()`, `typeof` | 언어 기능, `System` | 15.3절, 15.4절 |
| 열거형 값을 문자열로 바꾸고 싶다 | `Enum.ToString`, `Enum.Parse`, `Enum.TryParse` | `System` | 20.2절, 38.7절 |
| 예외를 다시 던지고 싶다 | `throw;` (`throw ex;`가 아니다) | 언어 기능 | 32.5절 |
| 특정 조건일 때만 잡고 싶다 | `catch (Ex e) when (조건)` | 언어 기능 | 32.7절 |
| 예외 대신 실패를 표현하고 싶다 | `TryXxx` 패턴, `bool` 반환 + `out` | 관용구 | 32.9절 |
| 여러 예외를 하나로 모으고 싶다 | `AggregateException` | `System` | 32.13절 |
| 처리되지 않은 예외를 잡고 싶다 | `AppDomain.CurrentDomain.UnhandledException` | `System` | 32.14절 |
| null을 안전하게 다루고 싶다 | `?.`, `??`, 널 가능 참조 타입 | 언어 기능 | 10.10절, 21.6절 |

### 빌드, 배포, 도구

| 하고 싶은 일 | 쓸 것 | 어디에 있나 | 이 책 |
|---|---|---|---|
| 프로젝트를 만들고 실행하고 싶다 | `dotnet new`, `dotnet run` | .NET SDK | 3.1절 |
| 여러 .NET 버전을 대상으로 하고 싶다 | `<TargetFrameworks>` | `.csproj` | 4.2절 |
| 런타임 없이 실행되게 배포하고 싶다 | 자체 포함 게시, Native AOT | `dotnet publish` | 4.9절 |
| 실행 파일 하나로 만들고 싶다 | `PublishSingleFile` | `.csproj` / CLI 옵션 | 4.9절 |
| 배포 크기를 줄이고 싶다 | 트리밍(`PublishTrimmed`) | `.csproj` / CLI 옵션 | 4.9절, 57.14절 |
| 라이브러리를 배포하고 싶다 | `dotnet pack` (NuGet 패키지) | .NET SDK | 81.2절 |
| 의존성이 어디서 왔는지 알고 싶다 | `deps.json`, `dotnet list package` | 빌드 산출물 | 4.7절 |
| C# 언어 버전을 올리고 싶다 | `<LangVersion>` | `.csproj` | 4.5절 |
| 컴파일 결과 IL을 보고 싶다 | SharpLab, ILSpy | 도구 | 3.8절, 56.8절 |
| JIT이 만든 어셈블리를 보고 싶다 | `DOTNET_JitDisasm`, SharpLab | 도구·환경 변수 | 55.8절 |

> **💡 이 표에 없는 것을 찾는 순서**
>
> 90행이 넘지만 BCL 전체를 덮지는 못한다. 여기 없는 기능을 찾을 때의 순서를 권한다.
>
> 1. **5.1~5.9의 영역 표를 훑어 네임스페이스를 좁힌다.** 대개 두세 개로 줄어든다.
> 2. **IDE에서 그 네임스페이스를 `using`으로 넣고 점(`.`)을 찍는다.** IntelliSense가 타입 목록을 보여준다. 이것이 검색보다 빠른 경우가 많다.
> 3. **공식 API 문서(`learn.microsoft.com`)에서 네임스페이스 페이지를 연다.** 타입 목록과 한 줄 설명이 있다.
> 4. **그래도 없으면 BCL에 없는 것이다.** NuGet을 찾는다. CSV 파싱, YAML, 재시도 정책, Excel 조작 등이 이 부류다.
>
> 4번의 판단이 중요하다. **BCL에 없는 것을 BCL에서 찾느라 시간을 쓰는 것**이 흔한 낭비다.

---

## 이 장의 요약

- **BCL은 9개 영역으로 나뉜다.** 핵심 타입 · 데이터 구조 · 데이터 표현 · 입출력과 통신 · 실행과 동시성 · 런타임과 메타데이터 · 진단과 관측 · 보안 · 저수준과 상호운용. 그림 5-1이 이 장 전체의 좌표계다.
- **네임스페이스와 어셈블리는 1:1이 아니다.** 런타임의 핵심 타입 대부분은 `System.Private.CoreLib.dll` 하나에 있고, 컴파일 시점에 보이는 이름은 타입 전달자를 통한 참조 어셈블리의 이름이다(4.4절, 52.8절). `mscorlib.dll` 같은 파사드는 전달자만 담은 껍데기다.
- **`using`은 어셈블리를 가져오지 않는다.** `CS0246`을 만나면 고칠 곳은 `using` 줄이 아니라 프로젝트 파일의 참조다(4.7절).
- **BCL의 응집력은 `System` 네임스페이스의 표준 인터페이스에서 나온다.** `IFormattable`, `IComparable<T>`, `IEnumerable<T>`, `IDisposable`을 구현하면 BCL 전체가 그 타입을 알아본다.
- **애플리케이션 계층은 BCL 위에 얹힐 뿐 대체하지 않는다.** ASP.NET Core든 MAUI든 WPF든 `List<T>`와 `HttpClient`는 똑같이 쓴다. 그래서 언어와 BCL에 투자한 시간은 계층을 바꿔도 남는다.
- **UI 계층 선택은 플랫폼 선택이다.** WPF·Windows Forms·WinUI 3는 Windows 전용이고 TFM이 `net8.0-windows`가 된다(4.2절). MAUI는 iOS·Android에서 Mono 위에서 돌고, 그 사실이 리플렉션과 AOT 제약으로 이어진다.
- **Roslyn은 컴파일러를 라이브러리로 노출한다.** 직접 호출할 일은 드물지만 `[GeneratedRegex]`·`[LoggerMessage]`·`[JsonSerializable]` 같은 소스 생성기의 결과물은 매일 만난다. 이것이 리플렉션의 컴파일 타임 대안이다(57.15절).
- **이 장은 되돌아오는 장이다.** 5.10절의 역인덱스를 책갈피해두고, 앞으로 "이거 어디 있더라"가 떠오를 때마다 펼쳐라. BCL을 외우는 사람은 없다. 필요한 것은 3초 안에 어느 네임스페이스부터 뒤질지 정하는 감각이다.

---

## 연습 문제

1. **어셈블리 확인하기.** 5.1절의 코드를 실행해 `string`, `List<int>`, `Regex`, `HttpClient`, `JsonSerializer`가 각각 어느 어셈블리에서 오는지 출력하라. 그다음 `typeof(int).Assembly.Location`을 출력해 그 DLL의 실제 경로를 확인하고, 그 폴더에 몇 개의 DLL이 있는지 세어봐라(`Directory.GetFiles`). 예상보다 많은가 적은가?

2. **파사드 어셈블리 관찰.** `typeof(object).Assembly.GetName().Name`의 결과와, 같은 프로젝트를 `ildasm`이나 ILSpy로 열었을 때 `extends` 뒤에 보이는 어셈블리 이름을 비교하라. 다르다면 왜 다른지 4.4절과 5.1절의 설명으로 답해봐라.

3. **`CS0246` 재현하기.** 새 콘솔 프로젝트에서 `using System.Threading.Tasks.Dataflow;`를 쓰고 빌드해 오류를 확인하라. 그다음 NuGet 패키지를 추가해 오류가 사라지는 것을 확인하라. `using`을 지우는 것과 패키지를 추가하는 것 중 무엇이 "고친 것"인가?

4. **역인덱스 역방향 테스트.** 5.10절의 표를 덮고, 다음 다섯 가지를 무엇으로 할지 먼저 적어봐라. (a) 디렉터리 아래 모든 `.log` 파일 찾기 (b) JSON 문자열을 객체로 바꾸기 (c) 동시 실행을 4개로 제한하기 (d) 문자열이 숫자인지 확인하기 (e) 파일을 gzip으로 압축하기. 그다음 표와 대조하라. 틀린 항목이 지금 당신에게 약한 영역이다.

5. **네임스페이스 짐작 훈련.** 다음 기능이 어느 네임스페이스에 있을지 **찾아보기 전에** 적어라. (a) 프로세스의 작업 디렉터리 (b) 파일 경로 구분자 (c) CPU 코어 수 (d) 현재 문화권 (e) 스택 트레이스. 그다음 IDE에서 확인하라. 5개 중 몇 개를 맞혔는가?

6. **한 기능, 여러 답.** "텍스트 파일에서 특정 단어가 몇 번 나오는지 센다"를 세 가지 방법으로 구현하라. (a) `File.ReadAllText` + `Split` (b) `File.ReadLines` + LINQ (c) `StreamReader`로 한 줄씩. 100MB 파일에서 셋의 메모리 사용량이 어떻게 다를지 예측하고, 그 예측을 40장을 읽은 뒤 다시 확인하라.

7. **자기 지도 만들기.** 지금 다루고 있는(또는 최근에 본) 실제 프로젝트를 하나 골라, 그 프로젝트가 쓰는 `using` 지시문을 전부 모아 중복을 제거하라(`grep -h "^using" -r . | sort -u` 같은 방법으로). 나온 네임스페이스를 이 장의 9개 영역에 분류하라. 어느 영역이 비어 있는가? 그 빈칸이 당신이 아직 안 써본 BCL이다.

---

**다음 장** — 6장「구문과 타입 기초」에서 Part II가 시작된다. 여기까지가 지형도였다면, 다음 장부터는 실제 문법이다. 첫 C# 프로그램의 구성 요소를 하나씩 뜯어보고, 미리 정의된 타입의 분류를 세우고, 값 타입과 참조 타입이 왜 다르게 동작하는지 처음으로 설명한다. 5장에서 이름만 스쳐 지나간 `System`의 타입들이 그때부터 실물로 등장한다.
