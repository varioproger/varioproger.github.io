---
chapter: 41
part: "Part VI — Security and Cryptography"
title: "Cryptography Essentials: Hashing, HMAC, Randomness"
level: intermediate
reading_time: "33 min"
prerequisites: [9, 16, 29]
source_docs:
  - "doc/api/crypto.md"
  - "doc/api/errors.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/crypto.html"
node_baseline: "27.0.0-pre"
---

# Chapter 41 — Cryptography Essentials: Hashing, HMAC, Randomness

## What you will learn

- How to hash correctly: `crypto.hash()` versus `createHash()`, algorithm discovery, streaming, `hash.copy()`, digest encodings.
- Why a hash is the wrong tool for passwords, which Node built-in to use instead, and how to choose its cost parameters.
- Why the async KDF forms matter, and how they interact with the libuv threadpool.
- What HMAC buys over a plain hash, and the length-extension attack that motivates it.
- Every safe randomness source Node ships, and why `Math.random()` is never one of them.
- How to compare secrets without leaking them through timing, and how to build a signed, expiring token end to end.

## Why this matters

Cryptography is the one area of programming where completely wrong code looks exactly like completely right code. A password hashed with SHA-256 produces a plausible hex string. A session token from `Math.random()` looks random to you. A signature compared with `===` returns `true` for valid tokens and `false` for invalid ones, and passes every test you write. All three are broken, and you find out when someone dumps your user table or forges an admin token.

`node:crypto` gives you correct primitives for every one of these jobs, and the right choice is usually a one-liner. The hard part is knowing which line. This chapter covers hashing, message authentication, and randomness, plus the two operations people get wrong most often: storing passwords and comparing secrets.

## The rule: implement protocols, do not invent them

Cryptographic primitives are not building blocks you combine by intuition. They are components in schemes that cryptographers designed, analysed, and published. "Hash the message with the key prepended" sounds equivalent to HMAC. It is not; it is broken, for reasons below.

Your job is to pick the right published scheme and implement it faithfully:

- HMAC for authentication, not a hash of key-plus-message.
- A password hashing function for passwords, not a fast digest.
- A constant-time comparison for secrets, not `===`.
- The platform CSPRNG for anything an attacker must not predict.

Every one has a `node:crypto` function. None requires you to be clever.

## Hashing

A cryptographic hash maps arbitrary input to a fixed-size digest. It has three properties that matter: the same input always yields the same digest, you cannot recover the input from the digest, and you cannot find two inputs with the same digest.

### One-shot: `crypto.hash()`

For data already in memory, `crypto.hash(algorithm, data[, options])` is the simplest route. Added in v21.7.0 / v20.12.0, it stopped being experimental in v25.5.0 / v24.13.1.

```mjs
import { hash } from 'node:crypto';

// Returns a hex string by default.
console.log(hash('sha256', 'hello world'));

// Choose the output encoding, or ask for a Buffer.
console.log(hash('sha256', 'hello world', 'base64url'));
const digest = hash('sha256', 'hello world', { outputEncoding: 'buffer' });
```

The `options` argument may be a string (interpreted as `outputEncoding`, default `'hex'`) or an object with `outputEncoding` and `outputLength`. `outputLength` is for extendable-output functions such as `'shake256'`, and as of Node 27 it is **required** for XOF hashes that have no default output length.

The docs are specific: `crypto.hash()` can beat `createHash()` for readily-available data no larger than about 5 MB. For anything bigger or streamed, use `createHash()`.

One trap: when `data` is a string it is encoded as UTF-8 before hashing. If your input is base64 or hex text, decode it into a `Buffer` first, or you hash the *text* rather than the *bytes*.

### Streaming: `crypto.createHash()`

`crypto.createHash(algorithm[, options])` returns a `Hash` object, which is a `stream.Transform`. Feed it with `hash.update(data[, inputEncoding])` as many times as you like, then call `hash.digest([encoding])` once.

```mjs
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export async function fileDigest(path, algorithm = 'sha256') {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}
```

This is the right shape for a 4 GB file: memory stays at one stream buffer regardless of input size. `hash.update()` accepts a string, `Buffer`, `TypedArray`, or `DataView`; strings default to UTF-8, and `inputEncoding` is ignored for binary inputs.

`hash.digest()` finalises the object. **The `Hash` cannot be used again** — a second `digest()` throws. This bites people who cache a reusable "hasher" object.

### Forking state with `hash.copy()`

`hash.copy([options])` (v13.1.0) deep-copies the internal state, letting you digest a prefix without ending the stream — the tool for rolling checksums.

```mjs
import { createHash } from 'node:crypto';

const running = createHash('sha256');
const checkpoints = [];

for (const chunk of ['alpha', 'beta', 'gamma']) {
  running.update(chunk);
  checkpoints.push(running.copy().digest('hex'));  // prefix digest
}

const total = running.digest('hex');               // whole-input digest
```

Copying after `digest()` has been called throws.

### Which algorithms are available

The available set depends on the OpenSSL build underneath, not on Node. Enumerate it at runtime:

```mjs
import { getHashes } from 'node:crypto';

console.log(getHashes().filter((name) => name.startsWith('sha3')));
```

`getHashes()` returns names such as `'sha256'` and `'sha512'`, and — because the list comes from OpenSSL — composite names like `'RSA-SHA256'`. A name present on your Linux CI may be absent from an Alpine or FIPS-restricted build, so treat `getHashes()` as a startup capability check, not a menu to expose to users.

| Algorithm | Digest size | Use it for |
|---|---|---|
| `'sha256'` | 32 bytes | The default: integrity, HMAC, content addressing. |
| `'sha512'` / `'sha384'` | 64 / 48 bytes | Often faster on 64-bit CPUs; common in TLS and JWS. |
| `'sha3-256'`, `'sha3-512'` | 32 / 64 bytes | Different construction; immune to length extension by design. |
| `'shake256'` | variable | XOF — you must supply `outputLength`. |
| `'md5'`, `'sha1'` | 16 / 20 bytes | **Broken for security.** Legacy interop only. |

### What hashes are for, and what they are not for

**Yes:** integrity checking, deduplication, content addressing, ETags, cache keys, and as a building block inside HMAC and signature schemes.

**No:** passwords — not even with a salt. The reason is speed. Everything that makes SHA-256 a good integrity primitive (a few cycles per byte, hardware acceleration, trivially parallel) makes it a catastrophic password primitive: a commodity GPU tries billions of candidates per second. Salting stops precomputed rainbow tables but does nothing about throughput. You need a function that is *deliberately* slow and memory-hungry.

## Password storage, done properly

Node ships three password-based key derivation functions, all deliberately expensive.

| Function | Since | Resists GPU attack via | Parameters |
|---|---|---|---|
| `crypto.argon2()` | v24.7.0 | memory + time + parallelism | `memory`, `passes`, `parallelism`, `tagLength`, `nonce` |
| `crypto.scrypt()` | v10.5.0 | memory + time | `cost`/`N`, `blockSize`/`r`, `parallelization`/`p`, `maxmem` |
| `crypto.pbkdf2()` | v0.5.5 | iteration count only | `iterations`, `keylen`, `digest` |

### scrypt

`crypto.scrypt(password, salt, keylen[, options], callback)` derives `keylen` bytes. The three cost parameters have both descriptive names and the classic single letters, and you may only use one name per parameter:

| Option | Alias | Default | What it does |
|---|---|---|---|
| `cost` | `N` | `16384` | CPU/memory cost. Must be a power of two greater than one. Doubling it doubles both time and memory. |
| `blockSize` | `r` | `8` | Block size. Raises memory per unit of work and improves memory-hardness. |
| `parallelization` | `p` | `1` | Independent chains of work. |
| `maxmem` | — | `32 * 1024 * 1024` | Hard upper bound. It is an error when approximately `128 * N * r > maxmem`. |

That last row catches everybody. An scrypt call needs roughly `128 * N * r` bytes: with the defaults, `128 × 16384 × 8` ≈ **16 MB**, comfortably inside the 32 MB `maxmem`. Raise `N` to `65536` and you need ~67 MB, and the call throws unless you also raise `maxmem`.

```mjs
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// N = 2**16, r = 8, p = 1  ->  128 * 65536 * 8 = 67108864 bytes needed.
const PARAMS = { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFC'), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
```

**Choosing the parameters.** Measure; do not copy a number from a blog post. Pick a latency budget for your slowest production machine — 100 ms is a common target for interactive login — then raise `N` (always a power of two) until one derivation takes that long, keeping `r = 8` and `p = 1`. Set `maxmem` above `128 * N * r`, then check your process can afford that memory *times peak concurrent logins*: ten simultaneous logins at `N = 65536` is 670 MB of transient allocation. That arithmetic, not CPU time, usually caps your parameters.

Store the parameters with the hash — you cannot verify an old hash without knowing what produced it. The salt should be random, at least 16 bytes (the docs cite NIST SP 800-132), and never reused.

The `.normalize('NFC')` call matters: Unicode characters have multiple equivalent representations with different byte sequences, Node does not normalise for you, and a user with an accented password can be locked out from a different OS. Normalise identically at registration and login.

### argon2

Since v24.7.0, `crypto.argon2(algorithm, parameters, callback)` and `crypto.argon2Sync()` are built in — no native module needed for the current best-practice password hash. `algorithm` is `'argon2d'`, `'argon2i'`, or `'argon2id'`; use `'argon2id'`.

Every parameter is required except the last two:

- `message` — the password. `nonce` — the salt, at least 8 bytes (docs recommend random and at least 16).
- `parallelism` — lanes, `1` to `2**24-1`. `passes` — iterations, at least `1`. `tagLength` — output bytes, `4` to `2**32-1`.
- `memory` — memory cost in **1 KiB blocks**, at least `8 * parallelism`, rounded down to a multiple of `4 * parallelism`.
- `secret` (optional) — a "pepper": secret input you deliberately do **not** store next to the hash. Keep it in a KMS so a database dump alone cannot be attacked offline.
- `associatedData` (optional) — extra non-random data mixed into the hash.

```mjs
import { argon2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

const key = await argon2Async('argon2id', {
  message: password.normalize('NFC'),
  nonce: randomBytes(16),
  parallelism: 4,
  memory: 65536,   // 64 MiB, expressed in 1 KiB blocks
  passes: 3,
  tagLength: 32,
});
```

Note the unit on `memory`: **1 KiB blocks**, so `65536` means 64 MiB. Getting that wrong by a factor of 1024 is a silent security downgrade.

### pbkdf2

`crypto.pbkdf2(password, salt, iterations, keylen, digest, callback)` is the oldest and weakest of the three: iteration-hard but not memory-hard, which is exactly what GPUs and ASICs exploit. Use it when a standard requires it — PBKDF2 appears in WPA2, PKCS#5, and much enterprise plumbing — not for convenience. If you must, set `iterations` as high as you can bear (the docs say "as high as possible"), use `'sha512'` as the `digest`, and a random 16-byte salt.

### Where bcrypt sits

bcrypt is not in `node:crypto`. It is a fine password hash — better than PBKDF2, weaker than argon2id on memory-hardness — but it means a third-party native dependency, and most implementations truncate input at 72 bytes, silently weakening long passphrases. Now that Node ships scrypt and argon2, there is no reason to add bcrypt to a new project. Existing bcrypt hashes are fine; rehash to argon2id on next successful login.

### Why the async forms matter

Every KDF has a `*Sync` twin, and the sync twin will hurt you. These functions are *designed* to burn 100 ms of CPU — synchronously on the main thread, that is 100 ms in which your process handles no requests, fires no timers, and accepts no connections.

The async forms hand the work to libuv's threadpool. The docs warn on `pbkdf2()`, `randomBytes()`, and `randomFill()` that this "can have surprising and negative performance implications for some applications": the pool defaults to four threads and is shared with `node:fs`, `node:zlib`, and DNS, so four concurrent derivations starve every file read in the process.

- Never call `scryptSync`, `argon2Sync`, or `pbkdf2Sync` on a request path. Startup-time derivation is fine.
- If login throughput matters, raise `UV_THREADPOOL_SIZE` before the process starts and account for the memory — each concurrent scrypt at `N = 65536` holds ~67 MB.
- For sustained hashing, a dedicated worker pool (Chapter 29) gives isolation and backpressure the shared pool cannot.

## HMAC

A hash tells you data has not changed; it does not tell you *who* produced it, since anyone can compute `sha256(message)`. HMAC adds a secret key, so only a key holder can produce a valid tag.

```mjs
import { createHmac } from 'node:crypto';

const tag = createHmac('sha256', secretKey)
  .update('order:42:refund')
  .digest('base64url');
```

`crypto.createHmac(algorithm, key[, options])` accepts `key` as a string, `ArrayBuffer`, `Buffer`, `TypedArray`, `DataView`, or `KeyObject` of type `secret`. As of Node 27, passing a `CryptoKey` is **no longer supported** — deprecated in v26.0.0, then removed. `Hmac` mirrors `Hash`: `update()` freely, `digest([encoding])` once.

A sizing rule from the docs: if the key comes from a secure source such as `crypto.randomBytes()` or `crypto.generateKey()`, its length should not exceed the algorithm's block size — 512 bits for SHA-256. Longer keys are hashed down first, buying nothing.

### The length-extension attack

Why not just `sha256(secret + message)`? Because SHA-256, SHA-1, and MD5 are Merkle–Damgård constructions, and their digest *is* their internal state. Given `H(secret + message)` and the length of `secret`, an attacker who has never seen the secret can compute a valid `H(secret + message + padding + evil)` — appending data of their choosing and producing a tag that verifies.

Concretely, a URL signed as `?user=alice&role=user&sig=H(secret + "user=alice&role=user")` can be extended to `user=alice&role=user<padding>&role=admin` with a matching signature. Your parser takes the last `role`, and the attacker is an admin. No secret was ever recovered.

HMAC's two-pass construction, `H((key ⊕ opad) ‖ H((key ⊕ ipad) ‖ message))`, defeats this: the outer hash is over a fixed-length input, so there is no state to extend. SHA-3 and BLAKE2 are structurally immune, but HMAC works everywhere and is what protocols specify.

**When to use which:**

| Goal | Use |
|---|---|
| Detect accidental corruption | Plain hash (`crypto.hash`) |
| Detect deliberate tampering by someone without your key | HMAC |
| Prove authorship to someone who does not share your key | Digital signature (Chapter 42) |
| Store a password | argon2 / scrypt |

## Randomness

`Math.random()` is a fast, non-cryptographic PRNG whose state is recoverable from its output. **It is never acceptable for anything an attacker must not guess** — session IDs, reset tokens, CSRF tokens, salts, nonces, API keys, "unguessable" URLs. Use it for retry jitter and nothing else.

Node gives you safe alternatives.

| API | Returns | Async? | Use it for |
|---|---|---|---|
| `crypto.randomBytes(size[, callback])` | `Buffer` | callback optional | Tokens, salts, keys. The workhorse. |
| `crypto.randomInt([min, ]max[, callback])` | integer in `[min, max)` | callback optional | Numeric codes, unbiased selection. |
| `crypto.randomUUID([options])` | string | no | RFC 4122 v4 UUID. |
| `crypto.randomUUIDv7([options])` | string | no | RFC 9562 v7 UUID — time-sortable. |
| `crypto.randomFillSync(buffer[, offset][, size])` | the same buffer | no | Filling a pre-allocated buffer in place. |
| `crypto.getRandomValues(typedArray)` | the same array | no | Web-compatible-ish alias. See caveat below. |

```mjs
import { randomBytes, randomInt, randomUUID, randomUUIDv7 } from 'node:crypto';

const sessionToken = randomBytes(32).toString('base64url');  // 256 bits
const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
const requestId = randomUUID();
const rowKey = randomUUIDv7();  // sorts by creation time
```

Details that matter:

- **`randomInt()` avoids modulo bias.** `randomBytes(1)[0] % 6` is not a fair die — 0–3 come up more often than 4–5. Its range must be under 2⁴⁸ and both bounds safe integers.
- **`randomUUIDv7()`** (v26.1.0 / v24.16.0) puts a millisecond Unix timestamp in the top 48 bits and CSPRNG bits in the rest, making it a good database key — though the docs warn the clock is non-monotonic, so values are *not* guaranteed strictly increasing. Both UUID functions cache entropy for up to 128 UUIDs; `{ disableEntropyCache: true }` bypasses it.
- **`crypto.getRandomValues()`** aliases the Web Crypto version, and the docs state plainly that it is *not* spec-compliant. For portable code use `crypto.webcrypto.getRandomValues()` (Chapter 43).
- **The async forms use the threadpool**, one request per call; the docs advise partitioning large requests. For the 16–32 byte sizes you actually need, the synchronous form is fine.

**How many bytes?** 16 (128 bits) is the floor; 32 (256 bits) is the comfortable default for session tokens. Encode with `'base64url'` — URL-safe and ~33% more compact than hex.

## Timing attacks and `crypto.timingSafeEqual()`

`===` on strings, and `Buffer.prototype.equals()`, short-circuit at the first differing byte, so comparing an attacker-supplied token against the real one takes measurably longer as more of the prefix matches. Network jitter averages out over enough samples, and an attacker recovers the secret byte by byte.

```mjs
// ❌ Leaks the secret through response time.
if (providedTag === expectedTag) grantAccess();
```

```mjs
// ✅ Constant-time comparison over equal-length buffers.
import { timingSafeEqual } from 'node:crypto';

const a = Buffer.from(providedTag, 'base64url');
const b = Buffer.from(expectedTag, 'base64url');
if (a.length === b.length && timingSafeEqual(a, b)) grantAccess();
```

Three caveats the docs are explicit about:

1. **`timingSafeEqual()` throws on different byte lengths** (`ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`). You must guard the length yourself, and that guard leaks the length. For fixed-size HMAC tags this is harmless — the length is public and constant. For variable-length secrets, hash both sides to a fixed size first:

   ```mjs
   const ok = timingSafeEqual(
     createHmac('sha256', compareKey).update(provided).digest(),
     createHmac('sha256', compareKey).update(expected).digest(),
   );
   ```

2. **Multi-byte `TypedArray`s use platform byte order**, and `Float32Array`/`Float64Array` inputs give surprising results under IEEE 754 — `x === y` does not imply identical bytes. Compare `Buffer`s or `Uint8Array`s.

3. **The surrounding code must also be timing-safe.** A constant-time compare buys nothing if you look the user up first and return early when they do not exist. That early return is itself an oracle.

## FIPS mode

Under FIPS 140 constraints, Node exposes whatever the linked OpenSSL provides. The docs are careful: **Node.js is not itself FIPS validated** — validation belongs to a specific OpenSSL module or provider deployed per its security policy.

With OpenSSL 3 this is the provider model: install the FIPS provider, supply a module configuration file, load the provider into Node's OpenSSL context, and make the default property query include `fips=yes` — from startup via `--enable-fips` or `--force-fips`, or later via `crypto.setFips(true)`. `crypto.getFips()` returns `1` when the query includes `fips=yes`, which the docs warn does **not** establish that a provider is loaded or validated; if nothing matches, operations typically fail with `ERR_OSSL_EVP_UNSUPPORTED`. Treat FIPS as infrastructure work, not a code change.

## Worked example: a signed, expiring token

This issues an opaque, tamper-evident token carrying a subject and an expiry, and verifies it with no timing leak. It is deliberately not a JWT — there is no algorithm field for an attacker to set to `none`.

```mjs
// token.mjs
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';

const VERSION = 'v1';

function sign(key, payloadB64) {
  return createHmac('sha256', key)
    .update(`${VERSION}.${payloadB64}`)   // version is inside the MAC
    .digest();
}

export function issueToken(key, subject, ttlSeconds) {
  const payload = {
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    jti: randomBytes(12).toString('base64url'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const tag = sign(key, payloadB64).toString('base64url');
  return `${VERSION}.${payloadB64}.${tag}`;
}

export function verifyToken(key, token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;

  const [version, payloadB64, tagB64] = parts;
  if (version !== VERSION) return null;

  const expected = sign(key, payloadB64);
  const provided = Buffer.from(tagB64, 'base64url');

  // Length check first: HMAC-SHA256 tags are always 32 bytes, so the
  // length is public and this leaks nothing.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}
```

```mjs
import { randomBytes } from 'node:crypto';
import { issueToken, verifyToken } from './token.mjs';

const key = randomBytes(32);                     // load from a secret store in production
const token = issueToken(key, 'user:1042', 900); // 15 minutes

console.log(verifyToken(key, token));            // { sub: 'user:1042', exp: ..., jti: ... }
console.log(verifyToken(key, `${token}x`));      // null
```

Four decisions are load-bearing. **The signature covers the version prefix**, so a `v1` payload cannot be replayed into a future `v2` scheme. **The MAC is verified before the JSON is parsed** — never let unauthenticated bytes reach a parser; this is the most common mistake in hand-rolled token code. **The tag comparison is constant-time**, with a length guard because `timingSafeEqual()` throws on mismatched lengths. And **expiry is enforced after verification**, on data now known to be authentic.

Key rotation is then just trying the current key, then the previous one, and re-issuing on success.

## Common mistakes

### ❌ Hashing passwords with SHA-256 and a salt

Salting stops rainbow tables. It does nothing about a GPU trying billions of candidates per second against your dump.

```mjs
// ❌ Fast by design. That is the problem.
const stored = createHash('sha256').update(salt + password).digest('hex');
```

```mjs
// ✅ Slow and memory-hard by design, with the parameters stored alongside.
const key = await argon2Async('argon2id', {
  message: password.normalize('NFC'),
  nonce: salt,
  parallelism: 4,
  memory: 65536,
  passes: 3,
  tagLength: 32,
});
```

### ❌ Building a MAC as `hash(secret + message)`

Length extension turns this into a forgery kit for any Merkle–Damgård hash.

```mjs
// ❌ An attacker can append data and produce a valid tag.
const tag = createHash('sha256').update(secret + message).digest('hex');
```

```mjs
// ✅ HMAC's two-pass construction has no extendable state.
const tag = createHmac('sha256', secret).update(message).digest('hex');
```

### ❌ Comparing secrets with `===`

Short-circuit comparison leaks how many leading bytes matched.

```mjs
// ❌ Timing oracle.
if (req.headers['x-api-key'] === process.env.API_KEY) allow();
```

```mjs
// ✅ Fixed-length digests, then a constant-time compare.
const provided = createHash('sha256').update(String(req.headers['x-api-key'] ?? '')).digest();
const expected = createHash('sha256').update(process.env.API_KEY).digest();
if (timingSafeEqual(provided, expected)) allow();
```

### ❌ Using `Math.random()` for a password reset token

`Math.random()`'s internal state is recoverable from a handful of outputs. An attacker who requests a reset for their own account can predict the token issued to yours.

```mjs
// ❌ Predictable.
const token = Math.random().toString(36).slice(2);
```

```mjs
// ✅ 256 bits from the CSPRNG.
const token = randomBytes(32).toString('base64url');
```

### ❌ Calling `scryptSync()` on a login route

100 ms of blocked event loop per login means the whole process stops answering.

```mjs
// ❌ Blocks every other request.
const key = scryptSync(password, salt, 64, { N: 65536, maxmem: 96 * 1024 * 1024 });
```

```mjs
// ✅ Runs on the libuv threadpool.
const key = await scryptAsync(password, salt, 64, { N: 65536, maxmem: 96 * 1024 * 1024 });
```

## Production notes

- **Password hashing is a capacity planning problem, not only a security one.** At `N = 65536`, scrypt needs ~67 MB per concurrent derivation and the libuv threadpool defaults to four threads, so a login spike is a memory spike and a pool stall at once. Rate-limit login endpoints, size `UV_THREADPOOL_SIZE` deliberately, and load-test the login path separately.
- **The threadpool is shared.** `pbkdf2()`, `scrypt()`, `argon2()`, and the async random functions compete with `node:fs` and DNS for the same four default threads. Use a dedicated worker pool (Chapter 29) for sustained hashing.
- **Version your stored hashes.** Store the KDF name and every parameter with the hash. When you raise the cost or migrate scrypt → argon2id, verify with the old parameters and rehash with the new ones inside the successful-login path — there is no offline migration for password hashes.
- **Use a pepper.** `crypto.argon2()`'s `secret` must *not* be stored with the hash; kept in a KMS, it means a stolen database alone cannot be attacked offline. Losing it locks out every user, so back it up like a top-tier secret.
- **Algorithm availability is a deployment property.** `getHashes()` reflects the OpenSSL build; FIPS-restricted or minimal builds may not offer what your laptop does. Assert required algorithms at startup.
- **Never log digests of low-entropy inputs.** SHA-256 of an email address or phone number is not anonymous — the input space is enumerable. HMAC it with a key you do not log.
- **Encode binary output deliberately.** Digests are pseudorandom bytes and, as the docs warn, must not be round-tripped through UTF-8 strings — invalid sequences become `U+FFFD` and the bytes change.

## Exercises

1. **Capability check.** Assert at startup that `'sha256'`, `'sha512'`, and `'sha3-256'` are in `crypto.getHashes()`, naming any missing one. Success: it passes locally and fails informatively for a bogus name.
2. **Streaming digest with checkpoints.** Hash a file with `createHash()`, using `hash.copy()` to also return the digest at each 1 MB boundary. Success: the final digest matches `openssl dgst -sha256`.
3. **Calibrate scrypt.** Time `crypto.scrypt()` for `N` at 2¹⁴ through 2¹⁷ with `r = 8`, `p = 1`, printing milliseconds and required `maxmem`. Success: you can name the `N` nearest 100 ms on your hardware, and 2¹⁷ works only because you raised `maxmem`.
4. **Demonstrate the timing leak.** Compare 32-byte secrets sharing 0, 8, 16, 24, and 31 leading bytes with `===` and with `timingSafeEqual()`. Success: the `===` timings trend upward with prefix length; the constant-time ones do not.
5. **Harden the token.** Add two-key rotation, a revocation set keyed on `jti`, and discriminated failure reasons. Success: a token signed with the previous key verifies, a revoked `jti` does not, and forged tokens never reach `JSON.parse`.

## Recap

- `crypto.hash()` for one-shot digests under ~5 MB, `crypto.createHash()` for streams, `hash.copy()` for prefix digests. A `Hash` or `Hmac` is single-use after `digest()`.
- Enumerate algorithms with `crypto.getHashes()`; availability comes from OpenSSL, not Node.
- Hashes are for integrity, never for passwords. Speed is the whole problem.
- Node ships three password KDFs: `crypto.argon2()` (v24.7.0, prefer `'argon2id'`), `crypto.scrypt()`, and `crypto.pbkdf2()`. scrypt needs roughly `128 * N * r` bytes; exceeding the 32 MB default `maxmem` throws.
- Always use the async KDF forms — the sync forms block the event loop, the async ones use the libuv threadpool shared with `fs` and DNS.
- HMAC, not `hash(secret + message)`: Merkle–Damgård hashes allow length extension, letting an attacker append data and still produce a valid tag.
- `Math.random()` is never acceptable for security. Use `randomBytes`, `randomInt` (no modulo bias), `randomUUID`, `randomUUIDv7`, `randomFillSync`, or `getRandomValues`.
- `crypto.timingSafeEqual()` throws on unequal lengths — guard the length for fixed-size tags, or hash both sides for variable-length secrets. And verify the MAC before parsing anything.

## Where to go next

- [Chapter 42 — Encryption, Signatures, Key Management, Certificates](42-crypto-encryption.md) for ciphers, asymmetric signatures, and `KeyObject`.
- [Chapter 43 — The Web Crypto API](43-webcrypto.md) for the standards-based, promise-first alternative.
- [Chapter 44 — Securing Node.js Applications](44-securing-applications.md) for where these primitives fit in an application's threat model.
- [Chapter 16 — Buffers and Typed Arrays](../part3-data/16-buffers.md) for encodings and `base64url`.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) for moving sustained hashing off the shared threadpool.
- Official docs: <https://nodejs.org/docs/latest/api/crypto.html>
