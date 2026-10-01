---
chapter: 61
part: "Part IX — Production Practice"
title: "Performance Tuning"
level: advanced
reading_time: "40 min"
prerequisites: [9, 29, 36, 49, 50]
source_docs:
  - "doc/api/perf_hooks.md"
  - "doc/api/v8.md"
  - "doc/api/cli.md"
  - "doc/api/process.md"
  - "doc/api/dns.md"
  - "doc/api/zlib.md"
source_url: "https://nodejs.org/docs/latest/api/perf_hooks.html"
node_baseline: "27.0.0-pre"
---

# Chapter 61 — Performance Tuning

**What you will learn**

- A repeatable tuning method — measure, locate, fix, re-measure — and why every step you skip costs you a day later.
- The six bottleneck classes a Node service actually hits, and how to tell them apart from a single graph.
- How to read event loop delay and Event Loop Utilization as your primary health signal, and how to take a CPU profile and read the flame graph it produces.
- When `--max-old-space-size`, `--max-semi-space-size`, and `UV_THREADPOOL_SIZE` help, and when changing them makes things worse.
- Where the real wins are: serialization, startup, HTTP configuration, caching, and offloading — not micro-optimised JavaScript.

**Why this matters**

A product manager tells you the checkout endpoint got slow. p99 went from 180 ms to 2.4 s over three weeks. Nobody deployed anything obviously dangerous. You have a laptop, a production dashboard, and a strong instinct to start rewriting the JSON handling because you once read that `JSON.stringify` is slow.

That instinct is how tuning sessions get wasted. In practice the cause is almost always one of a small number of things — a synchronous call that crept into a hot path, a heap that outgrew its limit and now spends a fifth of its time in garbage collection, a connection pool sized for last year's traffic, or a downstream service that got slow and dragged you with it. Each of those has a distinct fingerprint in the metrics, and each has a different fix. This chapter is about recognising the fingerprint before you touch any code. The measurement tools come from Part VII; this chapter is about what to do with what they tell you.

## The method

Performance work has exactly one correct order, and it is boring.

1. **Define the number.** "Slow" is not a target. "p99 latency of `POST /checkout` under 400 ms at 300 requests per second" is. Pick a percentile, not a mean — means hide the tail where your users live.
2. **Measure in an environment that resembles production.** A laptop with a warm page cache, no network latency, and one concurrent user will lie to you about every bottleneck class except pure CPU.
3. **Locate the bottleneck before fixing anything.** This is the step people skip. The taxonomy below exists so that you can do it in minutes.
4. **Make one change.** One. If you change three things and latency improves, you have learned nothing and you now carry two changes with unknown value.
5. **Re-measure against the same number, then keep the measurement.** A tuning fix that nothing watches will silently regress in six weeks.

Between steps 3 and 4 sits the honest question: *is this worth fixing?* A 5% CPU win on a service that spends 80% of its time waiting for a database is a distraction.

## The taxonomy of Node bottlenecks

Almost every Node performance problem falls into one of six classes. Learn to distinguish them and you have skipped most of the guessing.

| Symptom | Likely cause | Diagnostic tool | Fix |
|---|---|---|---|
| Latency rises across *all* endpoints together, including trivial ones; CPU near 100% of one core | Event loop blocking | `perf_hooks.monitorEventLoopDelay()`, `--cpu-prof` | Move the synchronous work off the loop: chunk it, `Worker`, or child process |
| Latency spikes are periodic and sawtoothed; RSS climbs then drops; CPU high but profile is dominated by GC frames | Excessive garbage collection | `PerformanceObserver` on `'gc'`, `v8.getHeapStatistics()`, `--heap-prof` | Reduce allocation rate; tune `--max-semi-space-size`; raise `--max-old-space-size` only if the heap is genuinely too small |
| Latency high, CPU low, event loop delay low | I/O latency or a slow downstream | Request-level tracing, `PerformanceObserver` on `'http'`/`'dns'` | Parallelise, batch, cache, set deadlines, fix the dependency |
| A subset of operations (file reads, `dns.lookup`, `zlib`, `pbkdf2`) queue up while the rest of the app is fine | libuv threadpool saturation | Timing the *queue* wait vs the operation, `UV_THREADPOOL_SIZE` experiment | Raise `UV_THREADPOOL_SIZE`, or remove the threadpool user (`dns.resolve*`, cached hashing) |
| CPU profile dominated by `JSON.parse`/`stringify`, `Buffer.toString`, or a schema validator | Serialization cost | `--cpu-prof` flame graph | Smaller payloads, streaming, precompiled validators, a binary format |
| Cold-start or deploy-time latency; first requests after a restart are slow | Startup cost — module count, compilation | `performance.nodeTiming`, `--cpu-prof` over the first second | Compile cache, snapshots, fewer/lazier `require`s |

Two of those six are JavaScript speed problems. Four are not. That ratio is the most useful thing in this chapter: **most Node performance problems are I/O and architecture, not JavaScript execution speed.** If your service is slow, the usual reason is that it is waiting — or that it stopped being able to wait because something blocked the loop.

## Signal one: event loop delay and ELU

Node runs your JavaScript on one thread. If a callback takes 300 ms, every other pending callback — every queued request, every timer, every completed socket read — waits 300 ms. This is the defining failure mode of the platform and it deserves the first metric you export.

**Event loop delay** measures lateness. Node schedules a probe; the delay is how long the probe waited beyond its scheduled time. `perf_hooks.monitorEventLoopDelay()` returns an `ELDHistogram` that records this in **nanoseconds**:

```mjs
import { monitorEventLoopDelay } from 'node:perf_hooks';

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

setInterval(() => {
  const p99ms = loopDelay.percentile(99) / 1e6;
  const maxMs = loopDelay.max / 1e6;
  console.log(`loop delay p99=${p99ms.toFixed(1)}ms max=${maxMs.toFixed(1)}ms`);
  loopDelay.reset();
}, 10_000).unref();
```

Two options matter. `resolution` (default `10` ms) is the sampling interval for the default timer-driven mode. Setting `samplePerIteration: true` (added in v26.5.0 / v24.19.0) instead samples once per loop iteration using libuv's prepare and check hooks; in that mode the histogram does not keep the loop alive or force extra iterations when the process is idle. The two modes produce genuinely different distributions — never compare a number from one against a number from the other.

**Event Loop Utilization (ELU)** answers a different question: what fraction of time was the loop *doing something* rather than parked in the event provider (`epoll_wait` and friends)?

```mjs
import { eventLoopUtilization } from 'node:perf_hooks';

let last = eventLoopUtilization();
setInterval(() => {
  const now = eventLoopUtilization();
  const { utilization } = eventLoopUtilization(now, last);
  last = now;
  console.log(`ELU over last 5s: ${(utilization * 100).toFixed(1)}%`);
}, 5_000).unref();
```

Calling `eventLoopUtilization(now, previous)` gives you the delta between two samples, which is what you want for a per-interval gauge. Passing anything other than a value returned by a previous call is undefined behaviour — do not hand it a hand-built object.

Read the two together:

| Loop delay | ELU | Interpretation |
|---|---|---|
| Low | Low | Healthy and not busy. Latency problems are downstream. |
| Low | High | Busy but not blocking — many short tasks. You are near capacity; scale out. |
| High | High | Blocking. Something on the loop runs too long. Profile the CPU. |
| High | Low | The loop is starved by something *outside* JavaScript — a blocked threadpool, a noisy neighbour, CPU throttling in the container. |

That last row is the one people misread. A high delay with low utilization means your process was not scheduled, not that your code is slow — check the container CPU quota before you profile. One useful detail: ELU is available immediately on worker threads, because their bootstrap happens inside the loop; on the main thread the fields read `0` until bootstrapping finishes.

## CPU profiling and reading a flame graph

When the loop is blocking, take a profile. The lowest-friction way in production is the built-in V8 sampling profiler:

```bash
node --cpu-prof --cpu-prof-dir ./profiles server.js
```

Node writes a `.cpuprofile` file on exit; open it in Chrome DevTools' Performance panel, or any flame-graph viewer. `--cpu-prof-interval` sets the sampling interval in microseconds (**default 1000**), and `--cpu-prof-name` sets the filename, with `${pid}` available as a template placeholder. These flags are stable.

A flame graph is not a timeline. Read it like this:

- **Width is everything.** A frame's width is the fraction of samples in which that function was on the stack. Wide means expensive; narrow means irrelevant, no matter how ugly the code is.
- **Height is call depth, not cost.** A tall thin tower is a deep call chain that barely ran.
- **Look at the widest *plateau*, not the widest tower.** A wide frame with a wide child is just passing cost down. The frame where the width stops being inherited — the flat top — is where the time is actually spent.
- **`(garbage collector)` frames are a diagnosis, not a target.** If they are 15% of your samples, your problem is allocation rate, and no amount of optimising the function under them will help.
- **`(program)` and native frames** at the top mean time in C++: crypto, compression, `JSON`, regex backtracking.

For allocation problems, `--heap-prof` produces a sampling heap profile the same way (`--heap-prof-dir`, `--heap-prof-name`, and `--heap-prof-interval`, default 512 × 1024 bytes). It tells you which call sites allocate the most bytes, which is usually a more actionable question than "what is retained" — that one is answered by heap snapshots, covered in [Chapter 50](../part7-diagnostics/50-reports-and-heap.md).

## Memory, GC, and heap tuning

V8 splits the heap into a **young generation** (two semi-spaces, collected by frequent, cheap *scavenges*) and an **old generation** (collected by expensive mark-compact cycles). Objects that survive a couple of scavenges get promoted to old space. Almost all GC cost comes from one of two shapes: a **high allocation rate of short-lived objects**, where thousands of individually short scavenges add up in your p99; or a **heap close to its limit**, where V8 spends increasing time collecting in an attempt to free memory and throughput collapses well before the out-of-memory crash.

Watch it directly:

```mjs
import { PerformanceObserver, constants } from 'node:perf_hooks';

const obs = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    const major = entry.detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR;
    console.log(`${major ? 'major' : 'minor'} GC: ${entry.duration.toFixed(2)}ms`);
  }
});
obs.observe({ entryTypes: ['gc'] });
```

The `'gc'` entry's `detail.kind` is one of `NODE_PERFORMANCE_GC_MAJOR`, `NODE_PERFORMANCE_GC_MINOR`, `NODE_PERFORMANCE_GC_MINOR_MARK_SWEEP`, `NODE_PERFORMANCE_GC_INCREMENTAL`, or `NODE_PERFORMANCE_GC_WEAKCB`. Sum `duration` per minute and divide by 60,000 — that is the fraction of wall-clock time your process spends collecting. Above roughly 5%, investigate. Above 15%, you have found your bottleneck.

For the absolute numbers, `v8.getHeapStatistics()` gives `used_heap_size`, `total_heap_size`, `heap_size_limit`, `total_available_size`, and `external_memory`, all in bytes. The ratio `used_heap_size / heap_size_limit` is the number that predicts an OOM crash. `number_of_detached_contexts` being non-zero is a leak signal.

### The flags, and when they help

`--max-old-space-size=SIZE` (MiB) sets the old-space limit. Raising it helps in exactly one situation: your working set legitimately does not fit, and V8 is thrashing near the limit. It does *not* help a leak — it postpones the crash and makes each mark-compact pause longer. The docs' own guidance is to leave room for everything else: on a 2 GiB machine, 1536 is a reasonable value, because the V8 heap is not the whole process (native memory, buffers, and the stack live outside it).

In a container, prefer `--max-old-space-size-percentage=percentage`, which sets the limit as a percentage of available system memory and takes precedence over `--max-old-space-size` when both are given. It saves you from hard-coding a number that becomes wrong when someone resizes the pod.

`--max-semi-space-size=SIZE` (MiB) sets the maximum semi-space for the scavenger. Raising it means young objects get more room before a scavenge, so fewer scavenges run and fewer short-lived objects get wrongly promoted into old space. This is the flag that helps allocation-heavy request handlers. The cost is memory: the young generation is three times the semi-space size, so **+1 MiB of semi-space is +3 MiB of heap**. The default depends on the memory limit — on 64-bit systems with a 512 MiB limit it is 1 MiB, and for limits up to and including 2 GiB it stays under 16 MiB. There is no universally right value; the documentation explicitly tells you to benchmark:

```bash
for MiB in 16 32 64 128; do
  node --max-semi-space-size=$MiB server.js
done
```

Both of these are V8 options passed through by Node. V8 options carry **no stability guarantee** — the V8 team does not treat them as API and may change them at any time. Pin them in a config you can review at each upgrade, not scattered across shell scripts.

One crash-time flag belongs in every production configuration:

```bash
node --heapsnapshot-near-heap-limit=2 --max-old-space-size=2048 server.js
```

`--heapsnapshot-near-heap-limit=max_count` writes up to `max_count` heap snapshots as the heap approaches its limit — the single most valuable artefact for diagnosing an OOM, because it captures the state you can never reproduce locally. It is no longer experimental. Snapshotting itself takes time and memory proportional to heap size, so keep the count small.

## The libuv threadpool

Node's asynchrony is mostly kernel-level: sockets use epoll/kqueue/IOCP and cost no thread. But some operations have no asynchronous system API, so libuv runs them on a **fixed-size worker pool**, default **4 threads**. Per the documentation, the users are:

- all `fs` APIs except the file watchers and the explicitly synchronous ones,
- asynchronous crypto: `crypto.pbkdf2()`, `crypto.scrypt()`, `crypto.randomBytes()`, `crypto.randomFill()`, `crypto.generateKeyPair()`,
- `dns.lookup()`,
- all `zlib` APIs except the explicitly synchronous ones.

Note what is *not* there: network sockets, `http`, and the `dns.resolve*` family. `dns.lookup()` is a call to `getaddrinfo(3)` on a pool thread; `dns.resolve*` talks to the DNS server directly over the network via c-ares and never touches the pool. That difference is the classic saturation trap: four slow DNS lookups will stall every file read in your process.

Saturation looks like this: an operation's *own* duration is normal, but the time from "I called it" to "it started" grows. Measure the gap:

```mjs
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

async function timedRead(path) {
  const queued = performance.now();
  const promise = readFile(path);
  const dispatched = performance.now();  // synchronous part only
  const data = await promise;
  const done = performance.now();
  return { data, submitMs: dispatched - queued, totalMs: done - queued };
}
```

If `totalMs` climbs while the file and the disk are unchanged, and it climbs for *all* pool users at once, the pool is the bottleneck. Raise it:

```bash
UV_THREADPOOL_SIZE=16 node server.js
```

Set it as an environment variable *before the process starts*. Assigning `process.env.UV_THREADPOOL_SIZE` from inside your code is not guaranteed to work, because the pool is created during runtime initialisation, long before user code runs.

Raising the pool is not free — more threads means more context switching and memory — and it does not help if the device itself is the limit. Prefer removing pool users: cache DNS results or use `dns.resolve4()`, hash passwords in a dedicated service, and compress at the reverse proxy.

## Serialization cost

`JSON.stringify` is fast, but it is not free, and it is *synchronous* — a 5 MB response body is a multi-millisecond block of the event loop, per request. When a flame graph shows a wide `stringify` plateau, the fixes in order of value are:

1. **Send less.** Field selection, pagination, and dropping debug fields typically beat every other optimisation combined. A response that is 10× smaller is 10× cheaper to serialize, compress, transmit, and parse.
2. **Do not double-serialize.** Serializing an object to a string, then logging that string, then embedding it in another object costs three passes. Pass structured values to your logger and let it serialize once ([Chapter 51](../part7-diagnostics/51-console-and-logging.md)).
3. **Cache the serialized form.** For responses that are identical across requests — configuration, catalogues, feature flags — keep the `Buffer`, not the object, and write it directly.
4. **Use a schema-aware serializer.** Libraries that compile a JSON schema into a specialised stringify function avoid generic property enumeration and are substantially faster for fixed-shape objects.
5. **Consider a binary format** for service-to-service traffic where no human reads the payload. Node ships one: `v8.serialize(value)` / `v8.deserialize(buffer)` uses the structured clone algorithm, handles `Map`, `Set`, `Date`, `TypedArray`, and cycles, and is what `worker_threads` and `postMessage` use internally. It is **not** a stable interchange format across Node versions — use it between processes you deploy together, never for storage or public APIs.

Validation is the hidden half of this: a validator that reflects over an object on every request can cost more than the parse. Compile schemas once at startup.

## Strings and buffers

Three allocation patterns are worth knowing.

**Repeated string concatenation in a loop** builds a rope of intermediates. V8 handles this better than people fear, but the churn is real for large outputs — push into an array and `join`, or write into a stream.

**`Buffer.concat` in a loop** is genuinely quadratic: each call allocates a new buffer and copies everything so far. Collect chunks in an array and concatenate once — or do not accumulate at all and use a stream.

**`Buffer.allocUnsafe(size)` vs `Buffer.alloc(size)`.** `alloc` zero-fills; `allocUnsafe` does not, which is faster but means the memory may contain old data. Use `allocUnsafe` only when you immediately and completely overwrite the buffer. Never return one you did not fully write — that is an information leak, not an optimisation.

**Converting between `Buffer` and `string` costs a copy and a decode.** A proxy that turns bytes into a string to check a header and back again has paid twice for nothing. Work in bytes when you are moving bytes.

## V8 realities, kept honest

You will read advice about "megamorphic call sites". Here is the accurate version, briefly. V8 optimises property access by remembering the object *shapes* (hidden classes) it has seen at each site. One shape is monomorphic and fastest. Up to four is polymorphic and still fast. Beyond that the site goes **megamorphic** and falls back to a slower generic lookup. You make a site megamorphic by passing objects of many different shapes through the same function — a generic `serialize(anything)` helper, or building objects by conditionally adding properties so that no two instances share a shape.

The rules that follow are cheap habits: initialise every property in the constructor or literal, in the same order, even if the value is `null`; avoid `delete` on hot objects, since it forces dictionary mode — assign `null` or use a `Map`; do not mix types in an array you iterate hotly; and do not contort code to avoid `try`/`catch`, which modern V8 optimises fine.

And the honest part: **none of this will save a slow service.** These are second-order effects worth a few percent. If your flame graph is 40% database driver and 30% GC, shape discipline is noise. Reach for V8 micro-optimisation only when a profile has already identified a genuinely CPU-bound hot loop, and re-measure after each change — intuition about V8 is wrong roughly half the time.

## Startup latency

Startup matters more than it used to: serverless cold starts, autoscaling, rolling deploys, and CI all pay it repeatedly. `performance.nodeTiming` breaks it down — `nodeStart`, `v8Start`, `bootstrapComplete`, `environment`, `loopStart` — so you can tell "Node took a while to boot" from "my dependency tree took a while to compile".

Three levers, in increasing order of effort:

**Fewer and later modules.** Module count dominates: every `require`/`import` is a stat, a read, a parse, and a compile. Move rarely used dependencies behind a lazy `await import()` inside the function that needs them.

**The module compile cache.** Node can persist V8 code cache for compiled modules to disk and reuse it on the next run, skipping recompilation. Enable it with the `NODE_COMPILE_CACHE=dir` environment variable, or from inside the application as early as possible:

```mjs
import module from 'node:module';

module.enableCompileCache();
```

Called without a `directory`, Node picks a default location. `module.getCompileCacheDir()` reports the directory in use, and `module.flushCompileCache()` forces accumulated cache data to disk. Set `NODE_COMPILE_CACHE_PORTABLE=1` if the cache must be reused from a different directory path — for example baked into a container image at build time and used at a different mount point. The compile cache is no longer experimental as of v25.4.0 / v24.15.0.

**Startup snapshots.** `--build-snapshot` runs a script and serialises the resulting heap into a blob; `--snapshot-blob path` loads it. This moves initialisation work from run time to build time:

```bash
node --snapshot-blob snapshot.blob --build-snapshot bootstrap.js
node --snapshot-blob snapshot.blob server.js
```

The builder supports a single entry point and can load builtins but not additional userland modules — bundle first. Not every builtin is serializable, and when the builder hits one that is not it may crash; the workaround is to defer that module to `v8.startupSnapshot.setDeserializeMainFunction()` or `addDeserializeCallback()`. Snapshots pay off for CLIs and short-lived processes; for a server that starts once an hour, the compile cache is the better benefit-to-complexity ratio.

## HTTP-layer wins

The cheapest latency you will ever remove is a TCP handshake you did not need.

**Keep-alive, outbound.** A new `http.Agent` has `keepAlive: false`; only the global agents enable it. Every outbound call should go through a pooled keep-alive agent with a sized `maxSockets` ([Chapter 36](../part5-networking/36-http-clients.md)). On a TLS origin this routinely saves tens of milliseconds per call.

**Keep-alive, inbound.** `server.keepAliveTimeout` must be *longer* than your load balancer's idle timeout, or the balancer will hand a request to a socket the server is closing and you will see mysterious 502s. Node's default is 65 seconds precisely so that it exceeds the common 60-second balancer default; if you lower it, lower the balancer first.

**Compression is a trade, not a win.** gzip and Brotli are CPU work on your event loop's behalf — the `zlib` async APIs use the libuv threadpool, so heavy compression competes with your file I/O. Guidance that holds up:

- Do not compress below roughly 1 KB; the header overhead and CPU exceed the saving.
- Do not compress already-compressed payloads (images, video, `.zip`).
- For dynamic responses, prefer a low Brotli quality. `BROTLI_PARAM_QUALITY` ranges up to 11 and the top settings are enormously more expensive for a few percent of size. Quality 4 is a sane dynamic default, and setting `BROTLI_PARAM_SIZE_HINT` when you know the length helps the encoder.
- Pre-compress static assets at build time at maximum quality and serve the file. You pay once, not per request.
- If you have a reverse proxy, let it compress. It is written for exactly this and it is not your event loop.

## Caching layers and invalidation

Caching is the highest-leverage tool here and the easiest to get wrong. Think in layers, each with an explicit invalidation rule:

| Layer | Latency | Scope | Invalidation |
|---|---|---|---|
| In-process `Map`/LRU | ~100 ns | One process, lost on restart | TTL, or an event from the writer |
| Shared cache (Redis/memcached) | ~1 ms | All processes | Explicit delete on write, or TTL |
| HTTP cache (`Cache-Control`, `ETag`) | 0 for a hit | Clients and CDNs | Max-age and revalidation |
| Materialised/denormalised data | Database-speed | Persistent | Write path recomputes |

Four rules survive contact with production. **Every entry needs a TTL**, even ones you invalidate explicitly — the TTL is your bug budget for the day someone forgets. **Cache the expensive thing**: putting a 200 µs computation behind a 1 ms network cache is a slowdown. **Guard against the stampede** — when a hot key expires, every concurrent request recomputes it at once, so keep a `Map` of in-flight promises keyed by cache key and let later callers await the first. And **bound in-process caches by entry count *and* memory**; an unbounded `Map` keyed by user input is a memory leak with a nice name.

## Where to offload work

When work genuinely must happen and genuinely costs CPU, get it off the request path:

- **Worker threads** ([Chapter 29](../part4-system/29-worker-threads.md)) for CPU-bound work that must return within the request: image resizing, cryptography, large parses. Message passing costs a structured clone, so transfer `ArrayBuffer`s or use `SharedArrayBuffer` for big payloads, and keep a pool — creating a worker per task costs more than the task.
- **Cluster or multiple processes** ([Chapter 30](../part4-system/30-cluster.md)) to use all cores for ordinary request handling. This, not worker threads, is the answer to "high ELU across the board".
- **A queue and a background consumer** for anything the user need not wait for: emails, webhooks, reports, cache warming. Usually the correct answer — and an architecture change rather than a tuning change, which is the point of this chapter.
- **Native addons or WebAssembly** ([Chapter 56](../part8-advanced/56-node-api-addons.md), [Chapter 57](../part8-advanced/57-wasm-wasi.md)) for tight numeric kernels. The crossing cost is real; this pays only for work measured in milliseconds.

## Common mistakes

### ❌ Optimising without a profile

```js
// "JSON is slow, let's hand-roll the response."
function serializeUser(u) {
  return '{"id":"' + u.id + '","name":"' + u.name + '"}';  // and now you have an injection bug
}
```

You introduced an escaping vulnerability to save time a profile would have shown is 0.4% of the request — and you cannot tell whether it helped, because you never measured.

```js
// ✅ Profile first, then fix the widest plateau — which is usually not this.
// node --cpu-prof --cpu-prof-dir ./profiles server.js
```

### ❌ Raising `--max-old-space-size` to "fix" a memory problem

```bash
# ❌ It OOMs at 2 GB, so give it 8 GB.
node --max-old-space-size=8192 server.js
```

If the growth is a leak, you have bought a few hours and made every mark-compact pause dramatically longer, so your p99 gets worse while you wait for the same crash. If the container limit is 4 GB, you have also guaranteed the OOM killer arrives before V8's own limit does, so you lose the graceful failure and any crash artefact.

```bash
# ✅ Capture evidence, and size the heap under the container limit.
node --max-old-space-size-percentage=70 \
     --heapsnapshot-near-heap-limit=2 \
     server.js
```

Then compare the snapshots to find what is retained.

### ❌ Setting `UV_THREADPOOL_SIZE` from inside the process

```mjs
// ❌ The pool was created during runtime initialisation, before this line ran.
process.env.UV_THREADPOOL_SIZE = '32';
import { readFile } from 'node:fs/promises';
```

The documentation is explicit that this is not guaranteed to work. You will see no error and no effect, and you will conclude that pool sizing does not help.

```bash
# ✅ Set it in the environment that launches the process.
UV_THREADPOOL_SIZE=32 node server.js
```

### ❌ Benchmarking with a mean and one client

```bash
# ❌ Tells you almost nothing about production.
time curl http://localhost:3000/checkout
```

One request against a cold process measures compilation, and a mean across a hundred hides the tail. Real bottlenecks — queueing, GC, pool saturation — only appear under concurrency.

```bash
# ✅ Sustained concurrent load, reported as percentiles, against a warmed process.
autocannon -c 100 -d 60 http://localhost:3000/checkout
```

(Any load generator will do; the requirements are concurrency, duration, and percentile output.)

## Production notes

- **Export loop delay and ELU from day one.** They cost a histogram and two counters, and they are the difference between "the service is slow" and "the service blocked for 800 ms at 14:03:12". Everything in [Chapter 62](62-observability.md) builds on them.
- **Set the heap limit relative to the container limit, not the host.** V8 sizes its default heap from what it can see, and in a container that is often the host's memory. If the cgroup limit is 1 GiB and V8 thinks it has 64 GiB, the kernel OOM killer wins and you get no diagnostic at all. `--max-old-space-size-percentage` or an explicit `--max-old-space-size` below the cgroup limit prevents this.
- **Leave headroom outside the heap.** RSS includes buffers, native allocations, the code cache, thread stacks, and glibc fragmentation. A heap limit equal to the memory limit is a crash. Two-thirds is a reasonable starting ratio.
- **Sustained RSS growth with a flat `heapTotal` is usually not a JavaScript leak.** The documentation calls out glibc `malloc` fragmentation specifically; also suspect `Buffer`s held by native code, or an unbounded pool. Check `external` and `arrayBuffers` from `process.memoryUsage()` before you go hunting in a heap snapshot.
- **`process.memoryUsage()` walks pages and can be slow.** Do not call it per request. Sample it on an interval, and use `process.memoryUsage.rss()` when RSS is all you need — it is faster.
- **Keep profiling flags available but off.** `--cpu-prof` and `--heap-prof` have real overhead and write files on exit. The production-safe path is restart-with-flags on a canary, or the inspector protocol against an instance pulled out of the load balancer.
- **Tune one instance, then roll out.** Heap and pool settings interact with your traffic mix. Canary the flags, compare latency percentiles and GC fraction against neighbours for a full traffic cycle, then promote.
- **Re-benchmark after every Node major.** V8 upgrades change GC behaviour, default heap sizing, and optimisation heuristics. A `--max-semi-space-size` that was optimal on one line can be pessimal on the next ([Chapter 63](63-upgrading-node.md)).

## Exercises

1. **Build the health probe.** Export a `getHealth()` returning loop delay p50/p99, ELU over the last interval, `heapUsed`/`heapTotal`/`rss`, and GC time as a fraction of wall clock. *Success:* under a `while` loop that spins for 500 ms, loop delay p99 and ELU both spike and recover.

2. **Detect threadpool saturation.** Issue 64 concurrent `crypto.pbkdf2()` calls with a high iteration count while timing a small `readFile` every 100 ms. *Success:* read latency rises with the default pool of 4, falls when `UV_THREADPOOL_SIZE=32` is set in the environment, and does *not* change when you set `process.env.UV_THREADPOOL_SIZE` inside the script.

3. **Find the plateau.** Write a handler doing three things with deliberately unbalanced costs — a `JSON.parse` of a large body, a regex validation, a synchronous hash — and profile it with `--cpu-prof` under load. *Success:* you name the dominant frame from the flame graph before reading the code, and `performance.mark`/`measure` around each step confirms it.

4. **Tune the semi-space.** Benchmark an allocation-heavy handler at `--max-semi-space-size` of 16, 32, 64 and 128 MiB, recording p99 latency, RSS, and GC time fraction. *Success:* you can plot the trade-off curve and justify the value you would ship on both latency and memory.

5. **Cut cold start.** Measure startup of a service with twenty-plus dependencies using `performance.nodeTiming`, then apply lazy `import()` for off-path dependencies, then `module.enableCompileCache()`. *Success:* you report each change's millisecond contribution separately, and `bootstrapComplete` versus total tells you how much was Node and how much was your code.

## Recap

- Measure, locate, fix one thing, re-measure. The step everyone skips is locating, and the taxonomy table exists so it takes minutes.
- Six bottleneck classes cover almost everything: loop blocking, GC, I/O latency, threadpool saturation, serialization, and downstream dependencies. Only two are JavaScript speed.
- Event loop delay (`monitorEventLoopDelay()`, nanoseconds) and ELU (`eventLoopUtilization()`) read together identify blocking, saturation, and external CPU starvation.
- Flame graph width is cost; find the widest *plateau*. `(garbage collector)` frames mean fix the allocation rate, not the function below them.
- `--max-old-space-size` (or `--max-old-space-size-percentage`) fixes a heap that is genuinely too small and nothing else; `--max-semi-space-size` reduces scavenge frequency at 3× its value in memory, and must be benchmarked.
- The libuv threadpool defaults to 4 threads and serves `fs`, `zlib`, `dns.lookup()`, and several `crypto` functions. `UV_THREADPOOL_SIZE` must be set in the environment before the process starts.
- Serialization wins come from sending less, caching serialized output, and compiled schemas — in that order. `v8.serialize()` is fast but not a stable interchange format.
- Startup cost is module count; fix it with lazy imports, then `NODE_COMPILE_CACHE`/`module.enableCompileCache()`, then snapshots for short-lived processes.
- Keep-alive, right-sized compression, and caching with explicit invalidation beat every JavaScript micro-optimisation you will ever write.

## Where to go next

- [Chapter 49 — Measuring Performance with `perf_hooks`](../part7-diagnostics/49-perf-hooks.md) — the measurement APIs this chapter applies.
- [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md) — capturing and reading the artefacts.
- [Chapter 62 — Observability in Production](62-observability.md) — turning these signals into metrics, traces, and alerts.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) and [Chapter 30 — Cluster and Multi-Process Scaling](../part4-system/30-cluster.md) — where the CPU work goes.
- [Chapter 36 — HTTP/1.1 Clients, Agents, and Keep-Alive](../part5-networking/36-http-clients.md) — connection pooling in detail.
- [Chapter 21 — Compression with zlib](../part3-data/21-zlib.md) — the compression options this chapter trades off.
- Official documentation: <https://nodejs.org/docs/latest/api/perf_hooks.html> and <https://nodejs.org/docs/latest/api/cli.html>
