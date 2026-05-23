# Phase 14: Default flip + dogfood validation — Research

**Researched:** 2026-05-23
**Domain:** GSD v1.3 closing phase — config template flip, CLI-bridge pre-flight, in-repo dogfood with sibling-mktemp pre-snapshot + rehearsed recovery, durable metrics for v1.4 baseline
**Confidence:** HIGH (file paths/line numbers verified from current tree; jj 0.41 CLI behaviour confirmed against the live `jj` binary; CONTEXT.md is already authoritative on the architecturally load-bearing decisions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dogfood execution model (DOGFOOD-01):**
- **D-01** Hybrid execution model. jj cell = `scripts/dogfood-phase-14.sh` wrapper creating `gsd/phase-14-dogfood` bookmark in THIS repo's colocated jj (NOT main), dispatches 2-3 runtime-synthetic plans via `gsd-sdk query workspace.parallel.dispatch`, asserts clean fan-in + cleanup, abandons the bookmark on green. git cell = reuses `scripts/e2e-parallel-phase.sh` unchanged with `GSD_E2E_BACKEND=git` against a mktemp throwaway repo. Synthetic plans are runtime-generated in-memory carrying `{agentId, planId, workspacePath?}` only — not GSD PLAN.md.
- **D-02** Plan count defaults to N=2 for both cells; wrapper accepts an `N=3` env-var override for stretch measurement. Planner free to standardize on N=3 if Phase 13's data shows N=2 is too noisy.

**This-repo config flip (CONFIG-01 brownfield exercise):**
- **D-03** This repo's `.planning/config.json` parallelization flips permanently from `false` to `true` as the dogfood's pre-step. Mitigation: vitest contract tests `cmd-parallel-{jj,git}.test.ts` get one new fixture case each that writes `parallelization: false` and asserts the `{ok:false, reason:'parallelization_disabled'}` envelope — moves the invariant test from in-the-wild to test-fixture.

**Install-template flip (CONFIG-01):**
- **D-04** `get-shit-done/templates/config.json` parallelization block flattens from nested-block shape (lines 31-38) to flat boolean `"parallelization": true`. `loadConfig` normalizes both shapes on read (`core.cjs:480-485`) so template is INERT at init regardless of shape. Only `tests/feat-3167-ship-pr-body-sections.test.cjs:135` parses this template file and asserts only on `template.ship.pr_body_sections`.
- **D-05** No Phase-6-style greenfield/brownfield boundary for parallelization. `loadConfig`'s defaults-merge already implements the required "config-wins-over-default; missing-key = default" behavior. Memory `project_migration_boundary` stays scoped to its actual `vcs.adapter` domain.

**CONFIG-02 pre-flight surface:**
- **D-06** CONFIG-02's pre-flight check lives ONLY in `sdk/src/query/workspace-parallel-dispatch.ts:42-96`. Add a fourth validation envelope `{ok:false, reason:'parallelization_disabled', message:'<clear instruction>'}` alongside the existing three at lines 64/67/70. NOT placed in the adapter bodies — they are UPSTREAM-02-disciplined and forbidden from importing config-aware modules.
- **D-07** Missing-key semantics resolve via `loadConfig` (already async-compatible with the bridge's `QueryHandler` signature). `loadConfig`'s defaults-merge gives missing-key → `CONFIG_DEFAULTS.parallelization = true`. Missing-key is explicitly NOT conflated with explicit-`false`. Mirrors the `config-gates.ts:27` precedent.
- **D-08** Error envelope shape is `{ok: false, reason: 'parallelization_disabled', message: '<clear instruction>'}` — peer to lines 64/67/70. NOT a thrown typed `VcsParallelizationDisabledError`. The `message` field must tell the user how to unblock.

**Pre-snapshot + recovery (DOGFOOD-02):**
- **D-09** Pre-snapshot destination is a sibling temp directory created via `mktemp -d -t gsd-dogfood-pre-XXXX` — NEVER inside this repo's working tree. Two artifacts inside the snapshot dir: `pre.oplog` (output of `jj op log -n 200`) and `planning.tar` (tarball of `.planning/`). Literal path + tarball SHA-256 + pre-op-id are written into the committed `.planning/intel/v1.3-dogfood-metrics.md` post-run.
- **D-10** Recovery procedure has two surfaces: (1) prose in this CONTEXT.md (appended post-execute with literal `mktemp` path of the actual run, captured pre-op-id, verbatim script invocation), and (2) runnable `scripts/dogfood-restore.sh` — takes `<pre-op-id> <tarball-path>` as positional arguments, runs `jj op restore <pre-op-id> --what=repo` followed by `tar xf <tarball-path> -C .` (or equivalent jj-clean ordering — planner to decide).
- **D-11** Recovery is rehearsed before the real dogfood run. Rehearsal step: `mktemp -d -t gsd-dogfood-rehearsal-XXXX` → `git clone <this-repo> $REHEARSAL_DIR` + `jj git init --colocate` → synthetic dirty state → apply `scripts/dogfood-restore.sh` against the rehearsal clone → assert `jj diff --summary` empty and file content restored. The rehearsal is a distinct entry in the Phase 14 PLAN.

**Metrics file (DOGFOOD-02):**
- **D-12** Metrics committed to `.planning/intel/v1.3-dogfood-metrics.md`. Distinguished from transient scanner output: this file is a durable planning artifact intended as the v1.4+ regression baseline. Fields per backend cell: `dispatch_ms`, `fan_in_ms`, `conflict_count` (`FanInResult.conflicted` boolean → 0/1). Also records pre-snapshot path + tarball SHA-256 + pre-op-id for durable recovery anchoring.

### Claude's Discretion

- Exact wording of the CONFIG-02 envelope `message:` field — should tell the user the two ways to unblock.
- Plan filename for the new dogfood test in `sdk/src/query/__tests__/` (D-03 mitigation) — extend an existing file vs new file. Researcher confirms which existing test-file pattern fits.
- Whether the jj-cell wrapper accepts an `N=3` override env var or hard-codes N=2.
- `scripts/dogfood-restore.sh` argument convention — positional `<pre-op-id> <tarball-path>` vs flags `--pre-op-id <id> --tarball <path>`.
- Exact ordering of `jj op restore --what=...` and `tar xf <tarball>` in the recovery script.
- Whether to also commit the recovery anchor into a separate file vs inlining into `v1.3-dogfood-metrics.md`.

### Deferred Ideas (OUT OF SCOPE)

- `/gsd-migrate-parallelization` brownfield migration command (rejected by `project_ephemeral_subagent_workspaces` memory).
- `workflow.max_concurrency` config knob for PARALLEL-06 (Phase 11 D-07 deferred to v1.4 informed by metrics).
- Adapter-layer CONFIG-02 implementation in `sdk/src/vcs/{jj,git}/parallel.ts` (UPSTREAM-02 sidecar discipline forbids importing config-aware modules).
- Phase 6-style greenfield/brownfield boundary for `parallelization` (defaults-merge already does the right thing).
- Standalone `.planning/intel/14-dogfood-recovery.md` runbook (recovery doc lives in CONTEXT.md per ROADMAP SC4 verbatim).
- Bypass surface for CONFIG-02 (env var, `--bypass-parallelization` flag) on the dogfood runner.
- In-repo only "both cells on this repo" execution model (auto-snapshot would fire during git-cell dispatch and silently violate `feedback_avoid_jj_auto_tracked_output`).
- Fixtures-only execution model (sidesteps Pitfall 10's "dogfood catches what only surfaces against real `.planning/` size + history").
- Conflict-injection variant of the dogfood (v1.4+ candidate).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONFIG-01 | Install template default for `.planning/config.json` `parallelization` flips from `false` to `true`. Existing repos with explicit `false` keep `false` (config wins over default — no migration needed since subagent workspaces are ephemeral and no on-disk dispatcher state persists). | §A confirms `get-shit-done/templates/config.json:31-38` nested-block layout vs flat boolean target; `loadConfig` defaults-merge semantics (`sdk/src/config.ts:192-218`) wins-over-default; `core.cjs:480-485` shape normalization; `feat-3167` test asserts only on `template.ship.pr_body_sections`. |
| CONFIG-02 | `parallel.dispatch` pre-flight reads `parallelization` config and refuses with a clear error if `false`. Pre-flight removes the silent-no-op footgun. | §B exact line range of validation block at `sdk/src/query/workspace-parallel-dispatch.ts:42-96`; envelope peer lines 64/67/70; `loadConfig` import precedent at `sdk/src/query/config-gates.ts:8` + `:27`; no existing per-file tests for the three envelopes — `cmd-parallel-max-concurrency-cli.test.ts` is closest precedent. |
| DOGFOOD-01 | Spin up 2-3 synthetic plans on an isolated bookmark (NOT main). Run them in parallel via the new `vcs.workspace.parallel.dispatch` + `fanIn`. Validate: clean fan-in, agent-bookmark cleanup, manifest schema correctness on both jj and git fixtures. | §C documents the exact `e2e-parallel-phase.sh` env-var contract (`GSD_E2E_BACKEND`, `GSD_SDK`), the `printf | jq -R . | jq -sc` plan-JSON builder, the dispatch/fan-in invocation pair, the `jq` envelope guards, the per-workspace `gsd-sdk query commit` cwd-pinned subshell pattern, the divergent()-empty + hook-marker assertions. |
| DOGFOOD-02 | Metrics recorded to `.planning/intel/v1.3-dogfood-metrics.md`: dispatch time, fan-in time, conflict rate, partial-wave incidence (if any). Pre-snapshot via `jj op log` + `.planning/` tarball before dogfood run; pre-snapshot recovery procedure documented. | §D documents `jj op log -n 1 --no-graph -T 'id ++ "\n"'` for head op-id extraction; `jj op restore`'s default `--what=repo remote-tracking` semantics; `06-dogfood-log.md` precedent for metrics-file format; `e2e-parallel-phase.sh` has zero timing instrumentation — wrapper must add `date +%s%3N` (millisecond epoch) around dispatch and fan-in invocations. |
</phase_requirements>

## Summary

Phase 14 is the closing phase of v1.3. Four deliverables, all locked at CONTEXT-level: a template flatten, a CLI-bridge fourth validation envelope, an in-repo + mktemp hybrid dogfood, and a pre-snapshot/recovery/metrics combo. The research surface here is wiring detail — not strategic — because all twelve D-XX architectural decisions are already settled. The planner needs file paths, line numbers, exact code excerpts to mirror in the new scripts, and the jj 0.41 CLI semantics for op-log/op-restore in the recovery primitive.

The most consequential finding for the planner: `scripts/e2e-parallel-phase.sh` carries ZERO timing instrumentation. The DOGFOOD-02 wrapper for the git cell cannot simply call into the existing harness and harvest metrics — it must wrap `date +%s%3N` around the dispatch and fan-in invocations itself, or fork enough of `e2e-parallel-phase.sh` into the new wrapper to capture per-stage wall clock. The jj cell's `dogfood-phase-14.sh` wrapper does the same for its own dispatch/fan-in. This is the single concrete delta from what CONTEXT.md says about reusing `e2e-parallel-phase.sh` "unchanged" — the wrapper takes the timing measurement around the script invocation OR adds the timing capture without modifying the script's assertion behaviour.

**Primary recommendation:** Implement in dependency order:
1. **Wave 1 (parallel-safe):** D-04 template flatten + D-03 this-repo config flip + D-03-mitigation contract tests + D-06 CONFIG-02 envelope.
2. **Wave 2 (depends on Wave 1):** `scripts/dogfood-restore.sh` (D-10).
3. **Wave 3 (depends on Wave 2):** D-11 rehearsal step against `mktemp` clone.
4. **Wave 4 (depends on Wave 3 green):** Real jj-cell dogfood via `scripts/dogfood-phase-14.sh` against `gsd/phase-14-dogfood` bookmark + git-cell dogfood via `scripts/e2e-parallel-phase.sh GSD_E2E_BACKEND=git`. Metrics captured into `.planning/intel/v1.3-dogfood-metrics.md` (D-12).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Default config flip (CONFIG-01) | Install template + this-repo config file | SDK loader (`loadConfig`) | The template is INERT at init — the loader is what gives "config wins over default" semantics; both surfaces are stateful files, not runtime logic. |
| Pre-flight refusal envelope (CONFIG-02) | CLI bridge (`sdk/src/query/`) | — | Adapter bodies are UPSTREAM-02-disciplined and forbidden from config imports (D-06). Shell-harness `jq` consumer pattern requires the `{ok:false}` envelope shape, not a thrown typed exception (D-08). |
| Dogfood orchestration (DOGFOOD-01) | Shell harness (`scripts/`) | SDK CLI bridges | Mirrors Phase 13 D-01 — the orchestrator-shell-friendly surface is `gsd-sdk query`; bash drives the bridge, jq pipelines parse the envelopes. The TS-level TEST-13 contract tests don't see this surface. |
| Pre-snapshot / recovery (DOGFOOD-02) | Shell harness (`scripts/`) | jj CLI (raw, lint-clean) | `jj op log` / `jj op restore` / `tar` are OS-level primitives — no SDK verb wraps them. Sidecar discipline doesn't apply because these aren't VCS adapter surfaces. |
| Metrics persistence | `.planning/intel/` (durable planning artifact) | — | D-12 distinguishes from transient scanner output (`feedback_avoid_jj_auto_tracked_output`); intended as the v1.4+ regression baseline, not regenerated on every run. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jj` (Jujutsu VCS) | 0.41.0 [VERIFIED: live `jj --version`] | Pre-snapshot via `op log`, recovery via `op restore`, bookmark management for `gsd/phase-14-dogfood` | This is the project's primary backend; binary is required pre-installed; raw `jj` is lint-clean (not flagged by `lint-vcs-no-raw-git.cjs`). |
| `gsd-sdk` (this repo's binary) | local (Phase 11 surface) | `gsd-sdk query workspace.parallel.{dispatch,fan-in}` + `gsd-sdk query commit` | Phase 11 D-01 locks the CLI-bridge surface for parallel-dispatch orchestration. This is the EXACT verb the dogfood exercises end-to-end (per Pitfall 10). |
| `bash` | system | The dogfood + recovery wrappers | `e2e-parallel-phase.sh` uses `#!/usr/bin/env bash` with `set -euo pipefail` (line 1+34) — new scripts must mirror this for parity. |
| `jq` | system | JSON envelope parsing in shell | `e2e-parallel-phase.sh` uses `jq -r` and `jq -c` pipelines extensively; same approach in dogfood scripts. |
| `mktemp` (GNU coreutils) | system (this Mac has GNU coreutils per user CLAUDE.md) | Sibling temp dirs (D-09) and rehearsal clone (D-11) | The `-t <prefix-XXXX>` form is portable across GNU and BSD coreutils; mirrors Phase 6's `gsd-dogfood-XXXX` convention. |
| `tar` | system | `.planning/` snapshot tarball (D-09) | Standard portable archive; `tar cf planning.tar .planning/` works on both macOS and Linux. Tarball SHA-256 anchored via `shasum -a 256` or `sha256sum`. |

**No npm dependencies need to be added.** This is purely a config flip + CLI-bridge envelope + shell wrappers + markdown metrics file.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 3.1.1 (per `sdk/package.json`) [CITED: sdk/package.json] | D-03 mitigation contract tests in `sdk/src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` | The new fixture cases extend existing vitest files; framework already in use. |
| `shasum -a 256` (macOS) / `sha256sum` (Linux) | system | Tarball SHA-256 for the durable recovery anchor (D-12) | macOS doesn't ship `sha256sum` by default; portable detection: `command -v sha256sum >/dev/null && SHA256=sha256sum || SHA256='shasum -a 256'`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jq` for JSON parsing | Native bash + sed | jq is already in `e2e-parallel-phase.sh` and the CI image — parity over novelty. |
| `mktemp -d -t gsd-dogfood-pre-XXXX` (BSD-style) | `mktemp -d --tmpdir=$TMPDIR gsd-dogfood-pre.XXXX` (GNU-style) | The BSD-style `-t <prefix-XXXX>` form is what `e2e-parallel-phase.sh:101` uses; mirrors Phase 6 `06-dogfood-log.md:6/25` convention. |
| Inline `pre-op-id` + tarball-SHA in `v1.3-dogfood-metrics.md` | Separate `v1.3-dogfood-recovery-anchor.md` | Discretion item under D-12; inlining is simpler. |

**Installation:** No new packages. The phase ships file edits + new shell scripts + one new markdown file.

## Package Legitimacy Audit

> **Not applicable.** This phase installs no external packages. The Standard Stack table lists only pre-installed system binaries (`jj`, `bash`, `jq`, `mktemp`, `tar`, `shasum`/`sha256sum`) and one workspace-internal vitest dependency that is already on disk. No npm/PyPI/crates lookups required.

## Architecture Patterns

### System Architecture Diagram

```
                                ┌──────────────────────┐
                                │ Phase 14 plan author │
                                └─────────┬────────────┘
                                          │
              ┌───────────────────────────┼──────────────────────────────────┐
              │ Wave 1: doc/config flips  │ Wave 2..4: dogfood execution     │
              │                           │                                  │
              ▼                           ▼                                  │
┌────────────────────────┐    ┌────────────────────────┐                     │
│ get-shit-done/         │    │ sdk/src/query/         │                     │
│   templates/           │    │   workspace-parallel-  │                     │
│   config.json          │    │   dispatch.ts          │                     │
│ (D-04 flatten)         │    │ (D-06: add fourth      │                     │
└────────────────────────┘    │  validation envelope)  │                     │
                              └──────┬─────────────────┘                     │
                                     │  loadConfig (D-07)                    │
                                     ▼                                       │
                              ┌────────────────────────┐                     │
                              │ sdk/src/config.ts      │                     │
                              │   loadConfig +         │                     │
                              │   CONFIG_DEFAULTS      │                     │
                              │   .parallelization=    │                     │
                              │   true (line 92)       │                     │
                              └────────────────────────┘                     │
                                                                             │
              ┌──────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────┐        ┌─────────────────────────────┐
│ Wave 3: REHEARSAL (D-11)        │        │ Wave 4: REAL DOGFOOD        │
│                                 │        │                             │
│   mktemp -d gsd-dogfood-        │        │  jj cell (in-repo):         │
│     rehearsal-XXXX              │        │   scripts/dogfood-phase-    │
│   git clone <this-repo>         │        │     14.sh                   │
│   jj git init --colocate        │        │    1. pre-snapshot via      │
│   touch tracked file            │        │       mktemp -d gsd-        │
│   jj squash                     │        │       dogfood-pre-XXXX      │
│   ──────────────────────        │        │    2. jj op log -n 200      │
│   apply dogfood-restore.sh      │        │       > $PRE/pre.oplog      │
│     <rehearsal-pre-op-id>       │        │    3. tar cf $PRE/          │
│     <rehearsal-tarball>         │        │       planning.tar          │
│   ──────────────────────        │        │       .planning/            │
│   assert jj diff --summary      │        │    4. create bookmark       │
│     empty                       │        │       gsd/phase-14-dogfood  │
└─────────────────────────────────┘        │    5. workspace.parallel.   │
                                           │       dispatch +            │
                                           │       fan-in                │
                                           │    6. capture dispatch_ms / │
                                           │       fan_in_ms /           │
                                           │       conflicted            │
                                           │    7. abandon bookmark      │
                                           │       on green              │
                                           │                             │
                                           │  git cell (mktemp):         │
                                           │   GSD_E2E_BACKEND=git       │
                                           │   scripts/e2e-parallel-     │
                                           │     phase.sh                │
                                           │   (wrapper times the        │
                                           │    invocation)              │
                                           └──────────────┬──────────────┘
                                                          │
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │ .planning/intel/            │
                                           │   v1.3-dogfood-metrics.md   │
                                           │ (D-12 durable artifact —    │
                                           │  per-cell table + recovery  │
                                           │  anchor)                    │
                                           └─────────────────────────────┘
                                                          │
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │ ON FAILURE:                 │
                                           │  scripts/dogfood-restore.sh │
                                           │   <pre-op-id> <tarball>     │
                                           │  1. jj op restore           │
                                           │     <pre-op-id>             │
                                           │  2. tar xf <tarball> -C .   │
                                           └─────────────────────────────┘
```

### Recommended Project Structure

```
scripts/
├── dogfood-phase-14.sh           # NEW — jj-cell wrapper (D-01)
├── dogfood-restore.sh            # NEW — recovery primitive (D-10)
└── e2e-parallel-phase.sh         # REUSED unchanged (D-01 git cell)

sdk/src/
├── query/
│   └── workspace-parallel-dispatch.ts   # MODIFIED — fourth envelope (D-06)
└── vcs/__tests__/
    ├── cmd-parallel-jj.test.ts          # MODIFIED — D-03 mitigation fixture
    └── cmd-parallel-git.test.ts         # MODIFIED — D-03 mitigation fixture

get-shit-done/templates/
└── config.json                          # MODIFIED — D-04 flatten

.planning/
├── config.json                          # MODIFIED — D-03 this-repo flip
└── intel/
    └── v1.3-dogfood-metrics.md          # NEW — D-12 durable metrics + anchor
```

### Pattern 1: CLI-bridge `{ok:false, reason}` failure envelope

**What:** The orchestrator-shell-friendly refusal shape. Each existing peer at `workspace-parallel-dispatch.ts:64/67/70` is one line of code, returning `{ data: { ok: false, reason: '...' } }`.

**When to use:** Whenever a CLI bridge needs to refuse the operation in a way the shell consumer can detect via `jq -r '.ok // "true"'` then test `[ "$X" = "false" ]`. This is the canonical Phase 11 D-01 shape.

**Example (existing precedent, the new D-06 envelope mirrors this):**
```typescript
// Source: sdk/src/query/workspace-parallel-dispatch.ts:63-71
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

The D-06 fourth envelope adds a `message` field (per D-08) — the existing three do NOT carry messages, so the new envelope is slightly richer:
```typescript
// PROPOSED — new at sdk/src/query/workspace-parallel-dispatch.ts (insert
// position discussed in §B below)
const config = await loadConfig(cwd);
if (config.parallelization === false) {
  return {
    data: {
      ok: false,
      reason: 'parallelization_disabled',
      message: 'Set `parallelization: true` in .planning/config.json, or remove the explicit `false` entry to fall back to the default (true).',
    },
  };
}
```

### Pattern 2: `loadConfig` invocation in CLI bridges

**What:** The async defaults-merge config reader. `QueryHandler` is already async (signature `(args, projectDir) => Promise<...>`), so no signature change needed at the bridge.

**Example (precedent from `sdk/src/query/config-gates.ts:8 + :27`):**
```typescript
// Source: sdk/src/query/config-gates.ts:8 — import
import { CONFIG_DEFAULTS, loadConfig } from '../config.js';

// Source: sdk/src/query/config-gates.ts:26-28 — call
export const checkConfigGates: QueryHandler = async (args, projectDir) => {
  const config = await loadConfig(projectDir);
  // ... use config.workflow.*, config.parallelization, etc.
};
```

For the new D-06 envelope, the import line at top of `workspace-parallel-dispatch.ts` becomes:
```typescript
import { loadConfig } from '../config.js';
```
The call goes inside the handler, AFTER the existing three validations and BEFORE the adapter `createVcsAdapter(cwd)` call — see §B insertion point.

### Pattern 3: Sibling-mktemp snapshot convention

**What:** All transient runtime artifacts created OUTSIDE the colocated jj working tree. Memory `feedback_avoid_jj_auto_tracked_output` is load-bearing here: any file inside the WC is auto-snapshotted by jj on the next invocation and bloats the WC commit.

**Example (precedent from `scripts/e2e-parallel-phase.sh:100-107`):**
```bash
# Source: scripts/e2e-parallel-phase.sh:101-105
REPO=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gsd-e2e-XXXXXX")
cleanup() {
  rm -rf "$REPO"
}
trap cleanup EXIT
```

For DOGFOOD-02 pre-snapshot (D-09), the convention is:
```bash
PRE=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-pre-XXXX")
# NOTE: do NOT trap-rm $PRE on success — D-12 needs the literal path captured
# in the metrics file as a recovery anchor. Only rm on rehearsal cleanup.
```

This is the ONE departure from the e2e-parallel pattern: the metrics file records the pre-snapshot path as a durable recovery anchor; the directory survives the run intentionally.

### Pattern 4: Subshell-cd cwd-pinning for `gsd-sdk query commit`

**What:** `gsd-sdk query commit` has NO `--cwd` flag — it resolves `projectDir` from `process.cwd()`. Phase 13 plan 13-03 discovered this; the harness runs per-workspace commits in cwd-pinned subshells with a `.planning/` marker dir.

**Example (Phase 13 precedent at `scripts/e2e-parallel-phase.sh:225-246`):**
```bash
# Source: scripts/e2e-parallel-phase.sh:232-240
mkdir -p "${WS_PATH}/.planning"
printf 'work %s\n' "$WS_AGENT" > "${WS_PATH}/work-${WS_AGENT}.txt"

COMMIT_JSON=$(
  cd "$WS_PATH" \
    && $GSD_SDK query commit "feat(13-test): e2e work ${WS_AGENT}" \
         --files "work-${WS_AGENT}.txt"
)
```

For the jj-cell dogfood (D-01), the wrapper mirrors this — but the WC `cd "$REPO_ROOT"` on entry, NOT a `mktemp` repo, because the jj cell runs against THIS repo.

### Anti-Patterns to Avoid

- **Writing pre-snapshot artifacts inside the colocated working tree.** Memory `feedback_avoid_jj_auto_tracked_output` forbids it. Any `pre.oplog` or `planning.tar` under the project's WC would be auto-snapshotted into the WC commit on the next `jj` invocation and bloat the dogfood's own commit history. The PITFALLS.md L320 suggestion of `.planning/intel/<v1.3-dogfood-pre>.oplog` is SUPERSEDED by memory `feedback_avoid_jj_auto_tracked_output` (memory post-dates PITFALLS) per CONTEXT D-09.
- **Modifying `scripts/e2e-parallel-phase.sh` to add timing.** CONTEXT D-01 says "reused unchanged" — adding timing inside the script breaks that contract and risks invalidating Phase 13's CI green. Capture timing in the wrapper instead, around the invocation.
- **Dispatching dogfood on `main`.** ROADMAP SC3 explicitly says "isolated bookmark NOT main." The wrapper must create `gsd/phase-14-dogfood` as the first step and use `--main-bookmark gsd/phase-14-dogfood` for the dispatch invocation. Falling back to `main` would mean the dogfood's per-workspace commits land on `main`, polluting actual project history.
- **Skipping the rehearsal step (D-11).** Pitfall 10 L323's "must work the first time" makes rehearsal load-bearing. Without it, untested `jj op restore` ordering or tarball-extraction edge cases surface during the real run — the precise scenario Pitfall 10 is meant to prevent.
- **A thrown `VcsParallelizationDisabledError` instead of the `{ok:false, reason}` envelope.** D-08 explicitly rejects this — typed exceptions are the adapter layer's idiom but the CONFIG-02 check lives at the CLI bridge per D-06; throwing breaks the shell-harness `jq` consumer pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON envelope parsing in shell | Custom regex/awk | `jq -r '.field // "default"'` | Phase 13 already uses jq throughout; consistency. |
| Tarball SHA-256 | Custom hash | `shasum -a 256` (macOS) or `sha256sum` (Linux); detect via `command -v` | Standard system tools; portable detection idiom. |
| Bookmark create / abandon | Custom revset hackery | `jj bookmark create gsd/phase-14-dogfood -r @-` + `jj bookmark abandon gsd/phase-14-dogfood` | Raw `jj` is lint-clean; the verbs are stable in 0.41. |
| Wall-clock timing | Custom monotonic capture | `date +%s%3N` (millisecond epoch) bracketing the dispatch invocation | Standard portable; matches v1.4 baseline expectations. |
| `mktemp` cleanup on EXIT | Custom signal trap | `trap 'rm -rf "$REHEARSAL_DIR"' EXIT` (for rehearsal — NOT for $PRE per D-09) | Standard idiom; `e2e-parallel-phase.sh:102-105` precedent. |
| Recovery from a botched dogfood | Manual `jj op restore` + `tar xf` invocations the operator types from memory | `scripts/dogfood-restore.sh <pre-op-id> <tarball-path>` (D-10) | Pitfall 10 L323 says recovery must work the first time; one-shot script + rehearsal is the standard "documented + script" pattern from Phase 12. |
| Config-shape normalization in the SDK | Re-implementing the nested→flat normalization that CJS `core.cjs:480-485` already has | The SDK `loadConfig` reads `config.parallelization` as-is (no normalization); the template flatten (D-04) means there's only one shape to read going forward. The CJS-side normalization is grandfathered for in-the-wild nested-shape repos. | Nothing in the SDK depends on the nested-shape today — `sdk/src/config.test.ts:165-175` confirms the SDK loader passes through whatever value is on disk. Adding normalization to the SDK would be unnecessary scope creep. |

**Key insight:** Phase 14 is wiring + persistence. There's almost nothing to hand-roll — every primitive (jq, jj, tar, mktemp, shasum, bash) is already in the project's CI image and dogfood-precedent vocabulary. The only NET-NEW code surfaces are: one CLI-bridge envelope (≤ 10 lines), two shell scripts (≤ 200 lines combined), one markdown file (the metrics output), and two test fixture cases. The risk is in the configuration-management surfaces (template flatten, this-repo flip, contract test fixture wiring) — not in the runtime logic.

## Runtime State Inventory

> Phase 14 is partly a config-flip + brownfield exercise, which makes this section non-optional.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 14 introduces no datastores, key-value caches, ChromaDB/Mem0/SQLite-backed state. The only data persisted across the phase is the metrics markdown file in `.planning/intel/`, the new shell scripts, and the modified config files. | None |
| Live service config | None — this repo has no external service infrastructure beyond GitHub Actions (the `.github/workflows/parallel-e2e.yml` ships via Phase 13 and Phase 14 makes no changes to it). | None |
| OS-registered state | None — no daemons, no scheduled tasks, no installed package overlays. The dogfood is a one-shot script run. | None |
| Secrets / env vars | Three env vars are READ by the new scripts: (1) `GSD_E2E_BACKEND` (existing, consumed by the unchanged `e2e-parallel-phase.sh` for the git cell); (2) `GSD_SDK` (existing, optional override of the `gsd-sdk` binary path); (3) `N` (new, optional `N=3` override for the dogfood plan count per D-02). No secrets. No env vars are WRITTEN or persisted. | Documented in the wrapper scripts' usage blocks (mirroring `e2e-parallel-phase.sh:38-56` shape). |
| Build artifacts / installed packages | This-repo `.planning/config.json` is the in-the-wild "explicit `false` is preserved" CONFIG-01 invariant fixture; D-03 flips it to `true`. The flip is permanent (no rollback intended). After the flip, this repo will dispatch parallel plans by default like any other repo would. | None during dogfood — the D-03 mitigation (contract test fixtures with explicit `false`) is what preserves the invariant as a test surface. |

**The canonical question — *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?*** — applies only to D-03 (this-repo flip). The answer is: nothing. The flip changes a boolean in one file; the SDK's `loadConfig` reads the file fresh on each `gsd-sdk query` invocation; there is no cache, daemon, or installed artifact that needs reconciliation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `jj` | dogfood-phase-14.sh, dogfood-restore.sh, rehearsal step | ✓ | 0.41.0 [VERIFIED: `jj --version`] | — (project blocks without it) |
| `bash` | all shell scripts | ✓ | system | — |
| `jq` | dogfood-phase-14.sh JSON parsing | ✓ (precedent: e2e-parallel-phase.sh) | system | — |
| `mktemp` (with `-t` flag) | sibling-temp dirs (D-09, D-11) | ✓ (GNU coreutils per user CLAUDE.md) | system | — |
| `tar` | `.planning/` tarball (D-09) | ✓ | system | — |
| `shasum -a 256` (macOS) | tarball SHA-256 (D-12) | ✓ | system | `sha256sum` on Linux — detect via `command -v` |
| `gsd-sdk` (this repo's binary) | dispatch + fan-in + commit invocations | ✓ (Phase 11 surface) | local | — |
| `git` (raw) | rehearsal step `git clone <this-repo> $REHEARSAL_DIR` (D-11) | ✓ | system | — — see §E for lint-allowlist consequence |
| Node ≥22 | `gsd-sdk` runtime | ✓ (per PROJECT.md Constraints) | system | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** macOS lacks `sha256sum`; portable detection: `if command -v sha256sum >/dev/null; then SHA256=sha256sum; else SHA256='shasum -a 256'; fi`.

## Common Pitfalls

### Pitfall 1: auto-snapshot of pre-snapshot artifacts

**What goes wrong:** If the pre-snapshot `pre.oplog` or `planning.tar` lands inside this repo's WC (e.g., at `.planning/intel/v1.3-dogfood-pre.oplog`), the next `jj` invocation snapshots them into the WC commit. The dogfood's own metrics commit then carries a 50-100 MB tarball blob, and the WC bloats irreversibly.

**Why it happens:** PITFALLS.md L320 originally suggested `.planning/intel/<v1.3-dogfood-pre>.oplog`; memory `feedback_avoid_jj_auto_tracked_output` post-dates that suggestion and supersedes it (D-09).

**How to avoid:** All transient artifacts live in `$PRE=$(mktemp -d -t gsd-dogfood-pre-XXXX)` — a sibling temp dir, NEVER under the colocated WC. The literal path is captured in the metrics file as a recovery anchor (D-12), but only the path string is persisted in the working tree; the directory itself stays sibling.

**Warning signs:** `jj status` showing `.planning/intel/pre.oplog` or any large file under `.planning/` after the dogfood run.

### Pitfall 2: `jj op restore` clobbering the working tree before tar-untar

**What goes wrong:** `jj op restore <pre-op-id>` restores repo state including the working copy. If the recovery script then runs `tar xf $TARBALL -C .` AFTERWARD, the tar extraction overwrites the (now-restored) working copy — net behavior depends on whether the tarball captured `.planning/` files that match or differ from the restored state.

**Why it happens:** `jj op restore --what=repo` (without `remote-tracking`) restores repo state including local bookmarks; it also updates `@` to point to the same commit as at the snapshot time. The working copy is updated to match `@`. If `.planning/` contents in `@` at pre-op-id time match the tarball, this is idempotent. If they differ (e.g., the dogfood wrote `.planning/intel/v1.3-dogfood-metrics.md` post-op-id), the tar restore is a no-op or undoes the post-snapshot file.

**How to avoid:** D-10 leaves the ordering to the planner's discretion, with rehearsal (D-11) as the validation gate. **Recommended ordering: `jj op restore` FIRST, then `tar xf` LAST.** Rationale: the tarball is the authoritative source for `.planning/` content; `jj op restore` puts the repo in the right shape (working copy, bookmarks, op-log); the tar restore then ensures the planning content matches the snapshot exactly. The reverse ordering risks `jj op restore` discarding tar-restored files.

**Warning signs:** Rehearsal step's final `jj diff --summary` showing any files different from the snapshot.

### Pitfall 3: `--what=repo` vs `--what=repo,remote-tracking` (jj 0.41 semantics)

**What goes wrong:** D-10 mentions `jj op restore <pre-op-id> --what=repo` but jj 0.41's default `--what` is `repo remote-tracking` (verified via `jj op restore --help`). Passing only `--what=repo` excludes remote-tracking bookmark state — if the dogfood touched remote bookmarks (it should not, because the bookmark `gsd/phase-14-dogfood` is local-only and the bookmark is abandoned on green), recovery would leave remote-tracking state pinned post-restore.

**Why it happens:** jj's `--what` is documented as EXPERIMENTAL (per `jj op restore --help`); the default of `repo remote-tracking` is conservative because non-restore of remote-tracking can break future pushes.

**How to avoid:** For Phase 14 dogfood, `--what=repo` is sufficient because the dogfood bookmark is local-only. **Recommended:** use `jj op restore <pre-op-id>` (no `--what` flag — let the default `repo remote-tracking` fire) for maximum safety. The rehearsal step (D-11) validates the ordering on a synthetic-dirty clone; if defaulted behavior preserves the rehearsal's `gsd/phase-14-dogfood`-style state correctly, ship it as-is.

**Warning signs:** Post-restore `jj bookmark list --all` showing residual `*@origin` entries that weren't present pre-snapshot.

### Pitfall 4: Plan count too small to draw a useful baseline

**What goes wrong:** N=2 is the harness baseline (Phase 13 D-02), but for metrics-as-baseline (D-12 / v1.4 regression comparison), dispatch_ms variance dominates if the per-plan setup cost is large relative to the dispatch logic. A 2-plan dispatch might measure mostly the `jq` pipeline + repo-write overhead, not the actual dispatch coordination.

**Why it happens:** GSD parallelism is process-level (subagents), not thread-level. The 2-plan case spawns 2 workspaces in serial-on-failure order (sequential `jj git worktree add`s); the dispatch_ms is dominated by FS I/O + git/jj subprocess startup, not by anything Phase 14 can measure usefully.

**How to avoid:** D-02 explicitly accepts N=3 as an env-var override. **Recommended:** ship the wrapper with `N=${N:-3}` (default 3, override to 2 via `N=2 ./scripts/dogfood-phase-14.sh` for Phase 13 baseline comparison). N=3 gives one extra data point per cell without significantly inflating dogfood runtime.

**Warning signs:** Per-cell dispatch_ms varying by >20% across two consecutive runs at the same N.

### Pitfall 5: `findProjectRoot` walking up to outer-repo `.planning/`

**What goes wrong:** `gsd-sdk query commit` runs in the dispatched workspace's cwd; `findProjectRoot` walks UP looking for a `.planning/` directory. In the jj-cell dogfood, the workspaces are under THIS repo's working tree (under the `.planning/phases/`-adjacent agent workspace paths), so walking up FROM the workspace would find the repo's outer `.planning/` and resolve `projectDir` to the wrong directory.

**Why it happens:** This is exactly what Phase 13 plan 13-03 discovered. The fix (per `e2e-parallel-phase.sh:232-233`) is to create a marker `.planning/` directory inside each workspace BEFORE the commit, so `findProjectRoot`'s rule 1 ("startDir itself has .planning/ → return it") short-circuits and returns the workspace.

**How to avoid:** The jj-cell wrapper MUST mirror the e2e-parallel-phase.sh pattern: `mkdir -p "${WS_PATH}/.planning"` before each `cd "$WS_PATH" && gsd-sdk query commit` call. Same pattern as `e2e-parallel-phase.sh:233-240`.

**Warning signs:** Per-workspace commits silently appearing in this repo's outer commit log instead of in the workspace branch.

### Pitfall 6: Lint regex match on raw-`jj git init --colocate`

**What goes wrong:** The no-raw-git lint at `scripts/lint-vcs-no-raw-git.cjs:87` uses the regex `/(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/` for shell scripts. The bare command `jj git init --colocate` MATCHES this — the ` git ` substring (inside the `jj git init` invocation) is preceded by whitespace and followed by a letter.

**Why it happens:** Phase 13 plan 13-03 discovered this (per STATE.md L137 "Rule-3 deviation"). The fix is to quote the `git` subcommand word: `jj "git" init --colocate`. The lint pattern looks for `git` followed by whitespace+letter; a `"` after `git` breaks the match.

**How to avoid:** For the rehearsal step in `scripts/dogfood-phase-14.sh`, if the script invokes `jj git init --colocate` to materialize a colocated rehearsal clone, the literal must be quoted: `jj "git" init --colocate`. The recovery script `scripts/dogfood-restore.sh` does NOT need to call this — the rehearsal calls it before recovery is invoked. Same lint-avoidance idiom as `e2e-parallel-phase.sh:142`.

**Warning signs:** `node scripts/lint-vcs-no-raw-git.cjs` failing with `shell git <cmd>` at the new scripts.

## Code Examples

### Common Operation 1: Add the fourth validation envelope (CONFIG-02 / D-06)

```typescript
// File: sdk/src/query/workspace-parallel-dispatch.ts (MODIFIED)
// Location: insert AFTER line 71 (after the `plan_required` envelope) and
//   BEFORE the existing `let plan = ...` block at line 73. Rationale: the
//   parallelization check is conceptually a peer of the other three required
//   inputs; placing it before the JSON parse means a `parallelization: false`
//   repo bails as fast as the missing-flag cases. loadConfig is async-cheap
//   because the bridge handler is already async.
//
// Source pattern: sdk/src/query/config-gates.ts:8 + :26-28 (loadConfig precedent)

// At top of file, with existing imports:
import { loadConfig } from '../config.js';

// Inside workspaceParallelDispatchQuery, after the three existing envelope
// returns (lines 64/67/70), before the `let plan` block at line 73:
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

### Common Operation 2: D-03 mitigation contract test (fixture pattern)

```typescript
// File: sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts (MODIFIED)
//   OR a new sibling file (see Open Q1)
// Pattern: Pattern B random-prefix mkdtemp (per TEST-16); routes through
//   workspaceParallelDispatchQuery directly (the CLI bridge under test).
//
// Source pattern: cmd-parallel-max-concurrency-cli.test.ts:58-93

import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CONFIG-02 — parallelization: false refuses with envelope', () => {
  it('returns {ok:false, reason:parallelization_disabled} when config has explicit false', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-cfg02-jj-'));
    await mkdir(join(tmpDir, '.planning'), { recursive: true });
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ parallelization: false }),
    );

    const { workspaceParallelDispatchQuery } = await import(
      '../../query/workspace-parallel-dispatch.js'
    );
    const plan = JSON.stringify([
      { agentId: 'a', planId: 'p' },
    ]);
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

### Common Operation 3: Pre-snapshot capture (DOGFOOD-02 / D-09)

```bash
# File: scripts/dogfood-phase-14.sh (NEW)
# Section: pre-snapshot (D-09) — sibling-mktemp, not in WC

PRE=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-pre-XXXX")
echo "dogfood-phase-14: pre-snapshot dir = ${PRE}" >&2

# Op-id head extraction — verified template against jj 0.41:
#   `jj op log -n 1 --no-graph -T 'id ++ "\n"'` returns the full 64-hex op-id
PRE_OP_ID=$(jj op log -n 1 --no-graph -T 'id ++ "\n"')
echo "dogfood-phase-14: pre-op-id = ${PRE_OP_ID}" >&2

# Capture full op-log (200 entries — plenty of history for forensics)
jj op log -n 200 > "${PRE}/pre.oplog"

# Tarball the .planning/ tree — D-09 anchor for full restore.
# tar -cf "${PRE}/planning.tar" .planning/  -- relative path inside the
#   project root; --transform not needed.
tar -cf "${PRE}/planning.tar" .planning/

# SHA-256 anchor (D-12)
if command -v sha256sum >/dev/null; then
  TARBALL_SHA=$(sha256sum "${PRE}/planning.tar" | awk '{print $1}')
else
  TARBALL_SHA=$(shasum -a 256 "${PRE}/planning.tar" | awk '{print $1}')
fi
echo "dogfood-phase-14: tarball-sha256 = ${TARBALL_SHA}" >&2
```

### Common Operation 4: Per-cell timing capture (DOGFOOD-02 / D-12)

```bash
# File: scripts/dogfood-phase-14.sh (NEW) — jj-cell wrapper
# Pattern: wrap millisecond-epoch around the dispatch + fan-in invocations.
#   date +%s%3N gives milliseconds since epoch on both GNU and macOS coreutils.

# Build the plan JSON (mirrors e2e-parallel-phase.sh:178)
PLANS_JSON=$(printf '%s\n' "phase-14-a" "phase-14-b" | jq -R . | jq -sc 'map({agentId: ., planId: .})')

# Dispatch — time it
DISPATCH_START_MS=$(date +%s%3N)
HANDLE_JSON=$(printf '%s' "$PLANS_JSON" \
  | $GSD_SDK query workspace.parallel.dispatch \
      --cwd "$REPO_ROOT" --phase 14 --main-bookmark gsd/phase-14-dogfood --plan @-)
DISPATCH_END_MS=$(date +%s%3N)
DISPATCH_MS=$((DISPATCH_END_MS - DISPATCH_START_MS))

# ... per-workspace commits (mirroring e2e-parallel-phase.sh:222-247) ...

# Fan-in — time it
HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXX.json")
printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
RESULTS_ACCUM=$(printf '%s' "$HANDLE_JSON" | jq -c '[.workspaces[] | {agentId: .agentId, exitCode: 0}]')

FANIN_START_MS=$(date +%s%3N)
FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
  | $GSD_SDK query workspace.parallel.fan-in \
      --cwd "$REPO_ROOT" --handle "@$HANDLE_FILE" --results @-)
FANIN_END_MS=$(date +%s%3N)
FAN_IN_MS=$((FANIN_END_MS - FANIN_START_MS))
rm -f "$HANDLE_FILE"

CONFLICT_COUNT=$(printf '%s' "$FAN_RESULT" | jq -r 'if .conflicted then 1 else 0 end')

echo "dogfood-phase-14: dispatch_ms=${DISPATCH_MS} fan_in_ms=${FAN_IN_MS} conflict_count=${CONFLICT_COUNT}" >&2
```

### Common Operation 5: Recovery primitive (DOGFOOD-02 / D-10)

```bash
#!/usr/bin/env bash
# File: scripts/dogfood-restore.sh (NEW)
# Purpose: Restore THIS repo to the pre-dogfood snapshot (D-10).
# Usage:  scripts/dogfood-restore.sh <pre-op-id> <tarball-path>
#
# Ordering rationale (see Pitfall 2 in research):
#   1. `jj op restore <pre-op-id>` — restores repo state including @ and
#      working-copy commit. Default --what=repo,remote-tracking is what we want.
#   2. `tar xf <tarball> -C .` — authoritative restore of .planning/.
set -euo pipefail

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

PRE_OP_ID="$1"
TARBALL_PATH="$2"

if [ ! -f "$TARBALL_PATH" ]; then
  echo "FATAL: tarball not found: ${TARBALL_PATH}" >&2
  exit 1
fi

echo "dogfood-restore: restoring op-id ${PRE_OP_ID}" >&2
jj op restore "$PRE_OP_ID"

echo "dogfood-restore: extracting ${TARBALL_PATH}" >&2
tar -xf "$TARBALL_PATH" -C .

echo "dogfood-restore: complete. Verify with: jj diff --summary && jj log -r '@-..@' --no-graph" >&2
```

### Common Operation 6: Template flatten (CONFIG-01 / D-04)

```jsonc
// File: get-shit-done/templates/config.json
// BEFORE (lines 31-38):
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },

// AFTER:
  "parallelization": true,
```

All other top-level keys (`mode`, `granularity`, `workflow`, `ship`, `planning`, `gates`, `safety`, `hooks`, `project_code`, `agent_skills`, `claude_md_path`) remain untouched. Only the nested-block at lines 31-38 collapses to the flat boolean.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nested parallelization config block (upstream-stub shape `{enabled, plan_level, task_level, skip_checkpoints, max_concurrent_agents, min_plans_for_parallel}`) | Flat boolean `parallelization: true` | v1.3 Phase 14 | The nested-block shape was inherited from upstream on 2026-01-12; `loadConfig` normalizes both shapes on read (`core.cjs:480-485`), so the template was INERT at init. Phase 14 makes the template match the SDK schema. Upstream rebase friction: predictable "take ours" conflict on a single line. |
| Silent no-op when `parallelization: false` (CLI bridge ignored config, dispatch proceeded) | `{ok:false, reason:'parallelization_disabled'}` refusal envelope | v1.3 Phase 14 | Closes the footgun where direct-SDK / shell-harness callers (bypassing the workflow gate at `execute-phase.md:133`) would dispatch despite explicit `false`. |
| Phase 6 BROWN-01 sibling-clone dogfood (one-shot mktemp clone, full migration end-to-end) | Phase 14 hybrid (jj-cell on-this-repo + git-cell on mktemp throwaway, both invoking the cross-backend `workspace.parallel.*` verbs) | v1.3 Phase 14 | Phase 6's pattern was about migration safety (cloning to avoid destructive flips); Phase 14's pattern is about dispatch fidelity (the in-repo cell catches what only surfaces against real `.planning/` size + history — Pitfall 10 framing). Different domain, same `mktemp -d -t gsd-dogfood-XXXX` sibling-temp idiom. |

**Deprecated/outdated:**
- PITFALLS.md L320's `.planning/intel/<v1.3-dogfood-pre>.oplog` location suggestion — SUPERSEDED by memory `feedback_avoid_jj_auto_tracked_output` (memory post-dates PITFALLS); see D-09.
- The "lock-effectiveness test" framing for TEST-14 — REPLACED by Phase 9 D-03's topology-assertion framing (divergent() empty post fan-in). Phase 14 dogfood inherits the topology framing.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `jj op restore` with default `--what` (`repo remote-tracking`) is safer than `--what=repo` alone. | Pitfall 3 | If the dogfood touches remote-tracking state and recovery uses `--what=repo` alone, residual remote-tracking entries persist. Rehearsal (D-11) is the validation gate — if rehearsal passes with default-`--what`, ship; if it fails, narrow to `--what=repo`. |
| A2 | `jj op log -n 1 --no-graph -T 'id ++ "\n"'` returns the full 64-hex op-id, not a short form. | §D + Common Op 3 | Verified empirically against `jj 0.41`: the template `id` (no `.short()` suffix) returns the full hex string. If `jj op restore` expects a different form, rehearsal will catch it. |
| A3 | `date +%s%3N` works on macOS coreutils (the user's machine per CLAUDE.md). | Common Op 4 | macOS BSD `date` does NOT support `%3N`. User's CLAUDE.md says GNU coreutils are installed `*without* the g prefix`, so `date +%s%3N` from GNU coreutils should be on PATH. If wrapper is run on a stock macOS without GNU coreutils, timing degrades to second resolution. Rehearsal verifies. |
| A4 | The D-03 mitigation contract tests extend the existing `cmd-parallel-{jj,git}.test.ts` rather than creating a new `workspace-parallel-dispatch.test.ts` under `sdk/src/query/__tests__/`. | Open Q1 | There is NO `sdk/src/query/__tests__/` directory today; the existing precedent for testing this exact CLI bridge is `sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` (which uses `vi.mock` to record adapter calls). The D-03 fixture is even simpler: write a config file, call the handler with a tmp `projectDir`, assert envelope. Extending `cmd-parallel-*.test.ts` is consistent. |
| A5 | The git-cell dogfood invokes `scripts/e2e-parallel-phase.sh GSD_E2E_BACKEND=git` UNCHANGED, with the wrapper capturing wall-clock timing around the invocation. | §G + Common Op 4 | If the wrapper needs per-stage (dispatch vs fan-in) timing — which D-12 demands — it cannot get that from the script alone (the script does dispatch+commits+fan-in inline and returns 0/1). The git-cell metrics will have only ONE wall-clock value (total e2e duration), NOT separate dispatch_ms + fan_in_ms. Either accept this asymmetry (jj cell gets fine-grained, git cell gets coarse) OR fork the dispatch / fan-in invocations into the wrapper to time them separately, abandoning "reused unchanged." Planner decision. |

## Open Questions

1. **D-03 mitigation test placement: extend `cmd-parallel-{jj,git}.test.ts` vs a new file under `sdk/src/query/__tests__/`?**
   - What we know: There is NO `sdk/src/query/__tests__/` directory today (verified — `ls sdk/src/query/__tests__/ → no such file or directory`). Existing CLI bridge tests live under `sdk/src/vcs/__tests__/` with `cmd-*` prefix and `vi.mock` adapter recording. The closest precedent is `sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` which tests `workspaceParallelDispatchQuery` directly via vi.mock.
   - What's unclear: Whether the D-03 fixtures belong in `cmd-parallel-jj.test.ts` (close to the contract surface they replace as the in-the-wild fixture) or in `cmd-parallel-max-concurrency-cli.test.ts` (closer to the actual CLI bridge under test).
   - Recommendation: **Add the D-03 fixture to BOTH `cmd-parallel-jj.test.ts` and `cmd-parallel-git.test.ts`** (one fixture per file, with the test using a backend-conditional projectDir setup helper from `vcs-fixture.ts`). CONTEXT D-03 explicitly says "the vitest contract tests `cmd-parallel-{jj,git}.test.ts` ... get one new fixture case each" — Planner should honor this literal placement.

2. **`dogfood-restore.sh` argument convention: positional vs flags?**
   - What we know: Discretion item under D-10. `e2e-parallel-phase.sh` uses env-var convention (`GSD_E2E_BACKEND`, `GSD_SDK`). The recovery script's two arguments are inherently positional (pre-op-id then tarball-path — no logical reordering).
   - Recommendation: **Positional** — `scripts/dogfood-restore.sh <pre-op-id> <tarball-path>`. Two arguments, both required, no flags needed. Matches Unix tradition for one-shot recovery tools (`tar`, `xz`, etc.).

3. **N=2 vs N=3 default for the dogfood plan count?**
   - What we know: D-02 allows N=3 override; Pitfall 4 documents the variance concern at low N.
   - Recommendation: **Default N=3, override via `N=2`** (env var). N=3 gives the v1.4 baseline one extra data point per cell at marginal runtime cost (~5s extra per cell).

4. **Separate recovery-anchor file vs inline into `v1.3-dogfood-metrics.md`?**
   - What we know: Discretion item under D-12. The metrics file already carries the pre-op-id + tarball SHA + path per D-09.
   - Recommendation: **Inline.** One file is simpler; the metrics file is already structured (per-cell tables) and a "Recovery Anchor" section at the bottom is a natural fit. If the metrics file gets cramped later, a `/gsd:quick` task can split it.

5. **Should the git cell use sub-stage timing or e2e timing?**
   - What we know: §G + A5 — the git cell can either invoke `e2e-parallel-phase.sh` unchanged (one wall-clock value) or fork the dispatch+fan-in invocations into the wrapper (matching jj cell granularity).
   - Recommendation: **Fork the dispatch + fan-in invocations into `scripts/dogfood-phase-14.sh` so both cells produce dispatch_ms + fan_in_ms separately.** The "reused unchanged" wording in D-01 refers to assertion behavior — `e2e-parallel-phase.sh` is shipped and won't change; the wrapper just doesn't INVOKE the whole script, it invokes the same individual SDK CLI verbs (`workspace.parallel.dispatch`, `workspace.parallel.fan-in`). Matched topology gives v1.4 baseline an apples-to-apples cross-backend comparison.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` 3.1.1 (per `sdk/package.json`) |
| Config file | `sdk/vitest.config.ts` (existing) |
| Quick run command | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts` |
| Full suite command | `cd sdk && pnpm test` (or `pnpm test:unit` per `sdk/package.json:7`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONFIG-01 | Template flatten matches SDK schema; `feat-3167` test asserts only on `template.ship.pr_body_sections` | unit | `node --test tests/feat-3167-ship-pr-body-sections.test.cjs` | ✅ (existing test must remain green post-flatten) |
| CONFIG-01 | This-repo `.planning/config.json` parallelization flipped to `true`; SDK `loadConfig` returns `true` | unit | (manual — D-03 is a one-shot file edit) | ✅ existing `sdk/src/config.test.ts` covers loadConfig path |
| CONFIG-02 | Validation envelope returned with `parallelization: false` config | unit (D-03 mitigation fixture) | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts -t "parallelization_disabled"` | ❌ Wave 0 — add fixture to `cmd-parallel-jj.test.ts` + `cmd-parallel-git.test.ts` |
| CONFIG-02 | Validation envelope NOT returned when config missing key (defaults to `true`) | unit (D-03 mitigation fixture) | (same file as above, second `it()` block) | ❌ Wave 0 |
| CONFIG-02 | Validation envelope NOT returned when `parallelization: true` is explicit | unit (D-03 mitigation fixture) | (same file as above, third `it()` block) | ❌ Wave 0 |
| DOGFOOD-01 | jj cell: 2-3 synthetic plans dispatch on `gsd/phase-14-dogfood` bookmark; clean fan-in; bookmark abandoned | integration / smoke | `bash scripts/dogfood-phase-14.sh` (manual; assertion-rich exit-0/1) | ❌ Wave 0 — script does not exist yet |
| DOGFOOD-01 | git cell: 2-3 synthetic plans dispatch on mktemp repo via `e2e-parallel-phase.sh` | integration / smoke | `GSD_E2E_BACKEND=git bash scripts/e2e-parallel-phase.sh` | ✅ shipped Phase 13 |
| DOGFOOD-02 | Pre-snapshot captured into sibling mktemp dir; tarball SHA-256 + pre-op-id recorded | integration / smoke | `bash scripts/dogfood-phase-14.sh` (assertion-rich) | ❌ Wave 0 |
| DOGFOOD-02 | Rehearsal restore works against synthetic-dirty clone | integration / smoke | (rehearsal step in `scripts/dogfood-phase-14.sh` — or a separate `scripts/dogfood-rehearse.sh`) | ❌ Wave 0 |
| DOGFOOD-02 | Metrics committed to `.planning/intel/v1.3-dogfood-metrics.md` | manual (durable artifact) | `git show HEAD -- .planning/intel/v1.3-dogfood-metrics.md` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` (D-03 mitigation fixtures green)
- **Per wave merge:** `cd sdk && pnpm test:unit` + `node --test tests/feat-3167-ship-pr-body-sections.test.cjs` (CONFIG-01 doesn't regress the only test that parses the template)
- **Phase gate:** Full suite green + rehearsal step green + jj-cell dogfood green + git-cell dogfood green + `.planning/intel/v1.3-dogfood-metrics.md` committed with all required fields.

### Wave 0 Gaps

Wave 0 = "create framework / fixtures so subsequent waves can test as they go." Phase 14's Wave 0 gaps:

- [ ] `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` — add `describe('CONFIG-02 — parallelization_disabled')` block with the D-03 mitigation fixture (see Common Operation 2 above).
- [ ] `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` — add the parallel block.
- [ ] `scripts/dogfood-phase-14.sh` — Wave 4 dogfood orchestrator (D-01 jj cell wrapper). Cannot run until D-04 template flatten + D-03 this-repo flip + D-06 envelope ship.
- [ ] `scripts/dogfood-restore.sh` — Wave 2 recovery primitive (D-10). Must ship BEFORE the rehearsal step (Wave 3).
- [ ] `.planning/intel/v1.3-dogfood-metrics.md` — Wave 4 output; gets committed AFTER the dogfood completes (per D-12).

Framework install: NONE — vitest is already installed in `sdk/`.

## Security Domain

> Required per `security_enforcement: true` in `.planning/config.json:11`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 14 introduces no authentication surface — all primitives are local-only (in-repo dogfood, mktemp temp dirs). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No multi-user surface. |
| V5 Input Validation | yes | D-06 envelope validates the `parallelization` config value (boolean coercion via `=== false` strict equality, no string-truthy ambiguity). The D-03 mitigation contract tests assert the envelope is correctly returned for the only failure shape that matters. |
| V6 Cryptography | yes (minor) | Tarball SHA-256 (D-12) — uses `shasum -a 256` / `sha256sum` system primitives. NOT for security, just for content-addressed recovery anchoring. SHA-256 is the documented choice. |
| V7 Error Handling | yes | The CONFIG-02 envelope's `message` field guides the user to two recovery paths (set `true` explicitly, or remove the key). Does not leak filesystem paths, secrets, or sensitive config beyond the `parallelization` key itself. |
| V12 Files and Resources | yes | Pre-snapshot tarball + dir (D-09) are mktemp-prefixed (`gsd-dogfood-pre-XXXX`) under `$TMPDIR` — race-resistant per POSIX `mktemp` semantics. No predictable filename pattern. |

### Known Threat Patterns for {GSD orchestrator-shell + jj-port stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection via env vars in `dogfood-phase-14.sh` | Tampering | All env vars (`GSD_E2E_BACKEND`, `GSD_SDK`, `N`) are validated via `case` blocks BEFORE use. No `eval`. No `$@` passed unquoted. |
| Path traversal via tarball untar (`tar xf` extracting `../../etc/passwd`) | Tampering | The tarball is created by THIS script's own `tar cf "${PRE}/planning.tar" .planning/` (line 6 of Common Op 3) — content-controlled by the same harness, not user input. The recovery script untar's into `.` from the project root — well-defined boundary. |
| `jj op restore` to attacker-controlled op-id | Tampering | The pre-op-id is captured by THIS script and persisted into the durable metrics file. Recovery script takes the op-id as a positional argument — if an attacker controls the op-id, they already have shell access. Out of threat scope. |
| Bookmark name injection (`gsd/phase-14-dogfood; rm -rf /`) | Tampering | Bookmark name is a constant literal in the script, not derived from user input. Same posture as `e2e-parallel-phase.sh:161` ("threat T-13-10 — agent labels are constants"). |
| Auto-snapshot leak of secrets via mktemp tarball under WC | Information Disclosure | Memory `feedback_avoid_jj_auto_tracked_output` + D-09: pre-snapshot artifacts NEVER inside the WC. Sibling-mktemp idiom is the standard mitigation. |
| Config-flip surprise (greenfield project gets parallelization on by default, may pollute history with workspace artifacts) | Repudiation | This is the INTENT of v1.3. The CONFIG-02 envelope (D-06) gives operators a clear refusal path. PROJECT.md + REQUIREMENTS.md document the new default; the CHANGELOG entry will note the flip. |
| `jj op restore` reverting unrelated post-dogfood work | Tampering | D-10's "documented + script" recovery is rehearsal-validated (D-11). The pre-op-id is captured BEFORE the dogfood — any post-dogfood commit is on top of pre-op-id. Recovery restores to pre-op-id state, discarding the dogfood. Operators must save unrelated work before invoking recovery. The metrics file's recovery-anchor section should call this out explicitly. |

## Project Constraints (from CLAUDE.md)

The repo's `CLAUDE.md` is brief; relevant directives for Phase 14:

- **GitHub access** must pass `--repo gsd-build/get-shit-done` on `gh` commands. Not relevant to Phase 14 — no `gh` invocations needed.
- **Issue tracker** at GitHub Issues — out of scope for Phase 14.
- **Domain docs** at `CONTEXT.md` + `docs/adr/` — Phase 14 produces no new ADRs.
- **Triage labels** — not relevant.

The user's global CLAUDE.md is more directly relevant:

- **GNU coreutils without `g` prefix** — `date +%s%3N`, `sha256sum`, `mktemp -d -t prefix-XXXX` all work natively. No coreutils-specific portability fixes needed for the dogfood scripts ON THIS MACHINE. CI runs on `ubuntu-latest` (per `parallel-e2e.yml`) which has GNU coreutils too.
- **For shell scripts, always use `#!/bin/zsh`** — BUT the precedent in `scripts/e2e-parallel-phase.sh` uses `#!/usr/bin/env bash`. The user's preference is a default, not absolute; CONTEXT D-01's "follow the same convention" framing means the new scripts mirror `e2e-parallel-phase.sh` → bash. **The bash precedent stands for the dogfood scripts** because they reuse `e2e-parallel-phase.sh`'s patterns verbatim (`set -euo pipefail`, jq pipelines, etc.).
- **`tup` as build system when applicable** — not applicable to Phase 14.
- **Tabs for indentation** — applies to the new shell scripts and TypeScript code (`cmd-parallel-*.test.ts` already uses tabs per `cmd-parallel-max-concurrency-cli.test.ts:39-56`).
- **No trailing comma, ever** — applies to the JSONC/JSON edits and TS code.
- **US English** — applies to `.planning/intel/v1.3-dogfood-metrics.md` prose.
- **`jj` over `git` for VCS interactions** — applies. The rehearsal step (D-11) uses `git clone` (acknowledged in §E lint allowlist analysis); that's an interactive script context, not user-driven VCS workflow.

## Research Areas — Detailed Findings

### A. CONFIG-01 implementation surface

**Confirmed: `get-shit-done/templates/config.json` lines 31-38 hold the nested-block shape.** Verified via direct read of the file:

```jsonc
// Source: get-shit-done/templates/config.json:31-38
"parallelization": {
  "enabled": true,
  "plan_level": true,
  "task_level": false,
  "skip_checkpoints": true,
  "max_concurrent_agents": 3,
  "min_plans_for_parallel": 2
},
```

The flat boolean `"parallelization": true` replaces lines 31-38 entirely.

**Surrounding fields that stay untouched:** `mode`, `granularity`, `workflow` block (lines 4-22), `ship` block (lines 23-25), `planning` block (lines 26-30), `gates` block (lines 39-48), `safety` block (lines 49-52), `hooks` block (lines 53-55), `project_code`, `agent_skills`, `claude_md_path`. The flatten changes ONLY lines 31-38; no surrounding key positions shift other than the comma after the closing brace.

**Confirmed: `core.cjs:480-485` shape normalization.** Verified via direct read:

```javascript
// Source: get-shit-done/bin/lib/core.cjs:480-485
const parallelization = (() => {
  const val = get('parallelization');
  if (typeof val === 'boolean') return val;
  if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
  return defaults.parallelization;
})();
```

This makes both the flat `true` AND the nested `{enabled: true, ...}` resolve to `true` on read in CJS. The CJS path consumes the template via `buildNewProjectConfig` at install time; once written to `.planning/config.json`, normalization runs at every `loadConfig` call.

**Critical caveat (NOT in CONTEXT.md):** The SDK `loadConfig` in `sdk/src/config.ts:140-218` does NOT perform this nested-vs-flat normalization. It is a pure shallow defaults-merge. Verified via `sdk/src/config.test.ts:162-176`:

```typescript
// Source: sdk/src/config.test.ts:162-176
it('handles wrong value types gracefully (user sets string instead of bool)', async () => {
  const userConfig = {
    commit_docs: 'yes',
    parallelization: 0,
  };
  // ...
  expect(config.parallelization).toBe(0);  // passes through as-is
});
```

If a brownfield repo with the OLD nested-shape config is read by the SDK directly (e.g., `gsd-sdk query workspace.parallel.dispatch` against such a repo), `config.parallelization` will be the object `{enabled: true, ...}`. The CONFIG-02 check at D-06 should be `config.parallelization === false` (strict equality), NOT `!config.parallelization` — a truthy object would pass either way, but strict-equal-false makes the contract clearer and matches D-08's wording. **This is implicit in D-08** (`{ok: false, reason: ...}` fires only when `parallelization` is "explicitly `false`"); the planner should ensure the check is strict-equal-`false`, not loose-falsey.

**Confirmed: only ONE test parses `get-shit-done/templates/config.json`.** Verified via `grep -rn "templates/config.json"`:

```
tests/feat-3167-ship-pr-body-sections.test.cjs:135  ← this one
.planning/ROADMAP.md:204                              (prose)
.planning/research/ARCHITECTURE.md:248,370           (prose)
.planning/phases/14-default-flip-dogfood-validation/14-CONTEXT.md:11,148,344,412,487  (prose)
```

The only programmatic consumer is `tests/feat-3167-ship-pr-body-sections.test.cjs:134-147`:

```javascript
// Source: tests/feat-3167-ship-pr-body-sections.test.cjs:135-136
const template = JSON.parse(readRepoFile('get-shit-done/templates/config.json'));
assert.deepEqual(template.ship.pr_body_sections, []);
```

The assertion is on `template.ship.pr_body_sections` (line 24-25 of the template — untouched by D-04). The flatten preserves this assertion.

**SDK schema vs CJS schema confirmation:**

```typescript
// Source: sdk/src/config.ts:71 + :92
parallelization: boolean;     // line 71
parallelization: true,        // line 92 (CONFIG_DEFAULTS)
```

```javascript
// Source: get-shit-done/bin/lib/core.cjs:311
parallelization: true,
```

Both backends agree: default is `true`, type is `boolean`. The template flatten makes the template match this schema.

### B. CONFIG-02 implementation surface

**Validation block line range confirmed:** `sdk/src/query/workspace-parallel-dispatch.ts:42-96`. The handler spans 55 lines; the validation envelopes are at lines 64, 67, 70:

```typescript
// Source: sdk/src/query/workspace-parallel-dispatch.ts:63-71
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

**Insertion point recommendation:** **AFTER line 71 (after `plan_required`), BEFORE line 73 (`let plan: readonly...`).** Rationale:
- Logical: the existing three envelopes check required INPUTS (phase, bookmark, plan); the new envelope checks REPO STATE. Place it after inputs because (a) inputs are cheap to validate, (b) `loadConfig` makes an async filesystem read, (c) failing fast on missing inputs is correct regardless of config state.
- Practical: between line 71 and the `let plan` block at line 73 is the only "safe" insertion point — adding before line 64 reorders required-input checks (less idiomatic); adding after line 85's `plan = JSON.parse(...)` block delays the check unnecessarily.

**`loadConfig` signature compatibility:** `loadConfig` returns `Promise<GSDConfig>`. The handler is already `async` (signature `QueryHandler = (args, projectDir) => Promise<{data: ...}>`). No signature change at the bridge.

**Import status:** `loadConfig` is NOT currently imported in `workspace-parallel-dispatch.ts`. The import line needs adding:

```typescript
// Source pattern: sdk/src/query/config-gates.ts:8
import { loadConfig } from '../config.js';
```

This is the only new import. `CONFIG_DEFAULTS` does NOT need importing — the strict-equal-`false` check makes the check independent of defaults.

**`loadConfig` invocation pattern (precedent at `config-gates.ts:27`):**

```typescript
// Source: sdk/src/query/config-gates.ts:26-28
export const checkConfigGates: QueryHandler = async (args, projectDir) => {
  const config = await loadConfig(projectDir);
  // ...
};
```

For `workspace-parallel-dispatch.ts`, the invocation uses `cwd` (already resolved at line 43) instead of `projectDir`, because the handler honors `--cwd` overrides:

```typescript
// PROPOSED — at insertion point above
const config = await loadConfig(cwd);
if (config.parallelization === false) {
  return {
    data: {
      ok: false,
      reason: 'parallelization_disabled',
      message: '<see D-08 prose>',
    },
  };
}
```

**Existing tests for the three envelopes:** Verified via search — there is NO existing test file that exercises the `phase_number_required` / `main_bookmark_required` / `plan_required` envelopes directly. The closest is `sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` which uses `vi.mock` and asserts the bridge's argv-to-opts plumbing (NOT the envelope-refusal paths). There is also NO `sdk/src/query/__tests__/` directory.

**Researcher recommendation for D-03 mitigation test placement:** **Extend `cmd-parallel-jj.test.ts` and `cmd-parallel-git.test.ts`** — CONTEXT D-03 says "the vitest contract tests `cmd-parallel-{jj,git}.test.ts` get one new fixture case each." The literal-honor reading is correct; the existing files already have `Pattern B random-prefix mkdtemp` fixtures and are the canonical homes for CLI-bridge-on-config-fixture tests. No new file needed.

### C. DOGFOOD-01 implementation surface

**`scripts/e2e-parallel-phase.sh` parameterization:** Read end-to-end (358 lines). Summary:

- **Env-var contract:** `GSD_E2E_BACKEND` (REQUIRED, validated via `case` block — `git` or `jj-colocated`); `GSD_SDK` (OPTIONAL, defaults to literal `gsd-sdk`); `RUNNER_TEMP` / `TMPDIR` (OPTIONAL, mktemp prefix override); `GSD_VCS` (EXPORTED by the script to pin adapter — read by `createVcsAdapter` per the comment at line 81-84). No `N` override exists in the current script.
- **Plan count:** HARDCODED at 2 plans via `AGENT_LABELS="e2e-a e2e-b"` at line 176. Adding `N=3` would require either modifying the script (forbidden per "reused unchanged") OR letting the dogfood wrapper invoke `gsd-sdk query workspace.parallel.dispatch` directly instead of going through the script.
- **Exit-code / assertion pattern:** Each assertion uses `assert_eq <name> <expected> <actual>` (lines 286-295) and exits non-zero on mismatch. The script exits 0 only on all-green. SC3 / TEST-14 parity at line 333-340 — `jj log -r 'divergent()' --no-graph --ignore-working-copy` must produce empty output. SC5 / Phase 12 A3 fix at line 343-351 — `.gsd-hook-marker` line count must equal workspace count.
- **`gsd-sdk query workspace.parallel.dispatch` invocation:**

```bash
# Source: scripts/e2e-parallel-phase.sh:178-182
PLANS_JSON=$(printf '%s\n' $AGENT_LABELS | jq -R . | jq -sc 'map({agentId: ., planId: .})')
HANDLE_JSON=$(printf '%s' "$PLANS_JSON" \
  | $GSD_SDK query workspace.parallel.dispatch \
      --cwd "$REPO" --phase 13 --main-bookmark "$MAIN_BOOKMARK" --plan @-)
```

- **`gsd-sdk query workspace.parallel.fan-in` invocation:**

```bash
# Source: scripts/e2e-parallel-phase.sh:267-272
HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXXXX.json")
printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
  | $GSD_SDK query workspace.parallel.fan-in \
      --cwd "$REPO" --handle "@$HANDLE_FILE" --results @-)
rm -f "$HANDLE_FILE"
```

The `--handle @-` / `--results @-` collision is documented at `workspace-parallel-fan-in.ts:18-21` — both inputs cannot simultaneously default to stdin; one must be in `@<path>` form.

**Runtime-synthetic plans (Phase 13 D-05 precedent):** `mkdtemp` is NOT involved in plan synthesis — plans are pure JSON literals (`{agentId: ..., planId: ...}` shape per line 178). The "runtime-mkdtemp" pattern from Phase 13 D-05 refers to the THROWAWAY REPO's mktemp creation (line 101), not the plans. For the jj-cell dogfood (which runs against THIS repo, not a mktemp repo), there is NO `mkdtemp` step — the plans are JSON literals dispatched against THIS repo's WC.

**Bookmark create/abandon for `gsd/phase-14-dogfood`:**

```bash
# PROPOSED — scripts/dogfood-phase-14.sh
# Pre-step: create the isolated bookmark
jj bookmark create gsd/phase-14-dogfood -r @-
echo "dogfood-phase-14: created bookmark gsd/phase-14-dogfood at $(jj log -r 'gsd/phase-14-dogfood' --no-graph -T 'change_id.short(8)' -n 1)" >&2

# ... pre-snapshot, dispatch, commits, fan-in, metrics capture ...

# Post-step on green: abandon the bookmark
jj bookmark forget gsd/phase-14-dogfood
echo "dogfood-phase-14: abandoned bookmark" >&2
```

`jj bookmark forget` is the right verb (it removes a bookmark locally without trying to delete on remote). `jj bookmark delete` would attempt remote deletion which is wrong for a never-pushed dogfood bookmark.

**Guards against accidentally dispatching on `main`:** Two defenses:
1. The wrapper hardcodes `--main-bookmark gsd/phase-14-dogfood` in the `gsd-sdk query workspace.parallel.dispatch` invocation. Without an explicit `--main-bookmark`, the bridge refuses with `{ok:false, reason:'main_bookmark_required'}` (existing line 67).
2. The wrapper asserts the bookmark exists pre-dispatch: `jj log -r 'gsd/phase-14-dogfood' --no-graph 2>&1 || { echo FATAL >&2; exit 1; }`.

### D. DOGFOOD-02 pre-snapshot + recovery + metrics

**`jj op log -n 200` output format:** Verified empirically — the default format is the graph form (`--graph` is on by default). The flat-list form needs `--no-graph`. For head op-id extraction (the value `dogfood-restore.sh` needs), the template form is best:

```bash
# Source: verified via `jj op log -n 1 --no-graph -T 'id ++ "\n"'`
jj op log -n 1 --no-graph -T 'id ++ "\n"'
# → 56d4e57d680e3e1b61be8f53c62f43c85c47d0f23983c00fd14e6001cca20d148961319d9ec36a0c55215168828620e08913b49db015067565da874ecd5cb9c9
```

This returns the full 64-hex op-id with a trailing newline. The shell capture `PRE_OP_ID=$(jj op log -n 1 --no-graph -T 'id ++ "\n"')` strips the trailing newline. For `pre.oplog` (full 200-entry history for forensics), use the bare `jj op log -n 200` (with the default graph) — humans read this, not scripts.

**`jj op restore --what=<set>` semantics:** Verified via `jj op restore --help`. The flag is **EXPERIMENTAL**. Possible values:
- `repo` — the jj repo state and local bookmarks
- `remote-tracking` — remote-tracking bookmarks (do NOT restore these if you want to push after the undo)

**Default `--what`:** `[default: repo remote-tracking]` — i.e., both. The CONTEXT D-10 wording "`jj op restore <pre-op-id> --what=repo`" is one specific choice; the default `--what=repo,remote-tracking` is what would fire if `--what` is omitted.

**Recommendation for `dogfood-restore.sh`:** **Omit `--what` and let the default fire.** Rationale: the dogfood does not push, and the rehearsal step (D-11) will catch any edge case where the default `remote-tracking` restoration interferes (it shouldn't — the dogfood bookmark `gsd/phase-14-dogfood` is local-only). If the rehearsal fails with the default, narrow to `--what=repo`. Document the choice + rehearsal evidence in the metrics file.

**Does `jj op restore` clobber the working tree?** Yes — by default, jj snapshots the working copy at the beginning of every command (per the `--ignore-working-copy` help text at `jj op restore --help`), THEN restores to the target operation state, THEN updates the working copy to match the restored `@`. The user's uncommitted post-snapshot changes are PRESERVED in the op-log (they exist as a snapshot operation before the restore), but the WC files revert.

**Recommended ordering:** **`jj op restore` FIRST, then `tar xf` LAST** (Pitfall 2 above). Rationale: tar gives authoritative `.planning/` content; jj op restore puts the rest of the repo (jj internals, bookmarks, op-log) in the right shape. Doing tar first would have its result clobbered by `jj op restore`'s WC update.

**Synthetic dirty state for rehearsal (D-11):** Mirror the real dogfood as closely as possible. Recommended rehearsal sequence:

```bash
# PROPOSED — rehearsal step inside scripts/dogfood-phase-14.sh
REHEARSAL=$(mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-rehearsal-XXXX")
git clone "$PWD" "$REHEARSAL"      # acknowledged raw-git — see §E
cd "$REHEARSAL"
jj "git" init --colocate            # quote "git" to dodge lint per Pitfall 6

# Capture rehearsal's own pre-snapshot
REH_PRE=$(mktemp -d "${TMPDIR:-/tmp}/gsd-rehearsal-pre-XXXX")
REH_PRE_OP_ID=$(jj op log -n 1 --no-graph -T 'id ++ "\n"')
tar -cf "${REH_PRE}/planning.tar" .planning/

# Synthetic dirty state — exercise multiple recovery scenarios
# (a) tracked file modification
echo "rehearsal-dirty" >> .planning/STATE.md
# (b) agent-bookmark leftover (simulates a botched fan-in)
jj bookmark create gsd/agent-rehearsal -r @-
# (c) squashed dirty change
jj squash -m "rehearsal: synthetic dirty"

# Apply recovery
bash "$REPO_ROOT/scripts/dogfood-restore.sh" "$REH_PRE_OP_ID" "${REH_PRE}/planning.tar"

# Assert: jj diff --summary empty (WC matches @); .planning/STATE.md unchanged
jj diff --summary
[ -z "$(jj diff --summary)" ] || { echo FAIL >&2; exit 1; }

# Also assert: synthetic bookmark removed by op-restore
jj log -r 'gsd/agent-rehearsal' --no-graph 2>&1 | grep -q "no such revision" \
  || { echo "FAIL: gsd/agent-rehearsal bookmark survived restore" >&2; exit 1; }

# Cleanup rehearsal artifacts
cd "$REPO_ROOT"
rm -rf "$REHEARSAL" "$REH_PRE"
```

**Metrics file format recommendation (D-12):** Markdown table per backend cell, with a separate "Recovery Anchor" section. Mirrors `06-dogfood-log.md`'s prose-with-tables-and-code-fences style. Skeleton:

```markdown
# v1.3 Dogfood Metrics — Phase 14

**Date:** [run date]
**Operator:** [user]
**This-repo state before dogfood:** parallelization=false (D-03 pre-flip)
**This-repo state after dogfood:** parallelization=true

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

### git cell (mktemp throwaway via `e2e-parallel-phase.sh`)

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

```bash
bash scripts/dogfood-restore.sh '<pre-op-id>' '/tmp/gsd-dogfood-pre-<XXXX>/planning.tar'
```

If the `/tmp/...` directory has been GC'd by the OS, the tarball is irrecoverable from this anchor. The pre-op-id alone (without the tarball) restores jj repo state including the WC and bookmarks; the `.planning/` content reverts to whatever the WC had at the snapshot operation. The tarball is the additive recovery surface for `.planning/` content that may have been modified post-op-id by the dogfood itself.

## Rehearsal evidence

[paste rehearsal output / `jj diff --summary` empty proof]

## Out-of-band notes

[any deviations from the planned procedure, e.g., used --what=repo instead of default]
```

**Comparison to `06-dogfood-log.md` format:** The Phase 6 log is more prose-heavy (because it documents three bug fixes empirically); the Phase 14 metrics file is more tabular (because it's a v1.4 baseline anchor). The format DIFFERS intentionally — Phase 6 is forensic, Phase 14 is metric/anchor.

### E. Lint / audit gates

**`scripts/lint-vcs-no-raw-git.cjs` does scan shell scripts.** Verified at lines 59-63 + 85-91:

```javascript
// Source: scripts/lint-vcs-no-raw-git.cjs:62-63
// WR-11: scan shell scripts too...
const SCAN_EXT = /\.(cjs|js|mjs|ts|yml|yaml|sh|bash)$/;

// Source: scripts/lint-vcs-no-raw-git.cjs:85-90
const SHELL_GIT_PATTERNS = [
  { re: /(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/, label: "shell `git <cmd>`" },
];
```

`scripts/dogfood-phase-14.sh` and `scripts/dogfood-restore.sh` are under `scripts/`, which is NOT in the allowlist globs (only `scripts/lint-vcs-no-raw-git.cjs` itself, plus three .sh scan-script files, are individually allowlisted — see `lint-vcs-no-raw-git.allow.json`).

**Will the new scripts trigger the lint?**

- `scripts/dogfood-restore.sh` — invokes only `jj op restore` and `tar xf`. NEITHER is `git`. **Clean.**
- `scripts/dogfood-phase-14.sh` — the main script invokes `jj op log`, `jj op restore`, `jj bookmark create`, `jj bookmark forget`, `jj squash`, `tar`, `gsd-sdk`, `jq`. NONE is raw `git`. **Clean** for the main path.

  **The rehearsal step (D-11) needs `git clone <this-repo> $REHEARSAL_DIR`.** This IS raw git. Two paths to resolve:

  **(a) Allowlist precedent.** Looking at `lint-vcs-no-raw-git.allow.json`, the closest entries are scan-scripts (`base64-scan.sh`, `prompt-injection-scan.sh`, `secret-scan.sh`) with reason "Scan scripts — shell-only pre-commit-style filter". The rehearsal use case doesn't fit "scan script." A dedicated entry would be needed:
  ```json
  { "path": "scripts/dogfood-phase-14.sh",
    "reason": "Dogfood rehearsal step — clones THIS repo into a sibling mktemp via `git clone` to exercise the recovery script; `gsd-sdk` has no clone verb because cloning is a bootstrap-not-VCS-operation (the cloned dir isn't a GSD project until `.planning/` is materialized).",
    "owner": "@LoganDark" }
  ```
  This would be a NEW production entry. Memory `project_no_raw_git`: "lint guard is whole-repo default-deny on `git`, not just mutating verbs; even `git status` perturbs colocated jj state." A `git clone` of a colocated repo to a fresh `mktemp` dir DOES NOT perturb the source jj state (clone is read-only on the source).

  **(b) Replace `git clone` with `jj` equivalent.** `jj git clone <source-url> <target>` exists in jj 0.41 and would be raw-jj (lint-clean). But the source is a LOCAL repo (this repo's working tree), not a remote URL — `jj git clone` of a local path is not a documented use case and would risk weird semantics.

  **Recommendation: path (a) — add ONE allowlist entry for `scripts/dogfood-phase-14.sh`** with the documented reason. This is the SECOND production entry change in v1.3 (the first was Phase 10's `sdk/src/vcs/git/parallel.ts` adapter-internal — LINT-05 framing is "+0 or +1"; Phase 14 makes it "+0 or +2"). Document in the LINT-05 follow-up entry of the metrics file.

  Alternative recommendation: path (a-prime) — use `cp -a <this-repo> $REHEARSAL_DIR` instead of `git clone`. `cp -a` preserves the `.git/` and `.jj/` directories verbatim. NOT a clone, just a filesystem copy. Avoids the lint allowlist entry entirely. **This is cleaner and is the recommended fallback if the planner wants to keep LINT-05 at "+0 or +1".**

  CONTEXT.md doesn't lock the rehearsal-clone mechanism. The planner picks between `git clone` (requires allowlist +1) and `cp -a` (no allowlist change). My recommendation: **`cp -a` for zero lint diff.**

**Raw `jj` is NOT flagged.** Verified via `scripts/lint-vcs-no-raw-git.cjs` — only `git` patterns. `jj op log`, `jj op restore`, `jj bookmark create`, `jj bookmark forget`, `jj squash`, `jj diff` are all fine.

**Allowlist precedents for prior dogfood/test scripts:** `e2e-parallel-phase.sh` is NOT in the allowlist (verified — the file is lint-clean per Phase 13 plan 13-03 with the `jj "git" init --colocate` quoting trick). The new scripts can follow the same quoting trick for any `jj git init` invocation.

### F. Validation Architecture (Nyquist) — Phase 14 dimensions

| Dimension | Evidence in Phase 14 | Coverage |
|-----------|---------------------|----------|
| 1. Functional correctness | D-03 mitigation contract tests assert the CONFIG-02 envelope fires for `parallelization: false`, does NOT fire for missing-key, does NOT fire for explicit-`true`. | Plan task: extend `cmd-parallel-{jj,git}.test.ts` with three `it()` blocks. |
| 2. Error handling | The CONFIG-02 envelope's `message` field guides users to two recovery paths. Recovery script (D-10) handles its own argument validation (positional, both required, file-existence check). | Plan task: assert `message` field is non-empty in the contract test; verify recovery script has a usage block and `[ "$#" -ne 2 ]` guard. |
| 3. Performance/non-functional | `dispatch_ms` + `fan_in_ms` captured per backend cell. v1.4 baseline anchor. | Plan task: metrics file is written; values are non-zero; format is consistent across cells. |
| 4. Robustness / failure modes | Pre-snapshot + recovery; rehearsal step exercises the recovery before production. | Plan task: rehearsal step in the dogfood orchestrator; `jj diff --summary` empty assertion post-restore. |
| 5. Security | V5 (input validation: strict-equal-`false` check), V12 (mktemp race-resistant temp dirs), STRIDE Information Disclosure (sibling-mktemp not in WC). | Covered by §Security Domain above. |
| 6. Test isolation | Rehearsal step uses sibling `mktemp -d` (D-11); contract tests use Pattern B random-prefix `mkdtemp` per TEST-16; pre-snapshot in sibling-mktemp per D-09. | Plan task: every new temp directory is created via `mktemp -d`, all rehearsal cleanup runs in `trap` blocks. |
| 7. Documentation | CONTEXT.md prose recovery procedure (D-10 surface 1); metrics file's "Recovery Anchor" section; usage blocks in the new shell scripts. | Plan task: post-execute CONTEXT.md update with literal `mktemp` path + pre-op-id + verbatim command; metrics file Recovery Anchor section. |
| 8. Coverage saturation | All 4 REQ-IDs CONFIG-01/02 + DOGFOOD-01/02 mapped to plan tasks. Phase Requirements → Test Map table above traces all four. | Plan task: planner asserts every REQ-ID has at least one acceptance criterion + one test/assertion mapping. |

### G. Optional Phase 13 carry-forwards

**Phase 13 CI lane status:** Read from STATE.md L141 — "shipped standalone `.github/workflows/parallel-e2e.yml` (D-03) — inverted-polarity matrix (git allow-fail / jj-colocated required), CI-06 audit step, and the needs:-gated parallel-e2e-gate blocking job." Per STATE.md L142 — "Phase 13 Plan 04: LINT-05 is pure bookkeeping — zero changes to lint-vcs-no-raw-git.allow.json; the +1 (24 entries, sdk/src/vcs/git/parallel.ts) landed in Phase 10."

Per STATE.md L139 — "CI-05 harness verified end-to-end green on both backends; the SC5 sentinel githooks pre-commit fired once per workspace, proving the Phase 12 A3 fix during a parallel-dispatched run."

**No known flaky tests carrying forward.** The +4 skip-count regression from Phase 10/11 was logged to deferred-items.md (per STATE.md L135) and is out of Phase 14 scope.

**`e2e-parallel-phase.sh` records no timing.** Verified via `grep -n "time\|elapsed\|ms\|metric"` — the only match is the comment at line 119 ("`each time it fires`"). The script does dispatch+commits+fan-in in a single sequence and exits 0/1. There is NO per-stage timing capture inside the script.

**Consequence for Phase 14:** The git-cell wrapper cannot harvest `dispatch_ms` and `fan_in_ms` separately by calling `e2e-parallel-phase.sh GSD_E2E_BACKEND=git`. Three paths:
1. Wrap the whole script invocation in a single `time` block and report ONE wall-clock value for the git cell (asymmetric with jj cell).
2. Fork the dispatch + fan-in invocations into `scripts/dogfood-phase-14.sh` so both cells produce dispatch_ms + fan_in_ms separately (recommended; see Open Q5).
3. Modify `scripts/e2e-parallel-phase.sh` to add timing capture (forbidden per CONTEXT D-01 "reused unchanged").

**Recommendation: Path 2** — the dogfood orchestrator runs BOTH cells (jj on this repo, git on mktemp) with the same internal dispatch+commit+fan-in dance, and harvests timing in both. `e2e-parallel-phase.sh` continues to live as the Phase 13 CI harness with its own assertion suite, untouched. The dogfood orchestrator reuses the SDK CLI verbs and bash patterns from that script, not the script itself.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/14-default-flip-dogfood-validation/14-CONTEXT.md` — twelve D-XX locked decisions
- `.planning/REQUIREMENTS.md` — REQ-ID definitions (CONFIG-01/02 + DOGFOOD-01/02)
- `.planning/STATE.md` — Phase 13 close status, lint allowlist diff history
- `.planning/ROADMAP.md` — Phase 14 SC1-SC5
- `.planning/PROJECT.md` — v1.3 milestone framing
- `.planning/intel/06-dogfood-log.md` — Phase 6 BROWN-01 dogfood format precedent
- `get-shit-done/templates/config.json` — current nested-block layout (verified)
- `sdk/src/query/workspace-parallel-dispatch.ts` — CLI bridge under modification (verified)
- `sdk/src/config.ts` + `sdk/src/config.test.ts` — `loadConfig` schema + behavior (verified)
- `sdk/src/query/config-gates.ts` — `loadConfig` invocation precedent (verified)
- `scripts/e2e-parallel-phase.sh` — git-cell harness (verified end-to-end)
- `scripts/lint-vcs-no-raw-git.cjs` + `.allow.json` — lint gate (verified)
- `tests/feat-3167-ship-pr-body-sections.test.cjs` — the only test parsing the template (verified)
- `get-shit-done/bin/lib/core.cjs:300-485` — CJS-side config schema + shape normalization (verified)
- `jj --version` / `jj op log --help` / `jj op restore --help` — jj 0.41 CLI semantics (verified empirically on the live binary)

### Secondary (MEDIUM confidence)

- jj official docs at https://docs.jj-vcs.dev/latest/operation-log/ — referenced in CONTEXT.md but not re-fetched; jj CLI help was sufficient for the recovery-script semantics question.

### Tertiary (LOW confidence)

- None. All decisions in this phase have either a CONTEXT.md lock or a direct file/CLI-help verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all primitives verified present (`jj --version`, `jq` in `e2e-parallel-phase.sh`, vitest in `sdk/package.json`); no new packages.
- Architecture: HIGH — CONTEXT.md has twelve D-XX locks; this research validates the wiring detail against the live code.
- Pitfalls: HIGH — six pitfalls all cite concrete verified evidence (file lines, CLI behavior, memory references).

**Research date:** 2026-05-23
**Valid until:** 2026-06-22 (stable — phase planning + execution should complete within 30 days; jj 0.41 CLI behavior won't change underneath us).

## RESEARCH COMPLETE

**Phase:** 14 - Default flip + dogfood validation
**Confidence:** HIGH

### Key Findings

- All twelve D-XX architectural decisions in CONTEXT.md are implementable as locked. No re-litigation needed.
- The SDK `loadConfig` does NOT perform the nested→flat shape normalization that CJS `core.cjs:480-485` does — the D-06 envelope check MUST use strict-equal-`false` (`config.parallelization === false`), not loose-falsey, to avoid mis-firing on brownfield repos with the old nested object shape.
- `scripts/e2e-parallel-phase.sh` records ZERO timing instrumentation. The dogfood orchestrator must capture `dispatch_ms` + `fan_in_ms` in its OWN wrapper invocations rather than relying on the existing script's exit code alone.
- The rehearsal step (D-11) needs to clone THIS repo to a sibling mktemp; recommended mechanism is `cp -a` (no lint allowlist diff) over `git clone` (requires +1 production allowlist entry).
- `jj op restore`'s default `--what` is `repo remote-tracking` (not just `repo` as D-10 mentions); recommended to OMIT `--what` and let the safer default fire. Rehearsal validates.

### File Created

`.planning/phases/14-default-flip-dogfood-validation/14-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All primitives verified live (`jj 0.41`, `jq`, vitest, GNU coreutils). |
| Architecture | HIGH | CONTEXT.md has twelve locked decisions; this research is wiring detail. |
| Pitfalls | HIGH | Six pitfalls cite concrete file lines, CLI help output, and project memory. |

### Open Questions

1. Test placement for D-03 mitigation (extend `cmd-parallel-{jj,git}.test.ts` literally — recommended).
2. Argument convention for `dogfood-restore.sh` (positional — recommended).
3. Default N for dogfood plan count (N=3 default with `N=2` override — recommended).
4. Separate recovery anchor file vs inline (inline — recommended).
5. Git-cell timing — fork SDK CLI invocations into wrapper for cross-cell metric symmetry (recommended).

### Ready for Planning

Research complete. Planner can now create PLAN.md files. Recommended waves: (1) doc/config flips + D-06 envelope + D-03 mitigation tests; (2) `dogfood-restore.sh`; (3) rehearsal step; (4) jj+git dogfood + metrics file commit.
