# 부록 H. C# 버전별 기능 색인

> **이 부록의 위치** — 76장「C# 버전별 기능 지도」는 **왜 그 순서로 기능이 들어왔는가**를 서술했고, 77장은 그중 튜플·분해·패턴 매칭을 끝까지 팠다. 이 부록은 그 두 장과 1·2권 전체에 흩어진 `※C# N` / `※.NET N` 표기를 **찾기 위한 색인**으로 재배열한 것이다. 새로운 사실은 없다. 서술도 없다. "이 기능은 몇 버전이고, 무엇을 요구하고, 본문 어디에 있는가" 세 가지만 답한다.
>
> **선수 지식** — 4장(프로젝트와 대상 프레임워크), 76장(C# 버전별 기능 지도)
>
> **이 부록에서 다루지 않는 것** — 각 기능의 **문법과 의미론**은 1·2권이, **왜 그 시점에 나왔는가**는 76장이, **튜플·패턴의 세부**는 77장이, **널 가능 참조 타입의 마이그레이션 전략**은 21.7절이 담당한다. 이 부록은 그 위치를 가리키는 화살표만 모은다. 각 C# 버전의 기능 전체 목록은 어떤 2차 자료도 완전할 수 없다 — 정확한 전체 목록은 항상 `dotnet/csharplang` 저장소의 릴리스별 기능 상태 문서를 확인하라(76.12절의 지적 그대로다).

---

## H.1 이 색인을 쓰는 법

### 축이 하나가 아니다 — 언어 버전과 런타임 버전

"C# 12를 쓴다"와 ".NET 8을 쓴다"는 **다른 말이다.** 이 둘을 하나로 묶어 생각하는 것이 이 부록이 존재하는 이유이자, 실무에서 가장 흔한 사고 원인이다.

| 축 | 무엇이 결정하는가 | 무엇을 정하는가 | 확인 방법 |
|---|---|---|---|
| **언어 버전** | 설치된 SDK의 **C# 컴파일러**(Roslyn) + `<LangVersion>` | 어떤 **문법**을 쓸 수 있는가 | `.csproj`의 `<LangVersion>`, `dotnet --list-sdks` |
| **런타임 대상(TFM)** | `.csproj`의 `<TargetFramework(s)>` | 어떤 **API·타입**을 참조할 수 있는가, 어떤 **CLR 기능**이 있는가 | `.csproj`의 `TargetFramework` |
| **실행 런타임** | 배포 대상 기계에 설치된 것 | 이 애플리케이션이 **실행될 수 있는가** | `dotnet --list-runtimes` |

세 축은 독립이다. .NET 9 SDK를 깔고 `net8.0`을 대상으로 삼으면서 `<LangVersion>13</LangVersion>`을 쓰는 조합이 성립한다 — 이건 지원되는 구성이며, 지원되는 SDK와 지원되는 LTS 런타임을 동시에 쓰는 실무 전략이다(4.5절). 다만 **새 BCL API는 열리지 않는다. 언어 기능만 열린다.**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>   <!-- 런타임은 LTS 유지 -->
    <LangVersion>13</LangVersion>               <!-- 컴파일러만 최신 (.NET 9 SDK 필요) -->
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
```

### 대상 프레임워크와 기본 언어 버전의 대응

`<LangVersion>`을 쓰지 않으면 **TFM이 언어 버전을 정한다.** 임의의 매핑이 아니다 — 후기 버전의 C#은 후기 런타임에서 도입된 타입에 의존하는 기능을 포함하기 때문이다(4.5절, 76.13절).

| 대상 프레임워크(TFM) | 기본 C# 버전 | 비고 |
|---|---|---|
| `net10.0` | C# 14 | 76.12절이 다루는 범위의 상한 |
| `net9.0` | C# 13 | |
| `net8.0` | C# 12 | LTS. 이 책의 기준선 |
| `net7.0` | C# 11 | |
| `net6.0` | C# 10 | |
| `net5.0` | C# 9 | |
| `netcoreapp3.0` / `netcoreapp3.1` | C# 8 | |
| `netcoreapp2.x` | C# 7.3 | |
| `netstandard2.1` | C# 8 | .NET Framework은 이 사양을 지원하지 않는다 |
| `netstandard2.0` 및 그 이하 | **C# 7.3** | 라이브러리의 최소 공통분모 |
| `net48`, `net472` 등 .NET Framework 전부 | **C# 7.3** | .NET Framework 전용 |

마지막 두 줄이 이 부록의 절반을 설명한다. **.NET Framework과 `netstandard2.0`은 C# 7.3에서 멈춰 있다.**

`<LangVersion>`이 받는 값은 다음과 같다.

| 값 | 의미 |
|---|---|
| `7.3`, `8`, `9`, `10`, `11`, `12`, `13` … | 그 버전으로 고정 |
| `default` | TFM이 정하는 기본값 (지정하지 않은 것과 같다) |
| `latestMajor` | 설치된 컴파일러가 지원하는 최신 **주** 버전 |
| `latest` | 최신 주·부 버전 |
| `preview` | 프리뷰 기능 포함 — **프로덕션 금지** |
| `ISO-1`, `ISO-2` | C# 1.0 / C# 2.0 (ECMA 표준 버전) |

> **⚠️ `LangVersion`을 TFM 기본값 **위로** 올릴 때 — 두 경우를 구분하라**
>
> 위에서 본 `net8.0` + `<LangVersion>13</LangVersion>`처럼 **최신 .NET을 대상으로 언어 버전만 올리는 것은 지원되는 구성**이다. 문제가 되는 것은 .NET Framework과 `netstandard2.0`이다. `net472` 프로젝트에 `<LangVersion>12.0</LangVersion>`을 넣으면 컴파일은 되고 상당수 기능이 실제로 동작한다. 그러나 Microsoft는 이 조합을 테스트하지도 지원하지도 않는다. 컴파일러가 필요한 타입을 찾지 못하면 알아보기 힘든 오류를 내고, SDK를 올리면 그 오류가 바뀔 수 있다. 라이브러리를 배포한다면 특히 위험하다 — 소비자가 다른 SDK 버전을 쓰기 때문이다.
>
> 반대 방향은 안전하다. **`LangVersion`을 TFM 기본값 아래로 내리는 것은 완전히 지원된다.** 팀이 아직 특정 문법을 쓰지 않기로 했을 때 쓴다.

### 무엇이 되고 무엇이 안 되는가 — 네 등급

`<LangVersion>`을 올렸을 때 기능이 실제로 동작하는지는 **그 기능이 무엇을 요구하느냐**로 갈린다. 76.13절이 정리한 네 등급이 이 부록 전체의 공통 어휘다.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 등급 A — 순수 컴파일러                                                │
│   컴파일러가 IL을 다르게 만들 뿐. 어떤 런타임에서도 동작한다.          │
│   식 본문 멤버, nameof, ?., 지역 함수, switch 식, 최상위 문,          │
│   원시 문자열, 파일 범위 네임스페이스, 기본 생성자, 목록 패턴 …       │
│   → LangVersion만 올리면 끝.                                          │
├──────────────────────────────────────────────────────────────────────┤
│ 등급 B — 특성이 필요하지만 컴파일러가 만들어 넣는다                    │
│   IsReadOnlyAttribute, IsByRefLikeAttribute, NullableAttribute,       │
│   RefSafetyRulesAttribute, RequiresLocationAttribute …                │
│   → 사용자가 아무것도 안 해도 된다.                                    │
├──────────────────────────────────────────────────────────────────────┤
│ 등급 C — 타입이 필요하고 컴파일러가 만들지 않는다 (폴리필 가능)         │
│   IsExternalInit(init/record), RequiredMemberAttribute(required),     │
│   ModuleInitializerAttribute, SkipLocalsInitAttribute,                │
│   CallerArgumentExpressionAttribute, System.Index / System.Range,     │
│   System.ValueTuple, IAsyncEnumerable<T>, Span<T> …                   │
│   → 직접 선언하거나 NuGet 폴리필 패키지를 넣으면 동작한다.             │
├──────────────────────────────────────────────────────────────────────┤
│ 등급 D — 런타임(CLR) 자체가 바뀌어야 한다 (폴리필 불가)                │
│   기본 인터페이스 멤버, 공변 반환 타입, 정적 추상 인터페이스 멤버,     │
│   ref 필드, 제네릭 특성, 인라인 배열,                                 │
│   ref struct의 인터페이스 구현 / allows ref struct …                  │
│   → LangVersion으로 절대 열 수 없다. 런타임을 올려야 한다.             │
└──────────────────────────────────────────────────────────────────────┘
```

*그림 H-1. 언어 기능의 네 등급. H.2절 표의 "요구" 열이 이 등급을 가리킨다.*

**규칙 하나로 요약하면 이렇다 — 컴파일러가 이름으로 찾는 타입은 전부 폴리필 가능하다.** 반대로 런타임이 동작을 바꿔야 하는 기능(등급 D)은 이름을 맞춰봐야 소용없다(76.14절).

### 등급 D 기능의 최소 런타임

이 표가 등급 구분의 결론이다. 여기 있는 기능은 **`LangVersion`으로 열리지 않는다.**

| 기능 | C# 버전 | 최소 런타임 | `net472` / `netstandard2.0` |
|---|---|---|---|
| 기본 인터페이스 멤버 | 8 | .NET Core 3.0 / .NET Standard 2.1 | 불가 |
| 공변 반환 타입 | 9 | .NET 5 | 불가 |
| `[UnmanagedCallersOnly]` | 9 | .NET 5 | 불가 |
| 정적 추상·가상 인터페이스 멤버 | 11 | .NET 7 | 불가 |
| 제네릭 수학(`INumber<T>` 등) | 11 | .NET 7 | 불가 |
| `ref` 필드 | 11 | .NET 7 | 불가 |
| 제네릭 특성 | 11 | .NET 7 | 불가 |
| 인라인 배열 | 12 | .NET 8 | 불가 |
| `System.Threading.Lock` 인식 | 13 | .NET 9 | 불가 |
| `ref struct`의 인터페이스 구현 | 13 | .NET 9 | 불가 |
| `allows ref struct` | 13 | .NET 9 | 불가 |

### 등급 C 기능의 폴리필 경로

| 기능 | 필요한 것 | 폴리필 방법 |
|---|---|---|
| 튜플 (C# 7) | `System.ValueTuple<...>` | `System.ValueTuple` NuGet 패키지 |
| `Span<T>` / `stackalloc`→`Span` (C# 7.2) | `System.Span<T>` | `System.Memory` NuGet 패키지 (단, 언제나 "slow span" — 68.3절) |
| 인덱스·범위 (C# 8) | `System.Index`, `System.Range` | 직접 선언 또는 폴리필 패키지 |
| 비동기 스트림 (C# 8) | `IAsyncEnumerable<T>` 등 | `Microsoft.Bcl.AsyncInterfaces` 패키지 |
| NRT 특성 (C# 8) | `[NotNullWhen]` 등 | 폴리필 패키지 또는 직접 선언 |
| `init` / `record` (C# 9) | `IsExternalInit` | **직접 선언** 또는 `PolySharp` |
| 모듈 초기화자 (C# 9) | `ModuleInitializerAttribute` | 직접 선언 |
| `[SkipLocalsInit]` (C# 9) | `SkipLocalsInitAttribute` | 직접 선언 |
| `CallerArgumentExpression` (C# 10) | 해당 특성 | 직접 선언 |
| `required` (C# 11) | `RequiredMemberAttribute`, `CompilerFeatureRequiredAttribute`, `SetsRequiredMembersAttribute` | 직접 선언 또는 `PolySharp` |
| 컬렉션 식의 `[CollectionBuilder]` (C# 12) | 해당 특성 | 직접 선언 |

폴리필의 원형은 `IsExternalInit`이다. 세 가지 조건을 모두 지켜야 한다.

```csharp
// Polyfills/IsExternalInit.cs
#if !NET5_0_OR_GREATER
namespace System.Runtime.CompilerServices
{
    using System.ComponentModel;

    [EditorBrowsable(EditorBrowsableState.Never)]
    internal static class IsExternalInit { }   // 1) 이름·네임스페이스 정확  2) internal  3) #if로 감쌈
}
#endif
```

> **⚠️ 폴리필 타입을 `public`으로 노출하면 소비자를 오염시킨다**
>
> 라이브러리가 `public static class IsExternalInit`을 내보내면, 그 라이브러리를 참조하는 `net8.0` 프로젝트에서 BCL의 것과 충돌해 모호성 오류(CS0433)가 난다. 폴리필은 **항상 `internal`** 이고, 필요하면 `[InternalsVisibleTo]`로 테스트에만 연다(4.5절, 76.14절).

> **📌 `PolySharp`는 등급 C 표를 자동화한다**
>
> `PolySharp`는 소스 생성기로 동작하는 폴리필 패키지다. TFM을 보고 **없는 컴파일러 지원 타입만 골라 `internal`로 생성**한다. 런타임 의존성이 없고 타입 충돌도 나지 않는다. 다만 **등급 D는 폴리필할 수 없다는 사실은 변하지 않는다** — `PolySharp`를 넣어도 `net472`에서 기본 인터페이스 멤버는 못 쓴다.

### H.2·H.4 표의 기호

| 기호 | 뜻 |
|---|---|
| **A** | 등급 A — 순수 컴파일러. 어떤 런타임에서도 동작 |
| **B** | 등급 B — 특성 필요하나 컴파일러가 생성. 사용자 작업 없음 |
| **C** | 등급 C — 타입 필요. 폴리필하거나 NuGet 패키지 필요 |
| **D** | 등급 D — **런타임 변경 필요. 폴리필 불가** |
| `—` | 본문에서 별도 절로 다루지 않음(해당 버전 절에만 언급) |
| ※ | 원천 도서(2022~2024년 기준) 밖의 저자 보강 범위 |

---

## H.2 버전별 기능 표

이 부록의 핵심이다. 버전마다 **기능 / 한 줄 설명 / 본문 참조 절 / 런타임 요구**를 정리했다. "요구" 열의 A·B·C·D는 H.1절의 네 등급이다.

각 버전 표의 근거는 76.1~76.12절이며, 그 절들이 밝히지 않은 기능은 여기에도 넣지 않았다.

### C# 1.0 (2002) — .NET Framework 1.0

기준선이다. 이후 모든 버전은 이 위에 얹힌 것이다. 이 버전에는 클래스·인터페이스·구조체·열거형·델리게이트, 자동 메모리 관리, 예외 처리, 그리고 특성(attribute) 기반 프로그래밍이 있었다(2.2절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 클래스와 캡슐화 | 참조 타입, 접근 제한자, 생성자 | 13장, 17장 | A |
| 상속과 다형성 | 단일 상속 + `virtual`/`override` | 14장 | A |
| 인터페이스 | 구현 없는 계약. 다중 구현 가능 | 18.1~18.3절 | A |
| 구조체(값 타입) | 인라인 저장, 값 복사 의미론 | 16.1절, 16.2절 | A |
| 열거형과 특성 | 이름 붙은 상수 / 메타데이터 주석 | 20.1절, 20.6절 | A |
| 델리게이트와 이벤트 | 타입 안전한 함수 참조, 멀티캐스트 | 26.1절, 27장 | A |
| 프로퍼티와 인덱서 | 필드처럼 보이는 접근자 쌍 | 79.9절 | A |
| 연산자 오버로딩 | `op_Addition` 등 정적 메서드로 컴파일 | 22.1절, 22.6절 | A |
| 예외 처리 | `try`/`catch`/`finally`, 2단계 처리 | 32.1절, 32.6절 | A |
| `foreach`와 열거자 패턴 | 덕 타이핑 기반. 인터페이스 구현 불필요 | 24.1절, 28.1절 | A |
| 자동 메모리 관리(GC) | 추적 GC. 결정적 해제는 `IDisposable`로 | 2.1절, 33.1절 | A |
| `unsafe`와 포인터 | 관리 코드 안의 포인터 산술 | 60.7절 | A |

### C# 2.0 (2005) — .NET Framework 2.0

**언어와 런타임이 함께 바뀐 마지막 대규모 릴리스**에 가깝다. C# 역사에서 언어 기능 하나 때문에 런타임을 갈아엎은 일은 이때가 사실상 유일하다(2.2절, 76.1절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 제네릭 | 실체화된(reified) 타입 매개변수. 박싱·캐스트 제거 | 23장, 54.1절, 55장, 57.4절 | **D**(CLR 2.0) |
| 널 가능 값 타입 `T?` | `Nullable<T>` + 리프트된 연산자. 박싱 시 사라진다 | 21.1~21.4절, 54.6절 | **D** |
| 반복자 `yield return` | 컴파일러가 상태 기계 클래스를 생성. 지연 실행 | 28.3절, 28.4절, 56.6절, 63.9절 | A |
| 익명 메서드 `delegate { }` | 인라인 델리게이트 + 클로저(디스플레이 클래스) | 26.8절, 26.10절, 63.9절 | A |
| 메서드 그룹 변환 | `+= HandleClick` — `new EventHandler(...)` 생략 | 26.3절, 56.6절 | A |
| 부분 타입 `partial class` | 한 타입을 여러 파일에. 오늘날 주 용도는 소스 생성기 | 57.15절 | A |
| 정적 클래스 `static class` | 인스턴스화·상속 불가를 컴파일러가 강제 | 13장 | A |
| getter/setter 개별 접근성 | `public int X { get; private set; }` | 79.9절 | A |
| 네임스페이스 별칭 한정자 `::` | `global::System.Console` — 이름 충돌 해소 | 12장 | A |
| `extern alias` | 같은 이름의 타입을 가진 두 어셈블리 동시 참조 | 12장, 52장 | A |
| `#pragma warning` | 경고 억제를 지역화 | 12장 | A |
| 고정 크기 버퍼 `fixed` | `unsafe` 구조체 안의 인라인 배열. 원시 타입만 | 60.8절 | A(`unsafe`) |
| `[InternalsVisibleTo]` | `internal` 멤버를 테스트 어셈블리에 노출 | 52장 | C(특성) |

> **⚠️ 리프트된 관계 연산자는 삼분법을 깨뜨린다**
>
> `count < five`가 `false`이고 `count >= five`도 `false`가 될 수 있다. 두 표현식이 동시에 거짓이다. `!(a < b)`를 `a >= b`로 바꾸는 리팩터링은 널 가능 값 타입 앞에서 **조용히 의미를 바꾼다.** C# 2 시절부터 지금까지 살아 있는 함정이다(21.4절, 76.1절).

### C# 3.0 (2007) — .NET Framework 3.5

**런타임은 그대로였다.** C# 3의 모든 기능은 컴파일러 안에서 끝나거나 새 라이브러리 타입만 추가하면 되는 것들이었고, 이 원칙은 C# 8의 기본 인터페이스 멤버가 깨뜨릴 때까지 12년간 유지됐다(76.2절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 자동 구현 프로퍼티 | `{ get; set; }` — `<Name>k__BackingField` 생성 | 56.6절, 79.9절 | A |
| 암시적 타입 `var` | **정적 타입**이다. IL에 흔적이 없다 | 79.1절 | A |
| 암시적 타입 배열 | `new[] { 1, 2, 3 }` | 9장 | A |
| 객체 초기화자 | 여러 문장을 **하나의 식**으로 | 79.5절 | A |
| 컬렉션 초기화자 | `new List<int> { 1, 2, 3 }` — `Add` 패턴 기반 | 28.2절 | A |
| 익명 타입 | 이름 없는 불변 타입. 메서드 밖으로 못 나간다 | 79.10절, 63.9절 | A |
| 람다 식(델리게이트) | `x => x * x` — 메서드로 컴파일 | 26.8절, 63.9절 | A |
| 람다 식(식 트리) | 같은 문법이 **코드를 표현한 데이터**가 된다 | 31.1절, 31.2절, 57.13절 | C(`System.Linq.Expressions`) |
| 확장 메서드 | 정적 호출을 인스턴스 문법으로. null에서도 호출된다 | 20.5절 | C(`ExtensionAttribute`) |
| 쿼리 식 | `from ... where ... select` — 순전히 구문적 변환 | 29.3절, 29.4절 | A(패턴 기반) |
| 부분 메서드 | 선언만 있고 구현이 없으면 호출이 지워진다 | 57.15절, 78.11절 | A |

> **⚠️ 확장 메서드는 null 인스턴스에서도 호출된다**
>
> 정적 호출이므로 호출 자체는 성공하고, 메서드 **안에서** 터진다. 스택 트레이스가 예상과 다른 위치를 가리키는 원인이 된다. 반대로 `s.IsNullOrEmpty()` 같은 관용구는 이 성질에 의존한다(76.2절).

### C# 4.0 (2010) — .NET Framework 4

상호운용을 위한 릴리스다. 기능 목록이 짧고 상당수가 COM을 겨냥한다(76.3절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `dynamic` | 정적 바인딩을 실행 시점으로 미루는 **정적 타입**. IL에서는 `object` | 59장 전체, 59.3절, 59.5절 | C(DLR — 라이브러리) |
| 선택적 매개변수 | 기본값이 **호출 지점에 박힌다** | 78.4절 | A |
| 명명된 인수 | `Log("오류", category: "Startup")` | 78.4절 | A |
| 제네릭 가변성 `in`/`out` | 공변·반공변을 타입 시스템 안에서 표현 | 23.10절 | C(BCL 선언 변경. 런타임 지원은 이미 존재) |
| PIA 링크(임베드된 상호 운용 형식) | `<EmbedInteropTypes>` — 필요한 타입만 복사 | 60.12절 | **D** |
| COM 선택적 매개변수 특례 | `ref` 매개변수를 값으로 전달. `Type.Missing` 소멸 | 60.12절 | A(COM 전용) |
| 명명된 인덱서 | COM 인터페이스의 인덱서 프로퍼티 접근 | 60.12절 | A(COM 전용) |

> **⚠️ 선택적 매개변수의 기본값은 호출 지점에 박힌다**
>
> 라이브러리가 v2에서 기본값을 바꿔도 **호출자를 다시 컴파일하기 전까지는 옛 값이 전달된다.** 어셈블리를 교체만 하는 배포 시나리오에서 조용히 어긋난다. 78.13절의 바이너리 호환성 목록에 이 항목이 있다.

### C# 5.0 (2012) — .NET Framework 4.5

기능이 셋뿐이다. 그중 하나가 언어의 무게 중심을 통째로 옮겼다(76.4절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `async` / `await` | 컴파일러가 상태 기계 구조체를 생성. 미완료 `await`에서 박싱 | 47장 전체, 47.7절, 47.8절, 56.6절, 63.9절 | C(`Task`, `AsyncTaskMethodBuilder`) |
| `[CallerMemberName]` 등 호출자 정보 특성 | 컴파일 타임 상수로 채워진다. 스택 워킹 아님 | 20.11절 | C(특성 — 직접 선언 가능) |
| `foreach` 반복 변수 캡처 변경 | 기능 추가가 아니라 **동작 변경**. `for`는 여전히 옛 동작 | 26.10절, 63.9절 | A |

> **⚠️ `foreach`와 `for`가 다르게 동작한다**
>
> C# 5부터 `foreach`의 반복 변수는 반복마다 새로 만들어진 것으로 취급된다. 그러나 **`for` 루프의 변수는 여전히 하나만 존재한다.** `for`에서는 루프 안에 지역 변수를 하나 더 두어 복사해야 한다(76.4절).

### C# 6.0 (2015) — .NET Framework 4.6

**Roslyn으로 다시 쓴 컴파일러의 첫 릴리스**다. 파괴적 변경이 사실상 없어서 옛 코드베이스에 켜는 것이 거의 무위험이다(76.5절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 읽기 전용 자동 프로퍼티 | `{ get; }` — 백킹 필드에 `initonly` | 79.9절 | A |
| 자동 프로퍼티 초기화자 | `public string Unit { get; } = "m";` | 79.5절 | A |
| 식 본문 멤버 | 메서드·읽기 전용 프로퍼티·인덱서·연산자에 `=>` | 56.6절 | A |
| 보간 문자열 `$"..."` | 대입 대상 타입에 따라 컴파일 결과가 달라진다 | 35.7절, 79.4절 | A |
| `nameof` | 컴파일 타임 상수. **마지막 조각만** 준다 | 21.10절 | A |
| null 조건 연산자 `?.` / `?[]` | 왼쪽을 **한 번만** 평가. 이벤트 발생의 표준 관용구 | 27장 | A |
| 예외 필터 `when` | IL의 `filter` 블록. **스택을 풀지 않고** 평가된다 | 32.7절, 32.8절, 74장 | A |
| `using static` | `using static System.Math;` | 12장 | A |
| 인덱서 초기화자 | `new Dictionary<string,int> { ["one"] = 1 }` | 28.2절 | A |
| 확장 `Add` 메서드 컬렉션 초기화자 | 컬렉션 초기화자가 확장 메서드도 인식 | 28.2절 | A |
| `catch` / `finally` 안의 `await` | C# 5의 금지가 컴파일러 개선으로 풀렸다 | 47.10절, 56.6절 | A |

> **⚠️ 보간 문자열은 기본적으로 현재 문화권을 쓴다**
>
> 로그·파일 이름·직렬화 페이로드처럼 **기계가 읽을 문자열**에 쓰면 로케일에 따라 소수점이 바뀌어 파싱이 깨진다. `FormattableString.Invariant($"...")`나 `CultureInfo.InvariantCulture` 명시가 필요하다(38.11절, 79.4절).

### C# 7.0 (2017) — 튜플, 패턴, `ref`

C# 1 이후 처음으로 부 버전을 쓴 릴리스다. 7.0·7.1·7.2·7.3이 약 반년 간격으로 나왔고, **⑤번 성능 축을 정식으로 열었다**(76.6절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 튜플 리터럴·튜플 타입 | `System.ValueTuple` — **구조체**. 이름은 메타데이터에만 | 77.1~77.3절 | C(`System.ValueTuple`) |
| 분해(`Deconstruct`) | 인터페이스가 아니라 **패턴 기반**. 확장 메서드도 가능 | 77.6절 | C(7.2 이전 컴파일러는 `ValueTuple` 필요) |
| 패턴 매칭(상수/타입/`var`) | `is Circle c`, `case Circle c when ...` | 77.7절, 79.3절 | A |
| `ref` 지역 변수 / `ref` 반환 | 복사가 아니라 **별칭**. IL에서는 관리 포인터 | 68.12절 | A |
| 지역 함수 | 캡처가 없으면 `private static`로 낮춰진다 | 26.12절, 63.9절 | A |
| `out` 변수 | `if (int.TryParse(s, out int v))` | 79.3절 | A |
| 버림(discard) `_` | `out _`, `var (_, max) = ...` | 77.6절 | A |
| `throw` 식 | `value ?? throw new ArgumentNullException(...)` | 32.5절 | A |
| 숫자 리터럴 개선 | `0b1010_0101`, `1_000_000` | 7장 | A |
| 식 본문 멤버 확장 | 생성자·종료자·프로퍼티 접근자로 확대 | 56.6절 | A |
| 커스텀 태스크 타입 반환 | `ValueTask<T>` 등을 `async` 반환 타입으로 | 47.13절, 69.2절 | C(`AsyncMethodBuilderAttribute`) |

> **📌 부 버전이라는 리듬은 C# 7에서 정착했다**
>
> C# 7.1의 기능을 쓰려면 `<LangVersion>7.1</LangVersion>`을 명시해야 했고, 이때부터 "언어 버전은 프로젝트 설정"이라는 인식이 개발자에게 생겼다. 컴파일러가 NuGet 패키지로 배포되고 SDK가 자주 갱신되면서 "3년에 한 번 큰 릴리스"에서 "자주, 조금씩"으로 리듬이 바뀐 것도 이 시점이다. H.1절의 표가 필요해진 출발점이 여기다(76.6절).

### C# 7.1 (2017)

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 추론된 튜플 요소 이름 | `var t = (name, age);` → `(string name, int age)` | 77.1절 | C(`ValueTuple`) |
| `default` 리터럴 | `int x = default;`, `M(CancellationToken ct = default)` | 23.5절 | A |
| `async Task Main` | 진입점이 비동기가 될 수 있다 | 47.5절 | C(`Task`) |

### C# 7.2 (2017) — 저할당 문법의 기반

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `in` 매개변수 | 읽기 전용 참조 전달. `readonly struct`와 함께만 쓸 것 | 69.1절 | B(`IsReadOnlyAttribute`) |
| `readonly struct` | "이 구조체는 불변" — 방어적 복사 제거 | 16.5절, 69.1절 | B |
| `ref readonly` 반환 | 읽기 전용 관리 포인터 반환 | 68.12절 | C(`InAttribute` — .NET 1.1부터 존재) |
| `ref struct` | 절대 힙에 올라가지 않음을 컴파일러가 강제 | 16.6절, 68.1절 | B(`IsByRefLikeAttribute`) |
| `stackalloc`을 `Span<T>`에 대입 | `Span<int> s = stackalloc int[16];` | 68.9절 | C(`Span<T>`) |
| `private protected` | "같은 어셈블리의 파생 클래스만" | 17장 | A |
| 후행이 아닌 명명된 인수 | `DrawRect(x: 0, 0, width: 100, 50)` | 78.4절 | A |
| 밑줄 위치 완화 | `0x_FF_FF` — 접두사 바로 뒤에도 허용 | 7장 | A |

> **⚠️ `readonly`가 아닌 구조체에 `in`을 쓰면 오히려 느려진다**
>
> 컴파일러는 `in` 매개변수의 멤버 호출 시, 그 구조체가 `readonly`가 아니면 **방어적 복사**를 만든다. 복사를 피하려고 `in`을 썼는데 멤버 접근마다 복사가 생긴다. 규칙은 하나 — **`in`은 `readonly struct`와 함께만 쓴다**(69.1절).

### C# 7.3 (2018) — 마무리 작업

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `ref` 지역 변수 재대입 | `ref x = ref y;` — 별칭을 바꿀 수 있다 | 68.12절 | A |
| `stackalloc` 초기화자 | `stackalloc int[] { 1, 2, 3 }` | 68.9절 | A |
| 패턴 기반 `fixed` | `GetPinnableReference()`를 가진 타입이면 `fixed`에 쓸 수 있다 | 60.8절 | A |
| `fixed` 없이 고정 크기 버퍼 접근 | `unsafe` 코드의 고정 버퍼 필드에 직접 인덱싱 | 60.8절 | A(`unsafe`) |
| 제네릭 제약 `unmanaged` / `Enum` / `Delegate` | blittable 제약. `Span<T>` 계열 API의 기반 | 23.6절, 68장, 71장 | C(`UnmanagedType` — .NET 1.1부터) |
| 튜플의 `==` / `!=` | 요소별 비교 | 77.3절 | C(`ValueTuple`) |
| 자동 프로퍼티 백킹 필드에 특성 | `[field: NonSerialized]` | 20.8절 | A |
| 초기화자에서 패턴·`out` 변수 | 필드/프로퍼티/생성자 초기화자에서도 허용 | 79.5절 | A |

### C# 8.0 (2019) — .NET Core 3.0

여기서 중요한 선이 그어진다. **C# 8은 .NET Framework에서 온전히 쓸 수 없다**(76.7절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 널 가능 참조 타입(NRT) | 참조 타입의 기본이 널 불가능으로. **런타임에는 아무것도 하지 않는다** | 21.6~21.9절 | B(특성은 컴파일러 생성. 어노테이션된 BCL은 .NET 5+) |
| `!` (null 용인 연산자) | IL에 아무 코드도 생성하지 않는다. 컴파일러 침묵용 | 21.8절 | A |
| `switch` 식 | 피연산자 뒤에 `switch`. 완전성 검사를 받는다 | 77.12절, 77.14절 | A(`SwitchExpressionException`은 .NET Core 3.0+) |
| 속성 패턴 / 위치 패턴(재귀 패턴) | `c is { Address: { City: "London" } }`, `p is (0, 0)` | 77.9절, 77.10절 | A |
| 인덱스 `^` / 범위 `..` | `data[^1]`, `data[2..5]`. 패턴 기반으로 동작 | 68.4절 | C(`System.Index`, `System.Range`) |
| 기본 인터페이스 멤버(DIM) | 인터페이스에 메서드 본문. **인터페이스로 캐스팅해야 호출된다** | 18.7절, 78.13절 | **D**(.NET Core 3.0 / netstandard2.1) |
| 비동기 스트림 `IAsyncEnumerable<T>` | 반복자와 async가 합쳐졌다. `await foreach` | 28.9절, 47.11절, 63.9절 | C(`Microsoft.Bcl.AsyncInterfaces`) |
| `await using` / `IAsyncDisposable` | 비동기 정리 | 33.6절 | C(위와 동일) |
| `using` 선언 | `using var x = ...;` — 중첩 깊이 감소 | 33.5절, 56.6절 | A |
| null 병합 대입 `??=` | `list ??= new List<int>();` | 21.10절 | A |
| 정적 지역 함수 | 캡처를 금지해 실수를 막는다 | 26.12절, 63.9절 | A |
| 구조체 멤버의 `readonly` 한정자 | 멤버 단위로 방어적 복사 억제 | 16.5절, 69.1절 | B(`IsReadOnlyAttribute`) |
| 중첩 식에서의 `stackalloc` | `IndexOfAny(stackalloc char[] { 'l', 'o' })` | 68.9절 | C(`Span<T>`) |
| 비관리 생성 타입 | 제네릭 구조체도 `unmanaged` 제약을 만족할 수 있다 | 23.6절 | A |
| `ref struct`의 패턴 기반 `Dispose` | `ref struct`는 `IDisposable`을 못 구현하므로 패턴으로 | 68.1절 | B(`ref struct` 자체가 B) |

> **⚠️ NRT는 런타임에 아무것도 하지 않는다**
>
> CLR에는 널 가능 참조 타입이라는 개념이 없다. `string`과 `string?`은 **같은 CLR 타입**이고, 널 가능성은 특성으로 메타데이터에만 기록된다. 컴파일러가 내는 것은 **경고**이지 오류가 아니다. 따라서 **공개 API의 인수 검증을 `#nullable enable`로 대체할 수 없다**(21.6절).

### C# 9.0 (2020) ※ — .NET 5

이 절부터는 저자 보강 범위다(76.8절의 안내 참조).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `init` 접근자 | 객체 초기화 단계에서만 호출 가능한 setter. `modreq`로 표시 | 19.2절 | **C**(`IsExternalInit` — 컴파일러가 생성하지 않는다) |
| 레코드(`record`) | 값 동등성·`ToString`·`Deconstruct`·복사 생성자를 자동 생성 | 19.1~19.4절, 77.5절 | **C**(위와 동일) |
| `with` 식 | 복사 생성자 + `init` setter로 비파괴적 변경 | 19.4절 | C |
| 최상위 문 | `<Main>$` 진입점 생성. 프로젝트당 한 파일 | 3장 | A |
| 관계 패턴 | `< 0`, `>= 25` 를 패턴 자리에 | 77.8절 | A |
| 논리 패턴 `and` / `or` / `not` | `is >= 'a' and <= 'z'`, `is not null` | 77.8절 | A |
| 타입 패턴(지정자 없이) | `o is Circle or Rectangle` | 77.7절 | A |
| 대상 타입 지정 `new` | `Dictionary<string, List<DateTime>> map = new();` | 79.7절 | A |
| 대상 타입 지정 조건식 | `int? x = flag ? 1 : null;` | 21.2절 | A |
| 정적 람다 `static x => ...` | 의도치 않은 캡처가 컴파일 오류가 된다 | 26.11절, 63.9절 | A |
| 람다 버림 매개변수 | `(_, _) => ...` | 26.9절 | A |
| 네이티브 크기 정수 `nint` / `nuint` | 플랫폼 포인터 폭 정수 | 60.7절 | A |
| 함수 포인터 `delegate*` | IL의 `calli`. 델리게이트 할당과 가상 호출이 사라진다 | 60.11절 | A / **D**(`[UnmanagedCallersOnly]`는 .NET 5+) |
| 모듈 초기화자 | 어셈블리 첫 사용 시 한 번 실행 | 57.15절 | C(`ModuleInitializerAttribute`) |
| `[SkipLocalsInit]` | 지역 변수 0 초기화 생략 | 69.8절 | C(`SkipLocalsInitAttribute`) |
| 공변 반환 타입 | 오버라이드의 반환 타입을 좁힐 수 있다 | 54.1절 | **D**(.NET 5+. 폴리필 불가) |
| 확장 `GetEnumerator`로 `foreach` | 타입을 고치지 않고 열거 가능하게 만든다 | 28.1절 | A |
| 지역 함수에 특성 | `[Conditional("DEBUG")] static void Trace(...)` | 20.10절 | A |
| 확장된 부분 메서드 | 반환 타입·접근 한정자·`out` 허용. 소스 생성기용 | 57.15절, 78.11절 | A |

> **⚠️ 레코드는 얕은 불변이고, 동등성은 정확한 런타임 타입까지 본다**
>
> `with`는 얕은 복사이므로 가변 컬렉션 멤버는 공유된다. 그리고 `EqualityContract` 때문에 `Person`과 `Employee`는 프로퍼티가 같아도 같지 않다. **가변 컬렉션을 레코드 멤버로 두면 값 의미론이 거짓말이 된다**(19.7절, 19.8절).

### C# 10 (2021) ※ — .NET 6

C# 9가 큰 기능을 던졌다면 C# 10은 그 빈 구석을 메운 릴리스다(76.9절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `record struct` | 값 타입 레코드. **위치 프로퍼티가 기본 가변** | 19.2절, 77.5절 | C(`readonly` 버전은 `IsExternalInit`) |
| `readonly record struct` | 거의 항상 이쪽을 써야 한다 | 19.2절 | C |
| 구조체의 매개변수 없는 생성자 | `default(T)`·배열·`Nullable<T>`는 이 생성자를 부르지 않는다 | 16.3절, 54.4절 | A |
| 구조체 필드 초기화자 | 위와 같은 주의 사항 | 16.3절 | A |
| 보간 문자열 핸들러 | `handlerIsValid`가 `false`면 보간 홀 평가를 통째로 건너뛴다 | 35.7절, 69.5절 | C(특성) / `DefaultInterpolatedStringHandler`는 .NET 6+ |
| `global using` | 파일마다 반복되는 `using`을 한곳으로 | 12장 | A |
| 암시적 `using` | SDK가 프로젝트 종류별 `global using` 집합을 넣는다 | 4.6절 | A(SDK 기능) |
| 파일 범위 네임스페이스 | `namespace X;` — 들여쓰기 한 단계 제거 | 12장 | A |
| 확장 프로퍼티 패턴 | `{ Address.City: "London" }` — 중첩을 점으로 | 77.9절 | A |
| 상수 보간 문자열 | 모든 홀이 `const string`이면 `const`로 가능 | 35.7절 | A |
| 람다 개선(자연 타입·반환 타입·특성) | `var parse = (string s) => int.Parse(s);` | 26.9절, 63.9절 | A |
| 분해에서 선언과 대입 혼용 | `(x, int y) = (1, 2);` | 77.6절 | C(`ValueTuple`) |
| `record`의 `ToString`을 `sealed`로 | 파생 레코드가 재정의하지 못하게 | 19.3절 | A |
| 메서드 단위 `[AsyncMethodBuilder]` | 풀링 빌더로 상태 기계 할당 재사용 | 47.13절, 69.2절 | C(프레임워크 지원) |
| `[CallerArgumentExpression]` | 인수 식을 문자열로. `ThrowIfNull`의 구현 기반 | 20.11절, 21.10절 | C(특성 — 직접 선언 가능) |

> **⚠️ 같은 소스가 TFM에 따라 다른 IL이 된다**
>
> C# 10 이후 `$"{a}{b}"`는 `DefaultInterpolatedStringHandler`가 있는 런타임에서만 그것을 쓰고, 없으면 예전처럼 `string.Format`이다. `net6.0`과 `netstandard2.0`을 멀티 타깃하면 똑같은 한 줄이 두 개의 다른 코드로 컴파일된다. 이 차이를 모르면 벤치마크를 잘못 해석한다(67장, 76.9절).

### C# 11 (2022) ※ — .NET 7

**C# 3 이후 가장 근본적인 타입 시스템 확장**이 들어 있다(76.10절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 정적 추상·가상 인터페이스 멤버 | `static abstract` 연산자·프로퍼티. `T.Zero` 문법 | 18.8절, 22.7절, 57.9절 | **D**(.NET 7+. 폴리필 불가) |
| 제네릭 수학 `INumber<T>` 등 | 위 기능 위에 세워진 BCL 계층 | 22.8절, 71장 | **D**(.NET 7+ BCL) |
| `required` 멤버 | 객체 초기화자를 유지하면서 필수를 표현. **런타임 강제 아님** | 19.5절 | C(`RequiredMemberAttribute` 등) |
| `ref` 필드 / `scoped` | `Span<T>`가 평범한 C#으로 표현 가능해졌다 | 68.11절, 68.2절 | **D**(.NET 7+) |
| 원시 문자열 리터럴 `"""` | 닫는 따옴표의 들여쓰기가 기준. 이스케이프 없음 | 35.3절 | A |
| 목록 패턴 `[1, 2, ..]` | 배열·리스트를 패턴으로 | 77.11절 | A |
| 슬라이스 패턴 `..` | 변수 바인딩에는 `Slice(int, int)` 필요 | 77.11절 | A |
| UTF-8 문자열 리터럴 `"..."u8` | 타입은 `ReadOnlySpan<byte>`. `byte[]`가 아니다 | 69.7절 | C(`ReadOnlySpan<byte>`) |
| 제네릭 특성 | `[TypeConverter<PointConverter>]` | 57.11절 | **D**(.NET 7+) |
| 파일 로컬 타입 `file` | 소스 생성기의 이름 충돌 방지용 | 57.15절 | A |
| 자동 기본값 구조체 | 생성자가 모든 필드를 채우지 않아도 된다(CS0171 완화) | 16.3절 | A |
| 보간 홀 안에서 줄바꿈 | 긴 LINQ 체인을 보간 홀에 넣을 수 있다 | 35.7절 | A |
| 확장된 `nameof` 범위 | 특성에서 매개변수 이름 참조 | 21.9절 | A |
| 부호 없는 오른쪽 시프트 `>>>` | 부호 확장 없는 시프트 | 7장 | A |
| 상수 문자열에 대한 `Span<char>` 패턴 매칭 | `s is "GET"` (여기서 `s`는 `ReadOnlySpan<char>`) | 68.5절 | C(`Span<T>`) |
| 메서드 그룹 변환 캐싱 | 컴파일러가 델리게이트를 캐시. 숨은 할당 하나 소멸 | 26.3절, 63.9절 | A(컴파일러 최적화) |
| ~~매개변수 null 검사 `!!`~~ | **프리뷰에만 존재. 정식 릴리스 전에 제거됐다** | 21.10절 | 해당 없음 |

> **⚠️ `!!` 문법을 소개하는 글이 인터넷에 그대로 남아 있다**
>
> `void M(string s!!)` 는 C# 11 프리뷰 기능이었고 커뮤니티 반발 후 제거됐다. 지금 따라 하면 컴파일되지 않는다. 대체 수단은 `ArgumentNullException.ThrowIfNull(s)`(.NET 6+)다(21.10절, 76.10절).

### C# 12 (2023) ※ — .NET 8

문법의 일관성을 정리한 릴리스다(76.11절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| 기본 생성자(클래스·구조체) | 캡처된 매개변수만 private 필드가 된다. **매개변수는 가변** | 19.6절 | A |
| 컬렉션 식 `[1, 2, 3]` | 대상 타입에 따라 다른 코드를 만든다 | 24.14절, 28.2절, 69장 | A / 대상 타입에 따라 C |
| 스프레드 연산자 `..head` | `int[] all = [..head, 3, 4, ..tail];` | 24.14절 | A |
| 인라인 배열 `[InlineArray(N)]` | C# 2의 고정 크기 버퍼를 안전한 코드·임의 타입으로 | 68.10절 | **D**(.NET 8+. 폴리필 불가) |
| 모든 타입에 대한 별칭 | 튜플·배열·포인터·함수 포인터도 `using` 별칭 가능 | 77.4절 | A |
| 람다 기본 매개변수 | `(int x, int by = 1) => x + by` | 26.9절 | A |
| `ref readonly` 매개변수 | `in`과 달리 호출 지점에 `in`/`ref` 명시를 요구한다 | 68.12절 | B(`RequiresLocationAttribute`) |
| `[Experimental]` | 사용하면 컴파일 오류. `#pragma`로 명시적 동의 | 20.6절 | C(특성 — 직접 선언 가능) |
| 인터셉터 | 특정 호출 지점을 다른 메서드로 바꿔치기. **프리뷰** | 57.15절 | 프리뷰(명시적 옵트인) |

> **📌 `ReadOnlySpan<int> d = [1, 2, 3];` 은 할당이 0이다**
>
> 컬렉션 식은 `ReadOnlySpan<T>` 대상에서 어셈블리의 읽기 전용 데이터 블롭을 직접 가리키는 스팬을 만들고, `Span<T>` 대상이면 `stackalloc`으로 낮춘다. 단순한 문법 설탕이 아니다(69장, 76.11절).

### C# 13 (2024) ※ — .NET 9

성능 축의 잔여 제약을 걷어낸 릴리스다(76.12절).

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `params` 컬렉션 | `params ReadOnlySpan<int>` — 가변 인수의 배열 할당 소멸 | 63.9절, 78.9절 | C(스팬 대상은 `Span<T>` 필요) |
| `[OverloadResolutionPriority]` | 오버로드 추가 시 호출 대상이 조용히 바뀌는 것을 통제 | 78.3절 | C(특성) |
| `System.Threading.Lock` | `lock` 문이 `EnterScope()`를 쓰는 코드로 컴파일된다 | 48.15절, 54.2절 | **D**(.NET 9+ BCL) |
| `ref struct`의 인터페이스 구현 | 구현은 되지만 **여전히 박싱 불가** | 68.1절 | **D**(.NET 9+) |
| `allows ref struct` | 제약이 아니라 **반제약**. T로 할 수 있는 일이 줄어든다 | 68.1절 | **D**(.NET 9+) |
| 반복자·async 안의 `ref` 지역·`unsafe` | `await`/`yield` 경계를 넘지 않는 한 허용 | 47.10절, 56.6절 | A |
| 부분 프로퍼티·부분 인덱서 | 소스 생성기용 | 57.15절 | A |
| `\e` 이스케이프 | ESC 문자(U+001B)의 명시적 형태 | 35.3절 | A |
| 객체 초기화자에서 암시적 인덱서 접근 | `new Buffer { [^1] = 42 }` | 28.2절 | A |
| 메서드 그룹 자연 타입 개선 | 후보를 더 일찍 걸러 모호성이 줄었다 | 26.3절 | A |
| `field` 키워드 | **C# 13에서는 프리뷰.** C# 14에서 정식 | 79.9절 | 프리뷰 |

> **⚠️ `Lock`을 `object`로 캐스팅하면 조용히 다른 잠금이 된다**
>
> `object`로 변환되면 `Monitor` 경로로 돌아가므로 `lock (gate)`와 상호 배제되지 않는다. 컴파일러가 경고를 내지만, 무시하면 **두 개의 서로 다른 잠금 메커니즘이 같은 객체에 걸린다**(48.15절, 76.12절).

### C# 14 (2025) ※ — .NET 10

본문(76.12절)이 언급한 범위까지만 싣는다. 각 릴리스는 이 목록 밖에도 새 경고 묶음(warning wave)과 여러 소소한 개선을 담는다.

| 기능 | 한 줄 설명 | 본문 참조 | 요구 |
|---|---|---|---|
| `field` 키워드(정식) | 접근자 본문에서 컴파일러 생성 백킹 필드를 직접 참조 | 79.9절 | A |
| 확장 멤버(`extension` 블록) | 확장 프로퍼티·정적 확장 멤버까지 확대. 기존 `this` 문법과 공존 | 20.5절 | A(컴파일러 생성 특성) |
| null 조건 대입 | `customer?.Address = newAddress;` — 좌변이 null이면 우변도 미평가 | 21.10절 | A |
| 언바운드 제네릭 `nameof` | `nameof(List<>)` → `"List"` | 23.4절 | A |
| 암시적 span 변환 | 배열→`Span`/`ReadOnlySpan` 변환이 언어 수준 변환이 됐다 | 68.13절 | C(`Span<T>`) |
| 람다 매개변수에 한정자만 | `(ref x) => x++` — 타입 생략 | 26.9절 | A |
| 부분 생성자·부분 이벤트 | 소스 생성기용. C# 2 부분 타입 축의 연장 | 57.15절 | A |

> **⚠️ `field`는 문맥 키워드라 기존 코드와 충돌할 수 있다**
>
> `private int field;`가 이미 있는 클래스에서 프로퍼티 접근자 안의 `field`는 C# 14부터 **새 의미**로 해석된다. 컴파일러가 경고를 내지만, 대규모 코드베이스에서 언어 버전을 올릴 때 반드시 확인해야 할 항목이다. 기존 필드를 가리키려면 `this.field`로 쓴다(76.12절).

---

## H.3 .NET 버전별 주요 런타임·BCL 변화표

H.2절이 **문법**의 연표라면 이 절은 **플랫폼**의 연표다. 같은 C# 코드가 런타임 버전에 따라 다르게 컴파일되고 다르게 실행되기 때문에, 이 표 없이는 H.2절의 "요구" 열을 해석할 수 없다.

### 릴리스 연표와 지원 정책

.NET은 매년 11월에 새 메이저 버전을 낸다. 짝수 버전이 LTS(3년), 홀수 버전이 STS(18개월)다(2.3절).

| 버전 | 출시 | 유형 | 기본 C# 버전 |
|---|---|---|---|
| .NET Core 3.1 | 2019-12 | LTS | C# 8 |
| .NET 5 | 2020-11 | STS | C# 9 |
| .NET 6 | 2021-11 | LTS | C# 10 |
| .NET 7 | 2022-11 | STS | C# 11 |
| **.NET 8** | **2023-11** | **LTS** | **C# 12** |
| .NET 9 | 2024-11 | STS | C# 13 |

> **⚠️ 메이저 버전만 맞추면 되는 것이 아니다**
>
> 지원을 받으려면 **패치 릴리스도 따라가야 한다.** .NET 8.0.0을 쓰는 시스템에 8.0.1이 나왔다면 8.0.1을 설치해야 지원 대상이다. 실무에서 "우리는 .NET 8이니까 지원 대상"이라고 믿었다가 보안 감사에서 걸리는 지점이 여기다(2.3절).

### .NET Framework 계열 (2002~2019, 유지보수 전용)

Windows 전용이며, CLR과 BCL이 애플리케이션 계층과 통합되어 머신 전체에 설치된다. **C# 7.3에서 멈춰 있다.**

| 버전 | 무엇이 바뀌었나 | 본문 참조 |
|---|---|---|
| 1.0 (2002) | CLR 1.0. 관리 코드·추적 GC·예외의 2단계 처리·특성 기반 프로그래밍의 원형 | 2.3절, 32.6절 |
| 2.0 (2005) | **CLR 2.0.** 실체화된 제네릭, `Nullable<T>`의 CLR 특별 지원(박싱 시 소멸) | 2.2절, 23.11절, 54.6절 |
| 3.5 (2007) | 런타임은 CLR 2.0 그대로. LINQ·식 트리는 **라이브러리 추가**였다. 읽기 전용 힙 세그먼트 폐기 | 76.2절, 62.5절 |
| 4 (2010) | CLR 4.0. BCL 인터페이스·델리게이트 선언에 `in`/`out` 부착, PIA 임베드 지원 | 23.10절, 60.12절 |
| 4.5 (2012) | `Task` 기반 비동기의 프레임워크 기반. LOH도 힙 밸런싱 대상이 된다 ※.NET Framework 4.5+ | 47장, 63.5절 |
| 4.6 (2015) | `CultureInfo.CurrentUICulture` 쓰기 가능, 문화권이 `async`/`await`를 따라 흐른다 ※.NET Framework 4.6+ | 38.2절 |
| 4.6.1 | `netstandard2.0` 라이브러리를 소비할 수 있는 최소선 | 4.3절 |
| 4.8 (최종) | 이후 기능 추가 없음. 보안·버그 수정만 | 2.3절 |

> **⚠️ .NET Framework 어셈블리는 .NET에서 그대로 돌지 않는다**
>
> .NET Core 1.x부터 .NET 7까지 컴파일한 어셈블리는 대부분 수정 없이 .NET 8에서 실행되지만, **.NET Framework의 어느 버전으로 컴파일한 어셈블리든 .NET 8과는 대체로 호환되지 않는다.** AppDomain, 원격(Remoting), GAC, `BinaryFormatter`, 코드 접근 보안(CAS)은 .NET에 없다(2.3절, 41.7절).

### .NET Core 계열 (2016~2019)

크로스 플랫폼, 병행 설치(애플리케이션 단위 런타임), 오픈 소스라는 세 목표로 **처음부터 다시 쓴 런타임**이다(2.3절).

| 버전 | GC · JIT | BCL · 언어 지원 | 본문 참조 |
|---|---|---|---|
| 1.0 (2016) | 크로스 플랫폼 CoreCLR | `CultureInfo.CurrentUICulture` 쓰기 가능 ※.NET Core 1.0+ | 2.3절, 38.2절 |
| 2.0 (2017) | — | `netstandard2.0` 구현. `Task.IsCompletedSuccessfully`, `Array.Fill`, `ConcurrentQueue.TryDequeue`/`TryPeek` ※.NET Core 2.0 | 46.3절, 24.3절, 24.12절 |
| 2.1 (2018) | **계층형 컴파일 옵트인 도입** | **"fast span"** — byref 인스턴스 필드 런타임 지원으로 `Span<T>`가 런타임 내장(16바이트)이 된다. `System.HashCode`, `Dictionary`/`HashSet`의 `EnsureCapacity`, `Path.Join` ※.NET Core 2.1 | 55.2절, 68.3절, 25장, 24.7절 |
| 3.0 (2019) | **계층형 컴파일 기본값** | C# 8 동반. **기본 인터페이스 멤버 런타임 지원**, `IAsyncEnumerable<T>`·`IAsyncDisposable`, `System.Text.Rune`, `NativeLibrary`, `GC.GetTotalAllocatedBytes`, `ThreadPool.ThreadCount`/`PendingWorkItemCount`, 기본 `ToString()`이 왕복 가능, `Process.Kill(entireProcessTree)`, `HttpClient.DefaultProxy` ※.NET Core 3.0 | 55.2절, 18.7절, 28.9절, 35.2절, 60.1절, 63장, 46.1절, 38.3절 |
| 3.1 (2019-12) | — | LTS. `netcoreapp3.1` — C# 8의 마지막 안착지 | 2.3절 |

### 통합 .NET (2020~)

이름에서 "Core"가 빠졌고, .NET Framework의 기능 자산과 Mono/Xamarin의 플랫폼 자산이 단일 노선으로 모였다.

#### GC의 변화

| 시점 | 무엇이 바뀌었나 | 본문 참조 |
|---|---|---|
| 초기 ~ | SOH / LOH, 세대 0/1/2, **세그먼트**. 읽기 전용 힙 세그먼트 존재 | 62.3절, 62.4절, 62.6절 |
| .NET Framework 3.5 | 읽기 전용 힙 세그먼트 **폐기** | 62.5절 |
| **※.NET 5** | **POH(고정 객체 힙)** 도입. `GC.AllocateArray(..., pinned: true)`. 카드 번들 write watch가 Windows·Linux 동일 구현으로 통일 | 62.5절, 62.7절 |
| **※.NET 7** | 64비트에서 세그먼트 → **리전**. ephemeral 세그먼트 소멸. `PinnedHeapHandleTable`이 LOH → POH로 이동 | 62.5절, 62.6절 |
| **※.NET 8** | 읽기 전용 힙이 **NonGC 힙**으로 정식 명명. NonGC 힙 객체의 `GC.GetGeneration`이 2 → **`int.MaxValue`**. POH 배열의 blittable 검사가 관리 코드에서 제거. **DATAS 옵트인 도입** | 62.5절, 65.7절 |
| **※.NET 9** | **DATAS가 서버 GC에서 기본 활성화** | 65.7절 |

> **⚠️ 32비트에서는 여전히 세그먼트다**
>
> 위 표의 "리전"은 **64비트 전용**이다. 32비트 런타임에서 .NET 8을 쓰더라도 힙은 세그먼트로 구성된다. 리전 기준으로 `!eeheap` 출력을 읽으려 하면 아무것도 맞지 않는다(62.6절).

> **⚠️ DATAS는 처리량을 희생해 메모리를 얻는다**
>
> .NET 9 마이그레이션에서 "아무것도 안 바꿨는데 느려졌다"면 DATAS를 먼저 의심하고 껐다 켜서 비교하라. 처리량이 절대적으로 중요하고 메모리가 충분한 워크로드에서는 손해일 수 있다(65.7절).

#### JIT의 변화

| 시점 | 무엇이 바뀌었나 | 본문 참조 |
|---|---|---|
| .NET Core 2.1 | 계층형 컴파일 **옵트인** | 55.2절 |
| .NET Core 3.0 | 계층형 컴파일 **기본값** | 55.2절 |
| **※.NET 6** | 동적 PGO가 `DOTNET_TieredPGO=1` **옵트인**으로 도입 | 55.5절 |
| **※.NET 7** | **OSR** — 긴 루프가 Tier-0에 갇히는 문제 해결. `DOTNET_TC_QuickJitForLoops` 기본값이 `1`로. 구조체 정적 필드 오버헤드·중첩 구조체 정렬 개선 | 55.3절, 54.4절, 54.5절 |
| **※.NET 8** | 동적 PGO·GDV **기본 활성화**. GDV가 델리게이트 호출과 `Func<>`/`Action<>` 기반 호출까지 확장. 델리게이트 호출도 인라인될 수 있다 | 55.5절, 55.4절 |
| **※.NET 9** | 이스케이프 분석 기반 **객체 스택 할당이 기본 활성화**(.NET 8까지는 `DOTNET_JitObjectStackAllocation=1` 필요). 예외 처리 구현이 **관리 코드로 재작성** | 55.6절, 32.6절 |

#### BCL의 굵직한 추가

| 버전 | 대표 항목 | 본문 참조 |
|---|---|---|
| **※.NET 5** | 공변 반환 타입·`[UnmanagedCallersOnly]` 런타임 지원. `IsExternalInit` BCL 편입. `Convert.ToHexString`/`FromHexString`, `Enum.GetValues<T>`/`GetNames<T>`/`IsDefined<T>`, 정적 `HashData`, `ReferenceEqualityComparer`, `Type.IsAssignableTo`, `Encoding.Latin1`, `Exception.SetCurrentStackTrace`, `GC.AllocateUninitializedArray<T>`, `ArrayPool` 트리밍, ICU 기본화, `StringInfo`가 UAX #29 준수, UTF-7 사용 중단, 자동 크래시 덤프 | 54.1절, 44장, 20.2절, 25장, 65.10절, 35.2절, 35.8절, 74장 |
| **※.NET 6** | `DefaultInterpolatedStringHandler`(보간 문자열 컴파일 결과 변화), `DateOnly`/`TimeOnly`, `PriorityQueue`, `PeriodicTimer`, `Random.Shared`, `ArgumentNullException.ThrowIfNull`, `Task.WaitAsync`, `Parallel.ForEachAsync`, `MinBy`/`MaxBy`/`Chunk`/`TryGetNonEnumeratedCount`, `CollectionsMarshal.GetValueRefOrAddDefault`, `NullabilityInfoContext`, `System.Diagnostics.Metrics`, `NativeMemory.AlignedAlloc`, `PoolingAsyncValueTaskMethodBuilder`, `[StackTraceHidden]` | 35.7절, 37.3절, 24.5절, 46.6절, 21.10절, 46.9절, 50.7절, 30.9절, 24.7절, 57.11절, 75.3절, 60.15절, 69.2절 |
| **※.NET 7** | 정적 추상 인터페이스 멤버·`ref` 필드·제네릭 특성의 **런타임 지원**. `INumber<T>`·`IParsable<T>`·`ISpanParsable<T>`, `Int128`/`UInt128`, `Vector128`/`Vector256` 크로스 플랫폼 API, `[LibraryImport]`, `[GeneratedRegex]`, `RegexOptions.NonBacktracking`, `ObjectDisposedException.ThrowIf`, `Stopwatch.GetElapsedTime`, `Order`/`OrderDescending`, `Stream.ReadExactly`, Tar, `[JsonDerivedType]`, `[DisableRuntimeMarshalling]` | 18.8절, 22.8절, 68.11절, 57.11절, 71.1절, 60.9절, 36.8절, 30.5절, 40.9절, 41.5절 |
| **※.NET 8** | 인라인 배열 **런타임 지원**. `SearchValues<T>`, `FrozenDictionary`/`FrozenSet`, `TimeProvider`, `Vector512<T>`, `[UnsafeAccessor]`, `CompositeFormat`, `IUtf8SpanFormattable`·`Utf8.TryWrite`, `MemoryExtensions.Split`, `System.Text.Ascii`, `NativeMemory.Clear`, `ConfigureAwaitOptions`, `[GeneratedComInterface]`, SHA-3, `MethodInfo.Invoke` 경로 재작성, `<IsAotCompatible>` 분석기 | 68.10절, 69.6절, 24.11절, 37.9절, 71.1절, 57.12절, 38.8절, 69.7절, 44장, 57.12절, 55.7절 |
| **※.NET 9** | `System.Threading.Lock`·`allows ref struct`·`ref struct`의 인터페이스 구현 **런타임 지원**. `SearchValues<string>`, `Task.WhenEach`, `PersistedAssemblyBuilder.Save`, `Guid.CreateVersion7`, 제네릭 `OrderedDictionary<TKey,TValue>`, `GetAlternateLookup<ReadOnlySpan<char>>`, `HybridCache`, `CountBy`/`AggregateBy`, `SpanSplitEnumerator<T>`, `System.Runtime` 미터, `[DebuggerDisableUserUnhandledExceptions]`, `Vector.Create<T>` | 48.15절, 68.1절, 69.6절, 46.9절, 58장, 24.8절, 69.5절, 72.5절, 30.15절, 75.3절, 74장, 71.1절 |

> **💡 버전을 밝히지 않은 런타임 설명은 의심하라**
>
> 인터넷에 있는 .NET 힙 구조 설명의 대다수는 세그먼트 시대에 쓰였다. "ephemeral 세그먼트" 같은 서술을 보면 그 글이 .NET 6 이하를 전제한다고 봐야 한다. 같은 함정이 JIT(계층형 컴파일 이전/이후, 동적 PGO 이전/이후)과 GC 모드(DATAS 이전/이후)에도 있다. **성능 조언을 읽을 때 가장 먼저 물어야 할 것은 "몇 버전 기준인가"다**(62.6절, 55.5절, 65.7절).

> **📌 .NET 10과 그 이후**
>
> 76.13절의 TFM 표는 `net10.0`의 기본 언어 버전이 C# 14임을 밝히지만, 본문은 .NET 10의 런타임·BCL 변화를 다루지 않는다. 그래서 이 절도 .NET 9까지만 싣는다. 이 책의 코드는 **.NET 8 이상**을 전제하며, `※.NET 9`·`※C# 13` 표시가 붙은 것만 그보다 높은 버전을 요구한다(1.7절).

---

## H.4 기능 → 버전 역인덱스

H.2절이 "C# 11에 뭐가 들어왔나"에 답한다면, 이 절은 반대 방향 — **"이 문법은 몇 버전인가"** 에 답한다. 코드 리뷰나 레거시 코드 판독 중에 가장 자주 쓰게 되는 표다.

"요구" 열은 H.1절의 네 등급이다. 대표 항목은 굵게 표시했다.

> **📌 두 표를 나눈 기준**
>
> 첫 표는 **문법 토큰이나 특성 이름으로 기억되는 기능**(`init`, `record`, `[SkipLocalsInit]`)을, 둘째 표는 **한국어 개념 이름으로 기억되는 기능**(목록 패턴, 보간 문자열, 기본 생성자)을 담는다. 같은 기능이 양쪽 이름을 다 가지면 대표 이름 쪽에만 넣고 다른 쪽에서는 뺐다. 못 찾겠으면 반대쪽 표를 보라.

### 기호·영문 순

| 기능 | C# 버전 | 요구 | 본문 참조 |
|---|---|---|---|
| `!` (null 용인 연산자) | 8 | A | 21.8절 |
| ~~`!!` (매개변수 null 검사)~~ | 11 프리뷰 — **취소됨** | — | 21.10절 |
| `#pragma warning` | 2 | A | 12장 |
| `??=` (null 병합 대입) | 8 | A | 21.10절 |
| `?.` / `?[]` (null 조건 연산자) | 6 | A | 27장 |
| `\e` 이스케이프 | 13 | A | 35.3절 |
| `^` 인덱스 / `..` 범위 | 8 | **C** | 68.4절 |
| `>>>` (부호 없는 오른쪽 시프트) | 11 | A | 7장 |
| `::` (네임스페이스 별칭 한정자) | 2 | A | 12장 |
| `allows ref struct` | 13 | **D** | 68.1절 |
| `and` / `or` / `not` 패턴 | 9 | A | 77.8절 |
| **`async` / `await`** | 5 | C | 47장 |
| `async Task Main` | 7.1 | C | 47.5절 |
| `[AsyncMethodBuilder]` (메서드 단위) | 10 | C | 69.2절 |
| `await foreach` | 8 | C | 28.9절 |
| `await using` | 8 | C | 33.6절 |
| `catch` / `finally` 안의 `await` | 6 | A | 47.10절 |
| `[CallerArgumentExpression]` | 10 | C | 20.11절 |
| `[CallerMemberName]` / `[CallerFilePath]` / `[CallerLineNumber]` | 5 | C | 20.11절 |
| `[CollectionBuilder]` | 12 | C | 24.14절 |
| `default` 리터럴 | 7.1 | A | 23.5절 |
| `delegate*` (함수 포인터) | 9 | A(`[UnmanagedCallersOnly]`는 **D**) | 60.11절 |
| **`dynamic`** | 4 | C | 59장 |
| `[Experimental]` | 12 | C | 20.6절 |
| `extension` 블록(확장 멤버) | 14 | A | 20.5절 |
| `extern alias` | 2 | A | 12장 |
| **`field` 키워드** | 13 프리뷰 → **14 정식** | A | 79.9절 |
| `file` 로컬 타입 | 11 | A | 57.15절 |
| `fixed` 고정 크기 버퍼 | 2 | A(`unsafe`) | 60.8절 |
| `fixed` (패턴 기반) | 7.3 | A | 60.8절 |
| `foreach` 반복 변수 캡처 변경 | 5 | A(동작 변경) | 26.10절 |
| `getter`/`setter` 개별 접근성 | 2 | A | 79.9절 |
| `global using` | 10 | A | 12장 |
| `in` 매개변수 | 7.2 | B | 69.1절 |
| `in` / `out` (제네릭 가변성) | 4 | C | 23.10절 |
| **`init` 접근자** | 9 | **C**(`IsExternalInit`) | 19.2절 |
| `[InlineArray]` (인라인 배열) | 12 | **D** | 68.10절 |
| `[InternalsVisibleTo]` | 2 | C | 52장 |
| `is` 패턴 | 7 | A | 77.7절 |
| `[ModuleInitializer]` | 9 | C | 57.15절 |
| `nameof` | 6 | A | 21.10절 |
| `nameof(List<>)` (언바운드 제네릭) | 14 | A | 23.4절 |
| `nint` / `nuint` | 9 | A | 60.7절 |
| `out` 변수 | 7 | A | 79.3절 |
| `[OverloadResolutionPriority]` | 13 | C | 78.3절 |
| `params` 컬렉션 | 13 | C | 63.9절 |
| `partial` 타입 | 2 | A | 57.15절 |
| `partial` 메서드 | 3 | A | 78.11절 |
| `partial` 메서드(확장 — 반환 타입·`out`) | 9 | A | 57.15절 |
| `partial` 프로퍼티·인덱서 | 13 | A | 57.15절 |
| `partial` 생성자·이벤트 | 14 | A | 57.15절 |
| `private protected` | 7.2 | A | 17장 |
| `readonly` (구조체 멤버 한정자) | 8 | B | 16.5절 |
| **`readonly struct`** | 7.2 | B | 16.5절 |
| `readonly record struct` | 10 | C | 19.2절 |
| **`record`** | 9 | **C**(`IsExternalInit`) | 19.1절 |
| **`record struct`** | 10 | C | 19.2절 |
| **`ref` 필드** | 11 | **D**(.NET 7+) | 68.11절 |
| `ref` 지역 변수 / `ref` 반환 | 7 | A | 68.12절 |
| `ref` 지역 변수 재대입 | 7.3 | A | 68.12절 |
| `ref readonly` 매개변수 | 12 | B | 68.12절 |
| `ref readonly` 반환 | 7.2 | C | 68.12절 |
| **`ref struct`** | 7.2 | B | 68.1절 |
| `ref struct`의 인터페이스 구현 | 13 | **D**(.NET 9+) | 68.1절 |
| `required` 멤버 | 11 | C | 19.5절 |
| `scoped` | 11 | **D**(.NET 7+) | 68.11절 |
| `[SkipLocalsInit]` | 9 | C | 69.8절 |
| `Span<char>` 상수 패턴 매칭 | 11 | C | 68.5절 |
| `stackalloc` → `Span<T>` 대입 | 7.2 | C | 68.9절 |
| `stackalloc` 초기화자 | 7.3 | A | 68.9절 |
| `stackalloc` (중첩 식) | 8 | C | 68.9절 |
| `static` 람다 | 9 | A | 26.11절 |
| `static abstract` / `static virtual` 인터페이스 멤버 | 11 | **D**(.NET 7+) | 18.8절 |
| `static class` | 2 | A | 13장 |
| `static` 지역 함수 | 8 | A | 26.12절 |
| **`switch` 식** | 8 | A | 77.12절 |
| `System.Threading.Lock` 인식 | 13 | **D**(.NET 9+) | 48.15절 |
| `throw` 식 | 7 | A | 32.5절 |
| `unmanaged` / `Enum` / `Delegate` 제약 | 7.3 | C | 23.6절 |
| `"..."u8` (UTF-8 리터럴) | 11 | C | 69.7절 |
| `using` 선언 | 8 | A | 33.5절 |
| `using static` | 6 | A | 12장 |
| `using` 별칭(모든 타입) | 12 | A | 77.4절 |
| **`var`** | 3 | A | 79.1절 |
| `with` 식 | 9 | C | 19.4절 |
| **`yield return` / `yield break`** | 2 | A | 28.3절 |

### 한글 가나다 순

| 기능 | C# 버전 | 요구 | 본문 참조 |
|---|---|---|---|
| 객체 초기화자 | 3 | A | 79.5절 |
| 공변 반환 타입 | 9 | **D**(.NET 5+) | 54.1절 |
| 관계 패턴 | 9 | A | 77.8절 |
| 구조체 매개변수 없는 생성자 / 필드 초기화자 | 10 | A | 16.3절 |
| 기본 생성자(클래스·구조체) | 12 | A | 19.6절 |
| **기본 인터페이스 멤버(DIM)** | 8 | **D**(.NET Core 3.0+) | 18.7절 |
| 널 가능 값 타입 `T?` | 2 | **D**(CLR 2.0) | 21.1절 |
| **널 가능 참조 타입(NRT)** | 8 | B | 21.6절 |
| 널 조건 대입 | 14 | A | 21.10절 |
| 논리 패턴 | 9 | A | 77.8절 |
| 대상 타입 지정 `new` | 9 | A | 79.7절 |
| 대상 타입 지정 조건식 | 9 | A | 21.2절 |
| 람다 기본 매개변수 | 12 | A | 26.9절 |
| 람다 매개변수 한정자만(타입 생략) | 14 | A | 26.9절 |
| 람다 버림 매개변수 | 9 | A | 26.9절 |
| **람다 식** | 3 | A | 26.8절 |
| 람다 자연 타입 · 반환 타입 명시 · 특성 | 10 | A | 26.9절 |
| 메서드 그룹 변환 | 2 | A | 26.3절 |
| 메서드 그룹 변환 캐싱 | 11 | A | 63.9절 |
| 메서드 그룹 자연 타입 개선 | 13 | A | 26.3절 |
| 명명된 인수 | 4 | A | 78.4절 |
| 명명된 인수(후행이 아닌) | 7.2 | A | 78.4절 |
| **목록 패턴** | 11 | A | 77.11절 |
| 밑줄 위치 완화(리터럴) | 7.2 | A | 7장 |
| 반복자 · async 안의 `ref` 지역 / `unsafe` | 13 | A | 47.10절 |
| 버림 `_` | 7 | A | 77.6절 |
| **보간 문자열** | 6 | A | 35.7절 |
| 보간 문자열 핸들러 | 10 | C | 69.5절 |
| 보간 홀 안에서 줄바꿈 | 11 | A | 35.7절 |
| 분해(`Deconstruct`) | 7 | C | 77.6절 |
| 분해에서 선언과 대입 혼용 | 10 | C | 77.6절 |
| 비관리 생성 타입 | 8 | A | 23.6절 |
| **비동기 스트림(`IAsyncEnumerable<T>`)** | 8 | C | 28.9절 |
| 상수 보간 문자열 | 10 | A | 35.7절 |
| 선택적 매개변수 | 4 | A | 78.4절 |
| 속성 패턴 | 8 | A | 77.9절 |
| 스프레드 연산자 `..` | 12 | A | 24.14절 |
| 슬라이스 패턴 | 11 | A | 77.11절 |
| 식 본문 멤버 | 6 | A | 56.6절 |
| 식 본문 멤버 확장(생성자·접근자) | 7 | A | 56.6절 |
| 식 트리 | 3 | C | 31.2절 |
| 암시적 span 변환 | 14 | C | 68.13절 |
| 암시적 `using` | 10 | A(SDK) | 4.6절 |
| 암시적 타입 배열 | 3 | A | 9장 |
| 예외 필터 `when` | 6 | A | 32.7절 |
| **원시 문자열 리터럴** | 11 | A | 35.3절 |
| 위치 패턴 | 8 | A | 77.10절 |
| 익명 메서드 `delegate { }` | 2 | A | 26.8절 |
| 익명 타입 | 3 | A | 79.10절 |
| 인덱서 초기화자 | 6 | A | 28.2절 |
| 인덱서 초기화자(암시적 인덱서 접근) | 13 | A | 28.2절 |
| 인터셉터 | 12 | 프리뷰 | 57.15절 |
| 읽기 전용 자동 프로퍼티 `{ get; }` | 6 | A | 79.9절 |
| 자동 구현 프로퍼티 | 3 | A | 79.9절 |
| 자동 기본값 구조체(CS0171 완화) | 11 | A | 16.3절 |
| 자동 프로퍼티 백킹 필드에 특성 | 7.3 | A | 20.8절 |
| 자동 프로퍼티 초기화자 | 6 | A | 79.5절 |
| **제네릭** | 2 | **D**(CLR 2.0) | 23장 |
| 제네릭 가변성 | 4 | C | 23.10절 |
| **제네릭 수학(`INumber<T>` 등)** | 11 | **D**(.NET 7+) | 22.8절 |
| 제네릭 특성 | 11 | **D**(.NET 7+) | 57.11절 |
| 지역 함수 | 7 | A | 26.12절 |
| 지역 함수에 특성 | 9 | A | 20.10절 |
| 초기화자에서 패턴 · `out` 변수 | 7.3 | A | 79.5절 |
| **최상위 문** | 9 | A | 3장 |
| 커스텀 태스크 타입 반환(`ValueTask<T>`) | 7 | C | 69.2절 |
| **컬렉션 식 `[1, 2, 3]`** | 12 | A / 대상 타입에 따라 C | 24.14절 |
| 컬렉션 초기화자 | 3 | A | 28.2절 |
| 컬렉션 초기화자(확장 `Add`) | 6 | A | 28.2절 |
| 쿼리 식 | 3 | A | 29.3절 |
| 타입 패턴(지정자 있음) | 7 | A | 77.7절 |
| 타입 패턴(지정자 없음) | 9 | A | 77.7절 |
| **튜플** | 7 | C(`System.ValueTuple`) | 77.1절 |
| 튜플 요소 이름 추론 | 7.1 | C | 77.1절 |
| 튜플 `==` / `!=` | 7.3 | C | 77.3절 |
| 파일 범위 네임스페이스 | 10 | A | 12장 |
| **패턴 매칭(상수 · 타입 · `var`)** | 7 | A | 77.7절 |
| 임베드된 상호 운용 형식(PIA 링크) | 4 | **D** | 60.12절 |
| 함수 포인터 | 9 | A | 60.11절 |
| 호출자 정보 특성 | 5 | C | 20.11절 |
| 확장 메서드 | 3 | C | 20.5절 |
| 확장 멤버(`extension` 블록) | 14 | A | 20.5절 |
| 확장 `GetEnumerator`로 `foreach` | 9 | A | 28.1절 |
| 확장 프로퍼티 패턴 `{ A.B: ... }` | 10 | A | 77.9절 |
| 확장된 `nameof` 범위(특성 안) | 11 | A | 21.9절 |

> **💡 이 표에서 굵게 표시되지 않은 A 등급 항목은 거의 다 "지금 바로 켜도 되는" 것들이다**
>
> 등급 A는 런타임과 무관하므로, `LangVersion`만 올리면 `net472`에서도 동작한다. 반대로 표에서 **D**를 발견하면 그 순간 논의는 "언어 버전"이 아니라 "TFM 마이그레이션"으로 옮겨가야 한다. H.5절이 그 순서를 다룬다.

---

## H.5 마이그레이션 관점 — 어떤 순서로 올릴 것인가

### 큰 틀의 다섯 단계

레거시 코드베이스의 언어 버전을 올리는 것은 한 번에 하는 일이 아니다. 76.14절이 정리한 순서가 골격이다.

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1단계  SDK 스타일 프로젝트로 전환                                │
│        packages.config → PackageReference                       │
│        (언어 버전과 무관. 이게 안 되면 아무것도 못 한다)          │
├─────────────────────────────────────────────────────────────────┤
│ 2단계  LangVersion을 TFM 기본값까지 올린다                       │
│        net472 → 7.3.  파괴적 변경 거의 없음                      │
│        여기서 얻는 것: 튜플, 패턴, ref/in, 지역 함수             │
├─────────────────────────────────────────────────────────────────┤
│ 3단계  TFM을 netstandard2.0으로 올리거나 멀티 타깃 도입          │
│        라이브러리라면 여기서 소비자 범위가 결정된다               │
├─────────────────────────────────────────────────────────────────┤
│ 4단계  net8.0 이상으로 TFM 전환                                  │
│        여기서 비로소 등급 D 기능이 열린다                        │
│        기본 인터페이스 멤버, 정적 추상 멤버, 인라인 배열 …       │
├─────────────────────────────────────────────────────────────────┤
│ 5단계  Nullable을 warnings → enable로 (프로젝트 단위, 파일 단위) │
│        가장 오래 걸리는 단계. 절대 마지막에 한다                 │
└─────────────────────────────────────────────────────────────────┘
```

*그림 H-2. 언어 버전 마이그레이션의 다섯 단계(76.14절).*

### 문법 도입 순서 — 위험이 낮고 이득이 큰 것부터

2단계와 4단계 안에서 **무엇을 먼저 도입할 것인가**는 별개의 판단이다. 아래 순서는 "코드 리뷰 부담과 사고 위험이 낮으면서 즉시 가독성·안정성 이득이 있는 것"을 앞에 둔 것이다.

| 순서 | 도입할 것 | C# 버전 | 왜 먼저인가 | 위험 |
|---|---|---|---|---|
| 1 | `nameof`, 식 본문 멤버, `?.`, 보간 문자열, `using static` | 6 | 파괴적 변경이 사실상 없는 릴리스 전체를 통째로 켤 수 있다 | 없음(문화권 주의 — 79.4절) |
| 2 | `out` 변수, `is` 패턴, `throw` 식, 지역 함수 | 7 | `as` + null 검사 관용구를 기계적으로 대체한다 | 없음 |
| 3 | 튜플 · 분해 | 7 | `out` 매개변수와 `Tuple<T1,T2>`를 걷어낸다 | `System.ValueTuple` 패키지 필요 |
| 4 | `switch` 식, 속성·위치 패턴 | 8 | 분기 코드의 완전성 검사를 얻는다 | 순서 의존성(77.13절) |
| 5 | `using` 선언, `??=`, 정적 지역 함수 | 8 | 국소적 치환. 리뷰 부담이 작다 | 없음 |
| 6 | 파일 범위 네임스페이스, `global using` | 10 | 파일 상단 잡음 제거. 기계적 변환이 가능하다 | 없음 |
| 7 | 대상 타입 지정 `new`, `static` 람다 | 9 | 중복 제거 + 의도치 않은 캡처 예방 | 없음 |
| 8 | `record` / `readonly record struct` | 9 / 10 | DTO 계층의 코드량이 급감한다 | **동등성 의미가 바뀐다**(아래) |
| 9 | 기본 생성자, 컬렉션 식 | 12 | DI 코드와 컬렉션 생성 문법 통일 | 캡처 매개변수 가변성(아래) |
| 10 | `required`, 원시 문자열, 목록 패턴 | 11 | 표현력 이득이 크지만 팀 학습이 필요하다 | `required`는 런타임 미강제 |
| 11 | `in` / `readonly struct` / `Span<T>` 계열 | 7.2 이후 | **측정으로 정당화될 때만.** 추론하기 어려워진다 | 방어적 복사, 별칭 |
| 12 | `#nullable enable` | 8 | 이득이 가장 크지만 비용도 가장 크다. 항상 마지막 | 경고 수천 개 |

> **💡 NRT 활성화는 파일 단위로 쪼개라**
>
> `<Nullable>enable</Nullable>`을 큰 프로젝트에 한 번에 켜면 경고가 수천 개 나오고, 그러면 팀은 그냥 경고를 끈다. `<Nullable>disable</Nullable>`을 프로젝트 기본으로 두고 새 파일과 정리한 파일에만 `#nullable enable`을 넣는 방식이 실전에서 훨씬 잘 작동한다(21.7절, 76.14절).

### 도입 시 주의할 파괴적 변경

"컴파일은 되는데 의미가 달라지는" 것들이다. 마이그레이션 사고의 대부분이 이 표 안에 있다.

| 변경 | 무엇이 조용히 달라지는가 | 방어 | 본문 |
|---|---|---|---|
| **`#nullable enable`** | 런타임 동작은 그대로다. **경고일 뿐 강제가 아니므로** 방어적 인수 검증을 제거하면 안 된다. 호출자가 C# 7 프로젝트일 수도, 리플렉션 경유일 수도 있다 | 공개 API의 `ThrowIfNull`을 유지한다 | 21.6절 |
| **`class` → `record` 전환** | 동등성이 참조 비교에서 **값 비교**로 바뀐다. `Dictionary` 키·`HashSet` 원소·이벤트 구독 해제 동작이 통째로 달라진다 | 그 타입이 컬렉션 키나 식별자로 쓰이는지 먼저 조사한다 | 19.7절 |
| **레코드의 얕은 불변성** | `with`는 얕은 복사다. 가변 컬렉션 멤버는 공유되고, 컴파일러 생성 `GetHashCode`는 그 참조 해시를 쓴다 | 불변 컬렉션을 쓰거나 동등성을 직접 재정의한다 | 19.8절 |
| **`record struct`의 기본 가변성** | 위치 프로퍼티가 `{ get; set; }`이다(`record class`는 `init`). 딕셔너리 키로 쓰다 내용을 바꾸면 조회가 깨진다 | 거의 항상 `readonly record struct`를 쓴다 | 19.2절 |
| **문자열 보간 핸들러(C# 10)** | 문법은 그대로인데 **컴파일 결과가 바뀐다.** `DefaultInterpolatedStringHandler`가 있는 런타임에서만 그것을 쓰므로 TFM마다 IL이 다르다 | 벤치마크를 TFM별로 따로 해석한다 | 35.7절, 69.5절 |
| **`Task` → `ValueTask` 전환** | 두 번 `await`, 미완료 상태의 `.Result`, 여러 스레드 동시 사용이 모두 금지다. 어기면 예외이거나 **엉뚱한 값**이 나온다 | 호출을 곧바로 `await` 하거나 `AsTask()`를 쓴다 | 47.13절 |
| **`params` 스팬 오버로드 추가(C# 13)** | 라이브러리가 오버로드를 추가하면 **재컴파일 시 호출 대상이 바뀐다** | 라이브러리 저자가 `[OverloadResolutionPriority]`를 명시한다 | 76.12절, 78.3절 |
| **`object` 잠금 → `Lock`(C# 13)** | `Lock`을 `object`로 변환하면 `Monitor` 경로로 돌아가 **상호 배제가 깨진다** | 컴파일러 경고를 오류로 승격한다. `object` 매개변수로 넘기지 않는다 | 48.15절 |
| **`field` 키워드(C# 14)** | `field`라는 이름의 기존 필드가 있으면 접근자 안에서 **의미가 바뀐다** | 기존 필드는 `this.field`로 쓴다. 언어 버전 상승 시 전수 조사 | 76.12절 |
| **`in` 도입** | `readonly`가 아닌 구조체에서는 멤버 접근마다 **방어적 복사**가 생겨 오히려 느려진다. 그리고 `in`은 값이 안 바뀐다는 뜻이 아니다 | `readonly struct`와 함께만 쓴다 | 69.1절 |
| **구조체의 매개변수 없는 생성자(C# 10)** | `default(T)`, 배열 할당, `Activator.CreateInstance<T>()`가 그 생성자를 **부르지 않는다** | 0이 유효한 상태가 되도록 설계한다 | 16.3절, 16.4절 |
| **선택적 매개변수 기본값 변경** | 기본값이 호출 지점 IL에 박혀 있어 **재컴파일 전까지 옛 값이 전달된다** | 바이너리 호환성 목록으로 관리한다 | 78.13절 |
| **기본 인터페이스 멤버 추가** | 기본 구현은 **인터페이스로 캐스팅해야만** 호출된다. 클래스 변수로는 보이지 않는다 | 버전 관리 목적에만 쓴다 | 18.7절 |

### 멀티 타깃에서만 나타나는 함정

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>netstandard2.0;net8.0;net9.0</TargetFrameworks>
    <LangVersion>13.0</LangVersion>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <!-- 구형 TFM에만 폴리필 -->
  <ItemGroup Condition="'$(TargetFramework)' == 'netstandard2.0'">
    <PackageReference Include="System.Memory" Version="4.6.0" />
    <PackageReference Include="Microsoft.Bcl.AsyncInterfaces" Version="9.0.0" />
    <PackageReference Include="PolySharp" Version="1.15.0" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

빌드가 TFM마다 한 번씩 돌고, **각 빌드에서 사용 가능한 API와 언어 기능이 다르다.** `<LangVersion>13.0</LangVersion>`은 세 빌드 모두에 적용되지만 `netstandard2.0` 빌드에서 `allows ref struct`를 쓰면 그 빌드만 실패한다.

| TFM | 정의되는 심볼(일부) |
|---|---|
| `net472` | `NETFRAMEWORK`, `NET472`, `NET472_OR_GREATER`, `NET471_OR_GREATER`, … |
| `netstandard2.0` | `NETSTANDARD`, `NETSTANDARD2_0`, `NETSTANDARD2_0_OR_GREATER`, … |
| `netstandard2.1` | `NETSTANDARD`, `NETSTANDARD2_1`, `NETSTANDARD2_0_OR_GREATER`, … |
| `net8.0` | `NET`, `NETCOREAPP`, `NET8_0`, `NET8_0_OR_GREATER`, `NET6_0_OR_GREATER`, … |
| `net9.0` | `NET`, `NETCOREAPP`, `NET9_0`, `NET9_0_OR_GREATER`, `NET8_0_OR_GREATER`, … |

> **⚠️ `#if NET8_0`과 `#if NET8_0_OR_GREATER`는 다르다**
>
> `NET8_0`은 **정확히 `net8.0`** 일 때만 정의된다. `net9.0` 빌드에서는 정의되지 않는다. 이 실수를 하면 TFM을 하나 추가하는 순간 최적화 경로가 조용히 사라진다. 코드는 그대로인데 성능 회귀가 나므로 찾기 매우 어렵다. **`_OR_GREATER`를 기본으로 쓰라**(76.14절).

> **⚠️ `#if`로 갈린 코드는 한쪽만 컴파일된다**
>
> `#else` 분기는 활성 TFM 빌드에서 **구문 검사조차 되지 않는다.** IDE도 활성 TFM 하나의 관점만 보여준다. 멀티 타깃 프로젝트의 CI는 반드시 **모든 TFM을 빌드**해야 하고, `#if` 분기는 가능한 한 작은 메서드 하나 안에 가둬야 한다(76.14절).

### 조합 매트릭스 — 지금 무엇이 되는가

`LangVersion`을 필요한 만큼 올렸다고 가정한 결과다(76.13절). 굵게 표시한 행이 **런타임을 올리는 것 말고는 방법이 없는** 기능이다.

| 기능 (C# 버전) | `net472` | `netstandard2.0` | `netstandard2.1` | `net8.0`+ |
|---|---|---|---|---|
| 튜플, 패턴 매칭, `ref` 지역 (7.x) | ✓ | ✓ | ✓ | ✓ |
| `readonly struct`, `in`, `ref struct` (7.2) | ✓ | ✓ | ✓ | ✓ |
| `Span<T>` 사용 (7.2) | 패키지 필요 | 패키지 필요 | ✓ | ✓ |
| `switch` 식, 재귀 패턴 (8) | ✓ | ✓ | ✓ | ✓ |
| NRT 어노테이션 (8) | ✓ (BCL 미표기) | ✓ (BCL 미표기) | ✓ (BCL 미표기) | ✓ |
| 인덱스·범위 (8) | 폴리필 | 폴리필 | ✓ | ✓ |
| 비동기 스트림 (8) | 패키지 | 패키지 | ✓ | ✓ |
| **기본 인터페이스 멤버 (8)** | **불가** | **불가** | ✓ | ✓ |
| `init`, `record` (9) | 폴리필 | 폴리필 | 폴리필 | ✓ |
| 최상위 문, 패턴 개선 (9) | ✓ | ✓ | ✓ | ✓ |
| **공변 반환 (9)** | **불가** | **불가** | **불가** | ✓ |
| `global using`, 파일 범위 ns (10) | ✓ | ✓ | ✓ | ✓ |
| 보간 핸들러 (10) | 폴리필(효과 제한) | 폴리필 | 폴리필 | ✓ |
| 원시 문자열, 목록 패턴 (11) | ✓ | ✓ | ✓ | ✓ |
| `required` (11) | 폴리필 | 폴리필 | 폴리필 | ✓ |
| **정적 추상 멤버, `ref` 필드, 제네릭 특성 (11)** | **불가** | **불가** | **불가** | ✓ |
| 기본 생성자, 컬렉션 식 (12) | ✓ (대상 타입 제한) | ✓ | ✓ | ✓ |
| **인라인 배열 (12)** | **불가** | **불가** | **불가** | ✓ (.NET 8+) |
| `params` 컬렉션 (13) | 배열만 | 배열만 | 부분 | ✓ (.NET 9+) |
| **`Lock`, `allows ref struct` (13)** | **불가** | **불가** | **불가** | ✓ (.NET 9+) |

> **⚠️ `netstandard2.0`은 최소 공통분모이지 "구식"이 아니다**
>
> 널리 쓰이는 라이브러리는 여전히 `netstandard2.0`을 대상으로 삼는다. .NET Framework 4.6.1 이상, Unity, Xamarin, 모든 .NET Core/.NET 버전에서 소비 가능하기 때문이다. 그 대가로 **C# 7.3 언어와 폴리필 관리**를 감수한다. 자동으로 `net8.0`만 대상으로 삼으면 소비자 절반을 잃을 수도 있다(4.3절, 76.13절).

---

## H.6 버전별로 "이제 이렇게 안 써도 된다"

인터넷의 C# 코드에는 **연도가 적혀 있지 않다.** 하지만 문법을 보면 대략의 시기를 알 수 있고, 그게 그 조언의 유효성을 판단하는 단서가 된다(76.14절). 아래 표는 그 판독표이자 현대화 체크리스트다.

> **⚠️ 이 표는 "무조건 바꾸라"는 뜻이 아니다**
>
> 오래된 파일에서 `string.Format`이나 명시적 null 검사를 보면 고치고 싶어진다. 하지만 그 파일이 `netstandard2.0` 멀티 타깃 대상이거나, 팀이 의도적으로 `LangVersion`을 낮춰 놓았을 수 있다. **먼저 `.csproj`를 열어보라**(76.14절).

### 언어 문법 — 구식 관용구와 현대적 대체

| 코드에서 보이는 것 | 추정 시기 | 오늘날의 대안 | 참조 |
|---|---|---|---|
| `ArrayList`, `Hashtable` | C# 1 (2002) | 제네릭 컬렉션 `List<T>`, `Dictionary<K,V>` (C# 2) | 23.1절, 24장 |
| `button.Click += new EventHandler(H);` | C# 1 | 메서드 그룹 변환 `+= H;` (C# 2) | 26.3절 |
| `delegate(int x) { return x > 3; }` | C# 2 (2005) | 람다 `x => x > 3` (C# 3), 캡처가 없으면 `static` 람다 (C# 9) | 26.8절, 26.11절 |
| 백킹 필드 + `get { return x; }` | C# 1~2 | 자동 구현 프로퍼티 (C# 3) → `{ get; }` (C# 6) → `init` (C# 9) → `field` (C# 14) | 79.9절 |
| `Type.Missing`을 12번 넘기는 COM 호출 | C# 3 이하 | COM 선택적 매개변수 특례 (C# 4) | 60.12절 |
| `string.Format("{0}, {1}", a, b)` | C# 2~5 | 보간 문자열 `$"{a}, {b}"` (C# 6). 미리 파싱하려면 `CompositeFormat` ※.NET 8 | 79.4절, 35.7절 |
| `var h = PropertyChanged; if (h != null) h(this, e);` | C# 2~5 | `PropertyChanged?.Invoke(this, e);` (C# 6) | 27장 |
| `throw new ArgumentNullException("x")` | C# 5 이하 | `nameof(x)` (C# 6) → `ArgumentNullException.ThrowIfNull(x)` ※.NET 6 | 21.10절 |
| `catch { Log(ex); throw; }` 로만 로깅 | C# 5 이하 | 예외 필터 `when` — **스택을 풀지 않고** 평가된다 (C# 6) | 32.7절, 32.8절 |
| `Task.Run(...).ContinueWith(...)` | C# 4 | `await` (C# 5) | 47.3절 |
| `SomethingAsync().Result` / `.Wait()` | 전 시기 | `await`. 라이브러리는 `ConfigureAwait(false)` | 47.12절, 47.14절 |
| `Begin`/`End`(APM), EAP, `BackgroundWorker` | C# 1~4 | TAP — `Task` 반환 + `Async` 접미사 + `CancellationToken` | 47.15절, 47.16절 |
| `int x; if (int.TryParse(s, out x))` | C# 6 이하 | `out` 변수 `out int x` (C# 7) | 79.3절 |
| `var c = o as Circle; if (c != null)` | C# 6 이하 | `is` 패턴 `o is Circle c` (C# 7) | 79.3절, 77.7절 |
| `Tuple.Create(a, b)` / `Item1`, `Item2` | C# 4~6 | `ValueTuple` — 구조체이고 요소에 이름이 있다 (C# 7) | 77.1절, 77.5절 |
| `out` 매개변수 두 개로 여러 값 반환 | C# 6 이하 | 튜플 반환 + 분해 (C# 7) | 77.6절 |
| 반복자 메서드 앞에 쓴 인수 검증 | C# 6 이하 | 일반 메서드 + 지역 반복자 함수 (C# 7) | 28.6절, 78.12절 |
| `switch` + 임시 변수 + `break`로 값 계산 | C# 7 이하 | `switch` 식 (C# 8) — 완전성 검사를 받는다 | 77.12절, 77.14절 |
| `Skip(2).Take(3)` / `Array.Copy`로 부분 열거 | C# 7 이하 | 범위 `data[2..5]`, 할당까지 없애려면 `AsSpan()[2..]` (C# 8) | 68.4절 |
| `try { } finally { x.Dispose(); }` 중첩 | C# 7 이하 | `using` 선언 (C# 8) | 33.5절 |
| `if (list == null) list = new();` | C# 7 이하 | `list ??= new();` (C# 8) | 21.10절 |
| 불변 값 타입을 손으로 쓴 15~20줄 | C# 8 이하 | `record` (C# 9) / `readonly record struct` (C# 10) | 19.1절, 19.2절 |
| `new Dictionary<string, List<DateTime>>()` 우변 반복 | C# 8 이하 | 대상 타입 지정 `new()` (C# 9) | 79.7절 |
| 모든 파일 상단의 같은 `using` 열 줄 | C# 9 이하 | `global using` + 암시적 `using` (C# 10) | 12장, 4.6절 |
| `namespace X { ... }` 로 파일 전체 들여쓰기 | C# 9 이하 | 파일 범위 네임스페이스 `namespace X;` (C# 10) | 12장 |
| `if (logger.IsEnabled) logger.Log($"...")` 로 비용 회피 | C# 9 이하 | 보간 문자열 핸들러 (C# 10) — 홀 평가 자체를 건너뛴다 | 69.5절 |
| `Debug.Assert(c, "count > 0")` 처럼 식을 손으로 문자열화 | C# 9 이하 | `[CallerArgumentExpression]` (C# 10) | 20.11절 |
| `"{\r\n  \"name\": …"` / `@"...""..."""` | C# 10 이하 | 원시 문자열 리터럴 `"""` (C# 11) | 35.3절 |
| `int`/`long`/`double`용 산술 오버로드 중복 | C# 10 이하 | 제네릭 수학 `where T : INumber<T>` (C# 11) | 22.8절 |
| `Encoding.UTF8.GetBytes("application/json")` (상수인데 매번) | C# 10 이하 | UTF-8 리터럴 `"application/json"u8` (C# 11) | 69.7절 |
| 생성자 매개변수를 필드에 옮겨 담는 DI 상용구 | C# 11 이하 | 기본 생성자 (C# 12) | 19.6절 |
| `ImmutableArray.Create(1, 2, 3)` / `new[] { 1, 2, 3 }` | C# 11 이하 | 컬렉션 식 `[1, 2, 3]` (C# 12) — 대상이 `ReadOnlySpan<T>`면 할당 0 | 24.14절 |
| `unsafe` + `fixed int buf[16];` | C# 11 이하 | 인라인 배열 `[InlineArray(16)]` (C# 12) — 안전한 코드, 임의 타입 | 68.10절 |
| `params int[]` 로 인한 배열 할당 | C# 12 이하 | `params ReadOnlySpan<int>` (C# 13) | 63.9절, 78.9절 |
| `private readonly object gate = new();` | C# 12 이하 | `private readonly Lock gate = new();` (C# 13 + .NET 9) | 48.15절 |
| 백킹 필드를 손으로 선언해 접근자 로직을 쓴 코드 | C# 13 이하 | `field` 키워드 (C# 14) | 79.9절 |
| `x!!` (매개변수 null 검사) | **C# 11 프리뷰 — 취소됨** | `ArgumentNullException.ThrowIfNull(x)` | 21.10절 |

### BCL — 손으로 짜던 관용구의 표준 대체

언어가 아니라 **런타임 버전**이 결정하는 항목들이다. H.3절의 연표와 함께 읽는다.

| 손으로 짜던 것 | 표준 대체 | 최소 런타임 | 참조 |
|---|---|---|---|
| 해시 코드를 `17 * 31 + ...`로 조합 | `System.HashCode` | ※.NET Core 2.1 | 25장 |
| 문자열 인덱스로 서로게이트 페어 처리 | `System.Text.Rune` | ※.NET Core 3.0 | 35.2절 |
| `BitConverter.ToString(hash).Replace("-", "")` | `Convert.ToHexString` / `FromHexString` | ※.NET 5 | 44장 |
| `(Color[])Enum.GetValues(typeof(Color))` | `Enum.GetValues<Color>()` / `GetNames<T>()` | ※.NET 5 | 20.2절 |
| `Enum.IsDefined(typeof(Color), c)` (인수 박싱) | `Enum.IsDefined(c)` | ※.NET 5 | 20.2절 |
| `new SHA256Managed().ComputeHash(bytes)` | 정적 `SHA256.HashData(bytes)` | ※.NET 5 | 44장 |
| `new HMACSHA256(key).ComputeHash(msg)` | `HMACSHA256.HashData(key, msg)` | ※.NET 6 | 44장 |
| `new Rfc2898DeriveBytes(...).GetBytes(n)` | `Rfc2898DeriveBytes.Pbkdf2(...)` | ※.NET 6 | 44장 |
| `[ThreadStatic] static Random` 직접 관리 | `Random.Shared` | ※.NET 6 | 39장 |
| `DateTime`에서 날짜만/시간만 쓰려고 시각을 0으로 | `DateOnly` / `TimeOnly` | ※.NET 6 | 37.3절 |
| `Timer` 콜백 + 재진입 방어 | `PeriodicTimer` + `await` | ※.NET 6 | 46.6절 |
| `Task.WhenAny(t, Task.Delay(timeout))` 관용구 | `Task.WaitAsync(timeout, ct)` | ※.NET 6 | 46.9절 |
| `Parallel.ForEach`에 비동기 람다 | `Parallel.ForEachAsync` | ※.NET 6 | 50.7절 |
| `OrderBy(x => x)` (키 선택자가 항등) | `Order()` / `OrderDescending()` | ※.NET 7 | 30.5절 |
| `if (disposed) throw new ObjectDisposedException(...)` | `ObjectDisposedException.ThrowIf(disposed, this)` | ※.NET 7 | 33.4절 |
| `Stopwatch` 인스턴스 할당해 경과 시간 측정 | `Stopwatch.GetTimestamp()` + `GetElapsedTime()` | ※.NET 7 | 73.8절 |
| `[DllImport]` (런타임 마샬링 스텁) | `[LibraryImport]` (소스 생성) | ※.NET 7 | 60.9절 |
| `RegexOptions.Compiled` | `[GeneratedRegex]` (소스 생성) | ※.NET 7 | 36.8절 |
| `Sse2`/`Avx2` 직접 분기 | `Vector128<T>` / `Vector256<T>` 크로스 플랫폼 API | ※.NET 7 | 71.1절, 71.2절 |
| 여러 문자 중 하나 찾기를 루프로 | `SearchValues<T>` (문자열은 ※.NET 9) | ※.NET 8 | 69.6절 |
| 한 번 만들고 계속 읽기만 하는 `Dictionary` | `FrozenDictionary` / `FrozenSet` | ※.NET 8 | 24.11절 |
| `DateTime.UtcNow` / `Stopwatch` 직접 호출(테스트 불가) | `TimeProvider` 주입 | ※.NET 8 | 37.9절, 80.4절 |
| `string.Split`으로 조각을 다 할당 | `MemoryExtensions.Split(Span<Range>, char)` | ※.NET 8 | 69.5절 |
| 리플렉션으로 비공개 멤버 접근 | `[UnsafeAccessor]` | ※.NET 8 | 57.12절 |
| `cts.Cancel()` 이 콜백 때문에 블로킹 | `cts.CancelAsync()` | ※.NET 8 | 46.8절 |
| 루프 + `WaitAny` + 배열 재구성 | `Task.WhenEach` | ※.NET 9 | 46.9절 |
| `Guid.NewGuid()`를 정렬 키로 사용 | `Guid.CreateVersion7()` | ※.NET 9 | 39장 |
| 사전 조회를 위해 `Substring`으로 키 문자열 생성 | `GetAlternateLookup<ReadOnlySpan<char>>()` | ※.NET 9 | 69.5절 |
| `BinaryFormatter` 직렬화 | `System.Text.Json` 등 명시적 계약 형식 | — | 41.7절, 41.8절 |
| `Thread`를 직접 생성해 작업 실행 | 스레드 풀 · `Task` | — | 45.9절, 46장 |

> **💡 이 표를 코드 리뷰 규칙으로 바꾸려면 분석기를 쓰라**
>
> 위 항목의 상당수는 Roslyn 분석기와 `.editorconfig`로 강제할 수 있다. 사람이 리뷰에서 매번 지적하는 것보다 IDE가 물결선을 긋는 편이 훨씬 싸고 일관적이다. 다만 **팀이 합의한 것만 오류로 승격하라** — 합의 없이 켠 규칙은 `#pragma warning disable`만 늘린다(79.13절).

> **📌 취소된 프리뷰 기능을 소개하는 글이 인터넷에 그대로 남아 있다**
>
> 2022년 중반에 쓰인 `!!` 소개 글은 지금 따라 하면 컴파일되지 않는다. C# 12의 인터셉터는 여전히 프리뷰이고, 위치 표현 형식이 릴리스 사이에 바뀐 전례가 있다. **프리뷰 기능을 다룬 자료는 릴리스 노트로 교차 검증해야 한다**(76.11절, 76.14절).

---

## 이 부록의 요약

- **언어 버전과 런타임 버전은 다른 축이다.** C# 버전은 컴파일러(SDK + `<LangVersion>`)가, 사용 가능한 API와 CLR 기능은 TFM이 정한다. `net8.0` + `<LangVersion>13</LangVersion>`은 지원되는 조합이며, 이때 열리는 것은 **언어 기능뿐이고 새 BCL API는 열리지 않는다.**

- **`<LangVersion>`을 TFM 기본값 위로 올리는 것은 지원되지 않는 구성이고, 아래로 내리는 것은 완전히 지원된다.** 그리고 .NET Framework과 `netstandard2.0`의 기본값은 **C# 7.3**이다.

- **기능의 요구 사항은 네 등급으로 갈린다.** 순수 컴파일러(A), 컴파일러가 생성하는 특성(B), 폴리필 가능한 타입(C), 런타임 변경(D). H.2·H.4절 표의 "요구" 열에서 **D**를 보는 순간 논의는 언어 버전이 아니라 TFM 마이그레이션이 된다.

- **컴파일러가 이름으로 찾는 타입은 전부 폴리필 가능하다.** `IsExternalInit`이 그 원형이며, 조건은 셋 — 네임스페이스와 이름이 정확할 것, `internal`일 것, `#if`로 감쌀 것.

- **C# 2는 런타임을 바꿨고, C# 3~7은 바꾸지 않았고, C# 8부터 다시 바꾸기 시작했다.** 오늘날의 TFM 제약 대부분이 이 사실 하나로 설명된다.

- **마이그레이션은 SDK 스타일 전환 → `LangVersion` → TFM → NRT 순서다.** NRT 활성화는 이득이 가장 크지만 비용도 가장 커서 항상 마지막이고, 프로젝트 단위가 아니라 파일 단위로 켜는 편이 실전에서 잘 작동한다.

- **"컴파일은 되는데 의미가 달라지는" 변경이 사고의 대부분이다.** `class` → `record`의 동등성, `record struct`의 기본 가변성, 보간 핸들러가 바꾸는 IL, `ValueTask`의 일회성, `Lock`을 `object`로 캐스팅했을 때의 잠금 분열, `field` 문맥 키워드 충돌 — 이 목록이 H.5절이다.

- **이 색인은 기능이 언제 나왔는지만 말한다. 써야 하는지는 말하지 않는다.** 기능이 거기 있다고 해서 써야 하는 것은 아니며, 복잡성을 받아들이는 결정은 의식적인 것이어야 한다(76.14절).

---

## 연습 문제

1. 지금 관리하는 프로젝트의 `.csproj`에서 `TargetFramework(s)`와 `LangVersion`을 확인하고, H.5절의 조합 매트릭스에 대조하라. **지금 쓸 수 있는데 안 쓰고 있는 기능** 세 개와 **런타임 때문에 못 쓰는 기능** 세 개를 목록으로 만들어라.

2. `net472`, `netstandard2.0`, `net9.0` 세 TFM을 멀티 타깃하는 클래스 라이브러리를 만들고 `<LangVersion>13.0</LangVersion>`을 지정하라. `public record Point(int X, int Y);`를 추가해 빌드하고, 어느 TFM에서 어떤 오류가 나는지 기록하라. 그다음 H.1절의 `IsExternalInit` 폴리필을 추가해 다시 빌드하라.

3. 같은 프로젝트에 기본 인터페이스 멤버를 가진 인터페이스를 추가하고, 폴리필 패키지를 넣어도 해결되지 않음을 확인하라. H.1절의 등급 구분으로 그 이유를 설명하라.

4. `public static string Describe(int a, int b) => $"a={a}, b={b}";` 한 줄을 `net8.0`과 `netstandard2.0`으로 각각 빌드하고 ILSpy나 `ildasm`으로 디컴파일하라. 한쪽에서 `string.Format`이, 다른 쪽에서 `DefaultInterpolatedStringHandler`가 보이는가? H.5절의 "문자열 보간 핸들러" 행이 말하는 것이 이것이다.

5. H.6절의 언어 문법 표에서 다섯 항목을 골라, 자기 코드베이스를 `grep`으로 훑어 해당 관용구가 몇 곳에 남아 있는지 세어라. 그중 **바꾸면 안 되는 곳**(멀티 타깃 대상 파일, 의도적으로 낮춘 `LangVersion`)이 있는지 `.csproj`로 확인하라.

6. `class`로 정의된 DTO 하나를 `record`로 바꾸고, 그 타입이 `Dictionary` 키나 `HashSet` 원소로 쓰이는 자리를 전수 조사하라. 동등성이 참조 비교에서 값 비교로 바뀌면서 **동작이 달라지는 지점**이 있는지 테스트로 확인하라(19.7절).

7. `#if NET8_0`과 `#if NET8_0_OR_GREATER`를 각각 쓴 최적화 경로를 만들고, TFM에 `net9.0`을 추가한 뒤 어느 쪽이 조용히 사라지는지 확인하라. CI가 모든 TFM을 빌드하도록 파이프라인을 고쳐라.

8. H.3절의 GC·JIT 연표에서 자기 서비스가 쓰는 런타임 버전의 행을 찾아, 다음 LTS로 올릴 때 **동작이 달라질 항목**(DATAS, 객체 스택 할당, 예외 처리 재작성)을 목록으로 만들고 각각에 대한 측정 계획을 세워라(65.7절, 55.6절, 67장).

---

**이어서 볼 곳** — 이 색인이 가리키는 서술은 본문에 있다. 각 버전이 **왜 그 순서로 나왔는가**는 76장, 튜플·분해·패턴 매칭의 세부는 77장, 프로젝트 파일과 TFM·`LangVersion`의 조작은 4장, .NET 플랫폼의 계보는 2.3절, 널 가능 참조 타입의 마이그레이션 전략은 21.7절, `Span<T>` 계열의 런타임 의존성은 68장, 숨은 할당의 전체 카탈로그는 63.9절이다. IL과 어셈블리 대응은 부록 A, 메모리 관리 규칙은 부록 B, 진단 명령은 부록 C, 성능 상수는 부록 D에 있다.
