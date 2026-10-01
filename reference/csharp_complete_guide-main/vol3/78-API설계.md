---
title: "78장. API 설계"
---

# 78장. API 설계

> **이 장의 위치** — Part XV「설계와 관용구」의 첫 장이다. 앞의 열네 개 파트에서 C#의 문법과 CLR의 동작을 하나씩 뜯어봤다면, 여기서는 그 지식을 **다른 사람이 쓸 코드**를 만드는 데 어떻게 쓰는지를 다룬다. 13장에서 캡슐화를, 14장에서 상속을, 18장에서 인터페이스를 배웠지만 "그래서 무엇을 `public`으로 낼 것인가"라는 질문은 미뤄뒀다. 그 질문에 답하는 장이다.
>
> **선수 지식** — 13장(클래스와 캡슐화), 14장(상속과 다형성), 17장(접근 제한자와 중첩 타입), 18장(인터페이스), 27장(이벤트), 52장(어셈블리)
>
> **이 장에서 다루지 않는 것** — 개별 관용구(`var`, `is`/`as`, 보간 문자열 등)는 79장에서, 예외 설계는 32장에서, 스레드 안전성 계약은 48장에서 다룬다. 인터페이스 문법 자체와 명시적 구현의 IL은 18장에서 이미 끝냈으므로 여기서는 **설계 판단**만 다룬다.

---

공개 API를 만드는 일은 코드를 쓰는 일이 아니라 **약속을 하는 일**이다. `public`으로 내보낸 타입, 메서드, 프로퍼티, 이벤트, 매개변수 이름, 기본값 — 이 모두가 계약이다. 계약은 지켜야 하고, 지키지 못하면 남의 빌드가 깨지거나(소스), 남의 프로덕션이 죽거나(바이너리), 남의 테스트가 조용히 틀린 답을 낸다(동작).

이 장의 원칙은 대부분 하나의 문장으로 압축된다. **나중에 되돌릴 수 있는 결정만 지금 내려라.** `internal`은 나중에 `public`으로 바꿀 수 있지만 그 반대는 안 된다. 비가상은 가상으로 바꿀 수 있지만 그 반대는 어렵다. 오버로드는 나중에 추가할 수 있지만 잘못 추가한 오버로드는 뺄 수 없다. 이 비대칭이 이 장 전체를 관통한다.

---

## 78.1 타입 가시성을 최소화하라

### 기본값이 만드는 사고

프로젝트 템플릿이 만들어주는 클래스 선언에는 대개 `public`이 붙어 있다. 그리고 대부분의 개발자는 그것을 지우지 않는다. 그 결과 어셈블리 하나에 수백 개의 공개 타입이 생기고, 그 수백 개가 전부 계약이 된다.

C# 자체는 다행히 반대로 설계되어 있다. **아무것도 쓰지 않으면 타입은 `internal`이고 멤버는 `private`이다.** 명시적으로 `public`을 타이핑한 사람은 "이것을 계약으로 만들겠다"고 선언한 것이다. 그 타이핑을 무의식적으로 하지 마라.

```csharp
// 나쁜 예 — 아무 생각 없이 전부 public
public class PhoneValidator
{
    // 지역 번호와 국번을 검사한다.
    public bool ValidateNumber(PhoneNumber ph) => true;
}
```

몇 달이 지나고 국제 전화번호를 지원해달라는 요청이 들어온다. 위 클래스는 미국 번호만 다루도록 짜여 있다. 미국용도 계속 필요하고, 어떤 설치 환경에서는 국제용이 필요하다.

**왜 나쁜가.** `PhoneValidator`가 `public`이므로 이미 어셈블리 밖의 코드가 이 **클래스 이름**에 의존하고 있다. `new PhoneValidator()`를 호출하는 코드가 밖에 있다. 구현을 갈아끼우려면 그 코드를 전부 고쳐야 한다. 타입을 지우거나 추상 클래스로 바꾸는 것은 파괴적 변경이다. 어셈블리 안의 구현 세부를 밖으로 내보냈기 때문에, 세부를 바꿀 자유를 잃었다.

```csharp
// 좋은 예 — 계약은 인터페이스, 구현은 internal
public interface IPhoneValidator
{
    bool ValidateNumber(PhoneNumber ph);
}

internal class USPhoneValidator : IPhoneValidator
{
    // 지역 번호와 국번을 검사한다.
    public bool ValidateNumber(PhoneNumber ph) => true;
}

internal class UKPhoneValidator : IPhoneValidator
{
    // 영국 번호 규칙을 검사한다.
    public bool ValidateNumber(PhoneNumber ph) => true;
}

internal class InternationalPhoneValidator : IPhoneValidator
{
    // 국가 코드와 국가별 번호 규칙을 검사한다.
    public bool ValidateNumber(PhoneNumber ph) => true;
}
```

밖으로 나가는 것은 인터페이스 하나와 팩터리 하나다.

```csharp
public static class PhoneValidators
{
    public static IPhoneValidator Create(PhoneTypes type) => type switch
    {
        PhoneTypes.UnitedStates => new USPhoneValidator(),
        PhoneTypes.UnitedKingdom => new UKPhoneValidator(),
        _ => new InternationalPhoneValidator(),
    };
}
```

이제 지역별 검증기를 몇 개를 더 추가하든 시스템의 다른 어셈블리는 아무것도 모른다. 클래스를 통째로 교체해도 인터페이스만 유지하면 된다. **바꿀 수 있는 코드의 양이 줄어든 것이 아니라, 바꿔야 하는 코드의 양이 줄었다.**

### BCL이 쓰는 패턴 — 열거자

.NET 클래스 라이브러리는 이 패턴을 곳곳에서 쓴다. `List<T>`의 열거자를 보자.

```csharp
// 설명용 축약. 실제 소스가 아니다.
public class List<T> : IEnumerable<T>
{
    public struct Enumerator : IEnumerator<T>
    {
        // MoveNext(), Reset(), Current의 구체 구현.
        internal Enumerator(List<T> storage) { /* ... */ }
    }

    public Enumerator GetEnumerator() => new Enumerator(this);
}
```

호출 코드는 `Enumerator`라는 타입을 직접 알 필요가 없다. `foreach`가 `GetEnumerator()`를 호출하고 반환된 것에 `MoveNext()`와 `Current`가 있으면 그만이다(28.1절의 덕 타이핑). `Dictionary<TKey,TValue>`, `Queue<T>`, `Stack<T>` 전부 같은 패턴을 쓴다.

> **📌 이 열거자들이 `public struct`인 이유**
>
> `List<T>.Enumerator`는 `private`가 아니라 `public struct`다. 캡슐화 때문이 아니라 **성능** 때문이다. `foreach`가 `IEnumerator<T>` 인터페이스를 거치지 않고 구조체를 값으로 받아 직접 `MoveNext()`를 호출하면 인터페이스 디스패치도 없고 힙 할당도 없다(18.6절, 18.9절). 즉 이 타입이 공개된 것은 설계 원칙을 어긴 것이 아니라 원칙보다 우선하는 이유가 있었던 것이다. 그런 이유가 없다면 기본값은 여전히 "감춘다"이다.

### 중첩 타입으로 한 단계 더 내리기

`internal`보다 더 좁힐 수도 있다. 어떤 타입이 오직 하나의 타입 안에서만 쓰인다면 그 안에 중첩시켜라(17.5절).

```csharp
public sealed class OrderProcessor
{
    // 이 상태 기계는 OrderProcessor 밖에서 의미가 없다.
    private sealed class PipelineState
    {
        public int Stage;
        public Exception? Failure;
    }

    private readonly Dictionary<Guid, PipelineState> states = new();
}
```

`private` 중첩 클래스는 바깥 타입의 `private` 멤버에 접근할 수 있다. 도우미 타입을 만들되 이름 공간을 오염시키지 않는 정석이다.

> **⚠️ 공개 중첩 타입은 만들지 마라**
>
> `private`/`protected` 중첩은 좋은 도구지만 **`public` 중첩 타입**은 다르다. 코드 분석 규칙 CA1034(`Nested types should not be visible`)가 이것을 잡아낸다. `Outer.Inner`라는 참조 문법이 번거롭고, 나중에 `Inner`를 밖으로 꺼내면 그것이 파괴적 변경이 되기 때문이다. 예외는 `List<T>.Enumerator`처럼 바깥 타입과 떼어놓으면 의미가 없는 경우다.

### 공개 표면적과 테스트 비용

공개 타입이 적으면 좋은 이유가 하나 더 있다. **공개 API는 전부 테스트해야 한다.** 공개하지 않은 것은 리팩터링할 때 그냥 고치면 되지만, 공개한 것은 고치기 전에 "누가 쓰고 있는가"를 먼저 물어야 한다.

단위 테스트에서 `internal` 타입에 접근해야 한다면 어셈블리 전체를 공개하지 말고 friend 어셈블리를 쓴다(17.2절).

```xml
<ItemGroup>
  <InternalsVisibleTo Include="MyLibrary.Tests" />
</ItemGroup>
```

> **💡 "일단 public으로 두고 나중에 좁히자"는 성립하지 않는다**
>
> 접근성 변경의 방향은 비대칭이다. `internal` → `public`은 아무도 깨뜨리지 않는다. `public` → `internal`은 컴파일된 호출자에게 `MethodAccessException`이나 `TypeLoadException`을 안긴다. 그러므로 **의심스러우면 좁게 시작하라.** 넓히는 것은 언제든 릴리스 노트 한 줄로 끝나지만, 좁히는 것은 메이저 버전을 올려야 하는 사건이다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 13 "Limit Visibility of Your Types"를 바탕으로 한다. `PhoneValidator` 예제와 `List<T>.Enumerator` 논의가 원서의 것이다.

---

## 78.2 상속보다 인터페이스 정의·구현을 선호하라

### "이다" 대 "처럼 행동한다"

낡았지만 여전히 정확한 구분이 있다. **상속은 "이다(is a)"이고 인터페이스는 "처럼 행동한다(behaves like)"이다.** 기반 클래스는 객체가 **무엇인지**를 말하고, 인터페이스는 객체가 **어떻게 행동하는지**의 한 측면을 말한다.

이 구분은 미학의 문제가 아니라 **시간의 문제**다. 두 구조는 버전이 올라갈 때 정반대로 움직인다.

| | 추상 기반 클래스 | 인터페이스 |
|---|---|---|
| 공통 구현 재사용 | 가능 — 구체 메서드, 필드, 프로퍼티 | 불가 (기본 구현 멤버는 18.7절 참조) |
| 데이터 멤버 | 가질 수 있다 | 가질 수 없다 |
| 다중 상속 | 하나만 | 몇 개든 |
| 구현자가 서로 무관해도 되는가 | 아니다 — 하나의 계층 | 그렇다 |
| **멤버 추가 시** | **모든 파생 클래스가 자동으로 얻는다** | **모든 구현자가 컴파일 오류** |
| 값 타입이 참여할 수 있는가 | 아니다 | 그렇다 |
| 버전 관리 관점 | 시간에 따라 확장 가능 | 사실상 고정 |

마지막 두 행이 핵심이다. 기반 클래스에 메서드를 하나 추가하면 파생 클래스들은 다시 컴파일할 필요조차 없이 그 기능을 얻는다. 인터페이스에 메서드를 하나 추가하면 그 인터페이스를 구현한 **모든 타입이 깨진다**. 그래서 인터페이스에 기능을 더해야 한다면 새 인터페이스를 만들고 기존 것을 상속하는 것이 정석이다.

```csharp
// 나쁜 예 — 출시된 인터페이스에 멤버 추가
public interface IPhoneValidator
{
    bool ValidateNumber(PhoneNumber ph);
    string CountryCode { get; }   // v2에서 추가 → 모든 구현자가 CS0535
}

// 좋은 예 — 확장 인터페이스를 새로 만든다
public interface IRegionalPhoneValidator : IPhoneValidator { string CountryCode { get; } }
```

> **⚠️ 기본 구현 멤버는 인터페이스 버전 문제의 만능 해결책이 아니다**
>
> ※C# 8의 기본 인터페이스 멤버(18.7절)는 "인터페이스에 멤버를 추가해도 구현자가 안 깨진다"는 길을 열어줬다. 그러나 대가가 있다. 기본 구현은 **인터페이스 참조를 통해서만** 호출된다. 구체 타입 참조로는 보이지 않는다. 게다가 기본 구현이 붙은 인터페이스는 `netstandard2.0` 같은 옛 타깃에서 쓸 수 없고, 다이아몬드 상속이 생기면 어느 구현이 선택되는지가 미묘해진다. **API 진화를 위한 최후 수단이지 일상 도구가 아니다.**

### 무관한 타입에 공통 행동을 부여하기

인터페이스의 진짜 힘은 상속 계층이 서로 다른 타입들을 하나의 코드로 다루는 데 있다.

```csharp
public class Employee
{
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Name => $"{LastName}, {FirstName}";
}

public class Customer { public string Name => customerName; private string customerName = ""; }
public class Vendor   { public string Name => vendorName;   private string vendorName = ""; }
```

`Employee`, `Customer`, `Vendor`는 공통 기반 클래스를 가져서는 안 된다. 셋은 개념적으로 "같은 것"이 아니다. 그런데도 공통점이 있다 — 이름, 주소, 연락처. 그 공통점만 뽑아낸다.

```csharp
public interface IContactInfo
{
    string Name { get; }
    PhoneNumber PrimaryContact { get; }
    PhoneNumber Fax { get; }
    Address PrimaryAddress { get; }
}

public class Employee : IContactInfo { /* 구현 생략 */ }
public class Customer : IContactInfo { /* 구현 생략 */ }
public class Vendor : IContactInfo { /* 구현 생략 */ }
```

이제 셋 모두에 대해 하나의 루틴이 동작한다.

```csharp
public void PrintMailingLabel(IContactInfo ic)
{
    // 구현 생략
}
```

억지로 `Person`이라는 기반 클래스를 만들어 `Vendor`를 그 밑에 넣었다면, 회사가 벤더인 경우에 `FirstName`을 어떻게 채울지 고민하게 됐을 것이다.

### 매개변수와 반환값의 타입을 무엇으로 할 것인가

같은 일을 하는 세 메서드가 있다.

```csharp
public static void Print<T>(IEnumerable<T> collection) { /* ... */ }        // 가장 재사용 가능
public static void Print(System.Collections.IEnumerable collection) { }     // 박싱이 붙는다
public static void Print(WeatherDataStream collection) { }                  // 이 타입 전용
```

첫 번째가 가장 재사용 가능하다. `List<T>`, 배열, `SortedList<T>`, LINQ 쿼리 결과 — `IEnumerable<T>`를 지원하는 모든 것이 들어온다. 두 번째는 제네릭이 아닌 옛 인터페이스라 `object` 박싱이 붙는다. 세 번째는 그 클래스 하나에만 쓸 수 있다.

반환값도 같은 원칙이다.

```csharp
// 나쁜 예 — 구체 컬렉션 타입을 반환
public List<WeatherData> DataSequence => sequence;
private List<WeatherData> sequence = new();
```

**왜 나쁜가.** 두 가지 문제가 동시에 생긴다. 첫째, 나중에 `List<T>` 대신 배열이나 `SortedList<T>`를 쓰고 싶어지면 반환 타입을 바꿔야 하고 그것은 파괴적 변경이다. 둘째, 그리고 이쪽이 더 즉각적인 문제인데 — `List<T>`는 데이터를 **바꾸는** 메서드를 잔뜩 갖고 있다. 호출자가 `Clear()`를 부르면 내부 데이터가 사라진다. 78.5절에서 이 문제를 정면으로 다룬다.

```csharp
// 좋은 예 — 클라이언트가 써야 할 계약만 노출
public IEnumerable<WeatherData> DataSequence => sequence;
```

> **💡 반환 타입 선택 기준표**
>
> | 클라이언트가 해야 할 일 | 반환 타입 |
> |---|---|
> | 한 번 훑기만 | `IEnumerable<T>` |
> | 개수를 알고 인덱스로 접근 | `IReadOnlyList<T>` |
> | 개수만 알면 됨 | `IReadOnlyCollection<T>` |
> | 키로 조회 | `IReadOnlyDictionary<TKey,TValue>` |
> | 진짜로 수정해야 함 | `IList<T>` / `ICollection<T>` — 정말 그런지 다시 생각해볼 것 |
> | 스냅숏이 필요하고 불변이어야 함 | `ImmutableArray<T>` |
>
> `IReadOnly*` 계열은 **읽기 전용 뷰**이지 불변 보장이 아니다. 뒤에 있는 `List<T>`를 다른 코드가 바꾸면 뷰도 바뀐다.

### 인터페이스 메서드는 가상 메서드가 아니다

여기서부터가 이 절의 핵심이자, 실무에서 가장 자주 사고를 내는 지점이다. 18.3~18.4절에서 명시적 구현과 재구현의 **문법**을 봤다면, 여기서는 그 문법이 **메타데이터에 무엇을 남기는지**와 그것이 API 설계 판단에 어떤 제약을 거는지를 본다.

추상 메서드를 오버라이드하는 것과 인터페이스 멤버를 구현하는 것은 겉보기에 같다. 둘 다 "다른 곳에 선언된 멤버에 정의를 준다". 그러나 근본적으로 다르다.

- 추상·가상 기반 클래스 멤버의 구현은 **반드시 가상이어야 한다.**
- 인터페이스 멤버의 구현은 **가상일 필요가 없다.**

```csharp
interface IMessage
{
    void Message();
}

public class MyClass : IMessage
{
    public void Message() => Console.WriteLine(nameof(MyClass));
}
```

`MyClass.Message()`는 `virtual`이 아니다. 그런데 인터페이스 디스패치는 동작한다. 어떻게?

```il
.class public auto ansi beforefieldinit MyClass
       extends [System.Runtime]System.Object
       implements IMessage
{
  .method public hidebysig newslot virtual final
          instance void Message() cil managed
  { /* ... */ }
}
```

**`newslot virtual final`.** 컴파일러는 인터페이스를 암시적으로 구현하는 메서드를 반드시 `virtual`로 낸다 — CLR의 인터페이스 디스패치가 가상 슬롯을 요구하기 때문이다. 동시에 `final`을 붙여 파생 클래스가 `override`할 수 없게 만든다. C# 소스에는 `virtual`이 없지만 IL에는 있다. **C#의 `virtual`과 IL의 `virtual`은 같은 단어가 아니다.**

이제 파생 클래스를 만들어보자.

```csharp
public class MyDerivedClass : MyClass
{
    public new void Message() => Console.WriteLine(nameof(MyDerivedClass));
}
```

`new`가 필요하다. `MyClass.Message()`는 (C# 관점에서) 가상이 아니므로 오버라이드할 수 없고, 파생 클래스는 **새 메서드를 만들어 기반 것을 가릴 뿐**이다.

```il
.class public auto ansi beforefieldinit MyDerivedClass extends MyClass
{
  .method public hidebysig instance void Message() cil managed { /* ... */ }
}
```

`implements` 절이 없고 `newslot virtual`도 없다. 완전히 무관한 새 메서드다. 결과는 이렇다.

```csharp
MyDerivedClass d = new MyDerivedClass();
d.Message();                 // "MyDerivedClass"
IMessage m = d;
m.Message();                 // "MyClass"   ← 같은 객체, 다른 답
```

같은 객체에 같은 이름의 메서드를 불렀는데 참조 타입에 따라 답이 다르다. 이것이 `new` 한정자가 만드는 모호함이다(79.8절, 14.3절).

### 재구현(reimplementation) 함정

기반 클래스를 고칠 수 없는 상황에서 흔히 쓰는 우회책이 **인터페이스를 파생 클래스에서 다시 선언하는 것**이다.

```csharp
public class MyDerivedClass : MyClass, IMessage   // ← 인터페이스 재선언
{
    public new void Message() => Console.WriteLine(nameof(MyDerivedClass));
}
```

```il
.class public auto ansi beforefieldinit MyDerivedClass
       extends MyClass
       implements IMessage        // ← 이 한 줄이 인터페이스 맵을 새로 만든다
{
  .method public hidebysig newslot virtual final
          instance void Message() cil managed
  { /* ... */ }
}
```

`implements IMessage`가 붙고 메서드가 다시 `newslot virtual final`이 됐다. **인터페이스 맵은 타입마다 따로 만들어진다.** `MyDerivedClass`가 `IMessage`를 다시 선언했으므로 CLR은 `MyDerivedClass`용 인터페이스 맵을 새로 만들고, 그 슬롯을 `MyDerivedClass.Message`로 채운다. 이제 이렇게 된다.

```csharp
MyDerivedClass d = new MyDerivedClass();
d.Message();                 // "MyDerivedClass"
IMessage m = d;
m.Message();                 // "MyDerivedClass"   ← 고쳐졌다
MyClass b = d;
b.Message();                 // "MyClass"          ← 여전히 어긋난다
```

두 개가 맞고 하나가 틀렸다. 그리고 소스에는 여전히 `new` 키워드가 남아 있다 — 그것이 아직 문제가 있다는 신호다.

> **⚠️ 재구현은 "고쳤다"가 아니라 "덜 틀렸다"이다**
>
> 재구현으로 인터페이스 경로는 바로잡을 수 있지만 **기반 클래스 참조 경로는 절대 바로잡을 수 없다.** 라이브러리 소비자는 세 가지 경로 중 어느 것으로 호출하느냐에 따라 다른 동작을 본다. 이것을 문서로 설명할 방법은 없다. 재구현은 남의 라이브러리를 어쩔 수 없이 확장할 때의 응급처치이지 **당신이 설계하는 API에는 절대 나와서는 안 되는 형태**다.

### 그래서 API 저자는 무엇을 해야 하는가

파생 클래스가 인터페이스 구현 동작을 바꿀 수 있게 하려면 **기반 클래스 저자가 미리 결정**해야 한다. 네 가지 선택지가 있다.

**1. 구현을 `virtual`로 낸다.**

```csharp
public class MyClass : IMessage { public virtual void Message() => Console.WriteLine("MyClass"); }
public class MyDerivedClass : MyClass { public override void Message() => Console.WriteLine("Derived"); }
```

IL에서 기반 메서드는 `newslot virtual`(이번엔 `final` 없이)이 되고 파생 메서드는 `virtual`(`newslot` 없이 — 같은 슬롯을 재사용한다)이 된다. 세 경로 모두 파생 버전을 호출한다.

**2. 추상으로 선언하고 구현을 미룬다.** `public abstract class MyClass : IMessage { public abstract void Message(); }` — 인터페이스를 **구현하지 않고도** 인터페이스 목록에 올릴 수 있다. 계약은 `MyClass`에 들어가지만 정의는 구체 파생 클래스로 넘어간다.

**3. 봉인된 구현 + 보호된 가상 훅.**

```csharp
public class MyClass : IMessage
{
    protected virtual void OnMessage() { }

    public void Message()
    {
        OnMessage();
        Console.WriteLine(nameof(MyClass));
    }
}
```

`Message()` 자체는 못 바꾸되 파생 클래스가 그 안에 자기 코드를 끼워 넣을 수 있다. `IDisposable`의 `Dispose()`/`Dispose(bool)` 관용구가 정확히 이 모양이다(33장). **API 설계 관점에서는 이것이 대체로 최선이다** — 계약(무엇을 하는가)은 봉인하고 확장점(어떻게 하는가)만 연다.

**4. 기반 클래스가 구현을 제공하고 파생 클래스가 인터페이스만 선언한다.**

```csharp
public class DefaultMessageGenerator
{
    public void Message() => Console.WriteLine("This is a default message");
}

// Message()를 다시 쓸 필요가 없다 — 상속받은 메서드가 계약을 만족한다.
public class AnotherMessageGenerator : DefaultMessageGenerator, IMessage { }
```

> **📌 인터페이스 멤버 결정 규칙**
>
> 클래스 선언의 기반 타입 목록에 인터페이스가 있으면, 컴파일러는 인터페이스의 각 멤버에 대응하는 클래스 멤버를 찾는다.
>
> 1. **명시적 구현이 암시적 구현보다 우선한다.**
> 2. 클래스 정의에서 못 찾으면 **접근 가능한 기반 타입의 멤버**를 본다.
> 3. `virtual`·`abstract` 멤버는 **그것을 선언한 타입의 멤버**로 간주된다 — 오버라이드한 타입의 멤버가 아니다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 14 "Prefer Defining and Implementing Interfaces to Inheritance"와 Item 15 "Understand How Interface Methods Differ from Virtual Methods"를 바탕으로 한다. IL 수준의 `newslot virtual final` 분석은 저자의 보강이다.

### 최소 인터페이스 + 확장 메서드

인터페이스는 구현을 담을 수 없지만, **확장 메서드로 구현이 있는 것처럼 보이게** 할 수 있다. `System.Linq.Enumerable`이 `IEnumerable<T>`에 50개 넘는 확장 메서드를 정의한 것이 이 기법의 교과서다.

```csharp
public class WeatherDataStream : IEnumerable<WeatherData>
{
    private readonly Random generator = new();

    private IEnumerator<WeatherData> GetElements()
    {
        // 실제 구현은 기상 관측소에서 읽어온다.
        for (int i = 0; i < 100; i++)
            yield return new WeatherData(generator.NextDouble() * 90,
                                         generator.Next(70),
                                         (Direction)generator.Next(7));
    }

    public IEnumerator<WeatherData> GetEnumerator() => GetElements();

    System.Collections.IEnumerator
        System.Collections.IEnumerable.GetEnumerator() => GetElements();
}
```

구현한 것은 메서드 두 개뿐인데 LINQ 전체가 따라온다. 쿼리 구문은 메서드 호출로 번역되고(29장), 그 메서드들은 사실 `System.Linq.Enumerable`의 **정적 메서드**다.

```csharp
var warmDays = from item in new WeatherDataStream("Ann Arbor")
               where item.Temperature > 80
               select item;

// 컴파일러가 만드는 것과 같다. 이렇게 쓰지는 마라.
var same = Enumerable.Where(new WeatherDataStream("Ann Arbor"),
                            item => item.Temperature > 80);
```

당신의 인터페이스에도 같은 원칙을 적용하라. **인터페이스에는 최소한의 것만 넣고, 그 위에서 만들 수 있는 편의 메서드는 확장 메서드로 제공한다.**

```csharp
public static class Comparable
{
    public static bool LessThan<T>(this T left, T right)
        where T : IComparable<T> => left.CompareTo(right) < 0;

    public static bool GreaterThan<T>(this T left, T right)
        where T : IComparable<T> => left.CompareTo(right) > 0;

    // LessThanEqual, GreaterThanEqual도 같은 방식
}
```

구현자는 `CompareTo` 하나만 쓰면 되고 호출자는 읽기 쉬운 이름을 얻는다.

> **⚠️ 확장 메서드와 같은 이름의 인스턴스 메서드가 나중에 생기면 조용히 동작이 바뀐다**
>
> 인스턴스 메서드가 확장 메서드보다 우선한다. 그런데 이 결정은 **컴파일 타임**에 내려진다. 어떤 클래스가 나중에 확장 메서드와 같은 시그니처의 인스턴스 메서드를 추가하면, **다시 컴파일한 코드만** 새 인스턴스 메서드로 옮겨간다. 이미 배포된 어셈블리는 계속 확장 메서드를 부른다. 두 구현의 의미가 다르면 같은 프로그램 안에서 두 가지 동작이 공존한다. 확장 메서드로 제공한 동작과 클래스가 나중에 만든 동작은 **반드시 의미가 같아야 한다**. ※C# 14의 확장 멤버(76.12절)도 이 우선순위 규칙은 그대로다.

### 제네릭 인터페이스와 옛 인터페이스를 함께

제네릭 이전에 쓰이던 비제네릭 인터페이스가 여전히 BCL 곳곳에 남아 있다. `IComparable<T>`를 구현했다면 `IComparable`도 함께 구현하는 것이 안전하다 — 단, **명시적 구현**으로.

```csharp
public class Name : IComparable<Name>, IComparable
{
    public string First { get; set; } = "";
    public string Last { get; set; } = "";

    public int CompareTo(Name? other)
    {
        if (ReferenceEquals(this, other)) return 0;
        if (other is null) return 1;   // null이 아닌 모든 객체 > null
        int rVal = Comparer<string>.Default.Compare(Last, other.Last);
        return rVal != 0 ? rVal : Comparer<string>.Default.Compare(First, other.First);
    }

    // 옛 인터페이스는 명시적으로 — 실수로 이쪽이 선택되지 않게
    int IComparable.CompareTo(object? obj) =>
        obj is Name other
            ? CompareTo(other)
            : throw new ArgumentException("Argument is not a Name object", nameof(obj));
}
```

명시적 구현으로 두면 컴파일러는 일반적인 상황에서 제네릭 버전을 고르고, 호출 코드가 명시적으로 `IComparable`로 타이핑됐을 때만 옛 버전으로 간다.

> **⚠️ 제네릭 컬렉션 인터페이스는 옛 것을 상속하지 않는다**
>
> `IEnumerable<T>`는 `IEnumerable`을 상속한다. 그러나 **`ICollection<T>`는 `ICollection`을 상속하지 않고 `IList<T>`는 `IList`를 상속하지 않는다.** 둘 다 `IEnumerable<T>`를 통해 비제네릭 열거만 물려받는다. 옛 API에 컬렉션을 넘겨야 한다면 이 사실을 알고 있어야 한다.

### 가변성 표시를 잊지 마라

제네릭 인터페이스와 델리게이트를 정의할 때 **`in`/`out`을 붙일 수 있으면 붙여라**(23.10절). 그것 하나로 API가 쓰일 수 있는 상황이 넓어진다.

```csharp
public interface IPhoneValidator<in TNumber> { bool ValidateNumber(TNumber ph); }  // 반공변
public interface IReportSource<out TReport> { TReport Generate(); }                // 공변
```

규칙은 단순하다. **타입 매개변수가 출력 위치(반환값, get 접근자)에만 나오면 `out`, 입력 위치(메서드 매개변수)에만 나오면 `in`, 양쪽에 나오면 불변**이다. BCL이 `IEnumerable<out T>`, `IComparable<in T>`로 선언한 이유가 이것이다. `IEquatable<T>`가 불변인 이유도 명확하다 — 정의상 `Planet`과 `Moon`은 같을 수 없다.

> **💡 첫 릴리스에서 `in`/`out`을 빼먹지 마라**
>
> 나중에 `out`을 **추가**하는 것은 대체로 호환되지만, 이미 그 자리에서 불변성을 전제로 쓰인 코드(예: 두 오버로드 중 하나를 고르던 코드)에서 오버로드 해석이 달라질 수 있다. 반대로 `in`/`out`을 **제거**하는 것은 명백한 파괴적 변경이다. 첫 설계 때 결정하라.

---
## 78.3 메서드 그룹은 명확·최소·완전하게

### 오버로드가 많을수록 나빠지는 이유

오버로드를 하나 만들 때마다 컴파일러가 "가장 좋은 메서드"를 고르기 위해 뒤져야 할 후보가 늘어난다. 후보가 늘어나면 두 가지 일이 생긴다. 하나는 모호성 컴파일 오류다 — 이건 차라리 낫다. 코드가 컴파일되지 않으므로 배포되지 않는다. 진짜 문제는 **컴파일러와 당신의 생각이 다를 때**다. 그때는 컴파일러가 이긴다. 그리고 조용히 이긴다.

목표는 명확하다. **클라이언트가 쓰기 쉬울 만큼은 충분하되, 컴파일러가 하나의 최선을 고르기 어려울 만큼 많지는 않게.**

### 첫 번째 규칙 — 같은 이름은 같은 일을 해야 한다

```csharp
// 나쁜 예 — 같은 이름, 완전히 다른 동작
public class Vector
{
    private readonly List<double> values = new();

    // 리스트에 값을 하나 추가한다.
    public void Add(double number) => values.Add(number);

    // 시퀀스의 각 항목을 기존 값에 더한다.
    public void Add(IEnumerable<double> sequence)
    {
        int index = 0;
        foreach (double number in sequence)
        {
            if (index == values.Count) return;
            values[index++] += number;
        }
    }
}
```

**왜 나쁜가.** 두 `Add` 각각은 합리적이다. 그러나 같은 클래스에 같은 이름으로 있으면 안 된다. 하나는 컬렉션에 원소를 추가하고 다른 하나는 요소별 벡터 덧셈이다. 오버로드는 **매개변수 목록이 달라야 하지 동작이 달라서는 안 된다.** 후자는 `AddElementwise` 같은 다른 이름을 가져야 한다.

이 규칙이 지켜지면 그다음 문제들이 훨씬 덜 아프다. 컴파일러가 예상과 다른 오버로드를 골라도 **의미는 같기 때문**이다. 성능 특성만 달라진다.

### 두 번째 규칙 — 완전하게

```csharp
// 좋은 예 — 수치 오버로드를 빠짐없이
public void Scale(short scaleFactor)  { /* ... */ }
public void Scale(int scaleFactor)    { /* ... */ }
public void Scale(float scaleFactor)  { /* ... */ }
public void Scale(double scaleFactor) { /* ... */ }
```

`decimal`을 뺀 모든 수치 타입이 있으므로 컴파일러는 언제나 정확히 맞는 것을 부른다(`decimal` → `double`은 명시적 변환이라 후보가 아니다). 모호함이 없다.

```csharp
// 나쁜 예 — 중간을 비워둔 오버로드 집합
public void Scale(float scaleFactor)  { /* ... */ }
public void Scale(double scaleFactor) { /* ... */ }
```

**왜 나쁜가.** `Scale((short)3)`을 부르면 어느 쪽이 불릴까? `short` → `float`도, `short` → `double`도 암시적 변환이다. 컴파일러의 답은 `float`이다 — 모든 `float`은 `double`로 바꿀 수 있지만 그 반대는 아니므로 `float`이 더 "구체적"이다. 이 논리를 즉석에서 재구성할 수 있는 사용자가 몇이나 될까.

> **💡 완전성의 기준**
>
> "대부분의 개발자가 어느 오버로드가 불릴지 즉시 알 수 있는가?" 이것이 유일한 기준이다. 못 맞히면 오버로드가 모자라거나 너무 많은 것이다.

### 매개변수가 둘이 되면 급격히 어려워진다

```csharp
public class Point
{
    public double X { get; set; }
    public double Y { get; set; }

    public void Scale(int xScale, int yScale)       { X *= xScale; Y *= yScale; }
    public void Scale(double xScale, double yScale) { X *= xScale; Y *= yScale; }
}
```

```csharp
Point p = new Point { X = 5, Y = 7 };
p.Scale(5, 7L);   // 두 번째 인수가 long → Scale(double, double)이 호출된다
```

`(int, long)`을 넘겼다. 첫 인수는 `Scale(int,int)`에 정확히 맞지만 `long` → `int` 암시적 변환이 없으므로 그 오버로드는 **후보에도 오르지 못한다.** 남은 것은 `Scale(double,double)` 하나다. 논리는 맞지만 직관적이지 않다.

### 제네릭 메서드를 "빠진 경우 처리용"으로 넣지 마라

```csharp
// 나쁜 예 — 제네릭 폴백을 섞는다
public static class Utilities
{
    public static double Max(double left, double right) => Math.Max(left, right);

    public static T Max<T>(T left, T right) where T : IComparable<T> =>
        left.CompareTo(right) > 0 ? left : right;
}
```

```csharp
double a1 = Utilities.Max(1, 3);        // Max<int>       — 제네릭
double a2 = Utilities.Max(5.3, 12.7f);  // Max(double,double) — 비제네릭
double a3 = Utilities.Max(5, 12.7f);    // Max<float>     — 제네릭
```

**왜 나쁜가.** 세 줄이 세 가지 다른 메서드로 간다. 규칙은 이렇다 — **제네릭 메서드는 타입 치환만 성공하면 언제나 "완벽한 일치"가 된다.** 변환이 필요 없기 때문이다. 그래서 암시적 변환이 필요한 비제네릭 후보를 이긴다. `a2`만 비제네릭으로 간 이유는 `5.3`과 `12.7f`에 대해 하나의 `T`를 추론할 수 없어 제네릭이 후보에서 빠졌기 때문이다.

> **⚠️ 확장 메서드는 최후의 수단이지만, 최후의 수단이 실제로 쓰인다**
>
> 확장 메서드는 **적용 가능한 인스턴스 메서드가 하나도 없을 때에만** 검토된다. 이것은 좋은 성질이다. 그러나 뒤집으면 이런 뜻이기도 하다 — 인스턴스 메서드 집합이 조금이라도 바뀌면 이전에 확장 메서드로 가던 호출이 인스턴스 메서드로 옮겨간다. `using` 지시문 하나 추가·삭제로도 후보 집합이 달라진다. 이 미묘함을 API 사용자에게 떠넘기지 마라.

### 컴파일러가 후보를 찾는 곳

```text
                 obj.Method(args) 호출
                          │
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
  컴파일 타임 타입     그 기반 타입들      구현 인터페이스
  에 선언된 메서드     에 선언된 메서드    의 멤버
        │                 │                 │
        └────────┬────────┴─────────────────┘
                 ↓
        적용 가능한 후보가 있는가?
           ┌─────┴─────┐
        예 ↓           ↓ 아니오
   최선 하나 선택   확장 메서드 검색
   (없으면 CS0121)  (using 범위 안의
                    정적 클래스들)
                          ↓
                  그래도 없으면 CS1061
```

여기에 제네릭 메서드, 선택적 매개변수, `params`, 가변성이 겹치면 조합이 폭발한다. 후보를 늘리는 결정은 하나하나가 이 그림을 복잡하게 만드는 결정이다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 22 "Create Method Groups That Are Clear, Minimal, and Complete"를 바탕으로 한다. `Vector.Add`, `Scale`, `Utilities.Max` 예제가 원서의 것이다.

---

## 78.4 오버로드 폭발 대신 선택적 매개변수

### 문제 — Type.Missing의 시대

선택적 매개변수와 명명된 인수가 C# 4에 들어온 직접적 이유는 COM 상호 운용, 특히 Office API였다.

```csharp
var wasted = Type.Missing;
var wordApp = new Microsoft.Office.Interop.Word.Application();
wordApp.Visible = true;
Documents docs = wordApp.Documents;
Document doc = docs.Add(ref wasted, ref wasted, ref wasted, ref wasted);
Range range = doc.Range(0, 0);
range.InsertAfter("Testing, testing, testing. . .");
```

`Type.Missing`이 네 번 나온다. 실제 Office 앱에서는 이런 것이 수십 개씩 나와 로직을 가린다.

```csharp
var wordApp = new Microsoft.Office.Interop.Word.Application();
wordApp.Visible = true;
Documents docs = wordApp.Documents;
Document doc = docs.Add();          // 선택적 매개변수 덕분에
Range range = doc.Range(0, 0);
range.InsertAfter("Testing, testing, testing. . .");
```

네 번째 매개변수만 지정하고 싶다면 명명된 인수를 쓴다.

```csharp
object docType = WdNewDocumentType.wdNewWebPage;
Document doc = docs.Add(DocumentType: ref docType);
```

**매개변수 네 개를 자유롭게 조합하려면 오버로드가 16개 필요하다.** Office API 중에는 매개변수가 16개인 것도 있다. 선택적 매개변수는 그 조합 폭발을 없앤다.

### 그 대가 — 이름과 기본값이 계약이 된다

여기서부터가 API 설계자가 알아야 할 부분이다.

```csharp
private void SetName(string lastName, string firstName) { /* 생략 */ }
```

호출자는 이렇게 쓸 수 있다. 당신이 허락하든 말든.

```csharp
SetName(lastName: "Wagner", firstName: "Bill");
```

**형식 매개변수의 이름이 공개 인터페이스의 일부가 됐다.** 이름을 바꾸면 호출 코드가 컴파일되지 않는다.

```csharp
// v2에서 이렇게 바꾸면
public void SetName(string last, string first)
```

명명된 인수로 부르던 코드는 전부 컴파일 오류다.

### 무엇이 언제 깨지는가

여기서 두 종류의 호환성이 갈린다.

| 변경 | 소스 호환성 | 바이너리 호환성 |
|---|---|---|
| 매개변수 **이름** 변경 | **깨진다** — 명명된 인수 사용처 | 유지된다 |
| 선택적 매개변수 **기본값** 변경 | 유지된다 | **의미상 깨진다** — 옛 값이 그대로 |
| 선택적 매개변수 **추가** | 유지된다 | **깨진다** — `MissingMethodException` |
| 매개변수 **순서** 변경 | 대체로 깨진다 | 깨진다 |

이 표의 근거는 **명명·선택 인수가 컴파일되는 방식**에 있다. 매개변수 이름과 기본값은 **호출 지점(callsite)의 IL에 구워진다.** 호출되는 쪽이 아니라 호출하는 쪽이다.

```csharp
public void Log(string message, int priority = 3) { /* ... */ }

// 호출측: Log("hi");
```

이 호출은 IL에서 이렇게 나온다.

```il
IL_0001:  ldstr      "hi"
IL_0006:  ldc.i4.3                  // ← 기본값 3이 호출 지점에 박혔다
IL_0007:  callvirt   instance void Logger::Log(string, int32)
```

그래서 라이브러리에서 기본값을 `3`에서 `5`로 바꾸고 패치로 배포해도, **이미 컴파일된 호출자는 계속 3을 보낸다.** 다시 컴파일해야만 5가 된다.

> **⚠️ 선택적 매개변수 추가는 런타임 파괴적 변경이다**
>
> 이것이 가장 자주 사고를 내는 항목이다. `Log(string)` 시그니처를 `Log(string, int = 3)`으로 바꾸면 **컴파일은 문제없이 되지만**, 기존에 `Log(string)`을 호출하도록 컴파일된 어셈블리는 `void Log(string)`이라는 MemberRef를 갖고 있다. 그런 메서드는 이제 존재하지 않는다. 런타임에 `MissingMethodException`이 난다.
>
> 첫 릴리스에서는 선택적 매개변수를 마음껏 써라. **그 이후 릴리스에서는 매개변수를 추가할 때 반드시 오버로드를 새로 만들어라.**

```csharp
// v2에서 매개변수를 늘리는 올바른 방법
public void Log(string message) => Log(message, 3);               // 기존 시그니처 보존
public void Log(string message, int priority) { /* 실제 구현 */ }  // 선택적 매개변수가 아니다
```

> **⚠️ 인터페이스와 선택적 매개변수를 섞지 마라**
>
> 인터페이스 멤버에 선택적 매개변수를 선언하고 구현 클래스에서 **다른 기본값**을 주는 것이 문법상 허용된다. 그리고 어느 기본값이 쓰이는지는 **호출 지점의 컴파일 타임 타입**이 결정한다.
>
> ```csharp
> interface ILogger { void Log(string m, int priority = 3); }
> class Impl : ILogger { public void Log(string m, int priority = 9) { } }
>
> ILogger a = new Impl(); a.Log("x");   // priority == 3
> Impl     b = new Impl(); b.Log("x");  // priority == 9
> ```
>
> 같은 객체, 같은 메서드, 다른 값. 인터페이스에서는 기본값을 아예 쓰지 않는 편이 낫다.

> **⚠️ 명명된 인수의 평가 순서**
>
> 명명된 인수를 써서 순서를 바꿔 적어도 **인수 식은 소스에 적힌 순서대로 평가된다.** `Foo(b: Second(), a: First())`는 `Second()`를 먼저 부른다. 부작용이 있는 식을 명명된 인수로 재배치하면 읽는 사람의 직관과 어긋난다.

> **💡 명명된 인수는 호출자의 무기다**
>
> 같은 타입의 매개변수가 여럿인 메서드에서는 호출 지점에 이름을 붙이는 것이 가독성을 크게 올린다. `SetName("Wagner", "Bill")`보다 `SetName(lastName: "Wagner", firstName: "Bill")`이 낫다. API 저자 입장에서는 **매개변수 이름을 신중히 짓고 함부로 바꾸지 않는 것**이 그 무기를 지원하는 방법이다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 12 "Use Optional Parameters to Minimize Method Overloads"를 바탕으로 한다. 호출 지점 IL 분석은 저자의 보강이다.

---

## 78.5 내부 객체에 대한 참조를 반환하지 말 것

### 읽기 전용 프로퍼티가 읽기 전용이 아닐 때

```csharp
// 나쁜 예
public class MyBusinessObject
{
    public MyBusinessObject() => Data = new BindingList<ImportantData>();

    // 읽기 전용 프로퍼티로 private 데이터에 접근을 제공한다.
    public BindingList<ImportantData> Data { get; }
}
```

```csharp
BindingList<ImportantData> stuff = bizObj.Data;
stuff.Clear();   // 의도하지 않았지만 허용된다 — 데이터 전부 삭제
```

**왜 나쁜가.** `Data`에는 `set` 접근자가 없다. 그런데도 호출자가 내부 데이터를 통째로 지웠다. 참조 기반 시스템의 성질이다. **참조 타입을 반환하는 모든 멤버는 그 객체에 대한 핸들을 넘긴다.** 핸들을 받은 쪽은 더 이상 당신의 객체를 거칠 필요가 없다.

읽기·쓰기 프로퍼티였다면 이런 고민을 했을 것이다. 읽기 전용이라 안 했을 뿐이다. 그것이 이 실수가 흔한 이유다.

### 네 가지 방어 전략

| 전략 | 어떻게 막는가 | 대가 |
|---|---|---|
| **값 타입** | 프로퍼티 접근 시 복사된다 | 큰 구조체면 복사 비용 |
| **불변 타입** | 애초에 바꿀 수 없다 | 변경마다 새 객체 |
| **인터페이스** | 기능의 부분집합만 노출 | 캐스트로 우회 가능 |
| **래퍼** | 수정 메서드 자체가 없는 객체를 준다 | 래퍼 객체 할당 |

**값 타입**은 프로퍼티로 나갈 때 복사된다. 호출자가 복사본을 아무리 고쳐도 내부 상태는 그대로다.

**불변 타입**은 `System.String`이 대표적이다. 문자열은 안전하게 반환해도 된다.

**인터페이스**로 기능의 부분집합만 노출하는 것이 세 번째다. `BindingList<T>`는 제네릭 `IBindingList`가 없다는 문제가 있어서, 데이터 바인딩용과 프로그래밍용을 나눠서 내보내는 것이 실용적이다.

```csharp
public class MyBusinessObject
{
    private readonly BindingList<ImportantData> listOfData = new();

    public IBindingList BindingData => listOfData;                    // 데이터 바인딩용
    public ICollection<ImportantData> CollectionOfData => listOfData; // 프로그래밍용
}
```

**래퍼**가 가장 강한 방어다.

```csharp
// 좋은 예
public class MyBusinessObject
{
    private readonly BindingList<ImportantData> listOfData = new();

    public IBindingList BindingData => listOfData;

    public ReadOnlyCollection<ImportantData> CollectionOfData =>
        new ReadOnlyCollection<ImportantData>(listOfData);
}
```

`System.Collections.ObjectModel.ReadOnlyCollection<T>`는 컬렉션을 감싸 읽기 전용 뷰를 내보내는 표준 방법이다.

> **⚠️ `ReadOnlyCollection<T>`는 불변이 아니라 읽기 전용 뷰다**
>
> 감싼 쪽(`listOfData`)이 바뀌면 뷰도 바뀐다. 스냅숏이 필요하면 `ImmutableArray<T>`나 `ToArray()`를 써야 한다. 반대로 **매 호출마다 새 래퍼를 할당**하는 것도 문제다 — 위 코드의 `CollectionOfData`는 호출될 때마다 객체를 만든다. 뜨거운 경로라면 래퍼를 필드에 캐시하라.

> **⚠️ `BindingList<T>` 자체를 공개하면 정책까지 넘어간다**
>
> `BindingList<T>`에는 `AllowEdit`, `AllowNew`, `AllowRemove` 같은 **public 프로퍼티**가 있고 UI 컨트롤이 그 값을 존중한다. 컬렉션 타입 그대로 공개하면 클라이언트가 이 플래그를 뒤집어 읽기 전용 의도를 무력화할 수 있다. 인터페이스 타입으로 내보내면 이 표면이 사라진다.

### 노출한 뒤에 반응해야 한다면

UI 데이터 바인딩처럼 **일부러** 수정을 허용해야 하는 경우도 있다. 그때는 내부 자료 구조가 내는 이벤트를 당신의 클래스가 구독해서 검증하거나 다른 내부 상태를 갱신한다.

```csharp
public class MyBusinessObject
{
    private readonly BindingList<ImportantData> listOfData = new();

    public MyBusinessObject() => listOfData.ListChanged += OnListChanged;

    public IBindingList BindingData => listOfData;

    // 추가·수정·삭제를 검증하거나 파생 상태를 갱신한다.
    private void OnListChanged(object? sender, ListChangedEventArgs e) { }
}
```

> **⚠️ 배열 프로퍼티는 언제나 쓰기 가능하다**
>
> ```csharp
> private readonly int[] scores = new int[10];
> public int[] Scores => scores;      // 호출자가 scores[0] = 999 를 할 수 있다
> ```
>
> `readonly` 필드는 **참조**를 못 바꾸게 할 뿐 배열 **내용**은 보호하지 않는다. 배열을 내보내야 한다면 `ReadOnlySpan<int>`(68장)나 복사본을 줘라. `ReadOnlyMemory<int>`도 후보다.

> **💡 악의적 사용까지 막을 수는 없다**
>
> 인터페이스로 노출해도 `GetType()`으로 실제 타입을 알아내 캐스트하면 뚫린다. 리플렉션까지 동원하면 `private` 필드도 읽힌다. 목표는 **뚫을 수 없게 만드는 것**이 아니라 **실수로 뚫리지 않게 만드는 것**이다. 순진한 개발자가 무심코 API를 오용해 만든 버그를 당신 탓으로 돌리지 못하게 하는 것 — 그것만으로 충분한 값어치가 있다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 17 "Avoid Returning References to Internal Class Objects"를 바탕으로 한다.

---
## 78.6 API에서 변환 연산자를 피하라

### 변환 연산자가 약속하는 것

변환 연산자를 정의한다는 것은 컴파일러에게 **"내 타입을 대상 타입 자리에 대신 넣어도 된다"**고 말하는 것이다. 이 대체 가능성(substitutability)은 상속에서 오는 대체 가능성과 겉보기가 같지만 본질이 다르다. `Circle`을 `Shape` 자리에 넣는 것은 **같은 객체**를 다른 참조로 보는 것이다. 변환 연산자는 **다른 객체**를 만들어 넣는다.

`Shape`를 기반으로 `Circle`과 `Ellipse`가 각각 파생된 계층을 생각하자. 모든 원은 타원이므로 암시적 변환을 붙이고 싶어진다.

```csharp
public class Circle : Shape
{
    private Point center;
    private double radius;

    public Circle(Point c, double r) { center = c; radius = r; }

    public override void Draw() { /* ... */ }

    // 나쁜 예 — 암시적 변환 연산자
    public static implicit operator Ellipse(Circle c) =>
        new Ellipse(c.center, c.center, c.radius, c.radius);
}
```

읽기 전용 연산에서는 잘 동작하는 것처럼 보인다.

```csharp
public static double ComputeArea(Ellipse e) => e.R1 * e.R2 * Math.PI;

Circle c1 = new Circle(new Point(3.0, 0), 5.0);
ComputeArea(c1);      // 동작한다. 운이 좋았다.
```

### 무엇이 부서지는가

```csharp
public static void Flatten(Ellipse e) { e.R1 /= 2; e.R2 *= 2; }

Circle c = new Circle(new Point(3.0, 0), 5.0);
Flatten(c);           // 아무 일도 일어나지 않는다
```

**왜 나쁜가.** 컴파일러는 `Circle`을 `Ellipse`로 바꿔야 한다. 당신이 준 변환 연산자가 호출되고, `Flatten()`은 **그 자리에서 만들어진 임시 객체**를 받는다. 임시 객체가 납작해지고 곧바로 쓰레기가 된다. `c`는 그대로다. 부작용이 일어나긴 했는데 아무도 볼 수 없는 곳에서 일어났다.

명시적 변환으로 바꿔도 문제는 그대로다. 사용자에게 캐스트를 강제해서 **같은 버그를 직접 쓰게 만들** 뿐이다.

```csharp
Flatten((Ellipse)c);   // 여전히 임시 객체가 납작해지고 버려진다
```

### 좋은 예 — 생성자

```csharp
// 좋은 예 — 새 객체가 생긴다는 사실이 소스에 드러난다
Circle c = new Circle(new Point(3.0, 0), 5.0);
Flatten(new Ellipse(c));
```

이 두 줄을 보는 개발자 대부분은 즉시 알아챈다 — `Flatten()`에 넘긴 타원에 가한 변경은 어디에도 남지 않는다. 그래서 자연스럽게 이렇게 고친다.

```csharp
Circle c = new Circle(new Point(3.0, 0), 5.0);
// 원으로 할 일을 한다
// ...
// 타원으로 변환한다
Ellipse e = new Ellipse(c);
Flatten(e);            // e에 결과가 남는다
```

기능은 하나도 잃지 않았다. **새 객체가 언제 생기는지가 명확해졌을 뿐이다.**

> **📌 C#은 변환에 생성자를 호출하지 않는다**
>
> C++에서 온 사람이 자주 오해하는 지점이다. C#에서 객체는 **`new` 연산자를 명시적으로 쓸 때에만** 만들어진다. 암시적·명시적 변환이 생성자를 부르는 일은 없다. 그래서 C++의 `explicit` 생성자 키워드에 해당하는 것도 C#에는 없다.

> **⚠️ 필드를 반환하는 변환 연산자는 캡슐화를 뚫는다**
>
> 임시 객체 대신 **내부 필드**를 반환하는 변환 연산자는 위의 "부작용 소실" 문제는 없다. 대신 78.5절의 문제를 정확히 일으킨다. 클라이언트가 캐스트 하나로 당신의 내부 변수를 손에 넣는다. 어느 쪽이든 좋을 것이 없다.

> **⚠️ 변환은 컴파일 타임 타입으로 결정된다**
>
> 변환 연산자 호출 여부는 **런타임 타입이 아니라 컴파일 타임 타입**을 보고 결정된다. 그래서 계층이 깊어지면 사용자가 원하는 변환에 도달하기 위해 캐스트를 두 번 써야 하는 상황이 생긴다. `((Ellipse)(Shape)x)` 같은 코드가 API 사용법이 되면 그 API는 실패한 것이다.

> **💡 변환 연산자를 써도 되는 좁은 자리**
>
> 완전히 금지는 아니다. **값 의미론을 갖는 작은 불변 타입** 사이의 손실 없는 변환이라면 합리적이다. BCL의 예로 `System.Numerics.BigInteger`가 정수 타입에서 오는 암시적 변환을 갖고 있고, `ReadOnlySpan<T>`가 배열에서 오는 암시적 변환을 갖고 있다. 공통점은 셋이다. (1) 대상이 불변이거나 뷰라서 "부작용 소실" 문제가 없고, (2) 손실이 없으며, (3) 변환 방향이 명백하다. 셋 중 하나라도 어긋나면 생성자나 `ToXxx()` 메서드를 써라. 손실이 있는 방향은 반드시 `explicit`이다(22.4절).

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 11 "Avoid Conversion Operators in Your APIs"를 바탕으로 한다. 연산자 오버로딩의 문법과 IL 표현은 22장에서 다뤘다.

---

## 78.7 `ICloneable`이 설계 선택지를 좁히는 이유

### 정의부터 모호하다

`ICloneable`은 멤버가 하나뿐인 인터페이스다.

```csharp
public interface ICloneable
{
    object Clone();
}
```

문제는 이 `Clone()`이 **얕은 복사인지 깊은 복사인지 규정하지 않는다는 것**이다. 얕은 복사는 모든 필드를 그대로 복사한다 — 참조 필드는 같은 객체를 가리킨다. 깊은 복사는 참조가 가리키는 객체까지 재귀적으로 복제한다. 내장 타입만 담은 타입에서는 둘이 같은 결과를 낸다. 그 외에는 완전히 다르다.

인터페이스가 답을 안 하므로 **구현자마다 답이 다르다.** 그리고 그 답을 호출자가 알 방법이 없다.

### 값 타입 — 절대 구현하지 마라

```csharp
// 나쁜 예 — 구조체에 ICloneable
public struct ErrorMessage : ICloneable
{
    private int errCode;
    private string msg;

    public object Clone() => this;    // 박싱된다
}
```

**왜 나쁜가.** 구조체는 대입만으로 이미 모든 필드가 복사된다. `Clone()`은 그보다 **느리다.** 반환 타입이 `object`이므로 박싱이 일어나고(15장), 호출자는 언박싱을 위해 캐스트를 한 번 더 해야 한다. 대입이 하는 일을 두 번의 낭비를 얹어 다시 하는 셈이다.

참조 필드를 가진 구조체는? 위 예의 `msg`는 `string`이라 괜찮다. 문자열은 불변이므로 두 구조체가 같은 문자열을 가리켜도 문제가 없다. 어느 쪽에서 `msg`를 바꿔도 새 문자열이 생길 뿐이다. 임의의 가변 참조 필드를 가진 구조체는 훨씬 드물고 훨씬 복잡하며, 그때도 `ICloneable`은 답이 아니다.

### 참조 타입 — 전염된다

```csharp
// 나쁜 예 — 비봉인 기반 클래스에 ICloneable
class BaseType : ICloneable
{
    private string label = "class name";
    private int[] values = new int[10];

    public object Clone()
    {
        BaseType rVal = new BaseType { label = this.label };
        Array.Copy(values, rVal.values, values.Length);
        return rVal;                      // 언제나 BaseType이다
    }
}

class Derived : BaseType
{
    private double[] dValues = new double[10];
}
```

```csharp
Derived d = new Derived();
Derived? d2 = d.Clone() as Derived;
Console.WriteLine(d2 is null);      // True
```

**왜 나쁜가.** `Derived`는 `ICloneable.Clone()`을 `BaseType`에서 물려받는다. 그런데 그 구현은 `Derived`에 맞지 않는다 — `new BaseType()`을 만들기 때문이다. `as Derived`가 `null`을 낸다. 이 문제를 넘긴다 해도 `BaseType.Clone()`은 `Derived`가 추가한 `dValues`를 복사할 방법이 없다.

**`ICloneable`을 구현하면 모든 파생 클래스가 구현해야 한다.** 그리고 파생 클래스는 값 타입이거나 `ICloneable`을 구현한 참조 타입만 필드로 가질 수 있게 된다. 비봉인 클래스에 걸기에는 지나치게 무거운 제약이다.

### 계층 전체가 복제를 지원해야 한다면

정말로 필요하다면 **보호된 복사 생성자**를 쓴다.

```csharp
// 좋은 예
class BaseType
{
    private string label;
    private int[] values;

    protected BaseType() { label = "class name"; values = new int[10]; }

    // 파생 클래스가 복제할 때 쓰는 복사 생성자
    protected BaseType(BaseType right)
    {
        label = right.label;
        values = (int[])right.values.Clone();
    }
}

sealed class Derived : BaseType, ICloneable
{
    private double[] dValues;

    public Derived() { dValues = new double[10]; }

    // 기반 클래스 복사 생성자를 이용해 복사본을 만든다
    private Derived(Derived right) : base(right)
        => dValues = (double[])right.dValues.Clone();

    public object Clone() => new Derived(this);
}
```

규칙은 이렇게 정리된다.

- **기반 클래스는 `ICloneable`을 구현하지 않는다.** 대신 `protected` 복사 생성자를 제공한다.
- **잎(leaf) 클래스만** 필요할 때 `ICloneable`을 구현한다. 그리고 그 잎 클래스는 `sealed`여야 한다.

> **📌 `ICloneable<T>`는 끝내 만들어지지 않았다**
>
> .NET에 제네릭이 들어올 때 `IComparable`에는 `IComparable<T>`가, `IEnumerable`에는 `IEnumerable<T>`가 생겼다. `ICloneable`에는 `ICloneable<T>`가 **생기지 않았다.** 이것은 우연이 아니라 프레임워크 설계자들의 판단이다. .NET 설계 지침도 `ICloneable`을 새 코드에서 구현하지 말 것을 권한다.

> **💡 현대 C#의 대안 — 레코드와 `with` 식**
>
> ※C# 9의 레코드는 이 문제를 언어 차원에서 정리했다. 레코드는 컴파일러가 만든 **`protected` 복사 생성자**를 갖고, `with` 식이 그것을 호출한다. 파생 레코드에서도 올바른 런타임 타입이 나오도록 컴파일러가 `<Clone>$`라는 이름의 가상 메서드를 합성한다 — C# 식별자로는 쓸 수 없는 이름이라 사용자 코드와 충돌하지 않는다. 즉 **위에서 손으로 만든 복사 생성자 패턴을 레코드가 자동으로 구현해준다.**
>
> ```csharp
> public record Point(int X, int Y);
> public record Point3D(int X, int Y, int Z) : Point(X, Y);
>
> Point p = new Point3D(1, 2, 3);
> Point q = p with { X = 9 };
> Console.WriteLine(q.GetType().Name);   // Point3D — 올바른 런타임 타입
> ```
>
> 다만 `with`가 만드는 것은 **얕은 복사**다. 깊은 복사가 필요하면 여전히 손으로 써야 한다.

> **⚠️ `MemberwiseClone()`은 얕은 복사이고 생성자를 부르지 않는다**
>
> `object.MemberwiseClone()`은 `protected`이며 **생성자를 실행하지 않고** 필드를 그대로 복사한다. `readonly` 필드도 복사되고, 파이널라이저 등록 상태나 락 상태 같은 것은 복사되지 않는다. 편해 보이지만 불변식을 생성자에서 세우는 타입에서는 쓰면 안 된다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 24 "Avoid ICloneable because it limits your design choices"를 바탕으로 한다. 레코드와 `<Clone>$` 논의는 저자의 보강이다.

---

## 78.8 기본 클래스에 정의된 메서드 오버로딩 회피

### 이름은 의미를 갖는다

기반 클래스가 멤버의 이름을 고를 때 그 이름에 **의미를 부여한 것**이다. 파생 클래스가 같은 이름을 다른 목적으로 쓰는 것은 어떤 경우에도 안 된다. 그런데 같은 이름을 같은 목적으로 쓰고 싶은 상황은 있다 — 다른 매개변수로 같은 의미를 구현하고 싶을 때.

언어는 그것을 위해 `virtual`을 제공한다. 그런데 `virtual` 대신 **오버로드**를 만들면 어떻게 되는지 보자.

```csharp
public class Fruit { }
public class Apple : Fruit { }

public class Animal { public void Foo(Apple parm) => Console.WriteLine("In Animal.Foo"); }
```

```csharp
var obj1 = new Animal();
obj1.Foo(new Apple());     // "In Animal.Foo"
```

여기까지는 뻔하다. 파생 클래스에 오버로드를 추가한다.

```csharp
// 나쁜 예 — 기반 클래스 메서드를 오버로드
public class Tiger : Animal
{
    public void Foo(Fruit parm) => Console.WriteLine("In Tiger.Foo");
}
```

```csharp
var obj2 = new Tiger();
obj2.Foo(new Apple());     // "In Tiger.Foo"   ← Animal.Foo가 더 정확한 일치인데도
obj2.Foo(new Fruit());     // "In Tiger.Foo"
```

**왜 나쁜가.** 첫 줄에서 `Apple`을 넘겼으니 `Animal.Foo(Apple)`이 불릴 것 같다. 아니다. 규칙은 이렇다 — **컴파일 타임 타입 중 가장 파생된 타입에 후보 메서드가 있으면 그것이 더 나은 메서드다.** 기반 클래스에 더 정확한 일치가 있어도 그렇다. 근거는 "파생 클래스 저자가 그 시나리오를 더 잘 안다"는 것이고, 오버로드 해석에서 가장 무겁게 취급되는 인수는 수신자(`this`)다.

한 걸음 더.

```csharp
Animal obj3 = new Tiger();
obj3.Foo(new Apple());     // "In Animal.Foo"
```

`obj3`의 **컴파일 타임 타입**은 `Animal`이다. 런타임 타입이 `Tiger`여도 `Foo`는 가상이 아니므로 `Animal.Foo`로 해석된다. 같은 객체를 어떤 변수에 담느냐가 동작을 바꾼다.

사용자가 자기가 원하는 메서드를 부르려면 캐스트를 써야 한다.

```csharp
var obj4 = new Tiger();
((Animal)obj4).Foo(new Apple());
obj4.Foo(new Fruit());
```

**API가 사용자에게 이런 코드를 강요한다면 그 API는 실패한 것이다.**

### 선택적 매개변수를 섞으면 더 나빠진다

```csharp
public class Animal
{
    public void Foo(Apple parm) => Console.WriteLine("In Animal.Foo");
    public void Bar(Fruit parm) => Console.WriteLine("In Animal.Bar");   // 새로 추가
}
```

```csharp
var obj1 = new Tiger();
obj1.Bar(new Apple());     // "In Animal.Bar"
```

이제 파생 클래스에 선택적 매개변수를 가진 오버로드를 추가한다.

```csharp
public class Tiger : Animal
{
    public void Foo(Apple parm) => Console.WriteLine("In Tiger.Foo");
    public void Bar(Fruit parm1, Fruit? parm2 = null) => Console.WriteLine("In Tiger.Bar");
}
```

```csharp
var obj1 = new Tiger();
obj1.Bar(new Apple());     // "In Tiger.Bar"   ← 바뀌었다
```

**한 줄도 고치지 않은 호출 코드가 다른 메서드로 간다.** 다시 컴파일하는 것만으로 동작이 바뀌었다. 기반 클래스 메서드로 돌아가려면 다시 캐스트다.

### 제네릭과 가변성이 겹치면

```csharp
public class Animal { public void Baz(IEnumerable<Apple> parm) => Console.WriteLine("In Animal.Baz"); }
public class Tiger : Animal { public void Baz(IEnumerable<Fruit> parm) => Console.WriteLine("In Tiger.Baz"); }
```

```csharp
var sequence = new List<Apple> { new Apple(), new Apple() };
var obj2 = new Tiger();
obj2.Baz(sequence);        // "In Tiger.Baz"
```

`Tiger.Baz`가 불린다. 이유는 `IEnumerable<out T>`가 공변이기 때문이다 — `IEnumerable<Apple>`은 `IEnumerable<Fruit>`으로 변환되므로 `Tiger.Baz`도 후보가 되고, 파생 타입 우선 규칙이 그것을 고른다.

> **⚠️ 이 결과는 C# 4에서 한 번 바뀐 적이 있다**
>
> C# 4 이전에는 제네릭 인터페이스가 전부 불변이었다. 그때 `Tiger.Baz`는 **후보에도 오르지 못했고** `Animal.Baz`가 불렸다. 즉 **컴파일러 버전만 올려도 어느 메서드가 불리는지가 바뀐 사례가 실제로 있었다.** 오버로드 해석 규칙에 기대는 API 설계가 얼마나 취약한지를 보여주는 역사적 증거다.

### 해법

```csharp
// 좋은 예 — 다른 이름을 쓴다
public class Tiger : Animal
{
    public void FeedFruit(Fruit parm) => Console.WriteLine("In Tiger.FeedFruit");
}
```

끝이다. 이름을 하나 더 생각해내는 것이 사용자 전원에게 오버로드 해석 규칙을 요구하는 것보다 싸다.

정말로 다형적 동작이 필요했다면 기반 클래스 저자가 `virtual`을 붙였어야 한다. 그 결정은 파생 클래스가 뒤늦게 내릴 수 없다.

> **💡 실무 규칙 세 줄**
>
> 1. 파생 클래스에서 기반 클래스 메서드 이름을 **오버로드하지 마라.**
> 2. 오버라이드가 필요하면 기반 클래스에 `virtual`을 넣어라 — 나중에 오버로드로 흉내 낼 수 없다.
> 3. `new` 한정자는 기반 클래스 업그레이드로 이름이 충돌했을 때에만 쓴다(79.8절).

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 19 "Avoid Overloading Methods Defined in Base Classes"를 바탕으로 한다. 오버로드 해석 규칙 자체는 14.8절에서 다뤘다.

---
## 78.9 배열 매개변수는 `params` 배열로 제한

### 배열은 공변이고, 그 공변은 안전하지 않다

다음 코드는 컴파일 타임 타입 검사를 전부 통과한다. 그리고 런타임에 터진다.

```csharp
string[] labels = { "one", "two", "three", "four", "five" };
ReplaceIndices(labels);          // ArrayTypeMismatchException

static void ReplaceIndices(object[] parms)
{
    for (int i = 0; i < parms.Length; i++)
        parms[i] = i;            // string[] 에 int를 넣으려 한다
}
```

**왜 나쁜가.** 배열은 **입력 매개변수로 쓸 때 공변**이다. `string[]`을 `object[]` 자리에 넘길 수 있다. 그러나 그 안에 아무 `object`나 넣을 수는 없다. CLR은 배열의 각 저장 연산마다 **런타임 타입 검사**를 하고, 어긋나면 `ArrayTypeMismatchException`을 던진다. 컴파일러는 이 사고를 막아주지 못한다.

이 예는 눈에 보이지만 실제 코드는 이렇게 생기지 않는다.

```csharp
class B  { public static B Factory() => new B();  }
class D1 : B { public static new B Factory() => new D1(); }
class D2 : B { public static new B Factory() => new D2(); }

static void FillArray(B[] array, Func<B> generator)
{
    for (int i = 0; i < array.Length; i++)
        array[i] = generator();
}
```

올바르게 쓰면 아무 문제가 없다.

```csharp
B[] storage = new B[10];
FillArray(storage, () => B.Factory());
FillArray(storage, () => D1.Factory());
FillArray(storage, () => D2.Factory());
```

배열의 실제 타입이 어긋나면 같은 코드가 터진다. 그런데 **어느 줄이 터지는지는 호출 지점에서 보이지 않는다.**

```csharp
B[] storage = new D1[10];                 // 공변이므로 대입은 된다
FillArray(storage, () => B.Factory());    // ArrayTypeMismatchException
FillArray(storage, () => D1.Factory());   // 통과한다
FillArray(storage, () => D2.Factory());   // ArrayTypeMismatchException
```

> **⚠️ 왜 가운데 줄만 통과하는가**
>
> `FillArray`의 시그니처는 `B[]`를 받지만 실제로 들어온 배열의 원소 타입은 `D1`이다. CLR의 배열 저장 검사(`stelem.ref`)는 값의 **정적 타입이 아니라 실제 타입**과 배열의 원소 타입을 비교한다. `D1` 객체를 `D1[]`에 넣는 것은 정당하므로 통과하고, `B`나 `D2` 객체를 넣는 것은 `ArrayTypeMismatchException`이다. **세 줄 모두 컴파일러 검사를 통과했고 시그니처도 동일한데 결과가 다르다** — 이것이 배열 공변의 본질적 문제다.

배열은 반공변도 아니다. 아래 코드는 논리적으로 안전한데 컴파일되지 않는다.

```csharp
static void FillArray(D1[] array) { for (int i = 0; i < array.Length; i++) array[i] = new D1(); }

B[] storage = new B[10];
FillArray(storage);   // CS1503 — D1 객체를 B 배열에 넣는 것은 안전한데도 거부된다
```

### 대안 — 의도를 시그니처에 적어라

| 매개변수의 의미 | 써야 할 타입 |
|---|---|
| 읽기만 하는 시퀀스 | `IEnumerable<T>` |
| 읽기만 하고 개수·인덱스가 필요 | `IReadOnlyList<T>` |
| 연속 메모리를 읽기만 | `ReadOnlySpan<T>` |
| 제자리에서 수정 | `Span<T>` 또는 `IList<T>` — 정말 필요한지 재고 |
| 변환 결과가 필요 | 입력은 `IEnumerable<T>`, 출력은 반환값 |
| 임의 개수의 옵션 | `params` |

`IEnumerable<T>`로 받으면 **수정 메서드가 없으므로** 호출자가 안심한다. 배열로 받으면 시그니처만 보고는 "이 메서드가 내 배열 원소를 갈아치우나?"를 알 수 없다. **시그니처가 답하지 못하는 질문을 남기지 마라.**

### `params`가 나은 이유

임의 개수의 인수를 받아야 할 때는 배열 대신 `params`를 쓴다.

```csharp
// 일반 배열
static void WriteOutput1(object[] stuffToWrite)
{
    foreach (object o in stuffToWrite) Console.WriteLine(o);
}

// params 배열
static void WriteOutput2(params object[] stuffToWrite)
{
    foreach (object o in stuffToWrite) Console.WriteLine(o);
}
```

메서드 본문은 사실상 같다. 호출 지점이 다르다.

```csharp
WriteOutput1(new string[] { "one", "two", "three", "four", "five" });
WriteOutput2("one", "two", "three", "four", "five");
```

인수를 하나도 안 주고 싶을 때 차이가 극명해진다.

```csharp
WriteOutput2();                    // 컴파일러가 빈 배열을 만들어준다

WriteOutput1();                    // CS7036 — 컴파일 안 된다
WriteOutput1(null);                // 넘어가지만 foreach에서 NullReferenceException
WriteOutput1(new object[] { });    // 유일하게 맞는 방법. 타이핑이 길다
```

`params`가 배열 공변 문제로부터 완전히 자유롭지는 않다. 그러나 훨씬 안전하다. **컴파일러가 배열을 만들고 정확한 타입을 고른다.** 컴파일러가 만든 임시 배열을 메서드 안에서 고쳐봤자 호출자에게 아무 영향이 없으니 그런 코드를 쓸 이유도 없다. 이 예외를 재현하려면 호출자가 일부러 다른 타입의 실제 배열을 만들어 `params` 자리에 넘겨야 한다 — 가능하지만 병적인 코드다.

> **⚠️ `params object[]`에 배열 하나를 넘기면 어느 쪽인지 모호하다**
>
> ```csharp
> object[] items = { 1, 2, 3 };
> WriteOutput2(items);       // 원소 3개인가, 원소 1개(배열 자체)인가?
> ```
>
> 답은 "원소 3개"다. 컴파일러는 **일반 형태(normal form)를 확장 형태(expanded form)보다 먼저** 시도하고, `object[]`는 `object[]` 매개변수에 그대로 들어맞는다. 배열 자체를 한 원소로 넣고 싶다면 `WriteOutput2(new object[] { items })`처럼 한 겹 더 싸야 한다. 이 모호함이 `params object[]` API를 쓰기 불편하게 만드는 주된 이유다.

> **⚠️ `params` 배열에 `null`을 그대로 넘길 수 있다**
>
> `WriteOutput2(null)`은 빈 배열이 아니라 **`null` 배열**을 넘긴다. `params` 메서드 본문에서는 언제나 `null` 검사를 해야 한다. 컴파일러가 배열을 만들어주는 것은 인수를 개별로 나열했을 때뿐이다.

### ※C# 13 — `params` 컬렉션

C# 13은 `params`의 대상을 배열 밖으로 넓혔다(76.12절). 이제 `params`는 컬렉션 식(collection expression)으로 만들 수 있는 거의 모든 타입에 붙는다 — `Span<T>`, `ReadOnlySpan<T>`, `List<T>`, `IEnumerable<T>`, `IReadOnlyList<T>`, 그리고 `CollectionBuilder` 특성을 가진 사용자 타입까지.

```csharp
// ※C# 13
static void WriteOutput3(params ReadOnlySpan<object> stuffToWrite)
{
    foreach (object o in stuffToWrite) Console.WriteLine(o);
}

WriteOutput3("one", "two", "three");   // 호출 문법은 동일하다
```

무엇이 달라지는가.

| | `params T[]` | `params ReadOnlySpan<T>` ※C# 13 |
|---|---|---|
| 인수 저장 위치 | 항상 힙 배열 | 스택 버퍼 가능 |
| 호출당 할당 | 인수가 있으면 배열 1개 | 대개 0 |
| 메서드 안에서 수정 | 가능 (하지만 무의미) | 불가 (읽기 전용) |
| 배열 공변 사고 | 이론상 가능 | 원천적으로 없음 |
| `null` 전달 | 가능 | 불가 — 빈 스팬이 된다 |
| `netstandard2.0` | 가능 | 불가 |

핵심은 **할당이 사라진다는 것**이다. 로깅이나 포매팅처럼 초당 수만 번 호출되는 API에서 호출마다 `object[]`를 하나씩 만들던 비용이 없어진다. .NET 9의 BCL은 `string.Join`을 비롯한 여러 메서드에 `params ReadOnlySpan<T>` 오버로드를 추가했다.

> **⚠️ 기존 `params T[]` 옆에 `params ReadOnlySpan<T>`를 추가하면 조용히 동작이 바뀐다**
>
> 두 오버로드가 모두 적용 가능할 때 **스팬 쪽이 더 나은 후보로 선택된다.** BCL이 바로 이 성질을 이용해 소스 호환성을 유지하며 할당을 없앴다. 그러나 이것은 곧 **당신의 라이브러리에서 같은 일을 하면 재컴파일한 사용자의 호출이 다른 메서드로 옮겨간다**는 뜻이다. 두 오버로드의 의미가 완전히 동일하지 않다면 절대 하지 마라. 그리고 스팬 오버로드에서 인수를 **저장**하면 안 된다 — 스택 버퍼는 메서드가 반환되면 사라진다.

> **⚠️ `params Span<T>`를 반환값이나 필드에 담지 마라**
>
> `ref struct`인 `Span<T>`는 애초에 필드에 담을 수 없다(68장). 그런데 `params IEnumerable<T>`를 쓴 경우에는 담을 수 있고, 그러면 **컴파일러가 만든 임시 컬렉션의 수명**을 넘겨 잡게 된다. `params` 인수를 메서드 수명 밖으로 보관해야 한다면 명시적으로 복사하라.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 25 "Limit Array Parameters to Params Arrays"를 바탕으로 한다. `params` 컬렉션은 원서 출간 이후의 기능으로 저자의 보강이다.

---

## 78.10 이벤트가 늘리는 런타임 결합 이해하기

### 이벤트는 결합을 없애는 것이 아니라 옮긴다

이벤트는 통지받을 타입을 전혀 모른 채 통지를 보낼 수 있게 해준다. 컴파일 타임 의존성이 사라진다. 그래서 "느슨한 결합"이라고 부른다. 절반만 맞는 말이다. **컴파일 타임 결합이 줄어든 대신 런타임 결합이 늘어난다.** 그리고 런타임 결합은 컴파일러가 검사해주지 않는다.

먼저 이벤트를 제대로 선언하는 법부터 확인하자(27.2절).

```csharp
public class Logger
{
    static Logger() { Singleton = new Logger(); }
    private Logger() { }
    public static Logger Singleton { get; }

    // 이벤트 정의
    public event EventHandler<LoggerEventArgs>? Log;

    // 메시지를 추가하고 기록한다.
    public void AddMsg(int priority, string msg) =>
        Log?.Invoke(this, new LoggerEventArgs(priority, msg));
}
```

`?.` 연산자가 구독자가 하나라도 있을 때에만 이벤트를 발생시킨다. 필드 형태(field-like) 이벤트를 선언하면 컴파일러가 `private` 백킹 필드와 `add`/`remove` 접근자를 만들어준다 — 대략 `add { log = log + value; }`에 해당하되 실제로는 `Interlocked.CompareExchange` 루프로 스레드 안전을 보장한다(27.1절). 손으로 `add`/`remove`를 쓸 이유는 **접근자에서 추가 작업을 해야 할 때**뿐이다.

### 결합 1 — 상태 플래그가 만드는 구독자 간 결합

```csharp
// 나쁜 예 — 가변 이벤트 인수로 취소를 받는다
public class WorkerEngine
{
    public event EventHandler<WorkerEventArgs>? OnProgress;

    public void DoLotsOfStuff()
    {
        for (int i = 0; i < 100; i++)
        {
            SomeWork();
            var args = new WorkerEventArgs { Percent = i };
            OnProgress?.Invoke(this, args);
            if (args.Cancel) return;
        }
    }

    private void SomeWork() { /* 생략 */ }
}
```

**왜 나쁜가.** 구독자가 둘이면 첫 번째가 `Cancel = true`로 설정한 것을 두 번째가 `false`로 되돌릴 수 있다. **마지막 구독자가 앞의 모두를 덮어쓴다.** 구독자를 하나로 강제할 방법이 없고, 자기가 마지막인지 알 방법도 없다.

```csharp
// 좋은 예 — 한 방향으로만 바뀌게 만든다
public class WorkerEventArgs : EventArgs
{
    public int Percent { get; set; }
    public bool Cancel { get; private set; }
    public void RequestCancel() => Cancel = true;   // 되돌릴 수 없다
}
```

이제 취소는 되돌릴 수 없다. 그러나 이것으로 해결되지 않는 경우도 있다. **정확히 하나의 구독자**를 보장해야 한다면 이벤트가 잘못된 도구다. 그때는 인터페이스를 정의해 그 메서드 하나를 부르거나, 델리게이트를 매개변수로 받아라.

```csharp
// 구독자가 하나여야 한다면 이벤트가 아니라 델리게이트/인터페이스
public class WorkerEngine(IProgressObserver observer)
{
    public void DoLotsOfStuff()
    {
        for (int i = 0; i < 100; i++)
        {
            SomeWork();
            if (!observer.ReportProgress(i)) return;   // 취소 의미론은 구독자가 정한다
        }
    }
}
```

이렇게 하면 여러 구독자를 지원할지, 취소 의미론을 어떻게 조율할지를 **그 하나의 구독자가 결정한다.**

### 결합 2 — 수명

```text
  이벤트 원본                      구독자
 ┌──────────────┐   델리게이트   ┌──────────────┐
 │ WorkerEngine │ ────────────→ │ ProgressView │
 │  OnProgress  │   강한 참조    │              │
 └──────────────┘               └──────────────┘
        ↑                              │
        └──────────────────────────────┘
              구독자가 원본을 참조 (보통)

  → 원본이 살아 있는 한 구독자는 GC 대상이 되지 않는다
```

이벤트 원본은 구독자를 나타내는 델리게이트에 대한 **강한 참조**를 갖는다. 델리게이트는 대상 객체(`Target`)를 참조한다. 따라서 **구독자의 수명이 원본의 수명에 묶인다.** 원본이 오래 사는 싱글턴이면 구독자는 영원히 수집되지 않는다.

`IDisposable`의 계약은 폐기된 객체에 다른 메서드를 부르지 않는 것이다. 그런데 이벤트 원본은 그 계약을 모른다. 그래서 **구독자가 `Dispose()`에서 이벤트를 해제해야 한다.**

```csharp
public sealed class ProgressView : IDisposable
{
    private readonly WorkerEngine engine;

    public ProgressView(WorkerEngine engine)
        => (this.engine = engine).OnProgress += HandleProgress;

    private void HandleProgress(object? sender, WorkerEventArgs e) { /* ... */ }

    public void Dispose() => engine.OnProgress -= HandleProgress;   // 반드시 해제한다
}
```

> **⚠️ 람다로 구독하면 해제할 수 없다**
>
> ```csharp
> engine.OnProgress += (s, e) => Update(e.Percent);   // 해제 불가
> ```
>
> `-=`는 **같은 델리게이트**를 요구한다. 람다는 매번 새 델리게이트 인스턴스를 만들므로 나중에 같은 것을 다시 만들어낼 수 없다. 해제할 계획이 있다면 델리게이트를 필드에 담아두거나 메서드 그룹으로 구독하라. 누수를 원천적으로 막는 약한 이벤트 패턴은 27.7절에서 다룬다.

### 결합 3 — 순서 의존

멀티캐스트 델리게이트는 **구독된 순서대로** 핸들러를 호출한다. 이것은 구현 사실이지 언어 명세가 보장하는 계약이 아니다.

```csharp
// 나쁜 예 — 순서에 의존하는 설계
saveButton.Click += ValidateForm;    // 먼저 검증하고
saveButton.Click += SaveToDatabase;  // 그다음 저장한다고 가정
```

**왜 나쁜가.** 다른 코드가 `SaveToDatabase`보다 먼저 구독하면 순서가 뒤집힌다. 구독 시점을 한곳에서 통제할 수 없는 구조(예: 플러그인, XAML, DI 컨테이너)에서는 순서를 보장할 방법이 아예 없다. **순서가 의미를 갖는다면 그것은 이벤트가 아니라 파이프라인이다.** 파이프라인은 명시적인 리스트로 모델링하라.

### 결합 4 — 예외 전파

```csharp
public class Source
{
    public event EventHandler? Ping;
    public void Raise() => Ping?.Invoke(this, EventArgs.Empty);
}

source.Ping += (s, e) => throw new InvalidOperationException("첫 번째");
source.Ping += (s, e) => Console.WriteLine("두 번째");   // 절대 실행되지 않는다
source.Raise();   // InvalidOperationException이 Raise() 호출자에게 전파된다
```

**핸들러 하나가 던지면 나머지 핸들러는 호출되지 않는다.** 그리고 예외는 이벤트를 발생시킨 코드로 전파된다. 이벤트 원본은 자기가 부르지도 않은 남의 코드 때문에 예외를 받는다.

모든 구독자에게 반드시 통지해야 한다면 호출 목록을 직접 순회한다.

```csharp
public void RaiseAll()
{
    var handlers = Ping;
    if (handlers is null) return;

    List<Exception>? failures = null;
    foreach (EventHandler handler in handlers.GetInvocationList())
    {
        try { handler(this, EventArgs.Empty); }
        catch (Exception ex) { (failures ??= new()).Add(ex); }
    }
    if (failures is not null) throw new AggregateException(failures);
}
```

> **💡 그래도 대개는 순회하지 마라**
>
> 위 코드는 "모든 구독자가 반드시 통지받아야 한다"가 진짜 요구사항일 때만 쓴다. 대부분의 경우 구독자가 던진 예외는 **삼켜서는 안 되는 버그**다. 조용히 모아 삼키면 진단이 불가능해진다. 이벤트 원본의 기본 정책은 "그대로 전파"가 옳다.

### 결합 5 — 재진입

핸들러가 실행 중에 `Ping -= ...`으로 자기 자신이나 다른 핸들러를 해제하면 어떻게 될까? **이미 시작된 호출은 영향을 받지 않는다.**

이유는 델리게이트가 **불변**이기 때문이다. `-=`는 기존 델리게이트를 수정하는 것이 아니라 **새 델리게이트를 만들어 필드에 대입**한다. `Invoke`는 대입 이전에 읽어둔 옛 호출 목록을 순회한다. 그래서 **방금 구독을 해제한 핸들러가 그 회차에는 여전히 호출된다.**

```csharp
EventHandler? h = null;
h = (s, e) => { source.Ping -= h; Console.WriteLine("호출됨"); };  // 이번 회차에는 여전히 호출된다
source.Ping += h;
```

핸들러가 다시 `Raise()`를 부르는 재진입도 마찬가지로 아무도 막아주지 않는다. 무한 재귀가 스택 오버플로로 끝난다.

> **⚠️ 이벤트 발생 중에 상태를 바꾸지 마라**
>
> 이벤트를 발생시키는 코드가 자기 불변식을 깨뜨린 중간 상태에서 `Invoke`를 하면, 핸들러가 그 중간 상태를 관찰하거나 재진입해서 더 망가뜨린다. **불변식을 복구한 뒤에 통지하라.** 이 규칙은 락을 잡은 채로 이벤트를 발생시키지 말라는 규칙(48장, "락 안에서 미지의 코드를 호출하지 마라")과 같은 뿌리에서 나온다.

### 비가상 이벤트만 선언하라

이벤트를 `virtual`로 만들 수 있다. 만들지 마라.

```csharp
// 나쁜 예 — 가상 필드 형태 이벤트
public abstract class WorkerEngineBase
{
    public virtual event EventHandler<WorkerEventArgs>? OnProgress;

    public void DoLotsOfStuff()
    {
        for (int i = 0; i < 100; i++)
        {
            SomeWork();
            var args = new WorkerEventArgs { Percent = i };
            OnProgress?.Invoke(this, args);   // 기반 클래스의 백킹 필드를 본다
            if (args.Cancel) return;
        }
    }

    protected abstract void SomeWork();
}

public class WorkerEngineDerived : WorkerEngineBase
{
    protected override void SomeWork() => Thread.Sleep(50);

    // 망가진다. 기반 클래스의 private 백킹 필드를 가린다.
    public override event EventHandler<WorkerEventArgs>? OnProgress;
}
```

**왜 나쁜가.** 필드 형태 이벤트는 컴파일러가 `private` 백킹 필드를 만든다. 파생 클래스가 이벤트를 `override`하면 **파생 클래스에도 자기만의 private 백킹 필드가 생긴다.** 사용자 코드는 파생 클래스의 이벤트를 구독하므로 파생 필드에 델리게이트가 쌓인다. 그런데 이벤트를 발생시키는 코드는 기반 클래스에 있고, 기반 클래스는 **자기 필드**를 본다. 그 필드는 언제나 비어 있다. **아무 핸들러도 호출되지 않는다.** 컴파일 오류도, 예외도 없다. 그냥 조용히 동작하지 않는다.

파생 클래스가 `add`/`remove` 접근자를 써서 `add { base.OnProgress += value; }`처럼 기반 클래스에 위임하면 동작하기는 한다(그리고 이벤트를 발생시킬 수 있는 것은 여전히 기반 클래스뿐이다). 그러나 이 규율을 파생 클래스 저자 전원에게 강제할 방법이 없다. 누구든 필드 형태로 한 줄 쓰는 순간 다시 망가진다.

```csharp
// 좋은 예 — 이벤트는 비가상, 발생 메서드만 가상
public abstract class WorkerEngineBase
{
    public event EventHandler<WorkerEventArgs>? OnProgress;

    protected virtual WorkerEventArgs RaiseProgress(WorkerEventArgs args)
    {
        OnProgress?.Invoke(this, args);
        return args;
    }

    public void DoLotsOfStuff()
    {
        for (int i = 0; i < 100; i++)
        {
            SomeWork();
            if (RaiseProgress(new WorkerEventArgs { Percent = i }).Cancel) return;
        }
    }

    protected abstract void SomeWork();
}
```

**가상 이벤트를 오버라이드해서 할 수 있는 일 중 발생 메서드를 오버라이드해서 못 하는 일은 없다.** 호출 목록을 손으로 순회할 수도 있고, 구독자마다 인수를 다르게 줄 수도 있고, 아예 발생시키지 않을 수도 있다. 그러면서 백킹 필드는 하나로 유지된다. 이것이 BCL이 `protected virtual void OnXxx(EventArgs e)` 패턴을 쓰는 이유다(27.4절, 27.8절).

### 이벤트 핸들러보다 오버라이드

같은 이유의 다른 얼굴이다. 많은 프레임워크 클래스가 시스템 이벤트에 반응하는 두 가지 방법을 제공한다 — 이벤트 핸들러를 붙이거나, 기반 클래스의 가상 메서드를 오버라이드하거나.

```csharp
// 좋은 예 — 파생 클래스 안에서는 오버라이드
public partial class MainWindow : Window
{
    protected override void OnMouseDown(MouseButtonEventArgs e)
    {
        DoMouseThings(e);
        base.OnMouseDown(e);      // 이벤트 핸들러들이 호출되게 한다
    }
}
```

```xml
<!-- 나쁜 예 — 같은 클래스 안인데 XAML 이벤트로 우회한다 -->
<Window x:Class="WpfApp1.MainWindow" MouseDown="OnMouseDownHandler">
  <Grid />
</Window>
```

```csharp
private void OnMouseDownHandler(object sender, MouseButtonEventArgs e) => DoMouseThings(e);
```

**왜 나쁜가.** 세 가지다.

1. **다른 핸들러가 던지면 내 핸들러는 호출되지 않는다.** 오버라이드는 언제나 먼저 실행된다 — 기반 클래스의 가상 메서드가 이벤트 핸들러들을 부르는 쪽이기 때문이다.
2. **유지보수 지점이 둘이다.** 핸들러 메서드와 그것을 연결하는 코드(XAML의 특성 또는 `+=` 문). 둘 중 하나만 어긋나도 조용히 동작하지 않는다. 오버라이드는 하나다.
3. 델리게이트 호출 한 단계가 더 붙는다.

거꾸로 이벤트를 써야 하는 자리도 분명하다. **파생 클래스가 아닌 모든 클래스**는 이벤트로만 반응할 수 있다. 디자이너가 XAML에 선언한 동작도 이벤트로 연결된다. 런타임에 핸들러를 갈아끼워야 하는 경우(그리기 모드에 따라 마우스 다운의 의미가 달라지는 그리기 프로그램)나 한 이벤트에 여러 동작을 붙여야 하는 경우도 이벤트의 몫이다.

> **💡 판단 기준 한 줄**
>
> **파생 클래스 안에서 자기 클래스의 이벤트에 반응한다면 오버라이드.** 그 밖의 모든 경우는 이벤트 핸들러.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 16 "Implement the Event Pattern for Notifications", Item 18 "Prefer Overrides to Event Handlers", Item 20 "Understand How Events Increase Runtime Coupling Among Objects", Item 21 "Declare Only Nonvirtual Events"를 바탕으로 한다. 재진입과 예외 전파 분석은 저자의 보강이다.

---
## 78.11 부분 클래스에 부분 메서드를 제공하기

### 코드 생성기가 곧 API 저자다

부분 클래스는 코드 생성기가 자기 몫을 만들고 사람이 다른 파일에서 그것을 보강하도록 도입됐다. 그런데 파일을 나누는 것만으로는 부족하다. 사람은 **생성된 멤버 안쪽**에 코드를 넣고 싶어 한다 — 생성자, 생성된 코드가 붙인 이벤트 핸들러, 생성된 변경자(mutator) 메서드.

생성된 코드를 손으로 고치면 생성기와의 관계가 끊어진다. 다시 생성하는 순간 수정이 날아간다. 그래서 **생성기 저자는 확장점을 미리 뚫어놓아야 한다.** 이것은 어엿한 API 설계다. 두 개발자가 한 클래스를 나눠 쓰는데 서로 대화할 수 없고 서로의 코드를 고칠 수도 없는 상황이기 때문이다.

확장점의 도구가 **부분 메서드**다. 컴파일러는 전체 클래스 정의를 보고, 부분 메서드에 본문이 있으면 호출을 생성하고, 없으면 **호출 자체를 제거한다.**

```csharp
// 생성기가 만든 부분 — 확장점이 하나도 없다
public partial class GeneratedStuff
{
    private int storage = 0;
    public void UpdateValue(int newValue) => storage = newValue;
}
```

### 변경자에 앞뒤 훅을 달아라

```csharp
// 좋은 예 — 변경 전후 훅
public partial class GeneratedStuff
{
    private readonly record struct ReportChange(int OldValue, int NewValue);

    private sealed class RequestChange
    {
        public ReportChange Values { get; init; }
        public bool Cancel { get; set; }
    }

    partial void ReportValueChanging(RequestChange args);   // 변경 전 — 거부 가능
    partial void ReportValueChanged(ReportChange values);   // 변경 후 — 통지

    private int storage = 0;

    public void UpdateValue(int newValue)
    {
        var updateArgs = new RequestChange { Values = new ReportChange(storage, newValue) };
        ReportValueChanging(updateArgs);
        if (!updateArgs.Cancel)
        {
            storage = newValue;
            ReportValueChanged(new ReportChange(storage, newValue));
        }
    }
}
```

사람이 쓴 파일에서는 필요한 훅만 구현한다.

```csharp
public partial class GeneratedStuff
{
    partial void ReportValueChanging(RequestChange args)
    {
        if (args.Values.NewValue < 0) args.Cancel = true;
    }

    partial void ReportValueChanged(ReportChange values) =>
        Console.WriteLine($"Changed {values.OldValue} to {values.NewValue}");
}
```

훅을 아무도 구현하지 않으면 컴파일러가 `ReportValueChanging`/`ReportValueChanged` 호출을 **지운다.** 남는 것은 `if (!updateArgs.Cancel) storage = newValue;`뿐이다.

> **⚠️ 호출은 사라져도 인수 생성은 남는다**
>
> 위 코드에서 `RequestChange` 객체는 **여전히 만들어진다.** 컴파일러는 생성자에 부작용이 있을 수 있다고 가정하므로 그 할당을 제거하지 못한다. 확장점을 뚫을 때 필요한 인수 객체가 비싸면, 훅을 쓰지 않는 사용자 전원이 그 비용을 낸다. **인수 객체는 최대한 가볍게 만들어라.**

### 생성자와 이벤트 핸들러에도

생성된 코드도 사람이 쓴 코드도 어느 생성자가 호출될지 통제할 수 없다. 그래서 생성기가 훅을 제공해야 한다.

```csharp
// 사용자 코드를 위한 훅
partial void Initialize();

public GeneratedStuff() : this(0) { }

public GeneratedStuff(int someValue)
{
    this.storage = someValue;
    Initialize();          // 생성 중 마지막에 호출한다
}
```

`Initialize()`를 마지막에 두는 이유는 사람이 쓴 코드가 **완성된 객체 상태를 관찰**하고 필요하면 예외를 던질 수 있게 하기 위함이다. 규칙은 둘이다. **두 번 호출되지 않게 할 것**, 그리고 **생성된 코드의 모든 생성자에서 호출할 것.** 반대로 사람이 새 생성자를 추가한다면 자기 `Initialize()`를 직접 부르지 말고 생성된 생성자 중 하나를 체이닝해야 한다.

생성된 코드가 이벤트를 구독한다면 그 핸들러 처리 도중에도 훅을 제공하는 것이 좋다. 특히 상태나 취소 플래그를 묻는 이벤트라면 사람이 그 값을 바꿔야 할 수 있다.

> **⚠️ 부분 메서드의 제약**
>
> 반환 타입은 `void`, `abstract`·`virtual` 불가, 인터페이스 멤버 구현 불가, `out` 매개변수 불가, 접근성은 암시적으로 `private`. 이 제약은 전부 **본문이 없을 때 호출을 지워도 의미가 보존되어야 한다**는 요구에서 나온다. `out`을 못 쓰는 이유는 컴파일러가 초기화해줄 방법이 없기 때문이고, 반환값을 못 쓰는 이유도 같다.
>
> ※C# 9부터는 **접근 제한자를 명시한** 부분 메서드가 허용되며(예: `public partial void Foo();`), 그 경우 `void`가 아니어도 되고 `out`도 쓸 수 있다. 대신 **구현이 반드시 있어야 한다** — 호출을 지울 수 없기 때문이다. 소스 생성기 시대의 확장이고, 이 절의 "있어도 되고 없어도 되는 훅"과는 다른 도구다.

> **💡 취소를 어떻게 전달할 것인가**
>
> 위 예는 `bool Cancel` 플래그를 썼다. 사람이 쓴 코드가 예외를 던져 취소하게 하는 설계도 가능하다. **취소가 호출자에게까지 전파돼야 한다면 예외**가, 그렇지 않다면 가벼운 플래그가 낫다. 어느 쪽인지를 생성기 문서에 명시하라 — 훅 저자가 알 방법이 그것뿐이다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 23 "Give Partial Classes Partial Methods for Constructors, Mutators, and Event Handlers"를 바탕으로 한다. 부분 타입 문법은 13.14절에서 다뤘다.

---

## 78.12 반복자·비동기 메서드의 즉시 오류 보고

### 컴파일러가 코드를 재배치하면 예외 시점도 옮겨간다

반복자 메서드와 비동기 메서드는 컴파일러가 상태 기계로 재작성한다(28.4절, 47.7절). 그 재작성이 **인수 검증 코드의 실행 시점도 옮긴다.**

```csharp
// 나쁜 예 — 반복자 안에서 인수 검증
public IEnumerable<T> GenerateSample<T>(IEnumerable<T> sequence, int sampleFrequency)
{
    if (sequence == null)
        throw new ArgumentNullException(nameof(sequence));
    if (sampleFrequency < 1)
        throw new ArgumentException("Sample frequency must be positive", nameof(sampleFrequency));

    int index = 0;
    foreach (T item in sequence)
        if (index++ % sampleFrequency == 0)
            yield return item;
}
```

```csharp
var samples = processor.GenerateSample(fullSequence, -8);
Console.WriteLine("아직 예외가 안 났다!");
foreach (var item in samples)    // 여기서 예외가 난다
    Console.WriteLine(item);
```

**왜 나쁜가.** `yield return`이 하나라도 있으면 메서드 전체가 상태 기계의 `MoveNext()` 안으로 들어간다. 메서드를 **호출**하는 것은 상태 기계 객체를 만들 뿐이고, 본문은 **열거를 시작할 때** 처음 실행된다. 잘못된 인수를 넘긴 코드와 예외가 나는 코드가 다른 메서드, 심지어 다른 클래스에 있을 수 있다. 스택 트레이스는 문제를 만든 곳을 가리키지 않는다.

비동기 메서드도 똑같다.

```csharp
// 나쁜 예 — async 메서드 안에서 인수 검증
public async Task<string> LoadMessage(string userName)
{
    if (string.IsNullOrWhiteSpace(userName))
        throw new ArgumentException("This must be a valid user", nameof(userName));
    var settings = await context.LoadUser(userName);
    return settings.Message ?? "No message";
}
```

`async` 메서드에서 던진 예외는 **반환된 `Task`에 담긴다.** 아무도 그 태스크를 `await`하지 않거나 늦게 `await`하면 예외도 그때까지 관찰되지 않는다.

### 해법 — 지역 함수로 둘로 쪼갠다

검증만 하는 **바깥 메서드**와 실제 일을 하는 **구현 메서드**로 나눈다. 구현은 지역 함수로 만든다(※C# 7).

```csharp
// 좋은 예 — 반복자
public IEnumerable<T> GenerateSample<T>(IEnumerable<T> sequence, int sampleFrequency)
{
    if (sequence == null)
        throw new ArgumentNullException(nameof(sequence));
    if (sampleFrequency < 1)
        throw new ArgumentException("Sample frequency must be positive", nameof(sampleFrequency));

    return GenerateSampleImpl();

    IEnumerable<T> GenerateSampleImpl()
    {
        int index = 0;
        foreach (T item in sequence)
            if (index++ % sampleFrequency == 0)
                yield return item;
    }
}
```

바깥 메서드에는 `yield return`이 없으므로 상태 기계로 변환되지 않는다. 호출 즉시 검증이 실행되고, 통과하면 열거자를 반환한다.

```csharp
// 좋은 예 — 비동기
public Task<string> LoadMessage(string userName)
{
    if (string.IsNullOrWhiteSpace(userName))
        throw new ArgumentException("This must be a valid user", nameof(userName));

    return LoadMessageImpl();

    async Task<string> LoadMessageImpl()
    {
        var settings = await context.LoadUser(userName);
        return settings.Message ?? "No message";
    }
}
```

바깥 메서드에 `async`가 **없다**는 것이 핵심이다. `Task`를 반환하되 자기는 동기 메서드다.

지역 함수를 쓰는 이유는 셋이다. (1) **구현 메서드를 우회할 수 없다** — 검증을 건너뛰고 부를 방법이 없다. (2) 바깥 메서드의 **매개변수와 지역 변수에 그대로 접근**하므로 인수를 다시 넘길 필요가 없다. (3) **람다보다 싸다** — 람다는 델리게이트 인스턴스를 만들지만 지역 함수는 대개 `private` 메서드로 컴파일된다.

> **⚠️ TAP 규약은 이 예외를 동기적으로 던지는 것을 허용한다**
>
> "`Task` 반환 메서드는 예외를 던지지 말고 실패한 태스크를 반환하라"는 규칙을 들어본 적이 있을 것이다. 절반만 맞다. TAP(47.15절)은 **사용법 오류(usage error)** — 즉 널 인수, 범위 밖 값처럼 호출 코드를 고쳐야만 하는 오류 — 는 **동기적으로 던져도 된다**고 명시한다. 위 패턴이 규약 위반이 아닌 이유다. 반면 네트워크 실패 같은 **실행 오류**는 반드시 태스크에 담아야 한다.

> **⚠️ `async void`에는 이 기법이 통하지 않는다**
>
> `async void` 메서드에서 던진 예외는 태스크에도, 호출자에게도 가지 않고 `SynchronizationContext`로 올라가 대개 프로세스를 죽인다. 애초에 `async void`를 쓰지 마라(47.14절). 예외는 이벤트 핸들러뿐이다.

> **💡 `ArgumentNullException.ThrowIfNull`**
>
> ※.NET 6부터 `ArgumentNullException.ThrowIfNull(sequence)` 한 줄로 널 검사를 대신할 수 있다. `[CallerArgumentExpression]` 덕분에 매개변수 이름이 자동으로 채워진다(21.10절). 검증 블록이 짧아질수록 이 절의 분리 패턴을 지키기가 쉬워진다.

> **📌 원서 참조**
>
> 이 절은 *More Effective C#* Item 26 "Enable Immediate Error Reporting in Iterators and Async Methods using Local Functions"를 바탕으로 한다. 반복자의 오류 보고는 28.6절에서, 비동기 반환 타입은 47.5절에서 더 다룬다.

---
## 78.13 버전 관리 — 바이너리 호환성을 깨는 변경 목록

### 세 가지 호환성

"호환된다"는 말은 세 가지 서로 다른 뜻으로 쓰인다. 셋을 구분하지 못하면 릴리스 노트가 거짓말이 된다.

| | 정의 | 깨지면 누가 언제 아픈가 |
|---|---|---|
| **소스 호환성** | 호출자의 **소스를 다시 컴파일**하면 성공한다 | 사용자가 라이브러리를 올리고 빌드할 때 |
| **바이너리 호환성** | 예전에 컴파일된 어셈블리를 **재컴파일 없이** 새 버전 위에서 실행할 수 있다 | 운영 환경에서 런타임 예외로 |
| **동작 호환성** | 컴파일도 실행도 되지만 **결과가 같다** | 아무도 모르는 사이에 |

셋은 독립적이다. 소스는 깨지고 바이너리는 멀쩡한 변경(매개변수 이름 변경), 소스는 멀쩡하고 바이너리가 깨지는 변경(선택적 매개변수 추가), 둘 다 멀쩡하고 동작만 바뀌는 변경(오버로드 추가로 해석이 달라짐)이 전부 실재한다.

> **⚠️ 가장 위험한 것은 소스는 되고 바이너리가 깨지는 조합이다**
>
> 라이브러리 저자는 자기 솔루션을 통째로 빌드하며 개발한다. 그 환경에서는 소스 호환성만 검사된다. **바이너리 호환성은 재컴파일하지 않은 소비자에게서만 드러난다** — 즉 저자의 CI에서는 절대 잡히지 않는다. 이 절의 표를 외우거나 도구로 검사해야 하는 이유다.

### 전수 목록

| 변경 | 소스 | 바이너리 | 동작 | 증상 |
|---|---|---|---|---|
| public 멤버·타입 **삭제** | 깨짐 | 깨짐 | — | `MissingMethodException` / `TypeLoadException` |
| 접근성 **좁힘** (`public`→`internal` 등) | 깨짐 | 깨짐 | — | `MethodAccessException` / `TypeLoadException` |
| 접근성 **넓힘** | 안전 | 안전 | — | — |
| 메서드 **이름·매개변수 타입·개수** 변경 | 깨짐 | 깨짐 | — | `MissingMethodException` |
| **반환 타입** 변경 | 깨짐 | 깨짐 | — | 메타데이터 시그니처가 다르다 |
| 매개변수 **이름** 변경 | 깨짐 | 안전 | — | 명명된 인수 사용처만 |
| **선택적 매개변수 추가** | 안전 | **깨짐** | — | `MissingMethodException` |
| 선택적 매개변수 **기본값** 변경 | 안전 | 안전 | **깨짐** | 옛 호출자는 옛 값을 계속 보낸다 |
| **오버로드 추가** | 대체로 안전 | 안전 | **깨질 수 있음** | 재컴파일 시 해석이 옮겨감 |
| `ref`/`out`/`in` 추가·변경 | 깨짐 | 깨짐 | — | 시그니처가 다르다 |
| **필드 → 프로퍼티** | 대체로 안전 | **깨짐** | — | `ldfld` 대신 `call get_X`가 필요하다 |
| **프로퍼티 → 필드** | 깨짐 | 깨짐 | — | `MissingMethodException` |
| 필드에 **`readonly` 추가** | 깨짐(외부 대입) | 위험 | — | `initonly` 플래그가 붙는다 |
| `const` → `static readonly` | 안전 | **깨짐** | — | 상수는 호출 지점에 인라인된다(79.2절) |
| `const` **값** 변경 | 안전 | 안전 | **깨짐** | 옛 호출자는 옛 값을 갖고 있다 |
| **`class` ↔ `struct`** | 대체로 깨짐 | 깨짐 | 깨짐 | `newobj`/`initobj`, 박싱, 대입 의미론 전부 다름 |
| `sealed` **추가** | 깨짐(파생 존재 시) | 깨짐 | — | `TypeLoadException` |
| `sealed` **제거** | 안전 | 안전 | — | — |
| `abstract` 멤버 추가 | 깨짐 | 깨짐 | — | 파생 타입 로드 시 `TypeLoadException` |
| `virtual` 제거 | 깨짐 | 깨짐 | — | 오버라이드가 사라진다 |
| `virtual` 추가 | 안전 | 대체로 안전 | 위험 | 78.14절 참조 |
| 인터페이스 **멤버 추가**(기본 구현 없이) | 깨짐 | 깨짐 | — | 구현자 전부 |
| 타입을 **다른 어셈블리로 이동** | 안전 | **깨짐** | — | `TypeForwardedTo`로 구제 가능(52.8절) |
| 던지는 예외를 **덜 파생된·무관한 타입**으로 변경 | 안전 | 안전 | **깨짐** | 기존 `catch`가 안 잡는다 (더 파생된 타입으로 바꾸는 것은 안전하다) |
| `enum` 멤버 추가 | 안전 | 안전 | **깨질 수 있음** | 완전 열거 `switch`의 기본 분기 |
| `enum` 기반 타입 변경 | 깨짐 | 깨짐 | — | 크기가 바뀐다 |
| 구조체에 **필드 추가** | 안전 | 대체로 안전 | 위험 | 크기 변화 — `unsafe`·interop 계약 파괴 |
| 널 허용 주석 추가 | 안전\* | 안전 | 안전 | 아래 참조 |

\* 경고가 늘어난다. `TreatWarningsAsErrors`를 켠 소비자에게는 빌드 실패다.

> **⚠️ 필드를 프로퍼티로 바꾸는 것은 바이너리 파괴다**
>
> 가장 자주 저지르는 실수다. 필드 읽기는 IL에서 `ldfld`이고 프로퍼티 읽기는 `call instance ... get_Value()`다. **완전히 다른 명령**이다. 컴파일된 호출자는 `ldfld`를 갖고 있는데 그 필드는 이제 없다. 그래서 애초에 데이터 멤버를 `public` 필드로 노출하지 않는다(*More Effective C#* Item 1 "Use Properties Instead of Accessible Data Members"). 프로퍼티로 시작하면 나중에 계산 로직을 넣어도 호환성이 유지된다.

> **⚠️ `readonly` 추가는 "IL이 검증 불가능해질 뿐" 조용히 지나갈 수 있다**
>
> 필드에 `readonly`를 붙이면 메타데이터에 `initonly` 플래그가 붙는다. 선언 타입의 생성자 밖에서 그 필드에 `stfld`를 하는 IL은 **검증 불가능(unverifiable)** 이 된다. 그런데 .NET은 일반적으로 IL 검증을 하지 않으므로 기존에 컴파일된 대입 코드가 **그대로 동작해버리는 경우가 많다.** 즉 문제가 조용히 잠복한다. 보장된 동작이 아니므로 의존하지 마라.

> **⚠️ `class`를 `struct`로 바꾸면 모든 것이 바뀐다**
>
> `null` 대입 가능 여부, 대입 시 복사 여부, 박싱, `newobj` 대 `initobj`, `callvirt`에 필요한 `constrained` 접두사, 기본값의 존재. 라이브러리에서 성능을 이유로 `class`를 `struct`로 바꾸고 싶어지는 순간이 오지만, 이것은 메이저 버전 사건이다.

### 널 가능 참조 타입 주석은 파괴적 변경인가

**바이너리 관점에서는 아니다.** 널 허용 주석은 시그니처가 아니라 `NullableAttribute`·`NullableContextAttribute`로 인코딩된다(21.6절). 메타데이터 시그니처가 바뀌지 않으므로 컴파일된 호출자에게 아무 영향이 없다.

**소스 관점에서는 조건부다.** 라이브러리에 주석을 켜면 소비자 코드에 새 경고(CS8600 계열)가 쏟아진다. 경고는 오류가 아니므로 엄밀히는 소스 호환이지만, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`를 쓰는 프로젝트에서는 **빌드가 깨진다.**

> **💡 널 주석 도입 전략**
>
> 1. 마이너 버전에서 주석을 넣되 **한 어셈블리씩** 한다.
> 2. 잘못된 주석(실제로 `null`을 반환할 수 있는데 `string`으로 선언)은 나중에 고치는 것이 **더 큰 파괴적 변경**이다. 반환 타입을 `string`→`string?`으로 넓히면 소비자의 모든 사용처에 경고가 생긴다. 첫 주석을 신중히 달아라.
> 3. 매개변수는 넓히는 방향(`string`→`string?`)이 안전하고, 반환값은 좁히는 방향(`string?`→`string`)이 안전하다. 가변성과 같은 논리다.

### API 표면을 도구로 고정하기

사람의 규율에 맡기지 마라. **공개 API 표면 자체를 소스 관리 아래 둘 수 있다.**

`Microsoft.CodeAnalysis.PublicApiAnalyzers` 패키지를 넣고 프로젝트에 텍스트 파일 두 개를 둔다.

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.CodeAnalysis.PublicApiAnalyzers" Version="3.3.4"
                    PrivateAssets="all" />
  <AdditionalFiles Include="PublicAPI.Shipped.txt" />
  <AdditionalFiles Include="PublicAPI.Unshipped.txt" />
</ItemGroup>
```

파일 내용은 공개 심벌의 목록이다.

```text
#nullable enable
MyLib.Widget
MyLib.Widget.Widget() -> void
MyLib.Widget.Name.get -> string!
MyLib.Widget.Resize(int width, int height) -> void
```

- `PublicAPI.Shipped.txt` — 이미 출시된 API. **여기서 줄을 지우면 파괴적 변경이다.**
- `PublicAPI.Unshipped.txt` — 다음 릴리스에서 추가될 API. 출시할 때 Shipped로 옮긴다.

소스에 새 public 멤버를 추가했는데 파일에 적지 않으면 **RS0016** 진단이 뜬다. 반대로 파일에는 있는데 소스에서 없앴으면 **RS0017**이 뜬다. 즉 **모든 공개 API 변경이 코드 리뷰에 diff로 나타난다.** 실수로 `public`을 붙인 것도, 몰래 시그니처를 바꾼 것도 리뷰어의 눈에 걸린다.

패키지 수준에서는 SDK의 패키지 검증을 켠다. ※.NET 6 SDK 이후.

```xml
<PropertyGroup>
  <EnablePackageValidation>true</EnablePackageValidation>
  <PackageValidationBaselineVersion>1.2.0</PackageValidationBaselineVersion>
</PropertyGroup>
```

기준 버전의 NuGet 패키지를 내려받아 새 패키지와 API 표면을 비교하고, 파괴적 변경이 있으면 빌드를 실패시킨다. 멀티 타깃 패키지에서 타깃별 표면이 어긋나는 것도 잡아준다.

### 폐기 절차

없앨 API는 **바로 없애지 말고 폐기 표시부터 한다.**

```csharp
[Obsolete("Use Resize(Size) instead. This overload will be removed in 3.0.")]
public void Resize(int width, int height) => Resize(new Size(width, height));
```

기본값은 경고다. 다음 메이저에서 `[Obsolete("...", error: true)]`로 올려 오류로 만든다. ※.NET 5부터 진단 ID와 문서 URL을 직접 지정할 수 있다.

```csharp
[Obsolete("Use Resize(Size) instead.",
          DiagnosticId = "MYLIB0001",
          UrlFormat = "https://example.com/obsolete/{0}")]
public void Resize(int width, int height) => Resize(new Size(width, height));
```

`DiagnosticId`를 주면 이 폐기 경고가 CS0618이 아니라 `MYLIB0001`로 보고된다. 소비자는 **이 폐기만 골라서** 억제할 수 있다.

```xml
<NoWarn>$(NoWarn);MYLIB0001</NoWarn>
```

`UrlFormat`의 `{0}` 자리에 진단 ID가 들어가 IDE의 오류 목록에서 클릭 가능한 링크가 된다.

### 아직 계약이 아닌 API를 내보내기

**`[EditorBrowsable]`** — IntelliSense 목록에서 감춘다.

```csharp
[EditorBrowsable(EditorBrowsableState.Never)]
public static Widget __CreateForSourceGenerator(int id) => new Widget(id);
```

컴파일러가 강제하는 것은 없다. 소스 생성기가 호출해야 하지만 사람이 쓸 일은 없는 멤버에 쓴다.

> **⚠️ `[EditorBrowsable]`은 같은 솔루션 안에서는 무시된다**
>
> C# IDE는 이 특성을 **참조된 어셈블리의 멤버에만** 적용한다. 같은 프로젝트나 같은 솔루션의 소스에서는 그대로 보인다. 자기 솔루션에서 테스트하고 "안 감춰지는데?"라고 결론 내리기 쉬운 함정이다.

**`[Experimental]`** ※.NET 8 — 이쪽은 컴파일러가 강제한다.

```csharp
[Experimental("MYLIB9001")]
public sealed class VectorIndex { }
```

이 타입을 쓰는 코드는 **오류** `MYLIB9001`을 받는다. 쓰겠다고 명시적으로 억제해야만 컴파일된다.

```xml
<NoWarn>$(NoWarn);MYLIB9001</NoWarn>
```

즉 "쓸 수는 있지만 계약은 아니다"를 컴파일러 차원에서 선언하는 도구다. 프리뷰 API를 정식 API와 같은 패키지에 담아 배포하면서 나중에 마음대로 바꿀 여지를 남긴다.

| 도구 | 강제 수준 | 목적 |
|---|---|---|
| `internal` + `InternalsVisibleTo` | 컴파일러 (절대) | 어셈블리 밖으로 안 나감 |
| `[Experimental]` ※.NET 8 | 컴파일러 (오류, 억제 가능) | 아직 계약이 아님을 명시 |
| `[Obsolete(error: true)]` | 컴파일러 (오류, 억제 가능) | 제거 예정 |
| `[Obsolete]` | 컴파일러 (경고) | 폐기 진행 중 |
| `[EditorBrowsable(Never)]` | IDE만 | 발견성 낮추기 |

### 공개 API를 바꾸기 전 체크리스트

1. **이것을 `public`으로 낼 필요가 정말 있는가?** `internal`로 되면 아래 항목 전부가 무의미해진다.
2. 이 변경은 **소스·바이너리·동작** 중 무엇을 깨는가? 위의 전수 목록에서 확인했는가?
3. 시그니처를 바꾸는 대신 **오버로드를 추가**할 수 있는가?
4. 삭제 대신 `[Obsolete]`로 한 사이클 유예할 수 있는가? **유예 기간과 제거 버전을 메시지에 적었는가?**
5. 타입을 옮긴다면 `TypeForwardedTo`를 남길 수 있는가?(52.8절)
6. 매개변수 **이름**을 바꾸는가? 명명된 인수 사용자를 깨뜨린다.
7. 선택적 매개변수의 **기본값**을 바꾸는가? 재컴파일 전까지 옛 값이 살아 있다.
8. 새 오버로드가 **기존 호출의 해석을 바꾸지 않는가?** 특히 `params` 컬렉션 오버로드.
9. `virtual`을 새로 붙였다면 **파생 클래스에 같은 이름의 멤버가 생기는 문제**를 검토했는가?(78.14절)
10. 어셈블리 버전 정책이 이 변경과 맞는가? 서비싱이면 build/revision만, 새 기능이면 major/minor를 올린다(52.6절).
11. `PublicAPI.Shipped.txt` diff와 패키지 검증을 CI에서 돌렸는가?
12. **릴리스 노트에 세 가지 호환성 중 무엇을 깼는지 적었는가?**

---

## 78.14 컴포넌트, 다형성, 버전 관리의 삼각관계

### 컴포넌트란 무엇인가

객체지향이 처음 쓰이던 시절, 애플리케이션은 작았고 한 회사가 전부 만들었다. 지금은 다르다. 하나의 애플리케이션은 여러 회사가 만든 코드를 객체지향 패러다임으로 꿰맨 것이다. 이것이 **컴포넌트 소프트웨어 프로그래밍(CSP)** 이고, .NET에서 컴포넌트는 어셈블리다.

컴포넌트의 속성은 이렇다.

- **"출시된" 느낌**이 있다.
- **정체성**을 갖는다 — 이름, 버전, 문화권, 공개 키.
- 그 정체성을 **영원히 유지한다.** 어셈블리의 코드는 다른 어셈블리에 정적 링크되지 않는다. .NET은 언제나 동적 링크를 쓴다.
- 의존하는 컴포넌트를 **명시한다** — AssemblyRef 메타데이터 테이블(52.2절).
- 클래스와 멤버를 **문서화한다** — XML 문서 주석.
- **서비싱 동안 바뀌지 않을 인터페이스(객체 모델)를 공표한다.**

마지막 항목이 이 장 전체의 요약이다. **서비싱(servicing)** 은 원본과 하위 호환을 의도한 새 버전이다. 버그 수정, 보안 패치, 작은 기능 개선까지는 되지만 **새 의존성이나 새 보안 권한을 요구할 수는 없다.**

.NET 버전 번호는 네 부분이다 — major, minor, build, revision. 관례는 이렇다.

| 변경의 성격 | 예 | 무엇을 올리는가 |
|---|---|---|
| 서비싱 (하위 호환 의도) | 2.7.0.0 → 2.7.1.34 | build / revision |
| 새 컴포넌트 (호환 의도 없음) | 2.7.0.0 → 3.0.0.0 | major / minor |

> **⚠️ CLR은 버전 번호에 의미를 부여하지 않는다**
>
> 위는 **당신이 버전 번호를 어떻게 생각해야 하는가**이지 런타임의 동작이 아니다. CLR은 버전 번호를 **불투명한 값**으로 다룬다. 어떤 어셈블리가 다른 어셈블리의 1.2.3.4에 의존한다면 CLR은 (바인딩 리디렉션이 없는 한) 정확히 1.2.3.4를 로드하려 한다. "2.7.1.34는 2.7.0.0의 서비싱이니까 괜찮겠지"라고 판단해주지 않는다.

### `call`과 `callvirt` — 가상성이 바이너리에 남기는 흔적

CLR에는 메서드를 부르는 IL 명령이 둘 있다.

- **`call`** — 정적·인스턴스·가상 메서드 모두에 쓸 수 있다. **변수의 타입**이 어느 타입의 메서드를 부를지 결정한다. `null` 검사를 하지 않는다. 가상 메서드를 **비가상으로** 부를 때 자주 쓰인다.
- **`callvirt`** — 인스턴스·가상 메서드에 쓴다. 가상 메서드라면 CLR이 **객체의 실제 타입**을 찾아 다형적으로 호출한다. 그 과정에서 수신자가 `null`인지 검사하고, `null`이면 `NullReferenceException`을 던진다.

C# 컴파일러의 선택을 보자.

```csharp
public sealed class Program {
    public static void Main() {
        Console.WriteLine();      // 정적 메서드
        object o = new object();
        o.GetHashCode();          // 가상 인스턴스 메서드
        o.GetType();              // 비가상 인스턴스 메서드
    }
}
```

```il
.method public hidebysig static void Main() cil managed {
  .entrypoint
  .maxstack 1
  .locals init (object o)
  IL_0000: call     void System.Console::WriteLine()
  IL_0005: newobj   instance void System.Object::.ctor()
  IL_000a: stloc.0
  IL_000b: ldloc.0
  IL_000c: callvirt instance int32 System.Object::GetHashCode()
  IL_0011: pop
  IL_0012: ldloc.0
  IL_0013: callvirt instance class System.Type System.Object::GetType()
  IL_0018: pop
  IL_0019: ret
}
```

`GetType()`은 **가상이 아닌데도 `callvirt`**로 호출된다. C# 팀이 인스턴스 메서드 호출에서 언제나 `null` 검사를 하도록 결정했기 때문이다. 그래서 C#에서는 다음 코드가 `NullReferenceException`을 던진다 — 이론적으로는 던지지 않아도 되는데도 그렇다.

```csharp
Program p = null;
int x = p.GetFive();     // NullReferenceException
```

거꾸로, `base.ToString()` 같은 호출에서는 컴파일러가 **일부러 `call`을 쓴다.** `callvirt`를 쓰면 자기 자신을 무한 재귀 호출하기 때문이다.

> **⚠️ 비가상 메서드를 나중에 가상으로 바꾸지 마라**
>
> 어떤 컴파일러는 비가상 메서드를 `call`로 부른다. 그 메서드가 나중에 가상이 되고 호출 코드가 재컴파일되지 않으면, **가상 메서드가 비가상으로 호출된다.** 파생 클래스의 오버라이드가 무시되고 예측할 수 없는 동작이 나온다. 호출 코드가 전부 C#이라면 C#은 인스턴스 메서드를 언제나 `callvirt`로 부르므로 문제가 없다. **다른 언어로 쓴 소비자가 있다면 문제가 된다.**

### 기본값을 `sealed`로

정확히 어떤 멤버가 다형적이어야 하는지 결정하는 것은 API 저자의 일이다. "일단 전부 `virtual`"은 결정을 안 한 것이다. 가상 멤버가 적어야 하는 이유는 넷이다.

1. **성능** — 가상 호출이 비가상 호출보다 느리다.
2. **인라이닝** — 가상 메서드는 JIT이 인라인하기 어렵다. 반대로 **`sealed` 타입의 가상 메서드는 JIT이 비가상으로 낮춰 부를 수 있다** — 파생 클래스가 존재할 수 없음을 알기 때문이다(55장).
3. **버전 관리** — 아래에서 본다.
4. **보안과 예측 가능성** — 가상 멤버를 만드는 순간 기반 클래스는 자기 상태에 대한 통제를 일부 포기한다. 파생 클래스가 기반 구현을 부를지 말지 정한다.

`sealed`의 방향도 비대칭이다. **`sealed`로 시작한 클래스는 나중에 풀 수 있지만, 한 번 푼 클래스는 다시 봉인할 수 없다.**

편의 오버로드를 제공할 때의 정석은 이렇다.

```csharp
public class Set {
    private int m_length = 0;

    // 편의 오버로드 — 비가상
    public int Find(object value) => Find(value, 0, m_length);
    public int Find(object value, int startIndex) =>
        Find(value, startIndex, m_length - startIndex);

    // 가장 기능이 많은 것 하나만 가상
    public virtual int Find(object value, int startIndex, int endIndex) => -1;
}
```

확장점이 하나뿐이므로 파생 클래스가 어디를 고쳐야 할지 명확하고, 편의 오버로드를 나중에 늘려도 파생 타입에 영향이 없다.

### 기반 클래스가 바뀔 때 — `new`와 `override`의 진짜 용도

CompanyA가 `Phone`을 만들었다.

```csharp
namespace CompanyA {
    public class Phone {
        public void Dial() { Console.WriteLine("Phone.Dial"); }
    }
}
```

CompanyB가 그것을 상속해 `BetterPhone`을 만든다.

```csharp
namespace CompanyB {
    public class BetterPhone : CompanyA.Phone {
        // 이 Dial은 Phone.Dial과 아무 관계가 없다.
        public new void Dial() {
            Console.WriteLine("BetterPhone.Dial");
            EstablishConnection();
            base.Dial();
        }
        protected virtual void EstablishConnection()
            => Console.WriteLine("BetterPhone.EstablishConnection");
    }
}
```

`new`가 없으면 CS0108 경고가 난다 — "상속된 멤버를 숨깁니다. 숨기려는 것이 맞다면 new 키워드를 쓰십시오." **컴파일러가 의미 불일치 가능성을 알려주는 것이다.**

이제 CompanyA가 사용자 피드백을 받아 `Phone`을 개선한다. 연결 수립을 가상 메서드로 분리했다.

```csharp
namespace CompanyA {
    public class Phone {
        public void Dial() { Console.WriteLine("Phone.Dial"); EstablishConnection(); }
        protected virtual void EstablishConnection()
            => Console.WriteLine("Phone.EstablishConnection");
    }
}
```

CompanyB가 다시 빌드하면 이번엔 CS0114가 뜬다 — "상속된 멤버를 숨깁니다. 재정의하려면 override를, 그렇지 않으면 new를 추가하십시오." **기반 클래스가 내 이름을 가로챈 것이다.** 여기서 CompanyB는 두 갈래 중 하나를 골라야 한다.

**두 `EstablishConnection`의 의미가 다르다면** `new`를 붙인다.

```csharp
protected new virtual void EstablishConnection() { /* ... */ }
```

메타데이터에 "이것은 새로 도입된 함수"라는 표시가 남고 CLR은 둘 사이에 아무 관계가 없다고 판단한다. 출력은 이렇게 된다.

```text
BetterPhone.Dial
BetterPhone.EstablishConnection
Phone.Dial
Phone.EstablishConnection
```

**의미가 같다면** `new`를 빼고 `virtual`을 `override`로 바꾸며, 중복이 된 `Dial`은 지운다.

```csharp
namespace CompanyB {
    public class BetterPhone : CompanyA.Phone {
        protected override void EstablishConnection()
            => Console.WriteLine("BetterPhone.EstablishConnection");
    }
}
```

```text
Phone.Dial
BetterPhone.EstablishConnection
```

> **📌 C++가 아니라 C#인 이유**
>
> 네이티브 C++ 컴파일러처럼 **같은 이름·시그니처를 자동으로 오버라이드로 취급했다면**, CompanyB는 `Dial`과 `EstablishConnection`이라는 이름을 아예 쓸 수 없었을 것이다. 이름을 바꾸는 파급 효과가 코드베이스 전체로 번져 소스 호환성과 바이너리 호환성을 함께 깨뜨린다. **C#이 기본을 "관계 없음"으로 잡고 `override`를 명시하게 만든 것은 버전 관리를 위한 설계 결정**이다.

> **⚠️ 그래도 이름이 겹치면 이름을 바꾸는 편이 낫다**
>
> `new`로 경고를 없앨 수는 있지만 같은 이름의 두 가지 의미가 계층에 공존하게 된다. 소스 수정 범위가 감당할 만하다면 이름을 바꿔라. `new`는 **이미 배포된 API 때문에 이름을 바꿀 수 없을 때**의 도구다(79.8절). 그것이 `new` 한정자를 써도 되는 유일한 상황이다.

### 삼각관계의 요약

```text
        다형성                       버전 관리
    (virtual/abstract)  ←──충돌──→  (하위 호환)
            ↑                            ↑
            │                            │
            └────────┬───────────────────┘
                     │
                 컴포넌트
              (독립 배포 단위)

  · 가상 멤버가 많을수록 확장성은 커지고 버전 관리 여지는 줄어든다
  · sealed / internal 은 여지를 남긴다 — 나중에 풀 수 있으므로
  · 확장점은 "많이"가 아니라 "정확히" 열어야 한다
```

확장성과 버전 관리는 근본적으로 상충한다. 밖으로 연 것이 많을수록 나중에 바꿀 수 있는 것이 적다. **좋은 API 설계란 이 둘 사이에서 어디에 선을 그을지를 의식적으로 결정하는 일이지, 무조건 많이 열거나 무조건 잠그는 일이 아니다.**

> **📌 원서 참조**
>
> 이 절은 *CLR via C#* 6장(Type and Member Basics)의 "Components, Polymorphism, and Versioning" 절을 바탕으로 한다. `Phone`/`BetterPhone` 시나리오, `call`/`callvirt` 분석, `sealed` 기본값 논의가 원서의 것이다.

---

## 이 장의 요약

- **공개 API는 코드가 아니라 약속이다.** `public`으로 낸 타입·멤버·매개변수 이름·기본값 전부가 계약이고, 계약을 어기면 남의 빌드나 프로덕션이 깨진다.
- **되돌릴 수 있는 결정만 지금 내려라.** `internal`→`public`, 비가상→가상, `sealed` 해제, 오버로드 추가는 되돌릴 수 있고 그 반대는 아니다. 기본값은 언제나 좁은 쪽이다.
- **인터페이스는 "처럼 행동한다", 기반 클래스는 "이다".** 인터페이스는 시간에 대해 고정이고 기반 클래스는 확장 가능하다. 인터페이스 멤버 구현은 IL에서 `newslot virtual final`이며, 파생 클래스에서 인터페이스를 재선언하는 재구현은 기반 클래스 참조 경로를 절대 고치지 못한다.
- **오버로드는 최소·명확·완전하게.** 같은 이름은 같은 일을 해야 하고, 수치 오버로드는 빈틈이 없어야 하며, 제네릭 폴백과 기반 클래스 오버로드는 컴파일러가 예상 밖의 선택을 하게 만든다.
- **참조 타입을 반환하면 핸들을 넘긴 것이다.** 읽기 전용 프로퍼티도 예외가 아니다. 값 타입·불변 타입·인터페이스·래퍼 중 하나로 막아라.
- **이벤트는 결합을 없애지 않고 옮긴다.** 수명 결합, 순서 의존, 예외 전파, 재진입은 전부 런타임에만 드러난다. 이벤트는 언제나 비가상으로 선언하고 발생 메서드만 가상으로 만들어라.
- **상태 기계로 변환되는 메서드는 예외 시점도 옮긴다.** 반복자와 비동기 메서드의 인수 검증은 지역 함수로 분리해 즉시 보고하라.
- **호환성은 소스·바이너리·동작 셋이다.** 필드→프로퍼티, 선택적 매개변수 추가, `const`→`static readonly`는 소스는 멀쩡한데 바이너리가 깨진다 — 저자의 CI에서 절대 잡히지 않는 종류다.
- **API 표면을 도구로 고정하라.** `PublicAPI.Shipped.txt`와 패키지 검증이 사람의 규율을 대신한다. 없앨 API는 `[Obsolete]`로 유예하고, 계약이 아닌 API는 `[Experimental]`로 표시한다.
- **확장성과 버전 관리는 상충한다.** 좋은 설계는 확장점을 많이 여는 것이 아니라 정확히 여는 것이다.

---

## 연습 문제

1. 클래스 하나에 `public void Message()`로 인터페이스를 암시적 구현한 뒤 `ildasm`이나 ILSpy로 IL을 열어라. `newslot virtual final` 플래그를 확인하고, 같은 메서드를 `virtual`로 바꿨을 때 `final`이 사라지는 것과 파생 클래스의 `override`에 `newslot`이 없는 것을 확인하라.
2. 78.2절의 `MyClass`/`MyDerivedClass` 재구현 예제를 그대로 실행해 세 가지 참조 경로(`MyDerivedClass`, `IMessage`, `MyClass`)가 각각 무엇을 출력하는지 확인하라. 그다음 기반 클래스 메서드를 `virtual`로 바꿔 세 경로가 모두 같아지는 것을 확인하라.
3. 라이브러리 프로젝트에 `public void Log(string message)`를 만들어 콘솔 앱에서 호출하고 빌드하라. 라이브러리만 `public void Log(string message, int priority = 3)`으로 고쳐 다시 빌드한 뒤 **콘솔 앱은 재컴파일하지 말고** 새 DLL만 덮어써서 실행하라. 어떤 예외가 나는가?
4. 3번과 같은 방식으로 `public int Count;` 필드를 `public int Count { get; }` 프로퍼티로 바꿨을 때, 그리고 `public const int Max = 10;`의 값을 20으로 바꿨을 때 각각 무슨 일이 일어나는지 확인하라.
5. `params object[]`를 받는 메서드를 만들고 `object[] items = {1,2,3}`을 그대로 넘겼을 때 원소가 3개로 풀리는 것을 확인하라. 같은 메서드에 `params ReadOnlySpan<object>` 오버로드를 추가하고(※C# 13 이상) 어느 쪽이 호출되는지 확인하라.
6. 이벤트에 핸들러 셋을 붙이고 두 번째가 예외를 던지게 하라. 세 번째가 호출되지 않는 것과 예외가 `Invoke` 호출자에게 전파되는 것을 확인하라. 그다음 `GetInvocationList()`로 순회하도록 고쳐 세 번째도 호출되게 만들어라.
7. 라이브러리 프로젝트에 `Microsoft.CodeAnalysis.PublicApiAnalyzers`를 추가하고 `PublicAPI.Shipped.txt`/`PublicAPI.Unshipped.txt`를 만들어라. 새 public 메서드를 추가했을 때 RS0016이 뜨는 것과, 기존 멤버를 지웠을 때 RS0017이 뜨는 것을 확인하라.

---

**다음 장** — 79장「코드 관용구」에서는 이 장에서 정한 계약 안쪽, 즉 **구현을 쓰는 방식**으로 내려간다. `var`를 쓸 자리와 쓰지 말 자리, `const`보다 `readonly`인 이유(78.13절의 바이너리 호환성 표와 곧바로 이어진다), 캐스트보다 `is`/`as`, 그리고 `new` 한정자를 써도 되는 유일한 경우를 다룬다. 마지막에는 이 관용구들을 분석기와 `.editorconfig`로 팀 전체에 강제하는 방법으로 마무리한다.
