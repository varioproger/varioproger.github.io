---
title: "제9부. ASP.NET Core 핵심 동작"
parent: "C# 방치형 RPG 서버 필수 이론"
nav_order: 9
---

# 제9부. ASP.NET Core 핵심 동작

> 학습 목표
> 1. 요청 하나가 미들웨어 파이프라인을 어떻게 오가는지 설명하고, 순서가 왜 중요한지 안다.
> 2. DI 등록과 수명(Singleton/Scoped/Transient), 설정(appsettings·옵션 패턴)을 올바르게 고른다.
> 3. 로깅, 예외 처리(오류 응답), 헬스 체크로 "운영 가능한" 서버의 기본 틀을 갖춘다.

> 코드 예제 공통 전제: `Microsoft.NET.Sdk.Web` 프로젝트(.NET 8, C# 12), 암시적 using 켜짐. 예제의 `Program.cs`에서 최상위 문장은 타입 선언보다 앞에 두었다.

---

## 제1장. 요청 처리 흐름

### 9.1 요청 처리 흐름과 미들웨어 파이프라인

> 📖 출처: b1 4장 "Handling requests with the middleware pipeline" (b1.txt L3765-4571), b12 4장 "Middleware" (b12.txt L7871-8624)

**한 줄 요약**: 요청은 미들웨어라는 부품을 차례로 통과해 엔드포인트에 닿고, 응답은 같은 길을 거꾸로 되돌아온다.

**핵심 설명**
- 미들웨어는 요청/응답을 다루는 작은 부품이다. 여러 개를 이어 붙인 것이 파이프라인이며(b1), 각 미들웨어는 인증·로깅 같은 한 가지 일을 하고 다음으로 넘긴다(b12).
- 파이프라인은 **양방향**이다. 요청이 들어갈 때 한 번, 응답이 나올 때 역순으로 한 번, 각 미들웨어가 실행 기회를 얻는다. 러시아 인형(마트료시카)처럼 바깥 층이 안쪽 층을 감싼다고 생각하면 쉽다(b1).
- 미들웨어는 `HttpContext`(요청 한 건의 정보를 담은 상자)를 받는다. `await next(context)`를 부르면 다음 미들웨어로 가고, 부르지 않고 응답을 직접 만들면 뒤쪽은 실행되지 않는다. 이를 **단락(short-circuit)** 이라 한다.
- `Use*` 메서드로 추가하며 **추가한 순서가 곧 실행 순서**다. 에러 처리 미들웨어처럼 뒤쪽 예외를 잡아야 하는 것은 앞쪽에 둔다(b1).
- `MapGet` 등은 미들웨어가 아니라 **엔드포인트 정의**다. `WebApplication`은 엔드포인트 미들웨어를 맨 끝에 자동 추가하고, 처리할 곳이 없으면 404를 돌려준다(b1).
- 주의: `next` 호출이 끝난 뒤에는 응답 헤더/상태 코드를 바꾸면 이미 전송된 경우 예외가 난다. 바꿀 것은 `next` 전에 바꾼다(b12).
- 직접 만들 때 클래스 미들웨어는 `RequestDelegate`를 받는 public 생성자와 `HttpContext`를 첫 매개변수로 받는 `Invoke`/`InvokeAsync` 메서드를 갖는다. 등록은 `UseMiddleware<T>()`를 감싼 확장 메서드로 하는 것이 관례다(b12, b1). 미들웨어 클래스가 특정 부모 클래스나 인터페이스를 상속할 필요는 없다(b12).

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

---

## 제2장. 의존성 주입

### 9.2 의존성 주입 등록과 수명(Singleton/Scoped/Transient)

> 📖 출처: b1 9장 "Understanding lifetimes: When are services created?" 및 "Resolving scoped services outside a request" (b1.txt L10915-11463), b12 2장 "Dependency injection" (b12.txt L5089-5490), b9 8장 "Object lifetime" (b9.txt L11154-11220)

**한 줄 요약**: 객체를 `new` 하지 않고 컨테이너에 "등록"해 두면, 프레임워크가 필요한 곳에 만들어 넣어 주며 수명은 등록 방식이 결정한다.

**핵심 설명**
- 클라이언트 클래스가 의존 대상을 직접 `new` 하면 서로 단단히 묶여 교체·테스트가 어렵다. ASP.NET Core는 **생성자 주입**을 쓴다. 인터페이스와 구현을 만들고, `builder.Services`(컨테이너)에 등록하고, 생성자 매개변수로 받는다(b12). C# 12 기본 생성자로 필드 선언을 생략할 수도 있다(b12).
- 수명 세 가지(b1, b12, b9 공통):
  - **Transient**: 요청받을 때마다 새로 생성. 상태 없는 가벼운 서비스용.
  - **Scoped**: 웹에서는 **요청 하나당 하나**. 한 요청 안에서는 같은 객체를 공유, 다음 요청은 새 객체. DB 컨텍스트가 대표 사례.
  - **Singleton**: 앱이 살아있는 동안 하나. 여러 요청 스레드가 동시에 쓰므로 **스레드 안전**해야 한다(b1).
- b9의 선택 요령: 가능하면 Singleton, 어려우면 Scoped, 그것도 안 되면 Transient. 다만 사용자별 데이터를 들고 있는 객체는 Singleton으로 두면 다른 사용자에게 새어 나갈 수 있다.
- **캡티브 의존성(captive dependency)**: Singleton이 Scoped 서비스를 주입받으면 그 Scoped 객체가 앱 종료까지 붙잡혀 "요청마다 새로"라는 약속이 깨진다. 규칙은 "자기보다 수명이 **같거나 긴** 것만 의존"이다. 개발 환경에서는 프레임워크가 이를 검사해 앱 시작 시(또는 그 의존성을 처음 쓸 때) 예외를 던진다. 이 검사는 성능 비용이 있어 기본적으로 개발 환경에서만 켜진다(b1).
- `app.Services`(루트 컨테이너)에서 Scoped/Transient를 직접 꺼내면 앱 종료까지 남아 메모리가 샌다. 필요하면 `CreateScope()`나 `CreateAsyncScope()`로 스코프를 만들고 그 안에서 꺼낸다. b1은 가능하면 `CreateAsyncScope()`를 쓰라고 하고, b12의 예제는 `CreateScope()`를 쓴다.

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

> 🔧 보충(책 외): `Interlocked.Add`로 Singleton의 카운터를 안전하게 만든 것은 예시 구현이다. 책은 "Singleton은 스레드 안전해야 한다"는 원칙만 다룬다.

---

## 제3장. 설정

### 9.3 설정: appsettings.json, 환경, 옵션 패턴

> 📖 출처: b1 10장 "Configuring an ASP.NET Core application" (b1.txt L11535-12500, L12707-12960), b12 3장 "Configuration" / "Environments" (b12.txt L5948-7087), b9 9장 "Validating our options objects" (b9.txt L14539-14700)

**한 줄 요약**: 바뀔 수 있는 값(연결 문자열, 게임 수치)은 코드 밖 설정에 두고, 타입이 있는 옵션 클래스로 받아 쓴다.

**핵심 설명**
- **설정(setting)** 은 앱 동작을 바꾸는 값, **비밀(secret)** 은 비밀번호·API 키 같은 민감한 설정이다. 코드 밖으로 빼두면 재컴파일 없이 바꿀 수 있고, 소스 저장소에 비밀이 올라가는 사고도 줄어든다(b1).
- 설정은 여러 **프로바이더**(JSON 파일, 환경 변수, 명령줄 등)에서 키-값으로 읽어 하나로 합친다. **나중에 추가된 프로바이더가 같은 키를 덮어쓴다**(b1). b12의 우선순위 표: 명령줄 > 환경 변수 > 사용자 비밀(개발 환경) > `appsettings.{환경}.json` > `appsettings.json`.
- 비밀은 `appsettings.json`에 넣지 않는다. 로컬은 User Secrets, 서버는 환경 변수가 흔한 방법이다. 둘 다 암호화되지는 않으므로 "저장소에 안 올리기"용이라는 점을 기억한다(b1).
- **환경**은 `ASPNETCORE_ENVIRONMENT` 값(`Development`/`Staging`/`Production`)으로 정해지고, 없으면 Production이다. `IsDevelopment()` 같은 메서드로 확인하고, `appsettings.Development.json`처럼 환경별 파일이 기본 파일 위에 덮어써진다(b1).
- **옵션 패턴**: 설정 섹션을 POCO 클래스(인자 없는 public 생성자, 프로퍼티)에 바인딩하고 `IOptions<T>`로 주입받는다. 문자열 키 오타와 형 변환 실수가 줄어든다(b1, b12). 단, 옵션 클래스 프로퍼티 이름과 JSON 키가 어긋나면 조용히 기본값이 남을 수 있으니 오타를 조심하고 아래 검증을 함께 쓴다(b1). `IOptions<T>`는 Singleton이라 파일이 바뀌어도 처음 값을 유지하고, `IOptionsSnapshot<T>`(Scoped)는 요청마다 새로 만들어져 변경을 반영하며(대신 매 요청 재계산 비용이 든다), `IOptionsMonitor<T>`(Singleton)는 Singleton에서도 변경 반영이 필요할 때 쓴다(b1, b12).
- 환경 변수로 계층 키를 줄 때는 `:` 대신 `__`(밑줄 두 개)를 쓰는 것이 리눅스 등에서 안전하다. 예를 들어 `Game__GoldPerSecond`는 `Game:GoldPerSecond`로 읽힌다(b1, b12).
- b9는 `ValidateOnStart()`를 기본으로 권한다. 설정이 잘못되면 실행 중 뒤늦게가 아니라 **시작 시점에 실패**하게 한다. 데이터 애노테이션 검증은 `ValidateDataAnnotations()`로 켠다.

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

---

## 제4장. 로깅

### 9.4 로깅

> 📖 출처: b12 4장 "Logging" (b12.txt L7136-7870, 특히 L7816-7866), b9 10장 "Logging Patterns" (b9.txt L15690-16336), b1 26장 "Monitoring and troubleshooting errors with logging" (b1.txt L33135-33720)

**한 줄 요약**: 서버는 눈앞에서 디버깅할 수 없으므로, 무슨 일이 있었는지 `ILogger`로 남겨 두어야 나중에 원인을 찾는다.

**핵심 설명**
- 로그는 크게 감사/분석용, 오류 기록, 오류 직전의 "빵부스러기" 기록으로 쓰인다. ASP.NET Core 자체도 요청·EF Core 쿼리를 많이 남겨 주므로, 직접 남길 로그는 의미 있는 것에 집중한다(b1).
- 구조: 코드에서는 `ILogger`만 쓰고, 어디에 쓸지는 **프로바이더**(콘솔, 파일 등)가 정한다. 기본 빌더가 콘솔 등을 이미 등록하므로 코드 수정 없이 목적지를 바꿀 수 있다(b1, b9).
- 가장 흔한 방법은 클래스에 `ILogger<T>`를 주입하는 것이다. `T`가 로그의 **카테고리**(어느 클래스의 로그인지)가 된다(b1, b9).
- **로그 레벨**(심각한 것부터): Critical, Error, Warning, Information, Debug, Trace. b9의 표는 운영에서 Trace는 끄고, Debug는 문제를 조사할 때만 켜며, Information 이상은 켜 두되 ASP.NET Core 자체의 Information 로그는 줄이라고 권한다. Trace는 민감 정보를 담을 수 있어 운영에서 켜지 않는다(b1, b9, b12).
- **메시지 템플릿**: `"Player {PlayerId}"`처럼 자리표시자와 인자를 따로 넘긴다. 보간 문자열(`$"..."`)과 출력은 같지만, 템플릿은 로그가 꺼진 레벨일 때 문자열 처리를 건너뛰어 가볍고, 구조화 로그에서 값으로 검색할 수 있다(b1, b9). 예외는 별도 인자로 넘기면 함께 기록된다(b1).
- 레벨은 설정으로 조절한다. `Logging:LogLevel`에 `Default`와 카테고리별(예: `Microsoft`) 최소 레벨을 적고, 환경별 파일로 덮어쓴다(b9). `AddJsonConsole()`로 콘솔을 JSON 구조화 로그로 바꿀 수 있다(b9).
- 남길 것: 검증 실패, 인증·인가 실패, 예외, 시작/종료, 위험한 작업, 중요한 비즈니스 이벤트. **남기지 말 것**: 비밀번호·키·연결 문자열, 개인정보, 결제 정보(b12).

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

---

## 제5장. 예외 처리와 오류 응답

### 9.5 예외 처리와 오류 응답

> 📖 출처: b12 16장 "Error handling" (b12.txt L23453-23590, L23744-23855), b1 4장 "Handling errors using middleware" (b1.txt L4573-4937)

**한 줄 요약**: 처리되지 않은 예외는 500이 되므로, 예외 처리 미들웨어를 앞쪽에 두고 클라이언트가 파싱할 수 있는 JSON 오류 응답(Problem Details)을 내보낸다.

**핵심 설명**
- 파이프라인에서 던져진 예외는 앞쪽 미들웨어 방향으로 거슬러 올라가고, 아무도 잡지 않으면 서버는 500을 돌려준다(b1). 스택 트레이스가 응답에 실리면 공격자에게 정보를 주므로 운영에서는 절대 노출하지 않는다(b12).
- 개발 환경에서는 상세 정보를 보여 주는 개발자 예외 페이지를 쓰고(`WebApplication`이 Development에서 자동 추가), 운영에서는 `UseExceptionHandler("/error")` 미들웨어를 쓴다. 이 미들웨어는 예외를 잡으면 요청 경로를 오류 경로로 바꿔 파이프라인을 다시 실행해 응답을 만들고, 상태 코드를 500으로 맞춘다(b1).
- 함정: 이미 응답 전송이 시작됐으면 바꿀 수 없고, 오류 처리 경로 자체가 예외를 던지면 날것의 500이 나간다. 오류 처리 코드는 최대한 단순하게 만든다(b1).
- 오류 응답 형식은 **Problem Details**(RFC 7807)를 쓴다. 주요 필드는 `type`, `title`, `status`, `detail`, `instance`이며 `application/problem+json`으로 내려간다(b12).
- 입력 검증 실패는 400과 함께 문제 세부 정보(`ValidationProblemDetails`, 필드별 `errors`)를 돌려준다(b12). 단순한 애노테이션 검증으로 부족하면 FluentValidation 같은 라이브러리를 쓸 수 있다(b12).

> 🔧 보충(책 외): 실무에서는 "예상 가능한 실패"(없는 영웅 -> 404, 잘못된 입력 -> 400)는 예외를 던지지 않고 정상적인 4xx 응답으로 돌려주고, "예상 밖 오류"만 예외 처리 미들웨어에 맡기는 식으로 나누어 생각하면 편하다. 이 구분은 책의 표현이 아니다.

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

> 🔧 보충(책 외): 책은 컨트롤러 기반 `/error` 예제(b12)와 `MapGet("/error", ...)`로 문자열을 돌려주는 예제(b1)를 보여 준다. 위 코드는 이를 미니멀 API 형태로 바꾼 것이라 `Results.Problem`, `Results.ValidationProblem`, `app.Map`으로 오류 경로를 여는 부분은 책 예제가 아니다(`IExceptionHandlerFeature`로 예외를 꺼내 로그를 남기는 방식은 b12 컨트롤러 예제와 같다). b1의 Listing 10.15에는 `AddProblemDetails` 호출이 있으나 표기가 미심쩍어 예제에 넣지 않았다. 게임 시나리오도 보충 설명이다.

---

## 제6장. 헬스 체크

### 9.6 헬스 체크

> 📖 출처: b12 16장 "Health checks" (b12.txt L23856-24065)

**한 줄 요약**: 서버가 살아 있는지, 요청을 받을 준비가 됐는지를 알려 주는 전용 엔드포인트를 두면 운영 도구가 이를 보고 트래픽을 보내거나 재시작한다.

**핵심 설명**
- 헬스 체크는 앱 상태를 돌려주는 엔드포인트다. 상태는 Healthy, Degraded, Unhealthy 중 하나다. 로드 밸런서나 쿠버네티스 같은 오케스트레이터가 이를 보고 비정상 인스턴스로 트래픽을 끊거나 컨테이너를 재시작한다(b12).
- 기본: `AddHealthChecks()`로 서비스를 등록하고 `MapHealthChecks("경로")`로 엔드포인트를 연다. 정상이면 200과 `Healthy` 텍스트가 나온다(b12).
- 커스텀 검사는 `IHealthCheck`의 `CheckHealthAsync`를 구현하고 `AddCheck<T>(이름, tags: ...)`로 등록한다. 외부 서비스나 DB 상태를 확인할 때 쓴다. `MapHealthChecks`의 `Predicate`로 이름이나 태그별로 실행할 검사를 골라 엔드포인트를 나눌 수 있고(b12), 비정상이면 503이 나간다. `Predicate`를 안 주면 등록된 모든 검사가 실행된다(b12).
- EF Core를 쓰면 `AddDbContextCheck<T>`(전용 패키지)로 DB 검사를 쉽게 추가한다(b12).
- **liveness(살아 있나)** 는 "응답할 수 있는가"만 본다. 다른 서비스 상태까지 확인하면 남의 장애 때문에 멀쩡한 앱이 재시작되는 연쇄 실패가 생길 수 있다. **readiness(트래픽 받을 준비됐나)** 는 초기화·의존 대상 상태를 반영한다. 시작이 오래 걸리면 startup 프로브를 따로 쓴다(b12). 프로브 검사는 빨라야 한다(b12).

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
