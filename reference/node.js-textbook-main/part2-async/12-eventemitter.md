---
chapter: 12
part: "Part II — Asynchrony"
title: "EventEmitter and the Events Module"
level: intermediate
reading_time: "32 min"
prerequisites: [9, 11]
source_docs:
  - "doc/api/events.md"
source_url: "https://nodejs.org/docs/latest/api/events.html"
node_baseline: "27.0.0-pre"
---

# Chapter 12 — EventEmitter and the Events Module

**What you will learn**

- Use the full `EventEmitter` method surface, and know which methods are aliases of which.
- Explain why an unhandled `'error'` event crashes the process, and instrument errors safely with `events.errorMonitor`.
- Diagnose the "possible EventEmitter memory leak" warning and fix the underlying bug rather than the symptom.
- Handle rejections from `async` listeners with `captureRejections` and `Symbol.for('nodejs.rejection')`.
- Bridge emitters into `async` code with `events.once()` and `events.on()`, including cancellation with `AbortSignal`.
- Choose deliberately between an emitter, a stream, and a promise.

**Why this matters**

`EventEmitter` is the substrate of Node's standard library. `http.Server`, `net.Socket`, every stream, `process` itself, `ChildProcess`, `Worker`, `cluster` — all emitters. You cannot read a stack trace or a stream implementation without understanding it, and most Node applications end up defining a few emitters of their own.

It is also where two of the most common production incidents originate. The first is a process that dies with an unhandled `'error'` event and a stack trace pointing into a library you have never opened. The second is a `MaxListenersExceededWarning` at 3 a.m. that means you have been leaking one listener per request for six hours and are now out of memory. Both are entirely preventable once you know the mechanism.

## The model: synchronous dispatch

An `EventEmitter` is a map from event names to arrays of listener functions, plus a method that calls them.

```mjs
import { EventEmitter } from 'node:events';

class Job extends EventEmitter {
  run() {
    this.emit('start', { at: Date.now() });
    this.emit('done', { rows: 42 });
  }
}

const job = new Job();
job.on('start', (info) => console.log('started', info.at));
job.on('done', (info) => console.log('done', info.rows));
job.run();
```

```cjs
const EventEmitter = require('node:events');
```

Note the import shapes: the ESM named export is `EventEmitter`, while `require('node:events')` gives you the class directly (it also carries `.EventEmitter` as a property for compatibility).

The single most important property: **`emit()` calls listeners synchronously, in registration order, on the caller's stack.** It is a function call loop, not a queue. Consequences:

- A slow listener blocks the emitter and everything else. Ten listeners at 20 ms each means `emit()` takes 200 ms.
- A listener that throws propagates the exception out of `emit()` into whoever called it — and subsequent listeners never run.
- There is no backpressure. `emit()` returns `true` if the event had listeners and `false` otherwise, and that is all the feedback you get.

If a listener needs to do slow work, hand off explicitly:

```js
job.on('done', (info) => {
  setImmediate(() => writeAuditLog(info));   // returns to the emitter immediately
});
```

## The method surface

| Method | Returns | Notes |
|---|---|---|
| `emitter.on(eventName, listener)` | `EventEmitter` | Append a listener. Chainable |
| `emitter.addListener(eventName, listener)` | `EventEmitter` | Alias for `on()` |
| `emitter.once(eventName, listener)` | `EventEmitter` | Runs at most once, then removed |
| `emitter.off(eventName, listener)` | `EventEmitter` | Alias for `removeListener()`, added v10.0.0 |
| `emitter.removeListener(eventName, listener)` | `EventEmitter` | Removes **one** instance of `listener` |
| `emitter.removeAllListeners([eventName])` | `EventEmitter` | All listeners, or all for one event |
| `emitter.emit(eventName[, ...args])` | `boolean` | `true` if the event had listeners |
| `emitter.prependListener(eventName, listener)` | `EventEmitter` | Insert at the front of the array |
| `emitter.prependOnceListener(eventName, listener)` | `EventEmitter` | Front, one-shot |
| `emitter.listeners(eventName)` | `Function[]` | Copy of the listener array; unwraps `once()` wrappers |
| `emitter.rawListeners(eventName)` | `Function[]` | Copy **including** `once()` wrappers, added v9.4.0 |
| `emitter.listenerCount(eventName[, listener])` | `integer` | The `listener` argument was added in v19.8.0 / v18.16.0 |
| `emitter.eventNames()` | `(string\|symbol)[]` | Events with at least one listener |
| `emitter.setMaxListeners(n)` | `EventEmitter` | Per-instance warning threshold |
| `emitter.getMaxListeners()` | `integer` | Current threshold |

Three details people trip on.

**`removeListener` removes one occurrence.** Register the same function twice and you must remove it twice. It also only affects the *next* `emit()`: if you remove a listener while an `emit()` is in flight, that emit's already-captured listener array still runs it.

**`once()` wrappers are invisible to `listeners()`.** `emitter.listeners('x')` unwraps them and returns your original function, which is what you usually want. `rawListeners('x')` returns the wrapper, with the original available on the wrapper's `.listener` property — occasionally useful when you need to call a one-shot handler manually without consuming it.

**Order is registration order, and `prependListener` breaks that expectation.** Use it sparingly; a listener that quietly jumps the queue is hard to reason about. It exists mainly for library code that must observe an event before user handlers get a chance to mutate state.

## The `'error'` event

`'error'` is the one event name with special semantics baked into `emit()`.

> If an emitter has **no** listener for `'error'` and `'error'` is emitted, the error is thrown, a stack trace is printed, and the process exits.

```mjs
import { EventEmitter } from 'node:events';

const ee = new EventEmitter();
ee.emit('error', new Error('whoops'));
// Throws and crashes the process.
```

This looks harsh and is deliberate. An emitter has nowhere else to put an error: `emit()` is called from library internals, so there is no caller `try`/`catch` to catch it and no promise to reject. Silently dropping errors would make failures invisible, so Node chose "loud crash" over "silent data loss".

Attach a listener and the crash becomes a normal call:

```mjs
ee.on('error', (err) => logger.error({ err }, 'emitter failed'));
ee.emit('error', new Error('whoops'));   // handled
```

The practical rule: **every emitter you hold a reference to needs an `'error'` listener.** Sockets, streams, servers, child processes, workers. The most frequent production crash in Node is an `ECONNRESET` on a socket nobody attached an error handler to.

### `events.errorMonitor`

To *observe* errors without *consuming* them, register with the `errorMonitor` symbol. Monitor listeners run before regular `'error'` listeners, and they do **not** count as handling the error — if no regular listener exists, the process still crashes.

```mjs
import { EventEmitter, errorMonitor } from 'node:events';

const ee = new EventEmitter();
ee.on(errorMonitor, (err) => metrics.increment('emitter.error', { code: err.code }));
ee.emit('error', new Error('boom'));
// Metric recorded — and still crashes, because no regular listener exists.
```

This is exactly what a metrics or tracing layer wants: full visibility, zero change to the application's failure semantics.

## The meta-events

Every emitter emits two events about its own listeners.

- **`'newListener'`** — `(eventName, listener)`, emitted **before** the listener is added.
- **`'removeListener'`** — `(eventName, listener)`, emitted **after** it is removed. For listeners added with `once()`, the `listener` argument is the original function, not the wrapper.

The "before" in `'newListener'` has a consequence worth knowing: any listener you add for the *same* event from inside a `'newListener'` handler ends up **in front of** the one currently being registered.

The genuinely useful application is lazy resource acquisition — do not open the expensive thing until someone actually cares:

```mjs
import { EventEmitter } from 'node:events';

class MetricsFeed extends EventEmitter {
  #poller = null;

  constructor() {
    super();
    this.on('newListener', (event) => {
      if (event === 'sample' && this.listenerCount('sample') === 0) {
        this.#poller = setInterval(() => this.emit('sample', read()), 1000);
      }
    });
    this.on('removeListener', (event) => {
      if (event === 'sample' && this.listenerCount('sample') === 0) {
        clearInterval(this.#poller);
        this.#poller = null;
      }
    });
  }
}
```

Note the `listenerCount('sample') === 0` check inside `'newListener'`: because the event fires *before* the addition, the count does not yet include the incoming listener. Getting that backwards is the classic bug in this pattern. Be careful, too: adding a listener from inside `'newListener'` re-enters the handler, so guard against recursion.

## `maxListeners` and the leak warning

Node warns when a single event on a single emitter accumulates more than **10** listeners. This is not a limit — the eleventh listener is added and works fine — it is a heuristic that catches the most common memory leak in Node: registering a listener per request or per iteration on a long-lived emitter and never removing it.

```
(node:1234) MaxListenersExceededWarning: Possible EventEmitter memory leak
detected. 11 close listeners added to [Socket]. Use emitter.setMaxListeners()
to increase limit
```

Controls:

| API | Scope |
|---|---|
| `emitter.setMaxListeners(n)` / `emitter.getMaxListeners()` | One emitter. Takes precedence over the default |
| `events.defaultMaxListeners` | The default for **all** emitters, including ones already created. A non-positive value throws `RangeError` |
| `events.setMaxListeners(n[, ...eventTargets])` | Sets `n` on the given `EventEmitter`s **or** `EventTarget`s. With no targets, sets the default for newly created ones |
| `events.getMaxListeners(emitterOrTarget)` | Reads it; the only way to read it for an `EventTarget` |

`defaultMaxListeners` has **no effect on `AbortSignal` instances** — by default signals do not warn at all, though you can still set a threshold on an individual signal with `setMaxListeners`.

The warning is a real `Warning` object, observable through `process.on('warning')`, with extra `emitter`, `type` and `count` properties and `name === 'MaxListenersExceededWarning'`. Run with `--trace-warnings` to get the stack trace of the registration that crossed the line — that is normally enough to find the leak in one run.

```mjs
process.on('warning', (warning) => {
  if (warning.name === 'MaxListenersExceededWarning') {
    logger.warn({ type: warning.type, count: warning.count }, 'listener leak');
  }
});
```

**Raise the limit only when you genuinely expect many listeners** — say, a shared shutdown emitter that 40 subsystems subscribe to at boot. If the count grows over time, raising the limit just delays the out-of-memory kill. Fix the removal instead: use `once()` where a listener should fire once, remove listeners in a `finally`, or use `addEventListener`'s `signal` option on `EventTarget`s so a single `abort()` detaches everything.

## Async listeners and `captureRejections`

`emit()` ignores return values. So an `async` listener that rejects produces an unhandled rejection, which under the default `--unhandled-rejections=throw` kills the process — with a stack trace that points at the listener, not at the emitter.

```js
// ❌ Unhandled rejection.
ee.on('request', async (req) => { await handle(req); });
```

The `captureRejections` option installs a `.then(undefined, handler)` on whatever a listener returns. The rejection is then routed **asynchronously** to the emitter's `Symbol.for('nodejs.rejection')` method if it has one, or to its `'error'` event if it does not.

```mjs
import { EventEmitter } from 'node:events';

const ee = new EventEmitter({ captureRejections: true });
ee.on('request', async () => { throw new Error('kaboom'); });
ee.on('error', (err) => logger.error({ err }, 'listener rejected'));
ee.emit('request');
```

For your own emitter classes, implementing the rejection symbol gives you the failing event name and arguments, which is far more useful than a bare error:

```mjs
import { EventEmitter, captureRejectionSymbol } from 'node:events';

class Pipeline extends EventEmitter {
  constructor() { super({ captureRejections: true }); }

  [captureRejectionSymbol](err, event, ...args) {
    logger.error({ err, event, args }, 'stage failed');
    this.destroy(err);
  }

  destroy(err) { /* tear down */ }
}
```

`events.captureRejections = true` flips the default for all newly created emitters. Treat that as an application-level decision, never a library one — changing global defaults from a dependency is hostile.

One firm rule from the docs: **do not use `async` functions as `'error'` handlers.** The `'error'` events produced by `captureRejections` deliberately have no catch handler, to avoid infinite error loops. An async `'error'` handler that rejects therefore has nowhere to go.

## Bridging emitters into async code

Two functions in `node:events` convert the callback world into the `await` world.

### `events.once(emitter, name[, options])`

Returns a promise fulfilled the next time `name` is emitted, with an **array** of all the emitted arguments. If the emitter emits `'error'` while waiting, the promise **rejects** with that error — the emitter's special error semantics are preserved.

```mjs
import { once } from 'node:events';
import { createServer } from 'node:net';

const server = createServer();
server.listen(0);
await once(server, 'listening');
console.log('listening on', server.address().port);
```

Details that matter:

- It resolves with an array, so destructure: `const [value] = await once(ee, 'data');`
- The `'error'` special-casing applies only while waiting for a *different* event. `await once(ee, 'error')` waits for `'error'` like any other event and fulfils rather than rejects.
- The `signal` option (v15.0.0) cancels the wait; the promise rejects with an `AbortError` and the listeners are removed.
- It is intentionally generic and also works with a web `EventTarget`, which has no `'error'` semantics.

```mjs
const [payload] = await once(worker, 'message', { signal: AbortSignal.timeout(5_000) });
```

Beware the resolved-once nature: `events.once` attaches its listeners when you call it, so events emitted before the call are missed. If an emitter might emit synchronously during setup, create the promise *before* triggering the work and await it afterwards.

### `events.on(emitter, eventName[, options])`

Returns an **async iterator** over every occurrence of the event. This turns any emitter into something you can `for await` over.

```mjs
import { on } from 'node:events';

const ac = new AbortController();

try {
  for await (const [message] of on(bus, 'message', {
    signal: ac.signal,
    close: ['end'],
  })) {
    await handle(message);
  }
} catch (err) {
  if (err.name !== 'AbortError') throw err;
}
```

| Option | Default | Meaning |
|---|---|---|
| `signal` | — | Cancel iteration; iteration throws an `AbortError` |
| `close` | — | Array of event names that end the iteration normally (v20.0.0) |
| `highWaterMark` | `Number.MAX_SAFE_INTEGER` | Pause the emitter when more than this many events are buffered. Requires `pause()`/`resume()` on the emitter (v22.0.0 / v20.13.0) |
| `lowWaterMark` | `1` | Resume the emitter when the buffer falls below this |

The crucial caveat, stated plainly in the docs: **the loop body processes one event at a time, even with `await` inside.** If your body is slow and the emitter is fast, events buffer in memory without bound — unless the emitter supports `pause()`/`resume()` and you set `highWaterMark`. For a high-rate source that already implements backpressure, a stream is the better tool.

## `EventEmitterAsyncResource`

Ordinary emitters do not track async context. A listener runs in whatever async context `emit()` was called from, which means an `AsyncLocalStorage` store established when the emitter was *created* is not visible inside the listener.

`events.EventEmitterAsyncResource` (v17.4.0 / v16.14.0) fixes that by integrating with `AsyncResource`: all events it emits run within *its* async context.

```mjs
import { EventEmitterAsyncResource } from 'node:events';

// Diagnostic tooling will label this resource 'RequestBus'.
const bus = new EventEmitterAsyncResource({ name: 'RequestBus' });
```

Constructor options: `captureRejections` (default `false`), `name` (default `new.target.name`), `triggerAsyncId` (default `executionAsyncId()`), and `requireManualDestroy` (default `false`). It exposes `asyncId`, `triggerAsyncId`, `asyncResource`, and `emitDestroy()` in addition to the full `EventEmitter` surface.

Use it when a long-lived emitter must carry request context to its listeners, or when you want APM tooling to attribute listener work to the right operation. It is not free — every emit crosses an async-resource boundary — so reach for it when you need the context, not by default. See [Chapter 15 — AsyncLocalStorage and Context Propagation](15-async-context.md).

## `EventTarget`, `Event`, and `CustomEvent`

Node also ships the web platform's event system as globals, because web APIs adopted into Node (`AbortSignal`, `fetch`, `MessagePort`, web streams) are specified in terms of it.

```js
const target = new EventTarget();
target.addEventListener('ready', (event) => console.log(event.type));
target.dispatchEvent(new Event('ready'));

// Carry a payload with CustomEvent (stable since v23.0.0):
target.addEventListener('tick', (e) => console.log(e.detail));
target.dispatchEvent(new CustomEvent('tick', { detail: { n: 1 } }));
```

The differences from `EventEmitter` are not cosmetic:

| | `EventEmitter` | `EventTarget` |
|---|---|---|
| Register | `on()`, `once()`, `prependListener()` | `addEventListener(type, listener[, options])` |
| Remove | `off()`, `removeListener()`, `removeAllListeners()` | `removeEventListener(type, listener[, options])` |
| Fire | `emit(name, ...args)` → `boolean` | `dispatchEvent(event)` → `boolean` |
| Listener receives | The raw arguments, spread | A single `Event` object; payload on `CustomEvent.detail` |
| Duplicate registration | Allowed; runs N times | Ignored — one listener per type per `capture` value |
| One-shot | `once()` | `{ once: true }` option |
| Auto-removal | Manual | `{ signal }` option — `abort()` removes it |
| `'error'` semantics | Special: unhandled `'error'` crashes | None; `'error'` is an ordinary type |
| Listener throws | Propagates out of `emit()`, stopping later listeners | Treated as an uncaught exception on `process.nextTick()`; **other listeners still run** |
| Async listener rejects | Unhandled rejection unless `captureRejections` | Captured and handled like a synchronous throw |
| Hierarchy / propagation | None | None in Node either (unlike the DOM) |
| Introspection | `listeners()`, `listenerCount()`, `eventNames()` | Only via `events.getEventListeners()` |
| Meta-events | `'newListener'`, `'removeListener'` | None |

Two Node-specific notes. Node's `EventTarget` has **no hierarchy and no propagation** — an event dispatched to a target does not bubble to anything. And an async listener whose promise rejects is captured and handled exactly like a synchronous throw, which is *not* what browsers do.

`addEventListener` options: `once`, `passive`, `capture` (tracked for spec completeness but functionally unused in Node, though it does form part of the registration key), and `signal`. That last one is genuinely excellent and has no `EventEmitter` equivalent:

```mjs
const ac = new AbortController();
target.addEventListener('a', onA, { signal: ac.signal });
target.addEventListener('b', onB, { signal: ac.signal });
ac.abort();   // both removed, no bookkeeping
```

There is also `NodeEventTarget`, an internal-ish class that emulates a subset of the `EventEmitter` API on top of `EventTarget`. It is not an `EventEmitter`, registers each listener at most once per type, does not emulate `prependListener()`, `prependOnceListener()`, `rawListeners()` or `errorMonitor`, does not emit the meta-events, and has no special `'error'` behaviour.

**Which to use in your own code:** `EventEmitter` for Node-facing APIs — it is what users expect, it has richer introspection, and it composes with `events.once`/`events.on`. `EventTarget` when you are implementing something specified against the web platform, or when you want the `{ signal }` auto-removal badly enough.

## Emitter, stream, or promise?

| Situation | Use | Why |
|---|---|---|
| Exactly one outcome, eventually | **Promise** | It is a value: composable, awaitable, `try`/`catch` works |
| Many discrete notifications over time, no flow control needed | **EventEmitter** | Low overhead, multiple independent subscribers |
| Many chunks where the producer can outrun the consumer | **Stream** | Backpressure is built in — the missing feature in emitters |
| One notification you want to `await` | **`events.once()`** | Bridges an emitter to a promise |
| A bounded sequence you want to `for await` | **`events.on()`** with `close` | Bridges an emitter to an async iterator |
| Progress reporting alongside a final result | **Both** | Return a promise, emit `'progress'` on the side |

The decisive question is almost always backpressure. If a fast producer can overwhelm a slow consumer, you need a stream; an emitter will buffer in the consumer's memory until the process dies. See [Chapter 18 — Streams I](../part3-data/18-streams-concepts.md).

## Common mistakes

### ❌ No `'error'` listener on a socket or stream

```js
// ❌ One ECONNRESET and the process is gone.
const socket = net.connect(port, host);
socket.on('data', handle);
```

```js
// ✅
socket.on('error', (err) => {
  logger.warn({ err: err.code }, 'socket error');
  socket.destroy();
});
```

### ❌ Adding a listener per request to a long-lived emitter

```js
// ❌ Leaks one listener per request, forever.
app.on('request', (req, res) => {
  shutdownBus.on('shutdown', () => res.end('closing'));
});
```

```mjs
// ✅ Remove it when the request finishes — or use an AbortSignal.
app.on('request', (req, res) => {
  const onShutdown = () => res.end('closing');
  shutdownBus.on('shutdown', onShutdown);
  res.on('close', () => shutdownBus.off('shutdown', onShutdown));
});
```

### ❌ `async` listeners without `captureRejections`

```js
// ❌ A rejection here becomes an unhandled rejection and, by default, exits.
queue.on('job', async (job) => { await process(job); });
```

```mjs
// ✅ Either enable capture, or handle inside the listener.
queue.on('job', (job) => {
  process(job).catch((err) => logger.error({ err, id: job.id }, 'job failed'));
});
```

### ❌ Racing `events.once()` against an already-emitted event

```js
// ❌ If start() emits 'ready' synchronously, this waits forever.
service.start();
await once(service, 'ready');
```

```mjs
// ✅ Register the wait before triggering the work.
const ready = once(service, 'ready');
service.start();
await ready;
```

### ❌ Silencing `MaxListenersExceededWarning` by raising the limit

```js
// ❌ Now you find out at 3 a.m. instead of in staging.
emitter.setMaxListeners(0);   // 0 means unlimited
```

```bash
# ✅ Find the registration site, then fix the removal.
node --trace-warnings server.js
```

## Production notes

- **Audit every emitter you hold for an `'error'` listener.** Sockets, servers, streams, child processes and workers all crash the process when `'error'` goes unhandled. A start-up assertion that walks your long-lived emitters and checks `listenerCount('error') > 0` is cheap insurance.
- **Use `events.errorMonitor` in your observability layer, never as a handler.** It gives metrics and tracing complete visibility while leaving the application's crash semantics unchanged. Using it *instead of* a real handler means the process still dies, silently in your metrics' opinion.
- **`emit()` is synchronous and unbounded.** A handful of listeners each doing 10 ms of work turns one emit into a loop stall. In hot paths, measure `listenerCount()` and keep listener bodies trivial, deferring real work with `setImmediate`.
- **Treat `MaxListenersExceededWarning` as an incident, not noise.** In long-running services it almost always means unbounded growth. Ship `--trace-warnings` in staging and log `process.on('warning')` in production with the `type` and `count` properties.
- **`events.on()` buffers without bound by default.** `highWaterMark` only helps for emitters implementing `pause()`/`resume()`. For high-rate sources, use a stream, which has real backpressure.
- **`captureRejections` is an application decision.** Setting `events.captureRejections = true` from a library changes behaviour for every emitter in the process, including ones the application did not create.
- **Prefer `EventTarget`'s `{ signal }` option for anything request-scoped.** One `abort()` detaches every listener registered with that signal, which eliminates the whole class of listener leaks — no `finally` blocks, no forgotten `off()` calls.
- **`EventEmitterAsyncResource` costs something per emit.** Use it where context propagation or APM attribution genuinely matters, not on a hot per-message bus.

## Exercises

1. **Prove synchronous dispatch.** Write an emitter with three listeners on one event, where the second blocks for 100 ms. Measure how long `emit()` takes and confirm the third listener runs after the block. Then convert the slow listener to defer with `setImmediate` and measure again. *Success:* you can state both timings and explain the difference in terms of the event loop.

2. **Safe error monitoring.** Build a `withErrorMetrics(emitter, name)` helper that records every `'error'` via `events.errorMonitor` without changing whether the process crashes. Write two tests: one where a regular handler exists (no crash, metric recorded) and one where it does not (crash, metric still recorded). *Success:* both tests pass, using a child process to observe the crash.

3. **Find a leak.** Write a server that adds a listener to a module-level emitter on every request and never removes it. Run 20 requests with `--trace-warnings` and use the stack trace to identify the registration site. Then fix it two ways — once with explicit `off()` in a cleanup handler, once with an `AbortSignal` on an `EventTarget`. *Success:* neither fixed version warns after 10,000 requests, and heap usage is flat.

4. **Bounded event iteration.** Using `events.on()`, consume events from a producer that emits 10,000 times per second while the consumer takes 5 ms per event. Observe memory growth. Then bound it with `highWaterMark`/`lowWaterMark` on an emitter implementing `pause()`/`resume()`. *Success:* memory stays flat in the second version, and you can state how many events were dropped or delayed.

5. **Rejection routing.** Implement a `TaskRunner extends EventEmitter` with `captureRejections: true` and a `Symbol.for('nodejs.rejection')` method that logs the failing event name and arguments, marks the runner unhealthy, and removes all listeners. Verify with an `async` listener that throws. *Success:* nothing reaches `'unhandledRejection'`, and the log line contains the event name and arguments.

## Recap

- `emit()` calls listeners synchronously, in registration order, on the caller's stack; it returns `true` only if the event had listeners, and offers no backpressure.
- The method surface has several aliases — `addListener`/`on`, `off`/`removeListener` — plus `prependListener`, `rawListeners`, `eventNames` and `listenerCount`.
- An `'error'` event with no listener throws and exits the process. Every emitter you hold needs one; `events.errorMonitor` observes errors without handling them.
- `'newListener'` fires *before* the listener is added (so the count excludes it); `'removeListener'` fires after. Together they enable lazy resource acquisition.
- The 10-listener warning is a leak heuristic, not a limit. Tune it with `emitter.setMaxListeners`, `events.defaultMaxListeners`, or `events.setMaxListeners(n, ...targets)`; find the cause with `--trace-warnings`.
- `async` listeners reject into nothing unless `captureRejections` is on, which routes the rejection to `Symbol.for('nodejs.rejection')` or to `'error'`. Never make an `'error'` handler `async`.
- `events.once()` gives you a promise (resolving to an array of arguments, rejecting on `'error'`, cancellable with `signal`); `events.on()` gives you an async iterator with `close`, `signal` and water-mark options — and buffers without bound otherwise.
- `EventEmitterAsyncResource` propagates async context to listeners, at a per-emit cost.
- Node's `EventTarget` has no propagation, no `'error'` semantics, no duplicate listeners, and — uniquely — `{ signal }` auto-removal, which is the cleanest defence against listener leaks.

## Where to go next

- [Chapter 9 — The Event Loop: Phases, Microtasks, and Starvation](09-event-loop.md) — why synchronous dispatch matters.
- [Chapter 11 — Callbacks, Promises, async/await, and `util.promisify`](11-promises-and-async.md) — unhandled rejections in depth.
- [Chapter 13 — AbortController, Signals, and Cancellation](13-abort-and-cancellation.md) — `AbortSignal` as an `EventTarget`.
- [Chapter 15 — AsyncLocalStorage and Context Propagation](15-async-context.md) — the context `EventEmitterAsyncResource` carries.
- [Chapter 18 — Streams I: Concepts, Readable, and Writable](../part3-data/18-streams-concepts.md) — emitters with backpressure.
- [Chapter 35 — HTTP/1.1 Servers](../part5-networking/35-http-servers.md) — emitters in the wild.
- Official docs: <https://nodejs.org/docs/latest/api/events.html>
