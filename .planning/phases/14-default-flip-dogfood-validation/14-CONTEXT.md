# Phase 14: Default flip + dogfood validation - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 14 closes v1.3 with four deliverables:

1. **CONFIG-01 — Default flip mechanics.** `get-shit-done/templates/config.json`
   parallelization block flattens from the upstream-stub nested
   `{enabled:true, plan_level:true, task_level:false, skip_checkpoints:true,
   max_concurrent_agents:3, min_plans_for_parallel:2}` (lines 31-38) to the
   flat boolean `"parallelization": true` that matches the SDK schema
   (`sdk/src/config.ts:71` declares `parallelization: boolean`;
   `CONFIG_DEFAULTS.parallelization = true` already at `sdk/src/config.ts:92`
   and `get-shit-done/bin/lib/core.cjs:311`). The flip preserves the "config
   wins over default" semantic that `loadConfig` already implements via
   defaults-merge — existing repos with explicit `parallelization: false`
   keep `false` without any migration command (memory
   `project_ephemeral_subagent_workspaces`: no migration framing).

2. **CONFIG-02 — Pre-flight refusal.** `sdk/src/query/workspace-parallel-dispatch.ts`
   gains a fourth validation envelope alongside the existing
   `phase_number_required` (line 64), `main_bookmark_required` (line 67), and
   `plan_required` (line 70) — a `{ok:false, reason:'parallelization_disabled',
   message:'<clear>'}` projection that fires when the effective
   `parallelization` config value (read via `loadConfig` defaults-merge) is
   `false`. Removes the silent-no-op footgun for direct-SDK / shell-harness
   callers that bypass the workflow gate at `execute-phase.md:133`.

3. **DOGFOOD-01 — Hybrid execution model.** A new `scripts/dogfood-phase-14.sh`
   wrapper drives the new dispatcher end-to-end via two cells:
   - **jj cell (in-repo)**: creates `gsd/phase-14-dogfood` bookmark in THIS
     repo's colocated jj, dispatches 2-3 runtime-synthetic plans through
     `gsd-sdk query workspace.parallel.dispatch`, asserts clean fan-in
     (`jj log -r 'divergent()' --no-graph` empty), agent-bookmark cleanup,
     and Pitfall 10 blast-radius bounded. Pre-step: flips THIS repo's
     `.planning/config.json` parallelization from `false` to `true`.
   - **git cell (mktemp fixture)**: reuses the Phase 13
     `scripts/e2e-parallel-phase.sh` harness unchanged (already drives 2-plan
     dispatch+fanin on a throwaway mktemp git repo with the same
     `gsd-sdk query` CLI surface). Captures metrics from this cell too.
   Both cells share one metrics-capture writer.

4. **DOGFOOD-02 — Pre-snapshot + recovery + metrics.**
   `mktemp -d -t gsd-dogfood-pre-XXXX` (sibling temp dir, never inside the
   colocated working tree per memory `feedback_avoid_jj_auto_tracked_output`)
   holds `pre.oplog` (`jj op log -n 200`) + a `.planning/` tarball captured
   BEFORE the jj-cell dispatch. `scripts/dogfood-restore.sh` is the runnable
   recovery primitive; CONTEXT.md prose (this file, post-execute) embeds the
   script invocation verbatim per Phase 12's "documented + script" pattern.
   Recovery is **rehearsed** before the real run against a `mktemp -d -t
   gsd-dogfood-rehearsal-XXXX` clone (mirrors Phase 6 BROWN-01 sibling-clone
   testing). Metrics committed to `.planning/intel/v1.3-dogfood-metrics.md`:
   dispatch time, fan-in time, conflict rate (per backend cell); also the
   literal pre-snapshot path + tarball SHA-256 for the durable recovery
   anchor.

**Out of scope (explicit):**

- A `/gsd-migrate-parallelization` brownfield migration command — explicitly
  rejected by memory `project_ephemeral_subagent_workspaces` and v1.3
  REQUIREMENTS Out of Scope ("Subagent workspaces are ephemeral; nothing to
  migrate"). The default-flip is purely a defaults-level change; existing
  repos with explicit `false` keep `false` via `loadConfig`'s defaults-merge.
- A `workflow.max_concurrency` config knob for PARALLEL-06's `maxConcurrency`
  field. Phase 11 D-07 deferred workflow exposure "until dogfood data exists
  (Phase 14 DOGFOOD-02 metrics)"; Phase 14 produces the data but does NOT add
  the knob (leave to v1.4 informed by metrics, per the calibration tier and
  YAGNI posture).
- An adapter-layer CONFIG-02 implementation
  (`sdk/src/vcs/jj/parallel.ts` / `sdk/src/vcs/git/parallel.ts`) — rejected
  because the sidecars are UPSTREAM-02-disciplined and forbidden from
  importing config-aware modules; the CLI bridge is the right surface for the
  observable refusal envelope. Direct-TS callers (vitest contract tests in
  `cmd-parallel-{jj,git}.test.ts`) bypass the workflow gate and the bridge —
  acceptable because they're the project's own tests setting their own
  fixtures, not production callers.
- A Phase 6-style greenfield/brownfield boundary for `parallelization`.
  Parallelization is not sticky (it's a runtime dispatch toggle with zero
  on-disk dispatcher state per Phase 11 D-01 + memory
  `project_no_orchestrator_sidecar_state`); `loadConfig`'s defaults-merge
  already produces the required behavior. Memory `project_migration_boundary`
  stays scoped to its actual `vcs.adapter` domain.
- A standalone runbook at `.planning/intel/14-dogfood-recovery.md` — recovery
  doc lives in CONTEXT.md per ROADMAP SC4 verbatim, plus the runnable script.
- A bypass surface for CONFIG-02 (env var, `--bypass-parallelization` flag)
  on the dogfood runner — rejected because the runner doesn't need it (this
  repo's config gets flipped permanently to `true` as the dogfood pre-step,
  D-03 below), and inventing a permanent bypass for one phase's harness is
  feature creep.
- An in-repo only "both cells on this repo" execution model — rejected
  because the jj auto-snapshot would fire during git-cell dispatch and
  silently violate memory `feedback_avoid_jj_auto_tracked_output`.
- A fixtures-only execution model — rejected because it sidesteps Pitfall
  10's "dogfood catches what only surfaces against real `.planning/` size +
  history" intent; it produces false-green dogfood signal.

</domain>

<decisions>
## Implementation Decisions

### Dogfood execution model (DOGFOOD-01)

- **D-01:** Hybrid execution model. **jj cell**: `scripts/dogfood-phase-14.sh`
  wrapper creates a `gsd/phase-14-dogfood` bookmark in THIS repo's colocated
  jj (NOT main), dispatches 2-3 runtime-synthetic plans via `gsd-sdk query
  workspace.parallel.dispatch`, asserts clean fan-in + cleanup, abandons the
  bookmark on green. **git cell**: reuses `scripts/e2e-parallel-phase.sh`
  with `GSD_E2E_BACKEND=git` (Phase 13 D-01 shell-harness driving SDK CLI
  verbs against a mktemp throwaway repo, already green on CI). Synthetic
  plans are runtime-generated in-memory (per Phase 13 D-05's runtime-`mkdtemp`
  precedent — the dispatched "plan" carries only `{agentId, planId,
  workspacePath?}` and is not a GSD PLAN.md). Reading ROADMAP SC3 strictly:
  "isolated bookmark NOT main" only has meaning on THIS repo, and "both jj
  and git fixtures" plural tolerates jj being in-repo and git being a true
  fixture. Pitfall 10 risk surface is parallel-jj-on-colocated — only
  exercised honestly on the real repo.

- **D-02:** Plan count defaults to **N=2** for both cells (matches Phase 13
  harness baseline and `cmd-parallel-{jj,git}.test.ts` minimal-meaningful
  topology); the wrapper accepts an `N=3` env-var override for stretch
  measurement if N=2 dispatch-time variance is too high to draw a clean
  baseline. Researcher/planner free to standardize on N=3 if Phase 13's
  data already shows N=2 is too noisy.

### This-repo config flip (CONFIG-01 brownfield exercise)

- **D-03:** This repo's `.planning/config.json` parallelization flips
  permanently from `false` to `true` as the dogfood's pre-step (jj cell
  cannot dispatch otherwise — CONFIG-02 pre-flight will refuse).
  Trade-off accepted: this repo loses its in-the-wild "explicit `false`
  keeps `false`" CONFIG-01 invariant test fixture. **Mitigation**: the
  vitest contract tests `cmd-parallel-{jj,git}.test.ts` (Phase 9/10) get
  one new fixture case each that writes `.planning/config.json` with
  explicit `parallelization: false`, calls dispatch via the CLI bridge,
  and asserts the `{ok:false, reason:'parallelization_disabled'}`
  envelope — moves the invariant test from in-the-wild to test-fixture.
  Researcher confirms exact fixture wiring and test-file placement
  (likely `sdk/src/query/__tests__/workspace-parallel-dispatch.test.ts`
  if it exists, or extend an existing file).

### Install-template flip (CONFIG-01)

- **D-04:** `get-shit-done/templates/config.json` parallelization block
  flattens from the nested upstream-stub shape (lines 31-38: `{enabled: true,
  plan_level: true, task_level: false, skip_checkpoints: true,
  max_concurrent_agents: 3, min_plans_for_parallel: 2}`) to the flat boolean
  `"parallelization": true`. Rationale: matches the SDK schema (`sdk/src/
  config.ts:71`) and CJS parity (`get-shit-done/bin/lib/core.cjs:311`);
  the nested-block shape came from upstream on 2026-01-12 and `loadConfig`
  normalizes both shapes on read (`core.cjs:480-485`), so the template is
  INERT at init regardless of shape. Only the `feat-3167` test
  (`tests/feat-3167-ship-pr-body-sections.test.cjs:135`) parses this file
  and asserts only on `template.ship.pr_body_sections` — flattening
  preserves all asserted fields. Upstream-rebase friction is bounded: the
  flat-vs-nested conflict is a predictable one-line "take ours" resolution.

- **D-05:** No Phase-6-style greenfield/brownfield boundary for
  parallelization. `loadConfig`'s defaults-merge already implements the
  required "config-wins-over-default; missing-key = default" behavior.
  Memory `project_migration_boundary` stays scoped to its actual
  `vcs.adapter` domain. CONTEXT.md / REQUIREMENTS docs should explicitly
  note this differs from Phase 6's `vcs.adapter` sticky-config shape so
  future readers don't confuse the two patterns.

### CONFIG-02 pre-flight surface

- **D-06:** CONFIG-02's pre-flight check lives ONLY in
  `sdk/src/query/workspace-parallel-dispatch.ts:42-96`. Add a fourth
  validation envelope `{ok:false, reason:'parallelization_disabled',
  message:'<clear instruction>'}` alongside the existing three at lines
  64/67/70 (peer-shaped — reads as the natural fourth case). NOT placed
  in the adapter bodies (`sdk/src/vcs/jj/parallel.ts`,
  `sdk/src/vcs/git/parallel.ts`) — those sidecars are UPSTREAM-02-
  disciplined and forbidden from importing config-aware modules; adapter
  placement would also force sync→async signature flips on
  `performJjParallelDispatch`/`performGitParallelDispatch` and cascade
  through the `backends/{jj,git}.ts` wire-ins. Direct-TS callers (the
  Phase 9/10 vitest contract tests) bypass the bridge — they set their
  own fixtures and aren't production callers, so the CLI-bridge-only
  scope is sufficient.

- **D-07:** Missing-key semantics resolve via `loadConfig` (already
  async-compatible with the bridge's `QueryHandler` signature).
  `loadConfig`'s defaults-merge gives missing-key → `CONFIG_DEFAULTS.
  parallelization = true`. This matches ROADMAP SC1's
  "config-wins-over-default; no migration command needed; existing repos
  with explicit `false` keep `false`" — missing-key is explicitly NOT
  conflated with explicit-`false`. Mirrors the `config-gates.ts:27`
  precedent that uses `loadConfig` for an analogous workflow-gate batch
  read.

- **D-08:** Error envelope shape is `{ok: false, reason:
  'parallelization_disabled', message: '<clear instruction>'}` — peer to
  lines 64/67/70 in the same file. NOT a thrown typed
  `VcsParallelizationDisabledError` (typed exceptions are the adapter
  layer's idiom but the check lives at the CLI bridge per D-06; throwing
  here breaks the shell-harness `jq` consumer pattern). The `message`
  field must tell the user how to unblock (e.g., "Set `parallelization:
  true` in `.planning/config.json`, or remove the explicit `false` entry
  to fall back to the default."). Phase 11 D-01 cites this envelope as
  the orchestrator-shell-friendly shape.

### Pre-snapshot + recovery (DOGFOOD-02)

- **D-09:** Pre-snapshot destination is a sibling temp directory created
  via `mktemp -d -t gsd-dogfood-pre-XXXX` — NEVER inside this repo's
  working tree (memory `feedback_avoid_jj_auto_tracked_output`: any file
  inside the WC is auto-snapshotted by jj on the next invocation and
  bloats the WC commit; contradicts Phase 13 D-06/D-08's no-committed-
  artifacts stance for transient output). Path mirrors Phase 6
  BROWN-01's `mktemp -d -t gsd-dogfood-XXXX` precedent
  (`.planning/intel/06-dogfood-log.md` lines 6/25). Two artifacts inside
  the snapshot dir: `pre.oplog` (output of `jj op log -n 200`) and
  `planning.tar` (tarball of `.planning/`). Both are durable for the
  duration of the run; restoration uses them; the literal path + tarball
  SHA-256 + pre-op-id are written into the committed
  `.planning/intel/v1.3-dogfood-metrics.md` post-run so the recovery
  anchor survives even after the snapshot directory is GC'd by the OS.
  PITFALLS.md L320's specific `.planning/intel/<v1.3-dogfood-pre>.oplog`
  suggestion is superseded by memory `feedback_avoid_jj_auto_tracked_output`
  (memory post-dates PITFALLS).

- **D-10:** Recovery procedure has two surfaces:
  (1) **Prose in this CONTEXT.md** (the SC4-literal "documented in the
      dogfood phase's CONTEXT.md") — appended post-execute with the
      literal `mktemp` path of the actual run, the captured pre-op-id,
      and the verbatim script invocation. Initial CONTEXT.md (this file)
      describes the procedure in the abstract; the executing plan
      appends the run-specific values.
  (2) **Runnable `scripts/dogfood-restore.sh`** — takes `<pre-op-id>
      <tarball-path>` as positional arguments, runs `jj op restore
      <pre-op-id> --what=repo` followed by `tar xf <tarball-path> -C .`
      (or equivalent jj-clean ordering — planner to decide). Mirrors
      Phase 12's "documented + script" combo pattern. Pitfall 10's
      manual `jj op restore` UX cliff is converted to a single
      `bash scripts/dogfood-restore.sh <args>` invocation.

- **D-11:** Recovery is **rehearsed** before the real dogfood run.
  Rehearsal step: `mktemp -d -t gsd-dogfood-rehearsal-XXXX` →
  `git clone <this-repo> $REHEARSAL_DIR` + `jj git init --colocate` →
  synthetic dirty state (touch a tracked file, run `jj squash`) →
  apply `scripts/dogfood-restore.sh` against the rehearsal clone with
  the rehearsal's own pre-op-id + tarball →
  assert `jj diff --summary` empty and file content restored. The
  rehearsal is a distinct entry in the Phase 14 PLAN (not a sub-task of
  the real dogfood) so its commit history reads clearly. Pitfall 10
  L323's "must work the first time" makes rehearsal load-bearing —
  the recovery script's edge cases (e.g., `jj op restore --what=repo`
  vs `--what=repo,remote-tracking`, tarball-untar ordering vs jj's
  working-copy snapshot) only surface here.

### Metrics file (DOGFOOD-02)

- **D-12:** Metrics committed to `.planning/intel/v1.3-dogfood-metrics.md`
  (per ROADMAP SC5 wording). Distinguished from transient scanner output
  (memory `feedback_avoid_jj_auto_tracked_output`): this file is a
  durable planning artifact intended as the v1.4+ regression baseline,
  not a regenerated-on-every-run scanner sidecar. Auto-track is OK and
  expected here. Fields per backend cell: `dispatch_ms` (wall clock
  from `gsd-sdk query workspace.parallel.dispatch` invocation to Handle
  JSON returned), `fan_in_ms` (wall clock from
  `gsd-sdk query workspace.parallel.fan-in` invocation to `FanInResult`
  returned), `conflict_count` (`FanInResult.conflicted` boolean → 0/1;
  for N synthetic plans designed non-conflicting, this should be 0
  except when conflict-injection variants are run). Also records the
  pre-snapshot path + tarball SHA-256 + pre-op-id for durable recovery
  anchoring (per D-09). Researcher/planner decides exact table vs prose
  layout.

### Claude's Discretion

- Exact wording of the CONFIG-02 envelope `message:` field — should tell
  the user the two ways to unblock ("set `parallelization: true` in
  `.planning/config.json`" OR "remove the explicit `false` entry to fall
  back to the default `true`"). Planner picks wording consistent with
  surrounding `phase_number_required` / `main_bookmark_required` /
  `plan_required` messages.
- Plan filename for the new dogfood test in
  `sdk/src/query/__tests__/` (D-03 mitigation) — extend an existing file
  vs new file. Researcher confirms which existing test-file pattern fits.
- Whether the jj-cell wrapper accepts an `N=3` override env var (D-02)
  or hard-codes N=2. Planner decides based on Phase 13's CI history of
  N=2 dispatch-time noise.
- `scripts/dogfood-restore.sh` argument convention — positional
  `<pre-op-id> <tarball-path>` vs flags `--pre-op-id <id>
  --tarball <path>`. Planner picks consistent with existing
  `scripts/e2e-parallel-phase.sh` env-var convention.
- Exact ordering of `jj op restore --what=...` and `tar xf <tarball>`
  in the recovery script — researcher consults jj 0.41 docs for the
  jj-clean ordering (does `jj op restore` clobber the working tree, or
  does it preserve uncommitted changes?). Rehearsal (D-11) will verify
  whichever order the planner picks.
- Whether to also commit the `pre.oplog` + tarball SHA-256 + pre-op-id
  recovery anchor into a separate file (e.g.,
  `.planning/intel/v1.3-dogfood-recovery-anchor.md`) for the durable
  recovery anchor, vs inlining into `v1.3-dogfood-metrics.md`.
  Planner-level decision; inlining is simpler.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 14 scope anchors

- `.planning/ROADMAP.md` §"Phase 14: Default flip + dogfood validation"
  — goal, dependencies (Phase 13 must be green on both backends; Pitfall
  10 mandates dogfood is LAST), the 5 success criteria SC1-SC5.
- `.planning/REQUIREMENTS.md` §"Default config flip (CONFIG)" — CONFIG-01
  (install template flip) + CONFIG-02 (pre-flight refusal). §"Dogfood
  validation (DOGFOOD)" — DOGFOOD-01 (synthetic plans on isolated
  bookmark) + DOGFOOD-02 (metrics + pre-snapshot).
- `.planning/PROJECT.md` — v1.3 milestone framing; the "Dogfood phase
  (separate, final)" target-feature bullet; Pitfall 10 cite.
- `.planning/STATE.md` — `dogfood-is-LAST` lock (line 85), Pitfall 10
  framing (line 154), velocity context.

### Phase-internal cross-references (carry-forwards)

- `.planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md`
  D-01 (shell-harness CLI-bridge model), D-05 (runtime-mkdtemp synthetic
  plans), D-06/D-08 (stdout-only / no-committed-transient-output).
- `.planning/phases/11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-CONTEXT.md`
  D-01 (Handle JSON in shell var only; no manifest file on disk), D-07
  (PARALLEL-06 maxConcurrency workflow exposure deferred to v1.4 informed
  by Phase 14 metrics).
- `.planning/phases/12-a3-colocated-pre-commit-fix-parallel-track/12-CONTEXT.md`
  D-01/D-02 (Path 1 A3 fix — jj adapter fires `.githooks/<stage>` from
  `commit()` in colocated mode; `GSD_HOOK_SKIP_COLOCATED=1` opt-out;
  exercised by SC5).
- `.planning/intel/06-dogfood-log.md` — Phase 6 BROWN-01 sibling-clone
  dogfood precedent; `mktemp -d -t gsd-dogfood-XXXX` convention for
  sibling temp dirs.

### Default-flip target files (CONFIG-01)

- `get-shit-done/templates/config.json` (lines 31-38) — the nested-block
  parallelization shape that flattens to flat boolean `true` (D-04).
- `sdk/src/config.ts:71` (`parallelization: boolean` schema) +
  `sdk/src/config.ts:92` (`CONFIG_DEFAULTS.parallelization = true`).
- `get-shit-done/bin/lib/core.cjs:311` (`CONFIG_DEFAULTS.parallelization
  = true`); `core.cjs:480-485` (loadConfig parallelization-shape
  normalization that makes the template's nested shape INERT at init).
- `sdk/src/init-runner.ts:55-66` (`AUTO_MODE_CONFIG.parallelization =
  true`); `sdk/src/init-runner.ts:163` (writeFile of AUTO_MODE_CONFIG).
- `get-shit-done/bin/lib/config.cjs:124-246` (`buildNewProjectConfig`);
  `config.cjs:159` (hardcoded fallback uses `CONFIG_DEFAULTS.
  parallelization`); `config.cjs:262` (`cmdConfigNewProject` idempotency
  — `if exists, returns {created: false}` — codifies "existing repos
  untouched" without a Phase-6-style boundary).
- `.planning/config.json:4` — this repo's `"parallelization": false`
  that D-03 flips to `true`.

### CONFIG-02 target files

- `sdk/src/query/workspace-parallel-dispatch.ts:42-96` — the CLI bridge
  where the new validation envelope lives (D-06). Existing peer
  validations at lines 64/67/70.
- `sdk/src/config.ts` `loadConfig` (the defaults-merge function the new
  validation calls per D-07).
- `sdk/src/query/config-gates.ts:27` — the precedent that uses
  `loadConfig` for an analogous workflow-gate batch read (the pattern
  the new CONFIG-02 validation mirrors).

### Dogfood execution surface (DOGFOOD-01)

- `scripts/e2e-parallel-phase.sh` — Phase 13 plan 13-04's existing
  shell-harness driving `gsd-sdk query workspace.parallel.{dispatch,
  fan-in}`; parameterized by `GSD_E2E_BACKEND=git|jj-colocated`. Reused
  unchanged for the git cell of D-01.
- `scripts/dogfood-phase-14.sh` (NEW FILE) — Phase-14 wrapper for the
  jj cell of D-01. Creates `gsd/phase-14-dogfood` bookmark, captures
  pre-snapshot, runs dispatch+fanin sequence in-repo, captures metrics,
  abandons bookmark on green, calls `dogfood-restore.sh` on failure.
- `sdk/src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` — Phase 9/10
  contract tests (TEST-13). The D-03 mitigation extends these (or
  `workspace-parallel-dispatch.test.ts` if it exists) with a
  `parallelization: false` fixture case + envelope assertion.
- `sdk/src/vcs/__tests__/vcs-fixture.ts` — `setupGitRepo`/`setupJjRepo`
  helpers (already allowlisted via `sdk/src/vcs/__tests__/**` glob).

### Pre-snapshot + recovery surface (DOGFOOD-02)

- `scripts/dogfood-restore.sh` (NEW FILE) — runnable recovery script
  per D-10. Takes pre-op-id + tarball path; runs `jj op restore` +
  tarball restore.
- `.planning/intel/v1.3-dogfood-metrics.md` (NEW FILE) — committed
  metrics + recovery anchor (D-12, D-09).

### jj 0.41 reference

- jj official docs: https://docs.jj-vcs.dev/latest/operation-log/ and
  https://docs.jj-vcs.dev/latest/working-copy/ — `jj op log` /
  `jj op restore` semantics, working-copy auto-snapshot behavior.
- `jj op restore --what=repo` vs `--what=repo,remote-tracking` — planner
  consults docs to pick the right `--what=` set for D-10's
  `dogfood-restore.sh` (Claude's Discretion notes this).

### Test conventions

- `.planning/REQUIREMENTS.md` TEST-16 — Pattern B random-prefix
  `mkdtemp`; no `retry: N`; no `describe.skip`; no skip-count
  regressions. All new test surfaces follow these.
- `tests/feat-3167-ship-pr-body-sections.test.cjs:135` — the only test
  that JSON-parses `get-shit-done/templates/config.json`; asserts only
  on `template.ship.pr_body_sections` (the D-04 flatten preserves this
  assertion).

### Lint / audit (carry-forward gates)

- `scripts/lint-vcs-no-raw-git.cjs` + `.../lint-vcs-no-raw-git.allow.json`
  (24 entries: 23 production + Phase 10 `git/parallel.ts`). The new
  `scripts/dogfood-phase-14.sh` + `dogfood-restore.sh` must NOT
  introduce raw `git ` shell invocations (use `gsd-sdk query` for repo
  ops). Raw `jj` is NOT flagged (`jj op log`, `jj op restore`,
  `jj bookmark create`/`abandon` are all fine in the scripts).
- `scripts/lint-vcs-no-commit-id.cjs` — v1.2 surface; the new scripts
  use change_id surfaces only (`jj op log` op-ids are operation-IDs,
  not commit-IDs; safe).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `scripts/e2e-parallel-phase.sh` — Phase 13's existing 2-plan
  dispatch+fanin harness, parameterized by `GSD_E2E_BACKEND`. Used
  verbatim for the git cell of D-01. Drives `gsd-sdk query
  workspace.parallel.{dispatch,fan-in}` against a freshly-created
  throwaway repo; exits 0/1 on assertion pass/fail.
- `sdk/src/query/workspace-parallel-dispatch.ts` lines 64/67/70 — the
  three existing `{ok: false, reason: '...'}` validation envelopes that
  the new `parallelization_disabled` case (D-06) joins as the fourth
  peer.
- `sdk/src/config.ts` `loadConfig` + `CONFIG_DEFAULTS` — the
  defaults-merge that gives missing-key → default-`true` (D-07).
- `sdk/src/query/config-gates.ts:27` — the precedent caller that uses
  `loadConfig` for an analogous workflow-gate batch read.
- `sdk/src/vcs/__tests__/vcs-fixture.ts` `setupGitRepo` / `setupJjRepo`
  — Pattern B mkdtemp helpers for the D-03 mitigation test fixtures.
  Already allowlisted; raw `git`/`jj` calls inside are lint-clean.
- `.planning/intel/06-dogfood-log.md` — the v1.0 Phase 6 BROWN-01 dogfood
  log. Provides the sibling-`mktemp` precedent for D-09 + the dogfood
  evidence-record format precedent for `v1.3-dogfood-metrics.md`.

### Established Patterns

- **CLI-bridge `{ok: false, reason}` failure envelope** (Phase 11 D-01,
  `workspace-parallel-dispatch.ts:64/67/70`) — the orchestrator-shell-
  friendly shape that D-08 follows.
- **Pattern B random-prefix `mkdtemp` fixture isolation** (TEST-16,
  Pitfall 9) — every `cmd-parallel-*` test uses this; the git cell
  fixture follows it; the rehearsal clone follows it
  (`gsd-dogfood-rehearsal-XXXX`).
- **Sibling-`mktemp` snapshot convention** (Phase 6 BROWN-01,
  `intel/06-dogfood-log.md` line 6/25) — `mktemp -d -t gsd-dogfood-XXXX`
  pattern. D-09's `gsd-dogfood-pre-XXXX` mirrors this.
- **stdout-only / no-committed-transient-output** (Phase 13 D-06/D-08,
  `audit-id-namespace.cjs`, `migr-06-close-gate.cjs`) — transient output
  never enters the working tree. D-09's snapshot dir is sibling-mktemp;
  the committed `v1.3-dogfood-metrics.md` is a DURABLE planning artifact,
  NOT transient scanner output, so the pattern doesn't ban it (D-12 spells
  out the distinction).
- **"documented + script" recovery combo** (Phase 12 A3 fix — adapter
  fires hook AND `.githooks/<stage>` is documented in 12-CONTEXT.md) —
  D-10's CONTEXT.md prose + `dogfood-restore.sh` follows this combo.
- **Test fixture as in-the-wild-invariant replacement** (REQUIREMENTS-12
  contract tests for cross-backend FanInResult shape) — when in-the-wild
  invariant test fixtures get retired (here: this repo's
  `parallelization: false` being flipped), a contract test takes over
  (D-03 mitigation).

### Integration Points

- `sdk/src/query/workspace-parallel-dispatch.ts` (modified) — new
  validation envelope at the existing validation block (lines 42-96),
  uses `loadConfig` per D-07.
- `get-shit-done/templates/config.json` (modified) — parallelization
  block flattened per D-04.
- `.planning/config.json` (modified) — this repo's `parallelization:
  false` flipped to `true` per D-03.
- `scripts/dogfood-phase-14.sh` (NEW FILE) — jj-cell wrapper per D-01.
- `scripts/dogfood-restore.sh` (NEW FILE) — recovery primitive per D-10.
- `sdk/src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` (or new
  `sdk/src/query/__tests__/workspace-parallel-dispatch.test.ts`) —
  D-03 mitigation fixture + envelope assertion.
- `.planning/intel/v1.3-dogfood-metrics.md` (NEW FILE) — committed
  metrics + recovery anchor per D-12.

</code_context>

<specifics>
## Specific Ideas

- **User constraint (memory `feedback_avoid_jj_auto_tracked_output`):**
  *"audit/scanner/close-gate scripts must be stdout-only; never write
  output files into the colocated-jj working tree."* Drove D-09's sibling-
  mktemp choice for the pre-snapshot artifacts. The principle does NOT
  extend to durable planning artifacts (D-12's `v1.3-dogfood-metrics.md`
  is fine in `.planning/intel/` — it's intended baseline, not transient
  output).
- **User constraint (memory `project_ephemeral_subagent_workspaces`):**
  *"parallelization default-flip needs no migration/pre-flight/warn;
  workspaces are created, worked on, merged/reaped, gone."* Codified in
  the Out of Scope list (no `/gsd-migrate-parallelization` command).
- **User constraint (Pitfall 10, ROADMAP):** *"dogfood catches what only
  surfaces against real `.planning/` size + history."* Drove D-01's
  hybrid-with-in-repo-jj-cell over fixtures-only.
- **User constraint (Pitfall 10 L323):** *"loud-fail rollback to pre-
  snapshot...recovery must actually work the first time."* Drove D-11's
  rehearsal requirement.
- **User constraint (UPSTREAM-02 sidecar discipline):** parallel.ts
  sidecars are forbidden from importing config-aware modules. Drove
  D-06's CLI-bridge-only placement of CONFIG-02.

</specifics>

<deferred>
## Deferred Ideas

- **`workflow.max_concurrency` config knob for PARALLEL-06.** Phase 11
  D-07 deferred workflow exposure "until dogfood data exists (Phase 14
  DOGFOOD-02 metrics)"; Phase 14 PRODUCES the data but does NOT add the
  knob — defer to v1.4 once metrics inform whether the natural agent-cap
  rules (Claude Code orchestrator's sequential `run_in_background: true`
  pattern + `.git/config.lock` race mitigation) are sufficient or if an
  explicit cap is needed.
- **Conflict-injection variant of the dogfood.** SC3 asserts clean
  fan-in (`divergent()` empty); the Phase 9/10 contract tests already
  cover the conflict path (`cmd-parallel-{jj,git}.test.ts` N=2/3/4 +
  one-in-tree-conflict + one-crashed-worker scenarios). Phase 14's
  dogfood is the happy-path baseline; a conflict-injection dogfood
  would establish a conflict-recovery baseline but isn't scoped here.
  v1.4+ candidate.
- **`/gsd-migrate-parallelization` command.** Explicitly rejected by
  memory `project_ephemeral_subagent_workspaces` and v1.3 REQUIREMENTS
  Out of Scope. No future revisit unless the ephemeral-workspace
  invariant changes.
- **Promoting `audit-workflow-raw-git.cjs` to permanent CI pretest
  lint** — already deferred in Phase 13 D-07; not Phase 14 scope.
- **Workflow call-presence lint (`vcs.parallel.*` must be called in
  dispatch sections)** — already in v1.3 REQUIREMENTS Out of Scope;
  deferred to v1.4.
- **Adapter-layer CONFIG-02 implementation.** If the project ever gains
  production direct-TS callers of `vcs.workspace.parallel.dispatch`
  outside contract tests, revisit D-06's CLI-bridge-only placement.
  Not foreseen for v1.4.
- **Recording the dogfood pre-snapshot anchor in a dedicated file**
  (e.g., `.planning/intel/v1.3-dogfood-recovery-anchor.md`) separate
  from the metrics file. Claude's Discretion item under D-12; if
  inlining into the metrics file becomes cramped, split later.

</deferred>

---

## Post-execute recovery procedure (run-specific)

Filled in by Plan 14-05 (Task 3) on 2026-05-23 after the dogfood ran.

**Pre-op-id:** `9db977b62aca89aa25e2412da874770db37812d6be273b2b95917ba29654c246f90f1f9f100e264f24aa7e81534861d653769a29c473531ad8a766dde73371ea`
**Pre-snapshot dir:** `/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-dogfood-pre-PGZH`
**Tarball:** `/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-dogfood-pre-PGZH/planning.tar`
**Tarball SHA-256:** `873522cf59a7d635ea65dc5db299ece3d5e785a95930d9dd2734d53ef0a624f4`

**Recovery invocation (run from project root):**

```bash
bash scripts/dogfood-restore.sh '9db977b62aca89aa25e2412da874770db37812d6be273b2b95917ba29654c246f90f1f9f100e264f24aa7e81534861d653769a29c473531ad8a766dde73371ea' '/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-dogfood-pre-PGZH/planning.tar'
```

The recovery script restores jj repo state via `jj op restore <pre-op-id>` (default `--what=repo,remote-tracking`) FIRST, then extracts the planning tarball via `tar -xf <tarball> -C .` LAST (Pitfall 2 ordering — restore first so the WC update doesn't clobber the authoritative .planning/ tarball content).

If the `/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-dogfood-pre-PGZH` directory has been GC'd by the OS (typical TMPDIR cleanup interval), the tarball is irrecoverable from this anchor. The pre-op-id alone (without the tarball) restores jj repo state including the WC and bookmarks; the `.planning/` content reverts to whatever the WC had at the snapshot operation.

Operators must save unrelated post-dogfood work before invoking recovery — `jj op restore` reverts to the pre-op-id snapshot, discarding everything that happened after.

Rehearsal evidence (Plan 14-04) confirmed the recovery script works correctly against a `cp -a` clone of this repo before the real dogfood ran. See `.planning/intel/v1.3-dogfood-metrics.md` § "Rehearsal evidence" for the PASS lines.

The same recovery anchor (pre-op-id + path + SHA-256) appears verbatim in `.planning/intel/v1.3-dogfood-metrics.md` § Recovery Anchor — two surfaces of D-10 must agree byte-for-byte on these values.

---

*Phase: 14-default-flip-dogfood-validation*
*Context gathered: 2026-05-23*
