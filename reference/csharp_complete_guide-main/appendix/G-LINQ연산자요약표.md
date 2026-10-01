# 부록 G. LINQ 연산자 요약표

> **이 부록의 위치** — 30장「LINQ 연산자 레퍼런스」는 표준 쿼리 연산자를 분류별로 판다. 그 장은 **왜 그렇게 동작하는가**를 설명하고, 이 부록은 **무엇이 있는가**만 남긴다. 연산자 이름이나 예외 조건이 기억나지 않아 장을 다시 펴는 대신 여기를 펴라. 이 부록에 새로운 사실은 없다. 모든 표는 30장에서 왔고 — 특히 30.1절이 이 부록의 뼈대다 — 각 항목마다 설명이 있는 절 번호를 `(30.M절)` 형태로 달았다.
>
> **선수 지식** — 24장(컬렉션), 25장(동등성과 순서 비교), 26장(델리게이트와 람다), 28장(열거와 반복자), 29장(LINQ 쿼리), 30장(LINQ 연산자 레퍼런스), 31장(식 트리와 해석되는 쿼리)
>
> **이 부록에서 다루지 않는 것** — 쿼리 식 문법의 번역 규칙, 지연 실행 모델, 재평가, 합성 전략은 29장이다. 식 트리의 구조, `IQueryable`의 동작 원리, EF Core가 LINQ를 SQL로 바꾸는 과정은 31장이다. PLINQ는 50장, 성능 측정 방법론은 67장이다. 이 부록은 **연산자 목록과 그 성질**만 다룬다. 정규식은 부록 F, 형식 문자열은 부록 E이며 LINQ와 무관하다.

---

## G.1 이 표를 쓰는 법

### 네 개의 좌표축

이 부록의 표는 연산자를 네 축 위에 놓는다. 축의 뜻을 정확히 알아야 표를 오독하지 않는다.

| 축 | 값 | 무엇을 결정하는가 |
|---|---|---|
| **분류** | 필터링 · 투영 · 조인 · 정렬 · 그룹핑 · 집합 · 변환 · 요소 · 집계 · 한정자 · 생성 | 어디를 찾아볼지 |
| **실행 시점** | 지연 / 즉시 | 코드가 **언제** 도는가 |
| **버퍼링** | 스트리밍 / 버퍼링 | 코드가 **메모리를 얼마나** 쓰는가 |
| **쿼리 구문 대응** | 키워드 있음 / 없음 | 쿼리 식으로 쓸 수 있는가 |

### 지연과 즉시

**지연 실행(deferred execution)** — 메서드를 호출하는 시점에는 아무 일도 하지 않고, 결과 시퀀스를 열거하기 시작할 때(정확히는 열거자의 `MoveNext`가 처음 호출될 때) 비로소 입력을 읽는다(29.6절). 지연 연산자가 반환하는 것은 결과가 아니라 **입력 시퀀스와 람다를 붙들고 있는 데코레이터 객체 하나**다.

**즉시 실행(immediate execution)** — 메서드를 호출하는 그 자리에서 입력을 필요한 만큼 열거하고 결과를 확정한다.

무엇이 즉시 실행인지는 규칙 하나로 외울 수 있다(29.6절).

| 부류 | 예 | 왜 즉시인가 |
|---|---|---|
| 원소 하나·스칼라·`bool`을 돌려주는 연산자 | `First`, `Single`, `Count`, `Sum`, `Any`, `Aggregate` | 반환 타입이 지연을 제공할 메커니즘 자체를 갖고 있지 않다 |
| 이름이 `To`로 시작하는 변환 연산자 | `ToArray`, `ToList`, `ToDictionary`, `ToHashSet`, `ToLookup` | 결과가 이미 실체화된 컬렉션이다 |

**나머지 전부가 지연 실행이다.** `AsEnumerable`, `Cast`, `OfType`은 이름 때문에 즉시로 오해받지만 지연이다(29.6절).

### 스트리밍과 버퍼링

이 축이 지연 축보다 실무에서 더 자주 사고를 낸다.

- **스트리밍(streaming)** — 출력 원소 하나를 만들기 위해 입력을 **필요한 만큼만** 읽는다. 메모리 사용량이 입력 크기와 무관하다.
- **버퍼링(buffering)** — 첫 출력 원소를 내놓기 위해 입력의 전부(또는 상당 부분)를 미리 읽어 메모리에 쌓는다.

두 축은 독립이다. 그래서 칸이 셋 생긴다.

```text
                    실행 시점 × 메모리

              스트리밍                    버퍼링
          ┌──────────────────────┬──────────────────────┐
   지연   │ Where Select Take    │ OrderBy GroupBy      │
          │ SelectMany Concat    │ Reverse Join(inner)  │
          │ Distinct Union Zip   │ Intersect Except     │
          │ Cast OfType Range    │ TakeLast Chunk       │
          ├──────────────────────┴──────────────────────┤
   즉시   │ First Count Any Sum Aggregate SequenceEqual │
          │ ToList ToArray ToDictionary ToLookup ...    │
          └─────────────────────────────────────────────┘

   "지연이니까 가볍다"는 직관은 왼쪽 위 칸에만 통한다.
   메모리를 볼 때는 지연 여부가 아니라 버퍼링 여부를 봐야 한다.
```

> **⚠️ "지연"은 "가볍다"는 뜻이 아니다**
>
> `OrderBy`가 지연 연산자라는 말은 **호출 시점에 아무 일도 하지 않는다**는 뜻일 뿐이다. `foreach`가 첫 원소를 요청하는 순간 원본 100만 개가 전부 배열로 복사되고 정렬된다(30.5절). 무한 시퀀스에 `OrderBy`·`Reverse`·`GroupBy`·`TakeLast`를 붙이면 예외도 없이 `OutOfMemoryException`이 날 때까지 메모리를 먹는다(30.1절).

### 쿼리 구문 대응 여부

세 번째 축이다. C#의 쿼리 식 키워드로 표현되는 연산자는 **소수**다. 다음 표가 전부다(30.1절, 29.4절).

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
| `into` (`select`·`group` 뒤) | 없음 | 쿼리 계속(query continuation) |

여기 없는 연산자 전부 — `Take`, `Skip`, `Distinct`, `Concat`, `Union`, `First`, `Count`, `Aggregate`, `Zip`, `Chunk` 등 — 는 **대응하는 키워드가 없다.** 쿼리 식으로 시작했더라도 이들을 쓰려면 괄호로 감싸고 점을 찍어야 한다(29.5절).

```csharp
var page = (from n in names
            where n.Length > 4
            orderby n
            select n)
           .Skip(20).Take(10);
```

> **📌 표의 "SQL 대응" 칸을 읽는 법**
>
> G.3~G.13의 SQL 칸은 EF Core가 **실제로 생성하는 SQL**이 아니다. "같은 일을 SQL로 직접 쓴다면 이렇게 쓸 것"이라는 뜻이다. 아예 번역이 불가능한 것은 "번역 없음"이라고 적었고, 그 목록은 G.15절에 모았다.

> **💡 이 부록을 읽는 순서**
>
> 처음에는 G.2의 마스터 표만 훑어라. 그 표 하나로 전체 지형이 잡힌다. 특정 연산자의 예외 조건이 필요하면 G.14, EF Core에서 터지는지 알고 싶으면 G.15, 성능이 의심스러우면 G.16, **하고 싶은 일은 아는데 연산자 이름이 기억나지 않으면 G.17**이다.

---

## G.2 마스터 표 — 표준 쿼리 연산자 전수

`System.Linq.Enumerable`이 제공하는 표준 쿼리 연산자 전부다. 이 표 하나로 전체를 훑을 수 있다. `※` 표시는 그 연산자가 추가된 .NET 버전이다.

| 연산자 | 분류 | 실행 | 메모리 | 쿼리 구문 | 하는 일 |
|---|---|---|---|---|---|
| `Where` | 필터링 | 지연 | 스트리밍 | `where` | 조건을 만족하는 원소만 통과시킨다 |
| `Take` | 필터링 | 지연 | 스트리밍 | — | 앞에서 n개만 |
| `Skip` | 필터링 | 지연 | 스트리밍 | — | 앞에서 n개를 버린다 |
| `TakeLast` | 필터링 | 지연 | 버퍼링(n개 큐) | — | 뒤에서 n개만 |
| `SkipLast` | 필터링 | 지연 | 버퍼링(n개 큐) | — | 뒤에서 n개를 버린다 |
| `TakeWhile` | 필터링 | 지연 | 스트리밍 | — | 조건이 처음 거짓이 되는 순간 끊는다 |
| `SkipWhile` | 필터링 | 지연 | 스트리밍 | — | 조건이 처음 거짓이 될 때까지 버린다 |
| `Distinct` | 필터링 | 지연 | 스트리밍(본 원소 집합) | — | 중복 제거 |
| `DistinctBy` ※.NET 6 | 필터링 | 지연 | 스트리밍(본 키 집합) | — | 키 기준 중복 제거 |
| `Select` | 투영 | 지연 | 스트리밍 | `select` | 원소당 정확히 하나로 변형 |
| `SelectMany` | 투영 | 지연 | 스트리밍 | 두 번째 이후의 `from` | 자식 시퀀스를 평탄화(0..n개) |
| `Join` | 조인 | 지연 | 버퍼링(안쪽 전체) | `join ... on ... equals ...` | 키가 같은 것끼리 평면 결합 |
| `GroupJoin` | 조인 | 지연 | 버퍼링(안쪽 전체) | `join ... into g` | 계층 결합, 기본이 왼쪽 외부 조인 |
| `Zip` | 조인 | 지연 | 스트리밍 | — | 같은 위치끼리 1:1 짝짓기 |
| `OrderBy` | 정렬 | 지연 | 버퍼링(입력 전체) | `orderby k` | 키 기준 오름차순 |
| `OrderByDescending` | 정렬 | 지연 | 버퍼링(입력 전체) | `orderby k descending` | 키 기준 내림차순 |
| `ThenBy` | 정렬 | 지연 | 버퍼링(입력 전체) | `orderby k1, k2` | 앞 정렬을 유지한 보조 정렬 |
| `ThenByDescending` | 정렬 | 지연 | 버퍼링(입력 전체) | `orderby k1, k2 descending` | 보조 내림차순 |
| `Order` ※.NET 7 | 정렬 | 지연 | 버퍼링(입력 전체) | — | 원소 자체 기준 오름차순 |
| `OrderDescending` ※.NET 7 | 정렬 | 지연 | 버퍼링(입력 전체) | — | 원소 자체 기준 내림차순 |
| `Reverse` | 정렬 | 지연 | 버퍼링(입력 전체) | — | 순서를 뒤집는다 |
| `GroupBy` | 그룹핑 | 지연 | **버퍼링(입력 전체)** | `group e by k` | 키로 부분 시퀀스를 만든다 |
| `Chunk` ※.NET 6 | 그룹핑 | 지연 | 버퍼링(청크 하나) | — | 고정 크기 배열로 자른다 |
| `Concat` | 집합 | 지연 | 스트리밍 | — | 이어 붙인다(중복 제거 없음) |
| `Union` | 집합 | 지연 | 스트리밍(본 원소) | — | 합집합 |
| `UnionBy` ※.NET 6 | 집합 | 지연 | 스트리밍(본 키) | — | 키 기준 합집합 |
| `Intersect` | 집합 | 지연 | 버퍼링(**두 번째** 전체) | — | 교집합 |
| `IntersectBy` ※.NET 6 | 집합 | 지연 | 버퍼링(두 번째의 키) | — | 키 기준 교집합 |
| `Except` | 집합 | 지연 | 버퍼링(**두 번째** 전체) | — | 차집합 |
| `ExceptBy` ※.NET 6 | 집합 | 지연 | 버퍼링(두 번째의 키) | — | 키 기준 차집합 |
| `Append` | 집합 | 지연 | 스트리밍 | — | 원소 하나를 뒤에 붙인다 |
| `Prepend` | 집합 | 지연 | 스트리밍 | — | 원소 하나를 앞에 붙인다 |
| `OfType<T>` | 변환 | 지연 | 스트리밍 | — | 타입이 안 맞는 원소를 **버린다** |
| `Cast<T>` | 변환 | 지연 | 스트리밍 | `from T x in xs` | 타입이 안 맞으면 **예외** |
| `ToArray` | 변환 | **즉시** | 결과 전체 | — | `T[]`로 실체화 |
| `ToList` | 변환 | **즉시** | 결과 전체 | — | `List<T>`로 실체화 |
| `ToDictionary` | 변환 | **즉시** | 결과 전체 | — | 키가 유일해야 한다 |
| `ToHashSet` | 변환 | **즉시** | 결과 전체 | — | 중복 제거하며 실체화 |
| `ToLookup` | 변환 | **즉시** | 결과 전체 | — | 키 하나에 여러 원소 허용 |
| `AsEnumerable` | 변환 | 없음 | 없음 | — | 정적 타입만 `IEnumerable<T>`로 |
| `AsQueryable` | 변환 | 없음 | 없음 | — | 캐스트 또는 `IQueryable<T>` 래핑 |
| `First` / `FirstOrDefault` | 요소 | **즉시** | 없음 | — | 첫 원소(조건자 선택 가능) |
| `Last` / `LastOrDefault` | 요소 | **즉시** | 없음 | — | 마지막 원소(조건자 선택 가능) |
| `Single` / `SingleOrDefault` | 요소 | **즉시** | 없음 | — | 정확히 하나여야 한다 |
| `ElementAt` / `ElementAtOrDefault` | 요소 | **즉시** | 없음 | — | 지정 위치의 원소 |
| `MinBy` / `MaxBy` ※.NET 6 | 요소 | **즉시** | 없음 | — | 키가 최소·최대인 **원소** |
| `DefaultIfEmpty` | 요소(반환은 시퀀스) | 지연 | 스트리밍 | — | 비었으면 기본값 하나짜리 시퀀스 |
| `Count` / `LongCount` | 집계 | **즉시** | 없음 | — | 원소 수 |
| `TryGetNonEnumeratedCount` ※.NET 6 | 집계 | **즉시** | 없음 | — | 열거하지 않고 셀 수 있을 때만 센다 |
| `Sum` | 집계 | **즉시** | 없음 | — | 합 |
| `Average` | 집계 | **즉시** | 없음 | — | 평균 |
| `Min` / `Max` | 집계 | **즉시** | 없음 | — | 최소·최대 **값** |
| `Aggregate` | 집계 | **즉시** | 없음 | — | 사용자 정의 누산 |
| `CountBy` ※.NET 9 | 집계 | 지연 | 버퍼링(키별 누산) | — | 그룹 리스트 없이 키별 개수 |
| `AggregateBy` ※.NET 9 | 집계 | 지연 | 버퍼링(키별 누산) | — | 그룹 리스트 없이 키별 누산 |
| `Contains` | 한정자 | **즉시** | 없음 | — | 주어진 원소가 있는가 |
| `Any` | 한정자 | **즉시** | 없음 | — | 조건을 만족하는 원소가 하나라도 있는가 |
| `All` | 한정자 | **즉시** | 없음 | — | 모든 원소가 조건을 만족하는가 |
| `SequenceEqual` | 한정자 | **즉시** | 없음 | — | 같은 원소를 같은 순서로 갖는가 |
| `Empty<T>` | 생성 | 해당 없음 | 없음 | — | 캐시된 싱글턴 빈 시퀀스 |
| `Range` | 생성 | 지연 | 스트리밍 | — | `start`부터 `count`개의 `int` |
| `Repeat<T>` | 생성 | 지연 | 스트리밍 | — | 같은 원소를 `count`번 |

> **📌 생성 연산자는 확장 메서드가 아니다**
>
> `Empty`, `Range`, `Repeat`는 입력 시퀀스가 없으므로 `Enumerable` 클래스의 **평범한 정적 메서드**다. `Enumerable.Range(...)`처럼 클래스 이름을 붙여 호출한다(30.12절).

> **⚠️ `DefaultIfEmpty`는 요소 연산자가 아니다**
>
> 30.9절이 요소 연산자 절에서 설명하지만 **반환 타입은 `IEnumerable<TSource>`다.** 이름과 배치 때문에 원소 하나를 돌려준다고 착각하기 쉽다. 실제로는 지연 실행 시퀀스 연산자이며, 그 성질 덕분에 평면 외부 조인의 부품이 된다(30.3절, 30.4절).

---

## G.3 필터링

`IEnumerable<TSource>` → `IEnumerable<TSource>`. 원소를 골라내되 **변형하지 않는다.** 출력 원소 수는 입력보다 많아질 수 없다(30.2절).

### 주요 시그니처

```csharp
public static IEnumerable<TSource> Where<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);
public static IEnumerable<TSource> Where<TSource>(
    this IEnumerable<TSource> source, Func<TSource, int, bool> predicate);

public static IEnumerable<TSource> Take<TSource>(
    this IEnumerable<TSource> source, int count);
public static IEnumerable<TSource> Take<TSource>(
    this IEnumerable<TSource> source, Range range);          // ※.NET 6

public static IEnumerable<TSource> Skip<TSource>(
    this IEnumerable<TSource> source, int count);

public static IEnumerable<TSource> TakeWhile<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);

public static IEnumerable<TSource> Distinct<TSource>(
    this IEnumerable<TSource> source, IEqualityComparer<TSource>? comparer);

public static IEnumerable<TSource> DistinctBy<TSource, TKey>(  // ※.NET 6
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);
```

### 동작표

| 연산자 | 반환 타입 | 빈 시퀀스일 때 | 던지는 예외 | SQL 대응 |
|---|---|---|---|---|
| `Where` | `IEnumerable<T>` | 빈 시퀀스 | `source`·`predicate`가 `null`이면 `ArgumentNullException` | `WHERE` |
| `Take` | `IEnumerable<T>` | 빈 시퀀스 | 없음 — 0·음수도 조용히 빈 시퀀스 | `TOP n` · `ROW_NUMBER()` |
| `Skip` | `IEnumerable<T>` | 빈 시퀀스 | 없음 — 0·음수는 원본 전체 | `OFFSET` · `ROW_NUMBER()` |
| `TakeLast` / `SkipLast` | `IEnumerable<T>` | 빈 시퀀스 | 없음 | 번역 없음 |
| `TakeWhile` / `SkipWhile` | `IEnumerable<T>` | 빈 시퀀스 | 없음 | 번역 없음 |
| `Distinct` | `IEnumerable<T>` | 빈 시퀀스 | 없음 | `SELECT DISTINCT` |
| `DistinctBy` ※.NET 6 | `IEnumerable<T>` | 빈 시퀀스 | 없음 | 번역 없음 |

`Take`의 `Range` 오버로드 하나가 나머지 셋의 기능을 흡수한다(30.2절).

| 표현 | 같은 뜻 |
|---|---|
| `Take(5)` | 앞에서 5개 |
| `Take(5..)` | `Skip(5)` |
| `Take(..^5)` | `SkipLast(5)` |
| `Take(^5..)` | `TakeLast(5)` |
| `Take(2..7)` | `Skip(2).Take(5)` |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| `OrderBy` 없는 `Skip`/`Take` 페이징 | 공급자가 순서를 보장하지 않아 항목이 중복되거나 사라진다 | 페이징 앞에 반드시 정렬(30.2절) |
| `TakeWhile`을 `Where`처럼 씀 | 조건이 처음 거짓이 되는 순간 끊긴다 — 뒤의 매칭을 못 본다 | 정렬된 시퀀스에서만 쓴다 |
| 인덱스 오버로드의 `i`를 원본 위치로 오해 | `i`는 **그 연산자가 받는 시퀀스**에서의 위치다 | 체인 맨 앞에서만 쓴다 |
| 인덱스 오버로드를 EF Core에서 사용 | 번역 불가로 런타임 예외 | `AsEnumerable()`로 경계를 긋는다(31.5절) |
| 참조 타입에 `Distinct` | `Equals`/`GetHashCode` 미재정의면 참조 비교라 중복이 안 지워진다 | 25.3절·25.4절의 동등성 계약, 또는 레코드(19장) |
| `DistinctBy`가 남기는 원소를 오해 | 각 키 그룹의 **첫 번째**가 남는다 | 최신 것이 필요하면 앞에 내림차순 정렬 |
| 중복이 거의 없는 큰 시퀀스에 `Distinct` | 원소 수만큼의 해시 집합이 힙에 생긴다 | 필요한지 다시 검토 |
| `Take(-3)`로 잘못된 페이지 번호가 통과 | 예외 없이 빈 시퀀스 | 페이지 번호는 별도로 검증 |

> **⚠️ `TakeWhile`은 `Where`가 아니다**
>
> `{3,5,2,234,4,1}.Where(n => n < 100)`은 `{3,5,2,4,1}`이고 `TakeWhile(n => n < 100)`은 `{3,5,2}`다. **정렬되지 않은 시퀀스에 `TakeWhile`을 쓰면 거의 항상 버그다.** 반대로 정렬된 시퀀스에서는 조기 종료가 되어 `Where`보다 훨씬 싸다(30.2절).

---

## G.4 투영

`IEnumerable<TSource>` → `IEnumerable<TResult>`. 원소를 변형한다(30.3절).

### 주요 시그니처

```csharp
public static IEnumerable<TResult> Select<TSource, TResult>(
    this IEnumerable<TSource> source, Func<TSource, TResult> selector);
public static IEnumerable<TResult> Select<TSource, TResult>(
    this IEnumerable<TSource> source, Func<TSource, int, TResult> selector);

public static IEnumerable<TResult> SelectMany<TSource, TResult>(
    this IEnumerable<TSource> source,
    Func<TSource, IEnumerable<TResult>> selector);

// 컴파일러가 쿼리 구문 번역에 쓰는 3인자 오버로드
public static IEnumerable<TResult> SelectMany<TSource, TCollection, TResult>(
    this IEnumerable<TSource> source,
    Func<TSource, IEnumerable<TCollection>> collectionSelector,
    Func<TSource, TCollection, TResult> resultSelector);
```

### 동작표

| 연산자 | 반환 타입 | 입력 1개당 출력 | 빈 시퀀스일 때 | 던지는 예외 | SQL 대응 |
|---|---|---|---|---|---|
| `Select` | `IEnumerable<TResult>` | 정확히 1개 | 빈 시퀀스 | 선택자가 던지는 것만(열거 시점) | `SELECT` |
| `SelectMany` | `IEnumerable<TResult>` | 0..n개 | 빈 시퀀스 | 선택자가 `null`을 돌려주면 **열거 시점**에 `NullReferenceException` | `INNER JOIN`, `LEFT OUTER JOIN`, `CROSS JOIN` |

`SelectMany`가 쓰이는 방식은 실질적으로 둘뿐이다(30.3절).

| 패턴 | 추가 생성기의 식 | 결과 |
|---|---|---|
| 자식 시퀀스 펼치기 | 기존 범위 변수에 의존 (`c.Purchases`) | 계층을 평면화 |
| 데카르트 곱(교차 조인) | 기존 범위 변수와 무관 | 모든 조합, 필터를 걸면 곧 조인 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 로컬 컬렉션의 등가 조인에 `SelectMany` | O(n×m) — 고객 1,000명 × 구매 10,000건이면 비교 1,000만 번 | `Join`을 쓴다(30.4절) |
| `Select` 안의 서브쿼리를 여러 번 열거 | 지연이 두 겹이라 안쪽 소스 접근이 반복된다 | 실체화하거나 한 번만 열거(29.7절) |
| `DefaultIfEmpty` 뒤에 `where` | 끼워 넣은 `null` 행까지 걸러져 다시 내부 조인이 된다 | 필터를 `DefaultIfEmpty` **앞**에 서브쿼리로 |
| 평면 외부 조인을 로컬로 실행 | `p.Description`에서 `NullReferenceException` (EF Core에서는 정상 동작) | 널 검사를 명시 |
| 인덱스 오버로드를 EF Core에서 사용 | 번역 불가로 런타임 예외 | 31.5절 |
| `let`·다중 `from`·`join`의 익명 타입 | 원소마다 힙 할당 하나 | G.16절, 30.14절 |
| `null`이 섞인 배열의 배열을 평탄화 | `SelectMany(a => a)`가 `NullReferenceException` | `a ?? Enumerable.Empty<T>()`(30.12절) |

> **📌 두 번째 이후의 `from`은 `SelectMany`다**
>
> 30장에서 반드시 기억해야 할 대응 하나를 꼽으라면 이것이다. 쿼리 **맨 앞**의 `from`은 어떤 연산자로도 번역되지 않고, 그 **뒤의 모든** `from`은 `SelectMany`로 번역된다. 이 번역이 다중 범위 변수와 투명 식별자를 만들어 낸다(29.3절, 30.3절).

---

## G.5 조인

시퀀스 둘을 하나로 엮는다(30.4절).

### 주요 시그니처

```csharp
public static IEnumerable<TResult> Join<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, TInner, TResult> resultSelector);

public static IEnumerable<TResult> GroupJoin<TOuter, TInner, TKey, TResult>(
    this IEnumerable<TOuter> outer,
    IEnumerable<TInner> inner,
    Func<TOuter, TKey> outerKeySelector,
    Func<TInner, TKey> innerKeySelector,
    Func<TOuter, IEnumerable<TInner>, TResult> resultSelector);

public static IEnumerable<TResult> Zip<TFirst, TSecond, TResult>(
    this IEnumerable<TFirst> first, IEnumerable<TSecond> second,
    Func<TFirst, TSecond, TResult> resultSelector);

public static IEnumerable<(TFirst, TSecond)> Zip<TFirst, TSecond>(   // ※.NET Core 3.0
    this IEnumerable<TFirst> first, IEnumerable<TSecond> second);
```

`Zip`에는 세 시퀀스를 받는 오버로드도 있다(※.NET 6).

### 동작표

| 연산자 | 반환 타입 | 결과 모양 | 빈 시퀀스일 때 | 매칭 없는 바깥 원소 | SQL 대응 |
|---|---|---|---|---|---|
| `Join` | `IEnumerable<TResult>` | 평면 | 어느 쪽이 비어도 빈 결과 | 결과에서 사라진다(내부 조인) | `INNER JOIN` |
| `GroupJoin` | `IEnumerable<TResult>` | 계층 | 바깥이 비면 빈 결과 | **빈 시퀀스와 짝지어져 남는다** | `INNER JOIN`, `LEFT OUTER JOIN` |
| `Zip` | `IEnumerable<TResult>` | 평면(1:1) | 어느 쪽이 비어도 빈 결과 | 해당 없음 | 번역 없음 |

세 연산자 모두 인자가 `null`이면 `ArgumentNullException`이 나고, 그 밖의 예외는 결과 선택자·키 선택자가 던지는 것뿐이다. 룩업은 **호출 시점이 아니라 열거를 시작하는 시점**에 만들어진다.

### `Join`과 `Zip`

| 항목 | `Join` | `Zip` |
|---|---|---|
| 짝짓기 기준 | 키가 같은가 | 위치가 같은가 |
| 안팎 비대칭 | 있다(`TOuter`/`TInner`) | 없다(`TFirst`/`TSecond`) |
| 한쪽이 여러 개와 매칭 | 가능(1:n) | 불가(항상 1:1) |
| 버퍼링 | 안쪽 전체 | 없음 |
| 출력 개수 | 매칭 조합 수 | **짧은 쪽의 길이** |
| EF Core | 번역됨 | 번역 안 됨 |

### 조인 전략 비교

| 전략 | 결과 모양 | 로컬 쿼리 효율 | 내부 조인 | 외부 조인 |
|---|---|---|---|---|
| `Select` + `SelectMany` | 평면 | 나쁨 | 가능 | 가능 |
| `Select` + `Select` | 계층 | 나쁨 | 가능 | 가능 |
| `Join` | 평면 | 좋음 | 가능 | 불가 |
| `GroupJoin` | 계층 | 좋음 | 가능 | 가능 |
| `GroupJoin` + `SelectMany` | 평면 | 좋음 | 가능 | 가능 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 큰 쪽을 안쪽 시퀀스에 둠 | 안쪽 전체가 룩업으로 힙에 올라간다 | 내부 조인은 대칭이니 **작은 쪽을 안쪽**에 |
| 다중 키 조인의 익명 타입 불일치 | 프로퍼티 이름·타입·순서가 다르면 "형식을 유추할 수 없다" | 양쪽을 글자 단위로 맞춘다 |
| `into`의 두 가지 의미 혼동 | `join` 뒤는 `GroupJoin`, `select`·`group` 뒤는 쿼리 계속 | 29.9절 |
| `into` 뒤의 `where`가 개별 원소에 걸린다고 오해 | 대상은 원소가 아니라 **부분 시퀀스**다 | 개별 필터는 조인 **전에** |
| `Zip`에서 길이가 다른 시퀀스 | 짧은 쪽에서 멈추고 나머지는 **조용히** 버려진다 | `Zip` 전에 개수를 검증 |
| `ILookup` 인덱서를 `Dictionary`처럼 취급 | 없는 키에 예외가 아니라 **빈 시퀀스**를 돌려준다 | 이 성질이 곧 왼쪽 외부 조인의 근거다 |
| EF Core에서 `Join`이 빠를 것이라 기대 | 조인 알고리즘은 데이터베이스 옵티마이저가 고른다 | 유연성이 필요하면 `Select`/`SelectMany` |

---

## G.6 정렬

`IEnumerable<TSource>` → `IOrderedEnumerable<TSource>`. 같은 원소를 다른 순서로 돌려준다(30.5절).

### 주요 시그니처

```csharp
public static IOrderedEnumerable<TSource> OrderBy<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);
public static IOrderedEnumerable<TSource> OrderBy<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
    IComparer<TKey>? comparer);

public static IOrderedEnumerable<TSource> ThenBy<TSource, TKey>(
    this IOrderedEnumerable<TSource> source, Func<TSource, TKey> keySelector);

public static IEnumerable<TSource> Reverse<TSource>(
    this IEnumerable<TSource> source);
```

`ThenBy`의 첫 인자가 `IEnumerable<TSource>`가 아니라 **`IOrderedEnumerable<TSource>`** 인 것이 핵심이다. 이 타입 차이가 "앞의 정렬을 대체하지 말고 정제하라"는 의미를 타입 시스템에 새긴다.

### 동작표

| 연산자 | 반환 타입 | 빈 시퀀스일 때 | 던지는 예외 | SQL 대응 |
|---|---|---|---|---|
| `OrderBy` / `OrderByDescending` | `IOrderedEnumerable<T>` | 빈 시퀀스 | 키가 비교 불가면 열거 시점에 `InvalidOperationException` | `ORDER BY [DESC]` |
| `ThenBy` / `ThenByDescending` | `IOrderedEnumerable<T>` | 빈 시퀀스 | 위와 같음 | `ORDER BY k1, k2` |
| `Order` / `OrderDescending` ※.NET 7 | `IOrderedEnumerable<T>` | 빈 시퀀스 | 원소가 `IComparable`이 아니면 열거 시점에 `InvalidOperationException` | `ORDER BY [DESC]` |
| `Reverse` | `IEnumerable<T>` | 빈 시퀀스 | 없음 | 번역 없음 |

### 정렬의 비용 구조

첫 원소를 요청받는 순간 일어나는 일이다(30.5절).

| 비용 항목 | 크기 |
|---|---|
| 원소 버퍼 | 원소 수 × 참조 크기(또는 값 크기) |
| 키 배열 | 원소 수 × 키 크기 |
| 인덱스 배열 | 원소 수 × 4바이트 |
| 키 선택자 호출 | 원소당 **정확히 1회** |
| 비교 횟수 | 평균 O(n log n) |

키 선택자가 원소당 한 번만 호출된다는 점이 중요하다. 키 계산이 비싸도 O(n log n)번이 아니라 n번만 호출된다.

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| `orderby`를 두 번 씀 | `ThenBy`가 아니라 또 다른 `OrderBy`로 번역되어 **앞 정렬이 대체된다** | 쉼표를 쓰거나 `ThenBy` |
| 안정 정렬 보장에 기댐 | LINQ to Objects에 한정된 보장이다. SQL의 `ORDER BY`는 동률 순서를 보장하지 않는다 | 페이징에는 동률이 사라질 때까지 `ThenBy` |
| `Array.Sort`/`List<T>.Sort`도 안정적이라 가정 | 인트로소트 기반이라 **불안정 정렬**이다(24.3절) | "정렬은 다 안정적"이라고 뭉뚱그리지 않는다 |
| `Order()`를 비교 불가 타입에 사용 | 컴파일은 되고 열거 시점에 `InvalidOperationException` | `IComparable<T>` 구현 또는 비교자 오버로드(25.6절, 25.7절) |
| 쿼리 구문으로 비교자를 넘기려 함 | `orderby` 절에는 비교자 문법이 없다 | 그 부분만 플루언트 구문으로 |
| EF Core에서 비교자 오버로드 사용 | 쓸 수 없다. 비교 규칙은 컬럼의 콜레이션이 정한다 | 키 선택자에서 `ToUpper()` 등 |
| `var` 정렬 쿼리에 `Where` 재할당 | 추론 타입이 `IOrderedEnumerable<T>`라 컴파일 오류 | 명시적 타입 또는 `AsEnumerable()` |
| `List<T>` 변수에 `.Reverse()` | **인스턴스 메서드가 우선 선택되어 원본이 제자리에서 파괴된다** | `((IEnumerable<T>)list).Reverse()` |
| 상위 k개만 필요한데 전체 정렬 | O(n log n) + 전체 버퍼링 | `MinBy`/`MaxBy`, 또는 크기 k 힙(측정 후에)(67장) |

> **⚠️ `Reverse()`와 `List<T>.Reverse()`는 다른 메서드다**
>
> `List<T>`에는 자기 자신을 제자리에서 뒤집는 `Reverse()` 인스턴스 메서드가 있고 반환값이 `void`다. 확장 메서드보다 인스턴스 메서드가 우선한다는 규칙(29.1절)의 대표적 사고 사례다(30.5절).

---

## G.7 그룹핑

시퀀스를 부분 시퀀스로 나눈다(30.6절).

### 주요 시그니처

```csharp
public static IEnumerable<IGrouping<TKey, TSource>> GroupBy<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);

public static IEnumerable<IGrouping<TKey, TElement>> GroupBy<TSource, TKey, TElement>(
    this IEnumerable<TSource> source,
    Func<TSource, TKey> keySelector,
    Func<TSource, TElement> elementSelector);

public static IEnumerable<TSource[]> Chunk<TSource>(     // ※.NET 6
    this IEnumerable<TSource> source, int size);
```

`GroupBy`에는 결과 선택자 `(TKey, IEnumerable<TElement>) => TResult`와 비교자 `IEqualityComparer<TKey>`를 받는 오버로드도 있다.

```csharp
public interface IGrouping<TKey, TElement> : IEnumerable<TElement>, IEnumerable
{
    TKey Key { get; }      // 부분 시퀀스 전체에 적용되는 키
}
```

### 동작표

| 연산자 | 반환 타입 | 빈 시퀀스일 때 | 던지는 예외 | SQL 대응 |
|---|---|---|---|---|
| `GroupBy` | `IEnumerable<IGrouping<TKey,TElement>>` | 빈 시퀀스(그룹 0개) | 선택자가 던지는 것만 | `GROUP BY` |
| `Chunk` ※.NET 6 | `IEnumerable<TSource[]>` | 빈 시퀀스(청크 0개) | `size <= 0`이면 **호출 시점**에 `ArgumentOutOfRangeException` | 번역 없음 |

### `GroupBy`와 `Chunk`

| 항목 | `GroupBy` | `Chunk` ※.NET 6 |
|---|---|---|
| 나누는 기준 | 키의 동등성 | 위치(고정 개수) |
| 출력 원소 타입 | `IGrouping<TKey,TElement>` | `TElement[]` |
| 키 | 있다 | 없다 |
| 버퍼링 | **입력 전체** | 청크 하나 크기 |
| 무한 시퀀스 | 불가 | 가능 |
| 원소 순서 | 보존 | 보존 |
| 마지막 조각 | 해당 없음 | 원소가 부족하면 그만큼만 담긴다 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 그룹이 정렬되어 나올 것이라 기대 | `GroupBy`는 그룹핑만 한다. 그룹 순서는 **키가 처음 등장한 순서** | `OrderBy(g => g.Key)`를 붙인다 |
| 무한 시퀀스·거대 스트림에 `GroupBy` | 첫 원소를 얻는 순간 입력 전체가 힙에 올라간다 | 딕셔너리 직접 갱신, `CountBy`/`AggregateBy`(※.NET 9) |
| 여러 절에서 `g.Count()` 호출 | 부를 때마다 그룹을 다시 열거한다 | `let n = g.Count()`로 한 번만 |
| `group by` 뒤의 `where`를 원소 필터로 오해 | SQL의 `HAVING`이다 — 부분 시퀀스 전체에 걸린다 | 개별 원소 필터는 `group` **앞**에 |
| EF Core에서 집계 없는 `group by` | SQL로 번역할 수 없다 | 그룹핑 직전에 `.AsEnumerable()`(31.5절) |
| 뜨거운 경로에서 `Chunk` | 청크마다 **새 배열**을 할당한다(100만 개/크기 10이면 배열 10만 개) | 배치 크기를 키우거나 직접 버퍼 재사용 |
| `GroupBy` 뒤에 집계만 오는 코드 | 쓰지도 않을 그룹 리스트를 전부 만든다 | G.16절 |

> **💡 `Chunk`는 배치 처리의 표준 도구다**
>
> "1,000건씩 끊어서 API에 보낸다", "한 트랜잭션에 500행씩 삽입한다"가 한 줄로 끝난다. .NET 6 이전의 관용구 `Select((x,i) => new { x, i }).GroupBy(v => v.i / size)`는 **입력 전체를 버퍼링**한다는 치명적 차이가 있었다(30.6절).

---

## G.8 집합 연산

같은 타입의 시퀀스 둘을 받아 합·교집합·차집합을 돌려준다(30.7절).

### 주요 시그니처

```csharp
public static IEnumerable<TSource> Concat<TSource>(
    this IEnumerable<TSource> first, IEnumerable<TSource> second);

public static IEnumerable<TSource> Union<TSource>(
    this IEnumerable<TSource> first, IEnumerable<TSource> second,
    IEqualityComparer<TSource>? comparer);

public static IEnumerable<TSource> UnionBy<TSource, TKey>(      // ※.NET 6
    this IEnumerable<TSource> first,
    IEnumerable<TSource> second,           // ← TSource
    Func<TSource, TKey> keySelector);

public static IEnumerable<TSource> IntersectBy<TSource, TKey>(  // ※.NET 6
    this IEnumerable<TSource> first,
    IEnumerable<TKey> second,              // ← TKey
    Func<TSource, TKey> keySelector);

public static IEnumerable<TSource> ExceptBy<TSource, TKey>(     // ※.NET 6
    this IEnumerable<TSource> first,
    IEnumerable<TKey> second,              // ← TKey
    Func<TSource, TKey> keySelector);

public static IEnumerable<TSource> Append<TSource>(
    this IEnumerable<TSource> source, TSource element);
```

### 동작표

| 연산자 | 반환 타입 | 중복 제거 | 빈 시퀀스일 때 | 버퍼링 | SQL 대응 |
|---|---|---|---|---|---|
| `Concat` | `IEnumerable<T>` | **하지 않음** | 둘 다 비면 빈 시퀀스 | 없음 | `UNION ALL` |
| `Union` / `UnionBy` ※.NET 6 | `IEnumerable<T>` | 함 | 둘 다 비면 빈 시퀀스 | 지금까지 본 원소·키 | `UNION` |
| `Intersect` / `IntersectBy` ※.NET 6 | `IEnumerable<T>` | 함 | 어느 쪽이든 비면 빈 시퀀스 | **두 번째** 전체 | `WHERE ... IN (...)` |
| `Except` / `ExceptBy` ※.NET 6 | `IEnumerable<T>` | 함 | 첫 번째가 비면 빈 시퀀스 | **두 번째** 전체 | `EXCEPT`, `NOT IN (...)` |
| `Append` / `Prepend` | `IEnumerable<T>` | 하지 않음 | 원소 1개짜리 시퀀스 | 없음 | — |

예외는 인자가 `null`일 때의 `ArgumentNullException`뿐이다. 잘못된 결과는 예외가 아니라 **조용한 오답**으로 나타난다.

### 기본 동등성

집합 연산자와 `Distinct`, `GroupBy`, `ToDictionary`, `ToLookup`, `Contains`, `SequenceEqual`은 전부 `IEqualityComparer<T>` 오버로드를 갖고, 없으면 `EqualityComparer<T>.Default`를 쓴다(30.7절).

| 원소 타입 | 기본 동등성 |
|---|---|
| `int`, `double`, `DateTime` 등 값 타입 | 값 비교 |
| `string` | 서수(ordinal) 비교 — 문화권 무관, 대소문자 구분 |
| 레코드 | 프로퍼티 값 비교(19장) |
| 익명 타입 | 프로퍼티 값 비교 |
| `Equals`를 재정의하지 않은 클래스 | **참조 비교** |
| `IEquatable<T>` 구현 타입 | `Equals(T)` 호출 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 결과에 중복이 남을 것이라 기대 | `{1,1,2}.Except({3})`는 `{1,1,2}`가 아니라 `{1,2}`다 | 중복 유지가 필요하면 `HashSet<T>` + `Where` |
| `GetHashCode` 미재정의 | 같은 값이 다른 버킷에 들어가 **중복이 제거되지 않는다.** 예외도 경고도 없다 | 25.3절·25.4절 |
| 문자열에 문화권 인식 기대 | 기본은 서수 비교다 | `StringComparer.OrdinalIgnoreCase` 등을 명시(8장) |
| 큰 쪽을 두 번째 자리에 둠 | `Intersect`/`Except`가 두 번째를 통째로 실체화한다 | 작은 쪽을 두 번째로, 또는 `ToHashSet()`으로 고정 |
| 결과를 두 번 열거 | 두 번째 시퀀스도 두 번 읽힌다. 매번 다른 결과를 내는 쿼리면 답이 달라진다 | `ToHashSet()`으로 고정(29.7절) |
| `a.Except(b)`와 `b.Except(a)`를 혼동 | `Except`는 비대칭이다 | 방향을 명시적으로 확인 |
| `IntersectBy`/`ExceptBy`에 원소 시퀀스를 넘김 | 두 번째 인자는 **키의 시퀀스**다(`UnionBy`만 `TSource`) | `people.ExceptBy(bannedIds, p => p.Id)` |
| 루프 안에서 `Append` 반복 | 데코레이터가 원소 수만큼 쌓여 열거가 O(n²) | `List<T>`를 쓴다 |

---

## G.9 변환

시퀀스와 다른 컬렉션 형태 사이를 오간다(30.8절).

### 주요 시그니처

```csharp
public static IEnumerable<TResult> OfType<TResult>(this IEnumerable source);
public static IEnumerable<TResult> Cast<TResult>(this IEnumerable source);

public static TSource[]      ToArray<TSource>(this IEnumerable<TSource> source);
public static List<TSource>  ToList<TSource>(this IEnumerable<TSource> source);
public static HashSet<TSource> ToHashSet<TSource>(this IEnumerable<TSource> source);

public static Dictionary<TKey, TSource> ToDictionary<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector)
    where TKey : notnull;

public static ILookup<TKey, TSource> ToLookup<TSource, TKey>(
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);

public static IEnumerable<TSource> AsEnumerable<TSource>(
    this IEnumerable<TSource> source);
```

### 동작표

| 연산자 | 반환 타입 | 실행 | 빈 시퀀스일 때 | 던지는 예외 |
|---|---|---|---|---|
| `OfType<T>` | `IEnumerable<T>` | 지연 | 빈 시퀀스 | 없음 — 안 맞는 원소는 **건너뛴다** |
| `Cast<T>` | `IEnumerable<T>` | 지연 | 빈 시퀀스 | **열거 시점**에 `InvalidCastException` |
| `ToArray` | `T[]` | 즉시 | 길이 0 배열 | 없음 |
| `ToList` | `List<T>` | 즉시 | 빈 리스트 | 없음 |
| `ToHashSet` | `HashSet<T>` | 즉시 | 빈 집합 | 없음 |
| `ToDictionary` | `Dictionary<TKey,TValue>` | 즉시 | 빈 딕셔너리 | 키 중복 시 `ArgumentException`, 키가 `null`이면 `ArgumentNullException` |
| `ToLookup` | `ILookup<TKey,TElement>` | 즉시 | 빈 룩업 | 없음 — 중복 키를 허용한다 |
| `AsEnumerable` | `IEnumerable<T>` | 없음 | 그대로 | 없음 |
| `AsQueryable` | `IQueryable<T>` | 없음 | 그대로 | 없음 |

### `To`와 `As`

| 접두사 | 하는 일 | 비용 | 예 |
|---|---|---|---|
| `To...` | 새 컬렉션에 원소를 **복사한다** | 즉시 실행 + 컬렉션 할당 | `ToArray`, `ToList`, `ToDictionary`, `ToHashSet`, `ToLookup` |
| `As...` | 정적 **타입만 바꾼다** | 0 | `AsEnumerable`, `AsQueryable` |

이 규칙 하나로 LINQ 코드의 비용을 대략 읽을 수 있다(30.8절).

### 실체화 대상 고르기

| 대상 | 언제 쓰나 |
|---|---|
| `ToArray` | 크기가 고정된 결과, 인덱스 접근, API 계약 |
| `ToList` | 나중에 원소를 더할 예정, 가장 흔한 기본값 |
| `ToHashSet` | 이후 `Contains` 조회를 반복할 때 |
| `ToDictionary` | 키로 조회하고, **키의 유일성을 런타임에 검증**하고 싶을 때 |
| `ToLookup` | 키 하나에 값이 여럿인 것이 정상일 때 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| `Cast<long>()`으로 `int` 시퀀스 변환 | `object`→`long` **언박싱**이라 `InvalidCastException` | `Select(s => (long)s)` |
| `OfType<long>()`으로 `int` 시퀀스 변환 | `element is long`이 `false`라 **결과가 빈 시퀀스** | 위와 같음 |
| `Cast`의 예외 위치를 오해 | 호출 줄이 아니라 열거 시점에 터진다. 스택 트레이스에 원인 줄이 없다 | 28.6절 |
| `Cast<T>()`를 스냅숏으로 오해 | 입력이 이미 `IEnumerable<T>`면 **입력 그 자체를 반환**할 수 있다 | 스냅숏이 필요하면 `ToList()` |
| 중복 키를 피하려 `ToLookup`으로 도피 | 도메인 불변식의 런타임 검증을 잃는다 | 유일해야 하면 `ToDictionary`(30.13절) |
| `AsEnumerable`을 실체화로 오해 | 캐스팅일 뿐이고 여전히 지연이다 | 실체화는 `ToList`/`ToArray` |
| `AsEnumerable()`을 필터 **앞**에 둠 | 테이블 전체를 네트워크로 끌어온다 | 서버가 할 수 있는 일은 전부 경계 위로(31.5절) |

> **⚠️ `ToDictionary`가 던지는 예외 두 가지**
>
> 키 선택자가 같은 키를 두 번 내면 `ArgumentException`, `null`을 내면 `ArgumentNullException`이다. 둘 다 즉시 실행 도중에 난다. 예외 메시지에 어떤 **키**가 중복인지는 나오지만 어떤 **원소**가 중복인지는 나오지 않는다(30.8절).

---

## G.10 요소

`IEnumerable<TSource>` → `TSource`. 원소 하나를 고른다. `DefaultIfEmpty`만 빼고 전부 즉시 실행이다(30.9절).

### 주요 시그니처

```csharp
public static TSource First<TSource>(this IEnumerable<TSource> source);
public static TSource First<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);

public static TSource? FirstOrDefault<TSource>(this IEnumerable<TSource> source);
public static TSource FirstOrDefault<TSource>(
    this IEnumerable<TSource> source, TSource defaultValue);      // ※.NET 6

public static TSource ElementAt<TSource>(this IEnumerable<TSource> source, int index);
public static TSource ElementAt<TSource>(this IEnumerable<TSource> source, Index index); // ※.NET 6

public static TSource? MaxBy<TSource, TKey>(                      // ※.NET 6
    this IEnumerable<TSource> source, Func<TSource, TKey> keySelector);

public static IEnumerable<TSource?> DefaultIfEmpty<TSource>(
    this IEnumerable<TSource> source);
public static IEnumerable<TSource> DefaultIfEmpty<TSource>(
    this IEnumerable<TSource> source, TSource defaultValue);
```

기본값 오버로드(※.NET 6)는 `FirstOrDefault`, `LastOrDefault`, `SingleOrDefault`에 모두 있다.

### 동작표

| 연산자 | 반환 타입 | 빈 시퀀스·매칭 없음 | 매칭 2개 이상 | 던지는 예외 | SQL 대응 |
|---|---|---|---|---|---|
| `First` | `TSource` | 예외 | 첫 번째 | `InvalidOperationException` | `SELECT TOP 1 ... ORDER BY` |
| `FirstOrDefault` | `TSource?` | `default` | 첫 번째 | 없음 | 위와 같음 |
| `Last` | `TSource` | 예외 | 마지막 | `InvalidOperationException` | `SELECT TOP 1 ... ORDER BY ... DESC` |
| `LastOrDefault` | `TSource?` | `default` | 마지막 | 없음 | 위와 같음 |
| `Single` | `TSource` | 예외 | **예외** | `InvalidOperationException` | — |
| `SingleOrDefault` | `TSource?` | `default` | **예외** | `InvalidOperationException` | — |
| `ElementAt` | `TSource` | 예외 | 해당 없음 | `ArgumentOutOfRangeException` | 번역 없음 |
| `ElementAtOrDefault` | `TSource?` | `default` | 해당 없음 | 없음 | 번역 없음 |
| `MinBy` / `MaxBy` ※.NET 6 | `TSource?` | 널 허용이면 `null`, 널 비허용 값 타입이면 **예외** | 동률이면 **첫 번째** | `InvalidOperationException`(조건부) | 번역 없음 |
| `DefaultIfEmpty` | `IEnumerable<TSource?>` | 기본값 1개짜리 시퀀스 | 해당 없음 | 없음 | `OUTER JOIN` |

### 까다로움 순서

| 연산자 | 요구 조건 |
|---|---|
| `Single` | 가장 까다롭다 — 정확히 하나 |
| `First`, `Last` | 최소 하나 |
| `SingleOrDefault` | 최대 하나 |
| `FirstOrDefault`, `LastOrDefault` | 가장 관대하다 — 아무 조건 없음 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 값 타입에 `FirstOrDefault` | "못 찾음"과 "값이 0"을 구별할 수 없다 | `Cast<int?>()`, 기본값 오버로드(※.NET 6), 또는 `First` |
| 예외 타입으로 원인 구별 시도 | 0개와 2개 이상이 **같은** `InvalidOperationException`이다 | 메시지에 의존하지 말고 개수를 먼저 확인 |
| `ElementAt`의 예외를 `InvalidOperationException`으로 기대 | `ArgumentOutOfRangeException`이다. 음수도 같다 | G.14절 |
| 루프 안의 `ElementAt` | `IList<T>`가 아니면 매번 처음부터 훑어 O(n²) | `foreach` 또는 `ToList()` |
| 빈 시퀀스에 `MinBy`/`MaxBy` | 널 비허용 값 타입이면 예외 | `Any()` 확인 또는 `DefaultIfEmpty()` |
| `Min`/`Max`로 "가장 비싼 상품"을 얻으려 함 | 돌려주는 것은 **값**이지 원소가 아니다 | `MinBy`/`MaxBy`(※.NET 6) |
| 정렬 없는 `First` | "아무거나 하나"라는 뜻이다 | 앞에 `OrderBy`를 둔다(30.13절) |
| `SingleOrDefault`가 절대 안 던진다고 믿음 | 원소가 둘 이상이면 던진다 | 29.11절, 30.9절 |

> **💡 `OrderBy(...).First()` 대신 `MinBy`**
>
> `OrderBy(...).First()`는 전체를 정렬하므로 O(n log n)이고 입력 전체를 버퍼링한다. `MinBy`는 한 번 훑으면서 최선을 기억하므로 O(n)이고 버퍼링이 없다(30.9절).

---

## G.11 집계

`IEnumerable<TSource>` → 스칼라. 전부 즉시 실행이다(30.10절).

### 주요 시그니처

```csharp
public static int  Count<TSource>(this IEnumerable<TSource> source);
public static int  Count<TSource>(this IEnumerable<TSource> source,
                                  Func<TSource, bool> predicate);
public static long LongCount<TSource>(this IEnumerable<TSource> source);

public static bool TryGetNonEnumeratedCount<TSource>(          // ※.NET 6
    this IEnumerable<TSource> source, out int count);

public static TSource? Min<TSource>(this IEnumerable<TSource> source);
public static TResult? Min<TSource, TResult>(
    this IEnumerable<TSource> source, Func<TSource, TResult> selector);

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

### 동작표

| 연산자 | 반환 타입 | 빈 시퀀스일 때 | 던지는 예외 | SQL 대응 |
|---|---|---|---|---|
| `Count` | `int` | 0 | 없음 | `COUNT(...)` |
| `LongCount` | `long` | 0 | 없음 | `COUNT_BIG(...)` |
| `TryGetNonEnumeratedCount` ※.NET 6 | `bool` (+ `out int`) | `true`, 0 | 없음 | — |
| `Sum` | 선택자 타입 그대로 | **0** | 정수·`decimal`은 `OverflowException` | `SUM(...)` |
| `Average` | 아래 표 참조 | **예외**(널 허용 오버로드는 `null`) | `InvalidOperationException` | `AVG(...)` |
| `Min` / `Max` | `TSource?` 또는 `TResult?` | 널 비허용 값 타입이면 **예외**, 참조·널 허용이면 `null` | `InvalidOperationException`(조건부) | `MIN(...)`, `MAX(...)` |
| `Aggregate` (시드 없음) | `TSource` | **예외** | `InvalidOperationException` | 번역 없음 |
| `Aggregate` (시드 있음) | `TAccumulate` / `TResult` | 시드(또는 시드에 결과 선택자를 적용한 값) | 없음 | 번역 없음 |
| `CountBy` / `AggregateBy` ※.NET 9 | 키·값 쌍의 시퀀스 | 빈 시퀀스 | 선택자가 던지는 것만 | 번역 없음 |

`Average`의 반환 타입은 선택자 타입이 정한다(30.10절).

| 선택자 타입 | 결과 타입 |
|---|---|
| `decimal` | `decimal` |
| `float` | `float` |
| `int`, `long`, `double` | `double` |

그래서 `int avg = new int[]{3,4}.Average();`는 컴파일되지 않고 `double avg = ...`는 3.5가 된다.

### 시퀀스가 비었는지 확인하는 방법

| 방법 | 비용 | 언제 |
|---|---|---|
| `Count() > 0` | 최악의 경우 전체 열거 | 쓰지 마라 |
| `Any()` | 원소 하나만 읽는다 | `IEnumerable<T>`만 있을 때 |
| `Count` 속성 | O(1) | `ICollection`/`ICollection<T>` 구현 타입 |
| `Length` 속성 | O(1) | 배열 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 지연 시퀀스에 `Count()` | **시퀀스를 다시 실행한다.** 부수 효과가 반복된다 | `ToList()`로 한 번만 실체화(29.7절) |
| `Sum`이 조용히 오버플로할 것이라 기대 | 정수·`decimal`은 checked 누산이라 `OverflowException` (`float`/`double`은 무한대) | `Sum(v => (long)v)`로 올려 받는다 |
| 빈 시퀀스에 `Average` | `Sum`은 0이지만 `Average`는 예외다 | `Any()` 확인 또는 널 허용 오버로드 |
| 빈 시퀀스에 `Min`/`Max` | 널 비허용 값 타입이면 예외 | `DefaultIfEmpty(0).Max()` |
| `Min`/`Max`를 `IComparable` 아닌 타입에 | 선택자 식이 필수다 | `Min(p => p.Price)` |
| 시드 없는 `Aggregate` | **첫 원소가 암묵적 시드**가 되어 누산이 두 번째부터 시작한다 | 시드를 명시하거나 함수를 재구성 |
| 교환·결합법칙이 없는 집계 함수 | 결과가 직관과 어긋나고, 병렬화하면 **비결정적**이 된다 | `Select(...).Aggregate(...)`로 분리, 또는 `Sum` |
| `GroupBy` 후 집계만 사용 | 쓰지도 않을 그룹 리스트를 전부 만든다 | 딕셔너리 직접 갱신, `CountBy`(※.NET 9) |

> **⚠️ 시드 없는 집계의 대표 사례**
>
> `{2,3,4}.Aggregate((total, n) => total + n * n)`은 `2*2 + 3*3 + 4*4 = 29`가 아니라 `2 + 3*3 + 4*4 = 27`이다. 첫 원소 2가 제곱되지 않고 시드로 들어갔기 때문이다(30.10절). 이 정도 계산에는 `numbers.Sum(n => n * n)`을 쓰는 것이 옳다.

---

## G.12 한정자

`IEnumerable<TSource>` → `bool`. `true`/`false`를 돌려주는 집계이며 전부 즉시 실행이다(30.11절).

### 주요 시그니처

```csharp
public static bool Contains<TSource>(
    this IEnumerable<TSource> source, TSource value);

public static bool Any<TSource>(this IEnumerable<TSource> source);
public static bool Any<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);

public static bool All<TSource>(
    this IEnumerable<TSource> source, Func<TSource, bool> predicate);

public static bool SequenceEqual<TSource>(
    this IEnumerable<TSource> first, IEnumerable<TSource> second,
    IEqualityComparer<TSource>? comparer);
```

### 동작표

| 연산자 | 반환 타입 | 빈 시퀀스일 때 | 던지는 예외 | 조기 종료 | SQL 대응 |
|---|---|---|---|---|---|
| `Contains` | `bool` | `false` | 없음 | 찾는 즉시 | `WHERE ... IN (...)` |
| `Any` | `bool` | `false` | 없음 | 첫 매칭에서 | `WHERE ... IN (...)` |
| `All` | `bool` | **`true`** | 없음 | 첫 반례에서 | `WHERE (...)` |
| `SequenceEqual` | `bool` | 둘 다 비면 `true` | 없음 | 첫 불일치에서 | — |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 빈 시퀀스의 `All` | **`true`다.** "모든 구매가 100달러 미만인 고객"에 구매가 없는 고객이 전부 포함된다 | `c.Purchases.Any() && c.Purchases.All(...)` |
| `Any(x => x.Equals(v))`로 포함 검사 | `ICollection<T>` 빠른 경로를 못 타고 항상 선형 탐색 | 원소 동등성만 보면 `Contains` |
| `array1 == array2`로 내용 비교 | 참조 비교라 내용이 같아도 `false` | `SequenceEqual`(25.1절) |
| `SequenceEqual`이 순서를 무시할 것이라 기대 | `{1,2,3}.SequenceEqual({3,2,1})`은 `false` | 정렬 후 비교, `HashSet<T>.SetEquals`, 또는 `GroupBy`로 개수 비교 |
| 리스트에 `Contains`를 반복 호출 | O(n×m) | `ToHashSet()`을 먼저 만든다 |

---

## G.13 생성

입력 시퀀스 없이 시퀀스를 만든다. **확장 메서드가 아니라 `Enumerable` 클래스의 정적 메서드다**(30.12절).

### 주요 시그니처

```csharp
public static IEnumerable<TResult> Empty<TResult>();
public static IEnumerable<int>     Range(int start, int count);
public static IEnumerable<TResult> Repeat<TResult>(TResult element, int count);
```

### 동작표

| 연산자 | 반환 타입 | `count`가 0일 때 | 던지는 예외 | 할당 |
|---|---|---|---|---|
| `Empty<T>()` | `IEnumerable<T>` | 항상 빈 시퀀스 | 없음 | **없음** — 캐시된 싱글턴 |
| `Range(start, count)` | `IEnumerable<int>` | 빈 시퀀스 | `count`가 음수이거나 `start + count - 1`이 `int.MaxValue`를 넘으면 **호출 시점**에 `ArgumentOutOfRangeException` | 반복자 하나 |
| `Repeat<T>(element, count)` | `IEnumerable<T>` | 빈 시퀀스 | `count`가 음수면 **호출 시점**에 `ArgumentOutOfRangeException` | 반복자 하나 |

### 흔한 함정

| 함정 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| `Range(start, end)`로 읽음 | 두 번째 인자는 **개수**다. `Range(5,3)`은 `{5,6,7}` | `Range(start, end - start + 1)`, 이름 있는 인자 |
| `Repeat(new Person(...), 3)` | 객체를 **하나만** 만들어 세 번 내보낸다 | `Range(0,3).Select(_ => new Person(...))` |
| "결과 없음"을 `null`로 표현 | 호출자 전부가 널 검사를 해야 한다 | `Empty<T>()`를 돌려준다(78장) |

> **💡 `Empty<T>()`는 `DefaultIfEmpty`와 정확히 반대 방향의 도구다**
>
> `DefaultIfEmpty`는 빈 시퀀스에 원소 하나를 끼워 넣고, `Empty<T>()`는 `null` 자리에 빈 시퀀스를 끼워 넣는다. `numbers.SelectMany(a => a ?? Enumerable.Empty<int>())`가 후자의 전형적 용법이다(30.12절).

---

## G.14 예외를 던지는 연산자 정리표

이 절은 "무엇이 언제 터지는가"만 모은다. **`...OrDefault` 대응물이 있는 것과 없는 것을 구별하는 것**이 요점이다.

### 전수표

| 연산자 | 조건 | 던지는 예외 | 시점 | `...OrDefault` 대응물 |
|---|---|---|---|---|
| `First` | 시퀀스가 비었거나 매칭 0개 | `InvalidOperationException` | 즉시 | `FirstOrDefault` → `default` |
| `Last` | 시퀀스가 비었거나 매칭 0개 | `InvalidOperationException` | 즉시 | `LastOrDefault` → `default` |
| `Single` | 매칭 0개 | `InvalidOperationException` | 즉시 | `SingleOrDefault` → `default` |
| `Single` | 매칭 **2개 이상** | `InvalidOperationException` | 즉시 | **`SingleOrDefault`도 던진다** |
| `ElementAt` | 인덱스가 범위 밖(음수 포함) | `ArgumentOutOfRangeException` | 즉시 | `ElementAtOrDefault` → `default` |
| `Min` / `Max` | 빈 시퀀스 + 널 비허용 값 타입 | `InvalidOperationException` | 즉시 | 없음 — `DefaultIfEmpty(0)`로 대응 |
| `Min` / `Max` | 원소가 비교 불가(선택자 없음) | 런타임 예외 — 비교자가 던진다 | 즉시 | 없음 — 선택자를 준다(30.10절) |
| `MinBy` / `MaxBy` ※.NET 6 | 빈 시퀀스 + 널 비허용 값 타입 | `InvalidOperationException` | 즉시 | 없음 — `Any()` 선행 확인 |
| `Average` | 빈 시퀀스 | `InvalidOperationException` | 즉시 | 없음 — 널 허용 오버로드는 `null` |
| `Sum` | 정수·`decimal` 누산이 범위를 넘음 | `OverflowException` | 즉시 | 없음 — `(long)`으로 올려 받는다 |
| `Aggregate` | 시드 없이 빈 시퀀스 | `InvalidOperationException` | 즉시 | 없음 — 시드를 준다 |
| `Cast<T>` | 원소가 `T`로 변환 불가 | `InvalidCastException` | **열거 시점** | `OfType<T>` → 그 원소를 건너뛴다 |
| `Order` / `OrderBy` ※.NET 7 포함 | 원소·키가 비교 불가 | `InvalidOperationException` | **열거 시점** | 없음 — 비교자를 넘긴다 |
| `ToDictionary` | 키 중복 | `ArgumentException` | 즉시 | `ToLookup` → 중복 허용 |
| `ToDictionary` | 키가 `null` | `ArgumentNullException` | 즉시 | `ToLookup` |
| `Chunk` ※.NET 6 | `size <= 0` | `ArgumentOutOfRangeException` | **호출 시점** | 없음 |
| `Range` / `Repeat` | `count`가 음수(또는 `Range`의 범위 초과) | `ArgumentOutOfRangeException` | **호출 시점** | 없음 |

### 세 가지 시점

예외가 **어디서** 터지는지가 디버깅 난이도를 가른다.

| 시점 | 어떤 연산자 | 스택 트레이스 |
|---|---|---|
| **호출 시점** | `Chunk`, `Range`, `Repeat`의 인자 검증 | 원인 줄이 그대로 나온다 |
| **즉시 실행 도중** | 요소·집계·한정자·`To...` 전부 | 호출 줄이 나온다 |
| **열거 시점** | `Cast`, 정렬 연산자, 지연 연산자 안의 람다 | **원인이 된 연산자 호출 줄이 나오지 않는다** |

> **⚠️ 열거 시점 예외는 원인 줄을 남기지 않는다**
>
> `Cast<int>()`를 호출하는 줄에서는 아무 일도 일어나지 않는다. `foreach`나 `ToList()`가 문제 원소에 도달하는 순간 터지고, 스택 트레이스에는 `Cast` 호출 줄이 나오지 않는다. 반복자의 오류 보고 시점 문제(28.6절)가 그대로 재현된다(30.8절).

### `...OrDefault`가 실제로 무엇을 막는가

| 짝 | `...OrDefault`가 막는 것 | 막지 못하는 것 |
|---|---|---|
| `First` / `FirstOrDefault` | 0개일 때의 예외 | 없음(2개 이상은 원래 정상) |
| `Last` / `LastOrDefault` | 0개일 때의 예외 | 없음 |
| `Single` / `SingleOrDefault` | 0개일 때의 예외 | **2개 이상일 때의 예외는 그대로 던진다** |
| `ElementAt` / `ElementAtOrDefault` | 범위 밖 인덱스 예외 | 없음 |

### 네 연산자는 네 개의 서로 다른 주장이다

| 연산자 | 코드가 주장하는 것 | 주장이 깨지면 |
|---|---|---|
| `Single` | "이 조건에 맞는 것은 정확히 하나" | 즉시 예외 |
| `SingleOrDefault` | "많아야 하나" | 둘 이상이면 예외 |
| `First` | "적어도 하나" | 없으면 예외 |
| `FirstOrDefault` | 아무 주장도 하지 않는다 | 조용히 `default`가 흘러간다 |

| 질문 | 답 | 연산자 |
|---|---|---|
| 0개가 정상인가? | 아니오 | `Single` 또는 `First` |
| 0개가 정상인가? | 예 | `SingleOrDefault` 또는 `FirstOrDefault` |
| 2개 이상이 정상인가? | 아니오 | `Single` 계열 |
| 2개 이상이 정상인가? | 예 | `First` 계열 (+ 반드시 `OrderBy`) |

> **💡 기본값은 `FirstOrDefault`가 아니라 `Single`이다**
>
> "몇 개가 나와야 정상인가"를 먼저 정하고 그에 맞는 연산자를 고른다. `FirstOrDefault`는 데이터 손상을 은폐하고, 그 `null`은 몇 단계 뒤의 엉뚱한 곳에서 `NullReferenceException`으로 터진다. **예외는 정보다**(30.13절).

---

## G.15 `IEnumerable` vs `IQueryable` 차이가 드러나는 지점

`IQueryable<T>`는 `IEnumerable<T>`를 **상속한다.** 그래서 `IQueryable` 시퀀스에 `Enumerable`의 연산자를 쓰는 것이 적법하고, 컴파일 오류도 경고도 없다. 다만 그렇게 하면 쿼리가 클라이언트에서 실행될 뿐이다(31.4절).

### 무엇이 바인딩을 결정하는가

**소스 표현식의 정적 타입**이다. 런타임 타입이 아니다.

```csharp
IQueryable<Customer>  q = dbContext.Customers;
IEnumerable<Customer> e = dbContext.Customers;   // 같은 객체, 다른 정적 타입

var r1 = q.Where(c => c.ID > 10);   // Queryable.Where  → SQL에 WHERE 절
var r2 = e.Where(c => c.ID > 10);   // Enumerable.Where → 전체 로드 후 로컬 필터
```

| 관점 | `IEnumerable<T>` | `IQueryable<T>` |
|---|---|---|
| 연산자가 받는 것 | 델리게이트 | 식 트리 |
| 필터·정렬 실행 장소 | 항상 클라이언트 | 공급자가 결정(보통 서버) |
| 사용자 정의 연산자 추가 | 쉽다(`yield return`) | 사실상 불가 |
| 임의의 .NET 메서드 호출 | 가능 | 공급자가 아는 것만 |
| 실패 시점 | 컴파일 타임에 대부분 잡힘 | **런타임 예외** |

### 번역되지 않는 연산자·오버로드

EF Core + 관계형 데이터베이스 기준의 일반적 경향이다(30장 각 절의 "SQL 대응" 칸과 31.4절을 합쳤다). 정확한 목록은 공급자와 버전마다 다르다.

| 연산자·형태 | 번역 | 무슨 일이 일어나는가 |
|---|---|---|
| `Where`, `Select`, `OrderBy`, `Join`, `Skip`, `Take` | 된다 | 표준 SQL 절로 |
| `GroupBy` (집계와 함께) | 된다 | `GROUP BY` |
| `GroupBy` (집계 없이 상세 행 전체) | **안 된다** | 번역 실패 — 그룹핑 직전에 `AsEnumerable()`(30.6절) |
| 로컬 컬렉션에 대한 `Contains` | 된다 | `IN (...)`, 비스칼라면 `EXISTS` |
| `string.Contains`/`StartsWith`/`EndsWith` | 된다 | `LIKE` |
| `DefaultIfEmpty` | 된다 | `OUTER JOIN` |
| `Single`/`SingleOrDefault` | 된다 | **두 행**을 요청한다(개수 검증 때문) |
| `TakeLast`, `SkipLast`, `TakeWhile`, `SkipWhile` | **안 된다** | 번역 없음 |
| `Reverse` | **안 된다** | 번역 없음 |
| `Zip`, `Chunk` | **안 된다** | 번역 없음 |
| `DistinctBy`, `UnionBy`, `IntersectBy`, `ExceptBy` ※.NET 6 | **안 된다** | 번역 없음 |
| `ElementAt` / `ElementAtOrDefault` | **안 된다** | 지원되지 않는다 |
| `MinBy` / `MaxBy` ※.NET 6 | **안 된다** | 번역 없음 |
| `Aggregate` | **안 된다** | 번역 없음 |
| 인덱스 오버로드 `Where((x,i) => ...)`, `Select((s,i) => ...)` | **안 된다** | SQL에 "입력 순서" 개념이 없다 |
| `IComparer`/`IEqualityComparer` 오버로드 | **안 된다** | 비교 규칙은 컬럼의 콜레이션이 정한다 |
| 사용자 정의 메서드·`Regex`·델리게이트 호출 | **안 된다** | 최종 투영에서만 허용 |
| `ToString()` (임의 타입) | 부분적 | 타입과 공급자에 따라 다르다 |

> **⚠️ EF Core 3.0 이후 번역 실패는 예외다**
>
> EF Core 2.x는 번역할 수 없는 부분을 **조용히 클라이언트에서 평가**했다. 3.0부터는 `InvalidOperationException`을 던지며 메시지가 "The LINQ expression ... could not be translated"로 시작한다. 유일한 예외 조항이 **최종 `Select` 투영**이다 — 결과 행 수가 이미 서버에서 결정되었으므로 안전하다(31.4절).

### 실행 위치가 의미를 바꾸는 지점

같은 LINQ 코드가 실행 위치에 따라 **다른 결과나 다른 비용**을 갖는 자리다.

| 코드 | 로컬(`IEnumerable`) | EF Core(`IQueryable`) |
|---|---|---|
| `from p in c.Purchases.DefaultIfEmpty() select p.Description` | `NullReferenceException` | 정상 동작(SQL이 널 행을 처리) |
| `OrderBy` 동률 원소의 순서 | 안정 정렬 — 입력 순서 유지 | **보장 없음** — 실행 계획에 따라 달라진다 |
| `let` | 계층과 익명 타입이 늘어 **느려진다** | 식 트리 노드 몇 개, SQL 별칭으로 흡수 |
| `Join` vs `SelectMany` | `Join`이 O(n+m), `SelectMany`가 O(n×m) | 둘 다 SQL로 번역되고 알고리즘은 옵티마이저가 고른다 |
| `where` 절의 위치 | 데코레이터 체인은 쓴 순서 그대로 실행된다 | 옵티마이저가 재배치하는 경우가 많다 |
| `null == null` | `true` | SQL은 `UNKNOWN` — EF Core가 보정 절을 끼워 넣는다 |
| `Cast<T>` 실패 | `InvalidCastException` | 애초에 이 형태를 잘 쓰지 않는다 |

### 경계를 긋는 세 가지 방법

| 방법 | 즉시 실행 | 저장 구조 | 이후 바인딩 | 언제 |
|---|---|---|---|---|
| `AsEnumerable()` | 하지 않는다 | 없다 | `Enumerable` | 경계만 긋고 스트리밍을 유지할 때 |
| `ToList()` / `ToArray()` | **한다** | 리스트·배열 하나 | `Enumerable` | 결과를 여러 번 순회하거나 컨텍스트를 곧 폐기할 때 |
| 변수를 `IEnumerable<T>`로 선언 | 하지 않는다 | 없다 | `Enumerable` | 쿼리를 두 조각으로 쪼갤 때 |

> **⚠️ `AsEnumerable()`의 위치가 곧 성능이다**
>
> ```csharp
> // (A) 필요한 행만 온다
> dbContext.Products.Where(p => p.Price > 100).AsEnumerable().Select(Format);
>
> // (B) 테이블 전체가 온다
> dbContext.Products.AsEnumerable().Where(p => p.Price > 100).Select(Format);
> ```
>
> 결과는 같고 비용은 몇 자릿수 다르다. **`Where`·`OrderBy`·`Skip`/`Take`·집계는 반드시 경계 위에 있어야 한다.** 특히 경계 아래의 `Count()`는 `SELECT COUNT(*)` 대신 전체 행 전송이 된다(31.5절).

> **💡 "된다/안 된다"를 외우려 하지 마라**
>
> 목록은 EF Core 버전마다 늘어난다. 실무에서 쓸모 있는 것은 **확인하는 습관**이다. `ToQueryString()`으로 생성 SQL을 찍어 보고(31.7절), 통합 테스트에서 실제 데이터베이스에 한 번 실행해 보라. "컴파일되니까 될 것"이라는 가정이 유일한 진짜 위험이다.

---

## G.16 성능 주의 연산자

세 부류다 — **버퍼링하는 것**, **다중 열거를 유발하는 것**, **숨은 할당을 만드는 것**.

### 버퍼링하는 연산자

| 연산자 | 무엇을 얼마나 담는가 | 무한 시퀀스 | 대안 |
|---|---|---|---|
| `OrderBy` 계열, `Order` ※.NET 7 | 입력 전체 + 키 배열 + 인덱스 배열 | **불가** | 하나만 필요하면 `MinBy`/`MaxBy` |
| `Reverse` | 입력 전체 | **불가** | 원본이 `IList<T>`면 역방향 `for` |
| `GroupBy` | 입력 전체 | **불가** | 딕셔너리 직접 갱신, `CountBy`/`AggregateBy` ※.NET 9 |
| `Join` / `GroupJoin` | **안쪽** 시퀀스 전체(룩업) | 안쪽이 유한해야 한다 | 작은 쪽을 안쪽에 |
| `Intersect` / `Except` (및 `*By` ※.NET 6) | **두 번째** 시퀀스 전체 | 두 번째가 유한해야 한다 | 작은 쪽을 두 번째로 |
| `Distinct` / `Union` (및 `*By` ※.NET 6) | 지금까지 본 서로 다른 원소·키 | 가능(집합은 계속 커진다) | 중복이 거의 없으면 재검토 |
| `TakeLast` / `SkipLast` | 마지막 n개짜리 순환 버퍼 | **불가** | n을 작게 |
| `Chunk` ※.NET 6 | 청크 하나 크기 | 가능 | — |
| `ToArray` / `ToList` / `ToDictionary` / `ToHashSet` / `ToLookup` | 결과 전체 | **불가** | 정말 실체화가 필요한지 확인 |

> **⚠️ 무한 시퀀스에 버퍼링 연산자를 붙이면 예외 없이 멈춘다**
>
> 반복자 메서드(28.3절)로 만든 무한 시퀀스에 `OrderBy`·`Reverse`·`GroupBy`·`TakeLast`를 붙이면 `OutOfMemoryException`이 날 때까지 메모리를 먹는다. **`Take`로 잘라낸 뒤에** 버퍼링 연산자를 붙여라(30.1절).

### 다중 열거를 유발하는 것

| 상황 | 무슨 일이 일어나는가 | 대응 |
|---|---|---|
| 지연 쿼리에 `Count()` 호출 | 시퀀스를 처음부터 다시 실행한다. 부수 효과도 반복된다 | `ToList()`로 한 번만 실체화(29.7절) |
| `Intersect`/`Except` 결과를 두 번 열거 | 두 번째 시퀀스도 두 번 읽힌다 | 두 번째를 `ToHashSet()`으로 고정 |
| `Select` 안의 서브쿼리를 반복 열거 | 지연이 두 겹이라 안쪽 소스 접근이 반복된다 | 실체화 또는 한 번만 열거 |
| 여러 절에서 `g.Count()` 호출 | 그룹을 그때마다 다시 훑는다. `IGrouping`이 `ICollection<T>`라는 보장이 없다 | `let n = g.Count()` |
| 루프 안의 `ElementAt(i)` + `Count()` | 둘 다 매번 전체를 훑어 O(n²) | `foreach` 또는 `ToList()` |
| 루프 안에서 `Append`를 반복 | 데코레이터가 원소 수만큼 쌓여 열거가 O(n²) | `List<T>` |
| `list.Where(...).Last()` | 필터 결과가 `IList<T>`가 아니라 **진짜 O(n)** | 필요하면 실체화 후 인덱서 |

> **📌 `Last()`가 항상 O(n)인 것은 아니다**
>
> `Enumerable.Last`는 입력이 `IList<T>`를 구현하면 **인덱서로 바로 접근한다.** `List<T>`나 배열에 대해서는 O(1)이고, 인덱서 직접 접근과의 차이는 몇 번의 타입 검사뿐이다. 진짜 O(n)이 되는 것은 입력이 `IList<T>`가 아닐 때다(30.15절). 참고로 `Last()`는 빈 컬렉션에서 `InvalidOperationException`을, `list[Count-1]`과 `list[^1]`은 `ArgumentOutOfRangeException`을 던진다.

### 숨은 할당 (30.14절)

LINQ가 할당하는 것은 다섯 종류다.

| 대상 | 개수 | 언제 | 회피 |
|---|---|---|---|
| 델리게이트(캡처 없음) | 프로세스당 1 | 최초 실행 시 캐시 | 이미 최선 |
| 델리게이트(캡처 있음) | 쿼리 조립마다 1 | 쿼리를 만들 때 | 캡처 제거, `static` 람다 ※C# 9 |
| 디스플레이 클래스 | **스코프마다** 1 | 캡처가 있을 때만 | 캡처 제거 |
| 반복자 객체 | 연산자 계층마다 1 | 쿼리를 만들 때 | 연산자 수 줄이기 |
| 열거자 객체 | 계층마다 1, **열거마다** | `foreach` 할 때 | 재열거 줄이기, 실체화 |
| 익명 타입 | **원소마다 1** | 투영 · `let` · 다중 `from` · `join` | 값 튜플, `let` 제거 |
| `GroupBy`의 그룹·버퍼 | 그룹마다 1 + 전체 버퍼 | 첫 열거 시 | 딕셔너리 직접 갱신 |
| `Chunk`의 배열 ※.NET 6 | 청크마다 1 | 열거하며 | 배치 크기를 키운다 |
| `ToList`/`ToArray` 결과 | 1 (+ 내부 재할당) | 즉시 | 필요한 것만 |

앞의 넷은 **쿼리당 상수 개수**고, **익명 타입만 원소 수에 비례한다.** 그래서 원소가 많은 쿼리에서는 익명 타입이 가장 비싼 항목이 된다.

| 숨은 익명 타입의 출처 | 설명 |
|---|---|
| `let x = expr` | `Select` 계층 하나 + 원소마다 인스턴스 하나. `let`이 둘이면 중첩 익명 타입 |
| 두 번째 이후의 `from` | `SelectMany`의 3인자 오버로드가 결과 선택자에서 쌍을 만든다 |
| `join`의 결과 선택자 | 뒤에 절이 더 있으면 두 변수를 살리는 익명 타입이 필요하다 |
| 명시적 익명 타입 투영 | `Select(p => new { p.Name, p.Age })` |

> **⚠️ `foreach`가 인터페이스를 거치면 열거자를 박싱한다**
>
> `List<T>`를 직접 `foreach`하면 구조체 열거자를 써서 할당이 없다. `IEnumerable<T>`로 받으면 박싱된다. **LINQ 연산자를 하나만 걸어도 이 최적화는 사라진다.** 작은 컬렉션을 뜨거운 루프에서 LINQ로 훑으면 손해라는 말의 실체가 이것이다(30.14절).

> **⚠️ 로컬 쿼리에서 `let`은 성능을 떨어뜨린다**
>
> "값을 한 번만 계산하니 빨라진다"는 직관은 로컬 쿼리에서 **반대**다. `ToLower()`를 두 번 부르는 쪽이 `let`으로 한 번만 부르는 쪽보다 빨랐던 사례가 있다 — 문자열 하나를 더 만드는 비용보다 투명 식별자 계층을 얹는 비용이 컸다는 뜻이다. `let`은 **가독성 도구**로 쓰고, 계산이 정말 비쌀 때(정규식, 파싱, I/O)만 성능 목적으로 고려하라(30.15절).

### 대체 수단

| 하려는 일 | LINQ | 더 싼 대안 | 주의 |
|---|---|---|---|
| `List<T>` 필터링(새 리스트) | `list.Where(p).ToList()` | `list.FindAll(p)` | 반복자·열거자가 없다 |
| `List<T>` 필터링(제자리) | — | `list.RemoveAll(!p)` | **원본을 파괴한다.** 조건 방향이 반대다 |
| 키별 개수 세기 | `GroupBy(...).ToDictionary(g => g.Key, g => g.Count())` | 딕셔너리 직접 갱신, `CountBy` ※.NET 9 | 그룹 리스트를 만들지 않는다 |
| 최소·최대 원소 | `OrderBy(k).First()` | `MinBy(k)` ※.NET 6 | O(n log n) → O(n) |
| 포함 여부 반복 조회 | `b.Contains(x)`를 루프에서 | `b.ToHashSet()`을 먼저 | O(n×m) → O(n+m) |
| 원소 하나 덧붙이기 | `Concat(new[]{ x })` | `Append(x)` | 루프 안에서 반복하지 않을 때만 |
| 경계 검사 없는 순회 | `foreach (var x in list)` | `CollectionsMarshal.AsSpan(list)` | 순회 중 리스트를 수정하면 깨진다(68장) |

### 판단 흐름 (30.15절)

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

> **💡 언제 이 절을 신경 써야 하는가**
>
> **원소가 많은 쿼리를 가끔 실행한다면** 원소당 비용(익명 타입, 버퍼링)만 보면 된다. **작은 쿼리를 초당 수십만 번 실행한다면** 전부 신경 써야 하고, 이때는 LINQ를 버리고 루프를 쓰는 것이 정답인 경우가 많다. 어느 쪽인지는 추측이 아니라 `MemoryDiagnoser`로 확인한다(67.5절).

---

## G.17 목적별 역인덱스

연산자를 아는 상태로 성질을 찾는 것이 G.2~G.16이라면, 이 절은 **반대 방향**이다. 하고 싶은 일에서 연산자로 간다. 각 항목의 한계는 오른쪽 열에 적었다.

### 골라내기

| 하고 싶은 일 | 연산자 | 주의 |
|---|---|---|
| 조건에 맞는 것만 | `Where(p)` | `List<T>`뿐이면 `FindAll`이 더 싸다 |
| **중복 제거** | `Distinct()` | 참조 타입은 `Equals`/`GetHashCode` 계약 필요 |
| 키 기준 중복 제거 | `DistinctBy(k)` ※.NET 6 | 각 키의 **첫 번째**가 남는다 |
| 대소문자 무시 중복 제거 | `Distinct(StringComparer.OrdinalIgnoreCase)` | 기본은 서수 비교다 |
| 앞에서 n개 / 뒤에서 n개 | `Take(n)` / `TakeLast(n)` | `TakeLast`는 n개짜리 버퍼를 쓴다 |
| 페이징 | `OrderBy(k).Skip(n).Take(m)` | **정렬 없는 페이징은 버그다** |
| 정렬된 시퀀스를 경계에서 끊기 | `TakeWhile(p)` | 정렬되지 않았으면 거의 항상 버그 |
| 특정 타입만 남기기 | `OfType<T>()` | 안 맞는 원소는 조용히 버려진다 |
| 전부 그 타입임을 주장 | `Cast<T>()` | 아니면 열거 시점에 예외 |
| 숫자 타입 바꾸기 | `Select(x => (long)x)` | `Cast<long>()`은 언박싱이라 실패한다 |

### 순서 다루기

| 하고 싶은 일 | 연산자 | 주의 |
|---|---|---|
| 키로 정렬 | `OrderBy(k)` / `OrderByDescending(k)` | 입력 전체를 버퍼링한다 |
| 보조 정렬 | `.ThenBy(k2)` 또는 `orderby k1, k2` | `orderby`를 두 번 쓰면 앞이 **대체**된다 |
| 원소 자체로 정렬 | `Order()` ※.NET 7 | 비교 불가 타입이면 열거 시점 예외 |
| 문화권·대소문자 규칙 지정 | `OrderBy(k, StringComparer.CurrentCultureIgnoreCase)` | 쿼리 구문으로는 넘길 수 없다. EF Core에서는 불가 |
| 순서 뒤집기 | `((IEnumerable<T>)list).Reverse()` | `List<T>.Reverse()`는 **제자리 파괴** |
| 결정적 순서 보장(EF Core) | `ThenBy`로 기본 키까지 | SQL은 동률 순서를 보장하지 않는다 |

### 원소 하나 꺼내기

| 하고 싶은 일 | 연산자 | 주의 |
|---|---|---|
| 첫 원소, 없으면 예외 | `First()` | 앞에 `OrderBy`가 있어야 의미가 생긴다 |
| 첫 원소, 없으면 기본값 | `FirstOrDefault()` | 값 타입은 "못 찾음"과 0을 구별 못 한다 |
| 첫 원소, 없으면 지정값 | `FirstOrDefault(defaultValue)` ※.NET 6 | `Last`/`Single`에도 있다 |
| 정확히 하나임을 주장 | `Single(p)` | 둘 이상이면 예외 — 그게 목적이다 |
| **N번째 요소** | `ElementAt(n)` / `ElementAtOrDefault(n)` | `IList<T>`가 아니면 O(n). 루프 안에서 쓰면 O(n²) |
| 끝에서 N번째 | `ElementAt(^n)` ※.NET 6 | EF Core에서는 지원되지 않는다 |
| 마지막 원소 | `Last()` 또는 `list[^1]` | 빈 컬렉션에서 던지는 예외가 서로 다르다 |
| 최소·최대 **값** | `Min(k)` / `Max(k)` | 돌려주는 것은 값이지 원소가 아니다 |
| 최소·최대인 **원소** | `MinBy(k)` / `MaxBy(k)` ※.NET 6 | 동률이면 첫 번째. EF Core 번역 없음 |
| 상위 k개 | `OrderByDescending(k).Take(k)` | 전체를 정렬한다. n이 크고 k가 작으면 재검토(67장) |

### 두 목록 비교하기

| 하고 싶은 일 | 연산자 | 주의 |
|---|---|---|
| 이어 붙이기(중복 유지) | `a.Concat(b)` | 집합 연산자 중 가장 싸다 |
| 합집합 | `a.Union(b)` | 입력의 중복까지 제거된다 |
| 교집합 | `a.Intersect(b)` | `b`가 통째로 메모리에 올라간다 |
| **두 목록의 차이** | `a.Except(b)` | 비대칭이다. `b.Except(a)`와 다르다 |
| 양쪽에만 있는 것 전부 | `a.Except(b).Concat(b.Except(a))` | `a`·`b`를 각각 두 번 열거한다 |
| 키 목록으로 걸러내기 | `a.ExceptBy(ids, x => x.Id)` ※.NET 6 | 두 번째 인자는 **키**의 시퀀스다 |
| 내용이 같은가(순서 포함) | `a.SequenceEqual(b)` | `==`는 참조 비교다 |
| 내용이 같은가(순서 무시) | `a.OrderBy(x => x).SequenceEqual(b.OrderBy(x => x))` | 중복 개수도 본다 |
| 집합으로서 같은가 | `new HashSet<T>(a).SetEquals(b)` | 중복 개수는 보지 않는다 |
| 포함 여부 반복 조회 | `b.ToHashSet()`을 먼저 만든다 | 리스트에 `Contains`를 반복하면 O(n×m) |

### 묶고 세기

| 하고 싶은 일 | 연산자 | 주의 |
|---|---|---|
| **키로 묶어 세기** | `GroupBy(k)` 후 `g.Count()` | 그룹 리스트를 전부 만든다 |
| 키로 세기만(가볍게) | `CountBy(k)` ※.NET 9 | 그룹의 원소 리스트를 만들지 않는다 |
| 키로 세기(어느 버전에서나) | `Dictionary` 직접 갱신 루프 | 할당이 가장 적다 |
| 키별 합계 | `GroupBy(k).Select(g => new { g.Key, Sum = g.Sum(s) })` | 여러 절에서 집계를 반복하지 말 것 |
| 키로 조회할 딕셔너리 | `ToDictionary(k)` | 키 중복 시 `ArgumentException` — 그게 검증이다 |
| 키 하나에 여러 값 | `ToLookup(k)` | 없는 키에 **빈 시퀀스**를 돌려준다 |
| 그룹 자체 필터링(`HAVING`) | `group ... into g where g.Count() > 1` | 개별 원소 필터는 `group` **앞**에 |
| 그룹을 키 순으로 | `.OrderBy(g => g.Key)` | `GroupBy`는 정렬하지 않는다 |
| **배치로 나누기** | `Chunk(size)` ※.NET 6 | 청크마다 새 배열. `size <= 0`은 호출 시점 예외 |
| 시퀀스가 비었는가 | `Any()` | `Count() > 0`은 전체를 열거할 수 있다 |
| 열거하지 않고 개수 알기 | `TryGetNonEnumeratedCount(out n)` ※.NET 6 | `Count` 속성이 없으면 `false` |

### 합치고 펼치기

| 하고 싶은 일 | 연산자 | 주의 |
|---|---|---|
| **여러 시퀀스 평탄화** | `SelectMany(x => x.Children)` | 두 번째 이후의 `from`과 같다 |
| `null`이 섞인 것 평탄화 | `SelectMany(a => a ?? Enumerable.Empty<T>())` | 그냥 펼치면 `NullReferenceException` |
| 문자열을 단어로 펼치기 | `SelectMany(s => s.Split())` | `Select`를 쓰면 `IEnumerable<string[]>`이 된다 |
| 키로 결합(평면) | `Join` 또는 `join ... on ... equals ...` | 안쪽이 룩업으로 버퍼링된다. 작은 쪽을 안쪽에 |
| 키로 결합(계층) | `GroupJoin` 또는 `join ... into g` | 매칭이 없어도 바깥 원소가 남는다 |
| **왼쪽 외부 조인(계층)** | `GroupJoin` 그대로 | 기본 동작이 왼쪽 외부 조인이다 |
| **왼쪽 외부 조인(평면)** | `join ... into g` + `from x in g.DefaultIfEmpty()` | 로컬 실행 시 널 검사 필수 |
| 왼쪽 외부 조인에 필터 | 필터를 `DefaultIfEmpty` **앞**에 | 뒤에 두면 내부 조인이 된다 |
| 위치로 짝짓기 | `Zip(other, (a,b) => ...)` | 짧은 쪽에서 멈추고 나머지는 조용히 버려진다 |
| 비등가 조인 | 다중 `from` + `where` | `Join`으로는 표현할 수 없다 |
| 룩업을 재사용 | `ToLookup(k)`을 만들어 두고 인덱서로 | 여러 쿼리에서 쓸 수 있다 |

### 만들고 끝내기

| 하고 싶은 일 | 연산자 | 주의 |
|---|---|---|
| 연속된 정수 | `Enumerable.Range(start, count)` | 두 번째 인자는 **개수**다 |
| 같은 값 n번 | `Enumerable.Repeat(x, n)` | 참조 타입은 같은 객체가 n번 나온다 |
| 서로 다른 객체 n개 | `Enumerable.Range(0, n).Select(_ => new T())` | — |
| "결과 없음" 반환 | `Enumerable.Empty<T>()` | `null` 대신. 할당도 없다 |
| 비었을 때 기본값 하나 | `DefaultIfEmpty()` / `DefaultIfEmpty(v)` | 지연 실행이며 반환은 **시퀀스**다 |
| 지연을 끊고 결과 보존 | `ToList()` / `ToArray()` | 즉시 실행 + 컬렉션 할당 |
| 실행 위치만 로컬로 | `AsEnumerable()` | 실체화가 아니다. 여전히 지연 |
| 빈 시퀀스에서도 안전한 집계 | `DefaultIfEmpty(0).Max()` | `Max()`는 빈 값 타입 시퀀스에서 예외 |

---

## 이 부록의 요약

- **연산자를 읽는 축은 넷이다.** 분류 · 실행 시점 · 버퍼링 · 쿼리 구문 대응. 즉시 실행인 것은 "스칼라·원소·`bool`을 돌려주는 것"과 "이름이 `To`로 시작하는 것"뿐이고 나머지는 전부 지연이다.

- **메모리를 볼 때는 지연 여부가 아니라 버퍼링 여부를 본다.** `OrderBy`·`GroupBy`·`Reverse`는 지연이지만 첫 원소를 내기 위해 입력 전체를 힙에 올린다. 무한 시퀀스에 붙이면 예외 없이 `OutOfMemoryException`까지 간다.

- **쿼리 구문 키워드로 표현되는 연산자는 소수다.** 가장 자주 오해받는 것이 두 번째 이후의 `from`이 `SelectMany`로 번역된다는 사실이고, 이 번역이 투명 식별자와 원소당 익명 타입 할당을 만든다.

- **빈 시퀀스의 동작은 연산자마다 다르다.** `Sum`은 0, `Count`는 0, `All`은 `true`, `Any`는 `false`, `Average`는 예외, `Min`/`Max`는 원소 타입에 따라 `null`이거나 예외다. 이 비대칭이 사용자 입력에서 만들어진 시퀀스에서 사고를 낸다.

- **`...OrDefault`는 "0개"만 막는다.** `SingleOrDefault`는 원소가 둘 이상이면 여전히 던진다. 그리고 `First`/`Single` 계열의 예외는 `InvalidOperationException`, `ElementAt`은 `ArgumentOutOfRangeException`, `Cast`는 `InvalidCastException`으로 서로 다르다.

- **예외가 터지는 시점이 세 가지다.** 호출 시점(`Chunk`·`Range`·`Repeat`의 인자 검증), 즉시 실행 도중(요소·집계·`To...`), 열거 시점(`Cast`·정렬·지연 람다). 마지막 것만 스택 트레이스에 원인 줄을 남기지 않는다.

- **`IQueryable<T>`는 `IEnumerable<T>`를 상속하므로 실수가 컴파일된다.** 바인딩을 정하는 것은 소스 표현식의 **정적 타입**이며, 변수 선언 하나가 성능을 몇 자릿수 바꾼다. `AsEnumerable()`이 놓인 위치가 곧 국경선이다.

- **EF Core에서 번역되지 않는 것은 목록으로 외울 것이 아니라 확인할 것이다.** 인덱스 오버로드, 비교자 오버로드, `ElementAt`, `MinBy`/`MaxBy`, `Aggregate`, `Zip`, `Chunk`, `Reverse`, `*By` 계열, 집계 없는 `GroupBy`가 대표적이며 EF Core 3.0부터는 조용한 클라이언트 평가 대신 예외가 난다.

- **LINQ가 할당하는 다섯 종류 중 원소 수에 비례하는 것은 익명 타입뿐이다.** 그래서 `let`·다중 `from`·`join`·투영이 원소가 많은 쿼리에서 가장 비싼 항목이 되고, 로컬 쿼리에서 `let`은 성능을 **떨어뜨린다.**

- **연산자 선택은 성능이 아니라 의미에서 나온다.** `Single` vs `First`, `ToDictionary` vs `ToLookup`, `Cast` vs `OfType`은 전부 같은 축 위에 있다 — 한쪽은 불변식을 주장하고 검증하며, 다른 쪽은 조용히 넘어간다.

---

## 연습 문제

1. G.2의 마스터 표를 코드로 검증하라. 원소를 낼 때마다 콘솔에 로그를 찍는 반복자 메서드를 만들고, `Where`·`OrderBy`·`GroupBy`·`Take`·`Chunk`·`Distinct`·`Intersect`를 각각 걸어 `foreach`로 **첫 원소 하나만** 꺼내라. 어느 연산자가 입력 전체를 읽었는지 로그로 확인하고, 결과를 표의 "메모리" 칸과 대조하라.

2. G.3~G.13의 "빈 시퀀스일 때" 칸을 전부 실행해 확인하라. `int[]`와 `int?[]`와 `string[]` 세 가지 빈 배열에 `Sum`·`Average`·`Min`·`Max`·`MinBy`·`Count`·`Any`·`All`·`First`·`FirstOrDefault`·`Aggregate`(시드 있음·없음)를 각각 적용하고, 예외가 나는 조합과 값이 나오는 조합을 표로 만들어라.

3. G.14의 예외 시점 표를 재현하라. `Chunk(0)`·`Range(0, -1)`·`Cast<int>()`·`Order()`(비교 불가 타입)를 각각 호출만 하고 열거하지 않는 코드를 쓴 뒤, 어느 것이 호출 줄에서 터지고 어느 것이 `ToList()`에서 터지는지 확인하라. 열거 시점에 터지는 것의 스택 트레이스에 원래 호출 줄이 나오는지도 보라.

4. G.14의 `First`/`Single` 판단표를 데이터로 검증하라. 원소가 0개·1개·2개인 시퀀스 셋을 만들고 네 연산자를 전부 적용해 3×4 결과표를 만들어라. 그다음 이메일이 중복된 사용자 목록에서 `Single`과 `FirstOrDefault`가 각각 어떤 진단 정보를 주는지 비교하라.

5. G.15의 경계 문제를 측정하라. EF Core(또는 SQLite 인메모리) 컨텍스트에서 `.Where(...).AsEnumerable().Count()`와 `.AsEnumerable().Where(...).Count()`의 생성 SQL을 `ToQueryString()`으로 각각 찍고, 전송되는 행 수를 로깅으로 확인하라.

6. G.16의 숨은 할당 표를 `[MemoryDiagnoser]`로 확인하라. 같은 결과를 내는 세 쿼리 — `let`을 쓴 것, `let` 없이 계산을 두 번 하는 것, 익명 타입 대신 값 튜플을 쓴 것 — 의 할당량을 비교하고, 차이가 어느 항목에서 나오는지 표로 설명하라.

7. G.17의 역인덱스에서 항목 다섯 개를 골라 각각 두 가지 이상의 구현으로 써 보라(예: "왼쪽 외부 조인"을 `GroupJoin`으로, `SelectMany`+`DefaultIfEmpty`로, 룩업으로). 같은 결과가 나오는지 확인하고, 로컬 컬렉션 10만 개에 대해 어느 쪽이 빠른지 측정하라.

---

**이어서 볼 곳** — 이 부록의 표가 왜 그렇게 생겼는지는 30장 전체가 설명한다. 연산자 분류와 지연·버퍼링의 근거는 30.1절, 필터링은 30.2절, 투영과 `SelectMany`는 30.3절, 조인과 룩업은 30.4절, 정렬과 안정성은 30.5절, 그룹핑은 30.6절, 집합 연산은 30.7절, 변환은 30.8절, 요소 연산자는 30.9절, 집계는 30.10절, 한정자는 30.11절, 생성 메서드는 30.12절, `Single`/`First`의 의미론은 30.13절, 숨은 할당은 30.14절, 성능 실전은 30.15절이다. 지연 실행의 원리와 재평가는 29.6절·29.7절, 합성 전략은 29.9절, 지연과 즉시의 선택 기준은 29.11절이다. 식 트리와 `IQueryable`은 31.1~31.4절, 로컬·해석 쿼리의 결합은 31.5절, EF Core의 번역 과정은 31.7절이다. 반복자와 `yield return`은 28장, 동등성과 순서 비교 계약은 25장, 컬렉션 타입은 24장, PLINQ는 50장, 측정 방법론은 67장, `Span<T>`는 68장, 할당 줄이기는 69장에 있다. IL과 어셈블리를 읽는 법은 부록 A, 메모리 관리 규칙은 부록 B, 진단 명령은 부록 C, 성능 상수는 부록 D, 형식 문자열은 부록 E, 정규식은 부록 F다.
