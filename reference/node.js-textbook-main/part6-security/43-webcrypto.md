---
chapter: 43
part: "Part VI — Security and Cryptography"
title: "The Web Crypto API"
level: advanced
reading_time: "40 min"
prerequisites: [16, 41, 42]
source_docs:
  - "doc/api/webcrypto.md"
  - "doc/api/crypto.md"
  - "doc/api/globals.md"
source_url: "https://nodejs.org/docs/latest/api/webcrypto.html"
node_baseline: "27.0.0-pre"
---

# Chapter 43 — The Web Crypto API

**What you will learn**

- Why Node ships two crypto APIs, and a concrete rule for choosing between them.
- Every way to reach the Web Crypto implementation, and which one to write.
- The `ArrayBuffer` / `TypedArray` / `Buffer` conversions you will need on almost every line — including the pooling trap that silently hashes the wrong bytes.
- All thirteen `crypto.subtle` methods, what each returns, and which algorithms each accepts.
- `CryptoKey` in depth: `type`, `algorithm`, `extractable`, `usages` — and why `extractable: false` is the whole point.
- Worked, runnable examples: AES-GCM, ECDSA, HKDF, key wrapping, and verifying a token against a live JWKS endpoint.

## Why this matters

You are writing an authentication library. It has to verify JWTs signed by an identity provider. It must run in your Node API, in a Cloudflare Worker at the edge, and in a service worker in the browser. If you write it with `node:crypto` you write it three times. If you write it with Web Crypto you write it once, and the same file runs in Node, Deno, Bun, Workers, and the browser without a shim.

That is the first reason to care. The second is stronger and less obvious. `node:crypto` hands you key material as a `Buffer` — a byte array that can be logged, serialized into an error report, captured in a heap snapshot, or accidentally sent to a metrics backend. Web Crypto hands you a `CryptoKey`, and if you create it with `extractable: false`, there is no API in the language that will give you its bytes back. The runtime enforces it. That is a different class of guarantee than "we are careful", and for a signing key that guards your entire system it is worth restructuring code to get.

## Two crypto APIs in one runtime

`node:crypto` grew out of OpenSSL bindings starting in 2010. The Web Crypto API is a W3C standard that Node implemented much later, reaching Stability 2 (Stable) in v19.0.0. They overlap, they do not replace each other, and neither is going away.

| | `node:crypto` | Web Crypto |
|---|---|---|
| Portability | Node only | Node, browsers, Deno, Bun, Workers, service workers |
| Call style | sync, callback, and stream forms | promise-only, one-shot |
| Input/output types | `Buffer`, `string`, `KeyObject` | `ArrayBuffer`, `TypedArray`, `DataView`, `CryptoKey` |
| Streaming | yes — `Cipheriv`, `Hash` and friends are streams | **no** — everything must fit in memory |
| Algorithm naming | OpenSSL names: `'aes-256-gcm'`, `'sha256'` | standard names: `'AES-GCM'`, `'SHA-256'` |
| Key handling | `KeyObject`, exportable by design | `CryptoKey`, optionally **unexportable** |
| Algorithm breadth | everything the linked OpenSSL offers | a fixed, specified registry |
| Password KDFs | scrypt, PBKDF2, Argon2 | PBKDF2, plus Argon2 as a pre-standard extension |
| X.509 certificates | `X509Certificate` | none |
| Per-call overhead | lower | a promise plus WebIDL argument coercion on every call |

The rule: **use Web Crypto when the code must be portable or when a key must be unexportable; use `node:crypto` when you need streaming, certificates, password hashing at scale, or the last few percent of throughput.** Mixing them in one project is normal. They interoperate through `KeyObject.from(cryptoKey)` and `keyObject.toCryptoKey(algorithm, extractable, keyUsages)` — though as of Node 26, `KeyObject.from()` only accepts an **extractable** `CryptoKey`; passing a non-extractable one is no longer supported, which is exactly the guarantee you asked for when you set the flag.

### How to reach it

There are two documented entry points, and one that people invent:

```mjs
// 1. The global. This is what you write in portable code.
const { subtle } = globalThis.crypto;

// 2. The module property, for CommonJS or when you want it explicit.
import { webcrypto } from 'node:crypto';
const { subtle } = webcrypto;

// 3. A convenience alias on node:crypto itself, added v17.4.0.
import { subtle } from 'node:crypto';
```

```cjs
const { subtle } = globalThis.crypto;
const { webcrypto, subtle } = require('node:crypto');
```

**There is no `node:crypto/webcrypto` module.** If you have seen that import, it was wrong. The documented access paths are `globalThis.crypto`, `require('node:crypto').webcrypto`, and the `crypto.subtle` alias, which the docs describe as a convenient alias for `crypto.webcrypto.subtle`. All three reference the same singleton — `require('node:crypto').webcrypto === globalThis.crypto` is `true`.

The globals `crypto`, `Crypto`, `CryptoKey` and `SubtleCrypto` have been available unflagged since v19.0.0 and non-experimental since v23.0.0. They exist **only if the binary was compiled with crypto support** — a rare but real build configuration — so a library that must survive anywhere should feature-detect rather than assume.

The `Crypto` instance also carries two non-`subtle` methods you will use constantly:

- `crypto.getRandomValues(typedArray)` fills an integer typed array in place and returns it. `Float32Array` and `Float64Array` are rejected, and **the array may not exceed 65 536 bytes** — larger requests throw a `QuotaExceededError`. `node:crypto`'s `randomBytes()` has no such cap.
- `crypto.randomUUID()` returns an RFC 4122 version 4 UUID string.

## Everything is a promise over a buffer

Two properties define the ergonomics of this API. Every operation returns a `Promise`, and every operation speaks `ArrayBuffer`. There are no strings and no `Buffer`s in the contract, even though Node accepts `Buffer` as input because it is a `Uint8Array`.

You will write these four conversions on nearly every page, so put them in a module:

```mjs
// bytes.mjs — the conversions Web Crypto forces on you
import { Buffer } from 'node:buffer';

export const encode = (str) => new TextEncoder().encode(str);        // string -> Uint8Array
export const decode = (buf) => new TextDecoder().decode(buf);        // buffer -> string
export const toHex = (buf) => Buffer.from(buf).toString('hex');
export const fromB64Url = (str) => Buffer.from(str, 'base64url');    // Uint8Array
export const toB64Url = (buf) => Buffer.from(buf).toString('base64url');
```

`Buffer.from(arrayBuffer)` creates a **view** over the whole `ArrayBuffer` without copying; `Buffer.from(uint8Array)` **copies**. That asymmetry is a footgun in its own right, but the far more dangerous one runs the other way.

### The `.buffer` trap

A `Buffer` returned by `Buffer.from(string)` is usually a small window into an 8 KiB shared pool. Its `.buffer` property is that entire pool, not your data.

```mjs
const buf = Buffer.from('hello');
console.log(buf.byteOffset, buf.buffer.byteLength);  // e.g. 1824 8192

await subtle.digest('SHA-256', buf);         // ✅ hashes 5 bytes
await subtle.digest('SHA-256', buf.buffer);  // ❌ hashes 8192 bytes of pool
```

Both calls succeed. Both return a 32-byte digest. Only one is the digest of `'hello'`. Web Crypto accepts `TypedArray` and `DataView` directly, so the rule is simple: **never write `.buffer` when passing data to `subtle`.** If you genuinely need an `ArrayBuffer`, use `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)`.

## `crypto.subtle` in full

| Method | Returns (fulfilled value) | Purpose |
|---|---|---|
| `digest(algorithm, data)` | `ArrayBuffer` | one-shot hash |
| `generateKey(algorithm, extractable, keyUsages)` | `CryptoKey` or `CryptoKeyPair` | fresh key material |
| `importKey(format, keyData, algorithm, extractable, keyUsages)` | `CryptoKey` | adopt external key material |
| `exportKey(format, key)` | `ArrayBuffer`, or `Object` for `'jwk'` | serialize an extractable key |
| `getPublicKey(key, keyUsages)` | `CryptoKey` | derive the public half of a private key |
| `encrypt(algorithm, key, data)` | `ArrayBuffer` | encrypt |
| `decrypt(algorithm, key, data)` | `ArrayBuffer` | decrypt |
| `sign(algorithm, key, data)` | `ArrayBuffer` | produce a signature or MAC |
| `verify(algorithm, key, signature, data)` | `boolean` | check a signature or MAC |
| `deriveBits(algorithm, baseKey[, length])` | `ArrayBuffer` | raw derived bytes |
| `deriveKey(algorithm, baseKey, derivedKeyType, extractable, keyUsages)` | `CryptoKey` | derive straight into a key |
| `wrapKey(format, key, wrappingKey, wrapAlgorithm)` | `ArrayBuffer` | export + encrypt in one step |
| `unwrapKey(format, wrappedKey, unwrappingKey, unwrapAlgorithm, unwrappedKeyAlgorithm, extractable, keyUsages)` | `CryptoKey` | decrypt + import in one step |

Plus the static `SubtleCrypto.supports(operation, algorithm[, lengthOrAdditionalAlgorithm])`, added in **v24.7.0** and marked **Stability 1.1 — Active development**, for feature detection.

Two of those deserve a note now. `deriveKey` is documented as exactly equivalent to `deriveBits` followed by `importKey` with the given `derivedKeyType`, `extractable` and `keyUsages` — but it is the better call, because the intermediate bytes never become a JavaScript value you could leak. Likewise `wrapKey` is `exportKey` followed by `encrypt`, and `unwrapKey` is `decrypt` followed by `importKey`; using the combined forms means the plaintext key material never exists in your heap.

## The algorithm matrix

Node's supported set is larger than the W3C standard, because Node also implements two WICG proposals. **Mark these clearly in your own code**: they are pre-standard, they are documented at Stability 1.1 (Active development), and code that uses them will not run in a browser today.

- **Modern Algorithms in the Web Cryptography API** (marked *MA* below) — AES-OCB, Argon2d/i/id, ChaCha20-Poly1305, cSHAKE128/256, KMAC128/256, KT128/256, ML-DSA-44/65/87, ML-KEM-512/768/1024, SHA3-256/384/512, TurboSHAKE128/256, the `'raw-public'` / `'raw-secret'` / `'raw-seed'` formats, the encapsulation methods, `getPublicKey()` and `SubtleCrypto.supports()`.
- **Secure Curves in the Web Cryptography API** (marked *SC*) — `'Ed448'` and `'X448'`. Note that `'Ed25519'` and `'X25519'` are **not** in this group: they became stable in v23.5.0 / v22.13.0 / v20.19.3 and are ordinary supported algorithms.

Some algorithms additionally require a recent OpenSSL: Argon2 needs ≥ 3.2, KMAC and AES-OCB need ≥ 3.0, and the ML-DSA / ML-KEM families need ≥ 3.5. Feature-detect rather than assume.

| Operation | Supported algorithms |
|---|---|
| `encrypt` / `decrypt` | `AES-CBC`, `AES-CTR`, `AES-GCM`, `AES-OCB`*MA*, `ChaCha20-Poly1305`*MA*, `RSA-OAEP` |
| `sign` / `verify` | `ECDSA`, `Ed25519`, `Ed448`*SC*, `HMAC`, `KMAC128`*MA*, `KMAC256`*MA*, `ML-DSA-44/65/87`*MA*, `RSA-PSS`, `RSASSA-PKCS1-v1_5` |
| `deriveBits` / `deriveKey` | `Argon2d`*MA*, `Argon2i`*MA*, `Argon2id`*MA*, `ECDH`, `HKDF`, `PBKDF2`, `X25519`, `X448`*SC* |
| `wrapKey` / `unwrapKey` | `AES-CBC`, `AES-CTR`, `AES-GCM`, `AES-KW`, `AES-OCB`*MA*, `ChaCha20-Poly1305`*MA*, `RSA-OAEP` |
| `digest` | `SHA-1`, `SHA-256`, `SHA-384`, `SHA-512`, `SHA3-256/384/512`*MA*, `cSHAKE128/256`*MA*, `KT128`*MA*, `KT256`*MA*, `TurboSHAKE128/256`*MA* |
| `encapsulateBits` / `encapsulateKey` / `decapsulateBits` / `decapsulateKey` | `ML-KEM-512/768/1024`*MA* |
| `generateKey` (pairs) | `ECDH`, `ECDSA`, `Ed25519`, `Ed448`*SC*, `ML-DSA-*`*MA*, `ML-KEM-*`*MA*, `RSA-OAEP`, `RSA-PSS`, `RSASSA-PKCS1-v1_5`, `X25519`, `X448`*SC* |
| `generateKey` (secret) | `AES-CBC`, `AES-CTR`, `AES-GCM`, `AES-KW`, `AES-OCB`*MA*, `ChaCha20-Poly1305`*MA*, `HMAC`, `KMAC128`*MA*, `KMAC256`*MA* |
| `importKey` only (no export) | `Argon2d/i/id`*MA*, `HKDF`, `PBKDF2` |

Notice what is absent: there is no `scrypt`, no ECB mode, no MD5. Node once had proprietary `'NODE-DSA'`, `'NODE-DH'`, `'NODE-SCRYPT'`, `'NODE-ED25519'` and `'NODE-X25519'` identifiers and a `'node.keyObject'` format; all were **removed in v18.4.0 / v16.17.0**. If you find them in a tutorial, that tutorial predates 2022.

### Feature detection

```mjs
const hasArgon2 = SubtleCrypto.supports?.('importKey', 'Argon2id') ?? false;
const kdf = hasArgon2 ? 'Argon2id' : 'PBKDF2';
```

The optional call is deliberate: `SubtleCrypto.supports` itself only exists from v24.7.0, so on older runtimes the expression must degrade rather than throw. The alternative — a `try/catch` around a throwaway `importKey` — works everywhere but costs a rejected promise per check.

## `CryptoKey`

Every key is an opaque object with four read-only properties.

| Property | Type | Meaning |
|---|---|---|
| `type` | `'secret'` \| `'private'` \| `'public'` | symmetric or which half of a pair |
| `algorithm` | object | `{ name }` plus algorithm-specific fields such as `length`, `namedCurve`, `hash`, `modulusLength`, `publicExponent` |
| `extractable` | boolean | whether `exportKey()` and `wrapKey()` will work |
| `usages` | string array | the operations this key is permitted to perform |

The twelve possible usages are `'encrypt'`, `'decrypt'`, `'sign'`, `'verify'`, `'deriveKey'`, `'deriveBits'`, `'wrapKey'`, `'unwrapKey'`, `'encapsulateBits'`, `'decapsulateBits'`, `'encapsulateKey'` and `'decapsulateKey'`. Which are valid depends on the algorithm, and the list may not be empty — `generateKey(..., true, [])` throws a `SyntaxError`.

Usages are enforced at call time, not merely advisory:

```mjs
const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
// Rejects: InvalidAccessError — The requested operation is not valid for the provided key
```

This is a genuine security control, not bookkeeping. Give a token-verification service a key with `['verify']` only, and a code-injection bug in that service still cannot mint tokens.

### Why `extractable: false` is the point

```mjs
const signingKey = await subtle.generateKey(
  { name: 'Ed25519' }, false, ['sign', 'verify']);

await subtle.exportKey('pkcs8', signingKey.privateKey);
// Rejects with a DOMException: key is not extractable
```

There is no flag, no override, no private field. Once created non-extractable, the bytes are unreachable from JavaScript for the lifetime of the process. Compare that with a `Buffer` holding a PEM key: a stray `console.log(err)` where `err` captured the config object, a heap snapshot taken during an incident, or an over-eager error reporter is enough to leak it. The tradeoff is that you cannot persist such a key — which is fine for ephemeral session keys, and for long-lived keys is what `wrapKey`/`unwrapKey` exist to solve.

Note the asymmetry: a derived key can be non-extractable even when its inputs were not, and `deriveKey`'s `extractable` parameter is where you say so. Get in the habit of passing `false` and only relaxing it when a specific line of code needs to export.

## Key formats

`importKey` and `exportKey` share one `format` argument.

| Format | Data type | Use for |
|---|---|---|
| `'raw'` | `ArrayBuffer`/`TypedArray` | symmetric keys, EC public points |
| `'spki'` | `ArrayBuffer` | public keys, DER SubjectPublicKeyInfo |
| `'pkcs8'` | `ArrayBuffer` | private keys, DER PrivateKeyInfo |
| `'jwk'` | plain object | anything — the interchange format |
| `'raw-secret'`, `'raw-public'`, `'raw-seed'` *MA* | `ArrayBuffer` | pre-standard raw forms |

Not every algorithm supports every format. AES and HMAC keys use `'raw'`, `'jwk'` and `'raw-secret'`. EC, Ed and X keys use `'spki'`, `'pkcs8'`, `'jwk'`, `'raw'` and `'raw-public'`. RSA keys use `'spki'`, `'pkcs8'` and `'jwk'` only — **there is no `'raw'` RSA key**. KDF keys (`HKDF`, `PBKDF2`, the Argon2 family) can be imported but never exported, and the docs state that when importing a KDF key `extractable` **must** be `false`.

JWK is the format that matters for interoperability, because it is what identity providers publish and what JOSE libraries consume. An exported public EC key looks like this:

```json
{
  "key_ops": ["verify"],
  "ext": true,
  "kty": "EC",
  "x": "XEOtzYAY_CztZC77OQkuuLIumhRFMw41YtTqb_zotAM",
  "y": "rSPNVc2HwIJfE5JA01aEqq6CSD6MceQCI_gqyE0K9xc",
  "crv": "P-256"
}
```

Every component is Base64url, so a JWK survives JSON, HTTP and log pipelines intact. The `key_ops` and `use` members are checked on import: if the JWK says `key_ops: ['encrypt']` and you ask for `['verify']`, the import rejects with a `DataError` reading "Key operations and usage mismatch". A JWK with `use: 'enc'` imported for a signature algorithm rejects with "Invalid JWK \"use\" Parameter". This is a feature — it stops a key being repurposed — but it is also the number-one reason a JWKS import fails, so when consuming third-party JWKs it is normal to pass only the cryptographic members through.

## Worked example: AES-GCM

```mjs
import { Buffer } from 'node:buffer';

const { subtle } = globalThis.crypto;
const TAG_BITS = 128;

export async function newDataKey() {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(key, plaintext, context = '') {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(context),
    tagLength: TAG_BITS,
  }, key, new TextEncoder().encode(plaintext));

  // The tag is already appended to `ciphertext`. Only the IV needs framing.
  return Buffer.concat([iv, Buffer.from(ciphertext)]);
}

export async function open(key, envelope, context = '') {
  const iv = envelope.subarray(0, 12);
  const ciphertext = envelope.subarray(12);
  const plaintext = await subtle.decrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(context),
    tagLength: TAG_BITS,
  }, key, ciphertext);

  return new TextDecoder().decode(plaintext);
}
```

Three differences from the `node:crypto` version in Chapter 42 are worth internalising:

1. **The authentication tag is part of the ciphertext.** Web Crypto appends it; there is no `getAuthTag()` and no `setAuthTag()`. `encrypt()` returns exactly `plaintext.length + tagLength / 8` bytes. Your envelope format therefore needs one fewer field.
2. **`tagLength` is in bits.** `node:crypto`'s `authTagLength` is in bytes. 128 bits and 16 bytes are the same tag; mixing the units up produces an immediate error, which is the good outcome — the bad outcome is copying `16` into `tagLength` and silently getting a 2-byte tag if a future version permits it.
3. **Authentication failure is a rejection, not an exception.** `subtle.decrypt()` returns a rejected promise on a bad tag. `await` turns that into a throw, but a forgotten `await` turns it into an unhandled rejection and a value that looks like success. Always `await` inside a `try`.

Everything Chapter 42 said about nonce uniqueness applies unchanged: the docs state plainly that `aeadParams.iv` must be unique for every encryption operation using a given key. Twelve fresh random bytes per message.

For `AES-CBC` the parameter is `iv` and must be **exactly 16 bytes**, unpredictable and random. For `AES-CTR` it is `counter` (exactly 16 bytes) plus `length`, the number of rightmost bits used as the counter — get `length` wrong and the counter wraps into the nonce, repeating keystream. Neither mode authenticates. Use `AES-GCM`.

## Worked example: ECDSA sign and verify

```mjs
const { subtle } = globalThis.crypto;

const { publicKey, privateKey } = await subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

const message = new TextEncoder().encode('transfer 100 to alice');

const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message);
console.log(signature.byteLength);  // 64 — raw r || s, not DER

const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, message);
```

The hash lives in the *operation* parameters for ECDSA, not in the key. RSA is the opposite: `RSASSA-PKCS1-v1_5` and `RSA-PSS` bind the hash to the key at generation or import time, so `subtle.sign('RSASSA-PKCS1-v1_5', key, data)` needs no parameters, while `RSA-PSS` still needs `{ name: 'RSA-PSS', saltLength }` — a length **in bytes**. Ed25519 needs nothing at all: `subtle.sign('Ed25519', privateKey, data)`.

That 64-byte signature is the raw `r || s` concatenation. If you hand it to `node:crypto` you must say so, or verification silently fails:

```mjs
import { createPublicKey, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';

const spki = await subtle.exportKey('spki', publicKey);
const nodeKey = createPublicKey({ key: Buffer.from(spki), format: 'der', type: 'spki' });

verify('sha256', Buffer.from(message), nodeKey, Buffer.from(signature));
// false — node:crypto expects DER by default

verify('sha256', Buffer.from(message),
       { key: nodeKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature));
// true
```

This is the most common bug when a system uses both APIs. Web Crypto is always `ieee-p1363`; `node:crypto` defaults to `'der'`.

## Worked example: HKDF

```mjs
const { subtle } = globalThis.crypto;

// The master secret enters as a non-extractable KDF key. It can never leave again.
const master = await subtle.importKey(
  'raw',
  Buffer.from(process.env.MASTER_KEY, 'base64'),
  'HKDF',
  false,                       // required to be false for KDF keys
  ['deriveKey', 'deriveBits'],
);

const salt = new TextEncoder().encode('app-v1-salt');

function subkey(label) {
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(label) },
    master,
    { name: 'AES-GCM', length: 256 },
    false,                     // the derived key is unexportable too
    ['encrypt', 'decrypt'],
  );
}

const piiKey = await subkey('pii-encryption');
const auditKey = await subkey('audit-log-encryption');
```

`hkdfParams` requires all three of `hash`, `salt` and `info`. `info` may be zero-length but must be present; the docs recommend a `salt` that is random or pseudorandom and the same length as the digest output — 32 bytes for SHA-256. Different `info` labels give cryptographically independent keys from one master.

If you need raw bytes instead of a key, `deriveBits(algorithm, baseKey, length)` takes **length in bits** and returns an `ArrayBuffer`. It may be omitted or `null` only for `'ECDH'`, `'X25519'` and `'X448'`, where it then yields the maximum for the algorithm. For `HKDF` and `PBKDF2`, a number is required.

PBKDF2 follows the same shape, with `iterations` and a salt the docs say should be at least 16 random bytes:

```mjs
const passwordKey = await subtle.importKey('raw', encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
  passwordKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
```

If you are hashing passwords for storage rather than deriving an encryption key, prefer `node:crypto`'s `scrypt` or `argon2`. PBKDF2 is the only universally portable password KDF, but it is also the weakest against GPU attackers.

## Worked example: verifying a token against a JWKS endpoint

This is the task Web Crypto is best at, and it ties every concept together.

```mjs
// verify-jwt.mjs
import { Buffer } from 'node:buffer';

const { subtle } = globalThis.crypto;

const ALGS = {
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: 'RSASSA-PKCS1-v1_5' },
  PS256: { import: { name: 'RSA-PSS', hash: 'SHA-256' }, verify: { name: 'RSA-PSS', saltLength: 32 } },
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } },
};

async function fetchJwks(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return (await res.json()).keys;
}

export async function verifyToken(token, jwksUrl) {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!signatureB64) throw new Error('not a compact JWS');

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const spec = ALGS[header.alg];
  if (!spec) throw new Error(`unsupported alg ${header.alg}`);   // never trust alg blindly

  const jwks = await fetchJwks(jwksUrl);
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`no key for kid ${header.kid}`);

  // Pass only the cryptographic members: a stray key_ops or use rejects the import.
  const { kty, n, e, crv, x, y } = jwk;
  const key = await subtle.importKey(
    'jwk', { kty, n, e, crv, x, y, alg: header.alg }, spec.import, false, ['verify']);

  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = Buffer.from(signatureB64, 'base64url');

  const ok = await subtle.verify(spec.verify, key, signature, signed);
  if (!ok) throw new Error('signature does not verify');

  const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) throw new Error('token expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now) throw new Error('token not yet valid');
  return claims;
}
```

Points to carry away:

- **The allow-list of algorithms is the security control.** Reading `header.alg` and feeding it straight to `importKey` is how the classic `alg: "none"` and RS256→HS256 confusion attacks work. The `ALGS` table means an attacker-chosen `alg` that is not on the list is rejected before any key is touched.
- **`ES256` signatures need no conversion.** They are already `r || s`, which is what Web Crypto expects — the same fact that made the `node:crypto` path in the previous section require `dsaEncoding`.
- **`base64url` is a first-class `Buffer` encoding.** No manual `-`/`_` substitution.
- **The key is imported non-extractable with `['verify']` only.** It cannot sign, and it cannot be exported.
- Cache the JWKS with a TTL and re-fetch on unknown `kid`. Fetching per request turns your identity provider into a hard dependency on your request path.

## Wrapping keys

`wrapKey` solves the problem that non-extractable keys cannot be persisted: you encrypt the key under another key, and the plaintext bytes never appear in your process.

```mjs
const kek = await subtle.generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

const wrapped = await subtle.wrapKey('raw', dek, kek, 'AES-KW');   // 40 bytes for a 32-byte key
// ... store `wrapped` ...

const restored = await subtle.unwrapKey(
  'raw', wrapped, kek, 'AES-KW', { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
```

`AES-KW` (RFC 3394 key wrapping) exists for exactly this and adds 8 bytes of integrity check — hence 40 bytes out for 32 bytes in. The key being wrapped must be `extractable: true`, since wrapping is an export; the wrapping key needs `'wrapKey'` in its usages. Note that the *unwrapped* key can be non-extractable even though the wrapped one was extractable, which is the pattern you want: extractable long enough to be wrapped at provisioning time, non-extractable everywhere it is actually used. For asymmetric wrapping — the envelope pattern from Chapter 42 — use `RSA-OAEP` as the `wrapAlgorithm`.

## Common mistakes

### ❌ Passing `.buffer` instead of the view

```js
const data = Buffer.from(req.body.payload);
const digest = await subtle.digest('SHA-256', data.buffer);   // hashes the whole 8 KiB pool
```

Because `Buffer.from(string)` allocates from a shared pool, `.buffer` is almost never your data. The call succeeds and returns a plausible digest of the wrong bytes — the worst kind of bug, because it is self-consistent within one process and breaks the moment allocation patterns change.

```js
// ✅ Pass the view. Web Crypto accepts TypedArray and DataView directly.
const digest = await subtle.digest('SHA-256', data);
```

### ❌ Reusing an IV, or hard-coding one

```js
const iv = new Uint8Array(12);          // all zeroes, every message
await subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
```

The docs state the requirement in one sentence: the IV must be unique for every encryption operation using a given key. Under GCM, repeating it leaks the XOR of the plaintexts and lets an attacker forge tags.

```js
// ✅ Fresh per message, stored alongside the ciphertext.
const iv = crypto.getRandomValues(new Uint8Array(12));
```

### ❌ Requesting the wrong usages, or none

```js
const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, []);
// SyntaxError: Usages cannot be empty when creating a key.

const verifyOnly = await subtle.importKey('jwk', jwk, alg, false, ['verify']);
await subtle.sign(alg, verifyOnly, data);
// InvalidAccessError: The requested operation is not valid for the provided key
```

The mirror-image mistake is worse: requesting `['sign', 'verify']` out of habit for a key that only ever verifies, discarding a free security control.

```js
// ✅ Exactly the usages this key needs, and nothing more.
const verifyOnly = await subtle.importKey('jwk', jwk, alg, false, ['verify']);
```

### ❌ Assuming an algorithm exists

```js
const key = await subtle.importKey('raw-secret', bytes, 'Argon2id', false, ['deriveKey']);
// NotSupportedError on any runtime older than v24.8.0, on a browser, or on an
// OpenSSL build older than 3.2
```

Argon2, ML-DSA, ML-KEM, SHA-3, KMAC, cSHAKE, TurboSHAKE, KangarooTwelve, AES-OCB, ChaCha20-Poly1305, Ed448 and X448 are all pre-standard in Web Crypto terms and several depend on the linked OpenSSL version.

```js
// ✅ Detect, then fall back.
const alg = SubtleCrypto.supports?.('importKey', 'Argon2id') ? 'Argon2id' : 'PBKDF2';
```

### ❌ Forgetting `await` on `decrypt` or `verify`

```js
if (subtle.verify(alg, key, signature, data)) grantAccess();   // always true — it is a Promise
```

A `Promise` is truthy. Signature verification that always passes is indistinguishable from working code until someone tries a forged token.

```js
// ✅
if (await subtle.verify(alg, key, signature, data)) grantAccess();
```

## Production notes

- **There is no streaming.** `subtle.digest()` and `subtle.encrypt()` take the whole input as one buffer. Hashing a 2 GB upload with Web Crypto means holding 2 GB in memory. For anything larger than a few megabytes use `node:crypto`'s `createHash()` or `createCipheriv()`, which are `Transform` streams. This is the single most common reason a Node service must reach for the older API.
- **Per-call overhead is real.** Every `subtle` call allocates a promise and coerces its arguments according to WebIDL rules — behaviour Node aligned with other implementations in v20.0.0 / v18.17.0. For a hot path doing millions of small HMACs, `node:crypto`'s synchronous `createHmac()` measurably wins. For anything doing network I/O per operation, the difference is noise.
- **Web Crypto work runs off-thread, but not for free.** Because every operation is asynchronous, expensive derivations do not block the event loop the way `scryptSync` does. That is a real advantage — but it also means a burst of PBKDF2 logins at 600 000 iterations will saturate the threadpool and stall unrelated `fs` work. Bound concurrency and size `UV_THREADPOOL_SIZE` deliberately.
- **Import keys once, at startup.** `importKey` parses and validates on every call. Cache the resulting `CryptoKey` — it is an ordinary JavaScript object you can hold in a module-level `Map` keyed by `kid`, and unlike raw key material it is safe to keep there.
- **Default to `extractable: false` and widen only when required.** Write the flag deliberately on every `generateKey`, `importKey`, `deriveKey` and `unwrapKey` call. The cases that genuinely need `true` are provisioning, wrapping, and publishing a public key — everything else should be `false`.
- **Pin your algorithm allow-list at the boundary.** Anywhere an algorithm name comes from outside your process — a JWT header, a config file, a database column — validate it against a fixed list before it reaches `subtle`. Algorithm confusion is a live attack class, not a theoretical one.
- **Track the Stability 1.1 surface.** `SubtleCrypto.supports()`, the encapsulation methods, the `raw-*` formats, and every algorithm marked *MA* or *SC* above are under active development and may change. If you depend on them, pin your Node version in CI and read the changelog on upgrade — see [Chapter 63 — Upgrading Node.js](../part9-production/63-upgrading-node.md).

## Exercises

1. **Build the conversion module.** Write `bytes.mjs` with `encode`, `decode`, `toHex`, `toB64Url` and `fromB64Url`, then prove the pooling trap: hash the same short string via the `Buffer` and via `buffer.buffer`, and show the digests differ. Success criterion: your test asserts the two digests are unequal and explains why in a comment.

2. **Seal and open with AES-GCM.** Implement the `seal`/`open` pair from this chapter, then write tests that (a) round-trip a string, (b) fail when one byte of the ciphertext is flipped, and (c) fail when the `context` string differs between seal and open. Success criterion: all three tests pass and (b) and (c) fail as rejections, not as wrong plaintext.

3. **Cross the API boundary.** Generate an ECDSA P-256 pair with Web Crypto, sign with `subtle.sign`, export the public key as `spki`, import it with `crypto.createPublicKey`, and verify with `crypto.verify`. Success criterion: verification returns `false` with default options and `true` with `dsaEncoding: 'ieee-p1363'`, and you can explain the difference in one sentence.

4. **Derive a key hierarchy that cannot leak.** Import a master secret as a non-extractable `HKDF` key and derive three non-extractable AES-GCM keys with different `info` labels. Success criterion: `exportKey` rejects for the master and for every derived key, and changing one label changes only that key's ciphertext.

5. **Write a JWKS-backed verifier.** Extend `verifyToken` with an in-memory JWKS cache that has a TTL, refreshes on an unknown `kid` at most once per minute, and rejects tokens whose `alg` is not on your allow-list. Success criterion: a forged token whose header claims `alg: "none"` is rejected before any network request is made.

## Recap

- Web Crypto is the portable, promise-based, standards-named API; `node:crypto` is the broad, streaming, Node-native one. Choose by portability and key-protection needs, not by fashion.
- Reach it via `globalThis.crypto`, `require('node:crypto').webcrypto`, or the `crypto.subtle` alias. There is no `node:crypto/webcrypto` module.
- Everything is `ArrayBuffer`-shaped. Use `TextEncoder`/`TextDecoder` and `Buffer.from`, and never pass `someBuffer.buffer` to `subtle`.
- `crypto.subtle` has thirteen methods; prefer `deriveKey` over `deriveBits`+`importKey` and `wrapKey`/`unwrapKey` over `exportKey`+`encrypt`, so key bytes never become JavaScript values.
- `CryptoKey` carries `type`, `algorithm`, `extractable` and `usages`; usages are enforced at call time and `extractable: false` is irreversible protection.
- Formats are `raw`, `spki`, `pkcs8` and `jwk`, plus the pre-standard `raw-*` set. JWK is the interchange format, and its `key_ops` / `use` members are validated on import.
- AES-GCM in Web Crypto appends the tag to the ciphertext and takes `tagLength` in bits; the IV must still be unique per message.
- ECDSA signatures are raw `r || s` here and DER in `node:crypto` — bridge with `dsaEncoding: 'ieee-p1363'`.
- Everything marked *MA* or *SC* comes from a WICG proposal, sits at Stability 1.1, may require a recent OpenSSL, and will not run in a browser today. Feature-detect with `SubtleCrypto.supports?.()`.

## Where to go next

- [Chapter 42 — Encryption, Signatures, Key Management, Certificates](../part6-security/42-crypto-encryption.md) — the `node:crypto` counterpart, including streaming ciphers and X.509.
- [Chapter 41 — Cryptography Essentials: Hashing, HMAC, Randomness](../part6-security/41-crypto-essentials.md) — the primitives underneath.
- [Chapter 44 — Securing Node.js Applications](../part6-security/44-securing-applications.md) — where token verification and key storage fit into a threat model.
- [Chapter 16 — Buffers and Typed Arrays](../part3-data/16-buffers.md) — the pooling behaviour that makes `.buffer` dangerous.
- [Chapter 29 — Worker Threads](../part4-system/29-worker-threads.md) — for moving heavy derivations off the main thread.
- Official documentation: <https://nodejs.org/docs/latest/api/webcrypto.html>
