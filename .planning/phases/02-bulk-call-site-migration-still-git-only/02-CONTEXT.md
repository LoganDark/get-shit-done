# Phase 2: Bulk Call-Site Migration (Still Git-Only) - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate every remaining `execSync('git …')` call site in `sdk/src/query/*.ts` and `get-shit-done/bin/lib/*.cjs` to the `VcsAdapter` (forward-complete from Phase 1). Retarget every git-touching test in `tests/` onto the `vcsTest` fixture / shared adapter-aware helpers. Land the jj sidecar conventions Phase 3 will need (`sdk/src/vcs/jj/` directory existing as a zero-conflict surface, hotspot files audited for adapter-only edits with no jj logic). Migration is **strictly mechanical** — Branch-by-Abstraction call-by-call swaps, no surrounding-logic refactors, no opportunistic cleanup.

**In Phase 2:** MIGR-01, MIGR-02, MIGR-03, TEST-05, UPSTREAM-02, UPSTREAM-03.

**Deferred to milestone-end (post-Phase-5) task:** MIGR-04 (first upstream rebase + conflict-count metric) and UPSTREAM-01 (`docs/upstream-rebase.md` jj-native rebase recipe). User performs the rebase manually after all v1 phases complete; ROADMAP Phase 2 success criteria 4 and 5 will be reframed accordingly at the next phase transition.

**Not in Phase 2:** zero jj backend code (Phase 3), zero workspace/hook changes (Phase 4), zero command/workflow markdown rewrites (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Migration Sequencing

- **D-01 (Smoke-test single site first):** Phase 2's very first migration commit is a single tiny call site (e.g., one `git rev-parse --show-toplevel` invocation in `worktree-safety.cjs` or one trivial `git rev-parse` in `init.cjs`) migrated atomically — and ONLY that. Proves end-to-end `dist-cjs/` consumption from a real `bin/lib/*.cjs` runtime path (Phase 1 only proved it from `tests/helpers.cjs` via lazy getters and from integration tests). Phase 1 deferred-ideas explicitly flagged this.
- **D-02 (Smallest-to-largest LOC after smoke):** After the smoke-test commit, remaining files migrate in ascending LOC order — leaf small files first (`worktree-safety.cjs` 338 LOC, `init.cjs`, `init.ts`, `commit.ts`, etc.), hotspots last (`commands.cjs` 1028, `verify.cjs` 1390, `core.cjs` 2036). Builds pattern muscle memory on small surfaces; reviewer load grows gracefully; rebase-conflict shape (post-deferred-rebase) is established on small surfaces first.
- **D-03 (Pre-existing failure gating):** `sdk/src/query/commit.test.ts` is **not migrated** until the pre-existing `commit.test.ts:304` failure ("fatal: failed to write commit object") is triaged. Phase 2 closes with `commit.test.ts` retargeting only after triage lands.
- **D-04 (Triage is plan 02-01 inside Phase 2):** Phase 2's first plan triages `commit.test.ts:304`. Closing the gate inside the same phase keeps triage scoped, no out-of-phase prerequisite. After 02-01 lands, the smoke-test commit (D-01) is the first work in 02-02 (or 02-03 if helpers split — see D-09).

### Commit & Test Atomicity

- **D-05 (Per-file commit granularity):** Within a single source file with multiple git sites, one commit migrates ALL of that file's sites. `core.cjs` becomes adapter-shaped in one commit, not 6. Reads naturally as "this file became adapter-shaped." Per-file commit history (ROADMAP success criterion 3) is honored as written.
- **D-06 (Source + tests in same commit):** When a source file migrates, its corresponding test file is retargeted onto the `vcs` fixture in the **same** commit. Atomic "this file is now adapter-shaped, including its tests." Each commit is independently green. Cleanest bisect semantics, cleanest rebase semantics, cleanest reviewer story.
- **D-07 (No bare-source commits that leave tests raw-git):** A commit that migrates source without retargeting its tests is forbidden. If a source file's tests can't be retargeted in the same commit (e.g., shared helper not yet adapter-aware), defer the source migration until the helper migration plan (D-09) lands.
- **D-08 (Mechanical-only invariant — D-03 in spirit, restated for Phase 2):** No surrounding-logic refactors during migration commits. No opportunistic variable renames "to match adapter naming." No squashing two adjacent execSync calls into one adapter call even if it's "obviously" the same operation. The diff for each migration commit is JUST the call-site shape change. This is the load-bearing invariant for the eventual user-driven rebase to be clean.

### Test Helper Migration

- **D-09 (Shared test helpers land in their own dedicated plan, before any per-file source/test migration):** Plan 02-02 (after triage 02-01) migrates shared test helpers in `tests/helpers.cjs` (and any other shared git-touching test infra) onto the `vcs` fixture / adapter-aware primitives. After that plan, every subsequent file-pair commit (D-06) consumes the new helpers cleanly. Avoids "this file's commit also rewrote shared infra" bleed. Helpers are NOT left raw-git via the existing allowlist — Phase 2 closes with no raw git in shared test helpers either.

### Baseline Capture

- **D-10 (Every migrated call site gets a baseline):** Each `execSync → adapter` swap captures a pre-migration baseline at `tests/baselines/git-vcs/<call-site>.snap.json` BEFORE the swap, then asserts the post-migration adapter output matches. Maximum parity proof. Aligns directly with the mechanical-edits invariant (D-08): any output divergence shows up immediately at the per-site level. No representative-sampling, no shared baselines across multiple sites.
- **D-11 (Baseline format & re-blessing):** Baselines use the format and rules locked in Phase 1 D-16 — checked-in JSON, no `--update-snapshot` shortcut, re-blessing requires explicit baseline edit (PR-reviewable).

### Lint Allowlist Discipline

- **D-12 (Long-lived `phase/02-migration` branch):** All Phase 2 commits land on a long-lived branch named `phase/02-migration`. The branch is not merged to `main` until Phase 2 is complete. Lint is **broken on that branch** during migration (raw-git removed from allowlist on day one — see D-13). `main` stays green throughout.
- **D-13 (Day-one glob removal, no replacement):** Plan 02-02 (helpers migration) deletes the broad allowlist globs `get-shit-done/bin/lib/**/*.cjs` and the `sdk/src/query/*.ts` explicit entries on day one — no replacement. Every still-raw-git source file becomes a lint violation immediately. Forces aggressive momentum: every file MUST migrate before the branch can merge to `main`. Maximum forcing function.
- **D-14 (Allowlist file is the live progress tracker):** Day-one glob removal means the only entries left in the allowlist are the legitimate exceptions (git backend impl, gitOnly namespace impl, baseline-capture tool, GitHub Actions workflows, upstream-tracking docs, base64/secret/prompt-injection scan scripts — per Phase 1 D-18). When the migration branch is fully green, the allowlist matches its post-Phase-2 steady state with zero migration-related entries.

### Sidecar Conventions (UPSTREAM-02 + 03)

- **D-15 (Sidecar dir created, even if empty):** Phase 2 creates `sdk/src/vcs/jj/` as an empty directory with a single `.gitkeep` or a stub `index.ts` (export nothing). Phase 3 will populate it. The path existing as a zero-conflict surface satisfies UPSTREAM-02. `sdk/src/vcs/parse/jj-rev.ts` already exists from Phase 1.
- **D-16 (Hotspot-discipline audit lands as a verification gate):** UPSTREAM-03 — verify that hotspot files (`core.cjs`, `verify.cjs`, `commands.cjs`) only see adapter call-site swaps inline, with no jj-specific logic embedded — is implemented as a verification step inside Phase 2's verify pass, not a free-standing plan. The test is mechanical: grep the per-file migration diffs for any non-adapter-call-site edits, surface for review.

### Rebase Validation (DEFERRED — out of Phase 2)

- **D-17 (MIGR-04 + UPSTREAM-01 deferred to milestone-end task):** The first post-migration upstream rebase, the conflict-count metric, the `.planning/intel/rebase-log.md` log, and `docs/upstream-rebase.md` (jj-native rebase recipe) are ALL deferred to a single milestone-end task that runs after Phase 5 completes. User performs the rebase manually, records the conflict count, writes the recipe doc as a retro of the actual rebase experience. Phase 2's success criteria 4 and 5 in ROADMAP.md will be reframed at the next phase transition to reflect this deferral.
- **D-18 (Why deferred — user preference, not architectural):** User explicitly chose to perform and own the rebase post-v1 ("I'll try a rebase myself after all phases are complete"). The mechanical-edits invariant (D-08) is what Phase 2 actually delivers; the rebase that validates it is a user-driven event after the migration matures across Phase 3, 4, 5 churn. No Phase 2 success depends on the rebase happening.

### Claude's Discretion

- **Smoke-test target choice (D-01):** The exact tiny call site for the smoke commit is the planner's call. Constraints: must be in `bin/lib/*.cjs` (not `sdk/src/query/*.ts`) so it actually exercises the `dist-cjs/` consumption path; must be a read-only git invocation (e.g., `rev-parse`, no commit/branch mutation); should be in a small file. `worktree-safety.cjs` (338 LOC, 1 git sub) is a strong candidate.
- **Within-batch ordering at equal LOC (D-02):** When two files are within ~50 LOC of each other, planner picks order. Smallest-to-largest is the principle, not a tie-breaker over surface complexity.
- **Plan numbering and exact wave structure (D-04, D-09):** Plan 02-01 = triage, plan 02-02 = helpers + day-one allowlist shrink. Beyond that, planner allocates plans by file or file-group as seems sensible, respecting D-05/D-06 atomicity.
- **`.gitkeep` vs stub `index.ts` (D-15):** Whichever is more idiomatic for this codebase's TS package layout. Prefer whichever generates fewer downstream questions when Phase 3 starts populating the dir.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / Phase Scope
- `.planning/PROJECT.md` — Project framing, core value, constraints, key decisions table; "no parallelization yet" memo applies
- `.planning/REQUIREMENTS.md` — MIGR-01..04, TEST-05, UPSTREAM-01..03 are Phase 2 IDs; reconcile-needed footer count discrepancy noted
- `.planning/ROADMAP.md` §"Phase 2: Bulk Call-Site Migration (Still Git-Only)" — Phase goal, success criteria 1–5 (criteria 4 + 5 will be reframed at next phase transition per D-17)
- `.planning/STATE.md` — Pre-Phase-2 state, Phase 1 completion notes, known pre-existing test failures (commit.test.ts:304, config-mutation.test.ts:441)

### Prior Phase Context (load decisions, do NOT re-decide)
- `.planning/phases/01-adapter-foundation-git-backend/01-CONTEXT.md` — Phase 1 D-04 (forward-complete adapter), D-09..D-12 (RevisionExpr design), D-13..D-16 (test fixture, snapshot baselines), D-17..D-19 (lint guard tightening); D-09 mechanical-edits framing applies directly
- `.planning/phases/01-adapter-foundation-git-backend/01-VERIFICATION.md` (if present) — Phase 1 verification record; baseline of what's known-good entering Phase 2

### Architecture & Pitfalls
- `.planning/research/ARCHITECTURE.md` — Adapter shape, layering rules, exec-wrapper design; Phase 2 migrations are direct consumers
- `.planning/research/PITFALLS.md` — Anti-patterns; "skipping ahead to land jj logic before the seam exists at every call site" applies to Phase 2 — this phase IS the seam-everywhere completion
- `.planning/research/STACK.md` — Tech stack constraints (Node ≥22, pnpm 11+, vitest, TS ≥5)

### Codebase Intel
- `.planning/intel/git-touchpoints.md` — Hotspot file LOC table, per-file git-sub counts; drives D-02 ordering and D-16 audit scope

### Phase 1 Code Surfaces (Phase 2 consumes; do NOT modify in Phase 2)
- `sdk/src/vcs/index.ts` — `createVcsAdapter` factory; the consumer entry point for all migrations
- `sdk/src/vcs/types.ts` — `VcsAdapter` discriminated union, namespace types
- `sdk/src/vcs/expr.ts` — `RevisionExpr` factory; ALL ref construction in migrations goes through this
- `sdk/src/vcs/backends/git.ts` — Git backend impl; reference for output shape and edge-case handling
- `sdk/src/vcs/exec.ts` — Exec wrapper; standard `{ exitCode, stdout, stderr }` shape
- `sdk/src/vcs/parse/git-rev.ts`, `sdk/src/vcs/parse/jj-rev.ts` — Per-backend revision translators
- `sdk/dist-cjs/` (built artifact) — `require('@gsd-build/sdk/dist-cjs/vcs')` is the consumption path from `bin/lib/*.cjs`
- `tests/helpers.cjs` — `vcsTest` fixture, `BACKENDS_AVAILABLE`, lazy-getter pattern; Phase 2 migrates the rest of this file's git-touching helpers (D-09)
- `tests/baselines/git-vcs/` — Baseline directory; Phase 2 populates per D-10
- `tests/__tools__/capture-vcs-baselines.cjs` — Baseline capture tool from Phase 1; used per migration to capture pre-migration baselines

### Migration Targets (Phase 2 modifies these)
- `sdk/src/query/init.ts`, `sdk/src/query/commit.ts` — Confirmed remaining `execSync('git …')` sites in TS
- `get-shit-done/bin/lib/core.cjs` — 2,036 LOC, 6 git subs (largest hotspot, migrate last)
- `get-shit-done/bin/lib/verify.cjs` — 1,390 LOC, 9 git subs (second-largest hotspot)
- `get-shit-done/bin/lib/commands.cjs` — 1,028 LOC, 3 git subs
- `get-shit-done/bin/lib/worktree-safety.cjs` — 338 LOC, 1 git sub (smoke-test candidate per D-01)
- `get-shit-done/bin/lib/init.cjs` — 3 git subs
- `get-shit-done/bin/lib/graphify.cjs`, `get-shit-done/bin/lib/drift.cjs` — Smaller migration targets
- `sdk/src/query/commit.test.ts` — Has 30 git invocations; migration GATED on commit.test.ts:304 triage (D-03/D-04)

### Lint Surface
- `scripts/lint-vcs-no-raw-git.cjs` — Lint scanner; runs in CI; Phase 2 day-one allowlist shrink stresses this directly
- `scripts/lint-vcs-no-raw-git.allow.json` — The live progress tracker per D-14; entries to keep are explicitly enumerated in Phase 1 D-18

### ADRs
- `docs/adr/0004-worktree-workstream-seam-module.md` — Worktree seam Phase 2's `worktree-safety.cjs` migration must respect (Phase 1 D-05 wraps this)
- `docs/adr/0006-planning-path-projection-module.md` — Planning path resolution; relevant for adapter `cwd` resolution in migrations
- `docs/adr/0007-sdk-package-seam-module.md` — SDK-to-`get-shit-done-cc` package seam; governs how `dist-cjs/` is consumed from `bin/lib`

### Project Conventions
- `CLAUDE.md` — `.envrc` GITHUB_TOKEN rule for any `gh` invocation
- `CONTEXT.md` (repo root) — Lint-rule recipes, escapeRegex utility, no-source-grep pattern referenced by lint scanner

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`vcsTest` fixture (Phase 1):** Already wired in `tests/helpers.cjs` with lazy getters. Per-file test migration (D-06) plugs into this directly via `describe.for([...BACKENDS])`.
- **`tests/__tools__/capture-vcs-baselines.cjs`:** The pre-migration baseline-capture tool from Phase 1. Phase 2 invokes this per call site (D-10) to populate `tests/baselines/git-vcs/<call-site>.snap.json`.
- **`createVcsAdapter` factory (`sdk/src/vcs/index.ts`):** Auto-detects backend; migrations call `createVcsAdapter(cwd)` and use the discriminated union. `cwd` resolution lives in the consuming file's existing logic (do not relocate).
- **`expr` namespace (`sdk/src/vcs/expr.ts`):** All revision references in migrations construct via `expr.head()`, `expr.parent()`, `expr.bookmark(name)`, etc. No raw-string ref construction (Phase 1 D-12).
- **Existing `worktree-safety.cjs` `readWorktreeList` export:** Phase 1 plan 01-03 promoted this to module surface for adapter DI. Phase 2's `worktree-safety.cjs` migration consumes the adapter without re-exporting; the existing seam stays intact.
- **`escapeRegex` in `core.cjs`:** Available if any per-file migration needs to build patterns from variable inputs (rare).

### Established Patterns

- **Pure CJS in `bin/lib`, ESM TS in `sdk/src`, `dist-cjs/` bridge:** The boundary works (Phase 1 plan 01-02 + 01-03 validated it). Phase 2 migrations consume `require('@gsd-build/sdk/dist-cjs/vcs')` from `bin/lib/*.cjs`; `import` from `sdk/src/...` works inside SDK; tests/helpers.cjs uses lazy `require()`.
- **`{ exitCode, stdout, stderr }` return shape:** Standardized by Phase 1 `exec.ts`. Migrations replace ad-hoc `execSync` parsing with this shape — but only as a mechanical swap (D-08); surrounding code that consumed the previous shape stays put.
- **Symbol-gated test namespaces:** Used for `vcs.test.snapshot/restore` (Phase 1 D-14). Phase 2 test migrations consume these but do not extend the surface (deferred from Phase 1: `vcs.test.dirty()`, `vcs.test.commitFixture(spec)` may surface naturally during Phase 2 — add only if a real migration needs them).
- **Per-file commit history with explicit per-file commit messages:** Already idiomatic in this repo (per recent log). Phase 2's per-file rule (D-05) extends the established cadence.
- **Long-lived feature branches that stage broken-lint state:** New pattern for this repo (D-12). Branch protection rules on `main` should be respected; the long-lived branch is the migration's working surface, not a publishable artifact.

### Integration Points

- **`bin/lib/*.cjs` runtime consumers:** `core.cjs`, `verify.cjs`, `commands.cjs`, `worktree-safety.cjs`, `init.cjs`, `graphify.cjs`, `drift.cjs` — Phase 2 migration targets. Each requires `dist-cjs/vcs` and routes its existing git invocations through the adapter.
- **`sdk/src/query/*.ts` SDK consumers:** `commit.ts`, `init.ts` confirmed; other files in the allowlist may have residual sites from Phase 1's expansion of the explicit list. Phase 2's grep-audit pass (success criterion 1) catches any missed sites.
- **CI lint integration:** `scripts/lint-vcs-no-raw-git.cjs` runs in CI; D-12's long-lived branch model means CI on `phase/02-migration` is broken-but-progressing while CI on `main` stays green. `main` branch protection unaffected.
- **Test matrix:** Phase 1's `vcsTest` parameterization runs against `git` only in Phase 2 (no jj backend yet). `GSD_TEST_BACKENDS=git` is the effective default; jj-backend rows remain skip-counted-as-zero per Phase 1 D-15.

</code_context>

<specifics>
## Specific Ideas

- **Smoke-test target candidate (D-01):** A `git rev-parse --show-toplevel` site in `worktree-safety.cjs` or one trivial `git rev-parse` in `init.cjs` is the strongest candidate. Read-only, small file, exercises `bin/lib/*.cjs` → `dist-cjs/vcs` consumption path end-to-end. Planner picks the exact site after surveying.
- **Plan 02-01 = triage, Plan 02-02 = helpers + day-one allowlist shrink:** This sequencing is locked. The smoke-test commit (D-01) is the first non-helper migration after 02-02 lands.
- **Long-lived branch is named `phase/02-migration`:** D-12. Conventional, matches phase numbering, won't collide with any existing GSD phase-branch naming.
- **`commit.test.ts` migration is a separate plan, gated on 02-01:** Per D-03/D-04, `commit.test.ts` does not migrate until 02-01's triage of the `:304` failure lands. The plan that retargets `commit.test.ts` waits until that gate is open.
- **`config-mutation.test.ts:441` is acknowledged but NOT in Phase 2 scope:** The second pre-existing failure (STATE.md) does not depend on git/vcs and does not block Phase 2. Triage stays in the deferred maintenance bucket. Phase 2 is not making this failure worse.
- **`gitOnly` namespace consumption during migration:** If a migrating call site is genuinely git-specific (e.g., a git-only escape hatch like an annotated-tag operation), it routes through `vcs.gitOnly.*` after narrowing on `vcs.kind === 'git'`. Phase 1 D-07 forbids unnarrowed `gitOnly` access — Phase 2 migrations must narrow first. If a migration discovers a site that has no adapter equivalent and isn't legitimately git-only, that's a bug in Phase 1's forward-complete claim — escalate, do not invent runtime hacks.
- **`expr.raw()` is still forbidden (Phase 1 D-12):** If a Phase 2 migration discovers a call site whose ref expression doesn't fit the existing factory set, expand the factory (e.g., add `expr.range(from, to)`, `expr.ancestor(rev)`) — do NOT introduce a string-passthrough escape. This expansion can land alongside the migration that needs it.

</specifics>

<deferred>
## Deferred Ideas

- **MIGR-04 + UPSTREAM-01 (rebase + rebase recipe doc):** Per D-17, deferred to a single milestone-end task after Phase 5 completes. User performs the rebase manually, records conflict count in `.planning/intel/rebase-log.md` (created at that time), writes `docs/upstream-rebase.md` as a retro of the actual rebase experience.
- **`config-mutation.test.ts:441` triage:** Pre-existing failure, not git/vcs-related. Track in deferred maintenance bucket; surface for triage in a future maintenance plan independent of Phase 2.
- **`vcs.test.*` namespace expansion (carried from Phase 1):** `vcs.test.dirty()`, `vcs.test.commitFixture(spec)` etc. — add only when a real Phase 2 migration needs them. Don't pre-build.
- **REQUIREMENTS.md footer reconciliation (carried from Phase 1):** Footer says 78 requirements; actually 86 across 15 categories. Plus VCS-07 wording vs. Phase 1 D-17 tightening. Reconcile at next phase transition (i.e., on Phase 2 completion).
- **Pre-commit lint integration (carried from Phase 1 D-19):** Lint stays CI-only during Phase 2 (allowlist still curating). Reconsider for pre-commit once allowlist stabilizes (post-Phase-2).
- **Workflow markdown / agent prompt rewrites:** PROMPT-01, PROMPT-02 are Phase 5 territory. Phase 2 does NOT touch `workflows/*.md` or `agents/*.md` — the lint guard's allowlist intentionally exempts these.
- **GitHub Actions workflows stay on git:** CI-03 / Phase 1 D-18 — `.github/workflows/**` is allowlisted permanently (CI side stays on git per project decision). Not a deferred item, just reaffirmed.

</deferred>

---

*Phase: 2-Bulk Call-Site Migration (Still Git-Only)*
*Context gathered: 2026-05-09*
