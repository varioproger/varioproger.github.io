# 부록 A. C# ↔ IL ↔ 어셈블리 대응 치트시트

> **이 부록의 위치** — 56장에서 IL을 읽는 법을, 55장에서 그 IL이 네이티브 코드로 바뀌는 과정을 배웠다. 이 부록은 그 두 장의 내용을 **찾아보기 좋은 형태**로 재배열한 레퍼런스다. 새로운 사실을 가르치려는 것이 아니라, 실제로 `ildasm` 출력이나 `DOTNET_JitDisasm` 출력을 앞에 놓고 있을 때 옆에 펼쳐 두는 표 묶음이다. 설명이 필요하면 각 표에 붙은 절 번호로 돌아가라.
>
> **선수 지식** — 54장(타입 시스템의 런타임 표현), 55장(JIT 컴파일과 코드 생성), 56장(CIL 읽기)
>
> **이 부록에서 다루지 않는 것** — IL의 문법과 실행 모델 전반은 56장이, JIT 최적화의 원리와 조건은 55장이 담당한다. IL을 **쓰는** 방법(`ILGenerator`, `DynamicMethod`)은 58장이다. 메타데이터 테이블의 전체 목록과 PE 파일 구조는 52.2절에서 다뤘고, 여기서는 IL 리스팅을 읽는 데 필요한 만큼만 A.6절에 정리한다. x86-64 명령어 집합 자체는 이 책의 범위 밖이다.

---

## A.1 읽는 법 — 도구, 빌드 구성, 이 표를 쓰는 순서

### 층이 셋이라는 사실부터

C# 소스 한 줄이 CPU에서 실행되기까지 세 개의 서로 다른 표현을 거친다. 성능 논쟁의 절반은 **어느 층의 이야기인지 합의하지 않은 채** 벌어진다.

```text
   ┌───────────────────────────────────────────────────────────────┐
   │  ① C# 소스                                                     │
   │     foreach (var x in arr) sum += x;                          │
   └───────────────────────────┬───────────────────────────────────┘
                               │  Roslyn (csc)
                               │  · 문법 설탕을 걷어낸다(lowering)
                               │  · 오버로드를 확정한다
                               │  · 숨은 타입을 만든다
                               ▼
   ┌───────────────────────────────────────────────────────────────┐
   │  ② IL + 메타데이터                                             │
   │     ldloc.1 / ldloc.2 / ldelem.i4 / add / blt.s ...           │
   │     (어셈블리 파일에 저장되는 것은 여기까지다)                    │
   └───────────────────────────┬───────────────────────────────────┘
                               │  RyuJIT (실행 시점)
                               │  · 레지스터를 배정한다
                               │  · 인라인·경계 검사 제거·역가상화
                               │  · 계층형 컴파일로 두 번 이상 컴파일한다
                               ▼
   ┌───────────────────────────────────────────────────────────────┐
   │  ③ 네이티브 코드 (x64 / ARM64)                                 │
   │     add eax, [rcx+rdx*4+0x10] / inc edx / cmp / jl ...        │
   │     (파일에 없다. 프로세스와 함께 사라진다)                       │
   └───────────────────────────────────────────────────────────────┘
```

| 층 | 무엇이 여기서 결정되는가 | 보는 도구 | 이 부록의 절 |
|---|---|---|---|
| ① C# | 문법, 가독성 | 편집기 | — |
| ② IL | 오버로드 선택, 박싱 횟수, 컴파일러가 만든 숨은 타입, 할당 지점(`newobj`/`newarr`/`box`) | `ildasm`, ILSpy, SharpLab(IL) | A.2, A.3, A.6 |
| ③ 네이티브 | 인라인 여부, 경계 검사 잔존 여부, 실제 호출 형태, 레지스터 배정 | SharpLab(JIT Asm), `DOTNET_JitDisasm`, BenchmarkDotNet | A.4, A.5 |

### 질문 → 봐야 할 층

레퍼런스로서 가장 자주 쓰이는 표다. **질문을 층에 매핑하지 못하면 엉뚱한 도구를 켜게 된다.**

| 질문 | 봐야 할 층 | 근거 |
|---|---|---|
| 이 두 표현식이 같은 코드로 컴파일되는가 | ② IL | Release IL을 diff하면 끝난다 |
| 여기서 박싱이 몇 번 일어나는가 | ② IL | `box` 명령 개수를 세면 된다 (54.6절) |
| 어느 오버로드가 선택되었는가 | ② IL | `call`/`callvirt` 피연산자의 시그니처에 적혀 있다 |
| 컴파일러가 무슨 클래스를 몰래 만들었는가 | ② IL | `<>c__DisplayClassN_M`, `<M>d__N` (56.6절) |
| 이 프로퍼티 접근이 실제 호출인가 | ③ 네이티브 | 인라인은 JIT의 결정이다 (55.4절) |
| 경계 검사가 남아 있는가 | ③ 네이티브 | IL의 `ldelem`은 항상 같다 (55.6절) |
| 가상 호출이 직접 호출로 바뀌었는가 | ③ 네이티브 | IL에는 `callvirt`가 그대로 있다 (55.5절) |
| 이 객체가 스택에 놓였는가 | ③ 네이티브 | 할당 헬퍼 호출의 유무로 판단한다 (55.6절) |
| 이 메서드가 어느 계층으로 컴파일되었는가 | ③ 네이티브 | `DOTNET_JitDisasmSummary` (55.8절) |
| 이 어셈블리가 무엇을 참조하는가 | ② 메타데이터 | 매니페스트의 AssemblyRef (52.2절) |

> **⚠️ IL의 비효율이 실행의 비효율이라는 보장은 없다**
>
> 56.1절에서 짚은 원칙을 부록 첫머리에 다시 둔다. IL은 직접 실행되지 않는다. JIT 컴파일 과정에서 IL 수준의 중복 상당수가 사라지고, Release 빌드에서는 C# 컴파일러 단계에서도 이미 상당량이 제거된다. **"IL이 12바이트 더 길다"는 사실만으로 성능을 주장하면 안 된다.** 반대 방향도 마찬가지다 — IL이 짧다고 빠른 것도 아니다. 할당(`newobj`, `newarr`, `box`)처럼 층을 넘어 그대로 살아남는 것만이 IL만 보고 판단해도 되는 항목이다.

### 도구 — 무엇을 언제 쓰는가

| 도구 | 얻는 것 | 가장 잘 맞는 용도 | 상세 |
|---|---|---|---|
| SharpLab (sharplab.io) | 낮춘 C# / IL / JIT Asm | 짧은 조각의 3층을 한 화면에서 비교 | 55.8절 |
| `ildasm` | `.il` 텍스트 전체 | 어셈블리 전체 구조, 메타데이터, 커스텀 특성 blob | 56.7절 |
| `ilasm` | `.il` → 어셈블리 | 라운드트립 | 56.7절 |
| ILSpy / `ilspycmd` | IL + 복원된 C# | 남의 어셈블리 읽기, `-lv CSharp1`로 컴파일러 생성물 노출 | 56.8절 |
| dotPeek / dnSpyEx | 디컴파일 + 디버깅/편집 | 소스 없는 어셈블리 조사 (Windows 전용) | 56.8절 |
| `DOTNET_JitDisasm` | 실제 프로세스의 네이티브 코드 | 진짜 문제 조사, GDV 확인 | 55.8절 |
| BenchmarkDotNet `[DisassemblyDiagnoser]` | 측정에 실제로 쓰인 코드 + 수치 | "왜 이쪽이 빠른가"를 설명할 때 | 55.8절, 67.3절 |
| `System.Reflection.Metadata` | 로드하지 않고 읽는 메타데이터·IL | 빌드 시점 분석 도구 | 56.9절 |

> **⚠️ `ildasm`은 .NET 런타임에 들어 있지 않다**
>
> SDK를 몇 개 깔아도 `ildasm`은 없다. NuGet 패키지(`Microsoft.NETCore.ILDAsm`, `Microsoft.NETCore.ILAsm`)에서 받아 패키지 폴더의 네이티브 실행 파일을 직접 실행해야 한다(56.7절). "IL을 한번 보고 싶을 뿐"이라면 SharpLab이나 `ilspycmd --il`이 훨씬 빠르다. 그리고 **Native AOT로 게시한 앱에는 IL이 아예 없다** — 배포 산출물을 디스어셈블할 생각이라면 게시 방식부터 확인하라(55.7절).

### Debug와 Release — 무엇이 달라지는가

이 부록의 모든 IL 리스팅은 **Release 빌드**(`<Optimize>true</Optimize>`) 기준이다. Debug 빌드는 다른 코드를 만든다.

| 항목 | Debug | Release | 근거 |
|---|---|---|---|
| `nop` | 중단점 자리마다 삽입 | 없음 | 56.2절 |
| `return`문 | 지역 변수 저장 → `br.s` → 로드 → `ret` | 값을 바로 `ret` | 56.2절 |
| 조건식 결과 | `bool` 임시 지역 변수에 왕복 | 레지스터에서 바로 소비 | 56.6절 |
| 비교 + 분기 | `clt` + `stloc`/`ldloc` + `brtrue.s` | `blt.s` 하나로 병합 | 56.6절 |
| `async` 상태 기계 | 클래스(`newobj`) | 구조체(`.locals init (valuetype ...)`) | 56.6절 |
| 지역 변수 | 스코프별로 별도 슬롯 | 수명이 겹치지 않으면 슬롯 재사용 | — |
| JIT 최적화 | 디버거가 붙으면 상당 부분 억제 | 전부 적용 | 55장 |

> **⚠️ Debug IL로 성능을 논하지 마라**
>
> 같은 `for` 루프가 Debug에서 IL 18바이트, Release에서 12바이트로 나오는 예를 56.6절에서 봤다. 그 차이 전부가 디버깅 편의를 위한 것이고 실행 성능과 무관하다. **비교는 반드시 Release끼리** 한다. 그리고 여기에 계층형 컴파일이 겹친다 — Release로 빌드해도 **Tier-0 코드는 인라이닝을 사실상 하지 않는다**(55.4절). 워밍업 없이 처음 몇 번을 측정하면 추상화 비용이 실제보다 몇 배 크게 나온다.

> **📌 `[SkipLocalsInit]`은 IL에서 눈으로 확인된다**
>
> `.locals init (...)`의 `init` 키워드가 사라지고 `.locals (...)`가 되면 그 메서드에 `[SkipLocalsInit]`(※C# 9)이 적용된 것이다(56.2절). `stackalloc`으로 큰 버퍼를 잡는 메서드에서만 의미가 있고, 초기화되지 않은 스택 메모리를 읽을 위험이 따라온다(69.8절).

### 조사 순서 — 일곱 단계

실무에서 "이게 왜 느린가"를 IL/어셈블리로 파고들 때의 표준 절차다.

```text
 ① 측정한다.            BenchmarkDotNet으로 무엇이 느린지부터 확정한다 (67장)
        │               ← 여기를 건너뛰면 나머지 여섯 단계가 전부 낭비다
        ▼
 ② Release IL을 뽑는다.  SharpLab 또는 ilspycmd --il
        │
        ▼
 ③ 할당을 센다.          newobj / newarr / box / ldftn+newobj 를 찾는다
        │
        ▼
 ④ 숨은 타입을 찾는다.    <>c__DisplayClass / <M>d__N / <PrivateImplementationDetails>
        │
        ▼
 ⑤ 네이티브를 뽑는다.     DOTNET_TieredCompilation=0 + DOTNET_JitDisasm=Type:Method
        │
        ▼
 ⑥ 흔적을 읽는다.        RNGCHKFAIL / call qword ptr / CORINFO_HELP_* (A.5절)
        │
        ▼
 ⑦ 한 곳만 고치고 ①로.   Diffable 옵션으로 전후를 diff한다 (55.8절)
```

> **💡 이 부록을 쓰는 순서**
>
> 손에 IL 리스팅이 있다면 **A.3 → A.2** 순서다. A.3에서 "이 패턴은 원래 무슨 C# 문법이었나"를 찾고, 모르는 옵코드가 나오면 A.2에서 스택 동작을 확인한다. 손에 디스어셈블리가 있다면 **A.5 → A.4** 순서다. A.5에서 흔적의 이름을 찾고, A.4의 3단 예제와 모양을 맞춰 본다. `// SIG:` 같은 16진 덩어리를 읽어야 한다면 A.6이다.

---

## A.2 IL 옵코드 분류표

여기 실린 옵코드는 전부 ECMA-335가 정의하고 `System.Reflection.Emit.OpCodes`가 정적 필드로 노출하는 실재하는 명령이다. 확신이 서지 않는 이름을 IL에 쓰면 `ilasm`이 거부하거나, 더 나쁘게는 런타임이 `System.InvalidProgramException`을 던진다. **의심스러우면 `OpCodes` 클래스의 필드 목록을 리플렉션으로 뽑아 확인하라**(56.9절의 옵코드 사전 만들기가 정확히 그 작업이다).

### 표기 규약

이 절의 모든 표는 다음 세 칸을 가진다.

| 칸 | 의미 |
|---|---|
| **옵코드** | 니모닉. 마침표로 끝나는 것(`constrained.`, `tail.`)은 접두사이며 단독으로 쓰이지 않는다 |
| **팝 → 푸시** | 평가 스택에서 꺼내는 값의 개수 → 다시 올리는 값의 개수. `N`은 시그니처가 정하는 가변 개수 |
| **의미** | 하는 일. 괄호 안은 값의 종류 |

값의 종류는 다음 기호로 줄여 쓴다. 평가 스택에 올라갈 수 있는 값이 여섯 종류뿐이라는 사실은 56.4절에서 다뤘다.

| 기호 | 뜻 |
|---|---|
| `i4` / `i8` | 32비트 / 64비트 정수 (`bool`, `char`, `byte`, 모든 열거형이 `i4`로 올라간다) |
| `i` | `native int` (`IntPtr`, 비관리 포인터) |
| `F` | 부동소수점 |
| `O` | 객체 참조 |
| `&` | 관리 포인터 (`ref`/`out`/`in`, `ldloca`/`ldflda`/`ldelema`의 결과) |
| `*` | 비관리 포인터 (`unsafe` 코드) |

### 접미사·접두사 규칙

옵코드 이름의 꼬리에 붙는 조각들은 규칙적이다. 이 규칙만 알면 처음 보는 이름도 읽힌다.

| 조각 | 의미 | 예 |
|---|---|---|
| `.0` ~ `.8`, `.m1` | 피연산자를 명령 자체에 하드코딩 (인덱스 또는 상수) | `ldarg.2`, `ldc.i4.m1` |
| `.s` | short form. 피연산자를 1바이트로 인코딩 | `ldloc.s`, `br.s`, `ldc.i4.s` |
| `.un` | 피연산자를 **부호 없는 값** 또는 **순서 없는(unordered) 부동소수점**으로 취급 | `div.un`, `bgt.un`, `clt.un` |
| `.ovf` | 오버플로 검사. 넘치면 `System.OverflowException` | `add.ovf`, `conv.ovf.i2` |
| `.i1` `.u1` `.i2` `.u2` `.i4` `.u4` `.i8` `.r4` `.r8` `.i` `.u` `.ref` | 대상 데이터 타입 | `stelem.i4`, `conv.r8`, `ldind.u1` |

> **⚠️ `.s`는 성능이 아니라 인코딩 길이의 문제다**
>
> `br.s`와 `br`은 하는 일이 완전히 같다. 차이는 분기 대상 오프셋을 1바이트로 적느냐 4바이트로 적느냐뿐이다. `.s` 형태는 대상이 −128~127 범위 안에 있을 때만 쓸 수 있고, 벗어나면 컴파일러가 long form을 쓴다. **IL 크기가 몇 바이트 줄어드는 것이고 실행 속도와는 무관하다.** 같은 이유로 `ldc.i4.5`와 `ldc.i4 5`도 실행 결과가 같다.

> **📌 니모닉과 이진 옵코드**
>
> 실제 IL 스트림에 들어가는 것은 니모닉이 아니라 1~2바이트의 이진 값이다. 56.2절에서 본 대로 `add`는 `0x58`, `sub`는 `0x59`, `newobj`는 `0x73`이고, `nop`은 `0x00`, `ret`은 `0x2A`, `br.s`는 `0x2B`, `ldarg.0`~`ldarg.3`은 `0x02`~`0x05`, `ldloc.0`은 `0x06`, `stloc.0`은 `0x0A`, `switch`는 `0x45`다. **2바이트 명령은 전부 `0xFE`로 시작한다**(`ceq`, `clt`, `cgt`, `ldftn`, `initobj`, `constrained.`, `localloc` 등, 56.9절). 값의 전체 목록은 ECMA-335 Partition III에 있고, 디스어셈블러를 직접 만들 때 말고는 외울 이유가 없다.

### ① 로드 — 스택에 푸시

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `ldarg.0`~`ldarg.3`, `ldarg.s <n>`, `ldarg <n>` | 0 → 1 | n번 인수의 **값**을 푸시. 인스턴스 메서드에서 0번은 `this` |
| `ldarga.s <n>`, `ldarga <n>` | 0 → 1 (`&`) | n번 인수의 **주소**를 푸시 |
| `ldloc.0`~`ldloc.3`, `ldloc.s <n>`, `ldloc <n>` | 0 → 1 | n번 지역 변수의 값을 푸시 |
| `ldloca.s <n>`, `ldloca <n>` | 0 → 1 (`&`) | n번 지역 변수의 주소를 푸시 |
| `ldfld <필드>` | 1 (`O`/`&`/`*`) → 1 | 인스턴스 필드의 값을 푸시 |
| `ldflda <필드>` | 1 → 1 (`&`) | 인스턴스 필드의 주소를 푸시 |
| `ldsfld <필드>` | 0 → 1 | 정적 필드의 값을 푸시 |
| `ldsflda <필드>` | 0 → 1 (`&`) | 정적 필드의 주소를 푸시 |
| `ldc.i4.m1`, `ldc.i4.0`~`ldc.i4.8` | 0 → 1 (`i4`) | −1, 0~8 상수를 푸시 |
| `ldc.i4.s <n>`, `ldc.i4 <n>` | 0 → 1 (`i4`) | 1바이트 / 4바이트 정수 상수 |
| `ldc.i8`, `ldc.r4`, `ldc.r8` | 0 → 1 | 64비트 정수 / 단정도 / 배정도 상수 |
| `ldstr <문자열>` | 0 → 1 (`O`) | 메타데이터 `#US` 힙의 문자열 리터럴을 푸시 (A.6절) |
| `ldnull` | 0 → 1 (`O`) | null 참조를 푸시 |
| `ldobj <타입>` | 1 (`&`) → 1 | 그 주소의 값 타입 **전체를 복사**해 푸시 |
| `ldind.i1` `.u1` `.i2` `.u2` `.i4` `.u4` `.i8` `.i` `.r4` `.r8` `.ref` | 1 (`&`/`*`) → 1 | 주소가 가리키는 곳에서 지정 타입의 값을 읽어 푸시 |
| `ldtoken <타입/멤버>` | 0 → 1 | 메타데이터 핸들(`RuntimeTypeHandle` 등)을 푸시 |
| `ldftn <메서드>` | 0 → 1 (`i`) | 메서드의 함수 포인터를 푸시 |
| `ldvirtftn <메서드>` | 1 (`O`) → 1 (`i`) | **수신자의 실제 타입에 맞는** 구현의 함수 포인터를 푸시 |
| `ldlen` | 1 (`O`) → 1 (`i`) | 1차원 배열의 길이를 푸시 (`native unsigned int`) |
| `ldelem.<타입>`, `ldelem <타입>` | 2 (배열, 인덱스) → 1 | 배열 요소의 값을 푸시 |
| `ldelema <타입>` | 2 → 1 (`&`) | 배열 요소의 **주소**를 푸시 |
| `dup` | 1 → 2 | 스택 맨 위 값을 복제 (순 증가 +1) |
| `arglist` | 0 → 1 | 가변 인수 핸들(`__arglist`)을 푸시 |
| `sizeof <타입>` | 0 → 1 (`i4`) | 값 타입의 크기(바이트)를 푸시 |

> **⚠️ `ldarg.0`이 첫 매개변수라고 반사적으로 읽지 마라**
>
> `.method` 줄에 `static`이 없으면 `ldarg.0`은 **`this`** 이고 첫 매개변수는 `ldarg.1`이다(56.2절). 그리고 **구조체의 인스턴스 메서드에서 `ldarg.0`은 `this`를 가리키는 관리 포인터(`valuetype T&`)** 다. 이 때문에 구조체 메서드의 IL에는 `ldarg.0` 뒤에 `ldfld`가 곧바로 오고, 값 복사가 아닌 제자리 접근이 된다. 확장 메서드는 `static`이므로 `ldarg.0`이 `this` 매개변수다.

> **📌 `ldlen` 뒤에는 거의 항상 `conv.i4`가 붙는다**
>
> 배열 길이는 명세상 `native unsigned int`이므로 `int` 인덱스와 비교하려면 변환이 필요하다(56.6절). `ldlen` / `conv.i4` / `blt.s` 삼종 세트가 보이면 그것은 배열에 대한 인덱스 루프다.

### ② 저장 — 스택에서 팝

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `pop` | 1 → 0 | 값을 버린다. 반환값을 쓰지 않는 호출 뒤에 나온다 |
| `starg.s <n>`, `starg <n>` | 1 → 0 | n번 인수에 저장 |
| `stloc.0`~`stloc.3`, `stloc.s <n>`, `stloc <n>` | 1 → 0 | n번 지역 변수에 저장 |
| `stfld <필드>` | 2 (객체, 값) → 0 | 인스턴스 필드에 저장 |
| `stsfld <필드>` | 1 → 0 | 정적 필드에 저장 |
| `stobj <타입>` | 2 (주소, 값) → 0 | 값 타입 전체를 그 주소에 복사 |
| `stind.i1` `.i2` `.i4` `.i8` `.i` `.r4` `.r8` `.ref` | 2 (주소, 값) → 0 | 주소가 가리키는 곳에 지정 타입으로 저장 |
| `stelem.<타입>`, `stelem <타입>` | 3 (배열, 인덱스, 값) → 0 | 배열 요소에 저장 |
| `initobj <타입>` | 1 (`&`) → 0 | 그 주소의 값 타입을 0/null로 초기화 |
| `cpobj <타입>` | 2 (대상 주소, 원본 주소) → 0 | 값 타입을 주소에서 주소로 복사 |

> **⚠️ `stfld`와 `stelem`은 피연산자 순서가 정해져 있다**
>
> `stfld`는 스택에서 두 개를 팝하므로 **객체 참조를 먼저 밀고 값을 나중에** 밀어야 한다. `stelem`은 셋이므로 **배열 → 인덱스 → 값** 순이다. 순서를 바꾸면 검증이 실패한다. 이 때문에 `this.x = y`는 `ldarg.0` / `ldarg.1` / `stfld`가 되고, `a[i] = v`는 `ldloc a` / `ldloc i` / `ldloc v` / `stelem.i4`가 된다.

> **📌 `stelem.u1`은 없다**
>
> 저장 쪽에는 부호 없는 변형이 없다. `stelem.i1`이 `byte[]`와 `sbyte[]` 양쪽을 처리한다 — 저장은 비트 패턴을 그대로 쓰는 일이라 부호 해석이 필요 없기 때문이다. 반대로 **로드 쪽에는 `ldelem.u1`이 있다.** 1바이트를 32비트로 늘릴 때 부호 확장을 할지 0 확장을 할지 정해야 하기 때문이다. `ldind` 계열도 같은 비대칭을 가진다.

### ③ 산술·비트

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `add`, `sub`, `mul` | 2 → 1 | 덧셈 / 뺄셈 / 곱셈 |
| `div`, `rem` | 2 → 1 | 부호 있는 나눗셈 / 나머지 |
| `div.un`, `rem.un` | 2 → 1 | 부호 없는 나눗셈 / 나머지 |
| `add.ovf`, `sub.ovf`, `mul.ovf` | 2 → 1 | 오버플로 검사 버전 (부호 있음) |
| `add.ovf.un`, `sub.ovf.un`, `mul.ovf.un` | 2 → 1 | 오버플로 검사 버전 (부호 없음) |
| `neg` | 1 → 1 | 부호 반전 |
| `and`, `or`, `xor` | 2 → 1 | 비트 논리곱 / 논리합 / 배타적 논리합 |
| `not` | 1 → 1 | 비트 반전 |
| `shl`, `shr` | 2 (값, 자릿수) → 1 | 왼쪽 시프트 / 산술 오른쪽 시프트 |
| `shr.un` | 2 → 1 | 논리 오른쪽 시프트 (0 채움) |
| `ckfinite` | 1 → 1 | 부동소수점 값이 NaN/무한이면 예외 |

> **⚠️ 나눗셈에는 `.ovf` 변형이 없다**
>
> `div.ovf` 같은 옵코드는 **존재하지 않는다.** 정수 나눗셈의 유일한 오버플로 조합인 `int.MinValue / -1`은 `div` 옵코드 자체가 `OverflowException`을 내도록 정의되어 있기 때문이다(7.4절, 7.9절). `checked` 컨텍스트에서도 나눗셈 IL은 `div` 그대로다. 0으로 나누면 `DivideByZeroException`이며 이것도 `div`의 정의에 포함된다.

### ④ 비교와 분기

비교 옵코드는 **결과 0/1을 스택에 남기고**, 분기 옵코드는 **비교와 점프를 한 명령에서 처리한다.** Release 빌드에서는 후자로 병합되는 것이 보통이다(56.6절).

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `ceq` | 2 → 1 (`i4`) | 같으면 1, 아니면 0을 푸시 |
| `cgt`, `clt` | 2 → 1 | 크면 / 작으면 1 (부호 있음) |
| `cgt.un`, `clt.un` | 2 → 1 | 부호 없는 비교. 부동소수점에서는 "순서 없음(NaN 포함)이거나 크다/작다" |
| `br <레이블>`, `br.s` | 0 → 0 | 무조건 분기 |
| `brtrue <레이블>`, `brtrue.s` | 1 → 0 | 값이 0이 아니면(비null이면) 분기 |
| `brfalse <레이블>`, `brfalse.s` | 1 → 0 | 값이 0이면(null이면) 분기 |
| `beq`, `beq.s` / `bne.un`, `bne.un.s` | 2 → 0 | 같으면 / 다르면 분기 |
| `bgt`, `bge`, `blt`, `ble` (+`.s`) | 2 → 0 | 부호 있는 크기 비교 분기 |
| `bgt.un`, `bge.un`, `blt.un`, `ble.un` (+`.s`) | 2 → 0 | 부호 없는(또는 순서 없는) 크기 비교 분기 |
| `switch (L0, L1, …)` | 1 (`i4`) → 0 | 값을 인덱스로 대상 목록에서 골라 분기. 범위 밖이면 다음 명령으로 흘러간다 |
| `leave <레이블>`, `leave.s` | 스택 전부 → 0 | 보호된 블록(`try` 또는 `catch` 처리기)을 정상적으로 벗어난다. `finally`/`fault`/`filter`에서는 쓸 수 없다 |
| `ret` | 0 또는 1 → 0 | 메서드 종료. 반환 타입에 맞게 스택이 비어 있거나 값 하나여야 한다 |

> **📌 `brfalse`/`brtrue`에는 별명이 있다**
>
> ECMA-335는 `brfalse`의 별명으로 `brnull`, `brzero`를, `brtrue`의 별명으로 `brinst`를 정의한다. 같은 이진 옵코드의 다른 이름이며 `ildasm`은 보통 `brfalse`/`brtrue`로 출력한다. 별명이 존재하는 이유는 이 하나의 명령이 "0인가", "null인가", "인스턴스인가"라는 서로 다른 의도로 쓰이기 때문이다.

> **⚠️ `try` 블록을 `br`로 벗어나면 IL이 무효가 된다**
>
> 보호된 블록 밖으로 나가는 분기는 반드시 `leave`여야 한다(56.3절). `leave`는 **평가 스택을 완전히 비우고**, 사이에 있는 `finally` 블록들을 순서대로 실행하게 만든다. `try` 안에서 계산한 값을 밖에서 쓰려면 반드시 지역 변수에 저장해야 하는 이유이고, `try { return x; }`가 IL에서 "저장 → `leave` → 블록 밖에서 `ldloc` → `ret`"으로 풀리는 이유다.

### ⑤ 호출

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `call <메서드>` | N (+`this`) → 0 또는 1 | 정적 결합 호출. 변수의 **정적 타입**이 대상을 정한다. null 검사를 하지 않는다 |
| `callvirt <메서드>` | N + 1 → 0 또는 1 | 가상 디스패치 호출. 수신자의 **실제 타입**을 따라간다. null이면 `NullReferenceException` |
| `calli <시그니처>` | N + 1(함수 포인터) → 0 또는 1 | 함수 포인터를 통한 간접 호출 |
| `newobj <생성자>` | N (생성자 인수) → 1 (`O` 또는 값) | 인스턴스를 만들고 생성자를 호출한 뒤 결과를 푸시 |
| `constrained. <타입>` | — | 접두사. 뒤따르는 `callvirt`를 값 타입에 대해 **박싱 없이** 수행하게 한다 |
| `tail.` | — | 접두사. 뒤따르는 호출을 꼬리 호출로 요청한다 |
| `readonly.` | — | 접두사. 뒤따르는 `ldelema`의 결과를 읽기 전용 관리 포인터로 만든다 |
| `volatile.` | — | 접두사. 뒤따르는 로드/저장을 휘발성 접근으로 표시한다 |
| `unaligned. <n>` | — | 접두사. 뒤따르는 접근의 정렬이 보장되지 않음을 알린다 |
| `no. <플래그>` | — | 접두사. 특정 런타임 검사를 생략해도 된다고 알린다. C# 컴파일러는 방출하지 않는다 |
| `jmp <메서드>` | 0 → 0 | 현재 메서드를 버리고 같은 시그니처의 다른 메서드로 점프. 실무 IL에서 거의 보이지 않는다 |

> **⚠️ `callvirt`은 비가상 메서드 호출에도 쓰인다**
>
> 이것이 IL을 처음 읽는 사람이 가장 많이 걸려 넘어지는 지점이다. C# 컴파일러는 참조 타입의 인스턴스 메서드를 **가상이든 아니든 `callvirt`로** 호출한다. 이유는 `callvirt`이 JIT에게 null 검사 코드를 생성하게 만들기 때문이다. 그래서 `Program p = null; p.NonVirtualMethod();`가 C#에서는 `NullReferenceException`을 던진다 — 이론적으로는 `this`를 쓰지 않는 비가상 메서드라 문제가 없어야 하지만, `callvirt`이 방출되므로 터진다. 자세한 선택 규칙은 A.3절의 표에 있다.

> **📌 `constrained.`는 제네릭 코드의 박싱을 없앤다**
>
> `T`가 값 타입일 때 `T`에 대한 인터페이스 메서드를 호출하려면 원래는 박싱해서 `object`로 만들어야 한다. `constrained. <타입>` 접두사는 "그 타입이 이 메서드를 직접 구현하고 있으면 값 그대로 호출하고, 아니라면 그때만 박싱하라"는 지시다(56.6절). `List<T>`의 `foreach`에서 열거자 `Dispose` 호출 앞에 이 접두사가 붙는 것을 보게 된다. `where T : struct` 제약과 인터페이스 제약을 함께 걸면 이 경로가 열린다(23.11절).

### ⑥ 객체 모델과 형변환

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `newobj <생성자>` | N → 1 | 관리 힙에 할당 + 생성자 호출 (값 타입이면 스택에 값을 만든다) |
| `castclass <타입>` | 1 → 1 | 참조 형변환. 실패하면 `InvalidCastException` |
| `isinst <타입>` | 1 → 1 | 타입 검사. 성공하면 참조를, **실패하면 null**을 푸시. 예외를 던지지 않는다 |
| `box <값타입>` | 1 (값) → 1 (`O`) | 힙에 박싱 인스턴스를 할당하고 값을 복사 |
| `unbox <값타입>` | 1 (`O`) → 1 (`&`) | 박싱 인스턴스 **안의 데이터를 가리키는 관리 포인터**. 복사도 할당도 하지 않는다 |
| `unbox.any <타입>` | 1 (`O`) → 1 (값) | `unbox` + `ldobj`. C# 컴파일러가 실제로 방출하는 것 |
| `initobj <값타입>` | 1 (`&`) → 0 | 값 타입 위치를 기본값으로 |
| `mkrefany`, `refanyval`, `refanytype` | — | typed reference 관련. C#의 문서화되지 않은 `__makeref`/`__refvalue`/`__reftype`이 쓴다 |
| `conv.i1` `.i2` `.i4` `.i8` `.u1` `.u2` `.u4` `.u8` `.i` `.u` | 1 → 1 | 정수 변환(자르기 또는 확장) |
| `conv.r4`, `conv.r8` | 1 → 1 | 부동소수점으로 변환 |
| `conv.r.un` | 1 → 1 | 부호 없는 정수를 부동소수점으로 |
| `conv.ovf.<타입>`, `conv.ovf.<타입>.un` | 1 → 1 | 오버플로 검사 변환. `checked` 캐스트가 만든다 |

> **⚠️ `unbox`와 `unbox.any`는 다른 명령이다**
>
> `unbox`는 박싱된 인스턴스 안을 가리키는 **관리 포인터**를 돌려줄 뿐 복사를 하지 않는다. 실제 값을 얻으려면 `ldobj`가 더 필요하다. C# 컴파일러가 방출하는 것은 이 둘을 합친 `unbox.any`다(54.6절). 그리고 언박싱은 **정확한 타입**으로만 된다 — 박싱된 `int`를 `short`로 언박싱하면 `InvalidCastException`이다. `(short)(int)o`처럼 두 단계로 써야 한다.

> **⚠️ `isinst`가 성공해도 값이 나오는 것은 아니다**
>
> 값 타입에 대한 `isinst`는 **박싱된 객체 참조**를 푸시한다. 실제 값을 꺼내려면 뒤에 `unbox.any`가 따라와야 한다(77.7절). `o is int i` 패턴의 IL이 `isinst` + `brfalse` + `unbox.any`인 이유다.

### ⑦ 배열

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `newarr <요소타입>` | 1 (개수) → 1 (`O`) | 1차원 0기반 배열을 할당 |
| `ldlen` | 1 → 1 | 길이를 푸시 |
| `ldelem.i1` `.u1` `.i2` `.u2` `.i4` `.u4` `.i8` `.i` `.r4` `.r8` `.ref` | 2 → 1 | 타입별 요소 로드 |
| `ldelem <타입>` | 2 → 1 | 임의 타입(제네릭 포함) 요소 로드 |
| `ldelema <타입>` | 2 → 1 (`&`) | 요소의 주소 로드. 구조체 배열의 제자리 수정에 쓰인다 |
| `stelem.i1` `.i2` `.i4` `.i8` `.i` `.r4` `.r8` `.ref` | 3 → 0 | 타입별 요소 저장 |
| `stelem <타입>` | 3 → 0 | 임의 타입 요소 저장 |

> **📌 다차원 배열에는 전용 옵코드가 없다**
>
> `int[,]` 같은 다차원 배열의 요소 접근은 옵코드가 아니라 **런타임이 제공하는 `Get`/`Set`/`Address` 메서드 호출**로 컴파일된다. IL에 `call instance int32 int32[,]::Get(int32, int32)` 같은 줄이 보이면 다차원 배열이다. 이 메서드들은 IL 본문이 없어서 `MethodBody.GetILAsByteArray()`로 읽을 수 없다(56.9절). 가변 배열(`int[][]`)은 그냥 배열의 배열이므로 `ldelem.ref` 다음에 다시 `ldelem.i4`가 오는 형태이며 전용 호출이 없다 — 9.4절에서 본 성능 차이의 IL 수준 근거가 이것이다.

### ⑧ 예외 처리

예외 처리는 옵코드만으로 표현되지 않는다. `.try` 블록과 처리기의 **범위 자체가 메서드 헤더의 예외 절 테이블**에 기록된다.

| 옵코드 / 절 | 팝 → 푸시 | 의미 |
|---|---|---|
| `.try { } catch <타입> { }` | — | 보호된 블록과 타입 기반 처리기 |
| `.try { } filter { } { }` | — | 필터가 붙은 처리기. C#의 `catch (E e) when (…)` |
| `.try { } finally { }` | — | 정상·예외 양쪽에서 실행되는 종료 처리기 |
| `.try { } fault { }` | — | **예외로 빠져나갈 때만** 실행되는 처리기. C#에는 대응 문법이 없다 |
| `throw` | 1 (`O`) → 스택 비움 | 예외 객체를 던진다 |
| `rethrow` | 0 → 0 | `catch` 안에서 현재 예외를 다시 던진다. C#의 인수 없는 `throw;` |
| `leave`, `leave.s` | 스택 전부 → 0 | 보호 블록을 정상적으로 벗어난다 |
| `endfinally` | 0 → 0 | `finally`/`fault` 블록의 끝 |
| `endfilter` | 1 (`i4`) → 0 | `filter` 블록의 끝. 1이면 처리기 실행, 0이면 통과 |

> **⚠️ `catch` 블록은 예외 객체가 스택에 올라온 상태로 시작한다**
>
> `catch` 처리기에 진입하는 순간 평가 스택에는 예외 객체 참조 하나가 놓여 있다. 그래서 `catch (Exception e)`의 IL은 `stloc`으로 시작하고, 예외 객체를 쓰지 않는 `catch (Exception)`은 `pop`으로 시작한다. 이걸 모르면 `catch` 블록 첫 줄의 `pop`이 어디서 왔는지 설명할 수 없다.

### ⑨ 접두사와 기타

| 옵코드 | 팝 → 푸시 | 의미 |
|---|---|---|
| `nop` | 0 → 0 | 아무것도 하지 않는다. Debug 빌드의 중단점 자리 |
| `break` | 0 → 0 | 디버거 중단을 트리거한다 |
| `localloc` | 1 (크기) → 1 (`*`) | 현재 프레임의 지역 메모리 풀에서 할당. C#의 `stackalloc` |
| `initblk` | 3 (주소, 값, 크기) → 0 | 메모리 블록을 지정 바이트로 채운다 |
| `cpblk` | 3 (대상, 원본, 크기) → 0 | 메모리 블록 복사 |

> **⚠️ `localloc`을 포함한 메서드는 인라이닝되지 않는다**
>
> `stackalloc`은 호출자의 스택 프레임에 영향을 주므로 JIT의 하드 블로커 목록에 들어간다(55.4절). `try`/`catch`/`finally`를 포함한 메서드도 마찬가지다. **`[MethodImpl(AggressiveInlining)]`을 붙여도 소용없다** — 그 특성은 크기·수익성 검사만 건너뛰게 할 뿐 하드 블로커를 무시하지 못한다.

---

## A.3 C# 구문 → IL 대응표

이 절은 **역방향으로도 읽도록** 만들었다. C# 문법에서 IL을 찾는 데도 쓰고, IL 리스팅의 패턴에서 원래 문법을 되짚는 데도 쓴다. 후자를 위한 요약 표가 56.6절 첫머리의 랜드마크 표이고, 여기서는 그것을 문법 단위로 펼친다.

### 지역 변수 · 인수 · 대입

| C# | IL | 비고 |
|---|---|---|
| `int x;` | `.locals init (int32 V_0)` | 슬롯을 잡을 뿐 명령은 없다 |
| `int x = 5;` | `ldc.i4.5` / `stloc.0` | |
| `x = y;` | `ldloc.1` / `stloc.0` | |
| `x = p;` (p는 매개변수) | `ldarg.1` / `stloc.0` | 인스턴스 메서드 기준 |
| `p = x;` (매개변수에 대입) | `ldloc.0` / `starg.s p` | 드물다. 매개변수 재사용의 흔적 |
| `ref int r = ref x;` | `ldloca.s V_0` / `stloc.1` | 지역 변수 타입이 `int32&` |
| `r = 5;` (r은 `ref int`) | `ldloc.1` / `ldc.i4.5` / `stind.i4` | |
| `x++;` (지역 변수) | `ldloc.0` / `ldc.i4.1` / `add` / `stloc.0` | |
| `arr[i]++;` | `ldloc` / `ldloc` / `dup` … `ldelem` / `add` / `stelem` | 인덱스를 두 번 계산하지 않으려고 `dup`을 쓴다 |
| `int* p = &x;` | `ldloca.s V_0` / `conv.u` / `stloc.1` | `unsafe`. `conv.u`가 관리 포인터를 비관리 포인터로 바꾼다 |
| `Span<int> s = stackalloc int[16];` | `ldc.i4.s 64` / `localloc` / … | 바이트 수를 계산해 `localloc`에 넘긴다 |
| `fixed (char* p = s) { }` | `.locals init (char& pinned V_0)` | `pinned` 한정자가 GC에게 고정을 알린다 |

> **📌 지역 변수 슬롯 번호는 소스의 선언 순서가 아니다**
>
> Release 빌드에서 컴파일러는 수명이 겹치지 않는 지역 변수에 **같은 슬롯을 재사용**한다. 그래서 `V_2`가 소스의 세 번째 변수라는 보장이 없다. Debug 빌드에서는 디버거가 변수를 보여줘야 하므로 재사용하지 않고, 슬롯 이름도 PDB에 남는다. **IL에서 변수를 추적할 때 Debug 빌드가 편한 유일한 이유가 이것이다.**

### 필드 접근

| C# | IL | 비고 |
|---|---|---|
| `this.f` (읽기) | `ldarg.0` / `ldfld <타입> C::f` | |
| `this.f = v;` | `ldarg.0` / `<값>` / `stfld` | 객체를 먼저 민다 |
| `obj.f` | `ldloc` / `ldfld` | |
| `C.s` (정적 필드 읽기) | `ldsfld` | 객체 참조가 필요 없다 |
| `C.s = v;` | `<값>` / `stsfld` | |
| `ref this.f` / `Interlocked` 대상 | `ldarg.0` / `ldflda` | 필드의 **주소**가 필요할 때 |
| `const int K = 5;` 사용 | `ldc.i4.5` | 필드 접근이 **사라진다**. 값이 호출 지점에 박힌다 |
| `readonly int f` 읽기 | `ldfld` | 일반 필드와 IL이 같다. 불변성은 컴파일러가 지킨다 |
| `static readonly int f` 읽기 | `ldsfld` | ※.NET 8부터 Tier-1에서 상수로 접힐 수 있다 (55.6절) |
| `volatile int f` 읽기 | `volatile.` / `ldfld` | 접두사가 붙는다 |
| 구조체 필드의 필드 (`s.Inner.X`) | `ldflda` / `ldfld` | 중간 복사를 피하려고 주소를 쓴다 |

> **⚠️ `const`는 바이너리 호환성을 깨뜨린다**
>
> `const` 필드의 값은 **소비하는 어셈블리의 IL에 상수로 복사된다.** 라이브러리에서 `const` 값을 바꾸고 라이브러리만 다시 배포하면, 이미 컴파일된 소비자는 옛 값을 계속 쓴다. IL에 `ldsfld`가 아니라 `ldc.i4`가 박혀 있다는 사실이 그 증거다. 값이 바뀔 가능성이 있다면 `static readonly`를 써야 한다 — 이쪽은 `ldsfld`로 남아 런타임에 읽는다.

### 프로퍼티 · 인덱서 · 이벤트

프로퍼티와 이벤트는 **CIL에 존재하지 않는다.** 특별한 이름을 가진 메서드 쌍과, 그것을 묶는 메타데이터 디렉티브만 있다(56.5절).

| C# | IL 멤버 | 호출 형태 |
|---|---|---|
| `public T P { get; set; }` | `get_P()`, `set_P(T)`, `.property`, `<P>k__BackingField` | `callvirt instance T C::get_P()` |
| `public T P { get; init; }` | `set_P`에 `modreq(IsExternalInit)` | CLR은 일반 setter로 취급한다 |
| `public T this[int i]` | `get_Item(int32)`, `set_Item(int32, T)` | 이름은 `[IndexerName]`으로 바꿀 수 있다 |
| `public event EventHandler E;` | `add_E`, `remove_E`, `.event`, 델리게이트 필드 | `+=`는 `callvirt add_E` |
| `E?.Invoke(this, e);` | 필드를 지역 변수로 한 번 읽고 `brfalse` + `callvirt Invoke` | 27.5절의 관용구 |
| `public static T P { get; }` | `get_P()` (정적) | `call` |

> **📌 프로퍼티 접근은 Release에서 필드 접근과 같은 코드가 된다**
>
> `get_Name`의 본문은 `ldarg.0` / `ldfld` / `ret` 세 줄이다. JIT은 이 정도로 작은 메서드를 거의 항상 인라이닝하므로(55.4절), Tier-1 코드에서 프로퍼티 접근은 필드 접근과 동일한 `mov` 한 줄로 남는다. **"프로퍼티가 필드보다 느리다"는 말은 Tier-0에서만 참이다.**

> **⚠️ 필드형 이벤트의 `add`는 CAS 루프다**
>
> `add_E`의 IL은 `Delegate.Combine` + `Interlocked.CompareExchange<T>` + `bne.un.s`로 이루어진 락 프리 재시도 루프다(56.6절). 구독 등록 자체는 스레드 안전하지만 **이벤트 발생은 여전히 직접 챙겨야 한다.** 명시적 `add`/`remove` 접근자를 쓰면 이 루프는 생기지 않고 작성한 코드가 그대로 들어간다.

### 메서드 호출 — `call`과 `callvirt`의 선택 규칙

이 표가 A.3절에서 가장 자주 참조된다. 근거는 56.3절과 CLR의 호출 규약이다.

| 호출 형태 | 방출되는 명령 | 이유 |
|---|---|---|
| 정적 메서드 | `call` | 수신자가 없다 |
| 확장 메서드 | `call` | 정의상 정적 메서드다 |
| 참조 타입의 **비가상** 인스턴스 메서드 | `callvirt` | C# 컴파일러는 null 검사를 얻으려고 일부러 이쪽을 쓴다 |
| 참조 타입의 **가상** 메서드 | `callvirt` | 다형적 디스패치가 필요하다 |
| 인터페이스 메서드 | `callvirt` | 슬롯 인덱싱이 아니라 가상 스텁 디스패치(VSD)로 풀린다 (54.1절) |
| `base.M()` | `call` | `callvirt`이면 자기 자신을 무한 재귀 호출한다 |
| 값 타입이 **직접 정의·재정의한** 메서드 | `call` (수신자는 `ldloca`/`ldarga`) | 값 타입은 봉인이므로 다형성이 없다 |
| 값 타입에서 재정의하지 **않은** 가상 메서드 (`ToString` 등) | `constrained.` + `callvirt` | 이 경로에서는 런타임에 박싱이 일어난다 |
| 제네릭 `T`에 대한 인터페이스 호출 | `constrained. !!T` + `callvirt` | `T`가 값 타입이면 박싱 없이 직접 호출된다 |
| 델리게이트 호출 `d(x)` | `callvirt … Invoke(…)` | `Invoke`는 런타임이 구현하는 인스턴스 메서드다 |
| 함수 포인터 호출 (`delegate*`, ※C# 9) | `calli` | 델리게이트 객체가 없다 |
| 생성자 호출 `new C()` | `newobj` | 할당과 생성자 호출을 한 명령으로 |
| 생성자 안의 `base(...)` / `this(...)` | `call instance void …::.ctor(…)` | 이미 할당된 객체에 대한 호출 |
| 지역 함수 (델리게이트로 변환되지 않음) | `call` | 컴파일러가 만든 `static` 또는 인스턴스 메서드 |

> **⚠️ `callvirt`이 있다고 가상 호출이 실행되는 것은 아니다**
>
> IL의 `callvirt`은 "이 호출은 수신자의 실제 타입을 따라가야 한다"는 **의미론**의 표현이다. 그 의미론이 실제로 간접 호출을 요구하는지는 JIT이 판단한다. 수신자의 정적 타입이 `sealed`거나, 계층에 재정의가 없거나, 동적 PGO가 단형 호출 지점임을 알려주면 JIT은 역가상화한다(55.5절). **`callvirt`의 개수를 세서 가상 호출 비용을 추정하면 안 된다.** 남았는지 확인하려면 네이티브 코드에서 `call qword ptr [...]` 형태의 간접 호출을 찾아야 한다.

> **💡 IL에서 오버로드 선택을 확인하라**
>
> `call`/`callvirt`의 피연산자에는 **완전히 해석된 시그니처**가 적혀 있다. `String::Concat(object, object, object)`인지 `Concat(string, string, string)`인지가 그대로 보인다(54.6절). "왜 여기서 박싱이 일어나지"의 답이 대부분 이 한 줄에 있다. 오버로드 해석은 컴파일 타임에 끝나므로 이건 IL만 보고 100% 판정 가능한 항목이다.

### 객체 생성과 생성자

| C# | IL | 비고 |
|---|---|---|
| `new C()` | `newobj instance void C::.ctor()` | 힙 할당 + 생성자 |
| `new S()` (구조체, 기본 생성자) | `ldloca` / `initobj S` | **할당도 호출도 없다** |
| `new S(1, 2)` (구조체, 명시 생성자) | `ldloca` / `ldc` / `call instance void S::.ctor(…)` 또는 `newobj` | 대입 대상에 따라 형태가 갈린다 |
| `default(S)` | `ldloca` / `initobj S` | |
| `default(C)` (참조 타입) | `ldnull` | |
| `new C { X = 1 }` (개체 초기화자) | `newobj` / `dup` / `ldc.i4.1` / `callvirt set_X` | `dup`이 초기화자의 표지다 |
| `new List<int> { 1, 2 }` (컬렉션 초기화자) | `newobj` / `dup` / `callvirt Add` / `dup` / `callvirt Add` | |
| `new[] { 1, 2, 3 }` (작은 배열) | `newarr` / `dup` / `ldc` / `stelem.i4` 반복 | |
| `new[] { 1, 2, …, 100 }` (큰 배열) | `newarr` / `dup` / `ldtoken <PrivateImplementationDetails>::…` / `call RuntimeHelpers::InitializeArray` | 원본 바이트가 메타데이터에 통째로 들어간다 |
| 파생 클래스 생성자 | 본문 앞에 `ldarg.0` / `call instance void Base::.ctor()` | **빠뜨리면 IL이 무효다** |
| `record class` 선언 | `<Clone>$`, `PrintMembers`, `Equals`, `GetHashCode`, `EqualityContract` 생성 | 19.3절 |
| `r with { X = 1 }` (레코드 클래스) | `callvirt <Clone>$` / `callvirt set_X` | 복제 후 수정. `record struct`는 값 복사라 `<Clone>$`가 없다 (19.4절) |

> **⚠️ 구조체의 `new`는 힙 할당이 아니다**
>
> `new S()`가 IL에서 `initobj`나 `call .ctor`로 나타나고 `newobj`가 없다면 **할당이 없다.** `new`라는 키워드를 보고 할당을 세면 값 타입에서 항상 틀린다. 반대로 `newobj`가 보이는데 대상이 값 타입이라면(예: 구조체를 인수로 바로 넘기는 경우) 그것도 힙 할당이 아니라 임시 값 생성이다. **할당을 세려면 대상 타입이 참조 타입인지 확인해야 한다.**

### 제어 흐름

| C# | IL 패턴 | 비고 |
|---|---|---|
| `if (c) A();` | 조건 반전 후 `brfalse`/`br*`로 뒤로 점프 | 조건을 **뒤집어** 분기한다 |
| `if (c) A(); else B();` | 조건 분기 + `br`로 else 건너뛰기 | |
| `while (c) { }` | 진입 시 `br`로 조건 검사로 점프 → 본문 → 조건 → `brtrue`로 되돌기 | 반복당 분기 1회 |
| `for (…;…;…)` | 초기화 / `br.s` 조건 / 본문 / 증가 / 조건 / `blt.s` | 56.6절 |
| `do { } while (c);` | 본문 / 조건 / `brtrue`로 되돌기 | 진입 분기가 없다 |
| `foreach` (배열) | `ldlen` / `conv.i4` / `ldelem` / `blt` — 열거자 없음 | 가장 빠른 형태 |
| `foreach` (`List<T>` 등 구조체 열거자) | `ldloca` + `call` + `.try`/`finally` + `constrained.` | 박싱도 가상 디스패치도 없다 |
| `foreach` (`IEnumerable<T>`) | `ldloc` + `callvirt` + `.try`/`finally` + null 검사 | 열거자 객체가 힙에 할당된다 |
| `foreach` (`string`) | 인덱스 루프(`get_Length`/`get_Chars`)로 낮춘다 | 열거자 할당이 없다 |
| `break` / `continue` | `br` / `br.s` (또는 `leave`) | 보호 블록 안이면 `leave` |
| `goto L;` | `br L` | |
| `return v;` (Release) | 값을 스택에 남기고 `ret` | Debug는 지역 변수를 경유한다 |

> **📌 조건은 항상 뒤집혀 있다**
>
> `if (x > 0) A();`의 IL은 "x가 0보다 크면 A로 점프"가 아니라 **"x가 0 이하이면 A를 건너뛰어라"** 다. 순차 실행을 기본으로 두고 예외 경로만 점프시키는 것이 코드 배치와 분기 예측에 유리하기 때문이다. IL을 읽을 때 조건이 소스와 반대로 보이면 이 때문이다.

### `switch` — 세 가지 전혀 다른 코드

| 케이스 분포 | 생성되는 것 | 복잡도 | IL 표지 |
|---|---|---|---|
| 밀집된 정수·열거형 | `switch` 옵코드(점프 테이블) | O(1) | `switch (IL_x, IL_y, …)` |
| 희소한 정수 | 이진 탐색 트리 | O(log n) | `bgt`/`blt` 연쇄, `switch` 없음 |
| 문자열, 대략 6개 이하 | 순차 비교 | O(n) | `String::op_Equality` 반복 |
| 문자열, 그보다 많음 | 해시 + 점프 테이블 + 실제 비교 | 사실상 O(1) | `<PrivateImplementationDetails>::ComputeStringHash` |
| 타입 패턴 | 순차 `isinst` | O(n) | `isinst` 반복. **점프 테이블이 없다** |

> **⚠️ 타입 `switch`만 arm 순서가 성능에 영향을 준다**
>
> 정수와 문자열 `switch`는 점프 테이블이나 해시로 낮춰지므로 case를 어떤 순서로 쓰든 같다. 그러나 **타입 기반 `switch`는 `isinst`를 순차로 실행한다**(77.15절). 가장 흔한 타입을 앞에 두는 것이 실제로 이득이다. 다만 그 이득을 논하기 전에, 애초에 타입 분기가 꼭 필요한 설계인지부터 검토하는 편이 낫다.

> **📌 `<PrivateImplementationDetails>`는 어셈블리마다 하나씩 생긴다**
>
> 문자열 해시 함수, 배열 초기화 데이터, `ReadOnlySpan<byte>` 리터럴의 원본 바이트가 전부 이 컴파일러 생성 타입에 모인다(56.6절). IL에서 이 이름을 보면 "내가 쓴 코드가 아니다"라고 읽으면 된다.

### `try` / `catch` / `finally` / `using` / `lock`

| C# | IL |
|---|---|
| `try { } catch (E e) { }` | `.try { … leave.s L } catch E { stloc … leave.s L }` |
| `catch (E) { }` (변수 없음) | `catch` 진입 직후 `pop` |
| `catch (E e) when (c)` | `.try { } filter { … endfilter } { }` |
| `try { } finally { }` | `.try { … leave.s } finally { … endfinally }` |
| `throw new E();` | `newobj` / `throw` |
| `throw;` (재던지기) | `rethrow` |
| `throw e;` | `throw` — **스택 트레이스가 잘린다** (32.5절) |
| `using (var d = X()) { }` | `.try`/`finally` + `brfalse`(null 검사) + `callvirt IDisposable::Dispose()` |
| `using var d = X();` (※C# 8) | IL이 위와 **동일**. `finally` 범위만 스코프 끝까지 |
| `using` (구조체 리소스) | null 검사가 사라지고 `constrained.` + `callvirt` |
| `await using` | `IAsyncDisposable::DisposeAsync()` + await 상태 전이 |
| `lock (o) { }` | `Monitor::Enter(object, bool&)` + `.try`/`finally` + `brfalse` + `Monitor::Exit(object)` |
| `lock (l) { }` (`System.Threading.Lock`, ※C# 13) | `Lock::EnterScope()` + `Lock/Scope::Dispose()` |

> **⚠️ `finally`가 실행되게 만드는 것은 `leave`다**
>
> `try` 블록 끝의 `leave.s`가 "정상적으로 벗어나겠다"는 선언이고, CLR이 그때 `finally`를 실행한 뒤 목적지로 점프한다. `return`도 `leave`로 컴파일되므로 `try` 안의 `return`이 `finally`를 건너뛰지 못한다(32.2절). 다만 절대적 보장은 아니다 — `StackOverflowException`이나 `Environment.FailFast`로 프로세스가 죽으면 `finally`는 실행되지 않는다.

> **📌 `lock`은 잠글 객체를 지역 변수에 한 번만 저장한다**
>
> `Enter`와 `Exit`가 반드시 같은 객체를 받아야 하기 때문이다. `lock (GetLock())`을 써도 `GetLock()`은 한 번만 호출된다. 그리고 `bool lockTaken` 플래그가 함께 나타난다 — `Enter` 직후 스레드 중단으로 `Exit`가 누락되는 경쟁 조건을 막는 설계다(56.6절).

### `checked` / `unchecked`

`checked`는 순전히 컴파일 타임 개념이고, 컴파일러가 다른 옵코드를 고르는 것으로 끝난다(7.9절).

| 연산 | 기본(`unchecked`) | `checked` (부호 있음) | `checked` (부호 없음) |
|---|---|---|---|
| 덧셈 | `add` | `add.ovf` | `add.ovf.un` |
| 뺄셈 | `sub` | `sub.ovf` | `sub.ovf.un` |
| 곱셈 | `mul` | `mul.ovf` | `mul.ovf.un` |
| `int`로 변환 | `conv.i4` | `conv.ovf.i4` | `conv.ovf.i4.un` |
| `byte`로 변환 | `conv.u1` | `conv.ovf.u1` | `conv.ovf.u1.un` |
| 나눗셈 | `div` | `div` (변형 없음) | `div.un` |

> **⚠️ `.ovf`는 어휘적이다 — 호출된 메서드 안까지 전파되지 않는다**
>
> `checked { Helper(a, b); }`를 써도 `Helper` 안의 산술은 여전히 `add`다. `checked`는 그 블록 안에서 **직접 방출되는 IL**만 바꾼다. 프로젝트 전체에 적용하려면 `<CheckForOverflowUnderflow>true</CheckForOverflowUnderflow>`를 켜야 하며, 이 경우 핫 루프의 IL에 `.ovf` 접미사가 붙는다는 사실을 의식해야 한다(오버플로 검사 분기가 루프 안에 들어가면 벡터화를 방해한다).

### 문자열 연결과 보간

| C# | IL | 비고 |
|---|---|---|
| `a + b` (둘 다 `string`) | `call string String::Concat(string, string)` | |
| `a + b + c + d` | `Concat(string, string, string, string)` | 4개까지 전용 오버로드가 있다 |
| 5개 이상 | `newarr string` / `stelem.ref` 반복 / `Concat(string[])` | 배열 할당이 하나 추가된다 |
| `"x" + obj` | `Concat(object, object)` 또는 `obj.ToString()` 경유 | 값 타입이면 여기서 **박싱**이 생긴다 |
| `$"Hello, {name}!"` (구멍이 전부 `string`) | `Concat(string, string, string)` | 핸들러를 쓰지 않는다 |
| `$"x = {x}, y = {y:F2}"` | `DefaultInterpolatedStringHandler` (구조체) + `AppendLiteral`/`AppendFormatted<T>` + `ToStringAndClear` | ※C# 10 / .NET 6+. 값 타입 인수도 박싱되지 않는다 |
| `$"Hello {Const}"` (상수만) | `ldstr "Hello world"` | 컴파일 타임에 접힌다 |
| `FormattableString s = $"…";` | `FormattableStringFactory::Create(string, object[])` | **`object[]` 할당과 박싱이 되살아난다** |
| 루프 안의 `s += x;` | 반복마다 `Concat` 호출 | `StringBuilder`로 바꿔야 하는 이유가 IL에 보인다 |

> **⚠️ `$"..."`가 항상 보간 핸들러를 쓰는 것은 아니다**
>
> 위 표의 셋째·넷째 줄이 전부 다른 코드다. 그리고 대상 타입이 `string`이 아니면 또 달라진다 — `IFormattable`이나 `FormattableString`으로 받으면 `object[]` 할당과 박싱이 돌아온다(56.6절). 로깅 API에 보간 문자열을 그냥 넘기는 코드가 예상보다 비싼 이유가 이것이며, 커스텀 보간 핸들러를 받는 오버로드가 있는 API인지 확인해야 한다.

### 박싱과 언박싱

| C# | IL | 할당 |
|---|---|---|
| `object o = 5;` | `ldc.i4.5` / `box System.Int32` | 있음 |
| `IComparable c = 5;` | `box System.Int32` | 있음 |
| `int i = (int)o;` | `unbox.any System.Int32` | 없음(복사만) |
| `((IFoo)s).M()` (s는 구조체) | `box` / `callvirt` | 있음 |
| `s.M()` (`M`이 구조체가 직접 구현한 인터페이스 메서드) | `call` 또는 `constrained.` + `callvirt` | 없음 |
| `object.Equals(s1, s2)` | `box` 두 번 | 있음 |
| `Console.WriteLine(i)` | `call WriteLine(int32)` | 없음 — 전용 오버로드 덕분 |
| `string.Format("{0}", i)` | `box` | 있음 |
| `list.Add(i)` (`List<int>`) | `callvirt Add(!0)` | 없음 — 제네릭 특수화 |
| `enum` 값을 `object`로 | `box <열거형 타입>` | 있음 |

> **📌 박싱을 세려면 `box`만 세면 된다**
>
> IL에서 `box` 명령의 개수가 곧 박싱 횟수다. 층을 넘어 사라지지 않는 몇 안 되는 항목이라 IL만 보고 판정해도 되고, 54.6절에서 본 대로 `int` 하나의 박싱이 64비트에서 힙 24바이트를 쓴다. `unbox.any`는 복사만 하므로 할당이 아니다.

### 델리게이트 · 람다 · 지역 함수

| C# | IL 패턴 | 할당 |
|---|---|---|
| 정적 메서드 그룹 변환 | `ldnull` / `ldftn <메서드>` / `newobj D::.ctor(object, native int)` | 델리게이트 1회 (캐시될 수 있다) |
| 인스턴스 메서드 그룹 변환 | `<수신자>` / `ldftn instance …` / `newobj` | 델리게이트 1회 |
| 가상 메서드 그룹 변환 | `dup` / `ldvirtftn` / `newobj` | `dup`이 필요한 이유는 `ldvirtftn`이 수신자를 소비하기 때문 |
| 캡처 없는 람다 | `<>c` 싱글턴 + `<>9__N_M` 정적 필드 + `ldsfld`/`dup`/`brtrue.s` | **첫 호출 때 1회만** |
| 변수를 캡처하는 람다 | `<>c__DisplayClassN_M` `newobj` + `stfld`로 변수 이사 | 진입 시 무조건 1회 + 델리게이트 1회 |
| `static` 람다 (※C# 9) | 캡처 자체가 컴파일 오류 | 캡처 없는 람다와 동일 |
| 지역 함수 (델리게이트 변환 없음) | `call`. 캡처는 **구조체** 디스플레이 클래스를 `ref`로 전달 | 힙 할당 없음 |
| 델리게이트 호출 | `callvirt instance … Invoke(…)` | — |
| `d1 + d2` | `Delegate::Combine` + `castclass` | 새 델리게이트 1회 |

> **⚠️ 캡처 하나가 스코프 전체를 붙잡는다**
>
> 컴파일러는 같은 스코프에서 캡처된 **모든** 변수를 하나의 디스플레이 클래스에 몰아넣는다(26.10절). 큰 배열과 `int` 하나를 같은 스코프에서 캡처하면, `int`만 쓰는 람다가 살아 있는 동안 배열도 함께 살아 있다. IL에서 `<>c__DisplayClass0_0`, `<>c__DisplayClass0_1`처럼 끝 숫자가 다른 타입이 여럿 보이면 스코프가 그만큼 나뉜 것이다. **중괄호 블록으로 스코프를 쪼개면 클래스도 쪼개진다.**

### 반복자와 `async`

둘 다 메서드 본문이 **통째로 별도 타입으로 옮겨지고**, 원래 메서드에는 그 타입을 만들어 돌려주는 stub만 남는다.

| 항목 | 반복자(`yield`) | `async` |
|---|---|---|
| 생성 타입 이름 | `<M>d__N` | `<M>d__N` |
| 표지 특성 | `[IteratorStateMachine(typeof(...))]` | `[AsyncStateMachine(typeof(...))]` |
| 구현하는 것 | `IEnumerable<T>`, `IEnumerator<T>`, `IDisposable` | `IAsyncStateMachine` |
| 상태 필드 | `<>1__state` | `<>1__state` (`-1`=실행 중, `-2`=완료, `0`+=N번째 `await` 대기) |
| 값 필드 | `<>2__current` | `<>t__builder`, `<>u__1` … (보류 중 awaiter) |
| 그 외 필드 | `<>l__initialThreadId`, `<>3__<매개변수>` | `<>4__this`, 캡처된 지역 변수 |
| Release에서의 종류 | **클래스** (`newobj`) | **구조체** (`.locals init (valuetype …)`) |
| 본문 위치 | `MoveNext()` 안의 거대한 `switch` | `MoveNext()` 안의 `switch` + `try`/`catch` |
| 상세 | 28.4절 | 47.7절 |

> **⚠️ `async` 메서드의 IL은 stub에 없다**
>
> 원래 메서드에는 상태 기계를 초기화하고 `builder.Start(ref sm)`를 호출한 뒤 `builder.Task`를 반환하는 20줄 남짓만 남는다. 실제 로직은 **중첩 타입의 `MoveNext()`** 안에 있다. `ildasm` 트리에서 그 중첩 타입을 따로 펼치거나, ILSpy에서 "Show internal types and members"를 켜야 보인다(56.6절).

> **📌 동기적으로 완료되는 `async` 메서드는 힙 할당이 없다**
>
> Release에서 상태 기계는 구조체이고 스택에 놓인다. 첫 `await`이 **실제로 완료되지 않았을 때만** 빌더가 그것을 힙으로 올린다(47.9절). Debug 빌드에서는 클래스로 생성되므로 `newobj`가 보인다 — **async 할당 비용을 IL로 판단할 때 Release로 봐야 하는 이유**다.

### 패턴 매칭과 타입 검사

| C# | IL |
|---|---|
| `typeof(T)` | `ldtoken T` / `call Type::GetTypeFromHandle(RuntimeTypeHandle)` |
| `o.GetType()` | `callvirt instance Type Object::GetType()` |
| `o is Person` | `isinst Person` / `ldnull` / `cgt.un` |
| `o is Person p` | `isinst Person` / `stloc` / `ldloc` / `brfalse` |
| `o is int i` | `isinst Int32` / `brfalse` / `unbox.any Int32` |
| `o as Person` | `isinst Person` |
| `(Person)o` | `castclass Person` — 실패하면 `InvalidCastException` |
| `o is null` | `ldnull` / `ceq` 또는 `brfalse` |
| `o is not null` | `ldnull` / `cgt.un` |
| `x is > 0 and < 10` | 비교 두 번 + 분기. 새 옵코드 없음 |
| `c is >= 'a' and <= 'z'` | 부호 없는 뺄셈 한 번으로 줄어들 수 있다 |
| `nameof(x)` | `ldstr "x"` — 완전한 컴파일 타임 상수 |
| `x ?? y` | `dup` / `brtrue` / `pop` / `<y>` |
| `x?.M()` | 널 검사 + `brfalse`로 건너뛰기. 결과가 값 타입이면 `Nullable<T>` |
| `x ??= y` | 널 검사 후 대입 |
| `(a, b) = t` (분해) | `call Deconstruct(out …, out …)` 또는 `ValueTuple` 필드 직접 읽기 |
| `(1, "x")` (튜플 리터럴) | ``newobj instance void valuetype ValueTuple`2<int32,string>::.ctor(!0, !1)`` |
| `a + b` (연산자 오버로딩) | `call <타입> T::op_Addition(T, T)` |
| 사용자 정의 변환 | `call T::op_Implicit(…)` / `op_Explicit(…)` |

> **📌 선언 패턴은 공짜다**
>
> `o is string s`의 IL은 `isinst` **하나**이고, C# 6 시절의 `as` + null 검사와 정확히 같다(77.15절). "`is`로 검사하고 다시 캐스트하면 두 번 검사한다"는 옛 조언은 패턴 변수를 쓰면 해당되지 않는다. 반면 `if (o is Person) { var p = (Person)o; }`처럼 옛 방식으로 쓰면 `isinst`와 `castclass`가 둘 다 나온다 — 그건 IL에서 눈으로 확인된다.

---

## A.4 C# / IL / x64 어셈블리 3단 대응 예제

> **⚠️ 이 절의 어셈블리는 전부 예시다**
>
> 네이티브 코드는 **JIT 버전, 계층, 대상 아키텍처, CPU가 지원하는 명령어 집합, 동적 PGO 프로파일, 호출 규약**에 따라 달라진다. 같은 소스를 같은 머신에서 두 번 뽑아도 계층이 다르면 다른 코드가 나온다(55.2절). 아래 리스팅은 "이런 모양이 나온다"를 보이기 위한 것이고, **실제 출력은 반드시 직접 뽑아 확인해야 한다.** 특히 `MethodTable` 안의 슬롯 오프셋(`[rax+0x40]` 같은 값)은 런타임 구현 세부사항이며 버전마다 바뀐다. 절대 그 숫자에 의존하는 코드를 쓰지 마라.
>
> 아래 예제는 x64 / Windows 호출 규약(첫 네 정수 인수가 `rcx`, `rdx`, `r8`, `r9`)을 가정한다. Linux/macOS의 System V 규약은 `rdi`, `rsi`, `rdx`, `rcx`를 쓰므로 레지스터 이름이 다르게 보인다. ARM64는 `x0`~`x7`이다.

### 예제 1 — 단순 산술

**① C#**

```csharp
public static int Add(int x, int y) => x + y;
```

**② IL (Release)**

```il
.method public hidebysig static int32 Add(int32 x, int32 y) cil managed
{
  .maxstack  2
  IL_0000:  ldarg.0
  IL_0001:  ldarg.1
  IL_0002:  add
  IL_0003:  ret
}
```

**③ x64 어셈블리 (예시)**

```asm
; Program:Add(int,int):int (Tier1)
       lea      eax, [rcx+rdx]
       ret
```

**대응**

| C# | IL | 어셈블리 | 설명 |
|---|---|---|---|
| `x` | `ldarg.0` | `rcx` | 평가 스택 대신 인수 레지스터에 이미 들어 있다 |
| `y` | `ldarg.1` | `rdx` | |
| `x + y` | `add` | `lea eax, [rcx+rdx]` | 주소 계산 명령을 덧셈에 전용한 관용구다 |
| `return` | `ret` | `ret` | 반환값은 `eax` |

읽어야 할 것은 하나다. **평가 스택이 사라졌다.** IL은 값을 두 번 푸시하고 팝해서 더하지만, 네이티브 코드에는 스택 조작이 전혀 없다. 프롤로그(`push rbp` / `sub rsp, N`)도 없다 — 지역 변수를 메모리에 둘 이유가 없는 작은 메서드는 **프레임리스**로 컴파일된다(55.8절). IL의 평가 스택은 언어의 추상 모델일 뿐 실행 시 실체가 아니라는 56.2절의 서술이 여기서 눈으로 확인된다.

### 예제 2 — 필드 접근과 프로퍼티

**① C#**

```csharp
public sealed class Counter
{
    private int _count;
    public int Count => _count;
    public void Bump() => _count++;
}
```

**② IL (Release)**

```il
.method public hidebysig specialname instance int32 get_Count() cil managed
{
  .maxstack  8
  IL_0000:  ldarg.0
  IL_0001:  ldfld      int32 Counter::_count
  IL_0006:  ret
}

.method public hidebysig instance void Bump() cil managed
{
  .maxstack  8
  IL_0000:  ldarg.0
  IL_0001:  dup
  IL_0002:  ldfld      int32 Counter::_count
  IL_0007:  ldc.i4.1
  IL_0008:  add
  IL_0009:  stfld      int32 Counter::_count
  IL_000e:  ret
}
```

**③ x64 어셈블리 (예시)**

```asm
; Counter:get_Count():int:this (Tier1)
       mov      eax, dword ptr [rcx+0x08]
       ret

; Counter:Bump():this (Tier1)
       inc      dword ptr [rcx+0x08]
       ret
```

**대응**

| C# | IL | 어셈블리 | 설명 |
|---|---|---|---|
| `this` | `ldarg.0` | `rcx` | 인스턴스 메서드의 0번 인수 |
| `_count` 읽기 | `ldfld` | `[rcx+0x08]` | 64비트에서 첫 인스턴스 필드는 오프셋 8 (54.2절) |
| `this`를 두 번 쓰기 | `dup` | (없음) | 레지스터에 이미 있으므로 복제가 필요 없다 |
| `+ 1` / 저장 | `add` / `stfld` | `inc dword ptr […]` | 읽기·더하기·쓰기가 명령 하나로 접힌다 |

`+0x08`이 어디서 왔는지가 이 예제의 핵심이다. 64비트 객체의 레이아웃은 **싱크 블록 인덱스(−8) → `MethodTable` 참조(0) → 인스턴스 필드(+8부터)** 이다(54.2절). 객체 참조가 가리키는 곳은 `MethodTable` 참조이고, 필드는 그 뒤에서 시작한다. 32비트 프로세스라면 `+0x04`가 된다.

`get_Count`가 별도 메서드로 존재하지만, 이것을 호출하는 쪽의 Tier-1 코드에는 `call`이 남지 않는다. IL 7바이트짜리 메서드는 "아주 작은 메서드는 사실상 무조건 후보"라는 인라이닝 판단의 첫 관문을 여유 있게 통과한다(55.4절). 다만 **RyuJIT의 크기 기준 바이트 수는 문서화된 계약이 아니라 릴리스마다 조정되는 구현 세부**이므로, 특정 숫자를 기준선처럼 믿지 말고 생성 코드로 확인하라.

> **⚠️ `dup`이 보인다고 최적화된 IL이라고 생각하지 마라**
>
> `dup`은 C# 컴파일러가 같은 값을 두 번 푸시하는 대신 쓰는 인코딩 절약 수단이다. 네이티브 코드에는 아무 흔적도 남지 않는다. **IL 층의 최적화와 네이티브 층의 최적화를 섞어서 읽으면 안 된다.**

### 예제 3 — 가상 호출

**① C#**

```csharp
public class Shape
{
    public virtual double Area() => 0;
}

public class Circle : Shape
{
    public double R;
    public override double Area() => Math.PI * R * R;
}

public static double Measure(Shape s) => s.Area();
```

**② IL (Release)**

```il
.method public hidebysig static float64 Measure(class Shape s) cil managed
{
  .maxstack  8
  IL_0000:  ldarg.0
  IL_0001:  callvirt   instance float64 Shape::Area()
  IL_0006:  ret
}
```

**③ x64 어셈블리 — 역가상화가 일어나지 않은 경우 (예시)**

```asm
; Program:Measure(Shape):double (Tier1)
       mov      rax, qword ptr [rcx]          ; ① 객체 → MethodTable 포인터
       mov      rax, qword ptr [rax+0x40]     ; ② 슬롯 테이블(오프셋은 예시)
       jmp      qword ptr [rax+0x20]          ; ③ 실제 구현으로 간접 점프(꼬리 호출)
```

**③′ 가드된 역가상화(GDV)가 적용된 경우 (예시)**

```asm
       mov      rax, qword ptr [rcx]          ; 객체의 MethodTable 포인터
       mov      rdx, 0x7FFA1C3D2B28           ; Circle의 MethodTable 주소
       cmp      rax, rdx
       jne      SHORT G_M000_IG05             ; 다르면 느린 경로로
       vmovsd   xmm0, qword ptr [rcx+0x08]    ; --- 인라이닝된 Circle.Area() ---
       vmulsd   xmm0, xmm0, xmm0
       vmulsd   xmm0, xmm0, qword ptr [reloc @RWD00]
       ret
G_M000_IG05:
       ; 원래의 가상 호출 경로
```

**대응**

| C# | IL | 어셈블리 | 설명 |
|---|---|---|---|
| `s` | `ldarg.0` | `rcx` | |
| `s.Area()` | `callvirt` | `mov rax,[rcx]` + 슬롯 조회 + 간접 호출 | 간접 참조 2회 (54.1절) |
| (JIT 판단) | — | `cmp rax, <MT 주소>` + `jne` | GDV 가드. 프로파일이 편향되어 있을 때만 생긴다 |

**IL은 두 경우가 완전히 같다.** `callvirt` 한 줄이다. 어느 코드가 생성될지는 JIT이 정한다. 정적 타입이 `sealed`거나 계층에 재정의가 없으면 프로파일 없이도 역가상화되고, 그렇지 않으면 동적 PGO의 클래스 프로파일이 판단 근거가 된다(55.5절).

> **💡 디스어셈블리에서 호출의 정체를 판별하는 세 가지 모양**
>
> - `call <절대 주소>` — 직접 호출. 역가상화되었거나 원래 비가상이었다.
> - `call qword ptr [rax+0x??]` — **간접 호출.** 가상 호출이 그대로 남아 있다.
> - `cmp rax, <큰 상수>` + `jne` 뒤에 본문이 펼쳐져 있음 — **GDV**가 적용되었다.
> - 호출도 가드도 없이 본문만 있음 — 정적 역가상화 + 인라이닝이 끝난 상태다.

### 예제 4 — 인터페이스 호출

**① C#**

```csharp
public interface IShape
{
    double Area();
}

public static double Measure(IShape s) => s.Area();
```

**② IL (Release)**

```il
.method public hidebysig static float64 Measure(class IShape s) cil managed
{
  .maxstack  8
  IL_0000:  ldarg.0
  IL_0001:  callvirt   instance float64 IShape::Area()
  IL_0006:  ret
}
```

**③ x64 어셈블리 (예시)**

```asm
; Program:Measure(IShape):double (Tier1)
       mov      r11, 0x7FFA1C4D0100           ; 이 호출 지점 전용 디스패치 스텁의 주소
       call     qword ptr [r11]
       ret
```

**대응**

| 층 | 가상 호출과의 차이 |
|---|---|
| C# | 없음 — 문법이 같다 |
| IL | 없음 — `callvirt` 한 줄로 같다. 피연산자의 선언 타입만 인터페이스다 |
| 네이티브 | **다르다.** 슬롯 인덱스를 바로 쓸 수 없어 가상 스텁 디스패치를 거친다 |

인터페이스 메서드는 "이 인터페이스의 N번째 메서드"일 뿐이고, 그것이 구현 타입의 슬롯 테이블에서 몇 번인지는 타입마다 다르다. 그래서 런타임은 **가상 호출 스텁(virtual call stub)** 이라는 호출 지점별 캐시 구조를 쓴다. 처음에는 조회를 하고, 관찰된 수신자 타입이 하나로 굳으면 그 타입에 대한 비교와 직접 점프만 남는 형태로 스텁이 교체된다.

> **⚠️ "인터페이스 호출은 가상 호출과 같은 비용"이라고 단정하지 마라**
>
> 인터페이스 호출은 슬롯 테이블 인덱싱으로 끝나지 않고 스텁과 캐시를 거친다(54.1절). 반대 방향의 오해도 조심해야 한다 — 역가상화와 GDV가 많은 경우 이 비용을 아예 없앤다(55.5절). **어느 쪽도 IL만 보고는 알 수 없다.** 그리고 제네릭이 끼면 또 갈린다. `T`가 값 타입이면 `constrained.` 경로로 직접 호출·인라이닝되지만, `T`가 참조 타입이면 공유 코드(`__Canon`)가 쓰여 인터페이스 호출이 남는다(23.11절).

### 예제 5 — 배열 인덱싱과 경계 검사

**① C#**

```csharp
public static int Sum(int[] data)
{
    int total = 0;
    for (int i = 0; i < data.Length; i++)
        total += data[i];
    return total;
}
```

**② IL (Release)**

```il
.method public hidebysig static int32 Sum(int32[] data) cil managed
{
  .maxstack  2
  .locals init (int32 V_0, int32 V_1)
  IL_0000:  ldc.i4.0
  IL_0001:  stloc.0                     // total = 0
  IL_0002:  ldc.i4.0
  IL_0003:  stloc.1                     // i = 0
  IL_0004:  br.s       IL_0010          // 조건 검사로 점프
  IL_0006:  ldloc.0
  IL_0007:  ldarg.0
  IL_0008:  ldloc.1
  IL_0009:  ldelem.i4                   // data[i]  ← 경계 검사는 여기 "포함"되어 있다
  IL_000a:  add
  IL_000b:  stloc.0
  IL_000c:  ldloc.1
  IL_000d:  ldc.i4.1
  IL_000e:  add
  IL_000f:  stloc.1                     // i++
  IL_0010:  ldloc.1
  IL_0011:  ldarg.0
  IL_0012:  ldlen
  IL_0013:  conv.i4
  IL_0014:  blt.s      IL_0006
  IL_0016:  ldloc.0
  IL_0017:  ret
}
```

**③ x64 어셈블리 — 경계 검사가 제거된 경우 (예시)**

```asm
; Program:Sum(int[]):int (Tier1)
G_M12345_IG02:
       xor      eax, eax                          ; total = 0
       xor      edx, edx                          ; i = 0
       mov      r8d, dword ptr [rcx+0x08]         ; r8d = data.Length
       test     r8d, r8d
       jle      SHORT G_M12345_IG04               ; 길이가 0이면 루프를 건너뛴다
G_M12345_IG03:
       mov      r10d, edx
       add      eax, dword ptr [rcx+r10*4+0x10]   ; total += data[i]
       inc      edx
       cmp      r8d, edx
       jg       SHORT G_M12345_IG03
G_M12345_IG04:
       ret
```

**③′ 상한이 `Length`가 아니어서 검사가 남은 경우 (예시)**

```csharp
public static int SumFirst(int[] data, int n)
{
    int s = 0;
    for (int i = 0; i < n; i++) s += data[i];   // n과 data.Length의 관계를 JIT이 모른다
    return s;
}
```

```asm
       cmp      edx, dword ptr [rcx+0x08]      ; i vs data.Length
       jae      SHORT G_M000_IG06              ; 범위를 벗어나면 예외 경로로
       mov      eax, dword ptr [rcx+rdx*4+0x10]
       ...
G_M000_IG06:
       call     CORINFO_HELP_RNGCHKFAIL
       int3
```

**대응**

| C# | IL | 어셈블리 | 설명 |
|---|---|---|---|
| `data.Length` | `ldlen` / `conv.i4` | `mov r8d, [rcx+0x08]` | 배열 길이는 `MethodTable` 참조 바로 뒤 오프셋 8 (54.7절) |
| `data[i]` | `ldelem.i4` | `[rcx+r10*4+0x10]` | 데이터 시작 오프셋 `0x10`, 요소 크기 4를 스케일로 |
| (경계 검사) | (IL에 없다) | `cmp` + `jae` + `RNGCHKFAIL` | **제거되면 아무 흔적도 남지 않는다** |
| `i < data.Length` | `blt.s` | `cmp` + `jg` | 조건이 루프 아래에 배치된다 |

이 예제가 이 절의 결론이다. **`ldelem.i4`는 두 경우가 완전히 같다.** 경계 검사는 IL에 명령으로 나타나지 않고 `ldelem`의 **의미론에 포함**되어 있으며, 실제 비교·분기를 생성할지 말지는 JIT이 정한다. 그래서 "경계 검사가 남았는가"는 **IL로는 절대 알 수 없는 질문**이고, 반드시 네이티브 코드에서 `CORINFO_HELP_RNGCHKFAIL`을 찾아야 한다(55.6절).

> **💡 검사가 남았을 때의 정공법은 재슬라이싱이다**
>
> 상한이 `data.Length`가 아니라면 `data.AsSpan(0, n)`으로 잘라내고 `span.Length`를 상한으로 쓰면 표준형이 복원된다. 범위 검증이 N번에서 1번으로 줄어든다(55.6절, 68.4절). `unsafe` 포인터로 검사를 지우는 것은 안전성을 잃고 얻는 것이 슬라이싱과 비슷한 경우가 많으므로 최후의 수단이다.

---

## A.5 자주 보는 JIT 최적화의 흔적

디스어셈블리를 읽는 일의 절반은 **"무엇이 있는가"가 아니라 "무엇이 없는가"** 를 알아채는 것이다. 인라이닝은 `call`이 **사라진** 것으로, 경계 검사 제거는 `RNGCHKFAIL`이 **없는** 것으로 확인된다. 그래서 이 절의 표는 "찾을 것"과 "없어야 할 것"을 함께 적었다.

### 한눈에 보는 흔적표

| 최적화 | 있으면 보이는 것 | 적용되면 사라지는 것 | 확인용 스위치 | 절 |
|---|---|---|---|---|
| 인라이닝 | (없음) | 대상 메서드로 가는 `call` | `DOTNET_JitDisasmSummary=1` 목록에서 대상이 사라진다 | 55.4 |
| 경계 검사 제거 | (없음) | `cmp`+`jae`+`CORINFO_HELP_RNGCHKFAIL` | `findstr RNGCHKFAIL` | 55.6 |
| 루프 클로닝 | 루프 본문이 **두 벌**, 앞에 조건 검사 묶음 | — | 코드 크기 급증 | 55.6 |
| 상수 폴딩·죽은 분기 제거 | (없음) | `IsSupported` 검사, 도달 불가 분기 전체 | `DOTNET_TieredCompilation=0` | 55.6 |
| 루프 펼치기 | 본문이 반복되고 증가폭이 1보다 큼 | 반복당 분기 | — | 55.6 |
| 꼬리 호출 | `call` 대신 `jmp` | 에필로그, 스택 프레임 | — | 55.6 |
| 정적 역가상화 | 직접 `call` 또는 인라이닝된 본문 | `call qword ptr […]` | `sealed` 추가 전후 비교 | 55.5 |
| 가드된 역가상화(GDV) | `cmp rax, <MT 주소>` + `jne` + 인라이닝된 본문 | — | `DOTNET_TieredPGO=0/1` 비교 | 55.5 |
| 객체 스택 할당 | `[rsp+N]`에 `MethodTable` 포인터를 직접 기록 | `call CORINFO_HELP_NEWSFAST` 계열 | `MemoryDiagnoser`로 간접 확인 | 55.6 |
| null 검사 흡수 | (없음) | `test rcx, rcx` + `je` | — | 55.8 |

### 인라이닝

인라이닝의 흔적은 **부재**다. 두 가지로 확인한다.

```text
# ① 대상 메서드의 디스어셈블리에서 call이 사라졌는지
DOTNET_JitDisasm=Program:Distance DOTNET_TieredCompilation=0 dotnet run -c Release

# ② 컴파일 목록에 그 메서드가 아예 나타나지 않는지
DOTNET_JitDisasmSummary=1 dotnet run -c Release
```

②에서 목록에 없다면 그 메서드는 (a) 한 번도 호출되지 않았거나 (b) **모든 호출 지점에서 인라이닝되어 독립 컴파일이 필요 없었던** 것이다.

> **⚠️ IL 뷰어로는 인라이닝을 볼 수 없다**
>
> 인라이닝은 JIT의 결정이고, C# 컴파일러는 인라이닝을 하지 않는다. `ildasm`이나 ILSpy로 아무리 봐도 `call` 명령은 그대로 있다(55.4절). **인라이닝 논쟁은 반드시 네이티브 코드로 끝내야 한다.** 그리고 Tier-0 코드는 인라이닝을 사실상 하지 않으므로, 워밍업 없는 측정으로 추상화 비용을 판정하면 몇 배 과장된 수치를 얻는다.

### 경계 검사 제거와 루프 클로닝

경계 검사는 배열 접근마다 붙는 비교와 분기다. 제거되면 아무 흔적이 없고, 남으면 다음 모양이 보인다.

```asm
       cmp      edx, dword ptr [rcx+0x08]      ; i vs arr.Length
       jae      SHORT G_M000_IG06              ; 부호 없는 비교 하나로 음수까지 걸러낸다
       ...
G_M000_IG06:
       call     CORINFO_HELP_RNGCHKFAIL
       int3
```

루프 클로닝은 반대로 **있는 것**으로 확인한다. 루프 본문이 두 벌이고, 진입부에 null 검사와 길이 비교가 묶여 있으며, 한쪽 사본에만 `RNGCHKFAIL` 분기가 있다(55.6절).

> **💡 표를 외우지 말고 세는 습관을 들여라**
>
> "`arr.Length - 1`을 상한으로 쓰면 검사가 남는가"를 논쟁하는 것보다 30초 걸려 직접 세는 편이 빠르고 정확하다. 경계 검사 제거는 .NET 버전마다 개선되므로, 표를 규칙처럼 믿으면 낡은 지식으로 코드를 비틀게 된다(55.6절).

### 상수 폴딩과 죽은 분기 제거

JIT은 C# 컴파일러가 알 수 없는 것들을 상수로 안다. `IntPtr.Size`, `Avx2.IsSupported`, `Vector<T>.Count`, 값 타입 인스턴스화에서의 `typeof(T) == typeof(int)`, 그리고 ※.NET 8부터는 정적 생성자 실행이 끝난 `static readonly` 기본형 필드까지다(55.6절).

흔적은 **분기 자체가 사라지는 것**이다.

```csharp
if (Avx2.IsSupported)      { /* AVX2 경로 */ }
else if (Sse2.IsSupported) { /* SSE2 경로 */ }
else                       { /* 스칼라 경로 */ }
```

세 경로를 전부 컴파일하는 것처럼 보이지만, 생성된 코드에는 실행 중인 CPU에 해당하는 **한 경로만** 남고 검사 분기조차 없다. 하드웨어 내장 함수 패턴이 런타임 비용 없이 성립하는 근거가 이것이다(71.2절, 71.4절).

> **⚠️ ReadyToRun 이미지에는 이 폴딩이 그대로 적용되지 않는다**
>
> R2R 코드는 기준 명령어 집합을 가정해 미리 컴파일되므로, `IsSupported` 상수 폴딩의 이득을 온전히 받으려면 Tier-1 재컴파일까지 가야 한다(55.7절). "AOT로 게시했더니 SIMD 코드가 기대만큼 안 빨라졌다"의 흔한 원인이다.

### 루프 펼치기와 꼬리 호출

**루프 펼치기(unrolling)** 의 흔적은 본문이 여러 번 복제되고 인덱스 증가폭이 1보다 큰 것이다.

```asm
       add      eax, dword ptr [rcx+rdx*4+0x10]
       add      eax, dword ptr [rcx+rdx*4+0x14]
       add      eax, dword ptr [rcx+rdx*4+0x18]
       add      eax, dword ptr [rcx+rdx*4+0x1C]
       add      edx, 4
```

RyuJIT의 루프 펼치기는 **반복 횟수가 작고 상수일 때** 주로 적용되며, 일반 루프의 자동 벡터화는 하지 않는다(55.6절).

**꼬리 호출(tail call)** 의 흔적은 `call` + `ret` 대신 `jmp`가 나오는 것이다. 현재 프레임을 정리한 뒤 대상 메서드로 점프하므로 스택이 자라지 않는다.

```asm
       ; 일반 호출
       call     Program:Helper(int):int
       ret

       ; 꼬리 호출
       jmp      Program:Helper(int):int
```

> **⚠️ C#에는 꼬리 재귀 보장이 없다**
>
> RyuJIT의 꼬리 호출 최적화는 **제한적**이다(55.6절). 명시적 `tail.` 접두사가 있거나 특정 조건이 맞을 때만 적용되고, 조건이 맞지 않으면 런타임 헬퍼를 거치는 느린 경로가 되거나 아예 일반 호출로 남는다. **깊은 재귀를 꼬리 호출에 기대어 작성하면 `StackOverflowException`이 난다.** 재귀 깊이가 입력에 비례한다면 반복문이나 명시적 스택으로 바꿔야 한다. 그리고 `tail.` 접두사가 붙은 호출을 포함한 메서드는 인라이닝되지 않는다(55.4절).

### 역가상화

세 가지 모양을 구분하는 것이 핵심이다.

| 보이는 것 | 상태 |
|---|---|
| `call qword ptr [rax+0x??]` | 가상/인터페이스 호출이 그대로 남았다 |
| `mov r11, <스텁 주소>` + `call qword ptr [r11]` | 인터페이스 호출이 디스패치 스텁을 거친다 |
| `cmp rax, <MT 주소>` + `jne` + 펼쳐진 본문 | GDV가 적용되었다 |
| 호출도 가드도 없이 본문만 | 정적 역가상화 + 인라이닝이 끝났다 |

> **⚠️ 계층화를 끄면 GDV도 함께 사라진다**
>
> `DOTNET_TieredCompilation=0`은 최종 코드만 보고 싶을 때 편하지만, 이 스위치는 **동적 PGO도 함께 끈다.** 프로파일 없이 만들어진 Tier-1 코드에는 GDV가 없다. GDV를 확인하려면 계층화를 켠 채로 뽑고 마지막 `(Tier1)` 블록을 읽어야 한다(55.8절). 같은 이유로 SharpLab에서는 GDV를 볼 수 없다.

### 객체 스택 할당과 null 검사

이스케이프 분석이 성공하면 할당 헬퍼 호출이 사라지고, `MethodTable` 포인터와 필드가 `rsp` 기준 오프셋에 직접 기록된다(55.6절). 메모리 레이아웃은 힙에 있을 때와 완전히 같고 위치만 스택이다.

다만 **이 최적화는 기대하고 설계할 것이 못 된다.** ※.NET 8 시점에는 기본 비활성화였고(`DOTNET_JitObjectStackAllocation=1`로 켜야 관찰됐다), 이후 릴리스마다 기본값과 적용 범위가 계속 바뀌고 있다. 배열·문자열·박싱·루프 안 할당은 제외되고, JIT에는 프로시저 간 이스케이프 분석이 없어 객체를 넘겨받는 메서드가 인라이닝되지 않으면 곧바로 탈출로 간주된다(55.6절).

```asm
       ; 힙 할당
       mov      rcx, <MethodTable 주소>
       call     CORINFO_HELP_NEWSFAST
       mov      dword ptr [rax+0x08], 1

       ; 스택 할당 (이스케이프 분석 성공, 예시)
       mov      rax, <MethodTable 주소>
       mov      qword ptr [rsp+0x28], rax
       mov      dword ptr [rsp+0x30], 1
```

> **📌 명시적 null 검사가 안 보인다고 검사가 없는 것은 아니다**
>
> JIT은 **어차피 그 객체의 필드를 읽는다면** `test rcx, rcx` + `je`를 생략한다. 주소 0 근처 페이지는 매핑되어 있지 않으므로 null 참조 접근이 하드웨어 액세스 위반을 일으키고, 런타임이 그것을 잡아 `NullReferenceException`으로 바꾼다(55.8절). **null 검사가 메모리 접근에 흡수된 것**이다. 반대로 명시적 `test`가 보인다면 그 시점에 실제 메모리 접근이 뒤따르지 않는 경로라는 뜻이다.

### JIT 헬퍼 호출 읽기

`call CORINFO_HELP_...` 또는 `call coreclr!JIT_...` 형태의 호출은 JIT이 삽입한 **런타임 헬퍼**다. 이 책의 앞 장들에서 실물로 등장한 것들을 모은다.

| 헬퍼 | 언제 나오는가 | 절 |
|---|---|---|
| `CORINFO_HELP_RNGCHKFAIL` | 배열 경계 검사가 실패했을 때의 예외 경로 | 55.6 |
| `CORINFO_HELP_OVERFLOW` | `checked` 연산이 넘쳤을 때의 예외 경로 | 7.9 |
| `CORINFO_HELP_NEWSFAST` 계열 / `JIT_TrialAllocSFastMP_InlineGetThread` | 관리 힙 할당(범프 포인터 경로) | 54.6, 63장 |
| `CORINFO_HELP_CHKCASTCLASS` | `castclass`가 단순 비교로 끝나지 않을 때 | 55.8 |

> **💡 헬퍼 호출은 "여기서 무슨 일이 일어나는가"의 이름표다**
>
> 디스어셈블리에서 이해 안 되는 `call`을 만나면 대상 심볼의 이름부터 읽어라. 할당인지, 형변환인지, 예외 경로인지가 이름에 그대로 적혀 있다. 특히 **할당 헬퍼의 개수를 세는 것**은 IL의 `newobj`/`newarr`/`box`를 세는 것과 짝을 이루는 확인 작업이다 — IL에 있던 할당이 네이티브에서 사라졌다면 스택 할당이거나 죽은 코드 제거다.

### JIT이 하지 않는 것

기대를 접어야 하는 항목도 함께 알아야 흔적을 찾느라 시간을 낭비하지 않는다(55.6절).

| 최적화 | RyuJIT | 대안 |
|---|---|---|
| 일반 루프 자동 벡터화 | 하지 않는다 | `Vector<T>` / `Vector128<T>` 내장 함수를 직접 쓴다 (71장) |
| 프로시저 간 이스케이프 분석 | 하지 않는다 | 인라이닝에 의존한다 |
| 전역 프로그램 최적화 | 하지 않는다 | 메서드 단위 컴파일이다 |
| 꼬리 재귀 최적화 | 제한적 | 반복문으로 바꾼다 |
| 부동소수점 재결합 | 하지 않는다 | IEEE 754 시맨틱을 보존해야 한다 |

> **⚠️ "JIT이 알아서 해주겠지"는 위험한 가정이다**
>
> RyuJIT은 메서드 하나를 **밀리초 단위로** 컴파일해야 한다. C++ 컴파일러처럼 몇 분에 걸친 전역 분석을 할 시간 예산이 없다. 알고리즘 복잡도, 할당 횟수, 데이터 지역성은 **여전히 개발자의 책임**이고, JIT이 고쳐주는 것은 그 위에 얹힌 상수 배수뿐이다.

---

## A.6 메타데이터 토큰과 서명 읽기

`ildasm`을 `/all` 옵션으로 돌리면 IL 사이사이에 16진수 덩어리가 섞여 나온다. 대부분은 무시해도 되지만, 두 종류는 알아두면 실제로 쓸모가 있다. **메타데이터 토큰**과 **시그니처 blob**이다. 이 절은 그 둘을 읽는 데 필요한 최소한만 다룬다. 메타데이터 테이블의 역할과 매니페스트 구조는 52.2절에, 리플렉션 API로 다루는 방법은 57장에 있다.

### 토큰의 구조

메타데이터 토큰은 **4바이트 정수**이고 구조가 단순하다.

```text
    0x06 00 00 02
    ─┬── ────┬───
     │       └── RID (하위 3바이트) — 그 테이블의 행 번호. 1부터 시작한다
     └────────── 테이블 식별자 (상위 1바이트)

    → "MethodDef 테이블의 2번째 행"
```

`ildasm /all` 출력에서는 주석으로 붙어 나온다. 56.2절에서 본 리스팅이 그 예다.

```il
.method /*06000002*/ assembly hidebysig static int32
      '<<Main>$>g__Add|0_0'(int32 x, int32 y) cil managed
// SIG: 00 02 08 08 08
{
  .locals /*11000001*/ init (int32 V_0)
  ...
}
```

`/*06000002*/`는 이 메서드 정의가 MethodDef 테이블의 2번 행이라는 뜻이고, `/*11000001*/`은 지역 변수 시그니처가 StandAloneSig 테이블의 1번 행에 있다는 뜻이다.

### 자주 보는 테이블 식별자

전체 목록은 ECMA-335 Partition II에 있다. IL을 읽을 때 실제로 마주치는 것만 추린다.

| 값 | 테이블 | 어디서 보이는가 |
|---|---|---|
| `0x01` | TypeRef | 다른 어셈블리의 타입 참조 |
| `0x02` | TypeDef | 이 어셈블리가 정의한 타입 |
| `0x04` | Field | 필드 정의 |
| `0x06` | MethodDef | 메서드 정의. `call`/`callvirt`의 흔한 피연산자 |
| `0x0A` | MemberRef | 다른 어셈블리의 멤버 참조 |
| `0x0C` | CustomAttribute | `.custom` 디렉티브 |
| `0x11` | StandAloneSig | 지역 변수 시그니처, `calli`의 시그니처 |
| `0x1B` | TypeSpec | 제네릭 인스턴스화된 타입 (`List<int>` 등) |
| `0x20` | Assembly | 이 어셈블리 자신 (52.2절) |
| `0x23` | AssemblyRef | 참조하는 어셈블리 (52.2절) |
| `0x2B` | MethodSpec | 제네릭 메서드의 인스턴스화 |
| `0x70` | (테이블이 아니라 `#US` 힙) | `ldstr`의 피연산자 |

### 어느 옵코드가 어떤 토큰을 받는가

| 옵코드 | 피연산자 토큰 종류 |
|---|---|
| `call`, `callvirt`, `newobj`, `ldftn`, `ldvirtftn`, `jmp` | MethodDef / MemberRef / MethodSpec |
| `ldfld`, `stfld`, `ldsfld`, `stsfld`, `ldflda`, `ldsflda` | Field / MemberRef |
| `newarr`, `castclass`, `isinst`, `box`, `unbox`, `unbox.any`, `initobj`, `ldobj`, `stobj`, `sizeof`, `ldelem`, `stelem`, `ldelema`, `constrained.` | TypeDef / TypeRef / TypeSpec |
| `ldstr` | `#US` 힙 오프셋 (상위 바이트 `0x70`) |
| `ldtoken` | 타입 / 메서드 / 필드 어느 쪽도 가능 |
| `calli` | StandAloneSig |

56.9절의 디스어셈블러가 `Module.ResolveMember(token)`과 `Module.ResolveString(token)`을 나눠 부르는 이유가 이 표다. 옵코드의 `OperandType`이 어느 해석기를 쓸지 알려준다.

> **⚠️ 토큰은 그 모듈 안에서만 유효하고, 리빌드하면 바뀔 수 있다**
>
> 토큰은 "이 어셈블리의 이 테이블의 N번째 행"이라는 **위치 기반 식별자**다. 다른 어셈블리에서 같은 값이 전혀 다른 것을 가리키고, 소스를 조금 고쳐 다시 빌드하면 행 번호가 밀린다. **토큰 값을 설정 파일이나 데이터베이스에 저장해 영구 식별자로 쓰면 안 된다.** 지속적으로 멤버를 식별해야 한다면 정규화된 이름과 시그니처 문자열을 써야 한다. 그리고 RID가 0인 토큰(`0x06000000` 등)은 "없음"을 뜻하는 nil 토큰이다.

### 시그니처 blob 읽기

`// SIG:` 뒤의 바이트 열이 **메서드 시그니처 blob**이다. 구조는 앞에서부터 이렇다.

```text
   00        02        08        08 08
   ─┬─       ─┬─       ─┬─       ──┬──
    │         │         │          └── 매개변수 타입들 (I4, I4)
    │         │         └───────────── 반환 타입 (I4 = int32)
    │         └─────────────────────── 매개변수 개수 (2)
    └───────────────────────────────── 호출 규약 + 플래그 (DEFAULT, this 없음)

   → static int32 Add(int32, int32)
```

첫 바이트가 호출 규약과 플래그를 담는다.

| 값 | 의미 |
|---|---|
| `0x00` | DEFAULT — 보통의 관리 메서드 |
| `0x05` | VARARG — 가변 인수 |
| `0x06` | 필드 시그니처 |
| `0x07` | 지역 변수 시그니처 (`.locals`) |
| `0x08` | 프로퍼티 시그니처 |
| `0x10` | GENERIC — 제네릭 메서드. 뒤에 타입 매개변수 개수가 따라온다 |
| `0x20` | HASTHIS 플래그 — 인스턴스 메서드. 위 값들과 OR 된다 |
| `0x40` | EXPLICITTHIS 플래그 — `this`를 명시적 매개변수로 적는다 |

그래서 인스턴스 메서드는 첫 바이트가 `0x20`이 된다. `void Set(string, int32)`라는 인스턴스 메서드의 시그니처는 `20 02 01 0E 08`이다 — HASTHIS, 매개변수 2개, 반환 `void`(`0x01`), `string`(`0x0E`), `int32`(`0x08`).

### 요소 타입(element type) 값

자주 보는 것만 추린다. 전체 목록은 ECMA-335 Partition II의 `ELEMENT_TYPE_*` 정의에 있다.

| 값 | 타입 | 값 | 타입 |
|---|---|---|---|
| `0x01` | `void` | `0x0E` | `string` |
| `0x02` | `bool` | `0x0F` | 포인터 (`T*`) |
| `0x03` | `char` | `0x10` | 관리 포인터 (`T&`) |
| `0x04` | `int8` | `0x11` | `valuetype` + 타입 토큰 |
| `0x05` | `unsigned int8` | `0x12` | `class` + 타입 토큰 |
| `0x06` | `int16` | `0x13` | 타입의 제네릭 매개변수 (`!0`) |
| `0x07` | `unsigned int16` | `0x15` | 제네릭 인스턴스화 |
| `0x08` | `int32` | `0x18` | `native int` |
| `0x09` | `unsigned int32` | `0x19` | `native unsigned int` |
| `0x0A` | `int64` | `0x1C` | `object` |
| `0x0B` | `unsigned int64` | `0x1D` | 1차원 0기반 배열 (`T[]`) |
| `0x0C` | `float32` | `0x1E` | 메서드의 제네릭 매개변수 (`!!0`) |
| `0x0D` | `float64` | `0x1F` / `0x20` | `modreq` / `modopt` 수정자 |

`0x1F`(`modreq`)가 실무에서 의미 있게 등장하는 자리가 하나 있다. `init` 접근자(※C# 9)의 반환 타입에 붙는 `modreq(IsExternalInit)`이다(56.6절). 이 수정자를 이해하지 못하는 컴파일러가 호출하지 못하게 막는 장치이고, **CLR 자체는 `init`을 일반 setter로 취급한다.**

> **⚠️ blob 안의 숫자는 압축 정수다**
>
> 매개변수 개수, 배열 차원, 타입 토큰 같은 값은 고정 4바이트가 아니라 **압축 정수(compressed integer)** 로 인코딩된다. 128 미만이면 1바이트, 그보다 크면 2바이트나 4바이트가 되고 상위 비트로 길이를 구분한다. 그래서 "세 번째 바이트가 반환 타입"이라는 규칙은 **매개변수가 128개 미만일 때만** 성립한다. 손으로 읽을 때는 문제가 없지만, blob을 파싱하는 코드를 짠다면 반드시 압축 정수 디코딩을 구현해야 한다.

> **💡 손으로 읽지 말고 API를 써라**
>
> 시그니처 blob을 직접 읽어야 하는 경우는 거의 없다. `Module.ResolveSignature(token)`이 원시 바이트를 돌려주지만, 보통은 `MethodInfo.ReturnType`과 `GetParameters()`로 충분하다(57.5절). 어셈블리를 **로드하지 않고** 읽어야 한다면 `System.Reflection.Metadata`의 `MetadataReader`와 시그니처 디코더를 쓴다. 이 절의 표는 `ildasm` 출력을 눈으로 훑다가 "이 바이트가 뭐지" 싶을 때를 위한 것이지, 파서를 손으로 짜라는 뜻이 아니다.

> **📌 문자열 리터럴은 `#US` 힙에 따로 산다**
>
> `ldstr`의 피연산자는 메타데이터 테이블이 아니라 **사용자 문자열 힙(`#US`)** 의 오프셋이고, 그래서 상위 바이트가 `0x70`이다. 56.9절의 디스어셈블러가 `ResolveString`을 따로 부르는 이유이며, 이 힙에는 UTF-16으로 저장된다. 라운드트립으로 어셈블리의 문자열 하나만 바꾸는 작업(56.7절)이 실제로 건드리는 곳이 여기다.

---

## 이 부록의 요약

- **층이 셋이라는 사실이 출발점이다.** C# 소스, IL + 메타데이터, 네이티브 코드는 각각 다른 질문에 답한다. 박싱 횟수와 오버로드 선택은 IL로 확정되고, 인라이닝·경계 검사 제거·역가상화는 네이티브 코드로만 확인된다. 질문을 층에 매핑하지 못하면 엉뚱한 도구를 켜게 된다.

- **비교는 반드시 Release끼리 한다.** Debug IL의 `nop`, 무의미한 `br.s`, 조건 결과를 담는 임시 지역 변수는 전부 디버깅용이다. 여기에 계층형 컴파일이 겹친다 — Tier-0 코드는 인라이닝을 사실상 하지 않으므로 워밍업 없는 측정은 추상화 비용을 과장한다.

- **옵코드 이름은 규칙적이다.** `.s`는 인코딩 길이, `.un`은 부호 없음, `.ovf`는 오버플로 검사, 숫자 접미사는 하드코딩된 인덱스나 상수다. 이 네 규칙만 알면 처음 보는 니모닉도 읽힌다. 반대로 규칙에 없는 이름을 지어내면 `ilasm`이 거부하거나 런타임이 `InvalidProgramException`을 던진다.

- **평가 스택 규칙이 IL의 문법을 지배한다.** `stfld`는 객체를 먼저, `stelem`은 배열·인덱스·값 순으로 밀어야 한다. `leave`는 스택을 비우고 `finally`를 실행시킨다. `catch` 블록은 예외 객체가 스택에 올라온 상태로 시작한다. IL이 장황해 보이는 이유가 전부 이 규칙에서 나온다.

- **C#의 편의 문법은 IL에서 사라진다.** 프로퍼티는 메서드 쌍, 이벤트는 CAS 루프, 클로저는 디스플레이 클래스, `using`과 `lock`은 `.try`/`finally`, `foreach`는 대상 타입에 따라 셋으로 갈리고, `async`와 `yield`는 별도 상태 기계 타입이 된다. 컴파일러 생성물은 `<`, `>`가 든 이름과 `[CompilerGenerated]`로 알아본다.

- **`call`과 `callvirt`의 선택은 규칙이 있다.** 정적·확장 메서드와 `base.M()`, 값 타입이 직접 정의한 메서드는 `call`이고, 참조 타입의 인스턴스 메서드는 가상 여부와 무관하게 `callvirt`이다. `callvirt`이 있다고 실행 시 가상 디스패치가 일어나는 것은 아니다 — 그 판단은 JIT의 몫이다.

- **경계 검사는 IL에 명령으로 존재하지 않는다.** `ldelem`의 의미론에 포함되어 있고, 실제 비교·분기를 생성할지는 JIT이 정한다. 그래서 검사 잔존 여부는 네이티브 코드에서 `CORINFO_HELP_RNGCHKFAIL`을 세는 방법으로만 답할 수 있다.

- **최적화의 흔적은 대개 "없음"이다.** 인라이닝은 `call`의 부재로, 경계 검사 제거는 `RNGCHKFAIL`의 부재로, 스택 할당은 할당 헬퍼의 부재로 확인된다. 반대로 루프 클로닝(본문 두 벌)과 GDV(`cmp` + `jne` + 펼쳐진 본문)는 존재로 확인된다.

- **어셈블리 출력은 환경에 종속적이다.** JIT 버전, 계층, 아키텍처, CPU 명령어 집합, PGO 프로파일이 전부 결과를 바꾼다. 이 부록의 x64 리스팅은 예시이며 슬롯 오프셋 같은 숫자는 구현 세부사항이다. **직접 뽑아 확인하는 30초가 표를 외우는 것보다 정확하다.**

- **메타데이터 토큰은 위치 기반 식별자다.** 상위 1바이트가 테이블, 하위 3바이트가 행 번호이며, 모듈 안에서만 유효하고 리빌드로 바뀔 수 있다. 시그니처 blob은 호출 규약 바이트 → 매개변수 개수 → 반환 타입 → 매개변수 타입 순이고, 안의 숫자는 압축 정수다.

---

## 연습 문제

1. 같은 메서드 하나를 골라 SharpLab에서 **C#(낮춘 코드) / IL / JIT Asm** 세 탭을 차례로 열어라. A.1절의 "질문 → 봐야 할 층" 표에 있는 열 개의 질문 중 다섯 개를 골라, 각각 어느 탭에서 답이 나오는지 실제로 확인하라. 답이 나오지 않는 질문이 있다면 왜 그런지 적어라.

2. `int`, `string`, `List<int>`, `IEnumerable<int>` 네 가지를 각각 `foreach`로 순회하는 메서드를 작성하고 Release IL을 뽑아라. A.3절의 `foreach` 표에 적힌 네 가지 패턴이 실제로 나타나는지 확인하고, `GC.GetAllocatedBytesForCurrentThread()`로 각각의 할당량을 측정해 IL에서 예측한 것과 맞는지 대조하라.

3. 참조 타입, `sealed` 참조 타입, 구조체, `struct` 제약이 붙은 제네릭 `T` 네 가지에 대해 같은 인터페이스 메서드를 호출하는 코드를 작성하라. IL에서 `call` / `callvirt` / `constrained.`가 각각 어디에 나타나는지 표로 정리하고, A.3절의 선택 규칙 표와 대조하라.

4. A.4절 예제 5의 `Sum`과 `SumFirst`를 직접 작성하고 `DOTNET_JitDisasm`으로 뽑아라. `CORINFO_HELP_RNGCHKFAIL`이 각각 몇 번 나오는지 세고, `SumFirst`를 `AsSpan(0, n)`으로 고친 뒤 다시 세어라. 그다음 `DOTNET_JitDisasmDiffable=1`로 두 버전을 뽑아 `diff`하라.

5. 인터페이스 구현 타입을 하나만 쓰는 루프와 세 개를 번갈아 쓰는 루프를 작성하고, `DOTNET_TieredPGO=0`과 `1`로 각각 디스어셈블리를 뽑아라. GDV 가드(`cmp` + `jne`)가 나타나는 쪽과 나타나지 않는 쪽을 확인하고, BenchmarkDotNet으로 실제 처리량 차이를 측정하라.

6. `checked` 블록이 있는 메서드와 없는 메서드를 각각 만들어 IL에서 `add`와 `add.ovf`를 확인하라. 이어서 `checked` 블록 안에서 헬퍼 메서드를 호출하도록 고치고, 그 헬퍼의 IL에 `.ovf`가 붙는지 확인해 "`checked`는 어휘적"이라는 서술을 직접 검증하라.

7. `ildasm /all /METADATA`로 작은 어셈블리를 통째로 덤프하고, 메서드 하나를 골라 `/*06......*/` 토큰과 `// SIG:` 바이트를 찾아라. A.6절의 표로 시그니처를 손으로 해독한 뒤, 같은 메서드에 대해 리플렉션으로 `ReturnType`과 `GetParameters()`를 출력해 해독 결과와 일치하는지 확인하라.

---

**이어서 볼 곳** — 이 부록의 각 표는 본문의 특정 절을 압축한 것이다. IL 문법과 실행 모델을 처음부터 익히려면 56장, JIT 최적화의 조건과 원리는 55장, 객체·배열·`MethodTable`의 메모리 레이아웃은 54장으로 돌아가라. IL을 읽는 데서 나아가 **생성**해야 한다면 58장의 `ILGenerator`와 `DynamicMethod`가 다음 목적지다.
