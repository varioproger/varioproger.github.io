# Master Outline — Node.js: The Complete Guide

Baseline: Node.js `main` @ **27.0.0-pre**. 63 chapters + 8 appendices.
Filenames below are authoritative. Do not deviate.

---

## Part I — Foundations (`part1-foundations/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 1 | `01-what-is-nodejs.md` | What Node.js Is: Architecture and Execution Model | synopsis, documentation |
| 2 | `02-install-and-release-lines.md` | Installing Node, Release Lines, and Version Management | documentation, SECURITY |
| 3 | `03-running-code-cli-repl.md` | Running Code: Scripts, the CLI, and the REPL | synopsis, cli, repl |
| 4 | `04-modules-commonjs.md` | Modules I: CommonJS | modules |
| 5 | `05-modules-esm.md` | Modules II: ECMAScript Modules | esm |
| 6 | `06-packages-and-exports.md` | Packages: `package.json`, exports, imports, dual publishing | packages |
| 7 | `07-typescript.md` | TypeScript in Node.js | typescript |
| 8 | `08-globals-and-environment.md` | Globals and the Runtime Environment | globals, environment_variables |

## Part II — Asynchrony (`part2-async/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 9 | `09-event-loop.md` | The Event Loop: Phases, Microtasks, and Starvation | timers, process |
| 10 | `10-timers.md` | Timers and Scheduling | timers |
| 11 | `11-promises-and-async.md` | Callbacks, Promises, async/await, and `util.promisify` | util |
| 12 | `12-eventemitter.md` | EventEmitter and the Events Module | events |
| 13 | `13-abort-and-cancellation.md` | AbortController, Signals, and Cancellation | events, globals |
| 14 | `14-errors.md` | Errors: Classes, Codes, and Handling Strategies | errors, domain |
| 15 | `15-async-context.md` | AsyncLocalStorage and Context Propagation | async_context, async_hooks |

## Part III — Data and Streams (`part3-data/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 16 | `16-buffers.md` | Buffers and Typed Arrays | buffer |
| 17 | `17-encodings.md` | Character Encodings, StringDecoder, and Intl | string_decoder, intl, buffer |
| 18 | `18-streams-concepts.md` | Streams I: Concepts, Readable, and Writable | stream |
| 19 | `19-streams-advanced.md` | Streams II: Duplex, Transform, pipeline, Backpressure | stream, stream_iter |
| 20 | `20-web-streams.md` | Web Streams API and Interop | webstreams |
| 21 | `21-zlib.md` | Compression with zlib | zlib |

## Part IV — System Interfaces (`part4-system/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 22 | `22-filesystem-basics.md` | File System I: Reading, Writing, and Metadata | fs |
| 23 | `23-filesystem-advanced.md` | File System II: Directories, Watching, Streams, and Atomicity | fs |
| 24 | `24-paths.md` | Paths, File URLs, and Cross-Platform Layout | path, url |
| 25 | `25-process-object.md` | The Process Object: argv, env, stdio, exit codes | process |
| 26 | `26-signals-and-shutdown.md` | Signals, Graceful Shutdown, and Process Lifecycle | process |
| 27 | `27-os-tty-readline.md` | OS Information, TTY, and Readline | os, tty, readline |
| 28 | `28-child-processes.md` | Child Processes | child_process |
| 29 | `29-worker-threads.md` | Worker Threads | worker_threads |
| 30 | `30-cluster.md` | Cluster and Multi-Process Scaling | cluster |
| 31 | `31-permission-model.md` | The Permission Model | permissions |

## Part V — Networking (`part5-networking/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 32 | `32-url-and-querystring.md` | URLs, Query Strings, and Punycode | url, querystring, punycode |
| 33 | `33-tcp-net.md` | TCP Sockets with `node:net` | net |
| 34 | `34-dns.md` | DNS Resolution | dns |
| 35 | `35-http-servers.md` | HTTP/1.1 Servers | http |
| 36 | `36-http-clients.md` | HTTP/1.1 Clients, Agents, and Keep-Alive | http, https |
| 37 | `37-tls-https.md` | TLS and HTTPS | tls, https |
| 38 | `38-http2.md` | HTTP/2 | http2 |
| 39 | `39-udp-dgram.md` | UDP with `node:dgram` | dgram |
| 40 | `40-quic-dtls.md` | QUIC and DTLS (Experimental) | quic, dtls |

## Part VI — Security and Cryptography (`part6-security/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 41 | `41-crypto-essentials.md` | Cryptography Essentials: Hashing, HMAC, Randomness | crypto |
| 42 | `42-crypto-encryption.md` | Encryption, Signatures, Key Management, Certificates | crypto |
| 43 | `43-webcrypto.md` | The Web Crypto API | webcrypto |
| 44 | `44-securing-applications.md` | Securing Node.js Applications | SECURITY, permissions |

## Part VII — Testing, Debugging, Diagnostics (`part7-diagnostics/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 45 | `45-test-runner.md` | The Built-in Test Runner | test |
| 46 | `46-assertions.md` | Assertions | assert |
| 47 | `47-debugging.md` | Debugging: Inspector Protocol, `node --inspect`, Editors | debugger, inspector |
| 48 | `48-diagnostics-channel-tracing.md` | Diagnostics Channel and Trace Events | diagnostics_channel, tracing |
| 49 | `49-perf-hooks.md` | Measuring Performance with `perf_hooks` | perf_hooks |
| 50 | `50-reports-and-heap.md` | Diagnostic Reports, Heap Snapshots, and V8 Tooling | report, v8 |
| 51 | `51-console-and-logging.md` | Console, `util.inspect`, and Logging Strategy | console, util |

## Part VIII — Advanced and Native (`part8-advanced/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 52 | `52-vm-sandboxing.md` | The `vm` Module and Code Isolation | vm |
| 53 | `53-module-hooks.md` | Module Customization Hooks and Loaders | module |
| 54 | `54-sqlite.md` | Built-in SQLite (`node:sqlite`) | sqlite |
| 55 | `55-single-executable.md` | Single Executable Applications and the Virtual File System | single-executable-applications, vfs |
| 56 | `56-node-api-addons.md` | Node-API: Native Addons in C/C++ | n-api, addons |
| 57 | `57-wasm-wasi.md` | WebAssembly and WASI | wasi |
| 58 | `58-ffi-and-embedding.md` | FFI and Embedding Node.js | ffi, embedding |

## Part IX — Production Practice (`part9-production/`)

| # | File | Title | Source docs |
|---|---|---|---|
| 59 | `59-application-architecture.md` | Application Architecture and Project Layout | (synthesis) |
| 60 | `60-deployment-and-config.md` | Deployment, Containers, and Configuration | cli, process |
| 61 | `61-performance-tuning.md` | Performance Tuning | perf_hooks, v8, cli |
| 62 | `62-observability.md` | Observability in Production | diagnostics_channel, report, perf_hooks |
| 63 | `63-upgrading-node.md` | Upgrading Node.js: Deprecations and Migration | deprecations, documentation |

## Appendices (`appendix/`)

| # | File | Title | Source docs |
|---|---|---|---|
| A | `a-cli-flags.md` | CLI Flag Reference | cli |
| B | `b-environment-variables.md` | Environment Variable Reference | environment_variables, cli |
| C | `c-error-codes.md` | Error Code Catalogue | errors |
| D | `d-deprecations.md` | Deprecation Index | deprecations |
| E | `e-stability-and-releases.md` | Stability Index and Release Lines | documentation |
| F | `f-glossary.md` | Glossary | glossary |
| G | `g-module-map.md` | Module → Chapter Map | index |
| H | `h-further-reading.md` | Further Reading and Capstone Projects | (synthesis) |
