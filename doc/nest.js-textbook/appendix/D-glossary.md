---
title: "부록 D. Glossary (한/영 대역)"
parent: "NestJS 부록 (Appendix)"
grand_parent: "NestJS Complete Guide"
nav_order: 1068
appendix: "D"
kind: reference
nest_baseline: "11.x"
---

# Appendix D — Glossary (한/영 대역)

이 부록은 본문 59개 장에서 사용한 용어를 영어 표제어 기준 A–Z 순으로 정리한 대역 사전입니다. 각 항목은 **영어 용어 · 한국어 표기**, 2~4문장의 한국어 정의, 그리고 그 용어를 실제로 배우는 장으로 가는 링크로 구성되어 있습니다.

사용법은 세 가지입니다. 첫째, 본문을 읽다가 모르는 단어를 만나면 여기서 뜻만 빠르게 확인하고 다시 본문으로 돌아가십시오. 둘째, 어떤 주제를 어느 장에서 다루는지 모를 때 이 부록을 색인처럼 사용하십시오 — 모든 항목에 `→` 링크가 붙어 있습니다. 셋째, 팀에서 한국어로 설계를 논의할 때 영어 원어와 한국어 표기를 함께 확인하는 용도로 쓰십시오. 한국어 번역어가 관행적으로 굳어지지 않은 용어(예: Provider, Guard, Interceptor)는 음차 표기를 병기했고, 실무에서는 영어 원어를 그대로 쓰는 편이 오해가 적습니다.

정의는 "이것이 무엇인가"보다 "Nest 안에서 이것이 어떤 역할을 하는가"에 초점을 맞췄습니다. 따라서 일반적인 컴퓨터 과학 정의와 미묘하게 다를 수 있으며, 그것이 의도된 바입니다. 기준 버전은 **NestJS 11.x**이고, Express 5·Node 20+·TypeScript 5.x를 전제로 합니다.

---

## A

### Adapter · 어댑터
Nest 코어가 특정 HTTP 라이브러리에 직접 의존하지 않도록 감싸주는 얇은 호환 계층입니다. `ExpressAdapter`와 `FastifyAdapter`가 기본 제공되며, 둘 다 `AbstractHttpAdapter`를 구현하기 때문에 컨트롤러 코드를 바꾸지 않고 플랫폼을 교체할 수 있습니다. WebSocket 쪽에도 같은 개념의 `WsAdapter`, `IoAdapter`가 있습니다. 어댑터는 Nest의 "플랫폼 비종속성"을 실제로 구현하는 장치입니다.
→ [Ch. 57 Advanced HTTP](../part3-advanced/57-advanced-http.md)

### Aggregate Root · 애그리게이트 루트
DDD에서 하나의 트랜잭션 경계 안에서 일관성이 보장되어야 하는 객체 묶음의 진입점입니다. CQRS와 이벤트 소싱에서는 애그리게이트 루트가 커맨드를 받아 도메인 이벤트를 발생시키고, 그 이벤트 목록을 재생해 자신의 상태를 복원합니다. Nest의 `AggregateRoot` 클래스는 `apply()`와 `commit()`을 제공해 이 패턴을 구현하도록 돕습니다.
→ [Ch. 53 CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md)

### Argon2 · 아르곤2
비밀번호 해싱에 사용하는 메모리 하드(memory-hard) 알고리즘으로, GPU 병렬 공격에 bcrypt보다 강합니다. 신규 프로젝트라면 `argon2id` 변형을 기본값으로 삼고 메모리·반복 횟수·병렬도를 서버 사양에 맞춰 조정하는 것을 권장합니다. 기존 bcrypt 해시가 있다면 로그인 성공 시점에 조용히 재해싱하는 방식으로 점진 이행할 수 있습니다.
→ [Ch. 26 Hardening the Application](../part2-intermediate/26-web-security-hardening.md)

### ArgumentsHost · 아규먼트 호스트
현재 처리 중인 요청의 "원본 인자 배열"을 추상화한 객체입니다. HTTP에서는 `[request, response, next]`, WebSocket에서는 `[client, data]`, RPC에서는 `[data, context]`가 담기며, `host.getType()`으로 어떤 컨텍스트인지 판별한 뒤 `switchToHttp()` 같은 메서드로 타입이 붙은 접근자를 얻습니다. 예외 필터가 받는 두 번째 인자가 바로 이것입니다.
→ [Ch. 40 Execution Context and Platform Agnosticism](../part3-advanced/40-execution-context.md)

### Async Provider · 비동기 프로바이더
`useFactory`가 `Promise`를 반환하는 프로바이더로, 부트스트랩이 그 Promise가 resolve될 때까지 기다립니다. 데이터베이스 연결이나 원격 설정 로딩처럼 애플리케이션이 요청을 받기 전에 반드시 완료되어야 하는 초기화에 사용합니다. 주의할 점은 이 대기가 모듈 초기화를 직렬화한다는 것이며, 느린 팩토리 하나가 전체 기동 시간을 지배할 수 있습니다.
→ [Ch. 36 Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md)

### AsyncLocalStorage · 비동기 로컬 스토리지
Node의 `node:async_hooks`가 제공하는 API로, 비동기 호출 체인 전체에 걸쳐 유지되는 저장 공간을 만듭니다. 요청 ID, 사용자 정보, 테넌트 식별자를 함수 인자로 계속 넘기지 않고도 어디서든 읽을 수 있게 해 줍니다. Nest에서는 request-scoped 프로바이더의 성능 비용을 피하면서 요청 컨텍스트를 전파하는 가장 실용적인 수단입니다.
→ [Ch. 43 AsyncLocalStorage and Request Context Propagation](../part3-advanced/43-async-local-storage.md)

### Authentication · 인증
"당신이 누구인가"를 확인하는 절차입니다. Nest에서는 보통 Passport 전략이나 직접 만든 가드가 자격 증명을 검증하고, 성공하면 `request.user`에 주체 정보를 붙입니다. 인증은 요청 처리 파이프라인의 앞쪽에서 한 번만 일어나야 하며, 서비스 계층까지 내려가면 안 됩니다.
→ [Ch. 23 Authentication: Sessions, JWT, and Passport](../part2-intermediate/23-authentication.md)

### Authorization · 인가
"당신이 이 일을 해도 되는가"를 판단하는 절차이며, 인증 다음 단계입니다. 역할 기반(RBAC), 속성 기반(ABAC), 정책 기반 방식이 있고 Nest에서는 가드와 `Reflector`를 조합해 구현합니다. 인증과 인가를 한 가드에 섞어 넣으면 나중에 규칙이 늘어날 때 손댈 수 없게 되므로 분리하십시오.
→ [Ch. 25 Authorization: RBAC, Claims, and CASL](../part2-intermediate/25-authorization.md)

---

## B

### Backpressure · 백프레셔
생산자가 소비자보다 빠를 때 데이터가 메모리에 쌓이는 것을 막기 위해 흐름을 늦추는 메커니즘입니다. Node 스트림에서는 `write()`가 `false`를 반환하면 `drain` 이벤트까지 멈추는 방식으로 구현되며, `pipe()`나 `pipeline()`은 이를 자동으로 처리합니다. 파일 응답을 버퍼로 다 읽어 반환하는 코드는 백프레셔를 무시하는 대표적인 실수입니다.
→ [Ch. 28 File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md)

### Barrel File · 배럴 파일
디렉터리의 공개 API를 한곳에 모아 re-export 하는 `index.ts` 파일입니다. import 경로를 짧게 만들어 주지만, 서로 다른 모듈이 같은 배럴을 거쳐 참조하면 순환 의존성이 숨겨지고 트리 셰이킹이 나빠집니다. 라이브러리 경계에서는 유용하고, 모듈 내부에서는 대체로 해롭습니다.
→ [Ch. 6 Modules](../part1-beginner/06-modules.md)

### Bootstrap · 부트스트랩
`NestFactory.create()`부터 `app.listen()`까지, 모듈 그래프를 스캔하고 프로바이더를 인스턴스화해 서버를 띄우는 시작 절차입니다. 이 시점에 데코레이터 메타데이터가 읽히고, 의존성이 위상 정렬 순서로 해결되며, 전역 파이프·필터·가드가 등록됩니다. 부트스트랩이 끝난 뒤에는 모듈 그래프가 사실상 고정된다는 점이 Nest 설계의 핵심 전제입니다.
→ [Ch. 1 What NestJS Is](../part1-beginner/01-what-is-nestjs.md)

### Broker · 브로커
프로듀서와 컨슈머 사이에서 메시지를 중계·보관하는 미들웨어 서버입니다. Redis, RabbitMQ, NATS, Kafka가 대표적이며 각각 전달 보장, 순서 보장, 보존 기간의 성격이 다릅니다. 브로커를 고르는 일은 곧 "메시지를 잃어도 되는가, 순서가 중요한가, 다시 읽어야 하는가"를 결정하는 일입니다.
→ [Ch. 46 Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md)

### BullMQ · 불엠큐
Redis 기반의 Node 작업 큐 라이브러리이며, `@nestjs/bullmq` 패키지로 Nest에 통합됩니다. 지연 실행, 재시도와 백오프, 우선순위, 반복 작업, 플로우(부모-자식 잡)를 지원합니다. 구버전 `bull`과 API가 다르므로 v11 프로젝트에서는 BullMQ를 기준으로 삼으십시오.
→ [Ch. 35 Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md)

---

## C

### Cache-aside · 캐시 어사이드
읽을 때 캐시를 먼저 조회하고, 없으면 원본에서 읽어 캐시에 채워 넣는 가장 흔한 캐싱 패턴입니다. 쓰기 시에는 캐시를 갱신하지 않고 무효화만 하는 편이 정합성 관리가 쉽습니다. 동일 키에 대한 동시 미스가 원본을 동시에 때리는 캐시 스탬피드를 막으려면 짧은 잠금이나 요청 병합이 필요합니다.
→ [Ch. 27 Caching](../part2-intermediate/27-caching.md)

### CacheInterceptor · 캐시 인터셉터
`@nestjs/cache-manager`가 제공하는 인터셉터로, GET 라우트의 응답을 자동으로 캐싱합니다. 기본 키는 요청 URL이며 `@CacheKey()`와 `@CacheTTL()`로 재정의할 수 있습니다. 사용자별로 응답이 달라지는 엔드포인트에 무심코 붙이면 다른 사용자의 데이터가 노출되므로, 키에 주체를 포함시키거나 아예 붙이지 마십시오.
→ [Ch. 27 Caching](../part2-intermediate/27-caching.md)

### CASL · 캐슬
자바스크립트용 동형(isomorphic) 권한 라이브러리로, "누가 어떤 액션을 어떤 대상(subject)에 할 수 있는가"를 능력(ability) 객체로 표현합니다. 조건부 규칙을 지원하기 때문에 "자기 글만 수정 가능" 같은 인스턴스 수준 권한을 자연스럽게 다룹니다. Nest에서는 `CaslAbilityFactory`를 프로바이더로 만들고 정책 가드에서 소비하는 구조가 표준입니다.
→ [Ch. 25 Authorization: RBAC, Claims, and CASL](../part2-intermediate/25-authorization.md)

### Circular Dependency · 순환 의존성
두 모듈 또는 두 프로바이더가 서로를 참조해 DI 컨테이너가 인스턴스화 순서를 정하지 못하는 상태입니다. `forwardRef()`로 해결할 수 있지만 그것은 응급처치이며, 대개는 공통 관심사를 제3의 모듈로 분리하는 것이 옳은 답입니다. `undefined` 의존성이 주입되는 런타임 오류의 가장 흔한 원인입니다.
→ [Ch. 41 ModuleRef, DiscoveryService, Lazy Loading, and Circular Dependencies](../part3-advanced/41-module-ref-discovery-lazy.md)

### ClassSerializerInterceptor · 클래스 시리얼라이저 인터셉터
컨트롤러가 반환한 클래스 인스턴스를 `class-transformer`의 `instanceToPlain()`으로 변환해 응답에 싣는 내장 인터셉터입니다. `@Exclude()`, `@Expose()`, `@Transform()` 데코레이터가 이때 적용됩니다. 반환값이 평범한 객체 리터럴이면 아무 일도 일어나지 않으므로, 엔티티 클래스 인스턴스를 그대로 반환해야 효과가 있습니다.
→ [Ch. 16 Serialization](../part2-intermediate/16-serialization.md)

### class-transformer · 클래스 트랜스포머
평범한 객체와 클래스 인스턴스를 상호 변환하는 라이브러리입니다. `plainToInstance()`는 JSON 본문을 DTO 인스턴스로 바꿔 검증을 가능하게 하고, `instanceToPlain()`은 그 반대 방향으로 직렬화합니다. `ValidationPipe`의 `transform: true` 옵션이 내부적으로 이 라이브러리를 사용합니다.
→ [Ch. 15 Validation in Depth](../part2-intermediate/15-validation-in-depth.md)

### class-validator · 클래스 밸리데이터
데코레이터로 선언한 제약 조건을 런타임에 검사하는 검증 라이브러리입니다. `@IsString()`, `@IsEmail()`, `@Min()` 같은 데코레이터를 DTO 속성에 붙이면 `ValidationPipe`가 이를 읽어 검증합니다. 커스텀 규칙은 `@ValidatorConstraint()` 클래스로 만들 수 있고, 이 클래스는 DI를 통해 서비스를 주입받을 수도 있습니다.
→ [Ch. 15 Validation in Depth](../part2-intermediate/15-validation-in-depth.md)

### Client Proxy · 클라이언트 프록시
마이크로서비스 클라이언트 측 추상화로, `send()`는 요청-응답을, `emit()`은 단방향 이벤트를 보냅니다. `ClientsModule.register()`나 `ClientProxyFactory`로 생성하며 내부적으로 선택한 트랜스포터를 감쌉니다. `send()`가 반환하는 Observable은 구독해야 실제로 전송되며, 이를 잊는 것이 초보자의 단골 실수입니다.
→ [Ch. 45 Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md)

### Code First · 코드 퍼스트
TypeScript 클래스와 데코레이터로 GraphQL 타입을 정의하고, 스키마 파일(SDL)은 그로부터 자동 생성하는 방식입니다. 타입 안전성과 리팩터링 편의성이 뛰어나 대부분의 Nest 프로젝트에 권장됩니다. 단점은 SDL이 빌드 산출물이라 프론트엔드 팀과 스키마를 먼저 합의하는 워크플로에는 덜 맞는다는 점입니다.
→ [Ch. 50 GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md)

### Cold Start · 콜드 스타트
서버리스 환경에서 새 실행 인스턴스가 만들어질 때 런타임 초기화와 애플리케이션 부트스트랩에 드는 추가 지연입니다. Nest는 부트스트랩 시 전체 모듈 그래프를 스캔하므로 이 비용이 무시할 수 없으며, 지연 로딩과 번들 최소화, 인스턴스 캐싱으로 완화합니다. 핸들러 밖에 앱 인스턴스를 캐시해 두는 패턴이 사실상 필수입니다.
→ [Ch. 58 Deployment and Serverless](../part3-advanced/58-deployment-and-serverless.md)

### Command Bus · 커맨드 버스
CQRS에서 "무언가를 바꿔라"는 의도를 담은 커맨드 객체를 받아 정확히 하나의 핸들러에게 전달하는 디스패처입니다. `CommandBus.execute()`로 실행하며 핸들러는 `@CommandHandler()`로 등록합니다. 이벤트 버스와 달리 핸들러가 반드시 하나여야 하고, 실패는 호출자에게 전파됩니다.
→ [Ch. 53 CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md)

### Compression · 압축
응답 본문을 gzip이나 brotli로 압축해 전송량을 줄이는 기능이며 `compression` 미들웨어로 켭니다. 리버스 프록시(nginx, CDN)가 이미 압축한다면 애플리케이션에서 중복으로 하지 마십시오. SSE나 스트리밍 응답에서는 버퍼링 때문에 지연이 생길 수 있으므로 선택적으로 비활성화합니다.
→ [Ch. 32 HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md)

### ConfigModule · 설정 모듈
`@nestjs/config`가 제공하는 동적 모듈로, `.env` 파일과 환경 변수를 읽어 `ConfigService`로 노출합니다. `isGlobal`, `load`, `validationSchema`, `cache` 옵션을 통해 네임스페이스 설정, 기동 시 검증, 조회 성능을 제어합니다. `process.env`를 코드 곳곳에서 직접 읽지 않게 만드는 것이 이 모듈의 진짜 목적입니다.
→ [Ch. 17 Configuration and Environment Management](../part2-intermediate/17-configuration.md)

### ConfigurableModuleBuilder · 설정 가능 모듈 빌더
`register()`/`registerAsync()` 같은 동적 모듈 보일러플레이트를 자동 생성해 주는 빌더 클래스입니다. 옵션 타입만 제네릭으로 넘기면 옵션 토큰, 클래스 믹스인, 비동기 메서드가 만들어집니다. 직접 만든 라이브러리 모듈에서 반복 코드를 없애는 v9 이후의 표준 방법입니다.
→ [Ch. 37 Dynamic Modules and Configurable Module Builders](../part3-advanced/37-dynamic-modules.md)

### Consumer Group · 컨슈머 그룹
Kafka에서 같은 토픽을 협력해 소비하는 컨슈머들의 논리적 묶음입니다. 파티션은 그룹 내 하나의 컨슈머에게만 배정되므로, 그룹 내 병렬성의 상한은 파티션 수와 같습니다. `groupId`를 서비스마다 다르게 주면 각자 전체 스트림을 독립적으로 읽고, 같게 주면 부하를 나눠 갖습니다.
→ [Ch. 47 Microservices III: Kafka](../part3-advanced/47-kafka.md)

### Context Id · 컨텍스트 아이디
request-scoped 프로바이더의 인스턴스를 식별하기 위해 Nest가 요청마다 부여하는 키입니다. `ContextIdFactory.create()`로 직접 만들 수 있고, `moduleRef.resolve(Token, contextId)`에 넘기면 같은 요청 안에서 동일 인스턴스를 재사용합니다. `ContextIdFactory.registerRequest()`를 함께 쓰면 그 컨텍스트에서 `REQUEST` 주입도 동작합니다.
→ [Ch. 38 Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md)

### Controller · 컨트롤러
들어온 요청을 받아 적절한 핸들러 메서드로 라우팅하는 클래스이며 `@Controller()`로 표시합니다. 컨트롤러의 책임은 프로토콜 번역(경로·파라미터·상태 코드)까지이고, 비즈니스 로직은 프로바이더로 내려보내야 합니다. 컨트롤러가 길어지고 있다면 그것은 거의 언제나 서비스가 없다는 신호입니다.
→ [Ch. 3 Controllers I: Routing, Parameters, and the Request](../part1-beginner/03-controllers-routing.md)

### CORS · 교차 출처 리소스 공유
브라우저가 다른 출처의 리소스 요청을 허용할지 결정하는 규약이며, `app.enableCors()`로 설정합니다. `origin: true`나 와일드카드는 개발 편의를 위한 것이고, 쿠키를 쓰는 API라면 `credentials: true`와 명시적 출처 목록이 필수입니다. CORS는 서버를 보호하는 장치가 아니라 브라우저가 사용자를 보호하는 장치라는 점을 기억하십시오.
→ [Ch. 26 Hardening the Application](../part2-intermediate/26-web-security-hardening.md)

### Correlation Id · 상관 아이디
하나의 논리적 작업이 여러 서비스와 큐를 거치는 동안 로그를 이어 붙이기 위해 부여하는 식별자입니다. 게이트웨이에서 생성해 헤더나 메시지 메타데이터로 전파하고, 각 서비스는 로그의 모든 줄에 이를 포함시킵니다. Nest에서는 `AsyncLocalStorage`에 담아 두면 로거가 자동으로 찍게 만들 수 있습니다.
→ [Ch. 43 AsyncLocalStorage and Request Context Propagation](../part3-advanced/43-async-local-storage.md)

### CQRS · 명령 조회 책임 분리
상태를 바꾸는 커맨드 경로와 읽기만 하는 쿼리 경로를 분리하는 아키텍처 패턴입니다. `@nestjs/cqrs`는 CommandBus, QueryBus, EventBus와 사가를 제공합니다. 도메인이 단순하면 순수한 오버헤드이므로, 읽기·쓰기의 모델이 실제로 달라질 때만 도입하십시오.
→ [Ch. 53 CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md)

### Cron Expression · 크론 표현식
반복 작업의 실행 시각을 나타내는 문자열이며 `@Cron()` 데코레이터에 전달합니다. Nest는 초 단위 필드를 포함한 6필드 형식을 지원하고 `CronExpression` 열거형으로 흔한 패턴을 제공합니다. 여러 인스턴스로 배포된 앱에서는 같은 잡이 중복 실행되므로 분산 잠금이나 리더 선출이 필요합니다.
→ [Ch. 34 Task Scheduling and In-Process Events](../part2-intermediate/34-scheduling-and-events.md)

### CSRF · 사이트 간 요청 위조
로그인한 사용자의 브라우저가 자동으로 보내는 쿠키를 이용해 공격자가 의도하지 않은 요청을 만들게 하는 공격입니다. 방어는 `SameSite` 쿠키 속성, 토큰 기반 방어(`csrf-csrf` 등), Origin 헤더 검증을 조합합니다. 인증 토큰을 쿠키가 아니라 Authorization 헤더로만 보내는 API는 구조적으로 CSRF에 노출되지 않습니다.
→ [Ch. 26 Hardening the Application](../part2-intermediate/26-web-security-hardening.md)

### Custom Decorator · 커스텀 데코레이터
`createParamDecorator()`나 `SetMetadata()`로 만드는 사용자 정의 데코레이터입니다. 전자는 핸들러 인자를 추출하고(`@CurrentUser()`), 후자는 가드나 인터셉터가 `Reflector`로 읽을 메타데이터를 붙입니다. `applyDecorators()`로 여러 개를 하나로 합치면 반복되는 데코레이터 스택을 의미 있는 이름 하나로 줄일 수 있습니다.
→ [Ch. 13 Custom Decorators and the Complete Request Lifecycle](../part1-beginner/13-custom-decorators-and-lifecycle.md)

### Custom Provider · 커스텀 프로바이더
`useValue`, `useClass`, `useFactory`, `useExisting` 중 하나로 정의해 토큰과 값의 연결을 직접 지정하는 프로바이더입니다. 클래스가 아닌 값(설정 객체, 서드파티 클라이언트)을 주입하거나, 환경에 따라 구현을 바꿔 끼울 때 사용합니다. 축약형 `Provide as class` 문법도 내부적으로는 `useClass` 커스텀 프로바이더로 변환됩니다.
→ [Ch. 36 Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md)

### Custom Transporter · 커스텀 트랜스포터
내장 트랜스포터가 지원하지 않는 프로토콜을 위해 직접 구현하는 통신 계층입니다. 서버 쪽은 `Server`를 상속해 `listen()`과 `close()`를 구현하고, 클라이언트 쪽은 `ClientProxy`를 상속해 `publish()`와 `dispatchEvent()`를 구현합니다. 직렬화·역직렬화는 `Serializer`/`Deserializer` 인터페이스로 따로 갈아 끼울 수 있습니다.
→ [Ch. 49 Microservices V: Writing a Custom Transporter](../part3-advanced/49-custom-transporters.md)

---

## D

### DataLoader · 데이터로더
같은 이벤트 루프 틱에서 발생한 개별 조회 요청을 모아 한 번의 배치 질의로 처리하고 결과를 캐싱하는 유틸리티입니다. GraphQL 리졸버의 N+1 문제를 해결하는 표준 도구이며, 캐시가 요청 범위여야 하므로 request-scoped 프로바이더나 컨텍스트 객체에 담습니다. 싱글턴으로 만들면 사용자 간 데이터가 섞이는 심각한 버그가 됩니다.
→ [Ch. 52 GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md)

### Dead Letter Queue · 데드 레터 큐
정해진 횟수만큼 재시도해도 처리에 실패한 메시지를 격리해 보관하는 별도의 큐입니다. 실패한 메시지가 큐 앞을 막거나 무한히 재시도되는 것을 막고, 사람이 원인을 조사할 시간을 벌어 줍니다. DLQ에 쌓이는 속도를 알람으로 감시하지 않으면 조용한 데이터 유실과 다를 바 없습니다.
→ [Ch. 35 Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md)

### Decorator · 데코레이터
클래스, 메서드, 속성, 파라미터에 메타데이터를 붙이는 TypeScript 문법입니다. Nest는 이 메타데이터를 `reflect-metadata`로 읽어 라우팅 테이블과 의존성 그래프를 구성합니다. 데코레이터 자체는 아무 동작도 하지 않는 "표시"일 뿐이며, 실제 일은 부트스트랩 시 Nest가 합니다.
→ [Ch. 1 What NestJS Is](../part1-beginner/01-what-is-nestjs.md)

### Dependency Injection · 의존성 주입
객체가 필요한 협력자를 스스로 만들지 않고 외부에서 받도록 하는 설계 기법입니다. Nest는 생성자 파라미터의 타입 메타데이터를 읽어 토큰을 찾고, 해당 모듈 스코프에서 인스턴스를 해결해 넣어 줍니다. 테스트에서 구현을 교체할 수 있게 되는 것이 실질적으로 가장 큰 이득입니다.
→ [Ch. 7 Dependency Injection](../part1-beginner/07-dependency-injection-basics.md)

### Devtools · 데브툴즈
`@nestjs/devtools-integration`이 제공하는 도구로, 실행 중인 애플리케이션의 모듈 그래프와 의존성 관계를 시각화합니다. 순환 참조, 예상치 못한 전역 모듈, 불필요하게 넓은 export를 눈으로 찾는 데 유용합니다. 프로덕션에는 절대 켜지 말고 개발 환경 플래그로만 활성화하십시오.
→ [Ch. 56 Observability](../part3-advanced/56-observability.md)

### DiscoveryService · 디스커버리 서비스
`@nestjs/core`가 제공하는 서비스로, 애플리케이션에 등록된 모든 프로바이더와 컨트롤러를 런타임에 열거합니다. 특정 데코레이터가 붙은 클래스나 메서드를 찾아 자동 등록하는 플러그인형 기능을 만들 때 사용합니다. `MetadataScanner`와 함께 쓰면 메서드 수준 메타데이터까지 훑을 수 있습니다.
→ [Ch. 41 ModuleRef, DiscoveryService, Lazy Loading](../part3-advanced/41-module-ref-discovery-lazy.md)

### DTO · 데이터 전송 객체
계층 경계를 넘나드는 데이터의 모양을 정의하는 객체입니다. Nest에서는 인터페이스가 아니라 **클래스**로 정의해야 하는데, 인터페이스는 컴파일 후 사라져 런타임 검증과 변환이 불가능하기 때문입니다. 요청 DTO와 응답 DTO를 구분하고, 엔티티를 그대로 노출하지 마십시오.
→ [Ch. 4 Controllers II: Responses, Status Codes, DTOs, and Async](../part1-beginner/04-controllers-responses.md)

### Durable Provider · 듀러블 프로바이더
request-scoped 프로바이더 중 요청마다가 아니라 "구독자(테넌트) 단위"로 인스턴스를 재사용하도록 표시한 프로바이더입니다. `{ scope: Scope.REQUEST, durable: true }`로 선언하고, 커스텀 `ContextIdStrategy`가 어떤 요청이 어떤 컨텍스트에 속하는지 결정합니다. 멀티테넌시에서 request-scope의 성능 손실을 줄이는 거의 유일한 정석 해법입니다.
→ [Ch. 38 Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md)

### Dynamic Module · 동적 모듈
정적 메타데이터 대신 런타임에 계산된 모듈 정의를 반환하는 모듈입니다. 관례적으로 `register()`, `forRoot()`, `forFeature()` 정적 메서드를 노출하며 각각 일회성 설정, 전역 설정, 기능별 설정을 뜻합니다. 반환 객체에 `module` 속성이 반드시 있어야 하고, 재사용을 위해서는 `global: true` 사용에 신중해야 합니다.
→ [Ch. 37 Dynamic Modules and Configurable Module Builders](../part3-advanced/37-dynamic-modules.md)

---

## E

### Entity · 엔티티
데이터베이스 테이블(또는 컬렉션)에 대응하는 클래스이며, TypeORM에서는 `@Entity()`로 표시합니다. 식별자를 가지며 속성 값이 바뀌어도 동일성이 유지된다는 점에서 값 객체와 구분됩니다. 엔티티를 API 응답으로 그대로 내보내면 스키마 변경이 곧 API 파괴가 되므로 DTO로 감싸십시오.
→ [Ch. 19 SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md)

### Event Pattern · 이벤트 패턴
마이크로서비스에서 응답을 기대하지 않는 단방향 메시지를 식별하는 값이며 `@EventPattern()`으로 구독합니다. 클라이언트는 `emit()`으로 보내고, 핸들러가 던진 예외는 호출자에게 전파되지 않습니다. "일어난 사실"을 과거형으로 이름 붙이는 것이 좋은 관행입니다(`order.created`).
→ [Ch. 45 Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md)

### Event Sourcing · 이벤트 소싱
현재 상태를 저장하는 대신 상태를 만든 이벤트의 순서열을 저장하고, 필요할 때 재생해 상태를 복원하는 방식입니다. 완전한 감사 로그와 시점 복원을 공짜로 얻지만 조회가 어려워져 별도의 읽기 모델(프로젝션)이 필요합니다. 스키마가 아니라 이벤트가 계약이므로 이벤트 버저닝 전략을 처음부터 정해야 합니다.
→ [Ch. 53 CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md)

### EventEmitter2 · 이벤트 이미터
`@nestjs/event-emitter`가 감싸는 인프로세스 이벤트 버스로, 와일드카드 이벤트 이름과 비동기 리스너를 지원합니다. `@OnEvent('order.*')`로 구독하고 `eventEmitter.emit()`으로 발행합니다. 같은 프로세스 안에서만 동작하므로 인스턴스가 여러 개면 전달되지 않는다는 점을 잊지 마십시오.
→ [Ch. 34 Task Scheduling and In-Process Events](../part2-intermediate/34-scheduling-and-events.md)

### Exception Filter · 예외 필터
처리되지 않은 예외를 가로채 응답으로 변환하는 계층이며 `@Catch()`로 대상 예외 타입을 지정합니다. 기본 필터는 `HttpException`을 상태 코드와 JSON 본문으로 매핑하고 나머지는 500으로 처리합니다. 도메인 예외를 HTTP 상태로 번역하는 지점을 한곳에 모으는 것이 필터의 핵심 가치입니다.
→ [Ch. 9 Exception Filters and Error Handling](../part1-beginner/09-exception-filters.md)

### Execution Context · 실행 컨텍스트
`ArgumentsHost`를 확장해 `getClass()`와 `getHandler()`를 추가한 객체이며 가드, 인터셉터, 파이프가 받습니다. 이 두 메서드 덕분에 `Reflector`로 클래스·메서드에 붙은 메타데이터를 읽어 라우트별로 다르게 행동할 수 있습니다. 전송 방식과 무관하게 같은 코드를 재사용하게 해 주는 추상화입니다.
→ [Ch. 40 Execution Context and Platform Agnosticism](../part3-advanced/40-execution-context.md)

### Express Adapter · 익스프레스 어댑터
Nest의 기본 HTTP 어댑터이며 v11부터 Express 5를 사용합니다. Express 5는 경로 매칭 문법이 달라져 `*`가 `*splat` 형태를 요구하고, 비동기 핸들러의 오류 처리 동작도 바뀌었습니다. 기존 v10 프로젝트를 올릴 때 가장 많이 깨지는 부분이므로 와일드카드 라우트를 먼저 점검하십시오.
→ [Ch. 55 Performance: Fastify, SWC, and Build Pipelines](../part3-advanced/55-performance-and-compilation.md)

---

## F

### Fastify · 패스티파이
Express보다 빠른 Node HTTP 프레임워크이며 `@nestjs/platform-fastify`로 사용합니다. JSON 직렬화와 라우팅이 최적화되어 처리량이 눈에 띄게 높지만, 미들웨어 생태계와 `res` 객체 API가 달라 일부 서드파티 코드가 동작하지 않습니다. 순수 JSON API에는 좋은 선택이고, Express 미들웨어에 깊이 의존하는 앱에는 위험한 선택입니다.
→ [Ch. 55 Performance: Fastify, SWC, and Build Pipelines](../part3-advanced/55-performance-and-compilation.md)

### Federation · 페더레이션
여러 GraphQL 서비스의 스키마를 하나의 슈퍼그래프로 합성하는 Apollo의 아키텍처입니다. 각 서브그래프는 `@key`로 엔티티의 식별자를 선언하고 `resolveReference`로 참조 해석을 제공합니다. 게이트웨이가 쿼리 계획을 세워 서브그래프를 호출하므로, 스키마 소유권을 팀별로 나눌 수 있습니다.
→ [Ch. 52 GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md)

### Field Middleware · 필드 미들웨어
GraphQL 필드가 해석되기 직전과 직후에 끼어드는 함수로, 값 변환·로깅·필드 수준 접근 제어에 사용합니다. `@Field({ middleware: [...] })`로 붙이거나 `buildSchemaOptions.fieldMiddleware`로 전역 적용합니다. 리졸버 전체가 아니라 개별 필드에만 작용한다는 점에서 인터셉터와 다릅니다.
→ [Ch. 52 GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md)

### FileInterceptor · 파일 인터셉터
`@nestjs/platform-express`가 Multer를 감싸 제공하는 인터셉터로, multipart 요청에서 파일을 추출합니다. `FilesInterceptor`, `FileFieldsInterceptor`, `AnyFilesInterceptor` 변형이 있고 `@UploadedFile()`로 결과를 받습니다. 크기·MIME 검증은 `ParseFilePipe`와 내장 밸리데이터로 파이프 단계에서 처리하는 것이 깔끔합니다.
→ [Ch. 28 File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md)

### forwardRef · 포워드 레퍼런스
순환 참조 때문에 아직 정의되지 않은 클래스를 지연 참조하기 위한 헬퍼입니다. 모듈 `imports`와 `@Inject()` 양쪽 모두에 감싸 주어야 동작합니다. 동작하게 만들 수는 있지만 설계 문제를 감추는 것이므로, 사용할 때마다 "이 두 모듈이 정말 서로를 알아야 하는가"를 되물으십시오.
→ [Ch. 41 ModuleRef, DiscoveryService, Lazy Loading](../part3-advanced/41-module-ref-discovery-lazy.md)

---

## G

### Gateway · 게이트웨이
WebSocket 연결을 다루는 클래스이며 `@WebSocketGateway()`로 표시합니다. `@SubscribeMessage()`로 이벤트를 구독하고, 가드·파이프·인터셉터·필터가 HTTP와 동일하게 동작합니다. 다만 예외는 `WsException`으로 표현되고 응답 상태 코드 개념이 없다는 점이 다릅니다.
→ [Ch. 44 WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md)

### Global Module · 전역 모듈
`@Global()`을 붙여 한 번만 import 하면 전체 애플리케이션에서 export가 보이게 되는 모듈입니다. 편리하지만 모듈 그래프에서 의존 관계가 사라져 무엇이 무엇을 쓰는지 추적할 수 없게 됩니다. 설정이나 로깅처럼 정말 어디서나 필요한 소수의 모듈에만 쓰십시오.
→ [Ch. 6 Modules](../part1-beginner/06-modules.md)

### Global Prefix · 전역 프리픽스
`app.setGlobalPrefix('api')`로 모든 라우트 앞에 붙이는 경로 조각입니다. `exclude` 옵션으로 헬스체크 같은 특정 경로를 제외할 수 있습니다. URI 버저닝과 함께 쓸 때 프리픽스와 버전의 결합 순서를 정확히 알아 두어야 경로가 예상과 달라지지 않습니다.
→ [Ch. 33 Server-Side Rendering (MVC) and API Versioning](../part2-intermediate/33-mvc-and-versioning.md)

### Graceful Shutdown · 우아한 종료
SIGTERM 같은 종료 신호를 받았을 때 새 요청을 거절하고 진행 중인 작업을 마친 뒤 연결을 정리하는 절차입니다. `app.enableShutdownHooks()`를 호출해야 `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown` 훅이 실행됩니다. 쿠버네티스 환경에서는 readiness를 먼저 실패시키고 몇 초 대기한 뒤 종료해야 트래픽 유실이 없습니다.
→ [Ch. 39 Lifecycle Events and Graceful Shutdown](../part3-advanced/39-lifecycle-and-shutdown.md)

### GraphQL · 그래프큐엘
클라이언트가 필요한 필드를 정확히 명시해 요청하는 API 질의 언어입니다. Nest는 `@nestjs/graphql`로 Apollo와 Mercurius 드라이버를 지원하며 코드 퍼스트와 스키마 퍼스트를 모두 제공합니다. 오버페칭을 없애 주지만 캐싱, 권한, 질의 복잡도 제어라는 새로운 문제를 가져옵니다.
→ [Ch. 50 GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md)

### gRPC · 지알피씨
Protocol Buffers로 계약을 정의하고 HTTP/2 위에서 동작하는 고성능 RPC 프레임워크입니다. 단항 호출뿐 아니라 서버·클라이언트·양방향 스트리밍을 지원하며 Nest에서는 `@GrpcMethod()`와 `@GrpcStreamMethod()`로 구현합니다. `.proto` 파일이 유일한 진실의 원천이므로 스키마 관리와 배포가 성패를 가릅니다.
→ [Ch. 48 Microservices IV: gRPC](../part3-advanced/48-grpc.md)

### Guard · 가드
요청을 계속 처리할지 여부를 `boolean`으로 결정하는 클래스이며 `CanActivate`를 구현합니다. 미들웨어 다음, 인터셉터·파이프보다 앞에서 실행되고 `ExecutionContext`를 받기 때문에 라우트 메타데이터를 읽을 수 있습니다. 인증·인가는 가드의 일이며, 데이터 형태 검증은 파이프의 일입니다.
→ [Ch. 11 Guards: Authorization at the Route Boundary](../part1-beginner/11-guards.md)

---

## H

### Health Indicator · 헬스 인디케이터
`@nestjs/terminus`에서 개별 의존성(데이터베이스, 디스크, 메모리, 외부 HTTP)의 상태를 검사하는 단위입니다. `HealthCheckService.check([...])`에 인디케이터 함수 배열을 넘겨 종합 결과를 만듭니다. 커스텀 인디케이터는 `HealthIndicatorService`로 결과 객체를 만들어 반환합니다.
→ [Ch. 56 Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md)

### Helmet · 헬멧
보안 관련 HTTP 응답 헤더를 한꺼번에 설정해 주는 미들웨어입니다. CSP, HSTS, `X-Content-Type-Options` 등을 기본값으로 켜 주며 필요에 따라 개별 조정합니다. GraphQL Playground나 Swagger UI가 CSP에 막히는 일이 잦으므로 개발 환경 예외를 명시적으로 두십시오.
→ [Ch. 26 Hardening the Application](../part2-intermediate/26-web-security-hardening.md)

### HttpException · HTTP 예외
Nest가 HTTP 응답으로 자동 변환하는 예외의 기반 클래스입니다. `NotFoundException`, `BadRequestException` 같은 내장 하위 클래스가 상태 코드를 담고 있고, `cause` 옵션으로 원인 오류를 보존할 수 있습니다. 서비스 계층에서 이 클래스를 던지면 HTTP에 결합되므로, 도메인 예외를 던지고 필터에서 매핑하는 편이 낫습니다.
→ [Ch. 9 Exception Filters and Error Handling](../part1-beginner/09-exception-filters.md)

### HttpModule · HTTP 모듈
`@nestjs/axios`가 제공하는 모듈로, Axios를 Observable 기반 `HttpService`로 감쌉니다. 타임아웃, 재시도, 인터셉터를 RxJS 연산자로 조합할 수 있고 `firstValueFrom()`으로 Promise 세계와 이어집니다. 타임아웃을 설정하지 않은 외부 호출은 장애 전파의 첫 번째 경로입니다.
→ [Ch. 32 HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md)

### Hybrid Application · 하이브리드 애플리케이션
HTTP 서버와 하나 이상의 마이크로서비스 리스너를 같은 프로세스에서 함께 실행하는 애플리케이션입니다. `app.connectMicroservice()`로 붙이고 `app.startAllMicroservices()`로 시작합니다. 전역 파이프·필터가 두 세계에 모두 적용되므로 HTTP 전용 로직이 RPC 경로에서 오작동하지 않는지 확인해야 합니다.
→ [Ch. 57 Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md)

---

## I

### Idempotency · 멱등성
같은 요청을 여러 번 처리해도 결과가 한 번 처리한 것과 같은 성질입니다. 큐와 메시지 브로커는 대부분 "최소 한 번" 전달을 보장하므로 중복 처리가 정상이며, 소비자가 멱등해야 합니다. 멱등 키를 저장소에 기록하고 이미 본 키는 건너뛰는 것이 가장 단순한 구현입니다.
→ [Ch. 35 Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md)

### Injection Scope · 주입 스코프
프로바이더 인스턴스의 수명을 결정하는 설정으로 `DEFAULT`(싱글턴), `REQUEST`, `TRANSIENT` 세 가지가 있습니다. 스코프는 위로 전파되어, request-scoped 프로바이더를 주입한 컨트롤러도 request-scoped가 됩니다. 그래서 스코프 하나를 잘못 지정하면 애플리케이션 절반의 성능 특성이 바뀔 수 있습니다.
→ [Ch. 38 Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md)

### Injection Token · 주입 토큰
DI 컨테이너가 프로바이더를 찾는 데 쓰는 키이며, 클래스 자체이거나 문자열 또는 `Symbol`입니다. 인터페이스는 런타임에 존재하지 않으므로 인터페이스 기반 주입에는 별도의 토큰 상수가 필요합니다. 문자열 토큰은 오타에 취약하므로 상수로 추출해 한 곳에서 관리하십시오.
→ [Ch. 36 Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md)

### Interceptor · 인터셉터
핸들러 실행 전후를 모두 감쌀 수 있는 계층이며 `NestInterceptor`를 구현합니다. `next.handle()`이 반환하는 Observable에 RxJS 연산자를 붙여 응답 변환, 타임아웃, 캐싱, 로깅을 구현합니다. 요청을 아예 막고 싶다면 가드를, 응답을 다듬고 싶다면 인터셉터를 쓰는 것이 역할 분담입니다.
→ [Ch. 12 Interceptors and the Response Pipeline](../part1-beginner/12-interceptors.md)

### Interface (GraphQL) · 인터페이스
여러 객체 타입이 공유하는 필드 집합을 선언하는 GraphQL 추상 타입이며 `@InterfaceType()`으로 정의합니다. 구현 타입은 `implements` 옵션으로 연결하고, `resolveType`으로 런타임에 구체 타입을 판별합니다. 유니온과 달리 공통 필드를 조각(fragment) 없이 바로 질의할 수 있습니다.
→ [Ch. 51 GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md)

### Introspection · 인트로스펙션
클라이언트가 GraphQL 서버에 스키마 구조 자체를 질의하는 기능입니다. 개발 도구와 코드 생성에 필수지만, 프로덕션에서 켜 두면 공격자에게 API 표면 전체를 알려 주는 셈이 됩니다. 사설망 전용 게이트웨이가 아니라면 프로덕션에서는 끄고, 스키마는 별도 채널로 배포하십시오.
→ [Ch. 52 GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md)

### IoC Container · 제어 역전 컨테이너
프로바이더의 생성, 수명, 의존성 해결을 대신 맡는 Nest 런타임의 핵심 구성 요소입니다. 각 모듈은 자기 스코프의 프로바이더 레지스트리를 갖고, 컨테이너는 import 관계를 따라 토큰을 찾아 올라갑니다. "왜 못 찾는가"의 답은 거의 항상 "export 하지 않았거나 import 하지 않았다"입니다.
→ [Ch. 7 Dependency Injection](../part1-beginner/07-dependency-injection-basics.md)

---

## J

### Joi · 조이
스키마 기반 검증 라이브러리로, `ConfigModule`의 `validationSchema` 옵션에 넘겨 환경 변수를 기동 시점에 검증합니다. 필수 값 누락이나 타입 오류를 첫 요청이 아니라 부팅 때 실패시키는 것이 핵심 가치입니다. 기본값 정의도 함께 할 수 있어 설정 문서 역할을 겸합니다.
→ [Ch. 17 Configuration and Environment Management](../part2-intermediate/17-configuration.md)

### JWT · 제이슨 웹 토큰
헤더·페이로드·서명 세 부분으로 이루어진 서명된 토큰 형식입니다. 서버가 세션을 저장하지 않아도 되지만, 발급한 토큰을 즉시 무효화할 수 없다는 근본적 제약이 있습니다. 그래서 액세스 토큰은 짧게 두고 리프레시 토큰으로 갱신하며, 리프레시 토큰은 서버에 저장해 폐기 가능하게 만드는 구성이 표준입니다.
→ [Ch. 23 Authentication: Sessions, JWT, and Passport](../part2-intermediate/23-authentication.md)

---

## K

### Kafka · 카프카
파티션된 커밋 로그를 중심으로 하는 분산 스트리밍 플랫폼입니다. 메시지를 소비해도 지우지 않고 보존 기간 동안 남기므로 재처리와 여러 독립 소비자가 가능합니다. Nest에서는 `Transport.KAFKA`로 연결하며, 요청-응답 패턴은 별도의 응답 토픽을 만들어 동작한다는 점을 이해해야 합니다.
→ [Ch. 47 Microservices III: Kafka](../part3-advanced/47-kafka.md)

### Keyv · 키브
`cache-manager` v6가 채택한 통합 키-값 스토리지 계층입니다. `@keyv/redis` 같은 어댑터를 끼워 메모리, Redis, 기타 백엔드를 같은 인터페이스로 다룹니다. v11에서 캐시 스토어 설정 문법이 바뀐 이유가 바로 이 전환이므로, 예전 `store` 옵션 예제를 그대로 쓰면 동작하지 않습니다.
→ [Ch. 27 Caching](../part2-intermediate/27-caching.md)

---

## L

### Lazy Loading · 지연 로딩
필요한 시점에만 모듈을 불러와 인스턴스화하는 기법이며 `LazyModuleLoader.load()`를 사용합니다. 서버리스 콜드 스타트를 줄이거나, 드물게만 쓰이는 무거운 통합을 기동 경로에서 빼는 데 유용합니다. 지연 로드된 모듈의 컨트롤러는 라우트로 등록되지 않는다는 제약이 있습니다.
→ [Ch. 41 ModuleRef, DiscoveryService, Lazy Loading](../part3-advanced/41-module-ref-discovery-lazy.md)

### Lifecycle Hook · 라이프사이클 훅
Nest가 정해진 시점에 호출해 주는 인터페이스 메서드입니다. `onModuleInit`, `onApplicationBootstrap`, `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown` 순서로 흐르며 각각 의미가 다릅니다. 생성자에서 비동기 작업을 하는 대신 `onModuleInit`을 쓰는 것이 정석입니다.
→ [Ch. 39 Lifecycle Events and Graceful Shutdown](../part3-advanced/39-lifecycle-and-shutdown.md)

### Liveness Probe · 라이브니스 프로브
프로세스가 살아 있는지, 재시작이 필요한지를 오케스트레이터가 판단하기 위해 호출하는 엔드포인트입니다. 데이터베이스 같은 외부 의존성을 여기에 포함시키면 DB 장애 때 멀쩡한 파드가 계속 재시작되는 사고가 납니다. 라이브니스는 자기 자신만, 레디니스는 의존성까지 검사하는 것이 원칙입니다.
→ [Ch. 56 Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md)

### Logger · 로거
Nest 내장 로깅 서비스이며 `LoggerService` 인터페이스를 구현해 교체할 수 있습니다. `NestFactory.create(AppModule, { bufferLogs: true })`와 `app.useLogger()`를 조합하면 부트스트랩 로그까지 커스텀 로거로 흘려보낼 수 있습니다. 프로덕션에서는 사람이 읽는 형식이 아니라 JSON 구조화 로그를 쓰십시오.
→ [Ch. 18 Logging: Built-in, Custom, and Structured](../part2-intermediate/18-logging.md)

---

## M

### Mapped Types · 매핑 타입
기존 DTO에서 파생된 DTO를 만들어 주는 유틸리티로 `PartialType`, `PickType`, `OmitType`, `IntersectionType`이 있습니다. 검증 데코레이터와 Swagger 메타데이터를 함께 상속하므로 중복 선언을 없앨 수 있습니다. `@nestjs/swagger`, `@nestjs/graphql`, `@nestjs/mapped-types` 중 **어느 패키지에서 import 하는지**가 동작을 바꾸므로 주의하십시오.
→ [Ch. 30 OpenAPI II](../part2-intermediate/30-openapi-advanced.md)

### Message Pattern · 메시지 패턴
마이크로서비스에서 요청-응답 메시지를 식별하는 값이며 `@MessagePattern()`으로 핸들러를 등록합니다. 클라이언트는 `send()`로 호출하고 반환된 Observable로 응답을 받습니다. 패턴 값은 문자열이든 객체든 될 수 있지만, 객체를 쓸 때는 키 순서까지 포함해 깊은 비교가 이뤄진다는 점을 기억하십시오.
→ [Ch. 45 Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md)

### Metadata Reflection · 메타데이터 리플렉션
`reflect-metadata` 라이브러리를 통해 데코레이터가 붙인 정보를 런타임에 읽는 기법입니다. `emitDecoratorMetadata`가 켜져 있으면 TypeScript가 `design:paramtypes`를 방출하고, Nest는 이 값으로 생성자 의존성의 타입을 알아냅니다. 이 컴파일러 옵션이 꺼지면 DI 전체가 조용히 망가집니다.
→ [Ch. 13 Custom Decorators and the Complete Request Lifecycle](../part1-beginner/13-custom-decorators-and-lifecycle.md)

### Middleware · 미들웨어
라우트 핸들러가 결정되기 전에 실행되는 Express/Fastify 수준의 함수입니다. `configure(consumer)` 안에서 경로와 메서드에 바인딩하며, `ExecutionContext`가 없어 라우트 메타데이터를 읽을 수 없습니다. 요청 로깅이나 원시 요청 조작에는 적합하고, 인가 판단에는 가드를 쓰십시오.
→ [Ch. 8 Middleware: The Layer Before Nest](../part1-beginner/08-middleware.md)

### Migration · 마이그레이션
데이터베이스 스키마 변경을 코드로 기록하고 순서대로 적용하는 절차입니다. TypeORM의 `synchronize: true`는 개발 편의 기능이며 프로덕션에서 켜면 데이터가 사라질 수 있습니다. 마이그레이션은 반드시 되돌리기(`down`)까지 작성하고, 배포 파이프라인에서 애플리케이션 기동과 분리해 실행하십시오.
→ [Ch. 19 SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md)

### MikroORM · 미크로오알엠
Unit of Work와 Identity Map 패턴을 채택한 TypeScript ORM입니다. 엔티티 변경을 추적했다가 `flush()` 시점에 한꺼번에 반영하므로 쓰기 횟수가 줄어듭니다. request-scoped `EntityManager`가 필요하므로 Nest 통합에서 `RequestContext` 미들웨어 설정을 빠뜨리면 안 됩니다.
→ [Ch. 20 Sequelize and MikroORM](../part2-intermediate/20-sequelize-and-mikroorm.md)

### Module · 모듈
프로바이더, 컨트롤러, import, export를 묶는 조직 단위이며 `@Module()`로 정의합니다. 모듈은 DI의 스코프 경계이기도 해서, export 하지 않은 프로바이더는 바깥에서 주입받을 수 없습니다. 애플리케이션 구조를 이해한다는 것은 곧 모듈 그래프를 이해한다는 뜻입니다.
→ [Ch. 6 Modules: Structuring the Application Graph](../part1-beginner/06-modules.md)

### ModuleRef · 모듈 레퍼런스
DI 컨테이너에 프로그램적으로 접근하게 해 주는 주입 가능한 서비스입니다. `get()`은 싱글턴을, `resolve()`는 스코프가 있는 인스턴스를 반환하며 `strict: false`로 모듈 경계를 넘어 조회할 수 있습니다. 편리하지만 의존성을 숨기는 서비스 로케이터 안티패턴이 되기 쉬우므로 동적 해결이 꼭 필요할 때만 쓰십시오.
→ [Ch. 41 ModuleRef, DiscoveryService, Lazy Loading](../part3-advanced/41-module-ref-discovery-lazy.md)

### Mongoose · 몽구스
MongoDB용 ODM으로 스키마 정의, 검증, 미들웨어(훅), populate를 제공합니다. Nest에서는 `@nestjs/mongoose`의 `@Schema()`/`@Prop()` 데코레이터로 스키마를 선언하고 `@InjectModel()`로 모델을 주입합니다. 도큐먼트 인스턴스를 그대로 응답하면 내부 필드까지 노출되므로 `toJSON` 변환이나 DTO 매핑이 필요합니다.
→ [Ch. 21 MongoDB with Mongoose](../part2-intermediate/21-mongodb-mongoose.md)

### Monorepo · 모노레포
여러 애플리케이션과 라이브러리를 하나의 저장소와 하나의 `tsconfig` 트리 안에서 관리하는 구조입니다. Nest CLI는 `nest generate app`과 `nest generate library`로 이 모드를 지원하며 경로 별칭으로 라이브러리를 참조합니다. 코드 공유가 쉬워지는 대신 빌드 대상 선별과 CI 캐싱 전략이 중요해집니다.
→ [Ch. 54 Monorepos, Workspaces, and Publishable Libraries](../part3-advanced/54-monorepo-and-libraries.md)

### MQTT · 엠큐티티
경량 발행-구독 프로토콜로 IoT와 저대역폭 환경에서 널리 쓰입니다. 토픽 계층과 와일드카드(`+`, `#`)를 지원하고 QoS 0/1/2로 전달 보장 수준을 고릅니다. Nest에서는 `Transport.MQTT`로 연결하며 토픽 이름이 곧 메시지 패턴이 됩니다.
→ [Ch. 46 Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md)

### Multer · 멀터
Express용 multipart/form-data 파싱 미들웨어이며 Nest의 파일 업로드 인터셉터가 내부적으로 사용합니다. `MulterModule.register()`로 저장 위치, 파일 크기 제한, 파일 필터를 설정합니다. 디스크 저장소를 쓰면 임시 파일 정리 책임이 애플리케이션에 생기므로, 대용량은 스토리지로 직접 업로드하는 방식을 고려하십시오.
→ [Ch. 28 File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md)

### MVC · 모델-뷰-컨트롤러
서버가 HTML을 렌더링해 응답하는 전통적 웹 애플리케이션 구조입니다. Nest에서는 `app.setBaseViewsDir()`와 `app.setViewEngine()`으로 템플릿 엔진(Handlebars, EJS 등)을 설정하고 `@Render()`로 뷰를 지정합니다. 관리자 화면이나 이메일 템플릿처럼 SPA가 과한 곳에서 여전히 유효한 선택입니다.
→ [Ch. 33 Server-Side Rendering (MVC) and API Versioning](../part2-intermediate/33-mvc-and-versioning.md)

---

## N

### N+1 Problem · N+1 문제
목록 하나를 가져온 뒤 각 항목마다 추가 질의를 날려 총 N+1번의 왕복이 발생하는 성능 문제입니다. GraphQL 리졸버와 ORM 지연 로딩에서 특히 자주 나타납니다. 해결책은 DataLoader 배칭, ORM의 eager/join 전략, 또는 필요한 데이터를 한 번에 가져오는 전용 질의입니다.
→ [Ch. 52 GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md)

### Namespace · 네임스페이스
Socket.IO에서 하나의 연결을 논리적으로 분리하는 통신 채널이며 `@WebSocketGateway({ namespace: 'chat' })`로 지정합니다. 룸(room)이 네임스페이스 안의 세부 그룹이라면, 네임스페이스는 서로 다른 기능 영역을 나누는 단위입니다. 클라이언트가 네임스페이스를 명시하지 않으면 기본 `/`에 붙으므로 이벤트가 도달하지 않는 원인이 되곤 합니다.
→ [Ch. 44 WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md)

### NATS · 나츠
가볍고 빠른 발행-구독 메시징 시스템이며, JetStream을 켜면 영속성과 재전송까지 얻습니다. 기본 코어 NATS는 "최대 한 번" 전달이라 구독자가 없으면 메시지가 그냥 사라집니다. 요청-응답을 프로토콜 수준에서 지원해 Nest의 `send()`와 궁합이 좋습니다.
→ [Ch. 46 Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md)

### Nest CLI · 네스트 CLI
프로젝트 생성, 코드 스캐폴딩, 빌드, 실행을 담당하는 명령행 도구입니다. `nest new`, `nest generate`, `nest build`, `nest start --watch`가 일상적으로 쓰이며 `nest-cli.json`이 동작을 제어합니다. 스키매틱이 만들어 주는 파일 구조는 관례이지 규칙이 아니므로, 팀 규약에 맞게 바꿔도 됩니다.
→ [Ch. 2 The Nest CLI, Project Layout, and the Development Loop](../part1-beginner/02-cli-and-project-setup.md)

### NestFactory · 네스트 팩토리
애플리케이션 인스턴스를 만드는 정적 팩토리 클래스입니다. `create()`는 HTTP 앱을, `createMicroservice()`는 마이크로서비스를, `createApplicationContext()`는 HTTP 없는 스탠드얼론 앱을 만듭니다. 어느 쪽이든 모듈 그래프를 스캔하고 컨테이너를 구성하는 과정은 동일합니다.
→ [Ch. 1 What NestJS Is](../part1-beginner/01-what-is-nestjs.md)

---

## O

### Observable · 옵저버블
RxJS의 핵심 타입으로, 시간에 따라 0개 이상의 값을 밀어내는 스트림입니다. Nest의 인터셉터, `HttpService`, 마이크로서비스 클라이언트가 모두 이 타입을 사용합니다. 구독하기 전에는 아무 일도 일어나지 않는 "게으른" 성질이 Promise와 가장 크게 다른 점입니다.
→ [Ch. 12 Interceptors and the Response Pipeline](../part1-beginner/12-interceptors.md)

### OnModuleInit · 온모듈이닛
해당 모듈의 모든 프로바이더가 인스턴스화된 직후 호출되는 라이프사이클 훅입니다. 의존성이 준비된 뒤 실행되므로 연결 열기, 캐시 워밍, 스키마 검증에 적합합니다. 여기서 던진 예외는 부트스트랩을 실패시키며, 그것이 대개 올바른 동작입니다.
→ [Ch. 39 Lifecycle Events and Graceful Shutdown](../part3-advanced/39-lifecycle-and-shutdown.md)

### OpenAPI · 오픈API
REST API를 기계가 읽을 수 있는 형식으로 기술하는 명세이며 예전 이름은 Swagger입니다. `@nestjs/swagger`는 데코레이터 메타데이터에서 문서를 생성하고 `SwaggerModule.setup()`으로 UI를 띄웁니다. 문서를 손으로 유지하는 대신 코드에서 생성하는 것이 이 도구의 요점입니다.
→ [Ch. 29 OpenAPI I: Documenting Your API](../part2-intermediate/29-openapi-fundamentals.md)

### Optimistic Locking · 낙관적 잠금
행을 잠그지 않고 버전 컬럼을 비교해, 갱신 시점에 버전이 달라졌으면 충돌로 처리하는 동시성 제어 방식입니다. TypeORM에서는 `@VersionColumn()`으로 활성화합니다. 충돌이 드문 워크로드에서 비관적 잠금보다 처리량이 좋지만, 애플리케이션이 재시도 로직을 책임져야 합니다.
→ [Ch. 19 SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md)

### ORM · 객체 관계 매핑
관계형 테이블과 객체 모델을 서로 대응시켜 주는 라이브러리 계층입니다. 반복적인 SQL을 줄여 주지만 생성되는 질의를 이해하지 못하면 성능 문제가 숨습니다. 좋은 규칙은 "일상적인 CRUD는 ORM으로, 성능이 중요한 조회는 직접 쓴 SQL로"입니다.
→ [Ch. 19 SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md)

---

## P

### Partition · 파티션
Kafka 토픽을 나눈 물리적 로그 단위이며 순서 보장의 경계입니다. 같은 키를 가진 메시지는 같은 파티션으로 가므로, 엔티티 ID를 키로 쓰면 그 엔티티에 대한 이벤트 순서가 보장됩니다. 파티션 수는 소비 병렬성의 상한이자, 늘리기는 쉬워도 줄이기는 어려운 결정입니다.
→ [Ch. 47 Microservices III: Kafka](../part3-advanced/47-kafka.md)

### Passport Strategy · 패스포트 전략
자격 증명을 검증하는 하나의 방식을 캡슐화한 클래스이며 `PassportStrategy()` 믹스인을 상속해 만듭니다. `validate()`가 반환한 값이 `request.user`에 붙고, 짝이 되는 가드(`AuthGuard('jwt')`)가 전략을 호출합니다. 전략 이름이 문자열로 연결되므로 오타가 나면 "Unknown authentication strategy" 오류가 납니다.
→ [Ch. 24 Passport in Practice: Strategies, Guards, and Refresh Flows](../part2-intermediate/24-passport-strategies.md)

### Payload · 페이로드
마이크로서비스 핸들러가 받는 메시지 본문이며 `@Payload()`로 추출합니다. 짝이 되는 `@Ctx()`는 트랜스포터별 컨텍스트(원본 메시지, ack 함수, 파티션 정보)를 제공합니다. RPC 경로에서도 파이프가 동작하므로 `@Payload()`에 `ValidationPipe`를 붙여 입력을 검증할 수 있습니다.
→ [Ch. 45 Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md)

### Pipe · 파이프
핸들러 인자를 변환하거나 검증하는 클래스이며 `PipeTransform`을 구현합니다. 가드 다음, 핸들러 직전에 실행되고 검증 실패 시 예외를 던져 요청을 끝냅니다. `ParseIntPipe` 같은 내장 파이프는 변환을, `ValidationPipe`는 DTO 검증을 담당합니다.
→ [Ch. 10 Pipes: Transformation and Validation](../part1-beginner/10-pipes-and-validation.md)

### Platform Agnosticism · 플랫폼 비종속성
가드·인터셉터·필터·파이프를 HTTP, WebSocket, RPC 어디서나 같은 코드로 재사용할 수 있게 하는 Nest의 설계 원칙입니다. 이를 가능하게 하는 장치가 `ArgumentsHost`/`ExecutionContext`와 어댑터입니다. 다만 `request.res`처럼 특정 플랫폼 객체에 직접 손대는 순간 이 이점은 사라집니다.
→ [Ch. 40 Execution Context and Platform Agnosticism](../part3-advanced/40-execution-context.md)

### Plugin (Apollo) · 플러그인
GraphQL 요청의 생명주기 각 단계(파싱, 검증, 실행, 응답)에 후크를 거는 Apollo Server 확장입니다. Nest에서는 `Plugin()` 데코레이터로 만들고 프로바이더로 등록하면 자동으로 연결됩니다. 요청 단위 메트릭, 느린 질의 로깅, 응답 헤더 조작에 사용합니다.
→ [Ch. 52 GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md)

### Poison Message · 포이즌 메시지
처리할 때마다 반드시 실패해 큐를 막거나 무한 재시도를 유발하는 메시지입니다. 원인은 대개 잘못된 스키마, 삭제된 참조 데이터, 코드 버그입니다. 재시도 상한과 데드 레터 큐를 함께 두는 것이 유일한 실용적 방어책입니다.
→ [Ch. 35 Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md)

### Prisma · 프리즈마
스키마 파일에서 타입 안전한 클라이언트를 생성하는 차세대 ORM입니다. 생성된 클라이언트는 컴파일 타임에 필드와 관계를 알기 때문에 자동완성과 타입 검사가 뛰어납니다. Nest에서는 `PrismaClient`를 상속한 `PrismaService`를 만들고 `onModuleInit`에서 `$connect()`를 호출하는 것이 표준 패턴입니다.
→ [Ch. 22 Prisma: Type-Safe Data Access](../part2-intermediate/22-prisma.md)

### Provider · 프로바이더
`@Injectable()`이 붙어 DI 컨테이너가 생성·주입할 수 있는 모든 것을 가리킵니다. 서비스, 리포지터리, 팩토리, 헬퍼가 모두 프로바이더이며 비즈니스 로직이 사는 곳입니다. `@Injectable()`은 표시일 뿐이고, 실제 등록은 모듈의 `providers` 배열이 합니다.
→ [Ch. 5 Providers and Services](../part1-beginner/05-providers-and-services.md)

### Provider Scope · 프로바이더 스코프
→ Injection Scope 항목을 보십시오. 같은 개념을 프로바이더 쪽에서 부르는 이름이며, `@Injectable({ scope })`로 선언하거나 커스텀 프로바이더 객체의 `scope` 속성으로 지정합니다. 스코프가 지정되지 않으면 애플리케이션 전체에서 하나뿐인 싱글턴이 됩니다.
→ [Ch. 38 Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md)

---

## Q

### Query Bus · 쿼리 버스
CQRS에서 읽기 요청을 담은 쿼리 객체를 정확히 하나의 `@QueryHandler()`로 보내는 디스패처입니다. 커맨드 버스와 구조는 같지만 상태를 바꾸지 않는다는 계약이 다릅니다. 쿼리 핸들러가 쓰기를 수행하기 시작하면 CQRS의 이점은 사라집니다.
→ [Ch. 53 CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md)

### Queue · 큐
즉시 처리하지 않아도 되는 작업을 쌓아 두고 워커가 나중에 꺼내 처리하도록 하는 자료 구조이자 인프라입니다. HTTP 요청 경로에서 느린 작업(이메일 발송, 이미지 변환, 리포트 생성)을 떼어 내 응답 시간을 지킵니다. 큐를 도입하는 순간 "언제 끝났는지"를 사용자에게 알리는 문제가 새로 생긴다는 점을 설계에 포함하십시오.
→ [Ch. 35 Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md)

---

## R

### RabbitMQ · 래빗엠큐
AMQP 기반 메시지 브로커로 익스체인지, 큐, 바인딩이라는 유연한 라우팅 모델을 제공합니다. 명시적 ack, prefetch, 데드 레터 익스체인지를 지원해 작업 큐 성격의 워크로드에 강합니다. Nest에서 `noAck: false`로 두면 핸들러가 성공했을 때만 ack 하도록 제어할 수 있습니다.
→ [Ch. 46 Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md)

### Rate Limiting · 요청 속도 제한
일정 시간 창 안에서 허용할 요청 수를 제한해 남용과 과부하를 막는 기법입니다. `@nestjs/throttler`가 여러 개의 이름 붙은 제한(초·분·시간 단위)을 동시에 적용할 수 있게 해 줍니다. 프록시 뒤에서는 `trust proxy`와 커스텀 트래커를 설정하지 않으면 모든 요청이 같은 IP로 집계됩니다.
→ [Ch. 26 Hardening the Application](../part2-intermediate/26-web-security-hardening.md)

### Raw Body · 원시 본문
JSON 파서가 파싱하기 전의 요청 바이트 그대로를 가리킵니다. 결제 웹훅처럼 서명 검증이 필요한 경우 파싱된 객체를 다시 직렬화하면 바이트가 달라져 검증에 실패하므로 원시 본문이 반드시 필요합니다. Nest는 `rawBody: true` 옵션과 `req.rawBody`로 이를 지원합니다.
→ [Ch. 57 Advanced HTTP](../part3-advanced/57-advanced-http.md)

### RBAC · 역할 기반 접근 제어
사용자에게 역할을 부여하고 역할에 권한을 묶어 접근을 통제하는 모델입니다. Nest에서는 `@Roles()` 커스텀 데코레이터로 메타데이터를 붙이고 `RolesGuard`가 `Reflector`로 읽어 판단합니다. 역할만으로는 "자기 것만 수정" 같은 규칙을 표현할 수 없어, 결국 속성·정책 기반으로 확장하게 됩니다.
→ [Ch. 25 Authorization: RBAC, Claims, and CASL](../part2-intermediate/25-authorization.md)

### Readiness Probe · 레디니스 프로브
이 인스턴스가 지금 트래픽을 받아도 되는지를 알리는 엔드포인트입니다. 데이터베이스 연결, 캐시, 필수 외부 의존성 검사를 포함하는 것이 적절합니다. 배포 중 무중단을 위해서는 종료 신호를 받은 즉시 레디니스를 실패로 바꾸는 것이 핵심입니다.
→ [Ch. 56 Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md)

### Redis · 레디스
인메모리 데이터 저장소이며 Nest에서는 캐시 백엔드, BullMQ의 저장소, 그리고 발행-구독 트랜스포터로 세 가지 역할을 합니다. 단일 스레드 모델이라 큰 키를 다루는 명령 하나가 전체를 막을 수 있으므로 `KEYS` 같은 명령은 피하십시오. 캐시용과 큐용 인스턴스를 분리하면 서로의 장애가 전파되지 않습니다.
→ [Ch. 46 Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md)

### Reflector · 리플렉터
`SetMetadata()`나 커스텀 데코레이터가 붙인 메타데이터를 읽는 헬퍼 서비스입니다. `getAllAndOverride()`는 메서드 값이 클래스 값을 덮어쓰게 하고, `getAllAndMerge()`는 둘을 합칩니다. `Reflector.createDecorator()`를 쓰면 문자열 키 없이 타입이 붙은 데코레이터를 만들 수 있습니다.
→ [Ch. 11 Guards: Authorization at the Route Boundary](../part1-beginner/11-guards.md)

### Refresh Token · 리프레시 토큰
수명이 긴 토큰으로, 만료된 액세스 토큰을 새로 발급받는 데만 사용합니다. 서버에 해시로 저장해 폐기 가능하게 만들고, 사용 시마다 새로 발급하는 회전(rotation) 방식을 권장합니다. 이미 사용된 리프레시 토큰이 다시 들어오면 탈취로 간주해 해당 세션 전체를 무효화하십시오.
→ [Ch. 24 Passport in Practice: Strategies, Guards, and Refresh Flows](../part2-intermediate/24-passport-strategies.md)

### Repository Pattern · 리포지터리 패턴
데이터 접근을 컬렉션과 비슷한 인터페이스 뒤로 숨겨 도메인 로직과 영속성 기술을 분리하는 패턴입니다. TypeORM의 `Repository<T>`가 대표적이며 `@InjectRepository()`로 주입합니다. ORM 리포지터리를 그대로 쓰면 추상화 효과가 제한적이므로, 도메인 인터페이스를 따로 두고 어댑터로 구현하는 방식도 고려하십시오.
→ [Ch. 19 SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md)

### Request Lifecycle · 요청 생명주기
요청이 미들웨어 → 가드 → 인터셉터(전) → 파이프 → 핸들러 → 인터셉터(후) → 예외 필터 순으로 흐르는 고정된 순서입니다. 전역·컨트롤러·핸들러 수준의 바인딩은 각 단계 안에서 다시 순서를 가집니다. 이 순서를 외우면 "왜 내 가드가 파이프 뒤에 실행되지 않는가" 같은 질문이 대부분 사라집니다.
→ [Ch. 13 Custom Decorators and the Complete Request Lifecycle](../part1-beginner/13-custom-decorators-and-lifecycle.md)

### Request-Scoped · 요청 스코프
요청마다 새 인스턴스가 만들어지는 프로바이더입니다. `@Inject(REQUEST)`로 요청 객체를 직접 받을 수 있어 편리하지만, 인스턴스 생성 비용이 요청마다 발생하고 스코프가 의존 체인을 타고 위로 전파됩니다. 대부분의 경우 `AsyncLocalStorage`가 더 나은 대안입니다.
→ [Ch. 38 Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md)

### Resolver · 리졸버
GraphQL 필드의 값을 계산하는 함수 또는 클래스이며 `@Resolver()`, `@Query()`, `@Mutation()`, `@ResolveField()`로 정의합니다. REST의 컨트롤러에 해당하지만 필드 단위로 호출된다는 점이 결정적으로 다릅니다. `@ResolveField()`가 목록의 각 항목마다 실행된다는 사실이 N+1 문제의 출발점입니다.
→ [Ch. 50 GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md)

### Route Parameter · 라우트 파라미터
경로에 포함된 동적 조각이며 `@Param('id')`로 읽습니다. 값은 항상 문자열이므로 숫자가 필요하면 `ParseIntPipe`로 변환해야 합니다. Express 5에서는 선택적 파라미터 문법이 `:id?`에서 중괄호 형식으로 바뀌었다는 점을 v11 마이그레이션 시 확인하십시오.
→ [Ch. 3 Controllers I: Routing, Parameters, and the Request](../part1-beginner/03-controllers-routing.md)

### RPC · 원격 프로시저 호출
원격 서비스의 함수를 로컬 함수처럼 호출하는 통신 방식입니다. Nest 마이크로서비스의 요청-응답 패턴이 여기에 해당하며, gRPC는 그 구체적 구현 중 하나입니다. 네트워크가 개입한다는 사실을 코드가 숨기기 때문에 타임아웃·재시도·부분 실패를 명시적으로 다뤄야 합니다.
→ [Ch. 45 Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md)

### RxJS · 알엑스제이에스
Observable 기반의 반응형 프로그래밍 라이브러리이며 Nest 내부 곳곳에서 사용됩니다. `map`, `tap`, `catchError`, `timeout`, `retry` 같은 연산자가 인터셉터 구현의 표준 어휘입니다. 전부 배울 필요는 없고, 인터셉터와 HTTP 클라이언트에서 쓰는 10여 개 연산자만 익히면 충분합니다.
→ [Ch. 12 Interceptors and the Response Pipeline](../part1-beginner/12-interceptors.md)

---

## S

### Saga · 사가
여러 서비스에 걸친 장기 트랜잭션을 이벤트와 보상 동작으로 조율하는 패턴입니다. `@nestjs/cqrs`의 사가는 이벤트 스트림을 RxJS로 받아 새로운 커맨드를 방출하는 함수로 표현됩니다. 분산 환경에서는 롤백이 불가능하므로 "실패를 되돌리는 커맨드"를 명시적으로 설계해야 합니다.
→ [Ch. 53 CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md)

### Scalar · 스칼라
GraphQL의 원시 값 타입이며 `Int`, `Float`, `String`, `Boolean`, `ID`가 내장되어 있습니다. `DateTime`이나 `JSON` 같은 커스텀 스칼라는 `@Scalar()` 데코레이터와 `CustomScalar` 인터페이스로 직렬화·역직렬화·파싱 규칙을 정의해 만듭니다. 커스텀 스칼라는 검증 지점이기도 하므로 잘못된 입력을 여기서 거를 수 있습니다.
→ [Ch. 51 GraphQL II](../part3-advanced/51-graphql-types-and-operations.md)

### Schema First · 스키마 퍼스트
SDL 파일로 GraphQL 스키마를 먼저 작성하고 그에 맞는 리졸버를 구현하는 방식입니다. 프론트엔드와 계약을 먼저 합의하는 팀에 잘 맞고, `typePaths`와 타입 생성기로 TypeScript 정의를 만들어 냅니다. 스키마와 리졸버가 따로 놀 수 있다는 점이 단점이며, 생성된 타입을 실제로 사용해야 그 위험이 줄어듭니다.
→ [Ch. 50 GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md)

### Sentry · 센트리
예외와 성능 데이터를 수집하는 오류 추적 플랫폼입니다. Nest에서는 전역 예외 필터 또는 공식 통합 모듈로 붙이고, 상관 ID와 사용자 컨텍스트를 함께 보내면 조사 속도가 크게 올라갑니다. 검증 실패 같은 예상된 4xx까지 보내면 노이즈가 되어 진짜 오류가 묻히므로 필터링하십시오.
→ [Ch. 56 Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md)

### Sequelize · 시퀄라이즈
성숙한 Node용 SQL ORM이며 `@nestjs/sequelize`로 통합합니다. `sequelize-typescript`의 `@Table`, `@Column` 데코레이터로 모델을 선언하고 `@InjectModel()`로 주입합니다. 액티브 레코드 스타일이라 모델 클래스가 질의 API를 겸한다는 점이 TypeORM 리포지터리 방식과 다릅니다.
→ [Ch. 20 Sequelize and MikroORM](../part2-intermediate/20-sequelize-and-mikroorm.md)

### Serialization · 직렬화
내부 객체를 클라이언트에게 보낼 표현으로 변환하는 과정입니다. Nest에서는 `ClassSerializerInterceptor`와 `class-transformer` 데코레이터로 필드를 숨기거나 노출하고 형식을 바꿉니다. 비밀번호 해시나 내부 플래그가 응답에 새어 나가는 사고는 거의 전부 이 계층을 건너뛰었기 때문에 생깁니다.
→ [Ch. 16 Serialization: Shaping What Leaves Your API](../part2-intermediate/16-serialization.md)

### Server-Sent Events · 서버 전송 이벤트
서버가 HTTP 연결을 열어 둔 채 클라이언트로 단방향 이벤트를 밀어 보내는 표준입니다. Nest에서는 `@Sse()` 데코레이터를 붙이고 `MessageEvent` Observable을 반환하면 됩니다. 양방향이 필요 없다면 WebSocket보다 단순하고, 프록시·재연결 처리가 브라우저에 내장되어 있다는 장점이 있습니다.
→ [Ch. 57 Advanced HTTP](../part3-advanced/57-advanced-http.md)

### Session · 세션
서버가 상태를 보관하고 클라이언트에는 식별자 쿠키만 주는 인증 방식입니다. `express-session`으로 설정하며 프로덕션에서는 메모리 대신 Redis 같은 공유 스토어를 반드시 써야 합니다. 즉시 로그아웃이 가능하다는 점이 JWT 대비 가장 큰 장점입니다.
→ [Ch. 32 HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md)

### Singleton · 싱글턴
애플리케이션 전체에서 인스턴스가 하나만 존재하는 기본 프로바이더 스코프입니다. 상태를 인스턴스 필드에 담으면 모든 요청이 그 상태를 공유하므로, 사용자별 데이터를 필드에 저장하는 것은 심각한 버그가 됩니다. 싱글턴 프로바이더는 상태가 없거나, 있다면 그 상태가 진짜로 전역이어야 합니다.
→ [Ch. 38 Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md)

### Standalone Application · 스탠드얼론 애플리케이션
HTTP 리스너 없이 DI 컨테이너만 구성하는 애플리케이션이며 `NestFactory.createApplicationContext()`로 만듭니다. CLI 도구, 배치 스크립트, 마이그레이션 러너에서 기존 서비스를 재사용할 때 이상적입니다. 작업이 끝나면 `app.close()`를 호출해 연결을 정리해야 프로세스가 매달리지 않습니다.
→ [Ch. 42 Standalone Applications and Building CLIs](../part3-advanced/42-standalone-and-cli-apps.md)

### Static Assets · 정적 자산
이미지, CSS, 번들 같은 정적 파일이며 `app.useStaticAssets()` 또는 `ServeStaticModule`로 제공합니다. 애플리케이션 서버가 직접 서빙하는 것은 개발과 소규모 배포에 적합하고, 규모가 커지면 CDN이나 리버스 프록시로 옮기는 것이 맞습니다. 경로 순서에 따라 정적 라우트가 API 라우트를 가릴 수 있으니 프리픽스를 명확히 하십시오.
→ [Ch. 28 File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md)

### StreamableFile · 스트리머블 파일
Nest가 스트림 응답을 플랫폼 중립적으로 다루기 위해 제공하는 래퍼 클래스입니다. `Readable`이나 `Buffer`를 감싸 반환하면 Express든 Fastify든 알아서 파이프해 줍니다. 파일 전체를 메모리에 읽어 반환하는 대신 이 클래스를 쓰면 메모리 사용량이 파일 크기와 무관해집니다.
→ [Ch. 28 File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md)

### Subscription · 구독
GraphQL에서 서버가 클라이언트로 변경 사항을 밀어 보내는 연산 타입이며 `@Subscription()`으로 정의합니다. 전송은 보통 WebSocket(`graphql-ws`)이 담당하고, 발행은 `PubSub` 구현체를 통해 이뤄집니다. 인메모리 `PubSub`은 단일 인스턴스에서만 동작하므로 다중 인스턴스에서는 Redis 기반 구현으로 바꿔야 합니다.
→ [Ch. 51 GraphQL II](../part3-advanced/51-graphql-types-and-operations.md)

### SWC · 에스더블유씨
Rust로 작성된 초고속 TypeScript/JavaScript 컴파일러이며 `nest start -b swc`로 사용합니다. 타입 검사를 하지 않고 트랜스파일만 하므로 빌드가 극적으로 빨라지지만, 타입 오류는 별도의 `tsc --noEmit`으로 잡아야 합니다. 데코레이터 메타데이터 방출 설정을 빠뜨리면 DI가 깨지므로 `.swcrc` 설정을 반드시 확인하십시오.
→ [Ch. 55 Performance: Fastify, SWC, and Build Pipelines](../part3-advanced/55-performance-and-compilation.md)

### Swagger · 스웨거
OpenAPI 명세와 그 도구 모음의 옛 이름이며, Nest 패키지 이름(`@nestjs/swagger`)에 그대로 남아 있습니다. `DocumentBuilder`로 문서 메타데이터를 만들고 `SwaggerModule.createDocument()`로 명세를 생성합니다. CLI 플러그인을 켜면 DTO의 타입과 `?` 여부에서 스키마를 추론해 데코레이터 작성량이 크게 줄어듭니다.
→ [Ch. 29 OpenAPI I: Documenting Your API](../part2-intermediate/29-openapi-fundamentals.md)

---

## T

### Testing Module · 테스팅 모듈
`Test.createTestingModule()`로 만드는 축소된 애플리케이션 컨테이너입니다. `overrideProvider()`, `overrideGuard()`, `overrideInterceptor()`로 실제 구현을 테스트 더블로 교체할 수 있습니다. e2e 테스트에서는 여기서 만든 모듈로 `createNestApplication()`을 호출해 실제 HTTP 서버를 띄웁니다.
→ [Ch. 31 Testing: Unit, Integration, and End-to-End](../part2-intermediate/31-testing.md)

### Throttler · 스로틀러
`@nestjs/throttler`가 제공하는 요청 속도 제한 가드와 모듈입니다. v6부터 이름 붙은 여러 제한을 배열로 정의할 수 있고 `@SkipThrottle()`, `@Throttle()`로 라우트별 예외를 둡니다. 다중 인스턴스 환경에서는 Redis 스토리지를 붙여야 제한이 실제로 전역에서 동작합니다.
→ [Ch. 26 Hardening the Application](../part2-intermediate/26-web-security-hardening.md)

### Transaction · 트랜잭션
여러 데이터 변경을 하나의 원자적 단위로 묶는 데이터베이스 기능입니다. TypeORM에서는 `DataSource.transaction()`이나 `QueryRunner`로, Prisma에서는 `$transaction()`으로 다룹니다. 트랜잭션 안에서 외부 HTTP 호출이나 큐 발행을 하지 마십시오 — 커밋 실패 시 되돌릴 수 없습니다.
→ [Ch. 19 SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md)

### Transient Scope · 트랜지언트 스코프
주입될 때마다 새 인스턴스가 만들어지는 스코프입니다. 각 소비자가 자기만의 상태를 가져야 할 때 쓰며, 대표적인 예가 컨텍스트 이름을 갖는 로거입니다. `INQUIRER` 토큰을 함께 주입하면 자신을 주입한 클래스가 누구인지 알 수 있습니다.
→ [Ch. 38 Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md)

### Transporter · 트랜스포터
마이크로서비스가 메시지를 주고받는 방식을 캡슐화한 계층입니다. TCP, Redis, MQTT, NATS, RabbitMQ, Kafka, gRPC가 내장되어 있으며 `Transport` 열거형으로 선택합니다. 트랜스포터를 바꿔도 `@MessagePattern()` 핸들러 코드는 대체로 그대로 두는 것이 Nest 마이크로서비스 설계의 목표입니다.
→ [Ch. 45 Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md)

### TypeORM · 타입오알엠
데코레이터 기반 엔티티와 리포지터리를 제공하는 TypeScript ORM이며 `@nestjs/typeorm`으로 통합합니다. `forRoot()`로 데이터 소스를, `forFeature()`로 기능별 리포지터리를 등록합니다. `QueryBuilder`가 복잡한 질의를 위한 탈출구 역할을 하므로 필요할 때 주저 없이 내려가십시오.
→ [Ch. 19 SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md)

---

## U

### Union Type · 유니온 타입
여러 객체 타입 중 하나일 수 있는 GraphQL 타입이며 `createUnionType()`으로 만듭니다. 공통 필드가 없으므로 클라이언트는 인라인 프래그먼트로 각 타입을 분기해 질의해야 합니다. 에러와 성공 결과를 함께 표현하는 "결과 유니온" 패턴에 특히 유용합니다.
→ [Ch. 51 GraphQL II](../part3-advanced/51-graphql-types-and-operations.md)

### useClass · 유즈클래스
토큰에 대해 인스턴스화할 클래스를 지정하는 커스텀 프로바이더 형식입니다. 환경에 따라 구현체를 바꾸거나, 인터페이스 토큰에 구체 클래스를 연결할 때 사용합니다. 지정한 클래스의 의존성은 Nest가 평소처럼 해결해 줍니다.
→ [Ch. 36 Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md)

### useExisting · 유즈이그지스팅
이미 등록된 프로바이더에 별칭 토큰을 하나 더 붙이는 형식입니다. 새 인스턴스를 만들지 않고 동일한 싱글턴을 가리키므로, 레거시 토큰을 유지하면서 새 이름으로 이행할 때 유용합니다. `useClass`와 달리 인스턴스가 공유된다는 점이 결정적 차이입니다.
→ [Ch. 36 Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md)

### useFactory · 유즈팩토리
값을 계산해 반환하는 함수를 지정하는 커스텀 프로바이더 형식입니다. `inject` 배열로 팩토리의 인자를 선언하며, `async` 함수를 쓰면 비동기 프로바이더가 됩니다. 설정에 따라 서드파티 클라이언트를 구성해 넘겨주는 용도로 가장 많이 쓰입니다.
→ [Ch. 36 Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md)

### useValue · 유즈밸류
이미 만들어진 값을 그대로 주입하도록 지정하는 형식입니다. 상수, 설정 객체, 그리고 테스트에서의 목(mock) 객체에 사용합니다. Nest가 값을 만들지 않으므로 라이프사이클 훅이 호출되지 않는다는 점을 기억하십시오.
→ [Ch. 36 Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md)

---

## V

### Validation Pipe · 검증 파이프
DTO 클래스의 `class-validator` 데코레이터를 읽어 요청 데이터를 검증하는 내장 파이프입니다. `whitelist: true`는 선언되지 않은 속성을 제거하고, `forbidNonWhitelisted: true`는 아예 400으로 거절합니다. `transform: true`를 켜야 평범한 객체가 DTO 인스턴스로 바뀌어 기본값과 타입 변환이 동작합니다.
→ [Ch. 10 Pipes: Transformation and Validation](../part1-beginner/10-pipes-and-validation.md)

### Versioning · 버저닝
같은 API의 여러 버전을 공존시키는 기능이며 `app.enableVersioning()`으로 켭니다. URI, 헤더, 미디어 타입, 커스텀 네 가지 방식을 지원하고 컨트롤러·핸들러 단위로 `@Version()`을 붙입니다. 버전을 늘리는 것보다 없애는 것이 어려우므로, 새 버전은 정말 호환이 깨질 때만 만드십시오.
→ [Ch. 33 Server-Side Rendering (MVC) and API Versioning](../part2-intermediate/33-mvc-and-versioning.md)

---

## W

### WebSocket Adapter · 웹소켓 어댑터
Nest 게이트웨이와 실제 WebSocket 라이브러리를 잇는 어댑터입니다. 기본은 Socket.IO용 `IoAdapter`이며 순수 WebSocket용 `WsAdapter`도 제공됩니다. 여러 인스턴스로 확장하려면 Redis 어댑터를 붙인 커스텀 `IoAdapter`를 만들어 `app.useWebSocketAdapter()`로 등록해야 합니다.
→ [Ch. 44 WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md)

### Worker · 워커
큐에서 작업을 꺼내 실제로 처리하는 구성 요소이며 Nest에서는 `@Processor()` 클래스로 표현합니다. `concurrency` 설정으로 동시 처리 개수를, `limiter`로 처리 속도를 조절합니다. 워커를 API 서버와 같은 프로세스에 두면 무거운 작업이 HTTP 응답 지연으로 나타나므로 분리 배포를 권장합니다.
→ [Ch. 35 Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md)

### Workspace · 워크스페이스
모노레포 모드에서 여러 프로젝트(애플리케이션과 라이브러리)를 담는 최상위 구조입니다. `nest-cli.json`의 `projects` 항목이 각 프로젝트의 루트, 진입점, 빌드 설정을 기술합니다. 표준 모드와 모노레포 모드는 CLI 동작이 다르므로, 첫 라이브러리를 만들 때 구조가 바뀐다는 점을 알아 두십시오.
→ [Ch. 54 Monorepos, Workspaces, and Publishable Libraries](../part3-advanced/54-monorepo-and-libraries.md)

---

## Z

### Zod · 조드
TypeScript 우선 스키마 선언·검증 라이브러리로, 스키마에서 타입을 추론해 냅니다. 환경 변수 검증에서 Joi의 대안으로 널리 쓰이며, 커스텀 파이프를 만들면 요청 본문 검증에도 사용할 수 있습니다. 다만 `class-validator`와 달리 클래스 기반이 아니어서 Swagger 스키마 자동 생성과는 별도 연결이 필요합니다.
→ [Ch. 17 Configuration and Environment Management](../part2-intermediate/17-configuration.md)

---

## 관련 부록

- 데코레이터의 전체 목록과 시그니처는 [Appendix A — Complete Decorator Reference](./A-decorator-reference.md)를 보십시오.
- CLI 명령과 옵션은 [Appendix B — Nest CLI Command Reference](./B-cli-reference.md)에 정리되어 있습니다.
- 공식 문서의 각 페이지가 이 책의 어느 장에 대응하는지는 [Appendix C — Official Doc to Chapter Map](./C-doc-to-chapter-map.md)에서 확인할 수 있습니다.
