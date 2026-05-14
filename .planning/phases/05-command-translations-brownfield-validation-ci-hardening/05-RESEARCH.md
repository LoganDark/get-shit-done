# Phase 5: Command Translations + Brownfield Validation + CI Hardening - Research

**Researched:** 2026-05-13
**Domain:** Cross-backend command translation, workflow/agent prompt rewriting, jj-side CI hardening, Phase 4 A3 closure
**Confidence:** HIGH (all primary findings cross-verified against existing source; no LOW-confidence claims rely on training data only)

## Summary

Phase 5 closes the jj-port v1 by making every upstream GSD command work end-to-end on jj, rewriting the workflow markdown and agent prompts to be VCS-agnostic + SDK-mediated, graduating the jj CI lanes to required-blocking, and fixing the colocated pre-commit gap left open by Phase 4. The CONTEXT.md locks the major shape via D-31..D-38; this research file's job is to surface the concrete code locations, missing SDK verbs, and pitfall surface the planner needs.

The work is dominated by *mechanical edits in upstream files* (the seven hot markdown files have a combined ~227 raw-git invocations the PROMPT-* rewrites must touch) rather than novel design. Two non-mechanical lifts: (1) the A3 fix in `sdk/src/vcs/backends/jj.ts:250-264` (always-fire pattern with `GSD_HOOK_SKIP_COLOCATED` override), and (2) several new SDK query verbs that don't exist yet (`gsd-sdk query commit`, `gsd-sdk query push`, `gsd-sdk query reset`, plus possibly `branch-list`, `stash`, `worktree-list`).

CI graduation is real work, not a flag flip — Phase 4 LEARNINGS already documented the flake source (jj-integration test contention) and the soak window must demonstrate stability *after* the fixes land.

**Primary recommendation:** Structure plans per the D-38 hybrid-tiered shape (P1 foundational infra → P2 daily-driver → P3 lifecycle → P4 brownfield → P5 CI hardening + close). Add missing SDK verbs *in the foundational plan (P1)* so all downstream PROMPT rewrites have a stable target to dispatch through. Treat MIGR-02 as a sweep at P5 close rather than per-file fold-in — the bin/lib/*.cjs files already pass the lint guard; what remains is comment cleanup and (per inspection) likely zero call-site work.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-31 (Defer BROWN-01 / BROWN-02 to Phase 6):** Phase 5 will NOT run jj against this repo. This repo's `vcs.adapter` stays `git` (Phase 3 D-17) until Phase 6 lands the persistent flip alongside the `.planning/` SHA → change_id rewriter. The two are inseparable: flipping the adapter without the rewriter would orphan every commit-id reference recorded in `.planning/` files. BROWN-01 (brownfield commands verified against this repo's jj backend) and BROWN-02 (first weekly upstream rebase recorded after brownfield validation) therefore move to Phase 6. Phase 5 keeps CMD-01..11, PROMPT-01..03, CI-03.

  - **Roadmap amendment required (downstream task):** ROADMAP.md Phase 5 success criterion #3 currently reads "Brownfield commands … run end-to-end against this very repo's jj backend (dogfood)" — this must be moved to Phase 6's success criteria. Phase 5 success criterion #3 should be replaced (or removed) with synthetic-fixture-based CMD-10 coverage language. REQUIREMENTS.md BROWN-01 / BROWN-02 status table entries re-bucket from Phase 5 to Phase 6.
  - **Brownfield commands still tested in Phase 5:** synthetic-jj-fixture integration tests cover resume-work / pause-work / import / ingest-docs / map-codebase under the standard CMD-10 gate (D-34). Real-history dogfood happens in Phase 6 by definition (the migrated repo IS the dogfood target). Phase 5 explicitly documents the coverage gap so Phase 6 doesn't inherit a false sense of completeness.

**D-32 (A3 fix: Path 1 — always-fire + env override):** Closes Phase 4 LEARNINGS Open Q1. The jj adapter (`sdk/src/vcs/backends/jj.ts` `commit()`) fires `.githooks/pre-commit` after every `jj squash` regardless of colocation mode. `GSD_HOOK_SKIP_COLOCATED=1` env var as the escape hatch. Phase 4 D-10's "colocated no-op" branch is retired.

**D-33 (PROMPT vocabulary: agnostic prose + SDK-mediated mutations):** Workflow markdown stays VCS-neutral in prose; every mutation routes through `gsd-sdk query <verb>` or `bin/gsd <subcommand>`. Backend-aware conditionals (`if git: … if jj: …`) are PROHIBITED. Where a needed SDK verb does not yet exist, the plan that touches it adds the verb before rewriting the consumer.

**D-34 (CMD-10 brownfield gap documented):** Synthetic jj fixture integration tests only; NOT real-history dogfood on this repo. Explicit gap documentation in the brownfield-commands plan SUMMARY and 05-LEARNINGS.

**D-35 (MIGR-02 opportunistic per-file fold-in):** The 6 outstanding `bin/lib/*.cjs` files finish migration in the same Phase 5 plan that touches them; sweep remainder in Plan 5 if any plan doesn't touch them.

**D-36 (CI graduation):** (1) Identify + fix Phase 4 LEARNINGS-cited flake sources (concurrency, fixture-tmpdir). (2) 10 consecutive green nightly runs across BOTH `jj-colocated` AND `jj-native` lanes. Soak metric tracked in `.planning/intel/ci-jj-soak.md` (or equivalent). Then remove `continue-on-error: true` from matrix entries in `.github/workflows/test.yml`.

**D-37 (PROMPT-03 trust-installer):** Source-of-truth is canonical Claude markdown. `bin/install.js` transforms paths and tool names per target runtime (15+ runtimes). Phase 5 does NOT add a per-runtime smoke matrix.

**D-38 (Hybrid-tiered plan shape, 5–6 plans):** P1 foundational infra → P2 daily-driver → P3 lifecycle → P4 brownfield → P5 CI hardening + close, with optional P6.

### Claude's Discretion

- Exact plan boundaries within the hybrid-tiered shape (D-38 recommends 5 plans; planner can split finer)
- Where the roadmap-amendment lives (Plan 0 vs Plan 1)
- Order of MIGR-02 fold-in within each plan
- Exact synthetic-fixture shape for brownfield commands (P4)
- SDK verb additions needed mid-rewrite (D-33); verb naming subject to existing `gsd-sdk query` conventions
- Flake-fix mechanism (D-36 step 1): serialize tests, dedicated tmpdir factory, fixture pre-flight cleanup, etc.
- Soak-window bookkeeping file (D-36 step 2) name and shape
- `/gsd-pr-branch` revset for `.planning/`-only filtering (CMD-07)
- `/gsd-hotfix` bookmark `<id>` format (timestamp, change-id-short, etc.); naming pattern locked to `gsd/hotfix/<id>`
- PROMPT-03 verification depth (D-37): optional spot-check at phase close

### Deferred Ideas (OUT OF SCOPE)

- **BROWN-01 / BROWN-02 → Phase 6** (per D-31)
- Cross-workspace coordination primitive (`vcs.acquireRepoLock`) — Phase 4 D-20 stance unchanged
- HOOK-05 Tier 2 PATH-shim wrapper (`jj-with-hooks` binary) — v2
- Per-runtime smoke matrix for PROMPT-03 — D-37 trusts installer
- Full doc-only lint sweep for raw-git in markdown — planner's call (low-risk either way)
- Crash queue YAML frontmatter — unchanged, still v2
- 30s lock-acquisition timeout tuning (Phase 4 D-19 / D-28) — revisit with Phase 5/6 dogfood metrics

## Project Constraints (from CLAUDE.md)

- **GitHub access via `.envrc` GITHUB_TOKEN only:** `export GITHUB_TOKEN=$(grep GITHUB_TOKEN .envrc | cut -d\' -f2)` before every `gh` invocation. The ambient `gh auth` session resolves to enterprise credentials with no repo access. Relevant to Phase 5 because P5 (CI hardening) may need to read CI run history via `gh` to compute the 10-consecutive-green soak metric.
- **Issue tracker via GitHub Issues (`gsd-build/get-shit-done`):** See `docs/agents/issue-tracker.md`.
- **Memory rule "Use git (not jj) until migration lands":** Overrides jj/squash-model memories for THIS repo. THIS repo stays on `git` for all developer-side commits in Phase 5; `jj` work is in SYNTHETIC fixtures only (per D-31).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMD-01 | `/gsd-new-project` initializes jj-only repo when `.git` absent | jj auto-detection already in adapter (VCS-03 Complete); test fixture initializes via `jj init` (already used in vcsTest jj-native lane) |
| CMD-02 | `/gsd-plan-phase` works end-to-end on jj (lazy parent+merge octopus) | Phase 4 octopus helpers landed (`sdk/src/vcs/jj/octopus.ts`); integration test needs synthetic phase fan-out |
| CMD-03 | `/gsd-execute-phase` runs subagents through octopus flow | Phase 4 `vcs.workspace.{add,forget,reap}` + `performJjReap` + `acquireJjWriteLock` all production-ready; needs PROMPT-01 rewrite of `execute-phase.md:705-862` worktree cleanup loop |
| CMD-04 | `/gsd-discuss-phase`, `/gsd-verify-work`, `/gsd-complete-milestone` work on jj | `complete-milestone.md:610-748` has 36 raw git mentions (merge-squash, branch listing, tag creation) — substantial rewrite surface |
| CMD-05 | `/gsd-quick` uses single `jj squash` on `@` (no octopus, no workspace) | `quick.md:639-651,894-1063` invokes `git add` / `git commit` / `git rev-parse` directly; rewrite to `gsd-sdk query commit` (verb to be added) |
| CMD-06 | `/gsd-undo` translates `git reset` to per-commit `jj abandon <change>` | `undo.md` uses `git revert --no-commit` exclusively, NOT `git reset` (status:213 prohibits reset); jj path is `jj abandon <change_id>` per commit — see SDK verb additions below |
| CMD-07 | `/gsd-pr-branch` filters `.planning/`-only commits via revset; `jj duplicate` onto new bookmark | Revset candidates: `~files('.planning/')` or `~ files(glob:".planning/**")` — see Section "jj idioms" |
| CMD-08 | `/gsd-hotfix` uses `jj new <past-change-id>`; bookmark `gsd/hotfix/<id>` | `<past-change-id>` source: user input → resolve via `vcs.refs.resolveShort` or `expr.rev` translator |
| CMD-09 | `/gsd-ship` performs explicit `vcs.push()` (no auto-push) | `vcs.push()` already in adapter on both backends (Phase 3 plan 03-06); needs `gsd-sdk query push` verb shim |
| CMD-10 | `/gsd-resume-work`, `/gsd-pause-work`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-map-codebase` work on jj | Synthetic fixtures only (D-34); no dogfood |
| CMD-11 | Hotfix, canary, complete-milestone, multi-workspace flows preserved | CI-03 docs note: GitHub workflows stay on git; complete-milestone is in CMD-04 scope |
| PROMPT-01 | Workflow markdown rewritten VCS-agnostic | 7 hot files, ~227 git mentions total; mechanical per-line swap |
| PROMPT-02 | Agent definitions rewritten | `gsd-code-fixer.md` (37 mentions, ~50 lines around `git worktree add/remove` cleanup tail) + `gsd-executor.md` (33 git lines around isolation guards) |
| PROMPT-03 | Multi-runtime variants synced | Trust `bin/install.js`; planner can spot-check one runtime install at phase close |
| BROWN-01 | (RE-BUCKET TO PHASE 6 per D-31) | — |
| BROWN-02 | (RE-BUCKET TO PHASE 6 per D-31) | — |
| CI-03 | GitHub Actions workflows stay on git; jj CI lanes graduate to required-blocking | `.github/workflows/test.yml:60-64` flips after fix + 10-green soak |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workflow prose (LLM instruction) | Markdown prompt files | — | VCS-agnostic prose lives here; mutations dispatched downward via SDK query |
| VCS dispatch (per-backend translation) | `sdk/src/query/*.ts` + `sdk/src/vcs/backends/*.ts` | `bin/lib/*.cjs` | Adapter chooses git vs jj at construction; query verbs are the public surface markdown calls |
| Hook firing | `sdk/src/vcs/hook-bridge.ts` + `sdk/src/query/hooks.ts` | `sdk/src/vcs/backends/jj.ts commit()` | `fireHook` private helper; SDK query bridge is the markdown-callable shim; jj backend fires internally post-squash |
| Octopus / workspace lifecycle | `sdk/src/vcs/jj/octopus.ts` + `sdk/src/vcs/jj/reap.ts` + `sdk/src/vcs/backends/jj.ts workspace.*` | `execute-phase.md` orchestrator prose | Sidecar files (UPSTREAM-02); markdown delegates entire lifecycle to SDK |
| CI matrix activation | `.github/workflows/test.yml` | `.planning/intel/ci-jj-soak.md` | One-line flag flip after soak; soak file is bookkeeping |
| Synthetic fixtures (CMD-* integration tests) | `sdk/src/vcs/__tests__/jj-*.test.ts` (sidecar test files) | `tests/helpers.cjs` (`vcsTest`, `vcsMultiWsTest`) | Existing fixture factories cover most cases; new factories only where existing matrix can't reach |
| MIGR-02 cleanup | `get-shit-done/bin/lib/*.cjs` comment text | — | (Verified: zero raw-git call sites remain; only comment/string mentions exist — lint guard reports 0 violations) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `VcsAdapter` | n/a (in-repo) | All mutation dispatch | Phases 1-4 produced; v1-stable per HOOK-05 |
| `fireHook` helper | `sdk/src/vcs/hook-bridge.ts` | Direct shell of `.githooks/<stage>` | Exported in Phase 4 plan 01 per D-07 |
| `gsd-sdk query hooks.fire` | `sdk/src/query/hooks.ts` | CLI-level explicit-fire bridge | Landed Phase 4 plan 04-06; the prototype other PROMPT rewrites mirror |
| jj 0.41.0 | pinned via release tarball (CI) | Backend binary | Phase 3 D-14 lock; no version change in Phase 5 |
| vitest | (already pinned upstream) | Integration test runner | Phase 03.1 baseline established |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vcsTest(kind)` fixture | in-repo | Single-workspace per-backend tests | Most CMD-* integration tests |
| `vcsMultiWsTest(kind, n)` | in-repo (Phase 4) | Multi-workspace tests | CMD-03 octopus tests, CMD-07 PR-branch cross-bookmark cases |
| `acquireJjWriteLock` | in-repo (Phase 4 plan 04-03) | RAII jj write lock | Any synthetic CMD-* fixture that mutates concurrently |
| `performJjReap` | in-repo (Phase 4 plan 04-04) | Subagent head reaping | CMD-03 octopus cleanup |
| `expr.rev`, `expr.range`, `expr.bookmark` factories | in-repo | RevisionExpr construction | All new SDK verbs needing rev arguments |
| `validateRefname` + `--` separator | in-repo (Phase 4 D-24) | Bookmark name argv-injection guard | `gsd-sdk query branch-list` / `pr-branch` / `hotfix` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Always-fire pre-commit (Path 1) | Detect-and-probe at adapter init (Path 2) | Path 2 is more robust but adds adapter-init cost and complexity; **D-32 locks Path 1** |
| New SDK query verbs (`commit`, `push`, `reset`) | Inline `vcs.<verb>()` calls in markdown | Markdown cannot call TypeScript directly; SDK query is the shell-callable bridge per D-08/D-33 |
| Real-history brownfield dogfood (BROWN-01/02) | Synthetic-fixture coverage only | Real dogfood structurally impossible before Phase 6 SHA→change_id rewriter (D-31) |
| Per-runtime smoke matrix for PROMPT-03 | Trust installer pipeline (D-37) | Installer is canonical upstream work; replicating would balloon CI cost |

**Installation:** No new npm packages required. All Phase 5 work uses existing repo dependencies.

**Version verification:** N/A — no new package recommendations.

## Package Legitimacy Audit

Not applicable — Phase 5 installs no new external packages. The phase consumes existing repo modules (`sdk/src/vcs/*`, `sdk/src/query/*`) and the already-pinned jj 0.41.0 binary (CI-installed per Phase 3 D-14). No `package.json` `dependencies` / `devDependencies` additions anticipated by D-31..D-38.

## Architecture Patterns

### System Architecture Diagram

```
Markdown workflow / agent prompt (VCS-agnostic prose)
        │
        ▼  (shell-callable surface)
gsd-sdk query <verb>  ──or──  bin/gsd <subcommand>
        │
        ▼  (Node import)
SDK query handler  (sdk/src/query/*.ts)
        │
        ▼  (factory)
createVcsAdapter(cwd, opts)  ──reads── .planning/config.json vcs.adapter
        │
        ├─── git backend  (sdk/src/vcs/backends/git.ts)  ──shells──> git
        │
        └─── jj backend   (sdk/src/vcs/backends/jj.ts)
                ├─ commit()       ──shells──> jj squash + fireHook('pre-commit')
                ├─ push()         ──shells──> firePrePushHook + jj git push
                ├─ workspace.*    ──shells──> jj workspace add/forget/list
                ├─ refs.*         ──shells──> jj bookmark CRUD
                └─ findConflicts  ──shells──> jj log -r 'conflicts()'
        │
        ▼  (via hook-bridge.ts)
fireHook(cwd, stage)  ──shells──> .githooks/<stage>
```

**Component responsibilities table:**

| Component | File | Responsibility |
|-----------|------|----------------|
| LLM prompt (Phase 5 rewrite) | `get-shit-done/workflows/*.md`, `agents/*.md` | VCS-agnostic prose; dispatch via SDK query |
| SDK query bridge | `sdk/src/query/{hooks,commit,push,reset,...}.ts` | Shell-callable bridge from prompt to adapter |
| Adapter factory | `sdk/src/vcs/index.ts` | Detect backend, return frozen object |
| jj backend impl | `sdk/src/vcs/backends/jj.ts` | All jj-side shelling; A3 fix lives here |
| jj sidecar logic | `sdk/src/vcs/jj/*.ts` | Octopus, reap, lock, pre-push (UPSTREAM-02 zero-conflict surface) |
| Hook bridge | `sdk/src/vcs/hook-bridge.ts` | Single `fireHook` helper (private export → public via Phase 4 plan 01) |
| CI matrix | `.github/workflows/test.yml` | Three backends: git, jj-colocated, jj-native |
| Synthetic fixtures | `sdk/src/vcs/__tests__/*.test.ts`, `tests/helpers.cjs` | `vcsTest` / `vcsMultiWsTest` factories |

### Recommended Project Structure

No new top-level structure. Phase 5 work lands in:

```
.planning/phases/05-command-translations-brownfield-validation-ci-hardening/
├── 05-CONTEXT.md       (exists)
├── 05-RESEARCH.md      (this file)
├── 05-PLAN.md          (per-plan; planner creates)
├── 05-XX-PLAN.md       (per-plan, padded)
└── 05-LEARNINGS.md     (phase close)

sdk/src/query/
├── commit.ts           (exists — extend for jj-backend correctness if any gap surfaces)
├── push.ts             (NEW — wraps vcs.push())
├── reset.ts            (NEW — wraps vcs.gitOnly.* or jj abandon decomposition)
├── undo.ts             (NEW or fold into reset.ts — caller picks)
├── hooks.ts            (exists)
└── ...

sdk/src/vcs/backends/jj.ts          (A3 fix lines 250-264; D-32)
sdk/src/vcs/jj/                     (sidecar — UPSTREAM-02)

.planning/intel/
├── ci-jj-soak.md       (NEW — D-36 step 2 metric file; planner picks name)
└── git-touchpoints.md  (exists — possible refresh at phase close)

get-shit-done/workflows/             (PROMPT-01 rewrite targets)
agents/                              (PROMPT-02 rewrite targets)
```

### Pattern 1: SDK Query Verb (D-33 mandated form)

**What:** A new `sdk/src/query/<verb>.ts` exporting a `QueryHandler` that creates an adapter and delegates to a `vcs.<method>()` call.
**When to use:** Any markdown prompt that currently shells `git <verb>` and lacks a Phase 4 bridge equivalent.
**Example (mirroring `sdk/src/query/hooks.ts`):**

```typescript
// Source: sdk/src/query/hooks.ts (Phase 4 plan 04-06) — verbatim pattern
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const pushQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let remote: string | undefined;
  let bookmark: string | undefined;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[i + 1]; i++; }
    else if (args[i] === '--remote' && args[i + 1]) { remote = args[i + 1]; i++; }
    else if (args[i] === '--bookmark' && args[i + 1]) { bookmark = args[i + 1]; i++; }
    else if (args[i] === '--force') force = true;
  }
  const vcs = createVcsAdapter(cwd);
  const result = await vcs.push({ remote, bookmark, force });
  return { data: { ok: result.exitCode === 0, ...result } };
};
```

### Pattern 2: Always-Fire Hook (D-32)

**What:** Remove the `isColocated` branch from `jj.ts commit()`; unconditional `fireHook('pre-commit', ...)`; add `GSD_HOOK_SKIP_COLOCATED` env-var escape.
**When to use:** Exactly once — in P1 foundational infra, replacing `sdk/src/vcs/backends/jj.ts:250-264`.

```typescript
// Current (sdk/src/vcs/backends/jj.ts:250-264) — REMOVE this branch:
if (!input.noVerify) {
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  if (!isColocated) {
    const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
    // ...
  }
  // colocated: no-op  ← Phase 4 D-10; REFUTED by A3 empirical probe
}

// Phase 5 replacement (D-32):
if (!input.noVerify) {
  const skipColocated = process.env.GSD_HOOK_SKIP_COLOCATED === '1';
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  if (!skipColocated || !isColocated) {
    const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
    if (hookRes.exitCode !== 0) {
      mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
    }
  }
}
```

### Pattern 3: VCS-Agnostic Prose Rewrite

**What:** Replace inline shell `git <verb>` with prose + SDK query call, never branching on backend.
**When to use:** Every PROMPT-01/02 rewrite.

```bash
# BEFORE (execute-phase.md:689):
git hook run pre-commit 2>&1 || echo "⚠ Pre-commit hooks failed"

# AFTER (D-33):
gsd-sdk query hooks.fire pre-commit --cwd . 2>&1 \
  || echo "⚠ Pre-commit hooks failed"
```

```bash
# BEFORE (quick.md:651):
git commit -m "docs(${quick_id}): ..." -- "${QUICK_DIR}/${quick_id}-PLAN.md"

# AFTER (D-33 + new gsd-sdk query commit verb):
gsd-sdk query commit \
  --message "docs(${quick_id}): ..." \
  --files "${QUICK_DIR}/${quick_id}-PLAN.md"
```

### Anti-Patterns to Avoid

- **Backend conditional in markdown** (`if vcs.adapter == 'jj'; then ... else ...; fi`): explicitly prohibited by D-33. Forks the prompt and balloons rebase conflict surface.
- **Shelling jj directly from markdown** (`jj squash -B @ ...`): violates the no-raw-git principle's spirit (no raw VCS commands in prompts; everything via SDK).
- **Reshaping surrounding logic during a PROMPT rewrite**: per UPSTREAM-03 (mechanical-only), the rewrite is shape-for-shape. Don't refactor surrounding bash logic in the same commit.
- **Adding allowlist entries to `lint-vcs-no-raw-git.cjs`**: Phase 5 must NOT add entries (D-22 from Phase 2.1 still binding). If markdown gets scanned (planner's call), use inline `// vcs-lint:allow-git-here` annotations only where a fallback to git is structurally required (e.g., a section explicitly about git-only behavior).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hook firing in workflows | Custom subprocess invocation | `gsd-sdk query hooks.fire <stage>` | Already shipped in Phase 4 plan 04-06; cross-backend |
| Workspace creation | Direct `git worktree add` or `jj workspace add` in markdown | `vcs.workspace.add()` via SDK query | Phase 4 unified surface; mkdir-p guard built in (D-17) |
| Octopus structure | Custom `jj new -A parent -B merge` shelling | `createPhaseStructure` / `createSubagentSlot` from `sdk/src/vcs/jj/octopus.ts` | Phase 4 plan 04-05 |
| Pre-push hook | Inline `acarapetis/jj-pre-push` Python | `firePrePushHook` from `sdk/src/vcs/jj/pre-push.ts` | Phase 4 plan 04-06 — Python-free inline replication, ~120 LOC |
| Bookmark refname validation | Inline regex check | `validateRefname` from `sdk/src/vcs/refs-validator.ts` | Phase 4 plan 04-07 D-24 |
| jj/git revset translation | Hand-write `HEAD` → `@-` mappings | `toJjRev`, `expr.rev`, `expr.range` from `sdk/src/vcs/parse/*-rev.ts` and `expr.ts` | Phase 1 + Phase 2.1 D-13 |
| Test fixtures | Spin up jj repos manually | `vcsTest(kind)`, `vcsMultiWsTest(kind, n)` | Phase 1/4; covers both backends + isolation |
| RAII jj lock | flock + cleanup loop | `acquireJjWriteLock` from `sdk/src/vcs/jj/lock.ts` | Phase 4 plan 04-03 |
| Conflict probe | Parse `jj log` output ad-hoc | `vcs.findConflicts({scope:'all'})` from adapter | Phase 3 plan 03-05 — uses correct `conflicts()` plural revset |

**Key insight:** The substrate is overwhelmingly complete. Phase 5 is primarily *consumption* of Phase 1-4 infrastructure plus targeted gap-fills (A3 fix, new SDK query verbs). Resist the urge to introduce a new abstraction layer for any of the items above.

## Runtime State Inventory

Phase 5 is **not a rename / refactor / migration phase**. It is feature work (CMD-* end-to-end correctness, PROMPT rewrites, CI graduation). No stored data, live service config, OS-registered state, secrets, or build artifacts encode names that change in Phase 5. The only "rename" surface — BROWN-01/02 re-bucketing — is purely a `.planning/REQUIREMENTS.md` + `.planning/ROADMAP.md` text edit with no downstream runtime impact (those values are not consumed by any runtime).

**Verified blank:** No category required investigation; Phase 5 deliverables are file edits + new SDK files only.

## Consumer Call-Site Inventory for PROMPT Rewrites

Verified via grep of the seven hot files. Each entry is "raw shell pattern → recommended SDK substitute" grouped by mutation type.

### `get-shit-done/workflows/execute-phase.md` (58 mentions, 1772 LOC)

| Lines | Pattern | Mutation Type | SDK substitute | Verb exists? |
|-------|---------|---------------|----------------|--------------|
| 92 | `git config --file .gitmodules --get-regexp 'submodule\..*\.path$'` | read (config) | `gsd-sdk query config-get` or inline-keep (`.gitmodules` parse is git-only by nature) | (config-get exists; submodule-aware variant may need adding) |
| 154 | `git log --oneline --grep="..."` | read (log) | `gsd-sdk query log --grep` | NEW — does not exist |
| 248-267 | `git symbolic-ref` / `git switch` / `git fetch` / `git checkout -b` | branch/switch | `gsd-sdk query switch-or-create-branch` | NEW — composite verb |
| 352, 377 | `git diff --quiet HEAD`, `git status`, `git diff` | read (working tree) | `gsd-sdk query status` (verb exists per `vcs.status`); `gsd-sdk query diff --quiet` | partial — status exists in adapter, query-shim needed |
| 496, 549-552 | `git rev-parse HEAD`, `git merge-base`, `git reset --hard` | read + reset | `gsd-sdk query rev-parse`, `gsd-sdk query reset --to <rev>` | reset is NEW |
| 539-545 | `git symbolic-ref --quiet HEAD`, `git rev-parse --abbrev-ref HEAD` | read (HEAD/branch) | `gsd-sdk query head-ref`, `gsd-sdk query current-branch` | NEW — but Phase 2.1 D-15 already locked `vcs.refs.currentBookmarks()` shape |
| 668, 675 | `git log --oneline --all --grep=...` | read (log/commits) | same as 154 | NEW |
| 682-690 | **`git hook run pre-commit`** + `git stash push -u`, `git stash pop` | hook + stash | `gsd-sdk query hooks.fire pre-commit` (D-32 hand-off target) + `gsd-sdk query stash`/`stash-pop` | hooks.fire EXISTS; stash is NEW |
| 705-862 | `git worktree list --porcelain`, `git worktree remove`, `git worktree prune`, `git branch -D`, `git merge`, `git ls-files`, `git diff --diff-filter=*`, `git rm`, `git add`, `git commit --amend`, `git reset --hard HEAD~1`, `git log --follow` | workspace cleanup + merge back | `vcs.workspace.{list, forget, prune}` + `vcs.commit` + `vcs.gitOnly.*` for git-only verbs | partial — workspace.* exists; merge-back orchestration likely a composite new query |
| 907-963 | `git diff --quiet`, `git log --oneline --all --grep=` | read | as above | NEW |

### `get-shit-done/workflows/quick.md` (46 mentions, 1121 LOC)

| Lines | Pattern | Mutation Type | SDK substitute | Verb exists? |
|-------|---------|---------------|----------------|--------------|
| 165 | `git config --file .gitmodules` | read | same as execute-phase | partial |
| 191-226 | `git symbolic-ref`, `git switch`, `git fetch`, `git checkout -b` | branch/switch | composite — same as execute-phase | NEW |
| 639-651 | `git add ${PLAN}` + `git diff --cached --quiet` + `git commit [--no-verify] -m '...'` | commit | `gsd-sdk query commit --message --files --no-verify` | **NEW (HIGHEST PRIORITY)** |
| 665, 681-699 | `git rev-parse HEAD`, `git symbolic-ref`, `git merge-base`, `git reset --hard` | read + reset | as above | NEW |
| 718-725 | `git diff --cached --name-only` (in submodule guard) | read | `gsd-sdk query diff --cached --name-only` | partial |
| 774-864 | (Same worktree cleanup pattern as execute-phase) | workspace | `vcs.workspace.*` | partial — copy-paste of execute-phase pattern |
| 892-904 | `git log --oneline --format="%H" --grep`, `git rev-parse`, `git diff --name-only` | read (commit discovery) | `gsd-sdk query log --grep --format` | NEW |
| 1054-1063 | `git add ${file_list}` + `git rev-parse --short HEAD` | commit | as above | NEW |

### `get-shit-done/workflows/complete-milestone.md` (36 mentions, 847 LOC)

| Lines | Pattern | Mutation Type | SDK substitute | Verb exists? |
|-------|---------|---------------|----------------|--------------|
| 172-176 | `git log --oneline --grep="feat("`, `git diff --stat`, `git log --format="%ai"` | read (stats) | `gsd-sdk query log` with options | NEW |
| 505, 758 | `git rm .planning/REQUIREMENTS.md`, `git commit -m` | delete + commit | `gsd-sdk query commit --files` (with deletion semantics — git backend handles via `git add -A`; jj uses `jj file untrack` + squash) | NEW (deletion path may need adapter gap-fill) |
| 610-704 | `git branch --list`, `git branch --show-current`, `git checkout`, `git merge --squash`, `git merge --no-ff --no-commit`, `git reset HEAD .planning/`, `git commit -m`, `git branch -d/D` | branch CRUD + merge | `gsd-sdk query branch-list`, `gsd-sdk query merge` (composite), `vcs.refs.bookmarks.delete` | branch-list NEW; merge NEW; deletion exists via adapter |
| 727-730, 748 | `git tag -a v[X.Y] -m`, `git push origin v[X.Y]` | tag + push | `gsd-sdk query tag` (git-only path → `vcs.gitOnly.createAnnotatedTag`; jj uses `gsd/release/<version>` bookmark per REFS-06) + `gsd-sdk query push` | tag is git-only escape (REFS-06); push is NEW |

### `get-shit-done/workflows/undo.md` (15 mentions, 314 LOC)

| Lines | Pattern | Mutation Type | SDK substitute | Verb exists? |
|-------|---------|---------------|----------------|--------------|
| 53, 85-87, 97 | `git log --oneline --no-merges` (with `--all` and grep filters) | read (commit list) | `gsd-sdk query log --no-merges --grep` | NEW |
| 205 | `git status --porcelain` | read | `gsd-sdk query status --porcelain` | partial — adapter has `vcs.status`; query shim NEW |
| 217-228 | `git revert --no-commit <HASH>`, `git revert --abort`, `git reset HEAD`, `git restore .` | revert / reset | **CMD-06 jj translation:** for jj backend, `git revert --no-commit <H>` decomposes into `jj abandon <change_id>` per commit (per CMD-06 spec). New verb: `gsd-sdk query revert --no-commit <rev>` (dispatches per backend) | NEW |
| 249-259 | `git commit -m "revert(...)"` | commit | `gsd-sdk query commit` | NEW |

**Important nuance for CMD-06:** Status:213 explicitly hard-prohibits `git reset --hard` in this workflow. The CMD-06 translation rule from REQUIREMENTS.md (`git reset → jj abandon`) does NOT apply to undo.md, because undo.md uses `git revert --no-commit`, not `git reset`. The actual jj translation needed in undo.md is `git revert --no-commit <H>` → **`jj abandon <change_id>`** (which is destructive on jj — different semantics from git revert which creates an inverse commit). Planner must reconcile: either (a) the jj-side undo verb creates a new inverse-content commit (preserves history like git revert), or (b) accept that jj undo is destructive (jj's idiomatic model — op log is the safety net). Recommend (b) with explicit prose noting the semantic shift; jj's op-log undo (`jj op restore`) is the recovery path, which is the JJOP-01 jj-only improvement deferred to v2.

### `get-shit-done/workflows/code-review.md` (11 mentions, 523 LOC)

| Lines | Pattern | Mutation Type | SDK substitute | Verb exists? |
|-------|---------|---------------|----------------|--------------|
| 128 | `git rev-parse --show-toplevel` | read (repo root) | `gsd-sdk query repo-root` | NEW — but trivial composite |
| 212-232 | `git log --oneline --all --grep="${PADDED_PHASE}"`, `git rev-parse`, `git diff --name-only <BASE>..HEAD` | read (diff scope) | `gsd-sdk query log --grep` + `gsd-sdk query diff --name-only --range` | NEW |
| 329 | `git log --oneline --all --grep` (re-occurrence of 212) | read | same | NEW |

### `agents/gsd-code-fixer.md` (37 mentions, 668 LOC)

| Lines | Pattern | Mutation Type | SDK substitute | Verb exists? |
|-------|---------|---------------|----------------|--------------|
| 77, 87, 608 | `git checkout -- {file}` (rollback uncommitted change) | restore | `gsd-sdk query restore --file` or `vcs.gitOnly.restore` (jj equivalent: `jj restore <path> --from @-` — see FEATURES "git checkout <path>") | NEW |
| 223-260 | `git branch --show-current`, `git worktree list --porcelain`, `git worktree remove --force`, `git branch -D` | workspace + branch cleanup | `vcs.workspace.list/forget` + `vcs.refs.bookmarks.delete` | EXISTS |
| 269-279, 297-301 | `git worktree add -b "$reviewfix_branch" "$wt" "$branch"` | workspace creation | `vcs.workspace.add(path, { atRevision, branch: 'create' })` | exists for add; `branch: 'create'` shape NEEDS adapter gap-fill |
| 315-355 | `git worktree list --porcelain`, `git -C $main_repo merge --ff-only`, `git worktree remove --force`, `git branch -D`, `git -C $main_repo branch -D` | merge-back + cleanup | `vcs.workspace.list` + `gsd-sdk query merge --ff-only` (NEW) + `vcs.workspace.forget` | partial |
| 421, 477, 587-589, 595, 629, 636, 661 | (prose mentioning git operations described above) | docs | rewrite prose | n/a |

### `agents/gsd-executor.md` (24 mentions, 728 LOC) — 33 git-prefixed lines total

| Lines | Pattern | Mutation Type | SDK substitute | Verb exists? |
|-------|---------|---------------|----------------|--------------|
| 354, 380, 629 | `git log --oneline -5`, `git log --oneline --all` | read | `gsd-sdk query log --max-count` | NEW |
| 414-463 | `git rev-parse --git-dir`, `git rev-parse --show-toplevel`, `git symbolic-ref --quiet HEAD`, `git rev-parse --abbrev-ref HEAD` | read (HEAD/repo) | composite query bridges | NEW (or composite over `vcs.refs.head` + `vcs.workspace.context`) |
| 477-516 | `git status --short`, `git add <file>`, `git commit -m "..."`, `git rev-parse --short HEAD` | commit cycle | `gsd-sdk query status` + `gsd-sdk query commit` | NEW (commit is highest priority) |
| 521-557 | `git diff --diff-filter=D --name-only HEAD~1 HEAD`, `git status --short | grep '^??'`, `git clean -fd` (PROHIBITED), `git checkout -- file`, `git push --force` (PROHIBITED) | read + restore (with prohibition prose) | `gsd-sdk query diff` + `gsd-sdk query restore` (prohibition prose stays as-is) | NEW |

### Summary of missing SDK verbs

The PROMPT rewrites need the following verbs added in P1 (foundational infra) before downstream plans consume them:

1. **`gsd-sdk query commit`** — wraps `vcs.commit({files, message, noVerify})`. **Highest priority** — consumed by `quick.md`, `complete-milestone.md`, `undo.md`, `gsd-executor.md`. Note: a low-level `commit` query handler likely exists at `sdk/src/query/commit.ts` already; verify whether its argv shape matches markdown's needs or whether a new shim is required.
2. **`gsd-sdk query push`** — wraps `vcs.push({remote, bookmark, force})`. Consumed by `/gsd-ship` (CMD-09) and `complete-milestone.md`.
3. **`gsd-sdk query reset`** — wraps `vcs.gitOnly.*` (git side) and `jj abandon` decomposition (jj side). Consumed by `execute-phase.md`, `quick.md` worktree-base recovery blocks.
4. **`gsd-sdk query revert`** — wraps `git revert --no-commit` (git) vs `jj abandon` (jj). Consumed by `undo.md` (CMD-06). Semantic shift documented inline.
5. **`gsd-sdk query log`** — wraps `vcs.log({grep, maxCount, allRefs, range, format})`. Consumed by 6/7 hot files for commit discovery.
6. **`gsd-sdk query status`** — wraps `vcs.status({porcelain, short})`. Consumed by `undo.md`, `gsd-executor.md`.
7. **`gsd-sdk query diff`** — wraps `vcs.diff({range, nameOnly, nameStatus, cached, quiet, paths})`. Consumed widely.
8. **`gsd-sdk query branch-list`** — wraps `vcs.refs.bookmarks.list({prefix})`. Consumed by `complete-milestone.md`.
9. **`gsd-sdk query head-ref`** / **`gsd-sdk query current-branch`** — wrap `vcs.refs.head` + `vcs.refs.currentBookmarks()`. Consumed by `execute-phase.md`, `quick.md`, `gsd-executor.md`.
10. **`gsd-sdk query merge`** — wraps `git merge --squash` / `git merge --no-ff` (git side); jj side is `jj new <parent1> <parent2>` per FEATURES. Composite. Consumed by `complete-milestone.md`, `gsd-code-fixer.md`.
11. **`gsd-sdk query worktree-list`** — wraps `vcs.workspace.list()`. (Or stay with direct `vcs.workspace.list` invocation if a CJS bridge already exists — verify.)
12. **`gsd-sdk query restore`** — wraps `git checkout -- <file>` (git) vs `jj restore <file>` (jj). Consumed by `gsd-code-fixer.md`.
13. **`gsd-sdk query stash`** / **`gsd-sdk query stash-pop`** — git side only at first; jj has no stash. **Decision needed:** either (a) markdown drops the stash pattern entirely on jj backend (jj auto-snapshots), or (b) the SDK query no-ops on jj. Per FEATURES section "stash" the jj-idiomatic answer is `jj new` on a sibling change. Recommend stash being a `vcs.gitOnly.*` operation with a documented jj no-op equivalent; markdown can call it freely and the dispatcher handles divergence.

**Two patterns at the query layer:**
- **Cross-backend dispatch** (most verbs above): adapter selects per backend; markdown is fully agnostic.
- **`vcs.gitOnly.*` escape hatch:** for git-only operations like annotated tags (REFS-06 says jj uses bookmarks), the query layer can shell `vcs.gitOnly.<verb>` and error clearly on jj. Pattern locked from VCS-03 / Phase 1.

## Missing SDK Verbs — Verification

Verified by grepping `sdk/src/query/`:

**Already exists (no addition needed):**
- `commit.ts` (creates commits via `vcs.commit`; verify argv shape matches markdown's expected `--message --files --no-verify` after Phase 5 P1 rewrite)
- `hooks.ts` (hooks.fire bridge; Phase 4 plan 04-06)
- `workspace.ts` (workspace context resolution; not workspace-list — needs verifying)
- `check-ship-ready.ts` (consumed by `/gsd-ship` but not the push primitive itself)

**Verified missing (must add in P1):**
- `push.ts`
- `reset.ts` (or `undo.ts` as composite)
- `revert.ts` (or fold into above)
- `log.ts`
- `status.ts`
- `diff.ts`
- `branch-list.ts`
- `head-ref.ts` / `current-branch.ts`
- `merge.ts`
- `restore.ts`
- `stash.ts` / `stash-pop.ts` (git-only operations with `vcs.gitOnly.*` shape; **planner's call** whether to add at all or just keep markdown's existing inline shell)

**Estimated verb-addition cost:** ~50-100 LOC per verb (mirroring `hooks.ts` shape). Total ~12 verbs × 80 LOC ≈ 1000 LOC of new SDK query code, plus paired tests. P1 is sized to absorb this.

## A3 Fix Concrete Shape (D-32)

**Exact diff:** `sdk/src/vcs/backends/jj.ts:250-264`. See Pattern 2 above for the replacement code.

**Test fixture coverage:**

- `sdk/src/vcs/__tests__/jj-hooks.test.ts` exists (Phase 4 plan 04-06 added it as the harness that empirically refuted A3). Phase 5 P1 must:
  1. Update the existing colocated-mode test to assert pre-commit DOES fire post-squash (the test currently asserts it does NOT — that assertion encoded the buggy D-10 design).
  2. Add a new test case for `GSD_HOOK_SKIP_COLOCATED=1` env override (asserts the no-op branch only when env var is set).
  3. The `vcsTest(kind)` matrix already covers `git`, `jj-colocated`, `jj-native` axes; the test runs against all three automatically.

**Regression risk:** Hooks that weren't expecting the fire in colocated mode could now double-fire if (and only if) a future jj release adds auto-fire behavior. Mitigation: hooks should be idempotent (LEARNINGS Open Q1 explicit rationale). The `GSD_HOOK_SKIP_COLOCATED=1` env override is the escape hatch.

**Confidence:** HIGH (locked by D-32; implementation is a 10-line diff in a single function).

## jj Idioms for New Command Translations (CMD-06..08)

### `/gsd-undo` (CMD-06)

**Git side (existing):** `git revert --no-commit <HASH>` per commit, then `git commit -m "revert(...)"`.

**jj side:** `jj abandon <change_id>` per commit. **Semantic shift:** jj abandon is destructive (the change moves to op log; the operation log is the safety net via `jj op restore`). Unlike git revert, no inverse-content commit is created.

**Change-id discovery shape:**
- Input from the manifest (preferred): `gsd-sdk query manifest --phase XX` returns change_ids already.
- Fallback (manifest missing): `vcs.log({grep: '^...(${TARGET_PHASE}', allRefs: true})` returns LogEntry[]; map to `change_id` via the jj backend's NDJSON output. **Note:** `LogEntry.hash` is `commit_id`, not `change_id` (per `sdk/src/vcs/backends/jj.ts:310-311` PITFALL 1 comment). Need a parallel field or a separate revset-based lookup. Adapter gap-fill candidate: extend `LogEntry` to include `change_id` on jj backend, or add a separate `vcs.refs.changeId(rev)` query.

### `/gsd-pr-branch` (CMD-07)

**Strategy locked by ROADMAP:** filter via revset, materialize via `jj duplicate` onto a new bookmark.

**Revset candidates** (planner's discretion):
- `~ files('.planning/')` — exclusion of revs that touch only `.planning/` paths. Caveat: this excludes ALL revs that touch `.planning/`, even mixed commits. Per ROADMAP wording "filters OUT `.planning/`-only commits", the precise revset is "revs that are NOT-only-planning":
  - `~ files(glob:".planning/**") & ~ empty()` — mixed commits (some non-planning files) survive
  - **Better:** `parents('phase-bookmark')..@ ~ files(glob:".planning/**")` — phase-range minus planning-only revs
  - Even more precise: `(parents('phase-bookmark')..@) - (files(glob:".planning/**") - ~files(glob:".planning/**"))` — keep revs that have at least one non-planning file
- Verify revset behavior empirically against synthetic fixture before locking; jj 0.41's revset documentation at https://docs.jj-vcs.dev/v0.41.0/revsets/ is authoritative.

**Materialization:** `jj duplicate <revset> --destination <new_bookmark_head>` then `vcs.refs.bookmarks.create('gsd/pr/<id>', new_head)`. Preserves the original history per ROADMAP wording.

### `/gsd-hotfix` (CMD-08)

**Strategy locked by ROADMAP:** `jj new <past-change-id>` to root work at historical change; standard squash flow; new `gsd/hotfix/<id>` bookmark; explicit push.

**`<past-change-id>` source (planner's discretion):**
- User argument: `/gsd-hotfix --base v1.2` → resolve `v1.2` via `vcs.refs.bookmarks.exists('gsd/release/v1.2')` (REFS-06 bookmark for tag-equivalents on jj) → get its `@` change_id.
- Latest tag (no arg): list bookmarks under `gsd/release/` prefix, sort by version, pick latest.

**`<id>` format for `gsd/hotfix/<id>`:** Recommendation: short timestamp `YYYYMMDD-HHMM` or short-change-id (8 chars). Timestamp avoids collisions across multiple hotfixes on the same base; change-id-short is more semantic. Planner picks; both work.

### `/gsd-ship` (CMD-09)

**Strategy locked by REQUIREMENTS:** explicit `vcs.push()` (no auto-push); bookmark-based release tags.

**Current push call-site:**
- `vcs.push()` exists in adapter on both backends (jj.ts line ~604, git.ts mirror). Phase 3 plan 03-06 landed it.
- No `gsd-sdk query push` shim exists yet → P1 adds it (see Section "Missing SDK Verbs").
- Markdown call: `gsd-sdk query push --remote origin --bookmark gsd/release/v1.0`.

**Release tag handling per REFS-06:** jj has no annotated-tag concept; release tags are bookmarks under `gsd/release/<version>`. The `/gsd-ship` flow on jj backend: create the bookmark (`vcs.refs.bookmarks.create('gsd/release/v1.0', '@')`), push the bookmark (`vcs.push({bookmark: 'gsd/release/v1.0'})`). Git backend: still creates annotated tag via `vcs.gitOnly.createAnnotatedTag`.

## CMD-10 Brownfield Synthetic-Fixture Strategy

**Goal:** Each brownfield command (`/gsd-resume-work`, `/gsd-pause-work`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-map-codebase`) gets an integration test against a synthetic jj fixture covering its decision tree.

**Minimum `.planning/` shape for fixture:**

```
<tmpdir>/                       (jj git init or jj init)
├── .planning/
│   ├── PROJECT.md              (placeholder — 5 lines)
│   ├── REQUIREMENTS.md         (3 mock requirement IDs)
│   ├── ROADMAP.md              (2 phases: P1 complete, P2 in-progress)
│   ├── STATE.md                (frontmatter with milestone + progress)
│   ├── config.json             (vcs.adapter: jj)
│   └── phases/
│       ├── 01-foo/
│       │   ├── 01-CONTEXT.md
│       │   ├── 01-PLAN.md
│       │   └── 01-SUMMARY.md
│       └── 02-bar/
│           ├── 02-CONTEXT.md
│           └── 02-01-PLAN.md   (in-progress)
└── src/                         (a couple of files for /gsd-map-codebase to scan)
    └── example.ts
```

**Fixture factory:** Extend `vcsTest(kind)` with a new `synthPlanningFixture(kind, shape)` factory (or fold into existing) that:
1. Calls `vcsTest` to spin up an empty jj repo
2. Writes the `.planning/` skeleton via `fs.writeFileSync` (no jj-side commits — brownfield commands are run against the live working tree)
3. Optionally creates phase commits via `vcs.commit({files, message})` if the test exercises a manifest-grep path

**Per-command coverage:**

- `/gsd-resume-work`: assert the workflow correctly reads STATE.md `stopped_at` and proposes resume point. No VCS state required.
- `/gsd-pause-work`: assert STATE.md update is committed via `vcs.commit`. (Real test of adapter wiring.)
- `/gsd-import`: assert ROADMAP / REQUIREMENTS / STATE skeleton created from inputs.
- `/gsd-ingest-docs`: assert docs scanned + ARCHITECTURE.md / FEATURES.md emitted.
- `/gsd-map-codebase`: assert src/ scanned + map artifact emitted.

**Coverage gap documentation (D-34):** P4 plan SUMMARY MUST state: "Brownfield commands exercised against synthetic jj fixtures only; full dogfood validation occurs in Phase 6 once the sticky-adapter flip + `.planning/` SHA → change_id rewriter exist."

## CI Flake Analysis (D-36 Step 1)

**Source:** Phase 4 LEARNINGS Section "Pre-existing Failures Still Deferred":

> Various jj-integration flakes in `sdk/src/vcs/__tests__/` (jj-octopus, jj-lock, jj-hooks, jj-workspace, jj-push-fetch, jj-commit, exec-env-passthrough) — pass in isolation, intermittently fail in bulk runs due to tmpdir / process contention. Vitest integration perf is the maintenance bucket called out in `03.1-CONTEXT.md`.

**Specific test files (verified by file existence in `sdk/src/vcs/__tests__/`):**
- `jj-octopus.test.ts` (Phase 4 plan 04-05)
- `jj-lock.test.ts` (Phase 4 plan 04-03)
- `jj-hooks.test.ts` (Phase 4 plan 04-06)
- `jj-workspace.test.ts` (Phase 3 + extended Phase 4)
- `jj-push-fetch.test.ts` (Phase 3 plan 03-06)
- `jj-commit.test.ts` (Phase 3 plan 03-04)
- `exec-env-passthrough.test.ts` (Phase 3)

**Two flake categories:**

1. **Concurrency contention (multi-workspace tests racing on shared state):** Phase 4 LEARNINGS Velocity section: "octopus contract tests sometimes serialize in CI (~50% wall-clock overhead vs local isolation)." Tests using `vcsMultiWsTest` factory are the candidates. **Candidate fix:** serialize the multi-workspace test suite via `describe.sequential` (vitest opt-in for in-suite serial execution) OR introduce a dedicated process pool per test file via `test.concurrent: false`. The Phase 03.1 baseline tuned `pool: 'threads'` + `isolate: false` for integration suite; revisit per-file overrides.

2. **Fixture-tmpdir contention (parallel test runners colliding on /tmp paths):** Phase 4 LEARNINGS lists this as the second category. Vitest's default test isolation reuses tmpdirs across parallel files when not careful. **Candidate fix:** force each test file to use a unique tmpdir via `mkdtemp(prefix=os.tmpdir() + '/vcs-${randomId}-')` per fixture invocation, and ensure cleanup is `afterEach` not `afterAll`. Phase 1 plan 01-04 W-4 already documented an "isolated-fixture" pattern (`--scan-root` flag for lint guard); the same isolation-by-construction principle applies.

**Recommended fix sequence (P5):**
1. Audit each of the 7 listed test files for `vcsTest` / `vcsMultiWsTest` usage; flag concurrent vs serial.
2. Apply `describe.sequential` to octopus + reap + lock tests (the multi-workspace surface).
3. Switch `mkdtemp` to per-invocation random prefix (instead of test-name prefix, which can collide across parallel files).
4. Add a `afterEach` cleanup that `rm -rf`s the tmpdir even on failure.
5. Run 10 nightly CI cycles with the fixes in place; record outcomes in soak file.

## CI Soak Metric File Shape (D-36 Step 2)

**Proposed file:** `.planning/intel/ci-jj-soak.md` (planner can rename).

**Proposed shape:**

```markdown
# CI jj-Backend Soak Window

**Started:** YYYY-MM-DD
**Target:** 10 consecutive green nightly runs across both `jj-colocated` and `jj-native` lanes
**Status:** N/10 consecutive (last update: YYYY-MM-DD)

## Run Log

| # | Date | Run ID | jj-colocated | jj-native | git | Notes |
|---|------|--------|--------------|-----------|-----|-------|
| 1 | 2026-05-14 | 12345678 | ✓ | ✓ | ✓ | clean |
| 2 | 2026-05-15 | 12345789 | ✗ | ✓ | ✓ | jj-octopus.test.ts:foo timeout — fix in commit abc1234 |
| ...

## Reset Events

- 2026-05-15: counter reset from 1/10 to 0/10 after run 2 failure; fix landed in `abc1234`.
- 2026-05-20: counter reset from 4/10 to 0/10 after run 6 jj-lock.test.ts flake; investigation: ...

## Final Graduation

Date: TBD
Commit removing `continue-on-error`: TBD
```

**Update mechanism (planner's discretion):**

- **Option A (manual):** Human updates after observing nightly CI; cheapest, lowest tooling.
- **Option B (scripted):** A small `scripts/check-ci-soak.cjs` runs in CI itself, queries `gh api repos/.../actions/runs?per_page=10`, asserts pass/fail status across the matrix, appends a row to the soak file. Adds tooling debt.
- **Option C (hybrid):** Manual append, but a helper script (`scripts/show-ci-soak.cjs`) renders the current `N/10` count from the run log. Recommended for v1; defer Option B unless the manual burden becomes excessive.

**Graduation commit:** Once `N=10`, a single commit removes `matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native'` from `continue-on-error` in `.github/workflows/test.yml:60-64` AND appends the "Final Graduation" entry to the soak file.

## MIGR-02 File-by-File Remaining Work

**Verified state (2026-05-13):**

```bash
$ node scripts/lint-vcs-no-raw-git.cjs
ok lint-vcs-no-raw-git: 923 files scanned in /Users/LoganDark/Documents/Projects/get-shit-done, 0 violations
```

```bash
$ grep -E "execSync\s*\(.*git|spawnSync\s*\(.*git|child_process.*git" bin/lib/*.cjs
(no matches)
```

**Conclusion:** All 6 `bin/lib/*.cjs` files (`core.cjs`, `verify.cjs`, `commands.cjs`, `init.cjs`, `graphify.cjs`, `drift.cjs`) already pass the lint guard with zero violations. The only remaining `git` mentions in these files are:
- Comments / docstrings (do not affect runtime)
- String constants in user-facing error messages ("Run: `git worktree list --porcelain`")
- The phrase "`git`" in variable names / repo-state descriptions

**Implications for D-35:**

- The "6 outstanding" framing in CONTEXT.md is somewhat misleading. There is no call-site migration work left — Phase 2 plan 02-11 completed the runtime migration. What remains is **cosmetic / documentation cleanup** that may or may not be valuable:
  - Update error messages from "Run: `git worktree list --porcelain`" → "Run: `gsd-sdk query worktree-list`" (would tie into the new SDK verb introduction).
  - Update prose comments to reference `vcs.workspace.*` instead of `git worktree`.
- Per D-35, each Phase 5 plan touching these files for PROMPT rewrites can also fix the cosmetic strings. Per the sweep clause: if no plan touches a file, P5 close adds a small task.

**Per-file natural touch surface in Phase 5:**

| File | Likely touched by | Reason |
|------|-------------------|--------|
| `core.cjs` | P1 (foundational infra) or P5 (sweep) | Error message strings about `git worktree prune` at ~line 763, 788 |
| `verify.cjs` | P1 or P5 | Error message strings about worktree health at ~line 949-982 |
| `commands.cjs` | P2 (commit-related verbs) | Already references `vcs.commit` via the adapter (comments only at ~line 334-341) |
| `init.cjs` | P2 (new-project) or P5 (sweep) | child-repo detection prose at ~line 1507, 1536 |
| `graphify.cjs` | P5 sweep | No natural Phase 5 plan touches it |
| `drift.cjs` | P5 sweep | No natural Phase 5 plan touches it |

**Recommendation:** Treat MIGR-02 as a P5 sweep task (cosmetic comment / error-message cleanup) rather than per-file fold-in. The lint-guard is already green; no requirement marker would change.

## Common Pitfalls

### Pitfall 1: PROMPT rewrites in upstream files balloon upstream-rebase conflict surface

**What goes wrong:** Phase 5 touches `execute-phase.md`, `quick.md`, `complete-milestone.md`, etc. — files that upstream `gsd-build/get-shit-done` actively maintains. Every line rewritten is a potential merge conflict on the next upstream sync.

**Why it happens:** PROMPT rewrites are structural (shape-for-shape git → SDK). Upstream may also touch nearby lines for unrelated reasons; conflicts cascade across the rewrite surface.

**How to avoid:** Per UPSTREAM-03, keep rewrites **mechanical-only** — no surrounding logic reshape. Per UPSTREAM-02, push *new* logic to sidecar files (`sdk/src/vcs/jj/*.ts`, `sdk/src/query/*.ts` for the new verbs). The markdown rewrite is shape: `git <verb> <args>` → `gsd-sdk query <verb> <args>`. Don't simultaneously refactor the surrounding bash block, reorder sections, or improve prose.

**Warning signs:** A PROMPT rewrite commit's diff contains unrelated formatting changes, prose improvements, or section reorders.

### Pitfall 2: Cross-runtime markdown drift (D-37 rationale)

**What goes wrong:** Phase 5 rewrites canonical Claude markdown. The installer (`bin/install.js`) transforms it for 15+ runtimes. If the rewrite introduces a pattern the installer doesn't recognize, downstream runtimes break silently.

**Why it happens:** The installer's transform pipeline expects certain patterns (path placeholders, tool-name substitutions). New `gsd-sdk query` invocations are *shell commands*, which every runtime supports, so the risk is minimal — but novel markdown structure (e.g., a new fenced-block convention) could still trip the transform.

**How to avoid:** Phase 5 PROMPT rewrites stick to shell-command form (`gsd-sdk query …`) and never introduce new markdown structure. Spot-check one non-Claude runtime install at phase close (per D-37 discretion).

**Warning signs:** Installer logs warnings during transform of Phase 5 files; a runtime user reports a markdown formatting bug post-install.

### Pitfall 3: A3 fix breaks hooks expecting silent skip in colocated mode

**What goes wrong:** Some `.githooks/pre-commit` implementations might assume the colocated git-side hook is the only firing path and produce side effects (e.g., log file appends, lock acquisitions) that don't tolerate double-firing.

**Why it happens:** The hook ecosystem grew up around git's single-hook-fire model; jj's auto-fire (if upstream adds it) plus the adapter's always-fire (D-32) could double-fire on colocated repos.

**How to avoid:** Hooks must be idempotent or self-guarded (LEARNINGS Open Q1 rationale). `GSD_HOOK_SKIP_COLOCATED=1` is the escape hatch when a future jj release lands auto-fire and produces actual duplicates. Document the env var prominently in 05-LEARNINGS and `.githooks/README.md` (if it exists).

**Warning signs:** A hook script reports running twice for one squash; a lock file conflict appears in dogfood.

### Pitfall 4: CI required-blocking flip without sufficient soak

**What goes wrong:** Removing `continue-on-error: true` from the jj matrix entries before flakes are truly fixed → every PR starts failing on intermittent jj timeouts → CI feedback loop breaks → developers ignore CI signal → real regressions slip through.

**Why it happens:** Pressure to "finish Phase 5" combines with "the last 3 nightly runs were green, that's good enough" optimism. The 10-consecutive metric exists to enforce a high bar.

**How to avoid:** Strict adherence to D-36 step 2's "10 consecutive green" metric. Reset counter on any failure; restart the window. If counter resets repeatedly (≥3 times), escalate per D-36's discretion clause: extend window, document specific flakes as known-issues gated by env flag, or proceed with required-blocking on the non-flaky subset.

**Warning signs:** Counter resets twice within a 2-week window; the same test file appears in failure logs across resets.

### Pitfall 5: Adding `gsd-sdk query <verb>` shims that don't honor the no-raw-git invariant

**What goes wrong:** A new query shim shells out to raw git for convenience (e.g., `sdk/src/query/log.ts` calling `execSync('git log ...')` instead of `vcs.log({...})`). The lint guard catches it during CI, but PR review pressure could land an allowlist entry.

**Why it happens:** Convenience in P1 when the adapter's `vcs.log` doesn't expose every git flag the markdown needs.

**How to avoid:** Per CONTEXT D-22 (Phase 2.1) hard rule: never add to the allowlist. If the adapter is missing a flag (e.g., `--grep`), extend the adapter signature first (mechanical change in `types.ts` + `git.ts` + `jj.ts`), then write the query shim. Phase 2.1 already shipped many gap-fills; verify before adding.

**Warning signs:** A query shim file imports `child_process` or `execSync`; the lint guard reports a new violation; an allowlist PR appears in review.

### Pitfall 6: jj idiom mismatch in CMD-06 undo semantics

**What goes wrong:** Markdown documents `/gsd-undo` as "creates inverse-content commits, preserves history" (git revert semantics). On jj, `jj abandon` is destructive — the change goes to op log only. Users on jj backend lose history they thought they had.

**Why it happens:** The CMD-06 spec ("`git reset` → `jj abandon`") is verbatim translation but conflates two different git operations (reset is destructive; revert preserves). undo.md uses revert (preservation); the jj equivalent isn't direct.

**How to avoid:** Document the semantic shift explicitly in the rewritten `undo.md` prose. Either:
- **Option A (recommended):** Accept jj's destructive model. Document: "On jj backend, undo is destructive; recovery via `jj op restore` (the op log is the safety net)." This is jj's idiomatic answer (per FEATURES section "reset --hard").
- **Option B:** Build an inverse-content commit primitive on jj (`jj duplicate` + content reversal) — significantly more complex, not in CONTEXT.md scope.

**Warning signs:** undo.md prose treats both backends identically; a dogfood user complains about "lost" commits on jj.

## Code Examples

### Adding a new SDK query verb (D-33, P1 shape)

```typescript
// Source: sdk/src/query/hooks.ts — exact pattern to mirror

// sdk/src/query/push.ts (NEW)
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const pushQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let remote: string | undefined;
  let bookmark: string | undefined;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[i + 1]; i++; }
    else if (args[i] === '--remote' && args[i + 1]) { remote = args[i + 1]; i++; }
    else if (args[i] === '--bookmark' && args[i + 1]) { bookmark = args[i + 1]; i++; }
    else if (args[i] === '--force') force = true;
  }
  const vcs = createVcsAdapter(cwd);
  const result = vcs.push({ remote, bookmark, force });
  return {
    data: {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    },
  };
};
```

### Always-fire pre-commit with env override (D-32)

```typescript
// Source: sdk/src/vcs/backends/jj.ts:250-264 — replace this block

// BEFORE (Phase 4 D-10 — refuted by A3):
if (!input.noVerify) {
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  if (!isColocated) {
    const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
    if (hookRes.exitCode !== 0) {
      mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
    }
  }
  // colocated: no-op  ← REMOVE this branch
}

// AFTER (Phase 5 D-32):
if (!input.noVerify) {
  const skipColocated = process.env.GSD_HOOK_SKIP_COLOCATED === '1';
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  // Always fire unless explicitly skipped in colocated mode (escape hatch for
  // a future jj release that adds auto-fire and produces duplicates).
  if (!(skipColocated && isColocated)) {
    const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
    if (hookRes.exitCode !== 0) {
      mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
    }
  }
}
```

### Synthetic brownfield fixture skeleton (D-34)

```typescript
// Source: sdk/src/vcs/__tests__/jj-workspace.test.ts pattern, extended

import { vcsTest } from './vcs-fixture.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

vcsTest.for(['jj-colocated', 'jj-native']).runIf('CMD-10 brownfield')((kind) => {
  describe(`/gsd-resume-work on ${kind}`, () => {
    test('reads STATE.md stopped_at and proposes resume point', async ({ vcs, cwd }) => {
      // Seed synthetic .planning/ skeleton
      mkdirSync(join(cwd, '.planning/phases/01-foo'), { recursive: true });
      writeFileSync(join(cwd, '.planning/STATE.md'), '---\nstopped_at: Phase 01-foo plan 02 (in-progress)\n---\n');
      writeFileSync(join(cwd, '.planning/phases/01-foo/01-CONTEXT.md'), '# Phase 01: foo\n');
      // No commit — brownfield commands inspect working-tree state

      // Run the workflow
      const result = await runWorkflow('resume-work', { cwd });
      expect(result.proposedResumePoint).toMatch(/01-foo plan 02/);
    });
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `git <verb>` shell in markdown | `gsd-sdk query <verb>` SDK bridge | Phase 5 PROMPT-01/02 | Markdown becomes VCS-agnostic; supports both backends |
| Backend-conditional in workflows (`if jj: ... else: ...`) | Unified prose + adapter dispatch | D-33 (Phase 5) | Prompt length down; fork-divergence surface down |
| Colocated jj relies on git's hook firing | Adapter always fires `.githooks/<stage>` | D-32 (Phase 5) | Closes A3 gap; ensures pre-commit runs in dogfood |
| jj-backend CI lanes allow-failure | jj-colocated + jj-native required-blocking after 10-green soak | D-36 (Phase 5) | True dual-backend CI gate |
| BROWN-01/02 in Phase 5 (per original ROADMAP) | Re-bucketed to Phase 6 | D-31 (Phase 5 CONTEXT) | Reflects structural dependency on Phase 6 rewriter |
| Per-runtime smoke matrix (debated) | Trust `bin/install.js` transform | D-37 (Phase 5) | Avoids ballooning CI cost |

**Deprecated/outdated:**
- Phase 4 D-10 "colocated no-op for pre-commit" — retired by D-32.
- ROADMAP Phase 5 success criterion #3 "dogfood on this very repo" — amended per D-31 (this is a P0/P1 file-edit deliverable of Phase 5).
- The framing "MIGR-02 has 6 outstanding files" — empirically false at the call-site level (verified via grep + lint guard); only cosmetic comment cleanup remains.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | jj 0.41's `~ files('.planning/')` revset filters out commits that touch only `.planning/` paths | jj idioms — `/gsd-pr-branch` | If wrong, the filter doesn't work; planner adjusts revset empirically during P3 implementation. Confidence: MEDIUM (revset semantics documented but not empirically verified in this research session). |
| A2 | `LogEntry.hash` returning `commit_id` (not `change_id`) on jj backend means change-id discovery for `/gsd-undo` needs an adapter gap-fill | CMD-06 / jj idioms | If wrong (e.g., `LogEntry` already carries change_id), the gap-fill is unnecessary. Confidence: HIGH (verified by `sdk/src/vcs/backends/jj.ts:310-311` PITFALL 1 comment which explicitly states this). |
| A3 | Phase 4 LEARNINGS' two flake categories (concurrency + tmpdir) accurately describe ALL the intermittent failures | CI flake analysis | If wrong, additional flake sources surface during P5 soak; D-36 discretion clause allows extending the window. |
| A4 | The synthetic-fixture coverage for CMD-10 is sufficient to gate the phase without dogfood | CMD-10 strategy | Locked by D-34; if wrong, Phase 6 inherits surprises but Phase 5 verification still ships. |
| A5 | `bin/install.js` transform pipeline already handles `gsd-sdk query …` shell commands without modification | PROMPT-03 / D-37 | If wrong, runtime users report broken markdown post-install; mitigation via D-37 optional spot-check. Confidence: HIGH (rationale in D-37: shell commands are runtime-universal). |
| A6 | The 12 missing SDK query verbs listed in "Missing SDK Verbs" are an upper bound | Consumer call-site inventory | If wrong (a verb is missed), it surfaces during P2/P3 rewrite and is added then per D-33's "add verb before rewriting consumer" rule. Recovery cost: low. |
| A7 | jj abandon is the correct primitive for CMD-06 jj-side undo | Pitfall 6 / CMD-06 | If wrong (semantic shift unacceptable), need a content-inversion primitive on jj — out of CONTEXT scope. Recommend Option A in Pitfall 6. |

**If this table is empty:** Not applicable — 7 assumptions logged.

## Open Questions (RESOLVED)

1. **Does `sdk/src/query/commit.ts`'s argv shape already match what markdown needs?**
   - What we know: `commit.ts` exists; was used in Phase 2 migration; supports `commit([message, ...files], cwd)` shape.
   - What's unclear: Whether it supports `--no-verify`, `--amend`, and explicit `--files` separation; whether markdown can call it as-is or needs a thin shim.
   - Recommendation: P1 task to grep `commit.ts` exports and align with planned markdown call shape. If gap exists, add `--no-verify` / `--amend` arg parsing in P1.
   - **RESOLVED:** Plan 05-02 Task 2 (`quick.md` rewrite) addresses the `--no-verify` argv-scan need: the task action notes "If the executor finds at runtime that `commit.ts` lacks the `--no-verify` flag, the executor MUST add it to `commit.ts` argv-scan loop in the same task (~5-line edit) and add a regression test asserting `--no-verify` parses correctly." The shape (`positional message + --files <list>`) is already used by `autonomous.md:251-253` and `complete-milestone.md:497`.

2. **Is the LogEntry change_id surface gap-fill in scope for P1 or deferred?**
   - What we know: `LogEntry.hash` is commit_id; change_id discovery for `/gsd-undo` needs the change_id.
   - What's unclear: Whether adding a `change_id` field to `LogEntry` requires re-baselining all log parsers (probable: high cost) or whether a separate verb (`vcs.refs.changeIdOf(rev)`) is cheaper.
   - Recommendation: P1 adds the cheaper `vcs.refs.changeIdOf` (or extend `vcs.refs.resolveShort` to return both forms); P3 (`/gsd-undo`) consumes.
   - **RESOLVED:** Deferred — surfaces only if CMD-08 / `/gsd-undo` consumer explicitly needs change_id resolution from a commit_id. Plan 05-01 does not add `vcs.refs.changeIdOf`; plan 05-03 CMD-06 / `/gsd-undo` rewrite routes through `gsd-sdk query revert` which operates on whatever rev string the markdown supplies. If the consumer pattern surfaces during plan 05-03 execution, the executor adds `vcs.refs.changeIdOf` as a sweep TODO and the cleanup task in plan 05-05 absorbs it.

3. **Should the no-raw-git lint guard scan markdown files?**
   - What we know: Currently scans source (TS/JS/CJS/SH). Markdown is allowed.
   - What's unclear: Whether Phase 5 PROMPT rewrites should be gated by the lint or by a one-shot grep audit at phase close.
   - Recommendation: Defer extending the guard to v2 (PITFALLS scope). Use a one-shot audit at phase close: `rg -n '\bgit\s+(commit|push|reset|...)' get-shit-done/workflows/*.md agents/*.md` and confirm any remaining hits are explicitly gated (e.g., git-only sections, sample-output blocks).
   - **RESOLVED:** Deferred to v2 per the Pitfall analysis. Phase 5 close uses a one-shot grep audit on the rewritten markdown surface (`rg -n '\bgit\s+(commit|push|...)' get-shit-done/workflows/*.md agents/*.md`) rather than extending the lint guard. Plan 05-05 SUMMARY records the audit output.

4. **Does `vcs.workspace.add` support the `branch: 'create'` shape that `gsd-code-fixer.md:275` needs?**
   - What we know: `vcs.workspace.add(path, { atRevision })` is the Phase 4 shape; no `branch` field.
   - What's unclear: Whether the workspace adapter creates an associated branch/bookmark on `add`, or if that's a separate `vcs.refs.bookmarks.create` step.
   - Recommendation: Verify by grep against `sdk/src/vcs/types.ts VcsWorkspace`. If absent, add a `branch?: { name: string, create: boolean }` field — small gap-fill.
   - **RESOLVED:** Plan 05-03 Task 2 pre-resolution — confirmed by reading `sdk/src/vcs/types.ts` `VcsWorkspace.add` (lines 165-173): current signature accepts `WorkspaceAdd = { path, baseRef?, name? }` and does NOT support `branch: { name: string; create: boolean }`. Path B selected (sweep-TODO): plan 05-03 Task 2 uses today's `vcs.workspace.add` shape and tags every consumer site with `<!-- TODO: branch-create gap fill -->` HTML comment; plan 05-05 absorbs the cleanup via a dedicated sweep task that resolves all such TODOs (adapter gap-fill if pattern recurs; otherwise per-site rewrite using `vcs.refs.bookmarks.create` as a separate step).

5. **Where does the soak file's run-log come from (manual entry or scripted)?**
   - What we know: D-36 step 2 mandates the file but not the update mechanism.
   - What's unclear: Whether a small automation justifies its existence or manual append is sufficient.
   - Recommendation: Manual append for v1 (per Option C in "CI Soak Metric File Shape"); ship `scripts/show-ci-soak.cjs` only if manual auditing becomes onerous during P5.
   - **RESOLVED:** Manual append for v1 selected per Option C. Plan 05-05 Task 2 creates `.planning/intel/ci-jj-soak.md` with the canonical 10-green shape; manual append is the documented update mechanism. A small `scripts/show-ci-soak.cjs` render helper (~30 LOC) is left as an executor discretion item — ship only if manual auditing becomes onerous during the soak window.

## Environment Availability

Skip (Phase 5 is code/markdown/CI-config changes; relies entirely on existing repo dependencies). Verified:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, test, scripts | ✓ | (repo `node-version` pin: 22 + 24 in CI) | — |
| jj binary | Synthetic fixtures, CI | ✓ in CI (Phase 3 D-14 tarball install) | 0.41.0 | — |
| pnpm/npm | Repo standard | ✓ | npm in CI | — |
| ripgrep (rg) | Phase 5 audit grep | (assumed available locally; CI uses `grep` fallback if needed) | — | `grep -r` |
| GitHub CLI (`gh`) | Soak metric scripting (optional) | requires `.envrc` GITHUB_TOKEN per CLAUDE.md | — | manual run-log entry |

No missing dependencies block Phase 5 execution.

## Validation Architecture

**SKIPPED** — `.planning/config.json` has `workflow.nyquist_validation: false`. Per RESEARCH instructions, omit this section.

## Security Domain

Phase 5's security surface is bounded by existing locked decisions:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — local CLI tool |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a |
| V5 Input Validation | yes | `validateRefname` (Phase 4 D-24) — applied to bookmark names in `vcs.refs.bookmarks.{create,move,delete,exists}` and any new SDK query verb that accepts bookmark args; `--` end-of-options separator at argv positions |
| V6 Cryptography | no | n/a |

**Known threat patterns for jj-port:**

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argv injection via bookmark name (CR-01) | Tampering | `validateRefname` + `--` separator (Phase 4 D-24 already shipped) |
| Shell injection via `gsd-sdk query <verb>` args | Tampering | All SDK queries use argv-array `vcsExec` (JJ-02); no shell-string concatenation — extends to new verbs |
| Prompt injection via commit message | Tampering / Elevation | `sanitizeCommitMessage` in `sdk/src/query/commit.ts` already strips zero-width chars + injection markers; new `gsd-sdk query commit` verb must route through it |
| Hook script tampering | Tampering | Out of scope — repo-owner trust boundary; `fireHook` shells the script as-is |
| `GSD_HOOK_SKIP_COLOCATED=1` misuse | Repudiation | Document the env var in 05-LEARNINGS as a developer escape hatch, not a security control |

**New attack surfaces introduced by Phase 5:** None. Phase 5 consumes existing surfaces (adapter, fireHook, validateRefname) and adds SDK query shims that route through them.

## Sources

### Primary (HIGH confidence)

- `sdk/src/vcs/backends/jj.ts` (1104 LOC, current as of 2026-05-13) — `commit()` A3 fix target at lines 250-264; `push()` at ~line 604
- `sdk/src/vcs/hook-bridge.ts` (42 LOC) — `fireHook` implementation
- `sdk/src/query/hooks.ts` (80 LOC) — Phase 4 plan 04-06 query bridge prototype
- `.planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-CONTEXT.md` — D-31..D-38 locked decisions
- `.planning/phases/04-workspaces-octopus-structure-hooks/04-LEARNINGS.md` — A3 refutation + Open Q1 fix paths + flake category enumeration
- `.planning/phases/04-workspaces-octopus-structure-hooks/04-CONTEXT.md` — D-08 SDK query bridge shape
- `.planning/research/FEATURES.md` — Per-command translation table (verified against jj 0.41 docs)
- `.planning/research/PITFALLS.md` — Pitfalls 1-7 with phase-to-address attributions
- `.github/workflows/test.yml` (174 LOC) — Lines 60-64 for CI continue-on-error flag flip
- `scripts/lint-vcs-no-raw-git.cjs` + `.allow.json` — Verified 923 files / 0 violations on 2026-05-13
- Workflow + agent markdown files (`execute-phase.md` 1772 LOC, `quick.md` 1121 LOC, `complete-milestone.md` 847 LOC, `undo.md` 314 LOC, `code-review.md` 523 LOC, `gsd-code-fixer.md` 668 LOC, `gsd-executor.md` 728 LOC) — Line-numbered call-site inventory verified via grep

### Secondary (MEDIUM confidence)

- jj 0.41 revset documentation (https://docs.jj-vcs.dev/v0.41.0/revsets/) — Referenced for CMD-07 revset candidates; specific filter behavior `~files('.planning/')` not empirically verified in this session
- `.planning/intel/git-touchpoints.md` — Mention counts (2026-05-09 snapshot; may have drifted; touchpoint refresh recommended at Phase 5 close)

### Tertiary (LOW confidence)

(none — all claims tagged with confidence levels or marked ASSUMED in Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all referenced libraries exist in-repo and were verified in Phase 1-4
- Architecture: HIGH — patterns locked by D-31..D-38; mirroring Phase 4 plan 04-06 prototype
- Pitfalls: HIGH — all 6 pitfalls have explicit source citations (LEARNINGS, PITFALLS.md, CONTEXT.md decisions)
- Consumer call-site inventory: HIGH — verified by direct grep against the 7 hot files
- Missing SDK verbs: MEDIUM-HIGH — verified by `ls sdk/src/query/`; final verb-shape sign-off happens at P1 implementation
- A3 fix shape: HIGH — locked by D-32; exact 10-line diff specified
- jj idioms (CMD-06..08): MEDIUM — revsets and abandon semantics from FEATURES.md research; CMD-07 revset filter is a candidate not empirical
- CI flake analysis: MEDIUM-HIGH — flake categories from Phase 4 LEARNINGS; specific test files verified by directory listing

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (30 days for stable; refresh git-touchpoints.md if upstream merges land before then)
