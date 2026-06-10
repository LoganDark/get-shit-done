---
phase: 18-tactical-cleanup-test-flake-re-scoped
reviewed: 2026-06-10T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - gsd-core/workflows/transition.md
  - src/vcs-command-router.cts
  - src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts
  - src/vcs/__tests__/cmd-parallel-jj.test.ts
  - src/vcs/__tests__/cmd-parallel-git.test.ts
  - scripts/dogfood-restore.sh
  - gsd-core/bin/lib/vcs-command-router.cjs
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: fixed
fixed: 2026-06-10
fixed_by: gsd-code-fixer (all 7 findings; one jj change per finding/group, listed inline)
---

# Phase 18: Code Review Report

**Reviewed:** 2026-06-10
**Depth:** standard
**Files Reviewed:** 7
**Status:** fixed (all 7 findings resolved 2026-06-10; per-finding jj change ids below)

## Summary

Reviewed the Phase 18 tactical-cleanup surface: 5 `gsd_run query commit` grafts plus the `assert_clean_wc` gate in `transition.md`; two fail-closed envelopes (`plan_not_array`, `max_concurrency_invalid`) in the `workspace.parallel.dispatch` handler (.cts + emitted .cjs); the project-root assertion and overlay-asymmetry comment in `dogfood-restore.sh`; and the 6 new contract tests + describe-scoped `tmpDir` cleanup hoists in the three parallel test files.

What checks out cleanly:

- **Emitted artifact is NOT stale.** `gsd-core/bin/lib/vcs-command-router.cjs:1082-1141` carries both new guards with identical logic, ordering, and comments as the `.cts` source. Both guards return before `createVcsAdapter` (.cts:1153, 1204 vs adapter call at 1208).
- **Envelope shape consistency.** Both new envelopes are `{ data: { ok: false, reason: '<snake_case>' } }`, matching peers `phase_number_required`, `plan_required`, `plan_json_parse_failed`, `parallelization_disabled`.
- **No raw git introduced.** All five transition.md grafts and the gate fence use bare `gsd_run` (the only `git rev-parse` occurrence is inside the pre-existing canonical launcher embed at line 166 — one embed, no duplicate, matching the execute-phase.md convention).
- **Gate jq pipeline type-checks.** `DiffResult.nameOnly` is `string[]` (src/vcs/types.cts:194), so `jq '.nameOnly // [] | join("\n")'` operates on an array; verb routing `query diff --name-only` resolves through `routeVcsCommand` correctly.
- **Missing REQUIREMENTS.md is safe in the line-168 commit.** `cmdCommit`'s #2014 filter (commands.cjs:524-533) drops nonexistent `--files` entries before `vcs.commit`, so projects without `.planning/REQUIREMENTS.md` do not fail the transition commit.
- **Gate sweep claim verified.** graduation.md's Promote path commits its own writes atomically (graduation.md:138); Defer/Dismiss write only to STATE.md's `graduation_backlog`, which the line-404 sweep commit covers. The gate's "only Route B1/B config-set writes happen after" claim is accurate.
- **dogfood-restore.sh ordering is correct.** Positional parse (34-48) → root assertion (56) → tarball check (73) → `jj op restore` (79) → `tar -xf` (92). The assertion fires pre-mutation as documented; stderr + exit-1 style matches the file.
- **Test guard coverage is sound.** The `plan_not_array` table covers object/string/number/null; the `max_concurrency_invalid` tests supply a valid phase and valid array plan so only the target guard can fire; `recordedDispatchOpts` is reset at the top of every new `it` and the `length === 0` assertions prove the adapter boundary was never reached.

## Warnings

### WR-01: assert_clean_wc gate is fail-open when its probe fails

**FIXED** — jj change `kkktupwtwwpz` (with WR-02, same probe). Probe replaced with fail-closed two-stage form: `STATUS_JSON=$(gsd_run query status --porcelain) || FATAL exit 1`, then `jq -re 'if .ok == true then .raw else error(...) end' || FATAL exit 1` — non-zero query exit, error envelope, missing jq output, and unparseable JSON all abort instead of resolving to "clean". `2>/dev/null` dropped. Applied byte-consistently to all three mirrors (transition.md, execute-phase.md:1686, plan-phase.md:1776). Verified against ephemeral /tmp fixtures: probe-failure and bad-envelope simulations both FATAL exit 1; clean → 0.

**File:** `gsd-core/workflows/transition.md:429`
**Issue:** The gate's only input is `DIRTY=$(gsd_run query diff --name-only 2>/dev/null | jq -r '.nameOnly // [] | join("\n")')`. Every probe-failure mode silently resolves to "clean":
1. `gsd_run`/node failure → empty stdout, stderr suppressed by `2>/dev/null`, jq on empty input exits 0 with no output → `DIRTY=""` → gate passes.
2. jq missing from PATH → same outcome.
3. An `ok:false` error envelope has no `.nameOnly` key → `// []` defaults it to clean.
4. On the jj backend, a failed `jj diff` subprocess returns `{ nameOnly: [] }` inside an `ok:true` envelope (src/vcs/backends/jj.cts:490) — indistinguishable from genuinely clean.

A gate whose entire purpose is fail-closed dirty-WC detection (the step itself says "Do not bypass") rubber-stamps the transition whenever its own probe breaks. This is inherited verbatim from the mirror at execute-phase.md:1686, which has the same defect.
**Fix:** Drop `2>/dev/null`; capture the envelope, assert `.ok == true` (and jq exit status) before deriving `DIRTY`; abort with a "probe failed, cannot verify cleanliness" error otherwise:
```bash
DIFF_JSON=$(gsd_run query diff --name-only) || { echo "FATAL: diff probe failed; cannot verify WC cleanliness" >&2; exit 1; }
DIRTY=$(printf '%s' "$DIFF_JSON" | jq -re 'if .ok == true then (.nameOnly | join("\n")) else error("probe envelope not ok") end') \
  || { echo "FATAL: diff probe returned error envelope" >&2; exit 1; }
```

### WR-02: gate is blind to untracked and staged-only changes on the git backend

**FIXED** — jj change `kkktupwtwwpz` (with WR-01, same probe). Probe now uses `gsd_run query status --porcelain` (non-empty `.raw` = dirty) instead of `diff --name-only`; categorized PLANNING_DIRTY/OTHER_DIRTY diagnostics preserved via `.entries[].path` (raw-lines fallback if entries empty). Fixture-verified on a git-backend repo: untracked-only → exit 1, staged-only → exit 1, tracked-modified → exit 1, clean → exit 0; jj-backend dirty/clean parity confirmed. `audit-workflow-raw-git.cjs` stays exit 0 (fence remains bare-`gsd_run`).

**File:** `gsd-core/workflows/transition.md:429`
**Issue:** The probe maps to plain `git diff --name-only` on the git backend (src/vcs/backends/git.cts:348-371) — unstaged modifications to *tracked* files only. Untracked new files and staged-but-uncommitted changes are invisible. Newly created planning artifacts (SUMMARY/VERIFICATION-class files — exactly the leak class from the Phase 14 incident the gate exists to catch) are untracked on git until first commit, so the gate's "catch ALL forms of 'state isn't durable'" claim (line 454) does not hold for cases (b) and (d) on git. jj is unaffected (auto-tracking makes `jj diff` see new files). gsd-core ships cross-backend, so this is not jj-fork-only dead code. Same gap exists in the execute-phase.md:1686 mirror.
**Fix:** Probe via `gsd_run query status --porcelain` and derive `DIRTY` from `.entries[].path` — `git status --porcelain` reports untracked (`??`) and staged entries; the jj status surface is equivalent.

### WR-03: max_concurrency guard is weaker than the file's own numeric-validation precedent

**FIXED** — jj change `yykktkqolpzq`. Guard strengthened to the line-1354 precedent: `Number.isNaN || !Number.isInteger || < 1` (rejects 0, -2, 2.5, Infinity); argv branch flipped to `i + 1 < args.length` so `--max-concurrency ''` reaches the validator (`Number('')` = 0 → rejected) instead of silently skipping. Reason string `max_concurrency_invalid` unchanged; absent flag still forwards `undefined`. Contract tests extended (rejects NaN/banana/0/-2/2.5/Infinity/''; accepts 1 and 4; absent → undefined) — 15/15 green. Emitted artifact rebuilt via `pnpm run build:lib` and committed alongside (`gsd-core/bin/lib/vcs-command-router.cjs`, 18-02 parity precedent).

**File:** `src/vcs-command-router.cts:1153`
**Issue:** The guard rejects only `Number.isNaN(maxConcurrency)`. `--max-concurrency 0`, `--max-concurrency -2`, `--max-concurrency 2.5`, and `--max-concurrency Infinity` all pass the guard and forward into `dispatch({ maxConcurrency })` — a zero or negative concurrency cap is precisely the nonsense scheduling input CLEANUP-06 set out to fail-closed on. The same file already established the stronger pattern for numeric flags at `cleanupSubagentWorkspacesVerb` (line 1354): `Number.isNaN(phase) || !Number.isInteger(phase) || phase < 0`. Additionally, `--max-concurrency ''` bypasses the guard entirely: the argv loop's truthy `args[i + 1]` check (line 1140) silently skips the flag, leaving `maxConcurrency` undefined — the Phase 16 WR-03 `i + 1 < args.length` form was applied to the cancel/cleanup verbs but the dispatch loop still uses truthiness.
**Fix:**
```ts
if (
  maxConcurrency !== undefined &&
  (Number.isNaN(maxConcurrency) || !Number.isInteger(maxConcurrency) || maxConcurrency < 1)
) {
  return { data: { ok: false, reason: 'max_concurrency_invalid' } };
}
```
(Mirror the change into the emitted .cjs, and extend the CLEANUP-06 test table with `'0'`, `'-1'`, `'2.5'`.)

### WR-04: line-168 commit message uses `${completed_phase}` before the workflow defines it

**FIXED** — jj change `nklyoqzxkwmn`. Line-168 commit message now uses `${current_phase}` (in scope; `completed_phase == current_phase` by definition). The two later grafts (lines 269, 404) correctly keep `${completed_phase}` — they run after the extraction prose.

**File:** `gsd-core/workflows/transition.md:167-180`
**Issue:** The grafted fence runs `gsd_run query phase.complete "${current_phase}"` then immediately commits with message `docs(phase-${completed_phase}): ...`. But `completed_phase` is only introduced at line 180 ("Extract from result: `completed_phase`, ...") — *after* the fence — and the load-bearing prose at line 171 explicitly forbids deferring the commit past the result parsing. Executed literally, the message renders as `docs(phase-): complete phase via transition`. The two later grafts (lines 269, 404) are fine — they live in steps that follow the extraction prose. Since `completed_phase == current_phase` by definition, the fence has the value available under its other name.
**Fix:** Use `${current_phase}` in the line-168 commit message (or move the one-line extraction above the commit inside the same fence).

## Info

### IN-01: `|| true` rationale on Route B1/B tolerant commits documents a non-existent failure mode

**FIXED** — jj change `vkqwonkvsnvv`. Both Route B1 and Route B rationale paragraphs rewritten: `|| true` kept as defensive against unexpected launcher/node failures; the comment now states that the byte-identical no-change case already exits 0 with `nothing_to_commit` and never needed the tolerance.

**File:** `gsd-core/workflows/transition.md:618-621, 675-678`
**Issue:** The comment claims `|| true` "is required because ... the VCS sees no change, and the commit is a harmless no-op." In fact `cmdCommit` short-circuits the byte-identical case itself with `{ committed: false, reason: 'nothing_to_commit' }` at exit 0 (commands.cjs:570-574) — and even `commit_failed` exits 0 by the envelope contract. The `|| true` never changes behavior for its stated reason; if anything it would also mask a genuinely unexpected non-zero exit (e.g., node crash). Harmless, but the rationale is misleading for future maintainers.
**Fix:** Either drop `|| true` or reword the rationale to "defensive against unexpected launcher/node failures; the no-change case already exits 0 with `nothing_to_commit`."

### IN-02: CONFIG-02 `afterEach` lacks the `if (tmpDir)` guard every other cleanup hook in these files uses

**FIXED** — jj change `uppnmvszoyxo`. `if (tmpDir)` guard added to the CONFIG-02 afterEach in both files (with a one-line rationale comment), matching the sibling afterAll hooks. Both full files re-run green (27/27).

**File:** `src/vcs/__tests__/cmd-parallel-jj.test.ts:784-786`, `src/vcs/__tests__/cmd-parallel-git.test.ts:1013-1015`
**Issue:** `afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); })` — if the first `it`'s `mkdtemp` rejects, `tmpDir` is `undefined` and `rm(undefined)` rejects with `ERR_INVALID_ARG_TYPE`, layering a confusing hook failure on top of the real one. Every `afterAll` in both files guards (`if (dir) rmSync(...)`). Double-rm across tests is safe (`force: true` tolerates missing paths; vitest runs same-file tests serially, so no stale-closure cross-test deletion), so this only bites on an already-failing test — but the one-line guard restores file-local consistency.
**Fix:** `afterEach(async () => { if (tmpDir) await rm(tmpDir, { recursive: true, force: true }); });`

### IN-03: stale line reference in dogfood-restore.sh comment after Phase 18 header insertion

**FIXED** — jj change `txqmossnpzvp`. Comment reworded to "in effect from the prologue's `set -euo pipefail`" (no line anchor to drift); optional label alignment also applied (root assertion now `FATAL:`, matching the tarball check — no test pinned the old `ERROR:` text). `bash -n` clean; wrong-cwd run still exits 1.

**File:** `scripts/dogfood-restore.sh:113`
**Issue:** The comment "`set -e` is in effect from line 29" is stale — the Phase 18 pre-condition comment block (lines 25-30) shifted `set -euo pipefail` to line 32. Minor: also note the new assertion uses the `ERROR:` label while the adjacent tarball check uses `FATAL:` for the same exit-1 severity class.
**Fix:** Reword to "set -e is in effect from the prologue" (avoids future drift) and optionally align the label to `FATAL:`.

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
