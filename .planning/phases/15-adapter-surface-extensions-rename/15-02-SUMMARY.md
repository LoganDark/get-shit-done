---
phase: 15-adapter-surface-extensions-rename
plan: 02
subsystem: vcs-adapter
tags: [vcs-adapter, introspection, alphabet, refs-namespace]

# Dependency graph
requires:
  - phase: 15-01-rootCommits-rename
    provides: clean `rootRevisions`-only namespace on VcsRefs / backends.ts / both backend bodies (no in-flight rename churn)
provides:
  - VcsRefs.idAlphabet readonly string property (opaque per CF-03)
  - BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet'] capability matrix entry
  - jj backend wire-in returning literal 'k-z'
  - git backend wire-in returning literal '0-9a-f'
  - Cross-backend adapter-contract.test.ts assertion (skipIf-guarded)
  - backends.test.ts regression guard for the capability-matrix string-key
affects: [15-03-matchPrefix]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opaque-string introspection (CF-03) — no structured {kind,chars,minLen,maxLen} alternative; consumers compose regex"
    - "Capability matrix string-key add (Pitfall 3 / Pitfall 1) — TSC blind; backends.test.ts regression-asserts"
    - "Combined-green commit strategy (Task 1 + 2 land together; deferred-red alternative noted in plan but not adopted)"

key-files:
  created: []
  modified:
    - sdk/src/vcs/types.ts (VcsRefs interface — 1 property + JSDoc block)
    - sdk/src/vcs/backends.ts (capability matrix — 1 string-key row + JSDoc)
    - sdk/src/vcs/backends/jj.ts (refs Object.freeze — 1 literal property)
    - sdk/src/vcs/backends/git.ts (refs Object.freeze — 1 literal property)
    - sdk/src/vcs/__tests__/adapter-contract.test.ts (1 test inside describe.for(selectedBackends()))
    - sdk/src/vcs/__tests__/backends.test.ts (1 new describe block for 15.02)

key-decisions:
  - "Combined-green commit strategy chosen over staged-red — Tasks 1+2 land as one TSC-green commit (kxvtlvnr). Plan permitted both strategies."
  - "JSDoc explicitly frames idAlphabet as opaque-string per CF-03; rejected structured-widening (FEATURES.md alternative) mentioned by name to deter re-litigation."
  - "Capability-matrix row inserted adjacent to refs.rootRevisions (just-renamed cluster) rather than at end of refs.* block — keeps related verbs co-located for future readers."

patterns-established:
  - "JSDoc on the VcsRefs property names downstream consumers (expr.ts:41, format-migration/rewrite.ts:53,63) explicitly so the Phase 17 docs-drift refactor has a forward-link anchor."
  - "Cross-backend describe.for(selectedBackends()) test gated by ready('refs.idAlphabet') skipIf — the skipIf depends on the capability matrix entry, so the backends.test.ts regression guard is load-bearing (silently-skipped-on-both-backends false-green failure mode)."

requirements-completed: [VCS-21]

# Metrics
duration: ~5min
completed: 2026-05-25
---

# Phase 15 Plan 02: vcs.refs.idAlphabet introspection (VCS-21) Summary

**Adds the `vcs.refs.idAlphabet` cross-backend introspection property — opaque-string `'0-9a-f'` on git, `'k-z'` on jj — wired via interface declaration + capability-matrix row + two literal-string backend additions, gated by a cross-backend adapter-contract test and a backends.test.ts capability-matrix regression guard.**

## Performance

- **Duration:** ~10 minutes (planning re-read → 4-file edits → TSC verify → 2-file test edits → targeted vitest → 2 commits → wider regression check → summary → self-check trip → Rule-1 fix → final commit)
- **TSC noEmit:** sub-5s on the post-15.01 baseline (matches plan expectation)
- **Targeted vitest (`-t "idAlphabet"`):** 1.0s for 3 passing tests
- **Wider regression slice (adapter-contract + backends + jj-id-alphabet-probe):** 9.2s for 52 passing tests, no regressions
- **Commits:** 3 (Tasks 1+2 combined-green + Task 3 + Rule-1 acceptance-criterion fix)

## Accomplishments

- **Opaque-string introspection shipped on both backends:** `vcs.refs.idAlphabet === '0-9a-f'` (git) / `=== 'k-z'` (jj). CF-03 honored — no structured widening; consumers compose `new RegExp('^[' + vcs.refs.idAlphabet + ']+$')` themselves.
- **Capability matrix string-key registered:** `BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet'] = Object.freeze(['git', 'jj-colocated'] as const)` — adjacent to the just-renamed `'refs.rootRevisions'` cluster, with JSDoc explaining the Pitfall 3 backends.test.ts regression-guard rationale.
- **Cross-backend adapter-contract test added:** `vcs.refs.idAlphabet returns expected per-backend literal` inside the existing `describe.for(selectedBackends())` block at adapter-contract.test.ts. Uses `test.skipIf(!ready('refs.idAlphabet'))` so a future capability-matrix omission would silently no-op (caught by the regression guard below).
- **backends.test.ts regression guard added:** New `describe('BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.02 refs.idAlphabet (VCS-21)', ...)` block asserts the string-key presence and exact value — the only line of defense against the silent-skipIf false-green failure mode (Pitfall 3 / Pitfall 1).
- **No deferred-refactor scope creep:** the three existing alphabet-regex consumers (`expr.ts:41`, `format-migration/rewrite.ts:53`, `format-migration/rewrite.ts:63`) remain UNTOUCHED per CONTEXT Deferred Ideas — Phase 17 docs-drift or later.

## Task Commits

Three commits landed sequentially (combined-green strategy + one Rule-1 fix):

1. **Task 1 + Task 2 (combined-green):** `kxvtlvnr / 5beabf0` — `feat(15-02): add vcs.refs.idAlphabet introspection (VCS-21)`
   - `sdk/src/vcs/types.ts` — new `readonly idAlphabet: string` slot on `VcsRefs` with JSDoc block naming the CF-03 opaque-string contract + the three downstream-consumer anchors + the regex-composition example.
   - `sdk/src/vcs/backends.ts` — new `'refs.idAlphabet'` capability matrix row adjacent to `'refs.rootRevisions'`.
   - `sdk/src/vcs/backends/jj.ts` — new `idAlphabet: 'k-z',` property inside `const refs: VcsRefs = Object.freeze({...})` (sibling of `head`/`parent`/`bookmarks`).
   - `sdk/src/vcs/backends/git.ts` — new `idAlphabet: '0-9a-f',` property inside `const refs = Object.freeze({...})` (sibling of `head`/`parent`/`bookmarks`).
   - TSC noEmit green post-commit (structural typing closes on both backends).

2. **Task 3:** `nonqpols / 03cdaf4` — `test(15-02): cross-backend idAlphabet contract + capability-matrix regression`
   - `sdk/src/vcs/__tests__/adapter-contract.test.ts` — new `test.skipIf(!ready('refs.idAlphabet'))(...)` block inside the existing `describe.for(selectedBackends())` (after the `vcs.kind matches backend kind` test).
   - `sdk/src/vcs/__tests__/backends.test.ts` — new `describe('BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.02 refs.idAlphabet (VCS-21)', ...)` block with one `it('exposes refs.idAlphabet for both backends')` assertion.

3. **Rule-1 fix:** `rqnuqtkp / e251bee` — `fix(15-02): remove acceptance-criterion-tripping single-quote in comment`
   - `sdk/src/vcs/backends.ts` — comment-only edit. The JSDoc on the new `refs.idAlphabet` matrix row referenced `BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet']` with the same single-quote form, causing `grep -c "'refs.idAlphabet'"` to return 2 (the comment + the key) instead of the plan-specified 1. Reworded the comment to drop the quoted-key reference. TSC green. No behavior change. See Deviations.

## Files Modified

| File | Change |
|------|--------|
| `sdk/src/vcs/types.ts` | +9 lines (1 property declaration + 8 JSDoc lines) |
| `sdk/src/vcs/backends.ts` | +7 lines (1 capability-matrix row + 6 JSDoc lines) |
| `sdk/src/vcs/backends/jj.ts` | +5 lines (1 literal property + 4 JSDoc lines) |
| `sdk/src/vcs/backends/git.ts` | +5 lines (1 literal property + 4 JSDoc lines) |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | +9 lines (1 test + 8 JSDoc lines) |
| `sdk/src/vcs/__tests__/backends.test.ts` | +18 lines (1 describe block + 1 it + 16 JSDoc/comment lines) |

**Total:** 6 files modified, +53 lines (mostly JSDoc/comments — actual code surface is 6 declarations + 2 tests). No files created. No files deleted. No `dist-cjs/` regenerated (not needed for additive interface + body wire-ins; Plan 15-01's regen covered the rename and downstream plans inherit the live `src/`).

## Decisions Made

- **Combined-green commit strategy chosen.** Plan explicitly permitted either staged-red (Task 1 lands a TSC-red interface declaration; Task 2 fixes by wiring backends) or combined-green (Task 1+2 land as one TSC-green commit). Chose combined-green for cleaner history — the rebase risk on a single-developer fork is zero, and the staged-red commit had no independent value (it would have been a "type added, not wired yet" intermediate state that nothing consumes).
- **CF-03 wording in JSDoc.** The `VcsRefs.idAlphabet` JSDoc explicitly names the rejected structured-widening alternative (`{kind,chars,minLen,maxLen}`) so future readers cannot re-litigate without first reading why it was rejected. Acceptance criteria specifically required this anti-pattern naming.
- **Capability-matrix insertion site.** Placed `'refs.idAlphabet'` immediately after `'refs.rootRevisions'` (just-renamed in 15-01), creating a logical cluster for the verbs that ship in this phase rather than appending to the end of the `refs.*` block. Plan permitted "around lines 76-82"; this is the tightest sibling-grouping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment in `backends.ts` tripped the `grep -c "'refs.idAlphabet'"` acceptance criterion**

- **Found during:** Self-check verification grep after Task 3 commit landed.
- **Issue:** The JSDoc comment I wrote on the new `'refs.idAlphabet'` capability matrix row referenced the key as `` `BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet']` `` (backticked single-quoted form). The plan's Task 1 acceptance criterion specifies `grep -c "'refs.idAlphabet'" sdk/src/vcs/backends.ts returns 1` (a uniqueness check meant to catch accidental duplicate matrix rows). The comment + the actual matrix key both match the grep pattern, returning 2 instead of 1 — failing the criterion.
- **Fix:** Reworded the JSDoc comment to drop the explicit quoted-key reference. The comment is still informative ("Capability matrix string-key add — TSC does NOT catch object-key omissions on the runtime lookup path; backends.test.ts regression-asserts presence"). The backends.test.ts regression guard added in Task 3 is the load-bearing protection — comment text is not the actual line of defense.
- **Files modified:** `sdk/src/vcs/backends.ts` (1-line comment edit).
- **Verification:** `grep -c "'refs.idAlphabet'" sdk/src/vcs/backends.ts` → 1 (post-fix). `pnpm tsc --noEmit` still green. No behavior change.
- **Committed in:** `rqnuqtkp / e251bee` (separate fix commit; documented above).

**Total deviations:** 1 auto-fixed (Rule 1 — bug; acceptance-criterion grep precision).
**Impact on plan:** None on the contract surface. The fix removes a comment-style choice that accidentally tripped a uniqueness grep — the canonical capability-matrix row count is and was always 1.

## Threat Mitigations Honored

Per the plan's `<threat_model>`:

| Threat ID | Disposition | Mitigation Status | Evidence |
|-----------|-------------|-------------------|----------|
| T-15.02-01 | Tampering: `'refs.idAlphabet'` capability-matrix string-literal key omission | Mitigated | `backends.test.ts` Phase 15.02 describe block asserts `BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet']` is defined AND equals `['git', 'jj-colocated']`. Mirrors Plan 15.01's anti-assertion pattern. Test passes in `nonqpols`. |
| T-15.02-02 | Tampering: per-backend literal string drift (`'0-9A-F'` / `'kz'` / `'a-z'`) | Mitigated | `adapter-contract.test.ts` asserts exact `===` equality with the per-backend literal (`'0-9a-f'` for git, `'k-z'` for jj). Empirical `jj-id-alphabet-probe.test.ts` independently validates the k-z disjointness assumption against live jj output (no change here — pre-existing). Targeted vitest: 3/3 pass. |
| T-15.02-03 | Info disclosure: structured-widening to `{kind,chars,minLen,maxLen}` | Mitigated | JSDoc on `VcsRefs.idAlphabet` explicitly names the rejected alternative and tags it `(YAGNI)`. Grep confirms no `kind`/`minLen`/`maxLen`/`enum` keywords appear within 15 lines of `readonly idAlphabet:` in `types.ts`. CONTEXT Deferred Ideas tracks structured-widening as a future-milestone option only. |
| T-15.02-04 | Tampering: existing alphabet regex consumers drift from new canonical source | Accepted | Refactor explicitly deferred per CONTEXT Deferred Ideas (Phase 17 docs-drift or later). `expr.ts:41`, `format-migration/rewrite.ts:53,63` remain as the de facto canonical consumers until refactor. JSDoc on the new property names the three downstream sites so the Phase 17 work has a forward-link anchor. |

## Validation Strategy (Nyquist Dimension 8) Status

Per `15-VALIDATION.md`:

| Validation Row | Status |
|----------------|--------|
| Plan 15.02 adapter-contract: `vcs.refs.idAlphabet === '0-9a-f'` on git adapter | green (vitest 3/3 incl. capability-matrix; no skipIf-trip) |
| Plan 15.02 adapter-contract: `vcs.refs.idAlphabet === 'k-z'` on jj adapter | green (same suite) |
| Plan 15.02 unit: `BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet']` exists & = `['git', 'jj-colocated']` | green (backends.test.ts 15/15 incl. new 15.02 block) |
| Phase 15-01 regression intact: `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']` still present, `'refs.rootCommits'` still absent | green (existing 15.01 describe block in backends.test.ts still passes) |
| TSC noEmit (post-Task 2) | green (sub-5s) |
| Full adapter-contract.test.ts (cross-backend, 2-lane fixture) | green (35/35 pass; 11 skipped jj-native unrelated) |
| Wider regression slice (adapter-contract + backends + jj-id-alphabet-probe) | green (52/52 pass; 11 skipped jj-native unrelated) |

## Per-Backend Literal Strings Shipped (Verbatim)

- **git adapter** (`sdk/src/vcs/backends/git.ts` inside `const refs = Object.freeze({...})`):
  ```typescript
  idAlphabet: '0-9a-f',
  ```
- **jj adapter** (`sdk/src/vcs/backends/jj.ts` inside `const refs: VcsRefs = Object.freeze({...})`):
  ```typescript
  idAlphabet: 'k-z',
  ```

Both are bare literal strings (no function call, no closure, no compute) per CF-03. Grep confirms no `idAlphabet:\s*(` or `idAlphabet:\s*=>` patterns in either file.

## Self-Check

Before declaring complete, verified:

1. All 6 modified files exist on disk and contain the expected additions (✓)
2. All three task-related commits exist in jj log: `kxvtlvnr` (Task 1+2) → `nonqpols` (Task 3) → `rqnuqtkp` (Rule-1 fix); `ryozlto` is the empty WC head per jj squash model (✓)
3. TSC noEmit green: `cd sdk && pnpm tsc --noEmit` exits 0 in sub-5s (✓)
4. Targeted vitest green: `pnpm vitest run adapter-contract.test.ts backends.test.ts -t "idAlphabet"` → 3 passed, 58 skipped name-filtered (✓)
5. Full adapter-contract.test.ts green: 35 passed, 11 skipped (jj-native lane — unrelated) (✓)
6. Full backends.test.ts green: 15/15 pass (was 13 pre-plan; +2 from new 15.02 describe block) (✓)
7. Wider regression slice green: 52 passed across 3 files, no regression (✓)
8. Pre-existing `jj-id-alphabet-probe.test.ts` still green — confirms the `'k-z'` literal is still empirically correct (✓)
9. No file deletions in `HEAD~3..HEAD` range (✓)
10. No untracked files left over (verified pre-summary; SUMMARY.md is the only remaining WC change) (✓)
11. Threat model dispositions honored: T-15.02-01..03 mitigated, T-15.02-04 accepted per CONTEXT (✓)
12. All Task 1 / Task 2 / Task 3 acceptance criteria from the plan pass on disk (re-verified post-fix; see grep gates below) (✓)

### Acceptance Criteria Grep Gates (post-fix)

```
$ grep -c "readonly idAlphabet:" sdk/src/vcs/types.ts                   → 1   (Task 1 declaration)
$ grep -c "'refs.idAlphabet'" sdk/src/vcs/backends.ts                   → 1   (Task 1 single matrix row — post-fix)
$ grep -c "idAlphabet: 'k-z'" sdk/src/vcs/backends/jj.ts                → 1   (Task 2 jj literal)
$ grep -c "idAlphabet: '0-9a-f'" sdk/src/vcs/backends/git.ts            → 1   (Task 2 git literal)
$ grep -c "idAlphabet" sdk/src/vcs/__tests__/adapter-contract.test.ts   → 4   (Task 3: JSDoc + test name + 2 assertions)
$ grep -c "idAlphabet" sdk/src/vcs/__tests__/backends.test.ts           → 5   (Task 3: describe + JSDoc + it + 2 assertions)
```

## Self-Check: PASSED

## Next Plan Readiness

- **Plan 15.03 (matchPrefix, VCS-22)** inherits the canonical `vcs.refs.idAlphabet` source. Its body can read `this.idAlphabet` (or `idAlphabet` via closure on the freeze block) instead of duplicating the alphabet regex inline — resolves the design pre-work in CF-04 / Open Q from PATTERNS.
- **Plan 15.04 (cancel, PARALLEL-07)** is orthogonal to 15.02; no dependency.
- **Phase 17 docs-drift refactor** (deferred): the three existing alphabet-regex consumers (`expr.ts:41`, `format-migration/rewrite.ts:53,63`) can now consume `vcs.refs.idAlphabet`. JSDoc on the new property names all three sites as forward-link anchors.

---
*Phase: 15-adapter-surface-extensions-rename*
*Completed: 2026-05-25*
