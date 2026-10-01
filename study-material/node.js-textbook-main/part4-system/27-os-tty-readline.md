---
chapter: 27
part: "Part IV — System Interfaces"
title: "OS Information, TTY, and Readline"
level: intermediate
reading_time: "30 min"
prerequisites: [25]
source_docs:
  - "doc/api/os.md"
  - "doc/api/tty.md"
  - "doc/api/readline.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/os.html"
node_baseline: "27.0.0-pre"
---

# Chapter 27 — OS Information, TTY, and Readline

**What you will learn**

- Query the host with `node:os`, and recognise which of its answers are wrong inside a container.
- Size a worker pool correctly with `os.availableParallelism()` instead of `os.cpus().length`.
- Detect a terminal, read its size, react to resizes, and decide whether to emit colour.
- Explain what raw mode changes and why it disables `Ctrl+C`.
- Read a file line by line with `readline`, including the `crlfDelay` detail that matters on Windows.
- Build an interactive prompt that behaves correctly when interrupted and when its input is piped.

**Why this matters**

These three modules are what makes a Node program feel like a native tool rather than a script. `node:os` answers "where am I running"; `node:tty` answers "is a human watching"; `node:readline` answers "what did they type". Get them right and your CLI adapts: colour in a terminal, plain text in a log file, a prompt for a human, stdin for a pipe.

Get them wrong and the failures are specific and annoying. A CLI that emits ANSI escape codes into a CI log makes it unreadable. A tool that blocks waiting for input that will never come hangs a build. A worker pool sized from `os.cpus().length` spawns 64 threads inside a container limited to two cores, and spends its life context-switching. All three of those are one-line fixes if you know which line.

## `node:os`: describing the host

```mjs
import os from 'node:os';
```

The module is a thin wrapper over libuv's platform layer. Nearly everything is a synchronous function that returns a snapshot.

### Identity

| Call | Returns | Notes |
|---|---|---|
| `os.platform()` | `'aix'`, `'darwin'`, `'freebsd'`, `'linux'`, `'openbsd'`, `'sunos'`, `'win32'` | Set at **compile time**; identical to `process.platform`. `'android'` is possible on experimental Android builds |
| `os.type()` | The `uname(3)` name: `'Linux'`, `'Darwin'`, `'Windows_NT'` | The one that surprises people — macOS is `'Darwin'`, Windows is `'Windows_NT'` |
| `os.arch()` | `'arm'`, `'arm64'`, `'ia32'`, `'loong64'`, `'mips'`, `'mipsel'`, `'ppc64'`, `'riscv64'`, `'s390x'`, `'x64'` | Equivalent to `process.arch` |
| `os.release()` | Kernel release string | `uname(3)` on POSIX, `GetVersionExW()` on Windows |
| `os.version()` | Kernel version string (v13.11.0 / v12.17.0) | `RtlGetVersion()` on Windows, falling back to `GetVersionExW()` |
| `os.machine()` | Machine type: `'x86_64'`, `'aarch64'`, `'arm64'`, `'i686'`… (v18.9.0 / v16.18.0) | The raw hardware name, unlike `arch()` which reports what Node was *built* for |
| `os.endianness()` | `'BE'` or `'LE'` | Also compile-time |
| `os.hostname()` | The host name | Inside a container this is the container ID unless overridden |

The distinction between `os.platform()` and `os.type()` matters when writing conditionals. Test `os.platform() === 'win32'` — never `'windows'`, which is not a value Node produces. For Apple hardware, `os.arch()` is `'arm64'` on Apple Silicon while `os.machine()` reports `'arm64'` too, but under Rosetta a Node built for x64 reports `arch() === 'x64'` and `machine() === 'x86_64'`.

### CPUs, and the pool-sizing trap

`os.cpus()` returns an array with one object per **logical** core:

```js
[
  {
    model: 'Intel(R) Core(TM) i7 CPU 860 @ 2.80GHz',
    speed: 2926,                 // MHz
    times: { user: 252020, nice: 0, sys: 30340, idle: 1070356870, irq: 0 },
  },
  // ...
]
```

The `times` fields are **cumulative milliseconds since boot** that the core has spent in each mode — not percentages, and not a rate. To get utilisation you must sample twice and take the difference:

```js
import os from 'node:os';

function snapshot() {
  return os.cpus().map((c) => c.times);
}

function utilisation(before, after) {
  return before.map((b, i) => {
    const a = after[i];
    const idle = a.idle - b.idle;
    const total = (a.user - b.user) + (a.nice - b.nice) +
                  (a.sys - b.sys) + idle + (a.irq - b.irq);
    return total === 0 ? 0 : 1 - idle / total;
  });
}

const before = snapshot();
setTimeout(() => console.log(utilisation(before, snapshot())), 1000);
```

Two caveats. The `nice` field is POSIX-only; on Windows it is always `0`. And the array can be **empty** when CPU information is unavailable — for example when `/proc` is not mounted — so `os.cpus()[0].model` is not safe.

Now the important part. **Do not use `os.cpus().length` to size a worker pool.** The docs say so explicitly, and the reason is that it counts the *machine's* logical cores, ignoring CPU affinity masks and container CPU quotas. A pod limited to 2 cores on a 64-core node still sees 64 entries. Sizing a `worker_threads` pool or a `cluster` fleet from that number gives you 64 workers fighting over 2 cores' worth of quota: more memory, more context switches, worse latency, no more throughput.

```mjs
import { availableParallelism } from 'node:os';

const workers = availableParallelism();   // ✅ affinity- and quota-aware
```

`os.availableParallelism()` (v19.4.0 / v18.14.0) wraps libuv's `uv_available_parallelism()` and returns an estimate of the parallelism a program should use, always greater than zero. It is the correct default for worker pools, cluster sizing, and concurrency limits.

### Memory, and why it lies in a container

`os.totalmem()` returns total system memory in bytes; `os.freemem()` returns free system memory in bytes. Both report **the host**, not your container.

This is the single most common sizing bug in containerised Node. Memory limits in Docker and Kubernetes are implemented with cgroups, which constrain what your process may use but do not change what `sysinfo(2)` reports. So a pod with a 512 MB limit running on a 128 GB node sees `os.totalmem() === 137438953472`. A cache that sizes itself at "25% of system memory" allocates 32 GB, blows through the cgroup limit, and the container is `SIGKILL`ed — exit code 137, no stack trace, no clue.

Use the process-level, cgroup-aware calls from Chapter 25 instead:

```mjs
import { constrainedMemory, availableMemory } from 'node:process';
import { totalmem } from 'node:os';

// constrainedMemory() returns 0 when there is no limit or it is unknown.
const budget = constrainedMemory() || totalmem();
const cacheBytes = Math.floor(budget * 0.25);
```

Both `process.constrainedMemory()` and `process.availableMemory()` became stable in v24.0.0 / v22.16.0.

`os.loadavg()` has the same problem plus one of its own. It returns `[oneMinute, fiveMinute, fifteenMinute]` load averages — a Unix-specific concept describing the *host*, and **on Windows it always returns `[0, 0, 0]`**. Any autoscaling or shedding logic built on it is both container-blind and silently inert on Windows. For "is this process busy", use `perf_hooks`' event loop utilisation (Chapter 49) or `process.cpuUsage()`.

`os.uptime()` is system uptime in seconds — the *host's*, not your process's. For process age use `process.uptime()`.

### Paths, users, and network

| Call | Returns | Notes |
|---|---|---|
| `os.tmpdir()` | Temp directory, no trailing slash | Overridden by `TMPDIR`, then `TMP`, then `TEMP` on POSIX; by `TEMP` then `TMP` on Windows, defaulting to `%SystemRoot%\temp` |
| `os.homedir()` | Home directory | Uses `$HOME` on POSIX (else the effective UID lookup), `USERPROFILE` on Windows (else the profile path) |
| `os.userInfo([options])` | `{ username, uid, gid, shell, homedir }` | On Windows `uid` and `gid` are `-1` and `shell` is `null`. Pass `{ encoding: 'buffer' }` to get `Buffer`s. Throws a `SystemError` if the user has no username or homedir |
| `os.devNull` | `'/dev/null'`, or `'\\\\.\\nul'` on Windows | v16.3.0 / v14.18.0 |
| `os.EOL` | `'\n'` on POSIX, `'\r\n'` on Windows | See the warning below |
| `os.networkInterfaces()` | Interface name → array of address objects | See below |
| `os.getPriority([pid])` / `os.setPriority([pid, ]priority)` | Scheduling priority, `-20` (high) to `19` (low) | Mapped to six Windows priority classes; prefer the `os.constants.priority` constants |

`os.homedir()` and `os.userInfo().homedir` are not the same thing. `homedir()` consults environment variables first and falls back to the OS; `userInfo().homedir` is whatever the OS says. When they disagree — a `sudo` invocation, a service account, a container with a stale `HOME` — you usually want `os.homedir()`, because it respects what the user configured.

**`os.EOL` is a trap in file formats.** It describes *this machine*, so writing a file with `os.EOL` on Windows produces CRLF, and the same program on Linux produces LF. For a data format read by other programs, or a file committed to git, hard-code `'\n'`. Reserve `os.EOL` for text written to the local console.

`os.networkInterfaces()` returns an object keyed by interface name, where each value is an array of assigned addresses with `address`, `netmask`, `family` (**the string `'IPv4'` or `'IPv6'`**), `mac`, `internal`, `cidr`, and — for IPv6 only — `scopeid`. The `family` type has moved twice: it was a string, became a number in v18.0.0, and went back to a string in v18.4.0. If you support older runtimes, compare defensively. To find a machine's routable address, filter on `internal === false`:

```mjs
import { networkInterfaces } from 'node:os';

const external = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i.family === 'IPv4' && !i.internal)
  .map((i) => i.address);
```

### `os.constants`

`os.constants` exposes platform constants in four groups: `os.constants.signals` (`SIGINT`, `SIGTERM`, `SIGUSR1`, `SIGWINCH`, `SIGCHLD`, and the rest), `os.constants.errno` (POSIX codes such as `ENOENT` and `EACCES`, plus Windows-specific `WSA*` codes), `os.constants.priority` (`PRIORITY_LOW` through `PRIORITY_HIGHEST`), and `os.constants.dlopen` plus a small set of libuv constants such as `UV_UDP_REUSEADDR`. **Not all constants exist on every platform** — always check for presence before using one.

The signal numbers are what turn an exit code back into a cause:

```mjs
import { constants } from 'node:os';

function describeExit(code) {
  if (code <= 128) return `exit ${code}`;
  const num = code - 128;
  const name = Object.keys(constants.signals).find((k) => constants.signals[k] === num);
  return `killed by ${name ?? `signal ${num}`}`;
}

describeExit(137);   // 'killed by SIGKILL'
```

## `node:tty`: is a human watching?

You will rarely construct anything from `node:tty` yourself. When Node detects a terminal on a standard descriptor, it initialises `process.stdin` as a `tty.ReadStream` and `process.stdout`/`process.stderr` as `tty.WriteStream`s automatically. Both classes extend `net.Socket`.

### Detection

```js
const interactive = Boolean(process.stdout.isTTY);
```

`isTTY` is `true` on TTY streams and **absent** (hence `undefined`) otherwise, so always coerce. `tty.isatty(fd)` answers the same question for an arbitrary descriptor, returning `false` for anything that is not a non-negative integer.

Check the *right* stream. Colour on stdout should depend on `process.stdout.isTTY`; a progress indicator you write to stderr should depend on `process.stderr.isTTY`; whether to prompt should depend on `process.stdin.isTTY`. They differ constantly — `node app.js | less` leaves stdin and stderr as TTYs while stdout is a pipe.

### Size and resize

`writeStream.columns` and `writeStream.rows` hold the current terminal dimensions, and `writeStream.getWindowSize()` returns them as `[columns, rows]`. Both properties update when the terminal is resized, and the stream emits **`'resize'`** with no arguments:

```js
function render() {
  const width = process.stdout.columns ?? 80;
  process.stdout.write(`[${'='.repeat(Math.max(0, width - 2))}]\n`);
}

render();
process.stdout.on('resize', render);
```

Note the `?? 80` fallback: on a non-TTY, `columns` is `undefined`. Any layout code must handle that, because it is exactly what happens in CI.

The cursor-control methods — `cursorTo(x[, y][, callback])`, `moveCursor(dx, dy[, callback])`, `clearLine(dir[, callback])` with `dir` of `-1` (left), `1` (right) or `0` (whole line), and `clearScreenDown([callback])` — all return a boolean in the usual Writable sense: `false` means wait for `'drain'`. They exist on `tty.WriteStream`, and `node:readline` exposes stream-taking equivalents (`readline.cursorTo(stream, ...)` and friends) that work on any writable.

### Raw mode

`readStream.setRawMode(mode)` switches the input stream between line-buffered ("cooked") and character-at-a-time ("raw"). In raw mode:

- Input is delivered character by character, without waiting for Enter.
- The terminal's special processing is disabled, **including echo** — you must print what the user typed yourself.
- **`Ctrl+C` no longer produces `SIGINT`.** It arrives as the byte `0x03` in your input stream.

That last point is the one that strands people. If you enable raw mode and do not handle `0x03` yourself, the terminal becomes unquittable:

```js
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (buf) => {
  if (buf[0] === 0x03) {           // Ctrl+C
    process.stdin.setRawMode(false);
    process.exit(130);             // 128 + SIGINT(2)
  }
  process.stdout.write(`you pressed: ${JSON.stringify(buf.toString())}\n`);
});
```

`readStream.isRaw` reports the current mode. It is **always `false` when a process starts**, even if the terminal itself is already in raw mode, and only changes when `setRawMode()` is called. Restore cooked mode before exiting, or you leave the user's shell with no echo. On Windows, `setRawMode()` requires write permission to the console input buffer; when opening `"\\\\.\\CONIN$"` for a `new tty.ReadStream()`, use a read/write flag such as `'r+'`.

### Colour

Two methods answer the colour question. `writeStream.hasColors([count][, env])` returns whether the stream supports at least `count` colours (**default 16**, minimum 2). `writeStream.getColorDepth([env])` returns the bit depth: `1` for 2 colours, `4` for 16, `8` for 256, `24` for 16.7 million.

```js
if (process.stdout.hasColors(256)) {
  // safe to use a 256-colour palette
}
```

Both accept an `env` object (default `process.env`) so you can simulate a terminal in tests — `process.stdout.hasColors(2 ** 24, { TMUX: '1' })` returns `false`, because that environment claims only 256-colour support.

The documented environment controls are:

| Variable | Effect |
|---|---|
| `FORCE_COLOR=1`, `true`, or `''` | Force 16-colour support |
| `FORCE_COLOR=2` | Force 256 colours |
| `FORCE_COLOR=3` | Force 16.7 million colours |
| `FORCE_COLOR=`*anything else* | Colour disabled |
| `NO_COLOR=`*any value* | Disable colour (an alias for `NODE_DISABLE_COLORS`) |
| `NODE_DISABLE_COLORS=1` | Disable colour |

When `FORCE_COLOR` is set to a supported value, it **wins**: both `NO_COLOR` and `NODE_DISABLE_COLORS` are ignored. The docs are explicit that detection inspects other process and environment information too and can produce false positives or negatives, since environments "may lie about what terminal is used" — which is why the `env` override exists.

For actually emitting styled text, prefer `util.styleText(format, text)` over hand-written escape codes. It is aware of the terminal's capabilities and of `NO_COLOR`, `NODE_DISABLE_COLORS`, and `FORCE_COLOR`, and takes a `{ stream }` option so you can style stderr correctly (Chapter 51).

## `node:readline`: reading lines

There are two entry points. `node:readline/promises` is the modern one, stable since v24.0.0 / v22.17.0. `node:readline` is the callback API, still fully supported and still the right choice for the `'line'`-event style.

```mjs
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

const name = await rl.question('Your name? ');
console.log(`Hello, ${name}.`);
rl.close();
```

An interface holds the process open: **Node will not exit while an interface is open**, because it is waiting for data on `input`. Forgetting `rl.close()` is the classic "my script printed everything and then hung" bug. `rl[Symbol.dispose]()` (v23.10.0 / v22.15.0) is an alias for `close()`, so `using rl = createInterface(...)` closes it automatically where explicit resource management is available.

### `createInterface()` options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `input` | `stream.Readable` | — | **Required** |
| `output` | `stream.Writable` | — | Where prompts are written. `null`/`undefined` suppresses them |
| `terminal` | `boolean` | `output.isTTY` at construction | Treat streams as a TTY and emit ANSI/VT100 codes |
| `prompt` | `string` | `'> '` | Prompt string |
| `completer` | `Function` | — | Tab completion; may be async or return a promise |
| `history` | `string[]` | `[]` | Initial history. Only meaningful when `terminal` is true |
| `historySize` | `number` | `30` | Lines retained; `0` disables history |
| `removeHistoryDuplicates` | `boolean` | `false` | Drop the older copy when a line repeats |
| `crlfDelay` | `number` | `100` | See below |
| `escapeCodeTimeout` | `number` | `500` | How long to wait for an ambiguous key sequence to complete |
| `tabSize` | `integer` | `8` | Spaces per tab (minimum 1) |
| `signal` | `AbortSignal` | — | Aborting the signal calls `close()` on the interface |

### `crlfDelay`, and why Windows files need it

Readline emits `'line'` on `\n`, `\r`, or `\r\n`. To decide whether a `\r` followed by a `\n` is one line ending or two, it uses a timer: if more than `crlfDelay` milliseconds elapse between them, they count as two separate ends of line. The default is 100 ms, and the value is coerced to no less than 100.

For interactive input from a human that heuristic is right. For **a file with CRLF endings it is wrong**, because chunk boundaries and disk latency can put more than 100 ms between the `\r` and the `\n`, producing phantom blank lines. Since Windows text files routinely use CRLF, the fix is standard practice whenever the input is a file:

```mjs
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: createReadStream('access.log'),
  crlfDelay: Infinity,          // always treat \r\n as one line break
});

let lines = 0;
for await (const line of rl) {
  if (line.includes('POST')) lines++;
}
console.log(`${lines} POST requests`);
```

`crlfDelay: Infinity` means a `\r` followed by a `\n` is *always* a single newline. Use it for every file you read this way.

The `for await` form uses `rl[Symbol.asyncIterator]()`. Three properties are worth knowing. Breaking, throwing, or returning out of the loop calls `rl.close()`, so iterating always consumes the input stream fully. Errors on the input stream are **not** forwarded to the iterator — attach an `'error'` listener to the underlying stream if you need them. And the interface starts consuming input the moment it is created, so awaiting something between `createInterface()` and the loop can lose lines. For throughput-sensitive work the `'line'` event is faster than the async iterator.

### Questions, cancellation, and prompts

The promises API's `rl.question(query[, options])` resolves with the answer, and accepts an `AbortSignal`:

```mjs
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

try {
  const answer = await rl.question('Deploy to production? [y/N] ', {
    signal: AbortSignal.timeout(10_000),
  });
  if (!/^y(es)?$/i.test(answer.trim())) process.exitCode = 1;
} catch {
  console.error('\nno answer in 10s — aborting');
  process.exitCode = 1;
} finally {
  rl.close();
}
```

The callback API's `rl.question(query[, options], callback)` takes the same `signal` option, but note its callback receives only the answer — there is no error-first argument. Calling `question()` after `close()` rejects in the promises API and throws in the callback API.

For a REPL-style loop, use `rl.prompt()` and the `'line'` event, re-prompting after each command:

```mjs
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'app> ',
  historySize: 200,
  completer: (line) => {
    const commands = ['help', 'status', 'reload', 'quit'];
    const hits = commands.filter((c) => c.startsWith(line));
    return [hits.length ? hits : commands, line];
  },
});

rl.prompt();

rl.on('line', (line) => {
  const cmd = line.trim();
  if (cmd === 'quit') return rl.close();
  if (cmd) console.log(`unknown command: ${cmd}`);
  rl.prompt();
});

rl.on('close', () => {
  console.log('bye');
});
```

A `completer` returns `[matches, substringUsedForMatching]`. It may be `async` or return a promise in both APIs; the callback API also accepts a two-argument `(partial, callback)` form.

### Interruption and non-interactive input

Two behaviours make the difference between a toy prompt and a real one.

**`Ctrl+C`.** If no `'SIGINT'` listener is registered on the interface, `Ctrl+C` emits `'close'`. If you register one, you own the behaviour — the interface will not close by itself. `'SIGTSTP'` (`Ctrl+Z`) and `'SIGCONT'` are also available, and both are **not supported on Windows**. `Ctrl+D` on an empty line signals end of transmission and closes the interface too (the keybinding table notes it does not work on Windows).

**Piped input.** When your tool's stdin is not a TTY, there is no human to prompt. Prompting anyway either hangs forever (no input arrives) or silently consumes a line of data that was meant to be processed. Check first:

```mjs
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

async function confirm(message, { assumeYes = false } = {}) {
  if (assumeYes) return true;

  // Non-interactive: never block. Fail closed.
  if (!process.stdin.isTTY) {
    console.error(`${message} — refusing in non-interactive mode; pass --yes`);
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  rl.on('SIGINT', () => {           // Ctrl+C during the question
    rl.close();
    process.exit(130);
  });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
```

Two details in that function are deliberate. The prompt is written to **stderr**, so that `mytool | grep x` does not get the question mixed into its data. And the non-interactive path **fails closed** rather than assuming yes — a destructive default that only triggers in automation is exactly the wrong failure mode.

## Common mistakes

### ❌ Sizing a pool from `os.cpus().length`

```js
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';

const pool = Array.from({ length: cpus().length }, () => new Worker('./task.js'));
```

Inside a container limited to 2 CPUs on a 64-core host, this creates 64 workers. Each carries its own V8 isolate and heap, so memory multiplies, and 64 threads share 2 cores' worth of quota — throughput drops and latency rises. It also crashes if `cpus()` returns an empty array, which happens when `/proc` is unavailable.

```js
// ✅ Quota- and affinity-aware, and never zero.
import { availableParallelism } from 'node:os';
const pool = Array.from({ length: availableParallelism() }, () => new Worker('./task.js'));
```

### ❌ Budgeting memory from `os.totalmem()`

```js
import { totalmem } from 'node:os';
const cacheBytes = totalmem() * 0.25;
```

`totalmem()` reports the host's RAM, not your cgroup limit. On a 128 GB node with a 512 MB pod limit this reserves 32 GB, and the container is `SIGKILL`ed with exit code 137 — a crash with no stack trace and no application log.

```js
// ✅ Ask the process what it is actually allowed to use.
import { constrainedMemory } from 'node:process';
import { totalmem } from 'node:os';
const budget = constrainedMemory() || totalmem();   // 0 means "no known limit"
const cacheBytes = Math.floor(budget * 0.25);
```

### ❌ Reading a CRLF file without `crlfDelay: Infinity`

```js
const rl = createInterface({ input: createReadStream('windows-export.csv') });
for await (const line of rl) rows.push(parse(line));
```

When a chunk boundary or a slow disk separates the `\r` from the `\n` by more than the default 100 ms, readline treats them as two line endings and injects an empty line. The parse fails on a record that looks perfectly fine in an editor, and the bug is not reproducible on a fast machine.

```js
// ✅ Always pass crlfDelay: Infinity when the input is a file.
const rl = createInterface({
  input: createReadStream('windows-export.csv'),
  crlfDelay: Infinity,
});
```

### ❌ Prompting without checking `isTTY`

```js
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question('Overwrite existing data? [y/N] ');
```

Run from a cron job or a CI step, stdin is not a terminal. Either nothing ever arrives and the job hangs until its timeout, or — worse — the job was piped real data and `question()` swallows the first line of it as the answer.

```js
// ✅ Branch on interactivity, and offer an explicit flag for automation.
if (!process.stdin.isTTY) {
  if (!values.yes) throw new Error('non-interactive: pass --yes to confirm');
} else {
  /* prompt as above */
}
```

## Production notes

- **`availableParallelism()` is the only correct default for concurrency.** Use it for `worker_threads` pools, `cluster` worker counts, and parallel-task limits. Allow an environment-variable override so operators can tune without a redeploy.
- **Treat every `os` memory and load reading as host-level.** `totalmem()`, `freemem()`, `loadavg()`, and `uptime()` describe the machine, not your container. Export them as host context if you like, but never make sizing decisions from them.
- **Decide colour once, at startup, and thread it through.** Compute `useColor = process.stdout.hasColors() && !process.env.NO_COLOR` at boot rather than per line. Emitting ANSI into a CI log is a real cost: it makes failures harder to read at exactly the moment someone is under pressure.
- **Always restore cooked mode.** If you call `setRawMode(true)`, call `setRawMode(false)` on every exit path — including the signal handlers from Chapter 26. A crashed tool that leaves a terminal in raw mode leaves the user with no echo and no working `Ctrl+C`.
- **Write prompts and progress to stderr, data to stdout.** That single rule makes your tool composable in pipelines and keeps the interactive parts out of captured output.
- **For high-volume line processing, prefer the `'line'` event.** The docs note the async iterator does not match it for performance. For a log file with millions of lines the difference is measurable.
- **Guard `os.networkInterfaces()` results.** Interface names are not portable (`eth0`, `en0`, `Ethernet`), and a container may only have `lo`. Filter by `internal === false` and `family`, and handle the empty case.

## Exercises

1. **Host report.** Write `hostinfo.mjs` that prints platform, type, arch, machine, release, version, hostname, uptime, `availableParallelism()`, `totalmem()`, and `process.constrainedMemory()`. Run it on the host and inside a container with `--memory=256m --cpus=1`. *Success:* you can point to exactly which values changed and which did not, and explain why.

2. **CPU meter.** Build a program that samples `os.cpus()` twice a second and prints a per-core utilisation bar sized to `process.stdout.columns`, redrawing on `'resize'`. *Success:* the bars track a busy loop you start in another terminal, and the layout adapts when you resize the window.

3. **Colour matrix.** Write a script that prints `getColorDepth()` and `hasColors(256)` for `process.stdout`, then repeats for simulated environments passed as `env` objects: `{}`, `{ NO_COLOR: '1' }`, `{ FORCE_COLOR: '3' }`, and `{ NO_COLOR: '1', FORCE_COLOR: '2' }`. *Success:* you can explain each result, especially the last one.

4. **Line counter, two ways.** Count lines in a 500 MB file using the readline async iterator and again using the `'line'` event, timing both. Repeat with a CRLF copy of the file, with and without `crlfDelay: Infinity`. *Success:* the counts match only when `crlfDelay: Infinity` is set, and you can quantify the performance difference.

5. **A real prompt.** Build a `delete <name>` CLI that confirms interactively, accepts `--yes` for automation, refuses to prompt when stdin is not a TTY, exits 130 on `Ctrl+C`, and restores the terminal on every path. *Success:* it behaves correctly under `echo y | ./delete x`, `./delete x < /dev/null`, and an interrupted interactive run.

## Recap

- `os.platform()` is compile-time and returns `'win32'`, never `'windows'`; `os.type()` returns `uname` names like `'Darwin'` and `'Windows_NT'`.
- `os.cpus()` gives cumulative per-core times in milliseconds — sample twice for utilisation — and its length is **not** the right pool size. Use `os.availableParallelism()`.
- `os.totalmem()`, `os.freemem()`, `os.loadavg()`, and `os.uptime()` all describe the host, ignore cgroup limits, and — for `loadavg()` — return `[0, 0, 0]` on Windows. Use `process.constrainedMemory()` for budgets.
- `os.EOL` describes the local machine; hard-code `'\n'` in file formats and reserve `os.EOL` for console output.
- `isTTY` is `true` or absent, so coerce it, and check the specific stream you care about — stdin, stdout, and stderr routinely differ.
- Raw mode delivers characters immediately, disables echo, and turns `Ctrl+C` into the byte `0x03`; `isRaw` always starts `false`, and you must restore cooked mode yourself.
- Colour is controlled by `FORCE_COLOR` (which overrides everything), `NO_COLOR`, and `NODE_DISABLE_COLORS`; both `hasColors()` and `getColorDepth()` accept an `env` object for testing.
- A readline interface keeps the process alive until it is closed, and starts consuming input the moment it is created.
- `crlfDelay: Infinity` is mandatory when reading files that may use CRLF endings; the 100 ms default is for interactive input.
- A correct prompt checks `process.stdin.isTTY`, writes to stderr, handles `'SIGINT'`, and fails closed in non-interactive mode.

## Where to go next

- [Chapter 25 — The Process Object](25-process-object.md) — `process.constrainedMemory()`, stdio blocking behaviour, and exit codes.
- [Chapter 26 — Signals, Graceful Shutdown, and Process Lifecycle](26-signals-and-shutdown.md) — restoring terminal state on the way out.
- [Chapter 29 — Worker Threads](29-worker-threads.md) — what to do with `availableParallelism()`.
- [Chapter 3 — Running Code: Scripts, the CLI, and the REPL](../part1-foundations/03-running-code-cli-repl.md) — the REPL, which is readline with a language attached.
- [Chapter 51 — Console, `util.inspect`, and Logging Strategy](../part7-diagnostics/51-console-and-logging.md) — `util.styleText()` and colour-aware output.
- Official documentation: <https://nodejs.org/docs/latest/api/os.html>, <https://nodejs.org/docs/latest/api/tty.html>, <https://nodejs.org/docs/latest/api/readline.html>
