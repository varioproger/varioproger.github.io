---
chapter: "A"
part: "Appendices"
title: "CLI Flag Reference"
level: intermediate
reading_time: "35 min"
prerequisites: [3, 60]
source_docs:
  - "doc/api/cli.md"
  - "doc/api/typescript.md"
  - "doc/api/permissions.md"
source_url: "https://nodejs.org/docs/latest/api/cli.html"
node_baseline: "27.0.0-pre"
---

# Appendix A — CLI Flag Reference

## How to use this appendix

The official CLI documentation lists every flag alphabetically. That ordering is
useless when you have a problem, because you do not know the flag's name — you
know what you want to *do*. This appendix groups flags by intent: "I want to
profile memory", "I want to lock this container down", "I want the watcher to
stop clearing my terminal".

Each table gives the flag, what it actually does, the version it landed in, and
a one-line judgement: when to reach for it, or why not to. Stability is marked
only when the flag is *not* stable — an unmarked flag is stable and safe to put
in a Dockerfile.

**Version notation.** `v22.9.0` means the flag first shipped in that release.
`v23.4.0 / v22.13.0` means it landed on the current line and was backported to
the previous LTS line — the older number is what you need if you are pinned to
an LTS.

**Stability notation** (Node's own scale, see
[Appendix E — Stability Index and Release Lines](e-stability-and-releases.md)):

| Marker | Meaning for you |
|---|---|
| `1.0 Early development` | Will change. Do not build a product on it. |
| `1.1 Active development` | Shape is settling. Fine to experiment; pin your Node version. |
| `1.2 Release candidate` | Close to stable. Reasonable in production if you accept a rename. |
| `1 Experimental` | Generic experimental label; treat as 1.1. |
| `3 Legacy` | Works, has a replacement. Migrate. |

Everything else in these tables is Stability 2 (Stable).

One rule before you start: **a flag you cannot explain is a flag you should not
ship.** Several of the entries below silently weaken security or hide the
warning that would have told you about a bug. Section A.15 lists them in one
place; read it before copying a flag out of a blog post.

---

## A.1 Running code and module resolution

These control *what* Node runs and *how* it finds the rest of your code.

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `-e`, `--eval "script"` | Runs the argument as a program instead of a file. | v0.5.2 | One-liners in CI. If the script starts with `-`, use `--eval=-42` so it is not parsed as a flag. |
| `-p`, `--print "script"` | Same as `--eval`, but prints the result. | v0.6.4 | `node -p "process.versions.v8"` is the fastest way to interrogate a runtime. |
| `-c`, `--check` | Parses the file and exits. Nothing runs. | v5.0.0 / v4.2.0 | A cheap syntax gate in a pre-commit hook. Cannot be combined with `--test` or `--watch`. |
| `-i`, `--interactive` | Forces the REPL open even when stdin is not a TTY. | v0.7.7 | Driving the REPL from a pipe or a test harness. |
| `-` | Reads the program from stdin. | v8.0.0 | `cat gen.js \| node -`. Remaining arguments go to the script. |
| `--` | Ends Node's own options; everything after goes to your program. | v6.11.0 | Always use it when your app takes arguments that look like Node flags. |
| `-r`, `--require module` | Preloads a CommonJS module before the entry point. | v1.6.0 | Instrumentation agents, `dotenv`-style bootstrapping, polyfills. |
| `--import=module` | Preloads an ES module before the entry point. **[Experimental]** | v19.0.0 / v18.18.0 | The ESM counterpart of `--require`. Repeatable; runs in order, and all `--require` preloads run before any `--import`. |
| `--entry-url` | Treats the entry point argument as a URL rather than a path. **[Experimental]** | v23.0.0 / v22.10.0 | Passing a `data:` or query-carrying entry specifier. |
| `--input-type=type` | Declares how `--eval` / stdin input should be parsed: `commonjs`, `module`, `commonjs-typescript`, `module-typescript`. | v12.0.0 | Needed whenever you pipe ESM into `node -`. |
| `-C cond`, `--conditions=cond` | Adds custom resolution conditions for `"exports"` / `"imports"`. | v14.9.0 / v12.19.0 | Shipping a `development` or `browser` build variant from one package. See [Chapter 6](../part1-foundations/06-packages-and-exports.md). |
| `--preserve-symlinks` | Resolves modules by their symlink path instead of the real path. | v6.3.0 | Monorepos and `npm link` setups where the same package must not be loaded twice. Does not apply to the main module. |
| `--preserve-symlinks-main` | Same, but for the entry point only. | v10.2.0 | Pair with the above; they are separate for backward compatibility. |
| `--no-global-search-paths` | Stops Node looking in `$HOME/.node_modules` and `NODE_PATH`. | v16.10.0 | Reproducible builds. A globally installed package should never silently satisfy an import. |
| `--no-require-module` | Turns off loading a synchronous ESM graph from `require()`. | v22.0.0 / v20.17.0 | Only to reproduce old behaviour while bisecting. `require(esm)` is on by default now. |
| `--no-experimental-require-module` | Old name for the flag above. **[Legacy]** | v22.0.0 / v20.17.0 | Rename it. |
| `--no-experimental-detect-module` | Disables syntax detection for ambiguous `.js` files. | v21.1.0 / v20.10.0 | Forces the old "CommonJS unless told otherwise" rule. Useful for pinning behaviour during a migration. |
| `--experimental-print-required-tla` | When `require()` of an ESM graph fails because of top-level `await`, prints where the awaits are. | v22.0.0 / v20.17.0 | Turn it on the moment you see `ERR_REQUIRE_ASYNC_MODULE`. |
| `--trace-require-module=mode` | Logs every `require()` of an ES module. `all` or `no-node-modules`. | v23.5.0 / v22.13.0 / v20.19.0 | Auditing how much of your tree relies on `require(esm)`. |
| `--experimental-loader=module` | Registers async module customization hooks. **[Experimental]** | v8.8.0 | Prefer `module.registerHooks()` — see [Chapter 53](../part8-advanced/53-module-hooks.md); `module.register()` itself is now runtime-deprecated (DEP0205). |
| `--experimental-vm-modules` | Enables `vm.Module` / ESM inside `node:vm`. **[Experimental]** | v9.6.0 | Required by several test frameworks. See [Chapter 52](../part8-advanced/52-vm-sandboxing.md). |
| `--experimental-import-meta-resolve` | Enables the second `parentURL` argument of `import.meta.resolve()`. **[Experimental]** | v13.9.0 / v12.16.2 | Only if you need contextual resolution; plain `import.meta.resolve()` needs no flag. |
| `--experimental-package-map=<path>` | Resolves bare specifiers through an explicit JSON package map. **[Experimental]** | v26.4.0 | Supply-chain control: state exactly which package may import which. |
| `--run <script>` | Runs a `package.json` script without a package manager. | v22.0.0 | Meaningfully faster than `npm run` in CI. It sets `NODE_RUN_SCRIPT_NAME` and `NODE_RUN_PACKAGE_JSON_PATH`, and it does **not** apply `--env-file` variables to the spawned command. |
| `--env-file=file` | Loads a `.env` file into `process.env` before startup. | v20.6.0 | Local development. Real environment variables win over file values. Repeatable. |
| `--env-file-if-exists=file` | Same, but a missing file is not an error. | v22.9.0 | The one to use in a `Dockerfile` or shared script. |
| `--experimental-config-file=path` | Loads `node.config.json` (or a given path) as a config file. **[RC 1.2]** | v23.10.0 / v22.16.0 | Replaces a wall of flags with a checked-in file. The space-separated form is *not* supported — use `=`. |
| `--experimental-default-config-file` | Alias for the above with no argument. **[Early dev 1.0]** | v23.10.0 / v22.16.0 | Equivalent to `--experimental-config-file` with no path. |
| `--title=title` | Sets `process.title` at startup. | v10.7.0 | Makes `ps` output readable when you run several Node services on one host. |
| `--completion-bash` | Prints a sourceable bash completion script. | v10.12.0 | `node --completion-bash > /etc/bash_completion.d/node`. |
| `-v`, `--version` / `-h`, `--help` | Print version / options. | v0.1.3 | `--help` is terser than the docs; `--v8-options` covers V8's own flags. |

Related reading: [Chapter 3 — Running Code](../part1-foundations/03-running-code-cli-repl.md),
[Chapter 5 — ES Modules](../part1-foundations/05-modules-esm.md).

---

## A.2 TypeScript

This is the group where the docs have changed most recently, so check your
assumptions.

| Flag | What it does | Since | When to use |
|---|---|---|---|
| *(no flag)* | Node strips TypeScript types from `.ts` files by default. Stability 2 — Stable as of v25.2.0 / v24.12.0; enabled by default since v23.6.0 / v22.18.0. | v22.6.0 | This is the default. You do not enable type stripping; you disable it. |
| `--no-strip-types` | Turns type stripping off, so `.ts` files fail to load. | v22.6.0 (renamed from `--no-experimental-strip-types` in v25.2.0 / v24.12.0) | Force a loader such as `tsx` to handle every `.ts` file, with no ambiguity about who compiled what. |
| `--input-type=module-typescript` / `commonjs-typescript` | Parses `--eval` or stdin as TypeScript. | v12.0.0 (values added later) | Piping generated TS into Node. Unavailable under `--no-strip-types`. |
| `--enable-source-maps` | Makes stack traces point at original source positions. | v12.12.0 | Any transpiled deployment. Type stripping itself does not need source maps (it substitutes whitespace, preserving line and column), but a real compiler does. |

Two facts that catch people:

- **`--experimental-transform-types` no longer exists.** It was removed in
  v26.0.0. Node's built-in support erases types; it does not *transform* them.
  Syntax that needs code generation — `enum`, `namespace` with runtime members,
  parameter properties, legacy decorators — throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.
  Set `"erasableSyntaxOnly": true` in `tsconfig.json` and let the type checker
  catch it before Node does.
- **`tsconfig.json` is ignored at runtime.** Path aliases and downlevelling do
  not happen. If you need them, use a third-party loader.

See [Chapter 7 — TypeScript in Node.js](../part1-foundations/07-typescript.md).

---

## A.3 Watch mode and the dev loop

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--watch` | Restarts the process when the entry point or anything it imported changes. | v18.11.0 / v16.19.0 | The default dev loop. No `nodemon` needed. Cannot be combined with `--check`, `--eval`, `--interactive`, or the REPL. |
| `--watch-path=path` | Watches the given paths instead of the import graph. Repeatable. | v18.11.0 / v16.19.0 | When your app reads templates or config that are not imported. Note it **turns off** import-graph watching even alongside `--watch`. |
| `--watch-preserve-output` | Stops the console being cleared on each restart. | v19.3.0 / v18.13.0 | Almost always what you want — otherwise the stack trace you were reading vanishes. |
| `--watch-kill-signal` | Chooses the signal sent on restart. **[Active dev 1.1]** | v24.4.0 / v22.18.0 | When your shutdown handler listens for `SIGINT` rather than the default. See [Chapter 26](../part4-system/26-signals-and-shutdown.md). |

---

## A.4 Testing

The runner is covered in [Chapter 45](../part7-diagnostics/45-test-runner.md);
this is the flag surface.

**Selecting and running**

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--test` | Starts the CLI test runner. | v18.1.0 / v16.17.0 | The entry point. Incompatible with `--watch-path`, `--check`, `--eval`, `--interactive`, and the inspector. |
| `--test-isolation=mode` | `process` (default) runs each file in its own child; `none` runs everything in one process. | v22.8.0 | `none` is much faster and lets you share expensive fixtures; it also lets one leaky test poison the rest. Ignored without `--test`. |
| `--test-concurrency=n` | How many test files run at once. | v21.0.0 / v20.10.0 / v18.19.0 | Default is `os.availableParallelism() - 1`. Lower it on shared CI runners. Ignored when isolation is `none`. |
| `--test-name-pattern` / `--test-skip-pattern` | Include / exclude by regex on the test name. | v18.11.0 / v22.1.0 | Both may be given; a test must satisfy both to run. |
| `--test-only` | Runs only top-level tests marked `only`. | v18.0.0 / v16.17.0 | Unnecessary when isolation is disabled. |
| `--test-shard=i/total` | Runs one slice of the suite. | v20.5.0 / v18.19.0 | Fan a long suite across CI machines. |
| `--test-randomize` / `--test-random-seed=n` | Shuffles file and test order; the seed is printed and replayable. | v26.1.0 / v24.16.0 | The cheapest way to find tests that depend on execution order. Passing a seed enables randomization implicitly. |
| `--test-rerun-failures=file` | Persists pass/fail state so the next run can re-run only failures. | v24.7.0 | Tight local loops on a big suite. |
| `--test-timeout=ms` | Fails a test after this long. Default `Infinity`. | v21.2.0 / v20.11.0 | Set it. An unbounded default means a hung test hangs CI. |
| `--test-force-exit` | Exits once tests finish even if handles remain open. | v22.0.0 / v20.14.0 | A workaround, not a fix: it hides the leaked handle that is the real bug. |
| `--test-global-setup=module` | Runs a module before all tests, for shared fixtures. **[Early dev 1.0]** | v24.0.0 | Starting a database container once for the whole suite. |
| `--experimental-test-tag-filter='<expr>'` | Boolean tag expression (`and`/`or`/`not`, parentheses, `*` wildcards). **[Early dev 1.0]** | v26.2.0 / v24.19.0 | Splitting fast from slow suites without touching filenames. |
| `--experimental-test-module-mocks` | Enables module mocking. **[Experimental]** | v22.3.0 / v20.18.0 | Requires `--allow-worker` under the permission model. |
| `--test-update-snapshots` | Regenerates snapshot files. | v22.3.0 | Review the diff before committing; this flag makes any failure "pass". |

**Coverage and reporting**

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--experimental-test-coverage` | Emits a coverage report with the test output. **[Experimental]** | v19.7.0 / v18.15.0 | No report is produced if no tests ran — a silent zero is a red flag. |
| `--test-coverage-include` / `--test-coverage-exclude` | Glob filters on the report. Repeatable. **[Experimental]** | v22.5.0 | Exclude generated code before it drags your percentage down. |
| `--test-coverage-include-all` | Counts files that were never loaded as 0%. **[Experimental]** | v26.7.0 | Turn it on. Without it, a file nobody imports looks perfectly covered. |
| `--test-coverage-lines` / `-branches` / `-functions=threshold` | Exit code 1 if coverage is under the threshold. **[Experimental]** | v22.8.0 | The CI gate. Set all three; lines alone is easy to game. |
| `--test-reporter` / `--test-reporter-destination` | Chooses a reporter and where it writes. Repeatable in pairs. | v19.6.0 / v18.15.0 | `--test-reporter=spec` for humans plus `--test-reporter=junit --test-reporter-destination=out.xml` for CI, in one run. |

---

## A.5 Debugging and inspection

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--inspect[=[host:]port]` | Opens the V8 inspector. Default `127.0.0.1:9229`; port `0` picks a free one. | v6.3.0 | Attaching Chrome DevTools or an editor. See [Chapter 47](../part7-diagnostics/47-debugging.md). |
| `--inspect-brk[=[host:]port]` | Same, but pauses before the first line of your code. | v7.6.0 | Debugging startup, module-level side effects, and config loading. |
| `--inspect-wait[=[host:]port]` | Opens the inspector and blocks until a debugger attaches. | v22.2.0 / v20.15.0 | Short-lived processes and workers that would exit before you could connect. |
| `--inspect-port=[host:]port` | Sets the address used when the inspector is activated later, e.g. by `SIGUSR1`. | v7.6.0 | Attaching to an already-running production process on a chosen port. |
| `--inspect-publish-uid=stderr,http` | Controls where the WebSocket URL is published — stderr, the `/json/list` endpoint, or both. | — | Set it to `http` only, so the debug URL never lands in your log aggregator. |
| `--disable-sigusr1` | Stops `SIGUSR1` from opening a debugger. | v23.7.0 / v22.14.0 | Production hardening: without it, anyone who can signal the process can attach to it and read memory. |
| `--experimental-network-inspection` | Surfaces HTTP traffic in DevTools' Network panel. **[Experimental]** | v22.6.0 / v20.18.0 | Debugging outbound requests without a proxy. |
| `--experimental-worker-inspection` | Extends DevTools inspection to worker threads. **[Active dev 1.1]** | v24.1.0 / v22.17.0 | Debugging inside a worker. See [Chapter 29](../part4-system/29-worker-threads.md). |
| `--experimental-storage-inspection` | Exposes storage to DevTools. **[Active dev 1.1]** | v25.5.0 / v24.16.0 | Inspecting `localStorage` when using web storage. |
| `--experimental-inspector-network-resource` | Lets DevTools fetch resources through the inspector. **[Active dev 1.1]** | v24.5.0 / v22.19.0 | Loading source maps that live behind auth. |

Binding the inspector to a public address is a remote code execution hole; the
docs say so explicitly. Bind to `127.0.0.1` and forward the port over SSH.

---

## A.6 Diagnostics and reports

Diagnostic reports are the single best "what happened at 03:00" tool Node ships.
See [Chapter 50](../part7-diagnostics/50-reports-and-heap.md).

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--report-on-fatalerror` | Writes a report on internal fatal errors, including OOM. | v11.8.0 | Turn this on in production. It is the only thing that explains an OOM kill after the fact. |
| `--report-uncaught-exception` | Writes a report when an uncaught exception ends the process. | v11.8.0 | Pairs with the above. Captures the JS stack alongside heap and event-loop state. |
| `--report-on-signal` | Writes a report when the report signal arrives. | v11.8.0 | On-demand snapshot of a wedged process, no debugger required. |
| `--report-signal=signal` | Chooses that signal. Default `SIGUSR2`. Not on Windows. | v11.8.0 | Change it if something else in your stack already uses `SIGUSR2`. |
| `--report-filename=name` | Report file name; `stdout` or `stderr` write to those streams. | v11.8.0 | `stdout` in containers, so the report reaches your log pipeline. |
| `--report-dir=dir`, `--report-directory=dir` | Where reports are written. | v11.8.0 | Point at a mounted volume; a report written into an ephemeral container filesystem is lost. |
| `--report-compact` | Single-line JSON instead of pretty-printed. | v13.12.0 / v12.17.0 | Any time a log shipper, not a human, reads it first. |
| `--report-exclude-env` | Omits `environmentVariables` from the report. | v23.3.0 / v22.13.0 | **Use this.** Reports otherwise contain every secret in your environment. |
| `--report-exclude-network` | Omits `header.networkInterfaces`. | v22.0.0 / v20.13.0 | Reduces size and avoids leaking internal topology. On some hosts it also removes a slow syscall. |
| `--diagnostic-dir=dir` | Default output directory for reports, CPU profiles, heap profiles and redirected warnings. | — | Set it once instead of setting four separate directory flags. |
| `--heapsnapshot-signal=signal` | Writes a heap snapshot when this signal arrives. Off by default. | v12.0.0 | Investigating a slow leak on a live process. |
| `--heapsnapshot-near-heap-limit=n` | Writes up to `n` snapshots as the heap approaches its limit. | v15.1.0 / v14.18.0 | The one flag that catches an OOM *before* the process dies. Snapshots are large and writing them is slow — keep `n` small. |
| `--redirect-warnings=file` | Appends process warnings to a file instead of stderr. | v8.0.0 | Keeps deprecation noise out of application logs without silencing it. |
| `--node-memory-debug` | Extra internal leak checks. | v15.0.0 / v14.18.0 | Only when debugging Node itself or a native addon. |
| `--trace-uncaught` | Also prints the stack at the point the value was *thrown*. | v13.1.0 | When someone throws a non-`Error` and the stack is useless. Hurts GC behaviour; not for steady-state production. |
| `--trace-exit` | Prints a stack trace whenever `process.exit()` is called. | v13.5.0 / v12.16.0 | Finding the library that kills your process without telling you. |
| `--trace-sigint` | Prints a stack trace on `SIGINT`. | v13.9.0 / v12.17.0 | Diagnosing a process that ignores <kbd>Ctrl</kbd>+<kbd>C</kbd>. |
| `--trace-sync-io` | Prints a stack trace for synchronous I/O after the first event-loop turn. | v2.1.0 | Run it once against a new service. It reliably finds the `readFileSync` in a request handler. Development only. |
| `--abort-on-uncaught-exception` | Aborts (producing a core dump) instead of exiting. | v0.10.8 | Post-mortem debugging with `lldb`/`gdb` — but only where you can actually collect and store core files. |

---

## A.7 Tracing and instrumentation

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--trace-events-enabled` | Turns on trace-event collection. | v7.7.0 | Producing a Chrome-trace timeline. See [Chapter 48](../part7-diagnostics/48-diagnostics-channel-tracing.md). |
| `--trace-event-categories` | Comma-separated categories to record. | v7.7.0 | `node.async_hooks,v8` is a good starting pair. Recording everything produces gigabytes. |
| `--trace-event-file-pattern` | Output path template; supports `${rotation}` and `${pid}`. | v9.8.0 | Keeps per-worker traces apart under cluster. |
| `--trace-warnings` | Prints a stack trace with every process warning. | v6.0.0 | Turn this on the moment you see a warning you cannot place. |
| `--trace-deprecation` | Prints a stack trace with every deprecation warning. | v0.8.0 | Upgrade audits — the stack tells you which dependency is at fault. |
| `--pending-deprecation` | Emits deprecations that are off by default, and promotes application-level ones to fire inside `node_modules` too. | v8.0.0 | Run your test suite with it before a major upgrade. See [Appendix D](d-deprecations.md). |
| `--throw-deprecation` | Turns deprecation warnings into thrown errors. | v0.11.14 | In CI, to make a regression fail the build. Never in production. |
| `--trace-env` | Logs every environment-variable read, write, definition and query. | v23.4.0 / v22.13.0 | Working out which library reads `NODE_ENV`, or why a variable seems ignored. |
| `--trace-env-js-stack` / `--trace-env-native-stack` | As above, plus a JS or native stack trace per access. | v23.4.0 / v22.13.0 | When the variable name alone is not enough to identify the culprit. |
| `--trace-tls` | Prints TLS packet traces to stderr. | v12.2.0 | Handshake failures. Verbose; use on one connection at a time. |
| `--tls-keylog=file` | Writes TLS key material in NSS `SSLKEYLOGFILE` format. | v13.2.0 / v12.16.0 | Decrypting your own traffic in Wireshark. **Anyone with this file can decrypt those sessions.** Development only. |
| `--force-node-api-uncaught-exceptions-policy` | Makes Node-API async callbacks emit `uncaughtException` properly. | v18.3.0 / v16.17.0 | Enable it when auditing native addons; it will become the default. |
| `--no-force-async-hooks-checks` | Skips `async_hooks` runtime checks. | v9.0.0 | A micro-optimisation that removes a safety net. Rarely worth it. |
| `--no-async-context-frame` | Reverts `AsyncLocalStorage` to the old `async_hooks`-based implementation. | v24.0.0 | Only to work around a context-propagation regression — and report it. See [Chapter 15](../part2-async/15-async-context.md). |

---

## A.8 Performance, profiling and V8 memory

**Profiling**

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--cpu-prof` | Runs the V8 CPU profiler for the process lifetime, writing a `.cpuprofile` at exit. | v12.0.0 | The fastest route from "it's slow" to a flame graph. Load the file in DevTools. |
| `--cpu-prof-interval=µs` | Sampling interval. Default 1000 µs. | v12.2.0 | Lower it for short runs; the default is too coarse under a second. |
| `--cpu-prof-dir` / `--cpu-prof-name` | Output directory / file name. | v12.0.0 | Directory defaults to `--diagnostic-dir`. |
| `--heap-prof` | Sampling heap profiler; writes a `.heapprofile` at exit. | v12.4.0 | Finding *where* allocations come from — complementary to a heap snapshot, which shows what is retained. |
| `--heap-prof-interval=bytes` | Average sampling interval. Default 512 KiB. | v12.4.0 | Reduce for short-lived processes. |
| `--heap-prof-dir` / `--heap-prof-name` | Output directory / file name. | v12.4.0 | As above. |
| `--track-heap-objects` | Tracks allocations so heap snapshots carry allocation timelines. | v2.4.0 | Leak hunting. It slows the process noticeably; do not leave it on. |
| `--prof` | Writes a V8 tick log (`isolate-*.log`). | v2.0.0 | Legacy but still useful for native-frame attribution. Not permitted in `NODE_OPTIONS`. |
| `--prof-process` | Turns a `--prof` log into a readable report. | v5.2.0 | `node --prof-process isolate-0x*.log > profile.txt`. |

**V8 memory and execution** (these are V8 flags surfaced by Node)

| Flag | What it does | When to use |
|---|---|---|
| `--max-old-space-size=SIZE` (MiB) | Caps the V8 old-generation heap. | Set it in containers. V8 otherwise sizes the heap from *host* memory and gets OOM-killed by the cgroup limit. |
| `--max-old-space-size-percentage=pct` | Same, but as a percentage of available system memory; **takes precedence** over `--max-old-space-size`. | Container images that must run on several instance sizes. The docs warn it can be unreliable on 32-bit platforms. |
| `--max-semi-space-size=SIZE` (MiB) | Sizes the young generation. | Raise it for allocation-heavy request handlers to cut scavenge frequency; it costs memory. Measure. |
| `--max-heap-size` | Overall V8 heap cap. | Rarely needed alongside `--max-old-space-size`. |
| `--expose-gc` | Exposes `globalThis.gc()`. | Benchmarks and leak tests only. In production it is a denial-of-service primitive. |
| `--stack-trace-limit=n` | Frames captured per `Error`. | Raise to 50 while debugging deep async stacks; lower to reduce error-construction cost in hot paths. |
| `--jitless` | Disables runtime allocation of executable memory. **[Experimental]** | Only where a platform or policy forbids W^X memory. The performance cost is severe. |
| `--interpreted-frames-native-stack` | Makes interpreted frames visible to native profilers. | Correlating a Node profile with `perf` or ETW output. |
| `--perf-basic-prof`, `--perf-basic-prof-only-functions`, `--perf-prof`, `--perf-prof-unwinding-info` | Emit data for Linux `perf`. Linux only. | Whole-system flame graphs that include native and kernel frames. |
| `--enable-etw-stack-walking` | Windows ETW stack walking. Windows only. | The Windows equivalent of the above. |
| `--v8-options` | Prints all V8 flags. | The source of truth for anything not listed here. Undocumented V8 flags are not covered by Node's stability guarantees. |

**Node-level performance**

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--v8-pool-size=n` | Size of V8's background worker pool. `0` means auto. | v5.10.0 | Reduce it when packing many small Node processes onto one box. |
| `--zero-fill-buffers` | Zero-fills every newly allocated `Buffer`. | v6.0.0 | Defence in depth against leaking stale heap memory through `Buffer.allocUnsafe`. Costs throughput on buffer-heavy work. |
| `--max-http-header-size=bytes` | Maximum HTTP header block. Default 16 KiB. | v11.6.0 / v10.15.0 | Raise only for a specific, known client. Larger values increase memory pressure per connection. |
| `--use-largepages=mode` | Remaps Node's static code onto 2 MiB pages. | v13.6.0 / v12.17.0 | Measurable iTLB win on large, long-lived services. Needs OS support. |
| `--disable-wasm-trap-handler` | Turns off trap-handler-based WebAssembly bounds checks, falling back to inline checks. | v22.2.0 / v20.15.0 | Only where the large virtual memory reservation per Wasm memory (8–16 GiB) conflicts with a `ulimit -v` policy. Costs Wasm performance. |
| `--disable-proto=mode` | `delete` removes `Object.prototype.__proto__`; `throw` makes access raise `ERR_PROTO_ACCESS`. | v13.12.0 / v12.17.0 | Prototype-pollution hardening. `throw` first — it tells you what broke. |
| `--frozen-intrinsics` | Freezes built-ins such as `Array` and `Object`. **[Experimental]** | v11.12.0 | Attractive for lockdown, but the docs are explicit that code may break. Test hard. |

See [Chapter 61 — Performance Tuning](../part9-production/61-performance-tuning.md).

---

## A.9 Security and hardening

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--disallow-code-generation-from-strings` | Makes `eval` and `new Function` throw. Does **not** affect `node:vm`. | v9.8.0 | Strong, cheap hardening. Try it — most applications never notice. |
| `--disable-proto=throw` | See above. | v13.12.0 / v12.17.0 | Prototype-pollution defence. |
| `--no-addons` | Disables native addons entirely and the `node-addons` export condition. `process.dlopen` throws `ERR_DLOPEN_DISABLED`. | v16.10.0 / v14.19.0 | Any deployment that has no legitimate native dependency. Removes a whole class of supply-chain risk. |
| `--force-context-aware` | Refuses to load non-context-aware addons. | v12.12.0 | Prerequisite for safely using worker threads with native code. |
| `--disable-sigusr1` | Blocks signal-triggered debugger attach. | v23.7.0 / v22.14.0 | Production. See A.5. |
| `--secure-heap=n` | Allocates an OpenSSL secure heap of `n` bytes for key material. | v15.6.0 | Services that hold long-lived private keys. Fixed size — if it fills, allocations fail, so size it deliberately. |
| `--secure-heap-min=n` | Minimum secure-heap allocation. Power of two, minimum 2. | v15.6.0 | Tune alongside the above. |
| `--enable-fips` / `--force-fips` | Enables FIPS mode; `--force-fips` also prevents script code from turning it off. | v6.0.0 | Regulated environments. Requires a FIPS-capable OpenSSL or a working `fips` provider. |
| `--openssl-config=file` | Loads an OpenSSL config at startup; overrides `OPENSSL_CONF`. | v6.9.0 | Pinning provider configuration in a container. |
| `--openssl-shared-config` | Reads the shared `openssl_conf` section of the OpenSSL config. | v18.5.0 / v16.17.0 / v14.21.0 | Only when you deliberately want system OpenSSL policy to apply. |
| `--openssl-legacy-provider` | Enables OpenSSL 3's legacy provider (MD4, RC4, and friends). | v17.0.0 / v16.17.0 | Interop with legacy systems. Everything it re-enables is broken by design — scope it narrowly and plan its removal. |
| `--disable-warning=code-or-type` | Suppresses warnings by code (e.g. `DEP0040`) or type (e.g. `ExperimentalWarning`). | v21.3.0 / v20.11.0 | The right way to silence one known-and-accepted warning. Far better than `--no-warnings`. |
| `--unhandled-rejections=mode` | `throw` (default), `strict`, `warn`, `warn-with-error-code`, `none`. | v12.0.0 / v10.17.0 | Leave it at `throw`. `none` converts a crash into silent data corruption. Rejections during the entry point's ESM loading phase always throw regardless. |
| `--no-extra-info-on-fatal-exception` | Hides the extra diagnostic block printed on a fatal exception. | v17.0.0 | Only if that block leaks sensitive values into logs — you are trading away debuggability. |

See [Chapter 44 — Securing Node.js Applications](../part6-security/44-securing-applications.md).

---

## A.10 Permission model

The permission model is off unless you turn it on. Once on, everything in the
list below is denied until explicitly allowed. Full treatment in
[Chapter 31](../part4-system/31-permission-model.md).

| Flag | What it does | Since | Stability | When to use |
|---|---|---|---|---|
| `--permission` | Enables the permission model: filesystem, network, child processes, workers, WASI, native addons, inspector and OpenSSL store are all restricted. | v20.0.0 | — | Running untrusted or semi-trusted code, plugins, or a build step you did not write. |
| `--permission-audit` | Performs the checks but denies nothing; each violation is published on a `node:diagnostics_channel`. Does **not** require `--permission`. | v25.8.0 | — | Run this first. It tells you exactly which `--allow-*` flags you will need, without breaking anything. |
| `--allow-fs-read=path` | Grants read access. | v20.0.0 | — | Grant directories, not `*`. |
| `--allow-fs-write=path` | Grants write access. | v20.0.0 | — | Usually a single scratch directory. |
| `--allow-net` | Grants network access. | v25.0.0 | 1.1 Active dev | New and still moving; pin your Node version. |
| `--allow-child-process` | Allows spawning children. Otherwise `ERR_ACCESS_DENIED`. | v20.0.0 | 1.1 Active dev | A child process is *not* sandboxed by the parent's permissions. Granting this largely undoes the model. |
| `--allow-worker` | Allows creating worker threads. | v20.0.0 | 1.1 Active dev | Required by module mocking and by async loader hooks. |
| `--allow-addons` | Allows native addons. Otherwise `ERR_DLOPEN_DISABLED`. | v21.6.0 / v20.12.0 | 1.1 Active dev | Native code can bypass the model entirely. Grant reluctantly. |
| `--allow-ffi` | Allows the `node:ffi` APIs. | v26.1.0 | 1.1 Active dev | Also needs `--experimental-ffi` and an FFI-enabled build. Same warning as addons. |
| `--allow-wasi` | Allows creating WASI instances. | v22.3.0 / v20.16.0 | 1.1 Active dev | See [Chapter 57 — WebAssembly and WASI](../part8-advanced/57-wasm-wasi.md). |
| `--allow-inspector` | Allows the inspector protocol. | v25.0.0 / v24.12.0 | 1.0 Early dev | Almost never in a sandbox — the inspector can read everything. |
| `--allow-openssl-store` | Allows OpenSSL STORE loaders, e.g. loading a key from a URL. Can be dropped at runtime with `permission.drop()`. | v26.7.0 | 1.1 Active dev | Narrow; most applications do not need it. |

---

## A.11 Networking, TLS and certificates

**TLS versions and ciphers**

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--tls-min-v1.2` | Sets `tls.DEFAULT_MIN_VERSION` to TLSv1.2. This is already the default from Node 12 onward. | v12.2.0 / v10.20.0 | Belt and braces in a hardened image. |
| `--tls-min-v1.3` | Raises the floor to TLSv1.3, disabling 1.2. | v12.0.0 | Internal service meshes where you control both ends. It will break older clients. |
| `--tls-min-v1.0` / `--tls-min-v1.1` | Lowers the floor to TLSv1 / TLSv1.1. | v12.0.0 / v10.20.0 | **Lowering the floor re-enables protocols with known attacks.** Only for a specific legacy peer, and scope it to that process. |
| `--tls-max-v1.2` | Caps at TLSv1.2, disabling 1.3. | v12.0.0 / v10.20.0 | Working around a middlebox that mishandles 1.3. Temporary. |
| `--tls-max-v1.3` | Sets the ceiling to TLSv1.3. | v12.0.0 | The current default ceiling. |
| `--tls-cipher-list=list` | Replaces the default cipher list. | v4.0.0 | Compliance profiles. Getting this wrong silently weakens every connection — prefer the defaults. |

**Certificate stores**

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--use-bundled-ca` | Uses the Mozilla CA snapshot compiled into your Node build. Identical on every platform. | v6.11.0 | Reproducibility. Note it is frozen at release time, so a newly distrusted CA stays trusted until you upgrade Node. |
| `--use-openssl-ca` | Uses OpenSSL's default store, honouring `SSL_CERT_FILE` / `SSL_CERT_DIR`. | v6.11.0 | Hosts whose CA policy is managed centrally. |
| `--use-system-ca` | Uses the OS trust store *in addition to* the bundled store and `NODE_EXTRA_CA_CERTS`. Caches after first load. | v23.8.0 | Corporate environments with a TLS-inspecting proxy. This is the correct fix for "self-signed certificate in certificate chain" — not disabling verification. |

**Connections, DNS and proxies**

| Flag | What it does | Since | When to use |
|---|---|---|---|
| `--dns-result-order=order` | Default `order` for `dns.lookup()`: `verbatim` (default), `ipv4first`, `ipv6first`. | v16.4.0 / v14.18.0 | `ipv4first` on hosts with broken IPv6. `dns.setDefaultResultOrder()` overrides this flag. See [Chapter 34](../part5-networking/34-dns.md). |
| `--network-family-autoselection-attempt-timeout=ms` | Per-family timeout in Happy Eyeballs. | v22.1.0 / v20.13.0 | Lower it when IPv6 blackholes and connections hang instead of failing over. |
| `--no-network-family-autoselection` | Turns Happy Eyeballs off unless a call opts in. | v19.4.0 | Diagnosing which family actually fails. |
| `--use-env-proxy` | Honours `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` for outbound requests. **[Active dev 1.1]** | v24.5.0 / v22.21.0 | Egress through a corporate proxy. The docs are explicit: this is not an anonymity feature, and a proxy can read plaintext requests. |
| `--experimental-quic` | Enables QUIC. **[Active dev 1.1]** | v25.0.0 / v24.16.0 | See [Chapter 40](../part5-networking/40-quic-dtls.md). |
| `--experimental-dtls` | Enables DTLS. **[Experimental]** | — | Same chapter. |
| `--insecure-http-parser` | Relaxes HTTP parsing. | v13.4.0 / v12.15.0 / v10.19.0 | See A.15. Do not. |

See [Chapter 37 — TLS and HTTPS](../part5-networking/37-tls-https.md).

---

## A.12 Experimental and preview features

Everything here can change or vanish in a minor release. Pin your Node version
if you depend on any of it.

| Flag | Enables | Since | Stability |
|---|---|---|---|
| `--experimental-eventsource` | Global `EventSource`. | v22.3.0 / v20.18.0 | Experimental |
| `--experimental-shadow-realm` | `ShadowRealm`. | v19.0.0 / v18.13.0 | Experimental |
| `--experimental-import-text` | `import ... with { type: 'text' }`. | v26.5.0 / v24.19.0 | 1.0 Early dev |
| `--experimental-addon-modules` | `import` of `.node` addons. | v23.6.0 / v22.20.0 | 1.2 RC |
| `--experimental-stream-iter` | `node:stream/iter`. | v25.9.0 | Experimental |
| `--experimental-vfs` | `node:vfs`. See [Chapter 55](../part8-advanced/55-single-executable.md). | v26.4.0 | Experimental |
| `--experimental-ffi` | `node:ffi`; also needs `--allow-ffi` under the permission model, and an FFI-enabled build. | v26.1.0 | Experimental |
| `--experimental-wasi-unstable-preview1` | WASI preview 1. | v13.3.0 / v12.16.0 | Experimental |
| `--experimental-web-worker` | Web Worker API. | — | Experimental |
| `--localstorage-file=file` | Backing file for `localStorage`; shareable between processes. | v22.4.0 | 1.2 RC |
| `--no-experimental-webstorage` | Turns Web Storage off. | v22.4.0 | 1.2 RC |
| `--no-experimental-websocket` | Removes the global `WebSocket`. | v22.0.0 | — |
| `--no-experimental-global-navigator` | Removes the global `navigator`. | v21.2.0 | Experimental |
| `--no-experimental-sqlite` | Disables `node:sqlite`. See [Chapter 54](../part8-advanced/54-sqlite.md). | v22.5.0 | — |

**Snapshots and single executables**

| Flag | What it does | Since | Stability |
|---|---|---|---|
| `--build-snapshot` | Writes a startup snapshot at exit (default `snapshot.blob`). | v18.8.0 | — |
| `--build-snapshot-config=file` | JSON configuration for snapshot creation. | v21.6.0 / v20.12.0 | — |
| `--snapshot-blob=path` | Writes the blob here with `--build-snapshot`, or restores from it without. | v18.8.0 | Experimental |
| `--build-sea=config` | Builds a single executable application from a JSON config. | v25.5.0 | 1.1 Active dev |
| `--experimental-sea-config` | Older SEA blob generator. | v20.0.0 | Experimental |

---

## A.13 `NODE_OPTIONS`: what is and is not allowed

`NODE_OPTIONS` holds a space-separated list of flags applied *before* the command
line. This is how you configure a Node process you do not control the invocation
of — a `npm` script, a serverless runtime, a container entrypoint someone else
wrote.

```bash
NODE_OPTIONS="--enable-source-maps --report-on-fatalerror --report-exclude-env" node server.js
```

Values containing spaces are quoted with double quotes:

```bash
NODE_OPTIONS='--require "./my path/file.js"'
```

**Precedence.** For a singleton flag, the command line wins:

```bash
# The inspector listens on 5555, not 4444.
NODE_OPTIONS='--inspect=localhost:4444' node --inspect=localhost:5555 app.js
```

For a repeatable flag, `NODE_OPTIONS` entries come *first* and the command-line
entries are appended:

```bash
NODE_OPTIONS='--require "./a.js"' node --require "./b.js" app.js
# equivalent to: node --require "./a.js" --require "./b.js" app.js
```

**Not permitted.** Node exits with an error if `NODE_OPTIONS` contains a flag
that is not on its allow-list, or anything that would change what program runs.
The categories that are refused:

- **Anything that supplies a program:** a script path, `-e` / `--eval`,
  `-p` / `--print`, `-i` / `--interactive`, `-c` / `--check`, `--run`.
- **The test runner switch and several of its options:** `--test` itself is not
  on the list, and neither are `--experimental-test-coverage`,
  `--test-concurrency`, `--test-force-exit`, `--test-timeout`,
  `--test-update-snapshots`, `--experimental-test-module-mocks` or
  `--experimental-test-tag-filter`. (Confusingly, many *other* `--test-*` flags
  such as `--test-reporter` and `--test-name-pattern` are permitted, and
  `--watch` is permitted too.)
- **Build and bootstrap operations:** `--build-snapshot`, `--build-sea`,
  `--experimental-sea-config`, `--experimental-config-file`.
- **Environment file loading:** `--env-file` and `--env-file-if-exists` — which
  makes sense, since `NODE_OPTIONS` may itself come from such a file.
- **Informational flags:** `--help`, `--version`, `--v8-options`,
  `--completion-bash`.
- **`--prof`** and `--experimental-network-inspection`, despite several of their
  neighbours being allowed.

**Permitted, and worth knowing about.** The allow-list is long; these are the
ones that matter operationally: `--require` / `-r`, `--import`, `--conditions`,
`--enable-source-maps`, `--max-http-header-size`, `--max-old-space-size-percentage`,
all `--report-*` flags, all `--trace-*` flags, all `--inspect*` flags, all
`--cpu-prof*` and `--heap-prof*` flags, all `--tls-*` flags, all `--allow-*`
flags plus `--permission` and `--permission-audit`, `--no-warnings`,
`--disable-warning`, `--pending-deprecation`, `--throw-deprecation`,
`--unhandled-rejections`, `--watch` and its companions, `--use-system-ca`,
`--use-env-proxy`, `--no-strip-types`, `--title`, `--zero-fill-buffers`.

A separate, much shorter allow-list covers V8 flags:
`--abort-on-uncaught-exception`, `--disallow-code-generation-from-strings`,
`--enable-etw-stack-walking` (Windows only), `--expose-gc`,
`--interpreted-frames-native-stack`, `--jitless`, `--max-heap-size`,
`--max-old-space-size`, `--max-semi-space-size`, `--perf-basic-prof`,
`--perf-basic-prof-only-functions`, `--perf-prof`, `--perf-prof-unwinding-info`
(the four `--perf-*` flags are Linux only), and `--stack-trace-limit`.

Note that `--max-old-space-size` is on the V8 list, so the single most common
container setting *is* allowed:

```bash
NODE_OPTIONS="--max-old-space-size=768"
```

Because the list is generated from the Node source and grows every release,
treat the version you are running as authoritative: if Node starts and does not
complain, the flag was accepted.

Full variable reference: [Appendix B](b-environment-variables.md).

---

## A.14 The `--no-*` family, and what "disable" really means

Node's `--no-` prefix means two different things, and confusing them causes real
bugs.

- **`--no-<feature>`** genuinely turns a feature off: `--no-addons`,
  `--no-strip-types`, `--no-experimental-sqlite`, `--no-global-search-paths`.
  These are the negations of behaviour that is on by default.
- **`--no-deprecation`, `--no-warnings`** do not turn off the *behaviour*; they
  turn off the *message*. The deprecated code path still runs, still behaves the
  same way, and will still break on the release that removes it. You have
  suppressed your own early-warning system.

If you need to silence one specific warning, use `--disable-warning=DEP0040` (by
code) or `--disable-warning=ExperimentalWarning` (by type). That keeps every
other warning visible.

---

## A.15 The dangerous flags

These are ordered roughly by how much damage they do.

| Flag or variable | What it really costs you | Acceptable use |
|---|---|---|
| `NODE_TLS_REJECT_UNAUTHORIZED=0` | Disables certificate validation for **every** TLS and HTTPS connection in the process. Any active network attacker can read and modify your traffic, and you get no error. The docs call its use "strongly discouraged". | None in production. For a corporate proxy use `--use-system-ca` or `NODE_EXTRA_CA_CERTS`; for a self-signed dev server pass an explicit `ca` option to that one client. |
| `--insecure-http-parser` | Accepts invalid header values, invalid HTTP versions, `Transfer-Encoding` *and* `Content-Length` together, `\n` as a separator, extra data after a `Connection: close` message, and more. The docs state plainly that this exposes you to request smuggling and cache poisoning. | Only behind a strict reverse proxy that has already normalised the request, and only to talk to one known-broken upstream. |
| `--no-warnings` / `NODE_NO_WARNINGS=1` | Silences *all* process warnings, including deprecations and the "MaxListenersExceededWarning" that is telling you about a memory leak. You will find out about a removed API when production breaks. | Never as a blanket setting. Use `--disable-warning=<code>` for the one warning you have actually investigated. |
| `--tls-min-v1.0` / `--tls-min-v1.1` | Re-enables TLS versions with known practical attacks, for every connection the process makes. | A dedicated, short-lived process talking to one legacy peer, with a deletion date. |
| `--openssl-legacy-provider` | Re-enables ciphers and digests OpenSSL 3 removed for good reason (MD4, RC4, and similar). | Decrypting archival data during a one-off migration. |
| `--disable-warning=...` | Safe when scoped to a code, dangerous when used to blanket a whole *type* such as `DeprecationWarning`. | Silencing one known, tracked warning. |
| `--allow-child-process`, `--allow-addons`, `--allow-ffi` | Under the permission model, each of these hands out a route around the sandbox: a child process does not inherit the parent's restrictions, and native code is not policed at all. | Only when the workload genuinely requires it, and after `--permission-audit` has shown you it does. |
| `--inspect=0.0.0.0:9229` | The inspector grants full control of the process — arbitrary code execution, memory read, file access. Binding it publicly is a remote shell. | Bind to `127.0.0.1` and use SSH port forwarding. In production also set `--disable-sigusr1`. |
| `--tls-keylog=file` | Writes the session keys needed to decrypt your TLS traffic to a plain file. | Local debugging in Wireshark, on a machine with no production data. |
| `--unhandled-rejections=none` | Turns an unhandled rejection into complete silence. A half-finished transaction now looks like success. | None. If you cannot fix the rejections, use `warn-with-error-code` so the exit code still reflects reality. |
| `--expose-gc` | Lets any code in the process — including a compromised dependency — force a full GC on demand. | Benchmarks and leak tests. |
| `--test-force-exit` | Makes a suite that leaks handles look green. The leak is still there in production. | As a temporary unblock, with a ticket. |
| `NODE_SKIP_PLATFORM_CHECK=1` | Runs Node on a platform it was not validated on. Failures will not be fixed. | Experimentation only. |

---

## Where to go next

- [Appendix B — Environment Variable Reference](b-environment-variables.md) — the
  variable side of the same configuration surface, including precedence rules.
- [Appendix D — Deprecation Index](d-deprecations.md) — what
  `--pending-deprecation` and `--trace-deprecation` will show you.
- [Chapter 3 — Running Code: Scripts, the CLI, and the REPL](../part1-foundations/03-running-code-cli-repl.md)
- [Chapter 31 — The Permission Model](../part4-system/31-permission-model.md)
- [Chapter 50 — Diagnostic Reports, Heap Snapshots, and V8 Tooling](../part7-diagnostics/50-reports-and-heap.md)
- [Chapter 60 — Deployment, Containers, and Configuration](../part9-production/60-deployment-and-config.md)
- [Chapter 61 — Performance Tuning](../part9-production/61-performance-tuning.md)
- Official reference: <https://nodejs.org/docs/latest/api/cli.html>
