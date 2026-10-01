# 68장. `Span<T>`와 `Memory<T>`

> **이 장의 위치** — Part XII「고성능 C#」의 두 번째 장이자 핵심 장이다. 67장에서 "측정 없이 최적화 없다"는 절차를 세웠으니, 이제부터는 그 절차를 통과한 최적화 기법을 다룬다. 그 첫 번째가 `Span<T>`다. 16.6절에서 `ref struct`의 문법만 훑고 "심화는 68장"이라고 미뤄둔 것을 여기서 끝낸다. 63.7절의 `stackalloc`, 60.8절의 고정 크기 버퍼, 54.4절의 필드 레이아웃, 64.3절의 내부 루트 — 앞에서 따로따로 본 조각들이 이 장에서 하나로 합쳐진다. `Span<T>`는 "복사 없이 메모리의 일부를 가리킨다"는 한 문장으로 요약되지만, **그 한 문장을 안전하게 성립시키기 위해 언어와 런타임이 무엇을 새로 만들어야 했는지**가 이 장의 내용이다.
>
> **선수 지식** — 16장(구조체와 값 타입), 54장(타입 시스템의 런타임 표현), 60장(네이티브 및 COM 상호운용), 61장(메모리의 기초), 63장(할당), 64장(GC 알고리즘 완전 해부)
>
> **이 장에서 다루지 않는 것** — `ArrayPool<T>`·`MemoryPool<T>`를 활용한 풀링 전략 전반과 문자열 할당 제거의 실전 카탈로그는 69장에서, `ReadOnlySequence<T>`를 쓰는 `System.IO.Pipelines`는 72.1절에서, SIMD와 `Vector<T>`는 70장에서 다룬다. `unsafe` 포인터 문법 자체와 P/Invoke 마샬링은 60장에서 이미 다뤘다.

---

## 68.1 `ref struct`의 규칙과 제약

### 왜 새로운 종류의 타입이 필요했는가

C#에는 오랫동안 두 종류의 타입만 있었다. 힙에 사는 참조 타입과, 어디든 갈 수 있는 값 타입이다. 값 타입은 "어디든 갈 수 있다"는 것이 장점이자 문제다. 지역 변수로 스택에 있을 수도 있고, 클래스의 필드로 힙에 있을 수도 있고, 박싱되어 힙 객체가 될 수도 있고, 배열 원소가 되어 힙에 늘어설 수도 있다.

그런데 어떤 타입은 **절대로 힙에 가면 안 된다.** 스택 주소를 담고 있는 타입이 그렇다. 스택 주소를 담은 값이 힙 객체의 필드로 살아남으면, 그 주소가 가리키던 스택 프레임이 사라진 뒤에도 값은 남는다. 남은 것은 이미 다른 메서드가 쓰고 있는 메모리를 가리키는 유효하지 않은 주소다.

`ref struct`는 이 요구를 언어 차원에서 강제하기 위해 C# 7.2에서 도입됐다. 선언은 `struct` 앞에 `ref`를 붙이는 것뿐이다.

```csharp
public ref struct RefBook
{
    public string Title;
    public string Author;
}
```

CLI 명세의 용어로는 **byref-like 타입**이라고 부른다. 관리 포인터(managed pointer)의 별명이 byref이므로, "byref와 비슷한 제약을 가진 타입"이라는 뜻이다. IL에서는 `System.Runtime.CompilerServices.IsByRefLikeAttribute`가 붙은 값 타입으로 표현된다.

> **📌 왜 `stackonly`가 아니라 `ref`인가**
>
> 초기 설계 논의에서 `stackonly` 같은 키워드가 검토됐지만 채택되지 않았다. `ref struct`가 주는 제약이 "스택에만 할당된다"보다 더 강하기 때문이다. 예를 들어 `ref struct`는 관리 타입이므로 포인터 타입(`RefBook*`)으로 만들 수도, `stackalloc RefBook[4]`의 원소가 될 수도 없다. `stackonly`라는 이름은 이 부분을 오해하게 만든다.

### 제약 전체 목록

컴파일러가 강제하는 제약은 다음과 같다. 이 표가 이 절의 핵심이다.

| 금지되는 것 | 이유 | 대표 컴파일 오류 |
|---|---|---|
| 클래스·일반 구조체의 **인스턴스 필드**로 선언 | 그 타입이 힙에 가면 같이 간다 | CS8345 "Field or auto-implemented property cannot be of type 'X' unless it is an instance member of a ref struct" |
| **정적 필드**로 선언 | 정적 필드 저장소는 힙이다 (54.5절) | CS8345 |
| **박싱** — `object`·`dynamic`·인터페이스로 변환 | 박싱은 힙 할당이다 | CS0029 / CS0030 계열 변환 오류 |
| **배열 원소** 타입으로 사용 | 배열 원소는 힙에 산다 | CS0611 "Array elements cannot be of type 'X'" |
| **제네릭 타입 인수**로 사용 | 제네릭 인스턴스화가 박싱·힙 배치를 가정한다 ※C# 13에서 완화 | CS0306 "The type 'X' may not be used as a type argument" |
| **비동기 메서드**의 매개변수·지역 변수 | 상태 기계의 필드가 되고 그 상태 기계는 힙에 박싱된다 ※C# 13에서 부분 완화 | CS4012 "Parameters or locals of type 'X' cannot be declared in async methods or lambda expressions" |
| **반복자**(`yield return`)에서 `yield` 경계를 넘어 생존 | 같은 이유 — 상태 기계 필드가 된다 ※C# 13에서 부분 완화 | CS4013 계열 |
| **람다식·로컬 함수**에 의한 캡처 | 클로저 클래스의 필드가 된다 (63.9절) | CS8175 "Cannot use ref local inside an anonymous method, lambda expression, or query expression" 계열 |
| **인터페이스 구현** | 구현하면 인터페이스로 변환(=박싱)이 가능해진다 ※C# 13에서 완화 | CS8343 "'X': ref structs cannot implement interfaces" |
| **포인터 타입**(`X*`)·`stackalloc X[n]` | 관리 타입이므로 주소를 취할 수 없다 | CS0208 "Cannot take the address of, get the size of, or declare a pointer to a managed type" |

반대로 **허용되는** 곳은 네 자리다 — 지역 변수, 메서드 매개변수(`ref`/`in`/`out` 포함), 메서드 반환 타입, 그리고 **다른 `ref struct`의 인스턴스 필드**.

마지막 항목이 중요하다. `ref struct` 안에는 다른 `ref struct`를 담을 수 있다. 담는 쪽도 힙에 갈 수 없으므로 제약이 전파되어 안전이 유지된다.

```csharp
public ref struct RefBook
{
    public string Title;
    public string Author;
    public RefPublisher Publisher;   // OK — ref struct 안의 ref struct
}

public ref struct RefPublisher
{
    public string Name;
}
```

```csharp
public class RefBookTest
{
    private RefBook _book;                       // CS8345
    public void Test()
    {
        RefBook local = new RefBook();
        object box = (object)local;              // 박싱 불가
        RefBook[] array = new RefBook[4];        // CS0611
        Span<RefBook> s = stackalloc RefBook[4]; // CS0208 — 관리 타입
        List<RefBook> list = new();              // CS0306
    }
}
```

> **⚠️ "힙에 못 간다"의 정확한 범위**
>
> `ref struct`가 힙에 갈 수 없다는 것은 **구조체 자신**의 이야기다. 그 구조체가 **가리키는 대상**은 얼마든지 힙에 있어도 된다. `Span<int> s = new int[100];`에서 `int[100]` 배열은 관리 힙에 있고, `s` 자체만 스택(또는 레지스터)에 있다. 이 구분을 놓치면 "`Span`을 쓰면 힙 할당이 사라진다"는 잘못된 기대를 하게 된다. **`Span`은 할당을 없애는 도구가 아니라 이미 있는 메모리를 복사 없이 가리키는 도구다.**

> **⚠️ 정적 필드도, `readonly` 필드도 예외가 아니다**
>
> "읽기 전용이면 괜찮지 않나", "정적이면 스레드 하나만 쓰지 않나" 같은 예외는 없다. 저장 위치가 힙이면 무조건 금지다. 정적 필드는 High Frequency Heap 또는 정적 저장소에 배치되고(54.5절), 이는 스택이 아니다.

### `ref struct`가 얻는 두 가지 보장

제약의 대가로 `ref struct`는 다른 타입이 가질 수 없는 두 가지를 얻는다.

**첫째, 절대로 힙에 할당되지 않는다.** 그래서 **관리 포인터를 필드로 담아도 안전하다.** 이것이 `Span<T>`가 존재할 수 있는 이유이며, `ref struct`가 도입된 원래 동기다.

**둘째, 절대로 여러 스레드에서 동시에 접근되지 않는다.** 스택 주소는 스레드 사이에 전달될 수 없고, 힙에 필드로 남을 수도 없으므로 어떤 `ref struct` 인스턴스도 자기 스레드 밖으로 나가지 못한다. 동기화 비용 없이 경합 조건이 원천 차단된다.

> **💡 두 번째 보장이 얼마나 강한지**
>
> `Span<T>`는 64비트에서 16바이트다. 한 워드보다 크므로 **원자적으로 읽고 쓸 수 없다.** 만약 `Span<T>`를 클래스 필드에 담을 수 있었다면, 두 스레드가 같은 필드를 동시에 쓸 때 한 스레드가 쓴 참조와 다른 스레드가 쓴 길이가 섞인 **찢어진(torn) `Span`** 이 만들어질 수 있다. 그 결과는 임의의 메모리를 임의의 길이로 읽는 것 — 즉 관리 코드에서 발생하는 메모리 안전성 위반이다.
>
> `ref struct` 제약은 성능만이 아니라 **타입 안전성을 지키기 위한 것**이기도 하다. 뒤에 볼 `Memory<T>`가 왜 포인터 대신 `object` 참조를 쓰는지도 같은 맥락에서 이해할 수 있다.

### `readonly ref struct`

`readonly`와 `ref`는 함께 쓸 수 있다.

```csharp
public readonly ref struct ReadOnlySlice
{
    private readonly ReadOnlySpan<char> _data;
    public ReadOnlySlice(ReadOnlySpan<char> data) => _data = data;
    public int Length => _data.Length;
}
```

`readonly ref struct`는 모든 인스턴스 필드가 `readonly`여야 한다. 대신 16.5절에서 본 **방어적 복사(defensive copy) 제거**가 적용된다. `in` 매개변수나 `ref readonly` 반환으로 이 타입을 다룰 때 컴파일러가 복사본을 만들지 않는다. `ReadOnlySpan<T>` 자신이 `readonly ref struct`로 선언되어 있다.

### C# 8: 패턴 기반 `using`

`ref struct`는 인터페이스를 구현할 수 없으므로 `IDisposable`도 구현할 수 없다. 그래서 오래된 자료에서는 "`ref struct`는 `using` 블록에 넣을 수 없고 `Dispose`를 직접 호출해야 한다"고 설명한다. **이 설명은 C# 8 이후로 낡았다.**

C# 8부터 `using` 문은 **패턴 기반**으로 동작한다. 접근 가능한 인스턴스 `void Dispose()` 메서드만 있으면 `IDisposable` 구현 없이도 `using`이 가능하다. `ref struct`에도 적용된다.

```csharp
public ref struct PooledBuffer
{
    private char[] _rented;
    public Span<char> Span;

    public PooledBuffer(int size)
    {
        _rented = ArrayPool<char>.Shared.Rent(size);
        Span = _rented.AsSpan(0, size);
    }

    public void Dispose()          // IDisposable 구현이 아니다
    {
        var toReturn = _rented;
        this = default;            // 재사용 방지
        if (toReturn != null) ArrayPool<char>.Shared.Return(toReturn);
    }
}

// 호출부 — using이 그대로 동작한다 ※C# 8
using (var buffer = new PooledBuffer(256))
{
    buffer.Span[0] = 'A';
}
```

> **⚠️ 패턴 기반 `using`이 되는 것과 실수가 사라지는 것은 다르다**
>
> `using`을 쓸 수 있게 됐어도, `ref struct`가 `IDisposable`이 아니라는 사실은 그대로다. 그래서 분석기·코드 리뷰가 "`IDisposable`인데 `using`을 안 썼다"고 경고해 주지 않는다. .NET 런타임 내부의 `ValueStringBuilder`가 여전히 명시적 `Dispose()` 호출로 쓰이는 것도 이 때문이다. **풀에서 빌린 자원을 담는 `ref struct`를 만든다면 `Dispose` 호출 누락을 잡아 줄 장치가 없다는 것을 전제로 설계해야 한다.**

### `foreach`도 패턴 기반이다

같은 이유로 `ref struct`는 `IEnumerable<T>`를 구현할 수 없다. 그런데도 `Span<T>`에 `foreach`가 되는 것은 C#의 `foreach`가 인터페이스가 아니라 **패턴**을 보기 때문이다. `GetEnumerator()`가 있고 그 반환값에 `Current` 속성과 `MoveNext()` 메서드가 있으면 된다. 68.7절에서 이 패턴으로 무할당 열거자를 직접 만든다.

### C# 13에서 완화된 것 ※C# 13

`ref struct` 제약 중 세 가지가 C# 13에서 풀렸다. 완화의 방향은 일관된다 — **박싱이 실제로 일어나지 않는 경우까지 금지하던 것을 허용한다.**

**첫째, 제네릭 타입 인수로 쓸 수 있다.** 단 조건이 있다. 타입 매개변수 선언에 `allows ref struct` 반제약(anti-constraint)이 붙어 있어야 한다.

```csharp
// 라이브러리 쪽 — 이 T는 ref struct도 받는다 ※C# 13
public static void Process<T>(T value) where T : allows ref struct
{
    // 이 안에서 T는 ref struct와 같은 제약을 받는다.
    // 필드로 저장 불가, 박싱 불가, object로 변환 불가.
}

// 호출부
Process(new Span<int>(new int[4]));   // C# 12까지는 CS0306
```

`allows ref struct`는 제약을 **추가**하는 것이 아니라 **제거**한다는 점에서 특이하다. `where T : IDisposable`은 T가 할 수 있는 일을 늘리지만, `allows ref struct`는 T가 될 수 있는 타입을 늘리는 대신 **메서드 본문에서 T에 할 수 있는 일을 줄인다.** 그래서 "반제약"이라고 부른다.

**둘째, 인터페이스를 구현할 수 있다.** 단 그 인터페이스 타입으로 **변환할 수는 없다.** 인터페이스는 제네릭 제약을 통해서만 활용된다.

```csharp
public interface ILength { int Length { get; } }

public ref struct MySpan : ILength      // ※C# 13 — 선언은 가능
{
    public int Length => 0;
}

ILength boxed = new MySpan();           // 여전히 오류 — 변환하면 박싱이다
```

**셋째, `async` 메서드와 반복자 안에서 `ref struct` 지역 변수와 `ref` 지역 변수를 선언할 수 있다.** 단 `await`나 `yield return` 경계를 **넘어서 살아남지 않는** 경우에 한한다. 경계를 넘으면 상태 기계 필드가 되어야 하므로 여전히 오류다.

```csharp
async Task ProcessAsync(byte[] data)
{
    // ※C# 13 — await 경계를 넘지 않으므로 허용
    Span<byte> header = data.AsSpan(0, 8);
    int length = BinaryPrimitives.ReadInt32LittleEndian(header);

    await Task.Delay(length);   // 여기서 header는 이미 죽었다

    // Span<byte> bad = data.AsSpan();
    // await Task.Delay(1);
    // bad[0] = 1;              // 이건 여전히 오류
}
```

> **⚠️ C# 13 완화를 언어 버전 없이 쓰면 조용히 실패하지 않는다 — 시끄럽게 실패한다**
>
> 세 완화는 모두 **컴파일러와 런타임 양쪽 지원**이 필요하다. `allows ref struct`는 .NET 9 이상의 런타임에서만 동작하며, 낮은 `<LangVersion>`이나 낮은 대상 프레임워크에서는 컴파일 오류가 난다. 다행히 조용히 잘못 동작하는 경우는 없다. 다만 **라이브러리를 여러 TFM으로 멀티 타기팅한다면** `#if NET9_0_OR_GREATER`로 분기해야 한다. 반제약이 붙은 시그니처와 붙지 않은 시그니처는 IL 수준에서 다르다.

> **💡 실무에서는 아직 대부분 제약이 살아 있다고 보는 편이 낫다**
>
> C# 13 완화는 주로 **라이브러리 저자**를 위한 것이다. `allows ref struct`가 유용해지려면 그 제네릭 메서드를 스스로 작성해야 하는데, 애플리케이션 코드가 그런 메서드를 정의할 일은 드물다. 애플리케이션 관점에서 실질적으로 달라진 것은 세 번째 항목 — `async` 메서드 안에서 `await` 사이사이 `Span`을 쓸 수 있게 된 것 — 이고, 이건 꽤 편하다. 68.6절에서 볼 "`Memory<T>`를 받아 `Span`으로 바꿔 쓰는" 패턴의 상용구를 줄여 준다.

---

## 68.2 `Span<T>` 내부 구조 — 관리 포인터 + 길이

### 설계 요구사항부터

`Span<T>`가 무엇이어야 하는지를 요구사항으로 적어 보면 구현이 거의 자동으로 결정된다.

1. **연속된 메모리 영역을 가리킨다.** 그러려면 최소한 시작 주소와 길이, 두 가지가 필요하다.
2. **힙 할당을 유발하지 않는다.** 그러려면 구조체여야 한다.
3. **관리 배열의 일부(슬라이스)를 가리킬 수 있다.** 그러려면 시작 주소가 객체 **내부**를 가리킬 수 있어야 한다 — 즉 내부 포인터(interior pointer)다.
4. **스택 메모리도 가리킬 수 있다.** 그러려면 스택 주소를 담을 수 있어야 한다.
5. **가리키는 관리 객체가 GC에 수집되면 안 된다.** 그러려면 GC가 그 주소를 루트로 인식해야 한다.

3번과 5번을 동시에 만족시키는 도구가 이미 CLR에 있다. **관리 포인터**다. 관리 포인터는 객체 내부를 가리킬 수 있고, GC가 내부 루트로 추적한다(64.3절). 4번도 만족한다 — 관리 포인터는 스택 주소도 가리킬 수 있다.

문제는 관리 포인터를 **필드로** 쓸 수 없다는 것이다. ECMA-335는 관리 포인터를 지역 변수·매개변수·반환 타입에만 허용한다. 필드로 허용하면 힙에 스택 주소가 남을 수 있기 때문이다.

그런데 68.1절에서 본 `ref struct`는 정의상 힙에 갈 수 없다. **`ref struct`의 필드라면 관리 포인터를 담아도 안전하다.** 이 논리가 `Span<T>`와 `ref struct`가 같이 태어난 이유다.

> **📌 원래 이름은 `Slice`였다**
>
> `Span<T>`는 설계 단계에서 `Slice<T>`라는 이름으로 논의됐다. 최종적으로 `Span`이 됐지만 `Slice`라는 이름은 메서드 이름(`Slice(int, int)`)으로 남았다. 이름의 변천은 이 타입의 성격을 잘 보여준다 — **이 타입의 존재 이유의 절반은 슬라이싱이다.**

### 실제 필드 구성

.NET Core 2.1 이후(런타임 지원이 있는 버전, 68.3절에서 "fast span"이라 부를 것)의 `Span<T>`는 필드가 정확히 두 개다.

```csharp
public readonly ref struct Span<T>
{
    internal readonly ref T _reference;   // 관리 포인터 (ref 필드)
    private readonly int _length;
    // ...
}
```

`ReadOnlySpan<T>`는 첫 필드가 `ref readonly T`인 것만 다르다.

메모리 배치를 그리면 이렇다.

```text
64비트 환경, Span<int> 하나의 실제 배치 (스택 또는 CPU 레지스터)

        ┌──────────────────────────────────────────┐
  +0    │  _reference : ref T   (8바이트)          │ ── 관리 포인터
        │      스택 주소 / 관리 힙 내부 주소 /      │    (GC가 내부 루트로 추적)
        │      비관리 메모리 주소 무엇이든 가능      │
        ├──────────────────────────────────────────┤
  +8    │  _length    : int     (4바이트)          │ ── 원소 개수 (바이트 수가 아니다)
        ├──────────────────────────────────────────┤
  +12   │  (패딩 4바이트)                          │ ── 정렬 요구(54.4절)
        └──────────────────────────────────────────┘
        Unsafe.SizeOf<Span<int>>()  ==  16
```

32비트에서는 포인터가 4바이트이므로 전체 8바이트다. 정렬 규칙 때문에 64비트에서 12바이트가 아니라 16바이트가 된다는 점은 54.4절의 필드 레이아웃 규칙 그대로다.

> **⚠️ `Length`는 원소 개수이지 바이트 수가 아니다**
>
> `Span<int>` 의 `Length`가 100이면 400바이트를 가리킨다. `Span<byte>`로 캐스팅하면(`MemoryMarshal.AsBytes`) `Length`는 400이 된다. 바이트 단위 오프셋과 원소 단위 오프셋을 섞으면 조용히 네 배 밖을 읽는다. 특히 비관리 메모리를 감쌀 때 `new Span<int>(ptr, byteCount)`라고 쓰는 실수가 흔하다 — **두 번째 인자는 원소 개수다.**

> **⚠️ `Length`가 `int`인 것은 설계 한계다**
>
> `_length`가 `int`이므로 `Span<T>`는 원소 21억 개를 넘을 수 없다. `Span<byte>`로는 2 GB가 상한이다. 그보다 큰 비관리 버퍼를 하나의 `Span`으로 감싸려는 시도는 실패한다 — `new Span<byte>(ptr, length)`에 `int` 범위를 넘는 값을 넣을 방법 자체가 없고, `long`을 `int`로 캐스팅해 넘기면 음수가 되어 `ArgumentOutOfRangeException`이 난다. 큰 영역은 여러 `Span`으로 나눠 순회해야 한다.

### 인덱서 — `ref T` 반환

`Span<T>`의 인덱서는 값이 아니라 **관리 포인터를 반환한다.**

```csharp
public ref T this[int index]
{
    [Intrinsic]
    get => ref Unsafe.Add(ref _reference, (nint)(uint)index);
}
```

이 한 줄에 세 가지가 들어 있다.

- **`ref T` 반환** — 원소를 복사하지 않는다. `Span<BigStruct>`에서 `span[i].Field = 3`이 원본을 바꾸는 이유다. 배열과 동일한 의미론이며, `List<T>`의 인덱서(값 반환)와는 다르다.
- **`(nint)(uint)index`** — `int`를 부호 없이 확장한 뒤 네이티브 정수로 만든다. 부호 확장이 아니라 영 확장을 강제해 32비트 인덱스 산술에서 부호 문제를 없앤다.
- **`[Intrinsic]`** — JIT가 이 메서드를 호출로 두지 않고 직접 주소 계산 명령으로 치환한다. 55장에서 본 JIT 인트린식이다.

경계 검사는 어디로 갔는가. 실제 소스에는 인덱서 앞에 `if ((uint)index >= (uint)_length) ThrowHelper.ThrowIndexOutOfRangeException();`에 해당하는 검사가 있다. `uint` 캐스팅 한 번으로 음수와 초과를 동시에 잡는 것은 배열 경계 검사와 같은 관용구다. 루프 안에서는 JIT의 경계 검사 제거(bounds check elimination)가 이 검사를 지운다 — 이것이 68.3절 성능 차이의 절반을 설명한다.

> **📌 `ref T` 반환이 만드는 미묘한 차이**
>
> ```csharp
> Span<int> s = new int[] { 1, 2, 3 };
> ref int r = ref s[0];   // 관리 포인터를 지역에 담는다
> r = 99;                 // s[0]이 99가 된다
> ```
> `List<int>`로는 이렇게 못 한다. 인덱서가 값을 반환하기 때문이다. 대신 `CollectionsMarshal.AsSpan(list)`로 내부 배열을 `Span`으로 꺼내면 같은 일이 된다. 다만 그 뒤 `list.Add`를 하면 내부 배열이 재할당되어 `Span`이 **낡은 배열**을 가리키게 된다. 이 위험은 68.13절에서 다시 다룬다.

### 생성 경로

`Span<T>`를 만드는 방법은 크게 네 가지다.

```csharp
int[] array = new int[64];
Span<int> a = array;                             // 1) 관리 배열 — 암시적 변환
Span<int> b = array.AsSpan(start: 8, length: 4); //    또는 AsSpan 확장 메서드
Span<int> c = stackalloc int[64];                // 2) 스택 — unsafe 불필요 (68.9절)

void* p = NativeMemory.Alloc(64);
Span<byte> d = new Span<byte>(p, 64);            // 3) 비관리 — unsafe 필요 (68.8절)

ref int r = ref array[0];
Span<int> e = MemoryMarshal.CreateSpan(ref r, 64); // 4) 임의의 관리 포인터에서

Span<int> x = [1, 2, 3, 4];                      // 5) 컬렉션 식 ※C# 12
```

> **📌 컬렉션 식이 `Span`에 특히 잘 맞는 이유**
>
> 컬렉션 식(`[...]`)은 컴파일러에게 **내부 표현을 고를 자유**를 준다. 대상이 `Span<T>`이고 원소 개수가 작으면 컴파일러가 배열을 만들지 않고 스택에 인라인 배열(68.10절)을 만들어 그것을 가리키는 `Span`을 넘길 수 있다. `new int[] {1,2,3,4}`는 무조건 힙 할당이지만 `[1,2,3,4]`는 그렇지 않을 수 있다는 뜻이다. **"할 수 있다"이지 "항상 그렇다"가 아니므로** 중요한 자리에서는 67.5절대로 `[MemoryDiagnoser]`로 확인해야 한다.

### 세 종류의 메모리를 하나의 타입으로

`Span<T>`의 실질적 가치는 "다양한 메모리 출처를 하나의 API로 다룬다"는 데 있다. 이것을 그림으로 정리하면 다음과 같다.

```text
    스택                     관리 힙                    비관리 힙
 ┌──────────────┐        ┌──────────────────┐      ┌──────────────────┐
 │ stackalloc   │        │  int[] 배열       │      │ NativeMemory.    │
 │ int[64]      │        │  ┌──┬──┬──┬──┐   │      │   Alloc(256)     │
 │ ┌──────────┐ │        │  │  │  │  │  │   │      │ Marshal.         │
 │ │0 1 2 ... │ │        │  └──┴──┴──┴──┘   │      │   AllocHGlobal   │
 │ └────▲─────┘ │        │      ▲           │      │ ┌──────▲───────┐ │
 └──────┼───────┘        └──────┼───────────┘      └────────┼───────┘ │
        │                       │                           │
        │  스택 주소             │  내부 포인터               │  원시 주소
        │                       │  (GC 추적 대상)            │  (GC 무시)
        └───────────┬───────────┴───────────────┬───────────┘
                    │                           │
              ┌─────▼───────────────────────────▼─────┐
              │        Span<T>  (ref struct)          │
              │  ┌──────────────┬──────────────────┐  │
              │  │ ref T _ref   │ int _length      │  │
              │  └──────────────┴──────────────────┘  │
              └───────────────────┬───────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │  동일한 소비 코드           │
                    │  span.Length / span[i] /   │
                    │  span.Slice(a,b) / foreach │
                    └────────────────────────────┘

    GC 관점:  스택 주소 → 추적하되 대상 객체 없음(무시)
              힙 내부 주소 → 내부 루트로 보고, 재배치 시 값도 갱신 (64.10절)
              비관리 주소 → 관리 힙 범위 밖이므로 Mark/Compact 모두 무시
```

이 그림이 `Span<T>`가 실제로 해결한 문제다. 같은 파싱 루틴을 세 벌 쓰지 않아도 된다.

> **📌 API 폭발이 실제로 어떻게 사라지는가**
>
> `Span` 이전에 "문자 시퀀스에서 정수를 파싱한다"는 요구를 모두 만족시키려면 이런 오버로드 집합이 필요했다.
>
> ```csharp
> int Parse(string input);
> int Parse(string input, int startIndex, int length);
> unsafe int Parse(char* input, int length);
> unsafe int Parse(char* input, int startIndex, int length);
> ```
>
> `Span`을 쓰면 하나로 끝난다.
>
> ```csharp
> int Parse(ReadOnlySpan<char> input);
> ```
>
> 그리고 이 하나가 위 네 가지 **전부와 `stackalloc` 버퍼와 배열 슬라이스까지** 받는다. .NET BCL의 수많은 API가 "spanify"된 것은 성능 이전에 이 단순화 때문이다.

### 왜 연속 메모리만인가

`Span<T>`는 필드가 주소와 길이뿐이므로 **연속된 블록 하나**만 표현할 수 있다. 흩어진 여러 블록은 표현할 수 없다.

이 요구가 실제로 있다 — 네트워크에서 도착한 데이터는 여러 버퍼에 나뉘어 들어온다. 그래서 `System.Buffers`에 `ReadOnlySequence<T>`가 따로 있다. 세그먼트의 연결 리스트를 감싸는 구조체이며, `System.IO.Pipelines`가 이것을 중심으로 설계돼 있다. 자세히는 72.1절에서 다룬다.

---

## 68.3 "slow span"과 "fast span" — 런타임 지원의 차이

### 왜 두 벌이 존재하는가

68.2절의 `Span<T>` 구현에는 전제가 하나 있었다. **`ref T`를 필드로 쓸 수 있어야 한다.** 그런데 이것은 C# 컴파일러만으로는 안 되는 일이다. GC가 그 필드를 내부 루트로 보고해야 하고, JIT이 그 필드를 통한 접근을 올바르게 컴파일해야 한다. 즉 **런타임 변경이 필요하다.**

`ref struct` 자체는 런타임 변경이 필요 없다. 대부분 C# 컴파일러 쪽 작업이고 IL 수준에서 기존 .NET Framework와도 호환된다. 하지만 byref 인스턴스 필드는 다르다.

그 결과 `Span<T>` 구현이 두 벌 존재하게 됐다.

| | "slow span" | "fast span" |
|---|---|---|
| 대상 | .NET Framework, .NET Core 2.1 미만 | .NET Core 2.1 이상 (현재의 .NET) |
| 배포 형태 | `System.Memory` NuGet 패키지 | 런타임 내장(`System.Private.CoreLib`) |
| byref 필드 | 없음 (런타임 미지원) | 있음 |
| 필드 구성 | `Pinnable<T> _pinnable` + `IntPtr _byteOffset` + `int _length` | `ref T _reference` + `int _length` |
| 64비트 크기 | 24바이트 | 16바이트 |
| 인덱서 | 분기 + 두 번의 오프셋 덧셈 | 포인터 산술 한 번, JIT 인트린식 |
| GC 관점 | **직접 객체 참조**(빠른 순회) | **내부 포인터**(plug 순회 필요) |

> **📌 .NET Framework에 fast span이 들어올 가능성**
>
> 사실상 없다. byref 인스턴스 필드는 런타임의 GC·JIT·타입 로더를 건드리는 변경이고, .NET Framework은 인플레이스 업데이트로 전 세계 기존 애플리케이션에 배포된다. 호환성 위험이 이득보다 크다는 판단이다. **.NET Framework에서 `System.Memory` 패키지를 참조해 `Span<T>`를 쓰는 것은 가능하지만, 그때 쓰는 것은 언제나 slow span이다.**

### slow span은 어떻게 byref 필드 없이 버티는가

핵심 아이디어는 **내부 포인터를 "객체 참조 + 바이트 오프셋" 두 조각으로 쪼개 저장하는 것**이다.

```csharp
// .NET Framework의 Span<T> 선언 (System.Memory 패키지)
public readonly ref partial struct Span<T>
{
    private readonly Pinnable<T> _pinnable;   // 객체 참조 (null이면 비관리 메모리)
    private readonly IntPtr _byteOffset;      // 객체 시작으로부터의 바이트 오프셋
    private readonly int _length;
}

// 임의의 객체를 Unsafe로 캐스팅해 데이터 시작 위치의 ref를 얻기 위해서만 존재하는 클래스
[StructLayout(LayoutKind.Sequential)]
internal sealed class Pinnable<T>
{
    public T Data;
}
```

객체 참조를 통째로 들고 있으므로 GC는 그 객체를 평범한 루트로 인식한다. GC 홀(GC hole) — 살아 있어야 할 객체가 수집되는 사고 — 이 생기지 않는다.

관리 배열을 감쌀 때의 생성자는 이렇다.

```csharp
public Span(T[] array, int start, int length)
{
    // ...
    _length = length;
    _pinnable = Unsafe.As<Pinnable<T>>(array);
    _byteOffset = SpanHelpers.PerTypeValues<T>.ArrayAdjustment.Add<T>(start);
}
```

`ArrayAdjustment`는 배열 객체의 시작에서 실제 원소 데이터가 시작하는 위치까지의 오프셋이다(54.7절의 배열 레이아웃 — 메서드 테이블 참조 + 길이 필드 다음). 슬라이싱하면 여기에 `start * sizeof(T)`가 더해진다.

비관리 메모리는 오히려 단순하다. 지켜야 할 객체가 없으므로 참조가 `null`이다.

```csharp
public unsafe Span(void* pointer, int length)
{
    // ...
    _length = length;
    _pinnable = null;
    _byteOffset = new IntPtr(pointer);   // 절대 주소를 오프셋 자리에 넣는다
}
```

인덱서에서 이 설계의 대가가 드러난다.

```csharp
public ref T this[int index]
{
    get
    {
        if (_pinnable == null)
            unsafe { return ref Unsafe.Add<T>(ref Unsafe.AsRef<T>(_byteOffset.ToPointer()), index); }
        else
            return ref Unsafe.Add<T>(ref Unsafe.AddByteOffset<T>(ref _pinnable.Data, _byteOffset), index);
    }
}
```

**원소 접근마다 분기 한 번과 덧셈 두 번**이다. fast span의 덧셈 한 번과 비교된다.

```csharp
// fast span — 생성도 접근도 단순하다
public Span(T[] array, int start, int length)
{
    // ...
    _reference = ref Unsafe.Add(ref MemoryMarshal.GetArrayDataReference(array),
                                (nint)(uint)start);   // 영 확장 강제
    _length = length;
}

public unsafe Span(void* pointer, int length)
{
    // ...
    _reference = ref *(T*)pointer;      // 같은 필드에 들어간다
    _length = length;
}
```

관리 배열이든 비관리 메모리든 **같은 필드 하나**에 들어간다. 분기가 사라진 이유다.

### 성능 차이 — 실제 숫자

`Pro .NET Memory Management`가 제시하는 벤치마크는 128바이트 `byte[]` 필드를 인덱서로 128번 읽어 합산하는 것이다. `SpanAccess`는 매 호출마다 `new Span<byte>(this.array)`를 만든 뒤 `span[i]`로 읽고, `ArrayAccess`는 `this.array[i]`로 직접 읽는다.

```csharp
[Benchmark]
public int SpanAccess()
{
    var span = new Span<byte>(this.array);
    int result = 0;
    for (int i = 0; i < 128; ++i) result += span[i];
    return result;
}
```

결과는 다음과 같다.

| Method | Job | Mean | Error | Allocated |
|---|---|---|---|---|
| SpanAccess | .NET 8.0 | 50.66 ns | 0.386 ns | - |
| ArrayAccess | .NET 8.0 | 63.23 ns | 0.540 ns | - |
| SpanAccess | .NET Framework 4.8 | 96.56 ns | 1.813 ns | - |
| ArrayAccess | .NET Framework 4.8 | 66.49 ns | 1.092 ns | - |

읽는 방법은 두 축이다.

- **같은 .NET 8 안에서 `Span`이 배열보다 빠르다.** 배열 인덱싱은 매번 `array` 필드를 다시 읽고 길이 필드를 읽어 경계 검사를 한다. `Span`은 참조와 길이가 이미 지역(레지스터)에 있다.
- **.NET Framework에서는 `Span`이 배열보다 45% 느리다.** slow span의 분기와 추가 덧셈, 그리고 24바이트 구조체를 값으로 넘기는 비용이다.

> **⚠️ 이 표를 "Span은 항상 배열보다 빠르다"로 읽으면 안 된다**
>
> 이 벤치마크는 **인덱서 접근만** 재는 극단적으로 인위적인 것이다. 실제 코드에서는 원소 접근 외의 일이 훨씬 많아 차이가 희석된다. 67.4절의 경고 그대로 — **이 표는 "런타임 지원 유무가 구현을 바꾼다"는 사실의 증거이지, 여러분의 코드에 대한 예측이 아니다.**

> **⚠️ .NET Framework 대상 코드에서 `Span`을 성능 목적으로 도입하면 손해를 볼 수 있다**
>
> `System.Memory` 패키지를 참조하면 .NET Framework에서도 `Span<T>`가 컴파일된다. 그래서 "일단 spanify하자"는 결정이 조용히 성능을 **떨어뜨리는** 경우가 생긴다. .NET Framework을 지원해야 한다면 `Span` 도입은 **API 단순화와 복사 제거** 목적으로만 하고, 인덱서를 뜨겁게 도는 루프에서는 반드시 두 프레임워크 모두에서 측정해야 한다. 멀티 타기팅 프로젝트라면 `[SimpleJob(RuntimeMoniker.Net48)]`과 `[SimpleJob(RuntimeMoniker.Net80)]`을 함께 붙여 한 표에서 본다(67.3절).

### 성능 차이의 나머지 절반 — JIT

구현 차이만이 전부가 아니다. .NET Core 계열 JIT은 .NET Framework의 JIT보다 **경계 검사 제거**를 훨씬 잘한다 — `for (int i = 0; i < span.Length; i++)`에서 `span.Length`가 루프 불변임을 인식해 검사를 통째로 지운다. 세 번째 요인은 크기다. **fast span은 16바이트, slow span은 24바이트**이고, 이 차이는 값으로 전달할 때마다 복사 비용이 된다.

> **📌 GC 부담은 오히려 slow span이 유리하다**
>
> 재미있는 역전이 있다. slow span은 **직접 객체 참조**를 담으므로 GC가 Mark 단계에서 곧바로 대상 객체를 찾는다. fast span은 **내부 포인터**를 담으므로, 64.6절에서 본 브릭 테이블과 plug 트리를 거쳐 대상 객체를 역산해야 한다 — 더 비싸다.
>
> 그래서 순수 GC 순회 비용만 보면 slow span이 낫다. 다만 이 차이가 문제가 되려면 동시에 살아 있는 `Span` 인스턴스가 엄청나게 많아야 하는데, `Span`은 필드가 될 수 없으므로 살아 있는 개수는 스택 프레임 수에 비례한다. **실무에서 관측 가능한 수준이 되기는 사실상 불가능하다.**

> **💡 이 절을 실무 판단으로 압축하면**
>
> - **.NET(Core 계열)만 대상이라면** — 이 절의 내용은 배경 지식이다. 그냥 `Span`을 쓰면 된다.
> - **.NET Framework을 함께 대상으로 한다면** — `Span`은 코드 단순화 도구로 쓰고, 뜨거운 인덱서 루프에는 배열 경로를 따로 두는 것을 고려하라.
> - **어느 쪽이든** — "`Span`으로 바꿨더니 느려졌다"는 보고가 오면 가장 먼저 확인할 것은 대상 프레임워크다.

---

## 68.4 슬라이싱, `CopyTo` / `TryCopyTo`, 스팬 내 검색

### 슬라이싱이 해결하는 문제

배열의 일부만 처리하는 메서드를 쓰는 방법은 전통적으로 두 가지였다.

```csharp
// 방법 1 — 원하는 부분을 복사한다. 할당 + 복사 비용.
int total = Sum(numbers.Skip(250).Take(500).ToArray());

// 방법 2 — 오프셋과 개수를 매개변수로 추가한다. 시그니처가 지저분해진다.
int Sum(int[] numbers, int offset, int count);
```

두 번째는 배열을 두 개 받는 메서드가 되면 매개변수가 여섯 개가 된다. 슬라이싱은 이 문제를 타입 수준에서 없앤다.

```csharp
int Sum(ReadOnlySpan<int> numbers)
{
    int total = 0;
    foreach (int i in numbers) total += i;
    return total;
}
```

배열을 그대로 넘길 수도 있고(암시적 변환), 일부만 넘길 수도 있다.

```csharp
var numbers = new int[1000];
for (int i = 0; i < numbers.Length; i++) numbers[i] = i;

int all    = Sum(numbers);                    // 배열 → ReadOnlySpan<int> 암시적 변환
int middle = Sum(numbers.AsSpan(250, 500));   // 가운데 500개
```

**메서드 본문은 한 글자도 바뀌지 않았다.** 매개변수 타입만 `int[]`에서 `ReadOnlySpan<int>`로 바꿨을 뿐이다.

> **📌 `Span<T>` → `ReadOnlySpan<T>` 암시적 변환은 있고 반대는 없다**
>
> 그래서 매개변수는 가능한 한 `ReadOnlySpan<T>`로 받아야 한다. `Span<T>`를 받는 메서드에는 `ReadOnlySpan<T>`를 넘길 수 없지만, `ReadOnlySpan<T>`를 받는 메서드에는 둘 다 넘길 수 있다. 68.13절 가이드라인의 핵심 항목 중 하나다.

### 슬라이싱 문법 세 가지

```csharp
Span<int> span = numbers;

int a = Sum(span.Slice(250, 500));     // 1) Slice 메서드 — 250부터 500개
int b = Sum(span.Slice(250));          //    250부터 끝까지
Console.WriteLine(span[^1]);           // 2) 인덱스·범위 연산자(C# 8) — 마지막 원소
int c = Sum(span[..10]);               //    앞 10개
int d = Sum(span[100..]);              //    100번째부터 끝까지
int e = Sum(span[^5..]);               //    마지막 5개
int f = Sum(numbers.AsSpan(250, 500)); // 3) 확장 메서드 — 배열·문자열에서 바로
```

세 방법 모두 **아무것도 할당하지 않는다.** 슬라이스는 참조와 길이만 다른 새 `Span` 구조체이며, 이 구조체는 스택(또는 레지스터)에 있다.

```text
원본 배열 (관리 힙)
  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
  │ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │
  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
    ▲           ▲               ▲
    │           │               │
span            span.Slice(3,4) span[7..]
_ref=&[0]       _ref=&[3]       _ref=&[7]
_length=10      _length=4       _length=3

세 Span 모두 같은 배열을 가리킨다. 복사본은 없다.
```

> **⚠️ 슬라이스는 뷰이지 스냅숏이 아니다**
>
> `Span<T>`(읽기 전용이 아닌 쪽)로 만든 슬라이스에 쓰면 **원본 배열이 바뀐다.** 그리고 다른 슬라이스가 겹치는 영역을 보고 있다면 그 슬라이스에서도 값이 바뀐 것으로 보인다. 배열을 인자로 넘길 때 "이 메서드가 내 배열을 고칠 수 있다"고 인식하는 만큼, 슬라이스에 대해서도 같은 경계심이 필요하다. 고치지 않을 것이라면 `ReadOnlySpan<T>`로 넘겨 의도를 타입에 적어라.

### `CopyTo`와 `TryCopyTo`

```csharp
Span<int> x = [1, 2, 3, 4];     // ※C# 12 컬렉션 식
Span<int> y = new int[4];
x.CopyTo(y);                    // y는 [1, 2, 3, 4]
```

슬라이싱과 결합하면 훨씬 쓸모 있어진다.

```csharp
Span<int> x = [1, 2, 3, 4];
Span<int> y = [10, 20, 30, 40];

x[..2].CopyTo(y[2..]);          // y는 [10, 20, 1, 2]
```

`CopyTo`와 `TryCopyTo`의 차이는 대상이 작을 때의 반응이다.

| 메서드 | 대상이 원본보다 짧을 때 | 반환 |
|---|---|---|
| `CopyTo(Span<T> destination)` | 예외를 던진다 (`ArgumentException`) | `void` |
| `TryCopyTo(Span<T> destination)` | **아무것도 복사하지 않고** 실패를 알린다 | `bool` |

`TryCopyTo`가 부분 복사를 하지 않는다는 점이 중요하다. 실패하면 대상은 손대지 않은 상태 그대로다.

> **📌 겹치는 영역 복사는 안전하다**
>
> `Span<T>.CopyTo`는 원본과 대상이 겹쳐도 올바른 결과를 낸다. 문서가 보장하는 의미론은 "원본 값들이 임시 위치에 있는 것처럼 동작한다" — C의 `memmove`와 같다. 배열을 왼쪽으로 한 칸 미는 코드를 안심하고 쓸 수 있다.
>
> ```csharp
> Span<byte> buffer = ...;
> buffer[1..].CopyTo(buffer);   // 한 칸 왼쪽으로 시프트. 겹치지만 정확하다.
> ```

> **⚠️ `Array.Copy`와 달리 원소 개수를 지정할 수 없다**
>
> `CopyTo`는 **원본 `Span` 전체**를 복사한다. "앞의 n개만"이라는 인자가 없다. 원본을 먼저 슬라이싱해야 한다 — `src[..n].CopyTo(dst)`. 이 차이를 모르고 `src.CopyTo(dst)`라고 쓰면 대상이 짧을 때 예외가 나고, 대상이 길면 의도보다 많이 덮어쓴다.

### 변경 메서드

`Span<T>` 자체와 `MemoryExtensions`가 제공하는 변경 계열은 다음과 같다.

| API | 하는 일 | 비고 |
|---|---|---|
| `Clear()` | 전체를 기본값으로 채운다 | 참조 타입 원소면 `null`로 — GC 관점에서 참조를 끊는다 |
| `Fill(T value)` | 전체를 지정 값으로 채운다 | 벡터화되어 있다 |
| `Reverse()` | 제자리 뒤집기 | `Array.Reverse`의 스팬판 |
| `Sort()` / `Sort(Comparison<T>)` | 제자리 정렬 ※.NET 5 | `MemoryExtensions.Sort` |
| `Replace(T old, T new)` ※.NET 8 | 값 치환 | 제자리 또는 대상 스팬으로 |
| `ToArray()` | 새 배열로 복사 | **할당한다** — 이름 그대로 |

> **⚠️ `Clear()`와 `Fill(default)`는 의도가 다르다**
>
> 결과 값은 같지만, 참조 타입을 담은 `Span`에서 `Clear()`는 "이 슬롯들이 더 이상 객체를 붙잡고 있지 않게 한다"는 의미다. 풀에 배열을 반납하기 전에 참조를 끊는 것은 GC 관점에서 실질적인 효과가 있다(69.3절). `ArrayPool<T>.Return`의 `clearArray` 인자가 존재하는 이유이기도 하다.

### 스팬 내 검색

검색 계열은 대부분 `System.MemoryExtensions`의 확장 메서드다. `Span<T>`나 `ReadOnlySpan<T>` 어느 쪽에도 붙고, 배열이나 문자열에 `.AsSpan()`을 붙이면 그대로 쓸 수 있다.

| API | 하는 일 | 도입 |
|---|---|---|
| `Contains(T)` | 포함 여부 | |
| `IndexOf(T)` / `IndexOf(ReadOnlySpan<T>)` | 첫 위치 (값 또는 부분 시퀀스) | |
| `LastIndexOf(...)` | 마지막 위치 | |
| `IndexOfAny(T, T)` / `IndexOfAny(ReadOnlySpan<T>)` | 여러 값 중 아무거나 | |
| `BinarySearch(T)` | 정렬된 스팬에서 이진 탐색 | |
| `StartsWith` / `EndsWith` | 접두·접미 일치 | |
| `SequenceEqual` / `SequenceCompareTo` | 내용 비교 | |
| `ContainsAny`, `ContainsAnyExcept` | 집합 포함 여부 | ※.NET 8 |
| `IndexOfAnyExcept`, `LastIndexOfAnyExcept` | 집합에 **없는** 첫/마지막 원소 | ※.NET 8 |
| `IndexOfAnyInRange`, `ContainsAnyInRange` | 값 범위 기반 | ※.NET 8 |
| `CommonPrefixLength` | 공통 접두 길이 | ※.NET 7 |

이 메서드들은 대부분 내부적으로 **벡터화**되어 있다. 직접 `for` 루프로 같은 일을 하면 거의 항상 느리다.

### `SearchValues<T>` ※.NET 8

같은 값 집합으로 여러 번 검색한다면 `System.Buffers.SearchValues<T>`를 쓴다.

```csharp
using System.Buffers;

ReadOnlySpan<char> span = "The quick brown fox jumps over the lazy dog.";
var vowels = SearchValues.Create("aeiou");

Console.WriteLine(span.IndexOfAny(vowels));   // 2
```

`SearchValues.Create`는 값 집합의 특성(개수, 범위, ASCII 여부)을 분석해 **그 집합에 최적화된 검색 구현을 고른다.** 비트맵, SIMD 셔플, 범위 비교 중 어느 것이 될지는 런타임이 정한다. 이 분석 비용을 생성 시점에 한 번만 내고 검색마다 재사용하는 것이 요점이다.

> **💡 `SearchValues`는 필드로 캐싱해야 의미가 있다**
>
> ```csharp
> // 이렇게 쓰면 이득이 없다 — 호출마다 분석 비용을 낸다
> bool HasVowel(ReadOnlySpan<char> s) => s.IndexOfAny(SearchValues.Create("aeiou")) >= 0;
>
> // 이렇게 써야 한다
> private static readonly SearchValues<char> Vowels = SearchValues.Create("aeiou");
> bool HasVowel(ReadOnlySpan<char> s) => s.IndexOfAny(Vowels) >= 0;
> ```
>
> `SearchValues<T>`는 클래스이므로 `static readonly` 필드에 담을 수 있다. 69.6절에서 이 타입의 내부와 실제 이득 폭을 더 다룬다.

> **⚠️ 검색 API의 반환값은 "원본 기준"이 아니라 "그 스팬 기준"이다**
>
> ```csharp
> ReadOnlySpan<char> s = "abcdef";
> int i = s[3..].IndexOf('e');   // 1이다. 4가 아니다.
> ```
> 슬라이스를 만들어 검색하면 인덱스는 슬라이스의 시작 기준이다. 원본 기준 위치가 필요하면 슬라이스 시작 오프셋을 직접 더해야 한다. **슬라이스를 중첩해 가며 파싱하는 코드에서 가장 흔한 버그가 이 오프셋 누락이다.** 파싱 루프는 "남은 부분(remainder)을 계속 잘라 나가는" 형태로 쓰고, 절대 위치가 필요하면 별도 카운터를 유지하는 편이 안전하다.

### `foreach`와 인터페이스 부재

`Span<T>`는 `IEnumerable<T>`를 구현하지 않는다. `ref struct`이므로 구현할 수 없다(68.1절). 그런데도 `foreach`는 된다 — 패턴 기반이기 때문이다.

이것이 실무에 남기는 결과는 명확하다.

> **⚠️ LINQ는 `Span`에 쓸 수 없다**
>
> `IEnumerable<T>`가 아니므로 `Where`, `Select`, `Sum`, `Any` 중 어느 것도 쓸 수 없다. 이것은 제약이지만, 관점을 바꾸면 **`Span`을 쓰는 목적 자체가 LINQ가 만드는 열거자 할당과 델리게이트 할당(63.9절)을 없애는 것**이므로 일관된 설계다. `Span`으로 옮기면서 LINQ가 필요해졌다면, 대개는 그 자리에 `Span`이 맞지 않는다는 신호다.
>
> 다만 `MemoryExtensions`가 자주 쓰는 것들(`Contains`, `IndexOf`, `SequenceEqual`, `Sort`, `Count` ※.NET 8)을 스팬용으로 제공하므로, 실제로 아쉬운 경우는 생각보다 적다.

---

## 68.5 텍스트를 스팬으로 다루기

### 문자열은 `ReadOnlySpan<char>`다

`string`은 UTF-16 코드 유닛의 연속된 블록이다(35.1절). 그래서 `ReadOnlySpan<char>`로 자연스럽게 표현된다. 변환은 암시적이거나 확장 메서드다.

```csharp
int CountWhitespace(ReadOnlySpan<char> s)
{
    int count = 0;
    foreach (char c in s)
        if (char.IsWhiteSpace(c)) count++;
    return count;
}

int x = CountWhitespace("Word1 Word2");                // 암시적 변환
int y = CountWhitespace(someString.AsSpan(20, 10));    // 부분 문자열 — 할당 없음
```

두 번째 줄이 이 절의 전부다. **`Substring(20, 10)`은 새 `string`을 할당하지만 `AsSpan(20, 10)`은 아무것도 할당하지 않는다.** 35.11절에서 "문자열 할당을 줄이는 기법"으로 소개했던 것의 정체가 이것이다.

> **⚠️ `Span<char>`가 아니라 `ReadOnlySpan<char>`인 이유**
>
> `string`은 불변이다. `AsSpan()`이 `Span<char>`를 돌려주면 그 불변성이 깨진다 — 인터닝된 리터럴을 통째로 바꿔 버릴 수 있다(35.5절). 그래서 `string.AsSpan()`은 반드시 `ReadOnlySpan<char>`를 반환한다.
>
> `MemoryMarshal`이나 `Unsafe.As`로 이 보호를 우회하는 것은 **가능하지만 절대 하면 안 된다.** 인터닝된 리터럴을 수정하면 같은 리터럴을 쓰는 프로그램의 다른 모든 곳이 바뀐다. 재현 불가능한 버그의 교과서적 사례다.

### `string`의 메서드 중 무엇이 있고 무엇이 없는가

`MemoryExtensions`가 `string`의 주요 메서드에 대응하는 스팬 버전을 제공한다.

```csharp
var span = "  This ".AsSpan();                           // ReadOnlySpan<char>
Console.WriteLine(span.Trim().Length);                   // 4
Console.WriteLine(span.TrimStart().StartsWith("This"));  // True
```

| `string` 메서드 | 스팬 대응 | 차이 |
|---|---|---|
| `Substring(i, n)` | `AsSpan(i, n)` / `span[i..(i+n)]` | 할당 없음 |
| `IndexOf(char)` | `span.IndexOf(char)` | 기본이 **서수 비교** |
| `StartsWith(string)` | `span.StartsWith(ReadOnlySpan<char>)` | 기본이 **서수 비교** |
| `Trim()` / `TrimStart()` / `TrimEnd()` | 동명 확장 메서드 | 공백 판정 규칙 동일 |
| `Equals(string, StringComparison)` | `span.Equals(other, StringComparison)` | 명시적 지정 가능 |
| `Contains(string)` | `span.Contains(other, StringComparison)` | |
| `ToUpper()` / `ToLower()` | `span.ToUpper(Span<char> dest, CultureInfo)` | **대상 스팬을 직접 줘야 한다** |
| `Split(char)` | (없었음) 이후 `MemoryExtensions.Split(...)` ※.NET 8 | `Span<Range>`에 결과를 쓴다 |
| `ToString()` | `span.ToString()` | **할당한다** — 되돌아가는 문이다 |

> **⚠️ 스팬의 `StartsWith`는 서수 비교, `string`의 `StartsWith`는 문화권 비교다**
>
> 이 차이는 실무에서 실제로 사고를 낸다. `string.StartsWith(string)`은 기본이 `StringComparison.CurrentCulture`이고, `MemoryExtensions.StartsWith`는 서수 비교다. 결합 문자·특수 문자가 섞이면 두 결과가 갈린다.
>
> 즉 `Substring` 기반 코드를 `AsSpan` 기반으로 "그냥 바꾸면" **비교 의미론이 조용히 달라진다.** 대부분의 경우 서수 비교가 오히려 옳은 선택이지만(35.4절), 그것은 "의도적으로 서수를 선택했을 때" 이야기다. 리팩터링 시에는 각 비교 지점이 서수여야 하는지 문화권 인식이어야 하는지 다시 판정해야 한다. 문화권 비교가 필요하면 `StringComparison`을 받는 오버로드를 명시적으로 쓴다.

> **⚠️ `ToUpper`가 대상 스팬을 요구하는 것은 불친절이 아니라 설계다**
>
> ```csharp
> ReadOnlySpan<char> src = "hello";
> Span<char> dest = stackalloc char[src.Length];
> src.ToUpper(dest, CultureInfo.InvariantCulture);
> ```
> `Span` API는 **어디에 결과를 둘지를 절대 스스로 정하지 않는다.** 정하는 순간 할당이 생기고, 그러면 `Span`을 쓰는 이유가 사라진다. 이 원칙은 `Utf8Formatter`, `TryFormat`, `Base64` 등 스팬 계열 API 전체에 일관되게 적용된다. **"결과를 담을 곳은 호출자가 준다"** — 이 한 문장이 스팬 API를 읽는 열쇠다.

### `Split`이 오래 없었던 이유

`string.Split`은 `string[]`을 반환한다. 스팬 버전이라면 `Span<char>[]`를 반환해야 하는데, **`ref struct`는 배열 원소가 될 수 없다**(68.1절). 그래서 직접 대응이 원리적으로 불가능했다.

.NET 8이 내놓은 답은 "스팬의 배열" 대신 **"범위(`Range`)의 스팬"** 이다.

```csharp
ReadOnlySpan<char> line = "alice,30,seoul";
Span<Range> parts = stackalloc Range[3];

int count = line.Split(parts, ',');       // ※.NET 8

for (int i = 0; i < count; i++)
{
    ReadOnlySpan<char> field = line[parts[i]];
    Console.WriteLine(field.ToString());
}
```

`Range`는 평범한 값 타입이므로 배열·스팬의 원소가 될 수 있다. 잘라 낸 조각은 호출자가 원본에 `Range`를 적용해 직접 만든다.

> **⚠️ `Split(Span<Range>, ...)`은 대상이 모자라면 나머지를 통째로 마지막 칸에 넣는다**
>
> 반환값은 채워진 개수다. 대상 `Span<Range>`가 필요한 조각 수보다 짧으면 **예외가 나지 않고**, 마지막 칸에 "남은 전부"가 들어간다. `string.Split(char[], int count)`의 동작과 같다. 필드 개수가 정확히 맞아야 하는 파서라면 반환값과 마지막 조각을 직접 검증해야 한다. 검증을 빼먹으면 `"a,b,c,d"`를 3칸으로 자를 때 세 번째 필드가 `"c,d"`가 되어 조용히 통과한다.
>
> 함께 제공되는 `SplitAny(Span<Range>, ReadOnlySpan<char> separators)`도 같은 규칙이다.

### 무할당 파싱 실전

원리를 다 모았으니 실제로 쓸 만한 파서를 하나 만든다. `key=value;key=value` 형태의 설정 문자열에서 특정 키의 정수 값을 꺼내되, **문자열을 단 하나도 할당하지 않는다.**

```csharp
using System;

static bool TryGetInt(ReadOnlySpan<char> config, ReadOnlySpan<char> key, out int value)
{
    value = 0;
    ReadOnlySpan<char> rest = config;

    while (!rest.IsEmpty)
    {
        // 1) 다음 항목 잘라내기 — 남은 부분을 계속 줄여 나가는 형태
        int semi = rest.IndexOf(';');
        ReadOnlySpan<char> entry = semi < 0 ? rest : rest[..semi];
        rest = semi < 0 ? ReadOnlySpan<char>.Empty : rest[(semi + 1)..];

        // 2) key=value 분리
        int eq = entry.IndexOf('=');
        if (eq < 0) continue;

        // 3) 키 비교 — 서수 비교, 할당 없음
        if (!entry[..eq].Trim().SequenceEqual(key)) continue;

        // 4) 숫자 파싱 — ReadOnlySpan<char>를 직접 받는 오버로드
        return int.TryParse(entry[(eq + 1)..].Trim(), out value);
    }
    return false;
}

// 사용
bool ok = TryGetInt("retries=3; timeout = 250 ;debug=0", "timeout", out int timeout);
// ok == true, timeout == 250
```

이 코드가 할당하는 힙 객체는 **0개다.** `entry`·`rest`는 전부 스택 위의 `Span` 구조체이고, `Trim()`은 슬라이싱이며, `SequenceEqual`은 내용만 비교하고, `int.TryParse(ReadOnlySpan<char>, out int)` 오버로드는 내부에서도 문자열을 만들지 않는다.

같은 일을 `string.Split`과 `Substring`으로 하면 항목 개수 + 필드 개수 + 배열 하나만큼 할당이 생긴다. 67.5절의 `[MemoryDiagnoser]`로 재면 `Allocated`가 정확히 그 차이만큼 벌어진다.

> **📌 CLR 기본 타입의 파싱·포매팅은 대부분 스팬 오버로드가 있다**
>
> `int.Parse` / `TryParse`, `double`, `decimal`, `DateTime`, `Guid`, `TimeSpan` — 거의 전부 `ReadOnlySpan<char>`를 받는 오버로드가 있다. 반대 방향으로는 `TryFormat(Span<char> destination, out int charsWritten, ...)`이 `ISpanFormattable`로 표준화되어 있다.
>
> ```csharp
> Span<char> buf = stackalloc char[16];
> if (value.TryFormat(buf, out int written))
>     Console.Out.Write(buf[..written]);   // string 없이 출력
> ```

### UTF-8을 직접 다루기

텍스트가 원래 UTF-8(네트워크, 파일, JSON)이라면 UTF-16 `string`으로 디코딩하는 것 자체가 낭비다. `System.Buffers.Text`가 바이트 스팬을 직접 다루는 도구를 제공한다.

| 타입 | 하는 일 |
|---|---|
| `Utf8Formatter.TryFormat` | `int`·`decimal`·`DateTime` 등을 `Span<byte>`에 UTF-8로 쓴다 |
| `Utf8Parser.TryParse` | `ReadOnlySpan<byte>`에서 값을 읽는다 |
| `Base64` | Base64 인코딩·디코딩을 스팬 사이에서 수행 |

.NET 8부터는 이 기능이 타입 자체로 올라왔다. 숫자·날짜 타입들이 `IUtf8SpanFormattable`을 구현하고, `IUtf8SpanParsable<TSelf>`를 통해 파싱된다. 후자는 C# 12의 정적 추상 인터페이스 멤버를 활용한다.

```csharp
// ※.NET 8 — string도 char[]도 거치지 않는다
Span<byte> utf8 = stackalloc byte[32];
if (12345.TryFormat(utf8, out int bytesWritten))      // IUtf8SpanFormattable
    stream.Write(utf8[..bytesWritten]);

int parsed = int.Parse("12345"u8);                    // ※C# 11 UTF-8 리터럴
```

`"..."u8` 접미사는 C# 11이 도입한 **UTF-8 문자열 리터럴**이다. 타입은 `ReadOnlySpan<byte>`이고, 데이터는 어셈블리의 정적 데이터 영역에 있으므로 런타임 할당이 전혀 없다.

> **💡 `"..."u8`이 `Encoding.UTF8.GetBytes("...")`보다 나은 이유는 속도가 아니다**
>
> `GetBytes`는 호출할 때마다 `byte[]`를 **새로** 만든다. 상수 구분자·헤더 이름을 비교하는 코드에서 이것은 순수한 낭비다. `"Content-Type"u8`은 컴파일 타임에 바이트로 굳어져 어셈블리에 박히고, 런타임에는 그 위치를 가리키는 `ReadOnlySpan<byte>`만 만들어진다. **`static readonly byte[]` 필드로 캐싱하던 관행을 대체한다.** 69.7절에서 UTF-8 파이프라인 전체를 다룬다.

> **⚠️ `"..."u8`의 `Length`에는 널 종결 바이트가 포함되지 않는다**
>
> `"abc"u8`의 `Length`는 3이다. 컴파일러가 상호 운용 편의를 위해 데이터 뒤에 널 바이트를 하나 더 배치하지만 **`Length`에는 들어가지 않는다.** 스팬만 보고 다루는 한 문제가 없다. 다만 이 널 종결에 의존해 문자열 포인터를 기대하는 네이티브 함수에 넘기는 코드는 명세가 보장하는 동작에 기대는 것이 아니므로 피해야 한다. 60장의 마샬링 규칙을 따르는 편이 안전하다.

### 줄 단위 열거 ※.NET 6

`ReadOnlySpan<char>.EnumerateLines()`는 문자열을 줄 단위로 자르되 아무것도 할당하지 않는다.

```csharp
string text = File.ReadAllText(path);        // 이 한 번만 할당한다
foreach (ReadOnlySpan<char> line in text.AsSpan().EnumerateLines())
{
    if (line.IsEmpty || line[0] == '#') continue;
    // line은 ReadOnlySpan<char> — 원본 문자열의 슬라이스다
}
```

반환 타입 `SpanLineEnumerator`는 `ref struct`이며, `\r\n`·`\n`·`\r`은 물론 유니코드가 정의한 줄 구분자(LINE SEPARATOR, PARAGRAPH SEPARATOR, NEXT LINE 등)까지 처리한다. 같은 계열로 `EnumerateRunes()`가 있어 서로게이트 페어를 코드 포인트 단위로 순회한다(35.2절). 68.7절에서 이런 열거자를 직접 만드는 방법을 본다.

---

## 68.6 `Memory<T>`, `IMemoryOwner<T>`, `MemoryManager<T>`

### `Span<T>`가 못 가는 곳

`ref struct` 제약(68.1절)은 안전을 위한 것이지만, 그 대가로 `Span<T>`는 현대 C# 코드의 상당 부분에 들어갈 수 없다.

```csharp
public static async Task<string> FetchAsync(ReadOnlySpan<char> url)  // CS4012
{
    var client = new HttpClient();
    return await client.GetStringAsync(url.ToString());
}
```

비동기 메서드의 매개변수와 지역 변수는 컴파일러가 만드는 상태 기계의 **필드**가 된다. 그 상태 기계는 `await`가 실제로 대기하면 힙에 박싱된다. 반복자도, 람다 캡처도 같은 구조다.

`Memory<T>`는 이 빈틈을 메우기 위해 만들어졌다. **`ref struct`가 아닌 평범한 구조체**이므로 필드가 될 수 있고, 상태 기계에 들어갈 수 있고, 람다가 캡처할 수 있다. 대신 스택 메모리는 감쌀 수 없다.

```csharp
public static async Task<string> FetchAsync(ReadOnlyMemory<char> url)   // OK
{
    var client = new HttpClient();
    return await client.GetStringAsync(url.ToString());
}
```

### 내부 구조 — 왜 포인터를 못 쓰는가

`Memory<T>`의 설계 제약을 순서대로 따라가면 필드 구성이 결정된다.

1. **힙에 살 수 있어야 한다.** 그러므로 관리 포인터를 필드로 담을 수 없다 — 그것이 애초에 `ref struct`를 만든 이유였다.
2. **힙 객체는 참조로만 표현된다.** 내부 포인터가 힙에 살 수 없으니, "객체 참조 + 오프셋"으로 내부 위치를 표현하는 수밖에 없다.
3. **스택 메모리는 지원하지 않아도 된다.** `Span`이 그 역할을 맡는다.
4. **비관리 메모리는 명시적 해제가 필요하다.** 그러므로 소유자(owner) 객체를 통해 간접적으로 표현한다.

결과는 이렇다.

```csharp
public readonly struct Memory<T>
{
    private readonly object _object;   // 배열 / string / MemoryManager<T>
    private readonly int _index;
    private readonly int _length;
}

public Memory(T[] array, int start, int length)
{
    // ...
    _object = array;
    _index = start;
    _length = length;
}
```

```text
Memory<T>의 내부 (64비트 기준 16바이트)

  ┌───────────────────────────────────────────────────────────────┐
  │ _object : object  (8바이트)                                   │
  │    ├── T[]              → 배열의 _index 번째부터              │
  │    ├── string           → ReadOnlyMemory<char>일 때만          │
  │    └── MemoryManager<T> → 비관리 메모리 등, 소유자에게 위임    │
  ├───────────────────────────────────────────────────────────────┤
  │ _index  : int  (4바이트)   시작 오프셋 (원소 단위)             │
  ├───────────────────────────────────────────────────────────────┤
  │ _length : int  (4바이트)   길이 (원소 단위)                    │
  └───────────────────────────────────────────────────────────────┘

                        .Span 속성 접근 시
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  _object이 T[]          _object이 string       _object이 MemoryManager<T>
  배열 데이터 시작 +      문자 데이터 시작 +      manager.GetSpan()을 호출하고
  _index 위치의 ref      _index 위치의 ref      _index/_length로 슬라이스
        └──────────────────────┼──────────────────────┘
                               ▼
                    Span<T> { ref T, int }
                    (여기서 처음 관리 포인터가 만들어진다)
```

`Span` 속성은 개념적으로 `_object`의 실제 타입을 판별해 분기한다 — `MemoryManager<T>`이면 소유자의 `GetSpan()`에 위임하고, `string`이면 문자 데이터의 슬라이스를, 배열이면 배열 데이터의 슬라이스를 `Span<T>`로 만들어 돌려준다. 실제 구현은 이보다 훨씬 저수준이지만(타입 검사를 비트 플래그로 대체하는 등) 구조는 같다.

> **⚠️ `Memory<T>`에는 인덱서가 없다**
>
> `memory[0]`은 컴파일되지 않는다. 원소에 접근하려면 반드시 `memory.Span[0]`을 거쳐야 한다. 의도적인 설계다 — 인덱서를 제공하면 접근마다 위의 분기를 다시 타야 하고, 이는 `Span` 인덱서보다 몇 배 비싸다. **"루프 밖에서 `Span`을 한 번 뽑고 루프 안에서는 그것을 쓴다"** 가 올바른 사용법이다.
>
> ```csharp
> // 나쁨 — 반복마다 Span 속성 호출
> for (int i = 0; i < memory.Length; i++) Process(memory.Span[i]);
>
> // 좋음
> Span<byte> span = memory.Span;
> for (int i = 0; i < span.Length; i++) Process(span[i]);
> ```
> 물론 `await` 사이에 걸치는 자리에서는 `Span` 지역 변수를 유지할 수 없으므로(※C# 13에서도 `await` 경계는 못 넘는다), 각 동기 구간 안에서만 뽑아 써야 한다.

> **📌 `Memory<T>`는 "스팬 공장"이다**
>
> `Memory<T>`의 저장소는 직접 노출되지 않는다. 할 수 있는 일은 세 가지뿐이다.
>
> - `Span` 속성으로 `Span<T>`를 얻어 **지역적으로** 사용한다
> - `ToArray()` / `ToString()`으로 내용을 꺼낸다 — **할당한다**
> - `Slice(...)` 또는 범위 연산자로 잘라 낸다 — 할당하지 않는다
>
> 그래서 `Memory<T>`는 "메모리를 담는 상자"라기보다 **"필요할 때 `Span`을 찍어 내는 공장"** 으로 보는 편이 정확하다.

### 네 가지 타입의 선택 결정표

이제 네 타입이 다 나왔다. 어느 것을 쓸지 판정하는 표다.

| | `Span<T>` | `ReadOnlySpan<T>` | `Memory<T>` | `ReadOnlyMemory<T>` |
|---|---|---|---|---|
| 종류 | `ref struct` | `readonly ref struct` | `readonly struct` | `readonly struct` |
| 필드로 저장 | 불가(다른 `ref struct` 안은 가능) | 불가(동일) | **가능** | **가능** |
| `async`/반복자/람다 | 불가(※C# 13에서 경계 미포함 시 가능) | 동일 | **가능** | **가능** |
| 배열 원소·제네릭 인수 | 불가(※C# 13 `allows ref struct`) | 동일 | **가능** | **가능** |
| 스택 메모리 감싸기 | **가능** | **가능** | 불가 | 불가 |
| 비관리 메모리 감싸기 | **직접 가능** | **직접 가능** | `MemoryManager<T>` 경유 | `MemoryManager<T>` 경유 |
| 인덱서 | `ref T` 반환 | `ref readonly T` 반환 | **없음** (`.Span` 경유) | **없음** (`.Span` 경유) |
| 쓰기 | 가능 | 불가 | 가능 | 불가 |
| 원소 접근 비용 | 가장 낮음 | 가장 낮음 | `.Span` 한 번 + 스팬 비용 | 동일 |
| 서로 변환 | → `ReadOnlySpan<T>` 암시적 | — | → `Span<T>`(`.Span`), → `ReadOnlyMemory<T>` 암시적 | → `ReadOnlySpan<T>`(`.Span`) |

**결정 순서는 두 질문이다.** 첫째, `await`·`yield`·람다 캡처·필드 저장이 필요한가 — 필요하면 `Memory` 계열, 아니면 `Span` 계열. 둘째, 호출된 쪽이 내용을 바꿔야 하는가 — 아니면 `ReadOnly` 접두사를 붙인다. 기본값은 `ReadOnlySpan<T>`이고, 다른 것을 고를 이유가 생겼을 때만 바꾼다.

> **⚠️ `Memory<T>` → `Span<T>`는 되지만 `Span<T>` → `Memory<T>`는 안 된다**
>
> `Span<T>`가 스택 메모리를 가리키고 있을 수 있고, 그 경우 `Memory<T>`로 승격하면 힙으로 새어 나갈 수 있기 때문이다.
>
> 이 비대칭이 **API 설계 규칙 하나를 강제한다.** 매개변수를 `Span<T>`로 받으면 호출자는 `Memory<T>`도 배열도 `stackalloc`도 넘길 수 있다. 매개변수를 `Memory<T>`로 받으면 호출자는 `stackalloc` 버퍼를 넘길 방법이 없다. **선택권이 있다면 `Span`으로 받아라.** 같은 이유로 `Span<T>`보다 `ReadOnlySpan<T>`가 낫다.

### `IMemoryOwner<T>` — 수명 소유권

`Memory<T>`가 감싸는 메모리의 수명은 누가 관리하는가.

- **관리 배열이라면** — 아무도 관리할 필요가 없다. GC가 알아서 한다. `Memory<T>` 인스턴스가 모두 죽으면 배열도 수집된다.
- **풀에서 빌린 배열이라면** — 언젠가 반납해야 한다.
- **비관리 메모리라면** — 언젠가 해제해야 한다.

뒤의 두 경우 때문에 모든 `Memory<T>`를 `IDisposable`로 만들 수는 없다. 그래서 **소유권을 별도 타입으로 분리**했다.

```csharp
public interface IMemoryOwner<T> : IDisposable
{
    Memory<T> Memory { get; }
}
```

의미는 이름 그대로다. **`IMemoryOwner<T>` 인스턴스를 들고 있는 쪽이 그 메모리의 소유자이고, `Dispose`를 호출할 책임이 있다.**

```csharp
// 소유자가 메서드인 경우
using (IMemoryOwner<int> owner = MemoryPool<int>.Shared.Rent(128))
{
    Memory<int> memory = owner.Memory;
    ConsumeMemory(memory);
    ConsumeSpan(memory.Span);
}   // 여기서 Dispose — 풀에 반납된다
```

```csharp
// 소유자가 타입인 경우 — 그 타입도 IDisposable이어야 한다
public class Worker : IDisposable
{
    private readonly IMemoryOwner<byte> _memoryOwner;

    public Worker(IMemoryOwner<byte> memoryOwner)   // 생성자가 소유권을 넘겨받는다
    {
        _memoryOwner = memoryOwner;
    }

    public void UseMemory()
    {
        ConsumeMemory(_memoryOwner.Memory);
        ConsumeSpan(_memoryOwner.Memory.Span);
    }

    public void Dispose() => _memoryOwner?.Dispose();
}
```

> **⚠️ 소유권 없이 풀 메모리를 `Memory<T>`로 넘기면 반납 시점을 알 수 없다**
>
> ```csharp
> Memory<int> pooled = new Memory<int>(ArrayPool<int>.Shared.Rent(128));
> await Consume(pooled);
> ArrayPool<int>.Shared.Return(/* 무엇을? */);
> ```
>
> 문제가 두 겹이다. 첫째, `Memory<T>`에서 원래 배열을 되찾을 직접적인 방법이 없다. 둘째 — 그리고 이쪽이 더 위험하다 — **`Consume`이 그 `Memory<T>`를 필드에 저장했다면** `await`가 끝난 뒤에도 살아 있다. `Memory<T>`는 힙에 갈 수 있으므로 얼마든지 가능한 일이다. 반납한 배열을 누군가 계속 읽고 쓰면, 그 배열을 새로 빌려 간 다른 코드와 **데이터가 섞인다.**
>
> `IMemoryOwner<T>`는 이 문제를 **"소유자는 언제나 한 명"** 이라는 규약으로 푼다. 규약이지 강제가 아니므로 팀 안에서 명시적으로 합의해야 한다.

> **💡 소유권 이전을 시그니처로 표현하라**
>
> `IMemoryOwner<T>`를 매개변수로 받는 메서드나 생성자는 **소유권을 넘겨받는 것으로 간주한다.** 그러니 그 타입이 `Dispose`를 부르거나, 다시 누군가에게 넘겨야 한다. 반대로 "잠깐 쓰고 돌려줄 뿐"이라면 `IMemoryOwner<T>`가 아니라 `Memory<T>`나 `Span<T>`를 받아라. **소유권을 넘기지 않는데 소유자 타입을 받는 시그니처가 사고의 근원이다.**

### `MemoryPool<T>`와 `MemoryManager<T>`

세 타입의 관계를 정리하면 이렇다.

```text
   ┌─────────────────────────────────────────────────────────────────┐
   │  MemoryPool<T>            (abstract class, System.Buffers)      │
   │   - Shared : 기본 구현(ArrayMemoryPool<T>)                       │
   │   - Rent(minBufferSize) → IMemoryOwner<T>                       │
   └───────────────────────────┬─────────────────────────────────────┘
                               │ 만든다
                               ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  IMemoryOwner<T> : IDisposable                                  │
   │   - Memory : Memory<T>                                          │
   │   - Dispose() : 자원 반납/해제                                   │
   └───────────────────────────┬─────────────────────────────────────┘
                               │ 구현체 중 하나가
                               ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  MemoryManager<T> : IMemoryOwner<T>, IPinnable   (abstract)     │
   │   - GetSpan()            : Span<T>       (필수 구현)             │
   │   - Pin(int elementIndex): MemoryHandle  (필수 구현)             │
   │   - Unpin()                              (필수 구현)             │
   │   - CreateMemory(...)    : Memory<T>     (보호 헬퍼)             │
   └─────────────────────────────────────────────────────────────────┘
              ▲                                   ▲
              │                                   │
   배열 기반 단순 소유자              비관리 메모리·매핑 파일·
   (풀 반납만 하면 된다 →             GPU 버퍼 등 특수 저장소
    MemoryManager까지 갈 필요 없음)   (직접 상속해서 만든다)
```

`MemoryPool<T>.Shared`는 내부적으로 `ArrayPool<T>.Shared`를 감싼다. `Rent`가 돌려주는 것은 생성자에서 배열을 빌리고 `Dispose`에서 반납하는 단순한 `IMemoryOwner<T>` 구현이다.

**`MemoryManager<T>`는 `Memory<T>`가 배열도 문자열도 아닌 것을 가리켜야 할 때 쓴다.** 비관리 메모리가 대표적이다.

```csharp
unsafe class NativeMemoryManager : MemoryManager<byte>
{
    private readonly int _length;
    private void* _ptr;

    public NativeMemoryManager(int length)
    {
        _length = length;
        _ptr = NativeMemory.Alloc((nuint)length);
    }

    public override Span<byte> GetSpan() => new Span<byte>(_ptr, _length);

    // CreateMemory는 "this를 _object로 삼는 Memory<T>"를 만들어 준다
    public override Memory<byte> Memory => CreateMemory(_length);

    public override MemoryHandle Pin(int i = 0) => new MemoryHandle((byte*)_ptr + i);
    public override void Unpin() { }                       // 이미 고정되어 있다

    protected override void Dispose(bool disposing)
    {
        if (_ptr != null) { NativeMemory.Free(_ptr); _ptr = null; }
    }
}
```

비관리 메모리는 GC가 옮기지 않으므로 `Pin`이 사실상 아무 일도 하지 않는다. 반면 관리 배열을 감싸는 매니저라면 `Pin`에서 `GCHandle`로 고정하고 `Unpin`에서 풀어야 한다(60.8절).

> **📌 `Memory<T>.Pin()`과 `MemoryHandle`**
>
> P/Invoke에 넘기려면 메모리가 움직이지 않아야 한다. `Memory<T>.Pin()`이 `MemoryHandle`을 돌려주고, 이것을 `Dispose`하면 고정이 풀린다.
>
> ```csharp
> using (MemoryHandle handle = memory.Pin())
> {
>     NativeCall((byte*)handle.Pointer, memory.Length);
> }
> ```
>
> 대상이 배열이나 문자열이면 내부적으로 `GCHandle`로 고정하고, `MemoryManager<T>`가 소유자이면 그 매니저의 `Pin`/`Unpin`이 호출된다. **고정은 GC의 압축을 방해하므로(64.7절) 가능한 한 짧게 유지해야 한다.**

### 배열만 받는 옛 API와 만났을 때

`Stream.WriteAsync`처럼 `Memory<T>` 오버로드가 없는(또는 없던) API에 넘겨야 한다면 `MemoryMarshal.TryGetArray`로 원래 배열을 되찾아 볼 수 있다.

```csharp
private Task FlushAsync(out byte[] sharedBuffer)
{
    sharedBuffer = null;
    if (MemoryMarshal.TryGetArray<byte>(_memoryOwner.Memory, out ArraySegment<byte> array))
        // 운이 좋다 — 저장소가 배열이었다. 복사 없음.
        return _stream.WriteAsync(array.Array, array.Offset, _writeOffset);

    // 배열이 아니다(비관리 메모리 등). 임시 배열로 복사할 수밖에 없다.
    sharedBuffer = ArrayPool<byte>.Shared.Rent(_writeOffset);
    _memoryOwner.Memory.Span[.._writeOffset].CopyTo(sharedBuffer);
    return _stream.WriteAsync(sharedBuffer, 0, _writeOffset);
}
```

`out` 매개변수로 빌린 배열을 호출자에게 돌려주는 것이 어색해 보이지만, 비동기 쓰기가 끝난 **뒤에** 반납해야 하므로 이 메서드 안에서 반납할 수 없다. 위 메서드가 `private`이므로 호출자를 전부 통제할 수 있어 성립하는 설계다.

> **⚠️ 빌린 버퍼를 `public` 메서드의 `out`으로 내보내지 마라**
>
> 위 패턴은 **`private`이라서** 허용된다. 공개 API가 풀에서 빌린 배열을 밖으로 내보내면, 반납 책임이 호출자에게 넘어가는데 그 계약을 시그니처가 표현하지 못한다. 반납을 잊으면 풀이 말라 버리고(성능 저하로만 나타난다), 두 번 반납하면 같은 배열이 두 곳에 동시에 대여되어 데이터가 섞인다 — **후자는 재현이 극도로 어려운 종류의 버그다.** 공개 API라면 `IMemoryOwner<T>`를 돌려주거나, 호출자가 준 버퍼에 쓰는 형태로 설계하라.

> **💡 라이브러리를 만든다면 버퍼를 받아라**
>
> 직렬화기·인코더·파서처럼 메모리를 많이 쓰는 컴포넌트는 **외부 버퍼나 풀링 메커니즘을 받아들이는 옵션**을 제공하는 것이 좋은 설계다. 그래야 사용자가 자기 애플리케이션의 성능 요구에 맞는 전략을 꽂아 넣을 수 있다. `IMemoryOwner<T>`를 생성자에서 받는 형태가 가장 흔한 관용구다.

---

## 68.7 전방 전용 열거자(forward-only enumerator) 패턴

### 문제 — `Split`을 무할당으로 만들려면

68.5절에서 스팬의 배열을 만들 수 없다는 것을 봤다. 68.6절은 `ReadOnlyMemory<char>`를 쓰면 우회할 수 있음을 알려준다.

```csharp
IEnumerable<ReadOnlyMemory<char>> Split(ReadOnlyMemory<char> input)
{
    int wordStart = 0;
    for (int i = 0; i <= input.Length; i++)
        if (i == input.Length || char.IsWhiteSpace(input.Span[i]))
        {
            yield return input[wordStart..i];   // 범위 연산자로 슬라이싱
            wordStart = i + 1;
        }
}
```

`string.Split`보다는 낫다 — 단어마다 새 `string`을 만드는 대신 원본의 슬라이스를 돌려준다. 하지만 대가가 있다.

- `ReadOnlyMemory<char>`이므로 **스택·비관리 메모리를 감쌀 수 없다**
- `yield return`이므로 반복자 상태 기계 객체가 **힙에 하나 할당된다**
- `IEnumerable<T>`이므로 `GetEnumerator()`가 **또 하나 할당한다**(63.9절)

### 중간 단계 — `Range` 배열 반환

`Range`는 값 타입이므로 배열에 담을 수 있다. 그래서 `Range[] Split(ReadOnlySpan<char> input)`처럼 조각의 **위치만** 돌려주고, 호출자가 `source[range]`로 직접 잘라 쓰게 할 수 있다.

```csharp
ReadOnlySpan<char> source = "The quick brown fox";
foreach (Range range in Split(source))
{
    ReadOnlySpan<char> wordSpan = source[range];
}
```

`ReadOnlySpan<char>`를 그대로 쓸 수 있게 됐다. 그러나 그 `Split` 구현 안에는 여전히 **`List<Range>` 하나, 내부 배열 하나(성장하면 여러 개), `ToArray()`가 만드는 배열 하나** — 최소 두 번의 할당과 한 번의 메모리 복사가 남는다. 할당을 없애려고 시작한 일인데 할당이 남아 있다.

(.NET 8의 `MemoryExtensions.Split(Span<Range>, char)`는 호출자가 `Span<Range>`를 주므로 이 문제를 없앤다. 하지만 조각 개수의 상한을 미리 알아야 한다.)

### 해답 — `ref struct` 열거자

할당을 완전히 없애려면 리스트도 배열도 만들지 않고, **하나씩 만들어 하나씩 넘겨줘야 한다.** 열거자다. 그리고 그 열거자를 `ref struct`로 만들면 힙 할당이 0이 된다.

C#의 `foreach`가 인터페이스가 아니라 패턴을 본다는 사실(68.4절)이 여기서 결정적으로 쓰인다. 필요한 것은 다음뿐이다.

- 열거 대상에 `GetEnumerator()` 메서드
- 그 반환값에 `Current` 속성과 `bool MoveNext()` 메서드

`IEnumerable<T>`도 `IEnumerator<T>`도 구현하지 않는다 — `ref struct`이므로 구현할 수도 없다.

```csharp
// _input이 ref struct이므로 이 타입도 ref struct여야 한다
public readonly ref struct CharSpanSplitter
{
    readonly ReadOnlySpan<char> _input;

    public CharSpanSplitter(ReadOnlySpan<char> input) => _input = input;

    public Enumerator GetEnumerator() => new Enumerator(_input);

    public ref struct Enumerator          // 전방 전용 열거자
    {
        readonly ReadOnlySpan<char> _input;
        int _wordPos;

        public ReadOnlySpan<char> Current { get; private set; }

        public Enumerator(ReadOnlySpan<char> input)
        {
            _input = input;
            _wordPos = 0;
            Current = default;
        }

        public bool MoveNext()
        {
            for (int i = _wordPos; i <= _input.Length; i++)
                if (i == _input.Length || char.IsWhiteSpace(_input[i]))
                {
                    Current = _input[_wordPos..i];
                    _wordPos = i + 1;
                    return true;
                }
            return false;
        }
    }
}

public static class CharSpanExtensions
{
    public static CharSpanSplitter Split(this ReadOnlySpan<char> input)
        => new CharSpanSplitter(input);

    public static CharSpanSplitter Split(this Span<char> input)
        => new CharSpanSplitter(input);
}
```

사용은 평범한 `foreach`다.

```csharp
var span = "the quick brown fox".AsSpan();
foreach (var word in span.Split())
{
    // word는 ReadOnlySpan<char>이고, 원본의 슬라이스다
}
```

**힙 할당은 0이다.** `CharSpanSplitter`도 `Enumerator`도 `ref struct`이므로 스택(또는 레지스터)에만 존재한다. 그리고 `Current`가 `ReadOnlySpan<char>`이므로 이 열거자는 배열·`stackalloc`·비관리 메모리 어느 것을 감싼 스팬에도 그대로 동작한다.

> **📌 왜 `readonly ref struct`인가**
>
> `CharSpanSplitter`는 필드가 `_input` 하나뿐이고 바뀌지 않으므로 `readonly`를 붙였다. 16.5절에서 본 대로 `readonly`는 방어적 복사를 없앤다. 반면 `Enumerator`는 `_wordPos`와 `Current`가 바뀌므로 `readonly`를 붙일 수 없다. **열거자는 본질적으로 가변 상태다** — 이것이 이 패턴에서 `readonly`가 바깥에만 붙는 이유다.

> **⚠️ 이 열거자는 되감을 수 없고 재사용할 수 없다**
>
> "전방 전용"이라는 이름 그대로다. `Reset()`이 없고, 한 번 순회한 열거자는 끝난 상태로 남는다. 같은 데이터를 두 번 순회하려면 `GetEnumerator()`를 다시 호출해야 한다 — `foreach`를 두 번 쓰면 자동으로 그렇게 된다. `CharSpanSplitter`가 `readonly`이고 상태를 갖지 않으므로 안전하다.
>
> 반대로 **열거자 구조체를 변수에 담아 돌려쓰는 것은 위험하다.** 구조체이므로 대입할 때마다 복사되고, 복사본의 진행 상태는 원본과 별개다.
> ```csharp
> var e = span.Split().GetEnumerator();
> var e2 = e;          // 복사본 — 이제 두 열거자가 독립적으로 움직인다
> e.MoveNext();
> // e2는 여전히 처음 상태다
> ```

> **⚠️ `foreach` 변수를 루프 밖으로 내보낼 수 없다**
>
> ```csharp
> ReadOnlySpan<char> found = default;
> foreach (var word in span.Split())
>     if (word.SequenceEqual("fox")) { found = word; break; }
> // found는 여기서 사용할 수 있다 — span이 아직 살아 있다면
> ```
> 이 코드는 컴파일된다. 하지만 `span`이 `stackalloc` 버퍼를 가리켰고 그 버퍼가 이미 범위를 벗어났다면 위험하다. 컴파일러의 이스케이프 분석(68.11절)이 대부분의 경우를 잡아 주지만, **`Span`을 지역에 담아 두는 코드는 언제나 "가리키는 대상이 아직 살아 있는가"를 스스로 확인해야 한다.**

### 추상화를 포기한 대가

이 패턴이 무료는 아니다.

| 잃는 것 | 이유 |
|---|---|
| LINQ 사용 | `IEnumerable<T>`가 아니다 |
| 다형성 — 여러 열거자를 하나의 타입으로 다루기 | 인터페이스로 변환할 수 없다 |
| `IEnumerable<T>`를 받는 기존 API에 전달 | 동일 |
| 열거자를 필드에 저장 | `ref struct`다 |
| 코드 간결성 | `yield return` 세 줄이 클래스 두 개가 된다 |

> **💡 이 패턴을 언제 쓸 것인가**
>
> **애플리케이션 코드에서는 거의 쓰지 마라.** 이 패턴이 값어치를 하는 곳은 라이브러리의 뜨거운 경로다 — 요청마다 수천 번 호출되는 파서, 로그 포매터, 프로토콜 디코더 같은 것.
>
> 판단 기준은 명확하다. 67.5절대로 `[MemoryDiagnoser]`를 켜고 **반복자 상태 기계 할당이 실제 프로파일에 보이는가**를 먼저 확인하라. 보이지 않으면 이 패턴은 순수한 복잡도 증가다.
>
> 그리고 .NET이 이미 제공하는 것(`EnumerateLines`, `EnumerateRunes`, `MemoryExtensions.Split`)이 요구를 만족한다면 직접 만들지 마라. BCL 구현은 벡터화되어 있고, 여러분의 손으로 쓴 `for` 루프보다 대개 빠르다.

### BCL 안의 같은 패턴

이 패턴은 예외적인 기교가 아니라 현대 BCL의 표준 관용구다. 같은 형태를 여러 곳에서 볼 수 있다.

| 타입 | 무엇을 열거하는가 |
|---|---|
| `SpanLineEnumerator` (`EnumerateLines`) | 줄 ※.NET 6 |
| `SpanRuneEnumerator` (`EnumerateRunes`) | 유니코드 코드 포인트 |
| `MemoryExtensions.SpanSplitEnumerator<T>` ※.NET 9 | 구분자로 나눈 `Range` |
| `Utf8JsonReader` (`System.Text.Json`) | JSON 토큰 — `ref struct` 읽기 전용 파서 |
| `ValueStringBuilder` (런타임 내부) | 열거자는 아니지만 같은 `ref struct` + `Span` 설계 |

`Utf8JsonReader`가 특히 좋은 예다. `ref struct`이므로 `async` 메서드에서 쓸 수 없고, 그래서 `System.Text.Json`의 비동기 API는 데이터를 먼저 모은 뒤 동기 구간에서 리더를 돌리는 구조로 되어 있다. **`ref struct`를 선택하면 그 위에 얹는 API의 모양까지 결정된다** — 설계 결정으로서의 무게를 보여주는 사례다.

---

## 68.8 스택 할당 메모리와 비관리 메모리 다루기

### `Span` 이전에는 코드를 두 벌 써야 했다

GC 부담을 줄이는 가장 직접적인 방법은 힙 할당을 줄이는 것이고, 그 다음 수단은 스택이나 비관리 힙을 쓰는 것이다. 문제는 `Span` 이전에는 그러려면 **포인터로 다시 써야 했다**는 점이다.

```csharp
int Sum(int[] numbers) { /* ... */ }               // 배열용

unsafe int Sum(int* numbers, int length)           // 스택·비관리용 — 같은 로직을 다시 쓴다
{
    int total = 0;
    for (int i = 0; i < length; i++) total += numbers[i];
    return total;
}

int* numbers = stackalloc int[1000];
int total = Sum(numbers, 1000);
```

`Span<T>`는 포인터에서 직접 만들 수 있으므로 이 이중화를 없앤다.

```csharp
int* p = stackalloc int[1000];
var span = new Span<int>(p, 1000);      // 포인터에서
Span<int> numbers2 = stackalloc int[1000];  // 또는 한 단계로 — unsafe조차 필요 없다
```

그리고 소비하는 쪽은 68.4절의 `Sum(ReadOnlySpan<int>)` 하나면 된다.

얻는 것이 셋이다.

- **하나의 메서드가 배열과 스택 할당 메모리 양쪽에 동작한다**
- **포인터를 거의 쓰지 않고 스택 메모리를 다룰 수 있다**
- **슬라이싱이 그대로 된다**

### 비관리 메모리 감싸기

비관리 힙에서 할당한 메모리도 같은 방식으로 감싼다. 할당 수단은 60.15절에서 본 것들이다.

```csharp
using System.Runtime.InteropServices;

var source = "The quick brown fox".AsSpan();
var ptr = Marshal.AllocHGlobal(source.Length * sizeof(char));
try
{
    var unmanaged = new Span<char>((char*)ptr, source.Length);
    source.CopyTo(unmanaged);                 // 관리 → 비관리 복사

    foreach (var word in unmanaged.Split())   // 68.7절의 무할당 열거자가 그대로 동작
        Console.WriteLine(word.ToString());
}
finally { Marshal.FreeHGlobal(ptr); }
```

.NET 6 이후로는 `NativeMemory`가 더 직접적이다.

```csharp
void* memory = NativeMemory.Alloc(64);
try
{
    Span<byte> span = new Span<byte>(memory, 64);
    span.Fill(0);
    // ...
}
finally { NativeMemory.Free(memory); }
```

| 할당 API | 특징 | 해제 |
|---|---|---|
| `NativeMemory.Alloc(nuint)` ※.NET 6 | C의 `malloc`에 대응. 가장 얇다 | `NativeMemory.Free` |
| `NativeMemory.AllocZeroed(nuint, nuint)` ※.NET 6 | 0으로 초기화된 블록 | `NativeMemory.Free` |
| `NativeMemory.AlignedAlloc(nuint, nuint)` ※.NET 6 | 정렬 요구가 있을 때(SIMD 등) | `NativeMemory.AlignedFree` |
| `Marshal.AllocHGlobal(int)` | Win32 `LocalAlloc` 계열. 오래된 코드에서 흔하다 | `Marshal.FreeHGlobal` |
| `Marshal.AllocCoTaskMem(int)` | COM 태스크 할당자. COM 상호 운용용(60.12절) | `Marshal.FreeCoTaskMem` |

### `Span`이 주는 보너스 — 경계 검사

포인터 산술에는 경계 검사가 없다. `Span<T>`의 인덱서에는 있다. **비관리 메모리를 `Span`으로 감싸는 순간 버퍼 오버런 보호가 생긴다.**

```csharp
var unmanaged = new Span<char>((char*)ptr, source.Length);
unmanaged[source.Length] = 'x';   // IndexOutOfRangeException — 조용히 넘어가지 않는다
```

단, **`Span`을 올바르게 만들었을 때만** 성립하는 보호다.

> **⚠️ 길이를 잘못 주면 보호는 사라지고 위험만 남는다**
>
> ```csharp
> var span = new Span<char>((char*)ptr, source.Length * 2);   // 실제보다 두 배
> ```
> 이렇게 만든 `Span`은 실제 할당 범위 밖까지 "정상 범위"로 취급한다. 경계 검사는 여전히 동작하지만 **잘못된 경계를 검사한다.** 결과는 인접 힙 영역의 손상이며, 증상은 전혀 관계없는 곳에서 나타난다.
>
> `Span<T>(void*, int)` 생성자에는 `unsafe`가 필요하다. 그 `unsafe` 키워드가 뜻하는 바가 정확히 이것이다 — **길이의 정확성은 컴파일러가 아니라 여러분이 보증한다.**

> **⚠️ 해제된 메모리를 가리키는 `Span`은 댕글링 포인터다**
>
> ```csharp
> Span<byte> span;
> void* p = NativeMemory.Alloc(64);
> span = new Span<byte>(p, 64);
> NativeMemory.Free(p);
> span[0] = 1;                      // 정의되지 않은 동작
> ```
> 컴파일러는 이것을 막지 못한다. `Span`이 스택 메모리를 참조할 때는 이스케이프 분석이 수명을 검사하지만(68.11절), **비관리 메모리의 수명은 언어가 모르는 정보다.** 관리 힙이라면 GC가 살려 두고, 스택이라면 컴파일러가 검사하지만, 비관리 메모리는 둘 다 없다.
>
> 그래서 비관리 메모리를 감싼 `Span`은 **`try`/`finally` 한 블록 안에서만 살아 있게** 하는 것이 규율이다. 수명을 메서드 밖으로 넘겨야 한다면 `Span`이 아니라 `MemoryManager<T>` 파생 클래스를 만들어 `IMemoryOwner<T>`로 노출하라(68.6절).

### 반환 규칙 — 무엇을 돌려줄 수 있고 무엇을 못 돌려주는가

컴파일러는 `Span`이 감싼 데이터의 수명을 추적한다. 세 가지 경우를 나란히 보면 규칙이 분명해진다.

```csharp
// 1) 관리 배열 — OK. 배열은 메서드보다 오래 산다(GC가 살린다).
public Span<int> ReturnArrayAsSpan()
{
    var array = new int[64];
    return array.AsSpan();
}

// 2) 스택 할당 — 컴파일 오류.
public Span<int> ReturnStackallocAsSpan()
{
    Span<int> span = stackalloc[] { 1, 2, 3, 4, 5 };
    return span;
    // CS8352: Cannot use local 'span' in this context because it may expose
    //         referenced variables outside of their declaration scope
}

// 3) 비관리 메모리 — 컴파일된다. 그러나 해제 책임이 사라졌다.
public unsafe Span<int> ReturnNativeAsSpan()
{
    IntPtr memory = Marshal.AllocHGlobal(64);
    return new Span<int>(memory.ToPointer(), 8);
    // 컴파일 OK. 하지만 이 메모리는 누가 FreeHGlobal 하는가?
}
```

1번이 되는 이유는 64.3절의 논리 그대로다. 반환된 `Span`이 담은 내부 포인터가 배열의 **내부 루트**가 되어 배열을 살려 둔다. 로컬 변수 `array`가 사라져도 배열은 수집되지 않는다.

2번이 막히는 이유는 `stackalloc` 블록의 수명이 메서드 실행에 묶여 있기 때문이다. 68.11절의 이스케이프 분석이 이 판정을 한다.

**3번이 이 절에서 가장 중요하다.** 컴파일은 되지만 메모리 누수다. 컴파일러가 막아 주지 않는 유일한 경우이며, 그래서 가장 위험하다.

> **💡 세 경우의 차이를 한 문장으로**
>
> **관리 힙은 GC가 지켜 주고, 스택은 컴파일러가 지켜 주고, 비관리 메모리는 아무도 지켜 주지 않는다.**

### `MemoryMarshal.GetReference` — 다시 포인터로 내려가기

이미 있는 `Span`에서 관리 포인터를 꺼내야 할 때가 있다. 벡터화된 네이티브 함수에 넘기거나, `fixed`로 고정할 때다.

```csharp
public unsafe bool ParseRequestLine(ReadOnlySpan<byte> span)
{
    // Span의 첫 원소에 대한 관리 포인터를 얻어 고정한다
    fixed (byte* data = &MemoryMarshal.GetReference(span))
    {
        return ParseCore(data, span.Length);
    }
}
```

이 관용구는 Kestrel의 HTTP 파서를 비롯한 .NET 저수준 코드 곳곳에 있다. 요청 한 줄을 슬라이스로 잘라 내고, 그 안에서 경로·쿼리를 다시 슬라이스로 잘라 내며 파싱한다 — **`string.Substring` 호출이 한 번도 없고, `Span`이 스택에 있으므로 힙 할당도 없다.**

```csharp
var span = buffer.First.Span;
var lineIndex = span.IndexOf(ByteLF);
if (lineIndex >= 0) span = span.Slice(0, lineIndex + 1);   // 한 줄만 남긴다
// ...
var pathBuffer = new Span<byte>(data + pathStart,  offset - pathStart);
var query      = new Span<byte>(data + queryStart, offset - queryStart);
handler.OnStartLine(method, httpVersion, targetBuffer, pathBuffer, query, /* ... */);
```

> **⚠️ 빈 `Span`에 `GetReference`를 쓰면 널 참조가 나온다**
>
> `Span<T>.Empty`나 길이 0인 슬라이스에 `MemoryMarshal.GetReference`를 부르면 널 참조(`Unsafe.NullRef<T>`와 같은 것)가 돌아온다. 그것을 역참조하면 `NullReferenceException`이고, `fixed`에 넣으면 널 포인터가 네이티브 코드로 넘어간다. **길이 0을 먼저 걸러라.** 검사는 `Unsafe.IsNullRef(ref r)`로 한다 — 널 참조는 `== null` 비교조차 역참조를 유발하므로 다른 방법이 없다.

> **📌 `fixed` 없이 `Span`을 쓸 수 있는 이유**
>
> 60.8절에서 배열 원소의 주소를 얻으려면 `fixed`로 고정해야 한다고 했다. 그런데 `Span<T>`는 고정 없이 관리 배열 내부를 가리킨다. 모순이 아니다 — **`Span`이 담은 것은 원시 포인터가 아니라 관리 포인터**이기 때문이다. GC가 배열을 옮기면 그 관리 포인터의 값도 함께 갱신된다(64.10절). 고정이 필요한 것은 GC가 모르는 원시 포인터(`byte*`)로 내려갈 때뿐이고, 그래서 위 코드에 `fixed`가 있는 것이다.

---

## 68.9 `stackalloc`과 `Span`의 결합

63.7절에서 `stackalloc`이 스택 프레임에 블록을 잡는 IL 명령(`localloc`)으로 컴파일된다는 것과, 그 블록의 수명이 메서드 실행에 묶인다는 것을 봤다. 여기서는 **`Span`과 결합했을 때 무엇이 달라지고 어디까지가 안전한가**만 다룬다.

### `unsafe`가 사라진다

```csharp
// C# 7.2 이전 — 포인터이므로 unsafe 컨텍스트가 필요하다
unsafe void Old()
{
    int* a = stackalloc int[10];
    for (int i = 0; i < 10; ++i) Console.WriteLine(a[i]);
}

// 현재 — Span으로 받으면 unsafe가 필요 없다
void New()
{
    Span<int> a = stackalloc int[10];
    for (int i = 0; i < 10; ++i) Console.WriteLine(a[i]);
}
```

두 번째가 안전한 이유는 세 가지가 겹쳐 있다.

1. `Span<int>`는 경계 검사를 한다 — 버퍼 오버런이 예외가 된다
2. `Span<int>`는 `ref struct`다 — 스택 주소가 힙으로 새지 않는다
3. 컴파일러의 이스케이프 분석이 반환·대입을 통한 탈출을 막는다(68.11절)

즉 **포인터의 세 가지 위험(경계 없음, 수명 없음, 힙 유출) 각각에 대응하는 방어가 있다.** `stackalloc`을 `Span`으로 받는 것이 `unsafe` 없이 허용되는 것은 편의가 아니라 이 세 방어의 결과다.

### 안전 한계 — 크기

스택은 작다. .NET 스레드 스택의 기본 크기는 **전형적인 32비트 컴파일에서 1 MB, 64비트 컴파일에서 4 MB**이고(61.1절), 실행 파일 헤더에서 오므로 구성에 따라 달라진다. 그리고 **스택을 넘기면 `StackOverflowException`이 나는데, 이 예외는 잡을 수 없다.** `try`/`catch`로 감싸도 프로세스가 즉시 종료된다.

| 상황 | 판단 |
|---|---|
| 크기가 컴파일 타임 상수이고 작다 (수백 바이트 이하) | `stackalloc` 적합 |
| 크기가 실행 중 결정되지만 상한이 확실하다 | 상한을 넘으면 풀로 폴백 |
| 크기가 사용자 입력에서 온다 | **절대 직접 넘기지 마라** |
| 루프 안이다 | **금지** — 아래 참조 |
| 재귀 메서드 안이다 | 깊이 x 크기가 스택을 먹는다. 사실상 금지 |

> **⚠️ 루프 안의 `stackalloc`은 반복마다 스택을 더 먹는다**
>
> ```csharp
> for (int i = 0; i < 100000; i++)
> {
>     Span<byte> buf = stackalloc byte[256];   // 반복마다 256바이트가 쌓인다
>     Process(buf);
> }
> ```
> **`stackalloc`으로 잡은 블록은 반복이 끝나도 회수되지 않는다.** 회수 시점은 메서드가 반환할 때다. 위 코드는 25 MB를 요구하며 스택 오버플로로 프로세스를 죽인다.
>
> 해법은 **루프 밖에서 한 번 할당하고 재사용**하는 것이다.
> ```csharp
> Span<byte> buf = stackalloc byte[256];
> for (int i = 0; i < 100000; i++)
> {
>     buf.Clear();          // 필요하다면
>     Process(buf);
> }
> ```
> 루프 본문을 별도 메서드로 빼는 것도 방법이다 — 메서드가 반환하면서 스택이 회수된다.

> **⚠️ `stackalloc` 크기에 검증되지 않은 값을 넣으면 취약점이다**
>
> ```csharp
> Span<byte> buf = stackalloc byte[header.Length];   // header가 원격 입력에서 왔다면?
> ```
> 공격자가 큰 길이를 보내면 프로세스가 죽는다. 잡을 수 없는 예외이므로 우아한 실패조차 불가능하다. **크기는 반드시 상수이거나, 명시적 상한으로 클램프된 값이어야 한다.**

> **💡 임계값의 관행적 기준**
>
> BCL 내부 코드가 쓰는 임계값은 대체로 **256~1024바이트** 범위다. `char` 기준으로는 128~256개 정도다. 이보다 크면 `ArrayPool<T>`로 넘긴다. 절대적인 숫자는 아니지만, 근거 없이 4 KB, 16 KB 같은 값을 고르는 것보다는 이 관행을 따르는 편이 안전하다. 스택 여유가 얼마나 있는지는 호출 깊이에 달려 있고, **라이브러리 코드는 자기가 얼마나 깊은 곳에서 호출될지 알 수 없다.**

### 조건부 스택 할당 — 실제로 쓰이는 패턴

작으면 스택, 크면 풀. 이 패턴을 간결하게 쓰려는 시도는 함정으로 시작한다.

```csharp
private const int StackAllocThreshold = 128;

public void UseSpanNotWisely(int size)
{
    Span<int> span = size < StackAllocThreshold
        ? stackalloc int[size]
        : ArrayPool<int>.Shared.Rent(size);

    for (int i = 0; i < size; ++i) Console.WriteLine(span[i]);

    // ArrayPool<int>.Shared.Return(??);   ← 배열을 되찾을 방법이 없다
}
```

컴파일되고 동작한다. 그러나 **빌린 배열을 반납할 수 없다.** `Span<T>`에서 원래 배열 객체를 얻는 방법이 없기 때문이다. 풀은 조용히 말라 가고, 증상은 "가끔 느려짐"으로만 나타난다.

배열 참조를 따로 붙들고 있어야 한다. 그런데 여기서 제약 하나가 더 걸린다. **`unsafe` 컨텍스트 밖에서는 `stackalloc` 결과를 이미 선언된 변수에 대입할 수 없다** — 변수 초기화자에서만 가능하다. 그래서 오래된 BCL 코드에는 `int* ptr = stackalloc int[size]; span = new Span<int>(ptr, size);`처럼 포인터를 한 번 거치는 우회가 남아 있다.

C# 11에서 이 제약이 완화됐다. `unsafe`를 붙이면 컴파일러가 오류 대신 **경고**를 내고 통과시킨다.

```csharp
public unsafe void UseSpanWiselyAndConcisely(int size)
{
    Span<int> span;
    int[] array = null;

    if (size < StackAllocThreshold)
    {
        span = stackalloc int[size];
        // warning CS9080: Use of variable 'span' in this context may expose
        //                 referenced variables outside of their declaration scope
    }
    else
    {
        array = ArrayPool<int>.Shared.Rent(size);
        span = array;
    }

    for (int i = 0; i < size; ++i) Console.WriteLine(span[i]);

    if (array != null) ArrayPool<int>.Shared.Return(array);
}
```

> **⚠️ CS9080 경고를 억제하기 전에 무엇을 보증했는지 확인하라**
>
> 이 완화는 "컴파일러가 검증을 포기하고 여러분에게 맡긴다"는 뜻이다. 위 코드가 안전한 이유는 `span`이 이 메서드 밖으로 나가지 않기 때문이지, `unsafe`를 붙였기 때문이 아니다. **`unsafe`는 보증이 아니라 보증 책임의 이전이다.** 같은 메서드에 나중에 `return span;`을 추가하면 컴파일러는 이제 막아 주지 않는다.
>
> 또한 이 완화는 **소급 적용된다** — 이전 C# 버전을 대상으로 해도 최신 컴파일러가 컴파일하면 오류가 아니라 경고가 된다. 컴파일러를 올렸더니 예전에 막히던 코드가 통과하기 시작할 수 있다는 뜻이다.

> **💡 실무에서는 대개 `ValueStringBuilder` 형태가 낫다**
>
> 위 패턴을 매번 손으로 쓰는 대신, 스택 버퍼로 시작해 부족하면 풀로 성장하는 구조체를 한 번 만들어 재사용하는 편이 낫다. .NET 런타임 내부의 `ValueStringBuilder`가 정확히 그 구조다. 68.1절에서 본 패턴 기반 `using`과 결합하면 반납 누락 위험도 줄어든다.

### 초기화 비용과 `[SkipLocalsInit]`

C# 컴파일러는 기본적으로 메서드에 `localsinit` 플래그를 붙이고, 그러면 CLR이 지역 변수 영역과 `stackalloc` 블록을 **0으로 채운다.** 큰 `stackalloc`에서는 이 초기화가 실측 가능한 비용이 된다.

`[SkipLocalsInit]`으로 끌 수 있다 ※C# 9.

```csharp
using System.Runtime.CompilerServices;

[SkipLocalsInit]
void Foo()
{
    Span<int> a = stackalloc int[100];
    for (int i = 0; i < 100; i++) Console.WriteLine(a[i]);   // 쓰레기 값이 나온다
}
```

메서드·타입·모듈 단위로 붙일 수 있다.

> **⚠️ `[SkipLocalsInit]`은 "안전한" 코드에서도 초기화되지 않은 메모리를 노출한다**
>
> 위 예제에서 `a`의 내용은 **이전에 그 스택 영역을 쓰던 다른 메서드가 남긴 값**이다. 다른 요청의 토큰이나 복호화된 데이터가 그 자리에 있었다면 그것이 그대로 읽힌다. `Span`을 쓰고 있어도, `unsafe`를 안 썼어도 마찬가지다.
>
> 그래서 규칙은 하나다. **`[SkipLocalsInit]`을 쓴 메서드의 `stackalloc` 버퍼는 읽기 전에 반드시 전부 쓴다.** 부분만 쓰고 전체를 읽으면 정보 누출이다.
>
> 또 하나 — 이 특성을 쓰려면 프로젝트에 `<AllowUnsafeBlocks>true</AllowUnsafeBlocks>`가 필요하다. `unsafe` 메서드가 하나도 없어도 그렇다. 69.8절에서 이 특성의 실제 이득 폭을 측정과 함께 다룬다.

### 무엇이 `stackalloc` 가능한가

```csharp
Span<int> a = stackalloc int[10];        // OK — int는 비관리 타입
Span<Point> b = stackalloc Point[10];    // Point가 참조 필드를 갖지 않으면 OK
Span<string> c = stackalloc string[10];  // CS0208 — 관리 타입은 불가
```

원소 타입은 **비관리 타입(unmanaged type)** — 참조 타입이 아니고 참조 타입 필드를 재귀적으로 포함하지 않는 타입 — 이어야 한다. 이유는 GC다. `stackalloc` 블록은 GC에게 "여기에 객체 참조가 있다"고 보고되지 않으므로, 그 안에 참조를 두면 GC가 대상을 살려 두지도 이동 시 갱신하지도 않는다. 참조의 배열을 스택에 두고 싶다면 다음 절의 인라인 배열이 답이다.

---

## 68.10 인라인 배열 ※C# 12

### 고정 크기 버퍼의 한계

구조체 안에 배열 필드를 두면, 구조체에 들어가는 것은 배열이 아니라 **배열에 대한 참조**다.

```csharp
public struct StructWithArray
{
    public char[] Text;    // 참조 8바이트. 실제 데이터는 힙의 다른 곳에 있다
    public int F2;
}
```

데이터를 구조체 안에 직접 박으려면 60.8절에서 본 **고정 크기 버퍼**를 쓴다.

```csharp
public unsafe struct StructWithFixedBuffer
{
    public fixed char Text[128];   // 256바이트가 구조체 안에 그대로 들어간다
    public int F2;
}
```

배열 필드를 쓰면 구조체 안에는 참조 8바이트만 들어가고 데이터는 힙의 별개 객체에 있다. 고정 크기 버퍼를 쓰면 256바이트가 구조체 **안에** 그대로 들어간다.

차이는 **데이터 지역성**이다(54.9절). `List<StructWithArray>`는 원소마다 별개의 `char[]` 객체가 힙 곳곳에 흩어지지만, `List<StructWithFixedBuffer>`는 모든 원소가 하나의 연속 배열에 조밀하게 눕는다. CPU 캐시 관점에서 비교가 안 된다(61.4절).

문제는 고정 크기 버퍼의 제약이다.

| 제약 | 내용 |
|---|---|
| `unsafe` 필수 | 구조체 선언과 접근 모두 |
| 원소 타입 제한 | `bool`, `byte`, `char`, `short`, `int`, `long`, `sbyte`, `ushort`, `uint`, `ulong`, `float`, `double` 만 |
| 경계 검사 없음 | 범위를 넘으면 쓰레기를 읽거나 `AccessViolationException` |
| 클래스에 불가 | 구조체 안에서만 |

`unsafe`가 필요한 이유는 버퍼가 **관리 포인터로 노출되기 때문**이다. 그래서 경계 검사도 없다.

> **📌 C# 7.3의 "이동 가능한 고정 버퍼 인덱싱"**
>
> 힙 객체 안에 들어간 고정 크기 버퍼는 GC가 압축하며 움직일 수 있다. C# 7.3 이전에는 그런 버퍼를 인덱싱하려면 `fixed (char* b = wrapper.Data.Text)`로 고정해야 했지만, 이후로는 `wrapper.Data.Text[4]`가 그냥 된다. 인덱싱은 필드 시작을 기준으로 한 **상대 연산**이므로 객체가 움직여도 결과가 달라지지 않는다 — 관리 포인터를 그대로 쓰면 되고 원시 포인터로 내려갈 필요가 없다.

### 인라인 배열 ※C# 12

C# 12의 인라인 배열은 고정 크기 버퍼와 같은 메모리 배치를 주면서 `unsafe`와 타입 제한을 없앤다.

선언은 특성 하나와 **필드 하나짜리 구조체**다.

```csharp
[System.Runtime.CompilerServices.InlineArray(10)]
public struct CharBuffer
{
    public char _firstElement;
}
```

필드가 정확히 하나여야 한다. 그 필드의 타입이 원소 타입이 되고, 특성의 인자가 개수가 된다. 컴파일러와 런타임이 이 구조체를 "같은 타입의 원소 10개가 연속된 블록"으로 취급한다.

사용은 배열과 같다.

```csharp
public void TestCharBuffer()
{
    var buffer = new CharBuffer();     // 스택에 20바이트
    buffer[0] = 'H';
    buffer[1] = 'e';
    buffer[2] = 'l';

    // buffer[10] = 'x';               // 컴파일 오류 — 상수 인덱스는 정적으로 검사된다

    int pos = 10;
    buffer[pos] = 'x';                 // IndexOutOfRangeException — 실행 시 검사된다
}
```

**경계 검사가 있다.** 상수 인덱스는 컴파일 타임에, 변수 인덱스는 런타임에 검사된다. 고정 크기 버퍼와의 결정적 차이다.

`Span`으로도 바로 다룰 수 있다.

```csharp
var buffer = new CharBuffer();
Span<char> span = buffer;                                  // 암시적 변환
span.Fill('.');
Console.WriteLine(span.ToString());

// 명시적으로 만들 수도 있다
var span2 = MemoryMarshal.CreateSpan(ref buffer._firstElement, 10);
```

### 가장 큰 이득 — 참조의 스택 배열

68.9절 마지막에서 본 제약을 기억하라. `stackalloc`은 비관리 타입만 받는다. **참조를 담은 배열을 스택에 둘 수 없었다.** 인라인 배열은 이것을 가능하게 한다.

```csharp
[System.Runtime.CompilerServices.InlineArray(10)]
public struct ObjectBuffer
{
    public object _firstElement;
}

public void TestObjectArray()
{
    // Span<object> objects = stackalloc object[10];
    // CS0208: Cannot take the address of, get the size of, or declare a pointer
    //         to a managed type ('object')

    var objects = new ObjectBuffer();      // 이건 된다
    objects[0] = "One string";
    objects[1] = "Another string";
}
```

`stackalloc`과 인라인 배열의 차이가 여기서 갈린다. `stackalloc`은 GC가 모르는 원시 블록을 잡는다. 인라인 배열은 **평범한 구조체의 필드들**이므로 GC가 그 안의 참조를 정확히 알고 있다 — 마킹도 하고 재배치도 한다(64.10절).

이 기능은 BCL 자신이 쓰고 있다. `string.Format`이 대표적이다.

```csharp
[InlineArray(2)]
internal struct TwoObjects
{
    private object? _arg0;

    public TwoObjects(object? arg0, object? arg1)
    {
        this[0] = arg0;
        this[1] = arg1;
    }
}

public static string Format(string format, object? arg0, object? arg1)
{
    TwoObjects twoObjects = new TwoObjects(arg0, arg1);
    // 인라인 배열 구조체를 첫 원소의 ref로 재해석해 ReadOnlySpan<object?>로 만든다
    return FormatHelper(null, format, MemoryMarshal.CreateReadOnlySpan(
        ref Unsafe.As<TwoObjects, object?>(ref twoObjects), 2));
}
```

이전에는 `new object[] { arg0, arg1 }` 배열이 매번 힙에 할당됐다. 이제 그 임시 배열이 **스택에 산다.** 63.9절에서 "숨은 할당"으로 지목한 항목 하나가 실제로 제거된 사례다.

### 두 기능 비교

| | 고정 크기 버퍼 (`fixed`) | 인라인 배열 (`[InlineArray]`) ※C# 12 |
|---|---|---|
| 도입 | C# 2.0 (unsafe 기능) | C# 12 / .NET 8 |
| `unsafe` 필요 | **필요** (선언·접근 모두) | 불필요 |
| 원소 타입 | 12개 기본 타입만 | **모든 타입** — 참조·제네릭·구조체 포함 |
| 경계 검사 | 없음 | **있음** (상수는 컴파일 타임, 변수는 런타임) |
| 선언 문법 | `public fixed char Buf[128];` | 필드 하나 + `[InlineArray(N)]` |
| 크기 지정 | 필드 선언에서 | 특성 인자에서 |
| `Span` 변환 | `MemoryMarshal.CreateSpan` 수동 | **암시적 변환** |
| 여러 개 선언 | 한 구조체에 여러 개 가능 | 구조체당 하나(필드가 하나여야 하므로) |
| P/Invoke 마샬링 | 잘 정의되어 있다(60.2절) | 지원되지만 레이아웃 확인 필요 |
| 다른 데이터와 함께 담기 | **가능** — 같은 구조체에 다른 필드 추가 | 불가 — 감싸는 구조체를 따로 만들어야 함 |

> **⚠️ 인라인 배열은 다른 필드와 한 구조체에 못 섞인다**
>
> `[InlineArray]` 구조체는 필드가 정확히 하나여야 한다. 그래서 "버퍼 + 길이"처럼 함께 두고 싶으면 감싸는 구조체를 하나 더 만들어야 한다.
>
> ```csharp
> [InlineArray(64)] public struct Buf64 { private byte _e0; }
>
> public struct Packet
> {
>     public Buf64 Payload;
>     public int Length;
> }
> ```
> 고정 크기 버퍼는 이 계층이 필요 없었다. 사소해 보이지만, 기존 P/Invoke 구조체를 기계적으로 인라인 배열로 옮기면 **레이아웃이 달라질 수 있다.** 상호 운용 구조체는 그대로 두는 편이 안전하다.

> **⚠️ `stackalloc`과 인라인 배열은 수명 규칙이 다르다**
>
> `stackalloc` 버퍼는 메서드 밖으로 절대 못 나간다. 인라인 배열은 **그냥 구조체**이므로 반환할 수도, 필드에 담을 수도, 힙 객체 안에 넣을 수도 있다. 다만 그 인라인 배열에서 만든 `Span`은 다시 `ref struct` 규칙을 따른다 — 스택에 있는 인라인 배열을 가리키는 `Span`을 반환하면 68.11절의 이스케이프 분석에 걸린다.

> **💡 인라인 배열을 언제 쓰는가**
>
> 세 가지 경우다.
>
> - **작고 개수가 고정된 임시 버퍼** — `string.Format`의 두세 개짜리 인자 배열처럼, 힙 할당을 없애려는 자리
> - **참조를 담은 스택 배열** — `stackalloc`으로는 불가능한 유일한 대안
> - **데이터 지역성이 필요한 구조체 컬렉션** — 값 타입 원소마다 별도 배열 객체를 두지 않으려는 경우(70장의 데이터 지향 설계)
>
> 반대로 크기가 실행 중에 결정되는 버퍼에는 맞지 않는다. 개수가 타입에 박히기 때문이다. 그 자리는 `stackalloc` 또는 `ArrayPool<T>`다.

---

## 68.11 `ref` 필드와 `scoped` ※C# 11

### `ref` 필드가 언어에 올라오기까지

68.2절에서 fast span의 필드가 `ref T _reference`라고 했다. 그런데 이 문법은 오랫동안 C#에 없었다. .NET Core 2.1의 `Span<T>`는 `ByReference<T>`라는 **런타임이 특별 취급하는 내부 타입**을 써서 같은 효과를 냈다. 사용자 코드에서는 쓸 수 없는 타입이었다.

C# 11이 이것을 언어 기능으로 승격했다.

```csharp
ref struct S
{
    public ref int Value;
}
```

`ref` 필드는 **`ref struct` 안에서만** 선언할 수 있다. 68.1절의 논리 그대로다 — 힙에 갈 수 없는 타입 안에서만 관리 포인터를 필드로 두는 것이 안전하다.

> **📌 클래스에 `ref` 필드가 생길 가능성**
>
> 사실상 없다. 클래스에 관리 포인터 필드를 허용하면 **힙에서 힙 내부를 가리키는 포인터**가 생긴다. GC는 그런 포인터를 만날 때마다 68.12절에서 볼 plug 트리 순회를 해야 하고, 그런 포인터로 얽힌 객체 그래프를 순회하는 비용은 감당할 수 없다. **얻는 것에 비해 비용이 너무 크다**는 것이 설계 판단이다.

### 용도 — 복잡한 자료 구조로의 지름길

```csharp
public ref struct EventWritten
{
    private ref EventMetadata Metadata;

    public EventWritten(EventSource source, int eventId)
    {
        Metadata = ref source.m_eventData![eventId];
    }

    // 이후 여러 메서드가 Metadata를 통해 원본 배열 원소를 직접 읽고 쓴다
}
```

배열 인덱싱을 매번 반복하지 않고, "그 원소"를 가리키는 포인터를 한 번 잡아 여러 메서드가 공유한다. 큰 구조체라면 복사도 사라진다.

`ref` 필드에 대입할 때는 `= ref`를 쓴다. 그냥 `=`는 **가리키는 대상의 값**을 바꾼다. 이 구분이 다음 표의 전부다.

### `readonly`의 두 자리

`ref` 필드에서 `readonly`는 두 군데에 붙을 수 있고, 뜻이 다르다.

| 선언 | 참조 재대입(`= ref`) | 값 대입(`=`) |
|---|---|---|
| `ref int F;` | 가능 | 가능 |
| `ref readonly int F;` | **가능** | 불가 — 값이 읽기 전용 |
| `readonly ref int F;` | 불가(생성자·`init` 밖에서) | **가능** |
| `readonly ref readonly int F;` | 불가 | 불가 |

```csharp
ref struct ReadOnlyExamples
{
    ref readonly int RefReadonlyField;
    readonly ref int ReadonlyRefField;
    readonly ref readonly int ReadonlyRefReadonlyField;

    void Uses(int[] array)
    {
        RefReadonlyField = ref array[0];         // OK
        RefReadonlyField = array[0];             // 오류 — 값이 읽기 전용

        ReadonlyRefField = ref array[0];         // 오류 — 포인터가 읽기 전용
        ReadonlyRefField = array[0];             // OK

        ReadonlyRefReadonlyField = ref array[0]; // 오류
        ReadonlyRefReadonlyField = array[0];     // 오류
    }
}
```

읽는 요령이 있다. **`ref` 왼쪽의 `readonly`는 포인터를, 오른쪽의 `readonly`는 값을 잠근다.** `readonly ref readonly`가 둘 다 잠근 것이다.

> **⚠️ `readonly` 위치를 헷갈리면 컴파일은 되고 의미만 달라진다**
>
> `ref readonly`와 `readonly ref`는 둘 다 유효한 선언이므로 **오타가 컴파일 오류로 잡히지 않는다.** 잘못 쓰면 "불변이라고 믿었던 값이 바뀌는" 종류의 버그가 된다. 팀 컨벤션으로 하나를 정해 두거나, 애초에 `readonly ref struct` 전체를 `readonly`로 선언해 고민을 없애는 편이 낫다.

### 이스케이프 분석 — 컴파일러가 검사하는 것

`ref` 필드를 허용하면 새로운 위험이 생긴다. 짧게 사는 데이터를 가리키는 포인터가 오래 사는 곳에 저장될 수 있다. 컴파일러는 이것을 **이스케이프 분석(escape analysis)** 으로 막는다.

핵심 개념은 두 가지 "범위"다.

| 개념 | 뜻 | 위반 시 |
|---|---|---|
| **safe-context**(값의 안전 범위) | 그 **값** 자체가 안전하게 나갈 수 있는 가장 바깥 범위 | CS8352 등 |
| **ref-safe-context**(참조의 안전 범위) | 그 값에 대한 **`ref`** 가 안전하게 나갈 수 있는 범위 | CS8168, CS8347 등 |

범위는 세 단계다. 바깥에서 안쪽으로 **caller-context**(호출자까지 나갈 수 있음) → **function-member**(이 메서드 안까지) → **declaration-block**(선언된 블록 안까지). 옛 「span safety」 문서에서는 각각 calling-method / current-method / block이라고 불렀다.

규칙을 코드로 보는 편이 빠르다.

```csharp
Span<int> A() { int[] heap = new int[4]; return heap; }   // OK — 배열은 calling-method
Span<int> B() { Span<int> s = stackalloc int[4]; return s; } // CS8352 — function-member
ref int C()   { int local = 7; return ref local; }        // CS8168 — 지역은 function-member
ref int D(int[] array, int i) => ref array[i];            // OK — 힙 내부는 calling-method
ref int E(ref int x) => ref x;                            // OK — 호출자에게서 온 ref
```

메서드 호출을 거치면 규칙이 합성된다. 컴파일러는 **반환값의 안전 범위를 모든 `ref` 인자 중 가장 좁은 것으로 잡는다.**

```csharp
Span<int> Pick(Span<int> a, Span<int> b) => a;

Span<int> Caller(Span<int> fromCaller)
{
    Span<int> local = stackalloc int[4];
    return Pick(fromCaller, local);
    // CS8347 — Pick의 결과가 local만큼 좁다고 판정된다.
    // 실제로는 a를 돌려주지만 컴파일러는 본문을 보지 않는다.
}
```

**컴파일러는 메서드 본문이 아니라 시그니처만 본다.** 그래서 실제로는 안전한 코드가 막히는 일이 생긴다. 그 해법이 `scoped`다.

### `scoped` — 좁히기로 넓히기

`scoped`는 매개변수에 붙여 **"이 인자는 이 메서드 밖으로 나가지 않는다"** 고 약속하는 한정자다.

```csharp
Span<int> Pick(Span<int> a, scoped Span<int> b) => a;
//                          ^^^^^^ b는 절대 밖으로 나가지 않는다

Span<int> Caller(Span<int> fromCaller)
{
    Span<int> local = stackalloc int[4];
    return Pick(fromCaller, local);   // 이제 OK — 반환값 범위는 a만 보고 정한다
}
```

이름은 "범위를 좁힌다"이지만 **효과는 호출자의 자유를 넓히는 것**이다. 매개변수 쪽에 제약을 걸어서 호출자에게 더 짧게 사는 값을 넘길 권리를 준다.

`scoped`가 붙을 수 있는 자리는 세 곳이다.

| 자리 | 예 | 뜻 |
|---|---|---|
| `ref`/`in`/`out` 매개변수 | `void F(scoped ref int x)` | 이 참조는 메서드 밖으로 나가지 않는다 |
| `ref struct` 타입 매개변수 | `void F(scoped Span<int> s)` | 이 스팬은 메서드 밖으로 나가지 않는다 |
| `ref` 지역 변수 | `scoped ref int r = ref x;` | 이 지역 참조는 현재 블록 밖으로 나가지 않는다 |

> **📌 구조체의 `this`는 기본이 `scoped`다**
>
> 구조체(`ref struct` 포함)의 인스턴스 멤버에서 `this`는 암묵적으로 `scoped ref`다. 그래서 `ref this.Field`를 반환할 수 없다 — 구조체 자신이 스택에 있을 수 있기 때문이다. 이 기본값을 뒤집는 것이 `[UnscopedRef]` 특성이다 ※C# 11.
>
> ```csharp
> public struct Counter
> {
>     private int _count;
>     [UnscopedRef] public ref int CountRef => ref _count;
> }
> ```
> 이제 `ref _count`를 반환할 수 있다. 대신 **호출자가 그 참조를 구조체보다 오래 쓰지 않을 책임**을 진다.

> **⚠️ `[UnscopedRef]`는 안전 규칙을 끄는 스위치다**
>
> ```csharp
> ref int Dangerous()
> {
>     Counter c = default;      // 스택 위의 구조체
>     return ref c.CountRef;    // 컴파일러가 잡아 준다 — 이 경우는 다행이다
> }
> ```
> 위 직접적인 경우는 막히지만, 구조체를 여러 단계 거쳐 넘기면 분석이 보수적으로 통과시키는 경로가 생긴다. `[UnscopedRef]`는 **BCL 같은 저수준 코드에서 검증된 관용구로만** 쓰는 것이 좋다. 애플리케이션 코드에서 이 특성을 붙이고 싶어졌다면, 대개는 설계가 잘못된 것이다.

> **⚠️ `scoped`를 붙이는 것은 시그니처 변경이다**
>
> 공개 API의 매개변수에 `scoped`를 나중에 붙이면 **호출자 쪽에서는 호환**이지만(더 짧은 것도 넘길 수 있게 되므로), 그 메서드를 재정의하거나 인터페이스로 구현하는 쪽에서는 깨질 수 있다. 반대로 이미 붙어 있던 `scoped`를 떼면 호출자가 깨진다. **API 설계 시점에 정해야 한다.**

### C# 11 이전 코드와의 관계

C# 11 이전에도 이스케이프 규칙 자체는 있었다(`Span<T>`가 존재한 이래로). 달라진 것은 **규칙이 `ref` 필드를 다룰 수 있도록 일반화되고, `scoped`로 명시할 수단이 생긴 것**이다.

한 가지 실무적인 파급 효과가 있다. C# 11부터 **`ref struct` 타입의 `ref` 매개변수와 `out` 매개변수, 그리고 구조체 인스턴스 멤버의 `this`는 암묵적으로 `scoped`로 취급된다.** 이전에는 그렇지 않았으므로, 그런 매개변수를 `ref`로 반환하던 오래된 코드를 최신 언어 버전으로 올리면 **없던 오류가 새로 나온다.** 의도적으로 예전 동작이 필요하다면 `[UnscopedRef]`를 붙여 명시적으로 되돌린다.

> **💡 이 절을 실무로 압축하면**
>
> 대부분의 코드는 `ref` 필드도 `scoped`도 직접 쓸 일이 없다. **하지만 CS8347·CS8352 오류를 만났을 때 무슨 말인지 알아야 한다.** 오류를 만나면 순서대로 확인하라.
>
> 1. 정말로 짧게 사는 데이터를 밖으로 내보내려 하고 있는가? → 설계가 틀렸다. 고쳐라.
> 2. 안전한데 컴파일러가 시그니처만 보고 막는 것인가? → 나가지 않는 매개변수에 `scoped`를 붙여라.
> 3. 둘 다 아닌가? → 대개 1번이다. 다시 확인하라.

---

## 68.12 관리 포인터(`ref` 지역/반환)의 내부 표현

### 두 종류의 포인터

CLR에는 포인터가 두 종류 있다.

| | 객체 참조(object reference) | 관리 포인터(managed pointer) |
|---|---|---|
| 가리키는 곳 | 객체의 시작(메서드 테이블 참조 위치) | 지역 변수, 매개변수, **객체의 필드**, **배열 원소** |
| CIL 표기 | `SomeClass` | `SomeClass&`, `int32&` |
| 다른 이름 | — | byref, 내부 포인터(interior pointer) |
| 저장 가능 위치 | 어디든 | 지역 변수·매개변수·반환 타입·**`ref struct` 필드** |
| C# 노출 | 모든 참조 타입 변수 | `ref` 매개변수 / `ref` 지역 / `ref` 반환 / `ref` 필드 |
| 박싱 | 가능 | **불가** |
| 배열 원소 타입 | 가능 | **불가** |

객체 참조는 객체 시작을 가리키므로 GC가 헤더와 메서드 테이블을 상수 오프셋으로 즉시 찾는다(54.2절). 관리 포인터는 그렇지 않다 — **어디를 가리키는지 값만 봐서는 알 수 없다.** 이 차이가 이 절의 전부다.

관리 포인터는 여전히 **타입이 있다.** `int32&`는 `int`를 가리키고, 다른 타입으로 쓸 수 없다. 그래서 `void*`보다 안전하다. 다만 포인터 산술이 안전성을 깰 수 있으므로 C#은 `unsafe` 없이는 산술을 노출하지 않고, `ref` 키워드를 통해 제한된 형태로만 보여 준다.

### 스택을 가리킬 때

```csharp
static void Main(string[] args)
{
    SomeClass someClass = new SomeClass();
    PassingByref.Test(ref someClass);       // 로컬 "변수"의 주소를 넘긴다
    Console.WriteLine(someClass.Field);     // 11
}

public class PassingByref
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void Test(ref SomeClass data) => data.Field = 11;
}
```

CIL을 보면 관리 포인터가 명시적으로 드러난다.

```il
// Main 안에서
   IL_0006: ldloca.s 0                                    // 지역 변수 0의 주소
   IL_0008: call void PassingByref::Test(class SomeClass&) // SomeClass& — 관리 포인터

.method public hidebysig static void Test (class SomeClass& data) cil managed noinlining
{
   IL_0000: ldarg.0
   IL_0001: ldind.ref        // 주소를 역참조해 객체 참조를 꺼낸다
   IL_0002: ldc.i4.s 11
   IL_0004: stfld int32 SomeClass::Field
   IL_0009: ret
}
```

JIT 결과를 보면 넘어간 것이 **스택 주소**임이 확실해진다.

```text
Program.Main(System.String[])
  ...
  call    coreclr!JIT_TrialAllocSFastMP_InlineGetThread   // 객체 할당
  mov     qword ptr [rbp-10h], rax   // 참조를 스택에 저장
  lea     rcx, [rbp-10]              // 그 스택 슬롯의 "주소"를 RCX에
  call    Test(SomeClass ByRef)

PassingByref.Test(SomeClass ByRef)
  mov     rax, [rcx]                 // 역참조 → 객체 주소
  mov     dword [rax+0x8], 0xb       // 필드에 11 저장
```

C++로 치면 "포인터에 대한 포인터"를 넘긴 것과 같다. **관리 포인터가 스택 주소를 담을 수 있다는 사실이 `ref struct` 제약 전체의 뿌리다** — 이 값이 힙에 살아남으면, 가리키던 스택 프레임이 사라진 뒤 다른 메서드의 데이터를 가리키게 된다.

### 힙 내부를 가리킬 때 — 진짜 내부 포인터

```csharp
static void Main(string[] args)
{
    SomeClass someClass = new SomeClass();
    PassingByref.Test(ref someClass.Field);   // 객체의 "필드" 주소를 넘긴다
    Console.WriteLine(someClass.Field);       // 11
}

public class PassingByref
{
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static void Test(ref int data) => data = 11;
}
```

이제 `Test`는 `int32&` 하나만 받는다. **그 값 어디에도 "어느 객체의 필드인가"라는 정보가 없다.** 그런데 GC는 그 객체를 살려 둬야 한다.

```text
      객체 참조                          관리 포인터(내부 포인터)
          │                                       │
          ▼                                       ▼
  ┌───────┬──────────┬────────┬────────┐
  │ 헤더  │ MT 참조  │ Field1 │ Field2 │   ← 관리 힙의 객체
  └───────┴──────────┴────────┴────────┘
     -8        0          8        12
              ▲                    ▲
              │                    └── ref someClass.Field2 는 여기를 가리킨다
              └── 객체 참조는 항상 여기
```

### GC는 어떻게 추적하는가

두 단계로 나뉜다.

**1단계 — 보고.** JIT이 만드는 GCInfo에 "이 시점에 이 레지스터/스택 슬롯은 살아 있는 참조다"가 기록된다(64.4절). 관리 포인터는 여기에 **언제나 `interior` 표시와 함께** 기록된다. 실제로 객체 시작을 가리키고 있어도 그렇다 — 값만 봐서는 구분할 수 없기 때문이다.

```text
> !u -gcinfo 00007ffc86fb0ce0
PassingByref.Test(Int32 ByRef)
  push    rdi
  push    rsi
  sub     rsp,28h
  mov     rsi,rcx
  00000009 interruptible
  00000009 +rsi(interior)      ← RSI가 내부 포인터로 보고된다
  ...
  0000003a not interruptible
  0000003a -rsi(interior)
```

메서드가 아주 단순하면 JIT이 **GCInfo가 비어 있는 원자적 메서드**로 만든다. GC가 그 메서드 실행 중에는 아예 중단하지 않으므로 보고할 것이 없다. 위 예제의 원래 `Test`가 그런 경우다.

**2단계 — 대상 객체 역산.** 내부 포인터를 받은 GC는 그 주소를 포함하는 객체를 찾아야 한다. 주소에서 거꾸로 스캔하며 메서드 테이블처럼 생긴 값을 찾는 방식은 쓸 수 없다 — 큰 배열의 끝을 가리키면 스캔이 길고, `byte[]` 안에 다른 객체의 복사본이 들어 있으면 오탐이 나며, 애초에 그 주소가 스택일 수도 있다.

실제로 쓰는 것은 **브릭 테이블과 plug 트리**다(64.6절). 주소로부터 브릭 항목을 계산하고, 그 brick의 plug 트리를 따라 주소가 속한 plug를 찾고, plug 안을 객체 단위로 훑어 포함하는 객체를 찾는다. plug는 객체로 시작하고 각 객체 크기를 알 수 있으므로 순차 스캔이 가능하다.

> **⚠️ 내부 포인터 해석은 공짜가 아니다**
>
> plug 트리 순회와 plug 스캔에는 비용이 든다. 게다가 이 방법은 **Plan 단계 이후에만** 가능하다 — plug와 gap이 그때 만들어지기 때문이다. Plan 단계 도중에는 더 단순한 방법을 쓴다: 해당 브릭을 처음부터 스캔한다. 최악의 경우 4 KB 브릭 전체를 훑는다.
>
> 그래서 살아 있는 내부 포인터가 수십 개씩 있으면 GC가 그만큼 메모리를 훑는다. **이것이 관리 포인터를 힙에 두지 못하게 한 두 번째 이유다** — 첫 번째는 수명 안전성이고, 두 번째가 이 비용이다. 힙에서 힙 내부를 가리키는 포인터로 얽힌 객체 그래프를 순회하는 비용은 얻는 것에 비해 너무 크다.

### 내부 포인터가 유일한 루트가 되는 경우

이 메커니즘이 만드는 결과 중 직관에 반하는 것이 있다.

```csharp
public static ref int ReturnByRefReferenceTypeInterior(int index)
{
    int[] localArray = new[] { 1, 2, 3 };
    return ref localArray[index];    // 컴파일된다
}

static void Main(string[] args)
{
    ref int byRef = ref ReturnByRefReferenceTypeInterior(0);
    // localArray는 코드 어디에서도 접근할 수 없다. 그런데도 살아 있다.
    byRef = 4;
}
```

배열을 가리키는 참조는 하나도 남지 않았는데 배열이 수집되지 않는다. **반환된 내부 포인터 자체가 그 배열의 루트이기 때문이다.** 68.8절에서 `ReturnArrayAsSpan`이 허용된 이유도 정확히 이것이다.

WeakReference로 관찰하면 확인할 수 있다.

```csharp
public static ref int Observe(int index, out WeakReference wr)
{
    ArrayWrapper wrapper = new ArrayWrapper { Array = new[] { 1, 2, 3 }, Field = 0 };
    wr = new WeakReference(wrapper);
    return ref wrapper.Field;         // 래퍼 자신의 필드를 가리킨다
}

static void Main()
{
    ref int byRef = ref Observe(2, out WeakReference wr);
    byRef = 4;
    for (int i = 0; i < 3; ++i) { GC.Collect(); Console.WriteLine(byRef + " " + wr.IsAlive); }
}
// 출력: 4 True / 4 True / 4 True   ← 래퍼가 살아 있다
```

`return ref wrapper.Field`를 `return ref wrapper.Array[index]`로 바꾸면 결과가 뒤집힌다.

```text
// 출력: 4 False / 4 False / 4 False
```

내부 포인터가 이제 **배열**을 가리키므로 배열만 살아남고, 그 배열을 참조하던 `ArrayWrapper`는 아무도 가리키지 않아 수집된다.

```text
(a) GC 전                            (b) GC 후
  byRef ──┐                            byRef ──┐
          │                                    │
  ArrayWrapper                                 │
  ┌───────────┐                                │
  │ Array ────┼──▶ int[] ◀──┘         (수집됨)  └──▶ int[]
  │ Field     │                                     (내부 포인터가 루트)
  └───────────┘
```

> **⚠️ 내부 포인터에서 원래 객체로 되돌아가는 API는 없다**
>
> GC가 내부적으로는 할 수 있는 일이지만(브릭·plug가 있을 때만), 관리 코드에는 노출되지 않는다. `Span<T>`에서 원래 배열을 되찾을 수 없는 것도 같은 이유다 — 68.9절에서 "빌린 배열을 반납할 수 없다"는 함정이 나온 근본 원인이다. **배열 참조가 필요하면 처음부터 따로 붙들어야 한다.**

> **📌 진단 도구가 이것을 어떻게 보여주는가**
>
> WinDbg의 `!gcroot`는 내부 포인터 루트를 이렇게 표시한다.
>
> ```text
> > !gcroot 0000027b00023d20
> Thread 3f48:
>     000000a65857de60 ... Program.Main(System.String[])
>         rbp-50: 000000a65857dec0 (interior)
>             ->  0000027b00023d20 ArrayWrapper
> ```
>
> PerfView 같은 도구는 이것을 그냥 `[local vars]` 루트로 뭉뚱그린다. **코드상 아무 연결이 없는데 루트로 나오는** 상황은 처음 보면 혼란스럽다. 66장의 누수 진단에서 "설명되지 않는 루트"를 만나면 내부 포인터를 의심하라.

> **📌 관리 포인터는 재배치 대상이다**
>
> 압축 GC가 객체를 옮기면 내부 포인터의 값도 plug 오프셋만큼 함께 갱신된다(64.10절). 일반 참조와 똑같이 다뤄진다. 그래서 `Span<T>`가 관리 배열을 가리키는 동안 GC가 그 배열을 옮겨도 `Span`은 계속 올바른 곳을 가리킨다 — **고정이 필요 없는 이유다.** 반대로 비관리 메모리를 가리키는 관리 포인터는 관리 힙 범위 밖이므로 Mark에서도 Compact에서도 무시된다.

### `ref` 지역과 `ref` 반환이 존재하는 이유

단 하나다 — **타입 안전한 방식으로 값 타입 복사를 피하기 위해서다.** 크기가 32·112·192바이트인 구조체를 값으로 넘기면 실행 시간이 각각 1.56 ns, 5.23 ns, 7.46 ns로 선형으로 늘지만, `ref`로 넘기면 1.33 ns 근처에서 **크기와 무관하게 일정하다.** 포인터 하나만 복사하기 때문이다. 16.2절에서 "값 타입은 복사된다"고 한 것의 대가를 없애는 도구가 `ref`다.

`ref` 반환은 여기에 하나를 더한다. 컬렉션이 원소를 **복사하지 않고** 노출할 수 있다 — `public ref SomeStruct this[int index] => ref _items[index];` 형태의 인덱서가 그것이다. `ref readonly`로 바꾸면 수정은 막히지만 16.5절의 방어적 복사가 되살아난다. 구조체를 `readonly struct`로 선언해야 그 복사가 사라진다.

> **⚠️ `List<T>`와 `Dictionary<K,V>`에 `ItemRef`가 없는 이유**
>
> 관례상 `ref`로 원소를 돌려주는 메서드는 `ItemRef`라고 이름 짓고, `System.Collections.Immutable`의 컬렉션들이 이것을 제공한다. 그런데 `List<T>`와 `Dictionary<K,V>`에는 없다. 두 가지 이유다.
>
> - 내부 `_version` 카운터로 열거 중 수정을 감지하는데, `ref`로 직접 고치면 그 감지를 우회한다
> - 내부 배열이 성장하면 **재할당**되므로 이전에 내보낸 `ref`가 낡은 배열을 가리킨다
>
> 그래도 필요하면 `System.Runtime.InteropServices.CollectionsMarshal`이 `AsSpan(List<T>)`, `GetValueRefOrNullRef`, `GetValueRefOrAddDefault`를 제공한다. 문서가 명시하는 규칙은 하나다 — **그 `Span`이나 `ref`를 쓰는 동안 컬렉션에 원소를 추가하거나 제거하지 마라.** 어기면 조용히 낡은 배열을 고치게 된다.

> **📌 널 `ref`라는 것이 있다**
>
> `ref` 지역이 가리키는 **대상**이 `null`인 것과, `ref` 지역 **자신**이 아무것도 가리키지 않는 것은 다르다. 후자는 순수 C#으로는 만들 수 없지만 IL 수준에서는 유효하고, `Unsafe.NullRef<T>()`가 그것을 돌려준다.
>
> ```csharp
> ref var nullRef = ref Unsafe.NullRef<string>();
> Console.WriteLine(nullRef);              // NullReferenceException
> Console.WriteLine(nullRef == null);      // 역시 NullReferenceException
> Console.WriteLine(Unsafe.IsNullRef(ref nullRef));   // 유일하게 올바른 검사법
> ```
> `ref` 키워드 없이 쓰는 순간 역참조되므로 비교조차 예외가 된다. 공개 API에서 널 `ref`를 반환하는 것은 피하고, 부득이하면 `FrozenDictionary.GetValueRefOrNullRef`처럼 **이름에 명시하라.**

---

## 68.13 `Span` / `Memory` 사용 가이드라인

### 요약 표

| 규칙 | 이유 | 예외 |
|---|---|---|
| **고성능·범용 코드에만 쓴다** | 업무 로직 전체를 스팬으로 도배할 이유가 없다 | 라이브러리 공개 API 설계 |
| **매개변수는 `ReadOnlySpan<T>`를 기본으로** | 가장 많은 호출자를 받고, 의도를 타입에 적는다 | 쓰기가 필요하면 `Span<T>` |
| **`Memory<T>`보다 `Span<T>`** | 더 빠르고 더 많은 메모리 종류를 표현한다 | `async`·필드·람다에서는 선택지가 없다 |
| **가변형보다 읽기 전용형** | `ReadOnly` 쪽이 더 많은 인자를 받는다 | 실제로 써야 할 때만 |
| **`Memory<T>`는 `Span`을 한 번 뽑아 쓴다** | 원소 접근마다 분기를 다시 탄다 | `await` 사이에는 유지 불가 |
| **`IMemoryOwner<T>`는 소유권이다** | 언젠가 `Dispose`가 불려야 한다 | GC가 관리하는 배열이면 불필요 |
| **소유자를 담는 타입도 `IDisposable`** | 자원 정리 책임이 전파된다 | — |
| **`stackalloc` 크기는 상수이거나 클램프된 값** | `StackOverflowException`은 잡을 수 없다 | 없다 |
| **반환 타입으로 `Span<T>`를 쓸 때 수명을 확인** | 비관리 메모리는 컴파일러가 안 막는다 | — |
| **.NET Framework 대상이면 측정 후 도입** | slow span은 배열보다 느릴 수 있다 | — |

### 언제 쓰지 말아야 하는가

`Span`을 도입하지 말아야 할 신호가 있다.

- **프로파일에 그 코드가 나타나지 않는다.** 67장의 절차를 건너뛴 도입은 복잡도만 늘린다.
- **컬렉션이 자주 커진다.** 원소를 추가·제거하는 컬렉션을 `Span`으로 들고 있으면 재할당 후 낡은 배열을 가리킨다.
- **비동기 경계가 많다.** `Memory<T>`로 바꿔야 하고, 그러면 이득의 상당 부분이 사라진다.
- **LINQ가 필요하다.** 68.4절에서 본 대로 `Span`에는 LINQ가 없다. 필요하다는 것은 대개 맞지 않는다는 신호다.
- **팀이 이스케이프 규칙을 모른다.** CS8347·CS8352를 만날 때마다 `unsafe`를 붙여 넘기는 코드가 쌓이면, 안전 장치를 끈 채 저수준 코드를 쓰는 것과 같다.

### 마지막 함정 — 흔한 실수 목록

| 실수 | 결과 | 대처 |
|---|---|---|
| `new Span<T>(ptr, byteCount)` | 실제보다 `sizeof(T)`배 큰 범위 | 두 번째 인자는 **원소 개수** |
| 루프 안 `stackalloc` | 스택 오버플로 | 루프 밖에서 한 번 |
| `Span`으로 풀 배열을 받고 반납 시도 | 반납 불가, 풀 고갈 | 배열 참조를 따로 유지 |
| `Substring` → `AsSpan` 기계적 치환 | 문화권 비교가 서수 비교로 바뀜 | 비교 지점마다 재판정 |
| `memory.Span[i]`를 루프 안에서 | 반복마다 분기 재실행 | 루프 밖에서 `Span` 추출 |
| 해제된 비관리 메모리를 가리키는 `Span` | 정의되지 않은 동작 | `try`/`finally` 한 블록 안에서만 |
| `CollectionsMarshal.AsSpan` 후 `Add` | 낡은 배열 수정 | 스팬 사용 중 컬렉션 변경 금지 |
| `[SkipLocalsInit]` + 부분만 쓴 버퍼 | 이전 데이터 누출 | 읽기 전에 전부 쓴다 |

> **💡 도입 순서에 대한 권고**
>
> 스팬화는 **바깥에서 안으로** 하는 편이 낫다. 뜨거운 경로의 진입점 메서드 시그니처를 `ReadOnlySpan<T>`로 바꾸고, 그 안에서 `Substring`·`Split`·`ToArray`를 하나씩 슬라이싱으로 대체한다. 한 단계마다 67.5절의 `Allocated`를 재고, **줄어들지 않으면 되돌린다.**
>
> 반대 방향 — 내부 헬퍼부터 스팬으로 바꾸는 것 — 은 대개 실패한다. 진입점에서 이미 `string`을 만들어 버렸다면 안쪽에서 아무리 슬라이싱해도 그 할당은 그대로 남는다.

---

## 이 장의 요약

- **`ref struct`는 "절대 힙에 가지 않는 타입"이고, 그 대가로 관리 포인터를 필드로 담을 권리를 얻는다.** 필드·박싱·배열 원소·제네릭 인수·`async`·람다 캡처 금지는 전부 이 한 가지 보장을 지키기 위한 것이다. C# 13이 세 가지(`allows ref struct`, 인터페이스 구현, `await`/`yield` 경계를 넘지 않는 지역 변수)를 완화했지만 원리는 그대로다.
- **`Span<T>`는 관리 포인터 하나와 `int` 길이 하나다.** 그 두 필드로 스택·관리 힙·비관리 메모리를 모두 표현하고, 슬라이싱은 두 필드만 다른 새 구조체를 만드는 일이다. `Length`가 `int`이므로 원소 21억 개가 상한이다.
- **"slow span"과 "fast span"은 런타임이 byref 필드를 지원하는지의 차이다.** slow span은 객체 참조와 바이트 오프셋으로 내부 포인터를 흉내 내며, 접근마다 분기 하나와 덧셈 둘을 더 낸다. **.NET Framework에서 `Span`은 배열보다 느릴 수 있다** — 성능 목적의 도입 전에 반드시 측정해야 한다.
- **`Span` API의 일관된 원칙은 "결과를 담을 곳은 호출자가 준다"이다.** `ToUpper`가 대상 스팬을 요구하고, `TryFormat`이 `Span<char>`를 받고, .NET 8의 `Split`이 `Span<Range>`를 받는 것이 모두 같은 이유다. 그리고 **`Substring`을 `AsSpan`으로 바꾸면 할당이 사라지지만 비교 의미론도 바뀐다** — 스팬은 서수 비교, `string`은 문화권 비교가 기본이다.
- **`Memory<T>`는 `object` + `_index` + `_length`다.** 힙에 살 수 있어야 하므로 관리 포인터를 담을 수 없고, 그래서 인덱서도 없다 — 접근은 `Span` 속성을 거친다. 그 대신 필드·`async`·람다에 들어갈 수 있다.
- **`IMemoryOwner<T>`는 성능 타입이 아니라 소유권 규약이다.** 풀에서 빌린 배열이나 비관리 메모리를 `Memory<T>`로 넘길 때, 누가 `Dispose`를 부를지를 시그니처로 표현한다. 소유자를 필드로 담는 타입은 그 자신도 `IDisposable`이어야 한다.
- **`ref struct` 열거자는 `foreach`가 패턴 기반이기 때문에 성립한다.** `IEnumerable<T>` 없이 순회되며 힙 할당이 0이지만, 대가는 LINQ·다형성·간결성이다. 그리고 수명 면에서는 **관리 힙은 GC가, 스택은 컴파일러가 지켜 주고, 비관리 메모리는 아무도 지켜 주지 않는다** — 비관리 메모리를 감싼 `Span`을 반환하는 코드는 컴파일되지만 누수다.
- **`stackalloc` 블록은 반복이 끝나도 회수되지 않는다.** 회수는 메서드 반환 시점이다. 루프 안 `stackalloc`은 스택 오버플로로 끝나고, 그 예외는 잡을 수 없다. 크기는 상수이거나 명시적으로 클램프된 값이어야 한다.
- **인라인 배열 ※C# 12는 고정 크기 버퍼에서 `unsafe`와 타입 제한을 걷어냈다.** 참조를 담은 스택 배열을 만들 수 있는 유일한 수단이며, `string.Format`이 임시 `object[]` 할당을 없앤 방법이 이것이다.
- **`ref` 필드 ※C# 11은 `ref struct` 안에서만 허용된다.** `readonly`는 `ref` 왼쪽이면 포인터를, 오른쪽이면 값을 잠근다. 컴파일러는 시그니처만 보고 이스케이프 범위를 계산하므로 안전한 코드가 막힐 수 있고, 그때 쓰는 것이 `scoped`다 — **매개변수를 좁혀 호출자의 자유를 넓히는** 한정자다.
- **관리 포인터는 GCInfo에 언제나 `interior`로 보고되고, 그 자체가 루트다.** 값만으로는 스택인지 힙 내부인지 알 수 없어 대상 객체를 브릭 테이블과 plug 트리로 역산해야 하며, 이 비용이 "관리 포인터가 힙에 살 수 없는" 두 번째 이유다. 배열 원소를 가리키는 `ref` 하나가 배열 전체를 살려 두지만, **거꾸로 원래 객체를 되찾는 API는 없다** — `Span`에서 풀 배열을 되찾을 수 없는 이유가 이것이다.

---

## 연습 문제

1. `Unsafe.SizeOf<Span<int>>()`, `Unsafe.SizeOf<ReadOnlySpan<char>>()`, `Unsafe.SizeOf<Memory<int>>()`를 출력하는 프로그램을 만들어라. 64비트와 32비트(`<PlatformTarget>x86</PlatformTarget>`) 양쪽에서 돌려 값을 비교하고, 68.2절과 68.6절의 필드 구성으로 각 숫자를 설명하라.
2. 68.1절의 제약 표에 있는 항목을 **하나씩 직접 코드로 재현해** 컴파일 오류 메시지와 오류 번호를 표로 정리하라. 그다음 `<LangVersion>13.0</LangVersion>`과 .NET 9 이상으로 올려 어느 항목이 통과로 바뀌는지 확인하라.
3. 68.5절의 `TryGetInt`와, 같은 일을 `string.Split` + `Substring`으로 하는 버전을 BenchmarkDotNet으로 비교하라. `[MemoryDiagnoser]`를 켜고 두 버전의 `Allocated`를 표로 남긴 뒤, 입력 문자열의 항목 개수를 `[Params]`로 4·16·64로 바꿔 가며 차이가 어떻게 벌어지는지 관찰하라.
4. `ArrayPool<int>.Shared.Rent(1024)`로 배열을 빌려 `Span<int>`로 감싼 뒤, **그 `Span`만 가지고 원래 배열을 되찾으려고 시도하라.** 실패하는 이유를 68.12절의 내부 포인터 설명으로 서술하고, `MemoryMarshal.TryGetArray`가 `Memory<T>`에는 있고 `Span<T>`에는 없는 이유를 설명하라.
5. 루프 안에서 `stackalloc byte[256]`을 하는 메서드를 만들어 반복 횟수를 1,000 → 10,000 → 100,000으로 늘려 가며 실행하고, **어느 지점에서 프로세스가 죽는지** 확인하라. `try`/`catch (StackOverflowException)`으로 감싸도 잡히지 않는 것을 직접 확인한 뒤, 루프 밖 할당 버전으로 고쳐 같은 반복 횟수에서 정상 동작함을 보여라.
6. 68.7절의 `CharSpanSplitter`를 그대로 구현하고, 같은 일을 (a) `string.Split`, (b) `IEnumerable<ReadOnlyMemory<char>>` + `yield return`, (c) `MemoryExtensions.Split(Span<Range>, char)` ※.NET 8 네 가지로 구현해 `Mean`과 `Allocated`를 한 표에 모아라. (b)의 할당이 정확히 무엇인지 프로파일러로 확인하라.
7. `[InlineArray(4)]`를 붙인 `object` 버퍼 구조체를 만들어 스택에 참조 네 개를 담아라. 그 안에 담은 객체를 `WeakReference`로 관찰하며 `GC.Collect()`를 호출해, **인라인 배열 안의 참조가 GC에게 제대로 보고되는지** 확인하라. 이어서 같은 일을 `stackalloc object[4]`로 시도해 컴파일 오류(CS0208)를 확인하고, 두 방식의 차이를 GC 관점에서 설명하라.

---

**다음 장** — 69장「할당 줄이기」에서는 이 장에서 만든 도구를 실제 할당 제거 작업에 투입한다. `ArrayPool<T>`와 `MemoryPool<T>`로 버퍼를 재사용하고, `string.Create`와 보간 핸들러로 문자열 할당을 없애고, `SearchValues<T>`로 검색을 최적화한다. 이 장이 "무엇을 쓸 수 있는가"였다면 69장은 "핫 패스의 할당을 실제로 0으로 만드는 순서"다. `Span`은 그 작업의 도구일 뿐 목적이 아니라는 점 — 목적은 언제나 67장의 측정이 가리키는 숫자다.
