---
phase: 05-command-translations-brownfield-validation-ci-hardening
plan: 04
subsystem: vcs/__tests__
tags: [brownfield, jj, CMD-10, D-34, synth-fixture]
dependency_graph:
  requires:
    - 05-01-SUMMARY (D-32 / D-33 / D-34 lock; sticky-adapter deferral)
    - sdk/src/vcs/__tests__/vcs-fixture.ts (initJjRepo factory shape)
    - sdk/src/vcs/__tests__/cmd-discuss-phase-jj.test.ts (ancestry-query pattern for jj squash-based log assertions)
  provides:
    - sdk/src/vcs/__tests__/synth-planning-fixture.ts (synth-planning skeleton factory for any future CMD-* test)
    - integration coverage for 5 CMD-10 brownfield commands on jj-colocated mode
  affects:
    - hand-off to plan 05-05 (CI hardening — inherits the unique-tmpdir-prefix pattern these tests use)
tech_stack:
  added: []
  patterns:
    - beforeEach/afterEach per-test fixture lifecycle (not beforeAll/afterAll) to avoid mutation-cross-contamination
    - vcs.log({maxCount:10, allRefs:true}) + ancestry-string join to assert subject after jj squash-based commit
    - unique per-file tmpdir prefix (gsd-synth-jj-colo-, gsd-cmd-import-jj-, …) to preempt the Phase 4 LEARNINGS flake category
key_files:
  created:
    - sdk/src/vcs/__tests__/synth-planning-fixture.ts
    - sdk/src/vcs/__tests__/synth-planning-fixture.test.ts
    - sdk/src/vcs/__tests__/cmd-resume-work-jj.test.ts
    - sdk/src/vcs/__tests__/cmd-pause-work-jj.test.ts
    - sdk/src/vcs/__tests__/cmd-import-jj.test.ts
    - sdk/src/vcs/__tests__/cmd-ingest-docs-jj.test.ts
    - sdk/src/vcs/__tests__/cmd-map-codebase-jj.test.ts
  modified: []
decisions:
  - "Log assertions query ancestry (maxCount:10, allRefs:true) not head (maxCount:1): jj squash-based commit lands message on @-, not @; pattern carried from cmd-discuss-phase-jj.test.ts."
  - "beforeEach/afterEach lifecycle over beforeAll/afterAll: brownfield tests are mutation-heavy; per-test fresh skeleton is the only correctness path."
  - "synth-planning-fixture.ts re-exports initJjColocated so cmd-import-jj.test.ts can spin up a bare jj-colocated tmpdir WITHOUT the skeleton (empty-fresh-import path)."
metrics:
  duration: ~8m
  completed_date: 2026-05-14
requirements:
  - CMD-10
  - BROWN-01-deferred (re-asserted; remains in Phase 6 per 05-01)
  - BROWN-02-deferred (re-asserted; remains in Phase 6 per 05-01)
---

# Phase 5 Plan 04: Brownfield Command Integration Tests (D-34 synth fixtures)

Five CMD-10 brownfield integration tests landed against synthetic jj-colocated fixtures, plus a shared `synth-planning-fixture.ts` factory that seeds a minimum 12-file `.planning/` skeleton onto a fresh `jj git init --colocate` tmpdir.

## What landed

### `synth-planning-fixture.ts` (Task 1)

Public factory `synthPlanningFixture(kind: 'jj-colocated' | 'jj-native' = 'jj-colocated'): { dir, vcs, cleanup }`. Internally wraps `vcs-fixture.ts:42-59` `initJjRepo()` and layers the 12-file skeleton:

- 5 top-level `.planning/` files: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` (with `stopped_at: Phase 02-bar plan 02-01 (in-progress)` frontmatter), `config.json` (`{ "vcs": { "adapter": "jj" } }`).
- 5 per-phase files: 01-foo complete (CONTEXT/PLAN/SUMMARY) + 02-bar in-progress (CONTEXT + 02-01-PLAN with no SUMMARY).
- 1 source placeholder: `src/example.ts`.

Factory tmpdir prefix is `gsd-synth-jj-colo-` (or `gsd-synth-jj-native-`); cleanup uses `rmSync(dir, {recursive:true, force:true})` wrapped in try/catch so a missing tmpdir does not throw on teardown. The factory does NOT commit the seed — brownfield commands inspect working-tree state.

A companion `synth-planning-fixture.test.ts` (5 sanity tests, all green under jj 0.41) verifies: dir exists; both `.jj` and `.git` present in colocated mode; STATE.md carries the `stopped_at` marker; vcs.refs.head resolves; cleanup deletes the tmpdir; `jj-native` mode yields a non-colocated repo.

### Per-test description (Task 2)

| File | Sub-command | Tests | What it asserts |
|------|-------------|-------|------------------|
| `cmd-resume-work-jj.test.ts` | `/gsd-resume-work` | 3 | Reads STATE.md `stopped_at` from the synth fixture; vcs.log succeeds on the fresh jj repo; structural prerequisite that `.planning/phases/02-bar/02-01-PLAN.md` exists AND `02-01-SUMMARY.md` does NOT exist (the in-progress marker the workflow detects). |
| `cmd-pause-work-jj.test.ts` | `/gsd-pause-work` | 3 | Mutates `.planning/STATE.md` and commits via `vcs.commit({files:[…STATE.md]})` (exitCode 0); subject `'chore: pause work'` appears in ancestry chain; pre-commit hook fires during the commit (proves the D-32 colocated fire from plan 05-01 reaches CMD-10). |
| `cmd-import-jj.test.ts` | `/gsd-import` | 2 | Uses a local `initEmptyJjColocated` (NOT the synth fixture) for the empty-fresh-import path; writes the four top-level `.planning/` files; commits via `vcs.commit({files:[…4 files]})`; subject `'chore: import project from inputs'` appears in ancestry chain. |
| `cmd-ingest-docs-jj.test.ts` | `/gsd-ingest-docs` | 2 | On the synth fixture, writes a synthetic `docs/foo.md`; simulates the workflow by writing `.planning/research/ARCHITECTURE.md` + `.planning/research/FEATURES.md`; commits via `vcs.commit({files:[…research]})`; subject `'docs: ingest external docs'` appears in ancestry chain. |
| `cmd-map-codebase-jj.test.ts` | `/gsd-map-codebase` | 3 | On the synth fixture (which has `src/example.ts`), simulates the workflow by writing `.planning/codebase/STACK.md` + `.planning/codebase/STRUCTURE.md`; commits via `vcs.commit({files:[…codebase]})`; subject `'docs: map codebase'` appears in ancestry chain; structural-sanity test verifies STACK.md mentions `src/example.ts` (test writes the STACK.md content directly — explicitly labelled the D-34 gap). |

All five files are gated on `jj --version` availability (`describe.skipIf(!jjAvailable)`); 13/13 tests pass under jj 0.41.0 colocated mode in 5.97s.

## D-34 coverage gap (verbatim — required by 05-CONTEXT.md and acceptance criteria)

> Brownfield commands exercised against synthetic jj fixtures only; full dogfood validation occurs in Phase 6 once the sticky-adapter flip + `.planning/` SHA → change_id rewriter exist.

This gap is explicit in each test file's header comment (and re-stated in the `cmd-map-codebase-jj.test.ts` Test 3 in-body comment, which is the clearest illustrative case: the test writes the STACK.md content itself, so it cannot prove the real workflow scanned `src/example.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] vcs.log({maxCount:1}) assertions returned empty subject**

- **Found during:** Task 2 initial test run (4/13 tests failed)
- **Issue:** `vcs.log({maxCount:1}).[0].subject` returned `''`, not the commit message. On jj, `vcs.commit()` routes through `jj squash -B @ -k -m`, which lands the message on `@-` (the parent of the working copy). The fresh working-copy commit `@` is born empty after squash and has no description, so it shows first in the head-only log query.
- **Fix:** Switched all four log-subject assertions to query the ancestry chain via `vcs.log({maxCount:10, allRefs:true})`, then join the subjects and assert `toContain(...)`. Pattern lifted from `cmd-discuss-phase-jj.test.ts:73-76` (the existing precedent for jj squash-based commit assertions).
- **Files modified:** `cmd-pause-work-jj.test.ts`, `cmd-import-jj.test.ts`, `cmd-ingest-docs-jj.test.ts`, `cmd-map-codebase-jj.test.ts` (all in the same Task 2 commit `kqymlrlqlwlvqmlvnnyypxlkuxqxnxsy`).
- **Why not Rule 4 architectural:** This is the documented squash-based-commit shape (Phase 3 plan 03-04 / SQUASH-01..07). The fix uses an existing in-repo pattern; no new types or adapter verbs were needed.

### Other deviations

None. Plan was executed as written aside from the squash-aware log assertion fix above.

## Hand-off to plan 05-05

Plan 05-05 (CI hardening) inherits the unique-per-file tmpdir-prefix pattern these tests use:

- `synth-planning-fixture.ts` uses `gsd-synth-jj-colo-` and `gsd-synth-jj-native-` prefixes.
- `cmd-import-jj.test.ts` uses `gsd-cmd-import-jj-`.
- The four synth-fixture-consumer CMD tests (`resume-work`, `pause-work`, `ingest-docs`, `map-codebase`) share the synth-fixture prefix; tests are mutation-heavy but each test gets its own tmpdir via `beforeEach`, so no cross-test contention exists at the prefix level.

The flake-fix approach is therefore proven at construction time before plan 05-05 begins; 05-05 can focus on the CI matrix wiring rather than re-litigating prefix uniqueness.

## BROWN-01 / BROWN-02 status

Per plan 05-01's deferral edits (D-31), BROWN-01 (`/gsd-map-codebase` on jj) and BROWN-02 (`/gsd-import` on jj) remain Phase 6 requirements and are NOT shipped as Phase 5 deliverables. This plan does not touch their `ROADMAP.md` / `REQUIREMENTS.md` status. The five integration tests landed here prove the *commands* work on jj synthetic fixtures (CMD-10); the *dogfood-on-this-repo* validation that BROWN-01/02 require waits on the Phase 6 sticky-adapter flip and the `.planning/` SHA → change_id rewriter.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes were introduced beyond test-only tmpdir fixtures (already covered by T-05.04-02 in the plan's threat model).

## Known Stubs

None. The synth fixture seeds literal placeholder content (`MOCK-01 ...`, `# Plan 01`, etc.) which is the deliberate test fixture, not a production stub. Brownfield commands inspect this fixture's working-tree state; no UI surfaces consume it.

## Self-Check: PASSED

- Files created and present on disk: synth-planning-fixture.ts ✓, synth-planning-fixture.test.ts ✓, cmd-resume-work-jj.test.ts ✓, cmd-pause-work-jj.test.ts ✓, cmd-import-jj.test.ts ✓, cmd-ingest-docs-jj.test.ts ✓, cmd-map-codebase-jj.test.ts ✓
- Task 1 commit `lmyoxtxlmxzvxwummzywoytxxylykvtx` (`feat(05-04): add synth-planning-fixture for CMD-10 brownfield tests`) ✓
- Task 2 commit `kqymlrlqlwlvqmlvnnyypxlkuxqxnxsy` (`test(05-04): add 5 CMD-10 brownfield integration tests on jj (D-34 synth)`) ✓
- TS check (`pnpm tsc --noEmit`): zero errors ✓
- Combined vitest run (5 brownfield files + sanity): 13/13 + 5/5 pass under jj 0.41.0 ✓
