---
chapter: 57
part: "Part VIII — Advanced and Native"
title: "WebAssembly and WASI"
level: advanced
reading_time: "42 min"
prerequisites: [5, 16, 22, 52]
source_docs:
  - "doc/api/wasi.md"
  - "doc/api/esm.md"
  - "doc/api/globals.md"
  - "doc/api/cli.md"
  - "doc/api/permissions.md"
source_url: "https://nodejs.org/docs/latest/api/wasi.html"
node_baseline: "27.0.0-pre"
---

# Chapter 57 — WebAssembly and WASI

## What you will learn

- How to compile, instantiate and call a `.wasm` module in Node with nothing installed but Node itself.
- The linear memory model: why `memory.buffer` is an `ArrayBuffer`, why growth invalidates every view you hold, and what it costs to move a string across the boundary.
- When WebAssembly actually beats JavaScript, with measured numbers, and the far more common case where it does not.
- Importing `.wasm` files as ES modules — instance phase, source phase, and JavaScript string builtins.
- `node:wasi`: what WASI is, the `preview1` situation, every constructor option, `start()` vs `initialize()`, and the exact security claim Node does *and does not* make.
- Which toolchain to reach for: Emscripten, wasi-sdk, Rust `wasm32-wasip1`, or AssemblyScript.

## Why this matters

You maintain a Node service that validates and re-encodes user-uploaded barcodes. The reference implementation is 6,000 lines of C that has been correct for fifteen years. [Chapter 56](56-node-api-addons.md) taught you to wrap it in a Node-API addon — and then to weigh the cost: a compiler on every developer machine, a build matrix in CI, a prebuild pipeline, and a memory-safety bug in that C now segfaults your entire process mid-request.

WebAssembly changes the trade. You compile that C once, on your machine, to a single `.wasm` file. It is a normal build artifact — you commit it or publish it, and it runs byte-identically on Linux, macOS, Windows, x64 and arm64 with no toolchain on the target at all. And it runs *inside* V8's sandbox: a wild pointer in the C corrupts the module's own linear memory and nothing else. A buffer overrun becomes a wrong answer instead of a compromised process.

The price is a wall. WebAssembly modules cannot see your JavaScript objects, cannot read your disk, and cannot open a socket. Everything they touch must be copied into a flat block of bytes and copied back. Whether the compute inside is worth the copying at the edges is the entire engineering question of this chapter, and it has a numeric answer you can measure.

## WebAssembly with no tooling at all

`WebAssembly` is a global in Node — the docs describe it as "the object that acts as the namespace for all W3C WebAssembly related functionality," and it has been there since v8.0.0. There is no module to import and no flag to pass. The full surface:

| Member | Kind | What it is for |
|---|---|---|
| `WebAssembly.compile(bytes)` | async | Bytes → a `Module`. Compilation only, no instantiation. |
| `WebAssembly.instantiate(bytesOrModule, imports)` | async | Bytes → `{ module, instance }`; a `Module` → an `Instance`. |
| `WebAssembly.validate(bytes)` | sync | `true`/`false`. Does not throw. |
| `WebAssembly.compileStreaming(response)` | async | Compile while the bytes are still arriving. |
| `WebAssembly.instantiateStreaming(response, imports)` | async | Same, then instantiate. |
| `new WebAssembly.Module(bytes)` | sync | Blocking compile. Blocks the loop. |
| `new WebAssembly.Instance(module, imports)` | sync | Blocking instantiate. |
| `WebAssembly.Memory` | class | A growable block of linear memory. |
| `WebAssembly.Table` | class | A growable array of references (functions, `externref`). |
| `WebAssembly.Global` | class | A single typed, optionally mutable value. |
| `WebAssembly.Tag`, `WebAssembly.Exception`, `WebAssembly.JSTag` | classes | Exception handling across the boundary. |
| `WebAssembly.CompileError` / `LinkError` / `RuntimeError` | errors | Bad bytes / bad imports / a trap. |

Three statics live on the class rather than the namespace: `WebAssembly.Module.exports(mod)`, `.imports(mod)` and `.customSections(mod, name)`. `exports()` returns an array of `{ name, kind }` and is the fastest way to find out what a `.wasm` file you were handed actually offers.

### Loading a `.wasm` file from disk

```mjs
import { readFile } from 'node:fs/promises';

const bytes = await readFile(new URL('./bench.wasm', import.meta.url));
const module = await WebAssembly.compile(bytes);
const { exports } = await WebAssembly.instantiate(module, {});

console.log(WebAssembly.Module.exports(module));
// [ { name: 'memory', kind: 'memory' },
//   { name: 'sum', kind: 'function' },
//   { name: 'noop', kind: 'function' } ]
console.log(exports.sum(0, 1024));
```

```cjs
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

(async () => {
  const bytes = await readFile(join(__dirname, 'bench.wasm'));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  console.log(instance.exports.sum(0, 1024));
})();
```

Note the shape difference, because it trips everyone: **given raw bytes, `instantiate` resolves to `{ module, instance }`; given an already-compiled `Module`, it resolves to the `Instance` directly.** In CommonJS use `__dirname`; in ESM use `new URL('./x.wasm', import.meta.url)`, never a bare relative path, because `readFile` resolves relative paths against the process working directory, not the file.

The synchronous constructors — `new WebAssembly.Module(bytes)` — exist and are fine at startup. They compile on the main thread and block the event loop for as long as it takes, which for a multi-megabyte module is tens of milliseconds. Use them in a top-level initialization path and nowhere else.

### Streaming compilation

`compileStreaming` and `instantiateStreaming` take a `Response` (or a promise of one) and hand bytes to the compiler as they arrive, so compilation overlaps with the download. Node implements them, and they work with the global `fetch` and `Response`:

```mjs
const { instance } = await WebAssembly.instantiateStreaming(
  fetch('https://cdn.example.com/codec.wasm'),
  {},
);
```

The `Response` must carry `content-type: application/wasm` or the call rejects. For a file already on local disk there is nothing to overlap with, so `readFile` plus `compile` is simpler and no slower. Streaming earns its keep when the module comes over the network.

## The import object: calling back into JavaScript

WebAssembly modules have no ambient capabilities. Everything a module can do beyond arithmetic on its own memory must be handed to it at instantiation time, in the **import object** — a two-level map from module name to import name:

```js
const importObject = {
  env: {
    now: () => Date.now(),
    log_i32: (value) => console.log('wasm says', value),
    memory: new WebAssembly.Memory({ initial: 2, maximum: 16 }),
  },
};
const { instance } = await WebAssembly.instantiate(bytes, importObject);
```

The names must match the module's declared imports exactly. `WebAssembly.Module.imports(mod)` tells you what a module is asking for; supply anything less, or the wrong kind, and instantiation fails with a `WebAssembly.LinkError` rather than a crash. That is the boundary working as designed.

Type mapping across the call is narrow and strict. `i32`, `f32` and `f64` map to JavaScript `number`; `i64` maps to `bigint` and passing a `number` for one throws a `TypeError`. `externref` carries an arbitrary JavaScript value opaquely — WebAssembly can hold it and hand it back but cannot inspect it. **There is no string type, no object type, and no array type.** Anything richer than a number is your problem, and that is the subject of the next section.

A JavaScript exception thrown inside an imported function propagates out through the WebAssembly frames to the caller. A WebAssembly trap — out-of-bounds access, integer divide by zero, unreachable — surfaces in JavaScript as a `WebAssembly.RuntimeError`, which is an ordinary catchable `Error`. Compare that with [Chapter 56](56-node-api-addons.md): the same bug in a native addon is a segfault that takes down the process. This is the single strongest argument for WebAssembly over an addon.

## Linear memory

A module's memory is one contiguous, zero-initialized block of bytes, addressed from 0. On the JavaScript side it is `memory.buffer`, an `ArrayBuffer`. You read and write it by placing typed-array views over it:

```js
const heap8 = new Uint8Array(exports.memory.buffer);
const heap32 = new Int32Array(exports.memory.buffer);
heap32[0] = 42;                       // writes bytes 0..3 of wasm memory
console.log(exports.sum(0, 1));       // wasm reads the same bytes
```

Memory is measured in **pages of 65,536 bytes**. `new WebAssembly.Memory({ initial: 1 })` gives a `buffer.byteLength` of exactly 65536. `initial` and `maximum` are page counts; `shared: true` produces a `SharedArrayBuffer` instead, which is what lets a module's memory be used from a worker thread ([Chapter 29](../part4-system/29-worker-threads.md)).

### Growth detaches the buffer

This is the mistake that costs an afternoon. `memory.grow(pages)` does not extend the existing `ArrayBuffer` in place. It **detaches** it and installs a new one:

```js
const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
const before = memory.buffer;
memory.grow(1);
console.log(before === memory.buffer);  // false
console.log(before.byteLength);         // 0   — detached
console.log(before.detached);           // true
console.log(memory.buffer.byteLength);  // 131072
```

Every typed array you built over the old buffer is now a view onto nothing: reads return `undefined`, writes are silently discarded. And **the module can grow its own memory without telling you.** Any C function that calls `malloc` may trigger a `memory.grow` internally, which means:

> **Re-read `memory.buffer` after every call into WebAssembly that could allocate.** Never cache a typed-array view across a module call.

The idiomatic fix is a tiny accessor that rebuilds the view when the buffer identity changes:

```js
let cachedBuffer = null;
let cachedU8 = null;
function heap() {
  if (cachedBuffer !== exports.memory.buffer) {
    cachedBuffer = exports.memory.buffer;
    cachedU8 = new Uint8Array(cachedBuffer);
  }
  return cachedU8;
}
```

Shared memories behave differently: growing one also yields a new `SharedArrayBuffer` object from `memory.buffer`, but the old one is **not** detached — it stays valid and simply exposes the smaller original range. Do not rely on that distinction; use the accessor either way.

### Passing strings and structs

There is no string type in WebAssembly, so a JavaScript string crosses the boundary as bytes you encode, copy into linear memory, and describe with a pointer and a length. The module must give you somewhere to put them — conventionally an exported `alloc`/`free` pair backed by its own allocator.

```js
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function passString(str) {
  const bytes = encoder.encode(str);
  const ptr = exports.alloc(bytes.length);   // may grow memory
  heap().set(bytes, ptr);                    // note: heap() re-reads the buffer
  return { ptr, len: bytes.length };
}

function readString(ptr, len) {
  return decoder.decode(heap().subarray(ptr, ptr + len));
}
```

Structs are the same story with more arithmetic: you agree on a byte layout with the C side, write fields at fixed offsets with a `DataView`, and pass the base pointer. `DataView` is the right tool because it lets you specify endianness explicitly — WebAssembly is little-endian everywhere, which happens to match x64 and arm64, but writing it down documents the contract.

### The marshalling cost, measured

Copying is not free, and its size decides whether WebAssembly is worth it. On a modern x64 machine, moving a 1,000-character ASCII string in and back out:

| Operation | Cost |
|---|---|
| `TextEncoder.encodeInto` a 1 KB string into linear memory | ~130 ns |
| `TextDecoder.decode` 1 KB back out | ~275 ns |
| Round trip | **~400 ns** |
| A plain JavaScript property read for comparison | ~5 ns |

Four hundred nanoseconds buys you roughly 1,000 iterations of a tight JavaScript loop. **If the work you are doing inside WebAssembly is smaller than that, the boundary eats the win before the module runs a single instruction.**

## When WebAssembly actually beats JavaScript

Be honest about this, because the folklore is wrong in both directions. Here are numbers from the same machine, same process, both paths warmed up.

Summing four million `i32` values, JavaScript over an `Int32Array` versus a C loop compiled to WebAssembly reading its own linear memory:

| Implementation | Time |
|---|---|
| JavaScript, `Int32Array` | 3.11 ms |
| WebAssembly, `-O3` | 1.48 ms |

A little over 2×. That is a realistic figure for numeric code, and it is *not* 10×. TurboFan compiles a monomorphic loop over a typed array into machine code that looks a lot like what LLVM emits; WebAssembly's advantages are the absence of bounds-check overhead in some shapes, no deoptimization risk, and predictable codegen from the first call.

Call overhead, measured over ten million calls:

| Call | Cost per call |
|---|---|
| JavaScript function → JavaScript function | ~0.7 ns |
| JavaScript → exported WebAssembly function | ~3.6 ns |

Five times more expensive, but still only a few nanoseconds — the crossing itself is cheap. It is the *data* crossing that costs.

Putting it together:

| Situation | Verdict |
|---|---|
| Large numeric kernel, data already in linear memory | **WASM wins**, roughly 1.5×–4×. |
| Existing mature C/C++/Rust library you must not rewrite | **WASM wins** on effort, correctness and safety, regardless of speed. |
| Hot function called millions of times with small arguments | **JS wins.** Per-call overhead dominates. |
| Anything string-heavy with frequent boundary crossings | **JS usually wins.** Encode/decode dominates. |
| SIMD-heavy DSP, codecs, compression, crypto primitives | **WASM wins**, sometimes decisively. |
| Business logic, JSON shuffling, I/O orchestration | **JS wins.** Not close. |
| You need real threads and shared state | Worker threads ([Chapter 29](../part4-system/29-worker-threads.md)) first. |

The rule that survives contact with production: **cross the boundary rarely, with a lot of data each time.** One call that processes a 4 MB frame is excellent. Four million calls that process a byte each is a pessimization with extra build steps.

## Importing `.wasm` as an ES module

Node can load `.wasm` files through the ESM loader directly. `packages.md` lists `.wasm` alongside `.js` and `.json` in the extension table, and — this is the part most tutorials get wrong — **the `--experimental-wasm-modules` flag is no longer required.** It was dropped in v24.5.0 and v22.19.0. You still get an `ExperimentalWarning` on stderr.

**Instance phase** (Stability: **1.1 — Active development**) imports the module already instantiated:

```mjs
import * as M from './library.wasm';
console.log(M);
// [Module: null prototype] { add: [Function: 0], mem: Memory [WebAssembly.Memory] {} }
```

The module's own imports are resolved as normal module-graph imports, so a `.wasm` file can import from a `.js` file that imports from another `.wasm` file. What you *cannot* do is supply a custom import object — the loader builds it.

**Source phase** (Stability: **1.2 — Release candidate**, added v24.0.0) solves that, by giving you the uninstantiated `WebAssembly.Module`:

```mjs
import source libraryModule from './library.wasm';

const instance1 = await WebAssembly.instantiate(libraryModule, importObject1);
const instance2 = await WebAssembly.instantiate(libraryModule, importObject2);
```

There is a dynamic form too, `await import.source('./library.wasm')`. Use the source phase whenever you need custom imports or more than one instance of the same module — compiling once and instantiating many times is much cheaper than compiling twice.

Two more details from `esm.md`. **JavaScript string builtins** (Stability: **1.2 — Release candidate**, v24.5.0/v22.19.0) are enabled automatically for ESM-imported wasm: a module may import from the `wasm:js-string` namespace to call efficient string primitives at compile time, and from `wasm:js/string-constants` for static string globals. Because these are linked during *compilation* rather than instantiation, they do not appear in `WebAssembly.Module.imports(mod)` and cannot be virtualized. And the prefixes `wasm-js:` and `wasm:` are **reserved** in import and export names — using them throws a `WebAssembly.LinkError`.

## `node:wasi`

### Stability, flags, and what it is

`node:wasi` is **Stability: 1 — Experimental**. The `--experimental-wasi-unstable-preview1` flag still exists and is still accepted, but since v20.0.0/v18.17.0 it is **no longer required** — WASI is enabled by default. You get an `ExperimentalWarning` when you construct a `WASI`. Under the Permission Model ([Chapter 31](../part4-system/31-permission-model.md)) creating a `WASI` instance throws `ERR_ACCESS_DENIED` with `permission: 'WASI'` unless you pass **`--allow-wasi`** (Stability: 1.1, added v22.3.0/v20.16.0). Node's implementation is backed by the bundled `uvwasi` library; `process.versions.uvwasi` reports its version.

WASI — the WebAssembly System Interface — is the missing half of the picture. Plain WebAssembly cannot open a file, read the clock, or write to stdout. WASI defines a standard set of POSIX-like functions that a host provides as imports, so that a program compiled from ordinary C with `printf` and `fopen` can run unmodified. `wasi.wasiImport` is that implementation: an object of roughly 46 functions with names like `fd_write`, `path_open`, `clock_time_get` and `args_sizes_get`.

The version situation is the awkward part. `version` accepts exactly two values: `'unstable'` (the old `wasi_unstable` namespace) and `'preview1'` (`wasi_snapshot_preview1`). **Use `'preview1'`.** It has been the de-facto target of every toolchain for years, and it is not going to be superseded inside Node soon — the successor design, the WASI Component Model, is not implemented here. The option has been mandatory with no default since v20.0.0.

### Sandboxing: read this before you trust it

`preopens` is a capability model on paper. You hand the instance a map from a virtual path the guest sees to a real path on the host, and the guest can name nothing outside it:

```js
preopens: { '/data': '/srv/app/uploads' }
```

The guest opens `/data/report.csv`; Node resolves it under `/srv/app/uploads`. There is no ambient filesystem — a path the guest did not receive as a preopen has no name it can reach. That is a genuine capability design, and it is structurally stronger than `node:vm`, which shares one heap with your code and offers no boundary at all ([Chapter 52](52-vm-sandboxing.md)).

**But do not treat it as a security boundary in Node.** The documentation is blunt on this point, in a highlighted warning at the top of the page and again in a dedicated Security section: the `node:wasi` module "does not currently provide the comprehensive file system security properties provided by some WASI runtimes," the current Node.js threat model "does not provide secure sandboxing as is present in some WASI runtimes," and "the file system sandboxing can be escaped with various techniques." The capability *features* are supported; they do not form a security *model*. The docs say plainly: do not rely on it to run untrusted code.

So the honest summary is a three-way split, and you should hold all three facts at once:

| Layer | Boundary strength |
|---|---|
| WebAssembly memory isolation (V8) | **Real.** A wild pointer cannot escape linear memory. |
| WASI `preopens` in Node | **Structural, not hardened.** Good hygiene; escapable. Not for untrusted code. |
| `node:vm` | **None.** Same heap, documented escapes. |

If you must run genuinely untrusted WebAssembly with filesystem access, run it in a dedicated WASI runtime (Wasmtime, WasmEdge) inside its own process or container, and treat that process as hostile.

### The options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `version` | string | *(none — mandatory)* | `'preview1'` or `'unstable'`. |
| `args` | Array | `[]` | The guest's `argv`. **The first element is the virtual path of the command itself.** |
| `env` | Object | `{}` | The guest's environment. Nothing is inherited implicitly. |
| `preopens` | Object | *(none)* | Virtual directory → real host path. |
| `returnOnExit` | boolean | `true` | On `__wasi_proc_exit()`, `start()` returns the exit code. Set `false` to exit the Node process instead. |
| `stdin` | integer | `0` | Host file descriptor used as the guest's stdin. |
| `stdout` | integer | `1` | Host fd used as stdout. |
| `stderr` | integer | `2` | Host fd used as stderr. |

`returnOnExit` defaulted to `false` before v20.1.0. If you are reading older code that assumes a guest `exit(1)` kills the process, that assumption is now wrong.

### `start()` vs `initialize()`: commands and reactors

WASI defines two module shapes, and picking the wrong method throws.

A **command** is a program with a `main`. It exports `_start`, runs once, and exits. Use `wasi.start(instance)`. It throws if the instance has no `_start` export, if it *also* has an `_initialize` export, or if you call it twice.

A **reactor** is a library. It exports `_initialize` to set up its runtime and then sits there waiting for you to call its other exports repeatedly. Use `wasi.initialize(instance)`. It throws if the instance has a `_start` export, and it throws on a second call.

Both require the instance to export a `WebAssembly.Memory` named `memory`, so the host can read and write the guest's buffers. If it does not, both throw.

There is a third entry point, `wasi.finalizeBindings(instance[, options])`, added in **v24.4.0**. It wires up the host bindings without invoking either lifecycle export, and accepts `options.memory` so you can supply a `WebAssembly.Memory` explicitly instead of relying on the `memory` export. Its documented purpose is instantiating a WASI module in child threads that share one memory. `start()` and `initialize()` call it internally; calling it twice throws.

`wasi.getImportObject()` (added v19.8.0) returns the ready-made import object: `{ wasi_snapshot_preview1: wasi.wasiImport }` for `preview1`, `{ wasi_unstable: wasi.wasiImport }` for `unstable`. Use it whenever WASI is the module's only dependency. When the module also imports your own functions, build the object yourself by merging `wasi.wasiImport` under the right namespace key with your own namespaces.

### A worked example: word counting in a preopened directory

An ordinary C program, using nothing but the standard library:

```c
/* wordcount.c */
#include <stdio.h>
#include <ctype.h>

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: wordcount <file>\n"); return 2; }
  FILE *f = fopen(argv[1], "r");
  if (!f) { perror("fopen"); return 1; }

  long words = 0;
  int c, in_word = 0;
  while ((c = fgetc(f)) != EOF) {
    if (isspace(c)) in_word = 0;
    else if (!in_word) { in_word = 1; words++; }
  }
  fclose(f);
  printf("%ld\n", words);
  return 0;
}
```

Compile it with [wasi-sdk](https://github.com/WebAssembly/wasi-sdk), which is clang plus a WASI-targeted libc:

```bash
$WASI_SDK/bin/clang --target=wasm32-wasip1 -O2 -o wordcount.wasm wordcount.c
```

(Older wasi-sdk releases spell the triple `wasm32-wasi`.) Then run it:

```mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WASI } from 'node:wasi';

const wasi = new WASI({
  version: 'preview1',
  args: ['wordcount', '/data/report.txt'],
  env: { LANG: 'C' },
  preopens: {
    // fileURLToPath, not url.pathname: on Windows the latter yields `/C:/...`.
    '/data': fileURLToPath(new URL('./corpus/', import.meta.url)),
  },
  returnOnExit: true,
});

const module = await WebAssembly.compile(
  await readFile(new URL('./wordcount.wasm', import.meta.url)),
);
const instance = await WebAssembly.instantiate(module, wasi.getImportObject());

const code = await wasi.start(instance);
console.log('guest exited with', code);
```

Three things to notice. The guest's `argv[1]` is `/data/report.txt` — a path that exists only inside the sandbox; the real file is `./corpus/report.txt`. The guest's environment is exactly `{ LANG: 'C' }`; nothing from `process.env` leaks in. And `printf` output goes to fd 1, which is your process's stdout, because `stdout` defaults to `1`. Point it at a file descriptor from `fs.open` to capture it instead.

## Which toolchain?

| Toolchain | Produces | Reach for it when |
|---|---|---|
| **wasi-sdk** | Pure `wasm32-wasip1` from C/C++ | You have C that uses the standard library and you want a plain WASI command or reactor. Smallest, most predictable output. |
| **Emscripten** | Wasm + a large JS glue file | You are porting a C/C++ codebase that expects a POSIX-ish environment, SDL, pthreads, or a filesystem shim. Most capable, least minimal — the glue is doing a lot. |
| **Rust `wasm32-wasip1`** | WASI command/reactor | New code. `rustup target add wasm32-wasip1` and `cargo build --target wasm32-wasip1` is the whole story. |
| **Rust `wasm32-unknown-unknown` + `wasm-bindgen`** | Wasm + JS bindings | You want ergonomic string and object marshalling into JS and do not need WASI syscalls. |
| **AssemblyScript** | Small pure wasm | Your team writes TypeScript and the kernel is numeric. Familiar syntax, tiny output, but it is *not* TypeScript — no `any`, no closures over the JS heap, its own managed runtime. |
| **TinyGo** | Wasm/WASI from Go | You already have Go. Larger binaries than C, smaller than mainline Go. |

Default advice: **wasi-sdk for existing C, Rust `wasm32-wasip1` for new systems code, AssemblyScript only when the team's familiarity outweighs the ecosystem's size.** Reach for Emscripten when the port is genuinely a port and you need its shims.

## Common mistakes

### ❌ Caching a typed-array view across a call into WebAssembly

```js
// Wrong: `heap` is detached the moment the module grows its memory
const heap = new Uint8Array(exports.memory.buffer);
const ptr = exports.alloc(1024);   // may call memory.grow internally
heap.set(payload, ptr);            // silently writes nothing
```

Growth replaces the `ArrayBuffer`; the old one reports `byteLength === 0` and `detached === true`. Writes through a detached view are discarded without an error, so the failure looks like a logic bug deep inside the guest.

```js
// ✅ Re-derive the view after anything that could allocate.
const ptr = exports.alloc(1024);
new Uint8Array(exports.memory.buffer).set(payload, ptr);
```

### ❌ Passing `process.argv` straight into `args`

```js
// Wrong: the guest sees the node binary path as its own name
const wasi = new WASI({ version: 'preview1', args: process.argv });
```

`args[0]` is the virtual path to the WASI command itself. `process.argv[0]` is the absolute path of the Node executable and `argv[1]` is your `.mjs` file, so the guest's `argv[1]` — the argument most C programs read first — is the script path, not the user's argument.

```js
// ✅ Build the guest's argv deliberately.
const wasi = new WASI({
  version: 'preview1',
  args: ['wordcount', ...process.argv.slice(2)],
});
```

### ❌ Treating `preopens` as a security boundary

```js
// Wrong: this does not make untrusted wasm safe
const wasi = new WASI({ version: 'preview1', preopens: { '/': '/' } });
```

Beyond the obvious problem of preopening the whole filesystem, the docs state directly that Node's WASI file system sandboxing "can be escaped with various techniques" and that the module must not be relied on to run untrusted code.

```js
// ✅ Least privilege, and a real boundary outside the process.
const wasi = new WASI({
  version: 'preview1',
  preopens: { '/in': '/srv/job/input' },   // one directory, read-only content
});
// Untrusted input? Run this whole process in its own container or
// under --permission --allow-wasi with narrow --allow-fs-read.
```

### ❌ Calling `start()` on a reactor (or `initialize()` on a command)

```js
// Wrong: the module exports _initialize, not _start
wasi.start(instance);   // throws
```

A library compiled as a reactor has no `main` to run. Check what you built: `WebAssembly.Module.exports(module)` shows `_start` for a command and `_initialize` for a reactor.

```js
// ✅ Dispatch on the actual export.
const names = new Set(WebAssembly.Module.exports(module).map((e) => e.name));
if (names.has('_start')) wasi.start(instance);
else wasi.initialize(instance);
```

### ❌ Compiling the same module twice

```js
// Wrong: full compile on every request
async function handle(req) {
  const { instance } = await WebAssembly.instantiate(await readFile('codec.wasm'), {});
  return instance.exports.encode(/* ... */);
}
```

Compilation is the expensive step; instantiation is cheap. Compile once at startup, keep the `Module`, and instantiate per request when you need fresh state.

```js
// ✅
const module = await WebAssembly.compile(await readFile('codec.wasm'));
async function handle(req) {
  const instance = await WebAssembly.instantiate(module, {});
  return instance.exports.encode(/* ... */);
}
```

## Production notes

- **Compile once, instantiate many.** A `WebAssembly.Module` is cheap to instantiate and safe to keep for the life of the process. It is also `structuredClone`-able, so you can `postMessage` a compiled module to a worker thread and skip recompiling there ([Chapter 29](../part4-system/29-worker-threads.md)).
- **WebAssembly memory never shrinks.** `memory.grow()` is one-way — there is no `shrink`. A module that spikes to 1 GB holds 1 GB until you drop the whole instance. For memory-hungry workloads, instantiate per job and discard, rather than reusing one long-lived instance.
- **Watch virtual address space, not just RSS.** Node enables V8's trap-handler-based bounds checks on 64-bit platforms, which reserves a large virtual memory *cage* per WebAssembly memory instance — typically 8 GB for 32-bit wasm memory and 16 GB for 64-bit. Under a `ulimit -v`, allocation fails with `WebAssembly.Memory(): could not allocate memory`. Since v26.0.0/v24.19.0 Node disables the optimization automatically when there is not enough virtual memory at startup; `--disable-wasm-trap-handler` forces inline bounds checks instead, which is slower but lets you create far more instances.
- **A trap is catchable; a native crash is not.** Wrap guest calls in `try`/`catch` for `WebAssembly.RuntimeError` and you have a per-request failure instead of a per-process one. This is the operational reason to prefer WebAssembly over a native addon when both would work.
- **Long guest calls block the event loop.** WebAssembly runs synchronously on the calling thread. A 200 ms decode stalls every request in flight exactly as a 200 ms JavaScript loop would. Move heavy modules into a worker thread.
- **Under `--permission`, WASI is denied by default.** You need `--allow-wasi`; audit mode publishes denials to the `node:permission-model:wasi` diagnostics channel. Also note that preopened directories are not automatically covered by your `--allow-fs-read` grants — reason about both layers.
- **Pin and verify your `.wasm` artifacts.** A `.wasm` file is an opaque binary in your repo or registry. Record the exact compiler version and flags that produced it, check the hash in CI, and make the build reproducible. Nobody can review a diff of a `.wasm`.
- **`node:wasi` is Experimental and `uvwasi` is pre-1.0.** Both can change in a minor release. Keep a thin adapter layer around your WASI setup so a signature change is a one-file edit.

## Exercises

1. **Inspect an unknown module.** Write a CLI that takes a `.wasm` path and prints its imports, exports and custom section names using `WebAssembly.Module.imports`, `.exports` and `.customSections`. *Success:* it correctly reports a module that imports `wasi_snapshot_preview1.fd_write` without instantiating it.
2. **Prove the detach.** Create a `WebAssembly.Memory` with `initial: 1`, take a `Uint8Array` over it, write a byte, call `grow(1)`, then read the byte back through the old view. *Success:* you can show `detached === true`, `byteLength === 0`, and that a write through the stale view is silently lost.
3. **Measure your own boundary.** Build a module exporting a trivial `noop(i32)` and benchmark ten million calls to it against ten million calls to an equivalent JavaScript function; then benchmark a 1 KB string round trip through linear memory. *Success:* you can state, for your machine, the minimum amount of work that justifies a crossing.
4. **Build and run a WASI command.** Compile the `wordcount.c` above with wasi-sdk and run it from Node with a preopened directory. *Success:* it counts words in a file inside the preopen and returns a non-zero exit code, via `returnOnExit`, when handed a path outside it.
5. **Turn a command into a reactor.** Rebuild the same C as a reactor (no `main`, exported functions, linked with `-mexec-model=reactor`), drive it with `wasi.initialize()`, and call an exported function repeatedly across the same instance. *Success:* state persists between calls, and calling `wasi.start()` on it throws.

## Recap

- `WebAssembly` is a global, always available: `compile`/`instantiate` for bytes, `Module`/`Instance`/`Memory`/`Table`/`Global` for the pieces, streaming variants for network sources.
- Given bytes, `instantiate` resolves to `{ module, instance }`; given a `Module`, it resolves to the `Instance`. Compile once, instantiate many.
- Everything a module can do is handed to it in the import object. A `LinkError` at instantiation is the boundary doing its job; a trap becomes a catchable `WebAssembly.RuntimeError`.
- Linear memory is an `ArrayBuffer` of 64 KiB pages. `grow()` detaches it — never cache a view across a call that could allocate.
- WebAssembly wins on big numeric kernels (roughly 2× on a tight loop) and on reusing mature C. It loses on chatty, small, string-heavy calls: a 1 KB string round trip costs about 400 ns.
- `.wasm` files import as ES modules with no flag since v24.5.0/v22.19.0 — instance phase (**1.1**), source phase via `import source` (**1.2**), plus automatic JS string builtins.
- `node:wasi` is **[Experimental]**; the flag is optional, but `--allow-wasi` is required under the Permission Model. `version: 'preview1'` is mandatory and is what you want.
- `preopens` is a capability design, but Node's docs state the file system sandbox can be escaped. Do not run untrusted code under `node:wasi`.
- `start()` runs a command's `_start`; `initialize()` runs a reactor's `_initialize`; both need an exported `memory` and both throw if called twice.
- wasi-sdk for existing C, Rust `wasm32-wasip1` for new code, Emscripten for real ports, AssemblyScript for TypeScript teams with numeric kernels.

## Where to go next

- [Chapter 56 — Node-API: Native Addons in C/C++](56-node-api-addons.md) — the alternative when you need the host's own memory and the real OS.
- [Chapter 58 — FFI and Embedding Node.js](58-ffi-and-embedding.md) — calling a shared library with no build step, and running Node inside a C++ host.
- [Chapter 52 — The `vm` Module and Code Isolation](52-vm-sandboxing.md) — why `vm` is not a sandbox, and what a real one looks like.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) — where long-running WebAssembly belongs, and how to share a `SharedArrayBuffer` memory.
- [Chapter 16 — Buffers and Typed Arrays](../part3-data/16-buffers.md) — `DataView`, endianness, and views over an `ArrayBuffer`.
- [Chapter 31 — The Permission Model](../part4-system/31-permission-model.md) — what `--allow-wasi` gates.
- Official docs: <https://nodejs.org/docs/latest/api/wasi.html> and the ESM integration section at <https://nodejs.org/docs/latest/api/esm.html#wasm-modules>. The WebAssembly JavaScript API itself is a W3C standard — MDN is the reference.
