---
chapter: 35
part: "Part V — Networking"
title: "HTTP/1.1 Servers"
level: intermediate
reading_time: "38 min"
prerequisites: [18, 19, 32, 33]
source_docs:
  - "doc/api/http.md"
  - "doc/api/errors.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/http.html"
node_baseline: "27.0.0-pre"
---

# Chapter 35 — HTTP/1.1 Servers

**What you will learn**

- How a byte arriving on a TCP socket becomes `(req, res)` in your handler, and what Node parsed on the way.
- `IncomingMessage` as a `Readable`: `method`, `url`, the three header views, and `signal`.
- `ServerResponse` as a `Writable`: the exact ordering rules for `setHeader()` and `writeHead()`, and how to stream a body under backpressure.
- How to read and parse a request body safely — with a size limit — because Node ships no body parser.
- Every server timeout, what attack or bug each one stops, and what to set it to.
- How to handle malformed requests, `Expect: 100-continue`, `CONNECT`, and protocol upgrades.
- Why request smuggling exists and which Node options make you vulnerable to it.

## Why this matters

Almost every Node service you will ever ship is an HTTP server. Frameworks hide `node:http` behind routers and middleware, but when a request hangs, a response is truncated, memory climbs under load, or a security scanner reports request smuggling, the fix is always at this layer. You cannot debug what you have never seen unwrapped.

The other reason to learn this raw is that Node's HTTP server does far less than people assume. It parses the request line, the headers, and the framing — `Content-Length` or chunked. That is all. It does not parse bodies, it does not route, and it does not enforce a body size limit. Everything a production service needs beyond parsing is your responsibility or your framework's, and knowing which is which is the difference between an outage you can explain and one you cannot.

## From socket to handler

An HTTP server is a TCP server (Chapter 33) with a parser bolted on. `http.Server` extends `net.Server`; the extra machinery is a C++ HTTP parser attached to each accepted socket.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as net.Server
    participant P as HTTP parser
    participant H as Your handler
    C->>S: TCP connect
    S-->>S: 'connection' event (net.Socket)
    C->>P: request line + headers
    P-->>H: 'request' (req, res)
    Note over H: headers complete;<br/>body has NOT arrived yet
    C->>P: body bytes
    P-->>H: req 'data' / 'end'
    H->>C: res.writeHead() + res.write()
    H->>C: res.end()
    Note over C,P: socket stays open<br/>for keepAliveTimeout ms
```

The critical detail is where the arrow to your handler sits: **the `'request'` event fires as soon as the headers are parsed, not when the body has arrived.** Your handler starts running while the client is still uploading. That is why `req` is a stream and not a string, and it is the source of most beginner confusion.

There may be many requests per connection. HTTP/1.1 keep-alive means one TCP connection carries request 1, response 1, request 2, response 2, in strict order. Node will not start parsing request 2 until response 1 has been sent.

## Creating a server

```mjs
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('ok\n');
});

server.listen(3000, () => console.log('listening on 3000'));
```

```cjs
const { createServer } = require('node:http');

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('ok\n');
});

server.listen(3000, () => console.log('listening on 3000'));
```

The `requestListener` you pass is simply added as a listener for the `'request'` event; `server.on('request', fn)` is identical. `createServer()` also takes an options object as its first argument, and that is where every parsing and timeout knob lives. The ones worth knowing:

| Option | Default | What it does |
|---|---|---|
| `requestTimeout` | `300000` | Deadline for receiving the *entire* request |
| `headersTimeout` | `60000` | Deadline for receiving the complete headers |
| `keepAliveTimeout` | `65000` | Idle time allowed after a response before closing |
| `keepAliveTimeoutBuffer` | `1000` | Slack added to the socket timeout (v24.6.0/v22.19.0) |
| `connectionsCheckingInterval` | `30000` | How often incomplete requests are swept for timeouts |
| `maxHeaderSize` | `16384` | Max total header bytes; overrides `--max-http-header-size` |
| `requireHostHeader` | `true` | Reject HTTP/1.1 requests with no `Host` with 400 |
| `joinDuplicateHeaders` | `false` | Join duplicates with `, ` instead of discarding |
| `httpValidation` | `'strict'` | Header-value validation strictness (v26.3.0/v24.19.0) |
| `insecureHTTPParser` | `false` | Enable parser leniency flags. Never turn this on |
| `noDelay` | `true` | Disable Nagle's algorithm on accepted sockets |
| `strictContentLength` *(response prop)* | `false` | Throw if body size ≠ `Content-Length` |
| `rejectNonStandardBodyWrites` | `false` | Throw `ERR_HTTP_BODY_NOT_ALLOWED` on bodies for 204/304/HEAD |
| `optimizeEmptyRequests` | `false` | Pre-end the body stream when no body is possible (v25.1.0/v24.12.0) |
| `shouldUpgradeCallback` | see below | Decide which upgrade attempts to accept (v24.9.0/v22.21.0) |

`keepAliveTimeout`'s default changed to **65 seconds** in this release line; it was 5 seconds for years. If you have a comment in your codebase explaining a hand-set 65000, you can probably delete it.

## The request: `IncomingMessage`

`req` is a `Readable` stream whose chunks are the request body, decorated with parsed metadata.

### `method` and `url`

```js
req.method; // 'GET', 'POST', ... — always uppercase, from http.METHODS
req.url;    // '/users/42?fields=name'
```

`req.url` is **not a URL**. It is the request target exactly as it appeared on the request line — path plus query string, no scheme, no host. There is no such thing as "the full URL" on the server side, because HTTP/1.1 clients do not send one (proxies are the exception). To get a `URL` object you must supply an origin:

```js
const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
url.pathname;                  // '/users/42'
url.searchParams.get('fields'); // 'name'
```

Treat `req.headers.host` as attacker-controlled. If you use it to build absolute links, redirect targets, or cache keys, validate it against an allowlist of hostnames you actually serve. Host-header poisoning is a real bug class, not a theoretical one.

### The three header views

| View | Shape | Case | Duplicates |
|---|---|---|---|
| `req.headers` | object, `null` prototype | lower-cased | merged per RFC rules |
| `req.headersDistinct` | object of `string[]` | lower-cased | every value kept, always an array |
| `req.rawHeaders` | flat `string[]` | as received | nothing merged or reordered |

`req.headers` applies real rules, and you should know them:

- Duplicates of a fixed set of single-value headers — `age`, `authorization`, `content-length`, `content-type`, `etag`, `expires`, `from`, `host`, `if-modified-since`, `if-unmodified-since`, `last-modified`, `location`, `max-forwards`, `proxy-authorization`, `referer`, `retry-after`, `server`, `user-agent` — are **discarded**. Only one survives. Set `joinDuplicateHeaders: true` to join them with `, ` instead.
- `set-cookie` is *always* an array, even with one value.
- Duplicate `cookie` headers are joined with `; `.
- Everything else is joined with `, `.

`req.headers` has a `null` prototype, so `'host' in req.headers` is unsafe as a style choice and `req.headers.constructor` is `undefined`. Use `req.headers.host !== undefined`.

Reach for `headersDistinct` when duplicates carry meaning (`Forwarded`, `Via`, custom trace headers) and for `rawHeaders` only when you must reproduce the wire exactly — a proxy, or a signature that covers header order.

### Everything else

```js
req.httpVersion;      // '1.1' or '1.0'
req.socket;           // the net.Socket (a tls.TLSSocket over HTTPS)
req.socket.remoteAddress;
req.complete;         // true only if the whole message was received
req.trailers;         // populated after 'end'
req.signal;           // AbortSignal, aborted if the client disconnects
```

`req.signal` (v26.1.0/v24.16.0) is the modern way to give up on work when the caller hangs up. It is created lazily, so touching it costs nothing on requests that do not.

```js
server.on('request', async (req, res) => {
  const rows = await db.query('SELECT ...', { signal: req.signal });
  res.end(JSON.stringify(rows));
});
```

Since v26.7.0 the signal is *not* aborted when the message completes normally, so you can safely use it as a cancellation source without spurious aborts at the end of a healthy request.

## The response: `ServerResponse`

`res` is a `Writable`. Writing to it writes the HTTP response body; the headers are sent for you, once, just before the first body byte.

### `setHeader()` vs `writeHead()`

This is the ordering rule people get wrong, so learn it as three facts:

1. `res.setHeader(name, value)` **queues** a header. You can call it, read it back with `res.getHeader()`, change it, and remove it with `res.removeHeader()` — any time before the headers are flushed.
2. `res.writeHead(status[, message][, headers])` **commits** the status line and headers. It must be called at most once, and before `res.end()`.
3. Headers passed to `writeHead()` win over anything set with `setHeader()`.

```js
res.setHeader('content-type', 'text/html');
res.setHeader('x-request-id', id);
res.writeHead(200, { 'content-type': 'text/plain' });
// Sent: content-type: text/plain, x-request-id: <id>
```

There is a subtle trap in `writeHead()`: if you have not called `setHeader()` at all, the headers you pass to `writeHead()` are written straight to the socket without being cached, so `res.getHeader()` afterwards will not return them. If a later middleware needs to read back what was set, use `setHeader()` throughout.

`writeHead()` also accepts a flat array in `rawHeaders` format (`['a', '1', 'b', '2']`) since v14.14.0, and returns `this`, so `res.writeHead(200, h).end(body)` chains.

The implicit path is often nicer:

```js
res.statusCode = 404;
res.statusMessage = 'Not Found';  // optional; the standard text is used if unset
res.setHeader('content-type', 'application/json');
res.end('{"error":"not_found"}');
```

`res.statusCode` defaults to `200`. A value outside 100–999 throws `RangeError` / `ERR_HTTP_INVALID_STATUS_CODE`.

### Headers already sent

Once the status line has hit the socket, it cannot be recalled. Any attempt to modify headers after that throws `ERR_HTTP_HEADERS_SENT`. Check `res.headersSent` before touching them in error paths:

```js
function fail(res, err) {
  if (res.headersSent) {
    res.destroy(err);   // too late for a status code; kill the response
    return;
  }
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end('{"error":"internal"}');
}
```

This matters most in streaming handlers. If you send `200` and then the source blows up halfway through the body, you cannot turn it into a `500`. The only honest signal you have left is to destroy the socket so the client sees a truncated, framing-invalid response instead of a complete-looking wrong one.

### `flushHeaders()`

`res.flushHeaders()` sends the headers immediately instead of waiting for the first body write. Use it for server-sent events and long-poll endpoints, where the client wants to see `200 OK` and `content-type: text/event-stream` right away, and for anything where an intermediary would otherwise buffer.

### Streaming a body

`res.write()` returns `false` when the kernel buffer is full. Ignoring that return value is the standard way to turn a slow client into unbounded memory growth on your server. Use `pipeline()` and let it manage backpressure and cleanup for you:

```mjs
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { stat } from 'node:fs/promises';

async function sendFile(res, path) {
  const { size } = await stat(path);
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-length': size,
  });
  try {
    await pipeline(createReadStream(path), res);
  } catch (err) {
    // Client hung up, or the file read failed mid-stream.
    res.destroy(err);
  }
}
```

`pipeline()` destroys both streams on failure, which is the part hand-rolled `.pipe()` chains forget. A `.pipe()` without an `'error'` handler on both ends leaks file descriptors when clients disconnect, and an unhandled `'error'` on any stream becomes an uncaught exception that takes the whole process down.

Set `content-length` when you know it. When you don't, Node uses chunked transfer encoding automatically, which is correct but costs a few bytes per chunk and prevents the client from showing a progress bar. If you set it and then write a different number of bytes, turn on `res.strictContentLength = true` to get `ERR_HTTP_CONTENT_LENGTH_MISMATCH` at the point of the bug instead of a confused client.

## Reading a request body

Node has no body parser. `req` is a stream of bytes; what those bytes mean is entirely up to you. The naive version is three lines and wrong:

```js
// ❌ Unbounded. One client can allocate all your memory.
let body = '';
req.on('data', (c) => { body += c; });
req.on('end', () => { handle(JSON.parse(body)); });
```

It has three bugs: no size limit, string concatenation that corrupts multi-byte UTF-8 sequences split across chunk boundaries, and a `JSON.parse` that throws inside an event handler where nothing catches it. Here is the version to actually use:

```mjs
import { Buffer } from 'node:buffer';

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function readJson(req, { limit = 1024 * 1024 } = {}) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, 'BODY_TOO_LARGE');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();                       // stop the upload now
      throw new HttpError(413, 'BODY_TOO_LARGE');
    }
    chunks.push(chunk);
  }

  if (size === 0) return undefined;
  const text = Buffer.concat(chunks, size).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON');
  }
}
```

Four things this gets right. It checks `content-length` first, so an honest oversized upload is rejected before a byte of body is read — but it does not *trust* it, because a chunked request has no `content-length` at all and the running total is the real enforcement. It buffers `Buffer`s and decodes once, so UTF-8 characters split across chunks survive. It destroys the request at the limit, so the client stops sending. And it turns parse failures into typed errors your handler can map to a status code.

Add two things in real code: check `content-type` before assuming JSON, and if you accept compressed bodies, apply the limit to the *decompressed* size too — a 1 MB gzip bomb inflates to gigabytes (Chapter 21).

## Timeouts

An HTTP server without timeouts is a denial-of-service target. Slowloris is the classic: open a thousand connections, send one header byte per minute on each, and hold the server's sockets forever. Node ships defaults for most of this now, but you should know which knob covers which phase.

| Property | Default | Covers | If it fires |
|---|---|---|---|
| `server.headersTimeout` | min(`requestTimeout`, `60000`) | Time to receive complete headers | 408, connection closed, handler never runs |
| `server.requestTimeout` | `300000` | Time to receive the entire request | 408, connection closed, handler never runs |
| `server.keepAliveTimeout` | `65000` | Idle time after the last response | Socket destroyed |
| `server.keepAliveTimeoutBuffer` | `1000` | Slack added to the socket timeout | — |
| `server.timeout` | `0` (off) | General socket inactivity | `'timeout'` event; **you** must act |
| `server.connectionsCheckingInterval` | `30000` | Sweep frequency for the two above | — |
| `server.maxHeadersCount` | `2000` | Number of header fields | Parser error |
| `server.maxRequestsPerSocket` | `0` (off) | Requests per keep-alive connection | 503 + `'dropRequest'` |

Three points that are easy to miss:

**`server.timeout` does nothing by default and does nothing useful even when set** unless you handle it. Setting it only causes a `'timeout'` event on the server with the socket as its argument. If you attach a listener, you own the socket's fate; if you set the value and attach no listener, Node destroys the socket for you.

**`connectionsCheckingInterval` means timeouts are not precise.** With the 30-second default, a request that exceeds `headersTimeout` can live up to 30 seconds longer before the sweep notices. Lowering it costs timer work every interval; leave it alone without a measured reason.

**`keepAliveTimeout` must be longer than your load balancer's.** If your proxy holds a connection idle for 60 s and your server closes at 5 s, the proxy will eventually send a request onto a socket the server is closing, and you get sporadic 502s that no amount of application logging will explain. The new 65-second default was chosen to sit above the common 60-second proxy idle timeouts. `keepAliveTimeoutBuffer` exists for the same reason at a finer grain: the socket's real timeout is `keepAliveTimeout + keepAliveTimeoutBuffer`, so Node closes slightly *after* the value it advertised, reducing `ECONNRESET` races.

## Header size limits

Total header bytes are capped at 16 KiB by default. Exceed it and the parser aborts with `HPE_HEADER_OVERFLOW` before any request object exists — your handler never sees it, and the default `'clientError'` behaviour answers `431 Request Header Fields Too Large`. Raise it per-server with the `maxHeaderSize` option or process-wide with `--max-http-header-size=32768`. The read-only current value is `http.maxHeaderSize`.

Raise it only for a concrete need — large SAML assertions, fat JWTs in cookies. Every byte of that limit is memory an attacker can make you hold per connection.

## Malformed requests: `'clientError'`

When the parser fails or the socket errors before a request object exists, the server emits `'clientError'` with `(err, socket)` — a raw socket, no `req`, no `res`. The default is to write a `400` (or `431` for header overflow) and destroy the socket. If you attach a listener, that default is replaced and **you must close or destroy the socket yourself**, before the listener returns.

```js
server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return;   // nothing to say
  const status = err.code === 'HPE_HEADER_OVERFLOW'
    ? '431 Request Header Fields Too Large'
    : '400 Bad Request';
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
});
```

The error carries two extra properties that are gold for debugging a misbehaving client: `err.bytesParsed` (how far the parser got) and `err.rawPacket` (the buffer it choked on). Log them at debug level. Do not log `rawPacket` at info level in production — it can contain credentials.

You are writing raw HTTP here, so you own the exact bytes, `\r\n\r\n` included. This is the one place in Node where hand-writing HTTP is correct.

## `Expect`, `CONNECT`, and `Upgrade`

**`Expect: 100-continue`.** A client that is about to upload something large may ask permission first. If nothing listens for `'checkContinue'`, Node answers `100 Continue` automatically and then emits `'request'` as usual. Listen for it when you want to reject early — checking auth or `content-length` before the client wastes bandwidth:

```js
server.on('checkContinue', (req, res) => {
  if (Number(req.headers['content-length']) > 10 * 1024 * 1024) {
    res.writeHead(413).end();
    return;
  }
  res.writeContinue();
  handleRequest(req, res);   // 'request' will NOT fire for this one
});
```

When `'checkContinue'` is handled, the `'request'` event does not fire — you must call your own handler. An `Expect` header with any other value goes to `'checkExpectation'`, and unhandled produces `417 Expectation Failed`.

**`CONNECT`.** Emitted as `'connect'` with `(req, socket, head)`. This is how HTTP proxies tunnel TLS. Unhandled, the connection is closed. If you handle it, the socket has no `'data'` listener — you own it completely.

**`Upgrade`.** This is the WebSocket entry point. `'upgrade'` gives you `(req, stream, head)`. `head` is the first packet of the upgraded stream, which may already contain client frames — never discard it.

```js
server.on('upgrade', (req, stream, head) => {
  if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
    stream.destroy();
    return;
  }
  // Compute Sec-WebSocket-Accept, write the 101, then speak the frame protocol.
  // Use a library (ws) — the framing, masking, and close handshake are not trivial.
});
```

Two version notes. Since v24.9.0/v22.21.0 the `shouldUpgradeCallback(request)` option controls which upgrades are accepted; it defaults to "accept if anyone is listening for `'upgrade'`". If your callback accepts an upgrade but no listener is registered, the socket is destroyed. Since v26.0.0, a request that carries a body no longer exposes that body raw on the stream: the body is parsed normally and emitted from `req`, and the second argument may be a duplex wrapper rather than the socket itself. Get the real socket from `req.socket` if you need it.

## Routing from scratch

A router is a function from `(method, pathname)` to a handler. Here is one worth understanding before you reach for a framework:

```mjs
const routes = [];

function route(method, pattern, handler) {
  // '/users/:id' -> /^\/users\/(?<id>[^/]+)$/
  const source = pattern.replace(/:([A-Za-z_]\w*)/g, '(?<$1>[^/]+)');
  routes.push({ method, regexp: new RegExp(`^${source}$`), handler });
}

function match(method, pathname) {
  let pathMatched = false;
  for (const r of routes) {
    const m = r.regexp.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method === method) return { handler: r.handler, params: m.groups ?? {} };
  }
  return pathMatched ? { status: 405 } : { status: 404 };
}
```

The detail hand-rolled routers get wrong is the 404/405 distinction: if the path exists but the method does not, the answer is `405 Method Not Allowed`, not `404`. Wiring it up:

```mjs
import { createServer } from 'node:http';

route('GET', '/users/:id', async (req, res, { params }) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: params.id }));
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const found = match(req.method, url.pathname);

  if (found.status) {
    res.writeHead(found.status).end();
    return;
  }

  try {
    await found.handler(req, res, { params: found.params, url });
  } catch (err) {
    if (res.headersSent) { res.destroy(err); return; }
    res.writeHead(err.status ?? 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err.code ?? 'internal' }));
  }
});
```

Note the `try/catch` around an `async` handler. Without it, a rejected promise becomes an unhandled rejection — which terminates the process by default — and the client waits until a timeout fires. Every framework has this wrapper; if you write your own dispatcher, you must too.

## Graceful shutdown

`server.close()` stops accepting new connections and, since v19.0.0, closes idle keep-alive connections too. It does **not** interrupt in-flight requests, which is what you want. The callback fires when the last connection is gone.

```mjs
import { once } from 'node:events';

process.on('SIGTERM', async () => {
  server.close();                 // stop accepting; reap idle sockets
  const timer = setTimeout(() => server.closeAllConnections(), 10_000).unref();
  await once(server, 'close');
  clearTimeout(timer);
  process.exit(0);
});
```

- `server.closeIdleConnections()` — closes only connections not currently handling a request. Redundant after v19 but harmless, and needed if you support older runtimes.
- `server.closeAllConnections()` — forceful; kills in-flight requests too. Call it *after* `server.close()` to avoid racing with newly accepted connections. This is your deadline hammer, not your first move.
- `server[Symbol.asyncDispose]()` calls `close()` and returns a promise, so `await using server = createServer(...)` works (no longer experimental since v24.2.0).

Neither method touches sockets that were upgraded to another protocol; WebSocket connections you have to close yourself. Chapter 26 covers the full shutdown sequence.

## Security

**Request smuggling.** HTTP/1.1 has two ways to frame a body: `Content-Length` and `Transfer-Encoding: chunked`. If a front-end proxy and your Node server disagree about which one applies to a request that contains both, the proxy sees one request where Node sees two — and the attacker controls the second one, injecting it into another user's connection. Node's parser (llhttp) is strict about this by design: it rejects messages with both headers, rejects malformed chunk sizes, and requires `\r\n` line endings.

That strictness is exactly what `insecureHTTPParser: true` and `--insecure-http-parser` turn off. The flag enables leniency for invalid header values, invalid HTTP versions, `Content-Length` *and* `Transfer-Encoding` together, extra data after a `Connection: close` message, `\n` as a line separator, and missing CRLF after chunks. Every item on that list is a smuggling primitive. The correct number of times to enable this flag in production is zero. If a legacy upstream needs leniency, put a strict proxy in front of it and keep it off your server.

Node 26.3.0/24.19.0 introduced `httpValidation` as a finer-grained alternative: `'strict'` (default) rejects non-ASCII and control characters in header values, `'relaxed'` allows the limited set the Fetch spec permits, and `'insecure'` is equivalent to `insecureHTTPParser: true`. If you have an interop problem with a client sending non-ASCII header values, `'relaxed'` is the setting to try — not `'insecure'`.

**Header injection.** If you write a user-supplied value into a response header, a `\r\n` in that value would let an attacker terminate your headers and inject their own — including a whole second response. Node blocks this: `setHeader()` and `writeHead()` throw `TypeError` on invalid characters in names or values, and `http.validateHeaderName()` / `http.validateHeaderValue()` expose the same checks if you want to validate up front. The protection only holds because Node builds the response; the moment you write raw bytes to `res.socket` or to the socket in a `'clientError'` handler, it is gone.

**Never hand-roll the parser.** Chunked encoding, obsolete line folding, header limits, `Transfer-Encoding` precedence, and trailer handling represent a decade of accumulated CVEs. Use `node:http`.

## Common mistakes

### ❌ Treating `req.url` as a complete URL

```js
const { pathname } = new URL(req.url);   // TypeError: Invalid URL
```

`req.url` is an origin-form request target — a path, not a URL. `new URL()` needs an absolute input or a base.

✅

```js
const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
if (!ALLOWED_HOSTS.has(url.hostname)) { res.writeHead(400).end(); return; }
```

### ❌ Buffering a request body without a limit

```js
let body = '';
req.on('data', (c) => { body += c; });
req.on('end', () => res.end(process(body)));
```

Two bugs. Unbounded memory: `curl -X POST --data-binary @10gb.bin` is a one-line denial of service. And string concatenation decodes each chunk independently, so a UTF-8 character split across a chunk boundary becomes `�`.

✅ Use the `readJson()` pattern above: accumulate `Buffer`s, enforce a running byte limit, destroy on overflow, decode once.

### ❌ Setting headers after the response has started

```js
res.write(chunk);
res.setHeader('x-total', count);   // ERR_HTTP_HEADERS_SENT
```

The first `res.write()` flushes headers. Anything after that is too late — and in an error handler, the throw replaces your real error with a confusing one.

✅

```js
if (!res.headersSent) res.setHeader('x-total', count);
```

Compute anything that must appear in a header before writing the first byte.

### ❌ Piping to the response without error handling

```js
createReadStream(path).pipe(res);
```

If the client disconnects mid-download, `res` errors, `.pipe()` does not propagate that to the source, the file descriptor leaks, and the unhandled `'error'` event on the read stream throws — crashing the process.

✅

```mjs
import { pipeline } from 'node:stream/promises';
try {
  await pipeline(createReadStream(path), res);
} catch (err) {
  res.destroy(err);
}
```

### ❌ Attaching a `'clientError'` listener and forgetting to close the socket

```js
server.on('clientError', (err) => log.warn({ err }, 'bad request'));
```

Attaching a listener disables the default destroy. The socket now leaks — one per malformed request — until an OS-level timeout, if ever.

✅ Always `socket.end(...)` or `socket.destroy()` in the listener, and guard on `socket.writable` first.

## Production notes

- **Put a proxy in front, but do not rely on it for timeouts.** A misrouted internal caller reaches Node directly. Set `headersTimeout` and `requestTimeout` to values your service actually needs (60 s and 120 s suit most JSON APIs) rather than inheriting a five-minute default.
- **Align keep-alive timeouts across the stack.** Node's `keepAliveTimeout` must exceed the idle timeout of whatever sits in front of it, or you will see unexplained 502s at low traffic. This is the single most common cause of "random" gateway errors in front of Node.
- **Every request handler needs a body size limit and a `content-type` check.** Node enforces neither. A single unbounded endpoint negates every other memory control you have.
- **Watch `process.memoryUsage().external` and socket counts, not just heap.** Buffered bodies and response backpressure live outside the V8 heap, so that kind of leak never appears in a heap snapshot. Track `server.getConnections()` alongside RSS.
- **Unhandled stream errors kill the process.** An `'error'` event with no listener throws. Every socket, request, and response in a long-lived server needs an owner for its errors — which in practice means `pipeline()` everywhere and a `'clientError'` handler on the server.
- **Set `maxRequestsPerSocket` behind a load balancer that pins connections.** Without it, a connection established at deploy time outlives several deployments' worth of routing decisions. With it, the server signals `Connection: close` at the threshold, answers `503` beyond it, and emits `'dropRequest'` so you can count it.
- **HTTPS is the same API.** `https.createServer()` accepts every `http.createServer()` option plus TLS options; the `req`/`res` objects are identical and `req.socket` becomes a `tls.TLSSocket`. See Chapter 37.

## Exercises

1. **Header views.** Respond with a JSON object containing `headers`, `headersDistinct`, and `rawHeaders`. Send a request with two `X-Trace` headers and two `User-Agent` headers. Success: you can explain why one pair was merged and the other discarded, and you can make the `User-Agent` pair survive by changing one server option.

2. **Bounded JSON endpoint.** Implement `POST /echo` that accepts `application/json` up to 64 KiB and echoes it back. It must answer `415` for a wrong `content-type`, `413` for oversized bodies (both the declared-`Content-Length` case and the chunked case with no `Content-Length`), and `400` for malformed JSON. Success: `curl -H 'transfer-encoding: chunked' --data-binary @big.json` gets a `413` and the server's RSS does not grow by the size of the file.

3. **Timeout laboratory.** Start a server with `headersTimeout: 2000` and connect with a raw `net.Socket` that sends `GET / HTTP/1.1\r\n` and then stops. Success: you observe the `408`, you can state how long it actually took, and you can explain the gap using `connectionsCheckingInterval`.

4. **Router with 405s.** Extend the router in this chapter to support wildcard segments and a per-route method list, and add an `Allow` response header on 405 responses listing the methods that path does support. Success: `curl -X DELETE /users/1` returns `405` with `Allow: GET, PUT`.

5. **Graceful shutdown under load.** Add a `/slow` endpoint that takes 5 seconds. Send ten concurrent requests to it, then `SIGTERM` the process. Success: all ten receive complete responses, no new connection is accepted after the signal, the process exits within your deadline, and you can demonstrate the difference by swapping `closeIdleConnections()` for `closeAllConnections()`.

## Recap

- `http.Server` extends `net.Server`; `'request'` fires when headers are parsed, long before the body has arrived.
- `req.url` is a path, not a URL. Build a `URL` with an explicit base and validate `Host` before trusting it.
- `req.headers` merges and discards duplicates by RFC-specific rules; `headersDistinct` keeps everything as arrays; `rawHeaders` is the untouched wire order.
- `setHeader()` queues and is re-readable; `writeHead()` commits and wins on conflicts; after the first byte of body, `ERR_HTTP_HEADERS_SENT` is all you get.
- There is no built-in body parser. Enforce a byte limit while reading, buffer `Buffer`s and decode once, and destroy the request when the limit is hit.
- `headersTimeout`, `requestTimeout`, and `keepAliveTimeout` (now 65 s by default) cover distinct phases; `server.timeout` is off by default and requires you to act.
- `'clientError'` hands you a raw socket with no `req`/`res` — write a valid response by hand and always close it.
- `'checkContinue'`, `'connect'`, and `'upgrade'` are the escape hatches for `Expect`, tunnels, and WebSockets; handling `'checkContinue'` suppresses `'request'`.
- Use `pipeline()` for response bodies; an unhandled stream error takes down the process.
- Never enable `insecureHTTPParser` — every leniency it adds is a request-smuggling primitive.

## Where to go next

- [Chapter 33 — TCP Sockets with `node:net`](33-tcp-net.md) — the socket layer underneath everything here.
- [Chapter 36 — HTTP/1.1 Clients, Agents, and Keep-Alive](36-http-clients.md) — the other end of the connection.
- [Chapter 37 — TLS and HTTPS](37-tls-https.md) — the same server, encrypted.
- [Chapter 38 — HTTP/2](38-http2.md) — what changes when framing becomes binary.
- [Chapter 19 — Streams II: Duplex, Transform, pipeline, Backpressure](../part3-data/19-streams-advanced.md) — the backpressure rules this chapter assumes.
- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](../part4-system/26-signals-and-shutdown.md) — shutdown in full.
- [Chapter 32 — URLs, Query Strings, and Punycode](32-url-and-querystring.md) — parsing `req.url` properly.
- Official documentation: <https://nodejs.org/docs/latest/api/http.html>
