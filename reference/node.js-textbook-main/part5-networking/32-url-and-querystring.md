---
chapter: 32
part: "Part V — Networking"
title: "URLs, Query Strings, and Punycode"
level: intermediate
reading_time: "30 min"
prerequisites: [17, 24]
source_docs:
  - "doc/api/url.md"
  - "doc/api/querystring.md"
  - "doc/api/punycode.md"
  - "doc/api/deprecations.md"
source_url: "https://nodejs.org/docs/latest/api/url.html"
node_baseline: "27.0.0-pre"
---

# Chapter 32 — URLs, Query Strings, and Punycode

**What you will learn**

- How to build, resolve, and take apart URLs with the WHATWG `URL` class, and why string concatenation is the wrong tool.
- Every `URL` component property, including the ones that silently ignore bad input instead of throwing.
- `URLSearchParams` in full: repeated keys, iteration order, `sort()`, and the encoding rules that differ from the rest of the `URL` object.
- Why `url.parse()` is dangerous with untrusted input, with concrete inputs that produce a different host from the one the request actually reaches.
- How to validate a user-supplied URL safely, including a practical SSRF checklist.
- Where internationalized domain names, Punycode, and homograph attacks fit in.

## Why this matters

A URL is the single most common piece of attacker-controlled data a server handles. It arrives in the request line, in a `Location` header you are about to follow, in a webhook registration form, in an OAuth `redirect_uri`, in an "import from URL" feature. Every one of those is a place where getting the parse wrong turns into a real vulnerability: an open redirect, a request forged against your own metadata service, a link that renders as `paypal.com` and resolves somewhere else.

Node ships two URL parsers. One implements the WHATWG URL Standard — the same algorithm your browser, `curl`, and every modern HTTP client use. The other is a hand-rolled parser from 2010 that predates the standard, disagrees with it on host parsing, and has a documented history of being used to bypass security checks. They are both still in the module. Knowing which one you are calling, and why the difference matters, is the whole point of this chapter.

## The anatomy of a URL

Get the vocabulary straight first. Take this URL:

```text
https://alice:s3cret@shop.example.com:8443/cart/items?id=7&id=9#total
```

| Component | Value here | `URL` property |
|---|---|---|
| Scheme (protocol) | `https:` | `protocol` — **includes** the trailing colon |
| Username | `alice` | `username` |
| Password | `s3cret` | `password` |
| Host name | `shop.example.com` | `hostname` — no port |
| Port | `8443` | `port` — a **string**, empty when default |
| Host | `shop.example.com:8443` | `host` — hostname *and* port |
| Origin | `https://shop.example.com:8443` | `origin` — read-only, no credentials |
| Path | `/cart/items` | `pathname` |
| Query | `?id=7&id=9` | `search` — includes the `?` |
| Fragment | `#total` | `hash` — includes the `#` |
| Whole thing | the full string | `href` |

Two details in that table trip people up constantly. `protocol` carries a colon, so `u.protocol === 'https'` is always `false`. And `port` is a string, so `u.port === 8443` is `false` too — and when the port is the scheme's default it is the *empty string*, not `'443'`.

```js
const u = new URL('https://example.com/a');
console.log(u.protocol);        // 'https:'
console.log(u.port);            // ''  (443 is the default, so it is dropped)
console.log(u.host);            // 'example.com'
console.log(typeof u.port);     // 'string'
```

The defaults Node drops are fixed by the standard: `ftp` 21, `http` 80, `https` 443, `ws` 80, `wss` 443. `file` has no default port at all.

## Constructing URLs

### `new URL(input[, base])`

`URL` is a global — no import needed — and is also exported from `node:url` for people who prefer explicit dependencies.

```mjs
import { URL } from 'node:url';
console.log(URL === globalThis.URL); // true
```

```cjs
const { URL } = require('node:url');
console.log(URL === globalThis.URL); // true
```

If `input` is absolute, `base` is ignored. If `input` is relative, `base` is required. An invalid result throws a `TypeError` with the code `ERR_INVALID_URL`.

```js
new URL('/foo', 'https://example.org/a/b');    // https://example.org/foo
new URL('foo', 'https://example.org/a/b');     // https://example.org/a/foo
new URL('?q=1', 'https://example.org/a/b');    // https://example.org/a/b?q=1
new URL('https://other.test/', 'https://example.org/'); // https://other.test/
```

That last line is the trap. **Passing a `base` does not confine the result to that base.** If the input is absolute, the base evaporates. Any code that does `new URL(userInput, 'https://api.internal/')` and then assumes the result points at `api.internal` is wrong. The docs are explicit about the fix: after constructing, check `origin` against what you expect.

The scheme handling has one more subtlety. The standard treats `ftp`, `file`, `http`, `https`, `ws`, and `wss` as **special** schemes, and parses them differently from everything else:

```js
new URL('http:Example.com/', 'https://example.org/');
// http://example.com/           — special scheme, "Example.com" read as a host

new URL('https:Example.com/', 'https://example.org/');
// https://example.org/Example.com/  — same scheme as base, so it is a relative path!

new URL('foo:Example.com/', 'https://example.org/');
// foo:Example.com/              — non-special scheme, opaque path
```

Three inputs that look almost identical produce three different hosts. This is not a Node quirk — it is the WHATWG algorithm, and browsers do the same. It is also why you cannot eyeball URL strings and reason about them.

### Never concatenate strings to build a URL

The single most common URL bug in Node code:

```js
// Broken.
const url = `https://api.example.com/users/${userId}/notes?q=${query}`;
```

If `userId` is `../../admin` you have written a path traversal. If `query` contains `&role=admin` you have injected a parameter. If either contains a space, a `#`, or a non-ASCII character, the result is not a valid URL and whatever consumes it will throw or silently mangle it.

Build structurally instead. Each setter applies the correct percent-encode set for its position:

```js
const url = new URL('https://api.example.com');
url.pathname = `/users/${encodeURIComponent(userId)}/notes`;
url.searchParams.set('q', query);        // encodes for you
console.log(url.href);
```

`searchParams.set` handles query encoding entirely. The path still needs `encodeURIComponent` per segment: a `/` inside a segment is a legitimate separator as far as the parser is concerned — only you know it was meant to be data.

### `URL.canParse()` and `URL.parse()`

Both exist and both are stable. Use them instead of wrapping the constructor in `try`/`catch`.

`URL.canParse(input[, base])` — available since v19.9.0 (and v18.17.0) — returns a boolean:

```js
URL.canParse('/foo', 'https://example.org/');  // true
URL.canParse('/foo');                          // false — relative with no base
```

`URL.parse(input[, base])` — added in v22.1.0 — returns a `URL` or `null`:

```js
const u = URL.parse(req.headers.referer ?? '', 'https://example.com/');
if (u === null) return respondBadRequest();
```

Prefer `URL.parse` when you need the object. Calling `canParse` and then the constructor parses the string twice, which is measurable in a hot request path.

## Component properties in detail

The getters are unsurprising. The setters have a behaviour that catches people: **most of them ignore invalid values rather than throwing.**

| Setter | Invalid input behaviour |
|---|---|
| `protocol` | Ignored. Cannot switch between special and non-special schemes. |
| `host`, `hostname` | Ignored. |
| `port` | Leading digits are used, the rest discarded; out-of-range values ignored. |
| `username`, `password`, `pathname`, `search`, `hash` | Percent-encoded, never rejected. |
| `href` | Throws `TypeError` if the whole result is not a valid URL. |
| `origin` | Read-only. Assignment does nothing. |

Port assignment is worth seeing, because "silently keeps the old value" is a genuinely surprising failure mode:

```js
const u = new URL('https://example.org:8888');
u.port = 'abcd';      // completely invalid -> ignored
console.log(u.port);  // '8888'
u.port = '5678abcd';  // leading number wins
console.log(u.port);  // '5678'
u.port = 1234.5678;   // truncated at the decimal point
console.log(u.port);  // '1234'
u.port = '443';       // the default for https
console.log(u.port);  // '' — normalised away
```

If you set a component from user input and need to know whether it was accepted, read the property back and compare. There is no error to catch.

`toString()`, `toJSON()`, and `href` all return the same serialization, and `toJSON()` means `JSON.stringify(new URL(...))` produces the URL string rather than `{}`.

For a *customised* serialization there is `url.format(URL[, options])`, whose `auth`, `fragment`, and `search` booleans default to `true` and whose `unicode` boolean defaults to `false`:

```mjs
import { format } from 'node:url';
const u = new URL('https://a:b@測試/?abc#foo');
console.log(u.href);
// https://a:b@xn--g6w251d/?abc#foo
console.log(format(u, { auth: false, fragment: false, unicode: true }));
// https://測試/?abc
```

This is a *different function* from the legacy `url.format(urlObject)` below — same name, overloaded on argument type.

`urlToHttpOptions(url)` converts a `URL` into the plain options object `http.request()` and `https.request()` expect (`protocol`, `hostname`, `port`, `path`, `hash`, `search`, `pathname`, `href`, `auth`). It is the correct bridge between the two worlds; see [Chapter 36 — HTTP/1.1 Clients, Agents, and Keep-Alive](36-http-clients.md).

## `URLSearchParams`

`URLSearchParams` models a query string as an **ordered list of name/value pairs**, not a map. That single design decision explains almost all of its behaviour.

### Four constructors

```js
new URLSearchParams();                            // empty
new URLSearchParams('?a=1&b=2');                  // string; leading '?' ignored
new URLSearchParams({ a: '1', b: '2' });          // object
new URLSearchParams([['a', '1'], ['a', '2']]);    // iterable of pairs
```

The object form and the iterable form differ in a way that matters. An object cannot express duplicate keys, so array values are flattened with `Array.prototype.toString()` — joined by commas:

```js
const p = new URLSearchParams({ user: 'abc', query: ['first', 'second'] });
console.log(p.getAll('query'));  // [ 'first,second' ]  — one entry!
console.log(p.toString());       // user=abc&query=first%2Csecond
```

The iterable form preserves duplicates:

```js
const p = new URLSearchParams([
  ['user', 'abc'],
  ['query', 'first'],
  ['query', 'second'],
]);
console.log(p.toString());  // user=abc&query=first&query=second
```

Each element must be a two-element iterable; anything else throws `TypeError [ERR_INVALID_TUPLE]`.

### Reading and writing

| Method | Behaviour |
|---|---|
| `get(name)` | First matching value, or `null`. |
| `getAll(name)` | Array of all matching values; `[]` if none. |
| `has(name[, value])` | Optional `value` narrows the check (since v20.2.0 / v18.18.0). |
| `append(name, value)` | Adds a pair at the end. Duplicates allowed. |
| `set(name, value)` | Replaces the **first** match in place and deletes the rest; appends if absent. |
| `delete(name[, value])` | Deletes all pairs with that name, or only those with that value (since v20.2.0 / v18.18.0). |
| `size` | Total number of pairs (since v19.8.0 / v18.16.0). |
| `sort()` | Stable sort by name, in place. |
| `entries()` / `keys()` / `values()` / `[Symbol.iterator]()` | Iterators over pairs, names, values. |

`set()`'s "replace in place" rule is subtle and worth internalising:

```js
const p = new URLSearchParams();
p.append('foo', 'bar');
p.append('foo', 'baz');
p.append('abc', 'def');
console.log(p.toString());  // foo=bar&foo=baz&abc=def

p.set('foo', 'def');
p.set('xyz', 'opq');
console.log(p.toString());  // foo=def&abc=def&xyz=opq
```

`foo` kept its original position; `xyz` went to the end. Insertion order is preserved everywhere else too — `keys()` on `'foo=bar&foo=baz'` yields `foo` twice.

`sort()` is stable, so pairs with equal names keep their relative order. Its practical use is cache normalization — two clients sending the same parameters in different orders produce the same key. `new URLSearchParams('b=2&a=1&a=0')` sorts to `a=1&a=0&b=2`.

### The `searchParams` property is live

`url.searchParams` is read-only *as a property*, but the object it returns mutates the URL:

```js
const u = new URL('https://example.org/');
u.searchParams.append('a', '1');
console.log(u.href);  // https://example.org/?a=1
```

To replace the query wholesale, assign to `url.search` instead. And note that a `URLSearchParams` created *from* a URL is not linked back to it once detached:

```js
const copy = new URLSearchParams(u.searchParams);
copy.append('b', '2');
console.log(u.href);  // unchanged — copy is independent
```

### The encoding gotcha

`URL` and `URLSearchParams` use *different* percent-encode rules. `URL` leaves ASCII tilde alone; `URLSearchParams` always encodes it. So touching `searchParams` at all — even with a read-only-looking call like `sort()` — can rewrite the query string:

```js
const u = new URL('https://example.org/abc?foo=~bar');
console.log(u.search);   // ?foo=~bar
u.searchParams.sort();
console.log(u.search);   // ?foo=%7Ebar
```

Both are correct and both decode to the same thing, but if you are computing a signature over the URL — HMAC-signed webhook URLs, AWS SigV4, cache keys — a byte-level change breaks it. Sign the string you actually send, and do not reserialize between signing and sending.

## `node:querystring` versus `URLSearchParams`

`node:querystring` is Node's original, non-standard query parser. It is still **Stable**, not deprecated, and it is genuinely faster. The docs put it plainly: prefer `URLSearchParams` unless performance is critical or you need the customization `querystring` offers.

| | `node:querystring` | `URLSearchParams` |
|---|---|---|
| Standardized | No, Node-specific | Yes, WHATWG; identical in browsers |
| Result shape | Null-prototype object | Ordered list of pairs |
| Repeated keys | Value becomes an array | Preserved as separate entries |
| Custom separators | Yes — `sep` and `eq` arguments | No, always `&` and `=` |
| Custom codec | Yes — `decodeURIComponent` / `encodeURIComponent` options | No |
| Key limit | `maxKeys`, **default 1000** | Unlimited |
| Encodes a space as | `%20` | `+` |
| Decodes `+` as | space | space |
| Encodes `~` | No | Yes (`%7E`) |
| Performance | Faster | Slower |

The space asymmetry is real and bites in signature checks:

```js
const qs = require('node:querystring');
qs.stringify({ a: 'b c' });                   // 'a=b%20c'
new URLSearchParams({ a: 'b c' }).toString(); // 'a=b+c'
```

Both round-trip through their own parser, and both parse `+` as a space on the way in — but the bytes on the wire differ.

The `maxKeys: 1000` default is a denial-of-service guard: without it, a body of a million `a=1&` pairs builds a million-property object. `URLSearchParams` has no such limit, so cap the input length yourself before parsing untrusted data.

The null-prototype return value of `querystring.parse()` is a feature — prototype pollution via a `__proto__` key is impossible — but it means `result.hasOwnProperty` is `undefined`. Use `Object.hasOwn(result, key)`.

`querystring.escape()` and `querystring.unescape()` are exported so you can swap in a different codec (a legacy service sending GBK-encoded queries, say). `unescape()` falls back to a non-throwing decoder when `decodeURIComponent()` fails, which is why `querystring.parse('a=%')` returns `{ a: '%' }` instead of throwing.

## Internationalized domains, Punycode, and homographs

Host names on the wire must be ASCII. `español.com` is transmitted as `xn--espaol-zwa.com`, an encoding called **Punycode**. The `URL` constructor converts for you:

```js
const u = new URL('https://測試');
console.log(u.href);      // https://xn--g6w251d/
console.log(u.hostname);  // xn--g6w251d
console.log(u.origin);    // https://xn--g6w251d
```

For domains outside a URL, `node:url` exposes the conversion directly. Both return the **empty string** on invalid input rather than throwing:

```mjs
import { domainToASCII, domainToUnicode } from 'node:url';

domainToASCII('español.com');        // 'xn--espaol-zwa.com'
domainToASCII('中文.com');            // 'xn--fiq228c.com'
domainToASCII('xn--iñvalid.com');    // ''  <- invalid

domainToUnicode('xn--fiq228c.com');  // '中文.com'
```

Since v20.0.0 (and v18.17.0) these no longer require an ICU-enabled build.

### `node:punycode` is deprecated

The bundled `node:punycode` module is **[Deprecated]** under **DEP0040**, and has been since v7.0.0. It escalated to a runtime deprecation in v21.0.0 and to an *application* deprecation in v23.7.0 / v22.14.0, meaning the warning fires for your code but not for code inside `node_modules`. It will be removed in a future major version.

Do not use `punycode.toASCII()`, `punycode.toUnicode()`, `punycode.encode()`, `punycode.decode()`, or `punycode.ucs2` in new code. For domains use `url.domainToASCII` / `url.domainToUnicode`; for anything else install the userland `punycode.js` package. One practical difference: `punycode.toASCII()` performs a bare Punycode transformation, while `domainToASCII()` runs the full UTS-46 processing the URL Standard requires — which is why it rejects the invalid input above.

### Homograph attacks

Unicode contains characters that render identically to ASCII letters. `аpple.com` with a Cyrillic `а` (U+0430) is a different domain from `apple.com`, but on screen they are indistinguishable. Two rules follow:

1. **Compare and store the ASCII form.** Run every host through the URL parser (or `domainToASCII`) and compare `hostname` values, never the display form. `new URL()` has already done this for you — `u.hostname` is always the Punycode form.
2. **Display carefully.** If you echo a user-supplied URL back into a UI, either show the `xn--` form or apply the same mixed-script heuristics browsers use. Do not call `domainToUnicode()` on an untrusted host just to make it pretty.

The same logic covers a related trick: `。` (U+3002) is treated as a label separator, so `http://127.0.0.1。example.com/` parses with hostname `127.0.0.1.example.com`. Normalize first, then check.

## The legacy URL API, and why it is dangerous

`url.parse()`, `url.format(urlString)`, `url.resolve()`, and the `urlObject` shape they use are the **[Legacy]** API. The module section carries *Stability: 3 - Legacy*, but `url.parse()` and `url.resolve()` individually carry *Stability: 0 - Deprecated* under **DEP0169**, an application-level deprecation as of v24.0.0.

The docs are unusually blunt: the parser is lenient and non-standard, is prone to host name spoofing, and **CVEs are not issued for `url.parse()` vulnerabilities**. That last clause is the important one — a parsing bug there will not be treated as a security issue.

Here is what "non-standard host parsing" means concretely.

```js
const url = require('node:url');

url.parse('http://0x7f.1/').hostname;      // '0x7f.1'
new URL('http://0x7f.1/').hostname;        // '127.0.0.1'

url.parse('http://2130706433/').hostname;  // '2130706433'
new URL('http://2130706433/').hostname;    // '127.0.0.1'
```

`2130706433` is `127.0.0.1` as a 32-bit integer; `0x7f.1` is the same address in mixed hex/dotted form. The WHATWG parser normalizes IPv4 addresses per the standard — as does every HTTP client and the OS resolver. The legacy parser does not. So this SSRF guard is trivially bypassed:

```js
// VULNERABLE
const parsed = url.parse(userSuppliedUrl);
if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
  throw new Error('blocked');
}
await fetch(userSuppliedUrl);   // fetch normalizes; your check did not
```

The check compares against a string the parser never produces, and the request goes to loopback anyway. This class of bug is behind a long list of real SSRF reports.

Two more divergences in the same family:

```js
url.parse('https:example.com/').host;         // null  (the path is 'example.com/')
new URL('https:example.com/').host;           // 'example.com'

url.parse('https://example.com/../../etc').pathname;  // '/../../etc' (raw)
new URL('https://example.com/../../etc').pathname;    // '/etc'
```

The path one matters when you compare `pathname` against an allowlist and then pass the *original string* to something that does normalize.

One legacy behaviour has already been removed: `url.parse()` used to accept non-numeric ports such as `https://example.com:evil.com`. That was **DEP0170**, a runtime deprecation in v20.0.0 and **End-of-Life since v25.0.0** — it now throws. Do not rely on it either way.

`url.resolve(from, to)` is deprecated for the same reason (it calls `url.parse()` internally). The WHATWG replacement is a two-line function:

```js
function resolve(from, to) {
  const resolved = new URL(to, new URL(from, 'resolve://'));
  if (resolved.protocol === 'resolve:') {
    const { pathname, search, hash } = resolved;
    return pathname + search + hash;   // `from` was itself relative
  }
  return resolved.toString();
}
```

For existing codebases the Node project publishes a codemod:

```bash
npx codemod@latest @nodejs/node-url-to-whatwg-url
```

The last place people reach for `url.parse()` is reading a *path-only* string such as `req.url` in an HTTP server. Use a base instead — and note that `req.headers.host` is attacker-controlled, so if you only need the path and query, pass a fixed dummy origin:

```js
// req.url is '/search?q=cats' — a path, not an absolute URL.
const requestUrl = new URL(req.url, 'http://localhost');
const q = requestUrl.searchParams.get('q');
```

## Validating a user-supplied URL

Here is a validator that handles the cases above. It is deliberately strict; loosen it consciously, not by accident.

```js
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_HOSTS = new Set(['api.partner.example', 'cdn.partner.example']);

export function validateWebhookUrl(input) {
  const u = URL.parse(input);              // null instead of throwing
  if (u === null) return { ok: false, reason: 'unparseable' };

  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    return { ok: false, reason: `protocol ${u.protocol}` };
  }
  // Credentials in a URL are almost always an attack or a mistake.
  if (u.username !== '' || u.password !== '') {
    return { ok: false, reason: 'embedded credentials' };
  }
  // hostname is already lowercased and Punycode-encoded by the parser.
  if (!ALLOWED_HOSTS.has(u.hostname)) {
    return { ok: false, reason: `host ${u.hostname}` };
  }
  return { ok: true, url: u };
}
```

Three things make this work. It parses before it inspects, so it sees normalized values. It uses an **allowlist**, not a denylist — you cannot enumerate every spelling of `127.0.0.1`, but you can enumerate the two hosts you talk to. And it returns the parsed `URL`, so the caller sends `u.href` rather than the original string; otherwise a normalization gap between check and client reopens the hole.

### The SSRF checklist

If the URL will be *fetched by your server*, an allowlist of hosts is not always possible — "fetch the image at this URL" is a legitimate feature. Then you need all of this:

- **Parse with `URL`, never `url.parse()`.** Compare only parsed, normalized components.
- **Allowlist the protocol.** `http:` and `https:` only. Reject `file:`, `data:`, `gopher:`, `blob:`, and anything else.
- **Reject embedded credentials** (`username`/`password` non-empty).
- **Resolve the host to IP addresses yourself** and reject private, loopback, link-local, and unique-local ranges — `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (this covers cloud metadata at `169.254.169.254`), `::1`, `fc00::/7`, `fe80::/10`. `net.BlockList` does the range matching for you; see [Chapter 33 — TCP Sockets with `node:net`](33-tcp-net.md).
- **Close the DNS rebinding window.** Between your check and the request, the name can resolve differently. Pin the address: resolve once, validate the IP, then connect to that IP with the `Host` header set to the original name (or use a custom `lookup` function on the agent that returns your already-validated address). See [Chapter 34 — DNS Resolution](34-dns.md).
- **Do not follow redirects blindly.** Re-run the entire check on every hop, and cap the hop count.
- **Bound the response.** Timeout, maximum body size, maximum redirects.
- **Never echo the fetch error verbatim.** "ECONNREFUSED 10.0.3.7:8080" is a port scan result.

### Open redirects

Same root cause, different symptom. If you accept a `?next=` parameter and redirect to it, an absolute URL there sends your users to an attacker's site. The rule: **only ever redirect to a path you constructed yourself.**

```js
function safeNext(input, siteOrigin) {
  const u = URL.parse(input, siteOrigin);
  if (u === null || u.origin !== siteOrigin) return '/';
  return u.pathname + u.search;   // drop origin entirely; emit a relative URL
}
```

Comparing `origin` rather than `hostname` is deliberate: it covers scheme and port too, so `http://example.com` cannot be smuggled in where `https://example.com` was expected.


## File URLs

Converting between file system paths and `file:` URLs is its own topic: the naive `new URL(path, 'file:')` mishandles `#`, `%`, and Windows drive letters. Node provides `pathToFileURL()`, `fileURLToPath()`, and `fileURLToPathBuffer()`, covered in [Chapter 24 — Paths, File URLs, and Cross-Platform Layout](../part4-system/24-paths.md):

```js
new URL('/foo#1', 'file:');   // wrong:   file:///foo#1
pathToFileURL('/foo#1');      // right:   file:///foo%231
```

## Common mistakes

### ❌ Comparing `protocol` without the colon

```js
if (u.protocol === 'https') { /* never true */ }
```

`protocol` always includes the trailing colon, so this branch is dead code. If it guards a security check, the check never runs.

```js
// ✅
if (u.protocol === 'https:') { /* ... */ }
```

### ❌ Trusting `new URL(input, base)` to keep you inside `base`

```js
// An absolute `input` ignores the base entirely.
const target = new URL(userPath, 'https://api.internal/v1/');
await fetch(target);   // userPath = 'https://evil.test/' -> off you go
```

```js
// ✅ Verify the origin after parsing.
const base = 'https://api.internal';
const target = URL.parse(userPath, base + '/v1/');
if (target === null || target.origin !== base) throw new Error('bad target');
await fetch(target);
```

### ❌ Filtering hosts with `url.parse()`

```js
const { hostname } = require('node:url').parse(input);
if (PRIVATE_HOSTS.has(hostname)) throw new Error('blocked');
await fetch(input);
```

The legacy parser does not normalize IPv4 addresses, so `http://2130706433/` reaches loopback with `hostname === '2130706433'`. The client normalizes; your check did not.

```js
// ✅ One parser, and the request uses the parsed result.
const u = URL.parse(input);
if (u === null || !ALLOWED.has(u.hostname)) throw new Error('blocked');
await fetch(u.href);
```

### ❌ Assuming a query parameter appears once

```js
const id = new URLSearchParams(req.url.split('?')[1]).get('id');
```

`get()` returns the *first* value. For `?id=1&id=999` you validate `1` while a downstream service that reads the last value sees `999`. This is HTTP parameter pollution.

```js
// ✅ Decide explicitly.
const params = new URL(req.url, 'http://localhost').searchParams;
const all = params.getAll('id');
if (all.length !== 1) return badRequest('id must appear exactly once');
```

### ❌ Signing a URL and then reserializing it

```js
const signature = hmac(url.href);
url.searchParams.sort();     // rewrites '~' as '%7E'
send(url.href, signature);   // signature no longer matches the bytes sent
```

```js
// ✅ Freeze the string, then sign it.
url.searchParams.sort();
const href = url.href;
send(href, hmac(href));
```

## Production notes

- **Parsing is not free.** `new URL()` is native but not trivial; on a hot path, parsing the same URL in three middleware layers shows up in a profile. Parse once at the edge and pass the `URL` object down. `querystring.parse()` is measurably faster when you only need the query — that is the one case where the older API is the right call.
- **`maxKeys` is a real DoS control.** `querystring.parse()` stops at 1000 keys by default. `URLSearchParams` has no limit, and neither does the `searchParams` of a `URL`. If you accept query strings or form bodies of unbounded length, cap the byte length *before* parsing — a 1 MB query string of `a=&` pairs allocates hundreds of thousands of entries.
- **`URLSearchParams` iteration allocates.** Every `entries()` step yields a fresh two-element array, and `getAll()` re-scans the list on each call. Iterate once with `for (const [k, v] of params)`.
- **Normalize exactly once, at the boundary.** The recurring pattern behind URL security bugs is two components disagreeing about what a string means. Parse at the trust boundary, discard the original string, and pass the parsed object (or its `href`) downstream. Never validate one representation and transmit another.
- **Watch the deprecation clock.** `node:punycode` (DEP0040) fires a runtime warning today and will be removed. `url.parse()` / `url.format(urlString)` / `url.resolve()` (DEP0169) are application-level deprecations — they warn for your code, not for dependencies. Run your test suite with `--throw-deprecation` in CI to find call sites before an upgrade finds them for you.
- **`URLPattern` exists.** Added in v23.8.0, it provides browser-compatible pattern matching over URLs (`new URLPattern(...)`, `.test()`, `.exec()`). It is useful for routing tables, but it is new enough that you should check the stability index for the version you deploy on before depending on it.

## Exercises

1. **Component tour.** Print every `URL` property plus each `searchParams` entry for a URL given on `argv`. Run it against `https://a:b@例え.jp:8443/p%20q/../r?x=1&x=2#f`. Success: the output shows the Punycode hostname, the normalized path `/r`, both `x` values, and `origin` without credentials.

2. **Parser diff tool.** Read URL strings from stdin and print `hostname`, `pathname`, and `port` from both `url.parse()` and `new URL()`, flagging disagreements. Feed it `http://2130706433/`, `https:example.com/`, and `https://example.com/../x`. Success: at least three disagreements reported, and you can explain each.

3. **Safe fetcher.** Implement `fetchUserUrl(input)` applying the full SSRF checklist: protocol allowlist, no credentials, DNS resolution with private-range rejection, at most three redirects with the check re-applied per hop, a 5-second timeout, and a 1 MB response cap. Success: it rejects `http://169.254.169.254/`, `http://0x7f.1/`, and a URL that 302-redirects to `http://localhost:22/`.

4. **Query-string equivalence.** Write `canonicalQuery(str)` producing a comparable representation regardless of parameter order, `+` versus `%20`, and `~` versus `%7E`. Success: `canonicalQuery('b=2&a=x~y')` equals `canonicalQuery('a=x%7Ey&b=2')`.

5. **Codemod verification.** Take a module that uses `url.parse()`, `url.resolve()`, and `url.format(urlString)`, pin its behaviour with tests, run the `@nodejs/node-url-to-whatwg-url` codemod, and see which tests fail. Success: for each failure you can say whether the old or new behaviour is correct.

## Recap

- The WHATWG `URL` class is the only parser to use for anything security-relevant. It is a global, matches browsers, and normalizes hosts, IPv4 addresses, and paths.
- `protocol` includes a colon; `port` is a string and is empty for default ports; most setters ignore invalid input instead of throwing.
- `new URL(input, base)` does **not** confine the result to `base`. Always verify `origin` afterwards.
- Use `URL.parse()` (v22.1.0+) for a `null`-returning parse and `URL.canParse()` (v19.9.0+) for a boolean test, instead of `try`/`catch` around the constructor.
- `URLSearchParams` is an ordered list of pairs: duplicates are preserved, `get()` returns only the first, `set()` replaces in place, and `sort()` is stable.
- `node:querystring` is stable and faster, caps at 1000 keys, encodes spaces as `%20` rather than `+`, and returns a null-prototype object. `URLSearchParams` is standard and portable.
- `url.parse()`, `url.format(urlString)`, and `url.resolve()` are deprecated under DEP0169; CVEs are explicitly not issued for them. `node:punycode` is deprecated under DEP0040 — use `url.domainToASCII()` instead.
- Safe URL handling is one rule applied consistently: parse once at the trust boundary, allowlist protocol and host, transmit the parsed form.

## Where to go next

- [Chapter 33 — TCP Sockets with `node:net`](33-tcp-net.md) — `net.BlockList`, the tool for IP-range checks in the SSRF checklist.
- [Chapter 34 — DNS Resolution](34-dns.md) — resolving hosts yourself and pinning addresses against DNS rebinding.
- [Chapter 35 — HTTP/1.1 Servers](35-http-servers.md) — where `req.url` comes from and why `Host` is untrusted.
- [Chapter 36 — HTTP/1.1 Clients, Agents, and Keep-Alive](36-http-clients.md) — `urlToHttpOptions()` and custom `lookup` functions.
- [Chapter 24 — Paths, File URLs, and Cross-Platform Layout](../part4-system/24-paths.md) — `pathToFileURL()` and `fileURLToPath()`.
- [Chapter 63 — Upgrading Node.js: Deprecations and Migration](../part9-production/63-upgrading-node.md) — tracking DEP codes across releases.
- Official documentation: <https://nodejs.org/docs/latest/api/url.html>, <https://nodejs.org/docs/latest/api/querystring.html>, <https://nodejs.org/docs/latest/api/punycode.html>
