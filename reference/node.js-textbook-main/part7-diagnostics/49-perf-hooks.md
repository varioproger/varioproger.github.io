---
chapter: 49
part: "Part VII — Testing, Debugging, Diagnostics"
title: "Measuring Performance with perf_hooks"
level: advanced
reading_time: "35 min"
prerequisites: [9, 12, 35, 48]
source_docs:
  - "doc/api/perf_hooks.md"
source_url: "https://nodejs.org/docs/latest/api/perf_hooks.html"
node_baseline: "27.0.0-pre"
---

# Chapter 49 — Measuring Performance with `perf_hooks`

## What you will learn

- Why `Date.now()` is the wrong clock for durations, and what `performance.now()` and `performance.timeOrigin` give you instead.
- The User Timing model — `mark`, `measure`, and the Performance Timeline — and how to collect entries with a `PerformanceObserver` instead of polling.
- Every entry type Node emits (`node`, `mark`, `measure`, `function`, `gc`, `http`, `http2`, `dns`, `net`, `resource`) and what each one's `detail` carries.
- How to read the `PerformanceNodeTiming` startup breakdown for cold-start analysis.
- How to turn `monitorEventLoopDelay()` and `eventLoopUtilization()` into an SLO you can alert on, and how to record your own latency histograms cheaply.
- Why microbenchmarks lie, and what to measure instead.

## Why this matters

Somebody reports that your API "feels slow." You add `const t = Date.now()` at the top of the handler and `Date.now() - t` at the bottom, log the result, and see 2 ms. The dashboard says p99 is 900 ms. Both numbers are correct. They just measure different things: your handler is fast, and requests spend 898 ms sitting in a queue behind a synchronous JSON serialization somewhere else in the process.

`node:perf_hooks` exists to close that gap. It gives you a monotonic high-resolution clock, a structured timeline you can subscribe to, first-class instrumentation of things you did not write (GC pauses, DNS lookups, HTTP round-trips), and — most importantly for services — direct measurement of how long the event loop itself is blocked. That last number is the one that explains "fast handler, slow service." Everything in this chapter is Stability 2 — Stable, and `performance` and `PerformanceObserver` are globals, so you do not even need the import.

## Clocks: what you are actually measuring

`Date.now()` returns wall-clock time in milliseconds since the Unix epoch. Three properties make it unsuitable for measuring durations:

1. **It is not monotonic.** NTP adjustments, a `settimeofday` from a hypervisor, or a daylight-saving change can move it backwards. A duration computed across such an adjustment can be negative or wildly wrong.
2. **Its resolution is one millisecond.** Anything faster than that reads as `0` or `1`.
3. **It is a syscall-backed read of a shared clock**, so it is not free in a tight loop.

`performance.now()` returns a high-resolution millisecond timestamp — a float, so sub-millisecond precision — where `0` is the start of the current Node process. It is monotonic. Subtracting two `performance.now()` readings always yields a sane elapsed time.

`performance.timeOrigin` is the bridge back to wall time: it is the high-resolution millisecond timestamp, *in Unix time*, at which the process began. So `performance.timeOrigin + performance.now()` is a high-resolution wall-clock timestamp, useful when you need to correlate a span with a log line or a trace from another system.

```js
const startedAtUnixMs = performance.timeOrigin + performance.now();
console.log(new Date(startedAtUnixMs).toISOString());
```

| Clock | Monotonic | Resolution | Zero point | Use it for |
|---|---|---|---|---|
| `Date.now()` | No | 1 ms | Unix epoch | Timestamps a human or another system reads |
| `performance.now()` | Yes | sub-ms float | Process start | Durations, spans, benchmarks |
| `performance.timeOrigin` | n/a | sub-ms float | Unix epoch | Converting `now()` back to wall time |
| `process.hrtime.bigint()` | Yes | nanoseconds (BigInt) | Arbitrary | Durations where float precision is not enough |

Use `performance.now()` by default. Reach for `process.hrtime.bigint()` only in the tens-of-nanoseconds range, where the float's precision loss matters — and remember BigInt arithmetic is slower than number arithmetic, which perturbs the thing you are measuring.

## User Timing: marks and measures

The User Timing API is a W3C model that Node implements. It has two verbs.

A **mark** is a named instant. `performance.mark(name[, options])` creates a `PerformanceMark` entry whose `duration` is always `0`. The options are:

| Option | Type | Meaning |
|---|---|---|
| `detail` | any | Arbitrary payload attached to the entry |
| `startTime` | number | Use this timestamp instead of `performance.now()` |

A **measure** is a named interval. `performance.measure(name[, startMarkOrOptions[, endMark]])` creates a `PerformanceMeasure` whose `duration` is the elapsed milliseconds between two points. The second argument is either the name of an existing mark, or an options object:

| Option | Type | Meaning |
|---|---|---|
| `detail` | any | Arbitrary payload |
| `start` | number \| string | Timestamp, or the name of an existing mark |
| `end` | number \| string | Timestamp, or the name of an existing mark |
| `duration` | number | Duration between start and end |

If you name a mark that does not exist, `measure()` throws. If you omit `endMark`, the end is `performance.now()`. A start mark may also name any timestamp property of `PerformanceNodeTiming` — that is how you measure "from process start to my first request."

```js
performance.mark('parse:start');
const config = parseConfigFile(raw);
performance.mark('parse:end');
performance.measure('parse', 'parse:start', 'parse:end');
```

Marks and measures land in a **global Performance Timeline**. That timeline is a real object that grows. `performance.getEntries()`, `getEntriesByName(name[, type])`, and `getEntriesByType(type)` read it, and `performance.clearMarks([name])` and `performance.clearMeasures([name])` empty it. Calling them with no argument clears everything of that kind.

This is the first trap. In a long-running service, marking every request without ever clearing is an unbounded array — a memory leak with a performance API's name on it. The docs are explicit that entries "should be cleared from the global Performance Timeline manually."

## `PerformanceObserver`: subscribe, don't poll

The right way to collect entries is never `getEntries()` on a timer. It is a `PerformanceObserver`: you register a callback, Node invokes it asynchronously with a batch of new entries, and you aggregate and discard.

```mjs
import { PerformanceObserver, performance } from 'node:perf_hooks';

const obs = new PerformanceObserver((list, observer) => {
  for (const entry of list.getEntries()) {
    console.log(entry.name, entry.duration.toFixed(3));
  }
  performance.clearMeasures();
});

obs.observe({ type: 'measure' });
```

```cjs
const { PerformanceObserver, performance } = require('node:perf_hooks');

const obs = new PerformanceObserver((list, observer) => {
  for (const entry of list.getEntries()) {
    console.log(entry.name, entry.duration.toFixed(3));
  }
  performance.clearMeasures();
});

obs.observe({ type: 'measure' });
```

`observe(options)` takes exactly one of two selectors, never both:

| Option | Type | Meaning |
|---|---|---|
| `type` | string | A single entry type |
| `entryTypes` | string[] | An array of entry types. Required if `type` is absent |
| `buffered` | boolean | Deliver already-buffered global entries on the first callback. **Default:** `false` |

`buffered: true` matters more than it looks. Observers are asynchronous — by the time you construct one in your main module, Node has already emitted `node` and possibly `gc` entries. Without buffering you miss them permanently. With `buffered: true`, your first callback receives the backlog. Use it whenever you care about anything that happened before your code ran.

`observer.takeRecords()` returns the entries currently queued in the observer and empties it — useful for a synchronous flush at shutdown. `observer.disconnect()` unsubscribes, and disconnecting matters: the docs state that observers "introduce their own additional performance overhead" and should not be left subscribed indefinitely. Subscribing to `'http'` in production makes Node build a `detail` object with request and response headers for every single request.

`PerformanceObserver.supportedEntryTypes` is a static array of the type strings this build accepts; check against it rather than hardcoding. The callback receives a `PerformanceObserverEntryList`, mirroring the global timeline's read API scoped to that batch: `getEntries()`, `getEntriesByName(name[, type])`, `getEntriesByType(type)`.

## The entry types Node emits

Every entry is a `PerformanceEntry` with four base properties: `name`, `entryType`, `startTime` (high-resolution ms), and `duration` (ms, and explicitly *not* meaningful for all types — a mark's duration is always 0). Node-specific entries extend this as `PerformanceNodeEntry`, adding a `detail` property whose shape depends on the type.

| `entryType` | Origin | What it represents | `detail` |
|---|---|---|---|
| `'mark'` | Web | An instant you created | The `detail` you passed |
| `'measure'` | Web | An interval you created | The `detail` you passed |
| `'resource'` | Web | A `fetch()` / undici request | A `PerformanceResourceTiming` with a full phase breakdown |
| `'node'` | Node | The singleton `PerformanceNodeTiming` startup entry | — |
| `'gc'` | Node | One garbage collection pause | `{ kind, flags }` numeric constants |
| `'function'` | Node | One call of a `timerify`-wrapped function | Array of the call's arguments |
| `'http'` | Node | An HTTP/1 request or client round-trip | `{ req: { method, url, headers }, res: { statusCode, statusMessage, headers } }` |
| `'http2'` | Node | An `Http2Stream` or `Http2Session` | Byte counts, frame counts, `timeToFirstByte`, `pingRTT`, and more |
| `'net'` | Node | A successful `net.connect` | `{ host, port }` |
| `'dns'` | Node | A `lookup`, `lookupService`, `queryxxx`, or `getHostByAddr` | Query inputs plus the resolved `addresses` / `result` |

Three of these deserve a note.

**`'http'`** entries come in two flavours distinguished by `entry.name`: `HttpClient` (time from starting an outgoing request to receiving the response) and `HttpRequest` (time from receiving an inbound request to sending the response). The docs warn directly that the header-carrying `detail` "could add additional memory overhead and should only be used for diagnostic purposes, not left turned on in production by default." Treat it as a debugging switch, not a metrics source.

**`'resource'`** entries are `PerformanceResourceTiming` objects with the browser-style waterfall: `redirectStart`/`redirectEnd`, `domainLookupStart`/`domainLookupEnd`, `connectStart`/`connectEnd`, `secureConnectionStart`, `requestStart`, `responseEnd`, plus `transferSize`, `encodedBodySize`, and `decodedBodySize`. This is the cheapest way to find out whether a slow `fetch()` is slow in DNS, TLS, or the server. The resource buffer defaults to 250 entries; `performance.setResourceTimingBufferSize(maxSize)` changes it, `performance.clearResourceTimings([name])` empties it, and `performance` emits a `'resourcetimingbufferfull'` event when it fills.

**`'dns'`** entries are how you prove that a lookup, not your database, is the tail. `lookup` entries carry `hostname`, `family`, `hints`, `verbatim`, and `addresses`.

## `timerify` and its caveats

`perf_hooks.timerify(fn[, options])` (also available as `performance.timerify`, and as a top-level export since v25.2.0) returns a wrapper that emits a `'function'` entry per call.

```mjs
import { timerify, PerformanceObserver } from 'node:perf_hooks';

function renderTemplate(name, data) {
  return `<h1>${name}</h1>`;
}

const timed = timerify(renderTemplate);

const obs = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) console.log(e.name, e.duration);
  obs.disconnect();
});
obs.observe({ entryTypes: ['function'] });

timed('report', {});
```

Caveats, in the order they bite:

- **No observer, no data.** You must subscribe to `'function'` before calling the wrapper, or the timings are discarded.
- **Async functions work, but the semantics differ.** If the wrapped function returns a promise, Node attaches a `finally` handler and reports the duration when that settles. So the number is wall-clock time including everything you awaited — not CPU time spent in your function.
- **The `detail` is the argument list.** Every entry holds a reference to the arguments of that call. If you timerify a function that takes a 10 MB buffer, the entry retains that buffer until you clear it.
- **The wrapper is a different function object.** It changes `fn.name`, defeats inline caches, and is not free. Do not timerify something called a million times a second.
- The `options.histogram` field takes a `RecordableHistogram` from `createHistogram()`, which records durations **in nanoseconds**. This is the production-safe mode: aggregate, no per-call entries.

## Reading the startup breakdown

`performance.nodeTiming` is a single `PerformanceNodeTiming` entry describing process startup. For cold-start analysis — serverless, CLI tools, containers that get rescheduled constantly — this is the primary instrument.

| Property | Meaning | Sentinel |
|---|---|---|
| `nodeStart` | When the Node process was initialized | — |
| `v8Start` | When the V8 platform was initialized | — |
| `environment` | When the Node environment was initialized | — |
| `bootstrapComplete` | When bootstrapping finished | `-1` if not yet |
| `loopStart` | When the event loop started | `-1` if not yet |
| `loopExit` | When the event loop exited | `-1` until the `'exit'` event |
| `idleTime` | Total ms the loop spent inside its event provider (e.g. `epoll_wait`) | `0` before the loop starts |
| `uvMetricsInfo` | `{ loopCount, events, eventsWaiting }` | — |

Read it as a sequence. `nodeStart → v8Start → environment → bootstrapComplete` is Node getting itself ready; that stretch is roughly fixed and you cannot optimize it. `bootstrapComplete → loopStart` is **your** cost: it is your top-level module graph being loaded and executed. If a Lambda cold-starts in 900 ms and `loopStart - bootstrapComplete` is 700 ms, the answer is not "Node is slow," it is "you are importing an SDK you use in one code path."

```mjs
import { performance } from 'node:perf_hooks';

process.on('exit', () => {
  const t = performance.nodeTiming;
  console.error(JSON.stringify({
    runtime_ms: +(t.bootstrapComplete - t.nodeStart).toFixed(1),
    user_modules_ms: +(t.loopStart - t.bootstrapComplete).toFixed(1),
    loop_ms: +(t.loopExit - t.loopStart).toFixed(1),
    idle_ms: +t.idleTime.toFixed(1),
  }));
});
```

`uvMetricsInfo` wraps libuv's `uv_metrics_info`. `loopCount` is how many times the loop has turned; `events` is how many events were processed; `eventsWaiting` is how many were queued when the provider was last called. A persistently non-zero `eventsWaiting` means work is arriving faster than a turn can drain it. Read it inside a `setImmediate()` callback so you sample after the current iteration's work is complete.

## Event loop delay: the number that matters

`perf_hooks.monitorEventLoopDelay([options])` returns an `ELDHistogram`. Node schedules a timer at a known interval; the difference between when the timer *should* have fired and when it *did* fire is event loop delay, recorded **in nanoseconds**.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `resolution` | number | `10` | Sampling interval in ms (interval mode) |
| `samplePerIteration` | boolean | `false` | Sample once per loop iteration via `uv_prepare_t`/`uv_check_t` hooks instead |

`samplePerIteration` is new (v26.5.0 / v24.19.0) and is the better default for a long-lived idle-capable service: in that mode the histogram does not keep the loop alive and does not force extra iterations when the app is idle. The docs are emphatic that the two modes "produce significantly different results and should not be compared directly" — pick one and stick to it.

The `Histogram` surface is the same across every histogram in this module:

| Member | Type | Notes |
|---|---|---|
| `enable()` / `disable()` | method → boolean | `ELDHistogram` only; `false` if already in that state |
| `[Symbol.dispose]()` | method | Disables on scope exit, for `using` declarations |
| `percentile(p)` | method | `p` in the range (0, 100] |
| `percentiles` | Map | The whole accumulated distribution |
| `percentilesAt(list)` | method → Map | Several percentiles in one pass — cheaper than repeated `percentile()` |
| `mean`, `stddev`, `min`, `max` | number | |
| `count` | number | Samples recorded |
| `exceeds` | number | Times the delay exceeded the 1-hour ceiling |
| `skewness`, `kurtosis` | number | Distribution shape |
| `cdf(v)` / `ccdf(v)` | method → 0..1 | Probability a sample is ≤ / > `v` |
| `countAt(v)` | method | Samples in `v`'s bucket |
| `ksTest(other)` | method → 0..1 | Kolmogorov–Smirnov D-statistic vs another histogram |
| `linearBuckets(step)` / `logBuckets(first, base)` | method → Map | Rebucket for export or plotting |
| `reset()` | method | Zero the data |

Every numeric getter has a `BigInt` twin — `minBigInt`, `maxBigInt`, `countBigInt`, `exceedsBigInt`, `percentileBigInt(p)`, `percentilesBigInt` — for when nanosecond counts exceed safe-integer range.

### Turning this into an SLO

Raw delay numbers are not actionable; a threshold is. The useful framing: *event loop delay is the queueing time every request pays before your handler even starts.* If your p99 handler latency budget is 200 ms and your loop p99 delay is 150 ms, you have 50 ms of actual budget.

A workable rule for a typical HTTP service:

- **p50 delay under ~1 ms.** Anything higher means you are consistently blocking.
- **p99 delay under ~50 ms.** This is the number to alert on.
- **`max` is a bug report, not a metric.** A 2-second max means something in your code ran synchronously for 2 seconds — find it and make it async or move it to a worker thread (Chapter 29).

Sample and reset on a fixed cadence so each reported window is independent:

```mjs
import { monitorEventLoopDelay } from 'node:perf_hooks';

const loop = monitorEventLoopDelay({ samplePerIteration: true });
loop.enable();

setInterval(() => {
  const p = loop.percentilesAt([50, 99]);
  console.log(JSON.stringify({
    metric: 'event_loop_delay_ms',
    p50: p.get(50) / 1e6,
    p99: p.get(99) / 1e6,
    max: loop.max / 1e6,
  }));
  loop.reset();
}, 10_000).unref();
```

Note the `/ 1e6`: the histogram is in nanoseconds and your dashboard almost certainly wants milliseconds. And note `.unref()` — a metrics timer must never be the reason a process refuses to exit.

## Event loop utilization

`perf_hooks.eventLoopUtilization([utilization1[, utilization2]])` (also `performance.eventLoopUtilization`) returns `{ idle, active, utilization }`. `idle` and `active` are cumulative milliseconds; `utilization` is `active / (active + idle)`, a number from 0 to 1.

Called with no arguments you get cumulative-since-start values, which are almost never what you want. Pass a previous result to get the delta for the interval between the two calls:

```mjs
import { eventLoopUtilization } from 'node:perf_hooks';

let last = eventLoopUtilization();
setInterval(() => {
  const now = eventLoopUtilization();
  const { utilization } = eventLoopUtilization(now, last);
  last = now;
  console.log('elu', utilization.toFixed(3));
}, 5_000).unref();
```

Interpretation, and this is where people go wrong: **ELU is not CPU utilization.** It measures the fraction of time the loop spent *outside* its event provider. A process that is 99% blocked on `spawnSync('sleep', ['5'])` — burning no CPU at all — reports a utilization of `1`, because the loop cannot proceed. That is a feature: ELU answers "can this process accept more work?", which is exactly the question a load balancer or an autoscaler wants answered.

Practical readings: below ~0.5, healthy. Sustained above ~0.8, the process is saturated and latency will degrade non-linearly — shed load or scale out. Above 0.95 with low CPU, you are blocked on something synchronous. On worker threads ELU is available immediately, since their bootstrap happens inside the loop; on the main thread it reads `0` until bootstrap completes. Never construct the `utilization1` object yourself — the docs say passing a user-defined object leads to undefined behaviour.

## Watching the garbage collector

Subscribing to `'gc'` gives you one entry per collection, with `duration` being the pause.

```mjs
import { PerformanceObserver, constants } from 'node:perf_hooks';

const MAJOR = constants.NODE_PERFORMANCE_GC_MAJOR;
let majorPauseMs = 0;

const obs = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    if (e.detail.kind === MAJOR) majorPauseMs += e.duration;
  }
});
obs.observe({ entryTypes: ['gc'] });
```

`detail.kind` is one of `NODE_PERFORMANCE_GC_MAJOR`, `_MINOR`, `_MINOR_MARK_SWEEP`, `_INCREMENTAL`, or `_WEAKCB`, all on `perf_hooks.constants`. `detail.flags` carries `NODE_PERFORMANCE_GC_FLAGS_NO`, `_CONSTRUCT_RETAINED`, `_FORCED`, `_SYNCHRONOUS_PHANTOM_PROCESSING`, `_ALL_AVAILABLE_GARBAGE`, `_ALL_EXTERNAL_MEMORY`, and `_SCHEDULE_IDLE`. (The older top-level `entry.kind` and `entry.flags` properties are **[Deprecated]** in favour of `detail`.)

What to read from the trend: minor GCs are frequent, sub-millisecond, and boring. **Rising major GC pause duration over a service's lifetime is the classic leak signature** — V8 is scanning an ever-larger live set, so each full collection takes longer while reclaiming proportionally less. If your `majorPauseMs` per minute climbs steadily across hours, take heap snapshots (Chapter 50) before the OOM kills you.

## Recording your own histograms

`perf_hooks.createHistogram([options])` returns a `RecordableHistogram` — an HDR histogram with fixed memory cost regardless of sample count.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `lowest` | number \| bigint | `1` | Lowest discernible value; integer > 0 |
| `highest` | number \| bigint | `Number.MAX_SAFE_INTEGER` | Highest recordable value; ≥ 2 × `lowest` |
| `figures` | number | `3` | Significant digits of accuracy, 1–5 |

Beyond the read-only `Histogram` surface, it adds `record(val)`, `recordDelta()` (records nanoseconds since the previous `recordDelta()` call), `recordCorrected(val, expectedInterval)`, `add(other)`, and `subtract(other)`.

`recordCorrected` deserves a mention because it fixes a real measurement bug. If your process stalls for 500 ms, a naive recorder logs *one* slow sample; the 49 requests that would have arrived during the stall never got sampled at all, so your p99 looks fine. This is *coordinated omission*. `recordCorrected(val, expectedInterval)` backfills the intermediate values at `expectedInterval` steps, giving you the latency the system actually delivered.

`subtract(other)` lets you diff snapshots; `ksTest(other)` gives you a single number for "did this deploy change the latency distribution?" — near 0 means the distributions match, near 1 means they are disjoint.

## Worked example: cheap latency and loop-delay telemetry

Here is the pattern to actually ship. It records per-request latency into a `RecordableHistogram`, samples event loop delay per iteration, and emits a structured line every ten seconds. No per-request objects, no observers left running, no unbounded timeline.

```mjs
import { createServer } from 'node:http';
import {
  createHistogram,
  monitorEventLoopDelay,
  eventLoopUtilization,
  performance,
} from 'node:perf_hooks';

// Nanosecond resolution, 1 ns .. 60 s, 3 significant digits.
const latency = createHistogram({ lowest: 1, highest: 60_000_000_000, figures: 3 });
const loop = monitorEventLoopDelay({ samplePerIteration: true });
loop.enable();
let lastElu = eventLoopUtilization();

const server = createServer((req, res) => {
  const start = performance.now();
  res.on('finish', () => {
    // performance.now() is ms; the histogram wants integer ns.
    latency.record(Math.max(1, Math.round((performance.now() - start) * 1e6)));
  });
  res.end('ok');
});

setInterval(() => {
  const lat = latency.percentilesAt([50, 99]);
  const loopP = loop.percentilesAt([50, 99]);
  const nowElu = eventLoopUtilization();
  const { utilization } = eventLoopUtilization(nowElu, lastElu);
  lastElu = nowElu;

  process.stdout.write(JSON.stringify({
    ts: new Date().toISOString(),
    requests: latency.count,
    latency_p50_ms: lat.get(50) / 1e6,
    latency_p99_ms: lat.get(99) / 1e6,
    latency_max_ms: latency.max / 1e6,
    loop_delay_p50_ms: loopP.get(50) / 1e6,
    loop_delay_p99_ms: loopP.get(99) / 1e6,
    elu: +utilization.toFixed(3),
  }) + '\n');

  latency.reset();
  loop.reset();
}, 10_000).unref();

server.listen(3000);
```

Why this is cheap: two `performance.now()` calls and one integer `record()` per request. The histogram's memory is bounded by its bucket configuration, not by request count — a million requests cost the same as a thousand. Contrast with `performance.mark()` per request, which allocates an entry object per request and keeps it until you clear.

The `Math.max(1, ...)` guard matters: `lowest` is 1, and recording 0 in a histogram whose lowest discernible value is 1 is not meaningful.

## Benchmarking methodology

Most Node "benchmarks" you will see are wrong in at least one of these ways.

**No warmup.** V8 runs your function in the interpreter first, then optimizes it after it observes enough calls, and may deoptimize it if your types change. The first 1,000 iterations of a hot loop can be 50× slower than the steady state. Always discard a warmup phase.

**One run, one number.** Timing noise on a shared machine is enormous: CPU frequency scaling, other tenants, GC landing inside your measurement window. Run many iterations, report a distribution — median and p99, not a mean — and run the whole benchmark several times to check the numbers are stable between runs.

**Dead code elimination.** Benchmark `JSON.stringify(obj)` and throw the result away, and V8 is entitled to notice nothing observes it. Accumulate the result into a variable that escapes.

**Measuring the loop, not the work.** Below a microsecond, timing overhead dominates. Time a batch of N iterations and divide.

**And the big one: microbenchmarks lie about production.** A benchmark runs one code path, in one shape, on a warm cache, with no concurrent GC pressure. In production that function sees polymorphic inputs, competes with fifty other allocation sites, and runs on a heap where every allocation may trigger a scavenge. A 30% win in isolation routinely disappears entirely.

What to measure instead, in priority order:

1. **End-to-end latency percentiles under realistic concurrency.** This is the only number a user experiences.
2. **Event loop delay.** Tells you whether you are blocking.
3. **ELU.** Tells you how much headroom is left.
4. **GC pause time per interval.** Tells you whether allocation pressure is the problem.
5. Only then, microbenchmarks — and only to compare two candidates for a function you have already *proven* is hot with a profiler.

## Common mistakes

### ❌ Timing durations with `Date.now()`

```js
const t0 = Date.now();
await doWork();
console.log(`took ${Date.now() - t0}ms`);
```

Millisecond resolution turns anything sub-millisecond into `0`, and a clock adjustment mid-operation can produce a negative duration.

```js
const t0 = performance.now();
await doWork();
console.log(`took ${(performance.now() - t0).toFixed(3)}ms`);
```

### ❌ Marking every request and never clearing

```js
server.on('request', (req) => {
  performance.mark(`req-${req.id}-start`);
});
```

The global Performance Timeline grows forever. After a day of traffic, `getEntries()` returns millions of objects and your RSS reflects it.

```js
// Aggregate into a fixed-size histogram instead; no timeline entries at all.
const latency = createHistogram();
server.on('request', (req) => {
  const start = performance.now();
  req.res?.on('finish', () => {
    latency.record(Math.max(1, Math.round((performance.now() - start) * 1e6)));
  });
});
```

If you genuinely need marks, call `performance.clearMarks()` and `performance.clearMeasures()` inside your observer callback.

### ❌ Leaving an `'http'` observer connected in production

```js
const obs = new PerformanceObserver((list) => { /* ... */ });
obs.observe({ entryTypes: ['http'] });   // stays on forever
```

Each entry's `detail` holds request and response header objects. The docs say this "should only be used for diagnostic purposes, not left turned on in production by default."

```js
// Gate it, and always disconnect.
if (process.env.TRACE_HTTP === '1') {
  const obs = new PerformanceObserver((list) => { /* ... */ });
  obs.observe({ entryTypes: ['http'] });
  setTimeout(() => obs.disconnect(), 60_000).unref();
}
```

### ❌ Reading `eventLoopUtilization()` with no baseline

```js
setInterval(() => console.log(eventLoopUtilization().utilization), 5000);
```

Those are cumulative-since-start figures. After an hour of uptime, a total outage barely moves the number.

```js
let last = eventLoopUtilization();
setInterval(() => {
  const now = eventLoopUtilization();
  console.log(eventLoopUtilization(now, last).utilization);
  last = now;
}, 5000).unref();
```

### ❌ Comparing histogram numbers in the wrong unit

`monitorEventLoopDelay()` and `timerify`'s histogram record **nanoseconds**; `performance.now()` and `entry.duration` are **milliseconds**. Mixing them silently produces alerts that are off by a factor of a million. Convert at the edge, and put the unit in the metric name (`loop_delay_p99_ms`).

## Production notes

- **Budget your observers.** A `PerformanceObserver` has real cost, and `'http'`, `'http2'`, and `'function'` observers allocate a `detail` object per event. Prefer histogram aggregation for anything per-request; reserve observers for low-frequency events (`gc`, `node`) or short-lived debugging windows.
- **Histograms are the production-safe primitive.** `createHistogram()` gives you fixed memory regardless of sample volume, which is exactly the property a metrics path needs. `percentilesAt([50, 90, 99])` computes several percentiles in one pass; use it rather than three `percentile()` calls in a hot reporting loop.
- **Always `unref()` metrics timers.** A `setInterval` that reports metrics will otherwise keep a process alive through what should be a clean exit — one of the more common "why won't my container stop" causes (see Chapter 50's libuv handle section for how to diagnose it).
- **Each worker thread has its own everything.** Event loop delay, ELU, and the Performance Timeline are per-thread. A main thread showing 0.1 ELU while a worker pool sits at 0.99 looks healthy and is not. Instrument every thread and label the metric with `worker_threads.threadId`.
- **Alert on p99 event loop delay, not mean.** The mean is dragged to near-zero by thousands of idle samples. A 400 ms p99 with a 0.3 ms mean is a service with a serious problem and a reassuring average.
- **Sampling entry types is not free at the source.** Node only computes `'gc'`, `'http'`, `'dns'`, and `'net'` entry detail when an observer for that type is connected. Connecting one flips on work throughout the runtime, so measure the cost of your instrumentation in a load test before shipping it.
- **Correlate startup metrics with deploys.** Emit `loopStart - bootstrapComplete` on every process exit or first request. A dependency upgrade that adds 200 ms of module evaluation is invisible in steady-state metrics and obvious here.

## Exercises

1. **Clock comparison.** Write a script that times an empty loop of 1,000 iterations using `Date.now()`, `performance.now()`, and `process.hrtime.bigint()`, printing all three. *Success:* `Date.now()` reports `0` or `1` while the other two report a non-trivial sub-millisecond value, and you can explain why in one sentence.

2. **Cold-start breakdown.** Take any script that imports at least three third-party packages. Print, on `'exit'`, the four intervals from `performance.nodeTiming`. *Success:* you can state how many milliseconds of startup are Node's and how many are your module graph's, and removing one import measurably reduces the second number.

3. **Blocking detector.** Build a module that enables `monitorEventLoopDelay({ samplePerIteration: true })` and logs a warning whenever a 5-second window's p99 exceeds 50 ms, including the max. Verify it by calling a function that busy-loops for 300 ms. *Success:* the warning fires with a max ≥ 300 ms and the process still exits cleanly when the server closes.

4. **GC trend alarm.** Instrument a service to accumulate major-GC pause milliseconds per minute via a `'gc'` observer. Then deliberately leak — push a 1 MB buffer into a module-scope array every 100 ms — and chart the per-minute total. *Success:* you can point at the minute where major GC time starts climbing, before the process actually OOMs.

5. **Honest benchmark.** Compare two implementations of a function (say, string concatenation versus `Array.join`) using `createHistogram()` with an explicit warmup phase, ≥ 10,000 measured iterations, and results reported as p50/p99. Then run the same comparison inside a loaded HTTP server. *Success:* you report both sets of numbers and explain any disagreement between them.

## Recap

- `performance.now()` is monotonic, sub-millisecond, and zeroed at process start; `performance.timeOrigin` converts it back to Unix time. `Date.now()` is for timestamps, never durations.
- `mark()` and `measure()` write to a *global* timeline that you must clear yourself, or it becomes a leak.
- Collect entries with a `PerformanceObserver`, not by polling. Use `buffered: true` to catch entries emitted before your code ran, and `disconnect()` when done.
- Node emits ten entry types: `mark`, `measure`, `resource`, `node`, `gc`, `function`, `http`, `http2`, `net`, and `dns`. The Node-specific ones carry a type-dependent `detail`.
- `performance.nodeTiming` splits startup into runtime bootstrap versus your module graph — the single most useful cold-start measurement.
- `monitorEventLoopDelay()` measures queueing time every request pays. Alert on p99; treat `max` as a bug report.
- `eventLoopUtilization()` answers "can this process take more work?" and is not CPU utilization — a blocked, idle-CPU process reports `1`.
- `createHistogram()` gives fixed-memory percentile tracking, with `recordCorrected()` for coordinated omission and `ksTest()` for regression detection.
- Microbenchmarks describe a warm, monomorphic, GC-quiet world that production is not. Measure end-to-end latency percentiles, loop delay, ELU, and GC time first.

## Where to go next

- [Chapter 9 — The Event Loop: Phases, Microtasks, and Starvation](../part2-async/09-event-loop.md) — what event loop delay is delay *of*.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) — where to move the work that is inflating your loop delay.
- [Chapter 48 — Diagnostics Channel and Trace Events](48-diagnostics-channel-tracing.md) — the other in-process instrumentation surface, for events rather than timings.
- [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](50-reports-and-heap.md) — where to go when GC trends say "leak."
- [Chapter 61 — Performance Tuning](../part9-production/61-performance-tuning.md) — acting on what you measured here.
- [Chapter 62 — Observability in Production](../part9-production/62-observability.md) — shipping these numbers somewhere they can page you.
- Official documentation: <https://nodejs.org/docs/latest/api/perf_hooks.html>
