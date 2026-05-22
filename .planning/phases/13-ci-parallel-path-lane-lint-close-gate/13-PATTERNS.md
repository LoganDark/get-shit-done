# Phase 13: CI parallel-path lane + lint close-gate - Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 4 new files
**Analogs found:** 4 / 4 (all exact or strong role-match)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/audit-workflow-raw-git.cjs` | utility (audit script) | file-I/O (walk + regex scan) | `scripts/audit-id-namespace.cjs` | exact (role + flow + D-06 cites it) |
| `tests/scripts/audit-workflow-raw-git.test.cjs` | test | request-response (pure-function assertions) | `tests/scripts/audit-id-namespace.test.cjs` | exact (same script family) |
| `.github/workflows/parallel-e2e.yml` | config (CI workflow) | event-driven (push/PR trigger) | `.github/workflows/install-smoke.yml` | role-match (single-concern lane) + `test.yml` for matrix/jj-install |
| `scripts/e2e-parallel-phase.sh` | utility (E2E harness) | request-response (CLI subprocess orchestration) | `get-shit-done/workflows/execute-phase.md` dispatch/fan-in sequence | partial (no in-repo `.sh` analog; the harness mirrors a markdown shell sequence) |

**Note on the harness analog gap:** No existing repo file is a shell-script harness driving `gsd-sdk query`. The closest *behavioral* analog is the `execute-phase.md` shell sequence the harness mirrors 1:1 (D-01); the closest *structural* shell-script analog is `scripts/secret-scan.sh` / `scripts/base64-scan.sh` (both `#!/usr/bin/env bash`, `set -euo pipefail`, allowlisted). See "No Analog Found" and the Pattern Assignment for the harness.

## Pattern Assignments

### `scripts/audit-workflow-raw-git.cjs` (utility, file-I/O)

**Primary analog:** `scripts/audit-id-namespace.cjs` (D-06 cites it as the precedent)
**Detection-regex source:** `scripts/lint-vcs-no-raw-git.cjs` `SHELL_GIT_PATTERNS` (lines 85-90)
**Baseline-mechanism analog:** `scripts/check-skip-count.cjs` (regression-guard exit semantics)
**Close-gate exit-code analog:** `scripts/migr-06-close-gate.cjs` (one-shot script shape + `require.main` guard)

This file copies four overlapping patterns. Each is concrete below.

**Shebang + header + strict mode** — copy from `audit-id-namespace.cjs:1-17`:
```javascript
#!/usr/bin/env node
/**
 * audit-id-namespace.cjs (Phase 8 Plan 1, D-01)
 * Pure regex+walker audit ...
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
```

**Pure walker pattern** — copy the directory walk from `audit-id-namespace.cjs:57-66`. The audit walks `.md` files (not `.cjs|.js|.ts`); change only the extension test:
```javascript
function findFiles(dir, results) {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) findFiles(full, results);
		else if (entry.isFile() && SCAN_EXT.test(entry.name)) results.push(full);
	}
}
```
For the audit: `SCAN_EXT = /\.md$/`. RESEARCH.md §"Code Examples" supplies the fence-tracking `scanFile` body (`FENCE_OPEN` / `FENCE_CLOSE` state machine, shell-comment skip).

**Detection regex — copy the literal, do NOT reinvent** — from `lint-vcs-no-raw-git.cjs:85-90`:
```javascript
const SHELL_GIT_PATTERNS = [
  {
    re: /(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/,
    label: "shell `git <cmd>`",
  },
];
```
The audit reuses this regex verbatim inside ` ```bash`/`sh`/`zsh` fences. `lint-vcs-no-raw-git.cjs:133` also shows the shell-comment skip the audit must mirror (`if (isShell && /^\s*#/.test(line)) continue;`).

**Dual-output stdout pattern (D-06: stdout-only, `.md` default / `--json` flag)** — copy from `audit-id-namespace.cjs:100-170` + `:186`:
```javascript
function parseArgv(argv) {
	const out = { json: false };
	for (let i = 2; i < argv.length; i += 1) {
		if (argv[i] === '--json') out.json = true;
	}
	return out;
}
// emitMarkdown(result) → string ; emitJson(result) → string ; both go to stdout:
process.stdout.write(argv.json ? emitJson(result) : emitMarkdown(result));
```

**Markdown table-cell escaping** — copy `escapeMarkdownCell` verbatim from `audit-id-namespace.cjs:142-148` (it handles `\`, `|`, backtick, and newline; the order is load-bearing — escape `\` first):
```javascript
function escapeMarkdownCell(s) {
	return String(s)
		.replace(/\\/g, '\\\\')
		.replace(/\|/g, '\\|')
		.replace(/`/g, '\\`')
		.replace(/\r\n|\r|\n/g, '<br>');
}
```

**`require.main` guard + `module.exports` of pure functions (D-07: unit-testable)** — copy from `audit-id-namespace.cjs:173-189`:
```javascript
if (require.main === module) {
	const argv = parseArgv(process.argv);
	const REPO_ROOT = path.resolve(__dirname, '..');
	const result = auditIdNamespace({ scanRoots: SCAN_ROOTS, repoRoot: REPO_ROOT });
	process.stdout.write(argv.json ? emitJson(result) : emitMarkdown(result));
}
module.exports = { auditIdNamespace, AUDIT_VERDICT, PATTERNS, findFiles, emitMarkdown, emitJson };
```
**Divergence the planner must apply:** `audit-id-namespace.cjs` does NOT call `process.exit()` (it is a seed-generator, always exit 0). The audit IS a CI gate (CI-06) — it must add `process.exit(result.ok ? 0 : 1)` inside the `require.main` block. RESEARCH.md §"Code Examples" line 554 shows this addition explicitly.

**Baseline / regression-guard mechanism (load-bearing — see Open Q1).** The closest analog for "store a baseline, exit non-zero on regression" is `scripts/check-skip-count.cjs`:
- `check-skip-count.cjs` does NOT use an embedded constant or a companion file — its baseline is computed live from `origin/main` via `git ls-tree`/`git show` (`:69-89`). Exit logic is `current.total <= baseline` → `exit 0`, else `exit 1` with a per-file diagnostic (`:109-121`).
- A missing baseline is a *hard error under CI* (`process.env.CI === 'true'` → `exit 1`, `:97-103`) and a warn-and-skip locally — the W-3 "don't let a misconfigured workflow regress freely" pattern.

If Open Q1 resolves to "re-baseline SC2 to a frozen hit count" (RESEARCH.md path 2), the audit needs a baseline constant. `check-skip-count.cjs` shows the *comparison + exit* shape but computes its baseline from VCS — which the audit must NOT do (the audit is VCS-free, pure file-walk). For an embedded-constant baseline, `migr-06-close-gate.cjs:74-78` is the precedent for a hard-coded constant carried in a `.cjs` script with a companion unit test asserting it (`tests/scripts/migr-06-close-gate.test.cjs` asserts the constant against a canonical source). **The planner must resolve Open Q1 before this section can be made concrete** — it changes whether the audit is zero-assertion or baseline-guarded.

**Containment note (security):** `migr-06-close-gate.cjs:55-60` (`assertInsidePhaseDir`) is the in-repo precedent for a path-containment guard against symlink escape from a walked tree. The audit's walk is rooted at fixed `SCAN_ROOTS` constants — a symlinked directory inside a scan root would still be recursed into. Low risk for an in-repo read-only audit; the planner may add a containment note or guard.

---

### `tests/scripts/audit-workflow-raw-git.test.cjs` (test, request-response)

**Primary analog:** `tests/scripts/audit-id-namespace.test.cjs` (same script family — the audit's sibling test)
**D-07 also cites:** `tests/scripts/migr-06-close-gate.test.cjs`

`audit-id-namespace.test.cjs` is the better analog than `migr-06-close-gate.test.cjs`: it tests an *audit script with a pure walker*, exactly the audit's shape. `migr-06-close-gate.test.cjs` tests a single exported `Set` constant — useful only if Open Q1 produces a baseline constant.

**Test-framework imports + module under test** — copy from `audit-id-namespace.test.cjs:1-13`:
```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
	auditWorkflowRawGit,
	scanFile,
	findMarkdown,
} = require('../../scripts/audit-workflow-raw-git.cjs');
```

**`mkdtemp` fixture + try/finally cleanup pattern** — copy the per-test isolation from `audit-id-namespace.test.cjs:39-51`:
```javascript
test('classifier emits row for literal commit_id', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
	try {
		fs.mkdirSync(path.join(tmp, 'sdk/src'), { recursive: true });
		fs.writeFileSync(path.join(tmp, 'sdk/src/x.ts'), `const t = "commit_id";\n`);
		const result = auditIdNamespace({ scanRoots: ['sdk/src'], repoRoot: tmp });
		assert.ok(result.findings.length >= 1);
	} finally {
		fs.rmSync(tmp, { recursive: true });
	}
});
```
The `{ scanRoots, repoRoot }` injectable-options signature (so a test can point the scan at a `mkdtemp` tree) is itself a pattern to copy from `auditIdNamespace` — the audit's exported function must accept the same shape. RESEARCH.md §"Code Examples" supplies two ready test cases (flag-inside-`bash`-fence; no-flag-in-prose-or-`text`-fence) using `rmSync(root, { recursive: true, force: true })` cleanup.

**`--json` output-shape test** — copy the bucket-presence assertion shape from `audit-id-namespace.test.cjs:67-83` (assert `emitJson` returns valid JSON with the expected top-level keys).

**Test runner:** `node:test` runs via the existing `node scripts/run-tests.cjs` runner — no config change. Quick command: `node --test tests/scripts/audit-workflow-raw-git.test.cjs`.

---

### `.github/workflows/parallel-e2e.yml` (config, event-driven)

**Primary analog (structure):** `.github/workflows/install-smoke.yml` (single-concern lane, `paths:` filter, namespaced `concurrency`)
**Matrix + jj-install + `continue-on-error` analog:** `.github/workflows/test.yml`
**Smallest single-concern reference:** `.github/workflows/security-scan.yml`

**Header comment — CI-03 boundary (D-03 requires this file carries its own)** — copy and adapt the boundary block from `test.yml:3-17`:
```yaml
# ─────────────────────────────────────────────────────────────────────────────
# CI-03 (Phase 5 plan 05-05 — D-37 / D-38 docs decision):
# GitHub Actions workflows themselves stay on git — GitHub *is* git. The jj
# port covers the GSD CLI + SDK that USERS run locally / in workspaces; it
# does NOT extend to the workflow runtime ...
# ─────────────────────────────────────────────────────────────────────────────
```
RESEARCH.md §"Pattern 1" supplies the adapted text (adds the clause "The harness this lane runs, however, routes ALL its VCS operations through `gsd-sdk query` (D-09)").

**`concurrency` group (namespaced)** — copy from `install-smoke.yml:42-44`:
```yaml
concurrency:
  group: install-smoke-${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```
For the new lane: `group: parallel-e2e-${{ github.workflow }}-${{ github.head_ref || github.run_id }}`.

**`on:` trigger with `paths:` filter** — copy the `pull_request` + `paths:` + `push`-to-release + `workflow_dispatch` shape from `install-smoke.yml:16-40`. RESEARCH.md §"Pattern 1" specifies the exact `paths:` set (`sdk/src/vcs/**`, `sdk/src/query/workspace-parallel-*.ts`, `get-shit-done/workflows/**`, and the three new files).

**Matrix with `continue-on-error` — INVERTED polarity** — `test.yml:91-109` is the analog; the polarity must be *flipped*:
```yaml
# test.yml:91 — git required, jj allow-fail:
continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}
# ...
strategy:
  fail-fast: false
  matrix:
    backend: [git, jj-colocated, jj-native]
```
The new lane is the **inverse** (`continue-on-error: ${{ matrix.backend == 'git' }}`, `matrix: backend: [git, jj-colocated]`). D-03's whole rationale is that opposite polarities must not co-locate — copy the *shape*, invert the *condition*.

**jj-install step — copy verbatim** from `test.yml:159-169` (the `v0.41.0` tarball-curl block; Renovate keeps the pin current):
```yaml
- name: Install jj
  if: matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native'
  shell: bash
  run: |
    set -euo pipefail
    JJ_VERSION=v0.41.0
    JJ_ARCH=$(uname -m)
    curl -fsSL "https://github.com/jj-vcs/jj/releases/download/${JJ_VERSION}/jj-${JJ_VERSION#v}-${JJ_ARCH}-unknown-linux-musl.tar.gz" \
      | tar xz -C "$RUNNER_TEMP"
    echo "$RUNNER_TEMP" >> "$GITHUB_PATH"
    "$RUNNER_TEMP/jj" --version
```
For the new lane the `if:` drops `jj-native` (`if: matrix.backend == 'jj-colocated'`).

**Action SHA pins — copy verbatim, do NOT re-resolve** — from `test.yml:120` / `:148-151`:
```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
  with:
    fetch-depth: 0
- name: Set up Node.js
  uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f  # v6.3.0
  with:
    node-version: 24
    cache: 'npm'
```

**`npm ci` → `build:sdk` step ordering** — copy from `test.yml:171-175`:
```yaml
- name: Install dependencies
  run: npm ci
- name: Build SDK dist (required by installer)
  run: npm run build:sdk
```
The harness depends on `sdk/dist/cli.js` — `build:sdk` must run before the harness step.

**`needs:`-gated gate job (D-04 option b)** — no in-repo precedent for a `needs:`-result-inspection gate; RESEARCH.md §"Pattern 3" supplies the complete `parallel-e2e-gate` job skeleton (`needs: [parallel-e2e]`, `if: always()`, inspects `needs.parallel-e2e.result` env var, `exit 1` if not `success`). Its job name is the string registered as the required branch-protection check.

**Audit step (CI-06)** — one step: `run: node scripts/audit-workflow-raw-git.cjs` (non-zero exit fails the cell). Modeled on how `test.yml:68-70` runs `lint-vcs-no-raw-git.cjs` as a lint step.

**`shell: bash` on every `run:` step** — universal in `test.yml` / `install-smoke.yml`; copy the convention.

---

### `scripts/e2e-parallel-phase.sh` (utility, request-response)

**Behavioral analog (the sequence it mirrors 1:1):** `get-shit-done/workflows/execute-phase.md` dispatch block (lines 555-561) + fan-in block (lines 769-783)
**Structural shell-script analog:** `scripts/secret-scan.sh` / `scripts/base64-scan.sh` (shebang, `set -euo pipefail`, stderr-status convention)
**Pattern B `mkdtemp` repo-setup analog:** `setupGitRepo` / `setupJjRepo` — the **module-private** functions inside `cmd-parallel-git.test.ts:84-103` and `cmd-parallel-jj.test.ts:63-86` (NOT exported from `vcs-fixture.ts` — see "Shared Patterns" / RESEARCH.md Code Insights)

**Dispatch sequence — copy 1:1 from `execute-phase.md:555-561`:**
```bash
WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')
HANDLE_JSON=$(printf '%s' "$WAVE_WORKTREE_PLANS_JSON" \
  | gsd-sdk query workspace.parallel.dispatch \
      --phase "${PHASE_NUMBER}" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
[ -z "$HANDLE_JSON" ] && { echo "FATAL: workspace.parallel.dispatch returned empty Handle JSON" >&2; exit 1; }
HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')
[ "$HANDLE_OK" = "false" ] && { echo "FATAL: workspace.parallel.dispatch failed: $HANDLE_JSON" >&2; exit 1; }
```

**Fan-in sequence — copy 1:1 from `execute-phase.md:769-783`** (the `mktemp` Handle-file dance is mandatory — the CLI rejects `--handle @- --results @-`, RESEARCH.md Pitfall 2):
```bash
HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXXXX.json")
printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
  | gsd-sdk query workspace.parallel.fan-in --handle "@$HANDLE_FILE" --results @-)
rm -f "$HANDLE_FILE"
CONFLICTED=$(echo "$FAN_RESULT" | jq -r '.conflicted // false')
MERGED_COUNT=$(echo "$FAN_RESULT" | jq -r '.merged // [] | length')
```

**Shell-script preamble** — copy from `scripts/secret-scan.sh` head: `#!/usr/bin/env bash` (NOT `#!/bin/zsh` — CI steps use `shell: bash`, and `test.yml` `run:` blocks all open with `set -euo pipefail`). Status prints go to stderr (`>&2`); only the harness's machine-output (if any) goes to stdout.

**Throwaway-repo construction (D-05 + D-09).** The `setupGitRepo`/`setupJjRepo` *test-local* functions show the canonical seed-repo recipe — but they use raw `git init`/`git config`/`git add`/`git commit`, which a `.sh` harness CANNOT copy (raw `git` in a `.sh` file is flagged by `lint-vcs-no-raw-git.cjs` `SHELL_GIT_PATTERNS`, breaking the D-09 +1 budget). Copy the *structure* (random-prefix `mkdtemp` outside the repo, one seed commit, materialize `.planning/phases/13-…/`) but route every git operation through `gsd-sdk query`. Raw `jj` is fine — the jj seed recipe from `setupJjRepo:70-85` (`jj git init --colocate`, `jj config set`, `jj squash`) is lint-clean and copyable verbatim for the jj cell:
```javascript
// cmd-parallel-jj.test.ts:70-85 — jj seed recipe, lint-clean (no raw GIT)
execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
writeFileSync(join(dir, 'seed.txt'), 'seed\n');
execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
mkdirSync(join(dir, '.planning', 'phases', '09-test'), { recursive: true });
```

**`mkdtemp` placement** — `setupGitRepo:85-90` / `setupJjRepo:64-69` use `mkdtempSync(join(tmpdir(), 'gsd-{git,jj}-parallel-<random>-'))`. The harness `.sh` equivalent: `mkdtemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gsd-e2e-XXXXXX"` — **outside** the colocated repo (RESEARCH.md Pitfall 6: a repo created inside `$GITHUB_WORKSPACE` pollutes the outer jj working copy).

**`gsd-sdk` invocation in CI** — parameterize the SDK call. RESEARCH.md §"Pattern 4": after `npm run build:sdk`, `node "$GITHUB_WORKSPACE/sdk/dist/cli.js" <args>` is the exact equivalent of `gsd-sdk <args>` (the `bin/gsd-sdk.js` shim is `spawnSync(node, [sdk/dist/cli.js, ...args])`). The harness should accept the invocation via an env var so it works both in CI and globally-installed.

**Per-workspace commit verb (SC5 hook-fire — load-bearing).** The jj cell's per-workspace commit must go through `gsd-sdk query commit`, NOT raw `jj squash`. Verified: `sdk/src/query/commit.ts:134` does `const vcs = createVcsAdapter(projectDir)` and `:168` calls `vcs.commit({...})` — the jj adapter's `commit()` (per CONTEXT.md canonical ref `jj.ts:249-289`) is what fires `.githooks/pre-commit`. A raw `jj squash` bypasses the adapter and the hook never fires (RESEARCH.md Pitfall 3). The contract tests use raw `jj squash` (`cmd-parallel-jj.test.ts:80`) — the harness must NOT copy that for the commit step; it copies the verb-routed path instead. `commit.ts` flag surface (verified): `args[0..]` = message words, `--files <paths>` after a `--files` sentinel, plus `--force`/`--amend`/`--no-verify` flags; it resolves `projectDir` from cwd.

## Shared Patterns

### Stdout-only tooling output (D-06 — applies to the audit script; the principle applies repo-wide)
**Source:** `scripts/audit-id-namespace.cjs` (`process.stdout.write(...)`, no `fs.writeFile` of a report) and `scripts/migr-06-close-gate.cjs` (logs to `console.log`, writes only the files it migrates).
**Apply to:** `scripts/audit-workflow-raw-git.cjs` — it MUST write nothing to disk. Both `.md` and `--json` modes emit to stdout. This is the colocated-jj no-auto-track constraint (any file written to the working tree is snapshotted by the next `jj` invocation). CONFIRMED against project CLAUDE.md / MEMORY (`feedback_avoid_jj_auto_tracked_output`).
```javascript
// audit-id-namespace.cjs:186 — the whole output surface, one line, stdout-only
process.stdout.write(argv.json ? emitJson(result) : emitMarkdown(result));
```

### No raw `git` in scanned shell/JS files (D-09 — the LINT-05 +1 budget)
**Source:** `scripts/lint-vcs-no-raw-git.cjs` — its `SCAN_EXT` (`:63`) includes `.sh`/`.bash` and all JS/TS; its `SHELL_GIT_PATTERNS` (`:85-90`) flags start-of-statement `git <cmd>`.
**Apply to:** `scripts/e2e-parallel-phase.sh` — every git operation routes through `gsd-sdk query`; raw `jj` is permitted (the lint is no-raw-*git*, not no-raw-jj). The audit `.cjs` and the test `.cjs` are pure file-walkers — they invoke no VCS at all, so they are inherently clean.
**Escape hatch the harness must NOT use:** `# vcs-lint:allow-git-here <reason>` (`lint-vcs-no-raw-git.cjs:54`) — using it, or adding an allowlist entry, breaks D-09's locked +1 budget.

### Pattern B `mkdtemp` fixture isolation (TEST-16 / Pitfall 9)
**Source:** `setupGitRepo` (`cmd-parallel-git.test.ts:84-103`) and `setupJjRepo` (`cmd-parallel-jj.test.ts:63-86`) — random-suffix prefix, one seed commit, `.planning/phases/NN-test/` materialized, `rmSync` teardown.
**IMPORTANT — these are NOT shared exports.** CONTEXT.md repeatedly calls `setupGitRepo`/`setupJjRepo` "the already-allowlisted `vcs-fixture.ts` helpers." RESEARCH.md §"Code Insights" verified this is false: `vcs-fixture.ts` exports only `makeBackendFixture`, `selectedBackends`, `__vcsTestOnly`, `VcsFixture`. The functions named `setupGitRepo`/`setupJjRepo` are module-private, defined inside each contract test, and vitest-shaped. **Treat RESEARCH.md as authoritative.** The harness cannot `require()` them — it copies the *recipe*, not the symbol. The D-09 "reuse the allowlisted helper" mitigation is not viable; "route through `gsd-sdk query`" (mitigation 1) is the path.
**Apply to:** `scripts/e2e-parallel-phase.sh` (its throwaway repo) and `tests/scripts/audit-workflow-raw-git.test.cjs` (its per-test `mkdtemp` trees).

### `require.main` guard for testable scripts (D-07)
**Source:** `audit-id-namespace.cjs:173` (`if (require.main === module) { ... }`) and `migr-06-close-gate.cjs:257`. Both end with `module.exports = { ...pure functions }` so a `tests/scripts/*.test.cjs` can `require()` the script without triggering its `main`.
**Apply to:** `scripts/audit-workflow-raw-git.cjs` — wrap the CLI entrypoint in `require.main === module`, export `auditWorkflowRawGit` / `scanFile` / `findMarkdown` for the unit test.

### CI step conventions (`shell: bash` + `set -euo pipefail` + SHA-pinned actions)
**Source:** `test.yml` and `install-smoke.yml` — every `run:` block declares `shell: bash`; multi-line `run:` blocks open with `set -euo pipefail`; both GitHub Actions are SHA-pinned with a trailing `# vX.Y.Z` comment.
**Apply to:** `.github/workflows/parallel-e2e.yml` — all steps. Copy the two action SHA pins verbatim from `test.yml`; do not re-resolve the tags.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/e2e-parallel-phase.sh` (the harness *as a whole*) | utility | request-response | No existing `.sh` file in the repo is a `gsd-sdk query`-driving E2E harness. The repo's `scripts/*.sh` files (`secret-scan.sh`, `base64-scan.sh`, `prompt-injection-scan.sh`, `verify-tarball-sdk-dist.sh`) are diff-scanners / packaging checks, not parallel-dispatch drivers. The harness's *behavior* has a 1:1 analog — the `execute-phase.md` shell sequence (lines 555-561 / 769-783) — but that analog lives in workflow markdown, not in an executable file. The planner assembles the harness from: (a) the `execute-phase.md` sequence for the verb calls, (b) the `setupJjRepo` recipe for jj seed setup, (c) `secret-scan.sh` for the shell-script skeleton (shebang, `set -euo pipefail`, stderr status). RESEARCH.md §"Code Examples" + §"Verified Verb Surface" supply the concrete contract details. |

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `parallel-e2e-gate` job (inside `parallel-e2e.yml`) | config | event-driven | No in-repo workflow uses a `needs:`-gated result-inspection summary job. The repo's existing workflows either use a plain matrix or independent jobs. The gate job is a new GitHub Actions idiom for this repo — RESEARCH.md §"Pattern 3" supplies the full skeleton (`needs:` + `if: always()` + `needs.<job>.result` inspection). Planner should add the deliberate red-cell test RESEARCH.md flags (Assumption A2) to confirm `needs.<job>.result` aggregation semantics before relying on it for branch protection. |

## Open Items Flagged for the Planner

These are not pattern gaps — they are unresolved design questions from RESEARCH.md that change which pattern applies:

1. **Open Q1 (HIGH) — audit scan scope.** RESEARCH.md found 127 raw-git hits across 30 `.md` files; ROADMAP SC2 / CONTEXT.md D-08 expect *zero* on first green run. The resolution (narrow the audit's detection scope / re-baseline SC2 to a frozen count / cleanup task) determines whether `audit-workflow-raw-git.cjs` is a **zero-assertion gate** (no baseline needed — just `exit(ok ? 0 : 1)`, the `audit-id-namespace.cjs` shape) or a **baseline-regression guard** (needs an embedded baseline constant + a unit test asserting it — the `check-skip-count.cjs` comparison shape adapted to a hard-coded constant per `migr-06-close-gate.cjs:74-78`). The "Baseline-mechanism analog" subsection above covers both; the planner picks once Q1 is resolved.
2. **Harness language (Claude's Discretion + D-09).** RESEARCH.md recommends `.sh` routing through `gsd-sdk query` — because the `.cjs`-can-`require()`-allowlisted-helpers argument rests on `setupGitRepo`/`setupJjRepo` exports that do not exist. The Pattern Assignment for the harness assumes the `.sh` path.
3. **D-04 gate-job mechanism.** RESEARCH.md recommends option (b), the `needs:`-gated all-green job. The Pattern Assignment assumes (b).

## Metadata

**Analog search scope:** `.github/workflows/`, `scripts/`, `tests/scripts/`, `sdk/src/vcs/__tests__/`, `sdk/src/query/`, `get-shit-done/workflows/execute-phase.md`
**Files scanned (read in full or in targeted ranges):** 13 — `audit-id-namespace.cjs`, `check-skip-count.cjs`, `lint-vcs-no-raw-git.cjs`, `lint-vcs-no-raw-git.allow.json`, `migr-06-close-gate.cjs`, `audit-id-namespace.test.cjs`, `migr-06-close-gate.test.cjs`, `install-smoke.yml`, `test.yml`, `security-scan.yml`, `cmd-parallel-git.test.ts`, `cmd-parallel-jj.test.ts`, `commit.ts`, plus `execute-phase.md` dispatch/fan-in sections
**Pattern extraction date:** 2026-05-22
