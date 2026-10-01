---
chapter: 21
part: "Part III — Data and Streams"
title: "Compression with zlib"
level: intermediate
reading_time: "33 min"
prerequisites: [16, 18, 19]
source_docs:
  - "doc/api/zlib.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/zlib.html"
node_baseline: "27.0.0-pre"
---

# Chapter 21 — Compression with zlib

## What you will learn

- Which compression algorithms Node ships, and how to pick one for a given job.
- When to use a streaming class, a one-shot convenience method, or a `*Sync` variant — and what each costs.
- What every tuning option actually does, so you can trade CPU for ratio deliberately.
- How to negotiate `Content-Encoding` correctly on both the server and the client side.
- Why async `zlib` calls compete with `fs` and `crypto` for the libuv threadpool, and how to size it.
- How to bound decompression so a 4 GB "zip bomb" cannot take your process down.

## Why this matters

Compression is the cheapest performance win in most web applications and the easiest way to accidentally destroy one. A JSON API response typically shrinks by 70–90% under gzip, which turns a 2 MB payload into 250 KB and cuts the transfer time on a mobile connection from seconds to milliseconds. That is why every HTTP client on earth sends `Accept-Encoding: gzip`.

The failure modes are equally dramatic. `zlib.gzipSync()` on a request path blocks the event loop for as long as compression takes — with Brotli at its default quality of 11, that can be hundreds of milliseconds per megabyte, during which your server answers nothing at all. Async zlib calls occupy the same four libuv threads that `fs` uses, so a compression-heavy endpoint quietly starves every file read in the process. And decompressing an attacker-supplied body with no output limit is a one-line denial of service: 10 KB of input can expand into gigabytes. This chapter covers the tuning knobs, the concurrency model, and the limits.

## What Node ships

`node:zlib` is **Stable**. It bundles four algorithm families plus a ZIP archive API.

| Family | Streaming classes | Factory | One-shot | HTTP token | Status |
|---|---|---|---|---|---|
| gzip | `Gzip` / `Gunzip` | `createGzip()` / `createGunzip()` | `gzip()` / `gunzip()` | `gzip` | Stable |
| zlib deflate | `Deflate` / `Inflate` | `createDeflate()` / `createInflate()` | `deflate()` / `inflate()` | `deflate` | Stable |
| raw deflate | `DeflateRaw` / `InflateRaw` | `createDeflateRaw()` / `createInflateRaw()` | `deflateRaw()` / `inflateRaw()` | — | Stable |
| Brotli | `BrotliCompress` / `BrotliDecompress` | `createBrotliCompress()` / `createBrotliDecompress()` | `brotliCompress()` / `brotliDecompress()` | `br` | Stable |
| Zstandard | `ZstdCompress` / `ZstdDecompress` | `createZstdCompress()` / `createZstdDecompress()` | `zstdCompress()` / `zstdDecompress()` | `zstd` | **[Experimental]** |
| auto-detect | `Unzip` | `createUnzip()` | `unzip()` | — | Stable |

Zstd arrived in v23.8.0 / v22.15.0 and the whole Zstd surface — classes, factories, `ZstdOptions`, constants — carries **Stability 1 - Experimental**. It works, and it is genuinely good, but the API may still change.

`Unzip` deserves a note: it auto-detects a gzip or deflate header and picks the right decompressor. That makes it convenient for handling responses whose `Content-Encoding` you do not trust, and slightly slower than naming the algorithm you know you have.

Node 26 also added a ZIP archive API — `ZipBuffer`, `ZipFile`, `ZipEntry`, `createZipArchive()`, `zipFiles()` — at **Stability 1.0 - Early development**. It emits an experimental warning the first time you use any part of it (merely importing `node:zlib` does not). It is out of scope here except for one security control covered below.

There is also `node:zlib/iter` **[Experimental]** (v25.9.0), providing `compressGzip()`, `decompressBrotli()`, and friends for the iterable streams API from Chapter 19. It is only available under `--experimental-stream-iter`.

### Choosing an algorithm

| Algorithm | Ratio | Compress speed | Decompress speed | Use it for |
|---|---|---|---|---|
| deflate / gzip | Baseline | Fast | Very fast | Default for HTTP. Universally supported. |
| Brotli, quality 4–6 | Better than gzip | Comparable to gzip | Fast | Dynamic HTTP responses when clients send `br`. |
| Brotli, quality 11 | Best | Very slow | Fast | Build-time compression of static assets. |
| Zstd | Near Brotli | Very fast | Very fast | Internal RPC, logs, storage. Client support is thin. |
| deflateRaw | Same as deflate | Same | Same | Embedding in container formats that supply their own framing. |

The three formats differ only in framing. `gzip` adds a 10-byte header and a CRC-32 trailer; `deflate` adds a 2-byte zlib header and an Adler-32 trailer; `deflateRaw` adds nothing. If you are storing compressed blobs inside your own format, `deflateRaw` saves the bytes and gives up the integrity check.

A rule that matters more than the choice: **never compress already-compressed data.** JPEG, PNG, MP4, and anything already gzipped will come out roughly the same size or slightly larger, and you will have paid full CPU cost for nothing.

## Three ways to call it

### Streaming classes — the default

Every compressor is a `Transform` stream (Chapter 19), so it drops into a pipeline and honours backpressure:

```mjs
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';

await pipeline(
  createReadStream('access.log'),
  createGzip({ level: 6 }),
  createWriteStream('access.log.gz'),
);
```

Memory stays bounded regardless of file size. This is the right shape for anything you did not personally allocate.

### Convenience methods — for small, known-size buffers

`zlib.gzip(buffer[, options], callback)` and its dozen siblings take a `Buffer`, `TypedArray`, `DataView`, `ArrayBuffer`, or string and call back with the whole result. They run on the libuv threadpool, so they do not block the event loop, but they hold both the input and the entire output in memory.

```mjs
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const packed = await gzipAsync(JSON.stringify(config));
const original = JSON.parse((await gunzipAsync(packed)).toString());
```

Use these when the input is small and its size is known — a cached API response, a config blob, a message payload. The `maxOutputLength` option only applies to these methods, which is a good reason to prefer them for untrusted input over hand-rolled streaming.

### `*Sync` — rarely, and never on a request path

Every convenience method has a `*Sync` counterpart with the same arguments and no callback. Synchronous compression blocks the event loop for its entire duration: no timers fire, no sockets are read, no other request is served.

Legitimate uses: CLI tools, build scripts, and module initialization that runs once before the server starts listening. Everything else should be async.

```mjs
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// Build script: blocking is fine, nothing else is running.
writeFileSync('dist/bundle.js.gz', gzipSync(bundleSource, { level: 9 }));
```

## Tuning: the options object

Every zlib-based class accepts the same `Options` object. No option is required.

| Option | Type | Default | What it does |
|---|---|---|---|
| `flush` | integer | `Z_NO_FLUSH` | Flush mode used for ordinary writes. |
| `finishFlush` | integer | `Z_FINISH` | Flush mode for the final chunk. |
| `chunkSize` | integer | `16 * 1024` | Size of the internal output slab. Larger means fewer calls into zlib. |
| `windowBits` | integer | 15 | log2 of the history window. Bigger window, better ratio, more memory. |
| `level` | integer | 6 (`Z_DEFAULT_COMPRESSION`) | 0–9. Compression only. |
| `memLevel` | integer | 8 | 1–9. Memory for the internal compression state. Compression only. |
| `strategy` | integer | `Z_DEFAULT_STRATEGY` | Algorithm hint for unusual data. Compression only. |
| `dictionary` | Buffer/TypedArray/DataView/ArrayBuffer | empty | Preset dictionary. deflate/inflate only. |
| `info` | boolean | `false` | Return `{ buffer, engine }` instead of just the buffer. |
| `maxOutputLength` | integer | `buffer.kMaxLength` | Caps output size — **convenience methods only**. |
| `rejectGarbageAfterEnd` | boolean | `false` | Fail if input remains after the compressed stream ends. Added v26.5.0 / v24.19.0. |

**`level`** is the knob that matters most. It affects speed dramatically and ratio modestly. Levels 1–3 are fast and give most of the benefit; 6 is the default and a sensible middle; 9 costs several times the CPU of 6 for a small percentage of extra ratio. For dynamic HTTP responses, level 4–6 is the usual sweet spot. For static assets compressed once at build time, use 9.

**`strategy`** matters only for data that does not look like text. `Z_RLE` is tuned for run-length-ish data such as PNG image rows; `Z_HUFFMAN_ONLY` disables string matching entirely; `Z_FILTERED` suits data produced by a filter with small, mostly-random values; `Z_FIXED` disables dynamic Huffman codes for simpler, more predictable output. Leave it at `Z_DEFAULT_STRATEGY` unless you have measured a win.

**`dictionary`** is the biggest available win for many small, similar payloads. Compressing 200-byte JSON messages individually is nearly pointless — there is not enough repetition inside one message to exploit. Prime the compressor with a dictionary containing your common key names and the ratio improves substantially. Both sides must use the identical dictionary; a mismatch produces a decompression error.

**`rejectGarbageAfterEnd`** is a correctness and security control. By default, `Gunzip` accepts multiple concatenated gzip members (that behaviour arrived in v5.9.0), and other decompressors ignore some trailing input. Setting this to `true` makes trailing bytes an error — which is what you want when you are validating a payload rather than concatenating logs.

### Memory per stream

The documented formula for a deflate (compression) stream is:

```js
(1 << (windowBits + 2)) + (1 << (memLevel + 9));
```

With the defaults of `windowBits: 15` and `memLevel: 8`, that is 128 KiB + 128 KiB = **256 KiB per compression stream**, plus a few kilobytes of small objects, plus one internal output slab of `chunkSize` (16 KiB by default).

Inflate (decompression) needs `1 << windowBits`, which is **32 KiB** at the default, plus the same `chunkSize` slab.

Dropping to `{ windowBits: 14, memLevel: 7 }` halves the compression footprint to 128 KiB, at some cost in ratio. That trade is worth making when you have thousands of concurrent streams, and pointless when you have ten.

Do the arithmetic before you deploy: 1,000 concurrent gzip responses at default settings is about 270 MB of native memory that does not appear in your V8 heap statistics and will not be visible in a heap snapshot. It shows up only as RSS.

## Brotli parameters

Brotli does not use `level` and `memLevel`. It takes a `params` object keyed by constants:

| Parameter | Values | Default | Notes |
|---|---|---|---|
| `BROTLI_PARAM_MODE` | `BROTLI_MODE_GENERIC`, `BROTLI_MODE_TEXT`, `BROTLI_MODE_FONT` | `BROTLI_MODE_GENERIC` | `TEXT` is tuned for UTF-8; `FONT` for WOFF 2.0. |
| `BROTLI_PARAM_QUALITY` | `BROTLI_MIN_QUALITY`–`BROTLI_MAX_QUALITY` | `BROTLI_DEFAULT_QUALITY` (11) | The single most important setting. |
| `BROTLI_PARAM_SIZE_HINT` | integer | `0` (unknown) | Expected input size; improves the encoder's decisions. |
| `BROTLI_PARAM_LGWIN` | `BROTLI_MIN_WINDOW_BITS`–`BROTLI_MAX_WINDOW_BITS` | `BROTLI_DEFAULT_WINDOW` | log2 window size. Maps to zlib's `windowBits`. |
| `BROTLI_PARAM_LGBLOCK` | `BROTLI_MIN_INPUT_BLOCK_BITS`–`BROTLI_MAX_INPUT_BLOCK_BITS` | — | Input block size, log2. |
| `BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING` | boolean | — | Trades ratio for decompression speed. |
| `BROTLI_PARAM_LARGE_WINDOW` | boolean | — | "Large Window Brotli". **Not compatible with RFC 7932** — do not send this over HTTP. |
| `BROTLI_PARAM_NPOSTFIX` / `BROTLI_PARAM_NDIRECT` | see docs | — | Advanced distance-encoding tuning. |

**The default quality of 11 is the trap.** It is designed for offline compression of assets you will serve thousands of times. Using it for a dynamic response can cost hundreds of milliseconds of CPU per megabyte. Node's own experimental `node:zlib/iter` module makes the point explicitly: its Brotli transform defaults to quality **6**, not 11, and its gzip transform to level **4**, not 6, because "these choices match common HTTP server configurations."

```mjs
import { createBrotliCompress, constants } from 'node:zlib';

// Dynamic responses: fast enough to sit on a request path.
const dynamic = createBrotliCompress({
  params: {
    [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    [constants.BROTLI_PARAM_QUALITY]: 5,
    [constants.BROTLI_PARAM_SIZE_HINT]: estimatedBytes,
  },
});

// Build time: compress once, serve forever.
const static_ = createBrotliCompress({
  params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
});
```

Always set `BROTLI_PARAM_SIZE_HINT` when you know the size. It is free and it measurably improves the result.

## Zstd parameters **[Experimental]**

Zstd also uses `params`. The essentials:

| Parameter | Notes |
|---|---|
| `ZSTD_c_compressionLevel` | Default is `ZSTD_CLEVEL_DEFAULT` == 3. Maps to zlib's `level`. |
| `ZSTD_c_strategy` | One of `ZSTD_fast`, `ZSTD_dfast`, `ZSTD_greedy`, `ZSTD_lazy`, `ZSTD_lazy2`, `ZSTD_btlazy2`, `ZSTD_btopt`, `ZSTD_btultra`, `ZSTD_btultra2`. |
| `ZSTD_c_windowLog` | Maps to zlib's `windowBits`. |
| `ZSTD_d_windowLogMax` | **Decompressor.** Refuses to allocate a window larger than 2^n. A direct defence against hostile input. |

Zstd additionally supports `pledgedSrcSize` at the top level of the options object: the expected total uncompressed size, as a non-negative safe integer. If the real input does not match, compression fails with `ZSTD_error_srcSize_wrong`. That is a useful integrity check when you are compressing a file whose size you already stat'd.

```mjs
import { createZstdCompress, constants } from 'node:zlib';
import { stat } from 'node:fs/promises';

const { size } = await stat('payload.bin');
const compressor = createZstdCompress({
  pledgedSrcSize: size,
  params: { [constants.ZSTD_c_compressionLevel]: 10 },
});
```

## HTTP `Content-Encoding`, end to end

### The server

Two rules the simplified doc examples do not cover: parse `Accept-Encoding` properly, and send `Vary`.

A substring test for `gzip` matches `gzip;q=0`, which means *"do not send me gzip."* A real parser reads the quality values.

```mjs
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip, createBrotliCompress, constants } from 'node:zlib';

function negotiate(header = '') {
  const offers = new Map();
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (!name) continue;
    const q = params
      .map((p) => p.trim())
      .find((p) => p.startsWith('q='));
    offers.set(name.toLowerCase(), q ? Number(q.slice(2)) : 1);
  }
  for (const candidate of ['br', 'gzip']) {
    if ((offers.get(candidate) ?? 0) > 0) return candidate;
  }
  return 'identity';
}

createServer(async (req, res) => {
  const encoding = negotiate(req.headers['accept-encoding']);
  const source = createReadStream('./report.json');

  // Vary is mandatory: caches must not serve a gzipped body to a client
  // that did not ask for one.
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Type', 'application/json');

  let compressor = null;
  if (encoding === 'br') {
    res.setHeader('Content-Encoding', 'br');
    compressor = createBrotliCompress({
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    });
  } else if (encoding === 'gzip') {
    res.setHeader('Content-Encoding', 'gzip');
    compressor = createGzip({ level: 5 });
  }

  res.writeHead(200);

  try {
    await (compressor
      ? pipeline(source, compressor, res)
      : pipeline(source, res));
  } catch (err) {
    // The 200 and some bytes are already on the wire; the only honest
    // move is to kill the response so the client sees a truncated body.
    console.error('response failed:', err);
    res.destroy();
  }
}).listen(3000);
```

Note what happens on failure. Once you have written headers and body bytes, you cannot retract them. Destroying the response is the correct behaviour: a truncated chunked response is detectable by the client, whereas silently ending it looks like success.

Never set `Content-Length` on a compressed response unless you compressed the whole body first and measured it. The compressed length is not the source length.

### The client

`Accept-Encoding` must match what you can actually decode, and you must handle the case where the server ignores you and sends something else — or nothing.

```mjs
import { request } from 'node:https';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createBrotliDecompress, createInflate } from 'node:zlib';
import { text } from 'node:stream/consumers';

function decoderFor(encoding) {
  switch ((encoding || 'identity').toLowerCase()) {
    case 'br': return createBrotliDecompress();
    case 'gzip': return createGunzip();
    case 'deflate': return createInflate();
    case 'identity': return null;
    default: throw new Error(`unsupported content-encoding: ${encoding}`);
  }
}

const body = await new Promise((resolve, reject) => {
  request('https://example.com/report.json', {
    headers: { 'accept-encoding': 'br, gzip' },
  }, (res) => {
    const decoder = decoderFor(res.headers['content-encoding']);
    resolve(decoder ? text(res.pipe(decoder)) : text(res));
  }).on('error', reject).end();
});
```

If you use `fetch()`, Node's implementation negotiates and decodes for you — `response.text()` returns plain text regardless of the wire encoding. Manual decoding is for `node:http`/`node:https`, or when you need the compressed bytes themselves.

## The threadpool

Every `zlib` API **except the explicitly synchronous ones** runs on libuv's threadpool. So do all `fs` operations (except watchers), `dns.lookup()`, and the async `crypto` functions such as `pbkdf2()`, `scrypt()`, `randomBytes()`, and `generateKeyPair()`.

The threadpool has **four threads by default**. It is a fixed-size, shared, process-wide resource.

The consequence is direct: four concurrent Brotli compressions at quality 11 occupy the entire pool. Every `fs.readFile()` in your process — including ones inside dependencies you have never read — queues behind them. Latency on completely unrelated endpoints goes up, and nothing in your metrics points at compression.

`UV_THREADPOOL_SIZE` raises the limit:

```bash
UV_THREADPOOL_SIZE=16 node server.js
```

Two caveats. Setting it from inside the process via `process.env.UV_THREADPOOL_SIZE` is **not guaranteed to work**, because the pool is created during runtime initialization, long before your code runs. Set it in the environment, in your container spec, or in a wrapper script. And raising it is not free: each thread is a real OS thread, and more threads than cores just adds contention. Size it against your core count and your actual concurrency, then measure.

The other threadpool-adjacent warning is memory fragmentation. Creating tens of thousands of zlib objects at once — a `for` loop firing `zlib.deflate()` 30,000 times without waiting — can cause significant memory fragmentation depending on how the OS allocator behaves. Bound your concurrency, and cache compression results rather than recomputing them.

## Bounding decompression: the zip-bomb problem

Compression ratios are unbounded in principle. A file of 10 million zero bytes gzips to about 10 KB — a ratio of roughly 1000:1. An attacker who can make you decompress arbitrary input can turn a small upload into a heap exhaustion. This is not theoretical; it is one of the oldest denial-of-service techniques there is.

Node gives you four controls.

**1. `maxOutputLength` on the convenience methods.** This is the simplest defence, and it is the reason to prefer `gunzip()` over a hand-rolled stream for untrusted payloads.

```mjs
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(gunzip);

async function safeGunzip(buf, limitBytes = 8 * 1024 * 1024) {
  try {
    return await gunzipAsync(buf, { maxOutputLength: limitBytes });
  } catch (err) {
    // Any failure here — over-limit or malformed input — means reject
    // the payload. Log err.code so you can distinguish them in practice.
    throw new Error(`cannot decompress payload: ${err.code ?? err.message}`);
  }
}
```

The default is `buffer.kMaxLength` — effectively no limit. Always set it explicitly for input you did not produce.

**2. A counting transform for streams.** `maxOutputLength` does not apply to streaming decompression, so enforce the budget yourself:

```mjs
import { Transform } from 'node:stream';

export function limitBytes(max) {
  let total = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length;
      if (total > max) {
        callback(new Error(`decompressed output exceeded ${max} bytes`));
        return;
      }
      callback(null, chunk);
    },
  });
}

// Place it immediately after the decompressor.
await pipeline(
  uploadStream,
  createGunzip(),
  limitBytes(50 * 1024 * 1024),
  parseRecords(),
  sink,
);
```

Because `pipeline()` destroys every stream when any stage errors (Chapter 19), the decompressor stops the instant the limit trips. No further input is read and no further output is produced.

**3. Decoder window limits.** For Zstd, `ZSTD_d_windowLogMax` refuses to allocate a decompression window larger than 2^n, capping memory regardless of what the input's header claims it needs.

**4. `setMaxZipContentSize()`** for the experimental ZIP API. `zlib.getMaxZipContentSize()` returns the current ceiling applied by `zipEntry.content()` when no explicit `maxSize` is given; the default is `268435456` (256 MiB). An archive whose central directory declares a member larger than the ceiling is rejected **before** memory is allocated for it. Streaming reads via `zipEntry.contentIterator()` and `zipFile.stream()` are bounded-memory by design and are unaffected by this setting.

Also enforce a limit on the **compressed** side. A limit on output alone still lets an attacker make you burn CPU on gigabytes of input.

## Flushing

Compression algorithms buffer. They have to: matching a string against earlier data is what compression *is*, so the encoder holds bytes back hoping for a better match. For a file that is exactly right. For a live event stream it means your data sits in the encoder for an unbounded time.

`compressor.flush([kind, ]callback)` forces out everything currently possible. The default `kind` is `Z_FULL_FLUSH` for zlib-based streams and `BROTLI_OPERATION_FLUSH` for Brotli-based ones.

Two important qualifications from the docs. First, "don't call this frivolously" — every flush ends a compressed block and resets some of the encoder's context, so a flush after every small write can make output *larger* than the input. Second, `flush()` only flushes zlib's internal state; it behaves like a normal `write()`, queued behind pending writes, and produces output only when the stream is being read.

The streaming-response pattern:

```mjs
import { createServer } from 'node:http';
import { pipeline } from 'node:stream';
import { createGzip } from 'node:zlib';

createServer((req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'content-encoding': 'gzip',
    'vary': 'accept-encoding',
  });

  const gzip = createGzip();
  let timer;

  pipeline(gzip, res, (err) => {
    clearInterval(timer);
    if (err) console.error(err);
  });

  timer = setInterval(() => {
    gzip.write(`data: ${Date.now()}\n\n`, () => {
      gzip.flush(); // without this the client may wait indefinitely
    });
  }, 1000);
}).listen(3000);
```

Flush once per logical message, in the write callback — not after every `write()` call in a burst.

### `Z_SYNC_FLUSH` and truncated input

The other flush constant you will meet is `Z_SYNC_FLUSH`, used as `finishFlush` rather than as an argument to `flush()`. By default, zlib **throws when decompressing truncated data**, because `finishFlush` is `Z_FINISH` and a truncated stream never reaches a valid end. If you deliberately want to inspect the beginning of a partial file, override it:

```mjs
import { unzip, constants } from 'node:zlib';

// For Brotli use BROTLI_OPERATION_FLUSH; for Zstd, ZSTD_e_flush.
unzip(truncated, { finishFlush: constants.Z_SYNC_FLUSH }, (err, out) => {
  if (err) throw err;
  console.log(out.toString()); // whatever decoded before the data ran out
});
```

This suppresses only the truncation error. Invalid formats still throw. And you lose the ability to tell "the input ended early" from "the input was complete" — the integrity check is skipped, so **you must validate the result yourself**. Do not use this as a general-purpose way to make decompression errors go away.

`zlib.crc32(data[, value])` (v22.2.0 / v20.15.0) gives you a CRC-32 for your own integrity checks. It is for detecting transmission errors, not for authentication — use HMAC from `node:crypto` (Chapter 41) for that.

## Common mistakes

### ❌ Using a `*Sync` method on a request path

```mjs
app.get('/report', (req, res) => {
  const body = gzipSync(JSON.stringify(bigReport)); // blocks everything
  res.setHeader('Content-Encoding', 'gzip');
  res.end(body);
});
```

The event loop is frozen for the entire compression. At 50 ms per call and 20 requests per second, your server spends 100% of its time compressing and 0% accepting connections. Latency percentiles collapse.

✅ Stream it, or use the async form:

```mjs
app.get('/report', async (req, res) => {
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Vary', 'Accept-Encoding');
  await pipeline(Readable.from([JSON.stringify(bigReport)]), createGzip(), res);
});
```

### ❌ Substring-matching `Accept-Encoding`

```mjs
if (req.headers['accept-encoding'].includes('gzip')) {
  // matches "gzip;q=0", which means the client refuses gzip
}
```

It also crashes when the header is absent, since `undefined.includes` throws. A client that explicitly opts out with `q=0` gets a body it will not decode.

✅ Parse the quality values and default safely:

```mjs
const encoding = negotiate(req.headers['accept-encoding']); // see above
```

### ❌ Decompressing untrusted input with no limit

```mjs
const raw = await gunzipAsync(req.body); // 10 KB in, 10 GB out
```

Any endpoint that accepts a compressed upload is a denial-of-service vector until you bound the output. The process dies with an out-of-memory error and takes every in-flight request with it.

✅ Set `maxOutputLength`, or use a counting transform for streams:

```mjs
const raw = await gunzipAsync(req.body, { maxOutputLength: 8 * 1024 * 1024 });
```

### ❌ Omitting `Vary: Accept-Encoding`

```mjs
res.setHeader('Content-Encoding', 'gzip');
res.end(compressed); // no Vary
```

A shared cache — a CDN, a corporate proxy — stores this response under the URL alone and serves the gzipped bytes to the next client, which may not have sent `Accept-Encoding: gzip`. That client sees binary garbage. The bug is invisible in development, where nothing is caching.

✅ Whenever the response body depends on a request header, declare it:

```mjs
res.setHeader('Vary', 'Accept-Encoding');
res.setHeader('Content-Encoding', 'gzip');
```

## Production notes

- **Budget the threadpool explicitly.** Four threads, shared by `zlib`, `fs`, `dns.lookup()`, and async `crypto`. Compression is usually the longest-running consumer, so it dictates queueing delay for everything else. Set `UV_THREADPOOL_SIZE` in the environment (not from inside the process, where it is not guaranteed to take effect), size it against available cores, and watch p99 latency on non-compressing endpoints when you change it.
- **Budget native memory.** 256 KiB per default deflate stream, 32 KiB per inflate stream, plus a 16 KiB `chunkSize` slab each. None of it is V8 heap, so it will not appear in heap snapshots — only in RSS and in your container's OOM kill. Under high concurrency, `{ windowBits: 14, memLevel: 7 }` halves the compression footprint for a modest ratio loss.
- **Cache compressed results.** The docs recommend it twice for a reason. Compressing the same static asset on every request is pure waste. Compress once at build time at maximum quality, store both the identity and compressed variants, and serve the right one. Reserve dynamic compression for genuinely dynamic bodies.
- **Pick levels for the workload, not the maximum.** Brotli quality 11 and gzip level 9 belong to build pipelines. On a request path, use Brotli 4–6 or gzip 4–6 — Node's own experimental iterable transforms default to Brotli 6 and gzip 4 for exactly this reason.
- **Do not compress below about 1 KB.** The gzip header and trailer alone are roughly 18 bytes, and small payloads have too little redundancy to exploit. You spend CPU to make the response bigger.
- **Compression plus TLS plus attacker-influenced content leaks secrets.** If a response body mixes attacker-controlled input with a secret (a CSRF token, a session identifier), compressed size becomes an oracle for the secret — the BREACH class of attacks. Do not compress responses that combine both, and keep secrets out of compressed bodies.
- **Truncated output must be detectable.** If a compressed response fails mid-stream, destroy the socket rather than calling `res.end()`. A cleanly-ended truncated body looks like a valid short response to the client and silently corrupts data.
- **Treat Zstd as experimental.** It is fast and compresses well, and its API may change. Excellent for internal traffic between services you deploy together; premature for a public API contract.

## Exercises

1. **Build a ratio/speed table.** Compress the same 100 MB text file with gzip levels 1, 6, and 9; Brotli qualities 4, 6, and 11; and Zstd levels 3 and 10. Record output size and wall time for each. *Success:* a table plus a one-paragraph recommendation for a dynamic API response and for a static asset.

2. **Write a correct `Accept-Encoding` negotiator.** Handle quality values, `*`, `identity`, `q=0` exclusions, and a missing header. *Success:* it selects `identity` for `gzip;q=0, *;q=0` and `br` for `gzip;q=0.5, br;q=0.9`.

3. **Defuse a zip bomb.** Generate a gzip file of 5 GB of zeros. Write a decompressor that refuses it in both forms: buffered with `maxOutputLength`, and streaming with a counting transform. *Success:* both reject within 100 ms and peak RSS stays under 100 MB.

4. **Measure threadpool contention.** Run a server with one endpoint that Brotli-compresses at quality 11 and another that only calls `fs.readFile()`. Load the first endpoint and measure latency on the second. Repeat with `UV_THREADPOOL_SIZE=16`. *Success:* a plot of file-read latency against compression concurrency for both settings.

5. **Train a dictionary.** Take 10,000 similar small JSON messages. Compress them individually with plain deflate, then with a `dictionary` built from your common keys. *Success:* a measured ratio improvement, plus a working decompressor and a demonstration of what error a dictionary mismatch produces.

## Recap

- Node ships gzip, deflate, deflateRaw, and Brotli as Stable, plus Zstd as **[Experimental]** and a ZIP archive API at early-development stability.
- Streaming classes for anything large, async convenience methods for small known-size buffers, `*Sync` only outside the request path.
- `level` (or Brotli's `BROTLI_PARAM_QUALITY`) is the dominant speed/ratio knob; maximum settings belong to build time, not to a request handler.
- A default deflate stream costs about 256 KiB of native memory, an inflate stream about 32 KiB, plus a 16 KiB `chunkSize` slab each.
- All async zlib work runs on the four-thread libuv pool shared with `fs`, `dns.lookup()`, and `crypto`. Set `UV_THREADPOOL_SIZE` in the environment, before startup.
- Parse `Accept-Encoding` with quality values, always send `Vary: Accept-Encoding`, and never set `Content-Length` on a body you have not yet compressed.
- Untrusted input needs an explicit output cap: `maxOutputLength` for convenience methods, a counting `Transform` for streams, `ZSTD_d_windowLogMax` for Zstd.
- `flush()` makes buffered data available for streaming responses; `finishFlush: Z_SYNC_FLUSH` tolerates truncated input at the cost of the integrity check.
- Cache compressed output, never compress already-compressed data, and skip compression below about 1 KB.

## Where to go next

- [Chapter 19 — Streams II: Duplex, Transform, pipeline, and Backpressure](../part3-data/19-streams-advanced.md) for the pipeline patterns every example here relies on.
- [Chapter 20 — Web Streams API and Interop](../part3-data/20-web-streams.md) for `CompressionStream`/`DecompressionStream`, the no-options portable alternative.
- [Chapter 35 — HTTP/1.1 Servers](../part5-networking/35-http-servers.md) for response lifecycle and header handling.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) for moving heavy compression off the threadpool entirely.
- [Chapter 44 — Securing Node.js Applications](../part6-security/44-securing-applications.md) for input limits as a general defence.
- Official documentation: <https://nodejs.org/docs/latest/api/zlib.html>
