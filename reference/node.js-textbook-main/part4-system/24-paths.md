---
chapter: 24
part: "Part IV — System Interfaces"
title: "Paths, File URLs, and Cross-Platform Layout"
level: intermediate
reading_time: "28 min"
prerequisites: [4, 5, 22]
source_docs:
  - "doc/api/path.md"
  - "doc/api/url.md"
  - "doc/api/esm.md"
  - "doc/api/modules.md"
  - "doc/api/fs.md"
source_url: "https://nodejs.org/docs/latest/api/path.html"
node_baseline: "27.0.0-pre"
---

# Chapter 24 — Paths, File URLs, and Cross-Platform Layout

**What you will learn**

- The precise difference between `path.join()` and `path.resolve()`, and which one your bug is.
- How to decompose and rebuild paths with `parse`/`format`, and the traps in `extname` and `basename`.
- What actually differs on Windows: drive-relative directories, UNC paths, case, reserved names, and long paths.
- Why `import.meta.url` must go through `fileURLToPath()` and never through `.replace()` or `.slice()`.
- How to get the current module's directory in ESM and in CommonJS.
- How to validate a user-supplied path so that it cannot escape a root — and why string prefix matching alone does not.

## Why this matters

Path bugs are quiet. `path.join(base, userInput)` looks correct in every code review and produces `/srv/public/../../etc/passwd` the moment `userInput` is `../../etc/passwd`. A service deployed to `C:\Program Files\app` works fine until someone reads `import.meta.url` and strips `file://` with a string method, at which point every path contains `%20` and nothing opens. A test suite passes on macOS and fails on Linux because `Config.json` and `config.json` are the same file on one and not the other.

`node:path` is small — about a dozen functions — and every one of them is pure string manipulation. It never touches the disk, never checks whether anything exists, and never resolves a symlink. Understanding exactly what each one does to a string, and pairing it with the right file-system call when reality matters, eliminates an entire category of production incident.

## `node:path` does not touch the disk

Every function in `node:path` operates on strings. `path.resolve('/a/b', '../c')` returns `/a/c` whether or not `/a` exists, and even if `/a/b` is a symlink pointing at `/x/y` — in which case the real answer is `/x/c`. The module only knows about `.` and `..` as text.

When the answer must reflect the file system, you need `fs`: `realpath()` to resolve symlinks, `stat()`/`lstat()` to learn what something is, `access()` to test permission. Chapter 22 covers those. Keep the two ideas separate in your head and most confusion evaporates.

```mjs
import path from 'node:path';
```

```cjs
const path = require('node:path');
```

## `join` vs `resolve`

This is the single most common misunderstanding in the module.

**`path.join(...segments)`** concatenates segments with the platform separator and then normalizes. The result is absolute only if the *first* segment was absolute. Zero-length segments are ignored; an empty result becomes `'.'`.

**`path.resolve(...segments)`** processes right to left, prepending segments until it has an absolute path. If it runs out of segments without one, it prepends `process.cwd()`. **The result is always absolute.**

```js
path.join('/foo', 'bar', 'baz/asdf', 'quux', '..');
// '/foo/bar/baz/asdf'

path.resolve('/foo/bar', './baz');
// '/foo/bar/baz'

path.resolve('/foo/bar', '/tmp/file/');
// '/tmp/file'          ← an absolute segment discards everything to its left

path.join('/foo/bar', '/tmp/file/');
// '/foo/bar/tmp/file'  ← join has no such rule
```

| | `join` | `resolve` |
|---|---|---|
| Direction | left to right | right to left |
| Result absolute? | only if segment 1 is | **always** |
| Absolute segment in the middle | treated as ordinary text | discards everything before it |
| Uses `process.cwd()` | never | when no segment is absolute |
| Trailing separator | preserved | removed (unless the result is a root) |
| No arguments | returns `'.'` | returns `process.cwd()` |

The rule that keeps you out of trouble:

- **Use `join` to build a path out of parts you control.** `join(dataDir, 'users', `${id}.json`)`.
- **Use `resolve` to turn something into a canonical absolute path** before comparing it, storing it, or checking it against a boundary.

The dangerous case is `join` with untrusted input: it happily normalizes `..` segments right out of your directory. `resolve` does the same thing, but because it always produces an absolute path, it is the correct *first half* of a security check (see the traversal section below).

## `normalize`

`path.normalize(p)` resolves `.` and `..` textually and collapses repeated separators. Trailing separators are preserved; an empty string yields `'.'`.

```js
path.normalize('/foo/bar//baz/asdf/quux/..');   // '/foo/bar/baz/asdf'
path.win32.normalize('C:////temp\\\\/\\/\\/foo/bar');  // 'C:\\temp\\foo\\bar'
```

The docs are careful to note that this is not strictly POSIX-conformant: two leading slashes are collapsed to one, even though a few POSIX systems assign special meaning to exactly two, and removing `..` segments can change how the underlying system resolves a path through symlinks. `normalize` is a string tidy-up, not a truth.

## Decomposing and rebuilding

```js
path.dirname('/foo/bar/baz/quux');   // '/foo/bar/baz'
path.basename('/foo/bar/baz.html');  // 'baz.html'
path.basename('/foo/bar/baz.html', '.html');  // 'baz'
path.extname('index.coffee.md');     // '.md'
```

`extname` has a specific and occasionally surprising definition: it is everything from the *last* `.` in the basename to the end, and it returns `''` when the only `.` is the first character of the basename.

| Input | `extname` |
|---|---|
| `'index.html'` | `'.html'` |
| `'index.coffee.md'` | `'.md'` |
| `'index.'` | `'.'` |
| `'index'` | `''` |
| `'.index'` | `''` |
| `'.index.md'` | `'.md'` |

`parse` and `format` are inverses:

```js
path.parse('/home/user/dir/file.txt');
// { root: '/', dir: '/home/user/dir', base: 'file.txt', ext: '.txt', name: 'file' }

path.format({ dir: '/home/user/dir', name: 'file', ext: '.md' });
// '/home/user/dir/file.md'
```

`format` has priority rules worth memorising: `dir` wins over `root`, and `base` wins over `name` + `ext`. Since v19.0.0 the leading dot is added to `ext` if you omit it, so `ext: 'txt'` and `ext: '.txt'` behave the same.

Changing a file's extension is `parse` plus `format`, not string surgery:

```mjs
function withExtension(p, ext) {
  const { dir, name } = path.parse(p);
  return path.format({ dir, name, ext });
}
withExtension('/a/b/report.tar.gz', '.txt');   // '/a/b/report.tar.txt'
```

Note that `basename` is case-sensitive even on Windows: `path.win32.basename('C:\\foo.HTML', '.html')` returns `'foo.HTML'`, because the suffix did not match exactly. The file system may be case-insensitive; `node:path` is not.

## `relative`, `isAbsolute`, `sep`, `delimiter`

`path.relative(from, to)` returns the path from `from` to `to`, resolving both against `process.cwd()` first. Identical inputs give `''`. Empty strings are replaced by the cwd.

```js
path.relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb');
// '../../impl/bbb'
```

`path.isAbsolute(p)` tests the literal string. The documentation says so bluntly: **it is not safe for mitigating path traversal.** `'/baz/../..'` is absolute; that tells you nothing about where it points.

`path.sep` is `'/'` on POSIX and `'\\'` on Windows. `path.delimiter` is `':'` on POSIX and `';'` on Windows — that is the `PATH` environment variable separator, not the path separator, and mixing them up is a classic bug.

```mjs
import { delimiter } from 'node:path';
const dirs = process.env.PATH.split(delimiter);
```

`path.matchesGlob(p, pattern)` (stable since v24.8.0 / v22.20.0) tests a path against a glob without touching the disk — useful for filters in `cp`, `glob`, and `fs.watch`.

## `path.posix` and `path.win32`

`node:path` behaves according to the platform it is running on. `path.basename('C:\\temp\\myfile.html')` returns the whole string on POSIX (there are no backslash separators there) and `'myfile.html'` on Windows.

For deterministic behaviour, use the explicit variants — available as properties and, since v15.3.0, as their own module specifiers:

```mjs
import { posix, win32 } from 'node:path';
import posixPath from 'node:path/posix';
import win32Path from 'node:path/win32';

posix.basename('/tmp/myfile.html');          // 'myfile.html' everywhere
win32.basename('C:\\temp\\myfile.html');     // 'myfile.html' everywhere
```

When to force one:

- **`path.posix`** for anything that is not a local file path: URL path components, archive entry names (tar and zip use forward slashes), container paths, S3 keys, Git paths. Using platform `path` on these produces backslashes on Windows and corrupts the data.
- **`path.win32`** when you are generating Windows paths from a non-Windows machine — a cross-platform installer, a CI job producing Windows artifacts.
- **Platform `path`** for local file system work. That is the default and usually right.

## Windows path reality

### Drive letters and per-drive working directories

Windows keeps a working directory *per drive*. A path like `C:foo` means "foo, relative to the current directory on drive C" — which is not the same as `C:\foo`. Both `node:path` and `node:fs` inherit this: `path.resolve('C:\\')` can differ from `path.resolve('C:')`, and `fs.readdirSync('C:\\')` can return something different from `fs.readdirSync('C:')`. Always include the separator when you mean the drive root.

### UNC paths

`\\server\share\path` addresses a network location. `path.isAbsolute('//server')` and `path.isAbsolute('\\\\server')` are both `true`, and `path.relative` has included the leading slashes of UNC paths in its output since v6.8.0. Treat `\\server\share` as the root; there is no drive letter.

### Separators

Windows accepts both `/` and `\` as separators, but `node:path` only ever *emits* `\`. Consequences: never compare paths with `===` unless you have normalized both, and never build a URL by concatenating platform path segments.

### Case

NTFS is case-insensitive by default (and case-preserving). `Config.json` and `config.json` open the same file on Windows and macOS, and different files on Linux. This is the number one cause of "works locally, fails in CI." Never rely on case to distinguish files, and pick one casing convention for the repository. Remember that `node:path` itself is always case-sensitive, so `basename(p, '.HTML')` will not strip `.html`.

### Reserved characters and names

The characters `< > : " / \ | ? *` are reserved on Windows, as documented in Microsoft's *Naming Files, Paths, and Namespaces* — which is what the `fs.open()` documentation links to. Under NTFS a colon in a filename opens an alternate data stream rather than a file, which is a genuinely surprising failure. The classic reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) cannot be used as filenames either, with or without an extension.

If your application creates files from user-supplied names, sanitize against this set. A filename that is fine on Linux can be uncreatable on Windows.

### Long paths

Windows has historically limited paths to 260 characters (`MAX_PATH`), and although modern Windows can opt out of that limit, plenty of APIs still enforce it. The escape hatch is the extended-length prefix `\\?\`, and Node exposes it as `path.toNamespacedPath(p)`: on Windows it returns the namespace-prefixed equivalent, and on POSIX it is a no-op that returns its argument unchanged.

```mjs
import { toNamespacedPath } from 'node:path';
const deep = toNamespacedPath('C:\\a\\very\\deep\\...\\file.txt');
```

Note that extended-length paths are *not* normalized by the OS — `.` and `..` are taken literally — so normalize before prefixing.

## File URLs

Node accepts `file:` URLs almost everywhere a path is accepted, and ESM identifies modules by URL. Converting between the two is where the bugs live.

### The two functions

```mjs
import { fileURLToPath, pathToFileURL } from 'node:url';

fileURLToPath('file:///srv/data/report.csv');   // '/srv/data/report.csv'
pathToFileURL('/srv/data/report.csv');          // URL { href: 'file:///srv/data/report.csv' }
```

Both take an optional `{ windows }` option (v22.1.0 / v20.13.0): `true` to force Windows semantics, `false` for POSIX, `undefined` (the default) for the current platform. That is how you write a cross-platform test for Windows path handling on a Linux CI runner.

`url.fileURLToPathBuffer(url[, options])` (v24.3.0 / v22.18.0) is the same conversion returning a `Buffer`, for URLs whose percent-encoded segments are not valid UTF-8.

### Why string surgery fails

The temptation is `import.meta.url.replace('file://', '')`. It is wrong in at least four distinct ways, each of which the documentation demonstrates:

| Input | `new URL(...).pathname` / naive slicing | `fileURLToPath()` |
|---|---|---|
| `file:///hello world` | `/hello%20world` | `/hello world` |
| `file:///你好.txt` | `/%E4%BD%A0%E5%A5%BD.txt` | `/你好.txt` |
| `file:///C:/path/` | `/C:/path/` | `C:\path\` (Windows) |
| `file://nas/foo.txt` | `/foo.txt` | `\\nas\foo.txt` (Windows) |

Spaces and non-ASCII characters are percent-encoded in a URL and must be decoded. Windows drive letters gain a bogus leading slash. UNC hosts are dropped entirely, silently turning a network path into a local one. A user whose home directory contains a space — `C:\Users\Ana María\` — will hit this on their first run.

The reverse direction has its own traps. `new URL('/foo#1', 'file:')` treats `#1` as a fragment and produces `file:///foo`; `pathToFileURL('/foo#1')` correctly gives `file:///foo%231`. Likewise `%` in a filename must become `%25`: `pathToFileURL('/some/path%.c')` yields `file:///some/path%25.c`.

### Passing URLs straight to `fs`

Most `fs` functions accept a `string`, a `Buffer`, or a `URL` with the `file:` protocol, so you can often skip the conversion:

```mjs
import { readFile } from 'node:fs/promises';
const text = await readFile(new URL('./template.html', import.meta.url), 'utf8');
```

The rules `fs` enforces on file URLs: on Windows, a URL with a hostname becomes a UNC path, and a URL without a hostname must have a drive letter using `:` as the separator; on every other platform a hostname is unsupported and throws. Encoded slashes (`%2F`, `%2f`) are rejected everywhere, and on Windows encoded backslashes (`%5C`, `%5c`) are too — all with `ERR_INVALID_FILE_URL_PATH`.

## The current module's directory

### ESM

```mjs
console.log(import.meta.url);       // 'file:///srv/app/src/index.js'
console.log(import.meta.filename);  // '/srv/app/src/index.js'
console.log(import.meta.dirname);   // '/srv/app/src'
```

`import.meta.dirname` and `import.meta.filename` were added in v21.2.0 / v20.11.0 and became non-experimental in v24.0.0 / v22.16.0. `filename` is the `fileURLToPath()` of `import.meta.url`, with symlinks resolved; `dirname` is its `path.dirname()`. Both are **only present on `file:` modules** — a module loaded over `data:` or `https:` has neither, so library code that must work for any loader should derive them defensively:

```mjs
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
```

For resolving a sibling file, the `URL` constructor is often cleaner than any of this, because it needs no conversion at all:

```mjs
const schemaUrl = new URL('./schema.json', import.meta.url);
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
```

### CommonJS

`__filename` and `__dirname` are injected into every CJS module wrapper. `__filename` is the module's absolute path **with symlinks resolved**; `__dirname` is its `path.dirname()`. They do not exist in ESM — the replacements are `import.meta.filename` and `import.meta.dirname`.

```cjs
const { join } = require('node:path');
const schemaPath = join(__dirname, 'schema.json');
```

### `process.cwd()` is not your module directory

`process.cwd()` is wherever the *user* happened to be when they started the process. A package that reads `./config.json` relative to the cwd breaks the moment someone runs it from another directory. Anything shipped with your code is relative to `import.meta.dirname` or `__dirname`; only genuinely user-relative input (a CLI argument, a path from a config file) should be resolved against the cwd.

## Path traversal

A service that serves files from a root directory must guarantee that the resolved path stays inside that root. Getting this wrong is directory traversal, and it is still one of the most-exploited web vulnerabilities.

### Why the obvious checks fail

```mjs
// ❌ 1: rejecting '..' as a substring
if (userPath.includes('..')) throw new Error('nope');
```
It rejects the legitimate file `my..notes.txt`, and misses encoded forms, absolute paths, and symlinks entirely.

```mjs
// ❌ 2: join, then check the string
const full = path.join(root, userPath);
if (!full.startsWith(root)) throw new Error('nope');
```
`join` normalizes away `..` *before* you look, so `../../etc/passwd` is already gone — but with `root = '/srv/app'`, the path `/srv/app-secrets/keys.pem` also starts with `/srv/app`. A sibling directory whose name merely begins with your root's name passes the check.

```mjs
// ❌ 3: trusting isAbsolute
if (path.isAbsolute(userPath)) throw new Error('nope');
```
The docs state directly that `isAbsolute` is not safe for mitigating traversal. `'foo/../../../etc/passwd'` is not absolute.

### The correct check

Resolve to an absolute path, then compare against the root **plus a separator**, and handle the root-itself case:

```mjs
import path from 'node:path';

function safeResolve(root, userPath) {
  const base = path.resolve(root);
  const target = path.resolve(base, userPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw Object.assign(new Error('path escapes root'), { code: 'EPATHESCAPE' });
  }
  return target;
}

safeResolve('/srv/public', 'images/logo.png');      // '/srv/public/images/logo.png'
safeResolve('/srv/public', '../../etc/passwd');     // throws
safeResolve('/srv/public', '/etc/passwd');          // throws — resolve discards the base
safeResolve('/srv/public-secrets', 'x');            // unaffected: different root
```

The `+ path.sep` is what fixes the sibling-prefix hole. An equivalent formulation uses `path.relative`, which some people find easier to read:

```mjs
function isInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
```

Two more layers for anything security-critical:

1. **Resolve symlinks.** `safeResolve` is pure string work; a symlink inside the root can still point outside it. Call `fs.realpath()` on the result and re-run the prefix check. On Windows, remember case-insensitivity — compare case-folded, or you will accept `/SRV/PUBLIC/...`.
2. **Prefer an allowlist.** If the set of servable files is known — a manifest, a database row, a build output listing — look the request up in that set instead of computing a path from user input. No string check is as strong as never constructing the path in the first place.

Finally, a warning the URL documentation makes explicitly: `fileURLToPath()` **decodes** percent-encoded dot segments, so `%2e%2e` becomes `..` and is then normalized as real traversal. Encoded slashes are rejected, but encoded dots are not. Never treat `fileURLToPath()` as a security boundary — validate the path it returns.

## Common mistakes

### ❌ Stripping `file://` by hand

```mjs
const dir = path.dirname(import.meta.url.replace('file://', ''));
```

Breaks on spaces (`%20`), on non-ASCII names, on Windows drive letters (a leading `/` survives), and on UNC paths (the host disappears).

```mjs
// ✅
import { fileURLToPath } from 'node:url';
const dir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
```

### ❌ `join` with user input

```mjs
res.end(await readFile(path.join('/srv/public', req.query.file)));
```

`join` normalizes `..` and hands you a path outside the root without complaint.

```mjs
// ✅
const target = safeResolve('/srv/public', req.query.file);
res.end(await readFile(target));
```

### ❌ Hard-coding separators

```mjs
const p = `${dir}/assets/${name}`;
const parts = p.split('/');
```

On Windows `dir` contains backslashes, so the result mixes separators and the split produces garbage.

```mjs
// ✅
const p = path.join(dir, 'assets', name);
const parts = p.split(path.sep);
```

### ❌ Using platform `path` for non-file paths

```mjs
const key = path.join('uploads', userId, 'avatar.png');   // 'uploads\\42\\avatar.png' on Windows
await s3.putObject({ Key: key });
```

Object keys, URL paths, and archive entries always use forward slashes. Platform `path` corrupts them on Windows.

```mjs
// ✅
import { posix } from 'node:path';
const key = posix.join('uploads', userId, 'avatar.png');
```

## Production notes

- **Normalize once, at the boundary.** Convert every incoming path to a canonical absolute form the moment it enters your system, validate it there, and pass the canonical form onwards. Re-validating deep in the call stack means you are validating something already derived from unvalidated input.
- **Case sensitivity is a deployment difference, not a style preference.** macOS and Windows are usually case-insensitive; Linux is not. Enforce lowercase filenames in CI, or you will ship an import that only fails in production.
- **A path check without a `realpath` is only a string check.** In any directory a user can write to, symlinks defeat prefix matching. Either resolve links and re-check, or open with `fs.constants.O_NOFOLLOW` so the kernel enforces it atomically.
- **`process.cwd()` is not stable.** It is set by whoever launched the process and can be changed at runtime with `process.chdir()`. Never resolve bundled assets against it; use `import.meta.dirname` or `__dirname`.
- **Test Windows path handling without Windows.** `path.win32` and the `{ windows: true }` option on `fileURLToPath`/`pathToFileURL` let a Linux CI job exercise drive letters, UNC paths, and backslash normalization. There is no excuse for discovering these in a user bug report.
- **Sanitize user-supplied filenames against the Windows reserved set** before writing them anywhere, even if you only deploy to Linux — because someone will eventually restore your backup on a Windows machine, or a user will sync the directory to OneDrive.
- **Paths are bytes on POSIX, not text.** `fs` accepts `Buffer` paths precisely because a POSIX filename can contain sequences that are not valid UTF-8. If you enumerate a directory with `encoding: 'buffer'` and convert the names to strings, a mangled name will fail to reopen. Use `fileURLToPathBuffer` and `Buffer` paths when handling arbitrary third-party trees.
- **Long paths are a real failure mode on Windows.** Deep `node_modules` trees plus a long checkout directory routinely exceed 260 characters. Keep CI checkout paths short and reach for `path.toNamespacedPath()` when generating deep paths programmatically.

## Exercises

1. **Build a `join`/`resolve` truth table.** For ten input sets — including an absolute segment in the middle, an empty segment, a trailing separator, and no arguments — record what `join` and `resolve` return, on both `path.posix` and `path.win32`. *Success:* a table you can defend line by line, with a written rule for choosing between them.

2. **Write a round-trip fuzz test.** Generate paths containing spaces, `#`, `%`, `?`, emoji, and CJK characters. Assert that `fileURLToPath(pathToFileURL(p))` equals `path.resolve(p)` for each. Run it with `{ windows: true }` and `{ windows: false }`. *Success:* the test passes, and you can explain any input where it legitimately cannot.

3. **Implement and break a traversal check.** Write `safeResolve(root, userPath)`. Then write attacks: `..` segments, an absolute path, a sibling directory sharing the root's prefix, a symlink inside the root pointing out, and a URL-encoded `%2e%2e`. *Success:* all attacks are rejected, and the symlink case forces you to add `realpath`.

4. **Make a package location-independent.** Take a package that reads a data file relative to `process.cwd()` and fix it to resolve relative to the module. Provide both ESM and CJS entry points. *Success:* it works when invoked from `/`, from a sibling directory, and through a symlinked `bin` script.

5. **Write a cross-platform filename sanitizer.** Given an arbitrary Unicode string, produce a filename that is valid on NTFS, APFS, and ext4: strip reserved characters, refuse reserved device names, handle trailing dots and spaces, cap the length in *bytes*, and guarantee uniqueness after collapsing. *Success:* a property test over 10,000 random inputs showing every output is creatable on your platform, plus documented reasoning for the Windows rules.

## Recap

- `node:path` is pure string manipulation; nothing in it consults the file system. Use `fs.realpath`/`lstat` when reality matters.
- `join` concatenates left to right and stays relative unless the first segment is absolute; `resolve` works right to left, honours absolute segments, falls back to `process.cwd()`, and always returns an absolute path.
- `path.isAbsolute()` is documented as unsafe for mitigating traversal. So is any substring search for `..`.
- The correct traversal check is `resolve` plus a `root + path.sep` prefix comparison, then `realpath` and a re-check when symlinks are possible.
- Force `path.posix` for URLs, object keys, and archive entries; force `path.win32` when generating Windows paths elsewhere.
- Windows brings per-drive working directories, UNC roots, dual separators, case insensitivity, reserved characters and device names, and `MAX_PATH` — with `path.toNamespacedPath()` as the escape hatch.
- Always convert between paths and `file:` URLs with `fileURLToPath()` / `pathToFileURL()`. String surgery breaks on spaces, Unicode, drive letters, UNC hosts, `#`, and `%`.
- ESM gives you `import.meta.url`, `import.meta.filename`, and `import.meta.dirname` (stable since v24.0.0 / v22.16.0, `file:` modules only); CommonJS gives you `__filename` and `__dirname` — resolve bundled assets against those, never against `process.cwd()`.

## Where to go next

- [Chapter 22 — File System I: Reading, Writing, and Metadata](../part4-system/22-filesystem-basics.md) for the `fs` calls that consume these paths.
- [Chapter 23 — File System II: Directories, Watching, Streams, and Atomicity](../part4-system/23-filesystem-advanced.md) for symlink handling and directory walking.
- [Chapter 5 — Modules II: ECMAScript Modules](../part1-foundations/05-modules-esm.md) for `import.meta` in full.
- [Chapter 32 — URLs, Query Strings, and Punycode](../part5-networking/32-url-and-querystring.md) for the rest of `node:url`.
- [Chapter 44 — Securing Node.js Applications](../part6-security/44-securing-applications.md) for traversal in the context of a full threat model.
- Official documentation: <https://nodejs.org/docs/latest/api/path.html> and <https://nodejs.org/docs/latest/api/url.html#urlfileurltopathurl-options>
