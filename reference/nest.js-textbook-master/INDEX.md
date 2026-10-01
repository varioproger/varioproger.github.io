# NestJS: The Complete Guide

공식 NestJS 문서(`content/` 136개 파일)를 바탕으로 새로 집필한 교과서. 기준 버전 **NestJS 11.x** (Express v5 기본, Node 20+, TypeScript 5.x).

**59개 장 + 4개 부록 — 약 286만 자, 약 44만 단어.**


| | |
|---|---|
| 언어 | 본문 영어 / 목차·요약·연습문제 한국어 |
| 코드 | TypeScript, 데코레이터 + `emitDecoratorMetadata` 전제 |
| 기준 버전 | NestJS `11.x` |
| 원문 | 각 파일 frontmatter의 `source_docs` / `source_url` 참조 |
| 원문 매핑 | [부록 C — 공식 문서 → 장 매핑](appendix/C-doc-to-chapter-map.md) |

---

## 읽는 순서

Part I → II → III 순서대로 읽으면 난이도가 이어집니다. 각 장 frontmatter의 `prerequisites`에 선행 장이 명시되어 있습니다.

- **Nest가 처음이라면** : Part I을 1장부터 순서대로. 13장(요청 생명주기)과 14장(첫 CRUD 앱)이 1차 목표입니다.
- **Node/Express 경험이 있다면** : 1, 5~7장(DI)을 정독하고 8~13장은 훑은 뒤 Part II로.
- **이미 Nest로 개발 중이라면** : 15~18장(검증·직렬화·설정·로깅), 31장(테스트), 그리고 Part III의 36~41장(DI 내부)이 빈틈을 메우는 구간입니다.
- **분산 시스템을 설계 중이라면** : 45~49장(마이크로서비스), 35장(큐), 53장(CQRS), 56~58장(관측·성능·배포).
- **레퍼런스로 쓴다면** : [부록 A(데코레이터)](appendix/A-decorator-reference.md), [부록 B(CLI)](appendix/B-cli-reference.md), [부록 D(용어집)](appendix/D-glossary.md)에서 들어가세요.

난이도 표기: `초급` / `중급` / `고급`

---


### Part I — Beginner (초급)

*기초 — Nest의 구성 요소와 요청 파이프라인*

- **1.** [What NestJS Is: Architecture, Philosophy, and the Module Graph](part1-beginner/01-what-is-nestjs.md) · `초급` · 30 min
- **2.** [The Nest CLI, Project Layout, and the Development Loop](part1-beginner/02-cli-and-project-setup.md) · `초급` · 35 min
- **3.** [Controllers I: Routing, Parameters, and the Request](part1-beginner/03-controllers-routing.md) · `초급` · 35 min
- **4.** [Controllers II: Responses, Status Codes, DTOs, and Async](part1-beginner/04-controllers-responses.md) · `초급` · 35 min
- **5.** [Providers and Services: The Unit of Business Logic](part1-beginner/05-providers-and-services.md) · `초급` · 35 min
- **6.** [Modules: Structuring the Application Graph](part1-beginner/06-modules.md) · `초급` · 35 min
- **7.** [Dependency Injection: How Nest Wires Your Application](part1-beginner/07-dependency-injection-basics.md) · `초급` · 35 min
- **8.** [Middleware: The Layer Before Nest](part1-beginner/08-middleware.md) · `초급` · 30 min
- **9.** [Exception Filters and Error Handling](part1-beginner/09-exception-filters.md) · `초급` · 30 min
- **10.** [Pipes: Transformation and Validation](part1-beginner/10-pipes-and-validation.md) · `초급` · 32 min
- **11.** [Guards: Authorization at the Route Boundary](part1-beginner/11-guards.md) · `초급` · 30 min
- **12.** [Interceptors and the Response Pipeline](part1-beginner/12-interceptors.md) · `초급` · 32 min
- **13.** [Custom Decorators and the Complete Request Lifecycle](part1-beginner/13-custom-decorators-and-lifecycle.md) · `초급` · 35 min
- **14.** [Building Your First Complete CRUD Application](part1-beginner/14-first-crud-application.md) · `초급` · 40 min

### Part II — Intermediate (중급)

*실무 — 데이터, 인증, 문서화, 테스트, 백그라운드 작업*

- **15.** [Validation in Depth: class-validator, class-transformer, and Custom Pipes](part2-intermediate/15-validation-in-depth.md) · `중급` · 34 min
- **16.** [Serialization: Shaping What Leaves Your API](part2-intermediate/16-serialization.md) · `중급` · 34 min
- **17.** [Configuration and Environment Management](part2-intermediate/17-configuration.md) · `중급` · 36 min
- **18.** [Logging: Built-in, Custom, and Structured](part2-intermediate/18-logging.md) · `중급` · 32 min
- **19.** [SQL Databases with TypeORM](part2-intermediate/19-sql-with-typeorm.md) · `중급` · 38 min
- **20.** [Sequelize and MikroORM](part2-intermediate/20-sequelize-and-mikroorm.md) · `중급` · 32 min
- **21.** [MongoDB with Mongoose](part2-intermediate/21-mongodb-mongoose.md) · `중급` · 36 min
- **22.** [Prisma: Type-Safe Data Access](part2-intermediate/22-prisma.md) · `중급` · 55 min
- **23.** [Authentication: Sessions, JWT, and Passport](part2-intermediate/23-authentication.md) · `중급` · 35 min
- **24.** [Passport in Practice: Strategies, Guards, and Refresh Flows](part2-intermediate/24-passport-strategies.md) · `중급` · 45 min
- **25.** [Authorization: RBAC, Claims, and CASL](part2-intermediate/25-authorization.md) · `중급` · 42 min
- **26.** [Hardening the Application: CORS, Helmet, CSRF, Rate Limiting, Hashing](part2-intermediate/26-web-security-hardening.md) · `중급` · 38 min
- **27.** [Caching](part2-intermediate/27-caching.md) · `중급` · 36 min
- **28.** [File Upload, Streaming, and Static Assets](part2-intermediate/28-file-upload-and-streaming.md) · `중급` · 45 min
- **29.** [OpenAPI I: Documenting Your API](part2-intermediate/29-openapi-fundamentals.md) · `중급` · 40 min
- **30.** [OpenAPI II: Operations, Security, Mapped Types, and the CLI Plugin](part2-intermediate/30-openapi-advanced.md) · `중급` · 45 min
- **31.** [Testing: Unit, Integration, and End-to-End](part2-intermediate/31-testing.md) · `중급` · 40 min
- **32.** [HTTP Client, Cookies, Sessions, and Compression](part2-intermediate/32-http-cookies-sessions.md) · `중급` · 45 min
- **33.** [Server-Side Rendering (MVC) and API Versioning](part2-intermediate/33-mvc-and-versioning.md) · `중급` · 40 min
- **34.** [Task Scheduling and In-Process Events](part2-intermediate/34-scheduling-and-events.md) · `중급` · 38 min
- **35.** [Queues and Background Jobs with BullMQ](part2-intermediate/35-queues.md) · `중급` · 45 min

### Part III — Advanced (고급)

*심화 — DI 내부, 분산 시스템, GraphQL, 운영*

- **36.** [Custom Providers and Advanced DI Patterns](part3-advanced/36-custom-providers.md) · `고급` · 40 min
- **37.** [Dynamic Modules and Configurable Module Builders](part3-advanced/37-dynamic-modules.md) · `고급` · 40 min
- **38.** [Injection Scopes and Request-Scoped Providers](part3-advanced/38-injection-scopes.md) · `고급` · 40 min
- **39.** [Lifecycle Events and Graceful Shutdown](part3-advanced/39-lifecycle-and-shutdown.md) · `고급` · 45 min
- **40.** [Execution Context and Platform Agnosticism](part3-advanced/40-execution-context.md) · `고급` · 45 min
- **41.** [ModuleRef, DiscoveryService, Lazy Loading, and Circular Dependencies](part3-advanced/41-module-ref-discovery-lazy.md) · `고급` · 50 min
- **42.** [Standalone Applications and Building CLIs](part3-advanced/42-standalone-and-cli-apps.md) · `고급` · 45 min
- **43.** [AsyncLocalStorage and Request Context Propagation](part3-advanced/43-async-local-storage.md) · `고급` · 45 min
- **44.** [WebSockets: Gateways, Adapters, and the Pipeline](part3-advanced/44-websockets.md) · `고급` · 50 min
- **45.** [Microservices I: Fundamentals and Message Patterns](part3-advanced/45-microservices-fundamentals.md) · `고급` · 50 min
- **46.** [Microservices II: Redis, MQTT, NATS, and RabbitMQ](part3-advanced/46-message-brokers.md) · `고급` · 50 min
- **47.** [Microservices III: Kafka](part3-advanced/47-kafka.md) · `고급` · 50 min
- **48.** [Microservices IV: gRPC](part3-advanced/48-grpc.md) · `고급` · 55 min
- **49.** [Microservices V: Writing a Custom Transporter](part3-advanced/49-custom-transporters.md) · `고급` · 50 min
- **50.** [GraphQL I: Code First, Schema First, and Resolvers](part3-advanced/50-graphql-fundamentals.md) · `고급` · 55 min
- **51.** [GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](part3-advanced/51-graphql-types-and-operations.md) · `고급` · 50 min
- **52.** [GraphQL III: Federation, Directives, Plugins, and Complexity](part3-advanced/52-graphql-advanced.md) · `고급` · 55 min
- **53.** [CQRS, Sagas, and Event Sourcing](part3-advanced/53-cqrs.md) · `고급` · 55 min
- **54.** [Monorepos, Workspaces, and Publishable Libraries](part3-advanced/54-monorepo-and-libraries.md) · `고급` · 40 min
- **55.** [Performance: Fastify, SWC, and Build Pipelines](part3-advanced/55-performance-and-compilation.md) · `고급` · 40 min
- **56.** [Observability: Health Checks, Sentry, and Devtools](part3-advanced/56-observability.md) · `고급` · 40 min
- **57.** [Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](part3-advanced/57-advanced-http.md) · `고급` · 50 min
- **58.** [Deployment and Serverless](part3-advanced/58-deployment-and-serverless.md) · `고급` · 50 min
- **59.** [Migrating to v11 and the Wider Ecosystem](part3-advanced/59-migration-and-ecosystem.md) · `고급` · 50 min

---

### 부록

- **A.** [Complete Decorator Reference](appendix/A-decorator-reference.md) — 생태계 전체 데코레이터 색인
- **B.** [Nest CLI Command Reference](appendix/B-cli-reference.md) — 명령·스키매틱·`nest-cli.json` 전체 스키마
- **C.** [Official Doc → Chapter Map](appendix/C-doc-to-chapter-map.md) — 공식 문서 136개 파일 역색인
- **D.** [Glossary (한/영 대역)](appendix/D-glossary.md) — 168개 용어 한국어 정의

---

### 각 장의 구성

모든 장은 같은 골격을 따릅니다.

1. **한눈에 보기** — 한국어 요약
2. **What you will learn** — 습득할 능력 목록
3. **Why this matters** — 이 장이 설명하는 실제 실패 사례
4. 개념 섹션 (mermaid 다이어그램·옵션 표 포함)
5. **Common mistakes** — 증상 → 원인 → 해결
6. **Putting it together** — 장 전체를 쓰는 실행 가능한 예제
7. **핵심 정리** / **연습 문제** — 한국어

