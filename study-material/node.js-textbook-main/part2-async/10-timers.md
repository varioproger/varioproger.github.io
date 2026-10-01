---
chapter: 10
part: "Part II — Asynchrony"
title: "Timers and Scheduling"
level: intermediate
reading_time: "28 min"
prerequisites: [9]
source_docs:
  - "doc/api/timers.md"
  - "doc/api/globals.md"
source_url: "https://nodejs.org/docs/latest/api/timers.html"
node_baseline: "27.0.0-pre"
---

# Chapter 10 — Timers and Scheduling

**What you will learn**

- Use `setTimeout`, `setInterval`, `setImmediate` and their `clear*` counterparts correctly, including the argument-passing form.
- Work with the `Timeout` and `Immediate` objects: `ref`, `unref`, `hasRef`, `refresh`, `Symbol.toPrimitive`, `Symbol.dispose`.
- Explain why every Node timer is a *minimum* delay, and what makes the actual delay longer.
- Replace callback timers with the promise API in `node:timers/promises`, including the `setInterval` async iterator.
- Cancel a pending timer with an `AbortSignal` instead of bookkeeping handles.
- Build a self-correcting interval that does not drift over hours or days.

**Why this matters**

Timers look like the simplest API in Node. They are not. A cache that refreshes "every 60 seconds" will, on a busy server, refresh every 61–75 seconds and slide steadily out of phase with the hour boundary you were aligning to. A `setInterval` that calls an async function will happily start a second run before the first has finished, and by hour three you have forty overlapping database queries. A polling loop that never cancels its timer will keep a Lambda-style process alive past the point where anyone wants it.

Timers are also the main way you *bound* things: request deadlines, retry backoff, health checks, graceful-shutdown windows. Getting them right is the difference between a service that degrades predictably and one that falls over. This chapter covers the whole surface and, more importantly, the patterns that hold up in production.

## The three primitives

Timers are globals. You never need to import `node:timers` to call them, though the module exists and can be imported explicitly when you want to be unambiguous (or when a test framework has replaced the globals).

```mjs
// Both work; the explicit import is clearer in library code.
import { setTimeout, setInterval, setImmediate } from 'node:timers';
```

| Function | Fires | Returns | Cancel with |
|---|---|---|---|
| `setTimeout(callback[, delay[, ...args]])` | Once, after at least `delay` ms, in the **timers** phase | `Timeout` | `clearTimeout()` |
| `setInterval(callback[, delay[, ...args]])` | Repeatedly, roughly every `delay` ms, in the **timers** phase | `Timeout` | `clearInterval()` |
| `setImmediate(callback[, ...args])` | Once, in the **check** phase of the current or next loop iteration | `Immediate` | `clearImmediate()` |

The `delay` for `setTimeout` and `setInterval` defaults to `1`. Anything you pass is normalised:

- Non-integer delays are truncated to an integer. `setTimeout(fn, 2.9)` is `setTimeout(fn, 2)`.
- A delay greater than `2147483647` (2³¹−1, the 32-bit signed maximum), less than `1`, or `NaN` is **set to `1`**.

That last rule catches people twice. `setTimeout(fn, 0)` is really `setTimeout(fn, 1)`. And a "wake me in 30 days" timer — `setTimeout(fn, 30 * 24 * 60 * 60 * 1000)`, which is about 2.6 billion — overflows and fires *one millisecond from now*. If you need long horizons, chain shorter timers or compute the remaining delay from a stored absolute timestamp on each hop.

The trailing `...args` are passed to the callback. Prefer them over a closure when the values are simple: it avoids capturing an entire scope for the lifetime of the timer.

```js
setTimeout((userId, reason) => {
  console.log(`Evicting ${userId}: ${reason}`);
}, 5000, 'u-4417', 'idle');
```

Passing something that is not a function throws a `TypeError`. Since v18.0.0 the specific error code is `ERR_INVALID_ARG_TYPE`.

`setImmediate` is different in kind, not just in duration. It has no delay at all: it queues the callback for the **check** phase. When several immediates are queued, they run in creation order, and the *entire* queue is processed each loop iteration — but an immediate scheduled from inside a running immediate callback is deferred to the next iteration, which is what keeps `setImmediate` from starving the loop the way recursive microtasks do. This makes it the correct primitive for "yield to the loop, then continue". [Chapter 9 — The Event Loop](09-event-loop.md) covers the phase mechanics.

## The `Timeout` object

`setTimeout` and `setInterval` both return a `Timeout`. It is not a number — Node deliberately diverges from the browser here — and it carries useful behaviour.

| Member | Added | What it does |
|---|---|---|
| `timeout.ref()` | v0.9.1 | Require the event loop to stay alive while this timer is active. Returns the `Timeout` |
| `timeout.unref()` | v0.9.1 | Stop requiring it. The process may exit with the callback never having run. Returns the `Timeout` |
| `timeout.hasRef()` | v11.0.0 | `true` if the timer is currently keeping the loop alive |
| `timeout.refresh()` | v10.2.0 | Reset the start time to now and reschedule for the original duration, reusing the same object |
| `timeout.close()` | v0.9.1 | **[Legacy]** — cancels the timeout. Use `clearTimeout()` instead |
| `timeout[Symbol.toPrimitive]()` | v14.9.0 / v12.19.0 | Coerce to an integer id usable with `clearTimeout()`/`clearInterval()` |
| `timeout[Symbol.dispose]()` | v20.5.0 / v18.18.0 | Cancels the timeout. No longer experimental as of v24.2.0 |

### `refresh()` — the one you are not using but should be

Idle timeouts are the classic case: a socket should be torn down if nothing arrives for 30 seconds, and every incoming byte resets the clock. The naive version allocates a new `Timeout` per byte:

```js
// ❌ Allocates a fresh timer object on every chunk.
let idle = setTimeout(closeSocket, 30_000);
socket.on('data', () => {
  clearTimeout(idle);
  idle = setTimeout(closeSocket, 30_000);
});
```

`refresh()` does the same job with one allocation for the socket's whole lifetime:

```js
// ✅ One Timeout object, rescheduled in place.
const idle = setTimeout(closeSocket, 30_000);
socket.on('data', () => idle.refresh());
```

On a server holding tens of thousands of connections, that difference is visible in the heap profile. `refresh()` also *reactivates* a timer that has already fired, which makes it a neat building block for "run again in 30s, unless something cancels it".

### `Symbol.toPrimitive` and cross-thread ids

Browsers return an integer from `setTimeout`. Node returns an object. Code written for the browser that stores the return value in a numeric field, or posts it to another thread, breaks. `Symbol.toPrimitive` bridges the gap:

```js
const t = setTimeout(() => console.log('tick'), 1000);
const id = +t;              // an integer
clearTimeout(id);           // works
```

`clearTimeout()` and `clearInterval()` both accept a `Timeout`, or that primitive as a string or a number. The primitive is only valid **in the thread that created the timer** — to cancel a timer from a worker you must send the primitive to the owning thread and clear it there. See [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md).

### `Symbol.dispose` and `using`

Both `Timeout` and `Immediate` implement `Symbol.dispose`, so explicit resource management cleans them up at scope exit:

```js
function withDeadline(work) {
  using bomb = setTimeout(() => { throw new Error('deadline exceeded'); }, 5000);
  return work();
  // `bomb` is cleared automatically when this function returns or throws.
}
```

`Immediate` exposes the same `ref()`, `unref()`, `hasRef()` and `Symbol.dispose()` members, minus `refresh()` and `Symbol.toPrimitive`.

## "At least", never "exactly"

The docs are blunt about this: the callback will likely not be invoked in precisely `delay` milliseconds, and Node makes no guarantees about exact timing or ordering. `delay` is a *floor*.

Four things stretch it:

1. **Clamping.** A delay under 1 ms becomes 1 ms.
2. **Phase position.** A timer can only fire when the loop reaches the timers phase. If the loop is in poll running I/O callbacks when your timer expires, it waits.
3. **Blocking.** If any callback runs for 200 ms of synchronous work, every timer that expires during it is late by up to 200 ms.
4. **OS scheduling.** Your process may simply not be on a CPU at the moment the timer expires.

Measure it and the effect is obvious:

```mjs
const start = process.hrtime.bigint();
setTimeout(() => {
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`asked for 100ms, waited ${ms.toFixed(2)}ms`);
}, 100);

// Block the loop for 250ms right after scheduling.
const spin = Date.now();
while (Date.now() - spin < 250);
// Prints something like: asked for 100ms, waited 250.31ms
```

The rule that follows: **never build correctness on timer precision.** For deadlines, compare timestamps inside the callback rather than trusting that it fired on time. For scheduled work aligned to wall-clock boundaries, recompute the delay each cycle from `Date.now()`.

## Drift and the self-correcting interval

`setInterval(fn, 1000)` does not fire 3,600 times per hour. Each cycle carries the lateness described above, and the errors accumulate — an interval that is 4 ms late on average is 14 seconds behind after an hour. That matters for anything aligned to real time: cron-like jobs, rate-limit window resets, chart buckets.

The fix is to stop asking for a fixed delay and start asking for "however long is left until the next target time":

```mjs
/**
 * Runs `task` on a fixed wall-clock cadence, correcting for drift.
 * Overlapping runs are impossible: the next tick is scheduled only
 * after the previous one settles.
 */
export function everyExactly(periodMs, task, { signal } = {}) {
  const start = Date.now();
  let n = 0;
  let timer;

  const schedule = () => {
    n += 1;
    const target = start + n * periodMs;
    const delay = Math.max(1, target - Date.now());
    timer = setTimeout(run, delay);
  };

  const run = async () => {
    if (signal?.aborted) return;
    try {
      await task(n);
    } catch (err) {
      queueMicrotask(() => { throw err; });
    }
    if (!signal?.aborted) schedule();
  };

  schedule();
  signal?.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return () => clearTimeout(timer);
}
```

Three properties are worth naming, because they are what make this better than `setInterval`:

- **No drift.** Each target is computed from the original start, so a late tick is followed by a shorter delay, not an equally late successor.
- **No overlap.** `setInterval` fires on schedule whether or not the previous run finished. This version only schedules the next tick after the current one settles — which is what you want for anything doing I/O.
- **No unhandled rejection.** Errors from `task` are rethrown as uncaught exceptions rather than silently vanishing. See [Chapter 11 — Callbacks, Promises, async/await, and `util.promisify`](11-promises-and-async.md).

If a tick takes longer than `periodMs`, this design skips ahead by one period at a time rather than running a burst of catch-up ticks. Whether that is correct depends on your workload; if you need catch-up, advance `n` in a loop until `target` is in the future.

## `node:timers/promises`

Since v15.0.0, and stable since v16.0.0, Node ships promise-returning timers. Use them in `async` code — they read better and they compose with `await`.

```mjs
import { setTimeout, setImmediate, setInterval } from 'node:timers/promises';
```

Note that these deliberately shadow the globals with a *different signature*. The delay comes first and there is no callback.

### `setTimeout([delay[, value[, options]]])`

```mjs
import { setTimeout as sleep } from 'node:timers/promises';

console.log('working');
await sleep(250);
console.log('250ms later');

const answer = await sleep(10, 42);   // resolves with 42
```

`options` accepts:

| Option | Type | Default | Meaning |
|---|---|---|---|
| `ref` | boolean | `true` | Set to `false` so the underlying `Timeout` does not keep the loop alive |
| `signal` | `AbortSignal` | — | Cancel the timer; the promise rejects with an `AbortError` |

### `setImmediate([value[, options]])`

Same `ref` and `signal` options. This is the awaitable yield-to-the-loop primitive from Chapter 9:

```mjs
import { setImmediate as yieldToLoop } from 'node:timers/promises';

for (const [i, item] of items.entries()) {
  process(item);
  if (i % 500 === 499) await yieldToLoop();
}
```

### `setInterval([delay[, value[, options]]])`

Added in v15.9.0, this one is not a promise — it returns an **async iterator** that yields every `delay` ms. It is the cleanest way to write a polling loop, because `for await` naturally prevents overlapping iterations: the next interval is only awaited once the body finishes.

```mjs
import { setInterval } from 'node:timers/promises';

const ac = new AbortController();
setTimeout(() => ac.abort(), 30_000).unref();

try {
  for await (const _ of setInterval(5_000, null, { signal: ac.signal })) {
    const health = await checkUpstream();
    if (!health.ok) console.warn('upstream degraded', health);
  }
} catch (err) {
  if (err.name !== 'AbortError') throw err;
}
console.log('polling stopped');
```

Two things to know. First, if `ref` is `true` (the default) you must actually call `next()` — explicitly, or implicitly via `for await` — to keep the loop alive. Second, this iterator does not correct for drift: it schedules the next interval relative to when you ask for it, so a slow body pushes the whole schedule back. When wall-clock alignment matters, use the self-correcting pattern above.

### `scheduler.wait()` and `scheduler.yield()`

**[Experimental]** — both are part of the WICG Scheduling APIs draft that Node tracks, available since v17.3.0 / v16.14.0.

```mjs
import { scheduler } from 'node:timers/promises';

await scheduler.wait(1000);   // === setTimeout(1000, undefined, options)
await scheduler.yield();      // === setImmediate() with no arguments
```

`scheduler.wait(delay[, options])` takes the same `ref` and `signal` options. `scheduler.yield()` takes none. Neither adds capability over the functions they wrap; their value is that the names say what you mean. Because they are experimental, keep them behind a thin wrapper in production code so a signature change is a one-line fix.

## Cancellation with `AbortSignal`

Manually tracking timer handles is bookkeeping you can delete. Every promise timer accepts a `signal`, and one controller can cancel a whole tree of pending work.

```mjs
import { setTimeout as sleep } from 'node:timers/promises';

async function retryWithBackoff(fn, { attempts = 5, signal } = {}) {
  for (let i = 0; i < attempts; i++) {
    signal?.throwIfAborted();
    try {
      return await fn({ signal });
    } catch (err) {
      if (err.name === 'AbortError' || i === attempts - 1) throw err;
      const backoff = Math.min(2 ** i * 100, 5_000);
      const jitter = Math.random() * backoff * 0.3;
      // Aborting the signal rejects this sleep immediately —
      // no waiting out the backoff just to discover we were cancelled.
      await sleep(backoff + jitter, undefined, { signal });
    }
  }
}

// Give the whole retry sequence 10 seconds, total.
await retryWithBackoff(fetchConfig, { signal: AbortSignal.timeout(10_000) });
```

`AbortSignal.timeout(delay)` (v17.3.0 / v16.14.0) returns a signal that aborts itself after `delay` ms — a deadline without a timer variable. `AbortSignal.any(signals)` (v20.3.0 / v18.17.0) combines several, so a per-request deadline and a global shutdown signal can both cancel the same operation. `signal.throwIfAborted()` throws `signal.reason` if already aborted, which is the cheapest possible early-exit check. [Chapter 13 — AbortController, Signals, and Cancellation](13-abort-and-cancellation.md) goes deeper.

When a promise timer is cancelled, the returned promise rejects with an error whose `name` is `'AbortError'`. Check `err.name`, not `instanceof`.

## Unref'd timers and process exit

A referenced timer keeps the process alive. That is usually what you want for a scheduled job and never what you want for a heartbeat.

```mjs
// Metrics flush: useful while the process runs, must not delay exit.
setInterval(flushMetrics, 30_000).unref();

// A watchdog on a CLI: if the work hangs, die loudly — but if it
// finishes first, don't hold the process open for the remaining time.
const watchdog = setTimeout(() => {
  console.error('operation timed out');
  process.exitCode = 1;
}, 30_000);
watchdog.unref();
```

The promise API expresses the same thing with `{ ref: false }`:

```mjs
import { setTimeout as sleep } from 'node:timers/promises';
await sleep(60_000, undefined, { ref: false });
```

Be careful: an unref'd timer whose callback *matters* is a silent bug. If the process exits first, the callback simply never runs and nothing is logged. Unref timers that observe; keep timers that act.

`process.getActiveResourcesInfo()` lists `'Timeout'` entries for referenced timers, which is the fastest way to find out why a script will not exit.

## Common mistakes

### ❌ `setInterval` with an async callback

```js
// ❌ If syncUsers() takes 90 seconds, you get overlapping runs forever.
setInterval(async () => {
  await syncUsers();
}, 60_000);
```

`setInterval` does not know or care that your callback returned a pending promise. Under load, runs pile up until the database gives out. Rejections are also unobserved, because nothing awaits the returned promise.

```mjs
// ✅ Chain the next run after the previous one settles.
import { setTimeout as sleep } from 'node:timers/promises';

async function syncLoop(signal) {
  while (!signal.aborted) {
    try {
      await syncUsers();
    } catch (err) {
      logger.error({ err }, 'sync failed');
    }
    await sleep(60_000, undefined, { signal });
  }
}
```

### ❌ Assuming `setInterval` keeps wall-clock time

```js
// ❌ After 24 hours this is minutes away from midnight.
setInterval(rollLogFile, 24 * 60 * 60 * 1000);
```

Also note that `24 * 60 * 60 * 1000` is 86,400,000 — comfortably under the 2³¹−1 ceiling — but `30 * 24 * 60 * 60 * 1000` is not, and would fire immediately. Recompute against an absolute target instead:

```js
// ✅ Compute the delay to the next boundary, every time.
function scheduleAtNextMidnight(task) {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  setTimeout(() => { task(); scheduleAtNextMidnight(task); },
             Math.max(1, next.getTime() - Date.now()));
}
```

### ❌ Forgetting to clear a timer on the success path

```js
// ❌ The process hangs for 30s after a fast, successful response.
const timer = setTimeout(() => controller.abort(), 30_000);
const res = await fetch(url, { signal: controller.signal });
return res.json();
```

```mjs
// ✅ Either clear it in a finally, or don't create a handle at all.
const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
return res.json();
```

### ❌ Storing the return value as a number

```js
// ❌ Written for the browser; `timers.push(id)` now holds an object,
// and a strict numeric type check or a postMessage() will fail.
const id = setTimeout(fn, 100);
```

```js
// ✅ Keep the object (preferred), or take the primitive explicitly.
const t = setTimeout(fn, 100);
const numericId = +t;   // valid only in this thread
```

## Production notes

- **Every network and child-process operation needs a timeout.** A socket that never responds and never closes will hold a request handler open indefinitely. `AbortSignal.timeout()` composed with `AbortSignal.any()` gives you per-call and global deadlines without manual handle tracking.
- **Add jitter to anything periodic.** A thousand instances that all poll on a 60-second interval, all restarted by the same deploy, will hit your backend in a synchronised thundering herd. Randomising 10–20% of the period spreads the load.
- **Reuse timers instead of reallocating them.** On a server holding many connections, `refresh()` on one long-lived `Timeout` per connection avoids churning through a `Timeout` object per incoming chunk. The allocation is small, but at tens of thousands of connections it shows up in GC pressure.
- **Timers do not fire while the loop is blocked.** A slow synchronous JSON parse delays every pending timer by its full duration. Timer lateness is therefore a proxy metric for loop health — which is exactly what `perf_hooks.monitorEventLoopDelay()` formalises ([Chapter 9](09-event-loop.md)).
- **Long timers are a memory and correctness risk.** A `Timeout` holds its callback, and the callback holds its closure. A one-hour timer capturing a request object keeps that request alive for an hour. Prefer short timers plus a persisted schedule for anything beyond a few minutes — and remember the 2³¹−1 ms ceiling.
- **Do not rely on timers for security-sensitive delays.** Rate limiting and lockout windows must be enforced against stored timestamps in a shared store, not against in-process timers, which vanish on restart and do not exist in the other replicas.
- **Test with fake timers.** Because Node's timers are module exports as well as globals, test runners can substitute them. The built-in test runner provides `mock.timers` ([Chapter 45 — The Built-in Test Runner](../part7-diagnostics/45-test-runner.md)); this turns a 30-second retry test into a millisecond one.

## Exercises

1. **Measure the floor.** Schedule 1,000 successive `setTimeout(fn, 1)` calls, chained so each is created inside the previous callback, and record the actual elapsed time. *Success:* you can state the average per-timer overhead on your machine and explain why the total exceeds 1,000 ms.

2. **Idle timeout with `refresh()`.** Write a wrapper around a TCP socket that closes it after 10 seconds of inactivity, allocating exactly one `Timeout` for the socket's lifetime. *Success:* the socket survives a stream of traffic with gaps under 10 s and closes 10 s after the last byte, and a heap snapshot shows one timer per socket.

3. **Drift comparison.** Run a naive `setInterval(fn, 100)` and the `everyExactly` implementation from this chapter side by side for two minutes, with a random 0–80 ms synchronous block injected into each tick. Plot cumulative error. *Success:* the naive version's error grows without bound; the corrected version stays within one period.

4. **Cancellable polling.** Using `setInterval` from `node:timers/promises`, poll an HTTP endpoint every 2 seconds until it returns HTTP 200 or a 30-second budget expires, whichever comes first. Use `AbortSignal.any()` to combine the deadline with a `SIGINT` handler. *Success:* Ctrl-C exits immediately and cleanly; the timeout path rejects with an `AbortError`; no timer keeps the process alive after either.

5. **Long-horizon scheduler.** Build a `scheduleAt(date, task)` that works for targets months in the future, without hitting the 2³¹−1 ms ceiling and without keeping a referenced timer alive for the entire wait. *Success:* a target 90 days out does not fire immediately, the timer chain survives a system clock change of +1 hour, and the process can still exit if nothing else is pending.

## Recap

- `setTimeout`/`setInterval` fire in the **timers** phase and return a `Timeout`; `setImmediate` fires in the **check** phase and returns an `Immediate`.
- Delays are truncated to integers, and any delay below `1`, above `2147483647`, or `NaN` becomes `1` — so `setTimeout(fn, 0)` is 1 ms and a 30-day timer fires immediately.
- `Timeout` offers `ref`, `unref`, `hasRef`, `refresh`, the **[Legacy]** `close`, plus `Symbol.toPrimitive` (a thread-local numeric id) and `Symbol.dispose`. `Immediate` offers the same minus `refresh` and `toPrimitive`.
- `refresh()` reschedules in place with no new allocation — the right tool for idle timeouts on many connections.
- Timer delays are minimums. Phase position, blocked callbacks and OS scheduling all add lateness, and `setInterval` accumulates that lateness as drift.
- A self-correcting loop computes each delay from an absolute target and chains the next tick only after the current one settles, eliminating both drift and overlap.
- `node:timers/promises` provides `setTimeout`, `setImmediate`, an async-iterator `setInterval`, and the **[Experimental]** `scheduler.wait()`/`scheduler.yield()`. All take `ref` and `signal` options; cancellation rejects with an `AbortError`.
- Unref'd timers do not keep the process alive — ideal for heartbeats, dangerous for work that must complete.

## Where to go next

- [Chapter 9 — The Event Loop: Phases, Microtasks, and Starvation](09-event-loop.md) — why timers are late.
- [Chapter 11 — Callbacks, Promises, async/await, and `util.promisify`](11-promises-and-async.md) — combinators and bounded concurrency.
- [Chapter 13 — AbortController, Signals, and Cancellation](13-abort-and-cancellation.md) — the full cancellation story.
- [Chapter 45 — The Built-in Test Runner](../part7-diagnostics/45-test-runner.md) — testing timer-dependent code without waiting.
- Official docs: <https://nodejs.org/docs/latest/api/timers.html>
