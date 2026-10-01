---
chapter: 51
part: "Part VII — Testing, Debugging, Diagnostics"
title: "Console, util.inspect, and Logging Strategy"
level: intermediate
reading_time: "32 min"
prerequisites: [15, 18, 25]
source_docs:
  - "doc/api/console.md"
  - "doc/api/util.md"
  - "doc/api/process.md"
source_url: "https://nodejs.org/docs/latest/api/console.html"
node_baseline: "27.0.0-pre"
---

# Chapter 51 — Console, `util.inspect`, and Logging Strategy

## What you will learn

- What the global `console` really is, and exactly when `console.log()` blocks the event loop.
- The complete `console` surface — including the methods nobody uses and should — and how to build your own `Console` instance.
- Every format specifier, and `util.format` / `util.formatWithOptions`.
- `util.inspect` in depth: every option, custom inspection via `util.inspect.custom`, and `inspect.defaultOptions`.
- `util.styleText` for terminal colour that respects `NO_COLOR`, and `util.debuglog` for zero-cost conditional tracing.
- A defensible logging strategy for a real service: structured JSON, level discipline, correlation ids, redaction, sampling, and cost.

## Why this matters

`console.log()` is the first thing you learn and the last thing you unlearn. It is genuinely useful — and in a production HTTP handler it is a *synchronous blocking write* to a file descriptor, in the middle of your event loop, with a formatting step that recursively walks arbitrary objects. A service logging one line per request at 5,000 rps can spend more time formatting and writing logs than doing work.

The other half of the problem is what you log. A printf line like `` `user ${id} failed: ${err}` `` is unqueryable, unfilterable, and — the day it includes a request body — a data breach. This chapter covers both: the mechanics of Node's output primitives, and the strategy that turns them into logs you can actually operate on.

## What the global `console` actually is

The `node:console` module exports two things: a `Console` class, and a global `console` instance. That global is exactly equivalent to:

```js
new Console({ stdout: process.stdout, stderr: process.stderr });
```

Nothing more. `console` is not magic, it is not a browser API, and it is not a logger. It is a thin formatting layer over two writable streams.

### The blocking behaviour

The docs carry an explicit warning: the global console's methods "are neither consistently synchronous like the browser APIs they resemble, nor are they consistently asynchronous like all other Node.js streams." Whether a write blocks depends on what the stream is connected to *and* on the platform:

| `stdout`/`stderr` connected to | POSIX | Windows |
|---|---|---|
| **File** (`node app.js > app.log`) | Synchronous | Synchronous |
| **TTY** (interactive terminal) | Synchronous | Asynchronous |
| **Pipe or socket** (`node app.js \| tee`, Docker, systemd) | Asynchronous | Synchronous |

Read that table twice, because it inverts the intuition. On Linux — where your production containers run — writing to a *file* blocks and writing to a *pipe* does not. Docker and Kubernetes give your container a pipe for stdout, so in the common case Linux console writes are asynchronous. But run the same image with output redirected to a mounted log file and every `console.log()` becomes a blocking `write(2)`.

The docs' own warning on synchronous writes is worth internalising: they "block the event loop until the write has completed… under high system load, pipes that are not being read at the receiving end, or with slow terminals or file systems, it's possible for the event loop to be blocked often enough and long enough to have severe negative performance impacts."

That last clause is the failure mode people never predict: **an asynchronous pipe stops being harmless when nobody drains it.** If your log collector stalls, the pipe buffer fills, writes queue in memory, and your process's RSS climbs until it dies — with no log line explaining why. Chapter 25 covers `process.stdout` semantics in full; the operative rule here is that logging is I/O and must be budgeted like I/O.

Check what you actually have with `process.stdout.isTTY`.

## The full console surface

Everything routes through `util.format()` and then to one of two streams:

| Method | Stream | What it does |
|---|---|---|
| `log(data, ...args)` | stdout | The workhorse |
| `info(data, ...args)` | stdout | Alias of `log` |
| `debug(data, ...args)` | stdout | Alias of `log` |
| `dirxml(...data)` | stdout | Calls `log`; produces no XML |
| `error(data, ...args)` | stderr | The error channel |
| `warn(data, ...args)` | stderr | Alias of `error` |
| `trace(message, ...args)` | stderr | Prints `Trace: ` + message + a stack trace |
| `dir(obj, options)` | stdout | `util.inspect` with explicit options; **bypasses custom `inspect()`** |
| `table(tabularData[, properties])` | stdout | Box-drawn table; falls back to plain logging if unparseable |
| `group([...label])` | — | Indents subsequent lines by `groupIndentation` |
| `groupCollapsed()` | — | Alias of `group` |
| `groupEnd()` | — | Removes one level of indentation |
| `count([label])` | stdout | Prints how many times this label has been counted |
| `countReset([label])` | — | Resets that counter |
| `time([label])` | — | Starts a named timer |
| `timeEnd([label])` | stdout | Stops it and prints e.g. `bunch-of-stuff: 225.438ms` |
| `timeLog([label][, ...data])` | stdout | Prints elapsed time so far, plus extra data |
| `assert(value[, ...message])` | stderr | If `value` is falsy, prints `Assertion failed`. **Never throws** |
| `clear()` | — | Clears the TTY; a no-op when stdout is not a TTY |

Labels default to `'default'` for `count`, `time`, `timeEnd`, and `timeLog`.

Three of these are underused and worth knowing.

**`console.table()`** turns an array of objects into a box-drawn table, optionally restricted to named columns. For eyeballing a query result during development it beats twenty `console.log()` calls:

```js
console.table([{ id: 1, ok: true }, { id: 2, ok: false }], ['id', 'ok']);
// ┌─────────┬────┬───────┐
// │ (index) │ id │ ok    │
// ├─────────┼────┼───────┤
// │ 0       │ 1  │ true  │
// │ 1       │ 2  │ false │
// └─────────┴────┴───────┘
```

**`console.assert()`** does not throw and does not stop execution — it only writes a line beginning `Assertion failed`. That surprises people coming from `node:assert` (Chapter 46). Never use it to enforce an invariant.

**`console.trace()`** is the fastest way to answer "who called this?" — it prints a stack trace to stderr without throwing.

There are also three inspector-only methods, `console.profile([label])`, `console.profileEnd([label])`, and `console.timeStamp([label])`, which do nothing unless a DevTools inspector session is attached (Chapter 47).

### Building your own `Console`

`new Console(options)` (or the older positional `new Console(stdout[, stderr][, ignoreErrors])`) gives you the same API pointed anywhere:

| Option | Type | Default | Meaning |
|---|---|---|---|
| `stdout` | Writable | — | Required destination for `log`/`info` |
| `stderr` | Writable | `stdout` | Destination for `warn`/`error`/`trace` |
| `ignoreErrors` | boolean | `true` | Swallow write errors on the underlying streams |
| `colorMode` | boolean \| `'auto'` | `'auto'` | `'auto'` decides from the stream's `isTTY` and `getColorDepth()`. Cannot be combined with `inspectOptions.colors` |
| `inspectOptions` | Object \| Map | — | Options forwarded to `util.inspect`. A `Map` from stream to options lets stdout and stderr differ |
| `groupIndentation` | number | `2` | Spaces added per `group()` level |

```mjs
import { Console } from 'node:console';
import { createWriteStream } from 'node:fs';

const audit = new Console({
  stdout: createWriteStream('./audit.log', { flags: 'a' }),
  inspectOptions: { depth: 6, maxStringLength: 200, compact: false },
  colorMode: false,
});

audit.log('%s granted %s', 'alice', 'admin');
```

Note `ignoreErrors` defaults to `true`: a failing write is silently dropped. That is the right default for a debugging console and the wrong one for an audit log — set it to `false` if a lost line is a bug you want to hear about.

## Format specifiers

`console.log()` and friends pass their arguments to `util.format(format[, ...args])`:

| Specifier | Converts via | Notes |
|---|---|---|
| `%s` | `String()` | Except `BigInt` (gets an `n` suffix), `-0`, and objects without a user-defined `toString`/`Symbol.toPrimitive`, which are inspected with `{ depth: 0, colors: false, compact: 3 }` |
| `%d` | `Number()` | Except `BigInt` and `Symbol` |
| `%i` | `parseInt(value, 10)` | Except `BigInt` and `Symbol` |
| `%f` | `parseFloat(value)` | Except `Symbol` |
| `%j` | `JSON.stringify` | Circular references become `'[Circular]'` |
| `%o` | `util.inspect` with `{ showHidden: true, showProxy: true }` | Non-enumerable properties and proxies included |
| `%O` | `util.inspect` with default options | Non-enumerable properties excluded |
| `%c` | — | CSS; **ignored**, and consumes its argument |
| `%%` | — | A literal `%`; consumes no argument |

The rules around leftover arguments are worth memorising because they explain most confusing output:

- A specifier with no corresponding argument is left as-is: `util.format('%s:%s', 'foo')` → `'foo:%s'`.
- Extra arguments are appended, space-separated, and inspected if not strings: `util.format('%s:%s', 'foo', 'bar', 'baz')` → `'foo:bar baz'`.
- If the first argument contains no valid specifier, everything is just concatenated with spaces: `util.format(1, 2, 3)` → `'1 2 3'`.
- With a single argument, it is returned unchanged: `util.format('%% %s')` → `'%% %s'`.

`util.formatWithOptions(inspectOptions, format, ...args)` is identical but takes inspect options first — the way to get, say, `{ depth: null }` into a formatted string without mutating global defaults.

The docs are direct about the cost: `util.format()` "is a synchronous method that is intended as a debugging tool. Some input values can have a significant performance overhead that can block the event loop. Use this function with care and never in a hot code path." Passing a deep object to `console.log` in a request handler runs a recursive graph walk per request.

## `util.inspect` in depth

`util.inspect(object[, options])` is the engine behind every console method. Its options:

| Option | Type | Default | Effect |
|---|---|---|---|
| `depth` | number | `2` | Recursion levels. `null` or `Infinity` recurses to the call-stack limit |
| `colors` | boolean | `false` | ANSI colour codes |
| `showHidden` | boolean | `false` | Include non-enumerable and symbol properties, `WeakMap`/`WeakSet` entries, and user prototype properties |
| `showProxy` | boolean | `false` | Show a proxy's `target` and `handler` |
| `customInspect` | boolean | `true` | Whether to call `[util.inspect.custom]()` |
| `maxArrayLength` | integer | `100` | Elements shown for arrays, TypedArrays, Maps, Sets. `null`/`Infinity` for all, `0` or negative for none |
| `maxStringLength` | integer | `10000` | Characters shown per string; same sentinels |
| `breakLength` | integer | `80` | Column width at which output wraps. `Infinity` for one line |
| `compact` | boolean \| integer | `3` | `false` puts every key on its own line; a number unites that many inner elements on one line if they fit in `breakLength` |
| `sorted` | boolean \| Function | `false` | Sort object properties and Map/Set entries; a function is used as a comparator |
| `getters` | boolean \| `'get'` \| `'set'` | `false` | Invoke getters — **may cause side effects** |
| `numericSeparator` | boolean | `false` | Underscore every three digits in numbers and bigints |

The default `depth: 2` is the source of the single most common confusion in Node debugging: nested objects print as `[Object]` and people conclude the data is missing.

```js
import { inspect } from 'node:util';

const config = { a: { b: { c: { d: 'here' } } } };
console.log(config);
// { a: { b: { c: [Object] } } }

console.log(inspect(config, { depth: null, colors: true, compact: false }));
// the whole thing, one key per line
```

`sorted: true` deserves a mention for a non-obvious use: two objects with the same content but different key insertion order produce different inspect output, which makes diffing test snapshots miserable. `sorted: true` makes the output canonical.

`getters: true` is a genuine hazard. Inspecting an object invokes its getters, and a getter that lazily opens a connection or increments a counter now does so because you logged the object. Leave it off unless you know the object.

### Custom inspection

Give a class a method keyed by `util.inspect.custom` and you control how it prints. The symbol is registered globally, so `Symbol.for('nodejs.util.inspect.custom')` works and the code stays portable to browsers, where it is simply ignored.

```js
const customInspect = Symbol.for('nodejs.util.inspect.custom');

class ApiKey {
  constructor(value) {
    this.value = value;
  }
  [customInspect](depth, options, inspect) {
    return `ApiKey <${this.value.slice(0, 4)}…redacted>`;
  }
}

console.log(new ApiKey('sk_live_9f2c8a11'));
// ApiKey <sk_l…redacted>
```

This is the cheapest redaction mechanism in Node: **make the secret-bearing type unprintable at the type level**, and no amount of careless logging downstream can leak it. Note the third argument — `util.inspect` itself is passed in, so you can recursively inspect sub-values with the caller's options.

The escape hatch: `console.dir(obj, options)` explicitly bypasses custom inspect functions, and so does `util.inspect` with `customInspect: false`. Redaction via `inspect.custom` is a guard rail, not a security boundary.

`util.inspect.defaultOptions` changes the defaults used by `console.log`, `util.format`, and everything else that inspects implicitly:

```js
import { inspect } from 'node:util';
inspect.defaultOptions.depth = 4;
inspect.defaultOptions.maxArrayLength = 50;
```

Useful once, at the top of a development entry point. Do not do it in a library — you would be silently changing the behaviour of your dependents' logs.

### `util.styleText`

Available since v20.12.0 / v21.7.0, `util.styleText(format, text[, options])` applies terminal styling and, crucially, respects the ecosystem conventions for turning colour off: it honours `NO_COLOR`, `NODE_DISABLE_COLORS`, and `FORCE_COLOR`.

```mjs
import { styleText } from 'node:util';
import { stderr } from 'node:process';

console.log(styleText('green', 'Success'));
console.error(styleText('red', 'Failed', { stream: stderr }));
console.log(styleText(['underline', 'italic'], 'Emphatic'));
console.log(styleText('#ff5733', 'TrueColor orange'));
```

`format` is a name from `util.inspect.colors`, an array of such names (applied left to right, so later entries can override earlier ones), or a hex string in `#RGB` or `#RRGGBB` form using 24-bit ANSI. The special value `'none'` applies no styling. Options are `stream` (**Default:** `process.stdout`) and `validateStream` (**Default:** `true`), which checks whether that stream can actually display colour — pass `{ stream: process.stderr }` when the text is headed for stderr, or you will validate the wrong stream.

Use it in CLIs. Never use it in a service's structured logs; ANSI escape sequences in a JSON log field are a parsing bug waiting to happen. `util.stripVTControlCharacters(str)` exists to undo the damage if you inherit such output.

## `util.debuglog` and `NODE_DEBUG`

`util.debuglog(section[, callback])` returns a function that writes to **stderr** only if `section` appears in the `NODE_DEBUG` environment variable — and is otherwise a no-op.

```mjs
import { debuglog } from 'node:util';

const log = debuglog('cache');
log('miss for key %s (size=%d)', key, size);
```

```bash
NODE_DEBUG=cache node server.js
# CACHE 3245: miss for key user:17 (size=204)
```

`NODE_DEBUG` accepts a comma-separated list (`NODE_DEBUG=fs,net,tls`) and wildcards (`NODE_DEBUG=foo*` matches `foo-bar`). Node's own internals use this mechanism, which is why `NODE_DEBUG=net` is such a good first move when a socket misbehaves.

Two refinements. `debuglog('section').enabled` is a boolean you can branch on, so you can skip building an expensive argument entirely:

```js
const log = debuglog('cache');
if (log.enabled) log('state: %O', buildExpensiveSnapshot());
```

And the optional `callback` receives a more optimized logging function the first time the log function is called, letting you replace the wrapper:

```js
let log = debuglog('cache', (debug) => { log = debug; });
```

`util.debug(section)` is an alias, provided so that code using only `.enabled` reads sensibly.

This is the right tool for **library-internal tracing**: zero cost when disabled, no dependency, and a convention users already know. It is not a substitute for application logging — output is unstructured, goes to stderr, and cannot be enabled per-request.

## Logging strategy for real services

### Structured JSON beats printf

Compare:

```
2026-08-19T09:14:02Z user 1874 failed checkout: card declined (order 55123)
```

```json
{"time":"2026-08-19T09:14:02.113Z","level":"warn","msg":"checkout_failed","user_id":1874,"order_id":55123,"reason":"card_declined","request_id":"01J8X…"}
```

The first requires a regex to answer "how many card declines this hour?" and breaks the day someone rewords the message. The second is a database row. Every log aggregator indexes JSON fields natively; none of them reliably parse your prose.

Rules that follow from this:

- **One event per line, one JSON object per line.** Newline-delimited JSON is the format every collector understands.
- **The message is an identifier, not a sentence.** `checkout_failed`, not `The checkout for user 1874 failed`. Put the variables in fields.
- **Field names are a schema.** Pick `user_id` or `userId` and never mix. Renaming a field breaks every dashboard built on it.
- **Timestamps in ISO 8601, UTC.** Always.

### Levels, and what belongs at each

| Level | Meaning | Examples | Alertable? |
|---|---|---|---|
| `fatal` | The process cannot continue | Config invalid at boot, port already in use | Yes, immediately |
| `error` | An operation failed and a human should know | Unhandled exception, database unreachable, data corruption | Yes |
| `warn` | Something recoverable and abnormal | Retry succeeded, deprecated endpoint used, cache miss storm | Trend, not page |
| `info` | Business-meaningful events | Server listening, request completed, user created | No |
| `debug` | Developer detail | Chosen query plan, cache key computed | No — off in production |
| `trace` | Firehose | Every function entry | Never in production |

The discipline that matters: **a validation failure caused by a bad client request is not an `error`.** If a user posting malformed JSON pages you, your alerts will be ignored within a week. `error` means *you* have a problem. `warn` means the system handled it. Getting this boundary right is worth more than any logging library.

### Correlation ids via `AsyncLocalStorage`

A log line without a request id is nearly useless in a concurrent service — you cannot reconstruct one request's story out of interleaved output. Threading an id through every function signature is unbearable. `AsyncLocalStorage` (Chapter 15) solves it:

```mjs
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const context = new AsyncLocalStorage();

function log(level, msg, fields = {}) {
  const store = context.getStore();
  process.stdout.write(JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...(store ? { request_id: store.requestId } : null),
    ...fields,
  }) + '\n');
}

createServer((req, res) => {
  const requestId = req.headers['x-request-id'] ?? randomUUID();
  context.run({ requestId }, () => {
    res.setHeader('x-request-id', requestId);
    log('info', 'request_start', { method: req.method, path: req.url });
    handle(req, res);
  });
}).listen(3000);
```

Two details make this production-grade. Accepting an inbound `x-request-id` lets the id span services, so a trace crosses process boundaries. Echoing it back in the response means a user reporting an error can hand you the exact id.

Store **primitives only**. Putting `req` and `res` in the store retains the whole request graph for as long as any async resource created during that request survives — the leak shape from Chapter 50.

### What must never be logged

| Never log | Why | Instead |
|---|---|---|
| Passwords, tokens, API keys, session cookies | Instant credential compromise; logs are widely readable and long-lived | Log a hash prefix or nothing |
| Full `Authorization` headers | Same | Log the scheme only (`Bearer`) |
| Full request bodies | Contains everything above, plus PII, plus unbounded size | Log a size and a content type |
| Full response bodies | Same | Log the status and a byte count |
| PII: emails, names, addresses, phone numbers, government IDs | Regulatory exposure; log retention is rarely GDPR-compliant | Log an opaque user id |
| Card numbers, CVVs | PCI-DSS violation | Log the last four digits at most |
| Entire error objects with attached context | Error objects routinely carry the request that caused them, including credentials | Log `err.message`, `err.code`, `err.stack` |

That last row catches experienced people. Many libraries attach the failing request — headers and all — to the error they throw. `console.error(err)` then prints your database password. Log a **denylist-filtered projection** of an error, never the error itself:

```js
function serializeError(err) {
  return { name: err.name, message: err.message, code: err.code, stack: err.stack };
}
```

Prefer allowlists to denylists throughout. A denylist protects the fields you thought of; an allowlist protects the ones you did not.

### Sampling and cost

Logs cost money — ingestion, indexing, and retention are usually priced per gigabyte — and they cost latency, since every line is formatting plus a write.

- **Sample the boring, keep all of the interesting.** Log 1% of successful requests and 100% of errors. A `sampled` field lets a dashboard scale the counts back up.
- **Never log at `debug` in production by default.** Make it a runtime toggle — an environment variable read on SIGHUP, or a per-request header for allowlisted callers.
- **Rate-limit repeated events.** A dependency failing 10,000 times a second produces 10,000 identical lines, of which the first and a count are all you needed.
- **Metrics beat logs for anything countable.** "How many 500s?" is a counter, not a log query. Chapter 49's histograms are cheaper by orders of magnitude.
- **Bound every field.** A 2 MB stack trace in a log line will be truncated by some component of your pipeline, usually the one that then fails to parse the JSON.

### stdout is the interface

In a container, do not write log files, do not rotate them, do not manage them. Write newline-delimited JSON to stdout and let the platform collect it. Docker, Kubernetes, systemd, and every PaaS treat the process's standard streams as the log stream. A file inside a container is invisible, unrotated, and gone when the container is rescheduled.

Two corollaries. First, **anything else your process writes to stdout corrupts your logs** — a stray `console.log('here')` in a dependency injects an unparseable line. Some teams reserve stdout strictly for structured logs and send everything else to stderr. Second, back-pressure is real: if the collector stops reading, that pipe fills. Budget for it.

### `console` versus a logging library

Honest guidance:

**Use `console` when** you are writing a CLI, a build script, a test helper, a small tool, or any program where a human reads the output as it happens. It is built in, has zero dependencies, and its formatting is genuinely good.

**Use a logging library** (pino, winston, bunyan) for any long-lived service. What you get that `console` does not provide, and that you should not build yourself:

- Levels with runtime filtering, so `debug` calls cost nothing when disabled.
- JSON serialization tuned for speed — pino's is several times faster than `JSON.stringify` on typical log objects.
- Configurable, tested redaction of nested paths.
- Child loggers that carry bound fields, which composes with `AsyncLocalStorage`.
- Asynchronous transports that move formatting and writing off the main thread.

The genuine middle ground: a ~30-line module wrapping `process.stdout.write` with a level check, `JSON.stringify`, and an `AsyncLocalStorage` lookup — like the `log()` function above — is a legitimate choice for a small service, and it is strictly better than raw `console.log`. What is not defensible is `console.log` with template strings in a service you intend to operate.

## Common mistakes

### ❌ `console.log` in a hot path

```js
app.use((req, res, next) => {
  console.log('request', req.method, req.url, req.headers);
  next();
});
```

`util.format` inspects the headers object on every request, and the write may block. At a few thousand requests per second this shows up directly in your p99.

```js
// Sample, keep it flat, and let the level filter do the work.
if (Math.random() < 0.01) {
  log('info', 'request', { method: req.method, path: req.url });
}
```

### ❌ Logging an error object directly

```js
catch (err) {
  console.error('request failed', err);
}
```

Many HTTP and database clients attach the originating request — headers, connection string, credentials — to the error. This prints all of it.

```js
catch (err) {
  log('error', 'request_failed', {
    err: { name: err.name, message: err.message, code: err.code, stack: err.stack },
  });
}
```

### ❌ Treating `console.assert` as an assertion

```js
console.assert(user != null, 'user must exist');
processUser(user);   // still runs, with user === null
```

`console.assert()` writes a line and returns. It does not throw and does not stop execution.

```js
import { strict as assert } from 'node:assert';
assert(user != null, 'user must exist');
```

### ❌ Concluding the data is missing because you saw `[Object]`

```js
console.log(config);   // { server: { tls: [Object] } }
```

The default `depth` is `2`. The data is there.

```js
import { inspect } from 'node:util';
console.log(inspect(config, { depth: null }));
```

### ❌ Storing request objects in `AsyncLocalStorage`

```js
context.run({ req, res, user }, () => handle(req, res));
```

Every async resource created during the request retains the store, so the whole request and response graph stays alive as long as any background task started during it.

```js
context.run({ requestId, userId: user.id }, () => handle(req, res));
```

## Production notes

- **Know which side of the sync/async table you are on.** On POSIX, redirecting stdout to a file makes every `console.log()` a blocking write; in a container it is a pipe and asynchronous — until the collector stalls and the buffer fills. Test your logging under a stalled-collector scenario before you need to.
- **Move formatting off the request path.** Structured logging with a fast serializer and an asynchronous transport keeps the event loop free. If you are on `console`, at minimum keep log objects flat and shallow so `util.inspect` has nothing to recurse into.
- **Redact at the type level.** A `[util.inspect.custom]` method on your credential and token classes means a careless `console.log` prints a placeholder. It is a guard rail — `console.dir` and `customInspect: false` bypass it — but it catches the realistic mistake.
- **Make log level runtime-adjustable.** Re-reading a level from the environment on `SIGHUP`, or exposing an authenticated admin endpoint, lets you turn on `debug` for ninety seconds during an incident instead of deploying a new build.
- **Budget log volume like any other resource.** Set a per-instance lines-per-second ceiling and drop past it with a counter of what was dropped. An unbounded log path turns one bad request into an outage of your logging pipeline for everyone.
- **Never let logging failure take down the service.** `ignoreErrors` defaults to `true` on `Console` for a reason. If you build your own writer, wrap it so a failed write is counted and discarded, not thrown.
- **Reserve stdout for machine-readable output.** In a CLI, human-facing chatter belongs on stderr so that piping the tool's stdout into another program keeps working. `util.styleText` with `{ stream: process.stderr }` validates the correct stream for that case.
- **Correlate everything.** A `request_id` on every line, propagated inbound and echoed in the response, is the single highest-value field in your log schema. Add `trace_id` too if you run distributed tracing (Chapter 62).

## Exercises

1. **Prove the blocking behaviour.** Write a script that logs 100,000 lines and measures elapsed time using `performance.now()`. Run it three ways: to a terminal, redirected to a file, and piped to `cat`. *Success:* you report three different durations and explain each using the sync/async table for your platform.

2. **Build a minimal structured logger.** In under 40 lines, implement `log(level, msg, fields)` that respects a `LOG_LEVEL` environment variable, writes NDJSON to stdout, and merges a `request_id` from `AsyncLocalStorage`. *Success:* two concurrent requests produce interleaved lines that can be separated cleanly by `request_id`, and `LOG_LEVEL=warn` suppresses `info`.

3. **Redact by construction.** Define a `Secret` class holding a token, with a `[Symbol.for('nodejs.util.inspect.custom')]` method that prints `Secret <redacted>`. Verify it is redacted through `console.log`, string interpolation, and `JSON.stringify` — and find the two ways it can still leak. *Success:* you can name `console.dir` and `inspect(..., { customInspect: false })` as the bypasses.

4. **Instrument a library with `debuglog`.** Add `debuglog('mylib')` tracing to a small module, using `.enabled` to guard one expensive message. *Success:* with `NODE_DEBUG` unset, the expensive function is never called (prove it with a counter); with `NODE_DEBUG=mylib*`, the trace appears on stderr.

5. **Redaction audit.** Take an existing service (or write a 50-line one) and add a wrapper that runs every log payload through an allowlist before serializing. Then deliberately try to log a full request object, a database error with a connection string, and a user record with an email. *Success:* nothing sensitive reaches stdout, and the wrapper logs a counter of dropped fields so you can tell when the allowlist is too narrow.

## Recap

- The global `console` is exactly `new Console({ stdout: process.stdout, stderr: process.stderr })` — a formatting layer over two streams, not a logger.
- Whether a console write blocks depends on platform and destination. On POSIX, files and TTYs are synchronous and pipes are asynchronous; on Windows it is the reverse for pipes and TTYs.
- `log`, `info`, `debug`, and `table` go to stdout; `error`, `warn` (an alias of `error`), and `trace` go to stderr. `console.assert` never throws.
- `new Console(options)` takes `stdout`, `stderr`, `ignoreErrors`, `colorMode`, `inspectOptions`, and `groupIndentation`.
- The specifiers are `%s %d %i %f %j %o %O %c %%`; `%c` is ignored but still consumes its argument. `util.format` is explicitly documented as unsuitable for hot paths.
- `util.inspect`'s default `depth: 2` is why you see `[Object]`. `maxArrayLength: 100`, `maxStringLength: 10000`, `breakLength: 80`, and `compact: 3` are the other defaults worth knowing.
- `util.inspect.custom` (globally registered as `Symbol.for('nodejs.util.inspect.custom')`) redacts at the type level; `console.dir` and `customInspect: false` bypass it.
- `util.debuglog(section)` is free when `NODE_DEBUG` does not name the section, and `.enabled` lets you skip building expensive messages.
- For services: NDJSON to stdout, message names not sentences, `error` reserved for problems that are yours, correlation ids via `AsyncLocalStorage` storing primitives only, allowlist redaction, sampling for successes, and a real logging library once the service is long-lived.

## Where to go next

- [Chapter 15 — AsyncLocalStorage and Context Propagation](../part2-async/15-async-context.md) — the mechanism behind correlation ids.
- [Chapter 25 — The Process Object: argv, env, stdio, exit codes](../part4-system/25-process-object.md) — the full semantics of `process.stdout` and `process.stderr`.
- [Chapter 46 — Assertions](46-assertions.md) — what `console.assert` is not.
- [Chapter 48 — Diagnostics Channel and Trace Events](48-diagnostics-channel-tracing.md) — structured in-process events without the log pipeline.
- [Chapter 49 — Measuring Performance with `perf_hooks`](49-perf-hooks.md) — metrics, which are cheaper than logs for anything countable.
- [Chapter 62 — Observability in Production](../part9-production/62-observability.md) — logs, metrics, and traces as one system.
- Official documentation: <https://nodejs.org/docs/latest/api/console.html> and <https://nodejs.org/docs/latest/api/util.html>
