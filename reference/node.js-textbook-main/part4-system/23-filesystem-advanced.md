---
chapter: 23
part: "Part IV — System Interfaces"
title: "File System II: Directories, Watching, Streams, and Atomicity"
level: advanced
reading_time: "32 min"
prerequisites: [18, 19, 22]
source_docs:
  - "doc/api/fs.md"
  - "doc/api/readline.md"
  - "doc/api/deprecations.md"
source_url: "https://nodejs.org/docs/latest/api/fs.html"
node_baseline: "27.0.0-pre"
---

# Chapter 23 — File System II: Directories, Watching, Streams, and Atomicity

**What you will learn**

- How to walk a directory tree without a `stat` per entry, and when `opendir` beats `readdir`.
- What `fs.watch` really tells you on each platform — and why every serious watcher debounces.
- The full option sets of `createReadStream` and `createWriteStream`, including `start`/`end`, `flush`, and `emitClose`.
- The write-temp-then-rename pattern, the exact conditions under which it is atomic, and where `fsync` fits.
- How to read a 40 GB log line by line in constant memory.
- How to serve a file over HTTP with correct `Range` support.

## Why this matters

Chapter 22 dealt with one file at a time. Real systems deal with trees of them, and with the fact that other processes are changing those trees while you look.

Three failures dominate this territory. The first is memory: a recursive `readdir` of a build output directory can return a million strings before you get a chance to filter one. The second is durability: a service writes `config.json`, the machine loses power a second later, and the file comes back as zero bytes because `writeFile` truncated it before writing and the new contents never reached the platter. The third is the watcher that works perfectly on the developer's Mac, fires three times per save on Linux, and silently stops after the editor does an atomic-save on Windows. None of these are exotic. All of them have well-defined causes and standard fixes, and this chapter is those fixes.

## Reading directories

### `readdir`

```mjs
import { readdir } from 'node:fs/promises';

const names = await readdir('./src');                              // ['index.js', 'lib']
const entries = await readdir('./src', { withFileTypes: true });   // Dirent objects
const all = await readdir('./src', { recursive: true });           // includes subpaths
```

| Option | Type | Default | Effect |
|---|---|---|---|
| `encoding` | string | `'utf8'` | `'buffer'` returns names as `Buffer`s |
| `withFileTypes` | boolean | `false` | return `fs.Dirent` objects instead of names |
| `recursive` | boolean | `false` | descend into subdirectories (v20.1.0 / v18.17.0) |

`.` and `..` are always excluded.

`withFileTypes: true` is close to free and usually the right choice: the operating system already reports each entry's type as part of the directory read, so you avoid an extra `stat` syscall per entry. The caveat, stated plainly in the docs, is that the reported type depends on the file system — some report a type that differs from `lstat`, and Node only falls back to `lstat` when the type comes back unknown. **When an accurate type matters, call `lstat` yourself.**

`recursive: true` is convenient and dangerous: it builds the entire result array in memory before resolving. On a tree with a million entries you get a million strings at once.

### `Dirent`

| Member | Notes |
|---|---|
| `name` | the entry name; a `Buffer` if `encoding: 'buffer'` |
| `parentPath` | the containing directory (stable since v24.0.0 / v22.17.0) |
| `isFile()`, `isDirectory()`, `isSymbolicLink()` | the common three |
| `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()` | the rest |

`parentPath` is what makes `recursive: true` usable — without it you would not know where a nested entry came from.

```mjs
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const entries = await readdir('./src', { withFileTypes: true, recursive: true });
const jsFiles = entries
  .filter((d) => d.isFile() && d.name.endsWith('.js'))
  .map((d) => join(d.parentPath, d.name));
```

### `opendir` and `fs.Dir`

`opendir` returns an `fs.Dir` — a directory *stream*. You iterate it, and entries are read in batches instead of all at once.

```mjs
import { opendir } from 'node:fs/promises';

await using dir = await opendir('./huge-tree', { recursive: true, bufferSize: 128 });
for await (const dirent of dir) {
  if (dirent.isFile()) await handle(dirent);
}
```

| Option | Default | Effect |
|---|---|---|
| `encoding` | `'utf8'` | encoding for the path and subsequent reads |
| `bufferSize` | `32` | entries buffered internally; higher is faster and uses more memory |
| `recursive` | `false` | the `Dir` iterates all sub-files and directories |

`fs.Dir` implements `Symbol.asyncDispose` and `Symbol.dispose` (both stable since v24.2.0), so `await using` closes it. If you iterate with `for await`, the `Dir` is closed automatically when the loop finishes — but *not* if you `break` out of the loop into an early return without disposal, which is exactly why `await using` is worth the two extra characters.

**Choose `readdir` for directories you know are small. Choose `opendir` when the size is unbounded or attacker-influenced.**

### `mkdir`, `rm`, and the death of recursive `rmdir`

```mjs
import { mkdir, rm } from 'node:fs/promises';

const created = await mkdir('./a/b/c', { recursive: true });  // → './a' or undefined
await rm('./a', { recursive: true, force: true });            // rm -rf
```

`mkdir(path, { recursive, mode })` — `mode` defaults to `0o777` (subject to umask) and is not supported on Windows. With `recursive: true`, an existing directory is not an error and the return value is the **first directory created**, or `undefined` if nothing needed creating. Without it, an existing path rejects with `EEXIST`.

`rm(path, options)` is the modern deletion primitive:

| Option | Default | Effect |
|---|---|---|
| `force` | `false` | ignore errors when `path` does not exist |
| `recursive` | `false` | recursive removal; failures are retried |
| `maxRetries` | `0` | retries on `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`, `EPERM` |
| `retryDelay` | `100` | milliseconds of linear backoff added per attempt |

`maxRetries` and `retryDelay` are ignored unless `recursive` is `true`. They exist for Windows and for network shares, where a virus scanner or an indexer can hold a handle open for a fraction of a second after you asked for the delete.

`rmdir(path)` still exists but removes only an *empty* directory. Its `recursive` option is **End-of-Life as of v25.0.0** (DEP0147) — removed, not merely deprecated — along with the older `maxBusyTries` and `emfileWait`. The `options` argument is accepted for compatibility and ignored. On a file rather than a directory, `rmdir` rejects with `ENOENT` on Windows and `ENOTDIR` on POSIX.

### `glob`

`fs.glob`, `fs.globSync`, and `fsPromises.glob` arrived in v22.0.0 and were marked stable in v24.0.0 / v22.17.0. The promise form returns an async iterator; `globSync` returns an array.

```mjs
import { glob } from 'node:fs/promises';

for await (const entry of glob(['src/**/*.js', 'test/**/*.js'], {
  cwd: process.cwd(),
  exclude: ['**/node_modules/**'],
  withFileTypes: true,
})) {
  console.log(entry.parentPath, entry.name);
}
```

| Option | Default | Effect |
|---|---|---|
| `cwd` | `process.cwd()` | base directory; accepts a `URL` since v24.1.0 / v22.17.0 |
| `exclude` | `undefined` | a predicate returning `true` to exclude, or an array of glob patterns |
| `followSymlinks` | `false` | follow symlinks to directories when expanding `**` (v26.1.0 / v24.16.0) |
| `withFileTypes` | `false` | yield `Dirent`s instead of path strings |

Negation patterns such as `'!foo.js'` are **not** supported in `exclude`; pass positive patterns describing what to drop. When `followSymlinks` is on, detected symlink cycles are not traversed recursively.

## Links and `realpath`

```mjs
import { symlink, link, readlink, realpath, lstat } from 'node:fs/promises';

await symlink('/opt/app/releases/v42', '/opt/app/current');  // symbolic link
await link('data.bin', 'data.bin.bak');                      // hard link, same inode
await readlink('/opt/app/current');                          // '/opt/app/releases/v42'
await realpath('/opt/app/current/bin');                      // fully resolved, no links
```

A **hard link** is a second name for the same inode. Both names are equal; the data survives until the last one is unlinked. Hard links cannot cross file systems and, on most systems, cannot point at directories.

A **symbolic link** is a small file whose contents are a path. It can dangle, can cross file systems, and can point at a directory.

`symlink(target, path[, type])` takes a `type` that is used **only on Windows**: `'dir'`, `'file'`, or `'junction'`. Since v19.0.0, passing `null` (the default) makes Node autodetect from `target`, falling back to `'file'` if the target does not exist. Junction points require an absolute destination — Node normalizes `target` for you — and on NTFS they can only point at directories. On Windows, creating symbolic links may also require Developer Mode or elevation, which is why deployment tooling that works on Linux often needs a junction on Windows.

`realpath(path)` resolves every symlink and `..` segment down to the canonical absolute path. On Linux with musl libc, `procfs` must be mounted at `/proc` for it to work; glibc has no such requirement.

### The security angle

Following links is how a path check gets bypassed. If your service serves files from `/srv/public` and an attacker can create `/srv/public/escape → /etc`, then a "safe" request for `escape/passwd` reads a file outside your root. Three defences, in order of strength:

1. **`realpath` then prefix-check.** Resolve the requested path with `realpath()` and verify it is still inside your root *after* resolution. This is correct but has a TOCTOU window: the link can change between the check and the open.
2. **`lstat` and refuse symlinks.** If your content directory should never contain links, `lstat` each component and reject `isSymbolicLink()`.
3. **Open with `O_NOFOLLOW`.** `fs.constants.O_NOFOLLOW` makes the open itself fail if the final component is a symbolic link. This closes the race, because the check and the use are one syscall. It does not protect intermediate directory components.

Note also that `cp()` follows symlinks unless you set `dereference` or `verbatimSymlinks`, and that `copyFile()` always follows them — copying a tree containing a link to `/etc` will happily copy `/etc`.

## Watching the file system

Two mechanisms, with very different characters.

| | `fs.watch()` | `fs.watchFile()` |
|---|---|---|
| Mechanism | OS change notifications | `stat` polling |
| Returns | `fs.FSWatcher` | `fs.StatWatcher` |
| Listener args | `(eventType, filename)` | `(currentStats, previousStats)` |
| Watches directories | yes | no (single path) |
| Recursive | on supported platforms | no |
| Cost | near zero when idle | one `stat` per interval, forever |
| Reliability on NFS/SMB | poor | works |
| Threadpool | exempt (`fs.FSWatcher` is the documented exception) | polls with `stat` |

`fs.watch` is the one to reach for. `fs.watchFile` polls, defaulting to `interval: 5007` ms, and the docs recommend `fs.watch` wherever it works. Stop a `watchFile` with `fs.unwatchFile(filename[, listener])`.

### What each platform actually does

| Platform | Backend | Recursive |
|---|---|---|
| Linux | `inotify(7)` | yes, since v19.1.0 |
| macOS | `kqueue(2)` for files, `FSEvents` for directories | yes |
| BSD | `kqueue(2)` | no |
| Windows | `ReadDirectoryChangesW` | yes |
| SunOS / Solaris / SmartOS | event ports | no |
| AIX | `AHAFS` (must be enabled) | yes, since v19.1.0 |
| IBM i | not supported | — |

On network file systems (NFS, SMB) and on host mounts inside virtualization such as Docker or Vagrant, watching can be unreliable or impossible, and `fs.watch()` may throw.

### Why events are duplicated, missing, or wrong

- **`eventType` is only ever `'rename'` or `'change'`.** `'rename'` fires whenever a name appears or disappears in a directory — creation and deletion both look the same.
- **`filename` may be `null`.** It is supported on Linux, macOS, Windows, and AIX, and even there it is not guaranteed. Always have a fallback path.
- **One logical save produces several events.** Editors write a temp file, `fsync`, rename over the original, and update metadata. Your watcher sees three or four events for what the user experienced as one Ctrl-S.
- **Watches follow inodes, not paths.** On Linux and macOS, `fs.watch` resolves the path to an inode and watches *that*. Delete and recreate the file and you get an event for the delete, then silence forever — the watcher is still attached to the old inode. This is the single most common "my watcher stopped working" bug.
- **Windows has its own edges.** No events are emitted if the watched directory is moved or renamed, and deleting a watched directory reports `EPERM`.
- **`fs.watch` is not a security mechanism.** On Windows it monitors the directory rather than specific files, so a file can be substituted and the watcher will happily report changes on the replacement.
- **AIX** reports two notifications for a single save — one for the new content, one for the truncation.

### Watching in practice

Debounce, always. Collapse a burst of events into one action, and re-verify the world rather than trusting the event.

```mjs
import { watch } from 'node:fs';

function watchDebounced(dir, onChange, delay = 100) {
  const pending = new Map();
  const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
    if (!filename) { onChange(null); return; }   // no name: rescan everything
    clearTimeout(pending.get(filename));
    pending.set(filename, setTimeout(() => {
      pending.delete(filename);
      onChange(filename);
    }, delay));
  });
  watcher.on('error', (err) => console.error('watch failed:', err.code));
  return watcher;
}
```

`fs.watch` options: `persistent` (default `true` — set `false`, or call `watcher.unref()`, to let the process exit), `recursive`, `encoding`, `signal` for `AbortSignal`-based shutdown, `throwIfNoEntry` (default `true`, added v26.1.0 / v24.16.0), and `ignore`, which accepts a glob string (matched with `minimatch`), a `RegExp`, a predicate, or an array of these.

The promise form is an async iterator, with backpressure controls the event form lacks:

```mjs
import { watch } from 'node:fs/promises';

const ac = new AbortController();
try {
  for await (const { eventType, filename } of watch('./src', {
    recursive: true,
    signal: ac.signal,
    maxQueue: 2048,
    overflow: 'throw',
  })) {
    console.log(eventType, filename);
  }
} catch (err) {
  if (err.name !== 'AbortError') throw err;
}
```

`maxQueue` defaults to `2048` and `overflow` to `'ignore'` — meaning that under a burst larger than the queue, events are silently dropped with a warning. `'throw'` turns that into a loud failure, which is usually what you want in a build tool.

**The practical advice: never make correctness depend on receiving an event.** Use watching to *trigger* work, and make the work idempotent and self-verifying. If losing a change is unacceptable, poll or use a queue.

## File streams

`createReadStream` and `createWriteStream` are the constant-memory alternative to `readFile`/`writeFile`. Both live on `node:fs` (not `fs/promises`); the promise equivalents are `filehandle.createReadStream()` and `filehandle.createWriteStream()`.

### `createReadStream(path[, options])`

| Option | Default | Notes |
|---|---|---|
| `flags` | `'r'` | note the plural — it is `flags` here, `flag` on `readFile` |
| `encoding` | `null` | `null` yields `Buffer`s |
| `fd` | `null` | an integer or a `FileHandle`; `path` is then ignored and no `'open'` event fires |
| `mode` | `0o666` | only if the file is created |
| `autoClose` | `true` | close the descriptor on `'end'` or `'error'` |
| `emitClose` | `true` | emit `'close'` after destroy |
| `start` | — | first byte to read, **inclusive** |
| `end` | `Infinity` | last byte to read, **inclusive** |
| `highWaterMark` | `65536` | 64 KiB read size |
| `signal` | `null` | `AbortSignal` |
| `fs` | `null` | override `open`/`read`/`close` — useful for testing |
| `windowsHandle` | `null` | a raw Win32 `HANDLE`; Windows only, throws elsewhere |

`start` and `end` are both inclusive and zero-based, so the last ten bytes of a 100-byte file are `{ start: 90, end: 99 }`. That off-by-one is exactly what HTTP `Range` headers use, which is not a coincidence.

If `autoClose` is `false`, the descriptor is **never** closed — not even on error. That is your leak to manage.

### `createWriteStream(path[, options])`

| Option | Default | Notes |
|---|---|---|
| `flags` | `'w'` | use `'a'` to append, `'r+'` to modify in place |
| `encoding` | `'utf8'` | for string writes |
| `fd` | `null` | integer or `FileHandle` |
| `mode` | `0o666` | only if created |
| `autoClose` | `true` | close on `'error'` or `'finish'` |
| `emitClose` | `true` | emit `'close'` after destroy |
| `start` | — | byte offset to begin writing at |
| `highWaterMark` | see `stream.getDefaultHighWaterMark()` | buffer threshold |
| `flush` | `false` | flush the descriptor before closing |
| `signal` | `null` | `AbortSignal` |
| `fs` | `null` | override `open`/`write`/`writev`/`close` |
| `windowsHandle` | `null` | Windows only |

Using `start` to patch bytes in the middle of a file requires `flags: 'r+'`; the default `'w'` truncates the file first, which is rarely what you meant.

`flush: true` is the durability switch: without it, `'finish'` means "handed to the kernel," not "on disk."

Always use `pipeline`, never `.pipe()`, so errors propagate and every stream is destroyed:

```mjs
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

await pipeline(
  createReadStream('access.log'),
  createGzip(),
  createWriteStream('access.log.gz', { flush: true }),
);
```

## Reading a huge file line by line

The wrong way is `(await readFile(p, 'utf8')).split('\n')`: it needs the whole file in memory twice over — once as a string, once as an array of strings. The right way pairs a read stream with `node:readline`.

```mjs
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: createReadStream('/var/log/huge.log'),
  crlfDelay: Infinity,
});

let errors = 0;
for await (const line of rl) {
  if (line.includes('"level":"error"')) errors++;
}
console.log(errors);
```

`crlfDelay: Infinity` is the part everyone forgets. Without it, a `\r` and `\n` that arrive in different chunks — which happens whenever a CRLF straddles a 64 KiB boundary — are treated as two separate line endings, and you silently get phantom empty lines. Set it whenever the input may have Windows line endings, which in practice means always.

Memory stays flat regardless of file size, because at any moment you hold one 64 KiB chunk plus one line.

`FileHandle` has a shortcut that builds the same thing, `filehandle.readLines([options])` (v18.11.0), taking the `createReadStream` options:

```mjs
import { open } from 'node:fs/promises';

await using file = await open('/var/log/huge.log');
for await (const line of file.readLines({ crlfDelay: Infinity })) {
  if (line.startsWith('ERROR')) console.log(line);
}
```

For byte-oriented consumers, `filehandle.readableWebStream([options])` (stable since v24.0.0 / v22.17.0) returns a WHATWG `ReadableStream` of bytes — the right shape for `Response` bodies and `TransformStream` pipelines. It may only be called once per handle, and `autoClose` defaults to **`false`**, so the handle stays open when the stream ends unless you say otherwise.

```mjs
await using file = await open('./video.mp4');
return new Response(file.readableWebStream({ autoClose: true }));
```

## Atomic writes and durability

`writeFile('config.json', data)` opens with flag `'w'`, which **truncates the file to zero immediately**, then writes. Between those two moments the file is empty on disk. A crash there — or a reader that opens the file at that instant — sees an empty or half-written config.

The fix is write-then-rename.

```mjs
import { open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

async function writeAtomic(target, data) {
  const tmp = join(dirname(target), `.${randomUUID()}.tmp`);
  try {
    const fh = await open(tmp, 'wx', 0o600);
    try {
      await fh.writeFile(data);
      await fh.sync();               // durable before the rename
    } finally {
      await fh.close();
    }
    await rename(tmp, target);       // atomic swap
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
```

Four things make this work, and each has a condition.

**1. The temp file is in the same directory as the target.** `rename()` is atomic only *within a single file system*. Across devices it fails outright with `EXDEV`. Putting the temp file in `/tmp` is the classic bug: `/tmp` is very often a separate mount (tmpfs, in most containers), so the rename fails on the production machine and worked on your laptop.

**2. `rename` replaces the destination in one step.** A concurrent reader sees either the entire old file or the entire new one, never a mixture. It never sees a missing file, which is the crucial improvement over "delete then write."

**3. `fh.sync()` before the rename.** `filehandle.sync()` is `fsync(2)`: it forces queued I/O for that descriptor to the storage device. `filehandle.datasync()` is `fdatasync(2)` — the same, minus modified metadata, and therefore cheaper when the file size has not changed. Without one of these you have ordering (the rename is atomic) but not durability: a power cut can leave the new name pointing at content that never reached disk.

**4. The rename itself is a metadata change.** On POSIX, making the *directory entry* durable requires `fsync` on the directory's own descriptor:

```mjs
// POSIX only — opening a directory this way is not portable to Windows.
const dirHandle = await open(dirname(target), 'r');
try {
  await dirHandle.sync();
} finally {
  await dirHandle.close();
}
```

That last step is what databases do and what most applications skip. Skip it knowingly.

Cheaper alternatives for the common case: `writeFile(path, data, { flush: true })` calls `filehandle.sync()` for you but does not give you atomicity, and `createWriteStream(path, { flush: true })` does the same for streams. Use `flush` when losing the write is the risk; use temp-plus-rename when a *torn* file is the risk; use both when the file matters.

## Streaming a file over HTTP, with ranges

This ties the chapter together: `stat` for size, `Range` parsing, `start`/`end` on the read stream, and `pipeline` for error handling.

```mjs
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

createServer(async (req, res) => {
  const file = '/srv/media/clip.mp4';
  let size;
  try {
    ({ size } = await stat(file));
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end();
    return;
  }

  const headers = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' };
  let start = 0;
  let end = size - 1;
  let status = 200;

  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (match) {
    const [, rawStart, rawEnd] = match;
    if (rawStart === '') {
      start = Math.max(0, size - Number(rawEnd));   // suffix range: bytes=-500
    } else {
      start = Number(rawStart);
      if (rawEnd !== '') end = Math.min(Number(rawEnd), size - 1);
    }
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    status = 206;
    headers['content-range'] = `bytes ${start}-${end}/${size}`;
  }

  headers['content-length'] = end - start + 1;
  res.writeHead(status, headers);

  try {
    await pipeline(createReadStream(file, { start, end }), res);
  } catch {
    res.destroy();   // client disconnected, or the disk failed mid-transfer
  }
}).listen(3000);
```

`start` and `end` map one-to-one onto HTTP's inclusive byte ranges, so no arithmetic adjustment is needed. `pipeline` destroys the read stream when the client disconnects — without it, an aborted download leaks a descriptor for as long as the read takes to finish.

## Common mistakes

### ❌ Renaming across file systems

```mjs
await writeFile('/tmp/config.tmp', data);
await rename('/tmp/config.tmp', '/etc/app/config.json');   // EXDEV in a container
```

`/tmp` is frequently a separate mount. `rename` is only atomic — and only *works* — within one file system.

```mjs
// ✅ temp file next to the target
const tmp = join(dirname(target), `.${randomUUID()}.tmp`);
await writeFile(tmp, data);
await rename(tmp, target);
```

### ❌ Trusting a watcher to be complete

```mjs
watch('./uploads', async (eventType, filename) => {
  await ingest(join('./uploads', filename));   // filename may be null; may fire 3×
});
```

`filename` is not guaranteed on every platform, one save produces several events, and a delete-and-recreate detaches the watch entirely.

```mjs
// ✅ debounce, guard, and re-verify
const scheduled = new Map();
watch('./uploads', (eventType, filename) => {
  if (!filename) return void rescanEverything();
  clearTimeout(scheduled.get(filename));
  scheduled.set(filename, setTimeout(async () => {
    scheduled.delete(filename);
    const p = join('./uploads', filename);
    const st = await stat(p).catch(() => null);   // it may be gone again
    if (st?.isFile()) await ingest(p);
  }, 150));
});
```

### ❌ `recursive: true` on an unbounded tree

```mjs
const files = await readdir('/data', { recursive: true });   // materializes everything
```

The array is built completely before the promise resolves. A million entries is a million strings held at once, plus the array.

```mjs
// ✅ stream the entries
await using dir = await opendir('/data', { recursive: true });
for await (const dirent of dir) {
  if (dirent.isFile()) await handle(join(dirent.parentPath, dirent.name));
}
```

### ❌ Splitting a file on newlines

```mjs
const lines = (await readFile('huge.log', 'utf8')).split('\n');
```

Peak memory is roughly twice the file size, and a file large enough to exceed `buffer.constants.MAX_STRING_LENGTH` throws before you see a single line.

```mjs
// ✅ constant memory
const rl = createInterface({ input: createReadStream('huge.log'), crlfDelay: Infinity });
for await (const line of rl) handle(line);
```

## Production notes

- **The file watcher APIs are the documented exception to libuv threadpool use.** Watchers are cheap while idle. But each one is an OS resource — `inotify` has a per-user watch limit (`fs.inotify.max_user_watches`), and a recursive watch on `node_modules` can exhaust it and make *other* processes' watchers fail. Watch narrowly, and use `ignore` to prune.
- **Cap concurrency during tree walks.** `for await` over an `fs.Dir` is naturally sequential; `Promise.all` over a `readdir` result is not. Fanning out across 100,000 entries exhausts descriptors (`EMFILE`) long before it saturates the disk. 32–64 in flight is a good default.
- **Atomic write plus `fsync` costs real latency.** An `fsync` on a spinning disk is milliseconds; on a networked volume it can be tens. Do not put one on a per-request path. Batch writes, or accept page-cache durability and make recovery idempotent.
- **Deleting a large tree is slow and interruptible.** `rm({ recursive: true })` is thousands of syscalls. If the process dies halfway you are left with a partial tree. Rename the directory to a `.trash-<uuid>` name first — that part is atomic — then delete at leisure.
- **`emitClose: false` will burn you.** Code that waits for `'close'` to know a file is fully flushed will hang forever if someone turned the event off. Leave both `autoClose` and `emitClose` at their defaults unless you are deliberately sharing a descriptor.
- **Watchers must handle `'error'`.** An unhandled `'error'` on an `FSWatcher` is an uncaught exception that kills the process. `EPERM` when a watched directory is deleted on Windows, and `ENOSPC` when the inotify limit is reached on Linux, are both routine.
- **Symlinks are an attack surface in any user-writable directory.** `cp` follows them by default; `copyFile` always does; a naive walker will follow a link into `/` and never come back. Use `lstat` in walkers and `realpath` plus a prefix check at every trust boundary.
- **`glob` with `**` on a deep tree is a full traversal.** It is not indexed. In a hot path, keep your own index and refresh it on a schedule; reserve `glob` for tooling and startup.

## Exercises

1. **Compare directory walkers.** Build a tree of 200,000 files. Count `.js` files three ways: `readdir` with `recursive: true`, `opendir` with `recursive: true`, and a hand-rolled queue with a concurrency limit of 32. *Success:* a table of wall time and peak RSS for each, and a one-line recommendation.

2. **Characterize your platform's watcher.** Watch a directory and record every `(eventType, filename)` for: creating a file, appending to it, saving it from a real editor, renaming it, and deleting-then-recreating it. *Success:* a written table of what you observed, including how many events each action produced and whether the watcher survived the recreate.

3. **Implement `writeAtomic` with a durability switch.** Support `{ durable: false | 'file' | 'directory' }` mapping to no fsync, `fh.sync()`, and fsync of the parent directory too. Benchmark 1,000 writes at each level. *Success:* correct behaviour on all three plus measured latency, and a `EXDEV` test proving the temp file must be co-located.

4. **Write a `tail -f`.** Stream the last 10 lines of a file, then follow appends using `fs.watch`, handling truncation (size shrank: restart from 0) and rotation (inode changed: reopen by path). *Success:* it keeps working across `logrotate`-style rename-and-recreate, verified by script.

5. **Harden the range server.** Extend the HTTP example to reject paths outside its root, refuse symlinks, support conditional requests via `If-Range` and `ETag` derived from `stat`, and cap concurrent open streams. *Success:* a test suite covering `bytes=0-`, `bytes=-500`, `bytes=100-199`, an unsatisfiable range, a traversal attempt, and a symlink escape.

## Recap

- `readdir` with `withFileTypes: true` avoids a `stat` per entry; `recursive: true` materializes the whole tree, so prefer `opendir` when the size is unbounded.
- `rm({ recursive: true, force: true })` replaced `rmdir`'s `recursive` option, which is End-of-Life since v25.0.0 (DEP0147).
- `fs.watch` uses OS notifications and does not consume a threadpool thread; `fs.watchFile` polls every 5007 ms by default and should be a fallback.
- Watch events are coalesced, duplicated, sometimes nameless, and attached to inodes rather than paths. Debounce, re-verify, and never make correctness depend on receiving one.
- `createReadStream`'s `start`/`end` are inclusive and map directly onto HTTP `Range`.
- `rename` is atomic only within one file system; a temp file in the wrong directory produces `EXDEV`.
- Atomicity and durability are different problems: rename gives you the first, `fsync`/`flush: true` gives you the second.
- `readline` with `crlfDelay: Infinity` reads any size of file in constant memory; without it, CRLF straddling a chunk boundary yields phantom lines.

## Where to go next

- [Chapter 22 — File System I: Reading, Writing, and Metadata](../part4-system/22-filesystem-basics.md) for the flags, `FileHandle`, and `stat` fields this chapter builds on.
- [Chapter 24 — Paths, File URLs, and Cross-Platform Layout](../part4-system/24-paths.md) for validating the paths a walker or server accepts.
- [Chapter 19 — Streams II: Duplex, Transform, pipeline, Backpressure](../part3-data/19-streams-advanced.md) for the `pipeline` semantics every example here relies on.
- [Chapter 27 — OS Information, TTY, and Readline](../part4-system/27-os-tty-readline.md) for the rest of `node:readline`.
- [Chapter 35 — HTTP/1.1 Servers](../part5-networking/35-http-servers.md) for the response lifecycle behind the range example.
- Official documentation: <https://nodejs.org/docs/latest/api/fs.html>
