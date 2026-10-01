# 33장. 결정적 정리와 `IDisposable`

> **이 장의 위치** — 32장에서 `finally`를 배웠지만, `finally`가 실무에서 하는 일의 9할은 하나다. **리소스 정리**. 이 장은 그 하나를 끝까지 판다. .NET은 메모리를 자동으로 회수하지만 파일 핸들·소켓·데이터베이스 커넥션·잠금은 자동으로 회수하지 않는다. 그 간극을 메우는 것이 `IDisposable`이고, 그 위에 `using`·`await using`·`SafeHandle`이 얹혀 있다.
>
> **선수 지식** — 18장(인터페이스), 23장(제네릭), 32장(예외 처리)
>
> **이 장에서 다루지 않는 것** — 파이널라이저가 실제로 언제 어떤 순서로 실행되는지, F-reachable 큐의 구조, 파이널라이저에서 `Dispose`를 부르는 백업 패턴의 전체 논의는 34.2절과 34.3절이다. 부활(resurrection)과 `GC.ReRegisterForFinalize`는 34.4절, 약한 참조는 34.5절, 타이머가 만드는 관리 메모리 누수는 34.10절이다. GC 알고리즘 자체(마크·컴팩트, 세대, 카드 테이블)는 62장과 64장에 있다. 예외 처리의 일반론 — `try`/`catch`/`finally`의 의미론, 2단계 예외 처리, 예외 필터 — 는 32장이다. 이 장은 **결정적 정리(deterministic cleanup)** 라는 한 가지 주제만 다룬다.

---

## 33.1 .NET 리소스 관리 모델 — 관리 리소스 vs 비관리 리소스

### 리소스를 쓴다는 것의 다섯 단계

프로그램은 언제나 무언가를 쓴다. 파일, 메모리 버퍼, 화면 영역, 네트워크 연결, 데이터베이스 연결. 객체지향 환경에서는 **모든 타입이 어떤 리소스를 표현**한다. 그 리소스를 쓰려면 다음 다섯 단계를 밟아야 한다.

1. 리소스를 표현하는 타입을 위한 **메모리를 할당**한다 (`new`).
2. 메모리를 **초기화**해서 리소스를 사용 가능한 상태로 만든다 (인스턴스 생성자).
3. 타입의 멤버에 접근해 **리소스를 사용**한다.
4. 리소스의 상태를 **정리(tear down)** 한다.
5. **메모리를 해제**한다.

C++ 같은 수동 메모리 관리 언어에서 1·2·3·4·5를 전부 프로그래머가 책임진다. 메모리 해제를 잊으면 메모리 누수가 나고, 해제한 메모리를 다시 쓰면 메모리 손상이 난다. 이 두 버그가 특히 고약한 이유는 **결과와 시점을 예측할 수 없다**는 데 있다. 다른 버그는 잘못 동작하는 줄을 찾아 고치면 되지만, 메모리 손상은 증상이 나타난 위치와 원인이 있는 위치가 전혀 다르다.

.NET은 이 문제를 5단계를 런타임이 가져가는 방식으로 해결했다. **가비지 컬렉터가 5단계를 전담**한다. `unsafe` 키워드를 피해 검증 가능한 형식 안전(verifiably type-safe) 코드만 쓰는 한, 애플리케이션이 메모리 손상을 겪는 것은 불가능하다. 메모리 누수는 여전히 가능하지만(컬렉션에 객체를 넣고 안 빼는 경우 등) 기본 동작은 아니다.

그런데 4단계가 남는다. 대부분의 타입은 4단계가 필요 없다. 할당하고 초기화하고 쓰다가 버리면 GC가 알아서 치운다. 문제는 **일부 타입은 4단계가 반드시 필요하다**는 것이다. 그리고 그 "일부"가 하필 실무에서 가장 자주 쓰는 것들이다 — 파일, 소켓, 커넥션.

> **📌 결정적 정리라는 용어**
>
> "결정적(deterministic)"은 "정리가 일어나는 시점을 소스 코드를 보고 알 수 있다"는 뜻이다. `using` 블록을 벗어나는 그 순간 정리된다. 반대말인 "비결정적(non-deterministic)"은 GC와 파이널라이제이션의 세계다 — 언젠가는 일어나지만 언제인지는 아무도 모른다. .NET 용어로 이 결정적 정리를 **disposal(폐기)** 이라 부르고, `IDisposable` 인터페이스로 지원한다.
>
> 정리(disposal)와 가비지 컬렉션은 다르다. 정리는 보통 **명시적으로 촉발**되고, 가비지 컬렉션은 **전적으로 자동**이다. 프로그래머가 파일 핸들·잠금·OS 리소스의 해제를 책임지고, CLR이 메모리 해제를 책임진다.

### 관리 리소스와 비관리 리소스

두 용어의 경계를 정확히 그어 두자.

| 구분 | 관리 리소스(managed resource) | 비관리 리소스(unmanaged resource) |
|---|---|---|
| 정체 | 관리 힙에 할당된 메모리 | OS 커널 객체, 네이티브 힙 메모리, 하드웨어 자원 |
| 표현 | 객체 참조 | 핸들(`IntPtr`), 포인터 |
| 회수 주체 | GC | 아무도 — 명시적으로 반납해야 한다 |
| 회수 시점 | 비결정적 | 개발자가 정한다 |
| GC가 크기를 아는가 | 안다 | **모른다** |
| 누수했을 때 | 메모리 사용량 증가 | 핸들 고갈, 잠금 유지, 풀 고갈 |

핵심은 마지막 두 줄이다. `FileStream` 객체 자체는 관리 힙에서 수십 바이트를 차지한다. 그런데 그 객체가 붙잡고 있는 Windows 파일 핸들, 또는 Linux 파일 디스크립터는 **관리 힙 바깥에 있는 유한한 자원**이다. GC는 관리 힙의 압력만 본다. 관리 힙이 여유로우면 GC는 일어나지 않고, GC가 일어나지 않으면 그 `FileStream`은 며칠이고 파일 핸들을 붙잡고 있을 수 있다.

> **⚠️ GC는 "핸들이 부족하다"를 감지하지 못한다**
>
> GC가 컬렉션을 시작하는 기준은 **할당량과 메모리 압력**이다. "파일 디스크립터가 1,020개 열려 있다"는 사실은 GC에게 아무 신호도 주지 않는다. 그래서 관리 힙 사용량이 20MB밖에 안 되는 프로그램이 파일 핸들 고갈로 죽는 일이 벌어진다. 이 비대칭이 `IDisposable`이 존재하는 이유 전부다.
>
> `GC.AddMemoryPressure`와 `HandleCollector`가 이 비대칭을 부분적으로 보정하지만(33.8절), 근본 해법은 아니다.

### 비관리 리소스의 실제 목록

"비관리 리소스"가 추상적으로 들린다면 다음 표를 보자. 왼쪽이 관리 타입, 오른쪽이 그 안에 숨어 있는 진짜 자원이다.

| 관리 타입 | 붙잡고 있는 비관리 자원 | 고갈되면 |
|---|---|---|
| `FileStream` | 파일 핸들 / 파일 디스크립터 | `IOException`, 파일 잠금 유지 |
| `Socket`, `TcpClient` | 소켓 핸들, TCP 포트 | `SocketException`, 포트 고갈 |
| `Mutex`, `Semaphore`, `EventWaitHandle` | 커널 동기화 객체 핸들 | 핸들 고갈, 교착 |
| `SqlConnection` | TCP 연결 + 서버 세션 | 커넥션 풀 고갈 → 타임아웃 |
| `RegistryKey` | 레지스트리 키 핸들 (Windows 전용) | 핸들 고갈 |
| `Bitmap`, `Brush`, `Pen` | GDI+ 객체 (Windows 전용) | GDI 객체 한도 초과 |
| `MemoryMappedFile` | 파일 매핑 객체 + 뷰 | 주소 공간 고갈 |
| `Process` | 프로세스 핸들 | 핸들 고갈, 좀비 프로세스 |

역방향 규칙도 성립한다. **어떤 타입이 `IDisposable`이라면, 그 타입은 직접이든 간접이든 비관리 핸들을 참조하는 경우가 많다.** 비관리 핸들이야말로 객체가 자기 자신 바깥의 세계 — OS 리소스, 네트워크 연결, 데이터베이스 잠금 — 에 말썽을 일으킬 수 있게 하는 통로이기 때문이다.

"많다"이지 "항상"은 아니다. `MemoryStream`이나 `StringReader`는 비관리 핸들이 하나도 없으면서 `IDisposable`이다. 이 예외들은 33.4절에서 따로 다룬다.

### 소유의 사슬

실제 코드에서 비관리 리소스는 보통 **직접** 잡지 않는다. 여러 층을 거친다.

```text
  관리 힙                                       커널 / 네이티브
┌───────────────────────────────────────┐    ┌────────────────────┐
│                                       │    │                    │
│  StreamWriter                         │    │                    │
│    └─ _stream ──► FileStream          │    │                    │
│                     └─ _handle ──►    │    │                    │
│                        SafeFileHandle │    │                    │
│                          handle: 0x1C4├───►│  Windows 파일 객체 │
│                                       │    │  (또는 Unix fd)    │
│                                       │    │                    │
└───────────────────────────────────────┘    └────────────────────┘
     GC가 회수한다                              GC가 모른다
```

`StreamWriter`를 `Dispose`하면 그 사슬을 따라 `FileStream.Dispose`가 불리고, 다시 `SafeFileHandle.Dispose`가 불리고, 마지막에 `CloseHandle`(또는 `close`) 시스템 호출이 일어난다. 사슬 중 어느 한 고리라도 끊기면 커널 객체가 남는다.

> **📌 "간접적으로 비관리"라는 것의 의미**
>
> 클래스에 `IDisposable`을 구현한 필드가 있으면 **그 클래스도 `IDisposable`을 구현해야 한다**. 이 규칙은 CLR이 강제하지 않는다. 컴파일러도 경고하지 않는다(분석기를 켜면 CA1001이 잡는다). 순전히 관례다. 그런데 이 관례가 깨지면 사슬이 끊기고, 사슬이 끊긴 지점은 코드 리뷰로만 찾을 수 있다.
>
> 실용적 판단 기준: **클래스의 어떤 필드에 `IDisposable`을 구현한 객체가 대입된다면, 그 클래스도 `IDisposable`을 구현하라.**

### C# 소멸자는 C++ 소멸자가 아니다

`~ClassName()` 문법은 C++ 소멸자와 똑같이 생겼다. C# 언어 명세도 한때 이것을 "소멸자(destructor)"라고 불렀다. 그런데 동작은 전혀 다르다.

| | C++ 소멸자 | C# `~Type()` (파이널라이저) |
|---|---|---|
| 호출 시점 | 스코프를 벗어나는 즉시 (결정적) | GC가 결정 (비결정적) |
| 호출 스레드 | 객체를 쓰던 스레드 | 전용 파이널라이저 스레드 |
| 호출 순서 | 생성 역순 보장 | **보장 없음** |
| 호출 보장 | 보장 | 프로세스가 깨끗이 종료되지 않으면 안 불릴 수 있다 |
| 지연 시간 | 0 | 나노초 ~ 며칠 |

C++에서 넘어온 개발자가 가장 자주 하는 오해가 "C#에도 소멸자가 있으니 스코프를 벗어나면 정리되겠지"다. **CLR은 결정적 파괴(deterministic destruction)를 지원하지 않는다.** 그래서 C#도 그 메커니즘을 제공할 수 없다. C#이 제공하는 결정적 정리는 오직 `IDisposable` + `using`뿐이다.

> **⚠️ `~Type()`을 쓰기 전에 세 번 생각하라**
>
> 파이널라이저를 정의하면 그 타입의 인스턴스는 **컬렉션에서 살아남아 다음 세대로 승격**된다. 파이널라이저가 실행될 때까지 객체가 살아 있어야 하기 때문이다. 그리고 그 객체가 참조하는 모든 객체도 함께 승격된다. 할당과 컬렉션 모두 느려진다.
>
> 이 장에서 배울 결론을 먼저 말하면 이렇다. **직접 비관리 리소스(원시 `IntPtr` 핸들)를 필드로 가진 타입만 파이널라이저를 정의하라. 그리고 대부분의 경우 그런 타입을 직접 쓰는 대신 `SafeHandle`을 쓰면 파이널라이저를 아예 안 써도 된다**(33.7절). 파이널라이저의 실행 순서·비용·F-reachable 큐는 34.2절에서 상세히 다룬다.

> **💡 정리가 필요한지 판단하는 실용 규칙**
>
> 세 가지만 기억하면 실무의 95%가 커버된다.
>
> 1. 내가 `new`로 만든 객체가 `IDisposable`이면 → `using`으로 감싼다.
> 2. 내 클래스의 필드가 `IDisposable`이면 → 내 클래스도 `IDisposable`을 구현하고 필드를 `Dispose`한다.
> 3. 내가 원시 핸들(`IntPtr`)을 직접 다룬다면 → `SafeHandle` 파생 클래스를 만든다.
>
> 파이널라이저는 3번에서도 필요 없다. `SafeHandle`이 이미 갖고 있다.

---

## 33.2 표준 정리 의미론 — `Dispose` / `Close` / `Dispose(bool)`

### 인터페이스 자체는 사소하다

```csharp
namespace System;

public interface IDisposable
{
    void Dispose();
}
```

메서드 하나. 반환값 없음. 매개변수 없음. 이 인터페이스가 어려운 이유는 시그니처가 아니라 **그 뒤에 붙어 있는 암묵적 계약** 때문이다. 계약은 언어에도 런타임에도 하드코딩되어 있지 않다. .NET이 사실상의 표준(de facto standard)으로 지켜 온 규약이고, 그 목적은 소비자에게 일관된 프로토콜을 제공하는 것이다.

### 세 가지 규칙

.NET의 정리 로직은 다음 세 규칙을 따른다.

**규칙 1 — 폐기된 객체는 되돌릴 수 없다.**
객체가 폐기되면 그것으로 끝이다. 다시 활성화할 수 없고, `Dispose` 이외의 메서드나 속성을 호출하면 `ObjectDisposedException`이 발생한다.

**규칙 2 — `Dispose`를 반복 호출해도 오류가 나지 않는다.**
즉 `Dispose`는 **멱등(idempotent)** 이어야 한다. 두 번 부르든 열 번 부르든 한 번 부른 것과 결과가 같아야 한다.

**규칙 3 — `x`가 `y`를 "소유"하면 `x.Dispose()`가 `y.Dispose()`를 부른다.**
별도 지시가 없는 한 그렇다. 컨테이너 객체가 자식 객체를 자동으로 폐기한다는 뜻이다.

이 규칙들은 **의무가 아니다**. 자기 타입에 "Undispose" 메서드를 만드는 것을 막는 것은 아무것도 없다 — 동료들의 눈총 말고는. 그러나 규칙을 어기면 소비자가 `using`을 쓸 수 없게 되고, 그 순간 그 타입은 .NET 생태계에서 이물질이 된다.

> **⚠️ 규칙 2가 없으면 `using`이 깨진다**
>
> 멱등성이 왜 필수인지는 다음 코드가 보여 준다.
>
> ```csharp
> using (var writer = new StreamWriter(path))
> {
>     writer.Write(data);
>     writer.Dispose();   // 명시적으로 한 번 부르고
> }                       // using이 나가면서 또 부른다
> ```
>
> 이런 코드는 실수처럼 보이지만 실무에서 흔하다. 조건에 따라 일찍 닫아야 하는데 `using`도 유지하고 싶은 경우, 예외 경로에서 정리 후 재시도하는 경우. 여기서 두 번째 `Dispose`가 예외를 던지면 정상 경로가 예외 경로가 된다.
>
> 더 나쁜 시나리오는 33.3절의 전체 패턴이다. 파이널라이저와 명시적 `Dispose`가 **둘 다** 정리 코드로 들어가는 구조라서, 멱등성이 없으면 핸들을 두 번 닫는다. 이미 다른 곳에 재할당된 핸들 값을 닫아 버리는 **핸들 재활용(handle recycling)** 사고가 여기서 나온다.

### 규칙 3 — 소유권의 사슬

컨테이너가 자식을 자동으로 폐기하는 예는 많다.

- Windows Forms의 `Form`이나 `Panel` 같은 컨테이너 컨트롤: 자식 컨트롤을 아무리 많이 담아도 하나하나 폐기할 필요가 없다. 부모 컨트롤이나 폼을 닫거나 폐기하면 전부 정리된다.
- `FileStream`을 `DeflateStream`으로 감쌌을 때: `DeflateStream`을 폐기하면 `FileStream`도 폐기된다.
- `StreamWriter`가 `FileStream`을 감쌌을 때: `StreamWriter.Dispose()`가 버퍼를 플러시하고 `FileStream`을 닫는다.

"별도 지시가 없는 한"이 핵심이다. 지시하는 방법이 `leaveOpen` 매개변수다.

```csharp
// 기본: sw.Dispose()가 fs도 닫는다
using var fs = new FileStream("data.bin", FileMode.Create);
using var sw = new StreamWriter(fs);

// leaveOpen: true → sw.Dispose()는 버퍼만 플러시하고 fs는 열어 둔다
var sw2 = new StreamWriter(fs, Encoding.UTF8, bufferSize: 1024, leaveOpen: true);
sw2.Dispose();      // fs는 여전히 살아 있다
fs.Position = 0;    // 계속 쓸 수 있다
```

`StreamReader`, `StreamWriter`, `BinaryReader`, `BinaryWriter`, `GZipStream`, `DeflateStream`, `CryptoStream` 등 데코레이터 계열은 거의 모두 `leaveOpen` 오버로드를 갖고 있다. 스트림 아키텍처 전반은 40.1절에서 다룬다.

> **⚠️ 이중 `using`과 이중 폐기**
>
> 위 예제에서 `fs`와 `sw`를 둘 다 `using`으로 감쌌다. `sw.Dispose()`가 `fs`를 이미 닫았는데 `fs`의 `using`이 또 `Dispose`를 부른다. 이게 안전한 이유가 **규칙 2** 다. 이미 정리된 스트림의 `Dispose`는 아무 일도 하지 않고 반환한다.
>
> 그렇다고 `fs`의 `using`을 빼면 안 된다. `new StreamWriter(fs)` 생성자가 예외를 던지는 경우 `fs`가 새기 때문이다. 이 시나리오는 33.10절에서 다시 본다.

### `Close`, `Stop`, 그리고 이름의 혼란

일부 타입은 `Dispose` 외에 `Close`라는 메서드를 정의한다. BCL은 `Close`의 의미론에 대해 완전히 일관되지는 않지만, 거의 모든 경우 다음 둘 중 하나다.

- **`Dispose`와 기능적으로 동일**
- **`Dispose`의 기능적 부분집합**

| 타입 | `Close`의 의미 | `Dispose`와의 관계 |
|---|---|---|
| `Stream` 계열 | 스트림을 닫는다 | 사실상 동일 (`Close`가 `Dispose`를 부른다) |
| `IDbConnection` (`SqlConnection` 등) | 연결을 닫는다. **다시 `Open` 가능** | 부분집합 — `Dispose`한 연결은 재사용 불가 |
| `Form` (`ShowDialog`로 띄운 것) | 폼을 숨긴다 | 부분집합 — `Dispose`는 리소스를 해제한다 |
| `Timer`, `HttpListener` | `Stop` — 비관리 리소스를 해제할 수 있지만 **재시작 가능** | 부분집합 |

`Close`가 존재하는 이유는 순전히 자연스러움이다. 파일은 "폐기"하는 것보다 "닫는" 것이 자연스럽게 들린다. 그러나 이 이중화가 혼란의 원인이 된다.

```csharp
static void DisposeFileStream()
{
    FileStream fs = new FileStream("myFile.txt", FileMode.OpenOrCreate);

    // 최소한 헷갈린다 — 이 둘은 같은 일을 한다
    fs.Close();
    fs.Dispose();
}
```

> **⚠️ `Close`가 `SuppressFinalize`를 부르지 않는 경우가 있다**
>
> `Dispose`는 리소스 해제 외에 한 가지를 더 한다. **GC에게 이 객체는 더 이상 파이널라이즈할 필요가 없다고 알린다** — 즉 `GC.SuppressFinalize()`를 부른다. `Close`는 일반적으로 그렇지 않다.
>
> 결과적으로 `Close`만 부른 객체는 리소스는 해제되었는데도 파이널라이제이션 큐에 남는다. 파이널라이저가 필요 없는데도 파이널라이저 스레드가 처리해야 하고, 객체는 한 세대 더 승격된다.
>
> 선택권이 있다면 **`Dispose()`가 `Close()`보다 낫다.** (모던 .NET의 `Stream.Close()`는 내부적으로 `Dispose()`를 부르므로 이 문제가 없지만, 모든 타입이 그런 것은 아니다. 규칙으로 삼기에는 `Dispose`가 안전하다.)
>
> 예외는 규칙 1과 충돌하는 경우다. `IDbConnection`을 나중에 다시 `Open`해야 한다면 `Dispose`가 아니라 `Close`를 불러야 한다.

### 세 개의 메서드 — `Dispose()`, `Dispose(bool)`, `Finalize()`

표준 Dispose 패턴에는 세 개의 메서드가 등장한다. 셋의 관계를 먼저 그림으로 잡아 두자. 구현은 다음 절에서 한다.

```text
   소비자가 부른다                      GC가 부른다
        │                                   │
        ▼                                   ▼
 ┌─────────────────┐              ┌──────────────────┐
 │  Dispose()      │              │  ~Type()         │
 │  (public,       │              │  = Finalize()    │
 │   NOT virtual)  │              │  (protected      │
 └────────┬────────┘              │   override)      │
          │                       └─────────┬────────┘
          │ Dispose(true)                   │ Dispose(false)
          │ + SuppressFinalize(this)        │
          ▼                                 ▼
   ┌──────────────────────────────────────────────────┐
   │  protected virtual void Dispose(bool disposing)  │
   │                                                  │
   │   if (disposing) { 관리 리소스 정리 }            │
   │   비관리 리소스 정리                             │
   │   disposed = true                                │
   └──────────────────────────────────────────────────┘
                        ▲
                        │ base.Dispose(disposing)
             파생 클래스가 override 한다
```

세 메서드의 역할 분담은 다음과 같다.

| 메서드 | 접근성 | 가상 여부 | 누가 부르는가 | 하는 일 |
|---|---|---|---|---|
| `Dispose()` | `public` | **비가상** | 소비자 (`using` 포함) | `Dispose(true)` + `GC.SuppressFinalize(this)` |
| `Dispose(bool)` | `protected` | **가상** | 위 둘 | 실제 정리 로직 전부 |
| `~Type()` | (`protected override Finalize`) | 가상 | GC (파이널라이저 스레드) | `Dispose(false)` |

`disposing` 플래그의 의미가 이 패턴의 전부다. `true`면 **`Dispose` 메서드에서 "정상적으로" 불렸다**는 뜻이고, `false`면 **파이널라이저에서 "최후의 수단 모드"로 불렸다**는 뜻이다.

`disposing`이 `false`일 때는 다른 파이널라이즈 가능 객체를 참조하면 안 된다. 그 객체들이 이미 파이널라이즈되어 예측 불가능한 상태일 수 있기 때문이다. 이 제약이 배제하는 것이 상당히 많다. `false` 모드에서 여전히 할 수 있는 일은 다음 정도다.

- OS 리소스에 대한 **직접** 참조 해제 (예: Win32 API를 P/Invoke로 불러 얻은 핸들)
- 생성 시 만든 임시 파일 삭제

> **⚠️ `Dispose`는 예외를 던지면 안 된다**
>
> `Dispose`는 거의 항상 `finally` 블록 안에서 실행된다. `try` 블록이 이미 예외를 던지는 중일 때 `finally`의 `Dispose`가 새 예외를 던지면 **원래 예외가 사라진다**. 32.2절에서 본 "두 번째 예외" 문제 그대로다. 진짜 원인은 로그에서 지워지고, 정리 실패라는 부수적 증상만 남는다.
>
> 그래서 규약은 이렇다. **`Dispose`는 예외를 던지지 않는다.** 이미 폐기된 객체에서 `Dispose`를 불러도 `ObjectDisposedException`을 던지지 않는다 — 규칙 2가 규칙 1을 이긴다. `Dispose`는 "폐기 후 멤버 호출은 `ObjectDisposedException`"이라는 규칙의 유일한 예외다.
>
> 파이널라이저 경로(`disposing == false`)는 더 엄격하다. 파이널라이저에서 처리되지 않은 예외가 나면 **프로세스가 종료된다.** 잡을 방법도 없다. 예외를 던질 가능성이 있는 코드는 전부 `try`/`catch`로 감싸고, 잡은 예외는 최대한 단순하고 견고한 방법으로 기록해야 한다.

> **📌 `Dispose`는 스레드 안전하지 않아도 된다**
>
> 설계 지침은 `Dispose`가 스레드 안전할 필요가 없다고 명시한다. 근거는 이렇다. **코드는 다른 스레드가 그 객체를 쓰고 있지 않다고 확신할 때만 `Dispose`를 불러야 한다.** 그 확신이 없다면 애초에 `Dispose`를 부르면 안 된다.
>
> 물론 여러 스레드가 동시에 같은 객체의 `Dispose`를 부르는 것은 물리적으로 가능하다. 그 결과가 무엇이 될지는 그 타입의 구현에 달렸다 — 표준은 보장하지 않는다. 진짜로 여러 스레드가 공유하는 리소스라면 참조 카운팅(33.7절의 `SafeHandle`이 하는 방식)이나 명확한 소유권 모델이 필요하다.

> **💡 `IsDisposed` 속성을 공개하라**
>
> 폐기 여부를 나타내는 필드를 두는 것은 필수다. 그것을 **공개**할지는 선택이지만, 공개하면 소비자가 방어적 코드를 쓸 수 있다.
>
> ```csharp
> public bool IsDisposed { get; private set; }
> ```
>
> 자동 구현 속성 하나면 충분하다. BCL에도 선례가 있다 — `Component.IsDisposed`, `Control.IsDisposed`. 다만 이것을 "폐기됐으면 아무것도 안 함" 식의 방어 로직으로 남용하면 진짜 버그(수명 관리 오류)를 감추게 된다. 진단용으로 노출하되, 정상 흐름의 분기 조건으로 쓰지는 마라.

---

## 33.3 표준 Dispose 패턴 구현 (봉인 타입 / 상속 가능 타입)

### 봉인 타입 — 간단 패턴

단순한 시나리오에서 자기만의 폐기 가능 타입을 쓰는 것은 `IDisposable`을 구현하고 `Dispose` 메서드를 쓰는 것이 전부다.

```csharp
sealed class Demo : IDisposable
{
    readonly FileStream _log;
    bool _disposed;

    public Demo(string path) => _log = new FileStream(path, FileMode.Append);

    public void Write(string line)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);   // ※.NET 7
        // ...
    }

    public void Dispose()
    {
        if (_disposed) return;      // 멱등성
        _log.Dispose();             // 소유한 관리 리소스 정리
        _disposed = true;
    }
}
```

이 패턴이 성립하는 조건은 셋이다.

1. 타입이 **`sealed`** 다 — 파생 클래스가 정리 로직을 끼워 넣을 일이 없다.
2. **직접 비관리 리소스를 갖지 않는다** — 필드가 전부 관리 객체다. 그래서 파이널라이저가 필요 없다.
3. 소비자가 `Dispose`를 잊었을 때의 백업이 필요 없거나, 백업은 소유한 객체(`FileStream` → `SafeFileHandle`)가 알아서 한다.

세 조건 중 하나라도 깨지면 다음의 전체 패턴으로 가야 한다.

> **⚠️ `ObjectDisposedException.ThrowIf`는 .NET 7부터다**
>
> `ObjectDisposedException.ThrowIf(bool condition, object instance)`와 `ThrowIf(bool condition, Type type)`는 .NET 7에서 추가된 정적 헬퍼다. 그 이전 대상 프레임워크에서는 직접 써야 한다.
>
> ```csharp
> if (_disposed)
>     throw new ObjectDisposedException(nameof(Demo));
> ```
>
> `ObjectDisposedException` 생성자의 첫 인자는 **객체 이름**이지 메시지가 아니다. 메시지를 함께 주려면 `new ObjectDisposedException(nameof(Demo), "설명")` 두 인자 오버로드를 쓴다. 첫 인자에 문장을 넣으면 "Cannot access a disposed object. Object name: '설명'." 같은 우스운 메시지가 나온다.

### 상속 가능 타입 — 전체 패턴

`sealed`가 아닌 타입은 처음부터 전체 패턴을 따르는 편이 강하게 권장된다. 나중에 파생 타입이 자기 정리 로직을 추가하려 하면 매우 지저분해지기 때문이다.

전체 패턴의 역할 분담은 이렇다. **최상위 기반 클래스**가 할 일:

- 리소스를 해제하기 위해 `IDisposable`을 구현한다.
- **직접** 비관리 리소스를 가진 경우에 **한해서만** 방어 수단으로 파이널라이저를 추가한다.
- `Dispose`와 파이널라이저(있다면) 둘 다 실제 해제 작업을 **가상 메서드에 위임**한다. 파생 클래스가 그 가상 메서드를 재정의해서 자기 리소스를 관리한다.

**파생 클래스**가 할 일:

- 자기 리소스를 해제해야 할 때만 그 가상 메서드를 재정의한다.
- 직접 멤버 필드 중 하나가 비관리 리소스인 경우에 **한해서만** 파이널라이저를 구현한다.
- 반드시 **기반 클래스 버전을 호출**한다.

```csharp
public class MyResourceHog : IDisposable
{
    // 이미 폐기되었는지 판단하는 플래그
    private bool alreadyDisposed = false;

    // IDisposable 구현.
    // 가상 Dispose 메서드를 호출하고, 파이널라이제이션을 억제한다.
    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    // 가상 Dispose 메서드
    protected virtual void Dispose(bool isDisposing)
    {
        // 두 번 이상 폐기하지 않는다.
        if (alreadyDisposed)
            return;

        if (isDisposing)
        {
            // 여기서 관리 리소스를 해제한다.
        }

        // 여기서 비관리 리소스를 해제한다.

        // 폐기 플래그를 세운다.
        alreadyDisposed = true;
    }

    public void ExampleMethod()
    {
        if (alreadyDisposed)
            throw new ObjectDisposedException(
                nameof(MyResourceHog),
                "폐기된 객체에서 ExampleMethod를 호출했다");

        // 나머지 생략
    }
}
```

파생 클래스가 추가 정리를 해야 하면 `protected` `Dispose`를 재정의한다.

```csharp
public class DerivedResourceHog : MyResourceHog
{
    // 자기만의 폐기 플래그를 갖는다.
    private bool disposed = false;

    protected override void Dispose(bool isDisposing)
    {
        // 두 번 이상 폐기하지 않는다.
        if (disposed)
            return;

        if (isDisposing)
        {
            // 여기서 관리 리소스를 해제한다.
        }

        // 여기서 비관리 리소스를 해제한다.

        // 기반 클래스가 자기 리소스를 해제하게 한다.
        // GC.SuppressFinalize 호출은 기반 클래스 책임이다.
        base.Dispose(isDisposing);

        // 파생 클래스 폐기 플래그를 세운다.
        disposed = true;
    }
}
```

> **📌 플래그를 왜 클래스마다 따로 두는가**
>
> 기반 클래스와 파생 클래스가 **각각** 폐기 플래그를 갖는다. 중복처럼 보이지만 순전히 방어적 설계다. 플래그를 복제하면 폐기 과정에서 생길 수 있는 실수가 **그 한 타입 안에 갇힌다.** 객체를 구성하는 모든 타입으로 번지지 않는다.
>
> 기반 클래스의 플래그를 `protected`로 열어 파생 클래스와 공유하는 설계도 가능하지만, 그러면 파생 클래스가 기반 클래스보다 먼저 플래그를 세워 기반 클래스의 정리를 건너뛰는 사고가 가능해진다.

### `Dispose()` 메서드가 책임지는 네 가지

정리하면 `IDisposable.Dispose()` 구현이 책임지는 일은 넷이다.

1. 모든 **비관리 리소스** 해제
2. 모든 **관리 리소스** 해제 (이벤트 구독 해제 포함)
3. 객체가 폐기되었음을 나타내는 **상태 플래그 설정** — 이후 공개 멤버가 호출되면 `ObjectDisposedException`을 던지기 위해 이 상태를 검사해야 한다
4. **파이널라이제이션 억제** — `GC.SuppressFinalize(this)`

| `disposing` (= `isDisposing`) | 관리 리소스 | 비관리 리소스 | 다른 파이널라이즈 가능 객체 참조 |
|---|---|---|---|
| `true` (소비자가 `Dispose` 호출) | 해제한다 | 해제한다 | 안전하다 |
| `false` (파이널라이저에서 호출) | **건드리지 않는다** | 해제한다 | **금지** |

> **⚠️ `disposing == false`일 때 "관리 리소스를 건드리지 마라"의 진짜 이유**
>
> 흔한 오해: "GC가 이미 그 객체들의 메모리를 회수했으니까." **틀렸다.** 파이널라이저가 도는 시점에 그 객체들은 여전히 메모리에 있다. 파이널라이저 큐가 루트 역할을 하기 때문에 자기 자신도, 자기가 참조하는 객체도 살아 있다. 널 검사는 필요 없다.
>
> 진짜 이유는 **순서** 다. 파이널라이저의 실행 순서는 보장되지 않는다. 내가 참조하는 `FileStream`이 나보다 먼저 파이널라이즈되었을 수 있다. 메모리에는 있지만 핸들은 이미 닫혔다. 그런 객체의 메서드를 부르면 예외가 나고, 파이널라이저에서 나는 예외는 프로세스를 죽인다.
>
> 그래서 `false` 모드에서는 **관리 객체를 통하지 않는, 나 자신의 원시 핸들만** 정리해야 한다.

> **⚠️ 생성자가 실패해도 파이널라이저는 실행된다**
>
> CLR은 **생성 도중 예외가 던져져도** 그 객체의 파이널라이저를 부를 수 있다. 그래서 파이널라이저를 쓸 때는 필드가 올바르게 초기화되었다고 가정하면 안 된다.
>
> ```csharp
> sealed class Bad
> {
>     readonly IntPtr _handle;
>     readonly string _tempPath;
>
>     public Bad(string path)
>     {
>         _tempPath = path;
>         Validate(path);              // 여기서 예외가 나면
>         _handle = NativeOpen(path);  // _handle은 IntPtr.Zero인 채로
>     }
>
>     ~Bad()
>     {
>         // _handle이 IntPtr.Zero일 수 있다 — 검사 없이 닫으면 안 된다
>         if (_handle != IntPtr.Zero) NativeClose(_handle);
>     }
> }
> ```
>
> `SafeHandle`을 쓰면 이 문제를 신경 쓸 필요가 없다(33.7절).

### 컴파일 결과 — `~Type()`은 무엇이 되는가

`~MyClass() { ... }`를 컴파일하고 ildasm으로 열면 **`Finalize`라는 이름의 `protected override` 메서드**가 나온다. C# 컴파일러가 `System.Object.Finalize`의 재정의로 바꿔 놓은 것이다. 그리고 본문이 그대로 들어가는 것이 아니라, **`try` 블록 안에 본문이 들어가고 `finally` 블록에 `base.Finalize()` 호출이 들어간다.**

```il
.method family hidebysig virtual instance void
        Finalize() cil managed
{
  .override [System.Runtime]System.Object::Finalize
  // Code size       19 (0x13)
  .maxstack  1
  .try
  {
    IL_0000:  ldarg.0
    IL_0001:  ldc.i4.0
    IL_0002:  callvirt   instance void MyResourceWrapper::Dispose(bool)
    IL_0007:  leave.s    IL_0012
  }  // end .try
  finally
  {
    IL_0009:  ldarg.0
    IL_000a:  call       instance void [System.Runtime]System.Object::Finalize()
    IL_000f:  endfinally
  }  // end handler
  IL_0012:  ret
} // end of method MyResourceWrapper::Finalize
```

이 `try`/`finally`가 의미하는 바가 중요하다. **내 파이널라이저 본문이 예외를 던져도 기반 클래스의 파이널라이저는 실행된다.** 컴파일러가 자동으로 넣어 주는 안전장치다. 단, 그 예외 자체는 여전히 처리되지 않은 예외로 남아 프로세스를 종료시킨다.

또 하나. 파이널라이저에는 다음 제약이 있다.

- `public`이나 `static`으로 선언할 수 없다
- 매개변수를 가질 수 없다
- 기반 클래스 버전을 명시적으로 호출할 수 없다 (컴파일러가 자동으로 넣는다)
- 구조체에는 정의할 수 없다 — 구조체는 관리 힙에 놓이지 않으므로 GC가 파이널라이즈할 대상이 아니다

> **📌 `System.Object.Finalize`는 특별 취급된다**
>
> `System.Object`가 `protected virtual void Finalize()`를 정의하고 있지만, CLR은 이것을 **무시한다.** 타입 인스턴스를 만들 때 그 타입의 `Finalize` 메서드가 `Object`에서 상속받은 그것이라면, 객체를 파이널라이제이션 목록에 올리지 않는다. 즉 `Finalize`를 재정의하지 않은 타입은 파이널라이제이션 비용을 전혀 지불하지 않는다.
>
> 그래서 "모든 객체가 파이널라이저를 갖고 있으니 GC가 느리다"는 것은 오해다. 재정의한 타입만 비용을 낸다.

### `GC.SuppressFinalize`가 하는 일

```csharp
public void Dispose()
{
    Dispose(true);
    GC.SuppressFinalize(this);   // 파이널라이저가 실행되지 않게 한다
}
```

`GC.SuppressFinalize(this)`는 이 객체를 파이널라이제이션 대상 목록에서 제거한다. 이후 GC는 이 객체를 파이널라이저 큐에 넣지 않는다.

**엄밀히 말하면 불필요하다.** `Dispose` 메서드는 반복 호출을 견뎌야 하므로, 파이널라이저가 나중에 `Dispose(false)`를 불러도 아무 일도 일어나지 않는다. 그런데도 부르는 이유는 **성능**이다.

- 억제하지 않으면 객체가 파이널라이저 큐에 들어가 한 번의 컬렉션을 더 살아남는다 → 세대 승격
- 승격된 객체가 참조하는 객체들도 함께 승격된다
- 파이널라이저 스레드가 쓸데없는 일을 한다

억제하면 **객체와 그 객체가 참조하는 객체들이 단 한 번의 사이클에 회수될 수 있다.**

> **⚠️ 파생 클래스에서 `GC.SuppressFinalize`를 부르지 마라**
>
> 위 `DerivedResourceHog` 예제에서 파생 클래스는 `SuppressFinalize`를 부르지 않는다. 기반 클래스의 `Dispose()`가 이미 부르기 때문이다. 파생 클래스에서 또 부르면 중복이고, 더 나쁘게는 파생 클래스가 `Dispose(bool)`만 재정의하고 `Dispose()`는 재정의하지 않는 구조를 스스로 깨뜨린다.
>
> `Dispose()` (매개변수 없는 것)를 **가상으로 만들지 않는** 이유도 여기 있다. 소비자가 부르는 진입점은 하나여야 하고, 확장 지점은 `Dispose(bool)` 하나여야 한다.

### 파이널라이저를 넣을지 말지

`MyResourceHog`도 `DerivedResourceHog`도 **파이널라이저가 없다.** 예제 코드가 비관리 리소스를 직접 갖지 않기 때문이다. 그래서 `Dispose(false)`가 절대 호출되지 않는다. 그것이 올바른 패턴이다.

**클래스가 직접 비관리 리소스를 갖지 않는 한 파이널라이저를 구현하면 안 된다.** 직접 비관리 리소스를 가진 클래스만 파이널라이저를 넣고 그 오버헤드를 진다. 파이널라이저는 **호출되지 않더라도 존재만으로** 그 타입에 상당히 큰 성능 페널티를 부과한다.

그렇다고 패턴 자체를 생략하면 안 된다. 파생 클래스가 나중에 비관리 리소스를 추가할 수 있고, 그때 `Dispose(bool)`이 없으면 파생 클래스가 올바르게 처리할 방법이 없다. **파이널라이저가 필요 없어도 패턴은 올바르게 구현하라.**

| 상황 | `IDisposable` | `Dispose(bool)` | 파이널라이저 |
|---|---|---|---|
| `sealed`, 관리 필드만 | 구현 | 불필요 | 불필요 |
| `sealed`, 원시 `IntPtr` 핸들 보유 | 구현 | 있는 편이 낫다 | **필요** |
| 상속 가능, 관리 필드만 | 구현 | **필요** | 불필요 |
| 상속 가능, 원시 `IntPtr` 핸들 보유 | 구현 | **필요** | **필요** |
| 어떤 경우든 `SafeHandle`로 감쌌다 | 구현 | 상속 가능하면 필요 | **불필요** |

> **💡 마지막 행이 실무의 정답이다**
>
> 위 표의 마지막 행을 목표로 삼아라. 원시 핸들을 `SafeHandle` 파생 클래스로 감싸면 파이널라이저를 쓸 일이 사라진다. `SafeHandle` 자신이 (검증된, 올바른) 파이널라이저를 갖고 있기 때문이다. 33.7절에서 그 이유를 자세히 본다.
>
> 실무에서 파이널라이저를 직접 작성해야 하는 경우는 매우 드물다. 드문 경우조차 대개는 `SafeHandle`로 리팩터링할 수 있다.

### 정리 메서드에서는 리소스만 해제하라

Dispose·파이널라이제이션과 관련된 모든 메서드에 대한 가장 중요한 권고는 이것이다. **리소스 해제만 하라.** 정리 메서드에서 다른 처리를 하면 안 된다.

객체는 생성될 때 태어나고 GC가 회수할 때 죽는다. 프로그램이 더 이상 접근할 수 없게 되면 혼수상태라고 볼 수 있다. 접근할 수 없으면 메서드를 부를 수 없으니 사실상 죽은 것이다. 그런데 파이널라이저를 가진 객체는 죽음을 선고받기 전에 마지막 숨을 쉴 기회를 얻는다. 그 마지막 숨에서 다른 일을 하면 — 예를 들어 자기 참조를 어딘가에 저장하면 — 객체가 **부활**한다. 살아났지만 정상은 아닌 상태다.

부활은 34.4절에서 다룬다. 여기서 기억할 것은 하나다. **파이널라이저와 두 개의 `Dispose` 메서드 안에 리소스 해제 이외의 코드가 있으면 다시 봐라.** 그런 동작은 거의 확실히 미래의 버그를 만든다.

---

## 33.4 언제 Dispose 해야 하는가, 필드를 비워야 하는가

### 기본 규칙 — 의심스러우면 폐기하라

거의 모든 경우에 안전한 규칙은 **"의심스러우면 폐기하라(if in doubt, dispose)"** 다. 비관리 리소스 핸들을 감싸는 객체는 핸들을 해제하기 위해 거의 언제나 폐기가 필요하다. 파일·네트워크 스트림, 네트워크 소켓, Windows Forms 컨트롤, GDI+ 펜·브러시·비트맵이 그렇다.

반대로 어떤 타입이 폐기 가능하다면, 그 타입은 직접이든 간접이든 비관리 핸들을 참조하는 경우가 많다(항상은 아니다).

### 폐기하지 않아야 하는 세 가지 경우

그러나 폐기하지 **말아야** 할 세 가지 시나리오가 있다.

**1. 객체를 "소유"하지 않을 때.** 정적 필드나 정적 속성으로 공유 객체를 얻은 경우다.

이 범주는 드물다. 주요 사례는 `System.Drawing` 네임스페이스다. 정적 필드나 속성으로 얻는 GDI+ 객체(`Brushes.Blue` 같은 것)는 **절대 폐기하면 안 된다.** 애플리케이션 수명 내내 같은 인스턴스가 쓰이기 때문이다. 반면 생성자로 얻은 인스턴스(`new SolidBrush(...)`)나 정적 메서드로 얻은 인스턴스(`Font.FromHdc(...)`)는 폐기해야 한다.

```csharp
// 폐기하면 안 된다 — 프로세스 전체가 공유하는 인스턴스
Brush shared = Brushes.Blue;

// 폐기해야 한다 — 내가 만들었다
using var mine = new SolidBrush(Color.Blue);
```

**2. 객체의 `Dispose`가 내가 원치 않는 일을 할 때.** 이쪽이 훨씬 흔하다.

| 타입 | `Dispose`가 하는 일 | 폐기하면 안 되는 때 |
|---|---|---|
| `MemoryStream` | 이후 I/O를 막는다 | 나중에 스트림을 읽거나 써야 할 때 |
| `StreamReader`, `StreamWriter` | 리더/라이터를 플러시하고 **하부 스트림을 닫는다** | 하부 스트림을 열어 두고 싶을 때 (이 경우 `StreamWriter`는 다 쓴 뒤 `Flush`를 직접 불러야 한다) |
| `IDbConnection` | 데이터베이스 연결을 해제하고 연결 문자열을 지운다 | 다시 `Open`해야 한다면 — `Dispose` 대신 `Close`를 부른다 |
| `DbContext` (EF Core) | 이후 사용을 막는다 | 그 컨텍스트에 연결된 지연 평가 쿼리가 남아 있을 수 있을 때 |

`MemoryStream.Dispose`는 객체를 비활성화만 한다. 비관리 핸들도, 그와 유사한 리소스도 갖고 있지 않으므로 결정적인 정리 작업을 하지 않는다.

**3. 설계상 `Dispose`가 불필요하고, 폐기하면 프로그램이 복잡해질 때.** `StringReader`, `StringWriter` 같은 클래스가 여기 속한다. 이들이 폐기 가능한 것은 진짜로 필요해서가 아니라 **기반 클래스(`TextReader`/`TextWriter`)의 압박** 때문이다.

한 메서드 안에서 만들고 쓰고 끝난다면 `using`으로 감싸도 불편함이 거의 없다. 그러나 객체가 오래 살아남는다면, 더 이상 안 쓰는 시점을 추적해서 폐기하는 일이 불필요한 복잡성을 더한다. 그런 경우에는 그냥 폐기를 무시해도 된다.

> **⚠️ "무시해도 된다"에도 비용은 있다**
>
> 폐기를 무시하면 성능 비용이 발생할 수 있다. 파이널라이저를 가진 타입이라면 그 객체는 파이널라이저 큐를 거쳐 한 세대 더 살아남는다. 33.8절에서 이 비용을 구체적으로 본다.
>
> 그리고 "설계상 불필요"라는 판단은 **구현 세부사항에 의존하는 판단**이다. `StringWriter`가 미래에 무언가를 붙잡게 되면 그 판단이 무너진다. 확신이 없으면 폐기하는 쪽이 안전하다.

### 반대편의 조언 — 무분별한 명시적 `Dispose` 경계

여기서 균형을 잡아 둘 필요가 있다. "의심스러우면 폐기하라"는 소비 코드에 대한 조언인데, 이것을 **아무 데서나 `Dispose`를 부르라**는 뜻으로 오해하면 다른 종류의 버그가 생긴다.

GC는 잘 만들어져 있고, 객체가 애플리케이션 코드에서 더 이상 접근 불가능한 시점을 GC가 안다. 애플리케이션 코드가 `Dispose`를 부른다는 것은 **"나는 이 객체가 더 이상 필요 없다는 것을 안다"고 선언하는 것**이다. 많은 애플리케이션에서 그것을 확실히 아는 것은 불가능하다.

예를 들어 객체를 만들어 다른 메서드에 참조를 넘겼다고 하자. 그 메서드가 내부 필드(루트)에 참조를 저장했을 수 있다. 호출한 쪽은 그 사실을 알 방법이 없다. 호출한 쪽이 `Dispose`를 불러 버리면, 나중에 다른 코드가 그 객체에 접근하다가 `ObjectDisposedException`을 맞는다.

> **💡 두 조언을 화해시키는 기준: 소유권**
>
> 두 조언은 모순이 아니다. 기준은 **소유권**이다.
>
> - **내가 만들었고, 내 스코프 안에서만 살고, 밖으로 내보내지 않은 객체** → 반드시 `Dispose`. `using`으로 감싼다.
> - **내가 만들었지만 소유권을 넘긴 객체** (반환값, 다른 객체의 생성자 인자) → 받은 쪽이 책임진다. 넘기는 문서에 명시하라.
> - **남에게서 받은 객체** (매개변수, 정적 속성, DI 컨테이너) → 폐기하지 마라. 준 쪽이 책임진다.
>
> 특히 세 번째. 의존성 주입 컨테이너가 주입한 서비스는 컨테이너가 폐기한다. 주입받은 쪽이 폐기하면 다른 소비자가 폐기된 객체를 쓰게 된다.

### 폐기할 때 필드를 비워야 하는가

**일반적으로 `Dispose` 메서드에서 객체의 필드를 비울 필요는 없다.** 이유는 단순하다.

> **⚠️ `Dispose`는 (관리) 메모리를 해제하지 않는다**
>
> 이 오해가 놀랄 만큼 널리 퍼져 있다. `Dispose` 메서드 자체는 관리 메모리를 해제하지 **않는다.** 관리 힙의 메모리를 회수하는 유일한 방법은 가비지 컬렉션이다.
>
> 그래서 `Dispose` 안에서 `_buffer = null;` 같은 코드를 쓰는 것은 대개 의미가 없다. 객체 자체가 곧 도달 불가능해질 텐데, 그 필드를 비워 봐야 GC 입장에서는 달라지는 것이 없다. 폐기 직후에 객체가 도달 불가능해지기 때문이다.

그런데 예외가 있다. 필드를 비우거나 정리해야 하는 네 가지 경우다.

**예외 1 — 자기가 구독한 이벤트를 해지하라.** 이건 "좋은 관행"이 아니라 사실상 필수다.

```csharp
public sealed class Client : IDisposable
{
    readonly Host _host;
    public Client(Host host)
    {
        _host = host;
        _host.Click += HostClicked;    // 구독
    }

    void HostClicked(object? sender, EventArgs e) { /* ... */ }

    public void Dispose() => _host.Click -= HostClicked;   // 해지
}
```

이벤트 구독은 **게시자(`_host`)가 구독자(`this`)를 참조하게** 만든다. 방향이 직관과 반대다. 구독을 해지하지 않으면 `Client`가 살아 있을 이유가 전혀 없는데도 `Host`가 살아 있는 한 `Client`도 살아남는다. 이 관리 메모리 누수는 27.6절에서 다뤘다.

구독 해지의 효과는 둘이다. 원치 않는 이벤트 알림을 안 받게 되고, GC의 눈에 객체가 의도치 않게 살아 있는 것을 막는다.

**예외 2 — 자기 이벤트 핸들러를 비워라.** 기술적으로는 불필요하지만, 폐기 중이거나 폐기 후에 자기 이벤트가 발생할 가능성을 없앤다.

```csharp
public void Dispose()
{
    _timer.Dispose();
    ValueChanged = null;   // 자기 이벤트의 구독자 목록을 비운다
    _disposed = true;
}
```

**예외 3 — 고가치 비밀은 지워라.** 객체가 암호화 키 같은 고가치 비밀을 보유하고 있다면, 폐기 시 그 데이터를 필드에서 지우는 것이 타당하다. 메모리가 나중에 OS로 반환될 때 같은 머신의 다른 프로세스가 발견할 가능성을 없애기 위해서다.

`System.Security.Cryptography`의 `SymmetricAlgorithm` 클래스가 정확히 이 일을 한다 — 암호화 키를 담은 바이트 배열에 `Array.Clear`를 호출한다.

```csharp
public void Dispose()
{
    if (_key != null)
    {
        Array.Clear(_key, 0, _key.Length);   // 0으로 덮어쓴다
        _key = null;
    }
    _disposed = true;
}
```

**예외 4 — 오래 사는 객체가 큰 그래프를 붙잡고 있을 때.** 폐기된 객체 자체가 오래 살아남는다면(정적 캐시에 등록되었거나 다른 오래 사는 객체가 참조한다면), 그 객체가 붙잡은 큰 객체 그래프도 함께 살아남는다. 이 경우 필드를 `null`로 비우면 하위 그래프가 회수 가능해진다.

| 무엇을 | 비워야 하나 | 이유 |
|---|---|---|
| 일반 관리 필드 | 아니오 | 객체 자체가 곧 회수된다 |
| 내가 구독한 외부 이벤트 | **해지 필수** | 게시자가 나를 붙잡는다 |
| 내 이벤트의 구독자 목록 | 권장 | 폐기 후 이벤트 발생 방지 |
| 암호 키·토큰 등 비밀 | **필수** | 메모리 노출 방지 |
| 폐기 후에도 오래 사는 객체의 큰 필드 | 예 | 그래프 전체를 붙잡는다 |
| 비관리 핸들 (`IntPtr`) | **필수 — 무효값으로** | 이중 해제 방지 |

> **⚠️ 폐기된 객체를 계속 참조하는 코드**
>
> `Dispose()`는 객체를 메모리에서 제거하지 않는다. **비관리 리소스를 해제하는 훅일 뿐이다.** 그래서 여전히 사용 중인 객체를 폐기하면 곤란해진다.
>
> `SqlConnection`을 예로 들면, `Dispose()`는 데이터베이스 연결을 닫는다. 폐기 후에도 `SqlConnection` 객체는 메모리에 있지만 더 이상 데이터베이스에 연결되어 있지 않다. 메모리에 있으되 쓸모가 없다.
>
> **프로그램의 다른 곳에서 여전히 참조하고 있는 객체를 폐기하지 마라.** 이것이 앞의 "소유권" 기준이 중요한 이유다.

> **📌 `Dispose` 후 멤버 호출 — 무엇이 던져지는가**
>
> `FileStream`을 폐기한 뒤 `Write`를 부르면 `System.ObjectDisposedException`이 발생하고, 메시지는 "Cannot access a closed file."이다. 메모리 손상은 일어나지 않는다. `FileStream` 객체의 메모리는 여전히 관리 힙에 있고, 단지 메서드가 성공적으로 실행되지 못할 뿐이다.
>
> 다만 **모든 타입이 이 규약을 지키는 것은 아니다.** BCL 안에서도 일관되지 않다. 어떤 타입은 `ObjectDisposedException`을 던지고, 어떤 타입은 `InvalidOperationException`을 던지고, 어떤 타입은 조용히 아무 일도 안 한다. 자기 타입을 만들 때는 `ObjectDisposedException`을 던지는 쪽으로 통일하라.

---

## 33.5 익명 disposal과 `using` 문·`using` 선언 ※C# 8

### 문법 — `using` 문

`Dispose`를 직접 부르기로 했다면 반드시 `finally` 블록에 넣어야 한다. 그래야 정리 코드의 실행이 보장된다.

```csharp
FileStream fs = new FileStream("Temp.dat", FileMode.Create);
try
{
    fs.Write(bytesToWrite, 0, bytesToWrite.Length);
}
finally
{
    if (fs != null) fs.Dispose();
}
```

이건 옳은 코드지만 매번 쓰기에는 성가시다. C#의 `using` 문이 정확히 같은 코드를 만들어 준다.

```csharp
using (FileStream fs = new FileStream("Temp.dat", FileMode.Create))
{
    fs.Write(bytesToWrite, 0, bytesToWrite.Length);
}
```

`using` 문에서는 객체를 초기화해 변수에 저장하고, 중괄호 안에서 그 변수를 통해 객체에 접근한다.

C#의 `using` 문이 지원하는 형태는 셋이다.

```csharp
// 1. 선언 + 초기화
using (var fs = new FileStream(path, FileMode.Open)) { /* ... */ }

// 2. 같은 타입의 변수 여러 개 (쉼표 구분)
using (var rw = new MyResourceWrapper(), rw2 = new MyResourceWrapper()) { /* ... */ }

// 3. 이미 초기화된 변수 (또는 임의의 식)
var existing = GetStream();
using (existing) { /* ... */ }
```

2번에서 **변수들의 타입이 모두 같아야** 한다는 제약에 주의하라. 서로 다른 타입 두 개를 정리하려면 `using`을 중첩하거나 `using` 선언을 쓴다.

### 컴파일 결과 — `using` 문이 낮춰지는 형태

컴파일러는 `try`/`finally` 블록을 자동으로 방출한다. `finally` 블록 안에서 객체를 `IDisposable`로 캐스팅하고 `Dispose` 메서드를 호출하는 코드를 넣는다.

```il
.method private hidebysig static void  WriteTemp() cil managed
{
  .maxstack  4
  .locals init (class [System.Runtime]System.IO.FileStream V_0)
  IL_0000:  ldstr      "Temp.dat"
  IL_0005:  ldc.i4.2
  IL_0006:  newobj     instance void [System.Runtime]System.IO.FileStream::.ctor(string,
                                     valuetype [System.Runtime]System.IO.FileMode)
  IL_000b:  stloc.0
  .try
  {
    IL_000c:  ldloc.0
    // ... fs.Write(...) ...
    IL_0018:  leave.s    IL_0024
  }  // end .try
  finally
  {
    IL_001a:  ldloc.0
    IL_001b:  brfalse.s  IL_0023
    IL_001d:  ldloc.0
    IL_001e:  callvirt   instance void [System.Runtime]System.IDisposable::Dispose()
    IL_0023:  endfinally
  }  // end handler
  IL_0024:  ret
}
```

주목할 지점 셋.

- `brfalse.s`가 **널 검사**다. 리소스 식이 참조 타입일 때만 방출된다.
- 호출은 `callvirt ... IDisposable::Dispose()`다. 컴파일 시점 타입이 `FileStream`인데도 **인터페이스를 통해** 부른다.
- `.try` 블록이 리소스 획득 **다음**에 시작한다. 생성자가 예외를 던지면 `finally`에 들어가지 않는다 — 애초에 객체가 없으므로 정리할 것도 없다.

리소스의 정적 타입에 따라 낮춤 결과가 달라진다.

| 리소스의 컴파일 시점 타입 | 널 검사 | 호출 방식 | 박싱 |
|---|---|---|---|
| 참조 타입 (`FileStream`) | 있다 | `callvirt IDisposable::Dispose` | 없음 |
| 널 허용 참조 타입 | 있다 | 같음 | 없음 |
| 값 타입 (`struct : IDisposable`) | **없다** | `constrained.` 접두사 + `callvirt` | **없음** |
| `Nullable<T>` | 있다 (`HasValue`) | 값에 대해 호출 | 없음 |
| `ref struct` (패턴 기반) | 없다 | 직접 `call Dispose()` | 없음 |
| `dynamic` | 있다 | 런타임에 `IDisposable`로 변환 | 상황에 따라 |

값 타입 리소스에 `constrained.` 접두사가 붙는 것이 중요하다. 이 접두사가 있으면 값 타입의 `Dispose` 구현이 직접 호출되고 **박싱이 일어나지 않는다**(15.2절, 18.6절). `List<T>.Enumerator` 같은 구조체 열거자가 `foreach`에서 박싱 없이 정리되는 것이 이 메커니즘이다.

> **📌 `ref struct`와 패턴 기반 `using` ※C# 8**
>
> `ref struct`는 오랫동안 인터페이스를 구현할 수 없었다. 그래서 C# 8은 **패턴 기반 `using`** 을 도입했다. `ref struct`가 접근 가능한 `public void Dispose()` 인스턴스 메서드를 가지고 있으면, `IDisposable`을 구현하지 않아도 `using`이 동작한다.
>
> ```csharp
> ref struct Borrowed
> {
>     Span<byte> _buffer;
>     public void Dispose() { /* 버퍼 반납 */ }
> }
>
> using (var b = new Borrowed()) { /* ... */ }   // 컴파일된다
> ```
>
> ※C# 13에서 `ref struct`가 인터페이스를 구현할 수 있게 되었지만(`allows ref struct` 제약과 함께), `ref struct`를 인터페이스 타입으로 변환하는 것은 여전히 불가능하다. 따라서 `using`은 이 경우에도 패턴 기반 경로를 쓴다. `ref struct`의 기초는 16.6절에 있다.

> **⚠️ `using`은 컴파일 시점 타입만 본다**
>
> `using` 문은 **컴파일 시점 타입**이 `IDisposable`을 지원할 때만 동작한다. 임의의 객체에는 쓸 수 없다.
>
> ```csharp
> // 컴파일되지 않는다.
> // string은 sealed이고 IDisposable을 지원하지 않는다.
> using (string msg = "This is a message")
>     Console.WriteLine(msg);
>
> // 컴파일되지 않는다.
> // object는 IDisposable을 지원하지 않는다.
> using (object obj = Factory.CreateResource())
>     Console.WriteLine(obj.ToString());
> ```
>
> 런타임 타입이 `IDisposable`일 수도 있고 아닐 수도 있는 객체를 안전하게 폐기하려면 방어적인 `as` 절 하나면 된다.
>
> ```csharp
> object obj = Factory.CreateResource();
> using (obj as IDisposable)
>     Console.WriteLine(obj.ToString());
> ```
>
> `obj`가 `IDisposable`을 구현하면 `using`이 정리 코드를 만든다. 아니면 `using (null)`로 퇴화하는데, 이는 안전하며 아무 일도 하지 않는다. 이 관용구는 33.9절의 제네릭 처리에서 다시 등장한다.

### `using` 선언 ※C# 8

C# 8은 `using` 선언을 추가했다. `using` 키워드를 앞에 붙인 변수 선언이다. 중괄호로 표시한 명시적 블록이 없다는 점만 다르고 기능은 동일하다.

```csharp
static void UsingDeclaration()
{
    // 이 변수는 메서드 끝까지 스코프 안에 있다
    using var rw = new MyResourceWrapper();

    Console.WriteLine("곧 폐기된다.");

    // 이 지점에서 변수가 폐기된다
}
```

ILDASM으로 이 메서드를 열면 예상대로 앞과 **동일한 코드**가 나온다.

```il
.method private hidebysig static
  void  UsingDeclaration() cil managed
{
  .try
  {
    // ...
  }  // end .try
  finally
  {
    IL_0018: callvirt instance void
      [System.Runtime]System.IDisposable::Dispose()
    // ...
  }  // end handler
  IL_001f: ret
}
```

이 기능은 본질적으로 컴파일러 마법이고 타자를 몇 번 덜 치게 해 준다. 다만 **새 문법이 이전 문법만큼 명시적이지 않다**는 점을 조심해야 한다.

| | `using` 문 | `using` 선언 |
|---|---|---|
| 문법 | `using (var x = ...) { }` | `using var x = ...;` |
| 폐기 시점 | 블록의 `}` | **둘러싼 스코프의 끝** |
| 스코프 | 블록 안 | 선언 지점부터 스코프 끝까지 |
| 서로 다른 타입 여럿 | 중첩 필요 | 나란히 쓸 수 있다 |
| 폐기 순서 (여럿일 때) | 안쪽부터 | **선언 역순** |
| 임의의 식 사용 | 가능 (`using (expr)`) | 불가 — 변수 선언이어야 한다 |
| 조건부 폐기 | `if` 안에 블록 | 스코프를 만들어야 한다 |

`using` 선언 여러 개는 **선언의 역순**으로 폐기된다. 컴파일러가 중첩 `try`/`finally`를 만들기 때문이다.

```csharp
void Copy(string src, string dst)
{
    using var input  = File.OpenRead(src);      // 1번째 선언
    using var output = File.Create(dst);        // 2번째 선언
    input.CopyTo(output);
}   // output.Dispose() → input.Dispose() 순서
```

> **⚠️ `using` 선언의 제약**
>
> `using` 선언은 변수 선언이므로 몇 가지 제약이 따른다.
>
> - **`using` 변수에 재대입할 수 없다.** 사실상 `readonly`다. `using var s = A(); s = B();`는 컴파일 오류다.
> - **임베디드 문 위치에 놓을 수 없다.** `if (cond) using var x = ...;`는 안 된다. 블록을 만들어야 한다.
> - **`switch` 섹션 안에 직접 놓을 수 없다.** 중괄호로 블록을 만들어야 한다.
> - **`using` 문과 달리 임의의 식을 받지 못한다.** `using existingVariable;`은 안 된다.
>
> 마지막 제약 때문에 "이미 있는 변수를 스코프 끝에서 폐기"하려면 여전히 `using` 문을 써야 한다.

> **💡 언제 문을, 언제 선언을 쓰는가**
>
> **선언(`using var`)을 기본으로 삼아라.** 중첩이 줄어 코드가 평평해지고, 메서드가 짧으면 폐기 시점도 명확하다.
>
> **문(`using (...)`)으로 돌아가야 하는 경우:**
>
> - 리소스의 수명을 메서드보다 **짧게** 잡아야 할 때 (루프 안, 조건 분기 안)
> - 리소스를 만든 직후 그 스코프를 넘어서는 오래 걸리는 작업이 이어질 때 — `using var`로 열어 둔 파일 핸들을 메서드 끝까지 붙잡고 있게 된다
> - 이미 있는 변수나 식을 폐기할 때
> - 폐기 시점이 코드 리뷰의 핵심 쟁점일 때 — 명시적인 중괄호가 의도를 더 잘 전달한다
>
> 특히 두 번째. 다음 코드는 컴파일되지만 파일을 필요 이상으로 오래 잡는다.
>
> ```csharp
> async Task ProcessAsync(string path)
> {
>     using var fs = File.OpenRead(path);
>     var data = await ParseAsync(fs);
>     await UploadAsync(data);     // fs가 아직 열려 있다
>     await NotifyAsync();         // 여전히 열려 있다
> }
> ```

### 익명 disposal — 클래스를 쓰지 않고 `IDisposable` 구현하기

클래스를 새로 만들지 않고 `IDisposable`을 구현하고 싶을 때가 있다. 이벤트 처리를 일시 중단하고 재개하는 메서드를 노출한다고 하자.

```csharp
class Foo
{
    int _suspendCount;

    public void SuspendEvents() => _suspendCount++;
    public void ResumeEvents()  => _suspendCount--;

    void FireSomeEvent()
    {
        if (_suspendCount == 0)
        {
            // 이벤트 발생
        }
    }
}
```

이런 API는 쓰기 불편하다. 소비자가 `ResumeEvents` 호출을 기억해야 하고, 견고하려면 예외가 날 수 있으니 `finally` 블록에서 불러야 한다.

```csharp
var foo = new Foo();
foo.SuspendEvents();
try
{
    // 여기서 예외가 날 수 있으니...
}
finally
{
    // ...finally에서 불러야 한다
    foo.ResumeEvents();
}
```

더 나은 패턴은 `ResumeEvents`를 없애고 `SuspendEvents`가 `IDisposable`을 반환하게 하는 것이다. 그러면 소비자는 이렇게 쓴다.

```csharp
using (foo.SuspendEvents())
{
    // 작업
}
```

문제는 이 방식이 `SuspendEvents`를 구현하는 쪽에 일을 떠넘긴다는 점이다. 공백을 아무리 줄여도 다음 정도의 잡동사니가 남는다.

```csharp
public IDisposable SuspendEvents()
{
    _suspendCount++;
    return new SuspendToken(this);
}

class SuspendToken : IDisposable
{
    Foo _foo;

    public SuspendToken(Foo foo) => _foo = foo;

    public void Dispose()
    {
        if (_foo != null) _foo._suspendCount--;
        _foo = null;     // 소비자가 두 번 폐기하는 것에 대비
    }
}
```

익명 disposal 패턴이 이 문제를 해결한다. 다음의 재사용 가능한 클래스를 한 번만 만들어 두면 된다.

```csharp
public class Disposable : IDisposable
{
    public static Disposable Create(Action onDispose)
        => new Disposable(onDispose);

    Action _onDispose;
    Disposable(Action onDispose) => _onDispose = onDispose;

    public void Dispose()
    {
        _onDispose?.Invoke();   // null이 아니면 폐기 동작을 실행한다.
        _onDispose = null;      // 두 번째 실행을 막는다.
    }
}
```

그러면 `SuspendEvents`가 이렇게 줄어든다.

```csharp
public IDisposable SuspendEvents()
{
    _suspendCount++;
    return Disposable.Create(() => _suspendCount--);
}
```

`Dispose` 안의 두 줄이 각각 규칙을 하나씩 지킨다. `?.Invoke()`가 널 안전을 보장하고, `_onDispose = null`이 **멱등성**을 보장한다. 두 번째 `Dispose` 호출은 아무 일도 하지 않는다.

> **📌 익명 disposal은 이미 여러 곳에 있다**
>
> 이 관용구는 라이브러리마다 이름이 다를 뿐 널리 쓰인다.
>
> - Rx(Reactive Extensions)의 `System.Reactive.Disposables.Disposable.Create(Action)`
> - `ILogger.BeginScope(...)` — 반환된 `IDisposable`을 폐기하면 로깅 스코프가 닫힌다
> - `Activity`/`DiagnosticSource` 계열의 스코프 토큰
>
> 공통 구조는 같다. **"시작"은 메서드 호출, "끝"은 `Dispose`.** 시작과 끝이 짝을 이뤄야 하는 모든 것 — 잠금, 트랜잭션, 성능 측정 구간, 들여쓰기 수준, 리엔트런시 가드 — 에 적용할 수 있다.

> **⚠️ 익명 disposal이 클로저를 잡는다**
>
> `Disposable.Create(() => _suspendCount--)`는 람다를 만든다. 이 람다는 `this`를 캡처하므로 **클로저 객체가 힙에 할당된다.** 게다가 반환된 `Disposable` 인스턴스 자체도 힙 할당이다. 호출 하나에 최소 두 개의 객체가 생긴다.
>
> 초당 수만 번 도는 뜨거운 경로에서는 이 비용이 보인다. 그런 경우에는 앞의 `SuspendToken`처럼 명시적 타입을 쓰거나, `ref struct` + 패턴 기반 `using`으로 스택에만 놓는 방법을 쓴다.
>
> ```csharp
> public ref struct SuspendScope
> {
>     Foo _foo;
>     internal SuspendScope(Foo foo) { _foo = foo; foo._suspendCount++; }
>     public void Dispose() { _foo?._suspendCount--; _foo = null; }
> }
> ```
>
> 비싼 리소스를 클로저에 가두는 문제 전반은 79.12절에서 다룬다.

---

## 33.6 `IAsyncDisposable`과 `await using`

### 문제 — 동기 `Dispose`는 블로킹한다

`IDisposable`의 `Dispose` 메서드는 본질적으로 동기다. 그 메서드가 I/O를 수행해야 한다면 — 예를 들어 스트림을 플러시해야 한다면 — **블로킹**하고, 블로킹이 유발하는 모든 문제를 그대로 안는다.

이 시나리오는 흔하다.

- `StreamWriter.Dispose()`는 버퍼를 디스크에 플러시한다 → 디스크 I/O
- `SqlConnection.Dispose()`는 연결을 풀에 반납하며 서버와 대화할 수 있다 → 네트워크 I/O
- 메시지 큐 소비자의 `Dispose()`는 미확인 메시지를 반환한다 → 네트워크 I/O

비동기 코드 전체가 스레드를 놓아 주며 잘 돌아가다가, 마지막 `Dispose`에서 스레드 풀 스레드를 붙잡고 수 밀리초를 기다리는 것은 앞뒤가 안 맞는다. 최악의 경우 sync-over-async 데드락으로 이어진다(47.14절).

### 인터페이스

C# 8과 함께 도입된 `IAsyncDisposable`은 `IDisposable`의 비동기 버전이다.

```csharp
namespace System;

public interface IAsyncDisposable
{
    ValueTask DisposeAsync();
}
```

반환 타입이 `Task`가 아니라 **`ValueTask`** 인 점에 주의하라. 폐기는 실제로 비동기 작업이 필요 없는 경우(이미 플러시된 버퍼, 이미 닫힌 연결)가 매우 흔하고, 그럴 때 `Task` 객체를 할당하는 것은 낭비다. `ValueTask`는 동기적으로 완료될 때 할당을 피한다. `ValueTask`의 정확한 의미론과 제약은 47.13절에 있다.

`IAsyncDisposable`을 구현하는 타입이 `IDisposable`도 구현해야 한다는 요구사항은 **없다.** 다만 실제로는 둘 다 구현하는 타입이 많다.

BCL에서 이 인터페이스를 구현하는 대표적 타입:

| 타입 | 비동기 폐기가 하는 일 |
|---|---|
| `Stream` (및 파생) | 비동기로 버퍼를 플러시하고 하부 핸들을 닫는다 |
| `TextWriter` / `StreamWriter` | 비동기로 플러시 |
| `Utf8JsonWriter` | 비동기로 남은 출력을 쓴다 |
| `IAsyncEnumerator<T>` | 반복자 상태 기계의 `finally`를 비동기로 실행 |
| `DbConnection` (ADO.NET) | 연결을 비동기로 반납 |
| `ServiceProvider` (DI) | 등록된 비동기 폐기 가능 서비스를 폐기 |

`IAsyncEnumerator<T>`가 `IAsyncDisposable`을 상속한다는 사실이 중요하다.

```csharp
public interface IAsyncEnumerable<out T>
{
    IAsyncEnumerator<T> GetAsyncEnumerator(...);
}

public interface IAsyncEnumerator<out T> : IAsyncDisposable
{
    T Current { get; }
    ValueTask<bool> MoveNextAsync();
}
```

`await foreach`가 열거자를 자동으로 비동기 폐기하는 근거가 이것이다(28.9절).

### 문법 — `await using`

`using` 문과 `using` 선언 모두 `await` 접두사를 붙일 수 있다.

```csharp
// await using 문
await using (var conn = new SqlConnection(connString))
{
    await conn.OpenAsync();
    // ...
}

// await using 선언
await using var writer = new StreamWriter(path);
await writer.WriteLineAsync("hello");
```

`await using`은 `DisposeAsync()`를 호출하고 그 결과를 `await`한다.

### 컴파일 결과

`await using`이 낮춰지는 형태는 `using`과 거의 같고, `finally` 안이 `await`로 바뀐다.

```csharp
// 소스
await using (var r = new AsyncResource())
{
    await r.WorkAsync();
}

// 개념적으로 낮춰진 형태
var r = new AsyncResource();
try
{
    await r.WorkAsync();
}
finally
{
    if (r != null)
        await r.DisposeAsync();
}
```

여기서 컴파일러에 실제로 일어나는 일은 훨씬 복잡하다. `finally` 안에 `await`가 있으면 **상태 기계가 `finally` 블록을 넘나들 수 있어야** 하므로, 컴파일러는 `finally`를 상태 기계의 별도 상태로 분해하고 예외 상태를 별도 필드에 보관한다. 이 변환은 47.10절에서 다룬다.

> **⚠️ `using`과 `await using`은 서로 대체할 수 없다**
>
> 타입이 `IAsyncDisposable`만 구현하고 `IDisposable`은 구현하지 않으면, 그 타입에 **평범한 `using`을 쓰면 컴파일 오류**가 난다. 반대로 `IDisposable`만 구현한 타입에 `await using`을 쓰는 것도 컴파일 오류다.
>
> 둘 다 구현한 타입에 `using`을 쓰면 컴파일은 되지만 **동기 `Dispose`가 불린다.** 비동기 컨텍스트에서 이것은 대개 실수다. 조용히 블로킹하고, 컴파일러도 분석기 없이는 경고하지 않는다.
>
> 규칙: **비동기 메서드 안에서 `IAsyncDisposable`을 구현한 리소스를 쓸 때는 항상 `await using`을 써라.**

### `ConfigureAwait(false)`

`await using`이 만드는 `await`에도 동기화 컨텍스트 캡처 문제가 그대로 적용된다(47.12절). 라이브러리 코드에서는 컨텍스트를 캡처하지 않는 편이 옳은데, `await using` 문법에는 `.ConfigureAwait(false)`를 붙일 자리가 없어 보인다.

BCL이 이를 위한 확장 메서드를 제공한다. `System.Threading.Tasks.TaskAsyncEnumerableExtensions`의 다음 메서드가 `ConfiguredAsyncDisposable` 구조체를 반환한다.

```csharp
public static ConfiguredAsyncDisposable ConfigureAwait(
    this IAsyncDisposable source, bool continueOnCapturedContext);
```

사용법은 이렇다.

```csharp
var resource = new AsyncResource();
await using (resource.ConfigureAwait(false))
{
    await resource.WorkAsync().ConfigureAwait(false);
}
```

> **⚠️ `ConfigureAwait`가 반환하는 것은 리소스가 아니다**
>
> `await using var r = new AsyncResource().ConfigureAwait(false);` 라고 쓰면 `r`은 `AsyncResource`가 아니라 `ConfiguredAsyncDisposable` 구조체다. 리소스의 멤버에 접근할 수 없다.
>
> 그래서 위 예제처럼 **리소스 변수를 먼저 만들고, `ConfigureAwait` 결과를 `await using` 문의 식으로 넘기는** 두 줄 형태를 써야 한다. `await foreach`에도 같은 확장 메서드(`ConfigureAwait(this IAsyncEnumerable<T>, bool)`)가 있다.

### 동기·비동기를 둘 다 구현할 때

타입이 `IDisposable`과 `IAsyncDisposable`을 모두 구현해야 하는 경우가 많다. 소비자가 동기 컨텍스트에 있을 수도, 비동기 컨텍스트에 있을 수도 있기 때문이다. 이때 지켜야 할 규칙이 있다.

```csharp
public class Example : IDisposable, IAsyncDisposable
{
    private readonly FileStream _file;          // 관리 + IAsyncDisposable
    private bool _disposed;

    // ── 동기 경로 ──────────────────────────────────
    public void Dispose()
    {
        Dispose(disposing: true);
        GC.SuppressFinalize(this);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed) return;
        if (disposing)
        {
            _file.Dispose();       // 동기 폐기
        }
        // 비관리 리소스 해제
        _disposed = true;
    }

    // ── 비동기 경로 ────────────────────────────────
    public async ValueTask DisposeAsync()
    {
        await DisposeAsyncCore().ConfigureAwait(false);

        // 비관리 리소스만 정리한다 (관리 리소스는 위에서 이미 비동기로 정리했다)
        Dispose(disposing: false);

        GC.SuppressFinalize(this);
    }

    protected virtual async ValueTask DisposeAsyncCore()
    {
        if (_file is not null)
            await _file.DisposeAsync().ConfigureAwait(false);
    }
}
```

구조의 핵심은 이렇다.

| 메서드 | 가상 여부 | 하는 일 |
|---|---|---|
| `Dispose()` | 비가상 | `Dispose(true)` + `SuppressFinalize` |
| `Dispose(bool)` | **가상** | 동기 정리 로직 전부 |
| `DisposeAsync()` | 비가상 | `DisposeAsyncCore()` + `Dispose(false)` + `SuppressFinalize` |
| `DisposeAsyncCore()` | **가상** | 비동기 정리 로직 전부 |

`DisposeAsync()`가 `Dispose(disposing: false)`를 부르는 것이 처음 보면 이상하다. 이유는 이렇다. `DisposeAsyncCore()`가 이미 **관리 리소스를 비동기로** 정리했다. 따라서 `Dispose(bool)`에는 **비관리 리소스만** 정리하게 시켜야 하고, 그게 `disposing: false` 경로다. `disposing: true`로 부르면 관리 리소스를 두 번 정리하려 든다 — 멱등하다면 사고는 안 나지만 의미가 어긋난다.

> **⚠️ `DisposeAsync` 안에서 동기 블로킹 금지**
>
> `DisposeAsync()`를 다음처럼 구현하는 코드를 종종 본다.
>
> ```csharp
> // 하면 안 된다
> public ValueTask DisposeAsync()
> {
>     Dispose();                       // 안에서 블로킹 I/O를 한다
>     return ValueTask.CompletedTask;
> }
> ```
>
> `DisposeAsync`라는 이름을 달고 있으면서 실제로는 블로킹한다. 소비자는 `await using`을 썼으니 스레드를 놓아 줄 것이라 믿는다. 반대 방향은 더 나쁘다.
>
> ```csharp
> // 절대 하면 안 된다
> public void Dispose() => DisposeAsync().AsTask().GetAwaiter().GetResult();
> ```
>
> 전형적인 sync-over-async다. UI나 옛 ASP.NET의 동기화 컨텍스트에서 교착한다(47.14절).
>
> 두 경로는 **각각 독립적으로 올바르게** 구현해야 한다. 동기 경로는 동기 API로, 비동기 경로는 비동기 API로.

> **📌 `DisposeAsync`도 멱등해야 한다**
>
> `IDisposable`의 세 규칙은 `IAsyncDisposable`에도 그대로 적용된다. 특히 규칙 2(반복 호출 무해)가 중요하다. 게다가 조합이 늘어난다. `DisposeAsync()` 다음에 `Dispose()`를 부를 수도 있고, 그 반대도 가능하다. **네 가지 순서 조합 전부에서 아무 일도 일어나지 않아야 한다.** 위 코드의 `_disposed` 플래그가 그 역할을 한다.

> **💡 클래스를 `sealed`로 만들 수 있으면 훨씬 간단해진다**
>
> 위의 4메서드 구조는 상속 가능한 타입을 위한 것이다. `sealed`라면 이렇게 줄어든다.
>
> ```csharp
> public sealed class Simple : IDisposable, IAsyncDisposable
> {
>     readonly FileStream _file;
>     bool _disposed;
>
>     public void Dispose()
>     {
>         if (_disposed) return;
>         _file.Dispose();
>         _disposed = true;
>     }
>
>     public async ValueTask DisposeAsync()
>     {
>         if (_disposed) return;
>         await _file.DisposeAsync().ConfigureAwait(false);
>         _disposed = true;
>     }
> }
> ```
>
> `SuppressFinalize`도 `Dispose(bool)`도 필요 없다. 파이널라이저가 없고 파생 클래스가 없기 때문이다. **정리 로직을 가진 타입은 기본적으로 `sealed`로 시작하라.** 상속이 정말 필요해질 때 전체 패턴으로 승격시키면 된다.

---

## 33.7 `SafeHandle` — 파이널라이저보다 나은 선택

### 왜 파이널라이저를 직접 쓰면 안 되는가

파이널라이저에는 주의사항이 많고 신중하게 써야 한다. 구체적으로 다음과 같다.

- 파이널라이저는 메모리 할당과 컬렉션을 **느리게** 만든다 (GC가 어떤 파이널라이저가 실행되었는지 추적해야 한다).
- 파이널라이저는 객체와 그 객체가 참조하는 객체들의 **수명을 연장한다** (전부 다음 수거를 기다려야 한다).
- 여러 객체의 파이널라이저가 **어떤 순서로 호출될지 예측할 수 없다**.
- 객체의 파이널라이저가 **언제** 호출될지에 대한 통제권이 제한적이다.
- 파이널라이저 코드가 **블로킹하면 다른 객체를 파이널라이즈할 수 없다**.
- 애플리케이션이 깨끗하게 종료되지 않으면 파이널라이저가 **아예 건너뛰어질 수 있다**.

여기에 하나가 더 있다. **저메모리 상황에서 파이널라이저 자체를 JIT 컴파일할 메모리가 없을 수 있다.** 그러면 네이티브 리소스가 그대로 샌다. 파이널라이저가 다른 어셈블리의 타입을 참조하는데 CLR이 그 어셈블리를 찾지 못해도 마찬가지다.

그래서 권고는 이렇다. **`Object.Finalize`를 재정의하는 것을 피하고, 대신 프레임워크가 제공하는 헬퍼 클래스를 써라.** 헬퍼 클래스가 `Finalize`를 재정의하면서 CLR의 특별 취급을 받고, 파생 클래스가 그 특별 취급을 상속한다.

네이티브 리소스를 감싸는 관리 타입을 만든다면, 먼저 `System.Runtime.InteropServices.SafeHandle`에서 파생시켜야 한다.

### `SafeHandle`의 구조

```csharp
public abstract class SafeHandle : CriticalFinalizerObject, IDisposable {
    // 네이티브 리소스에 대한 핸들
    protected IntPtr handle;

    protected SafeHandle(IntPtr invalidHandleValue, Boolean ownsHandle) {
        this.handle = invalidHandleValue;
        // ownsHandle이 true면, 이 SafeHandle 파생 객체가 수거될 때
        // 네이티브 리소스가 닫힌다
    }

    protected void SetHandle(IntPtr handle) {
        this.handle = handle;
    }

    // Dispose를 불러 명시적으로 리소스를 해제할 수 있다
    // IDisposable 인터페이스의 Dispose 메서드다
    public void Dispose() { Dispose(true); }

    // 여기 보인 기본 Dispose 구현이 정확히 원하는 동작이다.
    // 이 메서드를 재정의하는 것은 강하게 권장되지 않는다.
    protected virtual void Dispose(Boolean disposing) {
        // 기본 구현은 disposing 인자를 무시한다.
        // 리소스가 이미 해제되었으면 반환
        // ownsHandle이 false면 반환
        // 이 리소스가 해제되었음을 나타내는 플래그를 세운다
        // 가상 ReleaseHandle 메서드를 호출한다
        // GC.SuppressFinalize(this)를 호출해 Finalize가 불리지 않게 한다
        // ReleaseHandle이 true를 반환했으면 반환
        // 여기까지 오면 ReleaseHandleFailed MDA를 발생시킨다
    }

    // 여기 보인 기본 Finalize 구현이 정확히 원하는 동작이다.
    // 이 메서드를 재정의하는 것은 매우 강하게 권장되지 않는다.
    ~SafeHandle() { Dispose(false); }

    // 파생 클래스가 이 메서드를 재정의해 리소스를 해제하는 코드를 구현한다
    protected abstract Boolean ReleaseHandle();

    public void SetHandleAsInvalid() {
        // 이 리소스가 해제되었음을 나타내는 플래그를 세운다
        // GC.SuppressFinalize(this)를 호출해 Finalize가 불리지 않게 한다
    }

    public Boolean IsClosed {
        get {
            // 리소스가 해제되었는지 나타내는 플래그를 반환한다
        }
    }

    public abstract Boolean IsInvalid {
        // 파생 클래스가 이 속성을 재정의한다.
        // 핸들 값이 리소스를 표현하지 않으면 true를 반환해야 한다
        // (보통 핸들이 0이거나 -1이라는 뜻이다)
        get;
    }

    // 이 세 메서드는 보안 및 참조 카운팅과 관련된다
    public void   DangerousAddRef(ref Boolean success) { /* ... */ }
    public IntPtr DangerousGetHandle() { /* ... */ }
    public void   DangerousRelease() { /* ... */ }
}
```

이 클래스가 이미 33.3절의 표준 Dispose 패턴을 **완전하고 올바르게** 구현하고 있다는 점에 주목하라. `Dispose()`, `protected virtual Dispose(bool)`, `~SafeHandle()`이 전부 있다. 파생 클래스가 할 일은 `ReleaseHandle()` 하나를 재정의하는 것뿐이다.

### `CriticalFinalizerObject`의 세 가지 특별 대우

`SafeHandle`이 `System.Runtime.ConstrainedExecution` 네임스페이스의 `CriticalFinalizerObject`에서 파생된다는 것이 첫 번째 관전 포인트다. CLR은 이 클래스와 그 파생 클래스를 매우 특별하게 취급한다.

**1. 파이널라이저를 미리 JIT 컴파일한다.**
`CriticalFinalizerObject` 파생 타입의 객체가 처음 생성될 때, CLR은 **상속 계층의 모든 `Finalize` 메서드를 즉시 JIT 컴파일**한다. 객체 생성 시점에 컴파일해 두면 그 객체가 가비지가 되었을 때 네이티브 리소스가 반드시 해제된다는 것이 보장된다.

이 사전 컴파일이 없으면 네이티브 리소스를 할당해서 쓰는 것까지는 되지만 해제할 수 없는 상황이 생길 수 있다. 저메모리 상황에서 CLR이 `Finalize` 메서드를 컴파일할 메모리를 못 찾을 수 있고, 그러면 실행 자체가 불가능해져 네이티브 리소스가 샌다.

**2. 임계 파이널라이저를 나중에 호출한다.**
CLR은 `CriticalFinalizerObject` 파생 타입의 `Finalize`를 **비(非)`CriticalFinalizerObject` 파생 타입의 `Finalize`를 모두 부른 다음에** 호출한다. 이 순서 덕분에, `Finalize` 메서드를 가진 관리 리소스 클래스가 자기 파이널라이저 안에서 `CriticalFinalizerObject` 파생 객체를 안전하게 쓸 수 있다.

예를 들어 `FileStream`의 파이널라이저는 메모리 버퍼의 데이터를 디스크로 플러시할 수 있다 — **디스크 파일이 아직 닫히지 않았다는 확신**을 갖고서. `FileStream`이 붙잡은 `SafeFileHandle`이 임계 파이널라이저이므로 나중에 파이널라이즈되기 때문이다.

**3. 호스트의 난폭한 종료에도 실행된다.** (**.NET Framework 전용**)
호스트 애플리케이션(SQL Server, ASP.NET 같은 것)이 AppDomain을 난폭하게 중단(rudely abort)해도 CLR은 `CriticalFinalizerObject` 파생 타입의 `Finalize`를 호출한다. 호스트가 그 안에서 도는 관리 코드를 더 이상 신뢰하지 않는 상황에서도 네이티브 리소스가 해제되도록 보장하는 장치다.

> **⚠️ 세 번째 보장은 .NET Framework 이야기다**
>
> 모던 .NET에는 **AppDomain이 없다.** AppDomain 난폭 중단이라는 개념 자체가 존재하지 않으므로 세 번째 보장은 적용 대상이 없다. 같은 맥락에서 제약 실행 영역(CER, Constrained Execution Region)과 `RuntimeHelpers.PrepareConstrainedRegions()`, `[ReliabilityContract]` 특성도 모던 .NET에서는 **사실상 아무 일도 하지 않는다.** 옛 코드에서 이들을 보면 .NET Framework 시절의 유물이라고 이해하면 된다.
>
> 앞의 두 보장(사전 JIT 컴파일, 파이널라이저 순서)은 모던 .NET에서도 유효하다. 그리고 `SafeHandle`을 쓰는 실무적 가치의 대부분은 그 두 가지와 뒤에 나올 참조 카운팅에 있다.

### 계층 구조와 구체 클래스

`SafeHandle`은 추상 클래스다. 파생 클래스가 `protected` 생성자를 호출하고 추상 메서드 `ReleaseHandle`과 추상 속성 `IsInvalid`의 get 접근자를 제공해야 한다.

대부분의 네이티브 리소스는 핸들로 조작된다(32비트 시스템에서는 32비트 값, 64비트 시스템에서는 64비트 값). 그래서 `SafeHandle`은 `handle`이라는 `protected IntPtr` 필드를 정의한다. Windows에서 대부분의 핸들은 값이 0이거나 -1이면 무효다. `Microsoft.Win32.SafeHandles` 네임스페이스는 이를 위한 헬퍼 클래스를 제공한다.

```csharp
public abstract class SafeHandleZeroOrMinusOneIsInvalid : SafeHandle {
    protected SafeHandleZeroOrMinusOneIsInvalid(Boolean ownsHandle)
        : base(IntPtr.Zero, ownsHandle) {
    }

    public override Boolean IsInvalid {
        get {
            if (base.handle == IntPtr.Zero) return true;
            if (base.handle == (IntPtr) (-1)) return true;
            return false;
        }
    }
}
```

이것도 추상 클래스다. 여기서 다시 파생해 `protected` 생성자와 추상 메서드 `ReleaseHandle`을 재정의해야 한다. 프레임워크가 제공하는 구체 클래스 몇 가지가 있는데, `SafeFileHandle`이 대표적이다.

```csharp
public sealed class SafeFileHandle : SafeHandleZeroOrMinusOneIsInvalid {
    public SafeFileHandle(IntPtr preexistingHandle, Boolean ownsHandle)
        : base(ownsHandle) {
        base.SetHandle(preexistingHandle);
    }

    protected override Boolean ReleaseHandle() {
        // 이 네이티브 리소스를 닫으라고 Windows에 알린다
        return Win32Native.CloseHandle(base.handle);
    }
}
```

`SafeWaitHandle`도 같은 방식으로 구현되어 있다. 구현이 비슷한데도 클래스를 나누는 이유는 **타입 안전성** 때문이다. 컴파일러가 대기 핸들을 기대하는 메서드에 파일 핸들을 넘기는 것을 막는다. `SafeRegistryHandle`의 `ReleaseHandle`은 Win32의 `RegCloseKey` 함수를 호출한다.

```text
                  System.Object
                        │
          System.Runtime.ConstrainedExecution
                 .CriticalFinalizerObject
                        │
      System.Runtime.InteropServices.SafeHandle   ── IDisposable
                        │
        ┌───────────────┴───────────────────┐
        ▼                                   ▼
 SafeHandleZeroOrMinusOne          SafeHandleMinusOne
      IsInvalid                       IsInvalid
        │
   ┌────┼─────────────┬──────────────────┐
   ▼    ▼             ▼                  ▼
SafeFile  SafeWait  SafeRegistry  SafeMemoryMappedView
 Handle    Handle      Handle           Handle
```

> **📌 `CriticalHandle`도 있다**
>
> `System.Runtime.InteropServices`는 `CriticalHandle` 클래스도 정의한다. 이 클래스는 **참조 카운팅 기능을 제공하지 않는다**는 점만 빼면 모든 면에서 `SafeHandle`과 똑같이 동작한다. `CriticalHandle`과 그 파생 클래스는 카운터 조작이 없으므로 **보안을 희생해 성능을 얻는다.**
>
> `SafeHandle`과 마찬가지로 파생 타입이 둘 있다. `CriticalHandleMinusOneIsInvalid`와 `CriticalHandleZeroOrMinusOneIsInvalid`다. 마이크로소프트는 빠른 시스템보다 안전한 시스템을 선호하므로 클래스 라이브러리에는 이 둘에서 파생된 타입이 하나도 없다. **성능이 문제가 되고 보안을 낮출 근거가 있을 때만** `CriticalHandle` 계열을 써라.

### 능력 1 — P/Invoke 반환값의 경쟁 조건 제거

`SafeHandle` 파생 클래스는 GC가 일어날 때 네이티브 리소스가 해제되는 것을 보장한다는 점에서 매우 유용하다. 여기에 더해 두 가지 능력이 더 있다.

첫째, CLR은 네이티브 코드와 상호 운용하는 시나리오에서 `SafeHandle` 파생 타입에 특별 대우를 한다.

```csharp
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

internal static class SomeType {
    [DllImport("Kernel32", CharSet=CharSet.Unicode, EntryPoint="CreateEvent")]
    // 이 프로토타입은 견고하지 않다
    private static extern IntPtr CreateEventBad(
        IntPtr pSecurityAttributes, Boolean manualReset, Boolean initialState, String name);

    // 이 프로토타입은 견고하다
    [DllImport("Kernel32", CharSet=CharSet.Unicode, EntryPoint="CreateEvent")]
    private static extern SafeWaitHandle CreateEventGood(
        IntPtr pSecurityAttributes, Boolean manualReset, Boolean initialState, String name);

    public static void SomeMethod() {
        IntPtr         handle = CreateEventBad(IntPtr.Zero, false, false, null);
        SafeWaitHandle swh    = CreateEventGood(IntPtr.Zero, false, false, null);
    }
}
```

`CreateEventBad`는 `IntPtr`를 반환하도록 선언되어 있어 핸들이 관리 코드로 돌아온다. 그런데 이런 식의 상호 운용은 견고하지 않다. `CreateEventBad`가 호출되어 **네이티브 이벤트 리소스가 만들어진 뒤, 핸들이 `handle` 변수에 대입되기 전에** 스레드 중단 예외가 던져질 수 있다. 드물지만 이런 일이 벌어지면 관리 코드가 네이티브 리소스를 샌다. 그 이벤트를 닫을 유일한 방법은 프로세스 전체를 종료하는 것이다.

`SafeHandle` 클래스가 이 잠재적 리소스 누수를 고친다. `CreateEventGood`는 `IntPtr` 대신 `SafeWaitHandle`을 반환하도록 선언되어 있다. `CreateEventGood`가 호출되면 CLR이 Win32 `CreateEvent` 함수를 부른다. `CreateEvent`가 관리 코드로 반환될 때, CLR은 `SafeWaitHandle`이 `SafeHandle`에서 파생되었음을 알고 **관리 힙에 `SafeWaitHandle` 인스턴스를 자동으로 만들면서 `CreateEvent`가 반환한 핸들 값을 넘긴다.** `SafeWaitHandle` 객체의 생성과 핸들 대입이 **네이티브 코드에서** 일어나므로 스레드 중단 예외가 끼어들 수 없다. 이제 관리 코드가 이 네이티브 리소스를 새게 하는 것은 불가능하다.

> **📌 소스 생성 P/Invoke에서도 마찬가지다**
>
> ※.NET 7의 `[LibraryImport]` 소스 생성 P/Invoke(60.9절)도 `SafeHandle` 마샬링을 지원한다. 반환 타입이나 매개변수 타입으로 `SafeHandle` 파생 타입을 쓰면 생성된 마샬링 코드가 같은 보장을 제공한다.
>
> 다만 `[LibraryImport]`는 `[DllImport]`보다 요구 조건이 엄격하다. `SafeHandle` 파생 타입이 반환 위치에 쓰이려면 **매개변수 없는 public 또는 protected 생성자**가 필요하다. 이 조건을 만족하지 않으면 컴파일 시점에 진단이 나온다.

### 능력 2 — 참조 카운팅과 핸들 재활용 공격 방지

`SafeHandle` 파생 클래스의 마지막 기능은 **보안 취약점 악용을 막는 것**이다.

문제 상황은 이렇다. 한 스레드가 네이티브 리소스를 쓰려는 동안 다른 스레드가 그 리소스를 해제하려 한다. 이것이 **핸들 재활용(handle recycling) 공격**으로 발현될 수 있다. 스레드 A가 핸들 `0x1C4`를 쓰는 중에 스레드 B가 그것을 닫는다. OS는 다음 `CreateFile` 호출에 같은 값 `0x1C4`를 재사용할 수 있다. 그러면 스레드 A는 자기가 의도한 파일이 아니라 **다른 파일**에 쓰게 된다. 이것이 권한 상승 취약점이 된다.

`SafeHandle` 클래스는 **참조 카운팅**으로 이 보안 취약점을 막는다. 내부적으로 `SafeHandle`은 카운트를 유지하는 private 필드를 정의한다. `SafeHandle` 파생 객체가 유효한 핸들로 설정되면 카운트가 1이 된다. `SafeHandle` 파생 객체가 네이티브 메서드의 인자로 넘겨질 때마다 CLR이 **자동으로 카운터를 증가**시킨다. 마찬가지로 네이티브 메서드가 관리 코드로 반환될 때 CLR이 **카운터를 감소**시킨다.

```csharp
[DllImport("Kernel32", ExactSpelling=true)]
private static extern Boolean SetEvent(SafeWaitHandle swh);
```

`SafeWaitHandle` 객체 참조를 넘겨 이 메서드를 호출하면, CLR이 호출 직전에 카운터를 증가시키고 호출 직후에 감소시킨다. 물론 카운터 조작은 스레드 안전하게 수행된다.

이것이 보안을 어떻게 개선하는가? 다른 스레드가 그 `SafeHandle` 객체가 감싼 네이티브 리소스를 해제하려 하면, **CLR은 리소스가 네이티브 함수에서 사용 중이므로 실제로 해제할 수 없다는 것을 안다.** 네이티브 함수가 반환하면 카운터가 0으로 감소하고, 그때 리소스가 해제된다.

핸들을 `IntPtr`로 직접 조작하는 코드를 쓰거나 호출한다면 `SafeHandle` 객체에서 핸들을 꺼낼 수 있지만, **참조 카운팅을 명시적으로 조작해야 한다.** `DangerousAddRef`와 `DangerousRelease` 메서드로 하고, 원시 핸들은 `DangerousGetHandle`로 얻는다.

```csharp
bool added = false;
try
{
    handle.DangerousAddRef(ref added);      // 반드시 try 밖에서 false로 초기화
    IntPtr raw = handle.DangerousGetHandle();
    NativeCall(raw);
}
finally
{
    if (added) handle.DangerousRelease();
}
```

> **⚠️ `Dangerous`라는 접두사는 경고다**
>
> `DangerousAddRef` / `DangerousGetHandle` / `DangerousRelease`가 위험한 이유는 **핸들의 수명 보장을 프로그래머가 직접 지게 되기 때문**이다. `DangerousAddRef` 없이 `DangerousGetHandle`만 부르고 그 `IntPtr`를 저장하면, `SafeHandle`이 폐기되는 순간 그 `IntPtr`는 무효값이 된다 — 또는 더 나쁘게, 다른 리소스의 핸들이 된다.
>
> `DangerousAddRef(ref bool success)`의 `success` 매개변수 패턴에도 주의하라. 이 메서드는 카운터 증가에 성공했는지를 `ref` 인자로 알려 준다. **`success` 변수를 `try` 블록 밖에서 `false`로 초기화하고, `finally`에서 `success`가 `true`일 때만 `DangerousRelease`를 불러야** 한다. 그렇지 않으면 카운터가 어긋나 이중 해제나 영구 누수가 생긴다.

### `SafeHandle` vs 직접 작성한 파이널라이저

| 항목 | 직접 작성한 파이널라이저 | `SafeHandle` 파생 클래스 |
|---|---|---|
| 저메모리 상황 보장 | 없음 (JIT 실패 가능) | **있다** (생성 시 사전 컴파일) |
| 파이널라이저 실행 순서 | 무보장 | **비임계 파이널라이저 이후** |
| P/Invoke 반환값 경쟁 조건 | 취약 | **차단** |
| 핸들 재활용 공격 | 취약 | **참조 카운팅으로 차단** |
| 코드량 | 패턴 전체를 직접 구현 | `ReleaseHandle()` 하나 |
| 이중 해제 방지 | 직접 구현 | 내장 |
| 성능 | 파이널라이저 비용 그대로 | 같은 비용이지만 감싸는 클래스는 면제 |

마지막 행이 중요하다. `SafeHandle`을 쓰면 **`SafeHandle` 인스턴스만** 파이널라이제이션 비용을 낸다. `FileStream`처럼 그것을 감싸는 클래스는 파이널라이저를 가질 필요가 없어지고, 그래서 세대 승격을 피한다. 파이널라이저 비용을 **가장 작은 객체 하나**로 격리하는 것이 이 설계의 핵심 아이디어다.

> **💡 실무 결론**
>
> - 네이티브 핸들을 직접 다룬다면 `SafeHandleZeroOrMinusOneIsInvalid`에서 파생시켜 `ReleaseHandle()`만 구현하라.
> - P/Invoke 시그니처에서 핸들은 `IntPtr`가 아니라 `SafeHandle` 파생 타입으로 선언하라.
> - `SafeHandle`을 필드로 가진 감싸는 클래스는 `IDisposable`만 구현하고 **파이널라이저는 넣지 마라**.
> - 그 결과: 이 장 전체에서 파이널라이저를 직접 쓰는 코드는 한 줄도 필요 없다.

---

## 33.8 `Dispose`를 부르지 않았을 때 실제로 벌어지는 일

### 시나리오 하나 — 열린 파일을 지우려 할 때

임시 파일을 만들고 바이트를 쓰고 지우는 코드를 쓴다고 하자.

```csharp
using System;
using System.IO;

public static class Program {
    public static void Main() {
        Byte[] bytesToWrite = new Byte[] { 1, 2, 3, 4, 5 };

        FileStream fs = new FileStream("Temp.dat", FileMode.Create);
        fs.Write(bytesToWrite, 0, bytesToWrite.Length);

        File.Delete("Temp.dat");   // IOException을 던진다
    }
}
```

빌드해서 실행하면 동작할 수도 있지만 대개는 실패한다. `File.Delete` 정적 메서드가 **아직 열려 있는 파일**을 지우라고 Windows에 요청하기 때문이다. `Delete`는 `System.IO.IOException`을 던지고 메시지는 다음과 같다.

```text
The process cannot access the file "Temp.dat" because it is being used by another process.
```

`fs.Dispose()`를 `File.Delete` 앞에 넣으면 항상 동작한다. Windows가 파일이 열려 있지 않음을 보고 성공적으로 삭제한다.

> **⚠️ 이 예제의 실패는 플랫폼에 따라 달라진다**
>
> 위 코드는 **Windows에서** 실패한다. Windows의 기본 파일 공유 의미론이 열린 파일의 삭제를 막기 때문이다.
>
> **Linux와 macOS에서는 다르다.** POSIX 의미론에서는 열려 있는 파일도 `unlink`할 수 있다. 디렉터리 엔트리가 사라지고, 마지막 파일 디스크립터가 닫힐 때 실제로 데이터가 회수된다. 즉 위 코드가 Linux에서는 예외 없이 통과한다.
>
> 이 차이가 크로스 플랫폼 코드에서 **Windows에서만 터지는 버그**를 만든다. CI가 Linux 컨테이너에서 돌면 통과하고, 개발자 Windows 머신에서 실패한다. 경로·파일 시스템의 크로스 플랫폼 함정 전반은 40.12절에서 다룬다.

> **📌 아주 드물게 성공하기도 한다**
>
> 만약 `Write` 호출 후 `Delete` 호출 전에 다른 스레드가 어떤 이유로든 가비지 컬렉션을 촉발했다면, `FileStream`의 `SafeFileHandle` 필드가 `Finalize`될 것이고, 그러면 파일이 닫혀 `Delete`가 성공한다. 이런 상황이 벌어질 가능성은 극히 낮으므로 위 코드는 99% 이상 실패한다.
>
> **1% 확률로 성공하는 버그**가 100% 실패하는 버그보다 훨씬 나쁘다. 재현이 안 되기 때문이다.

### 파이널라이저가 있을 때 — 늦게라도 정리되지만

`FileStream`처럼 (`SafeHandle`을 통해) 파이널라이저를 가진 타입은 결국 정리된다. **`Dispose`를 부르는 것이 네이티브 리소스 정리를 보장하기 위해 필요한 것은 아니다.** 네이티브 리소스 정리는 언젠가는 반드시 일어난다. `Dispose`를 부르는 것은 **그 정리가 언제 일어날지를 통제**하는 일이다.

문제는 "언젠가"의 비용이다.

```text
 시간 ──────────────────────────────────────────────────────────────►

 [1] 객체 생성 (Gen 0)
      │
      │  ... 사용 ...
      │
 [2] 마지막 참조 소멸 = 가비지가 됨
      │
      │   ◄── Dispose를 불렀다면 이 지점에서 핸들이 반납된다
      │
      │  ... 관리 힙에 압력이 쌓일 때까지 대기 (나노초 ~ 며칠) ...
      │
 [3] Gen 0 GC 발생
      │   → 파이널라이저가 있으므로 수거되지 않음
      │   → F-reachable 큐로 이동, Gen 1으로 승격
      │   → 이 객체가 참조하는 객체들도 함께 승격
      │
 [4] 파이널라이저 스레드가 큐에서 꺼내 Finalize 실행
      │   → 이 시점에 비로소 핸들이 반납된다
      │
      │  ... Gen 1 GC를 기다림 ...
      │
 [5] Gen 1 GC 발생 → 메모리 회수
          (그 사이 Gen 2로 또 승격되었을 수도 있다)
```

정리하면 이렇다.

- 핸들이 반납되는 시점이 [2]에서 [4]로 밀린다. 그 사이 간격은 **나노초에서 며칠까지** 걸칠 수 있다.
- 객체가 최소 한 세대 승격된다. 파이널라이저를 가진 객체는 파이널라이저가 없는 객체보다 **훨씬 오래** 메모리에 머문다.
- **그 객체가 필드로 참조하는 모든 객체도 함께 승격된다.** 파이널라이즈 가능한 객체에 참조 타입 필드를 많이 두지 말아야 하는 이유가 이것이다.
- 파이널라이저 스레드는 하나다(향후 늘어날 수 있다는 여지는 남아 있다). 파이널라이즈할 객체가 밀리면 큐가 쌓인다.

파이널라이저의 동작 순서·F-reachable 큐의 구조·파이널라이저 스레드의 정확한 동작은 34.2절에서 다룬다.

### 파이널라이저가 없을 때 — 조용한 데이터 손실

더 나쁜 경우가 있다. **파이널라이저조차 없는 타입**이다.

`FileStream`은 성능을 위해 메모리 버퍼를 쓴다. 버퍼가 찰 때만 내용을 파일로 플러시한다. `FileStream`은 바이트 쓰기만 지원하므로, 문자와 문자열을 쓰려면 `StreamWriter`를 쓴다.

```csharp
FileStream fs = new FileStream("DataFile.dat", FileMode.Create);
StreamWriter sw = new StreamWriter(fs);
sw.Write("Hi there");

// 다음의 Dispose 호출이 마땅히 해야 할 일이다.
sw.Dispose();
// 참고: StreamWriter.Dispose가 FileStream을 닫는다.
// FileStream을 명시적으로 닫을 필요가 없다.
```

`StreamWriter`에 쓰면 데이터는 `StreamWriter` 자신의 메모리 버퍼에 쌓인다. 버퍼가 차면 `Stream`에 쓴다. `Dispose`를 부르면 `StreamWriter`가 데이터를 `Stream`으로 플러시하고 `Stream`을 닫는다.

여기서 `Dispose`를 명시적으로 부르는 코드가 없다면 어떻게 될까? 언젠가 GC가 두 객체를 가비지로 판정하고 파이널라이즈할 것이다. **그런데 GC는 파이널라이즈 순서를 보장하지 않는다.** `FileStream`이 먼저 파이널라이즈되면 파일이 닫힌다. 그다음 `StreamWriter`가 파이널라이즈되면서 이미 닫힌 파일에 데이터를 쓰려다 예외를 던진다.

마이크로소프트의 해법은 이랬다. **`StreamWriter` 타입은 파이널라이제이션을 지원하지 않는다.** 따라서 버퍼의 데이터를 하부 `FileStream`으로 플러시하는 일이 절대 일어나지 않는다. `StreamWriter` 객체에 `Dispose`를 부르는 것을 잊으면 **데이터는 반드시 손실된다.**

마이크로소프트는 개발자가 이 일관된 데이터 손실을 보고 명시적 `Dispose` 호출을 넣어 코드를 고칠 것으로 기대했다.

> **⚠️ "일관되게 실패"가 설계 의도다**
>
> `StreamWriter`가 파이널라이저를 갖지 않는 것은 버그가 아니라 **의도적 설계**다. 가끔 성공하고 가끔 실패하는 것보다, 항상 실패해서 개발자가 즉시 알아차리는 편이 낫다는 판단이다.
>
> 같은 이유로 `StreamWriter`를 `using` 없이 쓰는 코드는 로컬 테스트에서 종종 "동작하는 것처럼" 보인다. 짧은 문자열은 버퍼에만 남고, 프로세스가 종료되면서 버퍼는 그냥 사라진다. 파일은 만들어져 있는데 **크기가 0바이트**다.

> **📌 MDA는 .NET Framework 기능이다**
>
> .NET Framework은 관리 디버깅 도우미(MDA, Managed Debugging Assistant)라는 기능을 제공했다. MDA를 켜면 프레임워크가 흔한 프로그래머 실수를 감지해 대응하는 MDA를 발생시킨다. 디버거에서는 예외가 던져진 것처럼 보인다. `StreamWriter` 객체가 명시적으로 폐기되지 않은 채 가비지 컬렉션되는 것을 감지하는 `StreamWriterBufferedDataLost` MDA가 있었다.
>
> **모던 .NET에는 MDA가 없다.** 대신 코드 분석기(CA2000: "Dispose objects before losing scope")와 `dotnet-counters`의 파이널라이제이션 카운터, 그리고 33.8절 끝의 진단 기법을 쓴다.

### 세 가지 대표 고갈 시나리오

`Dispose`를 빠뜨렸을 때 프로덕션에서 실제로 터지는 증상은 대개 셋 중 하나다.

**1. 핸들 고갈.** 파일 디스크립터, 소켓 핸들, 커널 객체 핸들이 프로세스 한도에 도달한다.

Linux/macOS에서 프로세스당 열 수 있는 파일 디스크립터 수는 `ulimit -n`으로 정해진다. 배포판과 컨테이너 설정에 따라 다르지만 기본값이 1024인 경우가 흔하다. 이 한도에 도달하면 `IOException`이나 `SocketException`이 발생한다. Windows에서는 핸들 한도가 훨씬 크지만 무한하지 않고, GDI 객체는 별도의 훨씬 작은 한도를 갖는다.

```bash
# Linux — 프로세스가 연 파일 디스크립터 수 확인
ls /proc/$(pgrep -f MyApp)/fd | wc -l
ulimit -n

# .NET 카운터로 관찰
dotnet-counters monitor --process-id <pid> System.Runtime
```

**2. 파일 잠금.** Windows에서 열린 파일은 다른 프로세스가 지우거나 이름을 바꿀 수 없다. 배포 스크립트가 "파일이 사용 중"이라며 실패하는 전형적인 원인이다.

**3. 커넥션 풀 고갈.** 가장 흔하고 가장 오래 헤매게 만드는 시나리오다.

```csharp
// 이 메서드를 반복 호출하면 풀이 고갈된다
public void ExecuteCommand(string connString, string commandString)
{
    SqlConnection myConnection = new SqlConnection(connString);
    var mySqlCommand = new SqlCommand(commandString, myConnection);
    myConnection.Open();
    mySqlCommand.ExecuteNonQuery();
    // Dispose 없음 — 연결이 풀로 반납되지 않는다
}
```

ADO.NET은 연결을 풀링한다. `SqlConnection.Dispose()`(또는 `Close()`)가 실제 TCP 연결을 끊는 것이 아니라 **풀에 반납**한다. 반납하지 않으면 풀의 연결이 하나씩 사라진다. 최대 풀 크기(SqlClient 기준 기본값 100)에 도달하면 다음 `Open()` 호출이 대기하다가 타임아웃한다.

이때 나오는 예외는 대개 다음과 같은 메시지의 `InvalidOperationException`이다.

```text
Timeout expired. The timeout period elapsed prior to obtaining a connection
from the pool. This may have occurred because all pooled connections were in
use and max pool size was reached.
```

**메시지가 데이터베이스 성능 문제처럼 보인다는 것**이 이 버그의 악질적인 점이다. DBA에게 문의하고 인덱스를 뒤지다가, 결국 `using` 하나가 빠진 것을 찾는다.

| 증상 | 실제 원인 | 진단 방법 |
|---|---|---|
| `IOException` "used by another process" (Windows) | 스트림 미폐기 | Handle.exe / Process Explorer로 핸들 소유자 확인 |
| `IOException` "Too many open files" (Unix) | fd 누수 | `ls /proc/<pid>/fd \| wc -l` |
| 커넥션 타임아웃 `InvalidOperationException` | 커넥션 미폐기 | 풀 카운터, `sys.dm_exec_sessions` |
| 0바이트 파일 | `StreamWriter` 미폐기 | 코드 검토, CA2000 분석기 |
| 메모리 사용량이 서서히 증가 | 파이널라이저 큐 적체 | `!finalizequeue` (SOS), `dotnet-counters` |
| `SocketException` 포트 고갈 | `HttpClient`/`Socket` 오용 | `netstat`, 43.9절 |

파이널라이저 큐 적체를 포함한 메모리 문제 진단 도구 전반은 66장, 특히 66.9절과 66.11절에 있다.

### GC에게 힌트를 주는 두 가지 API

네이티브 리소스가 메모리를 많이 소비하는데 그것을 감싸는 관리 객체는 메모리를 거의 안 쓰는 경우가 있다. 전형적인 예가 비트맵이다. 비트맵은 네이티브 메모리를 수 메가바이트 차지할 수 있지만 관리 객체는 `HBITMAP`(4바이트나 8바이트 값) 하나만 담으므로 아주 작다.

CLR 입장에서 보면 프로세스가 수백 개의 비트맵을 (관리 메모리는 거의 안 쓰면서) 할당한 뒤에야 컬렉션이 일어난다. 그런데 프로세스가 많은 비트맵을 다루면 메모리 소비가 무서운 속도로 늘어난다. `GC` 클래스가 이를 위해 두 개의 정적 메서드를 제공한다.

```csharp
public static void AddMemoryPressure(Int64 bytesAllocated);
public static void RemoveMemoryPressure(Int64 bytesAllocated);
```

큰 네이티브 리소스를 감싸는 클래스는 이 메서드로 GC에게 **실제로 얼마나 많은 메모리가 소비되고 있는지 힌트**를 줘야 한다. 내부적으로 GC가 이 압력을 감시하다가 높아지면 컬렉션을 강제한다.

네이티브 리소스의 개수가 고정된 경우도 있다. Windows는 예전에 장치 컨텍스트를 다섯 개만 만들 수 있다는 제약이 있었고, 애플리케이션이 열 수 있는 파일 수에도 제한이 있었다. 이런 상황을 위해 `System.Runtime.InteropServices`가 `HandleCollector` 클래스를 제공한다.

```csharp
public sealed class HandleCollector {
    public HandleCollector(String name, Int32 initialThreshold);
    public HandleCollector(String name, Int32 initialThreshold, Int32 maximumThreshold);
    public void Add();
    public void Remove();
    public Int32 Count { get; }
    public Int32 InitialThreshold { get; }
    public Int32 MaximumThreshold { get; }
    public String Name { get; }
}
```

수량이 제한된 네이티브 리소스를 감싸는 클래스는 이 클래스의 인스턴스로 GC에게 **실제로 몇 개의 리소스가 소비되고 있는지 힌트**를 줘야 한다. 내부적으로 이 객체가 개수를 감시하다가 높아지면 컬렉션을 강제한다.

> **⚠️ 이 API들은 `Dispose`의 대체재가 아니다**
>
> 내부적으로 `GC.AddMemoryPressure`와 `HandleCollector.Add`는 `GC.Collect`를 호출해, 0세대가 예산에 도달하기 전에 가비지 컬렉션을 시작하게 만든다. **강제 컬렉션은 비싸다.** 이 API들은 GC의 판단이 근본적으로 어긋난 상황을 보정하는 응급 처방이고, 올바른 해법은 여전히 `Dispose`를 제때 부르는 것이다.
>
> `GC.Collect`를 애플리케이션 코드에서 직접 부르는 것에 대한 논의는 64장과 65장에 있다.

---

## 33.9 제네릭 클래스가 `IDisposable` 타입 인자를 받을 때

### 제약으로는 표현할 수 없는 것

제약(constraint)은 두 가지 일을 한다. 첫째, 런타임 오류를 컴파일 시점 오류로 바꾼다. 둘째, 매개변수화된 타입을 인스턴스화할 때 무엇이 요구되는지 사용자에게 명확한 문서가 된다.

그런데 **제약으로는 타입 매개변수가 무엇을 "할 수 없는지"를 지정할 수 없다.** 거의 모든 경우에는 타입 매개변수가 내 타입이 기대하고 사용하는 것 이상의 능력을 갖든 말든 상관없다. 그러나 **`IDisposable`을 구현하는 타입 매개변수라는 특수한 경우**에는 추가 작업이 필요하다.

제네릭 제약 목록(23.6절)을 아무리 뒤져도 다음 둘 다 불가능하다.

- "`T`는 `IDisposable`이 **아니어야** 한다" — 부정 제약이 없다
- "`T`는 `IDisposable`일 **수도** 있다" — 그건 제약이 아니라 그냥 조건이 없는 것이다

`where T : IDisposable`을 붙이는 것은 가능하지만, 그러면 **폐기가 필요 없는 타입을 인자로 쓸 수 없게 된다.** 대부분의 경우 이는 과도한 제약이다.

### 지역 변수일 때 — `using (x as IDisposable)`

문제는 제네릭 메서드가 메서드 안에서 타입 매개변수의 인스턴스를 만들어 쓸 때 발생한다.

```csharp
public interface IEngine
{
    void DoWork();
}

public class EngineDriverOne<T> where T : IEngine, new()
{
    public void GetThingsDone()
    {
        T driver = new T();
        driver.DoWork();
    }
}
```

`T`가 `IDisposable`을 구현한다면 여기서 리소스 누수가 생긴다. 타입 `T`의 지역 변수를 만드는 모든 자리에서 `T`가 `IDisposable`을 구현하는지 검사하고, 구현한다면 올바르게 폐기해야 한다.

```csharp
public void GetThingsDone()
{
    T driver = new T();
    using (driver as IDisposable)
    {
        driver.DoWork();
    }
}
```

`using` 문 안의 이런 캐스트를 처음 보면 좀 헷갈리지만 잘 동작한다. 컴파일러는 `driver`를 `IDisposable`로 캐스팅한 참조를 담는 **숨은 지역 변수**를 만든다. `T`가 `IDisposable`을 구현하지 않으면 이 지역 변수의 값은 `null`이다. 그런 경우 컴파일러는 `Dispose()`를 부르지 않는다 — 이 추가 작업을 하기 전에 `null` 검사를 하기 때문이다. 반대로 `T`가 `IDisposable`을 구현하는 모든 경우에는 `using` 블록을 벗어날 때 `Dispose()` 호출이 생성된다.

꽤 단순한 관용구다. **타입 매개변수의 지역 인스턴스를 `using` 문으로 감싸라.** `T`가 `IDisposable`을 구현할 수도, 안 할 수도 있으므로 여기 보인 캐스트를 써야 한다.

> **⚠️ 값 타입 `T`는 여기서 박싱된다**
>
> `driver as IDisposable`은 `T`가 값 타입이면 **박싱**을 일으킨다. `as` 연산자가 참조 타입 결과를 만들기 때문이다(15.2절).
>
> 게다가 박싱된 복사본에 `Dispose()`가 불린다. 원본 값 타입 인스턴스의 상태는 바뀌지 않는다. `Dispose`가 자기 필드를 수정하는 구조체라면(예: `_disposed = true`) 그 변경은 박스 안에서만 일어나고 사라진다. 값 타입에서 `Dispose`가 자기 상태를 바꾸는 설계 자체가 문제이므로 실무에서 이 함정에 빠지는 일은 드물지만, 알고는 있어야 한다.
>
> 뜨거운 경로에서 이 박싱이 문제라면 `where T : IDisposable` 제약을 걸어야 한다. 제약이 있으면 `using (driver)`가 `constrained.` 접두사로 낮춰져 **박싱 없이** 값 타입의 `Dispose`를 직접 호출한다(33.5절의 낮춤 표 참조).

### 필드일 때 — 제네릭 클래스가 `IDisposable`이 되어야 한다

제네릭 클래스가 타입 매개변수의 인스턴스를 **멤버 변수로** 만들어 쓰면 상황이 복잡해진다. 이제 제네릭 클래스가 `IDisposable`을 구현할 수도 있는 타입에 대한 참조를 소유한다. 그 말은 **제네릭 클래스 자신이 `IDisposable`을 구현해야 한다**는 뜻이다. 리소스가 `IDisposable`을 구현하는지 검사하고, 구현한다면 그 리소스를 폐기해야 한다.

```csharp
public sealed class EngineDriver2<T> : IDisposable
    where T : IEngine, new()
{
    // 생성 비용이 크므로 null로 초기화한다
    private Lazy<T> driver = new Lazy<T>(() => new T());

    public void GetThingsDone() =>
        driver.Value.DoWork();

    // IDisposable 멤버
    public void Dispose()
    {
        if (driver.IsValueCreated)
        {
            var resource = driver.Value as IDisposable;
            resource?.Dispose();
        }
    }
}
```

이 클래스가 이번 라운드에서 짊어진 짐이 꽤 된다.

**첫째, `IDisposable`을 구현하는 추가 작업이 생겼다.**

**둘째, 클래스에 `sealed` 키워드를 붙였다.** 그렇게 하지 않으려면 파생 클래스도 `Dispose()` 메서드를 쓸 수 있도록 전체 `IDisposable` 패턴(33.3절)을 구현해야 한다. 클래스를 봉인하면 그 추가 작업이 필요 없다. 다만 클래스의 사용자를 제한하게 된다 — 이 클래스에서 새 타입을 파생시킬 수 없다.

**셋째, 이렇게 작성한 클래스는 `driver`에 대해 `Dispose()`가 두 번 이상 불리지 않는다고 보장할 수 없다.** 그것은 허용되며, `IDisposable`을 구현하는 모든 타입은 `Dispose()`의 반복 호출을 지원해야 한다. `T`에 클래스 제약(`where T : class`)이 없기 때문에 `Dispose` 메서드를 나가기 전에 `driver`를 `null`로 설정할 수 없다. (값 타입은 `null`이 될 수 없음을 기억하라.)

`Lazy<T>`를 쓴 것은 `T`의 생성 비용이 클 수 있다는 가정 때문이다. `Lazy<T>`와 지연 초기화 전반은 34.7절에서 다룬다.

### 세 번째 선택지 — 소유권을 밖으로 옮긴다

실무에서는 제네릭 클래스의 인터페이스를 약간 바꿔 이 설계를 아예 피할 수 있는 경우가 많다. **`Dispose` 책임을 제네릭 클래스 밖으로 옮기고 `new()` 제약도 없애는** 방법이다.

```csharp
public sealed class EngineDriver<T> where T : IEngine
{
    // 생성 비용이 크므로 null로 초기화한다
    private T driver;

    public EngineDriver(T driver)
    {
        this.driver = driver;
    }

    public void GetThingsDone()
    {
        driver.DoWork();
    }
}
```

물론 앞 코드의 주석은 `T` 객체를 만드는 비용이 크다는 것을 암시했다. 이 최신 버전은 그 걱정을 무시한다. 결국 이 문제를 어떻게 푸느냐는 애플리케이션 설계의 다른 여러 요인에 달렸다.

| 전략 | 언제 쓰는가 | 대가 |
|---|---|---|
| 지역 변수 + `using (x as IDisposable)` | `T` 인스턴스가 메서드 안에서만 산다 | 값 타입일 때 박싱 |
| 필드 + `IDisposable` 구현 + `sealed` | `T` 인스턴스를 필드로 유지해야 한다 | 상속 불가, 이중 폐기 방지 불가 |
| 필드 + 전체 Dispose 패턴 | 상속을 허용해야 한다 | 코드량 증가 |
| 소유권을 생성자 인자로 이전 | 호출자가 수명을 알고 있다 | 제네릭 클래스가 생성 시점을 통제 못 함 |
| `where T : IDisposable` 제약 | 모든 `T`가 폐기 가능한 설계 | 폐기 불필요한 타입 배제, 대신 박싱 없음 |

> **📌 컬렉션도 같은 문제를 갖는다**
>
> `List<T>`나 `Dictionary<TKey, TValue>`가 담은 요소를 폐기해 주지 않는 것은 같은 이유다. **컬렉션은 요소를 소유하지 않는다.** BCL은 이 판단을 일관되게 유지한다.
>
> 그래서 `IDisposable`을 담는 컬렉션을 만들 때는 소유권을 명시적으로 결정해야 한다.
>
> ```csharp
> // 컬렉션이 소유한다고 결정했다면 직접 정리한다
> foreach (var item in _items)
>     (item as IDisposable)?.Dispose();
> _items.Clear();
> ```
>
> 부분적으로 만들다 실패하는 경우가 특히 까다롭다. 10개 중 7개를 만들고 8번째에서 예외가 나면 이미 만든 7개를 정리해야 한다. 33.10절의 팩터리 패턴이 그 답이다.

> **💡 확실한 결론 하나**
>
> 제네릭 클래스의 타입 매개변수가 기술하는 타입의 인스턴스를 **직접 생성한다면**, 그 타입들이 `IDisposable`을 구현할 수 있다는 것을 반드시 고려해야 한다. 방어적으로 코딩해서 그 객체들이 스코프를 벗어날 때 리소스가 새지 않도록 보장해야 한다.
>
> 어떨 때는 인스턴스를 생성하지 않도록 코드를 리팩터링해서 해결할 수 있다. 어떨 때는 지역 변수를 만들어 쓰고 필요하면 폐기하는 코드를 쓰는 것이 최선의 설계다. 마지막으로 타입 매개변수 인스턴스의 지연 생성과 제네릭 클래스에서의 `IDisposable` 구현이 설계상 요구될 수도 있다. 작업이 조금 늘지만, 쓸모 있는 클래스를 만들려면 필요한 작업이다.

---

## 33.10 `using`과 `try/finally` — 리소스 정리 관용구

### 기본 — 하나면 `using`

비관리 시스템 리소스를 쓰는 타입은 `IDisposable` 인터페이스의 `Dispose()` 메서드로 명시적으로 해제해야 한다. .NET 환경의 규칙은 그것을 **타입이나 시스템의 책임이 아니라 타입을 쓰는 코드의 책임**으로 정한다. 따라서 `Dispose()` 메서드를 가진 타입을 쓸 때마다 `Dispose()`를 불러 리소스를 해제하는 것이 내 책임이다.

`Dispose()`가 항상 호출되도록 보장하는 최선의 방법은 **`using` 문이나 `try`/`finally` 블록**을 활용하는 것이다.

**메서드 안에서 폐기 가능한 객체를 하나만 쓴다면 `using` 절이 객체가 올바르게 폐기되도록 보장하는 가장 단순한 방법이다.**

### 여러 개일 때 — 중첩인가 직접 작성인가

`using` 문 하나마다 새로운 중첩 `try`/`finally` 블록이 만들어진다.

```csharp
public void ExecuteCommand(string connString, string commandString)
{
    using (SqlConnection myConnection = new SqlConnection(connString))
    {
        using (SqlCommand mySqlCommand = new SqlCommand(commandString, myConnection))
        {
            myConnection.Open();
            mySqlCommand.ExecuteNonQuery();
        }
    }
}
```

이것이 실제로 만들어 내는 구조는 다음과 같다.

```csharp
public void ExecuteCommand(string connString, string commandString)
{
    SqlConnection myConnection = null;
    SqlCommand mySqlCommand = null;
    try
    {
        myConnection = new SqlConnection(connString);
        try
        {
            mySqlCommand = new SqlCommand(commandString, myConnection);
            myConnection.Open();
            mySqlCommand.ExecuteNonQuery();
        }
        finally
        {
            if (mySqlCommand != null)
                mySqlCommand.Dispose();
        }
    }
    finally
    {
        if (myConnection != null)
            myConnection.Dispose();
    }
}
```

한 메서드에서 `IDisposable`을 구현한 객체를 두 개 이상 할당하는 일이 흔치 않다는 점을 감안하면 그냥 둬도 괜찮다 — 동작하기 때문이다. 그러나 이 구조가 보기 흉하다면, 여러 개를 할당할 때는 직접 `try`/`finally` 블록을 쓰는 편을 선호할 수 있다.

```csharp
public void ExecuteCommand(string connString, string commandString)
{
    SqlConnection myConnection = null;
    SqlCommand mySqlCommand = null;
    try
    {
        myConnection = new SqlConnection(connString);
        mySqlCommand = new SqlCommand(commandString, myConnection);
        myConnection.Open();
        mySqlCommand.ExecuteNonQuery();
    }
    finally
    {
        if (mySqlCommand != null)
            mySqlCommand.Dispose();
        if (myConnection != null)
            myConnection.Dispose();
    }
}
```

C# 8 이후로는 세 번째 선택지가 생겼다. **`using` 선언을 나란히 쓰는 것**이다.

```csharp
public void ExecuteCommand(string connString, string commandString)
{
    using var myConnection = new SqlConnection(connString);
    using var mySqlCommand = new SqlCommand(commandString, myConnection);
    myConnection.Open();
    mySqlCommand.ExecuteNonQuery();
}
```

낮춤 결과는 여전히 중첩 `try`/`finally`지만, **소스에는 중첩이 보이지 않는다.** 오늘날 이것이 가장 읽기 좋은 형태다.

> **⚠️ 가장 흔한 함정 — `using` 블록 바깥에서 할당하기**
>
> 다음 코드는 깔끔해 보이지만 미묘한 버그가 있다.
>
> ```csharp
> public void ExecuteCommand(string connString, string commandString)
> {
>     // 나쁜 생각이다. 잠재적 리소스 누수가 숨어 있다!
>     SqlConnection myConnection = new SqlConnection(connString);
>     SqlCommand mySqlCommand = new SqlCommand(commandString, myConnection);
>
>     using (myConnection as IDisposable)
>     using (mySqlCommand as IDisposable)
>     {
>         myConnection.Open();
>         mySqlCommand.ExecuteNonQuery();
>     }
> }
> ```
>
> `SqlCommand()` 생성자가 예외를 던지면 `SqlConnection` 객체는 **절대 폐기되지 않는다.** `myConnection`이 참조하는 객체는 이미 만들어졌지만, `SqlCommand` 생성자가 실행될 때 코드가 아직 `using` 블록에 진입하지 않았다. 생성자가 `using` 블록 안에 있지 않으면 `Dispose` 호출은 건너뛰어진다.
>
> **`IDisposable`을 구현하는 객체는 반드시 `using` 블록이나 `try` 블록의 스코프 안에서 할당되어야 한다.** 그렇지 않으면 리소스 누수가 발생할 수 있다.
>
> 같은 이유로 `using var a = X(); using var b = Y(a);` 형태는 안전하다. 각 `using` 선언이 그 지점부터 `try` 블록을 시작하기 때문이다.

### 소유권 이전이 있는 팩터리

`using`으로 표현하기 어려운 대표적 상황이 **생성자가 소유권을 넘겨받는 경우**다.

```csharp
public sealed class Reader : IDisposable
{
    readonly Stream _stream;
    public Reader(Stream stream) => _stream = stream;   // 소유권을 가져간다
    public void Dispose() => _stream.Dispose();
}
```

이 타입의 팩터리 메서드를 쓸 때 `using`만으로는 안전하지 않다.

```csharp
// 위험: new Reader(...)가 예외를 던지면 fs가 샌다
static Reader Open(string path)
{
    var fs = new FileStream(path, FileMode.Open);
    return new Reader(fs);
}
```

정답은 `try`/`catch`다.

```csharp
static Reader Open(string path)
{
    var fs = new FileStream(path, FileMode.Open);
    try
    {
        return new Reader(fs);      // 성공하면 소유권이 Reader로 넘어간다
    }
    catch
    {
        fs.Dispose();               // 실패하면 내가 치운다
        throw;
    }
}
```

`finally`가 아니라 `catch`인 것에 주의하라. 성공했을 때는 폐기하면 **안 된다** — 소유권이 이미 넘어갔기 때문이다. `catch` 블록에 `throw;`만 있는 것은 32.5절에서 본 대로 스택 트레이스를 보존하는 재던지기다.

여러 리소스를 조립하는 생성자에도 같은 패턴이 필요하다.

```csharp
public sealed class Pipeline : IDisposable
{
    readonly FileStream _file;
    readonly GZipStream _gzip;
    readonly StreamWriter _writer;

    public Pipeline(string path)
    {
        try
        {
            _file   = new FileStream(path, FileMode.Create);
            _gzip   = new GZipStream(_file, CompressionMode.Compress);
            _writer = new StreamWriter(_gzip);
        }
        catch
        {
            Dispose();   // 부분적으로 만들어진 것들을 정리한다
            throw;
        }
    }

    public void Dispose()
    {
        // 필드가 null일 수 있다 — 생성자가 중간에 실패했을 수 있다
        _writer?.Dispose();
        _gzip?.Dispose();
        _file?.Dispose();
    }
}
```

`Dispose`가 **역순으로, 널 안전하게** 정리한다는 점이 핵심이다. 생성자가 두 번째 줄에서 실패했다면 `_writer`는 `null`이고 `_file`만 유효하다. 32.11절의 강한 예외 보장과 같은 정신이다.

### `Close`와 `Dispose` 중 무엇을 부를 것인가

폐기 가능 객체를 해제할 때 뉘앙스가 하나 더 있다. 어떤 타입은 리소스를 해제하는 `Dispose`와 `Close` 메서드를 **둘 다** 지원한다. `SqlConnection`이 그런 클래스 중 하나다.

```csharp
finally
{
    if (myConnection != null)
        myConnection.Close();
}
```

이 버전은 연결을 닫기는 하지만, 폐기하는 것과 정확히 같지는 않다. `Dispose` 메서드는 리소스 해제 이상의 일을 한다. **가비지 컬렉터에게 그 객체가 더 이상 파이널라이즈될 필요가 없다고 알린다.** `Dispose`는 `GC.SuppressFinalize()`를 호출한다. `Close`는 일반적으로 그렇지 않다. 결과적으로 그 객체는 파이널라이제이션이 필요 없는데도 파이널라이제이션 큐에 남는다.

**선택권이 있다면 `Dispose()`가 `Close()`보다 낫다.**

### 선택 기준 정리

| 상황 | 권장 형태 |
|---|---|
| 메서드 안에서 폐기 가능 객체 하나 | `using` 선언 (`using var x = ...`) |
| 같은 스코프에 여러 개 | `using` 선언 여러 개 (역순 폐기가 자연스러운지 확인) |
| 리소스 수명을 메서드보다 짧게 | `using` 문 (블록으로 명시) |
| 루프 안에서 매 반복 정리 | 루프 본문 안의 `using` 문 |
| 이미 있는 변수/식을 폐기 | `using (expr)` 문 |
| 조건부로만 폐기 | 직접 `try`/`finally` |
| 생성자가 소유권을 넘겨받는 팩터리 | `try`/`catch` + `Dispose` + `throw;` |
| 부분 생성 실패 정리 | 생성자 `try`/`catch` → 널 안전 `Dispose` |
| `Dispose` 자체의 예외를 잡아 로깅해야 함 | 직접 `try`/`finally` (안에 `try`/`catch`) |
| 필드로 보관하는 리소스 | `using` 불가 — 클래스가 `IDisposable`을 구현 |
| 비동기 컨텍스트 + `IAsyncDisposable` | `await using` |
| `T`가 폐기 가능할 수도 있는 제네릭 | `using (x as IDisposable)` |

> **⚠️ `using`으로 감쌀 수 없는 것을 억지로 감싸지 마라**
>
> 리소스가 **메서드 스코프를 넘어 살아야 한다면 `using`은 답이 아니다.** 그런 경우 리소스를 필드에 보관하고, 그 클래스가 `IDisposable`을 구현해서 책임을 상위로 넘겨야 한다. `using`으로 억지로 감싸면 다른 코드가 폐기된 객체를 쓰게 된다.
>
> 흔한 사고: `HttpClient`를 `using`으로 감싸는 것. `HttpClient`는 `IDisposable`이지만 **오래 재사용해야 하는 타입**이다. 매 요청마다 만들고 폐기하면 TIME_WAIT 상태의 소켓이 쌓여 포트가 고갈된다. 자세한 것은 43.9절에 있다.

> **💡 분석기를 켜라**
>
> `using`을 빠뜨리는 실수는 사람이 코드 리뷰로 잡기에는 너무 흔하다. 다음 규칙들을 경고가 아니라 **오류**로 승격시키는 것을 권한다.
>
> ```xml
> <PropertyGroup>
>   <EnableNETAnalyzers>true</EnableNETAnalyzers>
>   <AnalysisMode>All</AnalysisMode>
> </PropertyGroup>
> ```
>
> | 규칙 | 잡아 주는 것 |
> |---|---|
> | CA1001 | `IDisposable` 필드를 가진 타입이 `IDisposable`을 구현하지 않음 |
> | CA2000 | 스코프를 벗어나기 전에 객체를 폐기하지 않음 |
> | CA1063 | `IDisposable`을 올바르게 구현하지 않음 (패턴 위반) |
> | CA1816 | `Dispose`에서 `GC.SuppressFinalize`를 호출하지 않음 |
> | CA2213 | 폐기 가능 필드를 폐기하지 않음 |
> | CA2215 | `Dispose`에서 기반 클래스 `Dispose`를 호출하지 않음 |
>
> 이 규칙들이 이 장에서 서술한 규약을 거의 그대로 기계화한 것이다. 분석기 설정과 `.editorconfig` 활용은 79.13절에 있다.

### 관리 환경에서의 리소스 관리 — 최종 정리

어떤 면에서 리소스 관리는 C#에서 C++보다 더 어려울 수 있다. 사용하는 모든 리소스를 정리하기 위해 결정적 파이널라이제이션에 의존할 수 없기 때문이다. 그러나 가비지 컬렉션 환경이 전체적으로는 훨씬 단순하다.

**우리가 쓰는 타입의 압도적 다수는 `IDisposable`을 구현하지 않는다.** .NET 프레임워크 클래스 중 `IDisposable`을 구현하는 것은 작은 비율이다. `IDisposable`을 구현하는 것들을 쓸 때는 **모든 경우에** 폐기하는 것을 기억하면 된다. 그런 객체는 `using` 절이나 `try`/`finally` 블록으로 감싸야 한다. 어느 쪽을 쓰든 객체가 **항상, 매번** 올바르게 폐기되도록 하라.

---

## 이 장의 요약

- **GC는 메모리만 회수한다.** 파일 핸들, 소켓, 커널 객체, 데이터베이스 커넥션은 GC의 시야 밖에 있는 유한 자원이고, GC는 그것이 고갈되어 가는 것을 감지하지 못한다. 이 비대칭이 `IDisposable`이 존재하는 이유 전부다.
- **표준 정리 의미론은 세 규칙이다.** 폐기 후에는 되돌릴 수 없고(`ObjectDisposedException`), `Dispose`는 반복 호출을 견뎌야 하며(멱등), 소유한 객체를 함께 폐기한다. 이 규칙들은 언어가 강제하지 않는 관례지만, 어기면 `using`이 깨진다.
- **`Dispose` / `Close` / `Stop`은 다르다.** `Close`는 `Dispose`와 같거나 그 부분집합이며, 대개 `GC.SuppressFinalize`를 부르지 않는다. 선택권이 있으면 `Dispose`가 낫다. 재사용이 필요하면 `Close`를 쓴다.
- **패턴은 봉인 타입용과 상속 가능 타입용 둘이다.** 봉인 타입은 `Dispose()` 하나면 되고, 상속 가능 타입은 비가상 `Dispose()` + 가상 `Dispose(bool)` + (직접 비관리 리소스가 있을 때만) 파이널라이저 구조를 따른다. `disposing == false`는 최후의 수단 모드이며 관리 객체를 건드리면 안 된다.
- **`using` 문과 `using` 선언은 같은 IL로 낮춰진다.** 다른 것은 폐기 시점의 스코프뿐이다. 값 타입 리소스에는 `constrained.` 접두사가 붙어 박싱이 일어나지 않고, `ref struct`는 패턴 기반 경로로 처리된다.
- **익명 disposal은 "시작-끝" 쌍을 `using`으로 표현하는 관용구다.** `Disposable.Create(Action)` 형태의 작은 헬퍼 하나면 잠금·트랜잭션·측정 구간·이벤트 억제를 모두 같은 문법으로 다룰 수 있다. 대가는 클로저와 래퍼의 힙 할당이다.
- **`IAsyncDisposable`은 정리에 I/O가 필요할 때를 위한 것이다.** 반환 타입이 `ValueTask`인 이유는 동기 완료가 흔하기 때문이다. 동기·비동기를 둘 다 구현할 때는 `Dispose(bool)`과 `DisposeAsyncCore()`를 각각 가상으로 두고, `DisposeAsync()`가 `Dispose(false)`를 부른다. 두 경로를 서로 호출해 블로킹하면 안 된다.
- **`SafeHandle`이 파이널라이저를 직접 쓰는 것보다 낫다.** 저메모리 상황의 사전 JIT 컴파일 보장, 임계 파이널라이저의 실행 순서 보장, P/Invoke 반환값의 경쟁 조건 제거, 참조 카운팅에 의한 핸들 재활용 공격 차단 — 넷을 공짜로 얻는다. 감싸는 클래스는 파이널라이저를 가질 필요가 없어진다.
- **`Dispose`를 빠뜨리면 증상이 원인처럼 보이지 않는다.** 커넥션 풀 고갈은 데이터베이스 성능 문제로, 파일 잠금은 배포 스크립트 오류로, `StreamWriter` 미폐기는 0바이트 파일로 나타난다. 파이널라이저가 있으면 늦게라도 정리되지만 그 대가로 객체가 세대 승격된다.
- **제네릭에서는 "`T`가 `IDisposable`이 아님"을 제약으로 표현할 수 없다.** 지역 변수는 `using (x as IDisposable)`로, 필드는 제네릭 클래스가 직접 `IDisposable`을 구현하고 `sealed`로 만들어 처리한다. 가장 좋은 해법은 소유권을 호출자에게 넘기는 설계 변경이다.
- **`using`이 기본, `try`/`finally`는 예외 상황용이다.** 조건부 폐기, 소유권 이전 팩터리, 부분 생성 실패 정리, `Dispose` 예외 로깅 — 이 네 경우에만 직접 작성한다. 그리고 `IDisposable` 객체는 반드시 `using`이나 `try` 스코프 **안에서** 할당해야 한다.

---

## 연습 문제

1. `FileStream`으로 임시 파일을 만들어 몇 바이트를 쓴 뒤, `Dispose`를 부르지 않고 곧바로 `File.Delete`를 호출하는 프로그램을 작성하라. Windows와 Linux(또는 WSL/컨테이너)에서 각각 실행해 결과가 어떻게 다른지 확인하라. Windows에서 던져진 예외의 정확한 타입과 메시지를 기록하라.

2. `StreamWriter`로 파일에 짧은 문자열을 쓰고 `Dispose`를 부르지 않은 채 프로그램을 종료시켜라. 만들어진 파일의 크기를 확인하라. 이제 `GC.Collect()`와 `GC.WaitForPendingFinalizers()`를 호출한 뒤 크기를 다시 확인하라. 왜 달라지지 않는지 33.8절의 설명과 대조하라.

3. 다음 세 코드를 각각 별도 메서드로 작성하고 `ildasm`(또는 ILSpy의 IL 보기)으로 IL을 비교하라. (a) `using (var x = new MemoryStream()) { }`, (b) `using var x = new MemoryStream();`, (c) 수동 `try`/`finally`. 세 IL이 실질적으로 같은지, `finally` 안의 널 검사(`brfalse`)가 어디에 있는지 확인하라.

4. `IDisposable`을 구현한 **구조체**를 만들어 `using`으로 쓰고, IL에서 `constrained.` 접두사를 찾아라. 그다음 같은 구조체를 `object`에 담아 `using (o as IDisposable)`로 쓰고, `box` 명령이 나타나는지 확인하라.

5. 33.5절의 `Disposable.Create` 헬퍼를 구현하고, 이것으로 "메서드 실행 시간을 측정해 콘솔에 출력하는" 스코프를 만들어라. 같은 기능을 `ref struct` + 패턴 기반 `using`으로 다시 구현하고, 벤치마크로 할당량 차이를 측정하라(할당량 측정은 67장 참조).

6. `IDisposable`과 `IAsyncDisposable`을 모두 구현하는 클래스를 33.6절의 4메서드 구조로 작성하라. `Dispose()` → `DisposeAsync()`, `DisposeAsync()` → `Dispose()`, 같은 메서드 두 번 — 네 가지 호출 순서 전부에서 정리 로직이 정확히 한 번만 실행되는지 단위 테스트로 검증하라.

7. 커넥션 풀 고갈을 재현하라. 인메모리 데이터베이스나 로컬 SQL Server에 대해, `SqlConnection`을 `Open`하고 폐기하지 않는 루프를 돌려라. 몇 번째 반복에서 예외가 나는지, 예외 타입과 메시지가 무엇인지 기록하고, 연결 문자열의 `Max Pool Size`를 바꿨을 때 그 횟수가 어떻게 달라지는지 확인하라.

---

**다음 장** — 34장「객체 수명과 파이널라이제이션」에서는 이 장에서 계속 "34장에서 다룬다"고 미뤄 둔 것들을 끝낸다. 파이널라이저가 정확히 언제 어떤 순서로 실행되는지, F-reachable 큐가 무엇이고 왜 그것이 루트로 취급되는지, 파이널라이저에서 `Dispose`를 부르는 백업 패턴이 언제 정당한지를 다룬다. 이어서 부활과 임계 파이널라이저, 약한 참조, `Lazy<T>`, `GC.KeepAlive`가 필요한 순간, 그리고 타이머가 만드는 관리 메모리 누수까지 — 객체의 삶과 죽음을 GC의 시점에서 다시 본다.
