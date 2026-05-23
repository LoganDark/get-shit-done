# Phase 14: Default flip + dogfood validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 14-default-flip-dogfood-validation
**Areas discussed:** Dogfood execution model, Pre-snapshot + recovery, Default-flip scope + this-repo config, CONFIG-02 pre-flight surface
**Mode:** advisor (USER-PROFILE.md present; vendor_philosophy=pragmatic → standard calibration tier; non-technical-owner=false)
**Researcher agents spawned:** 4 in parallel (one per area)

---

## Dogfood execution model

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: in-repo jj on `gsd/phase-14-dogfood` + mktemp git fixture | Phase-14 wrapper around `scripts/e2e-parallel-phase.sh`; jj cell dispatches on THIS repo's isolated bookmark, git cell runs in mktemp throwaway. Runtime-synthetic plans. Strictest read of ROADMAP SC3 + Pitfall 10. | ✓ |
| Fixtures-only: two mktemp throwaway repos | Both backends in mktemp fixtures. Reuses Phase 13 harness unchanged + metrics wrapper. Zero blast-radius but SC4 pre-snapshot becomes ceremonial; high risk of false-green dogfood. | |
| In-repo only (both cells on this repo) | Jj and git cells both on this repo (git via colocated `.git/`). Tightest "this very repo" read but high cross-backend interference; jj auto-snapshot fires during git-side dispatch. | |

**User's choice:** Hybrid: in-repo jj + mktemp git fixture
**Notes:** No clarifications. The hybrid model is locked because ROADMAP SC3's "isolated bookmark NOT main" only has meaning on this repo, and "both jj and git fixtures" plural tolerates jj being in-repo and git being a true fixture. Pitfall 10's "dogfood catches what only surfaces against real `.planning/` size + history" was the deciding factor over fixtures-only.

---

## Default-flip scope + this-repo config

Sub-decision 1 (what concretely flips) and sub-decision 3 (greenfield/brownfield boundary) had unambiguous research-recommended winners that did not require user input:

- **Sub-decision 1:** Flatten `get-shit-done/templates/config.json` parallelization block to flat boolean `true` (1a). Template is INERT at init; `feat-3167` test asserts only on `ship.pr_body_sections` so unaffected; predictable upstream-merge "take ours" conflict.
- **Sub-decision 3:** No Phase-6-style boundary (3b). Parallelization has no stickiness; `loadConfig` defaults-merge implements "config-wins-over-default" already. Document the divergence from Phase 6's `vcs.adapter` sticky-config shape so future readers don't conflate.

The user-facing question was sub-decision 2 (this repo's `.planning/config.json`):

| Option | Description | Selected |
|--------|-------------|----------|
| 2a: Flip permanently to `true` | Commit `.planning/config.json` parallelization: false → true as dogfood pre-step. Simplest. Loses in-the-wild "explicit false keeps false" test fixture. | ✓ |
| 2d: Flip temporarily, restore after | Flip true for the run, restore to false after metrics. Preserves brownfield-invariant test case. Two extra commits per phase. | |
| 2c: Keep false, add runner bypass | Leave config at false; Phase-14 wrapper bypasses CONFIG-02 via env var or flag. Preserves invariant test; invents permanent bypass surface for one phase's use. | |

**User's choice:** 2a: Flip permanently to true
**Notes:** Mitigation captured in CONTEXT.md D-03: the lost in-the-wild "explicit false keeps false" invariant gets replaced by a fixture-level test case in `cmd-parallel-{jj,git}.test.ts` (or `workspace-parallel-dispatch.test.ts`) that writes `parallelization: false` in fixture config and asserts the `{ok:false, reason:'parallelization_disabled'}` envelope. Memory `project_ephemeral_subagent_workspaces` ("no migration framing, no theater") favors 2a over 2c's bypass-surface invention.

---

## CONFIG-02 pre-flight surface

Sub-decisions 2 (error envelope shape) and 3 (missing-key behavior) had unambiguous research-recommended winners following from sub-decision 1's placement:

- **Sub-decision 2:** Envelope `{ok: false, reason: 'parallelization_disabled', message: '<clear>'}` — fourth peer to lines 64/67/70 in the same file. Matches Phase 11 D-01 orchestrator-shell-friendly idiom.
- **Sub-decision 3:** Read via `loadConfig` (already async-compatible with `QueryHandler`). `loadConfig`'s defaults-merge gives missing-key → `CONFIG_DEFAULTS.parallelization = true`. Matches ROADMAP SC1 "config-wins-over-default; missing-key = default".

The user-facing question was sub-decision 1 (placement):

| Option | Description | Selected |
|--------|-------------|----------|
| (b) CLI bridge only | Add fourth `{ok:false}` envelope in `sdk/src/query/workspace-parallel-dispatch.ts`. Uses `loadConfig` for missing-key = default-true. No adapter signature change. | ✓ |
| (a) Both adapter bodies (sidecars) | Place check in `sdk/src/vcs/jj/parallel.ts` + `sdk/src/vcs/git/parallel.ts`. Defends every caller. Breaches UPSTREAM-02 sidecar discipline; sync→async cascade; 4+ contract test fixtures need updating. | |
| (d) Hybrid: adapter throws, bridge projects to envelope | Adapter throws typed `VcsParallelizationDisabledError`; CLI bridge catches and converts to `{ok:false}` envelope. Only valuable if (a) wins placement. | |

**User's choice:** (b) CLI bridge only
**Notes:** UPSTREAM-02 sidecar discipline (parallel.ts sidecars forbidden from importing config-aware modules) was the decisive constraint against (a). Direct-TS callers (Phase 9/10 contract tests) are the project's own tests, not production callers — the CLI bridge IS the observable surface for the dogfood runner (hybrid model uses `gsd-sdk query workspace.parallel.dispatch` from shell harness).

---

## Pre-snapshot + recovery

Sub-decision 1 (destination) was functionally locked by memory `feedback_avoid_jj_auto_tracked_output` and presented as a fait accompli: **sibling `mktemp -d -t gsd-dogfood-pre-XXXX`** (outside repo). The two alternative options contradicted memory (`.planning/intel/snapshots/` is auto-tracked into WC; "no pre.oplog at all" contradicts SC4 wording). Mitigate the ephemeral-path concern by recording literal path + tarball SHA-256 into the committed metrics file.

The user-facing question bundled sub-decisions 2 (format) and 3 (rehearsal):

| Option | Description | Selected |
|--------|-------------|----------|
| Prose in CONTEXT.md + `scripts/dogfood-restore.sh` + rehearsal | CONTEXT.md prose embeds the script invocation verbatim; runnable script lives at `scripts/dogfood-restore.sh`. Rehearsal step in the dogfood plan: mktemp clone, synthetic dirty state, apply restore, assert clean. Pitfall 10 "must work the first time" fully addressed. | ✓ |
| Prose + script, no rehearsal | Same prose + script, skip rehearsal. Less ceremony; script's edge cases (op-restore --what= variants, tarball-untar errors) won't surface until real incident. | |
| Prose in CONTEXT.md only | No script, no rehearsal. Matches SC4 wording verbatim. Operator transcribes op-id under pressure. Maximum minimalism, maximum transcription-error risk. | |

**User's choice:** Prose in CONTEXT.md + `scripts/dogfood-restore.sh` + rehearsal
**Notes:** Pitfall 10 L323's "loud-fail rollback to pre-dogfood snapshot, fix in a non-dogfood phase, re-run" depends on rollback being a no-thinking-required operation when the operator is mid-incident. Rehearsal cost is bounded (~5 min); rehearsal is scoped as a separate plan entry (not a sub-task of the real dogfood) so commit history reads clearly.

---

## Claude's Discretion

- Exact wording of the CONFIG-02 envelope `message:` field — should tell the user the two ways to unblock ("set parallelization: true" OR "remove explicit false to fall back to default").
- Plan filename for the new D-03 mitigation test (extend `cmd-parallel-{jj,git}.test.ts` vs new `workspace-parallel-dispatch.test.ts`).
- N=2 vs N=3 default for the synthetic-plan count; planner decides based on Phase 13's CI history of N=2 dispatch-time noise.
- `scripts/dogfood-restore.sh` argument convention — positional vs flags; planner picks consistent with existing `scripts/e2e-parallel-phase.sh` env-var convention.
- Exact ordering of `jj op restore --what=...` vs `tar xf <tarball>` in the recovery script — researcher consults jj 0.41 docs; rehearsal verifies.
- Inlining vs splitting the recovery anchor (literal `mktemp` path, tarball SHA-256, pre-op-id) into `v1.3-dogfood-metrics.md` vs a separate `v1.3-dogfood-recovery-anchor.md`.

## Deferred Ideas

- **`workflow.max_concurrency` config knob for PARALLEL-06** — Phase 11 D-07's deferral was conditional on Phase 14 producing metrics; Phase 14 produces metrics but does NOT add the knob (YAGNI; revisit in v1.4 once metrics inform whether natural agent-cap rules suffice).
- **Conflict-injection dogfood variant** — Phase 9/10 contract tests already cover the conflict path; Phase 14's dogfood is the happy-path baseline. v1.4+ candidate.
- **`/gsd-migrate-parallelization` brownfield migration command** — explicitly rejected per memory `project_ephemeral_subagent_workspaces`.
- **Adapter-layer CONFIG-02 implementation** — revisit only if project gains production direct-TS callers outside contract tests (not foreseen for v1.4).
- **Standalone `.planning/intel/14-dogfood-recovery.md` runbook** — recovery doc lives in CONTEXT.md per ROADMAP SC4 verbatim, not a separate file.
- **`workflow.max_concurrency` exposure** is the same item as bullet 1 above — listed there for visibility.

## Locked carry-forwards from prior phases (not re-asked)

- SDK defaults at `sdk/src/config.ts:92` + `core.cjs:311` already have `parallelization: true` — the install-template flip is the only "default flip" left for CONFIG-01.
- Phase 11 D-01: Handle JSON in shell var only; no manifest file on disk; orchestrator-shell `ok:false,reason` failure envelope.
- Phase 11 D-07: `workflow.max_concurrency` deferred until Phase 14 metrics exist (this phase).
- Phase 12 D-01/D-02: Path 1 A3 fix (jj adapter fires `.githooks/<stage>` from `commit()` in colocated mode); `GSD_HOOK_SKIP_COLOCATED=1` opt-out.
- Phase 13 D-06/D-08: stdout-only audit, evidence in close commit (no committed transient artifacts).
- Memory `feedback_avoid_jj_auto_tracked_output`: never write transient output into the colocated working tree.
- Memory `project_ephemeral_subagent_workspaces`: default-flip needs no migration command, no preflight warn-and-document.
- Memory `project_migration_boundary`: scoped to `vcs.adapter` — does NOT apply to parallelization (no stickiness).
- Pitfall 10 (PROJECT.md): dogfood is LAST so any blast catches the prior phases' rough edges, not vice versa.
- Test conventions: Pattern B random-prefix `mkdtemp`, no `retry: N`, no `describe.skip`, no skip-count regressions.
