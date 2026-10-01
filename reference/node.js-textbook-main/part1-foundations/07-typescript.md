---
chapter: 7
part: "Part I — Foundations"
title: "TypeScript in Node.js"
level: intermediate
reading_time: "25 min"
prerequisites: [5, 6]
source_docs:
  - "doc/api/typescript.md"
  - "doc/api/cli.md"
  - "doc/api/packages.md"
source_url: "https://nodejs.org/docs/latest/api/typescript.html"
node_baseline: "27.0.0-pre"
---

# Chapter 7 — TypeScript in Node.js

## What you will learn

- Run `.ts` files with plain `node`, and know exactly which TypeScript features that excludes.
- Name the syntax that type stripping rejects and rewrite each case in erasable form.
- Configure `tsconfig.json` so the compiler agrees with what Node will actually run.
- Decide between built-in stripping, a `tsc` build step, and a loader like `tsx`.
- Explain why running TypeScript and type-checking TypeScript are separate jobs.

## Why this matters

Until recently, "using TypeScript with Node" meant adopting a build pipeline before you could run a single file. Node now runs `.ts` files directly — `node server.ts` works with no flags, no config, and no dependencies. Type stripping is **stable** as of v25.2.0 / v24.12.0. For scripts, tools, tests, and a large class of services, the build step is simply gone.

The catch is that this is deliberately *not* a TypeScript compiler. Node erases types and runs the result. It does not read your `tsconfig.json`, it does not downlevel syntax, it does not check a single type, and it rejects any TypeScript construct that would require emitting new JavaScript. Understanding that boundary is the whole chapter: get it right and you delete your build pipeline, get it wrong and you spend a day confused about why an `enum` throws at startup.

## What type stripping actually does

Node parses your `.ts` file, replaces every type annotation with **whitespace**, and hands the result to V8. That is the entire transformation.

```ts
function total(items: readonly Item[], rate: number): number {
  return items.reduce((sum: number, i: Item) => sum + i.price, 0) * (1 + rate);
}
```

After stripping, the annotations become spaces. Column numbers do not move. Line numbers do not move. This is why Node needs no source maps for correct stack traces from stripped TypeScript — the mapping is the identity function.

Erased constructs include: type annotations on parameters, variables, properties, and returns; `interface` and `type` declarations; generic type parameters and type arguments; `as` and `satisfies` assertions; non-null `!` assertions; `declare` statements; `abstract` modifiers; `implements` clauses; access modifiers on ordinary class members; and `import type` / `export type`.

**No type checking is performed.** A file with a hundred type errors runs happily. Checking remains `tsc`'s job.

**`tsconfig.json` is ignored.** Not partially honoured — ignored. `paths`, `baseUrl`, `target` downlevelling, JSX, and `experimentalDecorators` have no effect on what Node does.

**Files under `node_modules` are never stripped.** Node refuses to process TypeScript inside a `node_modules` path, deliberately, to discourage publishing raw `.ts` to the registry. Publish compiled JavaScript plus declaration files.

## Syntax that is not supported

Anything that requires *generating* JavaScript rather than deleting characters is rejected with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The list is short and exact:

| Construct | Why it fails | Erasable replacement |
|---|---|---|
| `enum` declarations | Emits an IIFE and a reverse-mapping object | `const` object + `as const`, or a union of literals |
| `namespace` containing runtime code | Emits an IIFE and an assignment | ES modules |
| Parameter properties (`constructor(private x: T)`) | Emits assignments in the constructor body | Declare the field, assign it explicitly |
| Import aliases (`import X = require('y')`) | Emits a `require` call | `import`, or `module.createRequire()` |

Two more cases behave slightly differently:

**Type-only `namespace` is fine.** If a namespace contains only type declarations, there is nothing to emit and it strips cleanly:

```ts
namespace Payment {
  export type Method = 'card' | 'transfer';
}
```

A namespace exporting a *value* does not:

```ts
namespace Config {
  export let retries = 3; // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX
}
```

**Decorators are a parse error, not an unsupported-syntax error.** Decorators are a TC39 Stage 3 proposal; V8 does not implement them, Node does not transform them, and Node will not polyfill them. They will work when JavaScript supports them natively and not before. This covers both the legacy `experimentalDecorators` form and the current standard form. If your framework requires decorators, you need `tsc` or a loader.

There is also `ERR_INVALID_TYPESCRIPT_SYNTAX` for input that is not valid TypeScript at all — distinct from valid-but-unsupported.

### Rewriting the common cases

```ts
// ❌ enum
enum Status { Pending, Paid, Void }

// ✅ erasable
const Status = { Pending: 0, Paid: 1, Void: 2 } as const;
type Status = typeof Status[keyof typeof Status];
```

```ts
// ❌ parameter properties
class Ledger {
  constructor(private readonly store: Store, public name: string) {}
}

// ✅ erasable
class Ledger {
  readonly #store: Store;
  name: string;
  constructor(store: Store, name: string) {
    this.#store = store;
    this.name = name;
  }
}
```

Enable `"erasableSyntaxOnly": true` in `tsconfig.json` (TypeScript 5.8+) and `tsc` will flag every one of these at check time instead of letting you discover them at runtime. This is the single most valuable setting in this chapter.

## The `type` keyword is mandatory

This is the sharpest edge in the whole feature, because the failure is a runtime error in code that type-checks.

Node strips imports by looking for the `type` keyword. It has no type information, so it cannot know that `FnParams` in `import { fn, FnParams } from './fn.ts'` is a type. It leaves the binding in place, the runtime import fails to find an export named `FnParams`, and you get a `SyntaxError`.

```ts
// ✅ works
import type { Invoice, LineItem } from './model.ts';
import { render, type RenderOptions } from './render.ts';

// ❌ runtime error — Node imports these as values
import { Invoice, LineItem } from './model.ts';
import { render, RenderOptions } from './render.ts';
```

Set `"verbatimModuleSyntax": true` so `tsc` enforces the same discipline you need at runtime.

## File extensions and module system

`.ts` files follow the same module-system rules as `.js`: the nearest parent `package.json` `"type"` field decides, with syntax detection as a fallback. `.mts` is always ESM. `.cts` is always CommonJS. `.tsx` is **unsupported** — there is no JSX transform in Node.

Node never converts between module systems. If you want ESM, write `import`/`export`; if you want CommonJS, write `require`/`module.exports`. There is no `esModuleInterop` shim.

Extensions in specifiers are mandatory, and — this surprises people — that includes `require()`:

```ts
import { parse } from './parse.ts';        // ✅
const { parse } = require('./parse.ts');   // ✅ extension also required here
import { parse } from './parse';           // ❌
import { parse } from './parse.js';        // ❌ unless parse.js actually exists
```

Writing `./parse.ts` in a source file is exactly what `tsc` normally forbids. Two `tsconfig.json` options reconcile this:

- **`allowImportingTsExtensions`** — lets `tsc` type-check specifiers that carry a `.ts` extension.
- **`rewriteRelativeImportExtensions`** — when you *do* compile with `tsc`, rewrites `./parse.ts` to `./parse.js` in the emitted output. This is what lets one set of sources run directly under Node *and* compile to publishable JavaScript.

### Recommended `tsconfig.json`

TypeScript 5.8 or newer, with these settings:

```json
{
  "compilerOptions": {
    "noEmit": true,
    "target": "esnext",
    "module": "nodenext",
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true
  }
}
```

| Option | Effect |
|---|---|
| `noEmit` | Use when you only ever run `.ts` directly. Drop it if you also publish `.js`. |
| `target: "esnext"` | Node runs modern V8; downlevelling would produce syntax Node never needed. |
| `module: "nodenext"` | Makes `tsc` model Node's real resolution, including `"exports"` conditions. |
| `rewriteRelativeImportExtensions` | Lets sources use `.ts` specifiers and still emit valid `.js`. |
| `erasableSyntaxOnly` | Rejects enums, namespaces with runtime code, parameter properties, import aliases at check time. |
| `verbatimModuleSyntax` | Requires explicit `type` on type-only imports. |

## Flags and version history

| Flag | Status in Node 27 |
|---|---|
| `--experimental-strip-types` | Historical. Added v22.6.0 to opt in; stripping has been on by default since v23.6.0 / v22.18.0 and stable since v25.2.0 / v24.12.0. |
| `--no-strip-types` | Current flag to **disable** type stripping. Renamed from `--no-experimental-strip-types` in v25.2.0 / v24.12.0. |
| `--no-experimental-strip-types` | Still accepted, including in `NODE_OPTIONS`. Prefer the new name. |
| `--experimental-transform-types` | **Removed in v26.0.0.** Added v22.7.0; it enabled enums, namespaces, and parameter properties. It no longer exists — do not put it in a Dockerfile. |

The removal of `--experimental-transform-types` is the trap for anyone upgrading. Node's position is now unambiguous: the runtime erases types and nothing more. If you need transformation, use a compiler.

Type stripping also works for `--eval` and stdin, with `--input-type` selecting the module system: `module-typescript` or `commonjs-typescript`. Those two values are unavailable under `--no-strip-types`.

```bash
node --input-type=module-typescript --eval "const n: number = 41; console.log(n + 1);"
```

Without `--input-type`, Node's detection for string input tries CommonJS, then ESM, then stripping — several passes. Pass the flag explicitly in anything performance-sensitive.

TypeScript syntax is **not** supported in the REPL, under `--check`, or under `inspect`.

## Source maps

Because stripping preserves positions exactly, Node generates no source maps for `.ts` files, and none are needed — stack traces already point at the right line and column of your original source.

This changes the moment a real compiler is involved. `tsc` and `tsx` move code around, so you need `"sourceMap": true` in `tsconfig.json` (or the loader's equivalent) and `--enable-source-maps` at runtime to get stack traces in terms of your sources. `--enable-source-maps` has been non-experimental since v15.11.0 / v14.18.0.

One caveat: overriding `Error.prepareStackTrace` can defeat source-map remapping. Some logging and error-reporting libraries do this. If they do, call the original `Error.prepareStackTrace` from your override and return its result.

## Type checking still needs `tsc`

Node runs your TypeScript. It never checks it. Those are separate jobs and you need both.

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "start": "node src/server.ts",
    "test": "node --test 'src/**/*.test.ts'"
  }
}
```

`tsc --noEmit` in CI and in your editor; `node` at runtime. Skipping the check is not "moving fast" — it is running TypeScript with none of the benefit and all of the syntax restrictions.

## Choosing an approach

| Approach | Type checking | All TS features | Build step | Startup cost | Use when |
|---|---|---|---|---|---|
| Built-in stripping | No (run `tsc --noEmit`) | No — erasable only | None | Parse only | Apps, services, scripts, tests you control |
| `tsc` build step | Yes | Yes | Yes | None at runtime | Publishing a package; need enums/decorators |
| `tsx` (loader) | No | Yes | None | Transform per file | Legacy code with decorators; can't refactor yet |

**Built-in stripping** is the default choice for new work. Nothing to install, nothing to configure, no `dist/` directory, no stale-build class of bug. Its constraint — erasable syntax only — is one that most modern TypeScript codebases already satisfy, and `erasableSyntaxOnly` makes the rest mechanical to fix.

**A `tsc` build step** is required when you publish to npm. Consumers need `.js` plus `.d.ts`; Node will not strip types inside `node_modules`, so raw `.ts` in a published package is unusable. It is also the answer when you genuinely need decorators or `const enum`.

**A loader** such as `tsx` handles the full language at runtime, including decorators and JSX. The Node documentation names `tsx` as an example; other libraries in this space work similarly. Two ways to invoke it:

```bash
npx tsx server.ts
node --import=tsx server.ts
```

The `--import=tsx` form is the one to prefer — it keeps `node` as the entry point, so your flags, `NODE_OPTIONS`, and debugger setup behave normally. `ts-node` is the older tool in this category and is still widely deployed; it is not mentioned in Node's documentation, and newer loaders generally have better ESM support.

Loaders are not free. Every module is transformed on load, which adds real startup time to a large process, and stack traces depend on source maps being wired correctly.

### `@types` packages

Types for a library can arrive three ways. Modern packages bundle `.d.ts` files and point at them with a `"types"` condition in `"exports"` (Chapter 6) — nothing to install. Older packages have community definitions on DefinitelyTyped, installed as `@types/<name>`. Node's own APIs are typed by `@types/node`, which you must install explicitly:

```bash
npm install --save-dev @types/node typescript
```

Install `@types/node` at a major version matching your runtime. A `@types/node@20` package will not know about `import.meta.main` or `node:sqlite`, and will report errors for correct code.

All `@types` packages belong in `devDependencies` — they vanish at build time and shipping them as runtime dependencies just enlarges installs.

## Common mistakes

### ❌ Using an `enum`

```ts
enum Status { Pending, Paid }
```

Throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` at load. It is the most common blocker in existing codebases, because enums are idiomatic TypeScript everywhere except here.

```ts
// ✅
const Status = { Pending: 'pending', Paid: 'paid' } as const;
type Status = typeof Status[keyof typeof Status];
```

### ❌ Importing a type without the `type` keyword

```ts
import { Invoice, renderInvoice } from './invoice.ts';
```

`tsc` accepts this and elides `Invoice` on emit. Node cannot — it has no type information — so it imports `Invoice` as a value and throws at link time. The code type-checks and then fails to start.

```ts
// ✅
import { renderInvoice, type Invoice } from './invoice.ts';
```

### ❌ Expecting `tsconfig.json` to apply

```json
{ "compilerOptions": { "paths": { "@lib/*": ["./src/lib/*"] } } }
```

```ts
import { db } from '@lib/db.ts'; // ERR_MODULE_NOT_FOUND at runtime
```

Node never reads `tsconfig.json`. `paths` is invisible to it. The runtime-supported equivalent is subpath imports, which must begin with `#`:

```json
{ "imports": { "#lib/*": "./src/lib/*.ts" } }
```

```ts
// ✅
import { db } from '#lib/db.ts';
```

### ❌ Publishing `.ts` files to npm

Node refuses to strip types inside `node_modules`. Consumers get `ERR_UNKNOWN_FILE_EXTENSION` or a parse error, and there is no flag to override it.

```json
{
  "exports": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "files": ["dist"]
}
```

### ❌ Adding `--experimental-transform-types` to a Node 26+ container

The flag was removed in v26.0.0. Node exits immediately with a bad-option error, and because it usually lives in `NODE_OPTIONS` or a Dockerfile, the failure appears as a container that will not start rather than as a code problem.

```bash
# ✅ nothing to pass; stripping is on by default
node src/server.ts
```

## Production notes

- **Type-check in CI, always.** `tsc --noEmit` is the only thing standing between you and shipping type errors, because the runtime will happily execute them. Gate merges on it.
- **Stripping costs a parse per file, once.** Node parses and rewrites each `.ts` file at load. On a large service this is measurable at boot but does not recur. `NODE_COMPILE_CACHE` (stable since v25.4.0 / v24.15.0) caches compiled code across runs and helps most in short-lived processes and CLIs.
- **Publishing and running are different problems.** Run `.ts` directly in your application. Compile to `.js` + `.d.ts` for anything you publish. Deciding this per-repository, up front, avoids a painful mid-life migration.
- **Pin `@types/node` to your runtime major.** A mismatch produces phantom errors on correct code and, worse, silence about APIs that do not exist in your deployed version.
- **`erasableSyntaxOnly` is a migration tool.** Turn it on in an existing codebase and `tsc` hands you the complete list of things that will not run. Fix them mechanically, then delete the build step.
- **Loaders change your stack traces.** With `tsx` or `tsc`, enable source maps and verify a real production stack trace end to end — including through your logging library, which may override `Error.prepareStackTrace` and silently defeat remapping.
- **Watch out for the REPL gap.** TypeScript does not work in the REPL, under `--check`, or under `inspect`. Debugging workflows that rely on those need compiled output or a loader.

## Exercises

1. **Run TypeScript with zero setup.** Write a `.ts` file that reads a JSON file with `node:fs/promises`, annotates the parsed shape with an `interface`, and prints a summary. Run it with `node file.ts` — no dependencies, no config. Success: it runs, and `tsc --noEmit` reports no errors.

2. **Collect the rejections.** Write one small file for each unsupported construct: an `enum`, a `namespace` with a `let`, a class with a parameter property, and an `import X = require('y')`. Run each. Success: you can quote the error code for each, and you have rewritten all four in erasable form.

3. **Catch it at check time instead.** Take a codebase (or exercise 2's files) and add `"erasableSyntaxOnly": true` and `"verbatimModuleSyntax": true` to `tsconfig.json`. Success: `tsc --noEmit` reports every runtime failure from exercise 2 as a compile error, before you run anything.

4. **Replace `paths` with `imports`.** Convert a project using `tsconfig.json` `paths` aliases to `package.json` `"imports"` entries. Success: the same aliases resolve under plain `node` and still type-check under `module: "nodenext"`.

5. **Publish a dual-consumable package.** Build a package whose sources are `.ts` with `.ts` specifiers, using `rewriteRelativeImportExtensions`, that (a) runs directly with `node src/index.ts` during development and (b) compiles with `tsc` to a `dist/` consumable by a plain JavaScript project. Success: both paths work from the same sources, and the published tarball contains no `.ts` files.

## Recap

- Type stripping is stable (v25.2.0 / v24.12.0) and on by default; disable it with `--no-strip-types`.
- Node erases types to whitespace. It does not check types, read `tsconfig.json`, downlevel syntax, or transform anything.
- Unsupported: `enum`, `namespace` with runtime code, parameter properties, and import aliases. Decorators are a parse error and will stay one until JavaScript has them.
- `import type` / `type` modifiers are mandatory — Node cannot infer what is a type.
- `.ts` follows `"type"` like `.js`; `.mts` is ESM, `.cts` is CommonJS, `.tsx` is unsupported. Extensions are required, including in `require()`.
- `erasableSyntaxOnly`, `verbatimModuleSyntax`, and `rewriteRelativeImportExtensions` make `tsc` agree with the runtime.
- No source maps are needed for stripping; they are essential once `tsc` or a loader is involved.
- `--experimental-transform-types` was removed in v26.0.0. Files under `node_modules` are never stripped — publish `.js` and `.d.ts`.

## Where to go next

- [Chapter 5 — Modules II: ECMAScript Modules](05-modules-esm.md) — the specifier rules `.ts` files inherit.
- [Chapter 6 — Packages: `package.json`, exports, imports, dual publishing](06-packages-and-exports.md) — the `"types"` condition and subpath imports.
- [Chapter 45 — The Built-in Test Runner](../part7-diagnostics/45-test-runner.md) — running `.ts` tests without a transform.
- [Chapter 60 — Deployment, Containers, and Configuration](../part9-production/60-deployment-and-config.md) — build-vs-run decisions in images.
- Official documentation: <https://nodejs.org/docs/latest/api/typescript.html>
