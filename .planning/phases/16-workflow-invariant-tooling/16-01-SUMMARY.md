---
phase: 16-workflow-invariant-tooling
plan: 01
subsystem: infra
tags: [lint, workflow, ci, parallel-dispatch, allowlist, node-test]

# Dependency graph
requires:
  - phase: 13-workflow-raw-git-baseline
    provides: scripts/audit-workflow-raw-git.cjs (CF-06 fence regex source); .github/workflows/parallel-e2e.yml CI-06 step (CF-05 adjacency target)
  - phase: 08-allowlist-schema-v2
    provides: scripts/lib/allowlist-parser.cjs (CF-04 per-entry schema parser; tightened during this plan per Rule 2 deviation)
  - phase: 15-adapter-surface-extensions-rename
    provides: workspace.parallel.dispatch / workspace.parallel.fan-in literal substrings in production workflows (execute-phase.md, quick.md) — the pairing contract this lint enforces
provides:
  - LINT-06 / workflow call-presence lint enforcing FILE-level dispatch <-> fan-in pairing in bash/sh/zsh fences under get-shit-done/workflows/
  - Default-deny + per-entry-allowlist surface for workflow .md files (analog to lint-vcs-no-raw-git's role for .cjs/.ts/.sh)
  - Tightened allowlist-parser.cjs that now actively rejects the forbidden 'expires' field at the schema layer (was previously silent-ignored per Phase 8 docstring; brought into alignment with feedback_solo_dev_no_expires)
affects:
  - 16-02-cleanup-subagent-workspaces (sibling plan; file-disjoint per CF-07 — no contact surface)
  - any future workflow .md added under get-shit-done/workflows/ that uses workspace.parallel.* literals — must pair dispatch <-> fan-in or be allowlisted
  - any future allowlist file (lint-vcs-no-raw-git.allow.json, lint-vcs-no-commit-id.allow.json, lint-vcs-parallel-call-presence.allow.json) that attempts to add an 'expires' field — parser will throw

# Tech tracking
tech-stack:
  added: []  # Zero new npm packages per RESEARCH §Package Legitimacy Audit
  patterns:
    - "FILE-level call-presence pairing in bash/sh/zsh fences (Pitfall 7 / D-01 — empirically justified by execute-phase.md putting calls in different ## sections)"
    - "Byte-identical fence regex duplication between lint + audit (CF-06 — shared-lib extraction forbidden per REQUIREMENTS.md §Out of Scope L92)"
    - "Allowlist-parser FORBIDDEN_FIELDS list (mirrors REQUIRED_FIELDS pattern) — first use of active-rejection at schema layer for solo-dev no-expires enforcement"

key-files:
  created:
    - scripts/lint-vcs-parallel-call-presence.cjs
    - scripts/lint-vcs-parallel-call-presence.allow.json
    - tests/scripts/lint-vcs-parallel-call-presence.test.cjs
    - tests/scripts/fixtures/lint-vcs-parallel-call-presence/paired/get-shit-done/workflows/paired.md
    - tests/scripts/fixtures/lint-vcs-parallel-call-presence/dispatch-only/get-shit-done/workflows/dispatch-only.md
    - tests/scripts/fixtures/lint-vcs-parallel-call-presence/fanin-only/get-shit-done/workflows/fanin-only.md
    - tests/scripts/fixtures/lint-vcs-parallel-call-presence/prose-only/get-shit-done/workflows/prose-only.md
    - tests/scripts/fixtures/lint-vcs-parallel-call-presence/allowlist/get-shit-done/workflows/opted-out.md
  modified:
    - scripts/lib/allowlist-parser.cjs (Rule 2 deviation: added FORBIDDEN_FIELDS guard for 'expires')
    - tests/scripts/allowlist-parser.test.cjs (Rule 2 deviation: added 2 regression tests for FORBIDDEN_FIELDS)
    - .github/workflows/parallel-e2e.yml (CF-05: new lint step adjacent to CI-06 audit step + 2 paths-filter entries)

key-decisions:
  - "Tightened scripts/lib/allowlist-parser.cjs to actively throw on 'expires' field (Phase 8's silent-ignore stance was inconsistent with feedback_solo_dev_no_expires which forbids the field; brought into alignment via Rule 2 deviation — no existing repo allowlist contained expires so no regression possible)"
  - "Migration_note in the new allow.json reworded to avoid the literal substring 'expires' (preserved documentation intent via 'no third date-stamped re-justification field'; satisfies the plan's strict grep -c expires == 0 verification step)"

patterns-established:
  - "FILE-level pairing scope (D-01): pairing is bidirectional file-scoped, NOT fence-scoped or section-scoped. Pattern is reusable for any future call-presence lint where two procedural steps live in different procedural sections of a single workflow."
  - "SCAN_ROOTS narrowing per false-positive guard (D-03): when adding a lint that derives from audit-workflow-raw-git.cjs's fence walker, narrow SCAN_ROOTS to ['get-shit-done/workflows'] only if the literal could trip on prose mentions in references/ + agents/ (Pitfall 7 false-positive class)."
  - "FORBIDDEN_FIELDS as first-class parser exports (Phase 16 plan 16.01): allowlist parsers MAY actively reject fields, not just require them. Pattern: REQUIRED_FIELDS for non-empty validation; FORBIDDEN_FIELDS for active rejection. Both export as module-level constants for test consumption."

requirements-completed: [LINT-06]

# Metrics
duration: 18min
completed: 2026-05-24
---

# Phase 16 Plan 01: workflow-invariant-tooling Summary

**FILE-level call-presence lint enforcing workspace.parallel.dispatch <-> workspace.parallel.fan-in pairing in bash/sh/zsh fences under get-shit-done/workflows/, wired as a CI step adjacent to the existing CI-06 audit, with 5 D-14 fixture scenarios covering the Pitfall 7 false-positive guard, plus a Phase 8 allowlist-parser tightening that brings 'expires'-field rejection into alignment with feedback_solo_dev_no_expires.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-25T05:00 UTC
- **Completed:** 2026-05-25T05:18 UTC
- **Tasks:** 2 (Task 1: script + allowlist + 5 fixtures; Task 2: tests + CI step)
- **Files created:** 8
- **Files modified:** 3
- **Commits:** 4 (2 plan tasks + 2 deviation fixes)

## Accomplishments

- LINT-06 / `scripts/lint-vcs-parallel-call-presence.cjs` shipped — default-deny content-driven lint that enforces FILE-level pairing of dispatch and fan-in literal substrings in bash/sh/zsh shell fences under `get-shit-done/workflows/` only. Lint passes against the live tree (103 files scanned, 0 violations) because `execute-phase.md` and `quick.md` both pair both literals across separate fences in different `##` sections.
- 5 fixture scenarios (D-14) wired with `node:test` and durable fixture trees under `tests/scripts/fixtures/lint-vcs-parallel-call-presence/`. The load-bearing test is #4: prose-only mentions of `parallel`/`wave`/`Task(` exit 0 — the Pitfall 7 false-positive guard that makes the FILE-level scope safe to apply across the entire workflows tree.
- CI step `Lint — workflow call-presence (LINT-06)` inserted adjacent to the existing CI-06 audit step in `.github/workflows/parallel-e2e.yml`, running inside the existing `parallel-e2e` matrix job — inherits the jj-colocated blocking discipline via `parallel-e2e-gate` automatically (no new top-level job added). 2 new paths-filter entries gate the lint on script/allowlist changes.
- Allowlist parser tightened (deviation Rule 2): `FORBIDDEN_FIELDS = ['expires']` actively rejected at parse time, bringing Phase 8 D-04's silent-ignore stance into alignment with `feedback_solo_dev_no_expires` which forbids the field. No regressions — all 3 existing repo allowlists parse cleanly; the original 9 allowlist-parser tests still pass; 2 new regression tests added.

## Task Commits

Each task was committed atomically (jj change_ids shown):

1. **Task 1: ship lint script + allowlist + 5 fixtures** — `ltlwvnyy` (feat)
2. **Task 1.5 deviation: tighten allowlist-parser** — `ktkrsyqr` (fix; Rule 2)
3. **Task 2: 5 D-14 tests + CI step wiring** — `yzyqlqqk` (test)
4. **Task 2.5 fix: reword migration_note for grep-c-expires==0** — `xovwmusw` (fix; Rule 1)

## Files Created/Modified

**Created (8):**
- `scripts/lint-vcs-parallel-call-presence.cjs` — the lint itself; ~120 LOC; mirrors `lint-vcs-no-raw-git.cjs` shape + audit-workflow's fence walker; FENCE_OPEN/FENCE_CLOSE byte-identical to `audit-workflow-raw-git.cjs:48-49` per CF-06.
- `scripts/lint-vcs-parallel-call-presence.allow.json` — schema-v2 allowlist; `entries: []` initial per D-08 + IP-2 narrative stub.
- `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` — 5 tests covering D-14 scenarios #1 through #5.
- `tests/scripts/fixtures/lint-vcs-parallel-call-presence/{paired,dispatch-only,fanin-only,prose-only,allowlist}/get-shit-done/workflows/*.md` — 5 fixture trees (one .md each), durable specimens checked into git.

**Modified (3):**
- `scripts/lib/allowlist-parser.cjs` — added `FORBIDDEN_FIELDS = ['expires']` guard + export.
- `tests/scripts/allowlist-parser.test.cjs` — added 2 regression tests for the new guard.
- `.github/workflows/parallel-e2e.yml` — added new `Lint — workflow call-presence (LINT-06)` step adjacent to CI-06 audit + 2 paths-filter entries for the script and allowlist.

## Decisions Made

- **Where to put the THROW assertion for the no-expires guard.** The plan's `<behavior>` block specified the test MUST assert `parseAllowlist({...expires...})` THROWS. Phase 8's parser was deliberately silent-ignore for `expires` (per its docstring). Resolved by tightening the parser (Rule 2 deviation) rather than weakening the test, because the user-memory `feedback_solo_dev_no_expires` is the load-bearing directive and the parser's silent-ignore stance had been inconsistent with it since Phase 8. The deviation was minimal (4-line change + export), backward-compatible (no existing allowlist contains `expires`), and is now exercised by 2 regression tests.
- **How to satisfy the `grep -c "expires" allow.json == 0` verification** without losing documentation history. The first draft of `$migration_note` used the literal phrasing "expires field dropped" (mirroring `lint-vcs-no-raw-git.allow.json:3`'s style). The plan's verification step 6 specified `grep -c "expires" returns 0` which conflicts with the inherited prose pattern. Reworded the note to "no third date-stamped re-justification field per solo-dev override" — preserves the schema-history intent, avoids the literal substring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Tightened allowlist-parser to actively reject 'expires' field**
- **Found during:** Task 2 (test writing — plan's `<behavior>` block specified parser MUST throw on expires; the parser as-of Phase 8 silently ignored expires per its own docstring, creating a contradiction between the plan, the user-memory `feedback_solo_dev_no_expires`, and the actual code)
- **Issue:** Phase 8 D-04 originally documented that the `expires` field is "intentionally NOT validated" by the parser — silent-ignore stance. But the user-memory `feedback_solo_dev_no_expires` forbids the field. The plan's `<behavior>` spec required the test to assert THROW on expires, which would have been impossible against the silent-ignore parser. The contradiction made the plan's intent unachievable without resolving the parser's stance.
- **Fix:** Added `FORBIDDEN_FIELDS = ['expires']` to `scripts/lib/allowlist-parser.cjs`; parser now throws with a descriptive error citing Phase 16 plan 16.01 + `feedback_solo_dev_no_expires` when an entry contains `expires`. Updated docstring to reflect "FORBIDDEN" rather than "intentionally NOT validated". Added 2 regression tests to `tests/scripts/allowlist-parser.test.cjs` (one asserting THROW on expires-bearing entry; one asserting FORBIDDEN_FIELDS exports as `['expires']`). Verified no regression: all 3 existing repo allowlists still parse cleanly; the original 9 allowlist-parser tests + the lint-vcs-no-raw-git fixture tests all pass; lint-vcs-no-raw-git still scans 1102 files clean.
- **Files modified:** scripts/lib/allowlist-parser.cjs, tests/scripts/allowlist-parser.test.cjs
- **Verification:** `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs tests/scripts/allowlist-parser.test.cjs tests/lint-vcs-no-raw-git-fixture.test.cjs` exits 0 with 23 tests passing
- **Committed in:** `ktkrsyqr` (separate from Task 1 / Task 2 commits for clean attribution)

**2. [Rule 1 - Bug] Reworded $migration_note to satisfy strict grep-c-expires==0 verification**
- **Found during:** End-of-plan verification (step 6 of `<verification>` block: `grep -c "expires" scripts/lint-vcs-parallel-call-presence.allow.json` must return 0; initial draft returned 1 hit due to the prose word "expires" in the migration_note documentation)
- **Issue:** The initial `$migration_note` field used "expires field dropped per solo-dev override" — mirroring the established `scripts/lint-vcs-no-raw-git.allow.json:3` precedent which also contains the literal "expires" in its own migration_note. The plan's `<verification>` step 6 specified a STRICT `grep -c "expires" returns 0`, which conflicts with the inherited documentation pattern.
- **Fix:** Reworded to "no third date-stamped re-justification field per solo-dev override" — preserves the schema-migration documentation intent without the literal substring. The runtime parser-throw added in deviation #1 is the load-bearing enforcement; the migration_note is only documentation.
- **Files modified:** scripts/lint-vcs-parallel-call-presence.allow.json
- **Verification:** `grep -c "expires" scripts/lint-vcs-parallel-call-presence.allow.json` returns 0; lint still passes against live tree (103 files, 0 violations); all 5 D-14 tests still pass
- **Committed in:** `xovwmusw`

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 bug fix)
**Impact on plan:** Both deviations were necessary to bring the plan's specified behavior into alignment with the actual codebase. Deviation #1 closed a contradiction between the plan's `<behavior>` spec, the user-memory `feedback_solo_dev_no_expires`, and Phase 8's silent-ignore parser stance — the resolution (active rejection) is the correct semantic per user memory; the previous silent-ignore was a documentation-only convention that the parser was supposed to enforce but didn't. Deviation #2 was a small wording adjustment to satisfy a strict grep check, with zero semantic change. No scope creep — all changes are scoped to Phase 16.01's stated goal (LINT-06 / workflow call-presence lint + supporting infrastructure).

## Issues Encountered

- **Plan / parser contradiction on 'expires' enforcement.** Plan's `<behavior>` spec said parser MUST throw on expires; Phase 8 parser docstring said expires was "intentionally NOT validated." Resolved by deviation Rule 2 (parser tightening); see "Deviations from Plan" §1 for full reasoning.
- **Strict grep-c-expires verification vs inherited documentation prose pattern.** Plan's verification step 6 specified `grep -c "expires" returns 0`; the inherited `lint-vcs-no-raw-git.allow.json` migration_note style uses the literal "expires" word. Resolved by deviation Rule 1 (migration_note rewording); see "Deviations from Plan" §2 for full reasoning.
- **No other issues.** All other acceptance criteria, success criteria, and verification steps passed on first attempt.

## TDD Gate Compliance

Both Task 1 and Task 2 are marked `tdd="true"` in the plan. The plan's task structure groups the test creation into Task 2 (separate from script creation in Task 1) — which is a non-standard TDD ordering (the script ships before its tests are written), but matches the plan's explicit task division. To satisfy the gate intent:

- **Task 1 (script + fixtures):** Used the local `<verify>` block (`node scripts/lint-vcs-parallel-call-presence.cjs && test -f ... && node -e '...'`) as the GREEN check before commit. The fixtures themselves are the test artifacts that Task 2 consumes; running the script behaviorally against each fixture confirmed all 4 testable scenarios work before commit.
- **Task 2 (tests + CI step):** Standard `node --test` GREEN check before commit; all 5 D-14 scenarios pass.
- **Task 1.5 deviation (parser tightening):** Followed Red/Green inside the deviation — wrote 2 new tests asserting the throw + the FORBIDDEN_FIELDS export, ran them (PASS after parser tightening), confirmed no regression by re-running existing 9 allowlist-parser tests + lint-vcs-no-raw-git fixture tests.
- **Task 2.5 fix (migration_note rewording):** Trivial documentation change; verified via grep + full test suite re-run.

No `test(...)` commit precedes the `feat(...)` commit — the plan's task structure inverts the standard RED/GREEN order. This is a documented deviation from the project's typical TDD discipline but matches the plan as written.

## Threat Flags

No new security-relevant surface introduced. The lint is read-only (reads `.md` files, emits stdout/stderr diagnostics, never writes). T-16.01-01 (symlink traversal) mitigated by `entry.isSymbolicLink() && continue` per the plan's threat_model. T-16.01-02 (`--scan-root` path traversal) mitigated by `path.resolve()` canonicalization. T-16.01-03 (ReDoS via regex) accepted — the two literal patterns are non-backtracking bare substrings, and fence regexes from CF-06 are anchored.

## Self-Check: PASSED

**Files checked:**
- FOUND: scripts/lint-vcs-parallel-call-presence.cjs
- FOUND: scripts/lint-vcs-parallel-call-presence.allow.json
- FOUND: tests/scripts/lint-vcs-parallel-call-presence.test.cjs
- FOUND: tests/scripts/fixtures/lint-vcs-parallel-call-presence/paired/get-shit-done/workflows/paired.md
- FOUND: tests/scripts/fixtures/lint-vcs-parallel-call-presence/dispatch-only/get-shit-done/workflows/dispatch-only.md
- FOUND: tests/scripts/fixtures/lint-vcs-parallel-call-presence/fanin-only/get-shit-done/workflows/fanin-only.md
- FOUND: tests/scripts/fixtures/lint-vcs-parallel-call-presence/prose-only/get-shit-done/workflows/prose-only.md
- FOUND: tests/scripts/fixtures/lint-vcs-parallel-call-presence/allowlist/get-shit-done/workflows/opted-out.md

**Commits checked (via `gsd-sdk query log`):**
- ltlwvnyy — feat(16-01): ship lint-vcs-parallel-call-presence script, allowlist, fixtures
- ktkrsyqr — fix(16-01): allowlist-parser actively rejects forbidden expires field
- yzyqlqqk — test(16-01): add 5 D-14 fixture tests + wire LINT-06 CI step
- xovwmusw — fix(16-01): reword $migration_note to satisfy grep-c-expires-returns-0 acceptance

**End-of-plan verification (per `<verification>` block):**
1. `node scripts/lint-vcs-parallel-call-presence.cjs` → exit 0, "ok ... 103 files scanned, 0 violations"
2. `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` → 5/5 pass, 0 fail
3. `grep -c "lint-vcs-parallel-call-presence" .github/workflows/parallel-e2e.yml` → 3 (≥3 required)
5. `scripts/lint-vcs-no-raw-git.allow.json` unmodified — LINT-05 net diff stays at zero
6. `grep -c "expires" scripts/lint-vcs-parallel-call-presence.allow.json` → 0

(Verification #4 — `pnpm test` full suite — deferred to wave-end orchestrator run; the per-plan test files pass standalone.)

## Next Phase Readiness

LINT-06 is the last v1.3 open workflow-lint deferral per ROADMAP entry. With this plan complete and the CI step wired, any future workflow .md that declares `workspace.parallel.dispatch` or `workspace.parallel.fan-in` in a bash fence MUST pair the other verb — or be allowlisted with a per-entry `{path, reason, owner}` justification. The Phase 8 allowlist-parser is now strictly enforcing `feedback_solo_dev_no_expires` at the schema layer (not just the convention layer).

Sibling plan 16.02 (CLEANUP-02) is file-disjoint per CF-07 and ran in parallel — no contact surface with this plan.

---
*Phase: 16-workflow-invariant-tooling*
*Completed: 2026-05-24*
