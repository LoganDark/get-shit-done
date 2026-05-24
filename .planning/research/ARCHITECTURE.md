# Architecture Research

**Domain:** GSD jj-port v1.4 — cleanup, deferred-item harvest, drift control
**Researched:** 2026-05-23
**Confidence:** HIGH (whole-repo concrete state; only "needs discuss-phase confirmation" calls noted inline)

---

## Scope

This document answers ONE downstream question: **for each of the seven v1.4 items, what files change, how do they integrate with v1.3 surfaces, and what's the build order?** It is NOT a green-field architecture study — every v1.3 component (`VcsAdapter` namespaces, jj/git composition sidecars, CLI bridges, workflow markdown, lint guards, CI lanes) already exists and is treated as fixed input. The roadmap consumer of this document needs (a) file-disjoint vs file-overlap groupings (= parallel-safe vs sequential phasing) and (b) the inter-item dependency DAG.

The seven items decompose into three architectural buckets:

| Bucket | Items | Architectural shape |
|--------|-------|---------------------|
| **Adapter surface extensions** | matchPrefix, idAlphabet, parallel.cancel | New methods on existing namespaces; same git+jj backend pair; same CLI bridge pattern |
| **Adapter surface rename** | rootCommits → rootRevisions | No new code; mechanical sweep across one types declaration + two backend impls + two production callers (+ ~6 tests) |
| **Workflow + drift control + recovery** | workflow call-presence lint, drift tests, orphan FS dir reap, PROJECT.md `### Validated` reconciliation | Lives outside the adapter — scripts/, tests/, workflow markdown, .planning/ prose |

The five v14-* tactical-cleanup todos overlay this map without changing it; they're file-scoped patches the roadmap will fold into phases by surface affinity.

---

## Standard Architecture (existing v1.3 state — fixed input)

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Workflow markdown layer                             │
│  get-shit-done/workflows/*.md  (89 files)  ── execute-phase.md, quick.md,   │
│                                                transition.md, …             │
│   → embed `gsd-sdk query <verb>` calls                                       │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────────┐
│                          CLI mediator layer                                  │
│   get-shit-done/bin/gsd-tools.cjs  ── routes legacy verbs to SDK             │
│   sdk/src/query/*.ts               ── one file per CLI verb (catalog +       │
│                                       manifest registration; envelope shape) │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────────┐
│                          VcsAdapter (TS interface)                           │
│   sdk/src/vcs/types.ts             ── VcsAdapter discriminated union         │
│                                       (VcsRefs, VcsBookmarks, VcsWorkspace,  │
│                                        VcsWorkspaceParallel, GitOnlyOps)     │
│                                                                              │
│   ┌────────────────────────────┐    ┌────────────────────────────┐           │
│   │ backends/git.ts            │    │ backends/jj.ts             │           │
│   │  (1:1 upstream baseline)   │    │  (squash-only, k-z change_id)│         │
│   └─────────────┬──────────────┘    └─────────────┬──────────────┘           │
│                 │                                  │                          │
│         ┌───────▼───────┐                  ┌───────▼───────┐                  │
│         │ git/parallel  │                  │ jj/parallel   │                  │
│         │ git/* helpers │                  │ jj/octopus    │                  │
│         │ (no jj imports)│                 │ jj/reap       │                  │
│         │                │                 │ jj/conflict-  │                  │
│         │                │                 │   paths       │                  │
│         │                │                 │ jj/incomplete-│                  │
│         │                │                 │   work        │                  │
│         │                │                 │ jj-id (alpha- │                  │
│         │                │                 │   bet helpers)│                  │
│         └────────────────┘                 └───────────────┘                  │
│                                                                              │
│   parse/, exec.ts, expr.ts, refs-validator.ts, format-migration/*            │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────────────────┐
│                  Repo invariants (lint + audit + CI)                         │
│   scripts/lint-vcs-no-raw-git.cjs       — whole-repo default-deny on git     │
│   scripts/lint-vcs-no-commit-id.cjs     — default-deny on commit_id leakage  │
│   scripts/audit-workflow-raw-git.cjs    — frozen 127-hit baseline guard      │
│   tests/inventory-counts.test.cjs       — INVENTORY.md headline ↔ filesystem │
│   tests/agents-doc-parity.test.cjs      — every agent has an INVENTORY row   │
│   .github/workflows/parallel-e2e.yml    — required-blocking on jj-colocated  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (existing — fixed)

| Component | Responsibility | Path |
|-----------|----------------|------|
| `VcsAdapter` interface | Cross-backend type contract; ONE revision concept (`commit_id` git / `change_id` jj); discriminated union with `gitOnly` only on git branch | `sdk/src/vcs/types.ts` |
| Git backend | 1:1 upstream baseline; raw-git via `execGit` only | `sdk/src/vcs/backends/git.ts` |
| Jj backend | Squash-only model; `--repository <cwd>` always-pinned; `gsd/` bookmark prefix munging | `sdk/src/vcs/backends/jj.ts` |
| Parallel composition (jj) | `octopus.ts` + `reap.ts` + `conflict-paths.ts` + `incomplete-work.ts` + `parallel.ts` — composed over backend primitives; UPSTREAM-02 sidecar discipline (never imports from `backends/jj.ts`) | `sdk/src/vcs/jj/*.ts` |
| Parallel composition (git) | `git/parallel.ts` only — wraps `worktree add` / `merge --no-ff` / `worktree remove` per-branch loop | `sdk/src/vcs/git/parallel.ts` |
| CLI bridges | One TS file per public `gsd-sdk query <verb>`; registered in `command-static-catalog-domain.ts` + `command-manifest.non-family.ts` + `command-aliases.generated.ts`; returns `{ data: … }` envelope | `sdk/src/query/*.ts` |
| Lints (repo invariants) | default-deny scanners over the whole repo with per-entry allowlists at `scripts/lint-*.allow.json`; shared `scripts/lib/allowlist-parser.cjs` | `scripts/lint-vcs-*.cjs` |
| One-shot audits | stdout-only (memory `feedback_avoid_jj_auto_tracked_output`); frozen-baseline regression model | `scripts/audit-*.cjs` |
| Drift-control tests | `node:test` framework, scan filesystem at runtime, compare to MD headline counts or per-row presence | `tests/*-doc-parity.test.cjs`, `tests/inventory-counts.test.cjs` |
| CI lanes | Standalone yaml per concern; `parallel-e2e.yml` required-blocking on jj-colocated via separate `*-gate` job | `.github/workflows/*.yml` |

### Existing CLI bridge catalog points (where new verbs register)

Any new SDK verb must touch ALL THREE registration sites:

| File | Role |
|------|------|
| `sdk/src/query/command-static-catalog-domain.ts` | `Map<canonical, handler>` + alias forms — `['workspace.parallel.dispatch', workspaceParallelDispatchQuery]`, plus `['workspace parallel.dispatch', …]` |
| `sdk/src/query/command-manifest.non-family.ts` | Per-verb `{canonical, aliases, mutation, outputMode}` — `mutation: true` for write verbs, `outputMode: 'json'` for structured returns |
| `sdk/src/query/command-aliases.generated.ts` | Generated alias map for dotted/spaced forms — `{canonical, aliases, mutation}` |

This three-site registration pattern is load-bearing; missing any one breaks `gsd-sdk query <verb>` resolution (workflow markdown calls fail at runtime).

---

## Per-Item Architecture Analysis

### Item 1 — `vcs.refs.idAlphabet` (cheapest; first to ship)

**Classification:** **New component** (one read-only property on `VcsRefs`).

**Files to change:**

| File | Change |
|------|--------|
| `sdk/src/vcs/types.ts` | Add `readonly idAlphabet: string` to `VcsRefs` interface (after the existing `currentBookmarks(): string[]` block, before `mergeBase`). JSDoc: "Backend-opaque character class enumeration — `'0-9a-f'` on git, `'k-z'` on jj. Consumed by `matchPrefix` and any caller that needs to do alphabet-aware short-prefix matching." |
| `sdk/src/vcs/backends/git.ts` | Add `idAlphabet: '0-9a-f'` to the `refs = Object.freeze({…})` block (around line 554). |
| `sdk/src/vcs/backends/jj.ts` | Add `idAlphabet: 'k-z'` to the equivalent `refs` Object.freeze block (around line 670+ — the namespace ends around 1017 with `remotes`). |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | Add a cross-backend `it()` asserting `vcs.refs.idAlphabet` is non-empty + matches the backend's known alphabet. (Existing fixture already runs both backends parameterized.) |

**Integration points:**

- The alphabet string is the contract input to `matchPrefix` (item 2 below). Locking it in first as a public property eliminates the back-and-forth question "what does jj's alphabet look like?" — the answer becomes literally `vcs.refs.idAlphabet`.
- v1.2 audit already empirically confirmed `k-z` (Plan 06-01 / A1 probe; `format-migration/rewrite.ts:56-63` carries the regex `/[k-z]{8,12}/`). The alphabet string is `'k-z'` (the regex's character-class body — caller composes the regex if they want one).
- Existing single-source-of-truth gap: today the `k-z` letter pattern is hard-coded in **four** independent locations (`expr.ts:41`, `format-migration/rewrite.ts:63`, `format-migration/rewrite.ts:339`, multiple test files). The architecturally correct move is to publish the alphabet via `vcs.refs.idAlphabet` and have those four call sites OPTIONALLY consume it — but doing the sweep in this phase risks scope creep. Leave the four-way duplication as a v1.4 known-deferred follow-up; just publish the symbol.

**Surface symmetry check:** ✓ both backends implement (`'0-9a-f'` git, `'k-z'` jj). The property is type-uniform (`string`) so no per-backend discriminant.

**Build-order role:** **Phase entry — blocks `matchPrefix` (item 2).** No upstream blockers.

**Needs discuss-phase confirmation:**
- Property shape — `string` vs typed enum (`type IdAlphabet = '0-9a-f' | 'k-z'`)? Tentative answer: keep `string` (matches the `idAlphabet` JSDoc framing as a `RegExp` character-class body; typed enum would force callers to switch on backend kind, defeating the unified-revision-model invariant). The discuss phase should confirm the property is **opaque** to callers (treat as raw input to a char-class regex, not a value to compare).

---

### Item 2 — `vcs.refs.matchPrefix(id, prefix): boolean` (consumer of item 1)

**Classification:** **New component** (one method on `VcsRefs`).

**Files to change:**

| File | Change |
|------|--------|
| `sdk/src/vcs/types.ts` | Add `matchPrefix(id: string, prefix: string): boolean` to `VcsRefs` interface. JSDoc: "Alphabet-aware short-prefix match — returns true iff `id` starts with `prefix` AND `prefix` contains only characters from `idAlphabet`. Rejects malformed prefixes (e.g. git-hex `abc` against a jj backend) by returning false rather than throwing." |
| `sdk/src/vcs/backends/git.ts` | Implement: `(id, prefix) => /^[0-9a-f]*$/.test(prefix) && id.startsWith(prefix)`. Place in the `refs = Object.freeze({…})` block alongside the new `idAlphabet`. |
| `sdk/src/vcs/backends/jj.ts` | Implement: `(id, prefix) => /^[k-z]*$/.test(prefix) && id.startsWith(prefix)`. Place in the equivalent jj refs block. |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | Add cross-backend `it()`s for: (a) exact match returns true, (b) too-short prefix returns true, (c) wrong-alphabet prefix returns false (a git-hex prefix against jj id, jj k-z prefix against git id), (d) empty prefix returns true. |

**Why not reuse `sdk/src/vcs/parse/jj-id.ts`:** `parse/jj-id.ts` is a `commitIdOf`/`changeIdOf` translator that shells out to `jj log`. `matchPrefix` is a pure-string check — no jj invocation. The two helpers solve different problems; reusing the file path would mislead readers about the shell-out boundary.

**Integration points:**

- Consumes `idAlphabet` from item 1, but does NOT call `vcs.refs.idAlphabet` at runtime — each backend hard-codes its own alphabet regex inline (mirrors the `validateRefname` precedent in `sdk/src/vcs/refs-validator.ts`, which doesn't pull patterns from the adapter). This is the "no closures over adapter state inside the per-backend implementation" rule — keeps the methods Object.freeze-able.
- The current site that ALMOST needs this (v1.2 TEST-13 deferral) is `tests/quick-md-parallel-dispatch.test.cjs` and the cmd-parallel-* test files, which today use `expect(handle.workspaces[0].baseRev).toMatch(/^[0-9a-f]{12}$/)` shape. Those are TESTS that work via the `toBeIdOf` custom matcher (v1.2 TEST-12 / `tests/__tools__/vitest-matchers.ts`). `matchPrefix` lands as the PRODUCTION-callable equivalent for SDK consumers that want a one-call alphabet-aware match without the cost of `toBeIdOf` machinery. The first production consumer is **TBD at planner judgment** — most concrete candidates: (a) the `format-migration/rewrite.ts` walker (currently uses raw regexes), (b) any future CLI bridge that takes a user-supplied prefix as a flag (none today).

**Surface symmetry check:** ✓ both backends implement; signature is type-uniform.

**Build-order role:** **Blocked by item 1 (`idAlphabet`).** No CLI bridge needed (it's a pure-TS read-only method; no workflow markdown calls it directly).

**Needs discuss-phase confirmation:**
- Returning `false` vs throwing on wrong-alphabet input. Tentative answer: **return false** (matches the `vcs.refs.exists` precedent, which returns `boolean` not throws on a missing ref). Throwing would force every caller to wrap in try/catch.
- Whether to add a `gsd-sdk query refs.match-prefix --id <…> --prefix <…>` CLI bridge. Tentative answer: **NO** in v1.4 (no production CLI consumer; add later when a workflow needs it). The unused CLI surface would be unmaintained cruft.

---

### Item 3 — `rootCommits` → `rootRevisions` rename

**Classification:** **Rename-only** (no semantic change; mechanical sweep).

**Files to change (full ripple):**

| File | Change |
|------|--------|
| `sdk/src/vcs/types.ts` | Line 363: rename `rootCommits(opts: { rev?: RevisionExpr }): string[]` → `rootRevisions(opts: { rev?: RevisionExpr }): string[]`. Update JSDoc to reflect the unified-revision-model framing ("returns root revisions — `commit_id` on git, `change_id` on jj"). |
| `sdk/src/vcs/backends/git.ts` | Line 526: rename `const rootCommits` → `const rootRevisions`. Update the `refs = Object.freeze({…})` registration (line 564). |
| `sdk/src/vcs/backends/jj.ts` | Line 964: rename `rootCommits: …` → `rootRevisions: …` in the refs Object.freeze. |
| `sdk/src/query/progress.ts` | Line 293: rename `vcs.refs.rootCommits({ rev: vcs.refs.head })` → `vcs.refs.rootRevisions(…)`. |
| `get-shit-done/bin/lib/commands.cjs` | Line 1005 + comment line 998: rename `statsVcs.refs.rootCommits` → `statsVcs.refs.rootRevisions`; update the comment "// countCommits / rootCommits / log({rev: …})". |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | Existing `rootCommits` tests: rename call sites (~3 occurrences). |
| `sdk/src/vcs/__tests__/git-backend.test.ts` | Existing test: rename call sites. |
| `sdk/src/vcs/__tests__/jj-skeleton.test.ts` | Existing test: rename call sites. |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` | Existing parity assertion: rename call sites. |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` | Existing jj-refs test: rename call sites. |
| `tests/__tools__/capture-vcs-baselines.cjs` | Baseline-capture helper: rename. |

**Integration points:**

- **No CLI bridge to rename** — the verified grep across `sdk/src/query/*.ts`, `sdk/src/query/command-aliases.generated.ts`, `command-static-catalog-domain.ts`, `command-manifest.non-family.ts` shows `rootCommits` has NEVER had a `gsd-sdk query root-commits` bridge. It's an SDK-internal method consumed only by `progress.ts` (the `progress` CLI verb's TS-internal call site) and `commands.cjs` (the legacy CLI runtime, which calls `createVcsAdapter` directly). This greatly simplifies the ripple — no workflow markdown to change, no agent prompts to update.
- **No `.planning/` prose references** — `rootCommits` doesn't surface in any `.planning/*.md` file under the audit (it's purely an SDK method name, not a recorded artifact).
- **Cross-namespace consistency check:** v1.2's `LogEntry.hash` → `LogEntry.id` precedent (FLIP-02) was a hard rename with no alias. The same hard-rename discipline applies here. The user-stated v1.2 precedent in `<milestone_context>` is correct.

**Surface symmetry check:** ✓ both backends rename in lockstep. Naming aligns with `countCommits` — should `countCommits` also rename to `countRevisions`? **Tentative: no** (counting commits-in-a-history is a stable concept regardless of revision-id model; the count is a non-negative integer, not a revision-id-shape value). But this is worth one bullet at discuss-phase.

**Build-order role:** **Should ship in its own plan within the same phase as items 1+2 OR earlier as a stand-alone phase.** Why: the rename touches `types.ts` + `backends/git.ts` + `backends/jj.ts` — the SAME three files items 1 and 2 touch. Doing it BEFORE 1+2 means 1+2 land against the renamed namespace already; doing it AFTER 1+2 means a second rebase across the same trio.

**Recommendation:** ship rename FIRST, then add `idAlphabet`, then `matchPrefix` — all in one phase, three sequential plans, each plan's diff is small + reviewable + lint-clean.

**Needs discuss-phase confirmation:**
- Whether `countCommits` also renames (cosmetic-bundle vs surgical-rename). Tentative: surgical — only `rootCommits` is recorded as v1.2 NAMING-01.
- Deprecation alias vs hard rename. Tentative: hard rename (matches v1.2 LogEntry precedent). The user-flagged v1.2 precedent in `<milestone_context>` confirms.

---

### Item 4 — `vcs.workspace.parallel.cancel(handle): CancelResult`

**Classification:** **New component** (one new method on `VcsWorkspaceParallel`; plus a new CLI bridge; plus new test files).

**Files to change:**

| File | Change |
|------|--------|
| `sdk/src/vcs/types.ts` | Extend `VcsWorkspaceParallel` interface (line 453-456) with `cancel(handle: ParallelDispatchHandle): CancelResult`. Add a new `CancelResult` type (mirrors `FanInResult` shape — `{abandoned: readonly string[], surplusBookmarks: readonly string[], surplusWorkspaces: readonly string[]}`). |
| `sdk/src/vcs/jj/parallel.ts` | New exported function `performJjParallelCancel(mainRepoRoot, handle): CancelResult`. Body: iterate `handle.workspaces`, for each call `jj workspace forget <name>` then `rm -rf <path>`; no octopus-merge involvement. Returns the abandoned-workspace name list + any surplus bookmarks. |
| `sdk/src/vcs/git/parallel.ts` | New exported function `performGitParallelCancel(mainRepoRoot, handle): CancelResult`. Body: iterate `handle.workspaces`, for each call `git worktree remove --force <path>` then `git branch -D worktree-agent-<agentId>`. Returns the abandoned-workspace name list + any surplus bookmarks (mirrors the existing `surplusBookmarks` accumulation pattern in `performGitParallelFanIn:539-568`). |
| `sdk/src/vcs/backends/git.ts` | Wire `parallel.cancel: (handle) => performGitParallelCancel(cwd, handle)` into the existing `parallel: Object.freeze({dispatch, fanIn, cancel})` block (line 738). |
| `sdk/src/vcs/backends/jj.ts` | Wire `parallel.cancel: (handle) => performJjParallelCancel(cwd, handle)` similarly (line 1257). |
| `sdk/src/query/workspace-parallel-cancel.ts` | **NEW FILE** — CLI bridge. Mirrors `workspace-parallel-fan-in.ts:1-130` shape: takes `--handle @file-or-stdin`, calls `vcs.workspace.parallel.cancel(handle)`, returns `{data: cancelResult}`. |
| `sdk/src/query/command-static-catalog-domain.ts` | Register `workspaceParallelCancelQuery` + the two alias forms (lines 21-22, 71-74 pattern). |
| `sdk/src/query/command-manifest.non-family.ts` | Register `workspace.parallel.cancel` with `mutation: true, outputMode: 'json'` (line 61-62 pattern). |
| `sdk/src/query/command-aliases.generated.ts` | Register `workspace.parallel.cancel` + dotted/spaced aliases (line 156-157 pattern). |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` | New describe block: `cancel — clean abandon`, `cancel — idempotent re-call`, `cancel — partial state recovery`. |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | Same describe block, mirrored for git. |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel.test.ts` | **NEW FILE** — cross-backend cancel contract tests (optional; the per-backend tests above may cover). |

**Integration points / semantic clarification (Phase 9 D-01 interaction):**

The user's flagged question in `<milestone_context>`:
> orchestrator awaits Agent() per Phase 9 D-01 — but cancel implies we want to interrupt mid-Agent

is **the key architectural question**. Three interpretations exist; v1.4 must pick ONE at discuss-phase:

| Interpretation | Semantics | Implication |
|----------------|-----------|-------------|
| **(A) Post-Agent abandon** | Cancel runs AFTER all `Agent()` promises resolve, INSTEAD of `fanIn`. Discards all agent work, cleans up workspaces. Use case: "the dispatched wave was wrong; abandon all of it". | No process-killing needed; pure workspace+bookmark cleanup. Aligns cleanly with the D-01 "orchestrator awaits Agent()" invariant. |
| **(B) Pre-Agent abandon** | Cancel runs BEFORE Agent() is invoked (e.g. dispatcher created workspaces, but the operator decided not to run agents). Same body as (A). | Same body as (A); the distinction is purely temporal. |
| **(C) Mid-Agent kill** | Cancel sends SIGTERM to the in-flight subagent processes, then runs (A)/(B) cleanup. | **Architecturally invasive** — requires orchestrator-tier process bookkeeping (the Handle doesn't carry PIDs), violates D-01's "no liveness probe" stance. |

**Tentative answer: ship (A)+(B) only.** Cancel becomes a top-level peer of `dispatch`/`fanIn`, takes the frozen Handle, and tears down workspaces+bookmarks. The "mid-Agent" case (C) is out of scope — operators kill subagents via Claude Code's own UI/CLI, then invoke `cancel` for the cleanup half.

This makes `cancel` architecturally symmetric to `fanIn`: same Handle input, same JSON envelope, same per-backend body file, same CLI bridge shape. The orchestrator workflow markdown doesn't need to change for v1.4 (cancel is a new SDK-facing surface; workflows can adopt it in a later milestone).

**Surface symmetry check:** ✓ both backends implement; `CancelResult` shape is uniform; no per-backend discriminant in the return type.

**Build-order role:** **Independent of items 1/2/3.** Touches the same `types.ts` + `backends/*.ts` files, but the diff is additive (new method, no rename). Can ship in the same phase as the matchPrefix/idAlphabet/rename triple, but in a separate plan (file-overlap on types.ts → sequential plan ordering within the phase, NOT parallel-safe).

**Needs discuss-phase confirmation:**
- Pick (A)+(B) vs (C). Strongly tentative: (A)+(B).
- Whether `cancel` should also `rm -rf` the `.claude/jj-workspaces/phase-{N}-subagent-*` FS dirs on jj (overlap with item 7 below). Tentative answer: **yes** — cancel is the dispatcher's cleanup verb, so it should own the FS-dir reap that fan-in's success path is missing. This makes item 7 partially solved by item 4; the remaining v14-orphan-jj-workspace-dirs work shifts to (a) extending `performJjParallelFanIn`'s success branch with the same `rm -rf` AND (b) adding the same to `scripts/dogfood-restore.sh`.

---

### Item 5 — Workflow call-presence lint

**Classification:** **New component** (one new script + JSON allowlist + CI wiring).

**Files to change:**

| File | Change |
|------|--------|
| `scripts/lint-vcs-parallel-call-presence.cjs` | **NEW FILE** — mirrors `lint-vcs-no-raw-git.cjs:1-165` shape. Scans `get-shit-done/workflows/*.md` for bash/sh/zsh fences containing the dispatch trigger phrases (e.g. `Agent(` with `isolation="worktree"`) and asserts each such block contains a `gsd-sdk query workspace.parallel.dispatch` call OR is on the per-file allowlist. **Mode:** default-deny on dispatch-containing files; explicit allowlist for files that legitimately do NOT call dispatch (e.g. sequential-only orchestrators like `progress.md`). |
| `scripts/lint-vcs-parallel-call-presence.allow.json` | **NEW FILE** — per-entry `{path|glob, reason, owner}` schema (consume via `scripts/lib/allowlist-parser.cjs` per v1.2 D-03/D-04 / `feedback_solo_dev_no_expires` memory). Initial entries: workflows that spawn agents but NOT in worktree mode. |
| `tests/lint-vcs-parallel-call-presence.test.cjs` | **NEW FILE** — fixture-based unit test. Two fixtures: (a) workflow with `Agent(isolation="worktree")` + valid `workspace.parallel.dispatch` call → passes; (b) workflow with `Agent(isolation="worktree")` + NO `workspace.parallel.dispatch` → fails. Mirrors `tests/lint-vcs-no-raw-git-fixture.test.cjs` (the existing fixture test) via the `--scan-root` flag pattern. |
| `package.json` | Add `npm run lint:parallel-call-presence` script alongside the existing `lint:vcs` scripts. |
| `.github/workflows/parallel-e2e.yml` | Add a new step `Lint — workflow call-presence` between the SDK build and the harness (mirrors the `audit-workflow-raw-git.cjs` step at line 125-127). Required-blocking via the existing `parallel-e2e-gate` job (no separate gate needed). |

**Why CI lane (not pretest):** the lint scans workflow markdown — a surface that only `parallel-e2e.yml` already gates. Adding to pretest would force every test run to scan every workflow .md, slowing the inner loop without proportional benefit. The audit-workflow-raw-git.cjs precedent (D-07 — "one-shot / CI-06-only") confirms this is the architectural pattern.

**Pattern match against `lint-vcs-no-raw-git.cjs`:**

| Element | Pattern source (line) | New lint adaptation |
|---------|----------------------|---------------------|
| Default-deny scanner | lint-vcs-no-raw-git.cjs:142-164 | Same exit-code-1 on violation flow |
| Per-entry allowlist | lint-vcs-no-raw-git.cjs:43-50 (via `parseAllowlist`) | Same `{path|glob, reason, owner}` schema |
| `--scan-root` flag | lint-vcs-no-raw-git.cjs:32-38 | Same flag for fixture testing |
| Inline escape annotation | lint-vcs-no-raw-git.cjs:54 (`vcs-lint:allow-git-here`) | New `vcs-lint:allow-parallel-call-absent <reason>` |
| `SCAN_EXT` regex | lint-vcs-no-raw-git.cjs:63 | New regex limited to `.md` (different from raw-git's source-file scope) |
| Stdout-only output | lint-vcs-no-raw-git.cjs:147-159 (process.stderr for errors) | Same (memory `feedback_avoid_jj_auto_tracked_output`) |

**Interaction with `audit-workflow-raw-git.cjs` (the existing baseline-regression model):**

The two are orthogonal:

- `audit-workflow-raw-git.cjs` = "no NEW raw-git ADDED to workflow markdown" (negative invariant; baseline-regression).
- `lint-vcs-parallel-call-presence.cjs` = "every dispatch-shaped workflow CALLS the adapter verb" (positive invariant; default-deny).

They can ship as a single PR — both wire into `parallel-e2e.yml` at adjacent steps. No interaction between them at runtime.

**Surface symmetry check:** N/A (not adapter code; pure invariant tooling).

**Build-order role:** **Independent of items 1-4.** Can run in parallel with the adapter-surface phase (file-disjoint — `scripts/lint-vcs-parallel-call-presence.cjs` doesn't overlap `sdk/src/vcs/*.ts`).

**Needs discuss-phase confirmation:**
- Default-deny vs default-allow with explicit deny markers. Tentative: default-deny on dispatch-shaped files (mirrors `lint-vcs-no-raw-git.cjs`'s posture; allowlist becomes the explicit "this workflow doesn't dispatch" record).
- Scan trigger — `Agent(isolation="worktree")` text vs another marker. Tentative: scan for the `<dispatch_block>` markdown comment (introduce as a normative marker) OR the literal `isolation="worktree"` string. The latter is more brittle but requires no workflow-md edits.

---

### Item 6 — Drift-control tests

**Classification:** **New component** (two new `tests/*.test.cjs` files).

**Files to change:**

| File | Change |
|------|--------|
| `tests/architecture-counts.test.cjs` | **NEW FILE** — scans `docs/ARCHITECTURE.md` (and `docs/{ja-JP,ko-KR,pt-BR,zh-CN}/ARCHITECTURE.md` when they exist; `zh-CN` currently does not) for prose count claims, asserts each matches the live filesystem count. Specific scans: (a) `~N commands` claims → assert against `commands/gsd/*.md`, (b) `~N workflows` claims → assert against `get-shit-done/workflows/*.md`, (c) `~N agents` claims → assert against `agents/gsd-*.md`, (d) `~N lib modules` claims → assert against `get-shit-done/bin/lib/*.cjs`, (e) `~N lines` claims for `bin/install.js` → assert against `wc -l`. |
| `tests/command-count-sync.test.cjs` | **NEW FILE** — asserts `docs/INVENTORY.md` Commands table headline count == `ls commands/gsd/*.md | wc -l`. Mirrors `tests/inventory-counts.test.cjs:36-65` shape but specifically for commands (called out by docs-update audit theme 6). |

**Files reconciled by the new tests forcing the fix:**

| File | Drift to fix |
|------|--------------|
| `docs/ARCHITECTURE.md` | (Currently uses prose like "Total commands: see INVENTORY.md" — no hard-coded counts, so it's safe; the test scans for `~N` literal patterns and skips if no match.) |
| `docs/ja-JP/ARCHITECTURE.md` | Line 351: `42 workflow definitions` → 89; line 354: `15 agent definitions` → 33; line 427: `約3,000行` → ~10,978. |
| `docs/ko-KR/ARCHITECTURE.md` | Line 427: `~3,000줄` → ~10,978. (And any other counts surfaced by the scan.) |
| `docs/pt-BR/ARCHITECTURE.md` | Same scan; same fix pattern. |

**Test framework choice — `node:test` (in `tests/`), not vitest (in `sdk/src/__tests__/`):**

| Criterion | `tests/` (node:test) | `sdk/src/__tests__/` (vitest) |
|-----------|---------------------|------------------------------|
| What the user-flagged peer files use (`tests/inventory-counts.test.cjs`, `tests/agents-doc-parity.test.cjs`) | ✓ same framework | ✗ |
| Cross-workspace scan (commands + workflows + agents + lib + docs) | ✓ natural at repo root | Awkward — must `path.resolve('../../docs/…')` from sdk/ |
| Speed (memory `project_test_perf_pain_vitest`: "sdk/ vitest is the slow suite") | ✓ avoids the slow suite | ✗ pollutes the slow suite |
| Discovery via `scripts/run-tests.cjs` | ✓ already recursive post-Phase 13 CI-06 fix | ✓ same harness |

**Conclusion: `tests/` is unambiguously correct.** Both new tests use `node:test` + `node:fs` (no vitest, no fixtures, no subprocess shell-outs).

**Scan source-of-truth for the test bodies:**

```javascript
// Pattern A — read MD, extract prose count via regex, compare to fs count
const md = fs.readFileSync('docs/INVENTORY.md', 'utf8');
const m = md.match(/^##\s+Commands\s+\((\d+)\s+shipped\)/m);
const actual = fs.readdirSync('commands/gsd').filter(f => f.endsWith('.md')).length;
assert.strictEqual(parseInt(m[1], 10), actual);

// Pattern B — for ARCHITECTURE.md prose counts (varies per translation)
const md = fs.readFileSync('docs/ja-JP/ARCHITECTURE.md', 'utf8');
// scan for "(\d+) workflow", "(\d+) agent", etc.
for (const claim of md.matchAll(/(\d+)\s+(workflow|agent|command|lib module)/g)) {
  const claimedCount = parseInt(claim[1], 10);
  const actualCount = countMap[claim[2]];
  assert.strictEqual(claimedCount, actualCount, `${claim[2]} drift in ja-JP`);
}
```

The exact regex source-of-truth varies per translation file (Japanese, Korean, Portuguese all have slightly different prose forms). The test body iterates known files + known claim patterns.

**Integration points:**

- The test files MUST be added BEFORE the prose-count fixes land (otherwise the fixes are unverified). Test-driven: write the test, watch it fail, fix the prose, watch it pass.
- INVENTORY.md already claims these test files exist (theme 6 of v14-docs-verify-only-followups). Adding them resolves that doc-verify failure as a side-effect.

**Surface symmetry check:** N/A (test files, not adapter code).

**Build-order role:** **Independent of items 1-5.** Can run in any phase, file-disjoint. **Should ship BEFORE the ARCHITECTURE.md prose-count fixes** (they're the verification gate).

**Needs discuss-phase confirmation:**
- Whether to fold `command-count-sync.test.cjs` into the existing `inventory-counts.test.cjs` (which already covers Commands). Tentative: ship as a separate file (the doc-verify-only audit specifically called out two missing files; honor the names; cross-link via a comment).

---

### Item 7 — `v14-orphan-jj-workspace-dirs` reap

**Classification:** **Modified existing** (extends two existing surfaces — `jj/parallel.ts` and `scripts/dogfood-restore.sh`).

**Files to change:**

| File | Change |
|------|--------|
| `sdk/src/vcs/jj/parallel.ts` | Extend `performJjParallelFanIn`'s **clean-path branch** (line 405-429 — the `else` after `if (conflicted)`) with a per-workspace `rmSync(ws.path, {recursive: true, force: true})` loop. **Do NOT** add to the conflicted branch (the user explicitly leaves those workspaces on disk for inspection per the W3 (a) joint-assertion contract at line 388-404). |
| `sdk/src/vcs/git/parallel.ts` | The git side already does per-success `git worktree remove <path>` inside the loop (line 434+) — `worktree remove` natively rm's the on-disk dir. **No change needed** unless the `--force` flag is added (it's currently non-force per D-04). Confirm via a regression test that the on-disk path is gone after fanIn. |
| `scripts/dogfood-restore.sh` | Append a final cleanup step `find .claude/jj-workspaces -maxdepth 1 -type d -name 'phase-*-subagent-*' -exec rm -rf {} +` (idempotent — no-op when dirs don't exist). Document the asymmetry between `jj op restore`'s VCS-rollback and the orphan FS dirs that live outside jj's content-addressed view. |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` | New assertion in the existing fanIn-success test: `assert(!existsSync(ws.path))` for every workspace after fanIn returns. |
| `sdk/src/vcs/__tests__/dogfood-restore.test.cjs` (or equivalent) | New test: simulate `jj op restore` + orphan dir survival; assert the script's cleanup step removes the dirs. (May fold into an existing dogfood-restore test if one exists.) |

**Interaction with item 4 (`cancel`):** if item 4 is in scope AND `cancel` also reaps FS dirs (as recommended above), then `cancel` covers a third surface that orphan FS dirs can survive on. Three surfaces:

| Surface | Owns FS-dir reap | When |
|---------|------------------|------|
| `performJjParallelFanIn` success branch (item 7) | ✓ NEW | Normal clean fan-in |
| `performJjParallelFanIn` conflicted branch | ✗ INTENTIONAL — preserves for inspection | Conflict needs human review |
| `performJjParallelCancel` (item 4) | ✓ NEW | Operator abandons the wave |
| `scripts/dogfood-restore.sh` (item 7) | ✓ NEW | Post-`jj op restore` recovery |

The architecture is **multi-surface ownership** — every cleanup path that touches the workspaces owns the FS-dir reap. This eliminates orphan dirs regardless of which exit path the operator takes.

**Surface symmetry check:** The git side already self-cleans (per-success `worktree remove`); the jj side needs three new reap call-sites because jj's `workspace forget` is metadata-only and doesn't touch the on-disk dir. **Asymmetry is load-bearing** — git's `worktree remove` is one verb that does both metadata and FS reap; jj's `workspace forget` + `rm -rf` is two-step. Document at code site.

**Build-order role:** **Independent of items 1-3 + 5 + 6.** Has soft coupling with item 4 (if cancel ships, the reap pattern reuses).

**Needs discuss-phase confirmation:**
- Whether to reap on the conflicted branch too (architectural inversion of current "preserve for inspection" stance). Tentative: NO — preservation is the documented W3 (a) contract; v1.4 changes the success branch only.

---

### Item 8 (bonus — PROJECT.md `### Validated` reconciliation)

**Classification:** **Workflow-only / prose-only** (no code change unless a SDK verb gets added).

**Architecture question:** does v1.4 ship a NEW recurring tool (`gsd-sdk query project.validate-requirements --against MILESTONES.md`) or is the reconciliation a one-shot prose sweep?

**Tentative architectural answer: one-shot prose sweep**, NOT a new tool. Reasons:

- The reconciliation is a known-one-time drift (pre-Phase-11 prose got out of step with MILESTONES.md). It's not a class of recurring drift that justifies a permanent SDK verb.
- Building a recurring tool would require a `REQUIREMENTS.md` parser (currently mostly free-form prose) — that's a >100 LOC new surface area with no second consumer.
- Drift-control item 6's `tests/architecture-counts.test.cjs` covers the cosmetic "counts grew" drift. Requirements-level reconciliation is a different concern (semantic match, not numeric).

**If discuss-phase wants the recurring tool anyway**, the SDK verb would live at `sdk/src/query/project-validate-requirements.ts` and parse `.planning/PROJECT.md` + `.planning/MILESTONES.md` + per-phase SUMMARY.md headers, emitting a diff envelope. The roadmap should NOT plan this without explicit operator buy-in — it's scope-creep relative to v1.4's "clean state" goal.

**Files to change (one-shot path):**

| File | Change |
|------|--------|
| `.planning/PROJECT.md` | Lines 100-110 (`### Active (v1.4 …)` block) plus the `### Validated` v1.0/v1.1/v1.2/v1.3 sections: cross-reference every requirement against MILESTONES.md + per-phase SUMMARY.md headers; correct any drift (REQ-IDs that should be Validated but weren't moved; descriptions that drifted from what was actually shipped). |
| (no code change) | — |

**Build-order role:** **Independent of all other items.** Pure prose; no test depends on it; can ship as the last plan of any v1.4 phase.

---

## Per-Item Summary Table

| # | Item | Files modified | Files NEW | Classification | Blocks | Blocked by |
|---|------|---------------|-----------|----------------|--------|------------|
| 1 | `idAlphabet` | types.ts, backends/git.ts, backends/jj.ts, adapter-contract.test.ts | — | New (read-only property) | Item 2 | None |
| 2 | `matchPrefix` | types.ts, backends/git.ts, backends/jj.ts, adapter-contract.test.ts | — | New (method) | None | Item 1 |
| 3 | `rootRevisions` rename | types.ts, backends/git.ts, backends/jj.ts, query/progress.ts, bin/lib/commands.cjs, 5× test files, capture-vcs-baselines.cjs | — | Rename-only | None | None (but shares files with 1, 2) |
| 4 | `parallel.cancel` | types.ts, jj/parallel.ts, git/parallel.ts, backends/git.ts, backends/jj.ts, 3× catalog files, 2× test files | workspace-parallel-cancel.ts, cmd-parallel-cancel.test.ts | New (method + CLI bridge) | (Soft) item 7 | None |
| 5 | Call-presence lint | parallel-e2e.yml, package.json | lint-vcs-parallel-call-presence.cjs, lint-vcs-parallel-call-presence.allow.json, tests/lint-vcs-parallel-call-presence.test.cjs | New (lint tooling) | None | None |
| 6 | Drift-control tests | (forces fixes to) docs/ARCHITECTURE.md + 3 translations | tests/architecture-counts.test.cjs, tests/command-count-sync.test.cjs | New (tests) | ARCHITECTURE.md prose fix | None |
| 7 | Orphan dir reap | jj/parallel.ts, scripts/dogfood-restore.sh, cmd-parallel-jj.test.ts | (optional) dogfood-restore.test.cjs | Modified existing | None | (Soft) item 4 |
| 8 | PROJECT.md reconciliation | .planning/PROJECT.md | — | Prose-only | None | None |
| v14-* todos | Tactical | transition.md, 5× WR plan files, jj-reap.test.ts, INVENTORY.md, etc. | — | Modified existing | None | None |

---

## Suggested Build Order

The dependency graph collapses to four file-disjoint workstreams. Each can be its own phase (15, 16, 17, 18) — phases parallel-safe across workstreams, sequential within:

### Phase 15 — Adapter surface extensions + rename (items 1, 2, 3, 4)

Single phase, FOUR plans (sequential within the phase because all four touch `types.ts` + `backends/git.ts` + `backends/jj.ts` — file-overlap = sequential plans, NOT parallel waves):

1. **Plan 15-01 — rootCommits → rootRevisions** (item 3, rename-only). Mechanical sweep; smallest diff; lowest risk; ships first to clear the namespace.
2. **Plan 15-02 — `idAlphabet`** (item 1). Three-line addition to the refs namespace + cross-backend contract test.
3. **Plan 15-03 — `matchPrefix`** (item 2). Consumes item 1's alphabet; one method per backend + tests.
4. **Plan 15-04 — `parallel.cancel`** (item 4). Largest of the four; ships last; consumes the established surface patterns from prior plans.

**Rationale for ordering:**
- Rename FIRST (15-01) because every subsequent plan needs to know the current name; doing it later forces a same-file rebase.
- `idAlphabet` BEFORE `matchPrefix` because `matchPrefix`'s implementation references the alphabet (even if hard-coded per backend, the type contract assumes alphabet is public).
- `parallel.cancel` LAST because (a) it's the largest, (b) it benefits from settled types.ts diffs of the prior three, (c) it has the most cross-backend test surface.

### Phase 16 — Workflow + invariant tooling (items 5 + 7)

Single phase, TWO plans, **parallel-safe** (file-disjoint):

- **Plan 16-01 — Call-presence lint** (item 5). New `scripts/lint-vcs-parallel-call-presence.cjs` + allowlist + CI wiring + fixture test.
- **Plan 16-02 — Orphan FS dir reap** (item 7). Extend `jj/parallel.ts` clean-path branch + extend `scripts/dogfood-restore.sh` + new regression tests.

Both touch DIFFERENT files (16-01 = `scripts/lint-*.cjs` + `.github/workflows/*.yml`; 16-02 = `sdk/src/vcs/jj/parallel.ts` + `scripts/dogfood-restore.sh`). The roadmap can run them in one parallel wave.

**Cross-phase dependency:** if Phase 15 plan 15-04 (cancel) lands first AND cancel reaps the orphan FS dirs as discussed, then Phase 16 plan 16-02's fan-in-success-branch reap is INDEPENDENT but the dogfood-restore.sh extension is unchanged. If 15-04 is deferred, 16-02 ships standalone (fan-in-success-branch reap + dogfood-restore.sh both still needed).

### Phase 17 — Drift control + reconciliation (items 6 + 8 + v14-docs-verify-only-followups)

Single phase, multi-plan, **parallel-safe** (file-disjoint across plans):

- **Plan 17-01 — Drift-control tests** (item 6). New `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`. Tests FAIL on land (drift exists).
- **Plan 17-02 — Fix ARCHITECTURE.md drift** (forced by 17-01). Fix prose counts in 4 translation files + en source where applicable. Tests pass.
- **Plan 17-03 — PROJECT.md `### Validated` reconciliation** (item 8). Prose sweep; cross-reference against MILESTONES.md + SUMMARY headers.
- **Plan 17-04 — v14-docs-verify-only-followups themes 1-5, 7, 8** (one batched plan for all non-drift-test themes). Fixes 45 verify-only failures.

17-01 must land BEFORE 17-02 (test-driven verification). 17-03 and 17-04 are file-disjoint with the others — can parallel-wave with 17-02.

### Phase 18 — Tactical cleanup (v14-* todos)

Single phase, multi-plan, **parallel-safe** (each todo touches different files):

- **Plan 18-01 — `v14-transition-md-update-gap`**. Apply `assert_clean_wc` pattern to `transition.md:166`.
- **Plan 18-02 — `v14-review-followups`** (WR-01..05 + 5 info items). Mostly small-scope fixes to dogfood-restore.sh, workspace-parallel-dispatch.ts, cmd-parallel-* test cleanup.
- **Plan 18-03 — `v14-jj-reap-test-flake`**. Narrow scope per todo: fix the `jj-reap.test.ts > inclusion-filter` flake (likely `concurrent: false` or `it.timeout(15_000)`).

The five v14-* todos that remain (orphan-jj-workspace-dirs is Phase 16 plan 02; docs-verify-only is Phase 17 plan 04) all live here. Each is its own plan, no inter-plan dependencies.

### Overall Phase Order

```
Phase 15 (sequential plans)  ┐
                              ├─ all 4 phases parallel-safe by phase
Phase 16 (parallel-wave)     ┐│  (cross-phase: 15 ships first if 15-04
                              │├   cancel covers item 7's FS-dir reap;
Phase 17 (parallel-wave)     ┐││  otherwise all four parallel)
                              │││
Phase 18 (parallel-wave)     ┘┘┘
```

**Recommended canonical order: 15 → 16 → 17 → 18.** Phase 15 ships first because (a) the adapter surface is the "highest-leverage" surface — every other phase consumes the adapter, (b) cancel (15-04) potentially simplifies 16-02. Phases 16, 17, 18 can ship in any order; canonical order is just for narrative coherence in the close-gate commit log.

**Total estimate: 4 phases, ~15-18 plans, scope matches v1.4's "clean state" mandate.**

---

## Data Flow (item-specific)

### `parallel.cancel` data flow (item 4)

```
Operator decides to abandon a dispatched wave
    ↓
Orchestrator captures the Handle JSON (from prior dispatch call)
    ↓
gsd-sdk query workspace.parallel.cancel --handle @handle.json
    ↓
sdk/src/query/workspace-parallel-cancel.ts
    ↓
vcs.workspace.parallel.cancel(handle)
    ↓
performJjParallelCancel / performGitParallelCancel
    ↓ for each workspace in handle.workspaces:
        ↓ (jj) jj workspace forget <name> → rm -rf <path>
        ↓ (git) git worktree remove --force <path> → git branch -D worktree-agent-<id>
    ↓
{abandoned: […], surplusBookmarks: […], surplusWorkspaces: […]}
```

### Drift-test scan flow (item 6)

```
node --test tests/architecture-counts.test.cjs
    ↓
For each translation in [en, ja-JP, ko-KR, pt-BR]:
    ↓ read docs/{lang}/ARCHITECTURE.md
    ↓ extract prose counts via regex (per-translation patterns)
    ↓ for each claim {kind, claimedCount}:
        ↓ actualCount = fs.readdirSync(kindToDir[kind]).filter(…).length
        ↓ assert.strictEqual(claimedCount, actualCount)
    ↓
PASS or FAIL with specific drift coordinates
```

---

## Anti-Patterns (avoid during v1.4 implementation)

### Anti-Pattern 1: Adding alias for renamed surface (item 3)

**What:** Keep `rootCommits` as a backward-compat alias to `rootRevisions`.

**Why wrong:** v1.2 NAMING-01 precedent is hard rename (no alias). Aliases create a permanent maintenance burden, make grepping harder, and violate the "one revision concept across backends" SEED-001 inversion (which extended to naming consistency).

**Do instead:** Hard rename, sweep all 6 callers in one plan, lint-vcs-no-commit-id.cjs CI gate catches any lingering references at next test run.

### Anti-Pattern 2: Folding drift-control tests into vitest

**What:** Add `tests/architecture-counts.test.cjs` content to `sdk/src/__tests__/something.test.ts`.

**Why wrong:** Memory `project_test_perf_pain_vitest` — sdk/vitest is the slow suite. Drift-control tests scan filesystem; they're fast and have zero adapter dependency. Putting them in vitest pollutes the slow suite without benefit. The user-flagged peer files (`tests/inventory-counts.test.cjs`) use `node:test` — match that.

**Do instead:** `node:test` framework, `tests/` directory, scan via `node:fs` only.

### Anti-Pattern 3: Mid-Agent cancel via process-killing (item 4 interpretation C)

**What:** `cancel` sends SIGTERM/SIGKILL to subagent processes mid-flight.

**Why wrong:** Phase 9 D-01 invariant: "orchestrator awaits Agent() per resolution; no liveness probe". Process-killing requires the orchestrator to track per-subagent PIDs (the Handle is pure JSON; no PIDs by D-05/D-06). Adding process tracking breaks the Handle-as-frozen-JSON contract.

**Do instead:** Operator kills subagents via Claude Code's own UI/CLI; `cancel` cleans up workspaces post-mortem (interpretations A+B).

### Anti-Pattern 4: Workflow call-presence lint as a build-time test

**What:** Add to `npm pretest` or `npm test` runs.

**Why wrong:** scans only workflow markdown — the surface that `parallel-e2e.yml` already gates. Pretest is the hot path; bloating it slows the inner loop without proportional benefit. The `audit-workflow-raw-git.cjs` precedent (D-07 — "one-shot / CI-06-only") is the architectural pattern.

**Do instead:** CI-only via `parallel-e2e.yml`. The lint is fast (scans ~89 .md files); no need to run on every developer test cycle.

### Anti-Pattern 5: Reaping FS dirs on the conflicted branch (item 7)

**What:** Extend `performJjParallelFanIn`'s CONFLICTED branch with the same `rm -rf` loop the clean branch is getting.

**Why wrong:** the conflicted branch deliberately preserves workspaces on disk for human inspection (W3 (a) joint-assertion contract, line 388-404 of `jj/parallel.ts`). Reaping them defeats the inspection use case.

**Do instead:** Only reap on the clean branch; conflicted branch behavior is unchanged. Document the asymmetry at code site.

---

## Integration Points (cross-item)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **types.ts ↔ backends/{git,jj}.ts** | TypeScript interface — adding to types.ts forces both backends to implement (compile-time check). | Items 1, 2, 3, 4 all touch types.ts → ALL same phase, sequential plans. |
| **backends/jj.ts ↔ jj/parallel.ts** | One-way: backend wires the sidecar via `Object.freeze({parallel: …})`. UPSTREAM-02: sidecar NEVER imports from backend. | Item 4's `performJjParallelCancel` adds to the sidecar; backend wire-in is one new property on the existing freeze. |
| **jj/parallel.ts ↔ scripts/dogfood-restore.sh** | None at code level — they're two unrelated surfaces both fixing the same orphan-dir class. Documented at code site (cross-reference comment). | Item 7's two-surface fix; no code coupling. |
| **CLI bridge ↔ workflow markdown** | One-way: workflow .md calls `gsd-sdk query <verb>` shell command. Manifest registration is the type-level contract; the workflow .md grep is what the call-presence lint scans for. | Item 4 adds the bridge but does NOT call it from any workflow .md in v1.4 (out of scope; future milestone adopts cancel from a workflow). |
| **Drift-control test ↔ ARCHITECTURE.md prose** | Test reads prose, compares to filesystem; failure forces prose fix. | Item 6 → 17-01 → 17-02 ordering is test-driven. |

---

## Sources

- `.planning/PROJECT.md` (v1.4 scope authority; current as of 2026-05-24)
- `.planning/MILESTONES.md` (v1.0-v1.3 closed milestones; v1.4 not yet recorded)
- `.planning/ROADMAP.md` (phase numbering convention; v1.3 closed at Phase 14)
- `sdk/src/vcs/types.ts` lines 336-367 (VcsRefs namespace — where new `idAlphabet`/`matchPrefix` land; where `rootCommits` is declared)
- `sdk/src/vcs/types.ts` lines 442-541 (VcsWorkspaceParallel + handle/result types — where `cancel` lands)
- `sdk/src/vcs/backends/git.ts` lines 526-568 (refs Object.freeze block — git-side rename + new methods land here)
- `sdk/src/vcs/backends/jj.ts` lines 964-1017 (refs Object.freeze block — jj-side same; parallel block at 1255-1264)
- `sdk/src/vcs/jj/parallel.ts` (existing composition layer — item 7's clean-path extension target)
- `sdk/src/vcs/git/parallel.ts` (existing composition layer — item 4's cancel implementation cousin)
- `sdk/src/vcs/parse/jj-id.ts` (existing alphabet-aware helpers — reference, NOT reuse point for matchPrefix)
- `sdk/src/query/workspace-parallel-{dispatch,fan-in}.ts` (CLI bridge precedent for item 4's new cancel bridge)
- `sdk/src/query/command-static-catalog-domain.ts` + `command-manifest.non-family.ts` + `command-aliases.generated.ts` (three-site CLI registration pattern)
- `scripts/lint-vcs-no-raw-git.cjs` (lint pattern source for item 5)
- `scripts/audit-workflow-raw-git.cjs` (baseline-regression model; one-shot CI-only pattern)
- `.github/workflows/parallel-e2e.yml` (item 5's CI wire-in target; existing audit step at lines 125-127)
- `tests/inventory-counts.test.cjs` + `tests/agents-doc-parity.test.cjs` (peer-pattern source for item 6's new tests; `node:test` framework choice anchor)
- `.planning/todos/pending/v14-orphan-jj-workspace-dirs.md` (item 7 scope authority)
- `.planning/todos/pending/v14-docs-verify-only-followups.md` themes 6 + "Largest informational drift" section (item 6 + 17-02 scope)
- `get-shit-done/workflows/{execute-phase.md,quick.md}` (item 5's scan target — lines 555-561 and 678-683 are the existing dispatch sites)
- Memory `project_no_orchestrator_sidecar_state` (Phase 11 D-01 — informs cancel's "no sidecar state" stance; no PID file, no manifest file)
- Memory `feedback_avoid_jj_auto_tracked_output` (item 5's lint must be stdout-only)
- Memory `project_test_perf_pain_vitest` (item 6's framework choice — `node:test` not vitest)
- Memory `feedback_solo_dev_no_expires` (item 5's allowlist schema — `{path|glob, reason, owner}`, no `expires`)
- v1.2 NAMING-01 + `LogEntry.hash → .id` precedent (item 3's hard-rename discipline)

---

*Architecture research for: GSD jj-port v1.4 cleanup + deferred-item harvest*
*Researched: 2026-05-23*
*Confidence: HIGH — every claim grounded in existing repo state or v1.3 precedent*
