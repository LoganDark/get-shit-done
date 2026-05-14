---
phase: 02-bulk-call-site-migration-still-git-only
plan: 08

subsystem: vcs-adapter

tags: [vcs-adapter, commit-handler, paired-test-retarget, branch-by-abstraction, mechanical-only, gap-fill, w5-prescriptive-imports]

requires:
  - phase: 02-bulk-call-site-migration-still-git-only (plan 01)
    provides: "commit.test.ts:304 triage closed (commit.gpgsign / tag.gpgsign disablers); D-03/D-04 gate opened for paired commit.ts + commit.test.ts migration"
  - phase: 02-bulk-call-site-migration-still-git-only (plan 03)
    provides: "vcs.stage / vcs.refs.resolveShort / gitOnly.init / gitOnly.configSet gap-fills consumed by this plan"
  - phase: 02-bulk-call-site-migration-still-git-only (plan 07)
    provides: "Baseline-parity args-shape dispatch growth pattern; lint state at 5 violations / 3 files"
  - phase: 01-adapter-foundation-git-backend
    provides: "createVcsAdapter, expr factories, baseline-capture tooling, baseline-parity dispatch table"
provides:
  - "sdk/src/query/commit.ts (8 sites + execGit shim) — fully adapter-routed (vcs.stage / vcs.diff / vcs.commit / vcs.refs.resolveShort); zero raw-git in source"
  - "sdk/src/query/commit.test.ts (D-06 paired retarget): bootstrap via gitOnly.init/configSet; setup via vcs.stage/vcs.commit; post-state probes via vcs.log/vcs.status/vcs.diff; git-rm via unlink+vcs.stage. Zero raw `execSync('git ...')` invocations remain in test bodies."
  - "CommitInput contract extension (Rule 3 gap-fill): amend / noVerify / pathspec fields — consumed by sdk/src/query/commit.ts to preserve --amend / --no-verify / pathspec-scope (#3061) semantics"
  - "8 new baselines under tests/baselines/git-vcs/; 3 new args-shape dispatch clauses in baseline-parity.test.ts"
  - "verify.ts execGit dynamic-import retargeted from './commit.js' to '../vcs/index.js' (Rule 3 — preserves verify.ts existing semantics; Plan 02-10 owns the verify.ts proper migration)"
affects: [02-09-commands-cjs, 02-10-verify-cjs, 02-11-core-cjs]

tech-stack:
  added: []
  patterns:
    - "W5 prescriptive-import policy applied to commit.ts: `import { createVcsAdapter } from '../vcs/index.js'` exclusively. No `import { execGit } from '../vcs/exec.js'` alternative — call sites consume the higher-level adapter API. Acceptance grep enforces both positive (createVcsAdapter ≥1) and negative (execGit-import = 0) checks."
    - "CommitInput gap-fill (amend / noVerify / pathspec) lands in this plan as Rule 3 closure: the original commit.ts handler used flags the adapter contract didn't model (--amend, --no-verify, `-- pathspec` for #3061 scope). All three added as optional fields; git backend's commit() honors them; the pathspec-only path branches to `git commit -m <msg>` (no -am) so already-staged paths are not auto-restaged."
    - "Test post-state probe migration pattern: read-only git probes (`git log -1 --format=%s`, `git show --name-only`, `git status --porcelain`, `git diff --cached --name-only`) all route through the adapter. `git rm` synthesized via `unlink + vcs.stage` (deleting the file then staging records the deletion in the index — byte-equivalent to `git rm` for the regression test's needs)."
    - "Baseline-parity dispatch growth (3 new clauses): `add -- <files>` → vcs.stage; `commit -m <msg> -- <pathspec>` (non-amend) → vcs.commit({message, pathspec}); `rev-parse --short HEAD` → vcs.refs.resolveShort. The commit clause re-creates a fresh fixture (initFixture) for the adapter call because the canonical execGit run already committed the staged paths — re-running on the same fixture would hit `nothing to commit`."
    - "Cwd-via-factory pattern in commitToSubrepo: pre-migration `git -C <dir> <verb>` invocation form normalized to `createVcsAdapter(<dir>, {kind:'git'}).<verb>` — cwd moves from arg position to factory parameter. The 3 baselines (-294/-301/-309 -c-form) capture the normalized args (no -C prefix) since the adapter form is byte-identical to running the same command from that cwd."
    - "Date-only baseline drift restoration: capture-vcs-baselines.cjs regenerates ALL baselines (no per-id filter), drifting captured_at on 9 unrelated files. Per D-08/D-11, those drift edits were `git checkout`'d back so this commit's diff stays minimal and on-scope. (Pattern inherited from 02-07.)"

key-files:
  created:
    - tests/baselines/git-vcs/commit-ts-148-add.snap.json
    - tests/baselines/git-vcs/commit-ts-155-diff-cached.snap.json
    - tests/baselines/git-vcs/commit-ts-170-commit.snap.json
    - tests/baselines/git-vcs/commit-ts-179-rev-parse-short.snap.json
    - tests/baselines/git-vcs/commit-ts-211-diff-cached.snap.json
    - tests/baselines/git-vcs/commit-ts-294-add-c-form.snap.json
    - tests/baselines/git-vcs/commit-ts-301-commit-c-form.snap.json
    - tests/baselines/git-vcs/commit-ts-309-rev-parse-c-form.snap.json
  modified:
    - sdk/src/query/commit.ts
    - sdk/src/query/commit.test.ts
    - sdk/src/query/verify.ts
    - sdk/src/vcs/types.ts
    - sdk/src/vcs/backends/git.ts
    - sdk/src/vcs/__tests__/baseline-parity.test.ts
    - tests/__tools__/capture-vcs-baselines.cjs

key-decisions:
  - "W5 prescriptive imports honored: only `import { createVcsAdapter } from '../vcs/index.js'` — never `execGit` from `../vcs/exec.js`. Acceptance grep enforces both directions."
  - "CommitInput gap-fill (amend / noVerify / pathspec) added as Rule 3 — without these the migration could not preserve commit.ts's --amend / --no-verify / #3061 pathspec-scope semantics. Pathspec-only path branches to `git commit -m` (no -am) so already-staged paths are not auto-restaged."
  - "Test bodies fully migrated (NOT just bootstrap): post-state probes (`git log -1 --format=%s`, `git show --name-only`, `git status --porcelain`, `git diff --cached --name-only`) all route through the adapter; `git rm` synthesized via unlink+vcs.stage. Zero raw `execSync('git ...')` survives in test bodies — exceeds the AC's `≤4` budget on the favorable side."
  - "Baseline-parity commit dispatch needs a fresh fixture: the canonical execGit upstream call already committed the staged path; re-running on the same fixture would hit `nothing to commit`. Re-create via initFixture (mirroring the existing `rev-parse HEAD` clause's per-fixture fresh-init pattern from 02-07)."
  - "verify.ts's 3 dynamic execGit imports retargeted to `'../vcs/index.js'` (Rule 3 — preserves existing semantics on the deleted re-export). Plan 02-10 owns verify.ts's full migration to the high-level adapter API. The 5-field ExecResult shape is a strict superset of the deleted 3-field local execGit shim's shape, so the existing call sites read the same fields."
  - "Plan AC commit-diff budget (≤12 files) exceeded by 3 files (15 total): types.ts + backends/git.ts (the CommitInput gap-fill landing) + verify.ts (the dynamic-import retarget). All three are Rule 3 closures the plan didn't anticipate but mechanically necessary; without them, the migration cannot land."

requirements-completed:
  - MIGR-01
  - MIGR-03
  - TEST-05

duration: ~25m
completed: 2026-05-10
---

# Phase 02 Plan 08: Migrate sdk/src/query/commit.ts + commit.test.ts (paired) Summary

**One atomic commit on `phase/02-migration` closes 8 raw-git sites in `sdk/src/query/commit.ts` (5 in commit/checkCommit routed through the deleted local execGit shim, plus 3 in commitToSubrepo that used the `git -C <dir>` invocation form). The local execGit helper at lines 37-48 is deleted; W5 prescriptive single-import policy applied. The paired commit.test.ts (gated by 02-01 triage) is fully retargeted onto the VcsAdapter — bootstrap via `gitOnly.init/configSet`, setup via `vcs.stage/vcs.commit`, post-state probes via `vcs.log/vcs.status/vcs.diff`, `git rm` synthesized via `unlink + vcs.stage`. Zero raw `execSync('git ...')` invocations remain in test bodies. CommitInput contract extended with `amend`/`noVerify`/`pathspec` fields (Rule 3 gap-fill — required to preserve commit.ts handler semantics). 8 new baselines + 3 new args-shape dispatch clauses; lint state on `phase/02-migration` drops to 3 violations / 2 files (was 5 / 3). All 21 commit tests pass; all 32 baseline-parity tests pass; SDK build clean.**

## Performance

- **Duration:** ~25m active work
- **Started:** 2026-05-10T22:18Z (approx)
- **Tasks:** 1 (`tdd="false"` — pure mechanical migration)
- **Files modified:** 7 source/test/tooling files + 8 baseline JSON
- **Commits on phase/02-migration:** 1 (`mmkwkkxnllsopnovwyppxlnwkssuloqw`)

## Accomplishments

- **commit.ts migrated (8 sites + execGit shim deletion):**
  - **Top-of-file (W5 prescriptive):** removed local execGit (lines 37-48); added `import { createVcsAdapter } from '../vcs/index.js'`.
  - **Site 148** (`execGit(projectDir, ['add', '--', file])`): now `vcs.stage([file])`.
  - **Site 155** (`execGit(projectDir, ['diff', '--cached', '--name-only', '--', ...pathsToCommit])`): now `vcs.diff({staged: true, nameOnly: true, paths: pathsToCommit}).nameOnly`.
  - **Site 170** (`execGit(projectDir, commitArgs)` with `--amend`/`--no-verify`/pathspec): now `vcs.commit({message, amend: hasAmend, noVerify: hasNoVerify, pathspec: pathsToCommit})`.
  - **Site 179** (`execGit(projectDir, ['rev-parse', '--short', 'HEAD'])`): now `vcs.refs.resolveShort(vcs.refs.head)` inside try/catch.
  - **Site 211** (`execGit(projectDir, ['diff', '--cached', '--name-only'])`): now `vcs.diff({staged: true, nameOnly: true}).nameOnly`.
  - **Sites 294/301/309 (commitToSubrepo, `-C` form):** all migrated to `createVcsAdapter(projectDir, {kind: 'git'})` factory + `subVcs.stage / subVcs.commit({message, pathspec}) / subVcs.refs.resolveShort(subVcs.refs.head)`. Cwd moves from `-C` arg position to factory parameter.

- **commit.test.ts paired retarget (D-06 — full):**
  - **Bootstrap:** `vcs.gitOnly.init() + vcs.gitOnly.configSet('user.email', …) + vcs.gitOnly.configSet('user.name', …) + vcs.gitOnly.configSet('commit.gpgsign', 'false') + vcs.gitOnly.configSet('tag.gpgsign', 'false')`. Phase 2 D-03 gpgsign disablers preserved.
  - **execGit tests:** retargeted onto the canonical `execGit` re-export from `'../vcs/index.js'` (5-field shape, byte-equivalent for the {exitCode, stdout, stderr} subset asserted on). Test names preserved verbatim per D-08.
  - **Setup:** `execSync('git add ...')` + `execSync('git commit ...')` setup steps replaced by `vcs.stage / vcs.commit({message, pathspec})`.
  - **Post-state probes:** `git log -1 --format=%s` → `vcs.log({maxCount:1})[0].subject`; `git show --name-only --format= HEAD` → `showCommittedFiles(tmpDir)` helper (wraps `execGit(['show', '--name-only', '--format=', 'HEAD'])`); `git status --porcelain` → `vcs.status({porcelain:true}).raw`; `git diff --cached --name-only` → `vcs.diff({staged:true, nameOnly:true}).nameOnly.join('\n')`.
  - **`git rm` synthesis:** `unlink(file) + vcs.stage([file])` — git records the deletion when the worktree file is gone. Byte-equivalent to `git rm` for the #3061 regression scenarios.
  - **Result:** zero raw `execSync('git ...')` invocations in test bodies (the 3 surviving hits are inside docstrings, not code). All 21 tests still pass; test names preserved verbatim per D-08.

- **CommitInput contract extension (Rule 3 closure):**
  - Added `amend?: boolean` — when true, emits `git commit --amend --no-edit` (HEAD's message preserved; `message` field ignored). Required by commit.ts's `--amend` code path.
  - Added `noVerify?: boolean` — when true, appends `--no-verify`. Required by commit.ts's `--no-verify` code path.
  - Added `pathspec?: string[]` — when set, appends `-- <paths…>` so the commit captures only the pathspec scope (#3061). Distinct from `files` (which controls staging); `pathspec` narrows commit scope without staging.
  - **Pathspec-only path branches to `git commit -m`** (no `-am`) so already-staged paths are not auto-restaged. The commit handler relies on this: it stages explicitly upstream, then commits with pathspec; auto-staging would defeat the scope guard.

- **verify.ts retarget (Rule 3 — preserve existing semantics):**
  - 3 dynamic imports of `execGit` from `'./commit.js'` (the now-deleted re-export) retargeted to `'../vcs/index.js'` (the canonical re-export). The 5-field ExecResult shape is a strict superset of the 3-field local shim's shape; existing call sites only read `exitCode` and `stdout` — both shapes have them.
  - **Plan 02-10 owns verify.ts's full migration to the high-level adapter API.** This plan only restores the dynamic-import resolution, no semantic change.

- **8 new baselines committed (D-10):** captured before migration; asserted post-migration via 3 new args-shape dispatch clauses in `baseline-parity.test.ts`. Two share the existing `diff --cached --name-only` clause (idempotent shape, no new clause needed).

- **baseline-parity dispatch growth (3 new clauses):**
  - `add -- <files>` → `vcs.stage(files)`. 3-field shape comparison.
  - `commit -m <msg> -- <pathspec>` (non-amend) → `vcs.commit({message, pathspec})`. The dispatch re-creates a fresh fixture (`initFixture(baseline)`) for the adapter call — the canonical execGit upstream call already committed the staged path; re-running on the same fixture would hit `nothing to commit`. Mirrors the per-fixture re-init pattern landed in 02-07's `rev-parse HEAD` clause.
  - `rev-parse --short HEAD` → `vcs.refs.resolveShort(vcs.refs.head)`. Regex-tolerant stdout assertion (^[0-9a-f]{7,}$) for the SHA's wall-clock-dependent variability.

- **Lint state on `phase/02-migration` drops to 3 violations / 2 files (was 5 / 3):** commit.ts removed from the violation set; commands.cjs / core.cjs remain (their migration belongs to 02-09 / 02-11).

- **Test suite green:**
  - `cd sdk && pnpm exec vitest run src/query/commit.test.ts` → 21/21 pass.
  - `cd sdk && pnpm exec vitest run src/vcs/__tests__/baseline-parity.test.ts` → 32/32 pass (was 24; +8).
  - `cd sdk && pnpm exec vitest run src/vcs/__tests__/` → 149/149 pass (was 141 in 02-07).
  - `cd sdk && pnpm build && pnpm build:cjs` exit 0.
  - 3 pre-existing flaky failures under heavy concurrent test load (config-mutation, query-fallback-executor, query-dispatch) reproduce on pristine `phase/02-migration` HEAD without my changes — out of scope per executor SCOPE BOUNDARY.

## Migrated Sites Inventory

| File | Sites | Site lines | Adapter calls | Closes |
|------|------:|------------|---------------|--------|
| `sdk/src/query/commit.ts` (commit handler) | 5 | 148, 155, 170, 179, 211 | `vcs.stage`, `vcs.diff({staged:true,nameOnly:true,paths})`, `vcs.commit({amend,noVerify,pathspec})`, `vcs.refs.resolveShort(vcs.refs.head)`, `vcs.diff({staged:true,nameOnly:true})` | 5 raw-git sites |
| `sdk/src/query/commit.ts` (commitToSubrepo) | 3 | 294, 301-304, 309-313 | `subVcs.stage(fileArgs)`, `subVcs.commit({message,pathspec:fileArgs})`, `subVcs.refs.resolveShort(subVcs.refs.head)` | 3 raw-git sites + `-C` form normalization |
| `sdk/src/query/commit.ts` (top-of-file) | 1 | 37-48 | (deleted; `import { createVcsAdapter } from '../vcs/index.js'`) | local execGit shim deleted |

**Total: 8 raw-git sites closed + execGit shim deleted.**

## Task Commits

Single atomic commit on `phase/02-migration`:

| # | Hash       | LOC | File                                              | Message subject                                       |
|--:|------------|----:|---------------------------------------------------|-------------------------------------------------------|
| 1 | 021d7823   | 318 | `sdk/src/query/commit.ts` (+ 6 dependent files + 8 baselines) | migrate sdk/src/query/commit.ts + commit.test.ts to VcsAdapter |

## Files Created/Modified

| File | Net change |
|------|-----------:|
| `sdk/src/query/commit.ts` | +43 / -55 (5-site swap + commitToSubrepo migration + execGit shim deletion + W5 import) |
| `sdk/src/query/commit.test.ts` | +130 / -50 (D-06 paired retarget — bootstrap, setup, probes, git-rm synthesis) |
| `sdk/src/query/verify.ts` | +18 / -3 (Rule 3 — 3 dynamic-import retargets to '../vcs/index.js') |
| `sdk/src/vcs/types.ts` | +23 / -0 (CommitInput gap-fill: amend / noVerify / pathspec) |
| `sdk/src/vcs/backends/git.ts` | +24 / -6 (commit() honors amend / noVerify / pathspec; pathspec-only branches to non-am form) |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` | +73 / -0 (3 new args-shape dispatch clauses) |
| `tests/__tools__/capture-vcs-baselines.cjs` | +88 / -0 (8 new baseline entries + 4 new regex match cases) |
| `tests/baselines/git-vcs/commit-ts-148-add.snap.json` | new (33 LOC, exact match) |
| `tests/baselines/git-vcs/commit-ts-155-diff-cached.snap.json` | new (37 LOC, exact match) |
| `tests/baselines/git-vcs/commit-ts-170-commit.snap.json` | new (37 LOC, regex match — branch + short SHA in stdout) |
| `tests/baselines/git-vcs/commit-ts-179-rev-parse-short.snap.json` | new (35 LOC, regex match — short SHA) |
| `tests/baselines/git-vcs/commit-ts-211-diff-cached.snap.json` | new (35 LOC, exact match) |
| `tests/baselines/git-vcs/commit-ts-294-add-c-form.snap.json` | new (34 LOC, exact match) |
| `tests/baselines/git-vcs/commit-ts-301-commit-c-form.snap.json` | new (37 LOC, regex match — branch + short SHA in stdout) |
| `tests/baselines/git-vcs/commit-ts-309-rev-parse-c-form.snap.json` | new (35 LOC, regex match — short SHA) |

## Decisions Made

- **W5 prescriptive imports honored unconditionally:** the file imports `createVcsAdapter` from `'../vcs/index.js'` and nothing else from the VCS module. The plan's iteration-1 ambiguity (`createVcsAdapter` vs `execGit` from `exec.js`) is resolved in favor of the higher-level adapter API. Acceptance grep enforces both positive (createVcsAdapter ≥1) and negative (execGit-import = 0) checks.
- **CommitInput gap-fill (Rule 3 — required):** the plan acknowledged "preserve any allowEmpty/amend flags inferred from commitArgs structure" but the adapter contract didn't model `amend` / `noVerify` / `pathspec`. Without these, the commit handler can't be migrated mechanically. Added all three as optional fields. Pathspec-only path branches to `git commit -m` (NOT `-am`) so already-staged paths aren't auto-restaged — critical for #3061 scope preservation.
- **verify.ts dynamic-import retarget (Rule 3 — required):** the local execGit shim deletion in commit.ts broke verify.ts's 3 sites that did `await import('./commit.js').execGit`. Retargeted to `await import('../vcs/index.js').execGit` (the canonical re-export). The 5-field ExecResult shape is a strict superset of the 3-field shim's shape; existing call sites read only `exitCode` + `stdout`, both available in both shapes. Plan 02-10 owns verify.ts's full migration.
- **Test bodies fully migrated (exceeds AC budget on favorable side):** the plan AC permitted up to 4 raw `execSync('git ...')` invocations in commit.test.ts (the bootstrap fixture lines). I migrated those AND the post-state probes AND the `git rm` setup — zero raw `execSync('git ...')` survives in test bodies. The 3 surviving hits in `grep -c` are inside docstring comments, not code.
- **Baseline-parity commit dispatch needs a fresh fixture:** the dispatch loop runs the canonical execGit call first, then the adapter call on the same fixture. For destructive operations (commit), the canonical run already changes state — re-running the adapter on the same fixture hits `nothing to commit` (exit 1). The new commit dispatch clause re-creates a fresh fixture via `initFixture(baseline)` before the adapter call, mirroring the per-fixture re-init pattern landed in 02-07's `rev-parse HEAD` clause.
- **Cwd-via-factory normalization for `-C` form:** the captured baselines for sites 294/301/309 record the normalized args (no `-C` prefix) since the migration moves cwd from `-C` arg position to `createVcsAdapter(<dir>, …)` factory parameter — byte-identical to running the same command from that cwd. Source annotations document the original `-C` form for traceability.
- **Plan-AC commit-diff budget (≤12 files) exceeded by 3 files (15 total):** types.ts + backends/git.ts (CommitInput gap-fill landing) + verify.ts (dynamic-import retarget) are all Rule 3 closures the plan didn't anticipate but mechanically necessary. Without them, the migration cannot build/land.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking gap-fill] CommitInput contract extension (amend / noVerify / pathspec)**

- **Found during:** Task 1 contract-comparison (planning the migration of site 170)
- **Issue:** The original commit.ts handler emitted `git commit --amend --no-edit` (when `--amend` flag), `--no-verify` (when `--no-verify` flag), and `-- <pathspec>` (always, for #3061 scope preservation). The pre-migration adapter `CommitInput` only had `files` / `message` / `allowEmpty` — none of these can express the three flags. Without the gap-fill, the commit handler could not be migrated mechanically.
- **Fix:** Added `amend?: boolean`, `noVerify?: boolean`, `pathspec?: string[]` to `CommitInput`. Git backend's `commit()` honors all three: amend takes precedence over message; pathspec narrows commit scope without staging; pathspec-only path branches to `git commit -m` (no `-am`) so already-staged paths aren't auto-restaged.
- **Files modified:** `sdk/src/vcs/types.ts`, `sdk/src/vcs/backends/git.ts`
- **Verification:** Acceptance grep `grep -nE "vcs\\.commit\\(" sdk/src/query/commit.ts` returns 1; commit.test.ts's `--amend with --files` test (preserves the #3061 amend-pathspec scope) passes; baseline-parity dispatch's commit-with-pathspec clause passes for both site-170 and site-301 baselines.
- **Commit:** Task 1 (`mmkwkkxnllsopnovwyppxlnwkssuloqw`)

**2. [Rule 3 — blocking dependency repair] verify.ts dynamic-import retarget**

- **Found during:** Task 1 (running `pnpm build` after the execGit-shim deletion in commit.ts)
- **Issue:** Three call sites in `sdk/src/query/verify.ts` did `await import('./commit.js')` to access the now-deleted execGit shim. TypeScript build failed with TS2339 across 3 lines.
- **Fix:** Retargeted all three dynamic imports to `'../vcs/index.js'` (the canonical re-export of `execGit` from the VCS module). The 5-field ExecResult shape is a strict superset of the 3-field shim's shape; existing call sites only read `exitCode` and `stdout`, both available in both shapes. Plan 02-10 owns verify.ts's full migration to the high-level adapter API.
- **Files modified:** `sdk/src/query/verify.ts`
- **Verification:** `cd sdk && pnpm build` exits 0; verify.ts's tests still pass.
- **Commit:** Task 1 (`mmkwkkxnllsopnovwyppxlnwkssuloqw`)

### Rule 4 (architectural) deviations

None.

### Plan-spec deviations (scope-bounded interpretation)

**3. [Plan-spec interpretation] commit-diff budget exceeded (15 files vs ≤12 in AC)**

- **What plan asked for:** AC item: "Commit diff lists ≤12 files (commit.ts + commit.test.ts + capture-vcs-baselines.cjs + 8 baseline JSON + baseline-parity.test.ts)."
- **What was done:** 15 files. The 3 extra files are types.ts + backends/git.ts + verify.ts — the Rule 3 closures from above.
- **Why:** The plan didn't anticipate the CommitInput gap-fill or the verify.ts dynamic-import dependency. Both are mechanically necessary; without them the migration can't build.
- **How the AC is satisfied:** Spirit-of-the-AC (mechanical, on-scope, no unrelated edits) preserved. Each extra file is Rule 3 — required to land the migration.

**4. [Plan-spec interpretation] Test-body migration exceeds plan AC (≤4) on favorable side**

- **What plan asked for:** AC item: "`grep -cE "execSync\\(['\"]git " sdk/src/query/commit.test.ts` returns ≤4 (only the gpgsign + user.email/user.name fixture lines from 02-01 remain raw)".
- **What was done:** Migrated those AND the post-state probes (`git log`, `git show`, `git status`, `git diff`) AND the `git rm` setups. The 3 surviving `grep -c` hits are inside docstring comments, not code; **zero raw `execSync('git ...')` invocations remain in test bodies.**
- **Why:** The plan said "Each test case migrates raw `execSync('git …')` into adapter calls." The literal AC budget (≤4) was conservative; mechanical equivalents existed for all 11 post-state probes (`vcs.log` / `vcs.status` / `vcs.diff` / `showCommittedFiles` helper) and the 3 `git rm` setups (`unlink + vcs.stage`).
- **How the AC is satisfied:** ≤4 is satisfied (count = 3, all in comments); spirit-of-the-AC ("commit.test.ts is now adapter-driven") exceeded.

**5. [Plan-spec interpretation] Baselines for `-C` form capture normalized args (no `-C` prefix)**

- **What plan asked for:** Step 1 of Task 1 listed baselines with literal `-C` args, e.g. `args: ['-C', '<dir>', 'add', '--', 'foo']`.
- **What was done:** The 3 c-form baselines (-294/-301/-309) capture the normalized args (no `-C` prefix) since the migration moves cwd from `-C` arg position to `createVcsAdapter(<dir>, …)` factory parameter.
- **Why:** The semantics are byte-identical to running the same command from that cwd. The capture-vcs-baselines.cjs tooling already runs every command from the fixture's tmpdir; capturing normalized args is the natural form for asserting byte-equivalence against the adapter's cwd-via-factory output. Each baseline's `source:` annotation explicitly references the `-C` form line for traceability.
- **How the AC is satisfied:** All 8 baselines exist, parse as JSON, and the 3 c-form baselines pass parity assertions against the adapter's cwd-rooted output.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking gap-fill / dependency repair) + 3 plan-spec interpretations.
**Impact on plan:** All deviations on-scope, verified, and consistent with D-08 mechanical-only. The CommitInput gap-fill is genuinely new contract surface but it landed as adapter-internal extension, not call-site rewriting — all consumers can ignore the new fields.

## Issues Encountered

- **Initial baseline-parity commit-clause failure:** the first version of the `commit -m <msg> -- <pathspec>` dispatch clause re-used the canonical execGit's fixture for the adapter call. The canonical call already committed the staged path → adapter run hit `nothing to commit` (exit 1) on a clean tree. Fixed by re-creating a fresh fixture (`initFixture(baseline)`) before the adapter call; cleanup via `rmSync` in a `finally`. Mirrors the per-fixture re-init pattern landed in 02-07's `rev-parse HEAD` clause.
- **Esbuild parse error in test docstring:** an early version of the docstring contained `**/*.test.ts` (literal glob). The `*/` substring closed the JSDoc block prematurely. Fixed by rewording to `**` test-file glob — same meaning, no embedded `*/`.
- **Pre-existing flaky failures under heavy concurrent test load (out of scope per executor SCOPE BOUNDARY):**
  - `sdk/src/query/config-mutation.test.ts:441` — already documented in STATE.md "Known Pre-Existing Test Failures".
  - `sdk/src/query/query-fallback-executor.test.ts` (timeout) and `sdk/src/query/query-dispatch.test.ts` (timeout) — both pass when run isolated; reproduce only under heavy concurrent vitest load. Verified pristine `phase/02-migration` HEAD (without my changes) reproduces the same flakes. Not introduced by this plan.

## User Setup Required

None — no external configuration changed.

## Next Phase Readiness

- **Plans 02-09 onward unblocked.** Per D-02 ascending-LOC ordering, the next migration targets (in order of remaining LOC) are:
  - `get-shit-done/bin/lib/commands.cjs` (1028 LOC, 1 lint-flagged site at line 994 + execGit sites)
  - `get-shit-done/bin/lib/verify.cjs` (1390 LOC, 9 sites)
  - `get-shit-done/bin/lib/core.cjs` (2036 LOC, 6 sites — largest hotspot, last per D-02; deletion of execGit re-export bundled there)
- **`sdk/src/query/verify.ts` carries 3 dynamic-import retargets to `'../vcs/index.js'` (Rule 3 from this plan).** Plan 02-10 (verify.cjs) is for the .cjs file specifically; verify.ts's full migration to the high-level adapter API may need its own plan or piggy-back on a future TS-side cleanup pass.
- **Lint state on `phase/02-migration`:** dropped to 3 violations / 2 files (was 5 / 3). Remaining:
  - `get-shit-done/bin/lib/commands.cjs:994` (one site — owned by 02-09).
  - `get-shit-done/bin/lib/core.cjs:603, 744` (two sites — owned by 02-11).
- **Baseline corpus:** 32 baselines total (was 24 in 02-07): 1 commands-cjs, 3 init-cjs, 3 init-ts, **9 commit-ts** (was 1; +8), 4 worktree-safety-cjs, 5 check-ship-ready-ts, 1 check-decision-coverage-ts, 3 progress-ts, 1 init-runner-ts, 2 graphify-cjs. baseline-parity dispatch table covers 17 verb shapes (added: `add -- <files>`; `commit -m <msg> -- <pathspec>` non-amend; `rev-parse --short HEAD`).
- **CommitInput gap-fill consumed in production:** sdk/src/query/commit.ts is the first consumer of `amend` / `noVerify` / `pathspec` fields. Future migrations (commands.cjs's `cmdCommit`, verify.cjs's commit verbs, core.cjs's `execGit` re-export deletion) can rely on these fields being adapter-stable.
- **Carried Rule 4 follow-ups (from prior plans, no new in this plan):**
  - `tests/prune-orphaned-worktrees.test.cjs` and `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` await an adapter expansion plan (workspace.add(branchCreate), merge, checkout, branch-rename verbs).
- **Carried testing gaps:**
  - init.cjs's `detectChildRepos` / `cmdInitNewWorkspace` / `cmdInitWorkspaceStatus` (from 02-05).
  - progress.ts's git-touching block exercised only via integration paths (from 02-06).

## Self-Check: PASSED

- Commit `mmkwkkxnllsopnovwyppxlnwkssuloqw` exists on `phase/02-migration`: confirmed via `git log --oneline -3`.
- `cd sdk && pnpm build && pnpm build:cjs` both exit 0: confirmed.
- `cd sdk && pnpm exec vitest run src/vcs/__tests__/` → 149/149 pass: confirmed.
- `cd sdk && pnpm exec vitest run src/vcs/__tests__/baseline-parity.test.ts` → 32/32 pass (was 24; +8): confirmed.
- `cd sdk && pnpm exec vitest run src/query/commit.test.ts` → 21/21 pass: confirmed.
- `grep -cE "spawnSync\\(['\"]git |execSync\\(['\"]git " sdk/src/query/commit.ts` returns 0: confirmed.
- `grep -nE "function execGit\\(" sdk/src/query/commit.ts` returns 0 (local helper deleted): confirmed.
- **W5 — prescriptive import (positive):** `grep -nE "import \\{ createVcsAdapter" sdk/src/query/commit.ts` returns 1 match: confirmed.
- **W5 — prescriptive import (negative):** `grep -nE "import \\{ execGit \\}" sdk/src/query/commit.ts` returns 0 matches: confirmed.
- `grep -nE "vcs\\.stage\\(|vcs\\.diff\\(|vcs\\.commit\\(|vcs\\.refs\\.resolveShort|subVcs\\.stage\\(|subVcs\\.commit\\(|subVcs\\.refs\\.resolveShort" sdk/src/query/commit.ts` returns 9 matches (≥6): confirmed.
- `grep -nE "['\"]\\-C['\"]" sdk/src/query/commit.ts` returns 0 (no `-C` form remains): confirmed.
- `grep -cE "^[^* ].*execSync\\(['\"]git " sdk/src/query/commit.test.ts` (filtering out comments) returns 0: confirmed.
- All 8 baselines exist at `tests/baselines/git-vcs/commit-ts-{148,155,170,179,211,294,301,309}-*.snap.json` and parse as JSON: confirmed (`for f in …; do node -e "JSON.parse(...)"; done`).
- `node scripts/lint-vcs-no-raw-git.cjs` reports 3 violations / 2 files (was 5 / 3 — commit.ts no longer in violation set): confirmed.
- Branch: `phase/02-migration` per D-12: confirmed.
- Per-task commit-diff includes 15 files (3 over the AC budget; 3 Rule 3 closures rationalized in deviation #3): confirmed.

---

*Phase: 02-bulk-call-site-migration-still-git-only*
*Completed: 2026-05-10*
