---
title: "부록 B. Nest CLI Command Reference"
parent: "NestJS 부록 (Appendix)"
grand_parent: "NestJS Complete Guide"
nav_order: 1066
appendix: "B"
kind: reference
nest_baseline: "11.x"
---

# Appendix B — Nest CLI Command Reference

> **이 부록 사용법 (한국어)**
> 이 부록은 `@nestjs/cli`의 모든 명령어·플래그·스키매틱과 `nest-cli.json` 설정 키를 한곳에 모은 조회용 레퍼런스입니다. 본문 [2장](../part1-beginner/02-cli-and-project-setup.md)이 CLI를 "왜 그렇게 쓰는지" 설명한다면, 이 부록은 "정확히 무엇을 쓸 수 있는지"를 표로 답합니다. 앞부분(§1–§8)은 명령어별 인자·옵션 표이고, 중간(§9–§11)은 `nest-cli.json` 스키마 전체 — 표준 모드와 모노레포 모드 양쪽 — 그리고 `@nestjs/swagger`·`@nestjs/graphql` CLI 플러그인 옵션입니다. §12는 `tsc`·`webpack`·`swc` 세 빌더의 비교표로, 빌드가 느리거나 번들이 예상과 다를 때 가장 먼저 볼 곳입니다. 마지막 §13 "레시피"는 모노레포 구성, 공용 라이브러리 추가, CRUD 리소스 생성, Docker용 단일 앱 빌드처럼 실무에서 자주 반복되는 명령 시퀀스를 그대로 복사해 쓸 수 있게 모아 두었습니다. 모든 플래그는 `nest <command> --help`로 언제든 확인할 수 있으니, 이 표는 그 출력의 주석판이라고 생각하시면 됩니다.

## 1. Installation, versions, and the help system

The CLI is a separate package from the framework. It has its own version number, and it is entirely normal for the CLI to be on 11.x while an application is still on 10.x.

```bash
# Global install — convenient, but every project on the machine shares one version
$ npm install -g @nestjs/cli

# No install — always runs a pinned, current version
$ npx @nestjs/cli@latest new my-app

# Local dev dependency — the recommended setup for a team
$ npm install -D @nestjs/cli
```

The tension is worth stating plainly. A global install means two developers on the same repository can scaffold with two different schematic versions and produce subtly different files. A local dev dependency, driven through `package.json` scripts, means `npm run build` uses the version the repository pins. **Use both:** a global (or `npx`) CLI for `new` and `generate`, and the locally installed one — invoked through package scripts — for `build` and `start`.

```json title="package.json (scripts section from nest new)"
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main"
  }
}
```

Because `npm run` puts `node_modules/.bin` on the PATH, these scripts resolve the **local** `nest` binary even on a machine with no global install. That is the whole point of them.

### Getting help

```bash
$ nest --help              # list all commands
$ nest generate --help     # options for one command
$ nest g service --help    # options for one schematic
$ nest --version           # CLI version
```

### Command syntax

Every command follows the same shape:

```bash
nest commandOrAlias requiredArg [optionalArg] [options]
```

A required argument that you omit is prompted for interactively rather than erroring. Most commands and many options have single-letter aliases, so these two lines are identical:

```bash
$ nest new my-nest-project --dry-run
$ nest n my-nest-project -d
```

### Runtime requirement: ICU

The CLI requires a Node.js binary built with internationalization support. The official Node.js distributions qualify; some minimal container images and hand-built binaries do not.

```bash
$ node -p process.versions.icu
```

If that prints `undefined`, the CLI will fail with confusing errors. Install a full-ICU Node build.

---

## 2. Command overview

| Command | Alias | Description |
|---|---|---|
| `nest new <name>` | `n` | Scaffolds a new standard-mode application with everything needed to run. |
| `nest generate <schematic> <name>` | `g` | Generates and/or modifies files from a schematic. |
| `nest build [name]` | — | Compiles an application or workspace into an output folder. |
| `nest start [name]` | — | Compiles and runs an application (or the workspace's default project). |
| `nest add <name>` | — | Installs a package and runs its **install schematic** — for libraries that need to modify your source. |
| `nest info` | `i` | Prints installed Nest package versions and system information. |

---

## 3. `nest new`

```bash
$ nest new <name> [options]
$ nest n <name> [options]
```

Creates a folder named `<name>`, populates it with configuration files, creates `src/` and `test/` sub-folders, and fills them with a minimal working application. Prompts for a package manager unless one is supplied.

### Arguments

| Argument | Description |
|---|---|
| `<name>` | The name of the new project. Also becomes the `name` field in `package.json`. Use `.` to scaffold into the current directory. |

### Options

| Option | Alias | Description |
|---|---|---|
| `--dry-run` | `-d` | Reports the changes that would be made without touching the filesystem. Run this first on any command you are unsure about. |
| `--skip-git` | `-g` | Skips `git init`. |
| `--skip-install` | `-s` | Skips dependency installation. Useful in CI and when you intend to edit `package.json` before installing. |
| `--package-manager [name]` | `-p` | `npm`, `yarn`, or `pnpm`. The manager must already be installed globally. |
| `--language [lang]` | `-l` | `TS` (default) or `JS`. The JavaScript variant loses decorator metadata reflection and forces `@Dependencies` / `@Bind`; prefer TypeScript. |
| `--collection [name]` | `-c` | Use a different schematics collection — the npm package name of an installed collection. Defaults to `@nestjs/schematics`. |
| `--strict` | — | Enables `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `forceConsistentCasingInFileNames`, and `noFallthroughCasesInSwitch` in the generated `tsconfig.json`. **Always pass this on a new project** — retrofitting strictness later is far more work. |

### What it generates

```text
my-app/
├── src/
│   ├── app.controller.ts
│   ├── app.controller.spec.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
├── test/
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── eslint.config.mjs
```

---

## 4. `nest generate`

```bash
$ nest generate <schematic> <name> [options]
$ nest g <schematic> <name> [options]
```

### Arguments

| Argument | Description |
|---|---|
| `<schematic>` | A schematic name or alias from the table below, or `collection:schematic` to reach into another collection. |
| `<name>` | The name of the generated component. May contain a path: `nest g service users/profile` creates `src/users/profile/`. |

### Options

| Option | Alias | Description |
|---|---|---|
| `--dry-run` | `-d` | Print the file operations without performing them. |
| `--project [project]` | `-p` | In a monorepo, which project to generate into. Without it, the default project wins — a frequent cause of files landing in the wrong app. |
| `--flat` | — | Do not create a containing folder; emit the file(s) beside the current path. |
| `--no-flat` | — | Force a folder even when `generateOptions.flat` is `true` globally. |
| `--spec` | — | Force spec-file generation (the default). |
| `--no-spec` | — | Skip spec files. |
| `--spec-file-suffix [suffix]` | — | Change `spec` to something else (e.g. `test`), producing `users.service.test.ts`. |
| `--collection [name]` | `-c` | Use a different schematics collection. |

Precedence for `spec` and `flat`: **command line** beats **project-level `generateOptions`** beats **global `generateOptions`** beats the schematic default.

### Schematics

| Name | Alias | Description | Files it creates |
|---|---|---|---|
| `app` | — | Adds an application to the workspace, converting a standard-mode project to monorepo mode on first use. | `apps/<name>/src/{main,app.module,app.controller,app.service}.ts`, `apps/<name>/src/app.controller.spec.ts`, `apps/<name>/tsconfig.app.json`, plus a `projects` entry in `nest-cli.json`. |
| `sub-app` | — | Synonym exposed by the CLI for the `app` schematic — generates a nested application inside an existing monorepo. | Same as `app`. |
| `library` | `lib` | Adds a library to the workspace. Prompts for a path-alias prefix (default `@app`). Monorepo only. | `libs/<name>/src/{index.ts,<name>.module.ts,<name>.service.ts}`, `libs/<name>/src/<name>.service.spec.ts`, `libs/<name>/tsconfig.lib.json`, a `projects` entry, and `paths` entries in the root `tsconfig.json`. |
| `resource` | `res` | Generates a complete CRUD resource. Prompts for the transport layer (REST, GraphQL code-first, GraphQL schema-first, microservice, WebSockets) and whether to include CRUD entry points. TypeScript only. | `<name>/<name>.module.ts`, `.controller.ts` (or `.resolver.ts` / `.gateway.ts`), `.service.ts`, `dto/create-<name>.dto.ts`, `dto/update-<name>.dto.ts`, `entities/<name>.entity.ts`, plus spec files; registers the module in its parent. |
| `module` | `mo` | A module declaration. | `<name>/<name>.module.ts`, and adds it to the closest parent module's `imports`. |
| `controller` | `co` | A controller declaration. | `<name>/<name>.controller.ts`, `<name>.controller.spec.ts`, and registers it in the nearest module's `controllers`. |
| `service` | `s` | An `@Injectable()` service. | `<name>/<name>.service.ts`, `<name>.service.spec.ts`, registered in the nearest module's `providers`. |
| `provider` | `pr` | A bare `@Injectable()` provider class (no `.service` suffix). | `<name>/<name>.ts`, `<name>.spec.ts`, registered in `providers`. |
| `resolver` | `r` | A GraphQL resolver. | `<name>/<name>.resolver.ts`, `<name>.resolver.spec.ts`, registered in `providers`. |
| `gateway` | `ga` | A WebSocket gateway. | `<name>/<name>.gateway.ts`, `<name>.gateway.spec.ts`, registered in `providers`. |
| `class` | `cl` | A plain class — no decorators, no module registration. | `<name>/<name>.ts`, `<name>.spec.ts`. |
| `interface` | `itf` | A TypeScript interface. | `<name>/<name>.interface.ts`. No spec (interfaces vanish at runtime). |
| `decorator` | `d` | A custom parameter decorator built on `createParamDecorator`. | `<name>/<name>.decorator.ts`. |
| `filter` | `f` | An exception filter implementing `ExceptionFilter`. | `<name>/<name>.filter.ts`, `<name>.filter.spec.ts`. Not auto-bound — you still apply `@UseFilters` or `APP_FILTER`. |
| `guard` | `gu` | A guard implementing `CanActivate`. | `<name>/<name>.guard.ts`, `<name>.guard.spec.ts`. Not auto-bound. |
| `interceptor` | `itc` | An interceptor implementing `NestInterceptor`. | `<name>/<name>.interceptor.ts`, `<name>.interceptor.spec.ts`. Not auto-bound. |
| `middleware` | `mi` | A class implementing `NestMiddleware`. | `<name>/<name>.middleware.ts`, `<name>.middleware.spec.ts`. You wire it in `configure()` yourself. |
| `pipe` | `pi` | A pipe implementing `PipeTransform`. | `<name>/<name>.pipe.ts`, `<name>.pipe.spec.ts`. Not auto-bound. |
| `configuration` | `config` | Generates a `nest-cli.json` for a project that does not have one. | `nest-cli.json` at the project root. |

> **Hint** — The four enhancer schematics (`filter`, `guard`, `interceptor`, `pipe`) generate the class but do **not** register it anywhere. That is deliberate: Nest cannot know whether you want it global, controller-scoped, or handler-scoped. See [Chapter 13](../part1-beginner/13-custom-decorators-and-lifecycle.md) for the full binding picture.

The `resource` schematic is the highest-leverage command in the CLI. One invocation writes a module, a controller, a service, two DTOs with mapped types, an entity, and two spec files, all correctly wired. It is covered end to end in [Chapter 14](../part1-beginner/14-first-crud-application.md).

---

## 5. `nest build`

```bash
$ nest build [name] [options]
```

Compiles a project into the output folder configured by `tsconfig.json`'s `outDir` (default `./dist`). Beyond invoking the compiler, `nest build` also:

- resolves TypeScript path aliases at runtime via `tsconfig-paths`,
- runs the `@nestjs/swagger` CLI plugin if it is enabled, annotating DTOs with OpenAPI metadata,
- runs the `@nestjs/graphql` CLI plugin if it is enabled, annotating types with GraphQL metadata.

Those AST transformations are the reason `tsc` alone is not a drop-in replacement for `nest build` in a project that uses the plugins.

### Arguments

| Argument | Description |
|---|---|
| `[name]` | The project to build. Omitted in standard mode; in a monorepo, defaults to the project named by the top-level `root`. |

### Options

| Option | Alias | Description |
|---|---|---|
| `--path [path]` | `-p` | Path to the `tsconfig` file to use. |
| `--config [path]` | `-c` | Path to the `nest-cli.json` configuration file. |
| `--watch` | `-w` | Watch mode with live reload. With `tsc` and `manualRestart: true`, typing `rs` forces a restart. |
| `--builder [name]` | `-b` | `tsc`, `swc`, or `webpack`. Overrides `compilerOptions.builder`. |
| `--webpack` | — | Use webpack. **Deprecated** — use `--builder webpack`. |
| `--webpackPath [path]` | — | Path to a webpack configuration file. Defaults to `webpack.config.js` at the project root. |
| `--tsc` | — | Force `tsc`, overriding a configured builder. |
| `--watchAssets` | — | Also watch non-TypeScript assets (`.graphql`, `.hbs`, images) and re-copy them on change. |
| `--type-check` | — | Run type checking alongside SWC. SWC strips types without checking them; this flag restores type safety at the cost of speed, and is **required** for the Swagger/GraphQL CLI plugins under SWC. |
| `--all` | — | Build every project in the monorepo. |
| `--preserveWatchOutput` | — | Do not clear the terminal between `tsc` watch rebuilds. Essential when piping logs to a file or a CI runner. |

---

## 6. `nest start`

```bash
$ nest start [name] [options]
```

Ensures the project is built (identical to `nest build`), then spawns `node` on the compiled entry file. It is a thin, portable wrapper — nothing about it is required to run a Nest application in production, where `node dist/main` is the usual command.

### Arguments

| Argument | Description |
|---|---|
| `[name]` | The project to run. Defaults to the workspace's default project. |

### Options

| Option | Alias | Description |
|---|---|---|
| `--path [path]` | `-p` | Path to the `tsconfig` file. |
| `--config [path]` | `-c` | Path to `nest-cli.json`. |
| `--watch` | `-w` | Recompile and restart on source changes. |
| `--builder [name]` | `-b` | `tsc`, `swc`, or `webpack`. |
| `--preserveWatchOutput` | — | Keep previous console output in `tsc` watch mode. |
| `--watchAssets` | — | Watch and re-copy non-TypeScript assets. |
| `--debug [host:port]` | `-d` | Start Node with `--inspect`. Pass `0.0.0.0:9229` to attach a debugger from outside a container. |
| `--webpack` | — | Use webpack. Deprecated in favour of `--builder webpack`. |
| `--webpackPath [path]` | — | Path to the webpack configuration. |
| `--tsc` | — | Force `tsc`. |
| `--exec [binary]` | `-e` | The binary to run instead of `node` — for example `node --enable-source-maps`, or a custom runtime. |
| `--no-shell` | — | Spawn the child process without a shell (see Node's `child_process.spawn`). Avoids a shell layer that can swallow signals in containers. |
| `--env-file [path]` | — | Load environment variables from a file, relative to the current directory, into `process.env` before the app starts. Note this is Node's own `.env` loading, independent of `@nestjs/config`. |
| `-- [key=value …]` | — | Everything after a bare `--` is forwarded to the application and readable via `process.argv`. |

```bash
# Debug a specific monorepo app, watching assets, with SWC
$ nest start api -b swc --watch --watchAssets --debug 0.0.0.0:9229

# Forward arguments to the application itself
$ nest start -- --seed --tenant=acme
```

---

## 7. `nest add`

```bash
$ nest add <name> [options]
```

Installs a package **and runs its install schematic**. This is not `npm install`: it is for packages published as Nest libraries that need to modify your source — register a module in `app.module.ts`, add a config file, patch `main.ts`.

| Argument | Description |
|---|---|
| `<name>` | The npm package name of the library to add. |

If a package has no install schematic, `nest add` does nothing useful and you should use your package manager directly. Most of the `@nestjs/*` ecosystem falls into this category — `@nestjs/config`, `@nestjs/typeorm`, and friends are plain `npm install`.

---

## 8. `nest info`

```bash
$ nest info
```

Prints the Nest banner followed by system information and the installed versions of every `@nestjs/*` package it can find:

```text
[System Information]
OS Version     : macOS Sonoma
NodeJS Version : v20.18.0
NPM Version    : 10.8.2

[Nest CLI]
Nest CLI Version : 11.0.0

[Nest Platform Information]
platform-express version : 11.0.0
schematics version       : 11.0.0
testing version          : 11.0.0
common version           : 11.0.0
core version             : 11.0.0
```

Paste this into every bug report you file. Version skew between `@nestjs/core` and a satellite package is the single most common cause of "this worked yesterday" — see [Chapter 59](../part3-advanced/59-migration-and-ecosystem.md).

---

## 9. `nest-cli.json` — the complete schema

The CLI stores everything it needs in `nest-cli.json` at the workspace root. Nest maintains this file for you as you add projects, but you will edit it by hand for assets, builders, and plugins.

### Standard mode

```json title="nest-cli.json (standard mode)"
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": ["**/*.graphql"],
    "watchAssets": true
  },
  "generateOptions": {
    "spec": false
  }
}
```

### Monorepo mode

```json title="nest-cli.json (monorepo mode)"
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/api/src",
  "monorepo": true,
  "root": "apps/api",
  "compilerOptions": {
    "builder": "webpack",
    "tsConfigPath": "apps/api/tsconfig.app.json",
    "deleteOutDir": true
  },
  "projects": {
    "api": {
      "type": "application",
      "root": "apps/api",
      "entryFile": "main",
      "sourceRoot": "apps/api/src",
      "compilerOptions": {
        "tsConfigPath": "apps/api/tsconfig.app.json"
      }
    },
    "worker": {
      "type": "application",
      "root": "apps/worker",
      "entryFile": "main",
      "sourceRoot": "apps/worker/src",
      "compilerOptions": {
        "tsConfigPath": "apps/worker/tsconfig.app.json"
      },
      "generateOptions": {
        "spec": { "service": false, "s": false }
      }
    },
    "shared": {
      "type": "library",
      "root": "libs/shared",
      "entryFile": "index",
      "sourceRoot": "libs/shared/src",
      "compilerOptions": {
        "tsConfigPath": "libs/shared/tsconfig.lib.json"
      }
    }
  }
}
```

### Top-level properties

| Key | Type | Default | Meaning |
|---|---|---|---|
| `$schema` | string | — | JSON Schema URL. Purely for editor autocomplete; add it. |
| `collection` | string | `"@nestjs/schematics"` | The schematics collection used by `nest generate`. Change it only to use a custom collection. |
| `sourceRoot` | string | `"src"` | Root of the source tree for the single project (standard mode) or the default project (monorepo mode). |
| `entryFile` | string | `"main"` | Name of the entry file without extension, at the top level for standard mode. |
| `monorepo` | boolean | absent | Present and `true` only in monorepo mode. Written by `nest g app`/`nest g library`; do not set it by hand. |
| `root` | string | — | **Monorepo only.** Project root of the *default project*, i.e. what `nest build` and `nest start` target with no name. |
| `compilerOptions` | object | `{}` | Compiler and builder settings — see below. |
| `generateOptions` | object | `{}` | Default flags for `nest generate` — see below. |
| `projects` | object | — | **Monorepo only.** A map of project name → project metadata. |

### `compilerOptions`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `builder` | string _or_ object | `"tsc"` (standard), `"webpack"` (monorepo) | Which builder to use: `tsc`, `swc`, or `webpack`. The object form is `{ "type": "swc", "options": { … } }`, where `options` are passed to the builder. |
| `webpack` | boolean | `false` (standard), `true` (monorepo) | **Deprecated** — use `builder`. `true` selects webpack, `false` selects `tsc`. |
| `webpackConfigPath` | string | `"webpack.config.js"` | Path to a webpack configuration file. |
| `tsConfigPath` | string | — | **Monorepo only.** The `tsconfig` used when `nest build`/`nest start` runs without a project name. |
| `deleteOutDir` | boolean | `false` | Wipe `outDir` before every compile. Turn this on — stale `.js` files from deleted sources are a real and hard-to-diagnose class of bug. |
| `assets` | array | `[]` | Non-TypeScript files to copy into the output. Strings are globs; objects accept `include`, `exclude`, `outDir`, `watchAssets`. Assets must live under `src` or they are not copied. |
| `watchAssets` | boolean | `false` | Watch **all** non-TypeScript assets. Setting it here overrides any per-entry `watchAssets` inside `assets`. |
| `manualRestart` | boolean | `false` | Enables typing `rs` in `tsc` watch mode to force a restart. |
| `typeCheck` | boolean | `false` | Enables type checking when `builder` is `swc`. Required for the Swagger/GraphQL CLI plugins under SWC. |
| `plugins` | array | `[]` | AST transformer plugins — see §11. Entries are either a package-name string or `{ "name": "…", "options": { … } }`. |

Asset distribution runs at the start of a compile, **not** on incremental rebuilds in watch mode. That is why `watchAssets` exists as a separate switch.

```json title="Fine-grained assets"
{
  "compilerOptions": {
    "assets": [
      { "include": "**/*.graphql", "exclude": "**/omitted.graphql", "watchAssets": true },
      { "include": "mail/templates/**/*.hbs", "outDir": "dist/templates" }
    ]
  }
}
```

### `generateOptions`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `spec` | boolean _or_ object | `true` | `false` disables spec generation everywhere. The object form keys on schematic name: `{ "service": false }`. |
| `flat` | boolean | `false` | `true` makes every `nest generate` emit files without a containing folder. |

> **⚠️ Notice** — The object form of `spec` does **not** resolve aliases. `{ "service": false }` will not suppress the spec when you run `nest g s`. List both spellings:
>
> ```json
> { "generateOptions": { "spec": { "service": false, "s": false } } }
> ```

### `projects.<name>` (monorepo only)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | `"application"` \| `"library"` | — | Applications have a `main.ts` and can run; libraries export through an `index.ts` and cannot. |
| `root` | string | — | Project root relative to the workspace root: `apps/api` or `libs/shared`. |
| `entryFile` | string | `"main"` for applications, `"index"` for libraries | Entry file name without extension. This one difference is what tells the build process to treat the project as a library. |
| `sourceRoot` | string | `<root>/src` | Source root for the project. |
| `compilerOptions` | object | inherits global | Per-project overrides, most importantly `tsConfigPath`. |
| `generateOptions` | object | inherits global | Per-project `spec` / `flat` defaults. Overrides the global block; overridden by CLI flags. |

Library projects additionally get `paths` entries in the root `tsconfig.json`, which is how `import { X } from '@app/shared'` resolves without publishing anything to npm:

```json title="tsconfig.json (excerpt, written by nest g library)"
{
  "compilerOptions": {
    "paths": {
      "@app/shared": ["libs/shared/src"],
      "@app/shared/*": ["libs/shared/src/*"]
    }
  }
}
```

The full reasoning about when a library is worth its overhead is in [Chapter 54](../part3-advanced/54-monorepo-and-libraries.md).

---

## 10. Webpack configuration

When the builder is webpack, the CLI merges your `webpack.config.js` over its defaults. Two forms work.

```javascript title="webpack.config.js (object form — replaces the key entirely)"
module.exports = {
  externals: [], // bundle node_modules instead of leaving them external
};
```

```javascript title="webpack.config.js (function form — extends the defaults)"
module.exports = function (options, webpack) {
  return {
    ...options,
    externals: [],
    plugins: [
      ...options.plugins,
      new webpack.IgnorePlugin({
        checkResource(resource) {
          return ['@nestjs/microservices', 'cache-manager'].includes(resource);
        },
      }),
    ],
  };
};
```

Prefer the function form. The object form silently discards the CLI's carefully assembled defaults for any key you set, which is how projects end up with broken source maps and missing `ts-loader` configuration.

---

## 11. `compilerOptions.plugins`

Plugins are TypeScript AST transformers that the CLI applies during `nest build` and `nest start`. They exist to remove decorator boilerplate that can be inferred from the types you already wrote. Because they run inside the CLI's compilation step, **they do not apply when you invoke `tsc` directly, and they do not apply under `ts-jest`** without extra configuration.

```json title="nest-cli.json"
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "introspectComments": true,
          "classValidatorShim": true,
          "dtoFileNameSuffix": [".dto.ts", ".entity.ts"]
        }
      },
      {
        "name": "@nestjs/graphql",
        "options": {
          "typeFileNameSuffix": [".input.ts", ".args.ts", ".model.ts"],
          "introspectComments": true
        }
      }
    ]
  }
}
```

### `@nestjs/swagger` plugin options

```typescript
export interface PluginOptions {
  dtoFileNameSuffix?: string[];
  controllerFileNameSuffix?: string[];
  classValidatorShim?: boolean;
  dtoKeyOfComment?: string;
  controllerKeyOfComment?: string;
  introspectComments?: boolean;
  skipAutoHttpCode?: boolean;
  esmCompatible?: boolean;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `dtoFileNameSuffix` | `string[]` | `['.dto.ts', '.entity.ts']` | Only files with these suffixes are scanned for model classes. Rename your DTO files or extend this list — a class in `user.model.ts` is invisible to the plugin by default. |
| `controllerFileNameSuffix` | `string[]` | `['.controller.ts']` | Suffixes scanned for controllers. |
| `classValidatorShim` | `boolean` | `true` | Reuse class-validator decorators as schema constraints: `@Max(10)` becomes `maximum: 10`, `@IsEmail()` becomes `format: 'email'`. |
| `dtoKeyOfComment` | `string` | `'description'` | Which `@ApiProperty` key receives an extracted JSDoc comment. |
| `controllerKeyOfComment` | `string` | `'summary'` | Which `@ApiOperation` key receives an extracted JSDoc comment. |
| `introspectComments` | `boolean` | `false` | Read JSDoc comments to produce descriptions and `@example` values. This is the option that makes the plugin genuinely worth enabling. |
| `skipAutoHttpCode` | `boolean` | `false` | Stop the plugin from inserting `@HttpCode()` into controllers. |
| `esmCompatible` | `boolean` | `false` | Fixes syntax errors in projects with `"type": "module"` in `package.json`. |

The plugin infers `@ApiProperty` from TypeScript types, but **it does not add runtime validation**. You still need class-validator decorators for `ValidationPipe` to do anything. See [Chapter 30](../part2-intermediate/30-openapi-advanced.md).

### `@nestjs/graphql` plugin options

```typescript
export interface PluginOptions {
  typeFileNameSuffix?: string[];
  introspectComments?: boolean;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `typeFileNameSuffix` | `string[]` | `['.input.ts', '.args.ts', '.entity.ts', '.model.ts']` | Files scanned for GraphQL type classes. |
| `introspectComments` | `boolean` | `false` | Generate field descriptions from JSDoc comments. |

### Plugins outside the CLI

**Custom webpack build** — register the transformer with `ts-loader`:

```javascript
getCustomTransformers: (program) => ({
  before: [require('@nestjs/swagger/plugin').before({}, program)],
}),
```

**SWC builder** — SWC does not run TypeScript transformers, so the plugins are unavailable at compile time. Either enable type checking:

```bash
$ nest start -b swc --type-check
```

…or pre-generate a metadata file with `PluginMetadataGenerator` and load it at runtime:

```typescript
import metadata from './metadata'; // generated by PluginMetadataGenerator

await SwaggerModule.loadPluginMetadata(metadata);
const document = SwaggerModule.createDocument(app, config);
```

**e2e tests with `ts-jest`** — `ts-jest` compiles in memory and skips the CLI entirely. Register the transformer in the Jest config:

```javascript title="test/swagger-transformer.js"
const transformer = require('@nestjs/swagger/plugin');

module.exports.name = 'nestjs-swagger-transformer';
// bump this whenever you change the options below, or Jest will not invalidate its cache
module.exports.version = 1;
module.exports.factory = (cs) => transformer.before({}, cs.program);
```

```json title="test/jest-e2e.json (jest >= 29)"
{
  "transform": {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      { "astTransformers": { "before": ["<rootDir>/swagger-transformer.js"] } }
    ]
  }
}
```

Delete `dist/` and rebuild whenever you change plugin options — the CLI caches aggressively.

---

## 12. Build modes: `tsc` vs. webpack vs. SWC

| | `tsc` | `webpack` | `swc` |
|---|---|---|---|
| **Selected by** | default in standard mode; `--builder tsc` | default in monorepo mode; `--builder webpack` | `--builder swc` (install `@swc/cli @swc/core`) |
| **Underlying tool** | TypeScript compiler | webpack + `ts-loader` | SWC (Rust) |
| **Output shape** | One `.js` per `.ts`, mirroring `src/` | A single bundled `main.js` (plus chunks) | One `.js` per `.ts`, mirroring `src/` |
| **Relative speed** | Baseline | Slowest cold, good incremental with HMR | ~10–20× faster than `tsc` |
| **Type checking** | Yes — it *is* the type checker | Yes, via `ts-loader` | **No** by default; add `--type-check` (runs `tsc --noEmit` in parallel) |
| **Declaration files** | Yes | Not by default | No |
| **CLI plugins (Swagger/GraphQL)** | Yes | Yes, with `getCustomTransformers` | Only via `--type-check` or a pre-generated metadata file |
| **Watch/HMR** | `--watch` restarts the process | `--watch` plus true HMR via `webpack-hmr` | `--watch` restarts the process |
| **`node_modules` handling** | Left external, resolved at runtime | External by default; `externals: []` bundles them | Left external |
| **Monorepo libraries** | Needs `tsconfig-paths` at runtime (handled by `nest start`) | Bundled in — the deployable is self-contained | Needs `tsconfig-paths` at runtime |
| **Best for** | Small to medium single apps; publishing a library | Monorepos, serverless, and any deployment where a single self-contained file matters | Large codebases where developer feedback loop dominates |
| **Chapter** | [Ch 55](../part3-advanced/55-performance-and-compilation.md) | [Ch 54](../part3-advanced/54-monorepo-and-libraries.md), [Ch 58](../part3-advanced/58-deployment-and-serverless.md) | [Ch 55](../part3-advanced/55-performance-and-compilation.md) |

The recommendation in this book: **SWC in development, and either `tsc` or webpack in CI/production** — with type checking enforced as a separate `tsc --noEmit` step that gates the build. This gives you the fast local loop without ever shipping code that was never type-checked.

```json title="package.json — the recommended split"
{
  "scripts": {
    "start:dev": "nest start -b swc --watch",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "npm run typecheck && nest build"
  }
}
```

---

## 13. Recipes

### Scaffold a monorepo from scratch

```bash
$ nest new acme --strict --package-manager pnpm
$ cd acme
$ nest generate app api        # converts to monorepo; moves the original app under apps/
$ nest generate app worker
$ nest generate library shared # prompts for a prefix; accept @app
```

Result: `apps/acme`, `apps/api`, `apps/worker`, `libs/shared`, one `package.json`, one `node_modules`, one lint and formatter config. The original `acme` project remains the **default project**, so plain `nest start` runs it — set the top-level `root` and `sourceRoot` in `nest-cli.json` if you want a different default.

```bash
$ nest build --all             # build every project
$ nest start worker --watch    # run one project
```

### Add a shared library and consume it

```bash
$ nest generate library shared
$ nest generate module logging --project shared
$ nest generate service logging --project shared
```

Export the public surface through the library's barrel file:

```typescript title="libs/shared/src/index.ts"
export * from './shared.module';
export * from './logging/logging.module';
export * from './logging/logging.service';
```

Then import it in any application exactly as you would an npm package:

```typescript title="apps/api/src/app.module.ts"
import { Module } from '@nestjs/common';
import { LoggingModule } from '@app/shared';

@Module({ imports: [LoggingModule] })
export class AppModule {}
```

`nest build api` resolves `@app/shared` through the `paths` mapping and, under webpack, bundles the library into the app's single output file. No publishing, no `npm link`, no version drift.

### Generate a full CRUD resource

```bash
# REST, with DTOs, entity, spec files, and module registration
$ nest generate resource orders
# ? What transport layer do you use? REST API
# ? Would you like to generate CRUD entry points? Yes

# GraphQL code-first, into a specific monorepo app, without specs
$ nest g res orders --project api --no-spec
# ? What transport layer do you use? GraphQL (code first)

# A microservice message-pattern controller instead of an HTTP controller
$ nest g res orders
# ? What transport layer do you use? Microservice (non-HTTP)
```

Then wire persistence:

```bash
$ npm install @nestjs/typeorm typeorm pg
```

…and edit the generated `orders.module.ts` to import `TypeOrmModule.forFeature([Order])`. The generated `entities/order.entity.ts` is a plain class; add TypeORM decorators to it. [Chapter 14](../part1-beginner/14-first-crud-application.md) walks the whole path.

### Build one app for Docker

```bash
$ nest build api --builder webpack
$ node dist/apps/api/main
```

Webpack produces a single self-contained `main.js`, which lets the runtime image skip `node_modules` almost entirely:

```dockerfile title="Dockerfile"
# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npx nest build api --builder webpack

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/apps/api ./
# only needed for packages webpack could not bundle (native addons)
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
CMD ["node", "main.js"]
```

Two things to verify before trusting this: native modules (`bcrypt`, `sharp`, database drivers with bindings) cannot be bundled and must stay in `node_modules`; and webpack's default `IgnorePlugin` warnings about optional `@nestjs/microservices` peers are noise unless you actually use them. See [Chapter 58](../part3-advanced/58-deployment-and-serverless.md).

### Switch an existing project to SWC

```bash
$ npm install -D @swc/cli @swc/core
```

```json title="nest-cli.json"
{
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true
  }
}
```

`typeCheck: true` is what keeps the Swagger and GraphQL CLI plugins working. Omit it only if you have no plugins and you run `tsc --noEmit` separately.

### Generate without touching the filesystem

```bash
$ nest g resource billing --dry-run
```

Prints every file that would be created or modified. Use it before any `generate` in an unfamiliar monorepo — the `--project` default is the most common way to write files into the wrong application.

### Turn off spec files for services only

```json title="nest-cli.json"
{
  "generateOptions": {
    "spec": { "service": false, "s": false }
  }
}
```

---

**Next:** [Appendix C — Official Doc → Chapter Map](./C-doc-to-chapter-map.md) shows where each page of the official documentation is covered in this book.
