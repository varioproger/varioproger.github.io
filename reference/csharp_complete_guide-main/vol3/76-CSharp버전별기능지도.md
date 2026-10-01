# 76장. C# 버전별 기능 지도

> **이 장의 위치** — Part XIV「언어의 진화」의 첫 장이다. 3권은 여기까지 CLR 내부(Part X), 메모리(Part XI), 성능(Part XII), 진단(Part XIII)을 파고들면서 `ref struct`, `init`, `record`, 정적 추상 멤버, 컬렉션 식 같은 문법을 **필요할 때마다 꺼내 썼다.** 그때마다 "이건 C# 몇에 들어왔고 어떤 런타임이 필요하다"고 한 줄씩 붙였지만, 그 조각들을 한자리에 모아 **왜 그 순서로 들어왔는지**를 설명한 적은 없다. 이 장이 그 지도다.
>
> **선수 지식** — 4장(프로젝트와 대상 프레임워크), 54장(타입 시스템의 런타임 표현), 55장(JIT 컴파일과 코드 생성), 56장(CIL 읽기)
>
> **이 장에서 다루지 않는 것** — 각 기능의 문법 자체는 1·2권에서 이미 다뤘고, 튜플·분해·패턴 매칭의 세부는 77장에서, 널 가능 참조 타입의 문법과 마이그레이션 전략은 21장(널 안정성)에서, 소스 생성기는 57.15절에서 다룬다. 이 장은 **연대기와 지도**이지 문법 교본이 아니다.

---

## 언어 진화의 다섯 축

C# 1.0은 2002년에 나왔다. C# 14는 2025년에 나왔다. 23년 동안 열네 번의 주 버전과 여러 번의 부 버전이 지나갔고, 그 사이에 추가된 언어 기능은 수백 개다. 이걸 시간순으로 나열하면 그냥 목록이다. 목록은 검색하면 나온다. 이 장이 하려는 것은 다르다.

C#의 진화에는 **다섯 개의 축**이 있다. 각 축은 특정 버전에 속하지 않고 여러 버전을 가로지른다. 한 버전에서 씨앗이 뿌려지고, 몇 버전 뒤에 열매가 맺힌다. 이 축을 보면 "왜 C# 11에 와서야 정적 추상 인터페이스 멤버가 나왔는가" 같은 질문에 답할 수 있다.

```text
        C#2    C#3    C#4    C#5    C#6    C#7    C#8    C#9    C#10   C#11   C#12   C#13   C#14
        2005   2007   2010   2012   2015   2017   2019   2020   2021   2022   2023   2024   2025
        ──────────────────────────────────────────────────────────────────────────────────────►
        ●──────●──────●──────┼──────┼──────●──────●──────●──────●──────●──────●──────●──────●  ① 타입 시스템 강화
        ●──────●──────●──────┼──────●──────●──────●──────●──────●──────●──────●──────●──────●  ② 간결성
        ●──────●──────┼──────┼──────┼──────●──────●──────●──────●──────●──────●──────●──────●  ③ 데이터 접근
        ┼──────┼──────┼──────●──────●──────●──────●──────┼──────●──────┼──────┼──────●──────┼  ④ 비동기
        ┼──────┼──────┼──────┼──────┼──────●──────●──────●──────●──────●──────●──────●──────●  ⑤ 성능

        ● = 그 축에 실질적 기여가 있었던 버전    ┼ = 해당 축에 큰 변화 없음
```

### ① 타입 시스템 강화 — "컴파일러에게 더 정확히 말하기"

C#은 처음부터 정적 타입 언어였다. 하지만 "정적 타입"에도 정밀도의 차이가 있다. `IEnumerable`은 "뭔가의 시퀀스"라고만 말하고, `IEnumerable<Book>`은 "책의 시퀀스"라고 말한다. 후자가 더 많은 것을 컴파일러에게 알려준다.

이 축의 궤적은 이렇다.

- **C# 2 제네릭** — 컨테이너의 원소 타입을 말할 수 있게 됐다.
- **C# 2 널 가능 값 타입** — "값이 없음"을 `-1`이나 `DateTime.MinValue` 같은 매직 값 없이 말할 수 있게 됐다.
- **C# 3 익명 타입** — 한 메서드 안에서만 쓸 데이터 모양을, 타입을 선언하지 않고 말할 수 있게 됐다.
- **C# 4 제네릭 가변성** — `IEnumerable<Derived>`를 `IEnumerable<Base>`로 취급해도 안전하다는 사실을 타입 시스템 안에서 표현할 수 있게 됐다.
- **C# 7 `readonly struct`** — "이 구조체는 불변이다"를 컴파일러에게 말할 수 있게 됐다.
- **C# 8 널 가능 참조 타입** — 참조가 null이 될 수 있는지를 시그니처에 쓸 수 있게 됐다. 2002년부터 비어 있던 격자의 마지막 칸이다.
- **C# 9 레코드 / C# 10 `record struct`** — "이 타입은 값으로 비교되는 데이터다"를 선언 한 줄로 말할 수 있게 됐다.
- **C# 11 정적 추상 인터페이스 멤버 / `required`** — "이 타입 인수는 `+` 연산자를 가진다", "이 프로퍼티는 생성 시점에 반드시 설정돼야 한다"를 말할 수 있게 됐다.
- **C# 13 `allows ref struct`** — "이 제네릭은 `ref struct`도 받는다"를 말할 수 있게 됐다.

패턴이 보인다. **말할 수 없던 의도를 말할 수 있게 만드는 것**, 그래서 컴파일러가 실수를 잡아줄 수 있게 만드는 것. 이게 첫 번째 축이다.

### ② 간결성 — "의식(ceremony)의 제거"

두 번째 축은 **똑같은 의미를 더 적은 글자로** 쓰게 만드는 것이다. 여기서 제거되는 코드는 틀린 코드가 아니었다. 그저 산만하고 불필요했을 뿐이다.

델리게이트 생성이 가장 극적인 사례다.

```csharp
// C# 1 — 별도 메서드 + 명시적 델리게이트 생성
button.Click += new EventHandler(HandleButtonClick);

// C# 2 — 메서드 그룹 변환
button.Click += HandleButtonClick;

// C# 2 — 익명 메서드 (매개변수 목록 생략 가능)
button.Click += delegate { MessageBox.Show("Clicked!"); };

// C# 3 — 람다 식
button.Click += (sender, args) => MessageBox.Show("Clicked!");

// C# 9 — 정적 람다 (캡처 금지를 명시)
button.Click += static (sender, args) => MessageBox.Show("Clicked!");
```

같은 일을 하는 코드가 네 번에 걸쳐 짧아졌다. 프로퍼티도 마찬가지다. 백킹 필드 + getter + setter 7줄이 C# 3의 자동 구현 프로퍼티로 1줄이 되고, C# 6의 읽기 전용 자동 프로퍼티로 `{ get; }`가 되고, C# 9의 `init`으로 "생성 시에만 설정" 의미가 붙고, C# 14의 `field` 키워드로 백킹 필드를 직접 언급하지 않고도 접근자 본문을 쓸 수 있게 됐다.

> **📌 간결성은 취향 문제가 아니다**
>
> 식 본문 멤버나 최상위 문을 "설탕"이라고 부르며 무시하는 사람이 있다. 하지만 코드는 쓰이는 횟수보다 **읽히는 횟수**가 훨씬 많다. 신호 대 잡음비를 높이는 기능은 유지보수 비용을 직접 줄인다. Jon Skeet은 4판에서 식 본문 멤버에 대해 "내 코드 가독성에 이 정도 차이를 만들 줄 몰랐다"고 썼다.

### ③ 데이터 접근 — LINQ와 그 후예

세 번째 축은 **데이터를 다루는 방식**이다. C# 3의 여러 기능(암시적 타입, 확장 메서드, 람다, 익명 타입, 객체 초기화자)은 개별적으로도 유용하지만, 진짜 목적은 하나였다. **쿼리 식(query expression)** 이다.

```csharp
var offers =
    from product in db.Products
    where product.SalePrice <= product.Price / 2
    orderby product.SalePrice
    select new { product.Id, product.Description, product.SalePrice, product.Price };
```

이 코드는 컴파일 타임 검사와 IntelliSense를 받으면서 SQL로 번역된다. 2007년 기준으로는 혁명이었다. 그리고 LINQ는 도구 이상의 것 — **데이터 변환을 함수형으로 사고하는 습관** — 을 남겼다. C# 7의 튜플과 분해, C# 8의 재귀 패턴, C# 9의 레코드, C# 11의 목록 패턴, C# 12의 컬렉션 식이 모두 이 사고방식의 연장선에 있다.

### ④ 비동기 — 상태 기계를 컴파일러에게 떠넘기기

네 번째 축은 C# 5가 열었다. `async`/`await`는 비동기의 본질적 복잡성을 없애지 못한다. 다만 **보일러플레이트**를 없앤다. 그리고 이 축은 C# 5에서 끝나지 않았다.

- **C# 5** — `async`/`await`, `Task` 기반
- **C# 6** — `catch`/`finally` 안에서 `await` 허용
- **C# 7.0** — 커스텀 태스크 타입 반환(`ValueTask<T>`)으로 할당 제거
- **C# 7.1** — `async Task Main`
- **C# 8** — 비동기 스트림(`IAsyncEnumerable<T>`, `await foreach`), `await using`
- **C# 10** — 메서드 단위 `[AsyncMethodBuilder]` — 풀링 빌더로 상태 기계 할당 재사용
- **C# 13** — 반복자와 async 메서드 안에서 `ref` 지역 변수·`unsafe` 블록 허용

이 축의 흥미로운 점은 **④번 축이 ⑤번 축과 충돌한다**는 것이다. `await` 한 번마다 상태 기계 객체가 힙에 올라가고, 컨텍스트가 캡처된다. C# 7의 `ValueTask<T>`와 `IValueTaskSource`는 그 충돌을 해소하려는 시도였다.

### ⑤ 성능 — 나중에 열린 축, 그리고 가장 비싼 축

다섯 번째 축은 C# 7에서 본격적으로 열렸다. 이유는 분명하다. C#이 게임 엔진, 마이크로서비스, 고빈도 거래 시스템으로 흘러 들어가면서 **"복사를 피하고, 할당을 피하고, 경계 검사를 피하는" 문법**이 필요해졌다.

- **C# 7.0** — `ref` 지역 변수와 `ref` 반환
- **C# 7.2** — `in` 매개변수, `readonly struct`, `ref struct`, `ref readonly` 반환
- **C# 8** — 인덱스/범위(슬라이싱), 구조체 멤버의 `readonly` 한정자
- **C# 9** — 함수 포인터, 네이티브 크기 정수, `[SkipLocalsInit]`
- **C# 11** — `ref` 필드와 `scoped`, UTF-8 문자열 리터럴
- **C# 12** — 인라인 배열, `ref readonly` 매개변수, 컬렉션 식
- **C# 13** — `params` 컬렉션(`params ReadOnlySpan<T>`), `allows ref struct`

> **⚠️ ⑤번 축의 기능은 "쓸 수 있으니 쓴다"가 아니다**
>
> Skeet은 4판에서 `in` 매개변수와 `ref` 지역 변수에 대해 "약간의 불안감이 있다"고 썼다. 이유는 코드에 대해 **추론하기 어려워지기** 때문이다. `in` 매개변수는 호출자 쪽에서 값이 바뀔 수 있고(4판 13.3.2절의 "surprising mutability"), `ref` 지역 변수는 별칭(alias)을 만든다. 이 축의 기능은 **측정으로 정당화될 때만** 써야 한다. 67장에서 다룬 원칙 그대로다.

### 이 장을 읽는 방법

76.1~76.12는 버전별로 간다. 각 절은 **어떤 문제가 있었는가 → 어떤 기능이 나왔는가 → 그것이 무엇을 바꿨는가**의 세 부분이고, 끝에 기능명 / 런타임·프레임워크 요구 / 3권에서 다룬 장을 정리한 요약표를 둔다. 76.13은 **런타임 버전과 언어 버전의 조합**을, 76.14는 그 표가 실무에서 왜 필요한지를 다룬다.

---

## 76.1 C# 2 — 제네릭, 널 가능 값 타입, 반복자, 익명 메서드, 부분 타입

C# 2는 2005년에 .NET Framework 2.0과 함께 나왔다. **언어와 런타임이 함께 바뀐 마지막 대규모 릴리스**에 가깝다. C# 2의 주요 기능 중 두 개(제네릭, 널 가능 값 타입)는 CLR 자체를 뜯어고쳐야 했다.

### 어떤 문제가 있었는가

C# 1의 컬렉션은 `object`를 담았다.

```csharp
// C# 1 — 컴파일러가 도와줄 수 있는 게 없다
ArrayList list = new ArrayList();
list.Add("hello");
list.Add(42);                       // 컴파일 통과. 의도한 것인가?
string s = (string) list[1];        // 런타임에 InvalidCastException
```

문제가 셋이었다. **타입 안전성 없음**(잘못된 타입을 넣어도 컴파일러가 모른다), **박싱 비용**(`int`를 넣을 때마다 힙 할당이 발생한다 — 54.6절), **의도 표현 불가**(`public IEnumerable Books { get; }`은 원소 타입을 말하지 못한다). 당시의 우회책은 타입별 컬렉션을 손으로 쓰는 것이었다. `StringCollection`, `Int32Collection`… 조합 폭발이다.

### 어떤 기능이 나왔는가

**제네릭.** C#의 제네릭은 Java의 소거(erasure) 방식과 근본적으로 다르다. **런타임이 타입 인수를 안다.**

```csharp
public class Bookshelf
{
    public IEnumerable<Book> Books { get; }   // 원소 타입이 시그니처에 있다
}

List<int> numbers = new List<int>();
numbers.Add(42);                              // 박싱 없음
Console.WriteLine(typeof(List<>));            // System.Collections.Generic.List`1[T]
Console.WriteLine(numbers.GetType());         // System.Collections.Generic.List`1[System.Int32]
```

리플렉션 출력의 `` List`1 ``에서 백틱 뒤의 숫자가 **제네릭 arity**(타입 매개변수 개수)다. 이 이름 규칙은 57.1절에서 다뤘다.

값 타입 인수마다 별도의 네이티브 코드가 생성되고 참조 타입 인수는 코드를 공유한다는 사실 — 그래서 `List<int>`와 `List<long>`은 다른 코드를 갖지만 `List<string>`과 `List<Uri>`는 같은 코드를 공유한다는 사실 — 은 54.1절과 55장에서 다뤘다.

**널 가능 값 타입.** `Nullable<T>` 구조체와 언어 지원의 조합이다.

```csharp
int? count = null;
int? four = 4;
int? five = 5;

Console.WriteLine(four + five);      // 9
Console.WriteLine(four + count);     // (빈 문자열 — null)
Console.WriteLine(count == count);   // True
Console.WriteLine(count < five);     // False
```

여기서 `+`와 `<`는 **리프트된 연산자(lifted operator)** 다. 피연산자 중 하나라도 null이면 산술 연산은 null을 내고, 관계 연산은 `false`를 낸다. `==`는 다르다 — 둘 다 null이면 `true`다.

> **⚠️ 리프트된 관계 연산자는 삼분법을 깨뜨린다**
>
> `count < five`가 `false`이고 `count >= five`도 `false`다. 두 표현식이 동시에 거짓이 될 수 있다. `!(a < b)`를 `a >= b`로 바꾸는 리팩터링은 널 가능 값 타입 앞에서 **조용히 의미를 바꾼다.** 이건 C# 2 시절부터 지금까지 살아 있는 함정이다.

**널 가능 값 타입의 CLR 지원.** `Nullable<T>`는 그냥 구조체가 아니다. CLR이 특별 대우한다.

```csharp
int? nullValue = null;
object boxed = nullValue;
Console.WriteLine(boxed == null);   // True — Nullable<int>가 박싱된 게 아니라 null이 됐다

int? five = 5;
object boxedFive = five;
Console.WriteLine(boxedFive.GetType());   // System.Int32 — Nullable<int>가 아니다!
```

박싱 시 `Nullable<T>`는 **사라진다.** 값이 있으면 `T`가 박싱되고, 없으면 `null` 참조가 된다. 이건 언어가 아니라 CLR의 동작이며, C# 2를 위해 런타임에 추가된 것이다. 54.6절에서 IL 수준으로 다뤘다.

**반복자(`yield return`).** 이건 반대로 **순수한 컴파일러 마법**이다. 런타임 지원이 전혀 필요 없다.

```csharp
static IEnumerable<int> Countdown(int from)
{
    Console.WriteLine("시작");
    for (int i = from; i > 0; i--)
    {
        Console.WriteLine($"yield {i}");
        yield return i;
    }
    Console.WriteLine("끝");
}
```

컴파일러는 이 메서드를 **상태 기계 클래스**로 변환한다. `IEnumerable<int>`, `IEnumerator<int>`, `IDisposable`을 모두 구현하는 중첩 클래스가 생기고, 지역 변수는 그 클래스의 필드가 되고, 메서드 본문은 `MoveNext()` 안의 `switch`로 재배치된다. 56.6절에서 실제 IL을 봤고, 63.9절에서 이 상태 기계 객체가 **숨은 할당**이라는 점을 다뤘다.

```csharp
var seq = Countdown(3);
Console.WriteLine("아직 아무것도 출력되지 않았다");
foreach (int i in seq) { Console.WriteLine($"받음 {i}"); }
```

`Countdown(3)` 호출만으로는 `"시작"`이 출력되지 않는다. **지연 실행(lazy execution)** 이다. 첫 `MoveNext()`가 호출될 때 비로소 메서드 본문이 시작된다.

> **⚠️ 반복자 메서드의 인수 검증은 즉시 실행되지 않는다**
>
> ```csharp
> public static IEnumerable<string> ReadLines(string path)
> {
>     if (path == null) throw new ArgumentNullException(nameof(path));  // 여기서 안 던진다!
>     using var reader = File.OpenText(path);
>     string? line;
>     while ((line = reader.ReadLine()) != null) yield return line;
> }
> ```
>
> `ReadLines(null)`은 예외를 던지지 않는다. 첫 `MoveNext()`에서야 던진다. 호출 스택이 완전히 달라지고, 진짜 원인에서 멀어진다. 해결책은 **일반 메서드 + private 반복자 메서드**로 쪼개는 것이다. 78.12절에서 다룬다.

**익명 메서드와 메서드 그룹 변환.** 델리게이트 생성 문법이 짧아졌고, 클로저가 도입됐다.

```csharp
List<int> numbers = new List<int> { 1, 2, 3, 4, 5 };
int threshold = 3;
List<int> big = numbers.FindAll(delegate(int x) { return x > threshold; });
```

`threshold`를 캡처하는 순간 컴파일러는 **디스플레이 클래스**를 만들고 `threshold`를 그 필드로 승격시킨다. 이게 클로저 할당의 정체이며, 63.9절의 주요 항목이다.

**부분 타입(`partial class`).** 디자이너 생성 코드와 손으로 쓴 코드를 분리하기 위해 나왔다. Windows Forms의 `InitializeComponent`가 원래 목적이었지만, 오늘날 훨씬 중요한 용도는 **소스 생성기**다(57.15절). C# 3의 부분 메서드, C# 13의 부분 프로퍼티·인덱서, C# 14의 부분 생성자·이벤트가 모두 이 축의 연장이다.

**나머지 소소한 기능들.**

| 기능 | 목적 |
|---|---|
| 정적 클래스(`static class`) | 인스턴스화 불가·상속 불가를 컴파일러가 강제. `Math` 같은 유틸리티 타입 |
| getter/setter 개별 접근성 | `public int X { get; private set; }` |
| 네임스페이스 별칭 한정자 `::` | `global::System.Console` — 이름 충돌 해소 |
| `extern alias` | 같은 이름의 타입을 가진 두 어셈블리를 동시에 참조 |
| `#pragma warning` | 경고 억제를 지역화 |
| 고정 크기 버퍼(`fixed`) | `unsafe` 구조체 안의 인라인 배열. 60.8절 |
| `[InternalsVisibleTo]` | `internal` 멤버를 테스트 어셈블리에 노출. 52장 |

### 그것이 무엇을 바꿨는가

C# 2는 **BCL 전체를 다시 쓰게 만들었다.** `System.Collections.Generic` 네임스페이스가 통째로 생겼고, `ArrayList`와 `Hashtable`은 사실상 유물이 됐다.

그리고 더 중요한 것 — 제네릭이 없었으면 **LINQ가 불가능했다.** `IEnumerable<T>`가 없으면 `Where<T>`도 `Select<TSource, TResult>`도 없다. C# 2는 C# 3의 전제 조건이었다.

> **📌 고정 크기 버퍼와 인라인 배열**
>
> C# 2의 고정 크기 버퍼(`fixed int buffer[10];`)는 `unsafe` 컨텍스트에서만 쓸 수 있고 원시 타입만 담을 수 있었다. 18년 뒤 C# 12의 인라인 배열(`[InlineArray(10)]`)이 같은 아이디어를 **안전한 코드에서, 임의의 타입으로** 되살렸다(68.10절). 축은 이렇게 이어진다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| 제네릭 | **런타임 + 프레임워크 지원 필요** | 54.1, 55장, 57.4 |
| 널 가능 값 타입 | **런타임 + 프레임워크 지원 필요** | 54.6 |
| 메서드 그룹 변환 | 없음 (컴파일러 전용) | 56.6 |
| 익명 메서드 / 클로저 | 없음 | 63.9 |
| 반복자(`yield return`) | 없음 | 56.6, 63.9 |
| 부분 타입 | 없음 | 57.15 |
| 정적 클래스 | 없음 | — |
| 고정 크기 버퍼 | 없음 (`unsafe` 필요) | 60.8 |
| `[InternalsVisibleTo]` | 프레임워크 지원 필요(특성) | 52장 |

---

## 76.2 C# 3 — 암시적 타입, 객체/컬렉션 초기화자, 익명 타입, 람다, 확장 메서드, 쿼리 식

C# 3은 2007년 Visual Studio 2008과 함께 나왔다. **런타임은 그대로였다** — .NET Framework 3.5는 CLR 2.0 위에서 돌아갔고, C# 3의 모든 기능은 컴파일러 안에서 끝나거나 새 라이브러리 타입(식 트리, `System.Linq`)만 추가하면 되는 것들이었다. 이건 우연이 아니라 **설계 원칙의 전환점**이다. C# 2 이후 마이크로소프트는 런타임을 건드리지 않고 언어를 발전시키는 쪽을 강하게 선호했고, 이 원칙은 C# 8의 기본 인터페이스 멤버가 깨뜨릴 때까지 12년간 유지됐다.

### 어떤 문제가 있었는가

문제는 하나였다. **데이터를 조회하는 코드가 언어 밖에 있었다.**

```csharp
// C# 2 — SQL은 문자열, 컴파일러는 아무것도 모른다
string sql = "SELECT Id, Description FROM Products WHERE SalePrice <= Price / 2";
SqlCommand cmd = new SqlCommand(sql, conn);
using (SqlDataReader reader = cmd.ExecuteReader())
{
    while (reader.Read())
    {
        int id = (int) reader["Id"];              // 오타 나면 런타임 오류
        string desc = (string) reader["Description"];
    }
}
```

컬렉션을 다루는 코드도 마찬가지로 장황했다. `foreach` + `if` + `List.Add`의 삼중주가 곳곳에 있었다.

C# 3의 설계 목표는 **이 쿼리를 언어 안으로 들여오는 것**이었다. 그러려면 여섯 개의 하위 기능이 필요했고, 각각이 독립적으로도 유용하도록 설계됐다.

### 어떤 기능이 나왔는가

**자동 구현 프로퍼티.** 7줄이 1줄이 됐다.

```csharp
// C# 1~2
private string name;
public string Name { get { return name; } set { name = value; } }

// C# 3
public string Name { get; set; }
```

컴파일러는 `<Name>k__BackingField`라는 이름의 private 필드를 생성한다. 꺾쇠괄호가 들어간 이 이름은 **C#에서 쓸 수 없는 이름**이라 충돌하지 않는다. 이 "말할 수 없는 이름(unspeakable name)" 기법은 이후 반복자, 람다, async 상태 기계, 익명 타입에서 계속 재사용된다(56.6절).

**암시적 타입 지역 변수(`var`).**

```csharp
Dictionary<string, List<DateTime>> map1 = new Dictionary<string, List<DateTime>>();
var map2 = new Dictionary<string, List<DateTime>>();
```

> **⚠️ `var`는 `dynamic`이 아니다**
>
> `var`는 **정적 타입**이다. 컴파일러가 초기화 식에서 타입을 추론해서 그 자리에 박아 넣는다. IL에는 `var`의 흔적이 없다. C# 4의 `dynamic`은 완전히 다른 물건이며, 런타임 바인딩을 한다(59.5절). 이름이 비슷해서 혼동하는 사람이 있는데, `var`는 타이핑을 줄이고 `dynamic`은 타입 검사를 포기한다.

**객체 초기화자와 컬렉션 초기화자.** 여러 문장이 **하나의 식**이 됐다.

```csharp
var order = new Order
{
    OrderId = "xyz",
    Customer = new Customer { Name = "Jon", Address = "UK" },
    Items =
    {
        new OrderItem { ItemId = "abcd123", Quantity = 1 },
        new OrderItem { ItemId = "fghi456", Quantity = 2 }
    }
};
```

"하나의 식"이 중요한 이유가 있다. 식은 `select` 절 안에, 람다 본문 안에, 메서드 인수 자리에 들어갈 수 있다. 문장은 못 들어간다. LINQ의 `select new { ... }`가 가능하려면 객체 생성이 식이어야 했다.

**익명 타입.**

```csharp
var book = new { Title = "Lost in the Snow", Author = "Holly Webb" };
string title = book.Title;    // 이름과 타입 모두 컴파일러가 검사한다
```

컴파일러는 제네릭 클래스 하나를 생성한다. 같은 어셈블리 안에서 **프로퍼티 이름·타입·순서가 같은** 익명 타입 두 개는 같은 생성 클래스를 공유한다. `Equals`, `GetHashCode`, `ToString`이 자동 생성되고, 모든 프로퍼티는 읽기 전용이다.

한계도 분명하다. 익명 타입은 **이름이 없으므로** 메서드 매개변수나 반환 타입이 될 수 없다. 이 빈틈을 C# 7의 튜플이 부분적으로, C# 9의 레코드가 더 완전하게 메웠다.

**람다 식과 식 트리.**

```csharp
Func<int, int> square = x => x * x;                 // 델리게이트 — 실행 가능한 코드
Expression<Func<int, int>> tree = x => x * x;       // 식 트리 — 코드를 표현한 데이터
```

같은 문법이 대입 대상 타입에 따라 **완전히 다른 것**으로 컴파일된다. 첫 줄은 메서드를 만들고, 둘째 줄은 `ParameterExpression`, `BinaryExpression` 객체 그래프를 조립하는 코드를 만든다. 후자가 LINQ 공급자(Entity Framework 등)가 C# 코드를 SQL로 번역할 수 있는 이유다. 식 트리는 57.13절과 58.11절에서 리플렉션 대체 수단으로 다시 다뤘다.

**확장 메서드.**

```csharp
public static class StringExtensions
{
    public static string Truncate(this string value, int max) =>
        value.Length <= max ? value : value.Substring(0, max);
}

"긴 문자열입니다".Truncate(3);   // 인스턴스 메서드처럼 보이지만 정적 호출이다
```

IL 수준에서는 그냥 `call StringExtensions::Truncate(string, int32)`다. 컴파일러가 첫 인수를 앞으로 빼줄 뿐이다. 확장 메서드는 **인터페이스에 구현을 붙이는** 최초의 수단이었고, 이 문제를 정면으로 해결한 것이 12년 뒤 C# 8의 기본 인터페이스 멤버, 그리고 C# 14의 확장 멤버다.

> **⚠️ 확장 메서드는 null 인스턴스에서도 호출된다**
>
> ```csharp
> string? s = null;
> Console.WriteLine(s.Truncate(3));   // NullReferenceException? 아니다 — Truncate 안에서 터진다
> ```
>
> 정적 호출이므로 호출 자체는 성공한다. `value.Length`에서 예외가 난다. `s.IsNullOrEmpty()` 같은 확장 메서드를 만들어 null 검사를 우아하게 하는 관용구는 이 성질에 의존한다. 반대로, 스택 트레이스가 예상과 다른 위치를 가리키는 원인이 되기도 한다.

**쿼리 식.** 마지막 조각이다.

```csharp
var query = from p in products
            where p.Price > 100
            orderby p.Name
            select new { p.Id, p.Name };
```

컴파일러는 이것을 **C#에서 C#으로** 기계적으로 변환한다.

```csharp
var query = products
    .Where(p => p.Price > 100)
    .OrderBy(p => p.Name)
    .Select(p => new { p.Id, p.Name });
```

변환 규칙은 순전히 구문적이다. `Where`, `Select`, `OrderBy`가 무엇인지 컴파일러는 신경 쓰지 않는다 — 이름이 맞고 시그니처가 맞으면 된다. 그래서 `IEnumerable<T>`뿐 아니라 `IQueryable<T>`, `Task<T>`, 심지어 직접 만든 타입에도 쿼리 문법을 쓸 수 있다.

### 그것이 무엇을 바꿨는가

C# 3은 **C#을 부분적으로 함수형 언어로 만들었다.** 람다, 지연 평가, 불변 익명 타입, 파이프라인 조합 — 이 어휘가 C# 개발자의 표준 도구가 됐다.

부수 효과도 있다. LINQ는 **할당을 많이 한다.** 람다마다 델리게이트(캡처가 있으면 디스플레이 클래스까지), 연산자마다 열거자 객체, `ToList()`마다 배열 재할당. 63.9절의 "숨은 할당 카탈로그"에서 LINQ가 큰 항목을 차지하는 이유다. C# 3이 만든 편의성의 청구서가 ⑤번 축에서 날아온 셈이다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| 자동 구현 프로퍼티 | 없음 | 56.6 |
| 암시적 타입(`var`) / 암시적 타입 배열 | 없음 | 59.5 |
| 객체 / 컬렉션 초기화자 | 없음 | — |
| 익명 타입 | 없음 | 63.9 |
| 람다 식(델리게이트) | 없음 | 63.9 |
| 람다 식(식 트리) | **프레임워크 지원 필요**(`System.Linq.Expressions`) | 57.13, 58.11 |
| 확장 메서드 | **프레임워크 지원 필요**(`ExtensionAttribute`) | — |
| 쿼리 식 | 없음(패턴 기반) | 63.9 |
| 부분 메서드 | 없음 | 57.15 |

---

## 76.3 C# 4 — `dynamic`, 선택적 매개변수와 명명된 인수, 제네릭 가변성, COM 개선

C# 4는 2010년에 나왔다. C# 3이 "언어를 크게 바꾼 릴리스"였다면 C# 4는 **상호운용을 위한 릴리스**다. 기능 목록이 짧고, 그중 상당수가 COM을 겨냥한다.

### 어떤 문제가 있었는가

두 가지였다.

첫째, **동적인 것과 대화할 때 C#이 너무 뻣뻣했다.** Office COM 자동화, IronPython 스크립트, JSON 같은 느슨한 데이터 — 이런 것을 다룰 때 C# 3에서는 리플렉션을 손으로 써야 했다.

```csharp
// C# 3 — COM 객체 하나 다루는 데 이 정도
object excel = Activator.CreateInstance(Type.GetTypeFromProgID("Excel.Application")!);
excel.GetType().InvokeMember("Visible", BindingFlags.SetProperty, null, excel,
                             new object[] { true });
```

둘째, **`IEnumerable<Derived>`를 `IEnumerable<Base>`로 못 넘겼다.**

```csharp
List<Banana> bananas = GetBananas();
IEnumerable<Fruit> fruit = bananas;   // C# 3에서는 컴파일 오류
```

`IEnumerable<T>`는 `T`를 **내보내기만** 하므로 이 변환은 안전하다. 하지만 C# 3의 타입 시스템은 그 사실을 표현할 방법이 없었다.

### 어떤 기능이 나왔는가

**`dynamic`.** 컴파일러가 정적 바인딩을 **실행 시점으로 미루는** 정적 타입이다.

```csharp
dynamic excel = Activator.CreateInstance(Type.GetTypeFromProgID("Excel.Application")!);
excel.Visible = true;
excel.Workbooks.Add();
```

`dynamic`은 CLR 타입이 아니다. IL에서는 `object`이며, `[Dynamic]` 특성이 붙는다. 실제 동작은 컴파일러가 **호출 사이트(call site)** 객체를 만들고, 그 안에 바인딩 정보를 넣고, 런타임에 **동적 언어 런타임(DLR)** 이 실제 타입을 보고 바인딩한 뒤 결과를 캐시하는 방식이다.

```csharp
dynamic d = 5;
int result = d + 3;
```

이 두 줄이 컴파일되면 `CallSite<Func<CallSite, object, int, object>>` 필드와 `Binder.BinaryOperation(...)` 호출이 생긴다. 59.3절에서 IL 수준으로 해부했다.

> **⚠️ `dynamic`의 비용은 "약간 느린" 수준이 아니다**
>
> 첫 호출은 바인딩 로직을 통째로 돌린다. 캐시가 채워진 뒤에도 정적 호출 대비 수십 배 느리다. 게다가 호출 사이트 캐시 자체가 힙에 상주하는 객체다. 핫 패스에 `dynamic`이 있으면 프로파일러에서 `System.Dynamic.Runtime`이 상위에 뜬다. 59.10절 참조.

> **⚠️ `dynamic`은 확장 메서드를 찾지 못한다**
>
> ```csharp
> dynamic list = new List<int> { 1, 2, 3 };
> var evens = list.Where(x => x % 2 == 0);   // RuntimeBinderException
> ```
>
> 확장 메서드 해석은 `using` 지시문 집합에 의존하는데, 그 정보는 런타임에 남아 있지 않다. 마찬가지로 `dynamic`은 익명 타입의 프로퍼티(생성 타입이 `internal`이라)와 명시적 인터페이스 구현도 다루기 어렵다. 이 세 가지는 4판에서 명시적으로 "limitations and surprises"로 정리한 항목이다.

**선택적 매개변수와 명명된 인수.**

```csharp
public void Log(string message, LogLevel level = LogLevel.Info,
                bool timestamp = true, string? category = null) { }

Log("시작");
Log("오류", category: "Startup");   // 중간 매개변수를 건너뛴다
```

**제네릭 가변성.** `out`과 `in` 한정자가 인터페이스·델리게이트의 타입 매개변수에 붙었다.

```csharp
public interface IEnumerable<out T> : IEnumerable { }   // 공변(covariant)
public interface IComparer<in T> { }                     // 반공변(contravariant)

IEnumerable<Fruit> fruit = GetBananas();       // 이제 된다
IComparer<Banana> cmp = GetFruitComparer();    // 이것도 된다
```

`out T`는 "T는 출력 위치에만 나타난다", `in T`는 "T는 입력 위치에만 나타난다"는 뜻이다. 컴파일러가 이 규칙을 강제한다.

> **📌 가변성은 런타임 기능이 아니라 프레임워크 변경이었다**
>
> CLR은 처음부터 제네릭 가변성을 지원했다. C# 1~3이 그걸 표현할 문법이 없었을 뿐이다. C# 4가 한 일은 **문법을 추가하고, BCL의 기존 인터페이스·델리게이트 선언에 `in`/`out`을 붙인 것**이다. 그래서 `IEnumerable<out T>`의 혜택을 보려면 .NET 4 이상의 `mscorlib`이 필요하다 — 언어 버전만 올려서는 안 된다.

> **⚠️ 가변성은 참조 타입 인수에만 적용된다**
>
> ```csharp
> IEnumerable<int> ints = new List<int>();
> IEnumerable<object> objects = ints;   // 컴파일 오류
> ```
>
> `int`에서 `object`로 가려면 박싱이 필요하고, 박싱은 표현(representation)을 바꾸는 변환이다. 가변성은 **표현을 보존하는 참조 변환**에만 적용된다. 배열 공변성이 값 타입에 적용되지 않는 것과 같은 이유다.

**COM 개선.** 세 가지가 함께 들어갔다.

1. **PIA 링크(임베드된 상호 운용 형식)** — `<EmbedInteropTypes>true</EmbedInteropTypes>`. 필요한 타입만 어셈블리에 복사해 넣어서, 거대한 Primary Interop Assembly를 함께 배포하지 않아도 되게 만들었다.
2. **COM의 선택적 매개변수 특례** — `ref` 매개변수를 값으로 전달할 수 있게 되고, `Type.Missing` 도배가 사라졌다.
3. **명명된 인덱서** — COM 인터페이스가 노출하는 인덱서 프로퍼티에 접근.

이 결과 유명한 "Office 자동화 한 줄" 비교가 가능해졌다.

```csharp
// C# 3
excelApp.Cells.Range["A1", Type.Missing].Value2 = "Hello";
doc.SaveAs(fileName, ref missing, ref missing, ref missing, ref missing, /* ... 12개 더 ... */);

// C# 4
excelApp.Cells.Range["A1"].Value2 = "Hello";
doc.SaveAs(fileName);
```

60.12절에서 COM 상호운용 전반을 다뤘다.

### 그것이 무엇을 바꿨는가

`dynamic`은 **기대만큼 널리 쓰이지 않았다.** Skeet 자신도 4판에서 LINQ만큼 많은 개발자에게 영향을 주지는 못했다고 평가한다. 실제로 오늘날 `dynamic`은 COM 상호운용, 일부 직렬화 시나리오, 방문자 패턴 단순화(59.7절) 정도로 용도가 좁다.

반면 **선택적 매개변수는 API 설계 자체를 바꿨다.** 오버로드 10개를 만들던 자리에 매개변수 기본값 하나가 들어갔다. 그리고 이 편의성에는 **버전 관리 함정**이라는 대가가 붙었다.

> **⚠️ 선택적 매개변수의 기본값은 호출 지점에 박힌다**
>
> ```csharp
> // 라이브러리 v1
> public void Send(string msg, int retries = 3) { }
> ```
>
> 호출자가 `Send("hi")`라고 쓰면 컴파일러는 IL에 `Send("hi", 3)`을 넣는다. 라이브러리가 v2에서 기본값을 `5`로 바꿔도, **호출자를 다시 컴파일하기 전까지는 여전히 3이 전달된다.** 어셈블리를 교체만 하는 배포 시나리오에서 조용히 어긋난다. 78.13절의 바이너리 호환성 목록에 이 항목이 있다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| `dynamic` | **프레임워크 지원 필요**(DLR — 런타임이 아니라 라이브러리) | 59장 전체 |
| 선택적 매개변수 / 명명된 인수 | 없음 | 78.4 |
| 제네릭 가변성 | **프레임워크 변경 필요**(BCL 인터페이스 선언). 런타임 지원은 이미 존재 | — |
| PIA 링크(임베드된 상호 운용 형식) | **런타임 + 프레임워크 지원 필요** | 60.12 |
| COM 선택적 매개변수 특례 / 명명된 인덱서 | 없음(COM 전용) | 60.12 |

---

## 76.4 C# 5 — `async` / `await`, 호출자 정보 특성, `foreach` 변수 캡처 수정

C# 5는 2012년에 나왔다. 기능이 **세 개뿐**이다. 그리고 그중 하나가 언어의 무게 중심을 통째로 옮겼다.

### 어떤 문제가 있었는가

비동기 코드를 쓰면 **제어 흐름이 코드에서 사라진다.**

```csharp
// C# 4 — EAP 콜백 지옥
void LoadData()
{
    client.DownloadStringCompleted += (s, e) =>
    {
        if (e.Error != null) { ShowError(e.Error); return; }
        db.QueryCompleted += (s2, e2) =>
        {
            if (e2.Error != null) { ShowError(e2.Error); return; }
            label.Text = e2.Result.Count.ToString();   // UI 스레드인가? 확인해야 한다
        };
        db.QueryAsync(Parse(e.Result));
    };
    client.DownloadStringAsync(uri);
}
```

`try`/`catch`가 안 통하고, 루프 안의 비동기 호출은 재귀 콜백이 되고, 예외는 콜백 경계를 못 넘고, UI 스레드 복귀는 `Dispatcher.Invoke`로 직접 처리해야 한다. **동기 코드에서 공짜로 얻던 모든 것**을 잃는다.

### 어떤 기능이 나왔는가

**`async` / `await`.**

```csharp
async Task LoadDataAsync()
{
    try
    {
        string raw = await client.DownloadStringTaskAsync(uri);
        var parsed = Parse(raw);
        var rows = await db.QueryAsync(parsed);
        label.Text = rows.Count.ToString();   // UI 스레드로 자동 복귀
    }
    catch (Exception ex) { ShowError(ex); }
}
```

핵심은 두 가지다.

1. **async 메서드는 비동기 연산을 나타내는 결과를 만든다** — 보통 `Task` 또는 `Task<T>`. 개발자가 아무것도 안 해도 된다.
2. **async 메서드는 `await` 식으로 비동기 연산을 소비한다** — 아직 완료되지 않았으면 메서드가 **비동기적으로 일시 중지**하고, 완료되면 이어서 실행한다.

컴파일러는 반복자와 똑같은 전략을 쓴다. **상태 기계**다.

```csharp
// 컴파일러가 만드는 것의 골격 (개념)
[CompilerGenerated]
private struct <LoadDataAsync>d__0 : IAsyncStateMachine
{
    public int <>1__state;
    public AsyncTaskMethodBuilder <>t__builder;
    private TaskAwaiter<string> <>u__1;
    // 지역 변수가 필드로 승격된다
    public void MoveNext() { /* 거대한 switch */ }
    void IAsyncStateMachine.SetStateMachine(IAsyncStateMachine sm) { ... }
}
```

56.6절에서 실제 IL을, 63.9절에서 그 할당 비용을 다뤘다. 여기서 강조할 것은 **구조체로 생성된다**는 점이다. 메서드가 동기적으로 완료되면(모든 `await`가 이미 완료된 태스크였다면) 상태 기계는 스택에 머무르고 힙 할당이 아예 없다. 첫 번째 미완료 `await`를 만나야 비로소 박싱되어 힙으로 올라간다. 4판이 "state machine boxing dance"라고 부른 동작이다.

**동기화 컨텍스트.** `await`는 기본적으로 현재 `SynchronizationContext`(없으면 `TaskScheduler`)를 캡처하고, 완료 후 그 컨텍스트에서 이어서 실행한다. UI 스레드 복귀가 공짜인 이유이자, 데드락의 원인이다.

> **⚠️ 라이브러리 코드에서 `.Result` / `.Wait()`는 데드락을 만든다**
>
> UI 스레드나 옛 ASP.NET 요청 컨텍스트에서 `SomethingAsync().Result`를 호출하면, 그 스레드가 블록된 상태로 continuation이 같은 스레드에 스케줄되면서 영구히 멈춘다. 라이브러리에서는 `ConfigureAwait(false)`로 컨텍스트 캡처를 피하는 것이 표준 처방이다. ASP.NET Core에는 `SynchronizationContext`가 없어서 이 특정 데드락은 발생하지 않지만, **스레드 풀 기아**라는 다른 문제로 나타난다.

**호출자 정보 특성.**

```csharp
public static void Log(string message,
    [CallerFilePath] string file = "",
    [CallerLineNumber] int line = 0,
    [CallerMemberName] string member = "")
{
    Console.WriteLine($"{Path.GetFileName(file)}:{line} [{member}] {message}");
}
```

컴파일러가 **호출 지점에서** 리터럴을 채워 넣는다. 런타임 스택 워킹이 아니라 컴파일 타임 상수이므로 비용이 없다. 가장 흔한 용도는 `INotifyPropertyChanged` 구현이다.

```csharp
private string name = "";
public string Name
{
    get => name;
    set { name = value; OnPropertyChanged(); }   // "Name"이 자동으로 들어간다
}
private void OnPropertyChanged([CallerMemberName] string prop = "") =>
    PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(prop));
```

이 축은 C# 10의 `CallerArgumentExpression`으로 이어진다(76.9절).

> **📌 호출자 정보 특성은 옛 프레임워크에서도 쓸 수 있다**
>
> 특성 타입 자체는 `System.Runtime.CompilerServices` 아래에 있고, 컴파일러는 **이름으로** 찾는다. .NET 4.0을 대상으로 하더라도 같은 네임스페이스에 특성을 직접 선언하면 C# 5 컴파일러가 인식한다. 4판 7.2.5절이 이 기법을 설명한다. 이것이 76.14절에서 다룰 **폴리필 패턴의 원형**이다.

**`foreach` 변수 캡처 수정.** 이건 기능 추가가 아니라 **동작 변경**이다.

```csharp
var actions = new List<Action>();
foreach (var i in new[] { 1, 2, 3 })
    actions.Add(() => Console.Write(i));
foreach (var a in actions) a();
```

C# 4까지는 `333`이 출력됐다. 반복 변수가 루프 **바깥**에 한 번 선언된 것으로 취급됐고, 모든 람다가 같은 변수를 캡처했기 때문이다. C# 5부터 반복 변수는 **반복마다 새로 만들어진 것**으로 취급되어 `123`이 나온다.

> **⚠️ 이건 C#이 조용히 의미를 바꾼 몇 안 되는 사례다**
>
> C# 팀은 파괴적 변경을 극도로 꺼린다. 여기서 예외를 둔 이유는 "옛 동작에 의존하는 코드는 거의 확실히 버그였다"는 판단 때문이다. 다만 **`for` 루프의 변수는 여전히 하나만 존재한다.**
>
> ```csharp
> for (int i = 0; i < 3; i++) actions.Add(() => Console.Write(i));   // 여전히 333
> ```
>
> `foreach`와 `for`가 다르게 동작한다는 사실 자체가 함정이다. `for`에서는 루프 안에 지역 변수를 하나 더 두어 복사해야 한다.

### 그것이 무엇을 바꿨는가

`async`/`await`는 **API 설계 관습을 바꿨다.** `Task`를 반환하는 메서드에 `Async` 접미사를 붙이는 규칙, `CancellationToken`을 마지막 매개변수로 받는 규칙, `ConfigureAwait(false)`를 라이브러리에서 쓰는 규칙 — 모두 C# 5 이후에 자리 잡았다.

그리고 **성능 축에 새 부담을 얹었다.** `await` 하나마다 상태 기계, `Task` 객체, `MoveNext` 델리게이트, `ExecutionContext` 복사가 잠재적으로 발생한다. C# 7의 `ValueTask<T>`(69.2절), .NET Core의 `IValueTaskSource`, `[AsyncMethodBuilder]` 커스터마이즈, `PoolingAsyncValueTaskMethodBuilder`가 모두 이 부담을 덜기 위한 후속 작업이다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| `async` / `await` | **프레임워크 지원 필요**(`Task`, `AsyncTaskMethodBuilder` 등) | 56.6, 63.9, 69.2 |
| 호출자 정보 특성 | 프레임워크 지원 필요(특성 — 직접 선언 가능) | 76.14 |
| `foreach` 반복 변수 캡처 변경 | 없음 (동작 변경) | 63.9 |

---

## 76.5 C# 6 — 자동 프로퍼티 개선, 식 본문 멤버, 보간 문자열, `nameof`, 예외 필터, null 조건 연산자, `using static`

C# 6은 2015년에 나왔고, **Roslyn으로 다시 쓴 컴파일러의 첫 릴리스**다. 큰 기능 하나가 아니라 작은 기능 여러 개가 들어갔고, 그 합이 코드의 밀도를 눈에 띄게 바꿨다.

### 어떤 문제가 있었는가

C# 5까지의 코드에는 **아무 정보도 담지 않은 문법**이 잔뜩 있었다.

```csharp
// 불변 타입 하나 만드는 데 필요한 것
public class Point
{
    private readonly int x, y;
    public int X { get { return x; } }
    public int Y { get { return y; } }
    public Point(int x, int y) { this.x = x; this.y = y; }
    public double Magnitude { get { return Math.Sqrt(x * x + y * y); } }
    public override string ToString() { return string.Format("({0}, {1})", x, y); }
}
```

`get { return ...; }`에는 정보가 없다. 문자열 포매팅에서는 `{0}`과 실제 인수가 **떨어져 있어서** 순서가 어긋나면 런타임 예외가 났고, 멤버 이름을 문자열로 쓰면 리팩터링이 그 문자열을 놓쳤다.

### 어떤 기능이 나왔는가

**읽기 전용 자동 프로퍼티와 초기화자.**

```csharp
public class Point
{
    public int X { get; }              // 진짜 읽기 전용 — 백킹 필드가 readonly다
    public int Y { get; }
    public string Unit { get; } = "m"; // 초기화자
    public Point(int x, int y) => (X, Y) = (x, y);   // ※ 튜플 대입은 C# 7
}
```

C# 3의 `{ get; private set; }`은 클래스 내부에서 언제든 바꿀 수 있었다. C# 6의 `{ get; }`은 백킹 필드에 `initonly`(IL 수준의 `readonly`)가 붙어서 **생성자 안에서만** 대입할 수 있다.

**식 본문 멤버.**

```csharp
public double Magnitude => Math.Sqrt(X * X + Y * Y);
public int Count => list.Count;
public IEnumerator<string> GetEnumerator() => list.GetEnumerator();
public override string ToString() => $"({X}, {Y})";
```

C# 6은 메서드, 읽기 전용 프로퍼티, 인덱서, 연산자에만 허용했다. C# 7.0이 생성자, 종료자, 프로퍼티 접근자(get/set 각각)로 확장했다.

**보간 문자열.**

```csharp
throw new KeyNotFoundException($"No calendar system for ID {id} exists");
```

컴파일러의 처리가 **대입 대상 타입에 따라 달라진다.**

| 대상 타입 | C# 6~9의 컴파일 결과 | C# 10 이후 |
|---|---|---|
| `string` (보간 홀 있음) | `string.Format(...)` 호출 | `DefaultInterpolatedStringHandler` 사용(런타임이 지원하면) |
| `string` (홀 없음) | 그냥 상수 문자열 | 상수 문자열, `const`도 가능 |
| `FormattableString` | `FormattableStringFactory.Create(...)` | 동일 |
| `IFormattable` | `FormattableStringFactory.Create(...)` | 동일 |
| 핸들러 타입 | — | 핸들러의 `AppendLiteral`/`AppendFormatted` 호출 |

> **⚠️ 보간 문자열은 기본적으로 현재 문화권을 쓴다**
>
> `$"{price}"`는 `CurrentCulture`로 포매팅한다. 로그, 파일 이름, 직렬화 페이로드처럼 **기계가 읽을 문자열**에 쓰면 독일어 로케일에서 소수점이 쉼표로 바뀌어 파싱이 깨진다. 문화권 불변이 필요하면 `FormattableString.Invariant($"{price}")` 또는 `$"{price:F2}"`에 `CultureInfo.InvariantCulture`를 명시적으로 적용해야 한다. 79.4절 참조.

**`nameof`.**

```csharp
public void Process(string input)
{
    if (input is null) throw new ArgumentNullException(nameof(input));
}
```

컴파일 타임 상수 문자열로 치환된다. IL에는 `ldstr "input"`만 남는다. 리팩터링으로 매개변수 이름을 바꾸면 문자열도 따라 바뀐다.

> **📌 `nameof`는 마지막 조각만 준다**
>
> `nameof(System.Text.StringBuilder)`는 `"StringBuilder"`다. 전체 이름이 필요하면 `typeof(...).FullName`을 써야 한다. 그리고 `nameof(list.Count)`는 `"Count"`이지 `"list.Count"`가 아니다. 이 축은 C# 11의 확장된 `nameof` 범위(특성 안에서 매개변수 이름 참조)와 C# 14의 언바운드 제네릭 `nameof(List<>)`로 이어진다.

**null 조건 연산자 `?.`와 `?[]`.**

```csharp
int? length = customer?.Address?.Country?.Length;
PropertyChanged?.Invoke(this, args);   // 이벤트 발생의 표준 관용구가 됐다
```

`?.`는 **왼쪽을 한 번만 평가한다.** 이벤트 발생에서 이 성질이 결정적이다. C# 5까지는 지역 변수에 복사한 뒤 null 검사를 해야 스레드 경합을 피할 수 있었는데, `?.`가 그걸 자동으로 해준다.

> **⚠️ `?.` 뒤에 값 타입이 오면 결과가 널 가능이 된다**
>
> ```csharp
> if (list?.Count > 0) { }        // OK — int?와 int의 리프트된 비교
> if (list?.Count == 0) { }       // list가 null이면 false. 의도한 것인가?
> bool b = list?.Any();           // 컴파일 오류 — bool?이지 bool이 아니다
> ```
>
> `list?.Count > 0`은 `list`가 null일 때 `false`다. 리프트된 관계 연산자의 규칙(76.1절) 그대로다. `== 0` 비교는 특히 위험하다 — "비어 있다"를 뜻하려던 것인데 "null이 아니고 비어 있다"가 된다.

**예외 필터.**

```csharp
try { DoWork(); }
catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)
{
    await Task.Delay(backoff);
}
```

`when` 절은 IL의 `filter` 블록으로 컴파일된다. 이건 CLR이 1.0부터 지원했지만 C#에는 문법이 없었다(VB에는 있었다).

> **📌 예외 필터는 스택을 풀지 않고 평가된다**
>
> 예외 처리는 두 단계다. 1단계에서 런타임이 핸들러를 **찾고**, 2단계에서 스택을 **푼다**. 필터는 1단계에서 평가된다. 즉 필터 안에서 로깅하면 **예외가 발생한 지점의 스택이 그대로 살아 있는 상태**에서 덤프를 뜰 수 있다. `catch (Exception ex) when (Log(ex))` — `Log`가 항상 `false`를 반환하게 만들면 예외를 잡지 않으면서 로깅만 하는 관용구가 된다. 74장의 디버깅 기법에서 이 성질을 활용했다.

**`using static`과 초기화자 개선.**

```csharp
using static System.Math;
using static System.Console;

WriteLine(Sqrt(PI));

// 인덱서 초기화자
var dict = new Dictionary<string, int> { ["one"] = 1, ["two"] = 2 };

// 확장 Add 메서드를 쓰는 컬렉션 초기화자
public static void Add(this List<Point> list, int x, int y) => list.Add(new Point(x, y));
var points = new List<Point> { { 1, 2 }, { 3, 4 } };
```

**`catch`/`finally` 안의 `await`.** C# 5에서는 금지됐던 것이 컴파일러 구현 개선으로 풀렸다.

### 그것이 무엇을 바꿨는가

C# 6은 **파괴적 변경이 사실상 없는 릴리스**였다. 그래서 채택률이 매우 높았다. 옛 코드베이스에 C# 6을 켜는 것은 거의 위험이 없다.

그리고 이 릴리스가 **Roslyn 시대를 열었다.** 컴파일러가 공개 API를 가진 라이브러리가 되면서 분석기(analyzer), 코드 수정(code fix), 그리고 훗날 소스 생성기가 가능해졌다. 79.13절에서 다룬 `.editorconfig` 기반 관용구 강제가 이 인프라 위에 서 있다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| 읽기 전용 자동 프로퍼티 / 초기화자 | 없음 | — |
| 식 본문 멤버 | 없음 | 56.6 |
| 보간 문자열 | 없음. `FormattableString` 사용 시 프레임워크 지원 | 69.5, 79.4 |
| `nameof` | 없음 | — |
| null 조건 연산자 | 없음 | — |
| 예외 필터 | 없음(CLR `filter` 블록은 1.0부터 존재) | 74장 |
| `using static` | 없음 | — |
| 인덱서 초기화자 / 확장 `Add` | 없음 | — |
| `catch`/`finally`에서 `await` | 없음(컴파일러 구현 개선) | 56.6 |

---

## 76.6 C# 7.x — 튜플과 분해, 패턴 매칭, `ref` 지역/반환, `in`, `readonly struct`, `ref struct`, 지역 함수, `throw` 식

C# 7은 2017년에 나왔고, **C# 1 이후 처음으로 부 버전을 쓴 릴리스**다. C# 7.0, 7.1, 7.2, 7.3이 약 반년 간격으로 나왔다. 컴파일러가 NuGet 패키지로 배포되고 SDK가 자주 갱신되면서, "3년에 한 번 큰 릴리스"에서 "자주, 조금씩"으로 리듬이 바뀌었다.

### 어떤 문제가 있었는가

세 갈래였다.

**첫째, 여러 값을 반환할 방법이 없었다.** `out` 매개변수는 지저분하고, `Tuple<T1,T2>`는 참조 타입이라 할당이 생기고 `Item1`/`Item2`라는 이름이 아무 의미를 전달하지 못했다. 익명 타입은 메서드 밖으로 나갈 수 없었다.

**둘째, 타입에 따른 분기가 장황했다.**

```csharp
// C# 6
var circle = shape as Circle;
if (circle != null) { return Math.PI * circle.Radius * circle.Radius; }
var rect = shape as Rectangle;
if (rect != null) { return rect.Width * rect.Height; }
```

같은 것을 두 번 말한다 — `as Circle`과 `circle != null`.

**셋째, C#이 복사를 강제했다.** 큰 구조체를 매개변수로 넘기면 복사된다. 배열 원소에 대한 별칭을 만들 수 없어서 `array[i].Field = x`를 하려면 인덱싱을 반복해야 했다. `Span<T>` 같은 "스택에만 있어야 하는" 타입을 안전하게 표현할 문법이 없었다.

### 어떤 기능이 나왔는가

**튜플(C# 7.0), 추론된 요소 이름(7.1), `==`/`!=`(7.3).**

```csharp
public (int Min, int Max) FindRange(IEnumerable<int> values)
{
    int min = int.MaxValue, max = int.MinValue;
    foreach (int v in values) { if (v < min) min = v; if (v > max) max = v; }
    return (min, max);
}

var range = FindRange(data);
Console.WriteLine($"{range.Min}~{range.Max}");
```

CLR 표현은 `System.ValueTuple<int, int>` — **구조체**다. 힙 할당이 없다. 요소 이름은 `[TupleElementNames]` 특성으로 메타데이터에만 실린다. 즉 **런타임에는 이름이 없다.** 77.2절에서 이 처리를 자세히 다룬다.

```csharp
// 추론된 요소 이름 (C# 7.1)
var name = "Jon"; var age = 42;
var person = (name, age);        // (string name, int age)
Console.WriteLine(person.name);
```

**분해(deconstruction).**

```csharp
var (min, max) = FindRange(data);           // 새 변수로
(existingMin, existingMax) = FindRange(d2); // 기존 변수로

// 튜플이 아닌 타입도 Deconstruct 메서드만 있으면 된다
public readonly struct Point
{
    public int X { get; } public int Y { get; }
    public void Deconstruct(out int x, out int y) => (x, y) = (X, Y);
}
var (x, y) = new Point(3, 4);
```

`Deconstruct`는 **패턴 기반**이다. 인터페이스 구현이 아니라 이름과 시그니처만 맞으면 된다. 확장 메서드로도 제공할 수 있다.

**패턴 매칭(C# 7.0).** 상수 패턴, 타입 패턴, `var` 패턴 세 가지가 들어왔다.

```csharp
if (shape is Circle c) return Math.PI * c.Radius * c.Radius;

switch (shape)
{
    case Circle c when c.Radius > 100: return double.PositiveInfinity;
    case Circle c: return Math.PI * c.Radius * c.Radius;
    case Rectangle r: return r.Width * r.Height;
    case null: throw new ArgumentNullException(nameof(shape));
    default: throw new NotSupportedException();
}
```

> **⚠️ 패턴 기반 `switch`는 위에서 아래로 평가된다**
>
> C# 6까지의 `switch`는 레이블이 상수여야 했고 순서가 의미 없었다(컴파일러가 점프 테이블이나 해시 조회로 바꿨다). 패턴이 들어오면서 **순서가 의미를 갖게 됐다.** 위 예제에서 `case Circle c`를 `case Circle c when c.Radius > 100`보다 앞에 두면 후자는 도달 불가가 된다. 컴파일러가 일부 경우를 잡아주지만 전부는 아니다. 그리고 `default`는 어디에 써도 **항상 마지막에** 평가된다. 77.13절 참조.

**`ref` 지역 변수와 `ref` 반환(C# 7.0).**

```csharp
static ref int Find(int[] array, int value)
{
    for (int i = 0; i < array.Length; i++)
        if (array[i] == value) return ref array[i];
    throw new KeyNotFoundException();
}

int[] data = { 1, 2, 3 };
ref int slot = ref Find(data, 2);
slot = 20;                 // data는 이제 { 1, 20, 3 }
```

`slot`은 복사본이 아니라 **별칭**이다. IL 수준에서는 관리 포인터(`int32&`)이고, 68.12절에서 그 표현을 다뤘다.

**`in` 매개변수, `readonly struct`, `ref readonly` 반환(C# 7.2).**

```csharp
public readonly struct Matrix4x4 { /* 64바이트 */ }

// 복사 없이 전달 — 읽기 전용 참조
public static float Determinant(in Matrix4x4 m) { ... }
```

> **⚠️ `readonly`가 아닌 구조체에 `in`을 쓰면 오히려 느려진다**
>
> 컴파일러는 `in` 매개변수의 멤버를 호출할 때, 그 구조체가 `readonly`가 아니면 **방어적 복사(defensive copy)** 를 만든다. 호출된 멤버가 구조체를 변경할 수 있기 때문이다. 결과적으로 복사를 피하려고 `in`을 썼는데 멤버 접근마다 복사가 생긴다. 규칙은 단순하다 — **`in`은 `readonly struct`와 함께만 쓴다.** 69.1절에서 다뤘다.

> **⚠️ `in` 매개변수는 불변이 아니다 (외부 변경 가능)**
>
> `in`은 "이 메서드가 이 매개변수를 통해 쓰지 않는다"는 뜻이지 "값이 안 바뀐다"는 뜻이 아니다. 같은 저장 위치를 가리키는 다른 별칭이 있으면, 메서드 실행 도중에 값이 바뀔 수 있다. 4판 13.3.2절이 이 "surprising mutability"를 구체적 예제로 보여준다. 멀티스레드 코드에서 `in` 매개변수의 값을 두 번 읽고 같기를 기대하면 안 된다.

**`ref struct`(C# 7.2).** "이 타입은 절대 힙에 올라가지 않는다"를 컴파일러가 강제한다.

```csharp
public ref struct MySpan<T>
{
    // 필드로 가질 수 없음, 박싱 불가, 배열 원소 불가,
    // 반복자/async 메서드의 지역 변수 불가, 람다 캡처 불가
}
```

`Span<T>`가 바로 이 규칙 위에 서 있다. 제약의 전체 목록은 68.1절에 있다.

**지역 함수(C# 7.0).**

```csharp
public static IEnumerable<string> ReadLines(string path)
{
    if (path is null) throw new ArgumentNullException(nameof(path));  // 즉시 실행된다
    return Iterate();

    IEnumerable<string> Iterate()      // 지역 반복자
    {
        using var reader = File.OpenText(path);
        string? line;
        while ((line = reader.ReadLine()) != null) yield return line;
    }
}
```

76.1절에서 본 반복자 인수 검증 문제의 정석 해법이다. 람다와 달리 지역 함수는 **캡처가 없으면 델리게이트도 디스플레이 클래스도 만들지 않는다** — 컴파일러가 `private static` 메서드로 낮춘다. 캡처가 있으면 `ref struct` 형태의 클로저를 만들어 `ref`로 전달하므로 힙 할당도 피한다. 63.9절에서 람다 대비 이점으로 다뤘다.

**나머지 소소한 기능들.**

```csharp
// out 변수 (7.0)
if (int.TryParse(s, out int value)) { Use(value); }

// 버림(discard) (7.0)
if (int.TryParse(s, out _)) { }
var (_, max) = FindRange(data);

// 숫자 리터럴 개선 (7.0), 밑줄 위치 완화 (7.2)
int flags = 0b1010_0101;
long big  = 1_000_000_000;
int hex   = 0x_FF_FF;          // 7.2부터 접두사 바로 뒤에도 밑줄 허용

// throw 식 (7.0)
public string Name
{
    get => name;
    set => name = value ?? throw new ArgumentNullException(nameof(value));
}
private string name = null ?? throw new InvalidOperationException();

// default 리터럴 (7.1)
int x = default;                          // default(int) 대신
void M(CancellationToken ct = default) { }

// async Main (7.1)
static async Task<int> Main(string[] args) { await ...; return 0; }

// 후행이 아닌 명명된 인수 (7.2)
DrawRect(x: 0, 0, width: 100, 50);        // 위치 인수와 섞을 수 있게 됐다

// private protected (7.2) — "같은 어셈블리의 파생 클래스만"
private protected int internalState;
```

**C# 7.3의 마무리 작업들.** 대부분 성능·상호운용 관련이다.

| C# 7.3 기능 | 내용 |
|---|---|
| `fixed` 없이 고정 크기 버퍼 접근 | `unsafe` 코드의 고정 버퍼 필드에 직접 인덱싱 |
| `ref` 지역 변수 재대입 | `ref x = ref y;` — 별칭을 바꿀 수 있게 됐다 |
| `stackalloc` 초기화자 | `Span<int> s = stackalloc int[] { 1, 2, 3 };` |
| 패턴 기반 `fixed` | `GetPinnableReference()`를 가진 타입이면 `fixed`에 쓸 수 있다 |
| 제네릭 제약 `unmanaged`, `Enum`, `Delegate` | `where T : unmanaged` — blittable 제약 |
| 튜플의 `==` / `!=` | 요소별 비교 |
| 자동 프로퍼티 백킹 필드에 특성 | `[field: NonSerialized]` |
| 초기화자에서 패턴·`out` 변수 사용 | 필드/프로퍼티/생성자 초기화자에서도 허용 |

`where T : unmanaged`는 68장과 71장(벡터화)에서 실질적으로 쓰인다. `Span<T>`, `MemoryMarshal.Cast<TFrom, TTo>` 같은 API의 제약이 바로 이것이다.

### 그것이 무엇을 바꿨는가

C# 7은 **⑤번 성능 축을 정식으로 열었다.** `Span<T>`는 C# 7.2의 `ref struct` 없이는 안전하게 만들 수 없었다. 그리고 `Span<T>`가 생기면서 .NET의 I/O, 파싱, 문자열 처리 API가 전부 다시 설계됐다 — `Utf8Parser`, `IBufferWriter<T>`, `System.IO.Pipelines`, `string.Create`. 68장과 69장 전체가 이 흐름의 결과물이다.

또 하나, **부 버전이라는 리듬이 정착했다.** C# 7.1의 기능을 쓰려면 `<LangVersion>7.1</LangVersion>`을 명시해야 했고, 이때부터 "언어 버전은 프로젝트 설정"이라는 인식이 개발자에게 생겼다. 76.13절의 표가 필요해진 시점이 여기다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| 튜플 | **프레임워크 지원 필요**(`System.ValueTuple`. NuGet 패키지로 보강 가능) | 77.1~77.5 |
| 분해(`Deconstruct`) | C# 7.2 컴파일러 이전에는 `ValueTuple` 필요 | 77.6 |
| 패턴 매칭(상수/타입/`var`) | 없음 | 77.7~77.9 |
| `ref` 지역 / `ref` 반환 | 없음 | 68.12 |
| `in` 매개변수 | `IsReadOnlyAttribute` 필요 — **컴파일러가 없으면 생성해 넣는다** | 69.1 |
| `readonly struct` | 위와 동일 | 69.1 |
| `ref readonly` 반환 | `InAttribute` 필요(.NET 1.1부터 존재) | 68.12 |
| `ref struct` | `IsByRefLikeAttribute` 필요 — 컴파일러가 생성. 추가로 `[Obsolete]`가 붙어 구형 컴파일러가 사용을 막는다 | 68.1 |
| `stackalloc`을 `Span<T>`에 대입 | **프레임워크 지원 필요**(`Span<T>`) | 68.9 |
| 지역 함수 | 없음 | 63.9 |
| `out` 변수 / 버림 / `throw` 식 / 숫자 리터럴 | 없음 | — |
| 커스텀 태스크 타입 반환 | **프레임워크 지원 필요**(`AsyncMethodBuilderAttribute`) | 69.2 |
| `where T : unmanaged` | `UnmanagedType` 열거형 필요(.NET 1.1 / .NET Standard 1.1부터) | 68장, 71장 |

---

## 76.7 C# 8 — 널 가능 참조 타입, `switch` 식, 범위/인덱스, 기본 인터페이스 멤버, 비동기 스트림, `using` 선언

C# 8은 2019년에 .NET Core 3.0과 함께 나왔다. 그리고 여기서 **중요한 선이 그어졌다.**

> **⚠️ C# 8은 .NET Framework에서 온전히 쓸 수 없다**
>
> C# 8의 여러 기능이 .NET Core 3.0 / .NET Standard 2.1 이상의 런타임·프레임워크를 요구한다. `<LangVersion>8.0</LangVersion>`을 net472 프로젝트에 넣으면 컴파일은 되지만 기본 인터페이스 멤버, 비동기 스트림, 인덱스/범위, `ref struct`의 패턴 기반 `Dispose` 같은 기능은 쓸 수 없거나 폴리필이 필요하다. Microsoft는 이 조합을 **공식 지원하지 않는다.** .NET Framework는 C# 7.3에서 멈춰 있다고 보는 것이 안전하다. 76.13절에서 상세히 다룬다.

### 어떤 문제가 있었는가

**null이 20년 된 문제였다.** C# 2가 값 타입의 널 가능성을 표현할 수 있게 만들었지만, 참조 타입은 여전히 **항상 널 가능**이었다.

| | 널 가능 | 널 불가능 |
|---|---|---|
| **참조 타입** (C# 7까지) | 암시적 — 기본값 | **표현 불가** |
| **값 타입** (C# 2 이후) | `Nullable<T>` 또는 `?` 접미사 | 기본값 |

격자의 오른쪽 위 칸이 비어 있었다. 그래서 `string Method(string x, string y)`라는 시그니처를 봐도 `x`가 null이어도 되는지, 반환값이 null일 수 있는지 알 방법이 없었다. 문서로 적어도 컴파일러는 읽지 못했다.

두 번째 문제는 **`switch` 문이 식이 아니라는 것**이었다. 값을 계산해서 반환하는 분기를 쓰려면 임시 변수와 `break`가 필요했다.

세 번째는 **부분 열거의 부재**였다. `array[2..5]`를 표현할 문법이 없어서 `Skip(2).Take(3)`이나 `Array.Copy`를 써야 했고, 둘 다 할당을 만들었다.

### 어떤 기능이 나왔는가

**널 가능 참조 타입(NRT).** 참조 타입의 기본 의미가 **널 불가능**으로 바뀐다.

```csharp
#nullable enable

public class Customer
{
    public string Name { get; set; }        // null이면 안 된다
    public Address? Address { get; set; }   // null일 수 있다
    public Customer(string name) => Name = name;
}

void Print(Customer c)
{
    Console.WriteLine(c.Address.Country);   // CS8602: null 역참조 가능성
}
```

> **⚠️ NRT는 런타임에 아무것도 하지 않는다**
>
> CLR에는 널 가능 참조 타입이라는 개념이 없다. `string`과 `string?`은 **같은 CLR 타입**이다. 널 가능성은 `[Nullable]`, `[NullableContext]` 특성으로 메타데이터에만 기록되고, 컴파일러의 흐름 분석이 그걸 읽어 **경고**를 낸다. 경고일 뿐 오류가 아니다.
>
> 결과적으로 **방어적 프로그래밍은 여전히 필요하다.** 공개 API의 인수 검증을 `#nullable enable`로 대체할 수 없다. 호출자가 C# 7 프로젝트일 수도, 경고를 무시했을 수도, 리플렉션으로 호출했을 수도 있다. 4판 15.1.4절이 이 점을 못 박는다.

컴파일러는 **타입만 보는 게 아니라 흐름을 추적한다.**

```csharp
Address? address = customer.Address;
if (address != null)
{
    Console.WriteLine(address.Country);   // 경고 없음 — 흐름 분석이 null이 아님을 안다
}

if (customer.Address != null)
{
    Console.WriteLine(customer.Address.Country);   // 프로퍼티도 추적한다
}
```

두 번째 형태는 놀랍다. 컴파일러는 "같은 값에 같은 프로퍼티를 두 번 접근하면 결과가 같다"고 **가정한다.** 다른 스레드가 그 사이에 `Address`를 바꾸면 가정이 깨진다. 이건 알려진 한계이며 의도적인 실용적 타협이다.

**`!` 연산자(null 용인 연산자).**

```csharp
string s = MaybeNull()!;   // "내가 컴파일러보다 잘 안다"
```

> **⚠️ `!`는 무엇도 검사하지 않는다**
>
> `!`는 런타임 검사가 아니다. IL에 아무 코드도 생성하지 않는다. 순전히 컴파일러에게 "조용히 해"라고 말하는 것이다. 코드 리뷰에서 `!`가 늘어나면 NRT의 가치가 사라진다. 정말 필요한 자리는 (1) 컴파일러보다 더 많은 정보를 가진 경우, (2) 널 가능 상태를 테스트하는 테스트 코드 정도다.

**`switch` 식.**

```csharp
public static Quadrant GetQuadrant(Point point) => point switch
{
    (0, 0)                         => Quadrant.Origin,
    var (x, y) when x > 0 && y > 0 => Quadrant.One,
    var (x, y) when x < 0 && y > 0 => Quadrant.Two,
    var (x, y) when x < 0 && y < 0 => Quadrant.Three,
    var (x, y) when x > 0 && y < 0 => Quadrant.Four,
    _                              => Quadrant.OnBorder
};
```

문법의 차이가 세 가지다. `switch`가 피연산자 **뒤에** 온다. `case`/`break` 대신 `=>`와 `,`를 쓴다. `default` 대신 `_`(버림 패턴)를 쓴다.

그리고 중요한 것 — **컴파일러가 완전성(exhaustiveness)을 검사한다.** 모든 입력을 처리하지 못하면 경고가 나고, 실행 중 어느 팔도 맞지 않으면 `SwitchExpressionException`이 던져진다. 77.14절 참조.

**재귀 패턴.** 속성 패턴, 위치 패턴, 타입 생략이 함께 들어왔다.

```csharp
// 속성 패턴
static bool IsLondonBased(Customer c) => c is { Address: { City: "London" } };

// 위치 패턴 (Deconstruct 필요)
static string Describe(Point p) => p switch
{
    (0, 0) => "원점",
    (var x, 0) => $"x축 {x}",
    (0, var y) => $"y축 {y}",
    _ => "일반"
};
```

**인덱스와 범위.**

```csharp
int[] data = { 0, 1, 2, 3, 4, 5 };
int last = data[^1];              // 5 — Index 타입
int[] middle = data[2..5];        // { 2, 3, 4 } — Range 타입
Span<int> slice = data.AsSpan()[2..];   // 할당 없는 슬라이싱
```

`^1`은 `new Index(1, fromEnd: true)`이고, `2..5`는 `new Range(2, 5)`다. 컴파일러는 **패턴 기반**으로 동작한다 — 타입에 `Length`/`Count`와 `Slice(int, int)`(또는 `Range`를 받는 인덱서)가 있으면 범위 문법을 쓸 수 있다. 68.4절에서 `Span<T>` 슬라이싱과 함께 다뤘다.

> **⚠️ 배열에 범위를 쓰면 새 배열이 할당된다**
>
> `data[2..5]`는 **복사본**이다. `data.AsSpan()[2..]`는 복사가 아니다. `string`의 `s[2..5]`도 새 문자열을 만든다 — `s.AsSpan()[2..5]`가 할당 없는 버전이다. 문법이 같아 보여서 놓치기 쉽다. 63.9절과 69.5절 참조.

**기본 인터페이스 멤버(DIM).**

```csharp
public interface ILogger
{
    void Log(LogLevel level, string message);

    // 기본 구현 — 기존 구현체를 깨지 않고 인터페이스를 확장할 수 있다
    void LogInfo(string message) => Log(LogLevel.Info, message);
}
```

> **⚠️ 기본 인터페이스 멤버는 런타임 지원이 필요하다**
>
> 이건 C# 3 이후 **처음으로 CLR을 바꿔야 했던 언어 기능**이다. 인터페이스에 메서드 본문(IL)을 담고, 가상 디스패치 규칙을 바꿔야 했다. .NET Framework의 CLR은 이 변경을 받지 않았다. 따라서 `net472`나 `netstandard2.0`을 대상으로는 **컴파일 자체가 안 된다.** `<LangVersion>`을 아무리 올려도 안 된다.
>
> 또 하나 — 기본 구현은 **인터페이스로 캐스팅해야만** 호출된다.
> ```csharp
> class MyLogger : ILogger { public void Log(LogLevel l, string m) { } }
> var logger = new MyLogger();
> logger.LogInfo("hi");            // 컴파일 오류 — 클래스에는 그 멤버가 없다
> ((ILogger)logger).LogInfo("hi"); // OK
> ```
> Java의 default method와 다르게 동작하는 지점이며, 이 때문에 DIM은 실무에서 드물게 쓰인다. 주 용도는 **인터페이스 버전 관리**다(78.13절).

**비동기 스트림.**

```csharp
public static async IAsyncEnumerable<City> ListCitiesAsync(
    [EnumeratorCancellation] CancellationToken ct = default)
{
    string? pageToken = null;
    do
    {
        var response = await service.ListCitiesAsync(pageToken, ct);
        foreach (var city in response.Cities) yield return city;
        pageToken = response.NextPageToken;
    } while (pageToken != null);
}

await foreach (var city in ListCitiesAsync(token))
    Console.WriteLine(city.Name);
```

반복자(C# 2)와 async(C# 5)가 마침내 합쳐졌다. 컴파일러가 만드는 상태 기계는 **동기 모드와 비동기 모드를 오간다** — `await` 없이 연속으로 `yield return`할 때는 동기 경로로 돌아 태스크 할당을 피한다.

**나머지.**

```csharp
// using 선언 — 중첩 깊이가 줄어든다
static async Task CopyAsync(string src, string dst)
{
    using var input = File.OpenRead(src);
    using var output = File.Create(dst);
    await input.CopyToAsync(output);
}   // 여기서 역순으로 Dispose

// await using — IAsyncDisposable
await using var conn = new SqlConnection(cs);

// null 병합 대입
list ??= new List<int>();

// 정적 지역 함수 — 캡처를 금지해서 실수를 막는다
static int Square(int x) => x * x;

// 구조체 멤버의 readonly 한정자 — 방어적 복사 억제
public readonly struct Vector
{
    public double X { get; } public double Y { get; }
    public readonly double Length() => Math.Sqrt(X * X + Y * Y);
}

// 중첩 식에서의 stackalloc
Span<char> buffer = stackalloc char[16];
int idx = "hello".AsSpan().IndexOfAny(stackalloc char[] { 'l', 'o' });

// 비관리 생성 타입 — where T : unmanaged가 제네릭 구조체에도 적용
struct Pair<T> where T : unmanaged { public T A, B; }   // Pair<int>는 unmanaged다
```

### 그것이 무엇을 바꿨는가

C# 8은 **.NET Framework와 .NET(Core)의 언어적 결별을 확정했다.** 이 시점 이후 두 플랫폼은 같은 언어를 쓰지 않는다. 76.14절에서 다룰 멀티 타깃 고통의 대부분이 여기서 시작된다.

NRT는 **BCL 전체의 시그니처를 다시 표기하게 만들었다.** .NET 5부터 BCL은 완전히 어노테이션되어 있고, 그 덕에 `Dictionary.TryGetValue`의 `out` 매개변수가 `[MaybeNullWhen(false)]`로 표시되는 식의 정밀한 계약이 가능해졌다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| 널 가능 참조 타입 | 특성 필요(컴파일러가 생성). 어노테이션된 BCL은 .NET 5+ | 21.6~21.9 |
| `switch` 식 | 없음(`SwitchExpressionException`은 .NET Core 3.0+) | 77.12, 77.14 |
| 재귀 패턴(속성/위치) | 없음 | 77.9, 77.10 |
| 인덱스와 범위 | **프레임워크 지원 필요**(`System.Index`, `System.Range`. 직접 선언하면 폴리필 가능) | 68.4 |
| 기본 인터페이스 멤버 | **런타임 지원 필요** — .NET Core 3.0 / .NET Standard 2.1 이상. 폴리필 불가 | 78.13 |
| 비동기 스트림 | **프레임워크 지원 필요**(`IAsyncEnumerable<T>`. `Microsoft.Bcl.AsyncInterfaces`로 보강) | 63.9 |
| `await using` / `IAsyncDisposable` | 위와 동일 | — |
| `using` 선언 | 없음 | 56.6 |
| `??=` | 없음 | — |
| 정적 지역 함수 | 없음 | 63.9 |
| 구조체 멤버 `readonly` | `IsReadOnlyAttribute`(컴파일러 생성) | 69.1 |
| 중첩 식 `stackalloc` | `Span<T>` 필요 | 68.9 |

---

## 76.8 C# 9 ※ — 레코드, `init`, 최상위 문, 패턴 개선, 공변 반환, `static` 람다, 대상 타입 지정 `new`

> **📌 이 절부터는 저자 보강이다**
>
> 4판(C# in Depth)은 C# 8 프리뷰에서 서술이 끝난다. 15.6절이 "아직 프리뷰에 없는 기능"으로 예고한 **레코드 타입**과 **대상 타입 지정 `new`** 는 C# 9로, **타입 클래스(형태·개념)** 는 형태를 바꿔 C# 11의 정적 추상 인터페이스 멤버로, **extension everything**은 C# 14의 확장 멤버로 나왔다. 76.8절부터 76.12절까지는 원천 도서 밖의 내용이며 각 절 제목에 `※`를 붙였다.

C# 9는 2020년 11월에 .NET 5와 함께 나왔다. .NET Framework와 .NET Core의 통합 브랜드가 시작된 릴리스다.

### 어떤 문제가 있었는가

**불변 데이터 타입을 만드는 비용이 여전히 컸다.** C# 8까지의 코드로 값 의미론을 가진 불변 타입을 하나 만들면 이렇게 된다.

```csharp
public sealed class Point : IEquatable<Point>
{
    public int X { get; }
    public int Y { get; }
    public Point(int x, int y) { X = x; Y = y; }
    public Point WithX(int x) => new Point(x, Y);
    public Point WithY(int y) => new Point(X, y);
    public bool Equals(Point? other) => other is not null && X == other.X && Y == other.Y;
    public override bool Equals(object? obj) => Equals(obj as Point);
    public override int GetHashCode() => HashCode.Combine(X, Y);
    public static bool operator ==(Point? l, Point? r) => Equals(l, r);
    public static bool operator !=(Point? l, Point? r) => !Equals(l, r);
    public override string ToString() => $"Point {{ X = {X}, Y = {Y} }}";
    public void Deconstruct(out int x, out int y) => (x, y) = (X, Y);
}
```

프로퍼티 두 개를 표현하는 데 15줄이다. 그리고 프로퍼티를 하나 추가할 때마다 여섯 군데를 고쳐야 한다. 하나라도 빠뜨리면 조용히 깨진다.

두 번째 문제 — **불변성과 객체 초기화자가 양립하지 않았다.** `{ get; }`으로 만들면 생성자만 쓸 수 있고, 객체 초기화자를 쓰려면 `set`을 열어야 했다.

### 어떤 기능이 나왔는가

**`init` 접근자.**

```csharp
public class Point
{
    public int X { get; init; }
    public int Y { get; init; }
}

var p = new Point { X = 3, Y = 4 };   // 객체 초기화자 OK
// p.X = 5;                            // 컴파일 오류 — 생성 이후에는 못 바꾼다
```

`init`은 "객체 초기화 단계에서만 호출 가능한 setter"다. IL 수준에서는 평범한 `set_X` 메서드에 **반환 타입 수정자** `modreq(System.Runtime.CompilerServices.IsExternalInit)` 이 붙는다. 이 수정자를 이해하지 못하는 컴파일러는 그 setter를 호출하지 못한다.

> **⚠️ `IsExternalInit` — 폴리필이 필요한 대표 사례**
>
> `IsExternalInit`은 .NET 5부터 BCL에 있다. `netstandard2.0`이나 `net472`를 대상으로 `init`이나 `record`를 쓰면 **CS0518: 미리 정의된 형식 `System.Runtime.CompilerServices.IsExternalInit`을 정의하지 않았거나 가져오지 않았습니다** 오류가 난다. 컴파일러가 자동 생성해 주지 **않는다.**
>
> 해결책은 직접 선언하는 것이다.
> ```csharp
> #if !NET5_0_OR_GREATER
> namespace System.Runtime.CompilerServices
> {
>     internal static class IsExternalInit { }
> }
> #endif
> ```
> 이게 76.14절에서 다룰 폴리필의 가장 유명한 예다.

**레코드.**

```csharp
public record Point(int X, int Y);
```

한 줄이 앞의 20줄을 대체한다. 컴파일러가 생성하는 것은 다음과 같다.

| 생성되는 멤버 | 내용 |
|---|---|
| 주 생성자 | `Point(int X, int Y)` |
| `init` 프로퍼티 | `public int X { get; init; }` 등 |
| `Equals` / `GetHashCode` | 모든 인스턴스 필드 기반의 값 동등성 |
| `==` / `!=` 연산자 | `Equals` 위임 |
| `ToString()` | `Point { X = 3, Y = 4 }` |
| `Deconstruct` | 위치 매개변수가 있을 때 |
| `protected` 복사 생성자 | `with` 식이 사용 |
| `EqualityContract` 프로퍼티 | 파생 레코드와의 정확한 타입 비교 |
| `<Clone>$` 메서드 | "말할 수 없는 이름" — `with` 식의 실제 구현 |

**`with` 식.**

```csharp
var p1 = new Point(3, 4);
var p2 = p1 with { Y = 10 };   // Point { X = 3, Y = 10 }
```

`with`는 복사 생성자를 호출해 새 인스턴스를 만든 뒤 지정된 프로퍼티만 `init` setter로 덮어쓴다. 4판이 예고한 `With(X: 10, Y: 20)` 메서드 형태 대신 이 문법만 채택됐다.

> **⚠️ 레코드의 동등성은 "정확한 런타임 타입"까지 본다**
>
> ```csharp
> public record Person(string Name);
> public record Employee(string Name, string Dept) : Person(Name);
>
> Person a = new Person("Jon");
> Person b = new Employee("Jon", "Dev");
> Console.WriteLine(a == b);   // False — Name은 같지만 EqualityContract가 다르다
> ```
> `EqualityContract`가 이걸 담당한다. 클래스에서 `Equals`를 손으로 쓸 때 흔히 저지르는 대칭성 위반을 레코드는 구조적으로 피한다.

> **⚠️ 레코드는 얕은 불변이다**
>
> ```csharp
> public record Order(string Id, List<string> Items);
> var o1 = new Order("A", new List<string> { "x" });
> var o2 = o1 with { Id = "B" };
> o2.Items.Add("y");
> Console.WriteLine(o1.Items.Count);   // 2 — 같은 리스트를 공유한다
> ```
> `with`는 얕은 복사다. 그리고 컴파일러가 생성한 `GetHashCode`는 `List<string>`의 참조 해시를 쓰므로, 리스트 내용이 바뀌어도 해시가 안 바뀐다(그 반대도 문제). **가변 컬렉션을 레코드 멤버로 두면 값 의미론이 거짓말이 된다.** 불변 컬렉션(`ImmutableArray<T>`)을 쓰거나 동등성을 직접 재정의해야 한다.

**최상위 문(top-level statements).**

```csharp
// Program.cs 전체
using System;

Console.WriteLine("Hello");
await Task.Delay(100);
return 0;
```

컴파일러가 `<Main>$`라는 이름의 진입점 메서드를 생성한다. `args`가 암시적으로 사용 가능하고, `await`가 있으면 자동으로 `async Task<int>` 진입점이 된다. 프로젝트당 하나의 파일에서만 쓸 수 있다.

**패턴 개선.** 세 가지가 함께 들어갔다.

```csharp
// 관계 패턴
static string Classify(int t) => t switch
{
    < 0    => "영하",
    0      => "빙점",
    < 15   => "쌀쌀",
    < 25   => "쾌적",
    _      => "더움"
};

// 논리 패턴 — and / or / not
static bool IsLetter(char c) => c is >= 'a' and <= 'z' or >= 'A' and <= 'Z';
if (obj is not null) { }
if (obj is not Circle) { }

// 타입 패턴 (지정자 없이 타입만)
static bool IsShape(object o) => o is Circle or Rectangle;
```

`is not null`은 `!= null`과 미묘하게 다르다 — `!=` 연산자가 오버로드되어 있어도 `is not null`은 **참조 비교**를 한다. 77.8절에서 다룬다.

**성능·상호운용 기능들.**

```csharp
// 네이티브 크기 정수
nint offset = 4;       // 32비트에서 4바이트, 64비트에서 8바이트
nuint size  = 1024;

// 함수 포인터 (unsafe)
unsafe
{
    delegate*<int, int, int> add = &Add;
    int r = add(2, 3);
}

// 모듈 초기화자 — 어셈블리의 첫 사용 시 한 번 실행
[ModuleInitializer]
internal static void Init() { /* ... */ }

// 지역 변수 0 초기화 생략
[module: SkipLocalsInit]
```

함수 포인터는 60.11절에서, `[SkipLocalsInit]`은 69.8절에서 다뤘다. 함수 포인터의 IL은 `calli` 명령이며, 델리게이트 인스턴스 할당과 가상 호출이 모두 사라진다.

**공변 반환 타입.**

```csharp
public abstract class Animal { public abstract Animal Reproduce(); }
public class Cat : Animal { public override Cat Reproduce() => new Cat(); }
```

> **⚠️ 공변 반환은 런타임 지원이 필요하다**
>
> 오버라이드의 반환 타입이 기반 메서드와 정확히 같아야 한다는 것은 **CLR의 규칙**이었다. C# 9가 이를 풀려면 런타임 변경이 필요했고, 실제로 .NET 5에서 `PreserveBaseOverridesAttribute`와 함께 도입됐다. `netstandard2.0`이나 .NET Framework를 대상으로는 **쓸 수 없다.** 폴리필도 불가능하다.

**나머지 편의 기능들.**

```csharp
// 대상 타입 지정 new
private Dictionary<string, List<DateTime>> map = new();
private readonly List<int> buffer = new(capacity: 64);

// 대상 타입 지정 조건식
int? x = flag ? 1 : null;         // C# 8에서는 컴파일 오류였다

// 정적 람다 — 캡처를 컴파일러가 금지한다
Func<int, int> f = static x => x * 2;

// 람다 버림 매개변수
handler = (_, _) => Console.WriteLine("이벤트");

// 확장 GetEnumerator로 foreach — 타입을 고치지 않고 열거 가능하게 만든다
public static IEnumerator<int> GetEnumerator(this Range r)
{
    for (int i = r.Start.Value; i < r.End.Value; i++) yield return i;
}
// 이 확장이 보이는 범위에서:  foreach (int i in 1..5) { ... }

// 지역 함수에 특성
[Conditional("DEBUG")] static void Trace(string m) { }

// 확장된 부분 메서드 — 반환 타입/접근 한정자/out 허용 (소스 생성기용)
public partial class C { public partial int Compute(string s); }
```

정적 람다는 성능 축과 직결된다. `static`을 붙이면 **의도치 않은 캡처가 컴파일 오류**가 되어, 캐시 가능한 델리게이트가 매 호출 재할당되는 사고를 막는다. 63.9절에서 다룬 클로저 할당 문제의 예방책이다.

### 그것이 무엇을 바꿨는가

레코드는 **DTO 계층의 표준 표현**이 됐다. API 요청/응답 모델, 이벤트 페이로드, 값 객체 — 이전에 클래스 20줄이던 것이 한 줄이 됐다. 그리고 이 변화가 함수형 스타일(불변 + `with` 변환)을 실무 코드로 밀어 넣었다.

최상위 문은 **입문 장벽을 낮췄고**, 동시에 .NET 6의 최소 API(minimal API)를 문법적으로 가능하게 만들었다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| `init` 접근자 | **`IsExternalInit` 필요** — 컴파일러가 생성하지 않음. 직접 선언하거나 .NET 5+ | 76.14 |
| 레코드 | 위와 동일 | 77.5 |
| 최상위 문 | 없음 | — |
| 관계 / 논리 / 타입 패턴 | 없음 | 77.8 |
| 대상 타입 지정 `new` / 조건식 | 없음 | — |
| 정적 람다 / 람다 버림 | 없음 | 63.9 |
| 네이티브 크기 정수(`nint`) | 없음 | 60.7 |
| 함수 포인터 `delegate*` | 기본 형태는 IL(`calli`)만 사용. `[UnmanagedCallersOnly]`와 `CallConv*` 타입은 **.NET 5+** | 60.11 |
| 모듈 초기화자 | `ModuleInitializerAttribute` 필요(직접 선언 가능) | — |
| `[SkipLocalsInit]` | `SkipLocalsInitAttribute` 필요(직접 선언 가능) | 69.8 |
| 공변 반환 타입 | **런타임 지원 필요 — .NET 5+. 폴리필 불가** | 54.1 |
| 확장된 부분 메서드 | 없음 | 57.15 |

---

## 76.9 C# 10 ※ — `record struct`, `global using`, 파일 범위 네임스페이스, 보간 핸들러, 구조체 개선

C# 10은 2021년 11월에 .NET 6과 함께 나왔다. C# 9가 큰 기능을 던졌다면 C# 10은 **그 기능들의 빈 구석을 메운** 릴리스다.

### 어떤 문제가 있었는가

**레코드는 클래스뿐이었다.** 작고 불변인 값 타입에 레코드를 쓰면 힙에 올라갔고, 구조체를 쓰면 `Equals`/`GetHashCode`를 손으로 써야 했다 — 기본 구현이 리플렉션 기반이라 매우 느렸다(54.6절). **모든 파일 위에 같은 `using` 열 줄이 반복됐고**, 네임스페이스 선언 하나가 파일 전체를 한 단계 들여쓰게 만들었다. 그리고 **보간 문자열이 항상 문자열을 만들었다** — 로깅에서 특히 낭비였다.

```csharp
logger.LogDebug($"처리 완료: {ComputeExpensiveDetails()}");
```

`LogDebug`가 꺼져 있어도 보간 문자열은 이미 만들어진 뒤다. `ComputeExpensiveDetails()`가 실행되고, `string.Format`이 호출되고, 문자열이 할당된다.

### 어떤 기능이 나왔는가

**`record struct`와 `readonly record struct`.**

```csharp
public readonly record struct Point(int X, int Y);
```

값 타입이면서 값 동등성, `with` 식, `Deconstruct`, `ToString`을 모두 갖는다. 그리고 **컴파일러가 필드별 비교 코드를 생성**하므로 `ValueType.Equals`의 리플렉션 경로를 타지 않는다.

```csharp
// record struct가 생성하는 Equals의 실질적 형태
public readonly bool Equals(Point other) => X == other.X && Y == other.Y;
```

| | `record class` | `record struct` | `readonly record struct` |
|---|---|---|---|
| 저장 위치 | 힙 | 인라인/스택 | 인라인/스택 |
| 위치 매개변수의 기본 접근자 | `init` | `get; set;` | `get; init;` |
| `with` 식 | 복사 생성자 | 값 복사 | 값 복사 |
| 상속 | 가능 | 불가 | 불가 |
| `EqualityContract` | 있음 | 없음 | 없음 |

> **⚠️ `record struct`의 위치 프로퍼티는 기본이 가변이다**
>
> `public record struct Point(int X, int Y);`는 `{ get; set; }`을 만든다. `record class`가 `init`을 만드는 것과 다르다. 값 타입을 딕셔너리 키로 쓰다가 내용을 바꾸면 조회가 깨진다. **거의 항상 `readonly record struct`를 써야 한다.**

**구조체의 매개변수 없는 생성자와 필드 초기화자.**

```csharp
public struct Config
{
    public int Retries { get; init; } = 3;
    public Config() { }          // C# 10부터 허용
}
```

> **⚠️ `default(T)`와 배열은 매개변수 없는 생성자를 호출하지 않는다**
>
> ```csharp
> var a = new Config();       // Retries == 3
> var b = default(Config);    // Retries == 0  ← 생성자를 안 부른다
> var arr = new Config[3];    // 모두 0
> ```
> CLR은 값 타입의 기본값을 **0으로 채운 메모리**로 정의한다. 그 정의는 C# 10이 바꿀 수 없다. 그래서 이 기능은 "쓸 수 있게 됐지만 믿으면 안 되는" 부류에 속한다. `Nullable<T>`의 기본값, 제네릭 `default(T)`, 배열 할당, `Activator.CreateInstance<T>()` 등에서 동작이 갈린다.

**보간 문자열 핸들러.**

```csharp
[InterpolatedStringHandler]
public ref struct LogInterpolatedStringHandler
{
    private DefaultInterpolatedStringHandler inner;
    private readonly bool enabled;

    public LogInterpolatedStringHandler(int literalLength, int formattedCount,
                                        Logger logger, out bool handlerIsValid)
    {
        enabled = logger.IsEnabled;
        handlerIsValid = enabled;
        inner = enabled ? new DefaultInterpolatedStringHandler(literalLength, formattedCount)
                        : default;
    }
    public void AppendLiteral(string s) { if (enabled) inner.AppendLiteral(s); }
    public void AppendFormatted<T>(T value) { if (enabled) inner.AppendFormatted(value); }
    public string ToStringAndClear() => enabled ? inner.ToStringAndClear() : "";
}

public void LogDebug([InterpolatedStringHandlerArgument("")] ref LogInterpolatedStringHandler h)
{
    if (IsEnabled) Console.WriteLine(h.ToStringAndClear());
}
```

`handlerIsValid`가 `false`면 **컴파일러가 생성한 코드가 보간 홀 평가를 통째로 건너뛴다.** 로깅이 꺼져 있으면 `ComputeExpensiveDetails()`가 아예 호출되지 않는다. 69.5절에서 문자열 할당 제거 관점으로 다뤘다.

동시에, 이 기능이 **평범한 보간 문자열의 컴파일 결과도 바꿨다.** C# 10 이후 `string s = $"{a}{b}";`는 `string.Format` 대신 `DefaultInterpolatedStringHandler`(내부적으로 `ArrayPool<char>` 사용)를 쓴다 — 그 타입이 있는 런타임에서만. 없으면 예전처럼 `string.Format`이다.

> **⚠️ 같은 소스가 TFM에 따라 다른 IL이 된다**
>
> 이건 76.13절에서 강조할 요점의 실례다. `net6.0`과 `netstandard2.0`을 멀티 타깃하면 똑같은 `$"..."` 한 줄이 두 개의 다른 코드로 컴파일된다. 성능 측정 결과가 TFM마다 다른 것이 정상이며, 이런 차이를 모르면 벤치마크를 잘못 해석한다(67장).

**`global using`과 암시적 `using`.**

```csharp
// GlobalUsings.cs
global using System;
global using System.Collections.Generic;
global using System.Linq;
global using MyMap = System.Collections.Generic.Dictionary<string, List<int>>;
```

`.csproj`의 `<ImplicitUsings>enable</ImplicitUsings>`는 SDK가 프로젝트 종류에 맞는 `global using` 집합을 자동으로 넣어준다. 콘솔/라이브러리는 `System`, `System.Linq` 등이고 웹 SDK는 더 많다.

**파일 범위 네임스페이스.**

```csharp
namespace MyCompany.MyProduct;   // 세미콜론. 파일 전체가 이 네임스페이스다.

public class Widget { }
```

들여쓰기 한 단계가 사라진다. 파일당 하나만 쓸 수 있다.

**나머지.**

```csharp
// 확장 프로퍼티 패턴 — 중첩을 점으로
if (customer is { Address.City: "London" }) { }
// C# 9까지는  { Address: { City: "London" } }

// 상수 보간 문자열
const string Host = "example.com";
const string Url = $"https://{Host}/api";   // 모든 홀이 const string이면 가능

// 람다 개선 — 자연 타입, 반환 타입 명시, 특성
var parse = (string s) => int.Parse(s);   // Func<string,int>로 추론된다
var trim  = [Obsolete] (string s) => s.Trim();   // 람다에 특성을 붙일 수 있다
Delegate d = (int x) => x;                // 자연 타입이 있으므로 Delegate에 대입 가능

// 분해에서 선언과 대입 혼용
int x = 0;
(x, int y) = (1, 2);      // C# 9까지는 전부 선언이거나 전부 대입이어야 했다

// record의 ToString을 sealed로
public record Point(int X, int Y) { public sealed override string ToString() => "pt"; }

// AsyncMethodBuilder를 메서드 단위로
[AsyncMethodBuilder(typeof(PoolingAsyncValueTaskMethodBuilder<>))]
public async ValueTask<int> ComputeAsync() { ... }

// CallerArgumentExpression
public static void Require(bool condition,
    [CallerArgumentExpression(nameof(condition))] string? expr = null)
{
    if (!condition) throw new ArgumentException($"조건 실패: {expr}");
}
Require(count > 0);   // 메시지: "조건 실패: count > 0"
```

`CallerArgumentExpression`은 C# 5 호출자 정보 특성 축의 직계 후손이다. BCL의 `ArgumentNullException.ThrowIfNull`(.NET 6+)이 이걸로 구현돼 있다.

### 그것이 무엇을 바꿨는가

C# 10은 **파일 상단의 잡음을 없앴다.** `global using` + 파일 범위 네임스페이스 + 암시적 `using`의 조합으로, 새 파일이 `namespace X;`와 클래스 선언만으로 시작하게 됐다.

그리고 보간 핸들러는 **성능 축과 간결성 축이 처음으로 협력한 사례**다. 이전까지 두 축은 대체로 서로를 방해했다. 보간 핸들러는 문법을 전혀 바꾸지 않으면서 할당을 없앤다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| `record struct` | `IsExternalInit`(`readonly` 버전) | 77.5 |
| 구조체 매개변수 없는 생성자 / 필드 초기화자 | 없음 | 54.4 |
| 보간 문자열 핸들러 | 특성은 직접 선언 가능. `DefaultInterpolatedStringHandler`는 **.NET 6+** | 69.5 |
| `global using` | 없음 | — |
| 파일 범위 네임스페이스 | 없음 | — |
| 확장 프로퍼티 패턴 | 없음 | 77.9 |
| 상수 보간 문자열 | 없음 | — |
| 람다 개선(자연 타입 등) | 없음 | 63.9 |
| `CallerArgumentExpression` | 특성 필요. .NET Framework에는 없으므로 직접 선언 | 76.14 |
| 메서드 단위 `[AsyncMethodBuilder]` | 프레임워크 지원 필요 | 69.2 |

---

## 76.10 C# 11 ※ — 원시 문자열, 정적 추상 멤버(제네릭 수학), `required`, `ref` 필드, 목록 패턴, UTF-8 리터럴

C# 11은 2022년 11월에 .NET 7과 함께 나왔다. 이 릴리스에는 **C# 3 이후 가장 근본적인 타입 시스템 확장**이 들어 있다.

### 어떤 문제가 있었는가

**제네릭으로 산술 코드를 쓸 수 없었다.**

```csharp
// 이걸 어떻게 쓰는가?
public static T Sum<T>(IEnumerable<T> values)
{
    T total = ???;              // 0을 어떻게 얻는가
    foreach (T v in values) total = total + v;   // + 연산자를 어떻게 제약하는가
    return total;
}
```

20년 동안 답이 없었다. 우회책은 `dynamic`(느림), 식 트리 컴파일(복잡), 또는 `int`/`long`/`double`용 오버로드를 손으로 쓰는 것(중복)이었다. 4판 15.6.3절이 "타입 클래스(형태, 개념)"라는 이름으로 예고한 문제가 바로 이것이다.

**JSON, SQL, 정규식을 소스에 넣기가 고통스러웠다.**

```csharp
string json = "{\r\n  \"name\": \"Jon\",\r\n  \"tags\": [\"a\", \"b\"]\r\n}";
string json2 = @"{
  ""name"": ""Jon""
}";   // 축자 문자열도 따옴표를 두 번 써야 한다
```

**객체 초기화자와 필수 프로퍼티가 양립하지 않았다.** `init` 프로퍼티는 설정을 **허용**할 뿐 **요구**하지 못했고, 요구하려면 생성자를 써야 해서 객체 초기화자의 편의를 잃었다. 그리고 **`ref` 필드가 없어서 `Span<T>`를 C#으로 쓸 수 없었다** — "관리 포인터 + 길이"를 필드로 가질 방법이 없어 런타임이 `Span<T>`를 내부 마법으로 구현하고 있었다(68.2절, 68.3절의 "fast span").

### 어떤 기능이 나왔는가

**정적 추상·가상 인터페이스 멤버.**

```csharp
public interface IAdditionOperators<TSelf, TOther, TResult>
    where TSelf : IAdditionOperators<TSelf, TOther, TResult>?
{
    static abstract TResult operator +(TSelf left, TOther right);   // 정적 추상 연산자
}

public interface IAdditiveIdentity<TSelf, TResult>
    where TSelf : IAdditiveIdentity<TSelf, TResult>?
{
    static abstract TResult AdditiveIdentity { get; }               // 정적 추상 프로퍼티
}
```

이 위에 BCL의 `System.Numerics.INumber<T>` 계층이 세워졌다. 그래서 이제 이렇게 쓸 수 있다.

```csharp
public static T Sum<T>(IEnumerable<T> values) where T : INumber<T>
{
    T total = T.Zero;                      // 인터페이스의 정적 프로퍼티
    foreach (T v in values) total += v;    // 인터페이스가 제약한 연산자
    return total;
}

Console.WriteLine(Sum(new[] { 1, 2, 3 }));           // 6 (int)
Console.WriteLine(Sum(new[] { 1.5, 2.5 }));          // 4 (double)
Console.WriteLine(Sum(new[] { 1m, 2m }));            // 3 (decimal)
```

`T.Zero`라는 문법 — **타입 매개변수에 정적 멤버 접근** — 이 C# 11의 새 문법이다. 호출은 제약 조건을 통한 **제약 호출(constrained call)** 로 컴파일되며, 값 타입에 대해서는 JIT이 인스턴스마다 특수화해 직접 호출로 낮춘다. 57.9절에서 리플렉션으로 이런 멤버를 호출하는 방법을 다뤘고, 55.5절의 역가상화가 성능에 직결된다.

> **⚠️ 정적 추상 인터페이스 멤버는 런타임 지원이 필요하다**
>
> 인터페이스의 정적 멤버를 가상 디스패치하려면 CLR의 인터페이스 맵(54.1절)이 정적 슬롯을 다뤄야 한다. .NET 7에서 추가된 기능이다. `net6.0` 이하 또는 `netstandard2.0`을 대상으로는 **선언 자체가 불가능하다.** `<LangVersion>11.0</LangVersion>`으로도 해결되지 않는다.

**`required` 멤버.**

```csharp
public class Person
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public int Age { get; init; }
}

var p = new Person { FirstName = "Jon", LastName = "Skeet" };   // OK
// var q = new Person { FirstName = "Jon" };                    // CS9035: LastName 필요
```

생성자로 강제하는 것과 달리 **객체 초기화자를 유지하면서** 필수 여부를 표현한다. 생성자로 모두 채우는 경우에는 `[SetsRequiredMembers]`로 검사를 면제한다.

> **⚠️ `required`는 컴파일 타임 검사일 뿐이다**
>
> `Activator.CreateInstance<Person>()`이나 역직렬화 경로는 이 검사를 통과하지 않는다. NRT와 마찬가지로 **런타임에는 강제되지 않는다.** 다만 `RequiredMemberAttribute` + `CompilerFeatureRequiredAttribute` 조합 덕분에, C# 11을 이해하지 못하는 구형 컴파일러는 그 타입을 **아예 사용하지 못한다** — 조용히 잘못 쓰이는 것보다는 낫다는 설계다.

**`ref` 필드와 `scoped`.**

```csharp
public readonly ref struct MySpan<T>
{
    private readonly ref T reference;    // C# 11부터 가능
    private readonly int length;

    public ref T this[int index] => ref Unsafe.Add(ref reference, index);
}

// scoped — 이 참조는 현재 메서드 밖으로 나가지 않는다
static void Fill(scoped Span<int> buffer, int value) { ... }
```

`Span<T>`가 이제 **평범한 C#으로 표현 가능한 타입**이 됐다. 68.11절에서 자세히 다뤘다. 그리고 C# 11은 `ref` 안전성 규칙을 전면 개정했다 — 어셈블리에 `RefSafetyRulesAttribute`가 붙어 "이 어셈블리는 어느 버전의 규칙으로 컴파일됐는가"를 기록한다.

> **⚠️ `ref` 필드는 런타임 지원이 필요하다**
>
> GC가 `ref` 필드를 담은 `ByRefLike` 구조체를 올바르게 추적해야 한다. .NET 7 이상에서만 선언할 수 있다.

**원시 문자열 리터럴.**

```csharp
string json = """
    {
      "name": "Jon",
      "tags": ["a", "b"]
    }
    """;

// 보간도 가능. $ 개수가 중괄호 개수를 정한다
string sql = $$"""
    SELECT * FROM {{tableName}} WHERE json_col->>'$.k' = 'v'
    """;
```

규칙은 이렇다. 따옴표 세 개 이상으로 시작하고 같은 개수로 끝난다. 여는 따옴표 뒤와 닫는 따옴표 앞은 줄바꿈이어야 한다(한 줄 형태 제외). **닫는 따옴표의 들여쓰기가 기준**이 되어 모든 줄에서 그만큼 제거된다. 이스케이프가 없으므로 `\n`은 백슬래시와 n 두 글자다.

**목록 패턴과 슬라이스 패턴.**

```csharp
static string Describe(int[] a) => a switch
{
    []              => "빈 배열",
    [var single]    => $"원소 하나: {single}",
    [1, 2, ..]      => "1, 2로 시작",
    [.., var last]  => $"마지막: {last}",
    [var first, .. var middle, var last2] => $"{first}..{last2}, 가운데 {middle.Length}개",
};
```

77.11절에서 다룬다. `..`(슬라이스 패턴)에 변수를 붙이려면 타입이 `Slice(int, int)`를 지원해야 한다.

**UTF-8 문자열 리터럴.**

```csharp
ReadOnlySpan<byte> contentType = "application/json"u8;
```

컴파일 타임에 UTF-8 바이트 배열로 인코딩되어 어셈블리 데이터 섹션에 박힌다. 런타임 인코딩 변환도 할당도 없다. 69.7절에서 다룬 UTF-8 직접 처리의 언어 지원이다.

> **📌 `u8` 리터럴의 타입은 `ReadOnlySpan<byte>`다**
>
> `byte[]`가 아니다. `ref struct`이므로 필드에 담을 수 없다. 정적 필드로 캐시하고 싶으면 `static ReadOnlySpan<byte> Json => "application/json"u8;` 처럼 프로퍼티로 만들어야 한다 — JIT이 이 패턴을 인식해 데이터 섹션을 직접 가리키는 스팬을 만든다.

**나머지.**

```csharp
// 제네릭 특성
public class TypeConverterAttribute<T> : Attribute { }
[TypeConverter<PointConverter>] public class Point { }

// 파일 로컬 타입 — 소스 생성기의 이름 충돌 방지용
file class InternalHelper { }

// 자동 기본값 구조체 — 생성자가 모든 필드를 채우지 않아도 된다
public struct S
{
    public int X;
    public int Y;
    public S(int x) { X = x; }   // C# 10까지는 CS0171 오류. C# 11부터 Y는 0으로 초기화된다
}

// 문자열 보간의 홀 안에서 줄바꿈 허용
var msg = $"{people
    .Where(p => p.Active)
    .Count()}명";

// 확장된 nameof 범위 — 특성에서 매개변수 이름 참조
public void M([NotNullIfNotNull(nameof(input))] string? input) { }

// 부호 없는 오른쪽 시프트
int x = -8 >>> 1;

// 상수 문자열에 대한 Span<char> 패턴 매칭
static bool IsGet(ReadOnlySpan<char> s) => s is "GET";
```

**메서드 그룹 변환 캐싱.** C# 11부터 `Foo(SomeMethod)` 형태의 메서드 그룹 → 델리게이트 변환 결과를 컴파일러가 **캐시한다.** 이전에는 호출할 때마다 새 델리게이트가 할당됐다. 63.9절의 숨은 할당 항목 하나가 조용히 사라진 것이다.

> **⚠️ 취소된 기능 — 매개변수 null 검사 `!!`**
>
> C# 11 프리뷰에는 `void M(string s!!) { }` 문법이 있었다. `!!`가 붙은 매개변수에 대해 컴파일러가 `ArgumentNullException` 던지는 코드를 메서드 앞에 자동 삽입하는 기능이다. 커뮤니티의 강한 반발(문법이 눈에 안 띈다, 검증 정책을 언어가 강제한다, `!` 연산자와 혼동된다) 이후 **정식 릴리스 전에 제거됐다.** 지금도 인터넷에는 이 문법을 소개하는 글이 남아 있으니 주의하라. 대체 수단은 `ArgumentNullException.ThrowIfNull(s)`(.NET 6+)이다.

### 그것이 무엇을 바꿨는가

정적 추상 인터페이스 멤버는 **BCL 수준의 변화**를 낳았다. `INumber<T>`, `IParsable<T>`, `ISpanFormattable`, `IUtf8SpanParsable<T>` 계층이 생기면서, 이전에는 불가능했던 제네릭 수치 알고리즘 라이브러리가 가능해졌다. 71장(벡터화)의 `Vector<T>` 기반 코드와 조합되면 타입별 중복이 사라진다.

`ref` 필드는 **런타임의 특권을 언어로 내려보낸 사건**이다. `Span<T>`가 더 이상 "런타임이 특별 취급하는 마법 타입"이 아니게 됐다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| 정적 추상·가상 인터페이스 멤버 | **런타임 지원 필요 — .NET 7+. 폴리필 불가** | 57.9 |
| 제네릭 수학(`INumber<T>` 등) | **.NET 7+ BCL** | 71장 |
| `required` 멤버 | `RequiredMemberAttribute`, `CompilerFeatureRequiredAttribute` 필요 — 직접 선언 필요 | — |
| `ref` 필드 / `scoped` | **런타임 지원 필요 — .NET 7+** | 68.11 |
| 원시 문자열 리터럴 | 없음 | — |
| 목록 / 슬라이스 패턴 | 없음(슬라이스 변수 바인딩은 `Slice` 필요) | 77.11 |
| UTF-8 문자열 리터럴 | **`ReadOnlySpan<byte>` 필요** | 69.7 |
| 제네릭 특성 | **런타임 지원 필요 — .NET 7+** | 57.11 |
| 파일 로컬 타입(`file`) | 없음 | 57.15 |
| 확장된 `nameof` 범위 | 없음 | — |
| `>>>` 연산자 | 없음 | — |
| 메서드 그룹 변환 캐싱 | 없음(컴파일러 최적화) | 63.9 |
| ~~매개변수 null 검사 `!!`~~ | **취소됨 — 릴리스되지 않음** | — |

---

## 76.11 C# 12 ※ — 기본 생성자, 컬렉션 식, 인라인 배열, 모든 타입 별칭, 람다 기본값

C# 12는 2023년 11월에 .NET 8과 함께 나왔다. C# 11이 타입 시스템을 확장했다면 C# 12는 **문법의 일관성을 정리한** 릴리스다.

### 어떤 문제가 있었는가

**컬렉션을 만드는 문법이 타입마다 달랐다.**

```csharp
int[] a = new int[] { 1, 2, 3 };
int[] b = { 1, 2, 3 };                             // 선언 자리에서만
List<int> c = new List<int> { 1, 2, 3 };
Span<int> d = stackalloc int[] { 1, 2, 3 };
ImmutableArray<int> e = ImmutableArray.Create(1, 2, 3);
ReadOnlySpan<int> f = new[] { 1, 2, 3 };           // 힙 할당이 생긴다
```

여섯 가지 방법이 있고 각각 제약이 다르다. 그리고 이어 붙이기(`concat`)는 별도 API를 찾아야 한다.

**레코드에만 주 생성자가 있었다** — 일반 클래스에서 생성자 매개변수를 필드에 옮겨 담는 코드는 여전히 손으로 써야 했다. 그리고 **`using` 별칭이 이름 있는 타입만 받았다** — `using Point = (int x, int y);`가 불가능했다.

### 어떤 기능이 나왔는가

**기본 생성자(primary constructor) — 모든 클래스와 구조체.**

```csharp
public class OrderService(IRepository repo, ILogger<OrderService> logger)
{
    public async Task<Order> GetAsync(int id)
    {
        logger.LogDebug("주문 {Id} 조회", id);   // 매개변수를 멤버 본문에서 직접 쓴다
        return await repo.FindAsync(id);
    }
}
```

의존성 주입 코드의 보일러플레이트가 거의 사라진다. 컴파일러는 **실제로 캡처된 매개변수에 대해서만** private 필드를 생성한다.

> **⚠️ 클래스의 기본 생성자는 레코드의 그것과 다르다**
>
> | | `record` | `class` / `struct` |
> |---|---|---|
> | 프로퍼티 생성 | 위치 매개변수마다 public 프로퍼티 | **생성하지 않음** |
> | `Deconstruct` | 생성 | 생성하지 않음 |
> | 필드 | 프로퍼티의 백킹 필드 | 캡처된 매개변수만, private |
> | 매개변수 가변성 | (프로퍼티는 `init`) | **매개변수를 대입할 수 있다** |
>
> 마지막 항목이 함정이다. `public class C(int x) { public void M() => x++; }`가 컴파일된다. 캡처된 매개변수는 사실상 가변 필드다. 불변을 원하면 `private readonly int x = x;`로 명시적으로 옮겨야 한다.

> **⚠️ 기본 생성자 매개변수와 프로퍼티를 같이 쓰면 필드가 두 개 생긴다**
>
> ```csharp
> public class Person(string name)
> {
>     public string Name { get; } = name;
>     public string Upper => name.ToUpperInvariant();   // 매개변수를 또 캡처한다
> }
> ```
> `Name`의 백킹 필드와 캡처된 `name` 필드가 **둘 다** 만들어진다. 값이 같으니 동작은 맞지만 객체가 커진다. 프로퍼티로 옮겼으면 이후에는 프로퍼티만 써야 한다. 분석기 규칙(IDE0290 계열)이 일부를 잡아준다.

**컬렉션 식.**

```csharp
int[] a           = [1, 2, 3];
List<int> b       = [1, 2, 3];
Span<int> c       = [1, 2, 3];              // 스택에 할당된다
ReadOnlySpan<int> d = [1, 2, 3];            // 상수면 데이터 섹션을 직접 가리킨다
ImmutableArray<int> e = [1, 2, 3];
int[][] jagged    = [[1, 2], [3, 4]];

// 스프레드 연산자
int[] head = [1, 2];
int[] tail = [5, 6];
int[] all  = [..head, 3, 4, ..tail];        // 1,2,3,4,5,6
```

컴파일러는 **대상 타입에 따라 다른 코드를 만든다.** 배열이면 배열 초기화, `List<T>`면 용량을 미리 잡은 생성 + `Add`, `ReadOnlySpan<T>`이면 (모든 원소가 상수일 때) 메타데이터 데이터 섹션을 그대로 가리키는 스팬, `[CollectionBuilder]` 특성이 붙은 타입이면 그 빌더 메서드 호출.

> **📌 `ReadOnlySpan<int> d = [1, 2, 3];`은 할당이 0이다**
>
> `new[] { 1, 2, 3 }`은 힙에 배열을 만든다. 컬렉션 식은 `ReadOnlySpan<T>` 대상에서 **`RuntimeHelpers.CreateSpan`으로 어셈블리의 읽기 전용 데이터 블롭을 직접 가리키는** 스팬을 만든다. `Span<T>` 대상이면 `stackalloc`으로 낮춘다. 69장의 할당 제거 관점에서 컬렉션 식은 단순한 문법 설탕이 아니다.

**인라인 배열.**

```csharp
[System.Runtime.CompilerServices.InlineArray(16)]
public struct Buffer16<T>
{
    private T element0;   // 필드 하나만 선언한다
}

var buf = new Buffer16<int>();
buf[3] = 42;                     // 인덱서처럼 동작
Span<int> span = buf;            // 암시적으로 Span<T>로 변환된다
```

C# 2의 고정 크기 버퍼가 `unsafe`와 원시 타입에 묶여 있던 것을, 안전한 코드에서 임의 타입으로 확장한 것이다. 68.10절에서 메모리 레이아웃과 함께 다뤘다.

> **⚠️ 인라인 배열은 런타임 지원이 필요하다**
>
> `[InlineArray]`는 특성만 있으면 되는 게 아니다. 런타임이 그 특성을 보고 **필드를 N개로 확장한 레이아웃**을 만들어야 한다. .NET 8 이상에서만 동작하며, 특성을 직접 선언해도 구형 런타임에서는 의도대로 동작하지 않는다.

**모든 타입에 대한 별칭.**

```csharp
using Point = (int X, int Y);
using IntList = System.Collections.Generic.List<int>;
using Buffer = int[];
using Handler = System.Action<string, int>;
using unsafe IntPtrFn = delegate*<int, int>;   // unsafe 별칭

Point p = (3, 4);
Console.WriteLine(p.X);
```

이전에는 이름 있는 타입만 별칭을 받았다. 이제 튜플, 배열, 포인터, 함수 포인터, `unsafe` 타입 모두 가능하다. `global using` 과 조합하면 프로젝트 전역의 도메인 별칭을 만들 수 있다(77.4절).

**나머지.**

```csharp
// 람다 기본 매개변수
var increment = (int x, int by = 1) => x + by;
Console.WriteLine(increment(5));      // 6

// params 배열 기본값을 가진 람다
var join = (string sep = ", ", params string[] parts) => string.Join(sep, parts);

// ref readonly 매개변수 — in과 유사하지만 호출자에게 ref/in 명시를 요구
static void Process(ref readonly Matrix4x4 m) { }
Matrix4x4 mat = default;
Process(in mat);      // 또는 Process(ref mat)

// 실험적 특성
[Experimental("MYLIB001")]
public class NewApi { }   // 사용하면 MYLIB001 오류. #pragma warning disable로 명시적 동의
```

> **📌 `ref readonly` 매개변수와 `in`의 차이**
>
> 둘 다 읽기 전용 참조를 전달한다. 차이는 **호출 지점의 문법 요구**에 있다. `in`은 값을 그대로 넘길 수 있고(필요하면 컴파일러가 임시 변수를 만든다), `ref readonly`는 호출자가 `in` 또는 `ref`를 붙이지 않으면 경고를 낸다. 즉 `ref readonly`는 "여기서 참조가 전달된다는 사실을 호출자도 알아야 한다"고 말한다. 기존 `ref` API를 `in`으로 바꾸면 호출 코드가 조용히 바뀌는데, `ref readonly`는 그 전환 경로를 제공한다.

> **⚠️ 인터셉터(interceptor)는 C# 12에서 프리뷰였다**
>
> `[InterceptsLocation]`으로 특정 호출 지점을 다른 메서드로 바꿔치기하는 기능이 C# 12와 함께 프리뷰로 공개됐다. `<Features>InterceptorsPreview</Features>`를 명시해야 켜지고, 이후 릴리스에서 위치 표현 형식이 바뀌었다. **일반 애플리케이션 코드에서 쓸 기능이 아니다** — ASP.NET Core의 요청 델리게이트 생성기 같은 프레임워크 내부용이다. 프리뷰 기능은 부 버전에서 파괴적으로 바뀔 수 있다.

### 그것이 무엇을 바꿨는가

컬렉션 식은 **API 설계의 기본값을 바꿨다.** 이제 `ReadOnlySpan<T>` 매개변수를 받는 메서드가 호출하기 편해졌다 — `M([1, 2, 3])`이 할당 없이 동작한다. C# 13의 `params ReadOnlySpan<T>`가 이 흐름의 다음 단계다.

기본 생성자는 **DI 중심 코드베이스에서 즉시 채택됐다.** ASP.NET Core 서비스 클래스가 통째로 짧아졌다.

| 기능 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|
| 기본 생성자(클래스/구조체) | 없음 | — |
| 컬렉션 식 | 대상 타입에 따라 다름. `Span` 대상은 `Span<T>` 필요, `[CollectionBuilder]`는 특성 필요 | 69장 |
| 인라인 배열 | **런타임 지원 필요 — .NET 8+. 폴리필 불가** | 68.10 |
| 모든 타입 별칭 | 없음 | 77.4 |
| 람다 기본 매개변수 | 없음 | — |
| `ref readonly` 매개변수 | `RequiresLocationAttribute` 필요(컴파일러 생성) | 68.12 |
| `[Experimental]` | 특성 필요(직접 선언 가능) | — |
| 인터셉터 | **프리뷰. 명시적 옵트인 필요** | 57.15 |

---

## 76.12 C# 13 이후 ※ — `params` 컬렉션, `Lock` 타입, `ref struct` 인터페이스 구현, `field` 키워드, 확장 멤버

C# 13은 2024년 11월에 .NET 9와, C# 14는 2025년 11월에 .NET 10과 함께 나왔다. 이 절은 두 릴리스를 함께 다루되, 각 기능이 어느 버전인지 명확히 표시한다.

### C# 13 — 성능 축의 잔여 제약 제거

**`params` 컬렉션.** `params`가 배열에만 붙던 제약이 풀렸다.

```csharp
// C# 12까지: params는 배열만
static int Sum(params int[] values) { /* ... */ }
Sum(1, 2, 3);                     // int[] 힙 할당

// C# 13: Span, ReadOnlySpan, IEnumerable<T>, List<T> 등 컬렉션 식이 지원하는 타입 모두
static int Sum(params ReadOnlySpan<int> values) { /* ... */ }
Sum(1, 2, 3);                     // 스택 할당 — 힙 할당 0
```

BCL이 이걸 대거 채택했다. `string.Join`이나 `string.Format` 계열에 `params ReadOnlySpan<T>` 오버로드가 추가되면서, 가변 인수 호출의 배열 할당이 사라졌다. 63.9절 "숨은 할당 카탈로그"의 `params` 항목이 조건부로 무효화된 것이다.

> **⚠️ 오버로드가 추가되면 기존 호출의 의미가 바뀔 수 있다**
>
> `Sum(params int[])`와 `Sum(params ReadOnlySpan<int>)`이 모두 있으면 `Sum(1, 2, 3)`은 스팬 버전을 고른다. 대부분 원하는 결과지만, 라이브러리가 조용히 오버로드를 추가하면 재컴파일 시 호출 대상이 바뀐다. 그래서 C# 13은 `[OverloadResolutionPriority]` 특성을 함께 도입해 라이브러리 저자가 우선순위를 명시할 수 있게 했다.

**`System.Threading.Lock`.**

```csharp
// .NET 9 이전
private readonly object gate = new();
lock (gate) { /* ... */ }

// C# 13 + .NET 9
private readonly Lock gate = new();
lock (gate) { /* ... */ }          // Lock.EnterScope()를 쓰는 코드로 컴파일된다
```

`lock` 문의 피연산자가 `System.Threading.Lock`이면 컴파일러가 `Monitor.Enter`/`Monitor.Exit` 대신 `EnterScope()`와 그 결과의 `Dispose()`를 쓰는 코드를 만든다. 객체 헤더의 싱크 블록(54.2절)을 거치지 않는 전용 구현이다.

> **⚠️ `Lock`을 `object`로 캐스팅하면 조용히 다른 잠금이 된다**
>
> ```csharp
> Lock gate = new();
> object o = gate;
> lock (o) { }        // Monitor 경로로 돌아간다 — 위의 lock (gate)와 상호 배제되지 않는다
> ```
>
> 컴파일러는 `Lock` 인스턴스가 `object`로 변환될 때 경고를 낸다. 무시하면 **두 개의 서로 다른 잠금 메커니즘이 같은 객체에 걸려** 상호 배제가 깨진다. `Lock` 인스턴스를 `object` 매개변수로 전달하지 마라.

**`ref struct`의 제약 완화 두 가지.**

```csharp
// (1) ref struct가 인터페이스를 구현할 수 있다
public interface IBuffer { int Length { get; } }
public ref struct MyBuffer : IBuffer { public int Length => 0; }
// 단, 여전히 박싱은 불가 — IBuffer 타입 변수에 대입할 수 없다

// (2) allows ref struct — 제네릭 타입 인수로 ref struct를 받을 수 있다
public static void Process<T>(T value) where T : allows ref struct { /* ... */ }
Process(someSpan);   // 이전에는 불가능했다
```

`allows ref struct`는 제약이 아니라 **반제약(anti-constraint)** 이다. "T에 `ref struct`가 올 수 있다"고 허용하는 대신, T에 대해 할 수 있는 일이 줄어든다 — 박싱 불가, 필드 저장 불가, 배열 원소 불가. 68.1절 참조.

**반복자·async 메서드 안의 `ref` 지역 변수와 `unsafe`.**

```csharp
static async Task M(int[] array)
{
    ref int r = ref array[0];   // C# 13부터 허용
    Use(r);
    await Task.Yield();         // 단, ref 지역 변수가 await 경계를 넘어 살아남을 수는 없다
}
```

`await`나 `yield return` 경계를 **넘지 않는 한** `ref` 지역 변수를 쓸 수 있게 됐다. 상태 기계 필드로 승격될 수 없어서 생긴 제약이, 꼭 필요한 만큼만 남았다.

**나머지 C# 13 기능.**

```csharp
// 부분 프로퍼티와 부분 인덱서 (소스 생성기용)
public partial class C { public partial string Name { get; set; } }

// 이스케이프 시퀀스 \e — ESC 문자(U+001B). 의 명시적 형태
Console.Write("\e[31m빨강\e[0m");

// 객체 초기화자에서 암시적 인덱서 접근
var buf = new Buffer { [^1] = 42 };    // 초기화자 안에서 ^ 사용

// 메서드 그룹 자연 타입 개선 — 후보를 더 일찍 걸러 모호성이 줄었다
var f = Console.WriteLine;
```

> **⚠️ `field` 키워드는 C# 13에서 프리뷰였다**
>
> `field` 문맥 키워드(접근자 본문에서 컴파일러 생성 백킹 필드를 직접 참조)는 C# 13에서 **프리뷰**로만 제공됐다. `<LangVersion>preview</LangVersion>`이 필요했고, `field`라는 이름의 기존 식별자와 충돌 가능성 때문에 설계가 계속 다듬어졌다. C# 14에서 정식 기능이 됐다. C# 13 대상 코드에 이 문법을 쓰면 안 된다.

### C# 14 — 확장의 완성과 `field`

**`field` 키워드.**

```csharp
public class Person
{
    public string Name
    {
        get => field;
        set => field = value?.Trim() ?? throw new ArgumentNullException(nameof(value));
    }

    public int Age
    {
        get;
        set => field = value >= 0 ? value : throw new ArgumentOutOfRangeException(nameof(value));
    }
}
```

백킹 필드를 손으로 선언하지 않고도 접근자에 로직을 넣을 수 있다. 접근자 중 하나만 본문을 가져도 된다 — `Age`의 `get`은 여전히 자동 구현이다.

> **⚠️ `field`는 문맥 키워드라 기존 코드와 충돌할 수 있다**
>
> `private int field;`라는 필드가 이미 있는 클래스에서, 프로퍼티 접근자 안의 `field`는 C# 14부터 **새 의미(컴파일러 생성 백킹 필드)** 로 해석된다. 컴파일러가 이런 경우 경고를 내지만, 대규모 코드베이스에서 언어 버전을 올릴 때 반드시 확인해야 할 항목이다. 기존 필드를 가리키려면 `this.field`로 쓴다.

**확장 멤버(extension members).** C# 3의 확장 메서드가 확장 프로퍼티·정적 확장 멤버까지 넓어졌다. 4판 15.6.3절이 "extension everything"이라는 이름으로 예고했던 기능이다.

```csharp
public static class EnumerableExtensions
{
    extension<T>(IEnumerable<T> source)
    {
        // 확장 프로퍼티
        public bool IsEmpty => !source.Any();

        // 확장 메서드 (기존 this 매개변수 문법과 같은 효과)
        public IEnumerable<T> WhereNotNull() => source.Where(x => x is not null);
    }
}

if (list.IsEmpty) { /* ... */ }
```

`extension` 블록은 확장 대상(receiver)을 한 번 선언하고 그 안에 멤버를 모아 쓴다. 기존 `this` 매개변수 문법은 계속 유효하며 두 형태는 공존한다.

**나머지 C# 14 기능.**

```csharp
// null 조건 대입 — 좌변이 null이면 우변도 평가되지 않는다
customer?.Address = newAddress;

// 언바운드 제네릭에 대한 nameof
string n = nameof(List<>);           // "List"

// 암시적 span 변환 — 배열에서 Span/ReadOnlySpan으로의 변환이 언어 수준 변환이 됐다
static void M(ReadOnlySpan<int> s) { /* ... */ }
M(new int[] { 1, 2, 3 });

// 람다 매개변수에 타입 없이 한정자만 (C# 12까지는 ref를 쓰면 타입도 써야 했다)
var f = (ref x) => x++;

// 부분 생성자와 부분 이벤트
public partial class C { public partial C(int x); }
```

> **📌 이 절의 목록은 전부가 아니다**
>
> 각 릴리스는 "warning wave"라 불리는 새 경고 묶음과 여러 소소한 개선을 함께 담는다. 이 절은 실무에서 자주 만나는 것만 골랐다. 정확한 전체 목록은 항상 `dotnet/csharplang` 저장소의 릴리스별 기능 상태 문서를 확인하라 — 이 책을 포함한 어떤 2차 자료보다 그쪽이 정확하고 최신이다.

| 기능 | 버전 | 런타임/프레임워크 요구 | 3권 참조 |
|---|---|---|---|
| `params` 컬렉션 | C# 13 | `ReadOnlySpan<T>` 대상은 스팬 필요 | 63.9 |
| `[OverloadResolutionPriority]` | C# 13 | 특성 필요 | 78.3 |
| `System.Threading.Lock` | C# 13 | **.NET 9+ BCL 필요** | 54.2 |
| `ref struct`의 인터페이스 구현 | C# 13 | **런타임 지원 필요 — .NET 9+** | 68.1 |
| `allows ref struct` | C# 13 | **런타임 지원 필요 — .NET 9+** | 68.1 |
| 반복자·async의 `ref` 지역 / `unsafe` | C# 13 | 없음 | 56.6 |
| 부분 프로퍼티·인덱서 | C# 13 | 없음 | 57.15 |
| `\e` 이스케이프 / 암시적 인덱서 초기화 | C# 13 | 없음 | — |
| `field` 키워드 | C# 13 프리뷰 → **C# 14 정식** | 없음 | — |
| 확장 멤버(`extension` 블록) | C# 14 | 없음(컴파일러 생성 특성) | — |
| null 조건 대입 | C# 14 | 없음 | — |
| 언바운드 제네릭 `nameof` | C# 14 | 없음 | — |
| 암시적 span 변환 | C# 14 | `Span<T>` 필요 | 68.13 |
| 부분 생성자·이벤트 | C# 14 | 없음 | 57.15 |

---

## 76.13 런타임 버전과 언어 버전의 조합 표

여기까지 각 절 끝의 표에서 "런타임 지원 필요"라는 문구가 반복해서 나왔다. 이 절은 그 문구가 정확히 무엇을 뜻하는지, 그리고 어떤 조합이 실제로 동작하는지를 정리한다.

### 언어 버전은 어디서 결정되는가

C# 컴파일러는 프로젝트의 **대상 프레임워크(TFM)** 를 보고 언어 버전을 자동으로 정한다.

| 대상 프레임워크(TFM) | 기본 C# 버전 |
|---|---|
| `net10.0` | C# 14 |
| `net9.0` | C# 13 |
| `net8.0` | C# 12 |
| `net7.0` | C# 11 |
| `net6.0` | C# 10 |
| `net5.0` | C# 9 |
| `netcoreapp3.0` / `netcoreapp3.1` | C# 8 |
| `netstandard2.1` | C# 8 |
| `netstandard2.0` 및 그 이하 | **C# 7.3** |
| `net48`, `net472` 등 .NET Framework 전부 | **C# 7.3** |

마지막 두 줄이 핵심이다. **.NET Framework과 `netstandard2.0`은 C# 7.3에서 멈춰 있다.**

명시적으로 바꾸려면 `.csproj`에 쓴다.

```xml
<PropertyGroup>
  <LangVersion>12.0</LangVersion>
</PropertyGroup>
```

값으로 쓸 수 있는 것은 다음과 같다.

| 값 | 의미 |
|---|---|
| `7.3`, `9.0`, `12.0` … | 해당 버전으로 고정 |
| `default` | TFM이 정하는 기본값 (지정하지 않은 것과 같다) |
| `latestMajor` | 설치된 컴파일러가 지원하는 최신 **주** 버전 |
| `latest` | 최신 주·부 버전 |
| `preview` | 프리뷰 기능 포함 — **프로덕션 금지** |
| `ISO-1`, `ISO-2` | C# 1.0 / C# 2.0 (ECMA 표준 버전) |

> **⚠️ `LangVersion`을 TFM 기본값 위로 올릴 때 — 두 경우를 구분하라**
>
> **최신 .NET을 대상으로 할 때는 정상적인 전략이다.** `net8.0`(LTS)을 유지하면서 .NET 9 SDK로 `<LangVersion>13</LangVersion>`을 쓰는 조합은 Microsoft 문서가 명시적으로 안내하는 구성이다. 이때 열리는 것은 **언어 기능뿐이고 새 BCL API는 열리지 않는다**(부록 H.1절).
>
> **문제는 .NET Framework과 `netstandard2.0`이다.** `net472` 프로젝트에 `<LangVersion>12.0</LangVersion>`을 넣으면 컴파일은 된다. 그리고 상당수 기능이 실제로 동작한다. 하지만 Microsoft는 이 조합을 **테스트하지 않고 지원하지도 않는다.** 컴파일러가 어떤 기능에 대해 필요한 타입을 찾지 못하면 알아보기 힘든 오류를 내고, SDK를 올리면 그 오류가 바뀔 수 있다. 라이브러리를 배포한다면 특히 위험하다 — 소비자가 다른 SDK 버전을 쓰기 때문이다.
>
> 다만 **`LangVersion`을 TFM 기본값 아래로 내리는 것은 완전히 지원된다.** 팀이 아직 특정 문법을 쓰지 않기로 했을 때 유용하다.

### 기능이 무엇을 요구하는가 — 네 등급

언어 기능이 "그냥 동작하는지"는 무엇을 요구하느냐로 갈린다. 네 등급이 있다.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 등급 A — 순수 컴파일러                                                │
│   컴파일러가 IL을 다르게 만들 뿐. 어떤 런타임에서도 동작한다.          │
│   식 본문 멤버, nameof, ?., 지역 함수, switch 식, 최상위 문,          │
│   원시 문자열, 파일 범위 네임스페이스, 기본 생성자, 목록 패턴 …       │
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

등급 D가 이 절의 존재 이유다. 나머지는 노력으로 우회할 수 있지만 D는 못 한다.

### 등급 D 기능의 최소 런타임

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
| `Span<T>` / `stackalloc`→`Span` (C# 7.2) | `System.Span<T>` | `System.Memory` NuGet 패키지 |
| 인덱스·범위 (C# 8) | `System.Index`, `System.Range` | 직접 선언 또는 `IndexRange` 패키지 |
| 비동기 스트림 (C# 8) | `IAsyncEnumerable<T>` 등 | `Microsoft.Bcl.AsyncInterfaces` 패키지 |
| NRT 특성 (C# 8) | `[NotNullWhen]` 등 | `Nullable` 패키지 또는 직접 선언 |
| `init` / `record` (C# 9) | `IsExternalInit` | **직접 선언** 또는 `PolySharp` |
| 모듈 초기화자 (C# 9) | `ModuleInitializerAttribute` | 직접 선언 |
| `[SkipLocalsInit]` (C# 9) | `SkipLocalsInitAttribute` | 직접 선언 |
| `CallerArgumentExpression` (C# 10) | 해당 특성 | 직접 선언 |
| `required` (C# 11) | `RequiredMemberAttribute`, `CompilerFeatureRequiredAttribute`, `SetsRequiredMembersAttribute` | 직접 선언 또는 `PolySharp` |
| 컬렉션 식의 `[CollectionBuilder]` (C# 12) | 해당 특성 | 직접 선언 |

> **📌 `PolySharp`는 이 표를 자동화한다**
>
> `PolySharp`는 소스 생성기로 동작하는 폴리필 패키지다. TFM을 보고 **없는 컴파일러 지원 타입만 골라 `internal`로 생성**한다. 런타임 의존성이 전혀 없고(생성된 코드만 남는다), 어셈블리 간 타입 충돌도 `internal`이라 발생하지 않는다.
>
> ```xml
> <PackageReference Include="PolySharp" Version="..." PrivateAssets="all" />
> ```
>
> 다만 등급 D는 폴리필할 수 없다는 사실은 변하지 않는다. `PolySharp`를 넣어도 `net472`에서 기본 인터페이스 멤버는 못 쓴다.

### 조합 매트릭스

자주 쓰는 TFM 네 개에 대해, 대표 기능이 실제로 동작하는지 정리했다. `LangVersion`을 필요한 만큼 올렸다고 가정한다.

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

굵게 표시한 행이 **런타임을 올리는 것 말고는 방법이 없는** 기능이다.

> **⚠️ `netstandard2.0`은 최소 공통분모이지 "구식"이 아니다**
>
> 널리 쓰이는 라이브러리는 여전히 `netstandard2.0`을 대상으로 삼는다. .NET Framework 4.6.1 이상, Unity, Xamarin, 모든 .NET Core/`.NET` 버전에서 소비 가능하기 때문이다. 그 대가로 **C# 7.3 언어와 폴리필 관리**를 감수한다. 라이브러리 저자라면 이 트레이드오프를 의식적으로 결정해야 한다 — 자동으로 `net8.0`만 대상으로 삼으면 소비자 절반을 잃을 수도 있다.

---

## 76.14 기능 도입 시점을 아는 것이 실무에서 왜 필요한가 — 멀티 타깃과 레거시

이 장의 마지막 질문이다. 기능이 어느 버전에 들어왔는지 **외우는 것**이 왜 가치가 있는가? 검색하면 나오는데.

답은 네 가지다.

### ① 멀티 타깃 프로젝트를 짤 수 있어야 한다

라이브러리를 만든다면 여러 TFM을 동시에 대상으로 삼는 일이 흔하다.

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>netstandard2.0;net8.0;net9.0</TargetFrameworks>
    <LangVersion>13.0</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <!-- 구형 TFM에만 폴리필 -->
  <ItemGroup Condition="'$(TargetFramework)' == 'netstandard2.0'">
    <PackageReference Include="System.Memory" Version="4.6.0" />
    <PackageReference Include="Microsoft.Bcl.AsyncInterfaces" Version="9.0.0" />
    <PackageReference Include="PolySharp" Version="1.15.0" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

빌드가 TFM마다 한 번씩, 총 세 번 돈다. 그리고 **각 빌드에서 사용 가능한 API와 언어 기능이 다르다.** `<LangVersion>13.0</LangVersion>`은 세 빌드 모두에 적용되지만, `netstandard2.0` 빌드에서 `allows ref struct`를 쓰면 그 빌드만 실패한다.

SDK는 TFM마다 전처리기 심볼을 자동으로 정의한다.

| TFM | 정의되는 심볼(일부) |
|---|---|
| `net472` | `NETFRAMEWORK`, `NET472`, `NET472_OR_GREATER`, `NET471_OR_GREATER`, … |
| `netstandard2.0` | `NETSTANDARD`, `NETSTANDARD2_0`, `NETSTANDARD2_0_OR_GREATER`, … |
| `netstandard2.1` | `NETSTANDARD`, `NETSTANDARD2_1`, `NETSTANDARD2_0_OR_GREATER`, … |
| `net8.0` | `NET`, `NETCOREAPP`, `NET8_0`, `NET8_0_OR_GREATER`, `NET6_0_OR_GREATER`, … |
| `net9.0` | `NET`, `NETCOREAPP`, `NET9_0`, `NET9_0_OR_GREATER`, `NET8_0_OR_GREATER`, … |

`_OR_GREATER` 형태를 쓰는 것이 원칙이다.

```csharp
public static int CountVowels(ReadOnlySpan<char> text)
{
#if NET8_0_OR_GREATER
    // .NET 8의 SearchValues는 벡터화된 조회 테이블을 쓴다 (69.6절)
    return text.Count(Vowels);
#else
    int n = 0;
    foreach (char c in text)
        if (c is 'a' or 'e' or 'i' or 'o' or 'u') n++;
    return n;
#endif
}

#if NET8_0_OR_GREATER
private static readonly SearchValues<char> Vowels = SearchValues.Create("aeiou");
#endif
```

> **⚠️ `#if NET8_0`과 `#if NET8_0_OR_GREATER`는 다르다**
>
> `NET8_0`은 **정확히 `net8.0`** 일 때만 정의된다. `net9.0` 빌드에서는 정의되지 않는다. 이 실수를 하면 TFM을 하나 추가하는 순간 최적화 경로가 조용히 사라진다. 성능 회귀가 발생하는데 코드는 그대로다 — 찾기 매우 어려운 종류의 버그다. **`_OR_GREATER`를 기본으로 쓰고, 정확한 버전 매칭이 정말 필요할 때만 예외를 두라.**

> **⚠️ `#if`로 갈린 코드는 한쪽만 컴파일된다**
>
> `#else` 분기는 `net8.0` 빌드에서 **구문 검사조차 되지 않는다.** IDE는 활성 TFM 하나의 관점만 보여주므로, 비활성 분기의 오타는 CI에서 다른 TFM 빌드가 돌 때까지 드러나지 않는다. 멀티 타깃 프로젝트의 CI는 반드시 **모든 TFM을 빌드**해야 한다. 그리고 `#if` 분기는 가능한 한 작은 메서드 하나 안에 가두고, 호출부는 분기 없이 유지한다.

### ② 폴리필의 정체를 알아야 한다

앞서 여러 번 나온 `IsExternalInit`을 다시 보자. `netstandard2.0`을 대상으로 `record`를 쓰려면 이 한 조각이 필요하다.

```csharp
// Polyfills/IsExternalInit.cs
#if !NET5_0_OR_GREATER
namespace System.Runtime.CompilerServices
{
    using System.ComponentModel;

    [EditorBrowsable(EditorBrowsableState.Never)]
    internal static class IsExternalInit { }
}
#endif
```

세 가지를 주목하라.

1. **네임스페이스와 이름이 정확해야 한다.** 컴파일러는 이 타입을 **이름으로 찾는다.** `System.Runtime.CompilerServices.IsExternalInit`이 아니면 못 찾는다.
2. **`internal`이어야 한다.** `public`으로 만들면, 같은 폴리필을 담은 다른 어셈블리를 함께 참조할 때 타입 모호성 오류가 난다.
3. **`#if`로 감싸야 한다.** `net5.0` 이상에서는 BCL에 이미 있으므로, 감싸지 않으면 중복 정의로 경고나 모호성이 생긴다.

이 패턴의 원형은 76.4절에서 본 C# 5의 호출자 정보 특성이다. 4판 7.2.5절이 "옛 버전의 .NET에서 호출자 정보 특성 쓰기"로 같은 기법을 설명한다. **컴파일러가 이름으로 찾는 타입은 전부 폴리필 가능하다** — 이게 규칙이다. 반대로 런타임이 동작을 바꿔야 하는 기능(등급 D)은 이름을 맞춰봐야 소용없다.

> **⚠️ 폴리필 타입을 `public`으로 노출하면 소비자를 오염시킨다**
>
> 라이브러리가 `public static class IsExternalInit`을 내보내면, 그 라이브러리를 참조하는 프로젝트가 `net8.0`일 때 BCL의 것과 충돌한다. 폴리필은 **항상 `internal`** 이고, 필요하면 `[InternalsVisibleTo]`로 테스트에만 열어준다.

### ③ 조언과 코드의 유효기간을 판단할 수 있어야 한다

인터넷의 C# 코드에는 **연도가 적혀 있지 않다.** 하지만 문법을 보면 대략의 시기를 알 수 있고, 그게 그 조언의 유효성을 판단하는 단서가 된다.

| 코드에서 보이는 것 | 추정 시기 | 오늘날의 대안 |
|---|---|---|
| `ArrayList`, `Hashtable` | C# 1 (2002) | 제네릭 컬렉션 (C# 2) |
| `delegate(int x) { ... }` | C# 2 (2005) | 람다 (C# 3) |
| `string.Format("{0}", x)` | C# 2~5 | 보간 문자열 (C# 6) |
| `var h = PropertyChanged; if (h != null) h(...)` | C# 2~5 | `PropertyChanged?.Invoke(...)` (C# 6) |
| `Task.Run(...).ContinueWith(...)` | C# 4 | `await` (C# 5) |
| `nameof` 없는 `throw new ArgumentNullException("x")` | C# 5 이하 | `nameof` (C# 6), `ThrowIfNull` (.NET 6) |
| `out int x`를 미리 선언 | C# 6 이하 | `out` 변수 (C# 7) |
| `Tuple.Create(a, b)` | C# 4~6 | `ValueTuple` (C# 7) |
| `as` + null 검사 | C# 6 이하 | `is` 패턴 (C# 7) |
| `new Dictionary<string,int>()` 우변 반복 | C# 8 이하 | 대상 타입 지정 `new` (C# 9) |
| `x!!`(매개변수 null 검사) | **C# 11 프리뷰 — 취소됨** | `ArgumentNullException.ThrowIfNull` |

마지막 줄이 특히 중요하다. **취소된 프리뷰 기능을 소개하는 글이 인터넷에 그대로 남아 있다.** 2022년 중반에 쓰인 `!!` 소개 글은 지금 따라 하면 컴파일되지 않는다. 프리뷰 기능을 다룬 자료는 릴리스 노트로 교차 검증해야 한다.

> **💡 코드 리뷰에서 "왜 이렇게 안 썼나"를 묻기 전에**
>
> 오래된 파일에서 `string.Format`이나 명시적 null 검사를 보면 고치고 싶어진다. 하지만 그 파일이 `netstandard2.0` 멀티 타깃 대상이거나, 팀이 의도적으로 `LangVersion`을 낮춰 놓았을 수 있다. **먼저 `.csproj`를 열어보라.** 이 장의 지도가 필요한 가장 일상적인 순간이 이것이다.

### ④ 마이그레이션 순서를 설계할 수 있어야 한다

레거시 코드베이스의 언어 버전을 올리는 것은 한 번에 하는 일이 아니다. 순서가 있다.

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

> **💡 NRT 활성화는 파일 단위로 쪼개라**
>
> `<Nullable>enable</Nullable>`을 큰 프로젝트에 한 번에 켜면 경고가 수천 개 나온다. 그러면 팀은 그냥 경고를 끈다. 대신 `<Nullable>disable</Nullable>`을 프로젝트 기본으로 두고, 새 파일과 정리한 파일에만 `#nullable enable`을 넣는 방식이 실전에서 훨씬 잘 작동한다. 4판 15.1.6절이 "마이그레이션 경험"으로 같은 조언을 한다. 21.7절에서 자세히 다룬다.

### 마지막으로 — 언어 버전은 팀의 결정이다

이 장은 "최신 버전을 쓰라"고 말하지 않았다. 기능이 언제 나왔고 무엇을 요구하는지를 말했을 뿐이다.

실제 결정에는 다른 요소가 들어간다. 팀원의 숙련도, 코드 리뷰 비용, 배포 대상 환경, 라이브러리 소비자의 런타임. C# 12의 기본 생성자를 도입하면 DI 코드가 짧아지지만, 76.11절의 두 함정(가변 캡처 매개변수, 중복 필드)을 팀이 모르면 오히려 문제가 생긴다.

Skeet이 4판 1.1.5절에서 성능 기능에 대해 한 말이 모든 기능에 적용된다.

> 기능이 거기 있다고 해서 써야 하는 것은 아니다. 복잡성을 받아들이는 결정은 **의식적인** 것이어야 한다.

이 장의 지도는 그 의식적인 결정을 위한 것이다.

---

## 이 장의 요약

- **C#의 진화에는 다섯 축이 있다.** 타입 시스템 강화, 간결성, 데이터 접근, 비동기, 성능. 각 축은 여러 버전을 가로지르며, 한 버전의 씨앗이 몇 버전 뒤에 열매를 맺는다. C# 3의 확장 메서드 → C# 8의 기본 인터페이스 멤버 → C# 14의 확장 멤버가 한 줄기다.
- **C# 2는 런타임을 바꿨고, C# 3~7은 바꾸지 않았고, C# 8부터 다시 바꾸기 시작했다.** 이 사실이 오늘날의 TFM 제약 대부분을 설명한다. 기본 인터페이스 멤버가 .NET Framework에서 안 되는 이유가 여기 있다.
- **.NET Framework과 `netstandard2.0`은 C# 7.3에서 멈춰 있다.** `LangVersion`을 올리면 상당수 기능이 동작하지만 지원되지 않는 구성이고, 등급 D 기능은 절대 열리지 않는다.
- **기능의 요구 사항은 네 등급으로 나뉜다.** 순수 컴파일러(A), 컴파일러가 생성하는 특성(B), 폴리필 가능한 타입(C), 런타임 변경(D). C와 D를 구분할 줄 아는 것이 멀티 타깃의 핵심 역량이다.
- **`IsExternalInit`은 폴리필의 원형이다.** 컴파일러가 **이름으로 찾는** 타입은 직접 선언할 수 있다. `internal`로, `#if`로 감싸서. `PolySharp`가 이 작업을 자동화한다.
- **`#if NET8_0`과 `#if NET8_0_OR_GREATER`를 혼동하면 조용한 성능 회귀가 난다.** 그리고 비활성 `#if` 분기는 구문 검사조차 되지 않으므로, CI가 모든 TFM을 빌드해야 한다.
- **프리뷰 기능과 취소된 기능을 구분하라.** C# 11 프리뷰의 매개변수 null 검사 `!!`는 릴리스 전에 제거됐고, C# 12의 인터셉터는 여전히 프리뷰다. 인터넷의 자료는 이 구분을 하지 않는다.
- **레코드는 얕은 불변이고, NRT와 `required`는 런타임에 강제되지 않으며, `in`은 값이 안 바뀐다는 뜻이 아니다.** 새 기능이 주는 보장의 **경계**를 아는 것이, 그 기능을 아는 것보다 중요하다.
- **언어 버전 선택은 기술적 사실이 아니라 팀의 결정이다.** 이 장은 결정에 필요한 사실을 제공할 뿐이다.

---

## 연습 문제

1. `net472`, `netstandard2.0`, `net9.0` 세 TFM을 멀티 타깃하는 클래스 라이브러리를 만들고 `<LangVersion>13.0</LangVersion>`을 지정하라. `record Point(int X, int Y);`를 추가하고 빌드해서, 어느 TFM에서 어떤 오류가 나는지 확인하라. 그다음 `IsExternalInit` 폴리필을 `#if`로 감싸 추가하고 다시 빌드하라.

2. 위 프로젝트에 `public interface ILogger { void Log(string m); void LogInfo(string m) => Log("INFO: " + m); }`를 추가하라. 빌드 오류 메시지를 그대로 기록하고, `PolySharp` 패키지를 넣어도 해결되지 않음을 확인하라. 왜 그런지 76.13절의 등급 구분으로 설명하라.

3. 다음 코드를 `net8.0`과 `netstandard2.0` 두 TFM으로 빌드하고, ILSpy나 `ildasm`으로 각 어셈블리의 해당 메서드를 디컴파일해 **IL이 다름**을 확인하라.
   ```csharp
   public static string Describe(int a, int b) => $"a={a}, b={b}";
   ```
   `netstandard2.0` 쪽에서 `string.Format`이 보이고 `net8.0` 쪽에서 `DefaultInterpolatedStringHandler`가 보이는가?

4. `Lock gate = new(); object o = gate; lock (o) { }` 를 `net9.0` 프로젝트에서 컴파일하고 경고 번호를 확인하라. 그다음 두 스레드가 각각 `lock (gate)`와 `lock (o)`를 잡도록 만들어, **상호 배제가 실제로 깨지는지** 실험으로 확인하라.

5. 다음 세 형태의 성능을 BenchmarkDotNet으로 비교하라 (`net9.0`).
   ```csharp
   static int SumArray(params int[] v)            { int s=0; foreach (var x in v) s+=x; return s; }
   static int SumSpan(params ReadOnlySpan<int> v) { int s=0; foreach (var x in v) s+=x; return s; }
   ```
   `Sum(1,2,3)` 호출에 대해 `Allocated` 열이 어떻게 다른가? 67장의 측정 원칙을 지켜 벤치마크를 작성하라.

6. `readonly` 없는 구조체를 만들고 `in` 매개변수로 받는 메서드를 작성한 뒤, SharpLab이나 `DOTNET_JitDisasm`으로 **방어적 복사가 생기는지** 확인하라. 그다음 `readonly struct`로 바꿔 복사가 사라지는지 비교하라(76.6절, 69.1절).

7. 자신이 관리하는(또는 임의의 오픈소스) 코드베이스에서 `.csproj`의 `TargetFramework(s)`와 `LangVersion`을 조사하고, 76.13절의 조합 매트릭스에 비추어 **지금 쓸 수 있는데 안 쓰고 있는 기능** 세 개와 **쓰고 싶지만 런타임 때문에 못 쓰는 기능** 세 개를 목록으로 만들어라.

---

**다음 장** — 77장「튜플·분해·패턴 매칭 완전 정복」에서는 이 장이 연대기로 훑고 지나간 세 기능군을 끝까지 판다. C# 7의 튜플 리터럴에서 C# 11의 목록 패턴까지, 요소 이름이 CLR에서 어떻게 처리되는지, `Deconstruct`가 왜 인터페이스가 아닌 패턴인지, 그리고 `switch` 식이 어떤 IL로 낮춰지고 분기 성능이 어떻게 결정되는지를 다룬다.
