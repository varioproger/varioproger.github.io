---
chapter: 8
part: "Part I — Foundations"
title: "Globals and the Runtime Environment"
level: beginner
reading_time: "28 min"
prerequisites: [4, 5]
source_docs:
  - "doc/api/globals.md"
  - "doc/api/environment_variables.md"
  - "doc/api/cli.md"
  - "doc/api/process.md"
source_url: "https://nodejs.org/docs/latest/api/globals.html"
node_baseline: "27.0.0-pre"
---

# Chapter 8 — Globals and the Runtime Environment

## What you will learn

- Distinguish real globals from the CommonJS pseudo-globals that only look global.
- Use the Web-standard APIs Node ships — `fetch`, `URL`, `AbortController`, `structuredClone`, `crypto`, and the rest — and know which are stable.
- Read and write `process.env` correctly, including its string-only semantics and Windows case behaviour.
- Load `.env` files with `--env-file`, `--env-file-if-exists`, and `process.loadEnvFile()`.
- Name the environment variables that actually change how Node runs, and explain why `NODE_ENV` is not one of them.

## Why this matters

Node's global namespace has changed more in the last five years than in the decade before it. `fetch`, `AbortController`, `structuredClone`, `WebSocket`, and Web Crypto are all built in now. Code that once needed `node-fetch`, `abort-controller`, and `ws` needs none of them. Knowing what is already there is the cheapest dependency reduction available to you, and every dependency you delete is one you no longer have to audit, patch, or explain to a security scanner.

The environment half matters for a different reason: it is where configuration meets deployment, and where the mistakes are operational rather than logical. `process.env.PORT` is the string `"3000"`, not the number `3000`. `process.env.DEBUG_MODE` set to `"false"` is truthy. On Windows, `process.env.Path` and `process.env.PATH` are the same variable — but not inside a worker thread. `NODE_ENV=production` does nothing to Node itself. Each of these has caused production incidents, and each is avoidable once you know the rule.

## `globalThis` and what is on it

`globalThis` is the standard reference to the global object, available since ES2020. Use it. Node's older `global` is **[Legacy]** — it still works, and it is the same object, but new code should not use it.

Node's top-level scope is *not* the global scope. A `var` at the top of a module is local to that module, in CommonJS and in ESM alike. This differs from a browser script and is one of the better decisions in Node's design.

```js
var localOnly = 1;
console.log(globalThis.localOnly); // undefined
```

To create an actual global you must assign to `globalThis` explicitly — which you should almost never do. Globals defeat module encapsulation, break under worker threads (each thread has its own global object), and turn load order into a correctness requirement. The two defensible uses are polyfilling a missing standard API and installing test hooks.

### The CommonJS pseudo-globals

These five look global and are not. They are parameters of the CommonJS module wrapper function, which means they exist only in CommonJS files and are absent in ES modules:

| Pseudo-global | ESM replacement |
|---|---|
| `__dirname` | `import.meta.dirname` |
| `__filename` | `import.meta.filename` |
| `exports` | `export` statements |
| `module` | `export` statements |
| `require()` | `import`, `import()`, or `module.createRequire()` |

You will not find them on `globalThis` in either module system. Chapter 5 covers the ESM equivalents in detail.

## The Web-standard globals

Node has adopted a large surface of Web platform APIs. The page-level stability of `globals` is **2 – Stable**, so anything without its own stability note below is stable.

### Networking and HTTP

| Global | Since | Notes |
|---|---|---|
| `fetch` | v17.5.0 / v16.15.0 | Non-experimental since v21.0.0; built on undici |
| `Headers`, `Request`, `Response` | v17.5.0 / v16.15.0 | The `fetch` companion classes |
| `FormData` | v17.6.0 / v16.15.0 | |
| `Blob` | v18.0.0 | |
| `File` | v20.0.0 | |
| `WebSocket` | v21.0.0 / v20.10.0 | Non-experimental since v22.4.0; disable with `--no-experimental-websocket` |
| `EventSource` | v22.3.0 / v20.18.0 | **[Experimental]** — needs `--experimental-eventsource` |

```mjs
const res = await fetch('https://registry.npmjs.org/express', {
  signal: AbortSignal.timeout(5000),
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const { 'dist-tags': tags } = await res.json();
console.log(tags.latest);
```

`fetch` is undici under the hood; `process.versions.undici` tells you which version. Requests accept a `dispatcher` option for connection-pool control, and `setGlobalDispatcher()` from the `undici` package changes the default for both `fetch` and undici itself. Chapter 36 covers pooling and keep-alive.

### Cancellation and events

| Global | Since | Notes |
|---|---|---|
| `AbortController`, `AbortSignal` | v15.0.0 / v14.17.0 | |
| `Event`, `EventTarget` | v15.0.0 | |
| `CustomEvent` | v18.7.0 / v16.17.0 | |
| `CloseEvent` | v23.0.0 | |
| `ErrorEvent` | v25.0.0 | |
| `MessageChannel`, `MessagePort`, `MessageEvent` | v15.0.0 | |
| `BroadcastChannel` | v18.0.0 | |

`AbortSignal` has three static helpers that remove a lot of boilerplate: `AbortSignal.abort([reason])` for an already-aborted signal, `AbortSignal.timeout(delay)` for a deadline, and `AbortSignal.any(signals)` to combine several. Nearly every modern Node async API accepts a `signal` option. Chapter 13 covers cancellation properly.

### Data, encoding, and time

| Global | Since | Notes |
|---|---|---|
| `URL`, `URLSearchParams` | v10.0.0 | |
| `URLPattern` | v24.0.0 | **[Experimental]** |
| `TextEncoder`, `TextDecoder` | v11.0.0 | |
| `structuredClone` | v17.0.0 | Deep clone with cycles and transfer support |
| `atob`, `btoa` | v16.0.0 | **[Legacy]** — use `Buffer` instead |
| `performance` | v16.0.0 | High-resolution timing and the User Timing API |
| `queueMicrotask` | v11.0.0 | |
| `crypto`, `Crypto`, `CryptoKey`, `SubtleCrypto` | v17.6.0 / v16.15.0 | Non-experimental since v23.0.0; absent if built without `node:crypto` |
| `DOMException` | v17.0.0 | |
| `Buffer` | v0.1.103 | Node-specific |

`structuredClone` is the correct deep clone. It handles cycles, `Map`, `Set`, `Date`, `RegExp`, typed arrays, and `Error` objects — everything `JSON.parse(JSON.stringify(x))` silently corrupts. It throws `DataCloneError` on functions, class instances with custom prototypes, and DOM-like objects.

```js
const original = { at: new Date(), tags: new Set(['a']), self: null };
original.self = original;
const copy = structuredClone(original); // works; JSON round-trip does not
```

`atob`/`btoa` are **[Legacy]**. Use `Buffer.from(data, 'base64')` and `buf.toString('base64')`, which handle binary data correctly. Node ships an automated migration: `npx codemod@latest @nodejs/buffer-atob-btoa`.

`queueMicrotask` schedules a callback on V8's microtask queue. It is the standards-based alternative to `process.nextTick()`, and it runs *after* the nextTick queue in each turn of the loop. Prefer it for "make this callback consistently async" — Chapter 9 explains the ordering.

### Web Streams

`ReadableStream`, `WritableStream`, `TransformStream`, their controller and reader classes, `ByteLengthQueuingStrategy`, `CountQueuingStrategy`, `TextEncoderStream`, `TextDecoderStream`, `CompressionStream`, and `DecompressionStream` all arrived as globals in v18.0.0. Chapter 20 covers them and their interop with Node's own streams.

### `navigator` and Web Storage

`navigator` and `Navigator` (v21.0.0) are **stability 1.1 – Active development**, disabled with `--no-experimental-global-navigator`. Available properties: `hardwareConcurrency`, `language`, `languages`, `platform`, `userAgent` (returns e.g. `"Node.js/21"`), and `locks` (v24.5.0, **[Experimental]**) for a `LockManager` that coordinates across worker threads in the same process.

`localStorage`, `sessionStorage`, and `Storage` (v22.4.0) are **stability 1.2 – Release candidate**, disabled with `--no-experimental-webstorage`. Read the caveats before reaching for them: data is stored **unencrypted** in the file named by `--localstorage-file`, capped at 10 MB, and since v26.0.0 accessing `localStorage` without that flag throws a `DOMException`. Critically, storage is **process-wide, not per user or per request** — using it in a server means every request shares one namespace. It is a compatibility shim for browser-targeted code, not a server-side store.

`Worker` (**[Experimental]**, `--experimental-web-worker`) implements the HTML Web Workers API on top of `node:worker_threads`. For server code, use `node:worker_threads` directly (Chapter 29).

## `process.env`

`process.env` is an object populated from the OS environment at startup. Four rules govern it, and all four bite.

**1. Everything is a string.** There are no numbers, no booleans, no null. `PORT=3000` gives you `"3000"`.

```js
const port = Number(process.env.PORT ?? 3000);
const debug = process.env.DEBUG === '1';
```

The `"false"` trap follows directly: `Boolean("false")` is `true`. Never test an env var for truthiness when it holds a boolean-ish value.

**2. Assignment coerces, and that coercion is deprecated.** Assigning a non-string implicitly converts it. `env.X = null` yields the string `'null'`; `env.X = undefined` yields `'undefined'`. This behaviour is deprecated and future versions may throw for non-string, non-number, non-boolean values. Assign strings.

**3. Mutation is process-local.** Changes are visible inside the process but never propagate to the parent, and — unless you pass `env` to the `Worker` constructor — not to worker threads either. Each worker gets its own copy of the parent's `process.env` at creation. Only the main thread can make changes visible to the OS or to native addons.

```bash
node -e 'process.env.foo = "bar"' && echo $foo   # prints nothing
```

`delete process.env.X` works and removes the variable.

**4. Windows is case-insensitive.** On Windows, `process.env.TEST` and `process.env.test` are the same variable. On POSIX they are two different variables. Code that reads `process.env.Path` works on Windows and returns `undefined` on Linux. Always write the canonical uppercase name.

The subtlety: a worker thread's copy of `process.env` on Windows is **case-sensitive**, unlike the main thread's. Code that relies on case-insensitive lookup can behave differently inside a worker.

### Reading configuration safely

Centralise environment access in one module, validate at startup, and export typed values. Never scatter `process.env` reads through your codebase — they are impossible to audit and they fail at the worst moment.

```mjs
// config.js
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = Object.freeze({
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  enableTracing: process.env.ENABLE_TRACING === '1',
});
```

Importing this module fails loudly at boot if configuration is wrong. That is exactly what you want: a container that refuses to start is far better than one that serves errors.

## `.env` files

Node reads dotenv files natively. `--env-file` (v20.6.0, non-experimental since v24.10.0 / v22.21.0) loads one; `--env-file-if-exists` (v22.9.0) does the same but tolerates a missing file. Both are repeatable, and later files override earlier ones.

```bash
node --env-file=.env --env-file-if-exists=.env.local server.js
```

**Real environment variables always win over file values.** That is the right precedence for containers: the image ships defaults in a `.env`, and the orchestrator overrides them.

Node defines its own dotenv format, since there is no standard:

| Rule | Detail |
|---|---|
| Variable names | Must match `^[a-zA-Z_]+[a-zA-Z0-9_]*$` — letters, digits, underscores; no leading digit |
| Values | Arbitrary text, optionally in `'` or `"` quotes |
| Multi-line | Only inside quotes |
| Whitespace | Trimmed around keys and values unless quoted |
| Comments | `#` to end of line, unless inside quotes |
| `export` prefix | Accepted and ignored, so the file can also be `source`d in a shell |
| Types | Everything is a string — `0`, `true`, and `{"a":1}` all arrive as text |

```text
# Service configuration
export PORT = 3000
DATABASE_URL = "postgres://user:pass@localhost:5432/app?ssl=true"
GREETING = 'contains a # and stays intact'
PRIVATE_KEY = "-----BEGIN KEY-----
line two
-----END KEY-----"
```

Node-configuring variables inside the file are honoured — notably `NODE_OPTIONS`, which is parsed and applied when it comes from `--env-file`.

Two programmatic APIs cover the rest:

```mjs
import { loadEnvFile } from 'node:process';
import { parseEnv } from 'node:util';

loadEnvFile();                       // defaults to './.env'
loadEnvFile('./config/.env.test');   // throws if missing

const parsed = parseEnv('HELLO=world\nHELLO=oh my\n'); // { HELLO: 'oh my' }
```

Both are non-experimental since v24.10.0 / v22.21.0. `loadEnvFile()` mutates `process.env`; `parseEnv()` is pure and just returns an object — useful for validating a file without applying it. Note that `NODE_OPTIONS` inside a file loaded by `process.loadEnvFile()` has **no effect**, because the runtime has already started by then.

Never commit `.env` files containing secrets. Commit a `.env.example` with the keys and dummy values.

## `NODE_ENV` is a convention, not a feature

Node does not read `NODE_ENV`. It appears nowhere in the runtime's behaviour: no optimisations, no logging changes, no different code paths. Setting `NODE_ENV=production` changes nothing about Node itself.

The convention exists because Express and npm popularised it, and much of the ecosystem now branches on it. That has two consequences. First, if you rely on it, *you* must implement the behaviour — Node will not. Second, since libraries branch on the exact string `"production"`, a typo like `"Production"` or `"prod"` silently selects development behaviour, including verbose error pages that leak stack traces.

Node's own equivalent is the `--conditions` flag (Chapter 6), which selects different module entry points at resolution time:

```bash
node --conditions=production server.js
```

That is a real runtime mechanism with a real effect. `NODE_ENV` is a string other people's code happens to look at.

## Environment variables that change Node's behaviour

These are the ones that genuinely alter the runtime.

| Variable | Effect |
|---|---|
| `NODE_OPTIONS` | Space-separated CLI options applied before command-line flags. Only options allowed in the environment; `-p` and a script path are rejected. |
| `NODE_PATH` | Extra directories for CommonJS resolution (`:`-separated; `;` on Windows). **Ignored by ESM.** |
| `NODE_EXTRA_CA_CERTS` | Additional trusted CA certificates from a file |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Set to `0` to disable TLS certificate validation. Never in production. |
| `NODE_USE_SYSTEM_CA=1` | Trust the OS certificate store (v24.6.0 / v22.19.0) |
| `NODE_USE_ENV_PROXY=1` | Honour `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` (v24.0.0 / v22.21.0, stability 1.1) |
| `NODE_COMPILE_CACHE=dir` | On-disk compile cache (v22.1.0; non-experimental since v25.4.0 / v24.15.0) |
| `NODE_DISABLE_COMPILE_CACHE=1` | Turn the compile cache off |
| `NODE_V8_COVERAGE=dir` | Write V8 coverage JSON; propagates to child processes |
| `NODE_DEBUG=module[,…]` | Debug logging from named core modules |
| `NODE_NO_WARNINGS=1` | Silence process warnings |
| `NODE_PENDING_DEPRECATION=1` | Emit pending deprecation warnings |
| `NODE_REDIRECT_WARNINGS=file` | Append warnings to a file instead of stderr |
| `NODE_PRESERVE_SYMLINKS=1` | Do not resolve symlinks during module resolution |
| `UV_THREADPOOL_SIZE=n` | libuv threadpool size — used by `fs`, `dns.lookup()`, `zlib`, and async crypto |
| `TZ` | Process timezone; accepts IANA IDs such as `Europe/Paris` |
| `NO_COLOR` / `NODE_DISABLE_COLORS=1` | Disable coloured output |
| `FORCE_COLOR=[1,2,3]` | Force 16 / 256 / 16-million colour output; overrides both variables above |
| `OPENSSL_CONF`, `SSL_CERT_FILE`, `SSL_CERT_DIR` | OpenSSL configuration and trust stores |

`NODE_OPTIONS` is the one to know well. It is how you configure a runtime you do not launch directly — a `npm start` script, a container entrypoint, a test runner:

```bash
NODE_OPTIONS='--max-old-space-size=2048 --enable-source-maps' node server.js
```

Singleton flags on the command line override `NODE_OPTIONS`; repeatable flags are concatenated with `NODE_OPTIONS` instances first. Values containing spaces must be double-quoted inside the variable.

`UV_THREADPOOL_SIZE` is the one people misuse. The default is small, and the pool is shared by all filesystem operations, `dns.lookup()`, `zlib`, and CPU-bound crypto. A workload that is heavy on any of those can queue behind itself in a way that looks like unrelated latency. Raise it deliberately, and measure — more threads is not automatically faster.

## Common mistakes

### ❌ Treating an environment variable as a number

```js
const port = process.env.PORT || 3000;
server.listen(port);
```

`port` is `"3000"`, a string. `listen` happens to accept it, but `port + 1` is `"30001"` and `port === 3000` is `false`. In arithmetic it silently produces string concatenation.

```js
// ✅
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port)) throw new Error('PORT must be an integer');
```

### ❌ Treating an environment variable as a boolean

```js
if (process.env.DISABLE_CACHE) { /* runs when DISABLE_CACHE="false" */ }
```

Every non-empty string is truthy, including `"false"`, `"0"`, and `"no"`.

```js
// ✅
const disableCache = ['1', 'true', 'yes'].includes(
  (process.env.DISABLE_CACHE ?? '').toLowerCase(),
);
```

### ❌ Expecting `process.env` changes to reach a child process

```js
process.env.API_KEY = 'secret';
spawn('node', ['worker.js']); // inherits — this one works
```

That works, because `spawn` inherits the parent's environment by default. What does *not* work is the reverse, or reaching a worker thread that was created earlier, or expecting the change to survive the process. Worker threads snapshot `process.env` at construction.

```js
// ✅ be explicit
new Worker('./worker.js', { env: { ...process.env, API_KEY: 'secret' } });
```

### ❌ Using `localStorage` as a server-side store

```js
localStorage.setItem(`session:${userId}`, JSON.stringify(session));
```

Web Storage in Node is process-wide, shared across all users and all requests, capped at 10 MB, stored unencrypted on disk, and stability 1.2. Since v26.0.0 it throws a `DOMException` if `--localstorage-file` was not passed.

```js
// ✅ use a real store
await redis.set(`session:${userId}`, JSON.stringify(session), 'EX', 3600);
```

### ❌ Assuming `NODE_ENV=production` does something

Setting it does not enable optimisations, does not change error handling, and does not disable stack traces. If nothing in your code or dependencies branches on it, it is decoration.

```bash
# ✅ use mechanisms with real effects
NODE_OPTIONS='--enable-source-maps' node --conditions=production server.js
```

## Production notes

- **Validate configuration at boot and fail fast.** A process that exits at startup with `Missing required environment variable: DATABASE_URL` is diagnosed in seconds. One that starts and throws on the first request that touches the database is diagnosed in hours.
- **`NODE_TLS_REJECT_UNAUTHORIZED=0` disables certificate validation process-wide.** It is the single most dangerous variable in the table. If it appears in a Dockerfile or CI config, treat it as an incident. Use `NODE_EXTRA_CA_CERTS` or `NODE_USE_SYSTEM_CA=1` for private CAs instead.
- **Environment variables leak.** They appear in crash dumps, diagnostic reports, `/proc/<pid>/environ`, container inspect output, and any error handler that logs `process.env`. Prefer mounted secret files for high-value credentials, and never log the environment wholesale.
- **`--env-file` is for development and images, not for secrets.** Precedence favours real environment variables, so use the file for defaults and let your orchestrator inject the sensitive values.
- **Prefer built-in globals over dependencies.** `fetch`, `AbortController`, `structuredClone`, `WebSocket`, and Web Crypto replace several very widely-installed packages. Fewer dependencies means a smaller attack surface and faster installs — but check your minimum supported Node version against the tables above before removing a polyfill.
- **`UV_THREADPOOL_SIZE` is a real tuning knob.** Filesystem-heavy or `dns.lookup()`-heavy services can saturate the default pool, producing latency that looks unrelated to the work causing it. Raise it based on measurement, and remember it costs memory per thread.
- **Set `TZ` explicitly in containers.** Base images vary in their default timezone. `TZ=Etc/UTC` in the image removes a whole category of off-by-hours bugs in logs and scheduled jobs.
- **`NODE_COMPILE_CACHE` speeds up startup.** Pointing it at a writable directory that persists across runs measurably improves boot time for large applications and short-lived CLIs.

## Exercises

1. **Inventory the global namespace.** Print `Object.getOwnPropertyNames(globalThis).sort()` and classify each entry: JavaScript builtin, Web standard, or Node-specific. Then check `typeof __dirname` in an ESM file and a CJS file. Success: you can explain why the five CommonJS pseudo-globals never appear in the list.

2. **Replace three dependencies.** Take a script that uses `node-fetch`, `abort-controller`, and a deep-clone library. Rewrite it with only built-in globals, including a request timeout via `AbortSignal.timeout()`. Success: `package.json` has zero runtime dependencies and behaviour is unchanged.

3. **Build a validated config module.** Write a `config.js` that reads five variables, coerces types, applies defaults, validates ranges, and freezes the result. Make it throw a single message listing *all* problems, not just the first. Success: starting with an empty environment produces one error naming every missing variable.

4. **Exercise dotenv precedence.** Create `.env` with `PORT=3000` and `.env.local` with `PORT=4000`. Run with both `--env-file` flags in each order, then run again with `PORT=5000` set in the shell. Success: you can state which value wins in all four combinations and why.

5. **Measure the threadpool.** Write a script that issues 64 concurrent `fs.readFile` calls and records total elapsed time. Run it with `UV_THREADPOOL_SIZE` at 1, 4, 16, and 64. Success: you have a table of timings and can explain the shape of the curve, including where it stops improving.

## Recap

- Use `globalThis`; `global` is **[Legacy]**. Node's top-level scope is module scope, not global scope.
- `__dirname`, `__filename`, `exports`, `module`, and `require` are CommonJS wrapper parameters, not globals, and do not exist in ESM.
- `fetch`, `Headers`/`Request`/`Response`/`FormData`, `Blob`, `File`, `WebSocket`, `AbortController`/`AbortSignal`, `Event`/`EventTarget`, `URL`/`URLSearchParams`, `TextEncoder`/`TextDecoder`, `structuredClone`, `crypto`, `performance`, and `queueMicrotask` are all stable built-ins.
- `atob`/`btoa` are **[Legacy]**; `navigator` is stability 1.1; Web Storage is 1.2 and process-wide; `EventSource`, `URLPattern`, `navigator.locks`, and `Worker` are **[Experimental]**.
- `process.env` holds only strings. Coerce numbers, compare booleans explicitly, and remember that `"false"` is truthy.
- Mutating `process.env` is process-local; worker threads snapshot it. Windows is case-insensitive on the main thread but case-sensitive inside workers.
- `--env-file` and `--env-file-if-exists` load dotenv files; real environment variables take precedence. `process.loadEnvFile()` and `util.parseEnv()` are the programmatic forms.
- `NODE_ENV` is a community convention with no runtime effect. `NODE_OPTIONS`, `UV_THREADPOOL_SIZE`, `TZ`, `NODE_COMPILE_CACHE`, and the TLS variables are the ones that actually change Node's behaviour.

## Where to go next

- [Chapter 13 — AbortController, Signals, and Cancellation](../part2-async/13-abort-and-cancellation.md) — cancellation in depth.
- [Chapter 25 — The Process Object: argv, env, stdio, exit codes](../part4-system/25-process-object.md) — the rest of `process`.
- [Chapter 36 — HTTP/1.1 Clients, Agents, and Keep-Alive](../part5-networking/36-http-clients.md) — `fetch`, undici, and connection pooling.
- [Chapter 60 — Deployment, Containers, and Configuration](../part9-production/60-deployment-and-config.md) — configuration and secrets in production.
- [Appendix B — Environment Variable Reference](../appendix/b-environment-variables.md) — the complete list.
- Official documentation: <https://nodejs.org/docs/latest/api/globals.html> and <https://nodejs.org/docs/latest/api/environment_variables.html>
