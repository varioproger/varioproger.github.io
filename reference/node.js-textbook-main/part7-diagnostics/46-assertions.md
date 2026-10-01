---
chapter: 46
part: "Part VII — Testing, Debugging, Diagnostics"
title: "Assertions"
level: intermediate
reading_time: "40 min"
prerequisites: [14, 45]
source_docs:
  - "doc/api/assert.md"
  - "doc/api/deprecations.md"
  - "doc/api/test.md"
source_url: "https://nodejs.org/docs/latest/api/assert.html"
node_baseline: "27.0.0-pre"
---

# Chapter 46 — Assertions

**What you will learn**

- The difference between legacy and strict assertion mode, and why `node:assert/strict` is the only sane default.
- Every assertion method that matters, what it actually compares, and when to reach for it.
- Exactly what `deepStrictEqual` inspects — prototypes, symbols, `NaN`, `±0`, boxed primitives, `Map`/`Set`, typed arrays, `WeakMap`, circular references — because this is where quiet test bugs live.
- `partialDeepStrictEqual`, and why it is the right tool for asserting on API responses.
- How to validate thrown errors with `throws`/`rejects`, the three forms of the `error` argument, and the object-literal trap that makes an assertion pass without checking anything useful.
- How to read an `AssertionError` and its diff, and how to control diff verbosity with `assert.Assert`.
- Why `node:assert` is not an input-validation library, and what to use instead.

**Why this matters**

An assertion is a claim about your program that the runtime is willing to enforce. That makes `node:assert` the smallest and most important piece of testing infrastructure in Node: every test framework, including `node:test`, is ultimately a scheduler wrapped around assertions. If your assertions are imprecise, your tests are decoration.

Imprecision here is unusually easy. `assert.deepEqual({ id: 1 }, { id: '1' })` passes. `assert.throws(fn, { message: 'nope' })` where `fn` throws a `TypeError` with a different message can be made to pass by accident. A test that asserts nothing looks identical, in CI output, to a test that asserts everything. This chapter is about knowing precisely what each assertion checks, so that a green suite means something.

## Two modes, one right answer

`node:assert` is **Stable**. It ships in two flavours, and the difference is not cosmetic.

```mjs
// Legacy mode
import assert from 'node:assert';

// Strict mode — use this
import assert from 'node:assert/strict';
import { strict as assert } from 'node:assert';
```

```cjs
const assert = require('node:assert');            // legacy
const assert = require('node:assert/strict');     // strict
const assert = require('node:assert').strict;     // strict
```

In strict mode, the four coercive methods behave like their strict counterparts:

| Legacy method | Comparison in legacy mode | Behaviour in strict mode |
|---|---|---|
| `assert.equal` | `==` (with `NaN` treated as equal to `NaN`) | Alias of `assert.strictEqual` |
| `assert.notEqual` | `!=` | Alias of `assert.notStrictEqual` |
| `assert.deepEqual` | Deep, with `==` on leaves | Alias of `assert.deepStrictEqual` |
| `assert.notDeepEqual` | Deep, with `==` on leaves | Alias of `assert.notDeepStrictEqual` |

In legacy mode those four carry **[Legacy]** status (Stability 3) with the docs' own recommendation to use the strict versions instead. Strict mode also renders a coloured diff for object mismatches; legacy mode prints the two objects, often truncated, which is far harder to read.

The failure mode legacy mode enables is not theoretical. From the docs:

```mjs
import assert from 'node:assert';

assert.deepEqual('+00000000', false);   // passes — no AssertionError
assert.deepEqual(/a/gi, new Date());    // passes — no AssertionError
```

Both of those are `==` coercion doing exactly what `==` does. Import `node:assert/strict` in every file and the whole category disappears. If you want the diff colours suppressed — in a CI log, say — set `NO_COLOR` or `NODE_DISABLE_COLORS`.

### The `message` parameter

Most assertions take an optional trailing `message`, and since **v26.0.0** it has three forms:

| Form | Behaviour |
|---|---|
| `string` | Used as-is. Extra trailing arguments are `printf`-style substitutions, as in `util.format()` |
| `Error` | That error is thrown instead of an `AssertionError` |
| `Function` | `(actual, expected) => string`, called **only on failure**. A non-string return is ignored and the default message is used |

```mjs
import assert from 'node:assert/strict';

const apples = 1;
const oranges = 2;

assert.strictEqual(apples, oranges, 'apples %s !== oranges %s', apples, oranges);
// AssertionError: apples 1 !== oranges 2

assert.strictEqual(apples, oranges, (actual, expected) =>
  `inventory drift: counted ${actual}, expected ${expected}`);

assert.strictEqual(apples, oranges, new RangeError('inventory drift'));
// RangeError: inventory drift  — not an AssertionError
```

The `printf` and function forms exist for performance: neither the formatting nor the function body runs unless the assertion actually fails. Passing extra arguments alongside an `Error` or a function is rejected with `ERR_AMBIGUOUS_ARGUMENT`; passing a first argument that is none of the three types throws `ERR_INVALID_ARG_TYPE`.

Note the asymmetry: `throws()`, `rejects()`, `doesNotThrow()`, and `doesNotReject()` document `message` as `{string}` only. The `printf`/function/Error forms are for the comparison assertions.

## The catalogue

| Method | Checks |
|---|---|
| `ok(value[, message])` | `value` is truthy. `assert(value)` is an alias |
| `equal` / `notEqual` | `==` / `!=` in legacy mode; strict aliases in strict mode |
| `strictEqual` / `notStrictEqual` | `Object.is()` / its negation |
| `deepEqual` / `notDeepEqual` | Deep structural, coercive leaves (legacy mode) |
| `deepStrictEqual` / `notDeepStrictEqual` | Deep structural, `Object.is()` leaves, prototypes compared |
| `partialDeepStrictEqual` | Deep structural, but only properties present on `expected` |
| `match(string, regexp)` / `doesNotMatch` | `regexp.test(string)`; throws if `string` is not a string |
| `throws(fn[, error][, message])` | `fn` throws, optionally matching `error` |
| `rejects(asyncFn[, error][, message])` | Returns a promise; the awaited value rejects |
| `doesNotThrow` / `doesNotReject` | The inverse. Rarely worth using — see below |
| `ifError(value)` | `value` is `undefined` or `null` |
| `fail([message])` | Always throws. Default message `'Failed'` |

### Truthiness and identity

`assert.ok(value)` is `assert.equal(!!value, true)`. Its most useful property is the message it generates in a file: it prints the source expression that evaluated falsy.

```mjs
import assert from 'node:assert/strict';

assert.ok(typeof 123 === 'string');
// AssertionError: The expression evaluated to a falsy value:
//
//   assert.ok(typeof 123 === 'string')

assert.ok();
// AssertionError: No value argument passed to `assert.ok()`
```

That source-echo does not happen in the REPL, where you get the older `false == true` message instead — a common source of "why does it look different here?" confusion.

`strictEqual` and `notStrictEqual` use `Object.is()`, not `===`. That is a deliberate and important difference in exactly two places:

```mjs
assert.strictEqual(NaN, NaN);  // OK — Object.is(NaN, NaN) is true
assert.strictEqual(0, -0);     // AssertionError — Object.is(0, -0) is false
```

If you genuinely want `===` semantics for zeros, compare something else — say `assert.ok(Object.is(x, 0) || Object.is(x, -0))`, or normalise with `x + 0`.

Use `strictEqual` for primitives and for reference identity. Reach for `deepStrictEqual` the moment either side is an object, because `strictEqual` on two structurally identical objects always fails.

## Deep equality, precisely

This is the section to read twice. Most silently-wrong tests are wrong here.

`deepStrictEqual` recursively compares the **enumerable own properties** of both values, by these rules:

| Aspect | `deepEqual` (legacy) | `deepStrictEqual` | `partialDeepStrictEqual` |
|---|---|---|---|
| Leaf primitives | `==`, but `NaN` equals `NaN` | `Object.is()` | `Object.is()` |
| `[[Prototype]]` | Not compared | Compared with `===` | Not compared |
| Type tag (`Object.prototype.toString`) | Must match | Must match | Must match |
| Object constructors | Compared when available | Compared when available | — |
| Enumerable own symbol properties | Not compared | Compared | Compared |
| Non-enumerable properties | Ignored | Ignored | Ignored |
| `Error` `name`, `message`, `cause`, `errors` | Always compared | Always compared | Always compared |
| `RegExp` `source`, `flags`, `lastIndex` | Always compared | Always compared | Always compared |
| Boxed primitives | Compared as objects **and** unwrapped | Same | Same |
| Property order | Irrelevant | Irrelevant | Irrelevant |
| `Map` keys / `Set` items | Unordered | Unordered | Unordered, subset allowed |
| `WeakMap`, `WeakSet`, `Promise` | Reference identity only | Reference identity only | Reference identity only |
| Extra properties on `actual` | Fail | Fail | **Allowed** |
| Sparse array holes | Compared | Compared | Ignored |

Take the consequences one at a time.

**Prototypes.** `deepStrictEqual` compares `[[Prototype]]` with `===`; `deepEqual` does not. This is why two classes with identical fields are not deep-strict-equal, and why an object literal is never equal to a class instance:

```mjs
import assert from 'node:assert/strict';

class Point { constructor(x, y) { this.x = x; this.y = y; } }

assert.deepStrictEqual(new Point(1, 2), { x: 1, y: 2 });
// AssertionError — different prototypes

assert.deepStrictEqual({ ...new Point(1, 2) }, { x: 1, y: 2 });
// OK — spreading produces a plain object
```

This bites constantly when a database driver returns row objects with a custom prototype, or when you compare a `Buffer` to a `Uint8Array`. The `null`-prototype case is the same trap in reverse: `Object.create(null)` with the same keys is not deep-strict-equal to `{}`.

**`NaN` and signed zero.** Leaves go through `Object.is()`, so `NaN` equals `NaN` and `0` does not equal `-0`. That second one produces some of the most baffling failures in numeric code — a rounding routine that returns `-0` for a value that "should" be `0` fails a test that looks obviously correct.

```mjs
assert.deepStrictEqual({ delta: NaN }, { delta: NaN });  // OK
assert.deepStrictEqual({ delta: 0 }, { delta: -0 });     // AssertionError
```

**Boxed primitives.** Object wrappers are compared both as objects and unwrapped, so the wrapper type must match *and* the primitive inside must match:

```mjs
assert.deepStrictEqual(new String('foo'), Object('foo'));  // OK
assert.deepStrictEqual(new Number(1), new Number(2));      // AssertionError
assert.deepStrictEqual(new Number(1), 1);                  // AssertionError — type tags differ
```

**Symbols.** `deepStrictEqual` compares enumerable own symbol properties; `deepEqual` ignores them entirely. And because symbols are unique, two structurally identical objects keyed by *different* symbols are not equal, which produces the runner's distinctive "Inputs identical but not reference equal" message:

```mjs
const a = Symbol('id');
const b = Symbol('id');

assert.deepStrictEqual({ [a]: 1 }, { [a]: 1 });  // OK
assert.deepStrictEqual({ [a]: 1 }, { [b]: 1 });  // AssertionError
```

**`Map` and `Set`.** Contents are compared, unordered. Insertion order is irrelevant; membership and value equality are what matter.

```mjs
assert.deepStrictEqual(new Set([1, 2]), new Set([2, 1]));  // OK
assert.deepStrictEqual(
  new Map([['a', 1], ['b', 2]]),
  new Map([['b', 2], ['a', 1]]),
);  // OK
```

**Typed arrays and `Buffer`.** Typed arrays compare by type tag and contents, and slices are handled correctly — a `Uint8Array` view over part of an `ArrayBuffer` compares against its logical contents, not the whole backing buffer. But the type tag rule means a `Buffer` and a `Uint8Array` with the same bytes are **not** deep-strict-equal, because their prototypes differ. Compare `Buffer` to `Buffer`, or normalise with `Buffer.from(view)` or `Uint8Array.prototype.slice.call(...)` first.

**`WeakMap`, `WeakSet`, `Promise`.** These are never compared structurally — their contents are not enumerable, and since **v25.0.0** promises are explicitly unequal unless they are the same instance. Two `WeakMap`s holding the same key and value are unequal. The only passing comparison is a value against itself. If you find yourself asserting on a `WeakMap`, assert on the observable behaviour that consults it instead.

**Circular references.** Circular structures are supported. Since **v24.0.0**, recursion stops as soon as *either* side hits a cycle — so a comparison never hangs, but a difference buried past the cycle may not be reported.

**Errors.** `name`, `message`, `cause`, and `errors` are always compared, even though `message` is non-enumerable. `cause` comparison arrived in **v22.2.0**, and it is a real gotcha when you wrap errors: two errors with identical messages but different `cause` chains are not deep-strict-equal.

**Dates.** Since **v25.0.0**, two invalid dates are considered equal — `new Date(NaN)` matches `new Date(NaN)`. Before that they were not.

### `partialDeepStrictEqual`

Added in v23.4.0 and **Stable** since v24.0.0, this is a strict superset of `deepStrictEqual`: anything that passes `deepStrictEqual` also passes here. The difference is that only properties present on `expected` are examined, and prototypes are not compared.

```mjs
import assert from 'node:assert/strict';

const response = {
  id: 'ord_9f2', status: 'paid', total: 4200,
  createdAt: '2026-08-19T10:00:00Z',
  customer: { id: 'cus_1', email: 'a@example.com', createdAt: '2026-01-02T00:00:00Z' },
};

assert.partialDeepStrictEqual(response, {
  status: 'paid',
  total: 4200,
  customer: { email: 'a@example.com' },
});
// OK — timestamps and ids ignored
```

This is exactly the assertion you want for HTTP responses and database rows, where half the payload is generated values you do not want to pin. Arrays are matched as subsequences of members rather than by index, and holes in sparse arrays are ignored:

```mjs
assert.partialDeepStrictEqual([1, 2, 3, 4, 5], [4, 5, 8]); // AssertionError — 8 is absent
assert.partialDeepStrictEqual([1, 2, 3, 4, 5], [2, 4]);    // OK
assert.partialDeepStrictEqual(new Set([{ a: 1 }, { b: 1 }]), new Set([{ a: 1 }])); // OK
```

The cost is that it cannot detect *extra* fields. If your test needs to catch an accidentally leaked `passwordHash` in a response body, `partialDeepStrictEqual` will not see it — use `deepStrictEqual` on an explicitly picked subset instead.

### Pattern matching

```mjs
assert.match('user_84f2', /^user_[a-f0-9]{4}$/);
assert.doesNotMatch(logLine, /password=/);
```

Both throw if the first argument is not a string — including for `null` and `undefined`, which is usually the failure you wanted anyway. Prefer `match` over `assert.ok(re.test(s))`: the failure message names both the input and the pattern, whereas `ok` can only tell you that something was falsy.

## Validating thrown errors

`assert.throws(fn[, error][, message])` calls `fn` and requires it to throw. `assert.rejects(asyncFn[, error][, message])` is the asynchronous twin: it awaits `asyncFn` (or the promise you hand it) and requires rejection. Everything below applies to both.

**`rejects()` returns a promise. If you do not `await` it, the assertion is unobserved and the test passes regardless.** That is the single most common assertion bug in async test suites.

```mjs
// ❌ always "passes"
assert.rejects(loadConfig('/nope'));

// ✅
await assert.rejects(loadConfig('/nope'), { code: 'ENOENT' });
```

If `asyncFn` throws synchronously, `rejects()` returns a promise rejected with that error and skips the error handler entirely. If it returns something that is not a promise, you get `ERR_INVALID_RETURN_VALUE`.

### The three forms of `error`

**1. A constructor (class).** Checks `instanceof`. The loosest useful form.

```mjs
assert.throws(() => JSON.parse('{'), SyntaxError);
```

**2. A regular expression.** Tested against the stringified error, so it matches `'TypeError: Wrong value'`, not just the message.

```mjs
assert.throws(() => parsePort('abc'), /must be an integer/);
await assert.rejects(fetchUser(-1), /^Error: invalid id$/);
```

**3. A validation object, an `Error` instance, or a function.**

A validation object tests each of its own properties for **strict deep equality** against the thrown error. Only listed properties are checked. String-valued properties may be given as regular expressions, which are then matched against the string — but **not** for nested properties, where a regular expression is compared as a regular expression.

```mjs
import assert from 'node:assert/strict';

assert.throws(
  () => { throw Object.assign(new TypeError('Wrong value'), { code: 'ERR_BAD', info: { nested: true } }); },
  {
    name: /^TypeError$/,     // regex matched against the string
    message: 'Wrong value',
    code: 'ERR_BAD',
    info: { nested: true },  // nested objects must match completely
  },
);
```

Passing an actual `Error` **instance** as `error` is stricter still: every property is compared, *including* the non-enumerable `name` and `message`.

A validation function must return `true`. Anything else — including a truthy non-`true` value — fails.

```mjs
await assert.rejects(
  writeReport('/read-only/out.json'),
  (err) => {
    assert.strictEqual(err.code, 'EACCES');
    assert.match(err.path, /out\.json$/);
    return true;   // required
  },
);
```

The docs' guidance is worth repeating: do not return anything but `true` from a validation function. Throw a descriptive error for the specific check that failed instead, so the failure output tells you *which* condition broke rather than "validation returned false".

### The object-literal trap

This is the mistake the brief asks about, and it is worth being blunt.

```mjs
// ❌ Checks nothing about the error at all.
assert.throws(() => save(record), { message: 'validation failed' });
```

That call is fine *if* `save` throws with exactly that message. The trap is the degenerate case:

```mjs
// ❌ An empty validation object lists no properties, so nothing is tested.
//    This asserts only "something was thrown".
assert.throws(() => save(record), {});

// ❌ Only checks `name`. A ValidationError with the wrong code, the wrong
//    field list, and a message about the wrong record all pass.
assert.throws(() => save(record), { name: 'ValidationError' });
```

An empty or nearly-empty validation object is the dangerous one: it looks like a precise assertion in code review and enforces almost nothing. Note also that the object form is *only* forgiving about properties it omits — a misspelled key such as `{ messsage: 'validation failed' }` is checked, finds `undefined` on the thrown error, and fails with a confusing diff rather than passing. Both directions cost you time.

The fix is to assert on the stable machine-readable contract:

```mjs
// ✅
assert.throws(() => save(record), {
  name: 'ValidationError',
  code: 'ERR_VALIDATION',
  fields: ['email'],
});
```

When you want several independent checks with individually readable failures, catch the error yourself:

```mjs
async function capture(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  assert.fail('expected the function to throw');
}

const err = await capture(() => save({}));
assert.strictEqual(err.code, 'ERR_VALIDATION');
assert.deepStrictEqual(err.fields, ['email']);
assert.match(err.message, /email/);
```

Assert on `error.code`, not `error.message`. Codes are a stable contract across Node versions; messages are not. (See [Chapter 14 — Errors](../part2-async/14-errors.md).)

### Never pass a bare string as the second argument

`error` cannot be a string. If you pass one, it is silently treated as `message`:

```mjs
function throwingFirst() { throw new Error('First'); }
function throwingSecond() { throw new Error('Second'); }
function notThrowing() {}

assert.throws(throwingFirst, 'Second');
// Passes! The string was used as the failure message, not as a matcher.

assert.throws(throwingSecond, 'Second');
// TypeError [ERR_AMBIGUOUS_ARGUMENT] — Node refuses this specific confusion

assert.throws(notThrowing, 'Second');
// AssertionError: Missing expected exception: Second
```

Node added `ERR_AMBIGUOUS_ARGUMENT` for the case where the string happens to equal the thrown message, because that is the one situation where the mistake is unambiguous. The other cases pass silently. Use a regular expression: `assert.throws(throwingSecond, /Second$/)`.

### `doesNotThrow` and `doesNotReject`

Both exist; both are, in the docs' own words, "actually not useful". There is no benefit in catching an error and rethrowing it — if `fn` throws inside a test, the test fails anyway, with a better stack trace than `doesNotThrow` produces. Their one behaviour worth knowing: if the thrown error does *not* match the `error` argument, it is propagated to the caller unchanged; if it *does* match, you get an `AssertionError` with "Got unwanted exception". Just call the function.

## `ifError` and `fail`

`assert.ifError(value)` throws unless `value` is `undefined` or `null`. It exists for the error-first callback convention, and since v10 it wraps the original error in an `AssertionError` whose stack contains frames from **both** the original error and the `ifError()` call site — which is exactly what you want when a callback error originated deep in a library.

```mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs';

readFile('config.json', 'utf8', (err, data) => {
  assert.ifError(err);   // throws unless err is null/undefined
  assert.ok(JSON.parse(data));
});
```

Note that it is stricter than truthiness: `assert.ifError(0)` and `assert.ifError('')` both throw. That is intentional — a callback should pass `null`, not a falsy sentinel.

`assert.fail([message])` throws unconditionally. Its honest use is marking unreachable code:

```mjs
switch (event.type) {
  case 'created': return onCreated(event);
  case 'deleted': return onDeleted(event);
  default: assert.fail(`unhandled event type: ${event.type}`);
}
```

and closing the "it should have thrown" hole in a manual try/catch, as in the `capture()` helper above.

## Reading an AssertionError

Every failure from `node:assert` is an `AssertionError`, and it carries structured data you can inspect:

| Property | Meaning |
|---|---|
| `name` | Always `'AssertionError'` |
| `code` | Always `'ERR_ASSERTION'` |
| `actual` | The value you produced |
| `expected` | The value you claimed |
| `operator` | The comparison performed, e.g. `'strictEqual'`, `'deepStrictEqual'` |
| `generatedMessage` | `true` if Node wrote the message, `false` if you supplied one |
| `message` | The rendered message, including the diff in strict mode |

```mjs
import assert from 'node:assert/strict';

try {
  assert.strictEqual(1, 2);
} catch (err) {
  assert.ok(err instanceof assert.AssertionError);
  assert.strictEqual(err.code, 'ERR_ASSERTION');
  assert.strictEqual(err.actual, 1);
  assert.strictEqual(err.expected, 2);
  assert.strictEqual(err.operator, 'strictEqual');
  assert.strictEqual(err.generatedMessage, true);
}
```

`generatedMessage` is the property that makes custom reporters useful: it tells you whether the message is machine-written (and therefore safe to replace with your own rendering) or something a human wrote deliberately.

The diff itself follows a fixed convention: `+ actual`, `- expected`, unchanged lines with a leading space, and `...` where identical runs are elided.

```
AssertionError: Expected inputs to be strictly deep-equal:
+ actual - expected

  {
    id: 'ord_9f2',
+   status: 'pending'
-   status: 'paid'
  }
```

Read it as "the plus line is what your code produced; the minus line is what you asked for." For string comparisons, strict mode also prints a caret under the first differing character — invaluable for trailing-whitespace and homoglyph bugs.

### Controlling the diff: `assert.Assert`

Added in **v24.6.0**, `assert.Assert` lets you create an assertion instance with its own options:

| Option | Default | Effect |
|---|---|---|
| `strict` | `true` | Non-strict methods behave strictly |
| `diff` | `'simple'` | `'full'` prints the entire diff rather than eliding identical runs |
| `skipPrototype` (v24.9.0) | `false` | Skip prototype and constructor comparison in all deep-equality methods |

```mjs
import { Assert } from 'node:assert';

const assert = new Assert({ diff: 'full' });
assert.deepStrictEqual(bigActual, bigExpected);   // full diff, nothing elided

class Foo { constructor(a) { this.a = a; } }
class Bar { constructor(a) { this.a = a; } }

const loose = new Assert({ skipPrototype: true });
loose.deepStrictEqual(new Foo(1), new Bar(1));    // OK
```

`skipPrototype: true` is the sanctioned escape hatch for the class-versus-plain-object problem, and it is much better than sprinkling spread operators through your tests.

One sharp edge, documented explicitly: **destructuring loses the configuration.** The options live on the instance, so a destructured method falls back to the defaults.

```mjs
const myAssert = new Assert({ diff: 'full' });

myAssert.deepStrictEqual(a, b);          // full diff
const { deepStrictEqual } = myAssert;
deepStrictEqual(a, b);                   // simple diff — configuration lost
```

## `assert.CallTracker` is gone

If you find `assert.CallTracker` in an old tutorial or an old test file, stop. It was runtime-deprecated in v20.1.0 as **DEP0173** and is now **End-of-Life**: the API has been **removed**, as of v25.0.0. Code that calls it throws.

Its replacement is the test runner's mocking API, which does the same job better:

```mjs
import test from 'node:test';

test('the callback runs exactly twice', (t) => {
  const onChunk = t.mock.fn();

  process(['a', 'b'], onChunk);

  t.assert.strictEqual(onChunk.mock.callCount(), 2);
  t.assert.deepStrictEqual(onChunk.mock.calls[0].arguments, ['a']);
});
```

See [Chapter 45 — The Built-in Test Runner](45-test-runner.md) for the full `MockTracker` API.

## Writing good assertion messages

A good failure message answers "what was being checked, and with what inputs?" without making the reader open the file. Three rules:

1. **Do not restate the operator.** `'expected a to equal b'` adds nothing — the generated message already says that, and it prints both values. Add the *context* the assertion cannot know.

   ```mjs
   // ❌ assert.strictEqual(res.status, 200, 'status should be 200');
   // ✅
   assert.strictEqual(res.status, 200, `GET ${url} for tenant ${tenantId}`);
   ```

2. **Use the lazy forms for anything expensive.** The `printf` and function forms are not evaluated on success, so you can afford to serialise a whole object.

   ```mjs
   assert.deepStrictEqual(parsed, expected,
     (actual) => `parse failed for fixture ${name}: ${JSON.stringify(actual)}`);
   ```

3. **Do not supply a message at all when the generated one is better.** A custom message *replaces* the default, and the default for `deepStrictEqual` includes the diff. If your message is worse than the diff, you have made the failure harder to debug. Prefer letting the diff speak and adding context only where it identifies *which* case failed — the loop iteration, the fixture name, the tenant.

## `node:assert` is not an input-validation library

The module's own summary is that it verifies **invariants** — facts that must hold if your program is correct. Untrusted input is not an invariant. There are three concrete reasons not to validate input with `assert`:

1. **Wrong error type.** A failed assertion produces `AssertionError` with `code: 'ERR_ASSERTION'`. Your HTTP layer cannot map that to a 400 any more meaningfully than it maps a genuine bug, so a malformed request and a broken invariant become indistinguishable.
2. **Information disclosure.** `AssertionError` messages embed `actual` and `expected` values and, in strict mode, a diff of them. Wire that to a client and you have leaked internal state.
3. **It is not a security boundary.** Assertions describe your assumptions; a validator describes your contract with the outside world. Conflating them means a change to an assumption silently changes what input you accept.

```mjs
// ❌ In a request handler
assert.strictEqual(typeof body.email, 'string');

// ✅
if (typeof body.email !== 'string') {
  const err = new Error('email must be a string');
  err.code = 'ERR_VALIDATION';
  err.status = 400;
  throw err;
}
```

Where `assert` *is* appropriate in production code: guarding internal invariants at module boundaries you control, where a violation genuinely means a bug and crashing is the correct response. Keep those rare, keep them cheap, and never let one carry user data in its message.

## How `assert` relates to the test runner's `t.assert`

`node:test` exposes the top-level `node:assert` functions on the `TestContext` as `t.assert.*`, bound to the context. Behaviourally the comparisons are identical — `t.assert.deepStrictEqual` is `assert.deepStrictEqual`. The difference is bookkeeping:

| | `import assert from 'node:assert/strict'` | `t.assert.*` |
|---|---|---|
| Counted by `t.plan()` | No | **Yes** |
| Snapshot methods available | No | `t.assert.snapshot`, `t.assert.fileSnapshot` |
| Custom assertions via `test.assert.register()` | No | **Yes** |
| Usable outside a test | Yes | No |

The practical rule: **inside a test, use `t.assert`; in helper modules and production code, import `node:assert/strict`.** If you use `t.plan()`, `t.assert` is mandatory — assertions made through a plain import are invisible to the plan and the test fails with a count mismatch.

```mjs
import test from 'node:test';

test('plan and t.assert go together', (t) => {
  t.plan(2);
  t.assert.strictEqual(add(2, 2), 4);
  t.assert.deepStrictEqual(split('a,b'), ['a', 'b']);
});
```

## Common mistakes

### ❌ Importing `node:assert` instead of `node:assert/strict`

```mjs
import assert from 'node:assert';
assert.deepEqual({ id: 1 }, { id: '1' });   // passes
```

Legacy mode compares leaves with `==`, so a number and its string form are equal, `'+00000000'` equals `false`, and a regular expression can equal a `Date`. Tests written this way pass while the code is broken.

```mjs
// ✅
import assert from 'node:assert/strict';
assert.deepEqual({ id: 1 }, { id: '1' });   // AssertionError, as it should be
```

### ❌ Forgetting to `await assert.rejects()`

```mjs
test('rejects a bad path', async () => {
  assert.rejects(readConfig('/nope'), { code: 'ENOENT' });   // unobserved
});
```

`rejects()` returns a promise. Unawaited, the test finishes before the assertion resolves and passes no matter what the function does — and you may additionally get an unhandled-rejection warning attributed to nothing in particular.

```mjs
// ✅
test('rejects a bad path', async () => {
  await assert.rejects(readConfig('/nope'), { code: 'ENOENT' });
});
```

Combining this with `t.plan(1)` catches the whole class automatically.

### ❌ Comparing a class instance to an object literal

```mjs
assert.deepStrictEqual(await repo.findById(1), { id: 1, name: 'Ada' });
// AssertionError — the row has a driver-specific prototype
```

The values look identical in the diff, which makes this maddening to debug: the diff shows two structurally equal objects and no explanation.

```mjs
// ✅ normalise, or relax the prototype check deliberately
assert.deepStrictEqual({ ...await repo.findById(1) }, { id: 1, name: 'Ada' });

// ✅ or
const assert = new Assert({ skipPrototype: true });
```

### ❌ Passing a string as the `error` argument to `throws`

```mjs
assert.throws(() => parse('{'), 'Unexpected end of JSON input');
```

`error` cannot be a string; the string becomes the failure `message`. The assertion now only checks that *something* was thrown. Node throws `ERR_AMBIGUOUS_ARGUMENT` in the one case where the string equals the thrown message, but every other case passes silently.

```mjs
// ✅
assert.throws(() => parse('{'), SyntaxError);
assert.throws(() => parse('{'), /Unexpected end of JSON/);
```

### ❌ Asserting on `error.message`

```mjs
await assert.rejects(readFile('/nope'), /no such file or directory/);
```

Error message text is not a stable interface; it changes between Node versions and differs across platforms. This assertion is a time bomb pointed at your next upgrade.

```mjs
// ✅ codes are the contract
await assert.rejects(readFile('/nope'), { code: 'ENOENT' });
```

## Production notes

- **Use `partialDeepStrictEqual` for API contracts, `deepStrictEqual` for security-relevant shapes.** Partial matching is resilient to added fields, which is what you want for forward compatibility — and exactly what you do *not* want when the test's job is to prove a response contains no secrets.
- **Deep equality is O(n) in the size of both structures, and it copies.** Asserting on a 50 MB parsed JSON document in a hot test loop is measurably slow and can dominate suite runtime. Assert on a projection instead: pick the three fields that matter.
- **`assert` in production code has a runtime cost that never goes away.** Node has no `NDEBUG`-style compile-out. Every assertion in a hot path is a real branch, and any assertion whose *arguments* are expensive to compute pays that cost on every call, not just on failure. Use the lazy `message` forms, and keep production assertions to genuine invariants at module boundaries.
- **Diff colour is environment-dependent.** Strict-mode diffs are coloured when the stream supports it. In CI logs the escape codes become noise; set `NO_COLOR=1` or `NODE_DISABLE_COLORS=1` in the CI environment so failures are readable in the archived log.
- **Never assert on message strings from dependencies.** This includes Node core. `error.code`, `error.errno`, `error.syscall`, and your own explicitly-set properties are the stable surface. A suite that greps messages will break on a patch release, and it will break in CI on a machine you cannot reproduce locally.
- **`AssertionError.actual` and `.expected` are structured data.** A custom reporter can serialise them into a machine-readable failure record — far better for flaky-test dashboards than scraping formatted output. Combine with `generatedMessage` to decide whether to render your own message or respect the author's.
- **Prefer one assertion per fact.** A single `deepStrictEqual` on a large object tells you everything changed at once; three targeted assertions tell you which invariant broke. The exception is snapshot-style comparison, where the whole structure genuinely is the contract.

## Exercises

1. **Prove the legacy trap.** Write a file that imports `node:assert` (legacy) and demonstrates three comparisons that pass but should not — one with `equal`, one with `deepEqual` on coerced leaves, and one with `deepEqual` on symbol-keyed properties. Then switch to `node:assert/strict` and confirm all three now fail. *Success:* the same source, with only the import changed, goes from silent to loud.

2. **Map the deep-equality rules.** For each of `NaN`, `-0`, `new Number(1)`, `Object.create(null)`, `new Set([1,2])` vs `new Set([2,1])`, `Buffer.from([1])` vs `Uint8Array.of(1)`, and two distinct `WeakMap`s with identical contents, predict whether `deepStrictEqual` passes, then verify. *Success:* your prediction is right in all seven cases and you can explain each in one sentence.

3. **A safe error-assertion helper.** Write `async function capture(fn)` that returns the thrown or rejected error and calls `assert.fail` if nothing was thrown. Use it to assert three independent properties of one error. *Success:* the helper works for both sync and async functions, and each property failure produces a message naming that property.

4. **Partial versus full.** Given a JSON API response with generated `id` and `createdAt` fields plus an accidental `passwordHash`, write one `partialDeepStrictEqual` assertion that passes and one `deepStrictEqual` assertion that catches the leak. *Success:* you can articulate why only the second is a useful security test.

5. **Custom diff configuration.** Build an `assert.Assert` instance with `diff: 'full'` and `skipPrototype: true`, and use it to compare two large structurally-identical objects of different classes. Then destructure one method off the instance and show that the configuration is lost. *Success:* you produce three outputs — full diff, passing prototype-skipped comparison, and a simple diff after destructuring — and explain the last one.

## Recap

- Always `import assert from 'node:assert/strict'`. Legacy `equal`/`deepEqual` are **[Legacy]** (Stability 3) and compare leaves with `==`.
- `strictEqual` uses `Object.is()`, so `NaN` equals `NaN` and `0` does not equal `-0`.
- `deepStrictEqual` compares prototypes, type tags, constructors, enumerable own properties **including symbols**, and error `name`/`message`/`cause`/`errors`; it never compares `WeakMap`, `WeakSet`, or `Promise` contents.
- `partialDeepStrictEqual` ignores prototypes and extra properties — ideal for API responses, useless for proving a payload contains nothing extra.
- `assert.rejects()` returns a promise. Not awaiting it makes the test pass unconditionally.
- The `error` argument to `throws`/`rejects` takes a constructor, a regular expression, or a validation object/`Error`/function. A validation object checks only the properties it lists, so an empty one asserts nothing but "it threw".
- A bare string as the second argument to `throws` is silently treated as the failure message, not a matcher.
- `assert.CallTracker` is **removed** (DEP0173, End-of-Life). Use `t.mock.fn()` from `node:test`.
- `AssertionError` carries `actual`, `expected`, `operator`, `code`, and `generatedMessage` — structured data, not just text.
- Inside a test use `t.assert.*` so `t.plan()` can count; everywhere else import `node:assert/strict`.
- `node:assert` verifies invariants. Validate untrusted input with real validation that produces a client-appropriate error.

## Where to go next

- [Chapter 45 — The Built-in Test Runner](45-test-runner.md) — `t.assert`, `t.plan()`, snapshots, and mocking.
- [Chapter 14 — Errors: Classes, Codes, and Handling Strategies](../part2-async/14-errors.md) — why `error.code` is the contract you should assert on.
- [Chapter 51 — Console, `util.inspect`, and Logging Strategy](51-console-and-logging.md) — the formatting machinery behind assertion diffs.
- [Chapter 63 — Upgrading Node.js: Deprecations and Migration](../part9-production/63-upgrading-node.md) — for the deprecation process that removed `CallTracker`.
- [Appendix D — Deprecation Index](../appendix/d-deprecations.md) — DEP0173 and friends.
- Official documentation: <https://nodejs.org/docs/latest/api/assert.html>
