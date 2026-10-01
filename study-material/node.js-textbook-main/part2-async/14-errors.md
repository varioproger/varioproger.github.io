---
chapter: 14
part: "Part II — Asynchrony"
title: "Errors: Classes, Codes, and Handling Strategies"
level: intermediate
reading_time: "35 min"
prerequisites: [11, 12, 13]
source_docs:
  - "doc/api/errors.md"
  - "doc/api/domain.md"
  - "doc/api/process.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/errors.html"
node_baseline: "27.0.0-pre"
---

# Chapter 14 — Errors: Classes, Codes, and Handling Strategies

**What you will learn**

- The error classes Node.js uses and precisely what makes a `SystemError` different from a plain `Error`.
- Why `error.code` is a stable contract and `error.message` is not, and how to write checks that survive upgrades.
- How to read a stack trace, control it with `Error.stackTraceLimit` and `--stack-trace-limit`, and shape it with `Error.captureStackTrace()`.
- How to chain errors with the `cause` option, and when `AggregateError` shows up.
- The difference between operational errors and programmer bugs, and why it dictates your handling strategy.
- What `'uncaughtException'` and `'unhandledRejection'` are legitimately for, what `--unhandled-rejections` modes do, and why `node:domain` **[Deprecated]** (DEP0032) exists but should not be used.
- How to design an error taxonomy with codes for your own application.

**Why this matters**

Every Node.js application you will ever ship is mostly a machine for turning failures into decisions. A file is missing. A socket resets mid-response. A user sends a string where you expected a number. A dependency throws something that is not even an `Error`. The quality of a production service is largely determined by how precisely it can tell these apart, because the correct response to each is different: retry, return 400, return 503, page a human, or crash and let the supervisor restart you.

Node gives you unusually good raw material for this: machine-readable codes stable across minor versions, system errors carrying the exact `errno`, `syscall`, and `path` that failed, and the `cause` option for wrapping without losing the original. Most teams never use any of it — they string-match on `err.message`, which breaks on the next patch release, and then wrap everything in an `'uncaughtException'` handler that logs and continues, converting a clean crash into slow corruption. This chapter is about doing the opposite.

## Where errors come from and how they reach you

Before classifying errors, understand the four delivery channels. Node's documentation is explicit that how an error is reported depends on the style of API you called.

| Channel | Typical API | How you catch it |
|---|---|---|
| Synchronous `throw` | `fs.readFileSync`, `JSON.parse`, argument validation | `try…catch` |
| Error-first callback | `fs.readFile(path, cb)` | `if (err)` as the first thing in the callback |
| Promise rejection | `fsPromises.readFile(path)` | `await` inside `try…catch`, or `.catch()` |
| `'error'` event | streams, sockets, `EventEmitter` | `emitter.on('error', handler)` |

The fourth is the dangerous one. An `EventEmitter` that emits `'error'` with no registered handler does not fail quietly: Node throws the error, and unless an `'uncaughtException'` handler is installed (or the deprecated `node:domain` module is in use), the process crashes. That throw happens *after* the calling code has already returned, so `try…catch` around the call that created the emitter will not see it. The associated code is `ERR_UNHANDLED_ERROR`.

```js
import { EventEmitter } from 'node:events';

const ee = new EventEmitter();
setImmediate(() => {
  // No 'error' listener: this crashes the process.
  ee.emit('error', new Error('nothing will catch this'));
});
```

The rule that follows: **attach an `'error'` listener to every emitter and every stream you create, without exception**, even if the listener only logs. A missing `'error'` handler on a socket is the single most common way a healthy Node service dies at 3 a.m.

## The error classes

All errors raised by Node.js are instances of, or inherit from, the standard `Error` class, and are guaranteed to carry at least `Error`'s properties. Beyond that, Node uses the standard JavaScript subclasses to mean specific things.

| Class | Node uses it for | Notable extra properties |
|---|---|---|
| `Error` | Everything generic; the base for all others | `message`, `stack`, `code` (on Node-generated errors), `cause` |
| `TypeError` | An argument of the wrong *type*. Thrown immediately as argument validation | usually `code: 'ERR_INVALID_ARG_TYPE'` |
| `RangeError` | An argument of the right type but an unacceptable *value* or range | often `code: 'ERR_OUT_OF_RANGE'` |
| `ReferenceError` | Access to an undefined variable. In practice only V8 produces these | — |
| `SyntaxError` | Invalid JavaScript, from `eval`, `Function`, `require`, or `node:vm` | — |
| `AssertionError` | A logic violation detected by `node:assert` | `actual`, `expected`, `operator`, `generatedMessage`, `code: 'ERR_ASSERTION'` |
| `SystemError` | The operating system refused or failed an operation | `errno`, `syscall`, `path`, `dest`, `address`, `port`, `info` |
| `DOMException` | Web-platform APIs (`AbortSignal`, `structuredClone`, storage) | identified by `name`, not `code` |

Two notes. `SyntaxError` instances are, as the docs put it, unrecoverable *in the context that created them* — only another context can catch them; along with `ReferenceError` they are essentially always bugs rather than conditions. And `DOMException` does **not** follow Node's code convention: the docs say to identify it by `domException.name`, not `code`. That is why the abort check in [Chapter 13](13-abort-and-cancellation.md) tests both.

### What makes a `SystemError`

A `SystemError` is not a distinct constructor you can `import`; it is a shape. Node produces it whenever an exception originates in the runtime environment rather than in JavaScript — usually because the operating system said no. The extra properties are the whole point:

| Property | Type | Meaning |
|---|---|---|
| `code` | string | The stable string label, e.g. `'ENOENT'` |
| `errno` | number | The *negative* platform error number, matching libuv's error handling. Normalized by libuv on Windows |
| `syscall` | string | Which system call failed, e.g. `'open'`, `'connect'`, `'read'` |
| `path` | string | The offending pathname, when the operation was file-related |
| `dest` | string | The destination path, for two-path operations like `rename` and `copyFile` |
| `address` | string | The address a network connection failed to reach |
| `port` | number | The port that was unavailable |
| `info` | object | Extra platform-specific detail, when present |
| `message` | string | A system-supplied, human-readable description |

Everything you need for a good log line is on the object already:

```mjs
import { readFile } from 'node:fs/promises';
import { getSystemErrorName, getSystemErrorMessage } from 'node:util';

try {
  await readFile('/etc/definitely-not-here.conf');
} catch (err) {
  console.error({
    code: err.code,                              // 'ENOENT'
    syscall: err.syscall,                        // 'open'
    path: err.path,                              // '/etc/definitely-not-here.conf'
    errno: err.errno,                            // e.g. -2 on Linux
    name: getSystemErrorName(err.errno),         // 'ENOENT'
    detail: getSystemErrorMessage(err.errno),    // 'No such file or directory'
  });
}
```

`util.getSystemErrorName(errno)` has existed since v9.7.0; `util.getSystemErrorMap()` since v16.0.0 / v14.17.0; `util.getSystemErrorMessage(errno)` is newer, added in v23.1.0 / v22.12.0. All three mappings are platform-dependent — do not hard-code numbers.

The system codes you will meet most often, with what they usually mean in a service:

| Code | Meaning | Usual response |
|---|---|---|
| `ENOENT` | No such file or directory | Often expected — treat as "not configured" or 404 |
| `EACCES` | Permission denied | Configuration or deployment bug; fail loudly |
| `EEXIST` | File already exists | Race in a create-if-absent flow; retry or ignore |
| `EISDIR` / `ENOTDIR` | Path is/is not a directory | Caller passed the wrong path |
| `ENOTEMPTY` | Directory not empty | Usually from `unlink`/`rmdir` on a non-empty dir |
| `EMFILE` | Too many open files | You are leaking descriptors, or need a higher `ulimit -n` |
| `EADDRINUSE` | Address already in use | Another process holds the port |
| `ECONNREFUSED` | Nothing listening at the target | Upstream is down; retry with backoff |
| `ECONNRESET` | Peer forcibly closed the connection | Very common with keep-alive; usually retryable |
| `EPIPE` | Wrote to a pipe/socket with no reader | The client hung up; stop writing |
| `ETIMEDOUT` | Operation timed out | Network or upstream latency; retry with a budget |
| `ENOTFOUND` | DNS lookup failed | Not a POSIX error; name resolution problem |

`ECONNRESET` and `EPIPE` are worth memorising because they are almost never bugs. They are what a busy network looks like. A service that alerts on them will alert constantly.

## `code` is the contract; `message` is not

This is the most important operational fact in the entire `errors` document, and it is stated plainly: `error.message` strings may be changed in *any* version of Node.js, while `error.code` only changes between major versions. Node ships more than 400 documented `ERR_*` codes, and each one is a promise.

So this is a bug waiting for a patch release:

```js
// ❌ Fragile
if (err.message.includes('no such file')) { /* ... */ }
```

and this is correct:

```js
// ✅ Stable
if (err.code === 'ENOENT') { /* ... */ }
```

The same discipline applies to your own errors. If you generate an error that another module — or another team — will branch on, give it a `code` and treat that code as public API. Message text is for humans reading logs; codes are for programs making decisions.

A useful corollary: never *reformat* an error you are passing along. Wrapping is fine (see `cause` below), but do not do `throw new Error(err.message)` — that destroys `code`, `stack`, `syscall`, and everything else that made the error useful.

## Reading a stack trace

A stack trace is a string, built when the `Error` object is *constructed*, not when it is thrown. That timing detail explains most stack-trace confusion: if you create an error object in a factory and throw it later, the trace points at the factory.

```
Error: connection to inventory-db failed
    at connect (/srv/app/lib/db.js:42:11)
    at async loadCatalog (/srv/app/lib/catalog.js:17:20)
    at async handler (/srv/app/routes/products.js:9:18)
```

The first line is `<class name>: <message>`. Each subsequent line is a frame, most recent first. Node's docs enumerate four location forms: `native` for frames inside V8 itself (such as `[].forEach`), a bare `filename.js:line:column` for Node internals, an absolute path for user code loaded as CommonJS, and a `file:///`-style URL for user code loaded as an ES module. Frames exist only for JavaScript functions — if execution passes synchronously through a C++ addon, that addon contributes no frame and the trace appears to jump.

### Async stack traces

Modern V8 stitches `await` boundaries into the trace — that is what the `at async` prefixes above mean. It does **not** work across plain callbacks or `EventEmitter` hops: an error created inside a `setTimeout` callback has a trace that starts at the callback and stops. Node's documentation states the limit precisely: a trace extends only to the beginning of *synchronous code execution* or to `Error.stackTraceLimit` frames, whichever is smaller, bounded by the number of frames available on the current event loop tick.

So: **prefer `async`/`await` over raw callbacks partly for the stack traces**. If you must use a callback API and need context, wrap the error with `cause` at the call site.

### Controlling trace depth

`Error.stackTraceLimit` is a mutable number, defaulting to `10`. Setting it higher captures more frames; setting it to `0` (or any negative number, or a non-number) disables frame capture entirely. Changes only affect traces captured *after* the assignment.

The CLI flag `--stack-trace-limit=limit` sets the same thing at startup:

```bash
node --stack-trace-limit=50 server.js
```

Raising the limit is a real debugging tool for deep async chains, and it is not free — capturing frames costs time and memory on every `new Error()`. Ten is a defensible default; fifty in a hot error path is not. The reverse trick also helps: if you construct errors in a hot loop purely as control flow, temporarily zeroing the limit removes the capture cost.

```js
const { stackTraceLimit } = Error;
Error.stackTraceLimit = 0;
const err = new Error('cheap sentinel');
Error.stackTraceLimit = stackTraceLimit;
```

### `Error.captureStackTrace()`

`Error.captureStackTrace(targetObject[, constructorOpt])` installs a `.stack` property on any object. Its second argument is the reason to care: every frame at or above `constructorOpt` is omitted from the trace. That lets a custom error class hide its own constructor plumbing, so the top frame is the caller's code — where the problem actually is.

```js
class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'APP_VALIDATION';
    this.field = field;
    Error.captureStackTrace(this, ValidationError);  // hide this constructor
  }
}
```

One more subtlety from the docs: `error.stack` is a getter/setter over a hidden internal slot that only exists on genuine built-in error objects — those for which `Error.isError()` returns true. If you access the getter with a `this` that is not a real error (a `Proxy`, a plain object you copied properties onto), the getter returns `undefined` and the setter silently does nothing. This bites people who serialise errors by spreading them into plain objects.

### Flags that change what you see

| Flag | Effect |
|---|---|
| `--stack-trace-limit=N` | Sets `Error.stackTraceLimit` at startup. Default 10; `0` disables capture |
| `--enable-source-maps` | Maps transpiled frames back to original TypeScript/JSX positions. Non-experimental since v15.11.0 / v14.18.0 |
| `--trace-uncaught` | Also prints the stack trace of the *throw site*, not just the creation site. Useful when someone throws a non-`Error` value. May hurt GC behaviour |
| `--trace-warnings` | Prints stack traces for process warnings, including deprecations |
| `--throw-deprecation` | Turns deprecation warnings into thrown errors — good for CI |
| `--report-uncaught-exception` | Writes a full diagnostic report on an uncaught exception (see Chapter 50) |

If you deploy TypeScript, `--enable-source-maps` is close to mandatory. Without it every trace points at compiled output and every incident starts with a translation exercise.

## Chaining errors with `cause`

Since v16.9.0, `new Error(message, { cause })` attaches an underlying error to a new one. This is how you add context without destroying evidence.

```js
async function loadConfig(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    throw new Error(`could not load config from ${path}`, { cause: err });
  }
}
```

The caller now gets a message that explains *what the program was trying to do*, plus `err.cause` holding the original `SystemError` with its `code`, `syscall`, and `path` intact. `util.inspect()` — and therefore `console.error()` — recursively serialises `cause`, so the printed output shows both traces, with the nested one labelled `[cause]`.

The pattern to adopt: **wrap at layer boundaries, never in the middle**. Wrapping at every call produces five-deep chains that obscure more than they reveal. Wrap where the abstraction changes — at the edge of your data-access layer, at the edge of an HTTP client — and let the error travel untouched in between.

When you branch on causes, walk the chain rather than checking one level:

```js
function findCode(err, code) {
  for (let e = err; e != null; e = e.cause) {
    if (e.code === code) return e;
  }
  return undefined;
}

if (findCode(err, 'ECONNREFUSED')) {
  return retryLater();
}
```

## `AggregateError`

`AggregateError` is a standard JavaScript class that holds several errors in its `errors` array. You meet it in Node in three places:

- `Promise.any()` rejects with an `AggregateError` when every input promise rejects.
- Several `fs` operations may pass an `AggregateError` to their callback when more than one error occurred during the operation — the callback signature is documented as `err {Error|AggregateError}`.
- `net.connect()` with `autoSelectFamily` (Happy Eyeballs) emits a single `AggregateError` containing every failed attempt when all connection attempts fail.

Handling it means remembering to look inside:

```js
try {
  const socket = await connectWithFallbacks(hosts);
} catch (err) {
  if (err instanceof AggregateError) {
    for (const inner of err.errors) {
      logger.warn({ code: inner.code, address: inner.address }, 'attempt failed');
    }
  }
  throw err;
}
```

A logger that only prints `err.message` will render an `AggregateError` as `"All promises were rejected"` and throw away every actual cause. Make sure your logging layer expands `errors` the same way it expands `cause`.

## Operational errors versus programmer bugs

This distinction is the backbone of a sane error strategy. It is not a Node invention, but Node makes it unusually visible.

**Operational errors** are expected failures of a correct program interacting with an imperfect world: a file that is not there, an upstream that is down, a socket reset, invalid user input, a request that ran out of time. They are part of the specification. You anticipate them, you handle them locally, and the program continues.

**Programmer bugs** are defects: `undefined is not a function`, an off-by-one `RangeError`, a `TypeError` from passing the wrong argument to a Node API, a failed assertion. The program is now in a state its author never modelled. There is no local recovery, because you do not know what invariants were broken on the way here.

| | Operational error | Programmer bug |
|---|---|---|
| Examples | `ENOENT`, `ECONNRESET`, `ETIMEDOUT`, 400-class validation | `TypeError`, `ReferenceError`, `AssertionError`, `ERR_INVALID_ARG_TYPE` from your own call |
| Where handled | Locally, at the layer that knows what to do | Nowhere. Crash |
| Response | Retry, fall back, return an HTTP status | Log, flush, exit non-zero, let the supervisor restart |
| Alerting | On rate, not on occurrence | On every occurrence |

Node's own documentation makes this argument in the `domain` chapter: because of how `throw` works in JavaScript, there is almost never a safe way to pick up where you left off without leaking references or entering some undefined brittle state. Hence "let it crash" — a process that exits is restarted in milliseconds in a known-good state, while one that catches everything accumulates half-released locks, leaked descriptors, and inconsistent caches, then serves wrong answers for hours.

## `uncaughtException` and `unhandledRejection`

Node gives you two process-level hooks. Both are widely misused.

### `'uncaughtException'`

Emitted when an exception bubbles all the way back to the event loop. By default Node prints the trace to `stderr` and exits with code 1, overriding any previously set `process.exitCode`. **Adding a handler overrides that default behaviour** — that is precisely the danger. With a handler installed and no explicit exit, the process exits with 0 when it eventually does exit, which means your supervisor and your dashboards think everything is fine.

The handler receives `(err, origin)`, where `origin` is `'uncaughtException'` or `'unhandledRejection'`. The latter appears when a rejection went unhandled under the default `throw` mode, or when a rejection happens during ES module static loading of the entry point.

The only legitimate use is **crash reporting followed by exit**:

```mjs
import process from 'node:process';
import { writeSync } from 'node:fs';

process.on('uncaughtException', (err, origin) => {
  // Synchronous write: the process may not survive to flush async I/O.
  writeSync(process.stderr.fd, `FATAL (${origin}): ${err?.stack ?? err}\n`);
  process.exit(1);
});
```

Note `writeSync`. Anything asynchronous here may never run, which is why "flush the log buffer then exit" handlers so often lose exactly the line you needed.

To *observe* fatal errors without changing behaviour, use `'uncaughtExceptionMonitor'` (v13.7.0 / v12.17.0). It fires before `'uncaughtException'` and before any capture callback, and does **not** prevent the crash:

```js
process.on('uncaughtExceptionMonitor', (err, origin) => {
  MyMonitoringTool.logSync(err, origin);
});
// Node still crashes afterwards. This is the correct hook for APM agents.
```

Two lower-level hooks exist for framework and instrumentation authors: `process.setUncaughtExceptionCaptureCallback(fn)` (v9.3.0) replaces the `'uncaughtException'` event entirely, and `process.addUncaughtExceptionCaptureCallback(fn)` **[Experimental]** (v25.9.0) allows several callbacks, invoked most-recent-first, where returning `true` skips the rest and the default handling. A capture callback also suppresses diagnostic report generation. Application code should not use either.

### `'unhandledRejection'`

Emitted when a promise rejects and no handler is attached within a turn of the event loop. The listener receives `(reason, promise)`. It is genuinely useful for finding forgotten `await`s and dropped `.catch()`es — and, like `'uncaughtException'`, it should not be used to continue.

The classic source is a promise stored for later:

```js
class Resource {
  constructor() {
    // Rejected now, awaited later: 'unhandledRejection' fires in between.
    this.loaded = Promise.reject(new Error('resource not yet loaded'));
  }
}
```

There is a companion event, `'rejectionHandled'`, emitted when a promise that already triggered `'unhandledRejection'` later gets a handler. If you build tooling around this, you need both; otherwise you will report false positives for the pattern above.

### `--unhandled-rejections=mode`

The default changed to `throw` in v15.0.0. Here is what each mode does:

| Mode | Behaviour |
|---|---|
| `throw` | Emit `'unhandledRejection'`. If no handler is registered, raise it as an uncaught exception. **This is the default.** |
| `strict` | Always raise as an uncaught exception. If that exception is handled, `'unhandledRejection'` is then emitted |
| `warn` | Always emit a warning, whether or not an `'unhandledRejection'` handler exists, and do not print the deprecation warning |
| `warn-with-error-code` | Emit `'unhandledRejection'`; if no handler, warn and set the process exit code to `1` |
| `none` | Silence all warnings |

Use the default. `none` is how unhandled rejections become invisible data-loss bugs. `warn` is defensible only as a temporary step while migrating a legacy codebase, and it should come with a ticket and a deadline.

### Why "keep running" is usually wrong

Every "log and continue" handler makes the same bet: that the exception did not corrupt anything. Consider what an uncaught `TypeError` in a request handler actually leaves behind — a database transaction that was opened and never committed or rolled back, a mutex acquired and never released, a partially written response, a cache entry updated to a half-computed value. None of that is repaired by catching the error at the process level. You have converted a fast, obvious, restartable failure into a slow, silent, unrestartable one.

The narrow exception is a server that must finish in-flight work before dying: log the error, stop accepting new connections, give existing requests a short grace period, then exit non-zero. That is a *shutdown* path, not a recovery path. [Chapter 26](../part4-system/26-signals-and-shutdown.md) covers it in full.

## `node:domain` **[Deprecated]** (DEP0032)

Domains predate `async/await` and even reliable promise semantics. The 2012 idea was reasonable: group a set of I/O operations so any error thrown or emitted within the group is routed to one handler that still knows the request context, instead of arriving contextless at `process.on('uncaughtException')`. The module is documentation-only deprecated as DEP0032, marked Stability 0, and described as *pending deprecation* — it still works, which is why it keeps appearing in old blog posts.

Its API is small: `domain.create()`, `d.run(fn)`, `d.add(emitter)` / `d.remove(emitter)` for explicit binding, `d.bind(callback)` and `d.intercept(callback)` for wrapping callbacks, and `d.on('error', handler)`. Any emitter created while a domain is active is implicitly bound to it, and errors routed through a domain gain `error.domain`, `error.domainEmitter`, `error.domainBound`, and `error.domainThrown`.

Do not use it in new code, for four reasons:

1. **It encourages the wrong strategy.** Node's own documentation opens the domain chapter warning that domain error handlers are not a substitute for shutting down the process, then shows a "bad idea" example that swallows errors and leaks resources.
2. **Implicit binding is invisible.** Which domain an emitter belongs to depends on when it was constructed — very hard to reason about at scale.
3. **Promise semantics are subtle.** Since v8.0.0, promise handlers run in the domain where `.then()` or `.catch()` was called, not where the promise was created.
4. **`AsyncLocalStorage` does the useful half properly.** If you wanted request-scoped context in your error logs, that is [Chapter 15](15-async-context.md), and it is Stable.

## Designing an error taxonomy for your application

Node's approach scales down well. Copy it: a small hierarchy, a stable `code` on every error, structured fields instead of interpolated message text, and a single classification function at the boundary.

```mjs
export class AppError extends Error {
  constructor(message, { code, status = 500, retryable = false, cause, ...details } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;          // HTTP status to surface
    this.retryable = retryable;    // may the caller retry?
    this.details = details;        // structured context, never in `message`
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(field, message, details) {
    super(message, { code: 'APP_VALIDATION', status: 400, ...details });
    this.field = field;
  }
}

export class UpstreamError extends AppError {
  constructor(service, cause) {
    super(`upstream ${service} failed`, {
      code: 'APP_UPSTREAM',
      status: 502,
      retryable: true,
      cause,
      service,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(kind, id) {
    super(`${kind} not found`, { code: 'APP_NOT_FOUND', status: 404, kind, id });
  }
}
```

Three design rules make this pay off:

**Prefix your codes.** `APP_VALIDATION`, not `VALIDATION`. Node reserves `ERR_*`, and a prefix makes it obvious at a glance whether an error came from your code, from Node, or from a dependency.

**Put data in fields, not in the message.** `new NotFoundError('user', id)` gives you `err.kind` and `err.id` as queryable log fields. Baking the id into the message string forces every downstream consumer to parse it back out.

**Classify once, at the boundary.** One function translates any thrown value into a response, and it is the only place that knows about HTTP:

```js
export function toResponse(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, retryable: err.retryable };
  }
  // Node system errors we consider operational:
  switch (err?.code) {
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ETIMEDOUT':
      return { status: 503, code: 'APP_UPSTREAM', retryable: true };
    case 'ENOENT':
      return { status: 404, code: 'APP_NOT_FOUND', retryable: false };
    case 'ABORT_ERR':
      return null;                 // client hung up; send nothing
  }
  // Anything else is a bug. Do not leak details to the client.
  return { status: 500, code: 'APP_INTERNAL', retryable: false, bug: true };
}
```

The `bug: true` flag is the hinge. It is what your logging layer keys on to page a human, and what your metrics use to distinguish "the world is imperfect" from "we shipped a defect".

## Common mistakes

### ❌ Matching on `err.message`

```js
if (err.message === 'ENOENT: no such file or directory, open \'config.json\'') {
  useDefaults();
}
```

Node explicitly reserves the right to change message text in any release, and this particular string also embeds a path. The check will silently stop working, and the failure mode is "defaults are never applied", which nobody notices for months.

✅

```js
if (err.code === 'ENOENT') {
  useDefaults();
}
```

### ❌ Rewrapping an error and losing everything

```js
try {
  await writeFile(dest, buf);
} catch (err) {
  throw new Error(`write failed: ${err.message}`);
}
```

`code`, `errno`, `syscall`, `path`, `dest`, and the original stack are all gone. All the caller can do now is string-match — the very thing you should never do.

✅

```js
try {
  await writeFile(dest, buf);
} catch (err) {
  throw new AppError(`could not write ${dest}`, {
    code: 'APP_WRITE_FAILED',
    cause: err,       // preserves code, syscall, path, and stack
    dest,
  });
}
```

### ❌ Swallowing everything with `uncaughtException`

```js
process.on('uncaughtException', (err) => {
  logger.error(err);
  // Deliberately not exiting — "the server should stay up".
});
```

The process now runs with unknown broken invariants and, because a handler is installed, will eventually exit with code 0 so your orchestrator never notices. Async logging inside the handler may also lose the message.

✅

```js
process.on('uncaughtExceptionMonitor', (err, origin) => {
  writeSync(process.stderr.fd, `FATAL (${origin}): ${err?.stack}\n`);
});
// No 'uncaughtException' listener: Node prints the trace and exits 1.
// A supervisor restarts a clean process.
```

### ❌ Creating a stream or emitter with no `'error'` listener

```js
const rs = createReadStream(userSuppliedPath);
rs.pipe(res);      // ENOENT here crashes the process
```

`pipe()` does not forward errors. A missing file, a permissions problem, or a client disconnect kills the process.

✅

```js
import { pipeline } from 'node:stream/promises';

try {
  await pipeline(createReadStream(userSuppliedPath), res);
} catch (err) {
  if (err.code === 'ENOENT') return res.writeHead(404).end();
  if (err.code === 'ABORT_ERR' || err.code === 'EPIPE') return;  // client left
  throw err;
}
```

## Production notes

- **Log structured errors, not stringified ones.** `String(err)` gives you `"Error: message"` and drops `code`, `cause`, `errors`, and every `SystemError` field. Configure your logger to serialise `name`, `message`, `code`, `stack`, recursively `cause`, and `errors` for `AggregateError`. Chapter 51 covers `util.inspect` options for this.
- **Alert on rates, not on events, for operational errors.** `ECONNRESET` and `EPIPE` are background noise in any busy service. A single occurrence means nothing; a tenfold change in five minutes means something. Reserve per-occurrence alerting for errors your classifier marked as bugs.
- **Stack capture is not free.** Every `new Error()` walks frames up to `Error.stackTraceLimit`. In paths that construct thousands of errors per second — validation loops, parser backtracking — this shows up in profiles. Use sentinel values instead of exceptions there.
- **Set `--enable-source-maps` wherever you transpile,** or every TypeScript trace points at generated JavaScript and incident response starts with line-number arithmetic. Pair it with `--report-uncaught-exception` (Chapter 50) so a crash leaves a diagnostic report behind, and make sure your orchestrator surfaces the non-zero exit code.
- **Never leak internal errors to clients.** Return your own `code` and a generic message; log the full chain server-side with a correlation id. Stack traces in HTTP responses hand an attacker your directory layout, module versions, and sometimes credentials from a `cause`.
- **Windows differs in the details.** `errno` values are normalized by libuv, so `util.getSystemErrorName()` gives the same names cross-platform — but the *conditions* differ. `EACCES` on a file another process has open is common on Windows and rare on POSIX. Test error paths on both if you support both.
- **Audit `--unhandled-rejections` in every deployment.** Check what your Dockerfile, `NODE_OPTIONS`, and process manager actually pass. A `--unhandled-rejections=none` added years ago to quiet a noisy log is still hiding failures today.

## Exercises

1. **Inspect a `SystemError`.** Write a script that triggers `ENOENT`, `EACCES`, and `EADDRINUSE`, and prints `code`, `errno`, `syscall`, `path`/`address`/`port`, plus `util.getSystemErrorName()` and `util.getSystemErrorMessage()` for each. Success criterion: your output identifies all three without any string matching on `message`.

2. **Trace depth experiment.** Build a recursive async function 40 levels deep that throws at the bottom. Run it with the default limit, then `--stack-trace-limit=50`, then `--stack-trace-limit=0`. Success criterion: you can state how many frames each run produced and explain why the `async` frames appear at all.

3. **Error chain walker.** Implement `describe(err)` returning an array of `{ name, code, message }` for the error and every `cause` beneath it, expanding `AggregateError.errors` at each level. Success criterion: a three-level chain whose middle link is an `AggregateError` produces a complete, flat description.

4. **Classifier with tests.** Build the `AppError` hierarchy and `toResponse()` from this chapter, then write `node:test` cases for a validation error, a wrapped `ECONNREFUSED`, an `ABORT_ERR`, and a raw `TypeError`. Success criterion: only the `TypeError` case is flagged as a bug, and no case leaks `err.message` into the response body.

5. **Crash-vs-continue comparison.** Write an HTTP server that opens a file handle per request and throws after opening it. Run it with an `'uncaughtException'` handler that logs and continues, then with no handler, watching descriptors with `lsof` (or `handle` on Windows). Success criterion: you can quantify descriptor growth in the first case and explain the exit code difference.

## Recap

- All Node errors inherit from `Error`; `TypeError` and `RangeError` mean wrong type and wrong value, `AssertionError` means a logic violation, and `SystemError` means the OS refused.
- A `SystemError` carries `code`, `errno`, `syscall`, and often `path`, `dest`, `address`, `port`, and `info` — everything a good log line needs.
- `error.code` is stable across minor versions; `error.message` is not. Branch on codes, never on message text, and give your own errors codes too.
- Stack traces are captured at construction time, bounded by `Error.stackTraceLimit` (default 10, settable with `--stack-trace-limit`), and shaped by `Error.captureStackTrace(obj, constructorOpt)`.
- `new Error(msg, { cause })` chains errors without destroying the original; `util.inspect` and `console.error` print the chain. `AggregateError.errors` holds multiple failures from `Promise.any`, some `fs` operations, and Happy Eyeballs connects.
- Operational errors are handled locally; programmer bugs are not handled at all — log and exit non-zero, and let a supervisor restart a clean process.
- `'uncaughtException'` and `'unhandledRejection'` are for reporting and orderly shutdown. `'uncaughtExceptionMonitor'` observes without changing behaviour. Keep `--unhandled-rejections` on its default `throw`.
- `node:domain` is deprecated (DEP0032) and its central premise — recovering in place — is unsound. Use `AsyncLocalStorage` for context and let the process crash on bugs.

## Where to go next

- [Chapter 13 — AbortController, Signals, and Cancellation](13-abort-and-cancellation.md) — `ABORT_ERR` and why cancellation is not a failure.
- [Chapter 15 — AsyncLocalStorage and Context Propagation](15-async-context.md) — the modern replacement for what domains promised.
- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](../part4-system/26-signals-and-shutdown.md) — turning a fatal error into an orderly exit.
- [Chapter 46 — Assertions](../part7-diagnostics/46-assertions.md) — `AssertionError` and `node:assert` in depth.
- [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md) — `--report-uncaught-exception` and post-mortem analysis.
- [Chapter 51 — Console, `util.inspect`, and Logging Strategy](../part7-diagnostics/51-console-and-logging.md) — serialising errors properly.
- [Appendix C — Error Code Catalogue](../appendix/c-error-codes.md) — the full `ERR_*` list.
- Official documentation: <https://nodejs.org/docs/latest/api/errors.html> and <https://nodejs.org/docs/latest/api/domain.html>
