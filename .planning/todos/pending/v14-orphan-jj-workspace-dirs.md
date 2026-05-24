---
title: Reap `.claude/jj-workspaces/phase-{N}-subagent-*` FS dirs on fan-in success (or recovery)
source: phase-14 dogfood deviation #3
created: 2026-05-23
priority: medium
cross_backend: false
resolves_phase: null
target_milestone: v1.4
---

## Summary

Phase 14's dogfood surfaced a cleanup gap in the parallel-dispatch surface: filesystem-level subagent workspace directories at `.claude/jj-workspaces/phase-{N}-subagent-*` survive `jj op restore <pre-op-id>` because they live outside jj's content-addressed view of the working copy.

During the v1.3 dogfood, after `jj op restore` rolled the WC back to the pre-dogfood op-id, the orphan dirs remained on disk and required a manual `rm -rf .claude/jj-workspaces/phase-14-subagent-*` to clean up.

## Why deferred from Phase 14

Phase 14's scope was the dogfood itself + metrics capture, not parallel-dispatch cleanup hardening. The dogfood ran cleanly otherwise — main was untouched, bookmarks were reaped, divergent() was empty, fan-in had 0 conflicts. The orphan FS dirs are a cosmetic/hygiene issue, not a correctness or blast-radius failure.

The orphan was visible only because the executor used `jj op restore` to clean up its own synthetic scaffolding mid-run (the WC sat on the octopus merge node after fan-in). In a typical production flow where the operator does NOT run `jj op restore` post-fan-in, the dirs may or may not get cleaned by the dispatcher's normal teardown — Phase 14 didn't trace that path conclusively.

## Acceptance criteria for the fix plan

- [ ] Decide ownership: dispatcher fan-in cleanup OR recovery-script post-restore cleanup OR both
- [ ] If dispatcher: `vcs.workspace.parallel.fan-in` (or its successful-completion branch) `rm -rf`'s each agent's workspace dir after octopus merge + bookmark reap
- [ ] If recovery: `scripts/dogfood-restore.sh` appends `rm -rf .claude/jj-workspaces/phase-*-subagent-*` as a final step (idempotent — no-op when dirs don't exist)
- [ ] Tests cover both jj-cell (colocated) AND git-cell (mktemp) paths via `vcs-fixture.ts` Pattern B mkdtemp
- [ ] Confirm no regression on Phase 11's "no orchestrator-managed sidecar state outside VCS" memory (`project_no_orchestrator_sidecar_state`) — workspace dirs ARE ephemeral subagent state, so reaping them is consistent with the constraint, not a violation
- [ ] Document the cleanup contract in `.planning/intel/` or the parallel-dispatch surface README so v1.4+ operators don't rediscover this

## Threat model context

- Caller is internal SDK consumer (orchestrator); no user-facing argv flow.
- Disk-space impact is bounded (~3MB per agent per wave on this repo); rarely catastrophic, but accumulates over many dogfood/test cycles.
- Memory `project_ephemeral_subagent_workspaces` ("workspaces are created, worked on, merged/reaped, gone") makes this a clear contract violation — the dirs should be gone post-fan-in.

## References

- `.planning/phases/14-default-flip-dogfood-validation/14-05-SUMMARY.md` § Deviations
- `.planning/intel/v1.3-dogfood-metrics.md` (durable v1.4 regression baseline)
- Memory `project_ephemeral_subagent_workspaces`
- Memory `project_no_orchestrator_sidecar_state`
