---
title: "부록 E. 형식 문자열 레퍼런스 — 숫자, 날짜/시간, 열거형"
---

# 부록 E. 형식 문자열 레퍼런스 — 숫자, 날짜/시간, 열거형

> **이 부록의 위치** — 38장「포매팅과 파싱, 국제화」는 값과 문자열 사이의 변환 전체를 메커니즘 단위로 판다. 그 장은 **왜 그런가**를 설명하고, 이 부록은 **무엇이 있는가**만 남긴다. 지정자 하나가 기억나지 않아 장을 다시 펴는 대신 여기를 펴라. 이 부록에 새로운 사실은 없다. 모든 표는 38장에서 왔고, 각 표마다 설명이 있는 절 번호를 `(38.M절)` 형태로 달았다.
>
> **선수 지식** — 20장(열거형과 특성), 35장(문자열과 텍스트 처리), 37장(날짜와 시간), 38장(포매팅과 파싱, 국제화)
>
> **이 부록에서 다루지 않는 것** — 형식 공급자의 구조와 `ICustomFormatter`는 38.2절이다. 무할당 포매팅(`ISpanFormattable`, `IUtf8SpanFormattable`)은 38.8절, `Convert`·`XmlConvert`·`TypeConverter`·`BitConverter`는 38.9절, 국제화 테스트 전략은 38.10절, 불변 문화권 결정표의 **근거**는 38.11절이다. 정규식 언어 레퍼런스는 36.10절이며 형식 문자열과 무관하다. 날짜/시간 **타입의 의미론**(`DateTimeKind`, 시간대, DST)은 37장이다.

---

## E.1 이 표를 쓰는 법

### 형식 문자열은 두 종류뿐이다

숫자 타입과 `DateTime`/`DateTimeOffset`/`TimeSpan`이 받는 형식 문자열은 정확히 두 갈래다(38.3절).

| 종류 | 생김새 | 해석 방식 | 예 |
|---|---|---|---|
| **표준 형식 문자열** | 글자 **하나** + 선택적 정밀도 숫자 | 미리 정의된 의미로 분기 | `"C"`, `"F2"`, `"N0"`, `"D5"`, `"o"` |
| **사용자 지정 형식 문자열** | 두 글자 이상의 템플릿 | 문자를 하나씩 훑는 상태 기계 | `"#,##0.00"`, `"yyyy-MM-dd"`, `"0.00E+00"` |

이 둘을 가르는 규칙이 이 부록 전체에서 가장 자주 사고를 낸다.

> **⚠️ 한 글자짜리 문자열은 언제나 표준 형식으로 먼저 해석된다**
>
> 사용자 지정 지정자를 딱 하나만 쓰고 싶어도, 결과 문자열의 길이가 1이면 런타임은 그것을 표준 형식 문자열로 읽는다.
>
> ```csharp
> var dt = new DateTime (2000, 1, 2);
> Console.WriteLine (dt.ToString ("d"));      // "01/02/2000" — 표준 "짧은 날짜"
> Console.WriteLine (dt.ToString ("%d"));     // "2"          — 사용자 지정 "일"
> Console.WriteLine (dt.ToString ("dd"));     // "02"         — 두 글자이므로 사용자 지정
> ```
>
> 탈출구는 둘이다. **`%`를 앞에 붙이거나**, 지정자를 하나 더 붙여 길이를 2 이상으로 만들거나. `TimeSpan`에서는 한 글자 사용자 지정 형식이 아예 금지되어 있어 `"%h"`처럼 써야 한다(E.8절).

### 세 개의 축 — 형식 문자열, 형식 공급자, 파싱 플래그

| 축 | 무엇을 결정하는가 | 대표 타입 | 이 부록에서 |
|---|---|---|---|
| **형식 문자열** | *무엇을* 찍을지 — 통화인가, 백분율인가, ISO 8601인가 | `string` | E.2·E.3·E.5·E.6·E.8·E.9 |
| **형식 공급자** | *어떻게* 찍을지 — 소수점 문자, 통화 기호, 월 이름 | `CultureInfo`, `NumberFormatInfo`, `DateTimeFormatInfo` | E.1 (경고), 38.2절 |
| **파싱 플래그** | 입력에서 *무엇을 허용할지* | `NumberStyles`, `DateTimeStyles` | E.4·E.7 |

세 축은 독립이다. `"C"`는 어느 문화권에서나 "통화로 찍어라"라는 뜻이고, 실제로 찍히는 기호는 공급자가 정한다.

```csharp
NumberFormatInfo f = new NumberFormatInfo();
f.CurrencySymbol = "$$";
Console.WriteLine (3.ToString ("C", f));      // "$$ 3.00"
```

### ⚠️ 이 부록의 모든 예제 출력은 문화권에 묶여 있다

> **⚠️ 문화권을 명시하지 않은 출력은 예제가 아니라 우연이다**
>
> 이 부록의 표에서 출력 예를 볼 때마다 옆에 붙은 문화권 표기를 함께 읽어라. 표기 규약은 다음과 같다.
>
> | 표기 | 뜻 |
> |---|---|
> | **(en-US)** | 미국 영어 문화권에서의 출력. 소수점 `.`, 자릿수 구분자 `,`, 통화 `$` |
> | **(불변)** | `CultureInfo.InvariantCulture`에서의 출력. 통화 기호는 `¤`, 짧은 날짜는 `MM/dd/yyyy`, 시각은 24시간제 |
> | **(비인식)** | 형식 자체가 문화권을 보지 않는다. 어디서 돌려도 같다 |
>
> 같은 형식 문자열이 문화권에 따라 다음처럼 갈린다.
>
> | 값·형식 | en-US | de-DE | ko-KR |
> |---|---|---|---|
> | `1234.5.ToString("N2")` | `1,234.50` | `1.234,50` | `1,234.50` |
> | `1234.5.ToString("C")` | `$1,234.50` | `1.234,50 €` | `₩1,235` |
> | `new DateTime(2000,1,2).ToString("d")` | `1/2/2000` | `02.01.2000` | `2000-01-02` |
>
> 위 표의 `de-DE`·`ko-KR` 값은 ICU 데이터에서 오며 **런타임 버전과 OS의 ICU 버전에 따라 달라질 수 있다**(38.10절). 그래서 이 부록의 나머지 표는 원칙적으로 `en-US`와 불변 문화권만 예로 든다. 특정 문화권의 실제 출력이 필요하면 지어내지 말고 자기 환경에서 찍어 봐라.

### `InvariantCulture`를 언제 쓰는가

38.11절의 결론을 한 줄로 줄이면 이렇다.

> **이 문자열을 읽을 대상이 사람인가, 기계인가?**

| 자리 | 문화권 | 이유 |
|---|---|---|
| 화면에 표시할 숫자·날짜·통화 | `CurrentCulture` | 사용자의 기대에 맞춘다 |
| 사용자가 입력한 숫자·날짜 파싱 | `CurrentCulture` | 사용자가 자기 방식으로 입력한다 |
| 사용자에게 보여 줄 목록 정렬 | `CurrentCulture` | 사용자의 알파벳 순서로 |
| 파일에 저장 | `InvariantCulture` | 다른 로캘에서 다시 읽는다 |
| 네트워크 전송(JSON/XML/CSV) | `InvariantCulture` | 수신자의 로캘을 모른다 |
| 데이터베이스 리터럴 | `InvariantCulture` | 서버·클라이언트 로캘이 다르다 |
| 로그 | `InvariantCulture` | 로그는 기계가 파싱한다. 시간대는 UTC로 |
| 설정 파일(`.ini`, `.yaml`, `.env`) | `InvariantCulture` | 개발자 PC와 서버의 로캘이 다르다 |
| URL·쿼리 문자열 | `InvariantCulture` | 프로토콜의 일부다 |
| HTTP 헤더 | `InvariantCulture` 또는 RFC 형식(`"R"`) | 규격이 정한다 |
| 캐시 키·해시 입력 | `InvariantCulture` (비교는 `Ordinal`) | 같은 값이 같은 키를 내야 한다 |
| 파일 이름에 넣는 타임스탬프 | `InvariantCulture` + `"yyyyMMdd_HHmmss"` | 정렬 가능하고 파일 시스템 안전 |
| 테스트의 기대값 | `InvariantCulture` | CI 머신의 로캘이 무엇이든 통과해야 한다 |

**전체 결정표와 그 근거는 38.11절**에 있다. 이 표는 그 요약이다.

> **⚠️ `InvariantCulture`는 "문화권 없음"이 아니다**
>
> 불변 문화권도 고유한 규칙을 갖는다. 통화 기호는 `¤`(U+00A4)이고, 짧은 날짜는 **미국식으로 월이 먼저**(`MM/dd/yyyy`)다. "중립적"이라는 말이 "규칙이 없다"는 뜻은 아니다.
>
> 그래서 저장 형식을 정할 때는 불변 문화권의 `"d"`나 `"C"`에 기대지 말고 **`"o"`나 `"yyyy-MM-dd"`처럼 명시적인 패턴**을 써라. 통화는 값(`decimal`)과 통화 코드(`"KRW"`)를 따로 저장하고, 표시할 때만 서식화해라.
>
> 그리고 서식화의 `InvariantCulture`와 비교의 `StringComparison.InvariantCulture`를 혼동하지 마라. 문자열 *비교*에는 `Ordinal`이 맞다(35.4절).

> **⚠️ 형식 문자열이 잘못되면 `FormatException`이다 — 컴파일 오류가 아니다**
>
> 형식 문자열은 런타임 문자열일 뿐이고, 컴파일러는 그 내용을 해석하지 않는다(38.3절). `"yyyy-MM-DD"`도, `3.5.ToString("D2")`도 컴파일은 통과한다. 전자는 `D`가 리터럴로 출력되고, 후자는 실행 시점에 `FormatException`을 던진다.
>
> 형식 문자열 상수에 `[StringSyntax]`를 붙이면 편집기가 검사해 준다 ※.NET 7.
>
> ```csharp
> using System.Diagnostics.CodeAnalysis;
>
> [StringSyntax (StringSyntaxAttribute.DateTimeFormat)]
> const string Stamp = "yyyy-MM-dd HH:mm:ss";
> ```
>
> 인식되는 값에는 `CompositeFormat`, `DateOnlyFormat`, `DateTimeFormat`, `EnumFormat`, `GuidFormat`, `Json`, `NumericFormat`, `Regex`, `TimeOnlyFormat`, `TimeSpanFormat`, `Uri`, `Xml`이 있다.

> **💡 이 부록을 찾는 세 가지 경로**
>
> - **지정자를 안다, 의미가 궁금하다** → E.2·E.3(숫자), E.5·E.6(날짜/시간), E.8(`TimeSpan`), E.9(열거형)
> - **하고 싶은 일을 안다, 지정자를 모른다** → **E.11절의 역인덱스**부터 봐라
> - **파싱이 실패한다** → E.4(`NumberStyles`), E.7(`DateTimeStyles`)

---

## E.2 표준 숫자 형식 문자열

### 전수표

`(38.3절)` 아래 표의 출력은 모두 **en-US** 기준이다. `C`·`N`·`P`는 문화권에 따라 기호와 구분자가 바뀌고, `G`·`F`·`E`·`D`·`X`·`B`·`R`은 소수점 문자만 문화권을 탄다(`D`·`X`·`B`는 소수점 자체가 없다).

| 글자 | 의미 | 예 입력 | 결과(en-US) | 비고 |
|---|---|---|---|---|
| `G` / `g` | 일반(General) | `1.2345, "G"` | `1.2345` | 작거나 큰 수는 지수 표기로 전환 |
| | | `0.00001, "G"` | `1E-05` | 대문자 `G`는 `E`, 소문자 `g`는 `e` |
| | | `0.00001, "g"` | `1e-05` | |
| | | `1.2345, "G3"` | `1.23` | `G3`은 **유효 자릿수** 3자리로 제한 |
| | | `12345, "G3"` | `1.23E+04` | 유효 자릿수를 못 담으면 지수 표기 |
| `F` | 고정 소수점(Fixed point) | `2345.678, "F2"` | `2345.68` | `F2`는 소수점 이하 **2자리**로 반올림 |
| | | `2345.6, "F2"` | `2345.60` | 부족하면 0을 채운다 |
| `N` | 구분자 있는 고정 소수점(Numeric) | `2345.678, "N2"` | `2,345.68` | `F`와 같되 자릿수 구분자를 넣는다 |
| | | `2345.6, "N2"` | `2,345.60` | 구분자는 형식 공급자에서 온다 |
| `D` | 앞자리 0 채우기(Decimal) | `123, "D5"` | `00123` | **정수 타입 전용** |
| | | `123, "D1"` | `123` | 자릿수가 넘쳐도 자르지 않는다 |
| `E` / `e` | 지수 표기 강제 | `56789, "E"` | `5.678900E+004` | 기본 정밀도 6자리 |
| | | `56789, "e"` | `5.678900e+004` | 소문자 `e`는 지수 기호도 소문자 |
| | | `56789, "E2"` | `5.68E+004` | |
| `C` | 통화(Currency) | `1.2, "C"` | `$1.20` | 정밀도를 생략하면 공급자의 소수 자릿수 |
| | | `1.2, "C4"` | `$1.2000` | 기호·구분자 모두 공급자에서 온다 |
| `P` | 백분율(Percent) | `.503, "P"` | `50.30%` | 100을 곱하고 기호를 붙인다 |
| | | `.503, "P0"` | `50%` | 정밀도로 소수 자릿수를 덮어쓴다 |
| `X` / `x` | 16진수(Hexadecimal) | `47, "X"` | `2F` | **정수 타입 전용** |
| | | `47, "x"` | `2f` | 소문자면 자릿수도 소문자 |
| | | `47, "X4"` | `002F` | 정밀도는 최소 자릿수(앞자리 0 채우기) |
| `B` / `b` ※.NET 8 | 2진수(Binary) | `10, "B8"` | `00001010` | **정수 타입 전용** |
| `R` (또는 `G17`/`G9`) | 왕복(Round-trip) | `1f / 3f, "R"` | `0.33333334` (.NET Framework에서는 `0.333333343`) | `BigInteger`, `double`, `float`에서 사용. .NET Core 3.0 이후 `R`은 **가장 짧은 왕복 문자열**을 낸다 |

### 정밀도 지정자의 의미는 글자마다 다르다

이것이 표준 숫자 형식에서 가장 자주 틀리는 지점이다.

| 글자 | 정밀도 지정자의 의미 | 생략 시 기본값 |
|---|---|---|
| `G` | 유효 자릿수 **총합** | 타입이 왕복 가능한 최소 자릿수 |
| `F` | 소수점 **이하** 자릿수 | `NumberFormatInfo.NumberDecimalDigits` (en-US에서 2) |
| `N` | 소수점 **이하** 자릿수 | `NumberFormatInfo.NumberDecimalDigits` (en-US에서 2) |
| `C` | 소수점 **이하** 자릿수 | `NumberFormatInfo.CurrencyDecimalDigits` (en-US에서 2) |
| `P` | 소수점 **이하** 자릿수 | `NumberFormatInfo.PercentDecimalDigits` (en-US에서 2) |
| `E` | 소수점 **이하** 자릿수 | 6 |
| `D` | 결과의 **최소** 자릿수 (모자라면 앞을 0으로) | 필요한 만큼 |
| `X` | 결과의 **최소** 자릿수 (모자라면 앞을 0으로) | 필요한 만큼 |
| `B` ※.NET 8 | 결과의 **최소** 자릿수 (모자라면 앞을 0으로) | 필요한 만큼 |
| `R` | **정밀도 지정자를 받지 않는다** | — |

> **⚠️ `F2`는 "두 자리로 자른다"가 아니라 "두 자리로 반올림한다"**
>
> `2345.678.ToString("F2")`는 `2345.68`이다. 자르기(truncation)를 원했다면 서식화가 아니라 계산 단계에서 처리해야 한다. 그리고 서식화 단계의 반올림은 **`MidpointRounding.AwayFromZero`** 이며 `Math.Round`의 기본값(은행가 반올림)과 **다르다**(39.1절).
>
> ```csharp
> Console.WriteLine (Math.Round (12.345, 2));        // 12.34 — 은행가 반올림
> Console.WriteLine (12.345.ToString ("F2"));        // 12.35 — 0에서 먼 쪽으로
> ```
>
> 금액을 계산하고 표시하는 코드에서 이 불일치가 1센트짜리 회계 오차를 만든다. **계산 단계에서 반올림 정책을 정하고, 표시 단계에서는 이미 반올림된 값을 그대로 찍어라.**

> **⚠️ `D`·`X`·`B`는 정수 타입에만 쓸 수 있다**
>
> `3.5.ToString("D2")`는 `FormatException`을 던진다. `double`에는 `D` 지정자가 정의되어 있지 않기 때문이다. `X`도 마찬가지이고, `decimal`도 정수 타입이 아니므로 `X`를 못 쓴다.
>
> 반대 방향은 자유롭다 — `int`에 `"C"`나 `"P"`, `"F2"`를 쓰는 것은 정상이다. `42.ToString("C")`는 en-US에서 `$42.00`이다.

### `G`(= 형식 문자열 생략)의 동작

형식 문자열을 주지 않거나 `null` 또는 빈 문자열을 주면 **정밀도 없는 `"G"`** 를 쓴 것과 같다.

| 규칙 | 내용 |
|---|---|
| 1 | 10⁻⁴보다 작거나 그 타입의 정밀도보다 큰 수는 **지수(과학) 표기**로 나온다 |
| 2 | `float`·`double`의 정밀도 한계에 있는 마지막 두 자리는 **반올림해서 지운다** |

두 번째 규칙은 이진 표현을 십진수로 옮길 때 생기는 오차를 감추기 위한 것이며, 대체로 이롭고 눈에 띄지 않는다. 문제가 되는 것은 값을 **왕복**시킬 때다.

| 목적 | 대상 타입 | 권장 형식 |
|---|---|---|
| 왕복 (최신 런타임) | `double`, `float` | 형식 생략 (`ToString()`) — .NET Core 3.0 이후 기본이 왕복 가능 |
| 왕복 (.NET Framework 대상) | `double` | `"G17"` |
| 왕복 (.NET Framework 대상) | `float` | `"G9"` |
| 왕복 | `decimal` | 형식 생략 — 십진 값이므로 손실이 없다 |
| 왕복 | `BigInteger` | `"R"` |

> **📌 .NET Core 3.0 이후 기본 `ToString()`은 이미 왕복 가능하다** ※.NET Core 3.0
>
> .NET Core 3.0부터 `double.ToString()`과 `float.ToString()`은 **원래 값으로 정확히 되돌아가는 가장 짧은 문자열**을 만든다. 최신 런타임에서는 `R`을 붙이지 않아도 왕복이 보장된다.
>
> 이 변화 이전(.NET Framework, .NET Core 2.x)에는 `R`이 필수였고, `R` 자체에도 특정 값에서 왕복이 깨지는 알려진 결함이 있어 `G17`을 권장하던 시기가 있었다. **.NET Framework을 대상으로 하는 코드라면 `G17`(`float`은 `G9`)이 여전히 안전하다.**
>
> 이 차이 때문에 같은 `double` 값이 .NET Framework와 .NET 8에서 다른 문자열로 찍힐 수 있다. 두 런타임이 공유하는 파일 형식이 있다면 반드시 확인해라.

---

## E.3 사용자 지정 숫자 형식 문자열

### 전수표

`(38.3절)` 출력은 **en-US** 기준이다.

| 지정자 | 의미 | 예 입력 | 결과(en-US) | 비고 |
|---|---|---|---|---|
| `#` | 자릿수 자리 표시자 | `12.345, ".##"` | `12.35` | 마지막 `#` 위치에서 반올림 |
| | | `12.345, ".####"` | `12.345` | 값이 없으면 아무것도 안 찍는다 |
| `0` | 0 자리 표시자 | `12.345, ".00"` | `12.35` | `#`과 같되 |
| | | `12.345, ".0000"` | `12.3450` | 뒤쪽 0을 채우고 |
| | | `99, "000.00"` | `099.00` | 앞쪽 0도 채운다 |
| `.` | 소수점 | 위 예 참조 | | 실제 문자는 `NumberDecimalSeparator` |
| `,` | 자릿수 구분자 | `1234, "#,###,###"` | `1,234` | 기호는 `NumberGroupSeparator` |
| | | `1234, "0,000,000"` | `0,001,234` | |
| `,` (승수) | 1000으로 나누기 | `1000000, "#,"` | `1000` | 형식 문자열 **끝** 또는 소수점 바로 앞 |
| | | `1000000, "#,,"` | `1` | 개수만큼 1000으로 나눈다 |
| `%` | 백분율 표기 | `0.6, "00%"` | `60%` | 먼저 100을 곱하고 `PercentSymbol`을 넣는다 |
| `‰` | 천분율 표기 | `0.6, "00‰"` | `600‰` | 1000을 곱하고 `PerMilleSymbol`을 넣는다 |
| `E0` `e0` `E+0` `e+0` `E-0` `e-0` | 지수 표기 | `1234, "0E0"` | `1E3` | `+`는 부호를 항상 표시 |
| | | `1234, "0E+0"` | `1E+3` | `-`는 음수일 때만 표시 |
| | | `1234, "0.00E00"` | `1.23E03` | `0`의 개수가 지수 최소 자릿수 |
| | | `1234, "0.00e00"` | `1.23e03` | |
| `\` | 리터럴 문자 이스케이프 | `50, @"\#0"` | `#50` | 축자 문자열(`@`)과 함께 쓰거나 `\\`로 |
| `'xx'` `"xx"` | 리터럴 문자열 | `50, "0 '...'"` | `50 ...` | 따옴표 안은 그대로 출력 |
| `;` | 섹션 구분자 | `15, "#;(#);zero"` | `15` | 양수 |
| | | `-5, "#;(#);zero"` | `(5)` | 음수 |
| | | `0, "#;(#);zero"` | `zero` | 0 |
| 그 외 문자 | 리터럴 | `35.2, "$0 . 00c"` | `$35 . 20c` | 지정자가 아닌 문자는 그대로 |

> **⚠️ `#`만으로 이루어진 형식은 0을 빈 문자열로 만든다**
>
> ```csharp
> Console.WriteLine (0.ToString ("#"));       // ""    ← 빈 문자열
> Console.WriteLine (0.ToString ("#.##"));    // ""
> Console.WriteLine (0.ToString ("0.##"));    // "0"
> ```
>
> `#`은 "값이 있으면 찍고 없으면 생략"이라는 뜻이므로, 값이 0이면 찍을 자릿수가 없다. **0이 사라지면 안 되는 자리에는 정수부에 반드시 `0`을 하나 이상 넣어라.** 화면에 아무것도 안 나오는 버그의 흔한 원인이다.

### `,`의 두 얼굴 — 구분자인가 배율인가

쉼표 하나가 위치에 따라 전혀 다른 일을 한다. 이 부록에서 가장 헷갈리는 지정자다.

| 쉼표의 위치 | 역할 | 예 | 결과(en-US) |
|---|---|---|---|
| 자릿수 자리 표시자 **사이** | 자릿수 구분자를 켠다 | `1234567, "#,###"` | `1,234,567` |
| 형식 문자열 **끝** | 값을 1000으로 나눈다 | `1234567, "#,"` | `1235` |
| 형식 문자열 끝에 **두 개** | 값을 1,000,000으로 나눈다 | `1234567, "#,,"` | `1` |
| **소수점 바로 앞** | 값을 1000으로 나눈다 | `1234567, "#,.00"` | `1234.57` |
| 둘 다 | 나눈 뒤 구분자를 넣는다 | `1234567890, "#,##0,,"` | `1,235` |

핵심 규칙은 이것이다 — **쉼표 오른쪽에 자릿수 자리 표시자(`#` 또는 `0`)가 없으면 배율 지정자다.** 있으면 구분자다.

> **⚠️ `"#,###,"` 같은 형식은 의도치 않게 1000으로 나눈다**
>
> 자릿수 구분자를 넉넉히 깔아 두려고 형식 문자열 끝에 쉼표를 하나 더 붙이는 실수가 흔하다. 끝의 쉼표는 구분자가 아니라 **배율 지정자**로 해석되어 값이 1000분의 1이 된다.
>
> ```csharp
> Console.WriteLine (1234567.ToString ("#,###"));    // "1,234,567" — 맞다
> Console.WriteLine (1234567.ToString ("#,###,"));   // "1,235"     — 1000으로 나뉘었다
> ```
>
> 구분자를 켜는 데는 쉼표 **하나면 충분하다.** `"#,##0.00"`이 실무 표준 템플릿이다.

> **⚠️ `%`와 `‰`는 값을 곱한다 — 이미 백분율인 값에 쓰면 100배가 된다**
>
> `0.6.ToString("00%")`는 `60%`다. 값이 이미 `60`(퍼센트 단위)이라면 `60.ToString("00%")`는 `6000%`가 된다. 백분율 계산을 어느 단계에서 하는지 팀 안에서 못 박아 두지 않으면 반드시 사고가 난다.
>
> 곱하지 않고 `%` 기호만 붙이고 싶다면 리터럴로 이스케이프해라.
>
> ```csharp
> Console.WriteLine (60.ToString (@"0\%"));      // "60%"  — 곱하지 않는다
> Console.WriteLine (60.ToString ("0'%'"));      // "60%"  — 같은 결과
> Console.WriteLine (0.6.ToString ("0%"));       // "60%"  — 100을 곱한다
> ```

### 지수 표기 지정자의 조합

| 형식 | 지수 부호 | 지수 최소 자릿수 | `1234`의 결과(en-US) |
|---|---|---|---|
| `"0E0"` | 음수일 때만 | 1 | `1E3` |
| `"0E+0"` | 항상 | 1 | `1E+3` |
| `"0E-0"` | 음수일 때만 | 1 | `1E3` |
| `"0.00E00"` | 음수일 때만 | 2 | `1.23E03` |
| `"0.00e00"` | 음수일 때만 (소문자 `e`) | 2 | `1.23e03` |

지수부의 `0` 개수가 **지수 자체의 최소 자릿수**를 정한다. 가수부의 자리 표시자와 헷갈리지 마라 — `"0.00E00"`에서 앞의 `0.00`은 가수, 뒤의 `00`은 지수다.

### 세미콜론 3섹션

`;`로 나뉜 섹션의 **개수**에 따라 의미가 달라진다.

| 섹션 수 | 첫째 섹션 | 둘째 섹션 | 셋째 섹션 |
|---|---|---|---|
| 1 | 모든 값 | — | — |
| 2 | 양수와 **0** | 음수 | — |
| 3 | 양수 | 음수 | 0 |

> **⚠️ 섹션이 2개 이상이면 음수 부호가 사라진다**
>
> 섹션을 두 개 이상 쓰면 음수 섹션에는 **부호가 자동으로 붙지 않는다.** 음수 값의 절댓값이 그 섹션의 템플릿으로 서식화될 뿐이다.
>
> ```csharp
> Console.WriteLine ((-5).ToString ("#;#"));      // "5"   ← 부호가 없다
> Console.WriteLine ((-5).ToString ("#;-#"));     // "-5"  ← 직접 넣어야 한다
> Console.WriteLine ((-5).ToString ("#;(#)"));    // "(5)"
> ```
>
> 회계 표기(`(1,234)`)를 만들 때 이 성질이 유용하지만, 모르고 쓰면 **음수가 양수처럼 보이는 치명적인 버그**가 된다. 섹션을 쓰는 형식 문자열은 반드시 음수 입력으로 한 번 테스트해라.

> **⚠️ 2섹션 형식에서 0은 양수 섹션으로 간다**
>
> `"#;(#)"`에 0을 넣으면 첫째 섹션이 적용되고, `#`만 있으므로 **빈 문자열**이 나온다. 0을 따로 다루려면 반드시 셋째 섹션까지 써라. `"#,##0.00;(#,##0.00);-"`처럼 0에 대시를 찍는 것이 회계 보고서의 관례다.

### 이스케이프 규칙

| 방법 | 문법 | 예 | 결과 |
|---|---|---|---|
| 한 문자 이스케이프 | `\문자` | `50, @"\#0"` | `#50` |
| C# 일반 문자열에서 | `\\문자` | `50, "\\#0"` | `#50` |
| 리터럴 문자열(작은따옴표) | `'문자열'` | `50, "0 '...'"` | `50 ...` |
| 리터럴 문자열(큰따옴표) | `"문자열"` | `50, "0 \"원\""` | `50 원` |
| 지정자가 아닌 문자 | 그냥 쓴다 | `35.2, "$0 . 00c"` | `$35 . 20c` |

이스케이프가 필요한 문자는 **사용자 지정 지정자로 쓰이는 문자**뿐이다. 숫자 형식에서는 `# 0 . , % ‰ E e \ ' "` 그리고 `;`가 그렇다. 그 외의 문자는 이스케이프 없이도 리터럴로 나온다.

### 조합 예제표

실무에서 쓰는 조합이다. 출력은 **en-US** 기준이며, 소수점·구분자는 문화권에 따라 바뀐다.

| 목적 | 형식 문자열 | 입력 | 결과(en-US) |
|---|---|---|---|
| 금액 (기호 없이, 두 자리 고정) | `"#,##0.00"` | `1234.5` | `1,234.50` |
| 금액 (0을 `0.00`으로) | `"#,##0.00"` | `0` | `0.00` |
| 금액 (회계 음수 표기) | `"#,##0.00;(#,##0.00)"` | `-1234.5` | `(1,234.50)` |
| 금액 (0은 대시) | `"#,##0.00;(#,##0.00);-"` | `0` | `-` |
| 정수 천 단위 구분 | `"#,##0"` | `1234.5678` | `1,235` |
| 부호 항상 표시 | `"+0;-0"` | `5` | `+5` |
| 부호 항상 표시 | `"+0;-0"` | `-5` | `-5` |
| 고정 폭 ID | `"0000"` | `7` | `0007` |
| 백만 단위 축약 | `"#,##0,,\"M\""` | `12345678` | `12M` |
| 백분율 (소수 두 자리) | `"0.00%"` | `0.1234` | `12.34%` |
| 백분율 (정수) | `"0%"` | `0.5` | `50%` |
| 전화번호 | `"(###) ###-####"` | `1234567890` | `(123) 456-7890` |
| 소수 이하 최대 3자리, 뒤 0 제거 | `"0.###"` | `1.5` | `1.5` |
| 소수 이하 최대 3자리, 뒤 0 제거 | `"0.###"` | `1.5000` | `1.5` |
| 지수 표기 고정 | `"0.000E+00"` | `1234` | `1.234E+03` |
| 단위 붙이기 | `"0.0' MB'"` | `12.34` | `12.3 MB` |

---

## E.4 `NumberStyles` 파싱 플래그

### 무엇을 통제하는가

`(38.4절)` 모든 숫자 타입은 `NumberStyles` 인자를 받는 정적 `Parse`/`TryParse`를 정의한다. `NumberStyles`는 `System.Globalization`의 **플래그 열거형**(20.3절)이고, 문자열이 숫자로 읽힐 때 **무엇을 허용할지**를 결정한다.

핵심 규칙은 하나다 — **허용하지 않은 문자가 하나라도 있으면 `FormatException`이다.** 서식화는 관대하지만 파싱은 엄격하다.

### 개별 플래그 전수표

| 플래그 | 값 | 허용하는 것 | 관련 `NumberFormatInfo` 속성 |
|---|---|---|---|
| `None` | 0 | 아무것도 — 숫자 자릿수만 | — |
| `AllowLeadingWhite` | 1 | 앞쪽 공백 | — |
| `AllowTrailingWhite` | 2 | 뒤쪽 공백 | — |
| `AllowLeadingSign` | 4 | 앞쪽 부호 | `PositiveSign`, `NegativeSign` |
| `AllowTrailingSign` | 8 | 뒤쪽 부호 | 위와 같음 |
| `AllowParentheses` | 16 | 음수를 뜻하는 괄호 | — |
| `AllowDecimalPoint` | 32 | 소수점 | `NumberDecimalSeparator`, `CurrencyDecimalSeparator` |
| `AllowThousands` | 64 | 자릿수 구분자 | `NumberGroupSeparator`, `NumberGroupSizes` |
| `AllowExponent` | 128 | 지수 표기(`1e6`) | `PositiveSign`, `NegativeSign` |
| `AllowCurrencySymbol` | 256 | 통화 기호 | `CurrencySymbol` |
| `AllowHexSpecifier` | 512 | 16진수 자릿수(`A`~`F`) | — |
| `AllowBinarySpecifier` ※.NET 8 | 1024 | 2진수 자릿수(`0`, `1`) | — |

### 조합 상수 전수표

`None`을 제외한 모든 조합 값은 `AllowLeadingWhite`와 `AllowTrailingWhite`를 **항상** 포함한다.

| 조합 상수 | 포함하는 플래그 |
|---|---|
| `None` | (없음) |
| `Integer` | `AllowLeadingWhite`, `AllowTrailingWhite`, `AllowLeadingSign` |
| `Number` | `Integer` + `AllowTrailingSign`, `AllowDecimalPoint`, `AllowThousands` |
| `Float` | `Integer` + `AllowDecimalPoint`, `AllowExponent` |
| `Currency` | `Number` + `AllowParentheses`, `AllowCurrencySymbol` |
| `Any` | `Currency` + `AllowExponent` (= `AllowHexSpecifier`·`AllowBinarySpecifier`를 뺀 전부) |
| `HexNumber` | `AllowLeadingWhite`, `AllowTrailingWhite`, `AllowHexSpecifier` |
| `BinaryNumber` ※.NET 8 | `AllowLeadingWhite`, `AllowTrailingWhite`, `AllowBinarySpecifier` |

```text
                 AllowLeadingWhite + AllowTrailingWhite  (None을 제외한 전부에 포함)
                                   │
  ┌────────────────────────────────┼──────────────────────────────┐
  │                                │                              │
Integer                        HexNumber                    BinaryNumber
  + AllowLeadingSign             + AllowHexSpecifier          + AllowBinarySpecifier
  │
  ├─────────────────────┐
  │                     │
Number                 Float
  + AllowTrailingSign     + AllowDecimalPoint
  + AllowDecimalPoint     + AllowExponent
  + AllowThousands
  │
  ▼
Currency
  + AllowParentheses
  + AllowCurrencySymbol
  │
  ▼
Any
  + AllowExponent
```

**조합 `NumberStyles`의 포함 관계** — 실무에서 자주 쓰는 셋은 `Integer`, `Float`, `Currency`다.

### 타입별 기본 파싱 플래그

플래그를 지정하지 않고 `Parse`/`TryParse`를 부르면 타입마다 다른 기본값이 적용된다.

| 타입 | 기본 `NumberStyles` | 결과적으로 허용되는 것 |
|---|---|---|
| `int`, `long`, `short`, `byte`, `sbyte`, `uint`, `ulong`, `ushort`, `nint`, `nuint`, `Int128`, `UInt128`, `BigInteger` | `Integer` | 공백, 앞쪽 부호 |
| `float`, `double`, `Half` | `Float \| AllowThousands` | 공백, 앞쪽 부호, 소수점, 지수, 자릿수 구분자 |
| `decimal` | `Number` | 공백, 앞뒤 부호, 소수점, 자릿수 구분자 (**지수는 불가**) |

> **⚠️ `decimal.Parse("3e6")`은 기본값으로 실패한다**
>
> `decimal`의 기본 스타일은 `Number`이고 `Number`에는 `AllowExponent`가 없다. 반면 `double.Parse("3e6")`은 성공한다. **같은 문자열이 타입에 따라 성공하기도 실패하기도 한다.**
>
> ```csharp
> double d = double.Parse ("3e6");                            // 3000000
> decimal m = decimal.Parse ("3e6");                          // FormatException
> decimal ok = decimal.Parse ("3e6", NumberStyles.Any);       // 3000000
> ```
>
> 반대로 `int.Parse("1,000")`도 실패한다 — `Integer`에 `AllowThousands`가 없기 때문이다. `double.Parse("1,000")`은 성공해서 1000이 된다(단, 문화권에 따라 다르다).

### 사용 예

```csharp
int thousand    = int.Parse ("3E8", NumberStyles.HexNumber);
int minusTwo    = int.Parse ("(2)", NumberStyles.Integer |
                                    NumberStyles.AllowParentheses);
double aMillion = double.Parse ("1,000,000", NumberStyles.Any);
decimal threeMillion = decimal.Parse ("3e6", NumberStyles.Any);
decimal fivePointTwo = decimal.Parse ("$5.20", NumberStyles.Currency);
```

위 예에는 형식 공급자를 넘기지 않았으므로 **로컬 통화 기호·구분자·소수점**이 적용된다. 기계가 만든 데이터를 읽는 코드라면 공급자를 반드시 명시해라.

> **⚠️ `AllowHexSpecifier`에 `0x` 접두사를 붙이면 실패한다**
>
> `AllowHexSpecifier`는 16진 **자릿수**를 허용할 뿐, C# 소스의 `0x` 접두사를 알지 못한다.
>
> ```csharp
> int.Parse ("0x1E", NumberStyles.HexNumber);   // FormatException
> int.Parse ("1E",   NumberStyles.HexNumber);   // 30
> ```
>
> 또한 `AllowHexSpecifier`는 `AllowLeadingSign`과 **함께 쓸 수 없다.** 함께 켜고 파싱을 시도하면 `ArgumentException`이 난다. 16진 문자열의 음수는 최상위 비트로 표현되기 때문이다 — `int.Parse("FFFFFFFF", NumberStyles.HexNumber)`는 `-1`이다.

> **⚠️ `AllowThousands`는 구분자의 *위치*를 검사하지 않는다**
>
> `double.Parse("1,0,0,0", NumberStyles.Any)`는 예외 없이 1000을 낸다. 파서는 구분자를 만나면 그냥 건너뛴다. 즉 **`NumberStyles`는 검증 도구가 아니다.** 입력 형식을 엄격히 강제해야 한다면 정규식(36장)으로 먼저 검사하거나, 필요한 플래그만 최소로 켜라.

### 파싱은 서식화의 정확한 역함수가 아니다

서식화는 `NumberFormatInfo`의 패턴 속성(`CurrencyNegativePattern` 등)을 따라 정확히 한 가지 결과를 만들지만, 파싱은 여러 표현을 **관대하게** 받아들인다. 그래서 "`ToString`한 결과가 `Parse`로 되돌아온다"는 보장이 없다.

| 값 | `ToString("C")` (en-US) | `Parse(…, NumberStyles.Currency)` | 왕복? |
|---|---|---|---|
| `1234.5m` | `$1,234.50` | 성공 | 예 |
| `-1234.5m` | `($1,234.50)` | 성공 (`AllowParentheses` 포함) | 예 |
| `1234.5m` | `$1,234.50` | `NumberStyles.Number`로 파싱 | **실패** — 통화 기호 |
| `double.NaN` | `NaN` | `double.Parse("NaN")` | 예 (`NaNSymbol` 일치 시) |
| `double.PositiveInfinity` | `∞` | `double.Parse("∞")` | 문화권이 같아야 성공 |

> **💡 `NumberStyles`는 최소로 켜는 것이 원칙이다**
>
> `NumberStyles.Any`는 편해 보이지만 통화 기호·괄호·자릿수 구분자를 전부 허용하므로, 잘못된 입력이 조용히 통과한다. `Any`를 쓰는 코드는 사실상 "입력을 검증하지 않겠다"고 선언하는 것이다.
>
> 기계가 만든 데이터를 읽을 때의 기본값은 이것이다.
>
> ```csharp
> // 정수 필드: 부호도 공백도 허용하지 않는다
> bool ok = int.TryParse (field, NumberStyles.None,
>                         CultureInfo.InvariantCulture, out int v);
>
> // 실수 필드: 부호와 소수점만
> bool ok2 = double.TryParse (field,
>                             NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
>                             CultureInfo.InvariantCulture, out double d);
> ```
>
> 공급자를 반드시 함께 넘긴다. **플래그만 지정하고 공급자를 생략하면 여전히 `CurrentCulture`가 적용되어 소수점 문자가 뒤바뀐다.**

---

## E.5 표준 날짜/시간 형식 문자열

### 두 그룹

`(38.5절)` `DateTime`/`DateTimeOffset`의 표준 형식 문자열은 **문화권과 형식 공급자 설정을 존중하는가**를 기준으로 두 그룹으로 갈린다. 이 구분이 날짜 서식에서 가장 중요한 사실이다.

아래 표의 예시 출력은 다음 값을 서식화한 결과이며, 문화권 인식 형식은 **불변 문화권** 기준이다.

```csharp
new DateTime (2000, 1, 2, 17, 18, 19);
```

### 문화권 인식 표준 형식 문자열

| 형식 문자열 | 의미 | 예 출력(불변) | 대응 `DateTimeFormatInfo` 속성 |
|---|---|---|---|
| `d` | 짧은 날짜 | `01/02/2000` | `ShortDatePattern` |
| `D` | 긴 날짜 | `Sunday, 02 January 2000` | `LongDatePattern` |
| `t` | 짧은 시각 | `17:18` | `ShortTimePattern` |
| `T` | 긴 시각 | `17:18:19` | `LongTimePattern` |
| `f` | 긴 날짜 + 짧은 시각 | `Sunday, 02 January 2000 17:18` | `LongDatePattern` + `ShortTimePattern` |
| `F` | 긴 날짜 + 긴 시각 | `Sunday, 02 January 2000 17:18:19` | `FullDateTimePattern` |
| `g` | 짧은 날짜 + 짧은 시각 | `01/02/2000 17:18` | `ShortDatePattern` + `ShortTimePattern` |
| `G` (기본값) | 짧은 날짜 + 긴 시각 | `01/02/2000 17:18:19` | `ShortDatePattern` + `LongTimePattern` |
| `m`, `M` | 월과 일 | `02 January` | `MonthDayPattern` |
| `y`, `Y` | 연과 월 | `January 2000` | `YearMonthPattern` |

이 그룹의 출력은 **문화권마다 완전히 다르다.** 사람에게 보여 줄 자리에만 써라. 파일이나 네트워크로 나가는 문자열에 `"d"`를 쓰는 것이 이 부록이 지적하는 사고 중 가장 흔한 것이다.

### 문화권 비인식 표준 형식 문자열

| 형식 문자열 | 의미 | 예 출력 | 비고 |
|---|---|---|---|
| `o`, `O` | 왕복(round-trippable) | `2000-01-02T17:18:19.0000000` | `DateTimeKind`가 `Unspecified`가 아니면 시간대 정보를 덧붙인다 |
| `r`, `R` | RFC 1123 표준 | `Sun, 02 Jan 2000 17:18:19 GMT` | UTC로 **직접** 변환해야 한다(`DateTime.ToUniversalTime`) |
| `s` | 정렬 가능, ISO 8601 | `2000-01-02T17:18:19` | 텍스트 정렬과 호환된다 |
| `u` | "범용" 정렬 가능 | `2000-01-02 17:18:19Z` | 위와 비슷하되 UTC로 직접 변환해야 한다 |
| `U` | UTC | `Sunday, 02 January 2000 17:18:19` | 긴 날짜 + 긴 시각을 UTC로 변환해서 출력 |

### `"O"`와 `"s"`와 `"R"`의 차이

세 형식 모두 "기계가 읽을 날짜"에 쓰이지만, 담는 정보가 다르다. 저장 형식을 고를 때 이 표만 보면 된다.

| 항목 | `"o"` / `"O"` | `"s"` | `"R"` / `"r"` |
|---|---|---|---|
| 패턴 (`DateTime`) | `yyyy-MM-ddTHH:mm:ss.fffffffK` | `yyyy'-'MM'-'dd'T'HH':'mm':'ss` | `ddd, dd MMM yyyy HH':'mm':'ss 'GMT'` |
| 대응 `DateTimeFormatInfo` 속성 | (고정) | `SortableDateTimePattern` | `RFC1123Pattern` |
| 소수 초 | 7자리 항상 | 없음 | 없음 |
| 시간대 표기 | `Kind`에 따라 `Z` / 오프셋 / 없음 | 없음 | 리터럴 `GMT` |
| UTC 자동 변환 | **하지 않는다** | 하지 않는다 | **하지 않는다** |
| `Kind` 왕복 | `RoundtripKind`로 파싱하면 복원 | 복원 불가(`Unspecified`) | 복원 불가 |
| 텍스트 정렬 = 시간 정렬 | 예 | 예 | **아니오** |
| 요일·월 이름 포함 | 아니오 | 아니오 | **예**(영어 고정) |
| 용도 | 값의 완전한 왕복 저장 | 정렬 가능한 로그·파일명 | HTTP 헤더(`Date`, `Last-Modified`) |

> **⚠️ `r`·`R`·`u`는 UTC라고 써 놓고 변환은 안 해 준다**
>
> 이 셋은 UTC를 암시하는 접미사(`GMT`, `Z`)를 출력하지만, **로컬 `DateTime`을 UTC로 자동 변환하지 않는다.** 즉 서울 시각 17:18을 `"R"`로 찍으면 `Sun, 02 Jan 2000 17:18:19 GMT`가 나온다. 실제 UTC는 08:18인데도 그렇다. **9시간 틀린 문자열**이 만들어진다.
>
> 반대로 `"U"`는 UTC로 **자동 변환하지만 시간대 접미사를 쓰지 않는다.** 정확한 시점을 담지만 그 사실이 문자열에 드러나지 않는다.
>
> 이 그룹에서 개입 없이 명확한 `DateTime`을 쓸 수 있는 지정자는 **`"o"` 하나뿐이다.**
>
> ```csharp
> var local = new DateTime (2000, 1, 2, 17, 18, 19, DateTimeKind.Local);
> Console.WriteLine (local.ToString ("R"));                       // 17:18:19 GMT — 틀렸다
> Console.WriteLine (local.ToUniversalTime().ToString ("R"));     // 08:18:19 GMT — 맞다
> Console.WriteLine (local.ToString ("o"));                       // 2000-01-02T17:18:19.0000000+09:00
> ```

### `"o"`가 `DateTimeKind`를 인코딩하는 방식

| `Kind` | `"o"` 출력 접미사 | 되읽을 때 |
|---|---|---|
| `Utc` | `Z` | `RoundtripKind`로 파싱하면 `Utc` 복원 |
| `Local` | 실제 오프셋 (예: `+09:00`) | `RoundtripKind`로 파싱하면 `Local` 복원 |
| `Unspecified` | 없음 | `Unspecified` 그대로 |

`DateTimeOffset`은 `Kind` 개념이 없으므로 `"o"`가 언제나 오프셋을 붙인다(37.5절).

### 왕복 가능 여부 한눈에

| 형식 | 문화권 의존 | 날짜 | 시각 | 소수 초 | 시간대 | 왕복 가능 |
|---|---|---|---|---|---|---|
| `d` | 예 | 예 | 아니오 | 아니오 | 아니오 | 아니오 |
| `D` | 예 | 예 | 아니오 | 아니오 | 아니오 | 아니오 |
| `t` | 예 | 아니오 | 분까지 | 아니오 | 아니오 | 아니오 |
| `T` | 예 | 아니오 | 초까지 | 아니오 | 아니오 | 아니오 |
| `f` | 예 | 예 | 분까지 | 아니오 | 아니오 | 아니오 |
| `F` | 예 | 예 | 초까지 | 아니오 | 아니오 | 아니오 |
| `g` | 예 | 예 | 분까지 | 아니오 | 아니오 | 아니오 |
| `G` | 예 | 예 | 초까지 | 아니오 | 아니오 | 아니오 |
| `m`, `M` | 예 | 월·일만 | 아니오 | 아니오 | 아니오 | 아니오 |
| `y`, `Y` | 예 | 연·월만 | 아니오 | 아니오 | 아니오 | 아니오 |
| `o`, `O` | 아니오 | 예 | 초까지 | **7자리** | **예** | **예** |
| `r`, `R` | 아니오 | 예 | 초까지 | 아니오 | 리터럴 `GMT` | 아니오 |
| `s` | 아니오 | 예 | 초까지 | 아니오 | 아니오 | 부분 (`Kind` 소실) |
| `u` | 아니오 | 예 | 초까지 | 아니오 | 리터럴 `Z` | 부분 (수동 변환 필요) |
| `U` | 아니오 | 예 | 초까지 | 아니오 | 아니오 | 아니오 |

> **📌 `"s"`와 `"u"`는 텍스트 정렬이 곧 시간 정렬이다**
>
> `yyyy-MM-dd` 순서는 자릿수가 고정되어 있고 큰 단위가 앞에 오므로, **문자열을 서수 비교로 정렬하면 시간순 정렬이 된다.** 파일 이름이나 로그 키에 시각을 넣을 때 이 성질이 유용하다. `"o"`도 같은 성질을 갖는다.
>
> 반대로 `"d"`(`01/02/2000`)나 `"R"`(`Sun, 02 Jan 2000`)은 정렬하면 뒤죽박죽이 된다.

> **💡 저장·전송에는 `"o"`, 로그·파일명에는 `"yyyy-MM-dd HH:mm:ss"` 또는 `"yyyyMMdd_HHmmss"`**
>
> `"o"`는 정보를 하나도 잃지 않지만 사람이 읽기에 길다(소수 초 7자리). 로그 줄이나 파일 이름처럼 사람도 읽는 자리에는 명시적 사용자 지정 패턴이 낫다. 어느 쪽이든 **불변 문화권을 함께 넘겨라.**
>
> ```csharp
> var iv = CultureInfo.InvariantCulture;
> string wire = dto.ToString ("o", iv);                        // 전송·저장
> string log  = utc.ToString ("yyyy-MM-dd HH:mm:ss", iv);      // 로그(시각은 UTC로)
> string name = utc.ToString ("yyyyMMdd_HHmmss", iv);          // 파일 이름
> ```

### `ParseExact`와 `Parse`

| 메서드 | 형식 요구 | 받아들이는 것 | 실패 시 |
|---|---|---|---|
| `DateTime.Parse(s, provider, styles)` | 없음 | `"o"` 형식과 공급자 문화권 형식을 **둘 다** 암묵적으로 | `FormatException` |
| `DateTime.ParseExact(s, format, provider, styles)` | 정확히 일치 | 지정한 형식 하나만 | `FormatException` |
| `DateTime.ParseExact(s, formats[], provider, styles)` | 배열 중 하나와 일치 | 순서대로 시도 | `FormatException` |
| `DateTime.TryParse(…)` | 없음 | 위와 같음 | `false` |
| `DateTime.TryParseExact(…)` | 정확히 일치 | 위와 같음 | `false` |

> **💡 파싱할 문자열의 형식을 안다면 `ParseExact`가 낫다**
>
> 형식이 틀렸을 때 예외가 던져진다는 뜻이고, 이는 날짜가 잘못 해석될 위험을 감수하는 것보다 대체로 낫다. **조용히 틀린 날짜가 데이터베이스에 들어가는 것보다 요란하게 실패하는 편이 싸다.**
>
> ```csharp
> string[] formats = { "yyyy-MM-dd", "yyyy/MM/dd", "yyyyMMdd" };
> bool ok = DateTime.TryParseExact (input, formats,
>                                   CultureInfo.InvariantCulture,
>                                   DateTimeStyles.None, out DateTime result);
> ```

---

## E.6 사용자 지정 날짜/시간 형식 문자열

### 날짜 구성 요소

`(38.5절)` 출력은 `2000-01-02`, **en-US** 기준이다.

| 지정자 | 의미 | 예 출력(en-US) |
|---|---|---|
| `d` | 일 (1~31, 앞자리 0 없음) | `2` |
| `dd` | 일 (01~31, 앞자리 0 채움) | `02` |
| `ddd` | 요일 약칭 | `Sun` |
| `dddd` | 요일 전체 이름 | `Sunday` |
| `M` | 월 (1~12) | `1` |
| `MM` | 월 (01~12) | `01` |
| `MMM` | 월 약칭 | `Jan` |
| `MMMM` | 월 전체 이름 | `January` |
| `y` | 연도 마지막 두 자리, 앞자리 0 없음 | `0` |
| `yy` | 연도 마지막 두 자리 | `00` |
| `yyy` | 최소 세 자리 연도 | `2000` |
| `yyyy` | 네 자리 연도 | `2000` |
| `yyyyy` | 다섯 자리 연도 | `02000` |
| `g`, `gg` | 연호(era) | `A.D.` |

### 시각 구성 요소

출력은 `17:18:19.1234567` 기준이다.

| 지정자 | 의미 | 예 출력 |
|---|---|---|
| `h` | 12시간제 시 (1~12) | `5` |
| `hh` | 12시간제 시 (01~12) | `05` |
| `H` | 24시간제 시 (0~23) | `17` |
| `HH` | 24시간제 시 (00~23) | `17` |
| `m` | 분 (0~59) | `18` |
| `mm` | 분 (00~59) | `18` |
| `s` | 초 (0~59) | `19` |
| `ss` | 초 (00~59) | `19` |
| `f` ~ `fffffff` | 소수 초, **0을 포함해 항상 출력** | `f`→`1`, `fff`→`123`, `fffffff`→`1234567` |
| `F` ~ `FFFFFFF` | 소수 초, **뒤쪽 0은 생략** | 값이 `.1200000`이면 `FFF`→`12` |
| `t` | AM/PM 지정자의 첫 글자 | `P` |
| `tt` | AM/PM 지정자 전체 | `PM` |

### 오프셋·`Kind` 구성 요소

| 지정자 | 의미 | `DateTime`에서 | `DateTimeOffset`에서 |
|---|---|---|---|
| `z` | UTC 오프셋 시 (부호 포함, 앞자리 0 없음) | 로컬 시간대 오프셋 | 값의 오프셋 |
| `zz` | UTC 오프셋 시 (두 자리) | `+09` | `+09` |
| `zzz` | UTC 오프셋 시:분 | `+09:00` | `+09:00` |
| `K` | `Kind`에 따른 시간대 표기 | `Utc`→`Z`, `Local`→`+09:00`, `Unspecified`→빈 문자열 | 항상 오프셋 |

> **⚠️ `z`는 `DateTime`에서 거짓말을 한다**
>
> `DateTime`은 오프셋을 저장하지 않는다(37.2절). 그런데 `z`/`zz`/`zzz`는 값을 요구받으면 **실행 중인 컴퓨터의 로컬 시간대 오프셋**을 찍는다. `Kind`가 `Unspecified`든 `Utc`든 상관없이 그렇다.
>
> ```csharp
> var utc = new DateTime (2000, 1, 2, 17, 18, 19, DateTimeKind.Utc);
> Console.WriteLine (utc.ToString ("HH:mm zzz"));    // 서울 PC에서 "17:18 +09:00" — 틀렸다
> Console.WriteLine (utc.ToString ("HH:mm K"));      // "17:18 Z" — 맞다
> ```
>
> **`DateTime`에는 `z` 대신 `K`를 써라.** 오프셋이 진짜로 필요하다면 애초에 `DateTimeOffset`을 써야 한다.

### 구분자와 리터럴

| 지정자 | 의미 |
|---|---|
| `:` | 시간 구분자 — 실제 문자는 `DateTimeFormatInfo.TimeSeparator` |
| `/` | 날짜 구분자 — 실제 문자는 `DateTimeFormatInfo.DateSeparator` |
| `'문자열'` `"문자열"` | 리터럴 문자열 (그대로 출력) |
| `\문자` | 다음 한 문자를 리터럴로 |
| `%지정자` | 한 글자짜리 사용자 지정 지정자임을 명시 |
| 그 외 | 리터럴로 출력 |

> **⚠️ `:`와 `/`는 리터럴이 아니라 "구분자 자리"다 — 문화권이 문자를 갈아 끼운다**
>
> 이것이 사용자 지정 날짜 형식에서 가장 조용히 깨지는 지점이다. `"yyyy/MM/dd"`라고 썼다고 해서 결과에 슬래시가 나온다는 보장이 없다. `/`는 "여기에 그 문화권의 날짜 구분자를 넣어라"라는 지시이고, 실제 문자는 `DateTimeFormatInfo.DateSeparator`에서 온다.
>
> ```csharp
> var dt = new DateTime (2000, 1, 2);
> Console.WriteLine (dt.ToString ("yyyy/MM/dd", CultureInfo.InvariantCulture));
> // "2000/01/02"  — 불변 문화권의 DateSeparator가 "/"
>
> var de = CultureInfo.GetCultureInfo ("de-DE");
> Console.WriteLine (dt.ToString ("yyyy/MM/dd", de));
> // 독일의 DateSeparator가 "."이면 "2000.01.02"
> ```
>
> `:`도 마찬가지로 `TimeSeparator`로 치환된다. **슬래시나 콜론을 문자 그대로 원한다면 반드시 이스케이프해라.**
>
> ```csharp
> dt.ToString (@"yyyy\/MM\/dd", anyCulture);     // 언제나 "2000/01/02"
> dt.ToString ("yyyy'/'MM'/'dd", anyCulture);    // 같은 결과
> ```
>
> `"yyyy-MM-dd"`가 실무의 사실상 표준이 된 이유가 여기 있다 — **하이픈은 구분자 지정자가 아니라 순수 리터럴이라 문화권이 건드리지 않는다.**

> **⚠️ `MM`과 `mm`을 바꿔 쓰는 것이 가장 흔한 오타다**
>
> 대문자 `M`은 **월**, 소문자 `m`은 **분**이다. `"yyyy-mm-dd"`는 컴파일도 되고 실행도 되지만 월 자리에 분이 들어간다. 마찬가지로 `H`는 24시간제, `h`는 12시간제다.
>
> | 잘못 쓴 형식 | 나오는 것 | 의도 |
> |---|---|---|
> | `yyyy-mm-dd` | `2000-18-02` | `yyyy-MM-dd` |
> | `hh:mm:ss` (AM/PM 없이) | `05:18:19` | `HH:mm:ss` |
> | `YYYY-MM-DD` | `FormatException` 또는 리터럴 | `yyyy-MM-dd` |
>
> `Y`와 `D`는 사용자 지정 지정자가 아니다. 형식 문자열에 다른 지정자가 함께 있으면 리터럴 문자로 출력되고, **혼자 있으면 표준 형식 문자열로 해석된다.**

> **⚠️ 한 글자짜리 사용자 지정 형식 문자열은 표준 형식으로 해석된다**
>
> ```csharp
> dt.ToString ("d");     // 표준 "짧은 날짜" — "01/02/2000"
> dt.ToString ("%d");    // 사용자 지정 "일" — "2"
> dt.ToString ("dd");    // 사용자 지정 "일 두 자리" — "02"
> ```
>
> 사용자 지정 지정자 하나만 쓰고 싶으면 `%`를 앞에 붙이거나 다른 문자를 함께 써야 한다. 이 규칙을 모르면 `"M"`이 월을 낼 거라 기대했다가 `"02 January"`(`MonthDayPattern`)를 받는다.
>
> `%`를 잘못 붙이는 것도 문제다 — 두 글자 이상인 형식에 `%`를 붙이면 `%` 뒤의 **한 글자만** 그렇게 해석되고 나머지는 그대로 이어진다. `%`는 길이가 1인 형식에만 써라.

### 이스케이프 규칙

| 방법 | 문법 | 예 | 결과(불변) |
|---|---|---|---|
| 한 문자 이스케이프 | `\문자` | `@"yyyy\TMM"` | `2000T01` |
| 리터럴 문자열(작은따옴표) | `'문자열'` | `"yyyy'년' M'월'"` | `2000년 1월` |
| 리터럴 문자열(큰따옴표) | `"문자열"` | `"HH\"시\""` | `17시` |
| 구분자 무력화 | `\/` 또는 `'/'` | `@"yyyy\/MM"` | `2000/01` |

### 조합 예제표

값은 `2000-01-02 17:18:19.1234567`, `Kind = Unspecified`, 문화권은 **불변**이다.

| 형식 문자열 | 결과(불변) | 용도 |
|---|---|---|
| `"yyyy-MM-dd"` | `2000-01-02` | 날짜만 저장·전송 |
| `"yyyy-MM-dd HH:mm:ss"` | `2000-01-02 17:18:19` | 로그 타임스탬프 |
| `"yyyy-MM-ddTHH:mm:ssK"` | `2000-01-02T17:18:19` | `"o"`와 같되 소수 초 없음 |
| `"yyyyMMdd_HHmmss"` | `20000102_171819` | 파일 이름(정렬 가능, 안전 문자만) |
| `"yyyyMMdd"` | `20000102` | 정수처럼 다루는 날짜 키 |
| `"HH:mm:ss.fff"` | `17:18:19.123` | 밀리초 로그 |
| `"HH:mm"` | `17:18` | 시각만 |
| `"h:mm tt"` | `5:18 PM` | 12시간제 표시 |
| `"ddd, dd MMM yyyy"` | `Sun, 02 Jan 2000` | 영문 약식 표기 |
| `"dddd"` | `Sunday` | 요일만 |
| `"MMMM yyyy"` | `January 2000` | 월 단위 집계 라벨 |
| `"yyyy'년' M'월' d'일'"` | `2000년 1월 2일` | 한글 표시 |
| `"%d"` | `2` | 일(한 글자, `%` 필수) |
| `"%M"` | `1` | 월(한 글자, `%` 필수) |
| `@"yyyy\/MM\/dd"` | `2000/01/02` | 슬래시를 문화권과 무관하게 고정 |

> **⚠️ 요일·월 이름이 들어간 형식은 저장용이 아니다**
>
> `"ddd"`, `"dddd"`, `"MMM"`, `"MMMM"`, `"tt"`는 전부 `DateTimeFormatInfo`에서 문자열을 가져온다. 불변 문화권으로 고정해도 **영어**로 저장되며, 되읽을 때 같은 문화권을 명시하지 않으면 파싱이 실패한다. 게다가 이름 데이터는 ICU 버전에 따라 바뀔 수 있다(38.10절).
>
> 저장·전송 형식에는 **숫자 지정자만** 써라 — `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `fff`, `K`.

### `DateOnly`와 `TimeOnly`

`DateOnly`와 `TimeOnly`(37.3절)는 `DateTime`의 형식 문자열 체계를 그대로 쓰되, **자기가 담지 않는 구성 요소를 요구하면 `FormatException`이 난다.**

| 타입 | 쓸 수 있는 지정자 | 쓸 수 없는 예 |
|---|---|---|
| `DateOnly` | 날짜 구성 요소 (`d` `M` `y` 계열), 표준 `d`·`D`·`m`·`M`·`y`·`Y`·`o` | `DateOnly.ToString("HH:mm")` → `FormatException` |
| `TimeOnly` | 시각 구성 요소 (`h` `H` `m` `s` `f` `t` 계열), 표준 `t`·`T`·`o`·`r` | `TimeOnly.ToString("yyyy")` → `FormatException` |

---

## E.7 `DateTimeStyles` 파싱 플래그

### 무엇을 통제하는가

`(38.6절)` `DateTimeStyles`는 `System.Globalization`의 플래그 열거형이며, `DateTime`/`DateTimeOffset`의 `Parse`·`TryParse`·`ParseExact`·`TryParseExact`에 추가 지시를 준다.

`NumberStyles`가 "어떤 문자를 허용할까"만 다룬다면, `DateTimeStyles`는 거기에 더해 **결과값의 시간대 해석**까지 다룬다. **이 두 번째 역할이 훨씬 중요하다.**

### 전수표

| 플래그 | 분류 | 동작 |
|---|---|---|
| `None` | 기본값 | 아무 특별 처리도 하지 않는다 |
| `AllowLeadingWhite` | 공백 | 앞쪽 공백을 무시한다 |
| `AllowTrailingWhite` | 공백 | 뒤쪽 공백을 무시한다 |
| `AllowInnerWhite` | 공백 | 구성 요소 사이의 공백을 무시한다 |
| `AllowWhiteSpaces` | 공백(조합) | 위 세 개를 모두 켠다 |
| `AssumeLocal` | 시간대 | 문자열에 시간대 정보가 **없으면** 로컬 시각으로 간주 |
| `AssumeUniversal` | 시간대 | 문자열에 시간대 정보가 **없으면** UTC로 간주 |
| `AdjustToUniversal` | 시간대 | 시간대 접미사를 존중하되, 결과를 UTC로 **변환**한다 |
| `RoundtripKind` | 시간대 | 문자열에 표기된 그대로 `DateTimeKind`를 복원한다 |
| `NoCurrentDateDefault` | 날짜 보완 | 날짜 없는 문자열에 오늘 날짜 대신 **0001년 1월 1일**을 채운다 |

조합 상수는 하나뿐이다.

```csharp
AllowWhiteSpaces = AllowLeadingWhite | AllowTrailingWhite | AllowInnerWhite
```

기본값은 `None`이다. **여분의 공백은 원래 금지된다** — 표준 `DateTime` 패턴의 일부인 공백은 예외다.

### 시간대 플래그의 실제 동작

**`AssumeUniversal`은 "UTC로 간주"까지만 하고, 결과를 UTC로 남겨 두지는 않는다.** `AdjustToUniversal`을 함께 켜지 않으면 파서는 UTC로 해석한 값을 다시 로컬 시각으로 변환해 `Kind`가 `Local`인 값을 돌려준다. 반면 `AssumeLocal`은 값을 그대로 두고 `Kind`만 `Local`로 표시한다 — 두 플래그는 대칭이 아니다(38.6절).

로컬 시간대가 `UTC+09:00`이라고 가정한다.

| 입력 문자열 | `DateTimeStyles` | 결과 시각 | 결과 `Kind` |
|---|---|---|---|
| `"2000-01-02T17:18:19"` | `None` | 17:18:19 | `Unspecified` |
| `"2000-01-02T17:18:19"` | `AssumeLocal` | 17:18:19 | `Local` |
| `"2000-01-02T17:18:19"` | `AssumeUniversal` | 02:18:19 (다음 날, 로컬로 변환) | `Local` |
| `"2000-01-02T17:18:19"` | `AssumeUniversal \| AdjustToUniversal` | 17:18:19 | `Utc` |
| `"2000-01-02T17:18:19"` | `AssumeLocal \| AdjustToUniversal` | 08:18:19 | `Utc` |
| `"2000-01-02T17:18:19Z"` | `None` | 02:18:19 (로컬로 변환) | `Local` |
| `"2000-01-02T17:18:19Z"` | `RoundtripKind` | 17:18:19 | `Utc` |
| `"2000-01-02T17:18:19Z"` | `AdjustToUniversal` | 17:18:19 | `Utc` |
| `"2000-01-02T17:18:19+09:00"` | `RoundtripKind` | 17:18:19 | `Local` |
| `"2000-01-02T17:18:19+09:00"` | `AdjustToUniversal` | 08:18:19 | `Utc` |

> **⚠️ `DateTime.Parse`의 기본 동작이 `Z`를 로컬로 바꾼다**
>
> 위 표의 여섯 번째 행이 실무에서 가장 많은 사고를 낸다. `Z` 접미사가 붙은 UTC 문자열을 `DateTime.Parse`로 아무 플래그 없이 읽으면, 값이 **로컬 시각으로 변환되고 `Kind`가 `Local`이 된다.** 시점 자체는 같으므로 "틀렸다"고 말하기 애매하지만, UTC를 기대한 코드에서는 예상과 다르다(37.4절).
>
> - UTC로 받고 싶다면 → `DateTimeStyles.AdjustToUniversal`
> - 문자열에 적힌 그대로의 `Kind`를 원한다면 → `DateTimeStyles.RoundtripKind`
>
> 이 사고를 근본적으로 피하는 방법은 `DateTime` 대신 `DateTimeOffset`을 쓰는 것이다(37.5절). `DateTimeOffset.Parse`는 오프셋을 값의 일부로 보존하므로 이 함정이 없다.

> **⚠️ `AssumeLocal`과 `AssumeUniversal`은 함께 쓸 수 없다**
>
> 두 플래그를 동시에 켜면 `ArgumentException`이 난다. 서로 모순되는 지시이기 때문이다.
>
> `RoundtripKind`는 "문자열에 적힌 대로"를 뜻하므로 `AssumeLocal`/`AssumeUniversal`/`AdjustToUniversal`과 의미가 충돌한다. 예외가 나지 않더라도 결과가 어느 쪽 규칙을 따르는지 읽는 사람이 알 수 없으니, **시간대 플래그는 하나만 켜라.**

> **⚠️ 시각만 파싱하는 코드는 자정에 깨진다**
>
> 시각만 있고 날짜가 없는 문자열을 파싱하면 기본적으로 **오늘 날짜**가 채워진다.
>
> ```csharp
> DateTime a = DateTime.Parse ("17:18");
> // 실행한 날의 17:18:00
>
> DateTime b = DateTime.Parse ("17:18", CultureInfo.InvariantCulture,
>                              DateTimeStyles.NoCurrentDateDefault);
> // 0001-01-01 17:18:00
> ```
>
> `DateTime.Parse("23:50")`으로 근무 종료 시각을, `DateTime.Parse("00:10")`으로 다음 근무 시작 시각을 읽으면 둘 다 오늘 날짜를 받아 차이가 음수가 된다. 게다가 `"23:50"`을 23:59:59에 부르는 것과 00:00:01에 부르는 것은 **다른 날짜**를 만든다.
>
> .NET 6 이후라면 시각만 다루는 값에는 `TimeOnly`를 써라(37.3절).

> **💡 저장·전송용 날짜 파싱의 표준 조합**
>
> 기계가 만든 ISO 8601 문자열을 읽을 때의 기본값은 다음 셋 중 하나다.
>
> ```csharp
> // 1) DateTimeOffset을 쓸 수 있다면 — 가장 안전
> var dto = DateTimeOffset.Parse (s, CultureInfo.InvariantCulture);
>
> // 2) DateTime으로 받되 UTC로 정규화
> var utc = DateTime.Parse (s, CultureInfo.InvariantCulture,
>                           DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
>
> // 3) 형식이 고정이고 Kind를 그대로 복원해야 할 때
> var rt = DateTime.ParseExact (s, "o", CultureInfo.InvariantCulture,
>                               DateTimeStyles.RoundtripKind);
> ```
>
> 세 경우 모두 **문화권을 명시했다.** `DateTimeStyles`만 넘기고 공급자를 `null`로 두면 여전히 `CurrentCulture`가 적용되어, 태국 로캘에서는 불교력으로 해석될 수 있다(38.10절).

---

## E.8 `TimeSpan` 형식 문자열

### 표준 형식 문자열

`(38.5절)` `TimeSpan`은 `DateTime`과 **별도의** 형식 문자열 체계를 갖는다. 예 출력은 `TimeSpan` 값 `1.02:03:04.5000000`(1일 2시간 3분 4.5초) 기준이다.

| 형식 문자열 | 의미 | 문화권 인식 | 예 출력 |
|---|---|---|---|
| `c` (또는 `null`, `""`) | 불변(constant) 형식 | **아니오** | `1.02:03:04.5000000` |
| `g` | 일반 짧은 형식 | 예 (소수점 문자) | `1:2:03:04.5` |
| `G` | 일반 긴 형식 | 예 (소수점 문자) | `1:02:03:04.5000000` |

| 형식 | 일(day) 부분 | 시(hour) 자릿수 | 소수 초 |
|---|---|---|---|
| `c` | 0이면 생략 | 두 자리 | 0이 아닐 때만, 7자리 |
| `g` | 0이면 생략 | 최소 자릿수 | 0이 아닐 때만, 필요한 만큼 |
| `G` | **항상 출력** | 두 자리 | **항상 7자리** |

> **⚠️ `TimeSpan`의 기본 `ToString()`은 `"c"`이고 문화권을 보지 않는다**
>
> 숫자와 `DateTime`은 인자 없는 `ToString()`이 `CurrentCulture`를 쓰지만, `TimeSpan`의 기본은 **불변 형식 `"c"`** 다. 소수점도 언제나 마침표다. 저장·전송에 `TimeSpan.ToString()`을 그냥 써도 안전한 이유이며, 동시에 `"g"`/`"G"`로 바꾸는 순간 그 안전성이 사라지는 이유이기도 하다.
>
> ```csharp
> var ts = new TimeSpan (1, 2, 3, 4, 500);
> Console.WriteLine (ts.ToString());               // "1.02:03:04.5000000" — 어디서나 같다
> Console.WriteLine (ts.ToString ("g", de));        // 독일에서 소수점이 쉼표로 바뀐다
> ```

### 사용자 지정 형식 문자열

| 지정자 | 의미 | 비고 |
|---|---|---|
| `d` ~ `dddddddd` | 일(day) 구성 요소 | `d`는 앞자리 0 없음, `dd`부터 자릿수만큼 0을 채운다 (최대 8) |
| `h`, `hh` | 시 구성 요소 (0~23) | `TimeSpan`의 시는 **총 시간이 아니라 나머지**다 |
| `m`, `mm` | 분 구성 요소 (0~59) | |
| `s`, `ss` | 초 구성 요소 (0~59) | |
| `f` ~ `fffffff` | 소수 초, **0을 포함해 항상 출력** | 자릿수만큼 |
| `F` ~ `FFFFFFF` | 소수 초, **뒤쪽 0은 생략** | 자릿수만큼 |
| `'문자열'` `"문자열"` | 리터럴 문자열 | |
| `\문자` | 다음 한 문자를 리터럴로 | |

> **⚠️ `TimeSpan`의 사용자 지정 형식에서는 리터럴을 반드시 이스케이프해야 한다**
>
> `DateTime` 쪽과 결정적으로 다른 점이다. `DateTime`은 지정자가 아닌 문자를 만나면 그냥 리터럴로 출력하지만, **`TimeSpan`은 이스케이프되지 않은 문자를 만나면 `FormatException`을 던진다.** 콜론과 마침표도 예외가 아니다.
>
> ```csharp
> var ts = new TimeSpan (1, 2, 3, 4);
> Console.WriteLine (ts.ToString (@"d\.hh\:mm\:ss"));   // "1.02:03:04"
> Console.WriteLine (ts.ToString ("d'.'hh':'mm':'ss")); // 같은 결과
> ```
>
> 그리고 **한 글자짜리 사용자 지정 형식 문자열은 금지되어 있다.** `ts.ToString("h")`는 표준 형식으로도 해석되지 않아 실패한다. `"%h"`처럼 `%`를 붙여라.

> **⚠️ 사용자 지정 `TimeSpan` 형식에는 부호 자리 표시자가 없다**
>
> 음수 `TimeSpan`을 사용자 지정 형식으로 찍으면 **부호가 사라진다.** 절댓값만 서식화된다. 표준 형식(`c`/`g`/`G`)은 부호를 붙여 주므로 이 차이가 조용히 데이터를 뒤집는다.
>
> ```csharp
> var neg = TimeSpan.FromHours (-3);
> Console.WriteLine (neg.ToString ("c"));              // "-03:00:00"
> Console.WriteLine (neg.ToString (@"hh\:mm\:ss"));    // "03:00:00"  ← 부호가 없다
> ```
>
> 부호가 필요하면 직접 붙여라.
>
> ```csharp
> string s = (neg < TimeSpan.Zero ? "-" : "") + neg.Duration().ToString (@"hh\:mm\:ss");
> ```

> **⚠️ `hh`는 "총 시간"이 아니다**
>
> `TimeSpan.FromHours(30).ToString(@"hh\:mm")`은 `06:00`이다. 30시간은 `1일 6시간`이고 `hh`는 **일을 뺀 나머지 시**만 찍기 때문이다. 총 시간이 필요하면 형식 문자열이 아니라 `TotalHours` 속성을 서식화해라.
>
> ```csharp
> var ts = TimeSpan.FromHours (30);
> Console.WriteLine (ts.ToString (@"hh\:mm"));                              // "06:00"
> Console.WriteLine ($"{(int) ts.TotalHours:00}:{ts.Minutes:00}");          // "30:00"
> ```
>
> `d`를 함께 쓰거나(`@"d\.hh\:mm"` → `1.06:00`) 총합 속성을 쓰거나, 둘 중 하나를 의식적으로 골라야 한다.

### 파싱

| 메서드 | 받아들이는 것 |
|---|---|
| `TimeSpan.Parse(s, provider)` | `[-][d.]hh:mm[:ss[.fffffff]]` 형태 전반 |
| `TimeSpan.TryParse(s, provider, out ts)` | 위와 같음, 실패 시 `false` |
| `TimeSpan.ParseExact(s, format, provider, styles)` | 지정한 형식 하나(또는 배열) |
| `TimeSpan.TryParseExact(s, format, provider, styles, out ts)` | 위와 같음, 실패 시 `false` |

`ParseExact` 계열이 받는 `styles`는 `System.Globalization.TimeSpanStyles`이며 멤버는 둘뿐이다.

| 멤버 | 동작 |
|---|---|
| `None` | 기본값 — 부호가 없으면 양수로 읽는다 |
| `AssumeNegative` | 부호가 없어도 음수로 읽는다 |

---

## E.9 열거형 형식 문자열과 `[Flags]` 동작

### 네 개가 전부다

`(38.7절)` 열거형에는 전용 `IFormatProvider` 클래스가 없다. **열거형의 형식 문자열은 문화권과 무관하다.** 아래 표의 출력은 다음 식의 결과다.

```csharp
Console.WriteLine (System.ConsoleColor.Red.ToString (formatString));
```

| 형식 문자열 | 의미 | 예 출력(비인식) | 비고 |
|---|---|---|---|
| `G` / `g` | 일반(General) | `Red` | 기본값 |
| `F` / `f` | `Flags` 특성이 있는 것처럼 취급 | `Red` | `Flags` 특성이 **없어도** 조합된 멤버에서 동작한다 |
| `D` / `d` | 십진 값 | `12` | 기저 정수 값을 가져온다 |
| `X` / `x` | 16진 값 | `0000000C` | 기저 정수 값을 가져온다 |

`X` 형식의 자릿수는 **기저 타입의 크기**로 결정된다. `int` 기저면 8자리, `byte` 기저면 2자리다.

```csharp
enum Small : byte { A = 1, B = 2 }
Console.WriteLine (Small.B.ToString ("X"));   // "02"
```

### `G`와 `F`의 차이

| 상황 | `G`의 출력 | `F`의 출력 |
|---|---|---|
| 값이 정의된 멤버와 정확히 일치 | 멤버 이름 | 멤버 이름 |
| 조합 값, 열거형에 `[Flags]` **있음** | 비트를 분해해 `A, B` | 비트를 분해해 `A, B` |
| 조합 값, 열거형에 `[Flags]` **없음** | **숫자 그대로** | 비트를 분해해 `A, B` |
| 비트로도 분해되지 않는 값 | 숫자 그대로 | 숫자 그대로 |

```csharp
enum Plain { A = 1, B = 2, C = 4 }        // Flags 없음

Plain v = Plain.A | Plain.B;              // 값 3

Console.WriteLine (v.ToString ("G"));     // "3"
Console.WriteLine (v.ToString ("F"));     // "A, B"
```

### `[Flags]` 열거형의 서식화 규칙

| 규칙 | 내용 |
|---|---|
| 구분자 | 쉼표 + 공백(`", "`) 고정. 문화권과 무관하다 |
| 분해 순서 | 값이 큰 멤버부터 탐욕적으로 소비한다 |
| 0 값 | 0에 대응하는 멤버(`None = 0`)가 있으면 그 이름, 없으면 `"0"` |
| 남는 비트 | 어떤 멤버로도 덮이지 않는 비트가 남으면 **전체를 숫자로** 출력한다 |

> **⚠️ 열거형의 `ToString()`은 리플렉션을 쓴다**
>
> `enum.ToString()`은 값에 대응하는 **이름**을 메타데이터에서 찾아야 한다. 런타임은 열거형 타입별로 이름/값 배열을 만들어 캐시하지만, 첫 호출은 리플렉션 비용을 낸다.
>
> 로그 한 줄마다 열거형을 문자열로 찍는 코드는 생각보다 비싸다. 정수 값만 필요하면 `((int)v).ToString()`이, 이름이 필요하고 값이 몇 개뿐이면 `switch` 식으로 상수 문자열을 돌려주는 편이 훨씬 빠르다.
>
> ```csharp
> static string Name (LogLevel l) => l switch
> {
>     LogLevel.Trace => "TRACE",
>     LogLevel.Debug => "DEBUG",
>     LogLevel.Info  => "INFO",
>     _              => l.ToString()      // 드문 경우만 느린 경로로
> };
> ```

### 파싱

| 메서드 | 시그니처 | 실패 시 |
|---|---|---|
| `Enum.Parse(Type, string)` | 대소문자 구분 | `ArgumentException` |
| `Enum.Parse(Type, string, bool)` | 세 번째 인자가 `ignoreCase` | `ArgumentException` |
| `Enum.Parse<TEnum>(string)` | 제네릭, 박싱 없음 | `ArgumentException` |
| `Enum.Parse<TEnum>(string, bool)` | 제네릭 + `ignoreCase` | `ArgumentException` |
| `Enum.TryParse<TEnum>(string, out TEnum)` | 제네릭 | `false` |
| `Enum.TryParse<TEnum>(string, bool, out TEnum)` | 제네릭 + `ignoreCase` | `false` |

`ReadOnlySpan<char>`를 받는 오버로드도 있다 ※.NET 8.

> **⚠️ `Enum.Parse`가 던지는 것은 `FormatException`이 아니라 `ArgumentException`이다**
>
> 다른 모든 `Parse` 메서드와 예외 타입이 다르다. `catch (FormatException)`으로 파싱 실패를 잡는 공통 헬퍼를 만들었다면 열거형에서만 예외가 새어 나간다.

> **⚠️ `Enum.Parse`는 정의되지 않은 값도 만들어 낸다**
>
> ```csharp
> enum Status { Active = 1, Inactive = 2 }
>
> var a = Enum.Parse<Status> ("Active");     // Status.Active
> var b = Enum.Parse<Status> ("99");         // (Status)99 — 예외 없음!
> bool ok = Enum.TryParse<Status> ("99", out var c);   // true, c = (Status)99
> ```
>
> **숫자 문자열은 언제나 파싱에 성공한다.** 정의된 멤버가 아니어도 그렇다. 외부에서 온 문자열을 열거형으로 받는다면 파싱 성공만으로 부족하고 `Enum.IsDefined`를 함께 검사해야 한다(20.4절).
>
> ```csharp
> bool valid = Enum.TryParse<Status> (input, ignoreCase: true, out var s)
>              && Enum.IsDefined (s);         // .NET 5 이후 제네릭 오버로드
> ```
>
> 단, `[Flags]` 열거형에서는 `IsDefined`가 조합 값(`A | B`)에 대해 `false`를 돌려주므로 이 검사를 그대로 쓸 수 없다. 조합의 유효성은 마스크로 직접 검사해라.
>
> ```csharp
> const Perm All = Perm.Read | Perm.Write | Perm.Exec;
> bool valid2 = (parsed & ~All) == 0;
> ```

> **📌 열거형과 JSON**
>
> `System.Text.Json`은 기본적으로 열거형을 **숫자**로 직렬화한다. 이름으로 쓰고 싶으면 `JsonStringEnumConverter`를 등록한다(41.5절). 어느 쪽을 택하든, 저장된 표현이 코드의 멤버 이름·값과 함께 진화한다는 사실을 잊지 마라 — **멤버 이름을 리팩터링하면 이미 저장된 데이터가 깨진다.**

---

## E.10 복합 형식(composite formatting)

### 문법

`(38.2절)` 복합 형식 문자열은 변수 치환과 형식 문자열을 결합한다.

```text
{ index [,alignment] [:formatString] }
```

| 부분 | 필수 | 의미 | 예 |
|---|---|---|---|
| `index` | 예 | 0부터 시작하는 인자 번호 | `{0}` |
| `alignment` | 아니오 | 최소 폭. **양수면 오른쪽 정렬, 음수면 왼쪽 정렬** | `{0,10}` `{0,-10}` |
| `formatString` | 아니오 | 그 인자에 적용할 형식 문자열 | `{0:N2}` |

세 요소는 함께 쓸 수 있고 순서가 고정이다 — 인덱스, 정렬, 형식.

```csharp
Console.WriteLine ("{0,-12}{1,8:N2}", "합계", 1234.5);
// "합계            1,234.50"   (첫 인자 왼쪽 정렬 폭 12, 둘째 오른쪽 정렬 폭 8)
```

| 규칙 | 내용 |
|---|---|
| 폭보다 값이 길면 | 정렬은 **무시**된다. 잘리지 않는다 |
| 같은 인덱스를 여러 번 | 허용된다. `{0:C} / {0:N2}` |
| 인덱스가 인자 수를 넘으면 | `FormatException` |
| 인자가 `null`이면 | 빈 문자열 |
| 인자가 `IFormattable`이면 | `ToString(format, provider)` 호출 |
| 인자가 `IFormattable`이 아니면 | `formatString`이 **무시되고** `ToString()` 호출 |

### 중괄호 이스케이프

| 쓰는 법 | 결과 |
|---|---|
| `{{` | `{` |
| `}}` | `}` |

```csharp
Console.WriteLine ("{{\"id\":{0}}}", 42);        // {"id":42}
Console.WriteLine ($$"""{"id":{{id}}}""");        // 원시 문자열 보간 ※C# 11
```

### 어디서 무엇이 달라지는가

| API | 형식 공급자 기본값 | 공급자 지정 방법 | `ICustomFormatter` 조회 | 비고 |
|---|---|---|---|---|
| `string.Format(fmt, args)` | `CurrentCulture` | 첫 인자로 공급자를 받는 오버로드 | **예** | 호출마다 형식 문자열을 다시 파싱 |
| `string.Format(provider, fmt, args)` | 지정한 공급자 | — | **예** | |
| `$"…"` (보간 문자열) | **`CurrentCulture`** | 문법에 자리가 없다 | 아니오 | 핸들러로 낮춰진다(35.7절) |
| `string.Create(provider, $"…")` | 지정한 공급자 | 첫 인자 | 아니오 | 보간을 불변으로 만드는 정석 |
| `FormattableString.Invariant($"…")` | 불변 | — | 아니오 | `FormattableString` 할당 + 인자 박싱 |
| `StringBuilder.AppendFormat(fmt, args)` | `CurrentCulture` | 공급자 오버로드 있음 | **예** | |
| `Console.Write` / `WriteLine(fmt, args)` | `CurrentCulture` | 없음 | **예** | |
| `TextWriter.Write(fmt, args)` | `TextWriter.FormatProvider` | 생성 시 지정 | **예** | 40.5절 |
| `CompositeFormat` + `string.Format` ※.NET 8 | 첫 인자로 지정 | 첫 인자 | **예** | 형식 파싱을 미리 끝내 둔다 |
| `value.ToString(format, provider)` | 지정한 공급자 | 둘째 인자 | **아니오** | 복합 형식이 아니다 |

> **⚠️ 보간 문자열은 복합 서식이지만 문화권을 지정할 자리가 없다**
>
> `$"Credit={amount:C}"`는 컴파일러가 `DefaultInterpolatedStringHandler`로 낮추며(35.7절), 기본적으로 **`CurrentCulture`** 를 쓴다. `string.Format(provider, ...)`처럼 공급자를 앞에 붙일 문법이 없다.
>
> 불변 문화권으로 보간하려면 `string.Create`를 쓴다.
>
> ```csharp
> string s = string.Create (CultureInfo.InvariantCulture, $"Credit={amount:C}");
> ```
>
> `FormattableString.Invariant($"...")`도 같은 목적을 달성하지만, 이 쪽은 `FormattableString` 객체를 힙에 만들고 인자를 `object[]`에 박싱한다. 성능이 중요하면 `string.Create` 쪽이다.

> **⚠️ 사용자 정의 형식 공급자(`ICustomFormatter`)는 복합 형식 문자열에서만 동작한다**
>
> `n.ToString("W", fp)`는 동작하지 않는다. `double.ToString`은 `ICustomFormatter`를 조회하지 않고 곧바로 `NumberFormatInfo`를 찾기 때문이다. `ICustomFormatter`를 조회하는 것은 **복합 서식 엔진**(`string.Format`, `StringBuilder.AppendFormat`, `Console.Write`)뿐이다(38.2절).

> **⚠️ 보간 문자열 안의 `:`는 형식 문자열의 시작이다 — 삼항 연산자를 감싸라**
>
> 보간 구멍 안에서 콜론을 만나면 파서는 거기서부터를 형식 문자열로 읽는다. 조건 연산자를 그냥 쓰면 컴파일 오류이거나, 더 나쁘게는 엉뚱한 형식 문자열이 된다.
>
> ```csharp
> // 컴파일 오류
> // string bad = $"{flag ? "yes" : "no"}";
>
> // 괄호로 감싼다
> string good = $"{(flag ? "yes" : "no")}";
> ```
>
> 쉼표도 같은 이유로 특별 취급된다 — `{value,10}`의 쉼표는 정렬 지정자다. 인덱서나 메서드 인자에 쉼표가 들어가면 마찬가지로 괄호가 필요하다.

> **💡 상수 형식 문자열을 반복해서 쓴다면 `CompositeFormat` ※.NET 8**
>
> `string.Format`은 호출할 때마다 형식 문자열을 **다시 파싱한다.** 형식 문자열이 상수라면 순수한 낭비다.
>
> ```csharp
> using System.Text;
>
> static readonly CompositeFormat Fmt =
>     CompositeFormat.Parse ("사용자 {0}이(가) {1:yyyy-MM-dd}에 로그인했다.");
>
> string Render (string user, DateTime when)
>     => string.Format (CultureInfo.InvariantCulture, Fmt, user, when);
> ```
>
> 형식 문자열이 길고 항목이 많을수록, 호출 빈도가 높을수록 이득이 커진다. 로컬라이즈된 리소스 문자열(53장)처럼 런타임에 결정되어 보간 문자열로 쓸 수 없는 자리에서 특히 값어치가 있다.

---

## E.11 목적별 역인덱스 치트시트

지정자를 아는 상태로 의미를 찾는 것이 E.2~E.10이라면, 이 절은 **반대 방향**이다. 하고 싶은 일에서 형식 문자열로 간다. 출력은 별도 표기가 없으면 **en-US** 기준이다.

### 숫자를 찍고 싶다

| 하고 싶은 일 | 형식 문자열 | 예 | 참조 |
|---|---|---|---|
| 있는 그대로, 왕복 가능하게 | 생략 (`ToString()`) | `1.5` → `1.5` | E.2 |
| 소수점 이하 두 자리 고정 | `"F2"` | `2345.6` → `2345.60` | E.2 |
| 천 단위 구분 + 두 자리 | `"N2"` | `2345.678` → `2,345.68` | E.2 |
| 천 단위 구분 정수 | `"N0"` | `1234.5` → `1,235` | E.2 |
| 통화 (문화권 관례대로) | `"C"` | `1.2` → `$1.20` | E.2 |
| 통화 (자릿수 고정) | `"C2"` | `1.2` → `$1.20` | E.2 |
| 백분율 (값이 0~1) | `"P1"` | `0.503` → `50.3%` | E.2 |
| 백분율 (값이 이미 퍼센트 단위) | `@"0.0\%"` | `50.3` → `50.3%` | E.3 |
| 앞자리 0을 채운 정수 | `"D5"` | `123` → `00123` | E.2 |
| 16진수 두 자리 (바이트) | `"X2"` | `10` → `0A` | E.2 |
| 2진수 여덟 자리 ※.NET 8 | `"B8"` | `10` → `00001010` | E.2 |
| 지수 표기 | `"E3"` 또는 `"0.000E+00"` | `1234` → `1.234E+003` / `1.234E+03` | E.2, E.3 |
| 유효 자릿수 제한 | `"G4"` | `1.23456` → `1.235` | E.2 |
| 0을 빈칸으로 (표에서 잡음 제거) | `"#,##0.00;(#,##0.00);"` | `0` → `` | E.3 |
| 0을 대시로 | `"#,##0.00;(#,##0.00);-"` | `0` → `-` | E.3 |
| 회계식 음수 괄호 | `"#,##0.00;(#,##0.00)"` | `-1234.5` → `(1,234.50)` | E.3 |
| 부호를 항상 붙이기 | `"+0;-0"` | `5` → `+5` | E.3 |
| 백만 단위로 축약 | `"#,##0,,'M'"` | `12345678` → `12M` | E.3 |
| 뒤쪽 0 없이 최대 세 자리 | `"0.###"` | `1.5000` → `1.5` | E.3 |
| 고정 폭 오른쪽 정렬 | 복합 형식 `"{0,12:N2}"` | — | E.10 |

### 날짜/시간을 찍고 싶다

| 하고 싶은 일 | 형식 문자열 | 문화권 | 참조 |
|---|---|---|---|
| 값을 손실 없이 저장·전송 | `"o"` | 불변 명시 | E.5 |
| 날짜만 저장 | `"yyyy-MM-dd"` | 불변 명시 | E.6 |
| 로그 타임스탬프 | `"yyyy-MM-dd HH:mm:ss"` | 불변 명시, 값은 UTC | E.6 |
| 밀리초까지 로그 | `"yyyy-MM-dd HH:mm:ss.fff"` | 불변 명시 | E.6 |
| 파일 이름에 넣기 | `"yyyyMMdd_HHmmss"` | 불변 명시 | E.6 |
| 정렬 가능한 짧은 키 | `"s"` 또는 `"yyyyMMdd"` | 비인식 | E.5, E.6 |
| HTTP 헤더 | `"R"` (값을 먼저 UTC로 변환) | 비인식 | E.5 |
| 사용자에게 날짜만 보여 주기 | `"d"` | `CurrentCulture` | E.5 |
| 사용자에게 날짜+시각 보여 주기 | `"g"` 또는 `"G"` | `CurrentCulture` | E.5 |
| 사용자에게 긴 날짜 보여 주기 | `"D"` | `CurrentCulture` | E.5 |
| 월 단위 집계 라벨 | `"y"` 또는 `"MMMM yyyy"` | `CurrentCulture` | E.5, E.6 |
| 요일만 | `"dddd"` | `CurrentCulture` | E.6 |
| 12시간제 시각 | `"h:mm tt"` | `CurrentCulture` | E.6 |
| 24시간제 시각 | `"HH:mm"` | 어디서나 같음 | E.6 |
| 한글 날짜 | `"yyyy'년' M'월' d'일'"` | 리터럴 고정 | E.6 |
| 슬래시를 문화권과 무관하게 고정 | `@"yyyy\/MM\/dd"` | 리터럴 고정 | E.6 |
| 오프셋 붙이기 (`DateTimeOffset`) | `"zzz"` 또는 `"K"` | 비인식 | E.6 |
| `Kind` 표기 (`DateTime`) | `"K"` (`"z"`는 쓰지 마라) | 비인식 | E.6 |

### 기간·열거형을 찍고 싶다

| 하고 싶은 일 | 형식 문자열 | 예 | 참조 |
|---|---|---|---|
| `TimeSpan`을 손실 없이 저장 | `"c"` (또는 생략) | `1.02:03:04.5000000` | E.8 |
| `TimeSpan`을 `hh:mm:ss`로 | `@"hh\:mm\:ss"` | `02:03:04` | E.8 |
| `TimeSpan`의 총 시간 | 형식 문자열이 아니라 `TotalHours` | — | E.8 |
| 열거형 이름 | `"G"` (또는 생략) | `Red` | E.9 |
| `[Flags]` 없는 조합을 이름으로 | `"F"` | `A, B` | E.9 |
| 열거형의 기저 정수 | `"D"` | `12` | E.9 |
| 열거형의 16진 값 | `"X"` | `0000000C` | E.9 |

### 파싱이 실패한다

| 증상 | 원인 | 해법 | 참조 |
|---|---|---|---|
| `int.Parse("1,000")`이 실패 | `Integer`에 `AllowThousands`가 없다 | `NumberStyles.Number` 또는 구분자 제거 | E.4 |
| `decimal.Parse("3e6")`이 실패 | `Number`에 `AllowExponent`가 없다 | `NumberStyles.Any` | E.4 |
| `int.Parse("0x1E", HexNumber)`가 실패 | 접두사를 모른다 | `0x`를 직접 벗긴다 | E.4 |
| `"$5.20"` 파싱 실패 | 통화 기호 미허용 | `NumberStyles.Currency` | E.4 |
| `"(2)"`가 `-2`로 안 읽힘 | 괄호 미허용 | `AllowParentheses` | E.4 |
| 독일에서 `"1.234"`가 1234로 읽힘 | `CurrentCulture` 적용 | 공급자를 명시 | E.1 |
| 앞뒤 공백 때문에 실패 | `DateTimeStyles.None`이 기본 | `AllowWhiteSpaces` 또는 `Trim()` | E.7 |
| `Z`가 붙었는데 `Kind`가 `Local` | `Parse`의 기본 동작 | `RoundtripKind` 또는 `AdjustToUniversal` | E.7 |
| 날짜 없는 시각에 오늘이 붙음 | 기본 보완 동작 | `NoCurrentDateDefault` 또는 `TimeOnly` | E.7 |
| `Enum.Parse`에서 `FormatException`이 안 잡힘 | `ArgumentException`을 던진다 | 예외 타입을 고친다 | E.9 |
| `"99"`가 열거형으로 파싱됨 | 숫자는 항상 성공한다 | `Enum.IsDefined`를 함께 검사 | E.9 |

### 형식 문자열이 이상하게 동작한다

| 증상 | 원인 | 해법 | 참조 |
|---|---|---|---|
| `"d"`가 일이 아니라 짧은 날짜를 낸다 | 한 글자는 표준 형식 | `"%d"` | E.1, E.6 |
| `"yyyy-mm-dd"`에 분이 들어간다 | `m`은 분, `M`이 월 | `"yyyy-MM-dd"` | E.6 |
| 0이 빈 문자열로 나온다 | `#`만 썼다 | 정수부에 `0`을 넣는다 | E.3 |
| 값이 1000분의 1이 된다 | 끝의 쉼표가 배율 지정자 | 끝의 쉼표를 지운다 | E.3 |
| 음수가 양수처럼 보인다 | 섹션 2개 이상이면 부호가 없다 | 음수 섹션에 부호를 직접 넣는다 | E.3 |
| 슬래시가 점으로 바뀐다 | `/`는 `DateSeparator`로 치환 | `@"\/"` 또는 `"'/'"` | E.6 |
| `"R"`로 찍은 UTC 시각이 틀리다 | 자동 변환을 안 한다 | `ToUniversalTime()`을 먼저 | E.5 |
| `zzz`가 UTC 값에 로컬 오프셋을 찍는다 | `DateTime`은 오프셋이 없다 | `"K"` 또는 `DateTimeOffset` | E.6 |
| `TimeSpan` 사용자 지정 형식이 예외 | 리터럴 미이스케이프 | `@"hh\:mm"` | E.8 |
| 음수 `TimeSpan`의 부호가 사라진다 | 부호 자리 표시자가 없다 | 직접 붙인다 | E.8 |
| `Math.Round`와 `"F2"`의 결과가 다르다 | 반올림 정책이 다르다 | 계산 단계에서 정책을 정한다 | E.2 |
| 보간 문자열 안의 삼항 연산자가 오류 | `:`가 형식 문자열 시작 | 괄호로 감싼다 | E.10 |
| `ToString("W", myProvider)`가 무시된다 | `ICustomFormatter`는 복합 형식 전용 | `string.Format` | E.10 |

---

## 이 부록의 요약

- **형식 문자열은 두 종류뿐이고, 길이가 1이면 언제나 표준으로 먼저 해석된다.** 사용자 지정 지정자 하나만 쓰려면 `%`를 붙이거나 길이를 2 이상으로 만들어야 한다. `TimeSpan`에서는 한 글자 사용자 지정 형식이 아예 금지되어 있다.

- **형식 문자열은 무엇을, 형식 공급자는 어떻게 정한다.** 같은 `"C"`가 `$1.20`도 되고 `1,20 €`도 된다. 그래서 이 부록의 모든 출력 예에는 문화권 표기가 붙어 있고, 표기가 없는 출력 예는 신뢰할 값이 아니다.

- **세미콜론으로 섹션을 나누면 음수 부호가 자동으로 붙지 않는다.** 섹션이 2개면 0은 양수 섹션으로 가고, 3개여야 0을 따로 다룰 수 있다. 섹션을 쓰는 형식은 반드시 음수와 0으로 테스트해라.

- **날짜/시간 표준 형식은 문화권 인식 그룹과 비인식 그룹으로 갈린다.** 인식 그룹(`d D t T f F g G m M y Y`)은 사람에게만, 비인식 그룹(`o O r R s u U`)은 기계에게 쓴다. 그중 개입 없이 명확한 값을 쓰는 것은 **`"o"` 하나뿐**이다 — `r`·`R`·`u`는 UTC 접미사를 찍으면서 변환은 하지 않고, `U`는 변환하면서 접미사를 안 찍는다.

- **사용자 지정 날짜 형식의 `/`와 `:`는 리터럴이 아니라 구분자 자리다.** 문화권이 실제 문자를 갈아 끼운다. `"yyyy-MM-dd"`가 사실상 표준이 된 이유는 하이픈이 순수 리터럴이기 때문이다.

- **`DateTime`에 `z`를 쓰면 거짓말을 한다.** `DateTime`은 오프셋을 저장하지 않으므로 실행 중인 컴퓨터의 로컬 오프셋이 찍힌다. `K`를 쓰거나, 오프셋이 필요하면 애초에 `DateTimeOffset`을 써라.

- **`DateTime.Parse`는 `Z`가 붙은 문자열을 로컬로 변환한다.** UTC를 원하면 `AdjustToUniversal`, 적힌 그대로를 원하면 `RoundtripKind`다. 시간대 플래그는 하나만 켜라.

- **복합 형식과 보간 문자열은 같은 문법이지만 문화권 지정 방식이 다르다.** 보간 문자열에는 공급자를 붙일 자리가 없어서 `CurrentCulture`가 쓰인다. 불변으로 만들려면 `string.Create(provider, $"…")`다.

- **마지막으로, 이 부록 전체가 하나의 질문으로 압축된다** — 이 문자열을 읽을 대상이 사람인가 기계인가. 기계라면 `InvariantCulture`이고, 저장 형식은 불변 문화권의 `"d"`가 아니라 `"o"`나 `"yyyy-MM-dd"`처럼 **명시적인 패턴**이어야 한다.

---

## 연습 문제

1. E.1절의 문화권 비교표를 자기 환경에서 재현하라. `en-US`, `de-DE`, `ko-KR`, `hi-IN`, `InvariantCulture` 다섯 개로 `1234567.891`을 `"N2"`·`"C"`·`"G"`로 찍고, `new DateTime(2000,1,2)`를 `"d"`·`"D"`로 찍어라. `hi-IN`의 자릿수 구분 위치가 왜 다른지 `NumberGroupSizes`를 출력해 확인하라(38.2절).

2. E.3절의 배율 지정자를 실험으로 확인하라. `1234567.ToString(f)`를 `f = "#,###"`, `"#,###,"`, `"#,,"`, `"#,.00"`, `"#,##0,,"`로 각각 찍고, **쉼표 오른쪽에 자리 표시자가 있는가**라는 규칙으로 결과를 전부 설명할 수 있는지 검증하라.

3. E.3절의 섹션 구분자 함정을 재현하라. `"#,##0.00;(#,##0.00)"`에 `1234.5`, `-1234.5`, `0`을 넣어 찍고, 0의 출력이 왜 그렇게 나오는지 설명하라. 그다음 셋째 섹션을 추가해 0을 `-`로 바꿔라.

4. E.5절의 `"R"` 함정을 측정하라. `DateTimeKind.Local`인 값과 `ToUniversalTime()`을 적용한 값을 각각 `"R"`·`"o"`·`"u"`·`"U"`로 찍어 여덟 개 문자열을 만들고, **어느 것이 같은 시점을 가리키는지** 표로 정리하라(37.4절).

5. E.6절의 구분자 치환을 확인하라. `@"yyyy/MM/dd"`와 `@"yyyy\/MM\/dd"`를 `InvariantCulture`, `de-DE`, `ko-KR`로 각각 찍어 여섯 개 출력을 비교하라. 그다음 `"HH:mm"`에 대해 같은 실험을 하고 `TimeSeparator`를 출력해 대조하라.

6. E.7절의 시간대 시나리오표 열 줄을 전부 코드로 재현하라. 자기 로컬 시간대 오프셋을 먼저 출력하고, 표의 `+09:00` 가정과 다르면 기대값을 자기 오프셋에 맞게 다시 계산한 뒤 비교하라. `DateTimeOffset.Parse`로도 같은 열 줄을 돌려 **함정이 사라지는지** 확인하라.

7. E.8절의 `TimeSpan` 함정 세 가지를 각각 재현하라 — (가) 이스케이프하지 않은 `@"hh:mm"`이 던지는 예외 타입, (나) `TimeSpan.FromHours(30)`을 `@"hh\:mm"`으로 찍은 결과, (다) 음수 `TimeSpan`을 `"c"`와 `@"hh\:mm\:ss"`로 찍은 결과의 차이. 그다음 `TimeSpan.TryParseExact`에 `TimeSpanStyles.AssumeNegative`를 주어 (다)를 되읽어 보라.


---

**이어서 볼 곳** — 이 부록의 표가 왜 그렇게 생겼는지는 38장 전체가 설명한다. 형식 공급자의 구조와 `ICustomFormatter`는 38.2절, 무할당 포매팅은 38.8절, `Convert`·`XmlConvert`·`TypeConverter`는 38.9절, 국제화 테스트와 ICU는 38.10절, 문화권 결정표의 근거는 38.11절이다. 문자열 비교와 보간 문자열의 컴파일 결과는 35장, 날짜/시간 타입의 의미론은 37장, 반올림 정책은 39.1절, JSON 직렬화 정책은 41장, 리소스와 지역화는 53장에 있다. IL과 어셈블리를 읽는 법은 부록 A, 메모리 관리 규칙은 부록 B, 진단 명령은 부록 C, 성능 상수는 부록 D다.
