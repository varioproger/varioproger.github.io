---
chapter: "D"
part: "Appendices"
title: "Deprecation Index"
level: intermediate
reading_time: "30 min"
prerequisites: [63]
source_docs:
  - "doc/api/deprecations.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/deprecations.html"
node_baseline: "27.0.0-pre"
---

# Appendix D — Deprecation Index

## How to use this appendix

Node has issued more than 200 numbered deprecations. Most of them concern APIs
nobody has used since Node 4. Reprinting the whole list would bury the ten or
fifteen that are actually sitting in your codebase right now.

So this appendix is a triage tool. It explains the four deprecation stages and
the flags that reveal them, then gives you:

- **§D.4 — the high-impact table**: deprecations you are genuinely likely to
  have, with current stage, replacement, and a migration note.
- **§D.5 — recently reached End-of-Life**: the urgent list. These no longer
  warn; they throw, return the wrong thing, or the API is simply gone. This is
  the section to read before an upgrade.
- **§D.6 — a repeatable audit procedure.**

**Every stage in this appendix has been verified against the Node 27.0.0-pre
documentation.** Several deprecations moved to End-of-Life in Node 24, 25 and
26, and a second batch lands in 27. A table that says "runtime deprecation" for
something that was removed two majors ago is worse than no table at all, so
where the source docs mark a change as pending release, this appendix says so
explicitly rather than guessing a version number.

The narrative treatment of upgrading — planning, testing, rollback — is
[Chapter 63 — Upgrading Node.js](../part9-production/63-upgrading-node.md). This
is the lookup companion.

---

## D.1 The four stages

Note the count. Almost every summary you will read online says "three stages".
Node's own documentation defines **four**, and the one people miss is the most
practically important.

| Stage | What happens at runtime | What it means for you |
|---|---|---|
| **Documentation-only** | Nothing. No warning, no behaviour change. | A note in the docs. Some — and only some — of these also warn under `--pending-deprecation`; the docs label those explicitly. |
| **Application (non-`node_modules` code only)** | A warning printed to stderr on first use, **but only when the call is in your own code**. Calls from inside `node_modules` stay silent. | Node's compromise: nudge the people who can fix it, without drowning everyone in warnings from dependencies. Under `--pending-deprecation`, dependency usage warns too. Under `--throw-deprecation`, it throws. |
| **Runtime (all code)** | A warning on first use, from anywhere — your code or a dependency's. | The API is on its way out. Plan the migration now. |
| **End-of-Life** | The API is removed or its behaviour has changed. Calls throw, or silently do something different. | Not a warning. A breaking change. Fix before you upgrade, not after. |

Two stages that are not really stages:

- **Revoked / Deprecation revoked** — the deprecation was reversed. The number
  is never reused, so the entry stays in the list. `DEP0116` (Legacy URL API),
  `DEP0037`/`DEP0038` (`fs.lchown`), `DEP0089` (`require('node:assert')`) and
  `DEP0163` are all revoked. If you migrated away from one of these, you did not
  waste your time — but you also do not need to keep chasing it.
- **Compile-time** — applies to native addon source, not JavaScript. `DEP0099`
  is the only one.

A deprecation almost always walks the stages in order, over several major
releases. `DEP0176` is a clean example: documentation-only in v20.8.0, runtime
in v24.0.0, End-of-Life in v25.0.0. That is roughly a two-year window — enough
time if you are watching, no time at all if you are not.

---

## D.2 The flags that surface deprecations

All four exist; all four are verified against `cli.md`.

| Flag | Since | What it does | When to use |
|---|---|---|---|
| `--pending-deprecation` | v8.0.0 | Emits deprecations that are off by default, and promotes Application-stage warnings so they fire for `node_modules` code too. | **Run your whole test suite with this before every major upgrade.** It is the single most valuable flag in this appendix. |
| `--trace-deprecation` | v0.8.0 | Prints a stack trace with each deprecation warning. | Always pair it with the flag above. Without a stack you know *what* is deprecated but not *who* is calling it. |
| `--throw-deprecation` | v0.11.14 | Turns deprecation warnings into thrown errors. | In CI, so a newly introduced deprecated call fails the build. Never in production — it converts a warning into an outage. |
| `--no-deprecation` | v0.8.0 | Silences deprecation warnings. | Almost never. It does not change behaviour, only your ability to see what is coming. |

Environment-variable equivalents, for when you cannot change the command line:

| Variable | Equivalent to |
|---|---|
| `NODE_PENDING_DEPRECATION=1` | `--pending-deprecation` |
| `NODE_NO_WARNINGS=1` | `--no-warnings` (broader — silences *all* warnings) |

If you need to silence exactly one deprecation you have already investigated and
accepted, do not reach for `--no-deprecation`. Use:

```bash
node --disable-warning=DEP0040 app.js
```

That suppresses the punycode warning and leaves every other warning — including
the ones telling you about a real leak — visible. `--disable-warning` also
accepts a type, e.g. `--disable-warning=DeprecationWarning`, but that is
`--no-deprecation` by another name; prefer the code.

The combination to memorise:

```bash
node --pending-deprecation --trace-deprecation --throw-deprecation --test
```

Run that in CI on the next Node major before you deploy it. Anything that
survives is genuinely clean.

---

## D.3 Reading the tables

`Stage` is the value of the `Type:` field in Node's own deprecation list, as of
27.0.0-pre. Where the documentation records a stage change whose release number
is not yet assigned, this appendix writes **"lands in 27"** — the change is on
`main` and will ship in the next major.

`Since` gives the release in which the current stage took effect.

---

## D.4 The high-impact table

These are ordered by how likely they are to be in a real codebase today.

### Buffers

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0005` | `Buffer()` and `new Buffer()` | **Application** | v10.0.0 (runtime); application-scoped thereafter | `Buffer.alloc(size)`, `Buffer.allocUnsafe(size)`, `Buffer.from(...)` | The classic. `new Buffer(50)` returned *uninitialised* memory that could contain anything previously on the heap — including another request's data. Because it is Application-stage, **you get no warning for `Buffer()` calls inside dependencies** unless you pass `--pending-deprecation`. Do that; you will usually find more than you expected. Rule of thumb: a number means `alloc`, anything else means `from`. |
| `DEP0030` | `SlowBuffer` | **End-of-Life** | — | `Buffer.allocUnsafeSlow(size)` | Removed. |
| `DEP0158` | `buf.slice(start, end)` | Documentation-only | v17.5.0 | `buf.subarray(start, end)` | `Buffer.prototype.slice` copies nothing but is incompatible with `Uint8Array.prototype.slice`, which does copy. That inconsistency is the whole reason for the deprecation. `subarray` is the same non-copying behaviour with an honest name. |
| `DEP0102` | `noAssert` in `buf.read*` / `buf.write*` | **End-of-Life** | — | — | The parameter is gone; bounds are always checked. |

See [Chapter 16 — Buffers and Typed Arrays](../part3-data/16-buffers.md).

### URLs

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0169` | `url.parse()` — the *insecure behaviour* | **Application** | v24.0.0 | `new URL(input)` | The important one. The docs state that `url.parse()` is non-standard, prone to security-relevant errors, and that **CVEs are not issued for `url.parse()` vulnerabilities**. `url.format(urlString)` and `url.resolve()` call it internally and are covered by the same deprecation. Treat this as a security finding, not a style issue. |
| `DEP0170` | `url.parse()` with a non-numeric port | **End-of-Life** | v25.0.0 | `new URL(input)` | **Now throws.** Previously it accepted garbage ports, which enabled hostname spoofing. If you upgrade to 25+ and a URL parse suddenly throws, this is why — and the old behaviour was the bug. |
| `DEP0116` | Legacy URL API generally | **Deprecation revoked** | v24.0.0 | — | Worth knowing: the blanket deprecation of `url.parse` / `url.format` / `url.resolve` / `urlObject` was **revoked**. `DEP0169` replaced it with a narrower, sharper deprecation of the insecure behaviour. So the API is not going away wholesale — but you should still migrate to `new URL()`. |
| `DEP0040` | `node:punycode` | **Application** | v23.7.0 / v22.14.0 | A userland punycode package | Ran through documentation-only (v7), pending-deprecation support (v16.6.0), runtime (v21.0.0), and now application-scoped. Most people hit this via an old transitive dependency, not their own code. `--pending-deprecation` plus `--trace-deprecation` names the culprit. Note `new URL()` handles IDNs natively — you may not need punycode at all. |

See [Chapter 32 — URLs, Query Strings, and Punycode](../part5-networking/32-url-and-querystring.md).

### Crypto

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0106` | `crypto.createCipher()` / `crypto.createDecipher()` | **End-of-Life** | v22.0.0 | `crypto.createCipheriv()` / `createDecipheriv()` | **Removed.** They derived a key with unsalted MD5 and used a static IV — the same plaintext always produced the same ciphertext. Derive a key with `crypto.scrypt()` or `crypto.pbkdf2()` using a random salt, and pass a random IV. Data encrypted with the old API must be decrypted with a reimplementation of the old KDF before you can re-encrypt it; plan a migration window. |
| `DEP0093` | `crypto.fips` property | Runtime | v23.0.0 | `crypto.setFips()` / `crypto.getFips()` | Straight rename. An automated codemod exists. |
| `DEP0179` | `Hash` constructor | Runtime | v22.0.0 | `crypto.createHash()` | Same for `DEP0181` / `Hmac` → `crypto.createHmac()`. These were never public API; people found them through introspection. |
| `DEP0181` | `Hmac` constructor | Runtime | v22.0.0 | `crypto.createHmac()` | As above. |
| `DEP0206` | `hmac.digest()` on an already-finalised `Hmac` | Runtime | lands in 27 | Create a new `Hmac` | Currently returns an *empty buffer* instead of throwing — an inconsistency with `hash.digest()` that produces silent, subtle bugs. It will throw in a future version. If you have code that calls `digest()` in a loop, check it now. |
| `DEP0182` | Short GCM auth tags without explicit `authTagLength` | **End-of-Life** | v26.0.0 | Pass `authTagLength` explicitly | **Now rejected.** Previously `decipher.setAuthTag()` accepted any valid length, which weakened authentication. If you truncate GCM tags, you must now declare the length. |
| `DEP0198` | SHAKE-128 / SHAKE-256 without `options.outputLength` | **End-of-Life** | lands in 27 (runtime since v25.0.0) | Pass `outputLength` | Always specify the digest length for extendable-output functions. |
| `DEP0203` | Passing a `CryptoKey` to `node:crypto` APIs | **End-of-Life** | lands in 27 (runtime since v26.0.0) | `KeyObject` | Mixing Web Crypto keys into the classic crypto API is no longer supported. Convert with `KeyObject.from()`. |
| `DEP0204` | `KeyObject.from()` with a non-extractable `CryptoKey` | **End-of-Life** | lands in 27 (runtime since v26.0.0) | An extractable key | Non-extractable means non-extractable. |
| `DEP0183` | OpenSSL engine-based APIs | Runtime | lands in 27 | OpenSSL 3 providers | Affects `clientCertEngine` on `https.request()`, `tls.createSecureContext()` and `tls.createServer()`; `privateKeyEngine` and `privateKeyIdentifier`; and `crypto.setEngine()`. If you use a hardware token or HSM through an OpenSSL engine, start planning the move to the provider model. |
| `DEP0167` | Weak `DiffieHellmanGroup` — `modp1`, `modp2`, `modp5` | Documentation-only | v18.10.0 | Stronger MODP groups | Not secure against practical attacks (RFC 8247 §2.4). Might be removed. |
| `DEP0146` | `new crypto.Certificate()` | Documentation-only | v14.9.0 | Static methods on `crypto.Certificate` | Trivial change. |

See [Chapter 41](../part6-security/41-crypto-essentials.md) and
[Chapter 42](../part6-security/42-crypto-encryption.md).

### Filesystem

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0147` | `fs.rmdir(path, { recursive: true })` | **End-of-Life** | v25.0.0 | `fs.rm(path, { recursive: true, force: true })` | **The `recursive` option has been removed from `rmdir`.** This one catches a lot of build scripts and test teardowns. Note `fs.rm` needs `force: true` as well if you want "delete it if it exists" semantics — otherwise a missing path is an `ENOENT`. |
| `DEP0176` | `fs.F_OK`, `fs.R_OK`, `fs.W_OK`, `fs.X_OK` | **End-of-Life** | v25.0.0 | `fs.constants.F_OK` etc. | **The top-level getters are gone.** They were `undefined`-producing landmines: `fs.access(p, fs.R_OK)` with an undefined second argument silently checked `F_OK` instead. A codemod exists. |
| `DEP0034` | `fs.exists(path, callback)` | Documentation-only | v6.12.0 | `fs.stat()` or `fs.access()` | Deprecated because its callback signature is backwards — `(exists)` rather than `(err, result)` — which is a permanent trap. Note that `fs.existsSync()` is **not** deprecated and is fine. The real advice: do not check-then-act. Just try the operation and handle `ENOENT`; anything else is a race. |
| `DEP0187` | Invalid argument types to `fs.existsSync` | Runtime | v24.0.0 | Pass a string, `Buffer` or URL | Currently returns `false` for nonsense input; will throw. If you pass a possibly-`undefined` path, you are relying on the deprecated behaviour. |
| `DEP0137` | Closing `fs.FileHandle` on garbage collection | **End-of-Life** | v25.0.0 | `await handle.close()`, or `await using` | **Now throws.** Relying on the GC to close file handles was never reliable and leaked descriptors under load. `await using handle = await fs.open(...)` is the clean modern form. |
| `DEP0200` | Closing `fs.Dir` on garbage collection | Documentation-only | v24.9.0 | `dir.close()` or `using` | The same change, one step behind. Fix it while you are fixing `DEP0137`. |
| `DEP0178` | `dirent.path` | **End-of-Life** | v24.0.0 | `dirent.parentPath` | **Removed.** It behaved inconsistently across release lines. A codemod exists. |
| `DEP0162` | `fs.write()` / `writeFileSync()` coercing objects to string | **End-of-Life** | v19.0.0 | Convert explicitly | Passing an object with a `toString` no longer works. Call `String(x)` or `JSON.stringify(x)` yourself. |
| `DEP0180` | `fs.Stats` constructor | Runtime | v22.0.0 | — | Internal; never construct one. |

See [Chapter 22](../part4-system/22-filesystem-basics.md) and
[Chapter 23](../part4-system/23-filesystem-advanced.md).

### `util` and type checking

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0044` | `util.isArray()` | Runtime | v22.0.0 | `Array.isArray()` | The last survivor of the `util.is*` family — `DEP0045` through `DEP0058` (`isBoolean`, `isBuffer`, `isDate`, `isError`, `isFunction`, `isNull`, `isNullOrUndefined`, `isNumber`, `isObject`, `isPrimitive`, `isRegExp`, `isString`, `isSymbol`, `isUndefined`) are all **End-of-Life and removed**. If any of them appear in your code, it does not run on modern Node at all. A codemod exists for the whole family. |
| `DEP0060` | `util._extend()` | Runtime | v22.0.0 | `Object.assign(target, source)` | An unmaintained internal that leaked into userland by accident. Mechanical replacement; a codemod exists. |
| `DEP0175` | `util.toUSVString()` | Documentation-only | v20.8.0 | `String.prototype.toWellFormed()` | Now a language built-in. |
| `DEP0197` | `util.types.isNativeError()` | Documentation-only | v24.2.0 | `Error.isError()` | Also now a language built-in. Codemod available. |
| `DEP0177` | `util.types.isWebAssemblyCompiledModule` | **End-of-Life** | v21.7.0 | `value instanceof WebAssembly.Module` | Removed. |
| `DEP0174` | `util.promisify()` on a function that already returns a promise | Runtime | v21.0.0 | Call the function directly | The promisified wrapper *ignores* the returned promise, so rejections go unhandled. If you see this warning, you have a latent unhandled-rejection bug, not just a style problem. |
| `DEP0059` | `util.log()` | **End-of-Life** | — | A real logger | Removed. See [Chapter 51](../part7-diagnostics/51-console-and-logging.md). |

### Modules and internals

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0111` | `process.binding()` | Documentation-only (**supports `--pending-deprecation`**) | v11.12.0 | Public APIs only | Node internals, never public. It has not reached End-of-Life, but **it is unavailable when the permission model is enabled** — so a dependency using it will break the moment you turn on `--permission`. `DEP0103` (`process.binding('util').is[...]`) and `DEP0119` (`process.binding('uv').errname()`) are folded into this. Find it with `--pending-deprecation`. |
| `DEP0205` | `module.register()` | Runtime | v26.0.0 | `module.registerHooks()` | **Recent and high-impact.** The async, off-thread loader-hook API is being replaced by synchronous in-thread hooks that work for CommonJS as well as ESM. Anything that registers a loader — instrumentation agents, TypeScript loaders, mocking libraries — is affected. See [Chapter 53](../part8-advanced/53-module-hooks.md). |
| `DEP0193` | `require('node:_stream_*')` | **End-of-Life** | v26.0.0 | `node:stream` | `_stream_duplex`, `_stream_passthrough`, `_stream_readable`, `_stream_transform`, `_stream_wrap`, `_stream_writable` are all gone. |
| `DEP0192` | `require('node:_tls_common')`, `require('node:_tls_wrap')` | **End-of-Life** | lands in 27 | `node:tls` | Same reasoning. |
| `DEP0199` | `require('node:_http_*')` | Documentation-only | v24.6.0 | `node:http` | `_http_agent`, `_http_client`, `_http_common`, `_http_incoming`, `_http_outgoing`, `_http_server`. The `_stream_` and `_tls_` families have already reached End-of-Life; this one is next. |
| `DEP0144` | `module.parent` | Documentation-only (**supports `--pending-deprecation`**) | v14.6.0 | Compare `require.main === module` | Does not work meaningfully once ESM is in the graph. |
| `DEP0138` | `process.mainModule` | Documentation-only | v14.0.0 | `require.main` | CommonJS-only concept on a global shared with ESM. |
| `DEP0039` | `require.extensions` | Documentation-only | v6.12.0 | Loader hooks | The old way to hook module loading. |
| `DEP0092` | Top-level `this` bound to `module.exports` | Documentation-only | v10.0.0 | `exports` / `module.exports` | Only affects CommonJS. |
| `DEP0128` | Package with an invalid `main` but a top-level `index.js` | Runtime | v16.0.0 | Fix `main`, or add `"exports"` | Will throw in a future version. Usually a packaging bug in a dependency. |
| `DEP0151` | Main index lookup and extension searching for ESM | Runtime | v16.0.0 | Explicit `"exports"` or `"main"` with an extension | ESM does not guess. |
| `DEP0155` | Trailing slashes in pattern specifier resolutions | Runtime | v17.0.0 | Pattern subpaths without the trailing slash | Affects `"exports"` / `"imports"` maps. |
| `DEP0166` | Double slashes in `"imports"` / `"exports"` targets | Runtime | v19.0.0 | Single slashes | Will become a resolution error. |
| `DEP0148` | Folder mappings in `"exports"` (trailing `"/"`) | **End-of-Life** | v17.0.0 | Subpath patterns (`"./*"`) | Removed. |
| `DEP0008` | `require('node:constants')` | Documentation-only | v6.12.0 | `fs.constants`, `os.constants` | Per-module constants. |
| `DEP0025` | `require('node:sys')` | Runtime | v6.12.0 | `node:util` | `sys` was the pre-1.0 name for `util`. |

### Streams, HTTP and networking

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0157` | Thenable support in stream implementation methods | **End-of-Life** | v18.0.0 | Callbacks | You can no longer make `_read` / `_write` / `_transform` an `async function`. This bit a lot of people who assumed async was always safe — mixing promise and callback semantics in the same method caused errors that were nearly impossible to trace. |
| `DEP0201` | `options.type` on `Duplex.toWeb()` | Runtime | v26.0.0 | `readableType` | Recent. Renamed for clarity about which half it applies to. See [Chapter 20](../part3-data/20-web-streams.md). |
| `DEP0195` | Instantiating `node:http` classes without `new` | Runtime | lands in 27 | Use `new` | Affects `OutgoingMessage`, `IncomingMessage`, `ServerResponse`, `ClientRequest`, `Server`, `Agent`. Codemod available. |
| `DEP0184` | Instantiating `node:zlib` classes without `new` | **End-of-Life** | lands in 27 (runtime since v24.0.0) | Use `new` | `Deflate`, `Gunzip`, `BrotliCompress`, `ZstdCompress` and the rest. `zlib.createGzip()` and friends are unaffected — prefer those. |
| `DEP0185` | Instantiating `node:repl` classes without `new` | **End-of-Life** | v25.0.0 | Use `new` | `REPLServer`, `Recoverable`. Codemod available. |
| `DEP0194` | HTTP/2 priority signaling | **End-of-Life** | v24.2.0 / v22.23.0 | Nothing — remove it | Removed following its deprecation in RFC 9113. Any `priority`/`weight` handling in HTTP/2 code is now dead weight. Codemod available. |
| `DEP0202` | `Http1IncomingMessage` / `Http1ServerResponse` options on HTTP/2 servers | Documentation-only | v25.7.0 | `http1Options.IncomingMessage`, `http1Options.ServerResponse` | Renamed for ALPN-negotiated HTTP/1 fallback. |
| `DEP0156` | `.aborted` and `'abort'` / `'aborted'` in `http` | Documentation-only | v17.0.0 | `stream.destroyed`; the `'close'` event | The stream API is the source of truth. Check `destroyed`, listen for `'close'`, and use `.destroy([error])` to end a request early. |
| `DEP0207` | `.aborted` and `'aborted'` in `http2` | Documentation-only | lands in 27 | Stream events and state | The HTTP/2 parallel of `DEP0156`. Read-side aborts now surface as `'error'` with `ERR_HTTP2_STREAM_ABORTED` (clean peer reset) or `ERR_HTTP2_STREAM_ERROR` (non-clean); write-side aborts are detectable from `'close'` by checking `writableFinished`. |
| `DEP0140` | `request.abort()` | Documentation-only | v14.1.0 | `request.destroy()` | Mechanical. |
| `DEP0133` | `response.connection` / `request.connection` | Documentation-only | v12.12.0 | `.socket` | Mechanical. `DEP0149` is the same for `http.IncomingMessage`. |
| `DEP0136` | `response.finished` | Documentation-only | v13.4.0 | `writableFinished` or `writableEnded` | `finished` means "`end()` was called", not "the data is flushed". Two different questions; pick the one you actually mean. |
| `DEP0171` | Setters for `http.IncomingMessage` headers/trailers | Documentation-only | v19.3.0 | Do not mutate them | `headers`, `headersDistinct`, `trailers` and `trailersDistinct` will become read-only. Middleware that rewrites `req.headers` in place needs another approach. |
| `DEP0145` | `socket.bufferSize` | Documentation-only | v14.6.0 | `writable.writableLength` | Just an alias. |
| `DEP0208` | `Server.prototype._listen2` | Runtime | lands in 27 | `server.listen()` | An undocumented internal that some libraries monkey-patch. If a dependency starts warning here, it is patching Node internals — worth knowing regardless. |
| `DEP0131` | Legacy HTTP parser | **End-of-Life** | v13.0.0 | — | Removed, along with `--http-parser=legacy`. |

### Process, child processes and async

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0190` | `args` array with `{ shell: true }` in `execFile`/`spawn` | Runtime | v24.0.0 | Either drop `shell`, or build one command string yourself | **Read this one carefully — it is a security deprecation.** With `shell: true`, the `args` array is *not* escaped, only joined with spaces. Any argument containing shell metacharacters is interpreted by the shell. If those arguments come from user input, you have a command-injection vulnerability. The safe form is `spawn(cmd, args)` with no `shell` option at all. |
| `DEP0196` | `{ shell: '' }` in `child_process` functions | Documentation-only | v24.2.0 | `shell: true`, or omit it | An empty string is almost certainly a bug — usually a config value that failed to resolve. |
| `DEP0018` | Unhandled promise rejections | **End-of-Life** | v15.0.0 | Handle them | The old warn-and-continue behaviour is gone: an unhandled rejection now terminates the process with a non-zero exit code. `--unhandled-rejections=<mode>` changes this, but see [Appendix A §A.15](a-cli-flags.md#a15-the-dangerous-flags) — `none` is not a fix. |
| `DEP0160` | `process.on('multipleResolves')` | **End-of-Life** | v25.0.0 | — | **Removed.** It never worked with V8's promise combinators. If you had monitoring hooked to this event, it is now dead code. |
| `DEP0164` | Non-integer values for `process.exit(code)` / `process.exitCode` | **End-of-Life** | v20.0.0 | Integers, integer strings, `null`, or `undefined` | `process.exit(true)` no longer does something surprising; it throws. |
| `DEP0139` | `process.umask()` with no arguments | Documentation-only | v14.0.0 | — | Writes the process umask twice, creating a race between threads. The docs are explicit that there is **no safe cross-platform alternative** — so the real fix is to stop reading the umask, not to find a different API. |
| `DEP0161` | `process._getActiveHandles()` / `_getActiveRequests()` | Documentation-only | v17.6.0 | `process.getActiveResourcesInfo()` | The supported version returns resource *types*, not live references — which is what you actually want when hunting "why won't this process exit". |
| `DEP0104` | `process.env` string coercion | Documentation-only (**supports `--pending-deprecation`**) | v10.0.0 | Convert to string yourself | Assigning a non-string, non-boolean, non-number to `process.env` may throw in future. |
| `DEP0172` | The `asyncResource` property on `AsyncResource`-bound functions | **End-of-Life** | v25.0.0 | — | The property is simply no longer added. |
| `DEP0032` | `node:domain` | Documentation-only | v6.12.0 | `AsyncLocalStorage` | Still documentation-only after all these years, but do not write new code against it. `AsyncLocalStorage` solves the context-propagation half properly; there is no direct replacement for the error-trapping half by design. See [Chapter 15](../part2-async/15-async-context.md). |
| `DEP0168` | Unhandled exception in Node-API callbacks | Runtime | — | Handle them in the addon | Relevant if you ship or depend on native addons. |
| `DEP0099` | Async context-unaware `node::MakeCallback` C++ APIs | Compile-time | — | The context-aware forms | Native addon source only. |

### Testing and assertions

| DEP | API | Stage | Since | Use instead | Migration note |
|---|---|---|---|---|---|
| `DEP0173` | `assert.CallTracker` | **End-of-Life** | v25.0.0 | `mock.fn()` from `node:test`, or a mocking library | **Removed.** It was runtime-deprecated in v20.1.0 and gone by v25 — an unusually fast path. If your tests use `new assert.CallTracker()`, they will not run on Node 25 or later. `t.mock.fn()` with `mock.calls.length` assertions is the direct replacement. See [Chapter 45](../part7-diagnostics/45-test-runner.md). |
| `DEP0094` | `assert.fail()` with more than one argument | **End-of-Life** | — | `assert.fail(message)` | The multi-argument form is gone. |

---

## D.5 Recently reached End-of-Life — these now throw or are gone

This is the urgent list. If you are moving to Node 24, 25, 26 or 27, check these
first: they produce no warning because there is nothing left to warn about.

**Removed in Node 22**

| DEP | What was removed |
|---|---|
| `DEP0106` | `crypto.createCipher()` and `crypto.createDecipher()`. |

**Removed in Node 23**

| DEP | What was removed |
|---|---|
| `DEP0165` | The `--trace-atomics-wait` flag. Node will refuse to start if it is still in your `NODE_OPTIONS`. |

**Removed in Node 24**

| DEP | What was removed |
|---|---|
| `DEP0178` | `dirent.path` — use `dirent.parentPath`. |
| `DEP0194` | HTTP/2 priority signaling (v24.2.0, backported to v22.23.0). |

**Removed in Node 25**

| DEP | What was removed |
|---|---|
| `DEP0147` | The `recursive` option on `fs.rmdir` / `rmdirSync` / `promises.rmdir`. |
| `DEP0173` | `assert.CallTracker`. |
| `DEP0176` | `fs.F_OK`, `fs.R_OK`, `fs.W_OK`, `fs.X_OK` — use `fs.constants`. |
| `DEP0137` | Implicit close of `fs.FileHandle` on GC — now throws. |
| `DEP0160` | `process.on('multipleResolves')`. |
| `DEP0170` | `url.parse()` with a non-numeric port — now throws. |
| `DEP0172` | The `asyncResource` property on bound functions. |
| `DEP0185` | Instantiating `node:repl` classes without `new`. |

**Removed in Node 26**

| DEP | What was removed |
|---|---|
| `DEP0182` | Short GCM authentication tags without an explicit `authTagLength`. |
| `DEP0193` | `require('node:_stream_duplex')` and the rest of the `_stream_*` family. |

**Landing in Node 27** (marked as pending release in the 27.0.0-pre docs)

| DEP | What is being removed or escalated |
|---|---|
| `DEP0192` | `require('node:_tls_common')`, `require('node:_tls_wrap')` — End-of-Life. |
| `DEP0184` | Instantiating `node:zlib` classes without `new` — End-of-Life. |
| `DEP0198` | SHAKE digests without `options.outputLength` — End-of-Life. |
| `DEP0203` | Passing a `CryptoKey` to `node:crypto` APIs — End-of-Life. |
| `DEP0204` | `KeyObject.from()` with a non-extractable `CryptoKey` — End-of-Life. |
| `DEP0097` | `MakeCallback` with a `domain` property — End-of-Life. |
| `DEP0183` | OpenSSL engine-based APIs — escalating to runtime deprecation. |
| `DEP0195` | Instantiating `node:http` classes without `new` — escalating to runtime. |
| `DEP0206` | `hmac.digest()` on a finalised `Hmac` — new runtime deprecation. |
| `DEP0208` | `Server.prototype._listen2` — new runtime deprecation. |
| `DEP0207` | `.aborted` in `http2` — new documentation-only deprecation. |

Also long removed, but still found in old code often enough to be worth naming:
the entire `util.is*` family (`DEP0045`–`DEP0058`), `util.log()` (`DEP0059`),
`SlowBuffer` (`DEP0030`), `tls.createSecurePair()` (`DEP0064`), custom
`.inspect()` methods (`DEP0079` — use `util.inspect.custom`), `crypto.pbkdf2`
without a digest (`DEP0009`), and `NODE_REPL_HISTORY_FILE` (`DEP0041`).

---

## D.6 Auditing a codebase before an upgrade

A procedure you can run in an afternoon and then wire into CI.

**Step 1 — Get the real inventory, including dependencies.**

Run your full test suite on the *new* Node version, with every deprecation
surfaced and traced:

```bash
node --pending-deprecation --trace-deprecation --test
```

`--pending-deprecation` is what makes this worth doing. Without it, Application-
stage deprecations (`Buffer()`, `url.parse()`, `punycode`) stay silent for
everything inside `node_modules` — which is exactly where they usually are.

Capture the output rather than reading it live:

```bash
NODE_OPTIONS="--pending-deprecation --trace-deprecation" \
  node --test 2> deprecations.log
grep -o 'DEP[0-9]\{4\}' deprecations.log | sort | uniq -c | sort -rn
```

You now have a ranked list of exactly which deprecations you have, and how often.

**Step 2 — Attribute each one.** The stack trace from `--trace-deprecation`
tells you whether the call is yours or a dependency's. Sort into three buckets:

- *Your code* — fix it now. Most are mechanical.
- *A dependency, with a newer version available* — upgrade the dependency.
- *A dependency, unmaintained* — this is your real risk. Decide now whether to
  fork, replace, or vendor-patch it. Discovering it during a production upgrade
  window is much worse.

**Step 3 — Check the End-of-Life list first, not last.** §D.5 is the part that
produces no warning at all. Grep for the removed APIs directly:

```bash
grep -rn "new Buffer(\|Buffer(" src --include="*.js" --include="*.ts"
grep -rn "createCipher(\|createDecipher(" src
grep -rn "rmdir(.*recursive" src
grep -rn "assert.CallTracker\|CallTracker" src test
grep -rn "fs\.\(F_OK\|R_OK\|W_OK\|X_OK\)" src
grep -rn "dirent\.path\|\.path\b" src        # narrow this one by hand
grep -rn "url\.parse(\|url\.resolve(" src
grep -rn "util\.is[A-Z]\|util\._extend" src
grep -rn "process\.binding(" src node_modules -l
grep -rn "multipleResolves" src
```

Run the same greps across `node_modules`. A dependency calling a removed API
breaks at runtime, on whatever code path happens to reach it — possibly not the
one your tests cover.

**Step 4 — Check your flags and environment.** Removed *flags* fail at startup,
which is at least loud. Check `NODE_OPTIONS`, Dockerfiles, systemd units, CI
config and `package.json` scripts for `--trace-atomics-wait`,
`--http-parser=legacy`, `--experimental-transform-types` (removed in v26),
`--no-experimental-strip-types` (renamed to `--no-strip-types` in v25.2.0 /
v24.12.0 when type stripping became stable), and `NODE_REPL_HISTORY_FILE`.

**Step 5 — Look for automated migrations.** Node maintains codemods for many of
the mechanical deprecations at
<https://github.com/nodejs/userland-migrations>. The deprecation entries in the
official docs link to the relevant recipe where one exists — including for
`util.is*`, `util._extend`, `crypto.fips`, `fs` access constants,
`dirent.parentPath`, `repl` classes, `http` classes, HTTP/2 priority signaling,
`util.types.isNativeError`, `repl.builtinModules`, and the legacy URL API.
Review every diff a codemod produces; they are good, not omniscient.

**Step 6 — Make the fix stick.** Add a CI job on the *next* Node major that runs
with deprecations fatal:

```bash
node --pending-deprecation --throw-deprecation --test
```

Let it fail the build. Without this, everything you cleaned up in step 2 will
have crept back before the next upgrade.

**Step 7 — Stage the rollout.** Deploy the new Node version to one instance
first and watch stderr. A deprecation on a rare code path — an error handler, a
retry, a monthly job — will not appear in tests. Keep `--trace-deprecation` on
for the first day in production; it costs nothing and turns a cryptic warning
into an actionable stack.

**One habit worth building:** run `--pending-deprecation --trace-deprecation` in
your local dev command permanently, not just before upgrades. You then fix
deprecations one at a time as they appear, instead of finding forty of them the
week the LTS line goes end-of-life.

---

## Where to go next

- [Chapter 63 — Upgrading Node.js: Deprecations and Migration](../part9-production/63-upgrading-node.md) —
  the full narrative treatment of planning and executing an upgrade.
- [Appendix A — CLI Flag Reference](a-cli-flags.md) — `--pending-deprecation`,
  `--trace-deprecation`, `--throw-deprecation`, `--disable-warning`.
- [Appendix B — Environment Variable Reference](b-environment-variables.md) —
  `NODE_PENDING_DEPRECATION`, `NODE_NO_WARNINGS`.
- [Appendix E — Stability Index and Release Lines](e-stability-and-releases.md) —
  how the stability scale relates to the deprecation stages, and when each
  release line stops receiving fixes.
- [Chapter 2 — Installing Node, Release Lines, and Version Management](../part1-foundations/02-install-and-release-lines.md)
- Full official list of every deprecation:
  <https://nodejs.org/docs/latest/api/deprecations.html>
- Codemods: <https://github.com/nodejs/userland-migrations>
