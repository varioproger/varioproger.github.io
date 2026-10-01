---
chapter: "B"
part: "Appendices"
title: "Environment Variable Reference"
level: intermediate
reading_time: "25 min"
prerequisites: [8, 60]
source_docs:
  - "doc/api/cli.md"
  - "doc/api/environment_variables.md"
  - "doc/api/repl.md"
  - "doc/api/http.md"
  - "doc/api/util.md"
  - "doc/api/test.md"
  - "doc/api/cluster.md"
  - "doc/api/child_process.md"
  - "doc/api/debugger.md"
source_url: "https://nodejs.org/docs/latest/api/cli.html#environment-variables"
node_baseline: "27.0.0-pre"
---

# Appendix B — Environment Variable Reference

## How to use this appendix

Environment variables are how you configure a Node process you did not launch
yourself: a container, a serverless runtime, a CI job, a `npm` script written by
someone else. They are also the configuration surface most likely to be set once
by someone who has left the company and never questioned again.

This appendix lists every variable **Node itself reads** — including the ones
that come from libuv, V8 and OpenSSL rather than Node proper — grouped by what
they affect. For each: what it does, the default, and the practical note the
official list does not give you.

Two things to keep in mind throughout:

- **Node reads most of these once, at startup.** Setting
  `process.env.UV_THREADPOOL_SIZE` in your code does nothing, because the
  threadpool was created before your first line ran. The docs say so explicitly
  for `UV_THREADPOOL_SIZE`; the same reasoning applies to `NODE_OPTIONS`,
  `NODE_ICU_DATA`, `NODE_EXTRA_CA_CERTS` and the rest of the startup group.
  `TZ` is the notable exception — see B.4.
- **`process.env` is not a config system.** These variables configure the
  *runtime*. Your application's own configuration deserves validation, defaults
  and a schema. See [Chapter 60](../part9-production/60-deployment-and-config.md).

`.env` files are a separate mechanism — `--env-file` and `process.loadEnvFile()`
populate `process.env` before your code runs, and Node applies any Node-level
variables it finds there. Details in [Chapter 8](../part1-foundations/08-globals-and-environment.md).

---

## B.1 Startup and CLI options

| Variable | Effect | Default | Note |
|---|---|---|---|
| `NODE_OPTIONS` | A space-separated list of CLI flags applied before the command line. | unset | The single most useful variable here. Only allow-listed flags work; anything that would supply a program (a script path, `-e`, `-p`, `--run`) makes Node exit with an error. See [Appendix A §A.13](a-cli-flags.md#a13-node_options-what-is-and-is-not-allowed). |
| `NODE_SKIP_PLATFORM_CHECK` | When `1`, skips the supported-platform check at startup. | unset | Node "might not execute correctly" and issues found on unsupported platforms will not be fixed. Experimentation only. |
| `NODE_RUN_SCRIPT_NAME` | Set *by* Node when running a script via `--run`; holds the script name. | set by `--run` | Read-only from your point of view — useful for a shared build script that must know how it was invoked. |
| `NODE_RUN_PACKAGE_JSON_PATH` | Set *by* Node via `--run`; path of the `package.json` in use. | set by `--run` | Lets a script resolve paths relative to the package root, not the cwd. |

---

## B.2 Module loading, resolution and the compile cache

| Variable | Effect | Default | Note |
|---|---|---|---|
| `NODE_PATH` | Colon-separated (semicolon on Windows) list of directories prepended to the module search path. | unset | **[Legacy]** A relic of pre-`node_modules` resolution. It makes builds non-reproducible: the same code resolves differently on two machines. Use `"imports"` in `package.json` instead ([Chapter 6](../part1-foundations/06-packages-and-exports.md)). Disable the mechanism entirely with `--no-global-search-paths`. |
| `NODE_PRESERVE_SYMLINKS` | When `1`, resolves modules by symlink path rather than real path. | unset | Equivalent to `--preserve-symlinks`. Turn it on for monorepos and `npm link` workflows where the same package would otherwise load twice under two identities. |
| `NODE_COMPILE_CACHE=dir` | Enables the on-disk V8 code cache in `dir`. | unset (disabled) | Real startup savings for large dependency trees — the compile step is skipped on subsequent runs. Give it a writable, persistent directory; a container layer that is discarded each run buys you nothing. |
| `NODE_COMPILE_CACHE_PORTABLE` | When `1`, the compile cache can be reused across directory locations as long as the module layout relative to the cache directory is unchanged. | unset | The flag that makes a compile cache survive being baked into an image and mounted somewhere else. |
| `NODE_DISABLE_COMPILE_CACHE` | When `1`, disables the compile cache. **[Stability 1.1 — Active development]** | unset | The override for a wrapper script that enables the cache for everything. |

---

## B.3 Debugging, warnings and tracing

| Variable | Effect | Default | Note |
|---|---|---|---|
| `NODE_DEBUG=mod[,…]` | Comma-separated list of core modules that print debug output to stderr. | unset | Node's oldest and still best debugging trick. `NODE_DEBUG=net,http,stream` explains a hanging socket faster than a debugger. Wildcards work (`NODE_DEBUG=foo*`), and `util.debuglog()` lets your own modules join the same scheme ([Chapter 51](../part7-diagnostics/51-console-and-logging.md)). |
| `NODE_DEBUG_NATIVE=mod[,…]` | Same, for Node's internal C++ modules. | unset | Only useful when debugging Node or a native addon. |
| `NODE_NO_WARNINGS` | When `1`, silences all process warnings. | unset | Equivalent to `--no-warnings`. **This hides deprecation warnings and leak warnings too.** Prefer `--disable-warning=<code>` for the one warning you have actually investigated. |
| `NODE_PENDING_DEPRECATION` | When `1`, emits pending deprecation warnings. | unset | Equivalent to `--pending-deprecation`. Run your test suite with this set before any major upgrade — see [Appendix D](d-deprecations.md). |
| `NODE_REDIRECT_WARNINGS=file` | Appends process warnings to a file instead of stderr. | unset | Equivalent to `--redirect-warnings`. Keeps deprecation noise out of application logs without silencing it. Falls back to stderr if the write fails. |
| `NODE_V8_COVERAGE=dir` | Writes V8 coverage and source-map data as JSON into `dir`. | unset | Propagates automatically to child processes spawned via `child_process`, which is exactly what you want for an integration suite. Set it to the empty string in a child to stop propagation. |
| `NODE_INSPECT_RESUME_ON_START` | When `1`, `node inspect` resumes immediately instead of breaking on the first line. | unset | Convenience for the built-in CLI debugger ([Chapter 47](../part7-diagnostics/47-debugging.md)). |
| `NODE_CHANNEL_FD` | Set *by* Node on a child created with an IPC channel; holds the channel's file descriptor. | set by `fork()` | Do not set it yourself. Its presence is how a child knows `process.send()` is available ([Chapter 28](../part4-system/28-child-processes.md)). |
| `NODE_UNIQUE_ID` | Set *by* the cluster primary on each worker. | set by `cluster` | Its presence is how `cluster.isWorker` is decided. Setting it manually in a non-cluster process will confuse libraries that check it. |

---

## B.4 ICU, locale and time

| Variable | Effect | Default | Note |
|---|---|---|---|
| `TZ` | The process timezone, as an IANA timezone ID such as `Etc/UTC`, `Europe/Paris`, `America/New_York`. | inherited from the OS | **Set this explicitly to `Etc/UTC` in every container.** A host that quietly runs on local time will produce dates that are correct in staging and wrong in production. Unusually for this list, `TZ` can be changed at runtime: assigning `process.env.TZ` changes the timezone on POSIX systems (since v13.0.0) and on Windows (since v16.2.0). Abbreviations and aliases may work but the docs discourage them and do not guarantee them. |
| `NODE_ICU_DATA=file` | Path to ICU data, extending the linked-in data on small-icu builds. | unset | Only relevant if your build has partial ICU. Check with `node -p "process.versions.icu"` and `node -p "typeof Intl"`. Overridden by `--icu-data-dir`. See [Chapter 17](../part3-data/17-encodings.md). |

---

## B.5 Colour and terminal output

Three variables interact here, and the precedence is worth memorising because it
is the opposite of what most people assume.

| Variable | Effect | Default | Note |
|---|---|---|---|
| `FORCE_COLOR` | Forces colour on: `1`, `true` or `''` for 16 colours, `2` for 256, `3` for 16 million. Any other value disables colour. | unset | **`FORCE_COLOR` wins.** When it is set to a supported value, both `NO_COLOR` and `NODE_DISABLE_COLORS` are ignored. Use it in CI systems that capture output through a pipe but render ANSI codes in their web UI. |
| `NO_COLOR` | Any value disables colour. An alias for `NODE_DISABLE_COLORS`. | unset | The cross-tool convention (see <https://no-color.org>). Honour it in your own CLI output too. |
| `NODE_DISABLE_COLORS` | When set, the REPL does not use colour. | unset | Node's own older spelling of the same idea. |

If you are producing structured logs, do not rely on these at all — detect
`process.stdout.isTTY` and emit JSON when it is false.

---

## B.6 TLS, certificates and OpenSSL

| Variable | Effect | Default | Note |
|---|---|---|---|
| `NODE_EXTRA_CA_CERTS=file` | Extends the trusted root CAs with one or more PEM certificates from `file`. | unset | The correct way to trust a corporate or internal CA. A missing or malformed file produces one warning and is otherwise ignored — check for that warning, or you will be debugging a trust failure that is really a typo. **It is ignored entirely if the file's `ca` option is set explicitly on the client or server**, and ignored when Node runs setuid root or with Linux file capabilities. |
| `NODE_USE_SYSTEM_CA` | When `1`, also trusts the OS certificate store. | unset | Equivalent to `--use-system-ca`; the flag wins if both are set. On Windows and macOS this reads the platform store; elsewhere it reads OpenSSL's directories and caches the result. This plus `NODE_EXTRA_CA_CERTS` is the answer to "self-signed certificate in certificate chain" — not disabling verification. |
| `NODE_TLS_REJECT_UNAUTHORIZED` | When `0`, disables certificate validation for all TLS connections. | `1` (validation on) | **The most dangerous variable in this appendix.** It makes TLS and HTTPS insecure process-wide, silently, with no error to alert you. Never set it outside a throwaway experiment. See §B.10. |
| `SSL_CERT_FILE=file` | With `--use-openssl-ca` (or `--use-system-ca` outside macOS/Windows), overrides OpenSSL's trusted-certificates file. | OpenSSL default | Inherited by child processes unless you scrub the environment — so a child that uses OpenSSL trusts the same CAs as your Node process. |
| `SSL_CERT_DIR=dir` | The directory form of the above. | OpenSSL default | Same inheritance caveat. |
| `OPENSSL_CONF=file` | Loads an OpenSSL configuration file at startup. | platform default | Used for FIPS setup. **Ignored if `--openssl-config` is passed** — the flag wins. |

See [Chapter 37 — TLS and HTTPS](../part5-networking/37-tls-https.md) and
[Chapter 42](../part6-security/42-crypto-encryption.md).

---

## B.7 Proxies

Node gained built-in proxy support recently; before that, these variables did
nothing unless a userland HTTP client read them.

| Variable | Effect | Default | Note |
|---|---|---|---|
| `NODE_USE_ENV_PROXY` | When `1`, Node parses the proxy variables below at startup and routes requests through them. **[Stability 1.1 — Active development]** | unset | Equivalent to `--use-env-proxy`. Nothing below takes effect in core without this (or an explicit `proxyEnv` option on an agent). |
| `HTTP_PROXY` / `http_proxy` | Proxy URL for HTTP requests. | unset | If both are set, the lowercase `http_proxy` takes precedence. |
| `HTTPS_PROXY` / `https_proxy` | Proxy URL for HTTPS requests. | unset | Lowercase wins, as above. |
| `NO_PROXY` / `no_proxy` | Comma-separated hosts that bypass the proxy. | unset | Lowercase wins. Always include `localhost,127.0.0.1` and your service-mesh hostnames. |

The documentation is unusually blunt about the security model here, and it is
worth repeating: proxy support exists to get through a firewall, not to hide
traffic. A proxy sees all connection metadata, and sees full request and
response bodies for plain HTTP or wherever it terminates TLS. Configure only
proxies you control or trust. Requests to a Unix domain socket ignore proxy
settings entirely.

See [Chapter 36 — HTTP/1.1 Clients, Agents, and Keep-Alive](../part5-networking/36-http-clients.md).

---

## B.8 Threadpool and performance

| Variable | Effect | Default | Note |
|---|---|---|---|
| `UV_THREADPOOL_SIZE` | Number of threads in libuv's threadpool. | `4` | This is the variable behind most mysterious latency cliffs. Everything in the following list shares those four threads: **all async `fs` APIs** (except the watchers and the explicitly synchronous ones), **`dns.lookup()`**, **all async `zlib`**, and the async crypto APIs — `crypto.pbkdf2()`, `crypto.scrypt()`, `crypto.randomBytes()`, `crypto.randomFill()`, `crypto.generateKeyPair()`. One slow `scrypt` call blocks four unrelated file reads. Raise it (16–32 is common on I/O-heavy servers) and measure. **Setting `process.env.UV_THREADPOOL_SIZE` from inside the process is not guaranteed to work**, because the pool is created during runtime initialisation, before your code runs — set it in the environment. |
| `NODE_PENDING_PIPE_INSTANCES` | Number of pending pipe instance handles a pipe server keeps waiting for connections. Windows only. | libuv default | Raise it only if a Windows named-pipe server is dropping connections under burst load. |

`dns.lookup()` deserves a specific warning: it is the only DNS call in Node that
uses the threadpool (the `dns.resolve*` family does not), and it is what `http`,
`https` and `net` call by default. A DNS server that answers slowly will
therefore starve your file I/O. See [Chapter 34](../part5-networking/34-dns.md)
and [Chapter 9](../part2-async/09-event-loop.md).

---

## B.9 REPL, test runner and miscellany

**REPL** (see [Chapter 3](../part1-foundations/03-running-code-cli-repl.md))

| Variable | Effect | Default | Note |
|---|---|---|---|
| `NODE_REPL_HISTORY=file` | Where persistent REPL history is stored. | `~/.node_repl_history` | Set it to `''` to disable history. On Windows an empty value is invalid, so use one or more spaces instead. Disable it on shared or recorded terminals — REPL history captures whatever you pasted, including credentials. |
| `NODE_REPL_HISTORY_SIZE` | How many lines of history to persist. | `1000` | Must be a positive number. |
| `NODE_REPL_MODE` | `'sloppy'` or `'strict'`. | `'sloppy'` | `'strict'` makes the REPL behave like a module, which is usually what you actually want when testing a snippet. The old `'magic'` value is gone (DEP0065, End-of-Life). |
| `NODE_REPL_EXTERNAL_MODULE=file` | Loads a module in place of the built-in REPL. | unset | For shipping a custom REPL. An empty string restores the built-in one. |
| `NODE_NO_READLINE` | When `1`, starts the REPL in canonical terminal mode. | unset | The prerequisite for wrapping Node in `rlwrap`. |

**Test runner** (see [Chapter 45](../part7-diagnostics/45-test-runner.md))

| Variable | Effect | Default | Note |
|---|---|---|---|
| `NODE_TEST_CONTEXT` | When `'child'`, reporter options are overridden and output is TAP on stdout. | set by the runner | Set by Node when it spawns a test file under process isolation. Any other value gives no guarantee about reporter format or stability — do not build tooling on it. |
| `NODE_TEST_WORKER_ID` | Identifies the worker running a test file; used to derive a per-worker port or database name. | set by the runner | Read it to give each concurrently running test file its own resources instead of fighting over one. |

**Legacy and removed**

| Variable | Status |
|---|---|
| `NODE_REPL_HISTORY_FILE` | Removed. DEP0041, **End-of-Life**. Use `NODE_REPL_HISTORY`. |
| `NODE_REPL_MODE=magic` | Removed. DEP0065, **End-of-Life**. Use `sloppy` or `strict`. |

---

## B.10 Precedence: flags, `NODE_OPTIONS`, and environment variables

There is no single global rule, so learn the three that exist.

**1. Command line beats `NODE_OPTIONS`.** `NODE_OPTIONS` is parsed first, so a
singleton flag given on the command line overrides the same flag from the
environment:

```bash
# Listens on 5555.
NODE_OPTIONS='--inspect=localhost:4444' node --inspect=localhost:5555 app.js
```

For repeatable flags there is no overriding — `NODE_OPTIONS` entries are simply
placed first:

```bash
NODE_OPTIONS='--require "./a.js"' node --require "./b.js" app.js
# runs ./a.js, then ./b.js
```

**2. For a flag/variable pair, the flag usually wins.** Where Node offers both a
CLI flag and an environment variable for the same setting, the flag takes
precedence. The documented cases:

| Flag | Variable | Winner |
|---|---|---|
| `--icu-data-dir` | `NODE_ICU_DATA` | flag |
| `--openssl-config` | `OPENSSL_CONF` | flag |
| `--use-system-ca` | `NODE_USE_SYSTEM_CA` | flag |
| `--redirect-warnings` | `NODE_REDIRECT_WARNINGS` | equivalent; either works |
| `--pending-deprecation` | `NODE_PENDING_DEPRECATION=1` | equivalent; either works |
| `--no-warnings` | `NODE_NO_WARNINGS=1` | equivalent; either works |
| `--preserve-symlinks` | `NODE_PRESERVE_SYMLINKS=1` | equivalent; either works |
| `--use-env-proxy` | `NODE_USE_ENV_PROXY=1` | equivalent; either works |

There is one important exception in the other direction:
`--dns-result-order` sets a *default*, and the runtime API
`dns.setDefaultResultOrder()` overrides the flag.

**3. The real environment beats `.env` files.** When `--env-file` loads a
variable that is already present in the process environment, the existing
environment value wins. This is deliberate: a `.env` file checked into a repo
must never override what an orchestrator injected. Note also that variables
loaded from an `--env-file` are **not** passed to the command run by `--run`.

**Colour is the odd one out.** `FORCE_COLOR` beats both `NO_COLOR` and
`NODE_DISABLE_COLORS`, which is the reverse of the usual "explicit disable wins"
instinct.

**A practical ordering to reason with**, from lowest to highest authority:

1. Node's compiled-in defaults
2. Values from a `.env` file loaded by `--env-file`
3. Real environment variables (including `NODE_OPTIONS` contents)
4. Command-line flags
5. Runtime API calls (`dns.setDefaultResultOrder()`, `crypto.setFips()`, and
   friends)

---

## B.11 The variables that will hurt you

| Variable | Why it is dangerous | What to do instead |
|---|---|---|
| `NODE_TLS_REJECT_UNAUTHORIZED=0` | Disables certificate validation for every TLS connection in the process, with no warning at the call site. An attacker on the path reads and rewrites your traffic and nothing looks wrong. | `NODE_EXTRA_CA_CERTS` for an internal CA; `NODE_USE_SYSTEM_CA=1` behind an inspecting proxy; an explicit `ca` option for one specific client. |
| `NODE_NO_WARNINGS=1` | Silences deprecations and leak warnings along with the noise. The next major upgrade breaks without notice. | `--disable-warning=<code>` for one investigated warning; `NODE_REDIRECT_WARNINGS=file` to move the noise elsewhere. |
| `NODE_OPTIONS` set globally on a host | Applies to *every* Node process on the machine, including package managers and build tools. A `--require` here is executed by everything. | Scope it to the service — a systemd unit, a container `ENV`, a `docker run -e`. |
| `NODE_PATH` | Makes resolution depend on machine state. Works locally, fails in CI, or worse, silently loads a different version. | `"imports"` in `package.json`; workspaces; `--no-global-search-paths` to prove nothing relies on it. |
| `NODE_SKIP_PLATFORM_CHECK=1` | Runs Node where it was never validated. Bugs found there will not be fixed. | Use a supported platform. |
| `NODE_EXTRA_CA_CERTS` pointing at a missing file | Produces one warning and is then ignored. If you also set `NODE_NO_WARNINGS`, you get a trust failure with no explanation at all. | Check the path exists at container build time. |
| `UV_THREADPOOL_SIZE` set very high | Threads are not free. Hundreds of threads cost memory and context switching, and will not speed up work that is actually CPU-bound. | Measure first. If the work is CPU-bound, use worker threads ([Chapter 29](../part4-system/29-worker-threads.md)). |
| Secrets in `process.env` | They appear in diagnostic reports by default, in `/proc/<pid>/environ` on Linux, and in any crash dump you ship to a vendor. | Pass `--report-exclude-env`, read secrets from a file or a secret manager, and delete them from `process.env` after loading. |

---

## Where to go next

- [Appendix A — CLI Flag Reference](a-cli-flags.md) — the flag side of the same
  surface, including the full `NODE_OPTIONS` allow-list discussion.
- [Chapter 8 — Globals and the Runtime Environment](../part1-foundations/08-globals-and-environment.md)
- [Chapter 25 — The Process Object](../part4-system/25-process-object.md)
- [Chapter 60 — Deployment, Containers, and Configuration](../part9-production/60-deployment-and-config.md)
- [Chapter 44 — Securing Node.js Applications](../part6-security/44-securing-applications.md)
- Official reference: <https://nodejs.org/docs/latest/api/cli.html#environment-variables>
  and <https://nodejs.org/docs/latest/api/environment_variables.html>
