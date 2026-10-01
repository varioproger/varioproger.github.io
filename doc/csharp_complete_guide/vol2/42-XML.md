---
title: "42장. XML"
parent: "2권 — 라이브러리와 동시성"
grand_parent: "C# Complete Guide"
nav_order: 42
---

# 42장. XML

> **이 장의 위치** — 41장에서 JSON을 다루면서 "XML 직렬화와 XXE는 42장에서"라고 미뤄 둔 것을 여기서 끝낸다. XML은 JSON보다 나이가 많고 문법도 무겁지만, 기업 시스템의 설정 파일·전자문서·SOAP 인터페이스·`.csproj` 자체가 전부 XML이다. .NET은 XML을 다루는 방식을 세 갈래로 제공하고, 그 셋은 메모리와 성능과 코드 복잡도를 서로 다르게 교환한다. 이 장은 그 세 갈래를 전부 판다.
>
> **선수 지식** — 29장(LINQ 쿼리), 30장(LINQ 연산자 레퍼런스), 40장(스트림과 파일 I/O), 41장(직렬화와 JSON)
>
> **이 장에서 다루지 않는 것** — LINQ의 쿼리 구문과 연산자 자체는 29장·30장에서 이미 다뤘고, 지연 실행이 왜 그렇게 동작하는지는 29.6절에 있다. 스트림·`TextReader`·인코딩은 40장, JSON API 전반과 `BinaryFormatter`의 제거는 41장을 참조하라. XPath(`System.Xml.XPath`)와 XSLT(`System.Xml.Xsl`)는 이 장에서 존재와 진입점만 언급하고 깊이 들어가지 않는다.

---

## 42.1 XML을 다루는 세 가지 방식 — DOM / 스트리밍 / 직렬화

.NET에서 XML을 읽고 쓰는 길은 크게 셋이다. 셋 중 무엇을 고르느냐가 그 코드의 메모리 사용량, 처리량, 그리고 유지보수 난이도를 거의 다 결정한다. 문법을 배우기 전에 지도부터 그린다.

```text
                         XML 문서 (텍스트)
                                │
        ┌───────────────────────┼───────────────────────┐
        ↓                       ↓                       ↓
 ┌─────────────┐        ┌──────────────┐        ┌──────────────┐
 │   DOM 방식  │        │ 스트리밍 방식│        │  직렬화 방식 │
 ├─────────────┤        ├──────────────┤        ├──────────────┤
 │ XElement    │        │ XmlReader    │        │ XmlSerializer│
 │ XDocument   │        │ XmlWriter    │        │ DataContract │
 │ (X-DOM)     │        │              │        │  Serializer  │
 ├─────────────┤        ├──────────────┤        ├──────────────┤
 │ 전체를 메모리│        │ 커서 하나만  │        │ CLR 객체 그래프│
 │ 트리로 올림 │        │ 앞으로 이동  │        │ ↔ XML 자동 매핑│
 │ 임의 접근 O │        │ 임의 접근 X  │        │ 스키마 고정   │
 └─────────────┘        └──────────────┘        └──────────────┘
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                        서로 섞어 쓸 수 있다
                  (42.13절: XmlReader ↔ X-DOM 혼용)
```

### DOM 방식 — 문서를 객체 트리로 올린다

```xml
<?xml version="1.0" encoding="utf-8"?>
<customer id="123" status="archived">
  <firstname>Joe</firstname>
  <lastname>Bloggs</lastname>
</customer>
```

모든 XML 파일이 그렇듯 선언(declaration)으로 시작하고, 루트 요소가 하나 있다. `customer` 요소는 특성(attribute)을 둘 가지며 각각 이름(`id`, `status`)과 값(`"123"`, `"archived"`)이 있다. 그 안에는 자식 요소 `firstname`과 `lastname`이 있고 각각 단순 텍스트 콘텐츠를 담는다.

선언, 요소, 특성, 값, 텍스트 콘텐츠 — 이 구성물 하나하나를 클래스로 표현하고, 그 클래스가 자식 콘텐츠를 담는 컬렉션 프로퍼티를 가지면 문서 전체를 기술하는 객체 트리를 조립할 수 있다. 이것이 **문서 객체 모델(Document Object Model, DOM)** 이다.

.NET에는 DOM이 두 개 있다. **X-DOM**(`System.Xml.Linq` — `XElement`, `XDocument`, `XAttribute` 등)은 LINQ to XML이 제공하는 경량 DOM이고, **레거시 W3C DOM**(`System.Xml` — `XmlDocument`, `XmlNode`, `XmlElement` 등)은 W3C DOM 명세를 그대로 따른다.

> **⚠️ `XmlDocument`는 신규 코드에서 쓸 이유가 없다**
>
> `XmlDocument` 계열은 W3C DOM 명세를 충실히 옮긴 것이라 API가 장황하다. 노드를 하나 만들려면 소유 문서(`OwnerDocument`)를 통해 팩터리 메서드를 호출해야 하고, 노드를 다른 문서로 옮기려면 `ImportNode`를 거쳐야 한다. X-DOM은 이 제약이 전부 없다. 신규 코드는 X-DOM을 쓰고, `XmlDocument`는 레거시 코드를 읽을 때만 알면 된다.
>
> 보안 기본값도 다르다. `XmlDocument.XmlResolver`의 과거 기본값이 외부 리소스를 해석하는 쪽이었다는 점 때문에 XXE 취약점의 단골 출처였다(42.14절).

### 스트리밍 방식 — 커서 하나로 훑고 지나간다

`XmlReader`는 XML 스트림을 저수준·전진 전용(forward-only)으로 읽는 고성능 클래스다. 문서 전체를 메모리에 올리지 않는다. 커서가 노드 하나를 가리키고, `Read()`를 부르면 다음 노드로 간다. 지나간 노드는 잊는다. `XmlWriter`는 그 대칭이다. 메모리 사용량이 문서 크기와 무관한 것이 결정적 장점이고, "방금 지나온 요소로 돌아가기"가 불가능한 것이 결정적 단점이다.

### 직렬화 방식 — CLR 객체와 XML을 자동으로 매핑한다

`XmlSerializer`나 `DataContractSerializer`에 타입을 알려주면, 그 타입의 인스턴스를 XML로 쓰고 XML을 그 타입으로 되돌린다. XML의 모양은 클래스의 모양이 결정하고 특성(`[XmlAttribute]` 등)으로 세부를 조정한다. 문서 구조가 고정되어 있고 그것을 그대로 담을 C# 타입이 있다면 가장 코드가 짧지만, 구조가 유동적이거나 일부만 건드려야 하거나 알 수 없는 요소를 보존해야 한다면 맞지 않는다.

### 선택 기준표

| 기준 | X-DOM | `XmlReader`/`XmlWriter` | `XmlSerializer` / `DataContractSerializer` |
|---|---|---|---|
| **메모리** | 문서 크기에 비례 (원본보다 크다) | 문서 크기와 무관 (상수) | 결과 객체 그래프 크기에 비례 |
| **임의 접근** | 가능 — 어디든 몇 번이든 | 불가 — 전진 한 번뿐 | 역직렬화 후 객체로 접근 |
| **부분 갱신** | 가능 — 노드 하나만 고쳐 저장 | 사실상 불가 (읽으며 다시 써야 함) | 전체를 역직렬화 후 재직렬화 |
| **쿼리** | LINQ 전면 사용 가능 | 수동 루프 | 객체가 된 뒤 LINQ |
| **처리량** | 트리 구축 비용이 붙는다 | 가장 빠르다 | 매핑 비용 + 최초 1회 코드 생성 |
| **코드 길이** | 짧다 | 길다 (구조를 손으로 따라감) | 가장 짧다 |
| **알 수 없는 요소** | 보존됨 | 직접 처리 | 기본적으로 버려짐 |
| **스키마 강제** | `Validate` 확장으로 별도 | `XmlReaderSettings.Schemas` | 타입 정의가 곧 스키마 |
| **적합한 크기** | ~수십 MB | GB급 | 수 MB |

> **💡 판단 순서**
>
> 1. **구조가 고정이고 담을 클래스가 있다** → 직렬화. 코드가 가장 짧다.
> 2. **문서가 작고(수 MB 이하) 자유롭게 뒤져야 한다** → X-DOM. 압도적으로 편하다.
> 3. **문서가 크고(수백 MB~GB) 반복 레코드 구조다** → `XmlReader`로 훑되 레코드 하나하나는 `XNode.ReadFrom`으로 X-DOM에 올린다(42.13절). 실무에서 가장 자주 쓰는 조합이다.
> 4. **출력만 하고 다시 읽지 않는다** → `XmlWriter` 또는 `XStreamingElement`(42.10절).

### 네임스페이스 지도

XML 관련 타입이 어디에 있는지부터 알아 두면 헤매지 않는다.

| 네임스페이스 | 내용 |
|---|---|
| `System.Xml` | `XmlReader`, `XmlWriter`, `XmlConvert`, `XmlException`, 레거시 `XmlDocument` |
| `System.Xml.Linq` | X-DOM — `XElement`, `XDocument`, `XAttribute`, `XName`, `XNamespace` |
| `System.Xml.Schema` | XSD 지원 — `XmlSchemaSet`, `XmlSchema`, X-DOM용 `Validate` 확장 메서드 |
| `System.Xml.Serialization` | 선언적 XML 직렬화 — `XmlSerializer`와 `[Xml*]` 특성 |
| `System.Xml.XPath` | XPath 쿼리 언어 |
| `System.Xml.Xsl` | 스타일시트(XSLT) 지원 |
| `System.Runtime.Serialization` | `DataContractSerializer`, `[DataContract]`, `[DataMember]` |

> **📌 X-DOM은 저수준 리더/라이터의 얇은 껍데기이기도 하다**
>
> X-DOM은 LINQ 없이도 가치가 있다. `XmlReader`/`XmlWriter` 위에 얹힌 가볍고 잘 설계된 파사드라서, LINQ 쿼리를 한 줄도 쓰지 않고 로드·생성·수정·저장만 해도 레거시 DOM보다 훨씬 낫다.

---

## 42.2 LINQ to XML(X-DOM) 아키텍처

LINQ to XML은 두 가지로 이루어진다.

- **X-DOM** — `XDocument`, `XElement`, `XAttribute` 같은 타입들이 만드는 XML 문서 객체 모델
- **보충 쿼리 연산자 약 10개** — `IEnumerable<T>` 시퀀스에 대해 동작하는 확장 메서드들

X-DOM 타입은 LINQ에 묶여 있지 않다. LINQ 쿼리를 한 줄도 쓰지 않고 X-DOM을 로드·인스턴스화·갱신·저장할 수 있다. 반대로 옛 W3C 호환 타입으로 만든 DOM에도 LINQ 쿼리를 걸 수는 있지만 답답하고 제약이 많다. X-DOM을 구별 짓는 특징은 **LINQ 친화적**이라는 것이며, 구체적으로는 쿼리를 걸 수 있는 `IEnumerable` 시퀀스를 뿜는 메서드를 가진다는 것과, LINQ 투영으로 트리를 통째로 만들 수 있게 생성자가 설계되어 있다는 것이다.

### 상속 계층

```text
        XObject  (추상) ─── Parent, Document, BaseUri, Annotation, Changed/Changing
           │
           ├── XNode  (추상) ─── 순서 있는 혼합 컬렉션에 들어갈 수 있는 것
           │      │              PreviousNode/NextNode, AddBeforeSelf, Remove, ReplaceWith
           │      │
           │      ├── XContainer  (추상) ─── 자식을 가질 수 있는 것
           │      │      │                    Nodes(), Elements(), Add(), Descendants()
           │      │      │
           │      │      ├── XElement    ← 가장 많이 쓰는 타입
           │      │      │                 Name, Value, 특성 관리, HasElements
           │      │      └── XDocument   ← 트리의 뿌리(선택적)
           │      │                        Root, Declaration, DocumentType
           │      │
           │      ├── XText              ── 텍스트 노드
           │      │      └── XCData      ── <![CDATA[ ... ]]>
           │      ├── XComment           ── <!-- ... -->
           │      ├── XProcessingInstruction  ── <?target data?>
           │      └── XDocumentType      ── <!DOCTYPE ...>
           │
           └── XAttribute  ← XNode가 아니다!
                             Name, Value, NextAttribute/PreviousAttribute

  (독립) XStreamingElement  ── XObject를 상속하지 않는다. 42.10절
  (독립) XName, XNamespace, XDeclaration
```

이 계층에서 읽어야 할 사실이 네 가지다.

**첫째, `XObject`가 상속 계층의 뿌리다.** 모든 XML 콘텐츠의 추상 기반 클래스이며, `Parent` 요소로 가는 링크와 선택적인 `XDocument` 링크를 정의한다.

**둘째, `XNode`는 특성을 뺀 대부분의 XML 콘텐츠의 기반 클래스다.** `XNode`를 구별 짓는 성질은 **여러 타입이 섞인 순서 있는 `XNode` 컬렉션에 들어갈 수 있다**는 것이다.

```xml
<data>
  Hello world
  <subelement1/>
  <!--comment-->
  <subelement2/>
</data>
```

`<data>` 안에는 `XText`(`Hello world`), `XElement`, `XComment`, 그리고 두 번째 `XElement`가 온다. 서로 다른 타입이 하나의 순서 있는 컬렉션에 공존한다. 반면 `XAttribute`는 동료로 다른 `XAttribute`만 용납한다.

**셋째, `XAttribute`는 `XNode`가 아니다.** 이건 X-DOM에서 가장 자주 걸려 넘어지는 지점이다. 특성은 노드 컬렉션에 들어가지 않고 별도의 특성 컬렉션에 들어간다. 따라서 `Nodes()`, `Descendants()`, `DescendantNodes()` 어디에도 특성은 나오지 않는다.

> **⚠️ `Descendants()`로 특성을 찾을 수 없다**
>
> ```csharp
> var wrong = root.DescendantNodes().OfType<XAttribute>();  // 항상 빈 시퀀스
> var right = root.DescendantsAndSelf().Attributes();       // 올바른 방법
> ```
>
> `Attributes()`는 `IEnumerable<XElement>`에 대한 확장 메서드로도 정의되어 있어서 시퀀스에 바로 이어 붙일 수 있다(42.5절).

**넷째, `XNode`는 부모를 알지만 자식은 모른다.** 자식을 다루는 것은 하위 클래스 `XContainer`의 일이다. `XContainer`는 자식 처리 멤버를 정의하며 `XElement`와 `XDocument`의 추상 기반 클래스다.

### `XElement` — 값과 특성이라는 두 가지 편의

`XElement`는 특성 관리 멤버와 `Name`, `Value`를 추가한다.

`Value`가 특히 중요하다. 요소가 단일 `XText` 자식 노드를 가지는 (꽤 흔한) 경우, `XElement`의 `Value` 프로퍼티는 읽기와 쓰기 양쪽에서 그 자식의 콘텐츠를 대신 다뤄 준다. 불필요한 탐색을 잘라 주는 것이다. `Value` 덕분에 `XText` 노드를 직접 만질 일이 거의 없다.

### `XDocument` — 있어도 되고 없어도 되는 뚜껑

`XDocument`는 XML 트리의 루트를 나타낸다. 더 정확히는 루트 `XElement`를 감싸고, 거기에 `XDeclaration`, 처리 명령(processing instruction), 그 밖의 루트 수준 부속물을 더한다.

W3C DOM과 달리 **사용은 선택 사항이다**. `XDocument`를 한 번도 만들지 않고 X-DOM을 로드하고 조작하고 저장할 수 있다.

이 성질은 실용적인 결과를 낳는다 — 노드 서브트리를 다른 X-DOM 계층으로 쉽게 옮길 수 있다. 레거시 DOM에서 `ImportNode`가 필요했던 이유가 "노드는 자신을 만든 문서에 소속된다"는 W3C 규칙이었고, X-DOM은 그 규칙을 버렸다.

> **📌 `XObject.Document`와 `XNode.Parent`는 다르다**
>
> `Document`는 트리의 최상단 `XDocument`를 가리킨다 — 없으면 `null`. `Parent`는 직속 부모 `XElement`를 가리킨다. `XDocument`는 자식을 가질 수 있지만 **누구의 부모도 될 수 없다**. 그래서 루트 요소의 `Parent`는 `XDocument`가 있어도 `null`이다. 42.8절에서 다시 본다.

### 이름과 네임스페이스 타입 — `XName`, `XNamespace`

X-DOM에서 요소·특성 이름을 받는 모든 생성자와 메서드는 사실 `string`이 아니라 `XName`을 받는다. 지금까지 문자열을 넘길 수 있었던 것은 `XName`이 `string`으로부터의 암시적 변환을 정의하기 때문이다.

```csharp
public sealed class XNamespace
{
    public string NamespaceName { get; }
}

public sealed class XName          // 지역 이름 + 선택적 네임스페이스
{
    public string LocalName { get; }
    public XNamespace Namespace { get; }   // 선택적
}
```

두 타입 모두 봉인(sealed)되어 있고, `string`으로부터의 암시적 캐스트를 정의한다. 자세한 사용법은 42.9절에서 다룬다.

> **📌 `XName`은 인터닝된다**
>
> `XName` 인스턴스는 내부 테이블에 원자화(atomize)되어 같은 이름은 같은 인스턴스를 공유한다. 그래서 이름 비교가 문자열 비교가 아니라 참조 비교로 끝난다 — 요소 이름으로 필터링하는 쿼리가 빠른 이유다. 대신 `"customer"` 같은 문자열을 넘길 때마다 조회 비용이 든다. 반복문 안에서 같은 이름을 계속 쓴다면 `XName customerName = "customer";`처럼 한 번 만들어 변수에 담아 두는 편이 낫다.

> **⚠️ 요소·특성 이름은 대소문자를 구분한다**
>
> X-DOM에서 요소와 특성 이름은 XML 명세 그대로 대소문자를 구분한다. `Element("Customer")`와 `Element("customer")`는 다른 것을 찾는다. 이 실수는 예외가 아니라 `null`로 나타나기 때문에 조용히 지나간다.

### 실제 트리 모양

다음 코드가 만드는 트리를 보자.

```csharp
XElement customer = XElement.Parse (
  @"<customer id='123' status='archived'>
      <firstname>Joe</firstname>
      <lastname>Bloggs<!--nice name--></lastname>
    </customer>");
```

```text
XElement "customer"
  ├── Attributes ─── XAttribute "id"     = "123"
  │                  XAttribute "status" = "archived"
  └── Nodes ──────── XElement "firstname"
                     │    └── Nodes ── XText "Joe"
                     └── XElement "lastname"
                          └── Nodes ── XText "Bloggs"
                                       XComment "nice name"
```

`lastname`이 자식 노드를 둘 가진다는 점에 주목하라. 그런데도 `customer.Element("lastname").Value`는 `"Bloggs"`를 준다 — `Value`는 모든 자식의 값을 이어 붙이는데, `XComment`의 값은 `Value` 계산에 포함되지 않기 때문이다. 이 규칙은 42.7절에서 정확히 정리한다.

---

## 42.3 X-DOM 로딩·파싱·저장·직렬화

### 로드와 파싱

`XElement`와 `XDocument`는 기존 소스로부터 X-DOM 트리를 만드는 정적 `Load`와 `Parse` 메서드를 제공한다.

- `Load` — 파일, URI, `Stream`, `TextReader`, `XmlReader`로부터 X-DOM을 만든다.
- `Parse` — 문자열로부터 X-DOM을 만든다.

```csharp
XDocument fromWeb  = XDocument.Load ("http://albahari.com/sample.xml");
XElement  fromFile = XElement.Load (@"e:\media\somefile.xml");

XElement config = XElement.Parse (
  @"<configuration>
      <client enabled='true'>
        <timeout>30</timeout>
      </client>
    </configuration>");
```

`Load`와 `Parse`의 차이는 입력원뿐이다. 문자열을 `Load`에 넘기면 **파일 경로 또는 URI로 해석**된다.

> **⚠️ `XElement.Load(string)`은 XML 문자열을 받지 않는다**
>
> `XElement.Load("<a/>")`는 그 문자열을 파일 경로로 해석해 I/O 예외를 낸다. `Parse`가 맞다. 반대로 파일 내용을 `File.ReadAllText`로 읽어 `Parse`에 넘기는 것도 안 좋다 — 문자열을 통째로 만들고 다시 파싱하므로 메모리를 두 배로 쓴다. 파일은 `Load`로 바로 읽어라.

### `XElement.Load`와 `XDocument.Load`의 차이

같은 파일을 두 메서드로 읽으면 결과가 다르다.

| | `XElement.Load` | `XDocument.Load` |
|---|---|---|
| 반환 | 루트 **요소** | 문서 전체 |
| XML 선언 | 버려진다 | `Declaration` 프로퍼티에 보존 |
| 루트 앞뒤 주석·처리 명령 | 버려진다 | `Nodes()`에 보존 |
| `DOCTYPE` | 버려진다 | `DocumentType`에 보존 |
| 이후 접근 | 바로 루트 | `doc.Root`로 한 번 더 |

루트 밖의 정보를 보존해서 다시 써야 한다면 `XDocument`를 써야 하고, 그렇지 않으면 `XElement`가 더 짧다.

### `LoadOptions`

`Load`와 `Parse`는 모두 `LoadOptions` 플래그(`[Flags]` 열거형)를 받는 오버로드를 가진다.

| 값 | 의미 |
|---|---|
| `None` | 기본값. 유의미하지 않은 공백을 버린다 |
| `PreserveWhitespace` | 요소 사이의 공백까지 `XText` 노드로 보존한다 |
| `SetBaseUri` | 각 노드의 `BaseUri`를 채운다 (`XmlReader`가 URI를 보고할 때만) |
| `SetLineInfo` | 각 노드에 원본의 줄·열 번호를 붙인다 |

`SetLineInfo`를 켜면 모든 `XObject`가 구현하는 `IXmlLineInfo` 인터페이스가 의미 있는 값을 준다.

```csharp
using System.Xml;               // IXmlLineInfo

XDocument doc = XDocument.Load ("config.xml", LoadOptions.SetLineInfo);
foreach (XElement e in doc.Descendants ("timeout"))
{
    var li = (IXmlLineInfo) e;
    if (li.HasLineInfo())
        Console.WriteLine ($"{e.Name}: {li.LineNumber}행 {li.LinePosition}열");
}
```

> **💡 설정 파일 검증기를 만든다면 `SetLineInfo`는 필수다**
>
> `설정이 잘못되었다`라는 메시지와 `config.xml 47행: timeout 값이 음수다`라는 메시지는 사용자에게 완전히 다른 물건이다. 사람이 손으로 편집하는 XML을 읽는 코드라면 `SetLineInfo`를 켜고 오류 메시지에 줄 번호를 넣어라 — 비용은 노드마다 정수 두 개다.

> **⚠️ `PreserveWhitespace`를 켜면 탐색 코드가 깨질 수 있다**
>
> 기본 로드는 요소 사이의 들여쓰기 공백을 버린다. `PreserveWhitespace`를 켜면 그 공백이 전부 `XText` 노드가 되어 `Nodes()`에 등장한다. `FirstNode`가 이제 첫 자식 요소가 아니라 줄바꿈 공백이고, `element.Value`에는 들여쓰기가 섞여 들어온다.
>
> ```csharp
> XElement.Parse ("<a>\n  <b/>\n</a>").Nodes().Count();          // 1
> XElement.Parse ("<a>\n  <b/>\n</a>",
>                 LoadOptions.PreserveWhitespace).Nodes().Count();  // 3 (공백, b, 공백)
> ```
>
> `Nodes()` 대신 `Elements()`를 쓰면 이 차이에 영향을 받지 않는다. 원본 서식을 그대로 되쓰는 것이 목적이 아니라면 `PreserveWhitespace`는 켜지 마라.

### 로드한 트리를 조작하고 다시 출력하기

```csharp
XElement client = config.Element ("client");

bool enabled = (bool) client.Attribute ("enabled");  // 특성 읽기 — True
client.Attribute ("enabled").SetValue (!enabled);    // 특성 갱신

int timeout = (int) client.Element ("timeout");      // 요소 읽기 — 30
client.Element ("timeout").SetValue (timeout * 2);   // 요소 갱신

client.Add (new XElement ("retries", 3));            // 새 요소 추가
Console.WriteLine (config);                          // ToString()이 암시 호출된다
```

마지막 줄의 출력은 이렇다.

```xml
<configuration>
  <client enabled="false">
    <timeout>60</timeout>
    <retries>3</retries>
  </client>
</configuration>
```

`Console.WriteLine(config)`가 XML을 뱉는 것은 `XElement`가 `ToString()`을 재정의하기 때문이다. 디버깅할 때 매우 유용하다.

### 저장과 직렬화

어떤 노드든 `ToString`을 호출하면 그 콘텐츠가 XML 문자열이 된다 — 방금 본 것처럼 줄바꿈과 들여쓰기가 적용된 형태다. `ToString`에 `SaveOptions.DisableFormatting`을 지정하면 줄바꿈과 들여쓰기를 끌 수 있다.

`XElement`와 `XDocument`는 X-DOM을 파일, `Stream`, `TextWriter`, `XmlWriter`에 쓰는 `Save` 메서드도 제공한다. 파일을 지정하면 XML 선언이 자동으로 기록된다. `XNode` 클래스에 정의된 `WriteTo` 메서드도 있는데, 이건 `XmlWriter`만 받는다.

| 메서드 | 정의 위치 | 출력 대상 | XML 선언 |
|---|---|---|---|
| `ToString()` | `XNode` (재정의) | `string` | **절대 안 씀** |
| `ToString(SaveOptions)` | `XNode` | `string` | 절대 안 씀 |
| `Save(string fileName)` | `XElement`, `XDocument` | 파일 | 항상 씀 |
| `Save(Stream)` | `XElement`, `XDocument` | 스트림 | 씀 |
| `Save(TextWriter)` | `XElement`, `XDocument` | 텍스트 라이터 | 씀 |
| `Save(XmlWriter)` | `XElement`, `XDocument` | `XmlWriter` | 라이터 설정을 따름 |
| `WriteTo(XmlWriter)` | `XNode` | `XmlWriter` | 라이터 설정을 따름 |

`SaveOptions` 역시 `[Flags]` 열거형이다.

| 값 | 의미 |
|---|---|
| `None` | 기본값. 들여쓰기와 줄바꿈을 넣는다 |
| `DisableFormatting` | 서식을 끈다 — 공백 한 글자 없이 붙여 쓴다 |
| `OmitDuplicateNamespaces` | 부모에 이미 선언된 것과 중복되는 네임스페이스 선언을 생략한다 |

```csharp
var e = XElement.Parse ("<a><b>1</b><c>2</c></a>");
e.ToString();                                     // "<a>\n  <b>1</b>\n  <c>2</c>\n</a>"
e.ToString (SaveOptions.DisableFormatting);       // "<a><b>1</b><c>2</c></a>"
```

> **💡 네트워크로 보낼 XML은 `DisableFormatting`으로 만들어라**
>
> 들여쓰기 공백은 사람이 읽을 때만 쓸모가 있고 HTTP 본문이나 메시지 큐 페이로드에는 순수한 낭비다. 반대로 **사람이 diff를 볼 파일**은 반드시 서식을 켜라 — 한 줄짜리 XML은 diff가 무의미해진다.

> **⚠️ `ToString()`은 XML 선언을 절대 쓰지 않는다**
>
> ```csharp
> File.WriteAllText ("data.xml", doc.ToString());   // 선언 없는 파일이 나온다
> doc.Save ("data.xml");                            // 선언이 붙는다
> ```
>
> 이게 버그가 아니라 의도된 설계라는 것은 42.8절에서 설명한다. 요약하면 — `ToString`이 선언을 뱉었다면 인코딩을 거짓으로 말하게 되기 때문이다.

### `XmlReader`/`XmlWriter`와의 연결점

X-DOM은 저수준 리더/라이터와 양방향으로 이어진다. 이 네 진입점은 42.13절의 혼용 패턴에서 핵심이 된다.

| 멤버 | 방향 | 설명 |
|---|---|---|
| `XNode.ReadFrom(XmlReader)` (정적) | 리더 → X-DOM | 노드 **하나**만 완전히 읽고 멈춘다. 이후 리더로 계속 읽을 수 있다 |
| `XElement.Load(XmlReader)` | 리더 → X-DOM | 문서 전체를 기대한다 ("탐욕적") |
| `XNode.CreateReader()` | X-DOM → 리더 | 기존 X-DOM 위에 `XmlReader`를 씌운다 |
| `XContainer.CreateWriter()` | 라이터 → X-DOM | `XmlWriter`로 쓴 내용을 X-DOM에 채워 넣는다 |

`ReadFrom`과 `Load`의 차이가 중요하다. `Load`는 문서 전체를 다 읽으려 하고, `ReadFrom`은 현재 커서 위치의 노드 하나(와 그 서브트리)만 읽고 멈춘다. 1GB 로그 파일에서 레코드 하나씩 X-DOM으로 올리는 패턴이 가능한 이유가 `ReadFrom`이다. 반대 방향으로는 `CreateReader()`가 이미 메모리에 있는 X-DOM 위에 `XmlReader` 인터페이스를 씌워 준다.

### 성능 — 트리 구축 비용은 어디서 오는가

X-DOM 로드는 네 단계로 나뉜다. (1) 내부 `XmlReader`가 텍스트를 토큰으로 쪼갠다 — 스트리밍이며 빠르다. (2) 요소마다 `XElement`, 특성마다 `XAttribute`, 텍스트마다 문자열이 힙에 할당된다. (3) 자식 노드들이 단일 연결 리스트로 이어진다. (4) 각 이름이 `XName` 테이블에서 조회·등록된다.

즉 로드 비용의 대부분은 파싱이 아니라 **2번 할당**이다. 문서가 클수록 GC 압력이 커지고, 요소가 잘게 쪼개진 문서일수록 오버헤드 비율이 나쁘다.

메모리 사용량은 원본 텍스트 크기보다 항상 크다. 몇 배인지는 문서 구조에 따라 크게 달라지므로 — 요소당 평균 텍스트 길이, 특성 개수, 이름 중복도가 모두 영향을 준다 — 반드시 **자신의 데이터로 실측**해야 한다. 실측 방법은 67장(측정 없이 최적화 없다)에 있다.

> **📌 대용량 문서를 `XDocument.Load(uri)`로 직접 받지 마라**
>
> `Load`에 URI 문자열을 넘기면 내부적으로 네트워크 요청을 하고 그 응답을 파싱한다. 타임아웃 제어, 인증 헤더, 재시도, 취소 토큰을 얹을 자리가 없다. 실무에서는 `HttpClient`(43.4절)로 `Stream`을 얻어(`await httpClient.GetStreamAsync(url, ct)`) 그 스트림을 `Load`에 넘겨라. `XDocument.LoadAsync(Stream, LoadOptions, CancellationToken)` 오버로드도 있다 ※.NET Core 계열 전용(.NET Framework에는 없다) — 파싱까지 비동기로 돌린다. 대칭으로 `SaveAsync`도 있다.

---

## 42.4 함수형 구성(functional construction)과 콘텐츠 지정, 자동 깊은 복제

### 절차적 구성 — 읽기 힘든 쪽

`Load`나 `Parse` 대신, 객체를 손으로 만들고 `XContainer`의 `Add` 메서드로 부모에 붙여 X-DOM 트리를 만들 수 있다. `XElement`와 `XAttribute`를 만들 때는 이름과 값만 주면 된다.

```csharp
XElement lastName = new XElement ("lastname", "Bloggs");
lastName.Add (new XComment ("nice name"));

XElement customer = new XElement ("customer");
customer.Add (new XAttribute ("id", 123));
customer.Add (new XElement ("firstname", "Joe"));
customer.Add (lastName);
// <customer id="123"><firstname>Joe</firstname>
//   <lastname>Bloggs<!--nice name--></lastname></customer>
```

`XElement`를 만들 때 값은 선택 사항이다 — 이름만 주고 콘텐츠는 나중에 추가해도 된다. 값을 줄 때 단순 문자열로 충분했다는 점에 주목하라. `XText` 자식 노드를 명시적으로 만들어 붙일 필요가 없었다. X-DOM이 그 일을 자동으로 해 주므로 그냥 "값"만 다루면 된다.

문제는 이 코드에서 XML의 구조가 눈에 안 들어온다는 것이다.

### 함수형 구성 — 코드가 XML의 모양을 닮는다

X-DOM은 함수형 프로그래밍에서 이름을 따온 **함수형 구성(functional construction)** 이라는 인스턴스화 방식을 지원한다. 트리 전체를 **하나의 식**으로 만든다.

```csharp
XElement customer =
  new XElement ("customer", new XAttribute ("id", 123),
    new XElement ("firstname", "joe"),
    new XElement ("lastname", "bloggs",
      new XComment ("nice name")
    )
  );
```

이점이 둘이다. 첫째, **코드가 XML의 모양을 닮는다**. 둘째, LINQ 쿼리의 `select` 절에 통째로 집어넣을 수 있다 — 이 투영 패턴은 42.10절에서 깊이 다룬다.

```csharp
XElement query =
  new XElement ("customers",
    from c in dbContext.Customers.AsEnumerable()
    select
      new XElement ("customer", new XAttribute ("id", c.ID),
        new XElement ("firstname", c.FirstName),
        new XElement ("lastname", c.LastName))
  );
```

### 왜 이게 가능한가 — `params object[]`

함수형 구성이 가능한 것은 `XElement`(와 `XDocument`)의 생성자와 `XContainer.Add`가 `params object` 배열을 받도록 오버로드되어 있기 때문이다.

```csharp
public XElement (XName name, params object[] content)
public void     Add          (params object[] content)
```

따라서 X-DOM을 만들거나 덧붙일 때 **어떤 타입의 자식 객체든 몇 개든** 지정할 수 있다. 아무것이나 유효한 콘텐츠로 취급되기 때문이다.

### 콘텐츠 해석 규칙표

각 콘텐츠 객체가 내부적으로 어떻게 처리되는지가 이 절의 핵심이다. `XContainer`는 다음 순서로 판단한다.

| 순서 | 조건 | 처리 |
|---|---|---|
| 1 | 객체가 `null`이다 | **무시한다** |
| 2 | `XNode` 또는 `XStreamingElement` 기반이다 | 그대로 `Nodes` 컬렉션에 추가 |
| 3 | `XAttribute`다 | `Attributes` 컬렉션에 추가 |
| 4 | `string`이다 | `XText` 노드로 감싸 `Nodes`에 추가 |
| 5 | `IEnumerable`을 구현한다 | 열거하고, 각 원소에 **같은 규칙을 다시 적용** |
| 6 | 그 외 전부 | 문자열로 변환 → `XText`로 감싸 `Nodes`에 추가 |

모든 것이 결국 `Nodes` 아니면 `Attributes` 둘 중 하나로 간다. 그리고 어떤 객체든 유효한 콘텐츠인 이유는, 최후에는 언제나 `ToString`을 불러 `XText` 노드로 취급할 수 있기 때문이다.

이 표에서 실무적으로 가장 중요한 줄이 **1번과 5번**이다.

**1번(`null` 무시)** 덕분에 조건부 요소를 삼항 연산자로 깔끔하게 쓸 수 있다.

```csharp
new XElement ("customer",
  new XElement ("name", c.Name),
  c.Email == null ? null : new XElement ("email", c.Email)   // null이면 그냥 사라진다
)
```

**5번(`IEnumerable` 재귀)** 덕분에 LINQ 쿼리 결과를 그대로 콘텐츠로 넘길 수 있다. 시퀀스가 자동으로 펼쳐져 각 원소가 자식이 되며, 시퀀스 안에 또 시퀀스가 있어도 재귀적으로 펼쳐진다.

```csharp
var e = new XElement ("root",
  new[] { new XElement ("a"), new XElement ("b") },     // 배열이 펼쳐진다
  Enumerable.Range (1, 3).Select (i => new XElement ("n", i)));
// <root><a /><b /><n>1</n><n>2</n><n>3</n></root>
```

> **⚠️ `string`은 `IEnumerable<char>`이지만 5번이 아니라 4번으로 간다**
>
> 규칙이 4번(문자열) → 5번(`IEnumerable`) 순서인 것이 중요하다. 만약 순서가 반대였다면 `"Joe"`가 `<root>J</root><root>o</root>...`처럼 문자 하나하나로 펼쳐졌을 것이다. 이런 종류의 순서 의존성은 API 설계에서 흔한 함정이고(78장), X-DOM은 그 함정을 피해 갔다.

### 6번 규칙의 예외 — `XmlConvert`가 끼어든다

임의 타입에 `ToString`을 부르기 **전에**, `XContainer`는 그 객체가 다음 타입 중 하나인지 먼저 확인한다.

```text
float, double, decimal, bool, DateTime, DateTimeOffset, TimeSpan
```

해당한다면 객체 자신의 `ToString` 대신 `XmlConvert` 헬퍼 클래스의 타입별 `ToString` 메서드를 호출한다. 데이터가 왕복 변환(round-trip) 가능하고 표준 XML 서식 규칙을 지키도록 보장하기 위해서다.

이건 사소한 디테일이 아니다. 결과를 직접 비교해 보자.

```csharp
bool b = true;
b.ToString();                            // "True"   ← C# 관례
new XElement ("x", b).Value;             // "true"   ← XML 표준

double.NegativeInfinity.ToString();      // "-∞" (문화권에 따라)
new XElement ("x", double.NegativeInfinity).Value;   // "-INF"  ← XML 표준

var d = new DateTime (2026, 3, 14, 9, 26, 53);
d.ToString();                            // 문화권에 따라 다름
new XElement ("x", d).Value;             // "2026-03-14T09:26:53"
```

> **⚠️ `.ToString()`을 손으로 붙이는 순간 이 보호가 사라진다**
>
> `new XElement("price", 1234.5m)`은 안전하지만 `new XElement("price", 1234.5m.ToString())`은 현재 문화권에 의존한다. 독일어 문화권(`de-DE`)이 걸린 스레드에서 두 번째 형태는 `<price>1234,5</price>`를 만든다. 쉼표는 XML 숫자 표현이 아니다. 이 XML을 다른 시스템이 읽으면 파싱에 실패하거나, 더 나쁘게는 다른 값으로 읽는다. **값을 그대로 넘겨라.** 포매팅과 문화권 문제 일반론은 38장에 있다.

> **📌 문자열 값이 항상 `XText` 노드가 되는 것은 아니다**
>
> X-DOM은 이 단계를 내부적으로 최적화한다. 단순 텍스트 콘텐츠는 문자열 필드에 그대로 저장하고, `XContainer`의 `Nodes()`를 호출하는 시점에야 `XText` 노드를 만든다. 즉 값만 읽고 쓰는 코드는 `XText` 인스턴스를 아예 할당하지 않는다. `Nodes()`를 습관적으로 호출하지 말고 `Value`나 `Elements()`를 쓰는 편이 나은 이유 중 하나다.

### 컴파일 결과 — 배열 하나와 박싱 몇 개

`new XElement("customer", new XAttribute("id", 123), new XElement("firstname", "Joe"))`가 컴파일되면 IL은 대략 이렇다(핵심만 발췌).

```il
  ldstr      "customer"
  call       class [System.Xml.Linq]System.Xml.Linq.XName
             [System.Xml.Linq]System.Xml.Linq.XName::op_Implicit(string)
  ldc.i4.2
  newarr     [System.Runtime]System.Object          // params 배열 할당
  dup
  ldc.i4.0
  ldstr      "id"
  call       ...XName::op_Implicit(string)
  ldc.i4.s   123
  box        [System.Runtime]System.Int32           // int → object 박싱
  newobj     instance void ...XAttribute::.ctor(class ...XName, object)
  stelem.ref
  dup
  ldc.i4.1
  // ... 두 번째 원소(firstname XElement)도 같은 방식으로 채운다
  stelem.ref
  newobj     instance void ...XElement::.ctor(class ...XName, object[])
```

읽어야 할 것이 셋이다. **`op_Implicit`** — 문자열은 `XName.op_Implicit`을 거쳐 `XName`이 되며, 이 호출이 원자화 테이블 조회다. **`newarr System.Object`** — `params` 호출마다 `object[]` 배열이 하나씩 힙에 할당된다. **`box System.Int32`** — 값 타입 콘텐츠는 전부 박싱된다.

### 런타임 동작과 성능 영향

| 구성 방식 | 배열 할당 | 박싱 | 특징 |
|---|---|---|---|
| `new XElement(name)` | 없음 | 없음 | 가장 가볍다 |
| `new XElement(name, value)` | 없음 (단일 `object` 오버로드) | 값 타입이면 발생 | 자식 1개일 때 최적 |
| `new XElement(name, a, b, ...)` | `object[]` 1개 | 값 타입 인자마다 발생 | 함수형 구성의 비용 |
| `Add(a, b, c)` | `object[]` 1개 | 동일 | 반복 호출 시 배열이 계속 생김 |

**인자가 하나일 때는 배열이 안 생긴다.** `XElement`에 `(XName, object)` 오버로드가 따로 있어서 컴파일러가 그쪽을 고르기 때문이다. 반대로 반복문에서 `Add`를 여러 번 부르는 코드는 매번 배열을 만든다.

```csharp
// 배열 N개 할당
foreach (var item in items)
    root.Add (new XElement ("item", item));

// 배열 1개 (LINQ 결과가 IEnumerable로 한 번에 들어간다)
root.Add (items.Select (i => new XElement ("item", i)));
```

두 번째 형태는 규칙 5번(`IEnumerable` 재귀 펼침)을 이용한다. 배열 할당이 한 번으로 줄고, 코드도 짧다.

> **💡 성능을 이유로 함수형 구성을 피할 필요는 거의 없다**
>
> 위의 할당들은 X-DOM 트리 자체의 할당(요소당 `XElement` 인스턴스)에 비하면 부차적이다. 요소가 100만 개인 문서를 만든다면 애초에 X-DOM이 아니라 `XmlWriter`나 `XStreamingElement`를 써야 한다(42.10절, 42.12절). X-DOM을 쓰기로 했다면 가독성을 택하라. 할당을 줄이는 일반 원칙은 69장에 있다.

### 자동 깊은 복제(automatic deep cloning)

노드나 특성이 요소에 추가되면(함수형 구성이든 `Add` 메서드든), 그 노드/특성의 `Parent` 프로퍼티가 해당 요소로 설정된다. **노드는 부모 요소를 하나만 가질 수 있다.** 이미 부모가 있는 노드를 두 번째 부모에 추가하면, 노드가 자동으로 **깊은 복제(deep clone)** 된다.

```csharp
var address = new XElement ("address",
  new XElement ("street", "Lawley St"),
  new XElement ("town", "North Beach"));

var customer1 = new XElement ("customer1", address);
var customer2 = new XElement ("customer2", address);

customer1.Element ("address").Element ("street").Value = "Another St";
Console.WriteLine (customer2.Element ("address").Element ("street").Value);
// Lawley St — customer2는 영향을 받지 않았다
```

각 customer가 `address`의 **별도 사본**을 가지기 때문이다. 이 자동 복제는 X-DOM 객체 인스턴스화를 부작용에서 자유롭게 유지한다 — 함수형 프로그래밍의 또 다른 특징이다.

```text
  address (Parent = null)
     │
     ├─ customer1에 추가 ──→ address (Parent = customer1)   ← 원본이 부모를 얻음
     │
     └─ customer2에 추가 ──→ address 사본 (Parent = customer2)  ← 깊은 복제

  최초 추가만 원본을 쓴다. 두 번째부터는 전부 사본이다.
```

> **⚠️ 자동 깊은 복제는 조용히 일어난다 — 예외도 경고도 없다**
>
> 같은 노드를 여러 곳에 꽂아 놓고 "한 곳만 고치면 다 바뀌겠지"라고 기대하면 틀린다. 반대로 "한 곳만 고쳤는데 다른 곳도 바뀌었다"고 놀랄 일도 없다. 하지만 진짜 함정은 **세 번째 경우**다.
>
> ```csharp
> var shared = new XElement ("meta", new XElement ("version", 1));
> var docA = new XElement ("a", shared);
> var docB = new XElement ("b", shared);
>
> // 원본 shared를 고친다 — 어느 쪽이 바뀔까?
> shared.Element ("version").Value = "2";
>
> Console.WriteLine (docA.Element ("meta").Element ("version").Value);  // 2
> Console.WriteLine (docB.Element ("meta").Element ("version").Value);  // 1
> ```
>
> `shared`는 **첫 번째** 부모(`docA`)에 원본 그대로 들어갔고, `docB`에는 사본이 들어갔다. 그래서 원본 변수를 고치면 `docA`만 바뀐다. 노드를 여러 트리에 재사용할 계획이라면, 변수에 담아 재사용하지 말고 **매번 새로 만들거나** `new XElement(existing)` 복사 생성자로 명시적으로 복제하라.

> **📌 `XElement`에는 복사 생성자가 있다**
>
> `new XElement(XElement other)`는 깊은 복사본을 만든다. `XAttribute`, `XComment`, `XText`, `XDocument`에도 같은 형태가 있다. 자동 복제에 의존하는 대신 의도를 드러내고 싶을 때 쓴다. 노드를 **이동**하고 싶다면 `Remove()`로 먼저 부모에서 떼어 낸 다음 추가하라 — 부모가 없는 노드는 복제되지 않는다.

---

## 42.5 탐색과 쿼리 — 자식·부모·형제·특성

`XNode`와 `XContainer` 클래스는 X-DOM 트리를 순회하는 메서드와 프로퍼티를 정의한다. 다만 전통적인 DOM과 달리 이 함수들은 `IList<T>`를 구현한 컬렉션을 반환하지 않는다. 대신 **단일 값**이나 **`IEnumerable<T>`를 구현한 시퀀스**를 반환한다 — 그 위에 LINQ 쿼리를 걸거나 `foreach`로 열거하는 것이 기대되는 사용법이다. 덕분에 단순 탐색과 고급 쿼리를 같은 문법으로 처리한다.

지연 실행 규칙이 그대로 적용된다는 점을 잊지 마라. `Elements()`가 반환하는 것은 결과가 아니라 **아직 실행되지 않은 시퀀스**다. 그 의미는 29.6절에 있다.

### 자식 노드 탐색

| 반환 타입 | 멤버 | 정의 위치 |
|---|---|---|
| `XNode` | `FirstNode { get; }` | `XContainer` |
| `XNode` | `LastNode { get; }` | `XContainer` |
| `IEnumerable<XNode>` | `Nodes()` | `XContainer`* |
| `IEnumerable<XNode>` | `DescendantNodes()` | `XContainer`* |
| `IEnumerable<XNode>` | `DescendantNodesAndSelf()` | `XElement`* |
| `XElement` | `Element (XName)` | `XContainer` |
| `IEnumerable<XElement>` | `Elements()` | `XContainer`* |
| `IEnumerable<XElement>` | `Elements (XName)` | `XContainer`* |
| `IEnumerable<XElement>` | `Descendants()` | `XContainer`* |
| `IEnumerable<XElement>` | `Descendants (XName)` | `XContainer`* |
| `IEnumerable<XElement>` | `DescendantsAndSelf()` | `XElement`* |
| `IEnumerable<XElement>` | `DescendantsAndSelf (XName)` | `XElement`* |
| `bool` | `HasElements { get; }` | `XElement` |

세 번째 열에 별표(`*`)가 붙은 함수는 **같은 타입의 시퀀스에 대해서도** 동작한다. 예를 들어 `Nodes`는 `XContainer` 하나에도, `XContainer` 시퀀스에도 호출할 수 있다. `System.Xml.Linq`에 정의된 확장 메서드 덕분이다 — 개요에서 말한 "보충 쿼리 연산자"가 바로 이것들이다.

이 성질이 X-DOM 쿼리를 짧게 만든다.

```csharp
// bench의 모든 toolbox 안의 모든 handtool
bench.Elements ("toolbox").Elements ("handtool")
//   ↑ 인스턴스 메서드        ↑ 확장 메서드 (IEnumerable<XContainer>에 대해)
```

### `FirstNode`, `LastNode`, `Nodes`

`FirstNode`와 `LastNode`는 첫/마지막 자식 노드에 직접 접근하고, `Nodes`는 모든 자식을 시퀀스로 반환한다. 셋 다 **직속 자손만** 고려한다.

```csharp
var bench = new XElement ("bench",
  new XElement ("toolbox",
    new XElement ("handtool", "Hammer"),
    new XElement ("handtool", "Rasp")),
  new XElement ("toolbox",
    new XElement ("handtool", "Saw"),
    new XElement ("powertool", "Nailgun")),
  new XComment ("Be careful with the nailgun"));

foreach (XNode node in bench.Nodes())
    Console.WriteLine (node.ToString (SaveOptions.DisableFormatting) + ".");
// <toolbox><handtool>Hammer</handtool><handtool>Rasp</handtool></toolbox>.
// <toolbox><handtool>Saw</handtool><powertool>Nailgun</powertool></toolbox>.
// <!--Be careful with the nailgun-->.
```

주석 노드가 포함되었다는 점에 주목하라. `Nodes()`는 타입을 가리지 않는다.

### 요소 가져오기 — `Elements`

`Elements` 메서드는 `XElement` 타입의 자식 노드만 반환한다.

```csharp
foreach (XElement e in bench.Elements())
    Console.WriteLine (e.Name + "=" + e.Value);

// toolbox=HammerRasp
// toolbox=SawNailgun
```

다음 LINQ 쿼리는 못총(nailgun)이 든 공구함을 찾는다 — 결과는 `{ "SawNailgun" }`이다.

```csharp
IEnumerable<string> query =
  from toolbox in bench.Elements()
  where toolbox.Elements().Any (tool => tool.Value == "Nailgun")
  select toolbox.Value;
```

다음 예는 `SelectMany` 쿼리로 모든 공구함의 수공구를 가져온다 — 결과는 `{ "Hammer", "Rasp", "Saw" }`다.

```csharp
IEnumerable<string> query =
  from toolbox in bench.Elements()
  from tool in toolbox.Elements()
  where tool.Name == "handtool"
  select tool.Value;
```

`Elements` 자체가 `Nodes`에 대한 LINQ 쿼리와 동등하다. 위 쿼리의 첫 줄은 이렇게 시작해도 같다.

```csharp
from toolbox in bench.Nodes().OfType<XElement>()
where ...
```

`Elements`는 주어진 이름의 요소만 반환할 수도 있다.

```csharp
int x = bench.Elements ("toolbox").Count();                            // 2
int y = bench.Elements().Where (e => e.Name == "toolbox").Count();     // 2 — 동등
```

`Elements`는 `IEnumerable<T> where T : XContainer` 인자를 받는 확장 메서드로도 정의되어 있다. 덕분에 요소 시퀀스에도 이어 붙일 수 있다. 앞의 수공구 쿼리를 `from tool in bench.Elements("toolbox").Elements("handtool") select tool.Value`로 다시 쓸 수 있으며, 첫 `Elements` 호출은 인스턴스 메서드에, 두 번째는 확장 메서드에 바인딩된다.

### 단일 요소 가져오기 — `Element`와 그 함정

`Element`(단수형)는 주어진 이름의 **첫 번째** 일치 요소를 반환한다. `Elements()`를 호출한 뒤 이름 일치 조건자로 `FirstOrDefault`를 적용하는 것과 동등하며, **요청한 요소가 없으면 `null`을 반환한다.**

```csharp
XElement settings = XElement.Load ("databaseSettings.xml");
string cx = settings.Element ("database").Element ("connectString").Value;
```

여기가 X-DOM에서 가장 자주 사고가 나는 지점이다.

> **⚠️ `Element()`는 `null`, `Elements()`는 빈 시퀀스 — 이 비대칭을 외워라**
>
> | 호출 | 대상이 없을 때 |
> |---|---|
> | `Element("xyz")` | **`null`** |
> | `Elements("xyz")` | **빈 시퀀스** (`null`이 아니다) |
> | `Attribute("xyz")` | **`null`** |
> | `Attributes("xyz")` | **빈 시퀀스** |
> | `Descendants("xyz")` | **빈 시퀀스** |
> | `Parent` (루트에서) | **`null`** |
>
> 단수형은 `null`을 주고 복수형은 빈 시퀀스를 준다. 그래서 복수형 결과에는 `null` 검사가 필요 없고 그대로 `foreach`나 LINQ에 넘겨도 안전하다. 반대로 단수형 결과는 항상 `null`일 수 있다고 가정해야 한다.
>
> ```csharp
> // 안전: 없으면 0회 반복
> foreach (var e in root.Elements ("missing")) { ... }
>
> // 위험: NullReferenceException
> string v = root.Element ("missing").Value;
> ```

`Element("xyz").Value`는 `xyz` 요소가 없으면 `NullReferenceException`을 던진다. 예외 대신 `null`을 원한다면 두 가지 방법이 있다 — null 조건부 연산자를 쓰거나, `Value`를 조회하는 대신 `XElement`를 `string`으로 **캐스트**하는 것이다.

```csharp
string a = settings.Element ("xyz")?.Value;      // null 조건부 연산자
string b = (string) settings.Element ("xyz");    // 명시적 변환 연산자
```

두 번째가 동작하는 이유는 `XElement`가 바로 이 목적을 위해 명시적 `string` 변환을 정의하기 때문이다. `null`인 `XElement`를 `string`으로 캐스트하면 `null`이 나온다. 값 변환의 전모는 42.7절에서 다룬다.

> **💡 `Element(...)?.Value`보다 `(string) Element(...)`가 나은 경우**
>
> 둘 다 `null`을 주지만, 캐스트 쪽은 `int?`, `DateTime?` 같은 다른 타입으로도 같은 문법이 그대로 확장된다. 설정 읽기 코드를 한 가지 관용구로 통일하면 읽기 쉽다.
>
> ```csharp
> string cx      = (string)   settings.Element ("connectString");
> int    timeout = (int?)     settings.Element ("timeout") ?? 30;
> bool   verbose = (bool?)    settings.Element ("verbose") ?? false;
> ```

### 자손 가져오기 — `Descendants`

`XContainer`는 자식 요소/노드에 **그 자식들, 그리고 그 아래 전부**(트리 전체)를 더해 반환하는 `Descendants`와 `DescendantNodes` 메서드도 제공한다. `Descendants`는 선택적으로 요소 이름을 받는다.

```csharp
Console.WriteLine (bench.Descendants ("handtool").Count());   // 3
```

부모 노드와 잎 노드가 모두 포함된다.

```csharp
foreach (XNode node in bench.DescendantNodes())
    Console.WriteLine (node.ToString (SaveOptions.DisableFormatting));
// <toolbox>...</toolbox> / <handtool>Hammer</handtool> / Hammer /
// <handtool>Rasp</handtool> / Rasp / <toolbox>...</toolbox> / ... /
// <!--Be careful with the nailgun-->
```

순회 순서는 **문서 순서(깊이 우선 전위)** 다. 부모가 먼저 나오고 그 자손이 뒤따른다.

다음 쿼리는 X-DOM 어디에 있든 "careful"이라는 단어를 담은 주석을 전부 뽑는다.

```csharp
IEnumerable<string> query =
  from c in bench.DescendantNodes().OfType<XComment>()
  where c.Value.Contains ("careful")
  orderby c.Value
  select c.Value;
```

> **⚠️ `Descendants()`는 편하지만 비싸다**
>
> `Descendants()`는 서브트리 전체를 순회하며, 같은 이름이 다른 깊이에 또 있으면 의도치 않은 것까지 딸려 온다. 구조를 아는 문서라면 `Element("a").Element("b").Elements("x")`처럼 경로를 명시하는 편이 **더 빠르고 더 정확하다**. 반복문 안에서 `Descendants()`를 부르는 코드는 특히 조심하라 — 반복마다 전체 트리를 다시 훑으므로 `ToLookup`으로 한 번만 인덱싱하는 편이 낫다(30.8절).

### 부모 탐색

모든 `XNode`는 `Parent` 프로퍼티와 조상 탐색 메서드를 가진다. **부모는 언제나 `XElement`다.**

| 반환 타입 | 멤버 | 정의 위치 |
|---|---|---|
| `XElement` | `Parent { get; }` | `XNode` |
| `IEnumerable<XElement>` | `Ancestors()` | `XNode` |
| `IEnumerable<XElement>` | `Ancestors (XName)` | `XNode` |
| `IEnumerable<XElement>` | `AncestorsAndSelf()` | `XElement` |
| `IEnumerable<XElement>` | `AncestorsAndSelf (XName)` | `XElement` |

`x`가 `XElement`라면 모든 자식에 대해 `child.Parent == x`가 성립한다. 그러나 `x`가 `XDocument`라면 얘기가 다르다 — `XDocument`는 **자식을 가질 수는 있지만 누구의 부모도 될 수 없다.** `XDocument`에 접근하려면 `Document` 프로퍼티를 쓰며, 이건 트리의 어떤 객체에서든 동작한다.

`Ancestors`는 첫 원소가 `Parent`, 다음이 `Parent.Parent` … 이런 식으로 루트 요소까지 이어지는 시퀀스를 반환한다.

```csharp
// 루트 요소로 가는 두 가지 방법
XElement root1 = someNode.AncestorsAndSelf().Last();
XElement root2 = someNode.Document.Root;      // XDocument가 있어야만 동작
```

두 번째는 `XDocument`가 존재할 때만 쓸 수 있다. `XElement.Load`로 읽은 트리에는 `XDocument`가 없으므로 `Document`가 `null`이고, `root2` 줄은 `NullReferenceException`이 된다.

### 형제 노드 탐색

| 반환 타입 | 멤버 | 정의 위치 |
|---|---|---|
| `bool` | `IsBefore (XNode node)` | `XNode` |
| `bool` | `IsAfter (XNode node)` | `XNode` |
| `XNode` | `PreviousNode { get; }` | `XNode` |
| `XNode` | `NextNode { get; }` | `XNode` |
| `IEnumerable<XNode>` | `NodesBeforeSelf()` | `XNode` |
| `IEnumerable<XNode>` | `NodesAfterSelf()` | `XNode` |
| `IEnumerable<XElement>` | `ElementsBeforeSelf()` | `XNode` |
| `IEnumerable<XElement>` | `ElementsBeforeSelf (XName name)` | `XNode` |
| `IEnumerable<XElement>` | `ElementsAfterSelf()` | `XNode` |
| `IEnumerable<XElement>` | `ElementsAfterSelf (XName name)` | `XNode` |

`PreviousNode`와 `NextNode`(그리고 `FirstNode`/`LastNode`)로 연결 리스트를 다루는 느낌으로 노드를 순회할 수 있다. 이것은 우연이 아니다 — **내부적으로 노드는 연결 리스트에 저장된다.**

> **⚠️ `PreviousNode`는 성능이 나쁘다**
>
> `XNode`는 내부적으로 **단일 연결 리스트(singly linked list)** 를 쓴다. `NextNode`는 포인터 한 번이지만 `PreviousNode`는 부모의 첫 자식부터 다시 훑어야 한다 — 자식이 N개인 요소를 `PreviousNode`로 역순 순회하면 O(N²)이다. 역순으로 훑어야 한다면 `Nodes().Reverse()`를 쓰거나 `ElementsBeforeSelf()`를 한 번만 호출해 재사용하라.

`ElementsBeforeSelf()`/`ElementsAfterSelf()`가 반환하는 순서는 둘 다 **문서 순서**다. 즉 `ElementsBeforeSelf()`는 "자기 바로 앞"이 아니라 "첫 형제"부터 준다.

### 특성 탐색

| 반환 타입 | 멤버 | 정의 위치 |
|---|---|---|
| `bool` | `HasAttributes { get; }` | `XElement` |
| `XAttribute` | `Attribute (XName name)` | `XElement` |
| `XAttribute` | `FirstAttribute { get; }` | `XElement` |
| `XAttribute` | `LastAttribute { get; }` | `XElement` |
| `IEnumerable<XAttribute>` | `Attributes()` | `XElement` |
| `IEnumerable<XAttribute>` | `Attributes (XName name)` | `XElement` |

추가로 `XAttribute`는 `PreviousAttribute`와 `NextAttribute` 프로퍼티, 그리고 `Parent`를 정의한다.

이름을 받는 `Attributes` 메서드는 **원소가 0개 또는 1개인 시퀀스**를 반환한다. XML에서 한 요소가 같은 이름의 특성을 중복해 가질 수 없기 때문이다.

```csharp
var c = XElement.Parse ("<customer id='1' name='Mary' />");

Console.WriteLine (c.Attribute ("id").Value);        // 1
Console.WriteLine (c.Attribute ("bogus") == null);   // True
Console.WriteLine (c.Attributes ("bogus").Any());    // False — 빈 시퀀스

// Attributes()도 확장 메서드 형태가 있어 요소 시퀀스에 이어 붙는다.
IEnumerable<XAttribute> all = c.DescendantsAndSelf().Attributes();
```

> **📌 `InDocumentOrder()` — 순서를 정규화하는 확장 메서드**
>
> `System.Xml.Linq`의 `InDocumentOrder()`는 여러 쿼리를 합쳐서 만든 노드 시퀀스를 문서 순서대로 다시 정렬한다. `Concat`이나 `Union`으로 여러 갈래의 결과를 합친 뒤 출력 순서를 원본과 맞춰야 할 때 쓴다. 두 노드의 선후 관계만 알고 싶다면 같은 트리 안에서 `XNode.CompareDocumentOrder(a, b)` 정적 메서드가 더 싸다.

---

## 42.6 X-DOM 갱신 — 값, 자식 노드, 특성, 부모를 통한 갱신

X-DOM의 요소와 특성을 갱신하는 길은 넷이다. `SetValue`를 호출하거나 `Value`를 재할당하기, `SetElementValue`/`SetAttributeValue` 호출하기, `RemoveXXX` 호출하기, `AddXXX`/`ReplaceXXX`로 새 콘텐츠 지정하기. `XElement`의 `Name` 프로퍼티를 재할당하는 것도 가능하다.

### 단순 값 갱신

`SetValue` 메서드(`XElement`, `XAttribute` 양쪽에 있다)는 요소나 특성의 콘텐츠를 단순 값으로 교체한다. `Value` 프로퍼티를 설정하는 것도 같은 일을 하지만 **문자열 데이터만** 받는다. 둘 다 42.7절에서 자세히 다룬다.

`SetValue`(또는 `Value` 재할당)를 호출하면 **모든 자식 노드가 교체된다**는 부작용이 있다.

```csharp
XElement settings = new XElement ("settings",
  new XElement ("timeout", 30)
);
settings.SetValue ("blah");
Console.WriteLine (settings.ToString());     // <settings>blah</settings>
```

> **⚠️ `Value`를 설정하면 자식이 전부 날아간다**
>
> 이건 X-DOM에서 가장 파괴적인 한 줄이다. 자식 요소를 스무 개 가진 요소에 `e.Value = "x"`를 하면 스무 개가 전부 사라지고 텍스트 노드 하나만 남는다. 예외도 경고도 없다.
>
> ```csharp
> customer.Value = "Joe";                        // firstname, lastname 등이 모두 삭제됨
> customer.Element ("firstname").Value = "Joe";  // 의도한 것
> customer.SetElementValue ("firstname", "Joe"); // 또는 이것
> ```
>
> `(string) e`는 읽기만 하므로 안전하지만 `e.Value = ...`는 쓴다. **읽기와 쓰기의 위험도가 완전히 다른 프로퍼티**라는 점을 기억하라.

### 자식 노드와 특성 갱신

| 분류 | 멤버 | 대상 |
|---|---|---|
| 추가 | `Add (params object[] content)` | `XContainer` |
| 추가 | `AddFirst (params object[] content)` | `XContainer` |
| 제거 | `RemoveNodes()` | `XContainer` |
| 제거 | `RemoveAttributes()` | `XElement` |
| 제거 | `RemoveAll()` | `XElement` |
| 갱신 | `ReplaceNodes (params object[] content)` | `XContainer` |
| 갱신 | `ReplaceAttributes (params object[] content)` | `XElement` |
| 갱신 | `ReplaceAll (params object[] content)` | `XElement` |
| 갱신 | `SetElementValue (XName name, object value)` | `XElement` |
| 갱신 | `SetAttributeValue (XName name, object value)` | `XElement` |

이 중 실무에서 가장 편한 것은 마지막 둘, `SetElementValue`와 `SetAttributeValue`다. `XElement`나 `XAttribute`를 만들어 부모에 `Add`하는 과정의 지름길이며, 같은 이름의 기존 요소·특성이 있으면 교체한다. `settings.SetElementValue("timeout", 30)`은 자식을 추가하고, 이어서 `SetElementValue("timeout", 60)`을 부르면 그것을 갱신한다.

`Add`는 자식 노드를 뒤에 붙이고 `AddFirst`는 맨 앞에 삽입한다. `RemoveNodes`/`RemoveAttributes`는 모든 자식 노드 또는 모든 특성을 한 번에 지우며, `RemoveAll`은 둘 다 호출하는 것과 같다.

`ReplaceXXX` 메서드는 `Remove` 후 `Add`와 동등하다. 이들은 **입력의 스냅숏을 먼저 뜬다**. 그래서 `e.ReplaceNodes(e.Nodes())` 같은 코드도 기대대로 동작한다 — 자기 자신을 지우면서 동시에 읽는 상황이 생기지 않는다.

> **📌 `SetElementValue(name, null)`은 삭제다**
>
> `SetElementValue`와 `SetAttributeValue`에 값으로 `null`을 넘기면 해당 요소·특성을 **제거**한다. 값을 비우는 것이 아니라 통째로 없앤다. 조건부로 특성을 붙일 때 `if` 없이 쓸 수 있는 유용한 관용구다.
>
> ```csharp
> e.SetAttributeValue ("archived", true);    // 특성 추가/갱신
> e.SetAttributeValue ("archived", null);    // 특성 삭제
> e.SetAttributeValue ("archived", "");      // 삭제가 아니라 빈 문자열 값
> e.SetAttributeValue ("id", customer.ID);   // ID가 null이면 특성이 안 붙는다
> ```

> **⚠️ `new XAttribute(name, null)`은 예외를 던진다**
>
> `SetAttributeValue(name, null)`은 "삭제"라는 뜻이지만, `XAttribute` **생성자**에 `null` 값을 넘기는 것은 오류다(현재 구현은 `ArgumentNullException`). 함수형 구성에서 조건부 특성을 넣으려면 특성 객체 **자체**를 `null`로 만들어 규칙 1번에 맡겨라.
>
> ```csharp
> new XAttribute ("id", (string) null);                    // 예외
> new XElement ("customer",
>   id == null ? null : new XAttribute ("id", id));        // 안전
> ```
>
> 요소는 다르다. `new XElement("x", null)`은 예외 없이 빈 요소 `<x />`를 만든다 — 콘텐츠 규칙 1번이 `null`을 무시하기 때문이다. **요소와 특성의 `null` 취급이 다르다.**

### 부모를 통한 갱신

| 멤버 | 대상 |
|---|---|
| `AddBeforeSelf (params object[] content)` | `XNode` |
| `AddAfterSelf (params object[] content)` | `XNode` |
| `Remove()` | `XNode`, `XAttribute` |
| `ReplaceWith (params object[] content)` | `XNode` |

`AddBeforeSelf`, `AddAfterSelf`, `Remove`, `ReplaceWith`는 노드의 **자식**에 대해 동작하지 않는다. 그 노드 **자신이 속한 컬렉션**에 대해 동작한다. 따라서 노드에 부모 요소가 있어야 하고, 없으면 예외가 던져진다.

`AddBeforeSelf`와 `AddAfterSelf`는 임의 위치에 노드를 삽입할 때 유용하다. `Remove`는 현재 노드를 부모에서 제거하고, `ReplaceWith`는 같은 일을 한 다음 그 자리에 다른 콘텐츠를 삽입한다.

```csharp
XElement items = XElement.Parse ("<items><one/><three/></items>");
items.FirstNode.AddAfterSelf (new XElement ("two"));
// <items><one /><two /><three /></items>

items.FirstNode.ReplaceWith (new XComment ("One was here"));
// <items><!--One was here--><two /><three /></items>
```

노드가 내부적으로 연결 리스트에 저장되므로, 긴 요소 시퀀스의 임의 위치에 삽입하는 것이 효율적이다. 배열 기반 컬렉션이었다면 뒤쪽 원소를 전부 밀어야 했을 것이다.

> **⚠️ 부모 없는 노드에 `Remove`/`AddAfterSelf`를 부르면 예외다**
>
> ```csharp
> var orphan = new XElement ("x");
> orphan.Remove();          // 부모가 없다 → 예외 (현재 구현은 InvalidOperationException)
> ```
>
> `XElement.Load`로 읽은 루트 요소도 부모가 없다. 루트를 `ReplaceWith`로 바꾸려 하면 같은 문제에 걸린다. 루트를 통째로 교체해야 한다면 `XDocument`를 쓰고 `doc.Root.ReplaceWith(...)`를 하거나, 아예 새 트리를 만들어라.

### 노드 시퀀스 제거 — 그리고 열거 중 제거 문제

`System.Xml.Linq`의 확장 메서드 덕분에 **노드나 특성의 시퀀스**에도 `Remove`를 호출할 수 있다. 다음 X-DOM을 놓고 보자.

```csharp
XElement contacts = XElement.Parse (
  @"<contacts>
      <customer name='Mary'/>
      <customer name='Chris' archived='true'/>
      <supplier name='Susan'>
        <phone archived='true'>012345678<!--confidential--></phone>
      </supplier>
    </contacts>");
```

```csharp
// 모든 고객을 제거한다.
contacts.Elements ("customer").Remove();

// 보관 처리된(archived) 연락처를 전부 제거한다 — Chris가 사라진다.
// Elements()를 Descendants()로 바꾸면 DOM 전체의 보관 요소가 사라진다.
contacts.Elements()
        .Where (e => (bool?) e.Attribute ("archived") == true)
        .Remove();

// 트리 어디에든 "confidential" 주석을 가진 연락처를 전부 제거한다.
contacts.Elements().Where (e => e.DescendantNodes()
                                 .OfType<XComment>()
                                 .Any (c => c.Value == "confidential")
                         ).Remove();

// 대조 — 트리의 모든 주석 노드만 벗겨 낸다.
contacts.DescendantNodes().OfType<XComment>().Remove();
```

이 확장 메서드가 안전한 이유가 중요하다. **`Remove` 메서드는 내부적으로 일치하는 요소를 전부 임시 리스트에 먼저 읽어 들인 다음, 그 임시 리스트를 열거하며 삭제를 수행한다.** 삭제와 쿼리를 동시에 해서 생길 수 있는 오류를 막기 위해서다.

> **⚠️ 열거하면서 `Remove()`하지 마라 — 반드시 `.ToList()` 후 제거**
>
> 시퀀스에 대한 확장 메서드 `Remove()`는 내부 버퍼링 덕분에 안전하지만, **직접 `foreach`를 돌면서 개별 노드의 `Remove()`를 부르는 것은 안전하지 않다.**
>
> ```csharp
> // 위험: 열거 중 트리를 변경한다
> foreach (XElement e in root.Elements())
>     if (ShouldDelete (e))
>         e.Remove();
> ```
>
> `Elements()`는 지연 실행되는 이터레이터이고, 내부적으로 노드의 연결 리스트를 따라간다. 노드를 제거하면 그 노드의 `Parent`가 `null`이 되어 이터레이터의 계속 조건이 깨지므로, 순회가 **조용히 중단된다**. 예외가 나면 차라리 낫지만, 이 버그는 대개 **아무 오류 없이 앞쪽 일부만 지워진 결과**로 나타난다.
>
> 안전한 형태는 둘이다.
>
> ```csharp
> // 1) 스냅숏을 먼저 뜬다
> foreach (XElement e in root.Elements().ToList())
>     if (ShouldDelete (e))
>         e.Remove();
>
> // 2) 시퀀스 확장 메서드에 맡긴다 (내부적으로 1번과 같은 일을 한다)
> root.Elements().Where (ShouldDelete).Remove();
> ```
>
> 같은 원칙이 트리를 **추가**하면서 열거할 때도 적용된다. 열거 중 구조를 바꿀 계획이라면 `.ToList()`가 기본 반사 신경이어야 한다. 컬렉션 일반의 "열거 중 변경" 문제는 24장에서 다뤘다.

### 변경 알림 — `Changed`와 `Changing` 이벤트

`XObject`는 `Changing`과 `Changed` 이벤트를 정의한다. 어떤 노드에 핸들러를 달면 **그 서브트리 안의 모든 변경**이 그 노드까지 버블링되어 올라온다. `XObjectChangeEventArgs.ObjectChange`는 `XObjectChange` 열거형이며 값은 `Add`, `Remove`, `Name`, `Value` 넷이다.

```csharp
XElement root = XElement.Parse ("<root><a>1</a></root>");
root.Changed += (sender, e) => Console.WriteLine (e.ObjectChange);

root.Element ("a").Value = "2";       // 값 변경이 보고된다
root.Add (new XElement ("b"));        // ObjectChange.Add
root.Element ("a").Remove();          // ObjectChange.Remove
```

> **⚠️ `Changed` 핸들러는 강한 참조를 만든다**
>
> X-DOM 트리에 이벤트 핸들러를 달아 놓고 트리 참조를 놓아 버려도, 핸들러가 참조하는 객체가 살아 있으면 트리가 수거되지 않는다. 반대 방향도 마찬가지다(27장, 34장). 그리고 이벤트 발생 비용이 공짜가 아니다 — 요소를 수만 개 만드는 반복문 안에서 핸들러가 걸린 트리를 갱신하면 핸들러 호출이 그만큼 일어난다. 대량 구성은 핸들러를 붙이기 **전에** 끝내라.

---

## 42.7 값 다루기 — 설정·조회, 혼합 콘텐츠, 자동 `XText` 연결

`XElement`와 `XAttribute`는 둘 다 `string` 타입의 `Value` 프로퍼티를 가진다. 요소가 단일 `XText` 자식 노드를 가지면 `XElement`의 `Value`는 그 노드 콘텐츠로 가는 지름길로 동작하고, `XAttribute`의 `Value`는 그냥 특성의 값이다. 저장 방식은 다르지만 X-DOM은 양쪽에 **일관된 연산 집합**을 제공한다.

### 값 설정하기

값을 할당하는 방법은 둘이다 — `SetValue`를 호출하거나 `Value` 프로퍼티에 대입하는 것. `SetValue`가 더 유연하다. 문자열뿐 아니라 다른 단순 데이터 타입도 받기 때문이다.

```csharp
var e = new XElement ("date", DateTime.Now);
e.SetValue (DateTime.Now.AddDays (1));
Console.Write (e.Value);        // 2019-10-02T16:39:10.734375+09:00
```

`Value`에 그냥 대입할 수도 있었지만, 그러면 `DateTime`을 손으로 문자열로 바꿔야 한다 — XML 규격에 맞는 결과를 얻으려면 `XmlConvert`를 써야 하므로 `ToString`보다 복잡하다. 생성자에 값을 넘길 때도 같은 자동 변환이 일어난다(42.4절의 콘텐츠 규칙 6번).

| 방법 | 받는 타입 | `XmlConvert` 경유 | 자식 노드 |
|---|---|---|---|
| `Value = "..."` | `string`만 | 아니오 (이미 문자열) | 전부 교체 |
| `SetValue(obj)` | 임의 객체 | 예 | 전부 교체 |
| `new XElement(name, obj)` | 임의 객체 | 예 | (새로 만드는 것) |
| `SetElementValue(name, obj)` | 임의 객체 | 예 | 해당 자식만 교체 |
| `SetAttributeValue(name, obj)` | 임의 객체 | 예 | 해당 특성만 교체 |

> **⚠️ `Value`에 `null`을 대입하면 예외다**
>
> ```csharp
> e.Value = null;             // 예외 (현재 구현은 ArgumentNullException)
> e.Value = "";               // 이건 정상 — 빈 요소가 된다
> e.SetValue (null);          // 이것도 예외
> ```
>
> 요소를 "값 없음" 상태로 만들고 싶다면 `RemoveNodes()`를 쓰거나, 아예 요소를 제거하라(`e.Remove()`). XML에는 `null`이라는 개념이 없다 — 관례적으로 `xsi:nil="true"` 특성으로 표현하며, 이 관용구는 42.9절에서 다룬다.

### 값 조회하기 — 명시적 변환 연산자

반대 방향으로, `Value`를 기본 타입으로 파싱하려면 `XElement`나 `XAttribute`를 원하는 타입으로 **캐스트**하기만 하면 된다. 동작할 것 같지 않은데 동작한다.

```csharp
XElement e = new XElement ("now", DateTime.Now);
DateTime dt = (DateTime) e;

XAttribute a = new XAttribute ("resolution", 1.234);
double res = (double) a;
```

요소나 특성은 `DateTime`이나 숫자를 네이티브로 저장하지 않는다 — 언제나 텍스트로 저장하고 필요할 때 파싱한다. 원래 타입을 "기억"하지도 않으므로 **올바른 타입으로 캐스트해야** 한다. 견고하게 만들려면 캐스트를 `try`/`catch`에 넣고 `FormatException`을 잡는다.

명시적 캐스트가 파싱할 수 있는 타입은 다음과 같다.

| 분류 | 타입 |
|---|---|
| 문자열 | `string` |
| 정수 | `int`, `uint`, `long`, `ulong` |
| 부동소수·십진 | `float`, `double`, `decimal` |
| 논리 | `bool` |
| 시간 | `DateTime`, `DateTimeOffset`, `TimeSpan` |
| 식별자 | `Guid` |
| 위 값 타입의 `Nullable<>` 버전 | `int?`, `bool?`, `DateTime?`, … |

### `null` 처리 — 널 가능 타입으로 캐스트하기

널 가능 타입으로의 캐스트는 `Element`·`Attribute` 메서드와 조합할 때 유용하다. 요청한 이름이 존재하지 않아도 캐스트가 성립하기 때문이다. `x`에 `timeout` 요소가 없다면 첫 줄은 런타임 오류를 내고 둘째 줄은 그렇지 않다.

```csharp
int timeout = (int) x.Element ("timeout");      // 오류
int? timeout = (int?) x.Element ("timeout");    // OK — timeout은 null
```

`??` 연산자로 최종 결과에서 널 가능성을 걷어 낼 수 있다. 다음은 `resolution` 특성이 없으면 `1.0`으로 평가된다.

```csharp
double resolution = (double?) x.Attribute ("resolution") ?? 1.0;
```

| 캐스트 대상 | 원본이 `null`일 때 | 값이 잘못된 형식일 때 |
|---|---|---|
| `string` | `null` 반환 | (파싱 없음) |
| `int`, `bool`, `DateTime` 등 | **예외** (현재 구현은 `ArgumentNullException`) | `FormatException` 계열 |
| `int?`, `bool?`, `DateTime?` 등 | `null` 반환 | `FormatException` 계열 |

> **⚠️ 널 가능 캐스트가 만능은 아니다**
>
> 널 가능 타입으로 캐스트해도, **요소·특성이 존재하는데 값이 비어 있거나 형식이 잘못된** 경우는 구제해 주지 못한다. 그때는 `FormatException`을 잡아야 한다.
>
> ```csharp
> var x = XElement.Parse ("<x><timeout></timeout></x>");
> int? t = (int?) x.Element ("timeout");     // 요소는 있다. 값이 "" → FormatException
> ```
>
> "없어도 되고, 있으면 반드시 숫자여야 한다"는 계약과 "없어도 되고, 이상해도 기본값을 쓴다"는 계약은 다르다. 후자를 원한다면 직접 파싱해야 한다.
>
> ```csharp
> int timeout = int.TryParse ((string) x.Element ("timeout"), out int v) ? v : 30;
> ```

캐스트는 LINQ 쿼리 안에서도 쓸 수 있다. 다음은 `"John"`을 반환한다.

```csharp
var data = XElement.Parse (
  @"<data><customer id='1' name='Mary' credit='100' />
          <customer id='2' name='John' credit='150' />
          <customer id='3' name='Anne' /></data>");

IEnumerable<string> query = from cust in data.Elements()
                           where (int?) cust.Attribute ("credit") > 100
                           select cust.Attribute ("name").Value;
```

널 가능 `int`로 캐스트한 덕분에 `credit` 특성이 없는 Anne에서 `NullReferenceException`이 나지 않는다. 다른 해법은 `where` 절에 `cust.Attributes("credit").Any() &&`를 덧붙이는 것이다. 요소 값을 쿼리할 때도 같은 원칙이 적용된다.

> **📌 `null > 100`은 `false`다 — 예외가 아니다**
>
> `(int?)null > 100`이 조용히 `false`가 되는 것은 널 가능 값 타입의 리프팅된 비교 연산자 규칙이다. 널 가능 피연산자가 하나라도 `null`이면 `<`, `>`, `<=`, `>=`는 전부 `false`다. `!(a > b)`가 `a <= b`와 동치가 아니게 되는 지점이기도 하다. 자세한 규칙은 21.4절에 있다.
>
> 이 성질이 XML 쿼리에서는 대체로 편리하게 작동한다 — "값이 없으면 조건에 안 맞는다"가 보통 원하는 의미이기 때문이다. 하지만 `where (int?) a.Attribute("x") != 100` 같은 부정 조건에서는 `null`이 조건을 **통과**한다는 점을 알고 써야 한다.

### 값과 혼합 콘텐츠 노드

`Value`가 이렇게 편한데 `XText` 노드를 직접 다룰 일이 언제 있느냐고 물을 수 있다. 답은 **혼합 콘텐츠(mixed content)** 를 다룰 때다.

```xml
<summary>An XAttribute is <bold>not</bold> an XNode</summary>
```

단순한 `Value`로는 `summary`의 콘텐츠를 담아낼 수 없다. `summary`는 자식을 셋 가진다 — `XText`, `XElement`, 또 다른 `XText`.

```csharp
XElement summary = new XElement ("summary",
  new XText ("An XAttribute is "),
  new XElement ("bold", "not"),
  new XText (" an XNode")
);
```

흥미롭게도 `summary.Value`를 조회해도 예외가 나지 않는다. 대신 각 자식 값의 **연결**인 `"An XAttribute is not an XNode"`가 나온다. `Value`를 재할당하는 것도 합법이다 — 대신 이전의 모든 자식이 새로운 `XText` 노드 하나로 교체되는 대가를 치른다.

> **⚠️ 혼합 콘텐츠에서 `Value`는 손실 변환이다**
>
> ```csharp
> string v = summary.Value;      // "An XAttribute is not an XNode"
> summary.Value = v;             // <bold> 요소가 사라진다
> ```
>
> 읽고 그대로 쓰는 것처럼 보이지만 마크업이 전부 날아간다. HTML 조각이나 문서형 XML(DocBook, DITA, OOXML 등)을 다룰 때 이 실수는 데이터 손실로 직결된다. 혼합 콘텐츠를 다룬다면 `Value` 대신 `Nodes()`로 순회하라.
>
> ```csharp
> foreach (XNode n in summary.Nodes())
>     switch (n)
>     {
>         case XText t:    Console.Write (t.Value);        break;
>         case XElement e: Console.Write ($"[{e.Name}]");  break;
>     }
> ```

`Value`가 무엇을 포함하고 무엇을 빼는지는 다음과 같다.

| 자식 노드 타입 | `Value`에 포함되는가 |
|---|---|
| `XText` | 예 |
| `XCData` | 예 (`XCData`는 `XText`의 파생) |
| 자손 `XElement`의 텍스트 | 예 (재귀적으로 연결) |
| `XComment` | **아니오** |
| `XProcessingInstruction` | **아니오** |
| 특성 값 | **아니오** |

### 자동 `XText` 연결

단순 콘텐츠를 `XElement`에 추가하면, X-DOM은 새 `XText`를 만드는 대신 **기존 `XText` 자식에 이어 붙인다**. 그런데 `XText` 노드를 **명시적으로** 만들면 연결되지 않고 자식이 여러 개가 된다 — 노드의 객체 아이덴티티를 보존하기 위해서다.

```csharp
var e1 = new XElement ("test", "Hello"); e1.Add ("World");
var e2 = new XElement ("test", "Hello", "World");
Console.WriteLine (e1.Nodes().Count());     // 1
Console.WriteLine (e2.Nodes().Count());     // 1

var e3 = new XElement ("test", new XText ("Hello"), new XText ("World"));
Console.WriteLine (e3.Value);               // HelloWorld
Console.WriteLine (e3.Nodes().Count());     // 2
```

> **⚠️ `Nodes().Count()`로 콘텐츠를 판단하지 마라**
>
> 같은 XML을 만들어도 노드 개수가 다를 수 있다는 것이 위 예의 요지다. 문자열을 여러 번 `Add`했는지, `XText`를 손으로 만들었는지, `PreserveWhitespace`로 로드했는지에 따라 개수가 달라진다. 그런데 `ToString()` 결과는 세 경우 모두 같다.
>
> 콘텐츠 유무를 판단할 때는 개수 대신 의미 있는 프로퍼티를 써라.
>
> | 판단하고 싶은 것 | 쓸 것 |
> |---|---|
> | 자식 요소가 있는가 | `e.HasElements` |
> | 특성이 있는가 | `e.HasAttributes` |
> | 콘텐츠가 아예 없는가 (`<x />`) | `e.IsEmpty` |
> | 텍스트가 비었는가 | `e.Value.Length == 0` |

> **💡 `IsEmpty`는 "값이 비었다"가 아니라 "`<x />` 형태다"라는 뜻이다**
>
> ```csharp
> XElement.Parse ("<x />").IsEmpty;        // True
> XElement.Parse ("<x></x>").IsEmpty;      // False — 콘텐츠는 없지만 닫는 태그가 있다
> ```
>
> 두 XML은 의미가 같지만 `IsEmpty`는 구분한다. 그리고 `IsEmpty`는 **설정 가능**하다 — `e.IsEmpty = true`로 만들면 출력이 `<x />`가 된다. 이 구분이 문제가 되는 대표적인 곳이 `XmlReader`의 빈 요소 처리다(42.11절).

---

## 42.8 `XDocument`와 XML 선언

### `XDocument`가 담을 수 있는 것

`XDocument`는 루트 `XElement`를 감싸고 거기에 `XDeclaration`, 처리 명령, 문서 타입, 루트 수준 주석을 붙일 수 있게 한다. **선택 사항**이며 무시하거나 생략해도 된다 — W3C DOM과 달리 모든 것을 붙들어 매는 접착제 역할을 하지 않는다.

`XDocument`는 `XElement`와 같은 함수형 생성자를 제공하고, `XContainer` 기반이므로 `AddXXX`/`RemoveXXX`/`ReplaceXXX`도 지원한다. 다만 **제한된 콘텐츠만** 받는다.

| 콘텐츠 | 개수 제한 |
|---|---|
| `XElement` (루트) | **정확히 하나** — 유효한 문서의 필수 조건 |
| `XDeclaration` | 최대 하나 |
| `XDocumentType` (DTD 참조) | 최대 하나 |
| `XProcessingInstruction` | 몇 개든 |
| `XComment` | 몇 개든 |

이 중 유효한 `XDocument`가 되기 위해 **필수인 것은 루트 `XElement`뿐**이다. `XDeclaration`은 선택 사항이며, 생략하면 직렬화 시 기본 설정이 적용된다.

가장 단순한 유효 `XDocument`는 `new XDocument(new XElement("test", "data"))`처럼 루트 요소 하나만 가진다. `XDeclaration`을 넣지 않았어도 `doc.Save`가 만든 파일에는 XML 선언이 들어간다 — 기본적으로 하나가 생성되기 때문이다.

> **⚠️ 루트 요소는 하나뿐 — 두 번째를 추가하면 예외다**
>
> ```csharp
> var doc = new XDocument (new XElement ("a"), new XElement ("b"));   // 예외
> ```
>
> XML 명세상 문서는 루트 요소를 정확히 하나만 가진다. 여러 조각을 하나로 묶어야 한다면 감싸는 요소를 하나 만들거나, `XDocument`를 쓰지 말고 `XmlWriterSettings.ConformanceLevel = ConformanceLevel.Fragment`로 조각을 쓰는 방식을 택하라(42.12절).
>
> 텍스트 콘텐츠도 루트 밖에는 못 온다. `new XDocument("hello")`는 예외다.

### 모든 구성물을 쓴 예

다음 예는 `XDocument`가 받을 수 있는 모든 구성물을 보여 준다.

```csharp
var styleInstruction = new XProcessingInstruction (
  "xml-stylesheet", "href='styles.css' type='text/css'");

var docType = new XDocumentType ("html",
  "-//W3C//DTD XHTML 1.0 Strict//EN",
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd", null);

XNamespace ns = "http://www.w3.org/1999/xhtml";

var root =
  new XElement (ns + "html",
    new XElement (ns + "head",
      new XElement (ns + "title", "An XHTML page")),
    new XElement (ns + "body",
      new XElement (ns + "p", "This is the content"))
  );

var doc =
  new XDocument (
    new XDeclaration ("1.0", "utf-8", "no"),
    new XComment ("Reference a stylesheet"),
    styleInstruction,
    docType,
    root);

doc.Save ("test.html");
```

결과 `test.html`은 이렇다.

```xml
<?xml version="1.0" encoding="utf-8" standalone="no"?>
<!--Reference a stylesheet-->
<?xml-stylesheet href='styles.css' type='text/css'?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>An XHTML page</title></head>
  <body><p>This is the content</p></body>
</html>
```

`XDocumentType`의 생성자 인자는 순서대로 이름, public ID, system ID, 내부 서브셋(internal subset)이다.

### `Root`, `Document`, 그리고 부모가 없는 자식들

`XDocument`는 단일 `XElement`에 접근하는 지름길로 `Root` 프로퍼티를 가진다. 역방향 링크는 `XObject.Document`가 제공하며 트리의 모든 객체에서 동작한다.

```csharp
Console.WriteLine (doc.Root.Name.LocalName);              // html
XElement bodyNode = doc.Root.Element (ns + "body");
Console.WriteLine (bodyNode.Document == doc);             // True

// 문서의 자식들은 Parent를 갖지 않는다.
Console.WriteLine (doc.Root.Parent == null);              // True
foreach (XNode node in doc.Nodes())
    Console.Write (node.Parent == null);                  // TrueTrueTrueTrue
```

> **📌 `XDeclaration`은 `XNode`가 아니다**
>
> `XDeclaration`은 `XNode`가 아니며 문서의 `Nodes` 컬렉션에 나타나지 않는다 — 주석, 처리 명령, 루트 요소와 다르다. 대신 `Declaration`이라는 전용 프로퍼티에 할당된다. 위 예에서 "True"가 다섯 번이 아니라 **네 번** 반복된 이유가 이것이다(주석 + 처리 명령 + DOCTYPE + 루트 = 4).

### XML 선언

표준 XML 파일은 이런 선언으로 시작한다.

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
```

`XElement`와 `XDocument`가 선언을 뱉는 규칙은 다음과 같다.

| 상황 | XML 선언 |
|---|---|
| 파일 이름으로 `Save` 호출 | **항상** 쓴다 |
| `XmlWriter`로 `Save` 호출 | `XmlWriter`가 반대로 지시하지 않는 한 쓴다 |
| `ToString` 메서드 | **절대** 안 쓴다 |

`XmlWriter`가 선언을 만들지 않게 하려면 `XmlWriterSettings`의 `OmitXmlDeclaration`과 `ConformanceLevel`을 설정한다(42.12절).

**`XDeclaration` 객체의 존재 여부는 XML 선언이 쓰이느냐에 아무 영향이 없다.** `XDeclaration`의 목적은 대신 두 가지 방식으로 XML 직렬화에 힌트를 주는 것이다.

- 어떤 텍스트 인코딩을 쓸 것인가
- (선언이 쓰인다면) XML 선언의 `encoding`과 `standalone` 특성에 무엇을 넣을 것인가

`XDeclaration`의 생성자는 인자 셋을 받으며 각각 `version`, `encoding`, `standalone` 특성에 대응한다. `new XDeclaration("1.0", "utf-16", "yes")`를 넣고 `doc.Save("test.xml")`을 부르면 파일이 UTF-16으로 인코딩된다.

> **📌 버전 문자열은 무시된다**
>
> XML 버전으로 무엇을 지정하든 XML 라이터는 무시한다 — 언제나 `"1.0"`을 쓴다. XML 1.1은 사실상 쓰이지 않기 때문이다.
>
> 인코딩은 IETF 코드를 써야 한다 — XML 선언에 나타나는 그대로, 예컨대 `"utf-16"`.

### 문자열에 선언 쓰기 — 그리고 `ToString`이 선언을 안 쓰는 이유

XML 선언을 포함해서 `XDocument`를 문자열로 직렬화하고 싶다고 하자. `ToString`은 선언을 쓰지 않으므로 `XmlWriter`를 써야 한다.

```csharp
var doc = new XDocument (new XDeclaration ("1.0", "utf-8", "yes"),
                         new XElement ("test", "data"));
var output = new StringBuilder();
using (XmlWriter xw = XmlWriter.Create (output, new XmlWriterSettings { Indent = true }))
    doc.Save (xw);

Console.WriteLine (output.ToString());
// <?xml version="1.0" encoding="utf-16" standalone="yes"?>
// <test>data</test>
```

`XDeclaration`에서 명시적으로 UTF-8을 요청했는데 출력에는 UTF-16이 나왔다. 버그처럼 보이지만 사실 `XmlWriter`는 대단히 영리하게 굴고 있다. **문자열에 쓰고 있고 파일이나 스트림에 쓰고 있지 않으므로**, UTF-16 외의 인코딩을 적용하는 것이 불가능하다 — 문자열이 내부적으로 저장되는 형식이 UTF-16이기 때문이다. 그래서 `XmlWriter`는 거짓말을 하지 않기 위해 `"utf-16"`을 쓴다.

이것이 `ToString` 메서드가 XML 선언을 뱉지 않는 이유이기도 하다. `Save`를 부르는 대신 다음과 같이 `XDocument`를 파일에 썼다고 상상해 보라.

```csharp
File.WriteAllText ("data.xml", doc.ToString());
```

현재 동작대로라면 data.xml에는 XML 선언이 없어서 불완전하지만 여전히 파싱 가능하다. 그런데 `ToString()`이 XML 선언을 뱉었다면 data.xml은 **틀린 선언**(`encoding="utf-16"`)을 담게 된다 — `WriteAllText`는 UTF-8로 인코딩하기 때문이다. 그 파일은 아예 읽히지 않을 수도 있다.

> **⚠️ 인코딩 선언과 실제 바이트가 어긋나는 것이 XML 최악의 버그다**
>
> XML 파서는 선언의 `encoding` 값을 믿는다. 파일 바이트는 UTF-8인데 선언이 `utf-16`이라고 주장하면 파서는 쓰레기를 읽거나 예외를 던진다. 반대 경우도 마찬가지다.
>
> 그래서 규칙은 단순하다. **인코딩은 직접 쓰지 말고 `Save`에 맡겨라.** 인코딩을 명시적으로 제어해야 한다면 `StreamWriter`(40.5절)나 `XmlWriterSettings.Encoding`을 통해 실제 바이트 인코딩을 정하고, `XDeclaration`은 그것과 일치시켜라. 두 곳에서 따로 정하면 언젠가 어긋난다.
>
> 그리고 `XmlWriterSettings.Encoding`은 문자열/`TextWriter` 출력에는 적용되지 않는다. 위에서 본 대로 그때는 언제나 UTF-16이다.

### `XDocument`를 꼭 써야 하는가

대부분의 경우 답은 "아니오"다.

| 상황 | `XDocument` 필요? |
|---|---|
| 설정 파일을 읽고 값만 꺼낸다 | 아니오 — `XElement.Load`가 짧다 |
| XML을 만들어 파일로 저장한다 | 아니오 — `XElement.Save`도 선언을 쓴다 |
| 루트 밖의 주석·처리 명령을 보존해야 한다 | **예** |
| DOCTYPE을 읽거나 써야 한다 | **예** |
| `standalone` 특성을 제어해야 한다 | **예** |
| 어떤 노드에서든 `Document.Root`로 루트에 가고 싶다 | **예** (편의) |
| 서브트리를 다른 트리로 옮긴다 | 아니오 — 오히려 방해가 안 된다 |

> **💡 라이브러리 API의 매개변수 타입으로는 `XElement`를 택하라**
>
> 메서드가 XML을 받는다면 `XDocument`가 아니라 `XElement`를 받아라. 호출자가 `XDocument`를 갖고 있으면 `doc.Root`를 넘기면 되지만, `XElement`밖에 없는 호출자가 `XDocument`를 요구받으면 억지로 감싸야 한다. `XElement`가 더 일반적인 통화(currency)다. 반환 타입도 마찬가지다.

---

## 42.9 이름과 네임스페이스, 기본 네임스페이스, 접두사

.NET 타입에 네임스페이스가 있듯 XML 요소와 특성에도 네임스페이스가 있다.

XML 네임스페이스는 두 가지를 해낸다. 첫째, C#의 네임스페이스처럼 **이름 충돌을 막는다**. 둘째, 이름에 **절대적 의미를 부여한다** — "nil"이라는 이름은 아무 의미나 가질 수 있지만 `http://www.w3.org/2001/xmlschema-instance` 네임스페이스 안에서는 C#의 `null`에 해당하는 무언가를 뜻하고 적용 규칙까지 따라온다.

XML 네임스페이스는 혼란의 주요 원천이므로, 먼저 XML 일반에서의 네임스페이스를 다루고 그다음 LINQ to XML로 넘어간다.

### XML의 네임스페이스

`OReilly.Nutshell.CSharp` 네임스페이스에 `customer` 요소를 정의하고 싶다고 하자. 첫째 방법은 `xmlns` 특성이다.

```xml
<customer xmlns="OReilly.Nutshell.CSharp"/>
```

`xmlns`는 특별한 예약 특성이다. 이렇게 쓰면 두 가지 일을 한다.

- 해당 요소의 네임스페이스를 지정한다.
- **모든 자손 요소의 기본 네임스페이스를 지정한다.**

즉 아래 예에서 `address`와 `postcode`는 암묵적으로 `OReilly.Nutshell.CSharp` 네임스페이스에 속한다. 이들이 네임스페이스를 갖지 않게 하려면 `<address xmlns="">`처럼 빈 네임스페이스를 명시적으로 다시 선언해야 한다.

```xml
<customer xmlns="OReilly.Nutshell.CSharp">
  <address>
    <postcode>02138</postcode>
  </address>
</customer>
```

### 접두사

네임스페이스를 지정하는 다른 방법은 **접두사(prefix)** 다. 접두사는 타이핑을 줄이려고 네임스페이스에 붙이는 별칭이다. 접두사를 쓰는 데는 두 단계가 있다 — 접두사를 정의하는 것과 사용하는 것. 둘을 한 번에 할 수 있다.

```xml
<nut:customer xmlns:nut="OReilly.Nutshell.CSharp"/>
```

오른쪽의 `xmlns:nut="..."`는 `nut`이라는 접두사를 정의하고 이 요소와 모든 자손이 쓸 수 있게 한다. 왼쪽의 `nut:customer`는 그 접두사를 `customer` 요소에 부여한다.

**접두사가 붙은 요소는 자손의 기본 네임스페이스를 정의하지 않는다.** 아래 XML에서 접두사 없는 `firstname`은 빈 네임스페이스를 가진다 — 같은 네임스페이스에 넣으려면 `<nut:firstname>`이라고 써야 한다.

```xml
<nut:customer xmlns:nut="OReilly.Nutshell.CSharp">
  <firstname>Joe</firstname>
</nut:customer>
```

자손의 편의를 위해 접두사를 정의만 하고 부모 요소 자신에게는 할당하지 않을 수도 있다. 아래는 접두사 `i`와 `z`를 정의하면서 `customer` 요소 자신은 빈 네임스페이스로 남긴다. 이것이 루트 노드였다면 문서 전체가 `i`와 `z`를 손끝에 두게 된다.

```xml
<customer xmlns:i="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/">
</customer>
```

두 네임스페이스 모두 URI라는 점에 주목하라. (자기가 소유한) URI를 쓰는 것이 표준 관행이다 — 네임스페이스 유일성을 보장한다. 그래서 실제 `customer` 요소는 `<customer xmlns="http://oreilly.com/schemas/nutshell/csharp"/>` 같은 모양이 될 가능성이 높다.

> **📌 네임스페이스 URI는 다운로드되지 않는다**
>
> 네임스페이스가 URL처럼 생겼다고 해서 파서가 그 주소에 접속하지 않는다. URI는 단지 **전역적으로 유일한 문자열**로서만 쓰인다. `http://oreilly.com/schemas/...`가 404를 반환해도 아무 문제 없다.
>
> 반대로 말하면 네임스페이스 비교는 **문자열 완전 일치**다. 뒤에 슬래시가 하나 더 붙었거나 대소문자가 다르면 다른 네임스페이스다. 스키마 문서의 `targetNamespace`와 인스턴스 문서의 `xmlns`가 한 글자라도 다르면 검증이 실패한다.

### 특성의 네임스페이스

특성에도 네임스페이스를 부여할 수 있다. 주된 차이는 **특성은 언제나 접두사를 요구한다**는 점이다(`<customer xmlns:nut="..." nut:id="123" />`). 다른 차이는 **한정되지 않은 특성은 언제나 빈 네임스페이스를 가진다**는 것이다 — 부모로부터 기본 네임스페이스를 절대 상속하지 않는다.

특성은 의미가 대개 요소에 국지적이므로 네임스페이스가 필요하지 않은 편이다. 예외는 W3C가 정의한 `nil` 특성 같은 범용·메타데이터 특성이다. `<lastname xsi:nil="true"/>`는 `lastname`이 빈 문자열이 아니라 nil(C#의 `null`)임을 명확히 나타낸다. 표준 네임스페이스를 썼기 때문에 범용 파싱 유틸리티가 그 의도를 확실히 알 수 있다.

> **⚠️ 특성은 기본 네임스페이스를 상속하지 않는다 — 요소는 상속한다**
>
> ```xml
> <customer xmlns="http://example.com/ns" id="123">
> ```
>
> 여기서 `customer` 요소는 `http://example.com/ns`에 있지만 `id` 특성은 **빈 네임스페이스**에 있다. 그래서 X-DOM 코드도 이렇게 갈린다.
>
> ```csharp
> XNamespace ns = "http://example.com/ns";
> var e = doc.Element (ns + "customer");     // 네임스페이스 필요
> var a = e.Attribute ("id");                // 네임스페이스 붙이면 안 된다!
> var wrong = e.Attribute (ns + "id");       // null
> ```
>
> 요소에는 `ns +`를 붙이고 특성에는 안 붙이는 이 비대칭이 네임스페이스 있는 문서를 다룰 때 가장 자주 나오는 버그다.

### X-DOM에서 네임스페이스 지정하기

지금까지 이 장에서는 `XElement`와 `XAttribute` 이름에 단순 문자열만 썼다. 단순 문자열은 **빈 네임스페이스를 가진 XML 이름**에 대응한다.

XML 네임스페이스를 지정하는 첫째 방법은 지역 이름 앞에 중괄호로 감싸 넣는 것이다. `new XElement("{http://domain.com/xmlspace}customer", "Bloggs")`는 `<customer xmlns="http://domain.com/xmlspace">Bloggs</customer>`를 만든다.

둘째(그리고 더 성능이 좋은) 방법은 `XNamespace`와 `XName` 타입을 쓰는 것이다. 두 타입 모두 `string`으로부터의 암시적 캐스트를 정의하고, `XNamespace`는 `+` 연산자를 오버로드해 중괄호 없이 `XName`을 만들게 해 준다.

```csharp
XNamespace ns   = "http://domain.com/xmlspace";
XName localName = "customer";
XName fullName  = "{http://domain.com/xmlspace}customer";
XName same      = ns + "customer";     // {http://domain.com/xmlspace}customer
```

네임스페이스를 지정하는 방법은 요소든 특성이든 같다.

```csharp
XNamespace ns = "http://domain.com/xmlspace";
var data = new XElement (ns + "data",
  new XAttribute (ns + "id", 123)
);
```

> **💡 `XNamespace`는 필드나 상수로 한 번만 만들어라**
>
> `ns + "customer"` 관용구는 매번 `XName` 조회를 일으키지만, 문자열 리터럴에서 매번 `XNamespace`를 만드는 것보다는 훨씬 낫다. 네임스페이스를 쓰는 클래스라면 `static readonly XNamespace Xsi = "http://www.w3.org/2001/XMLSchema-instance";`처럼 필드로 두는 것이 관례다. `XNamespace.Get(string)`을 명시적으로 부를 수도 있는데, 암시적 캐스트가 내부적으로 부르는 것과 같다.

### X-DOM과 기본 네임스페이스 — 가장 큰 함정

**X-DOM은 실제로 XML을 출력할 때까지 기본 네임스페이스라는 개념을 무시한다.** 이 말은 자식 `XElement`를 만들 때 필요하다면 네임스페이스를 **명시적으로 줘야** 한다는 뜻이다. 부모에서 상속하지 않는다.

```csharp
XNamespace ns = "http://domain.com/xmlspace";
var data = new XElement (ns + "data",
  new XElement (ns + "customer", "Bloggs"),
  new XElement (ns + "purchase", "Bicycle")
);
```

그러나 X-DOM은 XML을 **읽고 출력할 때는** 기본 네임스페이스를 적용한다. 위 `data`를 `ToString()`하면 자식에는 `xmlns`가 반복되지 않는다.

```xml
<data xmlns="http://domain.com/xmlspace">
  <customer>Bloggs</customer>
  <purchase>Bicycle</purchase>
</data>
```

반면 자식을 `new XElement("customer", ...)`처럼 네임스페이스 없이 만들면 이런 결과가 나온다 — 자식마다 `xmlns=""`가 붙는다. 의도한 XML이 아니다.

```xml
<data xmlns="http://domain.com/xmlspace">
  <customer xmlns="">Bloggs</customer>
  <purchase xmlns="">Bicycle</purchase>
</data>
```

### 조용히 실패하는 쿼리

또 다른 함정은 X-DOM을 **탐색할 때** 네임스페이스를 빼먹는 것이다.

```csharp
XElement x = data.Element (ns + "customer");     // OK
XElement y = data.Element ("customer");          // null
```

> **⚠️ 이것이 X-DOM에서 가장 자주, 가장 조용히 나는 버그다**
>
> 증상은 언제나 같다. "예제 XML로는 잘 되던 코드가 진짜 파일에서는 아무것도 못 찾는다." 원인은 대개 진짜 파일의 루트에 `xmlns="..."`가 붙어 있고, 그 기본 네임스페이스가 **모든 자손 요소에 상속되어** 있다는 것이다.
>
> ```csharp
> // 진짜 파일: <config xmlns="http://acme.com/config"><timeout>30</timeout></config>
> var doc = XDocument.Load ("config.xml");
>
> var t1 = doc.Root.Element ("timeout");                      // null!
> var t2 = doc.Root.Element (XNamespace.Get ("http://acme.com/config") + "timeout");  // OK
> ```
>
> `Element()`가 예외 대신 `null`을 주므로 컴파일러도 런타임도 아무 말을 하지 않는다. `Elements()`는 빈 시퀀스를 주므로 `foreach`가 0회 돈다. **디버깅 첫 수는 언제나 루트의 `xmlns`를 확인하는 것이다.**
>
> 문서의 기본 네임스페이스를 코드에 하드코딩하기 싫다면 문서에서 읽어 올 수 있다.
>
> ```csharp
> XNamespace ns = doc.Root.GetDefaultNamespace();
> var t = doc.Root.Element (ns + "timeout");     // 네임스페이스가 없는 문서에도 동작
> ```
>
> `GetDefaultNamespace()`는 네임스페이스가 없으면 `XNamespace.None`을 반환하고, `XNamespace.None + "timeout"`은 그냥 `"timeout"`이므로 양쪽 다 동작한다.

네임스페이스를 지정하지 않고 X-DOM 트리를 만들었다면, 나중에 모든 요소를 하나의 네임스페이스에 몰아넣을 수 있다.

```csharp
foreach (XElement e in data.DescendantsAndSelf())
    if (e.Name.Namespace == "")
        e.Name = ns + e.Name.LocalName;
```

> **📌 네임스페이스 관련 조회 메서드**
>
> | 멤버 | 정의 위치 | 의미 |
> |---|---|---|
> | `GetDefaultNamespace()` | `XElement` | 이 요소에 적용되는 기본 네임스페이스 |
> | `GetNamespaceOfPrefix(string)` | `XElement` | 접두사에 대응하는 네임스페이스 |
> | `GetPrefixOfNamespace(XNamespace)` | `XElement` | 네임스페이스에 대응하는 접두사 |
> | `XNamespace.None` | `XNamespace` (정적) | 빈 네임스페이스 |
> | `XNamespace.Xml` | `XNamespace` (정적) | `http://www.w3.org/XML/1998/namespace` |
> | `XNamespace.Xmlns` | `XNamespace` (정적) | `http://www.w3.org/2000/xmlns/` |

### X-DOM에서 접두사 다루기

X-DOM은 접두사를 네임스페이스와 마찬가지로 **순전히 직렬화 기능**으로 취급한다. 즉 접두사 문제를 완전히 무시해도 잘 굴러간다. 그러지 않을 이유는 XML 파일로 출력할 때의 효율뿐이다.

```csharp
XNamespace ns1 = "http://domain.com/space1";
XNamespace ns2 = "http://domain.com/space2";

var mix = new XElement (ns1 + "data",
  new XElement (ns2 + "element", "value"),
  new XElement (ns2 + "element", "value"),
  new XElement (ns2 + "element", "value")
);
```

기본적으로 `XElement`는 자식 세 개마다 `xmlns="http://domain.com/space2"`를 반복해 직렬화한다. 불필요한 중복이다. 해법은 X-DOM을 구성하는 방식을 바꾸는 것이 아니라, XML을 쓰기 **전에 직렬화기에 힌트를 주는** 것이다. 적용하고 싶은 접두사를 정의하는 특성을 추가하면 된다. 보통 루트 요소에 한다.

```csharp
mix.SetAttributeValue (XNamespace.Xmlns + "ns1", ns1);
mix.SetAttributeValue (XNamespace.Xmlns + "ns2", ns2);
```

X-DOM은 직렬화할 때 이 특성들을 자동으로 집어내 결과 XML을 압축한다. 이제 `mix.ToString()`의 결과는 이렇다.

```xml
<ns1:data xmlns:ns1="http://domain.com/space1"
          xmlns:ns2="http://domain.com/space2">
  <ns2:element>value</ns2:element>
  <ns2:element>value</ns2:element>
  <ns2:element>value</ns2:element>
</ns1:data>
```

접두사는 X-DOM을 구성·쿼리·갱신하는 방식을 바꾸지 않는다 — 접두사는 XML 파일이나 스트림으로 변환하고 되돌릴 때만 작동한다.

접두사는 특성 직렬화에서도 존중된다. 다음 예는 고객의 생년월일과 신용도를 W3C 표준 특성으로 "nil"이라 기록한다.

```csharp
XNamespace xsi = "http://www.w3.org/2001/XMLSchema-instance";
var nil = new XAttribute (xsi + "nil", true);

var cust = new XElement ("customers",
  new XAttribute (XNamespace.Xmlns + "xsi", xsi),      // ← 접두사 힌트
  new XElement ("customer",
    new XElement ("lastname", "Bloggs"),
    new XElement ("dob", nil),
    new XElement ("credit", nil)
  )
);
```

결과는 `<customers xmlns:xsi="...">` 아래에 `<dob xsi:nil="true" />`와 `<credit xsi:nil="true" />`가 놓인 XML이다. 간결함을 위해 `nil` `XAttribute`를 미리 선언해 두 번 썼는데, 같은 특성을 두 번 참조하는 것이 허용되는 이유는 필요에 따라 **자동으로 복제**되기 때문이다(42.4절).

> **⚠️ 접두사 힌트를 부모가 아니라 잎에 달면 효과가 없다**
>
> `SetAttributeValue(XNamespace.Xmlns + "p", ns)`는 그 요소와 자손에게만 접두사를 알려 준다. 잎 요소마다 달면 잎마다 `xmlns:p` 선언이 반복되어 오히려 더 커진다. **루트에 한 번** 다는 것이 정석이다.
>
> 그리고 이건 어디까지나 힌트다. 접두사 정의가 없으면 X-DOM은 여전히 올바른 XML을 만든다 — 단지 장황할 뿐이다. **접두사 때문에 문서의 의미가 달라지는 일은 없다.**

---

## 42.10 주석(annotation)과 X-DOM으로 투영하기, 스트리밍 투영

### 주석 — 직렬화되지 않는 부가 정보

어떤 `XObject`에든 **주석(annotation)** 으로 커스텀 데이터를 붙일 수 있다. 주석은 사용자의 사적인 용도를 위한 것이며 X-DOM은 이를 블랙박스로 취급한다. WPF 컨트롤의 `Tag` 프로퍼티와 비슷하지만, 주석은 **여러 개**를 붙일 수 있고 **비공개 범위**로 만들 수 있다 — 다른 타입은 볼 수조차 없는 주석을 만들 수 있다.

```csharp
public void AddAnnotation (object annotation)
public void RemoveAnnotations<T>()     where T : class
public T Annotation<T>()               where T : class
public IEnumerable<T> Annotations<T>() where T : class
```

각 주석은 **타입을 키로** 삼으며 그 타입은 참조 타입이어야 한다. `e.AddAnnotation("Hello")` 후 `e.Annotation<string>()`은 `"Hello"`를 준다. 같은 타입의 주석을 여러 개 추가한 다음 `Annotations`로 일치하는 시퀀스를 가져올 수도 있다.

그런데 `string` 같은 공개 타입은 좋은 키가 못 된다. 다른 타입의 코드가 우리 주석을 간섭할 수 있기 때문이다. 더 나은 접근은 `internal` 또는 (중첩) `private` 클래스를 쓰는 것이다.

```csharp
class X
{
    class CustomData { internal string Message; }      // 비공개 중첩 타입

    static void Test()
    {
        XElement e = new XElement ("test");
        e.AddAnnotation (new CustomData { Message = "Hello" });
        Console.Write (e.Annotations<CustomData>().First().Message);   // Hello
        e.RemoveAnnotations<CustomData>();   // 제거하려면 키 타입에 접근해야 한다
    }
}
```

> **📌 주석은 절대 직렬화되지 않는다**
>
> `Save`, `ToString`, `WriteTo` 어디에도 주석은 나타나지 않는다. 파일로 저장했다 다시 읽으면 사라진다. 이건 버그가 아니라 목적이다 — 주석은 **메모리 안의 처리 상태**를 노드에 묶어 두기 위한 장치다.
>
> 실무 용도 예:
>
> - XML 노드와 그것이 만들어진 원본 도메인 객체를 연결해 두기
> - 검증 결과(오류 목록)를 해당 노드에 붙여 두기
> - 변경 여부(dirty 플래그)를 표시해 저장 시 부분 갱신하기
> - 원본 줄 번호를 `SetLineInfo` 없이 직접 관리하기

> **⚠️ 자동 깊은 복제는 주석을 복사하지 않는다**
>
> 42.4절에서 본 자동 깊은 복제(그리고 `new XElement(other)` 복사 생성자)는 **XML 콘텐츠**를 복사한다. 주석은 그 노드의 XML 콘텐츠가 아니므로 사본에는 따라가지 않는다. 노드를 다른 트리에 넣은 뒤 주석을 조회하면 `null`이 나오는 상황이 여기서 생긴다.
>
> 주석이 살아 있어야 하는 코드라면 노드를 재사용하지 말고, 복제가 일어나지 않는 경로(부모가 없는 노드를 한 번만 추가)를 쓰거나, 복제 후 주석을 다시 붙여라.

### X-DOM으로 투영하기

지금까지는 LINQ로 X-DOM에서 데이터를 **꺼내는** 법을 보였다. LINQ 쿼리로 X-DOM에 **투영**할 수도 있다. 원본은 LINQ가 쿼리할 수 있는 어떤 것이든 된다 — EF Core 엔터티 클래스, 지역 컬렉션, 다른 X-DOM.

원본이 무엇이든 전략은 같다. **먼저 원하는 X-DOM 모양을 만드는 함수형 구성 식을 쓰고, 그 식 주위로 LINQ 쿼리를 두른다.** 먼저 단순 리터럴로 목표 모양을 쓴다.

```csharp
var customers =
  new XElement ("customers",
    new XElement ("customer", new XAttribute ("id", 1),
      new XElement ("name", "Sue"),
      new XElement ("buys", 3)
    )
  );
```

그다음 이것을 투영으로 바꾸고 주위에 LINQ 쿼리를 두른다.

```csharp
var customers =
  new XElement ("customers",
    // EF Core의 버그 때문에 AsEnumerable()을 호출해야 한다.
    from c in dbContext.Customers.AsEnumerable()
    select
      new XElement ("customer", new XAttribute ("id", c.ID),
        new XElement ("name", c.Name),
        new XElement ("buys", c.Purchases.Count)
      )
  );
```

동작 방식은 쿼리를 두 단계로 나누면 분명하다. 안쪽은 `XElement`로 투영하는 평범한 LINQ 쿼리(`IEnumerable<XElement> sqlQuery = from c in ... select new XElement(...)`)이고, 바깥은 `new XElement("customers", sqlQuery)`로 루트를 구성하는 것이다. 특이한 점은 콘텐츠 `sqlQuery`가 단일 `XElement`가 아니라 시퀀스라는 것뿐이다. XML 콘텐츠 처리에서 컬렉션은 **자동으로 열거된다**(42.4절 규칙 5번). 그래서 각 `XElement`가 자식 노드로 추가된다.

### 빈 요소 없애기

앞의 예에 고객의 최근 고액 구매 정보(`lastBigBuy`)를 포함한다고 하자. 그대로 쓰면 고액 구매가 없는 고객에게 **빈 요소**가 나온다. (데이터베이스 쿼리가 아니라 지역 쿼리였다면 `NullReferenceException`이 났을 것이다.) `lastBigBuy` 요소의 생성자를 조건 연산자로 감싸면 노드를 아예 생략할 수 있다.

```csharp
select
  new XElement ("customer", new XAttribute ("id", c.ID),
    new XElement ("name", c.Name),
    new XElement ("buys", c.Purchases.Count),
    lastBigBuy == null ? null :
      new XElement ("lastBigBuy",
        new XElement ("description", lastBigBuy.Description),
        new XElement ("price", lastBigBuy.Price)
      )
  )
```

고액 구매가 없는 고객에게는 빈 `XElement` 대신 `null`이 나온다. 이것이 우리가 원하는 것이다 — **`null` 콘텐츠는 그냥 무시되기 때문이다**(규칙 1번).

> **💡 X-DOM 투영은 "템플릿 먼저, 쿼리 나중"이 정석이다**
>
> 처음부터 쿼리와 구성을 뒤섞어 쓰면 괄호가 얽혀 디버깅이 어렵다. 순서를 지켜라.
>
> 1. 원하는 XML 결과를 손으로 적는다.
> 2. 그 XML을 리터럴 값으로 채운 함수형 구성 식으로 옮긴다. 컴파일해서 출력을 눈으로 확인한다.
> 3. 리터럴을 범위 변수의 프로퍼티로 바꾼다.
> 4. 반복되는 부분 앞에 `from ... select`를 끼워 넣는다.
>
> 각 단계마다 컴파일이 되므로 어디서 틀렸는지 좁히기 쉽다.

### 스트리밍 투영 — `XStreamingElement`

X-DOM으로 투영한 결과를 `Save`하거나 `ToString`할 목적**뿐**이라면, `XStreamingElement`로 메모리 효율을 높일 수 있다. `XStreamingElement`는 자식 콘텐츠에 **지연 로딩 시맨틱**을 적용하는 축소판 `XElement`다. 쓰는 법은 바깥쪽 `XElement`를 `XStreamingElement`로 바꾸기만 하면 된다.

```csharp
var customers =
  new XStreamingElement ("customers",
    from c in dbContext.Customers
    select
      new XStreamingElement ("customer", new XAttribute ("id", c.ID),
        new XElement ("name", c.Name),
        new XElement ("buys", c.Purchases.Count)));

customers.Save ("data.xml");
```

`XStreamingElement`의 생성자에 넘긴 쿼리는 `Save`, `ToString`, `WriteTo`를 호출하기 전까지 **열거되지 않는다**. 이것이 X-DOM 전체를 한 번에 메모리에 올리는 것을 막아 준다.

대가는 둘이다. 다시 `Save`하면 **쿼리가 재평가된다**. 그리고 자식 콘텐츠를 **순회할 수 없다** — `Elements`나 `Attributes`를 노출하지 않는다. `XStreamingElement`는 `XObject`를 비롯한 어떤 클래스도 상속하지 않으며, `Save`/`ToString`/`WriteTo` 외에 가진 멤버는 `Add` 메서드와 `Name` 프로퍼티뿐이다. 콘텐츠를 스트리밍으로 **읽는** 것은 `XmlReader`와 X-DOM을 함께 써야 한다(42.13절).

### `XElement` vs `XStreamingElement` vs `XmlWriter`

출력 전용 시나리오에서 세 선택지를 비교하면 이렇다.

| | `XElement` | `XStreamingElement` | `XmlWriter` |
|---|---|---|---|
| 메모리 | 전체 트리 | 한 번에 한 조각 | 상수 |
| 쿼리 평가 시점 | 구성 시점 (즉시) | `Save`/`ToString` 시점 (지연) | 해당 없음 |
| 재저장 | 같은 트리를 다시 쓴다 | **쿼리를 다시 실행한다** | 다시 쓸 수 없다 |
| 구성 후 순회 | 가능 | **불가** | 불가 |
| 코드 모양 | 선언적 | 선언적 | 명령형 |
| 예외 발생 시점 | 구성 중 | **저장 중** | 쓰는 중 |

> **⚠️ `XStreamingElement`는 예외가 나는 시점을 옮긴다**
>
> 쿼리 평가가 `Save` 시점으로 미뤄지므로, 데이터 소스가 던지는 예외도 그때 난다. 파일에 이미 절반쯤 쓴 상태에서 예외가 나면 **불완전한 XML 파일이 남는다.**
>
> 이건 지연 실행의 일반적 성질이며(29.6절), XML 출력에서는 특히 아프다. 대책은 두 가지다. 임시 파일에 쓰고 성공했을 때만 `File.Move`로 교체하거나, 결과를 여러 번 써야 한다면 `XStreamingElement`를 쓰지 말고 실체화된 트리를 만드는 것이다. 특히 `IQueryable` 소스(데이터베이스)를 넘길 때는 저장할 때마다 DB 왕복이 다시 일어난다는 점을 잊지 마라.

> **💡 언제 `XStreamingElement`를 쓰나**
>
> 세 조건이 전부 맞을 때만 값어치가 있다 — 결과를 **한 번만** 쓰고, 결과를 **순회하지 않고**, 결과가 메모리에 담기 부담스러울 만큼 **크다**. 하나라도 어긋나면 그냥 `XElement`가 단순하고 안전하다. 반대로 셋이 다 맞고 성능이 더 필요하다면 `XmlWriter`로 내려가라 — `XStreamingElement`는 그 중간 지점이다.

---

## 42.11 `XmlReader` — 노드·요소·특성 읽기, 네임스페이스

`XmlReader`는 XML 스트림을 저수준·전진 전용 방식으로 읽는 고성능 클래스다. 다음 XML 파일 customer.xml을 예로 쓴다.

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<customer id="123" status="archived">
  <firstname>Jim</firstname>
  <lastname>Bo</lastname>
</customer>
```

`XmlReader`를 만들려면 정적 `XmlReader.Create` 메서드를 호출하고 `Stream`, `TextReader`, 또는 URI 문자열을 넘긴다. `XmlReaderSettings` 객체를 넘겨 파싱·검증 옵션을 제어할 수도 있다.

```csharp
using XmlReader reader = XmlReader.Create ("customer.xml");

// 문자열에서 읽으려면 StringReader로 감싼다.
using XmlReader r2 = XmlReader.Create (new System.IO.StringReader (myString));
```

### `XmlReaderSettings`

| 프로퍼티 | 기본값 | 의미 |
|---|---|---|
| `IgnoreWhitespace` | `false` | 공백 노드를 건너뛴다 |
| `IgnoreComments` | `false` | 주석 노드를 건너뛴다 |
| `IgnoreProcessingInstructions` | `false` | 처리 명령을 건너뛴다 |
| `ConformanceLevel` | `Document` | `Document`/`Fragment`/`Auto` |
| `CloseInput` | `false` | 리더를 닫을 때 하위 스트림도 닫을지 |
| `DtdProcessing` | `Prohibit` | DTD 처리 방식 (42.14절) |
| `MaxCharactersFromEntities` | `0` (무제한) | 엔터티 확장 한도 (42.14절) |
| `Async` | `false` | 비동기 메서드 사용 허용 |
| `Schemas` / `ValidationType` | — | XSD 검증 (42.14절) |

앞의 셋은 군더더기 콘텐츠를 건너뛰는 데 특히 유용하다.

`ConformanceLevel`의 기본값 `Document`는 루트 노드가 하나인 유효한 XML 문서를 가정하라고 리더에 지시한다. `<firstname>Jim</firstname><lastname>Bo</lastname>`처럼 루트가 여러 개인 조각을 예외 없이 읽으려면 `ConformanceLevel`을 `Fragment`로 설정해야 한다.

### 노드 읽기

XML 스트림의 단위는 XML 노드다. 리더는 텍스트(깊이 우선) 순서로 스트림을 순회하며, `Depth` 프로퍼티가 커서의 현재 깊이를 반환한다.

가장 원시적인 읽기 방법은 `Read`를 호출하는 것이다. 다음 노드로 전진하며 `IEnumerator`의 `MoveNext`와 비슷하다. 첫 호출은 커서를 첫 노드에 놓고, `false`를 반환하면 마지막 노드를 지났다는 뜻이다. 노드 콘텐츠는 `Name`과 `Value` 두 문자열 프로퍼티로 접근하며, 노드 타입에 따라 둘 중 하나(또는 둘 다)가 채워진다.

```csharp
var settings = new XmlReaderSettings { IgnoreWhitespace = true };
using XmlReader reader = XmlReader.Create ("customer.xml", settings);

while (reader.Read())
{
    Console.Write (new string (' ', reader.Depth * 2));      // 들여쓰기
    Console.Write (reader.NodeType.ToString());

    if (reader.NodeType == XmlNodeType.Element ||
        reader.NodeType == XmlNodeType.EndElement)
        Console.Write (" Name=" + reader.Name);
    else if (reader.NodeType == XmlNodeType.Text)
        Console.Write (" Value=" + reader.Value);

    Console.WriteLine();
}
// XmlDeclaration
// Element Name=customer
//   Element Name=firstname
//     Text Value=Jim
//   EndElement Name=firstname
//   ... (lastname도 같은 모양)
// EndElement Name=customer
```

> **⚠️ 특성은 `Read` 기반 순회에 등장하지 않는다**
>
> 위 출력에 `id`와 `status` 특성이 안 보인다. 특성은 별도의 "우회로"를 통해서만 읽을 수 있다(뒤의 "특성 읽기"). X-DOM에서 `XAttribute`가 `XNode`가 아닌 것과 같은 구조적 이유다.

`NodeType`은 `XmlNodeType` 타입이며 다음 멤버를 가진 열거형이다.

```text
None                    Comment                  Document
XmlDeclaration          Entity                   DocumentType
Element                 EndEntity                DocumentFragment
EndElement              EntityReference          Notation
Text                    ProcessingInstruction    Whitespace
Attribute               CDATA                    SignificantWhitespace
```

### 요소 읽기

읽고 있는 XML 문서의 구조를 이미 알고 있는 경우가 많다. `XmlReader`는 특정 구조를 전제하고 읽는 메서드들을 제공해 이를 돕는다. 코드가 단순해지는 동시에 검증도 어느 정도 수행된다.

- `ReadStartElement`는 현재 `NodeType`이 `Element`인지 확인한 다음 `Read`를 호출한다. 이름을 지정하면 현재 요소의 이름과 일치하는지도 확인한다.
- `ReadEndElement`는 현재 `NodeType`이 `EndElement`인지 확인한 다음 `Read`를 호출한다.

```csharp
// <firstname>Jim</firstname>을 원시적으로 읽기
reader.ReadStartElement ("firstname");
Console.WriteLine (reader.Value);
reader.Read();
reader.ReadEndElement();

// ReadElementContentAsString이 이 전부를 한 번에 한다.
// 두 번째 인자는 네임스페이스이며 이 예에서는 비어 있다.
string firstName = reader.ReadElementContentAsString ("firstname", "");
```

결과를 파싱하는 타입별 버전도 있다 — `ReadElementContentAsInt` 등. 원래 문서에 요소를 하나 더 넣어 보자.

```xml
<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<customer id="123" status="archived">
  <firstname>Jim</firstname>
  <lastname>Bo</lastname>
  <creditlimit>500.00</creditlimit>
  <!-- OK, we sneaked this in! -->
</customer>
```

이렇게 읽는다.

```csharp
var settings = new XmlReaderSettings { IgnoreWhitespace = true };
using XmlReader r = XmlReader.Create ("customer.xml", settings);

r.MoveToContent();                                                  // XML 선언을 건너뛴다
r.ReadStartElement ("customer");
string firstName    = r.ReadElementContentAsString ("firstname", "");
string lastName     = r.ReadElementContentAsString ("lastname", "");
decimal creditLimit = r.ReadElementContentAsDecimal ("creditlimit", "");

r.MoveToContent();                                                  // 성가신 주석을 건너뛴다
r.ReadEndElement();                                                 // 닫는 customer 태그를 읽는다
```

`MoveToContent` 메서드는 군더더기를 전부 건너뛴다 — XML 선언, 공백, 주석, 처리 명령. `XmlReaderSettings`의 프로퍼티로도 대부분 자동화할 수 있다.

`XmlReader`는 검증에 실패하면 `XmlException`을 던진다. `XmlException`은 오류가 발생한 위치를 나타내는 `LineNumber`와 `LinePosition` 프로퍼티를 가진다 — **XML 파일이 크다면 이 정보를 로깅하는 것이 필수다.**

### 선택적 요소와 임의 순서

`<lastname>`이 선택적이라면 이름을 먼저 확인하면 된다.

```csharp
string lastName = r.Name == "lastname" ? r.ReadElementContentAsString() : null;
```

이 절의 예제들은 요소가 정해진 순서로 나타나는 데 의존한다. 요소가 임의 순서로 나타나는 것을 감당해야 한다면, **가장 쉬운 해법은 그 부분을 X-DOM으로 읽어 들이는 것**이다. 42.13절에서 다룬다.

### 빈 요소라는 끔찍한 함정

`XmlReader`가 빈 요소를 다루는 방식은 지독한 함정이다. XML에서 `<customerList></customerList>`와 `<customerList/>`는 동등하지만 `XmlReader`는 둘을 **다르게** 취급한다. 앞의 형태에서는 `ReadStartElement` 다음의 `ReadEndElement`가 기대대로 동작하지만, 뒤의 형태에서는 `ReadEndElement`가 예외를 던진다 — `XmlReader`가 보기에 별도의 "끝 요소"가 없기 때문이다. 우회법은 빈 요소인지 검사하는 것이다.

```csharp
bool isEmpty = reader.IsEmptyElement;
reader.ReadStartElement ("customerList");
if (!isEmpty) reader.ReadEndElement();
```

> **⚠️ `IsEmptyElement`는 `ReadStartElement` 전에 읽어야 한다**
>
> 위 코드에서 `isEmpty`를 지역 변수에 먼저 담은 이유가 있다. `ReadStartElement`를 부르면 커서가 이미 이동했으므로 `reader.IsEmptyElement`는 더 이상 그 요소를 가리키지 않는다. 한 줄 순서를 바꾸면 조용히 틀린다.
>
> 현실적으로 이 문제는 문제의 요소가 **자식 요소를 가질 수 있을 때**(고객 목록 같은)만 성가시다. 단순 텍스트를 감싸는 요소(`firstname` 같은)는 `ReadElementContentAsString` 같은 메서드를 쓰면 전체 문제를 피할 수 있다. `ReadElementXXX` 메서드들은 두 종류의 빈 요소를 모두 올바르게 처리한다.

### `ReadXXX` 메서드 정리

굵게 표시한 XML 조각이 각 메서드가 읽는 구간이다.

| 멤버 | 대상 `NodeType` | 샘플 XML 조각 | 입력 매개변수 | 반환 |
|---|---|---|---|---|
| `ReadContentAsXXX` | `Text` | `<a>`**x**`</a>` | — | `x` |
| `ReadElementContentAsXXX` | `Element` | **`<a>x</a>`** | — | `x` |
| `ReadInnerXml` | `Element` | `<a>`**x**`</a>` | — | `x` |
| `ReadOuterXml` | `Element` | **`<a>x</a>`** | — | `<a>x</a>` |
| `ReadStartElement` | `Element` | **`<a>`**`x</a>` | — | — |
| `ReadEndElement` | `Element` | `<a>x`**`</a>`** | — | — |
| `ReadSubtree` | `Element` | **`<a>x</a>`** | — | 프록시 리더 |
| `ReadToDescendant` | `Element` | `<a>x`**`<b>`**`</b></a>` | `"b"` | `bool` |
| `ReadToFollowing` | `Element` | `<a>x`**`<b>`**`</b></a>` | `"b"` | `bool` |
| `ReadToNextSibling` | `Element` | `<a>x</a>`**`<b>`**`</b>` | `"b"` | `bool` |
| `ReadAttributeValue` | `Attribute` | (아래 "특성 읽기") | — | `bool` |

`ReadContentAsXXX`는 텍스트 노드를 타입 XXX로 파싱하며, 내부적으로 `XmlConvert`가 문자열→타입 변환을 수행한다. 텍스트 노드는 요소 안에 있어도 되고 특성 안에 있어도 된다. `ReadElementContentAsXXX`는 대응하는 `ReadContentAsXXX`를 감싼 것으로, 요소가 감싸고 있는 텍스트 노드가 아니라 **요소 노드 자체**에 적용된다.

`ReadInnerXml`은 보통 요소에 적용하며 그 요소의 **모든 자손**을 읽어 반환한다(특성에 적용하면 특성 값). `ReadOuterXml`은 커서 위치의 요소 자체를 **포함**한다는 점만 다르다.

`ReadSubtree`는 현재 요소(와 그 자손)만 보이는 뷰를 제공하는 **프록시 리더**를 반환한다. 프록시 리더는 원본 리더를 다시 안전하게 읽기 전에 반드시 닫아야 하며, 닫히면 원본 리더의 커서가 서브트리 끝으로 이동한다.

`ReadToDescendant`/`ReadToFollowing`/`ReadToNextSibling`은 각각 지정한 이름·네임스페이스의 첫 자손 / (깊이 무관) 첫 노드 / 첫 형제의 시작으로 커서를 옮긴다.

> **⚠️ `ReadString`과 `ReadElementString`은 쓰지 마라**
>
> 레거시 메서드가 둘 있다. `ReadString`과 `ReadElementString`은 각각 `ReadContentAsString`, `ReadElementContentAsString`처럼 동작하지만, 요소 안에 텍스트 노드가 하나보다 많으면 예외를 던진다. **요소가 주석을 담고 있기만 해도 예외가 난다.** 피해야 할 메서드다.

### 특성 읽기

`XmlReader`는 요소의 특성에 이름이나 위치로 직접(임의) 접근하게 해 주는 인덱서를 제공하며, 이는 `GetAttribute`를 호출하는 것과 같다. XML 조각이 `<customer id="123" status="archived"/>`라면 이렇게 읽는다.

```csharp
Console.WriteLine (reader ["id"]);              // 123
Console.WriteLine (reader ["status"]);          // archived
Console.WriteLine (reader ["bogus"] == null);   // True

Console.WriteLine (reader [0]);                 // 123 — 서수 접근도 가능
Console.WriteLine (reader.AttributeCount);      // 2
```

> **⚠️ `ReadStartElement` 후에는 특성이 영원히 사라진다**
>
> `XmlReader`가 특성을 읽으려면 **시작 요소에 위치해 있어야 한다.** `ReadStartElement`를 호출한 뒤에는 특성이 사라진다. 이건 되돌릴 수 없다 — 전진 전용이기 때문이다.
>
> 그래서 커스텀 `ReadXml` 메서드를 쓸 때 **특성을 먼저 읽고 그다음 `ReadStartElement`를 호출하는** 순서가 굳어진 관용구가 되었다(42.13절).

특성 노드를 명시적으로 순회하려면 `Read`만 부르는 정상 경로에서 우회를 해야 한다. 그럴 만한 좋은 이유는 `ReadContentAsXXX`로 특성 값을 다른 타입으로 파싱하고 싶을 때다. 우회는 시작 요소에서 출발하며, **특성 순회 중에는 전진 전용 규칙이 완화된다** — `MoveToAttribute`로 어떤 특성으로든 앞뒤 상관없이 점프할 수 있다. `MoveToAttribute`는 지정한 특성이 없으면 `false`를 반환하고, `MoveToElement`는 우회로 어디에서든 시작 요소로 되돌려 준다.

```csharp
reader.MoveToAttribute ("status");
string status = reader.ReadContentAsString();
reader.MoveToAttribute ("id");
int id = reader.ReadContentAsInt();

// 순서대로 순회하기
if (reader.MoveToFirstAttribute())
    do { Console.WriteLine (reader.Name + "=" + reader.Value); }
    while (reader.MoveToNextAttribute());
// id=123 / status=archived
```

### 네임스페이스와 접두사

`XmlReader`는 요소·특성 이름을 가리키는 **두 가지 병렬 체계**를 제공한다.

- `Name`
- `NamespaceURI`와 `LocalName`

요소의 `Name`을 읽거나 이름 인자를 하나만 받는 메서드를 호출할 때는 첫 번째 체계를 쓰는 것이다. 네임스페이스나 접두사가 없으면 잘 동작하지만, 그렇지 않으면 조잡하고 문자 그대로 동작한다 — 네임스페이스는 무시되고 접두사는 쓰인 그대로 포함된다.

| 샘플 조각 | `Name` |
|---|---|
| `<customer ...>` | `customer` |
| `<customer xmlns='blah' ...>` | `customer` |
| `<x:customer ...>` | `x:customer` |

앞의 두 경우는 `reader.ReadStartElement("customer")`로 처리된다. 세 번째는 `reader.ReadStartElement("x:customer")`가 필요하다.

두 번째 체계는 `NamespaceURI`와 `LocalName`으로 동작한다. 이 프로퍼티들은 접두사와 부모가 정의한 기본 네임스페이스를 고려하며 접두사를 자동으로 확장한다. 즉 `NamespaceURI`는 언제나 의미론적으로 올바른 네임스페이스를 반영하고 `LocalName`에는 접두사가 없다. `ReadStartElement` 같은 메서드에 이름 인자를 **둘** 넘기면 이 체계를 쓰는 것이다.

```xml
<customer xmlns="DefaultNamespace" xmlns:other="OtherNamespace">
  <address>
    <other:city>
      ...
```

```csharp
reader.ReadStartElement ("customer", "DefaultNamespace");
reader.ReadStartElement ("address",  "DefaultNamespace");
reader.ReadStartElement ("city",     "OtherNamespace");
```

접두사를 추상화해 없애는 것이 보통 원하는 바다. 필요하다면 `Prefix` 프로퍼티로 어떤 접두사가 쓰였는지 볼 수 있고, `LookupNamespace`를 호출해 네임스페이스로 변환할 수 있다.

> **💡 이름 인자 하나짜리 오버로드를 쓰지 마라**
>
> `ReadStartElement("customer")`는 접두사가 붙는 순간 조용히 깨진다. 문서가 오늘 접두사를 안 쓴다고 해서 내일도 안 쓴다는 보장은 없다 — 같은 의미의 XML을 다른 도구가 접두사로 직렬화하면 코드가 무너진다.
>
> **두 인자짜리 오버로드를 기본으로 삼아라.** 네임스페이스가 없으면 빈 문자열 `""`를 넘기면 된다. 이 습관 하나가 상호운용 버그를 크게 줄인다.

> **📌 `XmlReader`는 비동기 메서드를 가진다**
>
> `XmlReader`는 느릴 수 있는 소스(스트림, URI)에서 읽으므로 대부분의 메서드에 비동기 버전이 있다 — `ReadAsync`, `MoveToContentAsync`, `ReadElementContentAsStringAsync`, `ReadInnerXmlAsync` 등. 쓰려면 `XmlReaderSettings.Async = true`로 만든 리더여야 한다. 그렇지 않으면 예외가 난다. 비동기의 전모는 47장에서 다룬다.

---

## 42.12 `XmlWriter` — 특성·기타 노드 쓰기

`XmlWriter`는 XML 스트림의 전진 전용 라이터이며 설계가 `XmlReader`와 대칭이다. `XmlReader`처럼 선택적 설정 객체와 함께 `Create`를 호출해 만든다.

```csharp
var settings = new XmlWriterSettings { Indent = true };
using XmlWriter writer = XmlWriter.Create ("foo.xml", settings);

writer.WriteStartElement ("customer");
writer.WriteElementString ("firstname", "Jim");
writer.WriteElementString ("lastname", "Bo");
writer.WriteEndElement();
```

결과 문서는 `XmlReader` 첫 예제에서 읽었던 파일(선언 + `<customer>` 아래 `firstname`·`lastname`)과 같다.

`XmlWriter`는 `XmlWriterSettings`에서 `OmitXmlDeclaration`을 `true`로 하거나 `ConformanceLevel`을 `Fragment`로 지정하지 않는 한 맨 위에 선언을 자동으로 쓴다. 후자는 **루트 노드를 여러 개 쓰는 것**도 허용한다.

| `XmlWriterSettings` 프로퍼티 | 기본값 | 의미 |
|---|---|---|
| `Indent` | `false` | 들여쓰기와 줄바꿈을 넣는다 |
| `IndentChars` | 공백 두 칸 | 들여쓰기 단위 문자열 |
| `NewLineChars` | `"\r\n"` | 줄바꿈 문자열 (환경 기본값이 아니라 고정값이다) |
| `NewLineOnAttributes` | `false` | 특성마다 줄을 바꾼다 |
| `Encoding` | UTF-8 | 출력 인코딩 (문자열 출력에는 무의미) |
| `OmitXmlDeclaration` | `false` | XML 선언을 생략한다 |
| `ConformanceLevel` | `Document` | `Fragment`면 루트 여러 개 허용 |
| `CloseOutput` | `false` | 라이터를 닫을 때 하위 스트림도 닫을지 |
| `Async` | `false` | 비동기 메서드 사용 허용 |

### 값 쓰기

`WriteValue` 메서드는 텍스트 노드 하나를 쓴다. `string`뿐 아니라 `bool`, `DateTime` 같은 비문자열 타입도 받으며, 내부적으로 `XmlConvert`를 호출해 XML 규격에 맞는 문자열 변환을 수행한다.

```csharp
writer.WriteStartElement ("birthdate");
writer.WriteValue (DateTime.Now);                                   // 안전
writer.WriteEndElement();

writer.WriteElementString ("birthdate", DateTime.Now.ToString());   // 하지 마라
```

두 번째 형태는 결과가 XML 규격에 맞지 않고 잘못 파싱될 위험이 있다. `WriteString`은 문자열로 `WriteValue`를 호출하는 것과 동등하다. `XmlWriter`는 특성이나 요소 안에서 불법인 문자를 자동으로 이스케이프한다 — `&`, `<`, `>`, 그리고 확장 유니코드 문자 등.

> **💡 `XmlWriter`가 이스케이프해 주므로 문자열을 손으로 조립하지 마라**
>
> XML을 `StringBuilder`로 조립하는 코드는 언젠가 반드시 데이터에 `&`나 `<`가 들어오면서 깨진다. 사용자 입력이 들어가는 XML을 문자열 연결로 만드는 것은 SQL 인젝션과 같은 부류의 실수다. `XmlWriter`나 X-DOM을 쓰면 이스케이프가 공짜다.

### 특성 쓰기

시작 요소를 쓴 직후에 특성을 쓸 수 있다.

```csharp
writer.WriteStartElement ("customer");
writer.WriteAttributeString ("id", "1");
writer.WriteAttributeString ("status", "archived");
```

비문자열 값을 쓰려면 `WriteStartAttribute`, `WriteValue`, `WriteEndAttribute`를 차례로 호출한다.

> **⚠️ 특성은 자식 콘텐츠보다 먼저 써야 한다**
>
> `WriteStartElement` 다음에 `WriteElementString`으로 자식을 하나라도 쓰고 나면 그 요소에 특성을 더 붙일 수 없다. 전진 전용이므로 이미 나간 시작 태그를 고칠 수 없기 때문이다. 순서를 어기면 예외가 난다. 코드를 리팩터링하다 특성 쓰기 줄이 아래로 밀려나는 실수가 흔하다.

### 기타 노드 타입 쓰기

`XmlWriter`는 다른 종류의 노드를 쓰는 메서드도 정의한다.

```text
WriteBase64                 // 이진 데이터
WriteBinHex                 // 이진 데이터
WriteCData
WriteComment
WriteDocType
WriteEntityRef
WriteProcessingInstruction
WriteRaw
WriteWhitespace
```

`WriteRaw`는 출력 스트림에 문자열을 **직접 주입한다**. `XmlReader`를 받아 그 리더의 모든 것을 그대로 되뿜는 `WriteNode` 메서드도 있다.

> **⚠️ `WriteRaw`는 이스케이프를 건너뛴다 — XML 인젝션의 입구다**
>
> `WriteRaw`가 넘겨받은 문자열을 그대로 스트림에 붓는다는 것은, 그 문자열이 유효한 XML인지 아무도 검사하지 않는다는 뜻이다. 사용자 입력이나 외부 시스템의 데이터를 `WriteRaw`에 넘기면 문서 구조를 마음대로 바꿀 수 있다.
>
> ```csharp
> // 사용자 이름이 "</name><admin>true</admin><name>"이면?
> writer.WriteRaw (userSuppliedName);      // 문서 구조가 조작된다
> writer.WriteString (userSuppliedName);   // 안전 — 이스케이프된다
> ```
>
> `WriteRaw`는 **이미 검증된 XML 조각**을 그대로 통과시킬 때만 써라. 그런 경우조차 `WriteNode(XmlReader)`가 더 안전하다 — 파싱을 거치므로 잘못된 XML이면 그 자리에서 실패한다.

### 네임스페이스와 접두사

`Write*` 메서드의 오버로드로 요소나 특성을 네임스페이스와 연결할 수 있다. 모든 요소를 `http://oreilly.com` 네임스페이스와 연결하고 `customer` 요소에서 접두사 `o`를 선언해 보자.

```csharp
writer.WriteStartElement ("o", "customer", "http://oreilly.com");
writer.WriteElementString ("o", "firstname", "http://oreilly.com", "Jim");
writer.WriteElementString ("o", "lastname",  "http://oreilly.com", "Bo");
writer.WriteEndElement();
```

출력은 이제 이렇다.

```xml
<?xml version="1.0" encoding="utf-8"?>
<o:customer xmlns:o='http://oreilly.com'>
  <o:firstname>Jim</o:firstname>
  <o:lastname>Bo</o:lastname>
</o:customer>
```

부모 요소가 이미 선언한 네임스페이스는 자식 요소에서 간결함을 위해 생략된다는 점에 주목하라.

### `Dispose`는 선택이 아니다

> **⚠️ `XmlWriter`를 `Dispose`하지 않으면 파일이 잘린다**
>
> `XmlWriter`는 출력을 버퍼링하고, `Dispose`(또는 `Flush`) 시점에 아직 닫히지 않은 요소를 자동으로 닫으며 버퍼를 비운다. `Dispose`를 빼먹으면 **파일 끝이 잘리거나 닫는 태그가 없는 XML**이 남는다 — 그리고 아무 예외도 나지 않는다. `var writer = XmlWriter.Create(...)`처럼 만들어 두고 중간에 예외가 나면 그대로 깨진 파일이 남으므로, `using XmlWriter writer = XmlWriter.Create(...)` 형태를 쓴다. 이 장 예제가 일관되게 `using` 선언을 쓴 이유다(33장).
>
> 비동기로 쓴다면 `await using`으로 `DisposeAsync`를 부르는 편이 낫다. 동기 `Dispose`는 비동기 스트림에 대해 블로킹 쓰기를 일으킬 수 있다.

> **📌 `WriteEndDocument`와 `WriteEndElement`**
>
> `WriteEndElement`는 가장 최근에 연 요소를, `WriteEndDocument`는 **열려 있는 모든 요소**를 닫는다. 후자는 편하지만 요소를 덜 닫은 실수를 숨기므로 명시적으로 짝을 맞추는 편이 디버깅에 낫다. `XmlWriterSettings.WriteEndDocumentOnClose`(기본 `true`)도 `Dispose` 시점에 남은 요소를 닫아 주는데, 여기에 의존하면 "논리적으로 완결되지 않은 문서"가 유효한 XML로 저장되어 버그를 감춘다.

---

## 42.13 `XmlReader`/`XmlWriter` 사용 패턴 — 계층 데이터, X-DOM과 혼용

### 계층 데이터 다루기

다음 클래스들을 보자.

```csharp
public class Contacts
{
    public IList<Customer> Customers = new List<Customer>();
    public IList<Supplier> Suppliers = new List<Supplier>();
}
public class Customer { public string FirstName, LastName; }
public class Supplier { public string Name; }
```

`XmlReader`와 `XmlWriter`로 `Contacts` 객체를 다음 XML로 직렬화하고 싶다고 하자(`id`는 선택적이라고 가정한다).

```xml
<contacts>
  <customer id="1"><firstname>Jay</firstname><lastname>Dee</lastname></customer>
  <customer><firstname>Kay</firstname><lastname>Gee</lastname></customer>
  <supplier><name>X Technologies Ltd</name></supplier>
</contacts>
```

최선의 접근은 하나의 큰 메서드를 쓰는 것이 아니라, **XML 기능을 `Customer`와 `Supplier` 타입 자신에게 캡슐화**하는 것이다 — 각 타입에 `ReadXml`과 `WriteXml` 메서드를 쓴다. 패턴은 단순하다.

- `ReadXml`과 `WriteXml`은 **빠져나올 때 리더/라이터를 들어올 때와 같은 깊이에 남긴다.**
- `ReadXml`은 **바깥 요소를 읽고**, `WriteXml`은 **안쪽 콘텐츠만 쓴다.**

`Customer` 타입은 이렇게 쓴다.

```csharp
public class Customer
{
    public const string XmlName = "customer";
    public int? ID;
    public string FirstName, LastName;

    public Customer() { }
    public Customer (XmlReader r) { ReadXml (r); }

    public void ReadXml (XmlReader r)
    {
        if (r.MoveToAttribute ("id")) ID = r.ReadContentAsInt();
        r.ReadStartElement();
        FirstName = r.ReadElementContentAsString ("firstname", "");
        LastName  = r.ReadElementContentAsString ("lastname", "");
        r.ReadEndElement();
    }

    public void WriteXml (XmlWriter w)
    {
        if (ID.HasValue) w.WriteAttributeString ("id", "", ID.ToString());
        w.WriteElementString ("firstname", FirstName);
        w.WriteElementString ("lastname", LastName);
    }
}
```

`ReadXml`이 바깥의 시작·끝 요소 노드를 읽는다는 점에 주목하라. 호출자가 그 일을 대신했다면 `Customer`는 자기 특성을 읽을 수 없었을 것이다(42.11절의 "`ReadStartElement` 후에는 특성이 사라진다"). 이 점에서 `WriteXml`을 대칭으로 만들지 않는 이유는 둘이다. 호출자가 바깥 요소의 이름을 고르고 싶을 수 있고, 추가 XML 특성(요소의 하위 타입 같은 것 — 되읽을 때 어떤 클래스를 만들지 결정하는 데 쓴다)을 써야 할 수 있다. 이 패턴의 또 다른 이점은 구현이 `IXmlSerializable`과 호환된다는 점이다.

`Supplier` 클래스도 같은 모양이다 — `ReadXml`은 `ReadStartElement()` / `ReadElementContentAsString("name", "")` / `ReadEndElement()`이고, `WriteXml`은 `w.WriteElementString("name", Name)` 한 줄이다.

`Contacts` 클래스에서는 `ReadXml`에서 요소를 열거하면서 각 하위 요소가 customer인지 supplier인지 검사해야 한다. 빈 요소 함정도 우회해야 한다.

```csharp
public void ReadXml (XmlReader r)
{
    bool isEmpty = r.IsEmptyElement;         // <contacts/> 같은 빈 요소에
    r.ReadStartElement();                    // 당하지 않도록 먼저 검사한다
    if (isEmpty) return;

    while (r.NodeType == XmlNodeType.Element)
    {
        if      (r.Name == Customer.XmlName) Customers.Add (new Customer (r));
        else if (r.Name == Supplier.XmlName) Suppliers.Add (new Supplier (r));
        else throw new XmlException ("Unexpected node: " + r.Name);
    }
    r.ReadEndElement();
}

public void WriteXml (XmlWriter w)
{
    foreach (Customer c in Customers)
    {
        w.WriteStartElement (Customer.XmlName);
        c.WriteXml (w);
        w.WriteEndElement();
    }
    foreach (Supplier s in Suppliers)
    {
        w.WriteStartElement (Supplier.XmlName);
        s.WriteXml (w);
        w.WriteEndElement();
    }
}
```

호출부는 이렇다.

```csharp
// 직렬화
using (XmlWriter writer = XmlWriter.Create ("contacts.xml",
                            new XmlWriterSettings { Indent = true }))
{
    var cts = new Contacts();                // Customer와 Supplier를 채운다...
    writer.WriteStartElement ("contacts");
    cts.WriteXml (writer);
    writer.WriteEndElement();
}

// 역직렬화
var rs = new XmlReaderSettings { IgnoreWhitespace = true, IgnoreComments = true,
                                 IgnoreProcessingInstructions = true };
using XmlReader reader = XmlReader.Create ("contacts.xml", rs);
reader.MoveToContent();
var loaded = new Contacts();
loaded.ReadXml (reader);
```

> **⚠️ 이 패턴은 리더의 위치 계약을 어기는 순간 무너진다**
>
> `ReadXml`이 들어올 때와 다른 깊이에 리더를 남기면, 그다음 호출부터 모든 것이 어긋난다. 그리고 증상은 대개 "엉뚱한 요소 이름 때문에 `XmlException`"이라서 진짜 원인(몇 단계 전의 메서드)을 찾기 어렵다.
>
> 방어책은 디버그 빌드에서 깊이를 단언(assert)하는 것이다.
>
> ```csharp
> public void ReadXml (XmlReader r)
> {
>     int depth = r.Depth;
>     ReadXmlCore (r);
>     Debug.Assert (r.Depth == depth, $"{GetType().Name}.ReadXml이 깊이를 어겼다");
> }
> ```

### `XmlReader`/`XmlWriter`와 X-DOM 혼용하기

XML 트리의 어느 지점에서든 `XmlReader`나 `XmlWriter`가 너무 성가셔지면 X-DOM을 끌어들일 수 있다. 안쪽 요소를 X-DOM으로 처리하는 것은 **X-DOM의 사용 편의성과 `XmlReader`/`XmlWriter`의 낮은 메모리 사용량을 결합하는 훌륭한 방법**이다.

#### `XmlReader`와 `XElement`

현재 요소를 X-DOM으로 읽어 들이려면 `XNode.ReadFrom`을 호출하며 `XmlReader`를 넘긴다. `XElement.Load`와 달리 이 메서드는 "탐욕적"이지 않다 — 문서 전체를 기대하지 않고 현재 서브트리의 끝까지만 읽는다.

`<log>` 아래에 `<logentry id="...">` 요소가 100만 개 있는 로그 파일을 전부 X-DOM으로 읽는 것은 메모리 낭비다. 더 나은 해법은 `XmlReader`로 각 `logentry`를 순회하고 `XElement`로 개별 처리하는 것이다.

```csharp
var settings = new XmlReaderSettings { IgnoreWhitespace = true };
using XmlReader r = XmlReader.Create ("logfile.xml", settings);

r.ReadStartElement ("log");
while (r.Name == "logentry")
{
    XElement logEntry = (XElement) XNode.ReadFrom (r);
    int id          = (int)      logEntry.Attribute ("id");
    DateTime date   = (DateTime) logEntry.Element ("date");
    string source   = (string)   logEntry.Element ("source");
    // ...
}
r.ReadEndElement();
```

```text
 파일 (1 GB)
   ┌──────────────────────────────────────────────────────┐
   │ <log> <logentry/> <logentry/> ... <logentry/> </log>  │
   └──────────────────────────────────────────────────────┘
              ↑
           XmlReader 커서 — 앞으로만 이동, 메모리 상수
              │
              └─→ XNode.ReadFrom → XElement 하나 (수 KB)
                                     ↓ 처리 후 GC 대상
                  힙에는 언제나 logentry 하나만 존재한다
```

앞 절의 패턴을 따랐다면, 호출자가 눈치채지 못하게 `ReadXml`/`WriteXml` 안에 `XElement`를 끼워 넣을 수 있다.

```csharp
public void ReadXml (XmlReader r)
{
    XElement x = (XElement) XNode.ReadFrom (r);
    ID        = (int)    x.Attribute ("id");
    FirstName = (string) x.Element ("firstname");
    LastName  = (string) x.Element ("lastname");
}
```

`XElement`는 `XmlReader`와 협력해 네임스페이스가 온전히 유지되고 접두사가 제대로 확장되도록 보장한다 — 바깥 수준에서 정의되었더라도 그렇다. 루트가 `<log xmlns="http://loggingspace">`라면 `logentry` 수준에서 구성한 `XElement`가 그 네임스페이스를 올바르게 상속한다.

> **💡 이 혼용 패턴이 대용량 XML 처리의 정답이다**
>
> "XML이 너무 커서 X-DOM을 못 쓴다"는 상황의 대부분은 문서 **전체**가 큰 것이지 레코드 하나가 큰 것이 아니다. `XmlReader`로 레코드 경계까지만 훑고 각 레코드를 `ReadFrom`으로 올리면 X-DOM의 편의를 유지하면서 메모리는 레코드 하나 크기에 머문다. `ReadSubtree()`로 프록시 리더를 만들어 `XElement.Load`에 넘기는 변형도 있지만 `ReadFrom` 쪽이 한 단계 짧다.

#### `XmlWriter`와 `XElement`

`XElement`를 안쪽 요소를 `XmlWriter`에 쓰는 용도로만 쓸 수도 있다. 다음 코드는 `XElement`를 써서 `logentry` 요소 100만 개를 XML 파일에 쓴다 — 전체를 메모리에 담지 않고.

```csharp
using XmlWriter w = XmlWriter.Create ("logfile.xml");
w.WriteStartElement ("log");
for (int i = 0; i < 1000000; i++)
{
    XElement e = new XElement ("logentry", new XAttribute ("id", i),
      new XElement ("date", DateTime.Today.AddDays (-1)),
      new XElement ("source", "test"));
    e.WriteTo (w);
}
w.WriteEndElement();
```

`XElement`를 쓰는 것은 실행 오버헤드가 극히 작다. 이 예제를 전부 `XmlWriter`로 바꿔 써도 **실행 시간에 측정 가능한 차이가 없다.**

> **📌 세 가지 방식의 조합 지도**
>
> | 문서 크기 | 구조 | 권장 조합 |
> |---|---|---|
> | 작다 | 아무거나 | X-DOM 단독 |
> | 크다 | 반복 레코드 | `XmlReader` + `XNode.ReadFrom` |
> | 크다 | 출력 전용 | `XmlWriter` + `XElement.WriteTo`, 또는 `XStreamingElement` |
> | 크다 | 반복 아님 (깊고 불규칙) | `XmlReader` 단독 — 가장 고통스러운 경우 |
> | 고정 스키마 | 매핑되는 클래스 있음 | `XmlSerializer` (42.14절) |

---

## 42.14 XML 직렬화와 XSD, XML 보안(XXE)

### `XmlSerializer`

`System.Xml.Serialization.XmlSerializer`는 주어진 객체의 **공개 상태**를 순수 XML로 영속화한다. `XmlSerializer`는 직렬화(또는 역직렬화)할 타입을 **생성자에서 선언할 것을 요구한다**.

```csharp
using System.Xml.Serialization;

static void SaveAsXml<T> (T objGraph, string fileName)
{
    XmlSerializer xmlFormat = new XmlSerializer (typeof (T));
    using Stream fs = new FileStream (fileName, FileMode.Create,
                                      FileAccess.Write, FileShare.None);
    xmlFormat.Serialize (fs, objGraph);
}

static T ReadAsXml<T> (string fileName)
{
    XmlSerializer xmlFormat = new XmlSerializer (typeof (T));
    using Stream fs = new FileStream (fileName, FileMode.Open);
    return (T) xmlFormat.Deserialize (fs);
}
```

`XmlSerializer`가 지키는 규칙은 셋이다.

1. **공개 필드와 공개 프로퍼티만** 직렬화된다. `protected`·`private` 멤버는 무시된다.
2. 객체 그래프의 **모든 타입이 매개변수 없는 생성자를 지원해야 한다.** 없으면 직렬화 시점에 예외가 난다 — 현재 구현은 `InvalidOperationException`("does not have a parameterless constructor")이다.
3. 기본적으로 모든 공개 필드/프로퍼티는 XML **특성이 아니라 요소**로 직렬화된다.

```csharp
public class Person
{
    // XML 직렬화를 위해 매개변수 없는 생성자가 필요하다.
    public Person() { }
    public Person (decimal initialSalary) => Salary = initialSalary;

    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public DateTime DateOfBirth { get; set; }
    public HashSet<Person>? Children { get; set; }
    protected decimal Salary { get; set; }        // 직렬화되지 않는다
}
```

`List<Person>`을 직렬화하면 루트가 `<ArrayOfPerson>`인 XML이 나온다.

```xml
<?xml version="1.0" encoding="utf-8"?>
<ArrayOfPerson xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Person>
    <FirstName>Alice</FirstName>
    <LastName>Smith</LastName>
    <DateOfBirth>1974-03-14T00:00:00</DateOfBirth>
  </Person>
</ArrayOfPerson>
```

`Salary`가 없다는 점에 주목하라 — 공개 프로퍼티가 아니기 때문이다.

### 생성 XML 제어하기 — 특성

`System.Xml.Serialization` 네임스페이스의 특성으로 결과 XML의 모양을 제어한다.

| 특성 | 의미 |
|---|---|
| `[XmlAttribute]` | 공개 필드/프로퍼티를 하위 요소가 아닌 **XML 특성**으로 직렬화한다 |
| `[XmlElement]` | 지정한 이름의 XML 요소로 직렬화한다 |
| `[XmlEnum]` | 열거형 멤버의 요소 이름을 지정한다 |
| `[XmlRoot]` | 루트 요소가 어떻게 구성될지(네임스페이스와 요소 이름) 제어한다 |
| `[XmlText]` | 시작 태그와 끝 태그 사이의 **텍스트**로 직렬화한다 |
| `[XmlType]` | XML 타입의 이름과 네임스페이스를 지정한다 |
| `[XmlIgnore]` | 이 멤버를 직렬화에서 제외한다 |
| `[XmlArray]` / `[XmlArrayItem]` | 컬렉션을 감싸는 요소와 항목 요소의 이름을 제어한다 |

`[XmlAttribute]`로 XML을 압축할 수 있고, `[XmlRoot]`로 루트의 네임스페이스를 지정할 수 있다.

```csharp
using System.Xml.Serialization;

[XmlRoot (Namespace = "http://www.MyCompany.com")]
public class Person
{
    [XmlAttribute("fname")] public string? FirstName { get; set; }
    [XmlAttribute("lname")] public string? LastName { get; set; }
    [XmlAttribute("dob")]   public DateTime DateOfBirth { get; set; }
}
// <Person fname="Alice" lname="Smith" dob="1974-03-14T00:00:00" />
```

> **📌 `[XmlAttribute]`와 `XmlAttribute` 클래스를 혼동하지 마라**
>
> `System.Xml.Serialization.XmlAttributeAttribute`(사용 시 `[XmlAttribute]`)는 직렬화 제어 특성이다. `System.Xml.XmlAttribute` 클래스는 레거시 DOM에서 XML 특성을 나타내는 타입이다. 이름이 겹치는 대표적인 사례다.

> **⚠️ 특성이 없으면 역직렬화는 대소문자를 구분하지 않고 매칭한다**
>
> 어떤 주석(특성)도 쓰지 않으면 `XmlSerializer`는 역직렬화 시 프로퍼티 이름으로 **대소문자 구분 없는** 매칭을 수행한다. 관대해서 편할 때도 있지만, `firstName`과 `FirstName`이 같은 것으로 취급되므로 스키마를 엄격히 강제하려는 의도와 충돌한다. 정확한 이름을 강제하려면 `[XmlElement("...")]`로 명시하라.

> **⚠️ `XmlSerializer`는 인터페이스를 직렬화하지 못한다**
>
> `ICollection<T>` 같은 인터페이스 타입 프로퍼티가 있으면 `XmlSerializer` 생성 자체가 실패한다. 구체 타입(`List<T>`)으로 바꾸거나 해당 멤버에 `[XmlIgnore]`를 붙여야 한다. EF Core 엔터티를 그대로 XML로 내보내려다 이 벽에 부딪히는 경우가 흔하다.

### 성능 — 동적 어셈블리 생성이라는 함정

`XmlSerializer`는 성능을 높이기 위해 지정한 타입을 직렬화·역직렬화하는 **어셈블리를 런타임에 동적으로 생성**하고 그것을 찾아 재사용한다. **그런데 이 재사용은 `XmlSerializer(Type)`과 `XmlSerializer(Type, String)` 두 생성자를 쓸 때만 일어난다.**

> **⚠️ 다른 생성자를 쓰면 어셈블리가 계속 생성되고 절대 언로드되지 않는다**
>
> 위 두 생성자 외의 오버로드를 쓰면 같은 어셈블리의 여러 버전이 생성되고 결코 언로드되지 않는다 — **메모리 누수와 성능 저하**로 이어진다. 동적 어셈블리는 GC 대상이 아니기 때문이다.
>
> 진단 신호는 명확하다. 프로세스의 `AssemblyLoad` 이벤트(또는 "Current Assemblies" 성능 카운터)가 끝없이 증가하고, 스택 추적이 `XmlSerializer` 생성자를 가리킨다. 진단 도구 사용법은 66장에 있다.
>
> 해법은 둘이다. 위 두 생성자 중 하나를 쓰거나, 그럴 수 없다면 생성한 `XmlSerializer` 인스턴스를 **직접 캐싱**한다(타입을 키로 하는 딕셔너리). 어느 쪽이든 `XmlSerializer`를 **메서드 안에서 매번 새로 만드는 코드는 피하라.** 정적 필드에 담아 재사용하는 것이 기본이다. `XmlSerializer` 인스턴스는 스레드 안전하게 읽기 사용이 가능하다.

> **💡 `Microsoft.XmlSerializer.Generator`로 코드 생성을 빌드 시점으로 옮길 수 있다** ※
>
> 런타임 코드 생성은 첫 호출 지연을 만들고, Native AOT나 트리밍 환경에서는 아예 동작하지 않는다. `Microsoft.XmlSerializer.Generator` NuGet 패키지를 프로젝트에 추가하면 빌드 시점에 직렬화 어셈블리를 미리 만들어 준다. 트리밍/AOT 제약 일반론은 57.14절에 있다.

### `DataContractSerializer`와의 차이

| | `XmlSerializer` | `DataContractSerializer` |
|---|---|---|
| 네임스페이스 | `System.Xml.Serialization` | `System.Runtime.Serialization` |
| 대상 선택 | **옵트아웃** — 공개 멤버 전부, `[XmlIgnore]`로 제외 | **옵트인** — `[DataMember]`가 붙은 것만 |
| 비공개 멤버 | 불가 | `[DataMember]`를 붙이면 **가능** |
| XML 특성 출력 | `[XmlAttribute]`로 가능 | **불가** — 전부 요소 |
| 매개변수 없는 생성자 | **필수** | 불필요 (생성자를 호출하지 않는다) |
| 멤버 순서 | 선언 순서 | 기본은 알파벳 순, `[DataMember(Order=)]`로 제어 |
| 다형성 | `[XmlInclude]` | `[KnownType]` 또는 생성자의 `knownTypes` |
| 스키마 제어력 | 높다 (특성이 풍부) | 낮다 (의도적으로 단순) |
| 속도 | 상대적으로 느리다 | 상대적으로 빠르다 |

두 직렬화기 모두 **신뢰할 수 없는 데이터를 안전하게 다룰 수 있는 부류**에 속한다. 역직렬화할 타입을 **호출자가 미리 지정**하므로, 스트림 안의 타입 이름을 믿고 임의 타입을 만드는 `BinaryFormatter`류의 위험이 없다(41.7절).

> **⚠️ `DataContractSerializer`와 `NetDataContractSerializer`는 다르다**
>
> 이름은 한 단어 차이지만 성격이 정반대다. `NetDataContractSerializer`는 CLR 타입 이름을 스트림에 기록하고 역직렬화 시 그 이름대로 타입을 만든다 — `BinaryFormatter`와 같은 부류다. **사용 금지다.** 41.7절에서 그 이유를 다뤘다.

`DataContractSerializer`는 `XmlWriter`/`XmlReader`와 직접 맞물린다.

```csharp
var serializer = new DataContractSerializer (typeof (Person));   // 캐싱 대상이다
using var xw = XmlWriter.Create (stream, xmlWriterSettings);
serializer.WriteObject (xw, person);
```

> **💡 직렬화기와 스트림을 둘 다 재사용하라**
>
> `DataContractSerializer` 인스턴스는 매번 만들 것이 아니라 캐싱해야 한다. 그리고 직렬화 호출이 잦고 객체가 크다면 `MemoryStream`을 매번 새로 만드는 것도 비용이다 — 큰 객체 힙(LOH) 압력을 만든다. `RecyclableMemoryStream` 같은 풀링 스트림을 쓰면 버퍼를 재사용할 수 있다. LOH와 할당 문제는 62장·63장에서 다룬다.

### XSD 스키마 검증

XML 문서가 **유효(valid)** 하다는 것은 구문이 올바르다(well-formed)는 것과 다르다. 유효성은 XML 스키마(XSD)나 DTD가 정한 합의된 형식 규칙을 지키는 것을 뜻하며, .NET에서는 `System.Xml.Schema` 네임스페이스가 담당한다. `XmlReader`로 검증하려면 `XmlReaderSettings`에 스키마를 얹는다.

```csharp
using System.Xml;
using System.Xml.Schema;

var schemas = new XmlSchemaSet();
schemas.Add ("http://acme.com/config", "config.xsd");

var settings = new XmlReaderSettings {
    ValidationType  = ValidationType.Schema,
    Schemas         = schemas,
    ValidationFlags = XmlSchemaValidationFlags.ReportValidationWarnings };
settings.ValidationEventHandler += (s, e) =>
    Console.WriteLine ($"[{e.Severity}] {e.Message}");

using XmlReader r = XmlReader.Create ("config.xml", settings);
while (r.Read()) { }        // 끝까지 읽어야 전체가 검증된다
```

X-DOM에는 `System.Xml.Schema` 네임스페이스가 제공하는 `Validate` 확장 메서드가 있다.

```csharp
bool ok = true;
doc.Validate (schemas, (o, e) => { ok = false; Console.WriteLine (e.Message); });
```

`ValidationEventArgs`의 `Severity`(`XmlSeverityType.Error` 또는 `Warning`), `Message`, `Exception`(`XmlSchemaException`)으로 실패를 분류할 수 있다.

> **⚠️ 검증 이벤트 핸들러를 등록하지 않으면 오류가 예외로 바뀐다**
>
> `ValidationEventHandler`를 붙이지 않으면 검증 오류가 예외로 던져진다 — 현재 구현은 `XmlSchemaValidationException`(`XmlSchemaException`의 파생)이다. 첫 오류에서 읽기가 중단되므로 "모든 오류를 모아 보여 주는" 검증기를 만들려면 **반드시 핸들러를 등록해야 한다.** 그리고 `XmlReader` 검증은 **읽는 만큼만** 검증한다 — `Read()`를 끝까지 돌리지 않으면 뒷부분은 검사되지 않는다.

### XML 보안 — XXE와 엔터티 확장 폭탄

XML이 JSON에 대해 가진 고유한 공격 표면이 있다. **DTD(문서 타입 정의)** 다. DTD는 엔터티를 정의할 수 있고, 엔터티는 다른 엔터티나 **외부 리소스**를 참조할 수 있다.

#### XXE — 외부 엔터티 주입

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<data>&xxe;</data>
```

파서가 DTD를 처리하고 외부 리소스를 해석하도록 설정되어 있으면 `&xxe;`가 서버의 `/etc/passwd` 내용으로 치환된다. 파일 대신 `http://internal-host/`를 넣으면 내부망 스캔(SSRF)이 되고, 응답을 외부로 흘려보내는 변형도 있다. 이것이 **XML External Entity(XXE) 공격**이다.

#### 빌리언 러프스 — 엔터티 확장 폭탄

```xml
<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!-- lol3부터 lol9까지 같은 방식으로 열 배씩 중첩한다 -->
]>
<lolz>&lol9;</lolz>
```

파일은 1KB 미만인데 확장하면 문자 10억 개가 된다. 메모리를 소진시키는 **서비스 거부(DoS)** 공격이며 "빌리언 러프스(billion laughs)"라 불린다. 이것은 **외부 리소스를 전혀 참조하지 않는다** — 순전히 내부 엔터티 확장만으로 성립하므로, "외부 접근만 막으면 된다"는 방어는 불충분하다.

#### 방어 — 세 개의 스위치

```csharp
var settings = new XmlReaderSettings
{
    DtdProcessing = DtdProcessing.Prohibit,   // DTD를 만나면 예외 (가장 강함)
    XmlResolver   = null,                     // 외부 리소스 해석 금지
    MaxCharactersFromEntities = 1024 * 1024,  // 엔터티 확장 상한 (Parse를 쓸 때)
};
using XmlReader r = XmlReader.Create (stream, settings);
```

`DtdProcessing` 열거형의 값은 셋이다.

| 값 | 동작 | 권장 |
|---|---|---|
| `Prohibit` | DTD를 만나면 예외를 던진다 | **신뢰할 수 없는 입력의 기본** |
| `Ignore` | DTD를 건너뛴다 (엔터티는 해석되지 않는다) | DTD가 섞여 오지만 무시해도 되는 경우 |
| `Parse` | DTD를 처리하고 엔터티를 확장한다 | **신뢰하는 입력에서만** |

`DtdProcessing.Parse`가 꼭 필요하다면(레거시 문서에 엔터티 정의가 들어 있는 경우) 세 가지를 동시에 걸어라. `XmlResolver = null`로 외부 참조를 차단하고(이것 없이는 `Parse`가 곧 XXE다), `MaxCharactersFromEntities`로 엔터티 확장 총량을, `MaxCharactersInDocument`로 문서 전체 문자 수를 제한한다. 뒤의 둘은 기본값 `0`이 무제한이다.

> **📌 `XmlReaderSettings.XmlResolver`는 설정 전용 프로퍼티다**
>
> 값을 읽을 수 없고 설정만 할 수 있다. 그래서 "현재 리졸버가 무엇인지" 코드로 확인할 수 없다 — 반드시 명시적으로 `null`을 넣어라. CAS(코드 접근 보안)에 기대던 `XmlSecureResolver`는 CAS 자체가 .NET Core에서 제거되었으므로 현대 .NET에서 답이 아니다.

#### 버전별 기본값

여기서 정확해야 한다. **현대 .NET의 기본값은 안전하지만, 그 사실은 진입점마다 다르다.**

| 진입점 | .NET Framework 초기 | .NET Framework 4.5.2 이후 | .NET Core / .NET 5 이상 |
|---|---|---|---|
| `XmlReaderSettings.DtdProcessing` | `Prohibit`(4.0에서 도입) | `Prohibit` | `Prohibit` |
| `XmlReaderSettings.XmlResolver` | 외부 해석 리졸버 | `null` | `null` |
| `XmlDocument.XmlResolver` | 외부 해석 리졸버 | `null` | `null` |
| 레거시 `XmlTextReader` 직접 생성 | `XmlReader.Create`의 안전 기본값을 거치지 않는다 | 〃 | 〃 |
| `XElement.Load` / `XDocument.Load` | 내부 `XmlReader` 기본값을 따름 | 안전 | 안전 |
| `XmlSerializer.Deserialize(Stream)` | 내부 `XmlReader` 기본값을 따름 | 안전 | 안전 |

> **⚠️ 안전한 것은 "기본 설정으로 만든 `XmlReader`"이지 "모든 XML API"가 아니다**
>
> 세 가지 경우에 기본값 보호가 사라진다.
>
> 1. **`XmlReaderSettings`를 직접 만들어 `DtdProcessing`을 `Parse`로 바꿨다.** 명시적으로 문을 연 것이다.
> 2. **레거시 `XmlTextReader`를 직접 생성했다.** `XmlTextReader`는 `XmlReader.Create`와 `XmlReaderSettings`를 거치지 않는 옛 경로다. 안전 기본값이 `XmlReaderSettings`에 걸려 있으므로, 이 경로에서는 `DtdProcessing`과 `XmlResolver`를 인스턴스 프로퍼티로 직접 설정해야 한다. 신규 코드에서 `new XmlTextReader(...)`를 쓸 이유는 없다 — `XmlReader.Create`를 써라.
> 3. **.NET Framework 4.5.2 미만을 대상으로 한다.** 이 경우 `XmlDocument.XmlResolver`와 `XmlReaderSettings.XmlResolver`의 기본값이 외부 리소스를 해석한다. `.NET Framework 전용 동작`이며, 해당 환경에서는 반드시 명시적으로 `null`을 설정해야 한다.
>
> 그리고 하나 더 — **XSLT**를 쓴다면 `XslCompiledTransform`의 `XsltSettings.EnableScript`와 `EnableDocumentFunction`이 기본적으로 꺼져 있다는 사실에 의존하라. 신뢰할 수 없는 스타일시트에 `XsltSettings.TrustedXslt`를 넘기면 임의 코드 실행에 가까운 문을 여는 것이다.

> **💡 신뢰할 수 없는 XML을 받는 지점의 체크리스트**
>
> ```text
> □ XmlReader.Create를 쓰는가? (XmlTextReader 직접 생성 금지)
> □ DtdProcessing = Prohibit 인가? (Parse가 꼭 필요한가 다시 물어라)
> □ XmlResolver = null 인가? (읽을 수 없는 프로퍼티다 — 명시하라)
> □ Parse가 필요하다면 MaxCharactersFromEntities / MaxCharactersInDocument를 걸었는가?
> □ 입력 크기 자체에 상한이 있는가? (파싱 전 단계에서)
> □ 검증 오류 메시지를 그대로 사용자에게 돌려주지 않는가? (경로 노출)
> □ .NET Framework 대상이라면 4.5.2 이상인가?
> ```
>
> 이 체크리스트를 통과하는 헬퍼 하나를 만들어 두고, 코드베이스 전체가 그것만 쓰게 강제하는 것이 개별 호출부를 감시하는 것보다 훨씬 낫다.

```csharp
static class SafeXml
{
    static readonly XmlReaderSettings Settings = new() {
        DtdProcessing = DtdProcessing.Prohibit,
        XmlResolver   = null,
        IgnoreComments = true,
        IgnoreProcessingInstructions = true,
        MaxCharactersInDocument = 50_000_000 };

    public static XDocument Load (Stream s)
    {
        using XmlReader r = XmlReader.Create (s, Settings);
        return XDocument.Load (r);
    }
}
```

> **📌 JSON에는 이 공격 표면이 없다**
>
> JSON에는 엔터티도 DTD도 외부 참조도 없다. 41.1절에서 "XML은 기능이 많고 JSON은 단순하다"고 했는데, **그 기능이 곧 공격 표면**이라는 것이 이 절의 결론이다. 반대로 XML을 골라야 하는 이유도 분명히 있다 — 스키마 강제(XSD), 네임스페이스를 통한 확장, 서명·암호화 표준(XML DSig), 그리고 이미 XML로 말하는 상대방. 그때는 이 절의 스위치를 켜고 쓰면 된다.

---

## 이 장의 요약

- **XML을 다루는 길은 세 갈래다.** DOM(X-DOM)은 문서를 트리로 올려 임의 접근과 부분 갱신을 주는 대신 메모리를 쓴다. 스트리밍(`XmlReader`/`XmlWriter`)은 메모리를 상수로 유지하는 대신 전진만 가능하다. 직렬화(`XmlSerializer`/`DataContractSerializer`)는 구조가 고정된 데이터에 가장 짧은 코드를 준다. 셋은 배타적이지 않고 **섞어 쓰는 것이 실무의 정답**이다.
- **X-DOM의 타입 계층에서 `XAttribute`가 `XNode`가 아니라는 것이 가장 중요한 사실이다.** 그래서 특성은 `Nodes()`·`Descendants()`에 절대 나타나지 않고, `Attributes()`라는 별도의 통로로만 접근한다. `XObject`→`XNode`→`XContainer`→`XElement`/`XDocument`가 나머지 계층이다.
- **함수형 구성은 `params object[]`와 여섯 개의 콘텐츠 해석 규칙 위에 서 있다.** `null`은 무시되고, `IEnumerable`은 재귀적으로 펼쳐지고, 나머지는 `XmlConvert`를 거쳐 문자열이 된다. 이 규칙 덕분에 LINQ 쿼리를 생성자에 그대로 꽂을 수 있고, 조건부 요소를 `if` 없이 표현할 수 있다.
- **이미 부모가 있는 노드를 다른 부모에 넣으면 조용히 깊은 복제가 일어난다.** 예외도 경고도 없다. 노드를 재사용할 계획이라면 매번 새로 만들거나 복사 생성자로 의도를 드러내라. 주석(annotation)은 복제되지 않는다.
- **단수형은 `null`, 복수형은 빈 시퀀스.** `Element()`·`Attribute()`는 `null`을 주고 `Elements()`·`Attributes()`·`Descendants()`는 빈 시퀀스를 준다. 이 비대칭을 모르면 `NullReferenceException`과 "아무것도 안 나오는 쿼리" 사이를 오간다.
- **열거하면서 트리를 바꾸지 마라.** `.ToList()`로 스냅숏을 뜨거나, 내부적으로 버퍼링하는 시퀀스 `Remove()` 확장 메서드에 맡겨라. 증상이 예외가 아니라 "일부만 지워짐"으로 나타나기 때문에 더 위험하다.
- **`Value`를 설정하면 기존 자식이 전부 사라진다.** 읽기는 안전하고 쓰기는 파괴적인 프로퍼티다. 혼합 콘텐츠에서 `Value`를 읽고 되쓰는 것은 마크업을 통째로 날리는 손실 변환이다.
- **명시적 변환 연산자가 값 파싱의 관용구다.** `(string)`은 `null`을 통과시키고, `(int)`는 `null`에서 예외를, `(int?)`는 `null`을 준다. 요소가 존재하되 값이 잘못된 형식이면 널 가능 캐스트도 구제해 주지 못한다 — 그때는 `FormatException`이다.
- **기본 네임스페이스는 자식에게 상속되지만 X-DOM 코드에서는 상속되지 않는다.** 루트에 `xmlns`가 붙은 진짜 문서를 만나면 네임스페이스 없는 쿼리가 조용히 실패한다. `GetDefaultNamespace()`로 문서에서 읽어 오는 것이 안전하다. 접두사는 순전히 직렬화 힌트이며 의미를 바꾸지 않는다.
- **`XStreamingElement`는 "한 번만 쓰고, 순회하지 않고, 크다"는 세 조건이 다 맞을 때만 값어치가 있다.** 쿼리 평가가 `Save` 시점으로 미뤄지므로 예외 시점도 함께 옮겨 간다.
- **`XmlReader`의 두 가지 대표 함정은 특성과 빈 요소다.** `ReadStartElement` 후에는 특성이 사라지고, `<a/>`와 `<a></a>`는 `ReadEndElement` 관점에서 다르게 취급된다. `ReadElementContentAsXXX` 계열은 후자를 알아서 처리한다.
- **`XmlWriter`는 `Dispose`가 필수다.** 버퍼가 비워지지 않으면 닫는 태그 없는 파일이 남고 예외는 나지 않는다. `WriteRaw`는 이스케이프를 건너뛰므로 XML 인젝션의 입구다.
- **XXE는 XML이 JSON에 대해 갖는 고유한 공격 표면이다.** `DtdProcessing.Prohibit`과 `XmlResolver = null`이 기본 방어이고, DTD 파싱이 꼭 필요하다면 `MaxCharactersFromEntities`로 엔터티 확장 폭탄까지 막아야 한다. 현대 .NET의 `XmlReader.Create` 기본값은 안전하지만, 레거시 경로와 .NET Framework 4.5.2 미만은 그렇지 않다.

---

## 연습 문제

1. 요소 5,000개짜리 XML 파일을 만들고 `XDocument.Load`로 읽어라. 로드 전후의 `GC.GetTotalMemory(true)` 차이를 측정해 원본 파일 크기의 몇 배인지 확인하라. 그다음 요소당 텍스트 길이를 10배로 늘린 파일로 같은 측정을 반복해 **비율이 어떻게 변하는지** 설명하라.

2. 다음 코드가 왜 첫 요소 하나만 지우고 멈추는지 실행해서 확인하고(출력은 `4`가 아니라 `3`이다), 두 가지 방법으로 고쳐라.
   ```csharp
   var root = XElement.Parse ("<r><a/><a/><a/><a/></r>");
   foreach (var e in root.Elements ("a")) e.Remove();
   Console.WriteLine (root.Elements().Count());
   ```

3. `<config xmlns="http://acme.com/v1"><timeout>30</timeout></config>` 문자열을 `XElement.Parse`로 읽고, `Element("timeout")`이 `null`을 반환하는 것을 확인하라. 그다음 `GetDefaultNamespace()`를 써서 **네임스페이스가 있든 없든 동작하는** 조회 헬퍼 메서드를 작성하라.

4. `new XElement("x", 1234.5m)`와 `new XElement("x", 1234.5m.ToString())`을 `CultureInfo.CurrentCulture`를 `de-DE`로 바꾼 뒤 각각 실행하고 `Value`를 비교하라. 왜 다른지 42.4절의 규칙으로 설명하라.

5. `logentry` 요소 10만 개를 담은 XML 파일을 `XmlWriter` + `XElement.WriteTo`로 생성하라. 그다음 같은 파일을 (a) `XDocument.Load`로 통째로, (b) `XmlReader` + `XNode.ReadFrom`으로 하나씩 읽으면서 최대 메모리 사용량을 비교하라.

6. `<a/>`와 `<a></a>` 두 문자열을 `XmlReader`로 읽으면서 `ReadStartElement("a")` 다음에 `ReadEndElement()`를 호출하라. 한쪽에서만 예외가 나는 것을 확인하고 `IsEmptyElement`로 고쳐라. `XElement.Parse`로 같은 두 문자열을 읽었을 때 `IsEmpty`가 어떻게 다른지도 확인하라.

7. 빌리언 러프스 페이로드(`lol` 엔터티를 5단계까지만 중첩한 축소판)를 파일로 만들고, `DtdProcessing`을 `Prohibit`/`Ignore`/`Parse`로 각각 설정한 `XmlReader`로 읽어 보라. 셋의 동작 차이를 기록하고, `Parse`일 때 `MaxCharactersFromEntities`를 걸면 무엇이 달라지는지 확인하라. **격리된 환경에서, 중첩 단계를 늘리지 말고** 실행하라.

---

**다음 장** — 43장「네트워킹」에서는 데이터가 프로세스 밖으로 나가는 길을 다룬다. 40장의 스트림, 41장의 JSON, 이 장의 XML이 전부 `HttpClient`의 요청 본문과 응답 본문에서 다시 만난다. `HttpClient`의 수명 관리와 소켓 고갈, `HttpMessageHandler` 파이프라인, 그리고 TCP를 직접 다루는 지점까지 내려간다.
