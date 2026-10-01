---
chapter: 6
part: "Part I — Foundations"
title: "Packages: package.json, exports, imports, dual publishing"
level: intermediate
reading_time: "30 min"
prerequisites: [4, 5]
source_docs:
  - "doc/api/packages.md"
  - "doc/api/esm.md"
  - "doc/api/modules.md"
source_url: "https://nodejs.org/docs/latest/api/packages.html"
node_baseline: "27.0.0-pre"
---

# Chapter 6 — Packages: `package.json`, exports, imports, dual publishing

## What you will learn

- Identify exactly which `package.json` fields Node's resolver reads, and which are tooling-only.
- Design an `"exports"` map that defines a package's public API and hides everything else.
- Order conditional exports correctly, and explain why the wrong order silently ships the wrong file.
- Use subpath patterns, `null` targets, self-referencing, and the `"#"` imports field.
- Publish a dual CommonJS/ESM package without triggering the dual-package hazard.

## Why this matters

A package is a contract. `"exports"` is the only mechanism Node gives you for writing that contract down — it says which files consumers may load, under which names, in which environments. Without it, every file you ship is public API, and any consumer reaching into `your-pkg/lib/internal/cache.js` will break on your next refactor and file the bug against you.

The same field is also the most common source of "works in my app, fails in the test runner" reports. Conditional exports are matched in *object key order*, which means a `package.json` that is valid JSON and looks correct can hand the CommonJS build to an ESM consumer, or hand a browser bundle to Node. There is no error; you just get the wrong file. Getting this right once, at package-creation time, saves an enormous amount of downstream confusion.

## The fields Node actually reads

Node's resolver reads exactly five fields from `package.json`:

| Field | Type | Since | Purpose |
|---|---|---|---|
| `"name"` | string | v13.1.0 / v12.16.0 | Enables self-referencing by package name |
| `"main"` | string | v0.4.0 | Legacy single entry point |
| `"type"` | string | v12.0.0 | Whether `.js` in this scope is `"module"` or `"commonjs"` |
| `"exports"` | string \| object \| string[] | v12.7.0 | Entry points, conditions, and encapsulation |
| `"imports"` | object | v14.6.0 / v12.19.0 | Internal `#`-prefixed mappings |

Everything else — `"version"`, `"dependencies"`, `"scripts"`, `"engines"`, `"bin"`, `"files"` — is read by npm, other package managers, or bundlers, and is **ignored by the Node runtime**. This matters when you are debugging a resolution problem: `"engines": {"node": ">=22"}` does not stop Node 20 from loading your package, and `"bin"` has no effect on `import` or `require`. `"bin"` creates a shim script at install time (a package-manager behaviour); the shim is then resolved by normal file rules.

A package is a directory containing a `package.json`, plus every subdirectory beneath it, stopping at the next `package.json` or at a `node_modules` folder. That boundary is what "nearest parent `package.json`" means for `"type"`.

### `"type"`

`"type"` decides how `.js` files in the package scope are parsed. `"module"` means ESM; `"commonjs"` or an absent field means CommonJS. `.mjs` and `.cjs` always override it. Chapter 5 covers the full decision table.

Set it explicitly in every package you write. The cost of omitting it is a syntax-detection parse on every ambiguous file, plus ambiguity for every tool that reads your package.

### `"main"` vs `"exports"`

`"main"` names one file. That is all it does.

`"exports"` does four things `"main"` cannot: define multiple entry points, branch on environment, restrict deep imports, and match patterns. **When both exist, `"exports"` wins.** Keep `"main"` alongside `"exports"` only if you need to support very old tooling — point both at the same file.

```json
{
  "name": "invoice-kit",
  "type": "module",
  "main": "./index.js",
  "exports": "./index.js"
}
```

The single-string form is sugar for `{ ".": "./index.js" }`.

## `"exports"`: entry points and encapsulation

The moment you add `"exports"`, every path not listed in it becomes unreachable by specifier. This is the field's most important property and its most disruptive one.

```json
{
  "name": "invoice-kit",
  "exports": {
    ".": "./dist/index.js",
    "./pdf": "./dist/render/pdf.js",
    "./package.json": "./package.json"
  }
}
```

Now `import 'invoice-kit/pdf'` works. `import 'invoice-kit/dist/render/pdf.js'` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, even though the file exists. So does `require('invoice-kit/package.json')` if you forget to list it — and a surprising number of tools do exactly that, which is why exporting `./package.json` is a common courtesy.

Adding `"exports"` to a package that previously had none is a **breaking change**. Consumers who were deep-importing will break on a patch release. If you must add it mid-life, enumerate every previously-reachable path first, then remove them at a major version.

The encapsulation is a *contract*, not a security boundary. A consumer can still `require('/abs/path/to/node_modules/invoice-kit/dist/internal.js')` by absolute path. The point is that nobody does that accidentally.

### Target path rules

Targets are constrained, and violating the rules is an error, not a warning:

- Every target must be a relative URL string beginning with `./`. Not `/dist/main.js`, not `file:///...`, not `../shared/x.js`. This keeps a package self-contained and prevents it exporting files outside its own directory.
- Targets must not escape the package root. `.`, `..`, and `node_modules` segments (including percent-encoded forms) are rejected inside targets and inside any subpath substituted into a pattern.

```json
{
  "exports": {
    ".": "./dist/main.js",
    "./feature": "./lib/feature.js"
  }
}
```

`"./dist/../../elsewhere/x.js"`, `"././dist/main.js"`, and a key like `"./utils/./helper.js"` are all invalid.

### Extensioned or extensionless — pick one

Export `./pdf` or `./pdf.js`, not both. One subpath per module means every consumer writes the same specifier, which keeps your contract legible and makes editor completions work.

Extensionless has been the tradition and reads better. Extensioned maps more cleanly onto browser import maps, where a folder mapping can replace dozens of individual entries. Either is defensible; inconsistency is not.

## Subpath patterns

Enumerating fifty subpaths bloats `package.json`. Patterns solve that with a single `*`:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./locales/*.json": "./dist/locales/*.json",
    "./features/*": "./dist/features/*.js"
  }
}
```

`*` is **string replacement, not a glob**. It matches across `/`, so `invoice-kit/features/tax/vat` resolves to `./dist/features/tax/vat.js`. There is no special handling for extensions — putting `.js` on both sides is how you restrict a pattern to JavaScript files.

To carve holes in a pattern, map to `null`:

```json
{
  "exports": {
    "./features/*": "./dist/features/*.js",
    "./features/internal/*": null
  }
}
```

`import 'invoice-kit/features/internal/cache'` now throws `ERR_PACKAGE_PATH_NOT_EXPORTED` while its siblings resolve. Because `node_modules` is forbidden in targets, a pattern's full expansion is always determinable from the package's own files — which is what lets bundlers and tooling enumerate your exports statically.

## Conditional exports

A condition is a named branch. Instead of a string target, you supply an object whose keys are condition names:

```json
{
  "type": "module",
  "exports": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "require": "./dist/index.cjs",
    "default": "./dist/index.js"
  }
}
```

Node implements these conditions, listed most specific to least:

| Condition | Matches when | Notes |
|---|---|---|
| `"node-addons"` | Any Node.js environment | Signals a native-addon entry; disabled by `--no-addons` |
| `"node"` | Any Node.js environment | Rarely needed explicitly |
| `"import"` | Loaded via `import` / `import()` / any ESM-loader resolve | Mutually exclusive with `"require"` |
| `"require"` | Loaded via `require()` | Mutually exclusive with `"import"` |
| `"module-sync"` | Either loader | Target must be ESM with no top-level `await` anywhere in its graph |
| `"default"` | Always | Must come last |

Community conditions, recognised by tools rather than by Node itself: `"types"` (**always first**), `"browser"`, `"development"`, and `"production"` (mutually exclusive with each other). Node ignores unknown conditions unless you enable them with `-C name` / `--conditions=name` (no longer experimental since v22.9.0 / v20.18.0). The flag is repeatable. Condition names must be non-empty, must not start with `.`, must not contain `,`, and must not be integer-like keys such as `"10"`.

### Why order matters

**Key order in the conditions object is the matching order.** Node walks the keys top to bottom and takes the first one that matches. JSON object key order is preserved, so this is entirely under your control — and entirely your responsibility.

```json
{
  "exports": {
    "default": "./dist/index.js",
    "require": "./dist/index.cjs"
  }
}
```

This is broken. `"default"` matches everything, so `require('pkg')` gets the ESM file and `"require"` is dead code. There is no warning. Rule: most specific first, `"default"` last, `"types"` before everything.

### Nested conditions

Conditions nest, and behave like nested `if` statements. If an inner object matches no condition, matching resumes with the outer object's remaining keys:

```json
{
  "exports": {
    "node": {
      "import": "./dist/node.mjs",
      "require": "./dist/node.cjs"
    },
    "browser": "./dist/browser.mjs",
    "default": "./dist/fallback.mjs"
  }
}
```

Conditions also apply per subpath:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./crypto": {
      "node": "./dist/crypto-node.js",
      "default": "./dist/crypto-webcrypto.js"
    }
  }
}
```

Always provide a `"default"` branch. Without it, any runtime you did not anticipate gets `ERR_PACKAGE_PATH_NOT_EXPORTED` — which is precisely what pushes new runtimes into pretending to be Node. Prefer `"node"` + `"default"` over `"node"` + `"browser"`.

## `"imports"`: internal mappings

`"imports"` is `"exports"` turned inward. Its keys must start with `#`, which guarantees they can never collide with a real package name. They resolve only for specifiers used *inside* the package.

```json
{
  "imports": {
    "#config": "./src/config/production.js",
    "#internal/*": "./src/internal/*.js",
    "#hash": {
      "node": "./src/hash-node.js",
      "default": "./src/hash-portable.js"
    }
  }
}
```

```mjs
import { load } from '#config';
import { LRU } from '#internal/lru.js';
```

Two differences from `"exports"` worth remembering. First, `"imports"` targets **may** be external package names, not just relative paths — that is how you polyfill a dependency per environment:

```json
{
  "imports": {
    "#fetch": {
      "node": "undici",
      "default": "./src/fetch-polyfill.js"
    }
  }
}
```

Second, since v25.4.0 / v24.14.0, subpath imports may start with `#/`. Otherwise the resolution rules are the same, conditions included.

This is the supported replacement for `NODE_PATH` and for deep relative chains like `../../../lib/db.js`. It is also the closest native equivalent to TypeScript's `paths` — with the constraint that the alias must begin with `#`.

## Self-referencing

Inside a package with an `"exports"` field, you can import the package by its own `"name"`:

```json
{
  "name": "invoice-kit",
  "exports": {
    ".": "./src/index.js",
    "./pdf": "./src/render/pdf.js"
  }
}
```

```mjs
// src/render/pdf.js
import { Money } from 'invoice-kit';
```

This works in ESM and CommonJS, and with scoped names (`@acme/invoice-kit`). It requires `"exports"` — a package with only `"main"` cannot self-reference — and it obeys the same restrictions consumers face. `import 'invoice-kit/src/util.js'` fails from inside the package just as it does from outside, which is exactly what you want: your tests exercise the real public contract.

## Dual CommonJS/ESM packages and the dual-package hazard

You can ship one package that serves both loaders:

```json
{
  "name": "invoice-kit",
  "type": "module",
  "exports": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "require": "./dist/index.cjs",
    "default": "./dist/index.js"
  }
}
```

Now the **dual-package hazard**. Node caches ESM and CommonJS separately. If one part of an application `import`s your package and another `require`s it, both files load. You have two module instances, two copies of every class, two copies of every module-level variable.

The symptoms are nasty because they are all `instanceof`-shaped:

```js
const err = new invoiceKit.ValidationError('bad');
err instanceof invoiceKit.ValidationError; // false in the other half of the app
```

Singletons desynchronise. Registries silently split in half. `Map` keyed on your classes misses. Nothing throws at load time.

### Mitigation strategies

**1. Publish ESM only.** Since `require(esm)` is stable (v25.4.0 / v24.15.0), CommonJS consumers can `require()` your ESM directly, provided you have no top-level `await`. One file, one instance, no hazard. This is the right default for new packages.

To control what `require()` receives, export under the name `'module.exports'`:

```mjs
// dist/index.js
export function render(invoice) { /* ... */ }
export default class InvoiceKit { static render = render; }
export { InvoiceKit as 'module.exports' };
```

**2. Use the `"module-sync"` condition.** It matches for both `import` and `require()`, pointing both at the same ESM file. If that file's graph contains top-level `await`, `require()` throws `ERR_REQUIRE_ASYNC_MODULE` — which is a loud failure rather than a silent duplication.

```json
{
  "exports": {
    "types": "./dist/index.d.ts",
    "module-sync": "./dist/index.js",
    "default": "./dist/index.cjs"
  }
}
```

**3. Make the CJS build a thin wrapper.** Keep exactly one implementation, and have the other format re-export it. Two instances still exist, but only one holds state.

**4. Isolate state.** If you must ship two real builds, move every stateful thing — caches, registries, sentinel objects, error classes — into a small stateless-interface CommonJS module that both builds `require()`. Since CommonJS has a single cache, both builds get the same instance.

**5. Export no classes and no `instanceof`-dependent API.** A package whose public surface is pure functions over plain data cannot exhibit the hazard in a way anyone notices.

## Bundlers and TypeScript

Bundlers (webpack, Rollup, esbuild, Vite) implement `"exports"` and conditions themselves, and they add their own: `"browser"`, `"development"`/`"production"`, `"worker"`. Two practical consequences. Bundlers often resolve `"browser"` before `"import"`, so a browser build that must be ESM has to sit at `exports.browser.import`, not just `exports.browser`. And bundlers respect encapsulation too — if a consumer's build fails on a deep import that used to work, check whether a dependency added `"exports"`.

TypeScript reads `"exports"` when `moduleResolution` is `"node16"`, `"nodenext"`, or `"bundler"`. Under those settings the `"types"` condition is how declaration files are found per-entry-point, and it **must be the first key** in each conditions object — TypeScript takes the first match like Node does.

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

For a dual package, ship two declaration files (`index.d.ts` and `index.d.cts`) so TypeScript models the `require()` shape correctly. The legacy top-level `"types"` field still works as a fallback for `moduleResolution: "node10"`, but it cannot describe subpaths, and it is ignored entirely once `"exports"` is present under modern resolution.

## Package maps

**[Experimental]** — `--experimental-package-map` (v26.4.0) points Node at a JSON file that maps package IDs to URLs and declares each package's dependencies explicitly. Bare specifiers are resolved from that table instead of by walking `node_modules`, which eliminates phantom dependencies and removes filesystem probing from resolution. It is aimed at monorepos. Treat it as a preview; the field shapes may still change.

## Common mistakes

### ❌ Putting `"default"` before `"require"`

```json
{ "exports": { "default": "./index.js", "require": "./index.cjs" } }
```

`"default"` matches every condition, so `"require"` is unreachable. CommonJS consumers get the ESM file and fail with a confusing parse or interop error.

```json
{ "exports": { "require": "./index.cjs", "default": "./index.js" } }
```

### ❌ Adding `"exports"` in a patch release

Every consumer deep-importing `pkg/lib/anything.js` breaks immediately with `ERR_PACKAGE_PATH_NOT_EXPORTED`, including consumers who never chose to upgrade you directly.

```json
{
  "exports": {
    ".": "./index.js",
    "./lib/*": "./lib/*.js",
    "./package.json": "./package.json"
  }
}
```

Ship the permissive map first, then tighten it at a major version.

### ❌ Expecting `"exports"` patterns to behave like globs

```json
{ "exports": { "./features/*": "./src/features/*" } }
```

This exposes *everything* under `src/features`, at any depth, including `.map` files, test fixtures, and `.env` files that happen to live there. `*` crosses `/`.

```json
{
  "exports": {
    "./features/*.js": "./src/features/*.js",
    "./features/internal/*": null
  }
}
```

### ❌ Using `"imports"` keys without a `#`

```json
{ "imports": { "config": "./src/config.js" } }
```

Rejected. Every `"imports"` key must start with `#`, precisely so it can never be confused with a package name.

```json
{ "imports": { "#config": "./src/config.js" } }
```

### ❌ Shipping a dual package with exported classes and no state isolation

Two builds, one `import`ed and one `require`d, produce two `ValidationError` classes. Every `instanceof` check across the boundary returns `false`, and no error is ever thrown to tell you why.

```json
{
  "exports": {
    "types": "./dist/index.d.ts",
    "module-sync": "./dist/index.js",
    "default": "./dist/index.cjs"
  }
}
```

## Production notes

- **`"exports"` is your semver surface.** Anything reachable through it is public API you must maintain across minor versions. Anything not reachable can be refactored freely. Decide this deliberately rather than letting your directory layout decide for you.
- **Export `./package.json`.** Many tools — version reporters, CLI wrappers, some test runners — read it via a specifier. Omitting it produces `ERR_PACKAGE_PATH_NOT_EXPORTED` from deep inside somebody else's code.
- **Verify the real resolution, not the intended one.** `node -p "require.resolve('pkg')"` and `node --input-type=module -e "console.log(import.meta.resolve('pkg'))"` tell you which file each loader actually picks. Run both in CI for any package you publish; a reordered condition is invisible in review.
- **`--conditions` is deployment configuration.** `node --conditions=production server.js` lets you ship development-only diagnostics in the same artifact and switch them off at boot. Set it in `NODE_OPTIONS` so worker threads and child processes inherit it.
- **Deep imports are a migration liability.** Every `import 'lodash/fp/curry.js'` in your codebase is a bet that the package will never adopt `"exports"`. Prefer the documented entry points; when you must deep-import, record why.
- **Self-reference in your own tests.** Importing `'my-package'` rather than `'../src/index.js'` means your test suite exercises the same resolution path consumers do, and catches a broken `"exports"` map before publish.
- **Two declaration files for dual packages.** Shipping only `index.d.ts` gives CommonJS consumers type information for the ESM shape. `import x from 'pkg'` will type-check and then fail at runtime because `require()` returned a namespace.

## Exercises

1. **Lock down a package.** Take a small library with `main`, `lib/`, and `internal/`. Add an `"exports"` map that exposes the root, one subpath, and `./package.json`, and nothing else. Success: the two entry points import cleanly and any `internal/` path throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.

2. **Prove that order matters.** Build a package with `"exports": { "default": "./esm.js", "require": "./cjs.cjs" }`, then require it and log which file ran. Reorder the keys and repeat. Success: you can state which file each loader received in each ordering, and why nothing warned you.

3. **Internal imports with conditions.** Add an `"imports"` entry `#storage` that maps to a filesystem implementation under `"node"` and an in-memory implementation under `"default"`. Add a third branch under a custom condition `test`. Success: `node app.js` uses the filesystem version and `node --conditions=test app.js` uses the test double, with no change to source.

4. **Reproduce the dual-package hazard.** Publish (locally, with `npm link` or a file: dependency) a package exporting a class through both `"import"` and `"require"` targets built from the same source. Write one app file that imports it and one that requires it, and compare `instanceof` across the two. Success: you observe `false`, then fix it with `"module-sync"` and observe `true`.

5. **Pattern with an exclusion.** Design an `"exports"` map that exposes every file under `src/features/` as `pkg/features/<name>` — JavaScript only — while making `src/features/experimental/` unreachable. Success: a `.js` feature resolves, a co-located `.json` fixture does not, and an experimental feature throws.

## Recap

- Node reads exactly five fields: `"name"`, `"main"`, `"type"`, `"exports"`, `"imports"`. `"engines"` and `"bin"` are tooling fields with no runtime effect.
- `"exports"` overrides `"main"` and makes every unlisted path unreachable — encapsulation by default, and a breaking change to introduce.
- Targets must start with `./`, must not escape the package, and must not contain `.`, `..`, or `node_modules` segments.
- Conditions match in key order: `"types"` first, `"default"` last, most specific in between.
- `*` in subpath patterns is string replacement and crosses `/`; `null` targets carve out exclusions.
- `"imports"` keys start with `#`, are private to the package, and may target external packages.
- Self-referencing by `"name"` requires `"exports"` and honours the same restrictions consumers face.
- The dual-package hazard is duplicated module state across the two caches. Prefer ESM-only or `"module-sync"`; if you must ship both, isolate state in a shared CommonJS module.

## Where to go next

- [Chapter 5 — Modules II: ECMAScript Modules](05-modules-esm.md) — specifier and loading rules these fields feed into.
- [Chapter 7 — TypeScript in Node.js](07-typescript.md) — `"types"` conditions and declaration files in practice.
- [Chapter 53 — Module Customization Hooks and Loaders](../part8-advanced/53-module-hooks.md) — overriding resolution entirely.
- [Chapter 59 — Application Architecture and Project Layout](../part9-production/59-application-architecture.md) — workspaces and monorepo structure.
- Official documentation: <https://nodejs.org/docs/latest/api/packages.html>
