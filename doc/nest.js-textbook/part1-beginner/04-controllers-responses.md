---
title: "4. Controllers II"
parent: "Part I — Beginner (초급)"
grand_parent: "NestJS Complete Guide"
nav_order: 4
chapter: 4
part: "Part I — Beginner (초급)"
level: beginner
reading_time: "35 min"
prerequisites: [3]
source_docs:
  - "content/controllers.md"
source_url: "https://docs.nestjs.com/controllers"
nest_baseline: "11.x"
---

# Chapter 4 — Controllers II: Responses, Status Codes, DTOs, and Async

> **한눈에 보기**
> 3장이 요청을 핸들러까지 데려오는 과정이었다면, 이 장은 핸들러가 만든 값이 HTTP 응답으로
> 바뀌는 과정을 다룬다. Nest에는 두 가지 응답 방식(표준 방식과 라이브러리 전용 방식)이
> 있는데, 이 둘을 섞으면 아무 경고 없이 프레임워크의 절반이 꺼진다. 상태 코드·헤더·리다이렉트
> 데코레이터, Promise와 Observable을 반환하는 비동기 핸들러, 그리고 DTO를 인터페이스가 아니라
> **클래스**로 선언해야 하는 런타임상의 이유까지 확인한 뒤, 완성된 CRUD 컨트롤러로 마무리한다.

**What you will learn**

- The two response modes Nest supports, what each one costs you, and why injecting `@Res()` silently turns off `@HttpCode()`, `@Header()`, interceptors, and serialization.
- The `passthrough: true` escape hatch — the only sane way to touch the native response object without giving up the framework.
- Which status code Nest picks by default (and why POST is the exception), and how `@HttpCode()` and thrown exceptions change it.
- How `@Header()` and `@Redirect()` work, including dynamic redirects driven by the handler's return value.
- How Nest resolves `Promise` and RxJS `Observable` return values, and what "resolve the final emitted value" actually means for a multi-emission stream.
- Why a DTO must be a **class** and not an interface, with the compiled JavaScript that proves it.
- How to wire a controller into a module so that the routes actually exist.

**Why this matters**

Here is a bug that survives code review. A developer needs to set a cookie on login, so they inject the Express response object, set the cookie, and return the user — the way they would in a plain Express app:

```typescript
// ❌ This route hangs. Forever.
@Post('login')
async login(@Body() dto: LoginDto, @Res() res: Response) {
  const { user, token } = await this.auth.login(dto);
  res.cookie('session', token, { httpOnly: true });
  return user;                       // ignored — nothing is ever sent
}
```

Nothing throws. The test asserting `expect(result).toEqual(user)` on the controller method passes, because a unit test calls the method directly and it does return `user`. In production the client opens a socket, receives a cookie header that never flushes, and waits until its own timeout fires. Load balancers report the upstream as healthy; the only symptom is latency.

The cause is that Nest supports two distinct response strategies and decides which one you are using by *inspecting your parameter decorators at bootstrap*. Ask for `@Res()` or `@Next()` and Nest concludes you have taken responsibility for the response, so it stops looking at your return value. Half the framework — interceptors, `@HttpCode()`, `@Header()`, `ClassSerializerInterceptor` — becomes inert on that one route, and nothing tells you.

That fork is the spine of this chapter. Once you see where it is, everything else follows: why `@HttpCode(204)` exists, why `@Redirect()` can be overridden by a return value, why returning an `Observable` is legal, and why DTOs must be classes for `ValidationPipe` to do anything at all.

## The two response modes

Nest gives you two ways to produce an HTTP response.

**Standard (declarative)** — the recommended mode. You `return` a value and Nest converts it:

| You return | Nest sends |
|---|---|
| An object or array | `application/json`, serialized with `JSON.stringify` |
| A `string`, `number`, or `boolean` | The raw value, no JSON wrapping (`Content-Type: text/html`) |
| `undefined` / `null` | An empty body |
| A `Promise<T>` | Awaited, then the rules above apply to `T` |
| An `Observable<T>` | Subscribed to, then the rules above apply to the last emitted `T` |
| A `StreamableFile` | Piped to the response as a stream (see [Chapter 28](../part2-intermediate/28-file-upload-and-streaming.md)) |
| A thrown `HttpException` | The exception's status and body (see [Chapter 9](./09-exception-filters.md)) |

**Library-specific (imperative)** — you inject the platform's response object with `@Res()` and drive it yourself:

```typescript
import { Controller, Get, Post, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Controller('cats')
export class CatsController {
  @Post()
  create(@Res() res: Response) {
    res.status(HttpStatus.CREATED).send();
  }

  @Get()
  findAll(@Res() res: Response) {
    res.status(HttpStatus.OK).json([]);
  }
}
```

This works and gives you total control. It also costs a great deal, as the next section makes concrete.

```mermaid
sequenceDiagram
  participant C as Client
  participant E as Express/Fastify
  participant P as Nest handler proxy
  participant G as Guards → Interceptors (pre)
  participant H as Your handler
  participant I as Interceptors (post)
  participant R as Response serializer

  C->>E: POST /cats
  E->>P: matched route
  P->>G: canActivate, intercept(before)
  G->>H: invoke with extracted args
  alt Standard mode (no @Res)
    H-->>P: return value / Promise / Observable
    P->>I: pipe through interceptor stream
    I->>R: apply @HttpCode, @Header, serialize
    R-->>C: 201 + JSON body
  else Library-specific mode (@Res injected)
    H->>E: res.status(...).json(...)
    Note over P,R: return value discarded;<br/>@HttpCode / @Header / interceptors skipped
    E-->>C: whatever you wrote
  end
```

### Why mixing them breaks silently

Nest scans the handler's parameter metadata at bootstrap. If it finds `@Res()`, `@Response()`, or `@Next()`, it sets an internal flag: this route is library-specific. The consequences on that route:

- **The return value is discarded.** Nothing is written unless you write it; forget `res.send()` and the request hangs until the client gives up.
- **`@HttpCode()`, `@Header()`, redirect handling, `@Sse()` and `StreamableFile` stop applying**, because all of them live in the response serializer that no longer runs.
- **Interceptors lose their "after" half.** They still run before the handler, but the stream they map over never carries a value, so logging, timing, caching, and `ClassSerializerInterceptor` become no-ops.
- **Your controller becomes platform-coupled**, since `res.json()` differs between Express and Fastify, and **harder to test** — a unit test must mock a chainable `Response` and assert on calls rather than on a returned value.

The last point hurts six months later. The first pages you at 3 a.m.

### The `passthrough` escape hatch

There is a legitimate middle ground: you need the native response object for one narrow thing — a cookie, a conditional header, a computed status code — but still want Nest to serialize your return value and run your interceptors. Pass `passthrough: true`:

```typescript
// ✅ RIGHT — native access without leaving standard mode
import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.login(dto);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax' });
    res.status(HttpStatus.OK);       // a computed status is fine too
    return user;                     // ...and Nest still serializes this
  }
}
```

With `passthrough: true`, Nest hands you the response object but keeps ownership of the response lifecycle. You may mutate headers, cookies, and status; you must **not** call a terminating method (`res.send()`, `res.json()`, `res.end()`), because Nest will then try to write to an already-finished response and you will see `Cannot set headers after they are sent to the client`.

The recommendation, stated plainly: **never use bare `@Res()`.** If you need the response object, use `passthrough: true`. If you need full imperative control — proxying a byte stream, implementing a protocol Nest does not model — reach for `StreamableFile`, an interceptor, or `@Sse()` before giving up the framework's guarantees.

## Status codes

In standard mode, Nest chooses the status code for you:

- **201 Created** for `@Post()` handlers.
- **200 OK** for everything else.

POST is the exception because a successful POST usually creates a resource, and the HTTP specification says that is a 201. That default is why `@HttpCode()` exists — the moment a POST does something other than create (a login, a search with a body, a state transition), 201 is wrong.

```typescript
import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)     // 204 instead of the default 201
  create() {
    return 'This action adds a new cat';
  }
}
```

`HttpStatus` is an enum exported from `@nestjs/common`; `@HttpCode(204)` and `@HttpCode(HttpStatus.NO_CONTENT)` are identical, and the named form reads better in review.

> **Hint** — Import both `HttpCode` and `HttpStatus` from `@nestjs/common`. `@HttpCode()` is handler-level only; there is no controller-level or global equivalent.

The codes you will actually reach for:

| Situation | Code | How to produce it |
|---|---|---|
| GET, or PUT/PATCH returning the entity | 200 | Default |
| POST created a resource | 201 | Default for `@Post()` |
| Accepted for async processing | 202 | `@HttpCode(HttpStatus.ACCEPTED)` |
| DELETE succeeded, no body | 204 | `@HttpCode(HttpStatus.NO_CONTENT)` |
| Validation failed | 400 | `throw new BadRequestException()` — or let `ValidationPipe` do it |
| Not authenticated / not allowed | 401 / 403 | `throw new UnauthorizedException()` / `ForbiddenException()` |
| Resource does not exist | 404 | `throw new NotFoundException()` |
| Conflict (duplicate key, version clash) | 409 | `throw new ConflictException()` |

Note the split: **success codes are declared, error codes are thrown.** `@HttpCode()` is for the happy path only; everything else goes through the exception system ([Chapter 9](./09-exception-filters.md)).

When the success code genuinely varies at runtime — a PUT returning 201 when it created the row and 200 when it replaced one — you can use `@Res({ passthrough: true })` with `res.status(...)`, or restructure into two routes. Prefer the restructure: a route whose status code you cannot predict is a route whose contract you cannot document.

## Response headers

`@Header(name, value)` sets a static response header:

```typescript
import { Controller, Post, Get, Header } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Post()
  @Header('Cache-Control', 'no-store')
  create() {
    return 'This action adds a new cat';
  }

  @Get('report.csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="cats.csv"')
  report() {
    return 'name,age\nTom,3\n';
  }
}
```

Multiple `@Header()` decorators stack. The values are static strings baked in at bootstrap — you cannot compute them from the request. For a dynamic header (an `ETag` derived from the payload, a `Retry-After` computed from queue depth) use `@Res({ passthrough: true })` with `res.setHeader(...)`, or an interceptor, which is cleaner when the same header applies to many routes ([Chapter 12](./12-interceptors.md)). Headers that apply to *every* response — `Strict-Transport-Security` and the rest — belong in Helmet, not on handlers ([Chapter 26](../part2-intermediate/26-web-security-hardening.md)).

## Redirection

`@Redirect(url?, statusCode?)` sends a redirect instead of a body. Both arguments are optional and `statusCode` defaults to **302 (Found)**.

```typescript
import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class LegacyController {
  @Get('old-home')
  @Redirect('https://nestjs.com', 301)
  redirectHome() {}
}
```

The handler body can be empty — the decorator carries all the information. More interesting is the dynamic form: if the handler **returns** an object shaped like `HttpRedirectResponse` (`{ url, statusCode }`), that object **overrides** what the decorator declared:

```typescript
import { Controller, Get, Query, Redirect } from '@nestjs/common';

@Controller('docs')
export class DocsController {
  @Get()
  @Redirect('https://docs.nestjs.com', 302)
  getDocs(@Query('version') version?: string) {
    if (version === '5') {
      return { url: 'https://docs.nestjs.com/v5/' };   // overrides the URL
    }
    // returning nothing → the decorator's values are used unchanged
  }
}
```

Three details worth internalising. `@Redirect()` must be present for the override to mean anything — returning `{ url: '...' }` from a plain `@Get()` handler just serializes it as a JSON body. The returned object may set `url`, `statusCode`, or both, and omitted fields fall back to the decorator's arguments. And returning `undefined` leaves the decorator's values intact, which is what the non-redirecting branch above relies on.

Pick status codes deliberately: **301** for a permanent move (browsers and proxies cache it aggressively — hard to undo), **302** for a temporary one, **307**/**308** when the method must be preserved, since a redirected POST stays a POST while 301/302 historically get rewritten to GET.

## Asynchronous handlers

Any handler may be `async`. Nest awaits the promise and applies the standard response rules to the resolved value:

```typescript
@Get()
async findAll(): Promise<Cat[]> {
  return this.catsService.findAll();     // resolved value is serialized
}
```

There is no ceremony at the framework boundary, and a rejection travels into the exception layer exactly as a synchronous `throw` would. Nest also accepts **RxJS observables**, subscribing for you and responding with what the stream emits:

```typescript
import { Controller, Get } from '@nestjs/common';
import { Observable, of } from 'rxjs';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(): Observable<Cat[]> {
    return of([]);
  }
}
```

The precise semantics matter: Nest **resolves the final emitted value once the stream completes.** A stream that emits once and completes (`of(x)`, `from(promise)`, an `HttpService` call piped through `map`) behaves exactly like a promise. A stream that emits several values sends only the **last** — intermediate emissions are discarded, not streamed. A stream that never completes never produces a response. An error notification routes into the exception layer like a thrown error.

So an `Observable` return type is *not* how you stream data to a client: use `@Sse()` ([Chapter 57](../part3-advanced/57-advanced-http.md)) or `StreamableFile` ([Chapter 28](../part2-intermediate/28-file-upload-and-streaming.md)).

Which should you write? `async`/`await` by default — it is what most of the ecosystem returns, it stack-traces well, and it is what a reader expects. Return an `Observable` when you are already in RxJS territory: `HttpService` from `@nestjs/axios`, GraphQL subscriptions and microservice clients all return one, and forcing those through `firstValueFrom()` only to have Nest re-wrap them is noise.

## Request payloads and DTOs

A POST handler that accepts no input is not useful; `@Body()` gives you the parsed request body:

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  return this.catsService.create(createCatDto);
}
```

First you need the `CreateCatDto` type. A **DTO (Data Transfer Object)** describes the shape of data crossing the network boundary — not your database entity and not your domain model. Keeping them separate is what lets you add an internal column without accidentally accepting it from a client.

### Why a class, never an interface

You can express a shape in TypeScript two ways. Only one survives compilation.

```typescript title="src/cats/dto/create-cat.dto.ts"
// ❌ WRONG for a DTO — disappears at runtime
export interface CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

// ✅ RIGHT — a real value in the emitted JavaScript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}
```

Compile both and look at the output: the interface emits *nothing* — the file becomes empty — while the class emits a real constructor function. That difference is not cosmetic, because of how Nest's parameter pipeline works.

With TypeScript's `emitDecoratorMetadata` on (it is, in every Nest project's `tsconfig.json`), the compiler records each decorated parameter's type under the metadata key `design:paramtypes`: for a class, the class itself; for an interface, `Object`, because there is nothing else to record. `ValidationPipe` reads that metadata to decide what to validate against:

```typescript
// Roughly what ValidationPipe does, simplified
async transform(value: unknown, metadata: ArgumentMetadata) {
  const { metatype } = metadata;                 // ← the class, or Object
  if (!metatype || !this.toValidate(metatype)) {
    return value;                                // interface → bail out, no validation
  }
  const object = plainToInstance(metatype, value);
  const errors = await validate(object);
  if (errors.length) throw new BadRequestException(...);
  return object;
}
```

With an interface, `metatype` is `Object`, the pipe returns the raw body untouched, and **validation silently does nothing** — no error, no warning, an endpoint that accepts anything. That is the real reason the docs recommend classes, and it is worth understanding rather than memorising. Classes also give you somewhere to hang decorators, which is where DTOs earn their keep:

```typescript title="src/cats/dto/create-cat.dto.ts"
import { IsInt, IsString, Min, Max, Length } from 'class-validator';

export class CreateCatDto {
  @IsString()
  @Length(1, 40)
  name: string;

  @IsInt()
  @Min(0)
  @Max(30)
  age: number;

  @IsString()
  @Length(1, 40)
  breed: string;
}
```

`class-validator` and the `ValidationPipe` that drives it are [Chapter 10](./10-pipes-and-validation.md) and [Chapter 15](../part2-intermediate/15-validation-in-depth.md). The point here is structural: the decorators can only exist because the DTO is a class.

### Update DTOs

An update usually accepts a subset of the create fields. Longhand is explicit and fine:

```typescript title="src/cats/dto/update-cat.dto.ts"
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateCatDto {
  @IsOptional() @IsString() @Length(1, 40)
  name?: string;

  @IsOptional() @IsInt() @Min(0) @Max(30)
  age?: number;

  @IsOptional() @IsString() @Length(1, 40)
  breed?: string;
}
```

`@nestjs/mapped-types` (and its `@nestjs/swagger` equivalent) can derive this with `PartialType(CreateCatDto)`, which copies every property and marks each optional, validation rules included — [Chapter 30](../part2-intermediate/30-openapi-advanced.md). The longhand comes first here because knowing what `PartialType` generates is what lets you debug it later.

Query strings need shapes too — a `ListAllEntitiesDto` with `limit?: number; offset?: number; breed?: string` is the companion to `@Query()`. Remember from [Chapter 3](./03-controllers-routing.md) that query values arrive as strings, so `limit` typed as `number` is a promise the DTO cannot keep on its own; `ValidationPipe` with `transform: true` and `@Type(() => Number)` is what makes it true.

### Whitelisting

`ValidationPipe` can strip properties not declared on the DTO. With `whitelist: true`, a body of `{ name: 'Tom', age: 3, breed: 'Bengal', isAdmin: true }` reaches your handler as `{ name, age, breed }`; with `forbidNonWhitelisted: true` the same request is rejected with a 400. That is the difference between ignoring a mass-assignment attempt and reporting it — both beat the default, which passes everything through.

## Wiring the controller into a module

A fully written controller does nothing on its own. Nest will not instantiate it and will not register its routes until a module declares it:

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller';
import { CatsService } from './cats/cats.service';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class AppModule {}
```

`controllers` is the array Nest reads to build the route table; `providers` is what makes `CatsService` injectable into the controller's constructor. In a real application cats would get their own `CatsModule`, imported into `AppModule` — [Chapter 6 — Modules](./06-modules.md).

> **Hint** — `nest g resource cats` scaffolds the controller, service, module, DTOs, and spec file in one command, wired together and already imported. Use it for new resources and read what it produced.

## Common mistakes

1. **Injecting `@Res()` and returning a value.** *Symptom:* the request hangs until the client times out; the handler's unit test passes. *Cause:* `@Res()` puts the route in library-specific mode, so the return value is discarded. *Fix:* `@Res({ passthrough: true })`, or drop `@Res()` entirely.

2. **Using `passthrough: true` and then calling `res.json()`.** *Symptom:* `ERR_HTTP_HEADERS_SENT` — "Cannot set headers after they are sent to the client". *Cause:* both you and Nest tried to terminate the response. *Fix:* with `passthrough`, mutate headers/cookies/status only and let Nest write the body.

3. **A DTO declared as an `interface`.** *Symptom:* `ValidationPipe` is registered, invalid payloads sail through, nothing is logged. *Cause:* interfaces are erased at compile time, so `design:paramtypes` records `Object` and the pipe bails out. *Fix:* make it a `class`; if validation still does nothing, check `emitDecoratorMetadata` in `tsconfig.json`.

4. **Expecting `@Header()` to be dynamic.** *Symptom:* every response carries an identical `ETag`. *Cause:* the decorator's value is a constant evaluated once at bootstrap. *Fix:* use an interceptor, or `@Res({ passthrough: true })` with `res.setHeader()`.

5. **Returning `{ url }` without `@Redirect()`.** *Symptom:* the client receives `{"url":"..."}` with status 200 instead of a redirect. *Cause:* the override only applies when `@Redirect()` declared the route as a redirect. *Fix:* add the decorator.

6. **Returning a long-lived `Observable`.** *Symptom:* the request never completes. *Cause:* Nest waits for stream completion; an infinite stream never completes. *Fix:* `pipe(take(1))`, or `@Sse()` if you actually want a stream.

7. **Forgetting `controllers: [...]` in the module.** *Symptom:* 404 on every route in a file you just wrote, and no `RouterExplorer` line at boot. *Cause:* decorators only record metadata; the module declaration is what mounts the class. *Fix:* declare it, and check the boot log.

## Putting it together

A complete CRUD `CatsController` in standard mode: a service, correct status codes, validation, and the module that mounts it.

The domain type itself is a plain `interface Cat { id: number; name: string; age: number; breed: string }` in `src/cats/interfaces/cat.interface.ts` — an interface is correct *here*, because nothing validates against it at runtime.

```typescript title="src/cats/cats.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { Cat } from './interfaces/cat.interface';
import { CreateCatDto } from './dto/create-cat.dto';
import { UpdateCatDto } from './dto/update-cat.dto';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];
  private nextId = 1;

  create(dto: CreateCatDto): Cat {
    const cat: Cat = { id: this.nextId++, ...dto };
    this.cats.push(cat);
    return cat;
  }

  findAll(breed?: string, limit = 20): Cat[] {
    const filtered = breed ? this.cats.filter((c) => c.breed === breed) : this.cats;
    return filtered.slice(0, limit);
  }

  findOne(id: number): Cat {
    const cat = this.cats.find((c) => c.id === id);
    if (!cat) throw new NotFoundException(`Cat #${id} not found`);
    return cat;
  }

  update(id: number, dto: UpdateCatDto): Cat {
    return Object.assign(this.findOne(id), dto);
  }

  remove(id: number): void {
    this.cats.splice(this.cats.indexOf(this.findOne(id)), 1);
  }
}
```

```typescript title="src/cats/cats.controller.ts"
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus, Header, ParseIntPipe,
} from '@nestjs/common';
import { CatsService } from './cats.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { UpdateCatDto } from './dto/update-cat.dto';
import { ListAllEntitiesDto } from './dto/list-all-entities.dto';
import { Cat } from './interfaces/cat.interface';

@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Post()                                     // 201 by default — correct here
  create(@Body() createCatDto: CreateCatDto): Cat {
    return this.catsService.create(createCatDto);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  findAll(@Query() query: ListAllEntitiesDto): Cat[] {
    return this.catsService.findAll(query.breed, query.limit);
  }

  @Get(':id')                                 // declared after the static @Get()
  findOne(@Param('id', ParseIntPipe) id: number): Cat {
    return this.catsService.findOne(id);      // throws NotFoundException → 404
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCatDto: UpdateCatDto,
  ): Cat {
    return this.catsService.update(id, updateCatDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)            // 204, empty body
  remove(@Param('id', ParseIntPipe) id: number): void {
    this.catsService.remove(id);
  }
}
```

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller';
import { CatsService } from './cats/cats.service';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class AppModule {}
```

```typescript title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // strip undeclared properties
      forbidNonWhitelisted: true,   // ...or reject them outright
      transform: true,              // turn plain objects into DTO instances
    }),
  );
  await app.listen(3000);
}
bootstrap();
```

Exercise it and watch the status codes — they are the point of the chapter:

```bash
H='Content-Type: application/json'

curl -i -X POST localhost:3000/cats -H "$H" \
     -d '{"name":"Tom","age":3,"breed":"Bengal"}'   # 201 + JSON body
curl -i 'localhost:3000/cats?breed=Bengal&limit=5'  # 200 + Cache-Control: no-store
curl -i -X PATCH localhost:3000/cats/1 -H "$H" -d '{"age":4}'   # 200 + updated entity
curl -i -X DELETE localhost:3000/cats/1             # 204, empty body
curl -i localhost:3000/cats/999                     # 404 from NotFoundException
curl -i -X POST localhost:3000/cats -H "$H" -d '{"name":""}'    # 400 from ValidationPipe
```

Not one line of this controller touches the response object. That is what keeps it testable with `Test.createTestingModule`, portable from Express to Fastify, and eligible for every interceptor you add later.

> **핵심 정리**
> - Nest의 응답 방식은 **표준(선언형)** 과 **라이브러리 전용(명령형)** 둘뿐이며, `@Res()`/`@Next()`를 주입하는 순간 후자로 바뀐다. 반환값은 버려지고, 응답을 직접 종료하지 않으면 요청은 그대로 멈춘다.
> - 라이브러리 전용 모드에서는 `@HttpCode()`, `@Header()`, 리다이렉트, 인터셉터의 후처리, 직렬화가 모두 무력화된다. 경고는 없다.
> - 네이티브 응답 객체가 꼭 필요하면 `@Res({ passthrough: true })`로 헤더·쿠키·상태 코드만 건드려라. `res.json()` 같은 종료 메서드를 부르면 헤더 중복 오류가 난다.
> - 기본 상태 코드는 200이고 `@Post()`만 201이다. 성공 코드는 `@HttpCode()`로 **선언**하고 실패 코드는 예외를 **던져서** 만든다. `@Header()`의 값은 부팅 시 고정되는 상수이므로 동적 헤더는 인터셉터로 처리하라.
> - `@Redirect(url, statusCode)`는 기본 302이며, 핸들러가 `{ url, statusCode }`를 반환하면 데코레이터 인자를 덮어쓴다. `@Redirect()` 없이 `{ url }`만 반환하면 그냥 JSON 본문이다.
> - 핸들러는 `Promise`와 `Observable`을 모두 반환할 수 있다. Observable은 **완료 시점의 마지막 값 하나**로 응답하므로 스트리밍 수단이 아니며, 완료되지 않는 스트림은 요청을 멈춘다.
> - DTO는 반드시 **클래스**여야 한다. 인터페이스는 컴파일 시 사라져 `design:paramtypes`에 `Object`만 남고 `ValidationPipe`는 조용히 아무 일도 하지 않는다.
> - `whitelist`는 선언되지 않은 속성을 제거하고 `forbidNonWhitelisted`는 400으로 거절한다. 그리고 컨트롤러는 모듈의 `controllers` 배열에 등록되어야 비로소 라우트가 생긴다.

> **연습 문제**
> 1. `@Res()`를 주입하고 값을 `return`하는 핸들러를 만들어 `curl -i`로 호출하라. 응답이 오지 않는 것을 확인한 뒤 `passthrough: true`를 추가하면 무엇이 달라지는가? 같은 핸들러에 `@HttpCode(202)`를 붙였을 때 두 모드에서 상태 코드가 어떻게 다른지 비교하라.
> 2. `@Post()` 핸들러의 기본 상태 코드가 201인 것을 확인하고, `@HttpCode(HttpStatus.NO_CONTENT)`를 붙였을 때 응답 본문과 `Content-Length`가 어떻게 바뀌는지 관찰하라.
> 3. `CreateCatDto`를 `interface`로 바꾸고 `ValidationPipe`가 등록된 상태에서 잘못된 본문을 보내라. 왜 400이 나오지 않는가? 컴파일된 `.js` 파일을 열어 근거를 찾아 설명하라.
> 4. **직접 만들어 보라.** `@Redirect()`로 `GET /docs?version=5`는 v5 문서로, 버전이 없으면 최신 문서로 보내는 핸들러를 작성하라. 301과 302를 각각 적용해 브라우저 캐시 동작의 차이를 설명하라.
> 5. **직접 만들어 보라.** 이 장의 `CatsController`를 완성한 뒤 `findAll()`이 `Observable<Cat[]>`을 반환하도록 바꾸고, `of([...])`, `interval(1000).pipe(take(3))`, 완료되지 않는 `interval(1000)` 세 경우의 응답을 비교해 이유를 설명하라. 이어서 `whitelist`와 `forbidNonWhitelisted` 조합을 바꿔 가며 `{"name":"Tom","age":3,"breed":"Bengal","isAdmin":true}`를 POST했을 때 핸들러가 받는 객체와 상태 코드를 표로 정리하라.

**Next:** [Chapter 5 — Providers and Services](./05-providers-and-services.md) picks up the `CatsService` this chapter quietly injected and explains what actually happened: what `@Injectable()` marks, how Nest resolves a constructor parameter to an instance, and why business logic belongs there rather than in a controller.
