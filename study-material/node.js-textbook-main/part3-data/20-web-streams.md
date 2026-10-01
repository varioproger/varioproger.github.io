---
chapter: 20
part: "Part III — Data and Streams"
title: "Web Streams API and Interop"
level: advanced
reading_time: "32 min"
prerequisites: [16, 18, 19]
source_docs:
  - "doc/api/webstreams.md"
  - "doc/api/stream.md"
source_url: "https://nodejs.org/docs/latest/api/webstreams.html"
node_baseline: "27.0.0-pre"
---

# Chapter 20 — Web Streams API and Interop

## What you will learn

- Why Node ships two stream systems, and how to decide which one a piece of code should use.
- How to build a `ReadableStream`, `WritableStream`, and `TransformStream` from their underlying source, sink, and transformer objects.
- The reader/writer lock model — and the exact `TypeError`s you get when you fight it.
- Queuing strategies, `desiredSize`, and how web-stream backpressure differs from `highWaterMark`.
- Byte streams, BYOB readers, and the buffer-detachment trap that corrupts unrelated data.
- How to convert between the two systems with `fromWeb`/`toWeb` without losing error propagation.

## Why this matters

The moment you call `fetch()` in Node, you are holding a web stream. `response.body` is a `ReadableStream`, not a `stream.Readable`. So is `blob.stream()`. So is `fileHandle.readableWebStream()`. Meanwhile every HTTP server handler you write receives a `stream.Readable` request and a `stream.Writable` response. Real applications sit exactly on that seam: proxy a fetched response into an HTTP reply, hash an uploaded file, pipe a decompressed body into a database driver. Getting the conversion wrong means either a silent error that never propagates, or a file descriptor that stays open because cancellation did not cross the boundary.

The other reason to learn web streams is portability. Code written against `ReadableStream` runs unchanged in Node, Deno, Bun, Cloudflare Workers, and browsers. Code written against `stream.Readable` runs in Node. If you are shipping a library that parses or transforms data, that difference decides how many people can use it.

## Two systems, and when each is correct

Node's stream API dates from 2009 and was rewritten twice before settling into the form covered in Chapters 18 and 19. The WHATWG Streams Standard came later, learned from Node's mistakes, and became the streaming API for the whole JavaScript platform. Node implemented it in v16.5.0 and marked it **Stable** in v21.0.0. Both are here permanently. Neither is deprecated.

The practical rule:

- **Use Node streams** for anything touching Node's own I/O — `fs`, `net`, `http`, `child_process`, `zlib`, `crypto`. Those APIs speak `stream.Readable`/`stream.Writable` natively, they have better throughput for byte work, and `pipeline()` gives you error propagation and cleanup that web streams make you assemble yourself.
- **Use web streams** when the data already arrives as one (`fetch`, `Blob`, `Response`), when you are transferring a stream across a `MessagePort` to a worker, or when you are publishing a library that should run outside Node.
- **Convert at the boundary, once.** Do not weave the two systems together stage by stage. Pick one for the body of the pipeline and convert at the edge.

Web streams are available as globals — `ReadableStream`, `WritableStream`, `TransformStream`, both queuing strategies, the text and compression streams — and also as named exports of `node:stream/web`. Import from the module in library code; the explicit import documents the dependency and survives being run in a stripped-down environment.

## `ReadableStream`

`new ReadableStream([underlyingSource[, strategy]])`. The `underlyingSource` is a plain object of callbacks:

| Callback / field | Purpose |
|---|---|
| `start(controller)` | Runs immediately on construction. Set up resources. May return a promise. |
| `pull(controller)` | Called repeatedly while the internal queue is **not full**. If it returns a promise, it is not called again until that promise fulfills. |
| `cancel(reason)` | Called when the consumer cancels. Release resources here. |
| `type` | `'bytes'` or `undefined`. `'bytes'` opts into byte-stream mode. |
| `autoAllocateChunkSize` | Bytes mode only. When non-zero, a view buffer is automatically allocated for `controller.byobRequest`. |

The `strategy` object carries `highWaterMark` (maximum internal queue size before backpressure applies) and `size(chunk)` (how big a chunk counts as).

`pull` is the whole backpressure mechanism from the producer's side. You do not check a return value or listen for `'drain'` — you simply are not asked for more data until there is room. That inversion is the single biggest ergonomic difference from Node streams.

```mjs
import { ReadableStream } from 'node:stream/web';

function pollingStream(url, intervalMs) {
  let timer;
  return new ReadableStream({
    start(controller) {
      timer = setInterval(async () => {
        const res = await fetch(url);
        controller.enqueue(await res.json());
      }, intervalMs);
    },
    cancel(reason) {
      clearInterval(timer); // without this, the timer outlives the stream
      console.log('polling stopped:', reason);
    },
  }, { highWaterMark: 4 });
}
```

The `cancel` callback is not optional in production code. It is the only place you get told the consumer walked away, and it is where timers, sockets, and file handles must be released.

`ReadableStream.from(iterable)` (added v20.6.0) builds a stream from any sync or async iterable, which is usually less code than writing an underlying source:

```mjs
const stream = ReadableStream.from(async function* () {
  for (let i = 0; i < 3; i++) yield `chunk ${i}`;
}());
```

### The controller

`ReadableStreamDefaultController` gives you four things: `enqueue(chunk)`, `close()`, `error(err)`, and `desiredSize`. `desiredSize` is how much more the queue wants — it is the web-stream equivalent of "is `write()` still returning `true`?", and it can go **negative** when you over-enqueue. If you are enqueueing from an event handler rather than from `pull`, check it.

## `WritableStream`

`new WritableStream([underlyingSink[, strategy]])`:

| Callback | Purpose |
|---|---|
| `start(controller)` | Runs on construction. |
| `write(chunk, controller)` | Called per chunk. Return a promise to apply backpressure — the next `write` waits for it. |
| `close()` | Called on graceful close. |
| `abort(reason)` | Called on abrupt termination. |

`type` is reserved and must be `undefined`.

Backpressure here is equally implicit: return a promise from `write` and the stream stops accepting chunks until it settles. There is no `false` return value to forget.

```mjs
import { WritableStream } from 'node:stream/web';

const toDatabase = (db) => new WritableStream({
  async write(record) {
    await db.insert(record); // backpressure: next write waits for this
  },
  async close() { await db.flush(); },
  async abort(reason) { await db.rollback(reason); },
}, { highWaterMark: 8 });
```

`WritableStreamDefaultController` exposes `error(err)` and a `signal` property — an `AbortSignal` that fires when the stream is aborted. Use it to cancel the in-flight work inside `write`, which is the only way an abort can actually interrupt a slow write rather than merely waiting for it.

## `TransformStream`

`new TransformStream([transformer[, writableStrategy[, readableStrategy]]])`. A `TransformStream` is not a stream; it is a `{ readable, writable }` pair. You write to `.writable` and read from `.readable`.

| Callback | Purpose |
|---|---|
| `start(controller)` | Runs on construction. |
| `transform(chunk, controller)` | Per chunk. Call `controller.enqueue()` zero or more times. |
| `flush(controller)` | Called immediately before the writable side closes — emit buffered state here. |
| `cancel(reason)` | Called when the readable side is cancelled or the writable side aborted. Added in v21.5.0 / v20.14.0. |

Note the two separate strategies: `writableStrategy` sizes the input queue, `readableStrategy` the output queue. As with a Node `Transform`, the two sides buffer independently.

`flush` is the direct analogue of `_flush()` from Chapter 19, and forgetting it costs you the tail of your data in exactly the same way:

```mjs
import { TransformStream } from 'node:stream/web';

function splitLines() {
  let partial = '';
  return new TransformStream({
    transform(chunk, controller) {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop();
      for (const line of lines) controller.enqueue(line);
    },
    flush(controller) {
      if (partial) controller.enqueue(partial);
    },
  });
}

const lines = new Response('a\nb\nc').body
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(splitLines());

for await (const line of lines) console.log(line); // a, b, c
```

`TransformStreamDefaultController` adds `terminate()` alongside `enqueue`, `error`, and `desiredSize`. `terminate()` closes the readable side without processing the rest of the input — the right call when a parser has read everything it needs and the remaining bytes are irrelevant.

## The lock model

This is where people get stuck. A web stream can have **at most one active consumer**, enforced by a lock.

`readableStream.getReader()` locks the stream and returns a reader. While locked, `readableStream.locked` is `true` and every other consumption method throws a `TypeError`. `reader.releaseLock()` unlocks it. The same applies on the writable side: `writableStream.getWriter()` returns a `WritableStreamDefaultWriter` and sets `writableStream.locked`.

Operations that lock the stream, sometimes surprisingly:

| Operation | Lock behaviour |
|---|---|
| `getReader()` / `getWriter()` | Locks until `releaseLock()`. |
| `pipeTo(dest)` | Locks for the duration of the pipe. |
| `pipeThrough(transform)` | Locks for the duration. |
| `tee()` | Locks the original **permanently** — you consume the two branches instead. |
| `for await (const c of stream)` | Locks while the iterator is active. |
| `values([options])` | Locks while the iterator is active. |

So this fails:

```mjs
const reader = stream.getReader();
const { value } = await reader.read();
await stream.pipeTo(dest); // TypeError: stream is locked
```

And so does the more subtle version, where a `for await` loop leaves the stream locked because it exited early. By default, breaking out of a `for await` over a `ReadableStream` **cancels** it — the stream is closed, not merely released. If you want to inspect the first few chunks and then hand the stream to something else, use `values({ preventCancel: true })`:

```mjs
for await (const chunk of stream.values({ preventCancel: true })) {
  if (looksLikeHeader(chunk)) break; // stream survives
}
```

The rule that saves the most time: **release the lock in a `finally`.**

```mjs
const reader = stream.getReader();
try {
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    handle(value);
  }
} finally {
  reader.releaseLock();
}
```

Both readers and the writer expose a `closed` promise. It fulfills when the stream closes, and **rejects if the lock is released before the stream finishes closing** — a detail that produces confusing unhandled rejections if you attach `.then()` to `closed` and then release the lock in normal operation.

The writer additionally has `ready` (fulfills when the writer can accept more) and `desiredSize`. Awaiting `writer.ready` before each `write()` is the web-stream idiom for respecting backpressure when you are pushing data manually:

```mjs
const writer = writable.getWriter();
try {
  for (const record of records) {
    await writer.ready;
    await writer.write(record);
  }
  await writer.close();
} finally {
  writer.releaseLock();
}
```

## Queuing strategies

A strategy is any object with `highWaterMark` and `size(chunk)`. Node exposes two ready-made classes, both globals:

| Class | `size(chunk)` returns | Use for |
|---|---|---|
| `CountQueuingStrategy` | `1` for every chunk | Object/record streams — the queue counts items. |
| `ByteLengthQueuingStrategy` | `chunk.byteLength` | Byte streams — the queue counts bytes. |

```mjs
const records = new WritableStream(sink, new CountQueuingStrategy({ highWaterMark: 32 }));
const bytes = new WritableStream(sink, new ByteLengthQueuingStrategy({ highWaterMark: 1 << 16 }));
```

The mapping to Node's `highWaterMark` is close but not identical. In a Node stream, `highWaterMark` means bytes for byte streams and objects for object mode, and that choice is baked in by `objectMode`. In a web stream, `highWaterMark` means whatever `size()` says it means — the unit is a property of the strategy, not of the stream. That is more flexible and more error-prone: a stream created with the default strategy counts *chunks*, so a `highWaterMark` of 1 with 100 MB chunks buffers 100 MB.

The Node documentation does not state a default `highWaterMark` for web streams; the defaults come from the WHATWG standard and are small. **Pass a strategy explicitly** for anything performance-sensitive. When converting from a Node stream, `Readable.toWeb()` takes `highWaterMark` from the source `stream.Readable` if you do not supply a strategy, and defaults `size` to `1` for every chunk.

`desiredSize` on any controller or writer tells you the remaining room: `highWaterMark` minus the current queue size. Negative means you have over-enqueued.

## Byte streams and BYOB readers

A stream created with `type: 'bytes'` is a **byte stream**, and it can be read by a BYOB — "bring your own buffer" — reader, obtained with `getReader({ mode: 'byob' })`. Instead of the stream allocating a buffer and handing it to you, you supply the buffer and the stream writes into it. That removes one copy per chunk, which matters when you are moving gigabytes.

The producer side sees a `ReadableByteStreamController` with a `byobRequest` property. When a BYOB read is pending, `byobRequest.view` is the consumer's buffer; you fill it and call `byobRequest.respond(bytesWritten)`, or `respondWithNewView(view)` if you had to substitute a different view. Setting `autoAllocateChunkSize` on the underlying source makes Node allocate a view automatically so the same `pull` implementation works for both reader kinds.

```mjs
import { open } from 'node:fs/promises';
import { ReadableStream } from 'node:stream/web';

class FileSource {
  type = 'bytes';
  autoAllocateChunkSize = 65536;

  async start(controller) {
    this.file = await open('large.bin');
    this.controller = controller;
  }

  async pull(controller) {
    const view = controller.byobRequest.view;
    const { bytesRead } = await this.file.read({
      buffer: view,
      offset: view.byteOffset,
      length: view.byteLength,
    });
    if (bytesRead === 0) {
      await this.file.close();
      controller.close();
    }
    controller.byobRequest.respond(bytesRead);
  }

  async cancel() { await this.file.close(); }
}

const stream = new ReadableStream(new FileSource());
```

`byobReader.read(view[, options])` accepts a `min` option (added v21.7.0 / v20.17.0) that makes the promise wait until at least `min` elements are available instead of returning on the first byte. For a binary protocol with fixed-size headers, that turns a manual accumulation loop into a single call.

**The trap.** Do not pass a pooled `Buffer` to a BYOB read. `Buffer.allocUnsafe()`, `Buffer.from()`, and many `node:fs` callbacks return buffers that are views into a shared `ArrayBuffer` holding unrelated data. `read()` **detaches** the underlying `ArrayBuffer`, invalidating every other view onto it. You will corrupt buffers held by completely unrelated parts of your program, and the failure will surface far from the cause. Use `Buffer.alloc()` or `new Uint8Array(n)`, which own their memory.

## Connecting streams: `pipeTo`, `pipeThrough`, `tee`

`readableStream.pipeTo(destination[, options])` returns a promise that fulfills when the pipe completes. `readableStream.pipeThrough(transform[, options])` writes into `transform.writable` and returns `transform.readable`, so it chains.

Both take the same options:

| Option | Effect when `true` |
|---|---|
| `preventAbort` | Errors in the source do **not** abort the destination. |
| `preventCancel` | Errors in the destination do **not** cancel the source. |
| `preventClose` | Closing the source does **not** close the destination. |
| `signal` | An `AbortSignal` that cancels the transfer. |

The defaults are the useful part: with all three left `false`, an error anywhere tears down both ends. That is the cleanup behaviour `.pipe()` never had, and it is why `pipeTo` is closer in spirit to `pipeline()` than to `pipe()`. Set `preventClose: true` when the destination outlives this transfer — writing several sources into one output, for example.

```mjs
import { createServer } from 'node:http';
import { Writable } from 'node:stream';

createServer(async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => ac.abort()); // client hung up -> stop fetching

  const upstream = await fetch('https://example.com/big.json', { signal: ac.signal });
  res.writeHead(upstream.status, { 'content-type': 'application/json' });

  try {
    await upstream.body
      .pipeThrough(new DecompressionStream('gzip'))
      .pipeTo(Writable.toWeb(res), { signal: ac.signal });
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
  }
}).listen(3000);
```

`tee()` splits a stream into two branches receiving identical data, and locks the original permanently. It is how you hash a body while also forwarding it. The cost is memory: the branches are fed in lockstep, so if you consume one branch and ignore the other, chunks queue up for the slow branch without bound. **Consume both branches concurrently, or do not tee.**

```mjs
const [forHashing, forUpload] = response.body.tee();
await Promise.all([hash(forHashing), upload(forUpload)]);
```

The web streams API also documents `ReadableStreamTee(stream[, cloneForBranch2])` **[Experimental]** (added v26.5.0 / v24.19.0), which exposes the underlying spec operation. With `cloneForBranch2: true`, chunks going to the second branch are structured clones of the first branch's chunks, so mutating a chunk in one branch cannot affect the other. `tee()` always passes `false`. Reach for this only if you have consumers that mutate chunks in place.

## Built-in transform streams

All four are Stable and exposed as globals.

| Class | Added | Notes |
|---|---|---|
| `TextEncoderStream` | v16.6.0 | Strings in, UTF-8 `Uint8Array` out. `encoding` is always `'utf-8'`. |
| `TextDecoderStream` | v16.6.0 | Bytes in, strings out. `new TextDecoderStream([encoding[, options]])` with `encoding` defaulting to `'utf-8'`, plus `fatal` and `ignoreBOM` options. |
| `CompressionStream` | v17.0.0 | `new CompressionStream(format)`. |
| `DecompressionStream` | v17.0.0 | `new DecompressionStream(format)`. |

The `format` argument for both compression classes is one of `'deflate'`, `'deflate-raw'`, `'gzip'`, or `'brotli'`. `'deflate-raw'` was added in v21.2.0 / v20.12.0 and `'brotli'` in v24.7.0 / v22.20.0 — if you target older LTS lines, check before using them. Note what is *not* on the list: zstd. For zstd, and for any tuning of compression level or window size, use `node:zlib` (Chapter 21) — these classes take no options at all.

`TextDecoderStream` deserves special mention because it solves the multi-byte-boundary problem for free. A UTF-8 character split across two chunks is reassembled correctly, which is precisely the bug that `chunk.toString()` in a Node `Transform` introduces.

## Converting between the two systems

Six static methods, all on `node:stream` classes, all marked **stable in v24.0.0 / v22.17.0**:

| Method | Direction | Key options |
|---|---|---|
| `stream.Readable.fromWeb(readableStream[, options])` | web → Node | `encoding`, `highWaterMark`, `objectMode`, `signal` |
| `stream.Readable.toWeb(streamReadable[, options])` | Node → web | `strategy` (`highWaterMark`, `size`), `type: 'bytes'` |
| `stream.Writable.fromWeb(writableStream[, options])` | web → Node | `decodeStrings`, `highWaterMark`, `objectMode`, `signal` |
| `stream.Writable.toWeb(streamWritable)` | Node → web | none |
| `stream.Duplex.fromWeb(pair[, options])` | web → Node | `allowHalfOpen`, `decodeStrings`, `encoding`, `highWaterMark`, `objectMode`, `signal` |
| `stream.Duplex.toWeb(streamDuplex[, options])` | Node → web | `readableType: 'bytes'` |

`Duplex.fromWeb()` takes a `{ readable, writable }` pair — the same shape a `TransformStream` has, which means a `TransformStream` converts directly into a Node `Duplex`. `Duplex.toWeb()` returns a `{ readable, writable }` object. On `Duplex.toWeb()`, `readableType` was added in v25.7.0 / v24.15.0 and supersedes `type`, which is now a **[Deprecated]** alias; use `readableType` in new code.

The `type: 'bytes'` option on `Readable.toWeb()` (added v25.4.0 / v24.14.0) is worth knowing: without it you get a default (non-byte) `ReadableStream`, and consumers that want a BYOB reader will fail.

Putting it together — hashing a fetched body with Node's `crypto`, which speaks Node streams:

```mjs
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const res = await fetch('https://example.com/release.tar.gz');
const hash = createHash('sha256');

await pipeline(
  Readable.fromWeb(res.body),   // convert once, at the edge
  hash,
);

console.log(hash.digest('hex'));
```

Note that `pipeline()` itself accepts `ReadableStream`, `WritableStream`, and `TransformStream` directly (support added in v19.7.0 / v18.16.0), as does `compose()` and `finished()`. Explicit conversion is still clearer when you want to control `highWaterMark` or pass a `signal`.

`node:stream/consumers` works on both systems, which makes it the least fussy way to buffer a stream:

```mjs
import { json, text, bytes } from 'node:stream/consumers';

const config = await json(fileHandle.readableWebStream()); // web stream
const body = await text(req);                              // Node stream
```

`arrayBuffer`, `blob`, `buffer`, `json`, and `text` were added in v16.7.0; `bytes` (returning a `Uint8Array`) in v25.6.0 / v24.14.0. Every one of them buffers the whole stream into memory — never point them at untrusted input without a size limit enforced upstream.

## Where web streams appear in practice

- **`fetch()`** — `response.body` is a `ReadableStream` (or `null` for empty bodies). Reading it is the only way to stream a large response instead of buffering it with `.json()` or `.text()`.
- **`Blob.stream()`** (v16.7.0) — returns a `ReadableStream` over the blob's contents.
- **`fileHandle.readableWebStream([options])`** (v17.0.0, stable in v24.0.0 / v22.17.0) — a byte-oriented `ReadableStream` over an open file. It takes `autoClose`, default `false`: unless you set it, **you must still call `fileHandle.close()` yourself** after the stream finishes. It also throws if called twice on the same handle.
- **`postMessage()` transfer** — `ReadableStream`, `WritableStream`, and `TransformStream` are transferable across a `MessagePort`, so you can hand a stream to a worker thread. Node streams are not transferable.

## Node streams vs web streams

| Dimension | Node streams | Web streams |
|---|---|---|
| Availability | Node only | Node, browsers, Deno, Bun, Workers |
| Backpressure signal | `write()` returns `false`, `'drain'` event | `pull` not called; awaited `write` promise; `writer.ready` |
| Error propagation | Manual, unless you use `pipeline()` | Built into `pipeTo`/`pipeThrough` by default |
| Cleanup on failure | `pipeline()` destroys every unfinished stream | `pipeTo` aborts/cancels both ends unless prevented |
| Cancellation | `signal` option on `pipeline()`, `addAbortSignal()` | `signal` option on `pipeTo`/`pipeThrough`, `cancel()` |
| Multiple consumers | Multiple `.pipe()` destinations allowed | One consumer; use `tee()` |
| Throughput | Higher for bytes; deeply optimised, `writev` support | Extra promise per chunk; BYOB recovers some of it |
| Object/record support | First-class (`objectMode`) | Any value can be a chunk; strategy defines size |
| Ecosystem | Every Node core module and most npm packages | `fetch`, `Blob`, `Response`, WHATWG-based libraries |
| Transfer to workers | Not transferable | Transferable via `postMessage` |
| Line/text handling | `StringDecoder`, manual | `TextDecoderStream` handles boundaries |

Short version: Node streams for Node-native I/O and throughput, web streams for portability and standards interop, and one explicit conversion at the boundary.

## Common mistakes

### ❌ Forgetting to release a reader's lock

```mjs
const reader = res.body.getReader();
const { value } = await reader.read();
if (looksWrong(value)) return;         // early return, lock never released
await res.body.pipeTo(dest);           // TypeError: locked
```

The stream stays locked for as long as the reader exists. Any later `pipeTo`, `tee`, or `for await` throws `TypeError`, and because the stream is neither closed nor cancelled, the underlying resource is never released either.

✅ Release in `finally`, or avoid manual readers entirely:

```mjs
const reader = res.body.getReader();
try {
  const { value } = await reader.read();
  if (looksWrong(value)) return;
} finally {
  reader.releaseLock();
}
await res.body.pipeTo(dest);
```

### ❌ Passing a pooled `Buffer` to a BYOB read

```mjs
const reader = stream.getReader({ mode: 'byob' });
const { value } = await reader.read(Buffer.allocUnsafe(4096)); // shared ArrayBuffer
```

`Buffer.allocUnsafe()` and `Buffer.from()` carve views out of a shared pool. `read()` detaches the underlying `ArrayBuffer`, so every other `Buffer` sharing that pool becomes invalid — including buffers held by unrelated modules. The corruption appears somewhere else entirely.

✅ Use memory you own:

```mjs
const { value } = await reader.read(new Uint8Array(4096));
// or Buffer.alloc(4096), which is not pooled
```

### ❌ Teeing and consuming the branches sequentially

```mjs
const [a, b] = response.body.tee();
await drain(a);       // b buffers the entire body in memory
await drain(b);
```

`tee()` feeds both branches from the same source. While you drain `a`, every chunk is also queued for `b`, with no upper bound. A 4 GB response becomes 4 GB of heap.

✅ Consume both at once so backpressure applies to the slower branch:

```mjs
const [a, b] = response.body.tee();
await Promise.all([drain(a), drain(b)]);
```

### ❌ Assuming `.json()` or `text()` is safe on a remote body

```mjs
const data = await (await fetch(userSuppliedUrl)).json(); // unbounded
```

Every buffering consumer — `Response.json()`, `stream/consumers`, `arrayBuffer()` — reads until the stream ends. A hostile or merely broken server can stream forever and exhaust your heap.

✅ Bound the read yourself with a counting transform that errors past a limit:

```mjs
function limitBytes(max) {
  let total = 0;
  return new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > max) throw new Error(`response exceeded ${max} bytes`);
      controller.enqueue(chunk);
    },
  });
}

const body = (await fetch(userSuppliedUrl)).body.pipeThrough(limitBytes(10 << 20));
```

## Production notes

- **Web streams cost one promise per chunk.** Every `read()` allocates and resolves a promise, and the microtask queue does real work per chunk. For byte-heavy pipelines this is measurably slower than Node streams. Mitigate with larger chunks (a bigger `highWaterMark` on the Node side before `toWeb`), or with BYOB reads that avoid the extra copy, or by keeping the pipeline in Node streams and converting only at the edge.
- **The default strategy counts chunks, not bytes.** A `WritableStream` with no strategy will happily queue several very large chunks. For any byte pipeline, pass `new ByteLengthQueuingStrategy({ highWaterMark: 65536 })` so the queue is bounded in the unit you actually care about.
- **Cancellation must cross the boundary.** `Readable.fromWeb()` and `Writable.fromWeb()` accept a `signal`; `pipeTo` and `pipeThrough` accept a `signal`. Wire the same `AbortController` through both halves. A pipeline where the Node half is abortable and the web half is not will keep the upstream socket open after the client disconnects.
- **`readableWebStream()` does not close the file handle by default.** `autoClose` defaults to `false`. Under load, forgetting it is a straight path to `EMFILE`. Set `autoClose: true` or close the handle in a `finally`.
- **Do not tee without a memory budget.** Teeing a large body and processing the branches at different rates is one of the easiest ways to double or triple peak RSS. If the branches are inherently unbalanced — hashing versus a slow upload — buffer to disk instead.
- **Prefer `node:stream/web` imports in libraries.** Globals are convenient but the explicit import makes the dependency legible to bundlers and to readers, and it fails loudly rather than silently on a runtime that lacks the global.
- **Web streams transfer to workers; Node streams do not.** If your architecture moves decode or parse work to a worker thread (Chapter 29), doing it with a transferred `ReadableStream` avoids copying the payload through the message channel.

## Exercises

1. **Build a rate-limited `ReadableStream`.** Emit one chunk per 100 ms from an array, with a `cancel` handler that clears the timer. *Success:* breaking out of a `for await` loop over it stops the timer, verified by the process exiting immediately.

2. **Write a CSV-to-JSON `TransformStream`.** Bytes in, objects out, using `TextDecoderStream` upstream. Handle rows split across chunks and emit the final row from `flush`. *Success:* it produces identical output for the same file split into 1-byte chunks and into one big chunk.

3. **Convert both ways and prove errors propagate.** Build a pipeline: `fetch` → `Readable.fromWeb` → `pipeline()` → a `Writable` that throws on the third chunk. *Success:* the promise rejects with your error, and the `fetch` is aborted rather than continuing to download.

4. **Implement a byte stream with a BYOB reader.** Serve a file through `type: 'bytes'` with `autoAllocateChunkSize`, read it with `getReader({ mode: 'byob' })` using the `min` option to read fixed 512-byte records. *Success:* output matches `readFile`, and no pooled `Buffer` is ever passed to `read()`.

5. **Benchmark the seam.** Copy a 1 GB file three ways: pure Node streams with `pipeline()`, pure web streams with `pipeTo`, and Node-to-web-to-Node with conversions in the middle. Measure wall time and peak RSS. *Success:* a written explanation of the ranking, including the effect of raising `highWaterMark` on each.

## Recap

- Web streams (`node:stream/web`, also globals) are Stable since v21.0.0 and are the portable standard; Node streams remain the right choice for Node-native I/O.
- An underlying source's `pull` is only called when there is queue room — that is web-stream backpressure, and it needs no return-value checks.
- `TransformStream` is a `{ readable, writable }` pair with independent queues and its own `flush` for trailing state.
- Only one consumer at a time: `getReader`, `pipeTo`, `pipeThrough`, `tee`, and `for await` all lock the stream. Release locks in `finally`.
- Strategies define the queue's unit: `CountQueuingStrategy` counts chunks, `ByteLengthQueuingStrategy` counts bytes. Pass one explicitly.
- BYOB readers avoid a copy but detach the buffer you pass — never hand them a pooled `Buffer`.
- `pipeTo`/`pipeThrough` clean up both ends on error by default; `preventClose`, `preventAbort`, and `preventCancel` opt out; `signal` cancels.
- `CompressionStream`/`DecompressionStream` support `'deflate'`, `'deflate-raw'`, `'gzip'`, and `'brotli'` and take no tuning options; use `node:zlib` when you need control.
- The six `fromWeb`/`toWeb` methods on `Readable`, `Writable`, and `Duplex` are stable since v24.0.0 / v22.17.0 — convert once, at the boundary.

## Where to go next

- [Chapter 19 — Streams II: Duplex, Transform, pipeline, and Backpressure](../part3-data/19-streams-advanced.md) for `pipeline()` and the Node-side model.
- [Chapter 21 — Compression with zlib](../part3-data/21-zlib.md) for tunable compression beyond `CompressionStream`.
- [Chapter 17 — Character Encodings, StringDecoder, and Intl](../part3-data/17-encodings.md) for what `TextDecoderStream` does under the hood.
- [Chapter 36 — HTTP/1.1 Clients, Agents, and Keep-Alive](../part5-networking/36-http-clients.md) for `fetch` and response bodies in context.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) for transferring streams across threads.
- Official documentation: <https://nodejs.org/docs/latest/api/webstreams.html>
