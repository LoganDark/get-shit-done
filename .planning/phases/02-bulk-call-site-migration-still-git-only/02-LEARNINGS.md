---
phase: 2
phase_name: "Bulk Call-Site Migration (Still Git-Only)"
project: "GSD jj-port"
generated: "2026-05-11"
counts:
  decisions: 7
  lessons: 12
  patterns: 11
  surprises: 12
missing_artifacts: []
---

# Phase 2 Learnings: Bulk Call-Site Migration (Still Git-Only)

## Decisions

### Mechanical-Only Invariant (D-08) Honored Throughout
Every commit maintains strict mechanical-only edits: call-site replacements only, no surrounding-logic refactors. Anchored on Phase 1 commit `aeb7d471`; per-file commit + paired-test atomicity per D-05/D-06 enforced at commit-message level.

**Rationale:** Keeps rebase surface clean for the eventual user-driven upstream merge; enables the D-16 hotspot audit to verify the invariant via mechanical-edit-shape grep.
**Source:** 02-04-SUMMARY.md, 02-11-AUDIT.md

---

### W5 Prescriptive Imports (createVcsAdapter Only)
commit.ts and downstream files import exclusively `{ createVcsAdapter } from '../vcs/index.js'` — never `execGit` from `exec.js`. Acceptance grep enforces both positive (≥1 createVcsAdapter) and negative (0 execGit imports).

**Rationale:** Prevents escape hatches; forces all call sites through the high-level adapter API, enabling controlled future backend swaps.
**Source:** 02-08-SUMMARY.md

---

### CommitInput Contract Extension (amend / noVerify / pathspec)
Added optional fields to `CommitInput` as a Rule 3 gap-fill when plan 02-08 discovered the adapter could not express `--amend`, `--no-verify`, or pathspec-scoped commits. Pathspec-only path branches to `git commit -m` (not `-am`) to avoid auto-staging.

**Rationale:** Preserves #3061 scope semantics and commit.ts's invariant that pathspec narrows commit scope independently of staged-file set.
**Source:** 02-08-SUMMARY.md

---

### Day-One Allowlist Shrink + Broken-Lint State (D-13)
Plan 02-02 removed 9 allowlist entries on first day; lint intentionally broken on `phase/02-migration` (exits 1 with 14 violations) while `main` stays green.

**Rationale:** Creates a forcing function — every violation must close to complete the phase. Progress is visible in the allowlist itself (the list IS the work surface, per D-14).
**Source:** 02-02-SUMMARY.md

---

### Per-Call-Site Baselines + Baseline-Parity Dispatch (D-10)
55 snapshot baselines capture pre-migration raw-git output; baseline-parity test verifies adapter reproduces byte-identical output via args-shape-keyed dispatch clauses (not id-keyed, to avoid duplication).

**Rationale:** D-10 anchors on Phase 1; per-site baselines surface any subtle semantic drift (e.g., short vs full SHA, log --oneline reconstruction).
**Source:** 02-04-SUMMARY.md, 02-05-SUMMARY.md

---

### Vacuous-Paired Test Handling (D-08 Precedent)
Tests with zero `execSync('git ...')` matches are NOT retargeted (e.g., quick-branching, bug-2767, bug-2916 use execFileSync; graphify.test.cjs has no git). Including no-op edits violates D-08 mechanical-only.

**Rationale:** Keeps diffs lean; vacuous tests continue to pass unchanged, satisfying AC vacuously.
**Source:** 02-07-SUMMARY.md, 02-09-SUMMARY.md

---

### W1 Baseline Split for Oversized Plans
When a plan's combined commit would exceed the 15-file threshold (02-09 commands.cjs), baseline capture lands as a separate pre-stage commit before source migration. Task 1 = capture + JSON; Task 2 = source migration only.

**Rationale:** Keeps per-file source commits under threshold; baseline JSON is mechanical bookkeeping, separable from the logical diff. D-05 still honored (source commit is still atomic).
**Source:** 02-09-SUMMARY.md

---

## Lessons

### Phase 1 Forward-Complete Claim Was Incomplete
RESEARCH anticipated ~8 forward-complete gaps; direct execution-time reading surfaced 17 (10 Cluster 1 verbs/options, 8 Cluster 2 workspace/gitOnly/options + 2 factories). Plan 02-03 closed all 17 plus 3 plan-checker iteration-1 blockers (`expr.commit`, `workspace.context` shape extension, `gitOnly.configSet`).

**Context:** The RESEARCH model-checking missed call sites that only surfaced when code was read end-to-end for the first time. "Forward-complete" is a high bar that needs validation by attempting actual migration.
**Source:** 02-03-SUMMARY.md

---

### `expr.commit(sha)` Factory Was Load-Bearing
Plan-checker iteration 1 surfaced Blocker 3. Without it, D-12 (no `expr.raw()`) couldn't hold on production call sites (progress.ts:293, commands.cjs:924, verify.cjs five sites). The 4-40 hex validator is strict enough to catch malformed inputs.

**Context:** cat-file -t probes and range expressions embed runtime SHAs that can't be literals at plan time. Structured factories with input validation are the only safe way to wrap runtime SHA strings.
**Source:** 02-03-SUMMARY.md, 02-06-SUMMARY.md, 02-09-SUMMARY.md

---

### `gitDir` vs `gitCommonDir` Distinction Was Critical (Blocker 4)
Plan-checker iteration 1 flagged that `workspace.context()` must expose both `gitDir` and `gitCommonDir` (not just `effectiveRoot`). worktree-safety.cjs:122-123 depends on the distinction for linked-worktree detection.

**Context:** Linked worktree semantics require the git-directory layout to distinguish main repo (`gitDir === gitCommonDir`) from linked worktrees (`gitDir = .git/worktrees/<name>`).
**Source:** 02-03-SUMMARY.md, 02-04-SUMMARY.md

---

### `cat-file -t` Semantic Shift Was Plan-Sanctioned
Migrating `cat-file -t` probes to `vcs.refs.exists` loses object-type discrimination (tree/blob/tag also satisfy). Plan-sanctioned because (a) CLI inputs are commit SHAs in practice, (b) `expr.commit` shape validation catches malformed inputs, (c) tests pass.

**Context:** Adding `existsWithType` would expand API surface for a narrow case. The migration trades a narrow type guarantee for a wider API.
**Source:** 02-10-SUMMARY.md, 02-VERIFICATION.md

---

### #2014 Invariant Required Explicit Safeguard
Plan 02-09 migration of cmdCommit initially regressed #2014 (delete-missing-file recording bug). Naive `vcs.commit({pathspec})` with all-missing entries routes through `git commit -- <missing-path>`, recording deletions. Fix: `stagedOrUnstaged` tracking with short-circuit to `nothing_to_commit` when no entries survived the loop.

**Context:** The adapter's pathspec semantics (narrowing commit scope) don't model the "no pathspec = auto-stage all" vs "pathspec = commit only these paths" distinction. The short-circuit avoids a Rule 3 gap-fill while preserving byte-for-byte invariant.
**Source:** 02-09-SUMMARY.md

---

### Tri-State Null in graphify Required Pre-Check
Plan 02-07 migration of `countCommitsBetween` initially lost tri-state null (original returned null when either ref unreachable; `vcs.refs.countCommits` returns 0 on non-zero exit). Fix: pre-validate ref existence via `vcs.refs.exists` before counting. Rule 2 correctness preservation.

**Context:** Caller relies on null tri-state to detect "rebased-away commit" (unknown) vs "in-sync" (count=0). Adapter contract didn't model the tri-state explicitly.
**Source:** 02-07-SUMMARY.md

---

### Baseline-Parity Per-Fixture Re-Init Pattern
State-mutating operations (commit, checkout, branch-create, unstage) require fresh fixture re-init for the adapter call in baseline-parity dispatch. Canonical execGit upstream call already changed fixture state; re-running adapter on the same state hits "nothing to commit" or "branch exists" failures.

**Context:** The parity test must compare canonical and adapter under equivalent preconditions. Pattern landed in 02-07 and repeated in 02-08/02-09.
**Source:** 02-07-SUMMARY.md, 02-08-SUMMARY.md, 02-09-SUMMARY.md

---

### Full→Short SHA Change at graphify:373
Pre-migration `git rev-parse HEAD` returns full 40-hex; `vcs.refs.resolveShort` returns auto-disambiguated short (7 chars typical). Consumers either (a) `.slice(0,7)` it for display (no-op on already-short) or (b) feed to `expr.commit()` (4-40 hex validator accepts both). Byte-equivalent for downstream usage.

**Context:** Short SHA is sufficient for both consumers; avoids adding a new `headResolved()` verb for an edge case.
**Source:** 02-07-SUMMARY.md

---

### `LogEntry.body` Extraction Needed `git log -z`
Plan 02-06's LogEntry.body population required switching to `git log -z` (NUL-separated) so per-commit body (which can contain newlines) survives the entry separator. Format extended to `%s%n%b` and parser updated to populate body. Additive: prior 4 callers consumed only hash/subject/parents.

**Context:** Byte-equivalent reconstruction of `git log --pretty=%s%n%b` in check-decision-coverage.ts:385 required body field support. Rule 3 contract extension.
**Source:** 02-06-SUMMARY.md

---

### `init-runner` Async Keyword Stays Despite Sync Site
Plan 02-06 migrated init-runner.ts:139 from `await this.execGit(['init'])` to sync `vcs.gitOnly.init()` but kept the containing method's `async` keyword. The method has other awaits (`this.tools.configSet`, `this.tools.commit`, `mkdir`, `writeFile`), so the keyword is semantically required.

**Context:** D-08 forbids removing the async keyword even though one call site became sync; the method body still uses awaits. Mechanical-only means don't change what isn't strictly required by the call-site swap.
**Source:** 02-06-SUMMARY.md

---

### Long-Lived Branch + Broken-Lint Model "Just Works"
D-12 broken-lint-on-branch model: `phase/02-migration` stays broken (exits 1) while `main` stays green. CI on `phase/02-migration` only triggers on PR-open to main per GitHub Actions default — pushes to the branch don't run lint CI, so the team isn't blocked by the intentional breakage.

**Context:** No GitHub Actions config changes were needed to support the model. The default trigger semantics (PR-open, not push) align with the broken-lint-during-migration intent.
**Source:** 02-02-SUMMARY.md

---

### Phantom Touchpoints in RESEARCH Intel
`drift.cjs` was claimed by RESEARCH/touchpoints to have git invocations; execution-time grep found zero. The lint scanner pattern-matches `execSync('git…)`, not wrapper calls — some files exit the lint set even though they never entered it, while others (`check-decision-coverage.ts`) had fewer sites than RESEARCH claimed (1 vs 6).

**Context:** Touchpoint intel was hand-crafted in Phase 1 and not regenerated. Future phases should validate touchpoints against actual execSync inventory before locking plan scope.
**Source:** 02-02-SUMMARY.md, 02-06-SUMMARY.md

---

## Patterns

### Per-File Commit + Paired-Test Atomic Shape
Every migration lands as a single commit: source file + paired test + capture-vcs-baselines.cjs entry + baseline-parity dispatch clause + baseline JSON (D-05 per-file, D-06 paired atomicity). Anchored on Phase 1 commit `aeb7d471`.

**When to use:** Every Branch-by-Abstraction migration in Phase 3+. Reverting one file's migration reverts its tests too — clean rebase history.
**Source:** 02-04-SUMMARY.md through 02-11-SUMMARY.md

---

### Pre-Stage Baseline Capture Commit (W1 Split)
When the combined commit would exceed 15-file threshold, baseline capture lands as a separate pre-stage commit (mechanical bookkeeping — capture tool + JSON) before the source migration commit (logical diff).

**When to use:** Large hotspot files where source + 6+ paired tests + 10+ baselines push the commit above the file-count threshold. The split preserves D-05 source-commit atomicity.
**Source:** 02-09-SUMMARY.md

---

### Smoke-Test Single-Site First (D-01)
Migrate exactly one tiny call site in the first commit of a new consumption-path migration. Plan 02-04 migrated only worktree-safety.cjs:80 in its smoke task to validate `bin/lib/*.cjs → dist-cjs/vcs` consumption path end-to-end before any full file migration.

**When to use:** Any time a new require/import path is exercised in production for the first time. Locks the consumption shape (relative path, package-name, etc.) before committing to bulk migration.
**Source:** 02-04-SUMMARY.md

---

### Forbidden Blocks in Plan Task Action Text
Every plan's mechanical-only task includes an explicit `D-08 forbidden:` list (e.g., "NO helper extraction, NO surrounding-logic refactors, NO opportunistic renames") at the task level. Enforced inline at plan execution; violations caught before commit.

**When to use:** Every mechanical-only migration plan. The list is read by the executor at task-action time and used to bound scope.
**Source:** Every PLAN.md file in Phase 2

---

### `deps = {}` Injection-Seam Preservation (ADR-0004)
When migrating consumers of a wrapper, keep the `deps = {}` parameter signature even if the wrapped verb changes. E.g., `readWorktreeList` previously accepted `deps.readPorcelain`; `resolveWorktreeContext` accepts both `deps.readPorcelain` and `deps.vcs`. ADR-0004 integrity preserved; new seams added without breaking old ones.

**When to use:** Any time a function with a documented injection seam (ADR-0004 or similar) gets migrated. Preserve the parameter signature; add new injection options instead of replacing old ones.
**Source:** 02-04-SUMMARY.md, 02-11-SUMMARY.md

---

### Range-Wrap Pattern (`expr.range` Factory)
Two-rev diff/log forms (e.g., `git diff base HEAD`) are wrapped as `expr.range(expr.commit(base), expr.head())` because `DiffOpts.rev` takes a single RevisionExpr. The range factory encodes as `<base>..<to>` in toGitRev.

**When to use:** Any call site that needs a two-rev range. Validated end-to-end on graphify.cjs:384 and verify.cjs:1309. Mirrors the one-rev API surface without requiring a separate two-rev verb.
**Source:** 02-07-SUMMARY.md, 02-10-SUMMARY.md

---

### `vcs.refs.exists` Pre-Check for Tri-State Null
When a call site needs tri-state null (null = unknown, false = not-reachable, 0 = known-zero), wrap adapter returns with a pre-existence check. E.g., `countCommitsBetween` calls `vcs.refs.exists(both refs)` before counting to preserve the tri-state on unreachable refs.

**When to use:** Any consumer of `countCommits`, `log`, `diff`, or similar that originally treated "ref doesn't exist" as a distinct return value from "zero results". Preserves the tri-state without expanding the adapter contract.
**Source:** 02-07-SUMMARY.md

---

### Day-One Allowlist Shrink + Broken-Lint Long-Lived Branch Model
Shrink the lint allowlist on day-one of a long-lived migration branch so lint exits non-zero with all remaining violations listed. CI on the long-lived branch only runs on PR-open to main (GitHub Actions default), not on pushes, so the team is unblocked.

**When to use:** Any multi-week migration that benefits from a forcing function. The allowlist becomes the live progress tracker (D-14); team sees exactly what's left.
**Source:** 02-02-SUMMARY.md

---

### Hotspot Audit as Verify Gate Inside Migration Plan (D-16)
The UPSTREAM-03 hotspot audit lives as Task 2 of plan 02-11 (a docs commit), not as a free-standing plan. Surfaces the audit verdict before the closing plan closes, enabling the phase verifier to reference it immediately.

**When to use:** Any "mechanical-only" invariant audit that wants to gate a phase's verify-pass. Embedding inside the closing migration plan beats a standalone audit plan — fewer artifacts, clearer ownership.
**Source:** 02-11-SUMMARY.md, 02-11-AUDIT.md

---

### Vacuous-Paired Test Precedent (D-08)
Tests with zero `execSync('git ...')` matches are not retargeted — including no-op edits violates mechanical-only. AC is satisfied vacuously; tests continue to pass unchanged.

**When to use:** Every paired-test acceptance criterion. Verify the test file actually has raw-git invocations before adding a retargeting task; if it doesn't, the AC is met vacuously.
**Source:** 02-07-SUMMARY.md, 02-09-SUMMARY.md, 02-11-SUMMARY.md

---

### Baseline-Parity Args-Shape Dispatch (Not ID-Keyed)
Dispatch clauses key on args-shape (e.g., `args[0] === 'status' && args.includes('--porcelain')`), not baseline id. Adding new baseline files auto-spawns new `it()` cases at runtime. Multiple baselines sharing the same args shape reuse the same clause.

**When to use:** Any baseline-parity test where new baselines will keep being added phase-over-phase. ID-keyed dispatch creates duplication; args-shape dispatch generalizes.
**Source:** 02-05-SUMMARY.md, 02-06-SUMMARY.md

---

## Surprises

### 17 Forward-Complete Adapter Gaps Surfaced from Direct Reading
RESEARCH anticipated ~8 forward-complete gaps; execution-time direct call-site reading uncovered 17 (plus 3 iteration-1 blockers from plan-checker review). Plan 02-03 closed all 20 (17+3).

**Impact:** Phase 2's plan structure had to grow a dedicated gap-fill plan (02-03) that wasn't envisioned during ROADMAP authoring. The Phase 1 D-04 "forward-complete" claim was a research-time hypothesis, not an execution-validated truth.
**Source:** 02-03-SUMMARY.md

---

### `expr.commit` Necessity Surfaced at Plan-Check Iteration 1
Plan-checker iteration 1 flagged Blocker 3 (`expr.commit` factory) as load-bearing. Without it, D-12 (no `expr.raw`) couldn't hold for runtime SHAs in production (6+ sites in verify.cjs/verify.ts alone, plus progress.ts and commands.cjs).

**Impact:** Iteration 1 of plan-check turned out to be necessary — not nice-to-have. Without that gate, the planner would have shipped a plan with no factory for runtime SHA strings, and 4+ per-file plans would have hit the same blocker at execution time.
**Source:** 02-03-SUMMARY.md, 02-06-SUMMARY.md

---

### `gitDir`/`gitCommonDir` Semantics Don't Collapse to `effectiveRoot`
Plan-checker iteration 1 discovered that `workspace.context()` must expose both `gitDir` and `gitCommonDir` separately for linked-worktree detection to work. The planner initially modeled the return as just `effectiveRoot + mode + isLinked`; that didn't cover worktree-safety.cjs:122-123.

**Impact:** Adapter API surface widened mid-revision. The planner's initial type was too narrow; iteration caught it.
**Source:** 02-03-SUMMARY.md, 02-04-SUMMARY.md

---

### `core.cjs::execGit` Re-Export Forced Sequencing Across 4 Consumers
The `execGit` re-export from core.cjs is consumed by worktree-safety, commands, verify, graphify. Sequencing constraint: each consumer migrated first to remove its `execGit` import; core.cjs deleted the helper LAST (02-11) when no consumer remained.

**Impact:** Plan ordering (D-02 ascending-LOC) naturally aligned with this constraint, but it was load-bearing — getting it wrong would have produced commits that don't build. The plan order was already correct; the constraint validated D-02.
**Source:** 02-04-SUMMARY.md, 02-11-SUMMARY.md

---

### 2 Worktree-Test Files Needed Adapter Verbs Not Yet Shipped
Plan 02-04 discovered `prune-orphaned-worktrees.test.cjs` and `bug-2774-worktree-cleanup-workspace-safety.test.cjs` use `git worktree add -b <branch>`, `git merge`, `git checkout`, `git branch -m` — verbs not in the Phase 1 + 02-03 adapter. Deferred as Rule 4 (architectural extension); both files allowlisted; lint still passes. Follow-up plan required to close.

**Impact:** Two test files remain raw-git; ROADMAP success criterion 2 "no skipped-count regression" is satisfied (they still pass), but the "every git-touching test is retargeted" promise has a documented exception.
**Source:** 02-04-SUMMARY.md, 02-VERIFICATION.md

---

### CI on `phase/02-migration` Triggers Only on PR-Open
GitHub Actions default: CI runs on PR-open but NOT on pushes to a branch (only on PRs). D-12 broken-lint-on-branch model "just works" without GitHub Actions config changes. Team unblocked; no false CI failures.

**Impact:** Eliminated a tooling concern at zero cost. The forcing-function model didn't need any CI engineering; it leveraged default behavior.
**Source:** 02-02-SUMMARY.md

---

### `drift.cjs` Had ZERO Git Invocations
RESEARCH claimed touchpoints for drift.cjs; execution-time grep found zero. The file's allowlist removal in 02-02 contributes 0 new lint violations to close — phantom touchpoint in the RESEARCH intel.

**Impact:** Saved a migration commit that would have been a no-op. Surfaced a broader question about touchpoint intel reliability (see Lessons → Phantom Touchpoints).
**Source:** 02-02-SUMMARY.md

---

### Wall-Clock vs Active-Work Time Gap
Vitest spawn overhead dominated wall-clock time on plan 02-06 (~61m wall-clock vs ~6m active work). Multiple `pnpm exec vitest run` invocations spawn ~20 worker processes per run; workers linger after test exit on this machine.

**Impact:** Phase 2 wall-clock estimate was systematically optimistic. Future phases that batch many small files should expect wall-clock to be 10× active-work time on this machine, especially if the executor runs many sequential vitest invocations.
**Source:** 02-06-SUMMARY.md

---

### `init-runner.ts` Async→Sync Flip Without `async` Removal
Only file without a structural in-tree precedent: init-runner.ts:139 flipped from `await this.execGit(['init'])` to sync `vcs.gitOnly.init()` but the containing method's `async` keyword stayed (other awaits remain).

**Impact:** Mechanical-only invariant correctly held — "remove the async keyword because one site became sync" would have been an opportunistic edit. D-08 covers this case explicitly.
**Source:** 02-06-SUMMARY.md

---

### `CommitInput` Extended Mid-Plan as Blocking Gap-Fill
Plan 02-08 discovered the commit.ts migration blocked on `CommitInput` lacking `amend`, `noVerify`, and `pathspec` fields. All three added as a Rule 3 gap-fill. Pathspec-only path branches to `git commit -m` (not `-am`) to preserve #3061 scope invariant.

**Impact:** Adapter type surface kept growing during execution despite the 02-03 gap-fill. Future "complete" adapter claims should be expected to surface 1-2 additional fields per consumer plan.
**Source:** 02-08-SUMMARY.md

---

### #2014 Invariant Regression Caught by Paired Test
Naive `vcs.commit({pathspec: filesToStage})` with all-missing entries records deletions (regression). Paired test `commit-files-deletion.test.cjs` caught it immediately. Fix: `stagedOrUnstaged` tracking + short-circuit to `nothing_to_commit`.

**Impact:** Validated the paired-test atomicity strategy (D-06). Without the paired test landing in the same commit, the regression would have survived to a downstream phase.
**Source:** 02-09-SUMMARY.md

---

### `expr.commit` Production Adoption Spread Wider Than Anticipated
`expr.commit` originated in progress.ts (SDK, plan 02-06) for one site. By plan 02-09, bin/lib consumers (graphify, commands) used it; by plan 02-10, verify files used it (9 sites total across 5 files).

**Impact:** Blocker-3 closure had outsized leverage — one factory absorbed every runtime-SHA wrap site phase-wide. Iteration-1 plan-check earned its keep.
**Source:** 02-06-SUMMARY.md through 02-10-SUMMARY.md
