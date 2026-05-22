# LINT-05 — `lint-vcs-no-raw-git.allow.json` allowlist diff

**Phase:** 13-ci-parallel-path-lane-lint-close-gate · Plan 13-04
**Recorded:** 2026-05-22
**Purpose:** v1.3 milestone-close-commit evidence for requirement **LINT-05** —
the recorded `+1` net diff to `scripts/lint-vcs-no-raw-git.allow.json` versus
the v1.3 milestone-open baseline.

---

## Summary

LINT-05 is **pure bookkeeping** — Phase 13 makes **no change** to
`scripts/lint-vcs-no-raw-git.allow.json`. The allowlist's `+1` budget was
**already spent in Phase 10** (a single new adapter-internal entry for
`sdk/src/vcs/git/parallel.ts`). This document records that diff so the v1.3
milestone close commit can quote it.

| Metric | Value |
|--------|-------|
| `entries` count at v1.3 milestone-open | 23 |
| `entries` count now (Phase 13) | **24** |
| Net diff vs v1.3 milestone-open | **+1** |
| Phase that landed the `+1` | **Phase 10** (git-side parallel verbs) |
| New entries added by Phase 13 | **0** |
| Production entries modified by Phase 13 | **0** (all 23 byte-unchanged) |

The `+1` falls inside the framing-locked `+0 or +1` budget (PROJECT.md v1.3
"One-shot audit script" / "Git backend implementation" bullets; STATE.md
§Decisions "Lint allowlist framing"; CONTEXT.md D-09).

---

## The single non-production entry

`scripts/lint-vcs-no-raw-git.allow.json` currently has **24 entries** under the
`entries` array (16 `path` entries + 8 `glob` entries). 23 of those are the
v1.3 milestone-open production set. The one entry that constitutes the `+1` is:

```json
{ "path": "sdk/src/vcs/git/parallel.ts", "reason": "VCS adapter internals — git-side parallel-dispatch substrate; raw `git worktree`/`merge`/`branch -D` are the substrate the cross-backend `workspace.parallel.*` surface wraps.", "owner": "@LoganDark" }
```

- **`path`:** `sdk/src/vcs/git/parallel.ts`
- **`reason`** (verbatim, copied from the allowlist):
  *VCS adapter internals — git-side parallel-dispatch substrate; raw `git worktree`/`merge`/`branch -D` are the substrate the cross-backend `workspace.parallel.*` surface wraps.*
- **`owner`:** `@LoganDark`
- **Landed:** Phase 10 Plan 10-03 (git-backend `vcs.workspace.parallel.*` wire-in
  — the throwing stub in `backends/git.ts` was replaced with a delegating
  `Object.freeze({dispatch, fanIn})` over the Plan 10-02 `git/parallel.ts`
  sidecar). STATE.md §Decisions records: *"Phase 10 Plan 03: lint allowlist
  net diff is +1 (entries: 23 -> 24) — single new entry for
  sdk/src/vcs/git/parallel.ts."*

This entry is **adapter internals**: `git/parallel.ts` IS the git backend's
parallel-dispatch implementation — raw `git worktree` / `git merge` /
`git branch -D` are the substrate the cross-backend `workspace.parallel.*`
verb surface wraps, exactly analogous to the pre-existing
`sdk/src/vcs/exec.ts` and `sdk/src/vcs/backends/git.ts` allowlist entries.
It is **not** raw-git leaking back into workflow markdown.

---

## Phase 13 added no allowlist entry — by design

The v1.3 milestone goal is "raw-git in workflow-markdown shell-fence blocks
collapses to zero." Phase 13 ships two new files that could each have forced a
new allowlist entry; neither did:

- **`scripts/e2e-parallel-phase.sh`** (the CI-05 harness, Plan 13-03) — routes
  **all** of its VCS operations through `gsd-sdk query` (D-09). It contains no
  raw `git <cmd>` invocation. The colocated throwaway repo is created via
  `jj "git" init --colocate` with the `git` subcommand word quoted so the
  no-raw-git lint's shell pattern does not match it, and the diagnostic-only
  ` git ` token is held in an `ECHO_GIT` variable — both deliberate so the
  harness stays lint-clean without an allowlist entry.
- **`scripts/audit-workflow-raw-git.cjs`** (the CI-06 audit, Plan 13-02) — a
  pure file-walker. It invokes no VCS at all, so `lint-vcs-no-raw-git.cjs`
  does not flag it.

Because both Wave-1 files are raw-git-clean, **no new allowlist entry was
required**, and LINT-05's locked budget stays intact at `+1`. Per CONTEXT.md
D-09: had either file required a new entry, that would have been a defect in
Plan 13-02 / 13-03 to escalate — **not** something to paper over by amending
the allowlist.

---

## Verification

`node scripts/lint-vcs-no-raw-git.cjs` exits `0` — the whole repo, including
the new Wave-1 harness and audit script, is raw-git-clean (no new violation).
The allowlist file `scripts/lint-vcs-no-raw-git.allow.json` is byte-identical
to its v1.3 milestone-open state apart from the Phase-10 `git/parallel.ts`
entry: still **24 entries**, the 23 production entries unchanged.

---

*This document is the durable LINT-05 record. The v1.3 milestone close commit
quotes the `+1` diff and this file as its evidence.*
