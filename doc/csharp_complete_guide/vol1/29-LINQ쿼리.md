---
title: "29장. LINQ 쿼리"
parent: "1권 — 언어"
grand_parent: "C# Complete Guide"
nav_order: 29
---

# 29장. LINQ 쿼리

> **이 장의 위치** — Part V의 네 번째 장이다. 26장에서 람다가 어떤 클래스로 낮춰지는지를, 28장에서 `yield return` 한 줄이 어떤 상태 기계가 되는지를 봤다. 이 장은 그 둘을 재료 삼아 만들어진 것 — **LINQ**를 다룬다. 다만 여기서 다루는 것은 개별 연산자의 목록이 아니라 **쿼리를 쓰는 두 가지 문법과, 그 문법이 만들어 내는 지연 실행 모델**이다. 쿼리가 "언제 도는가"를 정확히 알지 못하면 LINQ는 조용히 틀린 답을 주거나 조용히 100배 느려진다.
>
> **선수 지식** — 18장(인터페이스), 23장(제네릭), 24장(컬렉션), 26장(델리게이트와 람다), 28장(열거와 반복자)
>
> **이 장에서 다루지 않는 것** — `Select`·`Where`·`Join`·`GroupBy` 등 개별 연산자의 오버로드와 의미론은 30장에서 전수한다. 식 트리와 `IQueryable<T>`, LINQ가 SQL이 되는 과정은 31장에서 다룬다. 반복자 상태 기계의 IL 수준 해부는 28.4절에 이미 있으므로 반복하지 않는다. 병렬 실행(PLINQ)은 50.3절에서, LINQ의 할당 프로파일과 성능 튜닝 실전은 30.14절·30.15절에서 다룬다.

---

## 29.1 시작하기 — LINQ가 통합한 것들

### 문제: 데이터마다 API가 달랐다

.NET 3.5 이전, 데이터를 다루는 코드는 데이터가 **어디에** 있느냐에 따라 완전히 다른 API를 썼다.

| 다루려는 데이터 | 당시의 접근 방법 |
|---|---|
| 관계형 데이터베이스 | `System.Data.dll`, `System.Data.SqlClient.dll` 등 (ADO.NET) |
| XML 문서 | `System.Xml.dll` |
| 메타데이터 테이블 | `System.Reflection` 네임스페이스 |
| 객체 컬렉션 | `System.Array`, `System.Collections`, `System.Collections.Generic` |

각각이 그 자체로는 문제가 없었다. 문제는 **서로 섬(island)이었다는 것**이다. `DataSet`을 XML로 저장한 뒤 `System.Xml`로 다시 조작하는 식의 우회는 가능했지만, 데이터 조작은 여전히 비대칭이었다. "이름에 a가 들어가는 항목을 길이순으로 정렬해서 대문자로 바꿔라"라는 **같은 의도**를 표현하는 코드가 저장소마다 전혀 다르게 생겼다.

LINQ(Language Integrated Query, 언어 통합 쿼리)는 이 비대칭을 없애려는 시도다. C# 문법 안에 **쿼리**라는 구성물을 집어넣어, 배열이든 `List<T>`든 XML 문서든 SQL Server 테이블이든 같은 문법으로 다루게 한다.

```csharp
// 로컬 배열
var a = from n in names        where n.Contains("a") orderby n.Length select n.ToUpper();

// 데이터베이스 테이블 (31장)
var b = from c in db.Customers where c.Name.Contains("a") orderby c.Name.Length select c.Name.ToUpper();
```

두 줄의 **문법이 같다**. 뒤에서 벌어지는 일은 전혀 다르지만(하나는 델리게이트 체인, 하나는 SQL 생성) 쓰는 쪽에서는 구별할 필요가 거의 없다. 이것이 LINQ가 "통합"한 것의 실체다.

> **📌 LINQ라는 이름이 가리키는 범위**
>
> "LINQ"는 특정 클래스나 어셈블리 이름이 아니라 **접근 방식 전체**를 가리키는 용어다. 적용 대상에 따라 관용적으로 다음 이름들이 붙는다.
>
> | 이름 | 대상 |
> |---|---|
> | LINQ to Objects | 배열·컬렉션 등 메모리 안의 객체 시퀀스 |
> | LINQ to XML | XML 문서 (`XElement`, `XDocument`) |
> | LINQ to Entities | EF Core를 통한 관계형 데이터베이스 |
> | PLINQ | 위 결과를 병렬로 처리 (50.3절) |
>
> 이 장이 다루는 것은 전적으로 **LINQ to Objects**다. 문법과 지연 실행 모델은 나머지에도 그대로 적용된다.

### 시퀀스와 원소

LINQ의 데이터 단위는 딱 둘이다.

- **시퀀스(sequence)** — `IEnumerable<T>`를 구현한 모든 객체
- **원소(element)** — 시퀀스 안의 각 항목

```csharp
string[] names = { "Tom", "Dick", "Harry" };
```

여기서 `names`가 시퀀스고 `"Tom"`, `"Dick"`, `"Harry"`가 원소다. 메모리 안의 객체 컬렉션을 나타내므로 **로컬 시퀀스(local sequence)** 라고 부른다.

**쿼리 연산자(query operator)** 는 시퀀스를 변환하는 메서드다. 전형적인 연산자는 입력 시퀀스를 받아 변환된 출력 시퀀스를 내놓는다. `System.Linq`의 `Enumerable` 클래스에는 이런 연산자가 40개 남짓 있고, **전부 정적 확장 메서드로 구현되어 있다**. 이들을 **표준 쿼리 연산자(standard query operator)** 라고 부른다.

**쿼리(query)** 는 열거되었을 때 쿼리 연산자로 시퀀스를 변환하는 식(expression)이다. 가장 단순한 쿼리는 입력 시퀀스 하나와 연산자 하나로 이루어진다.

```csharp
string[] names = { "Tom", "Dick", "Harry" };

IEnumerable<string> filteredNames =
    System.Linq.Enumerable.Where(names, n => n.Length >= 4);

foreach (string n in filteredNames)
    Console.WriteLine(n);
// Dick
// Harry
```

이 코드는 `Where`를 **정적 메서드로 직접 호출**한 형태다. 굳이 이렇게 쓰는 사람은 없지만, 컴파일러가 실제로 만들어 내는 호출 형태가 바로 이것이라는 점이 중요하다.

### 확장 메서드라는 장치

표준 쿼리 연산자는 전부 확장 메서드(20.5절)이므로, 마치 인스턴스 메서드인 것처럼 `names` 위에서 바로 부를 수 있다.

```csharp
IEnumerable<string> filteredNames = names.Where(n => n.Length >= 4);
```

컴파일하려면 `System.Linq` 네임스페이스를 가져와야 한다.

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

string[] names = { "Tom", "Dick", "Harry" };
IEnumerable<string> filteredNames = names.Where(n => n.Length >= 4);
foreach (string name in filteredNames) Console.WriteLine(name);
// Dick
// Harry
```

> **📌 `System.Linq`는 대개 이미 들어와 있다**
>
> ※.NET 6 이후 새 프로젝트 템플릿은 `ImplicitUsings`를 켜 두므로 `System.Linq`가 전역 using으로 자동 포함된다. 그래서 `using System.Linq;`를 쓰지 않아도 `Where`가 보인다. 다만 이 기능을 끈 프로젝트나 오래된 프로젝트에서는 여전히 명시적으로 가져와야 한다. "왜 `Where`가 안 보이지"의 90%는 이 using 누락이다.

`Where`의 시그니처는 이렇다.

```csharp
public static IEnumerable<TSource> Where<TSource>
    (this IEnumerable<TSource> source, Func<TSource, bool> predicate);
```

첫 매개변수에 `this`가 붙어 있으므로 확장 메서드이고, 두 번째 매개변수는 `Func<TSource,bool>` — 원소 하나를 받아 `bool`을 돌려주는 델리게이트다(26.5절). `true`면 그 원소를 출력 시퀀스에 포함시킨다.

### 컴파일 결과 — 확장 메서드는 그냥 정적 호출이다

`names.Where(n => n.Length >= 4)`가 IL에서 어떻게 되는지 보자. 확장 메서드 호출은 **아무 마법도 없이** 정적 메서드 호출로 바뀐다.

```il
// 람다는 26.10절에서 본 대로 클로저 클래스에 캐시된다.
ldsfld     class '<>c' '<>c'::'<>9'
ldftn      instance bool '<>c'::'<<Main>$>b__0_0'(string)
newobj     instance void class [System.Runtime]System.Func`2<string,bool>::.ctor(object,
                                                                                native int)
// 확장 메서드 → 평범한 static call
call       class [System.Runtime]System.Collections.Generic.IEnumerable`1<!!0>
             [System.Linq]System.Linq.Enumerable::Where<string>(
               class [System.Runtime]System.Collections.Generic.IEnumerable`1<!!0>,
               class [System.Runtime]System.Func`2<!!0,bool>)
```

(실제 Roslyn 출력에는 델리게이트 인스턴스를 정적 필드에 캐시하는 `dup`/`brtrue`/`stsfld` 패턴이 함께 나온다. 여기서는 요지만 남겼다. 캐시 규칙과 그 예외는 26.11절에서 다뤘다.)

읽어야 할 것은 두 가지다.

1. `callvirt`가 아니라 **`call`** 이다. 확장 메서드는 정적 메서드이므로 가상 디스패치가 없다.
2. `Where` 호출이 끝난 시점에 **아직 아무 원소도 읽지 않았다**. 반환값은 시퀀스를 감싸는 객체 하나뿐이다. 이것이 이 장의 절반을 차지하는 지연 실행(29.6절)의 출발점이다.

### 런타임 동작 — `Where`의 실제 구현

`Enumerable.Where`가 무엇을 하는지는 놀라울 만큼 간단하다. 예외 처리를 뺀 본질은 반복자 메서드 한 개다.

```csharp
public static IEnumerable<TSource> Where<TSource>
    (this IEnumerable<TSource> source, Func<TSource, bool> predicate)
{
    foreach (TSource element in source)
        if (predicate(element))
            yield return element;
}
```

28.3절에서 본 `yield return`이다. 즉 `Where`를 호출하면 컴파일러가 만든 상태 기계 클래스의 인스턴스 하나가 생기고, 그게 반환된다. `foreach`가 시작되기 전까지 `source`는 건드려지지 않는다.

> **⚠️ 실제 BCL 구현은 이보다 복잡하다**
>
> 위 코드는 **의미론적으로** 정확하지만 실제 `System.Linq`의 구현은 아니다. 실제 구현은 입력 타입(`T[]`, `List<T>`, 그 외)마다 특수화된 반복자 클래스를 쓰고, `Where(...).Select(...)`처럼 연쇄될 때 두 반복자를 하나로 합치는 최적화(`WhereSelectArrayIterator` 같은 것)를 한다. 이 클래스들은 전부 `internal`이고 **버전마다 이름과 구조가 바뀐다.** 코드가 이 타입 이름에 의존하면 안 된다.

### 성능 영향 — 무엇이 할당되는가

`names.Where(n => n.Length >= 4)` 한 줄이 만드는 힙 할당은 다음과 같다.

| 할당되는 것 | 개수 | 회피 가능성 |
|---|---|---|
| `Func<string,bool>` 델리게이트 | 1 (외부 변수를 캡처하지 않으면 최초 1회만, 이후 캐시 재사용) | 캡처를 없애면 캐시됨 |
| 디스플레이 클래스(클로저) | 캡처가 있을 때만 1 | `static` 람다·캡처 제거로 회피 (26.11절) |
| `Where` 반복자 객체 | 1 | 회피 불가 |
| 열거자 객체 | `foreach`할 때마다 1 | 회피 불가 (구조체 열거자 아님) |

연산자를 하나 붙일 때마다 이 목록이 한 벌씩 늘어난다. 원소 수가 많으면 무시할 만하고, **작은 시퀀스를 뜨거운 루프 안에서 반복해서 쿼리하면 이 상수 비용이 지배적**이 된다. 구체적인 측정과 대안은 30.14절에서 다룬다.

> **💡 "LINQ는 느리다"는 말의 정확한 뜻**
>
> LINQ가 느린 것이 아니라 **추상화 계층당 상수 비용이 붙는다**. 원소 10만 개를 한 번 훑는 쿼리에서 이 비용은 측정되지 않는다. 원소 3개짜리 배열을 초당 100만 번 쿼리하는 코드에서는 지배적이다. "LINQ를 쓰지 마라"가 아니라 **"뜨거운 루프 안에서 쿼리를 재구축하지 마라"** 가 맞는 조언이다.

### 두 개의 문법

여기까지 쓴 것 — 확장 메서드를 이어 붙이고 람다를 넘기는 방식 — 을 이 책에서는 **플루언트 구문(fluent syntax)** 이라고 부른다. C#에는 쿼리를 쓰는 두 번째 문법이 있다. **쿼리 식 구문(query expression syntax)**, 줄여서 **쿼리 구문**이다.

```csharp
IEnumerable<string> filteredNames = from n in names
                                    where n.Contains("a")
                                    select n;
```

두 문법은 대립 관계가 아니라 보완 관계다. 다음 두 절에서 각각을 판다.

> **📌 플루언트 구문의 다른 이름들**
>
> 이 문법을 부르는 이름은 통일되어 있지 않다. **메서드 구문(method syntax)**, **점 구문(dot syntax)**, **람다 구문(lambda syntax)**, **플루언트 구문** 모두 같은 것을 가리킨다. 다른 문서에서 다른 이름을 보더라도 미묘한 의미 차이를 찾지 마라. 없다.

---

## 29.2 플루언트 구문 — 연산자 체이닝, 람다 합성, 자연 순서

### 연산자를 이어 붙이기

복잡한 쿼리는 연산자를 **체인**으로 이어 만든다. 다음 쿼리는 "a"를 포함하는 문자열만 골라, 길이순으로 정렬하고, 대문자로 바꾼다.

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

IEnumerable<string> query = names
    .Where  (n => n.Contains("a"))
    .OrderBy(n => n.Length)
    .Select (n => n.ToUpper());

foreach (string name in query) Console.WriteLine(name);
// JAY
// MARY
// HARRY
```

`Where`, `OrderBy`, `Select`는 모두 `Enumerable`의 확장 메서드로 해석된다. `Where`는 걸러진 시퀀스를, `OrderBy`는 정렬된 시퀀스를, `Select`는 각 원소를 람다로 변환(투영)한 시퀀스를 내놓는다. 데이터는 **왼쪽에서 오른쪽으로** 흐른다 — 먼저 걸러지고, 그다음 정렬되고, 마지막에 투영된다.

```text
   names                Where            OrderBy            Select
┌──────────┐        ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Tom      │        │          │      │          │      │          │
│ Dick     │───────→│ Contains │─────→│ 길이순    │─────→│ ToUpper  │───→ 결과
│ Harry    │        │  ("a")   │      │  정렬     │      │          │
│ Mary     │        │          │      │          │      │          │
│ Jay      │        └──────────┘      └──────────┘      └──────────┘
└──────────┘         Harry,Mary,Jay    Jay,Mary,Harry    JAY,MARY,HARRY
```

컨베이어 벨트를 이어 붙인 생산 라인을 떠올리면 정확하다. 다만 이 생산 라인은 **아무도 요구하지 않으면 한 칸도 굴러가지 않는다** — 그 얘기는 29.6절에서 한다.

> **📌 람다 매개변수 이름은 재사용해도 된다**
>
> 위 쿼리에서 `n`이 세 번 나온다. 세 개는 **서로 다른 변수**다. 각 람다에 사적으로 스코프되기 때문이다. 다음 코드에서 `c`를 세 번 쓸 수 있는 것과 같은 이유다.
>
> ```csharp
> void Test()
> {
>     foreach (char c in "string1") Console.Write(c);
>     foreach (char c in "string2") Console.Write(c);
>     foreach (char c in "string3") Console.Write(c);
> }
> ```

세 연산자의 시그니처를 나란히 놓아 보자(`OrderBy`는 조금 단순화했다).

```csharp
public static IEnumerable<TSource> Where<TSource>
    (this IEnumerable<TSource> source, Func<TSource, bool> predicate);

public static IEnumerable<TSource> OrderBy<TSource, TKey>
    (this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);

public static IEnumerable<TResult> Select<TSource, TResult>
    (this IEnumerable<TSource> source, Func<TSource, TResult> selector);
```

체인이 성립하는 이유가 여기 있다. 한 연산자의 **출력 시퀀스가 다음 연산자의 입력 시퀀스**이고, 셋 다 `IEnumerable<T>`를 받아 `IEnumerable<T>`를 낸다.

> **⚠️ 쿼리 연산자는 입력 시퀀스를 절대 바꾸지 않는다**
>
> `OrderBy`는 원본 배열을 정렬하지 않는다. 정렬된 **새 시퀀스**를 내놓을 뿐이다. `Array.Sort`나 `List<T>.Sort`가 제자리에서 원본을 뒤집는 것과 정반대다. LINQ가 영향을 받은 함수형 패러다임의 원칙이고, 이 원칙 덕분에 같은 원본에 여러 쿼리를 겹쳐도 서로 간섭하지 않는다.
>
> 반대 방향의 함정도 있다. **쿼리는 원본을 바꾸지 않지만, 원본이 바뀌면 쿼리 결과는 바뀐다.** 29.7절에서 다룬다.

### 점진적으로 만들어도 결과는 같다

같은 쿼리를 단계별로 나눠 써도 완전히 동일하다.

```csharp
IEnumerable<string> filtered   = names   .Where  (n => n.Contains("a"));
IEnumerable<string> sorted     = filtered.OrderBy(n => n.Length);
IEnumerable<string> finalQuery = sorted  .Select (n => n.ToUpper());
```

`finalQuery`는 앞서 한 줄로 쓴 쿼리와 **합성 관점에서 동일한 객체 그래프**다. 게다가 중간 단계 각각이 그 자체로 유효한 쿼리라서 따로 실행할 수 있다.

```csharp
foreach (string name in filtered)   Console.Write(name + "|");   // Harry|Mary|Jay|
Console.WriteLine();
foreach (string name in sorted)     Console.Write(name + "|");   // Jay|Mary|Harry|
Console.WriteLine();
foreach (string name in finalQuery) Console.Write(name + "|");   // JAY|MARY|HARRY|
```

이 성질(합성 가능성)은 29.9절의 합성 전략 전체의 근거가 된다.

### 확장 메서드가 없었다면

확장 메서드를 쓰지 않고 정적 메서드 문법으로 같은 쿼리를 쓸 수 있다. 실제로 컴파일러가 만드는 것도 이 형태다.

```csharp
IEnumerable<string> filtered   = Enumerable.Where  (names, n => n.Contains("a"));
IEnumerable<string> sorted     = Enumerable.OrderBy(filtered, n => n.Length);
IEnumerable<string> finalQuery = Enumerable.Select (sorted, n => n.ToUpper());
```

단계를 나눠 쓰면 그럭저럭 읽을 만하다. 문제는 **한 문장으로 쓰려 할 때** 벌어진다.

```csharp
IEnumerable<string> query =
    Enumerable.Select(
        Enumerable.OrderBy(
            Enumerable.Where(
                names, n => n.Contains("a")
            ), n => n.Length
        ), n => n.ToUpper()
    );
```

읽기 어려운 이유가 두 가지다.

1. **호출 순서가 실행 순서와 반대다.** 가장 먼저 실행되는 `Where`가 소스에서 가장 안쪽·가장 아래에 있다.
2. **람다가 자기 연산자에서 멀리 떨어진다.** `n => n.ToUpper()`는 `Select`의 인수인데 그 사이에 코드 열 줄이 끼어 있다.

확장 메서드는 이 두 문제를 동시에 없앤다. 호출이 **중위 표기(infix)** 가 되면서 데이터가 흐르는 방향과 소스 코드를 읽는 방향이 일치하고, 각 람다가 자기 연산자 바로 옆에 붙는다. 지역 변수를 써서 순서를 되돌릴 수도 있지만, 그러면 `tmp1`, `tmp2` 같은 이름이 늘어나고 잘못된 변수를 쓰는 실수가 생긴다.

> **💡 확장 메서드의 진짜 가치는 "체이닝을 남의 타입에 붙일 수 있다"는 것**
>
> `IEnumerable<T>`는 LINQ에 대해 아무것도 모른다. 그 유일한 책임은 "일반적인 시퀀스"를 표현하는 것뿐이다. 필터링·그룹핑·조인 같은 연산을 전부 붙인 것은 `System.Linq.Enumerable`이라는 **완전히 별개의 정적 클래스**다. 인터페이스를 건드리지 않고도 그 인터페이스를 구현한 모든 타입에 유창한 API를 얹을 수 있다는 것 — 이것이 확장 메서드가 LINQ의 필수 부품인 이유다.

### 람다 합성 — 연산자마다 람다의 역할이 다르다

같은 모양의 람다라도 어떤 연산자에 넘기느냐에 따라 의미가 달라진다.

| 연산자 | 람다의 역할 | 요구 반환 타입 |
|---|---|---|
| `Where` | 이 원소를 출력에 포함할 것인가 | `bool` |
| `OrderBy` | 이 원소의 정렬 키는 무엇인가 | 임의 (`TKey`) |
| `Select` | 이 원소를 무엇으로 바꿀 것인가 | 임의 (`TResult`) |

값 하나를 받아 `bool`을 돌려주는 람다를 **술어(predicate)** 라고 부른다.

> **📌 쿼리 연산자의 람다는 언제나 "원소 하나"를 다룬다**
>
> 시퀀스 전체를 다루는 람다는 없다. 쿼리 연산자는 필요할 때마다, 보통 입력 원소마다 한 번씩 람다를 평가한다. 이 단순한 규약 덕분에 연산자 구현이 몇 줄로 끝나고, 대신 사용자가 임의의 로직을 꽂아 넣을 수 있다.

### 타입 매개변수 이름 규약

표준 쿼리 연산자는 다음 이름 규약을 지킨다. 시그니처를 읽을 때 도움이 된다.

| 타입 매개변수 | 의미 |
|---|---|
| `TSource` | 입력 시퀀스의 원소 타입 |
| `TResult` | 출력 시퀀스의 원소 타입 (`TSource`와 다를 때) |
| `TKey` | 정렬·그룹핑·조인에 쓰이는 키의 타입 |

`TSource`는 입력 시퀀스가 결정한다. `TResult`와 `TKey`는 보통 **람다에서 추론된다.**

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

IEnumerable<int> query = names.Select(n => n.Length);
foreach (int length in query) Console.Write(length + "|");   // 3|4|5|4|3|
```

`n.Length`가 `int`를 돌려주므로 `TResult`는 `int`로 추론되고, 결과 시퀀스의 타입은 `IEnumerable<int>`가 된다. **람다가 출력 시퀀스의 타입을 결정한다.**

`OrderBy`의 `TKey`는 입출력 원소 타입과 완전히 무관하다.

```csharp
IEnumerable<string> sortedByLength, sortedAlphabetically;

sortedByLength       = names.OrderBy(n => n.Length);   // TKey = int
sortedAlphabetically = names.OrderBy(n => n);          // TKey = string
```

`Where`만 타입 추론이 필요 없다. 원소를 거를 뿐 변환하지 않으므로 입력과 출력 원소 타입이 같기 때문이다.

> **⚠️ 람다 대신 메서드 그룹을 넘길 수 있다 — 로컬 쿼리에 한해서**
>
> `Enumerable`의 연산자에는 람다 대신 메서드를 가리키는 평범한 델리게이트를 넘겨도 된다.
>
> ```csharp
> static bool HasSpace(string s) => s.Contains(" ");
> // ...
> var q = names.Where(HasSpace);    // 메서드 그룹 변환 (26.3절)
> ```
>
> 이 방식은 `IQueryable<T>` 기반 시퀀스(데이터베이스 쿼리 등)에서는 **동작하지 않는다.** `Queryable`의 연산자는 식 트리를 만들어야 하므로 람다 식 자체를 요구하기 때문이다. 31.1절에서 이 차이를 판다.

### 자연 순서 — 입력 순서는 의미가 있다

LINQ에서 **입력 시퀀스의 원래 순서는 중요하다.** `Take`, `Skip`, `Reverse` 같은 연산자는 이 순서에 전적으로 의존한다.

```csharp
int[] numbers = { 10, 9, 8, 7, 6 };

IEnumerable<int> firstThree = numbers.Take(3);      // { 10, 9, 8 }
IEnumerable<int> lastTwo    = numbers.Skip(3);      // { 7, 6 }
IEnumerable<int> reversed   = numbers.Reverse();    // { 6, 7, 8, 9, 10 }
```

로컬 쿼리(LINQ to Objects)에서 `Where`나 `Select`는 **입력 순서를 보존한다.** 순서를 바꾸는 것이 목적인 연산자를 제외하면 나머지 연산자도 마찬가지다.

> **⚠️ 이 보장은 로컬 쿼리에만 있다**
>
> 데이터베이스 쿼리(31장)에는 "자연 순서"라는 것이 없다. SQL의 집합에는 `ORDER BY` 없이는 순서가 정의되지 않는다. 로컬에서 `ORDER BY` 없이도 맞게 나오던 코드가 데이터베이스로 옮기면 무작위로 깨진다. 병렬 실행(PLINQ, 50.3절)도 기본적으로는 순서를 보존하지 않는다.

### 시퀀스를 돌려주지 않는 연산자들

모든 쿼리 연산자가 시퀀스를 돌려주는 것은 아니다. 이 구별은 29.6절의 지연 실행 규칙과 직결되므로 지금 짚어 둔다.

**요소 연산자(element operator)** 는 원소 하나를 뽑는다.

```csharp
int[] numbers   = { 10, 9, 8, 7, 6 };
int firstNumber = numbers.First();                          // 10
int lastNumber  = numbers.Last();                           // 6
int secondNumber= numbers.ElementAt(1);                     // 9
int secondLowest= numbers.OrderBy(n => n).Skip(1).First();  // 7
```

**집계 연산자(aggregation operator)** 는 보통 숫자인 스칼라 값을 돌려준다.

```csharp
int count = numbers.Count();   // 5
int min   = numbers.Min();     // 6
```

**한정자(quantifier)** 는 `bool`을 돌려준다.

```csharp
bool hasTheNumberNine        = numbers.Contains(9);          // true
bool hasMoreThanZeroElements = numbers.Any();                // true
bool hasAnOddElement         = numbers.Any(n => n % 2 != 0); // true
```

**입력 시퀀스를 둘 받는 연산자**도 있다.

```csharp
int[] seq1 = { 1, 2, 3 };
int[] seq2 = { 3, 4, 5 };

IEnumerable<int> concat = seq1.Concat(seq2);   // { 1, 2, 3, 3, 4, 5 }
IEnumerable<int> union  = seq1.Union(seq2);    // { 1, 2, 3, 4, 5 }
```

조인 연산자들도 이 부류다. 개별 연산자의 오버로드와 정확한 의미론은 30장에서 전수한다.

> **💡 `First()`와 `Single()`을 구별해서 써라**
>
> `First()`는 "적어도 하나 있고, 그중 첫 번째"를 뜻하고 `Single()`은 "정확히 하나뿐"을 뜻한다. 코드에 의도를 박아 넣는 값싼 방법이다. 자세한 규칙은 30.13절에서 다룬다.

---

## 29.3 쿼리 식 — 범위 변수, 투명 식별자

### 문법

C#은 LINQ 쿼리를 쓰기 위한 문법적 지름길을 제공한다. **쿼리 식(query expression)** 이다. 29.2절의 쿼리를 쿼리 구문으로 다시 쓰면 이렇다.

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

IEnumerable<string> query =
    from    n in names
    where   n.Contains("a")      // 원소를 거른다
    orderby n.Length             // 원소를 정렬한다
    select  n.ToUpper();         // 각 원소를 변환한다(투영)

foreach (string name in query) Console.WriteLine(name);
// JAY
// MARY
// HARRY
```

쿼리 식은 **반드시 `from` 절로 시작해서 `select` 절이나 `group` 절로 끝난다.** `from` 절은 **범위 변수(range variable)** 를 선언한다 — 여기서는 `n`이다. 입력 시퀀스 위를 훑고 지나가는 것이라고 생각하면 된다. `foreach`의 반복 변수와 느낌이 비슷하지만, 뒤에서 보듯 실체는 다르다.

절이 놓일 수 있는 순서는 다음과 같다.

```text
  from ─┐
        ↓
   ┌──────────────────────────────────────────────┐
   │  ┌→ where ──┐                                │
   │  ├→ orderby ┤                                │
   ├──┤→ let ────┼──┐                             │
   │  ├→ join ───┤  │                             │
   │  └→ from ───┘  │                             │
   │        ↑       ↓                             │
   │        └───────┤   (원하는 만큼 반복)          │
   └────────────────┼─────────────────────────────┘
                    ↓
            ┌→ select ─┐
            └→ group ──┤
                       ↓
                  ┌─ into ──→ (쿼리를 여기서 "다시 시작")
                  └─ 끝
```

읽는 법은 이렇다. 필수인 `from` 절 뒤에는 `where`, `orderby`, `let`, `join`을 원하는 만큼 넣을 수 있고, 그다음 `select`나 `group`으로 끝내거나, `into`로 쿼리를 이어 갈 수 있다.

> **⚠️ 쿼리 식은 SQL을 C#에 박아 넣은 것이 아니다**
>
> 흔한 오해다. 쿼리 식의 설계는 SQL이 아니라 **LISP·Haskell 같은 함수형 언어의 리스트 내포(list comprehension)** 에서 왔다. SQL은 표면적인 영향만 줬다. 그래서 절의 순서가 SQL과 정반대다(SQL은 `SELECT`가 앞, LINQ는 `select`가 뒤). LINQ를 SQL에 일대일로 대응시키려 들면 반드시 좌절한다. 29.4절에서 차이를 정리한다.

### 컴파일 결과 — 쿼리 식은 C#에서 C#으로 번역된다

이 장에서 가장 중요한 사실이다. **컴파일러는 쿼리 식을 플루언트 구문으로 번역한다.** `foreach`를 `GetEnumerator`/`MoveNext` 호출로 낮추는 것(11.5절)과 비슷하게, 상당히 기계적으로.

위 쿼리는 (일차적으로) 다음으로 번역된다.

```csharp
IEnumerable<string> query = names
    .Where  (n => n.Contains("a"))
    .OrderBy(n => n.Length)
    .Select (n => n.ToUpper());
```

**따라서 쿼리 구문으로 쓸 수 있는 것은 전부 플루언트 구문으로도 쓸 수 있다.** 역은 성립하지 않는다(29.4절).

이 번역이 다른 언어 기능의 "낮춤"과 결정적으로 다른 점이 하나 있다. 명세는 이 번역을 **오버로드 해석과 바인딩이 일어나기 전에 수행되는 구문 변환(syntactic translation)** 으로 규정한다. 즉 컴파일러는 `Where`, `OrderBy`, `Select`라는 **단어를 기계적으로 소스에 꽂아 넣고**, 마치 사용자가 그 메서드 이름을 직접 타이핑한 것처럼 그때부터 평범하게 컴파일한다.

여기서 나오는 결과가 두 가지 있다.

**첫째, 바인딩 대상이 `Enumerable`로 고정되어 있지 않다.** 위 예제에서 `Where`가 `Enumerable.Where`로 해석된 것은 `System.Linq`가 가져와져 있고 `names`가 `IEnumerable<string>`이기 때문일 뿐이다. 데이터베이스 쿼리에서는 같은 단어가 `Queryable`의 확장 메서드로 바인딩된다(31.3절). 인스턴스 메서드로 바인딩될 수도 있고, `Select`라는 이름의 프로퍼티가 돌려주는 델리게이트를 호출하는 형태여도 명세상 문제가 없다.

**둘째, 필요한 메서드가 전부 있을 필요는 없다.** 쿼리 식 명세는 특정 메서드가 존재할 것을 **기대**하지만 전부 요구하지는 않는다. 적절한 `Select`, `Where`, `OrderBy`만 정의한 API를 만들면, 그 타입 위에서 위와 같은 쿼리는 쓸 수 있고 `join` 절이 들어간 쿼리는 컴파일 오류가 난다. 필요한 만큼만 있으면 된다.

> **⚠️ `using System.Linq`가 없으면 쿼리 식은 컴파일되지 않는다**
>
> 프로그램에서 `using System.Linq;`를 지우면 위 쿼리는 컴파일 오류가 난다. `Where`, `OrderBy`, `Select`가 바인딩될 곳이 없기 때문이다. 오류 메시지는 보통 `IEnumerable<string>`에 `Where`에 대한 정의가 없다는 형태로 나오는데, `where`라는 **키워드**를 썼는데 `Where`라는 **메서드**를 못 찾겠다는 메시지가 나오는 이유가 바로 이 번역 규칙이다.

### 범위 변수는 어떤 시퀀스를 훑는가

범위 변수는 `from` 키워드 바로 뒤의 식별자다. 현재 처리 중인 원소를 가리킨다.

앞의 예제에서 `n`은 모든 절에 등장한다. 그런데 각 절에서 `n`이 훑는 시퀀스는 **서로 다르다.**

```csharp
from    n in names
where   n.Contains("a")     // n = 배열에서 직접 온 것
orderby n.Length            // n = 걸러진 다음의 것
select  n.ToUpper()         // n = 정렬된 다음의 것
```

플루언트 번역을 보면 명확해진다.

```csharp
names.Where  (n => n.Contains("a"))      // 지역 스코프 n
     .OrderBy(n => n.Length)             // 지역 스코프 n
     .Select (n => n.ToUpper())          // 지역 스코프 n
```

`n`은 세 개의 서로 다른 람다 매개변수이고 각각 자기 람다에 사적으로 스코프된다. 쿼리 식에서 하나처럼 보이는 것은 **문법이 이름을 한 번만 쓰게 해 준 것**일 뿐이다.

> **📌 범위 변수는 변수가 아니다**
>
> 범위 변수는 지역 변수도, 필드도, 매개변수도 아니다. 대입할 수 없고, `ref`로 넘길 수 없고, 주소를 얻을 수 없다. 번역이 끝난 뒤에 **람다 매개변수**로 실체화될 뿐이다. C# 명세는 이것을 "쿼리 절 안에서 항목별 입력 역할을 하는 것"으로 규정한다.

새 범위 변수를 도입하는 절은 `from` 말고도 더 있다.

| 절 | 새 범위 변수를 만드는 방식 |
|---|---|
| `let` | 기존 범위 변수 옆에 계산된 값 하나를 추가한다 |
| `into` | 기존 범위 변수를 전부 버리고 새 것 하나로 다시 시작한다 |
| 추가 `from` | 중첩 시퀀스를 평탄화하며 변수를 추가한다 (`SelectMany`) |
| `join` | 조인 대상 시퀀스의 원소를 가리키는 변수를 추가한다 |

`let`과 `into`는 이 장에서(29.9절·29.10절), `join`과 추가 `from`은 30.3절·30.4절에서 다룬다.

### 투명 식별자 — 범위 변수가 둘 이상일 때

범위 변수가 하나뿐일 때는 위의 번역이 간단하다. 문제는 **동시에 두 개 이상이 살아 있을 때**다. `let` 절이 가장 단순한 예다.

```csharp
from word in words
let length = word.Length
where length > 4
orderby length
select string.Format("{0}: {1}", length, word.ToUpper());
```

`select` 절에서 `length`와 `word`를 **둘 다** 쓰고 있다. 그런데 번역 결과는 결국 `Where`, `OrderBy`, `Select`의 체인이고, 이 연산자들의 람다는 **매개변수를 하나만** 받는다. 어떻게 두 값을 동시에 넘기는가.

답은 이렇다. 컴파일러는 **원본 시퀀스를 "값의 쌍"의 시퀀스로 바꾼다.** 쌍을 표현하는 데는 익명 타입을 쓴다.

```csharp
words.Select (word => new { word, length = word.Length })
     .Where  (tmp => tmp.length > 4)
     .OrderBy(tmp => tmp.length)
     .Select (tmp => string.Format("{0}: {1}", tmp.length, tmp.word.ToUpper()));
```

여기서 `tmp`라는 이름은 번역의 일부가 **아니다.** C# 명세는 이 자리에 `*`라는 기호를 쓴다. 즉 **이름이 없다.** 소스에 쓸 수 없는 이름이고, 식 트리로 표현될 때 어떤 이름이 붙어야 하는지도 규정되어 있지 않다. 어차피 쿼리를 쓰는 사람 눈에는 보이지 않으므로 이름이 무엇이든 상관없다. 이것을 **투명 식별자(transparent identifier)** 라고 부른다.

"투명"이라는 이름의 뜻은 이렇다. `tmp.length`가 아니라 `length`라고 쓸 수 있다는 것 — 쌍을 감싼 껍데기가 **문법 수준에서 투명해서 보이지 않는다**는 뜻이다.

```text
원본 시퀀스                투명 식별자 도입 후
┌──────────┐              ┌────────────────────────┐
│ "keys"   │              │ { word="keys",   len=4 }│
│ "coat"   │  ── let ──→  │ { word="coat",   len=4 }│
│ "laptop" │              │ { word="laptop", len=6 }│
│ "bottle" │              │ { word="bottle", len=6 }│
└──────────┘              └────────────────────────┘
  원소 타입                 원소 타입: 컴파일러가 만든 익명 타입
  = string                 (소스에 이름이 없다 = 투명)
                            ↑
              이후 절의 람다 매개변수는 이 익명 타입 하나.
              `word`와 `length`는 그 매개변수의 프로퍼티 접근으로 번역된다.
```

투명 식별자를 만드는 절은 `let`만이 아니다. 추가 `from`(`SelectMany`)과 `join`도 같은 장치를 쓴다. 범위 변수가 셋이 되면 익명 타입이 중첩되어 `{ { word, length }, extra }` 같은 모양이 나온다.

> **📌 디컴파일러로 확인하기**
>
> 투명 식별자를 처음 보는 자리는 대개 디컴파일러다. ILSpy나 dotPeek으로 `let`이 들어간 쿼리를 열면 `<>f__AnonymousType0<string,int>` 같은 이름의 타입과 `<>h__TransparentIdentifier0` 같은 매개변수 이름이 튀어나온다. 앞의 것은 익명 타입, 뒤의 것은 컴파일러가 투명 식별자에 붙인 임시 이름이다. 소스에 없던 것이 튀어나왔다고 놀랄 필요 없다.

### 성능 영향 — 투명 식별자는 공짜가 아니다

투명 식별자는 문법적으로만 투명하다. **런타임에는 실제 객체가 만들어진다.**

원소마다 익명 타입 인스턴스가 하나씩 **힙에** 할당되고(익명 타입은 클래스다), 연산자 계층이 `Select` 하나만큼 늘어나며(반복자 객체 + 델리게이트), 이후 모든 절은 `tmp.word` 형태의 필드 로드를 한 단계 더 거친다.

원소 100만 개짜리 시퀀스에 `let`을 하나 쓰면 익명 타입 인스턴스 100만 개가 할당된다. 로컬 쿼리에서 이 비용이 문제가 되는 상황과 회피 방법은 30.15절에서 다룬다.

> **💡 데이터베이스 쿼리에서는 정반대다**
>
> 위 비용은 로컬 쿼리에만 해당한다. 해석되는 쿼리(31장)에서 `let`은 식 트리의 노드 몇 개로 끝나고, 최종적으로는 SQL의 컬럼 별칭이나 파생 테이블로 번역된다. 힙 할당이 원소 수만큼 생기지 않는다. **같은 문법이 실행 위치에 따라 전혀 다른 비용을 갖는다** — LINQ를 쓸 때 늘 의식해야 하는 지점이다.

### 컴파일러의 작은 최적화 하나

쿼리가 `select n`처럼 **범위 변수를 그대로 투영**하고 끝나면, 컴파일러는 마지막 `.Select(n => n)`을 **아예 생성하지 않는다.** 아무 일도 하지 않는 데코레이터 한 겹을 얹을 이유가 없기 때문이다.

```csharp
// 이 쿼리는
from n in names where n.Length > 3 select n

// 이렇게 번역된다 (.Select(n => n)이 없다)
names.Where(n => n.Length > 3)
```

> **⚠️ 이 생략에는 조건이 있다**
>
> 생략되는 것은 **`select` 절이 쿼리의 유일한 연산자가 아니면서** 범위 변수를 그대로 투영할 때다. `from n in names select n`처럼 `select`만 있는 쿼리에서는 `Select`가 생성된다. 그렇게 하지 않으면 쿼리 결과가 원본 컬렉션 **바로 그 객체**가 되어 버려서, 결과를 `List<T>`로 캐스팅해 원본을 수정하는 일이 가능해지기 때문이다. 사소해 보이지만 `(from x in list select x)`의 결과가 `list`와 참조 동일한지 아닌지는 실제로 문제가 되는 차이다.

---

## 29.4 쿼리 구문 vs 플루언트 구문 vs SQL 구문

### 쿼리 구문이 SQL과 다른 점

쿼리 식은 겉보기에 SQL을 닮았지만 근본이 다르다. LINQ 쿼리는 결국 **C# 식**이고, 따라서 C#의 표준 규칙을 따른다.

| 항목 | LINQ 쿼리 식 | SQL |
|---|---|---|
| 선언 순서 | 변수를 선언하기 전에 쓸 수 없다 | `SELECT` 절에서 `FROM` 절의 별칭을 먼저 참조할 수 있다 |
| 서브쿼리 | 그냥 또 하나의 C# 식이다. 특별한 문법이 없다 | 서브쿼리에 별도의 규칙이 있다 |
| 데이터 흐름 | 왼쪽에서 오른쪽으로 논리적으로 흐른다 | 절의 순서와 데이터 흐름이 잘 대응하지 않는다 |
| 처리 모델 | 시퀀스를 받고 내놓는 연산자의 파이프라인. **원소 순서가 의미를 가질 수 있다** | 대부분 **순서 없는 집합**을 다루는 절의 네트워크 |
| 타입 검사 | 컴파일 타임에 강타입 검사 | 실행 시점에 서버가 검사 |
| 절 순서 | `from` → … → `select` | `SELECT` → `FROM` → `WHERE` → `ORDER BY` |

마지막 항목이 가장 눈에 띄는 차이다. LINQ가 `select`를 뒤에 둔 이유는 실용적이다. `select`가 앞에 있으면 IDE가 `n.`을 타이핑하는 시점에 `n`의 타입을 모르므로 자동 완성을 줄 수 없다. `from`이 먼저 오면 그 시점부터 모든 절에서 타입이 확정된다.

> **⚠️ LINQ를 SQL로 번역해서 이해하려 들지 마라**
>
> LINQ 쿼리는 "SQL처럼 생긴 것"이지 SQL이 아니다. 많은 LINQ 쿼리가 비슷한 데이터베이스 쿼리와 **정확히 반대 형태**로 보인다. LINQ를 SQL에 직접 대응시키려 하면 반드시 막힌다. 정신 건강을 위해서는 LINQ 쿼리를 **"우연히 SQL처럼 보이는 고유한 문장"** 으로 취급하는 편이 낫다.

### 쿼리 구문에만 있는 것

쿼리 구문이 확실히 더 단순한 경우가 있다.

1. **`let` 절** — 범위 변수 옆에 새 변수를 도입한다. 플루언트로 쓰려면 익명 타입을 직접 만들고, 이후 모든 절에서 그 프로퍼티를 손으로 풀어 써야 한다.
2. **`SelectMany`, `Join`, `GroupJoin` 뒤에 바깥 범위 변수를 참조하는 경우** — 투명 식별자가 하는 일을 손으로 하게 된다.

두 경우 모두 본질은 같다. **컴파일러가 투명 식별자를 대신 만들어 주느냐**다. 손으로 익명 타입을 만들어 결과로 넘기고 다음 단계에서 다시 분해하는 일은 두세 단계만 넘어가도 금세 지겨워진다.

```csharp
// 쿼리 구문 — 컴파일러가 투명 식별자를 만든다
var q1 = from c in customers
         from o in c.Orders                       // SelectMany
         where o.Total > 100
         select new { c.Name, o.Id, o.Total };    // c와 o 둘 다 살아 있다

// 같은 것을 플루언트로 — 익명 타입을 손으로 만들고 손으로 분해한다
var q2 = customers
    .SelectMany(c => c.Orders, (c, o) => new { c, o })
    .Where(t => t.o.Total > 100)
    .Select(t => new { t.c.Name, t.o.Id, t.o.Total });
```

`q2`가 틀린 코드는 아니다. 다만 `t.c.`, `t.o.`가 눈에 계속 밟힌다. 단계가 셋, 넷으로 늘어나면 `t.t.c.` 같은 것이 나온다.

### 플루언트 구문에만 있는 것

반대 방향의 제약이 훨씬 크다. **쿼리 구문에 키워드가 있는 연산자는 다음이 전부다.**

| 쿼리 키워드 | 대응 연산자 |
|---|---|
| `where` | `Where` |
| `select` | `Select` |
| 추가 `from` | `SelectMany` |
| `orderby` | `OrderBy` / `ThenBy` |
| `orderby ... descending` | `OrderByDescending` / `ThenByDescending` |
| `group ... by` | `GroupBy` |
| `join ... on ... equals` | `Join` |
| `join ... into` | `GroupJoin` |
| `let` | `Select` + 익명 타입 (투명 식별자) |
| `into` | (연산자 없음 — 체인이 이어질 뿐) |

이 표에 없는 **나머지 전부** — `Take`, `Skip`, `Distinct`, `Count`, `Any`, `Sum`, `First`, `Concat`, `Union`, `Except`, `Reverse`, `ToList`, `Chunk`, `Zip`, `OfType`, `Cast` 등 — 는 쿼리 구문에 키워드가 없다. 쓰려면 최소한 부분적으로는 플루언트 구문을 써야 한다. 그리고 실무 쿼리 중 이 목록에 있는 연산자를 하나도 안 쓰는 것은 드물다.

또한 인덱스를 함께 받는 `Select`/`Where` 오버로드처럼 **키워드로 표현할 수 없는 오버로드**도 플루언트 전용이다.

```csharp
// 인덱스 오버로드는 쿼리 구문으로 표현할 수 없다
var indexed = names.Select((n, i) => $"{i}: {n}");
```

### 어느 쪽을 쓸 것인가

| 상황 | 권장 |
|---|---|
| 연산자가 하나뿐인 쿼리 | 플루언트 (`from`/`select` 껍데기가 순수한 잡음이다) |
| `Where` + `OrderBy` + `Select` 정도의 단순 조합 | 어느 쪽이든. 취향 |
| `let`이 들어간다 | 쿼리 구문 |
| `join`, `group join`, 다중 `from`이 들어가고 이후 절에서 바깥 변수를 쓴다 | 쿼리 구문 |
| 키워드가 없는 연산자가 필요하다 | 플루언트 (또는 혼합, 29.5절) |
| 쿼리 끝에 `ToList()`/`Count()`를 붙인다 | 플루언트 (쿼리 구문이면 전체를 괄호로 감싸야 한다) |
| 조건부로 연산자를 붙였다 뗐다 한다 | 플루언트 (29.9절) |

단순 필터 하나만 있는 쿼리를 비교해 보면 차이가 분명하다.

```csharp
// 쿼리 구문 — 세 줄 중 두 줄이 껍데기다
from word in words
where word.Length > 4
select word

// 플루언트 — 한 줄
words.Where(word => word.Length > 4)
```

둘은 **완전히 같은 코드로 컴파일된다**(29.3절의 `Select` 생략 규칙 덕분이다). 이 정도면 두 번째를 쓰는 것이 낫다.

> **💡 한쪽만 쓰겠다고 정하지 마라**
>
> "우리 팀은 쿼리 구문만 쓴다"거나 "플루언트만 쓴다"는 규칙은 둘 다 손해다. 쿼리 구문은 컴파일러가 투명 식별자를 대신 만들어 줄 때 빛나고, 플루언트는 그 밖의 모든 곳에서 짧다. 두 문법 모두 편해져야 상황에 맞는 쪽을 고를 수 있고, 무엇보다 **혼합 구문**(29.5절)을 쓸 수 있다. 어느 한쪽에 자신을 묶으면 가장 좋은 선택지가 보이지 않게 된다.

> **⚠️ 쿼리 식은 지역 변수 선언 규칙을 그대로 따른다**
>
> 쿼리 식 안에서 범위 변수 이름을 바깥 지역 변수와 겹치게 쓰면 컴파일 오류가 난다. 마찬가지로 서브쿼리(29.8절)에서 바깥 범위 변수와 같은 이름을 다시 쓸 수 없다. SQL에서는 별칭을 얼마든지 겹칠 수 있으므로 이 지점에서 자주 걸린다. "이건 C# 식이다"라는 원칙을 기억하면 예측이 된다.

---

## 29.5 혼합 구문 쿼리

### 규칙은 하나뿐이다

쿼리 구문에 키워드가 없는 연산자를 쓰고 싶으면 두 문법을 섞으면 된다. 제약은 하나다. **각 쿼리 구문 조각이 완결되어 있어야 한다** — `from` 절로 시작해서 `select`나 `group` 절로 끝나야 한다.

완결된 쿼리 식을 괄호로 감싸면 그 자체가 하나의 식이므로, 뒤에 점을 찍고 아무 연산자나 붙일 수 있다.

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

// "a"를 포함하는 이름의 개수
int matches = (from n in names where n.Contains("a") select n).Count();   // 3

// 알파벳 순으로 첫 번째 이름
string first = (from n in names orderby n select n).First();              // Dick
```

이 두 예제만 놓고 보면 혼합 구문이 딱히 이득은 아니다. 플루언트로 쓰면 더 짧다.

```csharp
int matches  = names.Where(n => n.Contains("a")).Count();   // 3
string first = names.OrderBy(n => n).First();               // Dick
```

혼합 구문의 값어치는 **앞부분이 충분히 복잡할 때** 나온다. `let`이나 다중 `from`이 들어간 쿼리를 쿼리 구문으로 쓰고, 마지막 집계나 변환만 플루언트로 붙이는 형태가 전형적이다.

```csharp
// 앞은 쿼리 구문(let, 다중 from), 뒤는 플루언트(Distinct, Take, ToList)
List<string> top = (from o in orders
                    from item in o.Items
                    let label = $"{o.Customer}/{item.Sku}"
                    where item.Quantity > 0
                    orderby label
                    select label)
                   .Distinct()
                   .Take(20)
                   .ToList();
```

`Distinct`, `Take`, `ToList` 어느 것도 쿼리 키워드가 없다. 그렇다고 앞부분 전체를 `SelectMany` + 익명 타입으로 손수 풀어 쓸 이유도 없다. 이럴 때 혼합이 가장 좋다.

### 어디까지가 쿼리 식인가

괄호의 위치를 잘못 잡으면 컴파일 오류가 나거나, 더 나쁘게는 **의도와 다른 쿼리가 컴파일된다.**

```csharp
// (A) 쿼리 전체의 결과에 Count()
int a = (from n in names where n.Contains("a") select n).Count();

// (B) select 절 안에서 각 원소마다 Count() — 완전히 다른 쿼리
IEnumerable<int> b = from n in names where n.Contains("a") select n.Count();
```

(A)는 `int` 하나를, (B)는 각 이름의 글자 수 시퀀스를 낸다. `select` 절의 식은 **원소 하나**에 대한 식이라는 원칙(29.2절)을 기억하면 헷갈리지 않는다.

> **⚠️ 쿼리 식은 괄호 없이는 뒤에 점을 찍을 수 없다**
>
> ```csharp
> // 컴파일 오류
> int n = from x in names select x .Count();
> ```
>
> 이 코드에서 `.Count()`는 `select` 절의 식 `x`에 붙는 것으로 파싱된다. 쿼리 식 전체에 연산자를 붙이려면 **반드시** 괄호로 감싸야 한다. 이 사소한 문법 요구가 "쿼리 끝에 `ToList()`를 붙일 일이 많으면 처음부터 플루언트로 쓰는 게 낫다"는 판단의 근거다.

### 반대 방향의 혼합

플루언트 체인 안쪽에 쿼리 식을 넣는 것도 된다. 완결된 쿼리 식은 그냥 식이므로 인수 자리에 놓을 수 있다.

```csharp
var carDiff = (from c in myCars select c)
              .Except(from c2 in yourCars select c2);
```

다만 이 형태는 실무에서 거의 이득이 없다. 위 코드는 `myCars.Except(yourCars)`와 결과가 같고, `select c` / `select c2`는 순수한 잡음이다.

> **💡 혼합 구문의 실전 판단 기준**
>
> - **쿼리 구문 조각이 두 줄 이하로 줄어들면** 그냥 전부 플루언트로 써라. `from x in xs select x`는 정보가 0인 코드다.
> - **쿼리 구문 조각이 `let`이나 다중 `from`을 포함하면** 유지해라. 플루언트로 풀면 반드시 익명 타입이 튀어나온다.
> - **괄호가 세 겹 이상 중첩되면** 쿼리를 두 문장으로 쪼개라(29.9절의 점진적 구축). 지연 실행 덕분에 나눠 써도 실행 비용이 늘지 않는다.

---

## 29.6 지연 실행의 동작 원리 — 데코레이터 체인

### 문법 — 쿼리는 만들 때가 아니라 열거할 때 실행된다

대부분의 쿼리 연산자의 중요한 성질은 **구성될 때가 아니라 열거될 때 실행된다**는 것이다. 정확히는 열거자의 `MoveNext`가 호출될 때다.

```csharp
var numbers = new List<int> { 1 };

IEnumerable<int> query = numbers.Select(n => n * 10);   // 쿼리를 만든다

numbers.Add(2);                                         // 원소를 몰래 하나 넣는다

foreach (int n in query)
    Console.Write(n + "|");                             // 10|20|
```

쿼리를 만든 **뒤에** 추가한 숫자가 결과에 포함된다. `foreach` 문이 돌기 전까지 아무 필터링도 정렬도 일어나지 않기 때문이다. 이것을 **지연 실행(deferred execution)** 또는 **지연 평가(lazy evaluation)** 라고 한다.

델리게이트와 같은 원리다.

```csharp
Action a = () => Console.WriteLine("Foo");
// 아직 콘솔에 아무것도 안 찍혔다. 이제 실행한다:
a();   // 지연 실행!
```

### 지연되지 않는 연산자

**표준 쿼리 연산자는 다음 두 부류를 제외하고 전부 지연 실행이다.**

| 부류 | 예 | 왜 즉시 실행인가 |
|---|---|---|
| 원소 하나나 스칼라 값을 돌려주는 연산자 | `First`, `Last`, `Single`, `ElementAt`, `Count`, `Sum`, `Min`, `Max`, `Average`, `Any`, `All`, `Contains`, `Aggregate` | 반환 타입이 지연 실행을 제공할 메커니즘 자체를 갖고 있지 않다 |
| 변환 연산자 | `ToArray`, `ToList`, `ToDictionary`, `ToLookup`, `ToHashSet` | 결과가 이미 실체화된 컬렉션이다 |

```csharp
int matches = numbers.Where(n => n <= 2).Count();   // 여기서 즉시 실행된다
```

`Count`가 돌려주는 것은 단순한 `int`고, `int`는 나중에 열거되지 않는다. 그러니 그 자리에서 다 돌아야 한다.

> **⚠️ `AsEnumerable`, `Cast`, `OfType`은 즉시 실행이 아니다**
>
> 이름에 `To`가 붙지 않은 변환 연산자들은 지연 실행이다. `AsEnumerable()`은 컴파일 타임 타입만 바꾸고 아무것도 열거하지 않으며(31.5절), `Cast<T>()`와 `OfType<T>()`는 열거될 때 원소마다 변환·필터를 수행하는 데코레이터를 돌려준다. "이름이 `ToXxx`인가"가 즉시/지연을 가르는 실용적 기준이다.

지연 실행이 중요한 이유는 **쿼리 구성과 쿼리 실행을 분리**하기 때문이다. 그래서 쿼리를 여러 단계에 걸쳐 조립할 수 있고(29.9절), 데이터베이스 쿼리가 가능해진다(31장).

### 컴파일 결과 — 데코레이터 시퀀스

쿼리 연산자가 지연 실행을 제공하는 방법은 **데코레이터 시퀀스(decorator sequence)** 를 돌려주는 것이다.

배열이나 연결 리스트 같은 전통적 컬렉션과 달리, 데코레이터 시퀀스는 **원소를 담을 자기 자신의 저장 구조가 없다.** 대신 런타임에 넘겨받은 다른 시퀀스를 감싸고, 그 시퀀스에 대한 참조를 영구히 유지한다. 데코레이터에게 데이터를 요청하면, 데코레이터는 감싼 입력 시퀀스에게 다시 요청한다.

`Where`를 호출하면 만들어지는 것은 **입력 시퀀스에 대한 참조, 람다 델리게이트, 그 밖의 인수를 붙들고 있는 래퍼 객체 하나**뿐이다. 입력 시퀀스는 이 데코레이터가 열거될 때 비로소 열거된다.

```csharp
IEnumerable<int> lessThanTen = new int[] { 5, 12, 3 }.Where(n => n < 10);
```

```text
   lessThanTen (Where 데코레이터)
  ┌──────────────────────────────────┐
  │ source ────────────┐             │
  │ predicate: n => n < 10           │
  └────────────────────┼─────────────┘
                       ↓
                 ┌───────────┐
                 │ int[]     │
                 │ 5, 12, 3  │
                 └───────────┘
```

`lessThanTen`을 열거하면, 사실상 `Where`라는 데코레이터를 **통해서** 배열을 쿼리하는 것이다.

> **📌 데코레이터인가 프록시인가**
>
> 쿼리 연산자의 "변환"이 곧 "장식(decoration)"이다. 출력 시퀀스가 아무 변환도 하지 않는다면 그건 데코레이터가 아니다. `AsEnumerable()`이 그 극단이다 — 구현이 `source`를 **그대로 돌려주는** 한 줄이어서 객체가 하나도 새로 생기지 않고, 바뀌는 것은 컴파일 타임 타입뿐이다(31.5절).

데코레이터 시퀀스를 직접 만드는 것은 C# 반복자를 쓰면 아주 쉽다. 자기만의 `Select`를 써 보자.

```csharp
public static IEnumerable<TResult> MySelect<TSource, TResult>
    (this IEnumerable<TSource> source, Func<TSource, TResult> selector)
{
    foreach (TSource element in source)
        yield return selector(element);
}
```

`yield return` 덕분에 이 메서드는 반복자다. 기능적으로는 다음의 축약형이다.

```csharp
public static IEnumerable<TResult> MySelect<TSource, TResult>
    (this IEnumerable<TSource> source, Func<TSource, TResult> selector)
{
    return new SelectSequence(source, selector);
}
```

여기서 `SelectSequence`는 반복자 메서드의 로직을 열거자에 캡슐화한, **컴파일러가 만든 클래스**다(28.4절). 즉 `Select`나 `Where`를 호출하는 것은 **입력 시퀀스를 장식하는 열거 가능 클래스 하나를 인스턴스화하는 것 이상도 이하도 아니다.**

### 데코레이터 체인

연산자를 이어 붙이면 데코레이터가 겹겹이 쌓인다.

```csharp
IEnumerable<int> query = new int[] { 5, 12, 3 }
    .Where  (n => n < 10)
    .OrderBy(n => n)
    .Select (n => n * 10);
```

각 연산자는 이전 시퀀스를 감싸는 새 데코레이터를 만든다. 러시아 인형처럼. 그리고 이 객체 모델은 **열거가 시작되기 전에 이미 완전히 구성된다.**

```text
                query = Select 데코레이터
              ┌────────────────────────────────────┐
              │ selector: n => n * 10              │
              │ source ─────────────┐              │
              └─────────────────────┼──────────────┘
                                    ↓
                       OrderBy 데코레이터
                    ┌───────────────────────────┐
                    │ keySelector: n => n       │
                    │ source ────────┐          │
                    └────────────────┼──────────┘
                                     ↓
                          Where 데코레이터
                       ┌──────────────────────────┐
                       │ predicate: n => n < 10   │
                       │ source ────────┐         │
                       └────────────────┼─────────┘
                                        ↓
                                 ┌────────────┐
                                 │  int[]     │
                                 │  5, 12, 3  │
                                 └────────────┘
```

점진적으로 조립해도 **완전히 동일한 객체 모델**이 만들어진다.

```csharp
IEnumerable<int>
    source   = new int[] { 5, 12, 3 },
    filtered = source  .Where  (n => n < 10),
    sorted   = filtered.OrderBy(n => n),
    query    = sorted  .Select (n => n * 10);
```

> **📌 실제 런타임 타입 이름을 들여다보면**
>
> 쿼리 결과 변수의 실제 타입을 리플렉션으로 찍어 보면 낯선 이름이 나온다. 다음은 .NET 6 기준으로 관찰되는 예다.
>
> | 쿼리 | 실제 런타임 타입 (예시) |
> |---|---|
> | `arr.Where(...)` | `WhereArrayIterator<T>` |
> | `arr.Where(...).OrderBy(...)` | `OrderedEnumerable<TElement,TKey>` |
> | `arr.Where(...).OrderBy(...).Select(...)` | `SelectIPartitionIterator<TSource,TResult>` |
>
> (리플렉션의 `GetType().Name`으로 찍으면 제네릭 아리티가 붙은 ``WhereArrayIterator`1`` 같은 형태로 나온다.)
>
> 이 타입들은 전부 `System.Linq` 어셈블리 안의 `internal` 타입이다. **버전마다 이름도 구조도 바뀐다.** 전부 `IEnumerable<T>`를 구현하므로 사용자 코드에서는 구별할 필요가 없고, 구별하려 들어서도 안 된다. 다만 디버거의 `Results View`나 예외 스택 트레이스에서 이런 이름을 보게 되므로 정체는 알아 두는 편이 낫다.

> **⚠️ `ToList()`를 붙이면 객체 모델이 붕괴한다**
>
> 위 쿼리 끝에 `.ToList()`를 붙이면 앞의 연산자들이 **즉시** 실행되고, 데코레이터 객체 그래프 전체가 리스트 하나로 접힌다. 이후에는 원본이 바뀌어도 결과가 바뀌지 않는다. 이것이 29.7절의 "재평가 방어" 수단이고, 동시에 29.11절의 선택 기준이 된다.

### 런타임 동작 — 쿼리는 어떻게 실행되는가

```csharp
foreach (int n in query) Console.WriteLine(n);
// 30
// 50
```

무대 뒤에서 벌어지는 일은 이렇다. `foreach`는 **가장 바깥쪽(마지막) 연산자**인 `Select` 데코레이터의 `GetEnumerator`를 호출한다. 그것이 모든 것을 촉발한다. 결과는 데코레이터 체인의 구조를 그대로 반영하는 **열거자의 체인**이다.

```text
소비자              Select            OrderBy            Where           int[]
  │                  │                  │                  │               │
  │─ MoveNext() ────→│                  │                  │               │
  │                  │─ MoveNext() ────→│                  │               │
  │                  │                  │─ MoveNext() ────→│               │
  │                  │                  │  (정렬을 위해     │─ MoveNext()──→│  5
  │                  │                  │   전부 끌어옴)    │─ MoveNext()──→│  12 (탈락)
  │                  │                  │                  │─ MoveNext()──→│  3
  │                  │                  │←── 3, 5 ─────────│               │
  │                  │←── 3 ────────────│                  │               │
  │←── 30 ───────────│                  │                  │               │
```

29.1절의 컨베이어 벨트 비유를 확장하면, LINQ 쿼리는 **게으른 생산 라인**이다. 벨트는 요구가 있을 때만 구른다. 쿼리를 구성하는 것은 생산 라인을 세우는 것이다 — 모든 설비가 제자리에 있지만 **아무것도 움직이지 않는다.** 소비자가 원소를 하나 요구하면 가장 오른쪽 벨트가 돌기 시작하고, 그것이 필요한 만큼 왼쪽 벨트들을 차례로 깨운다.

**LINQ는 공급 주도(supply-driven push)가 아니라 수요 주도(demand-driven pull) 모델이다.** 이 성질이 나중에 LINQ가 SQL 데이터베이스까지 확장될 수 있게 만드는 핵심이 된다(31.3절).

### 스트리밍 연산자와 버퍼링 연산자

지연 실행이라고 해서 모두 "원소 하나 요청 → 원소 하나 생산"은 아니다. 첫 원소를 내놓기 위해 **입력 전체를 읽어야 하는** 연산자가 있다.

| 분류 | 동작 | 해당 연산자 (대표) |
|---|---|---|
| **스트리밍(streaming)** | 요청된 만큼만 입력에서 끌어온다 | `Where`, `Select`, `SelectMany`, `Take`, `TakeWhile`, `Skip`, `SkipWhile`, `Concat`, `Zip`, `Cast`, `OfType` |
| **버퍼링(buffering)** | 첫 원소를 내기 전에 입력 전체를 읽는다 | `OrderBy`, `ThenBy`, `Reverse`, `GroupBy`, `Chunk`, `TakeLast`/`SkipLast`, `Join`/`GroupJoin`(내부 시퀀스), `Intersect`/`Except`(두 번째 시퀀스) |
| **누적 상태 유지** | 출력은 스트리밍하지만 본 원소를 계속 기억한다 | `Distinct`, `Union` |

위 다이어그램에서 `OrderBy`가 `Where`로부터 원소를 **전부** 끌어온 이유가 이것이다. 정렬은 마지막 원소를 보기 전에는 첫 원소를 확정할 수 없다.

> **⚠️ 버퍼링 연산자는 무한 시퀀스를 멈추게 한다**
>
> ```csharp
> // 영원히 끝나지 않는다
> foreach (var x in InfiniteNumbers().OrderBy(n => n).Take(5)) { }
> ```
>
> `Take(5)`가 뒤에 있어도 소용없다. `OrderBy`가 첫 원소를 내놓기 위해 무한 시퀀스를 끝까지 읽으려 하기 때문이다. 스트리밍 연산자만으로 이루어진 체인은 무한 시퀀스에서도 안전하지만, 버퍼링 연산자가 하나라도 끼면 그렇지 않다.

> **⚠️ 버퍼링 연산자는 메모리를 O(n) 쓴다**
>
> `OrderBy`는 입력 전체를 배열에 담고 키 배열을 따로 만든 뒤 정렬한다. 원소 1,000만 개짜리 스트림을 `OrderBy`로 통과시키면 그만큼의 메모리를 쓴다. 파일이나 네트워크에서 흘러오는 데이터를 다룰 때 특히 조심해야 한다.

### 성능 영향 — 계층당 비용

데코레이터 체인은 우아하지만 공짜가 아니다. 원소 하나를 얻을 때마다 체인의 **모든 계층**을 통과한다.

| 비용 | 내용 |
|---|---|
| `MoveNext` 호출 | 계층 수만큼. 각각이 인터페이스 가상 호출(`callvirt`) |
| 델리게이트 호출 | 람다를 받는 연산자마다 원소당 1회 |
| 열거자 객체 | 계층마다 1개, `foreach` 시작 시 할당 |
| 상태 기계 필드 접근 | 계층마다 `_state`, `_current` 읽기/쓰기 |

원소 N개, 계층 L개짜리 쿼리는 대략 `N × L`번의 가상 호출과 `N ×`(람다를 쓰는 계층 수)번의 델리게이트 호출을 한다. 손으로 쓴 `for` 루프 하나와 비교하면 상수가 몇 배 붙는다.

> **💡 그럼에도 LINQ를 쓰는 이유**
>
> 위 비용은 실제로 존재하지만, 대부분의 코드에서 **측정되지 않는다.** 원소당 작업이 문자열 파싱이나 딕셔너리 조회 수준만 되어도 열거자 오버헤드는 노이즈에 묻힌다. 문제가 되는 지점은 (1) 원소당 작업이 극도로 싼 경우(정수 덧셈 같은), (2) 뜨거운 루프 안에서 쿼리 객체를 반복 생성하는 경우다. 정확한 측정 방법과 대안은 30.14절·30.15절, 그리고 67장에서 다룬다.

---

## 29.7 재평가와 캡처된 변수

### 재평가 — 다시 열거하면 다시 실행된다

지연 실행에는 두 번째 결과가 따라온다. **지연 실행 쿼리는 다시 열거할 때마다 다시 평가된다.**

```csharp
var numbers = new List<int>() { 1, 2 };

IEnumerable<int> query = numbers.Select(n => n * 10);
foreach (int n in query) Console.Write(n + "|");   // 10|20|

numbers.Clear();
foreach (int n in query) Console.Write(n + "|");   // <아무것도 안 나온다>
```

`query`는 결과를 담고 있지 않다. **결과를 만드는 방법**을 담고 있다. 소스가 비면 결과도 빈다.

관점을 바꿔서 보면 이건 기능이다. 같은 쿼리를 같은 컨테이너에 몇 번이고 적용해서 **언제나 최신 결과**를 얻을 수 있다.

```csharp
int[] numbers = { 10, 20, 30, 40, 1, 2, 3, 8 };
var subset = from i in numbers where i < 10 select i;

foreach (var i in subset) Console.WriteLine($"{i} < 10");   // 1, 2, 3, 8

numbers[0] = 4;                                             // 소스를 바꾼다

foreach (var j in subset) Console.WriteLine($"{j} < 10");   // 4, 1, 2, 3, 8
```

두 번째 열거에서 항목이 하나 늘었다. 배열의 첫 원소를 10보다 작은 값으로 바꿨기 때문이다.

재평가가 불리한 경우도 있다.

- 특정 시점의 결과를 **얼려서(freeze) 캐시**하고 싶을 때
- 쿼리가 계산량이 많거나 **원격 데이터베이스를 두드릴 때** — 불필요하게 반복하고 싶지 않다

이럴 때는 변환 연산자를 불러 재평가를 봉쇄한다. `ToArray`는 결과를 배열로, `ToList`는 `List<T>`로 복사한다.

```csharp
var numbers = new List<int>() { 1, 2 };

List<int> timesTen = numbers
    .Select(n => n * 10)
    .ToList();          // 여기서 즉시 실행되어 List<int>가 된다

numbers.Clear();
Console.WriteLine(timesTen.Count);   // 여전히 2
```

> **⚠️ 다중 열거는 조용한 성능 사고의 1위다**
>
> ```csharp
> IEnumerable<Order> expensive = orders.Where(o => Compute(o) > 1000);
>
> if (expensive.Any())                       // 1회차 열거
>     Console.WriteLine(expensive.Count());  // 2회차 열거
> foreach (var o in expensive) { }           // 3회차 열거
> ```
>
> `Compute`가 세 번 돈다. 그것이 데이터베이스 왕복이면 왕복이 세 번이다. 정적 분석기(ReSharper, Rider, 일부 Roslyn 분석기)가 "Possible multiple enumeration of IEnumerable"이라고 경고하는 것이 정확히 이 패턴이다. **두 번 이상 쓸 것이면 `ToList()`로 한 번 실체화해라.**

> **⚠️ 소스를 열거하는 도중에 소스를 수정하면 예외가 난다**
>
> 재평가는 "쿼리를 다시 열거하는 것"에 관한 얘기다. **열거 중에** 소스 컬렉션을 수정하는 것은 다른 문제다.
>
> ```csharp
> var list = new List<int> { 1, 2, 3 };
> foreach (var x in list.Where(n => n > 1))
>     list.Add(x);        // InvalidOperationException
> ```
>
> `List<T>`의 열거자는 버전 카운터를 검사해서 `InvalidOperationException`("Collection was modified…")을 던진다. 다만 **모든 컬렉션이 그런 것은 아니다.** 배열은 크기가 고정이라 이 문제가 없고, 일부 동시성 컬렉션(`ConcurrentDictionary` 등)은 열거 중 수정을 허용한다(24.12절). 던져지는 예외는 **소스 컬렉션의 구현이 결정한다.**

### 캡처된 변수 — 실행 시점의 값을 쓴다

쿼리의 람다가 외부 변수를 캡처하면, 그 쿼리는 **쿼리가 실행되는 시점의 값**을 존중한다.

```csharp
int[] numbers = { 1, 2 };

int factor = 10;
IEnumerable<int> query = numbers.Select(n => n * factor);
factor = 20;

foreach (int n in query) Console.Write(n + "|");   // 20|40|
```

`factor = 10`일 때 쿼리를 만들었지만 결과는 20, 40이다. 26.10절에서 본 대로 람다는 **변수의 값이 아니라 변수 자체**를 캡처하고, 지연 실행 때문에 람다가 실제로 호출되는 시점은 `factor = 20` 이후이기 때문이다.

두 기능(지연 실행 + 변수 캡처)이 각각은 합리적인데 겹치면 직관을 벗어난다.

```text
시간축 ────────────────────────────────────────────────→

  factor = 10
      │
      │   query = numbers.Select(n => n * factor)
      │       └─ 여기서 만들어지는 것: 데코레이터 객체 하나.
      │          람다는 factor라는 "변수 슬롯"을 붙들고 있다.
      │
  factor = 20      ← 변수 슬롯의 내용이 바뀐다
      │
      │   foreach (int n in query)
      │       └─ 여기서 비로소 람다가 호출된다.
      │          람다가 factor 슬롯을 읽는다 → 20
      ↓
```

### `for` 루프 안에서 쿼리를 조립하는 함정

문자열에서 모음을 전부 제거한다고 하자. 다음은 비효율적이지만 **정확한** 결과를 낸다.

```csharp
IEnumerable<char> query = "Not what you might expect";

query = query.Where(c => c != 'a');
query = query.Where(c => c != 'e');
query = query.Where(c => c != 'i');
query = query.Where(c => c != 'o');
query = query.Where(c => c != 'u');

foreach (char c in query) Console.Write(c);   // Nt wht y mght xpct
```

같은 것을 `for` 루프로 리팩터링하면 어떻게 되는지 보자.

```csharp
IEnumerable<char> query = "Not what you might expect";
string vowels = "aeiou";

for (int i = 0; i < vowels.Length; i++)
    query = query.Where(c => c != vowels[i]);

foreach (char c in query) Console.Write(c);   // 예외!
```

**쿼리를 열거하는 시점에 `IndexOutOfRangeException`이 던져진다.**

이유는 26.10절에서 본 그대로다. 컴파일러는 `for` 루프의 반복 변수를 **루프 바깥에서 선언된 것처럼** 스코프한다. 다섯 개의 클로저가 **같은 변수 `i`** 를 캡처하고, 쿼리가 실제로 열거될 때 그 값은 이미 5다. `vowels[5]`는 길이 5짜리 문자열의 범위 밖이므로 `string`의 인덱서가 `IndexOutOfRangeException`을 던진다.

해법은 루프 본문 **안에** 새 지역 변수를 만들어 거기 값을 복사하는 것이다.

```csharp
for (int i = 0; i < vowels.Length; i++)
{
    char vowel = vowels[i];
    query = query.Where(c => c != vowel);
}
```

이러면 반복마다 **새로운 지역 변수**가 캡처된다. 또 다른 해법은 `for`를 `foreach`로 바꾸는 것이다.

```csharp
foreach (char vowel in vowels)
    query = query.Where(c => c != vowel);
```

C# 5부터 `foreach`의 반복 변수는 반복마다 새로 선언되는 것으로 규정이 바뀌었기 때문에 이 코드는 그냥 맞다(26.10절).

> **⚠️ `for`와 `foreach`의 캡처 규칙 차이는 지금도 유효하다**
>
> C# 5의 변경은 **`foreach`에만** 적용되었다. `for` 루프의 반복 변수를 캡처하면 여전히 모든 클로저가 같은 변수를 본다. 언어 명세가 바뀔 여지도 거의 없다 — `for`의 반복 변수는 루프 전체에 걸쳐 하나여야 의미가 통하기 때문이다. **지연 실행 쿼리를 루프에서 조립할 때 이 차이가 예외로 폭발한다.**

> **⚠️ 예외는 조립 지점이 아니라 열거 지점에서 난다**
>
> 위 예제에서 스택 트레이스가 가리키는 곳은 `foreach` 문이지 `for` 루프가 아니다. 지연 실행이 오류 보고 시점을 뒤로 미루기 때문이다. 28.6절에서 본 "반복자 메서드의 인자 검증이 늦게 터지는 문제"와 같은 구조의 함정이다. 원인 코드와 증상 코드가 수십 줄, 때로는 수백 줄 떨어질 수 있다.

### 부수 효과가 있는 람다

쿼리 람다에 부수 효과를 넣으면 재평가와 정면으로 충돌한다.

```csharp
int calls = 0;
var q = numbers.Select(n => { calls++; return n * 2; });

foreach (var x in q) { }
foreach (var x in q) { }
Console.WriteLine(calls);   // numbers.Count * 2
```

로그를 찍거나 카운터를 올리는 정도라면 "몇 배로 늘었네" 정도로 끝나지만, 컬렉션을 수정하거나 파일을 쓰는 부수 효과라면 사고다.

> **💡 쿼리 람다는 순수 함수로 유지해라**
>
> 실무 규칙 하나로 압축하면 이렇다. **쿼리 람다 안에서는 아무것도 바꾸지 마라.** 읽기만 해라. 부수 효과가 필요하면 쿼리를 `ToList()`로 끝내고 그 결과 위에서 `foreach`를 돌려라. 몇 번 실행될지, 언제 실행될지를 추론하지 않아도 되는 코드가 된다.
>
> 이 규칙은 병렬 실행(50.3절)에서는 규칙이 아니라 **필수 조건**이 된다. PLINQ의 람다는 여러 스레드에서 동시에 호출된다.

### 쿼리를 필드로 두면 안 되는 이유

쿼리 결과를 클래스 필드로 두는 것은 가능하지만 거의 언제나 나쁜 생각이다.

```csharp
class LinqBasedFieldsAreClunky
{
    private static string[] currentVideoGames =
        { "Morrowind", "Uncharted 2", "Fallout 3", "Daxter", "System Shock 2" };

    // var를 쓸 수 없다(필드에는 암시적 타입이 안 된다) → 타입을 알아야 한다
    private IEnumerable<string> subset =
        from g in currentVideoGames
        where g.Contains(" ")
        orderby g
        select g;

    public void PrintGames()
    {
        foreach (var item in subset) Console.WriteLine(item);
    }
}
```

제약이 둘이다. **첫째, 필드에는 `var`를 쓸 수 없으므로** 결과 타입을 명시해야 하고, 따라서 익명 타입으로 투영하는 쿼리는 아예 필드가 될 수 없다(29.10절). **둘째, 필드 초기화자에서 참조하는 대상은 정적이어야 한다** — 인스턴스 필드를 참조할 수 없다.

> **⚠️ 그리고 더 큰 문제는 지연 실행이다**
>
> 위 `subset` 필드는 쿼리 **객체**를 붙들고 있고, 그 객체는 소스 배열에 대한 참조를 영구히 붙들고 있다(29.6절). 필드가 살아 있는 동안 소스도 살아 있다. 소스가 거대한 컬렉션이면 그대로 메모리 누수처럼 보인다. 게다가 `PrintGames()`를 호출할 때마다 쿼리가 다시 돈다. **쿼리는 지역에서 만들고, 필요하면 `ToList()`로 실체화한 결과를 필드에 담아라.**

---

## 29.8 서브쿼리와 지연 실행

### 서브쿼리란 무엇인가

**서브쿼리(subquery)** 는 다른 쿼리의 람다 식 안에 들어 있는 쿼리다. 다음은 음악가를 성(last name) 기준으로 정렬한다.

```csharp
string[] musos =
    { "David Gilmour", "Roger Waters", "Rick Wright", "Nick Mason" };

IEnumerable<string> query = musos.OrderBy(m => m.Split().Last());
```

`m.Split()`은 각 문자열을 단어 컬렉션으로 바꾸고, 거기에 `Last` 연산자를 부른다. `m.Split().Last()`가 서브쿼리고 `query`는 바깥 쿼리를 가리킨다.

서브쿼리가 허용되는 이유는 단순하다. **람다의 오른쪽에는 유효한 C# 식이면 무엇이든 올 수 있고, 서브쿼리는 그냥 또 하나의 C# 식이기 때문이다.** 서브쿼리에 대한 규칙이라는 것은 따로 없다. 람다 식의 규칙과 쿼리 연산자의 일반적 동작에서 자동으로 따라 나온다.

> **📌 이 책에서 "서브쿼리"의 범위**
>
> 일반적 의미의 "서브쿼리"는 더 넓지만, LINQ를 설명할 때 이 책은 **다른 쿼리의 람다 식 안에서 참조되는 쿼리**만을 서브쿼리라고 부른다. 쿼리 식 관점으로 바꿔 말하면, `from` 절을 제외한 **아무 절의 식 안에서** 참조되는 쿼리다.

서브쿼리는 자신을 감싼 식에 사적으로 스코프되며, **바깥 람다의 매개변수(쿼리 식이라면 바깥 범위 변수)를 참조할 수 있다.**

### 조금 더 복잡한 예

다음 쿼리는 배열에서 **가장 짧은 문자열과 길이가 같은** 문자열을 전부 뽑는다.

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

IEnumerable<string> outerQuery = names
    .Where(n => n.Length == names.OrderBy(n2 => n2.Length)
                                 .Select (n2 => n2.Length).First());
// Tom, Jay
```

쿼리 식으로는 이렇다.

```csharp
IEnumerable<string> outerQuery =
    from  n in names
    where n.Length ==
          (from n2 in names orderby n2.Length select n2.Length).First()
    select n;
```

> **⚠️ 바깥 범위 변수 이름을 서브쿼리에서 재사용할 수 없다**
>
> 바깥 범위 변수 `n`이 서브쿼리 안에서도 스코프에 있으므로, 서브쿼리의 범위 변수를 `n`으로 다시 쓸 수 없다. 그래서 위에서 `n2`를 썼다. SQL에서는 별칭을 겹쳐도 아무 문제가 없으므로 이 지점에서 자주 걸린다. **"LINQ 쿼리는 C# 식이다"** 라는 원칙이 여기서도 그대로 적용된다.

같은 쿼리를 더 짧게 줄일 수 있다.

```csharp
IEnumerable<string> query =
    from  n in names
    where n.Length == names.OrderBy(n2 => n2.Length).First().Length
    select n;
```

`Min` 집계 함수를 쓰면 더 짧아진다.

```csharp
IEnumerable<string> query =
    from  n in names
    where n.Length == names.Min(n2 => n2.Length)
    select n;
```

### 실행 타이밍 — 바깥에서 안으로

**서브쿼리는 그것을 감싼 람다 식이 평가될 때마다 실행된다.** 즉 서브쿼리는 **바깥 쿼리의 재량에 따라, 요구가 있을 때** 실행된다. 실행이 **바깥에서 안쪽으로** 진행된다고 말할 수 있다. 로컬 쿼리는 이 모델을 문자 그대로 따르고, 해석되는 쿼리(데이터베이스 쿼리)는 개념적으로 따른다.

```text
    바깥 쿼리 (Where)
  ┌──────────────────────────────────────────────────────┐
  │  원소 "Tom"  →  람다 평가 → 서브쿼리 1회 실행 → 3       │
  │  원소 "Dick" →  람다 평가 → 서브쿼리 1회 실행 → 3       │
  │  원소 "Harry"→  람다 평가 → 서브쿼리 1회 실행 → 3       │
  │  원소 "Mary" →  람다 평가 → 서브쿼리 1회 실행 → 3       │
  │  원소 "Jay"  →  람다 평가 → 서브쿼리 1회 실행 → 3       │
  └──────────────────────────────────────────────────────┘
                              ↑
              서브쿼리(names 전체를 정렬하고 First)가
              바깥 루프 반복마다 처음부터 다시 돈다
```

**서브쿼리는 바깥 루프 반복마다 한 번씩 실행된다.**

### 성능 영향 — 로컬 쿼리에서는 O(n²)

위 쿼리는 **데이터베이스 쿼리로는 이상적이다.** 하나의 단위로 처리되어 서버 왕복 한 번이면 끝난다. 하지만 **로컬 컬렉션에서는 비효율적이다.** 서브쿼리가 바깥 루프 반복마다 재계산되기 때문이다. 원소 n개에 대해 정렬(`O(n log n)`)이 n번 돌면 전체가 `O(n² log n)`이 된다.

해법은 서브쿼리를 **밖으로 빼내서 서브쿼리가 아니게 만드는 것**이다.

```csharp
int shortest = names.Min(n => n.Length);      // 한 번만 계산

IEnumerable<string> query = from  n in names
                            where n.Length == shortest
                            select n;
```

> **💡 로컬 컬렉션에서는 서브쿼리를 밖으로 빼는 것이 거의 언제나 옳다**
>
> 예외는 **상관 서브쿼리(correlated subquery)** — 바깥 범위 변수를 참조하는 서브쿼리다. 이건 밖으로 뺄 수가 없다. 바깥 원소마다 답이 다르기 때문이다. 상관 서브쿼리의 패턴과 최적화는 30.3절에서 다룬다.
>
> 반대로 **데이터베이스 쿼리에서는 밖으로 빼면 손해**인 경우가 많다. 빼내는 순간 왕복이 두 번이 되기 때문이다. 같은 리팩터링이 로컬에서는 최적화이고 원격에서는 비관화(pessimization)다.

### 서브쿼리는 바깥 쿼리를 즉시 실행시키지 않는다

`First`나 `Count` 같은 요소·집계 연산자는 즉시 실행 연산자다(29.6절). 그렇다면 서브쿼리에 `First`가 있으면 바깥 쿼리도 즉시 실행될까.

**아니다. 바깥 쿼리의 지연 실행은 그대로 유지된다.**

```csharp
IEnumerable<string> q =
    names.Where(n => n.Length == names.Min(n2 => n2.Length));
// 이 시점에 Min은 한 번도 호출되지 않았다
```

이유는 서브쿼리가 **간접적으로 호출되기 때문**이다. 로컬 쿼리에서는 델리게이트를 통해, 해석되는 쿼리에서는 식 트리를 통해. `Where`에 넘긴 람다 안에 `Min` 호출이 들어 있을 뿐이고, 그 람다는 아직 호출되지 않았다.

> **📌 서브쿼리는 또 하나의 간접 계층이다**
>
> 정리하면 이렇다. **서브쿼리 안의 모든 것은 지연 실행의 대상이다** — 집계 메서드와 변환 메서드까지 포함해서. `where n.Length == names.ToList().Count` 같은 코드에서 `ToList()`조차도 바깥 쿼리가 열거되기 전에는 호출되지 않는다. (물론 그렇게 쓰지 마라.)

### `Select` 안의 서브쿼리

`Select` 식 안에 서브쿼리를 넣으면 흥미로운 일이 생긴다. 로컬 쿼리에서는 **쿼리의 시퀀스를 투영하는 것**이 되고, 그 각각이 다시 지연 실행의 대상이다.

```csharp
var q = customers.Select(c => new
{
    c.Name,
    BigOrders = c.Orders.Where(o => o.Total > 1000)   // 이것 자체가 지연 쿼리다
});
```

`BigOrders`는 `IEnumerable<Order>`이고, 실제 필터링은 누군가 `BigOrders`를 열거할 때 일어난다. 효과는 대체로 투명하고, 열거하지 않은 항목의 비용을 아예 내지 않으므로 효율에 도움이 된다. `Select` 서브쿼리의 상세한 패턴은 30.3절에서 다시 다룬다.

> **⚠️ 지연된 서브쿼리를 데이터베이스에서 열거하면 N+1이 된다**
>
> 위와 같은 형태를 EF Core에서 쓰면, 바깥 쿼리 결과를 순회하면서 각 `BigOrders`를 열거할 때마다 별도의 데이터베이스 왕복이 발생할 수 있다. 이른바 N+1 문제다. 해석되는 쿼리에서 이것을 제어하는 방법(즉시 로딩, 프로젝션)은 31.7절·31.8절에서 다룬다.

### 서브쿼리와 쿼리 래핑의 구별

서브쿼리와 다음 절에서 볼 **쿼리 래핑(wrapping)** 은 겉모습이 비슷해서 자주 혼동된다. 둘 다 "안쪽 쿼리"와 "바깥쪽 쿼리"라는 개념이 있다. 그러나 실체는 전혀 다르다.

| 항목 | 서브쿼리 | 쿼리 래핑 (29.9절) |
|---|---|---|
| 안쪽 쿼리의 위치 | 바깥 쿼리의 **람다 식 안** | 바깥 쿼리의 **`from` 절의 소스** |
| 플루언트로 번역하면 | 람다 본문 안에 남는다 | **선형 연산자 체인**으로 펴진다 |
| 실행 횟수 | 바깥 원소마다 1회 | 전체에 걸쳐 1회 |
| 비유 | 컨베이어 벨트 **위에 올라타서** 벨트의 람다 일꾼이 필요할 때 깨우는 것 | 그냥 **앞쪽 컨베이어 벨트** |

컨베이어 벨트 비유로 돌아가면 확실해진다. 래핑에서 "안쪽" 쿼리는 그저 **앞선 벨트들**이다. 서브쿼리는 벨트 위에 얹혀 있다가 그 벨트의 람다 일꾼이 요청할 때 활성화된다.

---

## 29.9 합성 전략 — 점진적 쿼리 구축, `into`, 쿼리 래핑

복잡한 쿼리를 만드는 전략이 셋 있다.

1. **점진적 쿼리 구축(progressive query building)**
2. **`into` 키워드를 쓴 쿼리 계속(query continuation)**
3. **쿼리 래핑(wrapping queries)**

셋 다 체이닝 전략이고, **런타임에 완전히 동일한 쿼리를 만든다.** 어느 것을 쓸지는 순수하게 가독성 문제다.

### 점진적 쿼리 구축

장 앞부분에서 이미 봤다.

```csharp
var filtered = names   .Where  (n => n.Contains("a"));
var sorted   = filtered.OrderBy(n => n);
var query    = sorted  .Select (n => n.ToUpper());
```

각 연산자가 데코레이터 시퀀스를 돌려주므로, 결과는 한 줄짜리 쿼리와 **똑같은 데코레이터의 사슬**이다(29.6절). 점진적으로 만드는 데는 두 가지 이점이 있다.

**첫째, 쿼리를 쓰기가 쉬워진다.** 단계마다 타입이 확정되므로 IDE의 도움을 받기 좋고, 중간 단계를 따로 디버깅할 수 있다.

**둘째, 연산자를 조건부로 붙일 수 있다.** 이것이 실무에서 가장 큰 이유다.

```csharp
if (includeFilter)
    query = query.Where(...);
```

이 형태는 다음보다 **효율적이다.**

```csharp
query = query.Where(n => !includeFilter || <식>);
```

`includeFilter`가 `false`일 때, 앞의 형태는 연산자 계층을 아예 추가하지 않는다. 뒤의 형태는 계층을 하나 추가하고 원소마다 델리게이트를 호출해서 매번 `true`를 돌려받는다.

```csharp
// 실무에서 가장 흔한 형태: 검색 필터 조립
IEnumerable<Product> BuildQuery(
    IEnumerable<Product> source, string? name, decimal? maxPrice, bool inStockOnly)
{
    var q = source;
    if (!string.IsNullOrEmpty(name)) q = q.Where(p => p.Name.Contains(name));
    if (maxPrice.HasValue)           q = q.Where(p => p.Price <= maxPrice.Value);
    if (inStockOnly)                 q = q.Where(p => p.Stock > 0);
    return q.OrderBy(p => p.Name);
}
```

지연 실행 덕분에 이 함수는 **한 번도 데이터를 건드리지 않고** 쿼리 객체를 조립해서 돌려준다. 같은 코드가 `IQueryable<Product>`에서도 그대로 동작하며, 그 경우 SQL의 `WHERE` 절이 조건부로 조립된다(31.6절).

> **⚠️ 조건부 조립에서 캡처된 변수를 조심해라**
>
> 위 코드에서 `name`은 매개변수이므로 함수가 끝나도 클로저가 붙들고 있다. 호출자가 `name`을 나중에 바꿀 수는 없으니 안전하지만, 루프 안에서 조립할 때는 29.7절의 함정이 그대로 재현된다. `for` 루프로 조건을 여러 개 붙일 때는 반드시 루프 본문 안에서 지역 변수에 복사해라.

### 점진적 구축이 필요한 순간

쿼리 구문에서 점진적 구축이 **문법적으로 필요한** 경우가 있다. 이름 목록에서 모음을 제거한 뒤, 남은 길이가 2를 넘는 것만 알파벳순으로 보고 싶다고 하자.

플루언트로는 한 식으로 쓸 수 있다. **투영을 먼저 하고 필터링하면 된다.**

```csharp
IEnumerable<string> query = names
    .Select (n => n.Replace("a", "").Replace("e", "").Replace("i", "")
                   .Replace("o", "").Replace("u", ""))
    .Where  (n => n.Length > 2)
    .OrderBy(n => n);
// Dck
// Hrry
// Mry
```

이걸 쿼리 식으로 그대로 옮기려면 곤란해진다. **`select` 절은 `where`·`orderby` 뒤에 와야 하기 때문이다.** 순서를 맞추려고 투영을 마지막에 두면 결과가 달라진다.

```csharp
IEnumerable<string> query =
    from    n in names
    where   n.Length > 2                     // 모음 제거 "전"의 길이로 거른다
    orderby n
    select  n.Replace("a", "").Replace("e", "").Replace("i", "")
             .Replace("o", "").Replace("u", "");
// Dck
// Hrry
// Jy      ← 원래 결과에 없던 것
// Mry
// Tm      ← 원래 결과에 없던 것
```

원하는 결과를 쿼리 구문으로 얻는 첫 번째 방법이 점진적 구축이다.

```csharp
IEnumerable<string> query =
    from   n in names
    select n.Replace("a", "").Replace("e", "").Replace("i", "")
            .Replace("o", "").Replace("u", "");

query = from n in query where n.Length > 2 orderby n select n;
// Dck
// Hrry
// Mry
```

> **📌 정규식이 더 낫지만 데이터베이스에서는 안 된다**
>
> `Replace`를 다섯 번 부르는 대신 정규식 한 방이 낫다.
>
> ```csharp
> n => Regex.Replace(n, "[aeiou]", "")
> ```
>
> 다만 `string.Replace`는 **데이터베이스 쿼리로도 번역된다**는 장점이 있다. `Regex.Replace`는 대부분의 LINQ 공급자가 SQL로 번역하지 못한다. 로컬 컬렉션을 다루는 코드인지, 나중에 `IQueryable`로 옮길 코드인지에 따라 선택이 갈린다.

### `into` 키워드 — 쿼리 계속

`into`는 투영 뒤에 쿼리를 "계속"하게 해 주는 키워드로, 점진적 쿼리 구축의 축약형이다. 앞 예제를 `into`로 다시 쓰면 이렇다.

```csharp
IEnumerable<string> query =
    from   n in names
    select n.Replace("a", "").Replace("e", "").Replace("i", "")
            .Replace("o", "").Replace("u", "")
    into    noVowel
    where   noVowel.Length > 2
    orderby noVowel
    select  noVowel;
```

`into`를 쓸 수 있는 자리는 **`select` 절이나 `group` 절 바로 뒤뿐이다.** `into`는 쿼리를 "재시작"해서 새 `where`, `orderby`, `select` 절을 도입하게 해 준다.

> **📌 `into`에는 의미가 두 개 있다**
>
> `into` 키워드는 문맥에 따라 쿼리 식이 **전혀 다르게** 해석한다.
>
>
> - `select`나 `group` 절 **뒤에** 오면 — **쿼리 계속(query continuation)**. 이 절에서 다루는 것이다.
> - `join` 절 **안에** 오면 (`join ... into g`) — **`GroupJoin`**. 30.4절에서 다룬다.
>
> 같은 키워드가 두 가지 일을 하니 헷갈리기 쉽다. 판별법은 간단하다. **`join` 줄 안에 있으면 `GroupJoin`, 절 하나가 끝난 다음 줄에 홀로 있으면 쿼리 계속이다.**

> **📌 `into`에는 성능 페널티가 없다**
>
> 쿼리 식의 관점에서는 "쿼리를 재시작"하는 것으로 생각하는 게 편하지만, 최종 플루언트 형태로 번역되고 나면 **전부 하나의 쿼리**다. `into` 때문에 중간 컬렉션이 생기거나 소스를 두 번 읽는 일은 없다. 플루언트 구문에서 `into`에 해당하는 것은 그냥 **더 긴 연산자 체인**이다.

### `into`의 스코프 규칙

**`into` 뒤에서는 이전의 모든 범위 변수가 스코프를 벗어난다.** 다음은 컴파일되지 않는다.

```csharp
var query =
    from   n1 in names
    select n1.ToUpper()
    into    n2                      // 이 지점부터 n2만 보인다
    where   n1.Contains("x")        // 오류: n1은 스코프에 없다
    select  n2;
```

왜 그런지는 플루언트로 번역해 보면 즉시 보인다.

```csharp
var query = names
    .Select(n1 => n1.ToUpper())
    .Where (n2 => n1.Contains("x"));   // 오류: n1은 더 이상 존재하지 않는다
```

`Where` 필터가 돌 때 원래 이름(`n1`)은 이미 사라졌다. `Where`의 입력 시퀀스에는 **대문자로 바뀐 이름만** 들어 있으므로 `n1` 기준으로 거를 방법이 없다.

> **💡 원본을 계속 쓰고 싶으면 `let`이나 익명 타입 투영을 써라**
>
> `into`로 잘리는 것이 문제라면, 원본을 함께 실어 나르면 된다. 29.10절의 `let`이나 익명 타입 투영이 정확히 그 일을 한다. `into`는 **버릴 것을 명시적으로 버리는** 도구고, `let`은 **가져갈 것을 명시적으로 늘리는** 도구다.

### 쿼리 래핑

점진적으로 만든 쿼리는 하나를 다른 하나로 감싸서 한 문장으로 만들 수 있다. 일반적인 형태는 이렇다.

```csharp
var tempQuery  = tempQueryExpr;
var finalQuery = from ... in tempQuery ...;
```

이것은 다음과 같이 다시 쓸 수 있다.

```csharp
var finalQuery = from ... in (tempQueryExpr) ...;
```

래핑은 점진적 구축이나 `into`와 **의미론적으로 동일하다**(중간 변수가 없다는 것만 다르다). 셋 다 결국 선형 연산자 체인이 된다. 앞의 예제를 래핑 형태로 쓰면 이렇다.

```csharp
IEnumerable<string> query =
    from n1 in
    (
        from   n2 in names
        select n2.Replace("a", "").Replace("e", "").Replace("i", "")
                .Replace("o", "").Replace("u", "")
    )
    where   n1.Length > 2
    orderby n1
    select  n1;
```

플루언트로 변환하면 앞서 본 것과 **동일한 선형 체인**이 나온다.

```csharp
IEnumerable<string> query = names
    .Select (n => n.Replace("a", "").Replace("e", "").Replace("i", "")
                   .Replace("o", "").Replace("u", ""))
    .Where  (n => n.Length > 2)
    .OrderBy(n => n);
```

(컴파일러는 마지막 `.Select(n => n)`을 생성하지 않는다 — 29.3절의 생략 규칙이다.)

> **⚠️ 래핑은 서브쿼리처럼 보이지만 서브쿼리가 아니다**
>
> 래핑된 쿼리는 앞 절에서 본 서브쿼리와 겉모습이 닮았다. 둘 다 안쪽 쿼리와 바깥쪽 쿼리가 있다. 그러나 플루언트로 변환해 보면 **래핑은 그저 연산자를 순차적으로 이어 붙이는 전략**임이 드러난다. 최종 결과는 서브쿼리와 아무 닮은 데가 없다 — 서브쿼리는 안쪽 쿼리를 **다른 쿼리의 람다 안에** 박아 넣는다. 실행 횟수부터 다르다(29.8절 마지막 표).

### 세 전략의 비교

| 전략 | 형태 | 중간 변수 | 언제 쓰는가 |
|---|---|---|---|
| 점진적 구축 | 문장 여러 개 | 있음 | 조건부로 연산자를 붙일 때, 중간 단계를 재사용할 때 |
| `into` | 한 쿼리 식 | 없음 (범위 변수만 새로) | 쿼리 구문을 유지하면서 투영 뒤에 절을 더 붙일 때 |
| 래핑 | 한 쿼리 식 (중첩) | 없음 | 안쪽 쿼리가 짧고 한 눈에 들어올 때 |

> **💡 중첩이 두 겹을 넘으면 쪼개라**
>
> 래핑이 두 겹을 넘어가면 읽기가 급격히 나빠진다. 이때는 주저 없이 점진적 구축으로 바꿔라. **지연 실행 덕분에 쪼개는 데 런타임 비용이 전혀 없다.** 세 문장으로 나눈 쿼리와 한 문장으로 쓴 쿼리는 정확히 같은 객체 그래프를 만든다. 이건 성능과 가독성이 충돌하지 않는 드문 자리다.

---

## 29.10 투영 전략 — 객체 초기화자, 익명 타입, `let`

지금까지 `select` 절은 전부 스칼라 원소 타입을 투영했다. 실무 쿼리는 그렇지 않다. 여러 값을 한꺼번에 실어 나르거나, 계산 결과를 원본 옆에 붙여 두거나, 결과의 모양을 새로 정의해야 한다.

### 전략 1 — 객체 초기화자와 명명된 타입

이름 목록에서 모음을 제거하되, **이후 쿼리를 위해 원본도 함께 남겨** 두고 싶다고 하자. 도우미 클래스를 하나 만든다.

```csharp
class TempProjectionItem
{
    public string Original;     // 원래 이름
    public string Vowelless;    // 모음이 제거된 이름
}
```

객체 초기화자(13.6절)로 투영한다.

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

IEnumerable<TempProjectionItem> temp =
    from   n in names
    select new TempProjectionItem
    {
        Original  = n,
        Vowelless = n.Replace("a", "").Replace("e", "").Replace("i", "")
                     .Replace("o", "").Replace("u", "")
    };
```

결과는 `IEnumerable<TempProjectionItem>`이고, 이걸 다시 쿼리할 수 있다.

```csharp
IEnumerable<string> query = from  item in temp
                            where item.Vowelless.Length > 2
                            select item.Original;
// Dick
// Harry
// Mary
```

이 전략의 장점은 명확하다. **타입에 이름이 있으므로** 메서드 반환 타입으로 쓸 수 있고, 다른 어셈블리로 넘길 수 있고, 나중에 동작을 붙일 수 있다.

> **💡 투영 대상 타입으로는 `record`가 대개 더 낫다 ※C# 9**
>
> 위 `TempProjectionItem`은 원서 시절의 관용구다. 지금이라면 위치 지정 레코드 한 줄이 더 낫다.
>
> ```csharp
> record TempProjectionItem(string Original, string Vowelless);
> ```
>
> 값 기반 동등성, `ToString()`, 분해자가 전부 딸려 오므로 `Distinct()`나 `GroupBy`에 그대로 넣을 수 있다(19.3절·19.7절). 반면 클래스에 `Equals`를 재정의하지 않으면 `Distinct()`가 참조 동등성으로 동작해서 아무것도 제거하지 못한다.

### 전략 2 — 익명 타입

일회용 타입을 매번 선언하는 것은 지겹다. **익명 타입(anonymous type)** 이 이 문제를 없앤다.

```csharp
var intermediate = from   n in names
                   select new
                   {
                       Original  = n,
                       Vowelless = n.Replace("a", "").Replace("e", "").Replace("i", "")
                                    .Replace("o", "").Replace("u", "")
                   };

IEnumerable<string> query = from  item in intermediate
                            where item.Vowelless.Length > 2
                            select item.Original;
```

결과는 앞과 같다. 다만 일회용 클래스를 쓰지 않았다. 컴파일러가 대신 투영 구조에 맞는 필드를 가진 임시 클래스를 생성한다. 그 대가로 중간 쿼리의 타입이 이렇게 된다.

```text
IEnumerable<컴파일러가-임의로-생성한-이름>
```

**이 타입의 변수를 선언할 수 있는 유일한 방법이 `var`다.** 여기서 `var`는 타이핑을 줄이는 장치가 아니라 **필수**다(10.6절).

`into`로 한 문장에 몰아넣을 수 있다.

```csharp
var query = from   n in names
            select new
            {
                Original  = n,
                Vowelless = n.Replace("a", "").Replace("e", "").Replace("i", "")
                             .Replace("o", "").Replace("u", "")
            }
            into  temp
            where temp.Vowelless.Length > 2
            select temp.Original;
```

### 익명 타입이 컴파일되는 형태

Microsoft C# 컴파일러가 만드는 익명 타입의 성질은 다음과 같다. 일부는 명세가 보장하고 일부는 보장하지 않는다.

| 성질 | 명세 보장 여부 |
|---|---|
| 클래스다 (구조체가 아니다) | 보장 |
| 기반 클래스는 `object`다 | 보장 |
| 모든 프로퍼티가 읽기 전용이다 | 보장 |
| `Equals`와 `GetHashCode`를 재정의해서 모든 프로퍼티가 같을 때만 동등하다 | **재정의한다는 사실은** 보장 (해시 계산 방식은 비보장) |
| 같은 어셈블리 안에서 프로퍼티 이름·타입·순서가 같은 두 익명 객체 생성 식은 같은 타입이 된다 | 보장 |
| `sealed`다 | 비보장 |
| 생성자 매개변수 이름이 프로퍼티 이름과 같다 | 비보장 (리플렉션에서 유용하다) |
| 어셈블리 내부(`internal`)다 | 비보장 (동적 타이핑과 함께 쓸 때 성가시다) |
| `ToString()`을 재정의해서 프로퍼티 이름과 값을 나열한다 | 비보장 (디버깅에 매우 유용하다) |
| 프로퍼티마다 타입 매개변수를 가진 제네릭 타입이다 | 비보장 (컴파일러마다 다를 수 있다) |

마지막 "같은 타입이 된다" 보장은 실제로 쓸모가 있다. 익명 타입으로 초기화한 변수에 재대입할 수 있고, 익명 타입 배열을 만들 수 있다.

```csharp
var player = new { Name = "Pam", Score = 4000 };
player     = new { Name = "James", Score = 5000 };   // 유효

var players = new[]
{
    new { Name = "Priti",  Score = 6000 },
    new { Name = "Chris",  Score = 7000 },
    new { Name = "Amanda", Score = 8000 },
};
```

> **⚠️ 프로퍼티 순서가 다르면 다른 타입이다**
>
> ```csharp
> var players = new[]
> {
>     new { Name = "Priti",  Score = 6000 },
>     new { Score = 7000, Name = "Chris" },   // 순서가 다르다 → 다른 타입
>     new { Name = "Amanda", Score = 8000 },
> };
> ```
>
> 각 원소는 개별적으로는 유효하지만, 두 번째 원소의 타입이 다르기 때문에 컴파일러가 배열 타입을 추론하지 못해 컴파일 오류가 난다. 프로퍼티를 하나 더 추가하거나 타입을 바꿔도 마찬가지다. **이름·타입·순서 세 가지가 모두 같아야 같은 타입이다.**

### 투영 초기화자

프로퍼티나 필드를 그대로 복사하면서 이름도 그대로 쓰고 싶으면, 이름을 생략할 수 있다. 이 문법을 **투영 초기화자(projection initializer)** 라고 한다.

`Order`(`OrderId`, `Customer`, `Items`), `Customer`(`Name`, `Address`), `OrderItem`(`ItemId`, `Quantity`)이 있다고 하자.

```csharp
var flattenedItem = new
{
    order.OrderId,
    CustomerName = customer.Name,
    customer.Address,
    item.ItemId,
    item.Quantity
};
```

`CustomerName`을 뺀 전부가 투영 초기화자다. 다음과 결과가 같다.

```csharp
var flattenedItem = new
{
    OrderId      = order.OrderId,
    CustomerName = customer.Name,
    Address      = customer.Address,
    ItemId       = item.ItemId,
    Quantity     = item.Quantity
};
```

즉 다음을

```csharp
SomeProperty = variable.SomeProperty
```

이렇게 줄여 쓸 수 있다.

```csharp
variable.SomeProperty
```

투영 초기화자는 프로퍼티 여러 개를 복사할 때 중복을 크게 줄인다. 식 하나가 한 줄에 들어가느냐 프로퍼티마다 한 줄씩 차지하느냐를 가르기도 한다.

> **⚠️ 투영 초기화자는 이름 바꾸기 리팩터링에 반응한다**
>
> 두 형태가 "결과가 같다"고 해서 모든 면에서 같지는 않다. `Address` 프로퍼티를 `CustomerAddress`로 이름 바꾸기하면 **투영 초기화자를 쓴 쪽은 익명 타입의 프로퍼티 이름도 함께 바뀌고**, 명시적으로 이름을 쓴 쪽은 바뀌지 않는다. 익명 타입의 프로퍼티 이름을 직렬화나 리플렉션으로 사용하는 코드라면 이 차이가 사고가 된다.

### 전략 3 — `let` 키워드

쿼리 식은 위와 같은 종류의 쿼리를 쓰기 위한 지름길을 제공한다. **`let` 키워드**다.

`let`은 범위 변수 옆에 새 변수를 도입한다. 모음을 뺀 길이가 2를 넘는 문자열을 뽑는 쿼리를 `let`으로 쓰면 이렇다.

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

IEnumerable<string> query =
    from    n in names
    let     vowelless = n.Replace("a", "").Replace("e", "").Replace("i", "")
                         .Replace("o", "").Replace("u", "")
    where   vowelless.Length > 2
    orderby vowelless
    select  n;              // let 덕분에 n이 아직 스코프에 있다
```

컴파일러는 `let` 절을 **범위 변수와 새 식 변수를 둘 다 담은 임시 익명 타입으로 투영**해서 처리한다. 다시 말해 위 쿼리를 앞의 익명 타입 예제로 번역한다. 이것이 29.3절에서 본 **투명 식별자**다.

`let`이 하는 일은 두 가지다.

1. **기존 원소 옆에 새 원소를 투영한다.**
2. **한 식을 쿼리 안에서 여러 번, 다시 쓰지 않고 사용하게 해 준다.**

이 예제에서 `let`이 특히 유리한 이유는 `select` 절이 **원본 이름(`n`)이든 모음이 제거된 버전(`vowelless`)이든 마음대로 고를 수 있기** 때문이다. `into`를 썼다면 `n`은 이미 사라졌을 것이다(29.9절).

`let` 문은 `where` 앞이든 뒤든, 몇 개든 쓸 수 있다. 나중 `let`은 앞선 `let`이 도입한 변수를 참조할 수 있다(단, `into` 절이 그은 경계는 넘지 못한다). **`let`은 기존 변수 전부를 투명하게 재투영한다.**

`let` 식이 반드시 스칼라 값일 필요도 없다. 서브시퀀스로 평가되게 하는 것이 유용할 때가 있다.

```csharp
var q = from   c in customers
        let    recent = c.Orders.Where(o => o.Date > cutoff)   // 시퀀스로 평가
        where  recent.Any()
        select new { c.Name, Count = recent.Count(), Total = recent.Sum(o => o.Total) };
```

> **⚠️ `let`으로 만든 시퀀스는 지연 쿼리다 — 세 번 열거된다**
>
> 바로 위 예제에서 `recent`는 `IEnumerable<Order>`이고, `where`, `Count()`, `Sum()`에서 각각 한 번씩, **총 세 번 열거된다.** 29.7절의 다중 열거 함정이 `let` 뒤에 숨은 형태다. 로컬 쿼리에서 이게 문제가 되면 `let recent = c.Orders.Where(...).ToList()`처럼 실체화해야 한다. 반대로 데이터베이스 쿼리에서는 실체화하면 안 된다 — 그 순간 쿼리가 로컬로 떨어진다(31.5절).

### `let`의 비용

| 항목 | 로컬 쿼리 | 해석되는 쿼리 |
|---|---|---|
| 추가 연산자 | `Select` 1개 (반복자 + 델리게이트 할당) | 식 트리 노드 몇 개 |
| 원소당 할당 | 익명 타입 인스턴스 1개 | 없음 |
| 이후 절의 접근 | 프로퍼티 로드 한 단계 추가 | SQL 별칭/파생 테이블로 흡수 |

로컬 쿼리에서 원소가 많고 `let`이 여러 개면 이 비용이 쌓인다. 회피 요령(계산을 `Select` 하나로 합치기, `let` 대신 지역 함수 쓰기 등)은 30.15절에서 다룬다.

### 투영 결과를 밖으로 내보내기

익명 타입으로 투영한 결과는 **메서드 반환 타입으로 쓸 수 없다.** `var`는 지역 변수에만 쓸 수 있고, 필드·매개변수·반환 타입에는 쓸 수 없기 때문이다.

```csharp
static var GetProjectedSubset(ProductInfo[] products)   // 컴파일되지 않는다
{
    var nameDesc = from p in products select new { p.Name, p.Description };
    return nameDesc;
}
```

선택지는 셋이다.

**첫째, 비제네릭 `System.Array`로 내보낸다.** 즉시 실행이 필요하다.

```csharp
static Array GetProjectedSubset(ProductInfo[] products)
{
    var nameDesc = from p in products select new { p.Name, p.Description };
    return nameDesc.ToArray();      // 익명 객체의 배열을 Array로
}

// 호출부
Array objs = GetProjectedSubset(itemsInStock);
foreach (object o in objs)
    Console.WriteLine(o);           // 각 익명 객체의 ToString() 호출
```

여기서 C#의 배열 선언 문법(`Foo[]`)은 쓸 수 없다. 원소 타입 이름을 쓸 방법이 없기 때문이다. 같은 이유로 `ToArray<T>()`에 타입 인수도 지정할 수 없다. 명백한 문제는 **강타입성을 전부 잃는다**는 것이다 — 모든 원소가 `object`로 보인다.

**둘째, 명명된 타입으로 투영한다.** 대부분 이쪽이 옳다.

```csharp
class ProductInfoSmall
{
    public string Name        { get; set; } = "";
    public string Description { get; set; } = "";
    public override string ToString() => $"Name={Name}, Description={Description}";
}

static IEnumerable<ProductInfoSmall> GetNamesAndDescriptions(ProductInfo[] products)
    => from   p in products
       select new ProductInfoSmall { Name = p.Name, Description = p.Description };
```

**셋째, 튜플로 투영한다 ※C# 7.** 이름이 필요 없거나 매우 지역적일 때 가볍다.

```csharp
static IEnumerable<(string Name, string Description)> GetPairs(ProductInfo[] products)
    => products.Select(p => (p.Name, p.Description));
```

익명 타입·튜플·명명된 타입·레코드의 선택 기준은 77.5절에서 정리한다.

> **⚠️ 익명 타입은 어셈블리 밖으로 나가지 않는다**
>
> 익명 타입은 (보장되지는 않지만 실제로) `internal`이다. `object`나 `dynamic`으로 감싸서 다른 어셈블리로 넘기면, 받는 쪽에서 리플렉션이나 `dynamic`으로 프로퍼티에 접근하려 할 때 접근성 때문에 실패할 수 있다. **어셈블리 경계를 넘는 데이터는 익명 타입으로 옮기지 마라.** 79.10절에서 익명 타입의 적정 사용 범위를 다룬다.

> **💡 세 전략의 선택 기준**
>
> | 상황 | 선택 |
> |---|---|
> | 쿼리 안에서만 쓰는 중간 결과 | 익명 타입 (또는 `let`) |
> | 계산 결과를 원본과 함께 여러 절에서 재사용 | `let` |
> | 메서드 밖으로 내보내는 결과 | `record` 또는 명명된 클래스 |
> | 두세 개 값의 지역적 묶음 | 튜플 |
> | 결과를 딕셔너리 키로 쓰거나 `Distinct`에 넣음 | `record` (값 동등성이 필요하다) |

---

## 29.11 지연 평가 vs 즉시 평가의 선택 기준

쿼리를 다 짜고 나면 마지막 결정이 하나 남는다. **이 쿼리를 지연된 상태로 둘 것인가, `ToList()`/`ToArray()`로 실체화(materialize)할 것인가.** 이 절은 그 결정을 위한 기준을 정리한다.

### 두 가지를 정확히 구별하기

먼저 용어를 고정하자. 이 결정에는 두 개의 축이 있다.

첫째는 **실행 시점** — 쿼리가 언제 도는가, 곧 지연 실행이냐 즉시 실행이냐다. 둘째는 **결과 보존** — 결과를 붙들고 있는가, 곧 쿼리 객체를 들고 있느냐 실체화된 컬렉션을 들고 있느냐다.

`ToList()`는 이 둘을 동시에 결정한다 — **지금 실행하고, 결과를 붙든다.** 실무에서 "즉시 평가"라고 말할 때 실제로 원하는 것은 대개 두 번째 축이다.

### 즉시 평가를 강제하는 연산자

| 연산자 | 결과 타입 | 언제 쓰는가 |
|---|---|---|
| `ToList()` | `List<T>` | 인덱싱·`Count`가 필요하고, 나중에 추가/제거도 할 수 있다 |
| `ToArray()` | `T[]` | 크기가 고정이고, 최소 오버헤드가 필요하다 |
| `ToDictionary()` | `Dictionary<TKey,TValue>` | 키로 조회할 것이다. **키 중복 시 예외**가 난다 |
| `ToHashSet()` | `HashSet<T>` | 포함 여부만 반복 조회한다 |
| `ToLookup()` | `ILookup<TKey,TElement>` | 키 하나에 값 여러 개. `ToDictionary`와 달리 **중복을 허용한다** |

```csharp
int[] numbers = { 10, 20, 30, 40, 1, 2, 3, 8 };

int[]      asArray = (from i in numbers where i < 10 select i).ToArray();
List<int>  asList  = (from i in numbers where i < 10 select i).ToList();
```

쿼리 식 전체를 괄호로 감싸야 한다는 점에 주의(29.5절). 컴파일러가 타입 인수를 명확히 추론할 수 있으므로 `ToArray<int>()`처럼 쓸 필요는 없다.

요소 연산자와 집계 연산자도 즉시 실행이다.

```csharp
int number;
number = (from i in numbers select i).First();                    // 시퀀스 순서의 첫 번째
number = (from i in numbers orderby i select i).First();          // 정렬 후 첫 번째
number = (from i in numbers where i > 30 select i).Single();      // 정확히 하나여야 한다
number = (from i in numbers where i > 99 select i).FirstOrDefault();   // 0
```

> **⚠️ `First`/`Single`과 그 `OrDefault` 변형은 던지는 조건이 다르다**
>
> | 메서드 | 결과가 0개 | 결과가 2개 이상 |
> |---|---|---|
> | `First()` | 예외 | 첫 번째를 돌려준다 |
> | `FirstOrDefault()` | 기본값 | 첫 번째를 돌려준다 |
> | `Single()` | 예외 | **예외** |
> | `SingleOrDefault()` | 기본값 | **예외** |
>
> `SingleOrDefault()`가 "무슨 일이 있어도 예외를 안 던진다"는 뜻이 아니다. 원소가 둘 이상이면 던진다. 정확한 예외 타입과 오버로드 전체는 30.9절·30.13절에서 다룬다.
>
> ※.NET 6부터 `FirstOrDefault`/`SingleOrDefault`/`LastOrDefault`에 **기본값을 직접 지정하는 오버로드**가 추가되었다.
>
> ```csharp
> var n = query.FirstOrDefault(-1);    // 비어 있으면 0이 아니라 -1
> ```

### 지연을 유지해야 하는 경우

| 상황 | 이유 |
|---|---|
| 결과를 **딱 한 번** 순회한다 | 중간 컬렉션이 순수한 낭비다 |
| **앞부분 몇 개만** 필요하다 (`Take`, `First`, `Any`) | 뒤쪽 원소를 아예 계산하지 않는다 |
| 시퀀스가 **매우 크거나 무한**하다 | 메모리에 다 담을 수 없다 |
| 소스의 **최신 상태**를 반영해야 한다 | 재평가가 곧 기능이다 |
| 쿼리를 **더 합성해서** 반환한다 (`IQueryable` 포함) | 실체화하면 이후 필터가 로컬로 떨어진다 (31.5절) |
| 결과가 **한 번도 안 쓰일 수 있다** | 조건부 분기에서 쓰이지 않으면 비용이 0이다 |

지연의 극단적 이득을 보여 주는 예를 보자.

```csharp
// 파일이 10GB여도 메모리를 거의 쓰지 않는다
var firstError = File.ReadLines(path)             // 지연: 한 줄씩 읽는다
                     .Select(ParseLine)           // 지연: 스트리밍
                     .Where (r => r.IsError)      // 지연: 스트리밍
                     .FirstOrDefault();           // 첫 오류를 만나면 즉시 멈춘다
```

`FirstOrDefault()`가 첫 오류를 찾는 순간 파일 읽기가 중단된다. 여기에 `.ToList()`를 하나만 끼워 넣으면 10GB를 전부 읽고 전부 파싱한다.

### 실체화해야 하는 경우

| 상황 | 이유 |
|---|---|
| 결과를 **두 번 이상** 순회한다 | 재평가 비용을 없앤다 (29.7절) |
| 쿼리가 **비싸다** (계산량, I/O, 데이터베이스 왕복) | 한 번만 지불한다 |
| 특정 시점의 결과를 **얼려야** 한다 | 소스 변경에 영향받지 않는다 |
| 소스를 **열거하는 동안 수정**해야 한다 | 열거 중 수정 예외를 피한다 |
| `Count`나 **인덱스 접근**이 필요하다 | `IEnumerable<T>`에는 둘 다 없다 |
| **공개 API의 반환값**이고 호출자가 소비 방식을 모른다 | 호출자가 실수로 여러 번 열거할 수 있다 |
| 리소스(파일 핸들, DB 커넥션)의 **수명 밖으로** 결과를 내보낸다 | 지연 쿼리는 리소스가 닫힌 뒤 열거되면 터진다 |

마지막 항목이 특히 조용한 사고를 낸다.

```csharp
// 위험: 반환된 쿼리는 using 블록이 끝난 뒤에 열거된다
IEnumerable<string> BadRead(string path)
{
    using var reader = new StreamReader(path);
    return reader.ReadToEnd().Split('\n').Where(l => l.Length > 0);   // 이 경우는 안전
}

// 진짜 위험한 형태: 지연 쿼리가 닫힌 리소스를 붙들고 있다
IEnumerable<string> ReallyBad(string path)
{
    using var reader = new StreamReader(path);
    return ReadLines(reader).Where(l => l.Length > 0);   // reader가 이미 닫힌 뒤 열거된다

    static IEnumerable<string> ReadLines(StreamReader r)
    {
        string? line;
        while ((line = r.ReadLine()) != null) yield return line;
    }
}
```

두 번째 형태는 호출자가 결과를 열거하는 시점에 `ObjectDisposedException`을 만난다(정확히 어떤 예외가 나는지는 스트림 구현에 달렸다). **`using` 블록 안에서 지연 쿼리를 만들어 밖으로 돌려주지 마라.** `.ToList()`로 끝내거나, 반복자 메서드가 리소스 수명 전체를 감싸도록 구조를 바꿔야 한다.

> **⚠️ `Count()`와 `Count` 프로퍼티는 다른 것이다**
>
> `Enumerable.Count()`는 시퀀스를 **끝까지 열거해서** 센다(내부적으로 `ICollection<T>`이면 `Count` 프로퍼티로 빠지는 최적화가 있지만, 데코레이터 체인에는 대개 적용되지 않는다). `List<T>.Count`는 필드 읽기다. 지연 쿼리에 `.Count()`를 반복해서 부르면 그때마다 전체가 다시 돈다.
>
> ※.NET 6에는 열거 없이 개수를 알 수 있으면 알려 주는 `TryGetNonEnumeratedCount`가 추가되었다.
>
> ```csharp
> if (query.TryGetNonEnumeratedCount(out int count))
>     Console.WriteLine($"열거 없이 알아낸 개수: {count}");
> else
>     Console.WriteLine("세려면 열거해야 한다");
> ```
>
> `yield return`으로 만든 시퀀스에 대해서는 언제나 `false`를 돌려준다.

### 판단 흐름

```text
                   쿼리 결과를 어떻게 다룰 것인가?
                              │
              ┌───────────────┴────────────────┐
              │                                │
      결과를 한 번만 순회?              두 번 이상 순회 / 개수·인덱스 필요
              │                                │
      ┌───────┴────────┐                       ↓
      │                │                 ToList() / ToArray()
  앞부분만 필요?    전부 필요?
      │                │
      ↓                ↓
 지연 유지         소스가 밖에서 바뀔 수 있나?
 (Take/First)           │
                ┌───────┴────────┐
                │                │
             바뀐다            안 바뀐다
                │                │
                ↓                ↓
      "최신 결과를 원하나?"     지연 유지
        예 → 지연 유지          (한 번만 도니 동일)
        아니오 → ToList()
```

### 공개 API에서의 판단

메서드가 시퀀스를 반환할 때 반환 타입 선택은 계약을 정하는 일이다.

| 반환 타입 | 호출자에게 주는 계약 | 위험 |
|---|---|---|
| `IEnumerable<T>` | "합성 가능한 시퀀스다. 언제 돌지는 네가 정해라" | 다중 열거, 리소스 수명 |
| `IReadOnlyList<T>` | "이미 계산됐다. 몇 번이든 봐도 된다" | 큰 결과를 전부 메모리에 |
| `List<T>` / `T[]` | "가져가서 마음대로 해라" | 내부 상태 노출 |
| `IQueryable<T>` | "아직 서버에서 실행되지 않았다. 더 붙여라" | 호출자가 번역 불가 식을 붙일 수 있다 |

> **💡 실무 기본값**
>
> - **내부 헬퍼**라면 `IEnumerable<T>`로 지연 반환해라. 호출자가 어떻게 쓸지 알고 있으니 합성 가능성이 이득이다.
> - **공개 API의 경계**라면 `IReadOnlyList<T>`로 실체화해서 돌려줘라. 호출자가 여러 번 열거하거나 리소스 수명 밖에서 열거할 위험이 사라진다.
> - **아직 필터가 더 붙을 수 있으면** 지연을 유지해라. 특히 `IQueryable<T>`를 실체화하는 순간 이후 모든 연산이 클라이언트로 넘어온다.
>
> 합성 가능한 시퀀스 API를 설계하는 상세한 지침은 31.9절에서, 반복자 메서드로 시퀀스를 반환할지 컬렉션을 반환할지의 판단은 28.8절에서 다룬다.

> **⚠️ 실체화는 "안전"이 아니라 "다른 트레이드오프"다**
>
> "일단 `ToList()`를 붙이면 안전하다"는 조언은 절반만 맞다. `ToList()`는 다중 열거와 재평가 문제를 없애는 대신 **전체 결과를 메모리에 올리고, 앞부분만 필요한 경우에도 전부 계산한다.** 300만 행짜리 데이터베이스 쿼리 뒤에 습관적으로 붙인 `.ToList()`가 프로세스를 죽이는 광경은 흔하다. 무엇을 사고 무엇을 파는지 항상 의식해라.

### 성능 영향 정리

| 항목 | 지연 유지 | `ToList()` 실체화 |
|---|---|---|
| 첫 원소까지의 지연 시간 | 짧다 (스트리밍인 경우) | 전체 계산이 끝날 때까지 |
| 총 메모리 | 계층 수에 비례하는 상수 | 원소 수에 비례 |
| N번 순회 비용 | 쿼리 비용 × N | 쿼리 비용 × 1 + 순회 × N |
| 조기 종료(`Take`, `First`) 이득 | 있다 | 없다 |
| 소스 변경 반영 | 반영된다 | 반영되지 않는다 |
| 원소당 오버헤드 | 계층당 `MoveNext` + 델리게이트 | 배열/리스트 인덱싱 |

---

## 이 장의 요약

- **LINQ는 문법의 통합이다.** 배열·`List<T>`·XML 문서·SQL 테이블이라는 서로 다른 저장소를 하나의 쿼리 문법으로 다룬다. 뒤에서 벌어지는 일(델리게이트 체인이냐 SQL 생성이냐)은 다르지만 쓰는 쪽 문법은 같다. 이 장은 그중 로컬 시퀀스, 곧 LINQ to Objects를 다뤘다.

- **플루언트 구문은 확장 메서드 체이닝이다.** `Enumerable`의 40개 남짓한 정적 확장 메서드를 이어 붙이는 것이 전부다. 확장 메서드 덕분에 호출이 중위 표기가 되어 **데이터가 흐르는 방향과 소스를 읽는 방향이 일치**하고, 각 람다가 자기 연산자 옆에 붙는다. 확장 메서드를 쓰지 않으면 호출 순서가 실행 순서와 뒤집힌다.

- **쿼리 식은 컴파일러가 플루언트로 번역한다.** 그것도 오버로드 해석 이전의 **순수한 구문 변환**으로. `Where`·`Select` 같은 단어를 기계적으로 꽂아 넣고 그때부터 평범하게 컴파일한다. 그래서 바인딩 대상이 `Enumerable`로 고정되어 있지 않고, `using System.Linq`가 없으면 쿼리 식 자체가 컴파일되지 않는다.

- **범위 변수는 변수가 아니라 람다 매개변수의 예약석이다.** 같은 이름 `n`이 여러 절에 나와도 실제로는 서로 다른 람다 매개변수다. 범위 변수가 둘 이상 살아 있어야 할 때(`let`, 추가 `from`, `join`) 컴파일러는 **투명 식별자** — 이름 없는 익명 타입 — 를 만들어 값들을 묶어 나른다. 로컬 쿼리에서 이것은 원소당 힙 할당 하나를 뜻한다.

- **쿼리 구문과 플루언트 구문은 대립하지 않는다.** 쿼리 구문의 우위는 `let`·다중 `from`·`join`처럼 **컴파일러가 투명 식별자를 대신 만들어 주는 자리**로 한정되고, 그 밖에는 플루언트가 짧다. 키워드가 있는 연산자는 열 개 남짓이고 나머지는 전부 플루언트 전용이므로, **혼합 구문**이 실무의 기본값이 된다.

- **지연 실행은 데코레이터 체인이다.** `Where`를 호출하면 입력 시퀀스·람다·인수를 붙들고 있는 래퍼 객체 하나가 생길 뿐, 원소는 한 개도 읽지 않는다. 연산자를 이어 붙이면 데코레이터가 겹겹이 쌓이고, 이 객체 그래프는 **열거 시작 전에 이미 완성된다.** 실행은 가장 바깥 열거자에서 시작해 안쪽으로 요청이 전달되는 **수요 주도 풀 모델**이다.

- **지연 실행에는 재평가라는 짝이 따라온다.** 쿼리 변수는 결과가 아니라 결과를 만드는 방법을 담고 있으므로, 다시 열거하면 다시 돈다. 이것이 기능일 때(최신 상태 반영)와 사고일 때(다중 열거로 데이터베이스를 세 번 두드림)를 구별해야 한다. 캡처된 변수 역시 **실행 시점의 값**을 쓰므로, `for` 루프에서 쿼리를 조립하면 모든 클로저가 같은 변수를 보고 열거 시점에 터진다.

- **서브쿼리는 바깥 원소마다 한 번씩 실행된다.** 로컬 컬렉션에서는 대개 `O(n²)`이므로 밖으로 빼내는 것이 옳고, 데이터베이스에서는 빼내면 왕복이 늘어나므로 그대로 두는 것이 옳다. 같은 리팩터링이 실행 위치에 따라 최적화이기도 하고 비관화이기도 하다.

- **합성 전략 셋(점진적 구축·`into`·래핑)은 런타임에 완전히 같다.** 어느 것을 고를지는 순수한 가독성 문제다. 다만 점진적 구축만이 **연산자를 조건부로 붙이는 것**을 가능하게 하고, 이것이 검색 필터 조립 같은 실무 패턴의 기반이 된다. 쿼리를 여러 문장으로 쪼개는 데는 런타임 비용이 없다.

- **마지막 결정은 지연이냐 실체화냐다.** 한 번만 순회하고 앞부분만 필요하며 소스가 살아 있다면 지연을 유지하고, 두 번 이상 순회하거나 비싸거나 리소스 수명 밖으로 내보낸다면 `ToList()`로 얼려라. `ToList()`는 "안전"이 아니라 **메모리와 조기 종료를 대가로 재평가를 사는 거래**다.

---

## 연습 문제

1. **데코레이터 확인하기.** `int[] a = {5,12,3};`에 대해 `a.Where(n=>n<10)`, `a.Where(n=>n<10).OrderBy(n=>n)`, 거기에 `.Select(n=>n*10)`까지 붙인 세 쿼리의 `GetType().Name`과 `GetType().Assembly.GetName().Name`을 출력하라. 세 이름이 모두 다르고 전부 `System.Linq` 어셈블리에 있음을 확인하라. 그다음 마지막 쿼리에 `.ToList()`를 붙여 타입이 ``List`1``로 바뀌는 것을 확인하라.

2. **실행 시점 추적하기.** `Select` 람다 안에 `Console.WriteLine($"평가: {n}")`을 넣은 쿼리를 만들어라. (a) 쿼리를 만들기만 하고 열거하지 않았을 때, (b) `foreach`로 한 번 열거했을 때, (c) 두 번 열거했을 때, (d) 중간에 `.ToList()`를 붙였을 때 각각 몇 줄이 출력되는지 예측한 뒤 실행해서 맞춰라.

3. **`for` 캡처 함정 재현하기.** 29.7절의 모음 제거 예제를 `for` 루프로 작성해 `IndexOutOfRangeException`을 재현하라. 예외의 스택 트레이스가 `for` 루프가 아니라 `foreach` 줄을 가리키는 것을 확인하라. 그다음 (a) 루프 본문에 지역 변수를 만드는 방법과 (b) `foreach`로 바꾸는 방법으로 각각 고치고, 세 버전의 IL에서 `newobj <>c__DisplayClass`가 몇 번 나오는지 세어라.

4. **투명 식별자 눈으로 보기.** `let`이 하나 들어간 쿼리와 다중 `from`이 들어간 쿼리를 작성하고, ILSpy나 dotPeek으로 디컴파일하라. `<>f__AnonymousType...`과 `<>h__TransparentIdentifier...`가 나오는 위치를 찾아, `let` 하나가 몇 개의 익명 타입 인스턴스를 만드는지 원소 수와 함께 계산하라. 범위 변수를 셋으로 늘리면 익명 타입이 어떻게 중첩되는지 확인하라.

5. **서브쿼리 비용 측정하기.** 원소 20,000개짜리 `string[]`에 대해 (a) `names.Where(n => n.Length == names.Min(x => x.Length))`와 (b) `Min`을 밖으로 뺀 버전의 실행 시간을 `Stopwatch`로 비교하라. 원소 수를 두 배로 늘렸을 때 각각의 시간이 몇 배가 되는지 확인해 `O(n²)`과 `O(n)`을 눈으로 구별하라.

6. **버퍼링 연산자의 효과 확인하기.** `yield return`으로 무한 정수 시퀀스를 만드는 반복자 메서드를 작성하라. (a) `.Where(n => n % 7 == 0).Take(5)`는 즉시 끝나고, (b) `.OrderBy(n => n).Take(5)`는 끝나지 않는 것을 확인하라(적당한 시점에 중단해도 좋다). 왜 `Take`가 뒤에 있는데도 소용없는지 29.6절의 표로 설명하라.

7. **API 경계 설계하기.** 파일에서 줄을 읽어 조건에 맞는 것만 돌려주는 메서드를 두 버전으로 작성하라. 하나는 `IEnumerable<string>`을 지연 반환하고, 다른 하나는 `IReadOnlyList<string>`을 `ToList()`로 반환한다. 호출자가 (a) 결과를 두 번 순회할 때, (b) 첫 원소만 필요할 때, (c) 반환값을 `using` 블록 밖에서 쓸 때 각각 어떤 차이가 나는지 실험으로 확인하고 29.11절의 표와 대조하라.

---

**다음 장** — 30장「LINQ 연산자 레퍼런스」에서는 이 장이 의도적으로 미룬 것 — 개별 연산자 하나하나 — 를 전수한다. 40개 남짓한 표준 쿼리 연산자를 시퀀스→시퀀스, 시퀀스→요소·값, void→시퀀스의 세 부류로 나누고, 각 연산자의 오버로드·의미론·스트리밍 여부·`null` 처리를 정리한다. 마지막 두 절에서는 이 장에서 예고만 한 **LINQ의 숨은 할당**(델리게이트·클로저·열거자·익명 타입)을 실측하고, `let` 회피와 `GroupBy` 개선 같은 성능 실전 기법을 다룬다.
