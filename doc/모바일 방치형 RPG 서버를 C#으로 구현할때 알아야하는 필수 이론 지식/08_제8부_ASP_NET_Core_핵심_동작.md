---
title: "제8부. ASP.NET Core 핵심 동작"
parent: "C# 방치형 RPG 서버 필수 이론"
nav_order: 8
---

# 제8부. ASP.NET Core 핵심 동작

> **🎮 게임 서버 개발자에게** — ASP.NET Core는 C++ 서버에서 직접 짜던 accept 루프·패킷 디스패처·필터 체인·매니저 초기화 코드·설정 로더·로거를 프레임워크가 대신 쥐고 있는 "호스트"다. 단위는 패킷이 아니라 HTTP 요청 하나(`HttpContext`)이며, 이것이 `Program.cs`에 적은 순서대로 미들웨어 체인을 **들어갔다가 거꾸로 나온다**. 결정적으로 다른 점은 객체 생성이다. `main()`에서 매니저 싱글턴을 손으로 조립하던 대신 DI 컨테이너가 등록 정보대로 만들어 넣어 주고, C++ 서버에는 거의 없던 "요청 하나 동안만 사는(Scoped)" 수명이 기본 단위가 된다.
>
> **🎯 실무에서 이 장이 필요한 순간**
> - 점검 배포 중 새로 뜬 서버가 밸런스 데이터를 다 읽기도 전에 유저 요청을 받아 오류가 쏟아진다, 혹은 DB 점검 중 멀쩡한 서버들이 줄줄이 재시작된다 (헬스 체크 liveness/readiness).
> - 보상 API에서 예외가 났는데 클라이언트에 스택 트레이스가 그대로 보이거나, 모바일 클라이언트가 오류 응답을 파싱하지 못한다 (파이프라인 순서, `UseExceptionHandler`, Problem Details).
> - 개발 PC에서는 멀쩡한데 운영 서버에서만 오프라인 보상 시간이 다르게 동작한다, 혹은 Singleton 서비스가 요청마다 새로 만들어져야 할 객체를 붙잡고 있다 (설정 우선순위, DI 수명과 캡티브 의존성).

## 코어 — 이것만은 100%

> **한 문장:** ASP.NET Core 서버는 추가한 순서대로 양방향으로 실행되는 미들웨어 파이프라인 위에서, DI 컨테이너가 수명(Singleton/Scoped/Transient)에 맞춰 서비스를 넣어 주고, 여러 프로바이더에서 합친 설정을 검증된 옵션 클래스로 받으며, `ILogger` 로그·Problem Details 오류 응답·헬스 체크로 "운영 가능한" 틀을 갖춘다.

1. **파이프라인 — 추가 순서대로 감싸는 양방향 체인** — 미들웨어는 `HttpContext`를 받아 `await next(context)` 전후로 실행되는 부품이며, `Use*`로 추가한 순서가 곧 실행 순서다. `next`를 부르지 않으면 단락(short-circuit), 뒤쪽 예외를 잡을 미들웨어는 앞쪽에, `MapGet`은 미들웨어가 아니라 엔드포인트다.
2. **DI 수명 — 짧은 수명을 긴 수명이 붙잡지 않는다** — 의존 대상은 `new` 하지 않고 컨테이너에 등록해 생성자로 받는다. Transient(매번 새로) · Scoped(요청당 하나, DB 컨텍스트) · Singleton(앱 전체 하나, 스레드 안전 필수). 자기보다 수명이 같거나 긴 것에만 의존하고(캡티브 의존성 금지), 루트에서 Scoped를 꺼낼 땐 스코프를 만든다.
3. **설정 — 나중 프로바이더가 이기고, 잘못된 값은 시작할 때 실패** — 프로바이더를 합치되 나중 것이 덮어쓴다(명령줄 > 환경 변수 > User Secrets > 환경별 json > appsettings.json). 비밀은 저장소에 두지 않고, 옵션 패턴(`IOptions<T>` 계열) + `ValidateOnStart()`로 시작 시 실패시킨다.
4. **운영 3종 — 로그는 템플릿으로, 오류는 Problem Details로, 상태는 live/ready로** — `ILogger<T>` + 메시지 템플릿(구조화, 민감 정보 금지), 운영에서는 `UseExceptionHandler` + Problem Details(스택 트레이스 노출 금지), 헬스 체크는 liveness(응답 가능만)와 readiness(의존 대상 포함)로 나눈다.

## C++·TCP 서버 경험에서 출발하기

| 이미 아는 것 (C++/소켓 서버) | 이 장의 개념 | 같은 점 | ⚠️ 다른 점 (유추가 깨지는 곳) |
|---|---|---|---|
| 패킷 처리 필터 체인 (복호화 → 압축 해제 → 인증 → 디스패치) | 미들웨어 파이프라인 | 등록한 순서대로 각 단계가 한 가지 일을 하고 다음으로 넘기며, 중간 단계가 "여기서 끝"을 선언해 뒤를 건너뛸 수 있다(단락) | 대개 단방향인 필터 체인과 달리 **양방향**이다. `await next()`가 돌아온 뒤 같은 미들웨어가 응답 쪽 코드를 한 번 더 실행한다(마트료시카). 예외도 이 길을 거꾸로 거슬러 오르므로 잡는 쪽이 앞에 있어야 한다. 응답 전송이 시작된 뒤에는 헤더를 고칠 수 없다 |
| 서버 시작 시 `main()`에서 `DBManager`·`SessionManager` 같은 매니저 싱글턴들을 만들고 서로의 포인터를 넘겨 조립하던 코드 | DI 컨테이너 + 등록(`AddSingleton/AddScoped/AddTransient`) + 생성자 주입 | 객체 그래프를 시작 지점 한 곳에서 조립하고, 각 클래스는 자기가 쓸 부품을 밖에서 받는다 | 조립 코드를 손으로 쓰지 않고 "타입 → 구현 + 수명"만 등록하면 컨테이너가 생성자 매개변수를 보고 알아서 만든다. **Scoped(HTTP 요청 하나 동안만 사는 객체)** 는 C++ 서버에 직접 대응하는 개념이 거의 없다(패킷 하나 처리하는 동안만 쓰는 컨텍스트 객체 정도). 긴 수명이 짧은 수명을 붙잡으면 캡티브 의존성이 된다 |
| 시작 시 ini/json 설정 파일을 읽어 `Config` 구조체에 채우던 설정 로더 | 설정 프로바이더 + 옵션 패턴(`IOptions<T>`) + `ValidateOnStart()` | 하드코딩 대신 파일의 값을 타입 있는 구조체로 받아 쓰고, 잘못된 값이면 서버를 띄우지 않는다 | 파일 하나가 아니라 JSON·환경별 JSON·User Secrets·환경 변수·명령줄을 **겹쳐서** 나중 것이 이긴다. 환경 변수 계층 키는 `__`. `IOptionsSnapshot`/`IOptionsMonitor`로 재시작 없이 변경을 반영할 수도 있다 |
| spdlog·자체 로그 매크로 (`LOG_INFO("player {} ...", id)`) | `ILogger<T>` + 메시지 템플릿 | 레벨(Trace~Critical)별로 출력하고, 출력 대상(콘솔·파일)은 설정으로 바꾼다 | 자리표시자에 **이름**(`{PlayerId}`)을 붙이면 문자열이 아니라 값으로 저장되어 구조화 로그에서 검색할 수 있다. `ILogger<T>`의 `T`가 카테고리가 되어 클래스별로 레벨을 조절한다 |
| 패킷 처리 중 예외를 잡아 로그를 남기고 그 세션을 끊던 최상위 `try/catch`, 크래시 덤프 | `UseExceptionHandler` + Problem Details(RFC 7807) | 처리되지 않은 예외를 맨 바깥에서 한 번에 잡아 기록하고 서버 프로세스는 계속 산다 | 세션을 끊는 대신 **500 응답(Problem Details JSON)** 을 돌려준다. 스택 트레이스를 응답에 실으면 안 되고, "골드 부족" 같은 예상 가능한 실패는 예외가 아니라 4xx 응답으로 돌려주는 편이 낫다 |
| 하트비트 패킷, 모니터링 포트·관리 콘솔 | 헬스 체크(`MapHealthChecks`), liveness / readiness | 외부 도구가 주기적으로 "살아 있나"를 묻고 이상하면 조치한다 | 묻는 쪽이 로드 밸런서·쿠버네티스 같은 오케스트레이터라서 **응답 결과로 트래픽 차단이나 컨테이너 재시작이 자동으로 일어난다.** 그래서 liveness에 DB 같은 남의 상태를 넣으면 연쇄 재시작이 생긴다 |

> **🧭 읽기 전에 (2분)** — 아래 질문에 추측으로 답을 적고 정독하며 고쳐 쓰세요. (먼저 제목과 소제목만 보고 "이 부는 ___ 을(를) 설명한다"를 한 문장으로 적고, 소제목·표·굵은 글씨만 5~15분 훑은 뒤 정독해도 좋습니다.)
> 1. 예외 처리 미들웨어를 파이프라인 맨 뒤에 두면 무슨 일이 생길까? (C++ 서버라면 `try/catch`를 디스패처 안쪽에만 둔 상황)
> 2. Singleton 서비스가 Scoped 서비스(예: DB 컨텍스트)를 생성자로 받으면 무엇이 깨질까?
> 3. `appsettings.json` 과 환경 변수에 같은 키가 있으면 어느 값이 이길까?
> 4. 로그에 `$"Player {id}"` 대신 `"Player {PlayerId}", id` 를 쓰는 이유는?
> 5. liveness 검사에서 DB 상태까지 확인하면 왜 위험할까?
>
> **처리법:** 🛠 실습 `app.Use(async (ctx, next) => ...)`, 클래스 미들웨어 + `UseMiddleware<T>`, `AddSingleton/AddScoped/AddTransient`, `CreateAsyncScope`, `AddOptions<T>().Bind().ValidateDataAnnotations().ValidateOnStart()`, `ILogger<T>`, `UseExceptionHandler`, `AddHealthChecks`/`MapHealthChecks` → 읽자마자 직접 실행 · 🗺 관계도 파이프라인 순서 ↔ 예외 처리 위치, DI 수명 ↔ 캡티브 의존성, 설정 프로바이더 ↔ 환경 ↔ 옵션 인터페이스, liveness ↔ readiness · 🔗 유추 미들웨어 파이프라인 ≈ 마트료시카(바깥 층이 안쪽을 감쌈) — 어디까지 맞고 어디서 깨지는지 따져 보기 · 📦 카드로 설정 우선순위 표, `ASPNETCORE_ENVIRONMENT`, 환경 변수 `__` 구분자, 로그 레벨 6단계, Problem Details 필드(RFC 7807), Healthy/Degraded/Unhealthy, 503

---

> 학습 목표
> 1. 요청 하나가 미들웨어 파이프라인을 어떻게 오가는지 설명하고, 순서가 왜 중요한지 안다.
> 2. DI 등록과 수명(Singleton/Scoped/Transient), 설정(appsettings·옵션 패턴)을 올바르게 고른다.
> 3. 로깅, 예외 처리(오류 응답), 헬스 체크로 "운영 가능한" 서버의 기본 틀을 갖춘다.

> 코드 예제 공통 전제: `Microsoft.NET.Sdk.Web` 프로젝트(.NET 8, C# 12), 암시적 using 켜짐. 예제의 `Program.cs`에서 최상위 문장은 타입 선언보다 앞에 두었다.

> 읽는 순서 안내: 이 부는 [제7부](07_제7부_웹_API_기초.md)(웹 API 기초) 바로 다음, 설계 원칙을 배우기 **전에** 읽는다. 그래서 DI·옵션 패턴은 "ASP.NET Core에서 어떻게 쓰는가"를 이 부 안에서 이해할 수 있게 썼고, "왜 이렇게 설계하는가"(인터페이스에 의존하기, Composition Root, Chain of Responsibility, Options 패턴의 설계 의도)는 [제9부](09_제9부_설계원칙과_패턴.md)에서 이 부의 코드를 다시 꺼내 되짚는다.

> 재구성 안내: 원래 6개 장(1장 요청 처리 흐름 → 2장 의존성 주입 → 3장 설정 → 4장 로깅 → 5장 예외 처리 → 6장 헬스 체크)을 네 개 코어로 다시 묶었다. 원래 장 → 새 위치: 1장 → 1.1, 2장 → 2.1, 3장 → 3.1, 4장 → 4.1, 5장 → 4.2, 6장 → 4.3.

---

## 코어 1. 파이프라인 — 추가 순서대로 감싸는 양방향 체인

> 원래 1장 "요청 처리 흐름". 요청 하나가 서버 안에서 지나가는 길이다. 이 길의 모양(양방향, 순서 = 실행 순서, 단락)을 알면 코어 4의 예외 처리 미들웨어를 왜 맨 앞에 두는지가 저절로 설명된다.

### 1.1 요청 처리 흐름과 미들웨어 파이프라인

**한 줄 요약:** 요청은 미들웨어라는 부품을 차례로 통과해 엔드포인트에 닿고, 응답은 같은 길을 거꾸로 되돌아온다.

> 📖 출처: ASP.NET Core in Action 4장 "Handling requests with the middleware pipeline" (텍스트 L3765-4571), Web API Development with ASP.NET Core 8 4장 "Middleware" (텍스트 L7871-8624)

**핵심 설명**
- 미들웨어는 요청/응답을 다루는 작은 부품이다. 여러 개를 이어 붙인 것이 파이프라인이며(ASP.NET Core in Action), 각 미들웨어는 인증·로깅 같은 한 가지 일을 하고 다음으로 넘긴다(Web API Development with ASP.NET Core 8).
- 파이프라인은 **양방향**이다. 요청이 들어갈 때 한 번, 응답이 나올 때 역순으로 한 번, 각 미들웨어가 실행 기회를 얻는다. 러시아 인형(마트료시카)처럼 바깥 층이 안쪽 층을 감싼다고 생각하면 쉽다(ASP.NET Core in Action).
- 미들웨어는 `HttpContext`(요청 한 건의 정보를 담은 상자)를 받는다. `await next(context)`를 부르면 다음 미들웨어로 가고, 부르지 않고 응답을 직접 만들면 뒤쪽은 실행되지 않는다. 이를 **단락(short-circuit)** 이라 한다.
- `Use*` 메서드로 추가하며 **추가한 순서가 곧 실행 순서**다. 에러 처리 미들웨어처럼 뒤쪽 예외를 잡아야 하는 것은 앞쪽에 둔다(ASP.NET Core in Action). (예외 처리 미들웨어 자체는 → 4.2)
- `MapGet` 등은 미들웨어가 아니라 **엔드포인트 정의**다. `WebApplication`은 엔드포인트 미들웨어를 맨 끝에 자동 추가하고, 처리할 곳이 없으면 404를 돌려준다(ASP.NET Core in Action).
- 주의: `next` 호출이 끝난 뒤에는 응답 헤더/상태 코드를 바꾸면 이미 전송된 경우 예외가 난다. 바꿀 것은 `next` 전에 바꾼다(Web API Development with ASP.NET Core 8).
- 직접 만들 때 클래스 미들웨어는 `RequestDelegate`를 받는 public 생성자와 `HttpContext`를 첫 매개변수로 받는 `Invoke`/`InvokeAsync` 메서드를 갖는다. 등록은 `UseMiddleware<T>()`를 감싼 확장 메서드로 하는 것이 관례다(Web API Development with ASP.NET Core 8, ASP.NET Core in Action). 미들웨어 클래스가 특정 부모 클래스나 인터페이스를 상속할 필요는 없다(Web API Development with ASP.NET Core 8).

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// 1) 요청 시간 측정: next 전후에 실행되는 양방향 미들웨어
app.Use(async (context, next) =>
{
    var started = DateTime.UtcNow;
    await next(context);   // 안쪽(뒤쪽) 미들웨어와 엔드포인트 실행
    var elapsedMs = (DateTime.UtcNow - started).TotalMilliseconds;
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
    logger.LogInformation("{Path} -> {Status} ({Elapsed:F0}ms)",
        context.Request.Path, context.Response.StatusCode, elapsedMs);
});

// 2) 클라이언트 버전 헤더 검사: 조건 불충족 시 next를 부르지 않고 단락
app.UseMiddleware<ClientVersionMiddleware>();

// 3) 엔드포인트 (미들웨어가 아님)
app.MapGet("/api/heroes", () => new[] { new Hero(1, "Arthur"), new Hero(2, "Merlin") });

app.Run();

public record Hero(int Id, string Name);

public class ClientVersionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Headers.ContainsKey("X-Client-Version"))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsync("X-Client-Version header is required.");
            return; // 단락: 엔드포인트까지 가지 않는다
        }
        await next(context);
    }
}
```

**방치형 RPG 서버에서는**: 모든 API 앞에 "요청 로깅 → 클라이언트 버전 검사 → (인증) → 엔드포인트" 순으로 미들웨어를 쌓게 된다. 순서를 바꾸면 결과가 달라지므로 `Program.cs`의 줄 순서를 파이프라인 설계도로 읽는 습관이 필요하다.

> 🔧 보충(책 외): `X-Client-Version` 헤더 검사는 예시용 시나리오이며, 책의 예제(상관관계 ID, 복권 미들웨어)를 게임 맥락으로 바꾼 것이다.

> 🔧 보충(책 외): C++ 서버의 패킷 필터 체인과 가장 크게 다른 점은 위 코드의 1번 미들웨어다. `await next(context)` 한 줄을 사이에 두고 "요청 쪽 코드"와 "응답 쪽 코드"가 같은 메서드 안에 있다. 시간 측정·로그처럼 앞뒤를 모두 봐야 하는 일을 한 미들웨어에서 끝낼 수 있는 이유다. 설계 패턴으로 보면 이 구조는 Chain of Responsibility의 "파이프라인" 변형이며, 그 원리는 [제9부](09_제9부_설계원칙과_패턴.md)에서 되짚는다.

---

## 코어 2. DI 수명 — 짧은 수명을 긴 수명이 붙잡지 않는다

> 원래 2장 "의존성 주입". 이 부에서 처음 만나는 DI를 "ASP.NET Core에서 쓰는 방법" 중심으로 다룬다. 핵심 규칙은 하나다: **수명이 짧은 것을 수명이 긴 것이 붙잡으면 안 된다.** 캡티브 의존성, 루트 컨테이너에서 Scoped를 꺼낼 때의 누수, Singleton의 스레드 안전·사용자 데이터 누출 문제가 모두 이 규칙에서 나온다.

### 2.1 의존성 주입 등록과 수명(Singleton/Scoped/Transient)

**한 줄 요약:** 객체를 `new` 하지 않고 컨테이너에 "등록"해 두면, 프레임워크가 필요한 곳에 만들어 넣어 주며 수명은 등록 방식이 결정한다.

> 📖 출처: ASP.NET Core in Action 9장 "Understanding lifetimes: When are services created?" 및 "Resolving scoped services outside a request" (텍스트 L10915-11463), Web API Development with ASP.NET Core 8 2장 "Dependency injection" (텍스트 L5089-5490), Architecting ASP.NET Core Applications 8장 "Object lifetime" (텍스트 L11154-11220)

**핵심 설명**
- 클라이언트 클래스가 의존 대상을 직접 `new` 하면 서로 단단히 묶여 교체·테스트가 어렵다. ASP.NET Core는 **생성자 주입**을 쓴다. 인터페이스와 구현을 만들고, `builder.Services`(컨테이너)에 등록하고, 생성자 매개변수로 받는다(Web API Development with ASP.NET Core 8). C# 12 기본 생성자로 필드 선언을 생략할 수도 있다(Web API Development with ASP.NET Core 8).
- 수명 세 가지(ASP.NET Core in Action, Web API Development with ASP.NET Core 8, Architecting ASP.NET Core Applications 공통):
  - **Transient**: 요청받을 때마다 새로 생성. 상태 없는 가벼운 서비스용.
  - **Scoped**: 웹에서는 **요청 하나당 하나**. 한 요청 안에서는 같은 객체를 공유, 다음 요청은 새 객체. DB 컨텍스트가 대표 사례.
  - **Singleton**: 앱이 살아있는 동안 하나. 여러 요청 스레드가 동시에 쓰므로 **스레드 안전**해야 한다(ASP.NET Core in Action).
- Architecting ASP.NET Core Applications의 선택 요령: 가능하면 Singleton, 어려우면 Scoped, 그것도 안 되면 Transient. 다만 사용자별 데이터를 들고 있는 객체는 Singleton으로 두면 다른 사용자에게 새어 나갈 수 있다.
- **캡티브 의존성(captive dependency)**: Singleton이 Scoped 서비스를 주입받으면 그 Scoped 객체가 앱 종료까지 붙잡혀 "요청마다 새로"라는 약속이 깨진다. 규칙은 "자기보다 수명이 **같거나 긴** 것만 의존"이다. 개발 환경에서는 프레임워크가 이를 검사해 앱 시작 시(또는 그 의존성을 처음 쓸 때) 예외를 던진다. 이 검사는 성능 비용이 있어 기본적으로 개발 환경에서만 켜진다(ASP.NET Core in Action).
- `app.Services`(루트 컨테이너)에서 Scoped/Transient를 직접 꺼내면 앱 종료까지 남아 메모리가 샌다. 필요하면 `CreateScope()`나 `CreateAsyncScope()`로 스코프를 만들고 그 안에서 꺼낸다. ASP.NET Core in Action은 가능하면 `CreateAsyncScope()`를 쓰라고 하고, Web API Development with ASP.NET Core 8의 예제는 `CreateScope()`를 쓴다.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<GoldLedger>();              // 앱 전체에서 하나
builder.Services.AddScoped<IHeroService, HeroService>();  // 요청마다 하나
builder.Services.AddTransient<RewardCalculator>();        // 주입될 때마다 새로

var app = builder.Build();

// 시작 시 Scoped 서비스가 필요하면 스코프를 만들어 사용
await using (var scope = app.Services.CreateAsyncScope())
{
    var heroes = scope.ServiceProvider.GetRequiredService<IHeroService>();
    Console.WriteLine($"Starter hero: {heroes.Find(1)?.Name}");
}

app.MapGet("/api/heroes/{id:int}", (int id, IHeroService heroes) =>
    heroes.Find(id) is { } hero ? Results.Ok(hero) : Results.NotFound());
app.MapPost("/api/gold/{amount:long}", (long amount, GoldLedger ledger) => ledger.Add(amount));

app.Run();

public record Hero(int Id, string Name);

public interface IHeroService { Hero? Find(int id); }

public class HeroService(GoldLedger ledger) : IHeroService   // Scoped -> Singleton 의존은 OK
{
    private readonly GoldLedger _ledger = ledger;   // 실제 코드에서는 이 Singleton을 사용한다
    private static readonly Hero[] All = { new(1, "Arthur"), new(2, "Merlin") };
    public Hero? Find(int id) => All.FirstOrDefault(h => h.Id == id);
}

public class GoldLedger
{
    private long _gold;
    public long Add(long amount) => Interlocked.Add(ref _gold, amount); // 동시 요청에 안전
}

public class RewardCalculator
{
    public long Calc(int level) => level * 100L;
}
```

**방치형 RPG 서버에서는**: 게임 밸런스 테이블처럼 읽기 전용 공용 데이터는 Singleton, 플레이어 데이터를 다루는 서비스와 DB 컨텍스트는 Scoped가 기본이다. 반대로 Singleton 안에서 Scoped 서비스를 잡고 있지 않은지 늘 확인한다.

> 🔧 보충(책 외): `Interlocked.Add`로 Singleton의 카운터를 안전하게 만든 것은 예시 구현이다. 책은 "Singleton은 스레드 안전해야 한다"는 원칙만 다룬다. (여러 요청이 공유 상태를 건드릴 때의 위험과 `lock`은 [제6부](06_제6부_비동기와_시간흐름.md))

> 🔧 보충(책 외): C++ 서버 개발자가 DI를 처음 볼 때 붙잡을 그림은 이렇다. 예전에는 `main()`에서 `auto db = new DBManager(); auto hero = new HeroManager(db);`처럼 순서를 맞춰 손으로 조립했다. ASP.NET Core에서는 `builder.Services.Add...`로 "이 타입을 달라고 하면 이 구현을 이 수명으로 줘라"만 적어 두면, 컨테이너가 생성자 매개변수를 보고 필요한 것을 먼저 만들어 넣는다. 위 코드에서 엔드포인트 람다의 `IHeroService heroes` 매개변수도 컨테이너가 채운다. 수명 관리(언제 만들고 언제 버리는지)도 컨테이너 몫이며, 스코프가 끝날 때 컨테이너가 만든 `IDisposable` 서비스를 정리한다. 왜 구현 대신 인터페이스로 받는지(DIP), `Program.cs`가 왜 "조립 지점(Composition Root)"인지, Singleton 패턴을 직접 짜지 않고 이 Singleton 수명을 쓰는 이유는 [제9부](09_제9부_설계원칙과_패턴.md)에서 이 코드를 다시 보며 되짚는다.

---

## 코어 3. 설정 — 나중 프로바이더가 이기고, 잘못된 값은 시작할 때 실패

> 원래 3장 "설정". 두 가지 원리로 정리된다. ① 설정은 여러 곳에서 읽어 **겹치며 나중 것이 이긴다**(그래서 운영 값은 코드를 고치지 않고 환경 변수로 덮어쓴다). ② 설정은 타입 있는 옵션 클래스로 받고 **시작할 때 검증**한다(그래서 잘못된 밸런스 값은 유저가 아니라 배포 단계에서 터진다). 옵션 인터페이스 세 가지의 차이는 코어 2의 수명(Singleton/Scoped)으로 설명된다.

### 3.1 설정: appsettings.json, 환경, 옵션 패턴

**한 줄 요약:** 바뀔 수 있는 값(연결 문자열, 게임 수치)은 코드 밖 설정에 두고, 타입이 있는 옵션 클래스로 받아 쓴다.

> 📖 출처: ASP.NET Core in Action 10장 "Configuring an ASP.NET Core application" (텍스트 L11535-12500, L12707-12960), Web API Development with ASP.NET Core 8 3장 "Configuration" / "Environments" (텍스트 L5948-7087), Architecting ASP.NET Core Applications 9장 "Validating our options objects" (텍스트 L14539-14700)

**핵심 설명**

*① 어디서 읽고, 무엇이 이기나*
- **설정(setting)** 은 앱 동작을 바꾸는 값, **비밀(secret)** 은 비밀번호·API 키 같은 민감한 설정이다. 코드 밖으로 빼두면 재컴파일 없이 바꿀 수 있고, 소스 저장소에 비밀이 올라가는 사고도 줄어든다(ASP.NET Core in Action).
- 설정은 여러 **프로바이더**(JSON 파일, 환경 변수, 명령줄 등)에서 키-값으로 읽어 하나로 합친다. **나중에 추가된 프로바이더가 같은 키를 덮어쓴다**(ASP.NET Core in Action). Web API Development with ASP.NET Core 8의 우선순위 표: 명령줄 > 환경 변수 > 사용자 비밀(개발 환경) > `appsettings.{환경}.json` > `appsettings.json`.
- 비밀은 `appsettings.json`에 넣지 않는다. 로컬은 User Secrets, 서버는 환경 변수가 흔한 방법이다. 둘 다 암호화되지는 않으므로 "저장소에 안 올리기"용이라는 점을 기억한다(ASP.NET Core in Action).
- **환경**은 `ASPNETCORE_ENVIRONMENT` 값(`Development`/`Staging`/`Production`)으로 정해지고, 없으면 Production이다. `IsDevelopment()` 같은 메서드로 확인하고, `appsettings.Development.json`처럼 환경별 파일이 기본 파일 위에 덮어써진다(ASP.NET Core in Action).
- 환경 변수로 계층 키를 줄 때는 `:` 대신 `__`(밑줄 두 개)를 쓰는 것이 리눅스 등에서 안전하다. 예를 들어 `Game__GoldPerSecond`는 `Game:GoldPerSecond`로 읽힌다(ASP.NET Core in Action, Web API Development with ASP.NET Core 8).

*② 타입 있는 옵션 클래스로 받고, 시작할 때 검증한다*
- **옵션 패턴**: 설정 섹션을 POCO 클래스(인자 없는 public 생성자, 프로퍼티)에 바인딩하고 `IOptions<T>`로 주입받는다. 문자열 키 오타와 형 변환 실수가 줄어든다(ASP.NET Core in Action, Web API Development with ASP.NET Core 8). 단, 옵션 클래스 프로퍼티 이름과 JSON 키가 어긋나면 조용히 기본값이 남을 수 있으니 오타를 조심하고 아래 검증을 함께 쓴다(ASP.NET Core in Action).
- 옵션 인터페이스 세 가지(수명은 → 코어 2): `IOptions<T>`는 Singleton이라 파일이 바뀌어도 처음 값을 유지하고, `IOptionsSnapshot<T>`(Scoped)는 요청마다 새로 만들어져 변경을 반영하며(대신 매 요청 재계산 비용이 든다), `IOptionsMonitor<T>`(Singleton)는 Singleton에서도 변경 반영이 필요할 때 쓴다(ASP.NET Core in Action, Web API Development with ASP.NET Core 8).
- Architecting ASP.NET Core Applications은 `ValidateOnStart()`를 기본으로 권한다. 설정이 잘못되면 실행 중 뒤늦게가 아니라 **시작 시점에 실패**하게 한다. 데이터 애노테이션 검증은 `ValidateDataAnnotations()`로 켠다.

`appsettings.json`
```json
{
  "Game": { "OfflineRewardMaxHours": 8, "GoldPerSecond": 2.5 }
}
```

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// "Game" 섹션을 GameSettings에 바인딩 + 시작 시 검증
builder.Services.AddOptions<GameSettings>()
    .Bind(builder.Configuration.GetSection(GameSettings.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

var app = builder.Build();

app.MapGet("/api/settings", (IOptions<GameSettings> options) => options.Value);
app.MapGet("/api/env", (IWebHostEnvironment env) =>
    new { env.EnvironmentName, IsDev = env.IsDevelopment() });

app.Run();

public class GameSettings
{
    public const string SectionName = "Game";

    [Range(1, 72)]
    public int OfflineRewardMaxHours { get; set; } = 8;

    [Range(0.1, 1000.0)]
    public double GoldPerSecond { get; set; } = 1.0;
}
```

**방치형 RPG 서버에서는**: 오프라인 보상 최대 시간, 초당 골드 같은 밸런스 수치와 DB 연결 문자열을 설정으로 빼 두면, 배포 없이 환경 변수로 운영 값을 바꿀 수 있다. 잘못된 수치(0 이하 등)는 서버가 켜질 때 막는다.

> 🔧 보충(책 외): `Game` 섹션 이름과 항목들은 예시 값이다. `.Bind(...)`는 책의 `Configure<T>(GetSection(...))`와 같은 역할을 하는 `OptionsBuilder` 방식이다.

> 🔧 보충(책 외): C++ 서버의 설정 로더와 비교하면, "하나의 파일을 읽어 구조체에 채운다"가 아니라 "여러 출처를 순서대로 겹쳐 최종 키-값 표를 만들고, 그 표의 한 섹션을 구조체에 채운다"는 2단계다. 운영 서버에서 값이 예상과 다르면 파일만 볼 것이 아니라 위 우선순위대로(명령줄 → 환경 변수 → …) 같은 키가 있는지 위에서부터 확인한다. 설정 값을 왜 작은 객체로 나눠 밖에서 넣어 주는지(Options 패턴의 설계 의도)는 [제9부](09_제9부_설계원칙과_패턴.md)에서 되짚는다.

---

## 코어 4. 운영 3종 — 로그는 템플릿으로, 오류는 Problem Details로, 상태는 live/ready로

> 원래 4~6장 "로깅"·"예외 처리와 오류 응답"·"헬스 체크". 눈앞에서 디버거를 붙일 수 없는 서버를 "운영 가능하게" 만드는 세 도구다. 셋 다 같은 질문에 답한다: **무슨 일이 있었나(로그) · 실패를 클라이언트에 어떻게 알리나(오류 응답) · 지금 트래픽을 받아도 되나(헬스 체크).**

### 4.1 로깅

**한 줄 요약:** 서버는 눈앞에서 디버깅할 수 없으므로, 무슨 일이 있었는지 `ILogger`로 남겨 두어야 나중에 원인을 찾는다.

> 📖 출처: Web API Development with ASP.NET Core 8 4장 "Logging" (텍스트 L7136-7870, 특히 L7816-7866), Architecting ASP.NET Core Applications 10장 "Logging Patterns" (텍스트 L15690-16336), ASP.NET Core in Action 26장 "Monitoring and troubleshooting errors with logging" (텍스트 L33135-33720)

**핵심 설명**
- 로그는 크게 감사/분석용, 오류 기록, 오류 직전의 "빵부스러기" 기록으로 쓰인다. ASP.NET Core 자체도 요청·EF Core 쿼리를 많이 남겨 주므로, 직접 남길 로그는 의미 있는 것에 집중한다(ASP.NET Core in Action).
- 구조: 코드에서는 `ILogger`만 쓰고, 어디에 쓸지는 **프로바이더**(콘솔, 파일 등)가 정한다. 기본 빌더가 콘솔 등을 이미 등록하므로 코드 수정 없이 목적지를 바꿀 수 있다(ASP.NET Core in Action, Architecting ASP.NET Core Applications).
- 가장 흔한 방법은 클래스에 `ILogger<T>`를 주입하는 것이다(주입은 → 코어 2). `T`가 로그의 **카테고리**(어느 클래스의 로그인지)가 된다(ASP.NET Core in Action, Architecting ASP.NET Core Applications).
- **로그 레벨**(심각한 것부터): Critical, Error, Warning, Information, Debug, Trace. Architecting ASP.NET Core Applications의 표는 운영에서 Trace는 끄고, Debug는 문제를 조사할 때만 켜며, Information 이상은 켜 두되 ASP.NET Core 자체의 Information 로그는 줄이라고 권한다. Trace는 민감 정보를 담을 수 있어 운영에서 켜지 않는다(ASP.NET Core in Action, Architecting ASP.NET Core Applications, Web API Development with ASP.NET Core 8).
- **메시지 템플릿**: `"Player {PlayerId}"`처럼 자리표시자와 인자를 따로 넘긴다. 보간 문자열(`$"..."`)과 출력은 같지만, 템플릿은 로그가 꺼진 레벨일 때 문자열 처리를 건너뛰어 가볍고, 구조화 로그에서 값으로 검색할 수 있다(ASP.NET Core in Action, Architecting ASP.NET Core Applications). 예외는 별도 인자로 넘기면 함께 기록된다(ASP.NET Core in Action).
- 레벨은 설정으로 조절한다(설정은 → 코어 3). `Logging:LogLevel`에 `Default`와 카테고리별(예: `Microsoft`) 최소 레벨을 적고, 환경별 파일로 덮어쓴다(Architecting ASP.NET Core Applications). `AddJsonConsole()`로 콘솔을 JSON 구조화 로그로 바꿀 수 있다(Architecting ASP.NET Core Applications).
- 남길 것: 검증 실패, 인증·인가 실패, 예외, 시작/종료, 위험한 작업, 중요한 비즈니스 이벤트. **남기지 말 것**: 비밀번호·키·연결 문자열, 개인정보, 결제 정보(Web API Development with ASP.NET Core 8).

`appsettings.json`(로그 레벨)
```json
{
  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } }
}
```

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddScoped<IdleRewardService>();
var app = builder.Build();

app.MapPost("/api/players/{playerId:int}/claim",
    (int playerId, int offlineMinutes, IdleRewardService rewards) =>
        Results.Ok(new { gold = rewards.Claim(playerId, offlineMinutes) }));

app.Run();

public class IdleRewardService(ILogger<IdleRewardService> logger)
{
    public long Claim(int playerId, int offlineMinutes)
    {
        logger.LogInformation("Claim start. Player {PlayerId}, offline {Minutes}min",
            playerId, offlineMinutes);

        if (offlineMinutes > 24 * 60)
        {
            logger.LogWarning("Offline time capped. Player {PlayerId}, requested {Minutes}min",
                playerId, offlineMinutes);
            offlineMinutes = 24 * 60;
        }

        long gold = Math.Max(offlineMinutes, 0) * 600L;
        try
        {
            Persist(playerId, gold);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogError(ex, "Failed to save reward. Player {PlayerId}", playerId);
            throw;
        }
        return gold;
    }

    private static void Persist(int playerId, long gold)
    {
        if (playerId <= 0) throw new InvalidOperationException("Invalid player id.");
    }
}
```

**방치형 RPG 서버에서는**: "보상 수령", "재화 차감 실패", "비정상적으로 큰 오프라인 시간 요청" 같은 이벤트에 Player ID를 값으로 남기면, 유저 문의가 왔을 때 로그 검색만으로 상황을 재구성할 수 있다.

> 🔧 보충(책 외): 보상 계산식(분당 600골드)과 24시간 상한은 예시 값이다.

### 4.2 예외 처리와 오류 응답

**한 줄 요약:** 처리되지 않은 예외는 500이 되므로, 예외 처리 미들웨어를 앞쪽에 두고 클라이언트가 파싱할 수 있는 JSON 오류 응답(Problem Details)을 내보낸다.

> 📖 출처: Web API Development with ASP.NET Core 8 16장 "Error handling" (텍스트 L23453-23590, L23744-23855), ASP.NET Core in Action 4장 "Handling errors using middleware" (텍스트 L4573-4937)

**핵심 설명**
- 파이프라인에서 던져진 예외는 앞쪽 미들웨어 방향으로 거슬러 올라가고, 아무도 잡지 않으면 서버는 500을 돌려준다(ASP.NET Core in Action). (그래서 잡는 미들웨어는 앞쪽에 둔다 → 코어 1) 스택 트레이스가 응답에 실리면 공격자에게 정보를 주므로 운영에서는 절대 노출하지 않는다(Web API Development with ASP.NET Core 8).
- 개발 환경에서는 상세 정보를 보여 주는 개발자 예외 페이지를 쓰고(`WebApplication`이 Development에서 자동 추가), 운영에서는 `UseExceptionHandler("/error")` 미들웨어를 쓴다. 이 미들웨어는 예외를 잡으면 요청 경로를 오류 경로로 바꿔 파이프라인을 다시 실행해 응답을 만들고, 상태 코드를 500으로 맞춘다(ASP.NET Core in Action).
- 함정: 이미 응답 전송이 시작됐으면 바꿀 수 없고, 오류 처리 경로 자체가 예외를 던지면 날것의 500이 나간다. 오류 처리 코드는 최대한 단순하게 만든다(ASP.NET Core in Action).
- 오류 응답 형식은 **Problem Details**(RFC 7807)를 쓴다. 주요 필드는 `type`, `title`, `status`, `detail`, `instance`이며 `application/problem+json`으로 내려간다(Web API Development with ASP.NET Core 8).
- 입력 검증 실패는 400과 함께 문제 세부 정보(`ValidationProblemDetails`, 필드별 `errors`)를 돌려준다(Web API Development with ASP.NET Core 8). 단순한 애노테이션 검증으로 부족하면 FluentValidation 같은 라이브러리를 쓸 수 있다(Web API Development with ASP.NET Core 8).

> 🔧 보충(책 외): 실무에서는 "예상 가능한 실패"(없는 영웅 -> 404, 잘못된 입력 -> 400)는 예외를 던지지 않고 정상적인 4xx 응답으로 돌려주고, "예상 밖 오류"만 예외 처리 미들웨어에 맡기는 식으로 나누어 생각하면 편하다. 이 구분은 책의 표현이 아니다. (예상 가능한 실패를 서비스 계층에서 결과 객체로 표현하는 Operation Result 패턴은 [제9부](09_제9부_설계원칙과_패턴.md))

```csharp
using Microsoft.AspNetCore.Diagnostics;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/error");   // 운영: 상세 정보 없는 오류 응답
}

// 예외가 잡히면 이 경로가 다시 실행되어 응답을 만든다
app.Map("/error", (HttpContext context, ILogger<Program> logger) =>
{
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    if (feature is not null)
    {
        logger.LogError(feature.Error, "Unhandled exception at {Path}", feature.Path);
    }
    return Results.Problem(title: "서버 내부 오류가 발생했습니다.", statusCode: 500);
});

// 예상 가능한 실패는 예외 대신 정상적인 4xx 응답으로
app.MapPost("/api/heroes/{id:int}/upgrade", (int id, UpgradeRequest request) =>
{
    if (id != 1) return Results.NotFound();
    if (request.Levels <= 0)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["levels"] = new[] { "levels must be greater than 0." }
        });
    }
    return Results.Ok(new { id, addedLevels = request.Levels });
});

// 예상 밖 오류 시연용: 예외 -> UseExceptionHandler -> 500 Problem Details
// (핸들러는 Development가 아닐 때만 등록했으므로 ASPNETCORE_ENVIRONMENT=Production 등으로 실행해야 보인다)
app.MapGet("/api/crash", () => { throw new InvalidOperationException("boom"); });

app.Run();

public record UpgradeRequest(int Levels);
```

**방치형 RPG 서버에서는**: 모바일 클라이언트는 오류 JSON의 `status`/`title`을 읽어 팝업을 띄운다. "골드 부족" 같은 게임 규칙 위반은 400/409 응답으로, DB 장애 같은 예상 밖 오류는 500 Problem Details로 통일해 두면 클라이언트 처리가 단순해진다.

> 🔧 보충(책 외): 책은 컨트롤러 기반 `/error` 예제(Web API Development with ASP.NET Core 8)와 `MapGet("/error", ...)`로 문자열을 돌려주는 예제(ASP.NET Core in Action)를 보여 준다. 위 코드는 이를 미니멀 API 형태로 바꾼 것이라 `Results.Problem`, `Results.ValidationProblem`, `app.Map`으로 오류 경로를 여는 부분은 책 예제가 아니다(`IExceptionHandlerFeature`로 예외를 꺼내 로그를 남기는 방식은 Web API Development with ASP.NET Core 8 컨트롤러 예제와 같다). ASP.NET Core in Action의 Listing 10.15에는 `AddProblemDetails` 호출이 있으나 표기가 미심쩍어 예제에 넣지 않았다. 게임 시나리오도 보충 설명이다.

### 4.3 헬스 체크

**한 줄 요약:** 서버가 살아 있는지, 요청을 받을 준비가 됐는지를 알려 주는 전용 엔드포인트를 두면 운영 도구가 이를 보고 트래픽을 보내거나 재시작한다.

> 📖 출처: Web API Development with ASP.NET Core 8 16장 "Health checks" (텍스트 L23856-24065)

**핵심 설명**
- 헬스 체크는 앱 상태를 돌려주는 엔드포인트다. 상태는 Healthy, Degraded, Unhealthy 중 하나다. 로드 밸런서나 쿠버네티스 같은 오케스트레이터가 이를 보고 비정상 인스턴스로 트래픽을 끊거나 컨테이너를 재시작한다(Web API Development with ASP.NET Core 8).
- 기본: `AddHealthChecks()`로 서비스를 등록하고 `MapHealthChecks("경로")`로 엔드포인트를 연다. 정상이면 200과 `Healthy` 텍스트가 나온다(Web API Development with ASP.NET Core 8).
- 커스텀 검사는 `IHealthCheck`의 `CheckHealthAsync`를 구현하고 `AddCheck<T>(이름, tags: ...)`로 등록한다. 외부 서비스나 DB 상태를 확인할 때 쓴다. `MapHealthChecks`의 `Predicate`로 이름이나 태그별로 실행할 검사를 골라 엔드포인트를 나눌 수 있고(Web API Development with ASP.NET Core 8), 비정상이면 503이 나간다. `Predicate`를 안 주면 등록된 모든 검사가 실행된다(Web API Development with ASP.NET Core 8).
- EF Core를 쓰면 `AddDbContextCheck<T>`(전용 패키지)로 DB 검사를 쉽게 추가한다(Web API Development with ASP.NET Core 8).
- **liveness(살아 있나)** 는 "응답할 수 있는가"만 본다. 다른 서비스 상태까지 확인하면 남의 장애 때문에 멀쩡한 앱이 재시작되는 연쇄 실패가 생길 수 있다. **readiness(트래픽 받을 준비됐나)** 는 초기화·의존 대상 상태를 반영한다. 시작이 오래 걸리면 startup 프로브를 따로 쓴다(Web API Development with ASP.NET Core 8). 프로브 검사는 빨라야 한다(Web API Development with ASP.NET Core 8).

```csharp
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<GameDataStore>();
builder.Services.AddHealthChecks()
    // liveness: 다른 의존 대상은 보지 않고 "응답 가능"만 확인
    .AddCheck("self", () => HealthCheckResult.Healthy("alive"), tags: new[] { "live" })
    // readiness: 게임 데이터 로딩 여부 등 준비 상태 확인
    .AddCheck<GameDataHealthCheck>("game-data", tags: new[] { "ready" });

var app = builder.Build();

app.MapHealthChecks("/healthz/live",
    new HealthCheckOptions { Predicate = check => check.Tags.Contains("live") });
app.MapHealthChecks("/healthz/ready",
    new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });

app.Run();

public class GameDataStore
{
    public bool IsLoaded { get; private set; } = true; // 실제로는 시작 시 밸런스 데이터 로딩 후 true
}

public class GameDataHealthCheck(GameDataStore store) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var result = store.IsLoaded
            ? HealthCheckResult.Healthy("game data loaded")
            : HealthCheckResult.Unhealthy("game data not loaded");
        return Task.FromResult(result);
    }
}
```

**방치형 RPG 서버에서는**: `/healthz/live`는 프로세스가 응답하는지만, `/healthz/ready`는 DB 연결과 밸런스 데이터 로딩을 확인하도록 나눈다. 배포 중인 새 서버가 준비되기 전에 유저 요청이 가지 않게 막을 수 있다.

> 🔧 보충(책 외): `GameDataStore`와 `/healthz/live`·`/healthz/ready` 경로 이름은 예시이고, 람다로 검사를 등록하는 `AddCheck("self", () => ...)` 형태는 책에 없는 오버로드다(책은 `AddCheck<T>`만 보여 준다). 책은 태그/이름별 `Predicate` 필터링과 liveness/readiness 개념을 설명하며, 두 엔드포인트를 이렇게 구성한 코드는 이를 조합한 것이다.

---

## 실무 적용

### 체크리스트
- [ ] `Program.cs`의 `Use*` 줄 순서를 파이프라인 설계도로 읽는다: 예외 처리 → 요청 로깅 → 클라이언트 버전 검사 → (인증) → 엔드포인트. 뒤쪽 예외를 잡을 미들웨어는 앞쪽에 있다. → 코어 1
- [ ] 미들웨어에서 응답 헤더·상태 코드는 `next` **전에** 바꾼다. 단락할 때는 응답을 직접 쓰고 `return`한다. → 코어 1
- [ ] 클래스 미들웨어는 `RequestDelegate`를 받는 public 생성자 + `InvokeAsync(HttpContext)` 형태이고, `UseMiddleware<T>()`를 감싼 확장 메서드로 등록한다. → 코어 1
- [ ] 서비스는 `new` 하지 않고 등록 + 생성자 주입으로 받는다. 수명은 "가능하면 Singleton → Scoped → Transient"로 고르되, 사용자별 데이터를 든 객체와 DB 컨텍스트는 Scoped. → 코어 2
- [ ] Singleton 서비스는 스레드 안전하고, 생성자에 Scoped 서비스를 받지 않는다(캡티브 의존성). 이 검사는 기본적으로 개발 환경에서만 켜지므로 개발 환경에서 반드시 한 번 띄워 본다. → 코어 2
- [ ] 시작 시 Scoped 서비스가 필요하면 `app.Services`에서 바로 꺼내지 않고 `CreateAsyncScope()`로 스코프를 만든다. → 코어 2
- [ ] 비밀(연결 문자열 비밀번호, API 키)은 `appsettings.json`에 없다. 로컬은 User Secrets, 서버는 환경 변수(둘 다 암호화는 아님). → 코어 3
- [ ] 운영 서버의 `ASPNETCORE_ENVIRONMENT`를 확인했다(없으면 Production). 환경 변수 계층 키는 `__`(`Game__GoldPerSecond`). → 코어 3
- [ ] 밸런스 수치는 옵션 클래스 + `ValidateDataAnnotations()` + `ValidateOnStart()`로 받아 잘못된 값이면 시작 시 실패한다. 프로퍼티 이름과 JSON 키 오타를 검증으로 잡는다. 변경 반영이 필요하면 `IOptionsSnapshot`(Scoped)·`IOptionsMonitor`(Singleton). → 코어 3
- [ ] 로그는 `ILogger<T>` + 메시지 템플릿(`"Player {PlayerId}", id`)으로 남기고, 비밀번호·키·연결 문자열·개인정보·결제 정보는 남기지 않는다. 운영에서 Trace는 끄고 `Microsoft.AspNetCore`는 Warning으로 줄인다. → 코어 4
- [ ] 운영에서는 `UseExceptionHandler`로 500 Problem Details(`application/problem+json`)를 내보내고 스택 트레이스를 노출하지 않는다. 오류 처리 경로 코드는 최대한 단순하다. → 코어 4
- [ ] "골드 부족"·없는 영웅·잘못된 입력 같은 예상 가능한 실패는 예외가 아니라 4xx(`NotFound`, `ValidationProblem`, 409 등)로 돌려준다. → 코어 4
- [ ] 헬스 체크를 `/healthz/live`(응답 가능만)와 `/healthz/ready`(DB·밸런스 데이터 로딩)로 나눴고, 프로브 검사는 빠르다. 시작이 오래 걸리면 startup 프로브를 따로 둔다. → 코어 4

### 시나리오로 확인하기
1. **상황:** 요청 로깅 미들웨어 안에서 난 예외가 Problem Details가 아니라 날것의 500으로 나간다. `Program.cs`를 보니 `app.Use(요청 로깅)` 다음 줄에 `app.UseExceptionHandler("/error")`가 있다. (C++ 서버에서 `try/catch`를 패킷 디스패처 안쪽에만 두고, 그 앞의 복호화 필터에서 난 예외는 잡지 못하던 것과 같은 구조다.)
   **질문:** 원인은 무엇이고 어떻게 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   `Use*`로 추가한 순서가 곧 실행 순서이고, 예외는 앞쪽 미들웨어 방향으로 거슬러 올라간다. 예외 처리 미들웨어보다 **앞에** 있는 요청 로깅 미들웨어의 예외는 아무도 잡지 않아 서버가 그냥 500을 돌려준다. `UseExceptionHandler`를 파이프라인 맨 앞으로 옮긴다. 이미 응답 전송이 시작된 뒤의 예외는 예외 처리 미들웨어도 응답을 바꿀 수 없고, `/error` 경로 자체가 예외를 던져도 날것의 500이 나가므로 오류 처리 코드는 단순하게 둔다. → 코어 1 (1.1), 코어 4 (4.2)

   </details>

2. **상황:** 랭킹 계산 결과를 캐시하려고 `RankingCache`를 Singleton으로 등록하고, 생성자에서 플레이어 데이터를 읽는 Scoped `IHeroService`(내부에 DB 컨텍스트)를 받았다. 개발 PC에서는 시작하자마자 예외가 났는데, 누군가 "운영 설정으로 띄우면 뜬다"며 그대로 배포했다. (C++ 서버라면 매니저 싱글턴이 다른 매니저 포인터를 들고 있는 것은 아주 흔한 구조였다.)
   **질문:** 무엇이 잘못됐고, 개발 환경의 예외는 왜 운영에서는 안 났나? 어떻게 고치나?

   <details markdown="1"><summary>답 확인</summary>

   캡티브 의존성이다. Singleton이 Scoped 서비스를 붙잡아 그 Scoped 객체(와 DB 컨텍스트)가 앱 종료까지 살아남고, "요청마다 새로"라는 약속이 깨진다. 프레임워크의 수명 검사는 성능 비용 때문에 기본적으로 개발 환경에서만 켜지므로 운영에서는 조용히 뜬 것이다. 규칙은 "자기보다 수명이 같거나 긴 것에만 의존"이다. `RankingCache`를 Scoped로 내리거나, 꼭 Singleton이어야 하면 필요할 때마다 스코프를 만들어 그 안에서 Scoped 서비스를 꺼낸다. → 코어 2 (2.1)

   > 🔧 보충(책 외): Singleton 안에서 스코프를 만들 때는 보통 `IServiceScopeFactory`를 주입받아 `CreateAsyncScope()`를 호출한다. 또 EF Core의 DB 컨텍스트는 여러 스레드가 동시에 쓰도록 설계되지 않았기 때문에, Singleton에 붙잡힌 DB 컨텍스트는 동시 요청에서 예외나 데이터 꼬임으로 이어질 수 있다(DB 컨텍스트는 [제10부](10_제10부_EF_Core_데이터_접근.md)).

   </details>

3. **상황:** `appsettings.json`의 `Game:OfflineRewardMaxHours`는 8인데, 운영 서버에서는 12시간치 보상이 지급된다. 코드는 `IOptions<GameSettings>`로 값을 받는다. 다른 운영자는 "아예 0으로 바꿔서 오프라인 보상을 막자"고 한다.
   **질문:** 12는 어디서 왔을 가능성이 있고 어떤 순서로 확인하나? 0으로 바꾸면 어떻게 되나?

   <details markdown="1"><summary>답 확인</summary>

   설정은 여러 프로바이더를 합치며 나중 것이 같은 키를 덮어쓴다. 우선순위(명령줄 > 환경 변수 > 사용자 비밀(개발 환경) > `appsettings.{환경}.json` > `appsettings.json`)대로 위에서부터 확인한다: 실행 인자, 환경 변수 `Game__OfflineRewardMaxHours`, `ASPNETCORE_ENVIRONMENT`에 맞는 `appsettings.Production.json`(환경 변수가 없으면 Production). 또 `IOptions<T>`는 Singleton이라 파일을 바꿔도 처음 값을 유지하므로, 재시작 없이 반영하려면 `IOptionsSnapshot`/`IOptionsMonitor`가 필요하다. 0으로 바꾸면 `[Range(1, 72)]` + `ValidateOnStart()` 때문에 서버가 시작 단계에서 실패한다(의도된 안전장치). → 코어 3 (3.1)

   </details>

4. **상황:** DB 점검 공지를 걸고 DB를 잠시 내렸더니, 점검과 상관없는 API 서버 컨테이너들까지 전부 재시작을 반복한다. liveness 엔드포인트에 `AddDbContextCheck<T>`가 들어 있다.
   **질문:** 왜 이런 연쇄가 생기고, 헬스 체크를 어떻게 나눠야 하나?

   <details markdown="1"><summary>답 확인</summary>

   오케스트레이터는 liveness가 실패하면 컨테이너를 재시작한다. liveness에서 DB 같은 다른 서비스 상태까지 확인하면 남의 장애 때문에 멀쩡한 앱이 재시작되는 연쇄 실패가 생긴다. liveness(`/healthz/live`)는 "응답할 수 있는가"만 보고, DB·밸런스 데이터 로딩 같은 의존 대상은 readiness(`/healthz/ready`)에 태그로 묶어 넣는다. readiness가 실패하면(503) 재시작 대신 트래픽만 끊긴다. 시작이 오래 걸리면 startup 프로브를 따로 두고, 프로브 검사는 빨라야 한다. → 코어 4 (4.3)

   </details>

5. **상황:** "Player 1234가 어제 보상을 못 받았다"는 문의가 왔는데, 로그 검색 도구에서 PlayerId로 필터가 되지 않는다. 코드는 `logger.LogInformation($"Claim start. Player {playerId}")`였고, 같은 코드 근처에서 결제 영수증 원문도 로그로 남기고 있었다.
   **질문:** 무엇을 고쳐야 하나?

   <details markdown="1"><summary>답 확인</summary>

   보간 문자열 대신 메시지 템플릿(`"Claim start. Player {PlayerId}", playerId`)을 쓴다. 출력은 같지만 템플릿은 구조화 로그에서 값으로 검색할 수 있고, 로그가 꺼진 레벨일 때 문자열 처리를 건너뛰어 가볍다. 예외는 별도 인자(`LogError(ex, ...)`)로 넘긴다. 결제 정보·개인정보·비밀번호·키·연결 문자열은 로그에 남기지 않는다. 콘솔을 JSON 구조화 로그로 바꾸려면 `AddJsonConsole()`. → 코어 4 (4.1)

   </details>

---

## 🧠 인출 연습 — 책을 덮고 하세요

> 다시 읽기는 "아는 느낌"만 줍니다. 아래는 반드시 **본문을 보지 않고** 먼저 시도하고, 막힌 곳만 다시 읽으세요.

### 1. 백지 복습

빈 종이에 아래 골격을 채워 보세요. 채우지 못한 칸이 다시 읽을 곳입니다.

```
ASP.NET Core 핵심 동작 — 한 문장: ( ? ) 위에서 DI가 ( ? )에 맞춰 넣고, 설정은 ( ? ), 운영은 ( ? )·( ? )·( ? )
├─ 코어 1 파이프라인 (1.1)
│        ( ? )방향 / HttpContext / next 안 부르면 ( ? ) / 순서 = ( ? )
│        엔드포인트 미들웨어는 ( ? )에 자동 / next 후 헤더 변경 = ( ? )
│        클래스 미들웨어 조건: ____, ____ / 등록 관례 ( ? )
│        C++ 필터 체인과 다른 점: ( ? )
├─ 코어 2 DI 수명 (2.1)
│        생성자 주입 / Transient·Scoped·Singleton 각각 ____
│        선택 요령 ( ? )→( ? )→( ? ) / 캡티브 의존성 = ( ? ) / 규칙 ( ? )
│        수명 검사는 ( ? ) 환경에서만 / 루트 컨테이너에서 Scoped 꺼내기 → ( ? )
├─ 코어 3 설정 (3.1)
│        설정 vs 비밀 / 프로바이더 우선순위 ____ > ____ > ____ > ____ > ____
│        환경 변수 ( ? ), 기본 환경 ( ? ) / 계층 키 구분자 ( ? )
│        IOptions(( ? ) 수명, 변경 ( ? )) / IOptionsSnapshot(( ? )) / IOptionsMonitor(( ? ))
│        ValidateDataAnnotations + ( ? )
└─ 코어 4 운영 3종
         4.1 로그 용도 3가지 / ILogger<T>의 T = ( ? ) / 프로바이더
             레벨 6단계 ____ / 메시지 템플릿 장점 2가지 ____ / 남기지 말 것 ____
         4.2 미처리 예외 = ( ? ) / 개발: ( ? ) / 운영: UseExceptionHandler 동작 ( ? )
             함정 2가지 ____ / Problem Details 필드 ____ / 검증 실패 = ( ? )
         4.3 상태 3가지 ____ / AddHealthChecks + MapHealthChecks / IHealthCheck / Predicate·태그 / 비정상 = ( ? )
             liveness vs readiness vs startup
```

### 2. 인출 질문

1. 미들웨어 파이프라인이 "양방향"이라는 말은 무슨 뜻이며, 단락(short-circuit)이란?

   <details markdown="1"><summary>답 확인</summary>

   요청이 들어갈 때 한 번, 응답이 나올 때 역순으로 한 번 각 미들웨어가 실행 기회를 얻는다(마트료시카처럼 바깥이 안쪽을 감쌈). `await next(context)` 를 부르지 않고 응답을 직접 만들면 뒤쪽 미들웨어와 엔드포인트가 실행되지 않는데 이것이 단락이다. → 코어 1 (1.1)

   </details>

2. 미들웨어 순서가 중요한 이유와, 예외 처리 미들웨어를 어디에 두어야 하나요?

   <details markdown="1"><summary>답 확인</summary>

   `Use*` 로 추가한 순서가 곧 실행 순서다. 예외는 앞쪽 미들웨어 방향으로 거슬러 올라가므로, 뒤쪽 예외를 잡아야 하는 에러 처리 미들웨어는 앞쪽에 둔다. → 코어 1 (1.1), 코어 4 (4.2)

   </details>

3. `MapGet` 은 미들웨어인가요? 처리할 엔드포인트가 없으면?

   <details markdown="1"><summary>답 확인</summary>

   미들웨어가 아니라 엔드포인트 정의다. `WebApplication` 이 엔드포인트 미들웨어를 맨 끝에 자동 추가하고, 처리할 곳이 없으면 404를 돌려준다. → 코어 1 (1.1)

   </details>

4. `next` 호출 뒤에 응답 헤더나 상태 코드를 바꾸면 어떻게 되나요?

   <details markdown="1"><summary>답 확인</summary>

   응답이 이미 전송된 경우 예외가 난다. 바꿀 것은 `next` 전에 바꾼다. → 코어 1 (1.1)

   </details>

5. 클래스 미들웨어를 만들 때 필요한 형태와 등록 관례는?

   <details markdown="1"><summary>답 확인</summary>

   `RequestDelegate` 를 받는 public 생성자와 `HttpContext` 를 첫 매개변수로 받는 `Invoke`/`InvokeAsync` 메서드. 특정 부모 클래스나 인터페이스를 상속할 필요는 없다. 등록은 `UseMiddleware<T>()` 를 감싼 확장 메서드로 하는 것이 관례다. → 코어 1 (1.1)

   </details>

6. DI 수명 세 가지의 생성 시점과 대표 용도는?

   <details markdown="1"><summary>답 확인</summary>

   Transient: 요청받을 때마다 새로(상태 없는 가벼운 서비스). Scoped: 웹 요청 하나당 하나(DB 컨텍스트, 플레이어 데이터 서비스). Singleton: 앱이 살아 있는 동안 하나(읽기 전용 공용 데이터), 여러 요청 스레드가 동시에 쓰므로 스레드 안전해야 한다. 사용자별 데이터를 Singleton에 두면 다른 사용자에게 샐 수 있다. → 코어 2 (2.1)

   </details>

7. 캡티브 의존성이란 무엇이고, 이를 막는 규칙과 프레임워크의 검사는?

   <details markdown="1"><summary>답 확인</summary>

   Singleton이 Scoped 서비스를 주입받아 그 Scoped 객체가 앱 종료까지 붙잡혀 "요청마다 새로"라는 약속이 깨지는 것. 규칙: 자기보다 수명이 같거나 긴 것에만 의존한다. 개발 환경에서는 프레임워크가 검사해 시작 시(또는 처음 쓸 때) 예외를 던지며, 성능 비용 때문에 기본적으로 개발 환경에서만 켜진다. → 코어 2 (2.1)

   </details>

8. 앱 시작 시 Scoped 서비스가 필요할 때 `app.Services` 에서 바로 꺼내면 왜 안 되나요?

   <details markdown="1"><summary>답 확인</summary>

   루트 컨테이너에서 Scoped/Transient를 꺼내면 앱 종료까지 남아 메모리가 샌다. `CreateAsyncScope()`(권장) 또는 `CreateScope()` 로 스코프를 만들고 그 안에서 꺼낸다. → 코어 2 (2.1)

   </details>

9. 설정 프로바이더의 우선순위와 "덮어쓰기" 원리는?

   <details markdown="1"><summary>답 확인</summary>

   여러 프로바이더에서 키-값을 읽어 합치며 나중에 추가된 프로바이더가 같은 키를 덮어쓴다. 우선순위: 명령줄 > 환경 변수 > 사용자 비밀(개발 환경) > `appsettings.{환경}.json` > `appsettings.json`. → 코어 3 (3.1)

   </details>

10. 비밀은 어디에 두어야 하며, User Secrets와 환경 변수는 암호화되나요?

    <details markdown="1"><summary>답 확인</summary>

    `appsettings.json` 에 넣지 않고 로컬은 User Secrets, 서버는 환경 변수를 쓰는 것이 흔하다. 둘 다 암호화되지는 않으므로 "저장소에 안 올리기"용이다. → 코어 3 (3.1)

    </details>

11. 환경은 어떻게 정해지며, 환경 변수로 계층 키를 줄 때의 구분자는?

    <details markdown="1"><summary>답 확인</summary>

    `ASPNETCORE_ENVIRONMENT` 값(Development/Staging/Production)으로 정해지고 없으면 Production이다. `appsettings.Development.json` 같은 환경별 파일이 기본 파일 위에 덮어써진다. 계층 키는 `:` 대신 `__` 를 쓰는 것이 안전하다(`Game__GoldPerSecond` → `Game:GoldPerSecond`). → 코어 3 (3.1)

    </details>

12. `IOptions<T>`, `IOptionsSnapshot<T>`, `IOptionsMonitor<T>` 의 차이는?

    <details markdown="1"><summary>답 확인</summary>

    `IOptions<T>` 는 Singleton이라 파일이 바뀌어도 처음 값을 유지한다. `IOptionsSnapshot<T>` 는 Scoped로 요청마다 새로 만들어 변경을 반영하지만 매 요청 재계산 비용이 든다. `IOptionsMonitor<T>` 는 Singleton에서도 변경 반영이 필요할 때 쓴다. → 코어 3 (3.1)

    </details>

13. 옵션 패턴에서 `ValidateOnStart()` 를 권하는 이유와, 프로퍼티 이름 오타의 위험은?

    <details markdown="1"><summary>답 확인</summary>

    설정이 잘못되면 실행 중 뒤늦게가 아니라 시작 시점에 실패하게 하려고 Architecting ASP.NET Core Applications이 기본으로 권한다(`ValidateDataAnnotations()` 와 함께). 옵션 클래스 프로퍼티 이름과 JSON 키가 어긋나면 조용히 기본값이 남을 수 있어 검증이 필요하다. → 코어 3 (3.1)

    </details>

14. 로그 레벨 여섯 단계와 운영 환경에서의 권장 설정은?

    <details markdown="1"><summary>답 확인</summary>

    Critical, Error, Warning, Information, Debug, Trace(심각한 것부터). 운영에서는 Trace는 끄고(민감 정보 위험), Debug는 조사할 때만, Information 이상은 켜 두되 ASP.NET Core 자체의 Information 로그는 줄인다(`Logging:LogLevel` 의 카테고리별 설정). → 코어 4 (4.1)

    </details>

15. 메시지 템플릿(`"Player {PlayerId}", id`)이 보간 문자열보다 나은 점과, 로그에 남기지 말아야 할 것은?

    <details markdown="1"><summary>답 확인</summary>

    출력은 같지만 로그가 꺼진 레벨일 때 문자열 처리를 건너뛰어 가볍고, 구조화 로그에서 값으로 검색할 수 있다. 예외는 별도 인자로 넘기면 함께 기록된다. 남기지 말 것: 비밀번호·키·연결 문자열, 개인정보, 결제 정보. → 코어 4 (4.1)

    </details>

16. `UseExceptionHandler("/error")` 는 어떻게 동작하며, 어떤 함정이 있나요?

    <details markdown="1"><summary>답 확인</summary>

    예외를 잡으면 요청 경로를 오류 경로로 바꿔 파이프라인을 다시 실행해 응답을 만들고 상태 코드를 500으로 맞춘다. 함정: 이미 응답 전송이 시작됐으면 바꿀 수 없고, 오류 처리 경로 자체가 예외를 던지면 날것의 500이 나간다. 그래서 오류 처리 코드는 단순하게 한다. 개발 환경에서는 개발자 예외 페이지가 자동 추가된다. → 코어 4 (4.2)

    </details>

17. Problem Details의 주요 필드와 콘텐츠 형식, 그리고 운영에서 스택 트레이스를 숨기는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    RFC 7807 형식으로 `type`, `title`, `status`, `detail`, `instance` 필드를 가지며 `application/problem+json` 으로 내려간다. 검증 실패는 400 + `ValidationProblemDetails`(필드별 `errors`). 스택 트레이스는 공격자에게 정보를 주므로 운영에서 절대 노출하지 않는다. → 코어 4 (4.2)

    </details>

18. 헬스 체크의 세 가지 상태와 기본 등록 방법, 커스텀 검사 방법은?

    <details markdown="1"><summary>답 확인</summary>

    Healthy, Degraded, Unhealthy. `AddHealthChecks()` 로 등록하고 `MapHealthChecks("경로")` 로 열면 정상일 때 200과 `Healthy` 가 나온다. 커스텀은 `IHealthCheck.CheckHealthAsync` 를 구현해 `AddCheck<T>(이름, tags: ...)` 로 등록하고, `Predicate` 로 태그·이름별로 골라 엔드포인트를 나눈다. 비정상이면 503. EF Core는 `AddDbContextCheck<T>`. → 코어 4 (4.3)

    </details>

19. liveness와 readiness의 차이와, liveness에서 다른 서비스 상태를 확인하면 안 되는 이유는?

    <details markdown="1"><summary>답 확인</summary>

    liveness는 "응답할 수 있는가"만 보고, readiness는 초기화·의존 대상 상태를 반영해 트래픽을 받을 준비가 됐는지 본다. liveness에서 다른 서비스까지 확인하면 남의 장애 때문에 멀쩡한 앱이 재시작되는 연쇄 실패가 생길 수 있다. 시작이 오래 걸리면 startup 프로브를 따로 쓰고, 프로브 검사는 빨라야 한다. → 코어 4 (4.3)

    </details>

20. C++ 서버의 패킷 필터 체인과 미들웨어 파이프라인은 어디까지 같고 어디서 다른가요?

    <details markdown="1"><summary>답 확인</summary>

    같은 점: 등록 순서대로 단계가 실행되고, 각 단계가 한 가지 일을 하고 넘기며, 중간에서 처리를 끝내 뒤를 건너뛸 수 있다(단락). 다른 점: 미들웨어는 양방향이라 `await next()`가 돌아온 뒤 같은 미들웨어가 응답 쪽 코드를 한 번 더 실행하고, 예외도 이 길을 거꾸로 거슬러 오른다(그래서 예외 처리는 맨 앞). 응답 전송이 시작된 뒤에는 헤더를 바꿀 수 없다. → 코어 1 (1.1)

    </details>

21. `main()`에서 매니저 싱글턴들을 손으로 조립하던 코드와 DI 컨테이너는 무엇이 다른가요? C++ 서버에 없던 수명은?

    <details markdown="1"><summary>답 확인</summary>

    객체 그래프를 시작 지점에서 조립한다는 점은 같지만, DI 컨테이너는 "타입 → 구현 + 수명" 등록만 받고 생성자 매개변수를 보고 알아서 만들어 넣는다. C++ 서버에 거의 없던 개념이 **Scoped**(HTTP 요청 하나 동안만 사는 객체)이며, Singleton이 Scoped를 붙잡으면 캡티브 의존성이 된다. → 코어 2 (2.1)

    </details>

### 3. 기억 고리

- **C++ 유추:** 미들웨어 파이프라인 ≈ 패킷 처리 필터 체인. ⚠️ 깨지는 곳: 필터 체인은 대개 단방향이지만 미들웨어는 `next` 전후로 두 번 실행 기회가 있는 양방향이고, 예외가 앞쪽으로 거슬러 올라가므로 예외 처리 미들웨어는 맨 앞에 있어야 한다.
- **C++ 유추:** DI 컨테이너 ≈ 서버 시작 시 매니저 싱글턴들을 조립하던 코드. ⚠️ 깨지는 곳: 수명이 셋이고, 그중 **Scoped는 요청 단위**다. 매니저(Singleton)가 요청 단위 객체를 멤버로 붙잡으면 캡티브 의존성이다.
- **C++ 유추:** 옵션 패턴 ≈ 설정 파일 로더. ⚠️ 깨지는 곳: 파일 하나가 아니라 JSON·환경별 JSON·User Secrets·환경 변수·명령줄이 겹쳐 나중 것이 이기고, 검증(`ValidateOnStart`)과 재시작 없는 변경 반영(`IOptionsMonitor`)이 붙는다.
- **C++ 유추:** `UseExceptionHandler` ≈ 패킷 처리 최상위 `try/catch`. ⚠️ 깨지는 곳: 세션을 끊지 않고 500 Problem Details를 응답한다. 스택 트레이스는 응답에 싣지 않는다.
- **비유:** 미들웨어 파이프라인 = 마트료시카. 요청은 바깥 인형부터 안으로 들어가고 응답은 안에서 밖으로 나온다. ⚠️ 비유가 깨지는 지점: 인형과 달리 미들웨어는 `next` 를 부르지 않고 중간에서 되돌아갈(단락) 수 있고, 응답 전송이 시작된 뒤에는 바깥 층이 헤더를 고칠 수 없다.
- **비유:** 캡티브 의존성 = 평생 회원(Singleton)이 하루 입장권(Scoped)을 영원히 쥐고 있는 것. 입장권은 매일 새로 발급돼야 하는데 그 하나가 계속 재사용된다. ⚠️ 깨지는 지점: 반대 방향(Scoped가 Singleton에 의존)은 문제없다.
- **묶음(3의 법칙):** DI 수명 3 = Transient · Scoped · Singleton. 옵션 인터페이스 3 = IOptions · IOptionsSnapshot · IOptionsMonitor. 헬스 상태 3 = Healthy · Degraded · Unhealthy. 운영 기본 틀 3 = 로깅 · 예외 처리 · 헬스 체크.
- **대칭·순서:** 개발자 예외 페이지(개발) ↔ `UseExceptionHandler`(운영), liveness ↔ readiness, 예상 가능한 실패(4xx) ↔ 예상 밖 오류(500). 설정 우선순위: 명령줄 > 환경 변수 > User Secrets > 환경별 json > appsettings.json.
- **결정적 지식 두 개:** ① "파이프라인은 추가 순서대로 감싸는 양방향 구조다" — 예외 처리 미들웨어를 앞에 두는 이유, 단락, `next` 후 헤더 변경 불가, `UseExceptionHandler`의 재실행 동작이 모두 이 원리로 설명된다. ② "수명이 짧은 것을 긴 것이 붙잡으면 안 된다" — 캡티브 의존성, 루트 컨테이너에서 Scoped 꺼내기 누수, Singleton의 스레드 안전·사용자 데이터 누출 문제가 이 원리로 설명된다.

### 4. 가르치기 · 반대편 서기

- **거울 설명 (1분, 원고 없이):** "요청 하나가 `Program.cs` 의 미들웨어들을 지나 엔드포인트에 닿고, 예외가 나면 어떻게 Problem Details 500이 되는가"를 처음 듣는 사람에게 설명해 보세요. 말이 막히는 지점 = 지식의 구멍.
- **C++ 서버 동료에게 설명하기:** "우리 서버의 패킷 필터 체인과 매니저 초기화 코드가 ASP.NET Core에서는 각각 무엇이 되고, 왜 예외 처리 미들웨어는 맨 앞이어야 하며, 왜 매니저(Singleton)가 DB 컨텍스트를 멤버로 들고 있으면 안 되는지"를 3분 안에 설명해 보세요.
- **랜덤 논리 게임:** A "서비스는 가능하면 Singleton으로 등록해 재사용해야 한다(Architecting ASP.NET Core Applications의 선택 요령)" vs B "Scoped가 안전하다(스레드 안전·사용자 데이터 누출·캡티브 의존성)" — 양쪽을 번갈아 변호해 보세요.
- **AI 역할 반전:** "내가 ASP.NET Core 설정 프로바이더 우선순위와 옵션 패턴을 설명할 테니, 정답은 말하지 말고 틀리거나 빠진 부분만 질문으로 짚어 줘."

### 5. 간격 반복

- [ ] 10분 뒤 — 코어 4개를 소리 내어 말하기
- [ ] 1일 뒤 — 인출 질문 + 시나리오 다시 풀기
- [ ] 1주 뒤 — 백지 복습
- [ ] 1달 뒤 — 플래시카드 + 거울 설명
