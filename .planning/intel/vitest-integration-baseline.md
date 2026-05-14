# Vitest Integration Baseline — sdk/ Phase 03.1

**Generated:** 2026-05-13 on Darwin (local M-series; `os.availableParallelism()` = 16)
**Method:** `pnpm --filter @gsd-build/sdk exec vitest run --project integration --reporter=json` × 3, median per file
**Purpose:** Phase 03.1 baseline + per-lever post-flip records; ratio target for D-03.

## baseline

| Metric | Value |
|--------|------:|
| Total integration files | 7 |
| Total tests (`numTotalTests`) | 98 |
| Skip count (`numPendingTests`) | 7 |
| Median total wall-clock (ms) | 7394.599853515625 |
| Run 1 outer wall-clock (ms) | 5296 |
| Run 2 outer wall-clock (ms) | 5073 |
| Run 3 outer wall-clock (ms) | 5237 |

| File | Run 1 (ms) | Run 2 (ms) | Run 3 (ms) | Median (ms) |
|------|-----------:|-----------:|-----------:|------------:|
| sdk/src/e2e.integration.test.ts | 5.23681640625 | 4.240234375 | 3.202392578125 | 4.240234375 |
| sdk/src/golden/golden.integration.test.ts | 4109.23486328125 | 4017.304443359375 | 4135.257568359375 | 4109.23486328125 |
| sdk/src/golden/read-only-parity.integration.test.ts | 3340.9111328125 | 3236.66064453125 | 3259.162109375 | 3259.162109375 |
| sdk/src/init-e2e.integration.test.ts | 0 | 0 | 0 | 0 |
| sdk/src/lifecycle-e2e.integration.test.ts | 0 | 0 | 0 | 0 |
| sdk/src/phase-runner.integration.test.ts | 12.25390625 | 14.265869140625 | 12.7294921875 | 12.7294921875 |
| sdk/src/query/sub-repos-root.integration.test.ts | 9.233154296875 | 9.00634765625 | 9.279052734375 | 9.233154296875 |
| **TOTAL (sum of medians)** | — | — | — | **7394.599853515625** |

### Methodology Notes

- `pnpm --filter @gsd-build/sdk run build` is invoked **once** before the 3-run loop (isolates test wall-clock from `pretest: pnpm run build:sdk` rebuild cost per RESEARCH Pitfall 2).
- Each run writes JSON to `sdk/scripts/.tmp/profile-integration/run-N.json`; the script aborts before writing this markdown if any run has `success: false` (D-05c).
- `GSD_ENABLE_E2E` env state at measurement time: `unset` — some E2E tests will self-skip; baseline reflects that.
- `claude` CLI availability at measurement time: detected via `which claude` exit code at script start; present.
- Re-run with `node sdk/scripts/profile-integration.mjs --label <name> --append` after each lever flip; the resulting file is the per-lever evidence record (D-09).
