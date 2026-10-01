---
title: "58. Deployment and Serverless"
parent: "Part III — Advanced (고급)"
grand_parent: "NestJS Complete Guide"
nav_order: 58
chapter: 58
part: "Part III — Advanced (고급)"
level: advanced
reading_time: "50 min"
prerequisites: [17, 39, 55]
source_docs:
  - "content/deployment.md"
  - "content/faq/serverless.md"
source_url: "https://docs.nestjs.com/deployment"
nest_baseline: "11.x"
---

# Chapter 58 — Deployment and Serverless

> **한눈에 보기**
> 지금까지 만든 애플리케이션을 실제로 돌리는 장입니다. Node에는 "프로덕션 모드"라는 것이
> 없기 때문에, 프로덕션은 전적으로 **당신이 만드는 것** — 빌드 산출물, 이미지, 프로세스
> 모델, 롤아웃 절차 — 입니다. `nest build`부터 멀티스테이지 `Dockerfile`, 리버스 프록시와
> `trust proxy`, 무중단 배포, 수평 확장 시 깨지는 것들(인메모리 캐시·세션·스케줄러·
> WebSocket)과 그 해법, 그리고 서버리스에서 콜드 스타트를 줄이는 방법까지 다룹니다.
> 39장의 종료 훅과 55장의 컴파일 파이프라인이 여기서 하나의 배포 파이프라인으로 합쳐집니다.

**What you will learn**

- What actually changes between development and production in a Node process — and why `NODE_ENV=production` is a convention your dependencies read, not a switch the runtime honours.
- How to produce a deployment artifact you can trust: `nest build` output, the `dist/src` trap, a production `package.json`, and why `ts-node` must never appear in a running container.
- A multi-stage `Dockerfile` that caches layers correctly, ships only production dependencies, runs as a non-root user, and forwards SIGTERM so your graceful shutdown actually runs.
- How to sit behind a reverse proxy without lying to yourself about client IPs, protocols, and rate limits — `trust proxy`, `X-Forwarded-*`, and Node's timeout settings.
- What breaks the moment you run two replicas instead of one — in-memory cache, sessions, `@Cron`, WebSocket/SSE fan-out, file uploads — with the fix and the chapter for each.
- When serverless is a good fit for a Nest application, how to cut cold starts with a cached bootstrap promise, `createApplicationContext`, lazy modules, and bundling — and the cases where serverless is simply the wrong tool.

**Why this matters**

Node.js has no production mode. There is no flag that turns on optimisations, no runtime that swaps a debug build for a release build. `NODE_ENV=production` is a string in an environment variable, and its only effect is whatever the libraries you installed decide to do with it. That surprises people coming from ecosystems where the runtime enforces the distinction, and it explains a whole category of incidents: the application "was deployed to production" but nothing about the process was actually different from a laptop, because nobody made it different.

So production is something you construct, deliberately, out of about eight decisions: what artifact you build, how you install dependencies, what user the process runs as, how signals reach it, where configuration comes from, what the platform probes to decide you are alive, how many copies run, and what happens to state that assumed there would only ever be one. Get those right and deployment becomes boring — which is the goal. Get them wrong and you get the classics: a 1.2 GB image that takes four minutes to pull; a container that ignores SIGTERM and gets killed mid-transaction every deploy; rate limiting that counts your load balancer as one very busy user; a cron job that sends every customer three copies of the invoice email because three replicas each ran it.

The second half of this chapter is about serverless, where the calculus inverts. In a long-lived process, bootstrap cost is amortised to nothing — 200 ms once, then months of uptime. In a function that may cold-start on any request, that same 200 ms is user-visible latency on the request that happens to land on a cold container. Nest is usable in that world, but only if you understand which of its costs are one-time and which are per-invocation, and only if you are honest about when a framework built around a persistent DI container is the wrong shape for a platform built around ephemeral ones.

---

## What "production" means for a Nest process

Start from the artifact. A Nest application in production is **compiled JavaScript executed by Node**. Nothing else. Not TypeScript, not a watcher, not a transpile-on-require hook.

```bash
$ npm run build        # -> nest build -> dist/
$ NODE_ENV=production node dist/main.js
```

`nest build` is a wrapper around the TypeScript compiler (or SWC, see [Chapter 55](./55-performance-and-compilation.md)) that adds asset copying and monorepo awareness. In a CLI monorepo, name the project: `npm run build my-app`.

Three things about the output are worth knowing before you write a `Dockerfile`.

**The `dist/src` trap.** If any `.ts` file sits in your project root and your `tsconfig.json` includes it, TypeScript's `rootDir` inference expands to the project root and the output structure shifts: instead of `dist/main.js` you get `dist/src/main.js`. Your `CMD ["node", "dist/main"]` then fails with `Cannot find module`. The fix is either to keep root-level `.ts` files out of the compilation (`"exclude"` them) or to set `"rootDir": "src"` explicitly and adjust the start command. Check once, after your first build:

```bash
$ ls dist/
main.js  app.module.js  ...        # good
$ ls dist/
src/  test/                        # your entrypoint is dist/src/main.js
```

**`nest start` is not a production command.** It runs `nest build` and then `node dist/main` — convenient locally, wrong in a container, because it drags the entire `@nestjs/cli` toolchain (and thus TypeScript) into your runtime image. Build once in CI; run `node dist/main.js` at runtime.

**`ts-node` never ships.** Running `ts-node src/main.ts` in production means compiling your application on every process start, keeping the compiler and the whole `devDependencies` tree in the image, and discovering type errors at boot instead of at build time. If you see `ts-node` in a production `Dockerfile`, that is the bug.

### `NODE_ENV=production`

Set it. Its effects are entirely library-mediated, but the libraries that read it are ones you are using:

| Reader | Effect of `production` |
|---|---|
| `express` | Caches view templates, terse error output |
| Many ORMs / drivers | Disable verbose logging and schema sync warnings |
| `class-validator`, various | Skip development-only checks |
| `npm install` | Historically skipped devDependencies (prefer explicit `--omit=dev`) |
| Your own code | Whatever `ConfigService` does with it ([Chapter 17](../part2-intermediate/17-configuration.md)) |

Do not build application logic on `NODE_ENV` beyond coarse switches. "Is this staging or production?" is a different question with a different variable; conflating them is how a staging deploy ends up writing to the production Stripe account.

### A production-shaped `package.json`

```json title="package.json"
{
  "name": "orders-api",
  "version": "1.4.0",
  "private": true,
  "engines": {
    "node": ">=20.11.0 <23"
  },
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "migration:run": "typeorm-ts-node-commonjs migration:run -d ./src/data-source.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "typescript": "^5.7.0"
  }
}
```

Four deliberate choices. `engines` documents and (with `engine-strict`) enforces the Node floor — Nest 11 requires **Node 20 or newer**. `start` is `node dist/main.js`, not `nest start`, so the container's command matches the local one. `@nestjs/cli` and `typescript` are dev dependencies, which is what makes `npm ci --omit=dev` meaningful. And `private: true` prevents an accidental publish of your application to npm.

For installation, always `npm ci` in CI and images, never `npm install`. `ci` installs exactly what the lockfile says, deletes `node_modules` first, and fails if `package.json` and the lockfile disagree — which is precisely the guarantee a reproducible build needs.

---

## The build → image → rollout pipeline

```mermaid
flowchart LR
  subgraph dev["Developer"]
    SRC["src/*.ts + package-lock.json"]
  end

  subgraph ci["CI"]
    LINT["lint + typecheck"]
    TEST["unit + e2e tests"]
    BUILD["npm ci → nest build → dist/"]
    IMG["docker build<br/>multi-stage"]
    SCAN["image scan + SBOM"]
    PUSH["push :git-sha"]
  end

  subgraph reg["Registry"]
    TAG["app:9f3c1ab"]
  end

  subgraph cluster["Runtime"]
    ROLL["rolling update"]
    NEW["new replica"]
    RDY["readiness probe<br/>GET /healthz/ready"]
    LB["load balancer<br/>adds to pool"]
    OLD["old replica<br/>SIGTERM → drain → exit"]
  end

  SRC --> LINT --> TEST --> BUILD --> IMG --> SCAN --> PUSH --> TAG
  TAG --> ROLL --> NEW --> RDY -->|200 OK| LB
  LB --> OLD
  RDY -->|fails| ROLLBACK["rollout halted<br/>old replicas keep serving"]
```

Two properties of that pipeline matter more than the tools implementing it. The image is tagged with the **git SHA**, not `latest` — so "what is running?" has an answer, and rollback is a tag change rather than a rebuild. And the load balancer only sees a new replica after its readiness probe passes, and only drains an old one after the new one is ready; that ordering is what makes the rollout zero-downtime, and it depends entirely on your application answering probes honestly ([Chapter 56](./56-observability.md)).

---

## A Dockerfile that is actually production-grade

The naive Dockerfile in most tutorials — `FROM node:20`, `COPY . .`, `npm install`, `npm run build`, `CMD ["node", "dist/main"]` — works, and it is wrong in five ways: it ships the compiler and every dev dependency, it invalidates the dependency cache on every source change, it runs as root, it never receives SIGTERM as PID 1's child correctly, and the base image is ~1 GB. Here is the version to actually use.

```dockerfile title="Dockerfile"
# syntax=docker/dockerfile:1

########################  Stage 1: dependencies  ########################
FROM node:22-alpine AS deps
WORKDIR /usr/src/app

# Only the manifests: this layer is cached until dependencies change.
COPY package.json package-lock.json ./
RUN npm ci

########################  Stage 2: build  ###############################
FROM node:22-alpine AS build
WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .

RUN npm run build

# Drop dev dependencies from the tree we are about to copy forward.
RUN npm prune --omit=dev

########################  Stage 3: runtime  #############################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /usr/src/app

# dumb-init reaps zombies and forwards signals to our process.
RUN apk add --no-cache dumb-init

# The node image already ships an unprivileged `node` user (uid 1000).
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

```text title=".dockerignore"
node_modules
dist
coverage
.git
.github
.env
.env.*
*.log
*.md
Dockerfile
docker-compose*.yml
test
.vscode
.idea
```

Walk through the decisions, because each one prevents a specific failure.

**Three stages, one artifact.** Only `dist/`, pruned `node_modules`, and `package.json` reach the final image. TypeScript, the Nest CLI, Jest, and your test fixtures do not. On a typical API this is the difference between a ~1.1 GB image and a ~180 MB one, which is a difference in pull time on every node that schedules your pod.

**Layer caching is driven by copy order.** `COPY package*.json` before `COPY . .` means the `npm ci` layer is reused for every build where dependencies did not change — the common case. Reverse those two lines and every one-character source edit reinstalls the entire dependency tree. This single ordering rule is the largest CI-time lever in the file.

**`.dockerignore` is not optional.** Without it, `COPY . .` sends your local `node_modules` (built for your OS, possibly with native modules compiled for macOS ARM) and your `.env` file into the build context — slow, and a secret-leak vector, since anything in a layer is readable by anyone who pulls the image.

**Signals.** This is the one that silently breaks graceful shutdown ([Chapter 39](./39-lifecycle-and-shutdown.md)). If `CMD` is written in shell form (`CMD node dist/main.js`), Docker runs `/bin/sh -c node dist/main.js`; `sh` becomes PID 1, Node becomes a child, and `docker stop`/Kubernetes SIGTERM goes to `sh`, which does not forward it. Your `onApplicationShutdown` hooks never run, in-flight requests are cut, and after the grace period everything is SIGKILLed. Exec form (`CMD ["node", ...]`) fixes the forwarding but makes Node PID 1, where it does not reap orphaned child processes and has non-standard default signal behaviour. `dumb-init` (or `docker run --init`, or Kubernetes' shared process namespace) gives you a proper init that forwards signals and reaps zombies. Combine exec form with an init, as above.

Confirm it works — this is a two-minute test that saves a production incident:

```bash
$ docker run --rm --name app -p 3000:3000 orders-api:dev
# in another terminal
$ docker stop app        # sends SIGTERM, then SIGKILL after 10s
```

You should see your shutdown logs and the container exit in well under ten seconds. If it takes exactly ten, SIGTERM is not reaching Node.

**Non-root.** The official `node` images ship a `node` user. Switching to it costs one line and removes an entire escalation class; many clusters enforce it with a `runAsNonRoot` policy that will otherwise refuse to schedule your pod. Remember that a non-root process cannot bind ports below 1024 — bind 3000 and let the service or ingress map 80/443.

**Alpine or not.** `node:22-alpine` is small; it uses musl instead of glibc, which occasionally breaks native modules or subtly changes DNS and timezone behaviour. If you hit that, `node:22-bookworm-slim` is the low-drama alternative, ~120 MB larger and glibc-based. Pin the major version; do not use `node:latest`.

**Health checks in the image** are optional but cheap:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

Kubernetes ignores `HEALTHCHECK` in favour of its own probes, but Compose and plain Docker use it.

---

## Local parity with docker-compose

The value of Compose in a Nest project is not "running the app in a container locally" — `npm run start:dev` is faster for that. It is running **the app's dependencies** with the same versions, the same names, and the same network topology as production, so that a connection-string bug or a version incompatibility surfaces on your machine rather than in staging.

```yaml title="docker-compose.yml"
services:
  api:
    build:
      context: .
      target: runtime
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://app:app@postgres:5432/app
      REDIS_URL: redis://redis:6379
    ports:
      - '3000:3000'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    init: true

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

`depends_on` with `condition: service_healthy` is the part people skip and then work around with `sleep` in an entrypoint script. Waiting on an actual health check is both faster and correct. `init: true` gives the same signal handling as `dumb-init` for local runs.

For day-to-day development, keep a second file that runs only the backing services:

```bash
$ docker compose up -d postgres redis   # infra in containers
$ npm run start:dev                     # app on the host, with HMR
```

That combination — real dependencies, native dev loop — is the setup I recommend for almost every team.

---

## Configuration and secrets

[Chapter 17](../part2-intermediate/17-configuration.md) covers `ConfigModule`, schema validation, and namespaces in full. Three rules matter specifically at deployment time.

**Configuration enters as environment variables; secrets enter as mounted files or injected variables from a secret manager.** Never bake either into the image. An image layer is public to anyone who can pull it, and `docker history` will show them a build argument.

**Validate at boot and crash loudly.** A `ConfigModule` with a validation schema turns "the app came up and started throwing 500s because `DATABASE_URL` was empty" into "the pod crash-looped immediately with a message naming the missing variable". The second failure is diagnosable in ten seconds and never reaches users, because a crash-looping new replica never passes readiness and never enters the load balancer pool.

```typescript title="src/app.module.ts"
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
    PORT: Joi.number().port().default(3000),
    DATABASE_URL: Joi.string().uri().required(),
    REDIS_URL: Joi.string().uri().required(),
    JWT_SECRET: Joi.string().min(32).required(),
  }),
  validationOptions: { abortEarly: false },
});
```

**Do not ship `.env` files.** They belong in `.gitignore` and `.dockerignore`. In production, the platform supplies the environment: Kubernetes `Secret`s projected as env vars or files, ECS task definition secrets backed by Secrets Manager, or your PaaS's variable UI. If you must read a secret from a file (the safer pattern, since files can be rotated without a restart), read it in a config factory rather than sprinkling `fs.readFileSync` through your services.

---

## Behind a reverse proxy

In almost every real deployment, something sits in front of Node: nginx, an ALB, Cloudflare, an ingress controller. That layer terminates TLS and rewrites the connection, which means your application's idea of "the client" is now wrong unless you tell it otherwise.

```typescript title="src/main.ts"
const app = await NestFactory.create<NestExpressApplication>(AppModule);

// Trust exactly one proxy hop. Never `true` on a public-facing app.
app.set('trust proxy', 1);
```

With `trust proxy` set, Express derives `req.ip` from `X-Forwarded-For`, `req.protocol` from `X-Forwarded-Proto`, and `req.secure` accordingly. Without it:

- Every request appears to come from the proxy's IP, so IP-based rate limiting ([Chapter 26](../part2-intermediate/26-web-security-hardening.md)) throttles all your users as one client, or none of them.
- `req.secure` is `false` behind TLS termination, so `Secure` cookies may be rejected or a redirect-to-HTTPS becomes an infinite loop.
- Audit logs record the proxy instead of the caller.

**Set the hop count, not `true`.** `trust proxy: true` tells Express to believe the entire `X-Forwarded-For` chain, which any client can prepend to — making IP-based limits and allowlists trivially spoofable. `1` means "the leftmost entry after removing one hop is the client", which is correct behind a single proxy. Count your actual hops (CDN + ingress = 2).

On Fastify, the equivalent is an adapter option:

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy: 1 }),
);
```

Two Node-level timeouts also belong here, because their defaults interact badly with load balancers that keep connections alive:

```typescript
const server = app.getHttpServer();
server.keepAliveTimeout = 65_000;  // must exceed the LB idle timeout (AWS ALB: 60s)
server.headersTimeout = 66_000;    // must exceed keepAliveTimeout
```

If `keepAliveTimeout` is *shorter* than the load balancer's idle timeout, Node closes a connection the balancer still believes is usable, and the next request through it fails with a 502 that appears at a low, maddening, constant rate. This is one of the most-reported "random 502s" causes in Node deployments.

---

## Health probes and zero-downtime rollout

[Chapter 56](./56-observability.md) covers Terminus and the shape of health indicators; [Chapter 39](./39-lifecycle-and-shutdown.md) covers `enableShutdownHooks()` and the shutdown sequence. Deployment is where they combine.

Expose **two** endpoints with different semantics:

| Probe | Endpoint | Answers | Failure means |
|---|---|---|---|
| Liveness | `GET /healthz` | "Is this process wedged?" | Restart the container |
| Readiness | `GET /healthz/ready` | "Can this process serve traffic right now?" | Remove from the load balancer pool |

The distinction is load-bearing. A liveness probe that checks the database will restart every replica during a database blip — turning a degraded dependency into a full outage. A liveness probe should check only that the event loop is responsive. A readiness probe may check dependencies, because failing it removes one replica from rotation without killing it.

The rollout sequence, and where your code participates:

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant N as New replica
  participant LB as Load balancer
  participant P as Old replica

  O->>N: start container (image :new-sha)
  N->>N: bootstrap, connect DB/broker
  loop until 200
    LB->>N: GET /healthz/ready
  end
  N-->>LB: 200 OK
  LB->>N: route traffic
  O->>P: SIGTERM
  P->>P: readiness flips to 503
  LB--xP: stop sending new requests
  P->>P: drain in-flight (app.close())
  P->>P: onApplicationShutdown hooks
  P-->>O: exit 0
```

Two implementation details make this real rather than aspirational.

**Flip readiness before you stop serving.** Load balancers notice a failing readiness probe only on their next check — typically a few seconds later. If your process starts refusing connections the instant SIGTERM arrives, requests routed in that window fail. The pattern is: on SIGTERM, set a flag that makes readiness return 503, wait a few seconds (a `preStop` hook sleep, or a timer), and only then call `app.close()`.

```typescript title="src/health/readiness.state.ts"
import { Injectable } from '@nestjs/common';

@Injectable()
export class ReadinessState {
  private ready = false;
  private shuttingDown = false;

  markReady() { this.ready = true; }
  beginShutdown() { this.shuttingDown = true; }
  isReady() { return this.ready && !this.shuttingDown; }
}
```

```typescript title="src/main.ts"
const readiness = app.get(ReadinessState);
app.enableShutdownHooks();

process.on('SIGTERM', async () => {
  readiness.beginShutdown();              // probes start failing
  await new Promise((r) => setTimeout(r, 5_000)); // let the LB notice
  await app.close();                      // drain + lifecycle hooks
});

await app.listen(process.env.PORT ?? 3000);
readiness.markReady();
```

**Give the grace period enough room.** The orchestrator's `terminationGracePeriodSeconds` must exceed your drain sleep plus your longest in-flight request plus your shutdown hooks. A 30-second default and a 25-second report endpoint is a SIGKILL waiting to happen.

Database migrations deserve one sentence here, because they are the most common cause of a "zero-downtime" rollout that is not: run migrations as a separate job before the rollout, and make every migration backward-compatible with the currently-running version, because both versions will be live simultaneously. Add columns before you write to them; stop reading a column in one release and drop it in the next.

---

## Horizontal scaling and what it breaks

Vertical scaling — a bigger machine — is simple and has a ceiling; a single Node process uses one core for JavaScript no matter how many you buy. Horizontal scaling — more instances behind a load balancer — is the answer beyond that, and it gives you redundancy as a bonus.

### Cluster module or replicas?

Node's `cluster` module forks N worker processes sharing one listening socket. Orchestrators run N containers behind a service. Both use all your cores; they differ in what else they give you.

| | `cluster` in-process | Orchestrator replicas |
|---|---|---|
| Uses all cores | Yes | Yes (one core per replica, typically) |
| Survives a machine failure | No | Yes |
| Rolling deploys | You implement them | Built in |
| Per-instance resource limits | No | Yes (requests/limits) |
| Observability granularity | Workers share a container's metrics | Per-replica metrics natively |
| Memory overhead | One heap per worker, shared page cache | One heap per container |
| Complexity in your code | You write the primary/worker logic | None |

My recommendation: **if you have an orchestrator, use replicas and run one Node process per container.** The cluster module then duplicates the scheduling and restart logic your platform already provides, and it makes per-instance metrics and log correlation worse. Cluster earns its place on a single VPS where you want to use eight cores and have no orchestrator — and there, a supervisor like PM2 in cluster mode is usually the pragmatic choice over hand-written `cluster` code.

Whichever you choose, `SO_REUSEPORT`-style socket sharing means the process model is invisible to clients. What is *not* invisible is state.

### The scale-out breakage table

Everything in this table works perfectly with one instance and silently misbehaves with two. This is the checklist to run before your first `replicas: 2`.

| What breaks | Symptom with N > 1 | Fix | Chapter |
|---|---|---|---|
| In-memory cache (`CacheModule` default store) | Stale reads; invalidation on one replica leaves others serving old data | Shared store — Keyv + Redis | [27](../part2-intermediate/27-caching.md) |
| In-memory sessions (`express-session` MemoryStore) | Random logouts as requests hit different replicas | Redis session store, or stateless JWTs | [23](../part2-intermediate/23-authentication.md), [32](../part2-intermediate/32-http-cookies-sessions.md) |
| `@Cron` / `@Interval` schedulers | Every job runs N times — N invoice emails, N reports | Distributed lock (Redis), a leader-election flag, a dedicated single-replica worker deployment, or a queue with a scheduler | [34](../part2-intermediate/34-scheduling-and-events.md), [35](../part2-intermediate/35-queues.md) |
| In-process `EventEmitter2` | Listeners on other replicas never fire | A broker (Redis/NATS) for cross-instance events | [34](../part2-intermediate/34-scheduling-and-events.md), [46](./46-message-brokers.md) |
| WebSocket gateways | A broadcast reaches only clients connected to the emitting replica | Redis adapter for Socket.IO / a pub-sub fan-out layer | [44](./44-websockets.md) |
| SSE streams | Same fan-out problem; plus a client is pinned to one replica | Publish events through Redis; enable sticky sessions | [57](./57-advanced-http.md) |
| Rate limiting (`ThrottlerModule` memory storage) | Effective limit becomes N × configured limit | Redis throttler storage | [26](../part2-intermediate/26-web-security-hardening.md) |
| Local file uploads to disk | A later request lands on a replica that does not have the file | Object storage (S3/GCS) with signed URLs | [28](../part2-intermediate/28-file-upload-and-streaming.md) |
| In-memory idempotency keys / dedupe sets | Duplicates slip through | Shared store with TTL | [27](../part2-intermediate/27-caching.md) |
| GraphQL subscriptions (in-memory PubSub) | Subscribers miss events published elsewhere | `graphql-redis-subscriptions` or equivalent | [51](./51-graphql-types-and-operations.md) |
| Local BullMQ workers assumed unique | Usually fine — but concurrency multiplies by N | Set concurrency with N in mind; make jobs idempotent | [35](../part2-intermediate/35-queues.md) |
| In-memory metrics counters | Each scrape sees one replica's slice | Aggregate in Prometheus, not in the app | [56](./56-observability.md) |

The unifying principle: **an instance may hold caches, but never truths.** Any state whose loss or divergence changes behaviour belongs in a shared store. Audit for this by asking, of every module-level `Map`, `Set`, array, or counter: what happens if a second copy of this process exists, and what happens when this one restarts?

---

## Platform options, factually

There is no single right answer; there is a right answer for your team's size and appetite for operations.

| Option | You manage | Good fit when | Watch out for |
|---|---|---|---|
| **Mau** (`@nestjs/mau`) — the official Nest platform, deploys to your AWS account | Almost nothing; `mau deploy` provisions and rolls out | You want AWS underneath without learning AWS; you want databases, brokers, cron and workers provisioned alongside | It is your AWS bill and account; understand what was created |
| **PaaS** — Railway, Render, Fly.io | Dockerfile or buildpack, env vars | Small teams, fast iteration, straightforward HTTP services | Regional/scaling limits; pricing at scale; egress |
| **AWS ECS / Fargate** | Task definitions, ALB, IAM, networking | You already live in AWS and want containers without Kubernetes | IAM and VPC learning curve |
| **Kubernetes** (EKS/GKE/AKS or self-hosted) | Manifests, ingress, probes, autoscaling, upgrades | Many services, existing platform team | Real operational cost; do not adopt for one API |
| **Plain VPS** (Hetzner, DigitalOcean) + systemd/PM2 + nginx | Everything: OS patches, TLS, backups, monitoring | Cost-sensitive, one or two services, ops-comfortable team | Patching, backups, and the 3 a.m. page are yours |
| **Serverless** (Lambda, Cloud Functions, Azure Functions) | Function packaging | Spiky or very low traffic, event-driven handlers | Cold starts, connection pooling, timeouts — see below |

Mau, for completeness, is a two-command experience:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

It provisions on AWS (databases including PostgreSQL, MySQL, DocumentDB and Redis; brokers including RabbitMQ, Kafka and NATS; cron jobs, background workers, Lambda functions, CI/CD pipelines) and handles horizontal scaling from a dashboard. Treat it as a managed layer over AWS, not as a separate cloud.

Whatever you choose, the rest of this chapter's advice still applies: the image, the signals, the probes, the shared state. Platforms differ in who runs the container, not in what makes the container correct.

---

## Serverless

Serverless inverts the economics you have been designing for. There is no long-lived process to amortise bootstrap over. Every invocation either reuses a warm container — in which case your module graph, connection pool, and caches are still there — or triggers a **cold start**, where the platform must fetch your code, start a runtime, and run your bootstrap before your handler executes. That cold path is user-visible latency, and Nest is not free on it.

### The cost, measured

The official benchmarks are worth internalising, because they quantify exactly which decisions matter. Startup time to a ready handler, unbundled (plain `tsc` output):

| | Unbundled (`tsc`) | Bundled (`nest build --webpack`, all deps inlined) |
|---|---|---|
| Raw Node script | 7.1 ms | 6.6 ms |
| Express only | 7.9 ms | 6.8 ms |
| **Nest standalone** (`createApplicationContext`) | 111.7 ms | **31.9 ms** |
| **Nest HTTP** (`@nestjs/platform-express`) | 197.4 ms | **81.5 ms** |

Three conclusions follow directly.

**Bundling is the single largest lever** — roughly 3.5× on standalone, 2.4× on full HTTP. Most of the unbundled cost is filesystem work: resolving and reading hundreds of small files out of `node_modules`, which is slow on the network-backed filesystems serverless platforms use.

**Skipping the HTTP layer roughly halves what remains.** If your function is one handler responding to one event type, you do not need a router.

**Nest's floor is not zero.** Even bundled and standalone, you are paying ~30 ms over a raw script for the DI container and metadata reflection. That is a fine trade for a real application and a bad one for a three-line function. And it grows: an application with ten resources (ten modules, ten controllers, ten services, twenty DTOs, fifty endpoints) bootstraps in roughly **130 ms**. Running a monolith as a serverless function rarely makes sense in the first place — treat that number as an illustration of how bootstrap scales with graph size, not as a target.

### Approach 1: standalone context, one handler

When the function does one job and needs no routing, guards, or pipes, skip the HTTP server entirely:

```typescript title="src/main.ts"
import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module';
import { EventsService } from './events/events.service';
import type { INestApplicationContext } from '@nestjs/common';

let contextPromise: Promise<INestApplicationContext> | undefined;

function getContext(): Promise<INestApplicationContext> {
  // Cache the PROMISE, not the resolved value: two concurrent cold
  // invocations must not both bootstrap the container.
  contextPromise ??= NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  return contextPromise;
}

export const handler: Handler = async (
  event: unknown,
  _context: Context,
  _callback: Callback,
) => {
  const app = await getContext();
  const events = app.get(EventsService);

  return {
    statusCode: HttpStatus.OK,
    body: JSON.stringify(await events.process(event)),
  };
};
```

> **⚠️ Notice** — `createApplicationContext` does **not** wrap anything in guards, interceptors, pipes, or filters. Those are HTTP/RPC pipeline features. If your handler needs validation, do it explicitly (call `validate()` from `class-validator`, or instantiate a `ValidationPipe` yourself), or use the full-HTTP approach below.

The `contextPromise ??=` pattern is not a stylistic detail. Caching the resolved context (`if (!ctx) ctx = await NestFactory...`) leaves a window in which a second concurrent invocation on the same container sees `undefined` and bootstraps a *second* container — doubling connections and memory. Caching the promise makes the bootstrap exactly-once per container.

### Approach 2: full HTTP through an adapter

When you want the whole Nest HTTP pipeline — many routes, guards, pipes, filters, Swagger — wrap the Express instance in a Lambda-to-HTTP shim. The maintained package is `@codegenie/serverless-express`, the successor to the widely-deployed `@vendia/serverless-express` (which is itself the successor to `aws-serverless-express`); the API is the same, and older codebases in the wild use the `@vendia` name.

```bash
$ npm i @codegenie/serverless-express aws-lambda
$ npm i -D @types/aws-lambda serverless-offline
```

```typescript title="src/main.ts"
import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import type { Callback, Context, Handler } from 'aws-lambda';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

let serverPromise: Promise<Handler> | undefined;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // init(), not listen(): Lambda owns the socket, not us.
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (
  event: unknown,
  context: Context,
  callback: Callback,
) => {
  serverPromise ??= bootstrap();
  const server = await serverPromise;
  return server(event, context, callback);
};
```

Note the two ideas carried over from [Chapter 57](./57-advanced-http.md): `app.init()` rather than `listen()`, because nothing here binds a port, and `getHttpAdapter().getInstance()` to reach the Express application object the shim needs.

The Serverless Framework configuration that routes everything to it:

```yaml title="serverless.yml"
service: orders-api

plugins:
  - serverless-offline

provider:
  name: aws
  runtime: nodejs20.x
  memorySize: 1024
  timeout: 29

functions:
  main:
    handler: dist/main.handler
    events:
      - http:
          method: ANY
          path: /
      - http:
          method: ANY
          path: '{proxy+}'
```

Enable `esModuleInterop` in `tsconfig.json` so the shim's default export loads correctly:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "esModuleInterop": true
  }
}
```

Then test locally:

```bash
$ npm run build
$ npx serverless offline
# -> http://localhost:3000/dev/<any registered route>
```

> **Hint** — For several functions sharing modules, use the CLI monorepo mode ([Chapter 54](./54-monorepo-and-libraries.md)): one workspace, one shared library, many thin function entrypoints.

> **⚠️ Notice** — `@nestjs/swagger` needs extra setup to work inside a Lambda; the document must be built at bootstrap and the UI assets served from somewhere the function can reach. Budget time for it, or host the spec statically.

### Bundling and tree-shaking

Given the benchmark table, bundling is the first optimisation, not the last. `nest build --webpack` uses the CLI's webpack config; for serverless you want to override it so that dependencies are inlined rather than left external:

```javascript title="webpack.config.js"
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (options, webpack) => {
  const lazyImports = [
    '@nestjs/microservices/microservices-module',
    '@nestjs/websockets/socket-module',
  ];

  return {
    ...options,
    externals: [],               // bundle node_modules into the output
    output: {
      ...options.output,
      libraryTarget: 'commonjs2', // so `exports.handler` is visible to Lambda
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            // class-validator and Nest DI read class names at runtime.
            keep_classnames: true,
          },
        }),
      ],
    },
    plugins: [
      ...options.plugins,
      new webpack.IgnorePlugin({
        checkResource(resource) {
          if (lazyImports.includes(resource)) {
            try {
              require.resolve(resource);
            } catch {
              return true; // optional peer not installed — do not fail the build
            }
          }
          return false;
        },
      }),
    ],
  };
};
```

Three of those settings are load-bearing. `externals: []` is what actually inlines `node_modules` — the default config leaves them external, which is right for containers and wrong for functions. `libraryTarget: 'commonjs2'` makes the bundle export `handler` in the shape Lambda looks for; omit it and you get "handler is undefined" with no other clue. And `keep_classnames: true` prevents minification from renaming classes, which would break `class-validator` metadata and any DI that resolves by class name — the resulting bugs (validation silently passing, a provider not found) are extremely hard to trace back to the minifier.

`IgnorePlugin` handles Nest's optional lazy imports: `@nestjs/core` references the microservices and websockets modules dynamically, and webpack will fail the build looking for packages you did not install.

SWC ([Chapter 55](./55-performance-and-compilation.md)) is a faster *compiler* but not a bundler; for serverless, use SWC for speed during development and webpack (or esbuild) for the deployed artifact, and verify that your chosen bundler preserves decorator metadata and class names.

### Runtime shape: providers and cold starts

Compile-time work is only half the problem. How you declare providers decides what has to happen before your first response.

**Async providers block bootstrap.** An async provider exists to delay application start until it resolves. If your database connection takes 2 seconds, every cold invocation pays 2 seconds — even an invocation that never touches the database. In a long-lived server this is exactly what you want; in a function it may be the dominant cost. Consider connecting lazily on first use, with the connection cached on the (warm) container.

**Lazy-load modules you do not always need.** [Chapter 41](./41-module-ref-discovery-lazy.md) covers `LazyModuleLoader` in depth; serverless is its best-motivated use case:

```typescript title="src/app.controller.ts"
import { Controller, Get, Query } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';

@Controller()
export class AppController {
  constructor(private readonly lazyModuleLoader: LazyModuleLoader) {}

  @Get()
  async find(@Query('key') key: string) {
    // Only invocations that need caching pay Redis's connection cost.
    const { CacheModule } = await import('./cache/cache.module');
    const moduleRef = await this.lazyModuleLoader.load(() => CacheModule);

    const { CacheService } = await import('./cache/cache.service');
    return moduleRef.get(CacheService).get(key);
  }
}
```

The same pattern suits a dispatcher-style worker whose behaviour depends on its input:

```typescript
if (workerType === WorkerType.A) {
  const { WorkerAModule } = await import('./worker-a.module');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerAModule);
  return moduleRef.get(WorkerAService).run(payload);
}
if (workerType === WorkerType.B) {
  const { WorkerBModule } = await import('./worker-b.module');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerBModule);
  return moduleRef.get(WorkerBService).run(payload);
}
```

Both the dynamic `import()` and the lazy load are cached after the first call on a warm container, so the cost is paid once per container per branch — which is exactly the shape you want.

**Other serverless-specific adjustments**, briefly: reduce logging to `['error', 'warn']` (log formatting is real CPU on a small function); avoid `enableShutdownHooks()`, since containers are frozen rather than signalled; do not rely on `onApplicationShutdown` for flushes — flush before returning from the handler; and remember that **connection pools are per container**, so 200 concurrent Lambdas with a pool of 10 is 2,000 database connections. Use a connection proxy (RDS Proxy, PgBouncer) or a pool size of 1.

### When serverless is the wrong tool

Be honest about this list before committing an architecture:

- **Sustained traffic.** Above a steady baseline, a container running continuously is cheaper and faster than functions, with no cold starts at all.
- **Long-running work.** Platform timeouts (commonly 15 minutes maximum, and 29 seconds through API Gateway) rule out big reports, video processing, and large migrations. Use a queue and a worker ([Chapter 35](../part2-intermediate/35-queues.md)).
- **Anything holding a connection.** WebSocket gateways and SSE streams ([Chapters 44](./44-websockets.md) and [57](./57-advanced-http.md)) need a process that stays up. Dedicated WebSocket APIs exist on some platforms, but they are a different programming model, not a lift-and-shift.
- **Chatty database access.** Per-container pools and per-invocation connection setup fight relational databases. Managed proxies help; they do not eliminate the impedance mismatch.
- **A large monolith.** A 130 ms bootstrap that grows with every module, multiplied by every cold start, in exchange for none of serverless's benefits (you are not scaling to zero if you have traffic).
- **Strict tail latency.** If your SLO is on p99 and cold starts are on the table, you are fighting the platform. Provisioned concurrency mitigates it — and reintroduces the fixed cost you moved to serverless to avoid.

Where serverless *does* fit a Nest codebase well: webhook receivers, scheduled tasks, image/file post-processing triggered by object storage events, low-traffic internal tools, and per-endpoint functions carved out of a monorepo where each function loads a small slice of the graph. In those shapes, `createApplicationContext` plus a bundled artifact gives you Nest's DI, configuration, and testability at a cold-start cost in the tens of milliseconds — a genuinely good trade.

---

## Common mistakes

1. **Symptom:** `Error: Cannot find module '/usr/src/app/dist/main.js'` in the container, though the build succeeded.
   **Cause:** a root-level `.ts` file expanded the compiler's `rootDir`, so the entrypoint is `dist/src/main.js`.
   **Fix:** set `"rootDir": "src"` and exclude root scripts, or update `CMD`. Verify with `ls dist/` after building.

2. **Symptom:** every deploy cuts in-flight requests; shutdown logs never appear; containers take exactly the grace period to die.
   **Cause:** shell-form `CMD` puts `sh` at PID 1 and it does not forward SIGTERM.
   **Fix:** exec-form `CMD` plus `dumb-init` (or `--init`), and `app.enableShutdownHooks()`. Test with `docker stop`.

3. **Symptom:** CI takes eight minutes and reinstalls dependencies on every commit.
   **Cause:** `COPY . .` before `npm ci`, invalidating the dependency layer on any source change.
   **Fix:** copy `package*.json` first, install, then copy sources.

4. **Symptom:** the image is over a gigabyte and contains your tests and `.env`.
   **Cause:** single-stage build with no `.dockerignore`.
   **Fix:** multi-stage build copying only `dist/`, pruned `node_modules`, and `package.json`; a real `.dockerignore`.

5. **Symptom:** rate limiting blocks everyone at once, or never triggers; audit logs show one IP.
   **Cause:** `trust proxy` unset behind a load balancer, so every request appears to come from the proxy.
   **Fix:** `app.set('trust proxy', <hop count>)` — a number, never `true` on a public app.

6. **Symptom:** intermittent 502s at a low, steady rate with no application errors.
   **Cause:** Node's `keepAliveTimeout` is shorter than the load balancer's idle timeout, so Node closes connections the balancer still reuses.
   **Fix:** `server.keepAliveTimeout = 65000; server.headersTimeout = 66000;` (above your LB's idle timeout).

7. **Symptom:** after scaling to three replicas, customers receive three copies of every scheduled email.
   **Cause:** `@Cron` runs in every instance.
   **Fix:** a distributed lock, a single-replica worker deployment, or a queue-backed scheduler ([Chapter 35](../part2-intermediate/35-queues.md)).

8. **Symptom:** users are randomly logged out, and cached data is inconsistent between requests.
   **Cause:** in-memory session store and in-memory cache with more than one replica.
   **Fix:** Redis-backed session store and cache; see the scale-out table.

9. **Symptom:** a liveness probe restarts every pod during a brief database outage, turning degradation into an outage.
   **Cause:** the liveness endpoint checks dependencies.
   **Fix:** liveness checks the process only; readiness checks dependencies.

10. **Symptom:** a Lambda cold-starts in 900 ms and holds hundreds of database connections under load.
    **Cause:** unbundled deployment plus an eager async connection provider plus one pool per container.
    **Fix:** bundle with webpack (`externals: []`, `commonjs2`, `keep_classnames`), connect lazily, and use a connection proxy or a pool size of 1.

11. **Symptom:** validation silently stops rejecting bad payloads after enabling minification.
    **Cause:** Terser renamed classes; `class-validator` metadata no longer matches.
    **Fix:** `keep_classnames: true` (and `keep_fnames` if you also rely on function names).

12. **Symptom:** two containers bootstrap inside one Lambda instance, doubling connections.
    **Cause:** caching the resolved app instead of the bootstrap promise, leaving a concurrency window.
    **Fix:** `serverPromise ??= bootstrap();` — cache the promise.

---

## Putting it together

A complete deployment surface for one service: entrypoint, image, compose file, and CI workflow, wired so that every piece discussed above is present exactly once.

```typescript title="src/main.ts"
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ReadinessState } from './health/readiness.state';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.use(helmet());
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api', { exclude: ['healthz', 'healthz/ready', 'metrics'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const readiness = app.get(ReadinessState);
  const logger = new Logger('Bootstrap');

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received: failing readiness, draining');
    readiness.beginShutdown();
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await app.close();
    logger.log('Drained; exiting');
    process.exit(0);
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  readiness.markReady();
  logger.log(`Listening on :${port} (${process.env.NODE_ENV})`);
}
bootstrap();
```

```typescript title="src/health/health.controller.ts"
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { ReadinessState } from './readiness.state';

@Controller('healthz')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly readiness: ReadinessState,
  ) {}

  /** Liveness: is the event loop responsive? Nothing else. */
  @Get()
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  /** Readiness: should the load balancer send us traffic? */
  @Get('ready')
  @HealthCheck()
  async ready() {
    if (!this.readiness.isReady()) {
      throw new ServiceUnavailableException('shutting down');
    }
    return this.health.check([() => this.db.pingCheck('database', { timeout: 1500 })]);
  }
}
```

```yaml title=".github/workflows/deploy.yml"
name: deploy

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test -- --ci
      - run: npm run test:e2e -- --ci

      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          # Immutable, traceable tag. `latest` is for humans, not for deploys.
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Roll out
        run: |
          kubectl set image deployment/orders-api \
            api=ghcr.io/${{ github.repository }}:${{ github.sha }}
          kubectl rollout status deployment/orders-api --timeout=180s
```

The `kubectl rollout status` line is the safety net: it blocks until new replicas pass readiness, and fails the job (leaving old replicas serving) if they do not. A deploy pipeline that does not wait for readiness is not a deploy pipeline; it is a hope.

To exercise the whole thing locally before trusting it: `docker compose up --build`, hit `/healthz` and `/healthz/ready`, then `docker compose stop api` and watch the drain log appear and the container exit well inside the grace period.

---

> **핵심 정리**
> - Node에는 프로덕션 모드가 없습니다. 프로덕션은 **아티팩트·프로세스 모델·롤아웃 절차**로 당신이 만드는 것이며, `NODE_ENV=production`은 라이브러리들이 읽는 관례일 뿐입니다.
> - 배포되는 것은 `dist/`의 컴파일된 JS입니다. 컨테이너에서 `ts-node`나 `nest start`를 쓰지 마십시오. 빌드는 CI에서 한 번, 런타임은 `node dist/main.js`입니다.
> - 멀티스테이지 `Dockerfile`의 핵심은 네 가지입니다: 매니페스트 먼저 복사(레이어 캐시), `npm ci` + `--omit=dev`, 비루트 사용자, 그리고 **exec 형식 CMD + dumb-init**(SIGTERM 전달).
> - 시그널이 도달하지 않으면 39장의 graceful shutdown은 존재하지 않는 것과 같습니다. `docker stop`으로 반드시 검증하십시오.
> - 리버스 프록시 뒤에서는 `trust proxy`를 **홉 수(숫자)** 로 설정하고, `keepAliveTimeout`을 로드밸런서 idle timeout보다 크게 두십시오(랜덤 502의 주범).
> - liveness는 프로세스만, readiness는 의존성까지 검사합니다. SIGTERM 시 readiness를 먼저 실패시키고 몇 초 기다린 뒤 `app.close()`를 호출해야 무중단이 성립합니다.
> - 인스턴스를 2개로 늘리는 순간 깨지는 것들이 있습니다: 인메모리 캐시·세션·`@Cron`·`EventEmitter2`·WebSocket/SSE 브로드캐스트·스로틀러·로컬 파일. **인스턴스는 캐시를 가질 수 있어도 진실을 가질 수는 없습니다.**
> - 오케스트레이터가 있다면 컨테이너당 Node 프로세스 1개 + 레플리카를 쓰십시오. `cluster`는 오케스트레이터가 이미 하는 일을 중복합니다.
> - 서버리스에서 가장 큰 레버는 **번들링**입니다(표준 HTTP 197ms → 81ms, 스탠드얼론 112ms → 32ms). `externals: []`, `libraryTarget: 'commonjs2'`, `keep_classnames: true`가 필수입니다.
> - 부트스트랩은 **프로미스를 캐시**해야 합니다(`serverPromise ??= bootstrap()`). 해석된 값을 캐시하면 동시 콜드 스타트에서 컨테이너가 두 번 부팅됩니다.
> - 긴 작업·연결 유지(WS/SSE)·꾸준한 트래픽·엄격한 p99 SLO에는 서버리스가 잘못된 도구입니다. 웹훅·스케줄 작업·저트래픽 내부 도구에는 훌륭한 선택입니다.

> **연습 문제**
> 1. 단일 스테이지 `Dockerfile`과 이 장의 멀티스테이지 버전으로 각각 이미지를 빌드하고, `docker images`로 크기를, 소스 한 줄만 바꾼 재빌드 시간으로 캐시 효율을 비교하십시오.
> 2. `CMD node dist/main.js`(셸 형식)와 `CMD ["node","dist/main.js"]` + `dumb-init`을 각각 적용한 뒤 `docker stop`을 실행하고, 종료 로그와 종료 소요 시간의 차이를 기록하십시오.
> 3. `trust proxy`를 설정하지 않은 상태에서 nginx 뒤에 앱을 두고 `ThrottlerModule`을 켠 뒤, 서로 다른 두 클라이언트가 같은 제한을 공유하는 것을 관찰하십시오. 홉 수를 설정해 고치고, `true`가 왜 위험한지 설명하십시오.
> 4. 레플리카 2개로 `@Cron` 작업과 인메모리 `CacheModule`을 동시에 돌려 중복 실행과 캐시 불일치를 재현한 뒤, 각각을 표에 제시된 방법으로 고치십시오.
> 5. **직접 만들기:** liveness/readiness를 분리한 헬스 엔드포인트와 SIGTERM 드레인 시퀀스를 구현하고, 롤링 배포 중에 `autocannon` 같은 도구로 부하를 주면서 **에러 0건**으로 배포가 끝나는지 검증하십시오.
> 6. **직접 만들기:** 같은 `AppModule`을 (a) `createApplicationContext` 스탠드얼론 핸들러와 (b) `serverless-express` 전체 HTTP 핸들러로 각각 배포하고, 번들링 전/후의 콜드 스타트를 측정해 4개 값의 표를 만드십시오. 결과를 근거로 이 서비스에 어떤 방식을 택할지 결정하고 이유를 쓰십시오.

**Next:** [Chapter 59](./59-migration-and-ecosystem.md) closes the book: the complete v10 → v11 migration, how to find deprecations before they find you, how to judge a third-party Nest package, and a map of where to go next.
