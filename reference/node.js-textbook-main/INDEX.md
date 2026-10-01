# Node.js: The Complete Guide

An original textbook built from the official Node.js documentation (`nodejs/node` @ **27.0.0-pre**).

**63 chapters + 8 appendices — approximately 306,000 words.**


| | |
|---|---|
| 언어 | 본문 영어 / 목차·안내 한국어 |
| 코드 | ESM 우선, 필요 시 CommonJS 병기, `node:` prefix 사용 |
| 기준 버전 | Node.js `main` @ 27.0.0-pre |
| 원문 | 각 파일 frontmatter의 `source_docs` / `source_url` 참조 |

---

## 읽는 순서

Part I → IX 순서대로 읽으면 흐름이 이어집니다. 각 챕터 frontmatter의
`prerequisites`에 선행 챕터가 명시되어 있습니다.

- **Node.js를 처음 접한다면** — Part I부터 순서대로. Part II(비동기)까지가 1차 목표입니다.
- **JS는 알지만 백엔드가 처음이라면** — 1, 4~6장을 훑고 Part II부터 정독.
- **이미 Node로 개발 중이라면** — Part II 9장(이벤트 루프), Part III(스트림),
  Part VII(진단), Part IX(프로덕션)이 빈틈을 메우는 구간입니다.
- **레퍼런스로 쓴다면** — 부록 G(모듈 → 챕터 맵)에서 원하는 모듈을 찾아 들어가세요.

난이도 표기: `입문` / `중급` / `심화`

---


### Part I — Foundations

- **1.** [What Node.js Is: Architecture and Execution Model](part1-foundations/01-what-is-nodejs.md) · `입문` · 28 min
- **2.** [Installing Node, Release Lines, and Version Management](part1-foundations/02-install-and-release-lines.md) · `입문` · 26 min
- **3.** [Running Code: Scripts, the CLI, and the REPL](part1-foundations/03-running-code-cli-repl.md) · `입문` · 30 min
- **4.** [Modules I: CommonJS](part1-foundations/04-modules-commonjs.md) · `입문` · 32 min
- **5.** [Modules II: ECMAScript Modules](part1-foundations/05-modules-esm.md) · `입문` · 30 min
- **6.** [Packages: package.json, exports, imports, dual publishing](part1-foundations/06-packages-and-exports.md) · `중급` · 30 min
- **7.** [TypeScript in Node.js](part1-foundations/07-typescript.md) · `중급` · 25 min
- **8.** [Globals and the Runtime Environment](part1-foundations/08-globals-and-environment.md) · `입문` · 28 min

### Part II — Asynchrony

- **9.** [The Event Loop: Phases, Microtasks, and Starvation](part2-async/09-event-loop.md) · `중급` · 35 min
- **10.** [Timers and Scheduling](part2-async/10-timers.md) · `중급` · 28 min
- **11.** [Callbacks, Promises, async/await, and util.promisify](part2-async/11-promises-and-async.md) · `중급` · 35 min
- **12.** [EventEmitter and the Events Module](part2-async/12-eventemitter.md) · `중급` · 32 min
- **13.** [AbortController, Signals, and Cancellation](part2-async/13-abort-and-cancellation.md) · `중급` · 35 min
- **14.** [Errors: Classes, Codes, and Handling Strategies](part2-async/14-errors.md) · `중급` · 35 min
- **15.** [AsyncLocalStorage and Context Propagation](part2-async/15-async-context.md) · `심화` · 35 min

### Part III — Data and Streams

- **16.** [Buffers and Typed Arrays](part3-data/16-buffers.md) · `중급` · 30 min
- **17.** [Character Encodings, StringDecoder, and Intl](part3-data/17-encodings.md) · `중급` · 28 min
- **18.** [Streams I: Concepts, Readable, and Writable](part3-data/18-streams-concepts.md) · `중급` · 32 min
- **19.** [Streams II: Duplex, Transform, pipeline, and Backpressure](part3-data/19-streams-advanced.md) · `심화` · 35 min
- **20.** [Web Streams API and Interop](part3-data/20-web-streams.md) · `심화` · 32 min
- **21.** [Compression with zlib](part3-data/21-zlib.md) · `중급` · 33 min

### Part IV — System Interfaces

- **22.** [File System I: Reading, Writing, and Metadata](part4-system/22-filesystem-basics.md) · `중급` · 30 min
- **23.** [File System II: Directories, Watching, Streams, and Atomicity](part4-system/23-filesystem-advanced.md) · `심화` · 32 min
- **24.** [Paths, File URLs, and Cross-Platform Layout](part4-system/24-paths.md) · `중급` · 28 min
- **25.** [The Process Object: argv, env, stdio, exit codes](part4-system/25-process-object.md) · `중급` · 35 min
- **26.** [Signals, Graceful Shutdown, and Process Lifecycle](part4-system/26-signals-and-shutdown.md) · `심화` · 35 min
- **27.** [OS Information, TTY, and Readline](part4-system/27-os-tty-readline.md) · `중급` · 30 min
- **28.** [Child Processes](part4-system/28-child-processes.md) · `중급` · 35 min
- **29.** [Worker Threads](part4-system/29-worker-threads.md) · `심화` · 38 min
- **30.** [Cluster and Multi-Process Scaling](part4-system/30-cluster.md) · `심화` · 36 min
- **31.** [The Permission Model](part4-system/31-permission-model.md) · `심화` · 32 min

### Part V — Networking

- **32.** [URLs, Query Strings, and Punycode](part5-networking/32-url-and-querystring.md) · `중급` · 30 min
- **33.** [TCP Sockets with node:net](part5-networking/33-tcp-net.md) · `중급` · 35 min
- **34.** [DNS Resolution](part5-networking/34-dns.md) · `중급` · 30 min
- **35.** [HTTP/1.1 Servers](part5-networking/35-http-servers.md) · `중급` · 38 min
- **36.** [HTTP/1.1 Clients, Agents, and Keep-Alive](part5-networking/36-http-clients.md) · `중급` · 36 min
- **37.** [TLS and HTTPS](part5-networking/37-tls-https.md) · `심화` · 40 min
- **38.** [HTTP/2](part5-networking/38-http2.md) · `심화` · 38 min
- **39.** [UDP with node:dgram](part5-networking/39-udp-dgram.md) · `심화` · 32 min
- **40.** [QUIC and DTLS (Experimental)](part5-networking/40-quic-dtls.md) · `심화` · 28 min

### Part VI — Security and Cryptography

- **41.** [Cryptography Essentials: Hashing, HMAC, Randomness](part6-security/41-crypto-essentials.md) · `중급` · 33 min
- **42.** [Encryption, Signatures, Key Management, and Certificates](part6-security/42-crypto-encryption.md) · `심화` · 45 min
- **43.** [The Web Crypto API](part6-security/43-webcrypto.md) · `심화` · 40 min
- **44.** [Securing Node.js Applications](part6-security/44-securing-applications.md) · `심화` · 35 min

### Part VII — Testing, Debugging, Diagnostics

- **45.** [The Built-in Test Runner](part7-diagnostics/45-test-runner.md) · `중급` · 45 min
- **46.** [Assertions](part7-diagnostics/46-assertions.md) · `중급` · 40 min
- **47.** [Debugging: Inspector Protocol, node --inspect, and Editors](part7-diagnostics/47-debugging.md) · `심화` · 40 min
- **48.** [Diagnostics Channel and Trace Events](part7-diagnostics/48-diagnostics-channel-tracing.md) · `심화` · 40 min
- **49.** [Measuring Performance with perf_hooks](part7-diagnostics/49-perf-hooks.md) · `심화` · 35 min
- **50.** [Diagnostic Reports, Heap Snapshots, and V8 Tooling](part7-diagnostics/50-reports-and-heap.md) · `심화` · 35 min
- **51.** [Console, util.inspect, and Logging Strategy](part7-diagnostics/51-console-and-logging.md) · `중급` · 32 min

### Part VIII — Advanced and Native

- **52.** [The `vm` Module and Code Isolation](part8-advanced/52-vm-sandboxing.md) · `심화` · 38 min
- **53.** [Module Customization Hooks and Loaders](part8-advanced/53-module-hooks.md) · `심화` · 40 min
- **54.** [Built-in SQLite (`node:sqlite`)](part8-advanced/54-sqlite.md) · `심화` · 40 min
- **55.** [Single Executable Applications and the Virtual File System](part8-advanced/55-single-executable.md) · `심화` · 35 min
- **56.** [Node-API: Native Addons in C/C++](part8-advanced/56-node-api-addons.md) · `심화` · 45 min
- **57.** [WebAssembly and WASI](part8-advanced/57-wasm-wasi.md) · `심화` · 42 min
- **58.** [FFI and Embedding Node.js](part8-advanced/58-ffi-and-embedding.md) · `심화` · 40 min

### Part IX — Production Practice

- **59.** [Application Architecture and Project Layout](part9-production/59-application-architecture.md) · `심화` · 40 min
- **60.** [Deployment, Containers, and Configuration](part9-production/60-deployment-and-config.md) · `심화` · 40 min
- **61.** [Performance Tuning](part9-production/61-performance-tuning.md) · `심화` · 40 min
- **62.** [Observability in Production](part9-production/62-observability.md) · `심화` · 40 min
- **63.** [Upgrading Node.js: Deprecations and Migration](part9-production/63-upgrading-node.md) · `중급` · 40 min

### 부록

- **A.** [CLI Flag Reference](appendix/a-cli-flags.md) · 35 min
- **B.** [Environment Variable Reference](appendix/b-environment-variables.md) · 25 min
- **C.** [Error Code Catalogue](appendix/c-error-codes.md) · 35 min
- **D.** [Deprecation Index](appendix/d-deprecations.md) · 30 min
- **E.** [Stability Index and Release Lines](appendix/e-stability-and-releases.md) · 22 min
- **F.** [Glossary](appendix/f-glossary.md) · 30 min
- **G.** [Module → Chapter Map](appendix/g-module-map.md) · 18 min
- **H.** [Further Reading and Capstone Projects](appendix/h-further-reading.md) · 35 min

---

## 이 교재의 원칙

1. **레퍼런스가 아니라 교재입니다.** 공식 문서가 이미 나열하고 있는 것을 옮기지 않았습니다.
   각 API마다 *왜 존재하는가 / 언제 쓰고 언제 쓰지 않는가 / 무엇이 사람을 무는가*를 씁니다.
2. **모든 API 이름·플래그·옵션·기본값은 원문 대조로 검증했습니다.** 집필 과정에서
   널리 퍼진 통념 중 상당수가 현재 버전과 어긋난다는 것이 확인되어 바로잡았습니다
   (아래 *검증 중 교정된 사항* 참조).
3. **안정성 등급을 항상 표기합니다.** `[Experimental]` `[Legacy]` `[Deprecated]`는
   첫 등장 시 명시하고, Stability 1의 하위 등급(1.0/1.1/1.2)도 구분합니다.
4. **Windows를 무시하지 않습니다.** POSIX와 동작이 다른 곳은 그때마다 명시했습니다.
5. **각 챕터는 같은 구조입니다** — 학습 목표 → 동기 → 본문 → 흔한 실수(❌/✅)
   → 프로덕션 노트 → 연습문제 → 요약 → 다음 읽을 곳.

---

## 검증 중 교정된 사항 (일부)

집필 중 원문과 대조하며 발견한, **널리 알려진 정보와 어긋나는 사실들**입니다.
기존 자료로 학습하신 분이라면 특히 확인해 보세요.

| 흔한 통념 | 현재 사실 |
|---|---|
| `--experimental-strip-types`로 TS 실행 | 타입 스트리핑은 **Stable**, 기본 활성. 플래그는 `--no-strip-types`(비활성화용) |
| `require(esm)`는 실험적 | **Stable** (v25.4.0/v24.15.0) |
| `crypto.createCipher`는 deprecated | **제거됨** (DEP0106, v22.0.0 EOL) — 호출 시 throw |
| `url.parse`는 legacy | 함수 단위로는 **Deprecated** (DEP0169). 관련 DEP0170은 EOL |
| `assert.CallTracker` 사용 가능 | **제거됨** (DEP0173, v25.0.0 EOL) |
| `fs.rmdir({recursive:true})` | **EOL** (DEP0147, v25.0.0) |
| `server.keepAliveTimeout` 기본 5초 | **65초** (현재 릴리스 라인에서 변경) |
| `new http.Agent()`는 keep-alive 기본 on | **false**. `globalAgent`만 on |
| Node는 프록시 env를 안 읽음 | 내장 프록시 지원 존재 (`NODE_USE_ENV_PROXY`, Stability 1.1) |
| bcrypt/argon2는 외부 패키지 필요 | `crypto.argon2()` **내장** (v24.7.0) |
| `--experimental-permission` | **`--permission`**, 그리고 Stable (v23.5.0/v22.13.0) |
| `--experimental-wasm-modules` 필요 | **플래그 제거됨** (v24.5.0/v22.19.0) |
| `process.nextTick`은 권장 API | **Stability 3 — Legacy** |
| WASI preopens는 보안 샌드박스 | 공식 문서가 **명시적으로 부정**. 신뢰 불가 코드에 쓰지 말 것 |

---

## 원문·라이선스

본 교재는 `nodejs/node` 저장소의 `doc/api/` 문서(MIT License)를 **사실 근거**로 삼아
새로 집필한 것입니다. 설명·예제·구성은 원문의 재배열이 아닌 창작물이며, API 이름과
시그니처 등 사실 정보만 원문을 따릅니다. 각 챕터 frontmatter에 대응 원문 경로와
공식 문서 URL이 기재되어 있습니다.

원문: <https://github.com/nodejs/node/tree/main/doc/api> ·
<https://nodejs.org/docs/latest/api/>
