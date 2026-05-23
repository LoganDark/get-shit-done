# Phase 14: Default flip + dogfood validation — Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 8 (3 modified config/source files, 2 modified test files, 3 new files)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `get-shit-done/templates/config.json` (MODIFIED) | config (install template) | static-data | self (D-04: flatten lines 31-38 only; surrounding keys untouched) | exact (in-file replacement) |
| `.planning/config.json` (MODIFIED) | config (this-repo state) | static-data | self (D-03: flip `parallelization: false` → `true` on line 4) | exact (in-file replacement) |
| `sdk/src/query/workspace-parallel-dispatch.ts` (MODIFIED) | controller (CLI bridge / QueryHandler) | request-response (envelope) | self lines 63-71 (existing 3 envelopes); `sdk/src/query/config-gates.ts` lines 8/26-28 (`loadConfig` invocation precedent) | exact (peer envelope in same file) |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (MODIFIED) | test (vitest contract) | request-response (CLI bridge under test) | `sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` lines 30-93 (extends same file under test, but with FS fixture instead of `vi.mock`) | role-match (different mocking strategy) |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (MODIFIED) | test (vitest contract) | request-response | same as above (parallel sibling) | role-match |
| `scripts/dogfood-phase-14.sh` (NEW) | utility (shell harness orchestrator) | batch (dispatch + commits + fan-in + metrics) | `scripts/e2e-parallel-phase.sh` (358-line full harness; same `gsd-sdk query` surface, same jq pipelines, same `mktemp` idiom) | exact (role + data flow), one key deviation (in-repo, not mktemp throwaway) |
| `scripts/dogfood-restore.sh` (NEW) | utility (recovery primitive) | one-shot CLI tool | `scripts/e2e-parallel-phase.sh` lines 1, 34, 38-66, 286-295 (shebang + `set -euo pipefail` + usage block + arg validation + assert helpers — the shell-script conventions) | role-match (different domain: recovery vs e2e harness, but identical shell-conventions) |
| `.planning/intel/v1.3-dogfood-metrics.md` (NEW) | doc (durable planning artifact) | static-data (write-once committed evidence) | `.planning/intel/06-dogfood-log.md` lines 1-11 (front-matter conventions: Date, Operator, base directory mktemp literal, tool versions); lines 40-67 (code-fenced command + JSON output blocks) | role-match (Phase 6 prose-heavy; Phase 14 metric/anchor — same front-matter+code-fence shape) |

## Pattern Assignments

### `get-shit-done/templates/config.json` (config, static-data)

**Analog:** self — the file's own surrounding structure dictates the only valid mutation site.

**Existing structure** (`get-shit-done/templates/config.json` lines 30-39):
```jsonc
  "planning": {
    "commit_docs": true,
    "search_gitignored": false,
    "sub_repos": []
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },
  "gates": {
```

**Mutation (D-04):** replace lines 31-38 (the entire nested-block value) with the flat boolean literal:
```jsonc
  "parallelization": true,
```

All surrounding keys (`mode` line 2, `granularity` line 3, `workflow` lines 4-22, `ship` lines 23-25, `planning` lines 26-30, `gates` lines 39-48, `safety` lines 49-52, `hooks` lines 53-55, `project_code` line 56, `agent_skills` line 57, `claude_md_path` line 58) remain untouched. No trailing comma after the `true` (the next line is `"gates":` with a leading comma already in place per existing structure — verify after edit).

**Test coupling guard:** `tests/feat-3167-ship-pr-body-sections.test.cjs:135` is the only programmatic consumer of this template; it asserts `template.ship.pr_body_sections` (line 24 of the template, untouched). The flatten preserves that assertion.

**Deviations:** None — this is a self-contained shape change, not a pattern copy.

---

### `.planning/config.json` (config, static-data)

**Analog:** self — single-line value flip, no surrounding structure changes.

**Existing line 4:**
```json
  "parallelization": false,
```

**Mutation (D-03):** flip the boolean only:
```json
  "parallelization": true,
```

**Deviations:** None — single-token edit. The mitigation pattern (D-03 mitigation contract tests) lives in `cmd-parallel-{jj,git}.test.ts` per the next entries.

---

### `sdk/src/query/workspace-parallel-dispatch.ts` (controller, request-response)

**Analog:** the file's own existing 3 validation envelopes at lines 63-71 (peer-shaped), with `loadConfig` invocation pattern borrowed from `sdk/src/query/config-gates.ts:8` + `:26-28`.

**Existing peer envelopes** (`sdk/src/query/workspace-parallel-dispatch.ts:63-71`):
```typescript
	if (phaseNumber === undefined || Number.isNaN(phaseNumber)) {
		return { data: { ok: false, reason: 'phase_number_required' } };
	}
	if (!mainBookmark) {
		return { data: { ok: false, reason: 'main_bookmark_required' } };
	}
	if (planRaw === undefined) {
		return { data: { ok: false, reason: 'plan_required' } };
	}
```

**`loadConfig` invocation precedent** (`sdk/src/query/config-gates.ts:8` + `:26-28`):
```typescript
import { CONFIG_DEFAULTS, loadConfig } from '../config.js';

// ...

export const checkConfigGates: QueryHandler = async (args, projectDir) => {
	const config = await loadConfig(projectDir);
	// ... use config.*
};
```

**Mutation (D-06 + D-07 + D-08):** at the top of the file, alongside the existing `import { readFileSync }` / `import { createVcsAdapter }` lines, add:
```typescript
import { loadConfig } from '../config.js';
```

Inside `workspaceParallelDispatchQuery`, **after** the `plan_required` envelope at line 70 and **before** the `let plan: readonly...` block at line 73, insert:
```typescript
	const config = await loadConfig(cwd);
	if (config.parallelization === false) {
		return {
			data: {
				ok: false,
				reason: 'parallelization_disabled',
				message:
					'Parallelization is disabled in .planning/config.json. ' +
					'Set `parallelization: true`, or remove the explicit `false` ' +
					'entry to fall back to the default (true).',
			},
		};
	}
```

**Critical strictness contract** (RESEARCH §A — caveat the SDK loader does not do nested→flat normalization; CJS `core.cjs:480-485` does, the SDK does not):
- Check MUST be strict-equal-`false` (`config.parallelization === false`), NOT loose `!config.parallelization`. A brownfield repo with the old nested object shape would resolve to a truthy object; strict-equal-`false` skips the envelope in that case, which is the safe default.

**Deviations from the analog (the existing three envelopes):**
1. The new envelope adds a `message` field (D-08); the existing three carry only `ok`+`reason`. Justification: D-08 explicitly requires the message guide the user to two unblock paths.
2. The new envelope reads from `loadConfig(cwd)` (async filesystem read); the existing three check args-already-parsed (sync, no I/O). Placed AFTER inputs because (a) input checks are cheap, (b) `loadConfig` is async, (c) failing fast on missing inputs is correct regardless of config.
3. Uses `cwd` (already resolved at line 43 from `--cwd` override-or-`projectDir`) — NOT `projectDir` as in `config-gates.ts:27`. Justification: the dispatch handler honors `--cwd` overrides at line 51, so the loaded config should match the cwd the dispatch actually runs against.

---

### `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (test, request-response)

**Analog:** `sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` lines 30-93 — same file under test, same direct-invocation handler call. **But the strategy differs:** the D-03 mitigation uses an FS-fixture (write `.planning/config.json`, hand the dir as `projectDir`) instead of `vi.mock`.

**`describe` block structure precedent** (`cmd-parallel-max-concurrency-cli.test.ts:58-93`):
```typescript
describe('PARALLEL-06 — workspace.parallel.dispatch CLI threads --max-concurrency', () => {
	it('passes the parsed --max-concurrency value into ParallelDispatchOpts.maxConcurrency', async () => {
		recordedDispatchOpts.length = 0;
		const { workspaceParallelDispatchQuery } = await import(
			'../../query/workspace-parallel-dispatch.js'
		);
		const plan = JSON.stringify([
			{ agentId: 'agent-1', planId: 'plan-1' },
			{ agentId: 'agent-2', planId: 'plan-2' },
		]);
		const res = await workspaceParallelDispatchQuery(
			[
				'--phase', '11',
				'--main-bookmark', 'main',
				'--plan', plan,
				'--max-concurrency', '2',
			],
			'/tmp/irrelevant-cwd',
		);
		expect(recordedDispatchOpts.length).toBe(1);
		expect(recordedDispatchOpts[0].maxConcurrency).toBe(2);
		const data = res.data as { ok?: boolean; workspaces?: unknown };
		expect(data.ok).toBeUndefined();
	});
});
```

**Pattern B mkdtemp fixture precedent** (`cmd-parallel-jj.test.ts:63-86`):
```typescript
function setupJjRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-jj-parallel-${Math.random().toString(36).slice(2, 10)}-`,
		),
	);
	execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
	// ...
	mkdirSync(join(dir, '.planning', 'phases', '09-test'), { recursive: true });
	return dir;
}
```

**Mutation (D-03 mitigation):** add a new `describe('CONFIG-02 — parallelization_disabled')` block at the end of the file. The block does NOT need `jj git init --colocate` — it's testing the CLI bridge envelope, not the adapter; `workspaceParallelDispatchQuery` returns the envelope BEFORE it calls `createVcsAdapter`, so a plain mkdtemp with a `.planning/config.json` file is sufficient (per RESEARCH Common Operation 2):

```typescript
describe('CONFIG-02 — parallelization_disabled', () => {
	it('returns {ok:false, reason:parallelization_disabled} when .planning/config.json has explicit false', async () => {
		const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-cfg02-jj-'));
		await mkdir(join(tmpDir, '.planning'), { recursive: true });
		await writeFile(
			join(tmpDir, '.planning', 'config.json'),
			JSON.stringify({ parallelization: false }),
		);

		const { workspaceParallelDispatchQuery } = await import(
			'../../query/workspace-parallel-dispatch.js'
		);
		const plan = JSON.stringify([{ agentId: 'a', planId: 'p' }]);
		const res = await workspaceParallelDispatchQuery(
			['--phase', '14', '--main-bookmark', 'main', '--plan', plan],
			tmpDir,
		);
		const data = res.data as { ok?: boolean; reason?: string; message?: string };
		expect(data.ok).toBe(false);
		expect(data.reason).toBe('parallelization_disabled');
		expect(typeof data.message).toBe('string');
		expect(data.message).toMatch(/parallelization: true/);
	});
});
```

**Imports to add** (extend existing top-of-file imports):
```typescript
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
```
The file already imports `mkdtempSync` / `mkdirSync` / `writeFileSync` from `node:fs`; adding the promise-flavored variants is the consistent extension. (Alternatively reuse the sync versions wrapped in `await` — planner picks.)

**Deviations from the `cmd-parallel-max-concurrency-cli.test.ts` analog:**
1. No `vi.mock` — the envelope check returns BEFORE `createVcsAdapter` runs, so the real adapter is never reached. The test does not need to fake the adapter.
2. The test uses an FS fixture (`.planning/config.json`) instead of testing argv-plumbing. Justification: `loadConfig` reads disk; no other observable surface for the config value.
3. Lives in a new `describe` block inside an existing file rather than a new `cmd-cfg02-*.test.ts` file. Justification: CONTEXT D-03 literal wording: "the vitest contract tests `cmd-parallel-{jj,git}.test.ts` get one new fixture case each."

---

### `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (test, request-response)

**Analog:** the sibling jj-test file above. Same `describe('CONFIG-02 — parallelization_disabled')` block, same FS-fixture pattern, just labeled `gsd-cfg02-git-` for the mkdtemp prefix to keep collision-resistant naming consistent with the file's existing `gsd-git-parallel-` fixtures (cmd-parallel-git.test.ts:88).

**Deviations:** None from the jj-sibling. The CLI bridge under test is backend-agnostic for this code path (envelope returns before any adapter dispatch), so the test text is byte-identical except for the prefix label.

**Optional simplification (planner discretion):** if the planner reads CONTEXT D-03 strictly ("one new fixture case each") to mean exactly one assertion-block, ship only the explicit-false case in each file. If the planner reads it as "the case set for CONFIG-02," add two more `it()` blocks per file (missing-key defaults to true; explicit-true does not refuse) — RESEARCH Phase Requirements → Test Map (lines 729-731) shows the full set of three desirable cases.

---

### `scripts/dogfood-phase-14.sh` (utility, batch)

**Analog:** `scripts/e2e-parallel-phase.sh` (358 lines — the closest existing harness; same `gsd-sdk query` surface, same `jq` pipelines, same `mktemp` sibling-temp idiom, same `set -euo pipefail` discipline).

**Shebang + safety preamble** (`scripts/e2e-parallel-phase.sh:1` + `:34`):
```bash
#!/usr/bin/env bash
# ... documentation header ...
set -euo pipefail
```

**Per RESEARCH §"Project Constraints" line 796:** the precedent is `#!/usr/bin/env bash` (NOT the user's `#!/bin/zsh` default), because this script reuses `e2e-parallel-phase.sh`'s patterns verbatim. Indentation is tabs per user CLAUDE.md.

**Env-var parsing + validation block** (`scripts/e2e-parallel-phase.sh:58-72`):
```bash
BACKEND="${GSD_E2E_BACKEND:-}"
case "$BACKEND" in
  git | jj-colocated) ;;
  *)
    echo "FATAL: GSD_E2E_BACKEND must be 'git' or 'jj-colocated' (got: '${BACKEND}')" >&2
    usage
    exit 1
    ;;
esac

GSD_SDK="${GSD_SDK:-gsd-sdk}"
```

**Usage block** (`scripts/e2e-parallel-phase.sh:38-56`):
```bash
usage() {
  cat >&2 <<'EOF'
e2e-parallel-phase.sh — CI-05 parallel-dispatch end-to-end harness

Drives `gsd-sdk query workspace.parallel.{dispatch,fan-in}` against a
throwaway repo for one backend cell.

Required environment:
  GSD_E2E_BACKEND   `git` or `jj-colocated`

Optional environment:
  GSD_SDK           the gsd-sdk invocation (default: `gsd-sdk`).
                    In CI: `node "$GITHUB_WORKSPACE/sdk/dist/cli.js"`.

Usage:
  GSD_E2E_BACKEND=jj-colocated scripts/e2e-parallel-phase.sh
  GSD_E2E_BACKEND=git GSD_SDK="node sdk/dist/cli.js" scripts/e2e-parallel-phase.sh
EOF
}
```

**Sibling-mktemp pattern** (`scripts/e2e-parallel-phase.sh:101-105`):
```bash
REPO=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gsd-e2e-XXXXXX")
cleanup() {
  rm -rf "$REPO"
}
trap cleanup EXIT
```

**Plan-JSON builder pipeline** (`scripts/e2e-parallel-phase.sh:176-178`):
```bash
AGENT_LABELS="e2e-a e2e-b"
PLANS_JSON=$(printf '%s\n' $AGENT_LABELS | jq -R . | jq -sc 'map({agentId: ., planId: .})')
```

**Dispatch invocation** (`scripts/e2e-parallel-phase.sh:180-190`):
```bash
HANDLE_JSON=$(printf '%s' "$PLANS_JSON" \
  | $GSD_SDK query workspace.parallel.dispatch \
      --cwd "$REPO" --phase 13 --main-bookmark "$MAIN_BOOKMARK" --plan @-)

[ -z "$HANDLE_JSON" ] && { echo "FATAL: dispatch returned empty Handle JSON" >&2; exit 1; }

HANDLE_OK=$(printf '%s' "$HANDLE_JSON" | jq -r '.ok // "true"')
[ "$HANDLE_OK" = "false" ] && { echo "FATAL: dispatch failed: $HANDLE_JSON" >&2; exit 1; }
```

**Per-workspace commit loop with cwd-pinned subshell** (`scripts/e2e-parallel-phase.sh:225-246`):
```bash
while IFS=$'\t' read -r WS_PATH WS_AGENT; do
  [ -z "$WS_PATH" ] && continue
  if [ ! -d "$WS_PATH" ]; then
    echo "FATAL: dispatched workspace path does not exist: ${WS_PATH}" >&2
    exit 1
  fi
  mkdir -p "${WS_PATH}/.planning"
  printf 'work %s\n' "$WS_AGENT" > "${WS_PATH}/work-${WS_AGENT}.txt"

  COMMIT_JSON=$(
    cd "$WS_PATH" \
      && $GSD_SDK query commit "feat(13-test): e2e work ${WS_AGENT}" \
           --files "work-${WS_AGENT}.txt"
  )
  COMMIT_OK=$(printf '%s' "$COMMIT_JSON" | jq -r '.committed // false')
  if [ "$COMMIT_OK" != "true" ]; then
    echo "FATAL: per-workspace commit failed for agent '${WS_AGENT}': ${COMMIT_JSON}" >&2
    exit 1
  fi
done <<< "$(printf '%s' "$HANDLE_JSON" | jq -r '.workspaces[] | .path + "\t" + .agentId')"
```

The `mkdir -p "${WS_PATH}/.planning"` marker is CRITICAL — RESEARCH Pitfall 5 — so `findProjectRoot` short-circuits to the workspace, not THIS repo's outer `.planning/`.

**Fan-in invocation with handle-file workaround** (`scripts/e2e-parallel-phase.sh:267-272`):
```bash
HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXXXX.json")
printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
  | $GSD_SDK query workspace.parallel.fan-in \
      --cwd "$REPO" --handle "@$HANDLE_FILE" --results @-)
rm -f "$HANDLE_FILE"
```

**Assertion helper + jj-side divergent() probe** (`scripts/e2e-parallel-phase.sh:286-295` + `:334`):
```bash
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL [${name}]: expected '${expected}', got '${actual}'" >&2
    echo "  HANDLE_JSON: ${HANDLE_JSON}" >&2
    echo "  FAN_RESULT:  ${FAN_RESULT}" >&2
    exit 1
  fi
  echo "  PASS [${name}]: ${actual}" >&2
}

# Assertion 5 (SC3 — TEST-14 parity)
DIVERGENT=$(cd "$REPO" && jj log -r 'divergent()' --no-graph --ignore-working-copy -T 'change_id ++ "\n"')
```

**Lint-avoidance idiom for `jj git init`** (`scripts/e2e-parallel-phase.sh:142`):
```bash
( cd "$REPO" && jj "git" init --colocate >/dev/null 2>&1 ) \
  || { echo "FATAL: 'jj ${ECHO_GIT} init --colocate' failed in ${REPO}" >&2; exit 1; }
```
The quoted `"git"` defeats the no-raw-git regex `/(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/` (RESEARCH Pitfall 6). If the rehearsal step in `dogfood-phase-14.sh` invokes `jj git init --colocate`, the same quoting trick applies.

**NEW patterns the analog does NOT have** (per RESEARCH §G + Open Q5):

1. **Millisecond-epoch timing capture (RESEARCH Common Op 4) — NET NEW to Phase 14:**
```bash
DISPATCH_START_MS=$(date +%s%3N)
HANDLE_JSON=$(printf '%s' "$PLANS_JSON" \
  | $GSD_SDK query workspace.parallel.dispatch \
      --cwd "$REPO_ROOT" --phase 14 --main-bookmark gsd/phase-14-dogfood --plan @-)
DISPATCH_END_MS=$(date +%s%3N)
DISPATCH_MS=$((DISPATCH_END_MS - DISPATCH_START_MS))
```
`e2e-parallel-phase.sh` has ZERO timing instrumentation (RESEARCH §G verified). The wrapper must add `date +%s%3N` bracketing the dispatch and fan-in invocations itself.

2. **Pre-snapshot capture (RESEARCH Common Op 3) — NET NEW to Phase 14:**
```bash
PRE=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-pre-XXXX")
echo "dogfood-phase-14: pre-snapshot dir = ${PRE}" >&2

PRE_OP_ID=$(jj op log -n 1 --no-graph -T 'id ++ "\n"')
echo "dogfood-phase-14: pre-op-id = ${PRE_OP_ID}" >&2

jj op log -n 200 > "${PRE}/pre.oplog"
tar -cf "${PRE}/planning.tar" .planning/

if command -v sha256sum >/dev/null; then
  TARBALL_SHA=$(sha256sum "${PRE}/planning.tar" | awk '{print $1}')
else
  TARBALL_SHA=$(shasum -a 256 "${PRE}/planning.tar" | awk '{print $1}')
fi
echo "dogfood-phase-14: tarball-sha256 = ${TARBALL_SHA}" >&2
```
**CRITICAL:** do NOT `trap rm -rf "$PRE"` on EXIT for the dogfood path (D-12 needs the path persisted for the recovery anchor). Only `trap rm -rf` the rehearsal-temp dirs.

3. **Bookmark management for `gsd/phase-14-dogfood`** (RESEARCH §C — NET NEW):
```bash
jj bookmark create gsd/phase-14-dogfood -r @-
# ... dispatch runs ...
jj bookmark forget gsd/phase-14-dogfood  # on green only
```
`jj bookmark forget` removes locally without remote-side effects; `jj bookmark delete` (wrong verb) would try remote deletion.

**Deviations from `scripts/e2e-parallel-phase.sh`:**
1. **Runs on THIS repo, not a mktemp throwaway.** `REPO=$(mktemp -d ...)` is replaced by `REPO_ROOT="$(pwd)"` (or equivalent; the wrapper must be invoked from the project root). No `cleanup() { rm -rf "$REPO"; }; trap cleanup EXIT` because nothing is created to clean up at the repo level (only the sibling `$PRE` mktemp dir, and that is INTENTIONALLY persisted post-run).
2. **No seed-commit setup.** The repo is already seeded with real history; the dogfood dispatches against the existing `gsd/phase-14-dogfood` bookmark (created as the pre-step), not a fresh `main`.
3. **No sentinel `.githooks/pre-commit` setup.** This repo already has its own `.githooks/`; the dogfood relies on whatever pre-commit hook the project has, not a counter-hook. SC5 hook-marker assertion (`e2e-parallel-phase.sh:343-351`) does NOT carry over to the in-repo cell.
4. **Bookmark name is `gsd/phase-14-dogfood`, not `main`.** ROADMAP SC3 explicitly says "isolated bookmark NOT main."
5. **Adds metrics capture (`date +%s%3N` brackets); the analog has none.**
6. **Adds pre-snapshot step before dispatch; the analog has none.**
7. **Optional `N=${N:-3}` env-var override** (RESEARCH Open Q3, Pitfall 4): replaces the hardcoded `AGENT_LABELS="e2e-a e2e-b"`. The wrapper builds the label list dynamically:
```bash
N="${N:-3}"
AGENT_LABELS=""
for i in $(seq 1 "$N"); do
  AGENT_LABELS="$AGENT_LABELS phase-14-$i"
done
```

---

### `scripts/dogfood-restore.sh` (utility, one-shot CLI tool)

**Analog:** `scripts/e2e-parallel-phase.sh` lines 1 + 34 + 38-66 + 286-295 — the shell-script conventions are shared, but the DOMAIN differs (recovery primitive vs e2e dispatch harness). The two scripts have nothing to do with each other functionally; only the shell-conventions copy across.

**Shebang + safety preamble** (`scripts/e2e-parallel-phase.sh:1` + `:34`):
```bash
#!/usr/bin/env bash
# ... documentation header ...
set -euo pipefail
```

**Usage block + arg-count guard** (RESEARCH Common Op 5, derived from the `e2e-parallel-phase.sh:38-56` + `:58-65` argument-validation pattern):
```bash
if [ "$#" -ne 2 ]; then
  cat >&2 <<EOF
dogfood-restore.sh — recovery primitive for Phase 14 dogfood snapshot.

Usage: $0 <pre-op-id> <tarball-path>

  <pre-op-id>      Full op-id captured into v1.3-dogfood-metrics.md by the
                   pre-snapshot step of scripts/dogfood-phase-14.sh.
  <tarball-path>   Absolute path to planning.tar in the sibling-mktemp pre-
                   snapshot dir.

This script must be run from the project root.
EOF
  exit 1
fi
```

**Pre-flight existence check** (`scripts/e2e-parallel-phase.sh:227-230` precedent — input directory existence check):
```bash
if [ ! -f "$TARBALL_PATH" ]; then
  echo "FATAL: tarball not found: ${TARBALL_PATH}" >&2
  exit 1
fi
```

**Recovery sequence** (RESEARCH Common Op 5 + Pitfall 2 ordering rationale):
```bash
echo "dogfood-restore: restoring op-id ${PRE_OP_ID}" >&2
jj op restore "$PRE_OP_ID"

echo "dogfood-restore: extracting ${TARBALL_PATH}" >&2
tar -xf "$TARBALL_PATH" -C .

echo "dogfood-restore: complete. Verify with: jj diff --summary && jj log -r '@-..@' --no-graph" >&2
```

**Ordering (RESEARCH Pitfall 2):** `jj op restore` FIRST, then `tar xf` LAST. The reverse ordering risks `jj op restore` clobbering the tar-restored files. The rehearsal step (D-11) validates this ordering on a synthetic-dirty clone.

**`--what` flag choice (RESEARCH Pitfall 3):** OMIT `--what` and let the default (`repo remote-tracking`) fire. CONTEXT D-10 mentions `--what=repo` as one option; RESEARCH recommends omitting because (a) the dogfood bookmark `gsd/phase-14-dogfood` is local-only, (b) rehearsal is the validation gate, (c) the default is conservative.

**Argument convention (RESEARCH Open Q2):** positional `<pre-op-id> <tarball-path>` — both required, no logical reordering. Matches `tar`/`xz` Unix tradition. Two args, both load-bearing, no env-var override needed.

**Deviations from the `e2e-parallel-phase.sh` analog:**
1. **No `mktemp` step inside the script.** This script consumes a pre-existing mktemp path (passed as argv), not creates one.
2. **No `trap cleanup EXIT`.** This script's purpose is to RESTORE state; trapping cleanup would defeat the recovery semantics. The pre-snapshot dir lives for the duration of the project (per D-12 recovery anchor).
3. **No `gsd-sdk query` invocations.** Recovery uses raw `jj op restore` + `tar` — no SDK verb wraps the op-log restore. Sidecar discipline doesn't apply (this isn't a VCS adapter surface; it's an OS-level primitive composition).
4. **No `jq` pipelines.** No JSON input/output; positional argv + bare stderr echoes.
5. **No assertions block.** The script's exit code reports success; verification is the caller's responsibility (the post-restore `jj diff --summary` check is documented in the trailing echo line, but not enforced inside the recovery script — that's the rehearsal step's job, in `dogfood-phase-14.sh`).

---

### `.planning/intel/v1.3-dogfood-metrics.md` (doc, static-data)

**Analog:** `.planning/intel/06-dogfood-log.md` lines 1-11 (front-matter conventions) + lines 40-67 (code-fenced command + JSON output blocks) + line 250 (cleanup-policy disclosure).

**Front-matter conventions** (`.planning/intel/06-dogfood-log.md:1-11`):
```markdown
# Phase 6 Plan 06-04 — Sibling-Clone Dogfood Log (BROWN-01) — FRESH PASS, ...

**Date:** 2026-05-14 (re-pass after upstream fixes landed)
**Operator:** LoganDark (executor: Claude Opus 4.7 / 1M, worktree `agent-a744dbfbcb88867a4`)
**Source commit:** `uswuxmkwlopzysnuvpxzzrvlyvnttpvx` (`fix(06): B-01 ...`)
**Dogfood base directory:** `/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T/gsd-dogfood-s531` (literal `mktemp -d -t gsd-dogfood-XXXX` output)
**Sibling clone path (jj):** `$DOGFOOD_BASE/dogfood-jj`
**Sibling clone path (git baseline):** `$DOGFOOD_BASE/baseline-git`
**Source-side current branch (captured pre-migration from baseline-git):** `worktree-agent-a744dbfbcb88867a4` (NOT `main` — exercises the "not assumed to be main" fix in B-02)
**SDK binary used:** `/Users/LoganDark/Documents/Projects/get-shit-done/.claude/worktrees/agent-a744dbfbcb88867a4/bin/gsd-sdk.js` (...)
**Tool versions:** `jj 0.41.0-cfdadb380babf004a3c0f1f0177335756011b3a1-…`, `git 2.50.1 (Apple Git-155)`, Node `v25.9.0`
```

**Code-fenced command + JSON output** (`.planning/intel/06-dogfood-log.md:46-67`):
```markdown
**Command:**
\`\`\`bash
node /Users/LoganDark/Documents/Projects/get-shit-done/.claude/worktrees/agent-a744dbfbcb88867a4/bin/gsd-sdk.js query migrate-vcs --target jj
\`\`\`

**Observed output (`/tmp/06-04-migrate-output.json`):**
\`\`\`json
{
  "ok": true,
  "migrated": true,
  ...
}
\`\`\`

**Exit code:** `0`.

**Verdict:** PASS. ...
```

**Cleanup-policy disclosure pattern** (`.planning/intel/06-dogfood-log.md:248-250`):
```markdown
## Cleanup

`$DOGFOOD_BASE` (`/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T/gsd-dogfood-s531`) will be removed after this log is committed. ...
```

**Mutation (D-12):** the Phase 14 file mirrors the front-matter shape but the BODY differs — Phase 6 is forensic prose with bug-by-bug verification narrative; Phase 14 is a metric-table + recovery-anchor durable artifact (per RESEARCH §D metrics-file-format recommendation):

```markdown
# v1.3 Dogfood Metrics — Phase 14

**Date:** [run date]
**Operator:** [user]
**This-repo state before dogfood:** parallelization=false (D-03 pre-flip)
**This-repo state after dogfood:** parallelization=true
**Tool versions:** `jj 0.41.0-…`, Node `v22…`, gsd-sdk built from `<commit>`

## Per-cell metrics

### jj cell (in-repo, bookmark `gsd/phase-14-dogfood`)

| Metric | Value | Unit |
|--------|-------|------|
| N (plan count) | 3 | plans |
| dispatch_ms | [value] | ms |
| fan_in_ms | [value] | ms |
| conflict_count | 0 | (0 or 1; 0 = clean) |
| workspaces created | 3 | workspaces |
| bookmark cleanup | clean (`gsd/phase-14-dogfood` abandoned) | — |
| `jj log -r 'divergent()' --no-graph` | (empty) | — |

### git cell (mktemp throwaway via dispatch+fan-in invocations forked from `e2e-parallel-phase.sh` per Open Q5)

| Metric | Value | Unit |
|--------|-------|------|
| N (plan count) | 3 | plans |
| dispatch_ms | [value] | ms |
| fan_in_ms | [value] | ms |
| conflict_count | 0 | (0 or 1) |
| workspaces created | 3 | workspaces |
| `merged.length` | 3 | (per-branch 2-parent merges) |

## Recovery Anchor (durable per D-09 / D-12)

**Pre-op-id:** `<full 64-hex op-id captured from jj op log -n 1 --no-graph -T 'id ++ "\n"'>`
**Pre-snapshot dir (sibling mktemp, transient):** `/tmp/gsd-dogfood-pre-<XXXX>`
**Tarball:** `/tmp/gsd-dogfood-pre-<XXXX>/planning.tar`
**Tarball SHA-256:** `<64-hex sha>`

**Recovery procedure:**
\`\`\`bash
bash scripts/dogfood-restore.sh '<pre-op-id>' '/tmp/gsd-dogfood-pre-<XXXX>/planning.tar'
\`\`\`

If the `/tmp/...` directory has been GC'd by the OS, the tarball is irrecoverable from this anchor. ...

## Rehearsal evidence

[paste rehearsal output / `jj diff --summary` empty proof]
```

**Deviations from `.planning/intel/06-dogfood-log.md`:**
1. **Phase 6 is forensic; Phase 14 is metric/anchor.** Phase 6 documents bug-by-bug verification (B-01/B-02/B-03 sections); Phase 14 documents two metric tables + a recovery anchor + rehearsal evidence.
2. **Tables instead of prose.** Phase 14's body is dominated by markdown tables (per-cell metrics) rather than narrative.
3. **Persistent recovery anchor.** Phase 6 disclosed mktemp cleanup ("will be removed after this log is committed"); Phase 14 PERSISTS the recovery anchor (path + SHA + op-id) as a durable v1.4 baseline reference. The pre-snapshot directory may still be GC'd by the OS; the metrics file captures the anchor regardless.
4. **No "Setup steps performed" walkthrough.** The reproduction recipe is implicit: invoke `bash scripts/dogfood-phase-14.sh` from the project root; the metrics file just records the result + recovery anchor.
5. **US English** per user CLAUDE.md (applies to prose throughout).

---

## Shared Patterns

### Shell-script conventions (all `scripts/*.sh`)
**Source:** `scripts/e2e-parallel-phase.sh:1` + `:34` + `:38-66` + `:286-295`
**Apply to:** `scripts/dogfood-phase-14.sh`, `scripts/dogfood-restore.sh`
```bash
#!/usr/bin/env bash
# ... documentation header ...
set -euo pipefail
```
Tabs for indentation; usage block via `cat >&2 <<'EOF'`; argument validation via `case` block or `[ "$#" -ne N ]` guard; all status prints to stderr (per user CLAUDE.md zsh conventions, which apply equally to bash here).

### Sibling-mktemp idiom (no auto-tracked output)
**Source:** `scripts/e2e-parallel-phase.sh:101-105` + Phase 6 `06-dogfood-log.md:6/25` + memory `feedback_avoid_jj_auto_tracked_output`
**Apply to:** `scripts/dogfood-phase-14.sh` (pre-snapshot `$PRE` + rehearsal `$REHEARSAL`)
```bash
PRE=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-pre-XXXX")
REHEARSAL=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-rehearsal-XXXX")
```
The `$PRE` directory is NOT trap-removed on EXIT (persisted per D-09/D-12); the `$REHEARSAL` directory IS trap-removed on EXIT (post-rehearsal cleanup).

### CLI-bridge `{ok: false, reason}` failure envelope
**Source:** `sdk/src/query/workspace-parallel-dispatch.ts:63-71` (existing 3 envelopes)
**Apply to:** `sdk/src/query/workspace-parallel-dispatch.ts` (new fourth envelope) + the D-03 mitigation contract test assertions in `cmd-parallel-{jj,git}.test.ts`
```typescript
return { data: { ok: false, reason: '<snake_case_reason>' } };
```
The new D-06 envelope adds a `message` field (D-08) — slightly richer than the existing three. The test assertions follow the shape `expect(data.ok).toBe(false)` + `expect(data.reason).toBe('<reason>')`.

### `loadConfig(cwd)` async defaults-merge precedent
**Source:** `sdk/src/query/config-gates.ts:8` (import) + `:26-28` (invocation)
**Apply to:** `sdk/src/query/workspace-parallel-dispatch.ts` (new D-06 check)
```typescript
import { loadConfig } from '../config.js';
// ...
const config = await loadConfig(cwd);
```
`QueryHandler` is already async; no signature change. Uses `cwd` (already resolved at `workspace-parallel-dispatch.ts:43`) instead of `projectDir` because the handler honors `--cwd` overrides.

### Pattern B random-prefix mkdtemp test fixtures
**Source:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:63-86` (`setupJjRepo`) + TEST-16 LOCKED contract
**Apply to:** D-03 mitigation fixtures in `cmd-parallel-{jj,git}.test.ts`
```typescript
const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-cfg02-jj-'));
```
Random suffix on the prefix string guards against parallel-test-FILE collisions; matches the existing file's convention (`gsd-jj-parallel-…-`, `gsd-git-parallel-…-`).

### Lint-avoidance for embedded `git` substring
**Source:** `scripts/e2e-parallel-phase.sh:79` (`ECHO_GIT=git` for diagnostics) + `:142` (`jj "git" init --colocate` quoted)
**Apply to:** any `dogfood-phase-14.sh` invocation of `jj git init` (e.g., the rehearsal-clone bootstrap if `jj "git" init --colocate` is the chosen path)
```bash
jj "git" init --colocate
```
The no-raw-git regex `/(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/` matches an unquoted `jj git init` because of the embedded ` git ` substring; quoting `"git"` breaks the match without changing behavior. **Alternative path (RESEARCH §E recommendation):** use `cp -a <source-repo> $REHEARSAL` instead of `git clone` + `jj git init --colocate` — zero lint diff, no allowlist change required.

### Subshell-cd cwd-pinning for `gsd-sdk query commit`
**Source:** `scripts/e2e-parallel-phase.sh:225-246`
**Apply to:** `scripts/dogfood-phase-14.sh` per-workspace commit loop
```bash
mkdir -p "${WS_PATH}/.planning"
COMMIT_JSON=$(
  cd "$WS_PATH" \
    && $GSD_SDK query commit "<msg>" --files "<file>"
)
```
`gsd-sdk query commit` has no `--cwd` flag (RESEARCH §C); the `.planning/` marker shorts `findProjectRoot` to the workspace (RESEARCH Pitfall 5).

### Bookmark management (raw jj is lint-clean)
**Source:** RESEARCH §C — `jj bookmark create gsd/phase-14-dogfood -r @-` + `jj bookmark forget gsd/phase-14-dogfood`
**Apply to:** `scripts/dogfood-phase-14.sh` only
Raw `jj` is NOT flagged by `scripts/lint-vcs-no-raw-git.cjs` (only raw `git` is). The verbs `bookmark create` (idiomatic for new bookmark at a revision) and `bookmark forget` (local-only removal) are stable in jj 0.41. Use `forget` not `delete` for never-pushed bookmarks.

### Phase-7+ markdown intel file conventions
**Source:** `.planning/intel/06-dogfood-log.md:1-11` (front-matter) + `:46-67` (code-fenced command/output blocks) + `:248-250` (cleanup disclosure)
**Apply to:** `.planning/intel/v1.3-dogfood-metrics.md`
Front-matter pairs at top (`**Date:** ...`); code-fenced commands and outputs labeled by file purpose; durable-artifact disclosure (Phase 6 cleans up, Phase 14 persists — but the cleanup-policy section type is the same).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All 8 files have at least one role-match analog in the codebase. The only NET-NEW patterns (timing capture, pre-snapshot, recovery primitive) are documented as deviations from `e2e-parallel-phase.sh`; no entirely-unprecedented file. |

## Metadata

**Analog search scope:**
- `scripts/` (e2e + lint + scan scripts) — full directory scanned
- `sdk/src/query/` (CLI bridges) — `config-gates.ts`, `workspace-parallel-dispatch.ts`, `commit.ts` peers
- `sdk/src/vcs/__tests__/` (parallel + concurrency test files) — `cmd-parallel-{jj,git}.test.ts`, `cmd-parallel-max-concurrency-{cli,adapter}.test.ts`
- `.planning/intel/` (durable planning artifacts) — `06-dogfood-log.md` precedent
- `get-shit-done/templates/config.json` (install template) — surrounding key context for D-04
- `.planning/config.json` (this-repo state) — direct site of D-03

**Files read:**
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/phases/14-default-flip-dogfood-validation/14-CONTEXT.md` (567 lines, full)
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/phases/14-default-flip-dogfood-validation/14-RESEARCH.md` (1275 lines, full via paginated reads)
- `/Users/LoganDark/Documents/Projects/get-shit-done/scripts/e2e-parallel-phase.sh` (358 lines, full)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/query/workspace-parallel-dispatch.ts` (97 lines, full)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/query/config-gates.ts` (70 lines, full)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` (138 lines, full)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (200 of 456 lines, sufficient for analog)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (100 of 711 lines, sufficient for analog)
- `/Users/LoganDark/Documents/Projects/get-shit-done/get-shit-done/templates/config.json` (59 lines, full)
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/config.json` (46 lines, full)
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/intel/06-dogfood-log.md` (head + tail sampled — 160 of 251 lines)

**Pattern extraction date:** 2026-05-23
