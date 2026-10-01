---
chapter: 2
part: "Part I — Foundations"
title: "Installing Node, Release Lines, and Version Management"
level: beginner
reading_time: "26 min"
prerequisites: [1]
source_docs:
  - "doc/api/documentation.md"
  - "SECURITY.md"
  - "doc/api/process.md"
  - "doc/api/cli.md"
source_url: "https://nodejs.org/docs/latest/api/documentation.html"
node_baseline: "27.0.0-pre"
---

# Chapter 2 — Installing Node, Release Lines, and Version Management

**What you will learn**

- How Node.js releases work: Current, Active LTS, Maintenance LTS, the even/odd rule, and how long each line is supported.
- How to read the stability index correctly, including the three experimental sub-stages, so you can judge whether an API is safe to depend on.
- The realistic installation options — official installers, OS package managers, `nvm`/`fnm`/`volta`, Corepack, and Docker images — and when each is the right one.
- How to verify a download you did not get from a package manager.
- How to choose a version for a new project versus an existing one, and how to pin that choice so your machine, your teammates, and CI all agree.
- What the Node.js security release process looks like from the outside, and what it means for your upgrade cadence.

**Why this matters**

"Which version of Node should I use?" sounds like a trivial question until it costs you a weekend. Pick an odd-numbered release for a service you plan to run for two years and you will be forced to migrate within months. Pick a version older than your dependencies expect and your install fails on a peer range you cannot satisfy. Run a version that stopped receiving security patches and your next audit turns into an incident.

There is a subtler cost too. Node.js ships features at very different levels of commitment, and the documentation tells you exactly which is which — if you know how to read it. Building on a `1.0 - Early development` API should be a deliberate decision, not an accident. This chapter gives you the vocabulary and the mechanics to make both calls confidently.

## Release lines

Node.js ships a new **major** version every six months, on a fixed calendar: one in April and one in October. Which month you land in determines your version's entire future.

- **April releases get even numbers** (22, 24, 26). These become Long Term Support lines.
- **October releases get odd numbers** (23, 25, 27). These never become LTS.

That is the whole even/odd rule, and it is a scheduling artifact rather than a statement about quality. An odd release is not unstable — it is a fully supported release that simply has a short life, because it is where new work lands and gets exercised before an even release inherits it.

Every major passes through named phases:

| Phase | Duration | What it means |
|---|---|---|
| **Current** | ~6 months from release | Newest features land here. Semver-major changes are allowed at the next major only, but new APIs, new flags, and behavior refinements arrive continuously. |
| **Active LTS** | ~12 months (even majors only) | Feature-frozen apart from carefully backported, low-risk additions. Bug fixes, security fixes, and documentation improvements. This is where production should live. |
| **Maintenance LTS** | ~18 months (even majors only) | Critical bug fixes and security fixes only. Safe to stay on, but you are on the clock. |
| **End of Life** | — | No further releases, including security releases. Do not run this. |

Put those together and an even-numbered major has roughly a 36-month life: six months as Current, then 30 months of LTS. An odd-numbered major is Current for six months and reaches end of life a couple of months after the next even release takes over — call it eight months total.

A concrete walk-through with a recent line:

```text
Node.js 24.x
  April 2025    released as Current
  October 2025  enters Active LTS
  October 2026  enters Maintenance LTS
  April 2028    End of Life
```

The authoritative, always-current schedule lives in the `nodejs/Release` repository. Bookmark it; the dates above are the pattern, and the repository is the truth.

You can ask a running process which line it is on:

```js
console.log(process.version);       // e.g. 'v24.9.0'
console.log(process.release.lts);   // 'Krypton'-style code name, or undefined
```

`process.release.lts` is a string only for LTS releases and `undefined` for everything else, including Current. That single check is a reasonable guard in a startup banner or a deployment script:

```mjs
if (process.release.lts === undefined) {
  console.warn(`Running Node ${process.version}, which is not an LTS release.`);
}
```

### Which line should you actually run?

| Situation | Choose | Reason |
|---|---|---|
| Production service | Active LTS | Longest runway of feature-frozen, patched releases |
| Library published to npm | Test on Active LTS **and** Current | Your users are on both; catching breakage early is your job, not theirs |
| Trying a new language or runtime feature | Current | New APIs land here first |
| Existing app already on Maintenance LTS | Plan the jump to Active LTS now | Maintenance means the end date is visible |
| Anything on an End-of-Life line | Upgrade, urgently | No security releases at all |

The default answer for an application is: **the newest Active LTS**. The default answer for a library is: **support the LTS lines your users are on, and run CI against Current too**.

## Reading the stability index

Every section of the official API documentation carries a stability marker. Most readers glance past it. Do not — it is a contract, and the levels mean specific things.

| Level | Label | What it actually promises |
|---|---|---|
| **0** | Deprecated | The feature may emit warnings. Backward compatibility is **not guaranteed**. |
| **1** | Experimental | Not subject to semantic versioning rules. Non-backward-compatible changes or removal may occur in **any** future release. Not recommended in production. |
| **2** | Stable | Compatibility with the npm ecosystem is a high priority. This is what you build on. |
| **3** | Legacy | Unlikely to be removed and still covered by semver guarantees, but no longer actively maintained; alternatives exist. |

Level 1 is subdivided into three stages, and this is the part people get wrong:

| Stage | Label | Interpretation |
|---|---|---|
| **1.0** | Early development | Unfinished and subject to substantial change. Treat as a preview. |
| **1.1** | Active development | Nearing minimum viability. The shape is emerging but is not settled. |
| **1.2** | Release candidate | Hopefully ready to become stable. No further breaking changes are anticipated, but they may still occur in response to user feedback or evolution of the underlying specification. User testing and feedback are explicitly encouraged. |

Two consequences worth internalizing:

1. **Experimental features do not always graduate.** They leave experimental status either by becoming stable *or* by being removed — and removal can happen without a deprecation cycle. A `1.0` feature is not a promise of a future stable API.
2. **Legacy is not the same as deprecated.** A feature is marked Legacy rather than Deprecated when using it does no harm and it is widely relied on across the npm ecosystem. Bugs in Legacy features are unlikely to be fixed. `global` is the canonical example: it still works, it will keep working, and you should write `globalThis` in new code anyway.

The practical rule for library authors is stated plainly in the documentation: users may not realize an experimental feature is in play. If you depend on one inside a published package, gate it behind a flag or a runtime feature check, and say so in your README. A `1.2 - Release candidate` feature in an application you control and can redeploy is a reasonable bet. The same feature buried three levels deep in a dependency is how a minor Node.js upgrade breaks someone's build.

Throughout this book, first mentions of non-stable APIs are marked **[Experimental]**, **[Legacy]**, or **[Deprecated]** with the `DEPXXXX` code where one exists.

## Installing Node.js

There is no single right way to install Node.js. There is a right way *for your situation*.

### Official installers and binaries

`nodejs.org` offers platform installers (`.msi` for Windows, `.pkg` for macOS) and prebuilt tarballs for Linux, plus source. This is the simplest path and the correct one for a workstation where you only ever need one version, or for a locked-down build machine.

The downside is that switching versions means reinstalling, and the installer often places `node` where writing requires elevated permissions — which is why so many people end up running `npm install -g` under `sudo` and fighting file ownership forever.

### OS package managers

Homebrew, `apt`, `dnf`, `winget`, and Chocolatey all package Node.js.

```bash
brew install node@24
winget install OpenJS.NodeJS.LTS
```

Two traps. Distribution repositories often lag badly — the `nodejs` package in a stable Linux distribution can be years old, so use a dedicated Node.js repository. And an OS package is a *system* version shared by everything on the machine, which makes per-project pinning impossible.

### Version managers — the default recommendation for developers

If you work on more than one project, use a version manager. They install multiple Node.js versions side by side in your home directory and switch between them per shell or per directory.

| Tool | Platforms | Notes |
|---|---|---|
| **nvm** | macOS, Linux (a separate `nvm-windows` exists) | The original and most widely documented. Shell-function based, which makes shell startup slightly slower. Reads `.nvmrc`. |
| **fnm** | macOS, Linux, Windows | Rust implementation, much faster, same `.nvmrc` convention. A good default today. |
| **Volta** | macOS, Linux, Windows | Pins the toolchain in `package.json` itself and switches automatically when you `cd`. Also pins package managers and binaries. |
| **asdf / mise** | macOS, Linux | Manage many languages at once via a `.tool-versions` file. Good if your repo also needs a pinned Python or Go. |

A typical `fnm` or `nvm` workflow:

```bash
fnm install 24
fnm use 24
node --version
```

Commit a version file at the repository root so everyone — including CI — picks up the same version:

```text
24
```

Both `nvm` and `fnm` read that from `.nvmrc`. Volta instead records it inside `package.json`:

```json
{
  "name": "billing-api",
  "volta": {
    "node": "24.9.0"
  }
}
```

Whatever you use, also declare the supported range in `package.json` so npm can warn (or fail) on a mismatch:

```json
{
  "engines": {
    "node": ">=24.0.0 <25"
  }
}
```

### Corepack and package managers

Node.js ships with `npm`. It also ships **Corepack**, a shim manager that transparently installs and runs the package manager a project declares. Corepack is not enabled by default; you turn it on once:

```bash
corepack enable
```

After that, a project that declares its package manager gets exactly that version, regardless of what is installed globally:

```json
{
  "packageManager": "pnpm@9.12.0"
}
```

Running `pnpm install` in that directory downloads and uses pnpm 9.12.0. This removes an entire category of "works on my machine" bugs caused by lockfile format drift between package manager versions.

One security note, drawn straight from the project's own policy: Corepack downloads the software you ask for, and Node.js releases are not responsible for vulnerabilities in that downloaded software. Keeping the version in `packageManager` current is your job.

### Docker images

The official `node` images on Docker Hub are the standard base for containerized deployments.

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["node", "server.js"]
```

Tag conventions worth knowing:

| Tag shape | What you get |
|---|---|
| `node:24` | Full Debian base. Large, but includes build tooling for native addons. |
| `node:24-slim` / `node:24-bookworm-slim` | Debian without the extras. Good default for pure-JavaScript apps. |
| `node:24-alpine` | musl libc, very small. Beware: some native modules and some `Intl`/ICU behavior differ on musl. |
| `node:24.9.0-bookworm-slim` | Fully pinned. Use this in production; reproducibility beats convenience. |

Two rules for production images: pin the full version (not just the major), and add `USER node` so the process does not run as root. Chapter 60 covers container builds in depth.

### Verifying a download

If you fetch a tarball or installer directly rather than through a package manager, verify it. Every release directory on `nodejs.org` contains a `SHASUMS256.txt` file listing the SHA-256 hash of each artifact, plus `SHASUMS256.txt.sig`, a detached GPG signature made with one of the release signing keys published in the `nodejs/node` repository README.

The verification has two steps, and skipping either one defeats the purpose:

```bash
# 1. Verify the signature on the checksum file (proves the list is authentic).
gpg --verify SHASUMS256.txt.sig SHASUMS256.txt

# 2. Verify your artifact against the now-trusted list.
grep "node-v24.9.0-linux-x64.tar.xz" SHASUMS256.txt | sha256sum -c -
```

Checking the hash without checking the signature only proves the file matches a list that an attacker could also have replaced. Import the release keys once, from the official README, and the whole thing takes ten seconds.

## Choosing a version

### For a new project

Start on the newest **Active LTS**. You get the longest support window, the ecosystem has already caught up, and native addons have prebuilt binaries for it.

Then write the choice down in three places so it cannot drift:

1. `.nvmrc` (or `.tool-versions`, or the `volta` block) — controls what developers get.
2. `engines` in `package.json` — controls what npm warns or errors about.
3. The base image tag in your `Dockerfile`, or the `node-version` input in your CI workflow — controls what actually runs in production.

A mismatch between these is a classic source of "passes in CI, fails on deploy."

### For an existing project

Upgrading is a matter of moving one major at a time and reading the right documents.

1. **Find your current line's end-of-life date.** If it has passed, this is urgent, not optional.
2. **Read the changelog for each major you are skipping**, focusing on the "Semver-Major" sections.
3. **Check the deprecation list.** Every runtime deprecation warning you see today is a removal candidate tomorrow. Run with `--pending-deprecation` to surface warnings that are otherwise silent, and with `--throw-deprecation` in CI to turn them into hard failures you can fix at leisure.
4. **Check native dependencies first.** Pure JavaScript almost always survives a major upgrade. Native addons need a rebuild against the new ABI, and an unmaintained one can block the whole upgrade — find these before you start.
5. **Run the test suite on the new version in CI before switching the default.** A matrix build across your current version and the target version costs one config change and de-risks the whole migration.

Chapter 63 covers the upgrade process, deprecation codes, and migration strategy in full.

## The security release process

Understanding how Node.js handles vulnerabilities tells you how quickly you need to react when one is announced.

Reports go to the project through **HackerOne**. A report is normally acknowledged within 5 days, with a more detailed response within 10 days. If a reporter hears nothing within 6 business days, they can escalate to the OpenJS Foundation CNA. The project no longer runs a bug bounty program.

Once a report is validated, a primary handler coordinates the fix. The problem is checked against all supported Node.js versions, related code is audited for similar issues, and fixes are prepared for every supported release line — but **held privately**, not committed to the public repository, until the embargo lifts. A CVE is requested, and the embargo date is typically set 72 hours after the CVE is issued, though it can move depending on severity or the difficulty of the fix.

On the embargo date, three things happen close together: the security mailing list is notified, the patched builds go live on `nodejs.org`, and within six hours an advisory is published on the Node.js blog. CVE details often lag the release by a few days, because the reporter is given a day to disclose on HackerOne before the project forces disclosure, and HackerOne's approval process adds more time. **Do not wait for the CVE text to appear before patching.** The fix is already out.

To find out at the same time as everyone else, subscribe to the `nodejs-sec` Google group and watch `nodejs.org/en/blog/vulnerability`.

Two aspects of the threat model are worth knowing because they explain what will *not* be treated as a vulnerability:

- **Experimental platforms.** Node.js tiers its supported OS and hardware combinations. Issues that affect only an Experimental-tier platform are handled as ordinary bugs, and no CVE is issued.
- **Compile-time and V8 flags.** Features that require a special build flag, and V8 options such as `--js-staging`, are outside the documented API surface. Security issues that only affect them are treated as normal bugs.

Notably, **experimental *features* are not excluded**. A Stability 1 API is eligible for a security report and can receive the same severity score as a stable one. Experimental means "the API may change," not "the code is unguarded."

The operational takeaway: security releases arrive on all supported lines simultaneously and with no warning. Your ability to ship a patched Node.js version quickly — ideally by bumping one pinned tag and letting CI redeploy — is a real availability property of your system. Practise it before you need it.

## Common mistakes

### ❌ Deploying an odd-numbered release to production

It works, right up until it reaches end of life eight months later and you are doing an unplanned major upgrade under time pressure.

```dockerfile
# ❌ Node 25 is a Current release. It will never become LTS.
FROM node:25-slim
```

```dockerfile
# ✅ Pin a specific Active LTS patch release.
FROM node:24.9.0-bookworm-slim
```

### ❌ Treating "Experimental" as "new but fine"

Stability 1 means the API can change or vanish in *any* future release, including a patch release of your current line.

```mjs
// ❌ A 1.0 - Early development API in a library's public surface.
import { somethingBrandNew } from 'node:some-module';
export const helper = () => somethingBrandNew();
```

```mjs
// ✅ Feature-detect and provide a fallback, so a Node.js upgrade cannot break consumers.
let impl;
try {
  ({ somethingBrandNew: impl } = await import('node:some-module'));
} catch {
  impl = legacyImplementation;
}
export const helper = () => impl();
```

### ❌ Letting the version drift between your laptop, CI, and production

Three places declare the version. If they disagree, you will find out at the worst possible moment.

```yaml
# ❌ CI silently uses "whatever LTS means today" while .nvmrc says 22.
- uses: actions/setup-node@v4
  with:
    node-version: lts/*
```

```yaml
# ✅ Single source of truth, read from the file the team already edits.
- uses: actions/setup-node@v4
  with:
    node-version-file: .nvmrc
```

### ❌ Verifying only the checksum of a manual download

A hash that matches a file the attacker also controls proves nothing.

```bash
# ❌ Trusts SHASUMS256.txt implicitly.
sha256sum -c SHASUMS256.txt --ignore-missing
```

```bash
# ✅ Establish trust in the list first, then check the artifact against it.
gpg --verify SHASUMS256.txt.sig SHASUMS256.txt
sha256sum -c SHASUMS256.txt --ignore-missing
```

## Production notes

- **Pin the full version, everywhere.** `node:24` silently moves under you; `node:24.9.0-bookworm-slim` does not. Reproducible builds are worth the small cost of a dependency-bot pull request each month.
- **Budget the upgrade, don't defer it.** Moving from Active LTS to the next Active LTS every 12 months is routine work. Jumping three majors at once, from an End-of-Life line, is a project. The cheap path is the frequent one.
- **Alpine is not free.** musl libc changes native addon compatibility and can change `Intl` behavior depending on how the image was built. If you use `Intl` formatting, date/number localization, or native modules, validate on the exact image you will deploy — not on your macOS laptop.
- **Automate the security response path.** When a Node.js security release lands, the delta between "advisory published" and "our fleet patched" should be measured in hours. That means a pinned tag in one file, an automated rebuild, and a deployment you trust enough to run on a Friday.
- **Keep an eye on `process.release.lts` in your startup logs.** Printing the Node.js version, the LTS code name, and the V8 version at boot has saved more debugging sessions than it costs to write.
- **Native addons dictate your upgrade timeline.** Before promising a version bump, check every dependency that compiles C++ for prebuilt binaries on the target major. One unmaintained addon can pin you to an old line for months, and you want to discover that in planning, not in CI.

## Exercises

1. **Determine your line.** Write a script that prints `process.version`, `process.versions.v8`, `process.versions.uv`, `process.versions.openssl`, and whether `process.release.lts` is defined. *Success:* the script correctly reports whether you are on an LTS line, and you can state that line's expected end-of-life date from the release schedule.

2. **Pin a project three ways.** Take any existing project and add a `.nvmrc`, an `engines.node` range in `package.json`, and a pinned base image or CI `node-version-file`. *Success:* deliberately changing your shell to a different major produces a visible warning or failure from at least one of the three.

3. **Classify five APIs.** Pick five APIs you already use, find each one's section in the official documentation, and record its stability level — including the sub-stage for anything at level 1. *Success:* you can name at least one API you use that is not Stability 2, and describe what you would do if it changed.

4. **Rehearse a security upgrade.** Choose a containerized project, change only the pinned Node.js patch version, and take it through your full CI and deployment pipeline. Time it. *Success:* you have a measured, written-down number for how long an emergency Node.js patch takes you, and you know which step dominates.

## Recap

- Node.js releases a new major every six months: even-numbered majors in April become LTS, odd-numbered majors in October never do.
- A major spends ~6 months as Current; even majors then spend ~12 months in Active LTS and ~18 in Maintenance LTS, for roughly 36 months total. Odd majors reach end of life about eight months after release.
- Run the newest Active LTS in production; test libraries against both LTS and Current.
- The stability index has four levels — 0 Deprecated, 1 Experimental, 2 Stable, 3 Legacy — and Experimental has three sub-stages: 1.0 Early development, 1.1 Active development, 1.2 Release candidate. Experimental APIs are exempt from semver and may be removed without a deprecation cycle.
- Legacy means unmaintained but semver-protected; Deprecated means compatibility is not guaranteed at all.
- Use a version manager (`fnm`, `nvm`, Volta, `mise`) for development, pinned Docker tags for production, and Corepack plus `packageManager` to pin the package manager itself.
- Verify manual downloads in two steps: GPG-verify `SHASUMS256.txt.sig`, then check the artifact hash against the verified list.
- Security fixes are developed under embargo, released simultaneously across all supported lines, and announced before the CVE text is public — so patch on the advisory, not on the CVE.

## Where to go next

- [Chapter 3 — Running Code: Scripts, the CLI, and the REPL](03-running-code-cli-repl.md) — put your new installation to work.
- [Chapter 6 — Packages: `package.json`, exports, imports, dual publishing](06-packages-and-exports.md) — `engines`, `packageManager`, and the rest of the manifest.
- [Chapter 60 — Deployment, Containers, and Configuration](../part9-production/60-deployment-and-config.md) — production image and configuration practice.
- [Chapter 63 — Upgrading Node.js: Deprecations and Migration](../part9-production/63-upgrading-node.md) — the full major-version upgrade playbook.
- [Appendix E — Stability Index and Release Lines](../appendix/e-stability-and-releases.md) — quick reference.
- Official docs: <https://nodejs.org/docs/latest/api/documentation.html>
