# Phase 18: Tactical cleanup + test-flake (re-scoped) - Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 7 (all modifications to existing files; zero new production files)
**Analogs found:** 7 / 7

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `gsd-core/workflows/transition.md` | workflow (orchestrator markdown) | batch (mutate-then-declare) | `gsd-core/workflows/execute-phase.md` `update_roadmap` + `close_phase_todos` + `assert_clean_wc` steps; wording variant in `gsd-core/workflows/plan-phase.md` §16 | exact (the surviving fork pattern this REQ explicitly grafts) |
| `scripts/dogfood-restore.sh` | utility (recovery script) | file-I/O | its own tarball FATAL block (lines 65-68) | exact (same file, same failure style) |
| `src/vcs-command-router.cts` (workspace.parallel.dispatch handler) | CLI router / input validation | request-response (argv → envelope) | its own peer envelopes: `phase_number_required` (L1145-1147), `plan_json_parse_failed` (L1181-1189) | exact |
| `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` | test (unit, vi.mock) | request-response | its own harness + D-07 `it` block (L132-145) | exact |
| `src/vcs/__tests__/cmd-parallel-jj.test.ts` (CONFIG-02 describe, L778-866) | test (unit) | request-response | `jj-reap.test.ts` `afterAll` cleanup (L71-73) for the rm idiom; own describe for structure | exact + role-match |
| `src/vcs/__tests__/cmd-parallel-git.test.ts` (CONFIG-02 describe, L1007-1095) | test (unit) | request-response | same as jj file (structures are byte-parallel except prefix `gsd-cfg02-git-`) | exact |
| `src/vcs/__tests__/jj-reap.test.ts` (inclusion-filter test, L79) | test (integration, real jj fixture) | file-I/O | `cmd-parallel-jj.test.ts:141` `{ timeout: 30000 }` options-object precedent (15+ occurrences suite-wide) | exact |

## Pattern Assignments

### `gsd-core/workflows/transition.md` (workflow, mutate-then-declare)

**Analogs:** `gsd-core/workflows/execute-phase.md` (steps `update_roadmap`, `close_phase_todos`, `assert_clean_wc`) + `gsd-core/workflows/plan-phase.md` §16 (re-wording precedent).

**Insertion geography (verified this session):**
- Launcher embed already exists at transition.md **L166** (inside `update_roadmap_and_state`); later fences (L304, L413, L432, L552, L606) use bare `gsd_run` with NO re-embed. ALL new fences MUST use bare `gsd_run`. A second launcher embed adds a raw `git rev-parse` hit and regresses the `audit-workflow-raw-git` frozen baseline (transition.md = 1).
- `TRANSITION=$(gsd_run query phase.complete "${current_phase}")` is at **L167** — commit #1 grafts immediately after it.
- `evolve_project` step is L188-273 — commit #2 at end of step.
- `update_session_continuity_after_transition` closes with `</step>` at **L397**; `<step name="offer_next_phase">` opens at **L399**. The new `<step name="assert_clean_wc">` goes between them.
- Config-set call sites needing tolerant commit-adjacency: **L552** (Route B1) and **L606** (Route B), both `gsd_run query config-set workflow._auto_chain_active false`.

**Commit-adjacency pattern** (`execute-phase.md:1572-1577` — copy verb + prose shape):
```bash
COMPLETION=$(gsd_run query phase.complete "${PHASE_NUMBER}")
gsd_run query commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```
> The commit line above MUST run immediately after `phase.complete` — the mutating verb writes to `.planning/ROADMAP.md` + `.planning/STATE.md` + `.planning/REQUIREMENTS.md` on disk but does NOT commit. The order is load-bearing: do NOT defer the commit past the result-parsing prose that follows, or the orchestrator may declare "PHASE COMPLETE" with the planning files still uncommitted.

Adapted commit messages for transition (per RESEARCH §CLEANUP-01):
- After L167: `docs(phase-${completed_phase}): complete phase via transition` — `--files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md`
- End of `evolve_project`: `docs(phase-${completed_phase}): evolve PROJECT.md after transition` — `--files .planning/PROJECT.md` (PROJECT.md commit precedent at `execute-phase.md:1670`: `gsd_run query commit "docs(phase-{X}): evolve PROJECT.md after phase completion" --files .planning/PROJECT.md`)
- After `update_session_continuity_after_transition`: `docs(phase-${completed_phase}): update STATE.md after transition` — `--files .planning/STATE.md` (one commit sweeps steps 4-7 + graduation backlog)

**Tolerant-commit pattern for the config-set sites** (`execute-phase.md:1645` — note `|| true`):
```bash
gsd_run query commit "docs(phase-${PHASE_NUMBER}): auto-close ${#CLOSED[@]} todo(s) resolved by this phase" --files .planning/todos/completed/ .planning/STATE.md|| true
```
Adapted for L552/L606 (immediately after each config-set line):
```bash
gsd_run query commit "chore: clear auto-advance chain flag" --files .planning/config.json || true
```
(`|| true` because a `false → false` rewrite is byte-identical — jj sees no change, commit is a no-op.)

**Gate fence — copy verbatim, reword 3 strings** (`execute-phase.md:1686-1708`; TABS inside the fence — copy byte-style):
```bash
DIRTY=$(gsd_run query diff --name-only 2>/dev/null | jq -r '.nameOnly // [] | join("\n")')
if [ -n "$DIRTY" ]; then
	# Categorize the dirty paths so the operator can diagnose which class of leak fired.
	PLANNING_DIRTY=$(echo "$DIRTY" | grep -E '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$' || true)
	OTHER_DIRTY=$(echo "$DIRTY" | grep -vE '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$' || true)

	echo "FATAL: working copy is dirty before phase completion." >&2
	echo "" >&2
	if [ -n "$PLANNING_DIRTY" ]; then
		echo "Orchestrator-owned planning artifacts (a workflow step skipped its follow-up commit):" >&2
		echo "$PLANNING_DIRTY" | sed 's/^/  /' >&2
	fi
	if [ -n "$OTHER_DIRTY" ]; then
		echo "Source / scripts / tests (executor commit protocol may have leaked, OR unrelated WIP was present):" >&2
		echo "$OTHER_DIRTY" | sed 's/^/  /' >&2
	fi
	echo "" >&2
	echo "Phase completion requires a clean working copy. Resolve via one of:" >&2
	echo "  - commit the listed files with a descriptive message" >&2
	echo "  - if planning artifacts: identify the workflow step that produced them and add its missing commit (do not just paper over here)" >&2
	echo "  - if unrelated WIP: jj abandon @ (or stash via git, then re-run phase execution)" >&2
	exit 1
fi
```
Re-word for transition: `"FATAL: working copy is dirty before transition completion."`, `"Phase completion requires"` → `"Transition completion requires"`, `"re-run phase execution"` → `"re-run the transition"`.

**Step preamble re-wording precedent** (`plan-phase.md:1766-1773` shows how the case list is re-derived per workflow — list THIS workflow's mutating steps and leak cases):
> **Final-gate check: assert the working copy is clean before declaring phase planned.**
>
> By the time we reach this step, every committable change should already be in history:
> - §13b's `state.planned-phase` mutation should have been committed by §13d (when `commit_docs: true`).
> - §13c's `roadmap.annotate-dependencies` mutation likewise.
> - Any subagent (researcher / pattern-mapper / planner / plan-checker) that wrote artifacts to disk should have committed them inline.
>
> Any uncommitted change at this point is a real problem — either (a) ..., (b) ..., (c) ..., (d) the user mixed unrelated WIP ... All four cases warrant aborting before the "PHASE PLANNED ✓" banner rather than silently lying about WC cleanliness.

For transition, the preamble's case list enumerates: `phase.complete` (committed after L167), PROJECT.md evolution (committed at end of `evolve_project`), the STATE.md cluster (one sweep commit after `update_session_continuity_after_transition`), and notes that the only post-gate writes are the L552/L606 config-sets, which carry their own tolerant commits. Also copy the closing **"Why unconditional and not just `.planning/`"** + **"Do not bypass"** prose blocks (`execute-phase.md:1711-1718`), reworded.

**Step XML shape** (both analog workflows): `<step name="assert_clean_wc">` ... `</step>` — keep the exact step name; SC1's grep target is `gsd_run query diff --name-only` (must appear ≥ 1 time in transition.md).

---

### `scripts/dogfood-restore.sh` (utility script, file-I/O)

**Analog:** its own existing FATAL block. 121 lines, `#!/usr/bin/env bash`, tab-indented, `set -euo pipefail` at L29 — stay bash, stay tabs.

**Loud-fail pattern to match** (lines 65-68 — echo-to-stderr + exit 1):
```bash
if [ ! -f "$TARBALL_PATH" ]; then
	echo "FATAL: tarball not found: ${TARBALL_PATH}" >&2
	exit 1
fi
```

**CLEANUP-03 insertion point (revised per plan checker):** immediately after the positional parse (L47-48), BEFORE the tarball check (L65-68) — still ahead of both mutations (`jj op restore` L71, `tar -xf` L74), and the root assertion (not the tarball FATAL) is what fires on a wrong-cwd run. The WR-01 literal (single-line `||`-group form, `set -e`-safe, tab-indented):
```bash
[ -f .planning/STATE.md ] || { echo "ERROR: dogfood-restore.sh must run from project root" >&2; exit 1; }
```
Either the if-block style (matching L65-68, with `FATAL:`) or the WR-01 one-liner satisfies the REQ; the WR-01 literal is the spec text — prefer it. Also update the L25 comment (`# Pre-condition: must be run from the project root.`) to note the check is now enforced.

**CLEANUP-04 (recommendation (b), comment-only):** the comment-block style precedent is this file's own L13-17 "Ordering rationale" block — multi-line `#` prose with a pointer to the research that justified the decision. Place the new asymmetry-is-intended block adjacent to L73-74 (`tar -xf "$TARBALL_PATH" -C .`), explaining: `jj op restore` already rewinds tracked state; the tar overlay is an additive top-up; files created after the snapshot surviving the restore is accepted behavior (validated empirically by Phase 14 P05).

**Test compatibility (verified):** `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` `seedJjRepo` already writes `.planning/STATE.md` into the fixture specifically for this WR-01 precondition — both existing tests pass unmodified. Script stays git-free (jj + tar only) so `lint-vcs-no-raw-git` (which scans `.sh`) stays green.

---

### `src/vcs-command-router.cts` — `workspaceParallelDispatchVerb` (CLI router, request-response)

**Analog:** the handler's own peer envelopes. File style: 2-space indent, single quotes, semicolons — match the file, NOT the global tab preference.

**Arg loop + the NaN hole** (lines 1131-1143; `maxConcurrency = Number(args[++i])` at L1141 has no guard):
```ts
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--phase' && args[i + 1]) {
      phaseNumber = Number(args[++i]);
    } else if (args[i] === '--main-bookmark' && args[i + 1]) {
      mainBookmarks.push(args[++i]);
    } else if (args[i] === '--plan' && args[i + 1]) {
      planRaw = args[++i];
    } else if (args[i] === '--max-concurrency' && args[i + 1]) {
      maxConcurrency = Number(args[++i]);
    }
  }
```

**Envelope pattern to mirror — the `--phase` guard** (lines 1145-1150):
```ts
  if (phaseNumber === undefined || Number.isNaN(phaseNumber)) {
    return { data: { ok: false, reason: 'phase_number_required' } };
  }
  if (planRaw === undefined) {
    return { data: { ok: false, reason: 'plan_required' } };
  }
```

**Richer envelope variant — `plan_json_parse_failed`** (lines 1177-1189; the try/catch CLEANUP-05's guard lands after):
```ts
  let plan: readonly { agentId: string; planId: string; workspacePath?: string }[];
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
```
Immediately after L1189 the handler calls `createVcsAdapter(cwd)` (L1191) and dispatches (L1192-1197) — both new guards MUST return before L1191.

**CLEANUP-06 guard** (insert adjacent to the L1145 phase guard, after the arg loop; `!== undefined` leg preserves the D-07 absent-flag-forwards-undefined contract pinned by `cmd-parallel-max-concurrency-cli.test.ts:132-145`):
```ts
  if (maxConcurrency !== undefined && Number.isNaN(maxConcurrency)) {
    return { data: { ok: false, reason: 'max_concurrency_invalid' } };
  }
```
(Reason string `max_concurrency_invalid` is the RESEARCH recommendation — snake_case like all peers; no existing invalid-optional-flag precedent; the contract test pins whatever ships. Locked at plan time.)

**CLEANUP-05 guard** (insert after the parse try/catch, ~L1190; `plan_not_array` is locked by REQ text):
```ts
  if (!Array.isArray(plan)) {
    return { data: { ok: false, reason: 'plan_not_array' } };
  }
```

**Build note:** vitest resolves `import('../../vcs-command-router.cjs')` to the `.cts` source (no `.cjs` exists in `src/`) — no build needed for contract tests. The emitted `gsd-core/bin/lib/vcs-command-router.cjs` artifact DOES go stale: run `pnpm run build:lib` after router edits before any CLI smoke or node:test run.

---

### `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` (test, vi.mock unit)

**Analog:** its own harness — new CLEANUP-05/06 contract `it`s extend this exact file (a sibling `describe` is the recommended shape).

**Loader** (lines 35-44 — module-level, default-interop):
```ts
async function loadWorkspaceParallelDispatchVerb() {
	const ns = (await import('../../vcs-command-router.cjs')) as Record<string, unknown>;
	const mod = ((ns as { default?: unknown }).default ?? ns) as {
		VCS_VERB_TABLE: Record<
			string,
			(args: string[], projectDir: string) => Promise<{ data: unknown }> | { data: unknown }
		>;
	};
	return mod.VCS_VERB_TABLE['workspace.parallel.dispatch'];
}
```

**Recorder + vi.mock block** (lines 48, 54-71 — already present; do NOT duplicate, new tests reuse it):
```ts
const recordedDispatchOpts: Array<{ maxConcurrency?: number }> = [];

vi.mock('../index.cjs', () => ({
	createVcsAdapter: () => ({
		workspace: {
			parallel: {
				dispatch: (opts: { maxConcurrency?: number }) => {
					recordedDispatchOpts.push(opts);
					return Object.freeze({
						phaseRoot: '/tmp/fake-phase',
						phaseNumber: 11,
						mainBookmarks: ['main'],
						manifest: '',
						workspaces: Object.freeze([]),
					});
				},
			},
		},
	},
}));
```

**Full analog `it` block** (lines 132-145 — the D-07 contract test that MUST stay green after CLEANUP-06; also the structural template for new tests):
```ts
	it('forwards maxConcurrency: undefined when --max-concurrency is absent (D-07 default-undefined contract)', async () => {
		recordedDispatchOpts.length = 0;
		const workspaceParallelDispatchQuery = await loadWorkspaceParallelDispatchVerb();
		const plan = JSON.stringify([{ agentId: 'agent-1', planId: 'plan-1' }]);
		await workspaceParallelDispatchQuery(
			['--phase', '11', '--main-bookmark', 'main', '--plan', plan],
			'/tmp/irrelevant-cwd',
		);
		expect(recordedDispatchOpts.length).toBe(1);
		expect(recordedDispatchOpts[0].maxConcurrency).toBeUndefined();
	});
```

**New-test shape** (envelope assertion variant — assert `ok:false`, exact `reason`, AND `recordedDispatchOpts.length === 0` proving the guard fired BEFORE the adapter):
```ts
	it('returns {ok:false, reason:plan_not_array} for a JSON object plan; adapter never called', async () => {
		recordedDispatchOpts.length = 0;
		const dispatch = await loadWorkspaceParallelDispatchVerb();
		const res = await dispatch(['--phase', '18', '--plan', '{"not":"an array"}'], '/tmp/irrelevant-cwd');
		const data = res.data as { ok?: boolean; reason?: string };
		expect(data.ok).toBe(false);
		expect(data.reason).toBe('plan_not_array');
		expect(recordedDispatchOpts.length).toBe(0);
	});
```
Inputs to cover: `'{"not":"an array"}'`, `'"str"'`, `'42'`, `'null'` (CLEANUP-05); `['--max-concurrency', 'NaN']` and `['--max-concurrency', 'banana']` (CLEANUP-06). Note `projectDir: '/tmp/irrelevant-cwd'` works because the handler's config-read catch (router L1161-1163) treats missing config as dispatch-allowed. File uses TABS. Imports already include `vi`: `import { describe, it, expect, vi } from 'vitest';` (L30).

---

### `src/vcs/__tests__/cmd-parallel-jj.test.ts` + `cmd-parallel-git.test.ts` — CONFIG-02 describes (test, unit)

**Analog:** own structure + `jj-reap.test.ts:71-73` for the cleanup idiom. Both files use TABS.

**Current import lines (jj file L36-38; git file L55-57 is identical except L60 adds `spawnSync`):**
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
```
Edits: add `afterEach` to the vitest import; add `rm` to the `node:fs/promises` import. (`rmSync` from `node:fs` is already imported but the acceptance literal uses async `rm`.)

**Current per-test `const` shape** (jj L778-787; git L1007-1016 byte-parallel with prefix `gsd-cfg02-git-`; three `it`s each — jj mkdtemps at L780/L809/L842, git at L1009/L1038/L1071):
```ts
describe('CONFIG-02 — parallelization_disabled', () => {
	it('returns {ok:false, reason:parallelization_disabled} when .planning/config.json has explicit false', async () => {
		const tmpDir = await mkdtemp(
			join(tmpdir(), `gsd-cfg02-jj-${Math.random().toString(36).slice(2, 10)}-`),
		);
		await mkdir(join(tmpDir, '.planning'), { recursive: true });
		await writeFile(
			join(tmpDir, '.planning', 'config.json'),
			JSON.stringify({ parallelization: false }),
		);
		...
```

**Required edit shape (per file, scoped INSIDE the CONFIG-02 describe — other describes already have their own `beforeAll`/`afterAll` `rmSync` cleanup):**
```ts
describe('CONFIG-02 — parallelization_disabled', () => {
	let tmpDir: string;

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it('returns {ok:false, reason:parallelization_disabled} when .planning/config.json has explicit false', async () => {
		tmpDir = await mkdtemp(
			join(tmpdir(), `gsd-cfg02-jj-${Math.random().toString(36).slice(2, 10)}-`),
		);
		...
```
Mechanics: hoist `let tmpDir: string;` to describe scope, change each `const tmpDir = await mkdtemp(...)` → `tmpDir = await mkdtemp(...)` (3 sites per file). Safe because vitest runs same-file `it`s serially.

**Cleanup-idiom precedent** (`jj-reap.test.ts:71-73` — sync variant of the same recursive+force shape):
```ts
		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});
```

**Verification:**
```bash
ls -d "${TMPDIR:-/tmp}"/gsd-cfg02-* 2>/dev/null | wc -l   # pre-clean old leaks first
npx vitest run --project unit src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts -t 'CONFIG-02'
ls -d "${TMPDIR:-/tmp}"/gsd-cfg02-* 2>/dev/null | wc -l   # must be 0
```

---

### `src/vcs/__tests__/jj-reap.test.ts` — inclusion-filter test (test, real-jj integration)

**Conditional edit only** — TEST-17's re-verify gate runs FIRST (3+ recorded `GSD_TEST_BACKENDS=git,jj npx vitest run` passes → close as resolved-by-restructure, file untouched).

**Current signature** (lines 79-94, no per-test timeout — inherits the unit project's 30_000 default; file uses TABS):
```ts
		it('inclusion-filter: ignores workspaces NOT matching phaseNamePrefix', () => {
			const wsPath = join(dir, '.claude/jj-workspaces/unrelated-name');
			vcs.workspace.add({ path: wsPath, name: 'unrelated-name' });
			const result = vcs.workspace.reap({
				phaseNamePrefix: 'phase-04-subagent-',
				phaseDir,
			});
			expect(result.abandoned).toHaveLength(0);
			...
```
Header comment at L25-27 explicitly bans retry config and skip modifiers (D-15 / Pitfall 9) — the fix shape must honor it.

**Per-test timeout precedent — options-object form, NOT trailing-number** (verified 15+ occurrences suite-wide, e.g. `cmd-parallel-jj.test.ts:141`, `cmd-parallel-cancel-git.test.ts:97`; one 60s example at `cmd-parallel-git.test.ts:429`):
```ts
			it(`N=${N}: dispatch creates ${N} distinct change_ids; ...`, { timeout: 30000 }, () => {
```
If (and only if) the flake reproduces:
```ts
		it('inclusion-filter: ignores workspaces NOT matching phaseNamePrefix', { timeout: 60000 }, () => {
```
**The REQUIREMENTS literal `15_000` is now a timeout REDUCTION** (unit-project default is already 30_000 since 19-11) — a meaningful extension must exceed 30s; record the deviation. Constraints: diff ≤5 LOC, ≤1 file, root `vitest.config.ts` UNTOUCHED, `scripts/check-skip-count.cjs` green (baseline 22; `describe.skipIf` is not counted).

## Shared Patterns

### gsd-tools bridge commit (apply to: all transition.md grafts)
**Source:** `gsd-core/workflows/execute-phase.md:1574, 1645, 1670`
```bash
gsd_run query commit "<conventional-commit message>" --files <space-separated .planning paths>
```
Always `--files`-scoped; append `|| true` ONLY for possibly-no-op commits (config-set sites). Never raw `jj`/`git` in fences. Never a second launcher embed.

### Fail-closed envelope (apply to: both router guards)
**Source:** `src/vcs-command-router.cts:1145-1189`
```ts
return { data: { ok: false, reason: '<snake_case_reason>' } };
```
Guards return BEFORE `createVcsAdapter` (L1191) — backend-agnostic, vi.mock-testable.

### Stderr FATAL + exit 1 (apply to: dogfood-restore.sh assertion; conceptually shared with the workflow gate fence)
**Source:** `scripts/dogfood-restore.sh:65-68` / `execute-phase.md:1692`
```bash
echo "FATAL: <what is wrong>: <offending value>" >&2
exit 1
```

### Tab indentation in tests/scripts/workflow fences; 2-space in `.cts`
`src/vcs/__tests__/*.test.ts`, `scripts/dogfood-restore.sh`, and the bash fences inside `gsd-core/workflows/*.md` all use TABS. `src/vcs-command-router.cts` uses 2-space + single quotes + semicolons. Match the surrounding file in every case.

### Fixture-repo verification (apply to: CLEANUP-01 SC1 gate check)
**Source:** `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` `seedJjRepo` shape / `jj-reap.test.ts:53-68`
```ts
dir = mkdtempSync(join(tmpdir(), 'gsd-jj-reap-'));
execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
```
Never create synthetic dirty files in THIS repo's working tree (jj auto-snapshot); the SC1 gate script is ephemeral, run-and-discard, stdout-only.

## No Analog Found

None — every modified file has an exact or same-file analog.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | — |

## Metadata

**Analog search scope:** `gsd-core/workflows/`, `scripts/`, `src/vcs-command-router.cts`, `src/vcs/__tests__/`
**Files scanned:** 9 read directly (targeted ranges for the 4 files > 600 lines); suite-wide grep for `{ timeout: N }` precedent
**Pattern extraction date:** 2026-06-10
**Line numbers verified live this session** — re-verify offsets at execute time if other work lands first (RESEARCH "valid until" caveat applies).
