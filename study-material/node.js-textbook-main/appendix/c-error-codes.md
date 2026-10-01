---
chapter: "C"
part: "Appendices"
title: "Error Code Catalogue"
level: intermediate
reading_time: "35 min"
prerequisites: [14]
source_docs:
  - "doc/api/errors.md"
source_url: "https://nodejs.org/docs/latest/api/errors.html"
node_baseline: "27.0.0-pre"
---

# Appendix C — Error Code Catalogue

## How to use this appendix

Node defines over 400 `ERR_` codes. Reprinting them all here would be
pointless — the official page already does that, alphabetically, and you can
search it. What the official page does not tell you is *why* you got the error,
what actually causes it in real code, and what to change.

So this appendix does four things:

1. Explains the anatomy of a Node error and why `error.code` — not
   `error.message` — is the contract you write code against.
2. Explains the code families, so an unfamiliar code is still partly readable.
3. Gives curated tables, grouped by area, of the codes a working developer
   actually meets — with the usual root cause and the fix.
4. Covers the POSIX `errno` codes that surface through `SystemError`, because
   those (`ENOENT`, `EADDRINUSE`, `ECONNRESET`…) are what you see far more often
   than any `ERR_` code.

It closes with a procedure for diagnosing a code that is not in any table here.

Conceptual background — error classes, `cause`, `AggregateError`, and handling
strategy — is [Chapter 14 — Errors](../part2-async/14-errors.md). This is the
lookup companion to that chapter.

---

## C.1 The anatomy of a Node error

A Node-generated error is a normal `Error` (or a subclass) with extra properties
attached. The ones that matter:

| Property | Type | What it is |
|---|---|---|
| `code` | string | A stable label identifying the *kind* of error: `'ENOENT'`, `'ERR_INVALID_ARG_TYPE'`. |
| `message` | string | Human-readable description. **Not stable.** |
| `stack` | string | Where the error was constructed, not necessarily where it was thrown. |
| `cause` | any | The underlying error, when one error wraps another. |

For a `SystemError` — anything originating from the operating system — you also
get:

| Property | Type | What it is |
|---|---|---|
| `errno` | number | The system error number, **negative**, matching libuv's table. Normalised by libuv on Windows. |
| `syscall` | string | The failing system call: `'open'`, `'connect'`, `'getaddrinfo'`. |
| `path` | string | The offending pathname, when there is one. |
| `dest` | string | The destination path, for two-path operations like `rename` and `cp`. |
| `address` | string | The address a network connection failed to reach. |
| `port` | number | The port that was unavailable. |
| `info` | object | Extra structured detail, when Node has any. |

`util.getSystemErrorName(error.errno)` turns the number back into a string if
you only have the number.

### Why `error.code` is the contract

The documentation is explicit: `error.code` "is the most stable way to identify
an error. It will only change between major versions of Node.js. In contrast,
`error.message` strings may change between any versions."

That single sentence should shape all of your error handling. This is wrong:

```js
try {
  await readFile(configPath, 'utf8');
} catch (err) {
  if (err.message.includes('no such file')) {   // ❌ breaks on a message reword,
    return defaultConfig;                       //    and on a non-English locale
  }
  throw err;
}
```

This is right:

```js
try {
  await readFile(configPath, 'utf8');
} catch (err) {
  if (err.code === 'ENOENT') return defaultConfig;
  throw err;
}
```

Three rules that follow from it:

- **Never match on message text.** Not with `includes`, not with a regex.
- **Never match on the error's class name.** Many distinct failures share
  `TypeError`; `code` is what distinguishes them.
- **Always rethrow what you did not handle.** The `throw err` in the example
  above is not optional. A bare `catch` that swallows everything turns a
  permission bug into a silent wrong answer.

### Attaching codes to your own errors

Adopt the same contract in your own code. Give your errors a `code`, prefix it
so it cannot collide with Node's, and preserve the original via `cause`:

```js
class ConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ConfigError';
    this.code = 'APP_CONFIG_INVALID';
  }
}

try {
  parse(await readFile(path, 'utf8'));
} catch (err) {
  throw new ConfigError(`Cannot load config from ${path}`, { cause: err });
}
```

Callers now switch on `err.code`, and `err.cause.code` still tells them it was
really an `ENOENT`.

### Errors versus exceptions

Node's docs draw a line worth internalising. A JavaScript exception is a value
thrown by `throw`; you can catch it. A *fatal error* is raised by the runtime
itself — an out-of-memory abort, for instance — and you cannot catch it at all.
No `try`/`catch`, no `process.on('uncaughtException')`. That is why
`--report-on-fatalerror` exists: for those, a diagnostic report is your only
evidence. See [Chapter 50](../part7-diagnostics/50-reports-and-heap.md).

---

## C.2 Code families and naming conventions

Codes are not random. Knowing the shape lets you guess most of the meaning.

| Prefix | Origin | Example | What it tells you |
|---|---|---|---|
| `ERR_` | Node itself | `ERR_INVALID_ARG_TYPE` | Node detected the problem. Almost always your code or a dependency's. |
| `E` + uppercase (no `ERR_`) | Operating system, via libuv | `ENOENT`, `ECONNRESET` | The OS refused or a syscall failed. Comes with `syscall`, and usually `path` or `address`. |
| `HPE_` | The HTTP parser (llhttp) | `HPE_HEADER_OVERFLOW` | The bytes on the wire were malformed or oversized. Usually the *peer's* fault. |
| `ABORT_ERR` | Web-platform convention | `ABORT_ERR` | An `AbortSignal` fired. Not a failure — a cancellation you asked for. |
| Certificate names | OpenSSL verification | `CERT_HAS_EXPIRED`, `DEPTH_ZERO_SELF_SIGNED_CERT` | Peer certificate validation failed. |
| `MODULE_NOT_FOUND` | CommonJS loader | — | The odd one out: no `ERR_` prefix, for historical reasons. The ESM equivalent *is* prefixed: `ERR_MODULE_NOT_FOUND`. |

Within `ERR_`, the second token is usually the subsystem — `ERR_HTTP2_*`,
`ERR_CRYPTO_*`, `ERR_FS_*`, `ERR_STREAM_*`, `ERR_WORKER_*`, `ERR_TLS_*`,
`ERR_VM_*`, `ERR_SQLITE_*` — and the rest describes the condition. Some common
condition words:

- `INVALID_*` — the value you passed is not acceptable.
- `MISSING_*` — a required argument or option was absent.
- `OUT_OF_RANGE` — a number was outside the permitted interval.
- `UNSUPPORTED_*` — the operation is legal in general but not in this
  configuration or on this platform.
- `ALREADY_*` / `AFTER_*` — a lifecycle violation: you used something twice, or
  after it closed.
- `NOT_RUNNING` / `CLOSED` / `DESTROYED` — the object is past its useful life.

Two special categories:

- **`ERR_INTERNAL_ASSERTION`** means a bug in Node itself, or misuse of Node
  internals. The documentation's own advice is to file an issue at
  <https://github.com/nodejs/node/issues>. If you see this in production,
  something in your dependency tree is reaching into internals.
- **Legacy codes.** `errors.md` has a "Legacy Node.js error codes" section
  (Stability 0 — Deprecated) for codes that were removed or renamed:
  `ERR_INVALID_OPT_VALUE`, `ERR_INVALID_CALLBACK`, the `ERR_MANIFEST_*` family
  from the removed policy mechanism, `ERR_TAP_*`, `ERR_HTTP2_STREAM_CLOSED`,
  `ERR_STDOUT_CLOSE`, and others. If your error handling still tests for one of
  these, it is dead code.

---

## C.3 Module resolution and loading

The most common class of error in a new project, and the one where the message
is least helpful.

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `MODULE_NOT_FOUND` | The CommonJS loader could not resolve a `require()`. | Missing dependency; a typo; a path that exists on a case-insensitive filesystem but not in CI. | Check the `requireStack` property — it tells you which file asked. |
| `ERR_MODULE_NOT_FOUND` | The ESM loader could not resolve an `import` or the entry point. | A relative import without a file extension. ESM does not do extension guessing. | Write `./util.js`, not `./util`. |
| `ERR_UNKNOWN_FILE_EXTENSION` | Node reached a file whose extension it does not know how to load. | Importing `.json` without an import attribute; importing an unregistered extension. | Add `with { type: 'json' }`, or register a loader hook. |
| `ERR_UNKNOWN_MODULE_FORMAT` | A loader hook returned a format Node does not recognise. | A custom hook returned an unexpected `format` value. | See [Chapter 53](../part8-advanced/53-module-hooks.md). |
| `ERR_UNSUPPORTED_DIR_IMPORT` | You imported a directory. | Habits carried over from CommonJS, where `require('./lib')` found `./lib/index.js`. | Import the file explicitly, or define a subpath in `"exports"`. |
| `ERR_UNSUPPORTED_ESM_URL_SCHEME` | An `import` used a scheme other than `file:` or `data:`. | Trying to import over `http:`. | Fetch and write it to disk, or vendor it. |
| `ERR_INVALID_MODULE_SPECIFIER` | The specifier is not a valid URL, package name, or subpath. | A Windows path used as a specifier; a stray backslash; a leading or trailing slash. | Use `pathToFileURL()` to build specifiers from paths. |
| `ERR_UNSUPPORTED_RESOLVE_REQUEST` | Invalid referrer for a resolution: a bare specifier from a non-`file:` module, or a relative URL from a module whose scheme is not a special scheme. | Calling `import.meta.resolve()` inside a `data:` module. | Resolve relative to a real file URL. |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | The package's `"exports"` map does not expose the subpath you asked for. | Deep-importing `pkg/lib/internal.js` in a package that has adopted `"exports"`. | Use a documented entry point. `"exports"` is encapsulation, and it is intentional. |
| `ERR_PACKAGE_IMPORT_NOT_DEFINED` | A `#internal` specifier is not defined in `"imports"`. | Typo in the `#`-prefixed name, or the mapping lives in a different `package.json`. | Check the nearest `package.json` up the tree. |
| `ERR_INVALID_PACKAGE_CONFIG` | A `package.json` failed to parse. | Trailing comma; a `package.json` written by a script. | Validate the file. The error names the file. |
| `ERR_INVALID_PACKAGE_TARGET` | An `"exports"` target value is not a valid mapping. | A target that does not start with `./`; a target escaping the package. | Targets must be relative paths inside the package. |
| `ERR_REQUIRE_ESM` | `require()` of an ES module. **[Deprecated] (Stability 0)** | Old code, or old Node. | Largely historical: `require()` of a synchronous ESM graph works by default now. If you still see it, something passed `--no-require-module`. |
| `ERR_REQUIRE_ASYNC_MODULE` | `require()` of an ESM graph that contains top-level `await`. | A dependency added a top-level `await`. | Convert the caller to `import`, or use dynamic `import()`. Run with `--experimental-print-required-tla` to find out exactly where the await is. |
| `ERR_IMPORT_ATTRIBUTE_MISSING` | An import needs an attribute it did not get. | `import data from './x.json'` without `with { type: 'json' }`. | Add the attribute. |
| `ERR_IMPORT_ATTRIBUTE_UNSUPPORTED` | The attribute is not supported by this Node version. | `with { type: 'text' }` without `--experimental-import-text`. | Add the flag, or upgrade. |
| `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | TypeScript that cannot be erased — it would need code generation. | `enum`, `namespace` with runtime members, parameter properties, legacy decorators. | Rewrite in erasable syntax, or use a real compiler. Set `"erasableSyntaxOnly": true` so `tsc` catches it first. See [Chapter 7](../part1-foundations/07-typescript.md). |
| `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` | A `.ts` file inside `node_modules` was loaded. | A dependency ships TypeScript sources. | Type stripping deliberately does not apply inside `node_modules`. The package must ship JavaScript. |
| `ERR_LOADER_CHAIN_INCOMPLETE` | A loader hook returned without calling `next()` and without declaring a short circuit. | A hand-written hook that returns early. | Either call `next()` or set `shortCircuit: true`. |
| `ERR_UNKNOWN_BUILTIN_MODULE` | Points at a bug inside the Node binary itself. | Not caused by normal user code. | File an issue. |
| `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` | `import()` inside a `vm` context with no `importModuleDynamically` callback. | Running module code in `node:vm` without wiring dynamic import. | Supply the callback, or avoid dynamic import in the sandbox. See [Chapter 52](../part8-advanced/52-vm-sandboxing.md). |

Related: [Chapter 4](../part1-foundations/04-modules-commonjs.md),
[Chapter 5](../part1-foundations/05-modules-esm.md),
[Chapter 6](../part1-foundations/06-packages-and-exports.md).

---

## C.4 Filesystem

Most filesystem failures arrive as POSIX errno codes (§C.11). The `ERR_FS_*`
family covers what Node checks itself.

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `ERR_FS_FILE_TOO_LARGE` | `fs.readFile()` hit its 2 GiB ceiling. | Reading a log or dump whole. | Stream it with `fs.createReadStream()`. This is an internal I/O limit, not a `Buffer` limit. |
| `ERR_FS_EISDIR` | The path is a directory where a file was required. | A glob that matched a directory. | Check `stat.isFile()` first. |
| `ERR_FS_CP_EINVAL` | `fs.cp()` got an invalid `src` or `dest`. | Copying a directory into itself or into its own subdirectory. | Copy to a sibling path, then move. |
| `ERR_FS_CP_DIR_TO_NON_DIR` | `fs.cp()` was asked to copy a directory onto a file or symlink. | Stale destination from a previous run. | Remove the destination, or use `force`. |
| `ERR_FS_CP_NON_DIR_TO_DIR` | The reverse: file onto directory. | Same. | Same. |
| `ERR_FS_CP_EEXIST` | `fs.cp()` with `force: true` **and** `errorOnExist: true` hit an existing file. | Contradictory options. | Pick one. |
| `ERR_FS_INVALID_SYMLINK_TYPE` | A bad `type` argument to `fs.symlink()`. | Windows-only option (`'dir'`, `'file'`, `'junction'`) misspelled. | On POSIX the argument is ignored; on Windows it matters. See [Chapter 23](../part4-system/23-filesystem-advanced.md). |
| `ERR_FS_WATCH_QUEUE_OVERFLOW` | More filesystem events queued than `maxQueue` allows. | A build tool rewriting thousands of files while you watch a directory. | Raise `maxQueue`, watch a narrower path, or debounce. |
| `ERR_DIR_CLOSED` | Operation on an `fs.Dir` that was already closed. | Reusing a handle after an `await using` block ended. | Reopen. |
| `ERR_DIR_CONCURRENT_OPERATION` | A synchronous read or close while an async one is in flight on the same `fs.Dir`. | Mixing `dir.read()` and `dir.readSync()`. | Pick one style per handle. |
| `ERR_INVALID_FILE_URL_PATH` | A `file:` URL whose path is not usable on this platform. | Building a URL by string concatenation. | Use `pathToFileURL()`. |
| `ERR_INVALID_FILE_URL_HOST` | A `file:` URL with a host other than `localhost` or empty, on a Unix-like system. | `file://C:/x` instead of `file:///C:/x`. | Three slashes. See [Chapter 24](../part4-system/24-paths.md). |
| `ERR_INVALID_URL_SCHEME` | A URL of the wrong scheme was given to an API that only accepts `file:`. | Passing an `http:` URL to `fs`. | Convert, or fetch separately. |

---

## C.5 Argument and value validation

These are Node telling you that you called it wrong. They are almost never a
Node bug, and the message names the parameter — read it carefully before
debugging anything else.

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `ERR_INVALID_ARG_TYPE` | Wrong type for an argument. | `undefined` from a config lookup that silently failed; a number where a string was expected. | The message names the argument and both types. Trace the value back — the bug is usually one call up. |
| `ERR_INVALID_ARG_VALUE` | Right type, unacceptable value. | An empty string for a path; an unrecognised enum-like option. | Check the accepted values in the API docs. |
| `ERR_OUT_OF_RANGE` | A numeric value fell outside the permitted interval. | An offset computed from a length that changed; a negative timeout. | The message gives the permitted range. |
| `ERR_MISSING_ARGS` | A required argument was omitted entirely. | Optional-looking parameter that is not optional. | Used where the spec distinguishes `f()` from `f(undefined)`. Elsewhere Node prefers `ERR_INVALID_ARG_TYPE`. |
| `ERR_MISSING_OPTION` | A required property of an options object was absent. | Building the options object conditionally. | Validate the object before the call. |
| `ERR_INVALID_RETURN_VALUE` | A callback you supplied returned the wrong kind of value. | A function that should return a promise returned `undefined` — a missing `return` in an arrow body with braces. | Add the `return`. |
| `ERR_INVALID_THIS` | A method was called with an incompatible `this`. | Destructuring a method off an object: `const { end } = res`. | Bind it, or call it as a method. |
| `ERR_ILLEGAL_CONSTRUCTOR` | You called `new` on a class Node does not let you construct. | Instantiating an internal type directly instead of using its factory. | Use the documented factory function. |
| `ERR_INVALID_STATE` | The object cannot do this right now — destroyed, or busy. | Reusing a one-shot object. | Create a new one. |
| `ERR_METHOD_NOT_IMPLEMENTED` | An abstract method you were supposed to override was not. | Subclassing a stream without `_read` or `_write`. | Implement it. See [Chapter 18](../part3-data/18-streams-concepts.md). |
| `ERR_AMBIGUOUS_ARGUMENT` | `assert.throws(block, message)` where `message` equals the message `block` actually throws — which suggests you meant it as the *expected* message. | Misreading the `assert.throws` signature. | Pass a regex or an error class as the second argument. See [Chapter 46](../part7-diagnostics/46-assertions.md). |
| `ERR_MULTIPLE_CALLBACK` | A callback was invoked more than once. | A missing `return` after an early-exit `callback(err)`. | `return callback(err);`. |
| `ERR_INVALID_URL` | A string could not be parsed as a URL. | A missing scheme; unencoded spaces. | The error carries an `input` property with the offending string. See [Chapter 32](../part5-networking/32-url-and-querystring.md). |
| `ERR_UNESCAPED_CHARACTERS` | Characters that must be escaped were not. | Building a request path by concatenation. | `encodeURIComponent()` each segment. |
| `ERR_INVALID_CHAR` | Invalid characters in HTTP headers. | Interpolating user input, containing `\r` or `\n`, into a header. | **This one is a security signal** — it is Node blocking a header-injection attempt. Validate the input, do not strip and continue. |

---

## C.6 Network and DNS

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `ERR_SOCKET_BAD_PORT` | A port outside `0`–`65535`. | A port read from the environment as a string that parsed to `NaN`. | `Number.parseInt` plus validation. `0` is legal and means "pick a free port". |
| `ERR_SERVER_ALREADY_LISTEN` | `listen()` on a server that is already listening. | A `listen()` call inside a retry loop or a re-entered init function. | Guard with `server.listening`. |
| `ERR_SERVER_NOT_RUNNING` | `close()` on a server that never started. | Shutdown handler running before startup finished. | Track your own state; applies to `net`, `http`, `https` and `http2` servers alike. |
| `ERR_SOCKET_ALREADY_BOUND` | Binding a socket twice. | Calling `bind()` in a reconnect path. | Create a new socket. |
| `ERR_SOCKET_CLOSED` | Operating on a closed socket. | A write racing a `close`, common in UDP. | Check state, or handle the error. |
| `ERR_SOCKET_DGRAM_NOT_RUNNING` | A `dgram` call before the socket was bound. | Sending before `'listening'`. | Await the event. See [Chapter 39](../part5-networking/39-udp-dgram.md). |
| `ERR_SOCKET_CONNECTION_TIMEOUT` | Family autoselection (Happy Eyeballs) exhausted every address without connecting in time. | IPv6 records that blackhole. | Tune `--network-family-autoselection-attempt-timeout`, or `--dns-result-order=ipv4first`. See [Chapter 34](../part5-networking/34-dns.md). |
| `ERR_INVALID_ADDRESS` | An address is not valid for the operation. | Mismatched address family. | Check `net.isIP()`. |

---

## C.7 HTTP/1.1 and HTTP/2

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `ERR_HTTP_HEADERS_SENT` | Headers were already flushed; you tried to add or change more. | Two code paths both responding — an early `res.end()` in an error handler plus the normal path. | Check `res.headersSent`, and make sure every branch `return`s after responding. The single most common HTTP bug. |
| `ERR_HTTP_INVALID_STATUS_CODE` | A status outside 100–999. | A status from a variable that was `undefined`. | Validate before `writeHead`. |
| `ERR_HTTP_INVALID_HEADER_VALUE` | A header value Node will not send. | `undefined`, or an object stringified to `[object Object]`. | Serialise explicitly and drop empty values. |
| `ERR_HTTP_BODY_NOT_ALLOWED` | Writing a body to a response that cannot have one. | Sending content with `204` or `304`, or responding to `HEAD`. | End the response without writing. |
| `ERR_HTTP_CONTENT_LENGTH_MISMATCH` | Bytes written do not match the declared `Content-Length`. | Computing length with `str.length` instead of `Buffer.byteLength(str)` on non-ASCII content. | Use `Buffer.byteLength`, or let Node use chunked encoding. |
| `ERR_HTTP_REQUEST_TIMEOUT` | The client did not finish the request within the allowed time. | Slow client, or a slowloris attack. | Expected on the public internet. Log and move on; do not treat it as a server fault. |
| `ERR_HTTP_SOCKET_ASSIGNED` | A socket was assigned to a response that already had one. | Manual socket juggling in an upgrade or proxy handler. | Rare outside proxy code. |
| `HPE_HEADER_OVERFLOW` | More header bytes than `maxHeaderSize` (default 16 KiB). | Huge cookies, or a long `Authorization` header. | Raise `--max-http-header-size` only for a known client. Larger limits cost memory per connection. |
| `HPE_CHUNK_EXTENSIONS_OVERFLOW` | Over 16 KiB of chunk extension data. | Almost always a malicious or broken client. | It is a deliberate protection. Leave it alone. |
| `HPE_UNEXPECTED_CONTENT_LENGTH` | The peer sent both `Content-Length` and `Transfer-Encoding: chunked`. | A misbehaving upstream or proxy. | Fix the upstream. Accepting both is exactly the ambiguity request smuggling exploits — this is why `--insecure-http-parser` is dangerous. |
| `ERR_HTTP2_ERROR` | Unspecified HTTP/2 protocol error. | Framing or protocol violation. | Enable `--trace-tls` or an `nghttp2` trace. |
| `ERR_HTTP2_STREAM_ERROR` | The peer sent `RST_STREAM` with a non-zero error code. | Client cancelled, or hit a limit. | Read the code in the error to see which. |
| `ERR_HTTP2_STREAM_ABORTED` | The peer reset the stream with a *clean* code (`NO_ERROR` or `CANCEL`) before `END_STREAM`, so the readable side is incomplete. | A browser navigating away mid-response. | The HTTP/2 analogue of `ECONNRESET`. Normal traffic; do not page on it. |
| `ERR_HTTP2_GOAWAY_SESSION` | New streams opened after a `GOAWAY` was received. | The server is draining for a deploy. | Create a new session and retry. |
| `ERR_HTTP2_HEADERS_SENT` | Response headers sent twice. | Same shape of bug as `ERR_HTTP_HEADERS_SENT`. | Same fix. |
| `ERR_HTTP2_INVALID_SESSION` | Action on a destroyed `Http2Session`. | Reusing a session after the connection dropped. | Check `session.destroyed`. |
| `ERR_HTTP2_INVALID_STREAM` | Action on a destroyed stream. | Writing after the client disconnected. | Check `stream.destroyed` before writing. |

See [Chapter 35](../part5-networking/35-http-servers.md) and
[Chapter 38](../part5-networking/38-http2.md).

---

## C.8 TLS and cryptography

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `ERR_TLS_CERT_ALTNAME_INVALID` | The hostname you connected to is not in the certificate's `subjectAltName`. | Connecting by IP; a certificate issued for `example.com` used on `www.example.com`. | Reissue the certificate with the right SANs. Do **not** reach for `rejectUnauthorized: false`. |
| `ERR_TLS_HANDSHAKE_TIMEOUT` | The handshake did not finish in time. | A plain-HTTP client hitting an HTTPS port; a network stall. | Check the client's scheme first — it is usually that. |
| `ERR_TLS_INVALID_PROTOCOL_VERSION` | An unrecognised protocol version string. | Typo in `minVersion`/`maxVersion`. | The accepted spellings are `'TLSv1'`, `'TLSv1.1'`, `'TLSv1.2'`. |
| `ERR_TLS_RENEGOTIATION_DISABLED` | Renegotiation attempted where it is off. | A legacy client asking for client-auth mid-connection. | Renegotiation is a documented DoS vector; leave it disabled. |
| `ERR_TLS_INVALID_CONTEXT` | An invalid secure context was supplied. | Passing a plain object instead of a `SecureContext`. | Use `tls.createSecureContext()`. |
| `ERR_CRYPTO_INVALID_AUTH_TAG` | AEAD authentication failed. | Wrong key, wrong IV, wrong tag, or genuinely tampered ciphertext. | **Treat it as tampering until you have proved otherwise.** Never fall back to unauthenticated decryption. |
| `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` | `crypto.timingSafeEqual()` got buffers of different lengths. | Comparing a user-supplied token directly. | Hash both sides to a fixed length first, then compare. Comparing lengths early leaks length — hashing avoids it. |
| `ERR_CRYPTO_UNKNOWN_CIPHER` | The named cipher is unavailable. | An algorithm removed in OpenSSL 3. | `crypto.getCiphers()` lists what you have. `--openssl-legacy-provider` restores broken ones; migrate instead. |
| `ERR_MISSING_PASSPHRASE` | An encrypted key was read without a passphrase. | Key encrypted at generation time. | Supply `passphrase`. |
| `ERR_NO_CRYPTO` | This Node build has no OpenSSL. | A custom `--without-ssl` build. | Use a standard build. |
| `ERR_OSSL_*` | Raw OpenSSL errors. | Malformed keys, unsupported parameters, bad padding. | These carry `opensslErrorStack`, `function`, `library` and `reason` properties — read those, not the message. |

**Certificate verification codes** are not `ERR_`-prefixed. They come straight
from OpenSSL and appear as `error.code` on a failed TLS connection. The ones you
will actually meet:

| Code | Meaning | Usual cause |
|---|---|---|
| `CERT_HAS_EXPIRED` | `notAfter` is in the past. | Nobody renewed it. Also: the container clock is wrong. |
| `CERT_NOT_YET_VALID` | `notBefore` is in the future. | A skewed clock, almost always. |
| `DEPTH_ZERO_SELF_SIGNED_CERT` | The peer's own certificate is self-signed. | A dev server, or a TLS-inspecting proxy. |
| `SELF_SIGNED_CERT_IN_CHAIN` | A self-signed certificate appears in the chain. | A corporate root CA that Node does not trust. |
| `UNABLE_TO_GET_ISSUER_CERT` / `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | The issuer could not be found. | The server did not send its intermediate certificate. |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | The leaf's signature could not be verified. | Same missing-intermediate problem, seen from a different angle. |
| `HOSTNAME_MISMATCH` | The name does not match the certificate. | See `ERR_TLS_CERT_ALTNAME_INVALID`. |
| `CERT_REVOKED` | The certificate is on a CRL. | It was revoked. Do not work around this. |
| `CERT_CHAIN_TOO_LONG`, `PATH_LENGTH_EXCEEDED`, `INVALID_CA`, `INVALID_PURPOSE`, `CERT_REJECTED`, `CERT_UNTRUSTED` | Chain or policy constraint violations. | A misissued or misconfigured chain. |

For the last three groups, the correct fixes are, in order of preference: fix
the certificate; add the CA with `NODE_EXTRA_CA_CERTS`; enable
`--use-system-ca`. Setting `NODE_TLS_REJECT_UNAUTHORIZED=0` is not on the list.
See [Chapter 37](../part5-networking/37-tls-https.md).

---

## C.9 Streams

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `ERR_STREAM_PREMATURE_CLOSE` | A stream or pipeline ended without finishing and without an explicit error. | The peer disconnected; a downstream destroyed early. | Emitted by `stream.finished()` and `pipeline()`. Usually a normal client disconnect — handle it, do not alert on it. |
| `ERR_STREAM_DESTROYED` | A method was called on a destroyed stream. | Writing after an error handler destroyed it. | Use `pipeline()`, which cleans up the whole chain for you. |
| `ERR_STREAM_WRITE_AFTER_END` | `write()` after `end()`. | A late async callback writing to a finished response. | Track completion, or check `writable.writableEnded`. |
| `ERR_STREAM_ALREADY_FINISHED` | An operation on a stream that already finished. | Calling `end()` twice. | Guard it. |
| `ERR_STREAM_NULL_VALUES` | `write(null)` on a non-object-mode stream. | `null` is the end-of-stream sentinel and cannot be written. | Filter nulls, or use object mode. |
| `ERR_STREAM_CANNOT_PIPE` | `pipe()` called on a `Writable`. | Arguments the wrong way round. | Readable pipes *to* writable. |
| `ERR_STREAM_UNABLE_TO_PIPE` | Piping into a closed or destroyed stream inside a pipeline. | An earlier stage failed first. | Look at the *first* error in the chain; this one is a consequence. |
| `ERR_STREAM_UNSHIFT_AFTER_END_EVENT` | `unshift()` after `'end'`. | Protocol parsers pushing data back too late. | Buffer before consuming. |
| `ERR_TRAILING_JUNK_AFTER_STREAM_END` | Extra bytes after the end of a compressed stream. | Concatenated gzip members; a truncated-then-appended file. | Check how the file was produced. See [Chapter 21](../part3-data/21-zlib.md). |
| `ERR_BUFFER_OUT_OF_BOUNDS` | An operation outside a `Buffer`'s bounds. | An offset derived from a length that has since changed. | Validate offset and length together. |
| `ERR_BUFFER_TOO_LARGE` | Requested `Buffer` exceeds the maximum. | Allocating from an untrusted length field. | Bound it. See [Chapter 16](../part3-data/16-buffers.md). |
| `ERR_STRING_TOO_LONG` | A string exceeded V8's maximum length. | `buffer.toString()` on a huge file; joining a giant array. | Stream it, or work in chunks. |
| `ERR_ENCODING_NOT_SUPPORTED` | `TextDecoder` got an encoding it does not know. | A legacy encoding on a small-ICU build. | Check `process.versions.icu`. See [Chapter 17](../part3-data/17-encodings.md). |
| `ERR_ENCODING_INVALID_ENCODED_DATA` | Bytes are not valid in the declared encoding. | Data declared UTF-8 that is really Latin-1. | Decode with the real encoding, or use a non-fatal decoder. |

---

## C.10 Process, child processes and worker threads

| Code | What it really means | Usual cause | Fix |
|---|---|---|---|
| `ERR_CHILD_PROCESS_IPC_REQUIRED` | An IPC operation on a child with no IPC channel. | `spawn()` where `fork()` was needed. | Use `fork()`, or add `'ipc'` to `stdio`. |
| `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` | The child produced more stdout/stderr than `maxBuffer`. | Default `maxBuffer` with a chatty command. | Raise `maxBuffer`, or use `spawn()` and stream the output. |
| `ERR_IPC_CHANNEL_CLOSED` | Using an IPC channel that is already closed. | `send()` racing the child's exit. | Check `child.connected` first. |
| `ERR_IPC_DISCONNECTED` | Disconnecting an already-disconnected channel. | Two shutdown paths both calling `disconnect()`. | Make shutdown idempotent. |
| `ERR_WORKER_PATH` | The worker script path is neither absolute nor starts with `./` or `../`. | Passing `'worker.js'`. | `new URL('./worker.js', import.meta.url)`. |
| `ERR_WORKER_INIT_FAILED` | The worker failed to start. | A throw at the top of the worker script. | Check the `cause`. |
| `ERR_WORKER_NOT_RUNNING` | An operation on a worker that is not running. | Posting a message after termination. | Track worker state. |
| `ERR_WORKER_OUT_OF_MEMORY` | The worker hit its `resourceLimits` memory cap. | `maxOldGenerationSizeMb` too small, or a leak in the worker. | Raise the limit or fix the leak. Note this is a *per-worker* limit, separate from the process heap. |
| `ERR_WORKER_INVALID_EXEC_ARGV` | Invalid flags in the worker's `execArgv`. | Passing flags that only apply to the main process. | Only per-isolate flags are legal here. |
| `ERR_WORKER_UNSERIALIZABLE_ERROR` | An uncaught worker error could not be serialised to the parent. | Throwing a value with unclonable properties. | Throw plain `Error`s across thread boundaries. |
| `ERR_UNHANDLED_ERROR` | An `EventEmitter` emitted `'error'` with no listener. | Forgetting `.on('error')` on a socket or stream. | Always attach an error listener. This one *crashes the process*. See [Chapter 12](../part2-async/12-eventemitter.md). |
| `ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET` | `process.setUncaughtExceptionCaptureCallback()` called twice without resetting to `null`. | Two APM agents in one process. | Deliberate protection against one library silently overwriting another's handler. |
| `ERR_SCRIPT_EXECUTION_TIMEOUT` | A `vm` script exceeded its timeout. | An infinite loop in sandboxed code. | Working as intended. See [Chapter 52](../part8-advanced/52-vm-sandboxing.md). |
| `ERR_SCRIPT_EXECUTION_INTERRUPTED` | Execution was interrupted by `SIGINT`. | Someone pressed <kbd>Ctrl</kbd>+<kbd>C</kbd>. | Not an error condition. |
| `ERR_DLOPEN_DISABLED` | Native addon loading is off. | `--no-addons`, or the permission model without `--allow-addons`. | Grant it deliberately, or drop the native dependency. |
| `ERR_DLOPEN_FAILED` | `process.dlopen()` failed. | ABI mismatch after a Node upgrade; a missing shared library. | Rebuild the addon against the current Node. |
| `ERR_NON_CONTEXT_AWARE_DISABLED` | A non-context-aware addon under `--force-context-aware`. | An old addon. | Upgrade it. Non-context-aware addons and worker threads do not mix. |
| `ERR_PROTO_ACCESS` | `Object.prototype.__proto__` accessed under `--disable-proto=throw`. | A dependency doing prototype gymnastics. | Use `Object.getPrototypeOf` / `setPrototypeOf`. |
| `ERR_SYSTEM_ERROR` | An unspecified system-level failure. | Varies. | Read `err.info` — that is where the detail is. |
| `ERR_INTERNAL_ASSERTION` | A bug in Node, or misuse of internals. | Something reached into `process.binding` or an internal module. | File an issue; also audit your dependencies. |

---

## C.11 POSIX errno codes (via `SystemError`)

These are what you will actually see. They come from the operating system, and
they arrive with `syscall` set, plus `path`, `dest`, `address` or `port` where
relevant.

**In Node's own documented shortlist:**

| Code | Meaning | Where it bites | What to do |
|---|---|---|---|
| `ENOENT` | No such file or directory. | `fs` operations; also `spawn` when the *executable* is missing — a classic misread. | Check `err.syscall`: `open` means the file, `spawn` means the binary. |
| `EACCES` | Permission denied by file permissions. | Writing to a mounted volume; binding to a port below 1024 as a non-root user. | Fix ownership, or bind high and put a proxy in front. |
| `EPERM` | Operation not permitted; needs elevated privileges. | `chown`; renaming across devices on Windows. | Different from `EACCES`: this is a capability problem, not a mode-bits problem. |
| `EEXIST` | The target already exists. | `mkdir` on an existing directory; `open` with `'wx'`. | Use `{ recursive: true }` for `mkdir`, which makes it idempotent. |
| `EISDIR` | Expected a file, got a directory. | `readFile` on a directory. | `stat` first. |
| `ENOTDIR` | A path component that should be a directory is not. | A file used as a directory in the middle of a path. | Check the whole path, not just the leaf. |
| `ENOTEMPTY` | Directory not empty. | `rmdir` on a populated directory. | `fs.rm(path, { recursive: true, force: true })`. Note `fs.rmdir`'s `recursive` option has been **removed** (DEP0147). |
| `EMFILE` | Too many open files. | Opening thousands of files in parallel; leaked descriptors. | Cap concurrency. macOS defaults are low — `ulimit -n 2048`. If it grows over hours, you have a leak: something is not being closed. |
| `EADDRINUSE` | Address already in use. | Two processes on one port; a previous process not yet reaped; watch mode restarting too fast. | `lsof -i :3000`. Use `SO_REUSEADDR` semantics via a graceful shutdown, not a longer sleep. |
| `ECONNREFUSED` | Nothing is listening there. | Depending on a service that has not started; wrong port. | Add a readiness check with backoff rather than a fixed delay. |
| `ECONNRESET` | The peer forcibly closed the connection. | Idle keep-alive connections reaped by a load balancer; a peer restart. | Extremely common and usually **not** your bug. Retry idempotent requests; keep your agent's `keepAliveTimeout` below the balancer's idle timeout. |
| `EPIPE` | Wrote to a pipe or socket with no reader. | The client disconnected mid-response; `node app.js \| head`. | Handle the `'error'` event on the stream. Never let it become an uncaught exception. |
| `ETIMEDOUT` | The peer did not respond in time. | Packet loss; a firewall dropping rather than rejecting; an overloaded upstream. | Distinguish connect timeouts from read timeouts; set both explicitly. |
| `ENOTFOUND` | DNS lookup failed (`EAI_NODATA` or `EAI_NONAME`). Not a standard POSIX code. | Typo in a hostname; DNS not ready during container startup; a service name that only resolves inside a cluster. | Check `err.hostname`. Retry with backoff during startup. |

**Also common, from `errno(3)` and libuv though not in Node's shortlist:**

| Code | Meaning | Where it bites |
|---|---|---|
| `ENOSPC` | No space left on device. | Writes fail; also raised by `inotify` when the *watcher* limit is exhausted on Linux — a confusing but frequent cause during development. |
| `ENFILE` | System-wide file table full. | The whole machine, not just your process. Look at neighbours. |
| `EADDRNOTAVAIL` | Cannot assign the requested address. | Binding to an IP the host does not own — common in containers. |
| `EHOSTUNREACH` / `ENETUNREACH` | No route to the host or network. | Missing route, or an egress rule blocking the destination. |
| `ECANCELED` | Operation cancelled. | Distinguish from `ABORT_ERR`, which is what an `AbortSignal` produces. |
| `EAI_AGAIN` | Temporary DNS failure. | An overloaded resolver. Retry with backoff. |
| `EXDEV` | Cross-device link. | `fs.rename()` across mount points — very common in containers where `/tmp` is a separate mount. Copy then unlink instead. |

Two notes that save time:

- **Under the permission model you get `ERR_ACCESS_DENIED`, not `EACCES`.**
  If a filesystem operation fails and the code is `ERR_ACCESS_DENIED`, the
  operating system never saw the request — Node blocked it. Add the right
  `--allow-fs-read` / `--allow-fs-write` grant, and use `--permission-audit` to
  find out what you need. See [Chapter 31](../part4-system/31-permission-model.md).
- **`errno` is negative.** `err.errno === -2` for `ENOENT` on Linux. The value
  differs by platform; the *string* code does not. Compare the string.

---

## C.12 How to diagnose an unfamiliar error code

A repeatable procedure, in order. Stop as soon as you have the answer.

**1. Print the whole error object, not the message.**

```js
process.on('unhandledRejection', (err) => {
  console.error(err);                              // stack
  console.error({ code: err.code, syscall: err.syscall,
                  path: err.path, dest: err.dest,
                  address: err.address, port: err.port,
                  errno: err.errno, info: err.info });
  if (err.cause) console.error('caused by:', err.cause);
});
```

`console.error(err)` alone shows the message and stack but hides these
properties. They are usually where the answer is.

**2. Read the prefix.** Use §C.2. `E`-without-`ERR_` means the OS said no, and
`syscall` tells you which operation. `ERR_` means Node said no, and the second
token names the subsystem. `HPE_` means the bytes on the wire were wrong — look
at the peer, not at yourself.

**3. Follow the `cause` chain to the bottom.** Modern Node wraps errors. The
outermost code often describes a symptom (`ERR_STREAM_UNABLE_TO_PIPE`) while the
innermost describes the fault (`ECONNRESET`).

**4. Get a full stack.** Run with `--trace-warnings` and, if a non-`Error` value
was thrown, `--trace-uncaught`. Raise `--stack-trace-limit=50` for deep async
chains. `--enable-source-maps` if the code was transpiled.

**5. Find who is really calling.** `NODE_DEBUG=net,http,stream,fs` prints Node's
internal debug logs for those subsystems and will usually show the operation
just before the failure. For environment-driven surprises, `--trace-env-js-stack`
names the exact line that read the variable.

**6. Search the official list.** <https://nodejs.org/api/errors.html> — use your
browser's find, since the page is alphabetical. If the code is not there, check
the "Legacy Node.js error codes" section: it may be a removed code you are
catching in dead code.

**7. If the code is not a Node code at all**, it came from a dependency. Grep
your `node_modules` for the literal string:

```bash
grep -rn "ERR_MY_MYSTERY_CODE" node_modules --include="*.js" -l
```

**8. If you see `ERR_INTERNAL_ASSERTION`**, stop debugging your own code. It is
a Node bug or a dependency using internals. Produce a minimal reproduction and
file it.

**One habit that pays for itself:** whenever you write a `catch` that checks a
code, add a comment saying what condition it represents. `err.code === 'EEXIST'`
is opaque six months later; `// directory already exists — fine` is not.

---

## Where to go next

- [Chapter 14 — Errors: Classes, Codes, and Handling Strategies](../part2-async/14-errors.md) —
  the conceptual chapter this appendix supports.
- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](../part4-system/26-signals-and-shutdown.md) —
  what to do when an error should end the process.
- [Chapter 47 — Debugging](../part7-diagnostics/47-debugging.md) and
  [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md).
- [Appendix A — CLI Flag Reference](a-cli-flags.md) — the tracing flags used in
  §C.12.
- [Appendix D — Deprecation Index](d-deprecations.md) — for errors that appeared
  after an upgrade.
- Full official list of every `ERR_` code:
  <https://nodejs.org/docs/latest/api/errors.html#nodejs-error-codes>
