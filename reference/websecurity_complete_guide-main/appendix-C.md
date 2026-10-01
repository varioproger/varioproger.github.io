# 부록 C. 소스 코드에서 취약점 찾기

이 책의 본문과 앞의 두 부록이 다룬 기법은 거의 전부 **동작 중인 애플리케이션과 주고받는 일**이었다. 조작된 입력을 보내고 응답을 관찰한다. 부록 A의 방법론도(→ 부록 A), 부록 B의 자동화도(→ 부록 B) 그 전제 위에 서 있다. 이 부록은 방향을 뒤집는다. 애플리케이션의 **소스 코드를 읽어서** 취약점을 찾는다.

소스 코드를 볼 수 있는 상황은 생각보다 흔하다. 애플리케이션 자체가 오픈소스이거나 오픈소스 컴포넌트를 쓰고 있어 저장소에서 코드를 내려받을 수 있다. 컨설팅 계약으로 침투 테스트를 수행할 때 의뢰인이 감사의 효과를 높이려고 코드 접근을 열어 주기도 한다. 파일 노출 취약점을 하나 찾아내면 그것이 곧 코드 유출 경로가 된다 (→ 28.3). 그리고 무엇보다, 거의 모든 애플리케이션이 클라이언트 측 JavaScript를 쓰며 **그 코드는 아무 권한 없이도 전부 읽을 수 있다**.

코드 리뷰를 하려면 숙련된 프로그래머여야 하고 해당 언어를 깊이 알아야 한다는 통념이 있다. 사실이 아니다. 웹에 쓰이는 고수준 언어 대부분은 프로그래밍 경험이 얕은 사람도 읽어 낼 수 있고, **많은 취약점 유형이 언어를 가리지 않고 같은 모양으로 나타난다.** 리뷰의 대부분은 표준화된 방법론으로 수행할 수 있으며, 언어별 문법과 API는 참조표를 옆에 두고 보면 된다. 이 부록이 그 방법론(C.2)과 참조표(C.4)를 제공한다.

> **이 부록이 서 있는 시점**
>
> 이 부록은 원서 『The Web Application Hacker's Handbook』 2판(2011)의 19장을 뼈대로, C.1의 일부를 『Secure by Design』(2019) 14.1절로 보강했다. 따라서 여기 나오는 언어·플랫폼·설정 항목은 **2011년 기준**이다. PHP의 `register_globals`·`safe_mode`·`magic_quotes`, Perl CGI.pm, ASP.NET ViewState 시대의 `web.config` 항목이 그대로 등장한다. 그 이후의 정적 분석(SAST) 제품, 의존성 취약점 스캐닝, 언어별 최신 프레임워크가 기본 제공하는 자동 이스케이핑 같은 주제는 이 부록의 범위 밖이다.
>
> 그럼에도 이 부록의 실질은 낡지 않는다. "사용자 입력이 들어오는 API를 전부 찾고, 위험한 싱크(sink) API를 전부 찾고, 그 사이를 잇는 경로를 읽는다"는 절차는 도구와 언어가 바뀌어도 그대로다. 언어별 표는 **그 언어에서 그 역할을 하는 API가 무엇인가**를 묻는 방식의 예시로 읽으면 된다.

---

## C.1 코드 리뷰 접근법 — 블랙박스 대 화이트박스

앞의 장들이 서술한 공격 방법론은 흔히 **블랙박스(black-box)** 접근이라 불린다. 내부 구조에 대한 사전 지식 없이 바깥에서 애플리케이션을 공격하고, 입력과 출력만 관찰한다. 반대편에 **화이트박스(white-box)** 접근이 있다. 설계 문서, 소스 코드, 그 밖의 자료에 완전히 접근한 상태로 내부를 들여다본다.

### 화이트박스가 압도적으로 빠른 것

소스 코드가 있으면 블랙박스로는 극도로 어렵거나 오래 걸릴 문제를 순식간에 짚어낼 수 있다. 전형적인 예가 **백도어 비밀번호**다. 어떤 계정으로든 로그인시켜 주는 하드코딩된 문자열은 코드에서는 한눈에 보이지만, 비밀번호 추측 공격으로는 사실상 발견이 불가능하다 (→ 22.3). 조건이 붙은 취약점도 마찬가지다. C.3에서 볼 XSS 예제는 다른 파라미터(`type`)가 특정 값(`3`)일 때만 발동한다. 표준적인 퍼징과 취약점 스캐닝은 이런 것을 놓친다.

### 그럼에도 블랙박스를 대체하지 못하는 이유

어떤 의미에서 애플리케이션의 모든 취약점은 "소스 코드 안에" 있다. 따라서 원리적으로는 코드 리뷰만으로 전부 찾아낼 수 있어야 한다. 실제로는 그렇지 않다.

**첫째, 속도의 문제다.** 부록 B의 자동화 기법을 쓰면 분당 수백 개의 테스트 케이스를 보낼 수 있고, 각각이 관련된 코드 경로를 전부 통과한 뒤 즉시 응답을 돌려준다 (→ 부록 B). 모든 폼의 모든 필드에 흔한 취약점의 트리거를 뿌리면, 코드 리뷰로는 며칠 걸릴 문제 더미를 몇 분 만에 찾아내는 일이 흔하다.

**둘째, 계층의 문제다.** 엔터프라이즈급 애플리케이션은 사용자 입력을 여러 계층에 걸쳐 처리하며, 각 계층마다 서로 다른 통제와 검사가 들어간다. **한 조각의 소스 코드에서 명백한 취약점으로 보이는 것이 다른 곳의 코드로 완전히 무력화되어 있을 수 있다.** 코드만 읽어서는 그 사실을 알 수 없다.

그래서 두 접근은 경쟁 관계가 아니라 보완 관계다. 코드 리뷰로 **일견 취약점(prima facie vulnerability)** 을 찾았다면, 그것이 진짜인지 확인하는 가장 쉽고 확실한 방법은 동작 중인 애플리케이션에 실제로 시험해 보는 것이다. 반대로 실행 중인 애플리케이션에서 이상한 동작을 관찰했다면, 근본 원인을 캐는 가장 쉬운 길은 해당 소스 코드를 읽는 것이다. 가능하다면 두 기법을 적절히 섞고, **각각에 쏟을 시간과 노력의 배분은 실제 점검 중 관찰된 애플리케이션의 동작과 코드베이스의 규모·복잡도가 결정하게 하라.**

**표 C-1. 두 접근의 비교**

| 항목 | 블랙박스 | 화이트박스(코드 리뷰) |
|---|---|---|
| 전제 | 실행 중인 인스턴스 | 소스 코드 접근 |
| 강한 영역 | 다층 처리의 실제 결과, 광범위한 퍼징 | 조건부 취약점, 백도어, 숨겨진 기능 |
| 약한 영역 | 조건이 걸린 코드 경로, 미참조 함수 | 다른 계층의 완화 조치, 실제 도달 가능성 |
| 속도 | 분당 수백 케이스 | 사람이 읽는 속도 |
| 산출의 성격 | 재현 가능한 증거 | 검증이 필요한 후보 |

### 공격자의 감사와 개발팀의 코드 보안 리뷰

지금까지 서술한 것은 **바깥에서 들어온 사람이 수행하는 감사**다. 같은 활동이 개발팀 내부에서 이뤄질 때는 성격이 달라진다. 이 관점은 47.12에서 이미 다뤘다 (→ 47.12).

요점만 다시 옮기면 이렇다. 코드 보안 리뷰는 일반 코드 리뷰와 형식이 같되 **코드의 보안 속성을 검토하는 것을 목적으로 삼는다.** 정의상 코드가 작성된 뒤에 수행되므로, 개발 과정에서 쓰는 다른 모든 기법과 도구를 보완하는 위치에 있다. 애플리케이션이 완성될 때까지 기다릴 이유는 없다. 개발하면서 지속적으로, 자주 하는 편이 낫다. 무엇을 볼지는 **체크리스트**로 고정하고 — 인코딩은 적절한가, 보안 관련 HTTP 헤더는 제대로 쓰였는가, 도메인 프리미티브의 불변식은 충분히 엄격한가(→ 44.1), 모든 DB 질의는 파라미터화되어 있는가(→ 27.9), 민감 데이터가 로그로 새지 않도록 무엇을 했는가 — 팀 안팎의 사람을 함께 참여시켜 서로 다른 관점을 끌어들인다.

이 부록의 나머지는 **감사자의 관점**으로 쓰여 있다. 그러나 C.3의 시그니처 목록과 C.4의 위험 API 목록은 그대로 개발팀 체크리스트의 재료가 된다. 감사자가 무엇을 grep으로 찾는지 알면, 그것을 빌드 파이프라인의 검사 항목으로 옮겨 놓을 수 있다.

---

## C.2 코드 리뷰 방법론

어느 정도 기능을 갖춘 애플리케이션이라면 소스 코드가 수천에서 수만 줄에 이른다. 그리고 리뷰에 쓸 수 있는 시간은 대개 며칠로 제한된다. 그러므로 코드 리뷰의 핵심 목표는 "전부 찾기"가 아니라 **주어진 시간과 노력 안에서 최대한 많은 취약점을 찾기**다. 이를 위해서는 구조화된 접근이 필요하다. 손 닿는 곳의 열매(low-hanging fruit)를 빠르게 걷어내고, 남는 시간을 더 미묘하고 찾기 어려운 문제에 쓴다.

원서 저자들의 경험에 따르면 다음 **세 갈래 접근**이 효과적이다.

**1. 사용자 제어 가능 데이터를 진입점부터 추적한다.** 애플리케이션에 데이터가 들어오는 지점을 전부 찾고, 그것을 처리하는 코드를 따라 읽는다. 진입점의 목록은 언어마다 다르다. C.4의 각 언어 항목이 "사용자 제공 데이터 식별" 표를 먼저 두는 이유가 이것이다 (→ 25.5).

**2. 흔한 취약점의 시그니처를 코드베이스에서 검색한다.** 취약점 유형마다 코드에 남는 모양이 꽤 일정하다. 그 패턴을 검색하고, 걸린 사례를 하나씩 검토해 실제 취약점인지 판정한다. C.3이 이 단계의 재료다.

**3. 본질적으로 위험한 코드를 한 줄씩 읽는다.** 애플리케이션의 핵심 보안 메커니즘 — 인증, 세션 관리, 접근 제어, 애플리케이션 전역 입력 검증 — 과 외부 컴포넌트와의 인터페이스, 그리고 네이티브 코드(대개 C/C++)가 쓰인 모든 지점이 이 정독의 대상이다.

3단계가 필요한 이유는 이 부류의 결함이 **검색 가능한 시그니처를 남기지 않기 때문**이다. 세션 토큰 생성기가 `java.util.Random`으로 두 개의 32비트 값을 만들어 이어 붙인다면, 코드 어디에도 "취약"의 표시는 없다. 그것이 암호학적으로 안전하지 않은 PRNG이고 시드 하나로 이후 출력 전체가 결정된다는 사실을 **읽는 사람이 알고 있어야** 판정할 수 있다 (→ 23.2). 접근 제어와 다단계 인증 로직도 마찬가지다. 잘못된 것은 API의 선택이 아니라 검사의 순서와 누락이므로, 흐름을 따라 읽는 것 외에 방법이 없다.

세 단계는 순차적이라기보다 서로를 먹여 살린다. 2단계에서 걸린 시그니처가 3단계 정독의 좌표를 주고, 1단계의 데이터 흐름 추적이 2단계 검색 결과 중 무엇이 실제로 도달 가능한지를 알려 준다.

> **주의 — 커스터마이징의 범위를 먼저 확인하라**
>
> 감사를 시작하기 전에 반드시 짚어야 할 것이 있다. 애플리케이션은 **라이브러리 클래스와 인터페이스를 확장**할 수 있고, **표준 API 호출에 래퍼(wrapper)를 씌워** 쓸 수 있으며, 세션별 정보 저장 같은 보안상 중요한 작업을 **자체 구현**해 놓았을 수 있다. 이 경우 C.4의 표준 API 목록을 grep해도 아무것도 걸리지 않는다. 세부 리뷰에 뛰어들기 전에 이런 커스터마이징이 어디까지 되어 있는지 확인하고, 그에 맞춰 검색 대상을 조정하라.

### 코드 브라우징 도구

이 방법론은 결국 소스를 읽고 패턴을 검색하는 일이다. 효과적으로 하려면 언어의 코드 구조를 이해하고, 특정 API나 표현식의 맥락 정보를 보여 주며, 코드베이스를 빠르게 넘나들게 해 주는 도구가 필요하다.

대부분의 언어는 Visual Studio, NetBeans, Eclipse 같은 개발 환경을 그대로 쓸 수 있다. 그 밖에 여러 언어를 지원하면서 개발보다 **읽기에 최적화된** 범용 코드 브라우징 도구가 있다. 원서 저자들이 선호한 것은 Source Insight로, 소스 트리 탐색, 다목적 검색, 선택한 표현식의 맥락 정보를 띄우는 미리보기 창, 빠른 이동을 제공한다. 도구의 이름보다 중요한 것은 **"심볼 하나를 잡으면 정의와 모든 사용처로 즉시 갈 수 있는가"** 라는 요건이다.

---

## C.3 흔한 취약점의 시그니처

많은 웹 애플리케이션 취약점은 코드베이스 안에서 상당히 일관된 시그니처를 갖는다. 즉 **코드베이스를 빠르게 훑고 검색하는 것만으로 취약점의 상당 부분을 식별할 수 있다.** 아래 예제들은 여러 언어로 되어 있지만, 대부분의 경우 시그니처는 언어 중립적이다. 중요한 것은 실제 API와 문법이 아니라 **쓰이고 있는 프로그래밍 기법**이다.

**표 C-2. 취약점 유형별 시그니처 요약**

| 유형 | 코드에서 찾을 것 | 본문 참조 |
|---|---|---|
| XSS | 사용자 데이터가 섞인 HTML 문자열 연결, 나중에 출력될 멤버 변수로의 대입 | → 32.5, 32.8 |
| SQL 인젝션 | 따옴표로 감싼 SQL 키워드 조각 + 문자열 연결, `createStatement`/`Command` 계열 | → 27.1, 27.9 |
| 경로 순회 | 파일시스템 API에 검증 없이 전달되는 사용자 데이터, 파일명 관련 파라미터 이름 | → 28.3 |
| 임의 리다이렉션 | `Redirect`/`sendRedirect`/`header("Location:")`에 들어가는 사용자 데이터 | → 35.3 |
| OS 명령 실행 | `system`/`exec`/`Process.Start` 계열 + 문자열 연결 | → 28.1 |
| 백도어 비밀번호 | 자격증명 검증 로직 안의 하드코딩 문자열 비교, 미참조 함수, 숨은 디버그 파라미터 | → 22.3, 30.1 |
| 네이티브 코드 결함 | `strcpy`/`strcat`/`memcpy`/`sprintf`, 부호/무부호 비교, 비상수 포맷 문자열 | → 31.4, 31.5 |
| 소스 코드 주석 | `bug` `problem` `bad` `hope` `todo` `fix` `overflow` `crash` `inject` `xss` `trust` | → 30.1 |

### 크로스 사이트 스크립팅

가장 노골적인 XSS는 사용자에게 반환되는 HTML의 일부가 **사용자 제어 가능한 데이터로 명시적으로 조립되는** 형태다. 다음은 쿼리 문자열에서 직접 가져온 문자열로 `href` 링크의 대상을 구성한다.

```csharp
String link = "<a href=" + HttpUtility.UrlDecode(Request.QueryString["refURL"])
    + "&SiteID=" + SiteId + "&Path="
    + HttpUtility.UrlEncode(Request.QueryString["Path"]) + "</a>";
objCell.InnerHtml = link;
```

XSS의 통상적인 처방은 악성일 수 있는 콘텐츠를 HTML 인코딩하는 것이지만(→ 32.8), **연결이 끝난 결과 문자열에는 그 처방을 적용할 수 없다.** 이미 유효한 HTML 마크업을 포함하고 있기 때문이다. 데이터를 정제하려는 어떤 시도든 애플리케이션 자신이 지정한 HTML까지 인코딩해 버려 기능을 망가뜨린다. 따라서 이 코드는, 쿼리 문자열에 담긴 XSS 익스플로잇을 다른 곳의 필터가 차단하지 않는 한 확실히 취약하다. 그리고 **필터 기반으로 XSS를 막으려는 접근은 대개 결함이 있다.** 그런 필터가 있다면 우회 경로를 찾기 위해 그것부터 면밀히 리뷰하라 (→ 32.5).

더 미묘한 경우는 사용자 데이터가 **변수의 값을 설정**하고, 그 변수가 나중에 응답 조립에 쓰이는 형태다.

```java
private void setPageTitle(HttpServletRequest request) throws ServletException
{
    String requestType = request.getParameter("type");
    if ("3".equals(requestType) && null != request.getParameter("title"))
        m_pageTitle = request.getParameter("title");
    else
        m_pageTitle = "Online banking application";
}
```

이런 코드를 만나면 `m_pageTitle` 변수에 이후 어떤 처리가 가해지는지를 끝까지 따라가야 한다. 반환되는 페이지에 어떻게 삽입되는지, 그 시점에 적절히 인코딩되는지를 확인한다. **이 예제는 코드 리뷰의 가치를 명확히 보여 준다.** 이 XSS는 `type` 파라미터가 `3`일 때만 발동한다. 해당 요청에 대한 표준적인 퍼즈 테스트와 취약점 스캐닝은 이 취약점을 탐지하지 못할 가능성이 높다.

### SQL 인젝션

SQL 인젝션은 하드코딩된 문자열 조각들이 사용자 제어 가능 데이터와 연결되어 질의를 이루고, 그것이 데이터베이스에서 실행될 때 발생한다 (→ 27.1).

```csharp
StringBuilder SqlQuery = new StringBuilder(
    "SELECT name, accno FROM TblCustomers WHERE " + SqlWhere);

if (Request.QueryString["CID"] != null && Request.QueryString["PageId"] == "2")
{
    SqlQuery.Append(" AND CustomerID = ");
    SqlQuery.Append(Request.QueryString["CID"].ToString());
}
```

이런 종류의 손 닿는 열매를 빠르게 찾는 방법은 **질의 조립에 흔히 쓰이는 하드코딩 부분 문자열을 검색**하는 것이다. 이 부분 문자열들은 대개 SQL 조각이며 소스에 따옴표로 묶여 있으므로, 따옴표 + SQL 키워드 + 공백의 조합을 검색하면 효율이 좋다.

```
"SELECT    "INSERT    "DELETE    " AND     " OR     " WHERE     " ORDER BY
```

걸린 각 사례에 대해, 그 문자열이 사용자 제어 가능 데이터와 SQL 인젝션이 생기는 방식으로 연결되는지 확인한다. **SQL 키워드는 대소문자를 구분하지 않고 처리되므로 검색도 대소문자 구분 없이 해야 한다.** 각 검색어 뒤에 공백을 붙이면 거짓 양성이 줄어든다.

### 경로 순회

경로 순회의 통상적인 시그니처는 **사용자 제어 가능 입력이 아무 검증 없이, 그리고 적절한 파일이 선택됐는지에 대한 확인 없이 파일시스템 API로 전달되는** 형태다. 가장 흔한 경우는 사용자 데이터가 하드코딩되거나 시스템이 지정한 디렉터리 경로 뒤에 붙는 것으로, 공격자는 점-점-슬래시 시퀀스로 디렉터리 트리를 거슬러 올라가 다른 디렉터리의 파일에 접근한다 (→ 28.3).

```csharp
public byte[] GetAttachment(HttpRequest Request)
{
    FileStream fsAttachment = new FileStream(
        SpreadsheetPath + HttpUtility.UrlDecode(Request.QueryString["AttachName"]),
        FileMode.Open, FileAccess.Read, FileShare.Read);
    ...
}
```

파일 업로드·다운로드를 제공하는 모든 기능을 면밀히 리뷰하라. 사용자 데이터에 반응해 파일시스템 API가 어떻게 호출되는지 이해하고, 조작된 입력으로 의도치 않은 위치의 파일에 접근할 수 있는지 판정해야 한다. 관련 기능을 빠르게 찾는 방법이 둘 있다. 하나는 **파일명과 관련된 쿼리 문자열 파라미터 이름**(위 예제의 `AttachName`)으로 코드베이스를 검색하는 것이고, 다른 하나는 **해당 언어의 파일 API를 전부 검색**해 전달되는 인자를 검토하는 것이다. 후자를 위한 API 목록이 C.4에 있다.

### 임의 리다이렉션

임의 리다이렉션 같은 피싱 벡터는 소스의 시그니처로 잡아내기 쉬운 축에 속한다 (→ 35.3). 다음 예제는 쿼리 문자열의 사용자 데이터로 리다이렉트 대상 URL을 조립한다.

```csharp
private void handleCancel()
{
    httpResponse.Redirect(
        HttpUtility.UrlDecode(Request.QueryString["refURL"])
        + "&SiteCode=" + Request.QueryString["SiteCode"].ToString()
        + "&UserId=" + Request.QueryString["UserId"].ToString());
}
```

임의 리다이렉션은 **클라이언트 측 코드를 살펴보는 것만으로도** 자주 발견된다. 이 경우 애플리케이션 내부에 대한 어떤 특별한 접근 권한도 필요하지 않다.

```javascript
url = document.URL;
index = url.indexOf('?redir=');
target = unescape(url.substring(index + 7, url.length));
target = unescape(target);
if ((index = target.indexOf('//')) > 0) {
    target = target.substring(index + 2, target.length);
    index = target.indexOf('/');
    target = target.substring(index, target.length);
}
target = unescape(target);
document.location = target;
```

이 스크립트의 작성자는 자기 코드가 리다이렉션 공격의 표적이 될 수 있음을 알고 있었다. 그래서 리다이렉트 URL에 이중 슬래시(`http://`의 그것)가 들어 있는지 검사하고, 있으면 이중 슬래시 다음의 첫 단일 슬래시까지 건너뛰어 상대 URL로 바꾼다. **그런데 스크립트는 그 뒤에 `unescape()`를 한 번 더 호출한다.** URL 인코딩된 문자를 다시 풀어내는 이 호출이 검증을 무효화한다. **검증 이후에 정규화를 수행하면 취약점이 된다** (→ 43.4). 이 경우 공격자는 다음 쿼리 문자열로 임의의 절대 URL로 리다이렉트시킬 수 있다.

```
?redir=http:%25252f%25252fwahh-attacker.com
```

### OS 명령 실행

외부 시스템과 접하는 코드는 코드 인젝션 결함의 시그니처를 자주 담고 있다 (→ 28.1). 다음 예제에서 `message`와 `addr` 파라미터는 사용자 제어 가능한 폼 데이터에서 추출되어 UNIX `system` API 호출로 바로 넘어간다.

```c
void send_mail(const char *message, const char *addr)
{
    char sendMailCmd[4096];
    snprintf(sendMailCmd, 4096, "echo '%s' | sendmail %s", message, addr);
    system(sendMailCmd);
    return;
}
```

### 백도어 비밀번호

악의적인 프로그래머가 의도적으로 숨겨 놓은 것이 아닌 한, 테스트나 관리 목적으로 넣어 둔 백도어 비밀번호는 **자격증명 검증 로직을 읽을 때 대개 눈에 띈다.**

```java
private UserProfile validateUser(String username, String password)
{
    UserProfile up = getUserProfile(username);
    if (checkCredentials(up, password) || "oculiomnium".equals(password))
        return up;
    return null;
}
```

같은 방식으로 쉽게 식별되는 것이 더 있다. **미참조 함수(unreferenced functions)** — 어디에서도 호출되지 않는데 코드에 남아 있는 함수 — 와 **숨겨진 디버그 파라미터**다 (→ 30.1). 두 경우 모두 블랙박스에서는 존재 자체를 추측하기 어렵다.

이런 코드가 왜 생기는지, 그리고 설계로 어떻게 막는지는 본문에서 다뤘다. 자격증명과 비밀은 **코드 안에 리터럴로 존재해서는 안 되고**(→ 46.2), 비밀을 담는 타입은 사용 흔적을 스스로 추적하도록 만들 수 있다 (→ 44.5).

### 네이티브 소프트웨어 결함

애플리케이션이 사용하는 네이티브 코드는 임의 코드 실행으로 이어질 수 있는 고전적 취약점을 기준으로 면밀히 리뷰해야 한다 (→ 31.6).

**버퍼 오버플로.** 대개 검사되지 않는 버퍼 조작 API 중 하나를 쓴다. `strcpy`, `strcat`, `memcpy`, `sprintf`와 그 와이드 문자 변종 및 파생형이 대표적이다 (→ 31.4). 이들 API의 모든 사용처를 검색해 **원본 버퍼가 사용자 제어 가능한지**, 그리고 **대상 버퍼가 복사될 데이터를 담기에 충분히 큰지를 코드가 명시적으로 확인했는지**를 검증하는 것이 손쉬운 출발점이다. API 자신은 그 확인을 해 주지 않는다.

```c
BOOL CALLBACK CFiles::EnumNameProc(LPTSTR pszName)
{
    char strFileName[MAX_PATH];
    strcpy(strFileName, pszName);
}
```

안전한 대안 API를 썼다고 해서 오버플로가 없다는 보장은 없다. 실수나 오해로 검사형 API를 안전하지 않게 쓰는 일이 있다. 위 취약점의 다음 "수정"이 그렇다. 복사 길이를 **대상 버퍼가 아니라 원본 문자열의 길이**로 지정했으므로 아무것도 달라지지 않았다.

```c
BOOL CALLBACK CFiles::EnumNameProc(LPTSTR pszName)
{
    char strFileName[MAX_PATH];
    strncpy(strFileName, pszName, strlen(pszName));
}
```

따라서 버퍼 오버플로에 대한 철저한 감사는 대개 **코드베이스 전체를 한 줄씩 읽으며 사용자 제어 가능 데이터에 가해지는 모든 연산을 추적**하는 작업이 된다.

**정수 취약점.** 형태가 다양하고 극도로 미묘할 수 있지만, 일부는 시그니처로 쉽게 식별된다 (→ 31.5). **부호 있는 정수와 부호 없는 정수의 비교**가 대표적인 문제 원인이다. 다음은 앞 취약점의 또 다른 "수정"으로, 부호 있는 `len`을 부호 없는 `sizeof(strFileName)`과 비교한다. 사용자가 `len`이 음수가 되는 상황을 만들어 내면 비교가 통과하고, 검사되지 않은 `strcpy`가 그대로 실행된다.

```c
BOOL CALLBACK CFiles::EnumNameProc(LPTSTR pszName, int len)
{
    char strFileName[MAX_PATH];
    if (len < sizeof(strFileName))
        strcpy(strFileName, pszName);
}
```

**포맷 스트링 취약점.** `printf`와 `FormatMessage` 계열 함수의 사용처 중 **포맷 문자열 인자가 하드코딩이 아니라 사용자 제어 가능한 것**을 찾으면 대개 빠르게 식별된다. 다음 `fprintf` 호출이 그렇다. `tmp`는 사용자명을 포함하며, 그것이 그대로 포맷 문자열 자리에 들어간다.

```c
void logAuthenticationAttempt(char* username)
{
    char tmp[64];
    snprintf(tmp, 64, "login attempt for: %s\n", username);
    tmp[63] = 0;
    fprintf(g_logFile, tmp);
}
```

### 소스 코드 주석

**적지 않은 소프트웨어 취약점이 소스 코드 주석에 스스로 문서화되어 있다.** 개발자가 어떤 연산이 안전하지 않다는 것을 알고 나중에 고치려고 메모를 남겼지만 끝내 고치지 않은 경우가 많다. 테스트에서 이상 동작이 발견되어 주석으로 기록됐으나 끝까지 조사되지 않은 경우도 있다. 원서 저자들이 어느 애플리케이션의 **운영 코드**에서 실제로 마주친 예다.

```c
char buf[200]; // I hope this is big enough
strcpy(buf, userinput);
```

큰 코드베이스에서 흔한 문제를 가리키는 주석을 검색하는 것은 손 닿는 열매를 얻는 효과적인 방법이다. 유용성이 입증된 검색어는 다음과 같다.

```
bug    problem    bad    hope    todo    fix
overflow    crash    inject    xss    trust
```

같은 검색이 개발 조직 내부에서도 값이 있다. 침투 테스트 보고서를 받았을 때 **보고된 것만 고치는 수준**에 머무르지 않고 같은 종류의 결함을 grep으로 찾아내는 것, 그리고 그 grep을 빌드 파이프라인에 넣어 두는 것이 학습의 최소 단위다 (→ 47.12).

---

## C.4 언어별 점검 항목

이 절은 웹 개발에 흔히 쓰이는 언어별로 네 가지를 정리한다. **(1) 사용자 제출 데이터를 획득하는 방법, (2) 사용자 세션과 상호작용하는 방법, (3) 안전하지 않게 쓰이면 취약점을 만드는 API, (4) 보안에 영향을 주는 설정 항목**이다. (1)은 C.2 방법론의 1단계(데이터 추적)에 필요한 진입점 목록이고, (3)은 2단계(시그니처 검색)의 검색 대상이다.

### Java 플랫폼

**사용자 제공 데이터 획득.** Java 애플리케이션은 `javax.servlet.http.HttpServletRequest` 인터페이스를 통해 사용자 입력을 받는다. 이 인터페이스는 `javax.servlet.ServletRequest`를 확장하며, 두 인터페이스에 요청 데이터에 접근하는 다수의 API가 있다.

| 분류 | API |
|---|---|
| 파라미터 | `getParameter`, `getParameterValues`, `getParameterNames`, `getParameterMap`, `getQueryString` |
| 헤더·쿠키 | `getHeader`, `getHeaders`, `getHeaderNames`, `getCookies`, `getIntHeader`, `getDateHeader` |
| URL·경로 | `getRequestURI`, `getRequestURL`, `getPathInfo`, `getPathTranslated`, `getContextPath`, `getServletPath` |
| 본문 | `getInputStream`, `getReader` |
| 메타데이터 | `getMethod`, `getProtocol`, `getContentType`, `getContentLength`, `getRemoteAddr`, `getRemoteHost`, `getRequestedSessionId` |

**세션 상호작용.** `javax.servlet.http.HttpSession` 인터페이스를 쓴다. 세션별 저장소는 문자열 이름 → 객체 값의 맵이다. 주요 API는 `HttpServletRequest.getSession`, `HttpSession.getAttribute`, `setAttribute`, `removeAttribute`, `getAttributeNames`, `getId`, `invalidate`이며, 구식 API인 `getValue`/`putValue`가 남아 있는 코드도 있다.

**파일 접근.** 핵심 클래스는 `java.io.File`이다. 보안 관점에서 가장 흥미로운 것은 생성자 호출로, 부모 디렉터리 + 파일명을 받거나 경로명 하나를 받는다. 어느 형태든 사용자 제어 가능 데이터가 점-점-슬래시 검사 없이 파일명 인자로 전달되면 경로 순회 취약점이 생긴다.

```java
String userinput = "..\\boot.ini";
File f = new File("C:\\temp", userinput);
```

파일 내용을 읽고 쓰는 데 가장 흔히 쓰이는 클래스는 `java.io.FileInputStream`, `java.io.FileOutputStream`, `java.io.FileReader`, `java.io.FileWriter`다. 이들은 생성자에서 `File` 객체를 받거나 파일명 문자열로 직접 파일을 열 수 있으며, 후자에도 같은 문제가 적용된다.

**데이터베이스 접근.** 임의의 문자열을 SQL 질의로 실행하는 데 가장 흔히 쓰이는 API는 `java.sql.Connection.createStatement`, `java.sql.Statement.execute`, `java.sql.Statement.executeQuery`다. 사용자 제어 가능 입력이 실행되는 문자열의 일부라면 SQL 인젝션 가능성이 높다.

더 견고한 대안은 미리 컴파일된 SQL 문을 만들고 파라미터 자리표시자의 값을 타입 안전하게 설정하는 API다. `java.sql.Connection.prepareStatement`, `java.sql.PreparedStatement.setString`, `setInt`, `setBoolean`, `setObject`, 그리고 `PreparedStatement.execute`/`executeQuery` 등이다. **의도대로 쓰이는 한 이들은 SQL 인젝션에 취약하지 않다** (→ 27.9).

**동적 코드 실행.** Java 언어 자체에는 Java 소스를 동적으로 평가하는 메커니즘이 없다. 다만 일부 구현(특히 데이터베이스 제품 내부)이 그런 기능을 제공한다. 리뷰 대상 애플리케이션이 Java 코드를 실행 시점에 조립한다면, 그 방식과 사용자 데이터의 개입 여부를 파악해야 한다.

**OS 명령 실행.** `java.lang.Runtime.getRuntime`과 `java.lang.Runtime.exec`가 통로다. 사용자가 `exec`에 전달되는 문자열을 완전히 제어하면 임의 명령 실행에 거의 확실히 취약하다.

```java
String userinput = "calc";
Runtime.getRuntime().exec(userinput);
```

**그러나 문자열의 일부만 제어할 때는 결론이 달라진다.** `exec` API 자체는 `&`나 `|` 같은 셸 메타문자를 해석하지 않는다. 따라서 다음은 사용자 데이터가 `notepad` 프로세스의 명령행 인자로 넘어갈 뿐 공격이 실패한다.

```java
String userinput = "| calc";
Runtime.getRuntime().exec("notepad " + userinput);
```

반면 `notepad` 뒤의 공백 하나가 없는 다음 코드는 미묘하게 다르다. 사용자 데이터가 실행 파일 경로 자체를 바꾼다.

```java
String userinput = "\\..\\system32\\calc";
Runtime.getRuntime().exec("notepad" + userinput);
```

이런 상황에서 애플리케이션은 코드 실행이 아닌 다른 것에 취약한 경우가 많다. 예를 들어 애플리케이션이 사용자 제어 가능한 URL을 인자로 `wget`을 실행한다면, 공격자는 `wget`에 위험한 명령행 인자를 넘겨 문서를 파일시스템의 임의 위치에 저장하게 만들 수 있다.

**URL 리다이렉션.** `javax.servlet.http.HttpServletResponse.sendRedirect`가 통상적인 수단이며, 상대·절대 URL 문자열을 받는다. 이 문자열이 사용자 제어 가능하면 피싱 벡터에 취약할 가능성이 높다 (→ 35.3). **`setStatus`와 `addHeader`의 사용처도 반드시 확인하라.** 리다이렉트는 결국 `Location` 헤더를 담은 3xx 응답일 뿐이므로, 애플리케이션이 이 두 API로 리다이렉트를 구현했을 수 있다.

**소켓.** `java.net.Socket` 클래스는 생성자에서 다양한 형태의 대상 호스트·포트 정보를 받는다. 이 인자가 어떤 식으로든 사용자 제어 가능하면, 인터넷상의 임의 호스트나 애플리케이션이 놓인 사설 DMZ·내부망으로 네트워크 커넥션을 열게 만들 수 있다 (→ 28.8).

**환경 설정.** `web.xml` 파일이 Java 플랫폼 환경의 설정을 담는다. 컨테이너 관리 보안을 쓰는 애플리케이션은 보호할 리소스(또는 리소스 집합)마다 인증과 인가를 **애플리케이션 코드 바깥의** `web.xml`에 선언한다. 주요 항목은 `security-constraint`(그 안의 `web-resource-collection`, `url-pattern`, `http-method`, `auth-constraint`, `role-name`), `login-config`의 `auth-method`(`BASIC`, `DIGEST`, `FORM`, `CLIENT-CERT`), `security-role`, `session-config`의 `session-timeout`, 그리고 `user-data-constraint`의 `transport-guarantee`다. 서블릿은 `HttpServletRequest.isUserInRole`로 같은 역할 정보를 코드 안에서 확인할 수 있고, `security-role-ref` 매핑 항목이 내장 역할 검사와 컨테이너 역할을 연결한다.

`web.xml` 외에 애플리케이션 서버마다 부차적인 배포 파일(예: `weblogic.xml`)에 다른 보안 관련 설정이 들어 있을 수 있다. **환경 설정을 검토할 때 이들을 빠뜨리지 말라** (→ 12.6).

### ASP.NET

**사용자 제공 데이터 획득.** `System.Web.HttpRequest` 클래스가 통로다. 주요 속성·메서드는 다음과 같다.

| 분류 | API |
|---|---|
| 파라미터 | `Params`, `Item`, `Form`, `QueryString` |
| 헤더·쿠키 | `Headers`, `Cookies`, `ServerVariables`, `UserAgent`, `UserLanguages`, `UrlReferrer` |
| URL·경로 | `Url`, `RawUrl`, `Path`, `PathInfo`, `FilePath`, `PhysicalPath` |
| 본문·업로드 | `InputStream`, `BinaryRead`, `Files`, `TotalBytes`, `ContentType`, `ContentLength` |
| 클라이언트 정보 | `UserHostAddress`, `UserHostName`, `HttpMethod`, `AcceptTypes` |

**세션 상호작용.** 세 갈래가 있다. 첫째, `Session` 속성은 인덱스 컬렉션처럼 접근한다.

```csharp
Session["MyName"] = txtMyName.Text;              // 저장
lblWelcome.Text = "Welcome " + Session["MyName"]; // 조회
```

둘째, **ASP.NET 프로필**은 `Session`과 유사하게 동작하되 사용자 프로필에 묶여 있어 **같은 사용자의 서로 다른 세션에 걸쳐 지속된다.** 사용자는 인증 또는 고유 지속 쿠키로 세션 간에 재식별된다. `Profile.MyName` 형태로 접근한다. 셋째, `System.Web.SessionState.HttpSessionState` 클래스가 문자열 이름 → 객체 값 매핑을 제공하며 `Item`, `Add`, `Remove`, `Keys`, `SessionID`, `Abandon`, `Clear` 등으로 접근한다.

**파일 접근.** `System.IO.File`이 핵심 클래스로, 관련 메서드는 모두 정적이고 공개 생성자가 없다. **이 클래스의 37개 메서드가 전부 파일명을 인자로 받으며, 점-점-슬래시 검사 없이 사용자 데이터가 전달되는 모든 지점에 경로 순회 취약점이 존재할 수 있다.** 파일 내용을 읽고 쓰는 데는 `System.IO.FileStream`, `System.IO.StreamReader`, `System.IO.StreamWriter`가 흔히 쓰이며, 파일 경로를 인자로 받는 생성자들이 같은 문제를 갖는다.

**데이터베이스 접근.** SQL 문을 만들고 실행하는 주요 클래스는 다음과 같다.

- `System.Data.SqlClient.SqlCommand`
- `System.Data.SqlClient.SqlDataAdapter`
- `System.Data.OleDb.OleDbCommand`
- `System.Data.Odbc.OdbcCommand`
- `System.Data.SqlServerCe.SqlCeCommand`

각 클래스는 SQL 문 문자열을 받는 생성자를 갖고, `CommandText` 속성으로 현재 SQL 문을 읽고 쓸 수 있으며, 설정이 끝나면 여러 `Execute` 메서드 중 하나로 실행된다. 사용자 입력이 실행되는 문자열의 일부라면 SQL 인젝션 가능성이 높다. 나열된 모든 클래스는 `Parameters` 속성으로 준비된 문(prepared statement)을 지원한다. 의도대로 쓰이면 SQL 인젝션에 취약하지 않다.

**동적 코드 실행.** VBScript의 `Eval` 함수는 VBScript 표현식 문자열을 받아 평가하고 결과를 반환한다. `Execute`와 `ExecuteGlobal`은 ASP 코드가 담긴 문자열을 받아 스크립트에 직접 쓰인 것처럼 실행한다. **콜론 구분자로 여러 문장을 이어 붙일 수 있다.** 사용자 데이터가 `Execute`에 전달되면 임의 명령 실행에 취약할 가능성이 높다.

**OS 명령 실행.** `System.Diagnostics.Process.Start`와 `System.Diagnostics.ProcessStartInfo`가 외부 프로세스를 띄운다. 정적 `Process.Start`에 파일명 문자열을 넘기거나, `Process` 객체의 `StartInfo` 속성에 파일명을 설정한 뒤 `Start`를 호출한다. 사용자가 파일명 문자열을 완전히 제어하면 임의 명령 실행에 거의 확실히 취약하다.

**이 API는 `&`나 `|` 같은 셸 메타문자를 해석하지 않으며, 파일명 파라미터 안에 명령행 인자를 받지도 않는다.** 따라서 사용자가 파일명의 일부만 제어할 때 성립할 가능성이 있는 공격은 다음 형태 — 상대 경로로 다른 실행 파일을 지목하는 것 — 뿐이다.

```csharp
string userinput = "..\\..\\..\\Windows\\System32\\calc";
Process.Start("C:\\Program Files\\MyApp\\bin\\" + userinput);
```

명령행 인자는 `ProcessStartInfo` 클래스의 `Arguments` 속성으로 설정한다. `Arguments`만 사용자 제어 가능하다면 코드 실행이 아닌 다른 취약점이 성립할 수 있다. Java의 `wget` 사례와 같은 구조다.

**URL 리다이렉션.** 다음 API가 HTTP 리다이렉트를 낸다.

- `System.Web.HttpResponse.Redirect` — 통상적인 수단. 상대·절대 URL을 받는다.
- `System.Web.HttpResponse.Status` / `StatusCode`
- `System.Web.HttpResponse.AddHeader` / `AppendHeader`
- `Server.Transfer`

`Status`/`StatusCode`와 `AddHeader`/`AppendHeader`의 사용처도 반드시 확인하라. `Location` 헤더를 담은 3xx 응답을 이 API들로 직접 조립했을 수 있다. **다만 `Server.Transfer`는 실제로 HTTP 리다이렉트를 일으키지 않는다.** 현재 요청에 대해 서버에서 처리 중인 페이지를 바꿀 뿐이므로 외부 URL로의 리다이렉션에 전복될 수 없고, 따라서 공격자에게는 대개 쓸모가 적다.

**소켓.** `System.Net.Sockets.Socket` 클래스로 소켓을 만들고, 대상 호스트의 IP와 포트를 인자로 받는 `Connect` 메서드로 연결한다. 이 정보가 사용자 제어 가능하면 임의 호스트로의 커넥션을 유발할 수 있다 (→ 28.8).

**환경 설정.** 웹 루트의 `web.config` XML 파일이 설정을 담는다. 보안 관련 항목으로는 `<authentication mode>`, `<authorization>`의 `allow`/`deny`, `<customErrors mode/defaultRedirect>`, `<httpRuntime maxRequestLength>`, `<pages validateRequest/enableViewStateMac/viewStateEncryptionMode>`, `<sessionState mode/cookieless/timeout>`, `<httpCookies httpOnlyCookies/requireSSL>`, `<trace enabled>`, `<compilation debug>`, `<machineKey>`, `<identity impersonate>` 등이 있다. **데이터베이스 커넥션 문자열 같은 민감 데이터가 설정 파일에 저장된다면 ASP.NET의 "protected configuration" 기능으로 암호화해야 한다** (→ 46.2).

### PHP

**사용자 제공 데이터 획득.** PHP는 배열 변수들로 사용자 제출 데이터를 저장한다.

| 변수 | 담는 것 |
|---|---|
| `$_GET` | URL 쿼리 문자열 파라미터 |
| `$_POST` | 메시지 본문 파라미터 |
| `$_REQUEST` | `$_GET` + `$_POST` + `$_COOKIE` |
| `$_COOKIE` | 요청에 담긴 쿠키 |
| `$_SERVER` | 요청 헤더와 서버 환경 변수(`HTTP_REFERER`, `HTTP_USER_AGENT`, `QUERY_STRING`, `REQUEST_URI`, `PATH_INFO`, `PHP_SELF` 등) |
| `$_FILES` | 업로드된 파일 정보 |
| `$_ENV` | 환경 변수 |
| `$_SESSION` | 세션 저장소 |

`$HTTP_GET_VARS`, `$HTTP_POST_VARS`, `$HTTP_COOKIE_VARS`, `$HTTP_SERVER_VARS`, `$HTTP_POST_FILES`, `$HTTP_ENV_VARS`는 같은 역할의 구식 변수들이다.

PHP 애플리케이션의 입력 접근 지점을 식별할 때 염두에 둘 **변칙**이 넷 있다.

1. `$GLOBALS`는 스크립트의 전역 스코프에 정의된 모든 변수의 참조를 담은 배열이다. **이름으로 다른 변수에 접근하는 데 쓰일 수 있다.**
2. 설정 지시자 `register_globals`가 켜져 있으면 PHP는 모든 요청 파라미터 — `$_REQUEST`에 담기는 모든 것 — 에 대해 전역 변수를 만든다. 즉 애플리케이션이 **해당 파라미터와 같은 이름의 변수를 그냥 참조하는 것만으로** 사용자 입력에 접근할 수 있다. 이 방식이 쓰이고 있다면, **코드베이스를 한 줄씩 읽으며 그렇게 쓰인 변수를 찾는 것 외에 모든 사례를 식별할 방법이 없다.**
3. PHP는 요청에 담긴 임의의 커스텀 HTTP 헤더에 대해 `$_SERVER` 항목을 추가한다. `Foo: Bar` 헤더는 `$_SERVER['HTTP_FOO'] = "Bar"`가 된다.
4. 이름에 대괄호 첨자가 들어간 입력 파라미터는 자동으로 배열로 변환된다. `search.php?query[a]=foo&query[b]=bar`는 `$_GET['query']`를 두 원소짜리 배열로 만든다. **스칼라 값을 기대하는 함수에 배열이 전달되면 예상 밖의 동작이 발생할 수 있다.**

**세션 상호작용.** `$_SESSION` 배열을 쓴다(구식 `$HTTP_SESSION_VARS`도 같은 방식). `register_globals`가 켜져 있으면 `session_register("MyName")` 형태로 전역 변수를 세션에 저장할 수도 있다.

**파일 접근.** PHP는 파일 접근 함수가 대단히 많고, **그중 다수가 URL을 비롯해 원격 파일에 접근할 수 있는 구성을 받아들인다.** 지정한 파일의 내용을 읽거나 쓰는 함수는 다음과 같다. 사용자 제어 가능 데이터가 전달되면 서버 파일시스템의 임의 파일에 접근당할 수 있다.

```
fopen  readfile  file  fpassthru  gzopen  gzfile  gzpassthru  readgzfile
copy  rename  rmdir  mkdir  unlink  file_get_contents  file_put_contents
parse_ini_file
```

지정한 PHP 스크립트를 인클루드하고 평가하는 함수는 다음과 같다. **공격자가 자기가 제어하는 파일을 애플리케이션이 평가하게 만들 수 있으면 서버에서 임의 명령을 실행할 수 있다** (→ 28.4).

```
include  include_once  require  require_once  virtual
```

원격 파일 인클루드가 불가능하더라도, 서버의 어딘가에 임의 파일을 업로드할 방법이 있으면 여전히 명령 실행이 가능하다는 점에 유의하라.

설정 옵션 `allow_url_fopen`으로 일부 파일 함수의 원격 파일 접근을 막을 수 있다. **그러나 기본값이 `1`(원격 허용)이므로** `http://`, `https://`, `ftp://`, `php://`, `data://`, `compress.zlib://`, `phar://` 같은 스트림 래퍼로 원격 파일을 가져올 수 있다. `allow_url_fopen`이 `0`이어도 설치된 확장에 따라 다른 경로로 원격 파일에 접근하는 방법이 남을 수 있다. PHP 5.2 이후에는 기본 비활성인 `allow_url_include` 옵션이 추가되어, 파일 인클루드 함수에 원격 파일을 지정하는 것을 막는다.

**데이터베이스 접근.** 질의를 보내고 결과를 받는 함수는 `mysql_query`, `mssql_query`, `pg_query`다. SQL 문이 단순 문자열로 전달되므로 사용자 입력이 그 일부라면 SQL 인젝션 가능성이 높다. 준비된 문을 만드는 함수는 `mysqli->prepare`, `stmt->prepare`, `stmt->bind_param`, `stmt->execute`, `odbc_prepare`다.

**동적 코드 실행.** 다음 함수들이 PHP 코드를 동적으로 평가한다. **세미콜론 구분자로 여러 문장을 이어 붙일 수 있다.**

```
eval  call_user_func  call_user_func_array
call_user_method  call_user_method_array  create_function
```

정규표현식 검색·치환 함수 `preg_replace`는 `/e` 옵션과 함께 호출되면 매치마다 특정 PHP 코드를 실행한다. 동적으로 실행되는 PHP 안에 사용자 데이터가 나타나면 취약할 가능성이 높다.

또 하나 주의할 PHP의 특징은 **함수 이름을 담은 변수로 함수를 동적으로 호출**할 수 있다는 것이다.

```php
<?php
$var = $_GET['func'];
$var();
?>
```

이 상황에서 사용자는 `func` 파라미터를 바꿔 임의 함수를 (인자 없이) 호출시킬 수 있다. 예를 들어 `phpinfo`를 호출하면 설정 옵션, OS 정보, 설치된 확장을 포함한 PHP 환경 정보가 대량으로 출력된다 (→ 30.1).

**OS 명령 실행.** 다음 함수들이 OS 명령을 실행한다. **모든 경우에 `|` 문자로 명령을 이어 붙일 수 있다.**

```
exec  passthru  popen  proc_open  shell_exec  system  백틱 연산자(`)
```

**URL 리다이렉션.** `http_redirect`, `header`, `HttpMessage::setResponseCode`, `HttpMessage::setHeaders`가 쓰인다. 통상적인 수단은 상대·절대 URL 문자열을 받는 `http_redirect`다. `header` 함수에 적절한 `Location` 헤더를 넘겨도 PHP가 리다이렉트가 필요하다고 판단한다.

```php
header("Location: /target.php");
```

**소켓.** `socket_create`, `socket_connect`, `socket_write`, `socket_send`, `socket_recv`, `fsockopen`, `pfsockopen`이 있다. `fsockopen`과 `pfsockopen`은 지정한 호스트·포트로 소켓을 열고 **일반 파일 함수(`fwrite`, `fgets` 등)와 함께 쓸 수 있는 파일 포인터를 반환한다.**

**환경 설정.** PHP 설정은 Windows INI 파일과 같은 구조의 `php.ini`에 있다.

**`register_globals`** — 앞서 본 대로 모든 요청 파라미터에 대해 전역 변수를 만든다. PHP는 변수를 사용 전에 초기화하도록 요구하지 않으므로, 공격자가 변수를 임의 값으로 초기화시키는 취약점이 쉽게 만들어진다.

```php
if (check_credentials($username, $password))
{
    $authenticated = 1;
}
if ($authenticated)
{
```

`$authenticated`가 명시적으로 `0`으로 초기화되지 않았으므로, 공격자는 요청 파라미터 `authenticated=1`을 제출해 **자격증명 검사가 수행되기 전에** 전역 변수 `$authenticated`를 `1`로 만들어 로그인을 우회할 수 있다. PHP 4.2.0부터 기본 비활성이지만, 다수의 레거시 애플리케이션이 이 동작에 의존하므로 `php.ini`에서 명시적으로 켜 둔 경우를 자주 만난다. PHP 6에서 제거됐다.

**`safe_mode`** — 켜면 일부 위험 함수의 사용에 제약이 걸린다. `shell_exec`는 비활성화되고, `mail` 함수의 `additional_parameters` 인자는 SMTP 인젝션을 유발할 수 있어 비활성화되며(→ 28.1), `exec`는 설정된 `safe_mode_exec_dir` 안의 실행 파일만 실행할 수 있고 명령 문자열의 메타문자는 자동 이스케이프된다. **그러나 모든 위험 함수가 제약되는 것은 아니고, 일부 제약은 다른 설정 옵션의 영향을 받으며, 우회 방법도 여럿 알려져 있다. 안전 모드를 만병통치약으로 취급해서는 안 된다.** PHP 6에서 제거됐다.

**`magic_quotes_gpc`** — 켜면 요청 파라미터에 담긴 작은따옴표, 큰따옴표, 백슬래시, 널 문자가 백슬래시로 자동 이스케이프된다(`magic_quotes_sybase`는 작은따옴표를 작은따옴표로 이스케이프한다). 안전하지 않은 DB 호출을 사용자 입력으로부터 보호하려는 의도지만 **모든 SQL 인젝션을 막지 못한다.** 숫자 필드로의 인젝션은 작은따옴표를 쓸 필요가 없고(→ 27.1), 따옴표가 이스케이프된 데이터도 DB에서 다시 읽힐 때 2차(second-order) 공격에 쓰일 수 있다 (→ 27.5). 또 이스케이프가 필요 없는 맥락에서 입력을 원치 않게 변형해 `stripslashes`로 되돌려야 하는 문제를 만들고, 애플리케이션이 `addslashes`로 자체 이스케이프까지 수행하는 경우 **이중 이스케이프가 발생해 오히려 위험 문자가 이스케이프되지 않는 결과**를 낳는다. 권고는 명확하다. 준비된 문을 쓰고 매직 쿼트는 끈다. PHP 6에서 제거됐다.

그 밖에 보안에 영향을 주는 대표적 옵션으로 `allow_url_fopen`, `allow_url_include`, `display_errors`, `log_errors`, `open_basedir`, `disable_functions`, `file_uploads`, `upload_tmp_dir`, `session.save_path`, `expose_php`가 있다.

### Perl

Perl은 **같은 일을 여러 방식으로 할 수 있게 허용하는 것으로 악명 높다.** 게다가 서로 다른 요구를 충족하는 모듈이 무수히 많다. **사용 중인 비표준·자체 제작 모듈이 있다면, 그것이 강력하거나 위험한 함수를 쓰는지 면밀히 검토하라.** 애플리케이션이 그 함수를 직접 쓴 것과 동일한 취약점을 들여올 수 있다.

`CGI.pm`이 웹 애플리케이션 작성에 널리 쓰이는 모듈이며, Perl 코드 리뷰에서 가장 자주 만나는 API를 제공한다.

**사용자 제공 데이터 획득.** CGI 질의 객체의 멤버 함수들이다.

| 분류 | 함수 |
|---|---|
| 파라미터 | `param`, `param_fetch`, `Vars`, `url_param`, `query_string` |
| 쿠키·헤더 | `cookie`, `raw_cookie`, `http`, `https`, `referer`, `user_agent` |
| 요청 정보 | `request_method`, `request_uri`, `path_info`, `remote_host`, `remote_addr` |
| 업로드 | `upload`, `uploadInfo` |

**세션 상호작용.** `CGI::Session` 모듈이 `CGI.pm`을 확장해 세션 추적과 데이터 저장을 제공한다.

```perl
$q->session_data("MyName" => param("username"));   # 저장
print "Welcome " . $q->session_data("MyName");     # 조회
```

**파일 접근.** `open`과 `sysopen`이다. `open`은 지정 파일의 내용을 읽고 쓴다. 사용자 제어 가능 데이터가 파일명 인자로 전달되면 임의 파일 접근이 가능하다. **그리고 Perl의 `open`에는 훨씬 위험한 성질이 하나 더 있다. 파일명 인자가 파이프 문자로 시작하거나 끝나면 그 내용이 명령 셸로 전달된다.** 공격자가 파이프나 세미콜론 같은 셸 메타문자를 주입할 수 있으면 임의 명령 실행이 성립한다.

```perl
$useraddr = $query->param("useraddr");
open (MAIL, "| /usr/bin/sendmail $useraddr");
print MAIL "To: $useraddr\n";
```

**데이터베이스 접근.** `selectall_arrayref`는 질의를 보내고 결과를 배열의 배열로 반환하며, `do`는 질의를 실행하고 영향받은 행 수만 반환한다. 두 경우 모두 SQL 문이 단순 문자열로 전달된다. 준비된 문은 `prepare`와 `execute`로 만든다.

**동적 코드 실행.** `eval`이 Perl 코드 문자열을 동적으로 실행한다. **세미콜론 구분자로 여러 문장을 이어 붙일 수 있다.**

**OS 명령 실행.** `system`, `exec`, `qx`, 백틱 연산자. **모든 경우에 `|` 문자로 명령을 이어 붙일 수 있다.**

**URL 리다이렉션.** CGI 질의 객체의 `redirect` 함수가 상대·절대 URL 문자열을 받는다.

**소켓.** `socket`으로 소켓을 만들고, 대상 호스트·포트를 담은 `sockaddr_in` 구조체를 받는 `connect`로 연결한다.

**환경 설정 — 테인트 모드.** Perl은 사용자 입력이 위험한 함수로 전달되는 것을 막는 데 도움이 되는 **테인트 모드(taint mode)** 를 제공한다. 인터프리터에 `-T` 플래그를 주면 켜진다 (→ 44.7).

```perl
#!/usr/bin/perl -T
```

테인트 모드에서 인터프리터는 프로그램 바깥에서 들어온 모든 입력을 추적해 **오염됨(tainted)** 으로 표시한다. 오염된 값에 기반해 값이 대입된 변수도 오염된다.

```perl
$path = "/home/pubs";              # 오염되지 않음
$filename = param("file");         # 요청 파라미터 — 오염됨
$full_path = $path . $filename;    # 전파되어 오염됨
```

오염된 변수는 `eval`, `system`, `exec`, `open` 등 강력한 명령들에 전달될 수 없다. 오염된 데이터를 민감한 연산에 쓰려면 **패턴 매칭을 수행해 매치된 부분 문자열을 추출**하는 방식으로 "세척"해야 한다.

```perl
$full_path =~ m/^([a-zA-Z1-9]+)$/;   # 영숫자 부분 매치
$clean_full_path = $1;               # 첫 부분 매치 — 오염 해제됨
```

**테인트 모드는 개발자가 적절한 정규표현식을 쓸 때만 효과가 있다.** 표현식이 지나치게 관대해서 사용될 맥락에서 문제를 일으킬 수 있는 데이터까지 추출한다면 보호는 실패하고 애플리케이션은 여전히 취약하다. 실질적으로 테인트 모드는 **위험한 연산에 쓰기 전에 모든 입력을 적절히 검증하라고 프로그래머에게 상기시키는 장치**이지, 그 검증이 충분하다는 보장이 아니다 (→ 43.4).

### JavaScript

클라이언트 측 JavaScript는 애플리케이션 내부에 대한 어떤 권한도 없이 접근할 수 있으므로, **어떤 상황에서든 보안 관점의 코드 리뷰를 수행할 수 있다.** 리뷰의 핵심 초점은 DOM 기반 XSS처럼 클라이언트 컴포넌트에서 만들어져 사용자를 위험에 빠뜨리는 취약점을 식별하는 것이다 (→ 32.7). 그 밖에도 **클라이언트에서 어떤 입력 검증이 구현되어 있는지**, 그리고 **동적으로 생성되는 사용자 인터페이스가 어떻게 조립되는지**를 이해하기 위해서도 JavaScript를 읽는다 (→ 26.7).

리뷰할 때는 `.js` 파일과 **HTML 콘텐츠에 임베드된 스크립트를 모두** 포함해야 한다.

집중해야 할 API는 두 부류다. **DOM 기반 데이터를 읽는 것**과 **현재 문서에 쓰거나 문서를 변형하는 것**이다.

| 부류 | API |
|---|---|
| DOM 데이터를 읽는 것 | `document.location`(및 `href`, `search`, `hash`, `pathname`, `protocol`, `host`), `document.URL`, `document.documentURI`, `document.URLUnencoded`, `document.baseURI`, `location`, `window.name`, `document.referrer`, `document.cookie` |
| 문서에 쓰거나 변형하는 것 | `document.write`, `document.writeln`, `element.innerHTML`, `element.outerHTML`, `eval`, `setTimeout`/`setInterval`(문자열 인자), `new Function`, `execScript`, `location`/`location.href`로의 대입 |

첫 부류의 값이 두 번째 부류로 흘러드는 경로가 곧 DOM 기반 XSS다. 그 사이에 검증이 있는지, 있다면 그 검증이 정규화보다 **뒤에** 오는지를 확인하라 (→ 32.9, 43.4).

### 데이터베이스 코드 컴포넌트

웹 애플리케이션은 데이터베이스를 단순 저장소 이상으로 쓴다. 오늘날의 데이터베이스는 풍부한 프로그래밍 인터페이스를 갖추고 있어 상당한 비즈니스 로직이 데이터베이스 계층 자체에 구현된다. 저장 프로시저, 트리거, 사용자 정의 함수가 핵심 작업을 수행한다. **따라서 웹 애플리케이션의 소스 코드를 리뷰할 때 데이터베이스에 구현된 모든 로직을 리뷰 범위에 포함시켜야 한다.**

실무에서 주의할 영역은 둘이다.

**첫째, 데이터베이스 컴포넌트 자체의 SQL 인젝션.** 웹 애플리케이션 코드 전체가 준비된 문을 제대로 쓰고 있더라도, 데이터베이스 컴포넌트가 사용자 입력으로 질의를 안전하지 않게 조립하면 SQL 인젝션은 여전히 존재한다.

```sql
CREATE PROCEDURE show_current_orders (@name varchar(400) = NULL)
AS
DECLARE @sql nvarchar(4000)
SELECT @sql = 'SELECT id_num, searchstring FROM searchorders WHERE ' +
              'searchstring = ''' + @name + '''';
EXEC (@sql)
GO
```

애플리케이션이 `name` 값을 안전하게 저장 프로시저에 넘기더라도, 프로시저 자신이 그것을 동적 질의에 직접 연결하므로 취약하다. 문자열을 동적으로 실행하는 구문은 플랫폼마다 다르다. **MS-SQL은 `EXEC`, Oracle은 `execute immediate`, Sybase는 `exec`, DB2는 `EXEC SQL`이다.** 데이터베이스 코드 컴포넌트에서 이 표현들이 나타나는 모든 지점을 면밀히 리뷰하라.

> Oracle에서 저장 프로시저는 기본적으로 **호출자가 아니라 정의자의 권한으로 실행된다**(UNIX의 SUID 프로그램과 같다). 따라서 애플리케이션이 낮은 권한의 계정으로 DB에 접속하고 저장 프로시저는 DBA 계정으로 만들어졌다면, 프로시저 안의 SQL 인젝션 결함 하나가 권한 상승과 임의 질의 실행으로 이어진다 (→ 27.7).

**둘째, 위험한 함수 호출.** 저장 프로시저 같은 맞춤 코드 컴포넌트는 흔치 않거나 강력한 동작을 수행하는 데 쓰인다. 사용자 데이터가 위험한 함수로 안전하지 않게 전달되면 함수의 성격에 따라 다양한 취약점이 생긴다. 다음 저장 프로시저는 `@loadfile`과 `@loaddir` 파라미터에 명령 인젝션 취약점을 갖는다.

```sql
Create import_data (@loadfile varchar(25), @loaddir varchar(25)) as
begin
select @cmdstring = "$PATH/firstload " + @loadfile + " " + @loaddir
exec @ret = xp_cmdshell @cmdstring
End
```

안전하지 않게 호출되면 위험할 수 있는 함수는 다음과 같다.

- MS-SQL과 Sybase의 강력한 기본 저장 프로시저 — 명령 실행, 레지스트리 접근 등
- 파일시스템 접근을 제공하는 함수
- 데이터베이스 외부의 라이브러리에 링크하는 사용자 정의 함수
- 네트워크 접근을 유발하는 함수 — MS-SQL의 `openRowSet`이나 Oracle의 데이터베이스 링크 등 (→ 28.8)

---

> **원서 대조**
>
> 이 부록 전체는 WAHH(『The Web Application Hacker's Handbook』 2판, 2011) 19장 "Finding Vulnerabilities in Source Code"를 뼈대로 삼는다. 대응은 다음과 같다.
>
> - 도입부 = 원서 19장 서두 (코드 감사가 가능해지는 네 가지 상황)
> - C.1 = 원서 "Approaches to Code Review" / "Black-Box Versus White-Box Testing" + SBD(『Secure by Design』, 2019) 14.1절 "Conduct code security reviews"(14.1.1 무엇을, 14.1.2 누구를). SBD 관점은 본문 47.12에서 이미 다뤘으므로 여기서는 요점만 재인용했다.
> - C.2 = 원서 "Code Review Methodology"(3단계 접근 + 커스터마이징 주의) + "Tools for Code Browsing"
> - C.3 = 원서 "Signatures of Common Vulnerabilities" 전체 — XSS, SQL Injection, Path Traversal, Arbitrary Redirection, OS Command Injection, Backdoor Passwords, Native Software Bugs(Buffer Overflow / Integer / Format String), Source Code Comments
> - C.4 = 원서 "The Java Platform", "ASP.NET", "PHP", "Perl", "JavaScript", "Database Code Components"
>
> 코드 예제와 API·함수·설정 항목 이름은 사실 자체이므로 원서 그대로 옮겼다(원서 추출 과정에서 발생한 OCR 오식 — `FilelnputStream`, `setstring`, `05 Command Execution` 등 — 은 정확한 표기로 바로잡았다). 설명 문장은 새로 썼다.
>
> 표 C-1(블랙박스/화이트박스 비교)과 표 C-2(시그니처 요약)는 원서에 없는 이 책의 정리다. 원서 표 19-1·19-4·19-7·19-11·19-12(입력 획득 API)와 19-2·19-5(세션 API), 19-3·19-6·19-10(설정 항목)의 내용은 PDF 추출본에서 표 본문이 누락되어, 해당 플랫폼의 공개 API 명세를 근거로 재구성했다. 원서 표 19-8·19-9(원격 파일 접근 프로토콜)는 대표 항목만 옮겼다.
>
> 본문 참조 `(→ N.M)`은 이 책의 목차 절 번호를 가리킨다. 원서가 "see Chapter 12"처럼 자기 장을 가리킨 자리는 이 책의 대응 절로 바꿨다.
