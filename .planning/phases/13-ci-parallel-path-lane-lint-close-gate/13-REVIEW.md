---
phase: 13-ci-parallel-path-lane-lint-close-gate
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - .github/workflows/parallel-e2e.yml
  - scripts/audit-workflow-raw-git.cjs
  - scripts/e2e-parallel-phase.sh
  - tests/scripts/audit-workflow-raw-git.test.cjs
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 13 ships a CI parallel-dispatch E2E lane (`parallel-e2e.yml`), its harness
(`e2e-parallel-phase.sh`), a raw-git baseline-regression audit
(`audit-workflow-raw-git.cjs`), and a unit test for that audit. The phase
context (frozen 127-hit baseline, `Object.freeze`d constant, `jj "git" init`
lint-evasion, GitHub-Actions-runs-on-git CI-03 boundary) was honored and is not
flagged.

The audit script itself is correct: a fresh scan reproduces the baseline exactly
(127 hits / 30 files, `regressions: 0`), the per-file regression rule treats
removals as non-regressions, it is cwd-independent, and it writes nothing to
disk. The harness is lint-clean (zero raw `git` in non-comment lines, verified
against the production `SHELL_GIT_RE`).

The blocking defect is in test wiring: the new unit test lives at
`tests/scripts/audit-workflow-raw-git.test.cjs`, but the project test runner
(`scripts/run-tests.cjs`) does a non-recursive `readdirSync('tests')` and only
discovers `tests/*.test.cjs`. The test is never executed by `npm test` or any
CI lane — it provides zero regression protection despite being shipped as the
phase's verification artifact. Remaining findings are robustness gaps in the
audit's fence parser and dead code in the harness.

## Critical Issues

### CR-01: Phase's unit test is never executed by any runner — dead verification artifact

**File:** `tests/scripts/audit-workflow-raw-git.test.cjs:1` (root cause in `scripts/run-tests.cjs:12`)
**Issue:** The phase ships `tests/scripts/audit-workflow-raw-git.test.cjs` as the
regression test for `audit-workflow-raw-git.cjs`. The project test entry point
`npm test` -> `scripts/run-tests.cjs` discovers test files with:

```js
const files = readdirSync(testDir)            // testDir = tests/
  .filter(f => f.endsWith('.test.cjs'))
```

`readdirSync` is **non-recursive** and `testDir` is `tests/`, so it only matches
`tests/*.test.cjs`. The new file is one directory deeper (`tests/scripts/`) and
is therefore never collected. Confirmed: no GitHub Actions workflow, `Makefile`,
or npm script references `tests/scripts`. The 7 well-written test cases run
nowhere — the audit has no executing regression guard, so a future edit that
breaks fence detection or the per-file comparison would ship green.

The script's docblock cites `tests/scripts/migr-06-close-gate.test.cjs` as the
"D-07-cited unit-test precedent." That precedent file is *also* in `tests/scripts/`
and is *also* never run — so the phase faithfully copied a pre-existing dead-test
pattern rather than a working one. Following a broken precedent does not make the
new test live.

**Fix:** Either place the test where the runner finds it:

```
git mv tests/scripts/audit-workflow-raw-git.test.cjs \
       tests/audit-workflow-raw-git.test.cjs
# update the require() path inside the file:
#   require('../../scripts/...')  ->  require('../scripts/...')
```

or make the runner recurse (also rescues the other 4 stranded `tests/scripts/*`
files):

```js
const files = readdirSync(testDir, { recursive: true })
  .filter(f => f.endsWith('.test.cjs'))
  .sort()
  .map(f => join('tests', f));
```

Whichever path is chosen, also wire `node scripts/audit-workflow-raw-git.cjs`
and its test into a CI lane — the audit is documented as the CI-06 gate but the
test backing it must actually run.

## Warnings

### WR-01: Audit fence parser misreads a `bash`/`sh`/`zsh` fence nested inside a non-shell fence

**File:** `scripts/audit-workflow-raw-git.cjs:48-49,119-128`
**Issue:** `scanFile` tracks a single boolean `inFence`. `FENCE_OPEN` only matches
fences with a `bash`/`sh`/`zsh` label, so a literal ` ```bash ` line that appears
*inside* an already-open non-shell fence (e.g. a workflow `.md` documenting how
to author a shell fence inside a ` ```text ` or ` ```markdown ` block) is treated
as a real fence open. Any `git <cmd>` text in that documentation block then gets
counted as a raw-git hit. The inverse also holds: the parser does not match the
fence delimiter type, so a ` ~~~bash ` fence is closed by the next ` ``` ` line.
The current baseline happens to match exactly (127/127) so this is latent today,
but it makes the regression guard fragile: an unrelated docs edit that adds a
nested fence example could produce a spurious CI-06 failure, or mask a real one.

**Fix:** Track fence delimiter and length so a fence only closes on a matching
(or longer) run of the same character, and ignore opens while already inside a
fence. Minimal version:

```js
let fence = null; // { char, len } or null
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const open = line.match(/^\s*(`{3,}|~{3,})\s*(bash|sh|zsh)\b/i);
  const close = line.match(/^\s*(`{3,}|~{3,})\s*$/);
  if (!fence && open) { fence = { char: open[1][0], len: open[1].length }; continue; }
  if (fence && close && close[1][0] === fence.char && close[1].length >= fence.len) {
    fence = null; continue;
  }
  if (!fence) continue;
  // ... comment-skip + SHELL_GIT_RE as before
}
```

### WR-02: `WORKSPACE_PATHS` is computed then never used (dead code)

**File:** `scripts/e2e-parallel-phase.sh:219`
**Issue:** `WORKSPACE_PATHS=$(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces[].path')`
is assigned but never referenced. The per-workspace loop on line 225-246 re-derives
the `path<TAB>agentId` pairs directly from `$HANDLE_JSON` via a separate `jq`
invocation feeding the here-string. The orphaned assignment is a misread hazard
in a harness whose stated design value is "fidelity, not smoke test" — a reader
will assume `WORKSPACE_PATHS` drives the loop and may edit it expecting an effect.

**Fix:** Delete line 219. `WORKSPACE_COUNT` (line 220) is genuinely used (lines
248, 351) and should stay.

### WR-03: `jj config set` failures are silently swallowed, can mask a broken seed

**File:** `scripts/e2e-parallel-phase.sh:144-145`
**Issue:** Both `jj config set --repo user.email/user.name` calls end with
`|| true`, discarding any non-zero exit. Every other `jj` setup step in this
file (`jj "git" init`, `jj squash`, `jj bookmark set`) uses an explicit
`|| { echo FATAL ...; exit 1; }` guard. If `jj config set` fails — wrong jj
version, malformed repo, permissions — the harness proceeds with no committer
identity configured. On the jj cell the subsequent `jj squash` would then fail
anyway, but with a misleading "seed squash failed" diagnostic that points at the
wrong step. Silent error-swallow in a CI harness contradicts the file's own
"diagnostic on stderr" / D-02 assertion contract.

**Fix:** Guard them like the surrounding steps:

```sh
( cd "$REPO" && jj config set --repo user.email "e2e@gsd.test" >/dev/null 2>&1 ) \
  || { echo "FATAL: 'jj config set user.email' failed in ${REPO}" >&2; exit 1; }
( cd "$REPO" && jj config set --repo user.name "GSD E2E" >/dev/null 2>&1 ) \
  || { echo "FATAL: 'jj config set user.name' failed in ${REPO}" >&2; exit 1; }
```

If a missing identity is genuinely tolerable, replace `|| true` with a comment
explaining why; a bare `|| true` reads as an unexplained swallow.

### WR-04: `parseArgv` silently ignores unrecognized flags

**File:** `scripts/audit-workflow-raw-git.cjs:169-175`
**Issue:** `parseArgv` only inspects argv entries for an exact `--json` match;
every other token is discarded with no error. A typo such as `--jsno` or
`--format=json` produces the default markdown report and exit 0, with no signal
that the requested mode was not honored. In CI this is a silent-misconfiguration
trap: a lane intending machine-readable JSON output would parse a markdown
document instead.

**Fix:** Reject unknown arguments:

```js
function parseArgv(argv) {
  const out = { json: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--json') out.json = true;
    else {
      process.stderr.write(`audit-workflow-raw-git: unknown argument '${argv[i]}'\n`);
      process.exit(2);
    }
  }
  return out;
}
```

## Info

### IN-01: `emitJson` and `emitMarkdown` each call `new Date()` independently

**File:** `scripts/audit-workflow-raw-git.cjs:192,219,226`
**Issue:** `emitMarkdown` calls `new Date().toISOString()` and `emitJson` calls it
again separately. Within one process only one emitter runs, so there is no
current correctness bug, but the timestamp is recomputed at format time rather
than captured once at audit time. A future change that emits both formats (or
logs a timestamp elsewhere) would get two slightly different clock reads.
**Fix:** Capture `const scannedAt = new Date().toISOString()` once in
`auditWorkflowRawGit`, return it on the result object, and have both emitters
read `result.scannedAt`.

### IN-02: `$GSD_SDK` relies on unquoted word-splitting

**File:** `scripts/e2e-parallel-phase.sh:181,238,270`
**Issue:** `GSD_SDK` holds a multi-word string (`node $GITHUB_WORKSPACE/sdk/dist/cli.js`)
and is used unquoted (`$GSD_SDK query ...`) so the shell word-splits `node` from
the path. This works only because `RUNNER_TEMP`/`GITHUB_WORKSPACE` on
ubuntu-latest contain no spaces. A space anywhere in the workspace path would
split the path into separate arguments and the SDK invocation would fail
obscurely. Acceptable for the CI runner today; fragile if the harness is ever
run locally from a spaced path.
**Fix:** Use a bash array (`GSD_SDK=(node "$GITHUB_WORKSPACE/sdk/dist/cli.js")`
then `"${GSD_SDK[@]}" query ...`), or document the no-spaces assumption inline.

### IN-03: `npm ci` / `cache: 'npm'` used in a pnpm-managed repo

**File:** `.github/workflows/parallel-e2e.yml:83,104,109`
**Issue:** The repo declares `packageManager: pnpm@11.0.8` and ships only
`pnpm-lock.yaml` (no `package-lock.json`); `build:sdk` is `pnpm --filter ...`.
The workflow uses `cache: 'npm'`, `npm ci`, and `npm run build:sdk`. This is a
pre-existing repo-wide CI pattern — `test.yml` does the identical thing and the
file explicitly states the install/jj blocks are "copied VERBATIM from test.yml."
It is therefore not a Phase 13 regression, and `npm` can run `pnpm`-defined
scripts, but `npm ci` against a repo with no `package-lock.json` is brittle and
the `npm` cache key never hits a pnpm store. Flagged for visibility, not as a
phase defect — if addressed, fix `test.yml` and `parallel-e2e.yml` together.
**Fix:** Out of scope to fix here; track separately as a CI-hygiene cleanup
across all workflows (adopt `pnpm/action-setup` + `cache: 'pnpm'`).

---

_Reviewed: 2026-05-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
