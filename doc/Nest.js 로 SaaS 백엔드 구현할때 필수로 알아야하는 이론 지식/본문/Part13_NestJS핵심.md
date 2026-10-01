---
title: "Part 13. NestJS 프레임워크 핵심"
parent: "NestJS SaaS 백엔드 필수 이론"
nav_order: 13
---

## Part 13. NestJS 프레임워크 핵심 (출처: NestJS 교재 — doc/Nestjs)

앞의 Part 1~12는 "NestJS 밖의 이론"을 다뤘다. 이 Part는 그 이론을 **NestJS가 어떤 구조로 담아내는지**를 정리한다.
문법을 외우기보다 "이 기능은 왜 여기 있고, 어디에 무엇을 넣어야 하는가"를 잡는 것이 목표다.
이미 다른 Part에서 다룬 일반 이론(DI 패턴, JWT, 테넌트 격리, 테스트 원칙 등)은 "→ Part N 참조"로 연결만 한다.

### 0. 이 Part의 지도: 요청 하나가 NestJS를 통과하는 길

```text
[부팅]  main.ts → NestFactory.create(AppModule)
          ① 모듈 그래프 스캔 → ② 프로바이더 생성(DI)
          → (전역 설정: 파이프·CORS·prefix) → listen() 안의 app.init()
          → ③ 라우트 등록 → ④ onModuleInit → onApplicationBootstrap → 포트 바인딩

[요청]  HTTP 요청 (Express/Fastify가 파싱)
          │
          ▼
        Middleware ──────── 라우트를 모름. 요청 ID, 보안 헤더, ALS 컨텍스트 열기  (§5, §18)
          ▼
        Guard ───────────── "들어와도 되나?" 인증·인가·rate limit            (§5, §13, §14)
          ▼
        Interceptor (전) ── 시간 측정, 캐시 조회                            (§5, §15)
          ▼
        Pipe ────────────── DTO 변환·검증 (ValidationPipe)                   (§8)
          ▼
        Controller → Service → Repository/DB/큐                            (§3, §12, §16)
          ▼
        Interceptor (후) ── 응답 가공, 직렬화(민감 필드 제거)                (§9)
          ▼
        (예외 발생 시) Exception Filter ── 에러 응답 표준화                 (§7)
          ▼
        HTTP 응답

[종료]  SIGTERM → onModuleDestroy → beforeApplicationShutdown → (서버 닫힘)
          → onApplicationShutdown                                            (§17)
```

> 📖 원문: NestJS-Architecture-Book.md "종합 — 요청 하나의 전 생애주기", 13장 §8

### 1. NestJS란 무엇이고 왜 쓰나

#### 1.1 세 개의 층

NestJS는 HTTP 서버를 직접 구현하지 않는다. 기존 Node 서버 라이브러리 위에 **구조**를 얹는 프레임워크다.

| 층 | 하는 일 | 이 Part의 절 |
|----|---------|-------------|
| DI 컨테이너 | 클래스가 무엇을 필요로 하는지 읽고, 순서대로 만들어 꽂아 준다 | §2~§4 |
| 요청 파이프라인 | Middleware → Guard → Interceptor → Pipe → Handler → Filter라는 **고정된 순서** | §5~§9 |
| 플랫폼 어댑터 | 실제 HTTP 처리는 Express(기본) 또는 Fastify에 맡긴다 | §1.2, §21 |

- ORM, 인증, 큐, 캐시는 **프레임워크에 들어 있지 않다.** `@nestjs/typeorm`, `@nestjs/bullmq` 같은 선택 패키지로 붙인다. 즉 **구조에는 강한 의견을, 기술 스택에는 약한 의견을** 가진다.
- `@Controller()`, `@Injectable()` 같은 데코레이터는 클래스 정의 시점에 **한 번** 실행되어 메타데이터를 붙여 둔다. 부팅 때 Nest가 이를 읽어 DI 그래프와 라우트를 만든다. 생성자 타입만 보고 주입할 수 있는 것도 TypeScript가 남긴 `design:paramtypes` 메타데이터 덕분이다(→ Part 1 §9 참조).

#### 1.2 플랫폼 어댑터 (Express vs Fastify)

| 어댑터 | 특징 | 언제 |
|--------|------|------|
| `@nestjs/platform-express` | 기본값, 미들웨어 생태계가 가장 큼 | 대부분의 경우 |
| `@nestjs/platform-fastify` | 더 빠르고 오버헤드가 적음 | 처리량이 중요한 JSON API |

- 컨트롤러·서비스가 Express 전용 API(`res.render()`, `@Res()` 직접 쓰기)에 의존하지 않으면 어댑터 교체는 `main.ts`만 바꾸면 된다. 이런 의존이 새어 나가는 것을 **플랫폼 누수**라 한다.

#### 1.3 부팅 순서와 `main.ts`

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule); // 그래프 생성 + DI(인스턴스 생성)
  app.setGlobalPrefix('api');                      // 생성 후, listen 전이 전역 설정 자리
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);     // init(라우트·훅) 후 포트 바인딩
}
bootstrap();
```

`NestFactory.create()`는 ① `imports`를 따라 모든 모듈 등록 → ② 의존성 해석·인스턴스 생성(비동기 팩토리 대기 포함, 실패 시 `Nest can't resolve dependencies of X (?)`, `?`가 못 찾은 파라미터)까지 한다. 이어서 `listen()`이 내부에서 `app.init()`을 호출해 ③ 미들웨어·라우트 등록 → ④ `onModuleInit` → `onApplicationBootstrap` 순으로 진행한 뒤 포트를 연다. (보충: 교재는 ③·④를 `create()` 단계로 묶어 설명하지만, 실제 NestJS 코드에서는 둘 다 `init()`에서 일어나고 라우트 등록이 먼저다.)

**트레이드오프**: 일관된 구조와 테스트 용이성을 얻는 대신, 보일러플레이트가 많고 DI·스코프·파이프라인을 이해해야 생산적이며(학습 기간을 일주일로 잡아라), 동작이 메타데이터에 숨어 디버깅이 덜 직관적이다.

**SaaS에서 왜 중요한가**: 기능이 계속 늘어나는 SaaS에서는 "새 기능을 어디에 어떻게 붙일지"가 고정되어 있는 것이 개발 속도와 품질을 지킨다.

> 📖 원문: 01-what-is-nestjs §1, §3, §4, §7, §10 / NestJS-Architecture-Book 1~2장

### 2. 모듈(Module): 애플리케이션의 경계

#### 2.1 `@Module()`의 네 가지 키

| 키 | 의미 |
|----|------|
| `imports` | 내가 쓰려는 **다른 모듈** (프로바이더 클래스를 넣으면 안 된다) |
| `providers` | 이 모듈이 소유하고 만드는 서비스·리포지토리 등 |
| `controllers` | 이 모듈의 HTTP 진입점 |
| `exports` | 다른 모듈에 **공개**할 프로바이더(또는 재공개할 모듈) |

#### 2.2 캡슐화 규칙 (가장 중요)

> 모듈은 ① 자기 `providers`와 ② **import한 모듈이 export한 것**만 주입받을 수 있다.

```ts
@Module({
  providers: [PaymentsService, StripeClient],
  exports: [PaymentsService],        // StripeClient는 비공개
})
export class PaymentsModule {}

@Module({ imports: [PaymentsModule], providers: [OrdersService] })
export class OrdersModule {}         // PaymentsService만 주입 가능
```

- 공개 범위는 **한 단계만** 전파된다. A→B→C로 import해도 A는 C를 못 본다(B가 C를 재export하면 가능).
- `exports`는 체크박스가 아니라 **API 설계 결정**이다. "1년 동안 안정적으로 유지할 수 있는 것"만 공개한다. 외부 SDK 클라이언트, 리포지토리는 보통 비공개로 둔다.

**SaaS에서 왜 중요한가**: 결제 벤더를 바꿀 때 `PaymentsModule`만 고치면 되도록 경계를 강제한다. 모듈러 모놀리스(→ Part 3 §9)를 NestJS로 구현하는 수단이 바로 이 규칙이다.

#### 2.3 중복 등록 함정: "같은 클래스, 두 개의 인스턴스"

- 에러가 난다고 사용하는 쪽 모듈의 `providers`에도 같은 서비스를 넣으면, **인스턴스가 두 개** 생긴다.
- 결과: 인메모리 캐시·카운터가 갈라지고, DB 풀이 두 배가 되며, `onModuleInit`에서 시작한 크론·큐 구독이 두 번 돈다.
- 해결: 소유 모듈 한 곳에 등록 → `exports` → 쓰는 쪽은 `imports`.

#### 2.4 전역 모듈과 순환 import

- `@Global()`은 import 없이 어디서나 보이게 하지만 **의존성이 보이지 않게 된다**(결합도 파악·테스트 구성이 어려워짐). 로거, 설정(`ConfigModule.forRoot({ isGlobal: true })`), 요청 컨텍스트처럼 **프로세스당 하나뿐인 인프라**에만 쓴다. 귀찮음이 이유라면 `CoreModule`이 인프라 모듈을 `imports`+`exports`로 재공개하는 파사드를 만든다.
- 모듈 그래프는 순환이 없어야 한다(DAG). `UsersModule ↔ OrdersModule` 순환을 `forwardRef(() => OrdersModule)`로 우회할 수 있지만 **진단이지 치료가 아니다.** 빠진 제3의 모듈(공통 개념, 도메인 이벤트)을 뽑아내면 풀린다.

#### 2.5 동적 모듈(Dynamic Module): `forRoot` / `register` / `forFeature`

정적 `@Module()`은 고정된 메타데이터다. 동적 모듈은 **정적 메서드가 설정값을 받아 모듈 메타데이터를 계산해 반환**한다.

| 이름 관례 | 약속하는 의미 | 호출 횟수 | 예 |
|-----------|---------------|-----------|----|
| `forRoot()` | 앱 전체에 하나뿐인 설정 (연결·풀 생성) | 루트에서 **딱 한 번** | `TypeOrmModule.forRoot`, `BullModule.forRoot` |
| `forFeature()` | `forRoot`가 만든 자원을 기능 모듈에서 일부 사용 | 기능 모듈마다 | `TypeOrmModule.forFeature([User])` |
| `register()` | 호출한 모듈 전용 설정, 여러 번 해도 정상 | 모듈마다 | `JwtModule.register`, `HttpModule.register` |
| `*Async()` | 위와 같되 설정값을 DI(예: `ConfigService`)에서 받음 | 동일 | `forRootAsync`, `registerAsync` |

```ts
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.getOrThrow<string>('DATABASE_URL'),
    synchronize: false,
  }),
}),
```

- 실무 규칙: 시크릿·접속 정보는 항상 `*Async` + `ConfigService`로 주입한다(하드코딩 금지).
- 흔한 실수: 기능 모듈에서 `forRoot()`를 또 호출 → DB 풀이 두 개 생긴다.

> 🔗 NestJS 연결: DI 일반 이론(와이어링, 서비스 로케이터 대비 장점)은 → Part 2 §8.4, 레이어드/모듈러 모놀리스 설계는 → Part 3 §8~9 참조.

> 📖 원문: 06-modules §1~§9, 37-dynamic-modules §3, §6 / NestJS-Architecture-Book 3장

### 3. 프로바이더(Provider)와 DI 컨테이너

#### 3.1 세 단계: 선언 → 등록 → 해석

1. **선언**: `@Injectable()`을 붙인다. 이것은 "표식"일 뿐 등록이 아니다.
2. **등록**: 어떤 모듈의 `providers`에 넣는다.
3. **해석**: 생성자 타입(토큰)을 보고 컨테이너가 인스턴스를 찾아 넣어 준다.

- 기본적으로 프로바이더는 **싱글턴**(모듈 컨텍스트당 하나)이다.
- 컨트롤러는 얇게, 비즈니스 로직은 서비스(프로바이더)에 둔다.

#### 3.2 토큰(Token): 컨테이너가 찾는 열쇠

| 토큰 종류 | 예 | 주입 방법 | 언제 |
|-----------|----|-----------|------|
| 클래스 | `UsersService` | 생성자 타입 그대로 | 가장 흔한 경우 |
| 추상 클래스 | `abstract class Mailer` | 생성자 타입 그대로 | 앱 내부의 "포트"(교체 가능한 계약) |
| Symbol | `Symbol('LOGGER')` | `@Inject(LOGGER)` | 라이브러리, 큰 앱 (충돌 없음) |
| 문자열 | `'CONNECTION'` | `@Inject('CONNECTION')` | 작은 앱, 상수 파일에 한 번만 정의 |

**인터페이스는 토큰이 될 수 없다.** TypeScript 인터페이스는 컴파일 후 사라지므로 런타임에 `Object`로만 남는다(→ Part 1 §1.2 "타입은 런타임에 사라진다").

```ts
export abstract class Mailer {           // 추상 클래스는 런타임에도 남는다
  abstract send(to: string, body: string): Promise<void>;
}
@Module({ providers: [{ provide: Mailer, useClass: SesMailer }], exports: [Mailer] })
export class MailModule {}

@Injectable()
export class SignupService {
  constructor(private readonly mailer: Mailer) {} // @Inject 없이 주입
}
```

#### 3.3 네 가지 레시피: `useClass` / `useValue` / `useFactory` / `useExisting`

`providers: [UsersService]`는 `{ provide: UsersService, useClass: UsersService }`의 축약형이다. 토큰과 "만드는 방법"을 분리하면 다음이 가능해진다.

| 레시피 | 하는 일 | 대표 용도 |
|--------|---------|-----------|
| `useClass` | 토큰에 다른 구현 클래스를 연결 | 환경별 구현 교체, 포트-어댑터 |
| `useValue` | 이미 만들어진 값을 그대로 사용(주입·생성 없음) | 상수, 외부 SDK 인스턴스, 테스트 대역 |
| `useFactory` | 함수 반환값을 프로바이더로. `inject`로 의존성 받음, `async` 가능 | 설정 기반 객체, DB 연결 |
| `useExisting` | 기존 프로바이더에 **별칭**(같은 인스턴스) | 토큰 이름 마이그레이션 |

```ts
{
  provide: 'REDIS',
  useFactory: async (config: ConfigService) => createRedis(config.getOrThrow('REDIS_URL')),
  inject: [ConfigService],   // 순서대로 팩토리 인자에 들어간다(위치 기반!)
}
```

- `inject` 배열은 **위치 기반**이다. 순서가 틀려도 타입 에러가 나지 않으니 주의한다.
- 비동기 팩토리는 끝날 때까지 **부팅 전체를 멈춘다.** 연결이 영원히 안 끝나면 서버가 listen하지 못한 채 멈춰 있으니 타임아웃을 둔다.
- `useClass`로 같은 클래스를 다른 토큰에 등록하면 **두 번째 인스턴스**가 생긴다. 같은 인스턴스를 원하면 `useExisting`.

#### 3.4 순환 의존과 흔한 에러

- 서비스 A↔B가 서로 생성자 주입하면 해석이 불가능하다. `forwardRef()`로 우회할 수 있지만 순환은 **설계 냄새**다. 공통 로직을 제3의 서비스로 빼거나 한 방향을 이벤트(§16)로 바꾼다.
- `Nest can't resolve dependencies of X (?)` → `providers` 미등록이거나 소유 모듈이 export하지 않았다.
- 리팩터링 후 생성자 인자가 `undefined` → `@Injectable()`을 지워 타입 메타데이터가 사라졌다. 생성자 의존이 있는 클래스엔 반드시 클래스 데코레이터를 둔다.

**SaaS에서 왜 중요한가**: 결제·메일·스토리지 같은 외부 의존을 토큰 뒤에 숨기면, 벤더 교체와 테스트 대역 주입(§19)이 한 줄로 끝난다.

> 📖 원문: 05-providers-and-services §1～§6, 07-dependency-injection-basics §3～§9, 41-module-ref-discovery-lazy "Circular dependencies"

### 4. 주입 스코프(Injection Scope)

#### 4.1 싱글턴이 기본인 이유

- Node는 스레드 하나가 여러 요청을 번갈아 처리한다(→ Part 2 §2). 커넥션 풀, Redis 클라이언트처럼 프로세스에 **하나만** 있어야 맞는 것이 많아서, Nest는 부팅 때 프로바이더를 한 번 만들고 계속 재사용한다.

**위험한 것은 싱글턴 자체가 아니라 "싱글턴 필드에 요청 데이터를 저장하는 것"이다.**

```ts
@Injectable()
export class OrdersService {
  private currentUserId!: string;            // ❌ 모든 요청이 공유하는 필드
  async handle(userId: string) {
    this.currentUserId = userId;
    await this.repo.slowQuery();              // 이 사이 다른 요청이 덮어쓴다
    return this.repo.forUser(this.currentUserId); // 다른 사용자의 데이터!
  }
}
```

해결은 스코프 변경이 아니라 **요청 데이터를 인자로 넘기는 것**이다.

#### 4.2 세 가지 스코프

| | `DEFAULT`(싱글턴) | `REQUEST` | `TRANSIENT` |
|---|---|---|---|
| 인스턴스 수 | 앱당 1개 | 요청마다 1개 | 주입받는 쪽마다 1개 |
| 생성 시점 | 부팅 | 요청 처리 중 | 소비자 생성 시 |
| 위로 전파(버블링) | — | **전파됨** | 전파 안 됨 |
| 비용 | 부팅 후 0 | 요청마다 생성 + GC | 주입 지점마다 생성 |

#### 4.3 스코프 버블링(Scope Bubbling)

> 의존 그래프 어딘가에 `REQUEST` 스코프가 있으면, 그것을 주입받는 모든 상위 클래스(서비스 → 컨트롤러)가 **자동으로 요청 스코프가 된다.**

- 소비자는 의존 대상보다 오래 살 수 없기 때문에 생기는 필연적인 규칙이다. 로거 하나를 요청 스코프로 바꿨는데 수백 개 프로바이더가 요청마다 새로 만들어져 처리량이 크게 떨어지는 사고.
- 부작용: 생성자 에러가 부팅이 아니라 **첫 요청**에서 터지고, `onModuleInit`이 요청마다 실행된다.
- 요청 스코프로 만들면 안 되는 것: WebSocket 게이트웨이, 크론 작업 프로바이더(스케줄러에 등록되지 않아 **조용히 실행되지 않는다**), 일반 Passport 전략.

**실무 결론**: 요청별 데이터(요청 ID, 사용자, 테넌트)를 깊은 곳까지 전달해야 한다면 요청 스코프 대신 **AsyncLocalStorage**(§18)를 쓴다.

> 📖 원문: 38-injection-scopes §1~§4, §8, §11, 55-performance-and-compilation "Where Nest actually costs you"

### 5. 요청 처리 파이프라인: 어디에 무엇을 넣을까

#### 5.1 고정된 실행 순서

```text
요청 → Middleware(전역 → 모듈)
     → Guard(전역 → 컨트롤러 → 메서드)
     → Interceptor 전처리(전역 → 컨트롤러 → 메서드)
     → Pipe(전역 → 컨트롤러 → 메서드 → 파라미터)
     → Handler → Service
     → Interceptor 후처리(메서드 → 컨트롤러 → 전역, 양파처럼 역순)
     → 응답
예외 → Exception Filter(메서드 → 컨트롤러 → 전역, 첫 매칭 하나만 실행)
```

- 들어갈 때는 **넓은 범위 → 좁은 범위**, 나올 때는 반대(인터셉터는 양파 구조).
- 필터만 예외적으로 **좁은 범위부터** 찾고, 하나가 잡으면 다음 필터로 넘어가지 않는다.

#### 5.2 각 구성요소의 역할

| 구성요소 | 답하는 질문 | 핸들러를 아는가 | 응답 본문을 보는가 | 대표 용도 |
|----------|-------------|-----------------|-------------------|-----------|
| Middleware | 라우팅 전에 할 일은? | ❌ | ❌ | 요청 ID, 보안 헤더(helmet), ALS 컨텍스트 열기, raw 로깅 |
| Guard | 이 요청을 **진행시켜도 되나?** | ✅ | ❌ | 인증, 인가(역할·정책), 기능 플래그, rate limit |
| Interceptor | 핸들러 **앞뒤로** 무엇을 감쌀까? | ✅ | ✅ (변경 가능) | 응답 변환, 직렬화, 캐시, 타임아웃, 실행 시간 측정 |
| Pipe | 입력값이 **올바른 형태인가?** | (인자 단위) | ❌ | DTO 검증, 타입 변환(`ParseIntPipe`) |
| Exception Filter | 에러를 **어떤 모양으로** 돌려줄까? | ✅ | (에러를 봄) | 에러 응답 표준화, 에러 리포팅 |

#### 5.3 선택을 돕는 세 가지 질문

1. **어떤 핸들러인지 알아야 하나?** (`@Public()`, `@Roles()` 같은 메타데이터를 읽어야 하나?) → Guard 또는 Interceptor. Middleware는 메타데이터를 못 읽는다.
2. **응답 본문을 보거나 바꿔야 하나?** → Interceptor.
3. **존재하지 않는 URL(404)에도 실행돼야 하나?** → Middleware.

가장 흔한 오해: **인증은 Middleware가 아니라 Guard에 둔다.** Middleware에서 JWT를 검증하면 로그인 경로를 제외하려고 URL 목록을 하드코딩하게 되고, 그 목록은 컨트롤러와 금방 어긋난다. (토큰을 꺼내 `req`에 붙이는 일까지는 Middleware가 해도 되지만, **허용/거부 결정**은 Guard가 한다.)

#### 5.4 에러 경로에서 무엇이 실행되나

- 예외가 발생한 지점에서 파이프라인은 중단되고 필터 단계로 넘어간다. Middleware 예외는 **전역 필터만** 잡는다.
- Pipe·Handler·Service의 예외는 인터셉터의 `catchError`가 볼 수 있지만, **Guard의 예외는 볼 수 없다**(아직 인터셉터에 들어가지 않았음). 그래서 로깅 인터셉터는 401/403을 기록하지 못한다 → 전역 필터나 미들웨어에서 기록한다.
- 같은 이유로 **가드는 인터셉터가 붙인 값을 읽을 수 없다.** 가드에 필요한 값은 미들웨어나 앞선 가드가 준비한다.

#### 5.5 바인딩 범위: 전역 / 컨트롤러 / 메서드

- 메서드·컨트롤러 범위: `@UseGuards()`, `@UseInterceptors()`, `@UsePipes()`, `@UseFilters()`를 메서드 또는 클래스 위에 붙인다.
- 전역 범위(**권장**): 모듈 `providers`에 `{ provide: APP_GUARD, useClass: AuthGuard }` (APP_PIPE, APP_INTERCEPTOR, APP_FILTER 동일). DI 컨테이너가 만들므로 `Reflector`, `ConfigService`를 주입받을 수 있다.
- `app.useGlobalGuards(new X())`는 컨테이너 밖에서 생성되어 **주입이 불가능**하다.
- `APP_*` 토큰은 **어느 모듈에 선언해도 전역**으로 적용된다(기능 모듈에 넣어도 전역이 되어 놀라는 경우가 있음).
- 여러 가드가 있으면 전역 → 컨트롤러 → 메서드 순으로 **모두 통과**해야 한다. 전역 `AuthGuard` + 메서드 `RolesGuard` 조합이 "인증 후 인가"를 자연스럽게 만든다.
- 파이프에는 부수효과를 넣지 않는다. 변환과 검증만 한다.
- 한 엔드포인트에서만 쓰는 인터셉터는 대개 서비스의 private 메서드로 충분하다.

> 📖 원문: 08-middleware "Middleware vs. guards vs. interceptors", 12-interceptors "onion model", "Interceptors versus middleware versus filters", 13-custom-decorators-and-lifecycle §8~§10

### 6. ExecutionContext와 커스텀 데코레이터

#### 6.1 `ArgumentsHost`와 `ExecutionContext`

- **`ArgumentsHost`**: 핸들러에 넘어갈 인자 배열의 래퍼. 전송 방식에 따라 내용이 다르다(HTTP는 `[req, res, next]`, 마이크로서비스는 `[data, context]` 등). `switchToHttp()`, `switchToRpc()`, `switchToWs()`, `getType()`으로 꺼낸다. 예외 필터가 받는다.
- **`ExecutionContext`**: `ArgumentsHost` + "**어느 핸들러가 실행될 것인가**". `getHandler()`(메서드), `getClass()`(컨트롤러 클래스)를 추가로 제공한다. 가드와 인터셉터가 받는다.
- `getHandler()`/`getClass()`의 진짜 용도는 **메타데이터 조회 키**다.

#### 6.2 메타데이터 데코레이터와 `Reflector`

역할 같은 "이 라우트에 필요한 조건"을 데코레이터로 붙이고, 가드가 `Reflector`로 읽는다.

```ts
export const Roles = Reflector.createDecorator<string[]>();   // 타입 안전한 데코레이터

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride(Roles, [ctx.getHandler(), ctx.getClass()]);
    if (!roles) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return roles.some((r) => user?.roles?.includes(r));
  }
}
```

- `getAllAndOverride`는 처음 발견한 값을 쓴다(메서드 설정이 클래스 설정을 덮어씀). 대부분 이것을 쓴다. `get(key, handler)`만 쓰면 클래스에 붙인 설정을 놓치고, 값을 누적하려면 `getAllAndMerge`를 쓴다.
- 배열 순서는 **`[getHandler(), getClass()]`**. 반대로 쓰면 메서드의 설정이 무시된다.
- 문자열 키가 필요하면 `SetMetadata('roles', roles)`를 감싼 함수로 만든다(키 문자열을 여기저기 반복하지 않기).

#### 6.3 파라미터 데코레이터: `@CurrentUser()`

```ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);

@Get('me')
me(@CurrentUser() user: AuthUser) { return user; }
```

- `req.user`(`any`)를 직접 꺼내는 대신 타입이 있는 파라미터로 받는다.
- 데코레이터 **본문은 한 번**, 팩토리 함수는 **요청마다** 실행된다. 요청별 계산은 팩토리 안에 둔다.
- 여러 데코레이터를 묶을 때는 `applyDecorators(...)`로 하나의 데코레이터를 만든다(예: `@Auth('admin')` = 가드 + 역할 + Swagger 표시).

> 📖 원문: 40-execution-context "ArgumentsHost", "ExecutionContext", 11-guards "Route metadata", "Reading metadata", 13-custom-decorators-and-lifecycle §1~§7

### 7. 예외 처리: 에러 응답을 표준화하고 내부를 숨긴다

#### 7.1 내장 예외 계층

- Nest에는 처리되지 않은 예외를 잡는 **기본 예외 레이어**가 있다. `HttpException`이 아닌 예외는 `500 Internal server error`로 바뀐다.
- `HttpException`이 기반 클래스이고, `BadRequestException`(400), `UnauthorizedException`(401), `ForbiddenException`(403), `NotFoundException`(404), `ConflictException`(409) 등 하위 클래스를 쓴다.

```ts
throw new NotFoundException('Order not found');
throw new ConflictException('Email already used', { cause: err }); // cause는 응답에 나가지 않음
```

- `cause`는 로그·필터에서 원인 추적용이고 **응답 본문에 직렬화되지 않는다.**
- 첫 인자에 **객체**를 넘기면 그 객체가 그대로 응답 본문이 된다. 엔드포인트마다 에러 모양이 달라지는 흔한 원인이다.
- 도메인 예외(`InsufficientCreditError` 등)는 서비스에서 던지고, HTTP 상태로의 변환은 필터에서 한 곳에 모으면 서비스가 HTTP를 몰라도 된다. (보충)

#### 7.2 전역 예외 필터로 에러 모양 통일

```ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}
  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    httpAdapter.reply(ctx.getResponse(), { statusCode: status, path: httpAdapter.getRequestUrl(ctx.getRequest()) }, status);
  }
}
```

- `@Catch()`를 비워 두면 모든 예외(심지어 `throw '문자열'`)를 잡는다.
- `HttpAdapterHost`를 쓰면 Express/Fastify 어디서나 같은 코드로 동작한다.
- 500 에러에는 **스택·SQL·내부 메시지를 절대 내보내지 않는다.** 로그에만 남기고, 응답에는 요청 ID 정도만 준다.
- 표준 에러 포맷(Problem Details, RFC 9457)은 → Part 5 §10, 에러를 통한 정보 노출 방지는 → Part 7 §16 참조.

#### 7.3 주의할 점

- **필터는 처리되지 않은 예외에만 실행된다.** 서비스에서 `try/catch`로 삼킨 에러는 필터에 도달하지 않는다.
- **메서드 레벨 `@UseFilters()`는 예외를 삼킨다.** 필터끼리 연쇄되지 않으므로, 그 라우트의 500은 전역 필터(에러 리포팅)에 도달하지 않는다. 필터는 **전역으로 바인딩**하는 것이 기본이다.
- 같은 범위에 catch-all 필터와 특정 타입 필터를 함께 등록할 때는 **catch-all을 먼저** 등록한다(나중에 등록된 것이 먼저 검사됨).

> 📖 원문: 09-exception-filters "HttpException", "Catch-everything filters", "Binding filters", 13-custom-decorators-and-lifecycle §9~§10

### 8. 검증(Validation)과 DTO

#### 8.1 DTO + class-validator + ValidationPipe

- TypeScript 타입은 런타임에 사라지므로, 외부 입력은 **런타임 검증**이 필요하다(→ Part 1 §10).
- Nest에서는 DTO **클래스**에 `class-validator` 데코레이터를 붙이고, `ValidationPipe`가 검증한다. (인터페이스로 DTO를 만들면 검증 메타데이터가 없어 검증되지 않는다.)

```ts
export class CreateProjectDto {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsEnum(Visibility) visibility?: Visibility;
  @ValidateNested({ each: true }) @Type(() => MemberDto) members!: MemberDto[];
}
```

- 중첩 객체는 `@ValidateNested()`와 `@Type(() => X)`를 **함께** 써야 안쪽까지 검증된다.

#### 8.2 꼭 켜야 할 옵션

| 옵션 | 효과 | 권장 |
|------|------|------|
| `whitelist: true` | 데코레이터가 없는 속성을 **제거** | 첫날부터 전역으로 켠다 |
| `forbidNonWhitelisted: true` | 제거 대신 400 에러 | 내부 API에 적합 (공개 API는 구버전 클라이언트 고려) |
| `transform: true` | 결과를 DTO 인스턴스로 변환, `@Param('id') id: number` 같은 원시 타입 변환 | 대부분 켬 |
| `enableImplicitConversion` | 선언 타입만 보고 자동 변환 | 꺼 두고 `@Type()`을 명시하는 편이 안전 (`"abc"`→`NaN` 문제) |

```ts
providers: [{
  provide: APP_PIPE,
  useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
}]
```

**왜 중요한가 (대량 할당 방어)**: `PATCH /users/me`에 `{ "displayName": "A", "role": "admin" }`을 보냈을 때 `whitelist`가 없으면 `repo.save(dto)`가 관리자 권한을 줘 버린다. 다만 `whitelist`는 **모양**만 지킨다. "이 사용자가 이 필드를 바꿀 권한이 있는가"는 인가(§13)의 몫이다. → Part 7 §11(BOPLA) 참조.

#### 8.3 내장 파이프

- `ParseIntPipe`, `ParseUUIDPipe`(`new ParseUUIDPipe({ version: '4' })`): 경로 파라미터 형식 강제. `ParseEnumPipe`: 열린 문자열을 닫힌 집합으로. `DefaultValuePipe`: 쿼리 기본값.
- 배열 본문(`CreateDto[]`)은 타입이 `Array`로 지워져 `ValidationPipe`만으로는 원소가 검증되지 않는다. `new ParseArrayPipe({ items: CreateDto })`를 쓴다(`?ids=1,2,3`도 `separator`로 처리).

#### 8.4 Mapped Types: DTO 중복 없이 만들기

```ts
export class UpdateProjectDto extends PartialType(
  OmitType(CreateProjectDto, ['ownerId'] as const),   // 소유자는 수정 불가
) {}
```

- `PartialType`(전부 선택), `PickType`, `OmitType`, `IntersectionType`을 조합한다. 검증 메타데이터도 함께 복사된다.
- Swagger를 쓰는 프로젝트는 `@nestjs/mapped-types`가 아니라 **`@nestjs/swagger`에서 import**해야 문서 스키마가 비지 않는다.
- `as const`를 붙여야 속성 이름 오타가 컴파일 에러가 된다.

> 📖 원문: 10-pipes-and-validation "ValidationPipe options", "Global pipes and APP_PIPE", "The built-in pipes", 15-validation-in-depth "Nested objects", "Mapped types"

### 9. 직렬화(Serialization): 응답 과다 노출 막기

#### 9.1 `ClassSerializerInterceptor` + `@Exclude()`

```ts
export class UserEntity {
  id!: string;
  email!: string;
  @Exclude() passwordHash!: string;      // 응답에서 제거
  constructor(partial: Partial<UserEntity>) { Object.assign(this, partial); }
}
// 전역 등록: { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor }
```

- 인터셉터가 핸들러 반환값에 `instanceToPlain()`을 적용하면서 `@Exclude()` 규칙을 반영한다.
- 거부 목록(`@Exclude`) 대신 허용 목록(`@Expose` + `excludeExtraneousValues`) 방식도 있다. 새 필드가 기본적으로 숨겨지므로 더 안전하다.

#### 9.2 "데코레이터가 안 먹어요"의 정체

`@Exclude()`는 **클래스 인스턴스**에만 동작한다. 일반 객체를 반환하면 아무 경고 없이 비밀번호 해시가 그대로 나간다. 일반 객체가 되는 흔한 경우:
- Prisma 조회 결과(항상 일반 객체), Mongoose `.lean()`, TypeORM raw 쿼리, `{ ...user, permissions }`처럼 직접 만든 객체
- `{ items: users, total }` 같은 **감싼 응답**(바깥이 일반 객체라 안쪽 규칙도 적용 안 됨), 캐시를 거쳐 `JSON.parse`된 값

#### 9.3 대안: 명시적 응답 DTO와 매퍼

```ts
export class UserResponse {
  static from(u: User): UserResponse {
    return { id: u.id, email: u.email, createdAt: u.createdAt.toISOString() };
  }
}
```

- 반환할 필드를 **명시적으로 고르는** 방식. 엔티티와 API 계약이 분리되어 스키마 변경이 API로 새지 않는다. Prisma처럼 일반 객체를 주는 ORM이라면 이 방식이 더 안전하다(보충: 팀에서 한 방식을 정해 일관되게 쓴다).

**SaaS에서 왜 중요한가**: 내부 필드(해시, 2FA 시크릿, 다른 테넌트 ID, 내부 메모) 노출은 대표적인 API 취약점(과다 데이터 노출)이다. → Part 7 §11 참조.

> 📖 원문: 16-serialization "The mechanism", "Excluding properties", "The bug that costs the most hours", "The alternative: explicit response DTOs"

### 10. 설정(Configuration)과 시크릿

#### 10.1 `ConfigModule`과 부팅 시 검증

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    DATABASE_URL: Joi.string().required(),
    JWT_SECRET: Joi.string().min(32).required(),
  }),
}),
```

- 원칙: **설정이 틀리면 런타임 `undefined`가 아니라 부팅 실패**가 되어야 한다. 에러 메시지에 변수 이름이 나와야 한다.
- `JWT_SECRET`에 최소 길이 규칙을 두면 `.env.example`의 `secret` 같은 자리표시자로 배포되는 사고를 막는다.
- 값을 읽을 때 필수 값은 `config.getOrThrow('KEY')`를 쓴다. 코드 곳곳에서 `process.env`를 직접 읽지 않는다.
- 관련 설정은 `registerAs('db', () => ({...}))`로 네임스페이스로 묶어 타입 있게 쓸 수 있다.

#### 10.2 무엇이 설정이고, 시크릿은 어디에 두나

- **설정 = 배포 환경마다 달라지는 값**(DB 주소, 로그 레벨, 외부 엔드포인트). 모든 환경에서 같은 비즈니스 규칙·재시도 정책은 코드 상수로 둔다.
- `.env` 파일은 **개발 편의용**이다. 운영에서는 플랫폼이 주입한다(K8s Secret, 클라우드 시크릿 매니저, 마운트된 시크릿 파일).
- `.env`가 운영에서 위험한 이유: 디스크에 남음, Docker 이미지 레이어에 영원히 남음, 실수로 커밋됨, 교체(rotation)가 어려움.
- 운영 DB 비밀번호, 클라우드 키, JWT 서명 키, 결제 라이브 키는 **시크릿 매니저/KMS**에 둔다. → Part 6 §7 참조.

> 📖 원문: 17-configuration "Schema validation", "Reading values", "Namespaces", "The 12-factor discussion"

### 11. 로깅(Logging)

#### 11.1 내장 `Logger`와 교체

- `private readonly logger = new Logger(OrdersService.name)`처럼 **클래스 이름을 컨텍스트로** 갖는 로거를 쓴다.
- 운영에서는 구조화(JSON) 로거로 교체한다. 흔한 선택은 `nestjs-pino`(빠르고, 요청 ID 자동 부여, `redact` 지원).
- 부팅 중 로그까지 내 로거로 보내려면 `NestFactory.create(AppModule, { bufferLogs: true })`로 로그를 잠시 모아 두고 `app.useLogger(app.get(AppLogger))`로 교체한다.

#### 11.2 상관관계 ID(Correlation ID)

- 규칙: 들어온 `x-request-id`가 있으면 쓰고, 없으면 UUID를 만든 뒤, 응답 헤더에도 돌려주고, **그 요청의 모든 로그 줄에 붙인다.**
- 함수 인자로 넘기지 말고 AsyncLocalStorage(§18)에 둔다. `nestjs-pino`는 이를 자동으로 해 준다.

#### 11.3 무엇을 남기고, 무엇을 절대 남기지 않나

- **남긴다**: 요청 ID, 내부 `userId`·`tenantId`, 이벤트 이름, 상태코드, 소요 시간, 리소스 ID, 에러 스택(별도 필드), 배포 버전.
- **절대 남기지 않는다**: 비밀번호, 토큰, `Authorization` 헤더, 세션 쿠키, 카드 정보, 주민·여권 번호, 요청/응답 본문 통째로. 이메일·이름도 내부 ID로 대신한다.
- **문장이 아니라 이벤트로 남긴다**: `logger.log({ event: 'order.created', orderId, tenantId })`.
- 마스킹은 호출 지점이 아니라 **로거 설정(redact)** 에서 한다. 호출 지점은 리뷰 한 번에 회귀한다.
- 로그도 비용이다. 운영에서 verbose 레벨은 CPU를 크게 잡아먹는다.

> 🔗 NestJS 연결: 감사 로그와 보안 관점의 관측성은 → Part 6 §11, Part 7 §22 참조.

> 📖 원문: 18-logging §5, §7~§10

### 12. DB 연동: ORM 문법보다 개념

#### 12.1 연동 방식 (TypeORM / Prisma)

| | TypeORM (`@nestjs/typeorm`) | Prisma |
|---|---|---|
| 루트 등록 | `TypeOrmModule.forRoot(Async)` (전역으로 `DataSource` 제공) | `PrismaService extends PrismaClient`를 모듈로 제공 |
| 기능 모듈 | `TypeOrmModule.forFeature([User])` | `PrismaModule` import |
| 서비스 주입 | `@InjectRepository(User) repo: Repository<User>` | `constructor(private prisma: PrismaService)` |
| 스키마 원천 | 엔티티 클래스 | `schema.prisma` |
| 강점 | 쿼리 빌더, 복잡한 SQL | 결과 타입 안전성, 리뷰 가능한 SQL 마이그레이션 |

- Prisma는 `class PrismaService extends PrismaClient implements OnModuleInit`으로 감싸고 `onModuleInit()`에서 `$connect()`한다.
- `forRoot()`는 내부적으로 **비동기 팩토리 프로바이더**로 연결을 만든다. 그래서 서비스는 연결이 준비된 뒤에 생성된다(§3.3).
- Prisma는 항상 일반 객체를 반환한다 → 직렬화 주의(§9.2).
- ORM 선택 기준: CRUD 중심이고 타입 안전성이 중요하면 Prisma, 윈도 함수·CTE 같은 복잡한 리포팅 SQL이 많으면 쿼리 빌더 쪽이 유리하다.

#### 12.2 트랜잭션 경계

```ts
await this.dataSource.transaction(async (manager) => {
  await manager.save(order);
  await manager.save(payment);       // 반드시 같은 manager로!
});
```

- 콜백 방식이 커밋·롤백·연결 반납을 대신해 준다. 특별한 이유가 없으면 이 방식을 쓴다.
- 흔한 실수: ① 트랜잭션 안에서 주입받은 **다른 리포지토리**로 저장(다른 커넥션이라 트랜잭션 밖) ② 수동 `QueryRunner`를 `finally`에서 `release()`하지 않음(커넥션 풀 고갈, "20분 뒤 서버가 멈춤") ③ 롤백 후 에러를 다시 던지지 않음(호출자는 성공으로 착각).
- 트랜잭션은 **서비스(유스케이스) 단위**로 잡는다. 테스트를 쉽게 하려면 `TransactionRunner` 같은 좁은 추상 클래스 뒤에 숨긴다.
- 트랜잭션 이론(ACID, 격리 수준)은 → Part 10 §8, Unit of Work와 테스트는 → Part 12 §14 참조.

#### 12.3 마이그레이션: `synchronize: true`는 운영 금지

`synchronize: true`는 부팅 때마다 엔티티와 실제 스키마를 비교해 DDL을 자동 실행한다. 속성 이름만 바꿔도 `DROP COLUMN` + `ADD COLUMN`이 되어 **데이터가 경고 없이 사라지고**, 여러 인스턴스가 동시에 충돌하는 DDL을 실행할 수 있으며, 변경 기록이 없어 리뷰도 롤백도 불가능하다.

대신 **마이그레이션 파일**(버전 관리, 코드 리뷰, 배포 파이프라인에서 실행)을 쓴다. 마이그레이션 CLI는 Nest DI 밖에서 돌기 때문에 별도의 `DataSource` 설정 파일이 필요하다.

> 📖 원문: 19-sql-with-typeorm "forRoot", "The repository pattern", "Transactions", "Migrations", 22-prisma §6, §14

### 13. 인증(Authentication)과 인가(Authorization)

인증·인가 이론(세션 vs 토큰, JWT 구조, OAuth/OIDC, RBAC/ABAC)은 → Part 6 §5, §8~§10, 테넌트 컨텍스트를 토큰에 싣는 방법은 → Part 8 §5 참조. 여기서는 **NestJS에서의 배치**만 다룬다.

#### 13.1 기본값을 "잠금"으로: 전역 Guard + `@Public()`

라우트마다 `@UseGuards(AuthGuard)`를 붙이는 방식은 **하나라도 빠뜨리면 뚫린다.** 반대로 전역에 가드를 걸고 공개 라우트만 표시한다.

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// AuthGuard.canActivate 안에서
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
if (isPublic) return true;
// ...토큰 검증 후 request.user 설정

// 모듈: providers: [{ provide: APP_GUARD, useClass: AuthGuard }]
```

- 로그인 라우트에 `@Public()`을 빠뜨리면 "로그인하려면 로그인해야 하는" 상태가 된다.
- 웹훅·헬스체크도 전역 가드를 탄다. 결제사 웹훅은 토큰 대신 **서명 헤더 검증용 가드**를 따로 둔다(그냥 `@Public()`으로 열지 말 것).

#### 13.2 Passport 전략 (선택)

`@nestjs/passport`는 Passport 전략을 Nest 가드로 감싼다(`PassportStrategy(Strategy)` 상속, `validate()` 반환값이 `req.user`). 인증 방식이 하나면 직접 만든 가드가 더 단순하고, 소셜 로그인·API 키·세션 등 **여러 방식**이 생기면 Passport가 이득이다.

#### 13.3 인가의 두 층: 타입 수준(Guard) + 인스턴스 수준(Service)

| 질문 | 어디서 | 예 |
|------|--------|----|
| "이 사용자는 **게시글 수정 기능**을 쓸 수 있나?" | Guard (`RolesGuard`, `PoliciesGuard`) | `@Roles(['admin'])`, `@CheckPolicies(...)` |
| "이 사용자는 **이 게시글**을 수정할 수 있나?" | Service (엔티티를 로드한 뒤) | `article.authorId === user.id`, 같은 테넌트인가 |

- Guard는 핸들러 전에 실행되므로 **엔티티를 아직 모른다.** 소유권 검사(BOLA 방어)를 가드에서 하려면 추가 DB 조회가 필요하고, 파이프 검증 전이라 파라미터도 날것이다.
- 서비스에서 검사하면 HTTP 외의 호출자(큐 소비자, 다른 서비스, CLI)도 **모두 보호**된다.
- 정책 기반 인가(CASL 등): "행동(action) × 대상(subject) + 조건" 규칙을 **한 팩토리에 모으고**, 가드와 서비스가 같은 규칙을 사용해 어긋나지 않게 한다.
- BOLA/BFLA 개념은 → Part 7 §8, §12 참조.

> 📖 원문: 23-authentication §8, §12, 24-passport-strategies §1~§2, §12, 25-authorization "Basic RBAC", "Integrating CASL", "Ownership checks and the limits of guards"

### 14. 웹 보안 하드닝

| 항목 | NestJS에서 | 핵심 주의점 |
|------|-----------|-------------|
| 보안 헤더 | `app.use(helmet())` (Fastify는 `@fastify/helmet`) | 다른 라우트(Swagger 등) 등록 **전에** 맨 먼저 적용 |
| CORS | `app.enableCors({ origin: [...], credentials: true })` | CORS는 **응답을 브라우저가 읽지 못하게** 할 뿐, 요청 자체는 서버에 도달할 수 있다. 인가 수단이 아니다. `credentials`와 `origin: '*'`는 함께 쓸 수 없다 |
| CSRF | 쿠키 기반 인증일 때만 필요 (double-submit 토큰 등) | `Authorization: Bearer` API에는 불필요. 잘못 걸면 모바일 클라이언트가 모두 403 |
| Rate limit | `@nestjs/throttler` + `APP_GUARD` | 아래 참조 |

```ts
ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),   // ttl은 밀리초
// providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]

@Throttle({ default: { limit: 5, ttl: 900_000 } })   // 로그인: 15분에 5회
@Post('login') login() {}
```

- `ttl`은 **밀리초**다(구버전 튜토리얼의 초 단위 값을 옮기면 사실상 제한이 꺼진다).
- 인스턴스가 여러 대면 기본 인메모리 저장소는 인스턴스별로 따로 센다 → **Redis 저장소** 사용.
- 로드밸런서 뒤에서는 `req.ip`가 LB 주소가 되어 모든 사용자가 한 버킷을 공유한다 → `trust proxy` 설정과 추적 키(사용자/테넌트/API 키) 조정.
- 이론(DoS, 속도 제한 설계, 테넌트별 스로틀링)은 → Part 6 §2, Part 7 §14, Part 8 §11 참조.

> 📖 원문: 26-web-security-hardening "CORS", "Helmet", "CSRF", "Rate limiting", "Common mistakes"

### 15. 캐싱(Caching)

#### 15.1 무엇을 제공하나

- `@nestjs/cache-manager`: `CacheModule`(→ `CACHE_MANAGER` 토큰으로 캐시 주입), `CacheInterceptor`(라우트 자동 캐시), `@CacheKey`/`@CacheTTL`.
- `ttl`은 **밀리초**. 기본값 0은 "만료 없음"이라 인메모리 저장소에서는 메모리 누수가 된다. 항상 명시한다. 여러 인스턴스라면 Redis 저장소를 쓴다(인스턴스별 메모리 캐시는 서로 불일치).

#### 15.2 기본 패턴: 캐시 어사이드(Cache-aside)

```ts
async getPlan(id: string) {
  const key = `plan:${id}`;
  const hit = await this.cache.get<PlanDto>(key);
  if (hit !== undefined && hit !== null) return hit;   // if (!hit)는 0, false를 놓친다
  const plan = await this.repo.findPlan(id);
  await this.cache.set(key, plan, 60_000);
  return plan;
}
```

- 쓰기 시에는 캐시를 `set`하지 말고 **삭제**한다(동시 갱신 순서가 꼬이면 오래된 값이 영구히 남음).
- 캐시 장애는 500이 아니라 **캐시 미스로 처리**한다(try/catch로 감싸기).
- 엔티티 인스턴스가 아니라 **직렬화 가능한 일반 데이터**를 캐시한다.

#### 15.3 `CacheInterceptor`의 함정: 다른 사용자의 데이터

- 기본 캐시 키는 `request.url`이다. **사용자·테넌트·언어가 키에 들어 있지 않다.**
- 전역으로 걸면 `/me/projects`의 A 사용자 응답이 B 사용자에게 나갈 수 있다.
- 사용자별 응답을 캐시하려면 `trackBy()`를 재정의해 테넌트·사용자를 키에 포함하고, 알 수 없으면 캐시하지 않는다(`undefined` 반환).
- CDN에도 같은 문제가 있다. 개인화 응답에는 `Cache-Control: private, no-store`.
- 캐시 정합성 이론은 → Part 10 §11, HTTP 조건부 조회는 → Part 5 §13 참조.

> 📖 원문: 27-caching §1, §3, §4, §6, §13

### 16. 스케줄링 · 이벤트 · 큐

#### 16.1 `@nestjs/schedule`: 다중 인스턴스 중복 실행 주의

- `ScheduleModule.forRoot()`를 루트에 한 번 등록하면 `@Cron()`, `@Interval()`, `@Timeout()`이 동작한다.
- 스케줄러는 **프로세스 안에서** 돈다. 레플리카가 3개면 같은 크론이 **3번** 실행된다. 만료 행 정리 같은 멱등 작업은 낭비일 뿐이지만, 메일 발송·결제 청구는 **정합성 버그**다.
- 대응: 분산 락(Redis/Postgres, 가장 흔한 기본값), 리더 선출, 외부 스케줄러(K8s CronJob) 중 선택. 또는 크론은 "큐에 작업을 넣기"만 하고 `jobId`로 중복을 막는다.

#### 16.2 인프로세스 이벤트: `@nestjs/event-emitter`

```ts
this.events.emit('order.created', new OrderCreatedEvent(order.id));   // 발행
@OnEvent('order.created')
handleOrderCreated(e: OrderCreatedEvent) { this.metrics.increment('orders'); }
```

- 같은 프로세스 안에서 부수 효과를 분리한다(순환 의존을 끊는 데도 유용). **프로세스가 죽으면 사라지고, 재시도도 없다.** 잃어도 되는 가벼운 작업(캐시 무효화, 지표, 실시간 알림)에만 쓴다.
- `emitAsync`는 리스너를 기다리므로 다시 결합이 생기고, 리스너 실패가 원래 요청을 실패시킬 수 있다. 결과가 꼭 필요할 때만 쓴다.

#### 16.3 큐(BullMQ): 느리고, 잃으면 안 되고, 재시도가 필요한 일

- 빠르고 잃어도 됨 → 인프로세스 이벤트 / 느리고 재시작에도 살아남아야 하며 재시도 필요(메일, PDF, 외부 API) → **큐(BullMQ)** / 다른 서비스가 반응해야 함 → 메시지 브로커(→ Part 2 §14, Part 10 §12).

```ts
await this.emailQueue.add('welcome', { userId, tenantId }, {
  jobId: `welcome:${userId}`,                       // 중복 등록 방지
  attempts: 5, backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: true,
});
```

- 소비자는 `@Processor('email')` + `WorkerHost`를 상속한 클래스이며, 모듈의 `providers`에 **등록해야** 동작한다.
- BullMQ는 **최소 한 번(at-least-once)** 전달이다. 워커가 죽거나 이벤트 루프가 막히면 같은 작업이 다시 실행된다 → **모든 핸들러는 두 번 실행돼도 안전(멱등)** 해야 한다(조건부 UPDATE, 유니크 키, 외부 API의 멱등성 키). → Part 5 §11, Part 2 §14.3 참조.
- 재시도해도 소용없는 에러(잘못된 데이터)는 `UnrecoverableError`로 즉시 실패시킨다.
- 운영 주의: 큐용 Redis는 `maxmemory-policy noeviction`(캐시용 Redis와 분리), 완료/실패 작업 정리 정책, 큰 파일은 페이로드 대신 스토리지 키만, 워커 동시성 ≤ DB 풀 크기.

> 📖 원문: 34-scheduling-and-events "Installing", "scheduling across replicas", "EventEmitterModule", "emitAsync", "Where in-process events stop being enough", 35-queues "Producing jobs", "Consumers", "Production concerns", "Common mistakes"

### 17. 라이프사이클 훅과 정상 종료(Graceful Shutdown)

#### 17.1 다섯 가지 훅

| 훅 | 실행 시점 | 용도 |
|----|-----------|------|
| `onModuleInit()` | 그 모듈의 의존성이 모두 준비됨 | **자기 모듈 안**의 초기화 (연결 열기) |
| `onApplicationBootstrap()` | 모든 모듈 초기화 후, listen 직전 | **다른 모듈**과 상호작용하는 초기화 |
| `onModuleDestroy()` | 종료 신호 수신 또는 `app.close()` | 새 작업 수락 중단 |
| `beforeApplicationShutdown()` | 서버 연결이 닫히기 **전** | 진행 중 작업 마무리 대기 |
| `onApplicationShutdown()` | 연결이 모두 닫힌 **후** | DB 풀 닫기, 로그 플러시 |

- 인터페이스(`OnModuleInit` 등)를 `implements`로 명시한다. 메서드 이름 오타(`onModuleDestory`)를 잡아 주는 유일한 장치다.
- init 훅이 오래 걸리면 서버가 그만큼 늦게 listen한다(헬스체크 실패로 이어질 수 있음).

#### 17.2 `enableShutdownHooks()`는 직접 켜야 한다

- `main.ts`에서 `app.enableShutdownHooks()`를 호출해야 SIGTERM 등을 받을 때 `app.close()` → 종료 훅이 실행된다. 기본값은 꺼져 있다. 켜지 않으면 배포 때마다 워커가 작업 도중 죽고, 중복 실행·끊긴 요청이 생긴다.
- 테스트 공용 부트스트랩이 아니라 `main.ts`에서만 켠다(리스너 누적 경고 방지).
- Kubernetes는 `SIGTERM`과 "서비스에서 파드 제거"를 **동시에** 한다. 신호 직후에도 새 요청이 잠깐 더 들어오므로, 즉시 서버를 닫으면 배포 때마다 502가 난다 → 준비(readiness) 상태를 먼저 내리고 잠시 기다린 뒤 닫는다(§21.2).
- 종료 대기 시간(`terminationGracePeriodSeconds`)은 가장 긴 작업보다 길게 잡는다.
- 개념(빠른 실패, 죽게 두기, 정상 상태 유지)은 → Part 11 §6~§8 참조.

> 📖 원문: 39-lifecycle-and-shutdown "The three phases", "The five hooks", "enableShutdownHooks()", "The container story"

### 18. 요청 컨텍스트 전파: AsyncLocalStorage

#### 18.1 왜 필요한가

요청 ID, 사용자, 테넌트를 콜 스택 깊은 곳(리포지토리, 로거)에서 써야 할 때, 모든 함수 인자로 넘기면 시그니처가 오염되고, `REQUEST` 스코프는 버블링으로 성능을 떨어뜨린다(§4.3). **AsyncLocalStorage(ALS)** 는 프로바이더를 싱글턴으로 둔 채 **데이터만** 요청별로 둔다. Node 내장 기능으로, `run(store, fn)` 안에서 시작된 모든 비동기 흐름이 같은 `store`를 본다(보충: 스레드 로컬 저장소의 비동기 버전).

```ts
export const requestContext = new AsyncLocalStorage<{ requestId: string; tenantId?: string }>();

// 미들웨어에서 열기
use(req: Request, _res: Response, next: () => void) {
  requestContext.run({ requestId: (req.headers['x-request-id'] as string) ?? randomUUID() }, next);
}
// 어디서든 읽기 (메서드 안에서!)
const ctx = requestContext.getStore();
```

#### 18.2 `nestjs-cls`

- 직접 만들 때 반복되는 것(타입 있는 저장소, 미들웨어 자동 장착, ID 생성, 테스트 도우미)을 제공하는 서드파티 라이브러리.
- `ClsModule.forRoot({ global: true, middleware: { mount: true, generateId: true } })` 후 `ClsService`를 주입해 `cls.get('tenantId')`로 읽는다.
- 장착 위치는 미들웨어가 가장 안전하다(가드보다 먼저 열림). 인증 후 정보(`tenantId`)는 가드에서 검증한 뒤 저장소에 `set`한다. (보충)

#### 18.3 컨텍스트가 끊기는 곳과 주의점

- **큐 워커**: 작업은 요청의 자식이 아니다. 테넌트·요청 ID를 **작업 데이터에 직렬화해 넣고** 소비자에서 다시 세운다. 워커에서 테넌트가 없을 때 `'public'` 같은 **기본값으로 때우지 않는다**(다른 테넌트 데이터로 실행되는 사고).
- **생성자에서 읽기 금지**: 싱글턴 생성자는 부팅 때 한 번만 실행되므로 아무것도 담기지 않는다. 메서드 안에서 호출 시점에 읽는다.
- `enterWith()` 대신 `run()`을 쓴다(keep-alive 연결에서 저장소가 다음 요청으로 새는 사고 방지).
- 테넌트 ID는 **검증된 토큰에서** 가져온다. 클라이언트가 보낸 `x-tenant-id` 헤더를 그대로 믿지 않는다. 그리고 모든 쿼리가 하나의 관문(테넌트 조건을 강제하는 리포지토리)을 지나게 하고, DB 행 수준 보안(RLS)을 보조 방어선으로 둔다. → Part 8 §5, §10 참조.

> 📖 원문: 43-async-local-storage "Building the store yourself", "nestjs-cls", "Where context gets lost", "Common mistakes", 38-injection-scopes §11, 18-logging §9

### 19. 테스트

테스트 원칙(무엇을 테스트할지, 목의 올바른 자리, DB 통합 테스트)은 → Part 12 참조. 여기서는 Nest 도구만 정리한다. 생성자 주입만 쓰는 서비스는 `new OrdersService(fakeRepo)`로 Nest 없이도 단위 테스트할 수 있고, 컨테이너가 필요할 때만 아래 도구를 쓴다.

#### 19.1 `Test.createTestingModule()`과 오버라이드

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(PaymentGateway).useValue(fakeGateway)        // 외부 의존만 교체
  .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
  .compile();
const service = moduleRef.get(OrdersService);
```

- `@Module()`과 같은 메타데이터를 받는다. `compile()`은 DI 그래프를 만든다(HTTP 서버는 없음).
- 토큰 기반 DI 덕분에 대역 교체가 한 줄이다(§3). 교체 대상은 **외부 경계**(결제, 메일, 시간)에 한정한다 → Part 12 §9, §13.
- 요청 스코프 프로바이더는 `get()`이 아니라 `resolve()`로 꺼낸다. `afterEach`/`afterAll`에서 `moduleRef.close()` / `app.close()`를 호출하지 않으면 열린 핸들 때문에 Jest가 종료되지 않는다.

#### 19.2 E2E 테스트(supertest)

```ts
app = moduleRef.createNestApplication();
setupApp(app);            // main.ts와 같은 전역 설정을 공유 함수로 적용
await app.init();
await request(app.getHttpServer()).get('/projects').expect(200);
```

- `createNestApplication()` + `app.init()`으로 실제 파이프라인(미들웨어~필터)을 통과시킨다. **함정**: 테스트는 `main.ts`를 실행하지 않는다. `main.ts`의 전역 파이프·필터·prefix·버저닝이 테스트에는 없다. → `NestFactory.create` 이후 `listen` 전의 설정을 `setupApp(app)` 함수로 빼서 양쪽에서 호출한다.
- 앱 부팅은 비싸므로 `beforeAll`에서 한 번 만들고, 테스트마다 **상태**(테이블, 목)만 초기화한다.

> 📖 원문: 31-testing §3~§5, §9, "Common mistakes"

### 20. API 문서(OpenAPI)와 버저닝

#### 20.1 `@nestjs/swagger`

```ts
const config = new DocumentBuilder().setTitle('SaaS API').setVersion('1.0').addBearerAuth().build();
SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
```

- 컨트롤러와 DTO 메타데이터에서 명세를 **생성**한다. 코드와 문서가 어긋날 위험이 낮다.
- 대표 함정: DTO 속성에 `@ApiProperty()`가 없으면 스키마가 **빈 객체**로 나온다(경고 없음). CLI 플러그인으로 자동화할 수 있다.
- `@ApiExcludeEndpoint()`나 `writeOnly`는 **문서 표시일 뿐 보안이 아니다.** 실제 차단은 가드와 직렬화로 한다.
- 운영에서 문서 UI 공개 여부를 결정하고, 공개한다면 보호한다(보충). OpenAPI 설계 원칙은 → Part 5 §20 참조.

#### 20.2 버저닝

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });  // /v1/projects
@Controller({ path: 'projects', version: '2' })
```

- 방식: URI(`/v1/...`, 가장 흔함), Header, Media Type(Accept), Custom. 기존 앱에 버저닝을 켜면 버전을 선언하지 않은 라우트가 **모두 404**가 된다 → `defaultVersion`을 지정하거나 `VERSION_NEUTRAL`로 표시.
- 버전 정책(하위 호환, 폐기 절차)은 → Part 5 §19, Part 7 §17 참조.

> 📖 원문: 29-openapi-fundamentals §1～§2, "Common mistakes", 33-mvc-and-versioning §9～§11

### 21. 운영: 성능과 헬스체크

#### 21.1 요청 시간은 어디서 쓰이나

- 보통 **핸들러 + I/O**가 대부분이고, 직렬화(`ClassSerializerInterceptor`)가 흔히 두 번째다. `ValidationPipe`는 본문 깊이·배열 길이에 비례하고, 가드는 싸지만 안에서 DB/원격 호출을 하면 비싸진다.
- HTTP 파싱·라우팅은 아주 작은 부분이고, Fastify로 바꾸는 것은 이 가장 작은 칸만 줄인다. 먼저 **요청 스코프 남용(§4), 무거운 가드, N+1 쿼리, 큰 응답**을 점검한다.
- CPU 무거운 작업은 이벤트 루프를 막는다 → 큐나 worker로 분리(→ Part 2 §12).

#### 21.2 헬스체크(`@nestjs/terminus`)

| 프로브 | 질문 | 실패 시 | 검사 대상 |
|--------|------|---------|-----------|
| Liveness | 프로세스가 회복 불가능하게 망가졌나? | **재시작** | 프로세스 자체만 (DB 검사 금지) |
| Readiness | 지금 트래픽을 받아도 되나? | LB에서 제외(재시작 안 함) | 필요한 DB·캐시, 워밍업 상태 |
| Startup | 부팅이 끝났나? | 일정 시간 후 재시작 | 넉넉한 시간으로 liveness와 같은 검사 |

- 규칙: **"재시작으로 고칠 수 없는 것은 liveness에 넣지 않는다."** DB 검사를 liveness에 넣으면 DB가 잠깐 느려질 때 전체 파드가 재시작 루프에 빠진다.
- Terminus는 종료 훅과 연동되므로 `enableShutdownHooks()`가 필요하다(§17).
- 헬스체크 경로는 전역 인증 가드에서 제외(`@Public()`)하되 상세 정보는 노출하지 않는다. (보충)
- 운영 안정성 패턴(타임아웃, 서킷 브레이커, 부하 차단)은 → Part 11 §3~§4, §9 참조. Nest에서 요청 타임아웃은 인터셉터의 RxJS `timeout` 연산자로 구현한다(12-interceptors).

> 📖 원문: 55-performance-and-compilation "Where a Nest request's time actually goes", "Fastify", "Where Nest actually costs you", 56-observability "Terminus", "Liveness, readiness, and startup probes"

### 22. 고급 기능: "언제 필요한가"만 알아 두기

처음부터 쓸 필요는 없다. 필요해지는 신호를 알아 두는 것이 목적이다.

| 기능 | 정체 | 필요해지는 신호 | 주의점 |
|------|------|-----------------|--------|
| 마이크로서비스 (`@nestjs/microservices`) | HTTP가 아닌 전송 계층(TCP, Redis, NATS, Kafka, RabbitMQ)을 쓰는 Nest 앱. DI·파이프라인은 동일 | 다른 서비스와 메시지로 통신해야 할 때 | 전달 보장·순서·영속성은 **브로커의 성질**이지 Nest가 보장하지 않는다. `@MessagePattern`은 컨트롤러에만 둔다 |
| CQRS (`@nestjs/cqrs`) | 명령(상태 변경)과 조회(데이터 읽기) 모델 분리 | 읽기/쓰기 규모 차이가 수십 배, 여러 엔티티에 걸친 불변식, 의도의 감사 로그, 읽기 모델이 다른 저장소 | 먼저 ①유스케이스별 서비스 분리 ②인프로세스 이벤트 ③읽기용 뷰 ④큐를 시도. 개념은 → Part 4 §8 |
| WebSocket (`@WebSocketGateway`) | 한 연결로 양방향 다수 메시지 | 실시간 알림, 협업 편집, 대시보드 | 다중 인스턴스 시 sticky session/어댑터 필요, 연결 수·백프레셔 관리, 핸드셰이크 인증 |
| GraphQL (`@nestjs/graphql`) | 클라이언트가 응답 모양을 지정 | 이질적인 클라이언트가 많고 그래프형 도메인 | N+1(DataLoader 필수), 쿼리 비용 제한, 에러가 200으로 옴, HTTP 캐시 어려움. REST와 한 앱에서 공존 가능 |

- 이벤트 기반·마이크로서비스 아키텍처 선택은 → Part 3 §12~§14, 메시징 기본은 → Part 2 §14 참조.

> 📖 원문: 45-microservices-fundamentals "What Nest means by microservice", 53-cqrs "What CQRS actually separates", 44-websockets "The model", "Scaling and operational limits", 50-graphql-fundamentals "GraphQL versus REST, honestly"

### ✅ 이 부 핵심 체크리스트

- [ ] NestJS가 DI 컨테이너 + 고정된 요청 파이프라인 + 플랫폼 어댑터(Express/Fastify)로 이루어져 있음을 설명할 수 있다.
- [ ] 모듈 캡슐화 규칙(자기 providers + import한 모듈의 exports만 주입)을 알고, 같은 프로바이더를 두 모듈에 중복 등록하지 않는다. `@Global()`과 `forwardRef()`는 예외적으로만 쓴다.
- [ ] `forRoot`(앱당 한 번) / `forFeature` / `register` / `*Async`의 의미를 구분하고, 시크릿은 `*Async` + `ConfigService`로 주입한다.
- [ ] 인터페이스는 DI 토큰이 될 수 없음을 알고, 추상 클래스나 Symbol 토큰을 쓴다. `useClass`/`useValue`/`useFactory`/`useExisting`을 상황에 맞게 고른다.
- [ ] 싱글턴 필드에 요청 데이터를 저장하지 않는다. `REQUEST` 스코프의 버블링 비용을 알고, 요청 컨텍스트는 AsyncLocalStorage(nestjs-cls)로 전파한다.
- [ ] Middleware → Guard → Interceptor → Pipe → Handler → Interceptor → Filter 순서를 외우고, 인증·인가는 Guard, 응답 가공은 Interceptor, 검증은 Pipe, 에러 모양은 Filter에 둔다. 전역 등록은 `APP_*` 토큰으로 한다.
- [ ] 전역 `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`로 대량 할당을 막고, 중첩 DTO는 `@ValidateNested` + `@Type`으로 검증한다.
- [ ] 응답은 직렬화(`@Exclude`, 인스턴스 반환) 또는 명시적 응답 DTO로 민감 필드 노출을 막는다. 일반 객체에는 `@Exclude`가 동작하지 않음을 안다.
- [ ] 전역 예외 필터로 에러 응답을 통일하고 500의 내부 정보를 숨긴다. 메서드 레벨 필터가 전역 필터를 가린다는 것을 안다.
- [ ] 전역 인증 Guard + `@Public()`으로 "기본 잠금"을 만들고, 소유권(인스턴스 수준) 검사는 서비스에서 한다.
- [ ] `synchronize: true`를 운영에서 쓰지 않고 마이그레이션을 쓴다. 트랜잭션 안의 모든 쓰기는 같은 manager로 한다.
- [ ] 다중 인스턴스에서 크론 중복·인메모리 rate limit/캐시 불일치가 생김을 알고, 큐 핸들러는 멱등하게 만든다. `enableShutdownHooks()`와 liveness/readiness 분리로 무중단 배포를 준비한다.
