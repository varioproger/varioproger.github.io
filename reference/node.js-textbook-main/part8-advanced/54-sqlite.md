---
chapter: 54
part: "Part VIII — Advanced and Native"
title: "Built-in SQLite (`node:sqlite`)"
level: advanced
reading_time: "40 min"
prerequisites: [14, 16, 22, 45]
source_docs:
  - "doc/api/sqlite.md"
  - "doc/api/cli.md"
  - "doc/api/errors.md"
  - "doc/api/diagnostics_channel.md"
  - "doc/api/permissions.md"
source_url: "https://nodejs.org/docs/latest/api/sqlite.html"
node_baseline: "27.0.0-pre"
---

# Chapter 54 — Built-in SQLite (`node:sqlite`)

## What you will learn

- When an embedded database in the runtime is the right tool, and the workloads where it is exactly wrong.
- `DatabaseSync` and `StatementSync` in full: open options, prepared statements, result shapes, resource lifetime.
- How to bind parameters safely, and why the type mapping has a 64-bit integer trap waiting for you.
- Transactions, savepoints, and a nesting-safe helper you can paste into a project.
- User-defined functions, aggregates, sessions, backups, and extension loading.
- The operational layer: WAL, busy timeouts, the pragmas that matter, and what a synchronous API costs your event loop.

## Why this matters

You are writing a CLI that has to remember things between runs, a build tool that needs a cache keyed on file hashes, or a test suite whose fixtures should be a real relational database rather than a hand-rolled object graph. The classic answer was "add `better-sqlite3` to `package.json`" — a native addon, which means a compiler on the machine or a prebuilt binary for every platform and every Node ABI you support, which means `npm install` breaks the day someone runs it on an architecture nobody published a build for.

`node:sqlite` removes that entire class of problem: SQLite ships inside the Node binary, with zero dependencies and no ABI to track. The cost is a set of constraints you must understand first. SQLite is a library, not a server, and this API is entirely synchronous. Get those two facts wrong and you will build something that works beautifully in development and falls over the first time two things touch it at once.

## Stability, availability, and the flag

> The `node:sqlite` module is at **Stability 1.2 — Release candidate**.

"Release candidate" is the last rung of the experimental ladder: the API is close to final and breaking changes are unlikely, but the project has not committed to semver-major-only changes. It was raised from plain experimental in v25.7.0 / v24.15.0.

The module was originally gated behind `--experimental-sqlite`; that gate was removed in **v23.4.0 / v22.13.0**. In current Node there is only a flag to turn it *off*, `--no-experimental-sqlite`. Nothing you write needs a flag.

```mjs
import { DatabaseSync, backup, constants } from 'node:sqlite';
```

```cjs
const { DatabaseSync, backup, constants } = require('node:sqlite');
```

The module is only available under the `node:` scheme — a typo cannot silently resolve to something from npm.

Now the single most common wrong assumption about this module: **there is no asynchronous or promise-based database class.** No `DatabaseAsync`, no `node:sqlite/promises`. Every class here — `DatabaseSync`, `StatementSync`, `Session`, `SQLTagStore` — executes synchronously on the main thread. The only function that returns a promise is `sqlite.backup()`. Plan your architecture around that.

## Where an embedded database fits

An embedded database is a library that reads and writes a file: no process to start, no port, no connection pool, no network round trip. A query is a function call. That shape is a perfect match for some workloads and a disaster for others.

| Workload | Fit | Why |
|---|---|---|
| CLI tools with persistent state | Excellent | One process, one user, no server to install |
| Desktop / Electron-style apps | Excellent | Data lives with the app; no daemon to ship |
| Edge or single-node services | Good | Zero network latency; the whole dataset is local |
| Build caches, package caches | Excellent | Fast keyed lookups, crash-safe, no external service |
| Test fixtures | Excellent | `':memory:'` gives you a fresh real database per test in microseconds |
| Read-heavy analytics on local files | Good | SQL over a few GB of local data beats hand-written loops |
| Config / metadata stores | Good | Transactional, queryable, one file to back up |
| Multi-writer web services | **Bad** | One writer at a time, process-wide; writers serialize |
| High-concurrency APIs | **Bad** | Synchronous calls block the event loop for every request |
| Horizontally scaled deployments | **Bad** | The file cannot be shared safely across machines |
| Anything on a network filesystem | **Bad** | SQLite's locking is unreliable over NFS/SMB |

The dividing line is *writers*. SQLite allows many concurrent readers, but a write transaction takes an exclusive lock; in WAL mode readers and the writer do not block each other, yet there is still exactly one writer at a time. Several processes writing under load means you want a client/server database. One process that owns the file means SQLite will outrun a network database, because there is no network.

## Your first database

```mjs
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('notes.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id        INTEGER PRIMARY KEY,
    title     TEXT NOT NULL,
    body      TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  ) STRICT
`);

const insert = db.prepare(
  'INSERT INTO notes (title, body, createdAt) VALUES (?, ?, ?)',
);
const info = insert.run('Shopping', 'Milk, bread', Date.now());
console.log(info.lastInsertRowid, info.changes); // e.g. 1 1

const recent = db.prepare(
  'SELECT id, title FROM notes WHERE createdAt > ? ORDER BY createdAt DESC',
);
console.log(recent.all(Date.now() - 86_400_000));

insert.close();
recent.close();
db.close();
```

Three things there are load-bearing. `STRICT` is a SQLite table option, not a Node one, and belongs on every new table: without it SQLite applies "type affinity" and will happily store the string `'hello'` in an `INTEGER` column. `exec()` runs one or more statements and returns nothing — right for schema DDL and for scripts read from a file, and it cannot bind parameters, so it must never see user input. `prepare()` compiles SQL once into a `StatementSync` you execute repeatedly with different values; that is both the fast path and the safe path.

## Type conversion between JavaScript and SQLite

SQLite has five storage classes. JavaScript has considerably more types. Only a subset maps, and writing anything outside the subset throws.

| Storage class | JavaScript → SQLite | SQLite → JavaScript |
|---|---|---|
| `NULL` | `null` | `null` |
| `INTEGER` | `number`, `bigint`, or `boolean` | `number` or `bigint` *(configurable)* |
| `REAL` | `number` | `number` |
| `TEXT` | `string` | `string` |
| `BLOB` | `TypedArray`, `DataView`, `ArrayBuffer`, or `SharedArrayBuffer` | `Uint8Array` |

Note the asymmetry in the last row: you can bind anything that carries bytes, but you always read back a `Uint8Array`. `Buffer` is a `Uint8Array` subclass, so `Buffer.from(row.blob)` copies, while `Buffer.from(row.blob.buffer, row.blob.byteOffset, row.blob.byteLength)` wraps without copying.

`undefined` is not in the table — binding it throws `ERR_INVALID_ARG_TYPE`, as do `Date`, plain objects, arrays, and functions. Choose an explicit representation: timestamps as `INTEGER` epoch milliseconds or `TEXT` ISO strings, structured values as `TEXT` JSON.

Booleans are written as the `INTEGER`s `1` and `0`, and read back as numbers — SQLite has no boolean storage class to remember the intent.

### The 64-bit integer trap

SQLite `INTEGER` is a signed 64-bit value. A JavaScript `number` is a float64, exact only up to 2^53−1. There is a range of valid SQLite integers that cannot be represented as JavaScript numbers.

Node does not silently truncate: reading an `INTEGER` outside the safe-integer range without BigInt reading enabled throws **`ERR_OUT_OF_RANGE`**. That is far better than the alternative, but it means a query that has worked for a year starts throwing the day a rowid, a Snowflake ID, or a nanosecond timestamp crosses 9,007,199,254,740,991.

Turn on BigInt reading for any column that can hold large integers:

```js
const stmt = db.prepare('SELECT id, bytesTransferred FROM transfers');
stmt.setReadBigInts(true);
const rows = stmt.all();
// rows[0].id is 1n, not 1
```

You can also set it per-statement at prepare time, or connection-wide:

```js
const stmt2 = db.prepare('SELECT id FROM transfers', { readBigInts: true });
const bigDb = new DatabaseSync('data.db', { readBigInts: true });
```

Enabling it changes `run()`'s return values too: `changes` and `lastInsertRowid` become BigInts, so `info.lastInsertRowid + 1` throws a `TypeError` on mixing BigInt and Number. Decide once and be consistent. Writing is always safe — numbers and BigInts are both accepted — except that a BigInt too large for a signed 64-bit integer throws `ERR_INVALID_ARG_VALUE`.

## `DatabaseSync`: opening and owning a connection

```js
const db = new DatabaseSync(path, options);
```

`path` is a `string`, `Buffer`, or `URL` (Buffer and URL support arrived in v23.10.0 / v22.15.0). The special value `':memory:'` creates a private in-memory database that vanishes when the connection closes.

The options object is large and every field is worth knowing:

| Option | Type | Default | What it does |
|---|---|---|---|
| `open` | boolean | `true` | Open in the constructor. Set `false` to defer to `open()` |
| `readOnly` | boolean | `false` | Read-only mode; fails if the file does not exist |
| `enableForeignKeyConstraints` | boolean | `true` | Enforce `FOREIGN KEY` declarations |
| `enableDoubleQuotedStringLiterals` | boolean | `false` | Accept `"text"` as a string literal (legacy misfeature) |
| `allowExtension` | boolean | `false` | Permit `loadExtension()` and the `loadExtension` SQL function |
| `timeout` | number | `0` | Busy timeout in milliseconds |
| `readBigInts` | boolean | `false` | Read `INTEGER` as `BigInt` |
| `returnArrays` | boolean | `false` | Return rows as arrays instead of objects |
| `allowBareNamedParameters` | boolean | `true` | Bind `foo` for `$foo` |
| `allowUnknownNamedParameters` | boolean | `false` | Ignore object keys that name no parameter |
| `defensive` | boolean | `true` | Disable SQL features that can deliberately corrupt the file |
| `limits` | object | SQLite defaults | Per-connection run-time limits |

A few notes on the non-obvious ones. `enableForeignKeyConstraints` defaults to `true`, the opposite of raw SQLite, where foreign keys are off unless you say `PRAGMA foreign_keys = ON`; leave it on. `enableDoubleQuotedStringLiterals` exists only for legacy schemas — SQLite historically accepted `"some text"` as a string literal when it did not resolve to an identifier, turning a typo in a column name into a silently-matching string. Keep it `false`.

`defensive` became the default in v25.5.0 / v24.14.0; with it on, SQL constructs that let ordinary statements deliberately corrupt the file — writing to `sqlite_schema`, shadow-table writes — are blocked. `database.enableDefensive(active)` toggles it later. `timeout` defaults to `0`, meaning "do not wait at all," which is almost never right for a file-backed database with more than one connection; see [Busy timeouts](#busy-timeouts-and-locking).

`limits` caps per-connection resource usage: `length`, `sqlLength`, `column`, `exprDepth`, `compoundSelect`, `vdbeOp`, `functionArg`, `attach`, `likePatternLength`, `variableNumber`, `triggerDepth`. Since **v25.8.0 / v24.15.0** the same knobs are readable and writable at runtime via `database.limits`, where `Infinity` resets a limit to its compile-time maximum. If you ever compile SQL derived from untrusted structure, these are your defence against a crafted query that pins a core.

```js
db.limits.sqlLength = 100_000;   // cap SQL text at 100 KB
db.limits.vdbeOp = 5_000_000;    // cap work per statement
```

### Lifetime: close, `using`, and leaks

`database.close()` closes the connection and throws if it is already closed. `database.isOpen` tells you which state you are in. `database.location([dbName])` returns the file path backing a database name (`'main'` by default, or anything you have `ATTACH`ed), or `null` for in-memory databases.

Both `DatabaseSync` and `StatementSync` implement `Symbol.dispose`, so on Node versions whose V8 supports explicit resource management you can write:

```js
using db = new DatabaseSync('app.db');
using stmt = db.prepare('SELECT count(*) AS n FROM notes');
console.log(stmt.get().n);
// stmt then db are disposed at end of scope, in reverse order
```

Unlike `close()`, `[Symbol.dispose]()` on a database is a no-op if it is already closed, which makes it safe in `using` positions. Without `using`, `try`/`finally` does the same job.

Statements hold SQLite virtual machines, and in WAL mode an open read transaction prevents checkpointing — so leaking statements in a long-lived process costs both memory and disk. `statement.close()` finalizes one explicitly.

One re-entrancy rule catches everyone: you cannot close a database or a statement from inside a callback SQLite invoked during execution — a user-defined function, an aggregate, an authorizer, or a `'sqlite.db.query'` subscriber. It throws `ERR_INVALID_STATE`, because freeing the running virtual machine would be a use-after-free.

## `StatementSync`: the four execution methods

`database.prepare(sql[, options])` compiles SQL into a `StatementSync`. The options mirror the connection-level ones and default to inheriting them: `readBigInts`, `returnArrays`, `allowBareNamedParameters`, `allowUnknownNamedParameters`, plus `persistent`, which hints to SQLite that the statement will be kept and reused many times (it responds by avoiding lookaside memory). Preparing SQL that contains no statements throws `ERR_INVALID_ARG_VALUE`.

| Method | Returns | Use it for |
|---|---|---|
| `run(...)` | `{ changes, lastInsertRowid }` | `INSERT`, `UPDATE`, `DELETE` |
| `get(...)` | first row object, or `undefined` | Single-row lookups |
| `all(...)` | array of row objects | Small-to-medium result sets |
| `iterate(...)` | iterable iterator of rows | Large or streaming result sets |

`run()`'s return object is the only place you get write metadata: `changes` is the number of rows modified (`sqlite3_changes64()`), `lastInsertRowid` the rowid of the most recent insert. Both are `number` or `bigint` depending on the statement's BigInt configuration.

`iterate()` (v23.4.0 / v22.13.0) is the one people forget. `all()` materializes every row — a `SELECT` over a million rows builds a million objects before your first line of code runs. `iterate()` steps one row at a time:

```js
const rows = db.prepare('SELECT id, body FROM notes ORDER BY id');
let total = 0;
for (const row of rows.iterate()) {
  total += row.body.length;
}
```

The iterator holds an open read cursor, so do not leave one half-consumed across an `await` and do not write to the table you are iterating. Breaking out of the loop closes it; abandoning it in a variable holds a read transaction until GC.

### Inspecting a statement

`statement.columns()` returns metadata for the result columns, which is what you need to build generic tooling:

| Property | Meaning |
|---|---|
| `name` | The name in the result set (respects `AS` aliases) |
| `column` | The unaliased origin column name, or `null` for expressions |
| `table` | The unaliased origin table, or `null` |
| `database` | The unaliased origin database, or `null` |
| `type` | The declared type of the origin column, or `null` |

`statement.sourceSQL` is the SQL text you passed to `prepare()`. `statement.expandedSQL` is that text with placeholders replaced by the values from the most recent execution — exactly what you want in a slow-query log, and exactly what you must **not** dump into a log that is not access-controlled.

Recent builds of `main` also expose `statement.stat(counter)` and `statement.resetStats()`, reading SQLite's per-statement counters: `'fullscanStep'`, `'sort'`, `'autoindex'`, `'vmStep'`, `'reprepare'`, `'run'`, `'filterMiss'`, `'filterHit'`, `'memused'`. Asserting `stmt.stat('fullscanStep') === 0` in a test catches a query that quietly stopped using an index.

## Binding parameters

Binding is not a style preference. String-concatenating user input into SQL *is* SQL injection, still one of the most exploited classes of bug in software. Prepared statements make it structurally impossible: the SQL is compiled before the values exist, so a value can never become syntax.

**Anonymous parameters** are `?` in SQL, bound positionally from the arguments:

```js
db.prepare('SELECT ? AS a, ? AS b').get('x', 42);
// { a: 'x', b: 42 }
```

The `?NNN` form assigns an explicit index, letting you reorder or reuse:

```js
db.prepare('SELECT ?2 AS a, ?1 AS b').get('first', 'second');
// { a: 'second', b: 'first' }
```

**Named parameters** begin with `$`, `:`, or `@` in SQL, and are bound from an object passed as the *first* argument:

```js
db.prepare('SELECT $a AS a, $b AS b').get({ $a: 1, $b: 2 });
db.prepare('SELECT :a AS a').get({ ':a': 1 });
db.prepare('SELECT @a AS a').get({ '@a': 1 });
```

Repeating a name binds the same value everywhere it appears — the reason to prefer named parameters when a value is used more than once.

Because `:` and `@` require quoting in object literals, Node allows **bare names** by default: `{ k: 7 }` binds `$k`. `statement.setAllowBareNamedParameters(false)` turns that off. Three caveats: the prefix is still required in SQL; prefixed keys bind slightly faster; and if one statement uses both `$k` and `@k`, a bare `k` is ambiguous and throws.

Binding a key that names no parameter throws `ERR_INVALID_STATE`. `statement.setAllowUnknownNamedParameters(true)` silently ignores unknown keys — convenient when passing a wide object to several narrow statements, dangerous when a typo means a filter does nothing. Prefer the default. And do not mix `?NNN` placeholders with named parameters in one statement; they share an index space.

### The tagged-template shortcut

`database.createTagStore([maxSize])` (v24.9.0, default 1000) returns an `SQLTagStore`: an LRU cache of prepared statements driven by tagged template literals. Its `run`, `get`, `all`, and `iterate` methods are used as tags, and `${}` becomes a **bound parameter**, not string interpolation.

```js
const sql = db.createTagStore();
const name = 'Alice';
const user = sql.get`SELECT * FROM users WHERE name = ${name}`;
sql.run`INSERT INTO users (name) VALUES (${name})`;
```

Cache hits key on the exact query string including placeholder positions, case-sensitively. Do not put `?` in the template; `${}` is the only binding mechanism. `.size`, `.capacity`, `.db`, and `.clear()` round out the class. The distinction that matters: `sql.run\`...${id}...\`` binds; `db.exec(\`...${id}...\`)` interpolates and is an injection vector.

## Transactions

`node:sqlite` exposes no transaction API. You drive transactions with SQL through `exec()`, which is fine — SQLite's transaction SQL is simple, and doing it yourself makes the control flow explicit. The naive wrapper is three lines and one of them is wrong:

```js
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}
```

The `db.isTransaction` guard is the part people miss. Some SQLite errors — a constraint violation under the default conflict resolution — abort the transaction automatically. An unconditional `ROLLBACK` then throws "cannot rollback - no transaction is active" *from the catch block*, replacing your real error with a confusing one. `database.isTransaction` (v24.0.0 / v22.16.0) wraps `sqlite3_get_autocommit()` and tells you whether a transaction is genuinely open.

For writes, prefer `BEGIN IMMEDIATE` over plain `BEGIN`. A plain `BEGIN` starts as a read transaction and upgrades at the first write; if another connection took the write lock meanwhile, the upgrade fails with `SQLITE_BUSY` and **the busy timeout does not help**, because SQLite cannot safely wait there. `BEGIN IMMEDIATE` takes the write lock up front, where the busy handler does apply.

Nesting needs savepoints, since SQLite has no nested `BEGIN`:

```js
let depth = 0;

export function tx(db, fn) {
  const name = `sp${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
  depth++;
  try {
    const result = fn();
    depth--;
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
    return result;
  } catch (err) {
    depth--;
    if (depth === 0) {
      if (db.isTransaction) db.exec('ROLLBACK');
    } else {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
    }
    throw err;
  }
}
```

The savepoint name comes from a counter you control, never from user input — string-building SQL is safe only when every character came from your own code.

Because everything is synchronous, `fn` must be synchronous. An `async` function will "work": it returns a promise, `COMMIT` runs immediately, and the awaited body executes *outside* the transaction. That is a silent correctness bug.

## User-defined functions and aggregates

`database.function(name[, options], fn)` (v23.5.0 / v22.13.0) registers a scalar SQL function written in JavaScript.

```js
db.function('slugify', { deterministic: true }, (text) => {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-');
});

db.prepare('SELECT slugify(title) AS slug FROM notes').all();
```

| Option | Default | Effect |
|---|---|---|
| `deterministic` | `false` | Sets `SQLITE_DETERMINISTIC`; lets SQLite use the function in indexes and cache results |
| `directOnly` | `false` | Sets `SQLITE_DIRECTONLY`; blocks use from triggers, views, and schema |
| `useBigIntArguments` | `false` | Integer arguments arrive as `BigInt` |
| `varargs` | `false` | Accept any arity; otherwise arity must equal `fn.length` |

Set `deterministic: true` only when the function truly is — same inputs, same output, always. Marking a function that reads the clock or a random source as deterministic produces wrong query results, not an error. Set `directOnly: true` for anything with side effects; it stops a malicious schema invoking your function through a view. A return value of `undefined` becomes SQL `NULL`; anything outside the type mapping table throws.

`database.aggregate(name, options)` (v24.0.0 / v22.16.0) registers an aggregate — or, with `inverse`, a full window function. It wraps `sqlite3_create_window_function()`.

```js
db.aggregate('geomean', {
  start: () => ({ logSum: 0, n: 0 }),
  step: (acc, value) => ({ logSum: acc.logSum + Math.log(value), n: acc.n + 1 }),
  result: (acc) => (acc.n === 0 ? null : Math.exp(acc.logSum / acc.n)),
});

db.prepare('SELECT geomean(latencyMs) AS gm FROM samples').get();
```

`start` is the identity value; passing a function uses its return value, which is how you get a fresh accumulator per aggregation instead of sharing one object across every group. `step` receives `(state, ...args)` and returns the new state; `result` maps the final state to a SQL value. Add `inverse(state, ...args)` — the undo of `step` — and the same registration works as a window function, with `result` called once per frame.

Both run JavaScript inside SQLite's query loop. A function called on every row of a million-row scan is a million V8 boundary crossings: these are for expressiveness, not throughput.

## Sessions and changesets

The session extension records the changes a connection makes so you can replay them elsewhere — the primitive under offline-first sync.

```mjs
import { DatabaseSync } from 'node:sqlite';

const source = new DatabaseSync('local.db');
const session = source.createSession();          // optionally { table, db }

source.prepare('UPDATE notes SET title = ? WHERE id = ?').run('Groceries', 1);

const changeset = session.changeset();           // Uint8Array
session.close();

const target = new DatabaseSync('replica.db');
const applied = target.applyChangeset(changeset, {
  filter: (table) => table !== 'audit_log',
  onConflict: () => constants.SQLITE_CHANGESET_REPLACE,
});
```

`createSession([options])` takes `table` (default: all) and `db` (default `'main'`). `session.changeset()` returns the changes since creation and may be called repeatedly; `session.patchset()` returns a compact form that omits the "before" values — smaller on the wire, worse at detecting conflicts.

`applyChangeset()` returns whether it applied without being aborted. `filter(table)` decides per table whether to attempt changes. `onConflict(type)` receives `SQLITE_CHANGESET_DATA`, `SQLITE_CHANGESET_NOTFOUND`, `SQLITE_CHANGESET_CONFLICT`, `SQLITE_CHANGESET_FOREIGN_KEY`, or `SQLITE_CHANGESET_CONSTRAINT` and must return `SQLITE_CHANGESET_OMIT`, `SQLITE_CHANGESET_REPLACE`, or `SQLITE_CHANGESET_ABORT` — all on `sqlite.constants`. The default returns `ABORT`; anything unexpected, or a throw, aborts and rolls back, and `REPLACE` is valid only for `DATA` and `CONFLICT`. Sessions need tables with explicit `PRIMARY KEY`s.

## Backup, serialize, and deserialize

`sqlite.backup(sourceDb, path[, options])` (v23.8.0 / v22.16.0) is the module's only async function. It copies a live database page by page, so the source stays usable throughout.

```mjs
import { backup, DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('app.db');
const pages = await backup(db, 'app-backup.db', {
  rate: 100,
  progress: ({ totalPages, remainingPages }) => {
    console.log(`${totalPages - remainingPages}/${totalPages}`);
  },
});
```

Options are `source` and `target` (database names, default `'main'`), `rate` (pages per batch, default `100`), and `progress`. The promise resolves with the total pages copied. Mutations from the *same* connection appear immediately; mutations from *other* connections restart the backup from the beginning, so on a busy multi-connection database a low `rate` can mean a backup that never finishes. Never substitute `fs.copyFile()` for this — you can copy a file mid-transaction and get a corrupt result, or miss the `-wal` file entirely.

`database.serialize([dbName])` and `database.deserialize(buffer[, options])` (v26.1.0 / v24.16.0) move a whole database through a `Uint8Array` — ideal for snapshotting an in-memory test database and restoring it before each test:

```js
const snapshot = db.serialize();            // Uint8Array
const fresh = new DatabaseSync(':memory:');
fresh.deserialize(snapshot);                // fully writable
```

`deserialize()` finalizes all existing prepared statements first — even if it then fails — so re-prepare afterwards. It throws `ERR_INVALID_STATE` if called while a database callback is on the stack.

## Extensions, authorizers, and defensive mode

`database.loadExtension(path[, entryPoint])` loads a SQLite shared-library extension. It requires `allowExtension: true` at construction time — there is no way to enable it later, by design. `database.enableLoadExtension(allow)` can turn it *off* afterwards, and once off it cannot be turned back on.

```js
const db = new DatabaseSync('app.db', { allowExtension: true });
db.loadExtension('./sqlite-vec.so');                    // derived entry point
db.loadExtension('./base64.so', 'sqlite3_base64_init'); // explicit entry point
db.enableLoadExtension(false);                          // lock the door
```

Loading an extension executes arbitrary native code in your process; treat the path as you would `process.dlopen()`. Failures surface as **`ERR_LOAD_SQLITE_EXTENSION`**; general SQLite failures as **`ERR_SQLITE_ERROR`**.

`database.setAuthorizer(callback)` (v24.10.0) installs a callback SQLite invokes for every data access and schema change a prepared statement attempts. It receives `(actionCode, arg1, arg2, dbName, triggerOrView)` and returns `constants.SQLITE_OK`, `SQLITE_DENY`, or `SQLITE_IGNORE`. `SQLITE_IGNORE` is the interesting one: reads return `NULL` instead of failing.

```js
import { DatabaseSync, constants } from 'node:sqlite';

const db = new DatabaseSync('report.db', { readOnly: true });
db.setAuthorizer((actionCode, table) => {
  if (actionCode === constants.SQLITE_READ && table === 'secrets') {
    return constants.SQLITE_IGNORE;
  }
  return constants.SQLITE_OK;
});
```

This is how you offer "write your own SELECT" without handing over the whole schema. The hard rule: the authorizer must not touch the connection that invoked it — `prepare()`, `exec()`, that connection's statement executions, iterators, tag store methods, and `setAuthorizer()` itself all throw `ERR_INVALID_STATE` while the callback is on the stack. Other connections stay usable.

## Operational practice

### WAL mode

The single most impactful setting for a file-backed database is the journal mode. The default rollback journal blocks readers during a write; Write-Ahead Logging does not — readers see a consistent snapshot while a writer appends.

```js
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA foreign_keys = ON');
```

`journal_mode = WAL` is persistent — stored in the file, so set once. `synchronous = NORMAL` is per-connection; under WAL it stays durable against application crashes and only risks the most recent transactions on an OS crash or power loss, for a large throughput win. Keep `FULL` if you cannot lose a committed transaction under any circumstances.

WAL creates two sidecar files, `app.db-wal` and `app.db-shm`, which are part of your database — backup scripts, volume mounts, and `.gitignore` rules all need to know that. WAL also needs shared memory, which does not work on most network filesystems.

### Busy timeouts and locking

When a connection wants a lock another holds, SQLite fails immediately with `SQLITE_BUSY` unless a busy timeout is set. The `timeout` option defaults to `0`.

```js
const db = new DatabaseSync('app.db', { timeout: 5000 });
```

SQLite then retries with backoff for up to five seconds. Set this for any database touched by more than one connection — multiple processes, or worker threads each with their own `DatabaseSync` — and combine it with `BEGIN IMMEDIATE` so the timeout applies. Recognise what it is not: a busy timeout does not make SQLite concurrent, it converts a fast failure into a slow one.

### The pragmas worth knowing

| Pragma | Why |
|---|---|
| `journal_mode = WAL` | Concurrent readers with a writer. Persistent |
| `synchronous = NORMAL` | Large write throughput win under WAL. Per connection |
| `foreign_keys = ON` | Node defaults this on; verify if you touch the pragma |
| `busy_timeout = N` | Same effect as the `timeout` option, set in SQL |
| `user_version` | A free integer slot in the file header — use it for schema versioning |
| `optimize` | Run before closing a long-lived connection; refreshes query planner stats |
| `wal_checkpoint(TRUNCATE)` | Force the WAL back into the main file and shrink it |
| `cache_size = -N` | Page cache in kibibytes (negative means KiB, positive means pages) |

### Synchronous APIs and the event loop

Every `run()`, `get()`, `all()`, and `iterate()` step blocks the thread. During a query your process handles no timers, no I/O completions, no incoming connections.

For a CLI, a build tool, or a test suite that is an advantage: straight-line code, no async colouring, no interleaving to reason about.

For a server it is a budget. An indexed point lookup on a warm cache costs tens of microseconds, and at that scale blocking is cheaper than the scheduling and promise overhead an async driver would add — this is why `better-sqlite3` is synchronous too. The trouble starts when a query is not a point lookup: a report scanning a few hundred thousand rows takes hundreds of milliseconds, during which every other request is stalled.

Practical rules:

- Measure your queries. `perf_hooks` or the `'sqlite.db.query'` diagnostics channel will tell you the real distribution. Anything over a few milliseconds on the request path is a problem.
- Index everything on the hot path, and prove it with `EXPLAIN QUERY PLAN` or `statement.stat('fullscanStep')`.
- Push long analytical queries into a `Worker` thread with its own `DatabaseSync` on the same file, opened `readOnly`, in WAL mode. The worker blocks; the main thread does not. See [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md).
- Chunk bulk writes. One transaction of 10,000 inserts is fast and blocks for a long time; ten transactions of 1,000 give the loop room to breathe.

### Observing queries

Recent builds of `main` publish an **[Experimental]** `'sqlite.db.query'` diagnostics channel event after each statement completes, carrying `sql` (expanded), `database`, and `duration` in nanoseconds from SQLite's internal profiler. It is a profiling event, not a tracing span: one event on completion, no start event, no async context propagation — wrap your calls in a `TracingChannel` if you need OpenTelemetry spans. Publishing costs nothing with no subscribers, and subscribers must not close the database or statement. See [Chapter 48 — Diagnostics Channel and Trace Events](../part7-diagnostics/48-diagnostics-channel-tracing.md).

### Migrations

You need a schema versioning story from day one. `PRAGMA user_version` is a free integer in the file header, and that is all the machinery a small application needs.

```js
const MIGRATIONS = [
  (db) => db.exec(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL
    ) STRICT
  `),
  (db) => db.exec('ALTER TABLE notes ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0'),
  (db) => db.exec('CREATE INDEX notes_createdAt ON notes(createdAt)'),
];

export function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
```

Migrations are append-only: never edit one that has shipped. `PRAGMA user_version` cannot take a bound parameter, so it must be interpolated — safe here because `v` is a loop index over your own array. SQLite's `ALTER TABLE` only renames a table or column, adds a column, or drops one; to change a type or constraint, use the sequence SQLite documents — create the new table, copy, drop, rename — inside one transaction.

## Choosing `node:sqlite` or something else

### Versus `better-sqlite3`

| | `node:sqlite` | `better-sqlite3` |
|---|---|---|
| Install | Built in | Native addon; prebuilds or a compiler |
| API shape | Synchronous | Synchronous |
| Stability | Release candidate (1.2) | Stable, years of production use |
| Transactions | Roll your own with `exec()` | `db.transaction(fn)` built in, with `.immediate` / `.exclusive` variants |
| Custom functions | `function()`, `aggregate()` | Equivalent |
| Sessions, backup, serialize | Yes | Yes (backup is sync) |
| Virtual tables | Not exposed | `table()` API |
| Ecosystem | New | Large; many ORMs target it directly |

Starting fresh, `node:sqlite` is the right default. If you need virtual tables, an ORM that only speaks `better-sqlite3`, or a stable-marked API today, the addon remains a fine choice; the APIs are close enough that porting is mechanical.

### Versus a client/server database

Reach for Postgres or MySQL when more than one process writes, when you need to scale horizontally, when you need per-user roles and network access control, when you need replication, or when your working set exceeds what one machine's disk and page cache can serve. Stay with SQLite when one process owns the data, the dataset fits on local disk, and you would rather ship a file than operate a service — every query is a function call, not a network round trip, and the operational difference is larger still.

## Common mistakes

### ❌ Building SQL with template literals

```js
// Anyone who can control `name` owns your database.
const rows = db.prepare(`SELECT * FROM users WHERE name = '${name}'`).all();
```

`name = "'; DROP TABLE users; --"` is the textbook case; the quiet version is worse, where a name containing an apostrophe throws a syntax error in production on a Tuesday. Interpolation also defeats the statement cache, since every value produces different SQL.

```js
// ✅ Bind it.
const stmt = db.prepare('SELECT * FROM users WHERE name = ?');
const rows = stmt.all(name);

// ✅ Or use the tag store, where ${} binds rather than interpolates.
const sql = db.createTagStore();
const rows2 = sql.all`SELECT * FROM users WHERE name = ${name}`;
```

### ❌ Preparing inside the loop

```js
for (const note of notes) {
  db.prepare('INSERT INTO notes (title, body) VALUES (?, ?)')
    .run(note.title, note.body);
}
```

This recompiles the SQL every iteration, leaks a statement handle each time, and runs each insert in its own implicit transaction — an `fsync` per row. On a real disk that is a hundredfold slowdown.

```js
// ✅ Prepare once, wrap in one transaction, close when done.
const insert = db.prepare('INSERT INTO notes (title, body) VALUES (?, ?)');
tx(db, () => {
  for (const note of notes) insert.run(note.title, note.body);
});
insert.close();
```

### ❌ Assuming integers survive the round trip

```js
const { lastInsertRowid } = insert.run('x', 'y');
// Months later, rowids pass 2^53 and every read of this column throws
// ERR_OUT_OF_RANGE — including reads of rows written long ago.
```

```js
// ✅ Decide the integer mode explicitly, at the connection level.
const db = new DatabaseSync('app.db', { readBigInts: true });
// Now `changes` and `lastInsertRowid` are BigInts too — keep arithmetic
// consistently BigInt, or convert at a single boundary in your data layer.
const id = Number(insert.run('x', 'y').lastInsertRowid); // only if you know it fits
```

### ❌ Passing an async function to a transaction helper

```js
tx(db, async () => {
  await fetchSomething();       // runs AFTER commit
  insert.run('a', 'b');         // outside the transaction entirely
});
```

The helper sees a promise returned instantly, commits, and the awaited body executes later with no transaction open. Nothing throws; the atomicity never existed.

```js
// ✅ Do the async work first, then run a synchronous transaction.
const data = await fetchSomething();
tx(db, () => insert.run(data.a, data.b));
```

## Production notes

- **Set the busy timeout and WAL mode at open time, every time.** Write one `openDatabase()` helper that applies `timeout`, `journal_mode = WAL`, and `synchronous = NORMAL`, and never construct a `DatabaseSync` anywhere else. Configuration drift between connections to the same file produces bugs that only appear under concurrency.
- **Budget event-loop time explicitly.** In a server, treat any SQLite call over ~1 ms as a latency incident for every concurrent request, not just the one that issued it. Subscribe to `'sqlite.db.query'` in staging, put a histogram of `duration` on a dashboard, and move reporting queries to worker threads with read-only connections.
- **`expandedSQL` contains your data.** It is the best debugging property in the module and the easiest way to leak PII into a log aggregator. Log `sourceSQL` plus a parameter count in production; gate `expandedSQL` behind a debug flag and a sink you control.
- **The permission model does not cover SQLite.** Node's docs state that the Permission Model restricts filesystem access through `node:fs` and does not guarantee other modules — `node:sqlite` among them — cannot reach the filesystem. Under `--permission`, a SQLite path is still a filesystem path. See [Chapter 31 — The Permission Model](../part4-system/31-permission-model.md).
- **Extensions and authorizers are security surfaces pointing opposite ways.** `allowExtension: true` loads arbitrary native code; leave it `false` unless you control the shared library. `setAuthorizer()` makes user-supplied SQL survivable, but it cannot touch its own connection and it fires on every table and column access, so keep the callback allocation-free.
- **Statements are resources, and `':memory:'` is per-connection.** Prepare once at startup, close on shutdown; an abandoned iterator holds a read transaction that prevents WAL checkpointing, so the `-wal` file grows without bound. Two `DatabaseSync(':memory:')` instances are two unrelated databases — clone with `serialize()`/`deserialize()` to share one.
- **Plan for corruption you did not cause.** Power loss, a container killed mid-checkpoint, a filesystem that lies about `fsync`. Run `PRAGMA integrity_check` on a schedule, back up with the backup API, and test the restore path rather than assuming it.

## Exercises

1. **A key–value cache with TTL.** Build a module exposing `get(key)`, `set(key, value, ttlMs)`, and `sweep()` over a single SQLite table. Store values as JSON `TEXT` and expiry as an `INTEGER` epoch. *Success:* `get()` returns `undefined` for expired keys without needing `sweep()` to have run, all SQL is parameterized, and the table is `STRICT`.

2. **Prove the transaction helper.** Take the `tx()` helper from this chapter and write tests with `node:test` covering: commit on success; rollback on a thrown error; nested savepoint rollback that leaves the outer transaction intact; and a constraint violation that SQLite auto-rolled-back, verifying no "no transaction is active" error escapes. *Success:* four passing tests against a `':memory:'` database.

3. **Find the missing index.** Create a table of 200,000 rows, run a filtered query, and assert with `statement.stat('fullscanStep')` that it performs a full scan. Add the index, re-prepare, and assert the counter is zero. *Success:* both assertions pass and you can explain the `EXPLAIN QUERY PLAN` output for each.

4. **Blocking, measured.** Write an HTTP server backed by SQLite with one fast endpoint and one that runs an unindexed aggregate over a large table. Under load, record p99 latency of the fast endpoint while the slow one is hit; then move the slow query into a `Worker` with a `readOnly` WAL connection and measure again. *Success:* before/after p99 numbers and a written explanation of the mechanism.

5. **Offline sync round trip.** Using `createSession()`, `changeset()`, and `applyChangeset()`, simulate two replicas that both edit the same row while disconnected, then merge. Write an `onConflict` handler resolving last-write-wins from an `updatedAt` column, and a `filter` that skips a local-only table. *Success:* both replicas converge, and a deliberately conflicting delete is handled without aborting the whole changeset.

## Recap

- `node:sqlite` is **Stability 1.2 — Release candidate**, unflagged since v23.4.0 / v22.13.0, and available only under the `node:` scheme.
- Everything is synchronous. There is no `DatabaseAsync` and no promise API; `sqlite.backup()` is the sole exception.
- `DatabaseSync` is one connection; `prepare()` gives a `StatementSync` with `run`, `get`, `all`, and `iterate`. Use `iterate()` for large result sets and close statements you no longer need.
- Bind every value. Named (`$`, `:`, `@`, or bare) or anonymous (`?`, `?NNN`) — never string concatenation. The tag store's `${}` binds; `exec()` with a template literal does not.
- SQLite `INTEGER` is 64-bit and JavaScript `number` is not. Enable `readBigInts` for any column that can grow past 2^53, or take an `ERR_OUT_OF_RANGE` in production.
- Transactions are plain SQL through `exec()`. Use `BEGIN IMMEDIATE` for writes, savepoints for nesting, and `database.isTransaction` before rolling back.
- `function()`, `aggregate()`, `createSession()`/`applyChangeset()`, `backup()`, `serialize()`/`deserialize()`, `loadExtension()`, and `setAuthorizer()` cover the extension surface, each with a re-entrancy or security rule attached.
- Set `journal_mode = WAL`, `synchronous = NORMAL`, and a non-zero `timeout` on every connection, and treat long queries as an event-loop problem to be moved to a worker.

## Where to go next

- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) — where long-running queries belong.
- [Chapter 31 — The Permission Model](../part4-system/31-permission-model.md) — and why it does not fence in SQLite.
- [Chapter 45 — The Built-in Test Runner](../part7-diagnostics/45-test-runner.md) — `':memory:'` databases as test fixtures.
- [Chapter 48 — Diagnostics Channel and Trace Events](../part7-diagnostics/48-diagnostics-channel-tracing.md) — subscribing to `'sqlite.db.query'`.
- [Chapter 55 — Single Executable Applications and the Virtual File System](55-single-executable.md) — shipping a SQLite-backed CLI as one binary.
- Official documentation: <https://nodejs.org/docs/latest/api/sqlite.html>
