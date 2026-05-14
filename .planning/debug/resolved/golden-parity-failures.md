---
slug: golden-parity-failures
status: resolved
trigger: fix failing tests
created: 2026-05-12T22:15:00Z
updated: 2026-05-13T01:30:00Z
resolution_commit: pxumponwopvsmlmvvlrusyqokxspskwv
---

# Debug Session: golden-parity-failures

## Symptoms

### Expected behavior

`pnpm --filter @gsd-build/sdk exec vitest run --project integration` completes with `success: true` and zero assertion failures. The SDK's JSON output for read-only commands (`roadmap.analyze`, `validate.health`, `state.sync --verify`, `audit-open`, `state.json`) deep-equals the reference output from `gsd-tools.cjs`.

### Actual behavior

5 deterministic assertion failures in the integration suite, all of the same shape: `expect(sdkJson).toEqual(toolsCjsJson)` where the SDK JSON drifts from the legacy CJS reference. Surfaced while running the Phase 03.1 baseline harness (`sdk/scripts/profile-integration.mjs --label baseline`) on 2026-05-12, which trips the D-05c flakiness gate every run.

### Failing assertions (from `sdk/scripts/.tmp/profile-integration/run-1.json`)

| File | Test | Line | Message |
|------|------|------|---------|
| `sdk/src/golden/golden.integration.test.ts` | `roadmap.analyze SDK JSON matches gsd-tools.cjs` | 187 | `expected { milestones: [], …(9) } to deeply equal { milestones: [], …(9) }` |
| `sdk/src/golden/golden.integration.test.ts` | `validate.health SDK JSON matches gsd-tools.cjs` | 535 | `expected { Object (status, errors, …) } to deeply equal { Object (status, errors, …) }` |
| `sdk/src/golden/golden.integration.test.ts` | `state.sync --verify SDK dry-run output matches gsd-tools.cjs` | 623 | `expected { synced: false, …(2) } to deeply equal { synced: false, …(2) }` |
| `sdk/src/golden/read-only-parity.integration.test.ts` | `audit-open golden parity (excluding scanned_at) SDK JSON matches gsd-tools.cjs except volatile scanned_at` | 52 | `expected { has_open_items: true, …(2) } to deeply equal { has_open_items: true, …(2) }` |
| `sdk/src/golden/read-only-parity.integration.test.ts` | `state.json golden parity (excluding last_updated) SDK rebuilt frontmatter matches gsd-tools.cjs except volatile last_updated` | 66 | `expected { gsd_state_version: '1.0', …(6) } to deeply equal { gsd_state_version: '1.0', …(6) }` |

Run-1 totals: 98 total, 89 passed, 5 failed, 4 pending. `success: false`.

### Timeline

- Tests were green at end of Phase 03 (2026-05-11) per Phase 03 phase-close evidence (lint-vcs-no-raw-git 0 violations, skip-count 18 = baseline, phase verifier passed).
- Failures surfaced 2026-05-12 during the first run of the Phase 03.1 baseline harness on `main`.
- All 5 are pre-existing latent drifts: every upstream CJS fix that landed on `get-shit-done/bin/lib/*.cjs` after the corresponding handler was ported to the SDK was NOT mirrored into `sdk/src/query/`. The Phase 03 verifier did not catch them because the parity tests only re-enter the green/red state when *either* side changes — once both sides drifted, the diff persisted invisibly. Phase 03.1's harness (which prints `success:false` machine-readable) is the first surface that re-ran them and exposed the divergence.

### Reproduction

```bash
# Either via the baseline harness (recommended — produces machine-readable JSON):
node sdk/scripts/profile-integration.mjs --label diag
# Output: sdk/scripts/.tmp/profile-integration/run-1.json (success:false on first run)

# Or run only the two failing files directly:
pnpm --filter @gsd-build/sdk exec vitest run \
  sdk/src/golden/golden.integration.test.ts \
  sdk/src/golden/read-only-parity.integration.test.ts

# Or run the fast in-process diagnostic (no vitest):
node sdk/scripts/.tmp/diag-golden-diff.mjs all
```

The 5 failures are deterministic — they reproduce every run (not flaky).

## Current Focus

hypothesis: **REFUTED** — the failures do *not* share a single root cause. They are five independent SDK-vs-CJS drifts where upstream `*.cjs` patches were never ported to the SDK port. The original orchestrator hypothesis ("single drifted field, mechanical fix") is incorrect; the unifying pattern is procedural (SDK port lag), not technical.

confirmed root causes: 4 distinct bugs (drift #3 covers both `state.sync` and `state.json` via the shared progress formula).

next_action: apply 4 targeted SDK patches; re-run the two golden integration files; confirm 5/5 pass; commit with `git`.

## Evidence

- timestamp: 2026-05-12T22:45:00Z
  type: diagnostic-run
  command: `node sdk/scripts/.tmp/diag-golden-diff.mjs all`
  finding: all 5 failures have a clear, identifiable diff once both halves are printed key-by-key. The `.toEqual` "expected X to deeply equal X" message was unhelpful because it only shows top-level summary keys; the actual divergent leaf values are deeper.

- timestamp: 2026-05-12T22:50:00Z
  type: code-comparison
  finding: **Drift #1 — roadmap.analyze missing `mode` field per phase.** `sdk/src/query/roadmap.ts:664-675` (in `roadmapAnalyze`) constructs each phase entry without extracting `**Mode:**`. `get-shit-done/bin/lib/roadmap.cjs:251-263` includes `mode`. The sibling SDK function `searchPhaseInContent` (lines 489-506) DOES extract mode — and was patched specifically to do so in `34033c3f feat(mvp): centralize resolution surfaces + fix SDK roadmap mode parity (#3178)` on 2026-05-06 — but the same fix was not applied to `roadmapAnalyze`. The CJS shows `mode: null` for every phase in our ROADMAP.

- timestamp: 2026-05-12T22:55:00Z
  type: code-comparison
  finding: **Drift #2 — validate.health missing W016 warning.** `sdk/src/query/validate.ts:512-523` only checks for `workflow.nyquist_validation` (W008); `get-shit-done/bin/lib/verify.cjs:764-767` adds an immediately-following check for `workflow.ai_integration_phase` that emits W016. W016 was introduced upstream in `33575ba9 feat: /gsd-ai-integration-phase + /gsd-eval-review (#1971)` and never ported to the SDK. Our repo's `.planning/config.json` lacks `workflow.ai_integration_phase`, so CJS flags it (`repairable_count: 1`) and SDK does not (`repairable_count: 0`).

- timestamp: 2026-05-12T23:00:00Z
  type: code-comparison
  finding: **Drift #3 — progress percent formula divergence (affects state.json AND state.sync).** Both `sdk/src/query/state.ts:151` (`buildStateFrontmatter`) and `sdk/src/query/state-mutation.ts:1467` (`stateSync`) compute progress as `Math.min(100, Math.round(completedPlans / totalPlans * 100))` → 33/37 = 89%. The CJS counterpart (`get-shit-done/bin/lib/state.cjs:31-41` `computeProgressPercent`) uses `min(planFraction, phaseFraction)` so unrealized ROADMAP phases cap the percent → min(33/37, 4/8) = min(89%, 50%) = 50%. This was introduced in `d52f9092 fix(state): preserve curated progress on body-only updates; correct percent formula (#3242)` on 2026-05-08, with prose `Mirrors the logic in buildStateFrontmatter` — but only the CJS was updated.

- timestamp: 2026-05-12T23:05:00Z
  type: code-comparison
  finding: **Drift #4 — audit-open scanUatGaps treats `resolved` as open.** `sdk/src/query/audit-open.ts:320` only filters `if (status === 'complete') continue;`. `get-shit-done/bin/lib/audit.cjs:366,422-423` filters via `TERMINAL_UAT_STATUSES = new Set(['complete', 'resolved'])` AND adds `status === 'unknown' && result === 'all_pass'` as a terminal short-circuit. Introduced upstream in `74b81379 fix(#2836): audit-open quick SUMMARY filename + UAT terminal-status drift (#2847)` on 2026-04-29 — the patch touched ONLY `get-shit-done/bin/lib/audit.cjs`, never `sdk/src/query/audit-open.ts`. Our repo has `.planning/phases/01-…/01-HUMAN-UAT.md` with `status: resolved`, which CJS correctly skips and SDK incorrectly counts.

- timestamp: 2026-05-12T23:10:00Z
  type: history
  finding: All four upstream CJS fixes (#3178, #1971, #3242, #2836) landed on `main` between Apr 29 and May 8 2026. None had a paired SDK update in the same commit. This is the unifying procedural pattern — a known liability of having two source-of-truth implementations until the SDK fully replaces the CJS layer.

## Eliminated

- "Phase 03.1 introduced the regression" — refuted by timeline + commit search. The only Phase 03.1 commit (`nqlxwxsrzwupomqnrouvzosrxnkxxrlo`) added `sdk/scripts/profile-integration.mjs` with zero `sdk/src/**` touches. The harness merely surfaced pre-existing drift.
- "Phase 3 jj VCS-adapter migration corrupted query output" — refuted. None of the four root causes touches `VcsAdapter`, bookmarks, or any VCS surface. The progress formula uses pure disk counts; mode/W016/UAT filters are content parsing only.
- "Stale golden fixtures need regeneration" — refuted. The tests compare *live* SDK output against *live* `gsd-tools.cjs` output (subprocess); there are no on-disk golden fixtures in play for these 5 assertions.
- "Single root cause across all 5 failures" (orchestrator's strongest hypothesis) — refuted by the diagnostic diff. The five failures touch four distinct handlers and four distinct upstream CJS PRs. The unification is procedural (port lag), not technical.

## Resolution

### Root cause summary

Four independent, additive divergences between `sdk/src/query/*.ts` and `get-shit-done/bin/lib/*.cjs`. Each is a known upstream `*.cjs` fix that was not mirrored into the SDK port. None is jj-related; none is Phase 03.1-related.

| # | Handler                      | SDK file                              | Missing CJS fix       |
|---|------------------------------|---------------------------------------|-----------------------|
| 1 | `roadmap.analyze`            | `sdk/src/query/roadmap.ts` ~L664      | Mode extraction in `roadmapAnalyze` (paired with `searchPhaseInContent` in #3178) |
| 2 | `validate.health`            | `sdk/src/query/validate.ts` ~L518     | W016 `workflow.ai_integration_phase` check (#1971) |
| 3 | `state.json` + `state.sync`  | `sdk/src/query/state.ts` ~L148-151 and `sdk/src/query/state-mutation.ts` ~L1467 | `min(planFraction, phaseFraction)` progress formula (#3242) |
| 4 | `audit-open`                 | `sdk/src/query/audit-open.ts` ~L320   | `TERMINAL_UAT_STATUSES = {'complete','resolved'}` + `unknown+all_pass` short-circuit (#2836) |

### Proposed fix

Four targeted, surgical patches to the SDK. No tests need to change — the existing parity tests are correct; they're the ones that revealed the bugs.

**Fix 1 — `sdk/src/query/roadmap.ts` (`roadmapAnalyze`):**
Add `**Mode:**` extraction inside the per-phase loop and include `mode` in the pushed object, immediately after the existing goal extraction. Mirror lines 489-493 of the same file (which already do this for `searchPhaseInContent`).

**Fix 2 — `sdk/src/query/validate.ts` (Check 5b):**
After the existing nyquist check, add a sibling `if (workflow && workflow.ai_integration_phase === undefined)` guarded `addIssue('warning', 'W016', …, true)` and push `'addAiIntegrationPhaseKey'` into `repairs`. Mirror `verify.cjs:764-767`.

**Fix 3 — `sdk/src/query/state.ts` + `sdk/src/query/state-mutation.ts`:**
Replace `Math.min(100, Math.round(completedPlans / totalPlans * 100))` with a shared helper `computeProgressPercent(completedPlans, totalPlans, completedPhases, totalPhases)` that uses `min(planFraction, phaseFraction)`. In `stateSync`, also derive `syncTotalPhases` from `getMilestonePhaseFilter` so the phase denominator matches CJS. Mirror `state.cjs:31-41` and `state.cjs:1600-1626`.

**Fix 4 — `sdk/src/query/audit-open.ts` (`scanUatGaps`):**
Add module-level `const TERMINAL_UAT_STATUSES = new Set(['complete', 'resolved'])`, replace the `if (status === 'complete') continue` line with the same two-pronged check used in CJS (`TERMINAL_UAT_STATUSES.has(status)` AND the `unknown + all_pass` short-circuit), and parse `fm.result` to support the latter. Mirror `audit.cjs:366,416-423`.

### Verification plan

1. Apply fixes 1-4 to the four SDK files.
2. Rebuild: `pnpm --filter @gsd-build/sdk run build`.
3. Re-run diagnostic: `node sdk/scripts/.tmp/diag-golden-diff.mjs all` — expect zero `DIFF` lines.
4. Re-run the two integration files only: `pnpm --filter @gsd-build/sdk exec vitest run sdk/src/golden/golden.integration.test.ts sdk/src/golden/read-only-parity.integration.test.ts` — expect 0 failed.
5. Commit with `git add <four files> && git commit -m "fix(query): port four upstream CJS fixes to SDK (mode/W016/percent/UAT)"`.

### Status: RESOLVED

Five patches applied in commit `pxumponwopvsmlmvvlrusyqokxspskwv` ("fix(query): port five upstream CJS fixes to SDK").

A fifth latent drift surfaced during verification (after fixing the first four exposed it): SDK's W006 check did not have the not-started-phase exclusion from upstream `#2009`. Patched in the same commit.

Verification (2026-05-13):
- `pnpm --filter @gsd-build/sdk run build` — clean
- `node sdk/scripts/.tmp/diag-golden-diff.mjs all` — all 5 handlers key-shape-match; sole residual is `repairs_performed: undefined` in SDK which `.toEqual` treats as absent
- `pnpm --filter @gsd-build/sdk exec vitest run sdk/src/golden/golden.integration.test.ts sdk/src/golden/read-only-parity.integration.test.ts` — 80/80 pass (was 75/80)

Files modified:
- `sdk/src/query/roadmap.ts` — `roadmapAnalyze` extracts `**Mode:**`
- `sdk/src/query/validate.ts` — W016 + repair; W006 skip-not-started filter
- `sdk/src/query/state.ts` — `computeProgressPercent` exported; `buildStateFrontmatter` uses it
- `sdk/src/query/state-mutation.ts` — `stateSync` uses `computeProgressPercent` + `getMilestonePhaseFilter`-derived `syncTotalPhases`
- `sdk/src/query/audit-open.ts` — `TERMINAL_UAT_STATUSES` + `unknown+all_pass` short-circuit

Phase 03.1 unblocked. Resume with `/gsd-execute-phase 03.1` once the lifecycle-e2e/phase-runner hang (the second blocker noted in STATE.md) is also resolved, or accept the longer run time and bump the harness wall-clock cap.
