---
appendix: "C"
title: "Official Doc → Chapter Map"
kind: reference
nest_baseline: "11.x"
---

# Appendix C — Official Doc → Chapter Map

공식 NestJS 문서(`nestjs/docs.nestjs.com`의 `content/` 디렉터리) **136개 파일 전체**가 이 교과서의 어느 장에서 다뤄지는지 보여주는 역색인입니다. 공식 문서에서 출발해 이 책으로 들어오고 싶을 때, 또는 특정 문서의 내용이 어디까지 확장되었는지 확인하고 싶을 때 사용하세요.

반대 방향(장 → 원문)은 각 장 frontmatter의 `source_docs` 필드에 기록되어 있습니다.


> 커버리지: 공식 문서 **136개 파일 → 59개 장**. 누락된 문서는 없습니다.


## 루트 문서 (core building blocks)

| 공식 문서 | 다루는 장 |
|---|---|
| `content/application-context.md` | [Ch. 42 — Standalone Applications and Building CLIs](../part3-advanced/42-standalone-and-cli-apps.md) |
| `content/components.md` | [Ch. 5 — Providers and Services: The Unit of Business Logic](../part1-beginner/05-providers-and-services.md) |
| `content/controllers.md` | [Ch. 3 — Controllers I: Routing, Parameters, and the Request](../part1-beginner/03-controllers-routing.md), [Ch. 4 — Controllers II: Responses, Status Codes, DTOs, and Async](../part1-beginner/04-controllers-responses.md) |
| `content/custom-decorators.md` | [Ch. 13 — Custom Decorators and the Complete Request Lifecycle](../part1-beginner/13-custom-decorators-and-lifecycle.md) |
| `content/deployment.md` | [Ch. 58 — Deployment and Serverless](../part3-advanced/58-deployment-and-serverless.md) |
| `content/enterprise.md` | [Ch. 1 — What NestJS Is: Architecture, Philosophy, and the Module Graph](../part1-beginner/01-what-is-nestjs.md), [Ch. 59 — Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) |
| `content/exception-filters.md` | [Ch. 9 — Exception Filters and Error Handling](../part1-beginner/09-exception-filters.md) |
| `content/first-steps.md` | [Ch. 1 — What NestJS Is: Architecture, Philosophy, and the Module Graph](../part1-beginner/01-what-is-nestjs.md), [Ch. 14 — Building Your First Complete CRUD Application](../part1-beginner/14-first-crud-application.md) |
| `content/guards.md` | [Ch. 11 — Guards: Authorization at the Route Boundary](../part1-beginner/11-guards.md) |
| `content/interceptors.md` | [Ch. 12 — Interceptors and the Response Pipeline](../part1-beginner/12-interceptors.md) |
| `content/introduction.md` | [Ch. 1 — What NestJS Is: Architecture, Philosophy, and the Module Graph](../part1-beginner/01-what-is-nestjs.md) |
| `content/middlewares.md` | [Ch. 8 — Middleware: The Layer Before Nest](../part1-beginner/08-middleware.md) |
| `content/migration.md` | [Ch. 59 — Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) |
| `content/modules.md` | [Ch. 6 — Modules: Structuring the Application Graph](../part1-beginner/06-modules.md) |
| `content/pipes.md` | [Ch. 10 — Pipes: Transformation and Validation](../part1-beginner/10-pipes-and-validation.md) |
| `content/support.md` | [Ch. 1 — What NestJS Is: Architecture, Philosophy, and the Module Graph](../part1-beginner/01-what-is-nestjs.md), [Ch. 59 — Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) |

## fundamentals/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/fundamentals/async-components.md` | [Ch. 7 — Dependency Injection: How Nest Wires Your Application](../part1-beginner/07-dependency-injection-basics.md), [Ch. 36 — Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md) |
| `content/fundamentals/circular-dependency.md` | [Ch. 41 — ModuleRef, DiscoveryService, Lazy Loading, and Circular Dependencies](../part3-advanced/41-module-ref-discovery-lazy.md) |
| `content/fundamentals/dependency-injection.md` | [Ch. 7 — Dependency Injection: How Nest Wires Your Application](../part1-beginner/07-dependency-injection-basics.md), [Ch. 36 — Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md) |
| `content/fundamentals/discovery-service.md` | [Ch. 41 — ModuleRef, DiscoveryService, Lazy Loading, and Circular Dependencies](../part3-advanced/41-module-ref-discovery-lazy.md) |
| `content/fundamentals/dynamic-modules.md` | [Ch. 37 — Dynamic Modules and Configurable Module Builders](../part3-advanced/37-dynamic-modules.md) |
| `content/fundamentals/execution-context.md` | [Ch. 40 — Execution Context and Platform Agnosticism](../part3-advanced/40-execution-context.md) |
| `content/fundamentals/lazy-loading-modules.md` | [Ch. 41 — ModuleRef, DiscoveryService, Lazy Loading, and Circular Dependencies](../part3-advanced/41-module-ref-discovery-lazy.md) |
| `content/fundamentals/lifecycle-events.md` | [Ch. 39 — Lifecycle Events and Graceful Shutdown](../part3-advanced/39-lifecycle-and-shutdown.md) |
| `content/fundamentals/module-reference.md` | [Ch. 41 — ModuleRef, DiscoveryService, Lazy Loading, and Circular Dependencies](../part3-advanced/41-module-ref-discovery-lazy.md) |
| `content/fundamentals/platform-agnosticism.md` | [Ch. 40 — Execution Context and Platform Agnosticism](../part3-advanced/40-execution-context.md) |
| `content/fundamentals/provider-scopes.md` | [Ch. 38 — Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md) |
| `content/fundamentals/unit-testing.md` | [Ch. 31 — Testing: Unit, Integration, and End-to-End](../part2-intermediate/31-testing.md) |

## techniques/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/techniques/caching.md` | [Ch. 27 — Caching](../part2-intermediate/27-caching.md) |
| `content/techniques/compression.md` | [Ch. 32 — HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md) |
| `content/techniques/configuration.md` | [Ch. 17 — Configuration and Environment Management](../part2-intermediate/17-configuration.md) |
| `content/techniques/cookies.md` | [Ch. 32 — HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md) |
| `content/techniques/events.md` | [Ch. 34 — Task Scheduling and In-Process Events](../part2-intermediate/34-scheduling-and-events.md) |
| `content/techniques/file-upload.md` | [Ch. 28 — File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md) |
| `content/techniques/http-module.md` | [Ch. 32 — HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md) |
| `content/techniques/logger.md` | [Ch. 18 — Logging: Built-in, Custom, and Structured](../part2-intermediate/18-logging.md) |
| `content/techniques/mongo.md` | [Ch. 21 — MongoDB with Mongoose](../part2-intermediate/21-mongodb-mongoose.md) |
| `content/techniques/mvc.md` | [Ch. 33 — Server-Side Rendering (MVC) and API Versioning](../part2-intermediate/33-mvc-and-versioning.md) |
| `content/techniques/performance.md` | [Ch. 55 — Performance: Fastify, SWC, and Build Pipelines](../part3-advanced/55-performance-and-compilation.md) |
| `content/techniques/queues.md` | [Ch. 35 — Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md) |
| `content/techniques/serialization.md` | [Ch. 16 — Serialization: Shaping What Leaves Your API](../part2-intermediate/16-serialization.md) |
| `content/techniques/server-sent-events.md` | [Ch. 57 — Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md) |
| `content/techniques/sessions.md` | [Ch. 32 — HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md) |
| `content/techniques/sql.md` | [Ch. 19 — SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md), [Ch. 20 — Sequelize and MikroORM](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `content/techniques/streaming-files.md` | [Ch. 28 — File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md) |
| `content/techniques/task-scheduling.md` | [Ch. 34 — Task Scheduling and In-Process Events](../part2-intermediate/34-scheduling-and-events.md) |
| `content/techniques/validation.md` | [Ch. 15 — Validation in Depth: class-validator, class-transformer, and Custom Pipes](../part2-intermediate/15-validation-in-depth.md) |
| `content/techniques/versioning.md` | [Ch. 33 — Server-Side Rendering (MVC) and API Versioning](../part2-intermediate/33-mvc-and-versioning.md) |

## security/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/security/authentication.md` | [Ch. 23 — Authentication: Sessions, JWT, and Passport](../part2-intermediate/23-authentication.md) |
| `content/security/authorization.md` | [Ch. 25 — Authorization: RBAC, Claims, and CASL](../part2-intermediate/25-authorization.md) |
| `content/security/cors.md` | [Ch. 26 — Hardening the Application: CORS, Helmet, CSRF, Rate Limiting, Hashing](../part2-intermediate/26-web-security-hardening.md) |
| `content/security/csrf.md` | [Ch. 26 — Hardening the Application: CORS, Helmet, CSRF, Rate Limiting, Hashing](../part2-intermediate/26-web-security-hardening.md) |
| `content/security/encryption-hashing.md` | [Ch. 26 — Hardening the Application: CORS, Helmet, CSRF, Rate Limiting, Hashing](../part2-intermediate/26-web-security-hardening.md) |
| `content/security/helmet.md` | [Ch. 26 — Hardening the Application: CORS, Helmet, CSRF, Rate Limiting, Hashing](../part2-intermediate/26-web-security-hardening.md) |
| `content/security/rate-limiting.md` | [Ch. 26 — Hardening the Application: CORS, Helmet, CSRF, Rate Limiting, Hashing](../part2-intermediate/26-web-security-hardening.md) |

## openapi/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/openapi/cli-plugin.md` | [Ch. 30 — OpenAPI II: Operations, Security, Mapped Types, and the CLI Plugin](../part2-intermediate/30-openapi-advanced.md) |
| `content/openapi/decorators.md` | [Ch. 29 — OpenAPI I: Documenting Your API](../part2-intermediate/29-openapi-fundamentals.md) |
| `content/openapi/introduction.md` | [Ch. 29 — OpenAPI I: Documenting Your API](../part2-intermediate/29-openapi-fundamentals.md) |
| `content/openapi/mapped-types.md` | [Ch. 30 — OpenAPI II: Operations, Security, Mapped Types, and the CLI Plugin](../part2-intermediate/30-openapi-advanced.md) |
| `content/openapi/operations.md` | [Ch. 30 — OpenAPI II: Operations, Security, Mapped Types, and the CLI Plugin](../part2-intermediate/30-openapi-advanced.md) |
| `content/openapi/other-features.md` | [Ch. 30 — OpenAPI II: Operations, Security, Mapped Types, and the CLI Plugin](../part2-intermediate/30-openapi-advanced.md) |
| `content/openapi/security.md` | [Ch. 30 — OpenAPI II: Operations, Security, Mapped Types, and the CLI Plugin](../part2-intermediate/30-openapi-advanced.md) |
| `content/openapi/types-and-parameters.md` | [Ch. 29 — OpenAPI I: Documenting Your API](../part2-intermediate/29-openapi-fundamentals.md) |

## graphql/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/graphql/cli-plugin.md` | [Ch. 50 — GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md) |
| `content/graphql/complexity.md` | [Ch. 52 — GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) |
| `content/graphql/directives.md` | [Ch. 52 — GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) |
| `content/graphql/extensions.md` | [Ch. 52 — GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) |
| `content/graphql/federation.md` | [Ch. 52 — GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) |
| `content/graphql/field-middleware.md` | [Ch. 52 — GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) |
| `content/graphql/guards-interceptors.md` | [Ch. 52 — GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) |
| `content/graphql/interfaces.md` | [Ch. 51 — GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md) |
| `content/graphql/mapped-types.md` | [Ch. 51 — GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md) |
| `content/graphql/mutations.md` | [Ch. 51 — GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md) |
| `content/graphql/plugins.md` | [Ch. 52 — GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) |
| `content/graphql/quick-start.md` | [Ch. 50 — GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md) |
| `content/graphql/resolvers-map.md` | [Ch. 50 — GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md) |
| `content/graphql/scalars.md` | [Ch. 51 — GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md) |
| `content/graphql/schema-generator.md` | [Ch. 50 — GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md) |
| `content/graphql/sharing-models.md` | [Ch. 50 — GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md) |
| `content/graphql/subscriptions.md` | [Ch. 51 — GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md) |
| `content/graphql/unions-and-enums.md` | [Ch. 51 — GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md) |

## microservices/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/microservices/basics.md` | [Ch. 45 — Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md) |
| `content/microservices/custom-transport.md` | [Ch. 49 — Microservices V: Writing a Custom Transporter](../part3-advanced/49-custom-transporters.md) |
| `content/microservices/exception-filters.md` | [Ch. 45 — Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md) |
| `content/microservices/grpc.md` | [Ch. 48 — Microservices IV: gRPC](../part3-advanced/48-grpc.md) |
| `content/microservices/guards.md` | [Ch. 45 — Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md) |
| `content/microservices/interceptors.md` | [Ch. 45 — Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md) |
| `content/microservices/kafka.md` | [Ch. 47 — Microservices III: Kafka](../part3-advanced/47-kafka.md) |
| `content/microservices/mqtt.md` | [Ch. 46 — Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md) |
| `content/microservices/nats.md` | [Ch. 46 — Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md) |
| `content/microservices/pipes.md` | [Ch. 45 — Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md) |
| `content/microservices/rabbitmq.md` | [Ch. 46 — Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md) |
| `content/microservices/redis.md` | [Ch. 46 — Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md) |

## websockets/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/websockets/adapter.md` | [Ch. 44 — WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md) |
| `content/websockets/exception-filters.md` | [Ch. 44 — WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md) |
| `content/websockets/gateways.md` | [Ch. 44 — WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md) |
| `content/websockets/guards.md` | [Ch. 44 — WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md) |
| `content/websockets/interceptors.md` | [Ch. 44 — WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md) |
| `content/websockets/pipes.md` | [Ch. 44 — WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md) |

## recipes/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/recipes/async-local-storage.md` | [Ch. 43 — AsyncLocalStorage and Request Context Propagation](../part3-advanced/43-async-local-storage.md) |
| `content/recipes/cqrs.md` | [Ch. 53 — CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md) |
| `content/recipes/crud-generator.md` | [Ch. 14 — Building Your First Complete CRUD Application](../part1-beginner/14-first-crud-application.md) |
| `content/recipes/documentation.md` | [Ch. 59 — Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) |
| `content/recipes/hot-reload.md` | [Ch. 2 — The Nest CLI, Project Layout, and the Development Loop](../part1-beginner/02-cli-and-project-setup.md) |
| `content/recipes/mikroorm.md` | [Ch. 20 — Sequelize and MikroORM](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `content/recipes/mongodb.md` | [Ch. 21 — MongoDB with Mongoose](../part2-intermediate/21-mongodb-mongoose.md) |
| `content/recipes/necord.md` | [Ch. 59 — Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) |
| `content/recipes/nest-commander.md` | [Ch. 42 — Standalone Applications and Building CLIs](../part3-advanced/42-standalone-and-cli-apps.md), [Ch. 59 — Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) |
| `content/recipes/passport.md` | [Ch. 24 — Passport in Practice: Strategies, Guards, and Refresh Flows](../part2-intermediate/24-passport-strategies.md) |
| `content/recipes/prisma.md` | [Ch. 22 — Prisma: Type-Safe Data Access](../part2-intermediate/22-prisma.md) |
| `content/recipes/repl.md` | [Ch. 2 — The Nest CLI, Project Layout, and the Development Loop](../part1-beginner/02-cli-and-project-setup.md), [Ch. 14 — Building Your First Complete CRUD Application](../part1-beginner/14-first-crud-application.md), [Ch. 42 — Standalone Applications and Building CLIs](../part3-advanced/42-standalone-and-cli-apps.md) |
| `content/recipes/router-module.md` | [Ch. 57 — Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md) |
| `content/recipes/sentry.md` | [Ch. 56 — Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md) |
| `content/recipes/serve-static.md` | [Ch. 28 — File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md) |
| `content/recipes/sql-sequelize.md` | [Ch. 20 — Sequelize and MikroORM](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `content/recipes/sql-typeorm.md` | [Ch. 19 — SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md) |
| `content/recipes/suites.md` | [Ch. 31 — Testing: Unit, Integration, and End-to-End](../part2-intermediate/31-testing.md) |
| `content/recipes/swc.md` | [Ch. 55 — Performance: Fastify, SWC, and Build Pipelines](../part3-advanced/55-performance-and-compilation.md) |
| `content/recipes/terminus.md` | [Ch. 56 — Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md) |

## cli/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/cli/libraries.md` | [Ch. 54 — Monorepos, Workspaces, and Publishable Libraries](../part3-advanced/54-monorepo-and-libraries.md) |
| `content/cli/overview.md` | [Ch. 2 — The Nest CLI, Project Layout, and the Development Loop](../part1-beginner/02-cli-and-project-setup.md) |
| `content/cli/scripts.md` | [Ch. 2 — The Nest CLI, Project Layout, and the Development Loop](../part1-beginner/02-cli-and-project-setup.md) |
| `content/cli/usages.md` | [Ch. 2 — The Nest CLI, Project Layout, and the Development Loop](../part1-beginner/02-cli-and-project-setup.md) |
| `content/cli/workspaces.md` | [Ch. 54 — Monorepos, Workspaces, and Publishable Libraries](../part3-advanced/54-monorepo-and-libraries.md) |

## faq/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/faq/errors.md` | [Ch. 9 — Exception Filters and Error Handling](../part1-beginner/09-exception-filters.md) |
| `content/faq/global-prefix.md` | [Ch. 3 — Controllers I: Routing, Parameters, and the Request](../part1-beginner/03-controllers-routing.md), [Ch. 14 — Building Your First Complete CRUD Application](../part1-beginner/14-first-crud-application.md) |
| `content/faq/http-adapter.md` | [Ch. 57 — Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md) |
| `content/faq/hybrid-application.md` | [Ch. 45 — Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md), [Ch. 57 — Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md) |
| `content/faq/keep-alive-connections.md` | [Ch. 55 — Performance: Fastify, SWC, and Build Pipelines](../part3-advanced/55-performance-and-compilation.md) |
| `content/faq/multiple-servers.md` | [Ch. 57 — Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md) |
| `content/faq/raw-body.md` | [Ch. 28 — File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md), [Ch. 57 — Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md) |
| `content/faq/request-lifecycle.md` | [Ch. 13 — Custom Decorators and the Complete Request Lifecycle](../part1-beginner/13-custom-decorators-and-lifecycle.md) |
| `content/faq/serverless.md` | [Ch. 58 — Deployment and Serverless](../part3-advanced/58-deployment-and-serverless.md) |

## devtools/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/devtools/ci-cd.md` | [Ch. 56 — Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md) |
| `content/devtools/overview.md` | [Ch. 56 — Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md) |

## discover/

| 공식 문서 | 다루는 장 |
|---|---|
| `content/discover/who-uses.md` | [Ch. 1 — What NestJS Is: Architecture, Philosophy, and the Module Graph](../part1-beginner/01-what-is-nestjs.md), [Ch. 59 — Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) |

## 장 → 원문 요약

| 장 | 제목 | 원문 |
|---|---|---|
| 1 | [What NestJS Is: Architecture, Philosophy, and the Module Graph](../part1-beginner/01-what-is-nestjs.md) | `content/introduction.md`, `content/first-steps.md`, `content/discover/who-uses.md`, `content/enterprise.md`, `content/support.md` |
| 2 | [The Nest CLI, Project Layout, and the Development Loop](../part1-beginner/02-cli-and-project-setup.md) | `content/cli/overview.md`, `content/cli/usages.md`, `content/cli/scripts.md`, `content/recipes/hot-reload.md`, `content/recipes/repl.md` |
| 3 | [Controllers I: Routing, Parameters, and the Request](../part1-beginner/03-controllers-routing.md) | `content/controllers.md`, `content/faq/global-prefix.md` |
| 4 | [Controllers II: Responses, Status Codes, DTOs, and Async](../part1-beginner/04-controllers-responses.md) | `content/controllers.md` |
| 5 | [Providers and Services: The Unit of Business Logic](../part1-beginner/05-providers-and-services.md) | `content/components.md` |
| 6 | [Modules: Structuring the Application Graph](../part1-beginner/06-modules.md) | `content/modules.md` |
| 7 | [Dependency Injection: How Nest Wires Your Application](../part1-beginner/07-dependency-injection-basics.md) | `content/fundamentals/dependency-injection.md`, `content/fundamentals/async-components.md` |
| 8 | [Middleware: The Layer Before Nest](../part1-beginner/08-middleware.md) | `content/middlewares.md` |
| 9 | [Exception Filters and Error Handling](../part1-beginner/09-exception-filters.md) | `content/exception-filters.md`, `content/faq/errors.md` |
| 10 | [Pipes: Transformation and Validation](../part1-beginner/10-pipes-and-validation.md) | `content/pipes.md` |
| 11 | [Guards: Authorization at the Route Boundary](../part1-beginner/11-guards.md) | `content/guards.md` |
| 12 | [Interceptors and the Response Pipeline](../part1-beginner/12-interceptors.md) | `content/interceptors.md` |
| 13 | [Custom Decorators and the Complete Request Lifecycle](../part1-beginner/13-custom-decorators-and-lifecycle.md) | `content/custom-decorators.md`, `content/faq/request-lifecycle.md` |
| 14 | [Building Your First Complete CRUD Application](../part1-beginner/14-first-crud-application.md) | `content/recipes/crud-generator.md`, `content/recipes/repl.md`, `content/faq/global-prefix.md`, `content/first-steps.md` |
| 15 | [Validation in Depth: class-validator, class-transformer, and Custom Pipes](../part2-intermediate/15-validation-in-depth.md) | `content/techniques/validation.md` |
| 16 | [Serialization: Shaping What Leaves Your API](../part2-intermediate/16-serialization.md) | `content/techniques/serialization.md` |
| 17 | [Configuration and Environment Management](../part2-intermediate/17-configuration.md) | `content/techniques/configuration.md` |
| 18 | [Logging: Built-in, Custom, and Structured](../part2-intermediate/18-logging.md) | `content/techniques/logger.md` |
| 19 | [SQL Databases with TypeORM](../part2-intermediate/19-sql-with-typeorm.md) | `content/techniques/sql.md`, `content/recipes/sql-typeorm.md` |
| 20 | [Sequelize and MikroORM](../part2-intermediate/20-sequelize-and-mikroorm.md) | `content/techniques/sql.md`, `content/recipes/sql-sequelize.md`, `content/recipes/mikroorm.md` |
| 21 | [MongoDB with Mongoose](../part2-intermediate/21-mongodb-mongoose.md) | `content/techniques/mongo.md`, `content/recipes/mongodb.md` |
| 22 | [Prisma: Type-Safe Data Access](../part2-intermediate/22-prisma.md) | `content/recipes/prisma.md` |
| 23 | [Authentication: Sessions, JWT, and Passport](../part2-intermediate/23-authentication.md) | `content/security/authentication.md` |
| 24 | [Passport in Practice: Strategies, Guards, and Refresh Flows](../part2-intermediate/24-passport-strategies.md) | `content/recipes/passport.md` |
| 25 | [Authorization: RBAC, Claims, and CASL](../part2-intermediate/25-authorization.md) | `content/security/authorization.md` |
| 26 | [Hardening the Application: CORS, Helmet, CSRF, Rate Limiting, Hashing](../part2-intermediate/26-web-security-hardening.md) | `content/security/cors.md`, `content/security/helmet.md`, `content/security/csrf.md`, `content/security/rate-limiting.md`, `content/security/encryption-hashing.md` |
| 27 | [Caching](../part2-intermediate/27-caching.md) | `content/techniques/caching.md` |
| 28 | [File Upload, Streaming, and Static Assets](../part2-intermediate/28-file-upload-and-streaming.md) | `content/techniques/file-upload.md`, `content/techniques/streaming-files.md`, `content/recipes/serve-static.md`, `content/faq/raw-body.md` |
| 29 | [OpenAPI I: Documenting Your API](../part2-intermediate/29-openapi-fundamentals.md) | `content/openapi/introduction.md`, `content/openapi/types-and-parameters.md`, `content/openapi/decorators.md` |
| 30 | [OpenAPI II: Operations, Security, Mapped Types, and the CLI Plugin](../part2-intermediate/30-openapi-advanced.md) | `content/openapi/operations.md`, `content/openapi/security.md`, `content/openapi/mapped-types.md`, `content/openapi/cli-plugin.md`, `content/openapi/other-features.md` |
| 31 | [Testing: Unit, Integration, and End-to-End](../part2-intermediate/31-testing.md) | `content/fundamentals/unit-testing.md`, `content/recipes/suites.md` |
| 32 | [HTTP Client, Cookies, Sessions, and Compression](../part2-intermediate/32-http-cookies-sessions.md) | `content/techniques/http-module.md`, `content/techniques/cookies.md`, `content/techniques/sessions.md`, `content/techniques/compression.md` |
| 33 | [Server-Side Rendering (MVC) and API Versioning](../part2-intermediate/33-mvc-and-versioning.md) | `content/techniques/mvc.md`, `content/techniques/versioning.md` |
| 34 | [Task Scheduling and In-Process Events](../part2-intermediate/34-scheduling-and-events.md) | `content/techniques/task-scheduling.md`, `content/techniques/events.md` |
| 35 | [Queues and Background Jobs with BullMQ](../part2-intermediate/35-queues.md) | `content/techniques/queues.md` |
| 36 | [Custom Providers and Advanced DI Patterns](../part3-advanced/36-custom-providers.md) | `content/fundamentals/dependency-injection.md`, `content/fundamentals/async-components.md` |
| 37 | [Dynamic Modules and Configurable Module Builders](../part3-advanced/37-dynamic-modules.md) | `content/fundamentals/dynamic-modules.md` |
| 38 | [Injection Scopes and Request-Scoped Providers](../part3-advanced/38-injection-scopes.md) | `content/fundamentals/provider-scopes.md` |
| 39 | [Lifecycle Events and Graceful Shutdown](../part3-advanced/39-lifecycle-and-shutdown.md) | `content/fundamentals/lifecycle-events.md` |
| 40 | [Execution Context and Platform Agnosticism](../part3-advanced/40-execution-context.md) | `content/fundamentals/execution-context.md`, `content/fundamentals/platform-agnosticism.md` |
| 41 | [ModuleRef, DiscoveryService, Lazy Loading, and Circular Dependencies](../part3-advanced/41-module-ref-discovery-lazy.md) | `content/fundamentals/module-reference.md`, `content/fundamentals/discovery-service.md`, `content/fundamentals/lazy-loading-modules.md`, `content/fundamentals/circular-dependency.md` |
| 42 | [Standalone Applications and Building CLIs](../part3-advanced/42-standalone-and-cli-apps.md) | `content/application-context.md`, `content/recipes/nest-commander.md`, `content/recipes/repl.md` |
| 43 | [AsyncLocalStorage and Request Context Propagation](../part3-advanced/43-async-local-storage.md) | `content/recipes/async-local-storage.md` |
| 44 | [WebSockets: Gateways, Adapters, and the Pipeline](../part3-advanced/44-websockets.md) | `content/websockets/gateways.md`, `content/websockets/adapter.md`, `content/websockets/pipes.md`, `content/websockets/guards.md`, `content/websockets/interceptors.md`, `content/websockets/exception-filters.md` |
| 45 | [Microservices I: Fundamentals and Message Patterns](../part3-advanced/45-microservices-fundamentals.md) | `content/microservices/basics.md`, `content/microservices/guards.md`, `content/microservices/pipes.md`, `content/microservices/interceptors.md`, `content/microservices/exception-filters.md`, `content/faq/hybrid-application.md` |
| 46 | [Microservices II: Redis, MQTT, NATS, and RabbitMQ](../part3-advanced/46-message-brokers.md) | `content/microservices/redis.md`, `content/microservices/mqtt.md`, `content/microservices/nats.md`, `content/microservices/rabbitmq.md` |
| 47 | [Microservices III: Kafka](../part3-advanced/47-kafka.md) | `content/microservices/kafka.md` |
| 48 | [Microservices IV: gRPC](../part3-advanced/48-grpc.md) | `content/microservices/grpc.md` |
| 49 | [Microservices V: Writing a Custom Transporter](../part3-advanced/49-custom-transporters.md) | `content/microservices/custom-transport.md` |
| 50 | [GraphQL I: Code First, Schema First, and Resolvers](../part3-advanced/50-graphql-fundamentals.md) | `content/graphql/quick-start.md`, `content/graphql/resolvers-map.md`, `content/graphql/cli-plugin.md`, `content/graphql/schema-generator.md`, `content/graphql/sharing-models.md` |
| 51 | [GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces](../part3-advanced/51-graphql-types-and-operations.md) | `content/graphql/mutations.md`, `content/graphql/subscriptions.md`, `content/graphql/scalars.md`, `content/graphql/unions-and-enums.md`, `content/graphql/interfaces.md`, `content/graphql/mapped-types.md` |
| 52 | [GraphQL III: Federation, Directives, Plugins, and Complexity](../part3-advanced/52-graphql-advanced.md) | `content/graphql/guards-interceptors.md`, `content/graphql/field-middleware.md`, `content/graphql/extensions.md`, `content/graphql/directives.md`, `content/graphql/complexity.md`, `content/graphql/plugins.md`, `content/graphql/federation.md` |
| 53 | [CQRS, Sagas, and Event Sourcing](../part3-advanced/53-cqrs.md) | `content/recipes/cqrs.md` |
| 54 | [Monorepos, Workspaces, and Publishable Libraries](../part3-advanced/54-monorepo-and-libraries.md) | `content/cli/workspaces.md`, `content/cli/libraries.md` |
| 55 | [Performance: Fastify, SWC, and Build Pipelines](../part3-advanced/55-performance-and-compilation.md) | `content/techniques/performance.md`, `content/recipes/swc.md`, `content/faq/keep-alive-connections.md` |
| 56 | [Observability: Health Checks, Sentry, and Devtools](../part3-advanced/56-observability.md) | `content/recipes/terminus.md`, `content/recipes/sentry.md`, `content/devtools/overview.md`, `content/devtools/ci-cd.md` |
| 57 | [Advanced HTTP: Hybrid Apps, Multiple Servers, Adapters, Raw Body, SSE](../part3-advanced/57-advanced-http.md) | `content/faq/http-adapter.md`, `content/faq/multiple-servers.md`, `content/faq/hybrid-application.md`, `content/recipes/router-module.md`, `content/techniques/server-sent-events.md`, `content/faq/raw-body.md` |
| 58 | [Deployment and Serverless](../part3-advanced/58-deployment-and-serverless.md) | `content/deployment.md`, `content/faq/serverless.md` |
| 59 | [Migrating to v11 and the Wider Ecosystem](../part3-advanced/59-migration-and-ecosystem.md) | `content/migration.md`, `content/recipes/documentation.md`, `content/recipes/necord.md`, `content/recipes/nest-commander.md`, `content/enterprise.md`, `content/support.md`, `content/discover/who-uses.md` |
