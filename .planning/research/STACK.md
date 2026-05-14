# Stack Research — jj Integration for GSD VCS Adapter

**Domain:** Version-control adapter — invoking Jujutsu (jj) reliably from a Node ≥22 / TypeScript ≥5 / pnpm 11 / vitest CJS+ESM hybrid codebase.
**Researched:** 2026-05-09
**Local jj install verified:** `jj 0.40.0` (this repo)
**Latest stable jj:** **v0.41.0** — released 2026-05-07 (verified via GitHub API against `jj-vcs/jj`)
**Confidence:** HIGH on jj capabilities (verified locally + against current docs); HIGH on exec strategy (matches existing repo conventions); MEDIUM on hook design (jj has no native hooks — design space).

---

## TL;DR (the prescriptive answer)

1. **Do not use a Node binding for jj.** None of the candidates (`agentic-jujutsu`, `jj-mcp-server`, `jj-navi`) are appropriate dependencies for this codebase. **Shell out to the `jj` CLI binary** — same model GSD already uses for `git`, same constraint set, zero new heavy deps. (HIGH)
2. **Use Node's built-in `child_process` (specifically `execFileSync` / `spawnSync` for sync sites, `execFile` / `spawn` for async sites).** Do **not** add `execa`, `simple-git`-style wrappers, or shelljs. The repo has zero exec libraries today (`package.json` deps: `@anthropic-ai/claude-agent-sdk`, `ws`); adding one for jj-only would diverge from the git side and bloat install. (HIGH)
3. **Use `jj`'s template language with the `json()` function for all machine-readable parsing.** `jj log -T 'json(self) ++ "\n"' --no-graph` produces newline-delimited JSON (NDJSON) per revision; same for `jj op log -T 'json(self)'` and `jj workspace list -T 'json(self)'`. Verified locally on jj 0.40. (HIGH — verified by running locally)
4. **Require minimum jj 0.36** for the adapter's runtime contract — that's the version where colocated-repo concurrency races were fixed and concurrent `jj log` + mutating commands became safe. Recommend **jj 0.40+** as the supported floor since template-`json()` and op-log JSON serialisation matured through the 0.31 → 0.40 window. (HIGH on 0.36 race fix; MEDIUM on exact json() arrival version — Context7 unavailable, cross-checked against changelog summary.)
5. **There is no `.git/index.lock` analog in jj.** jj is intentionally **lock-free** — concurrent operations create divergent op-log heads that a subsequent command 3-way-merges automatically. The adapter's worktree-locking primitive (used in `worktree-safety.cjs`) needs **app-level** locking (e.g. a sentinel file under `.planning/.gsd-locks/` or a `proper-lockfile`-style advisory lock) — **not** a jj-level mechanism. (HIGH — confirmed via official `technical/concurrency` docs.)
6. **No native hook system in jj.** The HOOK-01/HOOK-02 work in PROJECT.md is genuine design work, not an integration of an existing primitive. Three viable approaches, in descending order of robustness: (a) **wrap the `jj` binary** (replace via `$PATH` shim that fires hooks then `exec`s real jj), (b) **op-log polling** (`jj op log -T 'json(self)' --at-op @ -n 5` after each adapter call to detect new ops), (c) **rely on git colocation** (good enough for HOOK-03 only — fails the non-colocated requirement in PROJECT.md). (MEDIUM — synthesised; jj does not document a "blessed" approach.)

---

## Recommended Stack

### Core: how the adapter invokes jj

| Component | Version | Purpose | Why |
|-----------|---------|---------|-----|
| **jj CLI binary** | ≥ 0.36 required, **≥ 0.40 recommended** | The only supported integration surface | jj has no in-process Node binding worth depending on. The CLI is the documented, stable, version-skewable contract. |
| **`node:child_process`** built-in | Node ≥ 22 (already required) | Process spawning for `jj` calls | Repo already uses raw `child_process.execSync('git …')` everywhere — same primitives for jj keep both backends symmetric and add zero new deps. The "Avoid heavy npm deps" constraint in PROJECT.md is explicit. |
| **`execFileSync` / `spawnSync`** | Node built-in | Argument-array invocation, no shell parsing | **Mandatory**: pass `jj` argv as an array (`execFileSync('jj', ['log', '-T', 'json(self)', '--no-graph'])`), never as a single shell string. Avoids quoting bugs in jj revsets/templates which contain `()`, `::`, `&`, `~`, `"`. |
| **`spawn`** (async, streaming) | Node built-in | For commands with large output (`jj log` over deep history, `jj op log`) | `execSync`/`execFileSync` buffer all stdout in memory before returning; `jj log` on a 30k-LOC repo can exceed default 1 MB `maxBuffer`. Use streaming `spawn` for unbounded output. |
| **TypeScript ≥ 5** (already required) | ≥ 5.7 (matches `sdk/package.json`) | Adapter type contract in `sdk/src/vcs/` | Matches existing constraint. Type the adapter's return shapes around the jj `json(self)` output schema so the git-side adapter must conform. |
| **vitest** (already required) | ≥ 3.1 (matches `sdk/package.json`) | Adapter parity tests across both backends | TEST-02 in PROJECT.md (parameterized backend matrix) maps cleanly to vitest `describe.each` / `test.each`. |

### jj-side flags & invocation conventions

| Convention | Example | Why |
|------------|---------|-----|
| **Always pass `--repository <path>` explicitly** | `jj --repository /path/to/repo log …` | Don't rely on cwd discovery — same discipline as `git -C`. Prevents picking up an outer `.jj/` ancestor when the adapter is invoked from a sub-repo or worktree path. |
| **Always pass `--no-pager`** | `jj --no-pager log …` | Otherwise jj invokes `$PAGER` / `less` when stdout is a TTY, which can happen under some test runners and CI matrices. |
| **Always pass `--color never`** for parsed output | `jj --color never log …` | Prevents ANSI escapes in stdout. The `json()` template avoids most of this but global color can still affect non-template stdout. |
| **Pass `--quiet` for command sites that must not print to stderr** | `jj --quiet new …` | jj prints status hints (e.g. "Working copy now at: …") to stderr by default. `--quiet` silences these for clean automation. |
| **Use `--ignore-working-copy` for read-only queries** | `jj --ignore-working-copy log …` | Default jj behaviour is to **snapshot the working copy at the start of every command** (this is one of jj's defining behaviours and a major correctness/perf footgun for adapters). For read-only queries, skip the snapshot — faster, no side-effects, no race against concurrent edits. |
| **Use `--at-operation @ --ignore-working-copy` for "what does the repo look like right now"** | `jj --at-op @ --ignore-working-copy st …` | Documented idiom from `jj op log --help`. Inspects current state without mutation. |
| **Use `-T 'json(self) ++ "\n"' --no-graph` for parsable output** | `jj log -T 'json(self) ++ "\n"' --no-graph -r '@-::@'` | Produces NDJSON. `--no-graph` strips the ASCII art column. Verified locally — emits stable structured fields (`commit_id`, `change_id`, `parents`, `description`, `author`, `committer`). |
| **Set `JJ_USER` / `JJ_EMAIL` in env when scripting commits** | `env: { ...process.env, JJ_USER: 'GSD', JJ_EMAIL: 'gsd@local' }` | jj refuses commits without identity. Mirrors how the git side respects `GIT_AUTHOR_*` env vars. |

### Exit-code & stderr contract (verified by inspection of jj `--help` and behavior)

- **Exit 0**: success.
- **Exit 1**: user-facing error (bad revset, missing path, conflict, etc.). Human-readable diagnostic on **stderr**, sometimes with hints.
- **Exit 2**: usage error (bad CLI flag).
- **Exit 255**: internal error / panic.
- **Stderr conventions**: jj prints **diagnostic and progress info to stderr by default** ("Working copy now at: …", "Concurrent modification detected, resolving automatically"), even on exit-0 success. The adapter must capture stderr separately and **not** treat non-empty stderr as failure — only the exit code is authoritative. (HIGH — verified by running commands locally.)

### Supporting libraries — explicitly NONE

The adapter should add **no** new dependencies. Below is the analysis of every candidate and why each is rejected:

| Candidate | Status | Why rejected |
|-----------|--------|--------------|
| `simple-git` (npm) | Active, mature for git | Git-only — no jj equivalent. Even on the git side, replacing 244 existing `execSync('git …')` call sites with a wrapper API is out of scope vs. the adapter abstraction (which is the actual leverage). |
| `nodegit` / `isomorphic-git` / `libgit2` bindings | Mature for git | Git-only. No jj-equivalent in-process binding exists for Node. |
| `agentic-jujutsu` (npm) | Published v2.3.6 ~5 months ago by `ruvnet` | **Reject.** Despite "production ready" labelling, marketing copy includes "QuantumDAG consensus", "AgentDB learning", "quantum-resistant signing (placeholder until v2.3.0)" — these are red flags for a vendored stack. Embeds the jj binary inside the npm package (size + version-skew issue). Single maintainer, AI-marketing surface. Unsuitable as a load-bearing dep. |
| `jj-mcp-server` (npm) | Active | Wrong shape — exposes jj as MCP tools for AI agents. GSD needs in-process Node calls, not an MCP daemon. |
| `jj-navi` (npm/crate) | Niche TUI helper | Not a programmatic API — workspace-orchestrator TUI focused. |
| `execa` (npm) | Active, popular | Would be a fine standalone choice — better Windows quoting, async-first, tree-kill on signal, structured errors. **However**: repo has zero exec libraries today and explicitly says "Avoid adding heavy npm deps". Adding `execa` only on the jj side splits conventions between backends. If the repo ever decides to standardise on `execa`, do it across both adapters in one move — out of scope for this milestone. |
| `proper-lockfile` (npm) | Mature advisory-lock library | Plausible for WS-02 (replacing `.git/index.lock` semantics in worktree-safety) — flagged for phase-level decision, not a stack-level recommendation here. The adapter could equally use a hand-rolled `O_EXCL` sentinel file. |
| `jj-lib` (Rust crate) / `gitoxide` | Internal jj/git Rust libs | Not Node — no FFI bindings shipped. Out of scope unless the project pivots to a NAPI-RS native module (which the constraints explicitly forbid). |

### Development tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `jj util config-schema` | Validate any jj config the adapter writes | Ships with jj — emits JSON schema for `~/.jjconfig.toml` and `.jj/repo/config.toml`. Useful in tests to assert config-write call sites produce valid TOML. |
| `jj util exec` | Run a command "via jj" — wraps git-equivalent ops | Niche; flag for HOOK-01 design — could be the wrap-point for hook firing on commit. |
| `jj util install-man-pages` | Not relevant to adapter | — |
| **CI: install jj via `cargo binstall jujutsu-cli` or release tarball** | Need a way to install jj in CI for adapter tests | The official release tarballs at `github.com/jj-vcs/jj/releases/download/v0.41.0/jj-*-{darwin,linux,windows}.tar.gz` are the cheapest path. Avoid `cargo install` (slow, requires Rust toolchain in CI). |

---

## Installation

No npm dependencies are added by this milestone. The only "install" change is documenting the jj binary as a runtime requirement for users who choose the jj backend.

```bash
# No new npm deps.
pnpm install   # unchanged

# jj binary (user-managed, like git):
#   macOS:    brew install jj
#   Cargo:    cargo install --locked jj-cli
#   Releases: github.com/jj-vcs/jj/releases (v0.41.0 latest as of 2026-05-09)
```

CI workflow addition (illustrative, not a code recommendation in this file):

```yaml
- name: Install jj
  run: |
    JJ_VERSION=v0.41.0
    curl -fsSL "https://github.com/jj-vcs/jj/releases/download/${JJ_VERSION}/jj-${JJ_VERSION#v}-x86_64-unknown-linux-musl.tar.gz" \
      | tar xz -C "$RUNNER_TEMP"
    echo "$RUNNER_TEMP" >> "$GITHUB_PATH"
    jj --version
```

---

## Alternatives Considered

| Recommended | Alternative | When the alternative would be better |
|-------------|-------------|--------------------------------------|
| Shell out to `jj` CLI | NAPI-RS binding to `jj-lib` (Rust) | If GSD ever needs sub-millisecond per-call latency and is willing to ship platform-specific prebuilt binaries. **Currently not justified** — git side is also CLI-shelled, parity matters more than speed. |
| Plain `child_process` | `execa` | If/when the repo decides to retroactively wrap *both* adapters and `bin/install.js` etc. — single coordinated migration, separate milestone. |
| `jj log -T 'json(self)'` | `jj log -T '<custom template>'` with hand-parsed delimiters | If the structured-output schema turns out to be too version-skewed (jj docs warn "field names and value types are usually stable but backward compatibility isn't guaranteed"). Hedge: pin jj minimum version, snapshot-test the JSON shape in CI, and consider hand-rolled templates for the smallest critical field set if `json()` schema breaks between jj versions. |
| App-level locking via sentinel file in `.planning/` | `proper-lockfile` npm dep | If hand-rolled `O_EXCL` proves fragile in cross-platform tests (Windows file-locking semantics). Defer to phase-level decision. |
| Op-log polling for hooks | Wrapping the `jj` binary via `$PATH` shim | If polling has unacceptable latency or misses operations. The shim approach is more robust but invasive (must coexist with user's own `jj` shell aliases). |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `agentic-jujutsu` npm package | Single-maintainer with AI-marketing surface ("QuantumDAG consensus"), embedded binary version-skew, not aligned with GSD's "thin shell-out, no heavy deps" posture. | Direct `child_process` + `jj` CLI. |
| `jj-mcp-server` | Wrong shape — MCP daemon for AI clients, not in-process Node API. | Direct `child_process`. |
| `child_process.exec(string)` (shell-parsed) | jj revsets contain `()`, `::`, `&`, `~`, `"` — shell parsing breaks. The git side has the same hazard but historically gets away with it; jj revsets exercise it more aggressively. | `execFileSync('jj', [...argv])` — argv array, no shell. |
| Default `maxBuffer: 1MB` on `execSync` | `jj log` on a 30k-LOC repo with deep history blows past 1 MB easily. | Either bump `maxBuffer` to `64 * 1024 * 1024` for bounded queries, or stream via `spawn` for `jj log` / `jj op log`. |
| Parsing jj's human-readable output (e.g. greping `jj log` graph chars) | The graph format and human output are explicitly **not** stable across versions. | Always pass `-T 'json(self) ++ "\n"' --no-graph` and parse NDJSON. |
| Treating non-empty stderr as failure | jj prints normal status messages to stderr ("Working copy now at: …") on successful runs. | Inspect exit code only; capture stderr for diagnostics. |
| Running `jj` commands without `--ignore-working-copy` for queries | Every default jj invocation snapshots the working copy first — slow, mutates op log, races concurrent edits. | `--ignore-working-copy` for queries; let mutations snapshot as normal. |
| Relying on `.git/index.lock`-style file locks at the jj layer | jj is intentionally lock-free; no analog exists. | App-level locking in adapter (sentinel file or `proper-lockfile`). |
| Pinning to jj < 0.36 | Concurrent-command race conditions in colocated mode. | Minimum 0.36, recommended 0.40+. |
| `jj git colocate` as the only hook strategy | Fails the non-colocated jj requirement (HOOK-01 in PROJECT.md must work without colocation). | Op-log polling or binary-wrapper shim for jj-native hooks; colocation handles the colocated-only HOOK-03 path. |

---

## Stack Patterns by Variant

**If the adapter is invoked from CJS (`bin/lib/*.cjs`):**
- Use `const cp = require('node:child_process')` — same idiom as the existing git-side calls.
- Prefer `execFileSync('jj', argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: {...process.env, JJ_USER, JJ_EMAIL}})`.
- Catch errors via try/catch — `execFileSync` throws on non-zero exit with `.status`, `.stderr`, `.stdout` on the error.

**If the adapter is invoked from TS (`sdk/src/vcs/`):**
- Use `import { execFile, execFileSync, spawn } from 'node:child_process'` plus `import { promisify } from 'node:util'` for an async wrapper.
- Type the adapter's return shapes against jj's `json(self)` schema. Generate TS types from a snapshot of the output (per-jj-version) rather than transcribing fields by hand.
- Vitest `describe.each([gitBackend, jjBackend])(…)` for the parity matrix per TEST-02.

**If the adapter is invoked from a hot path (e.g. `verify.cjs` running on every commit-ship):**
- Always pass `--ignore-working-copy` if the call doesn't need to materialise pending edits.
- Batch reads — one `jj log -T 'json(self) ++ "\n"' --no-graph -r '<revset>'` returning N revisions is dramatically cheaper than N individual `jj log -r <id>` calls.

**If the operation is mutating (commit, rebase, abandon):**
- Drop `--ignore-working-copy` (let jj snapshot first — that's correct).
- Keep `--no-pager --color never --quiet`.
- Don't try to undo with `.git`-style refs — use **`jj op restore <op_id>`** which the adapter should expose as a generic "undo last adapter mutation".

---

## Version Compatibility & Floor Rationale

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| jj | 0.36 | 0.40+ | 0.36 fixed colocated concurrency races; 0.31 added `json()` template fn; 0.34 made colocated default; 0.35 added per-workspace config; 0.40+ broadly de-risks template-`json()` schema for multiple commands. |
| Node | 22 | 22 | Repo constraint; uses built-in `node:child_process`. |
| TypeScript | 5.7 | 5.7+ | Matches `sdk/package.json` `^5.7.0`. |
| vitest | 3.1 | 3.1+ | Matches `sdk/package.json` `^3.1.1`. |
| pnpm | 11 | 11.0.8+ | Matches `package.json` `packageManager`. |

**Capability-by-version matrix (verified from CHANGELOG summary, MEDIUM confidence on individual version attributions — Context7 was unavailable, used `github.com/jj-vcs/jj/releases` and one cross-source webfetch):**

| Capability | First available |
|------------|----------------|
| `json(x)` template function | ~0.31 |
| Colocated repos default-on for `jj git init`/`clone` | 0.34 |
| Per-workspace config (`.jj/workspace-config.toml`) | 0.35 |
| Concurrent `jj log` + mutating commands safe in colocated mode | 0.36 |
| `--workspace` flag on config commands | 0.37 |
| Op-log workspace origin tracking | 0.38 |
| List manipulation in templates (`first()`, `last()`, `get()`) | 0.39 |
| `Stringify` expressions in templates | 0.40 |
| `replace()` with regex captures in templates | 0.41 |

---

## Confidence Levels (per claim)

| Claim | Confidence | Verification |
|-------|------------|--------------|
| jj v0.41.0 is current stable as of 2026-05-09 | **HIGH** | Direct `curl github.com/api/.../releases` + local `jj --version` showing v0.40 (one minor behind). |
| `jj log -T 'json(self)'` produces NDJSON with stable fields | **HIGH** | Run locally on this repo, output captured (sample in scratch). Caveat: docs say schema "isn't guaranteed across versions" — MEDIUM confidence on long-term stability. |
| jj is lock-free; no `.git/index.lock` analog | **HIGH** | Direct quote from `docs.jj-vcs.dev/latest/technical/concurrency/`. |
| jj has no native hook system | **HIGH** | Confirmed by absence in CLI reference + by community articles documenting workarounds. |
| `agentic-jujutsu` is unsuitable as a dep | **MEDIUM-HIGH** | Surface analysis only — no deep audit. But marketing surface ("QuantumDAG", "AgentDB") + single maintainer is enough to disqualify for a load-bearing adapter dep. |
| Minimum 0.36 for safe concurrent colocated ops | **HIGH** | Direct CHANGELOG quote: "It is now safe to continuously run e.g. `jj log` … while running other commands in another." |
| `json()` arrived in 0.31 | **MEDIUM** | Single source (changelog summary fetch). Worth verifying directly against the v0.31 release notes when first implementing — flag for phase research. |
| Op-log polling is a viable hook mechanism | **MEDIUM** | Synthesised from concurrency model; not a documented "blessed" pattern. Needs prototype validation in HOOK-01 phase. |
| Wrapping jj binary via `$PATH` shim is a viable hook mechanism | **MEDIUM** | Documented in community articles but not in official jj docs. Coexistence with user's own jj aliases/shims is a known concern. |

---

## Sources

- **Local verification (HIGH):**
  - `jj --version` → `0.40.0` on this repo, 2026-05-09.
  - `jj log -T 'json(self) ++ "\n"' -r @ --no-graph` produced valid NDJSON with stable fields.
  - `jj op log -T 'json(self) ++ "\n"' --no-graph` produced operation-log JSON.
  - `jj workspace list -T 'json(self) ++ "\n"'` produced workspace JSON.
  - `jj log --help` / `jj op log --help` / `jj workspace --help` / `jj util --help` all inspected for flag conventions.
  - GitHub releases API: `https://api.github.com/repos/jj-vcs/jj/releases` returned v0.41.0 dated 2026-05-07.
- **Official docs (HIGH):**
  - `https://docs.jj-vcs.dev/latest/technical/concurrency/` — lock-free design, op-log 3-way merge.
  - `https://docs.jj-vcs.dev/latest/operation-log/` — op-log semantics.
  - `https://docs.jj-vcs.dev/latest/git-compatibility/` — colocated-repo lifecycle.
  - `https://docs.jj-vcs.dev/latest/templates/` — `json()` and `escape_json()` template functions, `Serialize` type.
  - `https://docs.jj-vcs.dev/latest/cli-reference/` — global flag inventory.
- **Changelog summary (MEDIUM, single source for individual version attributions):**
  - `https://github.com/jj-vcs/jj/blob/main/CHANGELOG.md` — verified via WebFetch; cross-checked against GitHub releases listing.
- **Web search (MEDIUM):**
  - `cuffaro.com/2025-03-15-using-jujutsu-in-a-colocated-git-repository/` — colocated workflow.
  - `agentic-jujutsu` package surface from `npmjs.com/package/agentic-jujutsu` and `github.com/ruvnet/agentic-flow`.
  - `execa` posture from `github.com/sindresorhus/execa` and comparative `npm-compare.com` write-ups.
- **Repo-internal context (HIGH):**
  - `package.json` (root + `sdk/`) — confirms zero existing exec deps, Node ≥22, pnpm 11, TS 5.7, vitest 3.1.
  - `.planning/intel/git-touchpoints.md` — confirms 244 ad-hoc `execSync('git …')` call sites, no central seam.

---

*Stack research for: jj VCS adapter integration in GSD jj-port fork.*
*Researched: 2026-05-09. Local jj 0.40.0; latest jj 0.41.0 (released 2026-05-07).*
