# Phase 10: git-side parallel verbs + classifier extension — Research

**Researched:** 2026-05-15
**Domain:** GSD jj-port — VCS adapter (TypeScript, dual-backend git/jj), git-side parallel-dispatch lift
**Confidence:** HIGH (every claim cites a current `file:line` read live during research; Phase 9 jj-side body and existing git primitives are in-tree and verified; CONTEXT.md decisions are LOCKED and constrain the entire scope)

## Summary

Phase 10 lifts the existing raw-git worktree dispatch + merge + cleanup loop (today living in `get-shit-done/bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` at lines 417-516, ~100 LOC of orchestrator-tier glue) into a single adapter-internal sidecar at `sdk/src/vcs/git/parallel.ts`. The new sidecar exposes two pure functions — `performGitParallelDispatch` and `performGitParallelFanIn` — that `backends/git.ts` wires in via the `workspace.parallel.{dispatch,fanIn}` namespace, replacing the Phase 9 `VcsNotImplementedError`-throwing stubs at `backends/git.ts:723-734`. The cross-backend `FanInResult` shape (locked at Phase 9 D-08) ships identical on both backends, including the load-bearing `conflicted: boolean` Pitfall-2 surface that distinguishes in-tree-conflict-success from crash. The reap classifier's `IncompleteWorkEntry.reason = 'merge-in-tree-conflict'` enum (widened in Phase 9 inside `sdk/src/vcs/jj/reap.ts`) gets its git-side producer landed here — but the producer fires inside the fanIn LOOP body (D-08), not inside reap.

The work is **structurally mirroring** the Phase 9 jj-side sidecar at `sdk/src/vcs/jj/parallel.ts` (already shipped 2026-05-15), with one critical divergence: the git-side `fanIn` is a **2-parent loop of `git merge --no-ff <agentBookmark>` per workspace** (D-01), NOT a single N-parent octopus. The jj side does the whole octopus in ONE call and returns done in a single shot; the git side iterates N times, halts on the first conflict (D-02), and is re-callable via a stateless `git merge-base --is-ancestor` probe (D-03). Per-success cleanup (D-04) fires `git worktree remove` (non-force, ROADMAP SC1) + `git branch -D` for each merged workspace before the loop advances. This shape is **not negotiable** — D-01..D-08 are user-locked decisions per `10-CONTEXT.md`.

**Primary recommendation:** structure `sdk/src/vcs/git/parallel.ts` as a 1:1 structural mirror of `sdk/src/vcs/jj/parallel.ts:1-543` — same validator pattern, same `vcsExec` discipline, same `Object.freeze` discipline, same `appendIncomplete` queue write site, same DI shape for `workspace.add` / `workspace.merge` / `workspace.remove`. Diverge ONLY at the `fanIn` body (loop vs. single op) and at the classifier producer site (git uses exit-code + `git diff --name-only --diff-filter=U` instead of jj's `conflicts()` revset). The plan should follow the same wave shape Phase 9 used: types are already locked → ship sidecar body → wire backend → contract tests in one wave each. The implementation surface is narrow (~150-200 LOC TypeScript + ~250 LOC test).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workspace creation per agent | git adapter (sidecar `git/parallel.ts`) | git backend (composes `workspace.add` DI seam) | Existing `workspace.add` at `backends/git.ts:570-582` is the unit primitive; sidecar serializes calls inside a plain `for` loop (D-05; Pitfall 5 protection from `spawnSync` blocking the event loop) |
| Manifest serialization | git adapter (sidecar) | filesystem (tmpdir) | Mirror jj's `mkdtempSync` + JSON write at `jj/parallel.ts:252-265`; VCS-19 schema extension already shipped (Phase 9) |
| 2-parent merge per workspace | git adapter (existing `workspace.merge`) | sidecar (loop body) | `backends/git.ts:660-705` already implements `git merge --no-ff <branch>` with conflict detection + agent-bookmark delete; sidecar composes via the `vcs.workspace.merge(...)` DI closure inside the loop |
| Per-success cleanup | git adapter (existing `workspace.remove`) | sidecar (loop body) | `backends/git.ts:706-715` is the non-force wrapper; D-04 calls it after each successful merge before advancing |
| Ancestor probe for re-call | git adapter (new helper inside sidecar) | `vcsExec` | D-03 stateless probe: `git merge-base --is-ancestor <agentBookmarkTip> HEAD`; no SDK verb extraction needed (single use site) |
| Conflict path enumeration | git adapter (new helper inside sidecar) | `vcsExec` | D-08: `git diff --name-only --diff-filter=U` after non-zero merge exit; analogous to jj's `enumerateConflictedPaths` sidecar but trivial enough to inline (single `vcsExec` call + line split) |
| Incomplete-work queue write | cross-backend queue file | sidecar | `appendIncomplete` from `sdk/src/vcs/jj/incomplete-work.ts` — the cross-backend home despite the `jj/` path (`backends/git.ts:33` already imports `readIncomplete` from this module for the phase-merge gate) |
| Crashed-agent classification | git adapter (sidecar reap branch) | results array `exitCode !== 0` | D-06: branch-tip == baseRev + clean tree → abandoned; else `'crashed-with-uncommitted-work'` queue entry |
| Backend wire-in | `backends/git.ts:723-734` | sidecar imports | Replace throwing stubs with `parallel: Object.freeze({ dispatch: (opts) => performGitParallelDispatch({ mainRepoRoot: cwd, vcs: {workspace}, ...opts }), fanIn: (handle, results) => performGitParallelFanIn(cwd, handle, results) })` — exactly the jj-side shape at `backends/jj.ts:1257-1264` |

## User Constraints (from CONTEXT.md)

### Locked Decisions

The CONTEXT.md decisions D-01 through D-17 are LOCKED — research investigates HOW to implement them, NOT whether to revisit them.

- **D-01:** git-side `fanIn` is a **loop of 2-parent `git merge --no-ff <agentBookmark>` per workspace**, NOT an octopus form. The cross-backend contract is "fan in; halt on conflict; be re-callable" — internal loop shape is per-backend. Lifts the existing `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan:417-516` body into TS without changing its merge shape. [LOCKED — rejected ROADMAP SC3 octopus wording, rejected synthesized Option D `merge-tree` enumeration, rejected Option C chained-merge fallback.]
- **D-02:** On the first per-branch merge that conflicts, **halt the loop and return**. Leave the primary worktree in mid-merge state (MERGE_HEAD set, conflict markers in tree, index has unmerged entries). User resolves with normal git tooling. Matches the existing 2-parent `workspace.merge` precedent at `sdk/src/vcs/backends/git.ts:660-705`. [LOCKED — dropped "snapshot-then-abort to `gsd/phase-NN-conflict-snapshot` branch" Option C.]
- **D-03:** `fanIn` is **idempotent / re-callable**. Mechanism: stateless `git merge-base --is-ancestor <agentBookmarkTip> HEAD` probe per workspace; already-ancestor → skip. Same `handle` is passed on every re-call; no sidecar state file. [LOCKED.]
- **D-04:** **Per-success cleanup in the loop.** Each successful 2-parent merge immediately fires `git worktree remove <path>` (non-force per ROADMAP SC1) + `git branch -D <agentBookmark>` BEFORE the loop advances. On conflict halt, already-merged workspaces are already cleaned up. [LOCKED.]
- **D-05:** `performGitParallelDispatch`'s worktree-create loop is a **plain `for`-loop with sync `vcsExec`**. Mirrors `sdk/src/vcs/jj/parallel.ts:204` exactly. `spawnSync` blocks the event loop → intra-process serialization comes from the runtime. No async semaphore, no flock sentinel, no `proper-lockfile` dep. Inline comment at the loop header cites PITFALLS Pitfall 5 (`.git/config.lock` race). [LOCKED.]
- **D-06:** When `result.exitCode !== 0` for an agent, **store the agent's branch-tip SHA in `IncompleteWorkEntry.changeIdShort`** (unified `.id` slot per v1.2 model). Workspace path → `workspacePath`. Branch tip == `baseRev` AND `git status --porcelain` clean → no queue write (abandoned-style). Branch tip != `baseRev` OR `git status --porcelain` non-empty → emit `IncompleteWorkEntry(reason='crashed-with-uncommitted-work', changeIdShort: <branchTipShortSha>, workspacePath, subagentName)`. [LOCKED.]
- **D-07:** **Non-force `worktree remove` refusing dirty trees is a feature, not a bug.** Crashed agent → dirty tree → cleanup fails loud → worktree survives on disk → `workspacePath` is the human-inspection handle (PITFALLS Pitfall 3 structurally implemented). `failedReaped` in `FanInResult` carries the agent NAME (matches `jj/parallel.ts:530`), not branch or path. [LOCKED.]
- **D-08:** The `'merge-in-tree-conflict'` producer fires inside the fanIn loop body, **NOT inside reap**. On `git merge --no-ff` non-zero exit + `/CONFLICT|Automatic merge failed/i` match (existing precedent at `backends/git.ts:683`): enumerate via `git diff --name-only --diff-filter=U`, append queue entry with `reason='merge-in-tree-conflict'`, return `FanInResult` with `conflicted: true`. Reap.ts's git-side branch (if grown) handles ONLY crashed-agent classification (D-06). [LOCKED.]
- **D-09:** ROADMAP Phase 10 SC3 amends to per-branch 2-parent loop wording. [Cascade — planner action.]
- **D-10:** REQUIREMENTS PARALLEL-02 git-side wording amends. [Cascade — planner action.]
- **D-11:** REQUIREMENTS TEST-15 amends or drops. [Cascade — planner action.]
- **D-12:** PROJECT.md target features bullet already accurate under D-01. [No edit.]
- **D-13 (carry):** `FanInResult` shape `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` is locked by Phase 9 D-08. `merged: string[]` — git fills with up to N short SHAs in loop order. [LOCKED.]
- **D-14 (carry):** `ParallelDispatchHandle` is frozen pure JSON (Phase 9 D-05); shape locked. `baseRev` JSDoc: commit_id on git, change_id on jj. [LOCKED.]
- **D-15 (carry):** `IncompleteWorkEntry.reason` enum is widened to 2 values by Phase 9 in `sdk/src/vcs/jj/reap.ts`. Phase 10 adds git-side producer for `'merge-in-tree-conflict'` — does NOT re-extend the enum. [LOCKED.]
- **D-16 (carry):** No raw `child_process` in `sdk/src/vcs/git/parallel.ts`. `vcsExec` is the sole subprocess primitive. SDK shape law: pure-JSON returns; no closures/methods/Symbols. [LOCKED.]
- **D-17 (carry):** Pattern B random-prefix `mkdtemp` for `cmd-parallel-git.test.ts` fixture isolation. No `retry: N`, no `describe.skip`. [LOCKED.]

### Claude's Discretion

The planner may decide:

- **File layout inside `sdk/src/vcs/git/parallel.ts`:** pure functions or named-export object; exact name of the loop-skip helper (e.g., `isAlreadyMerged` vs `ancestorOf`); whether to extract per-merge cleanup to a helper or inline it.
- **`surplusBookmarks` population strategy:** incrementally inside the loop (each failed `git branch -D` adds to the field) vs. audit-only on final-clean recall via `git for-each-ref refs/heads/worktree-agent-*` post-loop. **CONTEXT recommendation: populate incrementally** so a re-call that finishes cleanly returns the full audit in one place.
- **D-06 edge case behavior — "branch tip != baseRev AND `git status --porcelain` clean":** agent committed work but no dirty tree. **CONTEXT recommendation: queue as `'crashed-with-uncommitted-work'`** even though the tree is clean (the committed work IS uncommitted-from-main-perspective).
- **Allowlist entry text:** exact reason wording in `lint-vcs-no-raw-git.allow.json` — either ARCHITECTURE.md §"Integration Point #4" verbatim or planner-tweaked.
- **Order of operations in dispatch:** create all worktrees first, then return the handle, vs. create-worktree-and-eagerly-create-branch interleaved. jj-side eagerly creates agent bookmarks after the slot loop completes (`jj/parallel.ts:228-244`) — git-side can mirror or inline per-slot.

### Deferred Ideas (OUT OF SCOPE)

- **Octopus form on git for merge-count optimization** — Deferred. Future requirement may surface if dogfood reveals merge-commit-count growth. Infrastructure to add is a single `performGitParallelFanIn` variant flag.
- **Snapshot branch (`gsd/phase-NN-conflict-snapshot`) for preserved-and-clean-tree conflict diagnostics** — Deferred to v1.4+. Adds new ref-namespace governance user does not want without dogfood-driven evidence.
- **Aligning the existing 2-parent `workspace.merge` to a clean-tree-on-conflict policy** — Deferred. D-02 reaffirms the precedent.
- **Sidecar state file for `fanIn` re-call progress** — Deferred (rejected). D-03's stateless probe makes it unnecessary.
- **`vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment** — Out of Scope per REQUIREMENTS.md / STATE.md Deferred Items.
- **Cross-backend `surplusBookmarks` audit shape under per-success cleanup** — Claude's Discretion (see above; CONTEXT recommendation is incremental).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARALLEL-01 (git-side) | `vcs.workspace.parallel.dispatch(plan): ParallelDispatchHandle` ships on git backend. git wraps `git worktree add` with internal serialization. Returns frozen pure-JSON handle. | Existing `workspace.add` at `git.ts:570-582`; jj sidecar at `jj/parallel.ts:164-290` is the structural mirror; locked types in `types.ts:453-518` |
| PARALLEL-02 (git-side) | `vcs.workspace.parallel.fanIn(handle, results): FanInResult` ships on git backend. Per D-10 amendment: git iterates per-branch 2-parent `git merge --no-ff <agentBookmark>` + per-success `git branch -D`; halts on first conflict; idempotent under re-call via `merge-base --is-ancestor` skip. | Existing `workspace.merge` at `git.ts:660-705`; existing `executeWorktreeWaveCleanupPlan` body at `bin/lib/worktree-safety.cjs:417-516` |
| VCS-18 | New `sdk/src/vcs/git/parallel.ts` (new dir + file). Lifts ~100 LOC `executeWorktreeWaveCleanupPlan` body into TS. Joins `lint-vcs-no-raw-git.allow.json` as single adapter-internal entry. | Net +1 allowlist entry per ARCHITECTURE.md §"Integration Point #4"; mirror of `sdk/src/vcs/jj/parallel.ts` sidecar discipline |
| TEST-13 (git contract tests) | Cross-backend contract tests for PARALLEL-01 + PARALLEL-02 at `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts`. Pattern A `describe.sequential.skipIf(!gitAvailable)`. Both backends run same scenarios: N=2/3/4 dispatch, clean fan-in, fan-in with one in-tree-conflict, fan-in with one crashed worker, idempotency re-call. | jj-side template at `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:1-430` (430 lines — verbatim structural template) |
| TEST-15 | Per D-11 amendment: reframe as "git per-branch loop happy-path: N successful 2-parent merges produce N entries in `merged[]` for N ∈ {2, 3, 4} verified cross-version" OR drop (TEST-13 happy-path subsumes). | Empirically verified `git merge --no-ff` conflict exit-code behavior during research (see Common Pitfalls Pitfall 1 below) |
| TEST-16 | Pattern B random-prefix `mkdtemp`; no `retry: N`; no `describe.skip`. Test counts on both backends MUST match baseline post-v1.3. | jj-side fixture setup at `cmd-parallel-jj.test.ts:63-86`; skip-count baseline mechanism at `scripts/check-skip-count.cjs` (origin/main comparison) |

## Project Constraints (from CLAUDE.md and global instructions)

- **Use `pnpm` and TypeScript for Node.js projects** (global) — Phase 10's sidecar IS TypeScript; install/test commands use `pnpm`.
- **Use `tsx` to execute TypeScript** (global) — n/a for compiled SDK, but applies if research/test scripts run ad-hoc.
- **Use `jj` for version control unless explicitly told otherwise** (global) — applies to commit-and-push during execution; SDK commit verb routes correctly post-B-08 per `feedback_sdk_commit_jj_safe` memory.
- **Always use tabs for indentation unless impossible** (global) — TypeScript sidecar follows tabs per existing repo convention (verified `sdk/src/vcs/jj/parallel.ts`).
- **GitHub access via `gh --repo gsd-build/get-shit-done`** (project CLAUDE.md) — applies to any PR/issue interaction.
- **No raw git anywhere in jj-port** (memory `project_no_raw_git`) — sidecar IS adapter substrate (the LEGITIMATE place for raw git); lint allowlist gets the +1 entry per VCS-18.
- **Phase filenames follow SDK padded convention** (memory `feedback_phase_filename_padding`) — files use `10-…` form (padded leading integer); phase dir already `10-git-side-parallel-verbs-classifier-extension/`.
- **`vcsExec` is the sole subprocess primitive** (D-16 carry; reinforced) — no `child_process` import in `git/parallel.ts`.
- **Drop `expires` from solo-dev allowlist schemas** (memory `feedback_solo_dev_no_expires`) — new lint entry uses `{path, reason, owner}` shape (matches existing 23 entries).

## Standard Stack

### Core (already shipped; consume don't add)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ≥5.7 (existing) | Source language | Existing SDK toolchain |
| Node.js | ≥22 (existing) | Runtime | Existing project floor; verified at `.github/workflows/test.yml:101` matrix [VERIFIED: codebase grep] |
| `vcsExec` from `sdk/src/vcs/exec.ts:91-126` | n/a (in-repo) | Sole subprocess primitive | D-16 carry; `spawnSync`-backed sync wrapper; provides `{exitCode, stdout, stderr, timedOut, error}` ExecResult [VERIFIED: file read] |
| `expr.rev(...)` from `sdk/src/vcs/expr.ts:90-95` | n/a (in-repo) | RevisionExpr factory for any `<rev>` placeholder in argv | Validates SHA/change_id shape; matches `octopus.ts:36` precedent [VERIFIED: file read] |
| `appendIncomplete` from `sdk/src/vcs/jj/incomplete-work.ts:71-85` | n/a (in-repo) | Cross-backend queue write site (despite `jj/` path) | `backends/git.ts:33` already imports `readIncomplete` from this module — confirmed cross-backend home [VERIFIED: grep] |
| Vitest | 3.1.1 (existing) | Test runner | Established Pattern A (`describe.sequential.skipIf`) precedent |

### Supporting (no additions needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` | bundled | `mkdtempSync`, `writeFileSync`, `existsSync`, `readdirSync` for manifest | Mirror `jj/parallel.ts:34` import list |
| `node:os` | bundled | `tmpdir()` for manifest mkdtemp parent | Same as jj-side |
| `node:path` | bundled | `join`, `basename` | Standard |

### Alternatives Considered (all rejected; see Deferred Ideas)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `for` loop + sync `vcsExec` | Async semaphore / `p-limit` | D-05 LOCKED — `spawnSync` blocks event loop → intra-process serialization is automatic; async machinery would force a Pitfall 5 reckoning |
| Per-branch 2-parent loop | N-parent octopus `git merge --no-ff <p1> <p2> ... <pN>` | D-01 LOCKED — user explicitly chose loop over octopus; preserves existing `executeWorktreeWaveCleanupPlan` shape |
| Stateless `merge-base --is-ancestor` probe | Sidecar state file recording per-call progress | D-03 LOCKED — stateless probe is sufficient and simpler |
| Non-force `worktree remove` | `worktree remove --force` | ROADMAP SC1 + D-07 LOCKED — force is forbidden; dirty-tree refusal IS the human-inspection trigger |

**Installation:** None. No new dependencies; everything composes existing in-repo modules.

**Version verification:** N/A — no external packages added. `node`, `vitest`, `typescript` versions inherited from repo state.

## Package Legitimacy Audit

> **N/A** — Phase 10 installs zero external packages. All code composes in-repo modules (`vcsExec`, `expr`, `appendIncomplete`, existing `workspace.{add,merge,remove}` primitives on the git backend). Net dependency diff: **+0**. Net allowlist diff: **+1** (the new `sdk/src/vcs/git/parallel.ts` entry per VCS-18).

## Architecture Patterns

### System Architecture Diagram

```
Workflow / Orchestrator (Phase 11 will rewire; Phase 10 ships the verbs only)
        │
        ▼
backends/git.ts ──── workspace = Object.freeze({ ..., parallel: Object.freeze({ dispatch, fanIn }) })
        │                                                              │
        ▼                                                              ▼
parallel.dispatch(opts)                                  parallel.fanIn(handle, results)
        │                                                              │
        ▼                                                              ▼
performGitParallelDispatch                              performGitParallelFanIn
(sdk/src/vcs/git/parallel.ts — NEW)                     (sdk/src/vcs/git/parallel.ts — NEW)
        │                                                              │
        │ 1. validate every agentId                                     │ 1. For each ws in handle.workspaces (D-03 loop):
        │ 2. validate mainBookmark                                      │     a. if merge-base --is-ancestor <bookmarkTip> HEAD → skip
        │ 3. for-loop (D-05): vcs.workspace.add(...)                    │     b. else: vcs.workspace.merge({branch, mainBookmark, agentBookmark})
        │    [spawnSync serializes → Pitfall 5 protection]              │        - on ok=true:  worktree remove (non-force) + branch -D (D-04)
        │ 4. for each slot: create agent branch                         │                       push <newCommitSha> to merged[]
        │    (git: `git branch worktree-agent-<id> @`)                  │                       advance loop
        │ 5. write WAVE_WORKTREE_MANIFEST.json (VCS-19)                 │        - on ok=false + conflicted=true (D-02, D-08):
        │ 6. return Object.freeze(handle)                               │                       enumerate via `git diff --name-only --diff-filter=U`
        │                                                               │                       appendIncomplete(phaseRoot, {reason:'merge-in-tree-conflict', changeIdShort:<bookmarkTipShortSha>, workspacePath, subagentName})
        │                                                               │                       return FanInResult({conflicted:true, conflictedPaths, merged:[...successes so far], incompleteQueued:+1})  HALT
        │                                                               │                       [tree left wedged with MERGE_HEAD set; user resolves]
        │                                                               │
        │                                                               │ 2. For each result with exitCode !== 0 (D-06 crash classification):
        │                                                               │     a. <branchTip> = `git rev-parse worktree-agent-<agentId>`
        │                                                               │     b. <statusClean> = `git status --porcelain` empty?
        │                                                               │     c. if <branchTip> == ws.baseRev AND <statusClean>:
        │                                                               │           failedReaped.push(agentName)  [abandoned-style, no queue write]
        │                                                               │     d. else:
        │                                                               │           appendIncomplete({reason:'crashed-with-uncommitted-work', changeIdShort:<branchTipShortSha>, workspacePath:ws.path, subagentName:ws.name})
        │                                                               │           failedReaped.push(agentName)  [worktree survives — D-07; non-force refuse]
        │                                                               │
        │                                                               │ 3. surplusBookmarks: list `worktree-agent-*` branches still alive post-loop
        │                                                               │    (incremental population recommended per Claude's Discretion)
        │                                                               │
        │                                                               │ 4. return Object.freeze({merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks})

Existing primitives composed by the new sidecar (all already shipped):
        - workspace.add        (backends/git.ts:570-582)  →  `git worktree add <path> [<base>]`
        - workspace.merge      (backends/git.ts:660-705)  →  `git merge --no-ff -m <msg> <branch>` + post-merge HEAD `rev-parse` + `git branch -D <agentBookmark>`
        - workspace.remove     (backends/git.ts:706-715)  →  `git worktree remove [--force] <path>`
        - vcsExec              (sdk/src/vcs/exec.ts:91)    →  `spawnSync` wrapper with structured ExecResult
        - appendIncomplete     (sdk/src/vcs/jj/incomplete-work.ts:71)  →  JSONL append; cross-backend queue file

Cross-backend symmetry (Phase 9 jj-side already shipped, Phase 10 mirrors structurally with loop-shape divergence):
        - sdk/src/vcs/jj/parallel.ts:164-290  (performJjParallelDispatch — verbatim structural reference)
        - sdk/src/vcs/jj/parallel.ts:308-543  (performJjParallelFanIn — single N-parent merge; git-side iterates instead)
```

### Recommended Project Structure

```
sdk/src/vcs/
├── backends/
│   ├── git.ts             — REPLACE Phase 9 throwing stub at lines 723-734 with wire-in (≈8 LOC change)
│   └── jj.ts              — UNCHANGED (Phase 9 wire-in at 1255-1264 is the precedent shape)
├── git/                   — NEW DIRECTORY (Phase 10 creates it)
│   └── parallel.ts        — NEW FILE; performGitParallelDispatch + performGitParallelFanIn
├── jj/
│   ├── parallel.ts        — UNCHANGED (verbatim structural reference at 1-543)
│   ├── reap.ts            — UNCHANGED (Phase 10 does NOT extend; classifier stays here)
│   ├── incomplete-work.ts — UNCHANGED (cross-backend queue home — appendIncomplete is the write API)
│   └── (other jj sidecars unchanged)
└── __tests__/
    └── cmd-parallel-git.test.ts  — NEW FILE; structural mirror of cmd-parallel-jj.test.ts:1-430
```

### Pattern 1: Sidecar discipline — verbatim mirror of jj-side

**What:** `sdk/src/vcs/git/parallel.ts` is an adapter-internal sidecar that does NOT import from `backends/git.ts`. The sole consumer is `backends/git.ts` itself (which imports `performGitParallelDispatch` / `performGitParallelFanIn` and wires them into the `workspace.parallel.*` namespace).

**When to use:** Always — symmetry with `jj/parallel.ts`'s UPSTREAM-02 discipline. Even though git is upstream's substrate (no rebase-cost rationale), the symmetry matters for architectural coherence per ARCHITECTURE.md §"Integration Point #2".

**Example:**

```typescript
// sdk/src/vcs/git/parallel.ts (NEW)
// Source: structural mirror of sdk/src/vcs/jj/parallel.ts:1-50 header

/**
 * sdk/src/vcs/git/parallel.ts — Phase 10 (VCS-18, PARALLEL-01/02 git-side)
 *
 * Lift of bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan
 * (417-516) into the SDK adapter tier. The cross-backend FanInResult shape
 * locked at Phase 9 D-08 ships uniform — `conflicted: boolean` distinguishes
 * in-tree-conflict-success from crash (Pitfall 2). Loop body (D-01) iterates
 * per-branch 2-parent `git merge --no-ff <agentBookmark>` instead of a single
 * N-parent octopus; halts on first conflict (D-02); re-callable via stateless
 * `git merge-base --is-ancestor` skip (D-03). Per-success cleanup (D-04)
 * fires non-force `git worktree remove` + `git branch -D` before the loop
 * advances.
 *
 * D-05: dispatch's worktree-create loop is a plain `for` + sync `vcsExec`.
 * `spawnSync` blocks the event loop → intra-process serialization is
 * automatic. PITFALLS Pitfall 5 (`.git/config.lock` race) is structurally
 * protected. Any future refactor to async vcsExec MUST revisit this comment.
 *
 * D-16: `vcsExec` is the sole subprocess primitive — no raw `child_process`.
 * SDK shape law: pure-JSON Object.freeze returns; no closures/methods/Symbols.
 */

import { writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vcsExec, execGit } from '../exec.js';
import type {
  RevisionExpr,
  ParallelDispatchOpts,
  ParallelDispatchHandle,
  ParallelAgentResult,
  FanInResult,
  IncompleteWorkEntry,
} from '../types.js';
import { appendIncomplete } from '../jj/incomplete-work.js';

// Validators inline (sidecar discipline; no import from backends/git.ts)
function validateAgentId(name: string): void {
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
    throw new Error(`parallel.dispatch: agentId "${name}" violates worktree-safety manifest character class /^[A-Za-z0-9._/-]+$/`);
  }
}

// Pure DI-shape function — opts extends ParallelDispatchOpts with the cwd seam.
export function performGitParallelDispatch(
  opts: ParallelDispatchOpts & {
    mainRepoRoot: string;
    vcs: { workspace: { add(input: { path: string; baseRef?: RevisionExpr; name?: string }): unknown } };
  },
): ParallelDispatchHandle {
  // ... loop body ...
  return Object.freeze({ /* pure JSON */ }) satisfies ParallelDispatchHandle;
}

export function performGitParallelFanIn(
  mainRepoRoot: string,
  handle: ParallelDispatchHandle,
  results: readonly ParallelAgentResult[],
): FanInResult {
  // ... loop body — per-branch merge, halt on conflict, re-call via merge-base ...
  return Object.freeze({ /* pure JSON */ }) satisfies FanInResult;
}
```

### Pattern 2: Loop body — re-callable per-branch merge

**What:** The fanIn loop body iterates `handle.workspaces`. For each: stateless ancestor probe; if not ancestor, attempt 2-parent merge via the existing `vcs.workspace.merge(...)` DI seam; on success, per-branch cleanup; on conflict, halt + queue.

**When to use:** This is the ONE place git-side diverges structurally from jj-side. jj's `performJjParallelFanIn` does ONE N-parent `jj new` (`jj/parallel.ts:358-371`) and probes `conflicts()` revset. git's `performGitParallelFanIn` iterates N times.

**Example:**

```typescript
// Inside performGitParallelFanIn — loop body shape:

const phaseTag = String(handle.phaseNumber).padStart(2, '0');
const merged: string[] = [];
let conflicted = false;
let conflictedPaths: string[] = [];
let incompleteQueued = 0;
const surplusBookmarks: string[] = [];

for (const ws of handle.workspaces) {
  const agentBookmark = `worktree-agent-${ws.agentId}`;

  // D-03: stateless re-call probe. Skip if the agent bookmark tip is already
  // an ancestor of HEAD (this fanIn call is a re-call; the merge already
  // landed on a previous invocation).
  const isAncestor = execGit(mainRepoRoot, [
    'merge-base', '--is-ancestor', agentBookmark, 'HEAD',
  ]);
  if (isAncestor.exitCode === 0) {
    // Already merged on a previous call — skip the workspace entirely.
    continue;
  }

  // D-01: 2-parent merge via the existing workspace.merge primitive.
  // backends/git.ts:660-705 handles validation + conflict detection +
  // agentBookmark delete on success.
  const mergeResult = opts.vcs.workspace.merge({
    branch: /* expr.bookmark(agentBookmark) */ ...,
    message: `phase ${phaseTag} merge: ${ws.agentId}`,
    ff: false,
    mainBookmark: handle.mainBookmark,
    agentBookmark, // D-04 in-merge delete
  });

  if (!mergeResult.ok && mergeResult.conflicted) {
    // D-02 + D-08: halt on conflict, enumerate paths, queue entry.
    const diff = execGit(mainRepoRoot, [
      'diff', '--name-only', '--diff-filter=U',
    ]);
    conflictedPaths = diff.stdout.split('\n').filter(p => p.length > 0);
    conflicted = true;

    const tipSha = execGit(mainRepoRoot, ['rev-parse', agentBookmark]).stdout.trim();
    const queueEntry: IncompleteWorkEntry = {
      subagentName: ws.name,
      changeIdShort: tipSha.slice(0, 12),
      workspacePath: ws.path,
      reason: 'merge-in-tree-conflict',
    };
    appendIncomplete(handle.phaseRoot, queueEntry);
    incompleteQueued += 1;
    break; // D-02: halt the loop, leave tree wedged for user resolve
  }

  if (mergeResult.ok && mergeResult.changeId) {
    merged.push(mergeResult.changeId.slice(0, 12));
    // D-04: per-success cleanup. workspace.merge already deleted the agent
    // bookmark inside the merge step; we still need worktree remove (non-force
    // per ROADMAP SC1 / D-07).
    try {
      opts.vcs.workspace.remove(ws.path); // non-force
    } catch (err) {
      // D-07: non-force refuse → worktree survives → surface as surplus
      // (this branch is rare on the clean-merge path; if it happens the
      // agent's WC was unexpectedly dirty post-merge).
      surplusBookmarks.push(agentBookmark);
    }
  }
}
```

### Pattern 3: Backend wire-in (minimal change to `backends/git.ts`)

**What:** Replace the Phase 9 throwing stub at `backends/git.ts:723-734` with a wire-in that mirrors the jj-side at `backends/jj.ts:1255-1264`.

**Example:**

```typescript
// sdk/src/vcs/backends/git.ts — REPLACE lines 723-734:

import { performGitParallelDispatch, performGitParallelFanIn } from '../git/parallel.js';

// ... later, inside createGitAdapter, inside the `workspace = Object.freeze({...})` block ...

parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performGitParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performGitParallelFanIn(cwd, handle, results),
}),
```

The imports `ParallelDispatchOpts`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult` are already in the type imports list at the top of `backends/git.ts` (added in Phase 9 for the throwing stub). Delete the now-unused `VcsNotImplementedError` import IF no other site still references it (verify via grep before deleting).

### Anti-Patterns to Avoid

- **Octopus form `git merge --no-ff <p1> <p2> ... <pN>` on git** — Forbidden by D-01. Even though git supports octopus form natively (verified at git 2.0+ per ARCHITECTURE.md research; the project CI uses git 2.50.1 on macOS and Ubuntu-latest), the user explicitly chose loop. Do not propose octopus as "optimization."
- **`git worktree remove --force` in the cross-backend path** — Forbidden by ROADMAP SC1 + D-07. Force-removal exists as a knob on `workspace.remove({force:true})` but is reserved for the orchestrator-tier wave-cleanup-tail path (Phase 11 territory), NOT the standard fanIn cleanup.
- **Async `vcsExec` / `Promise.all` over worktree adds** — Forbidden by D-05 + PITFALLS Pitfall 5. The `.git/config.lock` race is real; sync `spawnSync` serializes by blocking; any `await` introduces interleaving.
- **Importing from `backends/git.ts` in the new sidecar** — Forbidden by sidecar discipline (mirror UPSTREAM-02). The sidecar exposes pure functions; the backend consumes them. One-way dependency.
- **Mixing the merge-conflict producer site with reap.ts** — Forbidden by D-08. Reap.ts's git-side branch (if it ever grows one) handles ONLY crashed-agent classification. The `'merge-in-tree-conflict'` producer fires inside the fanIn loop body.
- **Re-extending the `IncompleteWorkEntry.reason` enum** — Forbidden by D-15. The enum was widened to 2 values by Phase 9; Phase 10 ADDS a producer, does NOT extend the union.
- **Splitting D-08's joint assertion across multiple `it` blocks in tests** — Forbidden per CONTEXT.md's D-17 carry. The 3-part assertion (conflicted===true AND conflictedPaths populated AND queue entry reason==='merge-in-tree-conflict') lives in ONE `it` block — mirror `cmd-parallel-jj.test.ts:227-295`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 2-parent merge with conflict detection | New merge invocation | `vcs.workspace.merge(...)` at `backends/git.ts:660-705` (via DI seam) | Already handles validateRefname + branch validation + `CONFLICT\|Automatic merge failed` regex + agentBookmark delete |
| Worktree creation | Raw `git worktree add` in sidecar | `vcs.workspace.add(...)` at `backends/git.ts:570-582` (via DI seam) | Composes correctly with the existing test fixture pattern; serialized for free under sync `vcsExec` |
| Worktree removal | Raw `git worktree remove` in sidecar | `vcs.workspace.remove(...)` at `backends/git.ts:706-715` (via DI seam) | Honors the force flag; cross-backend symmetry; consumed identically by jj-side |
| Subprocess invocation | `import { spawnSync } from 'node:child_process'` | `vcsExec(cwd, 'git', argv)` from `sdk/src/vcs/exec.ts:91` | D-16 carry; structured ExecResult with timedOut + error fields; CI-blocking lint enforces this |
| Manifest JSON write | Custom format | Mirror `jj/parallel.ts:252-265` shape | VCS-19 schema already locked; `worktree_path`, `branch=worktree-agent-${agentId}`, `expected_base`, `main_bookmark`, `plan_id`, `backend:'git'` |
| `IncompleteWorkEntry` append | New queue file | `appendIncomplete(phaseRoot, entry)` from `sdk/src/vcs/jj/incomplete-work.ts:71` | Cross-backend queue file; JSONL format; mkdir -p built-in (CR-02 Phase 9 fix); parse-time closed-union validation in `readIncomplete` |
| Conflict path enumeration | Custom regex parsing of merge output | `execGit(mainRepoRoot, ['diff', '--name-only', '--diff-filter=U'])` | git's native unmerged-paths surface; verified empirically during research (status `UU f` → `diff --name-only --diff-filter=U` returns `f`) |
| Re-call ancestor probe | State file / handle mutation | `execGit(mainRepoRoot, ['merge-base', '--is-ancestor', agentBookmark, 'HEAD'])` exit-code | D-03 stateless; `--is-ancestor` returns 0 iff first arg is ancestor of second |
| Refname validation | New regex | Inline `/^[A-Za-z0-9._/-]+$/` check matching `worktree-safety.cjs:334` | Mirrors `jj/parallel.ts:92-98` `validateAgentId`; sidecar discipline (no import from `backends/git.ts`'s `validateRefname`) |
| Frozen pure-JSON return | Class instance / closure | `Object.freeze({ ... }) satisfies <Type>` | SDK shape law (D-16 carry); survives `gsd-sdk query` JSON round-trip |

**Key insight:** Phase 10 composes 8 existing primitives; the new file is glue + halt-on-conflict orchestration. Net new logic is ~50-80 LOC of orchestration; everything else is wiring or test fixture. If a planner is reaching for `spawnSync` or hand-rolling refname regex inside `git/parallel.ts`, the pattern is wrong — re-read this section.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 10 is greenfield within an existing schema. The incomplete-work queue file (`.planning/phases/<NN>/incomplete-work.md`) already accepts the `'merge-in-tree-conflict'` reason after Phase 9; the parse-time validator at `incomplete-work.ts:147-151` recognizes both values from the closed union. | none |
| Live service config | None — no n8n / Datadog / Tailscale / Cloudflare integrations. | none |
| OS-registered state | None — no launchd / pm2 / Task Scheduler artifacts. | none |
| Secrets/env vars | None — no env var renames or new secret keys. `GSD_HOOK_SKIP_COLOCATED` is Phase 12 territory (A3 fix), not Phase 10. | none |
| Build artifacts | `sdk/dist-cjs/vcs/backends/git.{js,d.ts,...}` will rebuild after the wire-in change; `sdk/dist-cjs/vcs/git/parallel.{js,...}` is NEW (new directory in dist). `sdk/dist-cjs/vcs/types.d.ts` will be touched only if Phase 9's already-shipped `VcsWorkspaceParallel` interface needs no further extension — confirmed unchanged per D-15 carry. | Standard `pnpm build` to refresh dist-cjs |

**Nothing found in runtime state requiring data migration.** This is a code-only addition (new file + 8-line wire-in change + new test file + 1 allowlist entry).

## Common Pitfalls

### Pitfall 1: git merge conflict regex must match the existing `workspace.merge` precedent verbatim

**What goes wrong:** A naive conflict probe parses merge output with a regex that misses some git locales or future wording variations. The cross-backend `conflicted: boolean` field (Pitfall 2 surface) becomes false-on-conflict, and the merge-in-tree-conflict queue entry never gets written.

**Why it happens:** git's conflict output is locale-aware in some versions; "Automatic merge failed; fix conflicts and then commit the result." is English-only. Some translations omit "CONFLICT" prefix.

**How to avoid:** Mirror the existing `workspace.merge`'s detection at `backends/git.ts:683` verbatim:

```typescript
const conflicted =
  mergeRes.exitCode !== 0 &&
  /CONFLICT|Automatic merge failed/i.test((mergeRes.stderr || '') + (mergeRes.stdout || ''));
```

The case-insensitive `i` flag and the `||` alternation tolerate both forms. Since the sidecar consumes `vcs.workspace.merge(...)` via DI, this detection happens INSIDE the merge primitive — the sidecar receives `{ok, conflicted, changeId, stderr}` and trusts the boolean. Do not re-implement the regex in the sidecar.

**Empirical verification done during research:** ran `git merge --no-ff <b2>` after a conflicting `git merge --no-ff <b1>` against the same file (git 2.50.1, Apple Git-155, macOS). Result: exit code 1, stdout contains "CONFLICT (content): Merge conflict in f", stdout contains "Automatic merge failed; fix conflicts and then commit the result.", `git diff --name-only --diff-filter=U` returns `f`, `git status --porcelain` shows `UU f`, `.git/MERGE_HEAD` exists. Behavior confirmed on git 2.50.1.

**Warning signs:**
- TEST-13 conflict scenario reports `conflicted: false` even though `merged.length < N`.
- `surplusBookmarks` populated unexpectedly because the merge loop kept going after a real conflict.
- Queue file has no `'merge-in-tree-conflict'` entries despite a forced-conflict fixture.

### Pitfall 2: Per-success cleanup ordering — `workspace.merge` already deletes the agent bookmark

**What goes wrong:** A naive D-04 implementation calls `git branch -D <agentBookmark>` after every successful merge — but the existing `vcs.workspace.merge(...)` at `backends/git.ts:691-702` ALREADY deletes the agent bookmark inside the merge step (atomically with the merge). Double-delete returns exit code 1 ("branch '...' not found"), which the sidecar might surface as a failure even though the desired post-state is achieved.

**Why it happens:** The lift from `worktree-safety.cjs::executeWorktreeWaveCleanupPlan:471-477` is misread — the cjs caller calls `workspace.merge(...)` AND then calls `refs.bookmarks.delete(...)` as a "safety net" (lines 500-509) precisely because git's in-merge `branch -D` fails silently while the worktree is still checked out (cjs comments at 491-499 document this).

**How to avoid:** Mirror the cjs pattern exactly:

1. Call `vcs.workspace.merge({..., agentBookmark})` — the merge attempts the in-step delete, but it fails silently on git while the worktree is checked out.
2. Call `vcs.workspace.remove(<worktree_path>)` (non-force per D-07) — this unregisters the worktree.
3. NOW the agent branch is safely deletable. Either via a final `vcs.refs.bookmarks.delete(agentBookmark, {raw:true, force:true})` (mirror cjs:500-509) OR rely on the `surplusBookmarks` audit to catch it.

The Claude's-Discretion question about incremental vs. audit-only `surplusBookmarks` population is essentially the choice here — incremental population means the sidecar explicitly tries the cleanup-delete and records failures; audit-only means the sidecar just lists `worktree-agent-*` post-loop and reports whatever remains.

**CONTEXT recommendation:** populate incrementally so a re-call that finishes cleanly returns the full audit in one place.

**Warning signs:**
- TEST-13 clean-fanIn scenario reports `surplusBookmarks.length > 0` for branches that should have cleaned.
- N=4 contract test passes on jj-lane but fails on git-lane with leftover `worktree-agent-*` refs.
- Idempotency re-call adds duplicate `'merge-in-tree-conflict'` queue entries because the previous-call's incomplete state survived without dedup.

### Pitfall 3: Re-call probe (`merge-base --is-ancestor`) must be a SKIP, not a NO-OP

**What goes wrong:** D-03's stateless probe is implemented as "if ancestor, return early without touching the workspace." A subtle variant: "if ancestor, count it in `merged[]`." Both are wrong relative to CONTEXT.md §"Specific Ideas" (`merged: string[]` is per-call, not cumulative across re-calls").

**Why it happens:** The orchestrator/caller wants a "total merged count" — tempting to make the verb cumulative. CONTEXT explicitly says no.

**How to avoid:**

- "If ancestor, skip" = the workspace entry is processed (loop advances past it) BUT nothing is appended to `merged[]` and nothing is written to incomplete-work.
- `merged[]` only contains agent commits merged DURING THIS INVOCATION.
- Caller (orchestrator) is responsible for accumulating across re-calls.

Re-read CONTEXT.md §"Specific Ideas" — the example walk-through (3 agents, A clean / B conflict / C unprocessed, then user resolves B → re-call) clearly shows `merged: [<shaC>]` on the second call, not `[<shaA>, <shaB>, <shaC>]`.

**Warning signs:**
- TEST-13 idempotency scenario asserts `result.merged.length === 1` on the second call but the verb returns more.
- The verb returns `merged` containing commits already on `HEAD` before this invocation.

### Pitfall 4: `.git/config.lock` race — relies on `spawnSync` blocking

**What goes wrong:** A future refactor swaps `vcsExec` to an async `vcsExecAsync` for "performance," and `performGitParallelDispatch`'s worktree-add loop silently parallelizes — `.git/config.lock` race per PITFALLS Pitfall 5 reappears, manifest write count != plan length, `WAVE_WORKTREE_MANIFEST` has fewer entries than dispatched plans.

**Why it happens:** D-05's protection is **structural** — `spawnSync` blocks the event loop. The protection is invisible to anyone reading the for-loop without context. Future Claude refactoring for "speed" may not realize the loop body's serial behavior IS the protection.

**How to avoid:**

- Inline comment at the loop header citing PITFALLS Pitfall 5 + D-05. CONTEXT.md mandates this verbatim: "Inline comment at the loop header cites PITFALLS Pitfall 5 (`.git/config.lock` race) and notes that intra-process serialization is `spawnSync`-derived, so any future refactor to async `vcsExec` is forced to revisit the decision rather than silently regress."
- Plan should add a TEST-16 fixture: N=8 dispatch in 20 sequential CI runs → assert `manifest.length === 8` every time. This is the empirical regression guard.

**Warning signs:**
- CI flakes in dispatch tests passing locally (CI's slower disk widens the race window).
- `git worktree list` shows worktrees absent from manifest (one create succeeded, manifest write didn't).
- New code in `git/parallel.ts` uses `Promise.all` or `await` inside the dispatch loop.

### Pitfall 5: D-07 dirty-tree refusal must not throw out of the verb

**What goes wrong:** Non-force `git worktree remove` exits non-zero on a dirty worktree (the D-07 "feature, not bug" case). A naive sidecar surfaces this as a thrown error from `performGitParallelFanIn`, blowing up the entire fanIn result instead of recording the worktree as preserved-for-inspection.

**Why it happens:** `workspace.remove(...)` at `backends/git.ts:712-714` throws on non-zero exit. The sidecar must wrap the cleanup call in try/catch.

**How to avoid:**

```typescript
try {
  opts.vcs.workspace.remove(ws.path); // non-force per D-07
} catch (err) {
  // D-07: non-force refuse on dirty tree IS THE FEATURE. Surface as surplus.
  surplusBookmarks.push(agentBookmark);
  // Do NOT re-throw — the orchestrator inspects FanInResult.surplusBookmarks
  // and FanInResult.failedReaped (via the workspacePath in the queue entry)
  // to find the human-inspection handle.
}
```

The crashed-worker reap branch (D-06) ALSO needs this try/catch — D-07 explicitly notes "preserve partial work — structurally implemented by this refusal."

**Warning signs:**
- TEST-13 crashed-worker scenario throws instead of returning a `FanInResult`.
- `failedReaped` is empty even when an agent crashed with dirty work.
- The crashed agent's `workspacePath` is missing from the queue entry because the entry was never appended (the throw aborted before `appendIncomplete`).

### Pitfall 6: `appendIncomplete` requires `mkdir -p` on `phaseRoot`

**What goes wrong:** `handle.phaseRoot` is computed by `derivePhaseRoot(mainRepoRoot, phaseNumber)` which "Returns an absolute path even when the dir does not exist" (`jj/parallel.ts:140-143`). On a fresh test fixture (no `.planning/phases/<NN>/`), `appendIncomplete` would have failed with `ENOENT` before the Phase 9 CR-02 fix.

**Why it happens:** Phase 9 CR-02 fixed this at the `appendIncomplete` level (line 83: `mkdirSync(dirname(p), { recursive: true })` BEFORE the append). So callers are safe IFF they consume `appendIncomplete` and not roll their own write.

**How to avoid:** Use `appendIncomplete` for ALL queue writes. Do not write directly to `<phaseRoot>/incomplete-work.md`. Existing helper handles the mkdir.

**Warning signs:**
- Tests fail with `ENOENT: no such file or directory, open '/tmp/.../.planning/phases/10/incomplete-work.md'`.
- Sidecar code does `writeFileSync(...incomplete-work.md...)` directly.

### Pitfall 7: D-08 joint assertion must be ONE `it` block in tests

**What goes wrong:** TEST-13's in-tree-conflict scenario is split across multiple `it` blocks (one for `conflicted===true`, one for `conflictedPaths.length > 0`, one for queue entry presence). Vitest's test isolation means each `it` rebuilds the fixture; the conflict-fixture state from the first `it` doesn't survive to the second `it`. False-pass: `conflicted===true` passes but the queue check is on a fresh empty queue.

**Why it happens:** Tempting to split for "test readability" or "smaller test bodies." CONTEXT.md's D-17 carry forbids it explicitly.

**How to avoid:** Mirror `cmd-parallel-jj.test.ts:227-295` exactly — ONE `it` block, ALL THREE assertions sequentially. The CONTEXT.md decision notes "W3 (a) joint-assertion lock-in (D-16)" — the single coherent code path constraint is preserved by the single test scenario.

**Warning signs:**
- Tests pass individually but `result.conflictedPaths` is being asserted on a `result` from a different scenario.
- Test file has 6+ `it` blocks where the jj-side template has 4-5.

## Code Examples

Verified patterns from in-repo sources (live `file:line` references):

### Validator inline (sidecar discipline)

```typescript
// Source: sdk/src/vcs/jj/parallel.ts:92-98 (verbatim mirror target)
function validateAgentId(name: string): void {
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
    throw new Error(
      `parallel.dispatch: agentId "${name}" violates worktree-safety manifest character class /^[A-Za-z0-9._/-]+$/ (see get-shit-done/bin/lib/worktree-safety.cjs:334)`,
    );
  }
}
```

### Plain `for` loop with sync `vcsExec` (D-05)

```typescript
// Source: sdk/src/vcs/jj/parallel.ts:204-222 (structural mirror)
// PITFALLS Pitfall 5: .git/config.lock race protection comes from spawnSync
// blocking the event loop. Any future refactor to async vcsExec MUST revisit
// this. (D-05 LOCKED.)
for (let i = 0; i < plan.length; i++) {
  const item = plan[i];
  const idx = i + 1;
  // Inline serialization via sync spawnSync — no async/await, no Promise.all.
  // workspace.add is the DI seam from backends/git.ts:570-582.
  const ws = opts.vcs.workspace.add({
    path: item.workspacePath ?? join(/* default path */),
    name: `worktree-agent-${item.agentId}`,
  });
  slots.push({ ...slot stuff... });
}
```

### Manifest write (VCS-19 shape)

```typescript
// Source: sdk/src/vcs/jj/parallel.ts:252-265 (structural mirror; change backend to 'git')
const manifestDir = mkdtempSync(join(tmpdir(), 'gsd-wave-manifest-'));
const manifestPath = join(manifestDir, 'wave-worktree-manifest.json');
const manifestBody = {
  worktrees: slots.map((slot) => ({
    agent_id: slot.agentId,
    plan_id: slot.planId,
    backend: 'git' as const, // CHANGE FROM 'jj'
    worktree_path: slot.workspacePath,
    branch: `worktree-agent-${slot.agentId}`,
    expected_base: slot.headSha, // commit_id on git, change_id on jj
    main_bookmark: mainBookmark,
  })),
};
writeFileSync(manifestPath, JSON.stringify(manifestBody, null, 2), 'utf-8');
```

### Frozen pure-JSON handle (SDK shape law)

```typescript
// Source: sdk/src/vcs/jj/parallel.ts:270-289 (verbatim mirror)
return Object.freeze({
  phaseRoot,
  phaseNumber,
  mainBookmark,
  manifest: manifestPath,
  workspaces: Object.freeze(
    slots.map((s) =>
      Object.freeze({
        name: s.workspaceName,
        path: s.workspacePath,
        baseRev: s.headSha, // commit_id on git, change_id on jj (D-14 carry)
        agentId: s.agentId,
        baselineOpId: undefined as string | undefined,
      }),
    ),
  ),
}) satisfies ParallelDispatchHandle;
```

### Conflict path enumeration (git-side analogue of jj's `enumerateConflictedPaths`)

```typescript
// Source: empirically verified during research, git 2.50.1
// Verified output: `UU f` in status; `f` in diff --name-only --diff-filter=U.
// Inline (single use site; no sidecar extraction warranted).
function enumerateGitConflictedPaths(mainRepoRoot: string): string[] {
  const r = vcsExec(mainRepoRoot, 'git', [
    'diff', '--name-only', '--diff-filter=U',
  ]);
  if (r.exitCode !== 0) {
    // Diff against unmerged index can fail in edge cases (e.g., no MERGE_HEAD);
    // surface as empty list to keep FanInResult well-formed.
    return [];
  }
  return r.stdout.split('\n').map(s => s.trim()).filter(s => s.length > 0);
}
```

### Re-call ancestor probe (D-03)

```typescript
// Stateless probe — single execGit per workspace in the fanIn loop.
const r = execGit(mainRepoRoot, [
  'merge-base', '--is-ancestor', agentBookmark, 'HEAD',
]);
if (r.exitCode === 0) {
  // Already merged on a previous fanIn call — skip this workspace.
  continue;
}
// Note: --is-ancestor returns 0 if first arg IS an ancestor (success), 1 if
// not (failure), 128 on argument errors. Treat ANY non-zero as "not ancestor"
// for fail-safe forward progress.
```

### Backend wire-in (mirror jj-side)

```typescript
// Source: sdk/src/vcs/backends/jj.ts:1257-1264 (verbatim mirror target; just change jj → git)
// REPLACES the throwing stub at sdk/src/vcs/backends/git.ts:723-734.
parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performGitParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performGitParallelFanIn(cwd, handle, results),
}),
```

### Test fixture (Pattern B mkdtemp + Pattern A skipIf)

```typescript
// Source: sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:44-86 (structural mirror)
let gitAvailable = false;
try {
  execSync('git --version', { stdio: 'pipe' });
  gitAvailable = true;
} catch {
  // git not on PATH; every describe in this file skips.
}

function setupGitRepo(): string {
  const dir = mkdtempSync(
    join(
      tmpdir(),
      `gsd-git-parallel-${Math.random().toString(36).slice(2, 10)}-`,
    ),
  );
  execSync('git init -q -b main', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  execSync('git add seed.txt', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -qm seed', { cwd: dir, stdio: 'pipe' });
  mkdirSync(join(dir, '.planning', 'phases', '10-test'), { recursive: true });
  return dir;
}
```

Note: `commit.gpgsign false` is needed because the test environment may have global gpg-signing enabled which fails in CI without a key. Verified during research (initial test fixture without this flag failed with "No secret key" on macOS).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw-git workflow markdown blocks dispatching worktrees (~290 LOC in `execute-phase.md:521-810`) | Adapter verb `vcs.workspace.parallel.dispatch(...)` consumed by workflows | Phase 10 ships verb; Phase 11 deletes markdown | Workflows never branch on `vcs.kind` for parallel-dispatch reasons (v1.3 architectural payoff) |
| `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` as the wave-cleanup orchestrator (~100 LOC at lines 417-516) | Same logic lives in `sdk/src/vcs/git/parallel.ts::performGitParallelFanIn` | Phase 10 ships TS body; Phase 11 deletes/delegates cjs body | ADR-0004 ownership preserved; public export signature unchanged on `worktree-safety.cjs::executeWorktreeWaveCleanupPlan` (the cjs body shrinks to delegate, per ARCHITECTURE.md §"Concern 1") |
| Phase 9 throwing stub for `workspace.parallel.{dispatch,fanIn}` on git (`VcsNotImplementedError` at `backends/git.ts:723-734`) | Real wire-in to `performGitParallelDispatch` + `performGitParallelFanIn` | Phase 10 | Cross-backend `FanInResult` shape becomes uniform (Phase 9 + Phase 10 same-PR coupling per v1.2 retro precedent — closes the contract this phase finalizes) |
| `IncompleteWorkEntry.reason` enum 1-value (`'crashed-with-uncommitted-work'`) | 2-value closed union (added `'merge-in-tree-conflict'` in Phase 9) | Phase 9 widened; Phase 10 adds git-side PRODUCER (does NOT re-extend) | Cross-backend in-tree conflict surface; D-14 phase-merge gate treats unknown reasons as fail-safe block |

**Deprecated/outdated:**
- ROADMAP Phase 10 SC3 wording ("`git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified on test-fixture across CI git versions") — amended via D-09 to per-branch 2-parent loop wording. Planner does the amendment.
- REQUIREMENTS PARALLEL-02 git-side wording ("git uses N-parent `git merge --no-ff <p1>...<pN>` + batched `git update-ref -d`") — amended via D-10 to per-branch loop wording.
- REQUIREMENTS TEST-15 wording ("git N-parent octopus fixture. `git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified cross-version") — D-11 amends OR drops (TEST-13 git happy-path already proves the loop).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Empirical git 2.50.1 macOS behavior for `git merge --no-ff` conflict (exit 1; "CONFLICT" + "Automatic merge failed" in output; `--diff-filter=U` enumerates unmerged paths) extrapolates to the CI git versions (ubuntu-latest + macos-latest, git versions installed by the GHA runner image — typically 2.40+) | Common Pitfalls Pitfall 1; Code Examples §"Conflict path enumeration" | LOW — the existing `workspace.merge` at `backends/git.ts:683` uses the same regex on the same versions and has been green since Phase 7 (shipped 2026-05-14). If a future git locale or wording change breaks the regex, the existing merge primitive breaks first, not the new sidecar. |
| A2 | `git branch -D` inside `workspace.merge`'s in-step delete (`backends/git.ts:691-702`) continues to fail-silent when the worktree is still checked out, so the per-success cleanup ordering "merge → workspace.remove → bookmark cleanup audit" remains correct | Common Pitfalls Pitfall 2 | LOW — documented in `worktree-safety.cjs:491-499` comments; git behavior is stable per project history. |
| A3 | The cross-backend `FanInResult` shape `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` requires NO extension for git-side population (all fields locked at Phase 9 D-08) | Architecture Patterns §"System Architecture Diagram"; D-13 carry | NONE — D-13 LOCKED; planner cannot extend without re-opening Phase 9. |
| A4 | `git merge-base --is-ancestor` exit-code 0/1 semantics (0=ancestor, 1=not-ancestor, 128=arg-error) hold across git versions in CI | Code Examples §"Re-call ancestor probe (D-03)"; Common Pitfalls Pitfall 3 | LOW — `--is-ancestor` semantics are stable since git 1.8 (released 2012); CI runs 2.40+. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

The table is non-empty but every claim is LOW risk and grounded in either empirical verification, existing in-tree precedent that has been green for months, or LOCKED upstream decisions. None require user confirmation before planning.

## Open Questions

1. **`surplusBookmarks` population strategy — incremental vs. audit-only**
   - What we know: CONTEXT.md flags this as Claude's Discretion. Recommendation is incremental (each failed in-loop cleanup adds to the field; final-clean re-call returns full audit). jj-side at `jj/parallel.ts:471-493` does post-delete audit via `jj bookmark list` — but that's because jj's batched delete makes per-success accumulation moot. git-side has per-success cleanup, so the question lives.
   - What's unclear: do we ALSO do a post-loop `git for-each-ref refs/heads/worktree-agent-*` audit as a safety net, or trust the in-loop accumulation?
   - Recommendation: **incremental + final audit on clean re-call**. In-loop accumulation handles the per-cleanup-failure case; final audit catches anything the orchestrator created outside the dispatch contract (defensive). Both branches contribute to the same `surplusBookmarks` array.

2. **D-06 edge case — "branch tip != baseRev AND `git status --porcelain` clean"**
   - What we know: CONTEXT.md flags this as Claude's Discretion. Recommendation: queue as `'crashed-with-uncommitted-work'` (the committed work IS uncommitted-from-main-perspective).
   - What's unclear: should the queue entry's `changeIdShort` field carry the branch-tip SHA (per D-06 main path) or the SHA of HEAD-at-crash (which on git would equal branch tip if the agent committed cleanly)? They're the same SHA in the clean-tree case, so this is moot.
   - Recommendation: **branch-tip SHA, matching the main D-06 path**. Consistency with the dirty-tree case where they DO differ.

3. **`merge-base --is-ancestor` argument shape — branch name vs. branch tip SHA**
   - What we know: D-03 says `<agentBookmarkTip>` (the tip SHA). Branch names work too — `merge-base --is-ancestor worktree-agent-foo HEAD` is equivalent to `merge-base --is-ancestor $(git rev-parse worktree-agent-foo) HEAD`.
   - What's unclear: passing the branch name is one less subprocess call (no rev-parse needed). But if the branch was deleted on a previous re-call (D-04), passing the name returns exit 128 (not-an-object), which the sidecar must treat as "already merged" (skip).
   - Recommendation: **pass branch name; treat any non-zero exit as "skip"**. The deleted-on-previous-call case (branch absent) IS the "already merged" case for re-call semantics. The exit-code-128 path is correctly handled by the "any non-zero = skip" guard.

4. **Test for D-03 re-call semantics — what's the second-call assertion?**
   - What we know: CONTEXT.md walk-through example (3 agents, A clean / B conflict / C unprocessed → user resolves B → re-call). First call returns `merged: [<shaA>]`, `conflicted: true`. Second call returns `merged: [<shaC>]`, `conflicted: false`.
   - What's unclear: how does the TEST-13 fixture simulate "user resolved B and committed the merge manually" between the two `vcs.workspace.parallel.fanIn(handle, ...)` invocations? Probably `execSync('git add . && git commit')` inside the test.
   - Recommendation: planner adds a 5th TEST-13 scenario (idempotency re-call) explicitly. Mirror jj-side's lack of an equivalent test (jj does single-op, can't half-merge) — this is git-side-unique coverage.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | SDK runtime | ✓ | ≥22 (CI matrix: 22, 24) | — |
| `pnpm` | Test runner / SDK build | ✓ | per existing repo (verify with `pnpm --version`) | — |
| `git` | Test fixtures + adapter substrate | ✓ | 2.50.1 (Apple Git-155 on dev macOS); GHA runners 2.40+ | — |
| `vitest` | Test runner | ✓ | 3.1.1 (existing) | — |

**Missing dependencies with no fallback:** None — all required tools are repo-resident.

**Missing dependencies with fallback:** None.

## Security Domain

> Skip — `security_enforcement` is not explicitly set in `.planning/config.json`, but the project is solo-dev internal tooling with no exposed network surface. The relevant ASVS categories below are addressed by existing code (Phase 7 + Phase 9 already shipped the substrate).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a (CLI tool, no auth surface in adapter) |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a (local filesystem only) |
| V5 Input Validation | yes | Refname validation: inline `/^[A-Za-z0-9._/-]+$/` in sidecar (mirror `jj/parallel.ts:92-114`); existing `validateRefname` consumed inside `workspace.merge` and `workspace.remove` primitives the sidecar composes |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for {git substrate + TypeScript sidecar}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argv injection via attacker-controlled agentId | Tampering | Refname validator enforces character class `[A-Za-z0-9._/-]+`; `--` separator before user-influenced positionals in git invocations (mirror `jj/parallel.ts` validators and `octopus.ts:169`'s `-r <rev>` precedent) |
| Path traversal via worktree path | Tampering | `workspace.add` consumes paths from the caller; SDK doesn't autogenerate paths from agent input. Phase 10's sidecar passes through `item.workspacePath` from `ParallelDispatchOpts.plan[].workspacePath` (which the orchestrator controls). |
| Race on `.git/config.lock` (PITFALLS Pitfall 5) | DoS / Tampering | D-05 structural protection: sync `vcsExec` blocks the event loop; intra-process serialization is automatic. Inline comment + TEST-16 fixture (N=8 dispatch × 20 runs assert manifest length == 8) |
| Queue file corruption (incomplete-work.md) | Tampering | `appendIncomplete` uses JSONL with `JSON.stringify` escaping (Phase 9 CR-01 fix at `incomplete-work.ts:71-85`); parse-time closed-union validation throws on unknown reasons (`readIncomplete` at lines 147-151) |

## Sources

### Primary (HIGH confidence)

- `sdk/src/vcs/jj/parallel.ts:1-543` — structural mirror reference; verbatim header pattern, validator inlining, plain-for-loop, `Object.freeze` returns, `appendIncomplete` queue write site
- `sdk/src/vcs/jj/reap.ts:1-273` — cross-backend home of `IncompleteWorkEntry.reason` enum (widened to 2 values in Phase 9); Phase 10 does NOT re-extend
- `sdk/src/vcs/jj/incomplete-work.ts:1-173` — cross-backend queue file API (`appendIncomplete` + `readIncomplete`); JSONL format; CR-02 `mkdir -p` lift means callers are safe with non-existent `phaseRoot`
- `sdk/src/vcs/types.ts:442-541` — locked types `VcsWorkspaceParallel`, `ParallelDispatchOpts`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult`, `IncompleteWorkEntry`
- `sdk/src/vcs/backends/git.ts:570-734` — existing `workspace.{add,merge,remove}` primitives + Phase 9 throwing stub at 723-734
- `sdk/src/vcs/backends/jj.ts:33-34, 1255-1264` — wire-in pattern reference (`import { performJjReap, performJjParallelDispatch, performJjParallelFanIn } from '...';` + `parallel: Object.freeze({ dispatch, fanIn })`)
- `sdk/src/vcs/exec.ts:91-126` — `vcsExec` API contract (sole subprocess primitive per D-16)
- `sdk/src/vcs/expr.ts:43-95` — `expr` namespace (`expr.bookmark`, `expr.rev`) used for argv `<rev>` placeholders
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:1-430` — structural test template; Pattern A `describe.sequential.skipIf`, Pattern B `mkdtemp`, W2/W3 lifecycle and joint-assertion lock-ins
- `get-shit-done/bin/lib/worktree-safety.cjs:319-516` — existing wave-cleanup body lifted into TS; `normalizeCleanupManifestEntry` regex `worktree-agent-[A-Za-z0-9._/-]+` (line 334); `executeWorktreeWaveCleanupPlan` 7-step verb sequence
- `scripts/lint-vcs-no-raw-git.cjs:1-120` + `scripts/lint-vcs-no-raw-git.allow.json` (23 entries) — net +1 entry for `sdk/src/vcs/git/parallel.ts` per VCS-18; schema `{path, reason, owner}` (no `expires` per solo-dev override)
- `scripts/lint-vcs-no-commit-id.cjs:1-50` + allowlist — v1.2 CI-blocking enforcer; new sidecar must pass (it will — sidecar uses `changeIdShort` field name from `IncompleteWorkEntry`, not raw commit_id literals)
- `.planning/phases/10-git-side-parallel-verbs-classifier-extension/10-CONTEXT.md` — locked decisions D-01..D-17 (re-read entirely)
- `.planning/REQUIREMENTS.md` — PARALLEL-01..02, VCS-18, TEST-13/15/16; D-10/D-11 amendments pending planner action
- `.planning/research/ARCHITECTURE.md` §"Integration Point #2", §"Integration Point #4", §"Pre-emptive corrections #1" — asymmetric sidecars; +1 allowlist entry framing
- `.planning/research/PITFALLS.md` §"Pitfall 2", §"Pitfall 3", §"Pitfall 4", §"Pitfall 5", §"Pitfall 9" — in-tree conflict surface, partial-wave failure, agent-bookmark cleanup race, `.git/config.lock` race, test flake budget

### Secondary (MEDIUM confidence)

- Empirical verification: `git 2.50.1 (Apple Git-155)` on macOS — `git merge --no-ff` against conflicting branch yields exit 1, "CONFLICT (content): Merge conflict in f" stdout, "Automatic merge failed" stdout, `UU f` in `git status --porcelain`, `f` from `git diff --name-only --diff-filter=U`, `.git/MERGE_HEAD` exists. Conducted during research session 2026-05-15 at `/tmp/gitmerge-test`.

### Tertiary (LOW confidence)

- None. All planning decisions in CONTEXT.md are LOCKED; no exploration of alternatives is in scope.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive lives in-tree; no external dependencies; jj-side `parallel.ts` is the verbatim structural mirror and is already-shipped & green.
- Architecture: HIGH — D-01..D-08 LOCKED; D-13..D-17 carry from Phase 9 LOCKED; ARCHITECTURE.md research already covers Integration Points #2 and #4 in detail.
- Pitfalls: HIGH — PITFALLS.md research from milestone-level covers all 5 relevant pitfalls; empirical git behavior verified during research session.

**Research date:** 2026-05-15
**Valid until:** Phase 10 plan creation + execution complete (estimate: 1-3 days at standard cadence). The locked CONTEXT decisions and the shipped Phase 9 substrate mean this research has long shelf-life; only an upstream git regression or a CONTEXT re-open would invalidate it.

---

*Research for: Phase 10 — git-side parallel verbs + classifier extension*
*Phase requirements: PARALLEL-01 (git-side), PARALLEL-02 (git-side), VCS-18, TEST-13 (git contract tests), TEST-15, TEST-16*
*All CONTEXT.md decisions LOCKED; this research documents HOW, not WHETHER.*
