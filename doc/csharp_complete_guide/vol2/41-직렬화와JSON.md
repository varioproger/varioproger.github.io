---
title: "41장. 직렬화와 JSON"
parent: "2권 — 라이브러리와 동시성"
grand_parent: "C# Complete Guide"
nav_order: 41
---

# 41장. 직렬화와 JSON

> **이 장의 위치** — 40장에서 스트림이라는 **바이트의 통로**를 끝까지 팠다. 이 장은 그 통로에 **객체를 통째로 밀어 넣는 방법**을 다룬다. 40.6절에서 `BinaryWriter`로 필드를 하나씩 손으로 쓰던 일을 직렬화기가 어떻게 자동화하는지, 그 자동화가 어디서 비용을 만들고 어디서 보안 구멍을 내는지가 이 장의 주제다. `System.Text.Json`은 .NET에서 가장 자주 쓰이는 직렬화기이므로 절반 이상을 여기에 쓴다.
>
> **선수 지식** — 33장(결정적 정리와 `IDisposable`), 35장(문자열과 텍스트 처리, 특히 35.8절의 인코딩), 40장(스트림과 파일 I/O), 20장(특성)
>
> **이 장에서 다루지 않는 것** — 스트림 자체의 동작·수명·비동기 규칙은 40장에서 이미 다뤘다. XML 직렬화와 `XmlSerializer`, XXE 공격은 42장에서, gRPC와 Protobuf의 실제 사용은 43.14절에서, 소스 생성기 일반론과 트리밍·Native AOT의 전반은 57.15절·55.7절·72.7절에서, 리플렉션 API 자체는 57장에서 다룬다. 이 장에서는 그것들이 **직렬화에 어떻게 작용하는지**만 본다.

---

## 41.1 직렬화의 목적과 형식 선택 기준

### 직렬화란 무엇인가

**직렬화(serialization)** 는 살아 있는 객체 그래프를 지정된 형식의 바이트 시퀀스로 바꾸는 과정이다. **역직렬화(deserialization)** 는 그 반대다. 이 정의에서 중요한 단어는 "객체"가 아니라 **그래프(graph)** 다.

객체 하나를 저장하려는 순간 그 객체가 참조하는 다른 객체도 따라 나온다. 파생 클래스를 저장하면 상속 사슬을 타고 올라가는 기반 클래스 데이터도 함께 나온다. 관련된 객체 전체의 집합을 **객체 그래프(object graph)** 라고 부른다. 객체 그래프의 화살표는 상속 관계(is-a)나 포함 관계(has-a)를 뜻하는 게 아니라 "**의존한다**" 또는 "**참조한다**"로 읽는다.

```text
   Car ─────refers to────▶ Radio
    ▲                        ▲
    │ is-a                   │ inherits the reference
    │                        │
JamesBondCar ────────────────┘

  객체 번호를 붙이면:
  [Car 3, ref 2], [Radio 2], [JamesBondCar 1, ref 3, ref 2]
```

이 표기를 읽으면 이렇다. 객체 3(`Car`)은 객체 2(`Radio`)에 의존한다. 객체 2는 아무에게도 의존하지 않는다. 객체 1(`JamesBondCar`)은 객체 3과 객체 2 모두에 의존한다. `JamesBondCar` 인스턴스 하나를 직렬화하면 `Car`와 `Radio`가 자동으로 따라온다는 뜻이다.

직렬화기가 대신해 주는 일이 바로 이 그래프 순회다. 직렬화기가 없다면 `UserPrefs` 같은 클래스에 필드가 20개 있을 때 `BinaryWriter`로 20번 쓰고 `BinaryReader`로 20번 읽는 코드를 손으로 유지해야 한다. 필드 하나를 추가할 때마다 두 곳을 고쳐야 하고, 순서를 어긋나게 쓰면 조용히 깨진다.

### 직렬화를 쓰는 자리

- **애플리케이션 상태 저장·복원** — 게임 세이브, 사용자 환경 설정, 편집기 세션.
- **프로세스 간 전송** — HTTP API, 메시지 큐, gRPC.
- **깊은 복사(deep clone)** — 그래프를 바이트로 만들었다가 다시 읽으면 완전한 복제본이 나온다.
- **캐시** — 메모리에 있던 객체를 Redis나 디스크에 밀어 넣었다가 되살린다.
- **후처리** — 일단 바이트가 되면 압축(40.7절)이나 암호화(44장)를 그대로 얹을 수 있다.

> **📌 직렬화된 바이트는 어디로든 간다**
>
> 직렬화의 목적지는 `Stream`을 상속한 무엇이든 될 수 있다. `MemoryStream`, `FileStream`, `NetworkStream`, `GZipStream`… 중요한 것은 바이트 시퀀스가 그래프의 상태를 정확히 표현한다는 사실뿐이며, 그 바이트가 어디에 놓이는지는 직렬화기의 관심사가 아니다. 40장의 데코레이터 체인이 여기서 그대로 재사용된다.

### 형식을 가르는 축

직렬화 형식은 수십 가지가 있지만, 실무의 선택은 다음 다섯 축으로 거의 결정된다.

| 축 | 질문 | 왜 중요한가 |
|---|---|---|
| **사람이 읽는가** | 로그에 찍어 놓고 눈으로 디버깅할 수 있나 | 장애 대응 속도를 좌우한다 |
| **스키마가 있는가** | 형식 자체가 필드 목록을 강제하나 | 계약 위반을 언제 잡는지 결정한다 |
| **스키마 진화** | 필드를 추가·삭제·개명하면 옛 데이터가 살아남나 | 배포 순서 제약으로 직결된다 |
| **크기** | 같은 데이터가 몇 바이트인가 | 네트워크 대역과 저장 비용 |
| **속도** | 초당 몇 건을 직렬화·역직렬화하나 | CPU 예산 |
| **언어 간 호환** | .NET 밖에서도 읽히나 | 다른 팀·다른 스택과의 결합도 |

### 형식 선택 기준표

| 형식 | 사람이 읽음 | 스키마 | 스키마 진화 | 크기 | 속도 | 언어 간 호환 | 대표 용도 |
|---|---|---|---|---|---|---|---|
| **JSON** | 예 | 없음(선택적 JSON Schema) | 관대 — 모르는 필드 무시, 없는 필드 기본값 | 중간 | 중상 | 매우 넓음 | HTTP API, 설정 파일, 로그 |
| **XML** | 예 | XSD로 강제 가능 | 관대하지만 네임스페이스가 발목을 잡음 | 큼 | 중 | 넓음(레거시 강세) | 기업 시스템 연동, 문서 형식 |
| **Protobuf** | 아니오 | `.proto` 필수 | 필드 번호 기반이라 매우 안정적 | 작음 | 빠름 | 매우 넓음 | gRPC, 서비스 간 고빈도 통신 |
| **MessagePack** | 아니오 | 없음(구현에 따라 계약 지정) | 구현에 따름 — 키 기반이면 관대, 인덱스 기반이면 취약 | 작음 | 매우 빠름 | 넓음 | 캐시, 게임 네트워킹, 내부 RPC |
| **수동 이진**(`BinaryWriter`) | 아니오 | 코드가 곧 스키마 | 매우 취약 — 순서·타입이 곧 계약 | 가장 작음 | 가장 빠름 | 없음 | 같은 앱이 쓰고 읽는 캐시·인덱스 |
| **`BinaryFormatter`** | 아니오 | 타입 자체 | 취약 | 큼 | 느림 | 없음 | **사용 금지**(41.7절) |

Protobuf는 스키마 우선(contract-first) 형식이다. `.proto` 파일에 메시지 구조를 정의하면 도구가 각 언어의 코드를 생성한다. 이진 형식이고 컴퓨터가 읽도록 설계돼 있어서 텍스트 형식보다 빠르고 작다. gRPC는 HTTP/2 위에 Protobuf를 얹은 RPC 프레임워크이며, 순수 성능만 놓고 보면 HTTP + JSON API보다 유리하다(43.14절).

> **💡 형식이 아니라 경계를 먼저 정하라**
>
> "JSON이냐 Protobuf냐"를 먼저 묻는 팀은 대개 잘못된 순서로 결정하고 있다. 먼저 물어야 할 것은 **이 바이트가 어떤 경계를 넘는가**이다.
>
> - **같은 프로세스** — 직렬화 자체가 필요 없다. 참조를 넘겨라.
> - **같은 앱이 쓰고 같은 앱이 읽는다**(로컬 캐시, 인덱스 파일) — 수동 이진이 가장 빠르고 작다. 버전이 바뀌면 파일을 버리고 다시 만들면 된다.
> - **같은 조직의 서비스 사이, 초당 수천 건** — Protobuf/gRPC 또는 MessagePack.
> - **외부에 공개하는 API, 사람이 문서를 보고 호출한다** — JSON. 논쟁의 여지가 거의 없다.
> - **레거시 시스템과 맞춰야 한다** — XML.
>
> 크기와 속도는 이 결정의 **마지막** 입력이지 첫 입력이 아니다.

### 스키마 진화 — 실제로 무엇이 깨지는가

배포는 절대 원자적이지 않다. 신버전과 구버전이 반드시 잠깐은 공존한다. 그동안 "구버전이 신버전 데이터를 읽고", "신버전이 구버전 데이터를 읽는" 두 방향이 모두 필요하다.

| 변경 | JSON(`System.Text.Json` 기본값) | Protobuf | 수동 이진 |
|---|---|---|---|
| 필드 추가 | 구버전은 모르는 멤버를 **무시**, 신버전은 없는 값에 기본값 | 새 필드 번호를 할당하면 양방향 안전 | **즉시 깨짐** |
| 필드 삭제 | 구버전은 기본값을 받음 | 번호를 `reserved` 처리하면 안전 | **즉시 깨짐** |
| 필드 개명 | **양방향 깨짐** — 이름이 곧 키 | 이름은 무의미, 번호만 중요 → 안전 | 영향 없음(이름을 안 씀) |
| 타입 변경(`int`→`string`) | `NumberHandling` 설정에 따라 부분적으로 흡수 | 대개 깨짐 | 깨짐 |
| 필드 순서 변경 | 영향 없음 | 영향 없음 | **즉시 깨짐** |

여기서 JSON의 성격이 드러난다. **이름이 계약이고 순서는 계약이 아니다.** Protobuf는 **번호가 계약이고 이름은 계약이 아니다.** 수동 이진은 **순서와 타입이 계약이고 이름은 존재하지도 않는다.**

> **⚠️ 직렬화 형식은 공개 API다**
>
> 프로퍼티 이름을 리팩터링하는 것은 사내 코드에서는 안전한 작업이다. 그 타입이 직렬화되어 디스크나 네트워크로 나가는 순간, **프로퍼티 이름 변경은 파괴적 API 변경**이 된다. IDE의 "이름 바꾸기"는 이 사실을 모른다.
>
> 방어책은 하나다. **직렬화되는 타입을 도메인 모델과 분리하라.** 외부와 주고받는 DTO를 따로 두고, 거기에만 `[JsonPropertyName]`을 명시적으로 붙인다. 도메인 모델의 이름은 자유롭게 바꾸고, 매핑 코드에서 흡수한다. 이 규율 하나가 41.8절의 보안 문제 절반도 같이 해결한다.

### .NET이 제공하는 직렬화기

| 직렬화기 | 네임스페이스 | 형식 | 상태 |
|---|---|---|---|
| `JsonSerializer` | `System.Text.Json` | JSON(UTF-8) | 권장 기본값 |
| `XmlSerializer` | `System.Xml.Serialization` | XML | 사용 가능 (42.14절) |
| `DataContractSerializer` | `System.Runtime.Serialization` | XML | 사용 가능 |
| `BinaryReader` / `BinaryWriter` | `System.IO` | 수동 이진 | 사용 가능 (40.6절) |
| `BinaryFormatter` | `System.Runtime.Serialization.Formatters.Binary` | 이진 | **제거됨** (41.7절) |
| `SoapFormatter` | `…Formatters.Soap` | SOAP XML | .NET Framework 3.5부터 폐기, .NET에 없음 |
| `NetDataContractSerializer` | `System.Runtime.Serialization` | XML | **사용 금지** (41.7절) |

`DataContractSerializer`와 `NetDataContractSerializer`를 혼동하면 안 된다. 이름은 한 글자 차이지만 성격이 정반대다. `DataContractSerializer`는 역직렬화할 타입을 **호출자가 미리 지정**하므로 신뢰할 수 없는 데이터를 다룰 수 있다. `NetDataContractSerializer`는 CLR 타입 이름을 **스트림 안에 기록**하고 역직렬화 시 그 이름대로 타입을 만든다 — `BinaryFormatter`와 같은 부류의 위험을 가진다.

> **📌 Json.NET(Newtonsoft.Json)의 자리**
>
> 역사적으로 .NET에는 JSON 지원이 아예 없었고, 사실상의 표준은 서드파티 라이브러리 Json.NET이었다. 2011년부터 존재했고, 옛 .NET 플랫폼에서도 같은 API가 돌아가며, 기능이 (적어도 과거에는) Microsoft의 JSON API보다 풍부하다는 이유로 지금도 널리 쓰인다.
>
> Microsoft의 JSON API는 처음부터 **단순함과 극도의 효율**을 목표로 설계됐다는 이점이 있고, .NET 6부터는 기능 격차도 상당히 좁혀졌다. Json.NET의 원저자 James Newton-King이 Microsoft에 합류해 새 JSON 타입 개발에 참여했다는 사실도 이 수렴을 설명한다. 선택 기준의 세부는 41.9절에서 다시 다룬다.

---

## 41.2 `System.Text.Json` — 기본 사용과 옵션

### JSON이라는 형식

JSON은 XML보다 단순하고 군더더기가 없다. 네임스페이스, 접두사, 스키마 같은 고급 기능은 없지만, JavaScript 객체를 문자열로 바꾼 것과 거의 같은 형태라서 배우기 쉽다.

```json
{
  "FirstName": "Sara",
  "LastName": "Wells",
  "Age": 35,
  "Friends": ["Dylan", "Ian"]
}
```

중괄호 `{}`는 **객체**(프로퍼티의 집합), 대괄호 `[]`는 **배열**(반복 요소)이다. 배열 요소는 문자열일 수도, 객체일 수도, 또 다른 배열일 수도 있다.

XML 표현과 비교하면 차이가 뚜렷하다. 선언도 없고 루트 이름도 없다 — 직렬화된 객체의 프로퍼티만 있다. 텍스트 양이 훨씬 적고 그만큼 효율적이다. 클래스 이름이 JSON에 없다는 점은 **유연성**을 준다. 보내는 쪽이 `Person`이라 부르는 타입을 받는 쪽은 `Human`이라 불러도 된다. 프로퍼티만 맞으면 붙는다.

### 최소 사용법

```csharp
using System.Text.Json;

var p = new Person { FirstName = "Sara", Age = 35 };

// 객체 → JSON 문자열
string json = JsonSerializer.Serialize(p);

// JSON 문자열 → 객체
Person? back = JsonSerializer.Deserialize<Person>(json);
```

`JsonSerializer`는 정적 클래스이고 인스턴스를 만들지 않는다. `XmlSerializer`처럼 생성자에 타입을 넘길 필요도 없다 — 제네릭 타입 인수나 `Type` 인수로 그때그때 지정한다.

### 진입점 전수표

| 메서드 | 입력/출력 | 언제 쓰나 |
|---|---|---|
| `Serialize<T>(T)` | → `string` | 짧은 문자열, 로깅, 테스트 |
| `SerializeToUtf8Bytes<T>(T)` | → `byte[]` | 네트워크·파일로 바로 보낼 때 (권장) |
| `Serialize<T>(Utf8JsonWriter, T)` | → 라이터에 기록 | 더 큰 JSON의 일부로 끼워 넣을 때 |
| `Serialize<T>(Stream, T)` | → 스트림 | 큰 페이로드, 문자열 중간 단계 제거 |
| `SerializeAsync<T>(Stream, T)` | → 스트림 (비동기) | 서버 응답 본문 |
| `SerializeToDocument` / `SerializeToElement` / `SerializeToNode` | → DOM | 객체를 DOM으로 바로 (41.4절) |
| `Deserialize<T>(string)` | `string` → `T?` | 이미 문자열이 있을 때 |
| `Deserialize<T>(ReadOnlySpan<byte>)` | UTF-8 바이트 → `T?` | **가장 빠른 경로** |
| `Deserialize<T>(ref Utf8JsonReader)` | 리더 → `T?` | 저수준 파싱 중 일부만 객체화 |
| `Deserialize<T>(Stream)` | 스트림 → `T?` | 파일·응답 본문 |
| `DeserializeAsync<T>(Stream)` | 스트림 → `ValueTask<T?>` | 비동기 I/O (40.15절) |
| `DeserializeAsyncEnumerable<T>(Stream)` | 스트림 → `IAsyncEnumerable<T>` | **거대한 JSON 배열을 스트리밍** ※.NET 6 |

```csharp
// 스트림 오버로드 — 중간 문자열을 만들지 않는다
await using FileStream fs = File.Create("people.json");
await JsonSerializer.SerializeAsync(fs, people);

await using FileStream load = File.OpenRead("people.json");
List<Person>? loaded = await JsonSerializer.DeserializeAsync<List<Person>>(load);
```

`DeserializeAsyncEnumerable<T>`는 최상위 JSON 배열을 요소 단위로 흘려보낸다. 100MB짜리 배열을 `List<T>`로 전부 물리지 않고 처리할 수 있다.

```csharp
var stream = new MemoryStream(Encoding.UTF8.GetBytes("[0,1,2,3,4]"));
await foreach (int item in JsonSerializer.DeserializeAsyncEnumerable<int>(stream))
    Console.Write(item);       // 01234
```

반대 방향도 된다. `IAsyncEnumerable<T>`를 프로퍼티로 가진 객체를 직렬화하면 요소가 생산되는 대로 흘려 쓴다. ※.NET 6

```csharp
static async IAsyncEnumerable<int> PrintNumbers(int n)
{
    for (int i = 0; i < n; i++) yield return i;
}

using Stream stream = Console.OpenStandardOutput();
var data = new { Data = PrintNumbers(3) };
await JsonSerializer.SerializeAsync(stream, data);   // {"Data":[0,1,2]}
```

### 기본 동작 — 무엇이 나가고 무엇이 안 나가나

옵션 없이 직렬화했을 때의 동작은 **놀랄 만큼 엄격하다**. 이것을 모르면 "왜 파일이 `{}`뿐이지"에서 한 시간을 잃는다.

| 항목 | 기본 동작 |
|---|---|
| 공개 프로퍼티 | 직렬화된다 |
| **공개 필드** | **직렬화되지 않는다** |
| 비공개 멤버 | 직렬화되지 않는다 |
| 읽기 전용 프로퍼티 | 직렬화는 되고 역직렬화는 무시된다 |
| 프로퍼티 이름 | **멤버 이름 그대로** (변환 없음) |
| 역직렬화 이름 매칭 | **대소문자 구분** |
| 공백 | 최소화(minified) |
| 주석 | 만나면 `JsonException` |
| 후행 쉼표 | 만나면 `JsonException` |
| 중첩 깊이 | 64 |
| `null` 프로퍼티 | 그대로 `null`을 기록 |
| 순환 참조 | `JsonException` (무한 루프 방지) |
| `DateTime`/`DateTimeOffset` | ISO 8601 확장 프로파일 문자열 (38.5절) |

> **⚠️ 필드는 기본적으로 직렬화되지 않는다**
>
> 다음 클래스를 직렬화하면 결과는 `{}`다.
>
> ```csharp
> public class Radio
> {
>     public bool HasTweeters;                 // 필드 — 안 나감
>     public List<double> StationPresets;      // 필드 — 안 나감
>     public string RadioId = "XF-552RR6";     // 필드 — 안 나감
> }
> ```
>
> 해결은 두 가지다. `JsonSerializerOptions.IncludeFields = true`로 **전부** 포함시키거나, 포함할 필드에만 `[JsonInclude]`를 붙인다. 전자를 쓰면서 특정 필드만 빼려면 그 필드에 `[JsonIgnore]`를 붙인다.
>
> 그리고 이게 진짜 함정이다. **필드 처리 설정은 직렬화와 역직렬화가 대칭이어야 한다.** 쓸 때 `IncludeFields = true`로 해 놓고 읽을 때 빠뜨리면, 파일에는 값이 있는데 객체에는 안 들어온다. 예외도 나지 않는다.

### `JsonSerializerOptions` 전수표

| 옵션 | 타입 | 기본값 | 하는 일 |
|---|---|---|---|
| `PropertyNamingPolicy` | `JsonNamingPolicy?` | `null` | 멤버 이름 → JSON 이름 변환 규칙 |
| `DictionaryKeyPolicy` | `JsonNamingPolicy?` | `null` | 딕셔너리 **키**에만 적용되는 별도 규칙 |
| `PropertyNameCaseInsensitive` | `bool` | `false` | 역직렬화 시 이름 매칭에서 대소문자 무시 |
| `WriteIndented` | `bool` | `false` | 들여쓰기와 줄바꿈으로 사람이 읽게 |
| `DefaultIgnoreCondition` | `JsonIgnoreCondition` | `Never` | 어떤 값을 쓰기에서 생략할지 |
| `IgnoreReadOnlyProperties` | `bool` | `false` | 세터 없는 프로퍼티를 쓰기에서 제외 |
| `IgnoreReadOnlyFields` | `bool` | `false` | `readonly` 필드를 쓰기에서 제외 |
| `IncludeFields` | `bool` | `false` | 공개 필드 포함 |
| `NumberHandling` | `JsonNumberHandling` | `Strict` | 숫자를 문자열로 읽고 쓸지 |
| `ReferenceHandler` | `ReferenceHandler?` | `null` | 순환·중복 참조 처리 방식 |
| `Encoder` | `JavaScriptEncoder?` | `null`(=`Default`) | 문자열 이스케이프 정책 |
| `AllowTrailingCommas` | `bool` | `false` | 후행 쉼표 허용 |
| `ReadCommentHandling` | `JsonCommentHandling` | `Disallow` | 주석 처리 (`Skip`/`Allow`) |
| `MaxDepth` | `int` | `0`(=64) | 최대 중첩 깊이 |
| `UnmappedMemberHandling` | `JsonUnmappedMemberHandling` | `Skip` | 매핑되지 않은 JSON 멤버 처리 ※.NET 8 |
| `UnknownTypeHandling` | `JsonUnknownTypeHandling` | `JsonElement` | `object`로 선언된 값을 무엇으로 역직렬화할지 |
| `PreferredObjectCreationHandling` | `JsonObjectCreationHandling` | `Replace` | 기존 객체를 채울지 새로 만들지 ※.NET 8 |
| `Converters` | `IList<JsonConverter>` | 빈 목록 | 커스텀 컨버터 (41.5절) |
| `TypeInfoResolver` | `IJsonTypeInfoResolver?` | 리플렉션 기반 | 메타데이터 공급자 (41.6절) ※.NET 7 |
| `DefaultBufferSize` | `int` | 16384 | 스트림 오버로드의 내부 버퍼 크기 |
| `IsReadOnly` / `MakeReadOnly()` | `bool` / 메서드 | — | 옵션 동결 ※.NET 8 |
| `JsonSerializerOptions.Default` | 정적 | — | 동결된 기본 옵션 싱글턴 ※.NET 8 |

#### 이름 정책 (`PropertyNamingPolicy`)

C#의 공개 멤버 관례는 파스칼 표기(`CanSubmerge`)다. 반면 대부분의 JavaScript 프레임워크는 카멜 표기(`canSubmerge`)를 선호한다. 대부분의 언어가 대소문자를 구분하므로 이 둘은 **서로 다른 이름**이다. .NET과 비(非).NET 서비스 사이에서 JSON을 주고받을 때 이 불일치가 가장 흔한 사고 원인이다.

```csharp
var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
};
string json = JsonSerializer.Serialize(book, options);
// {"title":"...","author":"...","publishDate":"2023-11-14T00:00:00"}
```

| `JsonNamingPolicy` 값 | `PublishDate` → | 도입 |
|---|---|---|
| `null` (기본값) | `PublishDate` | — |
| `CamelCase` | `publishDate` | 처음부터 |
| `SnakeCaseLower` | `publish_date` | ※.NET 8 |
| `SnakeCaseUpper` | `PUBLISH_DATE` | ※.NET 8 |
| `KebabCaseLower` | `publish-date` | ※.NET 8 |
| `KebabCaseUpper` | `PUBLISH-DATE` | ※.NET 8 |

> **⚠️ "기본값이 카멜 표기"라는 말은 틀렸다**
>
> `JsonSerializer`의 `PropertyNamingPolicy` 기본값은 `null`이며, 이는 **멤버 이름을 그대로 쓴다**는 뜻이다. `PublishDate`는 `PublishDate`로 나간다.
>
> 카멜 표기가 "기본"인 것처럼 보이는 경우가 있는데, 그것은 **ASP.NET Core의 웹 기본값** 때문이다. MVC/Minimal API 파이프라인은 `JsonSerializerDefaults.Web` 프리셋을 쓰고, 이 프리셋이 `PropertyNamingPolicy = CamelCase`를 켠다. 콘솔 앱에서 직접 `JsonSerializer.Serialize`를 부르면 파스칼 표기가 나온다.
>
> 이 차이를 모르면 "로컬 테스트에서는 되는데 API로 나가면 필드 이름이 다르다"는 현상을 만난다.

`PropertyNamingPolicy`는 **쓰기와 읽기 양쪽에** 쓰인다. 카멜 정책을 켜면 역직렬화도 카멜 이름을 기대한다. 정책과 다른 표기가 오면 매칭이 실패하고, 값이 조용히 기본값으로 남는다.

#### 대소문자 무시 (`PropertyNameCaseInsensitive`)

```csharp
var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
```

이걸 켜면 `canSubmerge`와 `CanSubmerge`가 모두 매칭된다. 관대해지지만 공짜는 아니다 — 이름 매칭이 정확 비교에서 대소문자 무시 비교로 바뀌므로 역직렬화가 느려진다. 그리고 관대함은 41.8절의 관점에서 공격 표면이 넓어진다는 뜻이기도 하다.

#### 들여쓰기 (`WriteIndented`)

기본값은 최소화 출력이다. RESTful 서비스에서 널리 쓰이는 형식이므로 HTTP/HTTPS로 오가는 데이터 패킷 크기를 줄이는 것이 기본 선택이다. 원천 예시에서 같은 `Book` 객체가 들여쓰기 + 카멜 표기 + 필드 포함으로 **221바이트**, 최소화 + 파스칼 표기 + `[JsonInclude]` 필드만으로 **184바이트**로 나온다 — 약 20% 차이다.

> **💡 `WriteIndented`는 사람이 볼 파일에만**
>
> 설정 파일, 테스트 스냅샷, 로컬 덤프에는 켜라. 네트워크로 나가는 응답과 캐시에는 꺼라. 20% 차이는 초당 수만 건에서는 무시할 수 없고, 사람이 한 달에 한 번 여는 파일에서는 무의미하다.
>
> ※.NET 9부터 `IndentCharacter`(탭/공백)와 `IndentSize`로 들여쓰기 문자와 폭을 지정할 수 있다.

#### 생략 조건 (`DefaultIgnoreCondition`)

| `JsonIgnoreCondition` | 의미 |
|---|---|
| `Never` (기본값) | 항상 쓴다 |
| `WhenWritingNull` | `null`이면 쓰기에서 생략 (참조 타입·널 허용 값 타입만) |
| `WhenWritingDefault` | 타입의 기본값(`0`, `false`, `null`)이면 생략 |
| `Always` | **`DefaultIgnoreCondition`에는 설정 불가** — 프로퍼티 단위 `[JsonIgnore]`에서만 유효 |

`DefaultIgnoreCondition = JsonIgnoreCondition.Always`를 시도하면 `ArgumentException`이 난다. 모든 프로퍼티를 생략하면 남는 게 없으므로 당연한 금지다.

> **⚠️ `WhenWritingDefault`는 `0`과 `false`도 지운다**
>
> "널만 지우자"는 의도로 `WhenWritingDefault`를 고르면 `Count = 0`, `IsEnabled = false`, `Amount = 0m`이 전부 사라진다. 받는 쪽이 "필드가 없으면 기본값"으로 처리한다면 결과는 같지만, "필드가 없으면 미설정"으로 처리한다면 의미가 완전히 달라진다. 널만 지우고 싶으면 `WhenWritingNull`이다.

#### 숫자 처리 (`NumberHandling`)

기본값은 `Strict`다. 숫자는 따옴표 없이 읽고 따옴표 없이 쓴다. 그런데 현실의 API는 종종 `"age": "35"`처럼 숫자를 문자열로 보낸다(특히 PHP나 느슨한 타입의 백엔드가 그렇다).

| `JsonNumberHandling` | 값 | 의미 |
|---|---|---|
| `Strict` | 0 | 숫자는 숫자로만 읽고 쓴다. 따옴표 불허 |
| `AllowReadingFromString` | 1 | 숫자 토큰과 문자열 토큰 둘 다에서 읽을 수 있다 |
| `WriteAsString` | 2 | 숫자를 따옴표로 감싸 쓴다 |
| `AllowNamedFloatingPointLiterals` | 4 | `NaN`, `Infinity`, `-Infinity` 문자열을 읽고 쓴다 |

이 열거형에는 `[Flags]`가 붙어 있어 비트 조합이 가능하다.

> **⚠️ 플래그 조합은 `|`이지 `&`가 아니다**
>
> ```csharp
> // 틀림 — 1 & 2 == 0 == Strict. 아무것도 안 켜진다.
> NumberHandling = JsonNumberHandling.AllowReadingFromString
>                & JsonNumberHandling.WriteAsString
>
> // 맞음
> NumberHandling = JsonNumberHandling.AllowReadingFromString
>                | JsonNumberHandling.WriteAsString
> ```
>
> `&`를 써도 컴파일이 되고 예외도 나지 않는다. 결과가 조용히 `Strict`가 될 뿐이다. 플래그 열거형 전반의 함정이며 20.3절에서 다룬 내용이 그대로 재현된다.

`AllowNamedFloatingPointLiterals`가 필요한 이유는 JSON 표준에 `NaN`과 `Infinity`가 없기 때문이다. `double.NaN`을 기본 설정으로 직렬화하면 예외가 난다.

#### 참조 처리 (`ReferenceHandler`)

객체 그래프에 순환이 있으면 기본 설정에서는 예외가 난다. `Customer`가 `Order` 목록을 갖고 각 `Order`가 다시 `Customer`를 참조하는 흔한 ORM 모델이 정확히 이 경우다.

| `ReferenceHandler` | 동작 |
|---|---|
| `null` (기본값) | 순환을 만나면 `JsonException` |
| `IgnoreCycles` | 순환 지점을 `null`로 대체하고 계속 진행 ※.NET 6 |
| `Preserve` | `$id`/`$ref`/`$values` 메타데이터로 참조 동일성을 보존. 왕복 가능 |

```csharp
var options = new JsonSerializerOptions
{
    ReferenceHandler = ReferenceHandler.IgnoreCycles
};
```

`Preserve`는 그래프를 **정확히** 되살린다. 같은 객체를 두 번 참조하던 관계가 역직렬화 후에도 같은 인스턴스를 가리킨다. 대신 JSON에 `$id`, `$ref` 같은 비표준 메타데이터 프로퍼티가 섞이므로 다른 언어의 파서가 이해하지 못한다.

> **⚠️ `IgnoreCycles`는 데이터를 조용히 지운다**
>
> 순환 지점이 `null`로 바뀐다는 것은 **정보가 손실된다**는 뜻이다. `order.Customer`가 `null`인 JSON을 받은 쪽은 "고객이 없는 주문"으로 해석할 수도 있다. 순환을 옵션으로 회피하기 전에, 애초에 순환이 없는 DTO를 따로 만드는 쪽이 거의 항상 낫다.

#### 인코더 (`Encoder`)

`System.Text.Json`은 기본적으로 **매우 공격적으로 이스케이프**한다. ASCII가 아닌 문자와 HTML에서 의미를 가지는 문자(`<`, `>`, `&`, `'`, `+`)를 `\uXXXX`로 바꾼다.

```csharp
JsonSerializer.Serialize(new { Name = "한글" });
// {"Name":"\uD55C\uAE00"}
```

동작상 문제는 없다 — 어떤 JSON 파서든 되돌려 읽는다. 하지만 사람이 파일을 열어 보면 읽을 수 없고, 크기도 커진다.

```csharp
using System.Text.Encodings.Web;
using System.Text.Unicode;

// (1) 한글 등 유니코드는 그대로, HTML 문자는 계속 이스케이프
var safe = new JsonSerializerOptions
{
    Encoder = JavaScriptEncoder.Create(UnicodeRanges.All)
};

// (2) 거의 이스케이프하지 않음
var relaxed = new JsonSerializerOptions
{
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
};
```

> **⚠️ `UnsafeRelaxedJsonEscaping`의 "Unsafe"는 장식이 아니다**
>
> 이 인코더는 `<`, `>`, `&`를 이스케이프하지 않는다. 생성된 JSON이 HTML 페이지의 `<script>` 블록 안에 그대로 삽입되는 시나리오에서는 **XSS 통로가 된다.** 순수하게 `Content-Type: application/json`으로만 나가고 HTML에 임베드되지 않는 것이 확실할 때만 써라.
>
> 한글 가독성만 원한다면 `JavaScriptEncoder.Create(UnicodeRanges.All)`이 훨씬 안전한 선택이다. HTML 위험 문자는 여전히 이스케이프된다.

#### 관대함 옵션 (`AllowTrailingCommas`, `ReadCommentHandling`)

JSON 표준(RFC 8259)은 객체의 마지막 프로퍼티와 배열의 마지막 요소 뒤에 쉼표를 허용하지 않고, 주석도 정의하지 않는다. 기본 설정에서 이 둘을 만나면 `JsonException`이 난다.

```csharp
var lenient = new JsonSerializerOptions
{
    AllowTrailingCommas = true,
    ReadCommentHandling = JsonCommentHandling.Skip
};
```

`JsonCommentHandling`은 `Disallow`(기본), `Skip`(무시), `Allow`(주석 토큰을 실제로 방출) 세 가지다. `Allow`는 저수준 리더에서만 의미가 있다 — `JsonSerializer` 경로에서 `Allow`를 설정하면 예외가 난다.

> **💡 관대함은 설정 파일에만**
>
> 사람이 손으로 편집하는 `appsettings.json` 계열 파일에는 주석과 후행 쉼표 허용이 실질적 편의를 준다. 반대로 **네트워크에서 들어온 데이터에는 켜지 마라.** 관대한 파서는 다른 시스템의 엄격한 파서와 해석이 갈리고, 그 해석 차이(parser differential)가 보안 우회의 고전적 통로다.

#### 매핑되지 않은 멤버 (`UnmappedMemberHandling`) ※.NET 8

```csharp
var strict = new JsonSerializerOptions
{
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
};
```

기본값은 `Skip`이다. JSON에 있지만 대상 타입에 대응 멤버가 없는 프로퍼티는 조용히 버려진다. 이것이 스키마 진화를 관대하게 만드는 이유이자, 오타를 숨기는 이유다. `Disallow`로 바꾸면 그런 멤버를 만났을 때 `JsonException`이 난다.

타입 단위로도 지정할 수 있다.

```csharp
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public record CreateOrderRequest(string Sku, int Quantity);
```

### 특성 전수표

| 특성 | 적용 대상 | 하는 일 |
|---|---|---|
| `[JsonPropertyName("...")]` | 프로퍼티·필드 | JSON 이름을 명시 지정. 이름 정책보다 우선 |
| `[JsonIgnore]` | 프로퍼티·필드 | 제외. `Condition`으로 조건부 지정 가능 |
| `[JsonInclude]` | 프로퍼티·필드 | 공개 필드나 비공개 접근자를 포함 |
| `[JsonConstructor]` | 생성자 | 역직렬화에 쓸 생성자를 지정 |
| `[JsonPropertyOrder(n)]` | 프로퍼티·필드 | 쓰기 순서. 작을수록 앞. 미지정은 0 ※.NET 6 |
| `[JsonExtensionData]` | 딕셔너리 프로퍼티 | 매핑되지 않은 나머지를 여기에 담는다 |
| `[JsonNumberHandling(...)]` | 타입·프로퍼티 | 그 범위에만 숫자 처리 규칙 적용 |
| `[JsonConverter(typeof(C))]` | 타입·프로퍼티 | 커스텀 컨버터 지정 (41.5절) |
| `[JsonRequired]` | 프로퍼티 | JSON에 없으면 `JsonException` ※.NET 7 |
| `[JsonDerivedType(...)]` / `[JsonPolymorphic]` | 타입 | 다형 직렬화 (41.5절) ※.NET 7 |
| `[JsonUnmappedMemberHandling(...)]` | 타입 | 매핑 실패 처리 ※.NET 8 |
| `[JsonObjectCreationHandling(...)]` | 타입·프로퍼티 | 기존 인스턴스를 채울지 새로 만들지 ※.NET 8 |

#### `[JsonPropertyOrder]`

```csharp
public class Person
{
    [JsonPropertyOrder(1)]
    public bool IsAlive = true;

    [JsonPropertyOrder(-1)]
    public string FirstName { get; set; } = "";
}
```

`FirstName`(-1)이 먼저, `IsAlive`(1)이 나중에 나간다. 순서를 지정하지 않은 멤버는 0으로 취급되므로 이 둘 사이에 놓인다. 음수도 쓸 수 있다는 점이 중요하다 — 기존 멤버를 건드리지 않고 앞으로 보낼 수 있다.

> **📌 순서가 왜 필요한가**
>
> JSON 객체의 프로퍼티 순서는 의미가 없다고 표준이 말한다. 그럼에도 순서 지정이 필요한 자리가 있다.
>
> - **사람이 읽는 파일** — `Id`와 `Name`을 맨 위에 두면 진단이 빨라진다.
> - **다형 직렬화의 타입 판별자** — `$type`은 페이로드 맨 앞에 있어야 하는 제약이 있었다(41.5절).
> - **바이트 단위 비교** — 스냅샷 테스트나 해시 기반 캐시 키에서 안정된 순서가 필요하다.

#### `[JsonExtensionData]`

스키마를 모르는 나머지를 통째로 받아 두는 장치다.

```csharp
public class Envelope
{
    public string Type { get; set; } = "";

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }
}
```

`Type` 외의 모든 프로퍼티가 `Extra`에 들어간다. 다시 직렬화하면 `Extra`의 내용이 **같은 레벨에** 펼쳐져 나간다. 프록시·게이트웨이처럼 "모르는 필드도 손실 없이 통과시켜야 하는" 코드에 유용하다. 프로퍼티 타입은 `Dictionary<string, object>` 또는 `Dictionary<string, JsonElement>`(및 그 인터페이스)여야 한다.

> **⚠️ `[JsonExtensionData]`는 `UnmappedMemberHandling.Disallow`를 무력화한다**
>
> 확장 데이터 프로퍼티가 있으면 "매핑되지 않은 멤버"라는 개념 자체가 사라진다 — 전부 확장 딕셔너리에 매핑되기 때문이다. 엄격 검증과 통과 보존은 동시에 성립하지 않는다. 어느 쪽이 필요한지 먼저 정해라.

### 생성자, 레코드, `required`

`System.Text.Json`은 매개변수가 있는 생성자로 역직렬화할 수 있다. 생성자 매개변수 이름과 JSON 프로퍼티 이름을 (설정된 정책·대소문자 규칙에 따라) 매칭한다. 그래서 레코드(19장)와 불변 타입이 별도 작업 없이 동작한다.

```csharp
public record Book(string Title, string Author, int Pages);

var b = JsonSerializer.Deserialize<Book>("""{"Title":"C#","Author":"A","Pages":800}""");
```

생성자가 여러 개면 어느 것을 쓸지 알 수 없으므로 `[JsonConstructor]`로 지정한다.

```csharp
public class Money
{
    public decimal Amount { get; }
    public string Currency { get; }

    public Money(decimal amount) : this(amount, "KRW") { }

    [JsonConstructor]
    public Money(decimal amount, string currency)
        => (Amount, Currency) = (amount, currency);
}
```

`required` 멤버(※C# 11)와 `[JsonRequired]`(※.NET 7)는 JSON에 해당 프로퍼티가 없으면 `JsonException`을 던진다. 21장에서 다룬 널 안정성과 결합하면 "역직렬화 직후 객체가 반쯤 비어 있는" 고전적 사고를 컴파일러와 런타임 양쪽에서 막을 수 있다.

> **⚠️ 널 허용 참조 타입 주석은 역직렬화를 막지 못한다**
>
> ```csharp
> public class Dto { public string Name { get; set; } = null!; }
> JsonSerializer.Deserialize<Dto>("{}")!.Name;   // null. 예외 없음.
> ```
>
> `string`(널 불허)로 선언해도 JSON에 `Name`이 없으면 `null`이 들어간다. 컴파일러의 널 분석은 정적이고, 역직렬화는 그 바깥에서 값을 채운다. `required`나 `[JsonRequired]`를 쓰거나, 역직렬화 후 명시적으로 검증하는 수밖에 없다.
>
> ※.NET 9부터 `JsonSerializerOptions.RespectNullableAnnotations`로 널 허용 주석을 강제하는 옵션이 추가됐다. 기본값은 꺼짐이다 — 켜지 않으면 위 동작 그대로다.

### 열거형

기본적으로 열거형은 **숫자**로 직렬화된다. `Status.Active`가 `1`로 나간다. 사람이 읽는 API에서는 대개 문자열이 낫다.

```csharp
var options = new JsonSerializerOptions
{
    Converters = { new JsonStringEnumConverter() }
};
```

또는 타입에 직접 붙인다.

```csharp
[JsonConverter(typeof(JsonStringEnumConverter<Status>))]   // ※.NET 8: 제네릭 버전
public enum Status { Active, Suspended }
```

> **⚠️ 열거형을 문자열로 바꾸는 것은 파괴적 변경이다**
>
> 숫자로 나가던 API를 문자열로 바꾸면 기존 클라이언트가 전부 깨진다. 반대도 마찬가지다. 열거형의 표현은 **첫 배포 전에** 결정하고 그 뒤로는 건드리지 마라. 그리고 숫자 표현을 쓰기로 했다면 열거형 멤버의 **값을 명시**해라(20.1절) — 멤버를 중간에 끼워 넣는 순간 저장된 모든 데이터의 의미가 바뀐다.

### 프리셋 — `JsonSerializerDefaults`

`JsonSerializerOptions`에는 프리셋을 받는 생성자가 있다.

- `JsonSerializerDefaults.General` — `PropertyNameCaseInsensitive = false`, `PropertyNamingPolicy = null`(파스칼 표기), `NumberHandling = Strict`.
- `JsonSerializerDefaults.Web` — `PropertyNameCaseInsensitive = true`, `PropertyNamingPolicy = CamelCase`, `NumberHandling = AllowReadingFromString`.

```csharp
var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    WriteIndented = true,
    ReferenceHandler = ReferenceHandler.IgnoreCycles
};
```

ASP.NET Core에서는 파이프라인 수준에서 설정한다.

```csharp
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = null;
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.WriteIndented = true;
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });
```

### 옵션 객체를 매번 새로 만들면 안 되는 이유

이 절에서 가장 중요한 성능 항목이다.

**문법.** 다음 두 코드는 결과가 같다.

```csharp
// (A) 매 호출마다 새 옵션
static string ToJsonBad<T>(T value)
    => JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true });

// (B) 정적 인스턴스 재사용
static readonly JsonSerializerOptions s_options = new() { WriteIndented = true };
static string ToJsonGood<T>(T value) => JsonSerializer.Serialize(value, s_options);
```

**런타임 동작.** `JsonSerializerOptions`는 단순한 설정 가방이 아니다. 처음 어떤 타입을 직렬화할 때 `System.Text.Json`은 그 타입을 리플렉션으로 분석해 **직렬화 계약(`JsonTypeInfo`)** 을 만든다 — 어떤 멤버가 있고, 각각의 JSON 이름이 무엇이고, 어떤 컨버터를 쓰고, 어떤 게터/세터 델리게이트를 호출할지. 이 계약은 **옵션 인스턴스 안에 캐시**된다.

옵션 인스턴스를 새로 만들면 그 캐시가 비어 있다. 즉 **호출할 때마다 타입 전체를 다시 분석한다.**

```text
  옵션 재사용                          옵션 매번 생성
  ┌─────────────────────┐             ┌─────────────────────┐
  │ options (static)    │             │ new options (매번)  │
  │  ├ JsonTypeInfo<Order>  ← 캐시    │  └ (비어 있음)       │
  │  ├ JsonTypeInfo<Item>   ← 캐시    └─────────────────────┘
  │  └ JsonTypeInfo<Money>  ← 캐시              ↓
  └─────────────────────┘             매 호출마다 리플렉션 재분석
          ↓                            + JsonTypeInfo 재할당
   첫 호출만 분석, 이후 조회            + GC 압력
```

**성능 영향.** 첫 호출의 비용이 매 호출로 옮겨 온다. 타입 그래프가 복잡할수록(중첩 객체, 컬렉션, 컨버터가 많을수록) 차이가 커진다. 게다가 매번 만들어지는 `JsonTypeInfo` 객체들이 그대로 GC 대상이 되어 할당 압력을 만든다. 이 함정은 코드 리뷰에서 눈에 잘 띄지 않는다 — 동작이 정확히 같기 때문이다.

> **⚠️ `JsonSerializerOptions`는 반드시 재사용하라**
>
> 애플리케이션 전체에서 **단 하나의 인스턴스를 만들고 재사용한다**. 정적 `readonly` 필드가 가장 흔한 형태다. DI를 쓴다면 싱글턴으로 등록한다.
>
> 옵션 인스턴스는 첫 직렬화 호출 이후 **스레드 안전하게 읽기 전용으로 동작**하며, 그 시점 이후 프로퍼티를 바꾸려 하면 `InvalidOperationException`이 난다. 그러니까 "재사용하되 나중에 고치기"는 애초에 불가능하다. 설정을 마친 뒤 쓰기 시작해라.

※.NET 8은 이 규율을 API로 못 박았다.

```csharp
var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
options.MakeReadOnly();          // 명시적 동결
Console.WriteLine(options.IsReadOnly);   // True

// 아무 옵션도 없는 경우엔 이미 동결된 싱글턴이 있다
string json = JsonSerializer.Serialize(value, JsonSerializerOptions.Default);
```

`JsonSerializerOptions.Default`는 기본 설정으로 동결된 공유 인스턴스다. 옵션을 넘기지 않는 `JsonSerializer.Serialize(value)` 오버로드가 내부적으로 쓰는 것과 같은 대상이므로, 기본 설정이면 아무것도 만들지 않는 편이 낫다.

> **💡 옵션 프로필은 이름을 붙여 한곳에 모아라**
>
> ```csharp
> internal static class JsonProfiles
> {
>     public static readonly JsonSerializerOptions Api = Create(camelCase: true);
>     public static readonly JsonSerializerOptions Storage = Create(camelCase: false);
>
>     private static JsonSerializerOptions Create(bool camelCase)
>     {
>         var o = new JsonSerializerOptions
>         {
>             PropertyNamingPolicy = camelCase ? JsonNamingPolicy.CamelCase : null,
>             DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
>             Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
>         };
>         o.MakeReadOnly();
>         return o;
>     }
> }
> ```
>
> "이 데이터는 어느 프로필로 나가는가"를 코드에서 한 단어로 읽을 수 있게 된다. 캐시 재사용은 덤이다.

---

## 41.3 저수준 API — `Utf8JsonReader`, `Utf8JsonWriter`

### 왜 저수준 API가 따로 있는가

`System.Text.Json`은 세 층으로 되어 있다.

```text
┌───────────────────────────────────────────────────────────┐
│  JsonSerializer            객체 ↔ JSON. 가장 편하고 가장 느림 │
├───────────────────────────────────────────────────────────┤
│  JsonDocument / JsonNode   DOM. 스키마를 모를 때            │
├───────────────────────────────────────────────────────────┤
│  Utf8JsonReader / Writer   전방 전용 토큰 스트림. 가장 빠름   │
└───────────────────────────────────────────────────────────┘
              ↑ 위층은 아래층 위에 구현돼 있다
```

`JsonSerializer`도, `JsonDocument`도 내부에서 `Utf8JsonReader`를 쓴다. 저수준 API를 직접 쓰는 것은 위층이 제공하는 편의를 포기하고 **할당과 복사를 없애는** 선택이다.

`Utf8JsonReader`는 UTF-8로 인코딩된 JSON 텍스트를 위한 최적화된 전방 전용(forward-only) 리더다. 개념적으로 42.11절의 `XmlReader`와 같은 위치에 있고 사용법도 비슷하다.

**핵심은 이름의 `Utf8`이다.** .NET 문자열은 UTF-16이다. HTTP를 비롯한 대부분의 네트워크 프로토콜은 UTF-8이다. UTF-16 기반 파서는 입력을 먼저 UTF-16으로 트랜스코딩한 뒤 파싱한다. `Utf8JsonReader`는 **UTF-8 바이트 위에서 직접 토큰을 걸어간다.** UTF-16 변환은 `GetString()` 같은 메서드를 실제로 호출하는 시점에만 일어난다.

### 토큰 순회의 기본형

```json
{
  "FirstName":"Sara",
  "LastName":"Wells",
  "Age":35,
  "Friends":["Dylan","Ian"]
}
```

```csharp
byte[] data = File.ReadAllBytes("people.json");
Utf8JsonReader reader = new Utf8JsonReader(data);

while (reader.Read())
{
    switch (reader.TokenType)
    {
        case JsonTokenType.StartObject:
            Console.WriteLine("Start of object");
            break;
        case JsonTokenType.EndObject:
            Console.WriteLine("End of object");
            break;
        case JsonTokenType.StartArray:
            Console.WriteLine();
            Console.WriteLine("Start of array");
            break;
        case JsonTokenType.EndArray:
            Console.WriteLine("End of array");
            break;
        case JsonTokenType.PropertyName:
            Console.Write($"Property: {reader.GetString()}");
            break;
        case JsonTokenType.String:
            Console.WriteLine($" Value: {reader.GetString()}");
            break;
        case JsonTokenType.Number:
            Console.WriteLine($" Value: {reader.GetInt32()}");
            break;
        default:
            Console.WriteLine($"No support for {reader.TokenType}");
            break;
    }
}
```

출력은 다음과 같다.

```text
Start of object
Property: FirstName Value: Sara
Property: LastName Value: Wells
Property: Age Value: 35
Property: Friends
Start of array
Value: Dylan
Value: Ian
End of array
End of object
```

`Read()`는 다음 토큰으로 커서를 옮기고 성공 여부를 반환한다. `IEnumerator.MoveNext`와 같은 모양이다. 토큰은 객체·배열의 시작과 끝, 프로퍼티 이름, 그리고 값(문자열, 숫자, `true`, `false`, `null`)이다.

| `JsonTokenType` | 의미 |
|---|---|
| `None` | 아직 `Read()`를 호출하지 않았거나 데이터 끝 |
| `StartObject` / `EndObject` | `{` / `}` |
| `StartArray` / `EndArray` | `[` / `]` |
| `PropertyName` | 객체 프로퍼티의 이름 |
| `String` | 문자열 값 |
| `Number` | 숫자 값 |
| `True` / `False` | 불리언 리터럴 — **하나의 `Boolean` 토큰이 아니다** |
| `Null` | `null` 리터럴 |
| `Comment` | `JsonCommentHandling.Allow`일 때만 |

> **⚠️ `true`와 `false`는 서로 다른 토큰 타입이다**
>
> `JsonTokenType.Boolean` 같은 것은 없다. `case JsonTokenType.True:`와 `case JsonTokenType.False:`를 따로 처리하거나 `reader.GetBoolean()`을 쓴다. `switch`에서 불리언을 빠뜨리고 `default`로 흘려보내는 실수가 흔하다.

### 값 읽기 메서드

| 메서드 | 반환 | 비고 |
|---|---|---|
| `GetString()` | `string?` | **여기서 UTF-16 변환이 일어난다** |
| `GetInt32()` / `GetInt64()` / `GetUInt32()` … | 정수 | 범위를 벗어나면 `FormatException` |
| `GetDouble()` / `GetSingle()` / `GetDecimal()` | 실수 | |
| `GetBoolean()` | `bool` | 토큰이 `True`/`False`가 아니면 `InvalidOperationException` |
| `GetDateTime()` / `GetDateTimeOffset()` / `GetGuid()` | 파싱된 값 | ISO 8601 등 표준 형식만 |
| `GetBytesFromBase64()` | `byte[]` | Base64 문자열 디코딩 |
| `TryGetInt32(out …)` 등 | `bool` | 예외 없는 버전 |
| `ValueTextEquals(ReadOnlySpan<byte>)` | `bool` | **문자열을 만들지 않고 비교** |
| `GetComment()` | `string` | `Comment` 토큰에서만 |
| `Skip()` / `TrySkip()` | — | 현재 값(객체·배열이면 통째로) 건너뛰기 |

> **💡 이름 비교에 `GetString()`을 쓰지 마라**
>
> ```csharp
> // 문자열을 할당한 뒤 비교 — 토큰마다 힙 할당
> if (reader.GetString() == "FirstName") { … }
>
> // UTF-8 바이트끼리 직접 비교 — 할당 없음
> if (reader.ValueTextEquals("FirstName"u8)) { … }
> ```
>
> `"…"u8` 리터럴(※C# 11)은 `ReadOnlySpan<byte>`를 컴파일 타임 상수 데이터로 만든다. 저수준 리더를 쓰는 이유 자체가 할당 제거라면, 프로퍼티 이름 비교에서 문자열을 만드는 순간 그 이유가 사라진다.

### `ref struct`라는 제약

`Utf8JsonReader`의 생성자는 `byte[]`를 받지 않는다. `ReadOnlySpan<byte>`를 받는다(`T[]`에서 `ReadOnlySpan<T>`로 암시적 변환이 있어서 배열을 그냥 넘길 수 있는 것뿐이다). 그리고 스팬을 필드로 갖기 때문에 `Utf8JsonReader` 자체가 **`ref struct`** 로 정의돼 있다.

`ref struct`의 규칙은 68.1절에서 상세히 다뤘다. 직렬화 맥락에서 중요한 결과만 정리한다.

| 제약 | 결과 |
|---|---|
| 힙에 올라갈 수 없다 | 클래스의 필드가 될 수 없다 |
| 박싱 불가 | `object`나 인터페이스로 취급 불가 |
| **`async` 메서드의 지역 변수가 될 수 없다** | `await`를 포함하는 메서드 안에서 못 쓴다 |
| 이터레이터(`yield return`)에서 쓸 수 없다 | 토큰을 `IEnumerable`로 흘려보낼 수 없다 |
| 람다·지역 함수에서 캡처 불가 | 클로저에 담을 수 없다 |
| 메서드에 넘길 때 `ref`로 넘기는 것이 관례 | 복사 비용과 상태 분기 방지 |

> **⚠️ `Utf8JsonReader`는 `async` 메서드 안에 못 들어간다**
>
> 이것이 저수준 파싱에서 가장 자주 부딪히는 벽이다.
>
> ```csharp
> async Task ParseAsync(Stream stream)
> {
>     byte[] buffer = new byte[4096];
>     int n = await stream.ReadAsync(buffer);
>     var reader = new Utf8JsonReader(buffer.AsSpan(0, n));  // 컴파일 오류
>     …
> }
> ```
>
> `async` 메서드의 지역 변수는 컴파일러가 만드는 상태 기계 클래스의 **필드**가 된다(47.7절). `ref struct`는 힙 객체의 필드가 될 수 없으므로 컴파일이 거부된다.
>
> **해결 패턴**: 비동기 I/O와 동기 파싱을 분리한다. `async` 메서드에서 데이터를 읽어 버퍼에 담고, 실제 파싱은 **동기 메서드**에 위임한다.
>
> ```csharp
> async Task<Person> ParseAsync(Stream stream, CancellationToken ct)
> {
>     using var ms = new MemoryStream();
>     await stream.CopyToAsync(ms, ct);
>     return Parse(ms.GetBuffer().AsSpan(0, (int)ms.Length));   // 동기 호출
> }
>
> static Person Parse(ReadOnlySpan<byte> utf8)
> {
>     var reader = new Utf8JsonReader(utf8);
>     …
> }
> ```
>
> 스트림 전체를 메모리에 올리기 싫다면 다음 항목의 `JsonReaderState` 패턴을 쓴다.

### `JsonReaderOptions`

기본적으로 `Utf8JsonReader`는 JSON이 RFC 8259를 엄격히 따르기를 요구한다. 관대하게 만들려면 생성자에 `JsonReaderOptions`를 넘긴다.

| 옵션 | 기본값 | 의미 |
|---|---|---|
| `CommentHandling` | `Disallow` | 주석을 만나면 `JsonException`. `Skip`은 무시, `Allow`는 `Comment` 토큰 방출 |
| `AllowTrailingCommas` | `false` | 객체·배열의 마지막 뒤 쉼표 허용 |
| `MaxDepth` | 64 | 객체와 배열의 최대 중첩 깊이 |

주석은 다른 토큰의 **중간에는** 올 수 없다.

```csharp
var options = new JsonReaderOptions
{
    CommentHandling = JsonCommentHandling.Skip,
    AllowTrailingCommas = true,
    MaxDepth = 32
};
var reader = new Utf8JsonReader(data, options);
```

### 다중 세그먼트와 부분 데이터 재개

네트워크에서 오는 데이터는 하나의 연속 버퍼로 도착하지 않는다. 여러 조각으로 나뉘어 들어오고, 토큰이 조각 경계에 걸릴 수 있다. `Utf8JsonReader`는 이 상황을 위해 두 가지 장치를 제공한다.

**(1) `ReadOnlySequence<byte>` 생성자.** `System.Buffers`의 `ReadOnlySequence<T>`는 세그먼트 연결 리스트를 감싸는 구조체다(68.6절, 72.1절). 리더는 세그먼트 경계를 넘어 토큰을 이어 읽는다.

```csharp
Utf8JsonReader reader = new Utf8JsonReader(sequence, isFinalBlock: true, state: default);
```

값이 세그먼트 경계에 걸치면 `HasValueSequence`가 `true`가 되고, 값은 `ValueSpan` 대신 `ValueSequence`에 담긴다. 두 경우를 모두 처리해야 한다.

```csharp
static string ReadValue(ref Utf8JsonReader r) =>
    r.HasValueSequence
        ? Encoding.UTF8.GetString(r.ValueSequence.ToArray())  // 경계에 걸침 — 복사 발생
        : Encoding.UTF8.GetString(r.ValueSpan);               // 단일 스팬 — 복사 없음
```

`Encoding.GetString`에는 `ReadOnlySequence<byte>`를 받는 오버로드가 없어서 `ToArray()`로 평탄화해야 한다. 그래서 이 경로는 할당이 생긴다. 단순히 문자열이 필요할 뿐이라면 `r.GetString()`이 두 경우를 알아서 처리하므로 직접 분기할 이유가 없다 — 위 코드가 필요한 것은 **문자열이 아닌 형태로** 원시 바이트를 다뤄야 할 때다.

**(2) `isFinalBlock`과 `JsonReaderState`.** 데이터가 아직 다 도착하지 않았다면 `isFinalBlock: false`로 생성한다. 리더는 불완전한 토큰을 만나면 예외를 던지는 대신 그 지점에서 멈추고 `Read()`가 `false`를 반환한다. 그때까지 소비한 바이트 수는 `BytesConsumed`, 파서의 내부 상태는 `CurrentState`(타입은 `JsonReaderState`)에서 얻는다.

```csharp
JsonReaderState state = default;
long leftover = 0;
byte[] buffer = new byte[4096];

while (true)
{
    int read = stream.Read(buffer, (int)leftover, buffer.Length - (int)leftover);
    int available = (int)leftover + read;
    bool isFinal = read == 0;

    long consumed = ProcessChunk(
        buffer.AsSpan(0, available), isFinal, ref state);

    // 소비되지 않은 꼬리를 버퍼 앞으로 당긴다
    leftover = available - consumed;
    Buffer.BlockCopy(buffer, (int)consumed, buffer, 0, (int)leftover);

    if (isFinal) break;
}

static long ProcessChunk(ReadOnlySpan<byte> chunk, bool isFinal, ref JsonReaderState state)
{
    var reader = new Utf8JsonReader(chunk, isFinal, state);
    while (reader.Read())
    {
        // 토큰 처리
    }
    state = reader.CurrentState;   // 다음 호출로 상태를 이어 준다
    return reader.BytesConsumed;
}
```

> **📌 `JsonReaderState`는 왜 별도 타입인가**
>
> `Utf8JsonReader`는 `ref struct`라서 호출 사이에 보관할 수 없다. 반면 `JsonReaderState`는 **평범한 구조체**여서 필드에 담고, `async` 메서드에서 들고 다니고, 컬렉션에 넣을 수 있다. 즉 "스팬을 가리키는 부분"과 "파서의 논리적 상태"를 분리해서, 후자만 재개 가능하게 만든 설계다.
>
> `System.IO.Pipelines`가 이 패턴 위에 서 있다. 파이프에서 `ReadOnlySequence<byte>`를 받아 파싱하고, 소비한 만큼만 `AdvanceTo`로 알려 주는 구조가 정확히 위 코드의 일반화다.

> **⚠️ 부분 데이터 파싱에서 `BytesConsumed`를 무시하면 데이터가 사라진다**
>
> 리더가 멈춘 지점 뒤의 바이트는 아직 처리되지 않은 것이다. 다음 청크를 읽기 전에 그 꼬리를 반드시 앞으로 옮겨야 한다. 이 부분을 빼먹으면 토큰이 조각 경계에 걸릴 때마다 조용히 유실되고, 입력이 작을 때는 재현조차 되지 않는다.

### `Utf8JsonWriter`

전방 전용 JSON 라이터다. 지원하는 데이터 타입은 다음과 같다.

- `String`과 `DateTime` — JSON 문자열로 기록
- 숫자 타입 `Int32`, `UInt32`, `Int64`, `UInt64`, `Single`, `Double`, `Decimal` — JSON 숫자로 기록
- `bool` — `true`/`false` 리터럴
- JSON `null`
- 배열

이들을 JSON 표준에 맞게 객체로 조직할 수 있고, 표준에는 없지만 실무 파서들이 흔히 지원하는 **주석**도 쓸 수 있다.

```csharp
var options = new JsonWriterOptions { Indented = true };

using (var stream = File.Create("MyFile.json"))
using (var writer = new Utf8JsonWriter(stream, options))
{
    writer.WriteStartObject();

    // 이름과 값을 한 번에
    writer.WriteString("FirstName", "Dylan");
    writer.WriteString("LastName", "Lockwood");

    // 이름과 값을 따로
    writer.WritePropertyName("Age");
    writer.WriteNumberValue(46);

    writer.WriteCommentValue("This is a (non-standard) comment");

    writer.WriteEndObject();
}
```

결과:

```json
{
  "FirstName": "Dylan",
  "LastName": "Lockwood",
  "Age": 46
  /*This is a (non-standard) comment*/
}
```

`Indented`를 켜지 않았다면 `{"FirstName":"Dylan","LastName":"Lockwood","Age":46…}`처럼 한 줄로 나온다.

| 메서드 계열 | 예 | 용도 |
|---|---|---|
| 구조 | `WriteStartObject()`, `WriteEndObject()`, `WriteStartArray()`, `WriteEndArray()` | 중첩 구조 |
| 이름 + 값 | `WriteString(name, value)`, `WriteNumber(name, value)`, `WriteBoolean`, `WriteNull(name)` | 가장 흔한 형태 |
| 이름만 | `WritePropertyName(name)` | 값을 별도 호출로 쓸 때 |
| 값만 | `WriteStringValue`, `WriteNumberValue`, `WriteBooleanValue`, `WriteNullValue` | 배열 요소 |
| 원시 | `WriteRawValue(json)` | 검증 없이 그대로 삽입 ※.NET 6 |
| 제어 | `Flush()`, `FlushAsync()`, `Reset()` | 아래 참조 |
| 상태 | `BytesPending`, `BytesCommitted`, `CurrentDepth` | 진단·버퍼 관리 |

`WriteRawValue`는 문자열이나 바이트 배열을 JSON 스트림에 **그대로** 내보낸다. 특수한 경우에 유용하다 — 예를 들어 숫자를 항상 소수점이 있는 형태(`1`이 아니라 `1.0`)로 쓰고 싶을 때다.

### `JsonWriterOptions`

| 옵션 | 기본값 | 의미 |
|---|---|---|
| `Indented` | `false` | 들여쓰기와 줄바꿈 |
| `Encoder` | `null`(=`Default`) | 문자열 이스케이프 정책 (41.2절과 동일) |
| `SkipValidation` | `false` | **구조 검증 생략** |
| `MaxDepth` | 0(=1000) | 최대 중첩 깊이 ※.NET 6 |
| `IndentCharacter` / `IndentSize` / `NewLine` | 공백 2칸, `\n` | 들여쓰기 세부 ※.NET 9 |

기본 상태에서 라이터는 구조를 검증한다. `WriteStartObject()` 없이 `WriteString(name, value)`를 부르거나, 열린 객체를 닫지 않고 `Dispose`하면 `InvalidOperationException`이 난다.

> **⚠️ `SkipValidation = true`는 "빠른 모드"가 아니라 "깨진 JSON을 만들 자유"다**
>
> 검증을 끄면 라이터는 호출 순서를 확인하지 않는다. 배열 안에서 `WritePropertyName`을 불러도 막지 않고, 결과로 **유효하지 않은 JSON**이 나간다. 그 JSON은 쓰는 쪽에서는 아무 오류도 내지 않고, 며칠 뒤 읽는 쪽에서 `JsonException`으로 터진다.
>
> 켤 만한 자리는 단 하나 — 이미 검증된 JSON 조각을 `WriteRawValue`로 조립하는, 성능이 극단적으로 중요한 코드다. 그리고 그런 코드에는 반드시 출력 검증 테스트가 붙어 있어야 한다.

### `Flush`와 수명

`Utf8JsonWriter`는 내부 버퍼에 기록을 모았다가 스트림으로 밀어낸다. `BytesPending`은 아직 밀어내지 않은 양, `BytesCommitted`는 이미 내보낸 양이다.

- `Dispose()` / `DisposeAsync()`는 자동으로 플러시한다. `using`을 쓰면 신경 쓸 일이 없다.
- 스트림을 살려 두면서 라이터만 재활용하려면 `Reset()`을 쓴다.
- 비동기 스트림에는 `FlushAsync()`를 쓴다. 동기 `Flush()`를 비동기 스트림에 쓰면 40.15절에서 본 것처럼 스레드를 블로킹한다.

> **⚠️ 라이터를 `Dispose`하지 않으면 파일이 잘린다**
>
> 40.2절에서 본 스트림 데코레이터의 함정이 라이터에서도 그대로 재현된다. 마지막 버퍼가 스트림에 도달하지 못하고, 결과 파일은 중간에서 끊긴 채 남는다. 그 파일을 나중에 읽으면 "예상치 못한 JSON 끝" 오류가 나는데, 원인은 읽는 코드가 아니라 며칠 전 쓰기 코드에 있다.

### 성능 관점 정리

| 계층 | 할당 | 유연성 | 언제 쓰나 |
|---|---|---|---|
| `Utf8JsonReader`/`Writer` | 거의 없음 | 전부 손으로 | 초당 수만 건 이상, 고정 스키마, 일부 필드만 필요 |
| `JsonDocument` | 풀링 버퍼 1개 | 임의 접근(읽기 전용) | 스키마를 모르거나 일부만 꺼낼 때 |
| `JsonNode` | 노드마다 객체 | 임의 접근 + 수정 | DOM을 고쳐서 다시 써야 할 때 |
| `JsonSerializer` | 객체 그래프 전체 | 최고 | 대부분의 경우 |

> **💡 저수준으로 내려갈 이유가 있는지 먼저 확인하라**
>
> `Utf8JsonReader`로 직접 쓴 파서는 대개 `JsonSerializer`보다 빠르다. 대신 코드가 서너 배 길어지고, 중첩 처리·오류 처리·스키마 변경에 전부 손이 간다. **거대한 JSON에서 필드 두세 개만 필요한 경우**가 저수준 API의 전형적 정당화다 — 나머지를 `Skip()`으로 넘겨 버리면 객체를 하나도 만들지 않는다.
>
> 반대로 "전체를 객체로 만들어야 한다"면 `JsonSerializer`가 이미 잘 최적화된 같은 일을 한다. 손으로 쓴 파서가 더 빠를 가능성은 낮고, 버그가 있을 가능성은 높다.

---

## 41.4 DOM API — `JsonDocument`, `JsonNode`

### 두 개의 DOM

`System.Text.Json`에는 DOM 기반 API가 **두 개** 있다. 이름이 비슷해서 헷갈리지만 설계 의도가 다르다.

```text
              JsonDocument (읽기 전용)        JsonNode (읽기/쓰기)
              ─────────────────────           ────────────────────
  구성        JsonDocument   (class)          JsonNode     (abstract class)
              JsonElement    (struct)          ├ JsonValue  (class)
              JsonProperty   (struct)          ├ JsonArray  (class)
                                               └ JsonObject (class)
  파싱        요구 시(on demand)               지연 + 결과 캐시
  메모리      풀링 버퍼 하나를 빌려 씀          노드마다 객체 할당
  해제        IDisposable — Dispose 필수       불필요
  수정        불가                              가능
```

`JsonDocument`는 극도로 가볍다. 주목할 클래스는 `JsonDocument` 하나뿐이고, 나머지는 요구 시 원본 데이터를 파싱하는 가벼운 구조체 두 개(`JsonElement`, `JsonProperty`)다. `JsonNode`는 .NET 6에서 **쓰기 가능한 DOM**에 대한 요구를 만족시키려고 도입됐지만, 읽기 전용 시나리오에도 적합하고 인터페이스가 더 유창하다. 값·배열·객체마다 클래스를 쓰므로 GC 비용이 생기지만 대부분의 현실 시나리오에서는 무시할 만하다.

> **📌 현실적으로는 대개 `JsonNode` 하나만 배워도 된다**
>
> 대부분의 실제 시나리오에서 `JsonDocument`가 `JsonNode`보다 갖는 성능 이점은 미미하다. `JsonNode`는 지연 파싱이면서 파싱 결과를 **캐시**하기 때문에, 같은 노드를 반복해서 읽는 패턴에서는 오히려 `JsonDocument`보다 빠를 수 있다.
>
> `JsonDocument`를 굳이 선택할 이유는 두 가지다 — (1) 한 번 훑고 버리는 대량 처리에서 할당을 최소화해야 할 때, (2) 이미 `JsonElement`를 다루는 API와 맞물려야 할 때.

### `JsonDocument`

정적 `Parse` 메서드로 스트림, 문자열, 메모리 버퍼에서 만든다.

```csharp
using JsonDocument document = JsonDocument.Parse(jsonString);
JsonElement root = document.RootElement;
Console.WriteLine(root.ValueKind);
```

`Parse`에는 선택적으로 `JsonDocumentOptions`를 넘겨 후행 쉼표·주석·최대 중첩 깊이를 제어한다(41.3절의 `JsonReaderOptions`와 같은 항목이다).

`JsonElement`는 JSON 값(문자열, 숫자, `true`/`false`, `null`), 배열, 객체 중 하나를 표현한다. 어느 것인지는 `ValueKind`가 알려 준다.

| `JsonValueKind` | 의미 |
|---|---|
| `Undefined` | 기본값 — 유효하지 않은 `JsonElement` |
| `Object` / `Array` | 객체 / 배열 |
| `String` / `Number` | 문자열 / 숫자 |
| `True` / `False` / `Null` | 리터럴 |

#### 값 읽기

```csharp
using JsonDocument document = JsonDocument.Parse("123");
int number = document.RootElement.GetInt32();
```

`GetString`, `GetInt32`, `GetBoolean` 외에도 `DateTime`이나 Base64 이진 데이터로 파싱하는 메서드가 있다. 예외를 던지지 않는 `TryGet*` 버전도 있다.

#### 배열 읽기

```csharp
using JsonDocument document = JsonDocument.Parse("[1, 2, 3, 4, 5]");
int length = document.RootElement.GetArrayLength();   // 5
int value  = document.RootElement[3].GetInt32();      // 4

foreach (JsonElement item in document.RootElement.EnumerateArray()) { … }
```

#### 객체 읽기

```csharp
using JsonDocument document = JsonDocument.Parse("""{ "Age": 32 }""");
JsonElement root = document.RootElement;

int age = root.GetProperty("Age").GetInt32();          // 없으면 예외
if (root.TryGetProperty("Age", out JsonElement v)) { … }   // 없으면 false

// 프로퍼티를 "발견"하기
JsonProperty ageProp = root.EnumerateObject().First();
string name = ageProp.Name;               // "Age"
JsonElement value = ageProp.Value;
Console.WriteLine(value.ValueKind);       // Number
Console.WriteLine(value.GetInt32());      // 32
```

> **⚠️ 기대한 종류가 아니면 예외가 난다**
>
> 위 메서드들은 요소가 기대한 종류가 아니면 예외를 던진다. JSON 파일의 스키마를 확신할 수 없다면 **먼저 `ValueKind`를 검사**하거나 `TryGet*` 메서드를 써라. 신뢰할 수 없는 입력에서 이 검사를 생략하는 것이 41.8절의 "타입 혼동" 항목이다.
>
> 모든 종류에서 동작하는 메서드도 두 개 있다. `GetRawText()`는 안쪽 JSON을 문자열로 돌려주고, `WriteTo`는 그 요소를 `Utf8JsonWriter`에 기록한다.

#### 반드시 `Dispose`해야 하는 이유

`JsonDocument`는 효율을 높이기 위해 **풀링된 메모리**를 쓴다. 가비지 컬렉션을 최소화하려는 설계다. 결과적으로 사용 후 반드시 해제해야 한다 — 그러지 않으면 빌린 메모리가 풀로 돌아가지 않는다.

> **⚠️ `JsonDocument`는 `IDisposable`이고, 그 여파는 전염된다**
>
> 1. **`using`을 빼먹으면 풀 메모리가 반환되지 않는다.** 즉시 크래시하지는 않지만 `ArrayPool`의 재사용률이 떨어지고 할당이 늘어난다. 부하가 높을수록 뚜렷해진다.
> 2. **필드에 저장하는 클래스는 자기도 `IDisposable`을 구현해야 한다.** 33.3절의 전파 규칙 그대로다. 이게 부담스러우면 `JsonNode`를 써라.
> 3. **`RootElement`를 바깥으로 내보내면 안 된다.** `JsonElement`는 `JsonDocument`가 빌린 버퍼를 가리키는 구조체다. 문서가 해제되면 그 버퍼는 풀로 반환되어 **다른 코드가 덮어쓴다.** 해제 후에 `JsonElement`를 읽으면 `ObjectDisposedException`이 나거나, 더 나쁘게는 **다른 요청의 데이터**를 읽는다.
>
> 문서의 수명을 넘겨 살아남아야 하는 요소는 반드시 복제한다.
>
> ```csharp
> JsonElement Snapshot(string json)
> {
>     using JsonDocument doc = JsonDocument.Parse(json);
>     return doc.RootElement.Clone();   // 독립된 복사본
> }
> ```
>
> `Clone()`은 해당 부분 트리를 자체 메모리로 복사한 독립적인 `JsonElement`를 만든다. 이 함정은 정적 분석기가 잡아 주지 않는다.

#### `JsonDocument`와 LINQ

`JsonDocument`는 LINQ와 잘 어울린다. 다음 파일을 보자.

```json
[
  { "FirstName":"Sara",  "LastName":"Wells",    "Age":35, "Friends":["Ian"] },
  { "FirstName":"Ian",   "LastName":"Weems",    "Age":42, "Friends":["Joe","Eric","Li"] },
  { "FirstName":"Dylan", "LastName":"Lockwood", "Age":46, "Friends":["Sara","Ian"] }
]
```

```csharp
using var stream = File.OpenRead(jsonPath);
using JsonDocument document = JsonDocument.Parse(stream);

var query =
    from person in document.RootElement.EnumerateArray()
    select new
    {
        FirstName = person.GetProperty("FirstName").GetString(),
        Age = person.GetProperty("Age").GetInt32(),
        Friends =
            from friend in person.GetProperty("Friends").EnumerateArray()
            select friend.GetString()
    };
```

> **⚠️ 지연 평가와 `using`이 만나는 지점**
>
> LINQ 쿼리는 지연 평가된다. `JsonDocument`가 `using` 범위를 벗어나면서 해제되기 **전에** 쿼리를 열거해야 한다. `return query;`로 쿼리 객체를 밖으로 내보내는 코드는 컴파일되고, 호출자가 열거하는 순간 터진다.
>
> 안전한 형태는 범위 안에서 `ToList()`로 구체화하거나(단, 그 안의 `JsonElement`도 `Clone()`해야 한다), 애초에 `JsonNode`를 쓰는 것이다.

#### 읽기 전용 DOM으로 수정본 만들기

`JsonDocument`는 읽기 전용이지만, `JsonElement`의 `WriteTo`로 내용을 `Utf8JsonWriter`에 보낼 수 있다. 이것이 "수정된 JSON을 만드는" 우회로다. 친구가 둘 이상인 사람만 새 파일에 쓰는 예다.

```csharp
using var json = File.OpenRead(jsonPath);
using JsonDocument document = JsonDocument.Parse(json);
var options = new JsonWriterOptions { Indented = true };

using (var outputStream = File.Create("NewFile.json"))
using (var writer = new Utf8JsonWriter(outputStream, options))
{
    writer.WriteStartArray();
    foreach (var person in document.RootElement.EnumerateArray())
    {
        int friendCount = person.GetProperty("Friends").GetArrayLength();
        if (friendCount >= 2)
            person.WriteTo(writer);
    }
    writer.WriteEndArray();
}
```

DOM 자체를 갱신할 능력이 필요하다면 `JsonNode`가 더 나은 해법이다.

### `JsonNode`

`System.Text.Json.Nodes`에 있다. ※.NET 6

```csharp
using System.Text.Json.Nodes;

JsonNode? node = JsonNode.Parse(jsonString);
```

`Parse`는 스트림, 문자열, 메모리 버퍼, 그리고 `Utf8JsonReader`에서 만들 수 있다. `JsonDocumentOptions`로 후행 쉼표·주석·최대 깊이를 제어한다. **`JsonDocument`와 달리 해제가 필요 없다.**

`Parse`는 `JsonNode`의 하위 타입 — `JsonValue`, `JsonObject`, `JsonArray` 중 하나 — 를 반환한다. 다운캐스트의 번잡함을 줄이려고 `AsValue()`, `AsObject()`, `AsArray()` 헬퍼를 제공한다.

```csharp
var node = JsonNode.Parse("123");            // JsonValue
int number = node.AsValue().GetValue<int>();
```

가장 자주 쓰는 멤버는 `JsonNode` 자체에 노출돼 있어서 대개 이 헬퍼를 부를 필요조차 없다.

```csharp
int number = node.GetValue<int>();
```

#### 값 읽기 — 명시적 캐스트

`JsonNode`는 C#의 명시적 변환 연산자를 오버로드한다(22장).

```csharp
var node = JsonNode.Parse("123");
int number = (int) node;
```

표준 숫자 타입, `char`, `bool`, `DateTime`, `DateTimeOffset`, `Guid`(와 각각의 널 허용 버전), 그리고 `string`에 대해 동작한다.

파싱 성공이 확실하지 않으면 `TryGetValue`를 쓴다.

```csharp
if (node.AsValue().TryGetValue<int>(out var n))
    Console.WriteLine(n);
```

※.NET 8부터 `node.GetValueKind()`로 노드가 문자열·숫자·배열·객체·`true`/`false` 중 무엇인지 알 수 있다.

> **📌 `JsonNode`는 내부적으로 `JsonElement`에 기대고 있다**
>
> JSON 텍스트에서 파싱된 노드는 내부적으로 `JsonElement`가 뒷받침한다. 다음처럼 꺼낼 수 있다.
>
> ```csharp
> JsonElement je = node.GetValue<JsonElement>();
> ```
>
> 단, 명시적으로 생성한 노드(DOM을 갱신할 때 만드는 노드)에는 통하지 않는다. 그런 노드는 `JsonElement`가 아니라 실제 파싱된 값이 뒷받침한다.

#### 배열과 객체

`JsonArray`는 `IList<JsonNode>`를, `JsonObject`는 `IDictionary<string, JsonNode>`를 구현한다. 그래서 익숙한 방식으로 다룰 수 있다.

```csharp
var node = JsonNode.Parse("[1, 2, 3, 4, 5]");
Console.WriteLine(node.AsArray().Count);     // 5
Console.WriteLine((int) node[0]);            // 1

int[] values = node.AsArray().GetValues<int>().ToArray();   // ※.NET 8
```

```csharp
var node = JsonNode.Parse("""{ "Name":"Alice", "Age": 32 }""");
string name = (string) node["Name"];         // Alice
int age = (int) node["Age"];                 // 32

foreach (KeyValuePair<string, JsonNode> kv in node.AsObject())
{
    string propertyName = kv.Key;
    JsonNode value = kv.Value;
}

if (node.AsObject().TryGetPropertyValue("Name", out JsonNode nameNode)) { … }
```

#### 유창한 탐색과 LINQ

인덱서만으로 계층 깊숙이 도달할 수 있다.

```csharp
string li = (string) node[1]["Friends"][2];   // 두 번째 사람의 세 번째 친구
```

```csharp
JsonNode node = JsonNode.Parse(File.ReadAllText(jsonPath));
var query =
    from person in node.AsArray()
    select new
    {
        FirstName = (string) person["FirstName"],
        Age = (int) person["Age"],
        Friends = from friend in person["Friends"].AsArray()
                  select (string) friend
    };
```

`JsonDocument`와 달리 `JsonNode`는 해제 대상이 아니므로 지연 열거 중 해제 걱정이 없다.

#### DOM 갱신

```csharp
var node = JsonNode.Parse("""{ "Color": "Red" }""");
node["Color"] = "White";          // 교체
node["Valid"] = true;             // 추가
Console.WriteLine(node.ToJsonString());   // {"Color":"White","Valid":true}
```

`node["Color"] = "White";`는 `node["Color"] = JsonValue.Create("White");`의 축약이다. 단순 값 대신 `JsonArray`나 `JsonObject`를 대입할 수도 있다.

프로퍼티를 지우려면 `JsonObject`로 캐스트하고 `Remove`를 부른다. (`Add`도 있으며, 이미 있는 프로퍼티를 추가하려 하면 예외가 난다.)

```csharp
node.AsObject().Remove("Valid");
```

배열도 인덱서로 교체하고, `AsArray()`를 통해 `Add`/`Insert`/`Remove`/`RemoveAt`을 쓴다.

```csharp
var arrayNode = JsonNode.Parse("[1, 2, 3]");
arrayNode.AsArray().RemoveAt(0);
arrayNode.AsArray().Add(4);
Console.WriteLine(arrayNode.ToJsonString());   // [2,3,4]
```

※.NET 8부터 `ReplaceWith`로 노드 자체를 교체할 수 있다.

```csharp
var node = JsonNode.Parse("""{ "Color": "Red" }""");
var color = node["Color"];
color.ReplaceWith("Blue");
```

#### DOM을 코드로 구성하기

`JsonArray`와 `JsonObject`는 객체 초기화 구문을 지원해서, DOM 전체를 하나의 식으로 만들 수 있다.

```csharp
var node = new JsonArray
{
    new JsonObject {
        ["Name"] = "Tracy",
        ["Age"] = 30,
        ["Friends"] = new JsonArray("Lisa", "Joe")
    },
    new JsonObject {
        ["Name"] = "Jordyn",
        ["Age"] = 25,
        ["Friends"] = new JsonArray("Tracy", "Li")
    }
};
```

```json
[
  { "Name": "Tracy",  "Age": 30, "Friends": ["Lisa", "Joe"] },
  { "Name": "Jordyn", "Age": 25, "Friends": ["Tracy", "Li"] }
]
```

> **📌 `ToString()`과 `ToJsonString()`은 다르다**
>
> `JsonNode.ToString()`은 **사람이 읽는 들여쓰기된** JSON 문자열을 돌려준다. `ToJsonString()`은 **압축된** JSON 문자열을 돌려준다. 로그에 노드를 문자열 보간으로 끼워 넣으면 `ToString()`이 불려서 여러 줄이 나온다 — 의도한 결과가 아닌 경우가 많다.
>
> ※.NET 8부터 `DeepEquals`로 두 노드를 JSON 문자열로 펼치지 않고 비교할 수 있고, `DeepClone`으로 깊은 복사를 할 수 있다.

### 넷 중 무엇을 쓸 것인가

| 상황 | 선택 |
|---|---|
| 대상 타입 클래스가 있고 전체를 객체로 만든다 | `JsonSerializer` |
| 스키마를 모른다. 읽기만 한다 | `JsonDocument` 또는 `JsonNode` |
| 스키마를 모른다. **고쳐서 다시 써야** 한다 | `JsonNode` |
| 문서를 필드에 오래 보관해야 한다 | `JsonNode` (`IDisposable` 전파 회피) |
| 거대한 문서에서 몇 필드만 뽑는다 | `Utf8JsonReader` + `Skip()` |
| 스트리밍 중 부분 데이터를 이어 파싱한다 | `Utf8JsonReader` + `JsonReaderState` |
| 알려진 부분 + 알려지지 않은 나머지 | `JsonSerializer` + `[JsonExtensionData]` |
| 객체와 DOM을 섞어 쓴다 | `SerializeToNode` / `JsonNode.Deserialize<T>()` |

마지막 항목은 실무에서 유용한 다리다.

```csharp
JsonNode? node = JsonSerializer.SerializeToNode(order);   // 객체 → DOM
node!["signature"] = ComputeSignature(node);              // DOM에서 손보고
string json = node.ToJsonString();                        // 문자열로

Order? back = node.Deserialize<Order>();                  // DOM → 객체
```

---

## 41.5 커스텀 컨버터와 다형 직렬화

### `JsonConverter<T>`

기본 규칙이 원하는 결과를 못 낼 때, 특정 타입의 변환을 통째로 가로챌 수 있다. `JsonConverter<T>`(`T`는 컨버터가 다루는 타입)를 상속하고 두 추상 메서드를 재정의한다.

```csharp
public abstract T? Read(ref Utf8JsonReader reader, Type typeToConvert,
                        JsonSerializerOptions options);
public abstract void Write(Utf8JsonWriter writer, T value,
                           JsonSerializerOptions options);
```

시그니처만 봐도 구조가 보인다. 컨버터는 41.3절의 저수준 리더·라이터를 그대로 받는다. `JsonSerializer`는 결국 저수준 API 위의 레이어이고, 컨버터는 그 레이어에 뚫린 구멍이다.

흔한 사례 하나 — 객체의 `null` 문자열을 JSON에서는 빈 문자열로, 다시 읽을 때는 `null`로 바꾸는 컨버터다.

```csharp
public class JsonStringNullToEmptyConverter : JsonConverter<string>
{
    // 기본적으로 null 값은 성능을 위해 변환 과정을 거치지 않는다.
    // 여기서는 null도 처리해야 하므로 명시적으로 켠다.
    public override bool HandleNull => true;

    public override string? Read(ref Utf8JsonReader reader, Type typeToConvert,
                                 JsonSerializerOptions options)
    {
        var value = reader.GetString();
        if (string.IsNullOrEmpty(value)) return null;
        return value;
    }

    public override void Write(Utf8JsonWriter writer, string? value,
                               JsonSerializerOptions options)
    {
        value ??= string.Empty;
        writer.WriteStringValue(value);
    }
}
```

등록하고 확인한다.

```csharp
var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = null,
    IncludeFields = true,
    WriteIndented = true,
    Converters = { new JsonStringNullToEmptyConverter() },
};

var radio = new Radio { HasSubWoofers = true, HasTweeters = true, RadioId = null };
Console.WriteLine(JsonSerializer.Serialize(radio, options));
```

`RadioId`는 `null` 대신 빈 문자열로 나간다. 반면 `StationPresets`(타입이 `List<string>`)는 여전히 `null`이다 — **컨버터는 `string` 타입에만 작용하지 `List<string>`에는 작용하지 않는다.**

> **⚠️ 컨버터는 선언된 타입에 정확히 매칭된다**
>
> `JsonConverter<string>`은 `string` 프로퍼티에만 붙는다. `List<string>`, `string[]`, `Dictionary<string, string>`의 원소에는 붙지 않는다. 컬렉션 원소까지 다루려면 컬렉션 타입용 컨버터를 따로 만들거나, 다음 항목의 **팩터리 컨버터**를 쓴다.
>
> 이 사실을 모르면 "컨버터를 등록했는데 일부만 적용된다"는 현상에 빠진다.

### `Read` 구현의 계약

`Read` 메서드에는 문서화된 계약이 있고, 어기면 조용히 깨진다.

| 규칙 | 설명 |
|---|---|
| 진입 시 위치 | `reader`는 이미 이 값의 **첫 토큰**에 있다. 진입 직후 `Read()`를 부르면 안 된다 |
| 반환 시 위치 | 이 값의 **마지막 토큰**에 있어야 한다. 객체를 읽었다면 `EndObject` 위 |
| 과소 소비 | 값의 일부만 읽고 반환하면 상위 파서가 어긋난다 |
| 과다 소비 | 값 뒤까지 읽으면 다음 프로퍼티가 사라진다 |
| `ref` 전달 | `reader`는 `ref`로 받는다. 값 복사본을 만들어 읽으면 위치가 반영되지 않는다 |

```csharp
public override Point Read(ref Utf8JsonReader reader, Type t, JsonSerializerOptions o)
{
    if (reader.TokenType != JsonTokenType.StartObject)
        throw new JsonException("객체가 아니다");

    int x = 0, y = 0;
    while (reader.Read())
    {
        if (reader.TokenType == JsonTokenType.EndObject)
            return new Point(x, y);      // EndObject 위에서 반환 — 올바름

        if (reader.TokenType != JsonTokenType.PropertyName) continue;

        if (reader.ValueTextEquals("x"u8))      { reader.Read(); x = reader.GetInt32(); }
        else if (reader.ValueTextEquals("y"u8)) { reader.Read(); y = reader.GetInt32(); }
        else                                    { reader.Skip(); }   // 모르는 값은 통째로
    }
    throw new JsonException("JSON이 끝났다");
}
```

모르는 프로퍼티에 `reader.Skip()`을 쓰는 것이 중요하다. 값이 중첩 객체나 배열이면 토큰 하나로 끝나지 않기 때문이다.

> **💡 컨버터 안에서 다른 타입을 직렬화할 때는 `options`를 넘겨라**
>
> ```csharp
> // 나쁨 — 바깥 설정(이름 정책, 다른 컨버터)이 전부 무시된다
> JsonSerializer.Serialize(writer, value.Inner);
>
> // 좋음
> JsonSerializer.Serialize(writer, value.Inner, options);
> ```
>
> 두 번째 형태는 옵션에 캐시된 `JsonTypeInfo`도 재사용한다. 41.2절의 캐시 논의가 컨버터 안에서도 똑같이 적용된다.

### 팩터리 컨버터

제네릭 타입처럼 "타입 하나"가 아니라 "타입의 부류"를 다뤄야 할 때는 `JsonConverterFactory`를 쓴다.

```csharp
public sealed class NullableStructConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType &&
        typeToConvert.GetGenericTypeDefinition() == typeof(Wrapper<>);

    public override JsonConverter CreateConverter(Type typeToConvert,
                                                  JsonSerializerOptions options)
    {
        Type inner = typeToConvert.GetGenericArguments()[0];
        Type converterType = typeof(WrapperConverter<>).MakeGenericType(inner);
        return (JsonConverter)Activator.CreateInstance(converterType)!;
    }
}
```

`CanConvert`가 `true`를 돌려준 타입에 대해서만 `CreateConverter`가 불린다. 생성된 컨버터는 옵션 인스턴스에 캐시되므로, 팩터리 자체는 타입당 한 번만 호출된다.

> **⚠️ 팩터리는 `MakeGenericType`을 쓴다 — AOT에서 위험하다**
>
> `Activator.CreateInstance`와 `MakeGenericType`은 런타임 코드 생성에 의존한다. Native AOT에서는 해당 인스턴스화가 미리 생성돼 있지 않으면 실패한다(57.14절). 41.6절의 소스 생성 경로를 쓰는 프로젝트라면 팩터리 컨버터를 최소화하거나, 필요한 인스턴스화를 명시적으로 뿌리로 등록해야 한다.

### 등록 방법과 우선순위

컨버터를 붙이는 방법은 세 가지이고, **충돌하면 정해진 순서로 결정된다.**

| 순위 | 방법 | 예 |
|---|---|---|
| 1 (가장 강함) | **프로퍼티·필드에 `[JsonConverter]`** | `[JsonConverter(typeof(EpochConverter))] public DateTime CreatedAt { get; set; }` |
| 2 | **`JsonSerializerOptions.Converters` 컬렉션** | `options.Converters.Add(new EpochConverter())` |
| 3 (가장 약함) | **타입 선언에 `[JsonConverter]`** | `[JsonConverter(typeof(MoneyConverter))] public readonly struct Money { … }` |

`Converters` 컬렉션 안에서는 **먼저 등록된 컨버터가 이긴다.** 목록을 앞에서부터 훑으며 `CanConvert`가 처음 `true`를 반환하는 컨버터를 쓴다.

> **⚠️ 컨버터 등록 순서가 결과를 바꾼다**
>
> ```csharp
> options.Converters.Add(new AllDateTimeConverter());   // CanConvert: DateTime 전부
> options.Converters.Add(new EpochDateTimeConverter()); // 영원히 선택되지 않음
> ```
>
> 넓게 잡는 컨버터를 먼저 등록하면 뒤의 특화 컨버터가 죽는다. 이 버그는 예외도 경고도 없이 "왜 이 컨버터가 안 먹지"로만 나타난다. **좁은 것부터 넓은 것 순으로 등록**하는 것을 규칙으로 삼아라.
>
> 특정 프로퍼티만 다르게 다루고 싶다면 컬렉션에 넣지 말고 그 프로퍼티에 `[JsonConverter]`를 붙이는 편이 훨씬 안전하다 — 우선순위 1이므로 다른 어떤 등록도 이긴다.

### 다형 직렬화 — 문제의 정의

```csharp
public abstract class Shape { public string Name { get; set; } = ""; }
public sealed class Circle : Shape { public double Radius { get; set; } }
public sealed class Square : Shape { public double Side { get; set; } }

Shape s = new Circle { Name = "c", Radius = 2 };
Console.WriteLine(JsonSerializer.Serialize(s));
```

.NET 7 이전 기본 동작에서 출력은 `{"Name":"c"}`다. `Radius`가 사라진다.

이유는 명확하다. `Serialize<T>`의 `T`가 `Shape`로 추론되고, 직렬화기는 **선언된 타입의 계약**으로 쓴다. 런타임 타입이 무엇인지는 보지 않는다. `JsonSerializer.Serialize(s, s.GetType())`처럼 런타임 타입을 명시하면 파생 멤버가 나오지만, 그건 최상위 객체에만 통하고 **컬렉션 원소나 프로퍼티**에는 통하지 않는다.

그리고 직렬화가 됐다 해도 역직렬화가 남는다. `{"Name":"c","Radius":2}`를 받은 쪽은 이게 `Circle`인지 알 방법이 없다.

### `[JsonDerivedType]` ※.NET 7

.NET 7은 이 문제를 언어 수준의 선언으로 해결했다.

```csharp
[JsonDerivedType(typeof(Circle), typeDiscriminator: "circle")]
[JsonDerivedType(typeof(Square), typeDiscriminator: "square")]
public abstract class Shape { public string Name { get; set; } = ""; }
```

```csharp
Shape s = new Circle { Name = "c", Radius = 2 };
JsonSerializer.Serialize(s);
// {"$type":"circle","Name":"c","Radius":2}

Shape? back = JsonSerializer.Deserialize<Shape>(json);   // Circle 인스턴스
```

판별자 프로퍼티 이름의 기본값은 `$type`이다. `[JsonPolymorphic]`으로 바꿀 수 있다.

```csharp
[JsonPolymorphic(
    TypeDiscriminatorPropertyName = "kind",
    UnknownDerivedTypeHandling = JsonUnknownDerivedTypeHandling.FailSerialization,
    IgnoreUnrecognizedTypeDiscriminators = false)]
[JsonDerivedType(typeof(Circle), "circle")]
[JsonDerivedType(typeof(Square), "square")]
public abstract class Shape { … }
```

| `JsonUnknownDerivedTypeHandling` | 선언되지 않은 파생 타입을 만나면 |
|---|---|
| `FailSerialization` (기본값) | 예외 |
| `FallBackToBaseType` | 기반 타입의 계약으로 직렬화 (파생 멤버 손실) |
| `FallBackToNearestAncestor` | 선언된 가장 가까운 조상의 계약으로 직렬화 |

판별자는 문자열뿐 아니라 정수도 쓸 수 있다. `[JsonDerivedType(typeof(Circle), 1)]`처럼.

> **⚠️ `$type`은 페이로드 맨 앞에 있어야 한다**
>
> 역직렬화기는 어떤 타입을 만들지 먼저 알아야 프로퍼티를 채울 수 있다. 그래서 타입 판별자는 JSON 객체의 **첫 프로퍼티**여야 한다는 제약이 있었다. 다른 언어의 직렬화기가 프로퍼티 순서를 보장하지 않고 보내면 역직렬화가 실패한다.
>
> ※.NET 9의 `JsonSerializerOptions.AllowOutOfOrderMetadataProperties`가 이 제약을 완화한다. 켜면 판별자가 뒤에 있어도 처리하지만, 그러려면 판별자를 찾을 때까지 앞 내용을 버퍼링해야 하므로 **비용과 메모리 사용이 늘어난다.** 상호운용 문제를 만났을 때만 켜라.

### .NET 7 이전의 수동 방식

`[JsonDerivedType]`이 없던 시절에는 컨버터로 같은 일을 손으로 했다. 지금도 판별자 이름·위치·형식이 이미 정해진 외부 API와 맞춰야 할 때 필요한 패턴이다.

```csharp
public sealed class ShapeConverter : JsonConverter<Shape>
{
    // 허용 목록 — 여기 없는 이름은 어떤 경우에도 만들지 않는다
    private static readonly Dictionary<string, Type> s_allowed = new()
    {
        ["circle"] = typeof(Circle),
        ["square"] = typeof(Square),
    };

    public override Shape? Read(ref Utf8JsonReader reader, Type t,
                                JsonSerializerOptions options)
    {
        // 판별자를 찾기 위해 값 전체를 DOM으로 먼저 읽는다
        using JsonDocument doc = JsonDocument.ParseValue(ref reader);
        JsonElement root = doc.RootElement;

        if (!root.TryGetProperty("kind", out JsonElement kindElement) ||
            kindElement.ValueKind != JsonValueKind.String)
            throw new JsonException("kind 프로퍼티가 없다");

        string kind = kindElement.GetString()!;
        if (!s_allowed.TryGetValue(kind, out Type? target))
            throw new JsonException($"허용되지 않은 kind: {kind}");

        return (Shape?)root.Deserialize(target, options);
    }

    public override void Write(Utf8JsonWriter writer, Shape value,
                               JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString("kind", value switch
        {
            Circle => "circle",
            Square => "square",
            _ => throw new JsonException($"알 수 없는 도형: {value.GetType()}")
        });

        // 런타임 타입으로 나머지를 쓰고, 그 결과를 펼쳐 넣는다
        using JsonDocument body =
            JsonSerializer.SerializeToDocument(value, value.GetType(), options);
        foreach (JsonProperty p in body.RootElement.EnumerateObject())
            p.WriteTo(writer);

        writer.WriteEndObject();
    }
}
```

> **⚠️ 이 컨버터를 그 타입 자신에 등록하면 무한 재귀가 된다**
>
> `Write` 안에서 `SerializeToDocument(value, value.GetType(), options)`를 부를 때, `value.GetType()`이 `Shape`가 아니라 구체 타입(`Circle`)이라는 점이 중요하다. 만약 컨버터가 `Circle`에도 매칭되도록 `CanConvert`를 넓게 잡으면 `Write` → `Serialize` → `Write` → … 로 스택 오버플로가 난다.
>
> `JsonConverter<T>`의 기본 `CanConvert`는 **정확히 `T`일 때만** `true`를 반환하므로(파생 타입은 매칭되지 않는다) 위 코드는 그대로 두면 안전하다. 위험해지는 것은 `CanConvert`를 `typeof(Shape).IsAssignableFrom(t)`처럼 넓게 **재정의했을 때**다. 이 패턴에서 `CanConvert`를 손댈 이유가 있다면, 기반 타입에만 걸리는지 반드시 확인해라.

### 타입 이름을 신뢰하면 안 되는 이유

다형 직렬화의 본질은 "**바이트가 만들 타입을 지시한다**"는 것이다. 이 문장이 위험한 이유는 41.7절 전체의 주제이기도 하다.

```text
   신뢰할 수 없는 JSON
   ┌──────────────────────────────────┐
   │ {"$type":"…어떤 타입 이름…", … } │
   └──────────────┬───────────────────┘
                  │
                  ▼
   역직렬화기가 그 이름으로 타입을 찾아 인스턴스를 만든다
                  │
                  ▼
   생성자 · 세터 · 콜백이 실행된다  ← 공격자가 원하는 것은 여기
```

핵심은 이것이다. **역직렬화는 "데이터를 채우는 일"이 아니라 "코드를 실행하는 일"이다.** 프로퍼티 세터가 실행되고, 생성자가 실행되고, 콜백이 실행된다. 공격자가 만들 타입을 고를 수 있다면, 애플리케이션이 이미 로드한 수천 개 타입 중 위험한 부작용을 가진 것을 찾아 사슬처럼 엮을 수 있다.

`System.Text.Json`의 설계는 이 위험을 구조적으로 차단한다.

| 항목 | `System.Text.Json` | Json.NET의 `TypeNameHandling` |
|---|---|---|
| 만들 수 있는 타입 | `[JsonDerivedType]`으로 **선언된 닫힌 집합**만 | `$type` 문자열이 지시하는 **임의 타입** |
| 판별자의 내용 | 개발자가 정한 짧은 별칭(`"circle"`) | 어셈블리 한정 타입 이름 |
| 임의 타입 로드 모드 | **존재하지 않음** | `TypeNameHandling.All`/`Auto`/`Objects` |

> **⚠️ Json.NET의 `TypeNameHandling`은 JSON판 `BinaryFormatter`다**
>
> `TypeNameHandling`을 `None` 이외의 값으로 설정하고 신뢰할 수 없는 데이터를 역직렬화하는 코드는 `BinaryFormatter`와 **정확히 같은 부류의 원격 코드 실행 취약점**을 가진다. JSON이 텍스트 형식이라는 사실은 아무 보호도 제공하지 않는다.
>
> 레거시 코드에서 이 설정을 발견하면, `SerializationBinder`를 붙여 허용 목록을 강제하거나(부분적 완화) 다형성 자체를 명시적 판별자 방식으로 재설계해야 한다. 코드 리뷰 체크리스트에 `TypeNameHandling`을 넣어 둬라.

> **💡 다형성을 쓰기 전에 정말 필요한지 물어라**
>
> 외부 경계에서 다형 역직렬화가 정말 필요한 경우는 생각보다 드물다. 대안은 대개 더 단순하다.
>
> - **판별 유니온을 손으로 만든다** — 필드 여러 개를 가진 하나의 DTO로 받고, `kind`를 보고 코드에서 분기한다.
> - **엔드포인트를 나눈다** — `/shapes/circle`, `/shapes/square`. 타입이 URL에 있으면 페이로드가 타입을 지시할 필요가 없다.
>
> 다형 역직렬화는 **내부 신뢰 경계 안**(예: 자기 자신이 쓴 캐시)에서는 편리하고, 경계 밖에서는 항상 비용이 따른다.

---

## 41.6 소스 생성 JSON 컨텍스트와 AOT 호환성

### 리플렉션 기반 경로의 두 가지 비용

41.2절에서 본 것처럼, `JsonSerializer`는 처음 어떤 타입을 다룰 때 리플렉션으로 멤버를 조사해 `JsonTypeInfo`를 만든다. 이 방식에는 두 가지 대가가 있다.

**(1) 시작 시간과 실행 코드 생성.** 타입 분석은 느리고, 게터·세터 호출을 빠르게 만들기 위해 런타임에 델리게이트를 생성한다(57.13절). 짧게 살다 죽는 프로세스 — 서버리스 함수, CLI 도구 — 에서는 이 비용이 전체 실행 시간에서 무시할 수 없는 비율을 차지한다.

**(2) 트리밍·Native AOT와의 충돌.** 트리머는 "코드에서 참조되지 않는 것"을 잘라낸다. 리플렉션으로만 접근되는 프로퍼티는 정적 분석으로 보이지 않으므로 잘려 나간다. 그 결과 트리밍된 앱에서 프로퍼티가 조용히 사라지거나 예외가 난다. Native AOT는 런타임 코드 생성 자체가 불가능하므로 더 근본적으로 막힌다(55.7절, 57.14절).

### 해법 — 컴파일 타임에 계약을 만든다

`System.Text.Json`의 소스 생성기는 **컴파일 시점에** 각 타입의 직렬화 코드와 메타데이터를 C# 소스로 생성한다. 리플렉션이 필요 없어지고, 생성된 코드는 트리머가 볼 수 있는 평범한 코드다.

```csharp
using System.Text.Json.Serialization;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    WriteIndented = false)]
[JsonSerializable(typeof(Order))]
[JsonSerializable(typeof(List<Order>))]
internal partial class AppJsonContext : JsonSerializerContext
{
}
```

세 가지가 필수다. **`partial`** (생성기가 나머지 절반을 채운다), **`JsonSerializerContext` 상속**, 그리고 직렬화할 각 루트 타입에 대한 **`[JsonSerializable]`**. 루트 타입에서 도달 가능한 타입은 자동으로 함께 생성되지만, 최상위로 직접 직렬화하는 타입(`List<Order>` 같은 것)은 명시해야 한다.

사용법은 두 가지다.

```csharp
// (1) 생성된 JsonTypeInfo를 직접 넘긴다 — 가장 명시적이고 AOT에 가장 안전
string json = JsonSerializer.Serialize(order, AppJsonContext.Default.Order);
Order? back = JsonSerializer.Deserialize(json, AppJsonContext.Default.Order);

// (2) 옵션에 리졸버로 꽂는다 — 기존 코드 변경 최소화
var options = new JsonSerializerOptions { TypeInfoResolver = AppJsonContext.Default };
string json2 = JsonSerializer.Serialize(order, options);
```

※.NET 8부터 `TypeInfoResolverChain`으로 여러 컨텍스트를 이어 붙일 수 있다.

### 두 가지 생성 모드

| `JsonSourceGenerationMode` | 생성하는 것 | 직렬화 | 역직렬화 | 특징 |
|---|---|---|---|---|
| `Metadata` | 타입 계약 메타데이터 | 가능 | 가능 | 리플렉션 제거. 옵션 전부 지원 |
| `Serialization` | 최적화된 쓰기 코드(fast path) | 가능 | **불가** | 가장 빠름. 지원 옵션 제한 |
| `Default` (미지정) | 위 둘 다 | 가능 | 가능 | 코드 크기가 가장 큼 |

```csharp
[JsonSourceGenerationOptions(GenerationMode = JsonSourceGenerationMode.Serialization)]
[JsonSerializable(typeof(LogEvent))]
internal partial class LogContext : JsonSerializerContext { }
```

`Serialization` 모드는 리플렉션도, 메타데이터 조회도 없이 **프로퍼티를 순서대로 쓰는 직선 코드**를 만든다. 로그 이벤트나 텔레메트리처럼 쓰기만 하고 읽지 않는 타입에 이상적이다.

> **⚠️ fast path는 조건이 안 맞으면 조용히 포기한다**
>
> `Serialization` 모드로 만든 쓰기 코드는 특정 옵션과 양립하지 않는다. 대표적으로 `ReferenceHandler.Preserve`, 런타임에 지정한 커스텀 이름 정책, 일부 커스텀 컨버터가 그렇다. 이런 옵션이 걸리면 직렬화기는 **메타데이터 경로로 되돌아간다.** 예외가 아니라 성능 저하로만 나타나므로, "소스 생성기를 붙였는데 왜 안 빨라지지"의 흔한 원인이다.
>
> 컨텍스트의 옵션(`[JsonSourceGenerationOptions]`)과 실행 시점에 넘기는 `JsonSerializerOptions`가 **일치해야** fast path가 살아 있다.

### 컴파일 결과 — 무엇이 생성되는가

생성기는 컨텍스트 클래스마다 `partial` 조각을 만든다. 개략적 형태는 이렇다.

```csharp
// 생성된 코드 (개략)
internal partial class AppJsonContext
{
    private static AppJsonContext? s_defaultContext;
    public static AppJsonContext Default => s_defaultContext ??= new AppJsonContext(…);

    private JsonTypeInfo<Order>? _Order;
    public JsonTypeInfo<Order> Order => _Order ??= Create_Order(Options);

    private JsonTypeInfo<Order> Create_Order(JsonSerializerOptions options)
    {
        var objectInfo = new JsonObjectInfoValues<Order>
        {
            ObjectCreator = static () => new Order(),
            PropertyMetadataInitializer = _ => OrderPropInit(options),
            SerializeHandler = OrderSerializeHandler,   // Serialization 모드일 때
        };
        return JsonMetadataServices.CreateObjectInfo(options, objectInfo);
    }

    // fast path — 리플렉션도 메타데이터 조회도 없다
    private static void OrderSerializeHandler(Utf8JsonWriter writer, Order? value)
    {
        if (value is null) { writer.WriteNullValue(); return; }
        writer.WriteStartObject();
        writer.WriteNumber("id", value.Id);
        writer.WriteString("sku", value.Sku);
        writer.WriteEndObject();
    }
}
```

`OrderSerializeHandler`가 핵심이다. 이것은 손으로 `Utf8JsonWriter`를 쓴 코드와 거의 같다. 41.3절에서 "저수준 API를 직접 쓰면 빠르다"고 한 그 코드를 컴파일러가 대신 써 준 셈이다.

> **📌 생성된 코드를 눈으로 보는 법**
>
> ```xml
> <PropertyGroup>
>   <EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>
>   <CompilerGeneratedFilesOutputPath>generated</CompilerGeneratedFilesOutputPath>
> </PropertyGroup>
> ```
>
> 빌드하면 `generated/` 아래에 `.g.cs` 파일이 떨어진다. "왜 이 프로퍼티가 안 나가지"를 디버깅할 때 가장 빠른 길이다. 소스 생성기 일반론은 57.15절에서 다룬다.

### 제약 사항

소스 생성 경로는 리플렉션 경로가 하던 일부를 못 한다.

| 제약 | 설명 |
|---|---|
| 비공개 멤버 | 생성된 코드는 평범한 C#이므로 비공개 멤버에 접근할 수 없다 |
| 런타임 결정 타입 | 컴파일 타임에 `[JsonSerializable]`로 선언된 타입만 |
| 팩터리 컨버터의 `MakeGenericType` | AOT에서 실패할 수 있다 (41.5절) |
| `[JsonExtensionData]` | 지원되지만 fast path에서는 제외된다 |
| 열린 제네릭 | 구체적 인스턴스화를 각각 선언해야 한다 |
| `JsonSourceGenerationOptions`와 런타임 옵션 불일치 | fast path 무효화 |

### AOT 전용 빌드 만들기

리플렉션 경로를 아예 봉인하면, 실수로 리플렉션 기반 API를 쓰는 코드가 **빌드 시점이나 첫 호출에서** 드러난다.

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
  <JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>
</PropertyGroup>
```

이 스위치를 끄면 `TypeInfoResolver`를 지정하지 않은 `JsonSerializer` 호출이 `InvalidOperationException`을 던진다. 코드에서 현재 상태를 확인할 수도 있다.

```csharp
if (!JsonSerializer.IsReflectionEnabledByDefault)   // ※.NET 8
    Console.WriteLine("리플렉션 기반 직렬화 비활성");
```

> **💡 소스 생성기는 AOT가 아니어도 이득이다**
>
> Native AOT를 안 쓰더라도 소스 생성기를 붙일 이유가 있다.
>
> - **시작 시간** — 첫 직렬화의 리플렉션 분석이 사라진다. 컨테이너에서 초당 수십 개씩 뜨는 프로세스라면 누적 효과가 크다.
> - **정적 검증** — 직렬화 대상 타입이 코드에 명시되므로, "이 타입이 JSON 계약의 일부다"가 문서화된다.
> - **트리밍 크기** — 리플렉션 기반 직렬화 스택 전체를 잘라낼 수 있으면 배포 크기가 줄어든다.
>
> 반대로 붙이지 말아야 할 곳도 분명하다. 직렬화 대상 타입이 런타임에 결정되는 플러그인 시스템, 스크립트 엔진, 범용 진단 도구에서는 리플렉션 경로가 유일한 답이다.

---

## 41.7 `BinaryFormatter`가 제거된 이유

### 그것은 무엇이었나

`BinaryFormatter`는 .NET Framework 1.0부터 존재한 **런타임 직렬화(runtime serialization)** 기술이다. CLR 데이터 타입을 깊이 이해하고 있어서, 객체의 `public`·`protected`·`internal`·**`private` 필드까지 전부** 압축된 이진 스트림으로 직렬화했다.

```csharp
// 역사적 코드 — 지금은 동작하지 않는다
private static MemoryStream SerializeToMemory(object objectGraph)
{
    MemoryStream stream = new MemoryStream();
    BinaryFormatter formatter = new BinaryFormatter();
    formatter.Serialize(stream, objectGraph);
    return stream;
}

private static object DeserializeFromMemory(Stream stream)
{
    BinaryFormatter formatter = new BinaryFormatter();
    return formatter.Deserialize(stream);
}
```

편리함은 압도적이었다. `List<string>`이든 `Dictionary<int, DateTime>`이든 `Exception`이든, 타입을 지정하지도 않고 그냥 넘기면 됐다. 그래프에 순환이 있어도 포매터가 감지해서 각 객체를 딱 한 번만 기록하고 무한 루프를 피했다. 깊은 복사도 세 줄이면 됐다.

.NET Framework 클래스 라이브러리는 두 개의 포매터를 제공했다 — `BinaryFormatter`와, `System.Runtime.Serialization.Formatters.Soap` 네임스페이스의 `SoapFormatter`다. (`SoapFormatter`는 .NET Framework 3.5부터 이미 폐기되어 프로덕션 코드에서 쓰지 말라고 안내됐다.) 두 포매터 모두 `IFormatter` 인터페이스를 구현했다.

직렬화 대상이 되려면 타입에 `[Serializable]`을 붙여야 했다. 기본적으로 타입은 직렬화 가능하지 않았고, 붙이지 않은 타입을 넘기면 `SerializationException`이 났다.

```csharp
[Serializable]
internal struct Point { public int x, y; }
```

`[NonSerialized]`로 특정 필드를 제외하고, `[OnSerializing]`/`[OnSerialized]`/`[OnDeserializing]`/`[OnDeserialized]` 콜백으로 직렬화 과정에 개입하고, `[OptionalField]`로 버전 간 호환을 확보하고, `ISerializable`을 구현해 완전히 손으로 제어할 수도 있었다. 매우 강력한 확장 모델이었다.

### 무엇이 잘못됐나

문제는 **역직렬화 쪽**에 있다.

객체를 직렬화할 때 포매터는 **타입의 전체 이름과 그 타입을 정의한 어셈블리의 이름**을 스트림에 기록한다. 기본적으로 `BinaryFormatter`는 어셈블리의 전체 신원 — 파일 이름, 버전 번호, 문화권, 공개 키 정보 — 을 출력한다. 역직렬화할 때 포매터는 먼저 그 어셈블리 신원을 읽고 `Assembly.Load`를 호출해 어셈블리를 실행 중인 도메인에 로드한 다음, 그 안에서 타입을 찾아 인스턴스를 만들고 필드를 채운다.

인스턴스를 만드는 방식이 특히 중요하다. 포매터는 **생성자를 거치지 않고** 메모리를 확보한다(`FormatterServices.GetUninitializedObject`). 그런 다음 `ISerializable`을 구현한 타입이면 특수 생성자를 호출하고, 콜백 특성이 붙은 메서드를 호출하고, 필드를 채운다.

```text
    공격자가 만든 바이트 스트림
    ┌──────────────────────────────────────────────┐
    │ 타입 A, 어셈블리 X, 필드: { … 타입 B의 인스턴스 … } │
    └──────────────┬───────────────────────────────┘
                   │ Deserialize()
                   ▼
    ① Assembly.Load("X")            ← 공격자가 어셈블리를 지정
                   ▼
    ② 타입 A의 인스턴스를 생성자 없이 확보
                   ▼
    ③ 필드를 채운다 → 타입 B를 다시 역직렬화 (재귀)
                   ▼
    ④ ISerializable 특수 생성자 / [OnDeserialized] 콜백 실행
                   ▼
    ⑤ … 이 사슬의 끝에서 위험한 메서드가 호출된다
       (프로세스 실행, 파일 쓰기, 코드 컴파일 …)
```

이 사슬을 **가젯 체인(gadget chain)** 이라고 부른다. 공격자는 새 코드를 주입하지 않는다. **애플리케이션이 이미 로드한 어셈블리 안의 평범한 타입들**을 조합해서, 역직렬화 과정이 자동으로 실행하는 부작용만으로 목표에 도달한다. 알려진 가젯 체인을 페이로드로 만들어 주는 공개 도구(ysoserial.net 계열)가 존재하며, 새 가젯은 계속 발견된다.

> **⚠️ 이것은 버그가 아니라 설계다**
>
> `BinaryFormatter`의 취약점은 "고칠 수 있는 결함"이 아니다. **"스트림이 만들 타입을 지시한다"는 것이 이 API의 기능 자체**다. 그 기능을 없애면 `BinaryFormatter`가 아니게 된다.
>
> 그래서 패치가 아니라 제거가 답이었다. 같은 이유로, 신뢰할 수 없는 데이터에 `BinaryFormatter`를 쓰는 코드는 "입력을 검증하면 안전하다"는 식으로 방어할 수 없다. 페이로드가 유효한지 판정하려면 이미 역직렬화를 해야 하기 때문이다.

### `SerializationBinder`로도 왜 부족한가

`System.Runtime.Serialization.SerializationBinder`를 상속하면 역직렬화 시 만들 타입을 가로챌 수 있다. 원래 목적은 버전 이행이었다 — v1.0.0.0의 `Ver1` 객체를 `Ver2`로 되살리는 식이다.

```csharp
internal sealed class Ver1ToVer2SerializationBinder : SerializationBinder
{
    public override Type BindToType(string assemblyName, string typeName)
    {
        AssemblyName assemVer1 = Assembly.GetExecutingAssembly().GetName();
        assemVer1.Version = new Version(1, 0, 0, 0);

        if (assemblyName == assemVer1.ToString() && typeName == "Ver1")
            return typeof(Ver2);

        return Type.GetType($"{typeName}, {assemblyName}");
    }
}
```

포매터의 `Binder` 프로퍼티에 이 객체를 넣으면 각 객체가 역직렬화되기 직전에 `BindToType`이 불린다. 여기서 허용 목록을 강제하면 완화 효과가 있다.

하지만 근본 해결이 아니다.

- 위 예의 마지막 줄처럼 **기본 구현이 그대로 통과**시키는 코드를 흔히 쓴다. 허용 목록이 아니라 예외 목록이 되어 버린다.
- 허용한 타입 **내부의** 필드가 다시 임의 타입일 수 있다.
- 허용 목록에 넣은 타입 자체가 가젯일 수 있다. "안전해 보이는 타입"의 목록을 정확히 유지하는 것은 사실상 불가능하다.

### 폐기 일정

| 시점 | 상태 |
|---|---|
| .NET Framework 1.0 ~ | 정상 제공. 원격(Remoting), `AppDomain` 경계 이동, ASP.NET 세션 상태에 광범위하게 사용 |
| 2020년 | Microsoft가 공식 보안 안내를 발행하고 사용 중단을 권고 |
| **.NET 5** | 사용 시 **`SYSLIB0011` 진단**(폐기). ASP.NET Core 프로젝트에서는 기본적으로 **비활성** |
| **.NET 7** | 대부분의 프로젝트 유형에서 기본 비활성(데스크톱 UI 프레임워크는 한시적 예외) |
| **.NET 8** | 모든 프로젝트 유형에서 기본 비활성. `SYSLIB0050`/`SYSLIB0051`로 `[Serializable]`·`ISerializable` 등 **포매터 기반 직렬화 인프라 전반**이 폐기 |
| **.NET 9** | 런타임에서 **구현이 제거**. API를 호출하면 `PlatformNotSupportedException`. 활성화 스위치도 무효 |

전환기에는 `EnableUnsafeBinaryFormatterSerialization` MSBuild 속성으로 되살릴 수 있었으나, .NET 9에서는 이 스위치가 아무 효과도 없다. 마이그레이션 기간을 위한 별도의 지원되지 않는 아웃오브밴드 패키지가 존재하지만, 그것은 "코드를 고칠 시간을 버는 장치"이지 해결책이 아니다.

> **⚠️ 같은 부류를 전부 찾아라**
>
> `BinaryFormatter`만 지우면 끝이 아니다. **타입 이름을 페이로드에서 읽어 임의 타입을 만드는 모든 직렬화기**가 같은 위험을 가진다.
>
> | 직렬화기 | 상태 |
> |---|---|
> | `BinaryFormatter` | 제거됨 |
> | `SoapFormatter` | .NET Framework 3.5부터 폐기, .NET에 없음 |
> | `NetDataContractSerializer` | 사용 금지 — CLR 타입 이름을 스트림에 기록 |
> | `LosFormatter` / `ObjectStateFormatter` | ASP.NET(.NET Framework) 전용, 같은 위험 |
> | Json.NET `TypeNameHandling` ≠ `None` | 같은 위험 (41.5절) |
> | `DataContractSerializer` | **안전** — 호출자가 타입을 미리 지정 |
> | `XmlSerializer` | **안전** — 호출자가 타입을 미리 지정 (42.14절) |
>
> `DataContractSerializer`와 `NetDataContractSerializer`를 혼동하지 마라. 이름은 한 글자 차이인데 위험도는 정반대다.

### 마이그레이션 가이드

| 원래 용도 | 대체 |
|---|---|
| 애플리케이션 설정 저장 | `System.Text.Json`(41.2절) |
| 프로세스 간 메시지 | JSON 또는 Protobuf/gRPC (43.14절) |
| 분산 캐시 직렬화 | JSON, MessagePack, 또는 명시적 스키마의 이진 형식 |
| 고성능 로컬 파일 | `BinaryReader`/`BinaryWriter`를 직접 (40.6절) |
| 깊은 복사 | 레코드의 `with` 식(19장), 또는 손으로 쓴 복사 메서드 |
| `.resx`의 임베드 객체 | `System.Resources.Extensions` 경로 (53.2절) |
| 예외를 경계 너머로 | 예외 객체가 아니라 **오류 코드와 메시지**를 DTO로 (32장) |

> **💡 "깊은 복사"에 직렬화를 쓰지 마라**
>
> `BinaryFormatter`의 대중적 용도 중 하나가 깊은 복사였다. JSON으로 그 관용구를 그대로 옮기는 코드를 자주 본다.
>
> ```csharp
> // 하지 마라 — 느리고, 비공개 상태가 사라지고, 순환에서 터진다
> T DeepClone<T>(T o) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(o))!;
> ```
>
> 직렬화 기반 복사는 **공개 계약만 복사**한다. 비공개 필드, 이벤트 구독, 캐시된 계산 결과가 전부 사라진다. 그리고 왕복 비용이 손으로 쓴 복사보다 수십 배 비싸다. 불변 타입이면 `with` 식이, 그 외에는 명시적 복사 생성자가 정답이다.

---

## 41.8 역직렬화 공격 표면과 방어

### 신뢰 경계를 먼저 그린다

역직렬화 보안의 첫 단계는 코드가 아니라 그림이다. **이 바이트는 누가 만들었는가**를 각 호출 지점마다 답할 수 있어야 한다.

```text
   ┌──────────────────────────────────────────────────────────┐
   │  신뢰 경계 밖 — 공격자가 내용을 통제할 수 있다              │
   │  HTTP 요청 본문 · 쿼리스트링 · 웹훅 · 메시지 큐 ·          │
   │  업로드 파일 · 서드파티 API 응답 · 브라우저 로컬 저장소     │
   └──────────────────────┬───────────────────────────────────┘
                          │  ← 여기서 모든 검증이 일어나야 한다
   ┌──────────────────────▼───────────────────────────────────┐
   │  신뢰 경계 안 — 우리가 방금 쓴 바이트                      │
   │  같은 프로세스의 캐시 · 우리가 서명한 파일                  │
   └──────────────────────────────────────────────────────────┘
```

"서드파티 API 응답"이 경계 밖에 있다는 점에 주의하라. 우리가 호출한 API라 해도, 그 API가 침해되거나 DNS가 가로채이면 응답은 공격자의 것이다.

### 공격 유형별 정리

| 공격 | 무슨 일이 벌어지나 | `System.Text.Json`에서의 방어 |
|---|---|---|
| **임의 타입 인스턴스화** | 페이로드가 만들 타입을 지시 → 가젯 체인 | 구조적으로 불가. `[JsonDerivedType]`의 닫힌 집합만 |
| **타입 혼동** | 문자열 자리에 객체, 숫자 자리에 배열 | `ValueKind` 검사, `TryGet*`, 강타입 DTO |
| **깊이 폭탄** | `[[[[[…]]]]]` 수만 겹 → 스택 오버플로 | `MaxDepth`(기본 64) |
| **대용량 페이로드** | 수 GB JSON → 메모리 고갈 | **직렬화기에 내장 제한 없음.** 전송 계층에서 제한 |
| **거대 단일 값** | 문자열 하나가 1GB | 같음 — 크기 제한이 유일한 방어 |
| **알 수 없는 멤버** | 오타·잉여 필드가 조용히 무시됨 | `UnmappedMemberHandling.Disallow` |
| **누락 멤버** | 필수 필드 없이 반쯤 빈 객체 | `required`, `[JsonRequired]` |
| **위험한 세터** | 세터가 파일·연결·프로세스를 건드림 | DTO에는 로직 없는 프로퍼티만 |
| **`$id`/`$ref` 남용** | `ReferenceHandler.Preserve`에서 참조 그래프 조작 | 경계에서 `Preserve`를 쓰지 않는다 |
| **중복 키** | `{"role":"user","role":"admin"}` | 파서마다 해석이 다르다 — 아래 참조 |
| **숫자 정밀도** | `1e400`, 아주 긴 정수 | 강타입 + 범위 검증 |

> **⚠️ 중복 키의 해석은 표준이 정하지 않는다**
>
> RFC 8259는 객체 안에 같은 이름이 두 번 나올 때의 동작을 **정의하지 않는다.** 어떤 파서는 첫 번째를 쓰고, 어떤 파서는 마지막을 쓰고, 어떤 파서는 오류를 낸다.
>
> 이것이 왜 보안 문제인가. 게이트웨이가 JSON을 파싱해 권한을 검사하고, 백엔드가 같은 JSON을 **다른 파서로** 파싱해 실제 동작을 결정한다고 하자. 두 파서가 중복 키를 다르게 해석하면 **검사와 실행이 다른 값을 본다.** 이것을 파서 차이(parser differential) 공격이라고 부른다.
>
> 방어는 두 가지다. (1) 경계에서 **한 번만** 파싱하고, 그 결과 객체를 뒤로 넘긴다 — 원본 텍스트를 재파싱하지 않는다. (2) 사용하는 스택의 실제 동작을 **직접 실행해서 확인**하고 문서화한다. 이 절의 다른 항목과 달리, 여기서는 "어느 파서가 어떻게 한다"를 외우지 말고 측정하라.

### 깊이 폭탄

```csharp
string bomb = new string('[', 100_000) + new string(']', 100_000);
JsonSerializer.Deserialize<object>(bomb);
```

재귀 하강 파서에 이런 입력을 주면 스택이 터진다. **`StackOverflowException`은 `catch`할 수 없고 프로세스를 즉시 죽인다**(32장). 즉 이것은 확실한 서비스 거부다.

`System.Text.Json`은 기본적으로 중첩 깊이를 64로 제한하므로 위 코드는 `JsonException`을 던지고 끝난다. 이 기본값을 **올리는** 코드를 리뷰에서 만나면 반드시 이유를 물어야 한다.

```csharp
var options = new JsonSerializerOptions { MaxDepth = 16 };   // 더 조여도 좋다
```

`Utf8JsonReader`(`JsonReaderOptions.MaxDepth`)와 `JsonDocument`(`JsonDocumentOptions.MaxDepth`)에도 같은 설정이 있다. 저수준 API를 직접 쓰면서 옵션을 넘기지 않으면 기본값 64가 적용된다.

### 크기 제한

`JsonSerializer`에는 입력 크기 제한이 **없다.** 100MB 요청 본문을 던지면 100MB를 파싱하려 시도한다.

방어는 직렬화기 위층에서 한다.

```csharp
// ASP.NET Core — 요청 본문 크기 제한
app.Use(async (ctx, next) =>
{
    ctx.Features.Get<IHttpMaxRequestBodySizeFeature>()!.MaxRequestBodySize = 1 * 1024 * 1024;
    await next();
});
```

직접 스트림을 다룬다면 길이를 제한하는 데코레이터를 씌운다(40.1절의 데코레이터 패턴이 그대로 쓰인다).

> **⚠️ `Content-Length`를 믿지 마라**
>
> 청크 전송 인코딩에서는 `Content-Length`가 아예 없고, 있어도 공격자가 보낸 값이다. 실제로 읽은 바이트를 세면서 제한을 걸어야 한다. 압축된 요청 본문(`Content-Encoding: gzip`)이라면 **압축 해제 후** 크기까지 세야 한다 — 압축 폭탄이 여기로 들어온다(40.7절).

### 알 수 없는 멤버와 누락 멤버

```csharp
public record TransferRequest
{
    [JsonRequired] public required string FromAccount { get; init; }
    [JsonRequired] public required string ToAccount { get; init; }
    [JsonRequired] public required decimal Amount { get; init; }
}

var strict = new JsonSerializerOptions
{
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    MaxDepth = 16,
    PropertyNameCaseInsensitive = false,
};
```

이 조합이 만드는 성질은 명확하다. **정확히 세 필드가, 정확한 이름으로, 정확한 대소문자로 와야 한다.** 하나라도 어긋나면 `JsonException`이 나고 요청은 400으로 끝난다.

관대함은 개발 편의를 주지만, 경계에서는 관대함이 곧 모호함이다. 모호함은 공격자가 파고드는 틈이다.

### 위험한 세터

```csharp
// 이런 타입을 역직렬화 대상으로 노출하면 안 된다
public class ReportConfig
{
    private string _path = "";
    public string OutputPath
    {
        get => _path;
        set { _path = value; Directory.CreateDirectory(Path.GetDirectoryName(value)!); }
    }
}
```

세터가 부작용을 가지면, 역직렬화는 **공격자가 인수를 고른 메서드 호출**이 된다. `BinaryFormatter`의 가젯 체인과 원리가 같고, 규모만 작다.

> **💡 DTO는 멍청해야 한다**
>
> 경계에서 역직렬화되는 타입에 대한 규칙.
>
> - 자동 구현 프로퍼티만 쓴다. 세터에 코드를 넣지 않는다.
> - 생성자에 검증 이상의 로직을 넣지 않는다(파일 열기, 연결, 스레드 시작 금지).
> - `IDisposable`을 구현하지 않는다.
> - 도메인 엔티티를 직접 역직렬화 대상으로 쓰지 않는다. DTO를 따로 두고 매핑한다.
> - 검증은 **역직렬화 후 별도 단계**에서 한다 — 세터 안이 아니라.
>
> 이 규칙은 보안뿐 아니라 41.1절의 "직렬화 형식은 공개 API다"와도 맞물린다. 같은 규율이 두 문제를 동시에 푼다.

### `ReferenceHandler.Preserve`의 위험

`Preserve`를 켜면 JSON에 `$id`, `$ref`, `$values` 같은 메타데이터 프로퍼티가 의미를 갖는다. 즉 **페이로드가 객체 그래프의 모양을 지시**하게 된다. 공격자는 같은 객체를 수만 번 참조하는 그래프를 만들어 처리 비용을 폭발시킬 수 있고, 예상치 못한 별칭(aliasing) 관계를 만들어 로직을 혼란시킬 수 있다.

경계 안(우리가 쓰고 우리가 읽는 캐시)에서는 유용하다. **경계 밖에서 들어오는 데이터에는 쓰지 마라.**

### 방어 체크리스트

```text
□ 이 역직렬화 호출의 입력은 신뢰 경계 밖인가?  (그렇다면 아래 전부 적용)
□ 전용 DTO로 받는가?  도메인 엔티티를 직접 쓰고 있지는 않은가?
□ DTO의 세터에 부작용이 없는가?
□ MaxDepth를 명시했는가?  (기본 64보다 조일 수 있는가)
□ 입력 크기 상한이 전송 계층 또는 스트림 데코레이터에 걸려 있는가?
□ 압축 해제 후 크기도 제한되는가?
□ UnmappedMemberHandling.Disallow를 켤 수 있는가?
□ 필수 필드에 required / [JsonRequired]가 붙어 있는가?
□ 역직렬화 후 도메인 규칙 검증 단계가 별도로 있는가?
□ 다형 역직렬화를 쓴다면 허용 목록이 닫힌 집합인가?
□ ReferenceHandler.Preserve를 경계 밖 입력에 쓰고 있지는 않은가?
□ Json.NET을 쓴다면 TypeNameHandling이 None인가?
□ 같은 페이로드를 두 번 파싱하는 곳은 없는가?  (파서 차이)
□ 예외 메시지에 페이로드 내용이 그대로 로그로 나가지는 않는가?
□ BinaryFormatter / NetDataContractSerializer / SoapFormatter가 남아 있지 않은가?
```

> **⚠️ `JsonException`의 메시지를 클라이언트에 그대로 돌려주지 마라**
>
> `JsonException`은 `Path`, `LineNumber`, `BytePositionInLine`을 담고 있고, 메시지에 문제가 된 값의 일부가 포함될 수 있다. 이것을 HTTP 응답에 그대로 실으면 내부 타입 구조에 대한 정보를 노출한다. 로그에는 상세히, 응답에는 "잘못된 요청 형식"만.

---

## 41.9 직렬화 성능 비교와 선택 가이드

### 비용은 어디서 발생하는가

| 비용 항목 | 언제 발생 | 줄이는 법 |
|---|---|---|
| **타입 분석**(리플렉션) | 옵션 인스턴스당 타입당 최초 1회 | 옵션 재사용, 소스 생성기 |
| **트랜스코딩**(UTF-8 ↔ UTF-16) | 문자열 오버로드를 쓸 때마다 | `byte[]`/`Stream` 오버로드 |
| **파싱**(토큰 스캔) | 항상 | 필요한 필드만 읽기(`Skip`) |
| **객체 할당** | 역직렬화 결과 그래프 | DOM 대신 강타입, 또는 저수준 리더 |
| **문자열 할당** | `GetString()` 호출마다 | `ValueTextEquals`, `u8` 리터럴 |
| **버퍼 할당** | 스트림 쓰기 | `JsonDocument`의 풀, `IBufferWriter` |
| **이스케이프 처리** | 비 ASCII·HTML 문자마다 | 적절한 `Encoder` 선택 |

### 문자열을 거치지 마라

```csharp
// (A) 문자열 경유 — UTF-16 문자열을 만들고, 다시 UTF-8로 인코딩한다
string json = JsonSerializer.Serialize(value);
await File.WriteAllTextAsync(path, json);

// (B) UTF-8 바이트 직행
byte[] utf8 = JsonSerializer.SerializeToUtf8Bytes(value);
await File.WriteAllBytesAsync(path, utf8);

// (C) 스트림 직행 — 중간 배열도 없다
await using var fs = File.Create(path);
await JsonSerializer.SerializeAsync(fs, value);
```

(A)는 중간 문자열 하나를 통째로 할당하고, 그 문자열을 다시 UTF-8로 인코딩한다. JSON이 1MB면 UTF-16 문자열 2MB가 큰 객체 힙(LOH)에 잡힌다(62장). (C)는 내부 버퍼(기본 16KB, `DefaultBufferSize`로 조정)만 쓴다.

역직렬화도 같다.

```csharp
// 느림 — 파일을 문자열로 읽고(UTF-8→UTF-16), 다시 파싱한다
var a = JsonSerializer.Deserialize<T>(File.ReadAllText(path));

// 빠름 — UTF-8 바이트 그대로 파싱
var b = JsonSerializer.Deserialize<T>(File.ReadAllBytes(path));

// 큰 파일이라면 — 전체를 메모리에 올리지 않는다
await using var fs = File.OpenRead(path);
var c = await JsonSerializer.DeserializeAsync<T>(fs);
```

> **💡 `HttpClient`에서는 확장 메서드를 써라**
>
> `System.Net.Http.Json`의 `GetFromJsonAsync<T>`, `PostAsJsonAsync`, `ReadFromJsonAsync<T>`는 내부에서 응답 스트림을 `JsonSerializer`의 스트림 오버로드에 바로 연결한다. `await response.Content.ReadAsStringAsync()`로 문자열을 만든 뒤 `Deserialize`하는 코드는 그 경로를 우회하면서 트랜스코딩과 대형 할당을 추가한다. 43장에서 다시 다룬다.

### `JsonSerializer` vs 손으로 쓴 리더

| 축 | `JsonSerializer` | `Utf8JsonReader` 직접 |
|---|---|---|
| 코드량 | 몇 줄 | 필드 수에 비례해 수십~수백 줄 |
| 스키마 변경 대응 | 클래스만 고치면 끝 | 파서를 손으로 고쳐야 함 |
| 오류 메시지 | 경로·위치가 담긴 `JsonException` | 직접 만들어야 함 |
| 전체를 객체화할 때 속도 | 잘 최적화돼 있음 | 크게 나을 것 없음 |
| **일부 필드만 필요할 때** | 전체를 파싱하고 버림 | **압도적으로 빠름** |
| 스트리밍/부분 데이터 | `DeserializeAsyncEnumerable`로 일부 가능 | 완전한 제어 |
| AOT/트리밍 | 소스 생성기 필요 | 원래 문제없음 |

> **💡 저수준으로 내려갈 결정 규칙**
>
> 다음 중 **둘 이상**에 해당할 때만 `Utf8JsonReader`를 직접 쓸 가치가 있다.
>
> 1. 프로파일러가 이 지점을 병목으로 지목했다(67장).
> 2. 문서가 크고, 필요한 필드는 그중 일부다.
> 3. 스키마가 안정적이라 파서를 자주 고칠 일이 없다.
> 4. 부분 데이터 스트리밍이 필요하다.
>
> 하나만 해당한다면 `JsonSerializer` + 소스 생성기로 먼저 시도해라. 대부분 거기서 끝난다.

### 원천에 있는 측정치

성능 수치는 하드웨어·데이터·런타임 버전에 따라 달라지므로, 여기서는 원천에 명시된 것만 인용한다.

- `System.Text.Json`은 `Span<T>` 같은 API를 활용해 성능에 최적화됐고, Json.NET 같은 옛 라이브러리는 UTF-16을 읽도록 구현돼 있다. HTTP를 포함한 대부분의 네트워크 프로토콜이 UTF-8을 쓰므로, UTF-8로 직접 읽고 쓰면 트랜스코딩을 피할 수 있어 더 효율적이다. Microsoft는 이 새 API로 **시나리오에 따라 1.3배에서 5배의 개선**을 달성했다고 밝혔다.
- 같은 `Book` 객체가 들여쓰기 + 카멜 표기 + 전체 필드 포함으로 **221바이트**, 최소화 + 파스칼 표기 + 선택적 필드 포함으로 **184바이트**였다 — **약 20% 감소**.
- 같은 데이터에 대해 JSON은 XML보다 **절반 미만의 바이트**를 요구했다(366바이트 대 793바이트). XML을 속성(attribute) 중심으로 바꾼 488바이트보다도 작았다.

> **⚠️ 남의 벤치마크 숫자를 그대로 믿지 마라**
>
> 직렬화 성능은 데이터 모양에 극단적으로 민감하다. 프로퍼티 20개짜리 평평한 객체와 3단계 중첩된 컬렉션은 완전히 다른 프로파일을 가진다. 문자열 비중, 숫자 비중, `null` 비중, 비 ASCII 문자 비중이 전부 결과를 바꾼다.
>
> **당신의 데이터로, 당신의 런타임에서** 측정해라. `BenchmarkDotNet`과 `MemoryDiagnoser` 사용법은 67.3절·67.5절에 있다.

### `System.Text.Json` vs Json.NET

| 기준 | `System.Text.Json` | Json.NET (Newtonsoft.Json) |
|---|---|---|
| 성능·할당 | 우위 (UTF-8 직접) | 상대적 열세 (UTF-16 기반) |
| 기본 정책 | 엄격 | 관대 |
| 기능 폭 | .NET 6 이후 상당히 근접 | 여전히 더 넓음 |
| Native AOT·트리밍 | 소스 생성기로 완전 지원 | 리플렉션 의존 |
| 옛 .NET 플랫폼 | 제한적 | 광범위 지원 |
| 다형 역직렬화 | 닫힌 집합만 (안전) | `TypeNameHandling` (위험) |
| BCL 포함 | 예 | NuGet 패키지 |

> **💡 선택 기준 한 줄**
>
> **개발 생산성과 넓은 기능이 필요하면 Json.NET, 성능이 필요하면 `System.Text.Json`.** 신규 프로젝트는 `System.Text.Json`으로 시작하고, 정말 막히는 기능이 나올 때 그 부분만 옮기는 편이 낫다. 한 프로세스에서 두 라이브러리를 함께 쓰는 것 자체는 문제가 없다 — 다만 **같은 타입을 양쪽으로 직렬화하면 결과가 달라진다**는 점을 기억해라(특히 이름 정책과 `null` 처리).

### 최종 선택 가이드

```text
                      직렬화가 필요한가?
                             │
              ┌──────────────┴──────────────┐
        같은 프로세스 안?              경계를 넘는다
              │                            │
        참조를 넘겨라              ┌────────┴────────┐
        (직렬화 불필요)        사람이 읽나?      아니오
                                   │                │
                                  JSON        ┌─────┴─────┐
                                   │      스키마 계약?   내부 전용?
                          ┌────────┴──────┐     │           │
                    성능이 병목?      아니오  Protobuf   MessagePack
                          │             │     /gRPC      또는
                 ┌────────┴───────┐  JsonSerializer   BinaryWriter
              AOT/시작시간?    일부 필드만?
                  │                 │
           소스 생성 컨텍스트   Utf8JsonReader
```

> **💡 대부분의 팀에게 정답은 하나다**
>
> `System.Text.Json` + 정적 옵션 인스턴스 + 전용 DTO. 여기서 시작해서, **측정이 다른 답을 요구할 때만** 움직여라. 이 장에서 다룬 저수준 API, 소스 생성기, 이진 형식은 전부 그 "다른 답"을 위한 도구이지 기본값이 아니다.

---

## 이 장의 요약

- **직렬화는 객체가 아니라 객체 그래프를 다룬다.** 하나를 저장하면 참조된 것들이 전부 따라온다. 순환·중복 참조를 형식이 어떻게 다루는지가 형식의 성격을 결정한다.
- **형식 선택은 크기와 속도가 아니라 경계와 계약으로 결정한다.** 사람이 읽는가, 스키마가 어떻게 진화하는가, 다른 언어가 읽는가가 먼저다. JSON은 이름이 계약이고, Protobuf는 번호가 계약이고, 수동 이진은 순서가 계약이다.
- **`System.Text.Json`의 기본값은 엄격하다.** 공개 필드는 나가지 않고, 이름은 그대로 나가며, 역직렬화는 대소문자를 구분하고, 주석과 후행 쉼표는 예외를 낸다. "왜 값이 비어 있지"의 원인 대부분이 이 목록 안에 있다.
- **`JsonSerializerOptions`는 캐시다.** 매 호출마다 새로 만들면 타입 분석이 매번 반복된다. 정적 인스턴스로 재사용하고, ※.NET 8에서는 `MakeReadOnly()`로 동결하거나 `JsonSerializerOptions.Default`를 쓴다.
- **`Utf8JsonReader`는 `ref struct`라서 `async` 메서드에 들어갈 수 없다.** 비동기 I/O와 동기 파싱을 분리하거나, `JsonReaderState`로 청크 사이의 상태를 이어 붙인다.
- **`JsonDocument`는 풀링 버퍼를 빌려 쓴다.** `Dispose`는 선택이 아니고, `RootElement`를 문서 수명 밖으로 내보내려면 `Clone()`해야 한다. 이 부담이 싫으면 `JsonNode`를 쓴다.
- **다형 직렬화는 "바이트가 타입을 지시하는" 구조다.** ※.NET 7의 `[JsonDerivedType]`은 그 집합을 컴파일 타임에 닫아 안전하게 만든다. 타입 이름을 페이로드에서 읽어 임의 타입을 만드는 모드(`BinaryFormatter`, Json.NET의 `TypeNameHandling`)는 원격 코드 실행 취약점이다.
- **소스 생성 컨텍스트는 리플렉션을 컴파일 타임 코드로 대체한다.** 트리밍·Native AOT 호환성과 시작 시간이 주된 이득이며, `Serialization` 모드의 fast path는 옵션이 어긋나면 조용히 메타데이터 경로로 되돌아간다.
- **`BinaryFormatter`의 문제는 버그가 아니라 설계였다.** 그래서 패치가 아니라 제거가 답이었고, .NET 5의 폐기를 거쳐 .NET 9에서 구현이 사라졌다. `SoapFormatter`, `NetDataContractSerializer`도 같은 부류다.
- **역직렬화는 데이터를 채우는 일이 아니라 코드를 실행하는 일이다.** 전용 DTO, 부작용 없는 세터, `MaxDepth`, 크기 제한, `Disallow`, `required`가 방어의 기본 세트다.
- **성능의 첫 번째 규칙은 문자열을 거치지 않는 것이다.** `SerializeToUtf8Bytes`와 스트림 오버로드가 트랜스코딩과 대형 할당을 없앤다. 그다음이 옵션 재사용, 그다음이 소스 생성기, 마지막이 저수준 API다.

---

## 연습 문제

1. 공개 프로퍼티 두 개와 공개 필드 두 개를 가진 클래스를 만들고 옵션 없이 직렬화하라. 결과에 무엇이 빠졌는지 확인한 뒤, `IncludeFields = true`로 쓰고 **그 옵션 없이** 역직렬화해 보라. 예외가 나는가, 아니면 값이 조용히 비는가. 이 비대칭이 실무에서 어떤 증상으로 나타날지 적어라.

2. `PropertyNamingPolicy`를 `null`, `CamelCase`, `SnakeCaseLower`로 바꿔 가며 같은 객체를 직렬화하고 결과를 나란히 출력하라. 그다음 카멜 표기로 쓴 JSON을 정책 `null`로 역직렬화해 보고, `PropertyNameCaseInsensitive = true`를 켰을 때와 껐을 때의 차이를 확인하라.

3. `JsonSerializerOptions`를 매 호출마다 새로 만드는 버전과 정적 인스턴스를 재사용하는 버전을 `BenchmarkDotNet`으로 비교하라(67.3절). 프로퍼티 5개짜리 평평한 객체와 3단계 중첩 객체 각각에 대해 측정하고, `MemoryDiagnoser`로 할당량도 함께 기록하라. 차이가 몇 배인가.

4. `NumberHandling`을 `AllowReadingFromString & WriteAsString`으로 설정한 코드와 `|`로 설정한 코드를 각각 실행해 결과를 비교하라. `&` 버전에서 왜 아무 일도 일어나지 않는지 열거형 값을 정수로 출력해 확인하라.

5. 1MB짜리 JSON 배열을 만들고 (a) `JsonSerializer.Deserialize<List<T>>`, (b) `Utf8JsonReader`로 특정 필드 하나만 추출, (c) `DeserializeAsyncEnumerable`로 스트리밍 처리 세 가지 방식의 시간과 할당을 측정하라. 필요한 필드 비율을 바꿔 가며 (b)가 (a)를 앞지르는 지점을 찾아라.

6. `JsonDocument.Parse`로 문서를 만들고 `RootElement`를 `using` 블록 밖의 변수에 담아 반환하는 메서드를 작성하라. 호출자에서 그 요소를 읽을 때 무슨 일이 일어나는지 기록하라. 그다음 `Clone()`을 추가해 동작이 어떻게 달라지는지 확인하라. 반복 호출로 부하를 주면 증상이 달라지는가.

7. `[[[[…]]]]` 형태로 깊이 100,000의 JSON을 만들어 (a) 기본 옵션, (b) `MaxDepth = 1_000_000`으로 각각 역직렬화해 보라. 두 번째 경우 프로세스에 무슨 일이 일어나는가. `try/catch`로 막을 수 있는가.

8. `[JsonDerivedType]`으로 파생 타입 두 개를 선언한 계층을 만들고 정상 직렬화·역직렬화를 확인하라. 그다음 (a) `$type`을 JSON의 마지막 프로퍼티로 옮기고, (b) 선언되지 않은 타입 이름을 `$type`에 넣어 각각 역직렬화해 보라. 어떤 예외가 나는지 기록하고, 이것이 왜 안전 장치인지 설명할 수 있을 만큼 결과를 모아라.

9. 소스 생성 컨텍스트를 붙인 프로젝트와 붙이지 않은 프로젝트에서 `EmitCompilerGeneratedFiles`로 생성 코드를 꺼내 비교하라. `JsonSourceGenerationMode.Serialization`과 `Metadata`가 만드는 코드가 어떻게 다른가. 그다음 `ReferenceHandler.Preserve`를 켠 옵션으로 직렬화해서 fast path가 실제로 무효화되는지 확인하라.

---

**다음 장** — 42장「XML」에서는 JSON의 선배이자 여전히 기업 시스템의 공용어인 XML을 다룬다. LINQ to XML(X-DOM)의 함수형 구성, `XmlReader`/`XmlWriter`의 저수준 스트리밍, 그리고 41장에서 본 것과 같은 계층 구조가 XML에서는 어떤 형태를 띠는지 본다. 마지막에는 JSON에는 없는 XML 고유의 공격 표면 — 외부 엔티티 참조(XXE) — 를 다룬다.
