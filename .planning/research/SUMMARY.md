# Research Summary — GSD jj-port

**Project:** GSD jj-port — porting Get Shit Done from git to Jujutsu (jj) VCS while preserving full upstream feature parity.
**Domain:** Dual-backend VCS adapter for a worktree-heavy, hook-driven CLI/SDK toolkit (Node ≥22 / TypeScript ≥5 / pnpm 11 / vitest, ~30k LOC, ~80 git-touching tests, ~244 ad-hoc `execSync('git …')` call sites across 36 files).
**Researched:** 2026-05-09
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (this directory) + jj source at `/Users/LoganDark/Documents/Projects/jj`.

---

## Executive Summary

The decisive technical move — confirmed unanimously across all four research streams — is to **introduce a `VcsAdapter` seam first, migrate every git call site behind that seam with a 1:1 git-only backend, and only then land the jj backend** (Branch-by-Abstraction, Fowler). The repo has zero existing `execGit()` seam (244 raw `execSync('git …')` calls across 36 files), making adapter introduction the single largest leverage point of the entire port.

The recommended shape is a **frozen-object factory** (`createVcsAdapter()` returning `Object.freeze({...})`) living in `sdk/src/vcs/` (TypeScript-first, single source, CJS build artifact for `bin/lib/*.cjs` consumption), with namespaced sub-objects (`vcs.workspace.add(...)`, `vcs.hooks.fire(...)`), sync-default with targeted async, and a uniform `{exitCode, stdout, stderr}` triplet for byte-identical migration neutrality. The jj backend shells out to the `jj` CLI binary (no Node binding worth depending on; `agentic-jujutsu` and `jj-mcp-server` rejected), uses `-T 'json(self) ++ "\n"' --no-graph` NDJSON templates for parsing, defaults `--ignore-working-copy` for read paths, and translates git-shaped intents internally.

Roughly **75% of git operations are direct or near-direct map**, ~20% are semantic-shift (rebase/cherry-pick/branch — bookmarks don't auto-advance, rebase is conflict-tolerant), and ~5% have **no analog** (hooks, `.git/index.lock`, `git reset --soft`).

The dominant risks concentrate in five areas:
1. **Worktree↔workspace mapping** is design-heavy, not mechanical
2. **jj's auto-snapshot-on-every-command** silently mutates GSD state if `--ignore-working-copy` isn't the adapter default for read paths
3. **Interleaved git/jj mutations in colocated mode** silently produce divergent change IDs
4. **Hooks have no jj-native primitive** — three viable strategies need an ADR before code
5. **Upstream rebase tax** compounds quickly if fork edits land inline in hotspot files

---

## Stack Recommendations (HIGH confidence)

- **`jj` CLI binary ≥ 0.36 (recommended ≥ 0.40)** — only supported integration; 0.36 fixed colocated concurrency races, 0.31 added `json()` template, 0.34 made colocated default
- **`node:child_process`** (`execFileSync`/`spawnSync`/`spawn`) — argv-array invocation mandatory (jj revsets contain `()`, `::`, `&`, `~`, `"`); `maxBuffer` 64 MB or stream via `spawn`
- **`-T 'json(self) ++ "\n"' --no-graph`** — NDJSON output convention; verified locally on jj 0.40
- **TypeScript ≥ 5.7 / vitest ≥ 3.1** — matches `sdk/package.json`; single TS source with CJS build artifact in `dist-cjs/` (no hand-maintained twin)
- **Zero new npm dependencies** — repo has no exec wrappers today; `execa`/`agentic-jujutsu`/`jj-mcp-server` all rejected

**Mandatory jj invocation conventions:** `--repository <path>`, `--no-pager`, `--color never`, `--quiet`, `--ignore-working-copy` for all read paths, `JJ_USER`/`JJ_EMAIL` env when scripting, exit-code-only error contract.

---

## Operational Mapping

### Direct map (~75%, mechanical output-parsing work)

`status`, `diff`, `log`, `config`, `remote`, `fetch`, `push`, `init`, `clone`, `.gitignore`, `ls-files`, `blame`, lightweight `tag`.

### Semantic shift (~20%, adapter translates internally)

| git verb | jj equivalent | Note |
|----------|---------------|------|
| `commit -m`, `commit --amend` | `jj commit -m` (close+open) vs `jj describe -m` (message-only) | Per-call-site policy needed |
| `branch`, `checkout`, `switch` | `jj bookmark create` + `jj new`/`jj edit` | **Bookmarks don't auto-advance on commit** |
| `rev-parse`, `rev-list` | revset language; adapter exposes `RevisionExpr` primitive | Highest-leverage primitive — without it every call site duplicates `HEAD`→`@` translation |
| `rebase`, `cherry-pick`, `merge` | `jj rebase`, `jj duplicate`, `jj new -m … <parents>` | jj is **conflict-tolerant**; verify gate detects via `jj log -r 'conflict()'` |
| `worktree add/remove/list/lock` | `jj workspace add/forget/list` | `forget` does NOT delete dir; adapter owns filesystem lifecycle |
| `reset --hard` | `jj abandon @` + `jj new <ref>` | |
| `add`, `rm`, `mv` | mostly no-op (auto-tracking) | |

### No analog (~5%, designed from scratch — v1 risk)

- **Pre-commit hook** — jj has no native hook system
- **Pre-push hook** — adopt `acarapetis/jj-pre-push`
- **`.git/index.lock`** — jj is intentionally lock-free; need app-level advisory lock for GSD's stagger semantics
- **`git reset --soft`** — per-call-site audit; no clean decomposition

---

## Architecture Approach

### Adapter shape

Factory-returned frozen plain object (not class) — class-based adapters fight CJS/ESM dual-packaging and complicate mocking. Namespaced sub-objects: `vcs.workspace.*`, `vcs.refs.*`, `vcs.hooks.*`, `vcs.commit(...)`, `vcs.log(...)`.

### Module layout

- `sdk/src/vcs/types.ts` — authoritative `VcsAdapter` interface; locked in step 1
- `sdk/src/vcs/index.ts` — `createVcsAdapter()` factory + auto-detect (`.jj` first, `.git` fallback, `GSD_VCS` env override)
- `sdk/src/vcs/exec.ts` — single spawn wrapper, uniform `VcsExecError`, preserves `{exitCode, stdout, stderr}` byte-for-byte
- `sdk/src/vcs/hook-bridge.ts` — pre-commit/pre-push trigger primitive
- `sdk/src/vcs/parse/{git-log,git-status,jj-log,jj-status}.ts` — per-backend parsers
- `sdk/src/vcs/backends/{git,jj}.ts` — backend implementations
- `sdk/src/vcs/__tests__/adapter.contract.test.ts` — parameterized parity suite

TypeScript-first; CJS build artifact emitted to `dist-cjs/` for `bin/lib/*.cjs` consumers. **No hand-maintained CJS twin** — that's a divergence vector.

### Migration strategy: Branch-by-Abstraction (not Strangler Fig)

Inline `spawnSync('git', ...)` is *deep* in the SDK, so the seam isn't at the perimeter. Lock the interface before migrating any call site. 12-step migration spine in ARCHITECTURE.md.

### Test parameterization

`vitest`'s `describe.for([...BACKENDS])` + `test.extend({vcs, cwd})` fixtures. `describe.for` (not `test.each`) so beforeAll/afterAll run once per backend, not per case. `GSD_TEST_BACKENDS` env axis. Skip-count-CI-rule: skip count must not increase from `main`.

### Hooks: 3-tier strategy

- **Tier 1 (v1)**: colocated mode — git fires hooks; jj backend `vcs.hooks.fire` is a no-op
- **Tier 2 (followup)**: `jj-with-hooks` wrapper script (PATH shim)
- **Tier 3 (someday)**: op-log polling

---

## Critical Pitfalls (top 5 of 14)

1. **Auto-snapshot trap** — every default jj command snapshots working copy first; adapter MUST default `--ignore-working-copy` for read paths. Phase: Foundation.
2. **Colocated-mutation hazard** — interleaving mutating git and jj commands silently produces divergent change IDs. Adapter rule: jj backend never shells out to mutating git verbs; lint guard ships with adapter contract. Phase: Foundation.
3. **Workspace-mapping bug-history mismatch** — naive `git worktree`→`jj workspace` regresses `bug-2924/2774/3097/3099/2075/2431/2015/2388`. Only ~50% carry verbatim. Needs dedicated phase with semantic-equivalence table per bug class.
4. **Hook-strategy ADR-first** — three viable strategies; picking ad-hoc means re-litigating 2-3 times under dogfood pressure. ADR + swappable `Hook` interface before any code.
5. **Upstream-rebase tax** — inline edits to hotspot files (`core.cjs` 2036 LOC, `verify.cjs` 1390, `commands.cjs` 1028) maximize conflict surface; adapter-shaped changes rebase cleanly; sidecar files in `sdk/src/vcs/jj/` carry zero conflict surface; weekly cadence; track conflict count metric.

Full 14-pitfall catalog with phase mapping in PITFALLS.md.

---

## jj Convention Questions for User

These need explicit user lock-in before REQUIREMENTS.md is finalized. Each will pin behavior across the adapter; getting them in writing now prevents re-litigation under dogfood pressure.

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | `--ignore-working-copy` policy | Deny-by-default (set on every jj call; opt in to snapshot) / allow-by-default (current jj UX) | Deny-by-default |
| 2 | Bookmark-advance default on `vcs.commit()` | (A) mimic git auto-advance internally / (B) explicit `vcs.refs.advanceBookmark()` / (C) hybrid `vcs.commit({ advanceBookmark? })` | C (hybrid) |
| 3 | Hook trigger semantics | Pre-commit fires on (A) `jj commit` only / (B) both `jj describe` and `jj commit` / (C) `jj describe` only when message non-empty + always on `jj commit` | C |
| 4 | Multi-workspace lock granularity | (A) per-workspace sentinel / (B) per-shared-ancestor (revset-keyed) / (C) per-repo (coarse, safe) | C for v1; A/B if perf demands |
| 5 | Wrapper-command implementation language | sh (faster bootstrap) vs Node (~50ms startup, cleaner) | Node from start |
| 6 | jj minimum version pinning | Min 0.36 (safety floor) / Min 0.40 (recommended) / Min 0.41 (latest) | 0.40 |
| 7 | Bookmark naming conventions | (A) Mirror git: `phase-001-foo` / (B) Namespace: `gsd/phase-001-foo` / (C) Auto from change ID | B |
| 8 | Workspace layout | (A) siblings (current GSD git convention) / (B) subdir `.gsd-workspaces/...` / (C) configurable | A for v1 |
| 9 | `jj new` vs `jj describe` vs `jj commit` mapping for GSD commit primitive | (A) `jj commit` close+open / (B) `jj describe` message-only / (C) describe-then-new / (D) per-call-site policy | D (per call site) |
| 10 | Revset idiom for "current change" pointer | `@` working-copy / `@-` last finalized / named bookmark phase tip | Three-way split: `@-` for "last committed", `@` for "currently editing", named bookmark for "phase tip" |

---

## Roadmap Implications (9 phases — granularity will compress to ≤5 per user config)

The user chose **coarse granularity (3-5 phases, 1-3 plans each)** so the roadmapper will likely consolidate the 9 logical phases below into 4-5. Listed by logical groupings:

1. **Convention Lock + ADR Suite** — User answers Convention Questions; hook-strategy ADR; semantic-equivalence table for worktree ops; test-migration policy decision. No code yet.
2. **Adapter Foundation (git-only)** — `sdk/src/vcs/{types,exec,index,hook-bridge}.ts` + `backends/git.ts` 1:1 wrappers; CJS build target; type-leak audit script; lint rule "jj-backend-no-mutating-git". No call site changes.
3. **Test Parameterization Harness + Pilot** — `vcsTest(kind)` fixture + `describe.for([...BACKENDS])` config; `sdk/src/query/commit.ts` migrated as canonical template; CI rule "skip count does not increase from main"; runtime budget tracking.
4. **Bulk SDK + CJS Migration to git-only Adapter** — Rest of `sdk/src/query/*.ts`; `bin/lib/{core,verify,commands,worktree-safety,init,graphify,drift}.cjs`; type-leak audit re-run; first upstream rebase to verify mechanical hypothesis.
5. **jj Backend — Refs/Commit/Log/Status/Diff** — `sdk/src/vcs/backends/jj.ts` with `--ignore-working-copy` default, NDJSON parser, `JJ_USER`/`JJ_EMAIL` env, bookmark-advance per Convention Q2, commit-mapping per Q9, jj min-version check; CI matrix flipped on with jj-backend allowed-to-fail.
6. **Workspace Mapping (jj backend, design-heavy)** — `vcs.workspace.*` on jj; advisory-lock primitive per Q4; stale-working-copy probe in `vcs.beforeCommand`; bug-2924/2774/3097/3099/2075/2431/2015/2388 each triaged; init pre-flight check for nested git worktree.
7. **Hooks (jj backend, Tier 1 colocated-only)** — `vcs.hooks.fire` no-op-when-colocated; non-colocated returns "install jj-with-hooks shim per docs"; adopt/fork `acarapetis/jj-pre-push`; matrix test verb × backend × hook-strategy.
8. **CI Matrix Hardening + Workflow/Agent Prompt Rewrites** — Flip jj-backend from allowed-to-fail to required-blocking; rewrite 200+ git mentions in workflow/agent `.md` files; multi-runtime variants synced; README updated.
9. **Brownfield Dogfood + Greenfield Smoke** — BROWN-01 through BROWN-05 verified end-to-end on this repo's jj backend; GREEN-01 with init pre-flight; first weekly upstream rebase recorded.

### Research flags for plan-phase

**Need deeper research during `/gsd-plan-phase`:**
- Phase 5 (jj backend core) — validate jj `json()` schema stability across 0.40/0.41 for parser code; prototype op-log polling if hook ADR picks it
- Phase 6 (workspace mapping) — design-heavy; jj #8052 open; no widely-deployed prior art for AI-agent-driven multi-workspace jj wrappers

**Standard patterns (skip research):** Phase 2, 3, 4, 7, 8, 9.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Verified locally on jj 0.40 + against `docs.jj-vcs.dev` + GitHub releases API |
| Features | **HIGH** for documented commands; **MEDIUM** for behavioral edge cases; **LOW** for hook workarounds | Mappings cross-checked against multiple jj docs sources |
| Architecture | **HIGH** on adapter shape + migration sequencing; **MEDIUM** on jj-specific hook design | Branch-by-Abstraction is well-trodden; hook design has no widely-deployed prior art |
| Pitfalls | **MEDIUM-HIGH** | jj behaviors verified against official docs and tracking issues; "what bites in practice" is MEDIUM because the project category (automated multi-workspace hook-firing jj wrappers) has limited prior art |

**Overall: MEDIUM-HIGH.** Genuine uncertainty concentrated in (a) hook strategy choice — mitigated by ADR-first + swappable interface; (b) jj `json()` schema longevity — mitigated by snapshot tests + pinned min version; (c) workspace mapping design depth — mitigated by dedicated phase + per-bug triage.

---

## Gaps to Address During Planning

- `sdk/dist/` current emit shape (CJS / ESM / hybrid) — confirm in Phase 2 kickoff before `bin/lib/*.cjs` can require new module
- Empirical hook-firing behavior in colocated mode — does `.githooks/pre-commit` fire on `jj describe`, `jj commit`, `jj squash`? Phase 7
- `jj` binary discovery on user systems — `which jj` at construction with explicit error?
- Detached-HEAD analog on jj — `bug-2924-worktree-head-attachment` test design pass in Phase 6
- jj `json()` schema stability across versions — snapshot tests on parser output; hand-rolled templates as fallback if schema breaks
- **All ten Convention Questions** — must be locked by user before Phase 1 finalizes REQUIREMENTS.md
- Annotated tag handling in release flows — `vcs.gitOnly.createAnnotatedTag()` namespace or shell-out via colocation; decide in Phase 4
- Wrapper-recursion guard for hooks (Tier 2 follow-up) — env var `GSD_JJ_WRAPPER_DEPTH`; v1 hook interface should accommodate without breaking change
