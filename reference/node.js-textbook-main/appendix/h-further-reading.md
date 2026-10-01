---
chapter: "H"
part: "Appendices"
title: "Further Reading and Capstone Projects"
level: intermediate
reading_time: "35 min"
prerequisites: []
source_docs:
  - "doc/api/index.md"
  - "doc/contributing/writing-tests.md"
  - "doc/contributing/api-documentation.md"
source_url: "https://github.com/nodejs/node"
node_baseline: "27.0.0-pre"
---

# Appendix H — Further Reading and Capstone Projects

## How to use this appendix

Finishing a textbook is a strange moment. You know more than enough to be useful and not yet enough to be confident, and the usual advice — "build something!" — is unhelpfully vague.

This appendix is two answers to "what now".

**Part 1** is a reading list, but an opinionated one. For every source it says *why* it is worth your time and *what to look for*, because "read the docs" is advice nobody has ever acted on. The most valuable material about Node.js is not in the API reference; it is in the project's contributor documentation, its changelogs, and the source of a handful of ecosystem libraries.

**Part 2** is eight project briefs, ordered by difficulty. Each one deliberately forces you to combine things this book taught in different chapters, because that combination is where real competence lives. Each has a goal, required capabilities with chapter references, explicit success criteria you can check, and stretch goals for when it turns out to be easier than expected.

You do not need to do all eight. Pick the one closest to a problem you actually have.

---

# Part 1 — Further Reading

## The official documentation, read properly

Most people use <https://nodejs.org/api/> as a search target. It rewards being read as a document.

**Read the version selector first.** The docs default to the latest release. If you are running Node 22 and reading the Node 27 page, you will find APIs that do not exist for you. Every page has a version dropdown; use it, and prefer the versioned URL form (`https://nodejs.org/docs/latest-v22.x/api/fs.html`) when you share a link with a colleague.

**Read the YAML change history under each API.** Every method entry carries an `added:` version and often a `changes:` list. That block is the single most useful thing on the page and almost nobody scrolls to it. It tells you whether an option existed in your runtime, when a default changed, and — via the linked PR — *why*.

**Follow the PR links.** Each change entry links to the pull request that made it. Node.js PRs routinely contain the discussion of the trade-off, the benchmark that justified it, and the objection someone raised. Ten minutes in a PR thread will teach you more about a design than any blog post about it.

**Use `all.json` when you need to do this at scale.** The docs are published as machine-readable JSON — `https://nodejs.org/api/all.json` per version. Diffing two versions of that file is a fast way to answer "what actually changed in the API surface between 22 and 24?" without reading a changelog. The generation tooling is described in [`doc/contributing/api-documentation.md`](https://github.com/nodejs/node/blob/main/doc/contributing/api-documentation.md) — worth a skim purely to understand where the HTML you are reading comes from.

**Read `SECURITY.md` once, all the way through.** It defines the Node.js threat model: what the project considers a vulnerability, what it explicitly does not, and where the boundary of your responsibility begins. It is the difference between "is this a Node.js bug?" and "is this my bug?" — a question that comes up in every serious incident review. See [Chapter 44](../part6-security/44-securing-applications.md) and [Appendix E](e-stability-and-releases.md).

## The Node.js repository

<https://github.com/nodejs/node> — the code, but more importantly the documentation *about* the code.

### `doc/contributing/` — the real gems

This directory is written for people working on Node.js core, which is exactly why it is valuable: it explains how the project thinks, and much of that thinking transfers directly to your own code.

Two documents ship in the snapshot this book was written against, and both are worth reading in full even if you never contribute:

- **[`writing-tests.md`](https://github.com/nodejs/node/blob/main/doc/contributing/writing-tests.md)** — the project's standards for a good test. The core idea it hammers is that *a test should be written to be optimal for debugging when it fails*, not optimal to write. It covers what makes a test flaky, why tests should exit cleanly rather than call `process.exit()`, and how to structure a test so its failure output tells you what went wrong. If your test suite has flaky tests you keep re-running, this document diagnoses why.
- **[`api-documentation.md`](https://github.com/nodejs/node/blob/main/doc/contributing/api-documentation.md)** — how the reference is generated, and therefore how to read its conventions: the YAML metadata blocks, the stability markers, the JSON output. Short, and it changes how you read every doc page afterwards.

The full directory upstream also carries guides on running and interpreting the benchmark suite (`writing-and-running-benchmarks.md`, referenced from `benchmark/README.md`), the pull request process (`pull-requests.md`), the collaborator guide, the internal `primordials` convention, and native memory leak investigation. Browse <https://github.com/nodejs/node/tree/main/doc/contributing> and read whichever matches the problem in front of you. Three themes recur and are worth seeking out by topic:

- **Benchmarking methodology.** How to construct a benchmark that measures the thing you think it measures, how many iterations are enough, and how to compare two builds with statistical confidence rather than eyeballing two numbers. This is directly applicable to [Chapter 61](../part9-production/61-performance-tuning.md), and it will make you sceptical of most benchmarks you see online — correctly.
- **Primordials.** Node.js core captures pristine references to built-ins at startup so that userland **prototype pollution** cannot change core's behaviour. Read the reasoning and you will understand a whole class of supply-chain attack, and why core code looks the way it does. Relevant to [Chapter 44](../part6-security/44-securing-applications.md).
- **Investigating native memory leaks.** Using `valgrind`, ASAN, and native heap profilers to find leaks that never appear in a V8 heap snapshot — because they are in a native addon, in OpenSSL, or in a `Buffer` external allocation. This is the missing half of [Chapter 50](../part7-diagnostics/50-reports-and-heap.md): when the JavaScript heap is flat but **RSS** climbs, this is where you go.

### `lib/` — the JavaScript you are already running

Node.js's own standard library is JavaScript, and reading it is unreasonably instructive. Suggested order:

1. **`lib/internal/streams/`** — the actual implementation of backpressure, `pipeline` cleanup, and `destroy()` semantics. After [Chapters 18–19](../part3-data/18-streams-concepts.md), reading this closes the loop between the API and what it does.
2. **`lib/internal/errors.js`** — how the `ERR_*` codes are defined and thrown. It shows a disciplined error-code system at scale, which is the pattern [Chapter 14](../part2-async/14-errors.md) recommends you copy.
3. **`lib/events.js`** — small, complete, heavily optimised, and the source of the `once`/`on` async iterator implementations.

Read these to learn *style*, not to copy code. Core uses primordials and internal bindings that you cannot and should not use.

### `test/` — executable specification

When the documentation is ambiguous — and it sometimes is, particularly around error conditions and edge cases — the test suite is the authoritative answer. Search `test/parallel/` for the API name. `test/parallel/test-stream-pipeline.js` alone answers a dozen questions about cleanup semantics that the prose does not address.

### Issues and pull requests

Search closed issues before you conclude something is a bug. Node.js has a large, thoroughly discussed issue history, and "surprising behaviour X" almost always has a thread explaining that it is intentional and why. Use `is:issue "your error message"` — error strings are stable enough to be good search keys.

## Changelogs, and how to read one before an upgrade

The per-line changelogs live at <https://github.com/nodejs/node/tree/main/doc/changelogs>, one file per major (`CHANGELOG_V24.md` and so on), and each release announcement is also posted to <https://nodejs.org/en/blog/release/>.

The technique that makes this tractable:

1. **Read only the "Semver-Major Commits" section**, and only for the majors you are crossing. Everything else is additive. For a single-major jump this is twenty minutes and it is the highest-yield twenty minutes of any upgrade.
2. **Grep the section for the modules you actually use.** You do not care about `node:sqlite` changes if you do not use it.
3. **Note the dependency version bumps at the top** — V8, OpenSSL, npm, llhttp, undici. These are where the unlabelled breakage lives, and they are covered as a checklist in [Appendix E, Part 5](e-stability-and-releases.md).
4. **Diff the docs, not just the changelog.** For anything you depend on heavily, diff the module's page between the two versions. The changelog says what changed; the docs say what it is now.

Full procedure: [Chapter 63](../part9-production/63-upgrading-node.md).

## V8

<https://v8.dev/docs> and the V8 blog.

Worth reading, in this order:

- **The blog posts on the garbage collector** — generational collection, Orinoco/concurrent marking, and what actually causes a long pause. This is the background you need to interpret the GC entries `perf_hooks` gives you ([Chapter 49](../part7-diagnostics/49-perf-hooks.md)) and to stop guessing at `--max-old-space-size`.
- **Anything on hidden classes, inline caches, and de-optimisation.** This explains why adding a property to an object after construction is slow, why polymorphic call sites cost, and why your microbenchmark disagrees with production.
- **The `d8` and `--trace-opt` / `--trace-deopt` documentation.** These flags work through `node --v8-options`, and watching a function get optimised and then de-optimised is the single most illuminating experience in JavaScript performance work.

The trap: V8 blog posts age. A post about a 2018 optimisation may describe machinery that no longer exists. Check the date, and prefer the docs over the blog for anything you intend to rely on.

## libuv

<https://docs.libuv.org> and the "libuv book" (`https://docs.libuv.org/en/v1.x/guide.html`).

Read the guide's chapters on **the event loop**, **filesystem operations**, and **threads**. Three specific payoffs:

- The **handle vs request** distinction, which is what `process._getActiveHandles()`-style debugging and "why won't my process exit?" actually come down to ([Chapter 9](../part2-async/09-event-loop.md)).
- **Which operations use the thread pool** and which use the OS's native async interface. This is the difference between "my file I/O is slow" and "my thread pool is saturated by `zlib` and DNS", and no amount of JavaScript-level profiling will show it to you.
- **Platform differences.** Nearly every "this behaves differently on Windows" surprise in Node.js is libuv papering over `epoll` versus IOCP, or over Windows' different file locking and rename semantics.

## Specifications worth reading

You do not need to read these cover to cover. You need to know they exist and to read the relevant section when you are arguing about behaviour.

| Spec | Where | Read it when | What to look for |
|---|---|---|---|
| **HTTP Semantics** (RFC 9110) | `https://www.rfc-editor.org/rfc/rfc9110` | Designing an API, or arguing about status codes | The precise meaning of idempotent vs safe methods; conditional request handling (`If-None-Match`, `If-Modified-Since`); the actual definition of 4xx vs 5xx. It replaced the old RFC 723x series — cite this one. |
| **HTTP/1.1 Message Syntax** (RFC 9112) | `https://www.rfc-editor.org/rfc/rfc9112` | Writing a proxy, or investigating request smuggling | Chunked transfer encoding, and the `Transfer-Encoding` / `Content-Length` conflict rules that smuggling attacks exploit ([Chapter 44](../part6-security/44-securing-applications.md)). |
| **HTTP/2** (RFC 9113) | `https://www.rfc-editor.org/rfc/rfc9113` | Tuning HTTP/2, or debugging a stalled stream | Flow control windows, `SETTINGS` frames, and the stream state machine. [Chapter 38](../part5-networking/38-http2.md) teaches the API; this explains the failure modes. |
| **TLS 1.3** (RFC 8446) | `https://www.rfc-editor.org/rfc/rfc8446` | Debugging a handshake, or choosing cipher policy | The 1-RTT handshake, why 0-RTT data is replayable and therefore unsafe for non-idempotent requests, and what changed from TLS 1.2 ([Chapter 37](../part5-networking/37-tls-https.md)). |
| **WHATWG URL** | `https://url.spec.whatwg.org/` | Any time URL parsing matters for security | The parsing state machine. Reading it explains why the legacy `url.parse()` diverges, and why those divergences became CVEs in other projects ([Chapter 32](../part5-networking/32-url-and-querystring.md)). |
| **ECMA-262** | `https://tc39.es/ecma262/` | Settling an argument about language semantics | The job queue (microtasks), the module evaluation algorithm (which explains **TDZ** in circular ESM imports), and property enumeration order. |
| **ECMA-402** | `https://tc39.es/ecma402/` | Doing anything locale-aware | What `Intl` guarantees versus what it leaves implementation-defined — the latter is why output differs between ICU builds ([Chapter 17](../part3-data/17-encodings.md)). |
| **WASI** | `https://github.com/WebAssembly/WASI` | Before trusting a WASI sandbox | The capability model, and the gap between what the standard specifies and what Node.js currently implements ([Chapter 57](../part8-advanced/57-wasm-wasi.md)). |
| **WebAssembly core** | `https://webassembly.github.io/spec/core/` | Optimising a WASM hot path | The memory model and the boundary-crossing cost, which is what determines whether WASM is actually faster for your workload. |

Reading a spec is a skill. The trick is to treat it as a reference with a table of contents, jump to the section that defines the exact term you are arguing about, and read the surrounding two pages. Do not start at page one.

## Ecosystem source code worth studying

Reading well-written libraries is the fastest way to level up, provided you read them for *technique* rather than to copy.

- **`undici`** — the HTTP client bundled with Node.js and the engine behind global `fetch`. Read its connection pool and dispatcher design: it is a masterclass in keep-alive management, pipelining, and correct backpressure over a socket. Pairs with [Chapter 36](../part5-networking/36-http-clients.md).
- **`pino`** — structured logging with an obsessive focus on cost. Read how it avoids serialising anything it does not have to, and how it moves transport work out of the hot path into a worker. Pairs with [Chapter 51](../part7-diagnostics/51-console-and-logging.md).
- **`fastify`** — read the plugin/encapsulation system and the schema-based serialisation. The idea that response serialisation can be compiled ahead of time from a schema is the kind of trick you only meet by reading source. Pairs with [Chapter 59](../part9-production/59-application-architecture.md).
- **`node-addon-api`** — the C++ wrapper over Node-API. Read it if you write addons; it shows what the raw C API costs and what a good RAII wrapper buys. Pairs with [Chapter 56](../part8-advanced/56-node-api-addons.md).
- **`ws`** — a WebSocket implementation small enough to read end to end. Excellent for seeing binary framing, masking, and fragmentation handled on top of a raw socket. Pairs with [Chapter 33](../part5-networking/33-tcp-net.md).
- **OpenTelemetry's Node.js SDK** — read specifically how it instruments core modules and propagates context. It is the largest real-world consumer of `AsyncLocalStorage` and `diagnostics_channel`, and it shows both APIs under load. Pairs with [Chapter 15](../part2-async/15-async-context.md) and [Chapter 62](../part9-production/62-observability.md).

A method that works better than "read the repo": pick one bug fix in the project's history, read the issue, then read the diff. You get the problem, the constraint, and the solution in fifteen minutes, in context.

---

# Part 2 — Capstone Projects

Eight briefs, easiest first. Each is designed so that the naive version works in an afternoon and the version that meets the success criteria does not — because the gap between those two is precisely what this book was about.

Rules that apply to all of them:

- **Write tests with `node:test`.** No external test framework. If you cannot test it, the design is wrong ([Chapter 45](../part7-diagnostics/45-test-runner.md)).
- **No dependencies unless the brief says otherwise.** The constraint is the point.
- **Handle errors and shutdown from the start**, not as a final pass. Retro-fitting graceful shutdown is how you learn that you cannot.
- **Measure before you optimise.** Every performance claim needs a number ([Chapter 49](../part7-diagnostics/49-perf-hooks.md)).

---

## Project 1 — A streaming log-processing CLI

**Difficulty:** ⭐ Foundational. Start here if you are not sure.

### Goal

A command-line tool that reads newline-delimited JSON logs — from a file, from a glob of files, or from stdin — filters and aggregates them, and writes a report. It must process a file larger than available memory without breaking a sweat.

### Required capabilities

| Capability | Chapter |
|---|---|
| Argument parsing with `util.parseArgs` | [Ch. 11](../part2-async/11-promises-and-async.md), [Ch. 25](../part4-system/25-process-object.md) |
| Reading files as streams; stdin as a stream | [Ch. 23](../part4-system/23-filesystem-advanced.md), [Ch. 25](../part4-system/25-process-object.md) |
| Line splitting across chunk boundaries | [Ch. 17](../part3-data/17-encodings.md), [Ch. 19](../part3-data/19-streams-advanced.md) |
| Transform streams and `pipeline` | [Ch. 19](../part3-data/19-streams-advanced.md) |
| Transparent gzip decompression for `.gz` inputs | [Ch. 21](../part3-data/21-zlib.md) |
| TTY detection for colour vs plain output | [Ch. 27](../part4-system/27-os-tty-readline.md) |
| Correct exit codes and `SIGINT` handling | [Ch. 26](../part4-system/26-signals-and-shutdown.md) |

### Success criteria

1. Processes a **2 GB** NDJSON file with **RSS staying under 150 MB** for the whole run. Prove it by sampling `process.memoryUsage().rss` and printing the peak.
2. `cat huge.log | mytool --level=error` works, and so does `mytool huge.log.gz`, with no code path difference visible to the user.
3. A malformed line does not kill the run: it is counted, reported at the end, and optionally echoed to stderr with its line number.
4. `mytool big.log | head -5` exits cleanly with no `EPIPE` stack trace. (This one catches almost everyone.)
5. Ctrl-C mid-run prints the partial aggregate and exits with code 130.
6. Exit code is 0 on success, non-zero when any input file could not be read.
7. Tests cover: a multi-byte UTF-8 character split across a chunk boundary, a file with no trailing newline, an empty file, and a 100 MB file processed under a memory assertion.

### Stretch goals

- Add `--follow` (tail-style) using `fs.watch`, correctly handling log rotation when the file is replaced rather than appended to ([Ch. 23](../part4-system/23-filesystem-advanced.md)).
- Parallelise across input files with a worker pool and measure whether it actually helps — for a parse-bound workload it should; for an I/O-bound one it will not ([Ch. 29](../part4-system/29-worker-threads.md)).
- Add a `--web-streams` mode implementing the same pipeline with `TransformStream` and benchmark the two ([Ch. 20](../part3-data/20-web-streams.md)).

---

## Project 2 — A static file server that is actually correct

**Difficulty:** ⭐⭐ Deceptive. The first version takes an hour; the correct one takes a weekend.

### Goal

An HTTP server that serves a directory of files with correct caching, range requests, compression, and — most importantly — no path traversal.

### Required capabilities

| Capability | Chapter |
|---|---|
| HTTP/1.1 server, headers, status codes | [Ch. 35](../part5-networking/35-http-servers.md) |
| Path resolution and containment checks | [Ch. 24](../part4-system/24-paths.md) |
| `stat`, `createReadStream` with `start`/`end` | [Ch. 22](../part4-system/22-filesystem-basics.md), [Ch. 23](../part4-system/23-filesystem-advanced.md) |
| ETag generation and hashing | [Ch. 41](../part6-security/41-crypto-essentials.md) |
| gzip / Brotli / Zstandard negotiation | [Ch. 21](../part3-data/21-zlib.md) |
| Backpressure between disk and socket | [Ch. 19](../part3-data/19-streams-advanced.md) |
| URL decoding without introducing traversal | [Ch. 32](../part5-networking/32-url-and-querystring.md) |

### Success criteria

1. **Path traversal is impossible.** Your test suite includes `../`, URL-encoded `%2e%2e%2f`, double-encoded variants, backslashes, null bytes, absolute paths, and a symlink pointing outside the root. All return 403 or 404, never file contents. Resolve the real path and verify containment — do not pattern-match the input.
2. `Range: bytes=0-99`, `bytes=100-`, `bytes=-100` and a multi-range request are all handled, returning `206` with a correct `Content-Range`, or `416` with `Content-Range: bytes */<size>` when unsatisfiable.
3. Conditional requests work: `If-None-Match` returns `304` with no body; `If-Modified-Since` likewise; `If-Range` correctly falls back to a full `200` when the validator does not match.
4. `Accept-Encoding` negotiation picks the best mutually supported encoding, respects `q=0`, and **never** compresses an already-compressed type (`.jpg`, `.zip`, `.woff2`). Pre-compressed sidecar files (`index.html.br`) are served directly when present.
5. Aborting a download of a large file mid-transfer does not leak a file descriptor. Prove it: run 1,000 aborted requests and show the descriptor count is flat.
6. Serving a 1 GB file to a deliberately slow client keeps RSS flat — the read stream must actually pause.
7. Benchmark: sustained throughput for a 1 MB file over keep-alive connections, reported with p50/p99.

### Stretch goals

- Add HTTP/2 with the same handler via the compatibility API, and compare many-small-files performance against HTTP/1.1 ([Ch. 38](../part5-networking/38-http2.md)).
- Add TLS with SNI serving two hostnames from one server ([Ch. 37](../part5-networking/37-tls-https.md)).
- Run it under `--permission --allow-fs-read=./public` and confirm it still works — a real test of whether your path handling is honest ([Ch. 31](../part4-system/31-permission-model.md)).

---

## Project 3 — A production-grade HTTP API

**Difficulty:** ⭐⭐ The one most directly useful at work.

### Goal

A JSON API — any domain; a task tracker is fine — built to the standard you would defend in a production readiness review. The domain logic is trivial on purpose. The operational surface is the project.

### Required capabilities

| Capability | Chapter |
|---|---|
| HTTP server, routing, body parsing with limits | [Ch. 35](../part5-networking/35-http-servers.md) |
| Layered configuration from env and files | [Ch. 60](../part9-production/60-deployment-and-config.md) |
| Structured JSON logging with levels | [Ch. 51](../part7-diagnostics/51-console-and-logging.md) |
| Request-scoped context via `AsyncLocalStorage` | [Ch. 15](../part2-async/15-async-context.md) |
| Error taxonomy with codes, mapped to status codes | [Ch. 14](../part2-async/14-errors.md) |
| Graceful shutdown on `SIGTERM` | [Ch. 26](../part4-system/26-signals-and-shutdown.md) |
| Health metrics including ELU | [Ch. 49](../part7-diagnostics/49-perf-hooks.md), [Ch. 62](../part9-production/62-observability.md) |
| `AbortSignal` timeouts on all outbound calls | [Ch. 13](../part2-async/13-abort-and-cancellation.md) |
| Project structure that survives growth | [Ch. 59](../part9-production/59-application-architecture.md) |

### Success criteria

1. **Every log line is JSON on one line**, includes a `requestId` correlating it with the access log, and that ID reaches a log statement emitted three async layers deep without being passed as a parameter.
2. **`SIGTERM` shuts down cleanly:** stop accepting connections, finish in-flight requests, close the database pool, flush logs, exit 0 — with a configurable hard-kill timeout. Test it: start a 5-second request, send `SIGTERM` at 1 second, assert the request completes and the process exits by second 6.
3. `/healthz` (liveness) and `/readyz` (readiness) are distinct, and readiness genuinely fails when a dependency is down. Readiness flips to failing the moment shutdown begins, *before* the server stops accepting — so a load balancer can drain you.
4. `/metrics` exposes at minimum: request count and duration histogram by route and status, ELU, event loop delay percentiles, heap used, RSS, and active handle count. **Route labels use the route template, not the raw path** — `/users/:id`, never `/users/12345` ([cardinality](f-glossary.md)).
5. Every error response has a stable machine-readable `code`, and no response ever leaks a stack trace or an internal path.
6. An unhandled rejection or uncaught exception logs a structured fatal record, flushes, and exits non-zero. It does not attempt to continue.
7. Request body size is capped and the cap is enforced by *stopping the read*, not by buffering everything and checking afterwards.
8. Load test at a level that keeps ELU above 0.8 and show p99 latency stays bounded — no unbounded queue growth.

### Stretch goals

- Add W3C `traceparent` propagation: accept an incoming header, generate spans, propagate to outbound calls ([Ch. 62](../part9-production/62-observability.md)).
- Publish internal events on `diagnostics_channel` and write a separate subscriber module that turns them into metrics without the application knowing ([Ch. 48](../part7-diagnostics/48-diagnostics-channel-tracing.md)).
- Run it under `cluster` with graceful rolling restart: the primary replaces workers one at a time with zero dropped requests ([Ch. 30](../part4-system/30-cluster.md)).
- Containerise it: correct `PID 1` signal handling, a non-root user, and `--max-old-space-size` derived from the cgroup limit ([Ch. 60](../part9-production/60-deployment-and-config.md)).

---

## Project 4 — A TCP protocol with framing

**Difficulty:** ⭐⭐⭐ Where "I understand streams" gets tested.

### Goal

Design and implement a small binary request/response protocol over TCP, with a server, a client library, and a wire format you specify in a written document before you write code.

Suggested protocol: a key/value store with `GET`, `SET`, `DEL`, `SUBSCRIBE`, and server-pushed notifications. Length-prefixed binary frames.

### Required capabilities

| Capability | Chapter |
|---|---|
| `net` servers and sockets as Duplex streams | [Ch. 33](../part5-networking/33-tcp-net.md) |
| `Buffer` reading and writing, explicit endianness | [Ch. 16](../part3-data/16-buffers.md) |
| A Transform stream that reassembles frames | [Ch. 19](../part3-data/19-streams-advanced.md) |
| Backpressure on both directions | [Ch. 19](../part3-data/19-streams-advanced.md) |
| Timeouts and cancellation | [Ch. 13](../part2-async/13-abort-and-cancellation.md), [Ch. 10](../part2-async/10-timers.md) |
| Reconnection with backoff and jitter | [Ch. 62](../part9-production/62-observability.md) |
| Error propagation across the boundary | [Ch. 14](../part2-async/14-errors.md) |

### Success criteria

1. **A written spec exists before the code**: frame layout with byte offsets, field types and endianness, maximum sizes, the error frame format, and the version negotiation rule. One page.
2. **The framing survives adversarial chunking.** A test feeds the parser the same message stream one byte at a time, in random chunk sizes, and as one giant buffer, and asserts identical output in all three cases. This is the test that finds every framing bug.
3. **Oversized frames are rejected before allocation.** A declared length of 4 GB must produce a protocol error and a closed connection, not an allocation attempt. Assert that memory does not spike.
4. A truncated frame at connection close produces a clear protocol error, not a hang and not a silent partial result.
5. The client multiplexes concurrent in-flight requests over one connection, correlating responses by request ID, and a slow response does not block unrelated ones.
6. Server-pushed notifications interleave correctly with request/response traffic.
7. Killing the server mid-request causes every pending client request to reject promptly with a typed error; the client then reconnects with exponential backoff plus jitter and resubscribes.
8. Benchmark: requests per second and p99 latency for a 100-byte payload at 1, 10, and 100 concurrent clients. Explain the shape of the curve.

### Stretch goals

- Wrap it in TLS with mutual authentication and measure the handshake cost against session resumption ([Ch. 37](../part5-networking/37-tls-https.md)).
- Add a Unix domain socket transport and benchmark it against loopback TCP ([Ch. 33](../part5-networking/33-tcp-net.md)).
- Reimplement the transport over QUIC and compare head-of-line blocking behaviour under simulated packet loss ([Ch. 40](../part5-networking/40-quic-dtls.md)).
- Implement a second client in another language against your written spec. If it works, your spec was real.

---

## Project 5 — A multi-process job runner

**Difficulty:** ⭐⭐⭐ The concurrency capstone.

### Goal

A background job system: an HTTP API to submit jobs, a durable queue, a pool of workers that execute CPU-bound jobs without blocking anything, retries with backoff, and full visibility into what is happening.

### Required capabilities

| Capability | Chapter |
|---|---|
| Worker threads and message passing | [Ch. 29](../part4-system/29-worker-threads.md) |
| Transferables / `SharedArrayBuffer` for large payloads | [Ch. 29](../part4-system/29-worker-threads.md) |
| `child_process` for untrusted or non-JS jobs | [Ch. 28](../part4-system/28-child-processes.md) |
| Durable state in SQLite | [Ch. 54](../part8-advanced/54-sqlite.md) |
| Cancellation via `AbortSignal` | [Ch. 13](../part2-async/13-abort-and-cancellation.md) |
| Graceful shutdown with in-flight jobs | [Ch. 26](../part4-system/26-signals-and-shutdown.md) |
| Backoff, jitter, idempotency | [Ch. 62](../part9-production/62-observability.md) |
| Per-worker metrics | [Ch. 49](../part7-diagnostics/49-perf-hooks.md) |

### Success criteria

1. **The main thread's event loop is never blocked.** Run a CPU-saturating job on every worker and show that a `/healthz` request still returns in under 50 ms at p99. Measure event loop delay throughout and include the graph in your notes.
2. Worker pool size is configurable, defaults to something defensible given the cgroup CPU limit (not `os.cpus().length` blindly), and workers are reused across jobs rather than spawned per job. Show the cost difference.
3. A job that throws, a job that hangs forever, and a job that crashes its worker outright are all handled: the job is marked failed with a reason, the worker is replaced, and the pool keeps running.
4. Jobs are **at-least-once with idempotency keys**. Kill the process with `SIGKILL` mid-job and show that on restart the job is re-run and the observable effect happens exactly once.
5. Retries use exponential backoff with jitter and a max attempt count, after which the job lands in a dead-letter table with the full error history.
6. **`SIGTERM` drains:** stop pulling new jobs, let in-flight ones finish within a grace period, persist the state of anything still running, exit cleanly. No job is lost or silently duplicated.
7. Cancelling a submitted job actually stops it — an `AbortSignal` reaches the worker and the job's own loop checks it.
8. A 100 MB payload is passed to a worker with a transfer, not a copy. Prove it by measuring the time and showing the sender's buffer is detached afterwards.

### Stretch goals

- Add a second execution backend using `child_process` with the permission model enabled, for jobs that run untrusted code ([Ch. 28](../part4-system/28-child-processes.md), [Ch. 31](../part4-system/31-permission-model.md)).
- Scale to multiple machines by replacing the SQLite queue with a network queue, keeping the worker interface unchanged.
- Add priority scheduling and fair-share so one tenant cannot starve another. Prove fairness with a test.

---

## Project 6 — An on-demand diagnostics toolkit

**Difficulty:** ⭐⭐⭐ Deeply practical. Build this and you will use it for years.

### Goal

A module you can drop into any Node.js application that exposes a secure, local-only control channel for capturing diagnostic artifacts from a live process — without restarting it and without leaving the profiler running.

### Required capabilities

| Capability | Chapter |
|---|---|
| Diagnostic reports on demand and on signal | [Ch. 50](../part7-diagnostics/50-reports-and-heap.md) |
| Heap snapshots and heap statistics | [Ch. 50](../part7-diagnostics/50-reports-and-heap.md) |
| CPU profiling via the inspector API | [Ch. 47](../part7-diagnostics/47-debugging.md) |
| `perf_hooks`: ELU, event loop delay, GC entries | [Ch. 49](../part7-diagnostics/49-perf-hooks.md) |
| Signal handling for triggering captures | [Ch. 26](../part4-system/26-signals-and-shutdown.md) |
| Streaming large artifacts to disk without buffering | [Ch. 19](../part3-data/19-streams-advanced.md) |
| `diagnostics_channel` for capture events | [Ch. 48](../part7-diagnostics/48-diagnostics-channel-tracing.md) |

### Success criteria

1. `SIGUSR2` writes a diagnostic report to a configured directory and logs the path. The process keeps serving traffic throughout.
2. A localhost-only, token-authenticated HTTP endpoint triggers: a report, a heap snapshot, and an N-second CPU profile. It is bound to `127.0.0.1` by default and refuses to start on `0.0.0.0` without an explicit override — with a loud warning ([Ch. 44](../part6-security/44-securing-applications.md)).
3. **Taking a heap snapshot of a 2 GB heap does not OOM the process.** Stream it to disk; do not build a string. Document the pause it causes — because it does cause one, and knowing the number is the point.
4. Continuous lightweight monitoring: ELU, event loop delay percentiles, heap used, and RSS sampled on an interval that costs less than 0.5% CPU. Prove the overhead with a before/after benchmark.
5. **Automatic capture on threshold:** when ELU exceeds a configured level for N consecutive samples, capture a CPU profile automatically, at most once per cooling-off window. Test it by deliberately blocking the loop.
6. The captured heap snapshot opens in Chrome DevTools and the CPU profile opens in the flame chart view. Verify by actually doing it.
7. Everything is disabled by default and enabled by one environment variable — including the signal handler, so it cannot conflict with an application that already uses `SIGUSR2`.
8. A worked write-up: introduce a deliberate leak (an unbounded `Map` keyed by request ID), capture two snapshots, use the comparison view and the retainers panel to identify the leak, and document the exact steps. This is the deliverable that proves you can do it under pressure.

### Stretch goals

- Add trace event capture for a fixed window and merge it into the same artifact bundle ([Ch. 48](../part7-diagnostics/48-diagnostics-channel-tracing.md)).
- Support workers: capture from every thread and label the artifacts ([Ch. 29](../part4-system/29-worker-threads.md)).
- Add a `--report-on-fatalerror` path plus an uploader that ships crash artifacts to object storage on restart ([Ch. 60](../part9-production/60-deployment-and-config.md)).

---

## Project 7 — A single-executable CLI with an embedded database

**Difficulty:** ⭐⭐⭐⭐ Lots of moving parts, most of them build tooling.

### Goal

A useful CLI tool — a bookmark manager, a time tracker, a local search index — that ships as **one file** with no Node.js installation required, stores data in SQLite, and behaves like a well-mannered Unix tool.

### Required capabilities

| Capability | Chapter |
|---|---|
| Single executable applications and asset embedding | [Ch. 55](../part8-advanced/55-single-executable.md) |
| Virtual file system for bundled assets | [Ch. 55](../part8-advanced/55-single-executable.md) |
| `node:sqlite`: schema, prepared statements, transactions | [Ch. 54](../part8-advanced/54-sqlite.md) |
| Argument parsing and subcommands | [Ch. 11](../part2-async/11-promises-and-async.md) |
| Readline for interactive mode | [Ch. 27](../part4-system/27-os-tty-readline.md) |
| TTY detection, colour, `NO_COLOR` | [Ch. 27](../part4-system/27-os-tty-readline.md) |
| Cross-platform config and data paths | [Ch. 24](../part4-system/24-paths.md), [Ch. 27](../part4-system/27-os-tty-readline.md) |
| Cold start measurement | [Ch. 61](../part9-production/61-performance-tuning.md) |

### Success criteria

1. A single binary runs on a machine with **no Node.js installed**. Verify in a clean container, not on your laptop.
2. **Cold start under 100 ms** for a trivial subcommand (`--version`), measured as wall-clock time over 100 runs, reported as p50 and p99. If you miss it, use a startup snapshot and report the before/after.
3. The database schema is created on first run and **migrated on version change**, inside a transaction, with an integrity check afterwards. A failed migration leaves the old database intact.
4. Data lives in the platform-correct location — `%APPDATA%` on Windows, `$XDG_DATA_HOME` or `~/.local/share` on Linux, `~/Library/Application Support` on macOS — and is overridable by an environment variable.
5. **It composes.** `mytool list --json | jq` works, output is plain when not a TTY, colour is suppressed by `NO_COLOR`, exit codes are meaningful, errors go to stderr, and data goes to stdout. `mytool list | head -1` does not produce an `EPIPE` trace.
6. Concurrent invocations do not corrupt the database. Test it: 20 processes writing simultaneously. Configure SQLite appropriately and document what you chose and why.
7. Builds for at least two platforms via a documented, reproducible build script, and the binary is signed or checksummed.
8. `mytool --help` is genuinely good: subcommands, examples, and exit code documentation.

### Stretch goals

- Add full-text search using SQLite's FTS and benchmark it against a naive `LIKE` scan on 100,000 rows ([Ch. 54](../part8-advanced/54-sqlite.md)).
- Add a self-update command that verifies a signature before replacing the binary ([Ch. 42](../part6-security/42-crypto-encryption.md)).
- Add an interactive mode with history and tab completion ([Ch. 27](../part4-system/27-os-tty-readline.md)).
- Publish it to npm *as well*, so the same codebase ships both as a package and as a binary. Solve the dual-distribution problem honestly ([Ch. 6](../part1-foundations/06-packages-and-exports.md)).

---

## Project 8 — A native or WASM hot path, with proof

**Difficulty:** ⭐⭐⭐⭐⭐ The hardest, and the one that most changes how you think.

### Goal

Find a genuinely CPU-bound operation in JavaScript, implement it in native code **and** in WebAssembly, and produce a rigorous benchmark that shows which wins, by how much, and at what input size the crossover happens. The deliverable is the measurement as much as the code.

Good candidates: a hash or checksum over large buffers; image resizing; a specific parser (CSV with quoting, or a binary format); a distance metric over large vectors; run-length or delta encoding.

### Required capabilities

| Capability | Chapter |
|---|---|
| Node-API addon with `node-gyp` | [Ch. 56](../part8-advanced/56-node-api-addons.md) |
| Buffer/TypedArray access from native code without copying | [Ch. 56](../part8-advanced/56-node-api-addons.md), [Ch. 16](../part3-data/16-buffers.md) |
| Async work off the event loop (Node-API async work) | [Ch. 56](../part8-advanced/56-node-api-addons.md) |
| WASM compilation and instantiation, linear memory | [Ch. 57](../part8-advanced/57-wasm-wasi.md) |
| Benchmark methodology and statistics | [Ch. 61](../part9-production/61-performance-tuning.md), [Ch. 49](../part7-diagnostics/49-perf-hooks.md) |
| Worker threads as the third comparison point | [Ch. 29](../part4-system/29-worker-threads.md) |

### Success criteria

1. **Four implementations** of the same operation, byte-for-byte identical outputs, verified by a shared test suite with fuzzed inputs: (a) plain JavaScript, (b) optimised JavaScript (typed arrays, no allocation in the loop), (c) a Node-API addon, (d) WASM.
2. **A benchmark that is defensible.** Warm-up iterations discarded, enough samples for a stable result, variance reported alongside the mean, input sizes spanning at least four orders of magnitude, and the machine and Node.js version recorded. Anyone should be able to re-run it and get the same shape.
3. **The crossover point is identified and explained.** For small inputs, the boundary-crossing cost dominates and plain JavaScript wins. Find that size for both native and WASM, report it, and explain *why* the two crossovers differ.
4. **No copying on the boundary.** The native addon operates directly on the `Buffer`'s memory. Prove it by benchmarking with a 100 MB input and showing time does not scale with an extra copy.
5. **The addon does not block the event loop.** The async variant runs on Node-API's async work queue; show that event loop delay stays flat while it runs, and contrast with the synchronous variant, which should visibly spike it.
6. **The addon builds against at least two Node.js major versions without recompilation**, demonstrating Node-API's ABI stability. Say what `process.versions.modules` is in each.
7. **A memory safety story.** Run the native tests under a sanitiser or `valgrind` and show no leaks and no invalid accesses across 10,000 iterations, including error paths and early returns.
8. **A written conclusion** that says when this optimisation is worth it. If the honest answer is "the optimised JavaScript is within 15% and none of this is worth the build complexity", that is an excellent result — and a more valuable one than a win, because it is the answer most of the time.

### Stretch goals

- Add SIMD in both implementations (WASM SIMD, and intrinsics natively) and re-measure ([Ch. 57](../part8-advanced/57-wasm-wasi.md)).
- Compare the Node-API addon against the experimental `node:ffi` calling the same compiled library, and quantify the per-call overhead difference ([Ch. 58](../part8-advanced/58-ffi-and-embedding.md)).
- Distribute prebuilt binaries for three platforms with a source-build fallback, and document what happens when a user has no compiler ([Ch. 6](../part1-foundations/06-packages-and-exports.md)).
- Test whether four worker threads running the optimised JavaScript beat one native thread. Frequently they do, and that result should change your default instinct ([Ch. 29](../part4-system/29-worker-threads.md)).

---

## Choosing one

| If you want to... | Build |
|---|---|
| Consolidate streams and the CLI surface | Project 1 |
| Learn how much correctness hides in "simple" HTTP | Project 2 |
| Have something to show at work on Monday | Project 3 |
| Understand what a socket really is | Project 4 |
| Master concurrency in Node.js | Project 5 |
| Never be helpless during an incident again | Project 6 |
| Ship a tool real people install | Project 7 |
| Know when *not* to reach for native code | Project 8 |

Whichever you pick, write down the success criteria before you start and check them off at the end. The habit of stating what "done" means before writing code is, in the long run, worth more than any single API in this book.

---

## Where to go next

- [Chapter 59 — Application Architecture and Project Layout](../part9-production/59-application-architecture.md) — how to structure whichever project you chose.
- [Chapter 61 — Performance Tuning](../part9-production/61-performance-tuning.md) and [Chapter 62 — Observability in Production](../part9-production/62-observability.md) — the measurement discipline every brief above assumes.
- [Chapter 63 — Upgrading Node.js](../part9-production/63-upgrading-node.md) — because your project will outlive the release line you started it on.
- [Appendix E — Stability Index and Release Lines](e-stability-and-releases.md) — before you depend on anything experimental in a project you intend to keep.
- [Appendix G — Module → Chapter Map](g-module-map.md) — for the chapter that covers whatever you hit next.
- The Node.js repository: <https://github.com/nodejs/node>
- Contributor documentation: <https://github.com/nodejs/node/tree/main/doc/contributing>
