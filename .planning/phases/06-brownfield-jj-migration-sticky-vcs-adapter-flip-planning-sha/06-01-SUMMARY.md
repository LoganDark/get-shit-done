---
phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
plan: 01
subsystem: infra
tags: [vcs, jj, git, config-schema, revset, expr, parity, probes]

requires:
  - phase: 03-jj-backend-core-squash-refs-conflict
    provides: vcs.adapter sticky storage location (D-17), expr factories, parse/{jj,git}-rev.ts translators, jj squash commit model
  - phase: 02-vcs-abstraction-audit
    provides: VALID_CONFIG_KEYS parity test (#2653), atomicWriteConfig helper, parseExpr 4-kind union
provides:
  - vcs.adapter as a first-class VALID_CONFIG_KEYS entry (SDK + CJS lockstep)
  - expr.children + expr.parents factories (encoded form + recursive parseExpr cases)
  - jj-side translators: children → "<inner>+", parents → "(<inner>)-"
  - git-side translators: parents → "<inner>^@"; children → typed not-supported error
  - has_jj peer field on initNewProject + initIngestDocs (greenfield gate signal)
  - atomicWriteConfig exported from sdk/src/query/config-mutation.ts
  - Empirical probes (3) closing RESEARCH Assumptions A1 / A5 / A6
affects:
  - 06-02-PLAN.md (orphan walker consumes expr.children + expr.parents; .planning SHA→change_id rewriter consumes A1 alphabet disjointness)
  - 06-03-PLAN.md (greenfield gate consumes has_jj; adapter flip consumes vcs.adapter key + atomicWriteConfig)
  - 06-04-PLAN.md (dogfood gate inherits foundation)

tech-stack:
  added: []
  patterns:
    - "RevisionExpr recursive nesting: 'children:<encoded-inner>' / 'parents:<encoded-inner>' mirrors the 02-03 'range:' pattern — per-backend translators recursively re-translate the inner expression"
    - "Symmetric per-backend asymmetry: children supported on jj, throws typed error on git (single-token operator absent); parents supported on both (jj '(x)-', git 'x^@')"
    - "Empirical-probe-as-assumption-closer: each RESEARCH assumption gets a vitest test that fails loudly on jj upgrade — preferred over silent staleness"

key-files:
  created:
    - sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts
    - sdk/src/vcs/__tests__/jj-children-probe.test.ts
    - sdk/src/vcs/__tests__/jj-parents-probe.test.ts
    - .planning/intel/06-foundation-probes.md
  modified:
    - sdk/src/query/config-schema.ts
    - get-shit-done/bin/lib/config-schema.cjs
    - sdk/src/query/config-mutation.ts
    - sdk/src/vcs/expr.ts
    - sdk/src/vcs/parse/jj-rev.ts
    - sdk/src/vcs/parse/git-rev.ts
    - sdk/src/vcs/__tests__/expr.test.ts
    - sdk/src/query/init-complex.ts
    - sdk/src/query/init.ts

key-decisions:
  - "Comment for vcs.adapter in both schema files uses unquoted tokens (git | jj, auto) — the parity test extracts single-quoted strings between 'new Set([' and '])' so any quoted tokens in surrounding comments would be falsely flagged as drifted keys"
  - "git-side children: translator throws typed not-supported error rather than emitting a sentinel — plan 06-02 orphan walker explicitly opts into the asymmetry by restricting expr.children calls to jj backend; deterministic typed-error on misuse beats a silent-wrong translation"
  - "Both translator switch statements gained unreachable case 'children' / case 'parents' arms (after the early-return prefix branches) to keep TypeScript's exhaustiveness check satisfied without changing runtime behavior"
  - "Probe tests written as standalone test files (mkdtempSync + raw jj invocations) rather than using makeBackendFixture — they exercise revset operators directly against the jj binary without needing the contract suite's snapshot/restore lifecycle"

patterns-established:
  - "ParsedExpr inner: ParsedExpr field — recursive AST shape for nested kinds (children/parents) that mirrors the per-backend translator's inline recursive call"
  - "Probe-test skipIf gate: each probe wraps describe in .skipIf(!jjAvailable) so CI lanes without jj installed simply skip rather than fail"

requirements-completed:
  - PHASE6-FOUNDATION
  - PHASE6-SCHEMA-PARITY
  - PHASE6-EXPR-CHILDREN
  - PHASE6-GREENFIELD-SIGNAL

duration: ~13m
completed: 2026-05-14
---

# Phase 06 Plan 01: Foundation (vcs.adapter key + expr.children/parents + has_jj + A1/A5/A6 probes) Summary

**Schema-parity-safe `vcs.adapter` key wired in lockstep across SDK and CJS; `expr.children` + `expr.parents` factories with jj `x+` / `(x)-` and git `x^@` translators (git-side children throws typed not-supported); `has_jj` peer signal on init handlers; `atomicWriteConfig` exported; three empirical probes close RESEARCH Assumptions A1 (change_id alphabet disjointness), A5 (`x+` direct-children), A6 (`x-` direct-parents) against jj 0.41.0.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-14T00:22:00Z (approx)
- **Completed:** 2026-05-14T00:35:00Z (approx)
- **Tasks:** 3
- **Files modified:** 9 (4 source, 1 schema mirror, 2 init handlers, 3 new tests, 1 intel doc, 1 test enh)

## Accomplishments

- `vcs.adapter` now a first-class config key — both `sdk/src/query/config-schema.ts` and `get-shit-done/bin/lib/config-schema.cjs` carry it; `#2653` parity test green.
- `atomicWriteConfig` exported from `sdk/src/query/config-mutation.ts` — plans 06-02/06-03 can call it directly without re-implementing the temp-file-then-rename dance.
- `expr.children(rev)` + `expr.parents(rev)` factories added alongside existing `head/parent/bookmark/remote/range/rev`; `ParsedExpr` union widened with `'children' | 'parents'` kinds plus optional `inner: ParsedExpr` field; `parseExpr` recursively parses the encoded inner.
- jj translator: `children:<inner>` → `<inner>+`; `parents:<inner>` → `(<inner>)-` (parens guard suffix-operator precedence).
- git translator: `parents:<inner>` → `<inner>^@`; `children:<inner>` throws typed not-supported error documenting the asymmetry and the `git rev-list --ancestry-path` workaround.
- 11 new test cases in `expr.test.ts` cover both factories, jj/git translations (including `(@)-` and `HEAD^@`), and the git-side children error path.
- `initNewProject` (init-complex.ts) and `initIngestDocs` (init.ts) both return `has_jj: pathExists(.jj)` as peer to `has_git` — plan 06-03 greenfield gate signal.
- 3 probe tests pass against jj 0.41.0 (8 assertions total) — A1, A5, A6 closed.
- `.planning/intel/06-foundation-probes.md` records the evidence + re-verify instructions.
- `lint-vcs-no-raw-git` exits 0 (no new raw-git invocations).

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema parity edit + atomicWriteConfig export (atomic single-commit per #2653)** — `8ed42d75` (feat)
2. **Task 2: expr.children + expr.parents factories + per-backend translator updates (jj + git)** — `c0207eb3` (feat)
3. **Task 3: has_jj field on initNewProject + empirical probes for A1/A5/A6** — `ff3b7e71` (feat)

## Files Created/Modified

**Created:**
- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts` — A1 probe (change_id [k-z] vs commit_id [0-9a-f] alphabet disjointness)
- `sdk/src/vcs/__tests__/jj-children-probe.test.ts` — A5 probe (`x+` direct-children-only)
- `sdk/src/vcs/__tests__/jj-parents-probe.test.ts` — A6 probe (`x-` direct-parents-only)
- `.planning/intel/06-foundation-probes.md` — Evidence record + re-verify instructions

**Modified:**
- `sdk/src/query/config-schema.ts` — `vcs.adapter` added to `VALID_CONFIG_KEYS`
- `get-shit-done/bin/lib/config-schema.cjs` — Mirror `vcs.adapter` entry
- `sdk/src/query/config-mutation.ts` — `atomicWriteConfig` now `export`-ed
- `sdk/src/vcs/expr.ts` — `expr.children` + `expr.parents` factories; `ParsedExpr` widened with `'children' | 'parents'` + `inner` field; `parseExpr` recursive cases
- `sdk/src/vcs/parse/jj-rev.ts` — `children:` → `<inner>+`, `parents:` → `(<inner>)-` prefix branches + exhaustive switch arms
- `sdk/src/vcs/parse/git-rev.ts` — `parents:` → `<inner>^@`; `children:` throws typed not-supported; exhaustive switch arms
- `sdk/src/vcs/__tests__/expr.test.ts` — 11 new test cases (3 children round-trip, 1 jj translation, 1 git-error path, 3 parents round-trip + jj/git translation, +3 misc)
- `sdk/src/query/init-complex.ts` — `has_jj` peer field in `initNewProject`
- `sdk/src/query/init.ts` — `has_jj` peer field in `initIngestDocs`

## Decisions Made

- **Comment-quote-style for vcs.adapter:** The parity test (`tests/config-schema-sdk-parity.test.cjs`) extracts every single-quoted string between `new Set([` and `])` and asserts CJS↔SDK set-equality. The initial comment text used single quotes around `'git' | 'jj'` / `'auto'` which the regex falsely flagged as three drifted keys. Rewrote the comments to use unquoted tokens (`git | jj. (auto is read-time-only ...)`) — preserves human readability, avoids the false positive. Same change applied in both schema files.
- **git-side children:** translation strategy:** Chose typed not-supported error over sentinel emission. Plan 06-02 explicitly opts into the asymmetry by restricting `vcs.log({ rev: expr.children(...) })` calls to the jj adapter only. Deterministic-throw-on-misuse beats silent-wrong-translation; documented in the error message itself with the git `rev-list --ancestry-path` workaround for future callers.
- **Switch exhaustiveness:** Adding `'children' | 'parents'` to the `ParsedExpr.kind` union widened the discriminated union beyond the existing 4-kind switch in both translators. The prefix-startsWith branches above the switch handle these kinds, so reaching the switch with `kind === 'children' | 'parents'` is unreachable at runtime. Added explicit `case 'children': case 'parents': throw new Error(...unreachable...)` arms to both translator switches to keep TypeScript's exhaustiveness check satisfied (TS2366 — missing return statement). Zero runtime cost.
- **Probe-test fixture style:** Used standalone `mkdtempSync` + raw `jj` `execSync` per-probe rather than `makeBackendFixture(kind: 'jj-colocated')` from `vcs-fixture.ts`. The probes exercise revset operators directly without needing snapshot/restore — the contract-suite fixture lifecycle would have been wasted machinery.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text in vcs.adapter entry tripped parity test**
- **Found during:** Task 1 (initial parity test run after first edit)
- **Issue:** Comment line `// Legal write values: 'git' | 'jj'. ('auto' is read-time-only — index.ts:70.)` contained three single-quoted tokens that the parity test's regex extracts as keys. Test failed with "SDK keys missing from get-shit-done/bin/lib/config-schema.cjs: git, jj, auto".
- **Fix:** Rewrote the comment to use unquoted tokens — `// Legal write values: git | jj. (auto is read-time-only — index.ts:70.)` — in both schema files.
- **Files modified:** `sdk/src/query/config-schema.ts`, `get-shit-done/bin/lib/config-schema.cjs`
- **Verification:** `node --test tests/config-schema-sdk-parity.test.cjs` exits 0 with 3/3 tests passing.
- **Committed in:** `8ed42d75` (Task 1 commit — landed atomically with the actual `vcs.adapter` entry)

**2. [Rule 3 - Blocking] TypeScript exhaustiveness check in both per-backend translators**
- **Found during:** Task 2 (`pnpm build` after adding `'children' | 'parents'` to `ParsedExpr.kind` union)
- **Issue:** `tsc` reported `TS2366: Function lacks ending return statement and return type does not include 'undefined'` for both `toGitRev` and `toJjRev`. The switch statements at the bottom of each translator only covered the original 4 kinds; widening the union made them non-exhaustive.
- **Fix:** Added explicit unreachable `case 'children': case 'parents': throw new Error(... unreachable ...)` arms to both switches. The prefix-startsWith branches above handle these kinds before reaching the switch, so the throw is dead code at runtime but satisfies TypeScript's narrowing.
- **Files modified:** `sdk/src/vcs/parse/git-rev.ts`, `sdk/src/vcs/parse/jj-rev.ts`
- **Verification:** `cd sdk && pnpm build` succeeds (full TS + CJS build).
- **Committed in:** `c0207eb3` (Task 2 commit — landed with the rest of the translator updates)

**3. [Plan-error documented, not auto-fixed] Verify regex in Task 2 mismatches factory syntax**
- **Found during:** Task 2 verification phase
- **Issue:** The plan's `<automated>` verification block contains `grep -cE "(children|parents):\s*\(rev:" sdk/src/vcs/expr.ts` with expected count `= 2`. This regex matches property-syntax factory style (`children: (rev: …`), but the existing `expr` factory uses method-shorthand syntax for every factory (`head()`, `parent()`, `range(from, to)`, etc.). The added factories correctly match the existing house style (`children(rev: RevisionExpr)` / `parents(rev: RevisionExpr)`), so the regex returns 0.
- **Assessment:** This is a plan-author oversight, not an implementation defect — both factories exist and are correctly callable. The functional `done` criteria are all met (factories callable; `parseExpr` returns expected shape; translators produce the correct revsets; all 11 new test cases pass).
- **No fix applied:** Following plan house style is correct; rewriting the factories to property-syntax just to match the verify regex would break the existing pattern.
- **Equivalent verify probe that succeeds:** `grep -cE "^\s*(children|parents)\(rev:" sdk/src/vcs/expr.ts` returns 2.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking) + 1 documented plan-author oversight
**Impact on plan:** All auto-fixes necessary for correctness/build. No scope creep. The plan-author oversight does not affect functional success criteria.

## Issues Encountered

None beyond the deviations documented above. Empirical probes passed on first run against jj 0.41.0 with no flakiness across multiple invocations.

## User Setup Required

None — no external service configuration introduced by this plan.

## Next Phase Readiness

- **Plan 06-02:** Foundation is complete. The orphan ancestor walker can now use `expr.children` (jj-only via the adapter selector) and `expr.parents` (both backends) with empirically-confirmed depth-1 semantics. The `.planning/` SHA→change_id rewriter can rely on alphabet disjointness for git-SHA / jj-change_id discrimination.
- **Plan 06-03:** `has_jj` peer signal is wired into both initNewProject and initIngestDocs; greenfield gate has the source data it needs. `vcs.adapter` is a writable config key; `atomicWriteConfig` is exported and callable from any in-tree TypeScript consumer.
- **Plan 06-04:** Inherits the foundation; no direct dependency surface added by 06-01.
- **No blockers introduced.**

## Format-migration tracker (CONTEXT D-19)

Net-new-surfaces line: **this plan introduces ZERO new `.planning/` revision-id-encoding formats.** `06-foundation-probes.md` records `jj --version` and change_id values in test-output context only — those records are intel about jj behavior, not GSD-persisted state.

## Self-Check: PASSED

Verified all claims:
- `sdk/src/query/config-schema.ts` — `grep 'vcs.adapter'` → 1 hit ✓
- `get-shit-done/bin/lib/config-schema.cjs` — `grep 'vcs.adapter'` → 1 hit ✓
- `sdk/src/query/config-mutation.ts` — `grep -E '^export async function atomicWriteConfig'` → 1 hit ✓
- `sdk/src/vcs/expr.ts` — `grep -cE "^\s*(children|parents)\(rev:"` → 2 hits ✓
- `sdk/src/vcs/parse/jj-rev.ts` — `grep -E "children:|parents:"` → both present ✓
- `sdk/src/vcs/parse/git-rev.ts` — `grep -E "children:|parents:"` → both present (children throws, parents translates) ✓
- `sdk/src/query/init-complex.ts` + `sdk/src/query/init.ts` — `grep 'has_jj'` → 1 hit each ✓
- `.planning/intel/06-foundation-probes.md` exists (130+ lines) ✓
- `tests/config-schema-sdk-parity.test.cjs` → 3/3 pass ✓
- `sdk/src/vcs/__tests__/expr.test.ts` → 32 tests pass (21 existing + 11 new) ✓
- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts` → 2/2 pass ✓
- `sdk/src/vcs/__tests__/jj-children-probe.test.ts` → 3/3 pass ✓
- `sdk/src/vcs/__tests__/jj-parents-probe.test.ts` → 3/3 pass ✓
- `cd sdk && pnpm build` → exits 0 ✓
- `node scripts/lint-vcs-no-raw-git.cjs` → 0 violations on 966 files ✓
- Commits `8ed42d75`, `c0207eb3`, `ff3b7e71` exist in `git log --oneline -4` ✓

---
*Phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha*
*Completed: 2026-05-14*
