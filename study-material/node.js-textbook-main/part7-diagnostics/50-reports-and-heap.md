---
chapter: 50
part: "Part VII — Testing, Debugging, Diagnostics"
title: "Diagnostic Reports, Heap Snapshots, and V8 Tooling"
level: advanced
reading_time: "35 min"
prerequisites: [25, 26, 29, 49]
source_docs:
  - "doc/api/report.md"
  - "doc/api/v8.md"
  - "doc/api/process.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/report.html"
node_baseline: "27.0.0-pre"
---

# Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling

## What you will learn

- How to make a Node process dump a complete diagnostic report — on demand, on a signal, on an uncaught exception, or on a fatal error — and how to read every section of it.
- How to use the report's `libuv` section to answer "why won't my process exit?"
- What each field of `v8.getHeapStatistics()` actually measures, and which ones are leak indicators.
- How to capture a heap snapshot safely, and the three-snapshot technique for finding a leak in Chrome DevTools.
- The five leak shapes that account for most Node memory bugs, and how each looks in a snapshot.
- How to read an OOM crash and choose a sane `--max-old-space-size`.

## Why this matters

A container gets OOM-killed at 03:00 with no stack trace, no log line, no core dump. Or `docker stop` hangs for the full grace period before SIGKILL, every deploy, and nobody knows why. Or RSS climbs 40 MB an hour and restarts are the mitigation.

None of these are debuggable from logs. They need a picture of the process's *internal* state: what the heap holds, which handles are open, what the native stack was doing, what limits the OS imposed. Node ships two tools for exactly this. A diagnostic report is a single JSON file describing everything about a live or dying process. A heap snapshot is a full object graph you can navigate. Both are Stability 2 — Stable, both are built in, and neither needs an agent, a sidecar, or a rebuild.

## Diagnostic reports

A diagnostic report is a JSON document containing JavaScript and native stack traces, heap statistics, every open libuv handle, resource usage, environment variables, OS limits, and loaded shared libraries — a full snapshot of process state at one instant. The format has a version number in `header.reportVersion` (currently **5**), bumped whenever a key is added, removed, or retyped, and stable across LTS lines.

### Triggering a report

Programmatically, via `process.report`:

```mjs
import { report } from 'node:process';

// Default filename: report.<date>.<time>.<pid>.<seq>.json in the cwd.
const filename = report.writeReport();
console.error(`wrote ${filename}`);
```

`writeReport([filename][, err])` returns the filename it wrote. Both arguments are optional and, when both are given, `filename` comes first. The `err` argument is the useful one: pass an `Error` and the report's `javascriptStack` shows *that* error's stack rather than the stack at the point you called `writeReport()`. In a catch block or an error handler, that is the difference between seeing where the problem occurred and seeing where you noticed it.

```js
try {
  await connectToDatabase();
} catch (err) {
  process.report.writeReport('db-failure.json', err);
  throw err;
}
```

Setting `filename` to `'stdout'` or `'stderr'` writes to those streams instead of a file — the right choice in a container, where the log pipeline is already collecting stdout and the filesystem may be read-only or ephemeral. When you use a standard stream, `directory` is ignored.

`process.report.getReport([err])` returns the same content as a JavaScript object instead of writing it anywhere. Use it when you want to extract two fields and ship them to a metrics system rather than persist 200 KB of JSON.

### Automatic triggers

The flags, all of which are permitted inside `NODE_OPTIONS`:

| Flag | Effect |
|---|---|
| `--report-uncaught-exception` | Write a report when an exception goes uncaught |
| `--report-on-fatalerror` | Write a report on fatal runtime errors, including OOM |
| `--report-on-signal` | Write a report when the report signal arrives. **Not supported on Windows** |
| `--report-signal=SIGNAL` | Change the trigger signal. **Default:** `SIGUSR2`. Not supported on Windows |
| `--report-directory=DIR`, `--report-dir=DIR` | Where to write |
| `--report-filename=NAME` | What to call it |
| `--report-compact` | Single-line JSON, for log processors rather than humans |
| `--report-exclude-env` | Omit the `environmentVariables` section |
| `--report-exclude-network` | Omit `header.networkInterfaces` and skip reverse-DNS lookups for `libuv.*.(remote|local)Endpoint.host` |

```bash
NODE_OPTIONS="--report-uncaught-exception --report-on-fatalerror --report-on-signal --report-directory=/var/log/node --report-compact --report-exclude-env"
```

Every flag has a runtime equivalent on `process.report`, so you can change behaviour after startup:

| Property | Type | Default |
|---|---|---|
| `reportOnFatalError` | boolean | `false` |
| `reportOnSignal` | boolean | `false` |
| `reportOnUncaughtException` | boolean | `false` |
| `signal` | string | `'SIGUSR2'` |
| `filename` | string | timestamp + PID + sequence |
| `directory` | string | process cwd |
| `compact` | boolean | `false` |
| `excludeEnv` | boolean | `false` |
| `excludeNetwork` | boolean | `false` |

`--report-on-signal` is the operational workhorse: a stuck production process, `kill -USR2 <pid>`, and you have its complete state without attaching a debugger or restarting it. Just be careful — if you already use `SIGUSR2` for something else (nodemon does), move the report to a different signal with `--report-signal`.

### Reading a report, section by section

**`header`** — the orientation section. `event` and `trigger` say *why* the report exists (`"Exception"`, `"FatalError"`, `"Signal"`, `"JavaScript API"`). `dumpEventTime` and `dumpEventTimeStamp` give you the wall-clock instant to correlate with logs. `commandLine` is the full argv, so you can confirm which flags were actually in effect — this catches "we set `--max-old-space-size` in the Dockerfile but the entrypoint script overrode it" more often than you would expect. `nodejsVersion`, `componentVersions` (v8, uv, zlib, ares, nghttp2, llhttp, openssl, modules, napi), `osName`/`osRelease`/`osMachine`, `arch`, `platform`, `wordSize`, `cpus`, and `networkInterfaces` complete the picture.

**`javascriptStack`** — `{ message, stack: [...] }`. On an uncaught exception this is the throwing stack. On a signal-triggered report, it is whatever JavaScript was on the stack when the signal was handled — which, if your process is wedged in a synchronous loop, is exactly the function you are looking for.

**`nativeStack`** — an array of `{ pc, symbol }`, mostly V8 and Node internals. Its value is in the frame *names*: `v8::internal::Heap::CollectGarbage` means the process was in GC; your own addon's symbols mean the problem is native.

**`javascriptHeap`** — V8 heap accounting: `totalMemory`, `usedMemory`, `memoryLimit`, `availableMemory`, `executableMemory`, `totalCommittedMemory`, `mallocedMemory`, `peakMallocedMemory`, `externalMemory`, `totalGlobalHandlesMemory`, `usedGlobalHandlesMemory`, `nativeContextCount`, `detachedContextCount`, `doesZapGarbage`, plus a `heapSpaces` object breaking the heap into `read_only_space`, `new_space`, `old_space`, `code_space`, `map_space`, `large_object_space`, and `new_large_object_space`, each with `memorySize`, `committedMemory`, `capacity`, `used`, and `available`. The first comparison to make: `usedMemory` against `memoryLimit`. If they are close, this is an OOM.

**`resourceUsage`** — process-wide: `rss`, `free_memory`, `total_memory`, `available_memory`, `maxRss`, `constrained_memory`, `userCpuSeconds`, `kernelCpuSeconds`, three `*CpuConsumptionPercent` fields, `pageFaults`, and `fsActivity`. `constrained_memory` is what a cgroup limit looks like from inside a container — compare it to `javascriptHeap.memoryLimit` to catch the classic misconfiguration where V8 thinks it has 4 GB and the container kills you at 512 MB.

**`uvthreadResourceUsage`** — the same CPU and fs numbers for the event loop thread alone. If process-wide CPU is high but the loop thread's is low, your CPU is going to the libuv threadpool (fs, dns, crypto, zlib) or to worker threads.

**`libuv`** — every handle and request in the loop. Covered in its own section below.

**`workers`** — an array containing a full report, in the same format, for each `Worker` that is a child of the reporting thread. The reporting thread waits for those child reports, though the docs note the latency is usually low because both JavaScript and the event loop are interrupted to generate a report.

**`environmentVariables`** — the process environment. This is why `--report-exclude-env` and `process.report.excludeEnv` exist: **your report will contain every secret you passed as an environment variable.** Treat an un-excluded report as a credential.

**`userLimits`** — the OS `rlimit` values, as `{ soft, hard }` pairs: `core_file_size_blocks`, `data_seg_size_bytes`, `file_size_blocks`, `max_locked_memory_bytes`, `max_memory_size_bytes`, `open_files`, `stack_size_bytes`, `cpu_time_seconds`, `max_user_processes`, `virtual_memory_bytes`. (Report version 5 renamed the three `*_kbytes` keys to `*_bytes`, because the values were always bytes.) `open_files` is the one that bites: an `EMFILE` storm is a soft limit of 1024 meeting a connection pool that wants 2000.

**`sharedObjects`** — the list of loaded shared libraries. Useful for confirming which OpenSSL a binary actually linked, or that a native addon loaded at all.

### The libuv section: why won't my process exit

Node exits when the event loop has no more referenced, active work. If your process hangs at shutdown, something is still holding it. The `libuv` array tells you what.

Each entry has `type`, `is_active`, `is_referenced`, `address`, and type-specific fields:

| `type` | Extra fields | What it usually is |
|---|---|---|
| `timer` | `repeat`, `firesInMsFromNow`, `expired` | `setInterval`/`setTimeout` |
| `tcp` | `localEndpoint`, `remoteEndpoint`, `sendBufferSize`, `recvBufferSize`, `fd`, `writeQueueSize`, `readable`, `writable` | A server or a socket |
| `tty` | `width`, `height`, `fd`, `writeQueueSize`, `readable`, `writable` | stdin/stdout on a terminal |
| `signal` | `signum`, `signal` | A `process.on('SIGTERM')` handler |
| `loop` | `loopIdleTimeSeconds` | The loop itself |
| `async`, `check`, `idle`, `prepare` | — | Internal machinery |

The rule is short and it is the whole trick: **a handle keeps the process alive only if `is_referenced` is `true`.** So scan the array for referenced handles.

A `timer` with `is_referenced: true` and `repeat` non-zero is a `setInterval` you never cleared — the metrics timer from Chapter 49 that you forgot to `.unref()`. A `tcp` handle with a `remoteEndpoint` and `is_referenced: true` after you called `server.close()` is a keep-alive connection the client has not closed; that is what `server.closeIdleConnections()` and `server.closeAllConnections()` are for (Chapter 26). A referenced `tcp` handle with no `remoteEndpoint` is a listening server you did not close.

The workflow: `kill -USR2` the hanging process, open the report, filter `libuv` to `is_referenced === true`.

```mjs
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const h of report.libuv) {
  if (h.is_referenced) {
    console.log(h.type, JSON.stringify(h.remoteEndpoint ?? h.repeat ?? ''));
  }
}
```

## `node:v8`: measuring the heap

`v8.getHeapStatistics()` is the cheap, always-available number source. Call it on an interval and ship it.

| Field | Meaning |
|---|---|
| `total_heap_size` | Bytes V8 has allocated for the heap; grows as needed |
| `total_heap_size_executable` | Portion holding executable code (JIT output) |
| `total_physical_size` | Physical memory actually committed, not merely reserved |
| `total_available_size` | Bytes still available before the heap limit |
| `used_heap_size` | Bytes currently held by live JavaScript objects |
| `heap_size_limit` | The ceiling — the default, or your `--max-old-space-size` |
| `malloced_memory` / `peak_malloced_memory` | Current and peak bytes V8 obtained via `malloc` |
| `does_zap_garbage` | 0/1; whether `--zap_code_space` is on |
| `number_of_native_contexts` | Active top-level contexts. **Growth over time indicates a leak** |
| `number_of_detached_contexts` | Contexts detached but not yet collected. **Non-zero indicates a potential leak** |
| `total_global_handles_size` / `used_global_handles_size` | V8 global handle memory |
| `external_memory` | ArrayBuffers and external strings — memory *outside* the heap |
| `total_allocated_bytes` | Total allocated since isolate creation |

Two fields deserve attention because the docs call them out explicitly as leak signals. `number_of_native_contexts` climbing means you are creating contexts (usually via `node:vm`, Chapter 52) and not releasing them. `number_of_detached_contexts` being non-zero at all is suspicious.

`external_memory` is the field that explains the most confusing memory bug in Node: **your heap looks fine and your RSS is enormous.** Buffers live outside the V8 heap. A leak of 2 GB of `Buffer` shows up as `external_memory` and RSS, and barely moves `used_heap_size` — and `--max-old-space-size` will not stop it, because that limit does not apply to external memory.

`v8.getHeapSpaceStatistics()` returns an array of `{ space_name, space_size, space_used_size, space_available_size, physical_space_size }`. The docs warn that neither the ordering nor the availability of any given space is guaranteed across V8 versions, so key by `space_name` and tolerate absences. The one to watch is `old_space`: objects survive two scavenges in the young generation and are then promoted here, so a steadily growing `old_space` used size across hours is the shape of a leak.

`v8.getHeapCodeStatistics()` returns `code_and_metadata_size`, `bytecode_and_metadata_size`, `external_script_source_size`, and `cpu_profiler_metadata_size` — relevant if you compile code at runtime and suspect *that* is what is growing.

## Heap snapshots

A heap snapshot is the full object graph, serialized as JSON in V8's undocumented (and version-specific) `.heapsnapshot` format, which Chrome DevTools understands.

```js
const { writeHeapSnapshot, getHeapSnapshot } = require('node:v8');

// Writes to disk, returns the filename.
const file = writeHeapSnapshot();

// Or stream it, e.g. to a socket or to object storage.
const stream = getHeapSnapshot();
```

`writeHeapSnapshot([filename[, options]])` defaults to `Heap-${yyyymmdd}-${hhmmss}-${pid}-${thread_id}.heapsnapshot`, where `thread_id` is `0` on the main thread. `getHeapSnapshot([options])` returns a `stream.Readable` of the same JSON. Both accept two options:

| Option | Type | Default | Meaning |
|---|---|---|---|
| `exposeInternals` | boolean | `false` | Include V8 internal objects |
| `exposeNumericValues` | boolean | `false` | Expose numeric values in artificial fields |

Three warnings from the docs, all of which matter in production:

1. **A snapshot needs roughly twice the heap size in additional memory.** Snapshotting a process already near its limit can be the thing that kills it.
2. **It is synchronous and blocks the event loop** for a duration proportional to heap size. On a 1 GB heap that is seconds, during which you serve nothing.
3. **A snapshot covers exactly one V8 isolate.** A main-thread snapshot contains nothing about your workers, and vice versa (Chapter 29).

So: take snapshots from a process pulled out of the load-balancer rotation, or from a canary instance, never from the whole fleet at once.

For leaks that end in a crash, let Node do it for you. `--heapsnapshot-near-heap-limit=max_count` writes up to `max_count` snapshots as heap usage approaches the limit — this is how you get a snapshot of the state that actually caused the OOM, rather than one from ten minutes earlier. `v8.setHeapSnapshotNearHeapLimit(limit)` sets the same thing at runtime (a no-op if the flag was already given or the function has already been called). `--heapsnapshot-signal=SIGNAL` installs a signal handler that dumps a snapshot on demand — the snapshot equivalent of `--report-on-signal`.

```bash
node --max-old-space-size=512 --heapsnapshot-near-heap-limit=3 server.js
```

### Reading a snapshot in Chrome DevTools

Open `chrome://inspect`, click "Open dedicated DevTools for Node", go to the **Memory** tab, and load the `.heapsnapshot` file. You get a table of constructors. Two columns matter, and confusing them is the single most common analysis mistake:

- **Shallow size** — bytes the object occupies itself. A `Map` with a million entries has a small shallow size; the entries are separate objects.
- **Retained size** — bytes that would be freed if this object were collected: the object plus everything only *it* keeps alive. This is the number that answers "how much memory is this costing me?"

Sort by retained size. Then use the **dominators** concept: object A dominates object B if every path from a GC root to B goes through A. The dominator tree tells you the single object responsible for keeping a subgraph alive. DevTools shows this in the "Retainers" pane at the bottom — expand it to walk from a leaked object back to the GC root holding it. That chain *is* the bug: it names the variable, the closure, or the listener array.

### The three-snapshot technique

The reliable method for finding a leak, in five steps:

1. Start the process and drive it through your workload once — a few hundred requests. This fills lazy caches, compiles code, and allocates one-time structures. **Take snapshot 1.**
2. Repeat the exact same workload. **Take snapshot 2.**
3. Repeat it a third time. **Take snapshot 3.**
4. In DevTools, load all three. Select snapshot 3 and switch the view dropdown from "Summary" to **"Comparison"**, comparing against snapshot 2. Then compare 2 against 1.
5. Look for constructors where **`# Delta` is positive in both comparisons and roughly the same size each time.** That is the leak. Anything that grew between 1 and 2 but not between 2 and 3 was warm-up, not a leak.

Snapshot 1 exists purely to discard warm-up noise. Skipping it is why people spend an afternoon chasing a cache that was supposed to fill.

The comparison view also has an "Objects allocated between snapshot 2 and 3" filter — objects allocated in that window and *still alive* at snapshot 3. In a correct program after warm-up, that set should be nearly empty.

### `queryObjects`: the cheap alternative

Since v22.0.0 / v20.13.0, `v8.queryObjects(ctor[, options])` runs a full GC and then counts live objects with `ctor` on their prototype chain:

```mjs
import { queryObjects } from 'node:v8';

class Session {}
const a = new Session();
console.log(queryObjects(Session));                       // 1
console.log(queryObjects(Session, { format: 'summary' })); // [ 'Session {}' ]
```

`options.format` is `'count'` (the default behaviour, returning a number) or `'summary'` (returning an array of short string descriptions). It deliberately does not return references, so it cannot itself leak. Only objects created in the current execution context are counted, and note the subtlety the docs highlight: a subclass's prototype also has the parent constructor on its chain, so `queryObjects(Base)` counts prototypes too.

This is the ideal **leak regression test**: assert in your test suite that `queryObjects(Session)` returns 0 after all sessions are closed. Far cheaper than a snapshot, and it fails a CI build.

## Common leak shapes in Node

| Shape | How it looks in a snapshot | Fix |
|---|---|---|
| **Unbounded cache** | A `Map` or plain object with enormous retained size, dominating everything | Bound it — LRU with a max size, or TTL eviction |
| **Listener accumulation** | Large `_events` arrays; often preceded by a `MaxListenersExceededWarning` | Pair every `on()` with an `off()`; use `once()` where applicable |
| **Closure over a large buffer** | Small function objects with huge retained size, retaining an `ArrayBuffer` | Extract only what you need before creating the closure |
| **`AsyncLocalStorage` misuse** | Store objects retained by long-lived async resources | Store an id, not the whole request/response |
| **Timer holding a reference** | A `Timeout` in the retainer chain of the leaked object | `clearInterval`, and prefer `AbortSignal`-driven cancellation |

Two of these need elaboration.

**Closures over large buffers.** This is the one people never see coming:

```js
// ❌ The callback closes over `body`, keeping a 10 MB buffer alive
//    for as long as the interval lives.
function handle(body) {
  const id = body.readUInt32BE(0);
  setInterval(() => touch(id), 1000);
}

// ✅ Nothing large is captured.
function handle(body) {
  const id = body.readUInt32BE(0);
  const tick = () => touch(id);
  setInterval(tick, 1000);
}
```

Both look identical, and in V8 the second is safe while the first can retain `body`: V8's context allocation is per-scope, so *any* closure in a scope can keep *all* captured variables of that scope alive. The reliable fix is to narrow the scope — compute what you need, then create the closure in a function that never saw the buffer.

**`AsyncLocalStorage` misuse.** Storing the request and response objects in the store (Chapter 15) means every async resource created during that request retains them. One slow background task started during a request pins the whole request graph. Store a correlation id and a user id — primitives — and look everything else up.

## Serialization, coverage, flags, and profiling

`v8.serialize(value)` and `v8.deserialize(buffer)` implement the HTML structured clone algorithm — the same mechanism `postMessage()` uses. Compared to JSON:

| | `JSON.stringify` | `v8.serialize` |
|---|---|---|
| Output | UTF-8 string | `Buffer` (binary) |
| `Map`, `Set` | Lost | Preserved |
| `Date`, `RegExp`, `BigInt` | Lossy or thrown | Preserved |
| TypedArrays / `ArrayBuffer` | Lost | Preserved |
| Circular references | Throws | Preserved |
| Cross-language | Yes | **No** — V8-specific |
| Human-readable | Yes | No |

The format is backward-compatible and safe to store on disk, and equal values may produce different bytes (so do not use it for content hashing). `ERR_BUFFER_TOO_LARGE` is thrown if the result would exceed `buffer.constants.MAX_LENGTH`. Use it for caching structured data between processes; never as a wire format for anything non-Node, and never on untrusted input.

`v8.takeCoverage()` and `v8.stopCoverage()` control the coverage collection started by `NODE_V8_COVERAGE`. `takeCoverage()` flushes to that directory on demand and resets the counters; `stopCoverage()` ends collection so V8 can release them and re-optimize. Coverage is written once more at exit unless you stopped it first — this is how you get coverage from a long-running server.

`v8.setFlagsFromString(flags)` sets V8 command-line flags at runtime — `node --v8-options` lists them. The docs are blunt that changing settings after the VM has started "may result in unpredictable behavior, including crashes and data loss; or it may simply do nothing." The safe uses are diagnostic toggles like `setFlagsFromString('--trace-gc')` and `setFlagsFromString('--notrace-gc')`.

`v8.promiseHooks` gives you `onInit(fn)`, `onSettled(fn)`, `onBefore(fn)`, `onAfter(fn)`, and `createHook({ init, before, after, settled })`; each returns a disable function. **The callbacks must be plain functions** — an async function throws, because it would produce an infinite microtask loop. Unlike `async_hooks` there is no `destroy` hook. For context propagation use `AsyncLocalStorage` (Chapter 15) instead.

For GC and profiling, `node:v8` also exposes `v8.GCProfiler` (`start()`, `stop()` returning `{ version, startTime, statistics }` with before/after heap statistics per collection, and `Symbol.dispose` support for `using`), plus `v8.startCpuProfile([options])` and `v8.startHeapProfile([options])` — both new (v25.0.0 and v26.1.0 respectively) and both returning handles with `stop()` and disposal support.

## Interpreting OOM crashes

A V8 heap OOM looks like this:

```
<--- Last few GCs --->
[49580:0x110000000]  4845 ms: Mark-sweep 130.6 (147.8) -> 130.6 (147.8) MB, 18.8 / 0.0 ms
<--- JS stacktrace --->
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

Read the "Last few GCs" block. The `X (Y) -> X' (Y')` figures are heap size before and after each collection. When the before and after numbers are nearly identical — 130.6 → 130.6 — the collector reclaimed nothing. That is what "ineffective mark-compacts" means: everything is still reachable. **This is a leak, not a sizing problem.** Raising `--max-old-space-size` buys you time, not a fix.

Distinguish it from the other failure: the kernel OOM killer. That leaves no JavaScript output at all, only exit code 137 and a `dmesg` line. If you see 137 with no `FATAL ERROR`, the process exceeded a *container* limit, not V8's — and the culprit is often external memory (Buffers) or native addon allocations, neither of which `--max-old-space-size` governs.

Sizing guidance:

- `--max-old-space-size=SIZE` is **MiB** and governs V8's old space only.
- In a container, set it to roughly **75–80% of the container memory limit**. The remaining 20–25% covers external memory, native allocations, thread stacks, and the runtime itself. Setting it equal to the container limit guarantees the kernel kills you before V8 ever tries a rescue GC.
- `--max-old-space-size-percentage=PERCENT` expresses the same thing as a percentage of available system memory and takes precedence over `--max-old-space-size` when both are given.
- `--max-semi-space-size=SIZE` (MiB) tunes the young generation. Raising it can improve throughput for allocation-heavy workloads at the cost of memory — but note that the young generation is three times the semi-space size, so +1 MiB costs +3 MiB of heap. Measure before and after; the benefit is workload-dependent.
- `--max-heap-size` sets a maximum heap size in megabytes for the process. `--heap-snapshot-on-oom` and `--expose-gc` are V8 options exposed by Node.

## Common mistakes

### ❌ Shipping reports that contain your environment

```bash
node --report-uncaught-exception --report-directory=/var/log/app server.js
```

`environmentVariables` includes `DATABASE_URL`, `AWS_SECRET_ACCESS_KEY`, and everything else. If those reports go to a shared log bucket, you have leaked credentials.

```bash
node --report-uncaught-exception --report-exclude-env \
     --report-exclude-network --report-directory=/var/log/app server.js
```

Or set `process.report.excludeEnv = true` at startup.

### ❌ Taking a heap snapshot on a process that is already dying

```js
process.on('uncaughtException', () => {
  require('node:v8').writeHeapSnapshot();   // needs ~2× the heap
});
```

Snapshotting needs roughly twice the current heap in extra memory. On an OOM-adjacent process this is what finally kills it, and you get no snapshot at all.

```bash
# Let V8 take them proactively, before the limit is hit.
node --max-old-space-size=512 --heapsnapshot-near-heap-limit=3 server.js
```

### ❌ Reading shallow size instead of retained size

A `Map` holding 500 MB of values has a shallow size of a few hundred bytes. Sorting the DevTools table by shallow size shows you strings and arrays and hides the container that owns them.

Sort by **retained size**, then open the **Retainers** pane and follow the chain to a GC root.

### ❌ Comparing two snapshots without a warm-up snapshot

Everything looks like it is leaking between the first and second snapshot, because module caches, compiled code, and connection pools all fill during the first pass. Always take three, discard the first comparison, and only trust growth that repeats.

### ❌ Assuming `--max-old-space-size` bounds process memory

```bash
node --max-old-space-size=512 server.js   # still gets OOM-killed at 2 GB RSS
```

Buffers, `ArrayBuffer`s, native addon allocations, and thread stacks live outside the old space. Watch `getHeapStatistics().external_memory` and `process.memoryUsage().rss`, and set the container limit above both.

## Production notes

- **Turn on report-on-signal everywhere, permanently.** It costs nothing until you send the signal, and it converts "the process is stuck, restart it and hope" into a two-minute diagnosis. Put it in `NODE_OPTIONS` with `--report-exclude-env`.
- **Reports written to `stdout` fit container reality better than files.** An ephemeral filesystem means a file-based report vanishes with the container it was diagnosing. Setting `process.report.filename = 'stdout'` sends it down the same pipe as your logs. Use `--report-compact` so a log shipper handles it as one record.
- **Generating a report from the main thread also generates one per worker,** and the reporting thread waits for them. On a process with many workers this is not instant. Budget for it if you trigger reports on a timer.
- **Export a small set of heap metrics continuously.** `used_heap_size`, `heap_size_limit`, `external_memory`, `number_of_detached_contexts`, and `rss`, sampled every 30 seconds, is enough to see a leak days before it kills you — and far cheaper than any snapshot.
- **Snapshot a canary, never the fleet.** The operation is synchronous, doubles heap memory, and takes seconds. Remove one instance from rotation, snapshot it three times, put it back.
- **Add `queryObjects` assertions to your test suite** for the classes you know accumulate — sessions, connections, subscriptions. A leak caught in CI costs minutes; one caught in production costs a night.
- **On Windows, signal-based triggers do not work.** `--report-on-signal`, `--report-signal`, and `--heapsnapshot-signal` are POSIX-only. Use the programmatic API behind an authenticated admin endpoint instead.
- **Check `constrained_memory` against `heap_size_limit` on every deploy.** A container memory limit change that nobody propagated to `--max-old-space-size` is a scheduled outage.

## Exercises

1. **Read your own report.** Add `process.report.writeReport('startup.json')` to a small HTTP server and start it. Open the JSON and locate: the Node version, the command line, `javascriptHeap.memoryLimit`, and the number of entries in `libuv`. *Success:* you can state your process's heap limit in MiB from the report alone.

2. **Find the handle that will not let go.** Write a server that calls `server.close()` on `SIGTERM` but also has an uncleared `setInterval` and an open keep-alive connection. Send `SIGTERM`, confirm it hangs, then `kill -USR2` it and identify both offenders from the `libuv` section. *Success:* you name the timer and the socket, then fix the shutdown so the process exits within 500 ms.

3. **Three-snapshot leak hunt.** Build a service with a deliberate leak — push every request's parsed body into a module-scope array. Drive 200 requests, snapshot, repeat twice more. Load all three into DevTools and use the Comparison view. *Success:* you identify the array by name, and the retainer chain leads from the leaked objects back to the module scope.

4. **External memory versus heap.** Write a script that allocates 100 `Buffer.alloc(10 * 1024 * 1024)` into an array and logs `used_heap_size`, `external_memory`, and `process.memoryUsage().rss` after each 10. *Success:* you show that `used_heap_size` barely moves while `external_memory` and `rss` grow by ~1 GB, and you can explain why `--max-old-space-size=256` does not prevent it.

5. **Automatic snapshot on OOM.** Run the leaking service from exercise 3 under `--max-old-space-size=128 --heapsnapshot-near-heap-limit=2` until it crashes. Read the "Last few GCs" output and open the resulting snapshots. *Success:* you can point to the line proving the collector reclaimed nothing, and the constructor responsible in the final snapshot.

## Recap

- `process.report` produces a complete JSON picture of process state; `writeReport([filename][, err])` writes it, `getReport([err])` returns it as an object, and passing an `Error` gives you *its* stack rather than the handler's.
- Enable reports with `--report-uncaught-exception`, `--report-on-fatalerror`, and `--report-on-signal` (POSIX only), tuned by `--report-signal`, `--report-directory`, `--report-filename`, `--report-compact`, `--report-exclude-env`, and `--report-exclude-network` — all mirrored as runtime properties on `process.report`.
- The `libuv` section answers "why won't my process exit": filter for `is_referenced: true` and read the type-specific fields.
- Reports contain your environment variables. Exclude them, or treat the report as a secret.
- `v8.getHeapStatistics()` is cheap and continuous; `number_of_detached_contexts`, `number_of_native_contexts`, and `external_memory` are the leak indicators worth alerting on.
- Heap snapshots cost ~2× the heap in memory, block the event loop, and cover one isolate only. Prefer `--heapsnapshot-near-heap-limit` for crash-time capture and canary instances for on-demand capture.
- Sort by **retained** size, not shallow size, and use the three-snapshot technique so warm-up growth does not masquerade as a leak.
- `v8.queryObjects(ctor)` is a snapshot-free leak check cheap enough to assert in CI.
- "Ineffective mark-compacts" means the collector reclaimed nothing — a leak, not a sizing problem. Exit code 137 with no V8 output means the kernel, not V8, killed you.

## Where to go next

- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](../part4-system/26-signals-and-shutdown.md) — closing the handles the `libuv` section just showed you.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) — why one snapshot is never the whole process.
- [Chapter 47 — Debugging: Inspector Protocol, `node --inspect`, Editors](47-debugging.md) — attaching DevTools to a live process rather than a file.
- [Chapter 49 — Measuring Performance with `perf_hooks`](49-perf-hooks.md) — the GC-pause trend that tells you when to start snapshotting.
- [Chapter 61 — Performance Tuning](../part9-production/61-performance-tuning.md) — heap flags and allocation reduction in practice.
- [Chapter 62 — Observability in Production](../part9-production/62-observability.md) — shipping heap metrics and reports off the box.
- Official documentation: <https://nodejs.org/docs/latest/api/report.html> and <https://nodejs.org/docs/latest/api/v8.html>
