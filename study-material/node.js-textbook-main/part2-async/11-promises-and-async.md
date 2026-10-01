---
chapter: 11
part: "Part II — Asynchrony"
title: "Callbacks, Promises, async/await, and util.promisify"
level: intermediate
reading_time: "35 min"
prerequisites: [9, 10]
source_docs:
  - "doc/api/util.md"
  - "doc/api/process.md"
  - "doc/api/cli.md"
  - "doc/api/globals.md"
source_url: "https://nodejs.org/docs/latest/api/util.html"
node_baseline: "27.0.0-pre"
---

# Chapter 11 — Callbacks, Promises, async/await, and `util.promisify`

**What you will learn**

- Read and write error-first callbacks, and explain the design constraint that produced them.
- Convert between callback and promise styles with `util.promisify`, `util.promisify.custom`, and `util.callbackify`.
- Describe exactly what `await` does to the microtask queue, and why that matters for throughput.
- Choose between `Promise.all`, `allSettled`, `any` and `race` from a decision table rather than habit.
- Implement a bounded concurrency pool from scratch and know why you need one.
- Configure unhandled-rejection behaviour with `--unhandled-rejections` and handle the process events correctly.
- Avoid releasing Zalgo: functions that are sometimes synchronous and sometimes not.

**Why this matters**

Node's entire standard library was designed around callbacks before promises existed, and around promises before `async`/`await` existed. All three styles are still in the codebase you will work on, often in the same file. You need to move between them fluently, and you need to know which conversions are safe.

More importantly, the ergonomics of `await` hide a real hazard. `await` makes sequential code out of asynchronous operations, and sequential is frequently the wrong shape: a loop that awaits 500 HTTP requests one at a time takes 500 round trips. The obvious fix — `Promise.all` over all 500 — replaces it with a burst that exhausts your socket pool and your file descriptors. The correct answer is bounded concurrency, and there is no built-in for it. This chapter gives you the tools and the judgement.

## The error-first callback convention

Before promises, Node needed one convention that every asynchronous function could follow. It settled on this:

```js
fn(...args, (err, ...results) => { /* ... */ });
```

The callback is the **last** argument. Its **first** parameter is the error, or `null`/`undefined` on success. Results follow.

The convention exists because of a constraint that is easy to forget: **`try`/`catch` cannot cross an asynchronous boundary.** By the time an asynchronous callback runs, the stack that contained your `try` block is long gone. So the error has to travel as a value, and it has to arrive somewhere the caller cannot forget about — the first parameter, where destructuring makes it impossible to ignore accidentally.

```js
import { readFile } from 'node:fs';

readFile('/etc/hosts', 'utf8', (err, data) => {
  if (err) {
    // Handle it here. There is no outer catch that will see this.
    console.error('read failed:', err.code);
    return;
  }
  console.log(data.length);
});
```

Two rules make callback code survivable, and they are violated constantly:

1. **Always `return` after handling an error.** Without the `return`, execution falls through and the success path runs with `data === undefined`.
2. **Call the callback exactly once.** Calling it twice corrupts every abstraction layered on top — `util.promisify` will silently ignore the second call, but hand-rolled wrappers usually will not.

### Why callback hell is a real problem, not an aesthetic one

The pyramid shape is what people complain about. The pyramid is the least of it.

- **Error handling does not compose.** Every level needs its own `if (err) return cb(err)`. Miss one and the error is swallowed — the operation silently does nothing, which is far worse than crashing.
- **`throw` is a trap.** If you `throw` inside a callback, there is no enclosing `try` in the caller's stack. The exception reaches the event loop and becomes an `'uncaughtException'`, taking the process with it.
- **Stack traces are stumps.** The stack when your callback runs starts at the event loop, not at the code that made the call. Async stack traces have improved substantially in V8, but callbacks scheduled through third-party queues still lose the chain.
- **Parallelism must be hand-coded.** Running three operations concurrently and waiting for all of them means a counter, a results array, and an "already errored" flag. Every code base grows its own subtly buggy version.
- **No return value.** A callback function cannot return anything meaningful, so it cannot be composed. Promises are values; you can put them in an array, pass them around, and store them.
- **Cancellation is undefined.** There is no convention for stopping a callback-based operation in flight.

Promises fix the first five. `AbortSignal` fixes the sixth. Neither happens by itself if you keep writing callbacks.

## `util.promisify`

`util.promisify(original)` takes a function following the error-first convention and returns a version that returns a promise.

```mjs
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
const { stdout } = await run('git', ['rev-parse', 'HEAD']);
console.log(stdout.trim());
```

Constraints worth knowing:

- If `original` is not a function, `promisify()` throws.
- `promisify()` *assumes* the last argument is an error-first callback. If it isn't, it will still pass one, and you will get a function that never settles. There is no validation and no runtime error — just a hung promise.
- Since v20.8.0, calling `promisify` on a function that already returns a promise is **[Deprecated]**.
- If a callback yields more than one success value, the promise resolves with only the first — unless the function declares `util.promisify.custom`.

### The `this` trap

Promisifying a method detaches it from its receiver:

```mjs
import { promisify } from 'node:util';

class Cache {
  #store = new Map();
  get(key, cb) { cb(null, this.#store.get(key)); }
}

const cache = new Cache();

const broken = promisify(cache.get);
// await broken('k');  →  TypeError: Cannot read private member #store

// Both of these work:
await broken.call(cache, 'k');
const bound = broken.bind(cache);
await bound('k');
```

The habit to build: **bind before you promisify**, `promisify(cache.get.bind(cache))`, so the returned function is safe to hand to anyone.

### `util.promisify.custom`

Many older APIs do not follow the error-first shape. Some take `(onSuccess, onError)`; some deliver multiple values; some have a callback that isn't last. `util.promisify.custom` lets the function author declare the correct promise version, and `promisify()` will return it verbatim.

```mjs
import { promisify } from 'node:util';

function measure(url, onSuccess, onError) {
  // legacy dual-callback API
}

measure[promisify.custom] = (url) => new Promise((resolve, reject) => {
  measure(url, resolve, reject);
});

const measureAsync = promisify(measure);
console.log(measureAsync === measure[promisify.custom]); // true
```

The symbol is registered globally, so libraries can set it without importing `node:util`:

```js
const kCustomPromisify = Symbol.for('nodejs.util.promisify.custom');
myFunction[kCustomPromisify] = (arg) => { /* ... */ };
```

If `promisify.custom` is defined but is not a function, `promisify()` throws.

Node's own APIs use this. `child_process.exec` promisified gives you `{ stdout, stderr }` rather than just `stdout`, precisely because a custom promisified variant is declared for it.

### When *not* to promisify

Reach for the purpose-built promise module first. `node:fs/promises`, `node:dns/promises`, `node:timers/promises`, `node:stream/promises` and `node:readline/promises` are not thin wrappers — they have better ergonomics, `AbortSignal` support, and in the case of `fs` a `FileHandle` object that fixes descriptor leaks. Use `promisify` for third-party callback libraries and legacy internals, not for core modules that already ship a promise surface.

## `util.callbackify`

The inverse. It takes an `async` function (or any function returning a promise) and produces an error-first callback function — useful when you must satisfy an old interface, a plugin API, or a framework hook that only accepts callbacks.

```mjs
import { callbackify } from 'node:util';

async function loadConfig(env) {
  return { env, features: ['a', 'b'] };
}

const loadConfigCb = callbackify(loadConfig);

loadConfigCb('production', (err, config) => {
  if (err) throw err;
  console.log(config.features);
});
```

Three behaviours to internalise:

- The callback is invoked **asynchronously**, and its stack trace is limited.
- If the callback itself throws, Node emits `'uncaughtException'` — and if that is unhandled, the process exits.
- Because `null` means "no error", a promise rejected with a **falsy** reason is wrapped: you receive an `Error` whose `reason` property holds the original value. So `Promise.reject(null)` reaches your callback as an `Error` with `err.reason === null`. This is why rejecting with non-`Error` values is a bad habit.

## What `await` actually does

`await expr` does three things: it wraps `expr` in `Promise.resolve()` if it isn't already a promise, it suspends the async function, and it schedules the remainder of the function as a **microtask** to run when that promise settles.

The consequence: `await` yields to the microtask queue, not to the event loop. From [Chapter 9](09-event-loop.md), remember that the microtask queue is drained to empty between every event loop callback. So:

```js
async function f() {
  console.log(1);
  await null;        // suspends, resumes in a microtask
  console.log(3);
}

f();
console.log(2);
setTimeout(() => console.log(4), 0);

// 1, 2, 3, 4
```

`3` prints before `4` because the microtask checkpoint happens before the loop advances to the timers phase. And `await null` is not free-and-instant either — it costs a full microtask turn.

The practically important version of this rule: **awaiting things that are already settled does not let the event loop run.** A loop that awaits only resolved promises is a busy loop; timers stall and connections queue. Yield deliberately with `setImmediate` from `node:timers/promises`.

The second practically important consequence is throughput:

```mjs
// ❌ Sequential: 500 round trips, one after another.
const results = [];
for (const id of ids) {
  results.push(await fetchUser(id));   // ~50ms each → 25 seconds
}
```

Every `await` in a loop body is a full network round trip you are paying for serially. Whether that is right depends entirely on whether the operations are independent.

## Choosing a combinator

All four static combinators take an iterable of promises. They differ in when they settle and what they give you.

| Combinator | Settles when | Fulfils with | Rejects with | Use it when |
|---|---|---|---|---|
| `Promise.all` | All fulfil, or **any** rejects | Array of values, in input order | The first rejection reason | All results are required; a single failure invalidates the batch. Fetching a page's data dependencies |
| `Promise.allSettled` | **All** settle, however they settle | Array of `{status: 'fulfilled', value}` / `{status: 'rejected', reason}` | Never | Partial success is meaningful. Fanning out to N replicas, batch imports, health checks |
| `Promise.any` | **First** fulfilment, or all reject | The first fulfilled value | `AggregateError` with `.errors` | Redundant sources where any one answer suffices. Mirrors, multiple DNS resolvers |
| `Promise.race` | **First** settlement, fulfil or reject | The first settled value | The first settled reason | Racing against a timeout or an abort. Rarely correct for anything else |

Two traps.

**`Promise.all` does not cancel.** When one input rejects, `all` rejects immediately — but the other operations keep running. If they were writes, they still land. If they later reject, those rejections are unhandled unless something is attached. For side-effecting work, prefer `allSettled` and inspect the results, or pass a shared `AbortSignal` so a failure genuinely stops the rest.

**`Promise.race` leaks.** The losers keep running and keep their resources. Racing a 30-second fetch against a 1-second timer leaves the fetch alive for 29 more seconds. Where the operation supports it, `AbortSignal.timeout()` is strictly better than racing:

```mjs
// ❌ The fetch keeps going after the timeout wins.
const res = await Promise.race([
  fetch(url),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
]);

// ✅ The fetch is actually cancelled.
const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
```

## Bounded concurrency, from scratch

Neither extreme is right. `for...of` with `await` gives you concurrency of 1. `Promise.all` over 10,000 items gives you concurrency of 10,000 — which will exhaust file descriptors, blow through connection pool limits, trigger rate limiting, and flood libuv's 4-thread pool. What you want is a fixed number of workers pulling from a shared queue.

```mjs
/**
 * Runs `worker` over `items` with at most `limit` in flight.
 * Results are returned in input order. Fails fast: the first
 * rejection aborts the rest and is rethrown.
 */
export async function mapPool(items, limit, worker, { signal } = {}) {
  const values = Array.from(items);
  const results = new Array(values.length);
  let next = 0;

  async function drain() {
    while (true) {
      signal?.throwIfAborted();
      const i = next++;
      if (i >= values.length) return;
      results[i] = await worker(values[i], i, { signal });
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, values.length)) },
    drain,
  );
  await Promise.all(workers);
  return results;
}
```

The whole idea is in `next++`. Each worker takes the next index and processes it; when the indices run out, that worker returns. No scheduler, no queue object, no timers — and because `next++` is a synchronous read-modify-write on the single JavaScript thread, there is no race.

```mjs
const users = await mapPool(userIds, 8, (id) => fetchUser(id));
```

Two variations you will want:

**Collect-all instead of fail-fast.** Wrap the call in the worker so a rejection becomes a result:

```mjs
const outcomes = await mapPool(userIds, 8, async (id) => {
  try { return { ok: true, value: await fetchUser(id) }; }
  catch (err) { return { ok: false, err, id }; }
});
const failures = outcomes.filter((o) => !o.ok);
```

**Genuine cancellation on first failure.** Create an `AbortController` in `mapPool`, abort it in a `catch` around the `await Promise.all(workers)`, and pass `AbortSignal.any([signal, internal.signal])` down to the worker. Then a failure stops in-flight work rather than merely stopping *new* work.

Choosing `limit`: it is a property of the downstream resource, not of your CPU. Match the connection pool size for a database, the documented rate limit for an API, and something near `UV_THREADPOOL_SIZE` for `fs`-heavy work. Start conservative and raise it while watching p99 latency — the right value is the one just before latency starts climbing.

## Unhandled rejections

A rejected promise with no rejection handler attached is Node's equivalent of an uncaught exception. It is detected at the end of a turn, which is why the diagnosis is sometimes reported one tick after the fact.

Since v15.0.0 the default mode is `throw`: an unhandled rejection becomes an uncaught exception and, by default, **terminates the process**. This surprises people upgrading from very old versions, where it was a warning.

The `--unhandled-rejections=mode` flag selects the behaviour:

| Mode | Behaviour |
|---|---|
| `throw` | Emit `'unhandledRejection'`. If no hook is set, raise the rejection as an uncaught exception. **This is the default** |
| `strict` | Always raise the rejection as an uncaught exception. If that exception is handled, `'unhandledRejection'` is emitted |
| `warn` | Always emit a warning, whether or not an `'unhandledRejection'` hook is set, without the deprecation warning |
| `warn-with-error-code` | Emit `'unhandledRejection'`. If no hook is set, warn and set the process exit code to `1` |
| `none` | Silence all warnings |

A rejection during the entry point's ES module static loading phase is always raised as an uncaught exception, whatever the mode.

Two process events pair with this:

- `'unhandledRejection'` — `(reason, promise)`. Emitted when a promise is rejected and no handler is attached within one turn of the loop.
- `'rejectionHandled'` — `(promise)`. Emitted when a handler is attached *later*, after `'unhandledRejection'` already fired.

The pair exists because "unhandled" is a judgement made at a point in time and can be revised. If you are building a leak-tolerant reporter rather than crashing, track both:

```mjs
import process from 'node:process';

const pending = new Map();

process.on('unhandledRejection', (reason, promise) => {
  pending.set(promise, reason);
});
process.on('rejectionHandled', (promise) => {
  pending.delete(promise);
});

// Report whatever is still unhandled, periodically.
setInterval(() => {
  for (const [, reason] of pending) logger.error({ err: reason }, 'unhandled rejection');
  pending.clear();
}, 60_000).unref();
```

**Recommendation for services: leave the default `throw` in place.** An unhandled rejection means a code path you did not reason about; continuing with corrupt state is worse than restarting. Log it in a handler for diagnostics, then let the process die and let your supervisor restart it. `warn` and `none` turn a loud bug into a silent one.

The most common source of unhandled rejections is a promise created but never awaited or returned:

```js
// ❌ Rejections here are unhandled — nothing is attached.
items.forEach(async (item) => { await save(item); });

// ✅ Collect and await them.
await Promise.all(items.map((item) => save(item)));
```

`Array.prototype.forEach` ignores the returned promise entirely. So do most callback-taking array methods. If you catch yourself writing `async` inside `forEach`, you want `map` plus a combinator, or a `for...of` loop.

## Never release Zalgo

An API must be **either always synchronous or always asynchronous**. Never both. The failure mode is famous enough to have a name: releasing Zalgo.

```js
// ❌ Sometimes synchronous, sometimes not.
function get(key, cb) {
  if (cache.has(key)) {
    cb(null, cache.get(key));   // synchronous!
    return;
  }
  fetchFromDisk(key, cb);       // asynchronous
}
```

Now the ordering of `foo()` and `bar()` here depends on cache state:

```js
get('config', () => foo());
bar();
```

Every caller must now handle two different execution orders, and the bug only shows up when the cache happens to be warm — which in tests it usually isn't, and in production it usually is. Worse, the synchronous path runs the callback *before the caller has finished setting up*, so any state the callback depends on may not exist yet.

The fix is to force asynchrony on the fast path:

```mjs
// ✅ Always asynchronous.
function get(key, cb) {
  if (cache.has(key)) {
    const value = cache.get(key);
    queueMicrotask(() => cb(null, value));
    return;
  }
  fetchFromDisk(key, cb);
}
```

`process.nextTick(cb)` is the traditional answer and is what the Node docs show; it is now **[Legacy]**, and `queueMicrotask()` is the portable replacement. In promise-returning APIs the problem largely disappears, because `async` functions always return a promise and `.then` callbacks are always microtasks. Making a function `async` is the cheapest Zalgo-proofing available.

## `AbortSignal` in async functions

Every long-running async function you write should accept an optional `signal`. Three tools cover almost every case.

**`signal.throwIfAborted()`** — the cheap check, at each yield point:

```js
async function importRows(rows, { signal } = {}) {
  for (const row of rows) {
    signal?.throwIfAborted();     // throws signal.reason
    await insert(row);
  }
}
```

**`util.aborted(signal, resource)`** — a promise that resolves when the signal aborts. The `resource` is held weakly: if it is garbage collected before the abort, the promise stays pending forever and Node stops tracking it. That weak reference is the whole point — it stops long-lived signals accumulating listeners for operations that no longer exist. Stable since v24.0.0 / v22.16.0.

```mjs
import { aborted } from 'node:util';

async function streamUntilAborted(source, sink, signal) {
  const stop = aborted(signal, source);
  stop.then(() => source.destroy(new Error('aborted')));
  for await (const chunk of source) sink.write(chunk);
}
```

**`events.addAbortListener(signal, listener)`** — for callback-shaped cleanup. It returns a `Disposable`, and it is immune to a third party calling `stopImmediatePropagation()` on the signal, which a raw `addEventListener('abort', ...)` is not. Stable since v24.0.0 / v22.16.0.

```mjs
import { addAbortListener } from 'node:events';

function withCleanup(signal) {
  using _ = addAbortListener(signal, () => releaseResources());
  return doWork();
}
```

Combine deadlines with `AbortSignal.any([userSignal, AbortSignal.timeout(30_000)])`. Cancellation errors have `name === 'AbortError'` — check `err.name`, since the constructor is not exposed for `instanceof`.

## Common mistakes

### ❌ `await` inside a loop over independent work

```js
// ❌ 500 sequential round trips.
for (const id of ids) results.push(await fetchUser(id));
```

```mjs
// ✅ Bounded parallelism.
const results = await mapPool(ids, 10, (id) => fetchUser(id));
```

Sequential is correct when each iteration depends on the previous, or when you deliberately want to be gentle on a downstream. It is wrong by default.

### ❌ `async` callbacks passed to `forEach`

```js
// ❌ Returns before anything finishes; rejections are unhandled.
files.forEach(async (f) => { await unlink(f); });
console.log('deleted');   // prints first, deletes nothing yet
```

```mjs
// ✅
await Promise.all(files.map((f) => unlink(f)));
console.log('deleted');
```

### ❌ Creating promises inside `new Promise` around an async function

```js
// ❌ The "explicit promise construction antipattern".
function load(id) {
  return new Promise((resolve, reject) => {
    fetchUser(id).then(resolve).catch(reject);   // pointless wrapper
  });
}
```

Worse than redundant: a `throw` inside the executor before `resolve`/`reject` is called silently rejects, and a `throw` after them is swallowed entirely.

```js
// ✅ It is already a promise.
const load = (id) => fetchUser(id);
```

Reserve `new Promise` for genuinely adapting a non-promise API — an event, a callback with a shape `promisify` cannot handle.

### ❌ Rejecting with something that is not an `Error`

```js
// ❌
if (!row) return Promise.reject('not found');
```

You lose the stack trace, `err.message` is `undefined`, logging libraries print `[object Object]` or nothing useful, and `util.callbackify` has to wrap falsy reasons in a synthetic `Error` with a `reason` property to keep the error-first contract intact.

```js
// ✅
if (!row) throw Object.assign(new Error('row not found'), { code: 'ENOROW', id });
```

### ❌ Swallowing errors with a bare `catch`

```js
// ❌ The operation failed and nobody will ever know.
try { await save(record); } catch {}
```

```js
// ✅ Handle, or re-throw, but always record.
try {
  await save(record);
} catch (err) {
  if (err.code !== 'ER_DUP_ENTRY') throw err;
  logger.warn({ id: record.id }, 'duplicate, skipping');
}
```

## Production notes

- **Keep `--unhandled-rejections` at the default `throw` for services.** Install an `'unhandledRejection'` listener to log context and let the process exit. Silent modes (`warn`, `none`) convert a crash you can debug into data corruption you cannot.
- **Every unbounded `Promise.all` is a latent outage.** Concurrency limits belong to the resource: pool size for a database, documented rate limit for an API, roughly `UV_THREADPOOL_SIZE` for `fs`. Make the limit a configuration value so you can turn it down during an incident.
- **`Promise.race` and `Promise.all` both leak in-flight work.** Neither cancels the losers. Under sustained load a racing timeout pattern accumulates abandoned sockets. Prefer `AbortSignal` all the way down.
- **Async stack traces have a cost and a limit.** V8 reconstructs them across `await` points, but a callback dispatched through a userland queue loses the chain. `--stack-trace-limit` raises the depth at a memory cost; `Error.captureStackTrace` at the boundary of your abstraction preserves the useful frames.
- **Prefer the native promise modules over `promisify` for core APIs.** `node:fs/promises` gives you `FileHandle`, `AbortSignal` support, and better defaults; `promisify(fs.open)` gives you a raw descriptor you can leak.
- **Promises retain memory until they settle.** A promise pending on a socket that never responds keeps its entire closure alive, including request bodies. Timeouts are memory management, not only latency management.
- **`util.callbackify` turns a thrown error in the consumer's callback into `'uncaughtException'`.** When exposing a callback API over promise internals, document that clearly, or defensively `try`/`catch` at the boundary.
- **Instrument the pool, not just the calls.** Log queue depth and time-in-queue for your bounded pool. When latency rises, that tells you instantly whether the downstream got slower or you simply queued more work.

## Exercises

1. **Promisify an awkward API.** Write a function `readWithStats(path, cb)` whose callback signature is `(err, contents, stats)`. Promisify it so the result is `{ contents, stats }` rather than just `contents`. *Success:* `promisify(readWithStats)` returns your custom version, verified by identity comparison against `readWithStats[Symbol.for('nodejs.util.promisify.custom')]`.

2. **Combinator decision drill.** For each of these, pick a combinator and justify it in one sentence: (a) fetch a user's profile, settings and permissions, all required; (b) push a webhook to 50 subscriber URLs; (c) resolve a hostname via three DNS providers; (d) read from a primary database with a 200 ms fallback to a replica. *Success:* your four choices match the decision table, and you can name the leak in (d).

3. **Bounded pool with cancellation.** Extend `mapPool` so the first rejection aborts in-flight work via an internal `AbortController` composed with the caller's signal using `AbortSignal.any()`. *Success:* with `limit = 4` and a worker that fails on item 10, no more than 3 extra workers are still running one tick after the failure, and each observed an `AbortError`.

4. **Prove the microtask ordering.** Write a script that prints a deterministic sequence using `await`, `queueMicrotask`, `setImmediate` and `setTimeout(fn, 0)` inside an `fs.readFile` callback. Predict the output before running it. *Success:* prediction matches output, and you can explain each transition in terms of phases and the microtask checkpoint.

5. **Kill Zalgo.** Take a memoising `fetchOrCache(key, cb)` that calls back synchronously on a cache hit. Write a test that fails against the buggy version and passes against the fixed one, without inspecting the implementation. *Success:* the test asserts on ordering relative to a statement after the call, and fails for the right reason.

## Recap

- The error-first callback convention exists because `try`/`catch` cannot cross an asynchronous boundary; errors must travel as values.
- Callback problems are structural — non-composing error handling, `throw` becoming `'uncaughtException'`, truncated stacks, hand-rolled parallelism, no return value, no cancellation.
- `util.promisify` converts error-first functions; bind methods first, and use `util.promisify.custom` (also reachable as `Symbol.for('nodejs.util.promisify.custom')`) for non-standard shapes. Prefer core's own `*/promises` modules where they exist.
- `util.callbackify` converts back. It calls the callback asynchronously, escalates callback throws to `'uncaughtException'`, and wraps falsy rejection reasons in an `Error` with a `reason` property.
- `await` schedules the function's continuation as a microtask. It yields to the microtask queue, not to the event loop — awaiting settled values never lets I/O run.
- Pick combinators deliberately: `all` for all-required, `allSettled` for partial success, `any` for redundancy, `race` almost only for timeouts. Neither `all` nor `race` cancels the losers.
- Bounded concurrency is the default correct shape for batch work; a shared index and N worker loops is all it takes.
- The default `--unhandled-rejections` mode is `throw`; the alternatives are `strict`, `warn`, `warn-with-error-code` and `none`. Pair `'unhandledRejection'` with `'rejectionHandled'` if you report rather than crash.
- Never write an API that is sometimes synchronous. Force asynchrony with `queueMicrotask()` or, better, make it `async`.

## Where to go next

- [Chapter 9 — The Event Loop: Phases, Microtasks, and Starvation](09-event-loop.md) — where microtasks fit.
- [Chapter 10 — Timers and Scheduling](10-timers.md) — timers, deadlines, and `timers/promises`.
- [Chapter 12 — EventEmitter and the Events Module](12-eventemitter.md) — the third async style, and bridging it to promises.
- [Chapter 13 — AbortController, Signals, and Cancellation](13-abort-and-cancellation.md) — cancellation in depth.
- [Chapter 14 — Errors: Classes, Codes, and Handling Strategies](14-errors.md) — error design, codes, and `cause`.
- [Chapter 15 — AsyncLocalStorage and Context Propagation](15-async-context.md) — carrying request context across `await`.
- Official docs: <https://nodejs.org/docs/latest/api/util.html>, <https://nodejs.org/docs/latest/api/process.html>
