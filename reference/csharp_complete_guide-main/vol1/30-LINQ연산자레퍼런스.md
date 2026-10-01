---
title: "30장. LINQ 연산자 레퍼런스"
---

# 30장. LINQ 연산자 레퍼런스

> **이 장의 위치** — 29장에서 LINQ가 **어떻게 동작하는지**(지연 실행, 데코레이터 체인, 두 가지 문법, 합성 전략)를 끝냈다. 이 장은 **무엇이 있는지**를 끝낸다. `System.Linq.Enumerable`이 제공하는 표준 쿼리 연산자를 분류별로 훑고, 연산자마다 시그니처·쿼리 구문 대응·지연 여부·동작·함정·예외 조건을 정리한다. 마지막 두 절은 레퍼런스에서 벗어나 **LINQ가 실제로 무엇을 할당하는지**와 **로컬 쿼리를 빠르게 만드는 방법**을 판다.
>
> **선수 지식** — 23장(제네릭), 24장(컬렉션), 25장(동등성과 순서 비교), 26장(델리게이트와 람다), 28장(열거와 반복자), 29장(LINQ 쿼리)
>
> **이 장에서 다루지 않는 것** — 쿼리 식 문법의 번역 규칙, 지연 실행 모델, 재평가, 합성 전략은 29장에서 이미 끝냈다. 식 트리와 `IQueryable`, EF Core가 LINQ를 SQL로 바꾸는 과정은 31장에서 다룬다. PLINQ로 쿼리를 병렬화하는 방법은 50.3절과 50.5절에서 다룬다. `Span<T>`의 문법과 규칙은 68장, 할당 줄이기 일반론은 69장, 힙과 할당의 기초는 61·62장을 참조하라.

---

## 30.1 연산자 분류 — 시퀀스→시퀀스 / 시퀀스→요소·값 / void→시퀀스

표준 쿼리 연산자는 **입력과 출력의 모양**을 기준으로 세 부류로 나뉜다. 이 세 부류를 구별하는 것이 LINQ 레퍼런스를 읽는 첫 번째 좌표축이다. 두 번째 좌표축은 **지연 실행 여부**다. 이 두 축만 잡으면 50개가 넘는 연산자가 머릿속에서 격자 위에 놓인다.

```text
                    표준 쿼리 연산자의 세 부류

  ① 시퀀스 → 시퀀스                   ② 시퀀스 → 요소·값
  ┌──────────────────────────┐        ┌──────────────────────────┐
  │ IEnumerable<TSource>     │        │ IEnumerable<TSource>     │
  │          ↓               │        │          ↓               │
  │ IEnumerable<TResult>     │        │  TSource / scalar / bool │
  └──────────────────────────┘        └──────────────────────────┘
   Where Select SelectMany             First Last Single ElementAt
   Take Skip OrderBy GroupBy           MinBy MaxBy Count Sum Average
   Join Zip Union Cast ...             Aggregate Any All Contains ...
   → 거의 전부 지연 실행                 → 전부 즉시 실행

                    ③ void → 시퀀스
                    ┌──────────────────────────┐
                    │  (입력 시퀀스 없음)        │
                    │          ↓               │
                    │  IEnumerable<TResult>    │
                    └──────────────────────────┘
                     Empty  Range  Repeat
                     → 확장 메서드가 아닌 정적 메서드
```

### ① 시퀀스 → 시퀀스

대다수의 연산자가 여기 속한다. 하나 이상의 시퀀스를 받아 시퀀스 하나를 내놓는다. 이 부류의 연산자만이 **체이닝**의 대상이 된다. 29.2절에서 본 연산자 이어 붙이기가 가능한 이유가 여기 있다.

| 하위 분류 | 시그니처 모양 | 연산자 |
|---|---|---|
| 필터링 | `IEnumerable<T>` → `IEnumerable<T>` | `Where`, `Take`, `TakeLast`, `TakeWhile`, `Skip`, `SkipLast`, `SkipWhile`, `Distinct`, `DistinctBy` |
| 투영 | `IEnumerable<T>` → `IEnumerable<TResult>` | `Select`, `SelectMany` |
| 조인 | `IEnumerable<TOuter>`, `IEnumerable<TInner>` → `IEnumerable<TResult>` | `Join`, `GroupJoin`, `Zip` |
| 정렬 | `IEnumerable<T>` → `IOrderedEnumerable<T>` | `OrderBy`, `OrderByDescending`, `ThenBy`, `ThenByDescending`, `Order`, `OrderDescending`, `Reverse` |
| 그룹핑 | `IEnumerable<T>` → `IEnumerable<IGrouping<TKey,TElement>>` 또는 `IEnumerable<T[]>` | `GroupBy`, `Chunk` |
| 집합 | `IEnumerable<T>`, `IEnumerable<T>` → `IEnumerable<T>` | `Concat`, `Union`, `UnionBy`, `Intersect`, `IntersectBy`, `Except`, `ExceptBy`, `Append`, `Prepend` |
| 변환(가져오기) | `IEnumerable` → `IEnumerable<T>` | `OfType`, `Cast` |
| 변환(내보내기) | `IEnumerable<T>` → 배열·리스트·딕셔너리·룩업·시퀀스 | `ToArray`, `ToList`, `ToDictionary`, `ToHashSet`, `ToLookup`, `AsEnumerable`, `AsQueryable` |

필터링 연산자에는 두 가지 불변식이 있다. **출력 원소 수는 입력보다 많아질 수 없고**, **원소 자체는 변형되지 않는다.** 통과하거나 걸러지거나 둘 중 하나다. 반면 투영 연산자는 원소를 바꾼다. `Select`는 개수를 유지하면서 모양을 바꾸고, `SelectMany`는 개수와 모양을 둘 다 바꾼다.

### ② 시퀀스 → 요소·값

입력 시퀀스를 받아 **원소 하나** 또는 **스칼라 하나**를 내놓는다. 시퀀스가 아니므로 체인이 여기서 끊긴다. 그리고 결과를 만들려면 반드시 입력을 열거해야 하므로 **전부 즉시 실행**이다.

| 하위 분류 | 시그니처 모양 | 연산자 |
|---|---|---|
| 요소 | `IEnumerable<T>` → `T` | `First`, `FirstOrDefault`, `Last`, `LastOrDefault`, `Single`, `SingleOrDefault`, `ElementAt`, `ElementAtOrDefault`, `MinBy`, `MaxBy` |
| 집계 | `IEnumerable<T>` → 스칼라 | `Aggregate`, `Average`, `Count`, `LongCount`, `Sum`, `Max`, `Min` |
| 한정자 | `IEnumerable<T>` → `bool` | `All`, `Any`, `Contains`, `SequenceEqual` |

> **⚠️ `DefaultIfEmpty`는 요소 연산자가 아니다**
>
> 원천 도서는 `DefaultIfEmpty`를 요소 연산자 절에서 설명하지만, **이 연산자의 반환 타입은 `IEnumerable<TSource>`다.** 이름과 배치 때문에 요소 하나를 돌려준다고 착각하기 쉽다. 실제로는 "빈 시퀀스면 기본값 원소 하나짜리 시퀀스를, 아니면 원본 그대로"를 돌려주는 **지연 실행 시퀀스 연산자**다. 이 성질 덕분에 평면 외부 조인(30.4절)에 쓸 수 있다.

### ③ void → 시퀀스

입력 시퀀스 없이 시퀀스를 만들어낸다. 확장 메서드가 아니라 `Enumerable` 클래스의 **평범한 정적 메서드**다. 그래서 `Enumerable.Range(...)`처럼 클래스 이름을 붙여 호출한다.

| 연산자 | 하는 일 |
|---|---|
| `Empty<T>()` | 원소가 없는 시퀀스 |
| `Range(start, count)` | `start`부터 `count`개의 연속된 `int` |
| `Repeat(element, count)` | 같은 원소를 `count`번 |

### 지연 여부 전체 표

두 번째 좌표축이다. 29.6절에서 지연 실행의 원리를 다뤘으니, 여기서는 **어느 연산자가 어디에 속하는지**만 정리한다. 세 칸으로 나눈다.

- **지연 · 스트리밍** — 열거를 시작할 때까지 아무 일도 하지 않고, 시작한 뒤에는 출력 원소 하나를 만들기 위해 입력을 필요한 만큼만 읽는다.
- **지연 · 버퍼링** — 열거를 시작할 때까지는 아무 일도 하지 않지만, 첫 원소를 내놓기 위해 입력의 전부(또는 상당 부분)를 미리 읽어 메모리에 쌓는다.
- **즉시** — 메서드를 호출하는 그 자리에서 입력을 끝까지 열거한다.

| 연산자 | 실행 시점 | 버퍼링하는 것 |
|---|---|---|
| `Where`, `Select`, `SelectMany`, `Cast`, `OfType` | 지연·스트리밍 | 없음 |
| `Take`, `TakeWhile`, `Skip`, `SkipWhile` | 지연·스트리밍 | 없음 |
| `Concat`, `Append`, `Prepend`, `Zip`, `DefaultIfEmpty` | 지연·스트리밍 | 없음 |
| `Distinct`, `DistinctBy`, `Union`, `UnionBy` | 지연·스트리밍 | 지금까지 본 키의 집합 |
| `Intersect`, `IntersectBy`, `Except`, `ExceptBy` | 지연·버퍼링 | **두 번째** 시퀀스 전체 |
| `Join`, `GroupJoin` | 지연·버퍼링 | **내부(inner)** 시퀀스 전체(룩업으로) |
| `OrderBy`, `OrderByDescending`, `ThenBy`, `ThenByDescending`, `Order`, `OrderDescending` | 지연·버퍼링 | 입력 전체 |
| `Reverse` | 지연·버퍼링 | 입력 전체 |
| `GroupBy` | 지연·버퍼링 | 입력 전체 |
| `TakeLast`, `SkipLast` | 지연·버퍼링 | 마지막 n개짜리 큐 |
| `Chunk` | 지연·버퍼링 | 청크 하나 크기만큼 |
| `ToArray`, `ToList`, `ToDictionary`, `ToHashSet`, `ToLookup` | **즉시** | 결과 컬렉션 전체 |
| `First`, `Last`, `Single`, `ElementAt`, `MinBy`, `MaxBy` (+`OrDefault` 변형) | **즉시** | 없음(`Last`는 예외적으로 인덱서 사용 가능) |
| `Count`, `LongCount`, `Sum`, `Average`, `Min`, `Max`, `Aggregate` | **즉시** | 없음 |
| `Any`, `All`, `Contains`, `SequenceEqual` | **즉시** | 없음 |
| `Range`, `Repeat` | 지연·스트리밍 | 없음 |
| `Empty` | 해당 없음(캐시된 싱글턴 반환) | 없음 |
| `AsEnumerable`, `AsQueryable` | 해당 없음(캐스팅만) | 없음 |

> **📌 "지연·버퍼링"이 왜 위험한 이름인가**
>
> `OrderBy`가 지연 연산자라는 말은 **호출 시점에 아무 일도 하지 않는다**는 뜻일 뿐이다. `foreach`가 첫 원소를 요청하는 순간 원본 100만 개가 전부 배열로 복사되고 정렬된다. "지연이니까 가볍다"는 직관은 스트리밍 연산자에만 통한다. 메모리 사용량을 볼 때는 지연 여부가 아니라 **버퍼링 여부**를 봐야 한다.

> **⚠️ 무한 시퀀스와 버퍼링 연산자**
>
> 반복자 메서드(28.3절)로 만든 무한 시퀀스에 `OrderBy`, `Reverse`, `GroupBy`, `TakeLast`를 붙이면 **프로그램이 멈추지 않는다.** 예외도 없이 `OutOfMemoryException`이 날 때까지 메모리를 먹는다. 무한 시퀀스에는 스트리밍 연산자만 쓰고, `Take`로 잘라낸 뒤에 버퍼링 연산자를 붙여라.

### 쿼리 구문 대응 여부

세 번째 좌표축이다. C#의 쿼리 식 키워드로 표현할 수 있는 연산자는 소수다. 29.4절에서 본 것을 레퍼런스 형태로 다시 정리한다.

| 쿼리 구문 키워드 | 번역되는 연산자 | 비고 |
|---|---|---|
| `from x in xs` (첫 번째) | 없음 | 범위 변수 도입만 |
| `from T x in xs` | `Cast<T>` | 범위 변수 앞에 타입을 쓰면 캐스팅 |
| `from y in ys` (두 번째 이후) | `SelectMany` | 30.3절 |
| `where` | `Where` | 여러 번 쓸 수 있다 |
| `select` | `Select` | 쿼리의 마지막 절 중 하나 |
| `orderby a, b descending` | `OrderBy` + `ThenByDescending` | 30.5절 |
| `group e by k` | `GroupBy` | 쿼리의 마지막 절 중 하나 |
| `join y in ys on a equals b` | `Join` | 30.4절 |
| `join y in ys on a equals b into g` | `GroupJoin` | `into`가 붙으면 달라진다 |
| `let x = expr` | `Select` + 투명 식별자 | 29.3절, 30.15절 |
| `into` (`select`/`group` 뒤) | 없음 | 쿼리 계속(query continuation) |

나머지 전부 — `Take`, `Skip`, `Distinct`, `Concat`, `Union`, `First`, `Count`, `Aggregate`, `Zip`, `Chunk` 등 — 는 **대응하는 키워드가 없다.** 쿼리 식으로 시작했더라도 이들을 쓰려면 괄호로 감싸고 점을 찍어야 한다(29.5절).

```csharp
// 쿼리 식을 괄호로 감싸고 플루언트로 이어 붙인다
var page = (from n in names
            where n.Length > 4
            orderby n
            select n)
           .Skip(20).Take(10);
```

> **💡 이 장을 읽는 법**
>
> 절마다 맨 앞에 요약표를 둔다. 표만 훑어도 레퍼런스로는 충분하고, 표 뒤의 본문은 **표만으로는 알 수 없는 것** — 내부 구현, 예외 조건, 조용히 깨지는 지점 — 만 다룬다. 처음에는 표와 ⚠️ 박스만 읽고, 두 번째에 본문으로 들어가면 된다.

---

## 30.2 필터링 — `Where`, `Take`, `TakeLast`, `Skip`, `SkipLast`, `TakeWhile`, `SkipWhile`, `Distinct`, `DistinctBy`

`IEnumerable<TSource>` → `IEnumerable<TSource>`. 원소를 골라내되 변형하지 않는다.

| 연산자 | 쿼리 구문 | 실행 | 하는 일 | SQL 대응 |
|---|---|---|---|---|
| `Where` | `where` | 지연·스트리밍 | 조건을 만족하는 원소만 | `WHERE` |
| `Take` | — | 지연·스트리밍 | 앞에서 n개만 | `TOP n` / `ROW_NUMBER()` |
| `Skip` | — | 지연·스트리밍 | 앞에서 n개를 버림 | `OFFSET` / `ROW_NUMBER()` |
| `TakeLast` | — | 지연·버퍼링 | 뒤에서 n개만 | 번역 없음 |
| `SkipLast` | — | 지연·버퍼링 | 뒤에서 n개를 버림 | 번역 없음 |
| `TakeWhile` | — | 지연·스트리밍 | 조건이 거짓이 될 때까지 | 번역 없음 |
| `SkipWhile` | — | 지연·스트리밍 | 조건이 거짓이 될 때까지 버림 | 번역 없음 |
| `Distinct` | — | 지연·스트리밍 | 중복 제거 | `SELECT DISTINCT` |
| `DistinctBy` ※.NET 6 | — | 지연·스트리밍 | 키 기준 중복 제거 | 번역 없음 |

> **📌 표의 "SQL 대응" 칸을 읽는 법**
>
> 이 칸은 EF Core 같은 `IQueryable` 구현이 **실제로 생성하는 SQL**이 아니다. "같은 일을 SQL로 직접 쓴다면 이렇게 쓸 것"이라는 뜻이다. 간단한 번역이 없으면 비워 두고, 아예 번역이 불가능하면 "번역 없음"이라고 적었다. EF Core에서 번역할 수 없는 연산자를 쓰면 예외가 난다(31장).

### `Where`

```csharp
public static IEnumerable<TSource> Where<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);

public static IEnumerable<TSource> Where<TSource>(
    this IEnumerable<TSource> source, Func<TSource, int, bool> predicate);
```

`Enumerable.Where`의 내부 구현은 인자 널 검사를 제외하면 기능적으로 다음과 같다.

```csharp
public static IEnumerable<TSource> Where<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate)
{
    foreach (TSource element in source)
        if (predicate(element))
            yield return element;
}
```

이 열 줄이 `Where`의 성질을 전부 설명한다. 반복자 메서드이므로 지연되고(28.3절), `foreach` 하나뿐이므로 스트리밍이며, 원소를 그대로 `yield return`하므로 변형이 없다.

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

IEnumerable<string> query = names.Where(name => name.EndsWith("y"));
// Harry, Mary, Jay
```

쿼리 구문에서는 `where` 절이고, **한 쿼리에 여러 번 나올 수 있으며** `let`·`orderby`·`join` 사이에 끼워 넣을 수 있다.

```csharp
var query = from n in names
            where n.Length > 3
            let u = n.ToUpper()
            where u.EndsWith("Y")
            select u;
// HARRY, MARY
```

C#의 일반 스코프 규칙이 그대로 적용된다. 범위 변수나 `let`으로 선언하기 전에는 참조할 수 없다.

### 인덱스 필터링

두 번째 오버로드는 조건자에 **입력 시퀀스에서의 위치**를 함께 넘긴다.

```csharp
IEnumerable<string> query = names.Where((n, i) => i % 2 == 0);
// Tom, Harry, Jay  — 짝수 번째만
```

> **⚠️ 인덱스 오버로드는 로컬 쿼리 전용이고, 인덱스는 출력이 아니라 입력에서의 위치다**
>
> `Where((n, i) => ...)`, `Select((s, i) => ...)`, `SelectMany((s, i) => ...)`의 인덱스 오버로드는 EF Core에서 쓰면 예외가 난다. SQL에는 "입력 시퀀스에서의 순서"라는 개념이 없기 때문이다. 인덱스가 필요하면 `AsEnumerable()`로 로컬 경계를 먼저 그어라(31.5절).
>
> `.Where(...).Where((n, i) => i == 0)`에서 `i`는 **두 번째 `Where`가 받는 시퀀스**, 즉 첫 번째 `Where`의 출력에서의 위치다. 원본 배열에서의 위치가 아니다. 연산자를 하나 끼워 넣는 순간 인덱스의 의미가 바뀐다. 이런 이유로 인덱스 오버로드는 체인 맨 앞에서만 쓰는 것이 안전하다.

### `Take`, `Skip`, `TakeLast`, `SkipLast`

```csharp
public static IEnumerable<TSource> Take<TSource>(
    this IEnumerable<TSource> source, int count);

public static IEnumerable<TSource> Take<TSource>(
    this IEnumerable<TSource> source, Range range);   // ※.NET 6

public static IEnumerable<TSource> Skip<TSource>(
    this IEnumerable<TSource> source, int count);
```

`Take`와 `Skip`은 페이징의 기본 도구다.

```csharp
IQueryable<Book> query = dbContext.Books        // 21~40번째 결과
    .Where(b => b.Title.Contains("mercury"))
    .OrderBy(b => b.Title)
    .Skip(20).Take(20);
```

.NET 6부터 `Take`에 `Range` 오버로드가 생겼고, 이 오버로드 하나가 나머지 셋의 기능을 흡수한다.

| 표현 | 같은 뜻 |
|---|---|
| `Take(5)` | 앞에서 5개 |
| `Take(5..)` | `Skip(5)` |
| `Take(..^5)` | `SkipLast(5)` |
| `Take(^5..)` | `TakeLast(5)` |
| `Take(2..7)` | `Skip(2).Take(5)` |

> **⚠️ 페이징에는 반드시 정렬을 먼저 붙여라**
>
> `Skip`/`Take`는 "지금 오는 순서"에서 잘라내는데, LINQ 공급자는 순서를 명시하지 않는 한 **매번 같은 순서를 돌려줄 의무가 없다.** 관계형 데이터베이스가 보통 기본 키 인덱스 순서로 주는 것은 보장이 아니라 우연이다. 순서가 바뀌면 1페이지의 항목이 2페이지에도 나오거나 아예 사라진다. **`OrderBy` 없는 `Skip`/`Take` 페이징은 버그다.**

> **📌 음수와 0을 넘겨도 예외는 나지 않는다**
>
> `Take(0)`이나 `Take(-3)`은 빈 시퀀스를 돌려주고 원본을 열거조차 하지 않는다. `Skip(0)`이나 `Skip(-3)`은 원본 전체를 돌려준다. 페이지 번호 계산이 음수로 새더라도 조용히 넘어간다는 뜻이므로, 잘못된 페이지 번호를 잡아내려면 별도 검증이 필요하다.

`TakeLast(n)`과 `SkipLast(n)`은 "뒤에서 n개"를 다룬다. 시퀀스의 끝이 어디인지는 끝까지 읽어야 알 수 있으므로 **크기 n짜리 순환 버퍼를 유지하면서** 진행한다. n이 크면 그만큼 메모리를 쓴다.

### `TakeWhile`과 `SkipWhile`

```csharp
public static IEnumerable<TSource> TakeWhile<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);
```

```csharp
int[] numbers = { 3, 5, 2, 234, 4, 1 };

var takeWhileSmall = numbers.TakeWhile(n => n < 100);  // { 3, 5, 2 }
var skipWhileSmall = numbers.SkipWhile(n => n < 100);  // { 234, 4, 1 }
```

> **⚠️ `TakeWhile`은 `Where`가 아니다**
>
> `numbers.Where(n => n < 100)`은 `{ 3, 5, 2, 4, 1 }`이다. `TakeWhile`은 `{ 3, 5, 2 }`다. **조건이 처음 거짓이 되는 순간 시퀀스를 끊고**, 그 뒤에 조건을 만족하는 원소가 있어도 보지 않는다. `SkipWhile`도 마찬가지로 조건이 처음 거짓이 된 뒤부터는 조건을 아예 평가하지 않고 전부 내보낸다. 정렬되지 않은 시퀀스에 `TakeWhile`을 쓰면 거의 항상 버그다.

`TakeWhile`은 이 성질 때문에 **정렬된 시퀀스를 조기 종료하는 데** 쓴다. 100만 개짜리 정렬된 로그에서 특정 시각 이전 항목만 필요하면 `Where`는 100만 개를 다 훑지만 `TakeWhile`은 경계에서 멈춘다.

### `Distinct`와 `DistinctBy`

```csharp
public static IEnumerable<TSource> Distinct<TSource>(
    this IEnumerable<TSource> source);

public static IEnumerable<TSource> Distinct<TSource>(
    this IEnumerable<TSource> source, IEqualityComparer<TSource>? comparer);

public static IEnumerable<TSource> DistinctBy<TSource, TKey>(   // ※.NET 6
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);
```

```csharp
char[] distinctLetters = "HelloWorld".Distinct().ToArray();
string s = new string(distinctLetters);          // HeloWrd
```

`string`이 `IEnumerable<char>`를 구현하므로 문자열에 직접 LINQ 메서드를 호출할 수 있다.

`Distinct`는 내부적으로 해시 집합을 유지하면서 **처음 본 원소만 흘려보낸다.** 따라서 출력 순서는 원본에서 **처음 등장한 순서**이고, 스트리밍이다. 다만 유지하는 집합은 지금까지 본 서로 다른 원소 전부이므로, 중복이 거의 없는 100만 개짜리 시퀀스에 `Distinct`를 붙이면 100만 개짜리 해시 집합이 생긴다.

`DistinctBy`는 비교 전에 키 선택자를 적용한다.

```csharp
new[] { 1.0, 1.1, 2.0, 2.1, 3.0, 3.1 }.DistinctBy(n => Math.Round(n, 0));
// { 1, 2, 3 }  — 정확히는 { 1.0, 2.0, 3.0 }
```

> **⚠️ `DistinctBy`가 남기는 것은 "첫 번째"다**
>
> 위 결과가 `{1.0, 2.0, 3.0}`이지 `{1.1, 2.1, 3.1}`이 아닌 이유는 각 키 그룹에서 **처음 등장한 원소**를 남기기 때문이다. "최신 것을 남기고 싶다"면 `DistinctBy` 앞에 내림차순 정렬을 붙이거나, `GroupBy` 후 그룹마다 원하는 원소를 고르는 편이 의도가 드러난다.

> **⚠️ 참조 타입에 `Distinct`를 쓸 때**
>
> `Distinct`는 `EqualityComparer<T>.Default`를 쓴다. `Equals`/`GetHashCode`를 재정의하지 않은 클래스라면 **참조 동등성**으로 비교하므로, 내용이 같은 서로 다른 인스턴스는 중복으로 취급되지 않는다. 레코드(19장)는 값 동등성을 자동 구현하므로 기대대로 동작한다. 동등성 계약은 25.3절과 25.4절을 참조하라.

### EF Core에서의 필터링 — `LIKE`, `IN`, 문자열 비교

`string`의 다음 메서드는 SQL의 `LIKE`로 번역된다.

| C# | SQL |
|---|---|
| `c.Name.Contains("abc")` | `Name LIKE '%abc%'` |
| `c.Name.StartsWith("abc")` | `Name LIKE 'abc%'` |
| `c.Name.EndsWith("abc")` | `Name LIKE '%abc'` |

`Contains`는 **로컬에서 평가되는 식**과만 비교할 수 있다. 다른 컬럼과 비교하려면 `EF.Functions.Like`를 써야 한다.

```csharp
// 컬럼 대 컬럼 비교, 그리고 복잡한 패턴
... where EF.Functions.Like(c.Description, "%" + c.Name + "%")
```

문자열의 순서 비교는 `CompareTo`가 SQL의 `<`, `>`로 번역된다.

```csharp
dbContext.Purchases.Where(p => p.Description.CompareTo("C") < 0);
```

로컬 컬렉션에 `Contains`를 걸면 SQL의 `IN`이 된다.

```csharp
string[] chosenOnes = { "Tom", "Jay" };

var q = from c in dbContext.Customers
        where chosenOnes.Contains(c.Name)
        select c;
// WHERE customer.Name IN ('Tom', 'Jay')
```

로컬 컬렉션이 엔티티나 비스칼라 타입의 배열이면 EF Core가 `IN` 대신 `EXISTS` 절을 생성할 수도 있다.

> **💡 로컬 쿼리에서는 조인보다 필터를 먼저**
>
> EF Core에서는 `where` 절의 위치를 위아래로 옮겨도 같은 SQL이 나오는 경우가 많다. 옵티마이저가 알아서 재배치하기 때문이다. **로컬 쿼리에서는 그렇지 않다.** 데코레이터 체인은 쓴 순서 그대로 실행된다. 원소를 줄이는 연산자(`Where`, `Take`)를 늘리는 연산자(`SelectMany`, `Join`)보다 **앞에** 두는 것이 로컬 쿼리 최적화의 첫 번째 규칙이다.

---

## 30.3 투영 — `Select`, `SelectMany`

`IEnumerable<TSource>` → `IEnumerable<TResult>`. 원소를 변형한다.

| 연산자 | 쿼리 구문 | 실행 | 입력 1개당 출력 | SQL 대응 |
|---|---|---|---|---|
| `Select` | `select` | 지연·스트리밍 | 정확히 1개 | `SELECT` |
| `SelectMany` | 두 번째 이후의 `from` | 지연·스트리밍 | 0..n개 | `INNER JOIN`, `LEFT OUTER JOIN`, `CROSS JOIN` |

### `Select`

```csharp
public static IEnumerable<TResult> Select<TSource, TResult>(
    this IEnumerable<TSource> source, Func<TSource, TResult> selector);

public static IEnumerable<TResult> Select<TSource, TResult>(
    this IEnumerable<TSource> source, Func<TSource, int, TResult> selector);
```

구현은 `Where`만큼이나 단순하다.

```csharp
public static IEnumerable<TResult> Select<TSource, TResult>(
    this IEnumerable<TSource> source, Func<TSource, TResult> selector)
{
    foreach (TSource element in source)
        yield return selector(element);
}
```

출력 원소 수는 입력과 **항상 같다.** 모양만 바뀐다.

```csharp
IEnumerable<string> query = FontFamily.Families.Select(f => f.Name);
```

익명 타입으로 투영하는 것이 가장 흔한 용법이다.

```csharp
var query =
    from f in FontFamily.Families
    select new { f.Name, LineSpacing = f.GetLineSpacing(FontStyle.Bold) };
```

인덱스 오버로드는 로컬 쿼리에서만 동작한다.

```csharp
IEnumerable<string> query = names.Select((s, i) => i + "=" + s);
// { "0=Tom", "1=Dick", ... }
```

> **📌 변형 없는 `select`는 생성되지 않는다**
>
> `from f in fonts where ... select f`처럼 범위 변수를 그대로 투영하면 컴파일러는 `.Select(f => f)`를 **아예 만들지 않는다.** 아무 일도 하지 않는 데코레이터 한 겹이 사라지는 것이다. 다만 `select`만 있는 쿼리에서는 생성된다. 이 예외의 이유는 29.3절에서 다뤘다.

### `Select` 안의 서브쿼리 — 객체 계층 만들기

`select` 절 안에 쿼리를 중첩하면 평면 결과 집합 대신 **계층 구조**를 만들 수 있다.

```csharp
DirectoryInfo[] dirs = new DirectoryInfo(Path.GetTempPath()).GetDirectories();

var query =
    from d in dirs
    where (d.Attributes & FileAttributes.System) == 0
    select new
    {
        DirectoryName = d.FullName,
        Created = d.CreationTime,
        Files = from f in d.GetFiles()
                where (f.Attributes & FileAttributes.Hidden) == 0
                select new { FileName = f.Name, f.Length }
    };

foreach (var dirFiles in query)
{
    Console.WriteLine("Directory: " + dirFiles.DirectoryName);
    foreach (var file in dirFiles.Files)
        Console.WriteLine("  " + file.FileName + " Len: " + file.Length);
}
```

안쪽 쿼리가 바깥 쿼리의 객체(`d`)를 참조하므로 **상관 서브쿼리(correlated subquery)** 다.

> **⚠️ 로컬 쿼리에서 `Select` 안의 서브쿼리는 이중 지연이다**
>
> 위 코드에서 `d.GetFiles()`는 바깥 `foreach`가 그 디렉터리에 도달할 때 호출되고, 필터링과 투영은 **안쪽 `foreach`가 돌 때** 비로소 일어난다. 지연이 두 겹이다. 결과를 한 번만 쓰면 문제없지만, 바깥 결과를 리스트로 담아 두고 나중에 안쪽을 여러 번 열거하면 디렉터리 접근이 그때마다 반복된다. 29.7절의 재평가 문제가 계층 구조에서 더 잘 보이지 않는 형태로 나타난 것이다.

이 패턴은 **해석되는 쿼리에 특히 잘 맞는다.** 바깥 쿼리와 서브쿼리가 하나의 단위로 처리되어 왕복이 늘지 않는다. 반대로 **로컬 쿼리에서는 비효율적이다.** 매칭되는 조합을 찾기 위해 바깥×안쪽 모든 조합을 열거해야 하기 때문이다. 로컬 컬렉션에는 `Join`이나 `GroupJoin`(30.4절)이 훨씬 낫다.

```csharp
// EF Core: 고객 이름 + 고액 구매 목록 (계층 구조)
var query =
    from c in dbContext.Customers
    select new
    {
        c.Name,
        Purchases = from p in c.Purchases      // 탐색 속성
                    where p.Price > 1000
                    select new { p.Description, p.Price }
    };
```

이 쿼리는 SQL의 **왼쪽 외부 조인**과 같은 의미다. 구매가 하나도 없는 고객도 전부 나온다. 내부 조인을 흉내 내려면 조건을 하나 더 붙여야 한다.

```csharp
from c in dbContext.Customers
where c.Purchases.Any(p => p.Price > 1000)
select new
{
    c.Name,
    Purchases = from p in c.Purchases
                where p.Price > 1000
                select new { p.Description, p.Price }
};
```

같은 조건자(`Price > 1000`)를 두 번 쓴 것이 지저분하다. `let`으로 중복을 없앨 수 있다.

```csharp
from c in dbContext.Customers
let highValueP = from p in c.Purchases
                 where p.Price > 1000
                 select new { p.Description, p.Price }
where highValueP.Any()
select new { c.Name, Purchases = highValueP };
```

`Any`를 `Count() >= 2`로 바꾸면 "고액 구매가 두 건 이상인 고객"이 된다. 이 유연함이 서브쿼리 투영의 장점이다.

### `SelectMany`

```csharp
public static IEnumerable<TResult> SelectMany<TSource, TResult>(
    this IEnumerable<TSource> source,
    Func<TSource, IEnumerable<TResult>> selector);

// 컴파일러가 쿼리 구문 번역에 쓰는 3인자 오버로드
public static IEnumerable<TResult> SelectMany<TSource, TCollection, TResult>(
    this IEnumerable<TSource> source,
    Func<TSource, IEnumerable<TCollection>> collectionSelector,
    Func<TSource, TCollection, TResult> resultSelector);
```

구현은 중첩된 `foreach` 두 개다.

```csharp
public static IEnumerable<TResult> SelectMany<TSource, TResult>(
    IEnumerable<TSource> source,
    Func<TSource, IEnumerable<TResult>> selector)
{
    foreach (TSource element in source)
        foreach (TResult subElement in selector(element))
            yield return subElement;
}
```

`Select`가 입력 하나당 출력 하나를 내놓는 반면 `SelectMany`는 **0..n개**를 내놓는다. 그 0..n개는 람다가 반환한 자식 시퀀스에서 온다. 최종 결과는 모든 자식 시퀀스를 이어 붙인 **평면 시퀀스**다.

```csharp
string[] fullNames = { "Anne Williams", "John Fred Smith", "Sue Green" };

IEnumerable<string> query = fullNames.SelectMany(name => name.Split());
// Anne|Williams|John|Fred|Smith|Sue|Green|
```

같은 자리에 `Select`를 쓰면 `IEnumerable<string[]>`이 나와서 중첩 `foreach`가 필요하다. `SelectMany`의 존재 이유가 **평탄화**임을 보여주는 대비다.

```text
       Select                          SelectMany
┌────────────────────┐          ┌────────────────────┐
│ "Anne Williams"    │          │ "Anne Williams"    │
│ "John Fred Smith"  │          │ "John Fred Smith"  │
│ "Sue Green"        │          │ "Sue Green"        │
└─────────┬──────────┘          └─────────┬──────────┘
          │ .Split()                      │ .Split()
          ↓                               ↓
┌────────────────────┐          ┌────────────────────┐
│ ["Anne","Williams"]│          │ "Anne"             │
│ ["John","Fred",    │          │ "Williams"         │
│  "Smith"]          │  평탄화  │ "John"             │
│ ["Sue","Green"]    │  ────→   │ "Fred"             │
└────────────────────┘          │ "Smith"            │
 IEnumerable<string[]>          │ "Sue"              │
 (중첩 foreach 필요)             │ "Green"            │
                                └────────────────────┘
                                 IEnumerable<string>
```

### `SelectMany`는 다중 `from`으로 번역된다

**이 장에서 반드시 기억해야 할 대응 하나를 꼽으라면 이것이다.** 쿼리 식에서 `from` 키워드는 두 가지 뜻을 갖는다.

- 쿼리 **맨 앞**의 `from` — 원래 범위 변수와 입력 시퀀스를 도입한다. 어떤 연산자로도 번역되지 않는다.
- 그 **뒤의 모든** `from` — `SelectMany`로 번역된다.

```csharp
IEnumerable<string> query =
    from fullName in fullNames
    from name in fullName.Split()      // ← SelectMany
    select name;
```

추가 생성기(generator)는 새 범위 변수(`name`)를 도입하지만 **기존 범위 변수(`fullName`)도 스코프에 남는다.** 둘 다 쓸 수 있다는 것이 쿼리 구문의 결정적 장점이다.

```csharp
from fullName in fullNames
from name in fullName.Split()
select name + " came from " + fullName;
// Anne came from Anne Williams
// Williams came from Anne Williams
// John came from John Fred Smith  ...
```

이걸 플루언트 구문으로 직접 쓰려면 까다롭다. `SelectMany`의 2인자 오버로드는 자식 원소만 내놓으므로 바깥 원소(`fullName`)가 사라지기 때문이다. **해법은 바깥 원소를 자식과 함께 익명 타입에 실어 나르는 것이다** — 29.3절의 투명 식별자와 정확히 같은 장치다.

```csharp
// 정렬 절이 끼면 더 어려워진다
from fullName in fullNames
from name in fullName.Split()
orderby fullName, name
select name + " came from " + fullName;

// 위와 같은 뜻의 플루언트 구문
IEnumerable<string> query = fullNames
    .SelectMany(fName => fName.Split()
                              .Select(name => new { name, fName }))
    .OrderBy (x => x.fName)
    .ThenBy  (x => x.name)
    .Select  (x => x.name + " came from " + x.fName);
```

실제 컴파일러는 이 자리에서 2인자 오버로드 + 내부 `Select` 대신 **3인자 오버로드**를 쓴다. 결과 선택자가 `(fName, name) => new { fName, name }`이 되어 같은 익명 타입 쌍을 만든다. 어느 쪽이든 **원소마다 익명 타입 인스턴스 하나가 힙에 할당된다**는 사실은 같다(30.14절).

> **💡 범위 변수가 둘 이상이면 쿼리 구문으로 쓰고, 쿼리 구문으로 생각하라**
>
> 다중 `from`이 필요한 순간이 쿼리 구문이 플루언트 구문을 확실히 이기는 자리다. 이때는 문법만 쿼리 구문으로 쓰지 말고 **사고 자체를 쿼리 구문으로 하라.** "바깥 원소를 어떻게 안쪽까지 끌고 갈까"를 고민하는 대신 "`from`을 하나 더 놓는다"로 생각하면 된다.

### 추가 생성기의 두 가지 패턴

`SelectMany`가 쓰이는 방식은 실질적으로 두 가지뿐이다.

**패턴 1 — 자식 시퀀스 펼치기.** 추가 생성기의 식이 **기존 범위 변수의 속성이나 메서드**를 호출한다. EF Core에서는 컬렉션 탐색 속성을 펼치는 형태가 이에 해당한다.

```csharp
from c in dbContext.Customers
from p in c.Purchases               // c에 의존
select c.Name + " bought a " + p.Description;
```

**패턴 2 — 데카르트 곱(교차 조인).** 추가 생성기의 식이 **기존 범위 변수와 무관한** 시퀀스를 돌려준다.

```csharp
int[] numbers = { 1, 2, 3 };
string[] letters = { "a", "b" };

IEnumerable<string> query = from n in numbers
                            from l in letters       // n과 무관
                            select n.ToString() + l;
// { "1a", "1b", "2a", "2b", "3a", "3b" }
```

교차 곱에 필터를 걸면 그것이 곧 **조인**이다.

```csharp
string[] players = { "Tom", "Jay", "Mary" };

IEnumerable<string> query = from name1 in players
                            from name2 in players
                            where name1.CompareTo(name2) < 0    // 조인 조건
                            orderby name1, name2
                            select name1 + " vs " + name2;
// { "Jay vs Mary", "Jay vs Tom", "Mary vs Tom" }
```

조인 조건에 등호가 아닌 연산자를 쓰므로 **비등가 조인(non-equi join)** 이다. `Join` 연산자로는 표현할 수 없고 `SelectMany`로만 가능하다.

> **⚠️ 로컬 쿼리에서 `SelectMany` 조인은 O(n×m)이다**
>
> 위 코드는 바깥 원소마다 안쪽 시퀀스를 처음부터 끝까지 다시 훑는다. 고객 1,000명과 구매 10,000건을 이렇게 조인하면 비교가 1,000만 번 일어난다. 같은 일을 `Join`으로 하면 구매를 룩업 하나로 만든 뒤 고객마다 조회하므로 대략 11,000번의 작업으로 끝난다. **로컬 컬렉션의 등가 조인에 `SelectMany`를 쓰지 마라.**

### `SelectMany`로 외부 조인 — `DefaultIfEmpty`

계층 구조를 평면화하면 왼쪽 외부 조인이 **내부 조인으로 바뀐다.**

```csharp
// 고액 구매가 있는 고객만 나온다 = 내부 조인
from c in dbContext.Customers
from p in c.Purchases
where p.Price > 1000
select new { c.Name, p.Description, p.Price };
```

평면 결과를 유지하면서 외부 조인을 얻으려면 안쪽 시퀀스에 `DefaultIfEmpty`를 건다. 이 연산자는 입력이 비어 있으면 **`null` 원소 하나짜리 시퀀스**를 돌려준다.

```csharp
from c in dbContext.Customers
from p in c.Purchases.DefaultIfEmpty()
select new { c.Name, p.Description, Price = (decimal?) p.Price };
```

> **⚠️ 이 쿼리는 EF Core에서는 돌고 로컬에서는 터진다**
>
> EF Core에서는 `p`가 `null`인 행이 SQL 수준에서 처리되어 잘 동작한다. **같은 쿼리를 로컬로 실행하면 `p.Description`에서 `NullReferenceException`이 난다.** LINQ 코드가 같아도 실행 위치에 따라 의미가 달라지는 대표 사례다. 어느 쪽에서도 안전하려면 널 검사를 명시해야 한다.
>
> ```csharp
> from c in dbContext.Customers
> from p in c.Purchases.DefaultIfEmpty()
> select new
> {
>     c.Name,
>     Descript = p == null ? null : p.Description,
>     Price    = p == null ? (decimal?) null : p.Price
> };
> ```

> **⚠️ `where`를 `DefaultIfEmpty` 뒤에 두면 외부 조인이 아니다**
>
> ```csharp
> from c in dbContext.Customers
> from p in c.Purchases.DefaultIfEmpty()
> where p.Price > 1000                 // ← 틀렸다
> ```
>
> 이 `where`는 `DefaultIfEmpty`가 **끼워 넣은 `null` 행까지 걸러낸다.** 결과는 다시 내부 조인이다. 필터는 `DefaultIfEmpty` **앞에** 서브쿼리로 끼워 넣어야 한다.
>
> ```csharp
> from c in dbContext.Customers
> from p in c.Purchases.Where(p => p.Price > 1000).DefaultIfEmpty()
> select new { ... };
> ```

> **💡 평면 외부 조인을 굳이 쓸 이유가 있는지 먼저 물어라**
>
> SQL에 익숙한 사람일수록 익숙한 평면 결과 집합으로 가려는 관성이 있다. 하지만 `Select` 서브쿼리로 만든 **계층 결과가 외부 조인 스타일 쿼리에는 대개 더 잘 맞는다.** 널을 다룰 필요가 아예 없기 때문이다. LINQ는 관계형 데이터를 평면화하지 않고 계층 그대로 다룰 수 있다는 점에서 SQL과 방향이 반대다.

---

## 30.4 조인 — `Join`, `GroupJoin`, `Zip`

| 연산자 | 쿼리 구문 | 실행 | 결과 모양 | SQL 대응 |
|---|---|---|---|---|
| `Join` | `join ... on ... equals ...` | 지연·버퍼링(inner) | 평면 | `INNER JOIN` |
| `GroupJoin` | `join ... into g` | 지연·버퍼링(inner) | 계층 | `INNER JOIN`, `LEFT OUTER JOIN` |
| `Zip` | — | 지연·스트리밍 | 평면(짝 맞춤) | 번역 없음 |

`Join`과 `GroupJoin`은 시퀀스 두 개를 하나로 엮는다. 이름부터 다르다. 앞의 둘은 타입 매개변수를 `TOuter`/`TInner`라 부르고, `Zip`은 `TFirst`/`TSecond`라 부른다. 이 명명 차이가 동작 차이를 그대로 드러낸다. **`Join`에는 바깥과 안쪽이라는 비대칭이 있고, `Zip`에는 없다.**

### `Join`

```csharp
public static IEnumerable<TResult> Join<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, TInner, TResult> resultSelector);
```

| 인자 | 타입 |
|---|---|
| 바깥 시퀀스 | `IEnumerable<TOuter>` |
| 안쪽 시퀀스 | `IEnumerable<TInner>` |
| 바깥 키 선택자 | `TOuter => TKey` |
| 안쪽 키 선택자 | `TInner => TKey` |
| 결과 선택자 | `(TOuter, TInner) => TResult` |

```csharp
IQueryable<string> query =
    from c in dbContext.Customers
    join p in dbContext.Purchases on c.ID equals p.CustomerID
    select c.Name + " bought a " + p.Description;
```

쿼리 구문의 일반형은 이렇다.

```text
join inner-var in inner-sequence on outer-key-expr equals inner-key-expr
```

- **바깥 시퀀스** — 이미 쿼리에 들어와 있는 입력 시퀀스(`customers`)
- **안쪽 시퀀스** — `join` 절이 새로 들여오는 컬렉션(`purchases`)

`Join`은 내부 조인이므로 구매가 없는 고객은 제외된다. 내부 조인은 대칭이므로 안팎을 바꿔도 결과는 같다.

```csharp
from p in purchases
join c in customers on p.CustomerID equals c.ID    // p가 바깥이 됐다
...
```

`join` 절은 여러 번 이어 쓸 수 있고, 이전 `join`의 변수들은 계속 스코프에 남으며, 사이에 `where`와 `let`을 끼워 넣을 수 있다. 아래에서 `purchases`는 첫 조인의 안쪽이자 두 번째 조인의 바깥이다.

```csharp
from c in customers
join p  in purchases     on c.ID equals p.CustomerID   // 첫 조인
join pi in purchaseItems on p.ID equals pi.PurchaseID  // 두 번째 조인
...
```

### 다중 키 조인

익명 타입으로 복합 키를 만든다.

```csharp
from x in sequenceX
join y in sequenceY on new { K1 = x.Prop1, K2 = x.Prop2 }
                equals new { K1 = y.Prop3, K2 = y.Prop4 }
...
```

> **⚠️ 두 익명 타입의 구조가 정확히 같아야 한다**
>
> 프로퍼티 **이름·타입·선언 순서**가 모두 일치해야 컴파일러가 같은 내부 타입으로 구현하고, 그래야 조인 키가 호환된다. `K1`/`K2`를 한쪽에서 `Key1`/`Key2`로 쓰거나 순서를 바꾸면 "형식을 유추할 수 없다"는 컴파일 오류가 난다. 익명 타입의 동등성이 프로퍼티 기준 값 동등성이라는 사실(29.10절)이 여기서 실용적으로 쓰인다.

### 플루언트 구문의 `Join`

```csharp
customers.Join(
    purchases,                                          // 안쪽 컬렉션
    c => c.ID,                                          // 바깥 키 선택자
    p => p.CustomerID,                                  // 안쪽 키 선택자
    (c, p) => new { c.Name, p.Description, p.Price }    // 결과 선택자
);
```

투영 전에 `orderby` 같은 절이 더 있으면, 결과 선택자에서 **임시 익명 타입을 만들어 두 변수를 살려 두어야 한다.**

```csharp
customers.Join(
    purchases,
    c => c.ID,
    p => p.CustomerID,
    (c, p) => new { c, p })                  // 둘 다 살린다
  .OrderBy(x => x.p.Price)
  .Select (x => x.c.Name + " bought a " + x.p.Description);
```

### 해시 조인 — `Join`이 빠른 이유

`Enumerable.Join`은 두 단계로 동작한다.

1. **안쪽 시퀀스를 룩업으로 적재한다.**
2. **바깥 시퀀스를 훑으면서 룩업을 조회한다.**

`Enumerable.Join`의 가장 단순한 유효 구현은 이렇다.

```csharp
public static IEnumerable<TResult> Join<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, TInner, TResult> resultSelector)
{
    ILookup<TKey, TInner> lookup = inner.ToLookup(innerKeySelector);
    return
        from outerItem in outer
        from innerItem in lookup[outerKeySelector(outerItem)]
        select resultSelector(outerItem, innerItem);
}
```

`GroupJoin`은 더 단순하다. 룩업 조회 결과를 평탄화하지 않고 그대로 넘긴다.

```csharp
public static IEnumerable<TResult> GroupJoin<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, IEnumerable<TInner>, TResult> resultSelector)
{
    ILookup<TKey, TInner> lookup = inner.ToLookup(innerKeySelector);
    return
        from outerItem in outer
        select resultSelector(outerItem, lookup[outerKeySelector(outerItem)]);
}
```

```text
                    Join의 해시 조인 동작

  1단계 — 안쪽 시퀀스를 룩업으로 (O(m), 메모리 O(m))

   purchases                        ILookup<int, Purchase>
  ┌────────────────┐               ┌──────┬──────────────────────┐
  │ Bike   cust=1  │               │ key  │ 값 시퀀스             │
  │ Holiday cust=1 │  ToLookup     ├──────┼──────────────────────┤
  │ Phone  cust=2  │  ─────────→   │  1   │ [Bike] [Holiday]     │
  │ Car    cust=3  │  (해시 테이블) │  2   │ [Phone]              │
  │ Bike   cust=2  │               │  3   │ [Car]                │
  └────────────────┘               │  2   ← [Bike]는 key 2 버킷에 │
                                   └──────┴──────────────────────┘

  2단계 — 바깥 시퀀스를 훑으며 O(1) 조회 (O(n))

   customers            조회             결과(스트리밍)
  ┌──────────┐       lookup[1]        ┌───────────────────┐
  │ Tom  id=1│ ────────────────────→  │ Tom, Bike         │
  │ Dick id=2│                        │ Tom, Holiday      │
  │ Harry id=3│      lookup[2]        │ Dick, Phone       │
  └──────────┘  ────────────────────→ │ Dick, Bike        │
                                      │ Harry, Car        │
   총 비용 O(n+m)                      └───────────────────┘
   (SelectMany 조인은 O(n×m))
```

> **📌 룩업은 언제 만들어지는가**
>
> 조인 연산자도 다른 시퀀스 연산자와 마찬가지로 **지연 실행**을 지킨다. 룩업은 `Join`을 호출할 때가 아니라 **출력 시퀀스를 열거하기 시작할 때** 만들어진다. 그리고 그 순간 안쪽 시퀀스가 **통째로** 읽힌다. 그래서 `Join`은 "지연·버퍼링"이다.

> **⚠️ 안쪽 시퀀스가 큰 쪽이면 메모리가 튄다**
>
> 룩업에 적재되는 것은 **안쪽** 시퀀스다. 고객 1,000명과 구매 100만 건을 조인할 때 구매를 안쪽에 두면 100만 개짜리 해시 테이블이 힙에 생긴다. 내부 조인은 안팎을 바꿔도 결과가 같으므로, **작은 쪽을 안쪽에 두면** 메모리가 크게 줄어든다. 쿼리 구문에서는 `join` 절에 오는 쪽이 안쪽이다.

> **⚠️ EF Core에서는 `Join`의 장점이 없다**
>
> 위의 해시 조인 최적화는 `Enumerable`의 구현 이야기다. EF Core 쿼리에서는 `Join`이든 `SelectMany`든 결국 SQL로 번역되고, 조인 알고리즘은 데이터베이스 옵티마이저가 고른다. 오히려 `Select`/`SelectMany` 쪽이 외부 조인·비등가 조인으로 확장하기 쉬워 **더 유연하다.** LINQ는 이 점에서 SQL과 정반대다.

### 조인 전략 비교

| 전략 | 결과 모양 | 로컬 쿼리 효율 | 내부 조인 | 외부 조인 |
|---|---|---|---|---|
| `Select` + `SelectMany` | 평면 | 나쁨 | 가능 | 가능 |
| `Select` + `Select` | 계층 | 나쁨 | 가능 | 가능 |
| `Join` | 평면 | 좋음 | 가능 | 불가 |
| `GroupJoin` | 계층 | 좋음 | 가능 | 가능 |
| `GroupJoin` + `SelectMany` | 평면 | 좋음 | 가능 | 가능 |

### `GroupJoin`

인자는 `Join`과 같지만 결과 선택자만 다르다.

| 인자 | 타입 |
|---|---|
| 바깥 시퀀스 | `IEnumerable<TOuter>` |
| 안쪽 시퀀스 | `IEnumerable<TInner>` |
| 바깥 키 선택자 | `TOuter => TKey` |
| 안쪽 키 선택자 | `TInner => TKey` |
| 결과 선택자 | `(TOuter, IEnumerable<TInner>) => TResult` |

결과 선택자의 두 번째 인자가 원소 하나가 아니라 **시퀀스**다. 그래서 결과가 계층 구조가 되고, 매칭이 하나도 없는 바깥 원소는 **빈 시퀀스**와 짝지어지므로 결과에서 사라지지 않는다. 즉 **기본 동작이 왼쪽 외부 조인**이다.

쿼리 구문은 `join`에 `into`를 붙인다.

```csharp
IEnumerable<IEnumerable<Purchase>> query =
    from c in customers
    join p in purchases on c.ID equals p.CustomerID
    into custPurchases
    select custPurchases;         // 시퀀스의 시퀀스
```

이대로는 고객 정보가 없어 쓸모가 적다. 보통은 이렇게 쓴다.

```csharp
from c in customers
join p in purchases on c.ID equals p.CustomerID
into custPurchases
select new { CustName = c.Name, custPurchases };
```

> **⚠️ `into`는 두 가지 뜻이다**
>
> `join` 절 **바로 뒤**의 `into`는 `GroupJoin`으로 번역된다. `select`나 `group` 절 뒤의 `into`는 **쿼리 계속(query continuation)** 이고 연산자로 번역되지 않는다(29.9절). 문법은 같고 의미는 전혀 다르다. 공통점은 둘 다 새 범위 변수를 도입한다는 것뿐이다.

내부 조인을 원하면 그룹이 비어 있지 않은지 걸러야 한다.

```csharp
from c in customers join p in purchases on c.ID equals p.CustomerID
into custPurchases
where custPurchases.Any()
select ...
```

> **⚠️ `into` 뒤의 절은 개별 원소가 아니라 부분 시퀀스에 작용한다**
>
> `into custPurchases` 다음에 오는 `where`의 대상은 `Purchase` 하나가 아니라 **`Purchase`의 시퀀스**다. 개별 구매를 걸러 내려면 조인 **전에** 필터를 걸어야 한다.
>
> ```csharp
> from c in customers
> join p in purchases.Where(p2 => p2.Price > 1000)
>      on c.ID equals p.CustomerID
> into custPurchases ...
> ```

### 평면 외부 조인 — `GroupJoin` + `DefaultIfEmpty` + `SelectMany`

외부 조인은 `GroupJoin`이 주고, 평면 결과는 `Join`이 준다. 둘 다 원하면 세 연산자를 조합한다.

```csharp
from c in customers
join p in purchases on c.ID equals p.CustomerID into custPurchases
from cp in custPurchases.DefaultIfEmpty()       // ← SelectMany
select new
{
    CustName = c.Name,
    Price = cp == null ? (decimal?) null : cp.Price
};
```

`DefaultIfEmpty`가 빈 부분 시퀀스를 `null` 하나짜리로 바꾸고, 두 번째 `from`이 `SelectMany`로 번역되어 부분 시퀀스들을 평탄화한다.

### 룩업을 직접 쓰기

`ILookup<TKey, TElement>`는 **키로 직접 접근할 수 있는 그룹핑의 시퀀스**다. 하나의 키에 여러 원소를 담을 수 있는 읽기 전용 딕셔너리라고 봐도 된다.

```csharp
public interface ILookup<TKey, TElement> :
    IEnumerable<IGrouping<TKey, TElement>>, IEnumerable
{
    int Count { get; }
    bool Contains(TKey key);
    IEnumerable<TElement> this[TKey key] { get; }
}
```

`ToLookup`으로 직접 만들면 조인 연산자를 쓰지 않고도 같은 효율을 낼 수 있다. 룩업을 **여러 쿼리에서 재사용**할 수 있다는 장점이 덤으로 붙는다.

```csharp
ILookup<int?, Purchase> purchLookup =
    purchases.ToLookup(p => p.CustomerID, p => p);

foreach (Purchase p in purchLookup[1])
    Console.WriteLine(p.Description);
```

이제 조인 연산자와 룩업의 대응이 선명해진다.

| 조인 연산자 | 룩업으로 쓴 같은 쿼리 |
|---|---|
| `Join` | `from c in customers from p in purchLookup[c.ID] select ...` |
| `GroupJoin` | `from c in customers select new { c.Name, purchLookup[c.ID] }` |
| 평면 외부 조인 | `from c in customers from p in purchLookup[c.ID].DefaultIfEmpty() select ...` |

> **⚠️ 룩업의 인덱서는 없는 키에도 예외를 던지지 않는다**
>
> `Dictionary<K,V>`의 인덱서는 없는 키에 `KeyNotFoundException`을 던지지만, `ILookup`의 인덱서는 **빈 시퀀스**를 돌려준다. `GroupJoin`이 매칭 없는 바깥 원소를 자동으로 왼쪽 외부 조인 처리하는 것이 바로 이 성질 때문이다. 두 인덱서의 동작 차이를 알고 있어야 한다.

### `Zip`

```csharp
public static IEnumerable<TResult> Zip<TFirst, TSecond, TResult>(
    this IEnumerable<TFirst> first,
    IEnumerable<TSecond> second,
    Func<TFirst, TSecond, TResult> resultSelector);

// 튜플 반환 오버로드 ※.NET Core 3.0
public static IEnumerable<(TFirst, TSecond)> Zip<TFirst, TSecond>(
    this IEnumerable<TFirst> first, IEnumerable<TSecond> second);

// 세 시퀀스 오버로드 ※.NET 6
public static IEnumerable<(TFirst, TSecond, TThird)> Zip<TFirst, TSecond, TThird>(
    this IEnumerable<TFirst> first,
    IEnumerable<TSecond> second,
    IEnumerable<TThird> third);
```

`Zip`은 두(또는 세) 시퀀스를 **지퍼처럼 나란히** 열거하면서 같은 위치의 원소 쌍에 함수를 적용한다.

```csharp
int[] numbers = { 3, 5, 7 };
string[] words = { "three", "five", "seven", "ignored" };

IEnumerable<string> zip = numbers.Zip(words, (n, w) => n + "=" + w);
// 3=three
// 5=five
// 7=seven
```

> **⚠️ 남는 원소는 조용히 버려진다**
>
> 어느 한쪽이 짧으면 **짧은 쪽에서 멈추고**, 긴 쪽의 나머지 원소는 예외 없이 버려진다. 위 예에서 `"ignored"`가 그렇다. 길이가 같다고 가정한 코드에서 한쪽이 하나 모자라면 결과가 조용히 하나 줄어든다. 길이가 같아야 하는 상황이라면 `Zip` 전에 개수를 검증하라.

플루언트 구문의 `Join`은 인자가 다섯 개고 그중 셋이 람다라 어느 것이 바깥 키인지 헷갈리기 쉽다. 쿼리 구문의 `on A equals B`는 순서를 문법이 강제하므로(`equals` 왼쪽이 바깥) **조인만큼은 쿼리 구문이 명확하게 낫다.**

`Join`과 `Zip`의 차이는 이렇게 정리된다.

| 항목 | `Join` | `Zip` |
|---|---|---|
| 짝짓기 기준 | 키가 같은가 | 위치가 같은가 |
| 안팎 비대칭 | 있다(`TOuter`/`TInner`) | 없다(`TFirst`/`TSecond`) |
| 한쪽 원소가 여러 개와 매칭 | 가능(1:n) | 불가(항상 1:1) |
| 버퍼링 | 안쪽 전체 | 없음 |
| 출력 개수 | 매칭 조합 수 | 짧은 쪽의 길이 |
| EF Core | 번역됨 | 번역 안 됨 |

---

## 30.5 정렬 — `OrderBy`, `OrderByDescending`, `ThenBy`, `ThenByDescending`, `Order` ※.NET 7

`IEnumerable<TSource>` → `IOrderedEnumerable<TSource>`. 같은 원소를 다른 순서로 돌려준다.

| 연산자 | 쿼리 구문 | 실행 | 하는 일 | SQL 대응 |
|---|---|---|---|---|
| `OrderBy` | `orderby k` | 지연·버퍼링 | 키 기준 오름차순 | `ORDER BY ...` |
| `OrderByDescending` | `orderby k descending` | 지연·버퍼링 | 키 기준 내림차순 | `ORDER BY ... DESC` |
| `ThenBy` | `orderby k1, k2` | 지연·버퍼링 | 앞 정렬을 유지한 채 보조 정렬 | `ORDER BY k1, k2` |
| `ThenByDescending` | `orderby k1, k2 descending` | 지연·버퍼링 | 보조 내림차순 | `ORDER BY k1, k2 DESC` |
| `Order` ※.NET 7 | — | 지연·버퍼링 | 원소 자체를 기준으로 오름차순 | `ORDER BY ...` |
| `OrderDescending` ※.NET 7 | — | 지연·버퍼링 | 원소 자체를 기준으로 내림차순 | `ORDER BY ... DESC` |
| `Reverse` | — | 지연·버퍼링 | 순서를 뒤집는다 | 번역 없음 |

### 시그니처

```csharp
public static IOrderedEnumerable<TSource> OrderBy<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);

public static IOrderedEnumerable<TSource> OrderBy<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
    IComparer<TKey>? comparer);

public static IOrderedEnumerable<TSource> ThenBy<TSource, TKey>(
    this IOrderedEnumerable<TSource> source, Func<TSource, TKey> keySelector);
```

`ThenBy`의 첫 인자 타입이 `IEnumerable<TSource>`가 아니라 **`IOrderedEnumerable<TSource>`** 라는 점이 핵심이다. 이 타입 차이가 "앞의 정렬을 대체하지 말고 정제하라"는 의미를 타입 시스템에 새긴다.

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

names.OrderBy(s => s.Length);
// { "Tom", "Jay", "Dick", "Mary", "Harry" }
//   ↑ 길이가 같은 Tom/Jay, Dick/Mary는 입력 순서를 그대로 유지한다(안정 정렬)

names.OrderBy(s => s.Length).ThenBy(s => s);
// { "Jay", "Tom", "Dick", "Mary", "Harry" }
```

> **📌 원천 도서는 이 출력을 `{ "Jay", "Tom", "Mary", "Dick", "Harry" }`로 적는다**
>
> 같은 키를 가진 원소의 상대 순서가 "미정"이라는 점을 강조하려고 일부러 입력 순서와 다른 배열을 보인 것이다. 실제 `Enumerable.OrderBy`는 안정 정렬이므로 위와 같이 나온다. 그러나 **그 사실에 기대어 쓴 코드는 EF Core로 옮기는 순간 깨진다**(바로 아래 절).

`ThenBy`는 얼마든지 이어 붙일 수 있다.

```csharp
names.OrderBy(s => s.Length).ThenBy(s => s[1]).ThenBy(s => s[0]);

// 쿼리 구문
from s in names
orderby s.Length, s[1], s[0]
select s;
```

> **⚠️ `orderby`를 두 번 쓰면 `ThenBy`가 아니다**
>
> ```csharp
> from s in names
> orderby s.Length      // ← 이 정렬은
> orderby s[1]          // ← 이 정렬로 대체된다
> ...
> ```
>
> 두 번째 `orderby`는 `ThenBy`가 아니라 **또 다른 `OrderBy`** 로 번역된다. 로컬 쿼리에서는 (안정 정렬 덕분에) `s[1]` 기준으로 먼저 정렬한 뒤 `s.Length` 기준으로 다시 정렬한 것과 같은 결과가 나오고, 데이터베이스 쿼리에서는 앞의 정렬이 **그냥 버려진다.** 보조 정렬을 원하면 쉼표를 쓰거나 `ThenBy`를 써라.

### 정렬의 안정성

**LINQ to Objects의 정렬 연산자는 안정 정렬(stable sort)이다.** 키가 같은 원소들은 입력에서의 상대 순서를 그대로 유지한다. 이것은 문서화된 동작이며, `ThenBy`가 "앞 정렬을 유지한 채 정제"하는 방식으로 구현될 수 있는 근거이기도 하다.

이 성질은 실무에서 유용하다. 예컨대 `.OrderBy(a).ThenBy(b)` 대신 `.OrderBy(b).OrderBy(a)`로 써도 로컬 쿼리에서는 같은 결과가 나온다. 다만 이렇게 쓰면 정렬을 두 번 하므로 느리고, 의도도 드러나지 않는다.

> **⚠️ 안정성은 LINQ to Objects에 한정된 보장이다**
>
> 같은 LINQ 코드라도 EF Core로 실행하면 `ORDER BY`로 번역되고, **SQL의 `ORDER BY`는 동률 원소의 순서를 보장하지 않는다.** 데이터베이스는 실행 계획에 따라 매번 다른 순서를 낼 수 있다. 해석되는 쿼리에서 순서가 완전히 결정적이어야 한다면(특히 페이징) **동률이 생기지 않을 때까지 `ThenBy`로 키를 추가해야 한다.** 보통 기본 키를 마지막 `ThenBy`로 붙인다.
>
> 참고로 `Array.Sort`와 `List<T>.Sort`는 인트로소트(introsort) 기반이라 **불안정 정렬**이다(24.3절). "정렬은 다 안정적"이라고 뭉뚱그리면 여기서 사고가 난다.

> **📌 왜 원천 도서는 "미정(indeterminate)"이라고 하는가**
>
> C# 표준 참고서 중에는 동률 원소의 상대 순서를 "미정"이라고 쓴 것이 있다. 이는 **로컬 쿼리와 해석되는 쿼리 양쪽에 통용되는 보수적 조언**이다. 로컬 쿼리에서 안정 정렬이라는 사실이 틀린 것은 아니지만, **그 보장에 기대어 쓴 코드를 나중에 EF Core로 옮기면 조용히 깨진다.** 두 서술은 층위가 다를 뿐 모순이 아니다.

### `Order`와 `OrderDescending` ※.NET 7

원소 자체를 기준으로 정렬할 때 `.OrderBy(x => x)`라는 항등 람다를 쓰는 것이 관용구였다.

```csharp
var query = names.OrderBy(name => name);     // .NET 6 이전
var query = names.Order();                   // ※.NET 7
```

`OrderDescending`도 같은 방식으로 `.OrderByDescending(x => x)`를 대체한다.

> **⚠️ `Order()`를 쓰려면 원소 타입이 비교 가능해야 한다**
>
> `Order()`는 `IComparer<T>.Default`를 쓰므로, 원소 타입이 `IComparable`/`IComparable<T>`를 구현하지 않으면 **컴파일은 되지만 열거 시점에 `InvalidOperationException`이 난다.** `string`이나 숫자 타입은 문제없다. `Person` 같은 사용자 정의 타입을 정렬하려면 그 타입이 `IComparable<T>`를 구현하거나, `Order(comparer)` 오버로드로 비교자를 넘겨야 한다. 순서 비교 프로토콜은 25.6절과 25.7절을 참조하라.

### 비교자와 콜레이션

로컬 쿼리에서 순서를 결정하는 것은 **키 객체 자신의 기본 `IComparable` 구현**이다. `IComparer` 객체를 넘겨 알고리즘을 바꿀 수 있다.

```csharp
names.OrderBy(n => n, StringComparer.CurrentCultureIgnoreCase);
```

> **⚠️ 비교자는 쿼리 구문으로 넘길 수 없다**
>
> `orderby` 절에는 비교자를 넘길 문법이 없다. 비교자가 필요하면 그 부분만 플루언트 구문으로 써야 한다. EF Core에서는 비교자 오버로드 자체를 쓸 수 없다. 데이터베이스 쿼리에서 비교 알고리즘을 정하는 것은 **컬럼의 콜레이션(collation)** 이다. 콜레이션이 대소문자를 구분하는데 구분 없는 정렬이 필요하다면 키 선택자에서 `ToUpper()`를 호출한다.
>
> ```csharp
> from p in dbContext.Purchases
> orderby p.Description.ToUpper()
> select p;
> ```

### `IOrderedEnumerable`과 `IOrderedQueryable`

정렬 연산자는 `IEnumerable<T>`의 특별한 하위 타입을 돌려준다. `Enumerable`의 것은 `IOrderedEnumerable<TSource>`를, `Queryable`의 것은 `IOrderedQueryable<TSource>`를 돌려준다. 이 하위 타입이 있어야 후속 `ThenBy`가 기존 순서를 **대체하지 않고 정제**할 수 있다.

추가 멤버는 공개되지 않으므로 평범한 시퀀스처럼 보인다. 차이가 드러나는 것은 **쿼리를 점진적으로 만들 때**다(29.9절).

```csharp
IOrderedEnumerable<string> query1 = names.OrderBy(s => s.Length);
IOrderedEnumerable<string> query2 = query1.ThenBy(s => s);
```

`query1`을 `IEnumerable<string>`으로 선언했다면 두 번째 줄은 컴파일되지 않는다. `ThenBy`가 `IOrderedEnumerable<string>`을 요구하기 때문이다.

> **⚠️ `var`로 선언한 정렬 쿼리에 `Where`를 재할당할 수 없다**
>
> ```csharp
> var query = names.OrderBy(s => s.Length);
> query = query.Where(n => n.Length > 3);      // 컴파일 오류
> ```
>
> `query`의 추론 타입은 `IOrderedEnumerable<string>`인데 `Where`는 평범한 `IEnumerable<string>`을 돌려주므로 다시 대입할 수 없다. 명시적 타입을 쓰거나, `OrderBy` 뒤에 `AsEnumerable()`을 붙여 타입을 올려 버리면 된다.
>
> ```csharp
> var query = names.OrderBy(s => s.Length).AsEnumerable();
> query = query.Where(n => n.Length > 3);      // OK
> ```
>
> 해석되는 쿼리에서 같은 일을 하려면 `AsQueryable()`을 쓴다.

### 성능 — 정렬은 전체 버퍼링이다

첫 원소를 요청받는 순간 `OrderBy`는 (1) 입력을 전부 배열로 복사하고, (2) 원소마다 키 선택자를 한 번씩 호출해 키 배열을 만들고, (3) 키를 재계산하지 않기 위해 인덱스 배열을 정렬한 뒤, (4) 그 순서대로 원소를 내보낸다.

| 비용 항목 | 크기 |
|---|---|
| 원소 버퍼 | 원소 수 × 참조 크기(또는 값 크기) |
| 키 배열 | 원소 수 × 키 크기 |
| 인덱스 배열 | 원소 수 × 4바이트 |
| 키 선택자 호출 | 원소당 정확히 1회 |
| 비교 횟수 | 평균 O(n log n) |

키 선택자가 **원소당 한 번만** 호출된다는 점은 중요하다. 키 계산이 비싸도(예: `p => p.Name.ToUpperInvariant()`) 비교 횟수인 O(n log n)번이 아니라 n번만 호출된다.

> **💡 상위 k개만 필요하면 정렬이 최선이 아니다**
>
> `.OrderByDescending(x => x.Score).Take(10)`은 100만 개를 전부 정렬한 뒤 10개를 꺼낸다. 로컬 쿼리에서 상위 k개만 필요하고 k가 아주 작다면, 크기 k짜리 힙을 유지하는 직접 구현이 O(n log k)로 훨씬 빠르다. 다만 이 최적화는 n이 크고 k가 작을 때만 의미가 있으므로, **측정 없이 손대지 마라**(67장).

### `Reverse`

```csharp
public static IEnumerable<TSource> Reverse<TSource>(this IEnumerable<TSource> source);
```

`Reverse`는 순서를 뒤집는다. 시퀀스의 끝을 알아야 첫 원소를 낼 수 있으므로 **입력 전체를 버퍼링**한다. EF Core에서는 번역되지 않는다.

> **⚠️ `Reverse()`와 `List<T>.Reverse()`는 다른 메서드다**
>
> `List<T>`에는 **자기 자신을 제자리에서 뒤집는** `Reverse()` 인스턴스 메서드가 있다. 반환값이 `void`다. LINQ의 `Enumerable.Reverse()`는 원본을 건드리지 않고 새 시퀀스를 돌려준다. `List<T>` 변수에 `.Reverse()`를 쓰면 **인스턴스 메서드가 우선 선택되어** 원본이 파괴된다. LINQ 쪽을 쓰고 싶다면 `((IEnumerable<T>)list).Reverse()`처럼 인터페이스로 올려야 한다. 확장 메서드보다 인스턴스 메서드가 우선한다는 규칙(29.1절)의 대표적 사고 사례다.

---

## 30.6 그룹핑 — `GroupBy`, `Chunk`

| 연산자 | 쿼리 구문 | 실행 | 출력 타입 | SQL 대응 |
|---|---|---|---|---|
| `GroupBy` | `group e by k` | 지연·**전체 버퍼링** | `IEnumerable<IGrouping<TKey,TElement>>` | `GROUP BY` |
| `Chunk` ※.NET 6 | — | 지연·부분 버퍼링 | `IEnumerable<TElement[]>` | 번역 없음 |

### `GroupBy`

| 인자 | 타입 |
|---|---|
| 입력 시퀀스 | `IEnumerable<TSource>` |
| 키 선택자 | `TSource => TKey` |
| 원소 선택자(선택) | `TSource => TElement` |
| 결과 선택자(선택) | `(TKey, IEnumerable<TElement>) => TResult` |
| 비교자(선택) | `IEqualityComparer<TKey>` |

```csharp
string[] files = Directory.GetFiles(Path.GetTempPath());

IEnumerable<IGrouping<string, string>> query =
    files.GroupBy(file => Path.GetExtension(file));

foreach (IGrouping<string, string> grouping in query)
{
    Console.WriteLine("Extension: " + grouping.Key);
    foreach (string filename in grouping)
        Console.WriteLine("   - " + filename);
}
```

`IGrouping<TKey, TElement>`는 **`Key` 속성이 달린 시퀀스**다.

```csharp
public interface IGrouping<TKey, TElement> : IEnumerable<TElement>, IEnumerable
{
    TKey Key { get; }      // 부분 시퀀스 전체에 적용되는 키
}
```

원소 선택자를 주면 각 그룹의 원소를 변환할 수 있고, 이는 **키 선택자와 독립적**이다.

```csharp
files.GroupBy(file => Path.GetExtension(file), file => file.ToUpper());
// Key는 여전히 원래 대소문자, 원소만 대문자
```

### 버퍼링 특성

`Enumerable.GroupBy`의 동작은 다음과 같다.

```text
                    GroupBy의 런타임 동작

  ① 첫 MoveNext() 호출 시점에 입력을 끝까지 읽는다
     (입력이 100만 개면 100만 개를 전부 읽는다)

     입력                    임시 딕셔너리(키 → 리스트)
   ┌─────────┐             ┌──────┬──────────────────────┐
   │ a.pdf   │  keySelector│ .pdf │ [a.pdf] [b.pdf]      │
   │ t.doc   │  ──────────→│ .doc │ [t.doc] [m.doc]      │
   │ b.pdf   │             │ .txt │ [r.txt]              │
   │ m.doc   │             └──────┴──────────────────────┘
   │ r.txt   │                    ↑
   └─────────┘        전체가 힙에 올라간 뒤에야
                      첫 그룹이 나온다

  ② 그 뒤에 IGrouping을 하나씩 내보낸다
     그룹의 순서 = 각 키가 입력에서 처음 등장한 순서
     그룹 안의 순서 = 입력에서의 순서
```

> **⚠️ `GroupBy`는 정렬하지 않는다**
>
> 그룹은 **알파벳 순서로 나오지 않는다.** `GroupBy`는 그룹핑만 하고 정렬은 하지 않으며, 원본 순서를 보존한다. 정렬이 필요하면 `OrderBy`를 붙여야 한다.
>
> ```csharp
> files.GroupBy(f => Path.GetExtension(f), f => f.ToUpper())
>      .OrderBy(grouping => grouping.Key);
> ```

> **⚠️ `GroupBy`를 무한 시퀀스나 거대한 스트림에 쓰지 마라**
>
> 결과가 지연 시퀀스처럼 보이지만 **첫 원소를 얻는 순간 입력 전체가 메모리에 올라간다.** 100GB짜리 로그 파일을 한 줄씩 읽는 반복자에 `GroupBy`를 붙이면 100GB를 힙에 올리려 한다. 스트리밍 집계가 필요하면 `GroupBy` 대신 딕셔너리를 직접 갱신하는 루프를 쓰거나, `CountBy`/`AggregateBy`(※.NET 9)를 검토하라(30.15절).

### 쿼리 구문과 쿼리 계속

```text
group element-expr by key-expr
```

```csharp
from file in files
group file.ToUpper() by Path.GetExtension(file);
```

`select`와 마찬가지로 `group`은 쿼리를 **끝낸다.** 뒤에 절을 더 붙이려면 `into`로 쿼리 계속을 써야 한다.

```csharp
from file in files
group file.ToUpper() by Path.GetExtension(file) into grouping
orderby grouping.Key
select grouping;
```

그룹 자체를 거르는 것도 쿼리 계속으로 한다.

```csharp
from file in files
group file.ToUpper() by Path.GetExtension(file) into grouping
where grouping.Count() >= 5          // 파일이 5개 미만인 그룹 제외
select grouping;
```

> **📌 `group by` 뒤의 `where`는 SQL의 `HAVING`이다**
>
> 개별 원소가 아니라 **부분 시퀀스 전체**에 적용된다는 뜻이다. 개별 원소를 거르려면 `group` 앞에 `where`를 두어야 한다. 이 구별은 SQL의 `WHERE`/`HAVING` 구별과 정확히 대응한다.

집계 결과만 필요하면 부분 시퀀스를 버려도 된다.

```csharp
string[] votes = { "Dogs", "Cats", "Cats", "Dogs", "Dogs" };

IEnumerable<string> query = from vote in votes
                            group vote by vote into g
                            orderby g.Count() descending
                            select g.Key;

string winner = query.First();       // Dogs
```

> **⚠️ 여러 절에서 `Count()`를 부르면 그룹을 그만큼 다시 훑는다**
>
> `orderby g.Count()`의 키 선택자는 그룹당 한 번만 호출되므로(30.5절) 위 쿼리는 문제없다. 하지만 `where g.Count() > 1 orderby g.Count()`처럼 여러 절에서 부르면 **그때마다 그룹을 다시 열거한다.** `IGrouping<K,T>`가 `ICollection<T>`를 구현한다는 보장이 없으므로 `Count()`의 빠른 경로도 보장되지 않는다. 반복 집계는 한 번 계산해 담아라.
>
> ```csharp
> from vote in votes
> group vote by vote into g
> let n = g.Count()                    // 한 번만
> where n > 1
> orderby n descending
> select g.Key;
> ```

### 복합 키와 사용자 정의 비교자

```csharp
from n in names
group n by new { FirstLetter = n[0], Length = n.Length };
```

익명 타입의 값 동등성 덕분에 복합 키가 그대로 동작한다. 사용자 정의 비교자도 넘길 수 있지만, **키 선택자 식을 바꾸는 편이 대개 더 간단하다.**

```csharp
group n by n.ToUpper()               // 대소문자 무시 그룹핑
```

### EF Core에서의 `GroupBy`

탐색 속성이 있으면 그룹핑이 필요한 경우가 SQL보다 훨씬 적다. "구매가 두 건 이상인 고객"은 `where c.Purchases.Count >= 2`로 끝난다. 집계가 필요한 전형적인 경우는 이런 것이다.

```csharp
from p in dbContext.Purchases
group p.Price by p.Date.Year into salesByYear
select new
{
    Year       = salesByYear.Key,
    TotalValue = salesByYear.Sum()
};
```

LINQ의 그룹핑은 SQL의 `GROUP BY`보다 강력한 면이 있다. **집계 없이 상세 행 전체를 가져올 수 있다.**

```csharp
from p in dbContext.Purchases
group p by p.Date.Year
```

> **⚠️ 집계 없는 `group by`는 EF Core에서 동작하지 않는다**
>
> 위 쿼리는 SQL로 번역할 수 없다. 간단한 우회는 **그룹핑 직전에 `.AsEnumerable()`을 호출해 클라이언트에서 그룹핑하는 것**이다. 그룹핑 전에 필터링을 마쳐서 필요한 데이터만 가져온다면 효율 손해도 없다. 다만 필터를 빼먹으면 테이블 전체를 클라이언트로 끌어오게 되므로, `AsEnumerable()`을 놓는 위치가 곧 성능이다(31.5절).

전통적 SQL과 또 다른 점은 **그룹핑이나 정렬에 쓴 변수·식을 반드시 투영할 의무가 없다**는 것이다.

### `Chunk` ※.NET 6

```csharp
public static IEnumerable<TSource[]> Chunk<TSource>(
    this IEnumerable<TSource> source, int size);
```

시퀀스를 고정 크기 배열로 자른다. 마지막 청크는 원소가 부족하면 그만큼만 담긴다.

```csharp
foreach (int[] chunk in new[] { 1, 2, 3, 4, 5, 6, 7, 8 }.Chunk(3))
    Console.WriteLine(string.Join(", ", chunk));

// 1, 2, 3
// 4, 5, 6
// 7, 8
```

`GroupBy`와 `Chunk`는 둘 다 "시퀀스를 부분 시퀀스로 나눈다"는 점만 같고, 나머지는 전부 다르다.

| 항목 | `GroupBy` | `Chunk` |
|---|---|---|
| 나누는 기준 | 키의 동등성 | 위치(고정 개수) |
| 출력 원소 타입 | `IGrouping<TKey,TElement>` | `TElement[]` |
| 키 | 있다 | 없다 |
| 버퍼링 | **입력 전체** | 청크 하나 크기 |
| 무한 시퀀스 | 불가 | 가능 |
| 원소 순서 | 보존 | 보존 |

> **💡 `Chunk`는 배치 처리의 표준 도구다**
>
> "1,000건씩 끊어서 API에 보낸다", "한 트랜잭션에 500행씩 삽입한다" 같은 요구가 `Chunk` 한 줄로 끝난다. .NET 6 이전에는 `Select((x, i) => new { x, i }).GroupBy(v => v.i / size)` 같은 관용구를 썼는데, 이 관용구는 **입력 전체를 버퍼링**한다는 치명적 차이가 있었다. `Chunk`는 청크 하나만 버퍼링하므로 스트림에도 쓸 수 있다.

> **⚠️ `Chunk`가 돌려주는 배열의 수명**
>
> `Chunk`는 청크마다 **새 배열**을 할당한다. 배열을 재사용하지 않으므로 원소가 100만 개고 청크 크기가 10이면 배열 10만 개가 할당된다. 뜨거운 경로에서 배치 처리를 한다면 이 할당이 보인다. `size`에 0 이하를 넘기면 `ArgumentOutOfRangeException`이 나며, 이 예외는 **열거 시점이 아니라 호출 시점에** 던져진다.

---

## 30.7 집합 연산 — `Concat`, `Union`, `UnionBy`, `Intersect`, `IntersectBy`, `Except`, `ExceptBy`

`IEnumerable<TSource>`, `IEnumerable<TSource>` → `IEnumerable<TSource>`. 같은 타입의 시퀀스 둘을 받아 합·교집합·차집합을 돌려준다.

| 연산자 | 실행 | 중복 제거 | 버퍼링 | SQL 대응 |
|---|---|---|---|---|
| `Concat` | 지연·스트리밍 | **하지 않음** | 없음 | `UNION ALL` |
| `Union` | 지연·스트리밍 | 함 | 지금까지 본 원소 | `UNION` |
| `UnionBy` ※.NET 6 | 지연·스트리밍 | 함(키 기준) | 지금까지 본 키 | — |
| `Intersect` | 지연·버퍼링 | 함 | **두 번째** 시퀀스 전체 | `WHERE ... IN (...)` |
| `IntersectBy` ※.NET 6 | 지연·버퍼링 | 함(키 기준) | 두 번째 시퀀스의 키 | — |
| `Except` | 지연·버퍼링 | 함 | **두 번째** 시퀀스 전체 | `EXCEPT` 또는 `NOT IN (...)` |
| `ExceptBy` ※.NET 6 | 지연·버퍼링 | 함(키 기준) | 두 번째 시퀀스의 키 | — |
| `Append`, `Prepend` | 지연·스트리밍 | 하지 않음 | 없음 | — |

### `Concat`과 `Union`

```csharp
int[] seq1 = { 1, 2, 3 }, seq2 = { 3, 4, 5 };

IEnumerable<int>
    concat = seq1.Concat(seq2),      // { 1, 2, 3, 3, 4, 5 }
    union  = seq1.Union (seq2);      // { 1, 2, 3, 4, 5 }
```

`Concat`은 첫 시퀀스 전부를 내보낸 뒤 둘째 시퀀스 전부를 내보낸다. **중복을 건드리지 않으므로** 원소 수는 정확히 두 시퀀스의 합이고, 버퍼링도 없다. 집합 연산자 중 가장 싸다.

`Union`은 같은 일을 하되 이미 본 원소를 건너뛴다. 첫 시퀀스에 있던 중복도 제거된다.

> **⚠️ 집합 연산자의 결과는 "집합"이다**
>
> `Union`, `Intersect`, `Except`는 **입력에 중복이 있어도 출력에는 없다.** `{1,1,2}.Except({3})`의 결과는 `{1,1,2}`가 아니라 `{1,2}`다. "빼기"라고 생각하면 예상이 어긋난다. 중복을 유지한 채 빼내려면 `Where(x => !other.Contains(x))`처럼 직접 써야 한다(단, 이건 O(n×m)이므로 `HashSet<T>`를 미리 만들어 쓰는 편이 낫다).

### 타입 인자를 명시해야 하는 경우

시퀀스 타입이 다르지만 원소에 공통 기반 타입이 있으면, 타입 인자를 명시해 이어 붙일 수 있다.

```csharp
MethodInfo[]   methods = typeof(string).GetMethods();
PropertyInfo[] props   = typeof(string).GetProperties();

IEnumerable<MemberInfo> both = methods.Concat<MemberInfo>(props);
```

`MethodInfo`와 `PropertyInfo`의 공통 기반 클래스가 `MemberInfo`다. 리플렉션 API는 57장에서 다룬다.

앞의 것을 필터링해서 이어 붙이면 **인터페이스 타입 매개변수 가변성**에 기대게 된다. `IEnumerable<MethodInfo>`가 `IEnumerable<MemberInfo>`로 공변 변환되어야 하기 때문이다(23.10절).

```csharp
var methods = typeof(string).GetMethods().Where(m => !m.IsSpecialName);
var props   = typeof(string).GetProperties();
var both    = methods.Concat<MemberInfo>(props);
```

### `Intersect`와 `Except`

```csharp
int[] seq1 = { 1, 2, 3 }, seq2 = { 3, 4, 5 };

IEnumerable<int>
    commonality = seq1.Intersect(seq2),     // { 3 }
    difference1 = seq1.Except   (seq2),     // { 1, 2 }
    difference2 = seq2.Except   (seq1);     // { 4, 5 }
```

`Enumerable.Except`는 내부적으로 **둘째 시퀀스의 원소를 전부 해시 집합에 담은 뒤, 첫 시퀀스를 훑으면서 그 집합에 아직 없는 원소만 흘려보내는** 방식으로 동작한다(`Intersect`는 반대로 집합에 있는 것만 흘려보낸다). 그래서 첫 원소를 내기 전에 **둘째 시퀀스가 통째로 읽힌다.** SQL의 등가물은 `NOT EXISTS`나 `NOT IN` 서브쿼리다.

```sql
SELECT number FROM numbers1Table
WHERE number NOT IN (SELECT number FROM numbers2Table)
```

> **⚠️ 두 번째 시퀀스가 통째로 메모리에 올라간다**
>
> `a.Except(b)`와 `a.Intersect(b)`는 첫 원소를 내기 전에 **`b`를 끝까지 읽어 해시 집합을 만든다.** `b`가 데이터베이스 쿼리이거나 파일 스트림이면 그 순간 전부 실체화되므로, 큰 쪽을 두 번째 자리에 두면 메모리가 튄다. 그리고 이것은 지연 실행이므로 **결과를 두 번 열거하면 `b`도 두 번 읽힌다.** `b`가 매번 다른 결과를 내는 쿼리라면 두 열거의 결과가 달라진다(29.7절). `b`를 `ToHashSet()`으로 먼저 고정하는 것이 안전하다. 마지막으로 `Except`는 비대칭이므로 `a.Except(b)`와 `b.Except(a)`를 바꿔 쓸 수 없다.

### `*By` 계열 ※.NET 6

.NET 6은 동등성 비교 **전에 키 선택자를 적용하는** 변형을 추가했다.

```csharp
string[] seq1 = { "A", "b", "C" };
string[] seq2 = { "a", "B", "c" };

var union = seq1.UnionBy(seq2, x => x.ToUpperInvariant());
// { "A", "b", "C" }
```

같은 일을 `Union`에 비교자를 넘겨서도 할 수 있다.

```csharp
var union = seq1.Union(seq2, StringComparer.InvariantCultureIgnoreCase);
```

| 방식 | 장점 | 단점 |
|---|---|---|
| `*By` + 키 선택자 | 람다 한 줄, 어떤 타입에도 즉석 적용 | 원소마다 키 계산(할당이 생길 수 있다) |
| 비교자 오버로드 | 키 객체를 만들지 않는다 | 비교자 타입을 따로 만들어야 할 수 있다 |

세 연산자의 두 번째 인자 타입이 **서로 다르다.**

```csharp
public static IEnumerable<TSource> UnionBy<TSource, TKey>(
    this IEnumerable<TSource> first,
    IEnumerable<TSource> second,            // ← TSource
    Func<TSource, TKey> keySelector);

public static IEnumerable<TSource> IntersectBy<TSource, TKey>(
    this IEnumerable<TSource> first,
    IEnumerable<TKey> second,               // ← TKey
    Func<TSource, TKey> keySelector);

public static IEnumerable<TSource> ExceptBy<TSource, TKey>(
    this IEnumerable<TSource> first,
    IEnumerable<TKey> second,               // ← TKey
    Func<TSource, TKey> keySelector);
```

> **⚠️ `IntersectBy`와 `ExceptBy`의 두 번째 인자는 키의 시퀀스다**
>
> `UnionBy`만 두 번째 시퀀스로 `TSource`를 받고, `IntersectBy`와 `ExceptBy`는 **키의 시퀀스**를 받는다. 이름이 비슷해서 같은 모양이라고 가정하기 쉽다. 컴파일러가 잡아 주긴 하지만 오류 메시지가 타입 추론 실패로 나와 원인을 찾기 어렵다. `people.ExceptBy(bannedIds, p => p.Id)`처럼 **키 목록으로 걸러 내는** 용법이 이 시그니처의 의도다.

### `IEqualityComparer`와 중복 제거의 의미

집합 연산자와 `Distinct`, `GroupBy`, `ToDictionary`, `ToLookup`, `Contains`, `SequenceEqual`은 전부 `IEqualityComparer<T>` 오버로드를 갖는다. 비교자를 넘기지 않으면 `EqualityComparer<T>.Default`를 쓴다.

| 원소 타입 | 기본 동등성 |
|---|---|
| `int`, `double`, `DateTime` 등 값 타입 | 값 비교 |
| `string` | 서수(ordinal) 비교 — 문화권 무관, 대소문자 구분 |
| 레코드 | 프로퍼티 값 비교(19장) |
| 익명 타입 | 프로퍼티 값 비교 |
| `Equals`를 재정의하지 않은 클래스 | **참조 비교** |
| `IEquatable<T>` 구현 타입 | `Equals(T)` 호출 |

> **⚠️ `GetHashCode`가 없으면 집합 연산이 조용히 틀린다**
>
> 집합 연산자는 전부 해시 기반이다. `Equals`만 재정의하고 `GetHashCode`를 재정의하지 않은 타입을 넣으면 **같은 값인데 다른 버킷에 들어가서 중복이 제거되지 않는다.** 예외도 나지 않고 컴파일 경고도 없다(대부분의 컴파일러는 `Equals`만 재정의하면 경고를 내지만 무시되기 쉽다). 동등성 계약은 25.3절과 25.4절을 반드시 읽어라.

> **⚠️ 문자열의 기본 비교는 문화권을 무시한다**
>
> `EqualityComparer<string>.Default`는 서수 비교다. `"straße".Distinct()`류의 문화권 인식 동작을 기대하면 어긋난다. 문화권이나 대소문자를 다루려면 `StringComparer.OrdinalIgnoreCase` 등을 명시적으로 넘겨라. 문자열 비교의 종류는 8장에서 다뤘다.

### `Append`와 `Prepend`

```csharp
public static IEnumerable<TSource> Append<TSource>(
    this IEnumerable<TSource> source, TSource element);

public static IEnumerable<TSource> Prepend<TSource>(
    this IEnumerable<TSource> source, TSource element);
```

원소 하나를 뒤나 앞에 덧붙인다. 원본을 수정하지 않고 새 시퀀스를 돌려준다.

```csharp
IEnumerable<string> withDefault = names.Prepend("(선택 없음)");
```

> **💡 `Concat(new[] { x })` 대신 `Append(x)`**
>
> `Append`/`Prepend`는 원소 하나를 붙이려고 배열을 만드는 할당을 없애 준다. 다만 루프 안에서 반복하면 데코레이터가 원소 수만큼 쌓여 열거가 O(n²)이 된다. **루프 안에서 시퀀스에 원소를 계속 붙이는 코드는 `List<T>`를 쓰는 것이 맞다.**

---

## 30.8 변환 메서드 — `OfType`, `Cast`, `ToArray`, `ToList`, `ToDictionary`, `ToHashSet`, `ToLookup`, `AsEnumerable`, `AsQueryable`

LINQ는 주로 `IEnumerable<T>` 시퀀스를 다룬다. 변환 메서드는 다른 컬렉션 형태와 시퀀스 사이를 오간다.

| 연산자 | 방향 | 실행 | 하는 일 |
|---|---|---|---|
| `OfType<T>` | 비제네릭 → 제네릭 | 지연·스트리밍 | 타입이 맞지 않는 원소를 **버린다** |
| `Cast<T>` | 비제네릭 → 제네릭 | 지연·스트리밍 | 타입이 맞지 않으면 **예외** |
| `ToArray` | 시퀀스 → `T[]` | **즉시** | 배열로 실체화 |
| `ToList` | 시퀀스 → `List<T>` | **즉시** | 리스트로 실체화 |
| `ToDictionary` | 시퀀스 → `Dictionary<TKey,TValue>` | **즉시** | 키가 유일해야 한다 |
| `ToHashSet` | 시퀀스 → `HashSet<T>` | **즉시** | 중복 제거 |
| `ToLookup` | 시퀀스 → `ILookup<TKey,TElement>` | **즉시** | 키 하나에 여러 원소 허용 |
| `AsEnumerable` | 시퀀스 → `IEnumerable<T>` | 없음 | 업캐스트만 |
| `AsQueryable` | 시퀀스 → `IQueryable<T>` | 없음 | 캐스트 또는 래핑 |

> **💡 `As`로 시작하는 것과 `To`로 시작하는 것의 차이를 외워라**
>
> **`As`로 시작하는 메서드는 타입만 바꾸고 메모리를 할당하지 않는다.** 빠르다. **`To`로 시작하는 메서드는 새 컬렉션에 원소를 복사한다.** 느리고 메모리를 더 쓴다. 이 규칙 하나로 LINQ 코드의 비용을 대략 읽을 수 있다.

### `OfType`과 `Cast`

둘 다 비제네릭 `IEnumerable`을 받아 제네릭 `IEnumerable<T>`를 내놓는다.

```csharp
ArrayList classicList = new ArrayList();   // System.Collections
classicList.AddRange(new int[] { 3, 4, 5 });

IEnumerable<int> sequence1 = classicList.Cast<int>();
```

호환되지 않는 원소를 만났을 때의 동작이 다르다. **`Cast`는 예외를 던지고, `OfType`은 그 원소를 무시한다.**

```csharp
DateTime offender = DateTime.Now;
classicList.Add(offender);

IEnumerable<int>
    sequence2 = classicList.OfType<int>(),   // OK — DateTime을 건너뛴다
    sequence3 = classicList.Cast<int>();     // 열거할 때 예외
```

원소 호환성 규칙은 **C#의 `is` 연산자와 정확히 같다.** 즉 참조 변환과 언박싱 변환만 고려한다. `OfType`의 내부 구현을 보면 이유가 명확하다.

```csharp
public static IEnumerable<TSource> OfType<TSource>(IEnumerable source)
{
    foreach (object element in source)
        if (element is TSource)
            yield return (TSource)element;
}
```

`Cast`의 구현은 동일하되 타입 검사만 뺀 것이다.

```csharp
public static IEnumerable<TSource> Cast<TSource>(IEnumerable source)
{
    foreach (object element in source)
        yield return (TSource)element;
}
```

> **⚠️ `Cast`의 예외는 호출 시점이 아니라 열거 시점에 난다**
>
> `Cast<int>()`를 호출하는 줄에서는 아무 일도 일어나지 않는다. `foreach`나 `ToList()`가 문제 원소에 도달하는 순간 `InvalidCastException`이 나고, 스택 트레이스에 `Cast` 호출 줄이 나오지 않아 원인 파악이 어렵다. 반복자의 오류 보고 시점 문제(28.6절)가 그대로 재현된다.

### `Cast`로 숫자 변환은 되지 않는다

이 구현의 직접적 귀결이다. **`Cast`는 C#의 캐스트 연산자만큼 유연하지 않다.**

```csharp
int  i  = 3;
long l  = i;          // 암시적 숫자 변환 int → long
int  i2 = (int) l;    // 명시적 숫자 변환 long → int
```

```csharp
int[] integers = { 1, 2, 3 };

IEnumerable<long> test1 = integers.OfType<long>();   // 열거하면 원소 0개
IEnumerable<long> test2 = integers.Cast<long>();     // 열거하면 예외
```

`test1`이 비는 이유는 `OfType` 구현에 `TSource`를 대입해 보면 보인다. `element is long`은 `int` 원소에 대해 `false`다. `int`와 `long` 사이에는 상속 관계가 없기 때문이다.

`test2`가 예외를 던지는 이유는 더 미묘하다. `Cast`의 구현에서 `element`는 **`object` 타입으로 선언되어 있다.** `TSource`가 값 타입이면 CLR은 이 캐스트를 **언박싱**으로 간주하고 다음과 같은 코드를 합성한다.

```csharp
int    value   = 123;
object element = value;
long   result  = (long) element;    // 예외
```

`element`가 `object`이므로 `int`→`long` **숫자 변환**이 아니라 `object`→`long` **언박싱**이 수행되는데, 언박싱은 타입이 정확히 일치해야 하므로(15장) `int`가 담긴 박스를 `long`으로 언박싱하는 것은 실패한다.

해결책은 평범한 `Select`다.

```csharp
IEnumerable<long> castLong = integers.Select(s => (long) s);
```

> **📌 `Cast`는 다운캐스팅에도 쓴다**
>
> `IEnumerable<Fruit>`에서 사과만 뽑고 싶으면 `OfType<Apple>()`을 쓴다. LINQ to XML에서 특히 자주 쓰이는 패턴이다. `Cast`는 쿼리 구문 지원도 있다 — 범위 변수 앞에 타입을 쓰면 된다.
>
> ```csharp
> from TreeNode node in myTreeView.Nodes
> ...
> ```

> **⚠️ `Cast<T>`가 원본 객체를 그대로 돌려줄 수 있다**
>
> 실제 `Enumerable.Cast<T>` 구현에는 빠른 경로가 있다. 입력이 **이미 `IEnumerable<T>`이면 새 반복자를 만들지 않고 입력 그 자체를 반환한다.** 즉 `list.Cast<string>()`의 결과가 `list`와 참조 동일할 수 있다. 스냅숏이라고 착각하고 원본을 수정하면 결과가 따라 바뀐다. 스냅숏이 필요하면 `ToList()`를 붙여라.

### `ToArray`, `ToList`, `ToHashSet`

세 메서드는 결과를 배열·`List<T>`·`HashSet<T>`에 담고, **입력 시퀀스를 즉시 끝까지 열거한다.** 지연 실행을 끊는 대표적 수단이다(29.11절).

| 대상 | 언제 쓰나 | 비용 |
|---|---|---|
| `ToArray` | 크기가 고정된 결과, 인덱스 접근, API 계약 | 개수를 미리 알 수 없으면 내부 버퍼를 늘려 가며 복사 |
| `ToList` | 나중에 원소를 더할 예정, 가장 흔한 기본값 | `ToArray`와 비슷하되 마지막 축소 복사가 없다 |
| `ToHashSet` | 이후 `Contains` 조회를 반복할 때 | 해시 테이블 구축 |

> **💡 `Contains`를 반복 호출한다면 `ToHashSet`을 먼저 하라**
>
> `foreach (var x in a) if (b.Contains(x)) ...`는 `b`가 리스트나 배열이면 O(n×m)이지만, `b.ToHashSet()`을 한 번 만들어 두면 O(n+m)이 된다. 이것이 `Join`이 하는 일과 본질적으로 같다 — LINQ의 조인 연산자는 이 관용구를 연산자로 만든 것이다.

### `ToDictionary`와 `ToLookup`

| 인자 | 타입 |
|---|---|
| 입력 시퀀스 | `IEnumerable<TSource>` |
| 키 선택자 | `TSource => TKey` |
| 원소 선택자(선택) | `TSource => TElement` |
| 비교자(선택) | `IEqualityComparer<TKey>` |

`ToDictionary`도 즉시 실행이며 결과를 제네릭 `Dictionary`에 쓴다. **키 선택자 식은 모든 원소에 대해 유일한 값을 내야 한다.** 그렇지 않으면 예외가 난다. 반면 `ToLookup`은 같은 키에 여러 원소를 허용한다.

```csharp
// 유일 키가 보장될 때
Dictionary<int, Customer> byId = customers.ToDictionary(c => c.ID);

// 키가 중복될 수 있을 때
ILookup<int?, Purchase> byCustomer = purchases.ToLookup(p => p.CustomerID);
```

> **⚠️ `ToDictionary`가 던지는 예외 두 가지**
>
> 키 선택자가 같은 키를 두 번 내면 `ArgumentException`, `null`을 내면 `ArgumentNullException`이다. 둘 다 **즉시 실행 도중**에 난다. 특히 중복 키 예외는 예외 메시지에 어떤 키가 중복인지 나오지만, 어떤 **원소**가 중복인지는 나오지 않는다. 데이터 품질이 불확실하면 `ToDictionary` 대신 `ToLookup`이나 `GroupBy`로 먼저 확인하는 편이 디버깅이 쉽다.

> **💡 "유일할 것"을 주장하고 싶다면 `ToDictionary`가 맞다**
>
> 중복 키 예외를 피하려고 `ToLookup`으로 바꾸는 것은 대개 잘못된 선택이다. 키가 유일하다는 것이 도메인 불변식이라면 `ToDictionary`가 그 불변식을 **런타임에 검증**해 준다. 30.13절에서 `Single`을 두고 하는 것과 정확히 같은 논리다.

### `AsEnumerable`과 `AsQueryable`

```csharp
public static IEnumerable<TSource> AsEnumerable<TSource>(
    this IEnumerable<TSource> source);
```

`AsEnumerable`은 시퀀스를 `IEnumerable<T>`로 업캐스트한다. 그 결과 **컴파일러가 이후 연산자를 `Queryable`이 아니라 `Enumerable`의 메서드에 바인딩한다.** 즉 "여기서부터는 로컬에서 실행한다"는 선언이다. 해석되는 쿼리와 로컬 쿼리를 결합하는 방법은 31.5절에서 다룬다.

`AsEnumerable`은 이름이 `ToList`와 비슷해 보이지만 **캐스팅일 뿐이고 여전히 지연 실행이다.** 실체화가 목적이라면 `ToList`/`ToArray`를 써야 한다.

`AsQueryable`은 반대 방향이다. 시퀀스가 `IQueryable<T>`를 구현하면 다운캐스트하고, 아니면 로컬 쿼리를 감싸는 `IQueryable<T>` 래퍼를 만든다.

> **⚠️ `AsEnumerable()`의 위치가 곧 성능이다**
>
> `AsEnumerable()`은 아무 원소도 복사하지 않지만, **그 뒤의 모든 연산자를 클라이언트에서 실행하게 만든다.** `dbContext.Products.AsEnumerable().Where(p => p.Price > 100)`은 테이블 전체를 네트워크로 끌어온 뒤 클라이언트에서 거른다. 반대로 `dbContext.Products.Where(p => p.Price > 100).AsEnumerable()`은 필요한 행만 가져온다. 코드 차이는 점 하나의 위치뿐이고 결과도 같지만 비용은 몇 자릿수 차이가 난다.

---

## 30.9 요소 연산자 — `First`, `Last`, `Single`, `ElementAt`, `MinBy`, `MaxBy`, `DefaultIfEmpty`

`IEnumerable<TSource>` → `TSource`. 시퀀스에서 원소 하나를 고른다. **전부 즉시 실행이다**(`DefaultIfEmpty`만 예외).

| 연산자 | 실행 | 하는 일 | SQL 대응 |
|---|---|---|---|
| `First`, `FirstOrDefault` | 즉시 | 첫 원소(조건자 선택) | `SELECT TOP 1 ... ORDER BY ...` |
| `Last`, `LastOrDefault` | 즉시 | 마지막 원소(조건자 선택) | `SELECT TOP 1 ... ORDER BY ... DESC` |
| `Single`, `SingleOrDefault` | 즉시 | `First`와 같되 **둘 이상이면 예외** | — |
| `ElementAt`, `ElementAtOrDefault` | 즉시 | 지정 위치의 원소 | 번역 없음 |
| `MinBy`, `MaxBy` ※.NET 6 | 즉시 | 키가 가장 작은/큰 **원소** | 번역 없음 |
| `DefaultIfEmpty` | **지연·스트리밍** | 비었으면 기본값 원소 하나짜리 시퀀스 | `OUTER JOIN` |

`OrDefault`로 끝나는 메서드는 입력 시퀀스가 비었거나 조건에 맞는 원소가 없을 때 예외 대신 `default(TSource)`를 돌려준다. `default(TSource)`는 참조 타입이면 `null`, `bool`이면 `false`, 숫자 타입이면 0이다.

### `First`, `Last`, `Single`

```csharp
public static TSource First<TSource>(this IEnumerable<TSource> source);
public static TSource First<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);

public static TSource? FirstOrDefault<TSource>(this IEnumerable<TSource> source);
public static TSource FirstOrDefault<TSource>(
    this IEnumerable<TSource> source, TSource defaultValue);   // ※.NET 6
```

```csharp
int[] numbers = { 1, 2, 3, 4, 5 };

int first     = numbers.First();                            // 1
int last      = numbers.Last();                             // 5
int firstEven = numbers.First(n => n % 2 == 0);             // 2
int lastEven  = numbers.Last (n => n % 2 == 0);             // 4

int firstBigError  = numbers.First         (n => n > 10);   // 예외
int firstBigNumber = numbers.FirstOrDefault(n => n > 10);   // 0
```

`Single`은 **정확히 하나**를 요구하고, `SingleOrDefault`는 **하나 또는 영**을 요구한다.

```csharp
int onlyDivBy3 = numbers.Single(n => n % 3 == 0);   // 3
int divBy2Err  = numbers.Single(n => n % 2 == 0);   // 예외: 2와 4가 모두 매칭

int singleError = numbers.Single        (n => n > 10);      // 예외
int noMatches   = numbers.SingleOrDefault(n => n > 10);     // 0
int divBy2Error = numbers.SingleOrDefault(n => n % 2 == 0); // 예외
```

### 예외 조건 표

이 표가 이 절의 핵심이다.

| 상황 | `First` | `FirstOrDefault` | `Single` | `SingleOrDefault` |
|---|---|---|---|---|
| 매칭 0개 | `InvalidOperationException` | `default` 반환 | `InvalidOperationException` | `default` 반환 |
| 매칭 1개 | 그 원소 | 그 원소 | 그 원소 | 그 원소 |
| 매칭 2개 이상 | 첫 번째 | 첫 번째 | **`InvalidOperationException`** | **`InvalidOperationException`** |

`Last`/`LastOrDefault`는 `First`/`FirstOrDefault`와 같은 표를 따르되, 매칭이 여럿이면 마지막 것을 돌려준다.

| 연산자 | 까다로움 |
|---|---|
| `Single` | 가장 까다롭다 — 정확히 하나 |
| `First`, `Last` | 최소 하나 |
| `SingleOrDefault` | 최대 하나 |
| `FirstOrDefault`, `LastOrDefault` | 가장 관대하다 — 아무 조건 없음 |

> **⚠️ 예외 타입은 `InvalidOperationException`이지 `ArgumentException`이 아니다**
>
> `"Sequence contains no elements"` 또는 `"Sequence contains more than one element"`라는 메시지의 `InvalidOperationException`이다. `NullReferenceException`이나 `IndexOutOfRangeException`이 아니다. 예외 타입으로 이 두 상황을 구별할 수 없으므로, `catch (InvalidOperationException)`으로 잡아 봐야 "비었는지 여러 개인지"를 알 수 없다. 구별이 필요하면 `Count()`를 먼저 확인하거나 예외 메시지에 의존하지 말고 `ToList()` 후 개수를 보라.

### `FirstOrDefault`의 기본값 오버로드 ※.NET 6

```csharp
int firstBig = numbers.FirstOrDefault(n => n > 10, defaultValue: -1);   // -1
```

`LastOrDefault`, `SingleOrDefault`에도 같은 오버로드가 있다. 값 타입에서 "못 찾음"과 "찾았는데 값이 0"을 구별하는 데 유용하다.

> **⚠️ 값 타입에 `FirstOrDefault`를 쓰면 "못 찾음"을 알 수 없다**
>
> `scores.FirstOrDefault(s => s.Name == "Tom")`이 0을 돌려주었을 때, Tom을 못 찾은 것인지 Tom의 점수가 0인 것인지 구별할 방법이 없다. 해법은 셋이다. (1) `.Where(...).Cast<int?>().FirstOrDefault()`로 널 허용 타입으로 만든다. (2) 기본값 오버로드로 도메인에 없는 값을 준다(※.NET 6). (3) 못 찾는 것이 오류라면 `First`를 써서 예외를 받는다. 세 번째가 대개 옳고, 이 판단은 30.13절에서 자세히 다룬다.

EF Core에서 `Single`은 기본 키로 행 하나를 가져올 때 흔히 쓴다.

```csharp
Customer cust = dbContext.Customers.Single(c => c.ID == 3);
```

### `ElementAt`

```csharp
public static TSource ElementAt<TSource>(this IEnumerable<TSource> source, int index);
public static TSource ElementAt<TSource>(this IEnumerable<TSource> source, Index index);  // ※.NET 6
```

```csharp
int third      = numbers.ElementAt(2);              // 3
int tenthError = numbers.ElementAt(9);              // 예외
int tenth      = numbers.ElementAtOrDefault(9);     // 0
```

`Enumerable.ElementAt`은 입력 시퀀스가 `IList<T>`를 구현하면 **그 인덱서를 호출한다.** 아니면 n번 열거한 뒤 다음 원소를 돌려준다. EF Core에서는 지원되지 않는다.

> **⚠️ `ElementAt`의 예외는 `ArgumentOutOfRangeException`이다**
>
> `First`/`Single` 계열의 `InvalidOperationException`과 다르다. 인덱스가 음수여도 같은 예외가 난다. `ElementAtOrDefault`는 범위를 벗어나면 `default`를 돌려준다.

> **⚠️ 루프 안의 `ElementAt`은 O(n²)이다**
>
> `for (int i = 0; i < seq.Count(); i++) Process(seq.ElementAt(i));`에서 `seq`가 `IList<T>`가 아니면 `ElementAt(i)`는 매번 처음부터 i번 열거하고, `seq.Count()`도 매 반복마다 전체를 훑는다. `foreach`를 쓰거나 `ToList()`로 한 번 실체화하라. C#에서 `IEnumerable<T>`를 인덱스로 훑는 코드는 거의 항상 잘못된 코드다.

### `MinBy`와 `MaxBy` ※.NET 6

```csharp
public static TSource? MaxBy<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);
```

`MinBy`/`MaxBy`는 키가 가장 작거나 큰 **원소 자체**를 돌려준다.

```csharp
string[] names = { "Tom", "Dick", "Harry", "Mary", "Jay" };

Console.WriteLine(names.MaxBy(n => n.Length));   // Harry  — 원소
Console.WriteLine(names.Max  (n => n.Length));   // 5      — 값
```

이 대비가 `MinBy`/`MaxBy`의 존재 이유다. `Min`/`Max`는 **값**을 돌려주므로, "가장 비싼 상품"을 얻으려면 예전에는 서브쿼리나 정렬이 필요했다.

```csharp
// .NET 6 이전 관용구
Purchase cheapest = purchases.OrderBy(p => p.Price).FirstOrDefault();

// .NET 6 이후
Purchase? cheapest = purchases.MinBy(p => p.Price);
```

동률이면 **첫 번째** 원소를 돌려준다.

```csharp
Console.WriteLine(names.MinBy(n => n.Length));   // Tom  (Tom과 Jay 둘 다 길이 3)
```

> **⚠️ 빈 시퀀스에서의 동작이 원소 타입에 따라 달라진다**
>
> 입력이 비었을 때 `MinBy`/`MaxBy`는 원소 타입이 **널 허용이면 `null`을 돌려주고, 널 비허용 값 타입이면 예외를 던진다.** 이 조건부 동작 때문에 "`MinBy`는 널을 돌려준다"고 외우면 값 타입 시퀀스에서 예외를 만난다. 값 타입 시퀀스라면 `Any()`로 먼저 확인하거나 `DefaultIfEmpty()`를 앞에 붙여라.

> **💡 정렬 대신 `MinBy`/`MaxBy`를 써라**
>
> `OrderBy(...).First()`는 전체를 정렬하므로 O(n log n)이고 입력 전체를 버퍼링한다. `MinBy`는 한 번 훑으면서 최선을 기억하므로 O(n)이고 버퍼링이 없다. 하나만 필요한데 정렬하고 있다면 거의 항상 개선 여지가 있다.

### `DefaultIfEmpty`

```csharp
public static IEnumerable<TSource?> DefaultIfEmpty<TSource>(
    this IEnumerable<TSource> source);

public static IEnumerable<TSource> DefaultIfEmpty<TSource>(
    this IEnumerable<TSource> source, TSource defaultValue);
```

입력이 비었으면 `default(TSource)` 원소 하나짜리 시퀀스를, 아니면 입력을 그대로 돌려준다. 평면 외부 조인의 핵심 부품이며(30.3절, 30.4절), 30.12절에서 볼 `Empty`와는 정확히 반대 방향의 도구다.

---

## 30.10 집계 — `Count`, `LongCount`, `Min`, `Max`, `Sum`, `Average`, `Aggregate`

`IEnumerable<TSource>` → 스칼라. **전부 즉시 실행이다.**

| 연산자 | 하는 일 | 빈 시퀀스에서 | SQL 대응 |
|---|---|---|---|
| `Count`, `LongCount` | 원소 수 | 0 | `COUNT(...)` |
| `Min`, `Max` | 가장 작은/큰 값 | 값 타입은 예외, 널 허용은 `null` | `MIN(...)`, `MAX(...)` |
| `Sum` | 합 | 0 | `SUM(...)` |
| `Average` | 평균 | 예외(널 허용은 `null`) | `AVG(...)` |
| `Aggregate` | 사용자 정의 누산 | 시드 유무에 따라 다름 | 번역 없음 |

### `Count`와 `LongCount`

```csharp
public static int  Count<TSource>(this IEnumerable<TSource> source);
public static int  Count<TSource>(this IEnumerable<TSource> source,
                                  Func<TSource, bool> predicate);
public static long LongCount<TSource>(this IEnumerable<TSource> source);
```

```csharp
int fullCount  = new int[] { 5, 6, 7 }.Count();              // 3
int digitCount = "pa55w0rd".Count(c => char.IsDigit(c));     // 3
```

`Enumerable.Count`는 입력이 `ICollection<T>`를 구현하는지 검사한다. 구현하면 **`ICollection<T>.Count`를 그냥 읽고**, 아니면 전체를 열거하면서 카운터를 증가시킨다.

`LongCount`는 같은 일을 하되 64비트 정수를 돌려주므로 원소가 20억 개를 넘는 시퀀스에도 쓸 수 있다.

### `TryGetNonEnumeratedCount` ※.NET 6

```csharp
public static bool TryGetNonEnumeratedCount<TSource>(
    this IEnumerable<TSource> source, out int count);
```

`Count()`는 `Count` 속성이 없으면 시퀀스 전체를 열거한다. `TryGetNonEnumeratedCount`는 **열거하지 않고 알 수 있을 때만** 개수를 돌려주고, 아니면 `false`와 `0`을 돌려준다.

```csharp
if (db.Products.TryGetNonEnumeratedCount(out int n))
    Console.WriteLine($"개수: {n}");
else
    Console.WriteLine("싸게 셀 수 없다");
```

`DbSet<T>` 같은 것은 `Count` 속성이 없으므로 `false`가 나오고, `List<T>`는 `ICollection<T>`를 구현하므로 `true`가 나온다.

### 시퀀스가 비었는지 확인하는 네 가지 방법

| 방법 | 비용 | 언제 |
|---|---|---|
| `Count() > 0` | 최악의 경우 전체 열거 | 쓰지 마라 |
| `Any()` | 원소 하나만 읽는다 | `IEnumerable<T>`만 있을 때 |
| `Count` 속성 | O(1) | `ICollection`/`ICollection<T>` 구현 타입 |
| `Length` 속성 | O(1) | 배열 |

> **⚠️ `Count()`가 시퀀스를 다시 실행시킨다 — 유명한 함정**
>
> 다음 코드가 무엇을 출력하는지 생각해 보라.
>
> ```csharp
> IEnumerable<Task> tasks = Enumerable.Range(0, 2)
>     .Select(_ => Task.Run(() => Console.WriteLine("*")));
>
> await Task.WhenAll(tasks);
> Console.WriteLine($"{tasks.Count()} stars!");
> ```
>
> `**2 stars!`가 아니다. `tasks`는 **지연 시퀀스**이므로 `Task.WhenAll(tasks)`가 한 번 열거해 태스크 두 개를 만들어 실행하고, 그다음 `tasks.Count()`가 **다시 열거하면서 태스크 두 개를 또 만들어 실행한다.** 새 태스크가 언제 `*`를 출력할지는 정해져 있지 않고, 메인 스레드가 먼저 끝나면 아예 출력되지 않을 수도 있다. 결과는 "그 밖의 무엇"이다.
>
> ```text
> **[여기서 * 하나 또는 둘]2 stars![여기서 * 하나 또는 둘]
> ```
>
> 이 문제는 태스크와 무관한 곳에서도 생긴다. **열거할 때마다 부수 효과가 일어나는 시퀀스에 `Count()`를 부르면 그 부수 효과가 반복된다.** 29.7절의 재평가 문제이며, `ToList()`로 한 번만 실체화하는 것이 답이다.

### `Min`과 `Max`

```csharp
public static TSource? Min<TSource>(this IEnumerable<TSource> source);
public static TResult? Min<TSource, TResult>(
    this IEnumerable<TSource> source, Func<TSource, TResult> selector);
```

```csharp
int[] numbers = { 28, 32, 14 };

int smallest = numbers.Min();          // 14
int largest  = numbers.Max();          // 32
int maxDigit = numbers.Max(n => n % 10);   // 8
```

원소가 본질적으로 비교 가능하지 않으면 — 즉 `IComparable<T>`를 구현하지 않으면 — **선택자 식이 필수다.**

```csharp
Purchase runtimeError = dbContext.Purchases.Min();               // 오류
decimal? lowestPrice  = dbContext.Purchases.Min(p => p.Price);   // OK
```

> **⚠️ 선택자는 비교 방식만이 아니라 결과 타입도 정한다**
>
> `Min(p => p.Price)`의 결과는 `decimal`이지 `Purchase`가 아니다. **가장 싼 구매 객체**가 필요하면 서브쿼리를 쓰거나,
>
> ```csharp
> Purchase cheapest = dbContext.Purchases
>     .Where(p => p.Price == dbContext.Purchases.Min(p2 => p2.Price))
>     .FirstOrDefault();
> ```
>
> 집계 없이 `OrderBy` + `FirstOrDefault`로 쓰거나, 로컬 쿼리라면 `MinBy`를 쓰면 된다(30.9절).

> **⚠️ 빈 시퀀스의 `Min`/`Max`**
>
> 원소 타입이 널 비허용 값 타입이면 `InvalidOperationException`이 나고, 참조 타입이나 널 허용 값 타입이면 `null`이 나온다. `prices.Max()`가 빈 리스트에서 예외를 던지는 것을 보고 당황하는 일이 흔하다. `DefaultIfEmpty(0).Max()`가 간단한 방어책이다.

### `Sum`과 `Average`

```csharp
decimal[] numbers  = { 3, 4, 8 };
decimal sumTotal   = numbers.Sum();       // 15
decimal average    = numbers.Average();   // 5

int combinedLength = names.Sum(s => s.Length);   // 19
```

`Sum`과 `Average`는 타입에 매우 엄격하다. 정의가 `int`, `long`, `float`, `double`, `decimal`과 각각의 널 허용 버전에 **하드코딩되어 있다.** 반면 `Min`/`Max`는 `IComparable<T>`를 구현하는 어떤 타입에도(예: `string`) 직접 동작한다.

`Average`의 반환 타입은 다음 표를 따른다.

| 선택자 타입 | 결과 타입 |
|---|---|
| `decimal` | `decimal` |
| `float` | `float` |
| `int`, `long`, `double` | `double` |

그래서 다음은 컴파일되지 않는다("double을 int로 변환할 수 없음").

```csharp
int avg = new int[] { 3, 4 }.Average();     // 컴파일 오류
```

그리고 다음은 컴파일된다.

```csharp
double avg = new int[] { 3, 4 }.Average();  // 3.5
```

`Average`는 정밀도 손실을 막기 위해 **입력값을 암묵적으로 상위 타입으로 올린다.** 위 예에서 정수를 평균 내고도 캐스팅 없이 3.5를 얻었다. 명시적으로 쓰면 이렇게 된다.

```csharp
double avg = numbers.Average(n => (double) n);
```

> **⚠️ `Sum`은 정수 오버플로에서 예외를 던진다**
>
> `Enumerable.Sum`의 `int`/`long`/`decimal` 버전은 **checked 컨텍스트에서 누산한다.** 합이 `int.MaxValue`를 넘으면 조용히 음수가 되는 것이 아니라 `OverflowException`이 난다. 이는 C#의 기본 산술(unchecked)과 반대 동작이다. `float`/`double` 버전은 IEEE 754 규칙을 따르므로 오버플로 대신 무한대가 된다.
>
> 큰 정수 시퀀스를 더한다면 `values.Sum(v => (long) v)`로 올려 받는 것이 안전하다.

> **⚠️ 빈 시퀀스의 `Average`는 예외, `Sum`은 0**
>
> `Sum()`은 빈 시퀀스에서 0을 돌려주지만 `Average()`는 `InvalidOperationException`을 던진다. 0으로 나눌 수 없기 때문이다. 널 허용 타입 오버로드(`Average()`가 `double?`를 돌려주는 경우)는 `null`을 돌려준다. 사용자 입력에서 만들어진 시퀀스에 `Average`를 부르는 코드는 반드시 빈 경우를 처리해야 한다.

`Sum`과 `Average`는 데이터베이스 쿼리에서 표준 SQL 집계로 번역된다.

```csharp
from c in dbContext.Customers
where c.Purchases.Average(p => p.Price) > 500
select c.Name;
```

### `Aggregate`

```csharp
public static TSource Aggregate<TSource>(
    this IEnumerable<TSource> source, Func<TSource, TSource, TSource> func);

public static TAccumulate Aggregate<TSource, TAccumulate>(
    this IEnumerable<TSource> source, TAccumulate seed,
    Func<TAccumulate, TSource, TAccumulate> func);

public static TResult Aggregate<TSource, TAccumulate, TResult>(
    this IEnumerable<TSource> source, TAccumulate seed,
    Func<TAccumulate, TSource, TAccumulate> func,
    Func<TAccumulate, TResult> resultSelector);
```

`Aggregate`는 사용자 정의 누산 알고리즘을 지정한다. EF Core에서는 지원되지 않으며 용도가 다소 특수하다. `Aggregate`로 푸는 문제 대부분은 `foreach` 루프로 더 익숙하게 풀 수 있고, 이 연산자의 장점은 복잡한 집계를 **PLINQ로 자동 병렬화할 수 있다**는 점이다(50.3절, 50.5절). `numbers.Aggregate(0, (total, n) => total + n)`은 `Sum`이 하는 일과 같다.

첫 인자가 **시드(seed)**, 둘째 인자가 새 원소를 받아 누산값을 갱신하는 식, 셋째(선택) 인자가 누산값을 최종 결과로 투영하는 식이다.

### 시드 없는 집계의 함정

시드를 생략하면 **첫 원소가 암묵적 시드가 되고, 누산은 두 번째 원소부터 시작한다.**

```csharp
int[] numbers = { 1, 2, 3 };
int sum = numbers.Aggregate((total, n) => total + n);   // 6
```

결과는 같지만 **계산 자체가 다르다.** 앞의 것은 `0 + 1 + 2 + 3`이고, 이것은 `1 + 2 + 3`이다. 덧셈에서는 차이가 안 나지만 곱셈으로 바꾸면 즉시 드러난다.

```csharp
int[] numbers = { 1, 2, 3 };
int x = numbers.Aggregate(0, (prod, n) => prod * n);   // 0*1*2*3 = 0
int y = numbers.Aggregate(   (prod, n) => prod * n);   //   1*2*3 = 6
```

시드 없는 집계는 특별한 오버로드 없이도 병렬화할 수 있다는 장점이 있지만, 함정이 있다.

> **⚠️ 시드 없는 집계는 교환법칙·결합법칙이 성립하는 델리게이트에만 쓸 수 있다**
>
> 그렇지 않으면 결과가 **직관에 어긋나거나**(일반 쿼리), **비결정적이 된다**(PLINQ로 병렬화한 경우). 다음 함수를 보자.
>
> ```csharp
> (total, n) => total + n * n
> ```
>
> 교환법칙도 결합법칙도 성립하지 않는다(`1 + 2*2 != 2 + 1*1`). 2, 3, 4의 제곱합을 구해 보자.
>
> ```csharp
> int[] numbers = { 2, 3, 4 };
> int sum = numbers.Aggregate((total, n) => total + n * n);   // 27
> ```
>
> `2*2 + 3*3 + 4*4 = 29`가 아니라 `2 + 3*3 + 4*4 = 27`이 나온다. 첫 원소 2가 제곱되지 않고 시드로 들어갔기 때문이다.

시퀀스 맨 앞에 0을 넣으면(`{ 0, 2, 3, 4 }`) 순차 실행에서는 맞지만 **병렬화하면 여전히 틀린다.** PLINQ는 함수가 결합법칙을 만족한다고 가정하고 여러 원소를 시드로 삼기 때문이다. 집계 함수를 `f(total, n) => total + n * n`이라 하면 LINQ to Objects는 `f(f(f(0,2),3),4)`로 계산하지만, PLINQ는 `f(f(0,2), f(3,4))`처럼 나눌 수 있다.

```text
첫 번째 파티션:  a = 0 + 2*2     (= 4)
두 번째 파티션:  b = 3 + 4*4     (= 19)
최종 결과:      a + b*b         (= 365)
또는:           b + a*a         (= 35)
```

제대로 된 해법은 둘이다.

**해법 1 — 시드를 명시한다.** 0을 시드로 주면 된다. PLINQ에서 순차 실행으로 떨어지지 않게 하려면 전용 오버로드가 필요하다(50.5절).

**해법 2 — 집계 함수가 교환법칙·결합법칙을 만족하도록 쿼리를 재구성한다.**

```csharp
int sum = numbers.Select(n => n * n).Aggregate((total, n) => total + n);
```

> **💡 이 정도 문제에는 `Sum`을 써라**
>
> ```csharp
> int sum = numbers.Sum(n => n * n);
> ```
>
> `Sum`과 `Average`만으로도 꽤 멀리 갈 수 있다. 제곱평균제곱근(RMS)은 `Math.Sqrt(numbers.Average(n => n * n))`이고, 표준편차도 마찬가지다.
>
> ```csharp
> double mean = numbers.Average();
> double sdev = Math.Sqrt(numbers.Average(n => (n - mean) * (n - mean)));
> ```
>
> 둘 다 안전하고 효율적이며 완전히 병렬화 가능하다. `Sum`/`Average`로 환원되지 않는 커스텀 집계의 실전 예는 50장에서 다룬다.

---

## 30.11 한정자 — `Contains`, `Any`, `All`, `SequenceEqual`

`IEnumerable<TSource>` → `bool`. `true`/`false`를 돌려주는 집계다. **전부 즉시 실행이다.**

| 연산자 | 하는 일 | 빈 시퀀스에서 | SQL 대응 |
|---|---|---|---|
| `Contains` | 주어진 원소가 있는가 | `false` | `WHERE ... IN (...)` |
| `Any` | 조건을 만족하는 원소가 하나라도 있는가 | `false` | `WHERE ... IN (...)` |
| `All` | 모든 원소가 조건을 만족하는가 | **`true`** | `WHERE (...)` |
| `SequenceEqual` | 두 시퀀스가 같은 원소를 같은 순서로 갖는가 | 둘 다 비면 `true` | — |

### `Contains`와 `Any`

`Contains`는 `TSource` 타입의 인자를 받고, `Any`는 조건자를 선택적으로 받는다.

```csharp
bool a = new int[] { 2, 3, 4 }.Contains(3);           // true
bool b = new int[] { 2, 3, 4 }.Any(n => n == 3);      // true
bool c = new int[] { 2, 3, 4 }.Any(n => n > 10);      // false
bool d = new int[] { 2, 3, 4 }.Where(n => n > 10).Any();   // false
```

`Any`는 `Contains`가 하는 일을 전부 할 수 있고 그 이상도 한다. 조건자 없이 부르면 **원소가 하나라도 있는지**를 답한다.

비교자를 넘기지 않으면 `Enumerable.Contains`는 입력이 `ICollection<T>`를 구현하는지 검사하고, 구현하면 그 타입의 `Contains`를 호출한다. `HashSet<T>`에 대해 O(1)이 되는 이유다. 반대로 `Any(x => x.Equals(v))`는 이 빠른 경로를 타지 않고 항상 선형 탐색을 한다. **원소 동등성만 보면 되는 상황에서는 `Any`보다 `Contains`가 낫다.**

`Any`는 서브쿼리에서 특히 유용하고 데이터베이스 쿼리에서 자주 쓰인다.

```csharp
from c in dbContext.Customers
where c.Purchases.Any(p => p.Price > 1000)
select c
```

### `All`과 `SequenceEqual`

```csharp
dbContext.Customers.Where(c => c.Purchases.All(p => p.Price < 100));
```

> **⚠️ 빈 시퀀스에서 `All`은 `true`다**
>
> "모든 구매가 100달러 미만인 고객"에는 **구매가 한 건도 없는 고객이 전부 포함된다.** 논리학에서 공허한 참(vacuous truth)이라 부르는 것이고 수학적으로 옳지만, 요구사항이 "저가 구매만 한 고객"이었다면 결과가 틀린 것이다. `All`을 쓸 때는 빈 경우를 의도했는지 반드시 확인하고, 아니라면 `Any()`를 함께 걸어라.
>
> ```csharp
> c.Purchases.Any() && c.Purchases.All(p => p.Price < 100)
> ```

참고로 `array1 == array2`는 **참조 비교**이므로 내용이 같아도 `false`다. 배열이나 리스트의 내용 비교에는 `SequenceEqual`이 답이다(25.1절).

`SequenceEqual`은 두 시퀀스를 비교한다. `true`가 되려면 **각 시퀀스가 같은 원소를 같은 순서로** 가져야 한다. 비교자를 넘길 수 있고, 기본값은 `EqualityComparer<T>.Default`다.

> **⚠️ `SequenceEqual`은 순서를 본다**
>
> `{1,2,3}.SequenceEqual({3,2,1})`은 `false`다. 순서와 무관하게 "같은 원소 집합인가"를 묻고 싶다면 `a.OrderBy(x => x).SequenceEqual(b.OrderBy(x => x))`처럼 정렬을 먼저 하거나, 중복을 무시해도 된다면 `HashSet<T>.SetEquals`를 쓴다. 중복 개수까지 봐야 한다면 `GroupBy`로 개수를 세어 비교해야 한다.

---

## 30.12 생성 메서드 — `Empty`, `Range`, `Repeat`

void → `IEnumerable<TResult>`. **확장 메서드가 아니라 `Enumerable` 클래스의 정적 메서드다.**

| 연산자 | 시그니처 | 하는 일 |
|---|---|---|
| `Empty` | `Empty<TResult>()` | 빈 시퀀스 |
| `Range` | `Range(int start, int count)` | 연속된 정수 시퀀스 |
| `Repeat` | `Repeat<TResult>(TResult element, int count)` | 같은 원소를 `count`번 |

### `Empty`

```csharp
foreach (string s in Enumerable.Empty<string>())
    Console.Write(s);       // 아무것도 출력되지 않는다
```

`Empty<T>()`는 **캐시된 싱글턴을 돌려주므로** 뜨거운 경로에서 반복 호출해도 할당이 생기지 않는다.

`??` 연산자와 결합하면 `DefaultIfEmpty`와 정확히 반대되는 일을 한다. 들쭉날쭉한 정수 배열 `{ new[]{1,2,3}, new[]{4,5,6}, null }`을 평면화하는 `numbers.SelectMany(a => a)`는 마지막 `null` 때문에 깨진다. `Empty`와 `??`를 함께 쓰면 해결된다.

```csharp
IEnumerable<int> flat = numbers
    .SelectMany(innerArray => innerArray ?? Enumerable.Empty<int>());

foreach (int i in flat) Console.Write(i + " ");    // 1 2 3 4 5 6
```

> **💡 널을 돌려주는 대신 `Empty<T>()`를 돌려줘라**
>
> 시퀀스를 반환하는 메서드가 "결과 없음"을 `null`로 표현하면, 호출자 전부가 널 검사를 해야 하고 한 곳만 빠뜨려도 `NullReferenceException`이 난다. **빈 시퀀스를 돌려주면 호출자가 아무 검사 없이 `foreach`와 LINQ 연산자를 이어 붙일 수 있다.** 할당도 생기지 않는다. API 설계 원칙은 78장에서 다룬다.

### `Range`와 `Repeat`

```csharp
foreach (int i in Enumerable.Range(5, 3))
    Console.Write(i + " ");                        // 5 6 7

foreach (bool x in Enumerable.Repeat(true, 3))
    Console.Write(x + " ");                        // True True True
```

> **⚠️ `Range`의 두 번째 인자는 끝 값이 아니라 개수다**
>
> `Range(5, 3)`은 `{5, 6, 7}`이다. `for (int i = start; i < end; i++)`에 익숙한 눈에는 `Range(start, end)`로 읽히기 쉽다. `start`에서 `end`까지가 필요하면 `Range(start, end - start + 1)`이고, `Enumerable.Range(start: 5, count: 3)`처럼 이름 있는 인자를 쓰면 실수가 줄어든다.

> **⚠️ `Repeat`는 같은 참조를 반복한다, 그리고 예외 조건**
>
> `Enumerable.Repeat(new Person("Tom"), 3)`은 `Person` 객체를 **하나만** 만들어 세 번 내보낸다. 서로 다른 객체 셋이 필요하면 `Enumerable.Range(0, 3).Select(_ => new Person("Tom"))`을 써야 한다. 값 타입에서는 복사가 일어나 이 구별이 드러나지 않지만 참조 타입에서는 조용한 버그가 된다.
>
> `count`가 음수면 `Range`와 `Repeat` 모두 `ArgumentOutOfRangeException`을 던진다. `Range`는 `start + count - 1`이 `int.MaxValue`를 넘어도 같은 예외를 던진다. 이 검사는 **호출 시점에** 일어나므로 열거하지 않아도 즉시 터진다.

---

## 30.13 `Single()`과 `First()`로 의미를 강제하기

30.9절의 표는 어느 연산자가 언제 예외를 던지는지를 알려 준다. 이 절은 **그래서 무엇을 골라야 하는가**를 다룬다. 답은 성능이 아니라 **의미**에서 나온다.

### 네 연산자는 네 개의 서로 다른 주장이다

```csharp
users.Single         (u => u.Email == email);  // 정확히 한 명이다
users.SingleOrDefault(u => u.Email == email);  // 한 명이거나 없다
users.First          (u => u.Email == email);  // 최소 한 명, 첫 번째가 의미 있다
users.FirstOrDefault (u => u.Email == email);  // 몇 명이든 상관없다
```

데이터가 정상일 때는 네 줄이 같은 결과를 내지만, **네 줄은 코드를 읽는 사람과 런타임 양쪽에 서로 다른 것을 말한다.**

| 연산자 | 코드가 주장하는 것 | 주장이 깨지면 |
|---|---|---|
| `Single` | "이 조건에 맞는 것은 정확히 하나" | 즉시 예외 |
| `SingleOrDefault` | "많아야 하나" | 둘 이상이면 예외 |
| `First` | "적어도 하나" | 없으면 예외 |
| `FirstOrDefault` | 아무 주장도 하지 않는다 | 조용히 `default` |

`FirstOrDefault`는 **주장이 없다.** 그래서 가장 안전해 보이지만 실제로는 가장 위험하다. 데이터가 깨졌을 때 예외 대신 `null`이 흐르고, 그 `null`은 몇 단계 뒤의 엉뚱한 곳에서 `NullReferenceException`으로 터진다. 스택 트레이스에는 원인이 된 쿼리가 나오지 않는다.

> **💡 기본값은 `FirstOrDefault`가 아니라 `Single`이다**
>
> 코드를 쓸 때 순서를 뒤집어라. **"몇 개가 나와야 정상인가"를 먼저 정하고 그에 맞는 연산자를 고른다.** 이메일로 사용자를 찾는데 두 명이 나온다면 그건 정상 상황이 아니라 데이터 무결성 사고다. `Single`은 그 사고를 **사고가 난 지점에서** 알려 준다. `FirstOrDefault`는 사고를 은폐한다.

### 어떤 예외가 더 나은 예외인가

같은 데이터 손상에 대해 세 연산자가 내놓는 반응을 비교하면 차이가 분명해진다. 이메일이 중복 등록된 상황을 가정하자.

| 연산자 | 반응 | 디버깅 난이도 |
|---|---|---|
| `Single` | `"Sequence contains more than one element"` 예외 | 원인 지점에서 즉시 |
| `First` | 아무 일 없이 둘 중 하나를 반환 | 로그인이 가끔 다른 계정으로 되는 재현 불가 버그 |
| `FirstOrDefault` | 위와 동일 | 위와 동일 |

`Single`의 예외 메시지가 완벽하지는 않다. 어떤 키에서 문제가 났는지 알려 주지 않기 때문이다. 하지만 **아무 일도 일어나지 않는 것보다는 압도적으로 낫다.**

> **📌 EF Core에서 `Single`은 두 행을 요청한다**
>
> EF Core는 `Single`/`SingleOrDefault`를 **두 행을 가져오는 SQL**로 번역한다. 한 행만 요청하면 "둘 이상인지"를 알 수 없기 때문이다. 두 번째 행이 오면 예외를 던진다. `First`/`FirstOrDefault`는 한 행만 요청한다. 즉 `Single`은 `First`보다 아주 약간의 추가 비용이 있고, 그 비용이 곧 검증의 값이다.

### `First`가 옳은 경우

`Single`이 늘 옳은 것은 아니다. **여러 개가 정상이고 그중 첫 번째가 의미 있는** 상황에서는 `First`가 맞다.

```csharp
// 최근 주문 — 여러 개가 정상이고, 정렬 기준이 "첫 번째"의 의미를 만든다
var latest = orders.OrderByDescending(o => o.Date).First();
```

> **⚠️ 정렬 없는 `First`는 "아무거나 하나"라는 뜻이다**
>
> `orders.First()`가 어떤 주문을 돌려줄지는 `orders`의 순서에 달려 있다. 로컬 리스트라면 삽입 순서지만, EF Core 쿼리라면 데이터베이스가 정한 순서다. 그리고 그 순서는 인덱스 변경이나 실행 계획 변화로 어느 날 바뀔 수 있다. **`First`를 쓴다면 그 앞에 `OrderBy`가 있어야 한다.** 없다면 의도가 "아무거나"인지 스스로 확인하라.

### `FirstOrDefault`가 옳은 경우

"없는 것이 정상 상황"일 때만 쓴다. 그리고 그때는 **`default`를 즉시 처리해야 한다.**

```csharp
// 캐시 조회 — 없는 것이 정상
var cached = entries.FirstOrDefault(e => e.Key == key);
if (cached is null)
    return LoadFromSource(key);
```

> **⚠️ 널 허용 참조 형식이 이 실수를 잡아 준다**
>
> `FirstOrDefault`의 반환 타입은 `TSource?`다. 널 허용 참조 형식(21장)이 켜져 있으면 널 검사 없이 멤버에 접근할 때 컴파일러가 CS8602 경고를 낸다. **`<Nullable>enable</Nullable>`을 켜는 것만으로도 `FirstOrDefault` 관련 사고의 상당수가 컴파일 시점으로 앞당겨진다.** 다만 값 타입 시퀀스에서는 `default`가 `null`이 아니라 0이므로 경고가 나지 않는다 — 30.9절의 함정이 여기서도 유효하다.

### 요약 판단표

| 질문 | 답 | 연산자 |
|---|---|---|
| 0개가 정상인가? | 아니오 → | `Single` 또는 `First` |
| 0개가 정상인가? | 예 → | `SingleOrDefault` 또는 `FirstOrDefault` |
| 2개 이상이 정상인가? | 아니오 → | `Single` 계열 |
| 2개 이상이 정상인가? | 예 → | `First` 계열 (+ 반드시 `OrderBy`) |

> **💡 이 판단은 LINQ만의 이야기가 아니다**
>
> `ToDictionary` vs `ToLookup`(30.8절), `Cast` vs `OfType`(30.8절)도 같은 축 위에 있다. **한쪽은 불변식을 주장하고 검증하며, 다른 쪽은 예외 없이 넘어간다.** 잘못된 데이터를 조용히 통과시키는 연산자를 습관적으로 고르는 코드베이스는 시간이 갈수록 원인을 알 수 없는 버그가 쌓인다. 예외를 두려워하지 마라. 예외는 정보다.

---

## 30.14 LINQ의 숨은 할당 — 델리게이트, 클로저, 열거자, 익명 타입

29.1절에서 `Where` 한 줄이 만드는 할당 목록을 봤다. 이 절은 그 목록을 **연산자 체인 전체로 확장**하고, 각 항목이 언제 생기고 언제 사라지는지를 판다. 힙과 할당의 기초는 61·62·63장에서, 할당을 줄이는 일반 기법은 69장에서 다룬다.

### 네 종류의 객체

```text
        var q = list.Where(x => x.Age > min).Select(x => x.Name);
                            └──────┬──────┘        └────┬────┘
                                   │                    │
  ┌────────────────────────────────┴────────────────────┴──────────┐
  │ ① 델리게이트 객체    Func<Person,bool>   Func<Person,string>    │
  │    - 캡처가 없으면 최초 1회 생성 후 정적 필드에 캐시            │
  │    - 캡처가 있으면 디스플레이 클래스 인스턴스마다 새로 생성     │
  ├────────────────────────────────────────────────────────────────┤
  │ ② 디스플레이 클래스  min을 캡처했으므로 1개                     │
  │    - 컴파일러가 만든 클래스 (26.10절)                           │
  │    - 캡처된 변수를 필드로 담는다                                │
  ├────────────────────────────────────────────────────────────────┤
  │ ③ 반복자 객체        WhereListIterator  →  SelectIterator       │
  │    - 연산자 하나당 1개, 쿼리를 조립할 때 생성                   │
  ├────────────────────────────────────────────────────────────────┤
  │ ④ 열거자 객체        foreach 할 때마다 계층마다 1개             │
  │    - 다시 열거하면 다시 생성된다                                │
  └────────────────────────────────────────────────────────────────┘
```

여기에 다섯 번째가 있다. **투영이 익명 타입을 만들면 원소마다 인스턴스 하나씩**이다. 앞의 넷은 쿼리당 상수 개수지만, 이것만 원소 수에 비례한다.

### ① 델리게이트 — 캡처 유무가 전부를 가른다

```csharp
// 캡처 없음: 람다가 static으로 컴파일되고 델리게이트가 캐시된다
var adults = people.Where(p => p.Age >= 18);

// 캡처 있음: 호출할 때마다 디스플레이 클래스 + 델리게이트가 새로 할당된다
int min = GetMinAge();
var adults = people.Where(p => p.Age >= min);
```

첫 번째 람다는 외부 변수를 참조하지 않으므로 컴파일러가 **정적 메서드**로 만들고, 그 델리게이트를 컴파일러 생성 클래스의 정적 필드에 **한 번만** 만들어 캐시한다. 같은 코드를 100만 번 실행해도 델리게이트는 하나다. 두 번째 람다는 `min`을 캡처하므로 컴파일러가 디스플레이 클래스를 만들고 람다를 그 클래스의 인스턴스 메서드로 만든다. **메서드가 호출될 때마다 디스플레이 클래스 1개 + 델리게이트 1개가 힙에 할당된다.**

> **💡 상수는 캡처하지 말고 인라인하라**
>
> 상수로 쓸 수 있는 것을 굳이 지역 변수에 담아 캡처하면 할당이 두 개 생긴다. `static` 람다(※C# 9)는 캡처를 시도하면 컴파일 오류가 나므로 이 실수를 막아 준다(26.11절).

> **⚠️ 캡처는 메서드 스코프 단위다**
>
> 한 메서드 안에서 람다 세 개가 각각 다른 변수를 캡처해도, 컴파일러는 **스코프마다 디스플레이 클래스를 하나** 만들어 공유한다. 즉 할당 개수는 람다 수가 아니라 스코프 수에 비례한다. 반면 그 하나의 디스플레이 클래스가 살아 있는 동안 **거기 담긴 모든 변수가 GC에서 살아남는다.** 큰 배열 하나를 캡처한 람다가 오래 살아 있으면 그 배열도 함께 살아 있다(26.10절).

### ③④ 반복자와 열거자

```csharp
var q = list.Where(...).Select(...).Take(10);     // 반복자 3개
foreach (var x in q) { }                          // 열거자 3개
foreach (var x in q) { }                          // 열거자 또 3개
```

반복자 객체는 쿼리를 **조립할 때** 만들어진다. 열거자 객체는 **열거할 때마다** 계층마다 하나씩 만들어진다. 쿼리를 두 번 돌리면 열거자도 두 벌 만들어진다.

> **⚠️ `foreach`는 인터페이스를 거치면 열거자를 박싱한다**
>
> `List<T>`를 직접 `foreach`하면 컴파일러가 `List<T>.Enumerator`라는 **구조체** 열거자를 쓰고 할당이 없다. 그런데 `IEnumerable<T>`로 받은 뒤 `foreach`하면 `GetEnumerator()`가 인터페이스를 통해 호출되어 구조체가 박싱된다. **LINQ 연산자를 하나만 걸어도 이 최적화는 사라진다.** `list.Where(...)`의 결과는 클래스 반복자이고 그 열거자도 클래스다. 이것이 "작은 컬렉션을 뜨거운 루프에서 LINQ로 훑으면 손해"의 실체다.

> **📌 `Where` 뒤에 `Select`를 붙이면 계층이 늘지 않을 수도 있다**
>
> `System.Linq`의 실제 구현에는 융합(fusion) 최적화가 있다. `Where`가 돌려주는 반복자에 `Select`를 걸면 새 계층을 얹는 대신 **조건자와 선택자를 함께 들고 있는 반복자 하나**로 합쳐지는 경우가 있다. 입력이 배열이냐 리스트냐 일반 시퀀스냐에 따라 서로 다른 반복자 타입이 선택되기도 한다. 이는 문서화된 계약이 아니라 **구현 세부이며 런타임 버전에 따라 달라진다.** 최적화를 이 동작에 의존해 설계하지 마라. 다만 "연산자 수 = 계층 수"라는 단순 계산이 항상 맞지는 않다는 점은 알아 둘 만하다.

### ⑤ 익명 타입 — 유일하게 원소 수에 비례하는 할당

```csharp
var q = people.Select(p => new { p.Name, p.Age });    // 원소당 1개
```

익명 타입은 **클래스**다(29.10절). 원소 100만 개를 투영하면 인스턴스 100만 개가 힙에 생기고, 그 전부가 0세대를 채워 GC를 유발한다.

같은 일이 **눈에 보이지 않는 곳에서도** 일어난다. `let`, 두 번째 이후의 `from`, `join`은 전부 투명 식별자를 위해 익명 타입을 만든다(29.3절, 30.3절).

```csharp
from p in people
let upper = p.Name.ToUpper()      // ← 원소마다 익명 타입 1개
where upper.StartsWith("A")
select upper;
```

> **💡 익명 타입 대신 값 튜플을 쓰면 힙 할당이 사라진다**
>
> ```csharp
> var q = people.Select(p => (p.Name, p.Age));      // ValueTuple — 구조체
> ```
>
> `ValueTuple`은 구조체이므로 힙 할당이 없다(69.2절). 다만 델리게이트 경계를 넘나들며 복사되므로 필드가 많으면 복사 비용이 붙고, 쿼리 구문의 `let`을 튜플로 바꿀 수는 없다. 원소가 아주 많고 프로파일러가 익명 타입 할당을 지목했을 때만 고려하라.

### 할당 요약표

| 대상 | 개수 | 언제 | 회피 |
|---|---|---|---|
| 델리게이트(캡처 없음) | 프로세스당 1 | 최초 실행 시 캐시 | 이미 최선 |
| 델리게이트(캡처 있음) | 쿼리 조립마다 1 | 쿼리를 만들 때 | 캡처 제거, `static` 람다 |
| 디스플레이 클래스 | 스코프마다 1 | 캡처가 있을 때만 | 캡처 제거 |
| 반복자 객체 | 연산자 계층마다 1 | 쿼리를 만들 때 | 연산자 수 줄이기 |
| 열거자 객체 | 계층마다 1, **열거마다** | `foreach` 할 때 | 재열거 줄이기, `ToList` 실체화 |
| 익명 타입 | **원소마다 1** | 투영·`let`·다중 `from`·`join` | 값 튜플, `let` 제거 |
| `GroupBy`의 그룹/버퍼 | 그룹마다 1 + 전체 버퍼 | 첫 열거 시 | 딕셔너리 직접 갱신 |
| `ToList`/`ToArray` 결과 | 1(+ 내부 재할당) | 즉시 | 필요한 것만 |

> **💡 이 목록을 언제 신경 써야 하는가**
>
> **원소가 많은 쿼리를 가끔 실행한다면 신경 쓰지 마라.** 원소당 비용(익명 타입)만 보면 되고, 나머지 상수 비용은 측정되지 않는다. **작은 쿼리를 초당 수십만 번 실행한다면 전부 신경 써야 한다.** 이때는 LINQ를 버리고 루프를 쓰는 것이 정답인 경우가 많다. 어느 쪽인지는 추측이 아니라 `MemoryDiagnoser`로 확인한다(67.5절).

---

## 30.15 LINQ 성능 실전 — `let` 회피, `GroupBy` 개선, 마지막 원소 얻기, 리스트 필터링

앞 절이 "무엇이 할당되는가"였다면 이 절은 "그래서 어떻게 고치는가"다. 네 가지 실전 사례를 본다.

> **⚠️ 이 절의 결론을 그대로 복사하지 마라**
>
> 아래 개선은 전부 **작은 컬렉션을 반복해서 쿼리하는 벤치마크**에서 얻은 것이다. 원소가 많아지면 순위가 뒤집히는 것도 있다. 이 절이 주는 것은 정답이 아니라 **어디를 의심할지에 대한 목록**이다. 실제 판단은 여러분의 데이터로 측정해서 내려야 한다(67장).

### 1. `let`이 만드는 투명 식별자 비용

`let`은 "값을 한 번만 계산해서 여러 번 쓰니까 빨라진다"는 직관을 준다. **로컬 쿼리에서는 그 반대다.**

```csharp
// let 없음
var result = from person in _people
             where person.LastName.Contains("Omega")
                && person.FirstName.Equals("Upsilon")
             select person;

// let 사용
var result = from person in _people
             let lastName  = person.LastName.Contains("Omega")
             let firstName = person.FirstName.Equals("Upsilon")
             where lastName && firstName
             select person;
```

두 번째 쿼리는 **처리 시간과 메모리 할당이 모두 늘어난다.** 이유는 29.3절에서 본 그대로다. `let` 하나가 `Select` 계층 하나를 더하고, 원소마다 익명 타입 인스턴스를 하나씩 만든다. `let`이 두 개면 중첩 익명 타입 `{ { person, lastName }, firstName }`이 만들어진다.

ILDASM으로 두 메서드를 비교하면 `let` 버전의 IL이 명백히 길다. 컴파일 결과가 늘었으니 런타임 비용도 늘어난 것이다.

같은 현상은 필터링에서도 재현된다. 아래에서 위쪽은 `ToLower()`를 두 번 호출하고, 아래쪽은 한 번만 호출하는 대신 익명 타입을 할당한다.

```csharp
return (from p in _people
        where _group1.Contains(p.LastName.ToLower())
           || _group2.Contains(p.LastName.ToLower())
        select p).ToList();

return (from p in _people
        let lastName = p.LastName.ToLower()
        where _group1.Contains(lastName) || _group2.Contains(lastName)
        select p).ToList();
```

`ToLower()`를 두 번 부르는 쪽이 오히려 빨랐다. **문자열 하나를 더 만드는 비용보다 투명 식별자 계층을 얹는 비용이 컸다는 뜻이다.**

> **⚠️ "let은 성능을 높인다"는 조언을 그대로 믿지 마라**
>
> `let`을 성능 개선 도구로 소개하는 자료가 흔하다. 로컬 쿼리에서는 사실이 아니다. `let`은 **가독성 도구**로 쓰고, 계산이 정말 비쌀 때(정규식 매칭, 파싱, I/O)만 성능 목적으로 고려하라. 그 경우에도 `let` 대신 `Select` 하나에 계산을 모으거나 지역 함수로 빼는 편이 낫다.
>
> 해석되는 쿼리에서는 이야기가 완전히 다르다. `let`은 식 트리 노드 몇 개로 끝나고 SQL의 별칭이나 파생 테이블로 흡수된다. **같은 문법이 실행 위치에 따라 정반대의 비용을 갖는다.**

### 2. 조건 검사 순서 — 도메인 지식이 성능이다

`let`을 없앤 다음 단계는 LINQ 자체를 걷어내는 것이다.

```csharp
List<Person> people = new List<Person>();
for (int i = 0; i < _people.Count; i++)
{
    var person   = _people[i];
    var lastName = person.LastName.ToLower();
    if (_group1.Contains(lastName) || _group2.Contains(lastName))
        people.Add(person);
}
return people;
```

이 버전이 앞의 두 LINQ 버전보다 확실히 빨랐다. 델리게이트도, 반복자도, 열거자도, 익명 타입도 없기 때문이다.

여기서 한 걸음 더 나갈 수 있다. `_group2`가 `_group1`보다 원소가 적다면 **순서를 바꾸는 것만으로** 더 빨라진다.

```csharp
if (_group2.Contains(lastName) || _group1.Contains(lastName))   // 작은 쪽 먼저
```

`||`는 단락 평가(short-circuit)이므로 왼쪽이 참이면 오른쪽을 보지 않는다. 그리고 배열의 `Contains`는 선형 탐색이다. **작은 배열을 먼저 검사하면 평균 비교 횟수가 줄어든다.**

> **💡 이건 LINQ 이야기가 아니라 조건식 이야기다**
>
> 단락 평가되는 조건식에서 **싸고 자주 참인 검사를 앞에** 두는 것은 언어와 무관한 원칙이다. 도메인을 알아야 어느 쪽이 그런지 판단할 수 있다. 컴파일러는 `Contains` 호출의 비용도, 참이 될 확률도 모르므로 이 재배치를 대신해 주지 않는다.

### 3. `GroupBy` 개선

같은 그룹핑 결과를 얻는 세 가지 방법을 벤치마크한 사례가 있다.

```csharp
// 버전 1 — 순수 LINQ 체인
List<Person> people = _people.GroupBy(x => x.LastName)
                             .Where(x => x.Count() > 1)
                             .SelectMany(group => group)
                             .ToList();

// 버전 2 — 열거자를 직접 돌린다
var e = _people.GroupBy(p => p.LastName).Where(g => g.Count() > 2).GetEnumerator();
List<Person> people = new List<Person>();
while (e.MoveNext())
    foreach (Person person in e.Current) people.Add(person);

// 버전 3 — 그룹핑 전에 배열로 바꾼다 (이하 버전 2와 동일)
var e = _people.ToArray().GroupBy(p => p.LastName).Where(g => g.Count() > 2).GetEnumerator();
```

배열로 바꾼 뒤 그룹핑하는 버전이 가장 빨랐다는 것이 원 벤치마크의 결론이다. 배열은 `List<T>`보다 열거 경로가 짧고, `System.Linq`가 배열 전용 빠른 경로를 갖는 경우가 있기 때문으로 설명된다.

> **⚠️ 이 벤치마크는 그대로 신뢰할 수 없다**
>
> 원천의 세 메서드를 잘 보면 **버전 1은 `Count() > 1`, 버전 2와 3은 `Count() > 2`로 조건이 다르다.** 서로 다른 결과를 내는 코드를 비교한 것이므로, 세 버전의 시간 차이를 "그룹핑 방식의 차이"로 해석할 수 없다. 게다가 보고된 수치의 차이는 마이크로초 단위였다. **이 사례에서 가져갈 교훈은 "`ToArray()`를 붙여라"가 아니라 "벤치마크는 같은 일을 하는 코드끼리 비교해야 한다"는 것이다.** 벤치마크가 거짓말하는 경우는 67.4절에서 다룬다.

`GroupBy` 개선에서 실제로 효과가 큰 것은 다른 데 있다. **`GroupBy`는 입력 전체를 버퍼링한다**(30.6절). 집계 결과만 필요한데 그룹 전체를 만들고 있다면 그것이 낭비다.

```csharp
// 그룹을 만든 뒤 개수만 꺼낸다 — 모든 원소가 리스트에 담긴다
var counts = people.GroupBy(p => p.LastName)
                   .ToDictionary(g => g.Key, g => g.Count());

// 개수만 센다 — 원소를 담지 않는다  ※.NET 9
var counts = people.CountBy(p => p.LastName);

// 어느 버전에서도 쓸 수 있는 직접 구현
var counts = new Dictionary<string, int>();
foreach (var p in people)
    counts[p.LastName] = counts.GetValueOrDefault(p.LastName) + 1;
```

.NET 9은 `CountBy`와 `AggregateBy`를 추가했다. **키별 집계만 필요할 때 그룹의 원소 리스트를 만들지 않는다**는 것이 이들의 존재 이유다.

> **💡 `GroupBy`를 의심해야 하는 신호**
>
> `GroupBy` 뒤에 `Count()`, `Sum()`, `Max()`만 오고 그룹의 원소 자체는 쓰지 않는다면, 그룹 리스트를 만들 이유가 없다. 딕셔너리 하나를 직접 갱신하는 루프로 바꾸면 할당이 크게 줄어든다. 원소가 100만 개면 이 차이는 측정된다.

### 4. 마지막 원소를 인덱서로 얻기

```csharp
var lastPerson = _people.Last();              // LINQ
var lastPerson = _people[_people.Count - 1];  // 인덱서
```

인덱서 쪽이 더 빠르다. `Enumerable.Last`는 확장 메서드이므로 다음을 거친다.

```csharp
public static TSource Last<TSource>(this IEnumerable<TSource> source);
```

인자 널 검사, 입력이 `IList<T>`인지 확인하는 타입 검사, 비었는지 확인, 그다음에야 인덱서 호출이다. 인덱서 직접 접근은 이 검사들을 전부 건너뛴다.

> **⚠️ "`Last()`는 O(n)이다"는 정확하지 않다**
>
> 흔히 `Last()`가 시퀀스를 처음부터 끝까지 훑는다고 말하지만, `Enumerable.Last`는 **입력이 `IList<T>`를 구현하면 인덱서로 바로 접근한다.** `List<T>`나 배열에 대해서는 O(1)이다. 위 벤치마크가 보여주는 차이는 O(n) 대 O(1)이 아니라 **몇 번의 타입 검사와 메서드 호출**이다. 그래서 뜨거운 루프가 아니면 측정되지 않는다.
>
> 진짜 O(n)이 되는 것은 입력이 `IList<T>`가 아닐 때다. `list.Where(...).Last()`는 필터 결과가 `IList<T>`가 아니므로 전체를 훑는다.

> **⚠️ `Last()`와 `[Count - 1]`은 빈 컬렉션에서 다르게 실패한다**
>
> `Last()`는 `InvalidOperationException`을, `[Count - 1]`은 `ArgumentOutOfRangeException`을 던진다. `^1` 인덱스(`list[^1]`)도 후자와 같다. 예외를 잡는 코드가 있다면 바꾸는 순간 조용히 통과되지 않는다.

### 5. `List<T>` 필터링 — `RemoveAll`과 `Span`

리스트를 걸러 내는 방법은 여럿이고 비용이 다 다르다.

| 방법 | 새 컬렉션 | 델리게이트 | 반복자·열거자 | 특징 |
|---|---|---|---|---|
| `list.Where(p).ToList()` | 1개 | 1개 | 있음 | 가장 흔하고 가장 비싸다 |
| `list.FindAll(p)` | 1개 | 1개 | 없음 | `List<T>`의 인스턴스 메서드, 직접 루프 |
| `list.RemoveAll(p)` | **없음** | 1개 | 없음 | **제자리 수정**, 원본이 바뀐다 |
| 직접 `for` 루프 | 1개 | 없음 | 없음 | 가장 빠르지만 코드가 길다 |
| `CollectionsMarshal.AsSpan(list)` 순회 | 상황에 따라 | 없음 | 없음 | 경계 검사 제거, 68장 |

```csharp
// 조건에 맞지 않는 것을 제거한다 — 새 리스트를 만들지 않는다
people.RemoveAll(p => p.Age < 18);
```

`RemoveAll`은 **조건에 맞는 원소를 제거하고 제거된 개수를 돌려준다.** `Where`와 조건의 방향이 반대라는 점에 주의하라. `Where(p => p.Age >= 18)`과 같은 결과를 원하면 `RemoveAll(p => p.Age < 18)`이다.

> **⚠️ `RemoveAll`은 원본을 파괴한다**
>
> 원본 리스트를 다른 곳에서도 쓰고 있다면 `RemoveAll`은 쓸 수 없다. **필터링 결과가 원본을 대체하는 경우에만** 안전하다. 이 조건이 맞으면 새 리스트 할당이 통째로 사라지므로 이득이 크다. 내부적으로도 한 번의 순회로 원소를 앞으로 밀어내는 방식이라 요소 이동이 최소화된다.

`Span<T>`는 한 걸음 더 나간다. `CollectionsMarshal.AsSpan(list)`는 `List<T>`의 **내부 배열을 그대로 가리키는 스팬**을 준다. 인덱서 호출과 버전 검사 없이 순회할 수 있고 JIT이 경계 검사를 제거할 여지도 커진다.

> **⚠️ `CollectionsMarshal.AsSpan`은 안전 장치를 끄는 API다**
>
> 스팬을 들고 있는 동안 리스트에 원소를 추가하면 내부 배열이 재할당되어 **스팬이 옛 배열을 가리키게 된다.** 컴파일러도 런타임도 이것을 막아 주지 않는다. `Marshal`이라는 이름이 붙어 있는 이유가 그것이다. 사용 규칙은 68장에서 다룬다.

### 6. 클로저 — 매개변수화된 쪽이 낫다

LINQ 조건자를 델리게이트 팩터리로 만들 때, 자유 변수를 캡처하는 방식과 매개변수로 받는 방식을 비교한 벤치마크가 있다.

```csharp
// 매개변수화된 클로저 — 캡처가 없다
Func<string, char, char, bool> IsBetween =
    (s, lo, hi) => s[0] >= lo && s[0] <= hi;

var data = (from p in _people where IsBetween(p.LastName, 'A', 'G') select p).ToList();

// 자유 변수를 캡처하는 클로저 — 디스플레이 클래스가 할당된다
Func<string, bool> Between()
{
    char first = 'A', last = 'G';
    return s => s[0] >= first && s[0] <= last;
}
```

**매개변수화된 쪽이 더 빠르고 할당도 적었다.** 30.14절에서 본 이유 그대로다. 캡처가 있으면 디스플레이 클래스가 할당되고, 조건자 호출마다 그 필드를 로드해야 한다.

그런데 같은 벤치마크에서 가장 빨랐던 것은 **LINQ를 아예 쓰지 않은 버전**이었다.

```csharp
var data = _people.FindAll(x => x.LastName[0] >= 'A' && x.LastName[0] <= 'G');
```

> **💡 LINQ를 쓸지 말지가 먼저다**
>
> `List<T>`가 이미 손에 있고 조건 하나로 거르기만 한다면 `FindAll`이나 `RemoveAll`이 LINQ보다 낫다. LINQ의 가치는 **연산자를 합성**하고 **자료원에 무관하게 쓰는** 데 있다. 필터 하나에는 그 가치가 없다. 반대로 필터·정렬·그룹핑·투영이 이어지는 쿼리라면 LINQ가 압도적으로 읽기 쉽고, 그 가독성이 마이크로초보다 대개 더 중요하다.

### 판단 흐름

```text
  LINQ 쿼리가 프로파일러에 보인다
            ↓
  ① 뜨거운 루프 안에서 쿼리를 재조립하고 있는가?
     → 쿼리를 루프 밖으로 빼거나 결과를 실체화한다 (29.7절)
            ↓ 아니오
  ② 같은 시퀀스를 여러 번 열거하고 있는가?
     → ToList()로 한 번만 실체화한다 (29.11절)
            ↓ 아니오
  ③ 원소당 익명 타입이 생기는가? (let, 다중 from, join, 투영)
     → let을 없애거나 값 튜플로 바꾼다 (30.14절)
            ↓ 아니오
  ④ 버퍼링 연산자가 필요 이상으로 담고 있는가? (GroupBy, OrderBy)
     → 딕셔너리 직접 갱신, MinBy/MaxBy, CountBy로 대체
            ↓ 아니오
  ⑤ 연산자 하나짜리 쿼리를 아주 자주 호출하는가?
     → LINQ를 걷어내고 for 루프나 List<T>의 메서드를 쓴다
            ↓ 아니오
  ⑥ 여기까지 왔으면 LINQ가 병목이 아니다. 다른 곳을 봐라.
```

---

## 이 장의 요약

- **연산자는 세 부류다.** 시퀀스→시퀀스(거의 전부 지연), 시퀀스→요소·값(전부 즉시), void→시퀀스(정적 메서드). 여기에 지연·스트리밍 / 지연·버퍼링 / 즉시라는 두 번째 축을 겹치면 연산자 전체가 격자 위에 놓인다. 메모리를 볼 때 봐야 할 것은 지연 여부가 아니라 **버퍼링 여부**다.
- **쿼리 구문 키워드로 표현되는 연산자는 소수다.** 그중 가장 자주 오해받는 것이 두 번째 이후의 `from`이 `SelectMany`로 번역된다는 사실이다. 이 번역이 다중 범위 변수와 투명 식별자를 만들어 낸다.
- **`Join`은 안쪽 시퀀스를 룩업으로 만들어 해시 조인한다.** 로컬 컬렉션의 등가 조인은 O(n+m)으로 끝나고, 같은 일을 `SelectMany`로 하면 O(n×m)이다. `GroupJoin`은 계층 결과와 왼쪽 외부 조인을, `Zip`은 위치 기반 1:1 짝짓기를 담당한다. EF Core에서는 `Join`의 이점이 없다.
- **LINQ to Objects의 정렬은 안정 정렬이지만 그 보장은 로컬 쿼리에 한정된다.** 해석되는 쿼리에서는 동률의 순서가 보장되지 않으므로, 페이징에는 동률이 사라질 때까지 `ThenBy`를 붙여야 한다. `Order`/`OrderDescending`(※.NET 7)은 `x => x` 항등 람다를 대체한다.
- **`GroupBy`는 첫 원소를 내기 위해 입력 전체를 버퍼링한다.** 무한 시퀀스나 거대한 스트림에 쓸 수 없다. `Chunk`는 청크 하나만 버퍼링하므로 배치 처리에 안전하다.
- **집합 연산자의 결과는 집합이다.** `Union`·`Intersect`·`Except`는 입력의 중복까지 제거하고, `Intersect`/`Except`는 두 번째 시퀀스를 통째로 메모리에 올린다. 전부 해시 기반이므로 `GetHashCode` 계약을 지키지 않은 타입에서는 조용히 틀린 답이 나온다.
- **`Cast`는 예외를 던지고 `OfType`은 건너뛴다.** 그리고 `Cast`는 언박싱만 하므로 `int` 시퀀스를 `long` 시퀀스로 바꾸지 못한다. 숫자 변환에는 `Select`를 써야 한다.
- **`First`/`Single`/`FirstOrDefault`/`SingleOrDefault`는 성능이 아니라 의미로 고른다.** 각각 "최소 하나", "정확히 하나", "아무 주장 없음", "많아야 하나"라는 서로 다른 주장이다. 기본 선택은 `FirstOrDefault`가 아니라 `Single`이어야 하고, `First`를 쓴다면 그 앞에 `OrderBy`가 있어야 한다.
- **시드 없는 `Aggregate`는 첫 원소를 시드로 삼는다.** 교환법칙·결합법칙이 성립하지 않는 함수에 쓰면 결과가 직관과 어긋나고, 병렬화하면 비결정적이 된다. `Sum`/`Average`로 환원할 수 있으면 그쪽이 항상 낫다.
- **LINQ가 할당하는 것은 다섯 종류다.** 델리게이트, 디스플레이 클래스, 반복자, 열거자, 익명 타입. 앞의 넷은 쿼리당 상수 개수이고 **익명 타입만 원소 수에 비례한다.** 그래서 `let`·다중 `from`·`join`·투영이 원소가 많은 쿼리에서 가장 비싼 항목이 된다.
- **로컬 쿼리에서 `let`은 성능을 떨어뜨린다.** 해석되는 쿼리에서는 그렇지 않다. 같은 문법이 실행 위치에 따라 정반대의 비용을 갖는다는 것이 LINQ를 쓸 때 늘 의식해야 할 지점이다.

---

## 연습 문제

1. 30.1절의 지연 여부 표를 코드로 검증하라. 원소를 낼 때마다 콘솔에 로그를 찍는 반복자 메서드를 만들고, 그 시퀀스에 `Where`, `OrderBy`, `GroupBy`, `Take`, `Chunk`를 각각 걸어 본 뒤 `foreach`로 **첫 원소 하나만** 꺼내라. 어느 연산자가 입력 전체를 읽었는지 로그로 확인하라.
2. `Enumerable.Range(1, 5)`와 `Enumerable.Range(1, 3)`을 `Join`, `GroupJoin`, `Zip`, `SelectMany`로 각각 결합해 출력 원소 수를 비교하라. 그다음 `Zip`의 두 시퀀스 길이를 다르게 만들었을 때 어떤 원소가 사라지는지 확인하라.
3. 원소 100만 개짜리 `List<int>`를 만들고, `list.Select(x => new { x, Sq = x * x }).Count()`와 `list.Select(x => (x, Sq: x * x)).Count()`를 BenchmarkDotNet의 `[MemoryDiagnoser]`로 비교하라. 할당량 차이가 어디서 나오는지 30.14절의 표로 설명하라.
4. `Equals`만 재정의하고 `GetHashCode`는 재정의하지 않은 클래스를 만들어라. 값이 같은 인스턴스 두 개를 넣은 배열에 `Distinct()`를 걸어 결과가 몇 개인지 확인하고, `GetHashCode`를 올바르게 구현한 뒤 다시 확인하라.
5. `int[] { 2, 3, 4 }`에 `Aggregate((t, n) => t + n * n)`과 `Aggregate(0, (t, n) => t + n * n)`을 각각 적용해 결과가 27과 29로 갈리는 것을 확인하라. 그다음 `Select(n => n * n).Sum()`이 어느 쪽과 같은지 확인하라.
6. 같은 데이터에 대해 `Where(p).ToList()`, `FindAll(p)`, `RemoveAll(!p)`를 벤치마크하라. `RemoveAll` 버전을 반복 실행할 때 결과가 달라지는 이유를 설명하고, 벤치마크를 올바르게 고쳐라.
7. `List<T>`를 `IEnumerable<T>` 변수에 담은 뒤 `.Reverse()`를 호출해 보라. 어느 메서드가 선택되고 원본이 어떻게 되는지 확인하라. 그다음 `List<T>` 타입 변수에서 같은 호출을 해 차이를 확인하라.

---

**다음 장** — 31장「식 트리와 해석되는 쿼리」에서는 지금까지 델리게이트로 넘겼던 람다가 **데이터 구조로 표현되는** 세계를 다룬다. `Expression<TDelegate>`가 무엇이고, `IQueryable`이 그 데이터 구조를 어떻게 SQL로 번역하며, 이 장에서 "EF Core에서는 예외가 난다"고 적어 둔 연산자들이 왜 번역되지 못하는지가 그곳에서 밝혀진다. LINQ의 마지막 조각이다.
