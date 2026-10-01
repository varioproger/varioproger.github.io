---
chapter: "G"
part: "Appendices"
title: "Module → Chapter Map"
level: beginner
reading_time: "18 min"
prerequisites: []
source_docs:
  - "doc/api/index.md"
  - "doc/api/documentation.md"
source_url: "https://nodejs.org/docs/latest/api/index.html"
node_baseline: "27.0.0-pre"
---

# Appendix G — Module → Chapter Map

## How to use this appendix

You are reading someone else's code, or a stack trace, or a doc page, and you hit a module you do not know. This appendix answers three things in one line each: **what it is for**, **whether it is safe to depend on**, and **where in this book it is taught**.

There are three sections:

1. **The grouped map** — every documented builtin, organised the way this book is organised, so you can also read it as a table of contents by subject.
2. **The alphabetical quick index** — module name to chapter number, nothing else, for looking something up in five seconds.
3. **Documented modules without a dedicated chapter** — an explicit, complete list of the handful this book teaches *inside* another chapter rather than giving its own. No silent gaps.

Coverage is the full set of documents in the Node.js API reference at **27.0.0-pre**: 70 documents, including two (`quic` and `dtls`) that ship documentation but are not yet listed in the reference index.

**Reading the Stability column.** Blank means Stability 2 — Stable, the default, safe to build on. Anything else is spelled out. For what each level actually commits to, and what to do about it, see [Appendix E](e-stability-and-releases.md). Where a level applies to only part of a module, the note says so — module-level and section-level stability are different things, and `node:module` alone contains APIs at three different levels.

---

## 1. The grouped map

### Part I — Foundations

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [About this documentation](https://nodejs.org/docs/latest/api/documentation.html) | Defines the stability index itself and how the reference is organised. The most under-read page in the docs. | — | [Ch. 2](../part1-foundations/02-install-and-release-lines.md), [App. E](e-stability-and-releases.md) |
| [Usage and example](https://nodejs.org/docs/latest/api/synopsis.html) | The one-page "here is what a Node.js program looks like" introduction. | — | [Ch. 1](../part1-foundations/01-what-is-nodejs.md), [Ch. 3](../part1-foundations/03-running-code-cli-repl.md) |
| [`node:modules` (CommonJS)](https://nodejs.org/docs/latest/api/modules.html) | The original module system: `require()`, `module.exports`, and the resolution algorithm behind them. | — | [Ch. 4](../part1-foundations/04-modules-commonjs.md) |
| [ECMAScript modules](https://nodejs.org/docs/latest/api/esm.html) | The standard module system in Node.js: specifiers, `import.meta`, top-level `await`, and CJS interop. | — | [Ch. 5](../part1-foundations/05-modules-esm.md) |
| [Packages](https://nodejs.org/docs/latest/api/packages.html) | How `package.json` controls resolution: `type`, `exports`, `imports`, conditions, dual publishing. | Syntax detection is 1.2; package maps are 1 — Experimental | [Ch. 6](../part1-foundations/06-packages-and-exports.md) |
| [TypeScript](https://nodejs.org/docs/latest/api/typescript.html) | Running TypeScript directly with type stripping, and how that interacts with module resolution. | — | [Ch. 7](../part1-foundations/07-typescript.md) |
| [Globals](https://nodejs.org/docs/latest/api/globals.html) | Everything available without an import: `globalThis`, `fetch`, `URL`, `structuredClone`, `Buffer`, timers. | Some entries are 3 — Legacy (e.g. `global`, `atob`/`btoa`) | [Ch. 8](../part1-foundations/08-globals-and-environment.md) |
| [Environment variables](https://nodejs.org/docs/latest/api/environment_variables.html) | Variables Node.js itself reads at startup: `NODE_OPTIONS`, `NODE_ENV`, `UV_THREADPOOL_SIZE`, and the rest. | — | [Ch. 8](../part1-foundations/08-globals-and-environment.md), [App. B](b-environment-variables.md) |
| [Command-line options](https://nodejs.org/docs/latest/api/cli.html) | Every flag the `node` binary accepts, plus how `NODE_OPTIONS` and config files feed into them. | One flag is 3 — Legacy | [Ch. 3](../part1-foundations/03-running-code-cli-repl.md), [App. A](a-cli-flags.md) |
| [`node:repl`](https://nodejs.org/docs/latest/api/repl.html) | The interactive prompt, and the API for embedding your own REPL in a tool. | — | [Ch. 3](../part1-foundations/03-running-code-cli-repl.md) |

### Part II — Asynchrony

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [`node:timers`](https://nodejs.org/docs/latest/api/timers.html) | `setTimeout`, `setInterval`, `setImmediate`, and their promise-returning versions in `node:timers/promises`. | `clearImmediate`-adjacent legacy entries are 3 | [Ch. 10](../part2-async/10-timers.md), [Ch. 9](../part2-async/09-event-loop.md) |
| [`node:events`](https://nodejs.org/docs/latest/api/events.html) | `EventEmitter`, plus `once()`, `on()` as an async iterator, `EventTarget`, and `AbortSignal` plumbing. | A few `Event` methods are 3 — Legacy | [Ch. 12](../part2-async/12-eventemitter.md), [Ch. 13](../part2-async/13-abort-and-cancellation.md) |
| [`node:util`](https://nodejs.org/docs/latest/api/util.html) | The miscellany drawer: `promisify`, `callbackify`, `inspect`, `parseArgs`, `styleText`, type predicates. | `util.inherits` is 3 — Legacy | [Ch. 11](../part2-async/11-promises-and-async.md), [Ch. 51](../part7-diagnostics/51-console-and-logging.md) |
| [Errors](https://nodejs.org/docs/latest/api/errors.html) | The error taxonomy, the `ERR_*` code system, and what each system error means. | A handful of newer error APIs are 1 | [Ch. 14](../part2-async/14-errors.md), [App. C](c-error-codes.md) |
| [`node:domain`](https://nodejs.org/docs/latest/api/domain.html) | The pre-2015 attempt at grouping async operations for error handling. Kept for compatibility only. | **0 — Deprecated** | [Ch. 14](../part2-async/14-errors.md) |
| [`node:async_hooks` — async context](https://nodejs.org/docs/latest/api/async_context.html) | `AsyncLocalStorage` and `AsyncResource`: carrying request context through async call chains. | — | [Ch. 15](../part2-async/15-async-context.md) |
| [`node:async_hooks`](https://nodejs.org/docs/latest/api/async_hooks.html) | The raw lifecycle hooks for every async resource. Powerful, hazardous, and explicitly not recommended. | **1 — Experimental**, with a documented "migrate away" notice | [Ch. 15](../part2-async/15-async-context.md) |

### Part III — Data and Streams

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [`node:buffer`](https://nodejs.org/docs/latest/api/buffer.html) | Raw byte handling: `Buffer`, `Blob`, `File`, and the encodings they convert between. | Two `Buffer` base64 helpers are 3 — Legacy | [Ch. 16](../part3-data/16-buffers.md) |
| [`node:string_decoder`](https://nodejs.org/docs/latest/api/string_decoder.html) | Decoding a byte stream to text without corrupting multi-byte characters split across chunks. | — | [Ch. 17](../part3-data/17-encodings.md) |
| [Internationalization](https://nodejs.org/docs/latest/api/intl.html) | How ICU is built into Node.js, which `Intl` features you get, and how a small-ICU build changes behaviour. | — | [Ch. 17](../part3-data/17-encodings.md) |
| [`node:stream`](https://nodejs.org/docs/latest/api/stream.html) | The classic stream system: `Readable`, `Writable`, `Duplex`, `Transform`, `pipeline`, backpressure. | — | [Ch. 18](../part3-data/18-streams-concepts.md), [Ch. 19](../part3-data/19-streams-advanced.md) |
| [`node:stream/iter`](https://nodejs.org/docs/latest/api/stream_iter.html) | A streaming API built on plain iterables and async iterables instead of classes and events. | **1 — Experimental**, needs `--experimental-stream-iter` | [Ch. 19](../part3-data/19-streams-advanced.md) |
| [Web Streams](https://nodejs.org/docs/latest/api/webstreams.html) | The WHATWG `ReadableStream`/`WritableStream`/`TransformStream` API, and adapters to and from Node streams. | — | [Ch. 20](../part3-data/20-web-streams.md) |
| [`node:zlib`](https://nodejs.org/docs/latest/api/zlib.html) | Compression and decompression: gzip, deflate, Brotli, Zstandard — as streams and as one-shot calls. Also `node:zlib/iter`. | — | [Ch. 21](../part3-data/21-zlib.md) |

### Part IV — System Interfaces

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [`node:fs`](https://nodejs.org/docs/latest/api/fs.html) | The file system, in three flavours: promises, callbacks, and sync. Also `Dir`, `Dirent`, `FileHandle`, watchers. | — | [Ch. 22](../part4-system/22-filesystem-basics.md), [Ch. 23](../part4-system/23-filesystem-advanced.md) |
| [`node:path`](https://nodejs.org/docs/latest/api/path.html) | Manipulating file paths correctly on both POSIX and Windows, including the `posix` and `win32` sub-namespaces. | — | [Ch. 24](../part4-system/24-paths.md) |
| [`process`](https://nodejs.org/docs/latest/api/process.html) | The running process: `argv`, `env`, stdio, exit codes, signals, resource usage, `process.report`. | Mixed — `process.hrtime()` and `process.nextTick()` are 3 — Legacy, `process.features.ipv6` is 0 — Deprecated, a few newer APIs are 1 | [Ch. 25](../part4-system/25-process-object.md), [Ch. 26](../part4-system/26-signals-and-shutdown.md) |
| [`node:os`](https://nodejs.org/docs/latest/api/os.html) | Machine facts: CPUs, memory, network interfaces, temp directory, platform, load average. | — | [Ch. 27](../part4-system/27-os-tty-readline.md) |
| [`node:tty`](https://nodejs.org/docs/latest/api/tty.html) | Detecting and controlling terminals: `isTTY`, raw mode, window size, colour depth. | — | [Ch. 27](../part4-system/27-os-tty-readline.md) |
| [`node:readline`](https://nodejs.org/docs/latest/api/readline.html) | Reading input line by line, from a terminal or any stream, with history and completion. | — | [Ch. 27](../part4-system/27-os-tty-readline.md) |
| [`node:child_process`](https://nodejs.org/docs/latest/api/child_process.html) | Running other programs: `spawn`, `exec`, `execFile`, `fork`, stdio wiring, and IPC. | — | [Ch. 28](../part4-system/28-child-processes.md) |
| [`node:worker_threads`](https://nodejs.org/docs/latest/api/worker_threads.html) | Real threads inside one process, with message passing, `SharedArrayBuffer`, and transferables. | — | [Ch. 29](../part4-system/29-worker-threads.md) |
| [`node:cluster`](https://nodejs.org/docs/latest/api/cluster.html) | Forking one worker process per core and sharing a listening socket between them. | — | [Ch. 30](../part4-system/30-cluster.md) |
| [Permissions](https://nodejs.org/docs/latest/api/permissions.html) | The `--permission` model: restricting file system access, child processes, workers, and addon loading. | — | [Ch. 31](../part4-system/31-permission-model.md) |

### Part V — Networking

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [`node:url`](https://nodejs.org/docs/latest/api/url.html) | The WHATWG `URL` and `URLSearchParams`, plus file-URL conversion helpers. | The legacy `url.parse()` API is 3 — Legacy | [Ch. 32](../part5-networking/32-url-and-querystring.md), [Ch. 24](../part4-system/24-paths.md) |
| [`node:querystring`](https://nodejs.org/docs/latest/api/querystring.html) | The older query-string parser, still faster than `URLSearchParams` for some shapes. | — | [Ch. 32](../part5-networking/32-url-and-querystring.md) |
| [`node:punycode`](https://nodejs.org/docs/latest/api/punycode.html) | ASCII encoding of internationalised domain names. Superseded by `URL`'s built-in handling. | **0 — Deprecated** | [Ch. 32](../part5-networking/32-url-and-querystring.md) |
| [`node:net`](https://nodejs.org/docs/latest/api/net.html) | TCP servers and clients, and Unix domain sockets / Windows named pipes. Sockets are Duplex streams. | — | [Ch. 33](../part5-networking/33-tcp-net.md) |
| [`node:dns`](https://nodejs.org/docs/latest/api/dns.html) | Name resolution, in two very different modes: `lookup()` (OS resolver, thread pool) and `resolve*()` (direct queries). | — | [Ch. 34](../part5-networking/34-dns.md) |
| [`node:http`](https://nodejs.org/docs/latest/api/http.html) | HTTP/1.1 servers and clients, the `Agent` connection pool, and the raw request/response objects. | — | [Ch. 35](../part5-networking/35-http-servers.md), [Ch. 36](../part5-networking/36-http-clients.md) |
| [`node:https`](https://nodejs.org/docs/latest/api/https.html) | The TLS-wrapped variants of the `http` server, client, and agent. A thin layer over `http` and `tls`. | — | [Ch. 36](../part5-networking/36-http-clients.md), [Ch. 37](../part5-networking/37-tls-https.md) |
| [`node:tls`](https://nodejs.org/docs/latest/api/tls.html) | TLS and SSL: certificates, the handshake, SNI, ALPN, session resumption, mutual TLS. | — | [Ch. 37](../part5-networking/37-tls-https.md) |
| [`node:http2`](https://nodejs.org/docs/latest/api/http2.html) | HTTP/2 servers and clients: multiplexed streams, HPACK header compression, flow control, and the compatibility API. | — | [Ch. 38](../part5-networking/38-http2.md) |
| [`node:dgram`](https://nodejs.org/docs/latest/api/dgram.html) | UDP sockets, including multicast and broadcast. | — | [Ch. 39](../part5-networking/39-udp-dgram.md) |
| [`node:quic`](https://nodejs.org/docs/latest/api/quic.html) | QUIC endpoints and sessions — the transport under HTTP/3. | **1.0 — Early development** | [Ch. 40](../part5-networking/40-quic-dtls.md) |
| [`node:dtls`](https://nodejs.org/docs/latest/api/dtls.html) | TLS over datagrams, for securing UDP traffic. | **1 — Experimental** | [Ch. 40](../part5-networking/40-quic-dtls.md) |

### Part VI — Security and Cryptography

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [`node:crypto`](https://nodejs.org/docs/latest/api/crypto.html) | The full OpenSSL surface: hashing, HMAC, ciphers, signatures, key generation and import, X.509, secure randomness. | Some engine and legacy-key APIs are deprecated | [Ch. 41](../part6-security/41-crypto-essentials.md), [Ch. 42](../part6-security/42-crypto-encryption.md) |
| [Web Crypto API](https://nodejs.org/docs/latest/api/webcrypto.html) | The standard `crypto.subtle` API, shared with browsers: promise-based, narrower, harder to misuse. | — | [Ch. 43](../part6-security/43-webcrypto.md) |
| [`SECURITY.md`](https://github.com/nodejs/node/blob/main/SECURITY.md) | Not an API doc, but the definitive statement of the Node.js threat model — what counts as a vulnerability and what does not. | — | [Ch. 44](../part6-security/44-securing-applications.md), [App. E](e-stability-and-releases.md) |

### Part VII — Testing, Debugging, Diagnostics

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [`node:test`](https://nodejs.org/docs/latest/api/test.html) | The built-in test runner: `describe`/`it`, mocking, snapshots, coverage, watch mode, TAP and other reporters. | — | [Ch. 45](../part7-diagnostics/45-test-runner.md) |
| [`node:assert`](https://nodejs.org/docs/latest/api/assert.html) | Assertions, in strict and legacy modes, including `assert.partialDeepStrictEqual` and the `AssertionError` shape. | The four non-strict comparisons are 3 — Legacy | [Ch. 46](../part7-diagnostics/46-assertions.md) |
| [Debugger](https://nodejs.org/docs/latest/api/debugger.html) | The built-in command-line debugger reached with `node inspect`. | — | [Ch. 47](../part7-diagnostics/47-debugging.md) |
| [`node:inspector`](https://nodejs.org/docs/latest/api/inspector.html) | Programmatic access to the Chrome DevTools Protocol: drive the profiler or take a heap snapshot from inside your own process. | — | [Ch. 47](../part7-diagnostics/47-debugging.md) |
| [`node:diagnostics_channel`](https://nodejs.org/docs/latest/api/diagnostics_channel.html) | A named publish/subscribe bus for instrumentation, with near-zero cost when nothing is subscribed. | — | [Ch. 48](../part7-diagnostics/48-diagnostics-channel-tracing.md) |
| [`node:trace_events`](https://nodejs.org/docs/latest/api/tracing.html) | Enabling and capturing low-level trace categories from V8 and Node.js core into a Chrome-tracing file. | **1 — Experimental** | [Ch. 48](../part7-diagnostics/48-diagnostics-channel-tracing.md) |
| [`node:perf_hooks`](https://nodejs.org/docs/latest/api/perf_hooks.html) | The Performance Timeline in Node.js: marks, measures, observers, GC and HTTP entries, and event loop utilization. | — | [Ch. 49](../part7-diagnostics/49-perf-hooks.md) |
| [Diagnostic report](https://nodejs.org/docs/latest/api/report.html) | A JSON dump of stacks, heap statistics, active handles, resource usage and environment, on demand or on crash. | — | [Ch. 50](../part7-diagnostics/50-reports-and-heap.md) |
| [`node:v8`](https://nodejs.org/docs/latest/api/v8.html) | Heap statistics, heap snapshots, the serialization API, and V8 flag control from JavaScript. | Some newer APIs are 1 — Experimental | [Ch. 50](../part7-diagnostics/50-reports-and-heap.md), [Ch. 61](../part9-production/61-performance-tuning.md) |
| [`node:console`](https://nodejs.org/docs/latest/api/console.html) | The global `console`, plus the `Console` class for writing formatted output to any stream. | — | [Ch. 51](../part7-diagnostics/51-console-and-logging.md) |

### Part VIII — Advanced and Native

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [`node:vm`](https://nodejs.org/docs/latest/api/vm.html) | Compiling and running code in separate V8 contexts. Isolation of scope, explicitly **not** a security sandbox. | — | [Ch. 52](../part8-advanced/52-vm-sandboxing.md) |
| [`node:module`](https://nodejs.org/docs/latest/api/module.html) | The module system's own API: `createRequire`, `registerHooks`, source map support, the builtin list. | Mixed — `registerHooks()` is 1.2, `findPackageJSON()` is 1.1, `register()` is **0 — Deprecated** | [Ch. 53](../part8-advanced/53-module-hooks.md) |
| [`node:sqlite`](https://nodejs.org/docs/latest/api/sqlite.html) | An embedded SQL database built into Node.js: synchronous statements, prepared queries, sessions, backups. | **1.2 — Release candidate** | [Ch. 54](../part8-advanced/54-sqlite.md) |
| [Single executable applications](https://nodejs.org/docs/latest/api/single-executable-applications.html) | Bundling your app into the Node.js binary, plus the `node:sea` API for reading embedded assets. | **1.1 — Active development** | [Ch. 55](../part8-advanced/55-single-executable.md) |
| [`node:vfs`](https://nodejs.org/docs/latest/api/vfs.html) | Mounting a virtual, in-memory file tree that `fs` operations can read — the asset mechanism behind SEA. | **1 — Experimental** | [Ch. 55](../part8-advanced/55-single-executable.md) |
| [Node-API](https://nodejs.org/docs/latest/api/n-api.html) | The ABI-stable C API for native addons: write once, keep working across Node.js majors without recompiling. | — | [Ch. 56](../part8-advanced/56-node-api-addons.md) |
| [C++ addons](https://nodejs.org/docs/latest/api/addons.html) | Writing addons directly against V8 and libuv headers, with `node-gyp`, plus the `nan` and `node-addon-api` wrappers. | Loading addons via `import` is **1.0 — Early development** | [Ch. 56](../part8-advanced/56-node-api-addons.md) |
| [`node:wasi`](https://nodejs.org/docs/latest/api/wasi.html) | Running WebAssembly modules that need system calls. The docs warn it is not a security sandbox. | **1 — Experimental** | [Ch. 57](../part8-advanced/57-wasm-wasi.md) |
| [`node:ffi`](https://nodejs.org/docs/latest/api/ffi.html) | Calling functions in native shared libraries from JavaScript, with no C++ addon to build. | **1 — Experimental** | [Ch. 58](../part8-advanced/58-ffi-and-embedding.md) |
| [C++ embedder API](https://nodejs.org/docs/latest/api/embedding.html) | Running a Node.js environment inside your own C++ program. | — | [Ch. 58](../part8-advanced/58-ffi-and-embedding.md) |

### Part IX — Production Practice

| Doc / module | What it is for | Stability | Chapter |
|---|---|---|---|
| [Deprecated APIs](https://nodejs.org/docs/latest/api/deprecations.html) | The complete `DEPXXXX` register, with the stage each deprecation has reached and what to use instead. | — | [Ch. 63](../part9-production/63-upgrading-node.md), [App. D](d-deprecations.md) |
| [Index](https://nodejs.org/docs/latest/api/index.html) | The official list of every reference document. The source for this appendix. | — | This appendix |

---

## 2. Alphabetical quick index

Module or document, then the chapter that teaches it. Where two chapters split a module, both are listed; the first is the primary one.

| Module / doc | Chapter(s) |
|---|---|
| `node:assert` | 46 |
| `node:async_hooks` (async context) | 15 |
| `node:async_hooks` (raw hooks) | 15 |
| `node:buffer` | 16 |
| C++ addons | 56 |
| C++ embedder API | 58 |
| `node:child_process` | 28 |
| CLI options | 3, App. A |
| `node:cluster` | 30 |
| `node:console` | 51 |
| `node:crypto` | 41, 42 |
| Debugger | 47 |
| Deprecated APIs | 63, App. D |
| `node:dgram` | 39 |
| `node:diagnostics_channel` | 48 |
| `node:dns` | 34 |
| Documentation / stability index | 2, App. E |
| `node:domain` | 14 |
| `node:dtls` | 40 |
| Environment variables | 8, App. B |
| Errors | 14, App. C |
| ESM (ECMAScript modules) | 5 |
| `node:events` | 12, 13 |
| `node:ffi` | 58 |
| `node:fs` | 22, 23 |
| Globals | 8 |
| `node:http` | 35, 36 |
| `node:http2` | 38 |
| `node:https` | 36, 37 |
| Index (this list) | App. G |
| `node:inspector` | 47 |
| Internationalization (`Intl`) | 17 |
| `node:module` | 53 |
| Modules: CommonJS | 4 |
| Node-API | 56 |
| `node:net` | 33 |
| `node:os` | 27 |
| Packages / `package.json` | 6 |
| `node:path` | 24 |
| `node:perf_hooks` | 49 |
| Permissions | 31 |
| `process` | 25, 26 |
| `node:punycode` | 32 |
| `node:querystring` | 32 |
| `node:quic` | 40 |
| `node:readline` | 27 |
| `node:repl` | 3 |
| Report (diagnostic) | 50 |
| `node:sea` / single executable | 55 |
| `node:sqlite` | 54 |
| `node:stream` | 18, 19 |
| `node:stream/iter` | 19 |
| `node:string_decoder` | 17 |
| Synopsis / usage | 1, 3 |
| `node:test` | 45 |
| `node:timers` | 10, 9 |
| `node:tls` | 37 |
| `node:trace_events` | 48 |
| `node:tty` | 27 |
| TypeScript | 7 |
| `node:url` | 32, 24 |
| `node:util` | 11, 51 |
| `node:v8` | 50, 61 |
| `node:vfs` | 55 |
| `node:vm` | 52 |
| `node:wasi` | 57 |
| Web Crypto API | 43 |
| Web Streams API | 20 |
| `node:worker_threads` | 29 |
| `node:zlib` | 21 |

---

## 3. Documented modules with no dedicated chapter

Sixty-three chapters is a lot, but it is not seventy. Some documented modules are small, deprecated, or best understood as part of a larger subject, so this book teaches them inside another chapter rather than giving them their own. Here is the complete list, so nothing in the official reference is unaccounted for.

| Module / doc | Why no dedicated chapter | Where it is covered |
|---|---|---|
| `node:punycode` | **Deprecated.** A single encoding function that `URL` now applies for you. Teaching it standalone would suggest you should reach for it. | [Ch. 32 — URLs, Query Strings, and Punycode](../part5-networking/32-url-and-querystring.md), in the IDNA section |
| `node:querystring` | Small, and only meaningful in contrast with `URLSearchParams`. | [Ch. 32](../part5-networking/32-url-and-querystring.md), compared side by side with the WHATWG API |
| `node:domain` | **Deprecated**, and its whole purpose is now served by `AsyncLocalStorage`. It appears so you can recognise it in old code. | [Ch. 14 — Errors](../part2-async/14-errors.md), with the migration path in [Ch. 15](../part2-async/15-async-context.md) |
| `node:string_decoder` | One class solving one problem, and that problem is inseparable from character encodings. | [Ch. 17 — Character Encodings, StringDecoder, and Intl](../part3-data/17-encodings.md) |
| Internationalization (`Intl`) | Not a module — a set of build-time capabilities and standard globals. | [Ch. 17](../part3-data/17-encodings.md), including small-ICU builds |
| `node:tty` | Rarely used directly; it exists to answer "am I writing to a terminal?", which belongs with the terminal chapter. | [Ch. 27 — OS Information, TTY, and Readline](../part4-system/27-os-tty-readline.md) |
| `node:https` | A thin wrapper joining `http` and `tls`. Splitting it out would mean saying everything twice. | [Ch. 36 — HTTP/1.1 Clients](../part5-networking/36-http-clients.md) and [Ch. 37 — TLS and HTTPS](../part5-networking/37-tls-https.md) |
| `node:async_hooks` (raw hooks) | **Experimental**, with an explicit "migrate away" notice in its own documentation. | [Ch. 15 — AsyncLocalStorage and Context Propagation](../part2-async/15-async-context.md), as background for how context tracking works |
| `node:trace_events` | **Experimental**, and best taught next to Diagnostics Channel, which it complements. | [Ch. 48 — Diagnostics Channel and Trace Events](../part7-diagnostics/48-diagnostics-channel-tracing.md) |
| `node:v8` | A grab-bag of heap statistics, serialization, and flag control that splits naturally across two existing chapters. | [Ch. 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md) and [Ch. 61 — Performance Tuning](../part9-production/61-performance-tuning.md) |
| `node:inspector` | Only meaningful alongside the protocol and tooling it exposes. | [Ch. 47 — Debugging](../part7-diagnostics/47-debugging.md) |
| Debugger (`node inspect`) | A CLI front end to the same protocol. | [Ch. 47](../part7-diagnostics/47-debugging.md) |
| `node:vfs` | **Experimental**, and it exists today mainly to serve single executable applications. | [Ch. 55 — Single Executable Applications and the Virtual File System](../part8-advanced/55-single-executable.md) |
| `node:stream/iter` | **Experimental** and flag-gated; taught as an alternative style once you understand classic streams. | [Ch. 19 — Streams II](../part3-data/19-streams-advanced.md) |
| `node:dtls` | **Experimental**, and it shares almost all of its concepts with QUIC and TLS. | [Ch. 40 — QUIC and DTLS](../part5-networking/40-quic-dtls.md) |
| C++ addons (`addons.md`) | The modern answer is Node-API; raw V8 addons are covered as context and as the thing Node-API saves you from. | [Ch. 56 — Node-API: Native Addons in C/C++](../part8-advanced/56-node-api-addons.md) |
| C++ embedder API | A C++ topic, not a JavaScript one; it pairs naturally with FFI as "the two directions across the boundary". | [Ch. 58 — FFI and Embedding Node.js](../part8-advanced/58-ffi-and-embedding.md) |
| Globals | Not a module. A survey of what exists without importing. | [Ch. 8 — Globals and the Runtime Environment](../part1-foundations/08-globals-and-environment.md) |
| Environment variables | Reference material rather than a subject. | [Ch. 8](../part1-foundations/08-globals-and-environment.md) and [Appendix B](b-environment-variables.md) |
| CLI options | Same: taught by category, catalogued in an appendix. | [Ch. 3](../part1-foundations/03-running-code-cli-repl.md) and [Appendix A](a-cli-flags.md) |
| Errors | Taught as a strategy chapter; the code list is a lookup table. | [Ch. 14](../part2-async/14-errors.md) and [Appendix C](c-error-codes.md) |
| Deprecated APIs | Same pattern. | [Ch. 63](../part9-production/63-upgrading-node.md) and [Appendix D](d-deprecations.md) |
| About this documentation / Index / Synopsis | Meta-documents about the reference itself. | [Ch. 1](../part1-foundations/01-what-is-nodejs.md), [Ch. 2](../part1-foundations/02-install-and-release-lines.md), [Appendix E](e-stability-and-releases.md), and this appendix |

Two notes on completeness:

- **`node:timers/promises`, `node:fs/promises`, `node:stream/promises`, `node:dns/promises`, `node:zlib/iter`, `node:test/reporters`, `node:readline/promises`, `node:path/posix`, `node:path/win32`, `node:stream/web`, `node:assert/strict`** are sub-modules documented inside their parent's page rather than separately. They are taught in the same chapter as their parent.
- **`quic` and `dtls`** ship documentation at 27.0.0-pre but are not yet linked from the official reference index. That is a sign of how early they are, not an oversight in this map.

---

## Where to go next

- [Appendix E — Stability Index and Release Lines](e-stability-and-releases.md) — what the Stability column actually commits you to.
- [Appendix A — CLI Flag Reference](a-cli-flags.md) — including the `--experimental-*` flags several of the modules above require.
- [Appendix F — Glossary](f-glossary.md) — when the unfamiliar word is a concept rather than a module.
- [Chapter 59 — Application Architecture and Project Layout](../part9-production/59-application-architecture.md) — how these modules get assembled into something maintainable.
- Official index: <https://nodejs.org/docs/latest/api/index.html>
