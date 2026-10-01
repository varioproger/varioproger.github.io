---
chapter: 63
part: "Part IX — Production Practice"
title: "Upgrading Node.js: Deprecations and Migration"
level: intermediate
reading_time: "40 min"
prerequisites: [2, 6, 45, 56]
source_docs:
  - "doc/api/deprecations.md"
  - "doc/api/cli.md"
  - "doc/api/documentation.md"
  - "doc/api/process.md"
  - "doc/api/tls.md"
  - "doc/api/dns.md"
source_url: "https://nodejs.org/docs/latest/api/deprecations.html"
node_baseline: "27.0.0-pre"
---

# Chapter 63 — Upgrading Node.js: Deprecations and Migration

**What you will learn**

- The release line model as an operations problem, and an upgrade cadence you can defend to a manager.
- Node's four deprecation stages, what a `DEPxxxx` code is, and how to read an entry in `deprecations.md` correctly.
- How `--pending-deprecation`, `--throw-deprecation`, `--trace-deprecation`, and `--no-deprecation` let you find breakage *before* it reaches production.
- The deprecations most likely to affect a real application, with their current stage and the code that replaces each.
- A concrete upgrade procedure — changelog, CI flags, native addon ABI, `engines` ranges, canary, and the metrics that tell you it worked.

**Why this matters**

Two teams run the same application. One upgrades Node every April, a week after the new LTS ships, and the upgrade takes an afternoon. The other upgraded three years ago and now has to move from an end-of-life line, across three majors, with an OpenSSL bump, a V8 upgrade, and four native addons that no longer compile. The second upgrade is a quarter-long project with an outage in it.

The difference is not skill. It is that Node tells you what is going to break, years in advance, through the deprecation process — and the first team reads it. Deprecation warnings are not noise to be silenced; they are the runtime describing your next migration while you still have time to do it calmly. This chapter is about turning that into a routine you run on a schedule instead of an emergency you survive.

## The release model, operationally

[Chapter 2](../part1-foundations/02-install-and-release-lines.md) covers the release lines. The operational summary is short:

- A new major ships every six months. April majors are even-numbered and become LTS; October majors are odd-numbered and never do.
- An even major spends about six months as **Current**, then about twelve as **Active LTS**, then about eighteen as **Maintenance LTS** — roughly 36 months total.
- An odd major is Current for six months and reaches end of life a couple of months after the next even release takes over.
- End of life means no security patches. Not "unsupported but probably fine" — no patches.

`process.release.lts` is a string on LTS releases and `undefined` otherwise, which makes "am I on a supported line" a one-line check in a startup banner.

### A cadence you can defend

**Adopt each new LTS line within one to three months of it entering Active LTS, and never let production sit on Maintenance LTS for more than half of its window.**

The reasoning:

- **Waiting for Active LTS, not Current, keeps you off the sharp edge.** By April+1 the ecosystem has published prebuilt native binaries and the first round of "this broke on the new major" issues has been filed and fixed by people who are not you.
- **Waiting longer than three months costs more than it saves.** Dependencies start requiring the new line in their `engines` field, security backports to older lines get thinner, and each month of delay adds changes you will have to absorb at once.
- **One major at a time is a task; three at a time is a project.** The work does not scale linearly, because the interactions between changes are what cost you. Upgrading annually means you only ever read one changelog.
- **Odd majors belong in CI, not production.** Running Current in CI is how you find out about the next LTS eight months early, at zero risk.

The result is one predictable upgrade a year, sized like a sprint task, plus a background awareness of what is coming.

## How deprecations work in Node

Node deprecates in stages, deliberately slowly. The documentation defines **four** kinds — note that there are four, not three; the "Application" stage in the middle is easy to miss and is exactly the one that hides problems in your dependencies.

| Stage | What you see | Where it applies |
|---|---|---|
| **Documentation-only** | Nothing at runtime. Some entries *opt in* to `--pending-deprecation` and are labelled as such in the docs. | The API reference only |
| **Application** (non-`node_modules` code only) | A process warning on `stderr`, the first time the API is used **from your own code**. With `--pending-deprecation`, also from `node_modules`. | Your code by default |
| **Runtime** (all code) | A process warning on `stderr`, the first time the API is used, **including from dependencies**. | All code |
| **End-of-Life** | Nothing — the API is gone. Calls throw `TypeError` or return wrong results. | Removed |

Every deprecation gets a stable identifier, a **DEP code** like `DEP0106`. The code never changes, even if the deprecation is revoked, and it appears in the warning text, in `deprecations.md`, and as the `code` property on the emitted `DeprecationWarning`. Codes are the thing to grep your logs for and the thing to put in a ticket title.

Deprecations move through the stages over years, and they can be **revoked**. `DEP0116` (Legacy URL API) is currently marked *Deprecation revoked* — the general legacy URL deprecation was reversed and the API's status changed to Legacy — while `DEP0169` separately deprecates the *insecure* `url.parse()` behaviour and now covers `url.format(urlString)` and `url.resolve()` too. This is why you check the current stage in the docs rather than trusting a blog post: the answer changes.

Reading an entry correctly means reading three things: the `Type:` line (the current stage), the changes list (which version moved it to that stage), and the replacement text. An entry whose changes list says `version: v25.0.0 … description: End-of-Life` tells you exactly which upgrade will break you.

### The four flags

These are the tools. Learn all four; most people only know the first.

| Flag | Effect | Where to use it |
|---|---|---|
| `--pending-deprecation` | Emit pending deprecation warnings — the ones that are off by default. Also promotes Application-stage warnings to cover `node_modules`. | CI, and a canary instance |
| `--trace-deprecation` | Print a stack trace with each deprecation warning, so you can see *which line* triggered it | Local debugging, CI logs |
| `--throw-deprecation` | Throw an error instead of warning | A dedicated CI job |
| `--no-deprecation` | Silence deprecation warnings entirely | Almost never — see below |

`--pending-deprecation` has an environment-variable form, `NODE_PENDING_DEPRECATION=1`, which is convenient when you cannot control the command line.

The combination that pays for itself is the CI job:

```bash
node --pending-deprecation --throw-deprecation --trace-deprecation \
  --test test/
```

That turns every deprecated call — including ones inside your dependencies, and including ones that are still documentation-only — into a test failure with a stack trace pointing at the caller. Run it as a **non-blocking** job at first, because a fresh codebase will light it up, then fix the list and make it blocking. From then on, a dependency upgrade that introduces a deprecated call fails CI on the day it lands, not eighteen months later during a Node upgrade.

`--no-deprecation` deserves a warning of its own. It is the wrong tool for almost every situation, because it hides the warnings you need. If a *specific* warning is noisy and you have already triaged it, silence that one and nothing else:

```bash
node --disable-warning=DEP0040 server.js
```

`--disable-warning=code-or-type` (stable as of v26.7.0) takes either a specific code or a warning type — the core types are `DeprecationWarning` and `ExperimentalWarning`. Silencing one code leaves the rest working. Silencing `DeprecationWarning` wholesale is `--no-deprecation` with extra steps.

Warnings surface as `'warning'` events on `process`, which is the hook for routing them into your logging pipeline rather than losing them in `stderr`:

```mjs
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning') {
    log('warn', 'deprecation', {
      code: warning.code,          // e.g. 'DEP0060'
      message: warning.message,
      stack: warning.stack,        // populated with --trace-deprecation
    });
  }
});
```

Doing that in production with `--pending-deprecation` on a single canary instance gives you a live inventory of every deprecated API your application actually executes — which is a much shorter and more actionable list than everything your test suite touches.

## The deprecations most likely to affect you

This is a digest, not a catalogue; [Appendix D](../appendix/d-deprecations.md) has the full index. Every stage below was checked against `deprecations.md` at the Node 27 baseline, and several have moved further than people expect.

| DEP | API | Current stage | Replacement |
|---|---|---|---|
| DEP0005 | `Buffer()` / `new Buffer()` | **Application** | `Buffer.alloc`, `Buffer.allocUnsafe`, `Buffer.from` |
| DEP0169 | `url.parse()`, and `url.format(urlString)` / `url.resolve()` via it | **Application** | WHATWG `URL` |
| DEP0170 | `url.parse()` with a non-numeric port | **End-of-Life** | `URL` (throws, as it always did) |
| DEP0116 | Legacy URL API in general | **Revoked** (status: Legacy) | Still works; prefer `URL` |
| DEP0106 | `crypto.createCipher()` / `createDecipher()` | **End-of-Life** (removed in v22) | `createCipheriv` / `createDecipheriv` with a KDF |
| DEP0147 | `fs.rmdir(path, { recursive: true })` | **End-of-Life** (removed in v25) | `fs.rm(path, { recursive: true, force: true })` |
| DEP0176 | `fs.F_OK`, `fs.R_OK`, `fs.W_OK`, `fs.X_OK` | **End-of-Life** (removed in v25) | `fs.constants.*` |
| DEP0178 | `dirent.path` | **End-of-Life** (removed in v24) | `dirent.parentPath` |
| DEP0034 | `fs.exists(path, callback)` | **Documentation-only** | `fs.stat()` or `fs.access()` |
| DEP0187 | Invalid argument types to `fs.existsSync` | **Runtime** | Pass a string, `Buffer`, or `URL` |
| DEP0060 | `util._extend()` | **Runtime** | `Object.assign(target, source)` |
| DEP0044 | `util.isArray()` | **Runtime** | `Array.isArray()` |
| DEP0025 | `require('node:sys')` | **Runtime** | `require('node:util')` |
| DEP0040 | `node:punycode` module | **Application** | A userland package |
| DEP0032 | `node:domain` module | **Documentation-only** | `AsyncLocalStorage` + `AbortController` |
| DEP0174 | `util.promisify()` on a function that returns a promise | **Runtime** | Call the function directly |
| DEP0190 | `args` array with `{ shell: true }` in `execFile`/`spawn` | **Runtime** | `spawn(cmd, args)` without `shell`, or build the string yourself |
| DEP0195 | Instantiating `node:http` classes without `new` | **Runtime** | Use `new` |
| DEP0183 | OpenSSL engine APIs (`clientCertEngine`, `privateKeyEngine`, `crypto.setEngine()`) | **Runtime** | OpenSSL 3 providers |
| DEP0205 | `module.register()` | **Runtime** | `module.registerHooks()` |
| DEP0179 / DEP0181 | `new Hash()` / `new Hmac()` directly | **Runtime** | `crypto.createHash()` / `crypto.createHmac()` |
| DEP0180 | `new fs.Stats()` | **Runtime** | Do not construct; use the objects `fs` returns |
| DEP0151 | Main index lookup and extension searching in `"main"` | **Runtime** | A complete, extensioned `"main"` or `"exports"` |

### The ones with real code changes

**`Buffer()` — DEP0005, Application stage.** Application stage means you see the warning for your own code but *not* for `node_modules` unless you pass `--pending-deprecation`. That is the entire reason people believe their dependencies are clean.

```js
// ❌ Ambiguous: a number allocates uninitialised memory, a string encodes it.
const a = new Buffer(64);
const b = new Buffer('hello');

// ✅ Explicit intent.
const a = Buffer.alloc(64);                 // zero-filled
const b = Buffer.from('hello', 'utf8');
```

**`url.parse()` — DEP0169, Application stage.** The docs are blunt: the behaviour is not standardized, it is prone to errors with security implications, and **CVEs are not issued for `url.parse()` vulnerabilities**. `url.format(urlString)` and `url.resolve()` call it internally and are covered by the same deprecation.

```js
// ❌ Legacy parser; `pathname`/`query` semantics differ from the standard.
import { parse, resolve } from 'node:url';
const parsed = parse('https://example.com/a?b=1', true);
const joined = resolve('https://example.com/a/', '../b');

// ✅ WHATWG URL, which is also what the browser and fetch use.
const url = new URL('https://example.com/a?b=1');
const value = url.searchParams.get('b');
const joined2 = new URL('../b', 'https://example.com/a/').href;
```

The one real trap in migrating: legacy `parse()` accepts a path with no origin, and `new URL()` throws without a base. Supply a base explicitly, or use `URL.parse()` where you want a `null` return instead of a throw.

**`crypto.createCipher()` — DEP0106, End-of-Life since v22.** Removed, because it derived keys with MD5, no salt, and a static IV. If your code still calls it, your upgrade fails immediately with a `TypeError`.

```js
// ✅ Derive a key with a real KDF and use a random IV.
import { scryptSync, randomBytes, createCipheriv } from 'node:crypto';

const salt = randomBytes(16);
const key = scryptSync(password, salt, 32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
// Store salt, iv, tag alongside the ciphertext — all three are needed to decrypt.
```

**`fs.rmdir` with `recursive` — DEP0147, End-of-Life since v25.** The option was removed, not merely deprecated.

```js
// ❌ The option is gone; this silently fails to recurse or throws on a non-empty directory.
await rmdir(dir, { recursive: true });

// ✅
await rm(dir, { recursive: true, force: true });
```

**`util._extend()` — DEP0060, Runtime.** Runtime stage means dependencies trigger it too, so this is a common source of warnings you cannot fix in your own code.

```js
// ❌
const merged = util._extend({}, options);
// ✅
const merged = Object.assign({}, options);   // or { ...options }
```

**`util.promisify()` on a promise-returning function — DEP0174, Runtime.** This one is a genuine bug detector, not a style rule: promisifying a function that already returns a promise discards the result and can produce unhandled rejections. If you see it, you have a real defect.

**`args` with `{ shell: true }` — DEP0190, Runtime.** Also a security fix rather than a style change: with a shell, the `args` values are not escaped, only space-separated, which is a shell injection.

```js
// ❌ Injection: a filename containing `; rm -rf /` executes.
spawn('grep', [pattern, file], { shell: true });

// ✅ No shell — arguments are passed to execve directly, nothing is interpreted.
spawn('grep', [pattern, file]);
```

**`node:punycode` — DEP0040, Application.** Node's bundled copy is deprecated in favour of a userland package. If you need it, depend on it explicitly; if you are only using it for IDN handling, `new URL()` already does that for you.

**`node:domain` — DEP0032, Documentation-only.** Still documentation-only after a decade, so it will not warn — but it is architecturally dead and interacts badly with promises. Replace context propagation with `AsyncLocalStorage` ([Chapter 15](../part2-async/15-async-context.md)) and error containment with explicit `try`/`catch` plus `AbortController`.

**`module.register()` — DEP0205, Runtime since v26.** Worth flagging because it is recent and affects tooling: the async, off-thread module hooks are being replaced by the synchronous in-thread `module.registerHooks()`, which works for all module types. Loaders in your build chain will need updating.

Several of these ship codemods. The deprecation entries link to recipes under the Node.js `userland-migrations` project, invoked as `npx codemod@latest @nodejs/<recipe>` — for example `@nodejs/util-extend-to-object-assign`, `@nodejs/rmdir`, `@nodejs/crypto-createcipheriv-migration`, `@nodejs/dirent-path-to-parent-path`, and `@nodejs/http-classes-with-new`. Review the diff; a codemod is a starting point, not a merge.

## Semver-major changes that are not deprecations

Deprecations are the *documented* breakage. The rest of a major bump is behaviour that changed without ever being deprecated, because it was never an API promise. These are the ones that bite in production rather than in CI.

**V8 upgrades.** Every Node major brings a new V8. That means new JavaScript language features (fine), different optimisation heuristics (your benchmarks move, sometimes down), different garbage collector behaviour and default heap sizing (your memory graphs move), and occasionally changed stack trace formatting or `Error.prepareStackTrace` details that break log parsers. Re-run your benchmarks and re-check your heap flags on every major — a `--max-semi-space-size` tuned on one line can be pessimal on the next.

**OpenSSL changes.** Node majors track OpenSSL majors. OpenSSL 3 moved legacy algorithms into a separate provider, so code using old ciphers, small RSA keys, or unusual key formats can start throwing `ERR_OSSL_*` errors. `--openssl-legacy-provider` is an escape hatch for the transition, not a destination. Engine-based APIs are separately deprecated at Runtime stage under DEP0183.

**TLS defaults.** `tls.DEFAULT_MIN_VERSION` is `'TLSv1.2'` and `tls.DEFAULT_MAX_VERSION` is `'TLSv1.3'`, adjustable with `--tls-min-v1.0`, `--tls-min-v1.1`, `--tls-min-v1.3`, `--tls-max-v1.2`, and `--tls-max-v1.3`. If you talk to an appliance that only speaks TLS 1.0, your connection fails after an upgrade with a handshake error and no deprecation warning anywhere. Note also that versions before TLS 1.2 may need the OpenSSL security level downgraded, not just the minimum version lowered.

**DNS result order.** Since v17.0.0 the default `order` for `dns.lookup()` is `verbatim` — addresses come back in the order the resolver returned them, rather than IPv4 first. On a host with broken IPv6 this turns into connection timeouts that look like a network incident. `--dns-result-order=ipv4first` or `dns.setDefaultResultOrder('ipv4first')` restores the old behaviour; `setDefaultResultOrder()` takes priority over the flag. Fix the network if you can; use the flag to unblock the upgrade.

**Everything else in the changelog.** Default timeout values, error codes, `AbortSignal` propagation, stream behaviour under edge conditions. There is no substitute for reading the "Semver-Major Commits" section of the release announcement for the target line.

## The upgrade procedure

A repeatable sequence. Do them in order; each step is cheap and catches a different class of problem.

**1. Read the changelog for the target line.** Only the semver-major section, only for the majors you are crossing. For a one-major jump this is twenty minutes. Write down anything touching a module you use.

**2. Turn on the deprecation flags in CI on your current version.** Before you change Node at all:

```bash
node --pending-deprecation --throw-deprecation --trace-deprecation --test test/
```

Fix everything this finds while still on the old runtime, where you can deploy incrementally and roll back easily. This is the highest-value step in the list, and it is the one that turns a big-bang migration into a series of small ones.

**3. Check native addon compatibility.** Node refuses to load a native addon compiled against a different **ABI version**, reported as `process.versions.modules` (`NODE_MODULE_VERSION`), and the failure is a hard `ERR_DLOPEN_FAILED` at require time. Every Node major changes it.

```bash
node -p "process.versions.modules"
npm ls --all 2>/dev/null | grep -c .    # then find packages with binding.gyp / prebuilds
```

Addons built with **Node-API** ([Chapter 56](../part8-advanced/56-node-api-addons.md)) are ABI-stable across majors and usually just work — that is the entire point of Node-API. Addons built directly against V8 headers must be rebuilt, which requires the maintainer to publish new prebuilt binaries or your build machines to have a toolchain. Check that upstream supports the target major **before** you schedule the upgrade; an unmaintained addon is the single most common reason an upgrade gets cancelled.

**4. Check the ecosystem's `engines` fields.** Your dependencies declare which Node versions they support:

```bash
npm ls --json | node -e "…"    # or simply:
npm install --engine-strict
```

Two directions to check. Do your dependencies *allow* the new version? A package with `"engines": { "node": "^20 || ^22" }` is telling you it has not been tested on 24. And does *your* package declare the right range? If you publish a library, update your own `engines` field as part of the upgrade, and remember that widening it is a promise you have to test ([Chapter 6](../part1-foundations/06-packages-and-exports.md)).

**5. Run the full test suite on the new version, then run it again with the flags.** New majors introduce new deprecations; the CI job from step 2 will find them.

**6. Canary deploy.** One instance, or a small percentage of traffic, on the new version, alongside the old. Leave it for a full traffic cycle — at least 24 hours, so you catch the nightly batch job and the daily peak. This is where you use `--pending-deprecation` plus the `'warning'` handler from earlier, so the canary reports exactly which deprecated APIs real traffic exercises.

**7. Watch the right metrics.** Compare the canary against its neighbours, not against yesterday:

| Metric | What a regression means |
|---|---|
| p50 / p99 latency | V8 optimisation or GC behaviour changed |
| Error rate, by error code | New `ERR_*` codes, TLS or OpenSSL failures |
| RSS and heap used | Different default heap sizing or GC tuning |
| GC time as a fraction of wall clock | Semi-space or old-space defaults moved |
| Event loop delay p99 | Something newly synchronous, or threadpool contention |
| Restart / crash count | ABI failures, uncaught exceptions from removed APIs |
| Deprecation warning count by DEP code | Your live inventory of remaining work |
| Connection errors to specific downstreams | TLS minimum version or DNS result order |

**8. Roll forward gradually and keep the rollback path warm.** Percentage-based rollout, and do not delete the old image until the new one has survived a week including a deploy of your own code.

## Testing across multiple Node versions

If you publish a library, or if you support customers on different lines, matrix testing is not optional.

```yaml
# .github/workflows/test.yml (excerpt)
strategy:
  fail-fast: false
  matrix:
    node: [20, 22, 24, 'current']
    os: [ubuntu-latest, windows-latest, macos-latest]
```

Principles that keep the matrix useful rather than expensive:

- **Test the oldest version you claim to support, the newest LTS, and Current.** The middle of the range rarely finds anything the ends do not.
- **Include Windows.** Path handling, file locking, signals, and `spawn` semantics differ, and this is where cross-platform bugs actually appear ([Chapter 24](../part4-system/24-paths.md)).
- **`fail-fast: false`**, so one broken combination does not hide the others.
- **Allow Current to fail without blocking the merge**, but make it visible. It is an early warning system, not a gate.
- **Pin exact versions in the deployment, ranges in CI.** `.nvmrc` and your container base image should name a patch version; CI can float.
- **Guard version-specific code with feature detection, not version numbers.** `typeof structuredClone === 'function'` survives backports; `process.versions.node.startsWith('22')` does not.

## When to skip an LTS line — and when not to

Skipping means going from one Active LTS directly to the next, leaving one line untouched — for example 22 straight to 26.

**Skipping is reasonable when** the intermediate line brought nothing you need, your dependency tree already supports the later line, you have a canary process you trust, and the skip lets you land one upgrade instead of two in the same quarter. The work of a two-major jump is not double a one-major jump if the changes do not interact.

**Do not skip when** any of the following is true:

- **You have native addons that are not Node-API based.** Two ABI bumps at once means two rounds of prebuilt-binary availability you have to line up, and if only one of your addons lags you are stuck.
- **You are crossing an OpenSSL major.** Combine that with a V8 major and a TLS default change and you cannot attribute a regression to anything.
- **You have unresolved deprecation warnings.** A deprecation that is Runtime in the line you are skipping is frequently End-of-Life in the one after. Skipping means you never get the warning — you get the removal.
- **Your test coverage is thin.** Skipping trades a warning phase for a discovery-in-production phase.

The asymmetry is important: skipping saves you one upgrade cycle, but the deprecation process is *designed* around your passing through each line and seeing its warnings. Skipping opts you out of the safety net. Do it deliberately, and compensate by running the target line in CI for a month first.

Never skip because you are behind. If you are three majors back, the answer is to move one major at a time, deploying each, precisely because that is how you get the warnings in the order they were meant to arrive.

## Common mistakes

### ❌ Silencing all deprecation warnings because they are noisy

```bash
# ❌ You have just turned off the only advance notice you get.
node --no-deprecation server.js
```

The warnings are noisy because you have not triaged them. Silencing them means the next End-of-Life removal arrives as a production `TypeError`.

```bash
# ✅ Silence exactly the one you have already assessed, and nothing else.
node --disable-warning=DEP0040 server.js
```

### ❌ Believing your dependencies are clean because you see no warnings

```bash
# ❌ Application-stage deprecations do not warn for node_modules by default.
node --test test/
```

`DEP0005` (`Buffer()`), `DEP0169` (`url.parse()`), and `DEP0040` (`punycode`) are all Application stage. Your dependency tree can be full of them and your logs will be silent.

```bash
# ✅ Promote them to cover node_modules, with stacks so you can see who is calling.
node --pending-deprecation --trace-deprecation --test test/
```

### ❌ Upgrading Node and your dependencies in the same commit

```bash
# ❌ Now a regression could be either, and you cannot bisect.
nvm install 26 && npm update && git commit -am "upgrade everything"
```

When latency doubles, you will have no way to attribute it without unpicking both.

```bash
# ✅ Two deploys, each independently revertible.
# 1. Upgrade dependencies on the current Node version. Deploy. Observe.
# 2. Upgrade Node with the dependency tree frozen. Deploy. Observe.
```

### ❌ Assuming a native addon will "probably work"

```mjs
// ❌ Discovered at process start, in production, on every instance simultaneously.
import sharpish from 'some-native-addon';
```

An ABI mismatch is a hard failure at require time, not a degraded mode. If the addon is not Node-API based and upstream has not published binaries for the target major, your upgrade is blocked and you need to know that in the planning meeting.

```bash
# ✅ Verify before you schedule anything.
node -p "process.versions.modules"
npm rebuild                       # on the target version, in a clean container
node -e "import('some-native-addon').then(() => console.log('loads'))"
```

## Production notes

- **Run one canary instance permanently with `--pending-deprecation` and a `'warning'` handler.** The output is a live, traffic-driven inventory of deprecated APIs in the code paths that actually execute — far more actionable than a test-suite scan, and free.
- **Track deprecation warnings as a metric with the DEP code as a label.** It is a genuinely bounded label set. A new code appearing after a dependency bump is a signal you want in a dashboard, not in a log nobody reads.
- **Pin the patch version in your image and update it deliberately.** `FROM node:24` silently moves under you, which is fine until the day it is not. `FROM node:24.9.0-bookworm` plus a scheduled bump gives you the same security posture with attribution.
- **Keep the previous image tagged and deployable for at least a week.** Rollback speed is the thing that makes an aggressive upgrade cadence safe. If rolling back takes an hour, you will not upgrade often, and then you will be three majors behind.
- **Upgrade dependencies *before* Node, not with it.** Newer dependency versions are more likely to support the new runtime, and separating the two changes preserves your ability to bisect.
- **Budget the Node upgrade as a recurring item, not a project.** One afternoon every twelve months is a rounding error. A quarter every three years is a staffing decision, and it always arrives at a bad time.
- **Read the security releases even on lines you do not run.** They tell you what is coming to your line and occasionally force an off-cycle patch. `process.release.lts` in your startup banner tells you instantly whether the running instance is on a patched line.
- **Re-tune V8 flags after each major.** Heap and GC defaults change with V8. Flags copied forward from three majors ago are as likely to hurt as help ([Chapter 61](61-performance-tuning.md)).

## Exercises

1. **Inventory your deprecations.** Run your test suite with `--pending-deprecation --trace-deprecation` and produce a table of DEP code, count, and the top calling frame. *Success:* every entry is classified as "our code", "a dependency we can upgrade", or "a dependency we must replace", and you can name the current stage of each from `deprecations.md`.

2. **Make CI fail on new deprecations.** Add a non-blocking job with `--pending-deprecation --throw-deprecation`, fix or explicitly allow-list every finding, then make it blocking. *Success:* introducing a call to `util._extend()` in a pull request fails CI with a stack trace pointing at the new line.

3. **Migrate the URL code.** Find every `url.parse()`, `url.format()`, and `url.resolve()` in a real codebase and replace them with `URL`. *Success:* tests pass, including cases with no origin, with an empty query, with a trailing-slash base, and with a port — and you can explain one behavioural difference you had to handle.

4. **Prove the ABI failure.** Install a package with a non-Node-API native addon on one major, then run it on a different major without rebuilding. *Success:* you can produce the exact error, explain it in terms of `process.versions.modules`, and fix it with a rebuild.

5. **Do a full dry-run upgrade.** Take an application across one major following the eight-step procedure. Keep a log of every problem, the step that caught it, and the time it cost. *Success:* you can state which steps earned their keep and produce a one-page runbook for next April.

## Recap

- Adopt each new LTS within one to three months of Active LTS, run Current in CI, and never let production sit deep into Maintenance. One major at a time is a task; three at once is a project.
- Node deprecates in **four** stages: Documentation-only, Application (your code only, unless `--pending-deprecation`), Runtime (all code), and End-of-Life (removed). Deprecations can also be revoked.
- `DEPxxxx` codes are stable identifiers. Always check the current stage in `deprecations.md` rather than trusting memory — several have moved to End-of-Life recently.
- `--pending-deprecation` (or `NODE_PENDING_DEPRECATION=1`), `--trace-deprecation`, and `--throw-deprecation` in a CI job find breakage before the upgrade does. `--no-deprecation` hides it; use `--disable-warning=DEPxxxx` for a single triaged code instead.
- The high-impact set today: `Buffer()` and `url.parse()` at Application stage; `createCipher`, `fs.rmdir({recursive})`, `fs.F_OK` and friends, and `dirent.path` already **removed**; `util._extend`, `util.isArray`, `util.promisify`-on-promises, shell `args`, and `module.register()` at Runtime.
- Not everything that breaks is a deprecation: V8 upgrades, OpenSSL majors, TLS defaults (`DEFAULT_MIN_VERSION` is `'TLSv1.2'`), and the `verbatim` DNS result order default change behaviour with no warning.
- Native addons are gated by `process.versions.modules` (`NODE_MODULE_VERSION`), which changes every major. Node-API addons are ABI-stable; V8-header addons must be rebuilt.
- Procedure: changelog, deprecation flags on the *old* version, addon ABI, `engines` ranges, test matrix, canary for a full traffic cycle, watch latency/errors/memory/GC/loop delay, then roll forward gradually.
- Skip an LTS line only with Node-API addons, a clean deprecation inventory, good coverage, and no simultaneous OpenSSL bump — never because you are already behind.

## Where to go next

- [Chapter 2 — Installing Node, Release Lines, and Version Management](../part1-foundations/02-install-and-release-lines.md) — the release model and the stability index in full.
- [Chapter 6 — Packages: `package.json`, exports, imports, dual publishing](../part1-foundations/06-packages-and-exports.md) — `engines` and what supporting a range obliges you to test.
- [Chapter 56 — Node-API: Native Addons in C/C++](../part8-advanced/56-node-api-addons.md) — why ABI stability decides how painful your upgrades are.
- [Chapter 61 — Performance Tuning](61-performance-tuning.md) — re-tuning V8 flags and re-benchmarking after a major.
- [Chapter 62 — Observability in Production](62-observability.md) — the canary metrics that tell you the upgrade worked.
- [Appendix D — Deprecation Index](../appendix/d-deprecations.md) — the full list with codes and stages.
- [Appendix A — CLI Flag Reference](../appendix/a-cli-flags.md) — every flag mentioned here, in context.
- Official documentation: <https://nodejs.org/docs/latest/api/deprecations.html>
