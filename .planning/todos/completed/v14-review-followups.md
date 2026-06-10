---
title: Phase 14 code-review advisory follow-ups (5 warnings + 5 info)
source: phase-14 14-REVIEW.md
created: 2026-05-24
priority: medium
cross_backend: false
resolves_phase: 18
target_milestone: v1.4
---

## Summary

Phase 14 code review produced 1 BLOCKER (CR-01: jq envelope-guard bug — **fixed inline** during Phase 14 execution as a `fix(14): ...` commit) and 10 advisory findings (5 warnings + 5 info) that were NOT fixed. The verifier referenced a `follow_ups_v1_4` field but `14-REVIEW.md` frontmatter doesn't actually carry it — findings exist only in the report body. Filing here so they survive into v1.4 planning.

See `.planning/phases/14-default-flip-dogfood-validation/14-REVIEW.md` for full context per finding.

## Warnings (5) — fix before they bite

- **WR-01:** `scripts/dogfood-restore.sh` claims project-root precondition but never enforces it; `tar -xf -C .` is unbounded. Add an explicit project-root assertion (e.g., `[ -f .planning/STATE.md ] || { echo "ERROR: dogfood-restore.sh must run from project root" >&2; exit 1; }`) before the `tar -xf`.
- **WR-02:** `dogfood-restore.sh`'s tar overlay is additive — post-snapshot new files in `.planning/` may survive restore (subtle asymmetry with `jj op restore` which IS a rollback). Either (a) `rm -rf .planning && tar -xf` (clean overlay), or (b) document the asymmetry as intended.
- **WR-03:** `sdk/src/query/workspace-parallel-dispatch.ts` does not validate `JSON.parse(planText)` is an array. Objects, strings, numbers, null pass through unchecked. Add an `Array.isArray(plan)` guard with a `{ok:false, reason:'plan_not_array'}` envelope.
- **WR-04:** `--max-concurrency` accepts NaN silently (unlike `--phase` which has a `Number.isNaN` guard). Add the same guard.
- **WR-05:** CONFIG-02 test tmpDirs leak — no `afterAll`/`finally` cleanup, 6 leaked dirs per run across both `cmd-parallel-{jj,git}.test.ts`. Add `afterEach(() => rm(tmpDir, {recursive: true, force: true}))` to the `describe('CONFIG-02 — parallelization_disabled')` blocks.

## Info (5) — minor hygiene

- Phase number 0 accepted as valid in arg-parser (no lower bound).
- Arg-parser silently ignores empty-string values and unknown flags (no warning).
- `|| true` after `jj config set` invocations in `scripts/dogfood-phase-14.sh` swallows failures (could mask config-write issues; add at least a stderr warning).
- `HANDLE_FILE_*` mktemp files not registered in the `trap cleanup EXIT` (would leak on early-exit paths).
- `dogfood-rehearse.sh`'s `grep -q '^rehearsal-dirty$'` anchor is fragile if the synthetic dirty state pattern changes; consider matching a unique marker string instead.

## Acceptance criteria for the fix plan

- [ ] Each WR-NN addressed via specific commit (5 commits or 1 batched)
- [ ] No new lint violations introduced (`node scripts/lint-vcs-no-raw-git.cjs` exit 0)
- [ ] Info items addressed opportunistically when adjacent files are touched
- [ ] `.planning/phases/14-default-flip-dogfood-validation/14-REVIEW.md` updated with a closure note OR a new v1.4-REVIEW report supersedes it

## References

- `.planning/phases/14-default-flip-dogfood-validation/14-REVIEW.md` — full findings with file:line and rationale per finding
- Phase 14 SUMMARYs (14-01..14-05) for context on the surfaces being criticized
