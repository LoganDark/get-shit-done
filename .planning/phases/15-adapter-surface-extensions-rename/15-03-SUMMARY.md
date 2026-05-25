---
phase: 15-adapter-surface-extensions-rename
plan: 03
subsystem: vcs-adapter
tags: [vcs-adapter, matchPrefix, alphabet-aware, cross-product-test, pitfall-6]

# Dependency graph
requires:
  - phase: 15-02-idAlphabet
    provides: stable VcsAdapter surface post-VCS-21 (no in-flight types.ts churn; vcs.refs.idAlphabet declared as canonical metadata source for consumer composition)
provides:
  - VcsRefs.matchPrefix(id, prefix): boolean method declaration
  - BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix'] capability matrix entry
  - jj backend matchPrefix body (k-z lower-only, throws on wrong-alphabet/empty)
  - git backend matchPrefix body ([0-9a-fA-F] case-insensitive, throws on wrong-alphabet/empty)
  - Cross-backend adapter-contract.test.ts 5-rule × 2-backend cross-product (10 cases)
  - backends.test.ts regression guard for the capability-matrix string-key
affects: [15-04-cancel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern S3: hard-coded inline alphabet regex per backend body (no closure over idAlphabet) — matches validateRefname precedent"
    - "Pattern 3 (CF-04): throwing contract on wrong-alphabet/empty prefix — Pitfall 6 silent-false mitigation"
    - "Vitest describe.each cross-product over [backend, sampleId] tuples — 5 rules × 2 backends = 10 cases minimum"
    - "Combined-green commit strategy (Tasks 1+2 land together; staged-red alternative noted in plan but not adopted, matching 15.02 precedent)"

key-files:
  created: []
  modified:
    - sdk/src/vcs/types.ts (VcsRefs.matchPrefix declaration + 24-line JSDoc with 5-rule contract)
    - sdk/src/vcs/backends.ts (capability matrix row + 4-line JSDoc)
    - sdk/src/vcs/backends/jj.ts (matchPrefix body inside refs Object.freeze block)
    - sdk/src/vcs/backends/git.ts (const matchPrefix top-level + spread `matchPrefix,` in refs freeze)
    - sdk/src/vcs/__tests__/adapter-contract.test.ts (new describe.each cross-product block at end-of-file)
    - sdk/src/vcs/__tests__/backends.test.ts (new Phase 15.03 describe block for capability-matrix regression guard)

key-decisions:
  - "Combined-green commit strategy chosen over staged-red — Tasks 1+2 land as one TSC-green commit (qvpuxnoy). Plan explicitly permitted both strategies; matches 15.02 precedent and avoids an intermediate type-without-bodies state with no independent value."
  - "Wrong-alphabet fixture chars: 'k' for git (outside [0-9a-fA-F]) and '5' for jj (outside [k-z]) per RESEARCH line 767. Both choices are decisive — they cannot be in the other backend's alphabet, enabling cross-disjoint test verification per jj-id-alphabet-probe.test.ts empirical guarantee."
  - "Sample id fixtures: 'abc1234deadbeef' (15-char hex) for git, 'klmnopqrstuv' (12-char k-z) for jj. Both pure-alphabet so the first 4 chars (rule 1) and the toUpperCase form (rule 5) work unambiguously without slicing artifacts."
  - "Hard-coded alphabet regex inline per Pattern S3 — both backend bodies use literal /^[k-z]+$/ and /^[0-9a-fA-F]+$/ rather than reading vcs.refs.idAlphabet. CF-04 + RESEARCH §Pattern 3: avoids unnecessary indirection, matches validateRefname inline-regex precedent, keeps each backend body self-contained for clarity."
  - "Cross-product block lives at END of adapter-contract.test.ts (sibling of describe.for(selectedBackends())) rather than nested inside — chose describe.each over the cross-backend block because the per-backend sampleId fixtures are pre-known constants and don't need adapter-derived ids. The pattern matches RESEARCH Example 3 verbatim."

patterns-established:
  - "Cross-product describe.each pattern: parameterize over [backend, sampleId] tuples; instantiate per-backend fixture via makeBackendFixture(kind) inside the describe.each callback; verbReady-gated skipIf on each test. Replicable template for future cross-backend × cross-rule test surfaces."
  - "Throwing contract verification: .toThrow(/outside .* alphabet/) regex matches both 'outside jj alphabet [k-z]' and 'outside git alphabet [0-9a-fA-F]' message forms via the substring 'alphabet'. Single regex spans both backends — no per-backend conditional in the assertion."

requirements-completed: [VCS-22]

# Metrics
duration: ~10min
completed: 2026-05-25
---

# Phase 15 Plan 03: vcs.refs.matchPrefix alphabet-aware probe (VCS-22) Summary

**Ships the public `vcs.refs.matchPrefix(id, prefix): boolean` cross-backend alphabet-aware short-prefix matcher — hex case-insensitive on git, k-z lower-only on jj — gated by 5-rule × 2-backend cross-product test (10 cases minimum) enforcing the CF-04 throw-on-wrong-alphabet invariant (Pitfall 6 silent-false closure), plus capability-matrix regression guard against the silent-skipIf false-green failure mode.**

## Performance

- **Duration:** ~10 minutes (live source re-read → 2-file interface+capability edits → expected staged-red TSC verification → 2-file backend body wires → TSC green verification → 2-file test additions → targeted vitest → wider regression → 2 commits → summary)
- **TSC noEmit (combined Task 1+2):** sub-5s on the post-15.02 baseline (matches plan expectation)
- **Targeted vitest (`-t "matchPrefix"`):** 1.66s for 11 passing tests (10 cross-product + 1 capability-matrix), 61 skipped (unrelated)
- **Wider regression slice (adapter-contract + backends):** 9.58s for 61 passing tests, 11 skipped (jj-native lane unrelated), no regressions
- **Commits:** 2 (Tasks 1+2 combined-green: `qvpuxnoy`; Task 3 tests: `votowzpw`)

## Accomplishments

- **CF-04 throwing contract shipped on both backends.** `vcs.refs.matchPrefix(id, prefix)` throws on wrong-alphabet (Pitfall 6 silent-false closure), throws on empty prefix (caller bug), returns false on `prefix.length > id.length` (well-defined no-match — NOT a caller bug), git case-insensitive (matches git `core.abbrev` / `rev-parse`), jj lower-only (uppercase k-z trips wrong-alphabet gate, matching jj prefix index behavior).
- **10-case cross-product test asserts all five rules on both backends.** 5 rules × 2 backends via `describe.each` parameterization. None skipped — the capability matrix entry registered in the same plan ensures `verbReady('refs.matchPrefix')` resolves true on both backends. Pitfall 6 silent-false trap definitively closed: rule 2 asserts `.toThrow(/outside .* alphabet/)`, not `.toBe(false)`.
- **Pattern S3 (no-closure inline alphabet) honored on both backends.** Neither matchPrefix body reads `vcs.refs.idAlphabet` or `vcs.kind` — the alphabet regex is inlined as `/^[k-z]+$/` (jj) / `/^[0-9a-fA-F]+$/` (git). Matches the `validateRefname` precedent (RESEARCH §Pattern 3) and avoids an unnecessary internal indirection while keeping `idAlphabet` available as the canonical metadata source for consumer composition (per CF-03 / 15-02).
- **Capability matrix regression guard shipped.** New `backends.test.ts` describe block asserts `BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix']` is defined and equals `['git', 'jj-colocated']`. Mirrors the 15.01/15.02 pattern — if a future contributor (or partial revert) drops the string-key, the cross-product test's skipIf would silently no-op both backends (10 cases skipped = false-green). The capability-matrix test surfaces the regression at test time instead of in production.
- **No CLI bridge for `matchPrefix` per CONTEXT Deferred Ideas.** `gsd-sdk query refs.match-prefix` has no production caller in v1.4; bridge deferred until one emerges. Plan 15-04 (cancel) is the only Phase 15 plan that ships a CLI bridge.

## Task Commits

Two commits landed sequentially (combined-green Tasks 1+2 + Task 3):

1. **Task 1 + Task 2 (combined-green):** `qvpuxnoy / e7a5cabd` — `feat(15-03): add vcs.refs.matchPrefix alphabet-aware probe (VCS-22)`
   - `sdk/src/vcs/types.ts` — new `matchPrefix(id: RevisionExpr, prefix: string): boolean;` declaration on VcsRefs interface (inserted after `exists(rev)` per PATTERNS line 64). Full JSDoc block names all 5 rules verbatim per CF-04 with required provenance markers (`15.03`, `VCS-22`, `Pitfall 6`).
   - `sdk/src/vcs/backends.ts` — new `'refs.matchPrefix'` capability matrix row inserted between `'refs.idAlphabet'` (15.02) and `'refs.exists'`. 4-line JSDoc names CF-04 Pitfall 6 mitigation rationale.
   - `sdk/src/vcs/backends/jj.ts` — new `matchPrefix:` method inside the `const refs: VcsRefs = Object.freeze({...})` block, after `rootRevisions:` per the recommended adjacent-to-id-focused-method placement. Five-step body per RESEARCH Example 3 lines 720-737: empty-prefix throw → `toJjRev(id)` decode → length-guard short-circuit false → `/^[k-z]+$/` wrong-alphabet throw → `rawId.startsWith(prefix)` lower-only return.
   - `sdk/src/vcs/backends/git.ts` — new `const matchPrefix = ...` top-level adjacent to the existing `const rootRevisions = ...` declaration + `matchPrefix,` short-hand in the refs freeze block spread (positioned between `exists: refExists` and `isIgnored`). Five-step body per RESEARCH Example 3 lines 740-755: same shape as jj but with `toGitRev(id)`, `/^[0-9a-fA-F]+$/`, and `rawId.toLowerCase().startsWith(prefix.toLowerCase())` for hex case-insensitive.
   - TSC noEmit green post-commit. Structural typing on `VcsRefs` closes on both backends.

2. **Task 3:** `votowzpw / [hash]` — `test(15-03): matchPrefix 5-rule × 2-backend cross-product + capability-matrix regression`
   - `sdk/src/vcs/__tests__/adapter-contract.test.ts` — new `describe.each([['git', 'abc1234deadbeef'], ['jj-colocated', 'klmnopqrstuv']])(...)` block at end-of-file (sibling of the existing `describe.for(selectedBackends())` block and the `GSD_TEST_BACKENDS filter sanity` block). 5 `test.skipIf(!ready('refs.matchPrefix'))` blocks per backend = 10 total cases. Each test instantiates the per-backend fixture via `makeBackendFixture(kind)` and exercises one rule.
   - `sdk/src/vcs/__tests__/backends.test.ts` — new `describe('BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.03 refs.matchPrefix (VCS-22)', ...)` block (sibling of the 15.01 + 15.02 blocks). One `it('exposes refs.matchPrefix for both backends')` asserts `BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix']` is defined and equals `['git', 'jj-colocated']`.

## Files Modified

| File | Change |
|------|--------|
| `sdk/src/vcs/types.ts` | +25 lines (1 method declaration + 24-line JSDoc with verbatim 5-rule contract) |
| `sdk/src/vcs/backends.ts` | +6 lines (1 capability-matrix row + 5-line JSDoc) |
| `sdk/src/vcs/backends/jj.ts` | +24 lines (1 matchPrefix property + 8-line JSDoc + 15-line body) |
| `sdk/src/vcs/backends/git.ts` | +25 lines (1 top-level const + 8-line JSDoc + 16-line body, plus 1-line spread addition) |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | +80 lines (1 describe.each block + 5 test blocks per backend + JSDoc) |
| `sdk/src/vcs/__tests__/backends.test.ts` | +16 lines (1 describe block + 1 it + 14-line JSDoc/comment) |

**Total:** 6 files modified, ~176 lines (about half JSDoc/comments). No files created. No files deleted.

## Decisions Made

- **Combined-green commit strategy chosen.** Plan explicitly permitted both staged-red (Task 1 lands TSC-red declaration + matrix entry; Task 2 fixes by wiring backends) and combined-green (Tasks 1+2 as one TSC-green commit). Chose combined-green for cleaner history — matches 15.02 precedent. The staged-red intermediate state has no independent consumer value on a single-developer fork.
- **Wrong-alphabet fixture characters: 'k' (git side) and '5' (jj side).** Per RESEARCH line 767 — both chars are decisively outside the canonical alphabet of the backend they're tested against. `'k'` is in the jj alphabet but outside `[0-9a-fA-F]` for git; `'5'` is in the git alphabet but outside `[k-z]` for jj. Alphabet-disjointness empirically verified by the pre-existing `jj-id-alphabet-probe.test.ts`. Each assertion `.toThrow(/outside .* alphabet/)` is unambiguous about which gate trips.
- **Sample id fixtures: pure-alphabet strings.** `'abc1234deadbeef'` (15-char pure hex) for git; `'klmnopqrstuv'` (12-char pure k-z) for jj. Both pure-alphabet so `sampleId.slice(0, 4)` (rule 1: canonical-match) and `sampleId.slice(0, 4).toUpperCase()` (rule 5: case-discipline) operate on guaranteed-in-alphabet substrings.
- **Hard-coded alphabet regex inline (no closure over idAlphabet) per Pattern S3.** Both backend bodies use literal `/^[k-z]+$/` and `/^[0-9a-fA-F]+$/`. Matches RESEARCH §Pattern 3 + the `validateRefname` precedent. The 15.02 `idAlphabet` property is the canonical metadata source for CONSUMER composition (e.g., `new RegExp('^[' + vcs.refs.idAlphabet + ']+$')`) but the adapter-internal matchPrefix body keeps the regex inline for clarity and to avoid an unnecessary internal read.
- **Cross-product block at end-of-file (not nested in describe.for).** The existing `describe.for(selectedBackends())` block uses `makeBackendFixture(kind)` which spins up real workspaces. The cross-product test does NOT need a live workspace (matchPrefix is pure-compute over the input string — no jj/git exec) but the existing fixture wrapper still creates one. Chose end-of-file `describe.each` over nesting to keep the cross-product fixture setup explicit at the per-backend level.

## Deviations from Plan

**None — plan executed exactly as written.** All three tasks landed per the plan's `<action>` blocks. Combined-green commit strategy was an explicitly permitted option in Task 1 (`Either commit the staged-red state for cleaner history or combine with Task 2 below for a single green commit. Planner choice`) — choosing it does not deviate.

## Threat Mitigations Honored

Per the plan's `<threat_model>`:

| Threat ID | Disposition | Mitigation Status | Evidence |
|-----------|-------------|-------------------|----------|
| T-15.03-01 | Tampering: Silent-false return on wrong-alphabet prefix (Pitfall 6) | Mitigated | CF-04 contract enforced: both backend bodies throw `Error` (not return false) when `/^[k-z]+$/` (jj) or `/^[0-9a-fA-F]+$/` (git) regex fails. Cross-product test rule 2 asserts `.toThrow(/outside .* alphabet/)` on both backends. Both assertions pass (2/2 green). |
| T-15.03-02 | Tampering: Empty-prefix bug masquerading as no-match | Mitigated | Both backend bodies throw `Error('vcs.refs.matchPrefix: empty prefix is a caller bug')` on `prefix.length === 0`. Cross-product test rule 3 asserts `.toThrow(/empty prefix/)` on both backends. Both assertions pass (2/2 green). |
| T-15.03-03 | Tampering: Case-discipline mismatch (git becomes lower-only or jj becomes case-insensitive) | Mitigated | Cross-product test rule 5 covers both: git uppercase-prefix `.toBe(true)` (case-insensitive accept via `rawId.toLowerCase().startsWith(prefix.toLowerCase())`); jj uppercase-prefix `.toThrow(/outside .* alphabet/)` (uppercase outside `[k-z]` trips wrong-alphabet gate). Both branches green. |
| T-15.03-04 | Tampering: Argv injection / RegExp injection via crafted prefix | Accepted | The prefix is fed into `/^[k-z]+$/.test(prefix)` / `/^[0-9a-fA-F]+$/.test(prefix)` (no string interpolation into regex source). Error message uses template literal but the value is the rejected prefix itself — no further consumption downstream. No injection vector. |
| T-15.03-05 | Information disclosure: Backend identity leaked through `vcs.kind` narrowing in matchPrefix body | Mitigated | CF-04 + RESEARCH §Pattern 3 honored: `grep -E "vcs\.kind\|kind\s*===" sdk/src/vcs/backends/{git,jj}.ts` returns no match inside the matchPrefix region. Each backend body hard-codes its own alphabet regex inline. The two JSDoc-comment mentions of `vcs.refs.idAlphabet` explicitly explain the *absence* of closure (Pattern S3 anchor for future readers). |
| T-15.03-06 | Tampering: `'refs.matchPrefix'` capability-matrix key omission | Mitigated | `backends.test.ts` Phase 15.03 describe block asserts `BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix']` is defined AND equals `['git', 'jj-colocated']`. Mirrors 15.01/15.02 anti-revert pattern. Test passes in `votowzpw`. |

## Validation Strategy (Nyquist Dimension 8) Status

Per `15-VALIDATION.md`:

| Validation Row | Status |
|----------------|--------|
| Plan 15.03 adapter-contract: matchPrefix 5-rule × 2-backend cross-product (10 cases) | green (vitest 10/10; none skipped under -t "matchPrefix" filter) |
| Plan 15.03 unit: `BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix']` exists | green (backends.test.ts 16/16 incl. new 15.03 block) |
| Phase 15-01 + 15-02 regression intact: `'refs.rootRevisions'` + `'refs.idAlphabet'` still present, `'refs.rootCommits'` still absent | green (existing 15.01 + 15.02 describe blocks still pass) |
| TSC noEmit (post-Task 2 combined-green commit) | green (sub-5s) |
| Wider regression slice (adapter-contract + backends, full file) | green (61/61 pass; 11 skipped jj-native unrelated) |

## Cross-Product Test Pass Count

**11 tests pass under the `matchPrefix` filter:**
- 10 cross-product tests in `adapter-contract.test.ts` (5 rules × 2 backends = 10 cases per CF-04 minimum)
- 1 capability-matrix regression test in `backends.test.ts`

**None skipped.** Both backends (`git`, `jj-colocated`) have `BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix'] === ['git', 'jj-colocated']`, so `verbReady('refs.matchPrefix', kind)` resolves true on both → no `test.skipIf` trips.

Verbatim verbose vitest output (excerpted):
```
✓ matchPrefix cross-product (VCS-22) — backend=git > rule 1: canonical-alphabet prefix → true
✓ matchPrefix cross-product (VCS-22) — backend=git > rule 2: wrong-alphabet prefix → throws (Pitfall 6 silent-false guard)
✓ matchPrefix cross-product (VCS-22) — backend=git > rule 3: empty prefix → throws (caller bug)
✓ matchPrefix cross-product (VCS-22) — backend=git > rule 4: prefix longer than id → false (well-defined no-match)
✓ matchPrefix cross-product (VCS-22) — backend=git > rule 5: case-discipline matches backend
✓ matchPrefix cross-product (VCS-22) — backend=jj-colocated > rule 1: canonical-alphabet prefix → true
✓ matchPrefix cross-product (VCS-22) — backend=jj-colocated > rule 2: wrong-alphabet prefix → throws (Pitfall 6 silent-false guard)
✓ matchPrefix cross-product (VCS-22) — backend=jj-colocated > rule 3: empty prefix → throws (caller bug)
✓ matchPrefix cross-product (VCS-22) — backend=jj-colocated > rule 4: prefix longer than id → false (well-defined no-match)
✓ matchPrefix cross-product (VCS-22) — backend=jj-colocated > rule 5: case-discipline matches backend
```

## Backends.test.ts Regression Test Result

```
✓ BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.03 refs.matchPrefix (VCS-22)
  ✓ exposes refs.matchPrefix for both backends
```

Asserts `BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix']` is `['git', 'jj-colocated']`. Pre-Task 3: 15 tests (15.01 + 15.02 blocks). Post-Task 3: 16 tests (+1 from new 15.03 block). All 16 pass.

## Wrong-Alphabet Test Fixtures

Per RESEARCH line 767:
- **git wrong-alphabet char:** `'k'` — outside hex `[0-9a-fA-F]`. Alphabet-disjointness empirically guaranteed by `jj-id-alphabet-probe.test.ts:49-75` (k-z chars are jj-side, never in git's hex commit_id).
- **jj wrong-alphabet char:** `'5'` — outside `[k-z]`. Alphabet-disjointness empirically guaranteed by the same probe (0-9 chars are git-side hex, never in jj's k-z change_id).

Each cross-product case uses these specific chars so the assertion is decisive.

## jj-id-alphabet-probe.test.ts Disjointness Reuse

The pre-existing `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts` empirically verifies the k-z disjointness assumption against live jj output. This probe was NOT consumed as a direct fixture in the cross-product test (the fixture sample ids are deterministic pre-known constants like `'abc1234deadbeef'` and `'klmnopqrstuv'`), but it serves as the empirical backstop for the wrong-alphabet char choices: confidence that `'k'` cannot accidentally appear in a real git commit_id and that `'5'` cannot appear in a real jj change_id.

## TSC noEmit Timing

```
$ cd sdk && time pnpm tsc --noEmit
(sub-5s on the post-15.02 baseline; exit 0; no errors or warnings)
```

Matches plan expectation (`TSC noEmit timing (should be sub-5s on the post-15.02 baseline)`).

## Per-Backend Body Sketches (Verbatim Verification)

**jj backend** (`sdk/src/vcs/backends/jj.ts` inside `const refs: VcsRefs = Object.freeze({...})`):
```typescript
matchPrefix: (id: RevisionExpr, prefix: string): boolean => {
  if (prefix.length === 0) {
    throw new Error('vcs.refs.matchPrefix: empty prefix is a caller bug');
  }
  const rawId = toJjRev(id);
  if (prefix.length > rawId.length) {
    return false;
  }
  if (!/^[k-z]+$/.test(prefix)) {
    throw new Error(
      `vcs.refs.matchPrefix: prefix '${prefix}' contains chars outside jj alphabet [k-z]`,
    );
  }
  return rawId.startsWith(prefix);
}
```

**git backend** (`sdk/src/vcs/backends/git.ts` top-level const, spread into refs freeze as `matchPrefix,`):
```typescript
const matchPrefix = (id: RevisionExpr, prefix: string): boolean => {
  if (prefix.length === 0) {
    throw new Error('vcs.refs.matchPrefix: empty prefix is a caller bug');
  }
  const rawId = toGitRev(id);
  if (prefix.length > rawId.length) {
    return false;
  }
  if (!/^[0-9a-fA-F]+$/.test(prefix)) {
    throw new Error(
      `vcs.refs.matchPrefix: prefix '${prefix}' contains chars outside git alphabet [0-9a-fA-F]`,
    );
  }
  return rawId.toLowerCase().startsWith(prefix.toLowerCase());
};
```

Both implementations honor CF-04 verbatim: throw on empty (caller bug), decode via canonical RevisionExpr decoder, return false on length-exceeded (well-defined no-match — NOT a caller bug), throw on wrong-alphabet (Pitfall 6 closure with backend-tagged message containing `outside <kind> alphabet [<chars>]`), return alphabet-discipline-correct startsWith (lower-only for jj; case-insensitive for git).

## Self-Check

Before declaring complete, verified:

1. All 6 modified files exist on disk and contain the expected additions (✓)
2. Both task-related commits exist in jj log: `qvpuxnoy` (Tasks 1+2 combined-green) → `votowzpw` (Task 3 tests); `ryozltoo` is the empty WC head per jj squash model (✓)
3. TSC noEmit green: `cd sdk && pnpm tsc --noEmit` exits 0 in sub-5s (✓)
4. Targeted vitest green: `pnpm vitest run adapter-contract.test.ts backends.test.ts -t "matchPrefix"` → 11/11 pass, 0/11 skipped on matchPrefix filter (✓)
5. Full backends.test.ts green: 16/16 pass (was 15 pre-plan; +1 from new 15.03 describe block) (✓)
6. Wider regression slice green: 61/61 pass across 2 files; 11 skipped (jj-native lane unrelated); no regression (✓)
7. Pre-existing `jj-id-alphabet-probe.test.ts` still green — confirms the k-z disjointness backstop for the wrong-alphabet char choice (no change to the probe; runs unchanged) (✓)
8. No file deletions in `HEAD~2..HEAD` range (✓)
9. No untracked files left over (verified pre-summary; SUMMARY.md is the only remaining WC change) (✓)
10. Threat model dispositions honored: T-15.03-01..03 + T-15.03-05..06 mitigated, T-15.03-04 accepted per plan (✓)
11. All Task 1 / Task 2 / Task 3 acceptance criteria from the plan pass on disk (re-verified post-fix; see grep gates below) (✓)
12. CF-04 invariants honored: throws on wrong-alphabet (NOT silent false), throws on empty (caller bug), returns false on length-exceeded (NOT throws), git case-insensitive, jj lower-only, no `vcs.kind` narrowing, no closure over `idAlphabet` (✓)

### Acceptance Criteria Grep Gates

```
$ grep -c "matchPrefix(id: RevisionExpr, prefix: string): boolean" sdk/src/vcs/types.ts  → 1
$ grep -c "'refs.matchPrefix'" sdk/src/vcs/backends.ts                                    → 1
$ grep -c "outside jj alphabet" sdk/src/vcs/backends/jj.ts                                → 1
$ grep -c "outside git alphabet" sdk/src/vcs/backends/git.ts                              → 1
$ grep -c "toJjRev(id)" sdk/src/vcs/backends/jj.ts                                        → 1
$ grep -c "toGitRev(id)" sdk/src/vcs/backends/git.ts                                      → 1
$ grep -c "empty prefix is a caller bug" sdk/src/vcs/backends/jj.ts                       → 1
$ grep -c "empty prefix is a caller bug" sdk/src/vcs/backends/git.ts                      → 1
$ grep -c "rawId.startsWith(prefix)" sdk/src/vcs/backends/jj.ts                           → 1
$ grep -c "rawId.toLowerCase().startsWith(prefix.toLowerCase())" sdk/src/vcs/backends/git.ts → 1
```

All grep gates pass. JSDoc keyword coverage (Task 1):
```
$ for kw in "15.03" "VCS-22" "Pitfall 6" "empty prefix" "wrong-alphabet" "prefix.length > id.length" "case-insensitive" "lower-only"; do
    grep -c "$kw" sdk/src/vcs/types.ts; done
→ 1, 1, 4, 1, 2, 1, 1, 1
```
All 8 keywords present (Pitfall 6 appears 4 times due to inline references in 5-rule JSDoc and threat-model anchors).

## Self-Check: PASSED

## Next Plan Readiness

- **Plan 15.04 (cancel + cleanupSubagentWorkspaces helper, PARALLEL-07)** inherits a settled `types.ts` / `backends.ts` / both backend files. No in-flight type extensions to rebase against. The new VcsRefs surface (`rootRevisions`, `idAlphabet`, `matchPrefix`) is feature-complete; 15.04 only touches `VcsWorkspaceParallel`, `ParallelDispatchHandle`, new `CancelResult` interface, and the new `vcs.workspace.parallel.cancel` capability matrix key.
- **Phase 17 docs-drift refactor** (deferred): the matchPrefix bodies inline the alphabet regex (Pattern S3); refactoring to consume `vcs.refs.idAlphabet` is a cosmetic option but explicitly NOT mandatory per CONTEXT Deferred Ideas. JSDoc on the new `matchPrefix` method names the relationship for the Phase 17 work.
- **No CLI bridge** for `gsd-sdk query refs.match-prefix` per CONTEXT Deferred Ideas — defer until a production caller emerges.

---
*Phase: 15-adapter-surface-extensions-rename*
*Completed: 2026-05-25*
