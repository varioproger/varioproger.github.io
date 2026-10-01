---
title: "제10부. 데이터 접근 (EF Core)"
parent: "C# 방치형 RPG 서버 필수 이론"
nav_order: 10
---

# 제10부. 데이터 접근 (EF Core)

**학습 목표**
1. EF Core가 C# 클래스와 DB 테이블을 어떻게 이어 주는지 이해하고, `DbContext`로 조회·생성·수정·삭제를 할 수 있다.
2. 웹 서버에서 `DbContext`를 올바르게(DI, 요청당 1개, async) 쓰고, 관계·마이그레이션·추적 옵션 같은 실무 설정을 알아본다.
3. 게임 서버에서 가장 위험한 문제인 재화·아이템 이중 처리를 동시성 토큰, 트랜잭션, 멱등성 키로 막는 원리를 이해한다.

> 이 부의 예제는 공용 모델(`Player`, `Hero`, `GameDbContext`)을 1절에서 한 번 정의하고, 이후 절에서 그대로 가져다 씁니다.
> 각 절 출처의 `L숫자`는 원문 텍스트 파일의 줄 번호입니다. 원문은 요약해서 옮겼습니다.

---

## 1장. EF Core 시작하기

### 1. ORM과 EF Core 개념, DbContext

> 📖 출처: B5 1장 "An overview of EF Core" (b5.txt L1516-1573), B5 2장 "Creating the application's DbContext" (b5.txt L2978-3090), B12 5장 "Why use ORM?" / "Configuring the DbContext class" (b12.txt L8688-8813)

**한 줄 요약**: EF Core는 "테이블은 클래스, 행은 객체"로 바꿔 주는 번역기이고, 그 창구가 `DbContext`다.

**핵심 설명**
- ORM(Object-Relational Mapper)은 DB 테이블·열을 C# 클래스·속성에 연결해 준다. 테이블 = 클래스, 열 = 속성, 행 = 객체, SQL의 `WHERE` = LINQ의 `Where`에 대응한다(B5 표 1.1).
- SQL 문자열을 직접 쓰면 스키마가 바뀔 때마다 고쳐야 하고 타입 안전성도 없다. ORM은 이를 C# 코드로 옮겨 실수를 줄인다. 다만 성능이 중요한 복잡한 보고서 쿼리는 SQL을 직접 쓰는 편이 나을 때도 있다(B12).
- 단점도 있다. EF Core가 DB를 너무 잘 감춰서, C#에서는 되지만 DB로는 번역이 안 되는 코드를 쓰기 쉽다(예: 식 본문 속성 `FullName`으로 `Where`/`OrderBy`). 그래서 내부에서 어떤 SQL이 나가는지 로그로 확인하는 습관이 중요하다(B5).
- `DbContext`는 DB 연결을 유지하고, 객체의 변경을 추적하고, 트랜잭션을 관리하고, 저장(`SaveChanges`)을 맡는 클래스다(B12). `DbSet<T>` 속성 하나가 테이블 하나에 대응한다. 옵션(DB 종류, 연결 문자열)은 생성자로 받는다(B5).
- `DbSet` 속성을 `{ get; set; }` 대신 `=> Set<Player>()`로 쓰는 것은 nullable 참조 형식 경고를 없애려는 방법이다. B12는 `!`(null 허용 연산자)를 쓰거나 경고를 그냥 두어도 된다고 함께 소개한다.
- `DbContext`는 `IDisposable`이므로 직접 만들었다면 `using`으로 정리해야 한다(B5). 웹 서버에서는 DI가 대신 관리한다(7절).

```csharp
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

public class Player
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public long Gold { get; set; }
    public List<Hero> Heroes { get; set; } = new();
    [Timestamp] public byte[]? RowVersion { get; set; } // 8절에서 설명하는 동시성 토큰
}

public class Hero
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Level { get; set; }
    public int PlayerId { get; set; }   // 외래 키
    public Player? Player { get; set; } // 탐색 속성
}

public class GameDbContext(DbContextOptions<GameDbContext> options) : DbContext(options)
{
    public DbSet<Player> Players => Set<Player>(); // Players 테이블
    public DbSet<Hero> Heroes => Set<Hero>();      // Heroes 테이블
}
```

**방치형 RPG 서버에서는**: 플레이어·영웅·아이템 같은 게임 데이터는 대부분 `DbSet` 하나로 표현되고, `GameDbContext` 하나가 서버의 DB 창구가 된다.

> 🔧 보충(책 외): 이 부의 이후 예제는 위 `GameDbContext`가 이미 있다고 가정한다. 또 `Player.RowVersion`의 `[Timestamp]`가 값을 자동으로 채워 주는 것은 SQL Server 기준이다(8절 참고).

---

### 2. 엔티티 모델과 매핑 (규칙, 어노테이션, Fluent API)

> 📖 출처: B12 5장 "Configuring the mapping between models and database" (b12.txt L9515-10240, 규칙 L9528, 어노테이션 L9700, Fluent API L9887, 설정 분리 L10161), B5 4장 테이블 이름 규칙 설명 (b5.txt L6482-6487)

**한 줄 요약**: 아무 설정을 안 해도 EF Core가 규칙으로 매핑해 주고, 필요한 부분만 어노테이션이나 Fluent API로 덮어쓴다.

**핵심 설명**
- **규칙(convention)**: `Id` 또는 `<클래스명>Id`는 기본 키, 열 이름은 속성 이름이다. 테이블 이름은 `DbSet` 속성 이름이고(B5), `DbSet`이 없는 엔티티는 클래스 이름이 된다. SQL Server 기준으로 `string`은 `nvarchar(max)`, `decimal`은 `decimal(18,2)`, `enum`은 기본적으로 `int`로 저장된다(B12 표 5.1). 외래 키 열에는 자동으로 인덱스가 만들어진다(B12).
- **데이터 어노테이션**: 클래스·속성 위에 `[Table]`, `[Column]`, `[Key]`, `[Required]`, `[MaxLength]` 같은 특성을 붙인다. 설정이 모델 클래스 안에 들어가므로 이해하기 쉽지만, 클래스가 DB 설정으로 오염된다는 단점이 있다(B12).
- **Fluent API**: `OnModelCreating`에서 `HasMaxLength`, `IsRequired`, `HasIndex`, `HasConversion` 등을 호출한다. 같은 속성을 어노테이션과 Fluent API 양쪽에서 설정하면 Fluent API가 이기며, B12는 Fluent API를 권장한다.
- B12는 최적의 성능을 위해 엔티티마다 매핑을 명시하라고 권한다. 문자열이 `nvarchar(max)`가 되는 기본값이 항상 효율적이진 않기 때문이다. 엔티티가 많아지면 `IEntityTypeConfiguration<T>` 클래스로 설정을 나누고 `ApplyConfigurationsFromAssembly`로 한꺼번에 적용한다. 이때 설정 클래스는 `DbContext`와 같은 어셈블리에 있어야 하고 적용 순서는 통제할 수 없다. 순서가 중요하면 하나씩 직접 호출한다.
- 매핑을 바꿀 때마다 `dotnet ef migrations add`로 새 마이그레이션을 만들고 DB에 적용해야 한다. 타입을 바꾸는 매핑 변경은 데이터가 잘릴 수 있다(예: `nvarchar(max)` -> `varchar(32)`는 32자로 잘림).

```csharp
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public enum ItemGrade { Common, Rare, Epic }

[Table("Items")]                       // 어노테이션 방식
public class Item
{
    [Key] public int Id { get; set; }
    [Required, MaxLength(32)] public string Name { get; set; } = "";
    public ItemGrade Grade { get; set; }
}

public class ItemConfiguration : IEntityTypeConfiguration<Item> // Fluent API 방식
{
    public void Configure(EntityTypeBuilder<Item> builder)
    {
        builder.Property(i => i.Grade).HasConversion<string>().HasMaxLength(16); // enum을 문자열로 저장
        builder.HasIndex(i => i.Name);
    }
}

public class ConfiguredDbContext(DbContextOptions<ConfiguredDbContext> options) : DbContext(options)
{
    public DbSet<Item> Items => Set<Item>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
        => modelBuilder.ApplyConfigurationsFromAssembly(typeof(ConfiguredDbContext).Assembly);
}
```

**방치형 RPG 서버에서는**: 이름 길이 제한, 등급(enum) 문자열 저장, 검색용 인덱스 같은 설정이 여기에 들어간다.

> 🔧 보충(책 외): 게임 데이터는 값이 나중에 추가되는 enum이 많다. `int`로 저장하면 enum 순서를 바꿀 때 기존 데이터의 의미가 어긋날 수 있어, 문자열 저장을 고려할 만하다(책은 문자열 저장 방법만 다룬다).

---

## 2장. 읽기와 쓰기

### 3. 조회: LINQ 쿼리, 필터·정렬·페이징, 관련 데이터 로딩

> 📖 출처: B5 2장 "Understanding database queries" / "Loading related data" / "Adding sorting, filtering, and paging" (b5.txt L3163-3618, L4014-4030), B12 5장 "Basic LINQ queries" (b12.txt L9107-9262), B12 6장 "Querying data" (b12.txt L10473-10525)

**한 줄 요약**: `DbSet`에 LINQ를 이어 붙이고 마지막에 `ToListAsync()` 같은 실행 메서드를 부르면 그때 SQL이 나간다.

**핵심 설명**
- 쿼리는 세 부분이다. (1) `DbSet` 접근 (2) `Where`/`OrderBy`/`Skip`/`Take` 같은 LINQ 연산 (3) 실행 메서드(`ToList`, `First`, `Count`, `foreach` 등). 실행 전까지는 식(expression tree)으로만 쌓여 있다. 필터·정렬·페이징을 실행 메서드 앞에 두어야 DB 안에서 처리된다(B5).
- 한 건 찾기(B12): `Find`는 기본 키로 찾고 이미 추적 중이면 DB를 안 간다(없으면 null). `Single`은 정확히 1건이어야 하고(0건·2건 이상이면 예외), `SingleOrDefault`는 0건이면 기본값(null)을 주되 2건 이상이면 예외다. `First`는 여러 건이어도 첫 번째를 주고 0건이면 예외, `FirstOrDefault`는 0건이면 null이다. `Find`/`...OrDefault` 계열은 null 체크를 잊지 않는다. (참고로 B5 저자는 `Find`가 추적 확인 때문에 `SingleOrDefault`보다 약간 느리다고 하며 `SingleOrDefault`를 선호한다.)
- 페이징: `OrderBy...` -> `Skip((page-1)*pageSize)` -> `Take(pageSize)`. 페이징에는 정렬이 꼭 필요하다(B5).
- 관련 데이터는 기본으로 안 불러온다. `Include`를 안 하면 관련 컬렉션은 채워지지 않는다(B5는 기본값이 null이라고 설명). 불러오는 방법은 네 가지다(B5): **Eager**(`Include`/`ThenInclude`, 한 번에 효율적으로, 대신 필요 없는 데이터까지 읽음), **Explicit**(`Entry(x).Collection(...).Load()`, 나중에, 대신 DB 왕복이 늘어남), **Select**(필요한 열만 골라 DTO로, 대신 열마다 코드를 써야 함), **Lazy**(접근할 때 자동 조회, `virtual` 탐색 속성과 `UseLazyLoadingProxies`가 필요하고 DB 접근이 많아져 성능에 나쁨).
- `Include`는 조인 때문에 중복 데이터가 커질 수 있고, 자식이 수백~수천 건이면 목록 화면에 부적합하다. 이럴 땐 `AsSplitQuery()`로 쿼리를 나누거나 아예 Include를 안 쓴다. 쿼리를 나누면 DB 왕복이 늘고, 두 쿼리 사이에 데이터가 바뀌면 결과가 어긋날 수 있으니 장단점을 따져 쓴다(B12).

```csharp
using Microsoft.EntityFrameworkCore;

public record HeroSummary(int Id, string Name, int Level);

public static class HeroQueries
{
    // 필터 -> 정렬 -> 페이징 -> 필요한 열만 선택(Select loading) -> 마지막에 실행
    public static Task<List<HeroSummary>> GetPageAsync(GameDbContext db, int playerId, int page, int pageSize)
        => db.Heroes
            .Where(h => h.PlayerId == playerId)
            .OrderByDescending(h => h.Level)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(h => new HeroSummary(h.Id, h.Name, h.Level))
            .ToListAsync();

    // Eager loading: 플레이어와 영웅 목록을 함께 로드
    public static Task<Player?> GetWithHeroesAsync(GameDbContext db, int playerId)
        => db.Players.Include(p => p.Heroes).FirstOrDefaultAsync(p => p.Id == playerId);
}
```

**방치형 RPG 서버에서는**: `GET /api/heroes?page=1&pageSize=20` 같은 목록 API는 위의 필터-정렬-페이징-Select 패턴을 그대로 쓴다.

> 🔧 보충(책 외): 응답에 엔티티를 그대로 내보내기보다 `HeroSummary` 같은 DTO로 내보내면 순환 참조(5절)와 과다 노출 문제를 함께 피할 수 있다.

---

### 4. 생성·수정·삭제와 엔티티 상태

> 📖 출처: B5 3장 "Introducing EF Core's entity State" / "Creating new rows" / "Updating database rows" / "Deleting entities" (b5.txt L4416-4711 상태·생성, L4712-5098 수정, L5880-6095 삭제), B12 5장 "Creating an entity" / "Updating an entity" (b12.txt L9264-9431)

**한 줄 요약**: 엔티티에는 상태(State)가 붙고, `SaveChanges`가 상태를 보고 INSERT/UPDATE/DELETE를 만든다.

**핵심 설명**
- 상태 다섯 가지: `Added`(새 행, INSERT), `Unchanged`(변경 없음, 무시), `Modified`(UPDATE), `Deleted`(DELETE), `Detached`(추적 안 함). `AsNoTracking` 없이 쿼리로 읽어 온 엔티티는 `Unchanged`로 시작하고, 속성을 바꾸면 `Modified`가 된다(B5, B12). `Add`/`Remove`가 상태를 `Added`/`Deleted`로 바꾸고, 저장에 성공하면 새로 넣은 엔티티도 `Unchanged`가 된다(B5).
- **생성**: 엔티티를 `Add`하고 `SaveChanges`. DB가 만든 기본 키(IDENTITY)는 저장 뒤 객체에 채워진다(B5). 부모 엔티티만 `Add`해도 그에 딸린 새 자식 엔티티가 함께 INSERT된다(B5). 이미 DB에 있는 엔티티(예: 기존 Author)를 새 엔티티와 연결할 때는 추적 중인 인스턴스를 조회해서 연결해야 다시 INSERT되지 않는다(B5).
- **수정**: 읽기 -> 속성 변경 -> `SaveChanges`. `SaveChanges` 안의 `DetectChanges`가 처음 읽은 스냅샷과 비교해 바뀐 열만 UPDATE한다(B5).
- 웹에서는 요청마다 `DbContext`가 새로 생기므로 "연결이 끊긴 수정(disconnected update)"이 된다(B5). 방법은 두 가지다. (1) 기본 키와 바꿀 값만 받아서(DTO) 다시 조회한 뒤 그 속성만 고친다. 데이터가 적어 빠르고, 클라이언트가 가격 같은 값을 조작하지 못해 더 안전하다. 대신 복사할 속성 코드를 써야 한다(B5). (2) 전체 데이터를 받아 `Update`(또는 `Entry(x).State = Modified`)로 저장한다. 다시 읽지 않아 빠르지만, 상태가 `Modified`이므로 값이 바뀌었든 아니든 모든 열이 UPDATE되고(B12), 데이터를 보내는 쪽을 믿어야 한다(B5).
- `Find`는 추적 중이면 DB를 가지 않지만, `ExecuteUpdate`처럼 추적을 거치지 않은 변경이 있었다면 옛 값을 돌려줄 수 있다(B12, 11절).
- **삭제**: `Remove` 후 `SaveChanges`. 관계가 있는 엔티티를 지울 때의 동작은 5절에서 다룬다. 실제로 지우지 않고 `SoftDeleted` 플래그와 전역 쿼리 필터(`HasQueryFilter`)로 숨기는 소프트 삭제도 있다. 필터를 무시하려면 `IgnoreQueryFilters()`를 쓴다(B5).
- `SaveChanges`는 작업 끝에 한 번만 부르는 것이 원칙이다. 생성·수정·삭제가 섞여 있어도 DB가 하나라도 거부하면 전부 거부되는 단위(Unit of Work, 내부적으로 DB 트랜잭션)가 되기 때문이다(B5).

```csharp
using Microsoft.EntityFrameworkCore;

public static class HeroCommands
{
    public static async Task<Hero> CreateAsync(GameDbContext db, int playerId, string name)
    {
        var hero = new Hero { PlayerId = playerId, Name = name, Level = 1 };
        db.Heroes.Add(hero);               // State = Added
        await db.SaveChangesAsync();       // INSERT, hero.Id가 채워짐
        return hero;
    }

    public static async Task<bool> LevelUpAsync(GameDbContext db, int heroId)
    {
        var hero = await db.Heroes.FindAsync(heroId);  // Unchanged로 추적 시작
        if (hero is null) return false;
        hero.Level++;                                  // 변경 감지 대상
        await db.SaveChangesAsync();                   // UPDATE Heroes SET Level = ...
        return true;
    }

    public static async Task<bool> DeleteAsync(GameDbContext db, int heroId)
    {
        var hero = await db.Heroes.FindAsync(heroId);
        if (hero is null) return false;
        db.Heroes.Remove(hero);            // State = Deleted
        await db.SaveChangesAsync();
        return true;
    }
}
```

**방치형 RPG 서버에서는**: "영웅 레벨업" API는 클라이언트가 레벨 값을 보내는 것이 아니라 영웅 ID만 받고 서버가 다시 조회해서 계산해야 한다. 그래야 값 조작을 막을 수 있다.

> 🔧 보충(책 외): 책의 "받은 값을 신뢰하지 않는다"는 보안 설명을 게임에 적용한 예다. 재화·레벨 같은 값은 항상 서버가 계산한다.

---

### 5. 관계: 일대다, 일대일, 다대다

> 📖 출처: B12 6장 "Understanding one-to-many / one-to-one / many-to-many relationships" (b12.txt L10304-11070), B5 3장 "Handling relationships in updates" (b5.txt L5099-5879, 삭제 관계 L5997-6095)

**한 줄 요약**: 클래스 안의 탐색 속성과 외래 키 속성으로 관계를 표현하고, EF Core가 대부분 규칙으로 알아낸다.

**핵심 설명**
- 용어: **주(principal) 엔티티**는 기본 키를 가진 쪽(부모), **종속(dependent) 엔티티**는 외래 키를 가진 쪽(자식). **탐색 속성**은 관련 엔티티를 가리키는 속성이다(컬렉션형, 참조형).
- **일대다**: 한쪽에 `List<자식>`, 다른 쪽에 `부모?` 참조와 `부모Id`. 탐색 속성만 있어도 규칙으로 인식된다(외래 키 속성이 없으면 EF Core가 그림자 외래 키를 만든다). 명시하려면 `HasMany().WithOne().HasForeignKey()` 또는 `HasOne().WithMany()`를 쓰며, 한쪽에서만 설정하면 된다(B12).
- **일대일**: 양쪽이 참조 속성을 갖고, 어느 쪽이 종속인지 외래 키로 명시해야 한다: `HasOne().WithOne().HasForeignKey<종속>(...)`. 외래 키가 없으면 EF Core가 종속 쪽을 마음대로 고를 수 있다(B12).
- **다대다**: 양쪽에 컬렉션 속성만 두면 EF Core가 연결 테이블을 자동 생성한다. 테이블·열 이름을 바꾸거나 연결에 추가 열이 필요하면 연결 엔티티를 직접 정의하고 `UsingEntity`로 설정한다(B12). 연결 엔티티 방식은 `Include`로 연결 테이블을 정렬·필터할 수 있고, 직접 연결 방식은 코딩이 훨씬 쉽지만 연결 테이블에 접근할 수 없다(B5).
- **부모를 저장하면 새 자식도 함께 INSERT**된다. 기존 부모에 자식을 추가하는 방법은 둘이다. (1) 부모를 조회해 컬렉션에 추가하고 저장한다(부모의 수정, PUT). (2) 자식을 만들어 외래 키를 채워 저장한다(자식의 생성, POST). 자식이 적으면 (1)이 흔하고, 자식이 아주 많으면 (2)처럼 자식 전용 엔드포인트를 두는 편이 효율적이다(B12). 외래 키만 바꾸어 관계를 옮기면 부모와 컬렉션을 로드하지 않아도 되어 성능에 유리하다(B5).
- **관계를 갱신할 때는 기존 관계를 먼저 로드**해야 한다(B5). 일대일에서 기존 항목이 있는데 로드하지 않고 새로 붙이면 외래 키 중복 예외가 난다. 일대다 컬렉션을 통째로 새 컬렉션으로 교체할 때도 `Include`로 먼저 로드해야 옛 항목이 지워지고(외래 키가 null 불가일 때 기본 동작), 로드하지 않으면 옛 항목이 그대로 남아 새 항목과 합쳐진다. 로드하지 않고 직접 행을 만드는 방식은 성능에 유리하지만 관계 관리를 직접 해야 한다.
- **삭제와 관계**: 필수(외래 키 null 불가) 관계는 기본이 연쇄 삭제(Cascade)라 부모를 지우면 자식도 지워진다. 외래 키가 null 가능하면 `null`로 바꾸는 방식(`ClientSetNull`)을 쓸 수 있고, 둘 다 아니면 DB가 오류를 낸다(B5, B12). 연쇄 삭제가 DB 수준으로 설정돼 있으면 `Include` 없이도 자식이 지워지지만, B5는 자식을 로드해야 EF Core가 알고 삭제한다고 설명한다. B12는 DB가 연쇄 삭제를 지원하지 않을 수 있으므로 `ClientCascade`/`ClientSetNull` 사용을 권한다. 주문 내역처럼 남겨야 하는 자식이 있으면 `Restrict`로 부모 삭제를 막을 수 있다(B5).
- 주의(B12): 양방향 탐색 속성이 있는 엔티티를 그대로 JSON으로 내보내면 순환 참조 예외가 난다. `ReferenceHandler.IgnoreCycles`나 `[JsonIgnore]`로 해결한다. 이 예외는 데이터가 DB에 저장된 뒤에 발생한다.
- 주의(B12): 다대다에서 관련 엔티티를 통째로 담아 저장하면 같은 제목의 엔티티가 중복 생성될 수 있다. 유니크 인덱스, 존재 확인, ID만 보내는 별도 엔드포인트로 막는다.

```csharp
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

public class Account { public int Id { get; set; } public AccountProfile? Profile { get; set; } }
public class AccountProfile
{
    public int Id { get; set; }
    public string Nickname { get; set; } = "";
    public int AccountId { get; set; }          // 일대일의 종속 쪽 외래 키
    public Account? Account { get; set; }
}
public class Skill { public int Id { get; set; } public List<SkillTag> Tags { get; set; } = new(); }
public class SkillTag { public int Id { get; set; } public List<Skill> Skills { get; set; } = new(); } // 다대다

public static class RelationSetup
{
    public static void Configure(ModelBuilder mb)
    {
        // 일대다: Player 1 --- N Hero (1절의 모델)
        mb.Entity<Player>().HasMany(p => p.Heroes).WithOne(h => h.Player)
            .HasForeignKey(h => h.PlayerId).OnDelete(DeleteBehavior.Cascade);
        // 일대일: 종속 쪽(AccountProfile)을 명시
        mb.Entity<AccountProfile>().HasOne(p => p.Account).WithOne(a => a.Profile)
            .HasForeignKey<AccountProfile>(p => p.AccountId);
        // 다대다: Skill.Tags <-> SkillTag.Skills 는 규칙만으로 연결 테이블 자동 생성
    }

    public static void AddJson(WebApplicationBuilder builder)
        => builder.Services.AddControllers().AddJsonOptions(o =>
            o.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles);
}
```

```csharp
public static class HeroRelationUpdates
{
    // 컬렉션 통째 교체: Include로 먼저 로드해야 옛 항목이 삭제된다(B5 3.4.3)
    public static async Task ReplaceHeroesAsync(GameDbContext db, int playerId, List<Hero> newHeroes)
    {
        var player = await db.Players.Include(p => p.Heroes).SingleAsync(p => p.Id == playerId);
        player.Heroes = newHeroes;
        await db.SaveChangesAsync();
    }

    // 외래 키만 바꿔 관계 이동: 부모와 컬렉션을 로드하지 않아도 된다(B5 3.4.5)
    public static async Task MoveHeroAsync(GameDbContext db, int heroId, int newPlayerId)
    {
        var hero = await db.Heroes.FindAsync(heroId);
        if (hero is null) return;
        hero.PlayerId = newPlayerId;
        await db.SaveChangesAsync();
    }
}
```

**방치형 RPG 서버에서는**: 플레이어-영웅은 일대다, 계정-프로필은 일대일, 영웅 스킬-태그는 다대다의 전형이다.

> 🔧 보충(책 외): 위 클래스 이름(Account, Skill 등)은 이해를 돕기 위한 가상의 예다. 책의 예는 Invoice/Contact/Movie이다.

---

## 3장. 웹 서버에서의 EF Core

### 6. 비즈니스 로직과 DB 코드 분리

> 📖 출처: B5 4장 "The questions to ask and the decisions you need to make before you start coding" / "Using a design pattern to implement complex business logic" (b5.txt L6193-6330, L6331-6398)

**한 줄 요약**: 규칙을 계산하는 코드는 DB를 모르게 만들고, 불러오기와 `SaveChanges`는 바깥의 실행 담당이 맡는다.

**핵심 설명**
- 비즈니스 규칙은 사람이 읽을 수 있는 문장(예: "책 가격은 음수일 수 없다")이고, 그것을 구현한 코드가 비즈니스 로직이다. 난이도는 검증, 단순, 복잡 세 단계로 나눠 볼 수 있다(B5).
- 복잡한 로직을 위한 다섯 가지 지침(B5): (1) 로직이 DB 구조를 먼저 정의한다 (2) 로직에는 잡음(웹·화면 관련 코드)이 없어야 한다 (3) 로직은 데이터가 메모리에 있는 것처럼 작성한다 (4) DB 접근 코드는 별도 프로젝트로 분리한다(로직마다 짝이 되는 DB 접근 클래스를 둔다) (5) 로직은 `SaveChanges`를 직접 부르지 않고, 서비스 계층의 실행 클래스가 오류가 없을 때만 호출한다.
- 이 방식은 비즈니스 로직을 쓰고, 테스트하고, 성능을 조율하기 쉽게 만들어 준다(B5). 단순한 로직은 빠르게 작성하고, 복잡한 로직에만 이런 구조적인 접근을 쓰라는 것이 책의 조언이다. 세 단계는 엄격한 규칙이 아니라 논의를 위한 기준이다.
- 오류를 위로 전달하는 방법은 예외를 던지는 것과 상태 객체로 오류 목록을 돌려주는 것 두 가지이며, 책의 예제는 후자를 쓴다(B5). 아래 예제의 `string?` 반환도 같은 발상이다.
- 책은 이 방식을 "트랜잭션 스크립트(절차형) 패턴"이라 부르며, 도메인 모델이 빈약하다는 비판(anemic domain model)이 있음도 밝힌다.

```csharp
using Microsoft.EntityFrameworkCore;

// 순수 로직: EF Core를 전혀 모른다. 메모리 객체만 다룬다.
public static class HeroShopRules
{
    public static string? TryBuyHero(Player player, long price, string heroName)
    {
        if (player.Gold < price) return "골드가 부족합니다.";
        player.Gold -= price;
        player.Heroes.Add(new Hero { Name = heroName, Level = 1 });
        return null; // null이면 성공
    }
}

// 실행 담당: 불러오기 -> 로직 실행 -> 오류 없을 때만 SaveChanges 한 번
public class HeroShopService(GameDbContext db)
{
    public async Task<string?> BuyAsync(int playerId, string heroName, long price)
    {
        var player = await db.Players.Include(p => p.Heroes)
            .SingleOrDefaultAsync(p => p.Id == playerId);
        if (player is null) return "플레이어가 없습니다.";

        var error = HeroShopRules.TryBuyHero(player, price, heroName);
        if (error is not null) return error;

        await db.SaveChangesAsync();
        return null;
    }
}
```

**방치형 RPG 서버에서는**: "영웅 소환", "장비 강화" 같은 규칙은 순수 로직에 넣어 단위 테스트하고, 컨트롤러는 서비스만 호출한다.

> 🔧 보충(책 외): 위 `HeroShopRules/HeroShopService`는 책의 지침을 게임에 옮긴 단순화 예시다. 책은 별도 프로젝트와 인터페이스(`IBizAction`)까지 구성하지만, 이 예제의 서비스는 DB 접근을 직접 하므로 지침 (4)는 따르지 않았다. 또 `Player`에 동시성 토큰이 있으면 이 저장 단계에서 `DbUpdateConcurrencyException`이 날 수 있으므로 8절처럼 처리한다.

---

### 7. 웹 앱에서 DbContext: DI 등록, 수명, async

> 📖 출처: B5 5장 "The lifetime of a service created by DI" (b5.txt L8100-8170), "Making the application's DbContext available via DI" (b5.txt L8192-8358), "Using async/await for better scalability" (b5.txt L9295-9453), "Running parallel tasks" (b5.txt L9454-9566), B12 5장 (b12.txt L8827-8834, L9083-9090), B12 7장 "Understanding DbContext pooling" (b12.txt L11188-11256)

**한 줄 요약**: `AddDbContext`로 등록하면 요청마다 새 `DbContext`가 생기고 요청이 끝나면 버려지며, DB 호출은 항상 async로 한다.

**핵심 설명**
- 연결 문자열은 `appsettings.json`(개발용은 `appsettings.Development.json`)에 두고 `GetConnectionString`으로 읽는다. 배포할 때 바꿀 수 있어야 하기 때문이다(B5, B12).
- `AddDbContext<T>`는 `DbContext`를 **Scoped**로 등록한다. 즉 한 HTTP 요청 안에서는 같은 인스턴스를 공유하고(여러 클래스에 주입해도 같은 것), 요청이 끝나면 Dispose된다. 그래서 여러 클래스가 한 작업을 나눠 하고 마지막에 `SaveChanges` 한 번으로 저장할 수 있다(B5).
- `DbContext`는 스레드에 안전하지 않다. 같은 인스턴스를 여러 작업(Task)이 동시에 쓰면 예외가 난다. 요청마다 새로 만드는 것이 이 문제도 해결한다(B5).
- 백그라운드 작업에서는 `IServiceScopeFactory`로 스코프를 직접 만들고 그 안에서 `DbContext`를 얻는다. 반복 실행이라면 매번 새 인스턴스를 써야 지난 실행의 데이터가 다음 실행에 영향을 주지 않는다(B5).
- async를 쓰면 DB를 기다리는 동안 스레드를 반납해 더 많은 동시 사용자를 처리한다. 동기 버전이 아주 약간 빠르지만 그 차이는 작아서, 책은 웹에서는 항상 async 사용이라는 Microsoft 지침을 따르라고 한다. async 메서드에는 취소 토큰(`CancellationToken`)을 선택적으로 넘길 수 있다(B5).
- 처리량이 매우 높을 때는 `AddDbContextPool`로 `DbContext` 인스턴스를 재사용할 수 있다(반납 시 상태를 초기화하며, 풀 크기 기본값은 1024). 하지만 대부분의 앱에는 필요 없고, 켜기 전후로 성능을 측정해 확인하라고 한다(B12).

```csharp
using Microsoft.EntityFrameworkCore;

public static class DbRegistration
{
    public static void AddGameDb(WebApplicationBuilder builder)
    {
        builder.Services.AddDbContext<GameDbContext>(options =>
            options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
        // 처리량이 아주 높다면: AddDbContextPool<GameDbContext>(...) (먼저 측정할 것)
    }

    public static void MapHeroApi(WebApplication app)
    {
        // GameDbContext는 요청 범위에서 자동 주입되고, 호출은 async
        app.MapGet("/api/heroes/{id:int}", async (int id, GameDbContext db) =>
            await db.Heroes.FindAsync(id) is { } hero ? Results.Ok(hero) : Results.NotFound());
    }
}

public class PlayerCounter(IServiceScopeFactory scopeFactory)
{
    // 백그라운드에서는 직접 스코프를 만들어 DbContext를 얻는다
    public async Task<int> CountAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Players.CountAsync(ct);
    }
}
```

**방치형 RPG 서버에서는**: 컨트롤러가 `GameDbContext`를 주입받아 쓰고, 오프라인 보상 계산 같은 주기 작업은 위 `PlayerCounter`처럼 스코프를 직접 만든다(제12부).

> 🔧 보충(책 외): 위 예제의 `Results.Ok(hero)`는 제8부의 Minimal API 문법을 쓴 것이다. 실제로는 엔티티 대신 DTO 반환을 권장한다.

---

## 4장. 안전하게 다루기

### 8. 동시성 충돌 (재화·아이템 동시 수정)

> 📖 출처: B12 7장 "Understanding concurrency conflicts" (b12.txt L11744-11992)

**한 줄 요약**: 두 요청이 같은 행을 동시에 고치면 한쪽 결과가 조용히 사라지는데, 버전 열(동시성 토큰)로 이를 감지해 예외로 만든다.

**핵심 설명**
- 문제 상황(B12의 재고 예제): 재고 15개에서 클라이언트 A와 B가 거의 동시에 10개를 판다. 둘 다 "15개니까 충분하다"고 확인한 뒤 각자 `15 - 10 = 5`로 저장한다. 실제로는 20개를 팔았는데 재고는 5개가 되어 데이터가 틀어진다. 두 요청 모두 성공 응답을 받는다.
- 해결 방식 두 가지(B12): **비관적 제어**는 DB 잠금으로 다른 클라이언트의 수정을 막는다. 잠금 관리 비용이 커서 동시 접속이 많으면 성능 문제가 생길 수 있고, EF Core는 이를 기본 지원하지 않는다. **낙관적 제어**는 잠금 없이 버전 열로 충돌을 감지한다. EF Core는 이쪽을 지원한다.
- 낙관적 제어의 동작: EF Core가 `UPDATE ... WHERE Id = @id AND RowVersion = @원래값`을 보낸다. 그 사이 누가 고쳐서 버전 값이 달라졌다면 0행이 갱신되고 EF Core가 `DbUpdateConcurrencyException`을 던진다(B12는 SQL Server에서 이 WHERE 절을 확인했다).
- 토큰 종류: (1) DB가 자동 관리하는 `rowversion`(SQL Server): `[Timestamp] byte[]` 또는 `IsRowVersion()`. 수정할 때 값을 직접 갱신할 필요가 없다. 다만 이 타입은 SQL Server용이며, SQLite 같은 다른 DB는 지원하지 않을 수 있으니 DB 문서를 확인해야 한다. (2) 앱이 관리하는 토큰: `[ConcurrencyCheck] Guid Version` 또는 `IsConcurrencyToken()`. SQL Server에서도 쓸 수 있지만 엔티티를 수정할 때마다 `Version = Guid.NewGuid()`처럼 새 값을 직접 넣어야 한다.
- 충돌이 나면 예외를 잡아 로그를 남기고 `409 Conflict`를 돌려주어 클라이언트가 결과를 보고 다시 시도하게 한다(B12).
- 격리 수준(SQL Server는 ReadUncommitted, ReadCommitted, RepeatableRead, Serializable, 기본은 ReadCommitted)은 높을수록 일관성이 좋지만 동시성이 떨어진다. 책은 이 정도만 소개하고 자세한 내용은 다루지 않는다(B12).

```csharp
using Microsoft.EntityFrameworkCore;

// 1절의 Player에는 [Timestamp] byte[]? RowVersion 이 있다.
public static class GoldSpender
{
    public static async Task<IResult> SpendAsync(GameDbContext db, int playerId, long cost)
    {
        var player = await db.Players.FindAsync(playerId);
        if (player is null) return Results.NotFound();
        if (player.Gold < cost) return Results.BadRequest("골드가 부족합니다.");

        player.Gold -= cost;
        try
        {
            await db.SaveChangesAsync();   // UPDATE ... WHERE Id=@id AND RowVersion=@old
        }
        catch (DbUpdateConcurrencyException)
        {
            // 그 사이 다른 요청이 같은 플레이어를 수정했다. 로그를 남기고 재시도를 유도.
            return Results.Conflict("동시에 변경되었습니다. 다시 시도해 주세요.");
        }
        return Results.Ok(player.Gold);
    }
}
```

**방치형 RPG 서버에서는**: 같은 계정의 골드 소모, 아이템 사용, 보상 수령은 여러 기기·재시도로 동시에 들어올 수 있다. 버전 열이 없으면 골드가 복사되거나 아이템이 이중 지급될 수 있다.

> 🔧 보충(책 외): 위 게임 시나리오(골드·보상 이중 처리)는 책의 재고 예제를 게임에 옮긴 해석이다. 또 다른 방법으로 `Where(p => p.Id == id && p.Gold >= cost).ExecuteUpdateAsync(...)`처럼 조건과 차감을 한 SQL로 처리해 반환된 행 수로 성공 여부를 판단할 수 있다(책은 ExecuteUpdate를 일괄 처리용으로만 소개하며 11절 참고).
>
> 🔧 보충(책 외, SQLite로 직접 실행해 확인): (1) 위 `Player`처럼 `[Timestamp] byte[]`만 붙이고 SQLite를 쓰면 `RowVersion`이 채워지지 않고(null) 쿼리가 `WHERE Id = @id AND RowVersion IS NULL`로 나가서, 두 요청이 같은 골드 100에서 70씩 차감해도 예외 없이 둘 다 성공하고 골드가 30이 됐다. 즉 이 방식은 SQL Server처럼 `rowversion`을 자동 관리하는 DB에서만 보호가 된다(SQL Server에서는 실행해 보지 못했고 B12의 설명을 따른 것이다). (2) 같은 실험을 `[ConcurrencyCheck] Guid Version`으로 하고 저장 전에 `Version = Guid.NewGuid()`를 넣었더니 두 번째 요청에서 `DbUpdateConcurrencyException`("expected to affect 1 row(s), but actually affected 0")이 났고 골드는 30으로 남았다. 반대로 `Version`을 새 값으로 바꾸지 않으면 충돌을 전혀 감지하지 못했다. (3) `Where(p => p.Id == id && p.Gold >= 70).ExecuteUpdateAsync(...)`를 두 번 연속 실행하니 갱신된 행이 각각 1, 0이었다(잔액 부족이면 0행). 이 방식은 추적 중인 엔티티에는 반영되지 않는다.

---

### 9. 트랜잭션

> 📖 출처: B5 3장 사이드바 "Why you should call SaveChanges only once at the end of your changes" (b5.txt L4644-4666), B5 4장 "Using transactions to daisy-chain a sequence of business logic code" (b5.txt L7569-7831)

**한 줄 요약**: 트랜잭션은 여러 DB 쓰기를 "모두 성공 아니면 모두 취소"로 묶는 장치다.

**핵심 설명**
- `SaveChanges` 한 번은 DB 트랜잭션 안에서 실행된다. 생성·수정·삭제가 섞여 있어도 DB가 하나라도 거부하면 전부 거부된다. 그래서 가능하면 `SaveChanges`를 끝에서 한 번만 부르는 것이 원칙이다(Unit of Work, B5).
- 앞 단계가 저장한 값을 다음 단계가 읽어야 하는 등 여러 번 저장해야 하는데 전체를 하나로 묶고 싶으면 명시적 트랜잭션을 쓴다. `context.Database.BeginTransaction()`을 `using`으로 열면(B5):
  - `Commit()` 전까지 쓰기는 다른 DB 사용자에게 보이지 않는다.
  - `Commit()` 없이 `using`이 끝나면 Dispose 때문에 자동으로 롤백된다. 롤백하면 그 트랜잭션 안의 쓰기는 모두 사라진다.
- 책의 예(`RunnerTransact2WriteDb`)는 단계 1을 실행해 오류가 없으면 `SaveChanges`, 이어서 단계 2도 같은 방식으로 실행하고, 모두 오류가 없을 때만 `Commit`을 부른다. 오류가 있으면 그냥 빠져나가 롤백되게 한다. 각 단계의 로직은 자신이 트랜잭션 안에서 도는지 알 필요가 없다.
- 단점(B5): DB 접근이 복잡해져 디버깅이 조금 어려워질 수 있고 트랜잭션이 성능 문제를 일으킬 수도 있다. 또 `EnableRetryOnFailure`(실패 시 재시도) 옵션을 쓴다면 비즈니스 로직이 여러 번 호출될 수 있음을 고려해야 한다.

```csharp
using Microsoft.EntityFrameworkCore;

public static class GoldTransfer
{
    public static async Task<bool> SendGoldAsync(GameDbContext db, int fromId, int toId, long amount)
    {
        await using var tx = await db.Database.BeginTransactionAsync(); // 트랜잭션 시작
        var sender = await db.Players.FindAsync(fromId);
        var receiver = await db.Players.FindAsync(toId);
        if (sender is null || receiver is null || sender.Gold < amount)
            return false;                  // Commit 없이 나가면 Dispose -> 롤백

        sender.Gold -= amount;
        await db.SaveChangesAsync();       // 1단계 저장(아직 다른 사용자에게 안 보임)
        receiver.Gold += amount;
        await db.SaveChangesAsync();       // 2단계 저장
        await tx.CommitAsync();            // 여기서 한꺼번에 확정
        return true;
    }
}
```

**방치형 RPG 서버에서는**: "골드 차감 + 아이템 지급"처럼 둘 중 하나만 반영되면 안 되는 작업을 하나의 트랜잭션(또는 한 번의 `SaveChanges`)으로 묶는다.

> 🔧 보충(책 외): 책의 코드는 동기 `BeginTransaction`이다. 웹에서는 async 원칙(7절)에 따라 `BeginTransactionAsync`/`CommitAsync`를 쓴다. 한 번의 `SaveChanges`로 끝낼 수 있는 작업이라면 명시적 트랜잭션은 필요 없으니, 꼭 필요할 때만 쓴다.
>
> 🔧 보충(책 외, SQLite로 직접 실행해 확인): 위 `SendGoldAsync`에서 잔액 부족이면 `Commit` 없이 반환되어 잔액이 그대로였고(100에서 30 이체 후 999 이체 시도 -> 70/30 유지), 첫 저장 뒤 예외를 던지면 차감이 롤백되어 값이 유지됐다. 한 번의 `SaveChanges`에 정상 엔티티와 외래 키 위반 엔티티를 함께 넣자 정상 엔티티도 저장되지 않았다. 다만 트랜잭션이 8절의 동시 수정 문제를 자동으로 없애 주지는 않는다. 잔액 확인과 차감은 여전히 "읽고 나서 쓰는" 두 단계이므로, 같은 계정에 요청이 동시에 오는 경우에는 8절의 동시성 토큰 같은 장치가 따로 필요하다. 토큰이 있으면 위 코드의 `SaveChangesAsync`에서 `DbUpdateConcurrencyException`이 날 수 있고, 예외로 빠져나가면 `using`이 롤백한다(SQL Server에서는 실행해 보지 못했다).

---

### 10. 마이그레이션

> 📖 출처: B5 2장 "Creating a database for your own application" (b5.txt L3092-3157), B5 5장 "Using EF Core's migration feature to change the database's structure" (b5.txt L9068-9295), B5 9장 "Understanding the complexities of changing your application's database" (b5.txt L15583-15661), B5 9장 스냅샷 설명 (b5.txt L15721-15777), B12 5장 "Creating the database" (b12.txt L8837-8906), B1 12장 "Managing changes with migrations" (b1.txt L15478-15625)

**한 줄 요약**: 마이그레이션은 C# 모델의 변경 이력을 코드 파일로 남겨 DB 구조를 코드와 맞추는 기능이다.

**핵심 설명**
- DB에는 데이터가 있어서 배포할 때마다 DB를 통째로 갈아엎을 수 없다. 그래서 스키마 변경을 코드와 함께 버전으로 관리하는 것이 좋은 관행이다. EF Core의 방식이 마이그레이션이며, 데이터 모델이 어떻게 바뀌었는지 기록하는 C# 코드 파일이다(B1).
- 흐름(B12): (1) `dotnet tool install --global dotnet-ef` (2) `dotnet ef migrations add 이름`으로 `Up()`/`Down()`이 든 마이그레이션 파일 생성. 이 시점엔 DB가 바뀌지 않는다 (3) `dotnet ef database update`로 DB에 적용. 적용 이력은 `__EFMigrationsHistory` 테이블에 기록되며 직접 수정하지 않는다. `database update`는 앱을 빌드하고, 연결 문자열의 DB가 없으면 만들고, 아직 적용되지 않은 마이그레이션을 적용한다(B1). 생성된 마이그레이션 파일은 적용 전에 열어서 무슨 일을 하는지 확인하라고 권한다(B1).
- `add`는 현재 모델과 마지막 마이그레이션 때 저장된 스냅샷(`...ModelSnapshot.cs`)을 비교해 차이를 코드로 만든다. 스냅샷 덕분에 DB에 직접 접속하지 않아도 이전 상태를 알 수 있다(B5, B1).
- 마이그레이션 파일을 함부로 수정·삭제하면 안 된다. 되돌리려면 `dotnet ef migrations remove`를 쓴다(B12). 복잡한 변경(데이터가 사라지는 변경 등)은 표준 마이그레이션을 검토한 뒤 직접 고쳐야 할 때가 있다(B5).
- 컬럼·테이블 삭제 같은 변경은 데이터를 잃을 수 있다. 롤백해도 테이블은 다시 만들어지지만 지워진 데이터는 영영 돌아오지 않는다(B1, B5).
- 운영 DB에 적용하는 방법(B5): 앱 시작 시 `Database.Migrate()` 호출, CI/CD에서 적용, 별도 앱으로 적용, SQL 스크립트 추출 후 적용. 가장 쉬운 것이 시작 시 적용이다. 배포하면 새 앱이 시작될 때 자동으로 적용되어 잊을 일이 없지만, 서버를 여러 대로 늘리는 환경(scaling out)에는 맞지 않는 한계가 있다. B5는 Microsoft가 SQL 명령으로 운영 DB를 갱신하는 방식을 가장 견고하다고 권한다고 밝힌다. 시작 시 마이그레이션에서 행이 수만 개인 데이터를 EF Core로 갱신하다가 앱 시작이 너무 늦어 Azure가 타임아웃시킨 사례도 소개한다.
- 시작 시 마이그레이션 코드는 예외가 나면 로그를 남기고 다시 던져(`throw`) 앱이 계속 뜨지 않게 하는 것이 책의 예다(B5). 시드 데이터는 마이그레이션(`HasData`)으로 넣거나 마이그레이션 뒤 코드로 넣을 수 있다(B5).

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add InitialDb      # 마이그레이션 파일만 생성
dotnet ef database update               # DB에 실제 적용
```

```csharp
using Microsoft.EntityFrameworkCore;

public static class DbMigrationExtensions
{
    // Program.cs에서: var app = builder.Build(); await app.MigrateDatabaseAsync();
    public static async Task MigrateDatabaseAsync(this IHost host)
    {
        using var scope = host.Services.CreateScope();                 // 스코프를 직접 만든다
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        await db.Database.MigrateAsync();                              // 미적용 마이그레이션 적용
    }
}
```

**방치형 RPG 서버에서는**: 새 기능(예: 장비 슬롯)을 추가하면 엔티티 수정 -> `migrations add` -> 테스트 DB에서 검증 -> 운영 적용 순서로 간다.

> 🔧 보충(책 외): 운영 DB에서는 자동 마이그레이션을 서버 여러 대가 동시에 실행할 수 있어 주의해야 한다(책도 "여러 인스턴스에서는 한계"라고 언급한다). 게임 서버라면 배포 파이프라인에서 적용하는 방식을 고려한다.

---

### 11. 추적 vs 비추적 쿼리, IQueryable, 일괄 업데이트

> 📖 출처: B12 7장 "Understanding the difference between tracking versus no-tracking queries" / "IQueryable and IEnumerable" / "Client evaluation versus server evaluation" / "Using bulk operations" (b12.txt L11257-11742), B5 2장 "The two types of database queries" (b5.txt L3234-3258)

**한 줄 요약**: 읽기만 할 때는 `AsNoTracking`, 필터는 DB에서 실행되도록 `IQueryable` 상태로, 대량 변경은 `ExecuteUpdate`로 처리한다.

**핵심 설명**
- **추적 쿼리(기본)**: 읽어 온 엔티티를 `DbContext`가 추적해서 수정하고 저장할 수 있다. 대신 메모리와 시간이 든다. 같은 키를 `Find`로 다시 찾으면 DB에 안 가고 추적 중인 객체를 돌려준다. 그래서 `ExecuteUpdate` 같은 추적 밖의 변경이 있었다면 `Find`가 옛 값을 돌려줄 수 있고, 이때는 `Single`/`SingleOrDefault`로 DB에서 다시 읽는다(B12).
- **비추적 쿼리**: `AsNoTracking()`을 붙이면 더 빠르고 가볍지만, 그 엔티티는 수정해도 `SaveChanges`에 반영되지 않는다. 수정할 일이 없는 GET 조회에 적합하다. 전체 기본값을 바꾸려면 `UseQueryTrackingBehavior(NoTracking)`을 쓰고, 필요한 쿼리만 `AsTracking()`으로 되돌린다(B12).
- **IQueryable vs IEnumerable**: `IQueryable`인 동안에는 `Where`, `OrderBy`, `Skip`, `Take`가 SQL로 합쳐져 DB에서 실행된다. `AsEnumerable()`을 먼저 부르면 전체를 메모리로 가져온 뒤 C#에서 걸러 매우 비효율적이다(B12는 로그로 `ORDER BY`/`OFFSET`이 빠진 SQL을 보여 준다). `ToList`/`ToArray`, `Single`, `First`, `Count`, `foreach`가 쿼리를 즉시 실행한다(B12).
- **서버 vs 클라이언트 평가**: DB로 번역되는 부분(서버 평가)이 기본이다. 사용자 정의 C# 메서드는 번역되지 않으므로 마지막 `Select` 정도에만 쓰고, `Where`에 쓰면 EF Core 3.0 이후로는 예외가 난다. 데이터가 적어 안전하다고 확신할 때만 `AsEnumerable()`/`ToList()`로 명시적으로 클라이언트 평가를 한다(B12, B5).
- **일괄 업데이트(EF Core 7+)**: `ExecuteUpdate`/`ExecuteDelete`는 엔티티를 불러오지 않고 한 번의 SQL로 여러 행을 바꾼다. 추적을 거치지 않으므로 `SaveChanges`가 필요 없이 즉시 실행되고, 이미 로드된 객체는 옛 값 그대로라는 점에 주의한다(B12). 문자열로 SQL을 쓰는 `ExecuteSql`과 달리 강한 타입 지원이 있다. 원시 SQL은 `FromSql`처럼 보간 문자열이면 매개변수화되어 SQL 인젝션에서 안전하지만, `...Raw` 계열은 개발자가 직접 책임져야 한다(B12).

```csharp
using Microsoft.EntityFrameworkCore;

public static class QueryTips
{
    // 좋음: 읽기 전용 + 필터/정렬/페이징을 DB에서 실행
    public static Task<List<Hero>> GetTopHeroesAsync(GameDbContext db, int minLevel, int page)
        => db.Heroes.AsNoTracking()
            .Where(h => h.Level >= minLevel)
            .OrderByDescending(h => h.Level)
            .Skip(page * 20).Take(20)   // page는 0부터 시작
            .ToListAsync();

    // 나쁨: AsEnumerable() 때문에 모든 영웅을 메모리로 읽은 뒤 C#에서 필터링
    public static List<Hero> GetTopHeroesBad(GameDbContext db, int minLevel)
        => db.Heroes.AsEnumerable().Where(h => h.Level >= minLevel).ToList();

    // 일괄 업데이트: 로드 없이 한 번의 UPDATE. SaveChanges 불필요
    public static Task<int> GiveGoldToAllAsync(GameDbContext db, long bonus)
        => db.Players.ExecuteUpdateAsync(s => s.SetProperty(p => p.Gold, p => p.Gold + bonus));
}
```

**방치형 RPG 서버에서는**: 랭킹·목록 조회는 `AsNoTracking` + 페이징, 이벤트 보상 일괄 지급이나 일일 초기화는 `ExecuteUpdate` 후보다.

> 🔧 보충(책 외): 일괄 업데이트는 추적을 거치지 않으므로 8절의 `DbUpdateConcurrencyException` 방식이 그대로 적용되지 않는다고 보는 것이 안전하다(책은 이 점을 직접 다루지 않는다). `p => p.Gold + bonus`처럼 값에 식을 쓰는 형태는 책 예제(고정 값)를 확장한 것으로, EF Core 8에서 컴파일하고 SQLite로 실행해 `Gold`가 100에서 150이 되는 것을 확인했다. 이 실행에서 이미 로드해 둔 객체의 `Gold`는 100 그대로였고 `Find`로 다시 찾아도 100이었다.

---

### 12. 중복 요청 막기: 멱등성 키와 유니크 제약

> 📚 참고(doc, 책 외): Node.js Complete Guide 29장 29.5 "멱등성과 메시징 복원력"(방법 2: 멱등성 키와 처리 기록 테이블, 방법 3: 유니크 제약), C# Complete Guide vol2 43장 "재시도와 멱등성". 이 절 전체가 11권 밖의 보강 내용이다.

**한 줄 요약**: 모바일 클라이언트는 같은 요청을 두 번 보낼 수 있으므로, 요청마다 고유 ID(멱등성 키)를 받아 "이미 처리한 요청이면 지난 결과만 돌려준다"로 만들고, 마지막 방어선은 DB의 유니크 제약에 맡긴다.

**핵심 설명**
- **중복은 반드시 생긴다**: 서버는 보상을 지급하고 응답을 보냈는데 지하철에서 응답이 사라지면, 클라이언트는 실패로 알고 다시 보낸다. 버튼 연타, 앱의 자동 재시도도 같다. 8절의 동시성 토큰은 "동시에 고친 것"을 잡지만, **시간 차를 두고 다시 온 같은 요청**은 정상 요청처럼 보여서 막지 못한다.
- **멱등(idempotent)**: 같은 요청을 여러 번 보내도 결과가 한 번 보낸 것과 같은 성질이다(제8부 8.2). `Gold = 500`(값으로 덮어쓰기)은 멱등하지만 `Gold += 100`(더하기)은 멱등하지 않다. 보상 수령·구매는 본질적으로 "더하기"라 별도 장치가 필요하다.
- **멱등성 키 방식**: 클라이언트가 행동 하나마다 `Guid` 같은 고유 ID를 만들어 보내고(예: `Idempotency-Key` 헤더), 재시도할 때는 **같은 ID를 다시** 보낸다. 서버는 처리한 ID와 그 결과를 테이블에 기록하고, 이미 있는 ID면 아무것도 바꾸지 않고 기록된 결과를 돌려준다.
- **기록과 지급은 같은 트랜잭션으로**: "골드 지급"과 "처리 기록 추가"를 한 번의 `SaveChanges`(9절)로 저장한다. 따로 저장하면 "지급은 했는데 기록은 못 한" 틈으로 중복이 새어 나간다.
- **"조회 후 추가"만으로는 부족하다**: 같은 ID의 요청 두 개가 거의 동시에 오면 둘 다 "기록 없음"을 보고 둘 다 지급할 수 있다. `(PlayerId, RequestId)`에 **유니크 인덱스**를 걸어 두면 DB가 두 번째 저장을 거부(`DbUpdateException`)하고, 그 트랜잭션의 지급도 함께 취소된다. 정확성을 코드가 아니라 스키마에 새기는 것이다.

```csharp
using Microsoft.EntityFrameworkCore;

// 처리 기록 테이블. 1절의 GameDbContext에 DbSet<RewardClaim>을 추가하고
// OnModelCreating에서 (PlayerId, RequestId) 유니크 인덱스를 건다.
public class RewardClaim
{
    public long Id { get; set; }
    public int PlayerId { get; set; }
    public string RequestId { get; set; } = "";   // 클라이언트가 만든 멱등성 키
    public long Reward { get; set; }              // 그때 지급한 결과(재요청 때 그대로 돌려줌)
}

// GameDbContext 안:
// public DbSet<RewardClaim> RewardClaims => Set<RewardClaim>();
// protected override void OnModelCreating(ModelBuilder modelBuilder)
//     => modelBuilder.Entity<RewardClaim>()
//            .HasIndex(c => new { c.PlayerId, c.RequestId })
//            .IsUnique();                         // 같은 플레이어의 같은 요청 ID는 한 번만

public enum ClaimStatus { Granted, Duplicate, PlayerNotFound, Conflict }

public record ClaimResult(ClaimStatus Status, long Reward = 0);

public static class RewardClaimer
{
    public static async Task<ClaimResult> ClaimAsync(
        GameDbContext db, int playerId, string requestId, long reward)
    {
        // 1) 이미 처리한 요청이면 아무것도 바꾸지 않고 지난번 결과를 돌려준다
        var done = await FindClaimAsync(db, playerId, requestId);
        if (done is not null) return new ClaimResult(ClaimStatus.Duplicate, done.Reward);

        // 2) 처음 보는 요청이면 지급 + 처리 기록을 함께 저장한다
        var player = await db.Players.FindAsync(playerId);
        if (player is null) return new ClaimResult(ClaimStatus.PlayerNotFound);
        player.Gold += reward;
        db.RewardClaims.Add(new RewardClaim { PlayerId = playerId, RequestId = requestId, Reward = reward });

        try
        {
            await db.SaveChangesAsync();   // 한 번의 SaveChanges = 한 트랜잭션(9절)
        }
        catch (DbUpdateConcurrencyException)
        {
            // 8절의 충돌: 다른 요청이 같은 플레이어를 먼저 고쳤다. 아무것도 저장되지 않았으므로
            // 클라이언트는 "같은 요청 ID로" 다시 시도하면 된다.
            // DbUpdateConcurrencyException은 DbUpdateException의 자식이라 반드시 먼저 잡는다.
            db.ChangeTracker.Clear();
            return new ClaimResult(ClaimStatus.Conflict);
        }
        catch (DbUpdateException)
        {
            // 같은 요청 ID가 동시에 들어와 다른 쪽이 먼저 저장했다(유니크 제약 위반).
            // 이 요청의 지급도 함께 취소되었다. 실패한 변경을 추적에서 지우고 먼저 저장된 결과를 돌려준다.
            db.ChangeTracker.Clear();
            done = await FindClaimAsync(db, playerId, requestId);
            if (done is not null) return new ClaimResult(ClaimStatus.Duplicate, done.Reward);
            throw;                         // 유니크 위반이 아닌 다른 저장 실패
        }
        return new ClaimResult(ClaimStatus.Granted, reward);
    }

    private static Task<RewardClaim?> FindClaimAsync(GameDbContext db, int playerId, string requestId)
        => db.RewardClaims.AsNoTracking()
             .SingleOrDefaultAsync(c => c.PlayerId == playerId && c.RequestId == requestId);
}
```

```csharp
// Program.cs: 헤더의 멱등성 키를 받아 결과를 HTTP 상태 코드로 바꾼다
// using Microsoft.AspNetCore.Mvc;  ([FromHeader]에 필요)
app.MapPost("/api/rewards/daily/claim", async (
    [FromHeader(Name = "Idempotency-Key")] string requestId, GameDbContext db) =>
{
    // playerId는 실제로는 토큰의 클레임에서 꺼낸다(제11부)
    var result = await RewardClaimer.ClaimAsync(db, playerId: 1, requestId, reward: 100);
    return result.Status switch
    {
        ClaimStatus.PlayerNotFound => Results.NotFound(),
        ClaimStatus.Conflict => Results.Conflict("잠시 후 같은 요청 ID로 다시 시도해 주세요."),
        _ => Results.Ok(result)   // Granted, Duplicate 모두 200과 같은 지급 결과
    };
});
```

**방치형 RPG 서버에서는**: 오프라인 보상 수령, 우편 받기, 상점 구매, 강화처럼 **재화가 늘거나 줄어드는 POST 요청**에는 멱등성 키를 받는다. 클라이언트(Unity 등)는 버튼을 누를 때 `Guid.NewGuid()`로 ID를 하나 만들고, 응답을 못 받아 재시도할 때는 새 ID가 아니라 그 ID를 그대로 보내야 한다. 같은 ID에 같은 결과가 돌아오므로 클라이언트 화면도 어긋나지 않는다.

> 🔧 보충(책 외): 위 코드를 EF Core 8 + SQLite로 실행해 확인했다. 같은 ID로 세 번 요청하면 첫 번째만 `Granted`였고 나머지 두 번은 `Duplicate`에 골드는 한 번만 늘었으며, 새 ID는 다시 지급됐다. `Idempotency-Key` 헤더가 없으면 필수 매개변수라서 `400`이 났다. 저장 직전에 같은 ID 기록을 다른 연결로 먼저 넣어 "동시에 들어온 두 요청"을 흉내 내자, 유니크 제약 위반이 나서 이 요청의 지급은 취소되었고 먼저 저장된 결과가 `Duplicate`로 돌아왔다(골드는 한 번만 증가). `Conflict` 경로는 SQL Server의 `rowversion`이 있어야 일어나므로 실행해 보지 못했다(8절 보충 참고). `DbUpdateException`은 유니크 위반 외의 저장 실패에도 나므로, 위 코드는 다시 조회해 기록이 있을 때만 중복으로 판단하고 그 밖의 경우는 예외를 다시 던진다. 저장에 실패한 `DbContext`에는 실패한 변경이 남아 있으므로 `ChangeTracker.Clear()`로 지운 뒤에 계속 쓴다. 처리 기록은 계속 쌓이므로 보관 기간(예: 며칠)을 정해 백그라운드 작업(제12부)으로 지운다. 멱등성 키는 "같은 요청의 반복"을 막을 뿐, 서로 다른 요청이 같은 재화를 동시에 고치는 문제는 여전히 8절의 동시성 토큰이 맡는다.
