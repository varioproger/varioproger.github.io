---
chapter: 60
part: "Part IX — Production Practice"
title: "Deployment, Containers, and Configuration"
level: advanced
reading_time: "40 min"
prerequisites: [25, 26, 30, 36, 59]
source_docs:
  - "doc/api/cli.md"
  - "doc/api/process.md"
  - "doc/api/module.md"
  - "doc/api/os.md"
  - "doc/api/v8.md"
  - "doc/api/http.md"
source_url: "https://nodejs.org/docs/latest/api/cli.html"
node_baseline: "27.0.0-pre"
---

# Chapter 60 — Deployment, Containers, and Configuration

## What you will learn

- Which twelve-factor ideas earn their keep in Node and which two you should ignore.
- The exact precedence rules for `--env-file`, `NODE_OPTIONS`, and the configuration file, and what `NODE_OPTIONS` will refuse to accept.
- Why `npm install` in a Dockerfile is a bug, and how to order layers so `node_modules` caches.
- How to size `--max-old-space-size` against a container memory limit, and why an `OOMKilled` pod leaves no stack trace.
- Why `os.availableParallelism()` and `UV_THREADPOOL_SIZE` matter under a CPU quota.
- How to cut startup time with `NODE_COMPILE_CACHE` and snapshots, and a checklist for shipping.

## Why this matters

A Node service that works on a laptop and dies in a container almost always dies for one of five reasons: it read configuration that was not there, it installed different dependencies than were tested, it never received `SIGTERM`, it exceeded a memory limit V8 could not see, or it spun up thread pools sized for a 64-core host while pinned to half a CPU.

None of these are subtle bugs. They are all knowable in advance, and every one of them has a specific, verifiable fix in the Node CLI or the container definition. This chapter is that list, with the arithmetic worked out.

## Twelve-factor, filtered

The twelve-factor app is a useful checklist written for a different decade. Applied to Node, some of it is load-bearing and some of it is folklore. My reading:

| Factor | Verdict for Node |
|---|---|
| **Config in the environment** | **Yes**, with a caveat — read it once at boot into a validated object (Chapter 59), never `process.env` at the point of use. |
| **Explicit, isolated dependencies** | **Yes.** A committed lockfile and `npm ci` are the whole factor. |
| **Stateless processes** | **Yes.** In-process caches must be a latency optimisation, never a source of truth, or a rolling deploy silently loses data. |
| **Port binding** | **Yes.** Bind a port from a config value; let the platform route. |
| **Disposability — fast startup, graceful shutdown** | **Yes, emphatically.** This is the factor Node apps most often fail (see draining, below). |
| **Dev/prod parity** | **Yes**, and containers make it nearly free. Pin the Node *minor* version, not just the major. |
| **Logs as event streams to stdout** | **Yes.** Write JSON lines to stdout, let the platform ship them. |
| **Backing services as attached resources** | **Yes.** This is exactly the port/adapter split from Chapter 59. |
| **Concurrency via the process model** | **Partly.** Horizontal scaling is right; the "process types" formalism is not. Worker threads (Chapter 29) are a legitimate in-process answer that twelve-factor did not anticipate. |
| **One codebase, many deploys** | **Partly.** Sound in spirit; it predates monorepos and says nothing useful about them. |
| **Admin processes as one-off runs** | **Mostly no.** In an orchestrator, a one-off `node scripts/migrate.js` against production has no supervision, no retry, and no audit trail. Model migrations as a job resource, not an SSH session. |
| **Build/release/run separation** | **Yes**, and this is the most important one. See "immutable artefacts" at the end. |

The two I would actively push back on are admin processes and the concurrency model. Everything else survives contact with a modern platform.

## Configuration

### Where configuration comes from

Three sources, three jobs. Mixing them up is the usual cause of a secret in a git repo.

| Source | Good for | Bad for |
|---|---|---|
| Environment variables | Per-deploy values: ports, URLs, feature flags, log level | Anything large, structured, or rotating |
| Files in the image | Nothing that varies per environment | Secrets — a file in a layer is a permanent, distributable copy |
| Mounted files / secrets manager | Credentials, certificates, anything rotated | Values you need before the process starts |

The practical rule: **environment variables for shape, mounted files for secrets.** A secrets manager that projects a credential onto a file path gives you rotation without a redeploy — but only if your code re-reads the file, which means a config value like `DATABASE_PASSWORD_FILE=/run/secrets/db` and a read at connect time rather than a `DATABASE_PASSWORD` frozen at boot.

Avoid `.env` files in production images entirely. They are convenient locally and they are a secret baked into a layer anyone who can pull the image can read.

### `--env-file` and precedence

`--env-file=file` (added v20.6.0; no longer experimental as of v24.10.0/v22.21.0) loads a file relative to the current directory into `process.env`, before your code runs. The precedence rules, all verifiable in `cli.md`:

| Conflict | Winner |
|---|---|
| Real environment vs. value in the file | **Real environment** |
| Two `--env-file` arguments define the same key | **The later file** |
| File missing, `--env-file` | **Error**, process exits |
| File missing, `--env-file-if-exists` | Ignored, startup continues |

```bash
node --env-file=.env --env-file=.env.local src/main.js
```

The file format: one `KEY=value` per line; `#` starts a comment; values may be wrapped in `` ` ``, `"`, or `'` and the quotes are stripped; multi-line double-quoted values are supported (since v21.7.0/v20.12.0); a leading `export ` is ignored.

Three behaviours that are easy to get wrong:

- **`--env-file` applies Node's own configuration variables, including `NODE_OPTIONS`.** This is the only file-based way to set Node flags through a dotenv file.
- **`process.loadEnvFile(path)`** (default `'./.env'`; stable since v24.10.0/v22.21.0) does the same thing at runtime, but `NODE_OPTIONS` in a file loaded this way has **no effect** — the runtime has already booted.
- **`node --run <script>` does not pass `--env-file` variables to the script it runs.**

If you want to parse without mutating anything, `util.parseEnv(content)` returns a plain object.

### `NODE_OPTIONS`: what is and is not allowed

`NODE_OPTIONS` is a space-separated list of CLI options applied *before* command-line options. It exists so a platform can inject flags without owning the command line.

The rules:

- Options are interpreted first, so **command-line options override or compound after them**. A singleton flag on the command line wins: `NODE_OPTIONS='--inspect=localhost:4444' node --inspect=localhost:5555` listens on 5555. A repeatable flag compounds: `NODE_OPTIONS='--require "./a.js"' node --require "./b.js"` behaves as `--require ./a.js --require ./b.js`.
- Values containing spaces must be double-quoted: `NODE_OPTIONS='--require "./my path/file.js"'`.
- **Only an allow-list of flags is permitted.** Node exits with an error if you use one that is not, "such as `-p` or a script file." You cannot smuggle an entrypoint through `NODE_OPTIONS`, which is exactly the point.

The allow-list is long and worth reading once in `cli.md`. For deployment, the flags you will actually reach for are all on it:

| Flag | Why you would set it in `NODE_OPTIONS` |
|---|---|
| `--max-old-space-size`, `--max-semi-space-size`, `--max-old-space-size-percentage` | Fit V8 to a container limit |
| `--enable-source-maps` | Readable stacks from compiled output |
| `--import`, `--require`, `-r` | Load an instrumentation/tracing agent first |
| `--report-on-fatalerror`, `--report-uncaught-exception`, `--report-dir` | Diagnostic reports on crash (Chapter 50) |
| `--heapsnapshot-near-heap-limit` | Capture a heap snapshot before an OOM |
| `--unhandled-rejections` | Choose crash-vs-warn policy explicitly |
| `--dns-result-order` | Control IPv4/IPv6 preference |
| `--permission`, `--allow-fs-read`, `--allow-net`, … | The permission model (Chapter 31) |
| `--use-system-ca`, `--use-env-proxy` | Corporate TLS and proxy environments |

Notably **`--env-file` is not on the allow-list**. Dotenv loading is a command-line-only concern.

There is also a configuration file, `node.config.json` (`--experimental-config-file=path`, stability 1.2 — release candidate), whose `nodeOptions` field holds flags allowed in `NODE_OPTIONS`. Its documented priority is:

1. `NODE_OPTIONS` and command-line options
2. Dotenv `NODE_OPTIONS` (from `--env-file`)
3. The configuration file

So the config file is the weakest source and never overrides the environment. It is a good place for repo-wide developer defaults; it is not a deployment mechanism. Node does not validate or sanitise it — never load an untrusted one.

### `NODE_ENV`: a convention Node itself does not implement

Search the Node documentation for `NODE_ENV` and you will not find it. Node does not read it, does not branch on it, and gives it no meaning. It is purely an ecosystem convention — and one with real consequences, because a large amount of the ecosystem *does* branch on it:

- Many frameworks skip development-only work — verbose error pages, view-template recompilation, extra validation — when `NODE_ENV === 'production'`.
- Some libraries ship separate development and production builds selected by `NODE_ENV` at bundle time.
- `npm install` treats `NODE_ENV=production` as implying that `devDependencies` are skipped.

That last point makes `NODE_ENV` a *build* variable as well as a runtime one, which is where people get hurt: setting `NODE_ENV=production` in a builder stage silently strips the dev dependencies your build needs.

My advice: set `NODE_ENV=production` in your runtime image, treat it as a single boolean that means "not a developer's machine," and **never branch your own code on it**. Your own environment differences belong in your validated config object as named flags — `config.logPretty`, `config.enableDebugRoutes` — which are greppable and testable. A codebase with fifteen `if (process.env.NODE_ENV === 'test')` branches is a codebase whose production behaviour is untested by construction.

## Reproducible installs

**The lockfile is the artefact.** Commit `package-lock.json` (or your package manager's equivalent). Without it, "the same code" resolves to different transitive dependency versions on Tuesday than it did on Monday.

**Use `npm ci`, not `npm install`, in every non-interactive context.** The difference is the direction of trust:

| | `npm install` | `npm ci` |
|---|---|---|
| Reads the lockfile | As a hint | As the specification |
| May update the lockfile | **Yes** | No — errors if `package.json` and the lockfile disagree |
| Existing `node_modules` | Reconciled in place | Deleted and rebuilt |
| Requires a lockfile | No | **Yes** |

`npm install` in a Dockerfile is a bug, not a style preference, for three reasons. It can resolve a *newer* version than the one you tested, so the image does not correspond to any tested state. It can rewrite the lockfile inside the image, where the change is invisible and discarded — so the drift never gets reviewed. And it makes the build non-reproducible: rebuild the same commit next month and you may get a different dependency tree, which destroys the ability to bisect a regression. `npm ci` fails loudly instead, which is the correct behaviour for a machine.

**Install production dependencies with `--omit=dev`** in the stage that produces the runtime image. Dev dependencies are test runners, type checkers, and bundlers: they add image size, and every one of them is additional code with registry provenance running in production. Keep them in the build stage where they belong.

If any dependency has install scripts you do not need, `npm ci --ignore-scripts` is worth evaluating — it is a real supply-chain reduction (Chapter 44), but some native modules genuinely require their build script, so test it rather than assuming.

## Building a good Node container image

### Choosing a base

| Base | Size | Native addons | Trade-off |
|---|---|---|---|
| `node:*-bookworm` (Debian) | Largest | Easiest | Full toolchain available; good default for the *build* stage |
| `node:*-bookworm-slim` | Moderate | Fine | The pragmatic default for runtime |
| `node:*-alpine` (musl) | Smallest | Riskiest | See below |
| distroless (`gcr.io/distroless/nodejs*`) | Small | Prebuilt only | No shell, no package manager, smallest attack surface |

**My default is `-slim` for runtime, distroless when the security posture justifies losing `sh`.** Losing the shell is a genuine cost: no `docker exec` debugging, no shell-form `CMD`. It is worth it for internet-facing services and not worth it for an internal batch job.

**The musl caveat is real.** Alpine links against musl libc rather than glibc, and Node's official binaries target glibc — Alpine images use a differently-built Node. Consequences that appear in the Node documentation itself: `fs.realpath()` and its siblings require procfs mounted at `/proc` when Node is linked against musl, a restriction glibc does not have; and single executable applications (Chapter 55) are untested on Alpine, which the docs call out explicitly. Add to that native addons distributed as glibc prebuilds, which must be compiled from source on musl, and the 60 MB you saved costs you a build toolchain and a class of bugs that reproduce nowhere else. Use Alpine when image size is a hard constraint you have measured, not by default.

Pin the *minor* version — `node:24.9-bookworm-slim`, not `node:24` — so a rebuild does not silently change runtimes. Pin by digest if your supply-chain requirements demand it.

### Multi-stage builds and layer order

```dockerfile
# syntax=docker/dockerfile:1

# 1. Production dependencies only. Cached unless the lockfile changes.
FROM node:24.9-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2. Full dependencies + build. Also cached on the lockfile.
FROM node:24.9-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm test

# 3. Runtime: no package manager, no source, no dev dependencies.
FROM node:24.9-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
```

The layer ordering is the whole trick. `COPY package.json package-lock.json` comes **before** `COPY . .`, so the expensive `npm ci` layer is keyed only on the lockfile. Copy your source first and every one-character change re-downloads the dependency tree.

`npm ci` is run twice, in two stages, and that is deliberate: the `deps` stage produces a `node_modules` with no dev dependencies to copy into the runtime image, while `build` gets the full tree it needs to compile and test. Both are cached on the same key, so the second costs little.

### Non-root and read-only

The official `node` images ship a `node` user (uid 1000). Use it — `USER node` after the copies, with `--chown=node:node` so the files are readable. Distroless images provide a `nonroot` user for the same purpose.

Then make the root filesystem read-only. Almost every Node service can run this way; the exceptions are predictable and each has a fix:

| Needs to write | Fix |
|---|---|
| `os.tmpdir()` | Mount an emptyDir/tmpfs at `/tmp` |
| Compile cache (`NODE_COMPILE_CACHE`) | Point it at the writable tmp mount, or bake it read-only at build time |
| Diagnostic reports (`--report-dir`) | Mount a volume, or accept losing them |
| Heap snapshots on demand | Mount a volume |
| Uploaded files | You have state in a stateless process — fix the design |

A read-only root filesystem turns a whole class of remote-code-execution follow-through — dropping a payload on disk and getting it executed — into a failed `write`. It costs almost nothing. Combine it with dropping all Linux capabilities and `no-new-privileges`.

Inside the process, the permission model (`--permission` with `--allow-fs-read`, `--allow-net`, and friends, Chapter 31) adds a second layer. Remember what the Node documentation says about it: it is a "seat belt," not a sandbox, and malicious code can bypass it. Use it to catch accidents, not to contain an attacker.

### PID 1 and the signal problem

In a container your process is PID 1, and PID 1 has two special properties: the kernel does not apply default signal dispositions to it, and it inherits orphaned children to reap.

Node handles the first case, because it installs real handlers — `process.md` states that `SIGTERM` and `SIGINT` "have default handlers on non-Windows platforms that reset the terminal mode before exiting with code `128 + signal number`," and that installing your own listener removes that default. So `node` as PID 1 does receive `SIGTERM`. What breaks it is putting something in front of Node:

```dockerfile
CMD npm start                    # ❌ shell form: /bin/sh is PID 1
CMD ["npm", "start"]             # ❌ npm is PID 1; it does not forward signals reliably
CMD ["node", "dist/main.js"]     # ✅ node is PID 1 and gets SIGTERM
```

With either of the first two, `SIGTERM` goes to a process that ignores it, nothing propagates to Node, the orchestrator waits out its grace period, and then sends `SIGKILL`. Symptom: every deploy takes exactly 30 seconds per pod and in-flight requests are cut off. This single line is the most common cause of "graceful shutdown doesn't work" ([Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](../part4-system/26-signals-and-shutdown.md)).

The second PID-1 property — reaping zombies — only matters if you spawn child processes (Chapter 28). If you do, run a real init: `docker run --init`, `shareProcessNamespace`/an init container in Kubernetes, or `tini` as the entrypoint. If you spawn nothing, you do not need one.

## Memory: the container/V8 mismatch

This is the failure that produces the least evidence, so it is worth understanding precisely.

V8 chooses a default heap limit at startup based on the machine it thinks it is on. A cgroup memory limit is not visible through the interfaces V8 uses for that decision, so on a 64 GB host, a container limited to 512 MiB can start a V8 whose old-space limit is sized for a 64 GB host. V8 then happily grows the heap toward a limit the cgroup will never allow, the kernel's OOM killer fires, and the process receives `SIGKILL`.

**`SIGKILL` cannot be caught.** The Node documentation is explicit: `'SIGKILL'` cannot have a listener installed and will unconditionally terminate Node on all platforms. So there is no `'exit'` event, no `uncaughtException`, no stack, no log line. You get a container status of `OOMKilled` and an exit code of 137 (`128 + 9`, the shell convention for death by signal 9). Compare that with a *V8 heap* OOM, where V8 hits its own limit first and prints `FATAL ERROR: ... JavaScript heap out of memory` with a trace — and can be made to write a heap snapshot with `--heapsnapshot-near-heap-limit=max_count`. Silence means the kernel killed you; a fatal error means V8 did. The whole goal of sizing is to convert the first into the second.

### The arithmetic

Container RSS is more than the old-space heap. Budget:

| Component | Rough size |
|---|---|
| V8 old space | `--max-old-space-size` (MiB) |
| V8 young generation | ~3 × `--max-semi-space-size`; defaults below 16 MiB on 64-bit for limits up to 2 GiB |
| Node + V8 baseline, code, ICU data | ~40–80 MiB |
| External / off-heap: `Buffer`s, TLS, zlib contexts | Workload-dependent, **not** counted against the old-space limit |
| Thread stacks: libuv pool (`UV_THREADPOOL_SIZE`, default 4) + V8 pool | A few MiB each |
| glibc `malloc` fragmentation | Real: `process.md` notes sustained `rss` growth with stable `heapTotal` on glibc |

So: **`--max-old-space-size` ≈ 65–75% of the container limit** for a typical JSON HTTP service, lower if you move large `Buffer`s. Node's own documentation uses the same ratio in its example — "on a machine with 2 GiB of memory, consider setting this to 1536." Worked values:

| Container limit | `--max-old-space-size` | Headroom for everything else |
|---|---|---|
| 256 MiB | 160 | 96 MiB |
| 512 MiB | 350 | 162 MiB |
| 1 GiB | 700 | 324 MiB |
| 2 GiB | 1536 | 512 MiB |
| 4 GiB | 3000 | 1 GiB |

Set it through `NODE_OPTIONS` so the same image works at several sizes:

```bash
NODE_OPTIONS=--max-old-space-size=350
```

`--max-old-space-size-percentage=<1..100>` sets the limit as a percentage of available system memory and takes precedence over `--max-old-space-size` when both are given. It is convenient, but note what it is a percentage *of*: system memory. Verify at runtime, in the actual container, before trusting it — and note the documentation's warning that it may be unreliable on 32-bit platforms.

### Verify it, do not assume it

Log this once at boot and you will never guess again:

```mjs
// src/platform/memory-check.js
import v8 from 'node:v8';
import os from 'node:os';
import process from 'node:process';

export function describeLimits() {
  const mib = (bytes) => Math.round(bytes / 1024 / 1024);
  const constrained = process.constrainedMemory(); // 0 when unknown
  const heapLimit = v8.getHeapStatistics().heap_size_limit;

  return {
    cgroupLimitMiB: constrained === 0 ? null : mib(constrained),
    availableMiB: mib(process.availableMemory()),
    v8HeapLimitMiB: mib(heapLimit),
    totalSystemMiB: mib(os.totalmem()),
    availableParallelism: os.availableParallelism(),
    uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? '4 (default)',
  };
}
```

`process.constrainedMemory()` (stable since v24.0.0/v22.16.0) returns the OS-imposed limit in bytes, or `0` if there is no such constraint or it is unknown. `process.availableMemory()` (stable since v24.0.0/v22.16.0) returns free memory still available to the process. If `v8HeapLimitMiB` is anywhere near or above `cgroupLimitMiB`, you are one traffic spike from an `OOMKilled`.

## CPU limits and thread pools

A CPU *quota* — `--cpus=0.5`, a Kubernetes `limits.cpu: 500m` — throttles you, it does not hide cores. Node still sees the host's CPUs, and several pools are sized from that number.

`os.availableParallelism()` (added v19.4.0/v18.14.0) returns "an estimate of the default amount of parallelism a program should use," wrapping libuv's `uv_available_parallelism()`. It always returns at least 1. Node's own documentation for `--v8-pool-size` puts the caveat plainly: parallelism "in general it's the same as the amount of CPUs, but it may diverge in environments such as VMs or containers." So do not assume — log it, in the container, at the size you actually deploy.

What to do with the number:

- **Worker threads and cluster workers.** Size these from `os.availableParallelism()`, not `os.cpus().length` — the docs recommend `availableParallelism()` for exactly this purpose. Then floor the result against your quota: four workers under a 1-CPU quota just adds context switching and four times the baseline memory.
- **`UV_THREADPOOL_SIZE`.** Default is 4. The libuv thread pool serves all `fs` APIs (except watchers and explicit sync calls), `dns.lookup()`, all `zlib` APIs (except sync ones), and the async crypto APIs — `pbkdf2`, `scrypt`, `randomBytes`, `randomFill`, `generateKeyPair`. Because the pool is fixed-size, one slow operation degrades every unrelated one. If you do heavy `zlib` or `scrypt` work, raise it. **It must be set in the environment before the process starts** — the documentation warns that setting `process.env.UV_THREADPOOL_SIZE` from inside the process is not guaranteed to work, because the pool is created during runtime initialisation, long before your code runs.
- **`--v8-pool-size=num`.** V8's background job pool. Setting it to `0` lets Node pick based on estimated parallelism. Under a tight quota, a smaller value reduces contention.

The failure mode is subtle: nothing errors. You just see p99 latency that is much worse than p50 and CPU throttling metrics climbing, because more runnable threads than your quota allows means every one of them gets throttled.

## Health checks: three questions, three probes

| Probe | Question | Should check | On failure |
|---|---|---|---|
| **Startup** | "Has boot finished?" | Nothing; return 200 once `listen` succeeded | Keep waiting, then give up |
| **Liveness** | "Is this process unrecoverable?" | **Nothing external.** Return 200. | Restart the container |
| **Readiness** | "Send traffic now?" | Draining flag, plus a cheap cached dependency check | Remove from load balancer |

The startup probe exists so you can be patient about boot without being patient about hangs. Give it a generous budget; keep liveness's timeout short. Without it, a liveness probe tight enough to catch a wedged process will also kill a slow-starting one, and you will end up with a restart loop that looks like a crash.

Liveness must not touch the database. If it does, a 30-second database failover fails liveness on every replica at once and the orchestrator restarts all of them — adding a cold-start stampede to an already-degraded dependency. Restarting your process does not repair someone else's outage. Readiness is where dependency state belongs, because removing a replica from rotation is reversible and cheap.

Chapter 59 has the implementation, including the `draining` flag readiness must respect.

## Zero-downtime deploys

A rolling update overlaps old and new replicas. Whether that is seamless depends entirely on how the old ones stop. The sequence that works:

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant P as Pod (old)
    participant LB as Load balancer
    O->>P: SIGTERM
    P->>P: draining = true
    LB->>P: GET /readyz
    P-->>LB: 503
    LB->>LB: remove from pool
    Note over P: keep serving in-flight work
    P->>P: server.close() + closeIdleConnections()
    Note over P: wait for in-flight to finish
    P->>P: closeAllConnections(); exit 0
```

Three things make or break it.

**Fail readiness before you stop listening.** Endpoint propagation is eventually consistent: the load balancer needs a probe interval or two to notice. Close the listener in the same tick as flipping readiness and every request routed in that window gets a connection error. Sleep for two probe intervals between the two steps.

**Drain keep-alive connections deliberately.** `server.close()` stops accepting new connections but waits for existing ones — and an idle keep-alive socket is an existing connection. `server.keepAliveTimeout` now defaults to **65000 ms** (raised from 5 seconds), so `server.close()` alone can take over a minute. Use `server.closeIdleConnections()` to drop sockets with no in-flight request, then `server.closeAllConnections()` as a last resort after a grace period.

**Mind the client side of keep-alive.** A client agent holding a pooled connection to a server that is about to close it can lose a request in the race between "server closes idle socket" and "client writes a new request on it." Node addresses this with `server.keepAliveTimeoutBuffer` (added v24.6.0/v22.19.0, default **1000 ms**), which extends the internal socket timeout past the advertised keep-alive timeout specifically to reduce `ECONNRESET` errors. Keep your upstream proxy's idle timeout *lower* than your server's `keepAliveTimeout` so the proxy, which knows it has no in-flight request, is the side that closes. See [Chapter 36 — HTTP Clients, Agents, and Keep-Alive](../part5-networking/36-http-clients.md).

Set the orchestrator's termination grace period to comfortably exceed your drain delay plus your longest expected request. If your grace period is 30 seconds and your drain delay is 25, you have 5 seconds for real work.

## Process managers

| Manager | Use it when | Watch out for |
|---|---|---|
| **Container orchestrator** (Kubernetes, ECS, Nomad) | You already have one | It is the process manager. Do not run a second one inside. |
| **systemd** | A VM or bare metal, one service per host | Set `Restart=on-failure`, `TimeoutStopSec` above your drain time, and a `MemoryMax` you have sized |
| **pm2 / cluster manager** | A single VM where you want multiple workers and zero-downtime reload without a load balancer | Adds a supervisor process, its own logging, and a second lifecycle to reason about |
| **`node` directly** | Inside a container | Nothing — this is the goal |

**The argument for one process per container** is that a container is already a supervised, restartable, resource-limited unit with health checks, log collection, and rolling updates. Running a supervisor inside it duplicates all of that, badly: the orchestrator's health check now measures the supervisor, not your app; a worker crash is invisible because the supervisor restarts it and the pod stays "healthy"; memory limits apply to the group, so one leaking worker OOM-kills all of them; and `SIGTERM` handling now has two layers to traverse.

The exception people cite is CPU utilisation — one Node process uses one core. The orchestrator's answer is to run N replicas of a one-core container, which gives you the same parallelism with independent health, independent limits, and independent rollout. Use `node:cluster` (Chapter 30) when you are managing your own VM; use replicas when you have a scheduler.

## Startup time

Cold start matters for autoscaling, for rolling deploys, and for anything serverless. Three levers, in order of effort.

### The module compile cache

`NODE_COMPILE_CACHE=dir` (added v22.1.0; no longer experimental as of v25.4.0/v24.15.0) persists V8 code cache to disk, so subsequent runs skip recompiling unchanged modules. It covers CommonJS, ESM, and TypeScript modules. The first run is slightly slower; later runs of the same module graph can be significantly faster.

```bash
NODE_COMPILE_CACHE=/tmp/node-compile-cache node dist/main.js
```

Or programmatically, as the very first thing your entrypoint does:

```mjs
import module from 'node:module';

const { status, directory, message } = module.enableCompileCache();
if (status === module.constants.compileCacheStatus.FAILED) {
  console.warn(`compile cache disabled: ${message}`);
}
```

`module.enableCompileCache([options])` takes `directory` and `portable`; with no `directory` it uses `NODE_COMPILE_CACHE` if set, otherwise `path.join(os.tmpdir(), 'node-compile-cache')`. It returns a `status` from `module.constants.compileCacheStatus` — `ENABLED`, `ALREADY_ENABLED`, `FAILED`, or `DISABLED` (the last meaning `NODE_DISABLE_COMPILE_CACHE=1` was set).

Four operational facts:

- The cache is **written when the process is about to exit**, not as modules load. To share it between processes earlier, call `module.flushCompileCache()`.
- It is **only reusable within the same Node version** — different versions are stored separately under the same base directory, so they can coexist.
- By default it **invalidates when module absolute paths change**. Set `NODE_COMPILE_CACHE_PORTABLE=1` (or `{ portable: true }`) if the project directory can move — which is exactly what happens if you warm the cache at build time and copy it into a different path in the runtime image.
- Turn it off with `NODE_DISABLE_COMPILE_CACHE=1` when collecting V8 code coverage: the docs note coverage is less precise in functions deserialised from the cache.

The container recipe: run the app once during the build so the cache populates, copy the cache directory into the runtime image, and set `NODE_COMPILE_CACHE` to it plus `NODE_COMPILE_CACHE_PORTABLE=1`. If the runtime filesystem is read-only, that pre-warmed cache still works for reads.

### Startup snapshots

`node --snapshot-blob snapshot.blob --build-snapshot entry.js` runs `entry.js`, snapshots the heap when the process exits, and writes a blob you load later with `node --snapshot-blob snapshot.blob index.js`. The snapshot building process is no longer experimental as of v25.4.0/v24.13.1.

Snapshots are the biggest win and the biggest constraint. The documented limits:

- The build process supports **a single entrypoint**, which may load built-in modules but **not additional user-land modules** — bundle your application into one script first.
- Only a subset of built-in modules is well-tested as serializable. Hitting one that is not "may crash the snapshot building process."
- The workaround is to defer that module to runtime with `v8.startupSnapshot.setDeserializeMainFunction()` or `addDeserializeCallback()`.

Snapshots are worth it for CLI tools and serverless handlers where milliseconds of startup are the product. For a long-lived HTTP server they usually are not — you pay the bundling constraint forever to save a few hundred milliseconds once per deploy.

### Lazy loading

Free and underused: move rarely-executed heavy dependencies behind `await import()` so they are not in the boot path. A PDF generator used by one admin endpoint, a CSV exporter, a migration library — each is parse, compile, and evaluate time on every cold start. Measure first: `--cpu-prof` on a startup-only run tells you which module graphs actually cost you.

## Immutable artefacts, build once, deploy many

The rule: **an image is built once and promoted unchanged through every environment.** Staging and production run the same bytes; only the injected configuration differs.

What follows from it:

- **Tag by commit SHA, not by environment.** `myservice:9f3c1a` is promotable. `myservice:staging` is a mutable pointer, and "which build is in staging?" becomes unanswerable.
- **Never rebuild to deploy.** A rebuild is a new artefact with new dependency resolution. If staging passed and you rebuild for production, you tested something else.
- **Configuration is injected at run time**, never baked in. If the only way to promote is to rebuild with different values, the artefact is not immutable.
- **Rollback is redeploying a previous tag**, which must therefore still exist and still be pullable.
- **Record provenance.** Bake the commit SHA and build timestamp into the image as labels and expose them on a `/version` endpoint. During an incident, "which build is this" should take three seconds.

## A deployment checklist

**Build**

- [ ] Lockfile committed; `npm ci` (never `npm install`) in the Dockerfile.
- [ ] Multi-stage build; runtime stage installs with `--omit=dev`.
- [ ] `COPY package*.json` before `COPY . .` so the dependency layer caches.
- [ ] Base image pinned to a minor version or a digest.
- [ ] Image tagged by commit SHA; version and commit exposed at runtime.

**Runtime**

- [ ] `CMD ["node", "dist/main.js"]` — exec form, no shell, no `npm`.
- [ ] `USER node` (or `nonroot`); read-only root filesystem; capabilities dropped.
- [ ] `NODE_ENV=production` set; no application logic branches on it.
- [ ] `--max-old-space-size` set to ~70% of the container memory limit, via `NODE_OPTIONS`.
- [ ] `--enable-source-maps` if you ship compiled output.
- [ ] Boot log line reporting `constrainedMemory()`, V8 heap limit, and `availableParallelism()`.
- [ ] `UV_THREADPOOL_SIZE` reviewed if you do heavy `fs`, `zlib`, or async crypto.

**Configuration**

- [ ] Config validated at boot; process exits non-zero with all errors on failure.
- [ ] No `.env` file in the image; secrets mounted, not baked.
- [ ] Every Node flag you rely on confirmed to be allowed in `NODE_OPTIONS`.

**Lifecycle**

- [ ] `SIGTERM` handler flips readiness, waits, closes the listener, drains, exits 0.
- [ ] Termination grace period > drain delay + longest request.
- [ ] Separate startup, liveness, and readiness probes; liveness checks nothing external.
- [ ] Upstream proxy idle timeout below `server.keepAliveTimeout`.
- [ ] Logs are JSON lines on stdout; nothing writes to a file in the image.
- [ ] `--report-on-fatalerror` and `--report-uncaught-exception` enabled, with `--report-dir` on a mounted volume.

## Common mistakes

### ❌ `npm install` in the Dockerfile

```dockerfile
COPY . .
RUN npm install          # ❌ resolves fresh; may rewrite the lockfile; no caching
```

Two bugs in three lines. `npm install` treats the lockfile as advisory, so the image may contain dependency versions nobody tested, and any lockfile change it makes is written inside the image and thrown away. And because `COPY . .` precedes it, the layer is invalidated by every source edit, so you re-resolve the whole tree on every build.

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci --omit=dev    # ✅ lockfile is the spec; layer keyed on the lockfile only
COPY . .
```

### ❌ Letting V8 size its own heap in a container

```yaml
resources:
  limits:
    memory: 512Mi        # ❌ nothing tells V8 about this
```

V8 sizes its default heap from the machine, not the cgroup, so it will grow past 512 MiB and the kernel will `SIGKILL` the process. You get exit code 137, status `OOMKilled`, and no stack trace, because `SIGKILL` cannot be caught. The bug is invisible in logs and looks like a random crash.

```yaml
env:
  - name: NODE_OPTIONS
    value: "--max-old-space-size=350"   # ✅ ~70% of 512Mi
resources:
  limits:
    memory: 512Mi
```

Now V8 hits its own limit first and you get `FATAL ERROR: ... JavaScript heap out of memory` with a trace — and can add `--heapsnapshot-near-heap-limit=1` to capture a snapshot on the way down.

### ❌ Wrapping the entrypoint in a shell or `npm`

```dockerfile
CMD npm start            # ❌ /bin/sh is PID 1; SIGTERM never reaches node
```

The orchestrator sends `SIGTERM` to PID 1. A shell in non-interactive mode does not forward it to its child, so Node never runs its shutdown handler, the grace period elapses, and everything dies by `SIGKILL` — cutting in-flight requests. The symptom is that every pod takes exactly the grace period to terminate.

```dockerfile
CMD ["node", "dist/main.js"]   # ✅ exec form; node is PID 1
```

If you need pre-start work, do it in a separate init container or an `ENTRYPOINT` script that ends in `exec node dist/main.js` — `exec` replaces the shell rather than leaving it in the middle.

### ❌ Sizing worker pools from the host's CPU count

```mjs
import cluster from 'node:cluster';
import os from 'node:os';
for (let i = 0; i < os.cpus().length; i++) cluster.fork(); // ❌ 64 on a 1-CPU quota
```

Under a CPU quota, `os.cpus().length` reports the host's cores, not your share. Sixty-four workers on a 500m quota means 64× the baseline memory (which will OOM the container) and constant throttling. Nothing errors; p99 latency just collapses.

```mjs
import cluster from 'node:cluster';
import os from 'node:os';

const requested = Number(process.env.WORKER_COUNT ?? 0);
const workers = requested > 0 ? requested : Math.min(os.availableParallelism(), 4);
for (let i = 0; i < workers; i++) cluster.fork(); // ✅ bounded and overridable
```

## Production notes

- **Log the environment at boot, once.** Node version, commit SHA, `process.constrainedMemory()`, `v8.getHeapStatistics().heap_size_limit`, `os.availableParallelism()`, and `UV_THREADPOOL_SIZE`. Every memory and CPU incident starts with someone guessing at these numbers; make the first log line answer them.
- **Watch for RSS growth with a stable heap.** Node's own documentation calls this out: on glibc systems, `rss` can grow steadily while `heapTotal` stays flat, due to `malloc` fragmentation rather than a JavaScript leap. Before hunting a leak in your code, compare `process.memoryUsage().rss` against `heapUsed` over time — if only `rss` climbs, the fix is an allocator or a lower `--max-old-space-size`, not a heap snapshot.
- **Enable diagnostic reports in production.** `--report-on-fatalerror` and `--report-uncaught-exception` write a JSON report containing the environment, resource usage, loaded libraries, and stacks — often the only artefact from a crash you cannot reproduce. Write it to a mounted volume, and note `--report-exclude-env` and `--report-exclude-network` exist if the report would otherwise capture secrets. See [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md).
- **Test the shutdown path in CI, not in production.** Start the container, send a request, send `SIGTERM` mid-flight, assert the response completes and the exit code is 0. This is a ten-line test that catches the shell-form-`CMD` bug, the missing signal handler, and the keep-alive drain problem — all three of which are otherwise discovered during a deploy.
- **Pin the Node minor version and rebuild on security releases.** Node ships security releases on a schedule; a floating `node:24` tag means your dependency graph changes without a commit. Pin it, subscribe to the security stream, and treat a Node bump as a normal PR.
- **`NODE_TLS_REJECT_UNAUTHORIZED=0` must never reach production.** The documentation calls it "strongly discouraged," and it disables certificate validation for all TLS. If you have a private CA, the correct tools are `NODE_EXTRA_CA_CERTS=file` (read once at launch — changing it at runtime has no effect) or `--use-system-ca`/`NODE_USE_SYSTEM_CA=1`. Add a boot-time assertion that the variable is unset when `NODE_ENV=production`.

## Exercises

1. **Prove the layer cache works.** Write a two-stage Dockerfile for a small service. Build it, change one line of source, rebuild. *Success criterion:* the second build reuses the `npm ci` layer, and the build log shows `CACHED` for it.

2. **Find your real limits.** Run your image with a 256 MiB memory limit and a 500m CPU limit, and log `process.constrainedMemory()`, `v8.getHeapStatistics().heap_size_limit`, and `os.availableParallelism()`. *Success criterion:* you can state whether V8's default heap limit exceeds the container limit, with numbers.

3. **Reproduce and then fix an `OOMKilled`.** Run a script that appends to an array in a loop, in a container with a 256 MiB limit and no `--max-old-space-size`. Then set the flag to 160 and run it again. *Success criterion:* the first run exits 137 with no message; the second prints a V8 fatal heap error.

4. **Prove signals reach Node.** Build one image with `CMD npm start` and one with `CMD ["node", "src/main.js"]`, each logging on `SIGTERM`. Stop each with a 10-second timeout. *Success criterion:* the first takes the full timeout and logs nothing; the second exits immediately having logged.

5. **Measure the compile cache.** Time three cold starts of your service without `NODE_COMPILE_CACHE`, then three with it pointing at a warm directory. *Success criterion:* a reported median startup delta, plus the `status` value returned by `module.enableCompileCache()`.

## Recap

- Twelve-factor mostly holds for Node. Config-in-environment, explicit dependencies, disposability, and build/release/run separation are load-bearing; the admin-process and concurrency factors are not worth following literally.
- `--env-file` loads dotenv files before your code runs. Real environment variables beat file values, later files beat earlier ones, and `--env-file` is *not* allowed inside `NODE_OPTIONS`.
- `NODE_OPTIONS` accepts only an allow-listed set of flags and rejects script files. Command-line options override singleton flags from it and compound with repeatable ones.
- `NODE_ENV` appears nowhere in Node's own documentation. Set it to `production` at runtime for the ecosystem's benefit, and never branch your own code on it.
- Commit the lockfile and use `npm ci --omit=dev`. `npm install` in a Dockerfile can resolve untested versions and rewrite the lockfile invisibly.
- Multi-stage builds, `COPY package*.json` before the source, a pinned `-slim` or distroless base, `USER node`, a read-only root filesystem, and exec-form `CMD ["node", ...]` so Node is PID 1 and gets `SIGTERM`.
- V8 does not see the cgroup limit. Set `--max-old-space-size` to roughly 70% of the container limit, or the kernel `SIGKILL`s you with exit 137 and no stack. Verify with `process.constrainedMemory()` versus `v8.getHeapStatistics().heap_size_limit`.
- Under a CPU quota, size pools from `os.availableParallelism()` and set `UV_THREADPOOL_SIZE` in the environment before start. Separate startup, liveness, and readiness probes; drain keep-alive connections deliberately; and build the image once, promote it unchanged.

## Where to go next

- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](../part4-system/26-signals-and-shutdown.md) — the shutdown handler this chapter assumes.
- [Chapter 30 — Cluster and Multi-Process Scaling](../part4-system/30-cluster.md) — when in-process workers beat replicas.
- [Chapter 36 — HTTP Clients, Agents, and Keep-Alive](../part5-networking/36-http-clients.md) — the client half of connection draining.
- [Chapter 59 — Application Architecture and Project Layout](59-application-architecture.md) — the config object and health endpoints deployed here.
- [Chapter 61 — Performance Tuning](61-performance-tuning.md) and [Chapter 62 — Observability in Production](62-observability.md) — what to do once it is running.
- Official docs: <https://nodejs.org/docs/latest/api/cli.html> and <https://nodejs.org/docs/latest/api/process.html>
