# Phase 2: Bulk Call-Site Migration (Still Git-Only) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 02-Bulk Call-Site Migration (Still Git-Only)
**Areas discussed:** Migration sequencing, Commit + test atomicity, Baseline + allowlist discipline, Rebase validation cadence

---

## Migration sequencing

### Q1: What's the very first migration commit in Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Single-site smoke test | Pick one tiny call site and migrate ONLY that, atomically, before any sweep. Proves end-to-end `dist-cjs/` consumption from `bin/lib` runtime. | ✓ |
| Smallest file first (no isolated smoke) | Skip the isolated smoke commit — smallest leaf file IS the smoke test. Saves one commit; loses cleanest atomic shape-change diff. | |
| Hotspot first (derisk biggest) | Start with `core.cjs` (2036 LOC). Maximum derisk on riskiest file. Downside: biggest review burden first. | |
| You decide | Defer to Claude/planner. | |

**User's choice:** Single-site smoke test
**Notes:** Phase 1 deferred-ideas explicitly flagged this option ("migrate exactly one trivial call site as proof-of-end-to-end-consumption from `bin/lib/*.cjs`").

---

### Q2: After the smoke-test commit, what ordering principle for the remaining migrations?

| Option | Description | Selected |
|--------|-------------|----------|
| Smallest-to-largest LOC | Build pattern muscle memory on small files first. Reviewer load grows gracefully. | ✓ |
| Leaf-first by import dependency | Topo-sort by file dependency. More principled but harder to compute upfront. | |
| By git verb namespace | Migrate all `rev-parse` first, then all `log`, etc. Within-file diffs tiny, but per-file commit history fractures. | |
| Pure file alphabetical | Predictable, no judgment. Ignores risk distribution. | |

**User's choice:** Smallest-to-largest LOC
**Notes:** Aligns with hotspot-last sequencing. Hotspots `commands.cjs` 1028, `verify.cjs` 1390, `core.cjs` 2036 migrate near phase end.

---

### Q3: How to handle the pre-existing `commit.test.ts:304` failure during migration?

| Option | Description | Selected |
|--------|-------------|----------|
| Mechanical retarget only, leave failure | Retarget setup onto vcs fixture, leave failing assertion. Triage belongs to separate maintenance plan. | |
| Triage failure inline if adapter-related | Hybrid — let migration absorb fix if related. Risks breaking 'mechanical only' rule. | |
| Skip commit.test.ts until failure triaged | Phase 2 declares TEST-05 partially complete with one explicit deferred file until triage. | ✓ |
| Quarantine: mark .skip during migration | Migrate mechanically AND .skip the failing assertion. Violates 'no skipped-count regression'. | |

**User's choice:** Skip commit.test.ts until failure triaged
**Notes:** Triage gated; commit.test.ts retargeting waits until triage lands.

---

### Q4: Where does the commit.test.ts:304 triage live?

| Option | Description | Selected |
|--------|-------------|----------|
| First plan in Phase 2 itself | Plan 02-01 triages the failure inside the same phase. Closes the gate without out-of-phase prerequisite. | ✓ |
| Insert Phase 1.5 / Phase 2.0 maintenance phase | Triage as its own mini-phase before Phase 2. Cleaner phase semantics; adds roadmap insert overhead. | |
| Defer entirely — commit.test.ts excluded from Phase 2 closure | Leave commit.test.ts un-retargeted, carry as deferred to Phase 3+. | |

**User's choice:** First plan in Phase 2 itself (plan 02-01)
**Notes:** Plan 02-01 = triage. Plan 02-02 = helpers + allowlist shrink. Smoke-test (D-01) lands after 02-02.

---

## Commit + test atomicity

### Q1: Within a single source file, what's the commit granularity?

| Option | Description | Selected |
|--------|-------------|----------|
| One commit per file | All execSync sites in a file migrate in one commit. Per-file commit history (ROADMAP). | ✓ |
| One commit per call site | Each swap is its own atomic commit. Maximum bisectability; per-file history becomes fiction. | |
| Per logical operation group | Group related sites within a file. Hybrid; adds judgment per file. | |

**User's choice:** One commit per file
**Notes:** Honors ROADMAP success criterion 3 directly. Reads as "this file became adapter-shaped."

---

### Q2: Tests retargeted onto vcs fixture — same commit as source, separate, or swept?

| Option | Description | Selected |
|--------|-------------|----------|
| Test + source in same commit | Atomic "this file is now adapter-shaped, including its tests." Each commit independently green. | ✓ |
| Source-then-test paired commits (back-to-back) | Same logical pairing, split for review clarity. Slight risk of one landing without other. | |
| All source first, then test sweep at end | Fast source-side progress; lint allowlist stays bloated; final test sweep is huge diff. | |

**User's choice:** Test + source in same commit
**Notes:** Cleanest bisect/rebase semantics.

---

### Q3: Where do shared test helpers land in the per-file atomic model?

| Option | Description | Selected |
|--------|-------------|----------|
| Helper migration is its own first plan | Plan 02-02 (after triage 02-01) migrates shared helpers. Subsequent file-pair commits consume cleanly. | ✓ |
| Migrate helpers lazily — on first consumer | When first source-file commit needs a helper, that commit migrates it too. Risks bleed. | |
| Leave helpers raw-git, allowlist them | Keep raw git in shared test setup. Saves a plan; leaves architectural inconsistency. | |

**User's choice:** Helper migration is its own first plan (plan 02-02)
**Notes:** Avoids "this file's commit also rewrote shared infra" bleed.

---

## Baseline + allowlist discipline

### Q1: What baseline coverage does Phase 2 land?

| Option | Description | Selected |
|--------|-------------|----------|
| Every migrated call site | Each swap captures pre-migration baseline before swap, asserts post-migration matches. Maximum parity proof. | ✓ |
| One baseline per logical operation | Shared baseline across multiple sites. Smaller corpus; risks masking regressions. | |
| Representative sample (riskiest sites only) | Capture only non-trivial parsing sites. Minimum corpus; maximum judgment. | |
| No new baselines — rely on existing test assertions | Existing tests passing IS the parity proof. Smallest scope; loses per-site granularity. | |

**User's choice:** Every migrated call site
**Notes:** Aligns with mechanical-edits invariant — any output divergence shows up immediately.

---

### Q2: How does the allowlist shrink during Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Lockstep file-by-file | Each per-file commit removes that file's allowlist entry. Atomic. | |
| Glob first, then explicit | Plan 02-02 expands glob into explicit per-file entries; subsequent commits delete one by one. | |
| Batch-shrink at phase end | Allowlist stays as-is during migration; final commit deletes all. Lint catches no in-progress regressions. | |
| Remove globs entirely on day one | Plan 02-02 deletes broad glob immediately. Forces every file to migrate before next CI run can pass. | ✓ |

**User's choice:** Remove globs entirely on day one
**Notes:** Maximum forcing function. Conflicts with lint-on-main, resolved via long-lived branch (next question).

---

### Q3: How does day-one glob removal coexist with per-file commits and small-to-large LOC?

| Option | Description | Selected |
|--------|-------------|----------|
| Long-lived migration branch | All Phase 2 commits land on `phase/02-migration` branch. Lint broken on branch until every file migrates. Main stays green. | ✓ |
| Single mega-commit / mega-PR | One commit migrates ALL files plus deletes globs. Atomic; loses per-file history and learning curve. | |
| Reframe choice — actually want 'glob first, then explicit' | Reconsider; revert to less-aggressive option. | |

**User's choice:** Long-lived migration branch
**Notes:** Branch named `phase/02-migration`. Branch never merges to main until Phase 2 complete. Allowlist file becomes live progress tracker.

---

## Rebase validation cadence

### Q1: When does the first post-migration upstream rebase happen?

| Option | Description | Selected |
|--------|-------------|----------|
| End of phase, single rebase | After all Phase 2 migrations land, rebase against latest upstream main once. | |
| Intermediate checkpoints (per hotspot) | Rebase after smoke-test, after small-files batch, after each hotspot. Multiple data points. | |
| Weekly cadence regardless of progress | Rebase every Monday. Catches drift early; doesn't directly test post-migration hypothesis. | |
| Other (free text) | "I'll try a rebase myself after all phases are complete." | ✓ |

**User's choice:** Free-text: "I'll try a rebase myself after all phases are complete."
**Notes:** Rebase deferred entirely from Phase 2. User performs manually post-Phase-5.

---

### Q2: Deferring rebase to post-v1 reframes MIGR-04. What does Phase 2 closure require?

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 ships rebase-readiness; MIGR-04 marked deferred | Phase 2 delivers sidecar paths + `docs/upstream-rebase.md` + empty rebase log. Actual rebase deferred. | |
| Phase 2 stays git-only complete; rebase deferred entirely | UPSTREAM-01..03 stay in scope; only the rebase itself (MIGR-04) is the explicit deferred item. | |
| Push MIGR-04 + UPSTREAM-01 entirely to a final milestone-end task | Move both rebase-related items out. Phase 2 = pure mechanical migration + tests + lint. | ✓ |

**User's choice:** Push MIGR-04 + UPSTREAM-01 entirely to a final milestone-end task
**Notes:** UPSTREAM-02 (sidecar paths) clarified next — stays in Phase 2.

---

### Q3: What about UPSTREAM-02 (sidecar paths) for Phase 3 readiness?

| Option | Description | Selected |
|--------|-------------|----------|
| UPSTREAM-02 stays in Phase 2 | Land empty `sdk/src/vcs/jj/` dir + UPSTREAM-03 hotspot audit. Code-org tasks belong with migration. | ✓ |
| All UPSTREAM-* push out together | Phase 3 absorbs sidecar dir creation. Cleanest scope cut for Phase 2. | |
| Only UPSTREAM-03 stays; UPSTREAM-01 + 02 push out | Hotspot audit stays as quality bar; sidecars + rebase docs both push out. | |

**User's choice:** UPSTREAM-02 stays in Phase 2
**Notes:** UPSTREAM-03 also stays per discussion — implemented as verify-pass gate, not free-standing plan.

---

### Q4: Phase 2 scope confirmation.

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmed | In-scope: MIGR-01..03, TEST-05, UPSTREAM-02, UPSTREAM-03. Out-of-scope (deferred): MIGR-04, UPSTREAM-01. | ✓ |
| Adjust scope | Reconsider. | |

**User's choice:** Confirmed
**Notes:** ROADMAP Phase 2 success criteria 4 + 5 will be reframed at next phase transition to reflect MIGR-04 / UPSTREAM-01 deferral.

---

## Claude's Discretion

- Smoke-test target site (D-01): planner picks the exact tiny call site, with constraints listed.
- Within-batch ordering at equal LOC (D-02): planner picks ties.
- Plan numbering and exact wave structure beyond 02-01 / 02-02: planner allocates plans by file or file-group.
- `.gitkeep` vs stub `index.ts` for `sdk/src/vcs/jj/` (D-15): whichever is more idiomatic.

## Deferred Ideas

- MIGR-04 (first upstream rebase) + UPSTREAM-01 (`docs/upstream-rebase.md`) — milestone-end task post-Phase-5.
- `config-mutation.test.ts:441` pre-existing failure — non-git, separate maintenance triage.
- `vcs.test.*` namespace expansion (carried from Phase 1) — add only if a real Phase 2 migration needs it.
- REQUIREMENTS.md footer reconciliation (78 vs 86) — at next phase transition.
- Pre-commit lint integration — reconsider post-Phase-2 once allowlist stabilizes.
- Workflow markdown / agent prompt rewrites — Phase 5 territory.
