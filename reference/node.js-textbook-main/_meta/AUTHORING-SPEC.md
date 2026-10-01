---
title: "Authoring Spec — Node.js: The Complete Guide"
---

# Authoring Spec — Node.js: The Complete Guide

Every chapter writer MUST follow this document exactly. Read it before writing.

## 0. What this book is

An original, authored **textbook** that takes a reader from "never used Node"
to "fully competent in a production environment." It is *not* a copy or a
reorganization of the official API reference. The official docs are the
**factual source of truth**; the book is **new explanatory writing** built on
top of them.

## 1. Source material and how to use it

Source docs (Node.js `main`, version **27.0.0-pre**) are staged read-only at:

    /mnt/user-data/uploads/document/node.js-documentation/doc/api/*.md

Some are very large (`fs.md` is 300KB, `crypto.md` 243KB). **Do not read whole
large files.** Use `grep -n`, `sed -n 'A,Bp'`, and `head` to pull only the
sections you need. Budget your reading.

**Critical rule on source use:**

- Use the docs to get facts right: exact API names, signatures, option names,
  parameter types, default values, error codes, version-added notes, and
  stability levels. Verify every identifier you write against the docs.
- **Write the prose yourself.** Do not paste or lightly reword paragraphs from
  the docs. Explanations, analogies, walk-throughs, and worked examples must
  be original writing aimed at a learner.
- Short API signature lines and small illustrative code you compose yourself
  are fine. Do not lift long example programs verbatim.
- If a fact is not in the docs and you are not certain of it, either omit it or
  mark it plainly. **Never invent an API, option, or flag.** A wrong method
  name is the worst failure mode for this book.

## 2. Language and code conventions

- **Prose language: English.** Clear, plain, professional. Explain jargon on
  first use. Assume the reader knows JavaScript syntax and basic programming,
  but assumes *nothing* about Node, servers, or systems programming.
- **Code: ESM first, CommonJS shown alongside** where the two differ
  meaningfully. Use the ` ```mjs ` / ` ```cjs ` fenced-block convention:

  ```mjs
  import { readFile } from 'node:fs/promises';
  ```

  ```cjs
  const { readFile } = require('node:fs/promises');
  ```

  When the code is identical in both systems (most function bodies), use a
  single ` ```js ` block and don't duplicate.
- Always use the **`node:` prefix** for builtin imports (`node:fs`, not `fs`).
- Prefer promise APIs (`node:fs/promises`, `timers/promises`) in main examples;
  show callback or sync forms when there is a real reason to use them.
- Code must be **runnable and correct**. No pseudo-code, no `...` elisions in
  the middle of something the reader is meant to run. Use realistic names.
- Shell commands go in ` ```bash ` blocks with a `$` omitted (just the command).

## 3. Version and stability discipline

- Baseline is Node.js **27.x (`main`)**. When an API is newer than Node 20 LTS,
  say so: "Available since v22.0.0."
- Always flag stability. Use these exact inline markers on first mention:
  - `**[Experimental]**` — may change or be removed
  - `**[Legacy]**` — still works, but do not use in new code
  - `**[Deprecated]**` — with the `DEPXXXX` code where the docs give one
- Where an API differs on Windows vs POSIX, say so explicitly. Many readers are
  on Windows.

## 4. Chapter file format

One file per chapter, at the path assigned to you. Start with YAML frontmatter,
exactly this shape:

```
---
chapter: 17
part: "Part III — Data and Streams"
title: "Character Encodings, StringDecoder, and Intl"
level: intermediate            # beginner | intermediate | advanced
reading_time: "25 min"
prerequisites: [16]            # chapter numbers, [] if none
source_docs:
  - "doc/api/string_decoder.md"
  - "doc/api/intl.md"
source_url: "https://nodejs.org/docs/latest/api/string_decoder.html"
node_baseline: "27.0.0-pre"
---
```

Then the body, in this order:

1. `# Chapter N — Title`
2. **What you will learn** — a 3–6 item bullet list of concrete capabilities.
3. **Why this matters** — 1–2 paragraphs of motivation grounded in a real task.
   Never generic filler.
4. The teaching body: `##` sections, `###` subsections. This is the bulk.
5. `## Common mistakes` — at least 3, each as a `### ❌ <the mistake>` followed
   by why it bites and a `✅` corrected snippet.
6. `## Production notes` — operational reality: performance, memory, security,
   failure modes, what changes at scale. At least 4 substantive bullets.
7. `## Exercises` — 3–5 tasks, ordered easy → hard. Each states the goal and
   the success criterion. Do not include solutions.
8. `## Recap` — 5–8 bullet takeaways.
9. `## Where to go next` — links to sibling chapters as relative markdown links
   (e.g. ``[Chapter 18 — Streams I](../part3-data/18-streams-concepts.md)``) plus
   the official doc URL.

## 5. Depth requirement

This book is meant to be **dense**. Target **2,000–3,500 words** of body per
chapter, plus code. A chapter that only lists what the API reference already
lists has failed. Every major API you cover needs:

- what problem it solves,
- a worked example the reader can run,
- the failure mode / gotcha that bites people,
- when to use it vs the alternative.

Include tables for option objects, flag lists, and comparisons. Tables are
encouraged and count toward density.

Use Mermaid diagrams (```mermaid fenced blocks) where a picture genuinely helps —
event loop phases, stream backpressure, cluster topology, TLS handshake. Do not
add decorative diagrams.

## 6. Cross-referencing

Chapters are numbered globally 1–63, plus appendices A–H. When you reference
another chapter, use the number and title and a relative link. The full chapter
list is in `OUTLINE.md` — consult it for exact filenames. Never invent a
chapter that isn't in the outline.

## 7. Tone

Direct and confident. Short sentences beat long ones. Say "use X" when X is the
right answer; say "avoid Y" and give the reason when it isn't. Do not hedge
everything. Do not pad. Do not write "In this section, we will..." — just teach.
