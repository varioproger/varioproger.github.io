---
chapter: 62
part: "Part IX — Production Practice"
title: "Observability in Production"
level: advanced
reading_time: "40 min"
prerequisites: [15, 48, 49, 50, 51, 61]
source_docs:
  - "doc/api/perf_hooks.md"
  - "doc/api/diagnostics_channel.md"
  - "doc/api/report.md"
  - "doc/api/process.md"
  - "doc/api/v8.md"
  - "doc/api/async_context.md"
source_url: "https://nodejs.org/docs/latest/api/diagnostics_channel.html"
node_baseline: "27.0.0-pre"
---

# Chapter 62 — Observability in Production

**What you will learn**

- What metrics, traces, and logs each actually answer, and why a system with only one of them leaves you guessing.
- The specific numbers a Node service should always export — including the ones only Node can tell you — and how to collect them without slowing the hot path.
- How request context propagates with `AsyncLocalStorage`, how `diagnostics_channel` and `TracingChannel` make instrumentation possible without monkey-patching, and what OpenTelemetry does with both.
- How to capture crash evidence automatically: diagnostic reports on fatal error, heap snapshots near the heap limit, and core dumps.
- How to write a health endpoint that tells the truth, and how to alert on symptoms instead of causes.

**Why this matters**

At 03:14 your pager fires: "checkout error rate 12%." You open the dashboard. CPU is normal. Memory is normal. Requests per second are normal. Errors are 12%. That is everything you know, and it is not enough to do anything with.

The difference between that night and a five-minute night is not more dashboards. It is having decided, in advance, which questions you will need answered and having made the running system able to answer them. Observability is that property: can you explain a novel failure from the data you are already collecting, without shipping a new build? Node gives you unusually good raw material — event loop delay, ELU, GC timing, diagnostic reports, `diagnostics_channel` — and almost none of it is on by default. This chapter is about wiring it up deliberately.

## The three pillars, as questions

"Metrics, logs, traces" is repeated so often it has stopped meaning anything. Here is the version that helps at 03:14.

| Pillar | The question it answers | Shape | Cost model |
|---|---|---|---|
| Metrics | *Is something wrong, and how bad?* | Numbers aggregated over time, low cardinality | Cheap and constant; cost grows with **label combinations**, not traffic |
| Traces | *Where in the system did the time or the error come from?* | One record per request, spanning services | Cost grows with traffic; controlled by sampling |
| Logs | *What exactly happened in this one case?* | One record per event, arbitrarily detailed | Most expensive per unit of insight; controlled by level and sampling |

You move down the table as you narrow. A metric tells you checkout errors are at 12%. A trace tells you 12% of checkout requests spend 30 seconds in the payment client and then fail. A log line tells you the payment client is retrying because it is getting `ECONNRESET` on reused sockets. Each pillar without the others leaves a gap: metrics alone cannot tell you *where*; traces alone cannot tell you *how often*; logs alone cannot be aggregated cheaply enough to alert on.

The connective tissue is **correlation**. A trace id present in the trace, stamped on every log line, and used as an exemplar on the metric is what turns three datasets into one investigation.

## Metrics

### RED and USE

Two mnemonics cover almost everything worth graphing.

**RED** applies to anything that serves requests — your HTTP handlers, your gRPC methods, your queue consumers:

- **R**ate — requests per second.
- **E**rrors — failed requests per second (and as a fraction).
- **D**uration — the latency distribution, as percentiles.

**USE** applies to anything that is a resource — CPU, memory, the connection pool, the libuv threadpool:

- **U**tilization — the fraction of time the resource was busy.
- **S**aturation — the amount of queued work waiting for it.
- **E**rrors — failures of the resource itself.

The pairing matters. RED tells you your users are unhappy; USE tells you which resource is why. A checkout endpoint with rising duration (RED) and a connection pool at 100% utilization with a growing queue (USE) is a solved incident.

### What a Node service should always export

Some of these are universal; the first four are things only the Node runtime can tell you, and they are the ones most services forget.

| Metric | Source | Type | Why |
|---|---|---|---|
| Event loop delay p50/p99/max | `perf_hooks.monitorEventLoopDelay()` | Histogram (ns) | The single best indicator of blocking |
| Event loop utilization | `perf_hooks.eventLoopUtilization()` | Gauge 0–1 | Capacity headroom; drives autoscaling better than CPU |
| Heap used / total / limit | `process.memoryUsage()`, `v8.getHeapStatistics()` | Gauges (bytes) | `used / limit` predicts OOM |
| RSS | `process.memoryUsage.rss()` | Gauge (bytes) | Catches native and buffer growth the heap misses |
| GC pause time and count, by kind | `PerformanceObserver` on `'gc'` | Counter + histogram | GC as a fraction of wall clock |
| Active handles / requests | `process.getActiveResourcesInfo()` | Gauge by type | Leaked sockets, timers, and file handles |
| Request rate / errors / duration | Your HTTP layer | Counters + histogram | RED |
| Pool utilization and queue depth | `agent.sockets` / `agent.requests`, DB driver | Gauges | Saturation, per USE |
| Process uptime and version | `process.uptime()`, `process.version` | Gauge + info label | Correlating incidents with restarts and rollouts |

`process.getActiveResourcesInfo()` returns an array of strings naming the resource types currently keeping the loop alive. Counting them by type gives you a cheap leak detector: a `TCPSocketWrap` count that only goes up is a socket leak, and you will see it days before you see the memory.

### Collecting without hurting the hot path

The instrumentation you add is code that runs on every request. Rules that keep it honest:

**Aggregate in the process, export on a pull.** Do not send one datapoint per request over the network. Keep counters and histograms in memory and let a scrape endpoint or a periodic flush read them. A counter increment is a few nanoseconds; a network write is not.

**Use histograms, not arrays of samples.** `perf_hooks.createHistogram()` gives you a native HDR histogram with `record()`, `percentile()`, `min`, `max`, `mean`, and `stddev` — bounded memory regardless of how many values you record. Never accumulate raw durations in an array and sort them at scrape time; that is an unbounded allocation on the hot path.

**Sample from a timer, not from the request.** Heap statistics, RSS, and active-resource counts are process-wide. Read them once every 10 or 15 seconds on an `unref()`ed interval, not once per request. `process.memoryUsage()` in particular walks pages and can be slow — use `process.memoryUsage.rss()` when RSS is all you want.

**Take timestamps with `performance.now()`.** It is a monotonic high-resolution clock; `Date.now()` moves when NTP adjusts the system clock and will hand you negative durations.

**Be honest about `PerformanceObserver`.** Observing `'gc'` is cheap. Observing `'http'` entries is not — the documentation warns that HTTP entries carry request and response detail, add memory overhead, and should be used for diagnosis rather than left on by default in production.

### Cardinality discipline

This is the mistake that costs money. A metric's cost is the number of distinct label combinations it produces — its **cardinality** — multiplied by retention. One counter with a `user_id` label on a service with a million users is a million time series.

The rule: **labels must come from a small, closed set you control.** Safe: HTTP method, response status class, route *template*, service name, region. Unsafe: user id, request id, trace id, raw URL path, full error message, customer name, any header value.

```js
// ❌ Unbounded: one series per URL ever requested.
requests.inc({ path: req.url });

// ✅ Bounded: one series per route in your router.
requests.inc({ route: '/orders/:id', method: req.method, status_class: '2xx' });
```

Route templates are the important one. `/orders/8f3c…` is unbounded; `/orders/:id` is not. Take the template from your router, and if a request matches no route, label it `unmatched` rather than passing through the raw path.

Identifying detail belongs in traces and logs, which are priced per record and sampled. That is the division of labour between the pillars.

## Tracing

### Context propagation

A trace is a tree of **spans**. Each span has a trace id shared across the whole request, its own span id, the id of its parent, a start time, a duration, and attributes. To build the tree you need to know the current span at every point in the code — including inside a database driver you did not write.

Node's answer is `AsyncLocalStorage`, covered in depth in [Chapter 15](../part2-async/15-async-context.md). It gives you a store that follows the asynchronous execution path, so code five layers down can ask for the current context without anyone threading a parameter:

```mjs
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage();

export function currentContext() {
  return requestContext.getStore();
}
```

Wrap the handler in `requestContext.run(ctx, fn)` once, at the edge, and everything downstream inherits it. The failure mode to know about is context loss across code that breaks the async chain — connection pools that queue callbacks, custom event emitters, `process.nextTick` trampolines in old libraries. `AsyncLocalStorage.snapshot()` and `AsyncLocalStorage.bind(fn)` re-enter a captured context and are the repair tool when that happens.

### Spans and the traceparent header

Propagation *between* services uses the W3C Trace Context standard, which defines a `traceparent` request header:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^^ ^------------ trace-id ------------^ ^-- span-id --^ ^^
             |                                                        |
             version                                            trace-flags
```

Four hyphen-separated fields: version (`00`), a 16-byte trace id as 32 hex characters, an 8-byte parent span id as 16 hex characters, and one byte of flags where the low bit means "sampled". A companion `tracestate` header carries vendor-specific data.

The contract for a service is simple, and worth implementing by hand once so you understand what your library does:

1. On an incoming request, parse `traceparent`. If it is present and well-formed, adopt its trace id and treat its span id as your parent. If it is absent or malformed, start a new trace with a fresh random trace id.
2. Put the trace id, your span id, and the sampled flag in the `AsyncLocalStorage` store.
3. On every outgoing request, emit a `traceparent` built from the current trace id and *your* span id.
4. Record the span — name, start, duration, status, attributes — and export it if sampled.

Sampling deserves a decision rather than a default. **Head-based** sampling decides at the first service and propagates the flag, which keeps traces complete but makes you choose blind. **Tail-based** sampling buffers spans at a collector and keeps traces that were slow or errored, which is what you actually want but requires collector infrastructure. A pragmatic middle ground: sample a small percentage of everything, and always sample requests that error or exceed a latency threshold, by forcing the flag on the way out.

### `diagnostics_channel` and `TracingChannel`

Historically, auto-instrumentation worked by monkey-patching: the tracing library replaced `http.request` and your database driver's `query` with wrappers. That is fragile — it breaks on minor version bumps, it fights with other patchers, and it changes behaviour in ways nobody expects.

`diagnostics_channel` ([Chapter 48](../part7-diagnostics/48-diagnostics-channel-tracing.md)) replaces that with a publish/subscribe mechanism built into the runtime. Publishing is nearly free when nobody is listening — `channel.hasSubscribers` is a boolean check — so instrumentation points can live permanently in library code.

Node core already publishes on several channels. The HTTP ones (**[Experimental]**) are enough to instrument a server without touching a line of your handler:

- `'http.server.request.start'` — `{ request, response, socket, server }`
- `'http.server.response.created'` — `{ request, response }`
- `'http.server.response.finish'` — `{ request, response, socket, server }`
- `'http.client.request.created'`, `'http.client.request.start'`, `'http.client.request.error'`, `'http.client.response.finish'`

`TracingChannel` (Stable as of Node 27) packages the five events a traceable operation needs — `start`, `end`, `asyncStart`, `asyncEnd`, `error` — into one object with a shared context:

```mjs
import diagnostics_channel from 'node:diagnostics_channel';

const dbChannel = diagnostics_channel.tracingChannel('mylib.db.query');

export function query(sql, params) {
  return dbChannel.tracePromise(
    () => driver.execute(sql, params),
    { sql, paramCount: params.length },
  );
}
```

`tracePromise()` publishes `start` and `end` around the synchronous portion and `asyncStart`/`asyncEnd` when the returned promise settles, plus `error` if it throws or rejects. The same context object is passed to every event, so a subscriber can correlate them through a `WeakMap`. `traceSync()` and `traceCallback()` cover the other two shapes. Channel names follow the convention `tracing:module.class.method:start` and so on.

Two behaviours to know. First, events are only published if subscribers were present *before* the trace started — subscribing mid-flight will not give you a partial trace, only future ones. Second, if the function you pass to `tracePromise()` returns something that is not a promise or thenable, it is returned as-is and a warning is emitted (Node 26 and later).

The complementary piece is `channel.bindStore(store[, transform])` **[Experimental]**, which binds an `AsyncLocalStorage` to a channel so that `channel.runStores(context, fn)` sets the store automatically. `tracingChannel.tracePromise()` runs the function through `runStores()` on the `start` channel, which is how a subscriber's context becomes ambient for the whole operation without the instrumented library knowing anything about your storage.

### OpenTelemetry's role

OpenTelemetry is the vendor-neutral standard for all three pillars: an API, an SDK per language, a wire protocol (OTLP), and a collector. Its value is that instrumentation you write once works with whichever backend you buy this year.

In Node, the SDK is doing roughly what this chapter describes, and knowing that demystifies it:

- **Context propagation** is `AsyncLocalStorage`.
- **Propagators** parse and emit `traceparent`/`tracestate`.
- **Auto-instrumentation** subscribes to `diagnostics_channel` where a library publishes, and falls back to module-load hooks plus wrapping where it does not. The direction of travel across the ecosystem is toward channels, precisely to get rid of the patching.
- **Metrics** are aggregated in-process and exported over OTLP on an interval.
- **Resource detection** stamps every signal with service name, version, and deployment environment.

Two practical notes. The SDK must be initialised **before** the modules it instruments are loaded, which in ESM means a `--import` preload rather than a top-level import in your entry file. And its overhead is real but modest — the cost is dominated by span creation and export, so sampling is the lever.

## Logging

[Chapter 51](../part7-diagnostics/51-console-and-logging.md) covers logging as a craft. Three things matter for observability specifically.

**Structured.** One JSON object per line, with stable field names. A log line that must be parsed with a regular expression cannot be queried, aggregated, or alerted on. Keep a small fixed schema — `time`, `level`, `msg`, `service`, plus your correlation ids — and put everything else under a nested object so field names never collide.

**Correlated.** Every line emitted during a request carries the trace id. With `AsyncLocalStorage` this costs nothing at the call site:

```mjs
function log(level, msg, fields = {}) {
  const ctx = requestContext.getStore();
  process.stdout.write(JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    traceId: ctx?.traceId,
    spanId: ctx?.spanId,
    ...fields,
  }) + '\n');
}
```

**Sampled.** Full `info` logging at high request rates is often the largest line in an observability bill and the least useful data in it. Log every error and warning. Sample successful-request logs at the same rate as your traces, using the sampled flag already in the context, so that a trace you kept has logs to go with it.

Two Node-specific hazards. `console.log` to a pipe is asynchronous, to a file is synchronous, and to a TTY is synchronous — which means a logger that writes to stdout can block your event loop when the consumer is slow. And never log request bodies, headers wholesale, or anything containing credentials; redact by allow-list, not by deny-list.

## Crash and incident data

Metrics tell you a process died. They cannot tell you why. Node can capture the evidence at the moment of death, and you have to ask for it in advance.

### Diagnostic reports

A diagnostic report is a JSON document containing the JavaScript and native stacks, heap statistics, resource usage, active libuv handles, environment variables, loaded libraries, and platform information. Turn it on for the failure modes you cannot reproduce:

```bash
node --report-on-fatalerror \
     --report-uncaught-exception \
     --report-on-signal \
     --report-directory=/var/log/reports \
     server.js
```

`--report-on-fatalerror` covers V8 fatal errors, including out-of-memory. `--report-uncaught-exception` covers uncaught JavaScript exceptions. `--report-on-signal` lets you demand one from a running, apparently-hung process — the default signal is `SIGUSR2`, changeable with `--report-signal=signal`, and signal-triggered reports are not supported on Windows. `--report-compact` emits single-line JSON, which is what you want if reports are going into a log pipeline. `--report-exclude-env` and `--report-exclude-network` drop the environment block and the network interface list, and both are worth setting if reports leave your infrastructure, because environment variables routinely contain secrets.

Everything is also reachable at runtime through `process.report`: the properties `reportOnFatalError`, `reportOnUncaughtException`, `reportOnSignal`, `signal`, `filename`, `directory`, `compact`, `excludeEnv`, and `excludeNetwork`, plus `process.report.getReport([err])` which returns the report as a JavaScript object and `process.report.writeReport([filename][, err])` which writes it to disk. `getReport()` is the useful one for incident tooling: capture the object in your fatal-error handler and ship it to the same place your logs go.

### Heap snapshots on OOM

`--heapsnapshot-near-heap-limit=max_count` writes up to `max_count` V8 heap snapshots as the heap approaches its limit — the only reliable way to see what was retained at the moment memory ran out. It is stable, and `v8.setHeapSnapshotNearHeapLimit(limit)` sets the same thing at runtime (it is a no-op if the flag was already given or the function has already been called).

Keep the count at 2 or 3. Snapshotting a large heap takes time and memory, and Node adjusts the heap to accommodate the overhead — but if the process uses more memory than the system will tolerate, the kernel may kill it before the snapshot is written. On demand, `v8.writeHeapSnapshot([filename[, options]])` produces one from a healthy process; the default name follows the pattern `Heap-${yyyymmdd}-${hhmmss}-${pid}-${thread_id}.heapsnapshot`.

### Core dumps

For native crashes — a segfault in an addon, a bug in a dependency's C++ — a core dump is what you need. It requires `ulimit -c unlimited`, a writable `kernel.core_pattern` location, and enough disk to hold a copy of the process's memory. In containers this needs deliberate configuration on the host. Treat core dumps as the tool of last resort: they are large, they contain every secret in memory, and reading them needs matching Node binaries and debug symbols.

### What to attach to an alert

An alert that says only "error rate high" costs the responder ten minutes of context-gathering. Attach, in the notification itself:

- The exact query or dashboard link, pre-filtered to the affected service and time window.
- Two or three example trace ids from failing requests.
- The current values of the Node health metrics: loop delay p99, ELU, heap used over limit, RSS.
- Recent deployment and configuration-change events for the service.
- A link to the runbook for this specific alert.

If you cannot write the runbook, the alert is not ready to page anyone.

## Health endpoints that tell the truth

Most health endpoints are `res.end('ok')`, which proves only that the process can accept a connection and run one callback. That is not nothing, but it is close.

Distinguish two endpoints with different jobs:

- **Liveness** — "should this process be killed and restarted?" Answer `no` unless the process is genuinely unrecoverable. A liveness check that fails on a slow dependency causes a restart storm that turns a partial outage into a total one. Keep it local and cheap.
- **Readiness** — "should this instance receive traffic right now?" Answer `no` while starting up, while draining for shutdown, and when a hard dependency is unusable. This is where dependency checks belong.

```mjs
import { performance } from 'node:perf_hooks';

let draining = false;
process.on('SIGTERM', () => { draining = true; });

export function readiness(deps) {
  if (draining) return { ok: false, reason: 'draining' };
  const loopP99Ms = deps.loopDelay.percentile(99) / 1e6;
  if (loopP99Ms > 1000) return { ok: false, reason: 'event_loop_blocked' };
  if (!deps.db.connected) return { ok: false, reason: 'db_unavailable' };
  return { ok: true, uptime: process.uptime(), now: performance.now() };
}
```

Three rules. **Never make a health check call your downstream dependencies' health checks** — one slow database then marks every service in the graph unhealthy simultaneously. Check your own connection pool, not their liveness. **Cache the result for a second or two**, because load balancers poll aggressively and an expensive check becomes its own load problem. **Set `draining = true` on `SIGTERM` before you stop accepting connections**, so the balancer removes you from rotation while in-flight requests finish ([Chapter 26](../part4-system/26-signals-and-shutdown.md)).

## Alerting on symptoms, and SLOs

Alert on what users experience. Do not alert on causes.

- ❌ "CPU above 80% for 5 minutes." Sometimes fine, sometimes not, and it pages you at 03:00 for a batch job.
- ❌ "Heap used above 1.2 GB." A perfectly healthy service with a big cache looks like this.
- ✅ "Checkout p99 latency above 800 ms for 10 minutes."
- ✅ "Checkout error rate above 1% for 5 minutes."

Cause metrics belong on dashboards and in the alert payload, where they speed up diagnosis. They do not belong on pagers, because their relationship to user pain is indirect and their thresholds are guesses.

**SLO thinking** makes this rigorous. Pick a Service Level Indicator — a ratio of good events to total events, such as "requests served in under 500 ms without a 5xx". Set a Service Level Objective, such as 99.5% over 30 days. The remaining 0.5% is your **error budget**: about 3.6 hours of failure per month. Two consequences follow, and both are the point:

1. **Alert on budget burn rate, not on instantaneous thresholds.** Burning 5% of the monthly budget in an hour is a page. Burning 5% over a week is a ticket. This one change eliminates most alert fatigue, because it distinguishes "bad now" from "bad forever".
2. **The budget is a decision-making tool.** Budget left means you can ship. Budget exhausted means you stop shipping features and fix reliability. That is a conversation with a number in it rather than an argument about feelings.

Set the SLO from what users need, not from what you currently achieve. And keep it to a handful per service — an SLO on every endpoint is a spreadsheet, not a strategy.

## A worked observability module

Here is a compact module that wires up the Node-specific pieces: runtime metrics, request context and tracing, correlated structured logs, and a report-on-fatal-error hook. It has no dependencies and is meant to be adapted rather than copied wholesale.

```mjs
// observability.mjs
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import {
  createHistogram,
  eventLoopUtilization,
  monitorEventLoopDelay,
  performance,
  PerformanceObserver,
  constants,
} from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import process from 'node:process';

export const requestContext = new AsyncLocalStorage();

// ---- runtime metrics -------------------------------------------------

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

const requestDuration = createHistogram();
const counters = { requests: 0, errors: 0, gcCount: 0, gcNanos: 0 };

const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    counters.gcCount += 1;
    counters.gcNanos += entry.duration * 1e6;
    if (entry.detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR) {
      counters.majorGc = (counters.majorGc ?? 0) + 1;
    }
  }
});
gcObserver.observe({ entryTypes: ['gc'] });

let lastElu = eventLoopUtilization();

export function snapshotMetrics() {
  const now = eventLoopUtilization();
  const { utilization } = eventLoopUtilization(now, lastElu);
  lastElu = now;

  const mem = process.memoryUsage();
  const heap = getHeapStatistics();
  const resources = {};
  for (const kind of process.getActiveResourcesInfo()) {
    resources[kind] = (resources[kind] ?? 0) + 1;
  }

  const metrics = {
    loop_delay_p50_ms: loopDelay.percentile(50) / 1e6,
    loop_delay_p99_ms: loopDelay.percentile(99) / 1e6,
    loop_delay_max_ms: loopDelay.max / 1e6,
    loop_utilization: utilization,
    heap_used_bytes: mem.heapUsed,
    heap_total_bytes: mem.heapTotal,
    heap_limit_bytes: heap.heap_size_limit,
    heap_used_ratio: mem.heapUsed / heap.heap_size_limit,
    external_bytes: mem.external,
    array_buffers_bytes: mem.arrayBuffers,
    rss_bytes: mem.rss,
    gc_count: counters.gcCount,
    gc_total_ms: counters.gcNanos / 1e6,
    requests_total: counters.requests,
    errors_total: counters.errors,
    request_p99_ms: requestDuration.count > 0 ? requestDuration.percentile(99) : 0,
    active_resources: resources,
    uptime_seconds: process.uptime(),
  };

  loopDelay.reset();
  return metrics;
}

// ---- logging ---------------------------------------------------------

export function log(level, msg, fields = {}) {
  const ctx = requestContext.getStore();
  const line = {
    time: new Date().toISOString(),
    level,
    msg,
    service: process.env.SERVICE_NAME ?? 'unknown',
    traceId: ctx?.traceId,
    spanId: ctx?.spanId,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

// ---- trace context ---------------------------------------------------

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

function parseTraceparent(header) {
  if (typeof header !== 'string') return null;
  const match = TRACEPARENT.exec(header.trim());
  if (!match) return null;
  return {
    traceId: match[1],
    parentSpanId: match[2],
    sampled: (parseInt(match[3], 16) & 0x01) === 1,
  };
}

function newId(bytes) {
  return randomBytes(bytes).toString('hex');
}

export function traceparentHeader() {
  const ctx = requestContext.getStore();
  if (!ctx) return undefined;
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? '01' : '00'}`;
}

// ---- request instrumentation ----------------------------------------

export function instrument(handler, { sampleRate = 0.05 } = {}) {
  return function onRequest(req, res) {
    const parent = parseTraceparent(req.headers.traceparent);
    const ctx = {
      traceId: parent?.traceId ?? newId(16),
      parentSpanId: parent?.parentSpanId,
      spanId: newId(8),
      sampled: parent?.sampled ?? Math.random() < sampleRate,
      startedAt: performance.now(),
    };

    counters.requests += 1;

    requestContext.run(ctx, () => {
      res.on('finish', () => {
        const durationMs = performance.now() - ctx.startedAt;
        requestDuration.record(Math.max(1, Math.round(durationMs)));
        if (res.statusCode >= 500) {
          counters.errors += 1;
          ctx.sampled = true;            // always keep failures
        }
        if (ctx.sampled) {
          log('info', 'request', {
            method: req.method,
            status: res.statusCode,
            durationMs: Number(durationMs.toFixed(2)),
            parentSpanId: ctx.parentSpanId,
          });
        }
      });

      handler(req, res);
    });
  };
}

// ---- crash evidence --------------------------------------------------

export function installCrashHandlers() {
  process.report.reportOnFatalError = true;
  process.report.reportOnUncaughtException = true;
  process.report.excludeEnv = true;
  process.report.directory = process.env.REPORT_DIR ?? process.cwd();

  process.on('uncaughtException', (err) => {
    log('fatal', 'uncaughtException', {
      err: { name: err.name, message: err.message, stack: err.stack },
      report: process.report.getReport(err),
    });
    process.exitCode = 1;
    process.nextTick(() => process.exit());
  });

  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandledRejection', { reason: String(reason) });
  });
}
```

Using it takes four lines:

```mjs
import { createServer } from 'node:http';
import {
  instrument, installCrashHandlers, snapshotMetrics, log,
} from './observability.mjs';

installCrashHandlers();

const server = createServer(instrument((req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(snapshotMetrics()));
  }
  log('info', 'handling', { url: req.url });
  res.end('ok\n');
}));

server.listen(3000);
```

Note `process.report.getReport(err)` inside the `uncaughtException` handler: setting `reportOnUncaughtException` writes a file, but capturing the object lets you ship the same data through the log pipeline you already have, which is usually the only place your on-call engineer will look. Also note that `excludeEnv` is on — reports contain the full environment by default, and that means your secrets.

Adapt rather than adopt: in a real service, replace the counters with your metrics client, replace `log()` with a proper logger, and let OpenTelemetry own span export while you keep the `AsyncLocalStorage` context.

## Common mistakes

### ❌ Putting unbounded values in metric labels

```js
// ❌ One time series per URL, per user, forever.
httpRequests.inc({ path: req.url, user: req.user.id });
```

Cardinality explosions do not fail loudly. They fill your metrics backend, slow every query on the system, and produce a bill. By the time anyone notices, the data is a month deep.

```js
// ✅ Bounded labels; identity lives in traces and logs.
httpRequests.inc({ route: req.route ?? 'unmatched', method: req.method, status: res.statusCode });
```

### ❌ A health check that calls the database

```mjs
// ❌ A slow query marks a perfectly serving instance unhealthy — and every replica at once.
app.get('/healthz', async (req, res) => {
  await db.query('SELECT 1');
  res.end('ok');
});
```

Under load, this is a self-inflicted outage: the database gets slow, every instance fails liveness, the orchestrator restarts all of them, the restarts hammer the database. Separate liveness from readiness and check your own state.

```mjs
// ✅ Liveness is local; readiness reflects the pool you own.
app.get('/livez', (req, res) => res.end('ok'));
app.get('/readyz', (req, res) => {
  const ready = !draining && db.pool.available > 0;
  res.statusCode = ready ? 200 : 503;
  res.end(ready ? 'ready' : 'not-ready');
});
```

### ❌ Logging at `info` for every request at full volume

Thirty thousand requests per second times one 400-byte JSON line is 12 MB/s of logs, per instance. You will pay for it, your log backend will rate-limit you, and the one line you needed will have been dropped.

```mjs
// ✅ Always log failures; sample successes using the trace decision.
if (res.statusCode >= 400 || ctx.sampled) log('info', 'request', fields);
```

### ❌ Alerting on a cause instead of a symptom

```yaml
# ❌ Pages at 03:00 because a cache warmed up.
- alert: HighMemory
  expr: nodejs_heap_used_bytes > 1.2e9
```

Nobody can act on this, so it gets acknowledged and ignored, and then the alert that matters gets ignored too.

```yaml
# ✅ A user-visible symptom, over a window, with a burn rate.
- alert: CheckoutLatencySLOBurn
  expr: slo_burn_rate{service="checkout",window="1h"} > 14.4
  for: 5m
```

## Production notes

- **Instrument the runtime before you instrument your code.** Event loop delay, ELU, heap ratio, and GC fraction are four numbers that explain the majority of Node incidents, and they take under fifty lines to export. Business metrics can come later.
- **Ship the correlation id everywhere or the whole system is three disconnected datasets.** Trace id in the log line, trace id in the error response body (so support tickets carry it), trace id as an exemplar on the latency histogram.
- **Budget observability like production traffic.** Metrics scrape endpoints, log serialization, and span export all run inside your process. Measure their cost — snapshot the ELU with instrumentation on and off — and treat a regression there as seriously as one in a handler.
- **Reports and heap snapshots need somewhere to go.** In a container with an ephemeral filesystem, a report written on fatal error dies with the pod. Mount a volume, or capture `getReport()` and log it, or you have configured evidence collection that produces no evidence.
- **`--report-exclude-env` is not optional if reports leave your infrastructure.** Diagnostic reports include the full environment block. So do core dumps, and they include far more.
- **Worker threads have their own event loops.** Main-thread metrics say nothing about a saturated worker pool. Collect per-thread and label by `threadId`, or you will chase a phantom.
- **Cluster changes the shape of everything.** With N workers behind a primary, per-process metrics need a worker label and per-process health endpoints need aggregation. Decide whether your scrape target is the primary or each worker before you build the dashboard.
- **Test the alert, not just the metric.** Once per quarter, break something on purpose in a staging environment and confirm the alert fires, the runbook link works, and the attached data is enough. Untested alerting is a plan, not a capability.

## Exercises

1. **Export the runtime four.** Build an endpoint returning loop delay p50/p99, ELU, heap-used-over-limit, and GC time as a fraction of wall clock. *Success:* under a handler that blocks for 400 ms, loop delay p99 and ELU both rise and recover; under an allocation-heavy handler, the GC fraction rises while loop delay stays low.

2. **Propagate a trace by hand.** Write two services where A calls B. Implement `traceparent` parsing and emission yourself, without a library. *Success:* a log line from B carries the same trace id as the originating request to A, a fresh trace id is generated when the header is absent or malformed, and the sampled flag survives the hop.

3. **Instrument without patching.** Subscribe to `'http.server.request.start'` and `'http.server.response.finish'` and produce a per-request duration metric, with no changes to the handler. *Success:* durations match a `performance.mark`-based measurement inside the handler to within a millisecond, and removing your subscriber removes all overhead.

4. **Prove the crash path.** Configure `--report-on-fatalerror` and `--heapsnapshot-near-heap-limit=2`, then run the process under a low `--max-old-space-size` with a deliberate leak. *Success:* you have a report and at least one snapshot on disk after the OOM, and you can name the retaining object from the snapshot.

5. **Wire a burn-rate alert.** Define an SLI and a 99.5%/30-day SLO for one endpoint, compute the burn rate over 1-hour and 6-hour windows, and alert on the fast window. *Success:* injecting a 5-minute failure at 100% error rate fires the fast alert and not the slow one, and you can state how much of the monthly budget it consumed.

## Recap

- Metrics answer *is something wrong*, traces answer *where*, logs answer *what exactly* — and a shared trace id is what makes them one dataset instead of three.
- RED (rate, errors, duration) covers request-serving; USE (utilization, saturation, errors) covers resources. Use both.
- A Node service should always export event loop delay percentiles, ELU, heap used/total/limit, RSS, GC pause time, active resource counts, and pool saturation. Aggregate in-process with `createHistogram()`, sample process-wide values on an interval, and time with `performance.now()`.
- Cardinality is the cost driver: labels must come from small closed sets. Route templates, not URLs; identity in traces, not metrics.
- `AsyncLocalStorage` carries request context; the W3C `traceparent` header carries it between services; `diagnostics_channel` and `TracingChannel` let libraries publish trace points without monkey-patching, and OpenTelemetry assembles all three.
- `TracingChannel` publishes `start`, `end`, `asyncStart`, `asyncEnd`, and `error` with a shared context, and only when subscribers were present before the trace began.
- Configure crash evidence in advance: `--report-on-fatalerror`, `--report-uncaught-exception`, `--heapsnapshot-near-heap-limit`, and `process.report.getReport(err)` in your fatal handler. Exclude the environment block.
- Liveness and readiness are different questions; never let a health check depend on a downstream service's health.
- Alert on user-visible symptoms and error-budget burn rate. Put the cause metrics in the alert payload, not on the pager.

## Where to go next

- [Chapter 15 — AsyncLocalStorage and Context Propagation](../part2-async/15-async-context.md) — the mechanism every tracer is built on.
- [Chapter 48 — Diagnostics Channel and Trace Events](../part7-diagnostics/48-diagnostics-channel-tracing.md) — channels, `TracingChannel`, and the built-in publication points.
- [Chapter 49 — Measuring Performance with `perf_hooks`](../part7-diagnostics/49-perf-hooks.md) — histograms, observers, and entry types in detail.
- [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md) — reading the artefacts this chapter tells you to collect.
- [Chapter 51 — Console, `util.inspect`, and Logging Strategy](../part7-diagnostics/51-console-and-logging.md) — structured logging done properly.
- [Chapter 61 — Performance Tuning](61-performance-tuning.md) — what to do once the metrics point somewhere.
- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](../part4-system/26-signals-and-shutdown.md) — draining, which readiness must reflect.
- Official documentation: <https://nodejs.org/docs/latest/api/diagnostics_channel.html> and <https://nodejs.org/docs/latest/api/report.html>
