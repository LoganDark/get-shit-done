---
phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
plan: 03
subsystem: vcs
tags: [vcs, migration, slash-command, sdk-verb, init-handler, greenfield-gate, envelope-cr01]

requires:
  - phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
    plan: 01
    provides: has_jj peer signal on init handlers; atomicWriteConfig export; expr factories
  - phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
    plan: 02
    provides: runMigration orchestrator + MIGRATION_COMMIT_MARKER + MigrationResult/Orphan/RunMigrationOpts types
provides:
  - /gsd-migrate-vcs slash command (filesystem auto-discovery via workflow markdown)
  - migrateVcsQuery SDK verb (gsd-sdk query migrate-vcs) — argv parser + current-state-aware default + pre-flight gates + dispatch
  - initMigrateVcs SDK init handler (gsd-sdk query init.migrate-vcs) — 8-field pre-flight probe data
  - new-project.md greenfield VCS gate (5-row branching table replacing silent `git init`)
  - black-box envelope-contract integration test against the built bin/gsd-sdk.js (CR-01 invariant on the migrate-vcs path)
affects:
  - 06-04-PLAN.md (BROWN-01 dogfood consumes the integrated stack: workflow markdown + SDK verb + binary envelope contract)

tech-stack:
  added: []
  patterns:
    - "11-shim canonical handler shape (sdk/src/query/restore.ts analog) reused for migrate-vcs.ts: argv-for-loop parse + --cwd/--target/--workstream/--native/--force + typed-error envelope + dispatch to backend library"
    - "Current-state-aware default targeting (CONTEXT D-03): bare command derives --target from config.json's vcs.adapter — git/absent/auto → jj; jj → typed-error refusal demanding explicit --target git"
    - "init.* handler 8-field shape for migrate-vcs pre-flight: has_git, has_jj, current_adapter, jj_available, dirty, conflicts, project_path, commit_docs (peer to initIngestDocs)"
    - "Greenfield gate table-replacement pattern: replace `**If <bool> is false:** ...` markdown with a 5-row decision table whose columns are the pre-flight probe fields"
    - "Black-box integration test pattern: spawnSync against the built bin/gsd-sdk.js with synthPlanningFixture, assert on-the-wire JSON has flat envelope (no .data wrapper)"

key-files:
  created:
    - sdk/src/query/migrate-vcs.ts
    - sdk/src/query/migrate-vcs.test.ts
    - sdk/src/query/migrate-vcs.integration.test.ts
    - get-shit-done/workflows/migrate-vcs.md
  modified:
    - sdk/src/query/init.ts
    - sdk/src/query/init.test.ts
    - sdk/src/query/command-static-catalog-foundation.ts
    - sdk/src/query/command-manifest.non-family.ts
    - sdk/src/query/command-manifest.init.ts
    - sdk/src/query/command-family-handlers.ts
    - sdk/src/query/command-aliases.generated.ts
    - get-shit-done/bin/lib/command-aliases.generated.cjs
    - get-shit-done/workflows/new-project.md

key-decisions:
  - "`command-family-handlers.ts` is the load-bearing init-handler registration site, NOT just `command-manifest.init.ts` — the manifest declares the alias surface; the family handlers map binds canonical name → QueryHandler. Both files MUST be updated. The Phase 5 11-shim adds were single-file because non-family verbs only need catalog + manifest."
  - "Regenerated `command-aliases.generated.{ts,cjs}` via `npx tsx sdk/scripts/gen-command-aliases.ts` rather than hand-editing. The generator picked up both the non-family `migrate-vcs` entry (subcommand:'migrate-vcs', mutation:true) and the init `init.migrate-vcs` entry (subcommand:'migrate-vcs', mutation:false). Both files are committed in lockstep with the manifest sources."
  - "initMigrateVcs probes working-tree state via `vcs.status()` / `vcs.findConflicts({scope:'all'})` rather than raw git/jj invocations — preserves the no-raw-git invariant. `findConflicts` is wrapped in try/catch because not all backends support it cleanly on every path; failures degrade to `conflicts:false` rather than aborting the pre-flight."
  - "Integration test exit-code on refusal envelopes: ok:false carries exit-code 0 (not non-zero). The query-dispatch layer treats handler-returned `{ok:false, error}` as a successful dispatch with a typed envelope, NOT as a process error. This matches the established 11-shim pattern (restore.test.ts proves this on git side); the integration test asserts `status === 0` and inspects `parsed.ok` instead."
  - "The integration test creates a fresh synthPlanningFixture in beforeEach (not beforeAll) so each `it` runs on a clean jj-colocated tmpdir — the first migrate-vcs call mutates state (commits, flips config) and would poison subsequent cases. Cleanup happens at the end of each `it` plus a defensive afterAll for failure paths."

requirements-completed:
  - PHASE6-MIGRATE-CMD
  - PHASE6-GREENFIELD-GATE
  - PHASE6-EMPTY-DIR-REFUSAL
  - PHASE6-INIT-MIGRATE-VCS

duration: ~8m
completed: 2026-05-14
---

# Phase 06 Plan 03: /gsd-migrate-vcs Command + Greenfield Gate + Envelope Contract Test Summary

**`/gsd-migrate-vcs --target <jj|git>` is now invokable end-to-end: filesystem-auto-discovered workflow markdown calls the new `gsd-sdk query migrate-vcs` SDK verb (canonical 11-shim shape) which dispatches to `runMigration` from plan 06-02; pre-flight data flows through `gsd-sdk query init.migrate-vcs` (8-field probe shape); current-state-aware defaults route bare invocations correctly in both directions; `new-project.md`'s silent `git init` fallback is replaced with the 5-row greenfield VCS gate table per ROADMAP SC #1 + #7; a 5-case black-box integration test against the built `bin/gsd-sdk.js` proves the CR-01 flat-envelope invariant on the migrate-vcs path; plan 06-04 BROWN-01 dogfood can consume the integrated stack.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files modified:** 13 (4 created + 9 modified incl. 2 generated)
- **Tests added:** 17 (12 unit + 5 integration); plus 8 new init.test.ts cases under the `initMigrateVcs` / `initIngestDocs has_jj` describes
- **Lines of code:** ~480 source + ~310 test + ~155 workflow markdown + 17-line table-replacement in new-project.md

## Accomplishments

- `gsd-sdk query migrate-vcs --target <T> [--native] [--force]` is a first-class verb. Argv parser rejects unknown `--target` values with `{ok:false, error: "migrate-vcs: invalid --target '<X>' (valid: jj, git)"}` (RESEARCH §Security V5 mitigation for T-06-03-01).
- Bare `gsd-sdk query migrate-vcs` (no `--target`) derives the default via current-state-aware logic per CONTEXT D-03: `vcs.adapter` is `'git'` / `'absent'` / `'auto'` → defaults to `--target jj`; `'jj'` → typed-error refusal demanding explicit `--target git`.
- `--target jj` aborts with a friendly `install jj first` message when the `jj` binary is missing from PATH (RESEARCH §CLI Surface).
- Same-direction migration (e.g. `--target git` when adapter already on git) refuses with `already on git` typed error.
- `initMigrateVcs` returns the documented 8-field shape: `has_git`, `has_jj`, `current_adapter` (`'git'|'jj'|'auto'|'absent'`), `jj_available`, `dirty`, `conflicts`, `project_path`, `commit_docs`. Working-copy state probed via the VcsAdapter (`vcs.status()` + `vcs.findConflicts({scope:'all'})`) — preserves no-raw-git invariant.
- `/gsd-migrate-vcs` slash command is discoverable: workflow markdown at `get-shit-done/workflows/migrate-vcs.md` with the documented 5-step process (banner → parse_arguments → preflight → run_migration → summary), 8-item success_criteria checklist, and 3 backend-shift callouts (colocated-vs-native, round-trip-after-rebase, A3 hook gap).
- `get-shit-done/workflows/new-project.md` lines 108-112 (the silent `git init` fallback) are replaced with the 5-row greenfield VCS gate table per ROADMAP SC #1 + SC #7 + CONTEXT D-02. Empty-dir invocation without `--jj` or `--git` now ERRORS with the exact "Empty directory — pass `--git` or `--jj`" message.
- Black-box integration test against the built `bin/gsd-sdk.js` (mirrors `gsd-sdk-binary-shape.integration.test.ts` from Phase 5 plan 05-06): 5 cases asserting `parsed.ok` / `parsed.migrated` / `parsed.newAdapter` / `parsed.commitHash` at top level and `parsed.data` UNDEFINED (CR-01 invariant); migration commit subject contains `[gsd-migrate-vcs v1]` (atomic-commit + marker invariant from plan 06-02 propagates through the SDK boundary); current-state-aware default fires on absent config; refusal envelopes have `ok:false` + the right error message.
- `lint-vcs-no-raw-git.cjs` exits 0 on 981 files — no new raw-git invocations.

## Task Commits

Each task was committed atomically:

1. **Task 1: SDK verb handler + initMigrateVcs + catalog/manifest registration + unit tests** — `9385f5e4` (feat)
2. **Task 2: Workflow markdown + new-project.md greenfield gate + black-box integration test** — `9c2ab23c` (feat)

## Files Created/Modified

**Created (4):**
- `sdk/src/query/migrate-vcs.ts` — SDK verb handler (~130 lines)
- `sdk/src/query/migrate-vcs.test.ts` — 12 unit cases against mocked runMigration / readFile / execSync
- `sdk/src/query/migrate-vcs.integration.test.ts` — 5 black-box envelope-contract cases against the built `bin/gsd-sdk.js`
- `get-shit-done/workflows/migrate-vcs.md` — Slash command surface (~155 lines)

**Modified (9):**
- `sdk/src/query/init.ts` — Appended `initMigrateVcs` handler (~70 lines including JSDoc); added `execSync` to the imports list
- `sdk/src/query/init.test.ts` — Added 8 new cases (7 under the new `initMigrateVcs` describe + 1 `has_jj` peer-field assertion on `initIngestDocs`)
- `sdk/src/query/command-static-catalog-foundation.ts` — `migrateVcsQuery` import + `['migrate-vcs', migrateVcsQuery]` registration tuple in `MUTATION_SURFACES_STATIC_CATALOG`
- `sdk/src/query/command-manifest.non-family.ts` — `{canonical:'migrate-vcs', mutation:true, outputMode:'json'}` entry
- `sdk/src/query/command-manifest.init.ts` — `{family:'init', canonical:'init.migrate-vcs', ...}` entry
- `sdk/src/query/command-family-handlers.ts` — `initMigrateVcs` import + `'init.migrate-vcs': initMigrateVcs` mapping in `FAMILY_HANDLERS.init`
- `sdk/src/query/command-aliases.generated.ts` — Regenerated via `sdk/scripts/gen-command-aliases.ts`; picks up both the init.migrate-vcs alias and the migrate-vcs non-family alias
- `get-shit-done/bin/lib/command-aliases.generated.cjs` — CJS sibling regenerated in lockstep
- `get-shit-done/workflows/new-project.md` — Lines 108-112 (silent `git init` block) replaced with the 5-row greenfield VCS gate table

## command-manifest.init.ts Registration Shape Used

The init manifest entry mirrors `init.ingest-docs` exactly:

```typescript
{ family: 'init', canonical: 'init.migrate-vcs', aliases: ['init migrate-vcs'], mutation: false, outputMode: 'json' },
```

The corresponding handler registration in `command-family-handlers.ts` is:

```typescript
init: {
  // ... existing init.* entries ...
  'init.remove-workspace': initRemoveWorkspace,
  // Phase 6 plan 06-03: pre-flight probe for /gsd-migrate-vcs.
  'init.migrate-vcs': initMigrateVcs,
},
```

The plan asked the executor to audit the file because it suspected the analog might differ slightly from the non-family manifest. In practice it does NOT differ — same `{family, canonical, aliases, mutation, outputMode}` shape; the only Phase 5 11-shim asymmetry was that those verbs are non-family and only the non-family manifest entry was needed. Init handlers require BOTH the manifest entry (alias surface) AND the family-handlers map (canonical → handler binding).

## Integration Test Results

5 cases pass against the built `bin/gsd-sdk.js` invoked via `spawnSync`:

```
✓ CR-01 invariant: envelope is flat (parsed.ok / parsed.migrated / parsed.newAdapter at top level)  688ms
✓ atomic-commit invariant: migration commit subject contains [gsd-migrate-vcs v1] marker  728ms
✓ current-state-aware default: bare command on absent config defaults to --target jj  681ms
✓ refuses bare command when current adapter is jj  339ms
✓ refuses unknown --target with typed error  324ms

Test Files  1 passed (1)
Tests       5 passed (5)
Duration    2.99s
```

`jj --version` at execution time:

```
jj 0.41.0-cfdadb380babf004a3c0f1f0177335756011b3a1-b3506b213cbf53c2298f710d32cb8eb358f1592a-76bbc6fca7d4a30646004c9179e367ec220c5194-a83b55d79bfad0dd003ac92d9df6f41ff888e2a8
```

The integration test is gated behind `describe.skipIf(!JJ_AVAILABLE)` — CI lanes without jj installed simply skip rather than fail. The marker-probe assertion uses `jj log -r '@-' -T description --no-graph` directly (not via the adapter) because `@-` is jj's idiomatic parent reference and the migration commit lands there via the squash model.

## Workflow Markdown Preflight Path

The `<step name="preflight">` block calls `gsd-sdk query init.migrate-vcs` exactly as PATTERNS suggested. The 8-field response is parsed via `jq -r` (matches Phase 5 plan 05-02..05-04 workflow markdown rewrite style) and feeds the refusal cases (dirty / conflicts / jj-missing / already-on-jj-no-explicit-flag). The PATTERNS analog was correct — no alternative invocation path was needed.

## Decisions Made

(See frontmatter `key-decisions` for the load-bearing decisions. Inline expansions:)

- **Two-site init-handler registration:** The Phase 5 11-shim block in `command-static-catalog-foundation.ts` is the registration surface for non-family verbs. Init handlers have a DIFFERENT registration boundary: `command-family-handlers.ts:FAMILY_HANDLERS.init`. The manifest entry alone is not enough — without the family-handlers map binding, the dispatcher cannot route `init.migrate-vcs` to `initMigrateVcs`. Caught this during the first build because the generated alias file had the entry but the runtime dispatch would have 404'd.

- **Regenerated alias artifacts in lockstep:** Ran `npx tsx sdk/scripts/gen-command-aliases.ts` after editing both manifests. The generator emits both `sdk/src/query/command-aliases.generated.ts` (ESM) AND `get-shit-done/bin/lib/command-aliases.generated.cjs` (CJS) — both are committed in Task 1 alongside the manifest edits. `check-command-aliases-fresh.mjs` would have flagged drift if I had hand-edited only one side.

- **Conflict-probe wrapping:** `vcs.findConflicts({scope:'all'})` is wrapped in a nested try/catch inside `initMigrateVcs`. Some adapter implementations (specifically the git backend per Phase 1 RESEARCH Open Q1) return `[]` for the `all`-scope variant, but a defensive catch keeps the handler resilient against future adapter shape drift. Failures degrade to `conflicts:false`.

- **Integration test fixture isolation:** Each `it(...)` creates a fresh `synthPlanningFixture('jj-colocated')` in `beforeEach`. The first migrate-vcs call mutates the fixture's state (lands a real jj commit, flips config). Subsequent cases need a clean slate, so `beforeAll`-shared-fixture would have coupled them. The trade-off is ~700ms × 5 = ~3.5s total runtime, well under the 120s integration timeout.

- **Refusal envelopes carry exit-code 0:** Verified empirically that the SDK's query dispatch treats handler-returned `{ok:false, error}` as a successful dispatch (envelope conveys the error) rather than mapping it to a non-zero process exit. The integration test asserts `status === 0` for ALL cases including refusals; only `parsed.ok` discriminates success vs typed error. This matches the established 11-shim pattern (restore returns ok:false on validateRefname failure with status=0).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Init handler registration site beyond just command-manifest.init.ts**
- **Found during:** Task 1 (initial registration of init.migrate-vcs)
- **Issue:** The plan's `<action>` block instructed editing only `command-manifest.init.ts` for the init.migrate-vcs registration. After the manifest edit, the verb was discoverable as an alias but the dispatcher would not have a handler binding — `command-family-handlers.ts:FAMILY_HANDLERS.init` is the canonical-name → `QueryHandler` map. The plan's PATTERNS reference at lines 156-157 mentioned "find the analogous registration site" but didn't name the second file.
- **Fix:** Edited `command-family-handlers.ts` to import `initMigrateVcs` from `./init.js` and add `'init.migrate-vcs': initMigrateVcs` to the `init:` subobject. The fix is mechanical (mirrors every other init.* handler) and necessary for the handler to be reachable at runtime.
- **Verification:** Integration test cases that depend on init.migrate-vcs (the workflow markdown's preflight step) would fail without the binding; the test that exercises the migrate-vcs verb directly doesn't depend on it but it's still required for the slash-command flow.
- **Committed in:** `9385f5e4` (Task 1) — added alongside the catalog/manifest edits.

**2. [Rule 3 - Blocking] command-aliases.generated.ts + .cjs drift after manifest edits**
- **Found during:** Task 1 (post-edit `git status`)
- **Issue:** Editing the manifest source files (`command-manifest.init.ts`, `command-manifest.non-family.ts`) does NOT auto-regenerate the alias files. Running tests would still pass (the generated files are checked in as static source), but `check:alias-drift` would catch the drift in CI. The plan didn't mention regeneration.
- **Fix:** Ran `npx tsx sdk/scripts/gen-command-aliases.ts` from the SDK directory. The generator wrote both the TS and CJS variants. Diff confirmed both files now contain the migrate-vcs / init.migrate-vcs entries.
- **Verification:** `git diff sdk/src/query/command-aliases.generated.ts get-shit-done/bin/lib/command-aliases.generated.cjs` showed exactly the new entries, no other drift.
- **Committed in:** `9385f5e4` (Task 1) — both generated files in the same commit as the manifest sources.

### Plan-author Documentation Drift (no auto-fix applied)

**3. [Plan-error documented] Unit test count claim**
- **Issue:** The plan's `<action>` block for Task 1, file 6, listed 10 required unit-test cases. The final implementation has 12 — added 2 extra cases mid-implementation that emerged naturally:
  - "honours --cwd over projectDir" (covers the precedence rule)
  - "surfaces runMigration errors as typed envelope" (covers the catch-block in migrateVcsQuery)
- **Assessment:** Not a defect — the plan's `<done>` block says "All 10 unit-test cases in `migrate-vcs.test.ts` pass" which is a lower bound; 12 ≥ 10. Documenting for traceability.

**4. [Plan-error documented] integration test name pattern**
- **Issue:** The plan instructs `sdk/src/query/migrate-vcs.integration.test.ts` (which is what landed). The plan's verify block uses `pnpm test --filter migrate-vcs.integration.test.ts` which doesn't match the vitest project structure — vitest projects use `--project integration` (not `--filter`). The correct invocation is `pnpm test:integration src/query/migrate-vcs.integration.test.ts`.
- **Assessment:** The test runs correctly and passes 5/5; only the verify-command syntax in the plan was off. Documented for the next reader.

---

**Total deviations:** 2 Rule-3 blocking fixes (init-handler registration site + alias regeneration) + 2 documented plan-author drifts (no fix applied).

**Impact on plan:** Both auto-fixes were necessary for correctness — without the family-handlers binding the init.migrate-vcs handler would be unreachable; without alias regeneration the CI drift check would have failed. No scope creep; both fixes are mechanical and surface-area-preserving.

## Issues Encountered

None beyond the deviations documented above. Integration tests pass on first verified run against jj 0.41; lint-vcs-no-raw-git reports 0 violations on 981 files.

## User Setup Required

None — no external service configuration introduced by this plan.

## Format-Migration Tracker (CONTEXT D-19)

**Net-new-surfaces line: this plan introduces ZERO new `.planning/` revision-id-encoding formats.** The runtime-emitted `.planning/intel/06-migration-report.md` was already added by plan 06-02 (its self-exclusion semantics are documented in 06-02-SUMMARY.md). This plan's SDK verb is a thin wrapper around `runMigration` — no new persisted artifacts beyond what 06-02 already tracks.

## Plan 06-04 Readiness

- **SDK verb works:** `gsd-sdk query migrate-vcs --target jj --force --cwd <dir>` exits 0 with flat envelope `{ok:true, migrated:true, newAdapter:'jj', commitHash:'...', orphans:{...}}` against a synth jj-colocated fixture. Round-trip and idempotency invariants from plan 06-02 propagate through the SDK boundary (integration test confirms).
- **Workflow markdown is in place:** `/gsd-migrate-vcs` is filesystem-auto-discovered; the workflow markdown's 5-step process dispatches through `gsd-sdk query init.migrate-vcs` (pre-flight) → `gsd-sdk query migrate-vcs` (run) per RESEARCH §"Migration Command Workflow Markdown Shape".
- **Integration test confirms the binary contract:** 5 cases asserting the CR-01 envelope invariant, marker-on-HEAD invariant, current-state-aware defaults, and typed-error refusals. Plan 06-04's BROWN-01 dogfood validation can rely on these invariants.
- **No blockers introduced.** Phase 4 LEARNINGS Open Q1 (A3 colocated pre-commit gap) is partially closed for the migration commit itself via `runMigration`'s explicit `fireHook('pre-commit')` — the broader gap remains documented as future work.

## Self-Check: PASSED

Verified all claims:

**Created files exist:**
- `sdk/src/query/migrate-vcs.ts` ✓
- `sdk/src/query/migrate-vcs.test.ts` ✓
- `sdk/src/query/migrate-vcs.integration.test.ts` ✓
- `get-shit-done/workflows/migrate-vcs.md` ✓

**Commits exist:**
- `9385f5e4` (Task 1 SDK verb + init handler + catalog/manifest) ✓
- `9c2ab23c` (Task 2 workflow markdown + new-project.md + integration test) ✓

**Verification gates from plan Tasks 1 & 2:**
- `grep 'migrate-vcs' sdk/src/query/command-static-catalog-foundation.ts` → 2 hits (import + tuple); plus an inline comment ✓
- `grep 'migrate-vcs' sdk/src/query/command-manifest.non-family.ts` → 1 hit (entry); plus an inline comment ✓
- `grep 'migrate-vcs' sdk/src/query/command-manifest.init.ts` → 2 hits (entry + alias) ✓
- `ls get-shit-done/workflows/migrate-vcs.md` exists ✓
- `grep 'Empty directory' get-shit-done/workflows/new-project.md` → 1 hit ✓
- `grep 'gsd-sdk query migrate-vcs' get-shit-done/workflows/migrate-vcs.md` → 2 hits ✓
- `pnpm test src/query/migrate-vcs.test.ts` → 12/12 pass ✓
- `pnpm test src/query/init.test.ts` → 45/45 pass (38 prior + 7 new) ✓
- `pnpm test:integration src/query/migrate-vcs.integration.test.ts` → 5/5 pass ✓
- `cd sdk && pnpm build` → exits 0 ✓
- `node scripts/lint-vcs-no-raw-git.cjs` → 0 violations on 981 files ✓

---
*Phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha*
*Completed: 2026-05-14*
