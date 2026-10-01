---
chapter: 3
part: "Part I — Foundations"
title: "Running Code: Scripts, the CLI, and the REPL"
level: beginner
reading_time: "30 min"
prerequisites: [1, 2]
source_docs:
  - "doc/api/synopsis.md"
  - "doc/api/cli.md"
  - "doc/api/repl.md"
  - "doc/api/util.md"
source_url: "https://nodejs.org/docs/latest/api/cli.html"
node_baseline: "27.0.0-pre"
---

# Chapter 3 — Running Code: Scripts, the CLI, and the REPL

**What you will learn**

- Every way to hand JavaScript to Node.js: a file, `-e`, `-p`, standard input, and a shebang script on `PATH`.
- The dozen CLI flags that actually change your daily workflow — `--watch`, `--env-file`, `--check`, `--test`, `--run`, `--inspect`, `-r`/`--import` — and how `NODE_OPTIONS` interacts with them.
- The REPL as a real tool: dot commands, `_` and `_error`, top-level `await`, tab completion, persistent history, and reverse search.
- How to build your own REPL with `node:repl`, including custom dot commands.
- How to write a small, well-behaved CLI script end to end, with argument parsing and correct exit codes.

**Why this matters**

The gap between a beginner and a fluent Node.js developer is often not API knowledge — it is the loop they work in. A fluent developer checks a hypothesis in the REPL instead of writing a scratch file, runs `node --watch server.js` instead of restarting by hand, loads configuration with `--env-file` instead of installing a package for it, and syntax-checks generated files with `node --check` in CI.

None of this is advanced. All of it is built in, and most of it is invisible until someone shows you. This chapter is that tour, and every flag named here was verified against the current command-line documentation.

## The four ways to run code

The command-line synopsis is:

```text
node [options] [V8 options] [<program-entry-point> | -e "script" | -] [--] [arguments]
```

Order matters. Node.js options come before the script; anything after the script — or after a bare `--` — belongs to your program.

### 1. A file

```bash
node server.js
node ./src/index.mjs
node /opt/app/server.js
```

The entry point is a specifier-like string. If it is not absolute, it is resolved as a relative path from the current working directory, and then resolved as though `require()` had asked for it from there. If nothing matches, Node.js throws.

By default the resolved file is loaded as if `require()` had requested it. It is loaded through the ES module loader instead when any of these hold:

- A flag that forces ESM loading was passed, such as `--import`.
- The file has an `.mjs`, `.mts`, or `.wasm` extension.
- The file does not end in `.cjs`, and the nearest parent `package.json` has `"type": "module"`.

Chapters 4 and 5 cover what that distinction means for your code.

### 2. `-e` / `--eval`

Evaluate a string of JavaScript. The modules predefined in the REPL are available, so you can reach for `fs` or `os` without importing them.

```bash
node -e "console.log(os.platform(), os.arch())"
node -e "console.log(process.versions.v8)"
```

Two quoting notes worth memorizing. If the script itself starts with `-`, pass it with `=` so it is not parsed as another flag:

```bash
node --print --eval=-42
```

And on Windows `cmd.exe`, single quotes do not delimit strings — only double quotes do. PowerShell and Git Bash accept both.

### 3. `-p` / `--print`

Identical to `-e`, except the result of the expression is printed.

```bash
node -p "1 + 1"
# 2

node -p "process.version"
# v27.0.0-pre

node -p "JSON.parse(require('node:fs').readFileSync('package.json','utf8')).version"
# 1.4.2
```

`-p` is the most useful flag in this chapter for shell work: any time you would write a throwaway script to compute one value, it is already there.

### 4. Standard input

A bare `-` is an alias for stdin: the script is read from standard input, and the remaining options are passed to that script.

```bash
echo "console.log('from a pipe')" | node -
cat build-report.js | node -
```

Node.js also reads from stdin when given no arguments at all *and* stdin is not a terminal, which is why `node < script.js` works. Use the explicit `-` when you also need to pass arguments, since it makes the boundary unambiguous.

### Bonus: a shebang script

On POSIX systems, a leading shebang line makes a JavaScript file directly executable.

```js
#!/usr/bin/env node
console.log('hello from a real command');
```

```bash
chmod +x ./greet
./greet
```

Node.js strips the shebang line before parsing. On Windows the shebang is ignored — npm generates `.cmd` and PowerShell shims for installed binaries instead — so always publish CLI entry points through the `bin` field of `package.json`.

## The flags you will actually use

There are hundreds of options. These are the ones that change how you work.

| Flag | What it does |
|---|---|
| `-e`, `--eval "script"` | Evaluate a string |
| `-p`, `--print "script"` | Evaluate and print |
| `-c`, `--check` | Syntax check without executing |
| `-i`, `--interactive` | Force the REPL even when stdin is not a TTY |
| `-r`, `--require module` | Preload a CommonJS module before the entry point |
| `--import=module` | Preload an ES module before the entry point **[Experimental]** |
| `--watch` | Restart on file changes |
| `--watch-path=dir` | Watch specific paths instead of the import graph |
| `--watch-preserve-output` | Don't clear the console on restart |
| `--env-file=file` | Load environment variables from a file |
| `--env-file-if-exists=file` | Same, but tolerate a missing file |
| `--no-strip-types` | Turn off TypeScript type stripping |
| `--test` | Run the built-in test runner |
| `--run <script>` | Run a `package.json` script |
| `--inspect[=[host:]port]` | Start the inspector (default `127.0.0.1:9229`) |
| `--inspect-brk[=[host:]port]` | Start the inspector and break before the first line |
| `--inspect-wait[=[host:]port]` | Start the inspector and wait for a debugger to attach |
| `-v`, `--version` | Print the version |
| `-h`, `--help` | Print help |

All options, including V8 options, accept either dashes or underscores as separators: `--pending-deprecation` and `--pending_deprecation` are the same flag. If a single-valued option is passed more than once, the last value wins.

### `--watch`

Watch mode restarts the process whenever a watched file changes. By default it watches the entry point plus every module it requires or imports — your actual dependency graph, not a glob you maintain.

```bash
node --watch server.js
```

It has hard constraints. `--watch` cannot be combined with `--check`, `--eval`, `--interactive`, or the REPL. It requires a file path: it is incompatible with `--run` and with inline script input, and if you give it no file, Node.js exits with status code `9`.

`--watch-path` narrows what is watched, and turns off watching of required or imported modules even when combined with `--watch`:

```bash
node --watch-path=./src --watch-path=./config server.js
```

Two caveats. `--watch-path` is **only supported on macOS and Windows**; using it elsewhere throws `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`. And it cannot be combined with `--check`, `--eval`, `--interactive`, `--test`, or the REPL.

By default each restart clears the console. Keep the scrollback with `--watch-preserve-output`:

```bash
node --watch --watch-preserve-output server.js
```

The signal sent to the old process on restart can be changed with `--watch-kill-signal` **[Experimental]** (Stability 1.1), which is useful when your shutdown handler listens for `SIGINT` rather than the default:

```bash
node --watch --watch-kill-signal SIGINT server.js
```

### `--env-file`

Load environment variables from a file into `process.env`, with no dependency.

```bash
node --env-file=.env server.js
```

The format is one `KEY=value` per line. Anything after `#` is a comment, and multi-line values are supported.

```text
# Database
DATABASE_URL=postgres://localhost:5432/app
PORT=3000          # the port we listen on
```

Three rules govern precedence and are worth committing to memory:

1. **The real environment wins.** If a variable is set both in the environment and in the file, the environment's value is used. This is exactly the behavior you want in production, where the platform injects secrets.
2. **Later files override earlier ones.** You can pass `--env-file` multiple times.
3. **Node.js's own configuration variables are honored.** Variables such as `NODE_OPTIONS` in the file are parsed and applied, not merely stored.

```bash
node --env-file=.env --env-file=.env.development server.js
```

`--env-file` throws if the file does not exist. For optional files — an uncommitted local override — use `--env-file-if-exists`:

```bash
node --env-file=.env --env-file-if-exists=.env.local server.js
```

One sharp edge: environment variables loaded from a file with `--env-file` are **not** applied to a command executed via `--run`.

### `--check`

Parse a file and report syntax errors without executing a line of it.

```bash
node --check ./dist/bundle.js
```

This is the cheapest gate in a build pipeline: it catches a truncated write, a bad template substitution, or a broken code generator before the artifact ships. `--check` honors `--require`, so preloaded compilers still apply.

```bash
# Fail the build if any generated file is not parseable.
find ./dist -name '*.js' -print0 | xargs -0 -n1 node --check
```

Remember that `--check` cannot be combined with `--watch`, `--watch-path`, or `--test`.

### TypeScript: `--no-strip-types`

Node.js strips TypeScript type annotations from `.ts` files by default, so `node app.ts` runs without a build step. This started life behind `--experimental-strip-types`; type stripping is now stable and enabled by default, and the flag to *disable* it was renamed to `--no-strip-types` (the old `--no-experimental-strip-types` remains as an alias).

```bash
node app.ts             # types stripped, runs
node --no-strip-types app.ts   # no stripping
```

Type stripping erases annotations; it does not type-check, and it does not compile constructs that need code generation. Inline types also work in `--eval` unless `--no-strip-types` is set. Chapter 7 covers what is and is not supported.

You can detect the mode at runtime:

```js
console.log(process.features.typescript); // 'strip', or false with --no-strip-types
```

### `--test` and `--run`

`--test` starts the built-in test runner. It cannot be combined with `--watch-path`, `--check`, `--eval`, `--interactive`, or the inspector.

```bash
node --test
node --test --test-name-pattern="parses headers"
node --test --test-reporter=spec
```

Chapter 45 covers the runner and its large surrounding flag set (`--test-concurrency`, `--test-only`, `--test-timeout`, `--test-shard`, coverage thresholds).

`--run` executes a script from the `"scripts"` object of the nearest `package.json`, walking up to the root to find it. If you pass a script name that does not exist, it lists the available ones.

```bash
node --run test
node --run build -- --verbose
```

Arguments after `--` are appended to the script. `--run` prepends `./node_modules/.bin` for each ancestor directory to `PATH`, and executes the command in the directory containing the `package.json` it found.

It is deliberately more limited than `npm run` in exchange for being much faster. Two omissions matter:

- **No `pre`/`post` scripts.** `node --run build` will not run `prebuild` or `postbuild`.
- **No package-manager-specific environment variables.**

It does set two of its own: `NODE_RUN_SCRIPT_NAME` (the script being run) and `NODE_RUN_PACKAGE_JSON_PATH` (the manifest it came from).

### `--inspect` and friends

`--inspect` activates the V8 inspector so Chrome DevTools or your editor can attach. The default is `127.0.0.1:9229`; port `0` picks a random free port.

```bash
node --inspect server.js
node --inspect-brk ./scripts/migrate.js   # pause before the first line
node --inspect-wait server.js             # start, but wait for a debugger
```

Use `--inspect-brk` for short-lived scripts that would otherwise finish before you could attach, and `--inspect-wait` for a long-running process you want to watch from its first instruction.

**Never bind the inspector to a public address.** Binding to a public IP — including `0.0.0.0` — with an open port lets any host that can reach it execute arbitrary code in your process. If you must specify a host, make sure it is unreachable from public networks or firewalled. Chapter 47 covers debugging properly.

### `--require` and `--import`

Both preload a module before your entry point. `--require` (`-r`) follows `require()` resolution; `--import` follows ES module resolution and is **[Experimental]**.

```bash
node --require ./instrumentation.cjs server.js
node --import ./instrumentation.mjs server.js
```

Modules preloaded with `--require` run before modules preloaded with `--import`. Both are preloaded into the main thread *and* into any worker threads, forked processes, or clustered processes — which is exactly what you want for tracing and metrics setup, and exactly what surprises people when a preload has side effects.

### `NODE_OPTIONS`

`NODE_OPTIONS` holds a space-separated list of options applied before the command line. It exists so you can configure Node.js in environments where you do not control the command — a container entrypoint, a CI runner, a process manager.

```bash
export NODE_OPTIONS="--max-old-space-size=2048 --enable-source-maps"
node server.js
```

The rules:

- **Command-line options take precedence** over `NODE_OPTIONS`.
- Not everything is allowed. Options that would change *what* is executed — `-p`, `-e`, a script path — are rejected, and Node.js exits with an error. The documentation carries the exact allow-list.
- For a singleton flag, the command line overrides the environment. `NODE_OPTIONS='--inspect=localhost:4444' node --inspect=localhost:5555` listens on 5555.
- For a repeatable flag, both apply, with the `NODE_OPTIONS` instances first. `NODE_OPTIONS='--require ./a.js' node --require ./b.js` is equivalent to `node --require ./a.js --require ./b.js`.
- Values containing spaces are escaped with double quotes: `NODE_OPTIONS='--require "./my path/file.js"'`.

## The REPL

Type `node` with no arguments and you get a Read-Eval-Print Loop. It is not a toy: multi-line editing, tab completion and completion previews, persistent history, ZSH-style reverse search, ANSI-styled output, and top-level `await`.

```console
$ node
Welcome to Node.js v27.0.0-pre.
> const nums = [3, 1, 2];
undefined
> nums.sort()
[ 1, 2, 3 ]
> await fetch('https://example.com').then((r) => r.status)
200
```

Note the `undefined` after the declaration: the REPL prints the value of the last expression, and a `const` declaration evaluates to `undefined`. That is not an error.

### Dot commands

Every REPL instance supports these:

| Command | Effect |
|---|---|
| `.help` | Show the list of special commands |
| `.break` | Abandon a multi-line expression in progress (same as <kbd>Ctrl</kbd>+<kbd>C</kbd>) |
| `.clear` | Reset the REPL context to an empty object and clear any multi-line input |
| `.editor` | Enter editor mode for multi-line input (<kbd>Ctrl</kbd>+<kbd>D</kbd> to run, <kbd>Ctrl</kbd>+<kbd>C</kbd> to cancel) |
| `.load <path>` | Load a file into the current session |
| `.save <path>` | Save the current session's inputs to a file |
| `.exit` | Close the I/O stream and exit |

`.editor` is the one people miss. When you want to paste or write a whole function, it turns off per-line evaluation so nothing is executed until you finish:

```console
> .editor
// Entering editor mode (^D to finish, ^C to cancel)
function retry(fn, times) {
  return async (...args) => {
    let last;
    for (let i = 0; i < times; i++) {
      try { return await fn(...args); } catch (err) { last = err; }
    }
    throw last;
  };
}
// ^D
undefined
> typeof retry
'function'
```

`.save` and `.load` pair naturally: explore, `.save ./scratch.js` when something works, `.load` it in a later session. Note that `.clear` resets the *context* and wipes every variable you defined — it does not merely clear the screen.

### Keys

| Key | Effect |
|---|---|
| <kbd>Tab</kbd> on a blank line | List global and local (scope) variables |
| <kbd>Tab</kbd> while typing | Show relevant completions |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> once | Same as `.break` |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> twice on a blank line | Same as `.exit` |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Same as `.exit` |
| <kbd>Ctrl</kbd>+<kbd>R</kbd> | Reverse-i-search backward through history |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Search history forward |

Reverse-i-search behaves like ZSH: duplicate entries are skipped, an entry is accepted as soon as you press any key that is not part of the search, and <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>C</kbd> cancels. Changing direction searches the next entry that way from your current position.

### `_` and `_error`

The result of the most recently evaluated expression is assigned to `_`.

```console
> [1, 2, 3].map((n) => n * 2)
[ 2, 4, 6 ]
> _.length
3
```

Assigning to `_` explicitly disables the behavior, and the REPL tells you so:

```console
> _ += 1
Expression assignment to _ now disabled.
4
```

Similarly, `_error` holds the most recently seen error:

```console
> throw new Error('boom');
Uncaught Error: boom
> _error.message
'boom'
```

`_error` saves you rerunning anything when something throws deep inside a chained expression.

### Core modules and `await`

The default evaluator loads core modules on demand. Typing `fs` evaluates as though you had written `global.fs = require('node:fs')` — unless you have already declared a variable by that name.

```console
> fs.existsSync('./package.json')
true
> path.resolve('.')
'/home/dev/projects/api'
```

Top-level `await` is always enabled at the REPL. (It used to sit behind `--experimental-repl-await`; that flag has been removed and the behavior can no longer be disabled.)

```console
> const { readFile } = await import('node:fs/promises');
undefined
> (await readFile('package.json', 'utf8')).length
1284
```

Multi-line input is indicated with a `|` continuation marker rather than the prompt.

### History and environment

History persists to `.node_repl_history` in your home directory. Three environment variables control REPL behavior:

| Variable | Effect |
|---|---|
| `NODE_REPL_HISTORY` | Path to the history file. Set to `''` to disable persistence. On Windows, empty values are invalid — use one or more spaces instead. |
| `NODE_REPL_HISTORY_SIZE` | Number of lines to persist. Must be positive. **Default:** `1000` |
| `NODE_REPL_MODE` | `'sloppy'` or `'strict'`. **Default:** `'sloppy'` |

Disable history when you are about to paste a credential:

```bash
NODE_REPL_HISTORY='' node
```

### Building your own REPL

`node:repl` is a public module. `repl.start([options])` returns a `REPLServer`, and every option is adjustable — the prompt, the input and output streams, the evaluator, the writer, the completer.

The common real use is an application console: a REPL preloaded with your service's objects so an operator can inspect live state.

```mjs
// console.mjs — run with: node console.mjs
import repl from 'node:repl';
import { createDb } from './src/db.mjs';
import { cacheStats } from './src/cache.mjs';

const db = await createDb();

const server = repl.start({ prompt: 'app> ' });

// Anything on `context` appears as a local variable inside the REPL.
server.context.db = db;
server.context.cacheStats = cacheStats;

server.on('exit', async () => {
  await db.close();
  process.exit(0);
});
```

Context properties are writable by default. To expose something an operator must not reassign, define it with `Object.defineProperty`:

```mjs
Object.defineProperty(server.context, 'db', {
  configurable: false,
  enumerable: true,
  value: db,
});
```

You can also add your own dot commands with `replServer.defineCommand(keyword, cmd)`. The keyword is given *without* the leading dot. `cmd` is either a function or an object with `help` and `action`:

```mjs
server.defineCommand('stats', {
  help: 'Print cache hit statistics',
  action() {
    this.clearBufferedCommand();
    console.table(cacheStats());
    this.displayPrompt();
  },
});
```

Inside an action, `this` is the `REPLServer`. Calling `this.clearBufferedCommand()` discards any partially typed multi-line input, and `this.displayPrompt()` redraws the prompt — do both, or the REPL is left in a confusing state.

Two more options worth knowing. `useGlobal: true` makes the evaluator use the real `global` object as its context instead of a fresh one — the `node` CLI REPL sets this, but `repl.start()` defaults to `false`. `handleError` (added in v25.9.0) customizes error handling: return `'print'` (the default), `'ignore'`, or `'unhandled'` to forward the exception to `'uncaughtException'`. Also note that `repl.builtinModules` is **[Deprecated]** — use `module.builtinModules`.

## Writing a tiny CLI, end to end

Let us build something complete: a `wordcount` command that counts words in files, supports a couple of flags, and behaves correctly when used in a pipeline.

Create the project:

```bash
mkdir wordcount && cd wordcount
npm init -y
```

Make it an ES module package and declare the binary, in `package.json`:

```json
{
  "name": "wordcount",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "wordcount": "./bin/wordcount.js"
  },
  "engines": {
    "node": ">=24"
  }
}
```

Then `bin/wordcount.js`:

```mjs
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h', default: false },
    json: { type: 'boolean', short: 'j', default: false },
    min: { type: 'string', short: 'm', default: '1' },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`usage: wordcount [--json] [--min N] <file...>

  -j, --json   emit JSON instead of a table
  -m, --min N  ignore words shorter than N characters (default 1)
  -h, --help   show this message`);
  process.exit(values.help ? 0 : 2);
}

const minLength = Number.parseInt(values.min, 10);
if (!Number.isInteger(minLength) || minLength < 1) {
  console.error(`wordcount: --min must be a positive integer, got ${values.min}`);
  process.exit(2);
}

const results = [];
let failed = false;

for (const file of positionals) {
  try {
    const text = await readFile(file, 'utf8');
    const words = text
      .split(/\s+/u)
      .filter((w) => w.length >= minLength);
    results.push({ file, words: words.length, characters: text.length });
  } catch (err) {
    console.error(`wordcount: ${file}: ${err.code ?? err.message}`);
    failed = true;
  }
}

if (values.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.table(results);
}

process.exitCode = failed ? 1 : 0;
```

`util.parseArgs()` returns `values` (a null-prototype object of parsed options) and `positionals`. It is strict by default, so an unknown flag throws rather than being ignored, and `allowPositionals` must be enabled explicitly when `strict` is on. Options support `type` (`'boolean'` or `'string'`), `short`, `multiple`, and `default`.

Try it:

```bash
chmod +x bin/wordcount.js
node bin/wordcount.js README.md package.json
node bin/wordcount.js --json --min 4 README.md
npm link && wordcount README.md
```

Three details separate a script from a *tool*:

- **Errors go to `stderr`**, so `wordcount x.md > out.json` still shows what went wrong.
- **Exit codes are meaningful**: `0` success, `1` runtime failure, `2` usage error. Setting `process.exitCode` instead of calling `process.exit()` lets output flush — `process.exit()` can truncate `stdout` when it is a pipe.
- **`--help` exits `0`, a missing argument exits `2`**: asking for help is a success, forgetting an argument is not.

## Common mistakes

### ❌ Putting Node.js flags after the script name

Everything after the entry point belongs to your program, so the flag is silently handed to your code instead of to Node.js.

```bash
# ❌ Node ignores this; process.argv gets '--watch'.
node server.js --watch
```

```bash
# ✅ Node options come first.
node --watch server.js
```

### ❌ Using `process.exit()` to end a CLI that just printed output

`process.exit()` terminates immediately. If `stdout` is a pipe or a file, buffered writes can be lost.

```mjs
// ❌ Output may be truncated when piped.
console.log(JSON.stringify(bigResult));
process.exit(hadErrors ? 1 : 0);
```

```mjs
// ✅ Set the code and let the process end naturally.
console.log(JSON.stringify(bigResult));
process.exitCode = hadErrors ? 1 : 0;
```

### ❌ Expecting `--env-file` values to override the real environment

The environment wins. A stale value exported in your shell will quietly shadow the file, and you will spend twenty minutes blaming the file.

```bash
# ❌ DATABASE_URL in .env is ignored; the exported value is used.
export DATABASE_URL=postgres://old-host/db
node --env-file=.env server.js
```

```bash
# ✅ Unset the conflicting variable, or pass it explicitly for this invocation.
unset DATABASE_URL
node --env-file=.env server.js
```

### ❌ Exposing the inspector on a public interface

`--inspect=0.0.0.0` on a reachable host is remote code execution as a feature.

```bash
# ❌ Anyone who can reach port 9229 owns this process.
node --inspect=0.0.0.0:9229 server.js
```

```bash
# ✅ Keep it local and tunnel in over SSH when you need it.
node --inspect=127.0.0.1:9229 server.js
# then, from your laptop:
ssh -L 9229:127.0.0.1:9229 user@host
```

### ❌ Assuming `node --run` behaves like `npm run`

It does not run `pre`/`post` scripts, and it does not pass along `--env-file` variables to the command it executes.

```bash
# ❌ 'prebuild' never runs.
node --run build
```

```bash
# ✅ Either invoke the steps explicitly, or use your package manager for lifecycle scripts.
node --run prebuild && node --run build
```

## Production notes

- **`--watch` is a development tool, not a process supervisor.** It restarts on file change; it does not restart on crash, does not do health checks, and does not manage zero-downtime rollout. Use your platform's supervisor in production.
- **Preload flags propagate.** `--require` and `--import` are applied to worker threads, forked child processes, and cluster workers as well as the main thread. That is what makes them the right place for tracing setup — and why a preload with heavy side effects multiplies its cost by your worker count.
- **`NODE_OPTIONS` is the deployment-time control surface.** In a container or a managed platform where you cannot change the command, it is often the only way to set `--max-old-space-size`, `--enable-source-maps`, or a tracing preload. Log its value at startup so it is visible in incident review.
- **Never expose the inspector port.** Bind it to loopback, keep it firewalled, and reach it through an SSH tunnel. Prefer `--inspect-wait` over `--inspect-brk` for services, so the process does not sit halted if nothing attaches during a deploy.
- **`--check` belongs in CI.** It is nearly free and catches malformed generated output before it ships. Run it across your build artifacts as a final gate.
- **`--env-file` is convenient, not a secret store.** It reads a plaintext file from disk. In production, inject secrets through your platform's mechanism; keep `--env-file` for local development and use `--env-file-if-exists` for optional local overrides so the same command works everywhere.

## Exercises

1. **Five ways, one output.** Print the current Node.js major version using a file, `-e`, `-p`, a stdin pipe, and an executable shebang script. *Success:* all five produce identical output, and you can explain why `-p` needs no `console.log`.

2. **Watch mode, understood.** Start a script with `node --watch`, and confirm that editing a module it imports triggers a restart while editing an unrelated file does not. Then repeat with `--watch-path` pointed at a directory. *Success:* you can describe exactly what each mode watches, and you know which platforms support `--watch-path`.

3. **An operator console.** Build a `node:repl` script that exposes a live object from your application on `server.context`, defines a `.status` dot command that prints a summary, and cleans up on `'exit'`. *Success:* `.help` lists your command, running it leaves the prompt in a usable state, and exiting closes your resources.

4. **Harden the CLI.** Extend the `wordcount` script to read from stdin when no file arguments are given, add a `--top N` option that prints the most frequent words, and make unknown flags produce a usage error with exit code `2`. *Success:* `cat README.md | wordcount --top 5` works, `wordcount --nope` exits `2` with a message on stderr, and `wordcount --json missing.txt > out.json` writes valid JSON while still reporting the error.

## Recap

- Node.js accepts code from a file, `-e`/`--eval`, `-p`/`--print`, stdin via `-`, or a shebang script; Node options must come before the entry point.
- `--watch` follows the import graph and cannot be combined with `--check`, `--eval`, `--interactive`, or the REPL; `--watch-path` narrows the watch set but only works on macOS and Windows.
- `--env-file` loads `KEY=value` files into `process.env`; the real environment always wins, later files override earlier ones, and `--env-file-if-exists` tolerates a missing file.
- TypeScript type stripping is on by default; disable it with `--no-strip-types`. Check the mode at runtime with `process.features.typescript`.
- `--check` syntax-checks without executing; `--test` runs the built-in test runner; `--run` executes a `package.json` script quickly but skips `pre`/`post` hooks.
- `--inspect`, `--inspect-brk`, and `--inspect-wait` start the inspector on `127.0.0.1:9229` by default — never bind it to a public address.
- `NODE_OPTIONS` applies before the command line, rejects options that change what is executed, and loses to explicit command-line flags for singleton options.
- The REPL supports `.help`, `.break`, `.clear`, `.editor`, `.load`, `.save`, `.exit`, plus `_`, `_error`, on-demand core modules, top-level `await`, tab completion, and reverse-i-search; `node:repl` lets you build the same thing for your own application.

## Where to go next

- [Chapter 4 — Modules I: CommonJS](04-modules-commonjs.md) — what actually happens when Node.js loads your entry point.
- [Chapter 7 — TypeScript in Node.js](07-typescript.md) — the full story on type stripping and its limits.
- [Chapter 25 — The Process Object: argv, env, stdio, exit codes](../part4-system/25-process-object.md) — the runtime side of CLI behavior.
- [Chapter 45 — The Built-in Test Runner](../part7-diagnostics/45-test-runner.md) — everything behind `--test`.
- [Chapter 47 — Debugging: Inspector Protocol, `node --inspect`, Editors](../part7-diagnostics/47-debugging.md) — using the inspector properly.
- [Appendix A — CLI Flag Reference](../appendix/a-cli-flags.md) and [Appendix B — Environment Variable Reference](../appendix/b-environment-variables.md).
- Official docs: <https://nodejs.org/docs/latest/api/cli.html> and <https://nodejs.org/docs/latest/api/repl.html>
