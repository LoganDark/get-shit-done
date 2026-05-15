---
phase: 08-unified-revision-model-audit-test-prep-flip-lint-guard-close
plan: 01
subsystem: infra
tags: [audit, lint, jj, ndjson, allowlist, regex, node-test, vcs]

# Dependency graph
requires:
  - phase: 02.1
    provides: existing lint-vcs-no-raw-git.cjs structural template + allowlist schema being migrated
  - phase: 06
    provides: jj 0.41 colocated runtime backend serving as probe target
provides:
  - scripts/audit-id-namespace.cjs (pure regex+walker; emits .md or --json)
  - scripts/lint-vcs-no-commit-id.cjs (default-deny scanner, NOT yet CI-wired)
  - scripts/lib/allowlist-parser.cjs + scripts/lib/glob-to-regex.cjs (shared modules; both lints consume)
  - .planning/intel/id-namespace-audit.{md,json} (101 findings, all 7 verdict buckets populated; boundary-io=2)
  - .planning/intel/jj-041-ndjson-probe.md (Risk 4 GREEN baseline)
  - migrated per-entry schema for lint-vcs-no-raw-git.allow.json (23 entries; D-03 + D-04)
affects:
  - Plan 2 (FLIP) — audit JSON `verdicts['boundary-io']` is the literal seed for Plan 3 lint allowlist; jj-041-ndjson-probe artifact cited at FLIP-01 sites
  - Plan 3 (close-gate) — wires lint-vcs-no-commit-id.cjs into CI; first green run is the FLIP completion proof

# Tech tracking
tech-stack:
  added: []
  patterns:
    - shared scripts/lib/ module pattern (parser + glob compiler extracted from one-off lint into reusable modules)
    - per-entry allowlist schema { path|glob, reason, owner } with required-field enforcement (D-03 + D-04)
    - audit-emit-JSON-sidecar pattern (D-01): same script produces both human-readable .md and machine-readable .json for downstream automated consumption

key-files:
  created:
    - scripts/audit-id-namespace.cjs
    - scripts/lint-vcs-no-commit-id.cjs
    - scripts/lint-vcs-no-commit-id.allow.json
    - scripts/lib/allowlist-parser.cjs
    - scripts/lib/glob-to-regex.cjs
    - tests/scripts/audit-id-namespace.test.cjs
    - tests/scripts/allowlist-parser.test.cjs
    - .planning/intel/id-namespace-audit.md
    - .planning/intel/id-namespace-audit.json
    - .planning/intel/jj-041-ndjson-probe.md
  modified:
    - scripts/lint-vcs-no-raw-git.cjs (now consumes shared parser; inline globToRegExp deleted)
    - scripts/lint-vcs-no-raw-git.allow.json (migrated to per-entry schema; 23 entries)

key-decisions:
  - "D-01 verified: JSON sidecar IS the literal seed for Plan 3 lint allowlist (single source of truth; no transcription drift)"
  - "D-04 verified: expires field is NOT validated by the shared parser; zero expires-bearing entries across both allowlists"
  - "Plan 2 split NOT recommended: 73 mechanical compile-driven rewrites are atomic"
  - "Plan 3 split RECOMMENDED: 14 workflow/agent .md sites exceed the 8-row threshold per RESEARCH §Plan Splitting"
  - "boundary-io count = 2 (both in jj-id.ts reverse-resolve helper) — small enough that LINT-03 conditional does NOT fire (no new jj-internal.ts module needed)"
  - "jj 0.41 NDJSON probe VERIFIED GREEN: change_id is top-level on `jj log -T 'json(self)'`; nested under target on workspace list — Plan 2 NDJSON parser flips are single-line read swaps"

patterns-established:
  - "Pattern A (shared lib): single-script utilities extracted to scripts/lib/ when two consumers exist (D-03)"
  - "Pattern B (audit + sidecar): one script emits BOTH human .md AND machine .json so downstream consumers never transcribe (D-01)"
  - "Pattern C (per-entry allowlist with reason+owner): replaces top-level files+globs+$comment batch documentation; row-level rationale survives schema migrations"

requirements-completed: [AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, LINT-01, LINT-02]

# Metrics
duration: ~30min
completed: 2026-05-15
---

# Phase 8 Plan 1: Audit Precondition + Lint Script Development Summary

**Audit script emits .md + JSON sidecar (D-01 single-source-of-truth) classifying 101 commit_id-reachable sites into 7 closed verdict buckets, plus the lint-vcs-no-commit-id scanner with shared per-entry allowlist parser (D-03/D-04 — expires dropped) — all gated for Plan 2's FLIP**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-15T05:24:30Z (orchestrator's planning-complete handoff)
- **Completed:** 2026-05-15T05:40:00Z
- **Tasks:** 6 / 6 (all autonomous; no checkpoints)
- **Files created:** 10
- **Files modified:** 2

## Accomplishments

- **Audit script + sidecar:** `scripts/audit-id-namespace.cjs` walks 7 scan roots, applies 8 PATTERNS, emits markdown verdict-table (default) or structured JSON (`--json`). All 7 verdict buckets present in JSON even when empty. 101 findings emitted on the current repo.
- **Verdict classification:** All 101 audit rows classified into the closed `AUDIT_VERDICT` enum: safe=13, flip-clean=30, needs-rename=43, needs-resolveShort=7, boundary-io=2, historical-prose=6, unclear=0. Below the 10-row unclear threshold; below the 5-row boundary-io threshold (LINT-03 does NOT fire).
- **Shared lib modules:** `scripts/lib/allowlist-parser.cjs` + `scripts/lib/glob-to-regex.cjs` extracted; per-entry schema enforces `{ path|glob, reason, owner }` with `expires` explicitly NOT validated (D-04 solo-dev override). 16 node:test cases across both modules; 100% pass.
- **Allowlist migration:** `scripts/lint-vcs-no-raw-git.allow.json` migrated to per-entry schema (23 entries: 14 files + 9 globs); zero expires-bearing entries; `$comment_2_1_09` removal-pressure documentation preserved at top level. Migrated `lint-vcs-no-raw-git.cjs` consumes shared parser; smoke test confirms behavior preserved (0 violations on main repo, 1066 files scanned).
- **New lint script:** `scripts/lint-vcs-no-commit-id.cjs` clones structural template; 5 COMMIT_ID_PATTERNS; SCAN_EXT narrowed to .cjs/.js/.mjs/.ts; `vcs-lint:allow-commit-id-here` annotation form. Allowlist seeded with 1 entry covering `sdk/src/vcs/parse/jj-id.ts` (the legitimate jj-internal reverse-resolve helper).
- **Risk 4 mitigation:** `.planning/intel/jj-041-ndjson-probe.md` records VERIFIED GREEN baseline for jj 0.41 `json(self)` template — `change_id` is top-level on `jj log`, nested under `target` on `jj workspace list`. No custom template or two-pass parse needed for Plan 2 FLIP-01.
- **CI activation deliberately deferred:** `.github/workflows/test.yml` and `package.json` deliberately NOT modified — Plan 3's job. The new lint exits 1 today (5 violation surfaces in `sdk/src/`), which becomes exit 0 once Plan 2's FLIP completes — that transition IS the FLIP completion proof.

## Task Commits

Each task was committed atomically via `gsd-sdk query commit` (which routes through the jj adapter per B-08 post-fix; the user's squash-centric model means each commit snapshots the WC and squashes into the parent change):

1. **Task 1: Build shared scripts/lib/ modules** — `wmsywpyvmkzk` (`feat`) — `scripts/lib/allowlist-parser.cjs`, `scripts/lib/glob-to-regex.cjs`, `tests/scripts/allowlist-parser.test.cjs` (9 node:test cases)
2. **Task 2: Build audit-id-namespace.cjs** — `plooyxmounkw` (`feat`) — `scripts/audit-id-namespace.cjs`, `tests/scripts/audit-id-namespace.test.cjs` (7 node:test cases)
3. **Task 3: Run audit, classify verdicts** — `qouxyzpuslqn` (`docs`) — `.planning/intel/id-namespace-audit.md`, `.planning/intel/id-namespace-audit.json` (101 findings classified; 0 unclear; Plan split decision recorded)
4. **Task 4: jj 0.41 NDJSON probe** — `twmrqsysknxn` (`docs`) — `.planning/intel/jj-041-ndjson-probe.md` (Risk 4 VERIFIED GREEN baseline)
5. **Task 5: Migrate raw-git allowlist** — `qtokvtrxzumz` (`refactor`) — `scripts/lint-vcs-no-raw-git.allow.json` (per-entry schema; 23 entries; zero expires), `scripts/lint-vcs-no-raw-git.cjs` (consumes shared parser)
6. **Task 6: Build commit-id lint** — `owxzwonopstk` (`feat`) — `scripts/lint-vcs-no-commit-id.cjs`, `scripts/lint-vcs-no-commit-id.allow.json` (seeded from audit `verdicts['boundary-io']`)

Note: commit_ids reported here are stable for the chain after each `gsd-sdk query commit` operation. The jj squash-centric model assigns a NEW commit_id on every WC snapshot, so during execution the @-pointed commit_id shifts after the next snapshot — change_ids (which are stable) anchor the actual identity. This is exactly the Plan 8 v1.2 milestone driver: the cross-backend `VcsAdapter` should expose ONE revision concept, and commit_id leakage is the defect this phase eliminates.

## Files Created/Modified

### Created (10 files)
- `scripts/audit-id-namespace.cjs` — pure-function regex+walker audit; `module.exports = { auditIdNamespace, AUDIT_VERDICT, PATTERNS, findFiles, emitMarkdown, emitJson }`
- `scripts/lint-vcs-no-commit-id.cjs` — default-deny scanner, 5 COMMIT_ID_PATTERNS, consumes shared parser
- `scripts/lint-vcs-no-commit-id.allow.json` — per-entry allowlist, 1 entry seeded from audit boundary-io
- `scripts/lib/allowlist-parser.cjs` — `parseAllowlist({ entries: [...] }, scriptName)` with required-field enforcement
- `scripts/lib/glob-to-regex.cjs` — extracted `globToRegExp` (WR-10 semantics preserved verbatim)
- `tests/scripts/allowlist-parser.test.cjs` — 9 node:test cases covering all error paths + D-04 positive case
- `tests/scripts/audit-id-namespace.test.cjs` — 7 node:test cases covering enum shape, pattern count, walker skip-dirs, JSON schema
- `.planning/intel/id-namespace-audit.md` — 151-line human-readable verdict table (101 row entries + summary + Plan split decision)
- `.planning/intel/id-namespace-audit.json` — JSON sidecar, all 7 verdict buckets populated, audit-row-N traceability
- `.planning/intel/jj-041-ndjson-probe.md` — 68-line Risk 4 GREEN baseline doc

### Modified (2 files)
- `scripts/lint-vcs-no-raw-git.cjs` — replaced inline allowlist loader + `globToRegExp` with `require('./lib/allowlist-parser.cjs')`; behavior preserved
- `scripts/lint-vcs-no-raw-git.allow.json` — full schema migration (23 entries with reason+owner; `$schema_version`=2; `$comment_2_1_09` preserved; zero expires)

## Decisions Made

The 5 user-confirmed decisions from `08-CONTEXT.md` (D-01 through D-05) all carried through unchanged. Three concrete classifications emerged during execution:

1. **`jj-id.ts` is the sole boundary-io site.** The audit found 2 rows (jj-id.ts:5 doc comment + jj-id.ts:34 template literal) — both in the `commitIdOf(changeId)` reverse-resolve helper. This count is well below the 5-row threshold for LINT-03 firing, so Plan 3 does NOT need a new `jj-internal.ts` module; the existing `jj-id.ts` IS the legitimate consumer, and the allowlist seeds with a single entry.
2. **Plan 2 stays unified.** Total findings (101) exceeds the 50-row threshold, but 73 of those are compile-driven mechanical rewrites (flip-clean=30 + needs-rename=43) and 7 are grep-replace (needs-resolveShort). With the type-rename forcing-function (`tsc --noEmit` surfaces every `LogEntry.hash` consumer as a compile error), one atomic Plan 2 sweep is feasible.
3. **Plan 3 SPLIT recommended.** 14 workflow/agent `.md` sites exceed the 8-row threshold per RESEARCH §Plan Splitting Threshold. Plan 3 splits into 3a (lint guard activation — wire CI step, ~2 sites) and 3b (PROMPT-05 sweep + MIGR-06 close-gate `.planning/` rewriter pass, 12+ sites).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Node 25 CJS resolver requires explicit `.cjs` extension**
- **Found during:** Task 1 (first `node --test tests/scripts/allowlist-parser.test.cjs` invocation)
- **Issue:** The plan's recommended require pattern `require('./lib/allowlist-parser')` (no extension) is the convention in the structural template `scripts/lint-vcs-no-raw-git.cjs` (which used `require('./lint-vcs-no-raw-git.allow.json')` — JSON resolution is auto-extended). Node 25's CJS loader does NOT auto-extend `.cjs` (only `.js`/`.json`/`.node`). Module-not-found error thrown immediately.
- **Fix:** Updated all internal CJS-to-CJS require paths to use explicit `.cjs` extension. Verified against existing in-repo conventions (`scripts/changeset/cli.cjs` uses `require('./parse.cjs')` — exact precedent). All 4 require sites updated: `scripts/lib/allowlist-parser.cjs:30` (internal to-glob-to-regex), `scripts/lint-vcs-no-raw-git.cjs:5` (parser import), `scripts/lint-vcs-no-commit-id.cjs:25` (parser import), `tests/scripts/allowlist-parser.test.cjs:5` (test import).
- **Files modified:** All 4 above.
- **Verification:** `node --test tests/scripts/allowlist-parser.test.cjs` exits 0 with all 9 tests passing.
- **Committed in:** Resolved inline in Task 1 commit `wmsywpyvmkzk` before the commit happened (no separate commit needed).

**2. [Rule 1 — Bug] Plan's literal "grep -c expires count = 1" acceptance criterion conflicts with plan's own recommended error-message template**
- **Found during:** Task 1 acceptance check
- **Issue:** The plan's Task 1 acceptance criterion states `grep -c "expires" scripts/lib/allowlist-parser.cjs` returns exactly 1 (the sole occurrence is the comment explaining `expires` is dropped). But the plan's own recommended implementation template includes the word `expires` THREE times: once in the JSDoc block (line "Per D-04: 'expires' is NOT in REQUIRED_FIELDS..."), once continuing that sentence, and once in the error message body when a required field is missing. Following the literal template would fail the acceptance check.
- **Fix:** Consolidated the JSDoc block (single sentence mentioning `expires` once at line 19) and removed the trailing `, expires is NOT required` clause from the error message body. The error still cites D-04 by name; the JSDoc still explains the field is intentionally NOT validated. Functional behavior unchanged.
- **Files modified:** `scripts/lib/allowlist-parser.cjs` (JSDoc + error message text)
- **Verification:** `grep -c "expires" scripts/lib/allowlist-parser.cjs` returns 1; all 9 tests still pass.
- **Committed in:** Resolved inline in Task 1 commit `wmsywpyvmkzk` before the commit happened.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 internal-contradiction bug)
**Impact on plan:** Both auto-fixes preserved the plan's intent; neither expanded scope. The `.cjs`-extension fix is a Node 25 compatibility issue that future plans should be aware of (recommend updating `08-PATTERNS.md` analog section to cite explicit `.cjs` extensions). The `expires`-count contradiction is purely between the plan's acceptance criterion and its own implementation template — neither violates D-04 (the parser correctly does not validate `expires`).

## Issues Encountered

- **Pre-existing working-copy changes from orchestrator:** `.planning/STATE.md` and `.planning/config.json` were already modified at executor start (orchestrator's planning-complete handoff). These were left untouched per the prompt's instruction ("the orchestrator owns those writes"). The SDK commit verb stages specific files only, so my commits did not accidentally bundle them.
- **`config.json` has a `_auto_chain_active: falsetrue` value bug** (visible in `jj diff` output of the pending changes). This is the orchestrator's concern, not Plan 1's.

## Self-Check Results

All claimed artifacts verified present and committed:
- All 10 created files exist on disk.
- All 6 task commits visible in `jj log -r '::@'` ancestry from this session's starting parent.
- Unit test count = 16; all pass (`node --test tests/scripts/audit-id-namespace.test.cjs tests/scripts/allowlist-parser.test.cjs`).
- Migrated lint still green on main: `node scripts/lint-vcs-no-raw-git.cjs` exits 0 with "1066 files scanned, 0 violations".
- New lint runs and produces violations (exit 1) — expected pre-FLIP behavior.
- Zero `expires` fields across both allowlists: `jq` confirms.
- CI activation NOT done: neither `.github/workflows/test.yml` nor `package.json` references the new lint.

## Next Phase Readiness (Plan 2 dependencies)

All Plan 2 preconditions are recorded:
- **Audit verdicts (driver for FLIP-01..03 surface flips):** 30 flip-clean + 43 needs-rename + 7 needs-resolveShort = 80 actionable sites enumerated at `.planning/intel/id-namespace-audit.md` (verdict column + Notes column for each row). Compile-driven (TypeScript `LogEntry.id` rename surfaces every consumer).
- **jj 0.41 NDJSON probe (Risk 4 mitigation):** `.planning/intel/jj-041-ndjson-probe.md` VERIFIED GREEN. Plan 2 FLIP-01 NDJSON parser sites (`jj-log.ts:26,56`, `jj-workspace-list.ts:28,46`) are single-line read swaps; no custom template needed.
- **boundary-io seed (Plan 3 lint allowlist):** 2 rows in `jj-id.ts`; already pre-seeded into `scripts/lint-vcs-no-commit-id.allow.json` so Plan 3 reads it directly. LINT-03 conditional does NOT fire.
- **Matcher prerequisite for FLIP-02/03:** Plan 2's first task should land the `toBeIdOf` custom matcher (per D-02 + D-02a) before the FLIP sweep so cross-backend test-side assertions migrate atomically. RESEARCH §Pattern 2 has the full code; PATTERNS.md cites the 3-file unit.

## Threat Flags

No new threat surface introduced beyond the threat register documented in the plan's `<threat_model>`. The 4 trust boundaries (audit script → filesystem, audit JSON sidecar → lint allowlist, lint script → JSON config, allowlist parser → consumer scripts) and the 8 STRIDE threats (T-08.01-01 through T-08.01-SC) all remain at their plan-assigned dispositions (mitigated by per-entry schema enforcement, `Object.freeze` enums, hard `SKIP_DIRS` set, audit-row-N traceability).

## Self-Check: PASSED

All 11 claimed artifacts verified present on disk; all 6 task commit_ids verified present in `jj log -r '::@'` ancestry. No missing items.

---
*Phase: 08-unified-revision-model-audit-test-prep-flip-lint-guard-close*
*Completed: 2026-05-15*
