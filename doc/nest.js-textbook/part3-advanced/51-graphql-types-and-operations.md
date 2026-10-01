---
title: "51. GraphQL II"
parent: "Part III — Advanced (고급)"
grand_parent: "NestJS Complete Guide"
nav_order: 51
chapter: 51
part: "Part III — Advanced (고급)"
level: advanced
reading_time: "50 min"
prerequisites: [50]
source_docs:
  - "content/graphql/mutations.md"
  - "content/graphql/subscriptions.md"
  - "content/graphql/scalars.md"
  - "content/graphql/unions-and-enums.md"
  - "content/graphql/interfaces.md"
  - "content/graphql/mapped-types.md"
source_url: "https://docs.nestjs.com/graphql/mutations"
nest_baseline: "11.x"
---

# Chapter 51 — GraphQL II: Mutations, Subscriptions, Scalars, Unions, and Interfaces

> **한눈에 보기**
> 50장에서 만든 그래프는 아직 읽기만 합니다. 이 장은 나머지 절반 — 쓰기(mutation),
> 실시간 푸시(subscription), 그리고 스키마의 표현력을 결정하는 타입 도구들(scalar, enum,
> union, interface, mapped type) — 을 채웁니다. 특히 두 가지를 깊이 다룹니다. 첫째,
> **에러를 예외로 던질 것인가 데이터로 반환할 것인가**는 mutation 설계의 핵심 결정입니다.
> 둘째, subscription은 WebSocket 위에서 동작하므로 인증 시점과 PubSub 백엔드가
> 프로세스를 여러 개로 늘리는 순간 곧바로 문제가 됩니다. 44장의 WebSocket 지식이
> 여기서 다시 쓰입니다.

**What you will learn**

- How to design mutation payloads that survive schema evolution, and when to return errors *as data* instead of throwing.
- Why `@Mutation` is only a convention to GraphQL, and the one guarantee the spec actually gives you about it (serial execution).
- How to enable subscriptions with `graphql-ws`, why `subscriptions-transport-ws` is deprecated, and what breaks when you use the wrong one with GraphiQL.
- The exact shape a `PubSub` payload must have to match a subscription's return type, and the `filter` / `resolve` hooks that sit between them.
- How to authenticate a WebSocket connection in `onConnect` — with the two different callback signatures — and why per-connection auth is not the same as per-request auth.
- Why the in-memory `PubSub` silently breaks the moment you run two replicas, and how a Redis-backed emitter fixes it (and what it still does not fix).
- The five built-in code-first scalars, the two global scalar-mode switches, and three ways to add a custom one — `@Scalar`+`CustomScalar`, a raw `GraphQLScalarType`, and a third-party package.
- `createUnionType` with a custom `resolveType`, `registerEnumType` with `valuesMap` deprecation, `@InterfaceType` with shared field resolvers, and why returning object literals breaks all three.
- `PartialType`, `PickType`, `OmitType`, and `IntersectionType` from `@nestjs/graphql` — and why importing them from `@nestjs/swagger` by accident is a silent failure.

**Why this matters**

Every GraphQL API eventually hits the same wall on its first serious mutation. A user submits a signup form; the email is already taken. You throw a `ConflictException`, and the client receives:

```json
{ "data": { "signUp": null }, "errors": [ { "message": "Email already in use", "path": ["signUp"] } ] }
```

The frontend developer now has to parse a string out of the `errors` array to decide which form field to highlight, and their generated TypeScript types say nothing about it — `errors` is untyped by the spec. Meanwhile your monitoring records a `200 OK`, so nothing alerts. Multiply that by every business rule in your domain and you have an API where the *expected* outcomes live in an untyped side channel. There is a better design, it is called errors-as-data, and this chapter shows exactly when to use it and when throwing is still right.

Subscriptions bring a different class of surprise, and it arrives on the day you scale to two pods. The default `PubSub` from `graphql-subscriptions` is an in-process `EventEmitter`. Pod A holds a client's WebSocket; a mutation lands on pod B and publishes `commentAdded`. Pod B's emitter has zero local subscribers, so the event evaporates. The client sees nothing. Nothing errors, nothing logs, and it works perfectly on your laptop where there is only one process. This is the single most common GraphQL subscription failure in production, and the fix — an external broker — has its own caveats about fan-out that are worth understanding before you need them.

The rest of the chapter is type-system work, and it is less dramatic but compounds. Custom scalars are how you stop passing dates around as strings and hoping. Interfaces and unions are how you model "this field returns one of several things" without an `Object`-typed escape hatch. Mapped types are how `UpdateUserInput` stays in lockstep with `CreateUserInput` through six months of field churn. None of these is exciting on its own; together they are the difference between a schema that documents your domain and a schema full of `String` and `JSON`.

---

## Mutations

A mutation is declared with `@Mutation()`, which takes the same options as `@Query()` — `name`, `description`, `deprecationReason`, `nullable`, `complexity`.

```typescript title="src/posts/posts.resolver.ts"
import { Args, Int, Mutation, Resolver } from '@nestjs/graphql';
import { Post } from './models/post.model';
import { PostsService } from './posts.service';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Mutation(() => Post)
  async upvotePost(@Args('postId', { type: () => Int }) postId: number) {
    return this.postsService.upvoteById({ id: postId });
  }
}
```

```graphql
type Mutation {
  upvotePost(postId: Int!): Post!
}
```

Schema first is the same method with a string, and the field declared in SDL:

```typescript
@Mutation()
async upvotePost(@Args('postId') postId: number) {
  return this.postsService.upvoteById({ id: postId });
}
```

```graphql
type Mutation {
  upvotePost(postId: Int!): Post
}
```

**What `@Mutation` actually means.** To GraphQL, nothing about writes is enforced — a `Query` field could delete your database and the server would not object. The spec gives exactly one behavioral guarantee: **top-level mutation fields execute serially**, one after another, while top-level query fields may execute in parallel. Everything else — that mutations are for writes, that queries are safe to retry — is convention, but convention that every client library, every cache, and every developer relies on. Honor it.

That serial guarantee is genuinely useful:

```graphql
mutation {
  createAuthor(input: { name: "Ada" }) { id }
  publishPost(authorName: "Ada", title: "Notes") { id }
}
```

These run in document order. Fields *nested inside* a mutation's return type still resolve in parallel, like any other selection set.

### Input types for mutations

Beyond one or two scalars, take a single `@InputType()` argument:

```typescript title="src/posts/dto/create-post.input.ts"
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, MaxLength, MinLength } from 'class-validator';

@InputType({ description: 'Payload for creating a post' })
export class CreatePostInput {
  @Field()
  @MinLength(3) @MaxLength(120)
  title: string;

  @Field({ nullable: true })
  body?: string;

  @Field(() => Int)
  @IsInt()
  authorId: number;
}
```

```typescript
@Mutation(() => Post)
createPost(@Args('input') input: CreatePostInput) {
  return this.postsService.create(input);
}
// → createPost(input: CreatePostInput!): Post!
```

Why one input object rather than eight arguments: adding a field is a non-breaking change to an input type, argument lists get unreadable past three, and the client can pass a single variable (`mutation($input: CreatePostInput!)`) that codegen types exactly. Convention in most large schemas is one input type per mutation, named `<Mutation>Input`.

`ValidationPipe` applies exactly as in REST ([Chapter 15](../part2-intermediate/15-validation-in-depth.md)). Register it globally and `class-validator` runs before your resolver:

```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

A failure produces a `BadRequestException`, which GraphQL surfaces in `errors` with `extensions.code: 'BAD_USER_INPUT'`. That is the right place for *schema-level* violations — malformed input the client should never have sent.

### Return payloads: design for evolution

`@Mutation(() => Post)` returning the bare entity is the obvious choice and the one you will regret. A payload wrapper gives you room:

```typescript title="src/posts/dto/create-post.payload.ts"
import { Field, ObjectType } from '@nestjs/graphql';
import { Post } from '../models/post.model';
import { Author } from '../../authors/models/author.model';

@ObjectType()
export class CreatePostPayload {
  @Field(() => Post, { nullable: true })
  post?: Post;

  /** The author, so the client can update its cached author.postCount */
  @Field(() => Author, { nullable: true })
  author?: Author;
}
```

```typescript
@Mutation(() => CreatePostPayload)
async createPost(@Args('input') input: CreatePostInput): Promise<CreatePostPayload> {
  const post = await this.postsService.create(input);
  return { post, author: await this.authorsService.findOneById(input.authorId) };
}
```

Three things this buys. You can add fields (`errors`, `clientMutationId`, affected siblings) without a breaking change. You can return *everything the write touched*, which is what normalized client caches need to stay consistent without a refetch. And you get a home for typed errors — the next section.

### Errors as data versus thrown errors

This is the design decision, and the honest answer is that both are right for different things.

| | **Throw (`errors` array)** | **Return as data (typed payload)** |
|---|---|---|
| Good for | Bugs, auth failures, schema violations, infrastructure faults | Expected business outcomes: taken email, insufficient funds, expired coupon |
| Typed for the client | No — `errors` is untyped by the spec | Yes — it is part of the schema |
| Partial success | `data` is `null` for that field | The payload carries both result and errors |
| Discoverability | Not in the schema at all | Visible in GraphiQL and codegen |
| Cost | Free | An extra union or errors field per mutation |

Thrown errors are correct for anything the client cannot meaningfully act on. Errors-as-data is correct for anything the client *renders as UI*. "Email already taken" is not an exception; it is a normal branch in the signup flow, and burying it in `errors` forces every client to string-match.

A payload with a typed errors list:

```typescript title="src/users/dto/sign-up.payload.ts"
import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { User } from '../models/user.model';

export enum SignUpErrorCode {
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  INVITE_EXPIRED = 'INVITE_EXPIRED',
}
registerEnumType(SignUpErrorCode, { name: 'SignUpErrorCode' });

@ObjectType()
export class SignUpError {
  @Field(() => SignUpErrorCode) code: SignUpErrorCode;
  @Field() message: string;
  /** Dotted path into the input, e.g. "input.email" — lets the UI focus a field */
  @Field({ nullable: true }) field?: string;
}

@ObjectType()
export class SignUpPayload {
  @Field(() => User, { nullable: true }) user?: User;
  @Field(() => [SignUpError]) errors: SignUpError[];
}
```

```typescript
@Mutation(() => SignUpPayload)
async signUp(@Args('input') input: SignUpInput): Promise<SignUpPayload> {
  const existing = await this.usersService.findByEmail(input.email);
  if (existing) {
    return {
      errors: [{
        code: SignUpErrorCode.EMAIL_TAKEN,
        message: 'That email is already registered.',
        field: 'input.email',
      }],
    };
  }
  // A real failure here — a dropped database connection — still throws.
  return { user: await this.usersService.create(input), errors: [] };
}
```

The client writes a `switch` on a generated enum instead of a regex on a message. The stricter variant models the outcome as a union (`union SignUpResult = SignUpSuccess | EmailTakenError | WeakPasswordError`), which forces the client to handle every branch via inline fragments — see the unions section below.

Pick one convention and apply it across the schema. A mix, where half the mutations throw and half return errors, is worse than either.

---

## Subscriptions

A subscription opens a long-lived channel: the client sends one operation, the server pushes a result every time an event fires. Transport is WebSocket. Everything you learned about WebSocket lifecycles in [Chapter 44](./44-websockets.md) applies — with a GraphQL-specific protocol layered on top.

### Enabling the transport

```typescript
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  graphiql: true,
  subscriptions: {
    'graphql-ws': true,
  },
});
```

```bash
$ npm i graphql-subscriptions graphql-ws
```

There are two protocols, and the choice is already made for you:

| | `graphql-ws` | `subscriptions-transport-ws` |
|---|---|---|
| Status | Current, maintained | **Deprecated**, unmaintained |
| Package | `graphql-ws` | `subscriptions-transport-ws` |
| GraphiQL support | Yes | **No** |
| `onConnect` signature | `(context) => void` with `connectionParams`, `extra` | `(connectionParams) => object` |
| Known defects | — | Connections can skip `onConnect` entirely |

Use `graphql-ws`. Serve both only for backward compatibility with old clients:

```typescript
subscriptions: {
  'graphql-ws': { path: '/graphql' },
  'subscriptions-transport-ws': { path: '/graphql' },
},
```

> **⚠️ Notice** — The legacy `installSubscriptionHandlers: true` option silently falls back to `subscriptions-transport-ws`. It has been removed upstream in Apollo Server and is deprecated in `@nestjs/graphql`. Do not use it in new code.

### Declaring a subscription

```typescript title="src/comments/comments.resolver.ts"
import { Inject } from '@nestjs/common';
import { Args, Mutation, Resolver, Subscription } from '@nestjs/graphql';
import { PubSub } from 'graphql-subscriptions';
import { Comment } from './models/comment.model';

@Resolver(() => Comment)
export class CommentsResolver {
  constructor(
    @Inject('PUB_SUB') private readonly pubSub: PubSub,
    private readonly commentsService: CommentsService,
  ) {}

  @Subscription(() => Comment)
  commentAdded() {
    return this.pubSub.asyncIterableIterator('commentAdded');
  }

  @Mutation(() => Comment)
  async addComment(@Args('input') input: AddCommentInput) {
    const newComment = await this.commentsService.add(input);
    await this.pubSub.publish('commentAdded', { commentAdded: newComment });
    return newComment;
  }
}
```

```graphql
type Subscription {
  commentAdded: Comment!
}
```

Register the `PubSub` as a provider rather than a module-level `const`, so every resolver shares the same instance and tests can swap it:

```typescript title="src/pubsub/pubsub.module.ts"
import { Global, Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';

@Global()
@Module({
  providers: [{ provide: 'PUB_SUB', useValue: new PubSub() }],
  exports: ['PUB_SUB'],
})
export class PubSubModule {}
```

Name decoupling works as with queries:

```typescript
@Subscription(() => Comment, { name: 'commentAdded' })
subscribeToCommentAdded() {
  return this.pubSub.asyncIterableIterator('commentAdded');
}
```

> **Hint** — The method is `asyncIterableIterator` in current `graphql-subscriptions` (v2+). Older code calls `asyncIterator`; if you see `pubSub.asyncIterator is not a function`, you are on the new package with old call sites, or the reverse.

### The payload shape rule

This trips up everyone once. A subscription resolves to an object whose **single top-level key is the subscription's field name**. `type Subscription { commentAdded: Comment! }` means the published payload must be `{ commentAdded: <Comment> }`, not the comment itself:

```typescript
// Correct
await pubSub.publish('commentAdded', { commentAdded: newComment });

// Wrong — validation error at delivery time, not at publish time
await pubSub.publish('commentAdded', newComment);
```

The trigger name and the field name are independent — the trigger is just a string key into the emitter — but conventionally identical, and the payload key must match the *field*.

### `filter` and `resolve`

`filter` decides which subscribers receive an event. It gets `(payload, variables, context, info)` and returns a boolean (or a promise of one):

```typescript
@Subscription(() => Comment, {
  filter: (payload, variables) => payload.commentAdded.postId === variables.postId,
})
commentAdded(@Args('postId', { type: () => Int }) postId: number) {
  return this.pubSub.asyncIterableIterator('commentAdded');
}
```

```graphql
type Subscription {
  commentAdded(postId: Int!): Comment!
}
```

Subscription arguments are declared with `@Args()` exactly as on a query — they exist so `filter` can use them via `variables`.

`resolve` transforms the payload before delivery:

```typescript
@Subscription(() => Comment, {
  resolve: (value) => value.commentAdded,   // return the UNWRAPPED value
})
commentAdded() {
  return this.pubSub.asyncIterableIterator('commentAdded');
}
```

> **⚠️ Notice** — When you supply `resolve`, return the unwrapped payload — the `Comment`, not `{ commentAdded: Comment }`. The wrapping rule applies to the *published* payload; `resolve` runs after unwrapping.

Both hooks are plain functions and therefore have no `this` — unless you write them as method shorthand with an explicit `this` type, which Nest binds to the resolver instance:

```typescript
@Subscription(() => Comment, {
  filter(this: CommentsResolver, payload, variables) {
    // `this` is the CommentsResolver instance — injected providers are reachable
    return this.aclService.canSee(variables.userId, payload.commentAdded);
  },
})
commentAdded(@Args('userId') userId: string) {
  return this.pubSub.asyncIterableIterator('commentAdded');
}
```

Keep filters cheap. A filter runs once per connected subscriber per event; an async database call inside it turns one publish into N queries. Prefer topic granularity — publish to `commentAdded:${postId}` and subscribe to the specific trigger — over filtering a firehose.

Schema first is the same, with the field name as the first argument:

```typescript
@Subscription('commentAdded', {
  filter: (payload, variables) => payload.commentAdded.title === variables.title,
})
commentAdded() {
  return this.pubSub.asyncIterableIterator('commentAdded');
}
```

### The subscription lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant WS as graphql-ws server
    participant CTX as context factory
    participant R as @Subscription resolver
    participant PS as PubSub
    participant M as Mutation (any request)

    C->>WS: WebSocket upgrade + ConnectionInit(connectionParams)
    WS->>WS: onConnect(ctx) — validate token, stash user on ctx.extra
    WS-->>C: ConnectionAck
    C->>WS: Subscribe(id:1, query: subscription { commentAdded(postId:7){...} })
    WS->>CTX: context({ extra }) → per-connection context
    WS->>R: invoke commentAdded()
    R->>PS: asyncIterableIterator('commentAdded')
    PS-->>R: AsyncIterator (registered listener)
    Note over WS,PS: channel open; nothing sent yet

    M->>PS: publish('commentAdded', { commentAdded: c })
    PS-->>WS: event → for each subscriber
    WS->>WS: filter(payload, variables) → false? drop
    WS->>WS: resolve(payload) → shape value
    WS->>WS: execute selection set against the value
    WS-->>C: Next(id:1, { data: { commentAdded: {...} } })

    C->>WS: Complete(id:1)  /  or socket closes
    WS->>PS: unsubscribe listener
    Note over WS: onDisconnect — release per-connection resources
```

Three details this makes visible. The `context` factory runs **once per connection**, not once per event — so anything you put there (a DataLoader, a user object) lives for the whole connection, potentially hours. Filtering happens on the server per subscriber, so a coarse topic with a selective filter costs you fan-out you could have avoided. And an unclosed subscription is a leaked listener plus a leaked socket; `onDisconnect` is where you release anything you allocated.

### Authentication over WebSockets

A WebSocket handshake has no `Authorization` header you can rely on — browsers do not let you set headers on `new WebSocket()`. Clients therefore send credentials in `connectionParams` on the init message, and you validate them in `onConnect`.

With `graphql-ws`:

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  subscriptions: {
    'graphql-ws': {
      onConnect: (context: any) => {
        const { connectionParams, extra } = context;
        const token = connectionParams?.authToken;
        if (!token) throw new Error('Missing auth token');
        // Anything you attach to `extra` is reachable from the context factory.
        extra.user = verifyToken(token);
      },
      onDisconnect: (context: any) => {
        // release per-connection resources here
      },
    },
  },
  context: (ctx: any) => {
    // HTTP requests carry `req`; WS connections carry `extra`.
    return ctx.extra ? { user: ctx.extra.user } : { req: ctx.req, user: ctx.req?.user };
  },
});
```

With the legacy `subscriptions-transport-ws`, the signature differs — the callback receives `connectionParams` directly and its **return value** becomes `connection.context`:

```typescript
subscriptions: {
  'subscriptions-transport-ws': {
    onConnect: (connectionParams) => {
      const token = connectionParams.authToken;
      if (!isValid(token)) throw new Error('Token is not valid');
      return { user: parseToken(token) };   // → context.connection.context
    },
  },
},
context: ({ connection }) => {
  // connection.context is whatever onConnect returned
},
```

> **⚠️ Notice** — `subscriptions-transport-ws` has a known defect that allows a connection to skip `onConnect` entirely. Never assume it ran; always check that `context.user` is populated inside the subscription resolver or a guard.

Two properties of connection-level auth are worth stating plainly, because they differ from HTTP.

**Authentication happens once, at connect.** A token validated at 09:00 governs a socket still open at 17:00. If your tokens expire in fifteen minutes, that socket is running on an expired credential. Mitigations: check expiry inside a guard on each subscription operation, or run a timer that closes sockets whose token has passed `exp`.

**Authorization is still per-operation.** `onConnect` proves *who*; a guard on the `@Subscription()` method decides *what*. `@UseGuards()` works on subscription resolvers with the `GqlExecutionContext` treatment from [Chapter 52](./52-graphql-advanced.md) — with the caveat that the guard reads the user from the connection context, not from `req.user`.

### Subscriptions with Mercurius

Mercurius has its own `PubSub`, injected through context rather than DI, with a different publish shape:

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  autoSchemaFile: true,
  subscription: true, // note: singular, unlike Apollo's `subscriptions`
});
```

```typescript
import { PubSub } from 'mercurius';

@Subscription(() => Comment)
commentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

@Mutation(() => Comment)
async addComment(@Args('input') input: AddCommentInput, @Context('pubsub') pubSub: PubSub) {
  const newComment = await this.commentsService.add(input);
  await pubSub.publish({ topic: 'commentAdded', payload: { commentAdded: newComment } });
  return newComment;
}
```

Mercurius authenticates with `verifyClient` on the raw upgrade request, so headers *are* available:

```typescript
subscription: {
  verifyClient: (info, next) => {
    const authorization = info.req.headers?.authorization as string;
    if (!authorization?.startsWith('Bearer ')) return next(false);
    next(true);
  },
},
```

### Production PubSub, and the scaling caveat

The default `PubSub` is an in-process `EventEmitter`. With two replicas behind a load balancer, a publish on pod B never reaches a subscriber on pod A. This is the failure described at the top of the chapter: silent, invisible locally, guaranteed in production.

The fix is an external broker. For Apollo, `graphql-redis-subscriptions`:

```bash
$ npm i graphql-redis-subscriptions ioredis
```

```typescript title="src/pubsub/pubsub.module.ts"
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'PUB_SUB',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const options = {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          retryStrategy: (times: number) => Math.min(times * 50, 2000),
        };
        // Redis requires SEPARATE connections: a subscribed client
        // cannot issue publish commands.
        return new RedisPubSub({
          publisher: new Redis(options),
          subscriber: new Redis(options),
        });
      },
    },
  ],
  exports: ['PUB_SUB'],
})
export class PubSubModule {}
```

Nothing in your resolvers changes — `RedisPubSub` implements the same interface. For Mercurius, swap the emitter instead:

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: {
    emitter: require('mqemitter-redis')({ host: '127.0.0.1', port: 6379 }),
  },
});
```

Now the caveats, because Redis solves delivery and not fan-out.

*Every pod receives every event.* Redis pub/sub broadcasts to all subscribed clients. Ten pods and a publish to a topic with one interested subscriber means ten deliveries and nine wasted filter evaluations. With a coarse topic and a selective `filter`, that is O(pods × events × subscribers) of wasted work. Make topics granular: `comment:added:${postId}`, not `commentAdded`.

*Redis pub/sub is fire-and-forget.* No persistence, no replay, at-most-once. A pod that is restarting misses events entirely, and clients see a gap with no error. If missed events are unacceptable, publish to a durable log (Kafka, [Chapter 47](./47-kafka.md)) and have each pod tail it, or have the client refetch on reconnect.

*Sticky sessions are not required but help.* WebSockets are long-lived, so any load balancer will keep a connection pinned once established. What you do need is a balancer configured for WebSocket upgrades and an idle timeout longer than your heartbeat interval — otherwise connections are culled at 60 seconds and clients reconnect in a loop.

*Subscriptions are not supported under Apollo Federation.* If you are heading toward [Chapter 52](./52-graphql-advanced.md)'s federation section, plan to serve subscriptions from a dedicated non-federated service.

Finally: subscriptions are not the only answer to "the client needs updates." Polling a cheap query is dramatically simpler and correct for anything above a few seconds of latency tolerance. Server-Sent Events ([Chapter 57](./57-advanced-http.md)) give you one-way push over plain HTTP with automatic reconnection and no protocol negotiation. Reach for subscriptions when you need sub-second, bidirectional, per-user-filtered delivery — and accept the operational surface that comes with it.

---

## Scalars

Scalars are the leaves of a query — the point where the graph resolves to a concrete value.

### Built-ins and the two global switches

Code first ships five, three of which alias GraphQL's own:

| Scalar | Import | Represents |
|---|---|---|
| `ID` | `@nestjs/graphql` | `GraphQLID` — an opaque identifier, serialized as a string |
| `Int` | `@nestjs/graphql` | `GraphQLInt` — signed 32-bit integer |
| `Float` | `@nestjs/graphql` | `GraphQLFloat` — signed double |
| `GraphQLISODateTime` | `@nestjs/graphql` | ISO-8601 UTC string, e.g. `2025-12-03T09:54:33Z` — the default for `Date` |
| `GraphQLTimestamp` | `@nestjs/graphql` | Milliseconds since the UNIX epoch, as a signed integer |

`String` and `Boolean` are inferred from TypeScript and need no wrapper. Two `buildSchemaOptions` switches change global defaults:

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  buildSchemaOptions: {
    dateScalarMode: 'timestamp',  // Date → GraphQLTimestamp instead of ISO
    numberScalarMode: 'integer',  // bare `number` → Int instead of Float
  },
});
```

`numberScalarMode: 'integer'` is tempting because it removes most `@Field(() => Int)` annotations — and dangerous, because a genuine float silently truncates at serialization. Keep the default and be explicit.

### Overriding a built-in's mapping

To make `Date` serialize as an epoch integer through a class you control, implement `CustomScalar` and register the class as a provider:

```typescript title="src/common/scalars/date.scalar.ts"
import { CustomScalar, Scalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type — milliseconds since epoch';

  /** Client variable → server value */
  parseValue(value: number): Date {
    return new Date(value);
  }

  /** Server value → client */
  serialize(value: Date): number {
    return value.getTime();
  }

  /** Inline literal in the query document → server value */
  parseLiteral(ast: ValueNode): Date | null {
    if (ast.kind === Kind.INT) {
      return new Date(Number(ast.value));
    }
    return null;
  }
}
```

```typescript
@Module({ providers: [DateScalar] })
export class CommonModule {}
```

```typescript
@Field()
creationDate: Date;   // now uses your scalar, schema-wide
```

The second argument to `@Scalar('Date', () => Date)` is what binds the scalar to the TypeScript type — without it, the scalar exists in the schema but `Date` fields still use `GraphQLISODateTime`.

The three methods form the full contract, and all three matter:

- `serialize` — outbound. Called on every response containing the field. Must be fast and must never throw for valid data.
- `parseValue` — inbound, when the value arrives through a **variable**. Throw here to reject.
- `parseLiteral` — inbound, when the value is written **inline in the query document**. Skipping this means `{ user(bornOn: 1234567890) }` fails while the variable form works — a bug that survives testing because clients almost always use variables.

### A custom scalar from `GraphQLScalarType`

For a scalar that maps to no TypeScript class, build a `GraphQLScalarType` directly:

```typescript title="src/common/scalars/uuid.scalar.ts"
import { GraphQLScalarType, Kind } from 'graphql';

const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(uuid: unknown): string {
  if (typeof uuid !== 'string' || !regex.test(uuid)) {
    throw new TypeError('Invalid UUID');
  }
  return uuid;
}

export const CustomUuidScalar = new GraphQLScalarType({
  name: 'UUID',
  description: 'A RFC 4122 UUID',
  serialize: (value) => validate(value),
  parseValue: (value) => validate(value),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? validate(ast.value) : null),
});
```

Register it through `resolvers` and reference it in a field:

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  resolvers: { UUID: CustomUuidScalar },
});
```

```typescript
@Field(() => CustomUuidScalar)
uuid: string;
```

Validation inside a scalar is genuinely powerful: an invalid UUID is rejected during GraphQL's *validation* phase, before any resolver runs and before it can reach your database. That is stricter and earlier than a pipe.

### Third-party scalars

Do not write scalars that already exist. `graphql-type-json` and the `graphql-scalars` suite (`EmailAddress`, `URL`, `PositiveInt`, `DateTime`, `JSONObject`, …) cover most needs:

```bash
$ npm i graphql-type-json
```

```typescript
import GraphQLJSON from 'graphql-type-json';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  resolvers: { JSON: GraphQLJSON },
});
```

```typescript
@Field(() => GraphQLJSON)
metadata: Record<string, unknown>;
```

A word of caution on `JSON`: it is a hole in your schema. Nothing inside it is typed, introspectable, or validated, and clients cannot select subfields. Use it for genuinely open-ended blobs (a webhook body, user-defined settings) and never as a shortcut around modelling.

### Schema-first scalar wiring

Declare the scalar in SDL and provide the implementation:

```graphql
scalar Date
scalar JSON

type Foo {
  createdAt: Date
  metadata: JSON
}
```

The `@Scalar('Date')` class (without the second type argument) registers automatically once listed as a provider; third-party scalars go through `resolvers`:

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  resolvers: { JSON: GraphQLJSON },
});
```

And remember the typings problem from [Chapter 50](./50-graphql-fundamentals.md): every custom scalar generates as `any` unless you configure `defaultScalarType`, `customScalarTypeMapping`, and `additionalHeader` on `GraphQLDefinitionsFactory`.

---

## Enums

An enum is a scalar restricted to a fixed set of names. It validates arguments and documents intent in one move.

```typescript title="src/common/enums/allowed-color.enum.ts"
import { registerEnumType } from '@nestjs/graphql';

export enum AllowedColor {
  RED = 'RED',
  GREEN = 'GREEN',
  BLUE = 'BLUE',
}

registerEnumType(AllowedColor, {
  name: 'AllowedColor',
  description: 'The supported colors.',
  valuesMap: {
    RED: { description: 'The default color.' },
    BLUE: { deprecationReason: 'Too blue.' },
  },
});
```

```graphql
"""The supported colors."""
enum AllowedColor {
  """The default color."""
  RED
  GREEN
  BLUE @deprecated(reason: "Too blue.")
}
```

```typescript
@Field(() => AllowedColor)
favoriteColor: AllowedColor;
```

`registerEnumType` must run before schema building — put the call in the same file as the enum, immediately after the declaration, so importing the enum anywhere registers it. A common failure is registering it inside a module constructor, which runs too late.

Prefer string-valued enums (`RED = 'RED'`) over numeric ones. TypeScript's numeric enums serialize as integers, which makes database rows and log lines unreadable and reorders catastrophically if someone inserts a member.

Schema first declares the enum in SDL. The interesting capability there is **internal values** — the public API says `RED` while your code works with `#f00`:

```graphql
enum AllowedColor {
  RED
  GREEN
  BLUE
}
```

```typescript
export const allowedColorResolver: Record<keyof typeof AllowedColor, any> = {
  RED: '#f00',
  GREEN: '#0f0',
  BLUE: '#00f',
};

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  resolvers: { AllowedColor: allowedColorResolver },
});
```

The generated TypeScript enum comes from `definitions`; `enumsAsTypes: true` emits union string types instead, which some teams prefer for tree-shaking.

---

## Unions

A union returns one of several types that share **no** common fields.

```typescript title="src/search/result-union.ts"
import { createUnionType } from '@nestjs/graphql';
import { Author } from '../authors/models/author.model';
import { Book } from '../books/models/book.model';

export const ResultUnion = createUnionType({
  name: 'ResultUnion',
  types: () => [Author, Book] as const,
});
```

```typescript
@Query(() => [ResultUnion])
search(@Args('term') term: string): Array<typeof ResultUnion> {
  return this.searchService.search(term);
}
```

```graphql
union ResultUnion = Author | Book

type Query {
  search(term: String!): [ResultUnion!]!
}
```

Clients select with inline fragments:

```graphql
query {
  search(term: "ada") {
    __typename
    ... on Author { name }
    ... on Book { title }
  }
}
```

> **⚠️ Notice** — The `as const` on the `types` array is not optional. Without it, the compiler emits a wrong declaration file and consumers of the package fail to type-check. This bites hardest in a monorepo where the union lives in a shared library.

**Type resolution.** The default `resolveType` inspects the runtime value's constructor, which means the resolver must return **class instances**, not object literals:

```typescript
// Works — instanceof Author
return [Object.assign(new Author(), row)];

// Fails — "Abstract type ResultUnion must resolve to an Object type at runtime"
return [{ id: 1, name: 'Ada' }];
```

This is the number one union/interface bug, and it is easy to hit with an ORM that returns plain objects or with a `JSON.parse` in a cache layer. Two fixes: hydrate into classes (`plainToInstance` from `class-transformer`), or write an explicit `resolveType`:

```typescript
export const ResultUnion = createUnionType({
  name: 'ResultUnion',
  types: () => [Author, Book] as const,
  resolveType(value) {
    if ('name' in value) return Author;
    if ('title' in value) return Book;
    return null;
  },
});
```

Discriminating on field presence is fragile — an optional field that happens to be absent flips the branch. Prefer an explicit discriminator on the row (`value.kind === 'author'`).

Schema first declares the union in SDL and requires a `__resolveType` in the resolver map, delivered as a resolver class registered as a provider:

```graphql
union ResultUnion = Author | Book
```

```typescript
@Resolver('ResultUnion')
export class ResultUnionResolver {
  @ResolveField()
  __resolveType(value: any) {
    if (value.name) return 'Author';
    if (value.title) return 'Book';
    return null;
  }
}
```

Note the return type: schema first returns the type **name as a string**; code first returns the **class reference**.

---

## Interfaces

An interface is an abstract type with a set of fields that implementing types must provide.

```typescript title="src/characters/models/character.interface.ts"
import { Field, ID, InterfaceType } from '@nestjs/graphql';

@InterfaceType({ description: 'Anything with an identity and a name' })
export abstract class Character {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}
```

> **⚠️ Notice** — A TypeScript `interface` cannot define a GraphQL interface. Decorators need a runtime value, and interfaces are erased. Use an `abstract class`.

Implementing types declare membership through `implements` in the decorator options — the TypeScript `implements` clause alone is not enough, since it too is erased:

```typescript
@ObjectType({ implements: () => [Character] })
export class Human implements Character {
  id: string;
  name: string;

  @Field()
  homePlanet: string;
}
```

```graphql
interface Character {
  id: ID!
  name: String!
}

type Human implements Character {
  id: ID!
  name: String!
  homePlanet: String!
}
```

Fields inherited from the interface do not need repeating with `@Field()`; the factory copies them.

Type resolution follows the same rule as unions — class instances by default, or an explicit `resolveType`:

```typescript
@InterfaceType({
  resolveType(book) {
    return book.colors ? ColoringBook : TextBook;
  },
})
export abstract class Book {
  @Field(() => ID) id: string;
  @Field() title: string;
}
```

### Interface field resolvers

Interfaces can share *implementation*, not just field declarations. Write a resolver for the interface, and every implementing type inherits it:

```typescript
import { Args, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';

@Resolver(() => Character)
export class CharacterInterfaceResolver {
  @ResolveField(() => [Character])
  friends(
    @Parent() character: Character,
    @Info() { parentType }: { parentType: { name: string } },
    @Args('search', { type: () => String, nullable: true }) searchTerm?: string,
  ) {
    // `parentType.name` tells you which concrete type you were called for —
    // 'Human', 'Droid', … — so one resolver can branch on it.
    return this.charactersService.friendsOf(character.id, searchTerm);
  }
}
```

> **⚠️ Notice** — This requires `inheritResolversFromInterfaces: true` in the module options. Without it the resolver registers against the interface and is never invoked for concrete types — the field returns `null` with no error.

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  inheritResolversFromInterfaces: true,
});
```

### Extending interfaces

Interfaces compose by extension, and the child interface must be declared as implementing the parent:

```typescript
@InterfaceType()
export abstract class Node {
  @Field(() => ID) id: string;
}

@InterfaceType({ implements: () => [Node] })
export abstract class Character extends Node {
  @Field() name: string;
}

@ObjectType({ implements: () => [Character, Node] })
export class Droid extends Character {
  @Field() primaryFunction: string;
}
```

An object type must list **every** interface in its ancestry — GraphQL has no transitive implementation. Listing only `Character` produces a schema-validation error naming `Node`.

Schema first declares interfaces in SDL and needs the same `__resolveType`:

```graphql
interface Character {
  id: ID!
  name: String!
}

type Human implements Character {
  id: ID!
  name: String!
  homePlanet: String!
}
```

```typescript
@Resolver('Character')
export class CharactersResolver {
  @ResolveField()
  __resolveType(value: any) {
    if ('homePlanet' in value) return 'Human';
    if ('primaryFunction' in value) return 'Droid';
    return null;
  }
}
```

**Interface or union?** Interface when the variants share fields the client will select unconditionally (`id`, `name`) — clients can query those without a fragment. Union when the variants have nothing in common, which is the usual case for mutation results and heterogeneous search.

---

## Mapped types

> **⚠️ Notice** — Code first only. There is no code to map in schema first.

CRUD produces families of near-identical input types. `@nestjs/graphql` exports four transforms that derive them from one base.

```typescript title="src/users/dto/create-user.input.ts"
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateUserInput {
  @Field() email: string;
  @Field() password: string;
  @Field() firstName: string;
}
```

**`PartialType`** — every field optional:

```typescript
import { InputType, PartialType } from '@nestjs/graphql';

@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}
// → input UpdateUserInput { email: String, password: String, firstName: String }
```

The optional second argument sets the decorator applied to the derived class. It is needed when the parent is decorated differently — deriving an `@InputType()` from an `@ObjectType()`:

```typescript
@InputType()
export class UpdateUserInput extends PartialType(User, InputType) {}
```

**`PickType`** — keep a subset:

```typescript
import { InputType, PickType } from '@nestjs/graphql';

@InputType()
export class UpdateEmailInput extends PickType(CreateUserInput, ['email'] as const) {}
```

**`OmitType`** — drop a subset:

```typescript
@InputType()
export class UpdateProfileInput extends OmitType(CreateUserInput, ['password'] as const) {}
```

**`IntersectionType`** — merge two types:

```typescript
@ObjectType()
export class AdditionalUserInfo {
  @Field() firstName: string;
  @Field() lastName: string;
}

@InputType()
export class RegisterUserInput extends IntersectionType(
  CreateUserInput,
  AdditionalUserInfo,
) {}
```

They compose:

```typescript
@InputType()
export class UpdateUserInput extends PartialType(
  OmitType(CreateUserInput, ['email'] as const),
) {}
```

The `as const` on key arrays is required for the type-level machinery to narrow to a literal union — without it you get `string[]` and no compile-time checking that the key exists.

**Why this matters beyond keystrokes.** Mapped types carry the `class-validator` decorators too, so `UpdateUserInput` inherits `@MinLength(8)` on `password` and stays correct when the rule changes. And they *fail at compile time* when the base changes: rename `firstName` and every `PickType`/`OmitType` referencing the old key errors immediately. That is the real payoff — the derived types cannot drift.

> **⚠️ Notice** — `@nestjs/swagger` exports functions with identical names ([Chapter 30](../part2-intermediate/30-openapi-advanced.md)). Importing `PartialType` from `@nestjs/swagger` into a GraphQL input type produces a class with *no GraphQL field metadata* — and the failure is `Input Object type UpdateUserInput must define one or more fields`, which points nowhere near the import. In a project serving both REST and GraphQL, check the import first when you see that error.

---

## Common mistakes

1. **A subscription connects but never fires.**
   *Cause:* the payload key does not match the field name — `publish('commentAdded', comment)` instead of `publish('commentAdded', { commentAdded: comment })`.
   *Fix:* wrap the payload in the field name. Log the published object once to confirm its shape.

2. **Subscriptions work locally, silently stop in production.**
   *Cause:* in-memory `PubSub` with more than one replica; the publisher's process has no local subscriber.
   *Fix:* `RedisPubSub` with separate publisher/subscriber connections. Verify by publishing from a pod other than the one holding the socket.

3. **`pubSub.asyncIterator is not a function`.**
   *Cause:* `graphql-subscriptions` v2 renamed it to `asyncIterableIterator`.
   *Fix:* update call sites, or pin the older major deliberately.

4. **GraphiQL cannot run subscriptions.**
   *Cause:* the server is configured with `subscriptions-transport-ws`, which GraphiQL does not speak.
   *Fix:* enable `'graphql-ws': true`.

5. **`Abstract type "ResultUnion" must resolve to an Object type at runtime`.**
   *Cause:* the resolver returned object literals; the default `resolveType` needs class instances.
   *Fix:* hydrate with `plainToInstance`, or supply an explicit `resolveType` keyed on a discriminator field.

6. **A custom scalar rejects inline literals but accepts variables.**
   *Cause:* `parseLiteral` is missing or returns `null` for the relevant `Kind`.
   *Fix:* implement `parseLiteral` for every `Kind` the scalar accepts, and test the inline form explicitly.

7. **An interface field resolver never runs.**
   *Cause:* `inheritResolversFromInterfaces` is not set.
   *Fix:* set it to `true` in the module options.

8. **`Input Object type UpdateUserInput must define one or more fields`.**
   *Cause:* `PartialType` imported from `@nestjs/swagger` instead of `@nestjs/graphql` — or, if the CLI plugin is on, a filename that does not match `typeFileNameSuffix`.
   *Fix:* check the import, then the filename.

9. **An enum appears in code but not in the schema.**
   *Cause:* `registerEnumType` was never executed — the enum file is imported only as a type (`import type`), which the compiler elides.
   *Fix:* keep the registration next to the declaration and import the enum as a value somewhere in the graph.

10. **Every business-rule failure lands in the `errors` array and nothing alerts.**
    *Cause:* throwing exceptions for expected outcomes.
    *Fix:* model client-actionable outcomes as typed payload fields or result unions; reserve throws for bugs, auth, and infrastructure.

11. **A subscription filter runs a database query and the server stalls under load.**
    *Cause:* the filter executes once per subscriber per event.
    *Fix:* make topics granular (`comment:added:${postId}`) so the filter is a cheap comparison or unnecessary.

---

## Putting it together

A comments feature exercising most of this chapter: an interface, an enum, a custom scalar, a mutation with a typed-error payload, and a filtered subscription on a Redis-backed PubSub.

```typescript title="src/feed/models/feed-item.interface.ts"
import { Field, ID, InterfaceType } from '@nestjs/graphql';

@InterfaceType({ description: 'Anything that appears in a post feed' })
export abstract class FeedItem {
  @Field(() => ID) id: string;
  @Field() createdAt: Date;
}
```

```typescript title="src/comments/models/comment.model.ts"
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { FeedItem } from '../../feed/models/feed-item.interface';

export enum CommentState {
  PUBLISHED = 'PUBLISHED',
  FLAGGED = 'FLAGGED',
  HIDDEN = 'HIDDEN',
}
registerEnumType(CommentState, {
  name: 'CommentState',
  description: 'Moderation state of a comment.',
  valuesMap: { HIDDEN: { deprecationReason: 'Use FLAGGED instead.' } },
});

@ObjectType({ implements: () => [FeedItem] })
export class Comment implements FeedItem {
  id: string;
  createdAt: Date;

  @Field() body: string;
  @Field(() => ID) postId: string;
  @Field(() => CommentState) state: CommentState;
}
```

```typescript title="src/comments/dto/add-comment.input.ts"
import { Field, ID, InputType, OmitType, PartialType } from '@nestjs/graphql';
import { MaxLength, MinLength } from 'class-validator';

@InputType()
export class AddCommentInput {
  @Field(() => ID) postId: string;

  @Field()
  @MinLength(1) @MaxLength(2000)
  body: string;
}

// Derived: same validation rules, no postId, everything optional.
@InputType()
export class EditCommentInput extends PartialType(
  OmitType(AddCommentInput, ['postId'] as const),
) {}
```

```typescript title="src/comments/dto/add-comment.payload.ts"
import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Comment } from '../models/comment.model';

export enum AddCommentErrorCode {
  POST_NOT_FOUND = 'POST_NOT_FOUND',
  POST_LOCKED = 'POST_LOCKED',
  RATE_LIMITED = 'RATE_LIMITED',
}
registerEnumType(AddCommentErrorCode, { name: 'AddCommentErrorCode' });

@ObjectType()
export class AddCommentError {
  @Field(() => AddCommentErrorCode) code: AddCommentErrorCode;
  @Field() message: string;
}

@ObjectType()
export class AddCommentPayload {
  @Field(() => Comment, { nullable: true }) comment?: Comment;
  @Field(() => [AddCommentError]) errors: AddCommentError[];
}
```

```typescript title="src/comments/comments.resolver.ts"
import { Inject } from '@nestjs/common';
import { Args, ID, Mutation, Resolver, Subscription } from '@nestjs/graphql';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import { Comment } from './models/comment.model';
import { AddCommentInput } from './dto/add-comment.input';
import { AddCommentError, AddCommentErrorCode, AddCommentPayload } from './dto/add-comment.payload';
import { CommentsService } from './comments.service';

const topicFor = (postId: string) => `comment:added:${postId}`;

@Resolver(() => Comment)
export class CommentsResolver {
  constructor(
    @Inject('PUB_SUB') private readonly pubSub: RedisPubSub,
    private readonly commentsService: CommentsService,
  ) {}

  @Mutation(() => AddCommentPayload)
  async addComment(@Args('input') input: AddCommentInput): Promise<AddCommentPayload> {
    const post = await this.commentsService.findPost(input.postId);

    // Expected outcomes → data, not exceptions.
    const errors: AddCommentError[] = [];
    if (!post) {
      errors.push({ code: AddCommentErrorCode.POST_NOT_FOUND, message: 'No such post.' });
    } else if (post.locked) {
      errors.push({ code: AddCommentErrorCode.POST_LOCKED, message: 'This post is locked.' });
    }
    if (errors.length) return { errors };

    // A failure below this line is genuinely exceptional and throws.
    const comment = await this.commentsService.add(input);

    // Per-post topic: no fan-out to uninterested pods, no per-event filtering.
    await this.pubSub.publish(topicFor(input.postId), { commentAdded: comment });
    return { comment, errors: [] };
  }

  @Subscription(() => Comment, {
    // Belt and braces: the topic is already scoped, but state can change.
    filter: (payload) => payload.commentAdded.state !== 'HIDDEN',
  })
  commentAdded(@Args('postId', { type: () => ID }) postId: string) {
    return this.pubSub.asyncIterableIterator(topicFor(postId));
  }
}
```

The resulting schema:

```graphql
interface FeedItem {
  createdAt: DateTime!
  id: ID!
}

"""Moderation state of a comment."""
enum CommentState {
  FLAGGED
  HIDDEN @deprecated(reason: "Use FLAGGED instead.")
  PUBLISHED
}

type Comment implements FeedItem {
  body: String!
  createdAt: DateTime!
  id: ID!
  postId: ID!
  state: CommentState!
}

input AddCommentInput { body: String!, postId: ID! }
input EditCommentInput { body: String }

type AddCommentError { code: AddCommentErrorCode!, message: String! }
type AddCommentPayload { comment: Comment, errors: [AddCommentError!]! }

type Mutation { addComment(input: AddCommentInput!): AddCommentPayload! }
type Subscription { commentAdded(postId: ID!): Comment! }
```

Every failure mode the client must render is in that document. A generated TypeScript client gets an exhaustive `switch` over `AddCommentErrorCode` for free, and adding a fourth code is a schema change someone reviews.

---

> **핵심 정리**
> - GraphQL 명세가 mutation에 보장하는 것은 **최상위 필드의 직렬 실행** 하나뿐입니다. 나머지("쓰기는 mutation으로")는 관례지만 모든 클라이언트 라이브러리가 의존하는 관례입니다.
> - mutation 반환값은 엔티티가 아니라 **payload 객체**로 감싸십시오. 필드 추가가 비파괴적이 되고, 쓰기가 건드린 모든 객체를 함께 반환해 클라이언트 캐시를 일관되게 유지할 수 있습니다.
> - **예상되는 비즈니스 결과는 데이터로, 진짜 예외는 예외로.** `errors` 배열은 명세상 타입이 없어 클라이언트가 문자열 매칭에 의존하게 만듭니다. 하나의 규약을 정해 스키마 전체에 일관되게 적용하십시오.
> - subscription 페이로드는 **필드 이름을 키로 하는 객체**여야 합니다(`{ commentAdded: comment }`). `resolve`를 쓸 때는 반대로 벗겨진 값을 반환합니다.
> - `graphql-ws`를 쓰십시오. `subscriptions-transport-ws`는 유지보수가 끝났고, GraphiQL과 호환되지 않으며, `onConnect`를 건너뛰는 결함이 있습니다.
> - WebSocket 인증은 `onConnect`에서 **연결당 한 번** 일어납니다. 09시에 검증한 토큰이 17시까지 유효한 소켓을 지배하므로, 만료 처리를 별도로 설계해야 합니다.
> - 기본 `PubSub`은 프로세스 내 `EventEmitter`입니다. 레플리카가 둘이 되는 순간 조용히 깨집니다. Redis 등 외부 브로커로 교체하되, Redis pub/sub은 **fire-and-forget**이고 모든 파드에 브로드캐스트된다는 점을 감안해 토픽을 잘게 나누십시오.
> - 커스텀 스칼라는 `serialize`(출력), `parseValue`(변수 입력), `parseLiteral`(인라인 리터럴) 세 가지를 모두 구현해야 합니다. `parseLiteral`을 빠뜨리면 변수로는 되고 리터럴로는 안 되는 버그가 생깁니다.
> - union과 interface의 기본 `resolveType`은 **클래스 인스턴스**를 요구합니다. ORM이나 캐시가 평범한 객체를 돌려주면 런타임 오류가 납니다. `plainToInstance`로 복원하거나 명시적 `resolveType`을 주십시오.
> - `createUnionType`의 `types` 배열에는 `as const`가 필수이고, 인터페이스는 `abstract class`여야 하며, 객체 타입은 조상 인터페이스를 **전부** 나열해야 합니다.
> - 매핑 타입(`PartialType`/`PickType`/`OmitType`/`IntersectionType`)은 `@nestjs/graphql`에서 가져오십시오. `@nestjs/swagger`에서 가져오면 "must define one or more fields" 오류가 엉뚱한 곳에서 납니다.

> **연습 문제**
> 1. `upvotePost` mutation을 엔티티 반환에서 payload 반환으로 바꾸고, 생성된 SDL diff를 근거로 어떤 변경이 파괴적이고 어떤 변경이 아닌지 설명하십시오.
> 2. 동일한 실패 상황(중복 이메일)을 예외로 던지는 버전과 타입 있는 payload로 반환하는 버전 두 가지로 구현하고, 두 응답의 JSON을 나란히 놓고 클라이언트 코드가 어떻게 달라지는지 서술하십시오.
> 3. `publish('commentAdded', comment)`처럼 페이로드를 감싸지 않고 발행해 보십시오. 오류가 발행 시점이 아니라 어느 시점에 나타납니까? 그 이유는 무엇입니까?
> 4. **직접 만들기:** `graphql-ws`로 subscription을 켜고 `onConnect`에서 JWT를 검증하십시오. 그다음 만료된 토큰으로 연결한 소켓이 만료 이후에도 이벤트를 계속 받는지 확인하고, 이를 막는 방법을 구현하십시오.
> 5. **직접 만들기:** 앱을 두 프로세스로 띄우고(포트만 다르게) 기본 `PubSub`으로 한쪽에서 구독, 다른 쪽에서 mutation을 실행해 이벤트가 사라지는 것을 재현하십시오. `RedisPubSub`으로 교체해 해결하고, `redis-cli MONITOR`로 몇 개의 채널이 관여하는지 관찰하십시오.
> 6. **직접 만들기:** `parseLiteral`을 구현하지 않은 `UUID` 스칼라를 만들고, 변수로 보낼 때와 쿼리에 인라인으로 쓸 때의 차이를 재현한 뒤 고치십시오.
> 7. `Author`와 `Book`으로 union을 만들고 리졸버가 클래스 인스턴스 대신 객체 리터럴을 반환하게 하십시오. 어떤 오류가 나며, `resolveType`을 명시하는 방식과 `plainToInstance`로 복원하는 방식 중 어느 쪽이 더 견고합니까?
> 8. `CreateUserInput`에서 `PartialType(OmitType(...))`으로 `UpdateUserInput`을 파생시킨 뒤 기반 클래스의 필드 이름을 바꿔 보십시오. 컴파일 오류가 어디서 나며, 그것이 왜 이 유틸리티의 진짜 가치인지 설명하십시오.

**Next:** [Chapter 52](./52-graphql-advanced.md) covers everything that surrounds the schema rather than describing it — guards and filters with `GqlExecutionContext`, field middleware and extensions for field-level authorization, custom directives, query complexity limits that keep a public graph from being weaponized, Apollo plugins, and Apollo Federation across multiple Nest services.
