# 15장. `object` 타입과 박싱

> **이 장의 위치** — 14장은 상속 계층을 만드는 법을 다뤘고, 그 계층의 뿌리에 `System.Object`가 있다는 사실만 언급하고 지나갔다. 이 장은 그 뿌리를 정면으로 다룬다. `object`가 가진 여덟 개의 멤버가 각각 무엇인지, 값 타입이 참조 타입의 뿌리를 상속한다는 모순을 CLR이 **박싱**으로 어떻게 봉합하는지, 그리고 그 봉합이 IL 한 줄과 힙 객체 하나로 어떻게 나타나는지를 본다.
>
> **선수 지식** — 6장(구문과 타입 기초), 9장(배열), 13장(클래스와 캡슐화), 14장(상속과 다형성)
>
> **이 장에서 다루지 않는 것** — 박싱된 객체의 물리적 힙 레이아웃과 `MethodTable`의 구조는 54장에서, 실무에서 박싱을 제거하는 최적화 기법은 69장에서, `Equals`/`GetHashCode`를 **어떻게 재정의해야 하는가**는 25장에서 다룬다. 이 장은 문법·IL·개념까지다. 구조체 자체의 설계 규칙은 16장, 구조체가 인터페이스를 구현할 때의 세부는 18.6절, 널 가능 값 타입의 박싱은 21.3절에 있다.

---

## 15.1 모든 타입은 `System.Object`에서 파생된다

### 문법 — 쓰지 않아도 거기 있다

C#에서 기반 클래스를 지정하지 않은 클래스는 `System.Object`를 상속한다(14.1절). 이것은 문법적 편의가 아니라 **런타임의 요구사항**이다. CLR은 모든 타입이 궁극적으로 `System.Object`에서 파생될 것을 요구한다. 따라서 다음 두 정의는 완전히 동일하다.

```csharp
// 암묵적으로 Object에서 파생
class Employee
{
    // ...
}

// 명시적으로 Object에서 파생
class Employee : System.Object
{
    // ...
}
```

C#에서 `object`는 `System.Object`의 별칭(alias)이다. `int`가 `System.Int32`의 별칭인 것과 같다(6.5절). 어느 쪽을 써도 컴파일 결과는 동일하며, 이 책은 타입을 값처럼 다룰 때는 `object`, 클래스로서의 정체를 강조할 때는 `System.Object`를 쓴다.

### 컴파일 결과 — `extends` 절

IL에는 "생략"이 없다. 컴파일러는 항상 `extends` 절을 채워 넣는다.

```il
.class private auto ansi beforefieldinit Employee
       extends [System.Runtime]System.Object
{
  .method public hidebysig specialname rtspecialname
          instance void .ctor() cil managed
  {
    ldarg.0
    call       instance void [System.Runtime]System.Object::.ctor()
    ret
  }
}
```

생성자 본문의 첫 두 줄에 주목하라. 아무 생성자도 정의하지 않은 클래스에도 기본 생성자가 만들어지고, 그 생성자는 `System.Object::.ctor()`를 호출한다. `Object`의 생성자는 아무것도 하지 않고 반환하지만, 호출은 반드시 일어난다.

### 그래서 무엇이 보장되는가

모든 타입이 `Object`에서 파생되므로, **모든 타입의 모든 객체가 최소한의 멤버 집합을 갖는다**는 것이 보장된다. `Object`가 제공하는 공개 인스턴스 메서드는 넷이다.

| 공개 메서드 | 하는 일 | 이 책의 위치 |
|---|---|---|
| `Equals` | 두 객체가 같은 값을 갖는지 반환한다. 기본 구현은 참조 항등성 검사다 | 15.6절, 계약은 25장 |
| `GetHashCode` | 이 객체의 값에 대한 해시 코드를 반환한다. 해시 테이블 컬렉션의 키로 쓰려면 재정의해야 한다 | 15.6절, 계약은 25.4절 |
| `ToString` | 기본 구현은 타입의 전체 이름(`this.GetType().FullName`)을 반환한다. 대개 객체 상태를 나타내는 문자열을 반환하도록 재정의한다 | 15.5절 |
| `GetType` | 이 객체의 타입을 식별하는 `Type` 파생 객체를 반환한다. **비가상**이므로 타입을 속일 수 없다 | 15.4절 |

여기에 파생 타입만 접근할 수 있는 보호 메서드가 둘 더 있다.

| 보호 메서드 | 하는 일 | 이 책의 위치 |
|---|---|---|
| `MemberwiseClone` | 새 인스턴스를 만들고 현재 객체의 인스턴스 필드를 그대로 복사한다. 비가상이다 | 15.6절 |
| `Finalize` | GC가 객체를 쓰레기로 판정한 뒤, 메모리를 회수하기 전에 호출한다. 가상이다 | 13.16절(선언), 34장(동작) |

> **📌 `GetHashCode`가 `Object`에 있는 것은 설계 실수에 가깝다**
>
> 대부분의 타입은 해시 테이블의 키로 쓰이지 않는다. 그럼에도 모든 객체가 `GetHashCode`를 갖게 된 것은, FCL 설계자들이 "아무 객체나 해시 테이블 컬렉션에 넣을 수 있으면 굉장히 유용하겠다"고 판단했기 때문이다. 되돌아보면 이 멤버는 `Object`가 아니라 인터페이스에 정의되었어야 한다. 실제로 오늘날 그 역할은 `IEquatable<T>`와 `IEqualityComparer<T>`가 맡는다(25.7절). 그러나 `Object`의 멤버 집합은 CLR의 근간이라 바꿀 수 없다.

### 런타임 동작 — `new`가 하는 일

`Object`에서 파생된다는 사실은 객체 생성 시점에 구체적인 결과를 낳는다. CLR은 모든 객체가 `new` 연산자로 만들어지기를 요구하며, `new`는 다음을 수행한다.

```csharp
Employee e = new Employee("ConstructorParam1");
```

1. 타입과 그 **모든 기반 타입(`System.Object`까지 포함)** 이 정의한 인스턴스 필드에 필요한 바이트 수를 계산한다. 힙의 모든 객체는 CLR이 객체를 관리하는 데 쓰는 부가 멤버 — 타입 객체 포인터와 싱크 블록 인덱스 — 를 추가로 요구하며, 그 바이트가 객체 크기에 더해진다.
2. 관리 힙에서 그만큼의 바이트를 할당하고, 할당된 바이트를 전부 0으로 채운다.
3. 객체의 타입 객체 포인터와 싱크 블록 인덱스 멤버를 초기화한다.
4. 타입의 인스턴스 생성자를 호출한다. 대부분의 컴파일러는 생성자 안에서 기반 클래스 생성자를 호출하는 코드를 자동으로 방출한다. 결국 `System.Object`의 생성자가 호출되고, 이 생성자는 아무 일도 하지 않고 반환한다.

이 모든 단계가 끝나면 `new`는 새로 만들어진 객체에 대한 참조를 반환한다. 2단계에서 "전부 0으로 채운다"는 것이 확정 할당 규칙(6.9절)의 물리적 근거이고, 1단계의 "부가 멤버"가 박싱 비용의 근거다. 부가 멤버의 정확한 배치는 54.2절에서 다룬다.

> **📌 `new`에 짝이 되는 `delete`는 없다**
>
> C#에는 객체에 할당된 메모리를 명시적으로 해제하는 방법이 없다. CLR은 가비지 컬렉션 환경이며, 객체가 더는 사용되거나 접근되지 않는 시점을 자동으로 검출해 메모리를 회수한다(61장~64장). 이 장에서 박싱을 "비싸다"고 말할 때, 그 비용의 절반은 **할당**이고 나머지 절반은 **언젠가 반드시 치러야 할 수집**이다.

### 타입 계층 — 중간에 무엇이 있는가

`Object` 바로 아래에는 대부분의 참조 타입이 직접 매달리지만, 값 타입은 `System.ValueType`이라는 중간 클래스를 거친다.

```text
                        System.Object
                              │
        ┌──────────┬──────────┼──────────┬──────────────┐
        ↓          ↓          ↓          ↓              ↓
  System.String  Array   Delegate   Exception    System.ValueType
   (참조 타입)      │        │                          │
                   ↓        ↓                ┌─────────┼─────────┐
              (모든 배열) (모든 델리게이트)      ↓         ↓         ↓
                                          Int32     Double   System.Enum
                                          Boolean   Guid         │
                                          DateTime  ...          ↓
                                          (모든 구조체)      (모든 열거형)
```

`System.ValueType`은 `Object`를 상속하는 **클래스**이며, 자신을 상속하는 타입들에게 값 타입의 의미론을 부여한다. 여기서 `Equals`와 `GetHashCode`가 재정의되어 있고, 이 재정의된 구현이 15.6절에서 다룰 성능 함정의 원천이다. `System.Enum`은 다시 `ValueType`을 상속하며, 모든 `enum`의 기반이다(20.1절).

> **⚠️ `ValueType`이 클래스라는 것이 이상하게 느껴져야 정상이다**
>
> "모든 값 타입의 기반 클래스가 참조 타입"이라는 문장은 모순처럼 들린다. 실제로 이것이 이 장 전체의 주제다. 값 타입 인스턴스는 자기를 담고 있는 곳에 그대로 살고 힙 객체가 아니지만(6.7절), 타입 시스템의 계보상으로는 참조 타입 계층에 매달려 있다. CLR은 이 두 사실을 **박싱**으로 화해시킨다. 값 타입 인스턴스를 참조로 다뤄야 할 때 그때그때 힙 객체를 만들어 주는 것이다.

### 타입 통합 — 왜 이렇게 만들었는가

모든 타입이 `object`로 업캐스트될 수 있다는 성질은 실용적인 결과를 낳는다. 아무 타입이나 담을 수 있는 자료구조를 하나만 만들면 되기 때문이다. 열 개까지 담을 수 있는 스택을 보자.

```csharp
public class Stack
{
    int position;
    object[] data = new object[10];

    public void Push(object obj) { data[position++] = obj; }
    public object Pop()          { return data[--position]; }
}
```

`Stack`이 `object`를 다루므로 어떤 타입의 인스턴스든 넣고 뺄 수 있다.

```csharp
Stack stack = new Stack();
stack.Push("sausage");
string s = (string) stack.Pop();   // 다운캐스트이므로 명시적 캐스트가 필요하다

Console.WriteLine(s);              // sausage
```

`object`는 클래스이므로 참조 타입이다. 그럼에도 `int` 같은 값 타입 역시 `object`로 캐스팅되고 `object`에서 캐스팅되어 나올 수 있다.

```csharp
stack.Push(3);
int three = (int) stack.Pop();
```

C#의 이 성질을 **타입 통합**(type unification)이라 한다. 값 타입과 참조 타입이 하나의 타입 계층으로 통합되어 있다는 뜻이다. 값 타입과 `object` 사이를 오갈 때 CLR은 값 의미론과 참조 의미론의 차이를 메우기 위해 특별한 일을 해야 하며, 그 과정이 박싱과 언박싱이다.

> **📌 이 `Stack`은 역사적 유물이다**
>
> `object` 기반 컬렉션은 제네릭이 없던 C# 1의 방식이다. `System.Collections.ArrayList`, `Hashtable`, `Queue`, `Stack`이 전부 이렇게 만들어졌고, 값 타입을 넣을 때마다 박싱이 일어났다. C# 2의 제네릭은 같은 유연성을 박싱 없이, 게다가 컴파일 타임 타입 안전성까지 얹어서 제공한다. 이 `Stack`을 `Stack<T>`로 고치는 과정은 23.1절에서 다룬다. 지금은 **박싱이 왜 존재하는가**를 이해하는 재료로만 쓴다.

### 예외 — `object`에서 파생되지 않는 것들

"모든 타입"이라는 표현에는 몇 가지 단서가 붙는다. 정확히 말하면 이렇다.

| 대상 | `Object`에서 파생되는가 | `object`로 변환 가능한가 | 비고 |
|---|---|---|---|
| 클래스 | 예 | 예 | 기반을 안 쓰면 자동으로 `object` |
| 구조체 | 예 (`ValueType` 경유) | 예 — **박싱** | 15.2절 |
| 열거형 | 예 (`Enum` 경유) | 예 — **박싱** | 20.1절 |
| 배열 | 예 (`System.Array` 경유) | 예 | 참조 변환 |
| 델리게이트 | 예 (`MulticastDelegate` 경유) | 예 | 26장 |
| **인터페이스** | **아니오** | 예 | 아래 설명 |
| **포인터 타입 (`int*`)** | **아니오** | **아니오** | 관리되지 않는 타입 |
| **`ref struct`** | 형식상 예 | **아니오** | 박싱 자체가 금지된다 |
| 정적 클래스 | 예 | 인스턴스가 없다 | 13.11절 |

**인터페이스**는 메타데이터상 어떤 타입도 `extends`하지 않는다. 인터페이스 정의의 IL을 보면 `extends` 절이 아예 없다.

```il
.class interface public abstract auto ansi IComparable
{
  .method public hidebysig newslot abstract virtual
          instance int32 CompareTo(object obj) cil managed { }
}
```

그럼에도 인터페이스 타입의 식은 `object`로 암시적 변환된다. 인터페이스 타입 변수에 담길 수 있는 것은 결국 어떤 클래스나 박싱된 값 타입의 인스턴스뿐이고, 그것들은 전부 `Object`에서 파생되기 때문이다. 즉 "인터페이스가 `Object`를 상속한다"가 아니라 "인터페이스의 모든 **구현체**가 `Object`를 상속한다"가 정확한 서술이다. 그 실용적 결과로 인터페이스 참조에도 `ToString()`, `GetHashCode()`, `Equals()`, `GetType()`을 호출할 수 있다.

```csharp
IComparable c = 42;                 // int를 박싱해서 IComparable에 담는다
Console.WriteLine(c.GetType());     // System.Int32 — object의 멤버를 부를 수 있다
```

**포인터 타입**은 관리되지 않는(unmanaged) 타입이고, 타입 계층 바깥에 있다. `int*`를 `object`에 담을 수 없다. 안전하지 않은 코드는 이 책 범위 밖이지만, "모든 타입"이라는 문장의 반례로 기억해 둘 가치가 있다.

**`ref struct`** ※C# 7.2 는 형식상 `ValueType`을 거쳐 `Object`를 상속하지만, 언어 규칙이 `object`로의 변환 자체를 금지한다.

```csharp
Span<int> span = stackalloc int[4];
// object o = span;         // 컴파일 오류 CS0029 — ref struct는 박싱할 수 없다
// IDisposable d = span;    // 컴파일 오류 — 인터페이스 캐스트도 박싱이다
```

이유는 명확하다. `ref struct`는 스택 프레임보다 오래 살면 안 되는 타입이고, 박싱은 정의상 힙에 옮겨 담는 연산이다. 두 성질은 양립할 수 없다. `ref struct`가 인터페이스를 구현할 수 없는 이유도(※C# 13에서 제약이 일부 완화되었으나 박싱 금지는 그대로다) 같다. 상세는 16.6절과 68장에 있다.

> **⚠️ "모든 타입은 object로 변환된다"는 세 군데서 깨진다**
>
> 인터페이스는 파생 관계가 아니라 변환 규칙으로 연결되고, 포인터 타입은 아예 변환되지 않으며, `ref struct`는 변환이 금지된다. 제네릭 코드에서 `object o = value;`를 쓰는 순간 이 셋 중 어느 것도 타입 인수로 올 수 없게 된다는 뜻이다. `Span<T>`를 받을 수 있는 제네릭 메서드를 쓰고 싶다면 시그니처 어디에도 `object` 변환이 들어가지 않게 설계해야 한다. `where T : allows ref struct` ※C# 13 가 이 문제를 겨냥한 기능이다.

### `object` 인스턴스를 직접 만드는 경우

`System.Object`는 추상 클래스가 아니므로 인스턴스를 만들 수 있다.

```csharp
object o = new object();
```

이 객체는 필드가 하나도 없으므로 담을 수 있는 상태가 없다. 그럼에도 쓰임새가 있는데, **정체성만 필요한 자리**다. 가장 흔한 것이 잠금 객체다.

```csharp
public class Counter
{
    private readonly object _gate = new object();
    private int _value;

    public void Increment()
    {
        lock (_gate) { _value++; }
    }
}
```

`_gate`는 값이 필요 없고 "이 객체는 유일하다"는 성질만 필요하다. `object`가 정확히 그것이다. ※C# 13 / .NET 9 부터는 이 용도를 위한 전용 타입 `System.Threading.Lock`이 생겼고, 그쪽이 더 빠르다(48.15절). 그러나 관용구 자체는 여전히 흔하게 보인다.

> **⚠️ 값 타입은 `lock`의 대상이 될 수 없다**
>
> 박싱되지 않은 값 타입에는 싱크 블록 인덱스가 없다. 그래서 `System.Threading.Monitor` 타입의 메서드(또는 C#의 `lock` 문)로 여러 스레드가 인스턴스 접근을 동기화하는 것이 **불가능하다**(48.5절).
>
> ```csharp
> int gate = 0;
> // lock (gate) { }              // 컴파일 오류 CS0185
> object boxedGate = gate;
> lock (boxedGate) { }            // 컴파일은 되지만 거의 확실히 버그다
> ```
>
> 두 번째가 더 위험하다. 컴파일러가 막아 주지 않지만, 값을 박싱할 때마다 **새 객체**가 만들어지므로 두 스레드가 같은 값을 박싱해 잠그면 서로 다른 객체를 잠그게 된다. 아무것도 동기화되지 않는데 코드는 정상으로 보인다. 잠금 대상은 언제나 `readonly` 참조 타입 필드여야 한다(48.6절).

---

## 15.2 박싱과 언박싱 — 문법, IL, 비용

### 문법 — 한쪽은 조용하고 한쪽은 시끄럽다

**박싱**(boxing)은 값 타입 인스턴스를 참조 타입 인스턴스로 변환하는 행위다. 변환 대상이 되는 참조 타입은 `object` 클래스일 수도 있고 인터페이스일 수도 있다.

```csharp
int x = 9;
object obj = x;        // int를 박싱한다 — 캐스트 없이, 암시적으로
```

**언박싱**(unboxing)은 그 반대 방향이다. `object`를 원래의 값 타입으로 되돌린다.

```csharp
int y = (int) obj;     // int를 언박싱한다 — 명시적 캐스트가 필요하다
```

문법의 비대칭이 중요하다. 박싱은 **암시적**이라 코드에 아무 흔적도 남기지 않고, 언박싱은 **명시적**이라 캐스트 연산자가 눈에 보인다. 이 비대칭 때문에 성능 문제를 일으키는 쪽(박싱)이 정작 소스에서는 보이지 않는다. 이 장의 나머지 절반이 "보이지 않는 박싱을 찾는 법"인 이유다.

언박싱에는 런타임 검사가 따른다. 런타임은 요청된 값 타입이 실제 객체의 타입과 일치하는지 확인하고, 일치하지 않으면 `InvalidCastException`을 던진다.

```csharp
object obj = 9;            // 9는 int로 추론된다
long x = (long) obj;       // InvalidCastException
```

`int`는 `long`으로 암시적 변환되는데도 실패한다. 언박싱은 **정확히 그 타입**으로만 되기 때문이다. 다음은 성공한다.

```csharp
object obj = 9;
long x = (int) obj;        // 먼저 int로 언박싱한 뒤 long으로 확대 변환
```

이것도 성공한다.

```csharp
object obj = 3.5;          // 3.5는 double로 추론된다
int x = (int)(double) obj; // (double)이 언박싱, (int)가 숫자 변환. x는 3
```

마지막 예에서 캐스트 두 개는 서로 다른 연산이다. 안쪽 `(double)`은 언박싱, 바깥쪽 `(int)`는 숫자 변환이다. 같은 캐스트 문법이 전혀 다른 두 가지 일을 한다는 것이 C# 캐스트 연산자의 다의성이며(14.7절), 언박싱은 그 다의성 중 하나다.

> **⚠️ 언박싱 실패는 컴파일러가 막아 주지 않는다**
>
> ```csharp
> int   x = 5;
> object o = x;
> short y = (short) o;     // 컴파일 성공. 런타임에 InvalidCastException
> ```
>
> 논리적으로는 박싱된 `int`를 `short`로 좁히는 것이 말이 된다. 그러나 런타임은 "이 객체가 박싱된 `short`인가?"만 묻고, 답이 아니면 예외다. 올바른 코드는 이렇다.
>
> ```csharp
> short y = (short)(int) o;   // 정확한 타입으로 언박싱한 뒤 변환
> ```
>
> 타입을 확신할 수 없다면 `Convert.ToInt16(o)`처럼 변환 API를 쓰는 방법도 있지만, 그 경우 별도의 오버헤드가 붙고 예외 종류도 달라진다 — 값이 대상 타입의 범위를 벗어나면 `OverflowException`, 변환 자체가 불가능하면 `InvalidCastException`이나 `FormatException`이 된다(38.9절).

### 복사 의미론 — 박스는 스냅숏이다

박싱은 값 타입 인스턴스를 새 객체로 **복사**하고, 언박싱은 객체의 내용을 값 타입 인스턴스로 **복사한다**. 그래서 원본을 바꿔도 이미 박싱된 복사본은 바뀌지 않는다.

```csharp
int i = 3;
object boxed = i;
i = 5;
Console.WriteLine(boxed);      // 3
```

반대 방향도 마찬가지다. 언박싱해서 얻은 값을 수정해도 힙의 박스는 그대로다. 이 성질은 값 타입 복사 의미론(16.2절)의 자연스러운 연장이지만, 박싱이 암시적이라 복사가 일어난 지점이 눈에 보이지 않는다는 점에서 훨씬 위험하다.

> **📌 박싱된 값의 수명은 원본보다 길다**
>
> ```csharp
> void Add(ArrayList list)
> {
>     Point p;
>     for (int i = 0; i < 10; i++)
>     {
>         p.X = p.Y = i;
>         list.Add(p);     // p를 박싱해서 참조를 넣는다
>     }
> }
> ```
>
> 지역 변수 `p` 하나를 재사용하는데도 힙에는 박싱된 `Point`가 열 개 생긴다. `ArrayList`는 `p`에 대해 아무것도 모르고, 자기가 받은 열 개의 참조만 안다. `p`는 메서드가 끝나면 사라지지만 박스 열 개는 GC가 수집할 때까지 힙에 남는다. **박싱된 값의 수명은 박싱되지 않은 원본의 수명을 넘어선다.**

### 박싱 변환은 변성(variance)에 참여하지 못한다

박싱 변환은 통합된 타입 시스템을 제공하는 데 결정적이다. 그러나 그 시스템이 완벽하지는 않다. 배열과 제네릭의 변성은 **참조 변환만** 지원하고 박싱 변환은 지원하지 않는다.

```csharp
object[] a1 = new string[3];    // 합법 — 참조 변환
object[] a2 = new int[3];       // 컴파일 오류 — 박싱 변환이 필요하다
```

첫 줄이 되는 이유는 배열 공변성(9.6절) 때문이다. `string` 참조와 `object` 참조는 **비트 표현이 같으므로**, `string[]`을 `object[]`로 보는 것은 요소를 하나도 건드리지 않고 시야만 넓히는 일이다. 그래서 실행 시점에 아무 비용도 들지 않는다.

둘째 줄이 안 되는 이유는, `int[]`을 `object[]`로 보려면 **모든 요소를 박싱해서 새 배열을 만들어야 하기 때문**이다. 그것은 시야를 넓히는 것이 아니라 완전히 다른 배열을 만드는 일이다. C#은 이런 비용이 캐스트 하나 뒤에 숨는 것을 허용하지 않는다. 정말 필요하면 명시적으로 만들어야 한다.

```csharp
int[]    src  = { 1, 2, 3 };
object[] dest = new object[src.Length];
Array.Copy(src, dest, src.Length);   // 세 개가 각각 박싱되어 들어간다
```

같은 제약이 제네릭 변성에도 적용된다. `IEnumerable<out T>`의 공변성은 참조 변환만 다루므로 `IEnumerable<int>`를 `IEnumerable<object>`로 볼 수 없다.

```csharp
IEnumerable<string> strings = new[] { "a", "b" };
IEnumerable<object> objs1   = strings;             // 합법

IEnumerable<int> ints = new[] { 1, 2 };
// IEnumerable<object> objs2 = ints;               // 컴파일 오류
IEnumerable<object> objs3 = ints.Cast<object>();   // 요소마다 박싱된다
```

> **📌 "참조 변환은 공짜, 박싱 변환은 유료"가 규칙이다**
>
> 14.7절에서 참조 변환은 "논리적으로 새 참조가 만들어질 뿐 객체 자체는 바뀌지 않는다"고 했다. 변성이 참조 변환만 허용하는 이유가 정확히 그것이다. **비트가 바뀌지 않는 변환만 무료로 허용한다.** 박싱은 비트를 옮기고 객체를 만드는 변환이므로 그 자격이 없다. 제네릭 변성 규칙 전체는 23.10절에 있다.

### 런타임 동작 — 박싱할 때 정확히 무엇이 일어나는가

값 타입 인스턴스가 박싱될 때 내부적으로 일어나는 일은 셋이다.

1. 관리 힙에서 메모리를 할당한다. 할당량은 **값 타입의 필드가 요구하는 크기 + 힙의 모든 객체가 요구하는 두 개의 부가 멤버**(타입 객체 포인터와 싱크 블록 인덱스)다.
2. 값 타입의 필드를 새로 할당된 힙 메모리로 복사한다.
3. 객체의 주소를 반환한다. 이 주소는 이제 객체에 대한 참조다 — 값 타입이 참조 타입이 되었다.

그림으로 보면 이렇다.

```text
   박싱 전                              박싱 후

   ┌──────────────┐                    ┌──────────────┐        관리 힙
   │  int i = 42  │                    │  int i = 42  │   ┌──────────────────────┐
   │              │  ── box ──▶        ├──────────────┤   │  싱크 블록 인덱스       │
   │  힙 할당 없음  │                    │  object o ●──┼──▶├══════════════════════┤
   │  메타데이터 0  │                    └──────────────┘   │  타입 객체 포인터       │
   └──────────────┘                                       │   ▸ System.Int32     │
                                                          ├──────────────────────┤
     값 4바이트, 끝                                          │  값 42               │
                                                          └──────────────────────┘

                                                            ① 할당  ② 값 복사  ③ 주소 반환
```

`int` 하나(4바이트)를 박싱하면 힙에서 그보다 훨씬 큰 자리를 차지한다. 정확한 바이트 수와 최소 객체 크기 규칙은 54.3절에, 이 레이아웃의 물리적 세부는 54.2절에 있다. 여기서 기억할 것은 **"작은 값 하나가 헤더 두 개를 달고 힙으로 간다"** 는 것뿐이다.

### 언박싱은 캐스트가 아니라 포인터 획득이다

언박싱은 박싱의 정확한 역연산이 **아니다**. 이것이 이 절에서 가장 중요한 개념이다.

박싱은 할당 + 복사다. 언박싱은 **박싱된 객체 안에 들어 있는 순수한 값 타입 데이터를 가리키는 포인터를 얻는 연산**이다. 그 포인터는 박싱된 인스턴스 안의 "언박싱된 부분"을 가리킨다. 박싱과 달리 언박싱 자체는 **메모리 바이트를 복사하지 않고, 힙 할당도 하지 않는다.**

```text
   박싱된 Point 객체 (힙)

   ┌──────────────────────┐
   │  싱크 블록 인덱스       │
   ├══════════════════════┤ ◀── object 참조(o)가 가리키는 곳
   │  타입 객체 포인터       │
   ├──────────────────────┤ ◀── unbox가 반환하는 포인터가 가리키는 곳
   │  m_x                 │      (= "언박싱된 부분"의 시작)
   │  m_y                 │
   └──────────────────────┘
```

그래서 언박싱은 박싱보다 **훨씬 싸다**. 다만 중요한 단서가 붙는다 — 실무에서 언박싱 연산 뒤에는 거의 항상 필드 복사가 따라온다. 얻은 포인터로 값을 실제로 써야 하기 때문이다.

```csharp
Point p;
p.x = p.y = 1;

object o = p;      // p를 박싱한다. o는 박싱된 인스턴스를 참조한다

p = (Point) o;     // o를 언박싱하고 AND 필드를 박싱된 인스턴스에서
                   // 스택 변수로 복사한다
```

마지막 줄에서 C# 컴파일러는 두 가지 일을 지시한다 — `o`를 언박싱(박싱된 인스턴스 안 필드의 주소를 얻기)하고, 그 필드를 힙에서 스택 변수 `p`로 복사하기.

박싱된 값 타입 인스턴스가 언박싱될 때 내부적으로 정확히 다음이 일어난다.

1. 박싱된 값 타입 인스턴스에 대한 참조를 담은 변수가 `null`이면 `NullReferenceException`이 발생한다.
2. 참조가 **원하는 값 타입의 박싱된 인스턴스**를 가리키지 않으면 `InvalidCastException`이 발생한다.

> **⚠️ `null` 언박싱은 `InvalidCastException`이 아니다**
>
> ```csharp
> object o = null;
> int x = (int) o;      // NullReferenceException — InvalidCastException이 아니다
> ```
>
> 캐스트 실패는 `InvalidCastException`, `null` 참조 역참조는 `NullReferenceException`이라는 직관에 어긋나 보이지만, 언박싱이 "참조를 따라가 안쪽 데이터의 주소를 얻는" 연산이라는 것을 알면 자연스럽다. **`null`을 따라갈 수는 없다.** 참조 타입으로의 다운캐스트는 `null`을 통과시키므로(`(string) null`은 성공한다) 이 차이를 헷갈리기 쉽다.
>
> 널 가능 값 타입으로 언박싱하면 `null`도 안전하게 받을 수 있다. `int? x = (int?) o;`는 `o`가 `null`이면 `null`을 준다. CLR이 `Nullable<T>`에 부여한 특별 지원 덕분이며, 21.3절에서 다룬다.

### 컴파일 결과 — `box`, `unbox`, `unbox.any`

IL에는 이 세 연산에 대응하는 명령이 있다.

| IL 명령 | 하는 일 | 힙 할당 | 값 복사 |
|---|---|---|---|
| `box <타입>` | 값을 담을 박싱 인스턴스를 할당하고 값을 복사한 뒤 참조를 스택에 푸시한다 | O | O |
| `unbox <타입>` | 박싱 인스턴스 안 데이터를 가리키는 관리 포인터를 푸시한다 | X | X |
| `ldobj <타입>` | 주어진 주소에 있는 값을 평가 스택으로 복사한다 | X | O |
| `unbox.any <타입>` | `unbox` 다음에 `ldobj`가 오는 것과 동등하다 | X | O |
| `isinst <타입>` | 타입 검사. 호환되면 참조를, 아니면 `null`을 푸시한다 | X | X |
| `castclass <타입>` | 참조 타입 다운캐스트. 실패하면 `InvalidCastException` | X | X |

**C# 컴파일러가 언박싱 캐스트에 대해 방출하는 것은 `unbox.any`다.** 즉 C#에서는 언박싱과 복사가 항상 붙어 다닌다. 순수한 `unbox`는 IL에 존재하지만 C#은 그 명령만 단독으로 쓰는 문법을 제공하지 않는다.

가장 단순한 예를 보자.

```csharp
int  v = 5;
object o = v;
v = (int) o;
```

```il
.locals init ([0] int32 v, [1] object o)

IL_0000: ldc.i4.5
IL_0001: stloc.0
IL_0002: ldloc.0
IL_0003: box        [System.Runtime]System.Int32   // 박싱
IL_0008: stloc.1
IL_0009: ldloc.1
IL_000a: unbox.any  [System.Runtime]System.Int32   // 언박싱 + 복사
IL_000f: stloc.0
IL_0010: ret
```

> **📌 C++/CLI는 `unbox`를 직접 쓸 수 있다**
>
> C++/CLI 같은 일부 언어는 필드를 복사하지 않고 박싱된 값 타입을 언박싱할 수 있다. 언박싱이 반환한 포인터로 **힙에 있는 박싱된 인스턴스의 필드를 직접 수정**하는 것이다. C#은 이 능력을 언어 차원에서 봉인했다. 안전성 때문이며, 그 대가로 뒤에서 볼 "박싱된 값은 수정할 수 없다"는 성질이 생긴다.

### 박싱은 몇 번 일어나는가

박싱을 세는 연습이 필요하다. 다음 코드에서 박싱은 몇 번 일어나는가?

```csharp
public static void Main()
{
    int    v = 5;                              // 박싱되지 않은 값 타입 변수
    object o = v;                              // o는 5를 담은 박싱된 int를 참조한다
    v = 123;                                   // 박싱되지 않은 값을 123으로 바꾼다
    Console.WriteLine(v + ", " + (int) o);     // "123, 5"
}
```

답은 **세 번**이다. IL을 보면 명확하다.

```il
.method public hidebysig static void Main() cil managed
{
  .entrypoint
  .maxstack 3
  .locals init ([0] int32 v, [1] object o)

  IL_0000: ldc.i4.5
  IL_0001: stloc.0
  IL_0002: ldloc.0
  IL_0003: box        [mscorlib]System.Int32   // ← 박싱 ① : o = v
  IL_0008: stloc.1
  IL_0009: ldc.i4.s   123
  IL_000b: stloc.0
  IL_000c: ldloc.0
  IL_000d: box        [mscorlib]System.Int32   // ← 박싱 ② : Concat의 arg0
  IL_0012: ldstr      ", "
  IL_0017: ldloc.1
  IL_0018: unbox.any  [mscorlib]System.Int32   //   언박싱 : (int) o
  IL_001d: box        [mscorlib]System.Int32   // ← 박싱 ③ : Concat의 arg2
  IL_0022: call       string [mscorlib]System.String::Concat(object, object, object)
  IL_0027: call       void [mscorlib]System.Console::WriteLine(string)
  IL_002c: ret
}
```

`WriteLine`은 `String`을 원하는데 문자열이 없다. 컴파일러가 가진 재료는 박싱되지 않은 `int`(`v`), `String`, 그리고 `int`로 캐스팅되는 박싱된 `int`(`o`) 셋이다. 이 셋으로 문자열을 만들기 위해 컴파일러는 `String.Concat`의 다음 오버로드를 고른다.

```csharp
public static String Concat(Object arg0, Object arg1, Object arg2);
```

`arg0`에는 `v`가 가야 하는데 `v`는 박싱되지 않은 값이므로 박싱된다(②). `arg1`은 이미 `String` 참조라 그대로 간다. `arg2`에는 `(int) o`가 가는데, 이것은 **언박싱해서 값을 꺼낸 뒤 다시 박싱**하는 왕복이다(③).

캐스트 하나만 지워 보자.

```csharp
Console.WriteLine(v + ", " + o);      // "123, 5"
```

`o`는 이미 `object`에 대한 참조이므로 주소를 그대로 넘기면 된다. 캐스트를 지우니 **언박싱 하나와 박싱 하나**가 사라졌다. IL 크기가 10바이트 줄고, 더 중요하게는 앞으로 수집되어야 할 객체가 하나 덜 만들어진다.

한 걸음 더 갈 수 있다.

```csharp
Console.WriteLine(v.ToString() + ", " + o);   // "123, 5"
```

이제 박싱되지 않은 `v`에 대해 `ToString`이 직접 호출되고 `String`이 반환된다. `String`은 이미 참조 타입이므로 박싱 없이 `Concat`에 넘어간다. 박싱은 ①만 남는다.

> **⚠️ 값 하나를 여러 번 넘길 거면 손으로 한 번만 박싱하라**
>
> ```csharp
> int v = 5;
>
> // 나쁨 — v가 세 번 박싱된다. 힙 객체 세 개, 내용은 전부 5
> Console.WriteLine("{0}, {1}, {2}", v, v, v);
>
> // 좋음 — 손으로 한 번만 박싱한다
> object o = v;
> Console.WriteLine("{0}, {1}, {2}", o, o, o);
> ```
>
> 아래 버전은 훨씬 빠르게 실행되고 힙을 덜 쓴다. 컴파일러가 같은 값을 반복해서 박싱하도록 만드는 코드를 쓰고 있다는 것을 알면, 직접 박싱하는 편이 코드도 작고 빠르다. 다만 이 최적화는 `params object[]`를 받는 오래된 오버로드가 선택될 때만 의미가 있다 — 현대 코드에서는 애초에 보간 문자열 핸들러(35.7절)가 그 자리를 대신한다.

### 성능 영향 — 세 가지 비용

박싱의 비용은 셋으로 나뉜다.

| 비용 | 내용 | 언제 문제가 되는가 |
|---|---|---|
| **할당** | 관리 힙에서 메모리를 잘라 낸다. 범프 포인터 할당이라 그 자체는 빠르다 | 루프 안에서 반복될 때 |
| **복사** | 값의 바이트를 힙으로 복사한다. 큰 구조체일수록 비싸다 | 큰 구조체를 박싱할 때 |
| **수집** | 만들어진 객체는 언젠가 GC가 수집해야 한다 | 0세대 GC 빈도가 올라가고, 살아남으면 승격까지 일어난다 |

세 번째가 가장 무섭다. 할당과 복사는 눈에 보이는 CPU 시간이지만, GC 압력은 **박싱과 무관한 코드의 지연 시간**으로 나타나기 때문이다. 루프에서 초당 수만 번 박싱하는 코드는 자기 자신이 느려지는 것보다 애플리케이션 전체의 일시 정지 빈도를 올리는 쪽으로 더 크게 해를 끼친다. 이 연쇄는 63장과 64장에서 다룬다.

반면 언박싱은 힙 할당을 유발하지 않는다. 값이 힙에서 스택으로 복사되는 메모리 복사 오버헤드는 있지만, 애초에 박싱이 없었다면 언박싱도 없다. **박싱을 줄이면 언박싱은 저절로 줄어든다.**

### 박싱이 조용히 일어나는 자리

박싱은 암시적이므로, 어디서 일어나는지를 목록으로 외워 두는 것이 현실적인 대응이다.

| # | 상황 | 예 | 왜 |
|---|---|---|---|
| 1 | 값 타입을 `object` 매개변수에 넘길 때 | `list.Add(point)` (`ArrayList`) | 매개변수가 참조를 요구한다 |
| 2 | 값 타입을 인터페이스 타입으로 캐스트할 때 | `IComparable c = p;` | 인터페이스 변수는 힙 객체 참조여야 한다 |
| 3 | `params object[]` 매개변수 | `string.Format("{0}", i)` | 배열 요소가 `object`다 |
| 4 | 문자열 연결·보간에서 `object` 오버로드가 선택될 때 | `"x=" + i` | `Concat(object, object)` |
| 5 | `Equals(object)` 오버로드 호출 | `p1.Equals((object)p2)` | 매개변수가 `object`다 |
| 6 | 비제네릭 컬렉션 | `Hashtable`, `ArrayList`, `Queue` | API가 전부 `object` 기반 |
| 7 | 비제네릭 `IEnumerable` 열거 | `foreach (int x in arrayList)` | `Current`가 `object`다 |
| 8 | LINQ의 비제네릭 진입점 | `.Cast<int>()`, `.OfType<int>()` | 원본이 `IEnumerable`이면 요소가 이미 박싱되어 있다 |
| 9 | `object` 필드·배열 요소에 값 대입 | `object[] a; a[0] = 1;` | 요소 타입이 `object`다 |
| 10 | 값 타입에서 `object`의 **비가상** 메서드 호출 | `p.GetType()` | `this`가 힙 객체 참조여야 한다 |
| 11 | 재정의하지 않은 가상 메서드 호출 | `ToString()`을 재정의 안 한 구조체 | 기반 구현을 부르려면 박싱이 필요하다 |
| 12 | 재정의 안에서 `base` 호출 | `base.ToString()` | 기반 메서드의 `this`가 참조여야 한다 |
| 13 | 열거형을 `object`로 다룰 때 | `Enum.Format(...)`, 구버전 `HasFlag` | 열거형도 값 타입이다 |
| 14 | 리플렉션 호출 | `mi.Invoke(obj, args)`, `pi.GetValue(x)` | API가 전부 `object` 기반 |
| 15 | 배열 요소를 `GetValue`/`SetValue`로 접근 | `a.SetValue(42, 3)` | 9.7절에서 본 그대로 |

각각을 문법 → 결과 순으로 짧게 확인하자.

**2번 — 인터페이스 캐스트.** 박싱되지 않은 값 타입 인스턴스를 그 타입의 인터페이스 중 하나로 캐스팅하면 인스턴스가 박싱된다. 인터페이스 변수는 항상 힙 객체에 대한 참조를 담아야 하기 때문이다.

```csharp
Point p1 = new Point(10, 10);
IComparable c = p1;                 // p1이 박싱되고, 참조가 c에 들어간다
Console.WriteLine(c.GetType());     // Point — c가 박싱된 Point를 가리킨다는 증거
```

**3번과 4번 — `params object[]`와 문자열 조합.** 오래된 포매팅 API는 임의 개수의 값을 받기 위해 `params object[]`를 쓴다. 배열의 요소 타입이 `object`이므로 값 타입 인수는 전부 박싱되고, 게다가 배열 자체도 힙 할당이다.

```csharp
// 힙 할당 4개: object[] 하나 + 박싱된 int 셋
string s = string.Format("{0}-{1}-{2}", 1, 2, 3);
```

문자열 연결도 마찬가지다. `+` 연산자는 `String.Concat`으로 컴파일되는데, `Concat`에는 `string`을 받는 오버로드와 `object`를 받는 오버로드가 있고 값 타입 피연산자가 있으면 후자가 선택된다.

```csharp
int i = 42;
string a = "x=" + i;              // Concat(object, object) — i가 박싱된다
string b = "x=" + i.ToString();   // Concat(string, string) — 박싱 없음
string c = $"x={i}";              // ※C# 10 이상에서는 보간 핸들러 경로 — 박싱 없음
```

세 줄의 결과 문자열은 같지만 할당은 다르다. 보간 문자열이 ※C# 10 부터 `DefaultInterpolatedStringHandler`로 컴파일되면서 이 함정은 상당 부분 사라졌지만, 대상 프레임워크가 낮거나 `string.Format`을 직접 부르는 코드에는 그대로 남아 있다(35.7절).

**7번과 8번 — 비제네릭 열거와 LINQ.** 비제네릭 `IEnumerator`의 `Current` 프로퍼티는 `object`를 반환한다. 그래서 비제네릭 컬렉션을 `foreach`로 돌면 요소마다 박싱·언박싱이 일어난다.

```csharp
var list = new ArrayList { 1, 2, 3 };
foreach (int x in list)     // Current(object) → int 언박싱이 요소마다 일어난다
    Console.WriteLine(x);
```

LINQ 연산자는 대부분 `IEnumerable<T>`에서 시작하므로 그 자체로는 박싱을 만들지 않는다. 문제는 **비제네릭 시퀀스를 제네릭 세계로 끌어오는 다리**들이다.

```csharp
IEnumerable nonGeneric = new ArrayList { 1, 2, 3 };

var q1 = nonGeneric.Cast<int>().Where(x => x > 1);     // 요소는 이미 박싱되어 있다
var q2 = nonGeneric.OfType<int>().Sum();               // 타입 검사 + 언박싱이 요소마다
```

`Cast<T>`와 `OfType<T>`는 `IEnumerable`(비제네릭)을 받는 유일한 표준 연산자이며, 요소가 값 타입이면 언박싱이 필수다. 다차원 배열을 LINQ로 다룰 때 `Cast<int>()`가 필요한 이유도 이것이다(9.7절). 비제네릭 시퀀스가 소스에 등장하는 순간 박싱은 이미 벌어진 뒤이므로, **고칠 지점은 LINQ 쿼리가 아니라 그 시퀀스를 만든 코드**다. LINQ 자체의 할당 특성은 30.14절에서 다룬다.

**10번과 11번 — 값 타입의 메서드 호출.** 여기가 가장 헷갈리는 자리다. 규칙을 표로 정리하면 이렇다.

| 호출 대상 | 박싱되는가 | 이유 |
|---|---|---|
| 값 타입이 **재정의한** 가상 메서드 (`ToString` 등) | **아니오** | JIT이 정확한 구현을 알므로 비가상으로 직접 호출한다 |
| 값 타입이 재정의하지 **않은** 가상 메서드 | **예** | 기반 타입의 구현을 부르려면 `this`가 참조여야 한다 |
| 재정의 구현이 부르는 `base.X()` | **예** | 기반 구현의 `this`가 힙 객체 참조여야 한다 |
| `Object`의 **비가상** 메서드 (`GetType`, `MemberwiseClone`) | **예** | `Object`가 정의했고 `this`가 참조여야 한다 |
| 값 타입 자신이 정의한 메서드 | 아니오 | 관리 포인터로 직접 호출한다 |
| 인터페이스 참조를 통한 호출 | 캐스트 시점에 이미 박싱됨 | 위 2번 |

첫 행이 중요하다. 박싱되지 않은 값 타입에는 타입 객체 포인터가 없으므로, 원칙적으로 가상 메서드를 부르려면 타입을 찾아야 한다. 그런데 JIT은 그 값 타입이 `ToString`을 재정의했다는 것을 보고, **박싱 없이 직접(비가상으로) 호출하는 코드**를 방출한다. 값 타입은 암묵적으로 봉인되어 있어 다형성이 개입할 여지가 없으므로 안전한 최적화다. IL 수준에서는 `constrained.` 접두사가 이 결정을 표현하며(56.3절), JIT이 그 접두사를 보고 박싱 여부를 결정한다.

```csharp
internal struct Point : IComparable
{
    private readonly int m_x, m_y;

    public Point(int x, int y) { m_x = x; m_y = y; }

    // System.ValueType에서 물려받은 ToString을 재정의한다
    public override string ToString()
        // ToString을 호출하는 것이 박싱을 막는다
        => string.Format("({0}, {1})", m_x.ToString(), m_y.ToString());

    // 타입 안전한 CompareTo
    public int CompareTo(Point other)
        => Math.Sign(Math.Sqrt(m_x * m_x + m_y * m_y)
                   - Math.Sqrt(other.m_x * other.m_x + other.m_y * other.m_y));

    // IComparable의 CompareTo 구현
    public int CompareTo(object o)
    {
        if (GetType() != o.GetType())
            throw new ArgumentException("o is not a Point");
        return CompareTo((Point) o);      // 타입 안전한 쪽으로 위임한다
    }
}
```

이 타입으로 여섯 가지 경우를 한 번에 확인할 수 있다.

```csharp
Point p1 = new Point(10, 10);
Point p2 = new Point(20, 20);

Console.WriteLine(p1.ToString());   // 박싱 없음 — 재정의된 가상 메서드
Console.WriteLine(p1.GetType());    // 박싱 발생 — Object의 비가상 메서드
Console.WriteLine(p1.CompareTo(p2));// 박싱 없음 — CompareTo(Point) 오버로드

IComparable c = p1;                 // 박싱 발생 — 인터페이스 캐스트
Console.WriteLine(c.GetType());     // 박싱 없음 — c는 이미 박싱된 Point다

Console.WriteLine(p1.CompareTo(c)); // p1 박싱 없음, c도 이미 박스라 추가 박싱 없음
Console.WriteLine(c.CompareTo(p2)); // p2 박싱 발생 — CompareTo(object)를 부르므로

p2 = (Point) c;                     // 언박싱 + 필드 복사
Console.WriteLine(p2.ToString());   // (10, 10) — 복사되었다는 증거
```

각 줄이 왜 그런지 짚어 보자.

- **`p1.ToString()`** — `Point`가 `ToString`을 재정의했으므로 JIT이 직접 호출한다. 박싱 없음.
- **`p1.GetType()`** — `GetType`은 `Object`에서 물려받은 비가상 메서드다. 호출하려면 타입 객체를 가리키는 포인터가 있어야 하고, 그것은 `p1`을 박싱해야만 얻을 수 있다.
- **첫 번째 `CompareTo`** — `Point`가 직접 구현한 메서드다. 인수가 `Point` 변수이므로 `CompareTo(Point)` 오버로드가 선택되고, 값으로 전달되므로 박싱이 없다.
- **`IComparable c = p1;`** — 인터페이스는 정의상 참조 타입이므로 `p1`이 박싱되고 그 참조가 `c`에 저장된다.
- **두 번째 `CompareTo`** — 인수가 `IComparable` 변수이므로 `CompareTo(object)` 오버로드가 선택된다. 넘길 인수는 힙 객체를 가리키는 포인터여야 하는데, `c`가 이미 박싱된 `Point`를 가리키므로 그 주소를 그대로 넘기면 된다.
- **세 번째 `CompareTo`** — `c`가 `IComparable` 타입이므로 부를 수 있는 것은 `object`를 받는 인터페이스 메서드뿐이다. 그래서 `p2`가 박싱된다.
- **`(Point) c`** — `c`가 참조하는 힙 객체가 언박싱되고, 그 필드가 스택의 `p2`로 복사된다.

> **⚠️ 박싱된 값 타입은 수정할 수 없다 — 수정한 줄 알게 될 뿐이다**
>
> ```csharp
> internal struct Point
> {
>     private int m_x, m_y;
>     public Point(int x, int y) { m_x = x; m_y = y; }
>     public void Change(int x, int y) { m_x = x; m_y = y; }
>     public override string ToString() => $"({m_x}, {m_y})";
> }
>
> Point p = new Point(1, 1);
> Console.WriteLine(p);              // (1, 1)
> p.Change(2, 2);
> Console.WriteLine(p);              // (2, 2)
>
> object o = p;                      // 박싱
> Console.WriteLine(o);              // (2, 2)
>
> ((Point) o).Change(3, 3);
> Console.WriteLine(o);              // (2, 2) — 많은 개발자가 예상하지 못하는 결과
> ```
>
> 마지막 줄이 핵심이다. `o`를 `Point`로 캐스팅하면 **언박싱된 뒤 필드가 스레드 스택의 임시 `Point`로 복사된다.** `Change`는 그 임시 복사본을 고칠 뿐, 힙의 박스는 손대지 않는다. C# 컴파일러가 `unbox` 대신 `unbox.any`(= `unbox` + `ldobj`)를 내기 때문에 벌어지는 일이며, 이것이 앞에서 말한 "C#이 봉인한 능력"의 결과다.

박싱된 값을 정말 수정하려면 인터페이스를 거쳐야 한다. 이것은 할 수 있다는 시연이지 권장이 아니다.

```csharp
internal interface IChangeBoxedPoint
{
    void Change(int x, int y);
}

internal struct Point : IChangeBoxedPoint
{
    private int m_x, m_y;
    public Point(int x, int y) { m_x = x; m_y = y; }
    public void Change(int x, int y) { m_x = x; m_y = y; }
    public override string ToString() => $"({m_x}, {m_y})";
}
```

```csharp
Point p = new Point(1, 1);
object o = p;                             // 박싱. o는 (1, 1)

((IChangeBoxedPoint) p).Change(4, 4);     // p를 박싱하고, 그 박스를 고치고, 버린다
Console.WriteLine(p);                     // (1, 1) — p는 그대로다

((IChangeBoxedPoint) o).Change(5, 5);     // o는 이미 박스다. 그 박스를 직접 고친다
Console.WriteLine(o);                     // (5, 5) — 힙의 박스가 바뀌었다
```

두 줄이 정반대로 동작한다. 첫 줄은 박싱되지 않은 `p`를 인터페이스로 캐스팅하므로 **새 박스가 만들어지고**, `Change`는 그 임시 박스를 고친 뒤 즉시 수집 대상이 된다. 둘째 줄의 `o`는 이미 박스이므로 추가 박싱 없이 그 박스가 직접 수정된다.

> **💡 이 예제가 증명하는 것은 "값 타입을 불변으로 만들라"다**
>
> 위에서 본 이상한 동작은 **전부 값 타입의 인스턴스 필드를 수정하는 메서드를 호출할 때** 발생한다. 값 타입을 생성한 뒤 상태를 바꾸는 메서드를 부르지 않으면, 박싱·언박싱·필드 복사가 아무리 일어나도 헷갈릴 일이 없다. 같은 상태가 이리저리 복사될 뿐이기 때문이다.
>
> 그래서 값 타입은 불변으로 설계한다. 필드를 `readonly`로 두면 컴파일러가 상태를 바꾸는 메서드를 실수로 작성했을 때 오류를 낸다. BCL의 핵심 값 타입 — `Byte`, `Int32`, `UInt32`, `Int64`, `UInt64`, `Single`, `Double`, `Decimal`, `BigInteger`, `Complex`, 모든 열거형 — 은 전부 불변이므로 이런 놀라움이 없다. 불변 값 타입 설계는 16.5절과 19장에서 다룬다.

---

## 15.3 정적 타입 검사와 런타임 타입 검사

### 두 번의 검사

C# 프로그램은 **두 번** 타입 검사를 받는다. 컴파일 타임에 컴파일러가 하는 정적 타입 검사(static type checking)와, 실행 중에 CLR이 하는 런타임 타입 검사(runtime type checking)다.

정적 타입 검사는 프로그램을 실행하지 않고도 정확성을 검증하게 해 준다. 다음 코드는 컴파일러가 정적 타이핑을 강제하므로 실패한다.

```csharp
int x = "5";        // 컴파일 오류 CS0029
```

런타임 타입 검사는 **참조 변환을 통한 다운캐스트**나 **언박싱**을 할 때 CLR이 수행한다.

```csharp
object y = "5";
int z = (int) y;    // 런타임 오류 — 다운캐스트 실패
```

두 줄 다 컴파일된다. `y`의 정적 타입이 `object`이므로 컴파일러는 "언젠가 박싱된 `int`가 들어 있을 수도 있다"고 판단하기 때문이다. 실행하면 CLR이 `y`가 참조하는 객체가 박싱된 `int`가 아니라 `String`임을 발견하고 `InvalidCastException`을 던진다.

런타임 타입 검사가 가능한 이유는 **힙의 모든 객체가 내부적으로 작은 타입 토큰을 저장하기 때문**이다. 앞 절에서 본 "타입 객체 포인터"가 그것이다. 이 토큰은 `object`의 `GetType` 메서드로 꺼낼 수 있다(15.4절).

> **📌 타입 안전성은 CLR의 핵심 기능이다**
>
> 런타임에 CLR은 객체가 어떤 타입인지 항상 안다. `GetType`이 비가상인 이유도 여기에 있다 — 어떤 타입도 `GetType`을 재정의해서 자기 타입을 속일 수 없다. `Employee` 타입이 `GetType`을 재정의해 `SuperHero`를 반환하게 만드는 것은 불가능하다.
>
> 만약 CLR이 검사 없이 캐스트를 허용한다면 타입 안전성이 사라지고, 결과는 예측 불가능해진다. 애플리케이션 크래시부터 타입 스푸핑에 의한 보안 침해까지 가능해진다. 타입 스푸핑은 실제로 수많은 보안 사고의 원인이었고, 그래서 CLR은 이 검사를 포기하지 않는다.

### 검사 도구 네 가지 — `is` / `as` / `typeof` / `GetType()`

타입을 다루는 네 가지 도구는 각각 묻는 질문이 다르다.

| 도구 | 형태 | 평가 시점 | 묻는 질문 | 실패 시 | 값 타입 |
|---|---|---|---|---|---|
| `is` | `x is T` | 런타임 | 이 **값**이 `T` 패턴에 맞는가 | `false` | 언박싱 변환 성공 시 `true` |
| `as` | `x as T` | 런타임 | 이 **값**을 `T`로 참조 변환할 수 있는가 | `null` | `T`가 널 가능이어야 함 |
| 캐스트 | `(T) x` | 런타임 | 이 **값**을 `T`로 변환하라 | 예외 | 언박싱 수행 |
| `typeof` | `typeof(T)` | 컴파일 타임 | **타입 이름** `T`의 `Type` 객체를 달라 | — | 인스턴스 불필요 |
| `GetType()` | `x.GetType()` | 런타임 | 이 **인스턴스**의 실제 타입을 달라 | `NullReferenceException` | 호출 시 박싱 |

앞 세 개는 **값**을 대상으로 하고, `typeof`는 **타입 이름**을 대상으로 하며, `GetType()`은 **인스턴스**를 대상으로 한다. 이 구분이 표의 전부다. `is`와 `as`, 캐스트를 참조 타입에 쓸 때의 규칙은 14.7절에서 다뤘으므로, 여기서는 값 타입과 박싱이 개입할 때 달라지는 점만 본다.

### `is`와 값 타입

`is`는 참조 변환이 성공할지를 검사하지만, **언박싱 변환이 성공할 경우에도 `true`가 된다.**

```csharp
object o = 42;

Console.WriteLine(o is int);      // True  — 박싱된 int다
Console.WriteLine(o is long);     // False — 언박싱은 정확한 타입만
Console.WriteLine(o is object);   // True
Console.WriteLine(o is string);   // False
```

`o is long`이 `False`인 것이 중요하다. `is`는 사용자 정의 변환도, 숫자 변환도 고려하지 않는다. `int`를 `long`으로 바꾸는 것은 숫자 변환이므로 `is`의 관심 밖이다. 언박싱 규칙(15.2절)과 정확히 같은 엄격함이다.

참조가 `null`이면 `is`는 항상 `false`를 반환한다. 검사할 객체 자체가 없기 때문이다.

```csharp
object o = null;
Console.WriteLine(o is object);   // False
```

### 컴파일 결과 — `isinst`와 이중 검사

`is`로 검사한 뒤 캐스트하는 고전적인 패턴은 검사를 두 번 한다.

```csharp
if (o is Employee)
{
    Employee e = (Employee) o;
    // ...
}
```

CLR은 여기서 타입을 두 번 확인한다. `is` 연산자가 한 번, `if` 안의 캐스트가 한 번이다. CLR은 객체의 실제 타입을 알아낸 뒤 상속 계층을 거슬러 올라가며 각 기반 타입을 지정된 타입과 대조해야 하므로, 이 검사는 공짜가 아니다.

C#은 두 가지 해법을 준다. 참조 타입이면 `as`가 있다.

```csharp
Employee e = o as Employee;
if (e != null)
{
    // ...
}
```

`as`는 타입 검사를 한 번만 하게 만든다. `if` 문은 `e`가 `null`인지만 보고, 이 검사는 타입 검증보다 훨씬 빠르다.

그리고 더 나은 해법이 패턴 변수다 ※C# 7.

```csharp
if (o is Employee e)
{
    // e를 여기서 바로 쓴다
}
```

이것은 다음과 동등하며, 검사가 한 번만 일어난다.

```csharp
Employee e;
if (o is Employee)
{
    e = (Employee) o;
    // ...
}
```

값 타입에도 그대로 통한다.

```csharp
object o = 42;

if (o is int n)                   // 검사 + 언박싱이 한 번에
    Console.WriteLine(n * 2);     // 84
```

IL은 대략 이런 모양이 된다(컴파일러 버전과 최적화 설정에 따라 세부는 달라진다).

```il
  ldloc.0                                        // o
  isinst     [System.Runtime]System.Int32        // 박싱된 int인가?
  dup
  stloc.1                                        // 임시 저장
  brfalse.s  IL_0017                             // null이면 건너뛴다
  ldloc.1
  unbox.any  [System.Runtime]System.Int32        // 언박싱 + 복사
  stloc.2                                        // n
  // ...
IL_0017:
```

`isinst`가 타입 검사를 하고, 성공했을 때만 `unbox.any`가 값을 꺼낸다. 검사는 한 번이다.

> **⚠️ `as`는 값 타입에 그냥 쓸 수 없다**
>
> ```csharp
> object o = 42;
> // int n = o as int;         // 컴파일 오류 CS0077
> int? n = o as int?;          // OK — 널 가능 값 타입이면 된다
> ```
>
> `as`는 실패했을 때 `null`을 반환해야 하는데, `int`에는 `null`이 없다. 그래서 `as`의 대상 타입은 참조 타입이거나 널 가능 값 타입이어야 한다. `as int?`는 동작하지만 `Nullable<int>` 구조체를 만드는 비용이 붙으므로, 값 타입에는 `is int n` 패턴이 거의 항상 더 낫다.
>
> 또 `as`는 숫자 변환도 사용자 정의 변환도 하지 않는다. `long x = 3 as long;`은 컴파일 오류다.

> **💡 `is` 패턴과 `switch` 식으로 다시 쓰기**
>
> 타입에 따라 분기하는 코드는 `switch` 식으로 옮기면 검사가 한 번씩만 일어나고, 컴파일러가 완전성까지 봐 준다.
>
> ```csharp
> static string Describe(object o) => o switch
> {
>     int n when n < 0 => $"음의 정수 {n}",
>     int n            => $"정수 {n}",
>     double d         => $"실수 {d}",
>     string s         => $"문자열 길이 {s.Length}",
>     null             => "널",
>     _                => $"기타 {o.GetType().Name}"
> };
> ```
>
> 여기서 `int n`, `double d`는 전부 언박싱을 포함한 패턴이다. 패턴 매칭 전반은 77장에서, 패턴이 컴파일되는 형태와 분기 성능은 77.15절에서 다룬다.

### 캐스트 연산자와 변환 연산자는 다른 것이다

C#은 타입이 변환 연산자 메서드를 정의하도록 허용한다(22.4절). 이 메서드들은 **캐스트 식을 쓸 때만 호출되며, `as`나 `is` 연산자에서는 절대 호출되지 않는다.**

```csharp
struct Celsius
{
    public double Value;
    public static explicit operator double(Celsius c) => c.Value;
}

object o = new Celsius { Value = 36.5 };

// double d1 = (double) o;      // InvalidCastException — 언박싱이지 변환이 아니다
double d2 = (double)(Celsius) o; // OK — Celsius로 언박싱한 뒤 변환 연산자 호출
```

첫 줄이 실패하는 이유는, `o`의 정적 타입이 `object`이므로 컴파일러가 `Celsius`의 변환 연산자를 찾지 못하고 이 캐스트를 **언박싱**으로 컴파일하기 때문이다. 런타임에는 "이 객체가 박싱된 `double`인가?"를 묻고, 아니므로 예외다. 정적 타입이 무엇인지가 캐스트의 의미 자체를 바꾸는 예다.

> **⚠️ `object`를 거치면 컴파일러의 안전망이 사라진다**
>
> 14.7절에서 참조 타입에 대해 본 것과 같은 함정이 값 타입에도 있다. 정적 타입이 `object`인 순간 컴파일러는 거의 모든 캐스트를 통과시키고, 검증은 전부 런타임으로 미뤄진다.
>
> | 코드 | 결과 |
> |---|---|
> | `int x = (int)(object) 5;` | OK |
> | `long x = (long)(object) 5;` | `InvalidCastException` |
> | `int x = (int)(object) 5L;` | `InvalidCastException` |
> | `int x = (int)(object) "5";` | `InvalidCastException` |
> | `int? x = (int?)(object) null;` | OK — `null` |
> | `int x = (int)(object) null;` | `NullReferenceException` |
>
> 이 표의 여섯 줄이 전부 컴파일된다. 그래서 `object`를 다루는 코드에서는 캐스트 대신 `is` 패턴을 쓰는 것이 사실상의 규칙이다.

### 자가 진단 — 컴파일 오류인가, 런타임 오류인가

다음 두 타입이 있다고 하자.

```csharp
internal class B { }            // 기반 클래스
internal class D : B { }        // 파생 클래스
```

각 줄이 정상 실행(OK)인지, 컴파일 타임 오류(CTE)인지, 런타임 오류(RTE)인지 먼저 예측한 뒤 확인하라. 이 절의 내용을 이해했는지 검증하는 가장 빠른 방법이다.

```csharp
object o1 = new object();       // OK
object o2 = new B();            // OK  — 업캐스트는 암시적
object o3 = new D();            // OK
object o4 = o3;                 // OK

B b1 = new B();                 // OK
B b2 = new D();                 // OK  — D는 B다
D d1 = new D();                 // OK

B b3 = new object();            // CTE — object는 B가 아니다. 캐스트가 필요하다
D d2 = new object();            // CTE — 같은 이유

B b4 = d1;                      // OK  — 업캐스트
D d3 = b2;                      // CTE — 다운캐스트에는 명시적 캐스트가 필요하다

D d4 = (D) d1;                  // OK  — 불필요하지만 합법
D d5 = (D) b2;                  // OK  — b2는 실제로 D를 가리킨다
D d6 = (D) b1;                  // RTE — b1은 진짜 B다. InvalidCastException

B b5 = (B) o1;                  // RTE — o1은 진짜 object다. InvalidCastException
B b6 = (D) b2;                  // OK  — D로 다운캐스트한 뒤 B로 업캐스트
```

핵심은 **컴파일러는 정적 타입만 보고 "가능성"을 판단하고, CLR은 런타임 타입을 보고 "사실"을 판단한다**는 것이다. `D d3 = b2;`가 컴파일 오류인 이유는 `b2`의 정적 타입이 `B`라서 파생 타입이 아닐 **수도** 있기 때문이고, `D d6 = (D) b1;`이 컴파일되는 이유는 정적 타입 `B`가 `D`를 담을 수도 있기 때문이다. 실제로는 담고 있지 않아서 런타임에 터진다.

이제 값 타입을 섞으면 규칙이 하나 더 붙는다 — **정확히 그 타입일 때만 통과한다.**

```csharp
object o = 42;

int    i1 = (int) o;            // OK
long   l1 = (long) o;           // RTE — 박싱된 int는 long이 아니다
long   l2 = (int) o;            // OK  — 언박싱 후 숫자 변환
double d1 = (double) o;         // RTE
object n  = null;
int    i2 = (int) n;            // RTE — NullReferenceException
int?   i3 = (int?) n;           // OK  — null
```

일곱 번째 줄만 `NullReferenceException`이고 나머지 실패는 `InvalidCastException`이라는 점을 다시 확인하라(15.2절).

---

## 15.4 `GetType()` 메서드와 `typeof` 연산자

### 문법 — 타입 객체를 얻는 두 가지 길

C#의 모든 타입은 런타임에 `System.Type`의 인스턴스로 표현된다. `Type` 객체를 얻는 기본적인 방법은 둘이다.

- 인스턴스에 대해 `GetType`을 호출한다
- 타입 이름에 대해 `typeof` 연산자를 쓴다

```csharp
Point p = new Point();

Console.WriteLine(p.GetType().Name);            // Point
Console.WriteLine(typeof(Point).Name);          // Point
Console.WriteLine(p.GetType() == typeof(Point));// True
Console.WriteLine(p.X.GetType().Name);          // Int32
Console.WriteLine(p.Y.GetType().FullName);      // System.Int32

public class Point { public int X, Y; }
```

`System.Type`은 타입의 이름, 어셈블리, 기반 타입 같은 것들에 대한 프로퍼티를 갖는다. 또 런타임의 리플렉션 모델로 들어가는 관문 역할을 하는 메서드들을 갖는다(57장).

### 결정적 차이 — 언제 평가되는가

| | `typeof(T)` | `x.GetType()` |
|---|---|---|
| 피연산자 | 타입 **이름** | 객체 **인스턴스** |
| 평가 시점 | 컴파일 타임(제네릭 타입 매개변수가 개입하면 JIT이 해석) | 런타임 |
| 인스턴스 필요 | 아니오 | 예 |
| `null`일 때 | 해당 없음 | `NullReferenceException` |
| 정적 타입 vs 런타임 타입 | 정적 타입 그대로 | **런타임 타입** |
| 값 타입에 쓸 때 | 박싱 없음 | **박싱 발생** |
| 추상 타입·인터페이스 | 가능 | 인스턴스가 실제 구현 타입을 준다 |
| 언바운드 제네릭 | `typeof(List<>)` 가능 | 불가능 |

두 번째 행과 다섯 번째 행이 실무에서 갈리는 지점이다.

```csharp
Asset a = new Stock();

Console.WriteLine(typeof(Asset).Name);   // Asset — 정적 타입 이름 그대로
Console.WriteLine(a.GetType().Name);     // Stock — 실제로 만들어진 객체의 타입
```

`typeof`는 소스에 적힌 타입 이름을 그대로 쓰고, `GetType()`은 그 순간 변수가 가리키는 객체의 실제 타입을 묻는다. 14장의 용어로 말하면 `typeof`는 정적 타입, `GetType()`은 런타임 타입이다.

### 컴파일 결과 — `ldtoken` vs `callvirt`

`typeof`는 메서드 호출이 아니다. IL에서는 메타데이터 토큰을 실어 나르는 명령 하나와 그것을 `Type`으로 바꾸는 정적 메서드 호출로 컴파일된다.

```csharp
Type t = typeof(int);
```

```il
ldtoken    [System.Runtime]System.Int32
call       class [System.Runtime]System.Type
           [System.Runtime]System.Type::GetTypeFromHandle(
               valuetype [System.Runtime]System.RuntimeTypeHandle)
stloc.0
```

`ldtoken`은 컴파일 타임에 결정된 메타데이터 토큰을 밀어 넣는 명령이다. 타입 이름은 이미 IL 안에 박제되어 있고, 런타임은 그 토큰을 `Type` 객체로 바꿔 주기만 한다.

`GetType()`은 진짜 메서드 호출이다.

```csharp
Type t = o.GetType();
```

```il
ldloc.0
callvirt   instance class [System.Runtime]System.Type
           [System.Runtime]System.Object::GetType()
stloc.1
```

`GetType`은 비가상 메서드인데도 `callvirt`가 쓰인 것에 주목하라. C# 컴파일러가 인스턴스 메서드 호출에 일관되게 `callvirt`를 내는 이유는 널 참조에서 반드시 예외가 나게 하기 위해서다(14.9절).

값 타입에 `GetType()`을 부르면 `box`가 먼저 나온다.

```csharp
int i = 42;
Type t = i.GetType();
```

```il
ldloc.0
box        [System.Runtime]System.Int32       // ← 박싱
callvirt   instance class [System.Runtime]System.Type
           [System.Runtime]System.Object::GetType()
stloc.1
```

같은 정보를 `typeof(int)`로 얻으면 박싱이 없다. **타입을 알고 있다면 `typeof`를 쓰는 것이 항상 싸다.**

### `GetType`은 왜 재정의할 수 없는가

`System.Object`의 `GetType` 선언은 이렇다.

```csharp
public extern Type GetType();
```

`virtual`이 없다. 흔히 "`GetType`은 봉인되어 있다"고 말하지만 정확한 서술은 **애초에 가상이 아니다**는 것이다. `sealed` 한정자는 가상 멤버의 재정의 체인을 끊는 도구이므로(14.5절), 처음부터 가상이 아닌 멤버에는 붙일 수 없고 붙일 필요도 없다. 결과는 같다 — 어떤 파생 타입도 `GetType`을 재정의할 수 없다.

이유는 **타입 안전성**이다. 만약 `GetType`이 가상이었다면 악의적인(혹은 그저 부주의한) 타입이 자기 타입을 속일 수 있다.

```csharp
// 이런 코드는 존재할 수 없다 — 컴파일 오류다
public class Employee
{
    // public override Type GetType() => typeof(SuperHero);   // CS0239
}
```

CLR의 캐스트 검사, 리플렉션, 직렬화, 보안 검사가 전부 "이 객체의 진짜 타입"이라는 개념 위에 서 있다. 그 개념이 재정의 가능해지는 순간 전부 무너진다. 그래서 `GetType`은 `extern`으로 선언되어 런타임이 직접 구현하며, 객체가 자기 표현 안에 들고 있는 **메서드 테이블 포인터**(타입 객체 포인터)를 그대로 읽어 반환한다. 이 필드는 객체 참조가 정확히 가리키는 지점(오프셋 0)에 있으며, 락과 해시 코드를 담는 **객체 헤더(싱크 블록 인덱스)** 는 그와 별개로 참조 기준 음수 오프셋에 있는 다른 필드다. 둘을 뭉뚱그리면 안 된다 — 자세한 배치는 54.2절이다.

> **⚠️ `GetType()`이 `typeof`와 다를 수 있는 정당한 경우들**
>
> "인스턴스의 타입이 그 변수의 타입"이라고 가정하는 코드는 다음 상황에서 깨진다.
>
> | 상황 | `GetType()`이 반환하는 것 |
> |---|---|
> | 파생 클래스 인스턴스를 기반 타입 변수에 담음 | 파생 클래스 |
> | 동적 프록시 (ORM, 목(mock), AOP 프레임워크) | 런타임이 생성한 프록시 서브클래스 |
> | 박싱된 `int?` | `System.Int32` — `Nullable<Int32>`가 아니다 |
> | 배열 요소를 `object`로 꺼냄 | 요소의 실제 타입 |
> | `Type` 자체에 `GetType()` 호출 | `System.RuntimeType` — `System.Type`이 아니다 |
>
> 세 번째와 다섯 번째가 특히 자주 사람을 놀라게 한다.
>
> ```csharp
> int? n = 42;
> object o = n;                          // Nullable<int>의 박싱
> Console.WriteLine(o.GetType());        // System.Int32
> Console.WriteLine(typeof(int?));       // System.Nullable`1[System.Int32]
> ```
>
> CLR은 `Nullable<T>`를 박싱할 때 값이 있으면 **밑바탕 타입 `T`의 박스**를 만들고, 없으면 `null` 참조를 만든다. 그래서 박싱된 널 가능 값 타입이라는 것은 힙에 존재하지 않는다. 이 특별 지원은 21.3절에서 다룬다.

### 값 타입에서 `GetType()`을 부르는 비용

앞에서 본 대로 `p1.GetType()`은 박싱을 유발한다. 이것이 `Equals` 구현에서 실제 문제가 되는 자리다.

```csharp
public int CompareTo(object o)
{
    if (GetType() != o.GetType())     // GetType()이 this를 박싱한다
        throw new ArgumentException("o is not a Point");
    return CompareTo((Point) o);
}
```

이 코드는 정확하지만, `this`가 값 타입이라면 검사 한 번에 힙 객체가 하나 생긴다. 값 타입에서는 `is` 패턴을 쓰는 편이 낫다.

```csharp
public int CompareTo(object o)
    => o is Point other
        ? CompareTo(other)
        : throw new ArgumentException("o is not a Point", nameof(o));
```

`is Point other`는 `o`에 대한 타입 검사만 하고 `this`를 건드리지 않는다. 이렇게 쓰면 박싱 하나가 사라진다.

> **💡 `typeof`를 정적 필드에 캐시할 필요는 없다**
>
> `typeof(Foo)`는 `ldtoken` + `GetTypeFromHandle` 두 명령이고, 런타임은 타입당 `Type` 객체를 하나만 유지한다. 그래서 반복 호출해도 새 객체가 만들어지지 않으며, JIT은 이 패턴을 잘 최적화한다. 반면 `GetType()`은 호출이고, 값 타입이면 박싱까지 붙는다.
>
> 정리하면 이렇다. **타입 이름을 소스에 적을 수 있으면 `typeof`, 실행 중에 결정되는 객체의 정체를 물어야 할 때만 `GetType()`.** 제네릭 코드에서는 `typeof(T)`가 두 세계를 잇는다 — 소스에 적혀 있지만 값은 JIT 시점에 정해진다. 언바운드 제네릭 타입(`typeof(List<>)`)은 23.4절, `Type` 객체로 할 수 있는 일 전부는 57장에 있다.

---

## 15.5 `ToString()` 재정의 규칙

### 문법 — 기본 동작과 재정의

`ToString` 메서드는 타입 인스턴스의 기본 텍스트 표현을 반환한다. 내장 타입은 전부 이 메서드를 재정의한다.

```csharp
int x = 1;
string s = x.ToString();      // s는 "1"
```

사용자 정의 타입에서는 이렇게 재정의한다.

```csharp
Panda p = new Panda { Name = "Petey" };
Console.WriteLine(p);          // Petey

public class Panda
{
    public string Name;
    public override string ToString() => Name;
}
```

`ToString`은 `virtual`이므로 `override` 키워드가 필요하다. 재정의하지 않으면 기본 구현이 **타입의 전체 이름**을 반환한다 — 즉 `this.GetType().FullName`이다.

```csharp
public class Panda { public string Name; }

Console.WriteLine(new Panda());     // Panda 혹은 MyNamespace.Panda
```

네임스페이스 안에 있으면 네임스페이스까지 포함된 이름이 나온다. 이것이 디버깅 중 `{MyApp.Models.Order}` 같은 출력을 보게 되는 이유다.

### 컴파일 결과 — 값 타입에서 박싱이 갈리는 지점

15.2절에서 본 규칙이 `ToString`에서 가장 자주 문제가 된다. **재정의된 `object` 멤버를 값 타입에서 직접 호출하면 박싱이 일어나지 않는다.** 박싱은 캐스팅했을 때만 일어난다.

```csharp
int    x  = 1;
string s1 = x.ToString();       // 박싱되지 않은 값에 대한 호출 — 박싱 없음
object box = x;                 // 여기서 박싱
string s2 = box.ToString();     // 박싱된 값에 대한 호출 — 추가 박싱 없음
```

`x.ToString()`이 박싱하지 않는 이유는 `Int32`가 `ToString`을 재정의했고, JIT이 그 사실을 알아 정확한 구현을 비가상으로 직접 호출하기 때문이다. 값 타입은 암묵적으로 봉인되어 있어 다형성이 개입할 수 없으므로 안전하다.

반대로 재정의하지 **않은** 구조체는 사정이 다르다.

```csharp
struct NoOverride { public int A, B; }

NoOverride n = default;
string s = n.ToString();        // 박싱 발생 — ValueType.ToString()을 불러야 한다
```

컴파일러는 `constrained. NoOverride` 접두사를 붙여 호출하고, 런타임은 그 타입이 `ToString`을 직접 구현하지 않았음을 확인한 뒤 값을 박싱해서 `ValueType.ToString()`을 호출한다. 결과 문자열은 타입 이름뿐이고, 대가로 힙 객체가 하나 생긴다.

> **⚠️ 재정의 안에서 `base.ToString()`을 부르면 박싱된다**
>
> ```csharp
> struct Point
> {
>     private readonly int m_x, m_y;
>     public override string ToString()
>         => base.ToString() + $" ({m_x}, {m_y})";   // ← base 호출이 this를 박싱한다
> }
> ```
>
> 값 타입이 재정의한 가상 메서드는 박싱 없이 호출되지만, **그 재정의 안에서 기반 타입의 구현을 호출하면 값 타입 인스턴스는 박싱된다.** 기반 메서드의 `this` 인수로 힙 객체에 대한 참조를 넘겨야 하기 때문이다. `ValueType.ToString()`이 돌려주는 것은 타입 이름뿐이므로, 이 `base` 호출은 아무 가치도 없이 할당만 만든다. 값 타입의 `ToString` 재정의에서 `base.ToString()`을 부를 이유는 사실상 없다.

문자열 조합에서도 같은 함정이 있다.

```csharp
// 문제: m_x와 m_y가 각각 박싱된다 (object를 받는 Format 오버로드)
public override string ToString() => string.Format("({0}, {1})", m_x, m_y);

// 해결: 각 필드에서 ToString을 먼저 호출해 string으로 만든다
public override string ToString()
    => string.Format("({0}, {1})", m_x.ToString(), m_y.ToString());
```

문자열 보간(`$"..."`)은 ※C# 10 이후 보간 문자열 핸들러로 컴파일되며, 핸들러의 `AppendFormatted<T>`가 제네릭이라 값 타입을 박싱하지 않는다(35.7절). 즉 오래된 `string.Format` 대신 보간을 쓰는 것만으로 이 함정 하나가 사라진다. 다만 대상 프레임워크가 낮으면 `string.Format` 경로로 폴백될 수 있으므로, 성능이 중요한 자리에서는 IL을 확인하는 것이 맞다.

### 런타임 동작 — 누가 `ToString`을 부르는가

`ToString`은 개발자가 직접 부르는 것보다 프레임워크가 대신 부르는 경우가 훨씬 많다.

| 호출자 | 상황 |
|---|---|
| `Console.Write` / `WriteLine(object)` | `object` 오버로드가 선택될 때 |
| `String.Concat`, `+` 연산자 | 문자열과 다른 타입을 결합할 때 |
| 보간 문자열 | `$"{value}"` |
| `String.Format`, `StringBuilder.AppendFormat` | 형식 항목을 채울 때 |
| Visual Studio 디버거 | 변수 창에 객체를 표시할 때 |
| 로깅 프레임워크 | 구조화되지 않은 메시지를 만들 때 |
| `Dictionary`, `List`의 디버거 뷰 | 키/값을 표시할 때 |

디버거가 자동으로 부른다는 점이 실용적으로 중요하다. `ToString`을 잘 재정의해 두면 디버깅 중 객체의 상태를 한눈에 볼 수 있다. 다만 디버거 표시만이 목적이라면 `ToString`을 바꾸는 대신 `[DebuggerDisplay]` 특성을 쓰는 편이 낫다 — 프로덕션 동작에 영향을 주지 않기 때문이다(74.2절).

> **⚠️ `ToString`에서 예외를 던지지 마라**
>
> `ToString`은 로깅, 디버깅, 예외 메시지 조합처럼 **이미 무언가 잘못된 상황**에서 호출되는 경우가 많다. 여기서 예외가 나면 원래 문제를 진단할 수 없게 되고, 디버거의 변수 창이 통째로 깨지며, `catch` 블록 안에서 던져진 예외가 원래 예외를 삼킬 수도 있다.
>
> 같은 이유로 `ToString`은 `null`을 반환하지 않아야 한다. `Console.WriteLine`은 견디지만, 문자열 연결·정렬·해시 키 조합처럼 반환값을 곧바로 쓰는 코드는 `NullReferenceException`을 만난다. 반환할 것이 없으면 빈 문자열이나 `"(none)"` 같은 자리표시자를 돌려주는 편이 안전하다.

> **📌 `ToString`은 문화권을 인식할 것으로 기대된다**
>
> `ToString`은 호출 스레드에 연결된 `CultureInfo`를 인식해야 한다는 것이 프레임워크의 기대다. `1234.5.ToString()`이 한국어 환경에서는 `"1234.5"`, 독일어 환경에서는 `"1234,5"`를 내는 것이 그 결과다.
>
> 그래서 **`ToString()`의 출력을 파싱하거나, 파일·네트워크·데이터베이스에 저장하거나, 동등성 비교의 근거로 쓰면 안 된다.** 기계가 읽을 문자열이 필요하면 `ToString(CultureInfo.InvariantCulture)`처럼 문화권을 못 박아야 한다. 형식 지정과 문화권 처리 전반은 38장, 불변 문화권을 써야 할 자리는 38.11절에 있다.

### 세 가지 `ToString`을 구분하라

`ToString`이라는 이름의 메서드는 사실 세 종류가 섞여 있다.

| 시그니처 | 출처 | 용도 |
|---|---|---|
| `string ToString()` | `Object`의 가상 메서드 | 사람이 읽을 기본 표현 |
| `string ToString(string? format)` | 타입이 직접 정의 | 형식 문자열 적용 |
| `string ToString(string? format, IFormatProvider? provider)` | `IFormattable` 인터페이스 | 형식 + 문화권 지정 |

`IFormattable`을 구현하면 보간 문자열의 `$"{value:F2}"` 같은 형식 지정자가 동작한다. 세부는 38.1절과 38.2절에 있다. 이 장에서 기억할 것은 **`object.ToString()`을 재정의하는 것과 `IFormattable`을 구현하는 것은 별개**라는 점이다.

> **💡 무엇을 `ToString`에 담을 것인가**
>
> 실무 기준은 이렇다.
>
> - **식별에 필요한 최소 정보**를 담는다. `Order` 하나에 필드가 서른 개여도 `ToString`에는 주문 번호와 상태 정도면 충분하다.
> - **비밀을 담지 마라.** 비밀번호, 토큰, 개인정보가 `ToString`에 들어가면 로그에 그대로 남는다. 이것이 실제 사고의 흔한 경로다.
> - **길이를 통제하라.** 컬렉션 전체를 펼치는 `ToString`은 로그를 폭발시킨다.
> - **비싼 계산을 하지 마라.** 디버거가 모든 중단점에서 이 메서드를 호출한다.
> - **레코드는 알아서 해 준다.** `record`는 `ToString`을 컴파일러가 생성해 준다(19장). 직접 재정의하기 전에 레코드로 충분한지 먼저 보라.

---

## 15.6 `System.Object` 멤버 전수 — `Equals`, `ReferenceEquals`, `GetHashCode`, `MemberwiseClone`

### 선언 전체

`object`가 가진 멤버는 전부 여덟 개다.

```csharp
public class Object
{
    public Object();

    public extern Type GetType();

    public virtual bool Equals(object obj);
    public static bool Equals(object objA, object objB);
    public static bool ReferenceEquals(object objA, object objB);

    public virtual int GetHashCode();
    public virtual string ToString();

    protected virtual void Finalize();
    protected extern object MemberwiseClone();
}
```

한 표로 정리하면 이렇다.

| 멤버 | 종류 | 접근성 | 재정의 가능 | 기본 동작 |
|---|---|---|---|---|
| `Object()` | 인스턴스 생성자 | public | — | 아무 일도 하지 않고 반환한다 |
| `GetType()` | 인스턴스 메서드 | public | **불가** (비가상) | 객체의 타입 객체 포인터(메서드 테이블 포인터)를 `Type`으로 반환 |
| `Equals(object)` | 인스턴스 메서드 | public | 가능 (`virtual`) | **참조 항등성** 검사 |
| `Equals(object, object)` | 정적 메서드 | public | — | `null` 처리 후 인스턴스 `Equals` 호출 |
| `ReferenceEquals(object, object)` | 정적 메서드 | public | — | 두 참조가 같은 객체인지 |
| `GetHashCode()` | 인스턴스 메서드 | public | 가능 (`virtual`) | 객체 수명 동안 변하지 않는 수 |
| `ToString()` | 인스턴스 메서드 | public | 가능 (`virtual`) | `this.GetType().FullName` |
| `Finalize()` | 인스턴스 메서드 | protected | 가능 (`virtual`) | 아무 일도 하지 않는다 |
| `MemberwiseClone()` | 인스턴스 메서드 | protected | **불가** (비가상) | 얕은 복사본을 만들어 참조를 반환 |

가상 멤버는 넷(`Equals`, `GetHashCode`, `ToString`, `Finalize`), 비가상 인스턴스 멤버는 둘(`GetType`, `MemberwiseClone`), 정적 멤버는 둘(`Equals`, `ReferenceEquals`)이다. **이 구분이 곧 박싱 규칙이다** — 값 타입에서 가상 멤버는 재정의만 되어 있으면 박싱 없이 호출되지만, 비가상 멤버는 언제나 박싱을 요구한다(15.2절).

### `Equals(object)` — 기본은 값이 아니라 정체성이다

`System.Object`가 제공하는 가상 메서드 `Equals`의 목적은 두 객체가 같은 **값**을 가질 때 `true`를 반환하는 것이다. 그런데 `Object`의 구현은 이렇게 생겼다.

```csharp
public class Object
{
    public virtual bool Equals(object obj)
    {
        // 두 참조가 같은 객체를 가리키면 값도 같을 수밖에 없다
        if (this == obj) return true;

        // 값이 같은지 알 방법이 없으므로 같지 않다고 가정한다
        return false;
    }
}
```

처음에는 합리적인 기본값으로 보인다. `this`와 `obj`가 정확히 같은 객체를 가리키면 `true`를 반환하는데, 객체는 자기 자신과 같은 값을 갖는 것이 당연하기 때문이다. 그러나 인수가 서로 다른 객체를 가리키면 `Equals`는 두 객체가 같은 값을 담고 있는지 확신할 수 없고, 그래서 `false`를 반환한다.

다시 말해 **`Object.Equals`의 기본 구현은 값 동등성이 아니라 정체성(identity)을 구현한다.** 이것은 결과적으로 좋은 기본값이 아니었다. 상속 계층에서 `Equals`를 올바르게 재정의하는 방법을 생각하기 시작하면 곧바로 문제가 드러난다. 만약 마이크로소프트가 이렇게 구현했다면 규칙이 훨씬 단순했을 것이다.

```csharp
public class Object
{
    public virtual bool Equals(object obj)
    {
        if (obj == null) return false;
        if (this.GetType() != obj.GetType()) return false;
        // 타입이 같고, Object는 필드를 정의하지 않으므로 필드도 일치한다
        return true;
    }
}
```

그러나 실제 구현이 그렇지 않기 때문에 `Equals` 재정의 규칙은 생각보다 훨씬 복잡해졌다. 그 규칙 전체 — 다섯 단계 구현 절차, 반사성·대칭성·추이성·일관성이라는 네 가지 속성, `IEquatable<T>`와 `==` 연산자를 함께 맞추는 법 — 는 25.2절과 25.3절에서 다룬다. 이 장에서 확인할 것은 **기본 구현이 무엇을 하는가**까지다.

```csharp
class Ref { public int V; }
struct Val { public int V; }

var a = new Ref { V = 1 };
var b = new Ref { V = 1 };
Console.WriteLine(a.Equals(b));           // False — 다른 객체다

var c = new Val { V = 1 };
var d = new Val { V = 1 };
Console.WriteLine(c.Equals(d));           // True  — ValueType이 재정의했다
```

두 결과가 다른 이유는 다음 항목에 있다.

### `ValueType.Equals` — 리플렉션 폴백

`System.ValueType`은 모든 값 타입의 기반 클래스이며, `Object`의 `Equals`를 재정의해 **값 동등성 검사**(정체성 검사가 아니라)를 올바르게 수행한다. 내부적으로 `ValueType`의 `Equals`는 이렇게 구현되어 있다.

1. `obj` 인수가 `null`이면 `false`를 반환한다.
2. `this`와 `obj`가 서로 다른 타입의 객체를 가리키면 `false`를 반환한다.
3. 타입이 정의한 각 인스턴스 필드에 대해, `this` 쪽 값과 `obj` 쪽 값을 그 필드의 `Equals` 메서드로 비교한다. 하나라도 같지 않으면 `false`를 반환한다.
4. `true`를 반환한다. `ValueType`의 `Equals`는 `Object`의 `Equals`를 호출하지 않는다.

문제는 3단계다. `ValueType`은 자기를 상속한 타입이 어떤 필드를 갖는지 컴파일 타임에 알 수 없으므로, **런타임 리플렉션으로 필드를 열거한다.** CLR의 리플렉션 메커니즘은 느리다(57.12절). 그래서 자기 값 타입을 정의할 때는 `Equals`를 재정의해 직접 구현하는 것이 값 동등성 비교 성능에 크게 도움이 된다. 물론 그 구현 안에서 `base.Equals`를 부르면 안 된다.

> **📌 현대 런타임은 빠른 경로를 시도한다** ※.NET Core 이후
>
> 오늘날의 런타임은 값 타입이 **비트 단위로 비교 가능한 조건**을 만족하면 — 즉 모든 필드가 원시 값 타입이고, 참조 필드가 없고, 재정의된 `Equals`를 가진 필드가 없고, 패딩 때문에 쓰레기 바이트가 낄 여지가 없으면 — 필드 열거 대신 메모리 블록 비교로 처리한다. 그 조건을 하나라도 어기면 **필드별 리플렉션 경로로 폴백한다.**
>
> 실무적으로 이것은 나쁜 소식이다. `string` 필드 하나만 추가해도, `float`/`double` 필드 하나만 있어도(부동소수점은 `+0.0`과 `-0.0`, `NaN` 때문에 비트 비교가 틀린 답을 낸다) 조건이 깨지고 조용히 느린 경로로 떨어진다. **어느 경로를 타는지가 타입 정의의 사소한 변경으로 바뀌므로, 값 타입에서는 애초에 `Equals`를 직접 재정의하는 것이 유일하게 예측 가능한 선택이다.** 구체적인 재정의 방법은 16.7절과 25.5절에 있다.

### `Equals`의 정적 오버로드

`Object`에는 인스턴스 `Equals` 외에 정적 `Equals`도 있다. 이쪽은 `null` 처리를 대신해 준다.

```csharp
public static bool Equals(object objA, object objB)
{
    if (objA == objB) return true;
    if (objA == null || objB == null) return false;
    return objA.Equals(objB);
}
```

한쪽이 `null`일 수 있는 상황에서 `objA.Equals(objB)`를 바로 부르면 `NullReferenceException`이 나지만, `object.Equals(objA, objB)`는 안전하다.

```csharp
string s = null;
// Console.WriteLine(s.Equals("x"));         // NullReferenceException
Console.WriteLine(object.Equals(s, "x"));    // False
Console.WriteLine(object.Equals(null, null));// True
```

### `ReferenceEquals` — 정체성을 묻는 유일하게 안전한 방법

타입이 `Object`의 `Equals`를 재정의할 수 있다는 것은, **`Equals`로는 더 이상 정체성을 검사할 수 없다**는 뜻이다. 이 문제를 해결하기 위해 `Object`는 정적 `ReferenceEquals` 메서드를 제공한다.

```csharp
public class Object
{
    public static bool ReferenceEquals(object objA, object objB)
    {
        return (objA == objB);
    }
}
```

두 참조가 같은 객체를 가리키는지 확인하고 싶다면 **항상 `ReferenceEquals`를 써야 한다.** C#의 `==` 연산자를 쓰면 안 되는데, 피연산자 중 하나의 타입이 `==`를 오버로드해 정체성이 아닌 다른 의미를 부여했을 수 있기 때문이다(양쪽을 `object`로 캐스팅한다면 이야기가 다르다).

```csharp
string a = "hello";
string b = new string(new[] { 'h', 'e', 'l', 'l', 'o' });

Console.WriteLine(a == b);                       // True  — string이 ==를 오버로드했다
Console.WriteLine((object) a == (object) b);     // False — object의 ==는 정체성
Console.WriteLine(object.ReferenceEquals(a, b)); // False — 명확하다
```

> **⚠️ `ReferenceEquals`에 값 타입을 넘기면 항상 `false`다**
>
> ```csharp
> int x = 5;
> Console.WriteLine(object.ReferenceEquals(x, x));   // False
> ```
>
> `ReferenceEquals`의 두 매개변수는 `object`이므로, `x`를 넘길 때마다 **각각 별도로 박싱된다.** 서로 다른 두 힙 객체가 만들어지고, 당연히 참조가 다르다. 같은 변수를 두 번 넘겼는데도 `false`인 것이다. 게다가 검사 한 번에 힙 객체 두 개를 만들고 버린다.
>
> 값 타입에서 "같은 인스턴스인가"라는 질문은 애초에 성립하지 않는다. 값 타입에는 정체성이 없고 값만 있기 때문이다. 이 코드가 보이면 거의 확실히 설계가 잘못된 것이다.

### `GetHashCode` — 기본 구현이 하는 일

FCL 설계자들은 아무 객체나 해시 테이블 컬렉션에 넣을 수 있으면 유용하겠다고 판단했고, 그래서 `System.Object`가 가상 `GetHashCode` 메서드를 제공해 모든 객체에서 `Int32` 해시 코드를 얻을 수 있게 했다.

`Object`의 `GetHashCode` 구현은 자기 파생 타입이 무엇인지도, 그 타입에 어떤 필드가 있는지도 모른다. 그래서 **객체의 수명 동안 변하지 않는 것이 보장된 수**를 반환한다. 이 값은 객체 헤더(싱크 블록 인덱스)에 **캐시될 수 있다** — 그 한 자리를 락 정보와 선착순으로 나눠 쓰므로, 락이 먼저 차지하면 런타임은 다른 곳에 보관한다(54.2절). 보장되는 계약은 하나뿐이다 — 해시 코드는 객체 수명 동안 바뀌지 않는다. 값이 같은 두 객체라도 서로 다른 해시 코드를 갖는다.

```csharp
class Ref { public int V; }

var a = new Ref { V = 1 };
var b = new Ref { V = 1 };

Console.WriteLine(a.GetHashCode() == a.GetHashCode());  // True  — 수명 동안 불변
Console.WriteLine(a.GetHashCode() == b.GetHashCode());  // 거의 확실히 False
```

`ValueType.GetHashCode`도 마찬가지로 재정의되어 있지만, 그 구현은 고성능 해싱 알고리즘에 적합하지 않다. 어느 필드를 어떻게 섞는지는 런타임 구현 세부이며 버전에 따라 달라질 수 있으므로 **어떤 코드도 그 동작에 의존해서는 안 된다.**

타입을 정의하면서 `Equals`를 재정의했다면 `GetHashCode`도 반드시 재정의해야 한다. 실제로 C# 컴파일러는 `Equals`만 재정의하고 `GetHashCode`를 재정의하지 않으면 경고를 낸다.

```text
warning CS0659: 'Program' overrides Object.Equals(object o) but does not override Object.GetHashCode()
```

이유는 `System.Collections.Hashtable`, `System.Collections.Generic.Dictionary` 등 일부 컬렉션의 구현이 **같은 두 객체는 반드시 같은 해시 코드를 가져야 한다**고 요구하기 때문이다. 키/값 쌍을 컬렉션에 넣을 때 먼저 키 객체의 해시 코드를 얻고, 그 해시 코드가 어느 "버킷"에 저장할지를 결정한다. 나중에 키를 찾을 때도 같은 방식으로 버킷을 정한 뒤 그 안을 순차적으로 뒤진다. 그래서 해시 코드가 어긋나면 컬렉션은 분명히 넣은 값을 찾지 못한다.

같은 알고리즘에서 따라오는 결과가 하나 더 있다. **컬렉션에 들어 있는 키 객체를 변경하면 컬렉션이 그 객체를 더는 찾지 못한다.** 해시 테이블 안의 키를 바꿔야 한다면 원래 키/값 쌍을 제거하고, 키를 수정한 다음, 새 키/값 쌍을 다시 넣어야 한다. 이 함정의 전체 그림은 25.8절에 있다.

> **⚠️ 해시 코드를 절대 영속화하지 마라**
>
> 직접 해시 테이블 컬렉션을 구현하든, `GetHashCode`를 호출하는 코드를 작성하든, **해시 코드 값을 저장해서는 안 된다.** 해시 코드 값은 변할 수 있기 때문이다. 미래 버전의 타입이 다른 알고리즘으로 해시 코드를 계산할 수도 있다.
>
> 이 경고를 무시한 회사가 있었다. 그 회사의 웹사이트는 사용자가 계정을 만들 때 비밀번호 문자열에 `GetHashCode`를 호출해 그 값을 데이터베이스에 저장했다. 로그인할 때는 입력된 비밀번호로 다시 `GetHashCode`를 호출해 저장된 값과 비교했고, 일치하면 접근을 허용했다. 그런데 CLR의 새 버전으로 업그레이드하자 `String`의 `GetHashCode`가 바뀌어 다른 값을 반환하기 시작했다. **결과적으로 아무도 로그인할 수 없게 되었다.**
>
> 덧붙이면, 해시 코드를 비밀번호 검증에 쓴 것 자체가 별개의 심각한 오류다. 해시 코드는 암호학적 해시가 아니다(44장).

### `MemberwiseClone` — 얕은 복사

`MemberwiseClone`은 새 인스턴스를 만들고 새 객체의 인스턴스 필드를 `this` 객체의 인스턴스 필드와 동일하게 설정한 뒤, 새 인스턴스에 대한 참조를 반환하는 **비가상** 메서드다.

```csharp
public class Node
{
    public int Value;
    public List<int> Children = new();

    public Node ShallowCopy() => (Node) MemberwiseClone();
}
```

`protected`이므로 바깥에서 호출할 수 없고, 자기 타입 안에서만 쓸 수 있다. 반환 타입이 `object`이므로 캐스트가 필요하다.

핵심은 **얕은 복사**(shallow copy)라는 점이다. 참조 타입 필드는 참조만 복사되므로 원본과 복사본이 같은 객체를 공유한다.

```csharp
var a = new Node { Value = 1 };
a.Children.Add(10);

var b = a.ShallowCopy();
b.Value = 2;
b.Children.Add(20);

Console.WriteLine(a.Value);          // 1  — 값 타입 필드는 독립적이다
Console.WriteLine(a.Children.Count); // 2  — 리스트는 공유된다
```

`MemberwiseClone`은 생성자를 호출하지 않는다. 그래서 생성자가 유지하던 불변식이 있다면 복사본에서 깨질 수 있고, `readonly` 필드도 그대로 복사된다.

> **⚠️ 값 타입에서 `MemberwiseClone`을 부르면 박싱된다**
>
> `MemberwiseClone`은 `Object`가 정의한 **비가상** 메서드다. 따라서 `this`가 힙 객체를 가리키는 포인터여야 하고, 값 타입에서 호출하면 박싱이 일어난다. 게다가 반환값은 박싱된 복사본이므로 다시 언박싱해야 한다 — 힙 객체를 두 개 만들고 값을 두 번 복사하는 셈이다.
>
> 애초에 값 타입에는 이 메서드가 필요 없다. **값 타입은 대입만으로 복사된다**(16.2절). `var copy = original;` 한 줄이면 끝이다.

> **💡 `ICloneable`은 쓰지 마라**
>
> `MemberwiseClone`을 보면 `ICloneable` 인터페이스를 구현하고 싶어지지만, 이 인터페이스는 설계상 실패한 것으로 널리 인정된다. `Clone()`이 얕은 복사인지 깊은 복사인지를 계약이 정하지 않기 때문에, `ICloneable` 참조를 받은 코드는 무엇을 받았는지 알 수 없다.
>
> 대안은 셋이다. 의미가 분명한 이름의 메서드(`ShallowCopy`, `DeepCopy`), 복사 생성자(`public Node(Node other)`), 그리고 `record`의 `with` 식(19장)이다. 마지막이 현대 C#의 기본 답이다. 이 논의는 18.11절에서 이어진다.

### `Finalize` — 여기서는 선언만

`Finalize`는 GC가 객체를 쓰레기로 판정한 뒤 객체의 메모리를 회수하기 전에 호출되는 `protected virtual` 메서드다. 수집될 때 정리가 필요한 타입은 이 메서드를 재정의한다.

C#에서는 `Finalize`를 직접 재정의할 수 없다. 대신 파이널라이저 문법(`~ClassName()`)을 쓰며(13.16절), 컴파일러가 그것을 `Finalize` 재정의로 바꾼다. 파이널라이저가 실제로 언제, 어떤 순서로, 얼마의 비용을 들여 실행되는지는 34장에서 다룬다.

> **📌 `Object`의 멤버가 여덟 개뿐이라는 사실의 무게**
>
> 이 여덟 개는 .NET의 모든 객체가 지불하는 최소 계약이다. 여기에 무엇을 넣을지에 대한 결정은 되돌릴 수 없었고, 그래서 오늘날까지 논쟁거리다. `GetHashCode`는 대부분의 타입에 불필요하고, `Equals`의 기본 구현은 재정의를 어렵게 만들었으며, `Finalize`는 GC를 복잡하게 만들었다.
>
> 이 설계에서 배울 점은 명확하다. **모든 타입이 상속하는 기반에 멤버를 넣는 것은 영원한 결정이다.** API 설계에서 같은 종류의 결정을 내려야 할 때 이 사례를 떠올리는 것이 좋다(78장).

---

## 15.7 박싱 최소화 체크리스트

### 원칙 — 제네릭이 근본 해법이다

박싱은 "값 타입을 참조로 다뤄야 하는데 방법이 없을 때" CLR이 내놓는 최후 수단이다. 그러므로 박싱을 없애는 근본적인 방법은 **애초에 참조로 다루지 않아도 되게 만드는 것**이고, 그 도구가 제네릭이다.

FCL은 비제네릭 컬렉션 클래스를 낡은 것으로 만드는 제네릭 컬렉션 클래스 집합을 제공한다. `System.Collections.ArrayList` 대신 `System.Collections.Generic.List<T>`를 써야 한다. 제네릭 컬렉션의 개선점은 여럿이지만 가장 큰 것은 **컬렉션의 항목을 박싱/언박싱하지 않고 값 타입 컬렉션을 다룰 수 있다**는 것이다. 관리 힙에 만들어지는 객체가 훨씬 줄어들어 애플리케이션이 요구하는 가비지 컬렉션 횟수가 줄고, 컴파일 타임 타입 안전성을 얻으며, 캐스트가 줄어 소스가 깨끗해진다.

제네릭이 박싱을 없앨 수 있는 이유는 CLR이 값 타입 인수마다 **네이티브 코드를 따로 만들기 때문**이다. `List<int>`를 위한 코드에는 `int`가 그대로 박혀 있고, 참조로 승격할 필요가 없다. 이 인프라는 23.11절에서 다룬다.

### 체크리스트

| # | 박싱이 일어나는 코드 | 고친 코드 | 근거 |
|---|---|---|---|
| 1 | `ArrayList`, `Hashtable`, 비제네릭 `Queue`/`Stack` | `List<T>`, `Dictionary<K,V>`, `Queue<T>`, `Stack<T>` | 23장, 24장 |
| 2 | `string.Format("{0}", i)` | `$"{i}"` (※C# 10 이상) 또는 `i.ToString()` | 35.7절 |
| 3 | `"x = " + i` | `$"x = {i}"` 또는 `"x = " + i.ToString()` | 15.5절 |
| 4 | `Console.WriteLine("{0}", i)` | `Console.WriteLine(i)` — 값 타입 오버로드 선택 | 15.2절 |
| 5 | `Equals(object)`만 구현한 구조체 | `IEquatable<T>`도 구현 | 25.2절 |
| 6 | `IComparable`만 구현한 구조체 | `IComparable<T>`도 구현 | 25.6절 |
| 7 | `IComparable c = point;` | `where T : IComparable<T>` 제네릭 제약으로 받기 | 23.6절 |
| 8 | `point.GetType()` | `typeof(Point)` 또는 `is` 패턴 | 15.4절 |
| 9 | `((IFoo) structValue).Bar()` | 제네릭 메서드 + 인터페이스 제약 | 18.6절 |
| 10 | `object` 타입 필드에 값 타입 저장 | 제네릭 필드 `T` | 23.2절 |
| 11 | `foreach (int x in arrayList)` | 제네릭 컬렉션을 열거 | 24.1절 |
| 12 | `nonGenericSeq.Cast<int>()` | 애초에 `IEnumerable<int>`로 유지 | 30.8절 |
| 13 | 구조체가 `ToString`을 재정의하지 않음 | 재정의한다 | 15.5절 |
| 14 | 재정의 안에서 `base.ToString()` | 부르지 않는다 | 15.5절 |
| 15 | `object.ReferenceEquals(v1, v2)` (값 타입) | 애초에 쓰지 않는다 | 15.6절 |
| 16 | 같은 값을 여러 번 `object` 인수로 전달 | 한 번만 손으로 박싱해 재사용 | 15.2절 |
| 17 | 리플렉션으로 값 타입 프로퍼티 읽기 | 델리게이트 캐시 또는 소스 생성기 | 57.13절 |
| 18 | 배열 요소를 `GetValue`/`SetValue`로 접근 | 인덱서를 쓴다 | 9.7절 |

7번과 9번을 조금 더 보자. 구조체가 인터페이스를 구현할 때, 그 인터페이스 타입 변수에 담는 순간 박싱이 일어난다(15.2절). 그런데 제네릭 제약으로 받으면 박싱이 사라진다.

```csharp
// 나쁨 — 호출할 때마다 값 타입 인수가 박싱된다
static int Max(IComparable a, IComparable b) => a.CompareTo(b) >= 0 ? 1 : 2;

// 좋음 — T가 구조체면 JIT이 전용 코드를 만들고, 인터페이스 호출도 직접 호출이 된다
static int Max<T>(T a, T b) where T : IComparable<T> => a.CompareTo(b) >= 0 ? 1 : 2;
```

아래 버전에서 `T`가 값 타입이면 컴파일러는 `constrained.` 접두사를 붙여 호출하고(56.3절), JIT은 그 타입이 인터페이스 메서드를 직접 구현한다는 것을 확인해 박싱 없이 호출한다. 인터페이스 제약이 붙은 제네릭이 인터페이스 매개변수보다 거의 항상 나은 이유다.

> **💡 `EqualityComparer<T>.Default`를 기억하라**
>
> 제네릭 코드에서 두 값을 비교해야 할 때, `a.Equals(b)`는 `T`가 무엇이냐에 따라 박싱될 수 있다. `EqualityComparer<T>.Default`는 `T`가 `IEquatable<T>`를 구현하면 그 타입 안전한 구현을 골라 주고, 아니면 `Object.Equals`로 폴백한다.
>
> ```csharp
> static bool AreSame<T>(T a, T b) => EqualityComparer<T>.Default.Equals(a, b);
> ```
>
> `Dictionary<K,V>`와 `List<T>.Contains`가 내부적으로 쓰는 것이 정확히 이것이다. 그래서 값 타입 키에 `IEquatable<T>`를 구현하면 딕셔너리 조회에서 박싱과 리플렉션이 동시에 사라진다. 비교자를 바깥에서 꽂아 넣는 방법은 25.7절에 있다.

### 진단 — 박싱을 찾는 법

박싱은 소스에 흔적을 남기지 않으므로, 눈으로 찾는 것에는 한계가 있다. 도구를 쓴다.

| 방법 | 무엇을 보는가 | 언제 쓰는가 |
|---|---|---|
| SharpLab (3.8절) | IL 탭에서 `box` / `unbox.any` 검색 | 코드 조각 하나를 확인할 때 |
| `ildasm` / ILSpy (56.7절, 56.8절) | 빌드된 어셈블리의 IL | 실제 빌드 결과를 확인할 때 |
| BenchmarkDotNet + `MemoryDiagnoser` | `Allocated` 열 | 두 구현을 비교할 때 |
| 할당 프로파일러 | 타입별 할당 수 | 애플리케이션 전체에서 범인을 찾을 때 |
| Roslyn 힙 할당 분석기 계열 | 편집기에서 실시간 경고 | 핫 패스 파일에 국지적으로 켤 때 |

가장 저렴한 습관은 첫 줄이다. 성능이 걱정되는 알고리즘이 있으면 IL을 열어 `box` 명령이 어디에 있는지 본다. 컴파일러가 암묵적으로 박싱 코드를 방출하기 때문에, 소스만 봐서는 박싱이 일어나는지 분명하지 않은 경우가 많다.

프로파일러에서 `System.Int32`, `System.Boolean`, `System.Double` 같은 타입의 인스턴스가 대량으로 할당되고 있다면 그것이 박싱의 서명이다. 이 타입들은 정상적인 코드에서 **힙에 할당될 이유가 없기 때문이다.**

> **⚠️ 박싱 제거는 측정 다음에 하는 일이다**
>
> 이 절의 체크리스트를 전부 적용해 코드를 뒤집는 것은 대개 나쁜 선택이다. 박싱 하나의 비용은 수십 나노초 수준이며, 초당 수백 번 실행되는 코드에서는 측정 불가능하다. 루프 안에서 초당 수십만 번 실행되는 코드에서만 문제가 된다.
>
> 순서는 이렇다. **측정 → 핫 패스 식별 → 그 안의 할당 확인 → 제거 → 재측정**(67장). 측정 없이 시작한 박싱 제거는 코드를 읽기 어렵게 만들 뿐이다. 할당 제거의 실전 기법 전체는 69장에 있다.

> **📌 박싱이 언제나 나쁜 것은 아니다**
>
> 박싱은 타입 통합이라는 값을 지불하고 얻은 대가다. `object`를 받는 API 하나로 모든 타입을 처리할 수 있는 것, 값 타입도 인터페이스를 구현할 수 있는 것, 리플렉션이 모든 타입을 균일하게 다룰 수 있는 것이 전부 박싱 덕분이다. 이 통합이 없었다면 C++의 템플릿처럼 코드 크기가 폭발하거나, Java 초기처럼 값 타입 자체가 없는 언어가 되었을 것이다.
>
> 문제는 박싱이 존재한다는 것이 아니라 **예상하지 못한 곳에서 일어난다**는 것이다. 그래서 이 장의 목표는 박싱을 없애는 것이 아니라, 박싱이 일어나는 자리를 정확히 아는 것이다.

---

## 이 장의 요약

- **CLR은 모든 타입이 궁극적으로 `System.Object`에서 파생될 것을 요구한다.** 그래서 모든 객체는 `Equals`, `GetHashCode`, `ToString`, `GetType` 네 개의 공개 메서드와 `MemberwiseClone`, `Finalize` 두 개의 보호 메서드를 갖는다. 인터페이스는 이 파생 관계 바깥에 있지만 모든 구현체가 `Object`를 상속하므로 결과는 같고, 포인터 타입과 `ref struct`는 진짜 예외다.
- **값 타입과 참조 타입을 하나의 계층으로 묶은 대가가 박싱이다.** `System.ValueType`은 `Object`를 상속하는 클래스이고, 값 타입 인스턴스를 참조로 다뤄야 할 때마다 CLR이 힙 객체를 만들어 그 모순을 봉합한다.
- **박싱은 할당 + 복사, 언박싱은 포인터 획득이다.** 둘은 대칭이 아니다. 박싱은 힙 객체를 만들고 값을 복사하지만, 언박싱은 박싱된 인스턴스 안 데이터의 주소를 얻는 것뿐이라 할당도 복사도 없다. C#에서 실제로 방출되는 `unbox.any`는 그 뒤에 복사(`ldobj`)를 붙인 것이다.
- **박싱은 암시적이고 언박싱은 명시적이다.** 그래서 비싼 쪽이 소스에서 보이지 않는다. 인터페이스 캐스트, `params object[]`, 문자열 조합, `Equals(object)`, 비제네릭 컬렉션, 값 타입의 `GetType()` 호출이 전부 조용한 박싱 지점이다.
- **언박싱은 정확히 그 타입으로만 된다.** 박싱된 `int`를 `long`이나 `short`로 언박싱하면 `InvalidCastException`이다. `null`을 언박싱하면 `InvalidCastException`이 아니라 `NullReferenceException`이다.
- **박싱된 값 타입은 수정할 수 없다.** 캐스트해서 메서드를 부르면 임시 복사본이 고쳐질 뿐이다. 인터페이스를 거치면 힙의 박스를 실제로 고칠 수 있지만, 이 사실이 증명하는 것은 **값 타입을 불변으로 설계해야 한다**는 것이다.
- **`typeof`는 타입 이름을 컴파일 타임에, `GetType()`은 인스턴스의 실제 타입을 런타임에 묻는다.** `GetType`은 비가상이라 재정의할 수 없다 — 타입을 속일 수 있으면 CLR의 타입 안전성 전체가 무너지기 때문이다. 값 타입에서 부르면 박싱된다.
- **`ToString`의 기본 구현은 타입의 전체 이름을 반환한다.** 값 타입이 `ToString`을 재정의했으면 박싱 없이 호출되지만, 재정의하지 않았거나 `base.ToString()`을 부르면 박싱된다.
- **`Object.Equals`의 기본 구현은 값 동등성이 아니라 정체성이다.** 그 결과 `Equals`로는 정체성을 확인할 수 없게 되었고, 그래서 `ReferenceEquals`가 따로 필요하다. `ValueType.Equals`는 값 비교를 하지만 조건이 맞지 않으면 리플렉션 경로로 폴백한다.
- **`Equals`를 재정의했으면 `GetHashCode`도 반드시 재정의한다.** 컴파일러가 CS0659 경고로 알려 주며, 어기면 딕셔너리가 분명히 넣은 값을 찾지 못한다. 해시 코드는 절대 영속화하지 않는다.
- **박싱의 근본 해법은 제네릭이다.** CLR이 값 타입 인수마다 전용 네이티브 코드를 만들기 때문에 값을 참조로 승격할 필요가 없어진다. 인터페이스 매개변수 대신 인터페이스 제약이 붙은 제네릭을 쓰는 것이 같은 원리의 응용이다.
- **박싱 제거는 측정 다음이다.** IL에서 `box`를 찾는 습관은 저렴하지만, 그것을 근거로 코드를 뒤집는 것은 핫 패스로 확인된 뒤에 할 일이다.

---

## 연습 문제

1. **박싱을 세어 보라.** 15.2절의 `Console.WriteLine(v + ", " + (int) o);` 예제를 SharpLab(3.8절)에 붙여 넣고 IL에서 `box` 명령의 개수를 세라. 그다음 `(int)` 캐스트를 지우고, 마지막으로 `v.ToString()`으로 바꿔 가며 `box` 개수가 3 → 2 → 1로 줄어드는 것을 확인하라. 각 단계에서 IL 크기가 몇 바이트 줄었는지도 기록하라.
2. **박싱된 값은 수정되지 않는다는 것을 확인하라.** 15.2절의 `Point`/`Change` 예제를 그대로 실행해 네 줄의 출력이 `(1, 1)`, `(2, 2)`, `(2, 2)`, `(2, 2)`인 것을 확인하라. 그다음 `Point`를 `struct`에서 `class`로 바꾸고 다시 실행해 마지막 줄이 어떻게 바뀌는지, 왜 그런지 설명하라.
3. **인터페이스로 박스를 수정하라.** 15.2절의 `IChangeBoxedPoint` 예제를 실행해 `((IChangeBoxedPoint) p).Change(4, 4)`와 `((IChangeBoxedPoint) o).Change(5, 5)`의 결과가 다른 이유를 IL로 확인하라. 두 줄의 IL에서 `box` 명령이 어느 쪽에만 있는지 보라.
4. **`GetType()`의 박싱을 제거하라.** 구조체에 `CompareTo(object)`를 구현하되 `GetType() != o.GetType()`으로 타입을 검사하는 버전과 `o is Point other` 패턴으로 검사하는 버전을 각각 작성하고, 두 버전의 IL을 비교해 `box` 명령이 사라지는 것을 확인하라. BenchmarkDotNet의 `MemoryDiagnoser`로 `Allocated` 열을 비교하라(67.5절).
5. **`ValueType.Equals`의 두 경로를 관찰하라.** `int` 필드 두 개만 가진 구조체와, 거기에 `string` 필드 하나를 추가한 구조체를 만들어 각각 100만 번 `Equals` 비교를 수행하고 시간을 재라. 그다음 두 구조체에 `IEquatable<T>`를 구현하고 다시 측정해 차이를 기록하라.
6. **`ReferenceEquals`의 함정을 재현하라.** `int x = 5;`에 대해 `object.ReferenceEquals(x, x)`가 `False`인 것을 확인하고, IL에서 `box` 명령이 두 번 나오는 것을 보라. 같은 코드를 `string`으로 바꿨을 때는 어떻게 되는지, `new string(...)`으로 만든 문자열이면 어떻게 되는지도 확인하라.
7. **비제네릭 컬렉션의 대가를 측정하라.** `ArrayList`에 `int` 100만 개를 넣는 코드와 `List<int>`에 같은 수를 넣는 코드를 BenchmarkDotNet으로 비교하라. 실행 시간뿐 아니라 할당량(`Allocated`)과 GC 세대별 수집 횟수(`Gen0`)를 함께 보고, 두 수치의 비율이 왜 그렇게 나오는지 15.2절의 힙 다이어그램으로 설명하라.

---

**다음 장** — 16장「구조체와 값 타입」에서는 이 장에서 "박싱되는 쪽"으로만 다룬 값 타입을 정면에서 설계한다. `struct` 선언 규칙과 제약, 값 복사 의미론과 숨은 복사, ※C# 10/11에서 완화된 생성 의미론, `readonly struct`가 제거하는 방어적 복사, 그리고 이 장에서 미룬 "기본 `Equals`/`GetHashCode`가 왜 느리고 무엇으로 대체해야 하는가"를 마무리한다. `struct`를 쓸 때와 `class`를 쓸 때의 손익 계산법도 거기서 정리한다.
