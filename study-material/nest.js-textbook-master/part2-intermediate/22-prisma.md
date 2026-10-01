---
chapter: 22
part: "Part II — Intermediate (중급)"
title: "Prisma: Type-Safe Data Access"
level: intermediate
reading_time: "55 min"
prerequisites: [6, 17]
source_docs:
  - "content/recipes/prisma.md"
source_url: "https://docs.nestjs.com/recipes/prisma"
nest_baseline: "11.x"
---

# Chapter 22 — Prisma: Type-Safe Data Access

> **한눈에 보기**
> 19~21장의 ORM들은 모두 "클래스에 데코레이터를 붙이면 런타임이 그것을 읽어 테이블로
> 매핑한다"는 구조였습니다. Prisma는 방향이 반대입니다. `schema.prisma`라는 **선언 파일이
> 진실의 원천**이고, 거기서 **코드를 생성**합니다. 엔티티 클래스도, 리포지토리도,
> 데코레이터도 없습니다. 이 장은 `prisma init`부터 스키마 문법, 마이그레이션이 만드는
> 실제 SQL, 생성된 클라이언트의 타입, `PrismaService`/`PrismaModule` 배선, CRUD·필터·페이지네이션,
> 중첩 쓰기와 N+1, 트랜잭션 두 형태, 원시 SQL의 안전한 사용법, 시딩, 종료 훅, 테스트 전략까지
> 다루고, 마지막에 19~20장의 ORM들과 정면 비교합니다.

**What you will learn**

- Why Prisma is a *schema compiler* rather than an ORM, and which ORM features it deliberately does not have (no entity classes, no unit of work, no lazy loading, no identity map).
- How to read and write every block of `schema.prisma` — `datasource`, `generator`, `model`, `enum`, attributes, and the relation syntax that trips everyone up.
- What `prisma migrate dev` actually produces, when it re-creates your database, and why `migrate deploy` is the only command allowed near production.
- How to build a `PrismaService extends PrismaClient` that fails at boot instead of on the first request, and a `PrismaModule` other modules can import.
- How to express filtering, sorting, offset pagination and cursor pagination with generated types instead of hand-written DTOs.
- Where Prisma's N+1 behaviour differs from TypeORM's, what `select`/`include` really cost, and when to switch `relationLoadStrategy` to `join`.
- Why `$queryRaw` with a tagged template is safe and `$queryRawUnsafe` with the same-looking string is a SQL injection.
- Which shutdown hook you need on which Prisma major version, and the one that silently stops working.

**Why this matters**

A team migrates a reporting endpoint from TypeORM to Prisma and the p99 drops from 1.9 s to 60 ms. The same team, three weeks later, ships an endpoint that takes 40 seconds because someone wrote `include: { posts: { include: { comments: { include: { author: true } } } } }` and Prisma faithfully issued four queries whose intermediate result sets multiply. Neither number is a property of Prisma. Both are a property of knowing — or not knowing — what the generated client does with the object you hand it.

Prisma is the most polarising data-access tool in the Node ecosystem, and most of the argument is conducted at the wrong level. It is not "an ORM with better types". It is a different architecture: a domain-specific schema language, a code generator, a Rust-or-WASM query engine, and a client whose type signatures are computed from *your* schema rather than from generic `Repository<T>` machinery. That architecture buys you a genuinely different type-safety story — `select: { email: true }` returns a type with exactly one property, not `Partial<User>` — and costs you the escape hatches that ORMs give you for free.

This chapter teaches the mechanism first: what each file is, what each command generates, what the client sends to the database. Then the API. By the end you should be able to answer the only question that matters when you pick a data layer — *what happens when this abstraction does not cover my case?* — for Prisma specifically, and to defend the choice against [Chapter 19](./19-sql-with-typeorm.md)'s TypeORM and [Chapter 20](./20-sequelize-and-mikroorm.md)'s MikroORM.

---

## 1. What Prisma actually is

Every ORM in Chapters 19–21 works the same way at bootstrap: you write TypeScript classes, decorate their properties, and a runtime library reflects over that metadata to build a model of your database. The class is both the compile-time type and the runtime schema.

Prisma inverts this. You write a file in a purpose-built declarative language:

```groovy
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
```

A CLI reads that file and **writes TypeScript source** into your project: model interfaces, argument types for every operation on every model, and a client class whose methods are typed against them. Your application imports the generated code. Nothing is reflected at runtime; there is no metadata registry, no decorator evaluation order to get wrong, no `entities: []` glob that silently misses a file.

That single design decision explains almost everything else about Prisma:

| ORM concept | Prisma equivalent | Why |
|---|---|---|
| Entity class with decorators | `model` block in `schema.prisma` | Schema is data, not code |
| `Repository<User>` | `prisma.user` (a generated property) | Methods are typed per model, not generic |
| Entity instance with methods | Plain object (`{ id, email, name }`) | No prototype, no `save()`, no dirty tracking |
| Unit of Work / `flush()` | Explicit `$transaction` | No implicit write batching |
| Identity map | None | Two fetches of row 7 give two distinct objects |
| Lazy loading (`user.posts` triggers SQL) | Impossible — plain objects | Every query is explicit |
| `QueryBuilder` | Nested plain objects, or `$queryRaw` | No fluent SQL AST |

The absence of lazy loading is the item people underestimate. In TypeORM, `await user.posts` can issue a query from inside a template render. In Prisma, `user.posts` is `undefined` unless you asked for it — which means a whole class of accidental N+1 is impossible, and a whole class of "I forgot to include the relation" `TypeError`s becomes a compile error instead.

The trade-off is honest: the query surface is a fixed vocabulary of JSON-shaped objects. Window functions, recursive CTEs, `DISTINCT ON`, and most vendor-specific SQL are not expressible in it. Prisma's answer is `$queryRaw` (§11), and whether that answer is acceptable is the single most important thing to decide before adopting it.

> **Hint** — Prisma supports PostgreSQL, MySQL, MariaDB, SQL Server, SQLite, CockroachDB and MongoDB. The MongoDB provider maps the same client API onto documents; the schema language gains `@db.ObjectId` and loses relational foreign keys. This chapter uses PostgreSQL, with SQLite notes where setup differs.

---

## 2. Project setup

Install the CLI as a dev dependency and the client as a runtime dependency:

```bash
$ npm install --save-dev prisma
$ npm install @prisma/client
```

Always invoke the CLI through `npx` so the project-local version runs rather than whatever is global:

```bash
$ npx prisma init --datasource-provider postgresql --output ../src/generated/prisma
```

This creates:

```text
prisma/
  schema.prisma      # datasource + generator + your models
prisma.config.ts     # CLI configuration (Prisma 7+)
.env                 # DATABASE_URL
```

Add the generated output directory to `.gitignore` — it is build output, regenerated from the schema, and checking it in creates enormous, meaningless diffs:

```text
/src/generated/prisma
```

### 2.1 The generator block

```groovy
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}
```

Three fields, all of which matter:

- **`provider`** — `prisma-client` is the modern generator (Prisma 6.6+, default in 7). It emits plain TypeScript into a directory you choose. The older `prisma-client-js` generator wrote into `node_modules/.prisma/client`, which meant your database types lived inside a directory nobody version-controls and every `npm ci` had to regenerate them. If you are reading an existing codebase that does `import { PrismaClient } from '@prisma/client'`, it is on the old generator; both are covered below.
- **`output`** — required for `prisma-client`. Put it inside `src/` so `tsc` compiles it and your bundler can see it.
- **`moduleFormat = "cjs"`** — **required for NestJS.** Prisma 7 emits ES modules by default. A stock Nest project compiles to CommonJS, and a CJS `require()` of an ESM package throws `ERR_REQUIRE_ESM` at boot. Setting `cjs` makes the generator emit CommonJS. If you have deliberately moved your Nest app to ESM, drop this line.

### 2.2 The datasource block and driver adapters

```groovy
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`env()` is evaluated by the **Prisma CLI**, not by your application. `prisma migrate` reads `.env` itself. Your Nest application, however, reads environment variables through `ConfigModule` ([Chapter 17](./17-configuration.md)), and if you load `.env` only through `ConfigModule.forRoot()`, the CLI still needs the file to exist on disk. Keep both working:

```typescript title="src/config/configuration.ts"
export default () => ({
  databaseUrl: process.env.DATABASE_URL,
});
```

From Prisma 6.7 onward the client connects through a **driver adapter** — a thin wrapper over a normal Node database driver — rather than through a bundled native binary. Install the adapter for your database:

```bash
$ npm install @prisma/adapter-pg          # PostgreSQL
$ npm install @prisma/adapter-better-sqlite3   # SQLite
$ npm install @prisma/adapter-mariadb     # MySQL / MariaDB
```

This is a real operational improvement: connection pooling, TLS options and socket configuration are now the driver's job, using the same driver the rest of the Node ecosystem uses, and deployment no longer ships a 15 MB platform-specific query-engine binary.

| Database | `provider` | Adapter package | `DATABASE_URL` shape |
|---|---|---|---|
| PostgreSQL | `postgresql` | `@prisma/adapter-pg` | `postgresql://user:pass@host:5432/db?schema=public` |
| MySQL / MariaDB | `mysql` | `@prisma/adapter-mariadb` | `mysql://user:pass@host:3306/db` |
| SQLite | `sqlite` | `@prisma/adapter-better-sqlite3` | `file:./dev.db` |
| SQL Server | `sqlserver` | `@prisma/adapter-mssql` | `sqlserver://host:1433;database=db;user=u;password=p;encrypt=true` |
| MongoDB | `mongodb` | — | `mongodb+srv://user:pass@cluster/db` |

SQLite is a file, so `file:./dev.db` is a path relative to the `prisma/` directory. It is excellent for tutorials and for tests, and it is a trap for development if production is PostgreSQL: SQLite has no `enum`, no native `Json` filtering, no `citext`, and different transaction semantics. Develop against the database you deploy to; Docker Compose costs you six lines.

---

## 3. The schema language

Here is a complete, realistic schema for a blogging domain. Read it once end to end; the sections after it explain each construct.

```groovy title="prisma/schema.prisma"
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

enum Role {
  USER
  EDITOR
  ADMIN
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  profile Profile?
  posts   Post[]

  @@map("users")
}

model Profile {
  id     Int     @id @default(autoincrement())
  bio    String?
  userId Int     @unique
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("profiles")
}

model Post {
  id          Int       @id @default(autoincrement())
  title       String    @db.VarChar(200)
  slug        String    @unique
  content     String?
  published   Boolean   @default(false)
  publishedAt DateTime?
  viewCount   Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  authorId   Int
  author     User            @relation(fields: [authorId], references: [id], onDelete: Cascade)
  categories CategoryOnPost[]

  @@index([authorId, published])
  @@index([publishedAt(sort: Desc)])
  @@map("posts")
}

model Category {
  id    Int              @id @default(autoincrement())
  name  String           @unique
  posts CategoryOnPost[]

  @@map("categories")
}

model CategoryOnPost {
  postId     Int
  categoryId Int
  assignedAt DateTime @default(now())

  post     Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([postId, categoryId])
  @@map("categories_on_posts")
}
```

### 3.1 Field attributes

Attributes prefixed with one `@` apply to a field; `@@` applies to the model.

| Attribute | Meaning |
|---|---|
| `@id` | Primary key. `@@id([a, b])` for a composite key. |
| `@unique` | Unique constraint. `@@unique([a, b])` for a composite. |
| `@default(autoincrement())` | Database-side sequence / identity column. |
| `@default(uuid())` / `@default(cuid())` | Generated **by Prisma**, client-side, at insert time. |
| `@default(now())` | `DEFAULT CURRENT_TIMESTAMP`. |
| `@updatedAt` | Prisma sets this field on every `update`. Not a database trigger — a raw `UPDATE` bypasses it. |
| `@map("column_name")` | Field is called this in the database, that in your code. |
| `@@map("table_name")` | Same, for the table. |
| `@db.VarChar(200)` | Native database type. Without it, `String` becomes `TEXT` on PostgreSQL. |
| `@@index([a, b])` | Non-unique index. Add these deliberately; Prisma creates none for you except on relation scalars in some providers. |
| `@ignore` | Field exists in the database but is excluded from the client. |

`?` marks a field nullable; `[]` marks a list. `String?` is `string | null` in the generated type — not `string | undefined`, which matters when you write conditionals.

### 3.2 Relations

The relation syntax is where every newcomer stalls, because a one-to-many relation requires **three** things spread across two models:

1. A scalar field holding the foreign key: `authorId Int`.
2. A relation field with `@relation(fields: [...], references: [...])` on the side that *owns* the foreign key: `author User @relation(fields: [authorId], references: [id])`.
3. A back-relation list on the other side: `posts Post[]`.

Omit any one of them and `prisma validate` fails with a message telling you exactly what is missing. That is the point: the schema is checked before any SQL exists.

- **One-to-one** — `profile Profile?` on `User`, and on `Profile` the FK field plus `@unique` on it. The `@unique` is what makes it one-to-one rather than one-to-many.
- **One-to-many** — as in `Post.author` / `User.posts` above.
- **Many-to-many, explicit** — the `CategoryOnPost` join model. Use this whenever the relationship carries data (`assignedAt`) or you want to control the join table's name and indexes. This is the form to prefer in production.
- **Many-to-many, implicit** — write `categories Category[]` on `Post` and `posts Post[]` on `Category`, with no join model. Prisma creates and manages a hidden `_CategoryToPost` table. Convenient, but you cannot add columns to it, query it directly, or name it, and migrating away later is painful.

`onDelete` and `onUpdate` map to SQL referential actions: `Cascade`, `Restrict`, `SetNull`, `NoAction`, `SetDefault`. `SetNull` requires the FK field to be optional. If you omit `onDelete`, Prisma defaults to `SetNull` for optional relations and `Restrict` for required ones — and `Restrict` means a delete that violates it throws `P2003` rather than silently orphaning rows, which is usually what you want.

### 3.3 Self-relations and multiple relations between the same models

Two relations between the same pair of models need names to disambiguate:

```groovy
model User {
  id            Int    @id @default(autoincrement())
  writtenPosts  Post[] @relation("author")
  reviewedPosts Post[] @relation("reviewer")
}

model Post {
  id         Int   @id @default(autoincrement())
  authorId   Int
  author     User  @relation("author", fields: [authorId], references: [id])
  reviewerId Int?
  reviewer   User? @relation("reviewer", fields: [reviewerId], references: [id])
}
```

---

## 4. Prisma Migrate: from schema to SQL

The workflow has four steps, and running them out of order is the most common source of "it works on my machine".

```mermaid
flowchart LR
  A["schema.prisma<br/>(source of truth)"] -->|"prisma migrate dev"| B["migrations/<br/>20260827_init/<br/>migration.sql"]
  B -->|applied| C[("Database")]
  A -->|"prisma generate<br/>(implicit after migrate dev)"| D["src/generated/prisma<br/>types + client"]
  D --> E["PrismaService<br/>extends PrismaClient"]
  E --> F["Nest providers<br/>UsersService, PostsService"]
  C -.->|"prisma db pull<br/>(introspection)"| A
  B -->|"prisma migrate deploy"| G[("Staging / Production")]
  style A fill:#1e3a5f,color:#fff
  style D fill:#1e5f3a,color:#fff
  style C fill:#5f1e3a,color:#fff
  style G fill:#5f1e3a,color:#fff
```

### 4.1 `migrate dev`

```bash
$ npx prisma migrate dev --name init
```

For each invocation Prisma:

1. Compares your schema against the migration history to compute a diff.
2. Writes a timestamped SQL file under `prisma/migrations/`.
3. Applies it to the development database.
4. Runs `prisma generate`, so your TypeScript types are updated in the same breath.
5. Runs the seed script, if the database was reset.

```text
prisma
├── migrations
│   └── 20260827100915_init
│       └── migration.sql
└── schema.prisma
```

The SQL generated for the schema in §3 (PostgreSQL) begins:

```sql
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'EDITOR', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" INTEGER NOT NULL,
    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "posts_authorId_published_idx" ON "posts"("authorId", "published");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

Read that output. It is the whole argument for Migrate over `synchronize: true`: the change is a reviewable artefact in your repository, generated once and applied identically everywhere. Notice `updatedAt` has **no** database default — Prisma sets it from the client, so a hand-written `UPDATE posts SET title = ...` will not touch it.

**These files are editable.** Generate the migration, then add what the schema language cannot express — a partial index, a `CHECK` constraint, a trigger, a data backfill — before applying it. Use `--create-only` to stop after step 2:

```bash
$ npx prisma migrate dev --name add_slug --create-only
# edit prisma/migrations/.../migration.sql
$ npx prisma migrate dev
```

### 4.2 The shadow database

To compute a diff, `migrate dev` needs to know what the schema *should* look like after replaying every existing migration. It finds out by creating a temporary **shadow database**, replaying the history into it, and comparing. This means the development database user needs `CREATEDB` permission, and it means `migrate dev` is destructive-capable — it will offer to reset your database if it detects drift.

**Drift** is when the database no longer matches the migration history: someone ran an `ALTER TABLE` by hand, or checked out a branch with a migration that was later deleted. `migrate dev` responds by proposing a reset, which drops everything. That is correct behaviour in development and catastrophic anywhere else.

### 4.3 The other commands

| Command | Use | Destructive? |
|---|---|---|
| `prisma migrate dev` | Development only. Diff, write, apply, generate, seed. | Can reset |
| `prisma migrate deploy` | **Staging and production.** Applies pending migrations. Never generates, never resets, never prompts. | No |
| `prisma migrate reset` | Drop, recreate, replay all migrations, seed. | Yes |
| `prisma migrate status` | What is applied, what is pending, is there drift. | No |
| `prisma migrate resolve --applied <name>` | Mark a migration as applied without running it (after a manual hotfix). | No |
| `prisma db push` | Push schema straight to the database, no migration file. Prototyping only. | Can drop columns |
| `prisma db pull` | Introspect an existing database into `schema.prisma`. | No |
| `prisma generate` | Regenerate the client from the schema. | No |
| `prisma studio` | Local GUI browser for your data. | Manual edits |

The rule: `migrate dev` on a laptop, `migrate deploy` in CI/CD, and nothing else touches a shared database. Put `prisma migrate deploy` in your release pipeline as a step *before* the new application version starts, never in `onModuleInit` — two pods starting simultaneously would race on the migration lock.

Add `prisma generate` to `postinstall` so a fresh clone or a Docker build cannot compile against stale types:

```json title="package.json"
{
  "scripts": {
    "postinstall": "prisma generate",
    "build": "prisma generate && nest build",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio"
  }
}
```

---

## 5. The generated client and what "type-safe" means here

Open `src/generated/prisma` after a `generate`. You will find, among much else:

- A model type per model: `User`, `Post`, `Profile` — plain interfaces of scalar fields only. `User` has no `posts` property, because a `User` fetched without `include` has no posts.
- A `Prisma` namespace holding an argument type for every operation on every model: `Prisma.UserWhereInput`, `Prisma.UserWhereUniqueInput`, `Prisma.UserCreateInput`, `Prisma.UserUpdateInput`, `Prisma.UserOrderByWithRelationInput`, `Prisma.UserSelect`, `Prisma.UserInclude`, and so on.
- The `PrismaClient` class with one property per model.

These generated argument types are the reason your services need almost no hand-written DTOs for the persistence layer:

```typescript
async users(params: {
  skip?: number;
  take?: number;
  cursor?: Prisma.UserWhereUniqueInput;
  where?: Prisma.UserWhereInput;
  orderBy?: Prisma.UserOrderByWithRelationInput;
}): Promise<User[]> {
  return this.prisma.user.findMany(params);
}
```

`Prisma.UserWhereInput` knows that `email` accepts `string | Prisma.StringFilter`, that `role` accepts only the three enum members, and that `posts` accepts `{ some: ... } | { every: ... } | { none: ... }`. Misspell a field and it is a compile error.

### 5.1 Result types are computed from the query

This is the part that no reflection-based ORM can do. The return type of a query depends on the *shape of the object you passed in*:

```typescript
// Type: User  → { id, email, name, role, createdAt, updatedAt }
const a = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });

// Type: { email: string; name: string | null }  — exactly two properties
const b = await prisma.user.findUniqueOrThrow({
  where: { id: 1 },
  select: { email: true, name: true },
});

// Type: User & { posts: Post[] }
const c = await prisma.user.findUniqueOrThrow({
  where: { id: 1 },
  include: { posts: true },
});

b.role;  // ❌ Property 'role' does not exist on type '{ email: string; name: string | null; }'
c.posts; // ✅ Post[]
```

Compare with TypeORM, where `find({ select: ['email'] })` returns `User[]` and `user.role` compiles fine and is `undefined` at runtime. That difference — a compile error versus a production `undefined` — is Prisma's central value proposition.

### 5.2 Naming a computed result type

Once a service returns a partially-selected result, you need a name for its type. Do not hand-write an interface that will drift; derive it:

```typescript
import { Prisma } from '../generated/prisma';

const userWithPosts = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { posts: { select: { id: true, title: true } } },
});

export type UserWithPosts = Prisma.UserGetPayload<typeof userWithPosts>;

// Reuse the same object as the query argument — one definition, two uses.
async function load(prisma: PrismaClient, id: number): Promise<UserWithPosts> {
  return prisma.user.findUniqueOrThrow({ where: { id }, ...userWithPosts });
}
```

`Prisma.validator` type-checks the literal at the point of definition rather than at the call site, so a typo is reported where you wrote it. `<Model>GetPayload<T>` computes the result type for those arguments.

---

## 6. `PrismaService` and `PrismaModule`

Prisma's client is a class. Nest's unit of composition is a provider. The join is one line of inheritance.

```typescript title="src/prisma/prisma.service.ts"
import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.get<number>('DATABASE_POOL_SIZE', 10),
    });

    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }
}
```

Three decisions in that file:

**Why extend rather than inject a client instance?** Extending gives every consumer the full client API with no delegation layer. The alternative — `{ provide: PRISMA, useFactory: () => new PrismaClient() }` — works and is marginally more testable, but you lose the ergonomics of `this.prisma.user.findMany()` and gain nothing you cannot get by overriding the provider in tests (§13).

**Why `onModuleInit` with `$connect()`?** Prisma connects lazily on the first query. Without the explicit connect, a wrong `DATABASE_URL` produces a healthy-looking process that 500s on the first request — and a Kubernetes readiness probe hitting a static route would report the pod ready. Calling `$connect()` in `onModuleInit` moves the failure to boot, where an orchestrator will refuse to roll out the deployment. Do this.

**Why `ConfigService` rather than `process.env`?** [Chapter 17](./17-configuration.md): `getOrThrow` fails loudly at construction when the variable is missing, and tests can supply a different URL without touching the environment.

> **⚠️ Notice** — If you are on the legacy `prisma-client-js` generator, the import is `import { PrismaClient } from '@prisma/client'` and there is no adapter: `super({ log: [...] })` and the URL comes from the `datasource` block. Everything else in this chapter is identical.

### 6.1 The module

```typescript title="src/prisma/prisma.module.ts"
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`@Global()` is a genuine judgment call ([Chapter 6](../part1-beginner/06-modules.md)). The database is a true cross-cutting singleton, and importing `PrismaModule` into every feature module is noise. Against that: a global provider hides the dependency, so a module that ought to be pure suddenly is not, and nothing stops a controller from injecting `PrismaService` directly and bypassing your service layer. My recommendation is `@Global()` for `PrismaService` and nothing else, plus a lint rule forbidding `PrismaService` in controllers.

### 6.2 Query logging

The `log: [{ emit: 'event', level: 'query' }]` above turns queries into events you can route through Nest's logger ([Chapter 18](./18-logging.md)) instead of raw stdout:

```typescript
async onModuleInit() {
  if (process.env.NODE_ENV !== 'production') {
    // The event payload carries `query`, `params` and `duration` (ms).
    (this as any).$on('query', (e: { query: string; duration: number }) => {
      if (e.duration > 100) {
        this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
      }
    });
  }
  await this.$connect();
}
```

Logging *every* query in production is a mistake — it doubles your log volume and `params` can contain personal data. Log the slow ones.

---

## 7. CRUD

Services wrap the client. The pattern from the official recipe is a good starting point: accept generated argument types, return model types.

```typescript title="src/users/users.service.ts"
import { Injectable } from '@nestjs/common';
import { Prisma, User } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findOne(where: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.prisma.user.findUnique({ where });
  }

  findMany(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    return this.prisma.user.findMany(params);
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  update(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    return this.prisma.user.update(params);
  }

  remove(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.prisma.user.delete({ where });
  }
}
```

The full operation set:

| Method | Returns | Notes |
|---|---|---|
| `findUnique({ where })` | `T \| null` | `where` must be a unique field or composite unique |
| `findUniqueOrThrow({ where })` | `T` | Throws `P2025` when absent — usually what a controller wants |
| `findFirst({ where, orderBy })` | `T \| null` | Any filter; returns the first match |
| `findFirstOrThrow({ ... })` | `T` | |
| `findMany({ ... })` | `T[]` | Empty array when nothing matches, never `null` |
| `create({ data })` | `T` | |
| `createMany({ data, skipDuplicates })` | `{ count }` | One `INSERT`; **returns no rows** |
| `createManyAndReturn({ data })` | `T[]` | Postgres/SQLite only |
| `update({ where, data })` | `T` | Throws `P2025` when the row does not exist |
| `updateMany({ where, data })` | `{ count }` | Non-unique filter; no throw when count is 0 |
| `delete({ where })` | `T` | Returns the deleted row |
| `deleteMany({ where })` | `{ count }` | `deleteMany({})` empties the table — no confirmation |
| `upsert({ where, create, update })` | `T` | |
| `count({ where })` | `number` | |
| `aggregate({ _sum, _avg, _min, _max, _count })` | object | |
| `groupBy({ by, where, having })` | rows | `by` is required |

Three of these deserve a warning.

**`update` throws when the row is missing.** `P2025` is `PrismaClientKnownRequestError`, not `NotFoundException`, so unhandled it becomes a 500. Map it (§12.2) or check first.

**`createMany` returns a count, not rows.** Code written against `create` and mechanically converted to `createMany` will find `result.id` is `undefined`. Use `createManyAndReturn` when you need the ids and your database supports it.

**`deleteMany` with an empty or accidentally-undefined `where` deletes everything.** `where: { id: someUndefinedVariable }` becomes `where: { id: undefined }`, which Prisma treats as "no filter on id". This is the single most dangerous ergonomic in the API. Guard it:

```typescript
async removeAllByAuthor(authorId: number | undefined) {
  if (authorId === undefined) {
    throw new Error('authorId is required'); // never let undefined reach `where`
  }
  return this.prisma.post.deleteMany({ where: { authorId } });
}
```

`upsert` is worth showing in full because its three-part shape confuses people:

```typescript
await this.prisma.user.upsert({
  where: { email: 'ada@example.com' },   // must be unique
  create: { email: 'ada@example.com', name: 'Ada' },  // used if not found
  update: { name: 'Ada Lovelace' },                    // used if found
});
```

Under concurrency, `upsert` on PostgreSQL compiles to `INSERT ... ON CONFLICT DO UPDATE` for simple cases and is atomic; for cases it cannot compile that way it becomes a read-then-write and two simultaneous callers can both take the `create` branch, one of which fails with `P2002`. Retry once on `P2002` if the path is hot.

---

## 8. Filtering, sorting, and pagination

### 8.1 Filters

`where` is a nested object built from field names and operator objects:

```typescript
const posts = await this.prisma.post.findMany({
  where: {
    published: true,
    viewCount: { gte: 100 },
    publishedAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
    title: { contains: 'nest', mode: 'insensitive' },  // PostgreSQL: ILIKE
    slug: { startsWith: 'how-to-' },
    authorId: { in: [1, 2, 3] },
    NOT: { content: null },
    OR: [
      { categories: { some: { category: { name: 'Backend' } } } },
      { author: { role: 'ADMIN' } },
    ],
  },
});
```

| Operator group | Members |
|---|---|
| Comparison | `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte` |
| String | `contains`, `startsWith`, `endsWith`, `mode: 'insensitive'`, `search` |
| List (scalar arrays) | `has`, `hasEvery`, `hasSome`, `isEmpty` |
| Relation (to-many) | `some`, `every`, `none` |
| Relation (to-one) | `is`, `isNot` |
| Combinators | `AND`, `OR`, `NOT` |

`mode: 'insensitive'` is PostgreSQL and MongoDB only, and on PostgreSQL it produces `ILIKE`, which does **not** use a plain B-tree index. If case-insensitive search is a hot path, add a functional index by hand in a `--create-only` migration.

Relation filters are the feature that most justifies the query builder: `{ categories: { some: { category: { name: 'Backend' } } } }` compiles to a correlated `EXISTS` subquery, not a join that duplicates rows. `every` is subtle — it is vacuously true for parents with no related rows, which is nearly always a bug in a `hasAll`-style filter. Pair it with `some: {}` when you mean "has at least one, and all of them match".

Building a filter from optional query parameters needs care because of the `undefined` semantics:

```typescript
buildWhere(q: ListPostsQuery): Prisma.PostWhereInput {
  return {
    // `undefined` means "no constraint" — this is intentional and safe for reads.
    published: q.published,
    authorId: q.authorId,
    title: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
  };
}
```

Safe for `findMany`. Never reuse the same helper for `deleteMany`.

### 8.2 Sorting

```typescript
orderBy: [
  { published: 'desc' },
  { publishedAt: { sort: 'desc', nulls: 'last' } },  // PostgreSQL
  { author: { name: 'asc' } },                        // sort by a relation field
  { categories: { _count: 'desc' } },                 // sort by relation count
]
```

An array preserves order of precedence; a single object is shorthand for one key. Sorting by a relation field forces a join, so index the joined column.

### 8.3 Offset pagination

```typescript
const [items, total] = await this.prisma.$transaction([
  this.prisma.post.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * size, take: size }),
  this.prisma.post.count({ where }),
]);
return { items, total, page, pages: Math.ceil(total / size) };
```

The two queries go in one `$transaction` so the count matches the page under concurrent writes. `skip` compiles to SQL `OFFSET`, which the database implements by generating and discarding rows: `skip: 100000` is genuinely slow and gets slower as the table grows. Offset pagination is right for admin tables with page numbers and wrong for infinite scroll.

### 8.4 Cursor pagination

```typescript
async page(cursorId: number | undefined, size = 20) {
  const rows = await this.prisma.post.findMany({
    take: size + 1,                                   // fetch one extra to detect "more"
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    orderBy: { id: 'desc' },
    where: { published: true },
  });

  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
```

Three rules that are easy to get wrong:

1. **`cursor` must be a unique field**, and it must be the field you order by (or the tiebreaker of it). Ordering by `createdAt` with a `cursor: { id }` produces silently wrong pages when two rows share a timestamp; order by `[{ createdAt: 'desc' }, { id: 'desc' }]` and carry both values.
2. **`skip: 1` is required** with a cursor, otherwise the cursor row itself is repeated as the first item of every page.
3. `take: size + 1` is the cheapest way to know whether a next page exists without a second `count`.

Cursor pagination compiles to `WHERE id < $cursor ORDER BY id DESC LIMIT n`, which is an index seek at any depth. Use it for feeds, exports, and any list a client scrolls.

---

## 9. Relations, nested writes, and N+1

### 9.1 Nested writes

A single `create` can write across several tables in one implicit transaction:

```typescript
await this.prisma.user.create({
  data: {
    email: 'ada@example.com',
    name: 'Ada',
    profile: { create: { bio: 'Analytical engine enthusiast' } },
    posts: {
      create: [
        {
          title: 'On the Analytical Engine',
          slug: 'on-the-analytical-engine',
          categories: {
            create: [{ category: { connectOrCreate: {
              where: { name: 'History' },
              create: { name: 'History' },
            } } }],
          },
        },
      ],
    },
  },
  include: { profile: true, posts: true },
});
```

Every nested write in one `create` or `update` call runs inside a single transaction that Prisma opens for you. If the post insert fails, the user is not created.

The nested operations available inside `data`:

| Operation | Available on | Meaning |
|---|---|---|
| `create` | both | Insert a new related row |
| `createMany` | to-many | Insert several (no nested relations) |
| `connect` | both | Link an existing row by unique field |
| `connectOrCreate` | both | Link if it exists, insert if not |
| `disconnect` | optional relations | Null the foreign key |
| `set` | to-many | Replace the whole set of links |
| `update` / `updateMany` | both | Modify related rows |
| `upsert` | both | |
| `delete` / `deleteMany` | both | Delete related rows |

The recipe's "create a draft for an author identified by email" is `connect` doing the work of a lookup:

```typescript
create(dto: CreateDraftDto): Promise<Post> {
  return this.prisma.post.create({
    data: {
      title: dto.title,
      slug: slugify(dto.title),
      content: dto.content,
      author: { connect: { email: dto.authorEmail } },  // no separate SELECT in your code
    },
  });
}
```

If no user has that email, Prisma throws `P2025` — a required relation could not be connected. That is a 404 or 422, not a 500; map it.

`set: []` on a to-many relation clears every link. `set` is the right operation for "the client sent the complete new list of categories"; `connect`/`disconnect` are right for incremental changes. Confusing them silently discards data.

### 9.2 `select` versus `include`

- **`include`** — all scalar fields of the model, *plus* the named relations.
- **`select`** — only what you name. Nothing else. You cannot use both at the top level of the same query (you can nest a `select` inside an `include`).

```typescript
// include: full Post + author
const a = await prisma.post.findMany({ include: { author: true } });

// select: three columns, and two columns of the author
const b = await prisma.post.findMany({
  select: {
    id: true,
    title: true,
    author: { select: { id: true, name: true } },
  },
});
```

Prefer `select` in anything that leaves the process. It narrows the type (so an accidental `post.content` in a serializer is a compile error), narrows the SQL (so a 40 KB `content` column is not read to render a list of titles), and makes it structurally impossible to leak a `passwordHash` you forgot about. `include` is for internal code that genuinely needs the whole row.

`_count` is available in both:

```typescript
const authors = await prisma.user.findMany({
  select: { id: true, name: true, _count: { select: { posts: true } } },
});
// authors[0]._count.posts  → number
```

### 9.3 The N+1 story

Prisma's default relation loading is **not** a join and **not** an N+1. For `findMany({ include: { author: true } })` over 50 posts it issues exactly two queries:

```sql
SELECT id, title, "authorId", ... FROM posts WHERE published = true;
SELECT id, email, name, ... FROM users WHERE id IN ($1, $2, ... );
```

One query per relation *level*, not per parent row. Prisma then stitches the results in memory. So three levels of nesting is three queries — but the *rows* multiply: `include: { posts: { include: { comments: true } } }` over 100 users with 50 posts each with 30 comments each fetches 150,000 comment rows into Node's heap. The query count is fine; the memory is not. This is the failure mode from the chapter opening.

Two ways to get an N+1 anyway:

```typescript
// ❌ Real N+1: one query per iteration.
for (const post of posts) {
  post.author = await prisma.user.findUnique({ where: { id: post.authorId } });
}

// ✅ One extra query.
const posts = await prisma.post.findMany({ include: { author: true } });
```

The loop version is what an ORM's lazy loading does invisibly; in Prisma you have to write it deliberately, which is the point.

Prisma does have a batching layer for one specific case: concurrent `findUnique` calls on the same model within the same tick are coalesced into a single `IN` query, which is what makes Prisma usable as a GraphQL resolver backend without a separate DataLoader.

**`relationLoadStrategy`.** On PostgreSQL you can ask Prisma to use a single query with `LATERAL` joins instead:

```typescript
const posts = await prisma.post.findMany({
  relationLoadStrategy: 'join',   // default is 'query'
  include: { author: true, categories: { include: { category: true } } },
});
```

One round trip instead of three. Faster when latency to the database dominates (serverless, cross-AZ); slower when the join duplicates a wide parent row across many children. Measure both on a realistic dataset — this is a per-query decision, not a global one.

---

## 10. Transactions

Prisma offers two forms, and choosing between them is a real decision.

### 10.1 The array form (sequential operations)

```typescript
const [user, postCount] = await this.prisma.$transaction([
  this.prisma.user.create({ data: { email, name } }),
  this.prisma.post.count({ where: { published: true } }),
]);
```

You pass an array of **unawaited** query promises. Prisma sends `BEGIN`, runs them in order, sends `COMMIT`; any failure rolls the whole thing back. The result array is typed positionally — `user` is `User`, `postCount` is `number`.

The constraint that defines this form: **the queries cannot depend on each other**, because they are all constructed before any runs. Use it for "several independent writes that must all land", and for the `findMany` + `count` pagination pair in §8.3.

> **⚠️ Notice** — `this.prisma.user.create({...})` without `await` is a thenable, not a plain promise, and it does not execute until `$transaction` (or an `await`) drives it. Accidentally awaiting one inside the array literal runs it *outside* the transaction.

### 10.2 The interactive form

```typescript
async transferOwnership(postId: number, newAuthorId: number) {
  return this.prisma.$transaction(
    async (tx) => {
      const post = await tx.post.findUniqueOrThrow({ where: { id: postId } });

      if (post.authorId === newAuthorId) {
        throw new BadRequestException('Already the author');  // rolls back
      }

      await tx.user.update({
        where: { id: post.authorId },
        data: { /* decrement a denormalised counter, etc. */ },
      });

      return tx.post.update({
        where: { id: postId },
        data: { authorId: newAuthorId },
      });
    },
    {
      maxWait: 5000,   // ms to wait for a connection from the pool
      timeout: 10000,  // ms the transaction may run before automatic rollback
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
```

The callback receives `tx`, a client restricted to the transaction's connection. **Every query inside must use `tx`.** Using `this.prisma` inside the callback runs on a *different* connection, outside the transaction — it will not be rolled back, and if it waits on a row the transaction holds, you have deadlocked yourself against your own code. This is the number-one Prisma transaction bug and it is invisible in review unless you are looking for it.

Isolation levels are `ReadUncommitted`, `ReadCommitted` (PostgreSQL default), `RepeatableRead`, `Serializable`. Under `Serializable`, PostgreSQL can abort a transaction with a serialization failure (`40001`) that is *expected* and must be retried; write the retry loop or do not choose the level.

The `timeout` default is 5 seconds and it exists for a reason. Never do this:

```typescript
// ❌ Holds a database connection and row locks across a network call.
await this.prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data });
  await this.paymentGateway.charge(order);   // 800ms, sometimes 30s
  await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
});
```

Under load this exhausts the connection pool: every request holds a connection while waiting on a third party. Write the row, commit, call the gateway, then write the result — and reconcile failures with a background job ([Chapter 35](./35-queues.md)).

### 10.3 Nested writes are already transactional

You do not need `$transaction` around a single `create` with nested writes (§9.1) — Prisma wraps it. Wrapping it again is harmless but signals a misunderstanding to the next reader.

---

## 11. Raw SQL

When the query vocabulary runs out — window functions, recursive CTEs, `DISTINCT ON`, full-text ranking, a `MERGE` — drop to SQL.

```typescript
type TopAuthor = { id: number; name: string | null; post_count: bigint };

async topAuthors(minPosts: number, since: Date): Promise<TopAuthor[]> {
  return this.prisma.$queryRaw<TopAuthor[]>`
    SELECT u.id, u.name, COUNT(p.id) AS post_count
    FROM users u
    JOIN posts p ON p."authorId" = u.id
    WHERE p."publishedAt" >= ${since}
    GROUP BY u.id, u.name
    HAVING COUNT(p.id) >= ${minPosts}
    ORDER BY post_count DESC
  `;
}
```

### 11.1 Why the tagged template is safe

`$queryRaw` is a **tagged template function**, not a function taking a string. JavaScript hands it the static string fragments and the interpolated values as two separate arrays. Prisma sends the fragments — joined with `$1`, `$2` placeholders — as the SQL, and the values as bind parameters. The database parses the query before it ever sees your data, so a value containing `'; DROP TABLE users; --` is compared as a literal string. It is *structurally* impossible to inject through `${}` here.

```typescript
// Safe. `email` is bound as a parameter.
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;

// ❌ Catastrophic. String concatenation, then a function call.
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);
```

The second line is a textbook SQL injection. The two look almost identical in a diff — one has parentheses — which is exactly why `$queryRawUnsafe` should be banned by lint rule and permitted only where the *identifier* (a table or column name) is dynamic, with an allow-list:

```typescript
const SORTABLE = { title: 'title', views: '"viewCount"' } as const;

async sorted(column: keyof typeof SORTABLE, limit: number) {
  const col = SORTABLE[column];               // never the raw input
  if (!col) throw new BadRequestException('Invalid sort column');
  return this.prisma.$queryRawUnsafe(
    `SELECT id, title FROM posts ORDER BY ${col} DESC LIMIT $1`,
    limit,                                     // values still parameterised
  );
}
```

### 11.2 Composing fragments

For conditional SQL, build with `Prisma.sql` rather than string concatenation:

```typescript
import { Prisma } from '../generated/prisma';

const conditions: Prisma.Sql[] = [Prisma.sql`p.published = true`];
if (authorId) conditions.push(Prisma.sql`p."authorId" = ${authorId}`);

const rows = await this.prisma.$queryRaw`
  SELECT p.id, p.title FROM posts p
  WHERE ${Prisma.join(conditions, ' AND ')}
`;
```

`Prisma.join`, `Prisma.empty` and `Prisma.raw` (for trusted identifiers only) are the composition primitives.

### 11.3 The four raw methods, and what raw costs you

| Method | Input | Returns |
|---|---|---|
| `$queryRaw` | Tagged template | Rows |
| `$queryRawUnsafe` | String + params | Rows |
| `$executeRaw` | Tagged template | Affected row count |
| `$executeRawUnsafe` | String + params | Affected row count |

Two things you lose. **Types are a lie you tell the compiler**: the `<TopAuthor[]>` above is an unchecked assertion — change the `SELECT` list and nothing complains. Validate with Zod at the boundary if the result crosses a module. **Mapping is off**: `@@map("users")` means the raw SQL must say `users`, not `User`, and `@map`ed columns keep their database names. Raw queries do not participate in your schema's renaming, so a future `@@map` change breaks them silently.

Also: PostgreSQL `COUNT()` returns `bigint`, which Prisma surfaces as a JavaScript `BigInt`, and `JSON.stringify` throws on `BigInt`. Cast in SQL (`COUNT(*)::int`) or convert before returning.

Raw queries **do** run inside `$transaction` — `tx.$queryRaw` uses the transaction's connection.

---

## 12. Seeding, error mapping, and shutdown

### 12.1 Seeding

A seed script is ordinary TypeScript that instantiates a client:

```typescript title="prisma/seed.ts"
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // Idempotent: safe to run repeatedly.
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
      posts: {
        create: [{ title: 'Welcome', slug: 'welcome', published: true, publishedAt: new Date() }],
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Register it so `prisma migrate reset` and `migrate dev` run it automatically. On Prisma 7 that goes in `prisma.config.ts`; on 5/6 it goes in `package.json`:

```typescript title="prisma.config.ts"
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx prisma/seed.ts' },
});
```

```json title="package.json (Prisma 5/6)"
{
  "prisma": { "seed": "ts-node prisma/seed.ts" }
}
```

Make seeds **idempotent** (`upsert`, not `create`) and keep them to reference data plus a handful of development fixtures. Test fixtures belong in tests, where each test controls its own data.

### 12.2 Mapping Prisma errors to HTTP

Left alone, a duplicate email produces a 500 and a stack trace mentioning `users_email_key`. Map the known errors once, globally ([Chapter 9](../part1-beginner/09-exception-filters.md)):

```typescript title="src/prisma/prisma-exception.filter.ts"
import { ArgumentsHost, Catch, ConflictException, ExceptionFilter,
         HttpException, NotFoundException, BadRequestException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = this.map(exception);
    super.catch(mapped ?? exception, host);
  }

  private map(e: Prisma.PrismaClientKnownRequestError): HttpException | undefined {
    switch (e.code) {
      case 'P2002': {
        const fields = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return new ConflictException(`A record with this ${fields} already exists`);
      }
      case 'P2025':
        return new NotFoundException('Record not found');
      case 'P2003':
        return new BadRequestException('Related record does not exist');
      case 'P2000':
        return new BadRequestException('Value too long for column');
      default:
        return undefined; // unknown code → 500, and it should be
    }
  }
}
```

Note what the filter does **not** do: it never echoes `e.message`, which contains column names and sometimes values. Register it with `{ provide: APP_FILTER, useClass: PrismaExceptionFilter }`.

The error classes: `PrismaClientKnownRequestError` (has a `code`), `PrismaClientValidationError` (your arguments were malformed — a bug, not a user error), `PrismaClientInitializationError` (could not connect), `PrismaClientRustPanicError` (engine crash, restart required).

### 12.3 Shutdown hooks — and the caveat

Nest calls `onModuleDestroy` on shutdown, so disconnecting is straightforward:

```typescript
async onModuleDestroy() {
  await this.$disconnect();
}
```

The caveat is a real trap, and its shape depends on your Prisma major version.

**Prisma 4 and earlier** exposed an event: `this.$on('beforeExit', ...)`. Its purpose was to let you call `app.close()` so that Nest's `onModuleDestroy`/`beforeApplicationShutdown` hooks ran — because Prisma's own signal handlers called `process.exit()` and Nest never got a chance:

```typescript
// Prisma <= 4 ONLY. Removed in Prisma 5+.
async enableShutdownHooks(app: INestApplication) {
  this.$on('beforeExit', async () => {
    await app.close();
  });
}
```

**Prisma 5 and later removed `beforeExit` for the library engine** and no longer install signal handlers. The code above compiles under `any` and silently never fires. Countless codebases still carry it and believe they have graceful shutdown. Delete it. The correct modern setup is Nest's own mechanism:

```typescript title="src/main.ts"
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();   // Nest listens for SIGTERM/SIGINT
await app.listen(3000);
```

`enableShutdownHooks()` is opt-in — without it, `onModuleDestroy` never runs on `SIGTERM`, in-flight requests are cut off mid-query, and Kubernetes rolling deploys drop connections. Enable it, implement `onModuleDestroy` on `PrismaService`, and verify the sequence with `kill -TERM <pid>` before you trust it. See [Chapter 39](../part3-advanced/39-lifecycle-and-shutdown.md) for the full ordering.

> **⚠️ Notice** — `enableShutdownHooks()` attaches listeners for every POSIX signal. In a process that already handles signals (some serverless adapters, some test runners) this can conflict. If it does, pass an explicit list: `app.enableShutdownHooks(['SIGTERM', 'SIGINT'])`.

---

## 13. Testing

Prisma's testing story is unusual: because the client is a generated class rather than an interface, mocking is more work than with a repository abstraction — but because it is a single injectable provider, replacing it is trivial.

**Unit tests: replace the provider with a deep mock.**

```typescript
import { Test } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(mockDeep<PrismaService>())
      .compile();

    service = moduleRef.get(UsersService);
    prisma = moduleRef.get(PrismaService);
  });

  it('returns null for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findOne({ email: 'nobody@example.com' })).resolves.toBeNull();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'nobody@example.com' },
    });
  });
});
```

`mockDeep` auto-mocks the whole nested surface, so `prisma.user.findUnique` is a jest mock without you writing it. Be clear about what this tests: your service's *arguments*, not the database's behaviour. A mock will happily accept a `where` clause the database would reject.

**Integration tests: a real database.** This is where the value is, and it is affordable with Testcontainers:

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = container.getConnectionUri();
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
}, 120_000);

afterAll(async () => {
  await container.stop();
});
```

Running `migrate deploy` here has a bonus: it proves your migrations apply cleanly from empty on every CI run, which catches a broken migration before production does.

**Isolating tests from each other.** Three options, in order of preference:

1. **Truncate between tests.** Fast, simple, honest. `TRUNCATE ... RESTART IDENTITY CASCADE` on every table, generated from `Prisma.dmmf.datamodel.models`.
2. **A transaction per test, rolled back.** Wrap the test body in an interactive `$transaction` and throw at the end. Very fast, but the code under test must receive `tx`, and it cannot test anything that itself opens a transaction.
3. **A schema per worker.** Give each Jest worker its own PostgreSQL schema (`?schema=test_${process.env.JEST_WORKER_ID}`) and run migrations into each. Enables real parallelism at the cost of setup time.

**E2E tests** override the provider at the application level:

```typescript
const app = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(PrismaService)
  .useValue(testPrismaService)   // pointed at the container
  .compile();
```

See [Chapter 31](./31-testing.md) for the surrounding infrastructure.

---

## 14. Choosing Prisma

Against the ORMs of Chapters 19 and 20:

| | Prisma | TypeORM | MikroORM | Sequelize |
|---|---|---|---|---|
| Source of truth | `schema.prisma` | Entity classes | Entity classes | Model classes |
| Type safety of results | Computed per query | `Partial<T>`-ish | Good | Weak |
| Pattern | Generated client | Data Mapper + Active Record | Data Mapper + UoW | Active Record |
| Lazy loading | None | Yes | Yes (via `Reference`) | No |
| Identity map | None | Partial | Yes | No |
| Migrations | First-class, SQL files | Generated, TS files | First-class | Via umzug |
| Arbitrary SQL | `$queryRaw` only | Full QueryBuilder | Full QueryBuilder | Full |
| Polymorphic / STI | Not supported | Supported | Supported | Workarounds |
| Schema in code | No — separate DSL | Yes | Yes | Yes |
| Learning curve | Shallow | Medium | Steep | Shallow |

**Choose Prisma when** the team values type safety over SQL expressiveness; the domain is CRUD-shaped with clear aggregates; you want migrations that are reviewable SQL; you are building a GraphQL API (the batching and the computed result types fit resolvers perfectly); or the team is mixed-seniority and you want a data layer that is hard to misuse.

**Do not choose Prisma when** your reporting queries need window functions, CTEs and vendor-specific SQL as a matter of routine — you will write half the application in `$queryRaw` and lose every benefit. Or when you need single-table inheritance, polymorphic associations, or a rich domain model with entity behaviour: Prisma returns anonymous data, and a domain layer on top of it is your job. Or when the schema must live in TypeScript because it is generated or composed at build time.

**The honest middle position:** Prisma is excellent at the 90% of queries that are "fetch these rows with these relations, filtered and paginated", and deliberately absent for the other 10%. If your 10% is genuinely 10%, `$queryRaw` covers it and the trade is good. If it is 40%, use a query builder — or Prisma for writes and Kysely/raw SQL for reads, which is a legitimate and increasingly common architecture.

One structural caveat before you commit: **`PrismaClient.$extends()` returns a new object, not a mutated client.** Client extensions (computed fields, soft-delete middleware, model methods) are the modern replacement for the removed `$use` middleware, and they do not compose with `class PrismaService extends PrismaClient`, because the extended client is a different type. If you need extensions, use a factory provider instead:

```typescript
export const PRISMA = Symbol('PRISMA');

export const prismaProvider = {
  provide: PRISMA,
  useFactory: (config: ConfigService) =>
    new PrismaClient({ adapter: new PrismaPg({ connectionString: config.getOrThrow('DATABASE_URL') }) })
      .$extends({
        result: {
          user: { displayName: { needs: { name: true, email: true },
                  compute: (u) => u.name ?? u.email } },
        },
      }),
  inject: [ConfigService],
};

export type ExtendedPrisma = ReturnType<typeof prismaProvider.useFactory>;
```

Consumers inject `@Inject(PRISMA) private prisma: ExtendedPrisma`. Decide this at the start of the project; converting later touches every service.

---

## Common mistakes

1. **Forgetting `prisma generate` after a schema change.** *Symptom:* `Property 'slug' does not exist on type 'Post'`, or a runtime `Unknown arg 'slug'` despite the field being right there in the schema. *Cause:* the generated client is stale; `migrate dev` regenerates, `db push` and a `git pull` do not. *Fix:* `postinstall: prisma generate`, and `prisma generate` in the build script.
2. **`this.prisma` inside a `$transaction` callback.** *Symptom:* partial writes survive a rollback; occasionally the request hangs until the transaction times out. *Cause:* the outer client uses a different connection, so those queries are outside the transaction and can block on locks the transaction holds. *Fix:* use `tx` for every query inside the callback; enforce it with a lint rule against `this.prisma` in transaction bodies.
3. **`deleteMany`/`updateMany` with an `undefined` filter value.** *Symptom:* the table is empty. *Cause:* `where: { authorId: undefined }` means "no constraint on authorId", not "authorId is null". *Fix:* validate inputs before they reach `where`; never share a `buildWhere` helper between reads and destructive writes.
4. **Keeping the Prisma 4 `beforeExit` shutdown hook.** *Symptom:* on `SIGTERM`, in-flight requests are killed and `onModuleDestroy` never logs. *Cause:* `$on('beforeExit')` was removed in Prisma 5 and now does nothing. *Fix:* `app.enableShutdownHooks()` plus `onModuleDestroy() { await this.$disconnect(); }`.
5. **`prisma migrate dev` against staging.** *Symptom:* "We need to reset the database" — and it does. *Cause:* `migrate dev` is a development command that owns the database. *Fix:* `migrate deploy` in every non-local environment; make the staging credentials lack `CREATEDB` so `migrate dev` cannot even build a shadow database.
6. **`$queryRawUnsafe` with template interpolation.** *Symptom:* SQL injection. *Cause:* the `Unsafe` variants take a plain string, so `${}` concatenates instead of binding. *Fix:* `$queryRaw` with a tagged template; ban the unsafe variants except for allow-listed identifiers.
7. **Returning Prisma results straight from a controller.** *Symptom:* `passwordHash` in a response; `TypeError: Do not know how to serialize a BigInt`. *Cause:* the model type is the database row, and `count`/`aggregate` return `bigint` on PostgreSQL. *Fix:* `select` exactly the fields you expose, and map to a response DTO ([Chapter 16](./16-serialization.md)).
8. **Deep `include` chains on list endpoints.** *Symptom:* a 3-query endpoint that takes 40 s and spikes heap. *Cause:* one query per relation level, but rows multiply as the product of the fan-outs. *Fix:* `select` only what you render, paginate the children, or fetch the second level separately for the visible page.
9. **`@updatedAt` assumed to be a database trigger.** *Symptom:* rows changed by a raw `UPDATE`, a migration backfill, or another service keep a stale `updatedAt`. *Cause:* Prisma sets it client-side. *Fix:* if other writers exist, add a real trigger in a `--create-only` migration.

---

## Putting it together

A complete posts feature: module wiring, cursor pagination, a nested write, a transaction, and error mapping.

```typescript title="src/posts/posts.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const POST_LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  publishedAt: true,
  author: { select: { id: true, name: true } },
  _count: { select: { categories: true } },
} satisfies Prisma.PostSelect;

export type PostListItem = Prisma.PostGetPayload<{ select: typeof POST_LIST_SELECT }>;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cursor-paginated feed. Ordered by (publishedAt, id) so ties are stable. */
  async feed(cursor: number | undefined, size = 20) {
    const rows = await this.prisma.post.findMany({
      where: { published: true },
      select: POST_LIST_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > size;
    const items = hasMore ? rows.slice(0, size) : rows;
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
  }

  /** Nested write: create the post, link the author by email, upsert categories. */
  createDraft(input: { title: string; content?: string; authorEmail: string; categories: string[] }) {
    return this.prisma.post.create({
      data: {
        title: input.title,
        slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        content: input.content,
        author: { connect: { email: input.authorEmail } },
        categories: {
          create: input.categories.map((name) => ({
            category: { connectOrCreate: { where: { name }, create: { name } } },
          })),
        },
      },
      select: POST_LIST_SELECT,
    });
  }

  /** Publish + denormalised counter, atomically. Every query uses `tx`. */
  publish(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({ where: { id }, select: { id: true, published: true, authorId: true } });
      if (!post) throw new NotFoundException(`Post ${id} not found`);
      if (post.published) return tx.post.findUniqueOrThrow({ where: { id }, select: POST_LIST_SELECT });

      await tx.user.update({
        where: { id: post.authorId },
        data: { /* e.g. publishedPostCount: { increment: 1 } */ },
      });

      return tx.post.update({
        where: { id },
        data: { published: true, publishedAt: new Date() },
        select: POST_LIST_SELECT,
      });
    });
  }
}
```

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import * as Joi from 'joi';
import { PostsModule } from './posts/posts.module';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
        DATABASE_POOL_SIZE: Joi.number().default(10),
      }),
    }),
    PrismaModule,
    PostsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: PrismaExceptionFilter }],
})
export class AppModule {}
```

```typescript title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();          // required for $disconnect to run on SIGTERM
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

Run it:

```bash
$ docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev --name pg postgres:16-alpine
$ echo 'DATABASE_URL="postgresql://postgres:dev@localhost:5432/postgres?schema=public"' > .env
$ npx prisma migrate dev --name init
$ npm run start:dev
```

The database connects at boot or the process refuses to start. Every query is explicit. Every result type is computed from the query that produced it. Every schema change is a reviewable SQL file. That is the whole proposition.

---

> **핵심 정리**
> - Prisma는 ORM이 아니라 **스키마 컴파일러**다. `schema.prisma`가 진실의 원천이고, CLI가 TypeScript 코드를 생성하며, 런타임 리플렉션은 없다. 엔티티 클래스도, 지연 로딩도, identity map도, unit of work도 없다.
> - `generator` 블록에서 NestJS는 반드시 `moduleFormat = "cjs"`가 필요하다. Prisma 7은 기본이 ESM이고, CJS Nest 앱은 `ERR_REQUIRE_ESM`으로 부팅에 실패한다. `output`은 `src/` 안에 두고 `.gitignore`에 추가하라.
> - `migrate dev`는 로컬 전용이며 데이터베이스를 리셋할 수 있다. 공유 환경에는 **오직 `migrate deploy`** 만 쓴다. 마이그레이션 SQL 파일은 편집 가능하다 — `--create-only`로 만들고 트리거·부분 인덱스·백필을 넣어라.
> - 타입 안전성의 핵심은 **결과 타입이 쿼리 인자로부터 계산된다**는 점이다. `select: { email: true }`는 `Partial<User>`가 아니라 프로퍼티가 정확히 하나인 타입을 돌려준다. 이름이 필요하면 `Prisma.validator` + `<Model>GetPayload`로 파생시켜라.
> - `PrismaService extends PrismaClient` + `onModuleInit`의 `$connect()`는 **잘못된 접속 정보를 첫 요청이 아니라 부팅 시점에** 드러내기 위한 것이다.
> - `include`는 관계 **레벨당 한 번** 질의하므로 N+1이 아니다. 문제는 쿼리 수가 아니라 행 수의 곱셈이다. 목록 엔드포인트에는 `include`가 아니라 `select`를 써라.
> - `$transaction` 콜백 안에서는 **모든 쿼리가 `tx`를 써야 한다.** `this.prisma`를 쓰면 다른 커넥션이라 롤백되지 않고, 최악의 경우 자기 자신과 교착 상태에 빠진다. 트랜잭션 안에서 외부 API를 호출하지 마라.
> - `$queryRaw`의 태그드 템플릿은 값을 바인드 파라미터로 보내므로 구조적으로 안전하다. `$queryRawUnsafe`는 같은 코드처럼 보이지만 문자열 연결이며 SQL 인젝션이다.
> - Prisma 5부터 `$on('beforeExit')`는 제거되었고 아무 일도 하지 않는다. 정상 종료는 `app.enableShutdownHooks()` + `onModuleDestroy`의 `$disconnect()`다.
> - `where`에 `undefined`가 들어가면 "제약 없음"을 뜻한다. 읽기에서는 편리하지만 `deleteMany`에서는 테이블을 비운다.
> - 윈도우 함수·재귀 CTE·벤더 고유 SQL이 일상인 도메인이라면 Prisma를 고르지 마라. 앱의 절반을 `$queryRaw`로 쓰게 되면 장점이 전부 사라진다.

> **연습 문제**
> 1. `include: { author: true }`로 게시글 50건을 조회할 때 실제로 실행되는 SQL을 쿼리 로그로 확인하라. 몇 개의 쿼리가 나가는가? `relationLoadStrategy: 'join'`으로 바꾸면 어떻게 달라지며, 어느 쪽이 빠른지 1만 건 데이터로 측정하라.
> 2. `select: { email: true }`로 조회한 결과에서 `role`에 접근해 보라. 같은 일을 TypeORM의 `find({ select: [...] })`로 하면 어떻게 되는가? 두 오류가 발견되는 시점의 차이를 설명하라.
> 3. `$transaction` 콜백 안에서 일부러 `this.prisma`(=`tx`가 아닌)를 사용해 보고, 롤백이 일어났을 때 어떤 데이터가 남는지 확인하라. 왜 그런지 커넥션 관점에서 설명하라.
> 4. `where: { authorId: undefined }`인 `deleteMany`와 `findMany`를 각각 실행하고 결과를 비교하라. 이 비대칭을 코드 수준에서 막는 방법을 두 가지 제안하라.
> 5. **직접 만들어 보라.** `--create-only`로 마이그레이션을 생성한 뒤 `posts` 테이블에 `updatedAt`을 갱신하는 PostgreSQL 트리거를 추가하라. 그다음 원시 `UPDATE`로 행을 바꿔 `@updatedAt`만으로는 왜 부족한지 증명하라.
> 6. **직접 만들어 보라.** `(publishedAt, id)` 복합 커서 페이지네이션을 구현하라. 동일한 `publishedAt`을 가진 행을 100건 만들어, `id`만으로 커서를 잡았을 때 항목이 중복되거나 누락되는 것을 테스트로 보여라.
> 7. **직접 만들어 보라.** Testcontainers로 PostgreSQL을 띄우고 `migrate deploy`를 실행하는 통합 테스트 하네스를 작성하라. 테스트 간 격리를 (a) TRUNCATE, (b) 트랜잭션 롤백 두 방식으로 각각 구현하고, 실행 시간과 각 방식이 테스트할 수 없는 시나리오를 비교하라.
> 8. `$queryRaw`로 작성한 통계 쿼리에 `COUNT(*)`를 넣고 그 결과를 컨트롤러에서 그대로 반환해 보라. 어떤 오류가 나며, 해결책 두 가지는 무엇인가?

**Next:** Your data layer is now typed end to end, but every row in it is visible to anyone who can reach the endpoint. [Chapter 23 — Authentication: Sessions, JWT, and Passport](./23-authentication.md) builds the layer that decides *who* is asking — by hand, so that [Chapter 24](./24-passport-strategies.md) can show what Passport adds on top.
