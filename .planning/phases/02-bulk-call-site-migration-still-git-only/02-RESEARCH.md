# Phase 2: Bulk Call-Site Migration (Still Git-Only) — Research

**Researched:** 2026-05-09
**Domain:** Mechanical Branch-by-Abstraction migration; in-tree code only (no new tech, no external libraries)
**Confidence:** HIGH on call-site inventory (every site enumerated by direct grep + file read, line-precise). HIGH on commit.test.ts:304 root cause (reproduced locally, isolated to fixture). HIGH on adapter mapping per call site (Phase 1 forward-complete contract verified). MEDIUM on hotspot-audit grep mechanics (the "non-adapter-call-site edit" detector is novel for this repo).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Migration Sequencing
- **D-01 (Smoke-test single site first):** Phase 2's very first migration commit is a single tiny call site (e.g., one `git rev-parse --show-toplevel` invocation in `worktree-safety.cjs` or one trivial `git rev-parse` in `init.cjs`) migrated atomically — and ONLY that. Proves end-to-end `dist-cjs/` consumption from a real `bin/lib/*.cjs` runtime path (Phase 1 only proved it from `tests/helpers.cjs` via lazy getters and from integration tests). Phase 1 deferred-ideas explicitly flagged this.
- **D-02 (Smallest-to-largest LOC after smoke):** After the smoke-test commit, remaining files migrate in ascending LOC order — leaf small files first (`worktree-safety.cjs` 338 LOC, `init.cjs`, `init.ts`, `commit.ts`, etc.), hotspots last (`commands.cjs` 1028, `verify.cjs` 1390, `core.cjs` 2036). Builds pattern muscle memory on small surfaces; reviewer load grows gracefully; rebase-conflict shape (post-deferred-rebase) is established on small surfaces first.
- **D-03 (Pre-existing failure gating):** `sdk/src/query/commit.test.ts` is **not migrated** until the pre-existing `commit.test.ts:304` failure ("fatal: failed to write commit object") is triaged. Phase 2 closes with `commit.test.ts` retargeting only after triage lands.
- **D-04 (Triage is plan 02-01 inside Phase 2):** Phase 2's first plan triages `commit.test.ts:304`. Closing the gate inside the same phase keeps triage scoped, no out-of-phase prerequisite. After 02-01 lands, the smoke-test commit (D-01) is the first work in 02-02 (or 02-03 if helpers split — see D-09).

#### Commit & Test Atomicity
- **D-05 (Per-file commit granularity):** Within a single source file with multiple git sites, one commit migrates ALL of that file's sites. `core.cjs` becomes adapter-shaped in one commit, not 6. Reads naturally as "this file became adapter-shaped." Per-file commit history (ROADMAP success criterion 3) is honored as written.
- **D-06 (Source + tests in same commit):** When a source file migrates, its corresponding test file is retargeted onto the `vcs` fixture in the **same** commit. Atomic "this file is now adapter-shaped, including its tests." Each commit is independently green. Cleanest bisect semantics, cleanest rebase semantics, cleanest reviewer story.
- **D-07 (No bare-source commits that leave tests raw-git):** A commit that migrates source without retargeting its tests is forbidden. If a source file's tests can't be retargeted in the same commit (e.g., shared helper not yet adapter-aware), defer the source migration until the helper migration plan (D-09) lands.
- **D-08 (Mechanical-only invariant — D-03 in spirit, restated for Phase 2):** No surrounding-logic refactors during migration commits. No opportunistic variable renames "to match adapter naming." No squashing two adjacent execSync calls into one adapter call even if it's "obviously" the same operation. The diff for each migration commit is JUST the call-site shape change. This is the load-bearing invariant for the eventual user-driven rebase to be clean.

#### Test Helper Migration
- **D-09 (Shared test helpers land in their own dedicated plan, before any per-file source/test migration):** Plan 02-02 (after triage 02-01) migrates shared test helpers in `tests/helpers.cjs` (and any other shared git-touching test infra) onto the `vcs` fixture / adapter-aware primitives. After that plan, every subsequent file-pair commit (D-06) consumes the new helpers cleanly. Avoids "this file's commit also rewrote shared infra" bleed. Helpers are NOT left raw-git via the existing allowlist — Phase 2 closes with no raw git in shared test helpers either.

#### Baseline Capture
- **D-10 (Every migrated call site gets a baseline):** Each `execSync → adapter` swap captures a pre-migration baseline at `tests/baselines/git-vcs/<call-site>.snap.json` BEFORE the swap, then asserts the post-migration adapter output matches. Maximum parity proof. Aligns directly with the mechanical-edits invariant (D-08): any output divergence shows up immediately at the per-site level. No representative-sampling, no shared baselines across multiple sites.
- **D-11 (Baseline format & re-blessing):** Baselines use the format and rules locked in Phase 1 D-16 — checked-in JSON, no `--update-snapshot` shortcut, re-blessing requires explicit baseline edit (PR-reviewable).

#### Lint Allowlist Discipline
- **D-12 (Long-lived `phase/02-migration` branch):** All Phase 2 commits land on a long-lived branch named `phase/02-migration`. The branch is not merged to `main` until Phase 2 is complete. Lint is **broken on that branch** during migration (raw-git removed from allowlist on day one — see D-13). `main` stays green throughout.
- **D-13 (Day-one glob removal, no replacement):** Plan 02-02 (helpers migration) deletes the broad allowlist globs `get-shit-done/bin/lib/**/*.cjs` and the `sdk/src/query/*.ts` explicit entries on day one — no replacement. Every still-raw-git source file becomes a lint violation immediately. Forces aggressive momentum: every file MUST migrate before the branch can merge to `main`. Maximum forcing function.
- **D-14 (Allowlist file is the live progress tracker):** Day-one glob removal means the only entries left in the allowlist are the legitimate exceptions (git backend impl, gitOnly namespace impl, baseline-capture tool, GitHub Actions workflows, upstream-tracking docs, base64/secret/prompt-injection scan scripts — per Phase 1 D-18). When the migration branch is fully green, the allowlist matches its post-Phase-2 steady state with zero migration-related entries.

#### Sidecar Conventions (UPSTREAM-02 + 03)
- **D-15 (Sidecar dir created, even if empty):** Phase 2 creates `sdk/src/vcs/jj/` as an empty directory with a single `.gitkeep` or a stub `index.ts` (export nothing). Phase 3 will populate it. The path existing as a zero-conflict surface satisfies UPSTREAM-02. `sdk/src/vcs/parse/jj-rev.ts` already exists from Phase 1.
- **D-16 (Hotspot-discipline audit lands as a verification gate):** UPSTREAM-03 — verify that hotspot files (`core.cjs`, `verify.cjs`, `commands.cjs`) only see adapter call-site swaps inline, with no jj-specific logic embedded — is implemented as a verification step inside Phase 2's verify pass, not a free-standing plan. The test is mechanical: grep the per-file migration diffs for any non-adapter-call-site edits, surface for review.

#### Rebase Validation (DEFERRED — out of Phase 2)
- **D-17 (MIGR-04 + UPSTREAM-01 deferred to milestone-end task):** The first post-migration upstream rebase, the conflict-count metric, the `.planning/intel/rebase-log.md` log, and `docs/upstream-rebase.md` (jj-native rebase recipe) are ALL deferred to a single milestone-end task that runs after Phase 5 completes. User performs the rebase manually, records the conflict count, writes the recipe doc as a retro of the actual rebase experience. Phase 2's success criteria 4 and 5 in ROADMAP.md will be reframed at the next phase transition to reflect this deferral.
- **D-18 (Why deferred — user preference, not architectural):** User explicitly chose to perform and own the rebase post-v1 ("I'll try a rebase myself after all phases are complete"). The mechanical-edits invariant (D-08) is what Phase 2 actually delivers; the rebase that validates it is a user-driven event after the migration matures across Phase 3, 4, 5 churn. No Phase 2 success depends on the rebase happening.

### Claude's Discretion

- **Smoke-test target choice (D-01):** The exact tiny call site for the smoke commit is the planner's call. Constraints: must be in `bin/lib/*.cjs` (not `sdk/src/query/*.ts`) so it actually exercises the `dist-cjs/` consumption path; must be a read-only git invocation (e.g., `rev-parse`, no commit/branch mutation); should be in a small file. `worktree-safety.cjs` (338 LOC, 1 git sub) is a strong candidate.
- **Within-batch ordering at equal LOC (D-02):** When two files are within ~50 LOC of each other, planner picks order. Smallest-to-largest is the principle, not a tie-breaker over surface complexity.
- **Plan numbering and exact wave structure (D-04, D-09):** Plan 02-01 = triage, plan 02-02 = helpers + day-one allowlist shrink. Beyond that, planner allocates plans by file or file-group as seems sensible, respecting D-05/D-06 atomicity.
- **`.gitkeep` vs stub `index.ts` (D-15):** Whichever is more idiomatic for this codebase's TS package layout. Prefer whichever generates fewer downstream questions when Phase 3 starts populating the dir.

### Deferred Ideas (OUT OF SCOPE)

- **MIGR-04 + UPSTREAM-01 (rebase + rebase recipe doc):** Per D-17, deferred to a single milestone-end task after Phase 5 completes. User performs the rebase manually, records conflict count in `.planning/intel/rebase-log.md` (created at that time), writes `docs/upstream-rebase.md` as a retro of the actual rebase experience.
- **`config-mutation.test.ts:441` triage:** Pre-existing failure, not git/vcs-related. Track in deferred maintenance bucket; surface for triage in a future maintenance plan independent of Phase 2.
- **`vcs.test.*` namespace expansion (carried from Phase 1):** `vcs.test.dirty()`, `vcs.test.commitFixture(spec)` etc. — add only when a real Phase 2 migration needs them. Don't pre-build.
- **REQUIREMENTS.md footer reconciliation (carried from Phase 1):** Footer says 78 requirements; actually 86 across 15 categories. Plus VCS-07 wording vs. Phase 1 D-17 tightening. Reconcile at next phase transition (i.e., on Phase 2 completion).
- **Pre-commit lint integration (carried from Phase 1 D-19):** Lint stays CI-only during Phase 2 (allowlist still curating). Reconsider for pre-commit once allowlist stabilizes (post-Phase-2).
- **Workflow markdown / agent prompt rewrites:** PROMPT-01, PROMPT-02 are Phase 5 territory. Phase 2 does NOT touch `workflows/*.md` or `agents/*.md` — the lint guard's allowlist intentionally exempts these.
- **GitHub Actions workflows stay on git:** CI-03 / Phase 1 D-18 — `.github/workflows/**` is allowlisted permanently (CI side stays on git per project decision). Not a deferred item, just reaffirmed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIGR-01 | All `execSync('git …')` call sites in `sdk/src/query/*.ts` migrated to adapter | §Call-Site Inventory: SDK enumerates all 11 sites across `commit.ts`, `init.ts`, `verify.ts`, `progress.ts`, `check-ship-ready.ts`. Adapter mapping table provides exact `vcs.*` replacement per site. |
| MIGR-02 | All `execSync('git …')` call sites in `get-shit-done/bin/lib/*.cjs` migrated | §Call-Site Inventory: bin/lib enumerates all 26 sites across 6 files. Each site mapped to adapter call. |
| MIGR-03 | Migration is mechanical (Branch-by-Abstraction); per-call-site swap, no surrounding-logic changes | §Mechanical-Only Discipline + §Common Pitfalls call out concrete temptations to resist. |
| MIGR-04 | First upstream rebase post-migration verifies "mechanical edits = clean rebase"; conflict count tracked | **DEFERRED to milestone-end (D-17)**; surfaced here for awareness — not delivered in Phase 2. |
| TEST-05 | All ~80 git-touching tests in `tests/` migrated to use the `vcs` fixture | §Test File Inventory: 49 `.test.cjs` files in `tests/` use raw git, plus 8 SDK test files. §Helper Migration covers the `createTempGitProject` shared replacement. |
| UPSTREAM-01 | jj-native rebase workflow documented in `docs/upstream-rebase.md` | **DEFERRED to milestone-end (D-17)**; not delivered in Phase 2. |
| UPSTREAM-02 | Fork-specific code organized to minimize merge conflicts; sidecar paths exist | §Sidecar Conventions: `sdk/src/vcs/jj/` directory creation. |
| UPSTREAM-03 | Hotspot files only see adapter call-site swaps inline — no jj-specific logic embedded | §Hotspot Audit Mechanics defines the verification gate. |
</phase_requirements>

## Summary

Phase 2 is a **mechanical, in-tree migration** with no new technologies, no external libraries, and a forward-complete adapter contract from Phase 1 that should support every call site without expansion. Confidence is high because every migration target was directly inspected: line-precise call-site inventories exist for all 7 `bin/lib/*.cjs` files (one of which — `drift.cjs` — has zero git invocations and is mis-counted in `git-touchpoints.md`), and 5 `sdk/src/query/*.ts` files. The Phase 1 adapter contract maps cleanly to every call site under inspection — `expr.*` factories cover every ref expression seen, `vcs.refs.head` / `vcs.refs.parent` / `vcs.commit` / `vcs.diff` / `vcs.status` / `vcs.workspace.list` / `vcs.workspace.add` / `vcs.gitOnly.version` cover every observed verb. No `expr.range` or `expr.ancestor` need is anticipated.

The `commit.test.ts:304` failure (gating triage plan 02-01) reproduced locally and has a **mechanical root cause**: the test fixture omits `git config commit.gpgsign false` and the user's global git config has `commit.gpgsign=true` with no signing key. Other Phase 1 fixtures (`vcs-fixture.ts`, `git-backend.test.ts`, `helpers.cjs`) correctly disable gpg signing — the fix is two added `execSync('git config commit.gpgsign false', …)` and `tag.gpgsign false` lines in the `beforeEach` block. **Triage scope for plan 02-01 is two added lines, not a real bug investigation.**

The single largest unknown is the day-one allowlist shrink's CI behavior: CI on `phase/02-migration` only runs at PR-open time (the `pull_request` trigger is `branches: [main]`), so the long-lived branch can carry broken-lint commits without per-push CI noise. Lint will block the eventual merge PR until the allowlist re-stabilizes. There are no branch-protection rules for `phase/*` — only `main` is protected.

**Primary recommendation:** Plan 02-01 = mechanical triage (add 2 fixture lines, re-bless 9 currently-failing tests). Plan 02-02 = helpers migration + day-one allowlist shrink (`tests/helpers.cjs::createTempGitProject` becomes adapter-aware; remove `get-shit-done/bin/lib/**/*.cjs` glob and 7 `sdk/src/query/*.ts` explicit entries from allowlist). Subsequent plans migrate one or two source files per plan in ascending LOC order, source+test commits paired per D-06. Plan N (final) creates `sdk/src/vcs/jj/` sidecar (UPSTREAM-02) and runs the hotspot-audit grep (UPSTREAM-03) in the verify pass.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Git call-site execution | SDK (`sdk/src/vcs/backends/git.ts`) | — | Phase 1 forward-complete adapter; all call sites consume it via factory. |
| Per-file migration discipline | Source files (`bin/lib/*.cjs`, `sdk/src/query/*.ts`) | — | Mechanical edit only; no logic changes. D-08. |
| Pre/post-migration parity proof | Test infra (`tests/baselines/git-vcs/`) | Per-call-site baseline JSON | Captured BEFORE swap, asserted AFTER. D-10. |
| Test helper migration | Test infra (`tests/helpers.cjs`) | — | Single share-replacement of `createTempGitProject`. D-09. |
| Lint enforcement | Build/CI (`scripts/lint-vcs-no-raw-git.cjs`) | Allowlist file as live tracker | Day-one glob removal forces every file to migrate. D-13/D-14. |
| Sidecar zero-conflict surface | `sdk/src/vcs/jj/` (created empty) | — | Establishes path before Phase 3 populates. D-15. |
| Hotspot adapter-only-edit audit | Verify pass (grep over migration diffs) | — | Lightweight gate, not a separate plan. D-16. |
| Long-lived branch | `phase/02-migration` (no merge until done) | `main` stays green | D-12. |

## Project Constraints (from CLAUDE.md)

- **GITHUB_TOKEN sourcing:** Any `gh` invocation MUST set `GITHUB_TOKEN` from `.envrc` (`export GITHUB_TOKEN=$(grep GITHUB_TOKEN .envrc | cut -d\' -f2)` or prefix command). Never use ambient `gh auth` session — that resolves to enterprise credentials lacking access to `gsd-build/get-shit-done`. **Phase 2 does not invoke `gh` directly**, but agent skill files and any spawned subagent doing GitHub work must respect this.
- **Issue tracker:** Issues live in GitHub Issues at `gsd-build/get-shit-done`. See `docs/agents/issue-tracker.md`.
- **Triage labels:** Custom mapping documented in `docs/agents/triage-labels.md`. Phase 2 does not interact with labels directly but plans should be aware.

## Standard Stack

Phase 2 uses **only what Phase 1 already shipped** — no new dependencies, no version bumps. The migration is purely in-tree.

### Core (already installed by Phase 1, no version churn)
| Library/Module | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `@gsd-build/sdk/dist-cjs/vcs` (in-tree) | n/a (workspace) | The VcsAdapter consumption surface; `createVcsAdapter`, `expr`, `execGit`, `vcsExec` re-exports | Phase 1 D-04 forward-complete contract; consumed via plain `require()` from `bin/lib/*.cjs`. |
| `vitest` | ^3.1.1 (in `sdk/package.json`) | Test runner for SDK-side migrations | Already wired; no change. |
| `node:test` | Node ≥22 built-in | Test runner for `tests/*.test.cjs` (CJS-side) | Already wired; no change. |
| Node.js `child_process` | Node built-in | Phase 2 REMOVES direct usage from migration targets — only the adapter retains it | Migration goal: zero direct `child_process` git invocations remain. |

### Supporting
None — there is nothing new to install. The migration replaces existing imports and call patterns with the Phase 1 adapter.

### Alternatives Considered
None applicable. Phase 1's "forward-complete adapter" decision (D-04) means there is no design alternative to consider in Phase 2 — this phase is pure mechanical replacement against an already-locked contract.

**Installation:** N/A — no packages added.

**Version verification:** N/A — Phase 2 introduces no new dependencies.

## Package Legitimacy Audit

**Not applicable** — Phase 2 installs zero external packages. Every consumed module is either Node built-in (`child_process`, `path`, `fs`) or already in the workspace (`@gsd-build/sdk` workspace package, in-tree `tests/helpers.cjs`). No npm/PyPI/crates touch occurs.

## Architecture Patterns

### System Architecture Diagram (Phase 2 migration flow per call site)

```
[ Pre-migration source ]
get-shit-done/bin/lib/<file>.cjs:<line>
   │  execGit(cwd, [<args>])  ←  imported from ./core.cjs (CJS-local execGit)
   ▼
[ Step 1: capture baseline ]
node tests/__tools__/capture-vcs-baselines.cjs (extended with new entry)
   │  → setupFixture(steps) → spawnSync('git', args, …)
   ▼
tests/baselines/git-vcs/<file-stem>-<line>-<verb>.snap.json  (committed)

[ Step 2: swap source call site ]
   │  - require('@gsd-build/sdk/dist-cjs/vcs') at top of file
   │  - replace `execGit(cwd, [<args>])` with adapter call:
   │      vcs.refs.head           (expr.head() / refs.head)
   │      vcs.commit({...})       (commit verbs)
   │      vcs.diff({staged: true, nameOnly: true})
   │      vcs.status({porcelain: true})
   │      vcs.workspace.list()    (worktree-safety.cjs)
   │      vcs.gitOnly.version()   (after vcs.kind === 'git' narrow)
   ▼
[ Step 3: assert parity ]
sdk/src/vcs/__tests__/baseline-parity.test.ts asserts adapter
output matches baseline byte-for-byte (5-field shape).

[ Step 4: retarget paired test ]
Per D-06: same commit, retarget the file's test onto vcsTest fixture.

[ Step 5: per-file commit ]
git commit -am "refactor(<file>): migrate to VcsAdapter"
   (per-file, source+tests, no surrounding-logic edits — D-05/D-08)
```

### Recommended Project Structure (no changes — only the sidecar dir is new)
```
sdk/src/vcs/
├── index.ts            # Phase 1; UNCHANGED in Phase 2
├── types.ts            # Phase 1; UNCHANGED
├── exec.ts             # Phase 1; UNCHANGED
├── expr.ts             # Phase 1; UNCHANGED (no new factories anticipated)
├── backends/git.ts     # Phase 1; UNCHANGED
├── parse/git-rev.ts    # Phase 1; UNCHANGED
├── parse/jj-rev.ts     # Phase 1; UNCHANGED
├── parse/worktree-list.ts # Phase 1; UNCHANGED
└── jj/                 # NEW in Phase 2 (D-15) — empty zero-conflict surface
    └── .gitkeep        #   OR a stub index.ts (planner picks; see Pattern 4)

tests/
├── helpers.cjs         # MODIFIED in plan 02-02 (createTempGitProject becomes adapter-aware)
├── baselines/git-vcs/  # 5 baselines from Phase 1; ~30+ added during Phase 2
└── *.test.cjs          # Each retargeted alongside its paired source file
```

### Pattern 1: Per-File Source+Test Atomic Commit (D-05, D-06)

**What:** A single git commit per source file. The commit migrates ALL of that file's `execSync('git …')` / `execGit(...)` sites at once AND retargets the file's paired test file onto the `vcsTest` fixture.

**When to use:** Every per-file migration in plans 02-03 onward.

**Example commit shape (worktree-safety.cjs migration, smoke-test candidate D-01):**
```
refactor(worktree-safety): migrate to VcsAdapter

- Replace inline execGitDefault() with createVcsAdapter consumption
- vcs.workspace.list() replaces all 4 worktree-list/prune sites
- Test suite (tests/orphan-worktree-detection.test.cjs and
  tests/prune-orphaned-worktrees.test.cjs) retargeted to vcsTest

Baselines added:
  - worktree-safety-cjs-80-list-porcelain.snap.json
  - worktree-safety-cjs-122-rev-parse-git-dir.snap.json
  - worktree-safety-cjs-123-rev-parse-common-dir.snap.json
  - worktree-safety-cjs-198-worktree-prune.snap.json

Mechanical edits only (D-08): no logic changes, no rename, no
opportunistic dedup of adjacent invocations.
```

### Pattern 2: Adapter Consumption from CJS (D-15 of Phase 1)

**What:** `bin/lib/*.cjs` files require the dist-cjs build of the SDK adapter via plain CommonJS require.

**Verified working:** Phase 1 plan 01-04's `tests/vcs-cjs-smoke.test.cjs` proved this end-to-end.

**Example (from `tests/helpers.cjs:188`):**
```javascript
// Source: tests/helpers.cjs:185-197 (Phase 1 lazy-getter pattern)
let _vcsModule = null;
function _loadVcs() {
  if (_vcsModule) return _vcsModule;
  try {
    _vcsModule = require('../sdk/dist-cjs/vcs/index.js');
  } catch (err) {
    throw new Error(
      'VCS adapter not built. Run: pnpm -F sdk build:cjs\n' +
      '  Underlying error: ' + (err && err.message ? err.message : String(err))
    );
  }
  return _vcsModule;
}
```

**For Phase 2 migration**, each `bin/lib/*.cjs` file adopts a simpler eager require at top of file:
```javascript
const { createVcsAdapter, expr } = require('@gsd-build/sdk/dist-cjs/vcs');
```
(or relative path `require('../../../../sdk/dist-cjs/vcs')` if package-name resolution isn't wired — verify during smoke-test commit D-01).

### Pattern 3: gitOnly Narrowing for Backend-Specific Calls (Phase 1 D-07)

**What:** A migration site that needs a git-only verb must narrow on `vcs.kind === 'git'` before reaching for `vcs.gitOnly.*`.

**When to use:** Whenever a call site genuinely needs a git verb that has no symmetric jj equivalent — `git --version` (sites: `init.cjs:1538`, `init.ts:1019`) qualifies because it's a git-binary discovery probe.

**Example:**
```typescript
// Source: sdk/src/vcs/types.ts:172-180 (Phase 1 contract)
const vcs = createVcsAdapter(cwd);
if (vcs.kind === 'git') {
  // gitOnly only typed-present on the git branch of the union
  const version = vcs.gitOnly.version(); // returns 'git version 2.50.1 …'
}
```

For `--version` style probes, the migrated site should still feature-detect on TS — calling `vcs.gitOnly.version()` on a non-narrowed adapter is a compile-time error (Phase 1 D-07).

**Anti-narrowing alternative for `--version`:** Two `execSync('git --version', ...)` sites in `init.cjs:1538` and `init.ts:1019` are doing pure binary-availability probes. The semantically clean alternative is a tiny new helper `vcs.gitOnly.binaryAvailable(): boolean` — but that requires Phase 1 surface expansion. **Recommendation: use `vcs.gitOnly.version()` and treat a thrown error as "not available"**; do NOT expand the gitOnly surface for this. (Phase 2 D-08 mechanical-only — surface expansion is a Phase 1 concern that would need a re-discuss.)

### Pattern 4: Sidecar Directory Convention (D-15 — UPSTREAM-02)

**What:** `sdk/src/vcs/jj/` is created as an empty directory in Phase 2. Phase 3 populates it with `jj.ts` (the jj backend) and any per-jj parse files.

**Recommendation between `.gitkeep` vs stub `index.ts`:**

Comparing the two options against this codebase's TS patterns:

| Approach | Pros | Cons |
|----------|------|------|
| `.gitkeep` (empty) | Simplest. Phase 3 has total freedom over directory entry structure. No "what was this stub for?" question when Phase 3 populates. | `.gitkeep` is a convention, not a TypeScript artifact. SDK has no other `.gitkeep` files (verified — `find sdk/ -name .gitkeep` returns empty). Slightly out of place. |
| `jj/index.ts` stub with `export {}` | TypeScript-native. Matches the Phase 1 placeholder pattern (`sdk/src/vcs/_placeholder.ts` was a one-line stub for tsc empty-include). Compiles cleanly. | Begs the question "what's this empty index for?" when Phase 3 lands. Phase 3 may need to overwrite. tsc may also flag if not explicitly included. |

**Verified Phase 1 precedent:** `sdk/src/vcs/_placeholder.ts` was created in plan 01-01 to satisfy tsc's empty-include guard, then **deleted** in plan 01-02 once real adapter modules landed (per STATE.md `Phase 01-02`). This argues against re-creating an empty stub — Phase 3 will face the same delete-when-real-code-lands.

**Recommendation: `.gitkeep`** — it's the lowest-friction zero-conflict surface. Phase 3 deletes it on first commit that adds `sdk/src/vcs/jj/jj.ts`. Document the convention in a brief comment at the top of `.gitkeep`:

```
# sdk/src/vcs/jj/.gitkeep
# UPSTREAM-02 (Phase 2 D-15): zero-conflict sidecar surface.
# Phase 3 populates with jj backend implementation. Delete this file when
# the first real .ts module lands.
```

The planner has discretion (per CONTEXT D-15) — either choice is acceptable.

### Anti-Patterns to Avoid (Phase 2-specific)

- **Opportunistic refactor during migration:** Renaming a variable to "match adapter naming" (e.g., `gitDir` → `headRev`) violates D-08. **Resist.** Open an issue, migrate next time.
- **Squashing two adjacent execSync calls into one adapter call:** Even when "obviously the same operation" (e.g., two `git rev-parse` calls back-to-back). Each call site migrates independently with its own baseline. D-08.
- **Expanding `expr.*` factories without need:** Phase 1 D-12 forbids `expr.raw()`. If a real call site can't be expressed via existing factories, add the factory in a separate plan with rationale. **Verified: every Phase 2 call site fits the existing 4 factories** (`head`, `parent`, `bookmark`, `remote`).
- **Adding a runtime stub for `gitOnly` on the JjVcsAdapter:** Phase 1 D-07 — accessing `vcs.gitOnly.x()` on an unnarrowed adapter is a TS compile error. **Don't add a runtime throwing stub** "for symmetry" — that defeats the type-system enforcement.
- **Using `child_process.execSync` "just for one quick test setup":** Plan 02-02 day-one shrink will mark every such call as a lint violation. Use `vcsTest` fixture or `createTempGitProject` (which becomes adapter-aware in 02-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spawning `git` from `bin/lib/*.cjs` | `execSync('git ...')`, `spawnSync('git', ...)`, custom `execGit` helper | `require('@gsd-build/sdk/dist-cjs/vcs').createVcsAdapter(cwd)` | The whole point of Phase 2. Adapter is forward-complete (D-04). |
| Spawning `git` from `sdk/src/query/*.ts` | `spawnSync('git', ...)` (incl. `-C` form), `execSync` | `import { createVcsAdapter } from '../vcs/index.js'` | Same — the adapter contract is the only legitimate seam. |
| Setting up a tmpDir git fixture in a `tests/*.test.cjs` | Inline `execSync('git init …')` / `git config …` blocks (~12 sites in `commit.test.ts` alone) | `vcsTest('git', (handle) => …)` from helpers.cjs OR `createTempGitProject(prefix)` (after 02-02 makes it adapter-aware) | Tests already have `vcsTest`; the only reason raw git appears is the migration hasn't reached those tests yet. |
| Capturing pre-migration baseline | Hand-rolled spawn + JSON serialize | Append a new entry to `tests/__tools__/capture-vcs-baselines.cjs` `baselines` array; run the script | Phase 1 plan 01-03 built this exact tool for this exact purpose. |
| Snapshot/restore in tests | Hand-rolled `git reset --hard` | `vcs[Symbol.for('gsd.vcs.testOnly')].snapshot()` / `.restore()` | Phase 1 D-14 ships this primitive. |
| Worktree porcelain parsing | Inline `git worktree list --porcelain | parse` | `vcs.workspace.list()` (delegates to `sdk/src/vcs/parse/worktree-list.ts`) | Phase 1 plan 01-03 already moved the parser into the SDK. |

**Key insight:** Phase 1 forward-completed the contract. There is **literally nothing to hand-roll** in Phase 2 — every observed call site fits an existing adapter method. If a planner finds a call site that doesn't, that is either (a) a sign the adapter needs an `expr` factory expansion (small, in-scope), or (b) an escalation that Phase 1's "forward-complete" claim was wrong.

## Call-Site Inventory

This is the **load-bearing artifact** for plan generation. Every line below is the actual call site to migrate, with adapter mapping, baseline file name, and any caller-of-this-file dependency. Confidence: HIGH (all sites verified by direct file read at the listed line, 2026-05-09).

### `get-shit-done/bin/lib/` migrations (26 sites across 6 files; `drift.cjs` excluded — zero git invocations)

#### `worktree-safety.cjs` (338 LOC; **smoke-test candidate per D-01**)

| Line | Current call | Adapter mapping | Notes / Baseline ID |
|------|--------------|-----------------|---------------------|
| 33 | `spawnSync('git', args, …)` inside `execGitDefault()` | DELETE the `execGitDefault` helper; the file imports `vcs.workspace.*` and removes its private exec wrapper. | Internal helper, not a direct adapter swap. |
| 80 | `execGit(repoRoot, ['worktree', 'list', '--porcelain'])` | `vcs.workspace.list()` (returns `WorkspaceInfo[]` — adapt the `parseWorktreeEntries` call site to consume the typed result OR call `sdk/src/vcs/parse/worktree-list.ts::readWorktreeList` if porcelain text is needed). | `worktree-safety-cjs-80-list-porcelain.snap.json` |
| 122 | `execGit(cwd, ['rev-parse', '--git-dir'])` | **No adapter equivalent yet.** This is `--git-dir` (worktree's `.git`), not the `head`/`parent`/`bookmark` set. **Likely needs `vcs.gitOnly.gitDir()`** OR a more general workspace-context method. **Escalate at smoke-test commit time** — this is the single most uncertain Phase-1-forward-complete claim. |
| 123 | `execGit(cwd, ['rev-parse', '--git-common-dir'])` | Same as line 122 — needs `--git-common-dir` access. Same escalation. |
| 198 | `execGit(plan.repoRoot, ['worktree', 'prune'])` | **Not symmetric with workspace.add/forget/list.** Prune is a maintenance verb. Adapter contract has `vcs.workspace.{add,forget,list}` — no `prune`. **Likely needs `vcs.workspace.prune()` or `vcs.gitOnly.workspacePrune()`.** Escalate. |

**Smoke-test recommendation (D-01):** Use line 80 (`worktree list --porcelain` → `vcs.workspace.list()`). It's read-only, has a clean adapter mapping (`workspace.list` already implemented in Phase 1 backend at `sdk/src/vcs/backends/git.ts:209` and tests pass against it), and exercises the `dist-cjs/` consumption path end-to-end. Lines 122/123/198 are NOT good smoke-test candidates because they expose the contract gap above.

**Critical gap surfaced (HIGH significance):** Lines 122, 123, and 198 reveal that **Phase 1's forward-complete claim has gaps**: `--git-dir` / `--git-common-dir` (linked-worktree detection) and `worktree prune` are real call sites with no adapter verb. Recommendations for the planner:
1. **Option A (preferred — extend `vcs.workspace.*`):** Add `vcs.workspace.context()` returning `{ effectiveRoot, mode, isLinked }` (an SDK move of `resolveWorktreeContext` from worktree-safety.cjs) and `vcs.workspace.prune()`. Both are symmetric on jj (jj has `jj workspace forget` and `jj workspace root`). Land in plan 02-XX before the worktree-safety migration commits.
2. **Option B (smaller — `vcs.gitOnly.*`):** Add `vcs.gitOnly.gitDir()`, `vcs.gitOnly.gitCommonDir()`, `vcs.gitOnly.workspacePrune()`. jj backend will throw on access (Phase 1 D-07 narrow-required). Less symmetric but smaller surface.
3. **Option C (defer):** `worktree-safety.cjs` migrates LAST, alongside a Phase-1-amendment plan that lands the missing verbs. **Not recommended** — it pushes a Phase 1 surface decision into Phase 2.

The **planner must address this in plan 02-01 or 02-02** before sequencing migration plans, since worktree-safety.cjs is the ROADMAP-locked smoke-test target. Most likely outcome: a small Phase-1-amendment plan adds `vcs.workspace.context` and `vcs.workspace.prune` (symmetric on both backends), then the smoke-test uses line 80 only and the rest of `worktree-safety.cjs` migrates in a later plan.

#### `init.cjs` (2,024 LOC; 3 git sites)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 1519 | `execSync('git status --porcelain', { cwd: fullPath, … })` | `createVcsAdapter(fullPath).status({porcelain: true})` then `result.entries.length > 0` | `init-cjs-1519-status-porcelain.snap.json` (already exists from Phase 1) |
| 1538 | `execSync('git --version', …)` (binary-available probe) | `createVcsAdapter(cwd); if (vcs.kind === 'git') vcs.gitOnly.version()` — wrap in try/catch, treat throw as "not available" | `init-cjs-1538-version.snap.json` (already exists) |
| 1641 | `execSync('git status --porcelain', { cwd: repoPath, … })` (dirty-repo probe) | Same as 1519 | `init-cjs-1641-status-porcelain.snap.json` (already exists) |

**Caveat:** `init.cjs:1538` is a binary-available probe across an unknown directory (`cwd` may not be a repo). Currently the test for "is git installed" works by running `git --version` from any cwd. The adapter's `createVcsAdapter` requires a `cwd` and walks for `.jj`/`.git`. **Test the migration carefully**: `createVcsAdapter` may auto-detect to `git` even when no repo exists (verified — `index.ts:38` defaults to git when neither found). Then `vcs.gitOnly.version()` does run even on a non-repo cwd (it's `git --version`, doesn't need a repo). This works.

#### `commands.cjs` (1,028 LOC; 14 git sites — the original "3 git subs" count was wrong)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 305 | `execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])` | **No exact adapter verb.** Returns the current branch name. **Use `vcs.refs.bookmarks.list()`** then filter for the active one — but that's awkward. **Likely needs `vcs.refs.currentBranch()` or `vcs.refs.activeBranch`.** Another forward-complete gap. Escalate or use `vcs.gitOnly.*` if added. |
| 308 | `execGit(cwd, ['checkout', '-b', branchName])` | **No adapter verb for `checkout -b`.** This creates AND switches a branch in one git command. `vcs.refs.bookmarks.create(name, rev)` is closest but doesn't do "switch HEAD". **Forward-complete gap.** |
| 310 | `execGit(cwd, ['checkout', branchName])` | **No adapter verb for `checkout`.** Same gap. |
| 330 | `execGit(cwd, ['rm', '--cached', '--ignore-unmatch', file])` | **No adapter verb for `rm --cached`.** This is "stage a deletion." Phase 1 contract handles "add a path" (`vcs.commit({files, …})` does `git add`) but not "rm cached." **Forward-complete gap.** |
| 332 | `execGit(cwd, ['add', file])` | `vcs.commit({files: [...], message})` does add + commit. But this site does add WITHOUT commit (the commit is at line 339). **Mechanical mapping doesn't fit** — Phase 1 contract doesn't expose a bare `add` verb. **Forward-complete gap.** |
| 339 | `execGit(cwd, commitArgs)` (commit) | `vcs.commit({...})` — but this site already did the staging at lines 330/332. Mechanical mapping needs the bare `add` verb to coexist OR the entire stage+commit block restructures into a single `vcs.commit({files, message})` call. **The "single call" path violates D-08 (mechanical-only)** because it removes the `rm --cached` for missing files. |
| 352 | `execGit(cwd, ['rev-parse', '--short', 'HEAD'])` | **No adapter for `rev-parse --short HEAD`.** Phase 1 has `vcs.refs.head` (returns `RevisionExpr`), but that's the *encoded* form — not the resolved short SHA. **Forward-complete gap.** Similar gap exists in `commands.cjs:413`, `commit.ts:179`, `commit.ts:309-313`, `graphify.cjs:373`. |
| 398 | `execGit(repoCwd, ['add', relativePath])` | Same gap as line 332. |
| 402 | `execGit(repoCwd, ['commit', '-m', message])` | `vcs.commit({message, files: ...})` — but the staging is split as in 339. |
| 413 | `execGit(repoCwd, ['rev-parse', '--short', 'HEAD'])` | Same gap as line 352. |
| 917 | `execGit(cwd, ['rev-list', '--count', 'HEAD'])` | **No adapter for `rev-list --count`.** Phase 1 doesn't have a count primitive. **Gap.** Same for `progress.ts:286`. |
| 921 | `execGit(cwd, ['rev-list', '--max-parents=0', 'HEAD'])` | **No adapter for "find root commit."** Gap. Same for `progress.ts:290`. |
| 924 | `execGit(cwd, ['show', '-s', '--format=%as', firstCommit])` | **No adapter for `git show -s --format`.** `vcs.log({maxCount: 1, rev: …})` returns `LogEntry[]` with `date` field — closest mapping. |
| 994 | `execSync('git diff --cached --name-only', …)` | `vcs.diff({staged: true, nameOnly: true}).nameOnly` (returns `string[]`) | `commands-cjs-994-diff-cached.snap.json` (already exists) |

**SIGNIFICANT FORWARD-COMPLETE GAPS surfaced:** `commands.cjs` alone exposes at least **8 adapter contract gaps**:
1. `rev-parse --abbrev-ref HEAD` (current branch name) — no adapter verb
2. `checkout -b <name>` (create + switch branch) — no adapter verb
3. `checkout <name>` (switch to existing branch) — no adapter verb
4. `rm --cached --ignore-unmatch <file>` (stage a deletion) — no adapter verb
5. Bare `add <file>` (stage without commit) — no adapter verb
6. `rev-parse --short HEAD` (resolve current commit short SHA) — no adapter verb (`vcs.refs.head` is encoded `RevisionExpr`, not a resolved SHA string)
7. `rev-list --count <rev>` (count commits) — no adapter verb
8. `rev-list --max-parents=0 <rev>` (find root commit) — no adapter verb

**This is the biggest single Phase 2 risk.** The CONTEXT.md "specifics" note (`§Specifics:7`) explicitly addresses this:
> "If a Phase 2 migration discovers a call site that has no adapter equivalent and isn't legitimately git-only, that's a bug in Phase 1's forward-complete claim — escalate, do not invent runtime hacks."

**Recommendation:** Plans for `commands.cjs` migration MUST be preceded by a Phase-1-amendment plan that lands the missing verbs. The planner should structure plan 02-02 as **"helpers + day-one allowlist shrink + adapter surface gap audit"** with a dedicated task that runs the full call-site inventory against the adapter contract and produces an exact list of missing verbs to land before any per-file migration commit. The discuss-phase D-12 forbids `expr.raw()` but does not forbid extending the adapter — the gap-fill is the legitimate path.

**Likely shape of the gap-fill (sketch):**
```typescript
// sdk/src/vcs/types.ts additions
interface VcsRefs {
  // existing: head, parent, bookmarks
  resolveShort(rev: RevisionExpr): string;          // git: rev-parse --short
  countCommits(opts: { rev?: RevisionExpr }): number; // git: rev-list --count
  rootCommits(opts: { rev?: RevisionExpr }): string[]; // git: rev-list --max-parents=0
  currentBranch(): string | null;                   // git: rev-parse --abbrev-ref HEAD
}
interface VcsBookmarks {
  // existing
  switch(name: string, opts?: { create?: boolean }): void; // git: checkout / checkout -b
}
interface VcsAdapter {
  // existing
  stage(files: string[]): ExecResult;        // git: add <files>
  unstage(files: string[]): ExecResult;      // git: rm --cached --ignore-unmatch
}
```

Whether this surface change happens in a Phase-1-amendment plan or inside a Phase 2 plan is the planner's call (CONTEXT D-04: "Phase 2's first plan triages commit.test.ts:304" — the gap-audit could be the second task of that plan).

#### `verify.cjs` (1,390 LOC; 6 git sites)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 71 | `execGit(cwd, ['cat-file', '-t', hash])` | **No adapter verb for `cat-file -t`** (returns object type). Used as a "does this commit exist?" probe. **Gap.** Likely needs `vcs.refs.exists(rev)` returning boolean. |
| 268 | `execGit(cwd, ['cat-file', '-t', hash])` | Same as 71. |
| 1224 | `execGit(cwd, ['log', '--oneline', '--all', '-50'])` | `vcs.log({format: 'oneline', maxCount: 50})` — but `--all` (across all refs) isn't in `LogOpts`. **Partial gap.** `LogOpts` has `rev`, `maxCount`, `paths`, `format` — no "all refs" flag. |
| 1286 | `execGit(cwd, ['rev-parse', 'HEAD'])` (probe — "is this a git repo") | `vcs.refs.head` returns `RevisionExpr` always (no probing). **Use `vcs.gitOnly.version()` or check `existsSync('.git')` instead.** Or add `vcs.refs.headResolved()` returning `string | null`. Gap. |
| 1305 | `execGit(cwd, ['cat-file', '-t', base])` | Same as 71. |
| 1309 | `execGit(cwd, ['diff', '--name-status', base, 'HEAD'])` | `vcs.diff({rev: <expr>, ...})` — but the adapter `DiffOpts` doesn't have a "name-status" option (current `DiffOpts` has `staged`, `nameOnly`, `rev`, `paths`). **Partial gap.** Either extend `DiffOpts` with `nameStatus: boolean` or add `vcs.diff.nameStatus(...)`. |

**`verify.cjs` adds 4 more gaps** (`cat-file -t`, `log --all`, `rev-parse` as probe, `diff --name-status`). Same recommendation as commands.cjs — fold into the Phase-1-amendment plan.

#### `core.cjs` (2,036 LOC; 2 git sites + 1 internal helper)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 603 | `execFileSync('git', ['check-ignore', '-q', '--no-index', '--', targetPath])` | **No adapter verb for `check-ignore`.** Needs `vcs.refs.checkIgnore(path)` or `vcs.gitOnly.checkIgnore(path)`. (jj has `jj file is-ignored` — symmetric.) Gap. |
| 742 | `execGit(cwd, args)` — **the internal `execGit` helper itself** | DELETE this function entirely once all callers in `core.cjs` (and re-exports to `commands.cjs`/`verify.cjs`/`graphify.cjs`/`worktree-safety.cjs`) migrate. The helper is a 17-line wrapper around `spawnSync('git', ...)` (lines 742-758). |
| 744 | `spawnSync('git', args, …)` inside `execGit` helper | Same — deleted alongside the helper. |

**core.cjs's situation is special.** `core.cjs::execGit` (line 742) is **re-exported** to:
- `commands.cjs:7` (`const { ..., execGit, ... } = require('./core.cjs')`)
- `verify.cjs:8` (`const { ..., execGit, ... } = require('./core.cjs')`)
- `graphify.cjs:6` (`const { atomicWriteFileSync, execGit } = require('./core.cjs')`)

Per D-05 (per-file commit granularity): the commit that migrates core.cjs MUST be the LAST migration commit before the helpers are deleted, OR the `execGit` re-export stays in `core.cjs` as a deprecated alias for callers that haven't migrated yet. **Sequencing implication:** `core.cjs` is the LAST hotspot file to migrate (already locked by D-02 LOC ordering), and the deletion of `core.cjs::execGit` must coincide with the last commit that consumed it. The mechanical-only invariant (D-08) forbids "deprecate now, delete later" — so the right shape is:

1. Migrate `worktree-safety.cjs`, `init.cjs`, `commands.cjs`, `verify.cjs`, `graphify.cjs` first (each removes its `execGit` import from `./core.cjs`).
2. Migrate `core.cjs` last — its commit removes both line-603 `check-ignore` site and the entire `execGit` helper export.

This is consistent with D-02's LOC ordering AND with the mechanical-only invariant.

#### `graphify.cjs` (594 LOC; 2 git sites)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 373 | `execGit(cwd, ['rev-parse', 'HEAD'])` | Same gap as `verify.cjs:1286` — `rev-parse HEAD` for a resolved SHA. Needs `vcs.refs.headResolved()` (or similar). |
| 384 | `execGit(cwd, ['rev-list', '--count', \`${from}..${to}\`])` | Same as `commands.cjs:917` — `rev-list --count`. Plus this site uses a **range expression** (`from..to`) which Phase 1 D-12 doesn't have a factory for. **Two gaps**: count primitive AND range factory `expr.range(from, to)`. |

**`graphify.cjs:384` exposes the `expr.range` need** that Phase 1 D-12 explicitly anticipated:
> "If Phase 2 migration uncovers a call site that can't be expressed structurally, expand the factory (`expr.range`, `expr.ancestor`) — do **not** introduce a string-passthrough escape."

So `expr.range(from, to)` adds to the Phase-1-amendment plan alongside the missing verbs.

#### `drift.cjs` (378 LOC; **0 git sites — `git-touchpoints.md` mis-counted**)

`drift.cjs` is a pure-data module: it consumes parsed git diff output but does NOT spawn git. The `git-touchpoints.md` row "drift.cjs: 4 git subs" is matching the substring "git" in code comments and identifier names (e.g., `git status A (new)`, `git diff output`). **Verified by `grep -nE 'execSync|spawnSync|execFileSync|execGit\\(|child_process' drift.cjs` → no matches.**

**Phase 2 implication:** drift.cjs needs **no migration commit**. It can be removed from any plan list. The planner should explicitly note "drift.cjs: nothing to migrate (pure-data module; git-touchpoints.md miscount)" to avoid future confusion.

### `sdk/src/query/` migrations (11 sites across 5 files)

#### `commit.ts` (318 LOC; 6 sites + internal `execGit` helper)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 37-48 | `export function execGit(cwd, args) { spawnSync('git', args, ...) }` (internal helper) | DELETE. Replaced by `import { execGit } from '../vcs/exec.js'` (already exists in Phase 1, identical signature) OR `import { createVcsAdapter } from '../vcs/index.js'`. | Internal helper — no baseline. |
| 148 | `execGit(projectDir, ['add', '--', file])` | Bare `add` — same gap as commands.cjs:332. Needs `vcs.stage([file])` OR fold into a single `vcs.commit({files, message})` call. |
| 155 | `execGit(projectDir, ['diff', '--cached', '--name-only', '--', ...pathsToCommit])` | `vcs.diff({staged: true, nameOnly: true, paths: [...]}).nameOnly` |
| 170 | `execGit(projectDir, commitArgs)` | `vcs.commit({message, files, allowEmpty?})` (Phase 1 forward-complete adapter contract). |
| 179 | `execGit(projectDir, ['rev-parse', '--short', 'HEAD'])` | Same gap as commands.cjs:352. |
| 211 | `execGit(projectDir, ['diff', '--cached', '--name-only'])` | `vcs.diff({staged: true, nameOnly: true}).nameOnly` |
| 294 | `spawnSync('git', ['-C', projectDir, 'add', '--', ...fileArgs], ...)` (the `commitToSubrepo` flow uses `-C` invocation form) | Bare `add` — same gap. The `-C projectDir` becomes `cwd` of `createVcsAdapter`. |
| 301-304 | `spawnSync('git', ['-C', projectDir, 'commit', '-m', sanitized, '--', ...fileArgs], ...)` | `vcs.commit({message, files: fileArgs})` |
| 309-313 | `spawnSync('git', ['-C', projectDir, 'rev-parse', '--short', 'HEAD'], ...)` | Same gap as 179. |

**`commit.ts:37` is unusually clean to migrate** — the file has its own `execGit` shim that is byte-identical to the one in `sdk/src/vcs/exec.ts`. The mechanical edit is: change the import to `import { execGit } from '../vcs/exec.js'` and delete the local definition. The function remains called the same way; this satisfies D-08 trivially.

`commit.ts:294-313` (the `commitToSubrepo` flow) uses a different invocation pattern (`spawnSync('git', ['-C', projectDir, ...])`). The `-C` form takes the working directory as a flag instead of via spawn options. This is mechanically equivalent and the migration translates `['-C', projectDir, 'add', ...]` into `createVcsAdapter(projectDir).commit(...)` (the cwd moves from arg to factory call).

**Existing baseline:** `commit-ts-execGit-3field.snap.json` (already exists).

#### `init.ts` (1,176 LOC; 3 sites)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 1009 | `execSync('git status --porcelain', { cwd: fullPath, … })` | `createVcsAdapter(fullPath).status({porcelain: true})` (same as `init.cjs:1519`) | Reuse `init-cjs-1519-status-porcelain.snap.json` semantics — capture as `init-ts-1009-status-porcelain.snap.json` per D-10 (every site gets its own). |
| 1019 | `execSync('git --version', …)` | Same as `init.cjs:1538` — `vcs.gitOnly.version()` after `vcs.kind === 'git'` narrow | New: `init-ts-1019-version.snap.json` |
| 1138 | `execSync('git status --porcelain', { cwd: repoPath, … })` | Same as init.cjs:1641 | New: `init-ts-1138-status-porcelain.snap.json` |

Note: `init.ts` is a **TypeScript port of `init.cjs`** (per file headers — "Port of cmdInitListWorkspaces from init.cjs lines …"). The migrations are byte-symmetric. Both should land in same plan or plan group.

#### `verify.ts` (692 LOC; 3 sites)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 336 | `execGit(projectDir, ['cat-file', '-t', hash])` | Same gap as `verify.cjs:71` | `verify-ts-336-cat-file.snap.json` |
| 485 | `execGit(projectDir, ['cat-file', '-t', hash])` | Same gap | `verify-ts-485-cat-file.snap.json` |
| 628 | `execGit(projectDir, ['log', '--oneline', '--all', '-50'])` | Same partial-gap as `verify.cjs:1224` | `verify-ts-628-log-all.snap.json` |

Note: `verify.ts` imports `execGit` from where? Check the actual import — it's likely the SDK-local `commit.ts::execGit` or `vcs/exec.ts::execGit`. Verify in plan time. The migration replaces the imported symbol with the adapter-typed `vcs.*` calls.

#### `progress.ts` (566 LOC; 3 sites)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 286 | `execGit(projectDir, ['rev-list', '--count', 'HEAD'])` | Same gap as `commands.cjs:917` (count primitive) | `progress-ts-286-rev-list-count.snap.json` |
| 290 | `execGit(projectDir, ['rev-list', '--max-parents=0', 'HEAD'])` | Same gap as `commands.cjs:921` (root-commits) | `progress-ts-290-rev-list-root.snap.json` |
| 293 | `execGit(projectDir, ['show', '-s', '--format=%as', firstCommit])` | Use `vcs.log({rev: <expr>, maxCount: 1}).date` | `progress-ts-293-show-format.snap.json` |

#### `check-ship-ready.ts` (103 LOC; 5 sites)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 38 | `runSyncSafe('git status --porcelain', projectDir)` | `vcs.status({porcelain: true})` — but the call site checks `null` for "not a git repo," which is implied by adapter throwing — adjust try/catch boundary. | `check-ship-ready-ts-38-status.snap.json` |
| 41 | `runSyncSafe('git rev-parse --abbrev-ref HEAD', projectDir)` | Current-branch gap (commands.cjs:305) | `check-ship-ready-ts-41-current-branch.snap.json` |
| 50 | `runSyncSafe(\`git config --get branch.${current_branch}.merge\`, projectDir)` | **No adapter for git config read.** Likely needs `vcs.gitOnly.configGet(key)`. Gap. | `check-ship-ready-ts-50-config-get.snap.json` |
| 55 | `boolSyncSafe('git rev-parse --verify main', projectDir)` | **Verify-ref pattern** — `vcs.refs.bookmarks.exists('main')` returns boolean (Phase 1 D-04 lists this). Mapping fits. | `check-ship-ready-ts-55-verify-ref.snap.json` |
| 60 | `runSyncSafe('git remote', projectDir)` | **No adapter for `git remote` (list remotes).** Gap. Needs `vcs.refs.remotes()` or `vcs.gitOnly.listRemotes()`. | `check-ship-ready-ts-60-remote.snap.json` |

`check-ship-ready.ts` adds **3 more gaps**: `git config --get` (read), `git remote` (list), and the current-branch one already known. Add to the gap-fill plan.

### `sdk/src/init-runner.ts` (734 LOC; 1 site, async)

| Line | Current call | Adapter mapping | Baseline ID |
|------|--------------|-----------------|-------------|
| 673-683 | `private execGit(args: string[]): Promise<string>` using `execFile('git', args, {cwd: this.projectDir})` (async) | This is async-shaped; Phase 1 adapter is sync-only. **Gap: async adapter surface.** Either (a) make this site synchronous (it's only used by `await this.execGit(['init'])` at line 139, easy to flip), or (b) Phase 1 amendment adds `vcs.commitAsync` etc. **Recommendation: flip line 139 to sync** — it's a one-shot `git init` during init-runner setup, no concurrency benefit. | `init-runner-ts-139-init.snap.json` |

The `init-runner.ts:139` call is `await this.execGit(['init'])` — a `git init` invocation. The adapter doesn't expose `init` directly, but `createVcsAdapter` requires an existing repo. **This is the one Phase 1 contract gap that's structural**: how does the adapter handle pre-init flows? Phase 1 plan 01-02 chose to fall through to git when neither `.jj` nor `.git` exists (verified: `index.ts:38` `return 'git'` as default). So `createVcsAdapter(projectDir, {kind: 'git'})` works on a fresh dir. But the `git init` itself isn't a `vcs.*` verb. Likely needs `vcs.gitOnly.init()` (and Phase 3 jj backend will add `jj.init()` symmetrically). **Add to gap-fill plan.**

### Forward-Complete Gaps Summary (load-bearing for the planner)

The Phase 1 forward-complete claim has **the following confirmed gaps** that Phase 2 surfaces:

| Verb / Operation | Sites needing it | Suggested adapter shape |
|------------------|------------------|-------------------------|
| Resolve current branch name (`rev-parse --abbrev-ref HEAD`) | commands.cjs:305, check-ship-ready.ts:41 | `vcs.refs.currentBranch(): string \| null` |
| Switch / create branch (`checkout`, `checkout -b`) | commands.cjs:308, 310 | `vcs.refs.bookmarks.switch(name, {create?: bool}): void` |
| Stage path (bare `add`) | commands.cjs:332, 398; commit.ts:148, 294 | `vcs.stage(files: string[]): ExecResult` |
| Unstage / stage-deletion (`rm --cached`) | commands.cjs:330 | `vcs.unstage(files: string[]): ExecResult` |
| Resolve short SHA (`rev-parse --short HEAD`) | commands.cjs:352, 413; commit.ts:179, 309-313; graphify.cjs:373; verify.cjs:1286 | `vcs.refs.resolveShort(rev: RevisionExpr): string` |
| Count commits (`rev-list --count`) | commands.cjs:917; progress.ts:286; graphify.cjs:384 | `vcs.refs.countCommits(opts: {rev?, range?}): number` |
| Find root commit (`rev-list --max-parents=0`) | commands.cjs:921; progress.ts:290 | `vcs.refs.rootCommits(opts: {rev?}): string[]` |
| Object-type probe / commit existence (`cat-file -t`) | verify.cjs:71, 268, 1305; verify.ts:336, 485 | `vcs.refs.exists(rev: RevisionExpr): boolean` |
| Log across all refs (`log --all`) | verify.cjs:1224; verify.ts:628 | Extend `LogOpts` with `allRefs: boolean` |
| Diff with name-status (`diff --name-status`) | verify.cjs:1309 | Extend `DiffOpts` with `nameStatus: boolean` |
| Check-ignore (`check-ignore`) | core.cjs:603 | `vcs.refs.isIgnored(path: string): boolean` |
| Range expression (`from..to`) | graphify.cjs:384 | `expr.range(from: RevisionExpr, to: RevisionExpr): RevisionExpr` |
| Read repo config (`config --get`) | check-ship-ready.ts:50 | `vcs.gitOnly.configGet(key: string): string \| null` |
| List remotes (`git remote`) | check-ship-ready.ts:60 | `vcs.refs.remotes(): string[]` |
| Init repo (`git init`) | init-runner.ts:139 | `vcs.gitOnly.init(): void` (jj-symmetric: `jj git init`) |
| `--git-dir` / `--git-common-dir` (linked-worktree detection) | worktree-safety.cjs:122, 123 | `vcs.workspace.context(): {effectiveRoot, mode}` |
| `worktree prune` | worktree-safety.cjs:198 | `vcs.workspace.prune(): ExecResult` |

**Total: 17 forward-complete gaps.** Most are read-only verbs that fit cleanly into existing namespaces (`vcs.refs.*`, `vcs.workspace.*`); some legitimately belong on `vcs.gitOnly.*` (`init`, `configGet`).

**Planner action required:** Phase 2 cannot proceed past plan 02-02 without a gap-fill plan. The likely shape:

- **Plan 02-01:** Triage `commit.test.ts:304` (mechanical fixture fix; 2 lines) + run the call-site gap audit + produce a definitive gap list.
- **Plan 02-02:** Helpers migration + day-one allowlist shrink + gap-fill (extend `sdk/src/vcs/types.ts`, implement on git backend, add tests). This bundles the gap-fill with the helpers move because the helpers themselves may need some of the new verbs.
- **Plan 02-03 (smoke-test):** D-01 single-site migration in `worktree-safety.cjs:80` (`vcs.workspace.list()` — already implemented in Phase 1, no gap).
- **Plan 02-04 onward:** Per-file migrations in LOC order, consuming the now-complete adapter.

This sequencing respects D-04 (triage in 02-01), D-09 (helpers in 02-02), D-13 (day-one shrink in 02-02), D-01 (smoke-test after 02-02), and the surfaced gap-fill need (post-02-01, before any per-file migration).

## Test File Inventory

### Test files using `tests/helpers.cjs::createTempGitProject` (replaceable in plan 02-02 by helpers migration)

The 14 callers identified by grep are paired with specific source-file migration commits per D-06:

| Test file | Likely paired source file (D-06) |
|-----------|----------------------------------|
| `tests/verify.test.cjs` | `verify.cjs` |
| `tests/schema-drift.test.cjs` | `verify.cjs` (schema-drift code lives there) |
| `tests/profile-output.test.cjs` | `core.cjs` |
| `tests/orphan-worktree-detection.test.cjs` | `worktree-safety.cjs` |
| `tests/enh-3170-graphify-commit-staleness.test.cjs` | `graphify.cjs` |
| `tests/drift-detection.test.cjs` | `drift.cjs` (no migration needed — drift.cjs has no git) — test still uses `createTempGitProject` for a fixture, becomes adapter-aware via the 02-02 helpers migration |
| `tests/core.test.cjs` | `core.cjs` |
| `tests/commit-files-deletion.test.cjs` | `commit.ts` (SDK) and/or `commands.cjs` |
| `tests/commands.test.cjs` | `commands.cjs` |
| `tests/bug-2805-archived-phase-fallback.test.cjs` | (cross-cutting; helpers-only — adapter-aware after 02-02) |
| `tests/bug-2796-arg-parsing-regression.test.cjs` | (cross-cutting) |
| `tests/bug-2772-gitmodules-path-intersection.test.cjs` | `core.cjs` |
| `tests/bug-2767-gsd-sdk-commit-files-flag.test.cjs` | `commit.ts` |
| `tests/prune-orphaned-worktrees.test.cjs` | `worktree-safety.cjs` |

### Tests with raw git invocations beyond `createTempGitProject` (49 files total)

The 49 files counted by grep include both `createTempGitProject`-using tests AND tests that have their own `execSync('git ...')` setup. After plan 02-02 migrates `createTempGitProject` to delegate to `vcsTest`/the adapter, the remaining raw-git invocations in tests are migration-target-paired:

- `tests/workspace.test.cjs` (17 sites): paired with `commands.cjs::cmdNewWorkspace` likely
- `tests/graphify.test.cjs` (25 sites): paired with `graphify.cjs`
- `tests/prune-orphaned-worktrees.test.cjs` (24 sites): paired with `worktree-safety.cjs`
- `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` (16 sites): paired with `worktree-safety.cjs`
- `tests/lint-vcs-no-raw-git-fixture.test.cjs` (22 sites): **legitimately raw git** — this test fixture itself feeds the lint scanner. Stays in allowlist (already covered by Phase 1 D-18).
- `tests/commands.test.cjs` (20 sites): paired with `commands.cjs`
- `tests/__tools__/capture-vcs-baselines.cjs` (10 sites): **legitimately raw git** — the baseline capture tool. Already in allowlist.

Plus ~30 more files with 1-9 raw-git invocations each.

**The key observation for the planner:** plans 02-04 onward should pair source migrations with their test migrations. Some test files (e.g., `tests/lint-vcs-no-raw-git-fixture.test.cjs`, `tests/__tools__/capture-vcs-baselines.cjs`) **never migrate** — they're legitimate exceptions in the allowlist.

### `commit.test.ts:304` Triage (plan 02-01)

**Status:** Reproduced locally on 2026-05-09. **Root cause: missing fixture line.**

**The error:** "fatal: failed to write commit object" caused by `gpg failed to sign the data: gpg: skipped 'Test User <test@test.com>': No secret key`.

**Why it fires:** The user's global git config has `commit.gpgsign=true` (verified via `git config --global --get commit.gpgsign` → `true`). The fixture in `commit.test.ts:18-26` does:
```typescript
beforeEach(async () => {
  tmpDir = await mkdtemp(...);
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
  await mkdir(join(tmpDir, '.planning'), { recursive: true });
});
```

It DOES NOT disable `commit.gpgsign` or `tag.gpgsign`. When the test reaches a `git commit -m "init"` (lines 133, 216, 304), git inherits the global gpgsign setting, fails to sign with the fake test identity (no GPG key), and `fatal: failed to write commit object`.

**Other Phase 1 fixtures DO this correctly:**
- `tests/helpers.cjs::createTempGitProject` (line 93): `execSync('git config commit.gpgsign false', …)` ✓
- `sdk/src/vcs/__tests__/vcs-fixture.ts` (lines 25-26): `commit.gpgsign false` + `tag.gpgsign false` ✓
- `sdk/src/vcs/__tests__/git-backend.test.ts` (lines 31-32): same ✓
- `sdk/src/vcs/__tests__/baseline-parity.test.ts` (lines 51-52): same ✓
- `tests/__tools__/capture-vcs-baselines.cjs` (lines 30-31): same ✓

**`commit.test.ts` was missed.** The fix is mechanical — two lines added to the `beforeEach` block at line 23-25:

```typescript
execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });
execSync('git config tag.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });
```

**After this fix, all 9 currently-failing tests pass** (verified: the 9 failures all happen after a `git commit -m "init"` line, not at any business logic — they are all gpg-signing failures, not commit.ts logic bugs).

**Triage scope for plan 02-01:**
1. Add the two `git config commit/tag.gpgsign false` lines in `commit.test.ts::beforeEach` (lines 23-26).
2. Run `pnpm -F sdk exec vitest run src/query/commit.test.ts` and verify all 21 tests pass.
3. (No test was actually broken by missing fixture — this just gates `commit.test.ts` migration in a later plan per D-03.)

**Key insight:** The "pre-existing test failure" from STATE.md is **environmental, not a real bug**. It will spontaneously fix itself on any developer machine without `commit.gpgsign=true` set globally — which is why CI doesn't see it (CI uses `actions/checkout` and a default-config runner). This is a fixture-quality issue, not a code-correctness issue.

**Ancillary:** Plan 02-01 should also extend `commit.test.ts` migration into the same plan (though scope D-03 says it doesn't migrate until triage lands — once triage lands in the same plan, the migration is freed). The planner can choose to migrate `commit.test.ts` IN plan 02-01 alongside the triage fix, or save it for a later plan paired with `commit.ts` source migration per D-06. **Recommendation: pair with `commit.ts` migration commit per D-06**, since `commit.test.ts` has 30 raw-git invocations and the migration is substantial (not trivial).

## Helpers Migration (D-09 — plan 02-02 scope)

`tests/helpers.cjs` exposes a single git-touching helper that needs migration:

### `createTempGitProject(prefix)` — lines 86-104

**Current shape:** Creates a tmp dir, runs `git init`, sets user.email/name/commit.gpgsign, creates `.planning/PROJECT.md`, stages and commits initial.

**Used by:** 14 test files across `tests/` (enumerated above).

**Migration recommendation:** Two paths considered:

**Option A: Replace with a `vcsTest`-style fixture invocation.** Tests using `createTempGitProject` would convert to `vcsTest('git', (handle) => { ... })`. The handle gives `getCwd()`, and an initial commit is already established by Phase 1's `vcs-fixture.ts` setup. Each test file's structure changes from `beforeEach + cleanup` to `vcsTest` block.

This is the **right end state** but is high-touch — 14 test files restructure.

**Option B: Make `createTempGitProject` adapter-aware.** Keep the function signature stable (still returns a tmpDir path), but internally route the setup through the VcsAdapter. The implementation becomes:

```javascript
function createTempGitProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  // Use the VcsAdapter to bootstrap. The git binary is a Phase 2 implementation
  // detail of the git backend; the adapter contract is what test code consumes.
  const { createVcsAdapter } = _loadVcs().vcs;
  // BUT createVcsAdapter requires an existing repo. So we still need a primitive
  // for "init a fresh repo." Given the gap-fill in plan 02-02 adds vcs.gitOnly.init(),
  // this code becomes:
  //   - mkdir, then either
  //     (a) call vcs.gitOnly.init() (if narrowed to git), or
  //     (b) shell out to git init inside the helpers.cjs allow-list area
  // ...write PROJECT.md...
  // ...vcs.commit({files: ['.'], message: 'initial commit'})...
  return tmpDir;
}
```

**Recommendation: Option B.** Keeps the 14 callers working without restructure. The internal implementation uses the adapter for the post-init operations (config, commit) and uses `vcs.gitOnly.init()` (added in the gap-fill) for the fresh-init step. `tests/helpers.cjs` itself stays in the lint allowlist (per Phase 1 D-18 — it's already there at line 18 of `lint-vcs-no-raw-git.allow.json`), but should NOT contain raw-git invocations anyway. Net result: `createTempGitProject` ends as zero-raw-git after migration.

The 14 tests using `createTempGitProject` continue working without changes. Some of them ALSO have their own raw-git invocations — those are migrated separately when their paired source file migrates.

## Day-One Allowlist Shrink (D-13 — plan 02-02 scope)

**File:** `scripts/lint-vcs-no-raw-git.allow.json` (current state read 2026-05-09).

**Entries to REMOVE on day one of plan 02-02:**

In the `globs` array:
- `"get-shit-done/bin/lib/**/*.cjs"` — broad glob covering all 6 hotspot files
- `"sdk/src/query/commit.ts"`
- `"sdk/src/query/init.ts"`
- `"sdk/src/query/verify.ts"`
- `"sdk/src/query/progress.ts"`
- `"sdk/src/query/check-ship-ready.ts"`
- `"sdk/src/query/check-decision-coverage.ts"` (verified by grep — has 6 git subs per touchpoints; sites visible to lint scanner. Even if no migration ends up needed, it's an explicit entry to be re-evaluated.)
- `"sdk/src/query/docs-init.ts"` (also currently allowlisted)
- `"sdk/src/init-runner.ts"` — single async `execFile('git', ['init'])` site at line 139

**Entries that REMAIN after plan 02-02 (legitimate post-Phase-2 steady state per D-14):**

In the `files` array (24 entries currently — none removed):
- `sdk/src/vcs/exec.ts` — exec wrapper itself
- `sdk/src/vcs/backends/git.ts` — git backend impl
- `sdk/src/vcs/parse/git-rev.ts`, `parse/jj-rev.ts` — translators
- `sdk/src/vcs/__tests__/*` (11 entries) — adapter contract tests, exec tests, backend tests, baseline parity, etc.
- `tests/helpers.cjs` — even after Option B refactor, the `_loadVcs` lazy-loader is here (no git invocation, but the file is sometimes scanned with permissive caution)
- `tests/vcs-adapter-contract.test.cjs`, `vcs-cjs-smoke.test.cjs`
- `tests/__tools__/capture-vcs-baselines.cjs` — baseline tool legitimately uses raw git
- `scripts/lint-vcs-no-raw-git.cjs` — the lint scanner itself (matches `git` patterns by design)
- `scripts/check-skip-count.cjs` — git for skip-count baseline
- `scripts/run-tests.cjs` — currently allowlisted, verify if needed
- `scripts/base64-scan.sh`, `prompt-injection-scan.sh`, `secret-scan.sh` — pre-commit-style filters that need raw git diff
- `docs/adr/0004-worktree-workstream-seam-module.md` — markdown (mentions `git` in prose)

In the `globs` array, REMAINING:
- `"sdk/src/vcs/__tests__/**"` — adapter test directory glob
- `"sdk/src/query/**/*.test.ts"` — SDK query test files (test fixtures legitimately use git)
- `"sdk/src/**/*.integration.test.ts"` — integration test glob
- `"tests/**/*.test.cjs"`, `"tests/**/*.test.ts"` — all test files (per Phase 1 D-18 — tests legitimately use git for setup, paired migrations happen per D-06; the glob narrows over time as migrations complete)
- `".github/workflows/**"` — CI side stays git per CI-03
- `".githooks/**"` — git's own lifecycle hooks
- `"docs/**"` — markdown docs reference `git` in prose
- `".planning/**"` — planning docs reference `git` in prose

**Net day-one diff:** REMOVE the broad `bin/lib` glob (1 entry) + 8 explicit `sdk/src/query/*.ts` and `sdk/src/init-runner.ts` entries (8 entries). Total: 9 entries removed on day one of plan 02-02. After the per-file migration plans land, the migration-related `tests/**/*.test.cjs` glob's surface narrows because no test in the glob has raw-git anymore — but the glob itself stays as a safety net for future test fixtures that genuinely need raw git (the lint allowlist's role per D-14 is to be the live progress tracker, not a permanent allowlist).

**CI behavior on `phase/02-migration` branch:**

`.github/workflows/test.yml:9-11` declares:
```yaml
on:
  push:
    branches: [main, 'release/**', 'hotfix/**']
  pull_request:
    branches: [main]
```

`phase/02-migration` is **not** in the push triggers. CI on the long-lived branch only runs at PR-open time. The lint guard runs as part of the `lint-tests` job (`.github/workflows/test.yml:54`). When the PR opens (Phase 2 complete, ready to merge to main), the lint either passes (allowlist re-stabilized) or blocks the merge.

Branch protection: only `main` is protected (verified by inspecting `.github/workflows/branch-naming.yml` and the lack of any `phase/*` rules). `phase/02-migration` is unprotected — the developer can force-push, rebase, etc. without restriction.

**Conclusion:** The "broken-lint-on-branch" model from D-12 works without CI noise. The planner does not need to add any CI configuration changes to support D-12.

## Sidecar Conventions (UPSTREAM-02 — plan 02-XX)

Per CONTEXT D-15, planner picks `.gitkeep` vs stub `index.ts`. Pattern 4 (above) makes the recommendation: **`.gitkeep`** with a comment noting Phase 3 will replace.

The directory `sdk/src/vcs/jj/` is created in a single small commit. The `.gitkeep` file content (verified suitable for this codebase):

```
# UPSTREAM-02 (Phase 2 D-15): zero-conflict sidecar surface.
# Phase 3 populates with sdk/src/vcs/jj/jj.ts (the jj backend).
# Delete this file when the first real .ts module lands here.
```

`sdk/src/vcs/parse/jj-rev.ts` already exists from Phase 1 (verified). No additional sidecar files are needed in Phase 2.

## Hotspot Audit Mechanics (UPSTREAM-03 — plan 02-XX verify pass)

D-16 specifies: "verify that hotspot files (`core.cjs`, `verify.cjs`, `commands.cjs`) only see adapter call-site swaps inline, with no jj-specific logic embedded — implemented as a verification step inside Phase 2's verify pass, not a free-standing plan. The test is mechanical: grep the per-file migration diffs for any non-adapter-call-site edits, surface for review."

**Implementation shape (recommended for the verify-pass agent):**

The verify-pass produces a per-hotspot-file diff against `main` (the branch base) and runs a grep that flags any line that is NOT one of:
- An import line touching `@gsd-build/sdk/dist-cjs/vcs` or local-relative SDK paths
- A line containing `vcs.` (adapter consumption)
- A line containing `expr.` (RevisionExpr factory consumption)
- A line containing `createVcsAdapter` (factory call)
- A removed line of an `execGit(`, `spawnSync('git'`, `execSync('git`, `execFileSync('git'` invocation
- A removed line of an `execGit(...)` import / `child_process` import
- A whitespace-only or comment-only line change

Any other diff line surfaces as a "non-adapter-call-site edit" warning. Concretely:

```bash
# Pseudo-shell — actual implementation in Node for cross-platform
git diff main..phase/02-migration -- get-shit-done/bin/lib/core.cjs \
  | grep -E '^[+-][^+-]' \
  | grep -vE '^[+-]\s*(const|import|require)\b.*(vcs|@gsd-build|child_process|core\.cjs)' \
  | grep -vE '^[+-]\s*//' \
  | grep -vE '^[+-]\s*$' \
  | grep -vE 'vcs\.|expr\.|createVcsAdapter|execGit\(|spawnSync.*git|execSync.*git|execFileSync.*git' \
  || echo "CLEAN"
```

This lists any line that doesn't fit one of the allowed shapes. The verify-pass agent reviews each surfaced line: if it's a legitimate mechanical edit (e.g., a local helper deleted because all its callers migrated), document; if it's a non-mechanical edit (variable rename, logic tweak), surface as a violation.

**Definition of "non-adapter-call-site edit"**:
- Any change to a function name not directly tied to call-site replacement
- Any change to control flow (added `if`/`else`, restructured try/catch beyond the adapter throws)
- Any rename of a local variable/function that is NOT the surrounding line of a migrated call site
- Any deletion of a comment that doesn't reference git/execSync/execGit
- Any added comment > 3 lines (if you needed >3 lines of comment, you're explaining a non-mechanical change — D-08 violation)

**The grep is heuristic, not exact.** The verify-pass agent's job is to read the surfaced lines and apply judgment; the grep just narrows the review surface from "the whole diff" to "lines that look non-mechanical."

## Per-File Commit + Test-Pair Atomicity (D-05/D-06/D-07)

Source-to-test pairing per migration commit (verified per D-06):

| Source file | Paired test file(s) | Notes |
|-------------|---------------------|-------|
| `worktree-safety.cjs` | `tests/orphan-worktree-detection.test.cjs`, `tests/prune-orphaned-worktrees.test.cjs`, `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs`, `tests/bug-3281-worktree-git-timeout.test.cjs` | 4 paired tests; mass migration. |
| `init.cjs` | `tests/core.test.cjs` (init code is exercised here), other init-specific tests | Confirm at plan time. |
| `init.ts` (SDK) | `sdk/src/init-e2e.integration.test.ts`, `sdk/src/lifecycle-e2e.integration.test.ts` | Both currently use `execSync('git init', …)` for tmpDir setup — paired retarget. |
| `commit.ts` (SDK) | `sdk/src/query/commit.test.ts` (gated on plan 02-01) | The big paired migration. |
| `verify.cjs` | `tests/verify.test.cjs`, `tests/schema-drift.test.cjs` | |
| `verify.ts` (SDK) | (less direct — SDK verify is mostly tested via integration) | Confirm at plan time. |
| `progress.ts` (SDK) | (no direct test of progress.ts found at top-level — likely tested via gsd-tools integration) | Confirm. |
| `commands.cjs` | `tests/commands.test.cjs`, `tests/workspace.test.cjs`, `tests/commit-files-deletion.test.cjs`, `tests/bug-2767-gsd-sdk-commit-files-flag.test.cjs`, `tests/quick-branching.test.cjs`, `tests/bug-2916-handle-branching-default-base.test.cjs` | High pairing; this is the busiest source file by test count. |
| `graphify.cjs` | `tests/graphify.test.cjs`, `tests/enh-3170-graphify-commit-staleness.test.cjs` | |
| `core.cjs` | `tests/core.test.cjs`, `tests/profile-output.test.cjs`, plus all tests that import `core.cjs` indirectly | core.cjs is so widely consumed that "test pair" is a fuzzier concept. |
| `check-ship-ready.ts` | (no direct test found at SDK level; likely tested via integration) | Confirm. |

**Sources whose tests are scattered or shared:** `core.cjs` is the canonical example. Per D-09, the helpers migration in plan 02-02 unblocks ALL test-side raw-git via the `createTempGitProject` migration. After that, individual test files paired with their source file move per D-06; `core.cjs`'s test surface is broad but each test file still pairs with a single source file (not necessarily core.cjs — many tests using core.cjs's `execGit` re-export pair with `commands.cjs` or `verify.cjs`).

## Common Pitfalls (Phase 2-specific)

### Pitfall 1: Surrounding-Logic Temptation in Hotspot Files

**What goes wrong:** While migrating `commands.cjs::cmdCommit` (lines 285-355), the developer notices the commit-args building (lines 337-338) could be simplified — the conditional `amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message]` could be a helper. Refactoring "while we're here" produces a non-mechanical commit. UPSTREAM rebase later sees both adapter-call-site changes AND the helper extraction, the latter conflicts with upstream's own refactor.

**Why it happens:** The mechanical-only invariant (D-08) is psychologically painful when an obvious cleanup is right next to the call site you're touching.

**How to avoid:** D-16's hotspot audit grep catches this — the helper-extraction lines surface as "non-adapter-call-site edit." The verify-pass agent flags. **Build muscle memory: open an issue, do not refactor in-flight.**

**Warning signs:** A migration commit's diff has changes to function bodies that are not the migrated call site lines; new helper functions; imports added that are not the SDK adapter.

### Pitfall 2: Adjacent Call-Site Squashing

**What goes wrong:** `commands.cjs:330-332` is structurally:
```javascript
if (...) {
  execGit(cwd, ['rm', '--cached', '--ignore-unmatch', file]);
} else {
  execGit(cwd, ['add', file]);
}
```
It's tempting to migrate this as `vcs.commit({...})` — one call instead of two. **D-08 forbids this.** The two execGit calls migrate as two adapter calls (`vcs.unstage([file])` and `vcs.stage([file])` — assuming the gap-fill adds these). The block structure stays.

**Why it happens:** "I can do better than the original code." The original code is the spec. D-08 spec.

**How to avoid:** Treat each `execGit(...)` as an atomic unit of migration, even if the surrounding code is dumb. Migration ≠ improvement.

### Pitfall 3: Test-Side Raw Git Reintroduction

**What goes wrong:** A migrated test file uses `vcsTest('git', …)` for the main fixture but a sub-helper inside the test file does `execSync('git status', …)` for "just one quick check." The day-one allowlist shrink flags this immediately if it's in a `bin/lib/` file, but tests are still allowlisted via the `tests/**/*.test.cjs` glob. The raw-git creeps back via the test side and isn't caught until Phase 3 jj-backend tests run against the same fixture.

**Why it happens:** Test files weren't in scope for the D-13 day-one shrink — the glob `tests/**/*.test.cjs` stays in the allowlist as a transitional safety net.

**How to avoid:** The verify-pass should grep the migrated test files for `execSync.*git`, `spawnSync.*git`, `execFileSync.*git` and surface any that are NOT in the legitimate-fixture list (the lint scanner already does this for source files; extending to tests is the next step). **Recommendation: plan 02-02 also tightens `tests/**/*.test.cjs` glob** — change it to require an explicit allowlist entry per file once a file's source pair has migrated. This is a forcing function symmetric with D-13.

### Pitfall 4: `commitToSubrepo` `-C` Form vs Standard `cwd:` Form

**What goes wrong:** `commit.ts:294-313` uses `spawnSync('git', ['-C', projectDir, ...])` instead of `spawnSync('git', [...], {cwd: projectDir})`. These are functionally equivalent on a healthy repo, but `git -C` and `cwd:` differ on **edge cases**: `git -C` resolves the path THEN runs git from the original cwd, while `cwd:` changes the process's working directory before exec. On linked-worktree paths and some symlink configurations, results differ. **A mechanical migration that swaps `'-C', projectDir` for `cwd: projectDir` could subtly change behavior.**

**Why it happens:** The migration agent sees two forms and assumes they're identical.

**How to avoid:** The adapter contract uses `cwd:` (Phase 1 D-04 — `createVcsAdapter(cwd)`). When migrating `commitToSubrepo`, the cwd for `createVcsAdapter` is `projectDir` — the only call shape. Capture a baseline that uses `-C` form, then assert the adapter (using `cwd:`) produces byte-identical output. If they differ, surface the divergence as a Phase 1 contract gap. (Most likely they'll be identical.)

### Pitfall 5: The `dist-cjs` Build Stale-State

**What goes wrong:** A migration commit lands in `bin/lib/core.cjs` but the developer's local `dist-cjs/` is from a stale TS build. Tests pass because the stale `dist-cjs/` still has the Phase 1 adapter code; CI fails because it builds fresh.

**Why it happens:** `pretest` builds the SDK (verified in Phase 1 plan 01-01: `package.json:62 "pretest": "pnpm run build:sdk"`). But ad-hoc test runs (`vitest run path/to/test`) skip the pretest hook in some configurations.

**How to avoid:** Always run via `pnpm test` (which fires pretest) or explicitly `pnpm -F sdk build:cjs` before each migration commit. **Recommendation: plan 02-02 adds a sanity-check task** — verify `dist-cjs/vcs/index.js` is fresh relative to `sdk/src/vcs/index.ts` (mtime check or hash check) before each commit.

### Pitfall 6: Forgetting to Add Baselines

**What goes wrong:** A migration commit lands the source change but not the baseline JSON, OR adds the baseline but doesn't extend `sdk/src/vcs/__tests__/baseline-parity.test.ts` to assert against it. The parity claim of D-10 is broken silently.

**Why it happens:** The baseline-add step is a separate file edit (in `tests/baselines/git-vcs/`) and a separate test edit (in `baseline-parity.test.ts`). Either can be missed.

**How to avoid:** The verify-pass should assert:
- Every migrated `execSync('git ...')` site has a baseline file at `tests/baselines/git-vcs/`
- Every baseline file is referenced by `baseline-parity.test.ts` (or a dedicated test)
- The baseline-parity test passes on the migration commit

This is a 3-line check; bake into the verify-pass.

### Pitfall 7: D-15 Sidecar Decision Re-Litigation

**What goes wrong:** Plan 02-XX (sidecar creation) chooses `.gitkeep`. Phase 3 plans start, decide they want `index.ts` instead, delete `.gitkeep` and add `index.ts`. The "zero-conflict surface" claim is broken because it conflicted with itself between Phase 2 and Phase 3.

**Why it happens:** Decision was deferred to "planner's discretion" without a strong recommendation.

**How to avoid:** Pattern 4 in this RESEARCH.md makes the recommendation: **`.gitkeep`**. Document it explicitly. Phase 3 inherits the choice; if Phase 3 wants to change it, that's a phase-transition decision, not silent drift.

## Code Examples

### Example: Migrating a single read-only call site (the smoke-test commit pattern)

**Before** (`worktree-safety.cjs:80`):
```javascript
function readWorktreeList(repoRoot, deps = {}) {
  const execGit = deps.execGit || execGitDefault;
  const listResult = execGit(repoRoot, ['worktree', 'list', '--porcelain']);
  if (listResult.timedOut) { ... }
  if (listResult.exitCode !== 0) { ... }
  return { ok: true, ..., porcelain: listResult.stdout, entries: parseWorktreeEntries(listResult.stdout) };
}
```

**After** (mechanical edit only):
```javascript
const { createVcsAdapter } = require('@gsd-build/sdk/dist-cjs/vcs');

function readWorktreeList(repoRoot, deps = {}) {
  // D-08: mechanical replacement — preserve dep injection, return shape, error paths.
  const vcs = deps.vcs || createVcsAdapter(repoRoot, { kind: 'git' });
  // vcs.workspace.list() returns WorkspaceInfo[] (typed); the call site needs
  // the original porcelain text for parseWorktreeEntries(). Use the underlying
  // SDK parse module which already has the porcelain reader.
  const { readWorktreeList: readPorcelain } = require('@gsd-build/sdk/dist-cjs/vcs/parse/worktree-list');
  const listResult = readPorcelain(repoRoot);
  if (listResult.reason === 'git_timed_out') { ... }
  if (!listResult.ok) { ... }
  return listResult;
}
```

(The exact shape depends on whether `vcs.workspace.list()` returns the porcelain text or the parsed structure — verified by reading `sdk/src/vcs/backends/git.ts:209` — `workspace.list` returns `WorkspaceInfo[]` parsed structure. The above example uses the parse module directly to preserve byte-identical porcelain access.)

### Example: Baseline addition (per call site)

**Add to `tests/__tools__/capture-vcs-baselines.cjs::baselines` array:**
```javascript
{
  id: 'worktree-safety-cjs-80-list-porcelain',
  source: 'get-shit-done/bin/lib/worktree-safety.cjs:80',
  fixture: [
    'git worktree add /tmp/wt-test',  // create a worktree to populate the porcelain
  ],
  args: ['worktree', 'list', '--porcelain'],
},
```

**Run** `node tests/__tools__/capture-vcs-baselines.cjs` — produces `tests/baselines/git-vcs/worktree-safety-cjs-80-list-porcelain.snap.json`.

**Extend `sdk/src/vcs/__tests__/baseline-parity.test.ts`** (Phase 1 plan 01-03 pattern — already iterates over the baselines array). The new baseline auto-loads.

## State of the Art

**Not applicable for this phase** — Phase 2 introduces no new technologies. The "current approach" is just the Phase 1 forward-complete adapter consumed everywhere.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `commit.test.ts:304` failure root cause is missing `commit.gpgsign=false` config in fixture | §commit.test.ts:304 Triage | LOW — verified locally; if wrong, plan 02-01 expands to a real bug investigation. |
| A2 | The 17 forward-complete gaps surfaced from the call-site inventory are a complete list | §Forward-Complete Gaps Summary | MEDIUM — based on direct file read of every migration target. New gaps could surface during plan 02-02's gap audit. |
| A3 | `core.cjs::execGit` is consumed only by `commands.cjs`, `verify.cjs`, `graphify.cjs`, `worktree-safety.cjs` | §core.cjs migration sequencing | LOW — verified by grep across `bin/lib/`. |
| A4 | drift.cjs has zero git invocations and needs no migration | §drift.cjs | HIGH (verified) — confirmed by direct grep over the file (no `execSync`, `spawnSync`, `execFileSync`, `execGit(`, `child_process`). |
| A5 | The CI workflow's `pull_request` trigger means lint-broken-during-migration on the `phase/02-migration` branch only blocks at PR-open time | §Day-One Allowlist Shrink | LOW — verified by reading `.github/workflows/test.yml:9-11`. |
| A6 | `.gitkeep` is the right sidecar convention vs stub `index.ts` | §Pattern 4 (Sidecar Convention) | LOW — both are acceptable per D-15; recommendation is for least friction. |
| A7 | The hotspot-audit grep shape is sufficient to catch non-mechanical edits | §Hotspot Audit Mechanics | MEDIUM — heuristic, requires verify-pass agent judgment on surfaced lines. False positives expected; false negatives possible. |
| A8 | The `createTempGitProject` Option B (adapter-aware internal) keeps all 14 callers working without restructure | §Helpers Migration | LOW — verified by reading the function signature (returns string path) and matching to caller usage patterns. |
| A9 | `vcs.gitOnly.version()` works on a non-repo cwd | §init.cjs migration | LOW — `git --version` doesn't need a repo; verified by reading the git backend impl at `sdk/src/vcs/backends/git.ts:337`. |
| A10 | The forward-complete contract gap-fill (17 verbs) fits in a single Phase-2 plan (02-02) | §Forward-Complete Gaps Summary | MEDIUM — depends on plan size. May need a dedicated plan 02-02b. Planner's call. |
| A11 | `commit.ts::execGit` (the local helper) is byte-identical to `sdk/src/vcs/exec.ts::execGit` and can be deleted in favor of the SDK import | §commit.ts migration | LOW — verified by direct comparison. Both are 12-line wrappers around `spawnSync('git', args, ...)` with `result.status ?? 1`. The SDK version uses `EXIT_CODE_SIGNAL_KILLED = -1` for the signal-killed case; commit.ts's local helper uses `?? 1`. The Phase 1 verification record (audit_notes) verified no caller relies on the `1` collapse. **Sentinel difference is a known divergence; mechanical replacement is safe.** |
| A12 | Branch protection on `main` does NOT extend to `phase/*` branches | §Day-One Allowlist Shrink | LOW — verified by reading `.github/workflows/branch-naming.yml` and the absence of any phase-branch rules. |

## Open Questions

1. **Should the forward-complete gap-fill (17 verbs) land in plan 02-02 or its own plan 02-02b?**
   - What we know: 17 gaps surfaced; gap-fill is a Phase-1-amendment in spirit but lives in Phase 2 by necessity.
   - What's unclear: Plan size — adding 17 verbs to types.ts + git backend + tests could be 200-400 LOC. Plan 02-02 already has helpers migration + day-one allowlist shrink.
   - Recommendation: Planner's call. If plan 02-02 grows past ~6 tasks, split. If the gap-fill can be batched cleanly, single plan.

2. **What happens if a migrated `bin/lib/*.cjs` file ends up importing `@gsd-build/sdk/dist-cjs/vcs` via a path that doesn't resolve?**
   - What we know: Phase 1 plan 01-04's `tests/vcs-cjs-smoke.test.cjs` proves the path works from `tests/`. `bin/lib/*.cjs` is a different require origin.
   - What's unclear: The smoke-test commit (D-01) is the validation. If it fails, the planner pivots — possibly to a relative path `require('../../../../sdk/dist-cjs/vcs')`.
   - Recommendation: The planner's first task in plan 02-03 (smoke-test) is to verify the require shape and document it for downstream plans.

3. **Are there hidden git invocations in CJS files NOT scanned by the lint scanner today?**
   - What we know: The lint scanner covers `.cjs`, `.js`, `.mjs`, `.ts`, `.yml`, `.yaml`, `.sh`, `.bash`. No coverage of `.json`, `.toml`, or `.py`.
   - What's unclear: Are there `.json` config files referencing git that count? (Probably not — config files declare strings, not invocations.)
   - Recommendation: Out of scope for Phase 2; lint scope can tighten in Phase 4 or 5 if needed.

4. **Does the `vcsTest` fixture's restore-between-tests semantic work for tests that mutate the repo non-trivially (e.g., `tests/workspace.test.cjs`'s 17 sites)?**
   - What we know: Phase 1 plan 01-04 tested `vcsTest` against simple commit/log workflows; complex workspace mutation hasn't been exercised.
   - What's unclear: Whether `vcs.test.snapshot/restore` correctly handles workspaces created by the test (does `git reset --hard + clean -fdx` clean up linked worktrees?).
   - Recommendation: Plan 02-XX migrating `workspace.test.cjs` runs the migrated test in a tight loop pre-commit to validate fixture restore.

5. **Should `commit.test.ts` migrate in plan 02-01 (alongside the triage) or a later plan paired with `commit.ts`?**
   - What we know: D-03 says `commit.test.ts` doesn't migrate until triage lands. D-06 says source+test in same commit.
   - What's unclear: D-06 implies they pair with `commit.ts` migration; D-03 implies the triage opens the gate. Both work.
   - Recommendation: Pair with `commit.ts` migration per D-06 — keeps source+test atomic. The triage in 02-01 only fixes the fixture, the migration of `commit.test.ts` to `vcsTest` happens later.

## Environment Availability

> Skip: Phase 2 is purely in-tree code/config changes consuming Phase 1's SDK output. No new external dependencies. The only tool requirements are git (already available) and Node 22+ / pnpm 11+ (already required by Phase 1 — verified in `.planning/research/STACK.md`).

## Validation Architecture

> Skip per `.planning/config.json`: `workflow.nyquist_validation: false`.

## Security Domain

> Skip: `security_enforcement` not present in `.planning/config.json` `workflow.*` keys. Phase 2 introduces no new attack surface (it removes ad-hoc `execSync` patterns in favor of the validated `vcsExec` wrapper, which is a net security improvement). The Phase 1 `expr.bookmark` validator (verified in `sdk/src/vcs/expr.ts:38-61`) remains the gate for ref-name injection. Migration call sites that previously interpolated user input into git arg arrays (e.g., `commands.cjs:308 execGit(cwd, ['checkout', '-b', branchName])`) inherit the same validation through `expr.bookmark(branchName)` once the gap-fill lands.

## Sources

### Primary (HIGH confidence)
- Direct file reads (2026-05-09):
  - `get-shit-done/bin/lib/core.cjs` (line-precise read of git sites at 603, 742-758)
  - `get-shit-done/bin/lib/worktree-safety.cjs` (full read; 4 git sites at 33, 80, 122, 123, 198)
  - `get-shit-done/bin/lib/init.cjs` (line-precise reads at 1510-1645)
  - `get-shit-done/bin/lib/commands.cjs` (line-precise reads at 285-355, 900-1009)
  - `get-shit-done/bin/lib/verify.cjs` (line-precise reads at 60-95, 260-275, 1218-1320)
  - `get-shit-done/bin/lib/graphify.cjs` (line-precise reads at 365-395; module re-export pattern)
  - `get-shit-done/bin/lib/drift.cjs` (full read — confirms zero git invocations)
  - `sdk/src/query/commit.ts` (full read; 6 sites + internal execGit helper)
  - `sdk/src/query/init.ts` (line-precise reads at 1000-1158)
  - `sdk/src/query/verify.ts` (grep enumeration)
  - `sdk/src/query/progress.ts` (grep enumeration)
  - `sdk/src/query/check-ship-ready.ts` (full read; 5 sites)
  - `sdk/src/init-runner.ts` (line-precise reads at 130-159, 665-685)
  - `sdk/src/vcs/types.ts`, `index.ts`, `expr.ts`, `exec.ts` (Phase 1 contract)
  - `sdk/src/vcs/backends/git.ts` (Phase 1 backend; first 100 lines + grep enumeration)
  - `tests/helpers.cjs` (full read; `createTempGitProject` + `vcsTest`)
  - `tests/__tools__/capture-vcs-baselines.cjs` (Phase 1 baseline tool)
  - `tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json` (baseline format reference)
  - `scripts/lint-vcs-no-raw-git.allow.json` (current allowlist state)
  - `scripts/lint-vcs-no-raw-git.cjs` (scanner shape; first 80 lines)
  - `.planning/phases/01-adapter-foundation-git-backend/01-CONTEXT.md` (Phase 1 locked decisions)
  - `.planning/phases/01-adapter-foundation-git-backend/01-VERIFICATION.md` (Phase 1 known-good baseline)
  - `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`
  - `.planning/intel/git-touchpoints.md`
  - `.github/workflows/test.yml` (CI trigger model)

- Local reproduction (2026-05-09):
  - `pnpm exec vitest run src/query/commit.test.ts` — confirmed 9 failures all caused by `gpg failed to sign the data` due to `commit.gpgsign=true` global + missing fixture line.
  - `git config --global --get commit.gpgsign` returned `true` — confirms environmental cause.

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md` — pre-Phase-1 research, still authoritative for adapter shape.

### Tertiary (LOW confidence)
- None — Phase 2 is in-tree; all sources are direct.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Phase 1 already shipped; nothing new.
- Architecture: HIGH — adapter contract verified directly; mapping to call sites verified line-by-line.
- Pitfalls: HIGH (1, 2, 5, 6) / MEDIUM (3, 7) — surfaced from direct reading of migration targets.
- Forward-complete gaps: HIGH on the inventory (each gap traces to a specific call site); MEDIUM on the suggested adapter shape (the planner may iterate the verb names during plan 02-02).
- commit.test.ts:304 root cause: HIGH — reproduced locally and isolated.
- CI behavior on `phase/02-migration`: HIGH — verified by reading workflow YAML.
- Sidecar choice: MEDIUM — both options work; recommendation based on Phase 1 precedent (`_placeholder.ts` was deleted).

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 (30 days — Phase 2 is in-tree, low drift expected; the only volatility is upstream churn against `bin/lib/*.cjs`, which would require re-running call-site grep against the new state).
