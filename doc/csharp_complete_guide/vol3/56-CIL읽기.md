---
title: "56장. CIL 읽기"
parent: "3권 — 내부, 메모리, 성능"
grand_parent: "C# Complete Guide"
nav_order: 56
---

# 56장. CIL 읽기

> **이 장의 위치** — 52장에서 어셈블리 안에 "IL 코드와 메타데이터가 들어 있다"고 했고, 54장에서는 박싱의 실물 IL을, 55장에서는 그 IL이 네이티브로 바뀌는 과정을 봤다. 그런데 정작 **IL 자체를 읽는 법**은 매번 미뤘다. 이 장이 그 빚을 갚는다. 여기서 IL의 문법(디렉티브·특성·옵코드), 실행 모델(평가 스택), 그리고 무엇보다 **C# 문법이 어떤 IL로 내려앉는지**를 끝까지 판다.
>
> **선수 지식** — 3장(첫 프로그램이 실행되기까지), 52장(어셈블리), 54장(타입 시스템의 런타임 표현), 55장(JIT 컴파일과 코드 생성)
>
> **이 장에서 다루지 않는 것** — 메타데이터 테이블의 물리적 구조와 토큰 인코딩은 52.2절에서 다뤘다. IL을 **쓰는** 방법(`ILGenerator`, `DynamicMethod`, `Reflection.Emit`)은 58장 전체가 담당한다. 반복자 상태 기계의 전체 코드는 28.4절, `async` 상태 기계의 전체 코드는 47.7절에 있다. 이 장은 그 결과물을 **읽는 훈련**에 집중한다.

---

## 56.1 왜 IL을 읽어야 하는가

C#으로 애플리케이션을 만든다면 IL을 한 줄도 몰라도 된다. 이건 사실이다. 그런데도 이 장이 존재하는 이유는, C# 언어 명세가 "이렇게 동작한다"고 말하는 것과 **컴파일러가 실제로 만들어내는 것** 사이에 늘 간극이 있기 때문이다. 그 간극에서 성능 문제와 미묘한 버그가 태어난다.

### 관리 컴파일러가 하는 일

C# 컴파일러(Roslyn)가 `*.cs` 파일로부터 만들어내는 것은 세 가지다.

1. **CIL 코드** — 타입 멤버의 구현 로직
2. **타입 메타데이터** — 타입·멤버·시그니처의 서술
3. **어셈블리 매니페스트** — 어셈블리 자신에 대한 서술 (52.2절)

여기서 CIL(Common Intermediate Language)은 단순한 중간 표현이 아니라 **자체 문법과 의미론과 컴파일러(`ilasm.exe`)를 가진 완전한 .NET 프로그래밍 언어**다. 이론적으로는 C# 없이 CIL만으로 어셈블리 전체를 만들 수 있다.

> **📌 이름이 셋인 언어**
>
> 같은 것을 부르는 이름이 시기마다 달랐다.
>
> - **MSIL** (Microsoft Intermediate Language) — .NET 1.0 베타 시절의 이름
> - **CIL** (Common Intermediate Language) — ECMA-335 표준이 채택한 공식 명칭
> - **IL** — 실무에서 쓰는 줄임말
>
> 셋 다 같은 것이다. 이 책에서는 문법을 논할 때 CIL, 일반적인 맥락에서는 IL이라고 쓴다. `ildasm`, `ilasm`, `ILGenerator`, `OpCodes` 같은 도구·API 이름은 모두 IL을 쓴다.

### IL을 아는 사람이 할 수 있는 것

원천 문헌이 드는 근거는 셋이다.

- **기존 어셈블리를 디스어셈블하고, IL을 수정하고, 다시 어셈블한다.** 소스가 없는 어셈블리를 고쳐야 할 때, 컴파일러가 비효율적(심하면 잘못된) IL을 뱉었을 때, COM 상호 운용 라이브러리에서 변환 중 사라진 COM IDL 특성(`[helpstring]` 같은)을 되살릴 때 쓴다.
- **`System.Reflection.Emit`으로 동적 어셈블리를 만든다.** 메모리 안에 어셈블리를 생성하는 기법으로, 도구·프레임워크를 만드는 쪽에서 필요하다. IL을 **직접 방출**해야 하므로 옵코드 지식이 필수다. 58장이 이걸 다룬다.
- **상위 언어가 노출하지 않는 CTS(공통 타입 시스템)의 영역에 접근한다.** CIL은 CTS의 **모든** 측면에 접근할 수 있는 유일한 .NET 언어다. 예를 들어 C#에서는 불가능한 **전역 수준 멤버와 필드**를 CIL에서는 정의할 수 있다.

실무자의 관점에서 셋을 더 보탠다. **컴파일러가 무엇을 몰래 만드는지 안다** — 클로저의 디스플레이 클래스, `async`의 상태 기계, `foreach`의 열거자는 GC 압력과 호출 비용의 실제 출처다. **디컴파일러가 거짓말할 때 알아챈다** — ILSpy가 보여주는 C#은 "이 IL을 만들 수 있는 C#"이지 원본이 아니다(56.8절). **성능 논쟁을 종결한다** — "이 두 코드가 같은가"는 IL을 뽑아 diff하면 끝난다.

> **💡 IL 지식의 정확한 위치**
>
> C 프로그래머가 어셈블리를 아는 것과 같은 위치다. 매일 쓰지는 않지만, 알면 하위 계층에서 무슨 일이 벌어지는지 보이고, 몰라도 대부분의 일은 된다. 다만 "안 보이던 것이 보인다"의 차이가 크다. 이 장의 목표는 IL을 **작성**하는 능력이 아니라 **읽는** 능력이다. 작성은 58장에서 `ILGenerator`를 통해 훨씬 안전한 방식으로 배운다.

### IL이 무엇이 아닌지

세 가지 오해를 먼저 걷어낸다.

**IL은 직접 실행되지 않는다.** IL은 JIT 컴파일러가 필요할 때 네이티브 코드로 번역한다(55장). 그래서 IL 수준의 "비효율"이 실행 시 비효율이라는 보장이 없다. 원천 문헌이 명시하듯, JIT 컴파일 과정에서 **구현상의 중복 상당수가 최적화로 사라진다.** 게다가 프로젝트에 최적화 옵션(`<Optimize>true</Optimize>`, 즉 Release 빌드)을 켜면 **C# 컴파일러 단계에서도** 여러 IL 중복이 제거된다.

**IL은 어셈블리 언어가 아니다.** IL은 대부분의 CPU 기계어보다 훨씬 **높은 수준**의 언어다. 객체 타입을 다루고, 객체를 생성·초기화하고, 가상 메서드를 호출하고, 배열 요소를 직접 조작하는 명령을 가진다. 심지어 예외를 던지고 잡는 명령까지 있다. **객체 지향 기계어**라고 생각하는 편이 정확하다.

**IL은 레지스터를 모른다.** 레지스터를 조작하는 명령이 아예 없고 모든 것이 스택을 통한다. 덕분에 CLR을 대상으로 하는 새 언어와 컴파일러를 만들기 쉽다 — 레지스터 할당은 JIT에게 전부 떠넘기면 된다.

### IL 명령은 타입이 없다(거의)

CLR via C#가 강조하는 사실 하나. **IL 명령은 타입이 없다(typeless).** `add` 명령은 스택에 마지막으로 푸시된 두 피연산자를 더하는데, 32비트용 `add`와 64비트용 `add`가 따로 있지 않다. `add` 하나뿐이고, 실행 시점에 스택 위 피연산자의 타입을 보고 적절한 연산을 수행한다.

이 "타입 없음"은 절반만 맞다. 정확히는 이렇다.

| 구분 | 예 | 설명 |
|---|---|---|
| 타입 없는 명령 | `add`, `sub`, `mul`, `and`, `ceq` | 스택 위 값의 타입에서 연산 종류가 결정된다 |
| 타입이 있는 명령 | `ldc.i4`, `conv.r8`, `ldelem.i4` | 명령 자체가 타입을 지정한다 |
| 오버플로 검사 변형 | `add.ovf`, `mul.ovf.un`, `conv.ovf.i2` | C#의 `checked` 컨텍스트가 만든다 |
| 부호 있음/없음 구분 | `div` vs `div.un`, `bgt` vs `bgt.un` | 피연산자 타입만으로는 결정되지 않으므로 명령이 구분한다 |

`div`(부호 있는 나눗셈)와 `div.un`(부호 없는 나눗셈)이 따로 있는 이유가 여기 있다. 스택 위의 4바이트 정수를 보고 `int`인지 `uint`인지 IL 실행 모델은 구분하지 못한다. 그래서 그 정보를 **명령 쪽에** 담는다.

> **⚠️ `add`는 하나지만 `add.ovf`는 별개다**
>
> C#에서 `checked { a + b }`를 쓰면 `add`가 아니라 `add.ovf`가 나온다. 반대로 `unchecked`나 기본 컨텍스트에서는 `add`다. IL을 읽다가 `add.ovf`를 봤다면 그 코드는 `checked` 안에 있거나, 프로젝트에 `<CheckForOverflowUnderflow>true</CheckForOverflowUnderflow>`가 켜져 있다. 성능 차이가 미미하지 않은 경우가 있으므로(오버플로 검사 분기가 루프 안에 들어가면 벡터화를 막는다), 핫 루프의 IL에서 `.ovf` 접미사를 확인하는 습관은 값어치가 있다.

### 검증(verification)

IL을 네이티브로 컴파일하는 도중 CLR은 **검증(verification)** 이라는 과정을 수행한다. 검증은 상위 수준의 IL 코드를 살펴보고 코드가 하는 모든 일이 안전한지 확인한다. 예를 들어 이런 것들을 본다.

- 모든 메서드가 **올바른 개수**의 매개변수로 호출되는가
- 각 메서드에 전달되는 매개변수가 **올바른 타입**인가
- 모든 메서드의 반환값이 **제대로 사용**되는가
- 모든 메서드에 return 문이 있는가

검증에 필요한 메서드·타입 정보는 전부 관리 모듈의 **메타데이터**에 들어 있다. 이것이 IL과 메타데이터가 한 파일에 함께 사는 이유다. IL만으로는 검증할 수 없다.

CLR via C#의 저자는 IL의 최대 이점이 CPU 추상화가 **아니라** 바로 이 검증이 주는 **견고성과 보안**이라고 말한다. 검증된 관리 코드는 메모리를 부적절하게 접근하지 못하므로, 여러 관리 애플리케이션을 **하나의 Windows 가상 주소 공간에서** 돌릴 수 있다.

> **⚠️ 검증은 .NET Framework 시절 이야기가 상당 부분 섞여 있다**
>
> CLR via C#가 서술하는 검증 모델 — `SkipVerification` 권한, 부분 신뢰(partial trust), 인터넷에서 로드된 어셈블리의 권한 제한, `PEVerify.exe` — 는 **.NET Framework의 CAS(코드 접근 보안)** 를 전제한다. .NET(Core) 이후 CAS는 완전히 제거되었고, 부분 신뢰 실행도 지원하지 않는다. 오늘날 CLR은 IL의 **구조적 정합성**은 검사하지만(깨진 IL을 만나면 `System.InvalidProgramException`이 난다), 보안 경계로서의 검증은 하지 않는다. 즉 **어셈블리를 로드한다는 것은 그 코드를 신뢰한다는 뜻**이다. 신뢰할 수 없는 코드를 격리하려면 프로세스나 컨테이너를 써야 한다. `PEVerify.exe`도 .NET Framework SDK 도구이며 .NET에서는 `ILVerify`(NuGet의 `dotnet-ilverify` 글로벌 도구)가 그 역할을 대신한다.

### 도구 지형

이 장에서 쓰는 도구를 미리 정리한다.

| 도구 | 하는 일 | 입수 경로 | 플랫폼 |
|---|---|---|---|
| `ildasm` | 어셈블리 → `.il` 텍스트 | NuGet `Microsoft.NETCore.ILDAsm` / .NET Framework SDK | Windows(NuGet 패키지에 따라 크로스 플랫폼 가능) |
| `ilasm` | `.il` 텍스트 → 어셈블리 | NuGet `Microsoft.NETCore.ILAsm` | 동일 |
| ILSpy | 어셈블리 → IL + 디컴파일된 C# | 오픈소스, `ilspycmd` 글로벌 도구 | 크로스 플랫폼 |
| dotPeek | 동일 + 심볼 서버 | JetBrains, 무료 | Windows 전용 |
| SharpLab | 웹에서 C# → IL / JIT asm | sharplab.io | 브라우저 |
| `System.Reflection.Metadata`, `MethodBody.GetILAsByteArray()` | 코드로 메타데이터·IL 읽기 | BCL 내장 | 크로스 플랫폼 |

> **⚠️ `ildasm.exe`와 `ilasm.exe`는 .NET 런타임에 포함되지 않는다**
>
> `dotnet --list-sdks`에 SDK가 몇 개 깔려 있든 `ildasm`은 없다. .NET Framework 시절에는 Windows SDK에 딸려 왔지만 .NET(Core)에서는 별도로 구해야 한다. 두 가지 방법이 있다.
>
> 1. `https://github.com/dotnet/runtime`의 소스를 직접 빌드한다.
> 2. NuGet에서 받는다 — `Microsoft.NETCore.ILDAsm`, `Microsoft.NETCore.ILAsm`.
>
> 2번이 쉽다. 다만 `dotnet add package`로 추가해도 프로젝트에 실행 파일이 들어가지는 **않고**, 패키지 폴더(`%userprofile%\.nuget\packages\microsoft.netcore.ildasm\<버전>\runtimes\native\`)에 놓인다. 거기서 직접 실행해야 한다. 버전은 대상 런타임과 맞추는 편이 안전하다.

### 이 장을 읽는 방법

IL은 처음 보면 전부 똑같아 보인다. 그래서 이 장은 다음 형태를 반복한다.

```text
① C# 조각        →  ② 그에 대응하는 IL  →  ③ 한 줄씩 해설 + 스택 추적
```

②를 볼 때 처음부터 전부 이해하려 하지 마라. 먼저 **`ld`로 시작하는 줄과 `st`로 시작하는 줄**만 찾아라. `ld`는 스택에 밀어 넣고 `st`는 꺼내 저장한다. 이 둘만 구분해도 IL의 절반이 읽힌다. 나머지는 그 사이에 낀 계산과 호출이다.

---

## 56.2 스택 기반 실행 모델 — 평가 스택

### 평가 스택이란 무엇인가

CIL은 **스택 기반 프로그래밍 언어**다. 상위 수준 언어인 C#은 이 사실을 최대한 감춘다.

평가할 값들을 담는 공간을 공식적으로 **가상 실행 스택(virtual execution stack)**, 실무에서는 **평가 스택(evaluation stack)** 이라고 부른다. CIL은 값을 스택에 밀어 넣는 옵코드들을 제공하며 이 과정을 **로드(loading)** 라 하고, 스택 맨 위 값을 메모리(지역 변수 등)로 옮기는 옵코드들을 제공하며 이 과정을 **저장(storing)** 이라 한다.

핵심 제약이 하나 있다. **CIL의 세계에서는 데이터를 직접 접근하는 것이 불가능하다.** 지역 변수든, 들어오는 메서드 인수든, 타입의 필드 데이터든 마찬가지다. 반드시 명시적으로 스택에 로드한 뒤, 나중에 꺼내 써야 한다. IL 코드가 장황하고 중복돼 보이는 이유가 정확히 이것이다.

```text
                    ┌─────────────────────────────┐
                    │      메서드 실행 프레임      │
                    ├─────────────────────────────┤
   ldarg.N ────────►│  인수 슬롯 (arg 0, 1, 2...)  │◄──────── starg.s
                    ├─────────────────────────────┤
   ldloc.N ────────►│  지역 변수 슬롯 (V_0, V_1..)  │◄──────── stloc.N
                    ├─────────────────────────────┤
   ldfld   ────────►│  객체 필드 / 정적 필드        │◄──────── stfld / stsfld
   ldsfld  ────────►│                             │
                    ├─────────────────────────────┤
                    │                             │
                    │      ★ 평가 스택 ★          │  ← 모든 연산은 여기서만 일어난다
                    │   (LIFO, 메서드마다 하나)     │
                    │                             │
                    └─────────────────────────────┘
                        ▲                    │
                        │ push               │ pop
                     ldc.i4 / ldstr        add / call / ret ...
```

**평가 스택은 메서드 호출 스택(call stack)과 다른 것이다.** 호출 스택은 프레임을 쌓는 물리적 스택이고, 평가 스택은 한 메서드 안에서 값을 잠시 얹어두는 논리적 개념이다. 실제로 JIT은 평가 스택 대부분을 CPU 레지스터로 배정해 없애 버린다(55장). 평가 스택은 **IL이라는 언어의 추상 모델**이지 실행 시 실체가 아니다.

### 가장 단순한 예 — 두 수 더하기

```csharp
int Add(int x, int y)
{
    return x + y;
}
```

이걸 컴파일해서 `ildasm`으로 뽑으면 다음이 나온다. 아래는 원천 문헌이 보여주는, 이진 옵코드 값까지 주석으로 붙인 실제 출력이다.

```il
.method /*06000002*/ assembly hidebysig static int32
      '<<Main>$>g__Add|0_0'(int32 x, int32 y) cil managed
// SIG: 00 02 08 08 08
{
  // Method begins at RVA 0x2060
  // Code size       9 (0x9)
  .maxstack  2
  .locals /*11000001*/ init (int32 V_0)
  IL_0000:  /* 00   |                  */ nop
  IL_0001:  /* 02   |                  */ ldarg.0
  IL_0002:  /* 03   |                  */ ldarg.1
  IL_0003:  /* 58   |                  */ add
  IL_0004:  /* 0A   |                  */ stloc.0
  IL_0005:  /* 2B   | 00               */ br.s       IL_0007
  IL_0007:  /* 06   |                  */ ldloc.0
  IL_0008:  /* 2A   |                  */ ret
} // end of method '<Program>$'::'<<Main>$>g__Add|0_0'
```

`/* 58 | */` 부분이 **이진 옵코드**다. 덧셈은 `0x58`, 뺄셈은 `0x59`, 관리 힙에 새 객체를 할당하는 것은 `0x73`이다. JIT 컴파일러가 처리하는 "CIL 코드"는 결국 **이진 데이터 덩어리**일 뿐이다.

각 이진 옵코드에는 대응하는 **니모닉(mnemonic)** 이 있다. `0x58` 대신 `add`, `0x59` 대신 `sub`, `0x73` 대신 `newobj`를 쓴다. `ildasm` 같은 디스어셈블러가 하는 일이 바로 이진 옵코드를 니모닉으로 번역하는 것이다.

> **📌 "옵코드"라고 말할 때 사람들이 가리키는 것**
>
> 커스텀 관리 컴파일러 같은 극단적으로 저수준인 소프트웨어를 만드는 게 아니라면 이진 수치 옵코드를 신경 쓸 일은 없다. .NET 프로그래머가 "CIL 옵코드"라고 말할 때는 사실상 **친숙한 문자열 니모닉 집합**을 가리킨다. 이 책도 그렇게 쓴다. 이진 값이 필요한 유일한 지점은 56.9절에서 디스어셈블러를 직접 만들 때다.

### 스택 추적 — 한 명령씩

같은 IL을 스택 상태와 함께 추적한다. 왼쪽이 바닥, 오른쪽이 꼭대기다.

```text
 IL 오프셋   명령          동작                        실행 후 스택
─────────────────────────────────────────────────────────────────────
 IL_0000    nop           아무것도 안 함               [ ]
 IL_0001    ldarg.0       인수 0(x)을 푸시             [ x ]
 IL_0002    ldarg.1       인수 1(y)을 푸시             [ x, y ]
 IL_0003    add           둘 팝, 합을 푸시             [ x+y ]
 IL_0004    stloc.0       팝해서 V_0에 저장            [ ]
 IL_0005    br.s IL_0007  무조건 점프                  [ ]
 IL_0007    ldloc.0       V_0을 푸시                   [ x+y ]
 IL_0008    ret           팝해서 반환값으로            [ ]
```

`sub`가 두 값을 빼려면 다음 두 값을 **암묵적으로 팝**해야 한다는 점에 주의하라. 계산이 끝나면 결과가 다시 스택에 **푸시**된다. 산술·비교 옵코드는 전부 이 패턴이다.

> **⚠️ `nop`과 `br.s`가 왜 있는가 — Debug 빌드의 흔적**
>
> 위 IL의 `nop`과 `IL_0005: br.s IL_0007`은 **아무 일도 하지 않는다.** 바로 다음 명령으로 점프하는 분기다. 이것들은 **Debug 빌드**의 산물이다.
>
> - `nop` — 중단점을 걸 수 있는 자리를 만들고, C# 소스의 `{`, `}` 같은 위치에 IL 오프셋을 대응시킨다.
> - `br.s`(다음 줄로) — `return` 문에서 "값을 지역 변수에 넣고 → 함수 끝으로 점프 → 그 값을 로드해 반환"하는 구조를 만든다. 디버거에서 반환값을 검사하고 함수 끝에 중단점을 걸 수 있게 하기 위해서다.
>
> Release 빌드에서 같은 메서드는 이렇게 줄어든다.
>
> ```il
> .method assembly hidebysig static int32 Add(int32 x, int32 y) cil managed
> {
>   .maxstack  2
>   IL_0000:  ldarg.0
>   IL_0001:  ldarg.1
>   IL_0002:  add
>   IL_0003:  ret
> }
> ```
>
> **IL을 비교할 때는 반드시 Release 빌드끼리 비교하라.** Debug IL의 `nop` 개수를 세면서 성능을 논하는 것은 무의미하다.

### 지역 변수를 거치는 예

```csharp
void PrintMessage()
{
    string myMessage = "Hello.";
    Console.WriteLine(myMessage);
}
```

컴파일하면 `.locals` 디렉티브로 지역 변수 슬롯이 하나 잡히고, `ldstr`(load string)로 문자열을 스택에 올린 뒤 `stloc.0`("현재 값을 0번 저장 슬롯의 지역 변수에 저장하라")으로 저장한다. 이후 `ldloc.0`("0번 인덱스의 지역 값을 로드하라")으로 다시 꺼내 `Console.WriteLine()` 호출(`call` 옵코드)에 넘긴다. 마지막으로 `ret`으로 반환한다.

```il
.method assembly hidebysig static void
       '<<Main>$>g__PrintMessage|0_1'() cil managed
{
  // Method begins at RVA 0x2064
  // Code size       13 (0xd)
  .maxstack  1
  // 지역 문자열 변수를 정의한다 (인덱스 0).
  .locals init (string V_0)
  // "Hello." 값을 가진 문자열을 스택에 로드한다.
  IL_0000:  ldstr      "Hello."
  // 스택 위 문자열 값을 지역 변수에 저장한다.
  IL_0005:  stloc.0
  // 인덱스 0의 값을 로드한다.
  IL_0006:  ldloc.0
  // 현재 값으로 메서드를 호출한다.
  IL_0007:  call       void System.Console::WriteLine(string)
  IL_000c:  ret
}
```

`call`은 **시그니처에 적힌 인수 개수만큼** 스택에서 팝한다. `WriteLine(string)`은 인수 하나이므로 하나를 팝하고, 반환 타입이 `void`이므로 아무것도 푸시하지 않는다. 만약 `int Parse(string)`을 호출했다면 하나를 팝하고 하나를 푸시했을 것이다.

### 스택 균형 규칙

IL이 유효하려면 지켜야 하는 규칙이 있다. **어떤 지점이든 그 지점에 도달하는 모든 경로에서 스택 깊이가 같아야 한다.**

```text
                   [ ]
                    │
              ldc.i4.1
                    │
                  [ 1 ]
                    │
             brtrue IL_A ─────────┐
                    │ (false)     │ (true)
                   [ ]           [ ]        ← brtrue가 값을 팝했으므로 양쪽 다 깊이 0
                    │             │
              ldstr "no"     ldstr "yes"
                    │             │
                [ "no" ]      [ "yes" ]     ← 합류 지점에서 깊이 1로 동일. OK
                    └──────┬──────┘
                        [ str ]
```

한쪽 경로에서는 깊이 1, 다른 쪽에서는 깊이 2로 합류하면 검증에 실패한다. 손으로 IL을 쓸 때 가장 흔한 실수이고, `ilasm`이 아니라 **런타임이** `System.InvalidProgramException`으로 알려주는 경우가 많다.

또 하나. **`ret` 시점에 스택은 반환 타입에 정확히 맞아야 한다.** `void` 메서드라면 비어 있어야 하고, 값 반환 메서드라면 정확히 값 하나가 남아 있어야 한다. 그래서 반환값을 무시하려면 명시적으로 `pop`해야 한다.

```csharp
Console.WriteLine("Hello CIL code!");
Console.ReadLine();          // 반환값 string을 안 쓴다
```

```il
.method private hidebysig static void  '<Main>$'(string[] args) cil managed
{
  .entrypoint
  .maxstack  8
  IL_0000:  ldstr      "Hello CIL code!"
  IL_0005:  call       void [System.Console]System.Console::WriteLine(string)
  IL_000a:  nop
  IL_000b:  call       string [System.Console]System.Console::ReadLine()
  IL_0010:  pop
  IL_0011:  ret
}
```

`IL_0010: pop`이 `ReadLine()`이 푸시한 `string`을 버린다. C#에서 반환값을 무시하는 한 줄이 IL에서는 명시적인 `pop` 하나다.

### 완전히 채워진 어셈블리의 뼈대

`ildasm`으로 어셈블리를 통째로 뽑으면 파일은 항상 같은 순서로 시작한다. **참조하는 외부 어셈블리 선언 → 현재 어셈블리 정의 → 모듈·PE 디렉티브 → 타입 정의**다.

```il
.assembly extern System.Runtime
{
  .publickeytoken = (B0 3F 5F 7F 11 D5 0A 3A )
  .ver 6:0:0:0
}
.assembly RoundTrip
{
  .hash algorithm 0x00008004
  .ver 1:0:0:0
}
.module RoundTrip.dll
.imagebase 0x00400000
.file alignment 0x00000200
.stackreserve 0x00100000
.subsystem 0x0003       // WINDOWS_CUI
.corflags 0x00000001    //  ILONLY
```

마지막에 오는 타입 정의는, 최상위 문(top-level statements)으로 만든 프로그램이라면 컴파일러가 만든 `<Program>$` 클래스다.

```il
.class private abstract auto ansi sealed beforefieldinit '<Program>$'
  extends [System.Runtime]System.Object
{ ... }
```

`abstract`와 `sealed`가 동시에 붙어 있다. C#의 `static class`가 IL에서는 정확히 이 조합이다. 인스턴스를 만들 수도 없고(`abstract`) 상속할 수도 없다(`sealed`).

> **⚠️ CIL에서 BCL 타입을 쓰려면 어셈블리 이름을 대괄호로 붙여야 한다**
>
> CIL에서 .NET 타입(`System.Console` 같은)과 상호작용할 때는 **항상 정규화된 이름**을 써야 하고, 그 정규화된 이름 앞에는 **정의 어셈블리의 친숙한 이름을 대괄호로** 붙여야 한다.
>
> ```il
> call   void [System.Console]System.Console::WriteLine(string)
> call  string [System.Console]System.Console::ReadLine()
> ```
>
> `[System.Console]`이 어셈블리, `System.Console`이 타입, `::` 뒤가 멤버다. 이 규칙을 어기면 `ilasm`이 타입을 못 찾는다. 같은 어셈블리 안의 타입을 참조할 때는 대괄호 접두사를 생략할 수 있지만, **정규화된 이름(네임스페이스 포함)은 여전히 필수**다. 런타임이 이 어셈블리 이름을 실제 어셈블리로 해석하는 과정은 52.8절에서 다뤘다.

### 코드 레이블

구현 코드의 각 줄 앞에 붙는 `IL_XXXX:` 형태의 토큰을 **코드 레이블(code label)** 이라고 한다. 같은 멤버 범위 안에서 중복되지만 않으면 **아무 이름이나 붙일 수 있다.** `ildasm`은 `IL_XXXX:` 규약을 따라 자동 생성할 뿐이다.

```il
.method private hidebysig static void Main(string[] args) cil managed
{
  .entrypoint
  .maxstack 8
  Load_String:          ldstr "Hello CIL code!"
  PrintToConsole:       call void [System.Console]System.Console::WriteLine(string)
  Nothing_2:            nop
  WaitFor_KeyPress:     call string [System.Console]System.Console::ReadLine()
  RemoveValueFromStack: pop
  Leave_Function:       ret
}
```

이것도 정상적으로 컴파일된다. 사실 대부분의 코드 레이블은 **완전히 선택 사항**이다. 레이블이 진짜로 필수인 경우는 **분기나 루프 구문을 작성할 때**뿐이다 — 로직의 흐름을 어디로 보낼지 레이블로 지정해야 하기 때문이다. 위 예제는 분기가 없으므로 레이블을 전부 제거해도 아무 문제가 없다.

> **💡 `IL_XXXX`의 숫자는 오프셋이지 줄 번호가 아니다**
>
> `IL_0005`의 `0005`는 메서드 IL 스트림의 **바이트 오프셋**이다. `ldstr "Hello."`가 `IL_0000`에서 시작하고 다음이 `IL_0005`라면, `ldstr`이 5바이트(옵코드 1바이트 + 메타데이터 토큰 4바이트)를 차지한다는 뜻이다. 이 사실은 56.9절에서 디스어셈블러를 만들 때 결정적이다. 분기 명령의 피연산자도 이 오프셋으로 표현된다.

### `.maxstack` — 평가 스택의 최대 깊이

메서드 구현을 직접 CIL로 작성할 때 신경 써야 하는 특별한 디렉티브가 `.maxstack`이다. 이름 그대로 **메서드 실행 중 어느 시점에든 스택에 올라갈 수 있는 값의 최대 개수**를 정한다.

기본값은 **8**이며 대부분의 메서드에는 안전하다. 명시하고 싶다면 직접 계산해 지정한다.

```il
.method public hidebysig instance void
  Speak() cil managed
{
  // 이 메서드 범위에서는 정확히 1개의 값(문자열 리터럴)만
  // 스택에 올라간다.
  .maxstack 1
  ldstr "Hello there..."
  call void [mscorlib]System.Console::WriteLine(string)
  ret
}
```

> **⚠️ `.maxstack`을 실제보다 작게 쓰면 조용히 넘어가지 않는다**
>
> `.maxstack`은 JIT이 스택 프레임 크기를 정하는 데 쓰는 값이다. 실제 최대 깊이보다 작게 선언하면 IL 자체가 무효가 되어 로드 또는 JIT 시점에 `System.InvalidProgramException`이 발생한다. 반대로 크게 선언하는 것은 안전하지만, 필요 이상으로 스택 공간을 예약하게 된다. 손으로 IL을 쓸 때는 **계산이 귀찮으면 그냥 8로 두는 편**이 낫고, `ILGenerator`(58장)를 쓰면 프레임워크가 자동으로 계산해준다.

C# 컴파일러가 계산한 `.maxstack` 값은 그 메서드에서 동시에 살아 있는 중간값의 최대 개수를 알려주는 좋은 지표다. 복잡한 표현식 하나가 `.maxstack 12`를 만들었다면, 그 표현식이 실제로 얼마나 복잡한지에 대한 객관적 수치다.

### 지역 변수 선언 — `.locals init`

```csharp
public static void MyLocalVariables()
{
    string myStr = "CIL code is fun!";
    int myInt = 33;
    object myObj = new object();
}
```

이걸 직접 CIL로 쓰면 이렇게 된다.

```il
.method public hidebysig static void
  MyLocalVariables() cil managed
{
  .maxstack 8
  // 지역 변수 세 개를 정의한다.
  .locals init (string myStr, int32 myInt, object myObj)
  // 문자열을 가상 실행 스택에 로드한다.
  ldstr "CIL code is fun!"
  // 현재 값을 팝해서 지역 변수 [0]에 저장한다.
  stloc.0
  // "i4"(int32의 약칭) 타입 상수 33을 로드한다.
  ldc.i4.s 33
  // 현재 값을 팝해서 지역 변수 [1]에 저장한다.
  stloc.1
  // 새 객체를 만들어 스택에 올린다.
  newobj instance void [mscorlib]System.Object::.ctor()
  // 현재 값을 팝해서 지역 변수 [2]에 저장한다.
  stloc.2
  ret
}
```

`.locals` 디렉티브는 `init` 특성과 짝을 이룬다. 각 변수는 데이터 타입과 (선택적인) 변수 이름으로 식별된다.

> **⚠️ `.locals init`의 `init`은 성능에 영향을 준다**
>
> `init` 플래그(메타데이터에서 `initlocals`)는 **메서드 진입 시 모든 지역 변수 슬롯을 0으로 초기화하라**는 지시다. C# 컴파일러는 기본적으로 이걸 켠다. 대부분은 무시해도 되지만, `stackalloc`으로 큰 버퍼를 잡는 메서드에서는 매 호출마다 그 버퍼를 0으로 채우는 비용이 발생한다.
>
> `[SkipLocalsInit]` 특성(※C# 9)을 붙이면 `.locals init`이 `.locals`로 바뀐다. IL을 뽑아보면 `init` 키워드가 사라진 것을 눈으로 확인할 수 있다. 다만 **초기화되지 않은 스택 메모리를 읽을 위험**이 생기므로 `unsafe` 코드와 함께 쓸 때는 각별히 주의해야 한다.

### 인수와 숨겨진 `this`

```csharp
public static int Add(int a, int b)
{
    return a + b;
}
```

들어오는 인수 `a`, `b`는 `ldarg`(load argument) 옵코드로 가상 실행 스택에 푸시된다. 그다음 `add` 옵코드가 스택에서 두 값을 팝해 합을 구하고 다시 스택에 저장한다. 마지막으로 이 합이 `ret`으로 호출자에게 반환된다.

```il
.method public hidebysig static int32 Add(int32 a,
  int32 b) cil managed
{
  .maxstack 2
  ldarg.0 // "a"를 스택에 로드한다.
  ldarg.1 // "b"를 스택에 로드한다.
  add     // 두 값을 더한다.
  ret
}
```

인수는 **인덱스 위치**로 참조된다(인덱스 0, 인덱스 1). 여기서 반드시 알아야 할 것 하나. **인수를 받는 모든 비정적 메서드는 현재 객체에 대한 참조(C#의 `this`)를 암묵적인 추가 매개변수로 자동으로 받는다.**

그래서 같은 `Add`를 정적이 아니게 만들면,

```csharp
// 더 이상 static이 아니다!
public int Add(int a, int b)
{
    return a + b;
}
```

`a`와 `b`는 `ldarg.0`, `ldarg.1`이 아니라 **`ldarg.1`, `ldarg.2`** 로 로드된다. 0번 슬롯은 암묵적인 `this` 참조가 차지하기 때문이다. 시그니처를 `AddTwoIntParams(MyClass this, int32 a, int32 b)`처럼 읽으면 인덱스가 맞아떨어진다.

> **⚠️ IL을 읽을 때 첫 번째로 확인할 것: `static`인가 아닌가**
>
> IL 리스팅에서 `ldarg.0`을 보고 "첫 번째 매개변수"라고 반사적으로 읽으면 절반은 틀린다. `.method` 줄에 `static`이 있는지 먼저 봐라. 없다면 `ldarg.0`은 **`this`** 다. 이걸 헷갈리면 그 메서드의 IL 전체를 잘못 읽게 된다.
>
> 확장 메서드는 정의상 `static`이므로 `ldarg.0`이 `this` 매개변수(첫 인수)다. 반면 인스턴스 메서드에서 첫 인수는 `ldarg.1`이다.

### 값 타입의 `this`는 관리 포인터다

또 하나 자주 넘어가는 지점. **구조체의 인스턴스 메서드에서 `ldarg.0`은 `this` 참조가 아니라 `this`를 가리키는 관리 포인터(`&`)** 다.

```csharp
public struct Point { public int X, Y; public int Sum() => X + Y; }
```

```il
.method public hidebysig instance int32 Sum() cil managed
{
  .maxstack  8
  IL_0000:  ldarg.0                    // this — valuetype Point&
  IL_0001:  ldfld      int32 Point::X
  IL_0006:  ldarg.0
  IL_0007:  ldfld      int32 Point::Y
  IL_000c:  add
  IL_000d:  ret
}
```

시그니처를 메타데이터에서 보면 `this`의 타입이 `valuetype Point&`다. 그래서 `ldfld`가 관리 포인터에 대해서도 동작한다(`ldfld`는 객체 참조와 관리 포인터 양쪽을 받는다). 이 구조 때문에 구조체 메서드가 `this`의 필드를 **변경할 수 있고**, `readonly struct`가 아닌 구조체를 `in` 매개변수나 `readonly` 필드로 넘길 때 **방어적 복사**가 발생한다(54장).

---

## 56.3 주요 디렉티브·특성·옵코드

CIL 컴파일러가 이해하는 토큰 집합은 의미론에 따라 **세 범주**로 나뉜다. 이 구분을 잡고 가는 것이 IL을 읽는 첫걸음이다.

| 범주 | 표기 | 역할 | 예 |
|---|---|---|---|
| **디렉티브(directive)** | 점(`.`) 접두사 | 어셈블리의 **전체 구조**를 서술한다 | `.assembly`, `.class`, `.method`, `.field` |
| **특성(attribute)** | 접두사 없음, 디렉티브 뒤 | 디렉티브를 **한정**한다 | `public`, `extends`, `implements`, `sealed` |
| **옵코드(opcode)** | 접두사 없음, 메서드 본문 | 멤버의 **구현 로직**을 만든다 | `ldstr`, `call`, `add`, `ret` |

디렉티브는 CIL 컴파일러에게 어셈블리를 채울 네임스페이스·타입·멤버를 **어떻게 정의할지** 알려준다. `.il` 파일에 `.namespace` 디렉티브 하나와 `.class` 디렉티브 셋이 있으면, CIL 컴파일러는 네임스페이스 하나에 클래스 타입 셋이 든 어셈블리를 만든다.

디렉티브만으로는 타입이나 멤버의 정의를 충분히 표현하지 못하는 경우가 많다. 그래서 많은 디렉티브에 **CIL 특성**을 덧붙여 처리 방식을 한정한다. 예를 들어 `.class` 디렉티브는 `public`(타입 가시성), `extends`(기반 클래스 명시), `implements`(구현 인터페이스 목록)로 꾸밀 수 있다.

> **⚠️ CIL 특성과 .NET 특성은 완전히 다른 개념이다**
>
> `.class public MyType`의 `public`은 **CIL 특성**이다. `[Obsolete]`, `[Serializable]` 같은 **.NET 특성(어트리뷰트, 20장)** 과 혼동하면 안 된다. .NET 특성은 IL에서 `.custom` 디렉티브로 나타난다.
>
> ```il
> .custom instance void [System.Runtime]System.ObsoleteAttribute::.ctor(string)
>         = ( 01 00 05 6F 6C 64 21 21 00 00 )
> ```
>
> 뒤의 바이트 blob이 특성 생성자에 전달된 인수를 직렬화한 것이다. `01 00`은 prolog, 그다음이 문자열 길이와 UTF-8 바이트다.

### 어셈블리·모듈 수준 디렉티브

| 디렉티브 | 의미 | 대응하는 C#/프로젝트 개념 |
|---|---|---|
| `.assembly extern <이름> { ... }` | 참조하는 외부 어셈블리 선언 | `<PackageReference>`, `<ProjectReference>` |
| `.assembly <이름> { ... }` | 현재 어셈블리 정의 | 프로젝트 이름 / `AssemblyName` |
| `.ver M:m:b:r` | 어셈블리 버전 (콜론 구분, 점 아님) | `[AssemblyVersion]` |
| `.publickeytoken = (…)` | 참조 어셈블리의 공개 키 토큰 8바이트 | 강력한 이름 (52.5절) |
| `.hash algorithm 0x00008004` | 해시 알고리즘 식별자 (`0x8004` = SHA-1) | — |
| `.module <파일명>` | 단일 파일 어셈블리의 모듈 이름 | 출력 파일명 |
| `.mresources` | 내장 리소스가 든 파일 지정 | `<EmbeddedResource>` (53장) |
| `.subsystem 0x0003` | 선호 UI. `2`=GUI, `3`=콘솔 | `<OutputType>` |
| `.corflags`, `.imagebase`, `.file alignment`, `.stackreserve` | PE 헤더 값·플래그(`ILONLY` 등) | 플랫폼 대상. 거의 건드리지 않음 |
| `.namespace <이름> { ... }` | 네임스페이스 (중첩 가능) | `namespace` |

`.ver`는 각 숫자를 **콜론**으로 구분한다. C#의 점 표기가 아니다. `.ver 1:0:0:0`이 `1.0.0.0`이다.

네임스페이스는 C#과 마찬가지로 중첩할 수 있다.

```il
.namespace MyCompany
{
  .namespace MyNamespace {}
}
```

또는 한 줄로 붙여 쓴다.

```il
// 중첩 네임스페이스를 정의하는 축약 표기.
.namespace MyCompany.MyNamespace {}
```

### 타입 수준 디렉티브와 `.class` 특성

`.class` 디렉티브는 새 클래스를 정의한다. 기반 클래스를 명시하지 않으면 C#과 마찬가지로 `System.Object`에서 자동으로 파생된다.

```il
.namespace MyNamespace
{
  // System.Object 기반 클래스가 가정된다.
  .class public MyBaseClass {}
}
```

`System.Object` 외의 클래스에서 파생시키려면 `extends` 특성을 쓴다. 여기서 **같은 어셈블리 안의 타입을 참조할 때도 정규화된 이름이 필요**하다는 규칙이 걸린다.

```il
// 컴파일되지 않는다!
.namespace MyNamespace
{
  .class public MyBaseClass {}
  .class public MyDerivedClass
    extends MyBaseClass {}
}
```

네임스페이스를 포함한 전체 이름을 써야 한다.

```il
// 이게 맞다.
.namespace MyNamespace
{
  .class public MyBaseClass {}
  .class public MyDerivedClass
    extends MyNamespace.MyBaseClass {}
}
```

`.class`에 붙는 주요 특성은 다음과 같다.

| 특성 | 의미 |
|---|---|
| `public`, `private` | 최상위 타입의 가시성 |
| `nested public`, `nested private`, `nested assembly`, `nested family`, `nested famandassem`, `nested famorassem` | 중첩 타입의 가시성. **C#이 노출하지 않는 조합까지 있다** |
| `abstract`, `sealed` | 추상 클래스 / 봉인 클래스. 둘 다 붙이면 C#의 `static class` |
| `auto`, `sequential`, `explicit` | CLR에게 필드 데이터를 메모리에 어떻게 배치할지 지시. 클래스는 기본값 `auto`가 적절하다. P/Invoke로 비관리 C 코드를 호출할 때 바꾼다 (54.4절) |
| `extends`, `implements` | 기반 클래스 지정 / 인터페이스 구현 |
| `interface` | 이 타입이 CTS 인터페이스임을 표시 |
| `value` | `System.ValueType` 상속의 축약 표기 |
| `enum` | `System.Enum` 상속의 축약 표기 |
| `beforefieldinit` | 정적 필드 초기화 시점을 느슨하게 허용 (54.5절) |
| `ansi`, `unicode`, `autochar` | 상호 운용 시 문자열 마샬링 방식 |

> **📌 CIL은 C#보다 CTS를 더 많이 노출한다**
>
> 위 가시성 목록을 보면 `nested famandassem`(family AND assembly) 같은 조합이 있다. C#의 `protected internal`은 family **OR** assembly(`famorassem`)이고, `private protected`(※C# 7.2)가 family **AND** assembly다. 즉 C#이 `private protected`를 도입하기 전에도 CTS와 CIL에는 그 개념이 있었다. CIL이 CTS의 모든 측면에 접근할 수 있는 유일한 언어라는 말의 구체적 근거가 이것이다.

### 인터페이스·구조체·열거형

인터페이스도 `.class` 디렉티브로 정의한다. 다만 `interface` 특성을 붙인다.

```il
.namespace MyNamespace
{
  // 인터페이스 정의.
  .class public interface IMyInterface {}
  // 단순 기반 클래스.
  .class public MyBaseClass {}
  // MyDerivedClass는 IMyInterface를 구현하면서
  // MyBaseClass를 확장한다.
  .class public MyDerivedClass
    extends MyNamespace.MyBaseClass
    implements MyNamespace.IMyInterface {}
}
```

> **⚠️ `extends`가 `implements`보다 먼저 와야 한다**
>
> `extends` 절은 반드시 `implements` 절보다 앞에 온다. 순서를 바꾸면 `ilasm`이 거부한다. `implements` 절에는 쉼표로 구분한 인터페이스 목록을 넣을 수 있다.
>
> 그리고 더 헷갈리는 함정: **인터페이스 A를 인터페이스 B에서 파생시킬 때 `extends`를 쓰면 안 된다.** `extends`는 오직 타입의 **기반 클래스**를 한정하는 데만 쓴다. 인터페이스를 확장할 때도 `implements`를 쓴다 — `.class public interface IOther implements MyNamespace.IMyInterface {}`.

구조체는 `System.ValueType`을 확장하는 `.class`다. 값 타입은 다른 값 타입의 기반이 될 수 없으므로 **반드시 `sealed`** 여야 하며, 아니면 `ilasm`이 컴파일 오류를 낸다. 열거형은 `System.Enum`을 확장하며 역시 `sealed`다. 둘 다 `value` / `enum` 축약 특성이 있다.

```il
// 구조체 정의는 항상 sealed다.
.class public sealed MyStruct
  extends [System.Runtime]System.ValueType{}
// 축약 표기 — extends가 자동으로 붙는다.
.class public sealed value MyStruct{}

// 열거형.
.class public sealed MyEnum
  extends [System.Runtime]System.Enum{}
// 축약 표기.
.class public sealed enum MyEnum{}
```

### 제네릭의 CIL 표기 — 백틱

제네릭 타입과 제네릭 멤버는 하나 이상의 타입 매개변수를 가질 수 있다. CIL에서 타입 매개변수의 **개수**는 역방향 작은따옴표(백틱, `` ` ``) 뒤에 숫자로 표기한다. 실제 타입 인수 값은 C#처럼 꺾쇠괄호 안에 넣는다.

```csharp
void SomeMethod()
{
    List<int> myInts = new List<int>();
}
```

```il
// C#: List<int> myInts = new List<int>();
newobj instance void class [System.Collections]
  System.Collections.Generic.List`1<int32>::.ctor()
```

`List<T>`는 타입 매개변수가 하나이므로 ``List`1``이다. `Dictionary<string, int>`는 둘이므로 ``Dictionary`2``다.

```il
// C#: Dictionary<string, int> d = new Dictionary<string, int>();
newobj instance void class [System.Collections]
  System.Collections.Generic.Dictionary`2<string,int32>
  ::.ctor()
```

> **📌 `!0`, `!1`, `!!0`, `!!1`**
>
> 제네릭 IL을 읽다 보면 느낌표가 붙은 토큰이 나온다.
>
> - `!0`, `!1` — **타입**의 타입 매개변수 (0번째, 1번째)
> - `!!0`, `!!1` — **메서드**의 타입 매개변수
>
> 예를 들어 ``List`1<T>``의 `Add` 메서드 시그니처는 `void Add(!0)`이고, `Enumerable.Select<TSource,TResult>`의 반환 타입은 `` class IEnumerable`1<!!1> ``이다. 느낌표 하나면 감싸는 타입에서, 둘이면 메서드 자신에서 온 매개변수다. 이 구분을 알면 제네릭 메서드의 IL이 훨씬 잘 읽힌다.

### 필드와 생성자 디렉티브

열거형·구조체·클래스 모두 필드 데이터를 가질 수 있고, 전부 `.field` 디렉티브를 쓴다. 열거형 멤버는 `static`과 `literal` 특성을 붙인다. 값은 괄호 안에 지정한다.

```il
.class public sealed enum MyEnum
{
  .field public static literal valuetype
   MyNamespace.MyEnum A = int32(0)
  .field public static literal valuetype
   MyNamespace.MyEnum B = int32(1)
  .field public static literal valuetype
   MyNamespace.MyEnum C = int32(2)
}
```

`static literal` 조합이 "타입 자체에서 접근 가능한 고정 값"(`MyEnum.A`)을 만든다. 열거형 값은 `0x` 접두사를 붙여 **16진수로도** 지정할 수 있다.

클래스·구조체의 필드도 `.field private string stringField = "hello!"` 처럼 기본값과 함께 쓸 수 있다. C#과 마찬가지로 클래스 필드는 적절한 기본값으로 자동 초기화된다.

CTS는 인스턴스 수준과 클래스 수준(정적) 생성자를 모두 지원한다. CIL에서 인스턴스 생성자는 **`.ctor`** 토큰, 정적 생성자는 **`.cctor`**(class constructor) 토큰으로 표현된다. 둘 다 `rtspecialname`(return type special name)과 `specialname` 특성으로 한정해야 한다.

```il
.class public MyBaseClass
{
  .field private string stringField
  .field private int32 intField
  .method public hidebysig specialname rtspecialname
    instance void .ctor(string s, int32 i) cil managed
  {
    // TODO: 구현 코드 추가...
  }
}
```

`.ctor` 디렉티브에 `instance` 특성이 붙어 있다(정적 생성자가 아니므로). `cil managed` 특성은 이 메서드 범위가 비관리 코드가 아니라 **CIL 코드**를 담고 있음을 나타낸다. 비관리 코드는 플랫폼 호출(P/Invoke)에서 쓰인다.

> **⚠️ C#에서는 생성자에 반환 타입이 없지만 IL에서는 `void`다**
>
> `specialname`과 `rtspecialname`은 "이 토큰은 특정 .NET 언어가 특별하게 취급할 수 있다"는 표시다. C#에서 생성자는 반환 타입을 적지 않지만, CIL 수준에서 생성자의 반환값은 **분명히 `void`** 이고, IL 시그니처에 그렇게 적혀 있다. 리플렉션으로 `ConstructorInfo`를 다룰 때 `ReturnType`이 없다고 당황하지 않으려면 알아둘 것.

### 매개변수 — `ref`, `out`, `class` 접두사

CIL에서 인수를 지정하는 방식은 C#과 거의 같다. 데이터 타입 다음에 매개변수 이름이 온다. 입력·출력·참조 전달 매개변수, 매개변수 배열(`params`), 선택적 매개변수까지 전부 표현할 수 있다.

```csharp
public static void MyMethod(int inputInt,
  ref int refInt, ArrayList ar, out int outputInt)
{
  outputInt = 0; // C# 컴파일러를 만족시키기 위해...
}
```

이걸 CIL로 옮기면 이렇게 된다.

```il
.method public hidebysig static void MyMethod(int32 inputInt,
  int32& refInt,
  class [System.Runtime.Extensions]System.Collections.ArrayList ar,
  [out] int32& outputInt) cil managed
{
  ...
}
```

읽는 법은 이렇다.

- **`ref` 매개변수**는 데이터 타입 뒤에 앰퍼샌드(`&`)를 붙인다 — `int32&`
- **`out` 매개변수**도 `&`를 쓰지만, 추가로 **`[out]` 토큰**으로 한정한다
- 매개변수가 **참조 타입**이면 데이터 타입 앞에 **`class` 토큰**을 붙인다 (`.class` 디렉티브와 혼동하지 말 것!)

> **⚠️ `ref`와 `out`은 IL에서 사실상 같다**
>
> `int32&`와 `[out] int32&`의 차이는 `[out]` 표시 하나뿐이고, 이건 **메타데이터의 매개변수 플래그**일 뿐 IL 명령에는 아무 영향이 없다. `out`의 "메서드가 반드시 대입해야 한다"는 규칙은 순전히 **C# 컴파일러의 확정 대입 분석**이 강제하는 것이지 CLR이 강제하는 게 아니다. 그래서 `ref`와 `out`만 다른 두 오버로드는 **정의할 수 없다** — IL 시그니처가 동일하기 때문이다. C# 컴파일러가 CS0663 오류로 막는다.
>
> ※C# 7.2의 `in` 매개변수도 IL에서는 `int32&` + `[System.Runtime.CompilerServices.IsReadOnlyAttribute]` 수정자다. `ref readonly`와 `in`도 IL 시그니처가 같아 오버로드 구분이 안 된다.

### 옵코드 분류

옵코드 전체 집합은 크다(ECMA-335 기준 200개 이상). 크게 세 갈래다.

- **프로그램 흐름을 제어하는** 옵코드
- **식을 평가하는** 옵코드
- **메모리의 값에 접근하는** 옵코드 (매개변수, 지역 변수 등)

실무에서 IL을 읽을 때 필요한 것들을 기능별로 정리한다.

**① 로드(스택에 푸시)**

| 옵코드 | 하는 일 |
|---|---|
| `ldarg`, `ldarg.0`~`ldarg.3`, `ldarg.s` | 메서드 인수를 스택에 로드. 숫자 접미사 형태는 인덱스를 하드코딩한다 |
| `ldarga`, `ldarga.s` | 인수의 **주소**를 로드 (관리 포인터) |
| `ldloc`, `ldloc.0`~`ldloc.3`, `ldloc.s` | 지역 변수의 값을 로드 |
| `ldloca`, `ldloca.s` | 지역 변수의 **주소**를 로드 |
| `ldfld`, `ldflda` | 인스턴스 필드의 값 / 주소를 로드 |
| `ldsfld`, `ldsflda` | 정적 필드의 값 / 주소를 로드 |
| `ldc.i4`, `ldc.i4.0`~`ldc.i4.8`, `ldc.i4.m1`, `ldc.i4.s`, `ldc.i8`, `ldc.r4`, `ldc.r8` | 상수를 로드 |
| `ldstr` | 문자열 리터럴을 로드 (메타데이터 `#US` 힙에서) |
| `ldnull` | null 참조를 로드 |
| `ldobj` | 지정한 주소의 값 타입 전체를 스택으로 복사 |
| `ldtoken` | 메타데이터 토큰(타입/메서드/필드 핸들)을 로드 |
| `ldftn`, `ldvirtftn` | 메서드의 함수 포인터를 로드 (델리게이트 생성에 쓴다) |
| `ldlen` | 배열 길이를 로드 |
| `ldelem.<타입>`, `ldelem`, `ldelema` | 배열 요소의 값 / 주소를 로드 |
| `dup` | 스택 맨 위 값을 복제 |

**② 저장(스택에서 팝)**

| 옵코드 | 하는 일 |
|---|---|
| `pop` | 스택 맨 위 값을 제거만 하고 저장하지 않는다 |
| `starg`, `starg.s` | 스택 맨 위 값을 지정 인덱스의 메서드 인수에 저장 |
| `stloc`, `stloc.0`~`stloc.3`, `stloc.s` | 스택 맨 위 값을 팝해 지정 인덱스의 지역 변수에 저장 |
| `stfld` | 인스턴스 필드에 저장 |
| `stsfld` | 정적 필드의 값을 스택 값으로 대체 |
| `stobj` | 지정 타입의 값을 스택에서 지정 메모리 주소로 복사 |
| `stelem.<타입>`, `stelem` | 배열 요소에 저장 |
| `initobj` | 값 타입 주소를 받아 그 자리를 0/null로 초기화 |

**③ 산술·비트·비교**

| 옵코드 | 하는 일 |
|---|---|
| `add`, `sub`, `mul`, `div`, `rem` | 사칙연산. `rem`은 나머지 |
| `add.ovf`, `sub.ovf`, `mul.ovf` (+`.un` 변형) | 오버플로 검사 버전. `checked` 컨텍스트가 만든다 |
| `div.un`, `rem.un` | 부호 없는 나눗셈·나머지 |
| `neg` | 부호 반전 |
| `and`, `or`, `xor`, `not` | 비트 연산 |
| `shl`, `shr`, `shr.un` | 비트 시프트 (`shr.un`은 논리 시프트) |
| `ceq`, `cgt`, `clt`, `cgt.un`, `clt.un` | 두 값 비교. 결과로 0 또는 1을 **푸시한다** |

`ceq`는 같으면 1, `cgt`는 크면 1, `clt`는 작으면 1을 스택에 남긴다.

**④ 분기**

| 옵코드 | 하는 일 |
|---|---|
| `br`, `br.s` | 무조건 분기 |
| `brtrue`, `brtrue.s` / `brfalse`, `brfalse.s` | 스택 값이 0이 아니면 / 0이면 분기 |
| `beq`, `bne.un` | 같으면 / 다르면 분기 |
| `bgt`, `bge`, `blt`, `ble` (+`.un`, `.s` 변형) | 크면 / 크거나 같으면 / 작으면 / 작거나 같으면 분기 |
| `switch` | 점프 테이블. 정수 인덱스로 여러 대상 중 하나로 분기 |
| `leave`, `leave.s` | **보호된 블록(try/catch/finally)에서 빠져나가는** 특수 분기 |
| `ret` | 메서드 종료. 필요하면 값을 반환 |

모든 분기 옵코드는 조건이 참일 때 점프할 **코드 레이블**을 요구한다. `.s` 접미사는 short form으로, 대상 오프셋을 1바이트 부호 있는 정수로 인코딩한다(−128~127 범위). 범위를 벗어나면 4바이트짜리 long form을 쓴다.

**⑤ 호출**

| 옵코드 | 하는 일 |
|---|---|
| `call` | 정적 결합 호출. 정적 메서드, 비가상 메서드, 봉인된 것이 확실한 호출 |
| `callvirt` | **가상 디스패치** 호출. `MethodTable`의 슬롯을 거친다 (54.1절) |
| `calli` | 함수 포인터를 통한 간접 호출 |
| `newobj` | 새 객체를 힙에 할당하고 생성자를 호출 |
| `constrained.` | 접두사. 제약된 제네릭/값 타입에 대한 `callvirt`를 박싱 없이 처리 |
| `tail.` | 접두사. 꼬리 호출 요청 |
| `jmp` | 현재 메서드를 버리고 다른 메서드로 점프. 실무에서 거의 안 보인다 |

**⑥ 객체·타입**

| 옵코드 | 하는 일 |
|---|---|
| `newobj` | 객체 할당 + 생성자 호출 |
| `castclass` | 참조 형변환. 실패하면 `InvalidCastException` |
| `isinst` | 타입 검사. 성공하면 참조, 실패하면 **null**을 푸시 (예외 없음) |
| `box` | 값을 팝해 힙에 박싱 인스턴스를 만들고 그 참조를 푸시 (54.6절) |
| `unbox` | 박싱 인스턴스 참조를 팝하고 **그 안의 데이터를 가리키는 관리 포인터**를 푸시. 복사하지 않는다 |
| `unbox.any` | `unbox` + `ldobj`. 값 자체를 푸시한다. C# 컴파일러가 방출하는 것은 이쪽이다 |
| `sizeof` | 값 타입의 크기를 푸시 |
| `initobj` | 값 타입 위치를 기본값으로 초기화 |
| `cpobj` | 값 타입을 한 주소에서 다른 주소로 복사 |
| `ldtoken` | 타입/멤버 핸들 로드. `typeof()`가 이걸 쓴다 |

**⑦ 배열**

| 옵코드 | 하는 일 |
|---|---|
| `newarr <타입>` | 지정 타입의 1차원 배열을 할당 |
| `ldlen` | 배열 길이(`native uint`)를 푸시 |
| `ldelem.i4`, `ldelem.ref`, `ldelem.r8`, … | 요소 로드 (타입별 변형) |
| `ldelem <타입>` | 제네릭 요소 로드 |
| `ldelema <타입>` | 요소의 **주소**를 로드 |
| `stelem.i4`, `stelem.ref`, … / `stelem <타입>` | 요소 저장 |

**⑧ 변환**

| 옵코드 | 하는 일 |
|---|---|
| `conv.i1`, `conv.i2`, `conv.i4`, `conv.i8` | 부호 있는 정수로 변환 (자르기) |
| `conv.u1`, `conv.u2`, `conv.u4`, `conv.u8` | 부호 없는 정수로 변환 |
| `conv.r4`, `conv.r8` | 부동소수점으로 변환 |
| `conv.i`, `conv.u` | `native int` / `native uint`로 변환 |
| `conv.ovf.*` (+`.un`) | 오버플로 검사 변환. `checked` 캐스트가 만든다 |
| `conv.r.un` | 부호 없는 정수를 부동소수점으로 |

**⑨ 예외 처리**

| 옵코드 / 절 | 하는 일 |
|---|---|
| `.try { } catch <타입> { }` | 보호된 블록과 처리기 |
| `.try { } finally { }` | 보호된 블록과 종료 처리기 |
| `.try { } filter { } { }` | 필터가 붙은 처리기 (C#의 `when`) |
| `.try { } fault { }` | 예외로 빠져나갈 때만 실행되는 처리기. **C#에는 대응 문법이 없다** |
| `throw` | 스택 위 예외 객체를 던진다 |
| `rethrow` | catch 블록 안에서 현재 예외를 다시 던진다 (C#의 인수 없는 `throw;`) |
| `leave`, `leave.s` | 보호 블록을 정상적으로 벗어난다. **평가 스택을 비운다** |
| `endfinally` | finally/fault 블록의 끝 |
| `endfilter` | filter 블록의 끝. 스택 값 1이면 처리기 실행, 0이면 통과 |

> **⚠️ `br`로 `try` 블록을 벗어나면 안 된다 — `leave`를 써야 한다**
>
> `try`/`catch`/`finally` 블록 밖으로 나가는 분기는 반드시 `leave`(또는 `leave.s`)여야 한다. 일반 `br`을 쓰면 IL이 무효가 되어 `InvalidProgramException`이 난다. `leave`는 두 가지 부수 효과를 가진다.
>
> 1. 평가 스택을 **완전히 비운다**
> 2. 사이에 있는 `finally` 블록들을 **순서대로 실행**하게 만든다
>
> `try` 안에서 값을 계산해 `try` 밖에서 쓰려면 반드시 **지역 변수에 저장**해야 한다. 이것이 C#에서 `try` 블록 안의 지역 변수 범위가 그 블록에 갇히는 이유이고, `try { return x; }` 형태가 IL에서는 "지역 변수에 저장 → `leave` → 블록 밖에서 `ldloc` → `ret`"으로 풀리는 이유다.

**⑩ 접두사와 기타**

| 옵코드 | 하는 일 |
|---|---|
| `nop` / `break` | 아무것도 안 함(Debug 중단점 자리) / 디버거 중단 트리거 |
| `volatile.` / `unaligned.` / `readonly.` | 접두사. 휘발성 접근 / 정렬 미보장 / 읽기 전용 `ldelema` |
| `localloc` | 스택에 메모리 할당 (C#의 `stackalloc`) |
| `initblk`, `cpblk` | 메모리 블록 초기화 / 복사 |
| `arglist`, `ckfinite` | 가변 인수 핸들(`__arglist`) / 부동소수점 유한성 검사 |

> **📌 `ldarg`와 `ldc`를 헷갈리지 마라**
>
> 일부 문헌이 `ldarg` 계열에 타입/값을 하드코딩한 변형이 있는 것처럼 설명하지만, **정확하지 않다.** 정리하면 이렇다.
>
> - `ldarg.0`, `ldarg.1`, `ldarg.2`, `ldarg.3` — 인덱스 하드코딩. `ldarg.s <n>`은 1바이트 인덱스, `ldarg <n>`은 2바이트 인덱스.
> - `ldc.i4.0` ~ `ldc.i4.8`, `ldc.i4.m1` — **상수** 하드코딩. `ldc.i4.5`는 정수 5를 푸시한다.
> - `ldc.i4.s <n>` — 1바이트 부호 있는 상수. `ldc.i4 <n>` — 4바이트 상수.
>
> 즉 `ldc.i4.5`는 있지만 `ldarg.i4.5` 같은 옵코드는 **존재하지 않는다.** IL을 읽을 때 `ldarg`는 "인수 몇 번", `ldc`는 "상수 얼마"로 읽으면 된다.

---

## 56.4 BCL / C# / CIL 데이터 타입 대응표

IL을 읽을 때 가장 자주 참조하게 되는 표다. .NET 기본 클래스 타입이 C# 키워드로, C# 키워드가 다시 CIL 표기로 어떻게 매핑되는지, 그리고 각 CIL 타입의 **상수 표기(constant notation)** 가 무엇인지 정리한다. 이 상수 표기는 수많은 옵코드 접미사에서 다시 등장한다.

| .NET 기본 클래스 타입 | C# 키워드 | CIL 표현 | CIL 상수 표기 |
|---|---|---|---|
| `System.SByte` | `sbyte` | `int8` | `I1` |
| `System.Byte` | `byte` | `unsigned int8` | `U1` |
| `System.Int16` | `short` | `int16` | `I2` |
| `System.UInt16` | `ushort` | `unsigned int16` | `U2` |
| `System.Int32` | `int` | `int32` | `I4` |
| `System.UInt32` | `uint` | `unsigned int32` | `U4` |
| `System.Int64` | `long` | `int64` | `I8` |
| `System.UInt64` | `ulong` | `unsigned int64` | `U8` |
| `System.Char` | `char` | `char` | `CHAR` |
| `System.Single` | `float` | `float32` | `R4` |
| `System.Double` | `double` | `float64` | `R8` |
| `System.Boolean` | `bool` | `bool` | `BOOLEAN` |
| `System.String` | `string` | `string` | 해당 없음 |
| `System.Object` | `object` | `object` | 해당 없음 |
| `System.Void` | `void` | `void` | `VOID` |

`System.IntPtr`과 `System.UIntPtr`은 각각 `native int`와 `native unsigned int`로 매핑된다. COM 상호 운용과 P/Invoke 시나리오에서 대량으로 등장한다.

### 상수 표기가 옵코드에 나타나는 방식

위 표의 상수 표기(`I4`, `R8` 등)를 소문자로 바꾸면 그대로 옵코드 접미사가 된다.

```text
   I4   →  ldc.i4    stelem.i4    conv.i4    ldind.i4
   I8   →  ldc.i8    stelem.i8    conv.i8    ldind.i8
   R4   →  ldc.r4    stelem.r4    conv.r4    ldind.r4
   R8   →  ldc.r8    stelem.r8    conv.r8    ldind.r8
   U1   →  ldelem.u1              conv.u1    ldind.u1
   REF  →  ldelem.ref  stelem.ref              ldind.ref
```

`ldelem.ref`/`stelem.ref`의 `ref`는 "참조 타입 요소"를 뜻하며 `object[]`, `string[]` 같은 배열의 요소 접근에 쓰인다.

대응이 완전히 대칭은 아니다. **저장 쪽에는 부호 없는 변형이 없다** — `stelem.u1`이나 `stind.u1` 같은 옵코드는 존재하지 않으며, `byte[]`에도 `stelem.i1`을 쓴다. 저장은 비트 패턴을 그대로 쓰는 일이라 부호 해석이 필요 없기 때문이다. 반대로 로드 쪽에는 `ldelem.u1`/`ldind.u1`이 있다 — 1바이트를 32비트로 늘릴 때 부호 확장을 할지 0 확장을 할지 정해야 하기 때문이다(부록 A.2).

> **⚠️ IL의 평가 스택에는 `bool`, `char`, `byte`가 없다**
>
> 이게 IL을 읽을 때 자주 걸려 넘어지는 지점이다. **평가 스택 위의 값은 다음 여섯 종류뿐이다.**
>
> | 스택 타입 | 크기 | 어떤 C# 타입이 여기 올라가나 |
> |---|---|---|
> | `int32` | 4바이트 | `bool`, `char`, `sbyte`, `byte`, `short`, `ushort`, `int`, `uint`, 모든 열거형 |
> | `int64` | 8바이트 | `long`, `ulong` |
> | `native int` | 플랫폼 | `IntPtr`, `UIntPtr`, 비관리 포인터 |
> | `F`(부동소수점) | 구현 정의 | `float`, `double` |
> | `O`(객체 참조) | 참조 | 모든 참조 타입 |
> | `&`(관리 포인터) | 참조 | `ref`/`out`/`in` 매개변수, `ldloca`/`ldflda` 결과 |
>
> 즉 `bool b = true;`는 IL에서 `ldc.i4.1`이다. `byte`끼리 더하면 스택에서는 `int32` 덧셈이 일어나고, `byte` 변수에 다시 저장할 때 `conv.u1`로 잘라낸다. C#의 `byte a = b + c;`가 컴파일 오류인 이유(`int`로 승격되므로 명시적 캐스트가 필요)가 IL 수준에서 이렇게 드러난다.
>
> 열거형도 마찬가지다. 열거형 값끼리의 비교는 `ceq`로, 기반 타입이 `int`인 열거형 값은 `ldc.i4`로 로드된다. IL 리스팅에 열거형 이름이 안 보이고 숫자만 보이는 이유가 이것이다.

---

## 56.5 CIL로 타입 멤버 정의하기

앞 절들에서 본 디렉티브를 조합해 실제로 동작하는 타입을 만들어본다. 이 절의 목적은 CIL로 개발하는 법을 익히는 것이 **아니라**, `ildasm` 출력에서 각 조각이 어디서 왔는지 알아보는 눈을 기르는 것이다.

### 프로퍼티

프로퍼티는 **CIL에 존재하지 않는다.** 정확히는, CIL 수준에서 프로퍼티는 `get_` 및 `set_` 접두사를 가진 **메서드 한 쌍**이고, `.property` 디렉티브는 그 둘을 묶어주는 메타데이터일 뿐이다.

```il
.class public MyBaseClass
{
...
  .method public hidebysig specialname
    instance string get_TheString() cil managed
  {
    // TODO: 구현 코드 추가...
  }
  .method public hidebysig specialname
    instance void set_TheString(string 'value') cil managed
  {
    // TODO: 구현 코드 추가...
  }
  .property instance string TheString()
  {
    .get instance string
      MyNamespace.MyBaseClass::get_TheString()
    .set instance void
      MyNamespace.MyBaseClass::set_TheString(string)
  }
}
```

`.property` 디렉티브는 관련된 `.get`과 `.set` 디렉티브를 통해 프로퍼티 구문을 올바른 "특별한 이름을 가진" 메서드에 매핑한다. 두 접근자 메서드에는 `specialname` 특성이 붙어 있다.

> **📌 `'value'`가 따옴표에 싸인 이유**
>
> `set` 메서드의 들어오는 매개변수가 작은따옴표에 싸여 있다. CIL에서 `value`는 예약된 의미를 가질 수 있는 토큰이므로, 이스케이프해서 **식별자로** 쓴다는 표시다. CIL은 이런 식으로 어떤 문자열이든 따옴표로 감싸 식별자로 만들 수 있다. C# 컴파일러가 생성하는 `<>c__DisplayClass0_0` 같은 "발음할 수 없는 이름"이 IL에서 `'<>c__DisplayClass0_0'`으로 나타나는 것도 같은 메커니즘이다.

실무적 함의는 셋이다. ① 인터페이스에 프로퍼티를 추가하면 **메서드 두 개**가 추가되는 것과 같아 바이너리 호환성 계산이 달라진다. ② 리플렉션의 `Type.GetMethods()`는 `get_X`, `set_X`를 **포함해서** 돌려주며 이들은 `IsSpecialName`이 `true`다. ③ 프로퍼티 `TheString`이 있는 타입에 `get_TheString()` 메서드를 직접 정의하면 이름이 이미 예약되어 CS0082 오류가 난다.

### 이벤트

이벤트도 같은 패턴이다. `add_` / `remove_` 접두사를 가진 메서드 쌍과 이를 묶는 `.event` 디렉티브다. 필드형 이벤트(field-like event)라면 델리게이트를 담는 `private` 필드도 함께 생긴다.

```il
.field private class [System.Runtime]System.EventHandler Changed
.method public hidebysig specialname instance void
        add_Changed(class [System.Runtime]System.EventHandler 'value') cil managed
{ ... }
.method public hidebysig specialname instance void
        remove_Changed(class [System.Runtime]System.EventHandler 'value') cil managed
{ ... }
.event [System.Runtime]System.EventHandler Changed
{
  .addon instance void Counter::add_Changed(class [System.Runtime]System.EventHandler)
  .removeon instance void Counter::remove_Changed(class [System.Runtime]System.EventHandler)
}
```

`.addon`과 `.removeon`이 프로퍼티의 `.get`/`.set`에 해당한다. 접근자의 실제 구현은 56.6절에서 본다.

### 필드가 있는 클래스 한 벌 만들기

여기까지를 모아 완전한 `.il` 파일을 만들어본다. 빌드에 필요한 `global.json`과 `.ilproj`는 56.7절에서 다룬다.

`CILTypes.il`:

```il
// ① 외부 참조 어셈블리 선언
.assembly extern System.Runtime
{
  .publickeytoken = (B0 3F 5F 7F 11 D5 0A 3A )
  .ver 6:0:0:0
}
.assembly extern System.Console
{
  .publickeytoken = (B0 3F 5F 7F 11 D5 0A 3A )
  .ver 6:0:0:0
}
// ② 현재 어셈블리 정의 ③ 단일 파일 어셈블리의 모듈
.assembly CILTypes { .ver 1:0:0:0 }
.module CILTypes.dll

// ④ 네임스페이스와 타입
.namespace MyNamespace
{
  .class public interface IMyInterface {}

  .class public MyBaseClass
    extends [System.Runtime]System.Object
  {
    .field private string stringField
    .field private int32 intField

    .method public hidebysig specialname rtspecialname
      instance void .ctor(string s, int32 i) cil managed
    {
      .maxstack 2
      ldarg.0
      call instance void [System.Runtime]System.Object::.ctor()  // 암묵적 base()
      ldarg.0
      ldarg.1
      stfld string MyNamespace.MyBaseClass::stringField
      ldarg.0
      ldarg.2
      stfld int32 MyNamespace.MyBaseClass::intField
      ret
    }

    .method public hidebysig instance void Speak() cil managed
    {
      .maxstack 1
      ldarg.0
      ldfld string MyNamespace.MyBaseClass::stringField
      call void [System.Console]System.Console::WriteLine(string)
      ret
    }
  }

  .class public sealed value MyStruct {}

  .class public sealed enum MyEnum
  {
    .field public specialname rtspecialname int32 value__
    .field public static literal valuetype MyNamespace.MyEnum A = int32(0)
    .field public static literal valuetype MyNamespace.MyEnum B = int32(1)
  }

  .class public MyDerivedClass
    extends MyNamespace.MyBaseClass
    implements MyNamespace.IMyInterface {}
}
```

빌드는 평범하다.

```text
dotnet build
```

읽을 때 짚어야 할 곳은 다음과 같다.

- 생성자의 첫 두 줄 `ldarg.0` + `call instance void System.Object::.ctor()`은 C#의 암묵적인 `base()` 호출이다. **이걸 빼먹으면 IL이 무효**가 된다. 객체가 초기화되지 않은 것으로 간주된다.
- 파생 클래스 생성자는 `System.Object`가 아니라 **직계 기반 클래스**의 생성자를 부른다.
- `stfld`는 스택에서 **두 개**를 팝한다 — 객체 참조와 값. 그래서 `ldarg.0`(this)을 먼저 밀고 값을 밀었다.
- `enum`의 이름-값 쌍은 전부 `static literal` 필드다. 이 필드들은 실제 저장 공간을 차지하지 않고 메타데이터의 상수로만 존재한다. 예외가 첫 줄의 `value__` 인스턴스 필드다.

> **⚠️ 열거형에는 보이지 않는 인스턴스 필드가 하나 더 있다**
>
> 열거형에는 `.field public specialname rtspecialname int32 value__` 라는 인스턴스 필드가 하나 더 있다(위 `CILTypes.il`의 `MyEnum` 첫 줄). 이것이 열거형 값의 **실제 저장 공간**이며, 그 타입이 곧 열거형의 기반 타입(`int32`, `int64` 등)이다. 앞선 56.3절의 `MyEnum` 예제는 원천 문헌을 따라 이름-값 쌍만 보였지만, CIL을 직접 써서 빌드할 때 `value__`를 빠뜨리면 열거형이 제대로 동작하지 않는다. 실전에서 `ildasm` 출력을 보면 항상 이 필드가 첫 줄에 있다.

> **💡 CIL로 타입을 직접 쓰는 것은 학습용이다**
>
> 실무에서 `.ilproj`를 쓰는 경우는 사실상 없다 — 런타임 팀이 `System.Private.CoreLib`의 저수준 메서드를 IL로 쓰는 정도가 예외다. 이 절의 목적은 `ildasm` 출력에서 각 디렉티브의 역할을 즉시 알아보는 것이다. IL을 실제로 **생성**해야 한다면 58장의 `ILGenerator`나 `DynamicMethod`를 쓰는 편이 옳다 — 문법 오류를 컴파일러가 잡아주고 `.maxstack`도 대신 계산해준다.

---

## 56.6 C# 문법 → IL 매핑 (프로퍼티, 이벤트, 클로저, `foreach`, `using`, `lock`, `async`)

이 절이 이 장의 심장이다. C# 문법 하나하나가 어떤 IL로 내려앉는지 본다. 이 매핑을 외울 필요는 없다. **IL 리스팅에서 특정 패턴을 보고 "아, 이건 원래 `foreach`였구나"라고 역추적하는 능력**을 기르는 것이 목표다.

먼저 랜드마크 표를 둔다. IL을 읽을 때 다음 신호를 찾으면 원래 C# 문법이 무엇이었는지 대부분 알 수 있다.

| IL에서 보이는 것 | 원래 C# 문법 |
|---|---|
| `get_X` / `set_X` + `.property` | 프로퍼티 |
| `<X>k__BackingField` | 자동 구현 프로퍼티 |
| `add_X` / `remove_X` + `.event` + `Interlocked::CompareExchange` | 필드형 이벤트 |
| `<>c__DisplayClassN_M` 타입 + `newobj` + `stfld` | 변수를 캡처하는 람다/지역 함수 |
| `<>c` 싱글턴 + `<>9__N_M` 필드 + `dup`/`brtrue.s` | 캡처하지 않는 람다 (캐시된 델리게이트) |
| ``ldftn``(가상 대상이면 ``dup`` + ``ldvirtftn``) + ``newobj ... D::.ctor(object, native int)`` | 델리게이트 생성 |
| `GetEnumerator` + `MoveNext` + `get_Current` + `.try`/`finally` | `foreach` |
| `ldlen` + `conv.i4` + `ldelem` + `blt` | 배열에 대한 `foreach` (for로 최적화됨) |
| `.try`/`finally` + `brfalse` + `callvirt IDisposable::Dispose()` | `using` |
| `Monitor::Enter(object, bool&)` + `.try`/`finally` + `Monitor::Exit` | `lock` |
| `DefaultInterpolatedStringHandler` 또는 `String::Concat`/`String::Format` | 문자열 보간 |
| `switch (IL_x, IL_y, IL_z)` | 밀집된 정수 `switch` |
| `ComputeStringHash` + `switch` | 문자열 `switch` (케이스가 많을 때) |
| `<M>d__N` 타입 + `MoveNext` + `AsyncTaskMethodBuilder` | `async` 메서드 |
| `<M>d__N` 타입 + `MoveNext` + `IEnumerator<T>` 구현 | 반복자(`yield`) 메서드 |
| `ldtoken` + `Type::GetTypeFromHandle` | `typeof(X)` |
| `isinst` + `brfalse` | `is` 패턴 / `as` |
| `box` / `unbox.any` | 값 타입 ↔ `object`/인터페이스 변환 (54.6절) |

### 반복 구문 — `for`

C#의 반복 구문(`for`, `foreach`, `while`, `do`)은 각각 고유한 IL 표현을 갖는다. 가장 단순한 `for`부터 본다.

```csharp
public static void CountToTen()
{
    for (int i = 0; i < 10; i++)
    {
    }
}
```

`br` 계열 옵코드가 조건이 충족되면 흐름을 끊는다. 여기서는 `i`가 10 이상이 되면 루프를 벗어나야 한다. 분기 옵코드를 쓸 때는 조건이 참일 때 점프할 코드 레이블을 정의해야 한다.

```il
.method public hidebysig static void CountToTen() cil managed
{
  .maxstack 2
  .locals init (int32 V_0, bool V_1)
  IL_0000: ldc.i4.0        // 0을 스택에 로드
  IL_0001: stloc.0         // 인덱스 0에 저장 (i = 0)
  IL_0002: br.s IL_0008    // 조건 검사로 점프
  IL_0004: ldloc.0         // i를 로드
  IL_0005: ldc.i4.1        // 1을 로드
  IL_0006: add             // i + 1
  IL_0007: stloc.0         // i에 저장 (i++)
  IL_0008: ldloc.0         // i를 로드
  IL_0009: ldc.i4.s 10     // 10을 로드
  IL_000b: clt             // i < 10 이면 1, 아니면 0을 푸시
  IL_000d: stloc.1         // 결과를 V_1에 저장
  IL_000e: ldloc.1         // V_1을 로드
  IL_000f: brtrue.s IL_0004 // 참이면 본문(증가부)로 점프
  IL_0011: ret
}
```

구조를 그림으로 보면 이렇다.

```text
      초기화                    ┌───────────────────────┐
   ldc.i4.0 / stloc.0           │                       │
          │                     ▼                       │
          │              IL_0004: 본문 + i++             │
          │                     │                       │
          └────► br.s ─────►  IL_0008: 조건 검사          │
                               i < 10 ?                  │
                                 │                       │
                          참 ────┴───► brtrue.s ─────────┘
                          거짓 ──────► IL_0011: ret
```

핵심은 **조건 검사가 루프 아래쪽에 배치된다**는 것이다. 처음 한 번만 `br.s`로 조건부로 뛰어들고, 이후에는 본문 실행 → 조건 검사 → 참이면 본문으로 되돌아가는 구조다. 이 배치를 쓰면 반복마다 필요한 분기가 **하나**뿐이다(조건 검사 실패 시 자연스럽게 아래로 흘러 나간다). 조건을 위에 두면 반복마다 조건 분기 하나 + 무조건 분기 하나로 **둘**이 된다. JIT과 CPU 분기 예측기 모두에게 유리한 형태다.

> **⚠️ `V_1`(bool 임시 변수)은 Debug 빌드의 흔적이다**
>
> 위 리스팅의 `stloc.1` / `ldloc.1`은 조건 검사 결과를 잠시 지역 변수에 담았다가 다시 꺼내는 무의미한 왕복이다. 디버거에서 조건 표현식의 값을 볼 수 있게 하려는 Debug 빌드의 산물이다. Release 빌드에서는 사라지고 `clt` 결과가 바로 `brtrue.s`로 흐르며, 컴파일러가 `clt` + `brtrue.s`를 **`blt.s` 하나로 합친다.**
>
> ```il
> IL_0008: ldloc.0
> IL_0009: ldc.i4.s 10
> IL_000b: blt.s IL_0004
> ```
>
> 즉 같은 C# 코드가 Debug에서는 IL 18바이트(`ret`이 `IL_0011`), Release에서는 14바이트로 줄어든다. **IL 크기를 비교할 때 반드시 Release로 빌드하라.**

### `switch` 점프 테이블

`switch`는 케이스 분포에 따라 컴파일러가 **세 가지 전혀 다른 코드**를 만든다.

**① 밀집된 정수 케이스 → `switch` 옵코드(점프 테이블)**

```csharp
static string Dense(int x) => x switch
{
    0 => "zero",
    1 => "one",
    2 => "two",
    3 => "three",
    _ => "other"
};
```

```il
.method private hidebysig static string Dense(int32 x) cil managed
{
  .maxstack  8
  IL_0000:  ldarg.0
  IL_0001:  switch     ( IL_0018, IL_001e, IL_0024, IL_002a )
  IL_0016:  br.s       IL_0030
  IL_0018:  ldstr      "zero"
  IL_001d:  ret
  IL_001e:  ldstr      "one"
  IL_0023:  ret
  IL_0024:  ldstr      "two"
  IL_0029:  ret
  IL_002a:  ldstr      "three"
  IL_002f:  ret
  IL_0030:  ldstr      "other"
  IL_0035:  ret
}
```

`switch` 옵코드는 스택에서 부호 없는 정수 하나를 팝하고, 그 값을 인덱스로 삼아 **대상 목록에서 하나를 골라 점프**한다. 값이 목록 범위를 벗어나면 아무 일도 하지 않고 다음 명령으로 흘러간다 — 그래서 바로 뒤에 `br.s IL_0030`(default로 가는 분기)이 있다. JIT은 이걸 실제 점프 테이블(주소 배열 + 간접 점프)로 컴파일하므로 **케이스 개수와 무관하게 O(1)** 이다.

**② 희소한 정수 케이스 → 이진 탐색**

케이스 값이 `1, 100, 10000`처럼 흩어져 있으면 10000칸짜리 점프 테이블을 만들 수 없다. 컴파일러는 `bgt`/`blt` 연쇄로 **이진 탐색 트리**를 만든다. 실행 시간은 O(log n)이 되고, IL에 `switch` 옵코드는 나타나지 않는다.

**③ 문자열 케이스 → 해시 + `switch` 또는 연쇄 비교**

케이스가 적으면(대체로 6개 이하) `string.op_Equality` 연쇄 호출이다. 많아지면 컴파일러가 `<PrivateImplementationDetails>` 클래스에 `ComputeStringHash(string)` 메서드를 생성하고, 해시값으로 `switch`한 뒤 각 후보에서 실제 문자열 비교를 한다.

```il
IL_0001:  call       uint32 '<PrivateImplementationDetails>'::ComputeStringHash(string)
IL_0006:  stloc.1
IL_0007:  ldloc.1
IL_0008:  ldc.i4     0xc9d6816e
IL_000d:  bgt.un.s   IL_0028      // 해시로 이진 탐색 → switch → 실제 문자열 비교
...
IL_0051:  ldstr      "alpha"
IL_0056:  call       bool [System.Runtime]System.String::op_Equality(string, string)
IL_005b:  brtrue.s   IL_0080
```

> **⚠️ `<PrivateImplementationDetails>`는 어셈블리마다 하나씩 몰래 생긴다**
>
> IL을 뜯다가 `<PrivateImplementationDetails>`라는 이름의 클래스를 만나면 컴파일러가 만든 것이다. 여기에는 문자열 해시 함수뿐 아니라 **배열 초기화 데이터**(`int[] a = {1,2,3,...}`가 `RuntimeHelpers.InitializeArray`로 컴파일될 때의 원본 바이트), `ReadOnlySpan<byte>` 리터럴의 데이터 등이 들어간다. 이 타입은 C#에서 참조할 수 없고, 트리밍 도구가 어떻게 다루는지가 가끔 문제가 된다.

### 프로퍼티 — 자동 구현 프로퍼티의 실체

```csharp
public class Person
{
    public string Name { get; set; }
}
```

```il
.class public auto ansi beforefieldinit Person
       extends [System.Runtime]System.Object
{
  .field private string '<Name>k__BackingField'
  .custom instance void [System.Runtime]System.Runtime.CompilerServices
          .CompilerGeneratedAttribute::.ctor() = ( 01 00 00 00 )

  .method public hidebysig specialname instance string get_Name() cil managed
  {
    .custom instance void ...CompilerGeneratedAttribute::.ctor() = ( 01 00 00 00 )
    .maxstack  8
    IL_0000:  ldarg.0
    IL_0001:  ldfld      string Person::'<Name>k__BackingField'
    IL_0006:  ret
  }

  .method public hidebysig specialname instance void set_Name(string 'value') cil managed
  {
    .custom instance void ...CompilerGeneratedAttribute::.ctor() = ( 01 00 00 00 )
    .maxstack  8
    IL_0000:  ldarg.0
    IL_0001:  ldarg.1
    IL_0002:  stfld      string Person::'<Name>k__BackingField'
    IL_0007:  ret
  }

  .property instance string Name()
  {
    .get instance string Person::get_Name()
    .set instance void Person::set_Name(string)
  }
}
```

읽는 법.

- `<Name>k__BackingField` — 자동 구현 프로퍼티의 백킹 필드. `<` `>`가 들어간 이름은 C#에서 만들 수 없으므로 충돌이 불가능하다.
- `[CompilerGenerated]` 특성이 필드와 두 접근자 모두에 붙는다. 디컴파일러는 이 표시를 보고 자동 프로퍼티로 되돌린다.
- `get_Name`은 `ldarg.0`(this) → `ldfld` → `ret`. 세 줄이다. JIT은 이런 메서드를 거의 항상 인라인한다(55.4절). **"프로퍼티가 필드보다 느리다"는 말은 인라이닝 전인 Tier-0에서만 참이고, Tier-1 코드에서는 같은 `mov` 한 줄로 남는다**(부록 A.3).
- `set_Name`은 `ldarg.0`(this) + `ldarg.1`(value) → `stfld`. `stfld`가 둘을 팝한다.

`init` 접근자(※C# 9)는 `set_Name`과 IL이 동일하고, 반환 타입에 `modreq(System.Runtime.CompilerServices.IsExternalInit)` 수정자가 붙는 것만 다르다.

```il
.method public hidebysig specialname instance void modreq([System.Runtime]
        System.Runtime.CompilerServices.IsExternalInit) set_Name(string 'value') cil managed
```

> **⚠️ `init`은 CLR이 강제하는 것이 아니다**
>
> `modreq(IsExternalInit)`는 **required modifier**로, 이 시그니처를 이해하지 못하는 컴파일러가 호출을 못 하게 막는 장치다. CLR 자체는 `init` 접근자를 일반 setter와 똑같이 취급한다. 즉 리플렉션으로 `SetValue`를 호출하면 **초기화 이후에도 `init` 프로퍼티를 바꿀 수 있다.** 불변성은 C# 컴파일러가 지키는 규약이지 런타임 불변식이 아니다. `readonly` 필드도 마찬가지다.

### 이벤트 — `Interlocked.CompareExchange` 루프

```csharp
public class Counter
{
    public event EventHandler Changed;
}
```

`add_Changed`의 IL이 놀랄 만큼 복잡하다.

```il
.method public hidebysig specialname instance void
        add_Changed(class [System.Runtime]System.EventHandler 'value') cil managed
{
  .custom instance void ...CompilerGeneratedAttribute::.ctor() = ( 01 00 00 00 )
  .maxstack  3
  .locals init (class [System.Runtime]System.EventHandler V_0,
                class [System.Runtime]System.EventHandler V_1,
                class [System.Runtime]System.EventHandler V_2)
  IL_0000:  ldarg.0
  IL_0001:  ldfld      class [System.Runtime]System.EventHandler Counter::Changed
  IL_0006:  stloc.0                              // V_0 = 현재 값
  IL_0007:  ldloc.0
  IL_0008:  stloc.1                              // V_1 = 비교용 스냅숏  ◄── 재시도 지점
  IL_0009:  ldloc.1
  IL_000a:  ldarg.1
  IL_000b:  call       class [System.Runtime]System.Delegate
                       [System.Runtime]System.Delegate::Combine(
                         class [System.Runtime]System.Delegate,
                         class [System.Runtime]System.Delegate)
  IL_0010:  castclass  [System.Runtime]System.EventHandler
  IL_0015:  stloc.2                              // V_2 = 합쳐진 새 델리게이트
  IL_0016:  ldarg.0
  IL_0017:  ldflda     class [System.Runtime]System.EventHandler Counter::Changed
  IL_001c:  ldloc.2
  IL_001d:  ldloc.1
  IL_001e:  call       !!0 [System.Runtime]System.Threading.Interlocked::
                       CompareExchange<class [System.Runtime]System.EventHandler>(
                         !!0&, !!0, !!0)
  IL_0023:  stloc.0
  IL_0024:  ldloc.0
  IL_0025:  ldloc.1
  IL_0026:  bne.un.s   IL_0007                   // 실패하면 재시도
  IL_0028:  ret
}
```

이건 전형적인 **락 프리 CAS(compare-and-swap) 루프**다.

1. 현재 델리게이트를 읽어 스냅숏(`V_1`)을 만든다.
2. `Delegate.Combine`으로 새 델리게이트를 만든다(델리게이트는 불변이므로 항상 새 인스턴스다).
3. `Interlocked.CompareExchange(ref field, 새값, 스냅숏)`으로 원자적으로 교체를 시도한다.
4. 반환값(교체 직전의 실제 값)이 스냅숏과 다르면 = 다른 스레드가 끼어들었으면, `bne.un.s`로 2번부터 재시도한다.

`ldflda`(필드의 **주소**를 로드)가 등장하는 이유가 여기 있다. `CompareExchange`의 첫 매개변수가 `ref T`(IL로는 `!!0&`)이므로 값이 아니라 관리 포인터가 필요하다.

> **📌 필드형 이벤트는 자동으로 스레드 안전하다 — 구독 등록에 한해서만**
>
> `+=`/`-=`가 CAS 루프로 컴파일되므로 **구독자 목록의 갱신 자체는** 스레드 안전하다. .NET Framework 3.5 이전에는 `[MethodImpl(MethodImplOptions.Synchronized)]`, 즉 `lock(this)`를 썼는데, 이는 데드락 위험이 있어 CAS 루프로 바뀌었다.
>
> 하지만 **이벤트 발생(invoke)은 여전히 직접 챙겨야 한다.** `if (Changed != null) Changed(this, e);`는 두 접근 사이에 구독 해제가 일어나면 `NullReferenceException`이 난다. `Changed?.Invoke(this, e)`가 정답이며, 이건 IL에서 필드를 **지역 변수에 한 번만 읽어** 널 검사와 호출에 재사용하는 코드로 컴파일된다.

명시적 접근자(`add { } remove { }`)를 쓰면 이 CAS 루프는 생기지 않고 작성한 코드가 그대로 들어간다. `.event` 디렉티브와 `add_`/`remove_` 이름 규칙만 유지된다.

### 클로저 — 디스플레이 클래스

**변수를 캡처하지 않는 람다**부터 본다.

```csharp
static void NoCapture()
{
    Func<int, int> f = x => x * 2;
    Console.WriteLine(f(21));
}
```

```il
.method private hidebysig static void NoCapture() cil managed
{
  .maxstack  8
  IL_0000:  ldsfld     class [System.Runtime]System.Func`2<int32,int32>
                       C/'<>c'::'<>9__0_0'
  IL_0005:  dup
  IL_0006:  brtrue.s   IL_001f                     // 이미 만들어져 있으면 건너뛴다
  IL_0008:  pop
  IL_0009:  ldsfld     class C/'<>c' C/'<>c'::'<>9'   // 싱글턴 인스턴스
  IL_000e:  ldftn      instance int32 C/'<>c'::'<NoCapture>b__0_0'(int32)
  IL_0014:  newobj     instance void class Func`2<int32,int32>::.ctor(object, native int)
  IL_0019:  dup
  IL_001a:  stsfld     class Func`2<int32,int32> C/'<>c'::'<>9__0_0'   // 캐시
  IL_001f:  ldc.i4.s   21
  IL_0021:  callvirt   instance !1 class Func`2<int32,int32>::Invoke(!0)
  IL_0026:  call       void [System.Console]System.Console::WriteLine(int32)
  IL_002b:  ret
}
```

읽는 법.

- 컴파일러가 `<>c`라는 **싱글턴 클래스**를 만들고, 캡처하지 않는 모든 람다의 본문을 그 인스턴스 메서드(`<NoCapture>b__0_0`)로 넣는다.
- 델리게이트 인스턴스는 `<>9__0_0` 정적 필드에 **캐시**된다. `ldsfld` → `dup` → `brtrue.s` 패턴이 "이미 있으면 재사용" 로직이다.
- `ldftn`이 메서드의 함수 포인터를 스택에 올리고, ``newobj ... Func`2::.ctor(object, native int)``가 대상 객체와 함수 포인터로 델리게이트를 만든다. **델리게이트 생성은 거의 항상 이 두 명령 쌍**이다. 다만 대상이 가상 메서드면 `ldftn` 대신 `ldvirtftn`이 오고, `ldvirtftn`이 수신자를 팝해 버리므로 앞에 `dup`이 하나 붙는다(부록 A.3).
- 결과적으로 이 람다는 **첫 호출 때 한 번만 할당**된다. 매 호출마다 델리게이트를 새로 만들지 않는다.

이제 **변수를 캡처하는 람다**를 보자.

```csharp
static void Capture(int seed)
{
    int total = 0;
    Action<int> add = x => total += x + seed;
    add(1);
    add(2);
    Console.WriteLine(total);
}
```

컴파일러가 만드는 **디스플레이 클래스(display class)** 는 이렇다.

```il
.class nested private auto ansi sealed beforefieldinit '<>c__DisplayClass0_0'
       extends [System.Runtime]System.Object
{
  .custom instance void ...CompilerGeneratedAttribute::.ctor() = ( 01 00 00 00 )
  .field public int32 seed
  .field public int32 total
  .method assembly hidebysig instance void '<Capture>b__0'(int32 x) cil managed
  {
    .maxstack  8
    IL_0000:  ldarg.0                 // this = 디스플레이 클래스 인스턴스
    IL_0001:  ldarg.0
    IL_0002:  ldfld      int32 C/'<>c__DisplayClass0_0'::total
    IL_0007:  ldarg.1
    IL_0008:  ldarg.0
    IL_0009:  ldfld      int32 C/'<>c__DisplayClass0_0'::seed
    IL_000e:  add
    IL_000f:  add
    IL_0010:  stfld      int32 C/'<>c__DisplayClass0_0'::total
    IL_0015:  ret
  }
}
```

호출 측은 이렇게 바뀐다.

```il
.method private hidebysig static void Capture(int32 seed) cil managed
{
  .maxstack  3
  .locals init (class C/'<>c__DisplayClass0_0' V_0)
  IL_0000:  newobj     instance void C/'<>c__DisplayClass0_0'::.ctor()  // ★ 힙 할당
  IL_0005:  stloc.0
  IL_0006:  ldloc.0
  IL_0007:  ldarg.0
  IL_0008:  stfld      int32 C/'<>c__DisplayClass0_0'::seed             // 매개변수 이사
  IL_000d:  ldloc.0
  IL_000e:  ldc.i4.0
  IL_000f:  stfld      int32 C/'<>c__DisplayClass0_0'::total            // 지역 변수 이사
  IL_0014:  ldloc.0
  IL_0015:  ldftn      instance void C/'<>c__DisplayClass0_0'::'<Capture>b__0'(int32)
  IL_001b:  newobj     instance void class Action`1<int32>::.ctor(object, native int)
  ...
}
```

여기서 반드시 읽어내야 할 사실 셋.

1. **캡처된 지역 변수는 더 이상 스택에 없다.** `total`과 `seed`는 힙에 있는 디스플레이 클래스의 **필드**가 되었다. 메서드 본문에서 `total`을 읽는 코드도 전부 `ldfld`로 바뀐다.
2. **디스플레이 클래스 인스턴스는 메서드 진입 시 무조건 할당된다.** 람다를 실제로 호출하는지 여부와 무관하다. 조건부로만 쓰이는 람다가 핫 패스에 있으면 이게 그대로 GC 압력이다.
3. **델리게이트도 매번 새로 할당된다.** 캡처가 있으면 대상 객체가 매번 다르므로 캐시가 불가능하다. `<>9__` 캐시 필드가 없는 것이 그 증거다.

> **⚠️ 캡처 하나가 스코프 전체를 붙잡는다**
>
> 컴파일러는 **같은 스코프에서 캡처된 모든 변수를 하나의 디스플레이 클래스에 몰아넣는다.** 그래서 큰 배열 하나와 `int` 하나를 같은 스코프에서 캡처하면, `int`만 쓰는 람다가 살아 있는 동안 **배열도 함께 살아 있다.** 서로 다른 수명의 람다가 같은 스코프에서 캡처하면 메모리 누수처럼 보이는 현상이 생긴다.
>
> 해결책은 스코프를 쪼개는 것이다. 중괄호 블록을 따로 만들면 컴파일러가 `<>c__DisplayClass0_0`, `<>c__DisplayClass0_1`처럼 별도 클래스를 만든다. 이름 끝의 `_0`, `_1`이 바로 스코프 번호다. IL에서 이 숫자를 세면 캡처 스코프가 몇 개인지 즉시 알 수 있다.

> **💡 `static` 람다로 캡처를 컴파일 타임에 막아라 ※C# 9**
>
> 람다나 지역 함수 앞에 `static`을 붙이면 캡처를 시도할 때 **컴파일 오류**가 난다. IL을 확인할 필요 없이 "이 람다는 할당이 없다"를 보장받는 가장 싼 방법이다. 핫 패스의 람다에는 습관적으로 붙이는 편이 좋다. 지역 함수(local function)는 델리게이트로 변환되지 않는 한 아예 델리게이트 할당이 없고, 캡처가 있어도 디스플레이 클래스를 **구조체로** 만들어 `ref`로 넘기므로 힙 할당이 없다 — 이것이 람다보다 지역 함수를 선호하는 성능상의 이유다.

---
### `foreach` — 대상 타입에 따라 IL이 셋으로 갈린다

`foreach`는 단일한 구문이 아니다. 대상 타입에 따라 완전히 다른 IL이 나온다. 아래 셋이 주된 갈래이고, `string`에 대한 `foreach`는 네 번째 갈래로 `get_Length`/`get_Chars`를 쓰는 인덱스 루프로 낮춰진다(열거자 할당이 없다).

**① 배열 — `for` 루프로 바뀐다**

```csharp
foreach (int n in arr) sum += n;
```

```il
IL_0002:  ldarg.0
IL_0003:  stloc.1          // V_1 = arr (사본)
IL_0004:  ldc.i4.0
IL_0005:  stloc.2          // V_2 = 인덱스 0
IL_0006:  br.s       IL_0014
IL_0008:  ldloc.1
IL_0009:  ldloc.2
IL_000a:  ldelem.i4        // arr[i]
IL_000b:  stloc.3
IL_000c:  ldloc.0
IL_000d:  ldloc.3
IL_000e:  add
IL_000f:  stloc.0
IL_0010:  ldloc.2
IL_0011:  ldc.i4.1
IL_0012:  add
IL_0013:  stloc.2          // i++
IL_0014:  ldloc.2
IL_0015:  ldloc.1
IL_0016:  ldlen
IL_0017:  conv.i4
IL_0018:  blt.s      IL_0008
```

열거자가 전혀 없다. `ldlen`/`conv.i4`/`ldelem`/`blt`가 나오면 **배열에 대한 `foreach`(또는 `for`)** 다. JIT은 인덱스 상한이 `arr.Length`임을 인식해 **경계 검사를 제거**한다(55.6절). 이것이 배열 `foreach`가 가장 빠른 이유다.

> **⚠️ `ldlen`은 `native uint`를 푸시한다**
>
> `ldlen` 다음에 항상 `conv.i4`가 따라붙는 이유다. 배열 길이는 명세상 `native unsigned int`이고, `int` 인덱스와 비교하려면 변환이 필요하다. `conv.i4`를 보고 "왜 여기서 변환을?"이라고 당황하지 않으려면 알아둘 것.

**② `List<T>` 등 구조체 열거자 — 박싱 없는 `call`**

```il
IL_0001:  callvirt   instance valuetype List`1/Enumerator<!0>
                     class List`1<int32>::GetEnumerator()
IL_0006:  stloc.1
.try
{
  IL_0007:  br.s       IL_0017
  IL_0009:  ldloca.s   V_1                              // 열거자의 주소
  IL_000b:  call       instance !0 valuetype List`1/Enumerator<int32>::get_Current()
  ...
  IL_0017:  ldloca.s   V_1
  IL_0019:  call       instance bool valuetype List`1/Enumerator<int32>::MoveNext()
  IL_001e:  brtrue.s   IL_0009
  IL_0020:  leave.s    IL_0030
}
finally
{
  IL_0022:  ldloca.s   V_1
  IL_0024:  constrained. valuetype List`1/Enumerator<int32>
  IL_002a:  callvirt   instance void [System.Runtime]System.IDisposable::Dispose()
  IL_002f:  endfinally
}
```

핵심은 `ldloca.s V_1` + `call`(`callvirt`가 아니다)이다. 열거자가 **구조체**이므로 지역 변수에 값으로 담기고, 메서드는 그 주소에 대해 직접 호출된다. **박싱도 가상 디스패치도 없다.** 이것이 `List<T>`의 `foreach`가 `IEnumerable<T>`보다 빠른 이유다.

`constrained. <타입>` 접두사도 중요하다. 값 타입에 대해 인터페이스 메서드를 호출할 때 **박싱 없이** 호출하라는 지시다. 타입이 그 메서드를 직접 구현하고 있으면 값 타입 그대로 호출하고, 아니면 그때만 박싱한다.

**③ `IEnumerable<T>` — 인터페이스 디스패치**

같은 코드라도 변수 타입이 `IEnumerable<int>`면 이렇게 바뀐다.

```il
IL_0001:  callvirt   instance class IEnumerator`1<!0> class IEnumerable`1<int32>::GetEnumerator()
IL_0006:  stloc.1
.try
{
  IL_0009:  ldloc.1
  IL_000a:  callvirt   instance !0 class IEnumerator`1<int32>::get_Current()
  ...
  IL_0016:  ldloc.1
  IL_0017:  callvirt   instance bool [System.Runtime]System.Collections.IEnumerator::MoveNext()
  IL_001c:  brtrue.s   IL_0009
  IL_001e:  leave.s    IL_002a
}
finally
{
  IL_0020:  ldloc.1
  IL_0021:  brfalse.s  IL_0029     // 널 검사 후
  IL_0023:  ldloc.1
  IL_0024:  callvirt   instance void [System.Runtime]System.IDisposable::Dispose()
  IL_0029:  endfinally
}
```

차이가 선명하다. `ldloca` 대신 `ldloc`, `call` 대신 `callvirt`. 열거자가 **힙에 할당된 객체**이고 모든 호출이 인터페이스 디스패치다. `List<T>`를 `IEnumerable<T>` 변수에 담아 `foreach`하면 구조체 열거자가 **박싱되어** 할당 하나가 추가로 발생한다.

> **⚠️ `foreach`는 `IEnumerable`을 요구하지 않는다 — 덕 타이핑이다**
>
> 컴파일러는 대상 타입에 적절한 시그니처의 `GetEnumerator()`가 있으면 인터페이스 구현 여부와 무관하게 `foreach`를 허용한다(28.1절). IL을 보면 그 선택 결과가 그대로 드러난다. ``callvirt ... IEnumerable`1::GetEnumerator()``가 아니라 `callvirt instance valuetype ... T::GetEnumerator()`가 보이면 덕 타이핑 경로다. 확장 메서드로 정의된 `GetEnumerator`(※C# 9)도 마찬가지로 `call`로 나타난다.

### `using` — `try`/`finally` + 널 검사

```csharp
using (var s = new MemoryStream()) { s.WriteByte(1); }
```

```il
IL_0000:  newobj     instance void [System.Runtime]System.IO.MemoryStream::.ctor()
IL_0005:  stloc.0
.try
{
  IL_0006:  ldloc.0
  IL_0007:  ldc.i4.1
  IL_0008:  callvirt   instance void [System.Runtime]System.IO.Stream::WriteByte(uint8)
  IL_000d:  leave.s    IL_0019
}
finally
{
  IL_000f:  ldloc.0
  IL_0010:  brfalse.s  IL_0018
  IL_0012:  ldloc.0
  IL_0013:  callvirt   instance void [System.Runtime]System.IDisposable::Dispose()
  IL_0018:  endfinally
}
IL_0019:  ret
```

`finally` 안의 `brfalse.s`가 널 검사다 — `using (Foo f = null)`이 예외를 내지 않는 이유가 여기 있다. 리소스가 **구조체**(`ref struct` 포함)면 널 검사가 사라지고 `constrained.` 접두사가 붙는다.

`using` 선언문(`using var s = ...;`, ※C# 8)은 IL이 **완전히 동일**하다. `finally`의 범위가 블록 끝이 아니라 스코프 끝까지일 뿐이다. 중첩된 `using` 여러 개는 중첩된 `.try`/`finally`가 된다.

> **⚠️ `finally`는 `leave`가 트리거한다**
>
> `try` 블록 마지막의 `leave.s IL_0019`가 "블록을 정상적으로 벗어나겠다"는 선언이고, 이때 CLR이 `finally` 블록을 실행한 뒤 `IL_0019`로 점프한다. `try` 안에서 예외가 나면 예외 처리 메커니즘이 `finally`를 실행한다(두 번째 패스). `return`도 `leave`로 컴파일되므로 `try` 안의 `return`이 `finally`를 건너뛰지 못한다.
>
> 예외: **`finally` 블록 안에서 프로세스가 죽으면**(`StackOverflowException`, `Environment.FailFast`) `finally`는 실행되지 않는다. `try`/`finally`가 절대적 보장이라고 생각하면 안 된다.

### `lock` — `Monitor.Enter(obj, ref lockTaken)`

```csharp
lock (_sync) { _count++; }
```

```il
.locals init (object V_0, bool V_1)
IL_0000:  ldarg.0
IL_0001:  ldfld      object C::_sync
IL_0006:  stloc.0                     // V_0 = 잠글 객체 (한 번만 평가)
IL_0007:  ldc.i4.0
IL_0008:  stloc.1                     // V_1 = lockTaken = false
.try
{
  IL_0009:  ldloc.0
  IL_000a:  ldloca.s   V_1
  IL_000c:  call       void [System.Runtime]System.Threading.Monitor::
                       Enter(object, bool&)
  IL_0011:  ldarg.0
  IL_0012:  dup                       // _count++ (this를 두 번 밀지 않고 복제)
  IL_0013:  ldfld      int32 C::_count
  IL_0018:  ldc.i4.1
  IL_0019:  add
  IL_001a:  stfld      int32 C::_count
  IL_001f:  leave.s    IL_002b
}
finally
{
  IL_0021:  ldloc.1
  IL_0022:  brfalse.s  IL_002a
  IL_0024:  ldloc.0
  IL_0025:  call       void [System.Runtime]System.Threading.Monitor::Exit(object)
  IL_002a:  endfinally
}
```

읽어낼 점 셋.

- **잠글 객체는 지역 변수에 한 번만 저장된다.** `Enter`와 `Exit`가 같은 객체를 보장받아야 하기 때문이다. `lock (GetLock())`을 써도 `GetLock()`은 한 번만 호출된다.
- **`lockTaken` 플래그가 있다.** `Monitor.Enter`가 잠금을 얻은 직후, 대입 전에 스레드 중단이 일어나 `Exit`가 호출되지 않는 경쟁 조건을 막기 위한 설계다. .NET Framework 3.5까지는 `Monitor.Enter(object)` 단일 인수 버전이었고 이 구멍이 있었다.
- `IL_0012: dup`이 눈에 띈다. `_count++`에서 `this`를 두 번 쓰지 않고 복제한 것이다. 컴파일러가 `ldarg.0`을 두 번 쓰는 대신 `dup`을 쓰는 최적화다.

> **💡 ※C# 13 / .NET 9 — `System.Threading.Lock`은 IL이 다르다**
>
> 잠금 대상이 `System.Threading.Lock` 타입이면 컴파일러가 `Monitor`가 아니라 `Lock.EnterScope()`를 호출하고, 반환된 `Lock.Scope` ref struct를 `using`처럼 `try`/`finally`로 해제한다. IL에 `Monitor::Enter`가 없고 `Lock::EnterScope()`와 `Lock/Scope::Dispose()`가 보이면 새 방식이다.
>
> 주의할 함정: `Lock` 인스턴스를 `object` 타입 변수에 담아 `lock`하면 **옛 `Monitor` 경로로 컴파일된다.** 두 경로는 서로 배타적이므로 같은 객체를 두 방식으로 잠그면 상호 배제가 깨진다. 컴파일러가 경고(CS9216)를 내지만 IL을 직접 확인하는 편이 확실하다.

### 문자열 보간

보간 문자열은 **세 갈래**로 컴파일된다.

**① 모든 구멍이 `string`이고 서식 지정이 없으면 → `String.Concat`**

```csharp
string s = $"Hello, {name}!";
```

```il
IL_0000:  ldstr      "Hello, "
IL_0005:  ldarg.0
IL_0006:  ldstr      "!"
IL_000b:  call       string [System.Runtime]System.String::Concat(string, string, string)
```

**② 그 외 → `DefaultInterpolatedStringHandler` (※C# 10 / .NET 6+)**

```csharp
string s = $"x = {x}, y = {y:F2}";
```

```il
.locals init (valuetype [System.Runtime]System.Runtime.CompilerServices
              .DefaultInterpolatedStringHandler V_0)
IL_0000:  ldloca.s   V_0
IL_0002:  ldc.i4.s   10                       // 리터럴 부분의 총 길이 ("x = " + ", y = ")
IL_0004:  ldc.i4.2                            // 구멍 개수
IL_0005:  call       instance void ...DefaultInterpolatedStringHandler::.ctor(int32, int32)
IL_000a:  ldloca.s   V_0
IL_000c:  ldstr      "x = "
IL_0011:  call       instance void ...::AppendLiteral(string)
IL_0016:  ldloca.s   V_0
IL_0018:  ldarg.0
IL_0019:  call       instance void ...::AppendFormatted<int32>(!!0)
// ", y = " 리터럴 추가 후 …
IL_002a:  ldloca.s   V_0
IL_002c:  ldarg.1
IL_002d:  ldstr      "F2"
IL_0032:  call       instance void ...::AppendFormatted<float64>(!!0, string)
IL_0037:  ldloca.s   V_0
IL_0039:  call       instance string ...::ToStringAndClear()
```

핸들러는 **구조체**이고 `ldloca.s`로 주소를 통해 다뤄진다. 내부적으로 `ArrayPool`에서 빌린 버퍼에 직접 쓰므로 중간 문자열이 생기지 않는다. `AppendFormatted<T>`가 제네릭이라 값 타입 인수의 **박싱도 없다.** C# 10 이전에는 `string.Format(string, object, object)`로 컴파일되어 인수마다 박싱이 일어났다 — 성능 차이가 큰 변화다.

**③ 컴파일 타임 상수만 있으면 → 문자열 리터럴 하나**

```csharp
const string Name = "world";
string s = $"Hello {Name}";   // ldstr "Hello world" 하나로 끝
```

> **⚠️ `$"..."`가 항상 핸들러를 쓰는 것은 아니다**
>
> 위 ①에서 봤듯 구멍이 전부 `string`이면 `String.Concat`이 나온다. 그리고 **대상 타입이 `string`이 아니면** 또 달라진다. `FormattableString`이나 `IFormattable`로 받으면 `FormattableStringFactory.Create(string, object[])` 호출이 되고, 여기서는 **`object[]` 배열 할당과 박싱이 다시 등장한다.** `ILogger.LogInformation($"...")` 같은 코드가 예상보다 비싼 이유가 이것이다 — 커스텀 보간 핸들러를 쓰는 로깅 API가 아니면 그렇다.

### `async` 상태 기계

```csharp
public async Task<int> GetAsync()
{
    await Task.Delay(100);
    return 42;
}
```

메서드 본문은 **완전히 사라지고** 상태 기계 타입으로 옮겨진다. 남는 것은 stub이다.

```il
.method public hidebysig instance class [System.Runtime]System.Threading.Tasks.Task`1<int32>
        GetAsync() cil managed
{
  .custom instance void [System.Runtime]System.Runtime.CompilerServices
          .AsyncStateMachineAttribute::.ctor(class [System.Runtime]System.Type)
          = ( 01 00 ... )   // typeof(C/'<GetAsync>d__0')
  .maxstack  2
  .locals init (valuetype C/'<GetAsync>d__0' V_0)
  IL_0000:  ldloca.s   V_0
  IL_0002:  call       valuetype AsyncTaskMethodBuilder`1<int32>
                       AsyncTaskMethodBuilder`1<int32>::Create()
  IL_0007:  stfld      valuetype AsyncTaskMethodBuilder`1<int32>
                       C/'<GetAsync>d__0'::'<>t__builder'
  IL_000c:  ldloca.s   V_0
  IL_000e:  ldarg.0
  IL_000f:  stfld      class C C/'<GetAsync>d__0'::'<>4__this'
  IL_0014:  ldloca.s   V_0
  IL_0016:  ldc.i4.m1
  IL_0017:  stfld      int32 C/'<GetAsync>d__0'::'<>1__state'     // 상태 = -1 (시작 전)
  IL_001c:  ldloca.s   V_0
  IL_001e:  ldflda     valuetype AsyncTaskMethodBuilder`1<int32>
                       C/'<GetAsync>d__0'::'<>t__builder'
  IL_0023:  ldloca.s   V_0
  IL_0025:  call       instance void AsyncTaskMethodBuilder`1<int32>::
                       Start<valuetype C/'<GetAsync>d__0'>(!!0&)   // 첫 동기 구간 실행
  IL_002a:  ldloca.s   V_0
  IL_002c:  ldflda     valuetype AsyncTaskMethodBuilder`1<int32>
                       C/'<GetAsync>d__0'::'<>t__builder'
  IL_0031:  call       instance class Task`1<!0> AsyncTaskMethodBuilder`1<int32>::get_Task()
  IL_0036:  ret
}
```

읽어야 할 랜드마크는 다섯이다.

| 랜드마크 | 의미 |
|---|---|
| `[AsyncStateMachine(typeof(...))]` | 이 메서드가 `async`였다 |
| `<GetAsync>d__0` | 생성된 상태 기계 타입. `d__`는 "state machine" |
| `<>1__state` | 현재 상태. `-1`=시작 전/실행 중, `-2`=완료, `0` 이상=N번째 `await`에서 대기 중 |
| `<>t__builder` | `AsyncTaskMethodBuilder` (또는 `AsyncVoidMethodBuilder`, `AsyncValueTaskMethodBuilder`) |
| `<>u__1`, `<>u__2` | 보류 중인 awaiter를 담는 필드. `await` 종류마다 하나씩 |

**상태 기계가 `valuetype`, 즉 구조체**라는 점이 중요하다. `.locals init (valuetype C/'<GetAsync>d__0' V_0)`이 그 증거다. Release 빌드에서 상태 기계는 구조체이고 스택에 놓인다. 첫 `await`이 실제로 **완료되지 않았을 때만** 빌더가 이 구조체를 힙으로 박싱해 올린다. 그래서 **동기적으로 완료되는 `async` 메서드는 힙 할당이 없다.**

Debug 빌드에서는 상태 기계가 **클래스**로 생성된다(`newobj`가 보인다). 디버깅 편의를 위해서다. IL로 async 할당 비용을 판단할 때 반드시 Release로 봐야 하는 이유다.

`MoveNext()` 내부는 거대한 `switch`와 `try`/`catch`의 조합이다. 각 `await` 지점이 상태 번호 하나에 대응하고, `AwaitUnsafeOnCompleted` 호출 뒤에 `ret`으로 빠져나갔다가 콜백에서 `MoveNext()`가 다시 불려 해당 상태 레이블로 점프한다. 전체 코드와 상태 전이는 47.7절에서 다뤘다. 반복자(`yield return`)의 상태 기계도 이름 규칙(`<M>d__N`)과 `MoveNext()` 구조가 같지만 빌더 대신 `IEnumerator<T>`를 직접 구현한다 — 28.4절을 보라.

> **⚠️ `async` 메서드 본문의 IL은 stub에 없다**
>
> IL을 열었는데 `GetAsync`가 20줄짜리 stub밖에 없다고 당황하지 마라. 실제 로직은 **중첩 타입 `<GetAsync>d__0`의 `MoveNext()`** 안에 있다. `ildasm` 트리에서 이 중첩 타입을 따로 펼쳐야 보인다. ILSpy에서는 기본적으로 컴파일러 생성 타입을 숨기므로 옵션에서 **"Show internal types and members"** 를 켜야 한다.

### `typeof`, `is`, `as`

```csharp
Type t = typeof(string);           // ldtoken + GetTypeFromHandle
bool b = o is Person;              // isinst + ldnull + cgt.un
Person p = o as Person;            // isinst
```

```il
// typeof(string)
IL_0000:  ldtoken    [System.Runtime]System.String
IL_0005:  call       class [System.Runtime]System.Type
                     [System.Runtime]System.Type::GetTypeFromHandle(
                       valuetype [System.Runtime]System.RuntimeTypeHandle)

// o is Person
IL_0000:  ldarg.0
IL_0001:  isinst     Person
IL_0006:  ldnull
IL_0007:  cgt.un              // null이 아니면 1

// Person p = o as Person
IL_0000:  ldarg.0
IL_0001:  isinst     Person
```

`is`와 `as`가 **같은 옵코드 하나**로 시작한다는 점이 중요하다. `isinst`는 실패 시 예외 대신 `null`을 푸시한다. 그래서 `o is Person p`(패턴 매칭)는 `isinst` → `stloc` → `ldloc` → `brfalse` 형태가 되고, `as` 뒤에 널 검사를 하는 코드와 **IL이 사실상 동일**하다. "`is` 뒤에 캐스트하면 두 번 검사한다"는 옛 조언은 패턴 매칭을 쓰면 해당되지 않는다.

반면 명시적 캐스트 `(Person)o`는 `castclass`다. 실패하면 `InvalidCastException`을 던진다.

---

## 56.7 라운드트립 엔지니어링 — `ildasm` / `ilasm`

`ildasm.exe`로 C# 컴파일러가 생성한 CIL을 뽑아낸 다음, 그 코드를 편집해 `ilasm.exe`로 다시 컴파일할 수 있다. 이 기법을 **라운드트립 엔지니어링(round-trip engineering)** 이라고 한다.

쓸모 있는 상황은 제한적이지만 분명히 있다.

- 소스 코드가 더 이상 없는 어셈블리를 수정해야 할 때
- 완벽하지 않은 .NET 언어 컴파일러가 비효율적이거나 잘못된 CIL을 뱉어 이를 고쳐야 할 때
- COM 상호 운용 라이브러리를 만들면서 변환 과정에서 사라진 COM IDL 특성(`[helpstring]` 같은)을 되살릴 때

### 실습 — 메시지 바꾸기

`RoundTrip`이라는 콘솔 앱을 만든다.

```csharp
// 단순한 C# 콘솔 앱.
Console.WriteLine("Hello CIL code!");
Console.ReadLine();
```

빌드한다.

```text
dotnet build
```

이제 `ildasm.exe`를 돌린다. 솔루션 폴더에서 실행한다.

```text
ildasm /all /METADATA /out=.\RoundTrip\RoundTrip.il .\RoundTrip\bin\Debug\net6.0\RoundTrip.dll
```

이 명령은 파일 헤더, 주석으로 붙은 16진 명령, 모든 메타데이터를 포함해 어셈블리에 든 거의 모든 것을 출력한다. IL 코드만 간결하게 보고 싶다면 `/all`과 `/METADATA`를 빼면 된다.

> **📌 `ildasm`은 `.res` 파일도 함께 만든다**
>
> 어셈블리 내용을 파일로 덤프하면 `.res` 리소스 파일이 함께 생성된다. 저수준 CLR 보안 정보 등이 들어 있으며, 라운드트립 실습에서는 무시하고 삭제해도 된다.

생성된 `RoundTrip.il`을 열고 `<Main>$` 메서드를 찾아 문자열을 바꾼다.

```il
.method private hidebysig static void  '<Main>$'(string[] args) cil managed
{
  .entrypoint
  .maxstack  8
  IL_0000:  ldstr      "Hello from altered CIL code!"   // ← 여기만 바꿨다
  IL_0005:  call       void [System.Console]System.Console::WriteLine(string)
  IL_000a:  nop
  IL_000b:  call       string [System.Console]System.Console::ReadLine()
  IL_0010:  pop
  IL_0011:  ret
}
```

### 방법 A — `ILASM.EXE` 직접 호출

새 디렉터리를 만들고 수정한 `RoundTrip.il`을 복사한다. 여기에 원래 빌드 출력 폴더(`RoundTrip\bin\Debug\net6.0`)에 있던 **`RoundTrip.runtimeconfig.json`도 함께 복사**해야 한다. `ILASM.EXE`로 만든 실행 파일이 대상 프레임워크 모니커와 런타임 버전을 알아내는 데 이 파일이 필요하다.

```json
{
  "runtimeOptions": {
    "tfm": "net6.0",
    "framework": {
      "name": "Microsoft.NETCore.App",
      "version": "6.0.0-preview.3.21201.4"
    }
  }
}
```

어셈블한다.

```text
..\..\ilasm /DLL RoundTrip.il /X64
```

실행한다.

```text
dotnet RoundTrip.dll
```

바뀐 메시지가 나온다.

> **⚠️ `runtimeconfig.json`을 빠뜨리면 실행 자체가 안 된다**
>
> `ilasm`은 IL과 메타데이터만 만든다. .NET(Core) 앱이 어떤 런타임 버전으로 실행될지는 `runtimeconfig.json`이 결정하며, 이 파일이 없으면 호스트가 "framework를 찾을 수 없다"며 실패한다. .NET Framework에서는 이 파일이 필요 없었다 — 어셈블리 자체에 대상 런타임 버전이 박혀 있었기 때문이다. .NET(Core)로 넘어오면서 생긴 새 요구사항이다.

### 방법 B — `Microsoft.NET.Sdk.IL` 프로젝트

`ILASM.EXE` 직접 호출은 제약이 많다. 훨씬 강력한 방법은 `Microsoft.NET.Sdk.IL` 프로젝트 형식을 쓰는 것이다. 다만 이 프로젝트 형식은 표준 템플릿에 포함되어 있지 않으므로 수동 작업이 필요하다.

`global.json`으로 SDK 버전을 고정한다. 이 파일은 현재 디렉터리와 그 하위 전체에 적용된다.

```json
{
  "msbuild-sdks": {
    "Microsoft.NET.Sdk.IL": "6.0.0"
  }
}
```

`RoundTrip.ilproj`를 만든다.

```xml
<Project Sdk="Microsoft.NET.Sdk.IL">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net6.0</TargetFramework>
    <MicrosoftNetCoreIlasmVersion>6.0.0</MicrosoftNetCoreIlasmVersion>
    <ProduceReferenceAssembly>false</ProduceReferenceAssembly>
  </PropertyGroup>
</Project>
```

이제 평범하게 빌드하면 된다.

```text
dotnet build
```

결과는 여느 C# 프로젝트처럼 `bin\Debug\net6.0`에 나오고, 생성된 `RoundTrip.exe`를 그대로 실행할 수 있다. 게다가 이 방식은 SDK 기능을 그대로 쓸 수 있어서, `<PublishSingleFile>`, `<SelfContained>`, `<RuntimeIdentifier>`, `<PublishReadyToRun>`을 추가하면 C# 프로젝트와 똑같이 `dotnet publish`로 단일 파일 게시까지 된다(4장).

> **⚠️ 라운드트립은 강력한 이름 서명을 깨뜨린다**
>
> 강력한 이름(strong name)으로 서명된 어셈블리를 디스어셈블해서 수정하고 다시 어셈블하면, 원래의 서명은 더 이상 유효하지 않다. 개인 키가 없으면 다시 서명할 수 없고, 서명 없이 배포하면 그 어셈블리에 강력한 이름으로 의존하던 코드가 전부 깨진다(52.5절). 서드파티 어셈블리를 라운드트립으로 "패치"하려는 시도는 이 지점에서 대부분 막힌다.
>
> 그리고 `ildasm` → 편집 → `ilasm`은 **손실이 있는 왕복**이다. 디버그 심볼(PDB) 연결, 일부 커스텀 특성 blob, 리소스가 정확히 보존되지 않는 경우가 있다. 프로덕션 어셈블리를 이 방식으로 수정하는 것은 최후의 수단이며, 실무에서는 `Mono.Cecil`이나 `System.Reflection.Metadata`의 `MetadataBuilder`로 어셈블리를 프로그래밍적으로 재작성하는 편이 훨씬 안전하다.

> **💡 실제로 라운드트립을 쓰게 되는 경우**
>
> 25년 된 .NET Framework 어셈블리 하나가 하드코딩된 서버 주소를 담고 있고 소스가 사라졌다 — 이런 상황이 실무에서 라운드트립을 꺼내는 거의 유일한 시나리오다. 이때도 순서는 이렇다. ① ILSpy로 열어 문제 지점을 찾는다. ② `ildasm /out=`으로 IL을 뽑는다. ③ `ldstr` 리터럴만 바꾼다. ④ `ilasm`으로 재조립한다. ⑤ 원본과 새 어셈블리를 다시 `ildasm`으로 뽑아 **diff한다.** ⑤를 생략하면 안 된다.

---

## 56.8 ILSpy / dotPeek로 디컴파일하기

`ildasm`은 IL만 보여준다. 실무에서 남의 어셈블리를 읽을 때는 IL과 **복원된 C#** 을 나란히 보는 편이 훨씬 빠르다. 이 일을 하는 도구가 디컴파일러다.

| 도구 | 특징 | 플랫폼 |
|---|---|---|
| **ILSpy** | 오픈소스. IL + C# + 다양한 언어 버전으로 복원. `ilspycmd` CLI, VS Code 확장 제공 | Windows / macOS / Linux |
| **dotPeek** | JetBrains. 무료. 심볼 서버 역할까지 하므로 **디컴파일된 코드를 Visual Studio에서 직접 디버깅**할 수 있다 | Windows 전용 |
| **dnSpy / dnSpyEx** | 디컴파일 + **편집 + 디버깅**. 어셈블리를 열어 메서드를 고치고 저장할 수 있다 | Windows 전용 |
| **SharpLab** | 웹. C#을 붙여넣으면 IL, 디컴파일된 C#, JIT 어셈블리를 즉시 보여준다 | 브라우저 |

### `ilspycmd` — 명령행에서 쓰기

```text
dotnet tool install -g ilspycmd

# 어셈블리 전체를 C#으로 복원
ilspycmd MyLib.dll

# 특정 타입만
ilspycmd -t MyNamespace.MyClass MyLib.dll

# IL 코드를 함께 (IL + C# 혼합 출력)
ilspycmd --il MyLib.dll

# 프로젝트 파일까지 생성해 폴더로 풀기
ilspycmd -p -o ./decompiled MyLib.dll

# 복원 대상 C# 버전을 낮춰 컴파일러 마법을 노출시킨다
ilspycmd -lv CSharp1 MyLib.dll
```

마지막 옵션이 이 절의 핵심 기법이다. 자세히 본다.

### "컴파일러가 만든 것"을 알아보는 법

디컴파일러는 IL을 보고 **"이 IL을 만들 수 있는 C#"** 을 재구성한다. 원본 C#이 아니다. 그래서 디컴파일러는 컴파일러가 만든 구조를 **알아보고 원래 문법으로 되돌리려 한다.** 이 "되돌리기"를 끄면 컴파일러가 실제로 무엇을 만들었는지가 드러난다.

`ilspycmd -lv CSharp1`(또는 ILSpy GUI 상단의 언어 버전 드롭다운)로 대상 언어 버전을 낮추면 다음이 전부 노출된다.

| 낮은 언어 버전에서 드러나는 것 | 원래 문법 |
|---|---|
| `<>c__DisplayClass0_0` 클래스와 필드 대입 | 클로저 |
| `<GetAsync>d__0` 구조체와 `MoveNext()` | `async` |
| `<Iter>d__0` 클래스와 `IEnumerator<T>` 구현 | `yield return` |
| `try { } finally { ... Dispose(); }` | `using` |
| `Monitor.Enter`/`Exit` 쌍 | `lock` |
| `<Name>k__BackingField` 직접 접근 | 자동 프로퍼티 |
| `TupleElementNames` 특성이 붙은 `ValueTuple<...>` | 이름 있는 튜플 |
| `Nullable<int>`와 `GetValueOrDefault()` | `int?`와 `??` |

컴파일러가 만든 것을 구별하는 **네 가지 표지**는 이렇다. ① **이름에 `<`, `>`가 들어 있다** — C# 식별자에는 쓸 수 없는 문자이므로 `<>c`, `<>9__0_0`, `<Name>k__BackingField`, `<M>d__0`은 전부 컴파일러 생성물이다. ② **`[CompilerGenerated]`가 붙어 있다** — 자동 프로퍼티 접근자, 디스플레이 클래스, 상태 기계, 익명 타입에 전부 붙는다. ③ **`[DebuggerHidden]` / `[DebuggerBrowsable(Never)]` / `[DebuggerStepThrough]`가 붙어 있다** — 사용자 코드에는 보통 없다. ④ **`<PrivateImplementationDetails>` 타입** — 문자열 해시와 배열 초기화 데이터가 여기 산다.

> **⚠️ 디컴파일러가 만들어낸 C#은 컴파일되지 않을 수 있다**
>
> 디컴파일 결과를 그대로 프로젝트에 붙여 넣으면 대개 컴파일되지 않는다. 이유는 여럿이다.
>
> - `<>c__DisplayClass0_0` 같은 **발음할 수 없는 이름**은 C#에서 선언할 수 없다.
> - `.try` / `fault` 처리기처럼 **C#에 대응 문법이 없는 IL 구조**가 있다.
> - IL이 표현할 수 있지만 C#이 표현할 수 없는 구조(전역 메서드, `famandassem` 이전의 가시성 조합, 특정 `modreq`/`modopt` 수정자)가 있다.
> - 최적화된 IL에서 지역 변수가 합쳐져 있으면 디컴파일러가 타입을 잘못 추론할 수 있다.
>
> 그래서 ILSpy 출력에 `/* 디컴파일 불가 */` 같은 주석이나 원시 IL이 섞여 나오는 것을 보게 된다. **디컴파일 결과는 이해를 위한 참고 자료이지 소스 코드가 아니다.**

> **⚠️ 라이선스를 먼저 확인하라**
>
> 디컴파일은 기술적으로 쉽지만 법적으로는 그렇지 않다. 상용 어셈블리의 라이선스가 리버스 엔지니어링을 금지하는 경우가 많다. 상호 운용성 확보를 위한 디컴파일은 관할권에 따라 예외로 허용되기도 하지만, 회사 코드베이스에서 서드파티 어셈블리를 디컴파일하기 전에 라이선스를 확인하는 것이 안전하다.

---

## 56.9 IL 파싱 — 디스어셈블러 직접 만들기

`MethodBase` 객체에 `GetMethodBody()`를 호출하면 `MethodBody` 객체를 얻는다. 이 객체는 메서드의 지역 변수, 예외 처리 절, 스택 크기, 그리고 **원시 IL**을 조사하는 프로퍼티를 가진다. `Reflection.Emit`의 정반대인 셈이다.

메서드의 원시 IL을 들여다보는 것은 코드 프로파일링에 유용하다. 단순한 용도로는, 어셈블리가 갱신됐을 때 **어떤 메서드가 바뀌었는지** 판별하는 데 쓸 수 있다.

여기서는 `ildasm` 스타일로 IL을 디스어셈블하는 애플리케이션을 만든다. 코드 분석 도구나 상위 언어 디컴파일러의 출발점으로 쓸 수 있다. 목표 출력은 이런 모양이다.

```text
IL_00EB:  ldfld        Disassembler._pos
IL_00F0:  ldloc.2
IL_00F1:  add
IL_00F2:  ldelema      System.Byte
IL_00F7:  ldstr        "Hello world"
IL_00FC:  call         System.Byte.ToString
IL_0101:  ldstr        " "
IL_0106:  call         System.String.Concat
```

> **📌 리플렉션 API에서는 모든 것이 `MethodBase`다**
>
> C#의 모든 기능적 구성 요소는 `MethodBase`의 하위 타입으로 표현되거나(메서드, 생성자), 프로퍼티·이벤트·인덱서처럼 `MethodBase` 객체를 **딸린 형태로** 가진다. 그래서 디스어셈블러 하나로 모든 멤버의 구현을 다룰 수 있다.

### 뼈대

```csharp
using System.Reflection;
using System.Reflection.Emit;
using System.Text;

public class Disassembler
{
    public static string Disassemble(MethodBase method)
        => new Disassembler(method).Dis();

    StringBuilder _output;   // 결과를 계속 덧붙일 대상
    Module _module;          // 나중에 유용하다
    byte[] _il;              // 원시 바이트 코드
    int _pos;                // 바이트 코드에서 현재 위치

    Disassembler(MethodBase method)
    {
        _module = method.DeclaringType.Module;
        _il = method.GetMethodBody().GetILAsByteArray();
    }

    string Dis()
    {
        _output = new StringBuilder();
        while (_pos < _il.Length) DisassembleNextInstruction();
        return _output.ToString();
    }
}
```

정적 `Disassemble` 메서드가 이 클래스의 유일한 public 멤버다. `Dis`가 각 명령을 처리하는 "메인" 루프다.

### 옵코드 사전 만들기

`DisassembleNextInstruction`을 쓰기 전에, 모든 옵코드를 정적 딕셔너리에 실어 **8비트 또는 16비트 값으로 조회**할 수 있게 해두면 편하다. 가장 쉬운 방법은 리플렉션으로 `OpCodes` 클래스의 `OpCode` 타입 정적 필드를 전부 긁어오는 것이다.

```csharp
static Dictionary<short, OpCode> _opcodes = new Dictionary<short, OpCode>();

static Disassembler()
{
    foreach (FieldInfo fi in typeof(OpCodes).GetFields(
                 BindingFlags.Public | BindingFlags.Static))
        if (typeof(OpCode).IsAssignableFrom(fi.FieldType))
        {
            OpCode code = (OpCode)fi.GetValue(null);   // 필드 값을 가져온다
            if (code.OpCodeType != OpCodeType.Nternal)
                _opcodes.Add(code.Value, code);
        }
}
```

정적 생성자에 넣었으므로 한 번만 실행된다.

> **📌 `OpCodeType.Nternal`은 오타가 아니다**
>
> `System.Reflection.Emit.OpCodeType` 열거형에는 실제로 `Nternal`이라는 멤버가 있다(`Internal`의 `I`가 빠진 형태다). 내부 전용 옵코드를 나타내며 현재는 사용 중단(obsolete)으로 표시되어 있다. 위 코드가 이걸 걸러내는 이유는 내부 옵코드가 실제 IL 스트림에 나타나지 않기 때문이다. 낯선 이름이라고 오타로 고치면 컴파일이 안 된다.

### 명령 하나 읽기

각 IL 명령은 **1바이트 또는 2바이트 옵코드**와, 그 뒤의 **0, 1, 2, 4, 8바이트 피연산자**로 구성된다. 예외는 인라인 `switch` 옵코드로, 가변 개수의 피연산자가 따라온다.

```csharp
void DisassembleNextInstruction()
{
    int opStart = _pos;
    OpCode code = ReadOpCode();
    string operand = ReadOperand(code);

    _output.AppendFormat("IL_{0:X4}: {1,-12} {2}",
        opStart, code.Name, operand);
    _output.AppendLine();
}

OpCode ReadOpCode()
{
    byte byteCode = _il[_pos++];
    if (_opcodes.ContainsKey(byteCode)) return _opcodes[byteCode];
    if (_pos == _il.Length)
        throw new Exception("Unexpected end of IL");

    short shortCode = (short)(byteCode * 256 + _il[_pos++]);

    if (!_opcodes.ContainsKey(shortCode))
        throw new Exception("Cannot find opcode " + shortCode);

    return _opcodes[shortCode];
}
```

한 바이트를 읽어 유효한 명령인지 보고, 아니면 한 바이트 더 읽어 2바이트 명령을 찾는다.

> **⚠️ 2바이트 옵코드는 `0xFE`로 시작한다**
>
> `ceq`, `clt`, `cgt`, `ldftn`, `initobj`, `constrained.`, `localloc` 같은 옵코드는 전부 `0xFE`로 시작하는 2바이트 명령이다. 1바이트 공간(256개)이 모자라서 확장한 것이다. 위 `ReadOpCode`가 "1바이트로 찾아보고 없으면 2바이트"라는 전략을 쓰는 이유다. 이 전략이 통하는 건 `0xFE`가 1바이트 옵코드로 배정되어 있지 않기 때문이다.

### 피연산자 읽기

먼저 길이를 결정해야 한다. 피연산자 타입으로 알 수 있다. 대부분이 4바이트이므로 예외 케이스만 조건절로 걸러낸다.

```csharp
string ReadOperand(OpCode c)
{
    int operandLength =
        c.OperandType == OperandType.InlineNone
            ? 0 :
        c.OperandType == OperandType.ShortInlineBrTarget ||
        c.OperandType == OperandType.ShortInlineI ||
        c.OperandType == OperandType.ShortInlineVar
            ? 1 :
        c.OperandType == OperandType.InlineVar
            ? 2 :
        c.OperandType == OperandType.InlineI8 ||
        c.OperandType == OperandType.InlineR
            ? 8 :
        c.OperandType == OperandType.InlineSwitch
            ? 4 * (BitConverter.ToInt32(_il, _pos) + 1) :
        4;  // 나머지는 전부 4바이트

    if (_pos + operandLength > _il.Length)
        throw new Exception("Unexpected end of IL");

    string result = FormatOperand(c, operandLength);
    if (result == null)
    {
        // 피연산자 바이트를 16진수로 출력한다
        result = "";
        for (int i = 0; i < operandLength; i++)
            result += _il[_pos + i].ToString("X2") + " ";
    }
    _pos += operandLength;
    return result;
}
```

`FormatOperand`가 `null`을 반환하면 특별한 서식이 필요 없다는 뜻이므로 16진수로 그냥 찍는다. 이 시점에 `FormatOperand`가 항상 `null`을 반환하도록 두고 테스트하면 출력은 이렇게 나온다.

```text
IL_00A8:  ldfld        98 00 00 04
IL_00AF:  ldelema      64 00 00 01
IL_00B4:  ldstr        26 04 00 70
IL_00B9:  call         B6 00 00 0A
```

옵코드는 맞지만 피연산자가 쓸모없다. 16진수 숫자 대신 **멤버 이름과 문자열**을 보고 싶다.

### 메타데이터 토큰 해석

특별 취급할 4바이트 피연산자는 세 종류다.

- **멤버·타입 참조** — 정의 모듈의 `ResolveMember`를 호출해 이름을 얻는다
- **문자열** — 어셈블리 모듈의 메타데이터에 저장되어 있으며 `ResolveString`으로 가져온다
- **분기 대상** — 피연산자가 IL 안의 바이트 오프셋이므로, 현재 명령 다음 위치(+4바이트)를 기준으로 절대 주소를 계산한다

```csharp
string Get4ByteOperand(OpCode c)
{
    int intOp = BitConverter.ToInt32(_il, _pos);

    switch (c.OperandType)
    {
        case OperandType.InlineTok:
        case OperandType.InlineMethod:
        case OperandType.InlineField:
        case OperandType.InlineType:
            MemberInfo mi;
            try { mi = _module.ResolveMember(intOp); }
            catch { return null; }
            if (mi == null) return null;

            if (mi.ReflectedType != null)
                return mi.ReflectedType.FullName + "." + mi.Name;
            else if (mi is Type)
                return ((Type)mi).FullName;
            else
                return mi.Name;

        case OperandType.InlineString:
            string s = _module.ResolveString(intOp);
            if (s != null) s = "'" + s + "'";
            return s;

        case OperandType.InlineBrTarget:
            return "IL_" + (_pos + intOp + 4).ToString("X4");

        default:
            return null;
    }
}
```

`Module.ResolveMember(int)`가 바로 52.2절에서 본 **메타데이터 토큰**을 실제 리플렉션 객체로 되돌리는 지점이다. 토큰의 상위 바이트가 테이블 종류(`0x06`=MethodDef, `0x0A`=MemberRef, `0x70`=문자열 등)를, 하위 3바이트가 그 테이블의 행 번호를 나타낸다. 위 출력의 `B6 00 00 0A`가 리틀 엔디언으로 `0x0A0000B6`, 즉 **MemberRef 테이블의 182번째 행**이라는 뜻이다.

> **💡 `ResolveMember` 호출 지점이 의존성 분석의 창이다**
>
> 코드 분석 도구를 만든다면 바로 이 지점이 "이 메서드가 어떤 멤버에 의존하는가"를 수집할 곳이다. 어셈블리 전체를 순회하며 여기서 나오는 `MemberInfo`를 모으면 호출 그래프가 만들어진다. 미사용 코드 탐지, 순환 의존성 검출, 트리밍 분석의 기반이 전부 이 한 줄이다.

### 분기 대상과 `switch`

나머지 특수 케이스는 짧은 분기 대상과 인라인 `switch`다. 짧은 분기 대상은 목적지 오프셋을 **부호 있는 1바이트**로 서술하며, 기준은 현재 명령의 끝(즉 +1바이트)이다. `switch` 대상 뒤에는 가변 개수의 4바이트 분기 목적지가 따라온다.

```csharp
string FormatOperand(OpCode c, int operandLength)
{
    if (operandLength == 0) return "";

    if (operandLength == 4)
        return Get4ByteOperand(c);
    else if (c.OperandType == OperandType.ShortInlineBrTarget)
        return GetShortRelativeTarget();
    else if (c.OperandType == OperandType.InlineSwitch)
        return GetSwitchTarget(operandLength);
    else
        return null;
}

string GetShortRelativeTarget()
{
    int absoluteTarget = _pos + (sbyte)_il[_pos] + 1;
    return "IL_" + absoluteTarget.ToString("X4");
}

string GetSwitchTarget(int operandLength)
{
    int targetCount = BitConverter.ToInt32(_il, _pos);
    string[] targets = new string[targetCount];
    for (int i = 0; i < targetCount; i++)
    {
        int ilTarget = BitConverter.ToInt32(_il, _pos + (i + 1) * 4);
        targets[i] = "IL_" + (_pos + ilTarget + operandLength).ToString("X4");
    }
    return "(" + string.Join(", ", targets) + ")";
}
```

이걸로 디스어셈블러가 완성된다. 자기 자신을 디스어셈블해 테스트할 수 있다.

```csharp
MethodInfo mi = typeof(Disassembler).GetMethod(
    "ReadOperand", BindingFlags.Instance | BindingFlags.NonPublic);
Console.WriteLine(Disassembler.Disassemble(mi));
```

> **⚠️ `GetILAsByteArray()`가 항상 되는 것은 아니다**
>
> 다음 경우 `GetMethodBody()`가 `null`을 반환하거나 예외가 난다.
>
> - **추상 메서드, 인터페이스 메서드 선언** — 본문이 없다
> - **`extern` 메서드, P/Invoke** — 본문이 비관리 코드다
> - **런타임이 구현하는 메서드** — 델리게이트의 `Invoke`, `BeginInvoke`, 배열의 `Get`/`Set` 등
> - **`[MethodImpl(MethodImplOptions.InternalCall)]`** — 런타임 내부 구현
> - **Native AOT로 게시된 앱** — IL 자체가 배포물에 없다
>
> 실무용 도구라면 `MethodBody`가 `null`인지 먼저 검사해야 한다. 그리고 이 API는 **제네릭 타입 인수를 해석하지 못한다** — 제네릭 타입 안의 메서드에서 `ResolveMember(token)`를 호출하면 `ArgumentException`이 날 수 있다. 이때는 `ResolveMember(token, genericTypeArguments, genericMethodArguments)` 오버로드에 `Type.GetGenericArguments()`를 넘겨야 한다.

> **💡 진지한 도구라면 `System.Reflection.Metadata`를 써라**
>
> 위 디스어셈블러는 리플렉션에 기반하므로 **어셈블리를 실행 컨텍스트에 로드해야** 동작한다. 로드하면 언로드가 어렵고(52.12절), 대상 어셈블리의 의존성이 전부 해석되어야 하며, 아키텍처·런타임 버전이 맞아야 한다.
>
> 어셈블리를 **로드하지 않고** 읽으려면 `System.Reflection.Metadata`(`MetadataReader`)나 `System.Reflection.Metadata.Ecma335.ILReader`류의 저수준 API, 또는 `Mono.Cecil`을 쓴다. ILSpy가 `System.Reflection.Metadata` 위에 만들어져 있다. 빌드 시점 분석 도구, 트리밍, 어셈블리 재작성은 전부 이 계열이다.

---

## 이 장의 요약

- **CIL은 완전한 프로그래밍 언어다.** 자체 문법(디렉티브·특성·옵코드), 컴파일러(`ilasm.exe`), 디스어셈블러(`ildasm.exe`)를 가진다. 점(`.`) 접두사가 붙으면 디렉티브, 메서드 본문에 있으면 옵코드, 디렉티브를 꾸미면 특성이다.

- **CIL은 스택 기반이고 레지스터가 없다.** 지역 변수든 인수든 필드든 **직접 접근이 불가능하다.** 반드시 `ld*`로 평가 스택에 올리고 `st*`로 내려야 한다. IL이 장황해 보이는 이유가 이것이며, JIT이 이 중복 대부분을 제거한다.

- **IL 명령은 대체로 타입이 없다.** `add`는 하나뿐이고 스택 위 값의 타입에서 연산이 결정된다. 다만 부호 유무(`div`/`div.un`), 오버플로 검사(`add`/`add.ovf`), 상수·변환 명령은 명령 자체가 타입을 담는다. 평가 스택 위에는 `int32`, `int64`, `native int`, `F`, `O`, `&` 여섯 종류만 있다 — `bool`도 `char`도 `byte`도 전부 `int32`다.

- **C#의 거의 모든 편의 문법은 IL에서 사라진다.** 프로퍼티는 `get_X`/`set_X` 메서드 쌍, 이벤트는 `add_X`/`remove_X`와 CAS 루프, 클로저는 디스플레이 클래스 + `ldftn` + `newobj`, `using`과 `lock`은 `.try`/`finally`, `foreach`는 대상 타입에 따라 세 갈래, `async`와 `yield`는 별도 상태 기계 타입이 된다.

- **컴파일러 생성물은 이름으로 알아본다.** `<`, `>`가 든 이름(`<>c__DisplayClass0_0`, `<Name>k__BackingField`, `<M>d__0`), `[CompilerGenerated]`, `[DebuggerHidden]`, `<PrivateImplementationDetails>`가 표지다. C#에서는 이런 식별자를 만들 수 없으므로 충돌하지 않는다.

- **Debug 빌드의 IL로 성능을 논하지 마라.** `nop`, 무의미한 `br.s`, 조건 결과를 담는 임시 지역 변수는 전부 디버깅용이다. `async` 상태 기계는 Debug에서 클래스, Release에서 구조체로 생성된다. **비교는 반드시 Release끼리** 한다.

- **라운드트립(`ildasm` → 편집 → `ilasm`)은 최후의 수단이다.** 강력한 이름 서명이 깨지고, PDB 연결과 일부 메타데이터가 손실될 수 있다. `runtimeconfig.json`도 직접 챙겨야 한다. `ildasm`/`ilasm`은 .NET 런타임에 포함되지 않으며 NuGet(`Microsoft.NETCore.ILDAsm`/`ILAsm`)에서 받아야 한다.

- **디컴파일러의 출력은 소스 코드가 아니다.** "이 IL을 만들 수 있는 C#"일 뿐이다. 언어 버전을 낮춰(ILSpy `-lv CSharp1`) 컴파일러가 실제로 만든 구조를 노출시키는 것이 IL 학습의 지름길이다.

- **IL은 코드로도 읽을 수 있다.** `MethodBody.GetILAsByteArray()`로 원시 바이트를 얻고, `OpCodes`의 정적 필드로 옵코드 사전을 만들고, `Module.ResolveMember`/`ResolveString`으로 메타데이터 토큰을 해석하면 200줄 남짓으로 `ildasm`을 재현할 수 있다. 어셈블리를 로드하지 않고 분석해야 한다면 `System.Reflection.Metadata`를 쓴다.

---

## 연습 문제

1. 같은 메서드를 Debug와 Release로 각각 빌드하고 `ildasm`(또는 SharpLab)으로 IL을 뽑아 diff하라. `nop`, 임시 지역 변수, `clt`+`brtrue` → `blt` 병합이 각각 어디서 일어나는지 확인하라.

2. `int` 케이스가 `0,1,2,3`인 `switch`와 `1,1000,1000000`인 `switch`를 각각 작성하고 IL을 비교하라. `switch` 옵코드가 나타나는 쪽과 `bgt`/`blt` 연쇄가 나타나는 쪽을 확인하고, 문자열 케이스를 3개·10개로 늘려가며 `ComputeStringHash`가 언제 등장하는지 찾아라.

3. `int[]`, `List<int>`, `IEnumerable<int>` 세 가지에 대해 동일한 `foreach` 루프를 작성하고 IL을 비교하라. `ldelem`/`ldloca`+`call`/`ldloc`+`callvirt` 세 패턴을 각각 찾고, 어느 경우에 힙 할당이 발생하는지 `GC.GetAllocatedBytesForCurrentThread()`로 실측해 확인하라.

4. 캡처가 없는 람다, 지역 변수 하나를 캡처하는 람다, 큰 배열과 `int`를 같은 스코프에서 캡처하는 람다 두 개를 각각 작성하고 IL에서 `<>c` 캐시 필드와 `<>c__DisplayClassN_M` 타입 개수를 세라. 중괄호로 스코프를 쪼갰을 때 디스플레이 클래스가 몇 개로 나뉘는지 확인하라.

5. `async Task<int>` 메서드를 Release로 빌드하고 IL에서 `.locals init (valuetype ...)`인지 `newobj`인지 확인하라. 이어서 `await Task.CompletedTask`만 하는 메서드를 100만 번 호출하며 할당량을 측정하고, `await Task.Delay(1)`로 바꿨을 때와 비교하라.

6. 56.9절의 디스어셈블러를 완성해 실행하고, 자기 자신의 `ReadOperand` 메서드를 디스어셈블하라. 이어서 추상 메서드와 델리게이트의 `Invoke`에 대해 호출했을 때 무슨 일이 일어나는지 확인하고 방어 코드를 추가하라.

7. 간단한 C# 콘솔 앱을 `ildasm`으로 뽑아 `ldstr` 리터럴 하나를 바꾸고 `ilasm`으로 재조립해 실행하라. `runtimeconfig.json`을 일부러 빼고 실행했을 때 나오는 오류 메시지를 기록하라. 이어서 원본과 재조립본을 다시 `ildasm`으로 뽑아 diff하고, 문자열 외에 달라진 것이 있는지 확인하라.

---

**다음 장** — 57장「리플렉션과 메타데이터」에서는 이 장에서 원시 바이트로 읽었던 메타데이터를 정식 API로 다룬다. `Type`, `MemberInfo`, `Assembly`로 타입을 조회하고 멤버를 동적으로 호출하는 방법, 그리고 그 비용과 캐싱 전략을 본다. 56.9절에서 `Module.ResolveMember`가 토큰을 `MemberInfo`로 되돌린 것이 그 세계의 입구였다.
