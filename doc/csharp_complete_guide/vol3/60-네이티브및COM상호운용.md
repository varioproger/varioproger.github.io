---
title: "60장. 네이티브 및 COM 상호운용"
parent: "3권 — 내부, 메모리, 성능"
grand_parent: "C# Complete Guide"
nav_order: 60
---

# 60장. 네이티브 및 COM 상호운용

> **이 장의 위치** — Part X「CLR 내부 구조」의 마지막 장이다. 52장부터 59장까지는 CLR 안쪽을 팠다 — 어셈블리가 어떻게 로드되고, 타입이 런타임에 어떤 모양이며, IL이 어떻게 네이티브 코드가 되고, 리플렉션과 DLR이 그 위에서 무엇을 할 수 있는지. 이 장은 반대 방향이다. **관리 세계의 경계를 넘어 바깥으로 나간다.** P/Invoke로 C 함수를 부르고, 포인터로 비관리 메모리를 직접 만지고, COM 객체를 소비하고, 거꾸로 C# 객체를 COM에 노출한다. 경계를 넘는 순간 GC도 타입 안전성도 예외 처리도 더 이상 당신 편이 아니다. 그 경계에서 실제로 무슨 일이 일어나는지 아는 것이 이 장의 목표다.
>
> **선수 지식** — 33장(결정적 정리와 IDisposable), 54장(타입 시스템의 런타임 표현), 55장(JIT 컴파일과 코드 생성), 59장(동적 프로그래밍과 DLR)
>
> **이 장에서 다루지 않는 것** — GC가 고정(pinning)된 객체를 어떻게 처리하는지의 알고리즘 수준 설명은 62.5절(POH)과 64.7절에서, `Span<T>`와 `stackalloc`의 안전한 사용법 전반은 68장에서, 메모리 매핑 파일의 관리 API 전체는 40.14절에서, `SafeHandle`의 설계와 Dispose 패턴은 33.7절에서 다룬다. 이 장은 그 주제들을 **상호운용의 관점에서만** 건드린다.

---

## 60.1 네이티브 DLL 호출 — P/Invoke 기초

**P/Invoke**(Platform Invocation Services, 플랫폼 호출 서비스)는 비관리 DLL(Unix에서는 공유 라이브러리)에 있는 함수·구조체·콜백에 접근하게 해주는 CLR의 기능이다. 이 장에서 다루는 타입은 별도 언급이 없는 한 `System` 또는 `System.Runtime.InteropServices` 네임스페이스에 있다.

### 첫 번째 호출

Windows의 `user32.dll`에 정의된 `MessageBox` 함수를 보자. C 선언은 이렇다.

```c
int MessageBox (HWND hWnd, LPCTSTR lpText, LPCTSTR lpCaption, UINT uType);
```

C#에서는 같은 이름의 정적 메서드를 선언하고 `extern` 키워드를 붙인 뒤 `[DllImport]` 특성을 적용하면 그대로 호출된다.

```csharp
using System;
using System.Runtime.InteropServices;

MessageBox(IntPtr.Zero, "다시는 이 버튼을 누르지 마시오.", "경고", 0);

[DllImport("user32.dll")]
static extern int MessageBox(IntPtr hWnd, string text, string caption, int type);
```

`System.Windows`와 `System.Windows.Forms`의 `MessageBox` 클래스 자체가 이와 비슷한 비관리 메서드를 호출한다.

Linux에서도 원리는 같다.

```csharp
Console.WriteLine($"User ID: {getuid()}");

[DllImport("libc")]
static extern uint getuid();
```

CLR에는 **마샬러(marshaler)** 가 들어 있다. 마샬러는 .NET 타입과 비관리 타입 사이에서 매개변수와 반환값을 변환하는 방법을 안다. 위 Windows 예제에서 `int` 매개변수는 네이티브가 기대하는 4바이트 정수로 그대로 대응되고, `string` 매개변수는 널로 끝나는 UTF-16 문자 배열로 변환된다. `IntPtr`은 비관리 핸들을 캡슐화하도록 설계된 구조체이고, 32비트 플랫폼에서 32비트, 64비트 플랫폼에서 64비트다. C# 9부터는 `IntPtr`에 대응되는 `nint` 타입도 쓸 수 있다(60.7절).

### 경계를 넘을 때 실제로 일어나는 일

`extern` 메서드에는 IL 본문이 없다. 그럼 `MessageBox(...)` 호출은 무엇을 실행하는가? JIT이 이 메서드를 처음 마주치면 **P/Invoke 스텁(IL stub, 마샬링 스텁)** 을 생성한다. 이 스텁이 실제로 하는 일을 펼치면 다음과 같다.

```text
관리 코드                    P/Invoke 스텁 (런타임 생성)               네이티브 코드
─────────                   ────────────────────────────            ────────────
                            ┌────────────────────────────┐
 MessageBox(h, s, c, 0)     │ ① 지연 바인딩                │
        │                   │    - dlopen/LoadLibrary      │
        └──── call ────────▶│    - GetProcAddress          │
                            │    (최초 1회, 이후 캐시)      │
                            ├────────────────────────────┤
                            │ ② 인수 마샬링                │
                            │    블리터블 → 그대로 전달     │
                            │    string  → 네이티브 버퍼    │
                            │              할당 + 복사      │
                            │    배열    → 고정(pin) or 복사│
                            ├────────────────────────────┤
                            │ ③ 프레임 푸시                │
                            │    InlinedCallFrame을 스레드 │
                            │    프레임 체인에 연결         │
                            ├────────────────────────────┤
                            │ ④ GC 모드 전환               │
                            │    협조(cooperative)          │
                            │        ↓                      │
                            │    선점(preemptive)           │
                            └──────────┬─────────────────┘
                                       │ 함수 주소로 점프
                                       ▼
                                              ┌───────────────┐
                                              │  user32.dll의  │
                                              │  MessageBoxW   │
                                              └───────┬───────┘
                            ┌──────────────────────◀──┘ 반환
                            │ ⑤ GC 모드 복귀               │
                            │    선점 → 협조                │
                            │    (GC 진행 중이면 여기서 대기)│
                            ├────────────────────────────┤
                            │ ⑥ 프레임 팝                  │
                            │ ⑦ 반환값·[Out] 인수 역마샬링  │
                            │ ⑧ 임시 네이티브 버퍼 해제      │
                            │ ⑨ SetLastError=true면        │
                            │    GetLastError() 저장        │
                            └──────────┬─────────────────┘
                                       ▼
                                    관리 코드로 복귀
```

네 단계(④)와 다섯 단계(⑤)가 이 장 전체에서 가장 중요한 개념이다. .NET 스레드는 두 가지 모드 중 하나에 있다.

| 모드 | 의미 | GC가 하는 일 |
|---|---|---|
| **협조 모드(cooperative)** | 관리 코드를 실행 중. 관리 참조를 스택·레지스터에 들고 있을 수 있다 | 이 스레드를 **안전 지점까지 몰아서 멈춘 뒤** 스캔한다 (64.12절) |
| **선점 모드(preemptive)** | 네이티브 코드를 실행 중. 관리 힙을 건드리지 않는다고 선언한 상태 | 이 스레드를 **기다리지 않는다**. 전환 프레임(`InlinedCallFrame`) 아래의 관리 프레임은 GC 정보를 보고 그대로 스캔한다 |

즉 P/Invoke 스텁이 하는 GC 모드 전환은 "지금부터 나는 관리 힙을 만지지 않으니 GC를 시작해도 좋다"는 선언이다. 이 선언 덕분에 오래 걸리는 네이티브 호출(파일 I/O, `Sleep`)이 프로세스 전체의 GC를 막지 않는다. 대신 네이티브 함수에서 돌아올 때는 반대 전환이 필요하고, 그 시점에 GC가 진행 중이면 **스레드가 여기서 블록된다**. 이 전환 비용을 없애는 방법이 60.10절의 `SuppressGCTransition`이며, 그때 왜 위험한지도 이 표를 근거로 설명한다.

> **📌 스텁은 JIT 시점에 만들어진다**
>
> P/Invoke 스텁은 CLR이 IL로 생성한 뒤 JIT 컴파일한다. 그래서 `[DllImport]` 메서드의 **첫 호출은 유난히 느리다** — 스텁 IL 생성 + JIT + `LoadLibrary` + `GetProcAddress`가 한꺼번에 일어난다. 벤치마크에서 첫 호출만 마이크로초 단위로 튀는 것을 보면 이것이다. 60.9절의 `[LibraryImport]`는 마샬링 코드를 **컴파일 타임에** C# 소스로 생성하므로 런타임 IL 생성 부담이 줄어든다.

### `[DllImport]`의 필드

`DllImportAttribute`가 노출하는 필드를 전부 정리하면 다음과 같다.

| 필드 | 기본값 | 의미 |
|---|---|---|
| `EntryPoint` | 메서드 이름 | DLL 안의 실제 함수 이름. C# 메서드 이름을 다르게 짓고 싶을 때 |
| `CharSet` | `CharSet.Ansi` | 문자열·`char` 마샬링 방식과 A/W 접미사 탐색에 영향 |
| `SetLastError` | `false` | 호출 직후 `GetLastError()`를 저장해둘지 |
| `ExactSpelling` | `false` | `true`면 `EntryPoint` 이름 그대로만 찾는다 |
| `CallingConvention` | `CallingConvention.Winapi` | 호출 규약(아래 참조) |
| `PreserveSig` | `true` | `false`면 `HRESULT` 반환을 예외로 변환하고 마지막 `[out]` 인수를 반환값으로 바꾼다 |
| `BestFitMapping` | `true` | ANSI 변환 시 대응 문자가 없을 때 근사 문자로 매핑할지 (.NET Framework 관련성이 크다) |
| `ThrowOnUnmappableChar` | `false` | 위 매핑이 실패할 때 예외를 던질지 |

> **⚠️ `CharSet` 기본값이 `Ansi`라는 사실**
>
> 이건 P/Invoke에서 가장 흔한 사고다. `[DllImport("user32.dll")] static extern int MessageBox(..., string text, ...)`는 **기본적으로 ANSI로 마샬링**한다. `ExactSpelling`이 기본 `false`이므로 런타임은 `MessageBox` → `MessageBoxA` 순으로 탐색하고, 결국 `MessageBoxA`를 찾아 호출한다. 그래서 한글이 깨지거나, 현재 코드 페이지에 없는 문자가 `?`로 바뀐다.
>
> Windows API를 부를 때는 **거의 항상** `CharSet = CharSet.Unicode`를 명시해야 한다.
>
> ```csharp
> [DllImport("user32.dll", CharSet = CharSet.Unicode)]
> static extern int MessageBox(IntPtr hWnd, string text, string caption, int type);
> ```
>
> 참고로 `[LibraryImport]`(60.9절)에는 이 함정이 없다 — 문자열이 있으면 `StringMarshalling`을 **명시하지 않으면 컴파일 오류**다. 대신 다른 함정이 생긴다.

### 이름 탐색과 A/W 접미사

`ExactSpelling = false`일 때 런타임은 다음 순서로 내보내기 이름을 찾는다.

| `CharSet` | 탐색 순서 |
|---|---|
| `CharSet.Ansi` | `Foo` → `FooA` |
| `CharSet.Unicode` | `FooW` → `Foo` |
| `CharSet.Auto` | 플랫폼 기본. 현대 Windows에서는 Unicode와 동일하게 동작한다 |

Win32 헤더의 `MessageBox`는 실제로는 매크로이고, 바이너리에는 `MessageBoxA`와 `MessageBoxW` 두 개만 내보내진다. 이 탐색 규칙이 그 간극을 메운다.

### 오류 코드 얻기

Win32 함수의 다수는 실패를 `GetLastError()`로 알린다. 그런데 `GetLastError()`를 별도 P/Invoke로 부르면 그사이 다른 런타임 코드가 스레드의 오류 값을 덮어쓸 수 있다. 그래서 `SetLastError = true`를 지정해 **스텁이 반환 직후에 즉시 값을 캡처**하게 해야 한다.

```csharp
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
static extern IntPtr CreateFileMapping(IntPtr hFile, int lpAttributes,
    uint flProtect, uint hi, uint lo, string lpName);

IntPtr h = CreateFileMapping(new IntPtr(-1), 0, 4, 0, 1000, "MyShare");
if (h == IntPtr.Zero)
    throw new System.ComponentModel.Win32Exception();  // 캡처된 오류 코드로 메시지 구성
```

인자 없는 `Win32Exception` 생성자는 캡처된 마지막 오류 코드를 읽어 사람이 읽을 수 있는 메시지를 만든다. 직접 읽으려면 다음을 쓴다.

```csharp
int err = Marshal.GetLastPInvokeError();             // ※.NET 6
string msg = Marshal.GetLastPInvokeErrorMessage();   // ※.NET 7
// .NET 6 이전에는 Marshal.GetLastWin32Error()
```

`GetLastWin32Error`는 이름과 달리 Unix에서도 동작한다 — 그쪽에서는 `errno`를 담는다. 이름이 부적절해서 .NET 6에서 플랫폼 중립 이름이 추가됐고, 둘은 같은 저장소를 본다.

> **⚠️ `SetLastError = true`는 공짜가 아니다**
>
> 이 플래그를 켜면 스텁이 호출마다 추가로 `GetLastError()`(또는 `errno` 읽기)를 수행하고 스레드별 저장소에 기록한다. 초당 수백만 번 호출하는 뜨거운 P/Invoke라면 측정 가능한 비용이다. **오류를 실제로 읽지 않을 함수에는 켜지 마라.**

### 라이브러리 탐색 경로

`[DllImport("mylib")]`에서 `mylib`은 파일 이름이 아니라 **논리 이름**이다. 런타임은 플랫폼별 규칙에 따라 후보를 만들어 순서대로 시도한다.

| 플랫폼 | 시도하는 파일 이름 |
|---|---|
| Windows | `mylib.dll`, `mylib` |
| Linux | `mylib.so`, `libmylib.so`, `mylib`, `libmylib` |
| macOS | `mylib.dylib`, `libmylib.dylib`, `mylib`, `libmylib` |

탐색 위치는 다음 순으로 조사된다.

1. 이미 프로세스에 로드된 같은 이름의 라이브러리(캐시)
2. `AssemblyLoadContext.ResolvingUnmanagedDll` 이벤트와 `NativeLibrary.SetDllImportResolver`로 등록한 해석기
3. `deps.json`이 만든 `NATIVE_DLL_SEARCH_DIRECTORIES` 목록 (NuGet 패키지의 `runtimes/<RID>/native` 폴더가 여기 들어온다)
4. 애플리케이션 디렉터리
5. OS 기본 탐색 경로 (`PATH`, `LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH` 등)

탐색을 직접 통제하려면 `NativeLibrary`(※.NET Core 3.0)를 쓴다.

```csharp
static class NativeResolver
{
    [System.Runtime.CompilerServices.ModuleInitializer]     // ※C# 9
    internal static void Init() =>
        NativeLibrary.SetDllImportResolver(typeof(NativeResolver).Assembly, Resolve);

    static IntPtr Resolve(string name, Assembly asm, DllImportSearchPath? path)
    {
        if (name != "mylib") return IntPtr.Zero;            // 기본 탐색에 맡긴다
        string file = OperatingSystem.IsWindows() ? "mylib-x64.dll"
                    : OperatingSystem.IsMacOS()   ? "libmylib.dylib"
                                                  : "libmylib.so.3";
        return NativeLibrary.TryLoad(file, asm, path, out IntPtr h) ? h : IntPtr.Zero;
    }
}
```

`IntPtr.Zero`를 반환하면 런타임이 기본 탐색을 이어간다. 라이브러리를 명시적으로 열고 개별 함수 주소를 얻을 수도 있다 — `NativeLibrary.Load`로 핸들을 얻고 `NativeLibrary.GetExport(lib, "cos")`로 주소를 받아 `delegate* unmanaged<double, double>`로 캐스팅해 호출하면 된다(60.11절). 다 쓰면 `NativeLibrary.Free`로 놓는다.

> **⚠️ 실패 시 나오는 예외를 구분하라**
>
> | 증상 | 예외 | 원인 |
> |---|---|---|
> | 라이브러리 파일 자체를 못 찾음 | `DllNotFoundException` | 경로·파일명·RID 폴더 문제 |
> | 파일은 찾았는데 함수가 없음 | `EntryPointNotFoundException` | 이름 오타, C++ 이름 맹글링, A/W 접미사 |
> | 32/64비트 불일치 | `BadImageFormatException` | 프로세스와 DLL의 비트가 다름 |
> | 마샬링 지시가 잘못됨 | `MarshalDirectiveException` | 지원되지 않는 `MarshalAs` 조합 |
>
> C++ 함수를 내보낼 때 `extern "C"`를 빠뜨리면 `?Add@@YAHHH@Z` 같은 맹글링된 이름이 되어 `EntryPointNotFoundException`이 난다. C++ 쪽에서는 `extern "C" __declspec(dllexport)`가 사실상 필수다.

### 호출 규약

비관리 메서드는 스택과 (선택적으로) CPU 레지스터를 통해 인수와 반환값을 주고받는다. 방법이 하나가 아니라서 여러 프로토콜이 생겼고, 이를 **호출 규약(calling convention)** 이라 한다. CLR이 지원하는 것은 셋이다.

| `CallingConvention` | 스택 정리 주체 | 전형적 용처 |
|---|---|---|
| `StdCall` | 호출 대상(callee) | Win32 API 전체 (x86 기준) |
| `Cdecl` | 호출자(caller) | C 런타임, 가변 인수 함수, Linux x86 |
| `ThisCall` | 호출 대상 | C++ 인스턴스 메서드 (첫 인수가 `this`) |
| `Winapi` | 플랫폼 기본 | 기본값. Windows에서는 `StdCall`, Linux x86에서는 `Cdecl` |

```csharp
[DllImport("MyLib.dll", CallingConvention = CallingConvention.Cdecl)]
static extern void SomeFunc(int x);
```

이름이 다소 오해를 부르는 `CallingConvention.Winapi`(대문자 A가 아니라 `Winapi`다)는 플랫폼 기본값을 뜻한다.

> **📌 x64에서는 호출 규약이 사실상 하나다**
>
> x86-64 Windows는 호출 규약을 하나로 통일했다(Microsoft x64 calling convention). Linux/macOS x64도 System V AMD64 ABI 하나다. 그래서 **64비트에서는 `StdCall`과 `Cdecl`을 잘못 지정해도 대개 아무 일도 일어나지 않는다.** 문제는 32비트 프로세스에서만 드러난다 — 스택을 두 번 정리하거나 아무도 정리하지 않아서, 몇 번 호출한 뒤 스택이 무너지고 도무지 설명이 안 되는 지점에서 크래시가 난다. 32비트 대상이 남아 있다면 호출 규약을 반드시 확인하라.

> **⚠️ 비관리 코드에서 던진 예외는 관리 예외가 아니다**
>
> 네이티브 함수 안에서 접근 위반이 나면 CLR은 `AccessViolationException`을 만들어낸다. **.NET(Core)에서는 이 예외를 `catch`로 잡을 수 없다.** 프로세스 손상 상태 예외(corrupted state exception)로 분류되어 즉시 프로세스를 종료시킨다. .NET Framework에는 `[HandleProcessCorruptedStateExceptions]`와 `legacyCorruptedStateExceptionsPolicy` 설정으로 잡는 우회로가 있었지만, .NET Core 이후로는 그 특성이 **무시된다**. 구조적 예외 처리(SEH)로 넘어온 다른 예외는 `SEHException`으로 표면화되며 이건 잡을 수 있다.
>
> 결론은 단순하다. **네이티브 쪽 버그는 `try/catch`로 막을 수 없다.** 경계에서 인수를 검증하는 것 말고는 방법이 없다.

---

## 60.2 타입과 매개변수 마샬링 규칙

### 왜 마샬링이 필요한가

비관리 세계에서 하나의 데이터 타입을 표현하는 방법은 여럿이다. 문자열만 해도 단일 바이트 ANSI 문자일 수도, UTF-16 유니코드일 수도 있고, 길이 접두사가 붙을 수도, 널로 끝날 수도, 고정 길이일 수도 있다. `[MarshalAs]` 특성으로 CLR 마샬러에게 어느 변형을 쓸지 알려준다.

```csharp
[DllImport("...")]
static extern int Foo([MarshalAs(UnmanagedType.LPStr)] string s);
```

`UnmanagedType` 열거형에는 마샬러가 이해하는 모든 Win32·COM 타입이 들어 있다. 위에서는 널로 끝나는 단일 바이트 ANSI 문자열인 `LPStr`로 변환하라고 지시했다.

.NET 쪽에서도 선택지가 있다. 비관리 핸들은 `IntPtr`, `int`, `uint`, `long`, `ulong` 어디에나 대응시킬 수 있다. 다만 **대부분의 비관리 핸들은 주소나 포인터를 캡슐화하므로 32비트·64비트 양쪽과 호환되려면 `IntPtr`(또는 `nint`)로 매핑해야 한다.** `HWND`가 전형적인 예다.

### 문자열 마샬링 완전 정리

문자열은 상호운용에서 가장 자주 틀리는 지점이다. 표로 정리한다.

| `UnmanagedType` | 네이티브 표현 | C 타입 | 메모리 할당·해제 주체 |
|---|---|---|---|
| `LPStr` | 널 종료 ANSI(현재 코드 페이지) | `char*`, `LPSTR` | 마샬러가 할당, 마샬러가 해제 |
| `LPWStr` | 널 종료 UTF-16 | `wchar_t*`, `LPWSTR` | 마샬러가 할당, 마샬러가 해제 |
| `LPUTF8Str` | 널 종료 UTF-8 | `char*` (UTF-8) | 마샬러가 할당, 마샬러가 해제 |
| `LPTStr` | 플랫폼 기본(현재는 UTF-16) | `LPTSTR` | 마샬러 |
| `BStr` | 길이 접두사 + 널 종료 UTF-16 | `BSTR` | `SysAllocString` / `SysFreeString` |
| `ByValTStr` | 구조체 **안에 인라인**된 고정 길이 문자 배열 | `char name[32]` | 없음(구조체에 포함) |
| `AnsiBStr` | 길이 접두사 ANSI | — | COM 전용, 실무에서 거의 안 쓴다 |

`CharSet`과 `StringMarshalling`(60.9절)이 이 선택의 기본값을 정한다.

| 지정 | `string` 기본 대응 | `char` 크기 | 비고 |
|---|---|---|---|
| `CharSet.Ansi` (`[DllImport]` 기본) | `LPStr` | 1바이트 | 코드 페이지 의존. 데이터 손실 가능 |
| `CharSet.Unicode` | `LPWStr` | 2바이트 | Win32 W 함수용. **Windows에서는 이게 정답** |
| `CharSet.Auto` | 플랫폼 기본 | 플랫폼 기본 | 현대 Windows에서는 Unicode와 같다 |
| `StringMarshalling.Utf8` (`[LibraryImport]`) | `LPUTF8Str` | — | POSIX API용. **Linux/macOS에서는 이게 정답** |
| `StringMarshalling.Utf16` (`[LibraryImport]`) | `LPWStr` | 2바이트 | |
| `StringMarshalling.Custom` | 사용자 마샬러 | — | `StringMarshallingCustomType` 필수 |

> **⚠️ `CharSet.Ansi`로 POSIX API를 부르면 대개 "우연히" 동작한다**
>
> Linux/macOS의 C API는 UTF-8 바이트 문자열을 받는다. `CharSet.Ansi`는 .NET(Core)의 Unix 구현에서 UTF-8로 인코딩되므로 결과적으로 맞다. 그러나 이건 명세가 보장하는 것이 아니라 구현 세부다. **Unix 대상 코드에서는 `[LibraryImport]` + `StringMarshalling.Utf8`을 쓰거나, `[MarshalAs(UnmanagedType.LPUTF8Str)]`을 명시하라.**

### 문자열을 받아오기

비관리 코드에서 문자열을 **받아오려면** 메모리 관리가 필요하다. 외부 메서드를 `string` 대신 `StringBuilder`로 선언하면 마샬러가 이 일을 자동으로 처리한다.

```csharp
var s = new StringBuilder(256);
GetWindowsDirectory(s, 256);
Console.WriteLine(s);

[DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
static extern int GetWindowsDirectory(StringBuilder sb, int maxChars);
```

Unix에서도 같은 방식이 통한다 — `[DllImport("libc")] static extern string getcwd(StringBuilder buf, int size)` 역시 그대로 동작한다.

`StringBuilder`는 편하지만 비효율적이다 — CLR이 네이티브 버퍼를 추가로 할당하고 두 번 복사해야 한다. 성능이 중요한 지점에서는 `char[]`를 쓴다.

```csharp
[DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
static extern int GetWindowsDirectory(char[] buffer, int maxChars);
```

`char[]`를 쓸 때는 `CharSet`을 반드시 지정해야 하고, 호출 후 결과를 길이에 맞게 잘라야 한다. 배열 풀링을 쓰면 할당까지 줄일 수 있다.

```csharp
static string GetWindowsDirectory()
{
    char[] array = ArrayPool<char>.Shared.Rent(256);      // System.Buffers
    try   { return new string(array, 0, GetWindowsDirectory(array, 256)); }
    finally { ArrayPool<char>.Shared.Return(array); }
}
```

(물론 이 예제는 인위적이다 — Windows 디렉터리는 `Environment.GetFolderPath`로 얻으면 된다.)

> **💡 어느 쪽을 쓸 것인가**
>
> | 상황 | 권장 |
> |---|---|
> | 호출 빈도가 낮고 코드 가독성이 중요 | `StringBuilder` |
> | 뜨거운 경로, 크기 상한을 안다 | `char[]` + `ArrayPool` 또는 `Span<char>` + `stackalloc` |
> | `[LibraryImport]`를 쓴다 | `StringBuilder`는 **지원되지 않는다.** `Span<char>`나 `char[]`로 바꿔야 한다 |
>
> 마지막 줄이 마이그레이션에서 자주 걸린다. 60.9절에서 다시 다룬다.

### 구조체 마샬링

구조체를 비관리 메서드에 넘겨야 할 때가 있다. Win32의 `GetSystemTime`이 그렇다.

```c
void GetSystemTime (LPSYSTEMTIME lpSystemTime);
```

`LPSYSTEMTIME`은 다음 C 구조체를 가리킨다.

```c
typedef struct _SYSTEMTIME {
  WORD wYear;  WORD wMonth;  WORD wDayOfWeek;    WORD wDay;
  WORD wHour;  WORD wMinute; WORD wSecond;       WORD wMilliseconds;
} SYSTEMTIME, *PSYSTEMTIME;
```

`GetSystemTime`을 부르려면 이 C 구조체와 일치하는 .NET 클래스나 구조체를 정의해야 한다.

```csharp
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
class SystemTime
{
    public ushort Year, Month, DayOfWeek, Day;
    public ushort Hour, Minute, Second, Milliseconds;
}
```

`[StructLayout]`은 각 필드를 비관리 대응물에 어떻게 매핑할지 마샬러에게 지시한다. `LayoutKind.Sequential`은 C 구조체와 마찬가지로 **필드를 선언 순서대로 팩 크기 경계에 정렬**하라는 뜻이다. **필드 이름은 아무 상관 없다. 중요한 것은 순서다.**

이제 호출한다.

```csharp
[DllImport("kernel32.dll")]
static extern void GetSystemTime(SystemTime t);

SystemTime t = new SystemTime();
GetSystemTime(t);
Console.WriteLine(t.Year);
```

Unix에서 같은 일을 하려면 `struct timespec`을 그대로 옮기면 된다.

```csharp
[DllImport("libc")]
static extern int clock_gettime(int clk_id, ref Timespec tp);

[StructLayout(LayoutKind.Sequential)]
struct Timespec
{
    public long tv_sec;    /* 초 */
    public long tv_nsec;   /* 나노초 */
}

var tp = new Timespec();
if (clock_gettime(0, ref tp) != 0) throw new Exception("시간을 읽지 못했다.");
Console.WriteLine(DateTime.UnixEpoch.AddSeconds(tp.tv_sec).ToLocalTime());
```

### 필드 오프셋과 팩 크기

C와 C# 모두, 객체의 필드는 그 객체 주소로부터 n바이트 떨어진 곳에 있다. 차이는 C#에서는 CLR이 **필드 토큰으로 오프셋을 조회**하고, C에서는 필드 이름이 **컴파일 시점에 오프셋으로 바뀐다**는 점뿐이다.

접근 속도를 위해 각 필드는 자기 크기의 배수인 오프셋에 놓인다. 다만 이 배수에는 상한이 있고, 그것이 **팩 크기(pack size)** 다. 현재 구현의 기본 팩 크기는 8바이트다. 그래서 `sbyte` 하나와 8바이트 `long` 하나로 이루어진 구조체는 16바이트를 차지하고, `sbyte` 뒤의 7바이트는 버려진다. `[StructLayout]`의 `Pack` 속성으로 이 낭비를 줄이거나 없앨 수 있다.

```csharp
[StructLayout(LayoutKind.Sequential, Pack = 1)]
struct Packed
{
    public sbyte A;   // 오프셋 0
    public long  B;   // 오프셋 1 — 정렬되지 않음
}                     // 전체 9바이트
```

지정 가능한 팩 크기는 1, 2, 4, 8, 16이다.

> **⚠️ `Pack = 1`은 성능을 해칠 수 있다**
>
> 정렬되지 않은 필드 접근은 x86/x64에서는 (느리지만) 동작하고, ARM 일부 구성에서는 하드웨어 예외를 일으킨다. `Pack = 1`은 **네이티브 쪽이 `#pragma pack(1)`로 컴파일되어 있어서 반드시 맞춰야 할 때만** 쓴다. 네이티브 헤더를 직접 확인하지 않고 추측으로 `Pack`을 바꾸는 것은 데이터가 조용히 어긋나는 가장 빠른 길이다.
>
> 필드 레이아웃과 정렬 자체는 54.4절에서 자세히 다뤘다.

`[StructLayout]`은 명시적 필드 오프셋도 지정할 수 있다. 이건 60.5절의 공용체 시뮬레이션에서 쓴다.

> **📌 C# 구조체의 기본 레이아웃은 `Sequential`이다**
>
> C# 컴파일러는 `struct`에 `[StructLayout]`이 없으면 메타데이터에 `LayoutKind.Sequential`을 방출하고, `class`에는 `LayoutKind.Auto`를 방출한다. 그래서 단순 구조체는 특성 없이도 P/Invoke에 넘길 수 있는 경우가 많다. 하지만 **명시하는 것이 낫다** — 의도가 드러나고, 나중에 참조 타입 필드가 섞여 들어와도 컴파일 오류로 잡힌다.

### In/Out 마샬링 방향

앞 예제에서 `SystemTime`을 클래스로 구현했다. 구조체로 해도 되지만, 그러려면 `GetSystemTime`을 `ref`나 `out` 매개변수로 선언해야 한다.

```csharp
[DllImport("kernel32.dll")]
static extern void GetSystemTime(out SystemTime t);
```

대개 C#의 방향성 매개변수 의미론이 외부 메서드에도 그대로 적용된다. 값 전달은 들어갈 때 복사, `ref`는 들어갈 때와 나올 때 복사, `out`은 나올 때만 복사다. 다만 특별한 변환이 있는 타입에는 예외가 있다. 배열 클래스와 `StringBuilder`는 함수에서 나올 때도 복사가 필요하므로 **in/out**이다.

이 동작을 `[In]`·`[Out]` 특성으로 뒤집을 수 있다. 배열이 읽기 전용이어야 한다면 `[In]`만 붙여서 들어갈 때만 복사하게 한다.

```csharp
static extern void Foo([In] int[] array);
```

| 선언 | 기본 방향 | 비고 |
|---|---|---|
| 값 전달 블리터블 구조체 | in | 복사 |
| `ref T` | in/out | |
| `out T` | out | 들어갈 때 복사 안 함 |
| `T[]` (블리터블) | in/out | 실제로는 **고정(pin)** 되고 복사 없음 |
| `T[]` (비블리터블) | in/out | 양방향 복사 |
| `StringBuilder` | in/out | 양방향 복사 |
| `string` | in | 항상 복사. 네이티브에서 수정하면 안 된다 |
| 클래스(레이아웃 있음) | in/out | 참조로 전달 |

> **⚠️ `string`은 네이티브에서 수정하면 안 된다**
>
> .NET 문자열은 불변이고 인터닝될 수 있다. `[MarshalAs(UnmanagedType.LPWStr)] string`으로 넘긴 버퍼는 마샬러가 만든 **복사본**이므로 네이티브가 수정해도 원본은 안 바뀐다 — 그런데 `CharSet.Unicode`이고 문자열이 이미 UTF-16이라는 이유로 런타임이 최적화를 걸어 **원본을 고정해서 그대로 넘기는 경로**가 존재한다. 이 경로에서 네이티브가 버퍼를 쓰면 **인터닝된 리터럴 문자열의 내용이 실제로 바뀐다.** 프로그램 전체에서 `"Hello"`가 다른 값이 되는 종류의 버그다.
>
> 출력 버퍼가 필요하면 `string`이 아니라 `StringBuilder`, `char[]`, 또는 `Span<char>`를 써라. 이건 규칙이 아니라 명령이다.

---

## 60.3 blittable 타입과 마샬링 비용

### 정의

**블리터블(blittable) 타입**은 관리 표현과 비관리 표현이 **비트 단위로 동일한** 타입이다. 마샬러가 할 일이 없다 — 메모리를 그대로 넘기면 된다(blit = block transfer). 반대로 비블리터블 타입은 변환 코드가 필요하고, 그 변환은 할당·복사·인코딩을 수반한다.

| 블리터블인 것 | 블리터블이 아닌 것 | 비블리터블인 이유 |
|---|---|---|
| `byte`, `sbyte` | `bool` | .NET에서 1바이트, Win32 `BOOL`은 4바이트 |
| `short`, `ushort` | `char` | `CharSet`에 따라 1바이트 또는 2바이트 |
| `int`, `uint` | `string` | 인코딩 변환 + 널 종료 + 버퍼 할당 |
| `long`, `ulong` | `object`, `dynamic` | 관리 힙 객체. `VARIANT`로 변환 |
| `float`, `double` | `decimal` | .NET 고유 128비트 형식 |
| `IntPtr`, `UIntPtr`, `nint`, `nuint` | `DateTime` | .NET 고유 표현 |
| 블리터블 필드만 가진 `struct` | 배열(요소가 비블리터블일 때) | 요소별 변환 필요 |
| 블리터블 요소의 1차원 배열 | `StringBuilder` | 버퍼 왕복 복사 |
| 기본 정수 타입 기반 `enum` | 자동 레이아웃 클래스 | 필드 순서가 보장되지 않음 |
| 고정 크기 버퍼(`fixed`) | 델리게이트 | 함수 포인터 썽크 생성 필요 |

`char`는 예외가 하나 있다. `CharSet.Unicode`를 지정한 `[StructLayout]` 구조체의 필드로 있을 때는 블리터블로 취급된다.

```csharp
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
struct Point { public char Label; public int X, Y; }   // 블리터블
```

### 왜 중요한가

블리터블 여부가 갈라놓는 것은 셋이다.

1. **복사가 일어나는가.** 블리터블 배열은 마샬러가 **고정(pin)** 만 하고 주소를 그대로 넘긴다. 비블리터블 배열은 요소마다 변환한 새 네이티브 버퍼를 만들고, 함수가 끝나면 다시 역변환해 되돌린다. 100만 요소 배열이면 이 차이는 자릿수다.
2. **`[UnmanagedCallersOnly]`를 쓸 수 있는가.** 이 특성이 붙은 메서드는 **시그니처가 전부 블리터블이어야 한다**(60.11절). 그래서 콜백의 반환 타입을 `bool`에서 `byte`로 바꾸는 코드를 자주 보게 된다.
3. **`DisableRuntimeMarshalling`을 켤 수 있는가.** 어셈블리 전체에서 런타임 마샬링을 끄면(※.NET 7) 모든 P/Invoke 시그니처가 블리터블이어야 한다. 대신 스텁이 극단적으로 단순해진다.

```csharp
// 어셈블리 수준으로 지정한다. AssemblyInfo.cs 등에.
[assembly: System.Runtime.InteropServices.DisableRuntimeMarshalling]   // ※.NET 7
```

### `sizeof`와 `Marshal.SizeOf`는 다르다

이 차이가 블리터블 개념을 가장 선명하게 보여준다.

```csharp
unsafe
{
    Console.WriteLine(sizeof(bool));            // 1  — 관리 표현
    Console.WriteLine(Marshal.SizeOf<bool>());  // 4  — 비관리 표현(Win32 BOOL)

    Console.WriteLine(sizeof(char));            // 2  — 관리 표현(UTF-16)
    Console.WriteLine(Marshal.SizeOf<char>());  // 1  — 비관리 표현(기본 CharSet=Ansi)
}
```

블리터블 타입에서는 이 두 값이 **항상 같다**. 다르다면 그 타입은 블리터블이 아니고, 그 지점에 변환 비용이 있다는 뜻이다.

> **💡 블리터블 여부를 확인하는 가장 확실한 방법**
>
> ```csharp
> static bool IsBlittable<T>() where T : struct
> {
>     try   { GCHandle.Alloc(new T[1], GCHandleType.Pinned).Free(); return true; }
>     catch (ArgumentException) { return false; }   // "비블리터블 요소를 포함한다"
> }
> ```
>
> `GCHandleType.Pinned`는 블리터블 타입에만 허용된다. 이 성질을 이용하면 런타임에 판정할 수 있다. 다만 예외를 던지는 경로이므로 진단·테스트용으로만 써라.

### `bool`을 어떻게 넘길 것인가

`bool`은 상호운용에서 두 번째로 자주 틀리는 지점이다. C 세계에는 표준 `bool` 폭이 없다.

| 네이티브 타입 | 크기 | C# 선언 |
|---|---|---|
| Win32 `BOOL` | 4바이트 | `bool` (기본 마샬링) 또는 `[MarshalAs(UnmanagedType.Bool)] bool` |
| C99 `_Bool` / C++ `bool` | 1바이트 | `[MarshalAs(UnmanagedType.U1)] bool` |
| COM `VARIANT_BOOL` | 2바이트 (`-1`=참) | `[MarshalAs(UnmanagedType.VariantBool)] bool` |

```csharp
[DllImport("kernel32.dll", SetLastError = true)]
[return: MarshalAs(UnmanagedType.Bool)]
static extern bool CloseHandle(IntPtr hObject);
```

> **⚠️ C++ `bool`을 Win32 `BOOL`로 마샬링하면 조용히 깨진다**
>
> 1바이트를 기대하는 네이티브 함수에 4바이트를 밀어 넣으면 스택이나 구조체가 3바이트씩 어긋난다. 스택 전달이면 다음 인수가 쓰레기가 되고, 구조체 필드면 그 뒤 모든 필드가 어긋난다. **증상이 호출 지점에서 나타나지 않는다**는 것이 이 버그를 악명 높게 만든다. 네이티브 헤더에서 `BOOL`인지 `bool`인지 눈으로 확인하라.
>
> 블리터블 시그니처만 쓰고 싶다면 `bool` 자체를 피하고 `int`나 `byte`로 선언한 뒤 C# 쪽에서 변환하는 것이 가장 안전하다.

### 마샬링 비용의 크기 감각

정확한 수치는 하드웨어와 런타임 버전에 따라 다르지만, 상대적 크기 감각은 다음과 같다.

| 호출 형태 | 대략적 비용 | 지배적 요인 |
|---|---|---|
| 관리 메서드 직접 호출(인라인됨) | 0 | — |
| 블리터블 시그니처 P/Invoke | 수 ns | GC 모드 전환 + 프레임 푸시/팝 |
| 블리터블 P/Invoke + `SuppressGCTransition` | 1~2 ns | 사실상 직접 호출 |
| `SetLastError = true` 추가 | +수 ns | 추가 시스템 호출 |
| `string` 인수 1개 | 수십~수백 ns | 인코딩 + 할당 + 복사 (길이 비례) |
| `StringBuilder` 인수 1개 | 수백 ns | 왕복 복사 |
| 비블리터블 구조체 배열 | 요소 수 비례 | 요소별 변환 |
| COM 인터페이스 호출(RCW 경유) | 수십 ns | vtable 조회 + `AddRef`/`Release` |

> **💡 P/Invoke 최적화의 순서**
>
> 1. **호출 횟수를 줄여라.** 루프 안에서 100만 번 부르지 말고 배열을 한 번에 넘겨라. 이게 다른 모든 최적화를 합친 것보다 크다.
> 2. **시그니처를 블리터블로 만들어라.** `bool`→`int`, `string`→`byte*`+길이, `StringBuilder`→`Span<char>`.
> 3. **`[LibraryImport]`로 옮겨라.** 스텁이 컴파일 타임에 생성되고 AOT 친화적이다.
> 4. **정말 짧은 함수에만 `SuppressGCTransition`을 검토하라.** 조건은 60.10절에 있다.
>
> 1번을 건너뛰고 4번부터 손대는 코드를 자주 본다. 대개 위험만 늘고 이득은 없다.

---

## 60.4 비관리 코드에서의 콜백 (`delegate`와 함수 포인터)

C#은 외부 함수가 C# 코드를 **호출하게** 만들 수도 있다. 이걸 콜백이라 하고, 방법은 두 가지다 — **함수 포인터**와 **델리게이트**.

예제로 `User32.dll`의 `EnumWindows`를 쓴다. 모든 최상위 창 핸들을 열거하는 함수이고, 창 하나마다(또는 콜백이 `false`를 반환할 때까지) `WNDENUMPROC` 콜백을 호출한다.

```c
BOOL EnumWindows (WNDENUMPROC lpEnumFunc, LPARAM lParam);
BOOL CALLBACK EnumWindowsProc (HWND hwnd, LPARAM lParam);
```

### 함수 포인터로 하는 콜백

C# 9부터, 콜백이 정적 메서드라면 **함수 포인터가 가장 단순하고 가장 빠른 선택**이다. `WNDENUMPROC`에는 다음 함수 포인터 타입이 대응된다.

```csharp
delegate*<IntPtr, IntPtr, bool>
```

두 `IntPtr` 인수를 받고 `bool`을 반환하는 함수를 뜻한다. `&` 연산자로 정적 메서드를 넣는다.

```csharp
using System;
using System.Runtime.InteropServices;

unsafe
{
    EnumWindows(&PrintWindow, IntPtr.Zero);

    [DllImport("user32.dll")]
    static extern int EnumWindows(delegate*<IntPtr, IntPtr, bool> hWnd, IntPtr lParam);

    static bool PrintWindow(IntPtr hWnd, IntPtr lParam)
    {
        Console.WriteLine(hWnd.ToInt64());
        return true;
    }
}
```

함수 포인터를 쓰면 콜백은 **반드시 정적 메서드**(또는 위 예제처럼 정적 지역 함수)여야 한다.

`unmanaged` 키워드와 `[UnmanagedCallersOnly]` 특성을 함께 쓰면 성능이 더 좋아진다. 이 조합은 60.11절에서 자세히 다룬다.

### 델리게이트로 하는 콜백

델리게이트로도 콜백을 만들 수 있다. 이 방법은 모든 C# 버전에서 동작하고, **인스턴스 메서드를 콜백으로 쓸 수 있다**는 장점이 있다.

콜백 시그니처와 일치하는 델리게이트 타입을 선언한 뒤 인스턴스를 외부 메서드에 넘긴다.

```csharp
class CallbackFun
{
    delegate bool EnumWindowsCallback(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern int EnumWindows(EnumWindowsCallback hWnd, IntPtr lParam);

    static bool PrintWindow(IntPtr hWnd, IntPtr lParam)
    {
        Console.WriteLine(hWnd.ToInt64());
        return true;
    }

    // 정적 읽기 전용 필드가 델리게이트를 살려두는 루트가 된다
    static readonly EnumWindowsCallback printWindowFunc = PrintWindow;
    static void Main() => EnumWindows(printWindowFunc, IntPtr.Zero);
}
```

델리게이트를 P/Invoke에 넘기면 마샬러는 **네이티브 썽크(thunk)** 를 만든다. 네이티브 코드가 그 주소를 호출하면 썽크가 GC 모드를 협조 모드로 전환하고, 인수를 역마샬링하고, 델리게이트를 호출한다. 반대 방향의 P/Invoke 스텁인 셈이다.

### 콜백 수명 함정 — 이 절의 핵심

델리게이트를 비관리 콜백에 쓰는 것은 **역설적으로 안전하지 않다.** 델리게이트 인스턴스가 범위를 벗어난 뒤(=GC 대상이 된 뒤) 콜백이 일어나는 함정에 빠지기 쉽기 때문이다. 결과는 최악의 런타임 예외다 — 쓸모 있는 스택 추적이 없는 예외.

문제 코드를 보자.

```csharp
class Timer
{
    delegate void TimerCallback(IntPtr context);

    [DllImport("native-timer.dll")]
    static extern IntPtr StartTimer(TimerCallback cb, int intervalMs);
    [DllImport("native-timer.dll")]
    static extern void StopTimer(IntPtr handle);

    IntPtr _handle;

    public void Start() => _handle = StartTimer(OnTick, 100);
    // 메서드 그룹 변환으로 만들어진 델리게이트는 이 호출이 끝나는 순간
    // 아무도 참조하지 않는다 → 다음 GC에서 수집된다.

    void OnTick(IntPtr ctx) => Console.WriteLine("tick");
}
```

`StartTimer(OnTick, 100)`은 컴파일러가 `new TimerCallback(this.OnTick)`으로 확장한다. 이 델리게이트 인스턴스는 P/Invoke 호출이 지속되는 동안만 살아 있으면 되는 지역 임시 값이다. 호출이 끝나면 루트가 사라진다. 네이티브 타이머는 델리게이트 자체가 아니라 **썽크의 주소**만 들고 있고, 그 주소는 GC의 관심 밖이다.

다음 GC가 델리게이트를 수집하면 썽크도 해제된다. 그 뒤 네이티브 타이머가 그 주소를 호출하면 **해제된 코드로 점프**한다. 결과는 `AccessViolationException`, 또는 운이 나쁘면 아무 일 없이 엉뚱한 코드가 실행되는 것이다.

고치는 방법은 **델리게이트 인스턴스를 필드에 붙잡아 두는 것**이다.

```csharp
IntPtr _handle;
TimerCallback? _callback;             // ← 델리게이트를 살려두는 루트

public void Start()
{
    _callback = OnTick;               // 필드에 저장
    _handle = StartTimer(_callback, 100);
}

public void Dispose()
{
    if (_handle != IntPtr.Zero)
    {
        StopTimer(_handle);           // 네이티브가 더 이상 부르지 않게 만든 뒤에야
        _handle = IntPtr.Zero;
    }
    GC.KeepAlive(_callback);          // 여기까지는 확실히 살아 있게
    _callback = null;
}
```

정적 메서드 콜백이라면 델리게이트 인스턴스를 `static readonly` 필드에 대입하는 것만으로 충분하다(앞의 `printWindowFunc`가 그 패턴이다). 인스턴스 메서드 콜백은 그 방법이 통하지 않으므로, **콜백이 일어날 수 있는 전 기간 동안 최소 하나의 참조를 유지하도록** 신경 써서 코딩해야 한다.

> **⚠️ 필드에 넣었다고 끝이 아니다 — `GC.KeepAlive`가 필요한 이유**
>
> GC는 어휘 범위가 아니라 **실제 생존 범위**를 본다(64.4절). `Dispose` 안에서 `_callback` 필드를 마지막으로 읽은 뒤에는, JIT이 만든 GC 정보상 `this`조차 더 이상 살아 있지 않을 수 있다. 그 상태에서 `StopTimer` P/Invoke가 실행되는 동안 GC가 돌면 델리게이트가 수집되고, 마침 그 순간 네이티브 타이머 스레드가 마지막 tick을 발사하면 크래시가 난다.
>
> `GC.KeepAlive(_callback)`은 아무 일도 하지 않는 메서드지만, JIT에게 "이 지점까지 이 참조가 살아 있어야 한다"고 알려준다. 34.8절에서 이 메커니즘을 자세히 다뤘다.

> **⚠️ `CallbackOnCollectedDelegate`는 .NET Framework 전용 진단이다**
>
> .NET Framework에는 수집된 델리게이트가 호출될 때 이를 잡아내는 관리 디버깅 도우미(MDA) `callbackOnCollectedDelegate`가 있었다. **.NET(Core) 이후에는 MDA 인프라 자체가 없다.** 같은 버그가 이제는 아무 진단 없이 접근 위반으로만 나타난다. 그만큼 코드 리뷰에서 잡아야 한다.

> **💡 함수마다 별도 델리게이트 타입을 정의하라**
>
> 여러 네이티브 함수에 같은 시그니처의 델리게이트를 재사용하지 마라. 크래시했을 때 예외 정보에 **델리게이트 타입 이름**이 나오는데, 타입이 함수마다 다르면 어느 콜백이 죽었는지 즉시 알 수 있다. 이건 순전히 진단을 위한 설계다.

### 콜백의 호출 규약

콜백의 호출 규약이 플랫폼 기본과 다르면 델리게이트에 `[UnmanagedFunctionPointer]`를 적용한다.

```csharp
[UnmanagedFunctionPointer(CallingConvention.Cdecl)]
delegate void MyCallback(int foo, short bar);
```

### 델리게이트 ↔ 함수 포인터 변환

이미 갖고 있는 델리게이트에서 네이티브 함수 포인터를 얻거나 그 반대를 하려면 `Marshal`을 쓴다.

```csharp
MyCallback cb = Handler;
IntPtr fp = Marshal.GetFunctionPointerForDelegate(cb);      // 썽크 주소
// ... fp를 네이티브에 전달 ...
GC.KeepAlive(cb);                       // cb가 살아 있어야 fp가 유효하다
var back = Marshal.GetDelegateForFunctionPointer<MyCallback>(fp);   // 반대 방향
```

> **⚠️ `GetFunctionPointerForDelegate`가 반환한 주소의 수명은 델리게이트의 수명이다**
>
> `IntPtr`은 GC에게 아무 의미도 없는 숫자다. 델리게이트가 수집되면 그 주소는 무효가 되지만, `IntPtr` 변수는 여전히 같은 숫자를 담고 있어서 코드상으로는 아무 문제가 없어 보인다. 이 API를 쓸 때는 **반드시** 델리게이트 참조의 수명을 명시적으로 관리하라.

> **📌 함수 포인터와 델리게이트, 무엇을 고를까**
>
> | 기준 | `delegate*` | 델리게이트 |
> |---|---|---|
> | 인스턴스 메서드 콜백 | 불가 | 가능 |
> | 클로저·캡처 | 불가 | 가능(다만 상태는 `lParam`으로 넘기는 것이 정석) |
> | 수명 관리 | 불필요(정적 메서드) | **필수** |
> | 호출 오버헤드 | 최소 | 썽크 1단계 추가 |
> | `unsafe` 필요 | 필요 | 불필요 |
> | Native AOT 친화성 | 높음 | 보통 |
>
> **정적 메서드로 표현할 수 있는 콜백은 함수 포인터를 써라.** 수명 함정이 원천적으로 사라진다. 상태가 필요하면 `GCHandle`을 `lParam`에 담아 넘기는 고전적 기법을 쓴다(60.8절).

---

## 60.5 C 공용체(union) 시뮬레이션과 구조체를 비관리 메모리에 매핑하기

### 공용체란 무엇인가

구조체의 각 필드는 자기 데이터를 저장할 만큼의 공간을 받는다. `int` 하나와 `char` 하나가 든 구조체에서 `int`가 오프셋 0에 있고 4바이트를 보장받으면, `char`는 최소 오프셋 4에서 시작한다. 만약 `char`가 오프셋 2에서 시작한다면 `char`에 값을 대입할 때 `int`의 값도 바뀔 것이다.

혼란스럽게 들리지만, C 언어에는 정확히 그렇게 동작하는 구조체의 변형인 **공용체(union)** 가 있다. C#에서는 `LayoutKind.Explicit`과 `[FieldOffset]`으로 이를 시뮬레이션한다.

### 완전 예제 — MIDI 메시지

외부 신시사이저로 음을 하나 연주한다고 해보자. Windows 멀티미디어 API가 MIDI 프로토콜로 이 일을 하는 함수를 제공한다. (`winmm.dll`은 **Windows 전용**이다. 아래에서 배우는 명시적 레이아웃 자체는 플랫폼과 무관하다.)

```csharp
[DllImport("winmm.dll")]
public static extern uint midiOutShortMsg(IntPtr handle, uint message);
```

두 번째 인수 `message`가 어떤 음을 연주할지 기술한다. 문제는 이 32비트 부호 없는 정수를 구성하는 일이다 — 내부적으로 바이트 단위로 나뉘어 MIDI 채널, 음, 타건 세기를 표현한다. `<<`, `>>`, `&`, `|`로 시프트·마스킹할 수도 있지만, 명시적 레이아웃 구조체가 훨씬 단순하다.

```csharp
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Explicit)]
public struct NoteMessage
{
    [FieldOffset(0)] public uint PackedMsg;   // 4바이트 길이

    [FieldOffset(0)] public byte Channel;     // FieldOffset도 0
    [FieldOffset(1)] public byte Note;
    [FieldOffset(2)] public byte Velocity;
}
```

`Channel`, `Note`, `Velocity` 필드가 32비트 패킹 메시지와 **의도적으로 겹친다**. 덕분에 어느 쪽으로도 읽고 쓸 수 있다. 다른 필드를 동기화하기 위한 계산이 전혀 필요 없다.

```csharp
NoteMessage n = new NoteMessage();
Console.WriteLine(n.PackedMsg);   // 0

n.Channel  = 10;
n.Note     = 100;
n.Velocity = 50;
Console.WriteLine(n.PackedMsg);   // 3302410

n.PackedMsg = 3328010;
Console.WriteLine(n.Note);        // 200
```

`3302410`은 `50 * 65536 + 100 * 256 + 10`이다. 리틀 엔디언 기계에서 오프셋 0이 최하위 바이트이므로 이렇게 나온다.

> **⚠️ 명시적 레이아웃은 엔디언에 의존한다**
>
> 위 계산은 리틀 엔디언(x86, x64, 대부분의 ARM 구성)을 전제한다. 빅 엔디언 플랫폼에서는 `Channel`이 최상위 바이트가 된다. 바이트 순서가 프로토콜로 정해진 데이터(네트워크 패킷 등)를 다룰 때는 공용체 대신 **명시적 비트 시프트**를 쓰거나 `BinaryPrimitives.ReadUInt32BigEndian` 같은 API를 써라. 공용체는 "이 메모리를 두 가지 시선으로 본다"는 뜻이지 "바이트 순서를 정한다"는 뜻이 아니다.

### 참조 타입을 겹치면 타입 로드가 실패한다

명시적 레이아웃에는 CLR이 강제하는 규칙이 하나 있다. **관리 참조를 담는 필드는 다른 필드와 겹칠 수 없다.**

```csharp
[StructLayout(LayoutKind.Explicit)]
struct Broken
{
    [FieldOffset(0)] public object Obj;   // 참조
    [FieldOffset(0)] public IntPtr Ptr;   // 정수
}
```

이 코드는 **컴파일된다.** 하지만 이 타입을 처음 사용하는 순간 `TypeLoadException`이 난다.

```text
System.TypeLoadException: Could not load type 'Broken' from assembly '...'
because it contains an object field at offset 0 that is incorrectly aligned
or overlapped by a non-object field.
```

이유는 GC다. GC는 객체 그래프를 순회할 때 타입의 레이아웃 정보를 보고 "오프셋 0에 참조가 있다"고 판단해 그 값을 포인터로 따라간다. 같은 자리에 정수를 써 넣을 수 있다면 GC는 임의의 정수를 객체 주소로 역참조하게 된다. CLR이 그 가능성을 로드 시점에 차단하는 것이다.

> **💡 참조와 정수를 겹쳐야 한다면**
>
> 그런 요구는 대개 "핸들과 객체 중 하나를 담는다"는 설계에서 나온다. 겹치지 말고 **판별 필드 + 두 개의 별도 필드**로 쓰거나, `GCHandle`로 참조를 `IntPtr`로 바꿔 담아라. 후자는 GC 입장에서 온전히 정수이므로 안전하다.
>
> ```csharp
> GCHandle h = GCHandle.Alloc(myObject);   // 강한 핸들, 이동은 허용
> IntPtr asInt = GCHandle.ToIntPtr(h);     // 정수로 안전하게 저장 가능
> var back = (MyType)GCHandle.FromIntPtr(asInt).Target!;
> h.Free();                                // 반드시 해제 — 안 하면 영구 누수
> ```

### 구조체를 비관리 메모리에 매핑하기

`Sequential` 또는 `Explicit` 레이아웃을 가진 구조체는 비관리 메모리에 **직접 매핑**할 수 있다. 다음 구조체를 보자.

```csharp
[StructLayout(LayoutKind.Sequential)]
unsafe struct MySharedData
{
    public int Value;
    public char Letter;
    public fixed float Numbers[50];
}
```

`fixed` 지시자는 고정 길이 값 타입 배열을 인라인으로 정의하게 해주고, 이것이 우리를 `unsafe` 영역으로 데려간다. 이 구조체 안에는 50개의 부동소수점 수를 위한 공간이 **인라인으로** 할당된다. 표준 C# 배열과 달리 `Numbers`는 배열에 대한 참조가 아니다 — **그것이 곧 배열이다.**

```csharp
static unsafe void Main() => Console.WriteLine(sizeof(MySharedData));
```

결과는 208이다. 4바이트 float 50개, `Value` 정수 4바이트, `Letter` 문자 2바이트로 합계 206이고, float이 4바이트 경계에 정렬되기 때문에 208로 올림된다.

가장 단순한 시연은 스택에 할당하는 것이다.

```csharp
MySharedData d;
MySharedData* data = &d;              // d의 주소를 얻는다

data->Value = 123;
data->Letter = 'X';
data->Numbers[10] = 1.45f;
```

`MySharedData* data = stackalloc MySharedData[1];`로 써도 결과는 같다.

여기까지는 관리 문맥에서도 할 수 있는 일이라 별 감흥이 없다. 그런데 `MySharedData` 인스턴스를 **GC의 관할 밖인 비관리 힙에** 저장하고 싶다면? 여기서 포인터가 진짜로 유용해진다.

```csharp
MySharedData* data = (MySharedData*)
    Marshal.AllocHGlobal(sizeof(MySharedData)).ToPointer();

data->Value = 123;
data->Letter = 'X';
data->Numbers[10] = 1.45f;
```

`Marshal.AllocHGlobal`은 비관리 힙에 메모리를 할당한다. 나중에 같은 메모리를 해제하는 방법은 이렇다.

```csharp
Marshal.FreeHGlobal(new IntPtr(data));
```

(해제를 잊으면 고전적인 메모리 누수가 된다.)

.NET 6부터는 `NativeMemory` 클래스를 쓰는 편이 낫다. 60.15절에서 다룬다.

### 구조체 안에 문자열 담기

구조체를 메모리에 직접 매핑할 때의 제약 하나는, 구조체가 **비관리 타입만** 담을 수 있다는 것이다. 예를 들어 문자열 데이터를 공유하려면 고정 문자 배열을 써야 하고, 이는 `string` 타입과의 수동 변환을 뜻한다.

```csharp
[StructLayout(LayoutKind.Sequential)]
unsafe struct MySharedData
{
    // ...

    // 200개 문자(= 400바이트) 공간을 할당한다.
    const int MessageSize = 200;
    fixed char message[MessageSize];

    // 실무에서는 이 코드를 헬퍼 클래스에 넣는 것이 보통이다.
    public string Message
    {
        get { fixed (char* cp = message) return new string(cp); }
        set
        {
            fixed (char* cp = message)
            {
                int i = 0;
                for (; i < value.Length && i < MessageSize - 1; i++)
                    cp[i] = value[i];
                cp[i] = '\0';                    // 널 종료 문자 추가
            }
        }
    }
}
```

고정 배열에 대한 **참조라는 것은 존재하지 않는다.** 대신 포인터를 얻는다. 고정 배열에 인덱싱하면 실제로는 포인터 산술을 하는 것이다.

`fixed` 키워드가 여기서 두 가지 다른 의미로 쓰인다는 점에 주의하라. 첫 번째(`fixed char message[200]`)는 구조체 안에 200개 문자 공간을 **인라인으로 할당**한다. 두 번째(`fixed (char* cp = message)`)는 CLR에게 객체를 **고정(pin)** 하라고 지시한다.

`MySharedData`는 GC 관할이 없는 비관리 세계에 있는데 왜 고정이 필요한가? 컴파일러는 그 사실을 모르고, 이 구조체가 관리 문맥에서 쓰일 수도 있다고 우려한다. 그리고 그 우려는 정당하다 — `object obj = new MySharedData();` 한 줄이면 박싱된 복사본이 힙에 생기고 가비지 컬렉션 중에 이동할 수 있는 상태가 된다.

> **⚠️ 직렬화 데이터가 할당된 공간을 넘으면 "의도치 않은 공용체"가 된다**
>
> 복잡한 타입을 구조체에 담고 싶다면 기존 직렬화 코드를 쓸 수도 있다. 단 하나의 전제는, **직렬화된 데이터의 길이가 구조체 안에 할당된 공간을 절대 넘어서는 안 된다**는 것이다. 넘으면 뒤따르는 필드들과 겹쳐 쓰게 되고, 그 결과가 바로 의도치 않은 공용체다. 경계 검사가 없으므로 예외도 나지 않는다. 길이를 쓰기 전에 검사하는 코드를 반드시 넣어라.

### `Marshal.StructureToPtr` — 비블리터블 구조체를 다루는 길

`fixed`와 포인터는 블리터블 구조체에만 통한다. 문자열 필드나 `bool`이 섞인 구조체를 비관리 버퍼에 쓰려면 마샬러를 명시적으로 부른다.

```csharp
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
struct Person
{
    public int Age;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string Name;                        // 구조체 안에 인라인 32문자
}

IntPtr buffer = Marshal.AllocHGlobal(Marshal.SizeOf<Person>());
try
{
    Marshal.StructureToPtr(new Person { Age = 42, Name = "홍길동" },
                           buffer, fDeleteOld: false);
    // ... 네이티브 API에 buffer를 넘긴다 ...
    var back = Marshal.PtrToStructure<Person>(buffer);
    Console.WriteLine($"{back.Age} {back.Name}");
}
finally
{
    Marshal.DestroyStructure<Person>(buffer);  // 문자열 등 하위 할당 해제
    Marshal.FreeHGlobal(buffer);
}
```

| API | 하는 일 |
|---|---|
| `Marshal.SizeOf<T>()` | 마샬링된 **비관리** 크기. `sizeof(T)`(관리 크기)와 다를 수 있다 |
| `Marshal.OffsetOf<T>("Field")` | 비관리 레이아웃에서의 필드 오프셋 |
| `Marshal.StructureToPtr` | 관리 구조체 → 비관리 버퍼 |
| `Marshal.PtrToStructure<T>` | 비관리 버퍼 → 관리 구조체 |
| `Marshal.DestroyStructure<T>` | `StructureToPtr`이 만든 하위 할당(문자열 등) 해제 |

> **⚠️ `fDeleteOld`와 `DestroyStructure`를 빠뜨리면 누수다**
>
> `StructureToPtr`이 `[MarshalAs(UnmanagedType.LPWStr)]` 문자열 필드를 만나면 그 문자열을 담을 **별도의 비관리 버퍼를 새로 할당**한다. 같은 버퍼에 두 번째 구조체를 쓸 때 `fDeleteOld: true`를 주지 않으면 첫 번째 문자열 버퍼가 누수된다. 다 쓴 뒤 `DestroyStructure`를 부르지 않아도 마찬가지다. `AllocHGlobal`로 얻은 바깥 버퍼만 `FreeHGlobal`하면 안쪽 할당은 그대로 남는다.
>
> `ByValTStr`처럼 **인라인**된 필드는 별도 할당이 없으므로 이 문제가 없다. 어느 쪽인지는 `UnmanagedType`이 결정한다.

---

## 60.6 공유 메모리 다루기

### 메모리 매핑 파일과 공유 메모리

메모리 매핑 파일(memory-mapped file), 곧 공유 메모리는 같은 컴퓨터의 여러 프로세스가 데이터를 공유하게 해주는 기능이다. 공유 메모리는 극도로 빠르고, 파이프와 달리 공유 데이터에 **임의 접근**을 제공한다. 관리 API인 `MemoryMappedFile` 클래스는 40.14절에서 다뤘다. 여기서는 그것을 우회해 Win32 메서드를 직접 호출한다 — P/Invoke를 실전 규모로 보여주기에 좋은 예제이기 때문이다.

Win32의 `CreateFileMapping` 함수가 공유 메모리를 할당한다. 몇 바이트가 필요한지, 그리고 이 공유를 식별할 이름이 무엇인지 알려주면 된다. 다른 애플리케이션은 같은 이름으로 `OpenFileMapping`을 불러 이 메모리를 구독한다. 두 메서드 모두 핸들을 반환하고, `MapViewOfFile`을 부르면 포인터로 바꿀 수 있다.

### 완전 예제

공유 메모리 접근을 캡슐화한 클래스다.

```csharp
using System;
using System.Runtime.InteropServices;
using System.ComponentModel;

public sealed class SharedMem : IDisposable
{
    // 상수 대신 enum을 쓴다. 더 안전하고 코드가 깔끔해진다.
    enum FileProtection : uint { ReadOnly = 2, ReadWrite = 4 }          // winnt.h
    enum FileRights : uint { Read = 4, Write = 2, ReadWrite = 6 }       // WinBASE.h

    static readonly IntPtr NoFileHandle = new IntPtr(-1);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateFileMapping(IntPtr hFile, int lpAttributes,
        FileProtection flProtect, uint dwMaximumSizeHigh, uint dwMaximumSizeLow,
        string lpName);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr OpenFileMapping(FileRights dwDesiredAccess,
        bool bInheritHandle, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr MapViewOfFile(IntPtr hFileMappingObject,
        FileRights dwDesiredAccess, uint dwFileOffsetHigh, uint dwFileOffsetLow,
        uint dwNumberOfBytesToMap);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UnmapViewOfFile(IntPtr map);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern int CloseHandle(IntPtr hObject);

    IntPtr fileHandle, fileMap;

    public IntPtr Root => fileMap;

    public SharedMem(string name, bool existing, uint sizeInBytes)
    {
        fileHandle = existing
            ? OpenFileMapping(FileRights.ReadWrite, false, name)
            : CreateFileMapping(NoFileHandle, 0, FileProtection.ReadWrite,
                                0, sizeInBytes, name);
        if (fileHandle == IntPtr.Zero) throw new Win32Exception();

        // 파일 전체에 대한 읽기/쓰기 맵을 얻는다
        fileMap = MapViewOfFile(fileHandle, FileRights.ReadWrite, 0, 0, 0);
        if (fileMap == IntPtr.Zero) throw new Win32Exception();
    }

    public void Dispose()
    {
        if (fileMap != IntPtr.Zero) UnmapViewOfFile(fileMap);
        if (fileHandle != IntPtr.Zero) CloseHandle(fileHandle);
        fileMap = fileHandle = IntPtr.Zero;
    }
}
```

이 예제에서는 `SetLastError` 프로토콜로 오류 코드를 알리는 `DllImport` 메서드에 `SetLastError = true`를 지정했다. 덕분에 `Win32Exception`이 던져질 때 오류 세부 정보가 채워진다.

> **⚠️ 여기서 정수 상수 대신 `enum`을 쓴 것은 취향이 아니다**
>
> Win32와 POSIX 함수를 다루다 보면 C++ 헤더 파일(`WinUser.h` 등)에 정의된 상수 집합을 받는 정수 매개변수를 자주 만난다. 이를 단순 C# 상수로 정의하는 대신 `enum` 안에 정의하면 코드가 깔끔해지고 **정적 타입 안전성이 올라간다**. `FileRights`를 기대하는 자리에 `FileProtection` 값을 넘기는 실수를 컴파일러가 잡아준다. 상수였다면 둘 다 `uint`라서 아무도 못 잡는다.
>
> Visual Studio를 설치할 때 C++ 카테고리에서 아무것도 고르지 않더라도 **C++ 헤더 파일만은 설치하라.** 모든 네이티브 Win32 상수가 거기 정의되어 있다. Unix에서는 POSIX 표준이 상수의 **이름**만 정하고 숫자 값은 구현마다 다를 수 있으므로, 대상 OS의 실제 값을 확인해야 한다. 헤더는 보통 `/usr/include`나 `/usr/local/include`에 있다.

### 두 프로세스 연결하기

이 클래스를 시연하려면 애플리케이션 두 개를 실행해야 한다. 첫 번째는 `new SharedMem("MyShare", false, 1000)`으로 공유 메모리를 만들고 대기하고, 두 번째는 같은 이름에 `existing` 인수를 `true`로 주어 구독한다.

결과적으로 두 프로그램이 **같은 비관리 메모리를 가리키는 `IntPtr`** 을 각각 갖게 된다. 이제 이 공통 포인터를 통해 읽고 써야 한다. 한 가지 접근은 공유 데이터를 캡슐화한 클래스를 만들고 `UnmanagedMemoryStream`으로 직렬화·역직렬화하는 것이다. 하지만 데이터가 많으면 비효율적이다. 공유 메모리에 1MB의 데이터가 있는데 정수 하나만 갱신하면 되는 상황을 생각해보라. 더 나은 방법은 공유 데이터 구조를 **구조체로 정의하고 공유 메모리에 직접 매핑**하는 것이다. 60.5절에서 만든 `MySharedData`가 바로 그것이다.

```csharp
static unsafe void Main()
{
    using (SharedMem sm = new SharedMem("MyShare", false, (uint)sizeof(MySharedData)))
    {
        MySharedData* data = (MySharedData*)sm.Root.ToPointer();

        data->Value = 123;
        data->Letter = 'X';
        data->Numbers[10] = 1.45f;
        Console.WriteLine("공유 메모리에 썼다");
        Console.ReadLine();                 // 여기서 두 번째 앱을 실행한다

        Console.WriteLine($"{data->Value} {data->Letter} {data->Numbers[10]}");
        Console.ReadLine();
    }
}
```

두 번째 프로그램은 같은 코드에서 생성자의 `existing` 인수만 `true`로 바꾸고, 읽은 뒤 값을 갱신한다(첫 프로그램이 `ReadLine`에서 대기하는 동안 실행해야 한다. `using` 블록을 벗어나면 공유 메모리 객체가 해제되기 때문이다).

```csharp
using (SharedMem sm = new SharedMem("MyShare", true, (uint)sizeof(MySharedData)))
{
    MySharedData* data = (MySharedData*)sm.Root.ToPointer();
    Console.WriteLine($"{data->Value} {data->Letter} {data->Numbers[10]}");

    data->Value++;                      // 이번엔 우리가 갱신한다
    data->Letter = '!';
    data->Numbers[10] = 987.5f;
    Console.ReadLine();
}
```

두 번째 프로그램은 `123 X 1.45`를 출력하고, 그 뒤 첫 번째 프로그램은 `124 ! 987.5`를 출력한다. 같은 물리 페이지를 두 프로세스가 보고 있다는 증거다.

### 이 예제가 실제로 안전하지 않은 이유

포인터에 겁먹을 필요는 없다. C++ 프로그래머는 애플리케이션 전체에서 포인터를 쓰면서도 대개는 모든 것을 동작시킨다. 이 정도 사용은 그에 비하면 단순하다.

다만 이 예제는 **말 그대로 unsafe**하다. 다른 이유로도 그렇다. 두 프로그램이 같은 메모리에 동시에 접근할 때 발생하는 스레드 안전성(더 정확히는 프로세스 안전성) 문제를 전혀 고려하지 않았다.

프로덕션에서 쓰려면 `MySharedData` 구조체의 `Value`와 `Letter` 필드에 `volatile` 키워드를 붙여 JIT 컴파일러나 하드웨어(CPU 레지스터)가 필드를 캐시하지 못하게 해야 한다. 나아가 필드와의 상호작용이 사소한 수준을 넘어서면, 다중 스레드 프로그램에서 `lock` 문으로 필드 접근을 보호하듯 **프로세스 간 `Mutex`** 로 접근을 보호해야 할 것이다.

```csharp
using var mutex = new Mutex(false, @"Global\MySharedDataLock");   // 프로세스 간 배제
if (mutex.WaitOne(TimeSpan.FromSeconds(5)))
{
    try   { /* 공유 메모리 갱신 */ }
    finally { mutex.ReleaseMutex(); }
}
```

> **⚠️ `volatile`은 원자성을 주지 않는다**
>
> `volatile`은 "캐시하지 말고 매번 메모리에서 읽어라"는 지시일 뿐, `data->Value++` 같은 읽기-수정-쓰기를 원자적으로 만들지 않는다. 프로세스 두 개가 동시에 증가시키면 값을 잃는다. 원자적 증가가 필요하면 `Interlocked` 계열을 쓰되, 비관리 메모리에 대해서는 `Interlocked.Increment(ref *(int*)ptr)`처럼 관리 포인터를 만들어 넘겨야 한다. 프로세스 경계를 넘는 복합 연산은 `Mutex`가 정답이다.

> **📌 관리 API로 같은 일 하기**
>
> `SharedMem` 대신 내장 `MemoryMappedFile` 클래스를 쓸 수 있다.
>
> ```csharp
> using (MemoryMappedFile mmFile = MemoryMappedFile.CreateNew("MyShare", 1000))
> using (MemoryMappedViewAccessor accessor = mmFile.CreateViewAccessor())
> {
>     byte* pointer = null;
>     accessor.SafeMemoryMappedViewHandle.AcquirePointer(ref pointer);
>     try
>     {
>         void* root = pointer;
>         // ...
>     }
>     finally { accessor.SafeMemoryMappedViewHandle.ReleasePointer(); }
> }
> ```
>
> `AcquirePointer`/`ReleasePointer` 쌍을 지키는 것이 중요하다. `SafeHandle`의 참조 카운트를 조작하는 API이므로, 짝을 맞추지 않으면 핸들이 조기에 닫히거나(크래시) 영원히 열려 있게 된다(누수).

> **⚠️ 이름 있는 메모리 매핑은 Windows 전용이다**
>
> `MemoryMappedFile.CreateNew(name, capacity)`처럼 **이름을 주는 오버로드는 Unix에서 `PlatformNotSupportedException`을 던진다.** Linux/macOS에서 프로세스 간 공유 메모리가 필요하면 실제 파일을 `CreateFromFile`로 매핑하거나(`/dev/shm` 아래 파일이 관례다), `shm_open`을 직접 P/Invoke해야 한다. 이 절의 `SharedMem` 클래스도 `kernel32.dll`을 부르므로 당연히 Windows 전용이다.

---

## 60.7 `unsafe`, 포인터, 멤버 접근 연산자, `void*`

### 포인터의 기초

C#은 `unsafe`로 표시된 코드 블록 안에서 포인터를 통한 직접 메모리 조작을 지원한다. 포인터 타입은 네이티브 API와의 상호운용, 관리 힙 바깥 메모리 접근, 성능이 중요한 지점의 미세 최적화에 유용하다. `unsafe` 코드를 포함하는 프로젝트는 프로젝트 파일에 다음을 지정해야 한다.

```xml
<PropertyGroup>
  <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
</PropertyGroup>
```

모든 값 타입 또는 참조 타입 `V`에 대해 대응하는 포인터 타입 `V*`가 있다. 포인터 인스턴스는 변수의 주소를 담는다. 포인터 타입은 (안전하지 않게) 다른 어떤 포인터 타입으로도 캐스팅할 수 있다.

| 연산자 | 의미 |
|---|---|
| `&` | 주소 연산자. 변수의 주소를 가리키는 포인터를 반환한다 |
| `*` | 역참조 연산자. 포인터가 가리키는 주소의 변수를 반환한다 |
| `->` | 멤버 접근 연산자. `x->y`는 `(*x).y`와 같다 |

C와 마찬가지로 포인터에 정수 오프셋을 더하거나 빼면 또 다른 포인터가 나온다. 포인터에서 포인터를 빼면 (32비트·64비트 양쪽에서) 64비트 정수가 나온다.

### `unsafe` 블록

타입·멤버·문 블록에 `unsafe`를 붙이면 그 범위 안에서 포인터 타입과 C 스타일 포인터 연산을 쓸 수 있다. 비트맵을 빠르게 처리하는 예다.

```csharp
unsafe void BlueFilter(int[,] bitmap)
{
    int length = bitmap.Length;
    fixed (int* b = bitmap)
    {
        int* p = b;
        for (int i = 0; i < length; i++)
            *p++ &= 0xFF;
    }
}
```

`unsafe` 코드는 대응하는 안전한 구현보다 빠를 수 있다. 이 경우 안전한 버전은 중첩 루프와 배열 인덱싱, 경계 검사가 필요했을 것이다. `unsafe` C# 메서드는 외부 C 함수를 호출하는 것보다도 빠를 수 있다 — 관리 실행 환경을 떠나는 오버헤드가 없기 때문이다.

> **⚠️ `unsafe`에는 경계 검사가 없다**
>
> 관리 코드에서 배열 범위를 벗어나면 `IndexOutOfRangeException`이 난다. 비관리 접근에는 그런 사치가 없다. 잘못된 인덱스로 접근하면 **그 메모리 주소에 있는 무언가가 그대로 반환된다.** 예외가 날 수도, 안 날 수도 있다.
>
> ```csharp
> int* p = stackalloc int[100];
> Console.WriteLine(p[99]);    // 유효
> Console.WriteLine(p[100]);   // 범위 밖 — 예외 없이 쓰레기 값
> ```
>
> `unsafe`라는 이름은 "이 코드가 위험하다"는 뜻이 아니라 **"안전 검증의 책임이 CLR에서 당신에게 넘어갔다"** 는 뜻이다. 쓰기 방향으로 범위를 벗어나면 스택이나 힙을 조용히 오염시키고, 증상은 한참 뒤 엉뚱한 곳에서 나타난다.

### 멤버 접근 연산자

`&`와 `*` 외에 C#은 C++ 스타일의 `->` 연산자를 제공하고, 구조체에 쓸 수 있다.

```csharp
struct Test { public int X; }

Test test = new Test();
unsafe { Test* p = &test; p->X = 9; Console.WriteLine(test.X); }
```

### `stackalloc`

`stackalloc` 키워드로 스택에 메모리 블록을 명시적으로 할당할 수 있다. 스택에 할당되므로 수명은 다른 지역 변수와 마찬가지로 메서드 실행 기간으로 제한된다. `[]` 연산자로 인덱싱한다.

```csharp
int* a = stackalloc int[10];
for (int i = 0; i < 10; ++i) Console.WriteLine(a[i]);
```

`Span<int> a = stackalloc int[10];`처럼 쓰면 `unsafe` 없이 스택 할당 메모리를 다룰 수 있다. 이쪽이 현대적인 기본값이다(68.9절).

> **⚠️ `stackalloc`을 루프 안에 두지 마라**
>
> `stackalloc`은 스택 포인터를 내리기만 하고, 메서드가 반환될 때까지 되돌리지 않는다. 루프 안에서 호출하면 반복마다 스택이 계속 자라 `StackOverflowException`으로 끝난다 — 그리고 이 예외는 **잡을 수 없고 프로세스를 즉시 종료시킨다.** 크기가 런타임에 결정된다면 상한을 두고, 상한을 넘으면 `ArrayPool<T>`로 전환하는 것이 표준 패턴이다.

### `void*`

`void` 포인터(`void*`)는 대상 데이터의 타입에 대해 아무 가정도 하지 않으며, 원시 메모리를 다루는 함수에 유용하다. 모든 포인터 타입에서 `void*`로의 암시적 변환이 존재한다. `void*`는 역참조할 수 없고 산술 연산도 할 수 없다.

```csharp
short[] a = { 1, 1, 2, 3, 5, 8, 13, 21, 34, 55 };
unsafe
{
    fixed (short* p = a)
        Zap(p, a.Length * sizeof(short));      // sizeof는 값 타입 크기를 바이트로
}
foreach (short x in a) Console.WriteLine(x);   // 전부 0

unsafe void Zap(void* memory, int byteCount)
{
    byte* b = (byte*)memory;
    for (int i = 0; i < byteCount; i++) *b++ = 0;
}
```

### 네이티브 크기 정수

`nint`와 `nuint`(※C# 9)는 런타임에 프로세스의 주소 공간에 맞춰 크기가 정해지는 정수 타입이다(실질적으로 32비트 또는 64비트). 산술 연산과 오버플로 검사를 전부 지원한다.

```csharp
nint x = 123, y = 234;
checked
{
    nint sum = x + y, product = x * y;
    Console.WriteLine(product);
}
```

포인터를 다룰 때 `nint`는 효율을 올린다. C#에서 두 포인터를 빼면 결과가 항상 64비트 `long`인데, 32비트 플랫폼에서는 비효율적이다. 포인터를 먼저 `nint`로 캐스팅하면 뺄셈 결과도 `nint`가 된다.

```csharp
unsafe nint AddressDif(char* x, char* y) => (nint)x - (nint)y;
```

.NET 7 이상을 대상으로 하면 `nint`/`nuint`는 `System.IntPtr`·`System.UIntPtr`의 **별칭**이다(`int`가 `System.Int32`의 별칭인 것과 같다). .NET 7에서 `IntPtr`/`UIntPtr`에 전체 산술 능력과 오버플로 검사가 추가되었기 때문이다. .NET 6 이하 대상에서는 런타임 타입이 여전히 `IntPtr`이지만 컴파일러가 빠진 연산을 채워 넣어 같게 동작시킨다. 다만 `IntPtr`로 캐스팅하는 순간 그 "모자"는 사라진다.

```csharp
nint x = 123;
Console.WriteLine(x * x);       // OK

IntPtr y = x;
Console.WriteLine(y * y);       // .NET 6 이하 대상에서는 컴파일 오류
```

### `[SkipLocalsInit]`

C#이 메서드를 컴파일할 때, 런타임에게 지역 변수를 기본값으로 초기화(메모리를 0으로 채움)하라고 지시하는 플래그를 방출한다. C# 9부터 `[SkipLocalsInit]`(`System.Runtime.CompilerServices`)을 적용해 이 플래그를 방출하지 않게 할 수 있다. 타입 전체나 모듈 전체에도 적용할 수 있다.

```csharp
[module: System.Runtime.CompilerServices.SkipLocalsInit]
```

안전한 코드에서는 확정 대입 규칙 때문에 효과가 거의 없다. 하지만 `unsafe` 문맥, 특히 큰 `stackalloc`을 쓰는 메서드에서는 CLR이 스택을 0으로 채우는 비용을 아낄 수 있다.

```csharp
[SkipLocalsInit]
unsafe void Foo()
{
    int local;
    int* ptr = &local;
    Console.WriteLine(*ptr);        // 초기화되지 않은 메모리가 출력된다

    int* a = stackalloc int[100];
    for (int i = 0; i < 100; ++i) Console.WriteLine(a[i]);
}
```

흥미롭게도 `Span<int> a = stackalloc int[100];`으로 바꾸면 "안전한" 문맥에서도 같은 결과가 나온다.

따라서 `[SkipLocalsInit]`을 쓰려면 어떤 메서드도 `unsafe`로 표시되지 않았더라도 `<AllowUnsafeBlocks>`를 `true`로 컴파일해야 한다.

> **⚠️ `[SkipLocalsInit]`은 정보 유출 경로가 될 수 있다**
>
> 초기화되지 않은 스택에는 **직전에 그 프레임을 쓴 코드가 남긴 데이터**가 있다. 암호 키, 복호화된 평문, 다른 사용자의 요청 데이터일 수 있다. 그 버퍼를 전부 채우지 않은 채 네트워크로 내보내거나 로그에 남기면 그대로 유출된다. 모듈 전체에 `[module: SkipLocalsInit]`을 거는 것은 성능 이득에 비해 위험이 크다. **측정으로 이득이 확인된 개별 메서드에만** 붙여라.

---

## 60.8 `fixed` 문과 고정(pinning), 고정 크기 버퍼

### `fixed` 문

`fixed` 문은 관리 객체를 **고정(pin)** 하기 위해 필요하다. 가비지 컬렉터는 낭비와 단편화를 피하려고 객체를 이리저리 옮기는데, 참조하는 동안 주소가 바뀔 수 있다면 객체를 포인터로 가리키는 일은 무의미하다. `fixed` 문은 GC에게 그 객체를 움직이지 말라고 알린다. 이는 런타임 효율에 영향을 주므로 `fixed` 블록은 **짧게** 쓰고 블록 안에서 힙 할당을 피해야 한다.

`fixed` 문 안에서는 값 타입, 값 타입 배열, 문자열에 대한 포인터를 얻을 수 있다. 배열과 문자열의 경우 포인터는 실제로는 첫 번째 요소를 가리킨다.

참조 타입 안에 인라인으로 선언된 값 타입은 그 참조 타입 자체를 고정해야 한다.

```csharp
class Test { public int X; }

Test test = new Test();
unsafe
{
    fixed (int* p = &test.X) *p = 9;    // test 인스턴스 전체를 고정한다
    Console.WriteLine(test.X);
}
```

### 고정이 GC에 미치는 영향

이것이 이 절에서 가장 중요한 부분이다. 고정된 객체는 **압축 단계에서 옮길 수 없다.** 그 결과는 다음과 같다.

```text
고정 전:  [A][B][P][C][D][E]        P = 고정된 객체
             ↓ 가비지 수집 (B, D 사망)
고정 없음: [A][C][E]                 압축 완료. 빈 공간 하나
고정 있음: [A][ ][P][C][ ][E]        P를 넘어 옮길 수 없다
                ↑        ↑
             구멍(gap)  구멍
```

압축기는 고정 객체를 만나면 **그 지점에서 계획을 끊는다**(64.6절의 plug/gap 개념). 고정 객체 앞뒤로 채울 수 없는 빈 공간이 남고, 이것이 **힙 단편화**다. 세대 0에서 이런 일이 반복되면 할당 경로의 범프 포인터가 연속 공간을 못 찾아 GC 빈도가 올라간다.

.NET 5부터는 이 문제를 완화하는 전용 힙이 있다 — **POH(Pinned Object Heap, 고정 객체 힙)** 다(62.5절). 처음부터 고정될 것을 아는 버퍼는 POH에 할당하면 일반 힙을 오염시키지 않는다.

```csharp
byte[] buffer = GC.AllocateArray<byte>(4096, pinned: true);              // ※.NET 5
byte[] buf2   = GC.AllocateUninitializedArray<byte>(4096, pinned: true);
```

이렇게 만든 배열은 이미 고정되어 있으므로 `fixed` 블록이 없어도 주소가 변하지 않는다. 다만 컴파일러는 그 사실을 모르므로 포인터를 얻으려면 여전히 `fixed`나 `GCHandle`이 필요하다.

> **⚠️ 고정의 비용은 "얼마나 오래"보다 "어디에"가 지배한다**
>
> 흔한 오해는 "짧게 고정하면 괜찮다"는 것이다. 실제로 중요한 것은 **고정된 객체가 세대 0/1의 한가운데 있는가**다. 방금 할당한 작은 버퍼를 고정하면 그것은 세대 0 한복판이고, 그 순간 GC가 일어나면 세대 0 압축 계획 전체가 갈라진다. 반대로 오래 살아 세대 2로 승격된 객체는 애초에 자주 압축되지 않으므로 오래 고정해도 영향이 작다.
>
> 그래서 실무 지침은 "짧게 고정하라"가 아니라 **"고정할 버퍼는 오래 재사용하라"** 이다. 요청마다 새 배열을 잠깐씩 고정하는 코드가, 큰 버퍼 하나를 POH에 만들어 계속 쓰는 코드보다 GC에 훨씬 나쁘다. 64.7절에서 계획 단계 관점으로 다시 본다.

### 빈 배열의 함정

```csharp
byte[] empty = Array.Empty<byte>();
unsafe
{
    fixed (byte* p = empty) Console.WriteLine(p == null);   // True
}
```

길이가 0인 배열이나 `null` 배열을 `fixed`하면 포인터는 **널**이 된다. 네이티브 함수에 그대로 넘기면 널 포인터 역참조가 된다. 길이 0을 정상 입력으로 받는 API라면 문제없지만, 그렇지 않다면 호출 전에 검사해야 한다. `fixed (byte* p = &MemoryMarshal.GetReference(span))` 형태로 우회하는 관용구도 널을 만들 수 있다는 점은 같다.

### 고정 크기 버퍼

`fixed` 키워드에는 두 번째 용도가 있다. 구조체 안에 **고정 크기 버퍼**를 만드는 것이다.

```csharp
unsafe struct UnsafeUnicodeString
{
    public short Length;
    public fixed byte Buffer[30];       // 30바이트 블록을 인라인으로 할당
}

unsafe class UnsafeClass
{
    UnsafeUnicodeString uus;

    public UnsafeClass(string s)
    {
        uus.Length = (short)s.Length;
        fixed (byte* p = uus.Buffer)                    // 여기서는 "위치 고정"
            for (int i = 0; i < s.Length; i++) p[i] = (byte)s[i];
    }
}
```

고정 크기 버퍼는 배열이 아니다. `Buffer`가 배열이라면 구조체 안 30바이트가 아니라 관리 힙에 저장된 객체에 대한 참조 하나가 될 것이다.

이 예제에서 `fixed` 키워드는 버퍼를 담고 있는 힙 상의 객체(`UnsafeClass` 인스턴스)를 고정하는 데도 쓰였다. 따라서 `fixed`는 서로 다른 두 가지를 뜻한다 — **크기가 고정됨**과 **위치가 고정됨**. 고정 크기 버퍼를 쓰려면 위치도 고정되어야 하므로 둘은 함께 쓰이는 경우가 많다.

고정 크기 버퍼로 쓸 수 있는 요소 타입은 `bool`, `byte`, `sbyte`, `short`, `ushort`, `int`, `uint`, `long`, `ulong`, `char`, `float`, `double`뿐이다. 임의의 구조체는 안 된다. 그 제약을 풀어주는 것이 C# 12의 **인라인 배열**이며 68.10절에서 다룬다.

### 고정과 할당 — 무엇을 쓸 것인가

이 장에서 지금까지 나온 네 가지 선택지를 한 표로 정리한다.

| 방법 | 대상 | 수명 | 이동 여부 | 해제 | 언제 쓰나 |
|---|---|---|---|---|---|
| `fixed (T* p = arr)` | 관리 배열·문자열·필드 | **블록 범위** | 블록 안에서 고정 | 자동 | 짧은 동기 호출. 가장 흔한 기본 |
| `GCHandle.Alloc(o, Pinned)` | 관리 블리터블 객체 | **명시적** (`Free`까지) | 고정 | `handle.Free()` **필수** | 비동기·콜백처럼 블록을 넘어 고정이 필요할 때 |
| `GC.AllocateArray<T>(n, pinned: true)` | 새 배열 | 객체 수명 전체 | 항상 고정(POH) | GC | 장수 I/O 버퍼. 단편화를 원천 차단 |
| `Marshal.AllocHGlobal(n)` | 비관리 힙 | **명시적** | 관리 힙 밖 | `FreeHGlobal` **필수** | 네이티브가 오래 들고 있을 메모리 |
| `NativeMemory.Alloc(n)` | 비관리 힙 | **명시적** | 관리 힙 밖 | `NativeMemory.Free` **필수** | 위와 같되 정렬 제어가 필요할 때(※.NET 6) |
| `stackalloc` | 스택 | 메서드 프레임 | 이동 없음 | 자동 | 작고(수 KB 이하) 짧은 버퍼 |

`GCHandle`은 `fixed`가 표현할 수 없는 수명을 표현한다.

```csharp
byte[] data = new byte[1024];
GCHandle handle = GCHandle.Alloc(data, GCHandleType.Pinned);
try
{
    StartAsyncNativeRead(handle.AddrOfPinnedObject(), data.Length);
    // ... 네이티브 콜백으로 완료를 기다린다 ...
}
finally { handle.Free(); }   // 잊으면 이 배열은 영원히 고정된 채 남는다
```

> **⚠️ `GCHandle.Free`를 빠뜨리면 누수와 단편화가 동시에 온다**
>
> `GCHandle`은 GC 루트다. `Free`하지 않으면 대상 객체는 **영원히 살아 있고**(누수), `Pinned`라면 **영원히 그 자리에 못 박혀 있다**(단편화). `fixed`와 달리 컴파일러가 지켜주지 않으므로 `try/finally`가 필수다. 핸들 종류는 다음과 같다.
>
> | `GCHandleType` | 대상을 살리는가 | 고정하는가 |
> |---|---|---|
> | `Weak` | 아니다 | 아니다 |
> | `WeakTrackResurrection` | 아니다(부활 추적) | 아니다 |
> | `Normal` | **그렇다** | 아니다 |
> | `Pinned` | **그렇다** | **그렇다** |

> **💡 콜백에 상태를 전달하는 정석 패턴**
>
> 60.4절에서 미룬 것을 여기서 갚는다. 네이티브 콜백에 관리 객체를 전달하려면 `Normal` 핸들을 정수로 바꿔 `lParam`/`context`에 실어 보낸다.
>
> ```csharp
> GCHandle gch = GCHandle.Alloc(new MyState());         // Normal — 이동은 허용
> try { EnumWindows(&Callback, GCHandle.ToIntPtr(gch)); } finally { gch.Free(); }
>
> [UnmanagedCallersOnly]
> static byte Callback(IntPtr hWnd, IntPtr lParam)
> {
>     ((MyState)GCHandle.FromIntPtr(lParam).Target!).Count++;
>     return 1;
> }
> ```
>
> `Pinned`가 아니라 `Normal`인 것이 요점이다. 객체를 살려두기만 하면 되고 주소를 쓰는 것이 아니므로 고정할 이유가 없다. 이 구분을 아는 것과 모르는 것이 GC 부담에서 갈린다.

---

## 60.9 `[LibraryImport]` 소스 생성 P/Invoke ※.NET 7+

### 왜 새로 만들었나

`[DllImport]`의 마샬링 스텁은 **런타임에 IL로 생성**된다. 이 설계에는 세 가지 문제가 있다.

1. **Native AOT와 맞지 않는다.** AOT에는 런타임 IL 생성이 없다(55.7절).
2. **디버깅할 수 없다.** 마샬링 코드가 소스에 없으므로 무엇이 어떻게 복사되는지 볼 수 없다.
3. **비용이 숨어 있다.** 시그니처만 봐서는 어느 인수가 할당을 유발하는지 알기 어렵다.

`[LibraryImport]`(※.NET 7)는 마샬링 코드를 **컴파일 타임에 C# 소스로 생성**한다. 생성된 코드는 IDE에서 열어 읽을 수 있고, 그 안쪽에는 블리터블 시그니처만 남은 최소한의 `[DllImport]`가 들어 있다.

### 문법과 요구사항

```csharp
using System.Runtime.InteropServices;

internal static partial class Native
{
    [LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16)]
    [return: MarshalAs(UnmanagedType.I4)]
    internal static partial int MessageBox(IntPtr hWnd, string text,
                                           string caption, int type);
}
```

요구사항은 명확하다.

- 메서드는 `static partial`이어야 한다(`extern`이 아니다).
- 담고 있는 타입도 전부 `partial`이어야 한다.
- 문자열이나 `char`가 시그니처에 있으면 `StringMarshalling`(또는 `MarshalUsing`)을 **반드시 명시**해야 한다. 안 하면 컴파일 오류다.

### `[DllImport]`와의 차이

| 항목 | `[DllImport]` | `[LibraryImport]` |
|---|---|---|
| 스텁 생성 시점 | 런타임(IL 방출) | **컴파일 타임(C# 소스)** |
| 메서드 선언 | `static extern` | **`static partial`** |
| 문자 집합 | `CharSet` (기본 `Ansi`) | **`StringMarshalling`** (기본 없음, 명시 필수) |
| UTF-8 지원 | `UnmanagedType.LPUTF8Str` | **`StringMarshalling.Utf8` 일급 지원** |
| `ExactSpelling` | 기본 `false` (A/W 탐색) | **사실상 `true`** — A/W 접미사를 직접 써야 한다 |
| `StringBuilder` | 지원 | **미지원** |
| 사용자 정의 마샬링 | 제한적 | `[MarshalUsing]` + 마샬러 타입 |
| Native AOT | 동작하지만 최적화 여지가 적다 | **권장 방식** |
| 코드 확인 | 불가 | 생성 소스를 직접 읽을 수 있다 |

> **⚠️ 마이그레이션에서 가장 많이 터지는 두 가지**
>
> **① A/W 접미사.** `[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int MessageBox(...)`는 런타임이 `MessageBoxW`를 찾아준다. 그대로 `[LibraryImport]`로 바꾸면 `EntryPointNotFoundException`이 난다. `EntryPoint = "MessageBoxW"`를 직접 써야 한다.
>
> **② `bool` 반환.** `[DllImport]`는 `bool` 반환값을 기본적으로 4바이트 `BOOL`로 마샬링한다. `[LibraryImport]`는 **명시를 요구**하므로 `[return: MarshalAs(UnmanagedType.Bool)]`을 붙여야 한다. 안 붙이면 컴파일 오류로 잡히니 그나마 다행이지만, 대량 변환 스크립트를 돌리면 여기서 수십 개가 걸린다.

### 마이그레이션 실전 대비

같은 함수 셋을 두 방식으로 나란히 쓴다. 먼저 기존 코드다.

```csharp
// ── 변환 전 ──────────────────────────────────────────────
internal static class Before
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetWindowsDirectory(StringBuilder sb, int maxChars);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern IntPtr CreateFileMapping(IntPtr hFile, IntPtr lpAttributes,
        uint flProtect, uint hi, uint lo, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern bool CloseHandle(IntPtr hObject);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    internal static extern int MessageBox(IntPtr h, string text, string cap, uint type);
}
```

변환 후다. 바뀐 지점마다 주석을 달았다.

```csharp
// ── 변환 후 ──────────────────────────────────────────────
internal static partial class After           // ① 타입도 partial
{
    // ② StringBuilder는 지원되지 않는다 → Span<char>로
    // ③ CharSet.Unicode → StringMarshalling.Utf16
    // ④ A/W 접미사를 직접 지정
    [LibraryImport("kernel32.dll", EntryPoint = "GetWindowsDirectoryW",
                   SetLastError = true)]
    internal static partial int GetWindowsDirectory(Span<char> buffer, int maxChars);

    [LibraryImport("kernel32.dll", EntryPoint = "CreateFileMappingW",
                   StringMarshalling = StringMarshalling.Utf16, SetLastError = true)]
    internal static partial IntPtr CreateFileMapping(IntPtr hFile, IntPtr lpAttributes,
        uint flProtect, uint hi, uint lo, string lpName);

    // ⑤ bool 반환에는 MarshalAs 필수
    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool CloseHandle(IntPtr hObject);

    [LibraryImport("user32.dll", EntryPoint = "MessageBoxW",
                   StringMarshalling = StringMarshalling.Utf16)]
    internal static partial int MessageBox(IntPtr h, string text, string cap, uint type);
}
```

호출부는 `Span<char> buf = stackalloc char[260]; int len = After.GetWindowsDirectory(buf, buf.Length);`처럼 바뀌지만, 나머지 시그니처의 사용법은 그대로다.

### 생성된 코드는 어떻게 생겼나

`CloseHandle`에 대해 생성기가 만드는 코드의 골자는 다음과 같다(실제 출력은 더 장황하다).

```csharp
internal static partial class After
{
    internal static partial bool CloseHandle(IntPtr hObject)
    {
        unsafe
        {
            Marshal.SetLastSystemError(0);
            int __retVal = __PInvoke(hObject);       // 블리터블 전용 스텁 호출
            Marshal.SetLastPInvokeError(Marshal.GetLastSystemError());
            return __retVal != 0;                    // BOOL → bool

            // 안쪽 P/Invoke는 지역 함수로 생성되고 ExactSpelling = true 가 붙는다
            [DllImport("kernel32.dll", EntryPoint = "CloseHandle", ExactSpelling = true)]
            static extern unsafe int __PInvoke(IntPtr hObject);
        }
    }
}
```

핵심은 안쪽 `__PInvoke`의 시그니처가 **완전히 블리터블**이라는 점이다. 런타임 마샬러가 할 일이 하나도 없으므로 스텁이 사실상 직접 호출이 된다. `bool` 변환 같은 작업은 전부 관리 코드로 올라왔고, 그래서 읽을 수 있고 디버깅할 수 있고 인라인될 수 있다.

> **📌 `SYSLIB1054` 분석기가 변환을 도와준다**
>
> .NET 7 이상을 대상으로 하면 `[DllImport]`를 볼 때마다 `SYSLIB1054` 정보성 진단이 뜬다. Visual Studio나 `dotnet format` 코드 수정으로 대부분 자동 변환된다. 다만 위에서 본 A/W 접미사와 `StringBuilder`는 자동으로 처리되지 않으니 반드시 눈으로 확인하라.

### 사용자 정의 마샬러

`[MarshalUsing]`으로 타입별 변환 로직을 직접 제공할 수 있다. 마샬러는 특성이 아니라 **정해진 모양(shape)의 정적 클래스**다.

```csharp
using System.Runtime.InteropServices.Marshalling;

[CustomMarshaller(typeof(Version), MarshalMode.ManagedToUnmanagedIn,
                  typeof(VersionMarshaller))]
internal static class VersionMarshaller
{
    public static uint ConvertToUnmanaged(Version v)
        => (uint)((v.Major << 16) | (ushort)v.Minor);
}

[LibraryImport("mylib")]
internal static partial void SetVersion(
    [MarshalUsing(typeof(VersionMarshaller))] Version v);
```

`MarshalMode`에는 `ManagedToUnmanagedIn`/`Out`/`Ref`, `UnmanagedToManagedIn`/`Out`/`Ref`, `ElementIn`/`Out`/`Ref`, 그리고 모든 모드를 아우르는 `Default`가 있다. 마샬러는 위처럼 메서드 하나짜리 **상태 없는(stateless)** 형태로도, 인스턴스에 중간 버퍼를 들고 `Free`로 정리하는 **상태 있는(stateful)** 형태로도 쓸 수 있다. 컬렉션을 마샬링하려면 `[ContiguousCollectionMarshaller]`를 붙이고 `AllocateContainerForUnmanagedElements` 같은 별도 규약의 멤버를 구현한다.

> **💡 언제 `[DllImport]`를 남겨둘 것인가**
>
> `[LibraryImport]`가 항상 정답은 아니다.
>
> - `netstandard2.0`이나 .NET Framework를 함께 대상으로 하는 라이브러리 — 소스 생성기가 동작하지 않는다.
> - COM 인터페이스 포인터를 직접 다루는 시그니처 — `[GeneratedComInterface]`(60.13절)로 옮기는 편이 낫다.
> - 호출 빈도가 극히 낮고 시그니처가 복잡한 레거시 API — 변환 위험이 이득보다 크다.
>
> 나머지는 전부 옮겨라. 특히 **AOT 게시를 계획한다면 선택의 여지가 없다.**

---

## 60.10 `SuppressGCTransition`과 호출 오버헤드 제거

60.1절의 다이어그램에서 ④와 ⑤ 단계가 GC 모드 전환이었다. `[SuppressGCTransition]`(※.NET 5)은 이 두 단계를 **생략**한다.

```csharp
using System.Runtime.InteropServices;

[LibraryImport("mylib")]
[SuppressGCTransition]
internal static partial int FastAdd(int a, int b);
```

함수 포인터에도 같은 지시를 걸 수 있다.

```csharp
delegate* unmanaged[Cdecl, SuppressGCTransition]<int, int, int> fp;
```

효과는 크다. 전환 없는 블리터블 P/Invoke는 관리 메서드 직접 호출과 사실상 구분되지 않는다 — 프레임 푸시/팝과 두 번의 스레드 상태 변경이 통째로 사라지기 때문이다. `Math` 계열 함수나 SIMD 커널처럼 **나노초 단위로 끝나는 함수를 초당 수백만 번 부르는** 경우에만 의미 있는 차이가 난다.

### 무엇이 위험한가

GC 모드 전환을 생략한다는 것은 **스레드가 협조 모드인 채로 네이티브 코드에 들어간다**는 뜻이다. 협조 모드 스레드는 GC가 시작되려면 안전 지점까지 도달해야 하는데, 네이티브 코드 안에는 안전 지점이 없다. 따라서 **그 네이티브 호출이 끝날 때까지 프로세스 전체의 GC가 시작되지 못한다.**

> **⚠️ `SuppressGCTransition`이 만드는 데드락**
>
> 다음 시나리오를 보라.
>
> 1. 스레드 A가 `[SuppressGCTransition]`이 붙은 네이티브 함수를 호출한다. 그 함수는 내부적으로 락을 잡고 오래 기다린다.
> 2. 스레드 B가 할당을 시도하다 GC를 트리거한다.
> 3. GC는 모든 관리 스레드를 안전 지점에서 멈춰야 한다. 스레드 A는 협조 모드이므로 **기다려야 한다.**
> 4. 스레드 A가 기다리는 락은 스레드 B(또는 GC에 의해 멈춘 다른 스레드)가 쥐고 있다.
>
> 결과는 프로세스 전체 정지다. `SuppressGCTransition` 없이는 3단계에서 스레드 A가 선점 모드였을 것이므로 GC가 그냥 진행됐을 것이다. **이 특성은 "블로킹하지 않는다"는 것을 증명할 수 있는 함수에만 붙여야 한다.**

추가 제약도 있다.

| 항목 | 내용 |
|---|---|
| 실행 시간 | **수 마이크로초 이내**여야 한다. 대기·I/O·락 획득이 있으면 절대 안 된다 |
| 관리 코드 재진입 | 콜백으로 관리 코드를 다시 부르면 **정의되지 않은 동작**이다 |
| 예외 | 네이티브 예외가 이 경계를 넘으면 런타임이 상태를 복구하지 못한다 |
| 락 | 락이나 동시성 프리미티브를 조작해서는 안 된다 |
| `SetLastError` | 오류 캡처에 추가 작업이 들어가 전환 생략으로 번 이득이 대부분 상쇄된다. 함께 쓰지 않는 편이 낫다 |
| 시그니처 | 실질적으로 블리터블이어야 한다. 마샬링 코드는 관리 힙을 건드리기 때문이다 |
| 진단 | 혼합 모드 디버깅에서 이 P/Invoke에 중단점을 걸거나 단계 실행할 수 없다. 네이티브 쪽을 디버깅해야 한다면 붙이지 마라 |

> **💡 판단 기준 한 줄**
>
> 특성 문서가 요구하는 조건은 다섯이다 — **사소한 시간(1마이크로초 미만) 안에 끝나고, 블로킹 시스템 호출을 하지 않고, 런타임으로 되돌아오지 않고, 예외를 던지지 않고, 락을 조작하지 않는다.** 이를 문서나 소스로 증명할 수 있으면 붙여도 된다. 잘못 쓰면 문서가 명시한 결과는 셋이다 — GC 기아, 즉시 런타임 종료, 데이터 손상. 셋 중 하나라도 확신이 없으면 붙이지 마라. 이득은 나노초 단위인데 실패 모드는 프로세스 정지다. 붙이기 전과 후를 BenchmarkDotNet으로 측정해서 실제 이득을 확인하는 것도 필수다 — 마샬링이 남아 있으면 이득이 0에 가깝다.

---

## 60.11 함수 포인터 `delegate*`와 `[UnmanagedCallersOnly]`

### `delegate*`의 본질

함수 포인터(※C# 9)는 델리게이트와 비슷하지만 **델리게이트 인스턴스라는 간접 계층이 없다.** 메서드를 직접 가리킨다. 정적 메서드만 가리킬 수 있고, 멀티캐스트가 없으며, `unsafe` 문맥이 필요하다(런타임 타입 안전성을 우회하기 때문이다). 주 목적은 비관리 API와의 상호운용을 단순화하고 최적화하는 것이다.

함수 포인터 타입은 다음과 같이 선언한다. **반환 타입이 마지막에 온다.**

```csharp
delegate*<int, char, string, void>       // void가 반환 타입
```

이는 `void SomeFunction(int x, char y, string z)` 시그니처와 일치한다. `&` 연산자가 메서드 그룹에서 함수 포인터를 만든다.

```csharp
unsafe
{
    delegate*<string, int> functionPointer = &GetLength;
    int length = functionPointer("Hello, world");
    Console.WriteLine((IntPtr)functionPointer);      // 메서드의 메모리 주소

    // 런타임 타입 검사가 없다 — 반환 타입을 decimal로 속여도 컴파일되고 실행된다
    var bogus = (delegate*<string, decimal>)(IntPtr)functionPointer;
    Console.WriteLine(bogus("Hello"));               // 임의 메모리가 섞여 나온다
}

static int GetLength(string s) => s.Length;
```

`functionPointer`는 `Invoke`를 부를 수 있는 객체가 아니고 `Target` 참조도 없다. 대상 메서드의 주소를 담은 변수일 뿐이다.

### `unmanaged` 함수 포인터와 `[UnmanagedCallersOnly]`

함수 포인터 선언에 `unmanaged` 키워드를, 콜백 메서드에 `[UnmanagedCallersOnly]` 특성을 적용하면 성능이 더 좋아진다.

```csharp
using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

unsafe
{
    EnumWindows(&PrintWindow, IntPtr.Zero);

    [DllImport("user32.dll")]
    static extern int EnumWindows(
        delegate* unmanaged<IntPtr, IntPtr, byte> hWnd, IntPtr lParam);
}

[UnmanagedCallersOnly]
static byte PrintWindow(IntPtr hWnd, IntPtr lParam)
{
    Console.WriteLine(hWnd.ToInt64());
    return 1;
}
```

이 특성은 `PrintWindow`가 **비관리 코드에서만 호출될 수 있음**을 표시하고, 그 덕분에 런타임이 지름길을 택할 수 있다. 반환 타입을 `bool`에서 `byte`로 바꾼 것에 주목하라. `[UnmanagedCallersOnly]`가 붙은 메서드는 시그니처에 **블리터블 값 타입만** 쓸 수 있기 때문이다(60.3절).

### 기본이 아닌 호출 규약

컴파일러는 기본적으로 비관리 콜백이 플랫폼 기본 호출 규약을 따른다고 가정한다. 그렇지 않다면 `[UnmanagedCallersOnly]`의 `CallConvs` 매개변수로 명시한다.

```csharp
[UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvStdcall) })]
static byte PrintWindow(IntPtr hWnd, IntPtr lParam) { /* ... */ return 1; }
```

함수 포인터 타입에도 `unmanaged` 뒤에 특수 한정자를 넣어야 한다.

```csharp
delegate* unmanaged[Stdcall]<IntPtr, IntPtr, byte>
```

현재 지원되는 조합은 다음과 같다.

| 이름 | `unmanaged` 한정자 | 지원 타입 |
|---|---|---|
| Stdcall | `unmanaged[Stdcall]` | `CallConvStdcall` |
| Cdecl | `unmanaged[Cdecl]` | `CallConvCdecl` |
| ThisCall | `unmanaged[Thiscall]` | `CallConvThiscall` |

컴파일러는 대괄호 안에 `XYZ` 같은 아무 식별자나 넣게 해준다 — 런타임이 이해하고 `[UnmanagedCallersOnly]`에 지정한 것과 일치하는 `CallConvXYZ`라는 .NET 타입만 존재하면 된다. Microsoft가 나중에 새 호출 규약을 추가하기 쉽게 만든 설계다.

> **⚠️ `[UnmanagedCallersOnly]` 메서드에서 예외가 새어 나가면 프로세스가 죽는다**
>
> 이 특성이 붙은 메서드에서 던져진 예외는 관리 스택으로 전파될 수 없다. 네이티브 프레임을 통과할 방법이 없기 때문이다. 런타임은 `FailFast`로 프로세스를 종료시킨다. **콜백 본문 전체를 `try/catch`로 감싸고 오류를 반환 코드로 바꾸는 것이 필수다.**
>
> ```csharp
> [UnmanagedCallersOnly]
> static byte Callback(IntPtr hWnd, IntPtr lParam)
> {
>     try   { /* 실제 작업 */ return 1; }
>     catch (Exception ex) { Log(ex); return 0; }   // 절대 밖으로 내보내지 않는다
> }
> ```

> **⚠️ `[UnmanagedCallersOnly]` 메서드는 C#에서 직접 부를 수 없다**
>
> 같은 어셈블리 안에서도 그렇다. 호출하면 컴파일 오류다. 테스트하려면 함수 포인터로 얻어서 호출하거나, 실제 로직을 별도의 일반 메서드로 빼고 콜백은 얇은 래퍼로 두어야 한다. 후자가 정석이다 — 로직을 단위 테스트할 수 있게 된다.

### 관리 코드를 네이티브 진입점으로 내보내기

`[UnmanagedCallersOnly]`에 `EntryPoint`를 지정하고 Native AOT로 공유 라이브러리를 게시하면, 관리 메서드를 **네이티브 DLL의 내보내기 함수로** 노출할 수 있다.

```csharp
[UnmanagedCallersOnly(EntryPoint = "add_numbers")]
public static int AddNumbers(int a, int b) => a + b;
```

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
  <NativeLib>Shared</NativeLib>
</PropertyGroup>
```

`dotnet publish` 결과물은 C나 Python에서 그대로 로드할 수 있는 `.dll`/`.so`/`.dylib`다. C#으로 쓴 코드를 네이티브 생태계에 배포하는 가장 현대적인 경로이며, 55.7절에서 본 AOT의 실용적 용처 중 하나다.

---

## 60.12 COM 상호운용 — C#에서 COM 컴포넌트 호출, 상호 운용 형식 포함

.NET 런타임은 COM에 대한 특별 지원을 제공한다. COM 객체를 .NET에서 쓸 수 있고 그 반대도 된다. **COM은 Windows에서만 사용할 수 있다.**

### COM의 목적

COM은 Component Object Model의 약자로, 1993년 Microsoft가 발표한 라이브러리 인터페이싱 **바이너리 표준**이다. 발명 동기는 컴포넌트들이 언어 독립적이고 버전 내성적인 방식으로 서로 통신하게 만드는 것이었다. COM 이전 Windows의 접근법은 C 언어로 구조체와 함수를 선언한 DLL을 게시하는 것이었다. 이 방식은 언어에 종속적일 뿐 아니라 깨지기 쉽다 — 그런 라이브러리에서 타입의 명세는 구현과 분리될 수 없어서, 구조체에 필드를 추가하는 것만으로도 명세가 깨진다.

COM의 아름다움은 **COM 인터페이스**라는 구성물을 통해 타입의 명세를 그 구현으로부터 분리한 것이다. COM은 또한 단순한 프로시저 호출에 그치지 않고 **상태를 가진 객체의 메서드 호출**을 가능하게 했다.

> **📌 .NET은 COM 원칙의 진화형이다**
>
> 어떤 의미에서 .NET 프로그래밍 모델은 COM 프로그래밍 원칙의 진화다. .NET 플랫폼 역시 언어 간 개발을 용이하게 하고, 바이너리 컴포넌트가 의존하는 애플리케이션을 깨뜨리지 않고 진화할 수 있게 한다.

### COM 타입 시스템의 기초

COM 타입 시스템은 인터페이스를 중심으로 돈다. COM 인터페이스는 .NET 인터페이스와 비슷하지만 훨씬 더 지배적이다 — **COM 타입은 오직 인터페이스를 통해서만 기능을 노출**하기 때문이다.

.NET에서는 `public class Foo { public string Test() => "Hello"; }`처럼 타입을 단순하게 선언하고, 소비자는 `Foo`를 직접 쓴다. 나중에 `Test()`의 구현을 바꾸거나 `Test(string s)` 오버로드를 추가해도 호출하는 어셈블리를 재컴파일할 필요가 없다. 즉 .NET은 **인터페이스를 요구하지 않고도** 명세와 구현을 분리한다.

COM 세계에서는 같은 결합도 분리를 얻으려면 `Foo`가 `interface IFoo { string Test(); }` 같은 인터페이스를 통해 기능을 노출해야 하고, 호출자는 `Foo`가 아니라 `IFoo`와 상호작용한다.

오버로드를 추가하려는 순간 COM은 .NET보다 복잡해진다. 첫째, `IFoo`를 수정하면 바이너리 호환성이 깨진다 — **한 번 게시된 COM 인터페이스는 불변**이라는 것이 COM의 원칙이다. 둘째, COM은 메서드 오버로드를 허용하지 않는다. 해법은 `Foo`가 `IFoo2 { string Test(string s); }`라는 두 번째 인터페이스를 함께 구현하는 것이다. **여러 인터페이스를 지원하는 능력**이 COM 라이브러리 버전 관리의 핵심이다.

### `IUnknown`과 `IDispatch`

모든 COM 인터페이스는 **GUID**로 식별된다. COM의 루트 인터페이스는 `IUnknown`이고, 모든 COM 객체는 이를 구현해야 한다. 세 메서드를 갖는다.

| 메서드 | 역할 |
|---|---|
| `AddRef` | 참조 카운트 증가 |
| `Release` | 참조 카운트 감소. 0이 되면 객체 해제 |
| `QueryInterface` | 요청한 인터페이스를 지원하면 그 인터페이스에 대한 참조를 반환 |

`AddRef`와 `Release`는 수명 관리를 위한 것이다. COM은 자동 가비지 컬렉션이 아니라 **참조 카운팅**을 쓴다(COM은 자동 GC가 실현 가능하지 않은 비관리 코드와 함께 동작하도록 설계됐다).

동적 프로그래밍(스크립팅, 자동화)을 가능하게 하려고 COM 객체는 `IDispatch`도 구현할 수 있다. 동적 언어가 후기 바인딩 방식으로 COM 객체를 호출하게 해준다 — C#의 `dynamic`과 비슷하지만 단순 호출에만 해당한다(59장).

### RCW와 상호 운용 형식

CLR에 COM 지원이 내장되어 있다는 것은, `IUnknown`이나 `IDispatch`를 직접 다루지 않아도 된다는 뜻이다. 대신 CLR 객체를 다루면 런타임이 **RCW(Runtime-Callable Wrapper, 런타임 호출 가능 래퍼)** 를 통해 호출을 COM 세계로 마샬링한다. 런타임은 `AddRef`와 `Release` 호출로 수명 관리도 하고(.NET 객체가 파이널라이즈될 때 `Release`한다), 두 세계 사이의 기본 타입 변환도 처리한다.

RCW에 정적 타입으로 접근할 방법도 필요하다. 그것이 **COM 상호 운용 형식(COM interop type)** 이다. COM 멤버마다 .NET 멤버를 노출하는 자동 생성 프록시 타입이며, 타입 라이브러리 임포터 `tlbimp.exe`가 COM 라이브러리로부터 생성한다. COM 컴포넌트가 여러 인터페이스를 구현하면 `tlbimp.exe`는 모든 인터페이스의 멤버를 합집합으로 담은 타입 하나를 만든다.

```text
   C# 코드                      CLR                      COM 서버
 ┌──────────┐          ┌────────────────────┐        ┌────────────┐
 │ excel.   │          │       RCW          │        │            │
 │ Visible  │──호출──▶ │  ┌──────────────┐  │        │  EXCEL.EXE │
 │ = true   │          │  │ IUnknown 참조 │──┼─vtable▶│  IDispatch │
 └──────────┘          │  │ 참조 카운트    │  │        │  IUnknown  │
      ▲                │  └──────────────┘  │        └────────────┘
      │                │   파이널라이저에서   │
 상호 운용 형식          │   Release() 호출    │
 (정적 타입)            └────────────────────┘
```

Visual Studio에서는 참조 추가 대화상자의 COM 탭에서 라이브러리를 골라 상호 운용 어셈블리를 만든다. Microsoft Excel이 설치되어 있다면 Microsoft Excel Object Library를 참조해 Excel의 COM 클래스와 상호운용할 수 있다.

```csharp
using System;
using Excel = Microsoft.Office.Interop.Excel;

var excel = new Excel.Application();
excel.Visible = true;
excel.WindowState = Excel.XlWindowState.xlMaximized;

Excel.Workbook workBook = excel.Workbooks.Add();
((Excel.Range)excel.Cells[1, 1]).Font.FontStyle = "Bold";
((Excel.Range)excel.Cells[1, 1]).Value2 = "Hello World";
workBook.SaveAs(@"d:\temp.xlsx");
```

`Excel.Application` 클래스는 런타임 타입이 RCW인 COM 상호 운용 형식이다. `Workbooks`와 `Cells` 속성에 접근하면 또 다른 상호 운용 형식이 반환된다.

기존 스프레드시트를 읽을 때도 같은 방식이다 — `excel.Workbooks.Open(path)`로 열고, `worksheet.UsedRange.Rows.Count`로 사용 중인 행 수를 얻고, `workbook.Close(true, Type.Missing, Type.Missing)`와 `excel.Quit()`으로 닫는다.

### 상호 운용 형식 포함하기

역사적으로는 상호 운용 어셈블리를 다른 어셈블리처럼 참조하는 것이 유일한 선택지였다. 복잡한 COM 컴포넌트의 상호 운용 어셈블리는 매우 커질 수 있어 문제가 됐다. Microsoft Word용 작은 애드인 하나가 자기보다 자릿수가 큰 상호 운용 어셈블리를 요구했다.

상호 운용 어셈블리를 참조하는 대신 **사용하는 부분만 포함(embed)** 할 수 있다. 컴파일러가 어셈블리를 분석해 애플리케이션이 실제로 요구하는 타입과 멤버만 정확히 골라내고, 그 정의만 애플리케이션에 직접 임베드한다. 비대함과 추가 파일 배포를 동시에 피한다.

```xml
<ItemGroup>
  <COMReference Include="Microsoft.Office.Excel.dll">
    <EmbedInteropTypes>true</EmbedInteropTypes>
  </COMReference>
</ItemGroup>
```

> **⚠️ .NET(Core)에서는 상호 운용 형식 포함이 사실상 필수다**
>
> 현재 .NET에서는 상호 운용 형식을 애플리케이션에 **포함해야 한다.** 그러지 않으면 런타임이 그 타입을 찾지 못한다. Visual Studio 솔루션 탐색기에서 COM 참조를 선택하고 속성 창의 Embed Interop Types를 `true`로 설정하거나, 위처럼 `.csproj`를 직접 편집한다.

### 형식 동등성

CLR은 링크된 상호 운용 형식에 대해 **형식 동등성(type equivalence)** 을 지원한다. 두 어셈블리가 각각 상호 운용 형식에 링크했을 때, 그 형식들이 같은 COM 타입을 감싸고 있다면 동등한 것으로 취급된다. 상호 운용 어셈블리가 서로 독립적으로 생성되었더라도 마찬가지다.

형식 동등성은 `System.Runtime.InteropServices`의 `TypeIdentifierAttribute`에 의존한다. 상호 운용 어셈블리에 링크하면 컴파일러가 이 특성을 자동으로 적용하고, 그 뒤 **GUID가 같은 COM 형식은 동등한 것으로 간주**된다.

### 선택적 매개변수와 명명된 인수

COM API는 함수 오버로드를 지원하지 않으므로, 매개변수가 아주 많고 그중 다수가 선택적인 함수가 흔하다. Excel 워크북의 `Save` 메서드를 부르는 옛 방식은 이랬다.

```csharp
var missing = System.Reflection.Missing.Value;
workBook.SaveAs(@"d:\temp.xlsx", missing, missing, missing, missing,
    missing, Excel.XlSaveAsAccessMode.xlNoChange, missing, missing,
    missing, missing, missing);
```

C#의 선택적 매개변수 지원은 COM을 인식하므로 다음으로 충분하다.

```csharp
workBook.SaveAs(@"d:\temp.xlsx");
```

명명된 인수를 쓰면 위치와 무관하게 추가 인수를 지정할 수 있다.

```csharp
workBook.SaveAs(@"d:\test.xlsx", Password: "foo");
```

### 암시적 `ref` 매개변수

일부 COM API(특히 Microsoft Word)는 함수가 값을 수정하든 안 하든 **모든 매개변수를 참조 전달로 선언**한다. 인수 값을 복사하지 않아 성능이 좋아진다고 여겼기 때문이다(실제 이득은 무시할 만하다).

역사적으로 C#에서 이런 메서드를 호출하는 것은 번거로웠다. 인수마다 `ref` 키워드를 지정해야 했고, 그러면 선택적 매개변수를 쓸 수 없었다.

```csharp
object filename = "foo.doc";
object notUsed1 = Missing.Value;
object notUsed2 = Missing.Value;
Open(ref filename, ref notUsed1, ref notUsed2, /* ... */);
```

암시적 `ref` 매개변수 덕분에 COM 함수 호출에서 `ref` 한정자를 생략할 수 있고, 선택적 매개변수도 함께 쓸 수 있다.

```csharp
word.Open("foo.doc");
```

> **⚠️ 암시적 `ref`는 인수 변경을 감지하지 못한다**
>
> 호출하는 COM 메서드가 **실제로 인수 값을 변경한다면** 컴파일 타임 오류도 런타임 오류도 나지 않는다. 그냥 변경 결과가 조용히 버려진다. 값을 돌려받아야 하는 매개변수라면 `ref`를 명시적으로 써라.

### 인덱서와 동적 바인딩

`ref` 한정자를 생략할 수 있게 되면서 부수 효과가 하나 더 생겼다. `ref` 매개변수를 가진 COM 인덱서를 평범한 C# 인덱서 구문으로 접근할 수 있게 됐다. C# 인덱서는 `ref`/`out` 매개변수를 지원하지 않으므로 원래는 금지된 일이다. 인수를 받는 COM 속성도 호출할 수 있다.

```csharp
myComObject.Foo[123] = "Hello";
```

동적 바인딩은 COM 컴포넌트 호출을 두 방향으로 돕는다. 첫째, **상호 운용 형식 없이** COM 컴포넌트에 접근하게 해준다. `Type.GetTypeFromProgID`로 COM 인스턴스를 얻고 그다음부터는 동적 바인딩으로 멤버를 호출한다. IntelliSense도 없고 컴파일 타임 검사도 불가능하다.

```csharp
Type excelAppType = Type.GetTypeFromProgID("Excel.Application", true);
dynamic excel = Activator.CreateInstance(excelAppType);
excel.Visible = true;
dynamic wb = excel.Workbooks.Add();
excel.Cells[1, 1].Value2 = "foo";
```

둘째, COM의 `variant` 타입을 다룰 때 도움이 된다. `variant`는 .NET의 `object`와 대략 같은데, 설계상의 이유보다는 관행 때문에 COM API 함수에 도배되어 있다. Embed Interop Types를 켜면 런타임이 `variant`를 `object`가 아니라 **`dynamic`으로 매핑**해 캐스트를 없애준다.

```csharp
excel.Cells[1, 1].Font.FontStyle = "Bold";       // 캐스트 없음
```

대신 자동 완성을 잃는다. `Font`라는 속성이 있다는 것을 미리 알아야 한다. 그래서 보통은 결과를 알려진 상호 운용 형식에 동적으로 대입하는 편이 쉽다.

```csharp
Excel.Range range = excel.Cells[1, 1];
range.Font.FontStyle = "Bold";
```

> **📌 WinRT는 메타데이터를 쓰는 COM이다**
>
> Windows 8과 함께 도입된 **WinRT(Windows Runtime)** 는 내부적으로 COM 컴포넌트다. Microsoft가 가한 중요한 변경은, 컴포넌트 API를 기술하는 데 타입 라이브러리 대신 **.NET과 같은 ECMA-335 메타데이터**를 쓴 것이다. 메타데이터는 `.winmd` 파일에 담기고, CLR은 이미 메타데이터를 완전히 이해하므로 RCW/CCW 위에서 WinRT 타입을 거의 매끄럽게 투영(projection)할 수 있었다.
>
> 다만 **.NET 5에서 런타임 내장 WinRT 지원이 제거됐다.** 현재는 `Microsoft.Windows.CsWinRT`(C#/WinRT)가 소스 생성기로 투영 코드를 만들어내는 방식으로 대체됐다. 역사적 맥락으로만 알아두면 된다.

---

## 60.13 C# 객체를 COM에 노출하기

C#으로 작성한 클래스를 COM 세계에서 소비하게 만들 수도 있다. CLR은 **CCW(COM-Callable Wrapper, COM 호출 가능 래퍼)** 라는 프록시로 이를 가능하게 한다. CCW는 RCW와 마찬가지로 두 세계 사이의 타입을 마샬링하고, COM 프로토콜이 요구하는 `IUnknown`(과 선택적으로 `IDispatch`)을 구현한다. **CCW의 수명은 CLR의 가비지 컬렉터가 아니라 COM 쪽 참조 카운팅이 통제한다.**

### 절차

어떤 public 클래스든 인프로세스(in-proc) 서버로 노출할 수 있다. 먼저 인터페이스를 만들고, 고유 GUID를 부여하고(Visual Studio의 도구 > GUID 만들기), COM에 보이도록 선언한다.

```csharp
[ComVisible(true)]
[Guid("226E5561-C68E-4B2B-BD28-25103ABCA3B1")]     // 이 GUID를 바꿔서 쓴다
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IServer
{
    ulong Fibonacci(ulong whichTerm);
}
```

다음으로 인터페이스 구현을 제공하고, 구현에도 고유 GUID를 부여한다.

```csharp
[ComVisible(true)]
[Guid("09E01FCD-9970-4DB3-B537-0EC555967DD9")]     // 이 GUID도 바꿔서 쓴다
[ClassInterface(ClassInterfaceType.None)]
[ComDefaultInterface(typeof(IServer))]
public class Server : IServer
{
    public ulong Fibonacci(ulong whichTerm)
    {
        if (whichTerm < 1) throw new ArgumentException(nameof(whichTerm));
        ulong a = 0, b = 1;
        for (ulong i = 0; i < whichTerm; i++) (a, b) = (b, a + b);
        return a;
    }
}
```

`.csproj`에 다음 줄을 추가한다.

```xml
<PropertyGroup>
  <EnableComHosting>true</EnableComHosting>
</PropertyGroup>
```

이제 프로젝트를 빌드하면 `MyCom.comhost.dll`이라는 파일이 추가로 생성되고, 이 파일을 COM 상호운용용으로 등록할 수 있다. 관리자 권한 명령 프롬프트에서 DLL이 있는 디렉터리로 이동해 `regsvr32 MyCom.comhost.dll`을 실행한다.

그러면 COM을 지원하는 대부분의 언어에서 컴포넌트를 소비할 수 있다. 텍스트 편집기로 다음 VBScript를 만들어 탐색기에서 더블클릭하거나 명령 프롬프트에서 실행하면 된다.

```text
REM ComClient.vbs 로 저장한다
Dim obj
Set obj = CreateObject("MyCom.Server")
result = obj.Fibonacci(12)
Wscript.Echo result
```

> **⚠️ "Any CPU"라는 것이 없다**
>
> 생성되는 `comhost.dll`은 프로젝트 구성에 따라 **항상 32비트 아니면 64비트**다. 이 시나리오에 "Any CPU"는 존재하지 않는다. 32비트 COM 클라이언트(구형 VB6 앱, 32비트 Office)가 64비트 서버를 로드하는 것은 불가능하다. 양쪽을 지원하려면 두 벌을 빌드해 각각 등록해야 한다.

> **⚠️ .NET Framework와 .NET 5+는 같은 프로세스에 공존할 수 없다**
>
> .NET Framework는 .NET 5+ 또는 .NET Core와 같은 프로세스에 로드될 수 없다. 따라서 **.NET 5+ COM 서버는 .NET Framework COM 클라이언트 프로세스에 로드될 수 없고, 그 반대도 마찬가지다.** 기존 .NET Framework 애드인이 살아 있는 프로세스(예: 구형 Office 애드인 호스트)에 .NET 8 COM 서버를 넣으려는 시도는 원천적으로 실패한다.

### 레지스트리 없는 COM

전통적으로 COM은 타입 정보를 레지스트리에 추가한다. 레지스트리 없는(registry-free) COM은 객체 활성화를 레지스트리 대신 매니페스트 파일로 통제한다.

```xml
<PropertyGroup>
  <TargetFramework>net8.0</TargetFramework>
  <EnableComHosting>true</EnableComHosting>
  <EnableRegFreeCom>true</EnableRegFreeCom>
</PropertyGroup>
```

빌드하면 `MyCom.X.manifest`가 생성된다.

> **📌 .NET 5+에는 타입 라이브러리 생성이 없다**
>
> .NET 5 이상에는 COM 타입 라이브러리(`*.tlb`)를 생성하는 지원이 없다. 인터페이스의 네이티브 선언이 필요하면 IDL(Interface Definition Language) 파일이나 C++ 헤더를 손으로 작성해야 한다. C++ 클라이언트를 붙일 계획이라면 이 작업을 미리 일정에 넣어라.

### `ComWrappers`와 소스 생성 COM

내장 COM 상호운용은 런타임이 리플렉션과 IL 생성을 써서 RCW·CCW를 만든다. 이는 트리밍·AOT와 맞지 않는다. 그래서 .NET 5에서 **`ComWrappers`** 추상 클래스가 도입됐다 — 래퍼 생성을 라이브러리 코드가 직접 제어하는 모델이다.

.NET 8부터는 이를 손으로 구현할 필요가 거의 없다. 소스 생성기가 대신 해준다.

```csharp
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;

[GeneratedComInterface]                             // ※.NET 8
[Guid("226E5561-C68E-4B2B-BD28-25103ABCA3B1")]
internal partial interface IServer { ulong Fibonacci(ulong whichTerm); }

[GeneratedComClass]                                 // ※.NET 8
internal partial class Server : IServer
{
    public ulong Fibonacci(ulong whichTerm) { /* ... */ return 0; }
}
```

`<BuiltInComInteropSupport>false</BuiltInComInteropSupport>`를 지정하면 내장 COM을 끄고 이 모델만 쓸 수 있다. Native AOT에서는 **내장 COM 상호운용이 아예 없으므로 이 방식이 유일한 선택**이다.

---

## 60.14 `Marshal.ReleaseComObject`의 위험

### 무엇을 하는 API인가

RCW는 COM 객체에 대한 참조 카운트를 하나 쥐고 있다. `Marshal.ReleaseComObject(o)`는 그 카운트를 **강제로 하나 감소**시키고 남은 카운트를 반환한다. `Marshal.FinalReleaseComObject(o)`는 0이 될 때까지 반복한다. 원래 의도는 "Excel이 종료되지 않는다" 류의 문제를 해결하는 것이었다 — 파이널라이저가 언제 돌지 모르니 명시적으로 놓아주자는 발상이다.

### 왜 위험한가

> **⚠️ RCW는 프로세스 안에서 공유된다**
>
> 같은 COM 객체에 대한 RCW는 (기본 설정에서) **하나만 만들어져 공유**된다. 즉 당신이 `ReleaseComObject`를 부르면, 같은 객체를 쓰고 있는 **다른 모든 코드의 참조가 함께 무효화된다.** 그 뒤 누군가 그 래퍼를 쓰면 다음 예외가 난다.
>
> ```text
> System.Runtime.InteropServices.InvalidComObjectException:
> COM object that has been separated from its underlying RCW cannot be used.
> ```
>
> 라이브러리 코드가 이 API를 부르는 것은 특히 나쁘다. 호출자가 여전히 쓰고 있는 객체를 뜯어낼 수 있기 때문이다.

두 번째 문제는 이 API가 **문제를 해결하지 못한다**는 것이다. "Excel 프로세스가 안 죽는다"의 진짜 원인은 대개 다음 둘이다.

1. `excel.Cells[1,1].Font` 같은 **점 두 개 이상의 체인**이 만든 중간 RCW를 아무도 놓아주지 않았다.
2. `Application.Quit()`을 부르지 않았거나, `Visible = true`로 띄워둔 인스턴스를 사용자가 붙잡고 있다.

1번을 잡겠다고 모든 중간 객체를 변수로 받아 하나씩 `ReleaseComObject`하는 코드를 짜는 것이 이른바 "점 두 개 금지 규칙"이다. 이 코드는 장황하고, 하나라도 빠뜨리면 효과가 없고, 순서를 틀리면 위의 예외가 난다.

### 대안

| 접근 | 방법 |
|---|---|
| **가장 단순** | `Quit()`을 부르고 RCW 참조를 범위 밖으로 보낸 뒤 `GC.Collect(); GC.WaitForPendingFinalizers();`를 두 번 돌린다. 파이널라이저가 `Release`를 부른다 |
| **가장 견고** | COM을 쓰는 작업을 **별도 프로세스**에서 수행하고 프로세스를 종료한다. OS가 전부 정리한다 |
| **COM을 피한다** | Excel 파일 조작이라면 OpenXML SDK나 ClosedXML 같은 순수 관리 라이브러리를 쓴다. COM 자동화 자체가 사라진다 |
| **명시적 수명이 꼭 필요하면** | `ComWrappers` 기반 상호운용으로 옮긴다. 래퍼 수명을 직접 설계할 수 있다 |

> **⚠️ `ComWrappers` 위에서는 `ReleaseComObject`가 아예 동작하지 않는다**
>
> `ReleaseComObject`는 **런타임 내장 RCW**(`__ComObject` 계열)에만 적용된다. `ComWrappers`나 `[GeneratedComInterface]`로 만든 래퍼에 부르면 유효한 COM 객체가 아니라는 `ArgumentException`이 난다. 그리고 Native AOT에서는 내장 COM 자체가 없으므로 이 API가 쓰일 자리가 없다. 즉 **.NET의 현대적 COM 경로에서 `ReleaseComObject`는 사실상 사라졌다.** 새 코드에 넣지 마라. 기존 코드에서는 위 표의 대안으로 걷어내는 것이 이관 작업의 일부가 된다.

> **💡 두 번 수집해야 하는 이유**
>
> `GC.Collect(); GC.WaitForPendingFinalizers();`를 두 번 반복하라는 관용구를 본 적이 있을 것이다. 첫 번째 수집은 도달 불가능한 RCW를 파이널라이제이션 큐에 넣고, `WaitForPendingFinalizers`가 파이널라이저를 돌려 `Release`를 부른다. 그런데 그 파이널라이저가 실행되면서 다른 RCW의 마지막 참조가 끊어질 수 있고, 그것은 두 번째 수집에서야 큐에 들어간다. 34.2절의 F-reachable 큐 동작을 그대로 반영한 관용구다. 물론 이런 코드를 프로덕션에 두는 것 자체가 설계 실패의 신호이니, 위 표의 "별도 프로세스" 또는 "COM을 피한다"를 먼저 검토하라.

---

## 60.15 비관리 메모리 직접 다루기 — `NativeMemory`, `Marshal.AllocHGlobal`

### 세 가지 할당기

.NET에서 비관리 메모리를 얻는 방법은 크게 셋이다.

| API | 밑에 있는 것 | 짝이 되는 해제 | 비고 |
|---|---|---|---|
| `Marshal.AllocHGlobal(n)` | Windows에서 `LocalAlloc`, Unix에서 `malloc` | `Marshal.FreeHGlobal` | `Marshal.ReAllocHGlobal`로 크기 변경 |
| `Marshal.AllocCoTaskMem(n)` | `CoTaskMemAlloc` | `Marshal.FreeCoTaskMem` | **COM이 요구하는 할당기.** COM API에 넘길 버퍼는 이쪽 |
| `NativeMemory.Alloc(n)` ※.NET 6 | `malloc` 계열 | `NativeMemory.Free` | 정렬 제어 지원. 신규 코드의 기본값 |

`NativeMemory`(`System.Runtime.InteropServices`)의 표면은 다음과 같다.

```csharp
unsafe
{
    void* p = NativeMemory.Alloc(1024);                 // 초기화 안 됨
    void* z = NativeMemory.AllocZeroed(1024);           // 0으로 채움
    void* e = NativeMemory.Alloc(256, sizeof(double));  // 요소 수 × 요소 크기
    void* a = NativeMemory.AlignedAlloc(4096, 64);      // 64바이트 경계 정렬
    void* r = NativeMemory.Realloc(p, 2048);            // 크기 변경
    NativeMemory.Clear(z, 1024);                        // ※.NET 8 (Copy, Fill도)

    NativeMemory.Free(r); NativeMemory.Free(z); NativeMemory.Free(e);
    NativeMemory.AlignedFree(a);                        // 짝을 맞춰야 한다
}
```

> **⚠️ 할당기와 해제기의 짝을 절대 섞지 마라**
>
> `AlignedAlloc`으로 얻은 포인터를 `Free`로 놓으면 힙이 손상된다. `AllocHGlobal`을 `FreeCoTaskMem`으로 놓아도, `malloc`한 것을 `Marshal.FreeHGlobal`로 놓아도 마찬가지다. **증상은 해제 시점이 아니라 한참 뒤 무관한 할당에서 나타난다.** 네이티브 라이브러리가 반환한 포인터를 해제할 때는 그 라이브러리가 지정한 해제 함수를 써야 한다 — 그 라이브러리가 어떤 할당기로 만들었는지 알 수 없기 때문이다.
>
> COM API가 반환한 `BSTR`은 `Marshal.FreeBSTR`, COM이 할당한 버퍼는 `Marshal.FreeCoTaskMem`이다.

### 정렬이 왜 필요한가

`AlignedAlloc`은 장식이 아니다. SIMD 명령 중 일부는 정렬된 주소를 요구하거나 정렬됐을 때 훨씬 빠르고, 캐시 라인 경계(보통 64바이트)에 맞추면 거짓 공유를 피할 수 있다(61.5절). 페이지 경계(4096) 정렬은 DMA나 직접 I/O에서 요구된다.

```csharp
// 캐시 라인마다 별도 카운터를 두어 거짓 공유를 피한다
const int CacheLine = 64;
long* counters = (long*)NativeMemory.AlignedAlloc(
    (nuint)(CacheLine * Environment.ProcessorCount), CacheLine);
try { /* counters[i * (CacheLine / sizeof(long))] 형태로 접근 */ }
finally { NativeMemory.AlignedFree(counters); }
```

### 문자열을 비관리 메모리로

```csharp
IntPtr utf16 = Marshal.StringToHGlobalUni("안녕");       // FreeHGlobal
IntPtr utf8  = Marshal.StringToCoTaskMemUTF8("hello");   // FreeCoTaskMem
IntPtr bstr  = Marshal.StringToBSTR("hello");            // FreeBSTR

string? back = Marshal.PtrToStringUTF8(utf8);
Marshal.FreeCoTaskMem(utf8);
```

이름에 `HGlobal`이 들어가면 `FreeHGlobal`, `CoTaskMem`이면 `FreeCoTaskMem`, `BSTR`이면 `FreeBSTR`이다. 규칙이 이름에 드러나 있으니 외울 것은 없다.

### 해제를 잊지 않는 구조 — `SafeHandle`

`try/finally`로 매번 해제하는 것은 실수하기 쉽다. 비관리 리소스를 오래 들고 있어야 한다면 `SafeHandle`로 감싸는 것이 정석이다(33.7절).

```csharp
sealed unsafe class NativeBuffer : SafeHandle
{
    public NativeBuffer(nuint bytes) : base(IntPtr.Zero, ownsHandle: true)
        => SetHandle((IntPtr)NativeMemory.AllocZeroed(bytes));

    public override bool IsInvalid => handle == IntPtr.Zero;

    protected override bool ReleaseHandle() { NativeMemory.Free((void*)handle); return true; }

    public Span<byte> AsSpan(int length) => new Span<byte>((void*)handle, length);
}

using var buf = new NativeBuffer(4096);
buf.AsSpan(4096).Fill(0xAB);
```

`SafeHandle`이 단순 파이널라이저보다 나은 이유는 셋이다. **첫째**, 임계 파이널라이저(critical finalizer)라서 어떤 상황에서도 실행이 보장된다. **둘째**, P/Invoke 인수로 넘길 때 마샬러가 참조 카운트를 올려 **호출 중 해제되는 경쟁 조건을 원천 차단**한다. **셋째**, `Dispose`로 결정적 해제도 함께 지원한다.

> **⚠️ 비관리 메모리는 GC 압력에 잡히지 않는다**
>
> `NativeMemory.Alloc(100_000_000)`을 백 번 불러도 GC는 아무 반응이 없다. 관리 힙이 늘지 않았기 때문이다. 프로세스 메모리는 10GB인데 `GC.GetTotalMemory()`는 몇 MB를 보고하는 상황이 이렇게 만들어진다. 큰 비관리 버퍼를 관리 객체가 소유한다면 `GC.AddMemoryPressure(bytes)`와 `GC.RemoveMemoryPressure(bytes)`로 GC에게 알려주어야 파이널라이저가 제때 돌 기회를 얻는다.

> **💡 그래서 무엇을 쓸 것인가**
>
> - 짧은 버퍼(수 KB 이하), 메서드 안에서만 → `stackalloc` + `Span<T>`
> - 관리 코드가 쓸 중간 크기 버퍼 → `ArrayPool<T>.Shared`
> - 네이티브가 오래 들고 있을 버퍼 → `NativeMemory` + `SafeHandle`
> - 자주 고정해서 네이티브에 넘길 버퍼 → `GC.AllocateArray<T>(n, pinned: true)`
> - COM에 넘길 버퍼 → `Marshal.AllocCoTaskMem`
>
> 비관리 힙을 손으로 다루는 것은 마지막 수단이다. .NET에서 그렇게 해야 할 이유는 대개 "네이티브 API가 그렇게 요구해서"뿐이다.

---

## 이 장의 요약

- **P/Invoke 호출은 함수 호출 하나가 아니라 아홉 단계짜리 절차다.** 지연 바인딩, 인수 마샬링, 프레임 푸시, GC 모드 전환, 실제 호출, 모드 복귀, 프레임 팝, 역마샬링, 오류 캡처. 이 중 GC 모드 전환(협조 ↔ 선점)이 이 장 전체를 관통하는 개념이다.
- **`[DllImport]`의 `CharSet` 기본값은 `Ansi`다.** Windows API를 부를 때 이걸 놓치면 문자열이 조용히 깨진다. `[LibraryImport]`에는 이 함정이 없는 대신 A/W 접미사를 직접 써야 한다.
- **블리터블 여부가 마샬링 비용을 결정한다.** 관리 표현과 비관리 표현이 비트 단위로 같으면 복사가 없다. `bool`(4바이트 BOOL), `char`(CharSet 의존), `string`, `decimal`, `DateTime`은 블리터블이 아니다. `sizeof(T)`와 `Marshal.SizeOf<T>()`가 다르면 그 지점에 비용이 있다.
- **콜백에 쓴 델리게이트는 GC의 시야에서 사라진다.** 네이티브는 썽크 주소만 들고 있고 그 주소는 루트가 아니다. 델리게이트를 필드에 붙잡고, 해제 경로에는 `GC.KeepAlive`를 넣어라. 정적 콜백이면 `delegate*`를 써서 이 문제 자체를 없애라.
- **고정(pinning)의 비용은 지속 시간보다 위치가 지배한다.** 세대 0 한복판을 고정하면 압축 계획이 갈라진다. "짧게 고정하라"가 아니라 "고정할 버퍼는 POH에 한 번 만들어 오래 재사용하라"가 옳은 지침이다.
- **`fixed`는 두 가지 뜻이다** — 구조체 안에서는 크기 고정, 문장으로는 위치 고정. 고정 크기 버퍼는 배열이 아니라 인라인 메모리이고, 인덱싱은 포인터 산술이다.
- **`[FieldOffset]`으로 C 공용체를 시뮬레이션할 수 있다.** 단 관리 참조를 다른 필드와 겹치면 `TypeLoadException`이 나고, 결과는 엔디언에 의존한다.
- **`[LibraryImport]`는 마샬링 코드를 컴파일 타임 C# 소스로 생성한다.** `static partial` 요구, `StringMarshalling` 명시 필수, `StringBuilder` 미지원, `ExactSpelling` 사실상 고정이 마이그레이션의 네 가지 관문이다. Native AOT를 계획한다면 선택이 아니다.
- **`SuppressGCTransition`은 나노초를 벌고 프로세스 정지를 걸 수 있다.** 블로킹하지 않고, 관리 코드를 부르지 않고, 1마이크로초 안에 끝나는 함수에만 쓴다.
- **`[UnmanagedCallersOnly]` 메서드에서 예외가 새어 나가면 `FailFast`다.** 콜백 본문 전체를 `try/catch`로 감싸고 오류를 반환 코드로 바꿔라.
- **COM은 Windows 전용이고, 인터페이스와 참조 카운팅이 전부다.** RCW가 C#→COM을, CCW가 COM→C#을 잇는다. .NET(Core)에서는 상호 운용 형식 포함이 사실상 필수이고, .NET Framework와 .NET 5+는 같은 프로세스에 공존할 수 없다.
- **`Marshal.ReleaseComObject`는 현대 .NET에서 사실상 사라졌다.** RCW는 프로세스 안에서 공유되므로 남의 참조를 뜯어내고, `ComWrappers` 기반 래퍼에는 적용조차 되지 않는다. 별도 프로세스로 격리하거나 COM 자체를 걷어내는 것이 답이다.
- **비관리 메모리는 할당기와 해제기의 짝이 전부다.** `AllocHGlobal`/`FreeHGlobal`, `AllocCoTaskMem`/`FreeCoTaskMem`, `NativeMemory.Alloc`/`Free`, `AlignedAlloc`/`AlignedFree`. 섞으면 힙이 손상되고 증상은 한참 뒤에 나타난다. `SafeHandle`로 감싸면 이 실수의 대부분이 사라진다.

---

## 연습 문제

1. `[DllImport("user32.dll")] static extern int MessageBox(IntPtr, string, string, int)`을 `CharSet` 지정 없이 선언하고 한글 문자열을 넘겨 실행하라. 그다음 `CharSet = CharSet.Unicode`를 추가해 다시 실행하고 차이를 기록하라. Process Monitor나 디버거로 실제로 호출된 진입점이 `MessageBoxA`인지 `MessageBoxW`인지 확인하라.
2. `sizeof(T)`와 `Marshal.SizeOf<T>()`를 `bool`, `char`, `int`, 그리고 `[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]`를 붙인 구조체와 안 붙인 구조체에 대해 각각 출력하라. 두 값이 갈리는 조건을 정리하고, 그것이 60.3절의 블리터블 표와 일치하는지 확인하라.
3. 60.4절의 "버그 있는" 타이머 코드를 실제로 작성하고(네이티브 라이브러리 대신 별도 스레드에서 함수 포인터를 반복 호출하는 C# 코드로 대체해도 된다), 루프 안에서 `GC.Collect()`를 강제해 크래시를 재현하라. 그다음 델리게이트를 필드에 대입해 크래시가 사라지는 것을 확인하라.
4. `int[] arr = new int[1000]`을 `fixed`로 고정한 상태에서 `GC.Collect()`를 100번 반복하는 코드와, 고정하지 않고 같은 일을 하는 코드를 각각 실행하며 `GC.GetGCMemoryInfo()`의 단편화 관련 수치를 비교하라. 그다음 `GC.AllocateArray<int>(1000, pinned: true)`로 바꿔 세 번째 측정을 하라.
5. 60.9절의 `Before` 클래스를 그대로 프로젝트에 넣고 `SYSLIB1054` 진단이 뜨는지 확인하라. IDE의 코드 수정을 적용한 뒤, 자동 변환이 처리하지 **못한** 항목이 무엇인지 컴파일 오류 목록으로 정리하라.
6. 블리터블 시그니처를 가진 짧은 네이티브 함수(예: `int add(int,int)`)를 C로 작성해 DLL로 빌드하고, `[DllImport]`, `[LibraryImport]`, `[LibraryImport] + [SuppressGCTransition]` 세 가지로 각각 BenchmarkDotNet 측정하라. 세 값의 차이가 나노초 단위로 얼마인지 기록하라.
7. `[FieldOffset(0)] object Obj`와 `[FieldOffset(0)] IntPtr Ptr`를 가진 구조체를 정의하고 컴파일하라. 컴파일은 되는가? 그 타입을 처음 사용하는 줄에서 어떤 예외가 어떤 메시지로 나는가? 예외 메시지를 근거로 GC가 왜 이를 금지하는지 설명하라.
8. `MemoryMappedFile.CreateNew("Test", 1024)`를 Windows와 Linux(WSL 또는 컨테이너)에서 각각 실행하라. 어느 쪽에서 어떤 예외가 나는가? Linux에서 같은 목적을 달성하려면 어떤 API로 바꿔야 하는지 코드로 보여라.

---

**다음 장** — 60장으로 Part X「CLR 내부 구조」가 끝난다. 61장「메모리의 기초」부터 시작하는 Part XI에서는 이 장에서 계속 등장한 "GC가 객체를 옮긴다", "고정하면 단편화가 생긴다"는 말의 근거를 밑바닥부터 다시 세운다. 스택과 힙, 가상 메모리와 페이지, CPU 캐시와 정렬을 먼저 정리한 뒤 62장에서 .NET 힙의 실제 구조로 들어간다.
