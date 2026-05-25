---
phase: 17-drift-control-reconciliation
plan: 17.02
subsystem: tests
tags: [drift-control, tests, node-test, live-scan, locale-parity]

requires:
  - phase: 17.01
    provides: ARCHITECTURE.md + INVENTORY.md prose-count alignment with live filesystem; Pitfall 4 same-PR coupling gate
provides:
  - tests/architecture-counts.test.cjs — DRIFT-01 ARCHITECTURE.md prose-count locale-parity guard (en + ja-JP + ko-KR, 10 leaf assertions)
  - tests/command-count-sync.test.cjs — DRIFT-02 INVENTORY.md ## Commands table-row sync guard (1 leaf assertion)
  - DRIFT-01 + DRIFT-02 closed; Pitfall 4 Day-1 GREEN locked in; CF-02 live-scan policy + CF-03 single-responsibility separation upheld
  - D-10 auto-resolve confirmed (Tests NOT added as an INVENTORY.md family); INVENTORY.md L9/L59 self-references auto-resolve as the two test files now exist on disk
affects: [17.03, 17.04]

tech-stack:
  added:
    - "node:test runner targeting tests/*.test.cjs (already in use by tests/inventory-counts.test.cjs — no new framework introduced)"
  patterns:
    - "Live-scan drift guards (CF-02): both sides of every assertion read from the live filesystem at test runtime via readdirSync + readFileSync; zero hardcoded counts"
    - "Per-locale exact-string regex (D-06): EN_LABELS / JA_LABELS / KO_LABELS constants inline in test file; one regex set per locale; no YAML/TOML config file"
    - "All-strict locale lockstep (D-04) on prose-count-carrying locales (pt-BR carved out structurally per RESEARCH key finding #2)"
    - "Rounded-bucket installer LOC (D-03): nearest-1000 tolerates incidental ±499 churn from non-drift commits"
    - "Single-responsibility test file separation (CF-03): architecture-counts.test.cjs and command-count-sync.test.cjs are two independent files cross-linked by JSDoc comment, not merged"

key-files:
  created:
    - tests/architecture-counts.test.cjs
    - tests/command-count-sync.test.cjs
    - .planning/phases/17-drift-control-reconciliation/17-02-SUMMARY.md
  modified:
    - docs/INVENTORY.md

key-decisions:
  - "Rule 3 deviation: added the missing `/gsd-migrate-vcs` row to INVENTORY.md `## Commands` (Docs, Profile & Utilities sub-group). Wave 1 (17.01) only swept the headline 67→68 per RESEARCH §DRIFT-02 line 520 but the row list still enumerated only 67 commands. Without this one-line fix the new command-count-sync drift guard would RED on first run, violating CF-01 + Pitfall 4 same-PR coupling. INVENTORY.md was outside the plan's declared files_modified, but the must-have `exits 0 on first run` is non-negotiable."
  - "D-10 honored: Tests is NOT added as an INVENTORY.md family. The two new test files auto-resolve INVENTORY.md L9/L59 self-references because the files now exist on disk."
  - "pt-BR carved out of architecture-counts.test.cjs scope at the LOCALES array level per RESEARCH key finding #2 (docs/pt-BR/ARCHITECTURE.md is an 81-line summary with no numeric prose-counts). D-04 lockstep applies only to prose-count-carrying locales by structural reality; carve-out comment documents this in the file."

patterns-established:
  - "Drift-control test scaffolding: verbatim-shape copies of tests/inventory-counts.test.cjs anchored by `ROOT = path.resolve(__dirname, '..')`, with describe/test blocks emitting one assertion per (locale × dimension) leaf and assertion messages naming BOTH the documented value and the actual filesystem count."
  - "Pitfall 4 same-PR coupling: drift FIX commits (Wave 1) MUST land before drift TEST commits (Wave 2) in strict-sequential order; the test file expects post-fix state and is Day-1 GREEN by construction."

requirements-completed: [DRIFT-01, DRIFT-02]

duration: 8min
completed: 2026-05-25
---

# Phase 17 Plan 17.02: Add drift-control guards (DRIFT-01 + DRIFT-02) Summary

**Shipped two new node:test drift guards (tests/architecture-counts.test.cjs + tests/command-count-sync.test.cjs) that lock ARCHITECTURE.md + INVENTORY.md prose claims to live filesystem state. Both pass green on first run (10 + 1 = 11 new assertions); the existing inventory-counts.test.cjs sibling guard still passes (6/6); CF-02 live-scan + CF-03 single-responsibility + D-04 lockstep + D-06 per-locale regex all upheld in source. DRIFT-01 + DRIFT-02 closed.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 (one per drift requirement)
- **Files created:** 2 test files + this SUMMARY.md
- **Files modified:** 1 (INVENTORY.md — bounded Rule 3 fix)
- **New assertions wired:** 11 (10 in architecture-counts + 1 in command-count-sync)
- **All-three drift guards together:** `node --test tests/architecture-counts.test.cjs tests/command-count-sync.test.cjs tests/inventory-counts.test.cjs` → 17/17 pass, exit 0

## Accomplishments

- **tests/architecture-counts.test.cjs (DRIFT-01):** 110 LOC; iterates a `LOCALES` array of 3 entries (en, ja-JP, ko-KR) × per-locale-applicable `DIMENSIONS` (commands, workflows, agents) plus a dedicated rounded-bucket `installerLoc` assertion. EN skips commands+workflows (defers to INVENTORY.md per ARCHITECTURE.md L121/L143); ja-JP + ko-KR assert all three dimensions. 10 leaf assertions total; all green Day-1 against the post-17.01 filesystem.
- **tests/command-count-sync.test.cjs (DRIFT-02):** 51 LOC; slices INVENTORY.md from `## Commands ` to the next `\n## ` boundary, counts rows matching `^|\s+`/gsd-...`` against `fs.readdirSync('commands/gsd').filter(...md)`. 1 leaf assertion. Green Day-1 after the INVENTORY row fix below.
- **INVENTORY.md `/gsd-migrate-vcs` row added** in the "Docs, Profile & Utilities" sub-group. Required to keep command-count-sync.test.cjs Day-1 GREEN — Wave 1 swept the headline (67→68) but not the row list; this fix completes the same-PR coupling for the 68th command. Single-line edit; no other INVENTORY content touched.
- **Both new tests use `node:test`** (CF-02) — `require('node:test')` count = 1 each; `require('vitest')` count = 0 each.
- **No hardcoded counts** anywhere in either new file — every count comes from a live `readdirSync` / `wc -l`-equivalent read at test runtime per CF-02. Grep for hardcoded 68 / 89 / 33 / 10978 / 11000 with the `===` or `==` operator returned 0 hits in both files.
- **pt-BR structurally carved out** of architecture-counts.test.cjs's LOCALES array; carve-out documented in JSDoc and in an inline `// pt-BR excluded ...` comment immediately above the LOCALES declaration (verified via `grep -cE pt-BR` ≥ 1).
- **Cross-link comments** wire the new test files to their siblings via JSDoc references to `tests/command-count-sync.test.cjs` and `tests/inventory-counts.test.cjs` (CF-03 single-responsibility separation).

## Task Commits

Each task was committed atomically via `gsd-sdk query commit`:

1. **Task 1: Author tests/architecture-counts.test.cjs (DRIFT-01)** — change `ryo` (working-copy at time of squash); jj log subject: `test(17-17.02): add architecture-counts drift guard (DRIFT-01)`.
2. **Task 2: Author tests/command-count-sync.test.cjs (DRIFT-02)** — change `ryo` (working-copy at time of squash); jj log subject: `test(17-17.02): add command-count-sync drift guard (DRIFT-02)`. Bundled the bounded INVENTORY.md row fix (Rule 3 deviation) in the same commit so the new guard lands Day-1 GREEN.

_Note: The SDK `commit` verb in jj-port mode reports the post-squash working-copy change id (`ryo`) rather than per-commit hashes. The `jj log` history confirms two distinct, ordered commits on top of the Wave 1 pair._

## Files Created/Modified

- `tests/architecture-counts.test.cjs` — NEW, 110 LOC, node:test, verbatim-shape copy of tests/inventory-counts.test.cjs.
- `tests/command-count-sync.test.cjs` — NEW, 51 LOC, node:test, single-responsibility per CF-03.
- `docs/INVENTORY.md` — ONE line added (new `/gsd-migrate-vcs` table row in "Docs, Profile & Utilities"). Bounded Rule 3 fix; no other INVENTORY content modified.
- `.planning/phases/17-drift-control-reconciliation/17-02-SUMMARY.md` — this summary.

## Decisions Made

- **Rule 3 deviation: INVENTORY.md row added.** See Deviations section.
- **D-10 auto-resolve honored.** No `## Tests (N shipped)` family added to INVENTORY.md. The L9/L59 self-references that claimed two drift tests exist auto-resolve as those files now exist on disk. If a Tests family is ever desired, it is a v1.5+ deferred idea per CONTEXT §Deferred Ideas.
- **pt-BR exclusion preserved at LOCALES level.** docs/pt-BR/ARCHITECTURE.md does not appear as a `file:` entry of LOCALES; the carve-out is structural (RESEARCH key finding #2), not a policy softening of D-04. D-04 lockstep applies only to prose-count-carrying locales (en + ja-JP + ko-KR) by structural reality.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Added `/gsd-migrate-vcs` row to docs/INVENTORY.md `## Commands` table**
- **Found during:** Task 2 — first run of `tests/command-count-sync.test.cjs` red with `INVENTORY.md ## Commands table has 67 rows but commands/gsd/ has 68 .md files` (actual: 67, expected: 68).
- **Root cause:** Wave 1 (17.01) bumped the `## Commands (67 shipped)` headline to 68 per RESEARCH §DRIFT-02 line 520, but the row list still enumerated only 67 commands — `commands/gsd/migrate-vcs.md` exists on disk with no corresponding row in INVENTORY.md. RESEARCH didn't catch this because the §DRIFT-02 prescription only spoke about the headline.
- **Fix:** Added one row in the "Docs, Profile & Utilities" sub-group: `| \`/gsd-migrate-vcs\` | Bidirectional VCS migration — rewrites \`.planning/\` between git SHAs and jj change_ids and flips \`vcs.adapter\` in one atomic commit. | [commands/gsd/migrate-vcs.md](../commands/gsd/migrate-vcs.md) |`. Source of one-liner role text: `commands/gsd/migrate-vcs.md` YAML frontmatter `description` field.
- **Why Rule 3 (not Rule 4):** Bounded — one-line single-file edit, no architectural change, no schema or scope expansion. The plan's must-have "exits 0 on first run" (frontmatter line 22) is non-negotiable per CF-01 + Pitfall 4; the only way to honor it without amending Wave 1 is to land the missing row in this plan.
- **Why not amend Wave 1:** jj-port project policy + the user's squash-centric commit model strongly discourage rewriting prior committed work (only working-copy mutations are routine). The bounded forward fix preserves forensic linearity.
- **Files modified:** `docs/INVENTORY.md` (one line added between L160 and L161 — the `pr-branch` row stays first, `migrate-vcs` row follows).
- **Commit:** bundled with Task 2 (`test(17-17.02): add command-count-sync drift guard (DRIFT-02)`).
- **Scope-boundary note:** All other INVENTORY content was inspected for additional row drift (e.g., command-name aliasing like `ns-context.md` → `/gsd-context`) and is correct by design — those are router shortcuts pointing to `ns-*.md` source files. No further INVENTORY changes were required.

### Other Notes

- **Indentation style:** The new test files use tab indentation per the user's global CLAUDE.md (`always use tabs for indentation unless impossible`), even though tests/inventory-counts.test.cjs uses 2-space. CF-02 "verbatim-shape copy" is satisfied at the structural level (same imports, same anchor pattern, same describe/test shape, same fsCount helper); style-level indentation is a project-convention concern and the user's global rule takes precedence.

## Issues Encountered

None unresolved. The one runtime issue (Wave 1 row-list gap) was auto-fixed inline per Rule 3 and documented above.

## User Setup Required

None. The new tests wire into the existing `node --test` lane and require no configuration.

## Next Phase Readiness

- **Wave 3 (Plan 17.03 / DOCS-01..07 + DOCS-09)** gate is **OPEN**. The drift guards now in place will detect prose-count regressions in any future ARCHITECTURE.md or INVENTORY.md edit — including those landing in Wave 3 (e.g., if 17.03's `gsd-tools.cjs` → `gsd-sdk query` rename edits touch ARCHITECTURE.md, the drift tests stay green only if counts remain aligned).
- **Wave 4 (Plan 17.04 / PROJECT-01)** is unaffected by this plan; reconciliation runs after Waves 1–3 per D-11.
- No blockers for downstream waves.

## Self-Check: PASSED

- `tests/architecture-counts.test.cjs` exists, 110 LOC, uses node:test, 10/10 pass — FOUND
- `tests/command-count-sync.test.cjs` exists, 51 LOC, uses node:test, 1/1 pass — FOUND
- `tests/inventory-counts.test.cjs` still passes 6/6 — FOUND (no regression)
- All three drift guards together: 17/17 pass, exit 0 — FOUND
- `grep -c "require('node:test')"` returns 1 for each new file — VERIFIED
- `grep -c "require('vitest')"` returns 0 for each new file — VERIFIED
- `grep -cE "(===|==) (68|89|33|10978|11000)"` returns 0 for architecture-counts.test.cjs — VERIFIED (no hardcoded counts)
- `grep -cE "(===|==) 68"` returns 0 for command-count-sync.test.cjs — VERIFIED
- `grep -c "EN_LABELS\|JA_LABELS\|KO_LABELS"` returns 6 in architecture-counts.test.cjs (>= 3 required) — VERIFIED
- `grep -c "Math.round(documented / 1000)"` returns 1 in architecture-counts.test.cjs — VERIFIED (D-03 rounded-bucket)
- `grep -cE "pt-BR"` returns 3 in architecture-counts.test.cjs (carve-out documented) — VERIFIED
- `grep -cE "docs/pt-BR"` shows it only in JSDoc comment, NOT in LOCALES `file:` entries — VERIFIED via line inspection
- LOCALES array contains exactly 3 entries (en, ja-JP, ko-KR) — VERIFIED
- `grep -c "commandsTableRowCount\|filesystemCommandCount"` returns 4 in command-count-sync.test.cjs (>= 2 required) — VERIFIED
- `grep -c "architecture-counts.test.cjs"` returns 1 in command-count-sync.test.cjs (cross-link per CF-03) — VERIFIED
- INVENTORY.md `## Commands` section now has 68 table rows matching `commands/gsd/*.md` file count of 68 — VERIFIED
- Both Task 1 + Task 2 commits present in `gsd-sdk query log` — FOUND

## Known Stubs

None. Both test files compute every assertion value from live filesystem state at test runtime per CF-02.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns at trust boundaries, or schema changes introduced. The drift tests do bounded `readdirSync` over small dirs (≤89 entries) + bounded `readFileSync` over the ≤11kLOC `bin/install.js` — strictly within the plan's `<threat_model>` `accept` disposition for T-17.02-02.

---
*Phase: 17-drift-control-reconciliation*
*Completed: 2026-05-25*
