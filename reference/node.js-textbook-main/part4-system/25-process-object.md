---
chapter: 25
part: "Part IV — System Interfaces"
title: "The Process Object: argv, env, stdio, exit codes"
level: intermediate
reading_time: "35 min"
prerequisites: [8, 9, 18]
source_docs:
  - "doc/api/process.md"
  - "doc/api/util.md"
  - "doc/api/os.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/process.html"
node_baseline: "27.0.0-pre"
---

# Chapter 25 — The Process Object: argv, env, stdio, exit codes

**What you will learn**

- Read command-line arguments correctly, and parse them with the built-in `util.parseArgs()` instead of a dependency.
- Explain the exact difference between `process.argv`, `process.argv0`, `process.execPath`, and `process.execArgv`.
- Use `process.env` without being surprised by string coercion, `delete`, Windows case-insensitivity, or its cost in a hot path.
- Predict whether a write to `process.stdout` blocks the event loop, given a platform and a destination.
- Set an exit code without truncating your own output, and read the meaning of the exit codes Node produces.
- Measure a process: uptime, monotonic time, CPU time, and the five fields of `memoryUsage()`.

**Why this matters**

Almost everything connecting your program to the world outside the V8 heap hangs off one global object. The container passes configuration through `process.env`. The operator passes flags through `process.argv`. The log pipeline reads `process.stdout`. The orchestrator reads your exit code to decide whether to restart you. Get these wrong and the failure looks like magic: a CLI that prints half its help text, a service that reports success after crashing, a handler that stalls for 40 ms whenever the log collector is slow.

None of it is hard, but almost all of it has a sharp edge invisible from the API signature. `process.exit()` looks like the obvious way to stop a program; it is the most common way to lose output. `process.stdout.write()` looks asynchronous, and on Linux writing to a terminal it is not. This chapter is about those edges.

## Two ways to reach the same object

`process` is a global. It is also a module:

```mjs
import process, { argv, env, exit } from 'node:process';
```

```cjs
const process = require('node:process');
const { argv, env, exit } = require('node:process');
```

The module and the global are the same object; importing it explicitly makes the dependency visible and survives harnesses that stub globals. One destructuring caveat — `const { env } = process` copies a *reference to the same mutable object*, so it stays live, but `const { exitCode } = process` copies a *value* and will not track later changes. `process` is also an `EventEmitter`, which Chapter 26 leans on heavily.

## Command-line arguments

`process.argv` is an array of strings describing how the process was launched.

- `argv[0]` is `process.execPath` — the absolute path of the Node binary, symlinks resolved.
- `argv[1]` is the absolute path to the program entry point, if one was given.
- The rest are your arguments, in order, exactly as the shell handed them over.

```bash
node report.js --format=json users.csv
```

```js
// process.argv →
// [ '/usr/local/bin/node',
//   '/home/dana/app/report.js',
//   '--format=json',
//   'users.csv' ]
```

So the arguments *you* care about are `process.argv.slice(2)` — a slice so universal that `util.parseArgs()` does it for you by default.

Three related properties are easy to confuse:

| Property | What it holds | Typical use |
|---|---|---|
| `process.argv` | Full launch vector: exec path, entry point, then user args | Reading user input |
| `process.argv0` | A read-only copy of the *original* `argv[0]`, before Node replaced it with `execPath` | Detecting how the binary was invoked (e.g. via a shim that used `exec -a`) |
| `process.execPath` | Absolute path of the running Node binary, symlinks resolved | Re-spawning yourself with the same runtime |
| `process.execArgv` | Node's *own* options, e.g. `--inspect`, `--require` | Passing the same runtime configuration to a child |

`execArgv` is what makes child processes reproducible. Given:

```bash
node --experimental-vm-modules --require ./instrument.js server.js --port 8080
```

`process.execArgv` is `['--experimental-vm-modules', '--require', './instrument.js']` and `process.argv` is `['/usr/local/bin/node', '/path/to/server.js', '--port', '8080']`. Node's own flags never appear in `argv`, and flags that come *after* the script name are yours, not Node's. If you spawn a worker and forget to forward `execArgv`, your instrumentation silently stops applying to the child.

### Parsing with `util.parseArgs()`

Hand-rolled argument loops mishandle `--flag=value` versus `--flag value`, cannot group short flags, and forget `--`. Node ships a parser: `util.parseArgs()`, stable since **v20.0.0** (added in v18.3.0 / v16.17.0).

```mjs
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: {
    format:  { type: 'string',  short: 'f', default: 'text' },
    include: { type: 'string',  short: 'i', multiple: true, default: [] },
    verbose: { type: 'boolean', short: 'v' },
    help:    { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log('usage: report [-v] [-f json|text] [-i glob]... <file...>');
  process.exitCode = 0;
} else {
  console.log({ format: values.format, include: values.include, files: positionals });
}
```

```bash
node report.js -vf json -i '*.csv' -i '*.tsv' users.csv orders.csv
# { format: 'json', include: [ '*.csv', '*.tsv' ], files: [ 'users.csv', 'orders.csv' ] }
```

Note that `-vf json` expanded into `-v` and `-f json`, and `--include` collected into an array because it was declared `multiple: true`.

The `config` object supports these properties:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `args` | `string[]` | `process.argv` with exec path and filename removed | The tokens to parse |
| `options` | `Object` | — | Long option name → descriptor (see below) |
| `strict` | `boolean` | `true` | Throw on unknown options or type mismatches |
| `allowPositionals` | `boolean` | `false` if `strict`, otherwise `true` | Whether bare arguments are permitted |
| `allowNegative` | `boolean` | `false` | Allow `--no-foo` to set boolean `foo` to `false` (v22.4.0 / v20.16.0) |
| `tokens` | `boolean` | `false` | Also return a low-level token stream |

Each entry in `options` is a descriptor:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | `'string'` or `'boolean'` | — | Required. There is no `'number'`; convert and validate yourself |
| `multiple` | `boolean` | `false` | Collect repeats into an array instead of last-wins |
| `short` | `string` | — | A single-character alias |
| `default` | `string \| boolean \| string[] \| boolean[]` | — | Value used when the option is absent; must match `type`, and must be an array when `multiple` is `true` |

Two defaults trip people up. **`strict` is `true`**, so an unknown flag throws instead of being ignored — right for a CLI, wrong for a wrapper that forwards unrecognised flags onward. And **`allowPositionals` follows `strict`**: turning strict off silently turns positionals on. For strict validation *and* file arguments you must say `allowPositionals: true` explicitly, as above.

A `default` applies only when the flag is absent. If the flag appears with a falsy value, the parsed value wins — `--format=` yields the empty string, not `'text'`.

`values` is a null-prototype object, which makes `values[userSuppliedName]` safe from prototype pollution but means `values.hasOwnProperty('x')` throws. Use `Object.hasOwn(values, 'x')` or `'x' in values`.

### Going lower with `tokens`

`parseArgs` deliberately does not implement subcommands, mutually exclusive flags, "count how many times `-v` was passed", or custom negation. It hands you the raw token stream and you build the policy on top.

```mjs
import { parseArgs } from 'node:util';

const { values, tokens } = parseArgs({
  options: { verbose: { type: 'boolean', short: 'v' } },
  tokens: true,
});

// -vvv should mean level 3, but `values.verbose` is just `true`.
const verbosity = tokens.filter(
  (t) => t.kind === 'option' && t.name === 'verbose',
).length;

console.log({ verbose: values.verbose, verbosity });
```

Each token carries `kind` (`'option'`, `'positional'`, or `'option-terminator'`) and `index`, its position in `args`. Option tokens add `name` (always the long name), `rawName` (how it was written, e.g. `-v`), `value` (`undefined` for booleans), and `inlineValue` (whether it was written as `--foo=bar`). Positional tokens carry `value`. Short-option groups expand — `-vvv` produces three option tokens, which is what makes the counting trick work.

The `option-terminator` token is the `--` separator; everything after it is a positional even if it starts with a dash.

## The environment

`process.env` is an object view over the process environment. Three rules govern it.

**Everything is a string.** There are no numbers, no booleans, no `null`. Assigning a non-string coerces it, and that coercion is **[Deprecated]** — future Node versions may throw for values that are not a string, number, or boolean. `env.PORT = 8080` stores `'8080'`. `env.DEBUG = null` stores the four-character string `'null'`, which is truthy. This is the single most common environment bug:

```js
// Wrong: 'false' is a non-empty string.
if (process.env.FEATURE_FLAG) { /* always taken */ }

// Right: decide what "on" means and check for it.
const enabled = process.env.FEATURE_FLAG === '1' || process.env.FEATURE_FLAG === 'true';
```

**Removal means `delete`.** Setting a variable to `undefined` stores the string `'undefined'`. Use `delete process.env.SECRET` to actually remove it — worth doing after reading a credential, so it does not leak into a diagnostic report or a spawned child.

**Windows environment variables are case-insensitive.** There, `process.env.TEST = 1` makes `process.env.test` read back `1`; on Linux and macOS those are two distinct variables. Pick one convention (`SCREAMING_SNAKE_CASE`) and stick to it. A further wrinkle: a `Worker` thread's copy of `process.env` is case-*sensitive* on Windows, unlike the main thread.

Mutating `process.env` affects only this process — not the parent shell, and not `Worker` threads, which get their own copy at construction time (or whatever the `Worker` constructor's `env` option specified). Only the main thread can make changes visible to the OS and to native addons.

### Reading `env` is not free

`process.env` is not a plain object. Every property read crosses into C++ to query the real environment block, and every enumeration builds a fresh object. In a tight loop or a per-request path, that cost is measurable.

```js
// Bad: a native call on every request.
function handler(req, res) {
  if (process.env.LOG_LEVEL === 'debug') log(req);
}

// Good: read once at module load, into plain JS.
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
function handler(req, res) {
  if (LOG_LEVEL === 'debug') log(req);
}
```

Reading configuration once at startup is better practice anyway: one place to validate and coerce, and no possibility of behaviour changing halfway through a process's life.

For `.env` files you no longer need a dependency: use the `--env-file=file` CLI flag (or `--env-file-if-exists=file`), or call `process.loadEnvFile(path)`, default path `'./.env'`, stable since v24.10.0 / v22.21.0. `NODE_OPTIONS` set inside a `.env` file has no effect.

## Standard I/O

`process.stdout`, `process.stderr`, and `process.stdin` are streams bound to file descriptors 1, 2, and 0. The exact class depends on the destination: each is a `net.Socket` (a Duplex stream) unless the descriptor refers to a **file**, in which case `stdout`/`stderr` are plain Writables and `stdin` a plain Readable. The `fd` property is fixed (`1`, `2`, `0`) and does not exist inside `Worker` threads.

### The surprising part: sometimes they block

Ordinary Node streams never block the event loop. The process I/O streams sometimes do. Whether a write is synchronous depends on *both* the destination and the platform:

| Destination | POSIX (Linux, macOS, BSD) | Windows |
|---|---|---|
| File (`node app.js > out.log`) | **synchronous** | **synchronous** |
| TTY (interactive terminal) | **synchronous** | asynchronous |
| Pipe or socket (`node app.js \| tee`) | asynchronous | **synchronous** |

Read that table twice; it explains a whole family of production mysteries.

`console.log()` writes to `process.stdout` and inherits this behaviour. In a terminal on macOS, every `console.log()` is a synchronous write — the event loop stops until the terminal takes the bytes. In a Linux container with stdout redirected to a log file it is *still* synchronous. Pipe it to a log shipper instead and it becomes asynchronous.

Synchronous writes exist because output then cannot be interleaved or silently dropped. The cost is severe: the write blocks until the receiver accepts the data. If that receiver is a slow disk, a saturated terminal, or a full pipe whose reader has stalled, your entire event loop stops — no timers, no socket reads, every in-flight request waiting. High-volume `console.log()` in a request handler is an availability risk, not a style problem, and it does not reproduce on a laptop with a fast terminal.

The rule: **route application logs through a logging library that writes asynchronously with backpressure**, and reserve `console.log()` for CLI output and development. Chapter 51 covers this.

### Detecting a terminal

Check `isTTY`. It is `true` on TTY streams and `undefined` otherwise, so coerce it:

```js
const interactive = Boolean(process.stdout.isTTY);
```

```bash
node -p "Boolean(process.stdout.isTTY)"        # true
node -p "Boolean(process.stdout.isTTY)" | cat  # false
```

This is the switch for anything cosmetic — progress bars, spinners, ANSI colour — and for behaviour too: a tool reading `stdin` should act differently when `process.stdin.isTTY` is false, because that means piped data rather than a waiting human. Chapter 27 goes deep on `node:tty`.

## Exiting

There are two ways to end a Node program, and only one of them is usually right.

`process.exit([code])` terminates immediately. Node runs the `'exit'` listeners and stops. Anything still pending in the event loop is abandoned — including **unflushed writes to stdout and stderr**. This is the bug:

```js
// Broken: on Linux with stdout piped, the help text may never appear.
printUsage();
process.exit(1);
```

A piped write on POSIX is asynchronous, so the bytes are queued, not written, when `exit()` fires. The user sees a failing exit code and no explanation.

`process.exitCode` is the fix. Set it and let the process end naturally when the event loop drains:

```js
printUsage();
process.exitCode = 1;
```

The default is `undefined`; accepted types are an integer or an integer-valued string such as `'1'`. Explicit settings beat implicit ones: if Node would have exited `13` for an unsettled top-level `await` but you set `process.exitCode = 9`, you get 9. An argument to `process.exit(42)` overrides an earlier `process.exitCode = 9`.

Use `process.exit()` only when you must stop *now* — for example a hard-kill timer after graceful shutdown has overrun (Chapter 26). To terminate on an unrecoverable error, throwing an uncaught error is safer, because it produces a stack trace and the standard exit code. Inside a `Worker` thread, `process.exit()` stops that thread, not the process.

### Exit codes

Node reserves a set of codes. Knowing them saves a lot of guesswork when a container restarts.

| Code | Meaning |
|---|---|
| `0` | Normal exit — event loop drained, or `exit(0)` |
| `1` | Uncaught fatal exception, unhandled by any `'uncaughtException'` listener |
| `2` | Unused (reserved by Bash for builtin misuse) |
| `3` | Internal JavaScript parse error (Node's own bootstrap; essentially never seen) |
| `4` | Internal JavaScript evaluation failure |
| `5` | Fatal error inside V8 — look for `FATAL ERROR` on stderr (this is where out-of-memory lands) |
| `6` | Non-function internal exception handler |
| `7` | Internal exception handler threw while handling an exception |
| `8` | Unused (older Node used it for uncaught exceptions) |
| `9` | Invalid argument — unknown CLI option, or an option missing its value |
| `10` | Internal JavaScript run-time failure |
| `12` | Invalid debug argument — `--inspect` port invalid or unavailable |
| `13` | Unsettled top-level `await` |
| `14` | Snapshot failure |
| `>128` | Killed by signal: `128 + signal number`. `SIGABRT` is 6, so 134; `SIGKILL` is 9, so 137; `SIGTERM` is 15, so 143 |

The signal codes are the ones you meet in production. **137** almost always means the kernel OOM killer or the container runtime sent `SIGKILL` — you exceeded your memory limit. **143** means something sent `SIGTERM` and you did not handle it. **134** usually means an abort. For your own failures, stay inside `1`–`125` and avoid Node's reserved values.

## Measuring the process

### Location and age

`process.cwd()` returns the working directory; `process.chdir(directory)` changes it, throwing if the target does not exist, and is **not available in `Worker` threads**. Treat the working directory as process-global mutable state: changing it mid-run breaks every relative path any other module resolves later. Resolve against `import.meta.dirname` or `__dirname` instead (Chapter 24).

`process.uptime()` returns fractional seconds since this process started. Expose that in health checks rather than computing a `Date.now()` delta.

### Time that doesn't lie

`process.hrtime.bigint()` returns a monotonic clock reading in nanoseconds as a `BigInt`. Monotonic means it is measured from an arbitrary past point and is immune to wall-clock adjustments — NTP steps, daylight saving, a user changing the clock. Every duration measurement should use it, never `Date.now()`.

```js
const start = process.hrtime.bigint();
await doWork();
const micros = Number(process.hrtime.bigint() - start) / 1000;
console.log(`took ${micros.toFixed(1)}µs`);
```

The older tuple-returning `process.hrtime([time])` is **[Legacy]** (stability 3): still working, but the `bigint` form replaces its awkward diff argument with plain subtraction. `perf_hooks` (Chapter 49) builds richer measurement on the same clock.

### Memory

`process.memoryUsage()` returns five numbers, all in bytes. Understanding what each one covers is the difference between diagnosing a leak and staring at a graph.

| Field | What it measures |
|---|---|
| `rss` | Resident Set Size: total physical memory held by the process — every JavaScript object, every C++ object, the code, the stacks. This is what the OS and your container limit care about |
| `heapTotal` | Memory V8 has *reserved* for the JavaScript heap |
| `heapUsed` | Memory V8 is actually *using* inside that heap |
| `external` | Memory used by C++ objects bound to JavaScript objects |
| `arrayBuffers` | Memory for `ArrayBuffer`s and `SharedArrayBuffer`s, including all Node `Buffer`s. **Also counted inside `external`** |

The relationships matter. `heapUsed ≤ heapTotal`, and `heapTotal` is only part of `rss`. A JavaScript object leak shows as `heapUsed` climbing across garbage collections. A `Buffer` leak shows in `arrayBuffers` and `external` while `heapUsed` stays flat — which is why teams charting only `heapUsed` miss buffer leaks entirely. And `rss` can grow while everything else is stable: on glibc systems, `malloc` fragmentation alone produces sustained `rss` growth with a steady `heapTotal`.

`memoryUsage()` iterates every memory page, so it can be slow in a large process. If you only need `rss`, call `process.memoryUsage.rss()` — same number, faster. Inside `Worker` threads, `rss` is a whole-process value while the other fields describe the current thread.

Two container-aware companions became stable in v24.0.0 / v22.16.0: `process.constrainedMemory()` returns the OS-imposed memory limit (the cgroup limit inside a container) or `0` if unknown, and `process.availableMemory()` returns how much is still available. These are the right inputs for a cache-sizing heuristic; `os.totalmem()` is not, because it reports the host's memory and ignores your container limit (Chapter 27).

### CPU and kernel counters

`process.cpuUsage([previousValue])` returns `{ user, system }` in **microseconds**; pass a previous reading to get a delta. Because several cores may work for one process, the value can exceed elapsed wall-clock time. Dividing by elapsed time gives the average core count in use:

```js
const t0 = process.hrtime.bigint();
const c0 = process.cpuUsage();

setInterval(() => {
  const c = process.cpuUsage(c0);
  const elapsedMicros = Number(process.hrtime.bigint() - t0) / 1000;
  const cores = (c.user + c.system) / elapsedMicros;
  console.log(`cpu: ${(cores * 100).toFixed(1)}% of one core`);
}, 5000).unref();
```

`process.threadCpuUsage([previousValue])` (v23.9.0 / v22.19.0) is the same measurement for the current worker thread only.

`process.resourceUsage()` exposes the underlying `uv_getrusage` struct. The useful fields are `userCPUTime` and `systemCPUTime` (microseconds, identical to `cpuUsage()`), `maxRSS` (peak RSS in **kibibytes**, not bytes — a common unit error), `minorPageFault`/`majorPageFault`, `fsRead`/`fsWrite`, and `voluntaryContextSwitches`/`involuntaryContextSwitches`. Others — `sharedMemorySize`, `unsharedDataSize`, `unsharedStackSize`, `swappedOut`, `ipcSent`, `ipcReceived`, `signalsCount` — exist for struct compatibility but are **not supported by any platform** and read as `0`. On Windows, `majorPageFault` and both context-switch counters are also unsupported.

### How many cores?

`availableParallelism()` lives on **`node:os`, not on `process`** — worth checking, because the name sounds like it belongs here:

```mjs
import { availableParallelism } from 'node:os';

const poolSize = availableParallelism();
```

Added in v19.4.0 / v18.14.0, it returns an estimate of the parallelism a program should use, always greater than zero. Use it to size worker pools; Chapter 27 explains why `os.cpus().length` is the wrong answer.

## Identity and capabilities

`process.version` is the version string *with* a leading `v`, e.g. `'v27.0.0-pre'`. `process.versions.node` is the same without the `v`, alongside every dependency: `v8`, `uv`, `openssl`, `icu`, `undici`, `zlib`, and `modules` — the ABI version Node uses to refuse native addons compiled for a different runtime. When a native module fails to load with a version mismatch, `process.versions.modules` is the number to compare.

`process.release` describes the build: `name` (always `'node'`), `sourceUrl`, `headersUrl`, `libUrl` (**Windows builds only**), and `lts` — a code-name string for LTS releases, `undefined` for Current, so `process.release.lts` cleanly answers "am I on an LTS line". In custom builds only `name` is guaranteed.

`process.features` is a set of booleans describing what this binary can do: `inspector`, `ipv6`, `tls`, `tls_alpn`, `tls_ocsp`, `tls_sni`, `cached_builtins`, `debug`, `require_module`, and `typescript`. That last is unusual — `"strip"` by default, `false` under `--no-strip-types`, and marked stability 1.2 (release candidate). `process.features.uv` is **[Deprecated]**: always `true`, so any check on it is redundant.

`process.report` is the entry point to diagnostic reports — a JSON dump of stacks, heap statistics, resource usage, and environment. Use `process.report.writeReport([filename][, err])` to produce one on demand, `getReport([err])` for a JavaScript object, and the auto-trigger switches `reportOnFatalError`, `reportOnSignal`, and `reportOnUncaughtException`. The trigger signal defaults to `'SIGUSR2'` and is configurable via `process.report.signal`. Enabling the fatal-error and uncaught-exception triggers costs nothing until something goes wrong, then hands you the whole process state. Chapter 50 covers reports properly.

## Common mistakes

### ❌ Calling `process.exit()` after printing

```js
console.error('config invalid: missing DATABASE_URL');
process.exit(1);
```

Under a pipe on POSIX — which is what CI and container log collection look like — stderr writes are asynchronous, so `exit()` discards the queued write. The job fails with code 1 and an empty log.

```js
// ✅ Set the code and let the loop drain.
console.error('config invalid: missing DATABASE_URL');
process.exitCode = 1;
```

If you must force termination, at least write synchronously: `fs.writeSync(process.stderr.fd, msg)` cannot be truncated.

### ❌ Treating environment variables as their apparent type

```js
const port = process.env.PORT || 3000;
server.listen(port);

if (process.env.STRICT_MODE) enableStrict();
```

`port` is the string `'8080'`, which `listen()` happens to tolerate but arithmetic will not. And `STRICT_MODE=false` enables strict mode, because `'false'` is truthy.

```js
// ✅ Parse and validate once, at startup.
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`PORT must be a valid port number, got ${process.env.PORT}`);
}
const strict = process.env.STRICT_MODE === '1' || process.env.STRICT_MODE === 'true';
```

### ❌ Slicing `argv` by a hard-coded index

```js
const subcommand = process.argv[2];
const target = process.argv[3];
```

This works until the tool runs through a wrapper, or as a single-executable application where there may be no script path at `argv[1]` at all. It also silently accepts `report.js --verbose deploy` as subcommand `--verbose`.

```js
// ✅ Let the parser establish the shape.
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: { verbose: { type: 'boolean', short: 'v' } },
  allowPositionals: true,
});
const [subcommand, target] = positionals;
```

### ❌ Logging at volume through `console.log()` in a request path

```js
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} ${JSON.stringify(req.headers)}`);
  next();
});
```

If stdout is a file or a POSIX terminal, each of those is a synchronous write that stops the event loop. Under load with a slow disk it becomes the dominant latency term — and it is invisible in a flame graph, because the time is in a blocking syscall, not in JavaScript.

```js
// ✅ Use an async logger with backpressure and a bounded buffer.
// (Chapter 51 covers this; the key property is that the write does not block.)
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url });
  next();
});
```

## Production notes

- **Read all configuration once, at startup, and freeze it.** One module reads `process.env`, coerces types, validates ranges, and exports a frozen object. That removes per-request native calls, makes misconfiguration fail fast at boot instead of at 3 a.m., and gives you one place to log the effective config with secrets redacted.
- **Delete secrets from `process.env` after reading them.** Diagnostic reports can include the environment and child processes inherit it by default. `process.report.excludeEnv` exists precisely because environments leak; deleting the variable is stronger.
- **Alert on `arrayBuffers` and `rss`, not just `heapUsed`.** Buffer leaks — an unbounded queue of network chunks, a cache of decoded images — never touch `heapUsed`. Exporting all five `memoryUsage()` fields plus `constrainedMemory()` turns "the pod restarted with 137" into a five-minute diagnosis.
- **Distinguish exit codes in the orchestrator.** 137 (killed, usually OOM), 143 (terminated, usually a normal rollout) and 1 (your bug) mean completely different things. A dashboard that lumps them into "non-zero exit" is worse than none.
- **Forward `process.execArgv` when spawning children.** Otherwise a child started under `--require ./tracing.js` or a custom heap limit silently runs without them, and your traces have holes that look like a sampling problem.
- **Do not call `process.chdir()` in a server.** It is global mutable state every relative path in every dependency reads. Pass a base directory explicitly. `chdir()` is unavailable in `Worker` threads anyway, so code relying on it cannot move to a worker later.
- **Prefer `process.memoryUsage.rss()` on hot paths.** The full call iterates every page: once per second is fine, once per request is not.

## Exercises

1. **Argument echo.** Write `inspect.mjs` that prints `process.argv`, `process.argv0`, `process.execPath`, and `process.execArgv`, each labelled. Run `node --no-warnings inspect.mjs --flag value -- extra`. *Success:* you can state, before running it, which array `--no-warnings` and `--` land in.

2. **A real CLI.** Build `wc.mjs` with `util.parseArgs()`: booleans `--lines`/`-l`, `--words`/`-w`, `--bytes`/`-c`, plus file positionals, printing a count table. With no flags print all three counts; with no positionals read `process.stdin`. *Success:* `wc.mjs --unknown` exits non-zero with a clear message, and `echo hi | node wc.mjs -l` prints `1`.

3. **Prove the blocking table.** Write 50,000 lines to stdout while a `setInterval(fn, 1)` records the delay between fires. Run it to a terminal, redirected to a file, and piped to `cat`, recording the maximum timer delay for each. *Success:* your numbers match the sync/async table for your platform, and you can explain any case where they do not.

4. **A memory profile.** Write a script with three phases — allocate 200 MB of JavaScript objects, release them, then allocate 200 MB of `Buffer`s — sampling all five `memoryUsage()` fields every 250 ms into CSV. *Success:* `heapUsed` moves in phase one and `arrayBuffers`/`external` in phase three, and you can explain the `rss` curve, including why it does not fall back after phase two.

5. **Reserved-code audit.** Spawn `node -e '<snippet>'` for snippets designed to produce exit codes 0, 1, 9, 13, and a signal code above 128, asserting each. *Success:* all assertions pass, and you have documented which behave differently on Windows.

## Recap

- `process` is both a global and `node:process`; import it explicitly in library code.
- `argv[0]` is the Node binary and `argv[1]` is the entry point; your arguments start at index 2. `argv0` preserves the original invocation name, `execPath` is the resolved binary, and `execArgv` holds Node's own flags — forward it to children.
- `util.parseArgs()` is the built-in parser: `strict` defaults to `true`, `allowPositionals` defaults to `false` when strict, `type` is only `'string'` or `'boolean'`, and `tokens: true` gives you the raw stream for anything the parser deliberately does not do.
- `process.env` holds only strings, needs `delete` for removal, is case-insensitive on Windows, and is expensive to read repeatedly — snapshot it at startup.
- Writes to `process.stdout`/`stderr` are synchronous for files everywhere, for TTYs on POSIX, and for pipes on Windows. That is why `console.log()` can block your event loop.
- `process.exit()` truncates pending output. Set `process.exitCode` and let the loop drain instead.
- Exit code 137 means `SIGKILL` (usually OOM), 143 means `SIGTERM`, 13 means an unsettled top-level `await`, and 5 is a V8 fatal error.
- `memoryUsage()` gives five numbers: `rss` is the whole process, `heapTotal`/`heapUsed` are V8's JavaScript heap, and `external`/`arrayBuffers` cover native and buffer memory — track all of them.
- `availableParallelism()` is on `node:os`, not on `process`, and is the correct way to size a pool.

## Where to go next

- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](26-signals-and-shutdown.md) — what happens between the last line of your module and the exit code.
- [Chapter 27 — OS Information, TTY, and Readline](27-os-tty-readline.md) — `os.availableParallelism()`, TTY detection in depth, and building interactive prompts.
- [Chapter 28 — Child Processes](28-child-processes.md) — passing `execArgv` and environments to children.
- [Chapter 51 — Console, `util.inspect`, and Logging Strategy](../part7-diagnostics/51-console-and-logging.md) — how to log without blocking.
- [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md) — `process.report` in full.
- [Appendix B — Environment Variable Reference](../appendix/b-environment-variables.md)
- Official documentation: <https://nodejs.org/docs/latest/api/process.html>
