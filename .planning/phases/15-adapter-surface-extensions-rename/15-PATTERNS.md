# Phase 15: Adapter surface extensions + rename — Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 36 (10 NEW + 26 MODIFIED — counts production-code + audit tests; planning-doc renames are excluded per Open Question 1 default policy)
**Analogs found:** 36 / 36

## File Classification

### NEW files (created by the phase)

| New File | Plan | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|------|-----------|----------------|---------------|
| `sdk/src/vcs/jj/workspace-cleanup.ts` | 15.04 W1 | sidecar helper | file-I/O + shell-out (transform) | `sdk/src/vcs/jj/reap.ts` + `sdk/src/vcs/jj/conflict-paths.ts` | exact (sidecar family) |
| `sdk/src/query/workspace-parallel-cancel.ts` | 15.04 W2 | CLI bridge | request-response (JSON over CLI) | `sdk/src/query/workspace-parallel-dispatch.ts` + `sdk/src/query/workspace-parallel-fan-in.ts` | exact (sibling verb) |
| `scripts/audit-root-commits-rename.cjs` | 15.01 W1 | audit script | file-walker → stdout JSON | `scripts/audit-id-namespace.cjs` + `scripts/audit-workflow-raw-git.cjs` | exact (audit family) |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` | 15.04 W2 | test (per-backend runtime) | request-response | `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:97-200` | exact (Pattern A/B/W2 sibling) |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts` | 15.04 W2 | test (per-backend runtime) | request-response | `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (mirrored to git fixture) | role-match (git fixture variant) |
| `sdk/src/vcs/jj/__tests__/workspace-cleanup.test.ts` (or sibling location) | 15.04 W1 | unit test | file-I/O behavior | `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` Pattern B fixture (mkdtemp) | role-match (no reap unit test exists) |
| `tests/scripts/audit-root-commits-rename.test.cjs` | 15.01 W1 | unit test (node:test) | pure-function behavior | `tests/scripts/audit-id-namespace.test.cjs` | exact |
| `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` | 15.01 W1 | data artifact | stdout-redirect of audit script | `.planning/intel/id-namespace-audit.json` | exact (JSON sidecar precedent) |

Note: `performJjParallelCancel` and `performGitParallelCancel` are NEW exports added to existing files `sdk/src/vcs/jj/parallel.ts` and `sdk/src/vcs/git/parallel.ts` — these count as MODIFIED-file edits, not new files.

### MODIFIED files (existing files extended/renamed)

| Modified File | Plan | Role | Data Flow | Edit Type |
|---------------|------|------|-----------|-----------|
| `sdk/src/vcs/types.ts` | 15.01, 15.02, 15.03, 15.04 | type definitions | interface declarations | rename + 3 new methods + new `CancelResult` interface |
| `sdk/src/vcs/backends.ts` | 15.01, 15.02, 15.03, 15.04 | capability matrix | constant lookup | line 79 STRING LITERAL flip + 3 new entries |
| `sdk/src/vcs/backends/git.ts` | 15.01, 15.02, 15.03, 15.04 | backend impl | request-response | rename + 2 new ref methods + parallel.cancel wire-in |
| `sdk/src/vcs/backends/jj.ts` | 15.01, 15.02, 15.03, 15.04 | backend impl | request-response | rename + 2 new ref methods + parallel.cancel wire-in |
| `sdk/src/vcs/jj/parallel.ts` | 15.04 W2 | sidecar composition | request-response | add `performJjParallelCancel` export |
| `sdk/src/vcs/git/parallel.ts` | 15.04 W2 | sidecar composition | request-response | add `performGitParallelCancel` export |
| `sdk/src/query/command-static-catalog-domain.ts` | 15.04 W2 | CLI catalog | constant lookup | 2 new entries (dotted + space-tokenized) |
| `sdk/src/query/command-manifest.non-family.ts` | 15.04 W2 | CLI manifest | constant lookup | 1 new entry (canonical + alias + mutation:true) |
| `sdk/src/query/command-aliases.generated.ts` | 15.04 W2 | CLI aliases | constant lookup | 1 new entry (alphabetical insertion) |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | 15.02, 15.03 | cross-backend contract test | request-response | new `test.skipIf(!ready('refs.idAlphabet'))` + 10-case matchPrefix |
| `sdk/src/vcs/__tests__/backends.test.ts` | 15.01, 15.02, 15.03, 15.04 | capability-matrix test | constant lookup | 4 new presence assertions + 1 anti-assertion for `refs.rootCommits` |
| `sdk/src/query/progress.ts` (line 288, 293) | 15.01 | production caller | request-response | rename (TS — compiler-caught) |
| `sdk/src/vcs/__tests__/git-backend.test.ts` (lines 414, 419) | 15.01 | test | request-response | rename + describe label |
| `sdk/src/vcs/__tests__/jj-skeleton.test.ts` (lines 147, 148) | 15.01 | test | request-response | rename + describe label |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` (lines 234, 238) | 15.01 | test | request-response | rename |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` (lines 162, 215, 216, 217, 220) | 15.01 | test | request-response | rename |
| `get-shit-done/bin/lib/commands.cjs` (lines 998, 1005) | 15.01 | CJS caller | request-response | rename (CJS — compiler does NOT catch; Pitfall 2 site) |
| `tests/__tools__/capture-vcs-baselines.cjs` (line 414) | 15.01 | test scaffolding (CJS) | request-response | rename (comment-only) |
| `.planning/PROJECT.md` + `.planning/STATE.md` (active sections only) | 15.01 | docs | prose | rename in active sections; historical-prose carve-out elsewhere |

Total: **8 NEW files + 26 MODIFIED files = 34 files**.

## Pattern Assignments

### `sdk/src/vcs/jj/workspace-cleanup.ts` (NEW — Plan 15.04 W1)

**Role:** Sidecar helper exported from `jj/`; consumed by 15.04 cancel verb body + Phase 16 fanIn clean-path branch + Phase 16 `scripts/dogfood-restore.sh`.

**Closest analog:** `sdk/src/vcs/jj/reap.ts` (sidecar shape + abandon+forget+rm-rf flow) + `sdk/src/vcs/jj/conflict-paths.ts` (file-header + UPSTREAM-02 import discipline).

**Why these analogs:** All three live under `jj/` (UPSTREAM-02 sidecar discipline — no import from `backends/jj.ts`); all three compose `vcsExec` shell-outs + `node:fs` filesystem ops; all three return frozen pure-JSON envelopes. `reap.ts` provides the per-workspace teardown flow; `conflict-paths.ts` provides the shortest verifiable header template.

**File-header pattern** (`jj/conflict-paths.ts:1-30`):

```typescript
/**
 * sdk/src/vcs/jj/conflict-paths.ts — Phase 9 (VCS-17, UPSTREAM-02)
 *
 * Extracted from `backends/jj.ts:524-557` (Phase 9 plan 02 task 1). The
 * original closure form lived inside the JjVcsAdapter factory; lifting it to
 * a pure sidecar function lets both `jj/reap.ts` (...) and the upcoming
 * `jj/parallel.ts` (plan 03) consume the helper without violating UPSTREAM-02
 * (no `from '../backends/jj'` imports inside `sdk/src/vcs/jj/*`).
 *
 * UPSTREAM-02 sidecar discipline: this file does NOT import from
 * `backends/jj.ts`. The mandatory-flags prefix is inlined verbatim per the
 * `octopus.ts:39-47` / `reap.ts:33-41` template.
 */

import { vcsExec } from '../exec.js';

/**
 * Inline mandatory-flags prefix — copy of `backends/jj.ts::jjArgv`'s flag
 * portion. UPSTREAM-02: avoids the backends import.
 */
function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

**Per-workspace teardown pattern** (`jj/reap.ts:174-189`) — adapted from reap, with the `throw` paths converted to `failedReaped.push` per D-06 idempotency contract:

```typescript
const forgetArgs = [
	...jjArgvFlags(opts.mainRepoRoot),
	'workspace', 'forget', '--', entry.name,
];
const forgetRes = vcsExec(opts.mainRepoRoot, 'jj', forgetArgs);
// reap throws on non-zero here; cancel helper IGNORES exitCode per D-06
// (workspace may already be forgotten — that's not an error).

// Pitfall 3: jj workspace forget does NOT remove the on-disk dir.
// reap rm's it here for the empty-head case so the orchestrator
// observes a clean tree.
if (existsSync(entry.path)) {
	rmSync(entry.path, { recursive: true, force: true });
}
```

**Skeleton (verbatim from 15-RESEARCH.md §"Helper Sidecar Pattern" lines 514-583) — paste-ready:**

```typescript
import { readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { vcsExec } from '../exec.js';

function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

export interface CleanupSubagentWorkspacesResult {
	abandoned: readonly string[];
	failedReaped: readonly string[];
}

export function cleanupSubagentWorkspaces(
	mainRepoRoot: string,
	phaseNumber: number,
): CleanupSubagentWorkspacesResult {
	const phaseTag = String(phaseNumber).padStart(2, '0');
	const workspacesParent = join(mainRepoRoot, '.claude', 'jj-workspaces');
	const abandoned: string[] = [];
	const failedReaped: string[] = [];

	if (!existsSync(workspacesParent)) {
		return Object.freeze({
			abandoned: Object.freeze([]) as readonly string[],
			failedReaped: Object.freeze([]) as readonly string[],
		});
	}

	const entries = readdirSync(workspacesParent);
	const matchPrefix = `phase-${phaseTag}-subagent-`;

	for (const name of entries) {
		if (!name.startsWith(matchPrefix)) continue;
		const path = join(workspacesParent, name);
		if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) continue;

		const forgetArgs = [...jjArgvFlags(mainRepoRoot), 'workspace', 'forget', '--', name];
		vcsExec(mainRepoRoot, 'jj', forgetArgs);  // ignore exitCode per D-06

		try {
			rmSync(path, { recursive: true, force: true });
			abandoned.push(name);
		} catch {
			failedReaped.push(name);
		}
	}

	return Object.freeze({
		abandoned: Object.freeze(abandoned.slice()) as readonly string[],
		failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
	});
}
```

**Divergences (don't copy):**
- `reap.ts`'s W3 (a) contract is "leave conflicted workspaces for inspection" — cancel helper's contract is "tear down everything explicitly requested." Same file family, OPPOSITE post-conditions.
- `reap.ts` throws on `jj workspace forget` non-zero exit; cancel helper IGNORES exit code (D-06 idempotency).
- `reap.ts` does conflict-probe + empty-tree-probe (`hasInTreeConflict` + `probeEmptyDiff`); cancel helper does NEITHER — it just tears down.
- D-05 names the first param `phaseRoot` but RESEARCH §"Helper Sidecar Pattern" / A6 / Open Q2 recommends renaming to `mainRepoRoot` for clarity. Planner should confirm with user at 15.04 planning time.

---

### `sdk/src/query/workspace-parallel-cancel.ts` (NEW — Plan 15.04 W2)

**Role:** CLI bridge between the `gsd-sdk query workspace.parallel.cancel` invocation and the `vcs.workspace.parallel.cancel()` method on the adapter.

**Closest analog:** `sdk/src/query/workspace-parallel-dispatch.ts` (sibling verb in the same namespace) + `sdk/src/query/workspace-parallel-fan-in.ts` (also sibling).

**Why these analogs:** All three are part of the same parallel-namespace CLI bridge family, registered at the same three sites (catalog-domain + manifest.non-family + aliases.generated). dispatch + fan-in already implement the `--cwd` flag, `@-` / `@<path>` file-or-stdin convention, and JSON-envelope error reasons — cancel mirrors verbatim.

**Imports + handler signature pattern** (`workspace-parallel-dispatch.ts:1-43`):

```typescript
/**
 * sdk/src/query/workspace-parallel-dispatch.ts — Phase 11 plan 02 Task 2a
 *
 * CLI bridge for `vcs.workspace.parallel.dispatch`. Per Phase 11 D-01 the
 * orchestrator holds the `ParallelDispatchHandle` JSON in a shell variable
 * only — no manifest file on disk. This handler prints the frozen Handle JSON
 * to stdout for the orchestrator to capture and iterate via `jq`.
 */

import { readFileSync } from 'node:fs';
import { loadConfig } from '../config.js';
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

function resolvePlanInput(raw: string): string {
	if (raw === '@-') {
		return readFileSync(0, 'utf-8');
	}
	if (raw.startsWith('@')) {
		return readFileSync(raw.slice(1), 'utf-8');
	}
	return raw;
}

export const workspaceParallelDispatchQuery: QueryHandler = async (args, projectDir) => {
	let cwd = projectDir;
	// … argv parser loop …
};
```

**Argv loop + JSON-parse + envelope pattern** (`workspace-parallel-dispatch.ts:50-100`):

```typescript
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--cwd' && args[i + 1]) {
		cwd = args[++i];
	} else if (args[i] === '--plan' && args[i + 1]) {
		planRaw = args[++i];
	}
	// …
}

if (planRaw === undefined) {
	return { data: { ok: false, reason: 'plan_required' } };
}

let plan: …;
try {
	const planText = resolvePlanInput(planRaw);
	plan = JSON.parse(planText);
} catch (err) {
	return {
		data: {
			ok: false,
			reason: 'plan_json_parse_failed',
			error: err instanceof Error ? err.message : String(err),
		},
	};
}

const vcs = createVcsAdapter(cwd);
const handle = vcs.workspace.parallel.dispatch({ … });
return { data: handle };
```

**Cancel-specific skeleton (from 15-RESEARCH.md §"CLI bridge sketch" lines 1174-1217) — paste-ready:**

```typescript
import { readFileSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import type { ParallelDispatchHandle } from '../vcs/types.js';
import type { QueryHandler } from './utils.js';

function resolveFileOrStdin(raw: string): string {
	if (raw === '@-') return readFileSync(0, 'utf-8');
	if (raw.startsWith('@')) return readFileSync(raw.slice(1), 'utf-8');
	throw new Error(`expected @<path> or @- but got inline string (inline JSON form is not accepted)`);
}

export const workspaceParallelCancelQuery: QueryHandler = async (args, projectDir) => {
	let cwd = projectDir;
	let handleRaw: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--cwd' && args[i + 1]) cwd = args[++i];
		else if (args[i] === '--handle' && args[i + 1]) handleRaw = args[++i];
	}

	if (handleRaw === undefined) {
		return { data: { ok: false, reason: 'handle_required' } };
	}

	let handle: ParallelDispatchHandle;
	try {
		handle = JSON.parse(resolveFileOrStdin(handleRaw));
	} catch (err) {
		return {
			data: {
				ok: false,
				reason: 'handle_json_parse_failed',
				error: err instanceof Error ? err.message : String(err),
			},
		};
	}

	const vcs = createVcsAdapter(cwd);
	const result = vcs.workspace.parallel.cancel(handle);
	return { data: result };
};
```

**Divergences (don't copy):**
- `workspace-parallel-dispatch.ts` calls `loadConfig` for the `parallelization` gate; cancel does NOT (teardown should work regardless of whether parallelization is currently enabled).
- dispatch accepts inline JSON for `--plan` (the `raw` fallback branch); cancel REJECTS inline JSON for `--handle` per the sketch's `throw new Error(…)` — handles are too large to expect inline.

---

### `scripts/audit-root-commits-rename.cjs` (NEW — Plan 15.01)

**Role:** One-shot file-walker emitting JSON to stdout that enumerates every `\brootCommits\b` site in the codebase. Caller (the plan task) redirects stdout into `.planning/phases/15-…/rootCommits-rename-audit.json`.

**Closest analog:** `scripts/audit-id-namespace.cjs` (structural template — pure-function walker + Object.freeze constants + module.exports) + `scripts/audit-workflow-raw-git.cjs` (stdout-only precedent + fence-aware scanner shape).

**Why these analogs:** `audit-id-namespace.cjs` is the closest by-type — a one-shot Node script that walks the repo for a single pattern and emits structured JSON; the `'use strict'` + Object.freeze enum + module.exports shape is reusable verbatim. `audit-workflow-raw-git.cjs` is the closer by-spirit precedent for the stdout-only constraint (D-13 / `feedback_avoid_jj_auto_tracked_output`) — its file-header docblock cites the constraint explicitly.

**File-header + stdout-only declaration pattern** (`audit-workflow-raw-git.cjs:1-37`):

```javascript
#!/usr/bin/env node
/**
 * audit-workflow-raw-git.cjs (Phase 13 plan 13-02, LINT-04)
 *
 * Stdout-only (CONTEXT.md D-06): this is a colocated-jj repo; any file written
 * into the working tree is auto-snapshotted. The audit writes NOTHING to disk —
 * a human-readable `.md` report to stdout by default, machine-readable JSON to
 * stdout under `--json`. It invokes no VCS — a pure file-walker, so
 * `lint-vcs-no-raw-git.cjs` does not flag it.
 *
 * Modeled structurally on scripts/audit-id-namespace.cjs (shebang, header
 * docblock, `'use strict'`, node:fs/node:path imports, the recursive walker,
 * parseArgv, emitMarkdown/emitJson, escapeMarkdownCell verbatim, the
 * `require.main` guard, the `module.exports` of pure functions).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
```

**SKIP_DIRS + walker pattern** (`audit-id-namespace.cjs:50-75`):

```javascript
const SKIP_DIRS = new Set([
	'node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store',
]);
// Audit scans BOTH code and markdown — code for surface flip, markdown for AUDIT-04 prose grep.
const SCAN_EXT = /\.(cjs|js|mjs|ts|md)$/;

function findFiles(dir, results) {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
	for (const entry of entries) {
		// recursive walker filtering by SKIP_DIRS + SCAN_EXT
	}
}
```

**Module-exports for testability pattern** (mirrors `audit-id-namespace.cjs` end and `audit-id-namespace.test.cjs` `require('../../scripts/audit-id-namespace.cjs')` import shape):

```javascript
if (require.main === module) main();
module.exports = { walk, PATTERN };  // for unit tests at tests/scripts/audit-root-commits-rename.test.cjs
```

**Skeleton (from 15-RESEARCH.md §"Pre-Rename Audit Generator" lines 819-897) — paste-ready** with the carve-outs (`.archive-pre-v1.4`, `v1.2-research`) + `specialCases` for `backends.ts:79` + `idempotencyHash` MD5 over sorted tuples per D-09/D-11/D-12.

**Divergences (don't copy):**
- `audit-id-namespace.cjs` has a verdict-table classifier (`AUDIT_VERDICT` 7-value enum); rename audit needs NO classifier — every hit is a rename target. Skip the enum entirely.
- `audit-workflow-raw-git.cjs` carries a `BASELINE` frozen constant for regression-gating; rename audit needs NO baseline (it's one-shot per CF-08 / D-13 — discarded after milestone close). Skip the BASELINE block.
- `audit-workflow-raw-git.cjs` runs `process.exit(result.ok ? 0 : 1)` at the end; rename audit MUST exit 0 always (the JSON is the artifact; gate-passing is the plan task's job, not the script's).
- Per `feedback_avoid_jj_auto_tracked_output`: NEVER call `fs.writeFileSync` from inside this script. Stdout-only.

---

### `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` + `cmd-parallel-cancel-git.test.ts` (NEW — Plan 15.04 W2)

**Role:** Per-backend runtime tests covering 3 scenarios each (cancel-clean-abandon, cancel-idempotent-recall, cancel-partial-state-recovery) + CLI three-site smoke.

**Closest analog:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:1-120` (Pattern A/B/W2 lifecycle structure).

**Why this analog:** The cmd-parallel-jj test file is the direct sibling — same family of `workspace.parallel.*` runtime tests, same jj setup machinery, same skipIf gate. The cancel tests are essentially a fourth scenario kind on the same shape.

**Pattern A skipIf gate** (`cmd-parallel-jj.test.ts:45-51`):

```typescript
let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; every describe in this file skips.
}
```

**Pattern B mkdtemp + setup helper** (`cmd-parallel-jj.test.ts:64-87`):

```typescript
function setupJjRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-jj-parallel-${Math.random().toString(36).slice(2, 10)}-`,
		),
	);
	execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
	execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
	execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
	// Materialize .planning/phases/15-test/ so derivePhaseRoot(repo, 15) resolves.
	mkdirSync(join(dir, '.planning', 'phases', '15-test'), { recursive: true });
	return dir;
}
```

(For cancel tests, update the phase number from 9 to 15 in the materialized phase dir.)

**W2 lifecycle pattern — one describe per N or per scenario** (`cmd-parallel-jj.test.ts:97-111`):

```typescript
for (const N of [2, 3, 4] as const) {
	describe.sequential.skipIf(!jjAvailable)(
		`workspace.parallel — N=${N} clean dispatch + fanIn + divergent() topology`,
		() => {
			let dir: string;
			let vcs: ReturnType<typeof createJjAdapter>;

			beforeAll(() => {
				dir = setupJjRepo();
				vcs = createJjAdapter(dir);
			});

			afterAll(() => {
				if (dir) rmSync(dir, { recursive: true, force: true });
			});

			// ONE `it` block per describe — re-dispatching into the same dir
			// would collide on `phase-NN-subagent-{idx}` workspace names.
		},
	);
}
```

**Cancel-specific scenarios (per 15-RESEARCH.md §"Cross-Backend Test Harness" lines 805-812):**

1. **cancel-clean-abandon:** dispatch N=2 → no agents work → cancel → `abandoned.length === 2`, `surplusWorkspaces.length === 2`, `failedReaped.length === 0`, `surplusBookmarks.length === 0` (jj); no workspace dirs on disk after cancel.
2. **cancel-idempotent-recall:** dispatch → cancel → cancel again → second call returns all-empty arrays (D-03 idempotency).
3. **cancel-partial-state-recovery:** dispatch → manually `rmSync` one workspace dir before cancel → cancel → that workspace shows up in NEITHER abandoned nor failedReaped (already gone is not an error per D-06); `surplusWorkspaces.length === N-1`; remaining N-1 workspaces are torn down.

**Plus CLI three-site smoke** (per Pitfall 8): `node bin/gsd-sdk.cjs query workspace.parallel.cancel --handle @- < handle.json` exits 0 against a freshly dispatched handle.

**Divergences (don't copy):**
- `cmd-parallel-jj.test.ts` has the W3 (a) joint-assertion lock-in (D-16: ALL THREE in-tree-conflict assertions in ONE `it` block) — cancel tests do NOT have this constraint; the three scenarios can each be a separate `it` block within the describe (no octopus merge involved).
- `cmd-parallel-jj.test.ts` re-dispatches would collide on workspace names; for cancel-idempotent-recall the SAME handle is passed twice (no re-dispatch needed).
- The git-side mirror (`cmd-parallel-cancel-git.test.ts`) replaces the `jj git init --colocate` + jj config + `jj squash` boot sequence with `git init` + `git config user.email/.name` + initial commit, and uses `createGitAdapter` instead of `createJjAdapter`. The 3 scenarios are otherwise identical, but surplusBookmarks asserts non-empty on git (`worktree-agent-*` entries) where it asserts `[]` on jj.

---

### `sdk/src/vcs/jj/__tests__/workspace-cleanup.test.ts` (NEW — Plan 15.04 W1)

**Role:** Unit test for the `cleanupSubagentWorkspaces` helper — idempotency, missing-dirs, partial-state.

**Closest analog:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` Pattern B (mkdtemp fixture) — no existing unit test for `reap.ts` exists, so the closest analog is the sibling cmd-parallel-jj's fixture shape.

**Pattern:** Same `mkdtempSync` + `jj git init --colocate` fixture as `cmd-parallel-jj.test.ts:64-87`, then materialize a few `.claude/jj-workspaces/phase-15-subagent-{1..N}` dirs (no need for full octopus structure — the helper enumerates filesystem dirs by name prefix per D-06), then call `cleanupSubagentWorkspaces(dir, 15)` and assert on the return shape.

**Cases (mapping to 15-RESEARCH.md §"Phase Requirements → Test Map" line 1031):**

1. helper idempotency — call twice; second call returns empty arrays.
2. missing `.claude/jj-workspaces/` dir → returns empty arrays (no error per D-06).
3. partial state — pre-rmSync one of the workspace dirs → helper still completes; pre-removed dir not in `abandoned` (statSync returns undefined → `continue`).

**Divergences (don't copy):**
- No `vcs` adapter needed — the helper is tested directly via its export. Skip the `createJjAdapter` line in the fixture.
- No describe.sequential — the helper is pure (no in-process state shared across tests). Standard `describe` works.

---

### `tests/scripts/audit-root-commits-rename.test.cjs` (NEW — Plan 15.01 W1)

**Role:** node:test unit test for the audit script's pure functions (walker + hash determinism + carve-out filtering).

**Closest analog:** `tests/scripts/audit-id-namespace.test.cjs:1-60` (direct sibling — also tests an audit script's pure functions).

**Why this analog:** Same family (`tests/scripts/audit-*.test.cjs`), same framework (`node:test`), same pattern (require the audit script as a CJS module, exercise its exported pure functions via tmpdir fixtures).

**Imports + tmpdir fixture pattern** (`audit-id-namespace.test.cjs:1-13`):

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
	auditIdNamespace,
	AUDIT_VERDICT,
	PATTERNS,
	emitJson,
} = require('../../scripts/audit-id-namespace.cjs');
```

**Per-test mkdtemp + try/finally cleanup pattern** (`audit-id-namespace.test.cjs:39-51`):

```javascript
test('classifier emits row for literal commit_id', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
	try {
		fs.mkdirSync(path.join(tmp, 'sdk/src'), { recursive: true });
		fs.writeFileSync(path.join(tmp, 'sdk/src/x.ts'), `const t = "commit_id";\n`);
		const result = auditIdNamespace({ scanRoots: ['sdk/src'], repoRoot: tmp });
		assert.ok(result.findings.length >= 1);
		assert.equal(result.findings[0].surface, 'literal_commit_id');
		assert.equal(result.findings[0].line, 1);
	} finally {
		fs.rmSync(tmp, { recursive: true });
	}
});
```

**Cases for rename audit:**

1. walker finds `rootCommits` in `.ts`/`.cjs`/`.js`/`.md`/`.json` (5 cases — one per ext).
2. SKIP_DIRS exclusion — write `node_modules/x/y.ts` with the token; assert NOT in output.
3. carve-out exclusion — write `.planning/research/.archive-pre-v1.4/x.md` with the token; assert NOT in output.
4. `idempotencyHash` determinism — run audit twice with identical tree; assert same hash.
5. `specialCases` populated when `sdk/src/vcs/backends.ts:79` contains the token (synthetic fixture writing a fake `backends.ts` with the line literal).

**Divergences (don't copy):**
- audit-id-namespace tests `AUDIT_VERDICT.length === 7`; rename audit has NO verdict enum (every hit is a rename target). Skip that case.
- audit-id-namespace tests classifier output; rename audit needs `idempotencyHash` determinism instead. Add the hash-determinism case.

---

### `sdk/src/vcs/types.ts` (MODIFIED — all 4 plans)

**Role:** Cross-backend interface definitions; locked at the top of the dependency graph.

**Closest analog:** itself — `FanInResult` at `:533-541` provides the exact mirror shape for the new `CancelResult`.

**`VcsRefs` insertion sites** (`types.ts:336-367`):

Current shape (verified):

```typescript
export interface VcsRefs {
	readonly head: RevisionExpr;
	readonly parent: RevisionExpr;
	bookmarks: VcsBookmarks;
	// … other methods …
	resolveShort(rev: RevisionExpr): string;
	countCommits(opts: { rev?: RevisionExpr }): number;
	rootCommits(opts: { rev?: RevisionExpr }): string[];        // 15.01 rename target
	exists(rev: RevisionExpr): boolean;
	isIgnored(path: string): boolean;
	remotes(): string[];
}
```

After all 4 plans:

```typescript
export interface VcsRefs {
	readonly head: RevisionExpr;
	readonly parent: RevisionExpr;
	readonly idAlphabet: string;          // NEW (15.02) — adjacent to other readonly props
	bookmarks: VcsBookmarks;
	// …
	countCommits(opts: { rev?: RevisionExpr }): number;
	rootRevisions(opts: { rev?: RevisionExpr }): string[];      // RENAMED (15.01)
	exists(rev: RevisionExpr): boolean;
	matchPrefix(id: RevisionExpr, prefix: string): boolean;     // NEW (15.03) — adjacent to exists
	isIgnored(path: string): boolean;
	remotes(): string[];
}
```

**`VcsWorkspaceParallel` insertion site** (`types.ts:453-456`):

```typescript
export interface VcsWorkspaceParallel {
	dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
	fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
	/** Phase 15 (PARALLEL-07): synchronous teardown of already-materialized workspaces. */
	cancel(handle: ParallelDispatchHandle): CancelResult;         // NEW (15.04)
}
```

**`CancelResult` mirror — paste verbatim from `FanInResult` at `:533-541`:**

```typescript
// Source: sdk/src/vcs/types.ts:533-541 (FanInResult — mirror this exact shape)
export interface FanInResult {
	merged: readonly string[];
	conflicted: boolean;
	conflictedPaths: readonly string[];
	incompleteQueued: number;
	failedReaped: readonly string[];      // ← CancelResult mirrors this name verbatim per D-01
	surplusBookmarks: readonly string[];  // ← CancelResult mirrors this name verbatim per D-01
}
```

New `CancelResult` (D-01 / D-02 4-field envelope):

```typescript
/**
 * Phase 15 (PARALLEL-07, D-01): result envelope for vcs.workspace.parallel.cancel.
 * Mirrors FanInResult field naming verbatim (failedReaped, surplusBookmarks).
 * Pure JSON; no closures, methods, Symbols (Phase 9 D-05 frozen-pure-JSON invariant).
 *
 * D-02 semantics:
 *   abandoned         — identifiers (recommend: workspace name) fully torn down.
 *   failedReaped      — identifiers that resisted teardown (caller can grep FS).
 *   surplusBookmarks  — bookmark names that needed force-delete (jj: typically [];
 *                       git: worktree-agent-* entries on the success path).
 *   surplusWorkspaces — workspace paths still on disk pre-cancel (counted at
 *                       entry, regardless of cleanup outcome).
 *
 * D-03: cancel is idempotent — re-call returns all-empty arrays (no error).
 */
export interface CancelResult {
	abandoned: readonly string[];
	failedReaped: readonly string[];
	surplusBookmarks: readonly string[];
	surplusWorkspaces: readonly string[];
}
```

---

### `sdk/src/vcs/backends.ts` (MODIFIED — all 4 plans)

**Role:** Capability matrix — string-keyed allowlist of `{verb: [backend-keys]}`.

**Closest analog:** itself — existing entries at `:76-82` (refs.* family) and `:99-103` (workspace.* family) provide the exact insertion shape.

**Line 79 STRING LITERAL flip** (the Pitfall 3 / D-11 special case):

```typescript
// BEFORE (current line 79):
'refs.rootCommits': Object.freeze(['git', 'jj-colocated'] as const),

// AFTER (15.01 rename):
'refs.rootRevisions': Object.freeze(['git', 'jj-colocated'] as const),
```

**Three new entries (15.02, 15.03, 15.04)** — insert adjacent to existing refs entries at `:76-82`:

```typescript
'refs.idAlphabet': Object.freeze(['git', 'jj-colocated'] as const),       // 15.02
'refs.matchPrefix': Object.freeze(['git', 'jj-colocated'] as const),      // 15.03
'workspace.parallel.cancel': Object.freeze(['git', 'jj-colocated'] as const),  // 15.04
```

(Insert next to `'workspace.parallel.dispatch'` and `'workspace.parallel.fan-in'` entries if they exist; if not, add to the workspace family at `:98-107`.)

---

### `sdk/src/vcs/backends/git.ts` (MODIFIED — all 4 plans)

**Role:** Git adapter implementation.

**Closest analog:** itself — the refs `Object.freeze` block at `:554-568` and parallel block at `:738-745`.

**`rootCommits` rename target** (`:526` function def + `:564` Object.freeze entry):

```typescript
// :526 — rename function name
const rootRevisions = (opts: { rev?: RevisionExpr }): string[] => { … };

// :564 — rename Object.freeze shorthand entry
const refs = Object.freeze({
	head: expr.head(),
	parent: expr.parent(),
	bookmarks,
	currentBookmarks,
	currentBookmarksIn,
	mergeBase,
	readBlob,
	resolveShort,
	countCommits,
	rootRevisions,    // ← renamed from rootCommits
	exists: refExists,
	isIgnored,
	remotes,
});
```

**`idAlphabet` + `matchPrefix` additions** (add inside `refs` block at `:554`):

```typescript
const refs = Object.freeze({
	head: expr.head(),
	parent: expr.parent(),
	idAlphabet: '0-9a-f',    // NEW (15.02, CF-03)
	// … existing members …
	matchPrefix,             // NEW (15.03) — defined as const earlier in file body
	// … existing members …
});
```

**`matchPrefix` impl pattern** (mirror `validateRefname` inline-validator from `refs-validator.ts:38-79`):

```typescript
// New const definition adjacent to rootRevisions impl
const matchPrefix = (id: RevisionExpr, prefix: string): boolean => {
	if (prefix.length === 0) {
		throw new Error(`matchPrefix: empty prefix (caller bug)`);
	}
	if (!/^[0-9a-fA-F]+$/.test(prefix)) {
		throw new Error(`matchPrefix: prefix '${prefix}' is not in git alphabet [0-9a-f] (case-insensitive)`);
	}
	const idString = toGitRev(id);
	if (prefix.length > idString.length) return false;
	return idString.toLowerCase().startsWith(prefix.toLowerCase());
};
```

**`parallel.cancel` wire-in** (add to parallel `Object.freeze` block at `:738-745`):

```typescript
// Current (verified at :738-745):
parallel: Object.freeze({
	dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
		performGitParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
	fanIn: (
		handle: ParallelDispatchHandle,
		results: readonly ParallelAgentResult[],
	): FanInResult => performGitParallelFanIn(cwd, handle, results),
	// Plan 15.04 adds:
	cancel: (handle: ParallelDispatchHandle): CancelResult =>
		performGitParallelCancel(cwd, handle),
}),
```

Then add `import { performGitParallelCancel } from '../git/parallel.js';` to the import block.

---

### `sdk/src/vcs/backends/jj.ts` (MODIFIED — all 4 plans)

**Role:** jj adapter implementation.

**Closest analog:** itself — the refs `Object.freeze` block at `:776-980` and parallel block at `:1257-1264`.

**`rootCommits` rename target** (`:964`):

```typescript
// BEFORE:
rootCommits: ({ rev }: { rev?: RevisionExpr }): string[] => { … },

// AFTER (15.01):
rootRevisions: ({ rev }: { rev?: RevisionExpr }): string[] => { … },
```

**`idAlphabet` addition** — adjacent to `head` / `parent` at `:777-778`:

```typescript
const refs: VcsRefs = Object.freeze({
	head: expr.head(),
	parent: expr.parent(),
	idAlphabet: 'k-z',    // NEW (15.02, CF-03)
	bookmarks,
	// …
});
```

**`matchPrefix` impl pattern** (k-z lower-only, validateRefname-style throws):

```typescript
matchPrefix: (id: RevisionExpr, prefix: string): boolean => {
	if (prefix.length === 0) {
		throw new Error(`matchPrefix: empty prefix (caller bug)`);
	}
	if (!/^[k-z]+$/.test(prefix)) {
		throw new Error(`matchPrefix: prefix '${prefix}' is not in jj alphabet [k-z] (lowercase only)`);
	}
	const idString = toJjRev(id);
	if (prefix.length > idString.length) return false;
	return idString.startsWith(prefix);
},
```

**`parallel.cancel` wire-in** (add to parallel `Object.freeze` block at `:1257-1264`):

```typescript
// Current (verified at :1257-1264):
parallel: Object.freeze({
	dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
		performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
	fanIn: (
		handle: ParallelDispatchHandle,
		results: readonly ParallelAgentResult[],
	): FanInResult => performJjParallelFanIn(cwd, handle, results),
	// Plan 15.04 adds:
	cancel: (handle: ParallelDispatchHandle): CancelResult =>
		performJjParallelCancel(cwd, handle),
}),
```

Then add `import { performJjParallelCancel } from '../jj/parallel.js';` to the import block.

---

### `sdk/src/vcs/jj/parallel.ts` + `sdk/src/vcs/git/parallel.ts` (MODIFIED — 15.04 W2)

**Role:** UPSTREAM-02 sidecars hosting `performJjParallelCancel` and `performGitParallelCancel` exports.

**Closest analog:** existing `performJjParallelFanIn` / `performGitParallelFanIn` in the same files (the immediate-sibling functions).

**`performJjParallelCancel` skeleton** (15-RESEARCH.md §"performJjParallelCancel sketch" lines 1094-1124) — paste-ready:

```typescript
// Add to sdk/src/vcs/jj/parallel.ts — adjacent to performJjParallelFanIn
import { cleanupSubagentWorkspaces } from './workspace-cleanup.js';
// (existing import: existsSync from 'node:fs')

export function performJjParallelCancel(
	mainRepoRoot: string,
	handle: ParallelDispatchHandle,
): CancelResult {
	const surplusWorkspaces: string[] = [];
	for (const ws of handle.workspaces) {
		if (existsSync(ws.path)) surplusWorkspaces.push(ws.path);
	}

	// Delegate to shared helper (D-04, D-05, IP-5).
	const { abandoned, failedReaped } = cleanupSubagentWorkspaces(
		mainRepoRoot,
		handle.phaseNumber,
	);

	// jj has no per-subagent bookmarks (Phase 11 D-02); surplusBookmarks is [].
	const surplusBookmarks: string[] = [];

	return Object.freeze({
		abandoned: Object.freeze(abandoned.slice()) as readonly string[],
		failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
		surplusBookmarks: Object.freeze(surplusBookmarks) as readonly string[],
		surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()) as readonly string[],
	}) satisfies CancelResult;
}
```

**`performGitParallelCancel` skeleton** (15-RESEARCH.md §"performGitParallelCancel sketch" lines 1130-1169) — paste-ready. Key git-specific bits: `git worktree remove --force` (NOT `--force` per CF-06 — note: CF-06 says cancel DOES use `--force`; verify against existing `workspace.remove(path, {force:true})` shape at `backends/git.ts:725-735`), then `git branch -D <agentBookmark>` for the `worktree-agent-{agentId}` bookmark, both via `vcsExec` per UPSTREAM-02.

**Divergences (don't copy):**
- `performJjParallelFanIn` produces a `FanInResult` with conflict probing + `merged` IDs; cancel produces `CancelResult` with NO conflict probing. Skip the `enumerateConflictedPaths` import + the `jj log -r 'divergent()'` probe.
- `performGitParallelFanIn` runs a per-branch 2-parent merge loop; cancel runs a per-workspace teardown loop. Skip the `git merge --no-ff` invocation entirely.

---

### CLI three-site registration (MODIFIED — 15.04 W2)

**Role:** Three sibling configuration files registering the new `workspace.parallel.cancel` verb at canonical + space-tokenized + alias forms.

**Closest analog:** existing `workspace.parallel.dispatch` + `workspace.parallel.fan-in` entries at each site (verified at the line numbers below).

#### Site 1: `sdk/src/query/command-static-catalog-domain.ts`

Current (verified at `:21-22` imports + `:71-74` entries):

```typescript
import { workspaceParallelDispatchQuery } from './workspace-parallel-dispatch.js';
import { workspaceParallelFanInQuery } from './workspace-parallel-fan-in.js';
// (15.04 adds:)
import { workspaceParallelCancelQuery } from './workspace-parallel-cancel.js';

// DOMAIN_STATIC_CATALOG entries:
['workspace.parallel.dispatch', workspaceParallelDispatchQuery],
['workspace parallel.dispatch', workspaceParallelDispatchQuery],
['workspace.parallel.fan-in', workspaceParallelFanInQuery],
['workspace parallel.fan-in', workspaceParallelFanInQuery],
// (15.04 adds 2 entries — both dotted + space-tokenized forms):
['workspace.parallel.cancel', workspaceParallelCancelQuery],
['workspace parallel.cancel', workspaceParallelCancelQuery],
```

#### Site 2: `sdk/src/query/command-manifest.non-family.ts`

Current (verified at `:60-62`):

```typescript
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false, outputMode: 'json' },
{ canonical: 'workspace.parallel.dispatch',     aliases: ['workspace parallel.dispatch'],     mutation: true,  outputMode: 'json' },
{ canonical: 'workspace.parallel.fan-in',       aliases: ['workspace parallel.fan-in'],       mutation: true,  outputMode: 'json' },
// (15.04 adds:)
{ canonical: 'workspace.parallel.cancel',       aliases: ['workspace parallel.cancel'],       mutation: true,  outputMode: 'json' },
```

#### Site 3: `sdk/src/query/command-aliases.generated.ts`

Current (verified at `:155-157` — list is ALPHABETICALLY sorted):

```typescript
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false },
{ canonical: 'workspace.parallel.dispatch', aliases: ['workspace parallel.dispatch'], mutation: true },
{ canonical: 'workspace.parallel.fan-in', aliases: ['workspace parallel.fan-in'], mutation: true },
```

Insert BEFORE `dispatch` per alphabetical sort (`cancel < dispatch < fan-in`):

```typescript
{ canonical: 'workspace.parallel.cancel', aliases: ['workspace parallel.cancel'], mutation: true },
{ canonical: 'workspace.parallel.dispatch', aliases: ['workspace parallel.dispatch'], mutation: true },
{ canonical: 'workspace.parallel.fan-in', aliases: ['workspace parallel.fan-in'], mutation: true },
```

**Pitfall 8 reminder:** missing any one site breaks runtime verb resolution. Plan 15.04 contract test must exercise the actual dispatcher path (`gsd-sdk query workspace.parallel.cancel` invocation), not just the direct handler import.

---

### `sdk/src/vcs/__tests__/adapter-contract.test.ts` (MODIFIED — 15.02, 15.03)

**Role:** Cross-backend contract test — runs same assertions on every available backend.

**Closest analog:** itself — the existing `test.skipIf(!ready('commit'))` and similar block at `:28-46`.

**Pattern** (`adapter-contract.test.ts:9-46`):

```typescript
import { describe, it, expect } from 'vitest';
import { makeBackendFixture, selectedBackends } from './vcs-fixture.js';
import { BACKENDS_AVAILABLE_FOR_VERB } from '../backends.js';

function verbReady(verb: string, kind: string): boolean {
	const lane = (BACKENDS_AVAILABLE_FOR_VERB[verb] ?? []) as readonly string[];
	return lane.includes(kind);
}

describe.for(selectedBackends())('VcsAdapter contract — backend=%s', (kind) => {
	const { test, setupHooks } = makeBackendFixture(kind);
	setupHooks();
	const ready = (verb: string): boolean => verbReady(verb, kind);

	// Insert new test.skipIf blocks here:
	test.skipIf(!ready('refs.idAlphabet'))('vcs.refs.idAlphabet returns backend-specific alphabet', ({ vcs }) => {
		const a = vcs.refs.idAlphabet;
		if (vcs.kind === 'git') expect(a).toBe('0-9a-f');
		else expect(a).toBe('k-z');
	});

	test.skipIf(!ready('refs.matchPrefix'))('vcs.refs.matchPrefix — 5 rules × 2 backends cross-product', ({ vcs, cwd }) => {
		// 10 cases per CF-04 (see 15-RESEARCH.md §"matchPrefix Implementation Sketch" lines 765-777)
		// Use vitest `expect(() => …).toThrow()` for throw cases, NOT `expect(…).toBe(false)`
		// (Pitfall 3 silent-false guard).
	});
});
```

**Custom matcher to use:** `toBeIdOf` from `tests/__tools__/vitest-matchers.ts` (per `feedback_vitest_extend_over_free_fn`) for any id-shape assertions in the prefix-too-long-false cases.

---

### `sdk/src/vcs/__tests__/backends.test.ts` (MODIFIED — all 4 plans)

**Role:** Capability-matrix presence test.

**Closest analog:** itself — existing assertions at `:30-73` for verb presence.

**Pattern** (`backends.test.ts:30-44`):

```typescript
// Existing precedent — same shape applies:
expect(BACKENDS_AVAILABLE_FOR_VERB.commit).toEqual(['git', 'jj-colocated']);
expect(BACKENDS_AVAILABLE_FOR_VERB['refs.bookmarks.list']).toEqual(['git', 'jj-colocated']);
```

**4 new assertions to add (and 1 anti-assertion per Pitfall 1):**

```typescript
// 15.01 — rename
expect(BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']).toEqual(['git', 'jj-colocated']);
// ANTI-assertion (Pitfall 1):
expect(BACKENDS_AVAILABLE_FOR_VERB['refs.rootCommits']).toBeUndefined();

// 15.02
expect(BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet']).toEqual(['git', 'jj-colocated']);

// 15.03
expect(BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix']).toEqual(['git', 'jj-colocated']);

// 15.04
expect(BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel']).toEqual(['git', 'jj-colocated']);
```

Also bump the count assertion at `:75-77`: `expect(Object.keys(...).length).toBeGreaterThanOrEqual(25)` → `28` (one rename, three additions = net +3).

---

### Production `rootCommits` callers (MODIFIED — 15.01)

**Role:** Pure rename targets.

For all 26 sites enumerated in 15-RESEARCH.md §"rootCommits Call-Site Inventory" (corrected total 22 production sites + active planning surfaces):

| File:Line | Hit type | Action | Pitfall guard |
|-----------|----------|--------|---------------|
| `sdk/src/vcs/types.ts:363` | interface decl | rename to `rootRevisions` | TS compiler |
| `sdk/src/vcs/backends.ts:79` | STRING LITERAL | rename to `'refs.rootRevisions'` | Pitfall 1 — D-11 specialCases |
| `sdk/src/vcs/backends/git.ts:526,564` | func + freeze | rename | TS compiler |
| `sdk/src/vcs/backends/jj.ts:964` | property | rename | TS compiler |
| `sdk/src/query/progress.ts:288,293` | caller + comment | rename | TS compiler |
| `sdk/src/vcs/__tests__/git-backend.test.ts:414,419` | describe + call | rename | TS compiler |
| `sdk/src/vcs/__tests__/jj-skeleton.test.ts:147,148` | label + call | rename | TS compiler |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts:234,238` | comment + call | rename | TS compiler |
| `sdk/src/vcs/__tests__/jj-refs.test.ts:162,215,216,217,220` | comments + divider + label + call | rename | TS compiler |
| `get-shit-done/bin/lib/commands.cjs:998,1005` | comment + caller | rename | **Pitfall 2 — NO TS protection; audit JSON covers** |
| `tests/__tools__/capture-vcs-baselines.cjs:414` | comment | rename | manual / audit JSON |

**`.planning/` rename policy** (Open Q1 default — confirm with user at 15.01 planning):
- `.planning/PROJECT.md` + `.planning/STATE.md` ACTIVE sections → rename
- `.planning/research/*.md` + `.planning/intel/*.md` + `.planning/milestones/*.md` + `.planning/seeds/*.md` → leave as historical-prose
- `.planning/phases/15-…/{15-CONTEXT,15-DISCUSSION-LOG}.md` → leave as historical-prose (describes the rename itself)

---

## Shared Patterns

### Pattern S1: UPSTREAM-02 sidecar discipline

**Source:** `sdk/src/vcs/jj/conflict-paths.ts:17-30`

**Apply to:** `sdk/src/vcs/jj/workspace-cleanup.ts` (NEW)

**Verbatim excerpt:**

```typescript
/**
 * UPSTREAM-02 sidecar discipline: this file does NOT import from
 * `backends/jj.ts`. The mandatory-flags prefix is inlined verbatim per the
 * `octopus.ts:39-47` / `reap.ts:33-41` template.
 */

import { vcsExec } from '../exec.js';

function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

**Why:** Phase 4 LEARNINGS Open Q1 — any import from `backends/jj.ts` in a `jj/*` sidecar creates a merge conflict on every upstream-rebase cycle. Hard rule (D-07 / `project_no_raw_git`).

---

### Pattern S2: Frozen pure-JSON return shape

**Source:** `sdk/src/vcs/jj/parallel.ts` (existing `performJjParallelFanIn` return); skeleton inherited by `performJjParallelCancel`

**Apply to:** `performJjParallelCancel`, `performGitParallelCancel`, `cleanupSubagentWorkspaces` (all new)

**Verbatim excerpt** (from `performJjParallelCancel` skeleton in 15-RESEARCH.md §"performJjParallelCancel sketch"):

```typescript
return Object.freeze({
	abandoned: Object.freeze(abandoned.slice()) as readonly string[],
	failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
	surplusBookmarks: Object.freeze(surplusBookmarks) as readonly string[],
	surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()) as readonly string[],
}) satisfies CancelResult;
```

**Why:** Phase 9 D-05 / `project_no_orchestrator_sidecar_state` — parallel-domain return shapes survive `gsd-sdk query` JSON round-trip; no closures, methods, or Symbols.

---

### Pattern S3: Validate + argv-injection defense

**Source:** `sdk/src/vcs/refs-validator.ts:57-79` (`validateRefname` pattern)

**Apply to:** `matchPrefix` (15.03) on both backends — throw on wrong-alphabet + empty prefix.

**Verbatim excerpt:**

```typescript
export function validateRefname(name: string): void {
	if (!name) throw new Error(`expr.bookmark: empty name`);
	if (REFNAME_FORBIDDEN_BYTE_OR_SET.test(name)) {
		throw new Error(`expr.bookmark: invalid name '${name}' (forbidden byte or character)`);
	}
	// …
}
```

**Adapted for matchPrefix** (15-RESEARCH.md §"matchPrefix Implementation Sketch" lines 736-761):

```typescript
if (prefix.length === 0) {
	throw new Error(`matchPrefix: empty prefix (caller bug)`);
}
if (!/^[0-9a-fA-F]+$/.test(prefix)) {  // git side; jj side uses /^[k-z]+$/
	throw new Error(`matchPrefix: prefix '${prefix}' is not in git alphabet [0-9a-f] (case-insensitive)`);
}
```

**Why:** CF-04 — silent-false return on wrong-alphabet would mask caller bugs (Pitfall 3). The throw is load-bearing.

---

### Pattern S4: Three-site CLI registration

**Source:** existing `workspace.parallel.dispatch` + `workspace.parallel.fan-in` entries verified at lines:
- `sdk/src/query/command-static-catalog-domain.ts:21-22` (imports) + `:71-74` (catalog entries)
- `sdk/src/query/command-manifest.non-family.ts:60-62`
- `sdk/src/query/command-aliases.generated.ts:155-157`

**Apply to:** new `workspace.parallel.cancel` registration (Plan 15.04).

**Why:** CF-07 / Pitfall 8 — missing any one site breaks runtime verb resolution differently per dispatcher path. Plan 15.04 contract test must exercise the actual CLI dispatcher.

---

### Pattern S5: Stdout-only audit scripts

**Source:** `scripts/audit-workflow-raw-git.cjs:23-27`

**Apply to:** `scripts/audit-root-commits-rename.cjs` (NEW — Plan 15.01).

**Verbatim excerpt:**

```javascript
/**
 * Stdout-only (CONTEXT.md D-06): this is a colocated-jj repo; any file written
 * into the working tree is auto-snapshotted. The audit writes NOTHING to disk —
 * a human-readable `.md` report to stdout by default, machine-readable JSON to
 * stdout under `--json`. It invokes no VCS — a pure file-walker, so
 * `lint-vcs-no-raw-git.cjs` does not flag it.
 */
```

**Why:** `feedback_avoid_jj_auto_tracked_output` user memory — audit scripts that write into the colocated-jj working tree trigger auto-snapshot mid-operation. Plan task redirects stdout; script never calls `fs.writeFileSync`.

---

### Pattern S6: Vitest `expect.extend` custom matcher

**Source:** `tests/__tools__/vitest-matchers.ts` — `toBeIdOf(kind)`

**Apply to:** All `matchPrefix` test cases (15.03) that assert against id shapes.

**Why:** `feedback_vitest_extend_over_free_fn` user memory — prefer `expect.extend` over free-fn matchers for composability with nested structures. The existing `toBeIdOf` already handles git hex vs. jj k-z disambiguation.

---

## No Analog Found

None. Every NEW file has a direct or strong-sibling analog in the codebase. Every MODIFIED file is itself the precedent for its own edit type. The phase is mechanically straightforward — the lurking risks are CJS/markdown coverage (Pitfall 2) and the `backends.ts:79` string-literal flip (Pitfall 1), both of which have explicit guards (D-11 specialCases + D-12 idempotencyHash + the anti-assertion in `backends.test.ts`).

## Open Questions for Planner (forwarded from RESEARCH)

1. **Active `.planning/research/*.md` rename policy** — recommend default carve-out for `.planning/` except PROJECT.md / STATE.md active sections. Confirm with user at 15.01 planning.
2. **Helper first parameter name** — D-05 says `phaseRoot` but actual semantics are `mainRepoRoot` (A6 / Open Q2). Recommend rename in implementation.
3. **Audit JSON location** — `.planning/phases/15/...` (per D-09 literal) vs. `.planning/phases/15-adapter-surface-extensions-rename/...` (slug-matched). Recommend slug-matched (mirrors 12-HOOK-IDEMPOTENCY-AUDIT.md precedent).
4. **`'refs.idAlphabet'` capability-matrix entry** — Open Q4: `idAlphabet` is data (readonly string), not a method. Recommend entry anyway for `ready(verb)` gate consistency.

## Metadata

**Analog search scope:**
- `sdk/src/vcs/` (types, backends, sidecars, tests)
- `sdk/src/query/` (CLI bridges + three-site registration files)
- `scripts/` (audit precedents)
- `tests/scripts/` (node:test audit-script tests)
- `tests/__tools__/` (vitest matchers + node:test scaffolding)

**Files scanned:** 24 source files + 3 audit-script tests + 2 user-memory invariants

**Pattern extraction date:** 2026-05-24
