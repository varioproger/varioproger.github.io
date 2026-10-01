---
appendix: "A"
title: "Complete Decorator Reference"
kind: reference
nest_baseline: "11.x"
---

# Appendix A — Complete Decorator Reference

> **이 부록 사용법 (한국어)**
> 이 부록은 NestJS 11.x 생태계에서 실제로 쓰이는 모든 데코레이터를 **패키지별·역할별로 묶어 정리한 조회용 표**입니다. 본문 장(章)처럼 처음부터 끝까지 읽는 것이 아니라, 코드를 쓰다가 "이 데코레이터 시그니처가 뭐였지", "이건 어느 패키지에서 import 하지", "이 옵션이 실제로 무엇을 바꾸지"가 궁금할 때 해당 그룹만 펼쳐 보도록 설계했습니다. 각 행은 `시그니처 · 패키지 · 하는 일 · 해당 장 링크` 네 칸으로 되어 있으며, 마지막 칸의 링크를 따라가면 그 데코레이터가 *왜* 그렇게 동작하는지, 어떤 함정이 있는지를 설명한 본문 장으로 연결됩니다. 표는 의도적으로 짧게 썼습니다 — 표는 "무엇"을 알려주고, 장은 "왜"를 알려줍니다. 둘 중 하나만 읽어야 한다면 처음에는 장을, 두 번째부터는 표를 보십시오. 데코레이터 이름 앞의 `@`는 생략하지 않았고, 타입 파라미터와 오버로드는 가장 자주 쓰이는 형태 하나만 실었습니다. `@nestjs/*` 이외의 패키지(TypeORM, Mongoose, Sequelize, class-transformer 등)에서 오는 데코레이터도 Nest 애플리케이션에서 일상적으로 쓰이므로 함께 수록했습니다.

## How to read this appendix

Every table has the same four columns.

| Column | What it holds |
|---|---|
| **Decorator** | The signature as you actually type it, with the argument shapes that matter. Optional arguments are in `[]` in prose, `?` in TypeScript position. |
| **Package** | The exact module specifier to import from. Getting this wrong is the single most common cause of "decorator has no effect" — `@Query` from `@nestjs/common` and `@Query` from `@nestjs/graphql` are different decorators with the same name. |
| **What it does** | The mechanism, compressed to one or two sentences. Where a decorator only writes metadata that something else reads later, the table says so — that distinction explains most surprising behaviour. |
| **Chapter** | Where the reasoning lives. |

Three vocabulary notes that apply throughout:

- **Marker vs. registration.** Many Nest decorators do nothing but attach metadata via `Reflect.defineMetadata`. `@Injectable()` does not register a provider; the `providers` array of a `@Module()` does. `@Catch()` does not install a filter; `@UseFilters()` or `app.useGlobalFilters()` does. When the table says "marks", it means exactly this.
- **Binding levels.** Enhancer decorators (`@UseGuards`, `@UseInterceptors`, `@UseFilters`, `@UsePipes`) can be applied at three levels: globally (via `app.useGlobalX()` or an `APP_*` provider), at controller level, and at handler level. Execution order is global → controller → handler for guards/interceptors/pipes, and the reverse (most specific first) for exception filters.
- **Parameter decorators are not the request.** `@Body()`, `@Param()`, and friends do not read the request at decoration time. They register an *extractor function* keyed by parameter index; Nest runs it per request, then feeds the result through the parameter's pipes.

---

## 1. Module and provider decorators

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@Module(metadata: ModuleMetadata)` | `@nestjs/common` | Declares a module. `metadata` accepts `imports`, `controllers`, `providers`, `exports`. This is the only thing that actually registers providers and controllers into the injector. | [Ch 6 — Modules](../part1-beginner/06-modules.md) |
| `@Injectable(options?: { scope?: Scope, durable?: boolean })` | `@nestjs/common` | Marks a class so TypeScript emits `design:paramtypes` metadata, which is how Nest discovers constructor dependencies. `scope` is `Scope.DEFAULT`, `Scope.REQUEST`, or `Scope.TRANSIENT`; `durable: true` opts the provider into durable request-scoped sub-trees. | [Ch 5 — Providers](../part1-beginner/05-providers-and-services.md), [Ch 38 — Injection Scopes](../part3-advanced/38-injection-scopes.md) |
| `@Global()` | `@nestjs/common` | Applied to a `@Module()` class, puts everything the module `exports` into the global scope so consumers need not import it. Use sparingly — it hides the dependency graph. | [Ch 6 — Modules](../part1-beginner/06-modules.md) |
| `@Inject(token: string \| symbol \| Type \| Function)` | `@nestjs/common` | Overrides the token Nest resolves for a constructor parameter or property. Required for non-class tokens (strings, symbols) and for property injection. | [Ch 7 — DI Basics](../part1-beginner/07-dependency-injection-basics.md), [Ch 36 — Custom Providers](../part3-advanced/36-custom-providers.md) |
| `@Optional()` | `@nestjs/common` | Suppresses the "Nest can't resolve dependencies" error for one parameter; the parameter becomes `undefined` when no provider matches. | [Ch 7 — DI Basics](../part1-beginner/07-dependency-injection-basics.md) |
| `@Dependencies(...deps)` | `@nestjs/common` | Plain-JavaScript escape hatch: declares constructor dependencies where there is no TypeScript metadata to reflect on. Irrelevant in a TypeScript codebase. | [Ch 7 — DI Basics](../part1-beginner/07-dependency-injection-basics.md) |
| `@Bind(...decorators)` | `@nestjs/common` | Plain-JavaScript equivalent of parameter decorators on a handler. Same story: TypeScript users never need it. | [Ch 3 — Controllers I](../part1-beginner/03-controllers-routing.md) |

**The `@Injectable()` trap.** A class with no constructor dependencies works fine as a provider *without* `@Injectable()`, because there is nothing to reflect. Add one dependency later and it breaks with a confusing error. Always apply the decorator.

---

## 2. Controller and routing decorators

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@Controller(prefixOrOptions?)` | `@nestjs/common` | Marks a class as a controller and sets its route prefix. Accepts a string, a string array (multiple prefixes), or `{ path?, host?, scope?, version? }`. | [Ch 3 — Controllers I](../part1-beginner/03-controllers-routing.md) |
| `@Get(path?: string \| string[])` | `@nestjs/common` | Binds the method to HTTP GET at `path` under the controller prefix. Path may contain parameters (`:id`) and, on Express v5, must use `{*splat}` rather than bare `*` for wildcards. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Post(path?)` | `@nestjs/common` | HTTP POST. Default success status is 201; every other verb defaults to 200. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Put(path?)` | `@nestjs/common` | HTTP PUT — full replacement semantics. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Patch(path?)` | `@nestjs/common` | HTTP PATCH — partial update semantics. Pairs with `PartialType()` DTOs. | [Ch 4 — Controllers II](../part1-beginner/04-controllers-responses.md) |
| `@Delete(path?)` | `@nestjs/common` | HTTP DELETE. Frequently paired with `@HttpCode(204)`. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Options(path?)` | `@nestjs/common` | HTTP OPTIONS. Rarely hand-written — CORS middleware normally answers preflight. | [Ch 26 — Hardening](../part2-intermediate/26-web-security-hardening.md) |
| `@Head(path?)` | `@nestjs/common` | HTTP HEAD. Body is discarded by the platform; headers still apply. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Search(path?)` | `@nestjs/common` | HTTP SEARCH (RFC 5323 / the `QUERY`-style verb). Useful for large query payloads that do not fit in a URL. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@All(path?)` | `@nestjs/common` | Matches every HTTP method at the path. Handy for catch-all proxies; dangerous as a default. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Version(version: string \| string[] \| VERSION_NEUTRAL)` | `@nestjs/common` | Restricts a controller or handler to one or more API versions once `app.enableVersioning()` is on. `VERSION_NEUTRAL` matches every version and un-versioned requests. | [Ch 33 — MVC and Versioning](../part2-intermediate/33-mvc-and-versioning.md) |
| `@HostParam(property?: string)` | `@nestjs/common` | Extracts a token from the `host` option of `@Controller({ host: ':tenant.example.com' })`. Enables subdomain routing / multi-tenancy. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Redirect(url?: string, statusCode?: number)` | `@nestjs/common` | Issues a redirect (default 302). Returning `{ url, statusCode }` from the handler overrides the decorator's arguments at runtime. | [Ch 4](../part1-beginner/04-controllers-responses.md) |
| `@Header(name: string, value: string \| (() => string))` | `@nestjs/common` | Sets a response header. Stackable. In v11 the value may be a factory, evaluated per response. | [Ch 4](../part1-beginner/04-controllers-responses.md) |
| `@HttpCode(status: number)` | `@nestjs/common` | Overrides the default success status of the handler. Has no effect on error paths — those come from the exception filter. | [Ch 4](../part1-beginner/04-controllers-responses.md) |
| `@Render(template: string)` | `@nestjs/common` | Renders a server-side template with the object returned by the handler as the view model. Requires `app.setViewEngine()`. | [Ch 33 — MVC and Versioning](../part2-intermediate/33-mvc-and-versioning.md) |
| `@Sse(path?: string)` | `@nestjs/common` | Declares a Server-Sent Events endpoint. The handler must return an `Observable<MessageEvent>`; Nest sets the `text/event-stream` headers and keeps the connection open. | [Ch 57 — Advanced HTTP](../part3-advanced/57-advanced-http.md) |

**Ordering matters.** Routes are matched in declaration order within a controller, and controllers in module-registration order. `@Get(':id')` declared above `@Get('active')` will swallow `/active` — put static segments first.

---

## 3. Parameter decorators

All of these are imported from `@nestjs/common` and all accept an optional pipe list as trailing arguments, e.g. `@Param('id', ParseIntPipe)` or `@Body(new ValidationPipe({ whitelist: true }))`.

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@Req()` / `@Request()` | `@nestjs/common` | Injects the underlying platform request object (`express.Request` or `FastifyRequest`). Using it couples the handler to a platform — prefer a specific decorator. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Res({ passthrough?: boolean })` / `@Response()` | `@nestjs/common` | Injects the platform response object. **Injecting it disables Nest's response handling** (interceptors that map the return value stop working) unless you pass `{ passthrough: true }`. | [Ch 4](../part1-beginner/04-controllers-responses.md), [Ch 12 — Interceptors](../part1-beginner/12-interceptors.md) |
| `@Next()` | `@nestjs/common` | Injects Express's `next` function. Almost never correct inside a Nest handler; it exists for interop with Express-native code. | [Ch 8 — Middleware](../part1-beginner/08-middleware.md) |
| `@Param(key?: string, ...pipes)` | `@nestjs/common` | Whole `req.params` object, or one route parameter. Always a string before pipes run — hence `ParseIntPipe`. | [Ch 3](../part1-beginner/03-controllers-routing.md), [Ch 10 — Pipes](../part1-beginner/10-pipes-and-validation.md) |
| `@Query(key?: string, ...pipes)` | `@nestjs/common` | Whole query string object, or one key. For nested/array query strings enable the extended parser on the adapter. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Body(key?: string, ...pipes)` | `@nestjs/common` | Parsed request body, or one property of it. Requires a body parser (on by default). Passing a `key` bypasses whole-DTO validation — validate the DTO instead. | [Ch 4](../part1-beginner/04-controllers-responses.md), [Ch 15 — Validation in Depth](../part2-intermediate/15-validation-in-depth.md) |
| `@Headers(name?: string)` | `@nestjs/common` | All request headers as an object, or one header by name (case-insensitive). | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| `@Ip()` | `@nestjs/common` | The client IP as the adapter computes it. Behind a proxy this is the proxy's IP unless `app.set('trust proxy', …)` is configured. | [Ch 26 — Hardening](../part2-intermediate/26-web-security-hardening.md) |
| `@Session()` | `@nestjs/common` | The session object created by `express-session` / `@fastify/secure-session` middleware. Undefined if the middleware is not installed. | [Ch 32 — Cookies and Sessions](../part2-intermediate/32-http-cookies-sessions.md) |
| `@UploadedFile(fieldName?, ...pipes)` | `@nestjs/common` | The single file parsed by `FileInterceptor`. Must be paired with the interceptor or it is always `undefined`. | [Ch 28 — File Upload](../part2-intermediate/28-file-upload-and-streaming.md) |
| `@UploadedFiles(...pipes)` | `@nestjs/common` | The array (or keyed map) of files from `FilesInterceptor` / `FileFieldsInterceptor` / `AnyFilesInterceptor`. | [Ch 28](../part2-intermediate/28-file-upload-and-streaming.md) |
| `@HostParam(property?)` | `@nestjs/common` | See §2 — it is both a routing and a parameter decorator. | [Ch 3](../part1-beginner/03-controllers-routing.md) |
| *(no decorator)* — `@Req() req: RawBodyRequest<Request>` | `@nestjs/common` | There is no `@RawBody()` decorator. The unparsed `Buffer` is reached through the typed request: `rawBody: true` in `NestFactory.create()`, then `req.rawBody`. Essential for webhook signature verification. | [Ch 57 — Advanced HTTP](../part3-advanced/57-advanced-http.md) |

**Custom parameter decorators** are built with `createParamDecorator`. See §22 and [Chapter 13](../part1-beginner/13-custom-decorators-and-lifecycle.md).

---

## 4. Pipeline binding and metadata decorators

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@UseGuards(...guards: (CanActivate \| Type<CanActivate>)[])` | `@nestjs/common` | Attaches guards to a controller or handler. Guards run after middleware, before interceptors and pipes. Passing a class lets Nest instantiate it through DI; passing an instance does not. | [Ch 11 — Guards](../part1-beginner/11-guards.md) |
| `@UseInterceptors(...interceptors)` | `@nestjs/common` | Attaches interceptors, which wrap the handler on both the request and response side via RxJS. | [Ch 12 — Interceptors](../part1-beginner/12-interceptors.md) |
| `@UseFilters(...filters)` | `@nestjs/common` | Attaches exception filters. Unlike other enhancers, the *most specific* filter wins: handler-level before controller-level before global. | [Ch 9 — Exception Filters](../part1-beginner/09-exception-filters.md) |
| `@UsePipes(...pipes)` | `@nestjs/common` | Attaches pipes at controller or handler level. Prefer per-parameter pipes or a global `ValidationPipe`; controller-level `@UsePipes` is the least precise option. | [Ch 10 — Pipes](../part1-beginner/10-pipes-and-validation.md) |
| `@SetMetadata<K, V>(key: K, value: V)` | `@nestjs/common` | Writes arbitrary metadata onto a class or method, readable later with `Reflector`. The primitive under every roles/permissions decorator. | [Ch 11 — Guards](../part1-beginner/11-guards.md), [Ch 25 — Authorization](../part2-intermediate/25-authorization.md) |
| `Reflector.createDecorator<T>(options?)` | `@nestjs/core` | Not a decorator but a decorator *factory* — produces a type-safe metadata decorator plus the key to read it with. Prefer it over raw `@SetMetadata` in new code. | [Ch 11](../part1-beginner/11-guards.md), [Ch 13](../part1-beginner/13-custom-decorators-and-lifecycle.md) |
| `@Catch(...exceptions: Type<any>[])` | `@nestjs/common` | Marks a class as an exception filter and declares which exception types it handles. `@Catch()` with no arguments catches everything. | [Ch 9](../part1-beginner/09-exception-filters.md) |
| `applyDecorators(...decorators)` | `@nestjs/common` | Composes several decorators into one reusable decorator — the standard way to build an `@Auth(...roles)` that expands to `@UseGuards`, `@SetMetadata`, and `@ApiBearerAuth`. | [Ch 13](../part1-beginner/13-custom-decorators-and-lifecycle.md) |

### Global enhancer tokens

These are provider tokens, not decorators, but they belong beside the table above because they are the DI-aware alternative to `app.useGlobalX()`.

| Token | Package | Registers | Chapter |
|---|---|---|---|
| `APP_GUARD` | `@nestjs/core` | A globally scoped guard that can inject dependencies. | [Ch 11](../part1-beginner/11-guards.md) |
| `APP_INTERCEPTOR` | `@nestjs/core` | A globally scoped interceptor with DI. | [Ch 12](../part1-beginner/12-interceptors.md) |
| `APP_FILTER` | `@nestjs/core` | A globally scoped exception filter with DI. | [Ch 9](../part1-beginner/09-exception-filters.md) |
| `APP_PIPE` | `@nestjs/core` | A globally scoped pipe with DI (the usual home of `ValidationPipe`). | [Ch 10](../part1-beginner/10-pipes-and-validation.md) |

---

## 5. Lifecycle interfaces (not decorators — implement them)

Nest has no `@OnInit()` decorator. Lifecycle participation is declared by implementing an interface; Nest discovers the method by name during bootstrap and shutdown.

| Interface | Method | When it runs | Chapter |
|---|---|---|---|
| `OnModuleInit` | `onModuleInit()` | Once, after the host module's dependencies are resolved. Bottom-up through the module graph. | [Ch 39 — Lifecycle](../part3-advanced/39-lifecycle-and-shutdown.md) |
| `OnApplicationBootstrap` | `onApplicationBootstrap()` | Once, after *every* module has finished `onModuleInit`. The safe place to touch other modules. | [Ch 39](../part3-advanced/39-lifecycle-and-shutdown.md) |
| `OnModuleDestroy` | `onModuleDestroy()` | On shutdown, before connections close. Top-down. | [Ch 39](../part3-advanced/39-lifecycle-and-shutdown.md) |
| `BeforeApplicationShutdown` | `beforeApplicationShutdown(signal?: string)` | After all `onModuleDestroy` handlers resolve; receives the terminating signal. | [Ch 39](../part3-advanced/39-lifecycle-and-shutdown.md) |
| `OnApplicationShutdown` | `onApplicationShutdown(signal?: string)` | Last hook, after connections are closed. | [Ch 39](../part3-advanced/39-lifecycle-and-shutdown.md) |
| `NestMiddleware` | `use(req, res, next)` | Per request, before the router. Registered in `configure()`. | [Ch 8 — Middleware](../part1-beginner/08-middleware.md) |
| `NestModule` | `configure(consumer: MiddlewareConsumer)` | At bootstrap, to bind middleware to routes. | [Ch 8](../part1-beginner/08-middleware.md) |
| `CanActivate` | `canActivate(ctx): boolean \| Promise \| Observable` | Per request, in the guard phase. | [Ch 11](../part1-beginner/11-guards.md) |
| `NestInterceptor` | `intercept(ctx, next): Observable` | Around the handler. | [Ch 12](../part1-beginner/12-interceptors.md) |
| `PipeTransform` | `transform(value, metadata)` | Per bound parameter, immediately before the handler. | [Ch 10](../part1-beginner/10-pipes-and-validation.md) |
| `ExceptionFilter` | `catch(exception, host: ArgumentsHost)` | When an unhandled exception escapes the handler. | [Ch 9](../part1-beginner/09-exception-filters.md) |
| `OnGatewayInit` / `OnGatewayConnection` / `OnGatewayDisconnect` | `afterInit` / `handleConnection` / `handleDisconnect` | WebSocket gateway lifecycle. | [Ch 44 — WebSockets](../part3-advanced/44-websockets.md) |
| `WebSocketAdapter` | `create` / `bindClientConnect` / `bindMessageHandlers` / `close` | Contract for a custom WS adapter. | [Ch 44](../part3-advanced/44-websockets.md) |
| `CustomTransportStrategy` | `listen` / `close` | Contract for a custom microservice transporter. | [Ch 49 — Custom Transporters](../part3-advanced/49-custom-transporters.md) |

`enableShutdownHooks()` must be called on the application for the three shutdown hooks to fire on process signals.

---

## 6. Configuration — `@nestjs/config`

| Decorator / API | Package | What it does | Chapter |
|---|---|---|---|
| `ConfigModule.forRoot(options)` | `@nestjs/config` | Loads `.env` files and custom loaders. Key options: `isGlobal`, `envFilePath`, `load`, `validate`, `validationSchema`, `cache`, `expandVariables`, `ignoreEnvFile`, `ignoreEnvVars`. | [Ch 17 — Configuration](../part2-intermediate/17-configuration.md) |
| `ConfigModule.forFeature(config)` | `@nestjs/config` | Registers a namespaced config factory scoped to one feature module. | [Ch 17](../part2-intermediate/17-configuration.md) |
| `registerAs(namespace, factory)` | `@nestjs/config` | Creates a namespaced config object that doubles as an injection token — the type-safe way to consume config. | [Ch 17](../part2-intermediate/17-configuration.md) |
| `@Inject(databaseConfig.KEY)` | `@nestjs/common` + `@nestjs/config` | Injects a `registerAs` namespace with `ConfigType<typeof databaseConfig>` for full inference. | [Ch 17](../part2-intermediate/17-configuration.md) |
| `ConfigService.get<T>(key, options?)` | `@nestjs/config` | Reads a value. `{ infer: true }` narrows the return type; a second positional argument supplies a default. | [Ch 17](../part2-intermediate/17-configuration.md) |

There is no `@Config()` parameter decorator in the official package. Teams that want one build it with `createParamDecorator` — see [Chapter 13](../part1-beginner/13-custom-decorators-and-lifecycle.md).

---

## 7. TypeORM — `@nestjs/typeorm` and `typeorm`

### Nest integration decorators

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@InjectRepository(entity, connectionName?)` | `@nestjs/typeorm` | Injects the `Repository<Entity>` registered by `TypeOrmModule.forFeature([Entity])`. Omitting the `forFeature` registration is the usual cause of the resolution error. | [Ch 19 — TypeORM](../part2-intermediate/19-sql-with-typeorm.md) |
| `@InjectDataSource(name?)` | `@nestjs/typeorm` | Injects the `DataSource` — needed for transactions, query runners, and raw SQL. | [Ch 19](../part2-intermediate/19-sql-with-typeorm.md) |
| `@InjectEntityManager(name?)` | `@nestjs/typeorm` | Injects the `EntityManager` for multi-entity work in one transaction. | [Ch 19](../part2-intermediate/19-sql-with-typeorm.md) |
| `TypeOrmModule.forRoot / forRootAsync` | `@nestjs/typeorm` | Registers a data source. `forRootAsync` with `useFactory` is how you feed it `ConfigService`. | [Ch 19](../part2-intermediate/19-sql-with-typeorm.md) |
| `TypeOrmModule.forFeature([...entities])` | `@nestjs/typeorm` | Makes repositories for those entities injectable within the importing module. | [Ch 19](../part2-intermediate/19-sql-with-typeorm.md) |

### Entity decorators (from `typeorm`, overview)

These come from TypeORM itself, not from Nest, but they are inseparable from a Nest data layer.

| Decorator | What it does |
|---|---|
| `@Entity(nameOrOptions?)` | Marks a class as a database table. |
| `@Column(typeOrOptions?)` | Maps a property to a column. Options cover `type`, `nullable`, `default`, `length`, `unique`, `select`, `transformer`. |
| `@PrimaryColumn()` / `@PrimaryGeneratedColumn(strategy?)` | Primary key; the generated form takes `'increment'`, `'uuid'`, `'rowid'`, or `'identity'`. |
| `@CreateDateColumn()` / `@UpdateDateColumn()` / `@DeleteDateColumn()` | Automatic timestamps; `@DeleteDateColumn` enables soft deletes. |
| `@VersionColumn()` | Optimistic-locking version counter. |
| `@Generated('uuid')` | Database-generated value on a non-primary column. |
| `@OneToOne` / `@OneToMany` / `@ManyToOne` / `@ManyToMany` | Relations. `@ManyToOne` owns the foreign key; `@OneToMany` is always the inverse side. |
| `@JoinColumn()` / `@JoinTable()` | Declares the owning side of a one-to-one and of a many-to-many respectively. |
| `@RelationId(fn)` | Loads the raw FK value without loading the relation. |
| `@Index(fieldsOrOptions?)` / `@Unique(fields)` | Indexes and unique constraints, on the class or property. |
| `@Check(expr)` / `@Exclusion(expr)` | Table-level constraints (PostgreSQL). |
| `@Tree('closure-table' \| 'nested-set' \| 'materialized-path')` with `@TreeChildren` / `@TreeParent` | Hierarchical entities. |
| `@Embedded()` / `@ViewEntity()` / `@ViewColumn()` | Embedded value objects and database views. |
| `@BeforeInsert` / `@AfterInsert` / `@BeforeUpdate` / `@AfterUpdate` / `@BeforeRemove` / `@AfterRemove` / `@AfterLoad` | Entity listeners. Note that they only run through the repository API, never on `QueryBuilder` writes. |
| `@EventSubscriber()` | Marks a class implementing `EntitySubscriberInterface`; register it as a Nest provider so it gets DI. |

---

## 8. Mongoose — `@nestjs/mongoose`

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@Schema(options?: SchemaOptions)` | `@nestjs/mongoose` | Marks a class as a Mongoose schema definition. Options pass straight through: `timestamps`, `collection`, `versionKey`, `discriminatorKey`, `toJSON`, `strict`. | [Ch 21 — Mongoose](../part2-intermediate/21-mongodb-mongoose.md) |
| `@Prop(options?)` | `@nestjs/mongoose` | Defines a schema property. Accepts a type shorthand or an options object (`required`, `default`, `index`, `unique`, `min`, `max`, `enum`, `ref`, `type`). Arrays and refs need an explicit `type` because reflection cannot see generic arguments. | [Ch 21](../part2-intermediate/21-mongodb-mongoose.md) |
| `@Virtual({ get, set })` | `@nestjs/mongoose` | Declares a virtual property computed from other fields, without a stored column. | [Ch 21](../part2-intermediate/21-mongodb-mongoose.md) |
| `@InjectModel(name, connectionName?)` | `@nestjs/mongoose` | Injects the `Model<T>` registered by `MongooseModule.forFeature`. The `name` must match the token used at registration — use `Cat.name`, never a literal. | [Ch 21](../part2-intermediate/21-mongodb-mongoose.md) |
| `@InjectConnection(name?)` | `@nestjs/mongoose` | Injects the raw `Connection`, for sessions, transactions, and `db.command`. | [Ch 21](../part2-intermediate/21-mongodb-mongoose.md) |
| `SchemaFactory.createForClass(Cls)` | `@nestjs/mongoose` | Turns the decorated class into a real `mongoose.Schema`. Attach hooks, indexes, and plugins to the result. | [Ch 21](../part2-intermediate/21-mongodb-mongoose.md) |
| `raw(definition)` | `@nestjs/mongoose` | Escape hatch for a schema fragment that cannot be expressed with `@Prop`. | [Ch 21](../part2-intermediate/21-mongodb-mongoose.md) |

---

## 9. Sequelize and MikroORM

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@InjectModel(model, connectionName?)` | `@nestjs/sequelize` | Injects a `sequelize-typescript` model class registered with `SequelizeModule.forFeature`. | [Ch 20 — Sequelize and MikroORM](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@InjectConnection(name?)` | `@nestjs/sequelize` | Injects the `Sequelize` instance for transactions and raw queries. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@Table(options?)` | `sequelize-typescript` | Marks a model class; options include `tableName`, `timestamps`, `paranoid`, `underscored`. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@Column(typeOrOptions?)` | `sequelize-typescript` | Maps a property to a column with a `DataType`. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@PrimaryKey` / `@AutoIncrement` / `@AllowNull` / `@Default` / `@Unique` | `sequelize-typescript` | Column modifiers, applied as bare decorators above `@Column`. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@HasOne` / `@HasMany` / `@BelongsTo` / `@BelongsToMany` / `@ForeignKey` | `sequelize-typescript` | Associations. `@ForeignKey` is required on the column that carries the key. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@CreatedAt` / `@UpdatedAt` / `@DeletedAt` | `sequelize-typescript` | Automatic timestamp columns; `@DeletedAt` needs `paranoid: true`. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@BeforeCreate` / `@AfterCreate` / `@BeforeUpdate` / … | `sequelize-typescript` | Model hooks, declared as static methods. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@InjectRepository(entity)` | `@nestjs/mikro-orm` | Injects a MikroORM `EntityRepository<T>`. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |
| `@Entity()` / `@Property()` / `@PrimaryKey()` / `@ManyToOne()` / `@OneToMany()` / `@Enum()` / `@Embeddable()` / `@Embedded()` | `@mikro-orm/core` | MikroORM's entity definitions. Note MikroORM uses `@Property()` where TypeORM uses `@Column()`. | [Ch 20](../part2-intermediate/20-sequelize-and-mikroorm.md) |

Prisma has no decorators at all — its schema lives in `schema.prisma` and its client is a plain injectable. See [Chapter 22](../part2-intermediate/22-prisma.md).

---

## 10. Authentication and Passport

Passport integration in Nest is almost decorator-free by design: strategies are providers, and guards do the binding.

| Decorator / API | Package | What it does | Chapter |
|---|---|---|---|
| `PassportStrategy(Strategy, name?)` | `@nestjs/passport` | A *mixin factory*, not a decorator. Extend the returned class and implement `validate()`; the optional `name` lets you register two strategies of the same type. | [Ch 23 — Authentication](../part2-intermediate/23-authentication.md) |
| `AuthGuard(type?: string \| string[])` | `@nestjs/passport` | Returns a guard class for the named strategy. Use as `@UseGuards(AuthGuard('jwt'))`, or subclass it to override `handleRequest` / `getRequest`. | [Ch 23](../part2-intermediate/23-authentication.md), [Ch 24 — Passport in Practice](../part2-intermediate/24-passport-strategies.md) |
| `@UseGuards(JwtAuthGuard)` | `@nestjs/common` | The actual binding. | [Ch 24](../part2-intermediate/24-passport-strategies.md) |
| `@SetMetadata('isPublic', true)` (conventionally wrapped as `@Public()`) | `@nestjs/common` | Opt an individual route out of a global auth guard. The canonical global-auth pattern. | [Ch 23](../part2-intermediate/23-authentication.md) |
| `@Roles(...roles)` (your own, via `Reflector.createDecorator`) | your code | Declares required roles for an RBAC guard to read. | [Ch 25 — Authorization](../part2-intermediate/25-authorization.md) |
| `@CheckPolicies(...handlers)` (your own) | your code | Declares CASL ability checks for a policies guard. | [Ch 25](../part2-intermediate/25-authorization.md) |
| `@CurrentUser()` (your own, via `createParamDecorator`) | your code | Extracts `request.user` populated by Passport. Every real project writes this one. | [Ch 13](../part1-beginner/13-custom-decorators-and-lifecycle.md), [Ch 23](../part2-intermediate/23-authentication.md) |

---

## 11. OpenAPI / Swagger — `@nestjs/swagger`

Everything here comes from `@nestjs/swagger`. None of these decorators affect runtime behaviour; they only write metadata that `SwaggerModule.createDocument()` reads.

### Structure and operations

| Decorator | What it does | Chapter |
|---|---|---|
| `@ApiTags(...tags: string[])` | Groups operations under tags in the UI. Controller or handler. | [Ch 29 — OpenAPI I](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiOperation({ summary, description, operationId, deprecated, tags })` | Describes a single operation. `operationId` is what client generators use for method names. | [Ch 29](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiExcludeEndpoint(disable?: boolean)` | Hides one handler from the document. | [Ch 30 — OpenAPI II](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiExcludeController(disable?: boolean)` | Hides an entire controller. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiConsumes(...mimeTypes)` | Declares accepted request content types — required for `multipart/form-data` uploads to render a file picker. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiProduces(...mimeTypes)` | Declares response content types. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiCallbacks(...)` | Documents OpenAPI callbacks (webhooks the server calls back on). | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiExtension(key: string, value: object)` | Adds a vendor extension (`x-…`) to the spec node. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiExtraModels(...models)` | Registers schemas that are not referenced directly from any handler signature — needed for generics and unions. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |

### Inputs

| Decorator | What it does | Chapter |
|---|---|---|
| `@ApiParam({ name, type, required, description, enum, example, schema })` | Documents a path parameter. Usually inferred; needed when you add a param the signature does not show. | [Ch 29](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiQuery({ name, type, required, isArray, enum, style, explode })` | Documents a query parameter, including array serialisation style. | [Ch 29](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiHeader({ name, description, required })` | Documents a request header. | [Ch 29](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiBody({ type, isArray, description, required, schema, examples })` | Overrides or supplies the request body schema — the only way to document a body when the handler takes `@Body()` untyped. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |

### Models

| Decorator | What it does | Chapter |
|---|---|---|
| `@ApiProperty(options?: ApiPropertyOptions)` | Declares a model property. Options include `type`, `required`, `description`, `example`, `examples`, `default`, `enum`, `enumName`, `isArray`, `nullable`, `format`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `readOnly`, `writeOnly`, `oneOf`, `anyOf`, `allOf`. | [Ch 29](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiPropertyOptional(options?)` | Shorthand for `@ApiProperty({ required: false })`. | [Ch 29](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiHideProperty()` | Excludes a property from the generated schema. | [Ch 29](../part2-intermediate/29-openapi-fundamentals.md) |
| `@ApiSchema({ name, description })` | Renames a model's schema in the spec — useful when two DTOs share a class name across modules. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `PartialType` / `PickType` / `OmitType` / `IntersectionType` | Mapped-type helpers. Import them from `@nestjs/swagger` (not `@nestjs/mapped-types`) so the OpenAPI metadata is carried over. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |

### Responses

`@ApiResponse({ status, description, type, isArray, headers, schema, example })` is the general form. Every shortcut below is `@ApiResponse` with the status pre-filled and takes the same options minus `status`.

| Status | Decorator | Status | Decorator |
|---|---|---|---|
| 200 | `@ApiOkResponse()` | 405 | `@ApiMethodNotAllowedResponse()` |
| 201 | `@ApiCreatedResponse()` | 406 | `@ApiNotAcceptableResponse()` |
| 202 | `@ApiAcceptedResponse()` | 408 | `@ApiRequestTimeoutResponse()` |
| 204 | `@ApiNoContentResponse()` | 409 | `@ApiConflictResponse()` |
| 301 | `@ApiMovedPermanentlyResponse()` | 410 | `@ApiGoneResponse()` |
| 302 | `@ApiFoundResponse()` | 412 | `@ApiPreconditionFailedResponse()` |
| 400 | `@ApiBadRequestResponse()` | 413 | `@ApiPayloadTooLargeResponse()` |
| 401 | `@ApiUnauthorizedResponse()` | 415 | `@ApiUnsupportedMediaTypeResponse()` |
| 403 | `@ApiForbiddenResponse()` | 422 | `@ApiUnprocessableEntityResponse()` |
| 404 | `@ApiNotFoundResponse()` | 429 | `@ApiTooManyRequestsResponse()` |
| 500 | `@ApiInternalServerErrorResponse()` | 501 | `@ApiNotImplementedResponse()` |
| 502 | `@ApiBadGatewayResponse()` | 503 | `@ApiServiceUnavailableResponse()` |
| 504 | `@ApiGatewayTimeoutResponse()` | default | `@ApiDefaultResponse()` |

All of these are covered in [Chapter 29](../part2-intermediate/29-openapi-fundamentals.md) and [Chapter 30](../part2-intermediate/30-openapi-advanced.md).

### Security

| Decorator | What it does | Chapter |
|---|---|---|
| `@ApiBearerAuth(name?)` | Attaches a bearer security requirement declared with `addBearerAuth()`. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiBasicAuth(name?)` | HTTP Basic security requirement. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiCookieAuth(name?)` | Cookie-based security requirement. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiOAuth2(scopes: string[], name?)` | OAuth2 requirement with scopes. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |
| `@ApiSecurity(name: string, requirements?: string[])` | Generic form for any scheme registered on the document builder, including API keys. | [Ch 30](../part2-intermediate/30-openapi-advanced.md) |

The CLI plugin (`@nestjs/swagger` in `compilerOptions.plugins`) can infer most `@ApiProperty` and `@ApiOperation` metadata from types and JSDoc — see [Appendix B](./B-cli-reference.md) for its options and [Chapter 30](../part2-intermediate/30-openapi-advanced.md) for when to trust it.

---

## 12. GraphQL — `@nestjs/graphql`

All from `@nestjs/graphql`. Note the collisions with `@nestjs/common`: `@Query` and `@Args` here have nothing to do with HTTP.

### Resolvers and operations

| Decorator | What it does | Chapter |
|---|---|---|
| `@Resolver(typeFuncOrName?, options?)` | Marks a class as a resolver. The argument names the parent type, which is what makes `@ResolveField` work. `{ isAbstract: true }` for base classes. | [Ch 50 — GraphQL I](../part3-advanced/50-graphql-fundamentals.md) |
| `@Query(typeFunc?, options?)` | Declares a root query field. Options: `name`, `description`, `nullable`, `deprecationReason`, `complexity`. | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `@Mutation(typeFunc?, options?)` | Declares a root mutation field. Same options. | [Ch 51 — GraphQL II](../part3-advanced/51-graphql-types-and-operations.md) |
| `@Subscription(typeFunc, options?)` | Declares a subscription field. Options add `filter` and `resolve` callbacks; the method returns an `AsyncIterator` from a PubSub engine. | [Ch 51](../part3-advanced/51-graphql-types-and-operations.md) |
| `@ResolveField(nameOrFunc?, typeFunc?, options?)` | Resolves one field of the parent type — the hook for lazy relations and the source of N+1 problems (solve with DataLoader). | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `@ResolveReference()` | Federation: resolves an entity this subgraph owns from a representation sent by the gateway. | [Ch 52 — GraphQL III](../part3-advanced/52-graphql-advanced.md) |
| `@Scalar(name, typeFunc?)` | Registers a custom scalar implementation class. | [Ch 51](../part3-advanced/51-graphql-types-and-operations.md) |

### Type definitions (code-first)

| Decorator | What it does | Chapter |
|---|---|---|
| `@ObjectType(nameOrOptions?, options?)` | Declares a GraphQL output type. `{ isAbstract: true }` excludes it from the schema; `{ implements: () => [Iface] }` wires interfaces. | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `@InputType(nameOrOptions?, options?)` | Declares a GraphQL input type. Inputs and outputs are separate namespaces — you cannot reuse one class as both. | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `@ArgsType()` | Declares a class whose properties become a flattened argument list for `@Args()`. | [Ch 51](../part3-advanced/51-graphql-types-and-operations.md) |
| `@InterfaceType(nameOrOptions?, options?)` | Declares a GraphQL interface. `resolveType` decides the concrete type at runtime. | [Ch 51](../part3-advanced/51-graphql-types-and-operations.md) |
| `@Field(typeFunc?, options?)` | Declares a field on any of the above. Options: `name`, `description`, `nullable` (`true`, `'items'`, `'itemsAndList'`), `defaultValue`, `deprecationReason`, `complexity`, `middleware`. The `typeFunc` is mandatory for arrays and for `number` (choose `Int` or `Float`). | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `createUnionType({ name, types, resolveType? })` | Function, not a decorator — builds a union type. | [Ch 51](../part3-advanced/51-graphql-types-and-operations.md) |
| `registerEnumType(enumRef, { name, description, valuesMap })` | Function that publishes a TypeScript enum into the schema. | [Ch 51](../part3-advanced/51-graphql-types-and-operations.md) |
| `@HideField()` | Omits an inherited property from the generated type — the GraphQL analogue of `@ApiHideProperty`. | [Ch 51](../part3-advanced/51-graphql-types-and-operations.md) |
| `@Directive('@deprecated(reason: "…")')` | Attaches a schema directive to a type or field. Federation directives (`@key`, `@external`, `@requires`, `@provides`, `@shareable`) go here. | [Ch 52](../part3-advanced/52-graphql-advanced.md) |
| `@Extensions({ … })` | Attaches arbitrary metadata to a schema node, readable from plugins, guards, and field middleware. | [Ch 52](../part3-advanced/52-graphql-advanced.md) |
| `@Plugin()` | Marks a class implementing `ApolloServerPlugin` so Nest registers it with DI. | [Ch 52](../part3-advanced/52-graphql-advanced.md) |

### GraphQL parameter decorators

| Decorator | What it does | Chapter |
|---|---|---|
| `@Args(nameOrOptions?, ...pipes)` | Extracts one argument by name, or the whole args object when called with no name / with an `@ArgsType()` class. Options: `type`, `nullable`, `defaultValue`, `description`. | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `@Parent()` | The resolved parent object inside a `@ResolveField`. | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `@Context(key?, ...pipes)` | The GraphQL context object, or one key of it. Where request-scoped things like the DataLoader registry and the authenticated user live. | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |
| `@Info()` | The `GraphQLResolveInfo` — the parsed selection set. Use it for projection push-down; do not use it for business logic. | [Ch 52](../part3-advanced/52-graphql-advanced.md) |
| `@Root()` | Alias of `@Parent()`. | [Ch 50](../part3-advanced/50-graphql-fundamentals.md) |

`GqlExecutionContext.create(context)` is how guards, interceptors, and filters reach these objects from a generic `ExecutionContext` — see [Chapter 40](../part3-advanced/40-execution-context.md).

---

## 13. WebSockets — `@nestjs/websockets`

| Decorator | What it does | Chapter |
|---|---|---|
| `@WebSocketGateway(portOrOptions?, options?)` | Marks a class as a gateway. Options are passed to the adapter (`namespace`, `cors`, `path`, `transports`, `serveClient`). A gateway is also a provider, so it can inject services. | [Ch 44 — WebSockets](../part3-advanced/44-websockets.md) |
| `@WebSocketServer()` | Property decorator that injects the native server instance (`socket.io` `Server`, or `ws` `Server`) after `afterInit`. It is `undefined` in the constructor. | [Ch 44](../part3-advanced/44-websockets.md) |
| `@SubscribeMessage(event: string)` | Binds a method to an inbound message/event name. Return a value for an ack, or a `WsResponse` / `Observable<WsResponse>` for multiple emissions. | [Ch 44](../part3-advanced/44-websockets.md) |
| `@MessageBody(key?, ...pipes)` | Extracts the message payload, or one property of it. Pipes apply exactly as in HTTP. | [Ch 44](../part3-advanced/44-websockets.md) |
| `@ConnectedSocket()` | Injects the client socket for the current message. Prefer it over storing sockets in gateway fields. | [Ch 44](../part3-advanced/44-websockets.md) |

Guards, interceptors, pipes, and filters all work on gateways, but exceptions must be `WsException` and filters must extend `BaseWsExceptionFilter` — HTTP filters will not fire.

---

## 14. Microservices — `@nestjs/microservices`

| Decorator | What it does | Chapter |
|---|---|---|
| `@MessagePattern(pattern, transport?, extras?)` | Binds a method to a **request–response** pattern. The pattern may be a string or an object; matching is by deep structural equality. | [Ch 45 — Microservices I](../part3-advanced/45-microservices-fundamentals.md) |
| `@EventPattern(pattern, transport?, extras?)` | Binds a method to a **fire-and-forget** event. The return value is discarded and the producer never waits. | [Ch 45](../part3-advanced/45-microservices-fundamentals.md) |
| `@Payload(key?, ...pipes)` | Extracts the message payload. The microservices analogue of `@Body()`. | [Ch 45](../part3-advanced/45-microservices-fundamentals.md) |
| `@Ctx(...pipes)` | Injects the transport-specific context object — `RmqContext`, `KafkaContext`, `NatsContext`, `RedisContext`, `MqttContext`. This is where you reach `channel.ack()`, the Kafka partition/offset, or the raw NATS subject. | [Ch 46 — Message Brokers](../part3-advanced/46-message-brokers.md), [Ch 47 — Kafka](../part3-advanced/47-kafka.md) |
| `@Client(options: ClientOptions)` | Property decorator that creates and injects a `ClientProxy` inline. Convenient for demos; prefer `ClientsModule.register()` in production so the client participates in DI and shutdown. | [Ch 45](../part3-advanced/45-microservices-fundamentals.md) |
| `@GrpcMethod(service?, method?)` | Binds a method to a unary (or client-streaming) gRPC RPC. Arguments default to the class name and method name — pass them explicitly when they diverge from the `.proto`. | [Ch 48 — gRPC](../part3-advanced/48-grpc.md) |
| `@GrpcStreamMethod(service?, method?)` | Binds a method to a bidirectional streaming RPC using RxJS: the parameter is an `Observable` of requests and the return is an `Observable` of responses. | [Ch 48](../part3-advanced/48-grpc.md) |
| `@GrpcStreamCall(service?, method?)` | Binds a streaming RPC using the raw gRPC call object, for full control over `call.on('data')` and `call.write()`. | [Ch 48](../part3-advanced/48-grpc.md) |
| `@GrpcService(name?)` | Class-level marker declaring which gRPC service a controller implements. | [Ch 48](../part3-advanced/48-grpc.md) |
| `@Transport` enum (not a decorator) | Selects the transporter: `TCP`, `REDIS`, `NATS`, `MQTT`, `GRPC`, `RMQ`, `KAFKA`. | [Ch 46](../part3-advanced/46-message-brokers.md) |

`RpcException` and `BaseRpcExceptionFilter` are the error path; `HttpException` thrown in a microservice controller will not be translated. See [Chapter 45](../part3-advanced/45-microservices-fundamentals.md).

---

## 15. CQRS — `@nestjs/cqrs`

| Decorator | What it does | Chapter |
|---|---|---|
| `@CommandHandler(command: Type<ICommand>)` | Binds a class implementing `ICommandHandler<T>` to one command type. Exactly one handler per command — a second registration silently wins. | [Ch 53 — CQRS](../part3-advanced/53-cqrs.md) |
| `@QueryHandler(query: Type<IQuery>)` | Binds a class implementing `IQueryHandler<T>` to one query type. | [Ch 53](../part3-advanced/53-cqrs.md) |
| `@EventsHandler(...events: Type<IEvent>[])` | Binds a class implementing `IEventHandler<T>` to one or more event types. Many handlers per event is normal. | [Ch 53](../part3-advanced/53-cqrs.md) |
| `@Saga()` | Marks a property whose value is `(events$: Observable<ICommand>) => Observable<ICommand>` — an RxJS pipeline that reacts to events by dispatching commands. | [Ch 53](../part3-advanced/53-cqrs.md) |

Handler classes must be listed in the module's `providers`; the decorators only tag them for `DiscoveryService` to find.

---

## 16. Task scheduling — `@nestjs/schedule`

| Decorator | What it does | Chapter |
|---|---|---|
| `@Cron(expression: string \| CronExpression \| Date, options?: { name?, timeZone?, utcOffset?, disabled?, waitForCompletion? })` | Runs the method on a cron schedule. The `CronExpression` enum gives readable constants. `waitForCompletion: true` skips a tick while the previous run is still going. | [Ch 34 — Scheduling and Events](../part2-intermediate/34-scheduling-and-events.md) |
| `@Interval(nameOrMs, ms?)` | Runs the method every `ms` milliseconds, starting after the first interval elapses. | [Ch 34](../part2-intermediate/34-scheduling-and-events.md) |
| `@Timeout(nameOrMs, ms?)` | Runs the method once, `ms` after the application has bootstrapped. | [Ch 34](../part2-intermediate/34-scheduling-and-events.md) |

Naming a job (`{ name: 'reports' }` or the first positional argument) is what makes it addressable through `SchedulerRegistry` for pause/resume/delete. In a multi-instance deployment, every instance runs every job — add a distributed lock. See [Chapter 34](../part2-intermediate/34-scheduling-and-events.md).

---

## 17. In-process events — `@nestjs/event-emitter`

| Decorator | What it does | Chapter |
|---|---|---|
| `@OnEvent(event: string \| symbol \| (string \| symbol)[], options?: OnEventOptions)` | Subscribes a method to one or more events. Supports wildcards (`order.*`) when `wildcard: true` is set on the module. Options: `async`, `promisify`, `suppressErrors`, `prependListener`, `objectify`. | [Ch 34](../part2-intermediate/34-scheduling-and-events.md) |

These events are in-process only: they do not cross a worker boundary, do not survive a restart, and are not a substitute for a queue or a broker.

---

## 18. Queues — `@nestjs/bullmq`

| Decorator | What it does | Chapter |
|---|---|---|
| `@Processor(queueName: string, options?: WorkerOptions)` | Marks a class extending `WorkerHost` as the consumer for a queue. `options` carries `concurrency`, `limiter`, `lockDuration`. | [Ch 35 — Queues](../part2-intermediate/35-queues.md) |
| `@InjectQueue(name: string)` | Injects the producer-side `Queue` registered by `BullModule.registerQueue({ name })`. | [Ch 35](../part2-intermediate/35-queues.md) |
| `@InjectFlowProducer(name)` | Injects a `FlowProducer` for parent/child job trees. | [Ch 35](../part2-intermediate/35-queues.md) |
| `@OnWorkerEvent(event)` | Subscribes a method on the processor class to a worker event: `'completed'`, `'failed'`, `'active'`, `'progress'`, `'stalled'`, `'error'`, `'drained'`. | [Ch 35](../part2-intermediate/35-queues.md) |
| `@QueueEventsListener(queueName)` + `@OnQueueEvent(event)` | Cluster-wide queue events, observed from any process rather than only from the worker that ran the job. | [Ch 35](../part2-intermediate/35-queues.md) |

The legacy `@nestjs/bull` (Bull v3) decorators `@Process()`, `@OnQueueActive()`, `@OnQueueCompleted()`, and `@OnQueueFailed()` are replaced in BullMQ by the `WorkerHost.process()` method plus `@OnWorkerEvent`. Migration notes are in [Chapter 35](../part2-intermediate/35-queues.md) and [Chapter 59](../part3-advanced/59-migration-and-ecosystem.md).

---

## 19. Caching — `@nestjs/cache-manager`

| Decorator | What it does | Chapter |
|---|---|---|
| `@CacheKey(key: string)` | Overrides the cache key that `CacheInterceptor` would otherwise derive from the request URL. Required for any non-GET or parameterised caching. | [Ch 27 — Caching](../part2-intermediate/27-caching.md) |
| `@CacheTTL(ttl: number)` | Overrides the TTL (milliseconds in v11's cache-manager v6) for one handler or controller. | [Ch 27](../part2-intermediate/27-caching.md) |
| `@Inject(CACHE_MANAGER)` | Injects the `Cache` instance for imperative `get` / `set` / `del` / `mget` calls — the right tool whenever the response-level interceptor is too coarse. | [Ch 27](../part2-intermediate/27-caching.md) |
| `@UseInterceptors(CacheInterceptor)` | Turns on automatic response caching for a controller or handler. Bind it globally with `APP_INTERCEPTOR` only if you are certain every GET is safely cacheable. | [Ch 27](../part2-intermediate/27-caching.md) |

`CacheInterceptor` only caches GET requests by default; override `isRequestCacheable()` to change that.

---

## 20. Rate limiting — `@nestjs/throttler`

| Decorator | What it does | Chapter |
|---|---|---|
| `@Throttle({ [name]: { limit, ttl, blockDuration? } })` | Overrides the configured rate limits for a controller or handler. The keys name throttler definitions declared in `ThrottlerModule.forRoot([...])`. | [Ch 26 — Hardening](../part2-intermediate/26-web-security-hardening.md) |
| `@SkipThrottle(skip?: boolean \| Record<string, boolean>)` | Exempts a controller or handler entirely, or exempts specific named throttlers. Pass `false` to re-enable inside an exempted controller. | [Ch 26](../part2-intermediate/26-web-security-hardening.md) |
| `ThrottlerGuard` (bind with `APP_GUARD`) | The guard that enforces the limits. Subclass it to change the tracker key (e.g. authenticated user id instead of IP). | [Ch 26](../part2-intermediate/26-web-security-hardening.md) |

---

## 21. Serialization — `class-transformer` and `@nestjs/common`

| Decorator | Package | What it does | Chapter |
|---|---|---|---|
| `@Exclude(options?: { toPlainOnly?, toClassOnly? })` | `class-transformer` | Omits a property from the plain object. `{ toPlainOnly: true }` keeps the value on input but strips it on output — the correct setting for password hashes. | [Ch 16 — Serialization](../part2-intermediate/16-serialization.md) |
| `@Expose(options?: { name?, groups?, since?, until?, toPlainOnly?, toClassOnly? })` | `class-transformer` | Includes a property (or a getter) in the output, optionally renaming it or gating it behind a group. | [Ch 16](../part2-intermediate/16-serialization.md) |
| `@Transform(fn, options?)` | `class-transformer` | Rewrites a value during transformation. Receives `{ value, key, obj, type }`. Common for trimming strings, coercing booleans from query strings, and formatting dates. | [Ch 16](../part2-intermediate/16-serialization.md), [Ch 15](../part2-intermediate/15-validation-in-depth.md) |
| `@Type(() => Cls)` | `class-transformer` | Tells the transformer the concrete class of a nested object or array element. Without it, nested DTO validation silently does nothing. | [Ch 15](../part2-intermediate/15-validation-in-depth.md) |
| `@SerializeOptions(options: ClassTransformOptions)` | `@nestjs/common` | Sets transformation options for a controller or handler: `strategy`, `excludeExtraneousValues`, `groups`, `version`, `enableCircularCheck`. | [Ch 16](../part2-intermediate/16-serialization.md) |
| `@UseInterceptors(ClassSerializerInterceptor)` | `@nestjs/common` | Runs `instanceToPlain` on whatever the handler returns. **It only works on class instances** — return a raw object literal (or a Prisma/Mongoose document) and every `@Exclude` is ignored. | [Ch 16](../part2-intermediate/16-serialization.md) |

class-validator's decorators (`@IsString`, `@IsInt`, `@IsEmail`, `@IsOptional`, `@ValidateNested`, `@ValidateIf`, `@ArrayMinSize`, `@Matches`, and the rest) are catalogued with worked examples in [Chapter 15](../part2-intermediate/15-validation-in-depth.md).

---

## 22. Testing — `@nestjs/testing`

Testing has almost no decorators; what it has instead is a builder API you should know by heart.

| API | Package | What it does | Chapter |
|---|---|---|---|
| `Test.createTestingModule(metadata)` | `@nestjs/testing` | Builds a module with the same metadata shape as `@Module()`. The entry point to every Nest test. | [Ch 31 — Testing](../part2-intermediate/31-testing.md) |
| `.overrideProvider(token).useValue / useClass / useFactory` | `@nestjs/testing` | Replaces a provider with a double. Works with any token, including `getRepositoryToken(Entity)` and `getModelToken(Cat.name)`. | [Ch 31](../part2-intermediate/31-testing.md) |
| `.overrideGuard(Guard)` / `.overrideInterceptor()` / `.overridePipe()` / `.overrideFilter()` | `@nestjs/testing` | Replaces a bound enhancer — the standard way to bypass auth in an e2e test. | [Ch 31](../part2-intermediate/31-testing.md) |
| `.overrideModule(Module).useModule(Mock)` | `@nestjs/testing` | Swaps a whole module, including dynamic modules. | [Ch 31](../part2-intermediate/31-testing.md) |
| `.compile()` / `.createNestApplication()` | `@nestjs/testing` | Produces a `TestingModule`, then a full application for supertest-driven e2e tests. | [Ch 31](../part2-intermediate/31-testing.md) |
| `getRepositoryToken(Entity)` | `@nestjs/typeorm` | The token `@InjectRepository` resolves — needed to override a repository. | [Ch 31](../part2-intermediate/31-testing.md) |
| `getModelToken(name)` / `getConnectionToken()` | `@nestjs/mongoose` | Same idea for Mongoose models and connections. | [Ch 31](../part2-intermediate/31-testing.md) |
| `getQueueToken(name)` | `@nestjs/bullmq` | Token for `@InjectQueue`, so tests can assert on `queue.add` without Redis. | [Ch 35](../part2-intermediate/35-queues.md) |

---

## 23. How to build your own decorator

Nest gives you four composable primitives. All of them are covered in depth, with the reflection mechanics and the pitfalls, in [Chapter 13 — Custom Decorators and the Complete Request Lifecycle](../part1-beginner/13-custom-decorators-and-lifecycle.md).

| Primitive | Package | Use it when |
|---|---|---|
| `createParamDecorator<T>((data: T, ctx: ExecutionContext) => any)` | `@nestjs/common` | You want a new **parameter** decorator: `@CurrentUser()`, `@TenantId()`, `@ClientIp()`. The factory runs per request, and pipes passed at the call site still apply. |
| `Reflector.createDecorator<T>()` | `@nestjs/core` | You want a type-safe **metadata** decorator that a guard or interceptor reads back. Replaces untyped `@SetMetadata('roles', …)`. |
| `SetMetadata(key, value)` | `@nestjs/common` | You need a metadata decorator whose key is shared with code you do not control, or a symbol key. |
| `applyDecorators(...ds)` | `@nestjs/common` | You want to bundle several decorators into one — the pattern behind a project-wide `@Auth(Role.Admin)` that expands to a guard, a metadata write, and the Swagger security annotation. |

A compressed example of the composition pattern:

```typescript title="src/auth/decorators/auth.decorator.ts"
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Role } from '../role.enum';

export const ROLES_KEY = 'roles';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Not authenticated' }),
  );
}
```

Two rules that save hours:

1. **A custom parameter decorator cannot inject providers.** Its factory receives only `data` and `ExecutionContext`. If you need a service, put the work in a guard or interceptor that writes onto the request, and let the decorator read that.
2. **Decorators are evaluated once, at class-definition time.** Anything expensive, async, or request-dependent inside a decorator factory body — as opposed to inside the function it returns — runs at import time and is shared by every request.

---

## 24. Name collisions to memorise

| Name | `@nestjs/common` meaning | Other meaning |
|---|---|---|
| `@Query` | HTTP query-string parameter | Root GraphQL query field (`@nestjs/graphql`) |
| `@Args` | — | GraphQL argument (`@nestjs/graphql`) |
| `@Injectable` | Nest provider marker | Also exists in Angular; not interchangeable |
| `@Body` | HTTP request body | `@MessageBody` for WebSockets, `@Payload` for microservices |
| `@Header` | Sets a *response* header | `@Headers` reads *request* headers |
| `@Catch` | Exception-filter class marker | Not related to `try/catch` |
| `@Res` | Platform response object | `@Response` is the same decorator under a second name |
| `@Column` | — | TypeORM and `sequelize-typescript` both export one; MikroORM calls it `@Property` |
| `@Schema` | — | Mongoose schema class (`@nestjs/mongoose`); unrelated to `@ApiSchema` |
| `@InjectModel` | — | Both `@nestjs/mongoose` and `@nestjs/sequelize` export one, with different semantics |

**Next:** [Appendix B — Nest CLI Command Reference](./B-cli-reference.md) covers the tooling that generates most of the code above.
