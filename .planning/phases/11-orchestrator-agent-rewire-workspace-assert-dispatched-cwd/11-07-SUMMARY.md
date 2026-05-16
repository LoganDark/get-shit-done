---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 07
subsystem: sdk
tags: [sdk, query, jj, workspace, assert-dispatched-cwd, gap-closure, cr-01, cr-04, wr-03, backend-opaque]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-02
    provides: workspace.assert-dispatched-cwd SDK verb (the broken consumer fixed here)
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-04
    provides: gsd-executor.md collapse + dispatch-cwd-safety.md (the doc/agent files this plan edits)
provides:
  - workspace.assert-dispatched-cwd that genuinely works on jj (not just git)
  - Regression test pinning the post-fix contract on BOTH backends
  - Operator-triageable FATAL diagnostic in gsd-executor.md
  - dispatch-cwd-safety.md no longer admits backend asymmetry as a known wart
  - VCS-20 / PROMPT-08 ready to flip BLOCKED → SATISFIED on verifier re-run
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backend-opaque CONSUMER surface even when backend-internal resolution differs: the verb body branches on vcs.kind to bridge WorkspaceInfo.path asymmetry (jj=name, git=fs path), but the output envelope shape is identical across backends"
    - "Per-entry name→path resolver via vcsExec(repoCwd, 'jj', ['--repository', repoCwd, '--no-pager', '--color', 'never', '--quiet', 'workspace', 'root', '--name', name]) — defensive (returns null on non-zero exit, mirrors safeRealpath shape)"
    - "Pattern A regression test (describe.sequential.skipIf(!available)) covers all three jj scenarios (primary / non-primary / no-match) plus one git parity scenario — TEST-13 / TEST-16 conformance"
    - "FATAL-branch diagnostic dump: full verb payload + $PWD + cross-backend REPO_ROOT probe (git rev-parse --show-toplevel || jj workspace root) so operators can triage CR-01-class failures from the field"

key-files:
  created:
    - sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
  modified:
    - sdk/src/query/workspace-assert-dispatched-cwd.ts
    - agents/gsd-executor.md
    - get-shit-done/references/dispatch-cwd-safety.md

key-decisions:
  - "OQ-1 chosen: Option A (narrow on vcs.kind inside the verb body) over Option B (extend WorkspaceInfo with workspacePath field). Option A has dramatically smaller blast radius — Option B would require auditing 30+ WorkspaceInfo.path call sites across jj-workspace.test.ts / jj-octopus.test.ts / jj-reap.test.ts that intentionally use .path as the workspace-name slot. The milestone framing ('workflows never branch on vcs.kind for parallel-dispatch reasons') scopes to WORKFLOWS, not internal SDK verbs — the consumer surface stays backend-opaque under Option A. Existing precedent in jj backend (workspace.reap at jj.ts:1117-1135 already resolves workspace-name to fs path inline) confirms the pattern is acceptable for internal verb bodies."
  - "Name→path resolver shells out to `jj workspace root --name <NAME>` directly from the verb file rather than adding a helper to sdk/src/vcs/jj/. Single consumer; adding an exported helper for one caller would have added abstraction without payoff. If a second consumer of name→path emerges, refactor at that point."
  - "Returns null on non-zero exit from `jj workspace root` (defensive) — mirrors the existing safeRealpath shape. Same caller semantics: failing entries are skipped from the comparison rather than throwing."
  - "On jj after the fix, workspaceName and workspacePath now carry semantically distinct values (name vs fs path); on git they remain equal because git's WorkspaceInfo.path is already an fs path that doubles as both. The cross-backend ENVELOPE shape is identical (both fields populated with name-like-id + fs-path values respectively); the cross-backend FIELD VALUES converge on what each name means."
  - "Diagnostic dump in gsd-executor.md uses `git rev-parse --show-toplevel || jj workspace root` chain so the probe works on both backends without branching. Falls back to '<unresolvable>' literal so the stderr stays well-formed even when neither tool resolves."

requirements-completed: [VCS-20, PROMPT-08]

# Metrics
duration: 20min
completed: 2026-05-16
---

# Phase 11 Plan 07: workspace.assert-dispatched-cwd jj-correctness gap closure Summary

**Closed VERIFICATION.md CR-01 BLOCKER (the verb halted every jj agent because `safeRealpath(WorkspaceInfo.path)` compared an fs realpath against a workspace NAME on jj), CR-04 WARNING (FATAL branch had no diagnostic dump), and WR-03 INFO (dispatch-cwd-safety.md documented backend asymmetry as a known wart). Backend-opaque cross-backend contract restored. VCS-20 and PROMPT-08 ready to flip BLOCKED → SATISFIED.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 (1 + 2 + 3)
- **Files created:** 1 (regression test)
- **Files modified:** 3 (verb body, agent prompt, reference doc)

## Accomplishments

- **Task 1 (CR-01 BLOCKER closure):** `sdk/src/query/workspace-assert-dispatched-cwd.ts` now resolves jj workspace names to fs paths via `jj workspace root --name <NAME>` before realpath compare. The git branch keeps its direct `safeRealpath(entry.path)` compare unchanged. On jj, every agent commit no longer halts with FATAL.
- **Task 2 (CR-01 closure proof):** `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` pins the three jj scenarios (primary / non-primary / no-match) plus a git parity scenario. The non-primary scenario would have failed unconditionally against the pre-fix verb body — it is the load-bearing regression-catcher.
- **Task 3 (CR-04 + WR-03):** `agents/gsd-executor.md` FATAL branch now dumps the full `$DISPATCH_CHECK` payload + `$PWD` + cross-backend REPO_ROOT probe to stderr so a jj-side assert failure surfaces enough state for field triage. `get-shit-done/references/dispatch-cwd-safety.md` removes the "on jj this is the workspace name — documented backend asymmetry" admission; the new bullet documents the genuinely symmetric post-fix contract.

## OQ-1 Resolution

The plan's open question was Option A (narrow on `vcs.kind` inside the verb body) vs Option B (extend `WorkspaceInfo` with a `workspacePath?: string` field).

**Chose Option A.** Rationale captured in `key-decisions` above. The single-file change keeps the asymmetry contained to the one verb that observed it; the consumer surface (verb output envelope) stays backend-opaque; the existing `workspace.reap` precedent in `sdk/src/vcs/backends/jj.ts:1117-1135` confirms in-verb name→path resolution is the established pattern.

## File:line Changes (Task 1)

`sdk/src/query/workspace-assert-dispatched-cwd.ts`:
- Docstring (lines 1-22) updated to describe the in-body `vcs.kind` branch and the resolution shell-out.
- New import: `vcsExec` from `../vcs/exec.js` and `WorkspaceInfo` type from `../vcs/types.js`.
- New helper `resolveJjWorkspacePath(repoCwd, name)` at lines 46-67 — shells out to `jj workspace root --name <NAME>` with the standard `--repository --no-pager --color never --quiet` flag prefix; returns `null` on non-zero exit.
- Comparison loop (the `for (let i = 0; i < entries.length; i++) { ... }` body) updated to compute `fsPath` per backend: `vcs.kind === 'jj' ? resolveJjWorkspacePath(cwd, entry.path) : entry.path`. The `safeRealpath(entries[i].path)` direct call (line 57 of the legacy file) is replaced.
- Return shape: `workspacePath` on the matched branch now emits the resolved fs path (`matchedPath`); pre-fix it emitted `matched.path` which on jj was the workspace name. `workspaceName` stays `matched.path` (the name on jj, the fs path on git).

## CR-01 / CR-04 / WR-03 Closure Evidence

```
$ grep -n "safeRealpath(entries\[i\]\.path)" sdk/src/query/workspace-assert-dispatched-cwd.ts
(no matches — the broken comparison line is gone)

$ grep -nE "vcs\.kind === 'jj'|workspacePath" sdk/src/query/workspace-assert-dispatched-cwd.ts
(matches the new branch and the workspacePath field)

$ cd sdk && pnpm tsc --noEmit
(exit 0 — no errors)

$ cd sdk && pnpm vitest run src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
Test Files  1 passed (1)
Tests       4 passed (4) — 3 jj scenarios + 1 git parity

$ cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts
Test Files  1 passed (1)
Tests       8 passed (8) — no git-side regression from the Task 1 refactor

$ grep -c "isPrimary: true" sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
1

$ grep -c "isPrimary: false" sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
2

$ grep -c "workspaceName: null" sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
0
```

Note on `workspaceName: null` grep: the test asserts the value via `expect(d.workspaceName).toBeNull()` rather than the literal source-text `workspaceName: null` because the test uses `toBeNull()` matchers on parsed data. Effective semantics match the plan's intent (the no-match scenario does assert `workspaceName === null`). Documented as a Rule-4 minor — the plan's grep target was a heuristic for "the test covers this branch"; the heuristic missed because of the matcher-style choice, but the BEHAVIOR is asserted. If verifier wants strict literal match, swap `.toBeNull()` → `.toBe(null)` in scenario 3 — same semantics.

CR-04 closure:
```
$ grep -c "DISPATCH_CHECK payload:" agents/gsd-executor.md
1
$ grep -c "REPO_ROOT" agents/gsd-executor.md
2
$ grep -cE "git rev-parse --show-toplevel|jj workspace root" agents/gsd-executor.md
1
$ grep -c "exit 1" agents/gsd-executor.md
1  (preserved — additive dump, no decrease)
$ node tests/bug-3097-3099-executor-worktree-path-safety.test.cjs
✓ tests 7 / pass 7 / fail 0
```

WR-03 closure:
```
$ grep -cE "documented backend asymmetry|on jj this is the workspace name" get-shit-done/references/dispatch-cwd-safety.md
0
$ grep -c "workspacePath" get-shit-done/references/dispatch-cwd-safety.md
3
```

## Task Commits

1. **Task 1: fix(11-07) verb body** — id `oskmsmnruvpn` (fix; preserves git behavior; resolves jj name→path).
2. **Task 2: test(11-07) regression test** — id `uwnkorkropkx` (test; 4 scenarios; describe.sequential.skipIf Pattern A).
3. **Task 3: docs(11-07) FATAL diagnostic + asymmetry-admission removal** — id `wtynozonnlnk` (docs; CR-04 + WR-03 joint touch).

## VCS-20 + PROMPT-08 Status

Both move from BLOCKED → ready-for-SATISFIED on verifier re-run:

- **VCS-20** ("workspace.assert-dispatched-cwd SDK verb backend-opaque"): the backend-opaque clause of Phase 11 SC-1 now holds on jj. The verb's CONSUMER surface produces identical JSON envelope shape on both backends; the body's internal vcs.kind branch is an implementation detail (the milestone framing scopes vcs.kind avoidance to WORKFLOWS, not internal SDK verbs).
- **PROMPT-08** ("Collapse gsd-executor.md:412-555 four blocks to one verb call"): the collapsed call now functions correctly on jj — the agent no longer halts unconditionally. The verifier's PARTIAL classification (structural-collapse-landed-but-non-functional-on-jj) flips to fully VERIFIED.

## Decisions Made

- **OQ-1: Option A over Option B** — smaller blast radius; consumer surface stays opaque; matches existing in-backend precedent. Captured above.
- **Resolver inlined in verb file** rather than added to `sdk/src/vcs/jj/` — single consumer; refactor when a second emerges.
- **`null` on resolver failure** rather than throwing — defensive, mirrors `safeRealpath` shape.
- **Cross-backend REPO_ROOT probe via `||` chain** — works on both backends without `vcs.kind` branching in the diagnostic; falls back to `<unresolvable>` literal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - heuristic grep target] Source-assertable grep `workspaceName: null` ≥ 1**
- **Found during:** Task 2 self-check.
- **Issue:** The plan's acceptance criterion `grep -c "workspaceName: null" sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts ≥ 1` is a heuristic for "the test asserts the no-match branch's `workspaceName === null`". I wrote the assertion using vitest's `.toBeNull()` matcher (idiomatic) rather than the literal source text `workspaceName: null`. Effective semantics match — the test DOES verify `data.workspaceName === null` on scenario 3 — but the literal grep returns 0.
- **Fix considered:** Swap `expect(d.workspaceName).toBeNull()` → `expect(d.workspaceName).toBe(null)` to make the literal grep happy. Did NOT apply — both matchers have identical semantics; the literal-string assertion would be marginally less idiomatic. Documented in self-check evidence above so the verifier can choose to flag or accept.
- **Files modified:** none — annotation only.
- **Verification:** the no-match branch IS covered by scenario 3 (`expect(d.workspaceName).toBeNull()` + `expect(d.workspacePath).toBeNull()`); the regression-catch behavior is intact.

**Total deviations:** 1 (heuristic-grep calibration only; behavioral coverage intact).

## Issues Encountered

None blocking. The verb fix landed cleanly; tests passed on first run; tsc had zero errors at every checkpoint.

## User Setup Required

None — pure SDK + agent prompt + reference doc edits. The `jj workspace root --name` subcommand is available on jj 0.41 (probed at the start of Task 1).

## Next Phase Readiness

- VCS-20 and PROMPT-08 are ready to flip BLOCKED → SATISFIED at verifier re-run.
- Phase 11 SC-1a ("returns ok/fail backend-opaquely") should flip FAILED → VERIFIED.
- Phase 11 SC-1b (the agent-side collapse) should flip PARTIAL → VERIFIED.
- The remaining open VERIFICATION items from 11-VERIFICATION.md (SC-2b quick.md dispatch shape — CR-02, CR-03; WR-01 manifest write; WR-02 ok-derivation) are addressed by Plans 11-08 and 11-09 respectively. This plan's deliverables are independent of those.

## Self-Check

- `sdk/src/query/workspace-assert-dispatched-cwd.ts` — FOUND (modified)
- `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` — FOUND (created)
- `agents/gsd-executor.md` — FOUND (modified, DISPATCH_CHECK payload diagnostic added)
- `get-shit-done/references/dispatch-cwd-safety.md` — FOUND (modified, asymmetry admission removed)
- Commit `oskmsmnruvpn…` (Task 1) — FOUND in `gsd-sdk query log` output
- Commit `uwnkorkropkx…` (Task 2) — FOUND in `gsd-sdk query log` output
- Commit `wtynozonnlnk…` (Task 3) — FOUND in `gsd-sdk query log` output
- `cd sdk && pnpm tsc --noEmit` — exits 0
- `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` — 4/4 green
- `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts` — 8/8 green (no git regression)
- `node tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` — 7/7 green

## Self-Check: PASSED

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
