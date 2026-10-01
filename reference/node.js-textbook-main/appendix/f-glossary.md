---
chapter: "F"
part: "Appendices"
title: "Glossary"
level: beginner
reading_time: "30 min"
prerequisites: []
source_docs:
  - "glossary.md"
  - "doc/api/documentation.md"
source_url: "https://github.com/nodejs/node/blob/main/glossary.md"
node_baseline: "27.0.0-pre"
---

# Appendix F — Glossary

## How to use this appendix

Every term in this glossary is one the book actually uses. Each entry gives you a plain-language definition in one or two sentences and a pointer to the chapter where the idea is taught properly — because a glossary entry is a reminder, not an education.

Read it three ways:

- **Stuck mid-chapter?** Look up the word and keep reading. The arrow tells you where to go if the one-liner is not enough.
- **Skimming before an interview or a design review?** Read straight through. It is a compressed map of everything the book covers.
- **Reading the official Node.js docs or a GitHub thread?** The project has its own [`glossary.md`](https://github.com/nodejs/node/blob/main/glossary.md), heavy on contributor abbreviations (CITGM, LGTM, PTAL). This one is aimed at people *using* Node.js rather than developing it, though the terms that matter for both are here.

Entries are alphabetical, ignoring case and punctuation. A term in **bold** inside a definition has its own entry.

---

## A

**ABI (Application Binary Interface)** — The binary-level contract between compiled components: how functions are called, how structs are laid out, which symbols exist. Node.js exposes an ABI version as `process.versions.modules`; it changes on every major, which is why a native addon compiled for one major fails to load on the next. → [Chapter 56](../part8-advanced/56-node-api-addons.md)

**AbortController / AbortSignal** — The standard way to cancel an in-flight operation in Node.js. You create a controller, pass its `.signal` to an API that accepts one, and call `.abort()` to make the operation reject with an `AbortError`. Nearly every modern async Node API takes a signal. → [Chapter 13](../part2-async/13-abort-and-cancellation.md)

**AEAD (Authenticated Encryption with Associated Data)** — A class of cipher modes (AES-GCM, ChaCha20-Poly1305) that encrypt *and* produce an authentication tag proving the ciphertext was not tampered with. If you are choosing a cipher and do not know what to pick, pick an AEAD one. → [Chapter 42](../part6-security/42-crypto-encryption.md)

**Agent (HTTP)** — The object that manages a pool of reusable TCP sockets for outgoing HTTP requests. Getting its `keepAlive` and `maxSockets` settings wrong is the most common cause of mysteriously slow HTTP clients. → [Chapter 36](../part5-networking/36-http-clients.md)

**ALPN (Application-Layer Protocol Negotiation)** — A TLS extension where client and server agree, during the handshake, on which protocol will run over the connection — `h2` for HTTP/2, `http/1.1` otherwise. It is how a browser and a server pick HTTP/2 without an extra round trip. → [Chapter 38](../part5-networking/38-http2.md)

**argv** — The array of command-line arguments, exposed as `process.argv`. Element 0 is the Node.js executable, element 1 is the script path, and your actual arguments start at index 2. → [Chapter 25](../part4-system/25-process-object.md)

**AsyncLocalStorage** — A Node.js API that carries a value implicitly through a chain of async calls, so a request ID set at the top of a handler is still readable in a database callback five layers down, with no parameter threading. → [Chapter 15](../part2-async/15-async-context.md)

**AsyncResource** — A lower-level primitive for making your own async operations visible to context-tracking and diagnostics. Mostly needed when you wrap a callback-based library or a connection pool. → [Chapter 15](../part2-async/15-async-context.md)

**Atomics** — JavaScript's built-in operations for safely reading and writing shared memory from multiple threads, including `Atomics.wait()` for blocking. Required for any real use of a **SharedArrayBuffer**. → [Chapter 29](../part4-system/29-worker-threads.md)

---

## B

**Backoff** — Waiting progressively longer between retries instead of hammering a failing service. Usually exponential: 100 ms, 200 ms, 400 ms, and so on, up to a cap. See also **jitter**. → [Chapter 62](../part9-production/62-observability.md)

**Backpressure** — The mechanism by which a slow consumer tells a fast producer to stop. In Node streams it is the `false` returned by `writable.write()` and the `'drain'` event that follows. Ignoring backpressure is how a program that "just copies a file" ends up using 8 GB of RAM. → [Chapter 19](../part3-data/19-streams-advanced.md)

**Bare specifier** — A module specifier with no path prefix and no protocol: `import x from 'lodash'`. It is resolved through `node_modules` and the target package's `exports` field, unlike a relative specifier (`./x.js`) or an absolute URL. → [Chapter 6](../part1-foundations/06-packages-and-exports.md)

**Base64url** — A variant of Base64 using `-` and `_` instead of `+` and `/`, and usually dropping the `=` padding, so the result is safe inside a URL. It is what JWTs and **JWK** thumbprints use. → [Chapter 16](../part3-data/16-buffers.md)

**Big-endian / little-endian** — Two conventions for the byte order of a multi-byte number. Network protocols traditionally use big-endian ("network byte order"); most CPUs you will run on are little-endian. `Buffer` has explicit `readUInt32BE`/`readUInt32LE` methods so you never have to guess. → [Chapter 16](../part3-data/16-buffers.md)

**Bootstrap** — The startup phase in which Node.js builds its execution environment, loads internal modules, and prepares globals before your code runs. Relevant when you care about **cold start**. → [Chapter 1](../part1-foundations/01-what-is-nodejs.md)

**Buffer** — Node.js's fixed-length container for raw bytes, a subclass of `Uint8Array`. Everything that touches the outside world — files, sockets, crypto — speaks in Buffers before it speaks in strings. → [Chapter 16](../part3-data/16-buffers.md)

---

## C

**Cardinality** — The number of distinct values a metric label can take. A label like `region` has low cardinality; a label like `user_id` or `url` (with path parameters baked in) has unbounded cardinality and will destroy your metrics backend. → [Chapter 62](../part9-production/62-observability.md)

**cgroup (control group)** — A Linux kernel feature that limits and accounts for a process group's CPU and memory. It is how containers enforce limits, and it is why `os.cpus().length` inside a container can report the host's 64 cores while you are allowed to use two. → [Chapter 60](../part9-production/60-deployment-and-config.md)

**Chunk** — One unit of data passing through a stream: a `Buffer` for byte streams, or any JavaScript value for an **object mode** stream. → [Chapter 18](../part3-data/18-streams-concepts.md)

**Circuit breaker** — A client-side pattern that stops sending requests to a dependency that is clearly failing, waits, then probes cautiously. It converts a slow cascading failure into a fast, contained one. → [Chapter 62](../part9-production/62-observability.md)

**CJS (CommonJS)** — Node.js's original module system: `require()` to import, `module.exports` to export, synchronous resolution, files with `.cjs` or `.js` in a non-`"type": "module"` package. → [Chapter 4](../part1-foundations/04-modules-commonjs.md)

**Cluster** — The Node.js module that forks multiple copies of your process and shares one listening socket between them, so a single machine's cores are all used. → [Chapter 30](../part4-system/30-cluster.md)

**Code cache** — Serialized compiled JavaScript that V8 can reuse to skip parsing and compilation on a later run. Used by startup **snapshots** and **single executable applications** to cut **cold start**. → [Chapter 55](../part8-advanced/55-single-executable.md)

**Cold start** — The time from process launch to the moment your application can serve its first request: process spawn, Node.js **bootstrap**, module loading, connection setup, and **JIT** warm-up. It dominates serverless latency and matters for CLI tools. → [Chapter 61](../part9-production/61-performance-tuning.md)

**Concurrency vs parallelism** — Concurrency is *interleaving* many operations on one thread (what Node.js does with I/O); parallelism is *simultaneously executing* on many cores (what **worker threads** and **cluster** do). Node.js gives you enormous concurrency by default and parallelism only when you ask. → [Chapter 1](../part1-foundations/01-what-is-nodejs.md)

**Conditional export** — An entry in a package's `exports` map keyed by a condition — `"import"`, `"require"`, `"node"`, `"browser"`, `"types"`, `"default"` — so different consumers resolve to different files. The main tool for shipping one package to several environments, and the main source of the **dual package hazard**. → [Chapter 6](../part1-foundations/06-packages-and-exports.md)

**Corepack** — A Node.js-bundled shim that installs and pins the package manager (npm, yarn, pnpm) declared in your `package.json`, so everyone on the project uses the same one. → [Chapter 2](../part1-foundations/02-install-and-release-lines.md)

**CSPRNG** — A cryptographically secure pseudo-random number generator: unpredictable even to someone who has seen previous output. `crypto.randomBytes()` and `crypto.randomUUID()` use one; `Math.random()` does not, and must never be used for anything security-relevant. → [Chapter 41](../part6-security/41-crypto-essentials.md)

**CVE (Common Vulnerabilities and Exposures)** — A public identifier for a specific disclosed vulnerability. Node.js CVEs are typically published a few days *after* the security release that fixes them, so patch on the release, not on the CVE. → [Appendix E](e-stability-and-releases.md)

---

## D

**Deprecation** — A formal declaration that an API should no longer be used, tracked in Node.js by a `DEPXXXX` code and progressing through documentation-only, runtime-warning, and end-of-life stages. → [Chapter 63](../part9-production/63-upgrading-node.md), [Appendix D](d-deprecations.md)

**dgram** — The Node.js module for UDP sockets. Connectionless, unordered, no delivery guarantee, and much lower overhead than TCP. → [Chapter 39](../part5-networking/39-udp-dgram.md)

**Diagnostics Channel** — A built-in publish/subscribe bus for instrumentation. Libraries publish structured events on named channels; monitoring tools subscribe. Cheap when nobody is listening, which is why it beats monkey-patching. → [Chapter 48](../part7-diagnostics/48-diagnostics-channel-tracing.md)

**Dominator** — In a heap snapshot, object A dominates object B if every path from the GC roots to B goes through A. The practical consequence: freeing A frees B. "Retained size" is the size of everything an object dominates, and it is the column you sort by when hunting a memory leak. → [Chapter 50](../part7-diagnostics/50-reports-and-heap.md)

**drain (event)** — Emitted by a `Writable` stream when its internal buffer has emptied enough to accept more data, after `write()` previously returned `false`. The other half of **backpressure**. → [Chapter 18](../part3-data/18-streams-concepts.md)

**Dual package hazard** — The failure mode where one package is loaded twice in the same process — once as **CJS**, once as **ESM** — producing two copies of its classes and state. `instanceof` starts returning `false` and singletons stop being single. → [Chapter 6](../part1-foundations/06-packages-and-exports.md)

**Duplex** — A stream that is both readable and writable, with the two sides independent. A TCP socket is the canonical example: what you write and what you read are unrelated flows. Contrast **Transform**. → [Chapter 19](../part3-data/19-streams-advanced.md)

---

## E

**ELU (Event Loop Utilization)** — The fraction of wall-clock time the **event loop** spent busy rather than idle, from `performance.eventLoopUtilization()`. Unlike event loop *delay*, it tells you how close you are to saturation, which makes it the single best health metric for a Node.js service. → [Chapter 49](../part7-diagnostics/49-perf-hooks.md)

**Entry point** — The file that runs first: the script you pass to `node`, or the file a package's `main`/`exports` resolves to. → [Chapter 6](../part1-foundations/06-packages-and-exports.md)

**epoll / kqueue / IOCP** — The operating system's efficient "tell me when any of these thousands of file descriptors is ready" mechanism — `epoll` on Linux, `kqueue` on BSD/macOS, IOCP on Windows. **libuv** wraps all three, and they are the reason one Node.js thread can hold tens of thousands of connections. → [Chapter 1](../part1-foundations/01-what-is-nodejs.md)

**ESM (ECMAScript Modules)** — The standard JavaScript module system: `import`/`export`, static structure, asynchronous resolution, live bindings, top-level `await`. Files with `.mjs` or `.js` inside a `"type": "module"` package. → [Chapter 5](../part1-foundations/05-modules-esm.md)

**Event loop** — The loop at the centre of Node.js that repeatedly asks the OS which I/O has completed and runs the corresponding JavaScript callbacks. It has ordered phases (timers, pending callbacks, poll, check, close) and it runs your code on **one thread**, so any long synchronous computation blocks everything. → [Chapter 9](../part2-async/09-event-loop.md)

**EventEmitter** — Node.js's built-in observer pattern: `emitter.on('name', fn)` to subscribe, `emitter.emit('name', ...)` to fire. Listeners are called **synchronously**, in registration order, which surprises people. → [Chapter 12](../part2-async/12-eventemitter.md)

**Exit code** — The small integer a process returns to its parent. `0` means success; anything else means failure. Node.js reserves a set of them (for example, 1 for an uncaught fatal exception), and your orchestrator makes restart decisions based on them. → [Chapter 25](../part4-system/25-process-object.md)

---

## F

**FD (file descriptor)** — A small integer the OS hands you as a handle for an open file, socket, or pipe. Descriptors 0, 1, and 2 are stdin, stdout, and stderr. They are a limited per-process resource, and leaking them produces `EMFILE`. → [Chapter 22](../part4-system/22-filesystem-basics.md)

**FFI (Foreign Function Interface)** — Calling functions in a native shared library directly from JavaScript, without writing a C++ addon. Node.js has an experimental built-in `node:ffi`. Powerful, and a direct route to segfaults if you get a signature wrong. **[Experimental]** → [Chapter 58](../part8-advanced/58-ffi-and-embedding.md)

**Flame graph** — A visualisation of sampled stack traces where width means time spent and vertical stacking means call depth. Wide plateaus are where your CPU time goes; the shape tells you *why* it goes there. → [Chapter 61](../part9-production/61-performance-tuning.md)

**Fork** — Two distinct meanings. In `child_process.fork()`, spawning a new Node.js process with an **IPC** channel to the parent. In `cluster.fork()`, spawning a worker that shares the primary's listening socket. Neither is the POSIX `fork(2)` system call. → [Chapter 28](../part4-system/28-child-processes.md)

---

## G

**Garbage collection (GC)** — V8 automatically reclaiming memory no longer reachable from the roots. V8's collector is *generational*: a fast "scavenge" of the young generation runs often, and a slower mark-compact of the old generation runs occasionally and can pause your process for milliseconds. → [Chapter 61](../part9-production/61-performance-tuning.md)

**globalThis** — The standard, portable reference to the global object, working in Node.js, browsers, and workers. Node.js's older `global` is **[Legacy]**. → [Chapter 8](../part1-foundations/08-globals-and-environment.md)

**Graceful shutdown** — Stopping a process without dropping work: stop accepting new connections, finish in-flight requests, flush logs and buffers, close database pools, then exit — with a hard timeout so a stuck request cannot block the shutdown forever. → [Chapter 26](../part4-system/26-signals-and-shutdown.md)

---

## H

**Handle vs request (libuv)** — **libuv**'s two resource types, and the distinction that explains why your process will not exit. A *handle* is a long-lived object that can produce events over time (a server, a socket, a timer). A *request* is a single short-lived operation (one `fs.readFile`, one DNS lookup). Both keep the **event loop** alive while active; an un-`unref`'d timer handle is the usual culprit behind a process that refuses to die. → [Chapter 9](../part2-async/09-event-loop.md)

**Head-of-line blocking** — When one stalled item at the front of a queue holds up everything behind it, even though the rest could proceed. HTTP/1.1 has it per connection (one slow response blocks the pipeline); HTTP/2 fixes it at the HTTP layer but reintroduces it at the TCP layer, since one lost packet stalls every multiplexed stream; QUIC fixes it properly by giving each stream its own delivery ordering. → [Chapter 38](../part5-networking/38-http2.md), [Chapter 40](../part5-networking/40-quic-dtls.md)

**Heap snapshot** — A full dump of every object in the V8 heap with the references between them, loadable into Chrome DevTools. The tool for answering "what is holding on to this memory?" See **dominator**. → [Chapter 50](../part7-diagnostics/50-reports-and-heap.md)

**highWaterMark** — A stream's buffer threshold in bytes (or in objects, for **object mode**). When buffered data reaches it, `write()` returns `false` and **backpressure** kicks in. Defaults at 27.0.0-pre: 65536 (64 KiB) for byte streams on non-Windows, 16384 (16 KiB) on Windows, and 16 for object mode. → [Chapter 18](../part3-data/18-streams-concepts.md)

**HKDF** — A specific, widely used **KDF** built from HMAC, designed to turn one high-entropy secret into several independent keys. Not for passwords — use **scrypt** or Argon2 for those. → [Chapter 42](../part6-security/42-crypto-encryption.md)

**HMAC** — A keyed hash: proves both integrity and authenticity, because producing a valid tag requires the secret key. Verify HMACs with `crypto.timingSafeEqual()`, never `===`. → [Chapter 41](../part6-security/41-crypto-essentials.md)

**HPACK** — HTTP/2's header compression scheme. It keeps a shared table of previously seen headers on both ends of a connection so repeated headers cost a byte or two. It is also why HTTP/2 header limits behave differently from HTTP/1.1's. → [Chapter 38](../part5-networking/38-http2.md)

---

## I

**ICU (International Components for Unicode)** — The Unicode library Node.js bundles to power `Intl`, locale-aware collation, date and number formatting, and IDNA. Some builds ship a reduced ("small-icu") dataset with only English, which is why locale formatting can silently differ between environments. → [Chapter 17](../part3-data/17-encodings.md)

**Idempotency** — A property of an operation whose repetition has the same effect as doing it once. Essential for safe retries: without it, a network timeout followed by a retry can charge a customer twice. Usually implemented with a client-supplied idempotency key. → [Chapter 62](../part9-production/62-observability.md)

**Import attributes** — Extra metadata on an import that tells the loader how to interpret the target, as in `import data from './x.json' with { type: 'json' }`. Required for JSON modules in **ESM**. → [Chapter 5](../part1-foundations/05-modules-esm.md)

**Inspector protocol** — The Chrome DevTools Protocol interface V8 and Node.js expose over a WebSocket when you run `node --inspect`. It powers debuggers, profilers, and heap snapshot tooling in every editor that supports Node.js. → [Chapter 47](../part7-diagnostics/47-debugging.md)

**IPC (Inter-Process Communication)** — Any channel processes use to talk: pipes, sockets, shared memory. In Node.js it usually means the message channel `child_process.fork()` sets up, where you `child.send(obj)` and the child receives a `'message'` event. → [Chapter 28](../part4-system/28-child-processes.md)

**Isolate** — A completely independent V8 instance with its own heap, its own garbage collector, and no shared objects. One isolate can only be used by one thread at a time. Every **worker thread** gets its own isolate, which is exactly why you cannot pass an ordinary object between threads — see **structured clone**. → [Chapter 29](../part4-system/29-worker-threads.md)

---

## J

**Jitter** — Deliberate randomness added to retry delays so that a thousand clients that failed at the same moment do not all retry at the same moment. Backoff without jitter produces synchronised retry storms. → [Chapter 62](../part9-production/62-observability.md)

**JIT (Just-In-Time compilation)** — V8 compiling JavaScript to machine code while it runs, re-optimising hot functions based on observed types and de-optimising when an assumption breaks. It is why microbenchmarks lie and why a function's speed depends on what you fed it earlier. → [Chapter 61](../part9-production/61-performance-tuning.md)

**JWK (JSON Web Key)** — A JSON representation of a cryptographic key, with fields naming the key type, curve or modulus, and permitted operations. It is the **Web Crypto** import/export format and the format behind a JWKS endpoint. → [Chapter 43](../part6-security/43-webcrypto.md)

---

## K

**KDF (Key Derivation Function)** — A function that turns a secret — a password, a shared secret, a master key — into one or more cryptographic keys. Password KDFs (**scrypt**, PBKDF2, Argon2) are deliberately slow and memory-hungry to resist brute force; key-expansion KDFs (**HKDF**) are fast because their input already has full entropy. Using the wrong class is a serious bug. → [Chapter 42](../part6-security/42-crypto-encryption.md)

**Keep-alive** — Reusing one TCP connection for several sequential HTTP requests instead of reconnecting each time. Saves a TCP handshake and, on HTTPS, a TLS handshake — often the difference between 5 ms and 50 ms per request. → [Chapter 36](../part5-networking/36-http-clients.md)

---

## L

**libuv** — The C library underneath Node.js that provides the **event loop**, cross-platform async I/O (**epoll**/kqueue/IOCP), the **thread pool**, timers, child processes, and signal handling. When Node.js behaves differently on Windows, libuv is usually the reason. → [Chapter 1](../part1-foundations/01-what-is-nodejs.md)

**LTS (Long Term Support)** — An even-numbered Node.js major that receives ~12 months of Active LTS followed by ~18 months of Maintenance, roughly 30 months of patches after its Current phase. → [Chapter 2](../part1-foundations/02-install-and-release-lines.md), [Appendix E](e-stability-and-releases.md)

**Loader hooks / module customization hooks** — Functions you register to intercept module resolution and loading: rewriting specifiers, transpiling source, injecting instrumentation. The modern API is `module.registerHooks()`. → [Chapter 53](../part8-advanced/53-module-hooks.md)

---

## M

**Macrotask** — Informal name for a callback scheduled through the **event loop**'s phases — a timer, an I/O completion, a `setImmediate`. One macrotask runs, then the entire **microtask** queue drains, then the next macrotask. → [Chapter 9](../part2-async/09-event-loop.md)

**MessagePort / MessageChannel** — The two-ended pipe used to send **structured clone**-able messages between **worker threads**, and the thing you hand across a thread boundary as a **transferable**. → [Chapter 29](../part4-system/29-worker-threads.md)

**Microtask** — A callback queued at higher priority than anything in the event loop's phases: promise reactions and `queueMicrotask()`. The microtask queue is drained *completely* between macrotasks, so an endlessly self-queueing microtask starves I/O forever without ever "blocking". → [Chapter 9](../part2-async/09-event-loop.md)

**Module specifier** — The string in an import or require: `'./util.js'` (relative), `'node:fs'` (builtin), `'express'` (**bare specifier**), `'file:///abs/path.js'` (URL). Which kind it is determines the entire resolution algorithm. → [Chapter 5](../part1-foundations/05-modules-esm.md)

**mTLS (mutual TLS)** — TLS where *both* sides present certificates, so the server authenticates the client too. In Node.js it is `requestCert: true` plus `rejectUnauthorized: true` on the server, and a client certificate on the other end. Standard practice for service-to-service traffic. → [Chapter 37](../part5-networking/37-tls-https.md)

---

## N

**N-API / Node-API** — The stable C API for writing native addons. Its whole point is **ABI** stability: an addon built against Node-API keeps working across Node.js majors without recompilation, unlike one built directly against V8 headers. → [Chapter 56](../part8-advanced/56-node-api-addons.md)

**`node:` prefix** — The explicit protocol for builtin modules: `import fs from 'node:fs'`. It removes any ambiguity with an npm package of the same name and cannot be shadowed by `node_modules`. Use it always. → [Chapter 4](../part1-foundations/04-modules-commonjs.md)

**Nonce** — A "number used once": a value that must never repeat for a given key. In AES-GCM, reusing a nonce with the same key is catastrophic — it leaks the plaintext relationship and can expose the authentication key. A nonce need not be secret, only unique. Contrast **salt**. → [Chapter 42](../part6-security/42-crypto-encryption.md)

---

## O

**Object mode** — A stream configured to carry arbitrary JavaScript values instead of bytes. **highWaterMark** then counts objects, not bytes — the default is 16 — which is why an object-mode stream carrying 10 MB records can use far more memory than you expected. → [Chapter 18](../part3-data/18-streams-concepts.md)

**OOM (out of memory)** — The process exceeded the memory it was allowed. In Node.js this appears either as a V8 heap OOM (`JavaScript heap out of memory`, controlled by `--max-old-space-size`) or as the Linux OOM killer terminating the process at the **cgroup** limit — which produces no JavaScript error at all, just a dead process. Knowing which one you hit determines the fix. → [Chapter 61](../part9-production/61-performance-tuning.md)

**OpenSSL** — The cryptography library Node.js bundles, behind `node:crypto`, `node:tls`, and **Web Crypto**. Its major version moves with Node.js majors, and OpenSSL 3 relocated legacy algorithms into a separate provider — the source of many `ERR_OSSL_*` errors after an upgrade. → [Chapter 41](../part6-security/41-crypto-essentials.md)

---

## P

**Percentile (p50, p95, p99)** — Latency reported as "99% of requests finished faster than this". Averages hide the tail; percentiles are what your users actually feel. In a service that makes several internal calls per request, the p99 of a dependency shows up far more often than intuition suggests. → [Chapter 62](../part9-production/62-observability.md)

**Permission model** — Node.js's built-in sandbox, enabled with `--permission`, restricting a process's file system reads and writes, child process spawning, worker creation, and native addon loading. Defence in depth against a compromised dependency. → [Chapter 31](../part4-system/31-permission-model.md)

**PID 1** — The first process in a namespace. In a container your Node.js process is often PID 1, which changes two things: the kernel does not apply default signal handlers, so a `SIGTERM` you do not explicitly handle is *ignored* rather than terminating you; and you inherit responsibility for reaping orphaned children, or you accumulate **zombie processes**. → [Chapter 60](../part9-production/60-deployment-and-config.md)

**pipeline** — The correct way to connect streams: `stream.pipeline()` (or `pipeline` from `node:stream/promises`) wires sources to destinations and, crucially, destroys every stream in the chain if any one of them fails. Plain `.pipe()` does not, which leaks file descriptors and sockets on error. → [Chapter 19](../part3-data/19-streams-advanced.md)

**Primordials** — Internal, snapshotted copies of JavaScript built-ins that Node.js core uses so its own behaviour cannot be altered by userland **prototype pollution**. You will meet the term reading core source, not writing applications. → [Chapter 44](../part6-security/44-securing-applications.md)

**Prototype pollution** — An attack where untrusted input reaches a deep-merge or property-assignment routine and writes to `Object.prototype`, changing behaviour for every object in the process. The classic vector is a JSON body containing a `__proto__` key. → [Chapter 44](../part6-security/44-securing-applications.md)

**Punycode / IDNA** — The encoding that maps internationalised domain names to ASCII (`münchen.de` becomes `xn--mnchen-3ya.de`) so legacy DNS can carry them. The `node:punycode` module is **[Deprecated]**; the `URL` class does the conversion for you. → [Chapter 32](../part5-networking/32-url-and-querystring.md)

---

## Q

**QUIC** — A transport protocol running over UDP that combines connection setup with TLS 1.3, multiplexes independent streams without TCP's **head-of-line blocking**, and survives an IP address change. The basis of HTTP/3. Node.js's `node:quic` is **[Experimental]** at stage 1.0. → [Chapter 40](../part5-networking/40-quic-dtls.md)

**queueMicrotask()** — Schedules a callback on the **microtask** queue. The standard alternative to `process.nextTick()`, which is a Node.js-specific queue that runs even earlier and is marked **[Legacy]** at 27.0.0-pre. → [Chapter 9](../part2-async/09-event-loop.md)

---

## R

**Readable / Writable** — The two base stream directions. A `Readable` is a source you consume from; a `Writable` is a sink you push into. **Duplex** and **Transform** combine them. → [Chapter 18](../part3-data/18-streams-concepts.md)

**Realm** — A complete JavaScript execution environment: its own global object and its own set of intrinsics (its own `Array`, its own `Object.prototype`). A `vm` context is a separate realm in the same **isolate**, which is why an array created inside one fails `instanceof Array` outside it. → [Chapter 52](../part8-advanced/52-vm-sandboxing.md)

**REPL (Read-Eval-Print Loop)** — The interactive prompt you get by running `node` with no arguments. Useful for exploration; its module resolution and top-level `await` behaviour differ from a script's, so do not use it to verify subtle module semantics. → [Chapter 3](../part1-foundations/03-running-code-cli-repl.md)

**Report (diagnostic report)** — A JSON document Node.js can write on demand or automatically on a fatal error, containing the JavaScript and native stacks, heap statistics, active **handles** and requests, resource usage, environment variables, and library versions. The single most useful artifact to capture from a crash you cannot reproduce. → [Chapter 50](../part7-diagnostics/50-reports-and-heap.md)

**RSS (Resident Set Size)** — The physical RAM a process currently occupies, from `process.memoryUsage().rss`. It includes the V8 heap *plus* buffers, native allocations, code, and stacks — so RSS growing while the heap stays flat points at a native or `Buffer` leak, not a JavaScript one. → [Chapter 61](../part9-production/61-performance-tuning.md)

---

## S

**Salt** — Random, non-secret data mixed into a password hash so that identical passwords produce different hashes and precomputed rainbow tables are useless. A salt must be unique per password; unlike a **nonce**, its uniqueness requirement is statistical rather than absolute. → [Chapter 41](../part6-security/41-crypto-essentials.md)

**Scrypt** — A deliberately slow, memory-hard password **KDF**, available as `crypto.scrypt()`. Memory-hardness is what makes GPU and ASIC attacks expensive. → [Chapter 41](../part6-security/41-crypto-essentials.md)

**SEA (Single Executable Application)** — A Node.js feature that bundles your application into the Node.js binary itself, producing one file to distribute with no runtime installation required. **[Experimental]** at stage 1.1. → [Chapter 55](../part8-advanced/55-single-executable.md)

**Semver (semantic versioning)** — The `MAJOR.MINOR.PATCH` convention: major means breaking, minor means additive, patch means fixed. Node.js follows it for **Stable** APIs; **Experimental** APIs are explicitly outside it. → [Appendix E](e-stability-and-releases.md)

**SharedArrayBuffer** — A block of memory that genuinely is shared between **worker threads** rather than copied. The only way to move large data between threads at zero cost, and the only way to introduce a real data race in JavaScript — always coordinate access with **Atomics**. → [Chapter 29](../part4-system/29-worker-threads.md)

**Signal (POSIX)** — An asynchronous notification the OS delivers to a process: `SIGTERM` (please stop), `SIGINT` (Ctrl-C), `SIGKILL` (stop now, uncatchable), `SIGHUP`, `SIGUSR2`. Windows emulates only some of these. Handling `SIGTERM` is the entry point to **graceful shutdown**. → [Chapter 26](../part4-system/26-signals-and-shutdown.md)

**SLO / SLI** — A Service Level Indicator is something you measure (p99 latency, success rate); a Service Level Objective is the target you commit to (99.9% of requests under 300 ms). Together they turn "is it fast enough?" into a question with an answer. → [Chapter 62](../part9-production/62-observability.md)

**SNI (Server Name Indication)** — A TLS extension in which the client sends the hostname it wants **in the clear at the start of the handshake**, so one IP address can serve certificates for many domains. In Node.js it is what `SNICallback` responds to. → [Chapter 37](../part5-networking/37-tls-https.md)

**Snapshot (startup snapshot)** — A serialized V8 heap captured after your initialisation code has run, so a later process starts from that state instead of re-executing the work. A **cold start** optimisation. → [Chapter 55](../part8-advanced/55-single-executable.md)

**Socket** — An endpoint of a network connection. In Node.js, `net.Socket` is a **Duplex** stream, which means everything you know about streams — including **backpressure** — applies directly to network code. → [Chapter 33](../part5-networking/33-tcp-net.md)

**Sticky session** — Routing every request from a given client to the same backend process, usually by hashing the source IP or a cookie. Needed when a process holds per-client state, most obviously WebSockets under **cluster**. Treat it as a constraint to design away, not a feature. → [Chapter 30](../part4-system/30-cluster.md)

**Stream** — An abstraction for data that arrives or departs over time, in pieces, so you can process a 10 GB file in 64 KiB **chunks** with constant memory. Node.js has three stream families: classic `node:stream`, **Web Streams**, and the experimental iterable streams. → [Chapter 18](../part3-data/18-streams-concepts.md)

**StringDecoder** — A small utility that decodes **Buffers** to strings while correctly handling multi-byte characters split across chunk boundaries. Calling `buf.toString('utf8')` on each chunk of a stream independently corrupts any character that straddles a boundary. → [Chapter 17](../part3-data/17-encodings.md)

**Structured clone** — The algorithm that deep-copies a value across a thread or process boundary, handling Maps, Sets, Dates, typed arrays, and cyclic references — but *not* functions, class prototypes, or DOM-style host objects. It is what `postMessage` and `structuredClone()` use, and why "just send the object to the worker" sometimes throws. → [Chapter 29](../part4-system/29-worker-threads.md)

**Subpath export / import** — `exports` entries that expose specific paths within your package (`"./client"`), and `imports` entries that define private aliases beginning with `#` for use inside it. Together they let you have a real public API surface instead of every internal file being importable. → [Chapter 6](../part1-foundations/06-packages-and-exports.md)

---

## T

**Tail latency** — The slow end of the latency distribution, p99 and beyond. Usually caused by **GC** pauses, connection pool exhaustion, or an **event loop** blocked by a synchronous operation — not by the code path being slow on average. → [Chapter 61](../part9-production/61-performance-tuning.md)

**TDZ (Temporal Dead Zone)** — The window between entering a scope and executing a `let`/`const`/`class` declaration, during which touching the binding throws a `ReferenceError`. It shows up in Node.js with circular **ESM** imports, where a module can observe an imported binding before the exporting module has evaluated it. → [Chapter 5](../part1-foundations/05-modules-esm.md)

**Thread pool** — **libuv**'s pool of background threads that run operations the OS has no async interface for: most `fs` calls, DNS `lookup()`, `zlib`, and several `crypto` operations. It defaults to **4** threads and is sized by `UV_THREADPOOL_SIZE`. Saturating it makes unrelated file and DNS operations queue behind each other, which looks exactly like a network problem and is not. → [Chapter 9](../part2-async/09-event-loop.md)

**Tick** — One iteration of the **event loop**. `process.nextTick()` is confusingly named: it does *not* wait for the next tick, it runs immediately after the current operation completes, before promises. → [Chapter 9](../part2-async/09-event-loop.md)

**timingSafeEqual** — A comparison that always takes the same time regardless of where the inputs differ, so an attacker cannot learn a secret byte by byte from response timings. Use it for every secret comparison: tokens, HMAC tags, signatures. → [Chapter 41](../part6-security/41-crypto-essentials.md)

**TLS (Transport Layer Security)** — The protocol that encrypts and authenticates a connection. Node.js defaults to a minimum of TLS 1.2 and a maximum of TLS 1.3. TLS 1.3 removed the older cipher negotiation entirely and cut the handshake to one round trip. → [Chapter 37](../part5-networking/37-tls-https.md)

**Trace event** — A low-level timestamped record emitted by V8, Node.js core, or your code, collected into a Chrome-tracing-format file you can open in a trace viewer. Higher volume and lower level than **Diagnostics Channel**. **[Experimental]** → [Chapter 48](../part7-diagnostics/48-diagnostics-channel-tracing.md)

**Transferable** — A value that can be *moved* across a thread boundary rather than copied — an `ArrayBuffer`, a `MessagePort`, a `ReadableStream`. Transferring is O(1) instead of O(n), and it **detaches** the original: the sending side is left holding a zero-length, unusable object. → [Chapter 29](../part4-system/29-worker-threads.md)

**Transform** — A **Duplex** stream whose output is a function of its input: compression, encryption, parsing, line splitting. Contrast a plain Duplex, where the two directions are unrelated. → [Chapter 19](../part3-data/19-streams-advanced.md)

**TTY** — A terminal device. `process.stdout.isTTY` tells you whether output is going to a terminal or being piped to a file — the correct signal for deciding whether to emit colour, progress bars, or plain machine-readable text. → [Chapter 27](../part4-system/27-os-tty-readline.md)

---

## U

**uncaughtException** — A `process` event fired when an exception reaches the top of the stack with no handler. Node.js's default is to print the stack and exit. A handler may log and flush, but the process state is unknown afterwards: log, then exit. Do not resume. → [Chapter 14](../part2-async/14-errors.md)

**undici** — The HTTP client library bundled with Node.js and used to implement the global `fetch()`. Its defaults, timeouts, and error shapes move with Node.js versions. → [Chapter 36](../part5-networking/36-http-clients.md)

**unhandledRejection** — A `process` event fired when a rejected promise has no rejection handler by the time the **microtask** queue drains. Since Node.js 15 the default is to throw, making it a fatal error. → [Chapter 14](../part2-async/14-errors.md)

**unref()** — Marking a **handle** so it no longer keeps the **event loop** alive. An `unref`'d interval will fire while the program has other work to do but will not, by itself, prevent exit. The standard fix for "my CLI finishes but does not quit". → [Chapter 10](../part2-async/10-timers.md)

**UTF-8** — The dominant Unicode encoding: variable width, 1–4 bytes per character, ASCII-compatible. Node.js's default for strings from files and sockets. Because characters vary in length, a byte-count and a character-count are different numbers — see **StringDecoder**. → [Chapter 17](../part3-data/17-encodings.md)

---

## V

**V8** — Google's JavaScript engine, the thing that actually parses, compiles, optimises, and runs your JavaScript, and that owns the heap and the **garbage collector**. Node.js is V8 plus **libuv** plus a standard library. → [Chapter 1](../part1-foundations/01-what-is-nodejs.md)

**VFS (Virtual File System)** — An experimental Node.js facility for mounting an in-memory or embedded file tree that `fs` operations can read, used by **single executable applications** to carry assets. **[Experimental]** → [Chapter 55](../part8-advanced/55-single-executable.md)

**vm context** — A separate **realm** created by `node:vm` in which you can run code with its own globals. Useful for isolation of *scope*; it is explicitly **not** a security sandbox against hostile code. → [Chapter 52](../part8-advanced/52-vm-sandboxing.md)

---

## W

**WASI (WebAssembly System Interface)** — A standard set of system calls that lets a **WASM** module read files, use clocks, and access an environment in a capability-restricted way. Node.js's `node:wasi` is **[Experimental]** and its documentation warns that it does not currently provide comprehensive file system sandboxing — do not use it to run untrusted code. → [Chapter 57](../part8-advanced/57-wasm-wasi.md)

**WASM (WebAssembly)** — A portable binary instruction format that runs at close-to-native speed inside the same process. In Node.js it is the usual way to move a hot numeric loop out of JavaScript without the **ABI** and build-toolchain burden of a native addon. → [Chapter 57](../part8-advanced/57-wasm-wasi.md)

**Web Crypto** — The standard, promise-based cryptography API (`globalThis.crypto.subtle`), shared with browsers. It uses **JWK** and raw key formats, and it deliberately offers a narrower, safer algorithm set than `node:crypto`. → [Chapter 43](../part6-security/43-webcrypto.md)

**Web Streams** — The WHATWG stream API (`ReadableStream`, `WritableStream`, `TransformStream`) that Node.js implements alongside its own. `fetch()` bodies are Web Streams; Node.js provides adapters in both directions. → [Chapter 20](../part3-data/20-web-streams.md)

**WHATWG URL** — The standard `URL` class, matching browser behaviour, with proper parsing, **punycode**/IDNA handling, and `searchParams`. The legacy `url.parse()` API is **[Legacy]** and has known parsing divergences that have caused real security bugs. → [Chapter 32](../part5-networking/32-url-and-querystring.md)

**Worker thread** — A real OS thread running its own V8 **isolate** and its own **event loop**, created with `node:worker_threads`. Use it for CPU-bound work; it will not make I/O faster, because I/O was never blocking the main thread in the first place. → [Chapter 29](../part4-system/29-worker-threads.md)

---

## Z

**Zero-copy** — Moving data without copying it: `sendfile`-style transfers, **SharedArrayBuffer**, **transferables**, `Buffer` views over existing memory. Watch for the trap that `buf.slice()`-style views *share* memory with the original, so mutating one mutates both. → [Chapter 16](../part3-data/16-buffers.md)

**zlib** — Node.js's compression module: gzip, deflate, Brotli, and Zstandard. Each algorithm is exposed as a **Transform** stream and as one-shot sync and async functions. Compression runs on the **thread pool**, so an unbounded number of concurrent compressions will saturate it. → [Chapter 21](../part3-data/21-zlib.md)

**Zombie process** — A child process that has exited but whose exit status the parent has never collected, so the kernel keeps its process table entry alive. Accumulating zombies exhausts the process table. If your Node.js process is **PID 1** in a container and spawns children, reaping them is your job. → [Chapter 28](../part4-system/28-child-processes.md)

---

## Where to go next

- The Node.js project's own glossary, which covers contributor shorthand this one omits: <https://github.com/nodejs/node/blob/main/glossary.md>
- [Appendix C — Error Code Catalogue](c-error-codes.md) — when the unfamiliar string is an `ERR_*` code rather than a concept.
- [Appendix G — Module → Chapter Map](g-module-map.md) — when the unfamiliar string is a module name.
- [Appendix E — Stability Index and Release Lines](e-stability-and-releases.md) — for the precise meaning of the **[Experimental]**, **[Legacy]**, and **[Deprecated]** markers used throughout this book.
- [Appendix H — Further Reading and Capstone Projects](h-further-reading.md) — where to go once the vocabulary is no longer the obstacle.
