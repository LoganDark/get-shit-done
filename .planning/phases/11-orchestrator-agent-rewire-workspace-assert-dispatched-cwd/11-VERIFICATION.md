---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
verified: 2026-05-16T18:00:00Z
status: gaps_found
score: 3/5 success criteria verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/5
  gaps_closed:
    - "SC-1 / CR-01: workspace.assert-dispatched-cwd jj-side correctness — verb now resolves workspace NAME → fs path via `jj workspace root --name <NAME>` (workspace-assert-dispatched-cwd.ts:51-68,101-114)."
    - "SC-1 companion / CR-04: gsd-executor.md FATAL branch now dumps payload + $PWD + REPO_ROOT probe (lines 424-432) — operators can triage from the field."
    - "SC-2b / CR-02: quick.md plan-shape, --phase numeric sentinel 0, HANDLE_OK guard all in place (quick.md:675-683)."
    - "SC-2b / CR-03: EXPECTED_BRANCH empty/HEAD pre-check in BOTH quick.md (:669-673) and execute-phase.md (:531-535) with byte-identical FATAL message."
    - "WR-01: jj/parallel.ts manifest writer removed — `grep -nE 'mkdtempSync|writeFileSync' sdk/src/vcs/jj/parallel.ts` returns empty."
    - "WR-02 (incompleteQueued > 0 → ok=false): worktree-safety.cjs:485-491 ok gate now folds incompleteQueued."
  gaps_remaining:
    - "SC-2a still partial: structural collapse landed in execute-phase.md but two NEW BLOCKERs (undefined $WAVE_WORKTREE_PLANS_JSON, literal --phase \"{phase_number}\" placeholder) reopen the same defect-class as the quick.md CR-02 that Plan 11-08 closed — the carry-over regression test only checks HANDLE_OK symmetry, not plan-shape or --phase shape."
  regressions:
    - "execute-phase.md:536 — Plan 11-08 hardened the GUARDS but left the DISPATCH LINE itself (which it explicitly chose not to touch — `11-08-SUMMARY.md:111` says 'The dispatch line itself ... was untouched') referencing an undefined shell variable. The pre-Phase 11 raw-git block never had this bug; the rewire introduced it."
    - "agents/gsd-executor.md:431 — Plan 11-07's CR-04 diagnostic-dump closure introduced a raw `git rev-parse --show-toplevel` call in the FATAL recovery path. Direct violation of the project rule 'No raw git anywhere in jj-port' (MEMORY: project_no_raw_git). The chain falls back to `jj workspace root` and `<unresolvable>`, but on a colocated checkout the git branch fires first and can produce a misleading toplevel."
gaps:
  - truth: "SC-2: execute-phase.md raw-git block (lines 521-810) replaced with one workspace.parallel.dispatch + one fan-in (parallel-dispatch path works end-to-end)"
    status: failed
    reason: "Structural collapse landed (lines 527-541 invoke workspace.parallel.dispatch; lines 740-757 invoke workspace.parallel.fan-in). BUT two NEW BLOCKERs introduced by Plan 11-08's carry-over make the dispatch site non-functional in production: (1) `$WAVE_WORKTREE_PLANS_JSON` at line 536 is referenced but NEVER constructed anywhere in execute-phase.md or per-plan-worktree-gate.md — `grep -rn 'WAVE_WORKTREE_PLANS_JSON'` returns exactly one hit, the use site itself; at runtime bash expands to empty string and the SDK verb returns `{ok:false, reason:'plan_json_parse_failed'}`. (2) `--phase \"{phase_number}\"` at line 538 is the workflow's orchestrator-substitution placeholder syntax but it sits inside a bash code block where `{phase_number}` is NOT expanded — bash sees the 14-character literal string, `Number(\"{phase_number}\") === NaN`, verb returns `{ok:false, reason:'phase_number_required'}`. Either alone is fatal; both fire simultaneously. The new HANDLE_OK guard (Plan 11-08 closure) catches the resulting `{ok:false}` and prints FATAL — so the user sees a clean error, but the parallel-execution path itself is unconditionally broken. The quick.md sibling (`--phase 0`, well-formed `QUICK_PLAN_JSON` jq construction at :675-676) is correct; execute-phase.md does not have the analog. Plan 11-08 explicitly self-describes this gap at `11-08-SUMMARY.md:111`: 'The dispatch line itself (numeric --phase \"{phase_number}\", plan-JSON shape already correct from Plan 11-05) was untouched — only the surrounding guards were hardened.' The author flagged the line as correct, but neither value resolves to a valid bash expansion."
    artifacts:
      - path: get-shit-done/workflows/execute-phase.md
        issue: "Line 536: `HANDLE_JSON=$(printf '%s' \"$WAVE_WORKTREE_PLANS_JSON\" | ...)` references undefined variable. There is no construction of `WAVE_WORKTREE_PLANS_JSON` anywhere in execute-phase.md, per-plan-worktree-gate.md, or any other file in the workflow tree. `WAVE_WORKTREE_PLANS` exists (as a plan-id accumulator used for non-empty checks at :768 and :817) but is never transformed into the array-of-objects JSON the verb requires."
      - path: get-shit-done/workflows/execute-phase.md
        issue: "Line 538: `--phase \"{phase_number}\"` passes literal 14-char string to a bash invocation. Workflow-substitution `{phase_number}` syntax (used at :565, :573, :695) only fires in agent prompt literals where the orchestrator substitutes before spawn — NOT in a `bash` shebang block. `${PHASE_NUMBER}` (the established convention at :312, :806, :1059, :1098 etc.) is what's needed."
      - path: tests/quick-md-parallel-dispatch.test.cjs
        issue: "Lines 48-53: the 'CR-02 execute-phase.md carry-over' describe block only asserts the HANDLE_OK FATAL guard symmetry. It does NOT carry over (a) the plan-shape doesNotMatch /\\{plans:\\[/ + match /agentId.*planId/, or (b) the numeric-phase doesNotMatch /--phase \"quick\"/ + match /--phase 0[^0-9]/. These are precisely the carry-overs that would have caught both BLOCKERs at commit time."
    missing:
      - "Build WAVE_WORKTREE_PLANS_JSON from the WAVE_WORKTREE_PLANS plan-id accumulator before the dispatch — e.g. `WAVE_WORKTREE_PLANS_JSON=$(printf '%s\\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')`. The exact shape per workspace-parallel-dispatch.ts:73 is `{agentId, planId, workspacePath?}`."
      - "Replace literal `--phase \"{phase_number}\"` with `--phase \"${PHASE_NUMBER}\"` at line 538 (or whichever bash-variable form already carries the phase number — `$PHASE_NUMBER` is established at line 312)."
      - "Extend tests/quick-md-parallel-dispatch.test.cjs's `EXEC` describe block with the missing plan-shape + numeric-phase carry-overs so neither BLOCKER can silently regress: `assert.match(EXEC, /agentId.*planId/)` + `assert.doesNotMatch(EXEC, /--phase \"\\{phase_number\\}\"/)` + `assert.match(EXEC, /--phase \"\\$\\{PHASE_NUMBER\\}\"/)`."

  - truth: "Subagent prompts never inspect backend kind — no raw `git`, no `vcs.kind` branching in agent-side code"
    status: failed
    reason: "agents/gsd-executor.md:431 runs `REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || echo \"<unresolvable>\")` in the FATAL recovery diagnostic dump added by Plan 11-07 CR-04 closure. This is a direct raw-`git` invocation introduced BY this phase (the original CR-04 had only `IS_PRIMARY` + `WS_NAME` output, no REPO_ROOT probe). Per project rule (CLAUDE.md + MEMORY: project_no_raw_git): 'VCS adapter must cover read AND write; lint guard is whole-repo default-deny on `git`, not just mutating verbs; even `git status` perturbs colocated jj state.' On a colocated git+jj checkout (the project's own configuration per `vcs.adapter: jj` in `.planning/config.json`), the `git rev-parse` branch FIRES FIRST, succeeds, and may report a different 'top level' than `jj workspace root` if the agent is inside a non-default jj workspace whose fs path is not under the git toplevel. The fallback to jj is dead code on every colocated invocation. While this only fires on FATAL recovery (low frequency), it fires on EXACTLY the diagnostic surface the project rule is most protective of, and the fix is mechanical (use a verb-based resolver)."
    artifacts:
      - path: agents/gsd-executor.md
        issue: "Line 431: raw `git rev-parse --show-toplevel` invocation inside the dispatched-cwd FATAL recovery. The fallback chain `... || jj workspace root || echo \"<unresolvable>\"` is well-intentioned, but the git branch always fires first on colocated checkouts and short-circuits the chain."
    missing:
      - "Replace the raw-git probe with an SDK verb. Options: (a) Use existing `gsd-sdk query workspace.list` and `--pick 'workspaces[0].path'` to get the primary workspace fs root (no new verb needed). (b) Add a `gsd-sdk query repo-root` verb if `(a)` doesn't carry the right semantics for the diagnostic. (c) Have `workspace.assert-dispatched-cwd` itself include the resolved primary path in its failure payload so no separate probe is needed."
      - "Add a regression test under `tests/` that greps `agents/gsd-executor.md` for `\\bgit \\b` (word-boundary) and fails on any match — this catches future re-introductions class-wide and dovetails with the project's deny-list intent."

deferred: []
human_verification: []
overrides: []
---

# Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd Verification Report (Re-verification)

**Phase Goal:** Workflows + agents call only the new cross-backend `vcs.workspace.parallel.*` verbs; the ~440 LOC of raw-git block in `execute-phase.md` (~290) and `quick.md` (~150) is deleted; subagent prompts never inspect backend kind.
**Verified:** 2026-05-16T18:00:00Z
**Status:** gaps_found
**Re-verification:** YES — second pass after gap-closure plans 11-07, 11-08, 11-09 landed.

## Re-verification Summary

Plans 11-07/08/09 successfully closed all four prior BLOCKERs (CR-01..CR-04) and both WARNINGs (WR-01, WR-02) from the first pass:

- **CR-01 (jj-side dispatched-cwd resolver):** CLOSED. `workspace-assert-dispatched-cwd.ts:51-68` adds `resolveJjWorkspacePath()` and `:101-114` branches the cwd-match loop on `vcs.kind === 'jj'`. `cmd-workspace-assert-dispatched-cwd.test.ts` pins all four scenarios.
- **CR-02 (quick.md dispatch shape):** CLOSED *for quick.md*. `quick.md:675-676` builds a flat `[{agentId:$aid,planId:$pid}]` array; `:680` passes numeric `--phase 0`; `:682-683` adds the HANDLE_OK FATAL guard. **However the symmetric defect was introduced in execute-phase.md** (see SC-2 gap below) — Plan 11-08 carried the GUARDS but not the DISPATCH LINE itself.
- **CR-03 (EXPECTED_BRANCH empty/HEAD pre-check):** CLOSED in BOTH workflow files with byte-identical FATAL message (`quick.md:669-673` and `execute-phase.md:531-535`). Drift guard pinned by `tests/quick-md-parallel-dispatch.test.cjs:66-72`.
- **CR-04 (FATAL diagnostic dump):** CLOSED in `gsd-executor.md:424-432` — payload + `$PWD` + REPO_ROOT probe now dumped. **However the REPO_ROOT probe introduced a raw `git rev-parse` invocation** (see "no raw git" gap below).
- **WR-01 (no manifest write):** CLOSED. `grep -nE 'mkdtempSync|writeFileSync' sdk/src/vcs/jj/parallel.ts` returns empty.
- **WR-02 (incompleteQueued > 0 → ok=false):** CLOSED in `worktree-safety.cjs:485-491`.

But the closure delta introduced TWO new defects flagged in the refreshed `11-REVIEW.md`:

1. **NEW BLOCKER:** `execute-phase.md:536` references an undefined `$WAVE_WORKTREE_PLANS_JSON`. Every parallel-dispatch invocation in execute-phase fails with `{ok:false, reason:'plan_json_parse_failed'}`.
2. **NEW BLOCKER:** `execute-phase.md:538` passes the literal template placeholder `"{phase_number}"` to `--phase` inside a bash block where the placeholder is NOT substituted. Every parallel-dispatch invocation fails with `{ok:false, reason:'phase_number_required'}`.
3. **NEW DEFECT (project-rule violation):** `gsd-executor.md:431` introduces a raw `git rev-parse --show-toplevel` invocation in the FATAL recovery path — violates "No raw git anywhere in jj-port" (CLAUDE.md / MEMORY entry `project_no_raw_git`).

Net result: SC-1 (jj backend opaqueness) flips PASS, SC-3 + SC-4 remain PASS, but SC-2 regresses from PARTIAL (quick.md broken) to PARTIAL (execute-phase.md broken). The cluster shape changed but score did not improve.

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1a | `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` returns ok/fail **backend-opaquely** | VERIFIED | `workspace-assert-dispatched-cwd.ts:101-114` branches on `vcs.kind === 'jj'` and calls `resolveJjWorkspacePath` (lines 51-68) which invokes `jj workspace root --name <NAME>`. Output envelope shape (`{ok, workspaceName, workspacePath, isPrimary}`) identical on both backends. Test `cmd-workspace-assert-dispatched-cwd.test.ts` pins parity. |
| SC-1b | `agents/gsd-executor.md` four worktree-aware blocks collapse to one verb call | VERIFIED (with caveat) | Lines 419-436 — single `DISPATCH_CHECK` invocation replaces the prior ~71-line guard cluster. FATAL recovery dumps payload + PWD + REPO_ROOT (lines 424-432). **Caveat:** the REPO_ROOT probe (line 431) uses raw `git` — see separate "no raw git" gap. |
| SC-2a | `execute-phase.md:521-810` raw-git deleted; replaced with one dispatch + one fan-in | **FAILED** | Structural collapse landed (`:527-541` dispatch, `:740-757` fan-in, raw `git worktree add`/`git checkout`/`git worktree remove` calls gone). **But:** `$WAVE_WORKTREE_PLANS_JSON` (line 536) is undefined — `grep -rn 'WAVE_WORKTREE_PLANS_JSON'` returns one hit (use site only). **And:** `--phase "{phase_number}"` (line 538) is literal template placeholder, `Number(\"{phase_number}\") === NaN`. Both BLOCKERs are documented in `11-REVIEW.md` CR-01 and CR-02. |
| SC-2b | Same shape applied to `quick.md:660-810` | VERIFIED | `quick.md:675-676` builds flat plan array; `:680` numeric `--phase 0`; `:682-683` HANDLE_OK FATAL guard; `:669-673` EXPECTED_BRANCH pre-check. `tests/quick-md-parallel-dispatch.test.cjs` (7/7 green) pins every sub-invariant. |
| SC-3 | `worktree-path-safety.md` renamed to `dispatch-cwd-safety.md`; body rewritten backend-agnostic; referrers updated | VERIFIED | `worktree-path-safety` grep returns empty in live code (`get-shit-done/`, `agents/`, `sdk/`, `bin/`). `dispatch-cwd-safety.md` present (91 lines), describes verb shape + failure modes + recovery, no backend-asymmetry admissions. Two live referrers updated (`execute-phase.md:579,602` + `gsd-executor.md:417`). |
| SC-4 | `executeWorktreeWaveCleanupPlan` body shrinks to single delegation; ADR-0004 `_deps={}` preserved; public signature unchanged | VERIFIED | `worktree-safety.cjs:444-500` body is `reconstructHandleFromLegacyPlan` → `vcs.workspace.parallel.fanIn(handle, results)` → classify into pending. `_deps = {}` injection seam preserved at line 444. Signature unchanged. WR-02 fix (incompleteQueued > 0 → ok=false) embedded at lines 485-491. |
| SC-5 | `dispatch({ plan, maxConcurrency })` honored end-to-end; default undefined | PARTIAL | `workspace-parallel-dispatch.ts:47,58-59,92` plumbs `--max-concurrency`; default undefined. No workflow call site exercises it (`execute-phase.md:525` and `quick.md:663` both comment 'maxConcurrency is omitted (D-07)'). Honored at contract level, deferred at workflow level per D-07 — accepted by phase plan. |

**Score:** 3/5 success criteria fully verified (SC-1, SC-3, SC-4). SC-2 FAILED (execute-phase side broken). SC-5 PARTIAL (acceptable per D-07).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/src/query/workspace-assert-dispatched-cwd.ts` | Backend-opaque cwd→workspace match | VERIFIED | File exists, exports the handler, branches on `vcs.kind`, jj resolves name→fs path. |
| `sdk/src/query/workspace-parallel-dispatch.ts` | CLI bridge for `vcs.workspace.parallel.dispatch` | VERIFIED | Flat envelope; --phase / --main-bookmark / --plan (@-/@file/inline) / --max-concurrency plumbed; defensive missing-flag returns. |
| `sdk/src/query/workspace-parallel-fan-in.ts` | CLI bridge for `vcs.workspace.parallel.fanIn` | VERIFIED | Handle + results via @file/@- with disambiguation logic. |
| `get-shit-done/workflows/execute-phase.md` | Raw-git block 521-810 replaced + functional dispatch | EXISTS, BROKEN | Replacement landed; HANDLE_OK + EXPECTED_BRANCH guards added; dispatch line itself broken on two independent dimensions (CR-01, CR-02 from 11-REVIEW). |
| `get-shit-done/workflows/quick.md` | Raw-git block 660-810 replaced + functional dispatch | VERIFIED | All three quick.md CR-02 sub-defects + CR-03 closed by Plan 11-08; regression-pinned. |
| `agents/gsd-executor.md` | Four worktree-aware blocks collapse to one call; backend kind never exposed | EXISTS, RAW-GIT-VIOLATION | Structural collapse correct; diagnostic dump introduces raw `git rev-parse` (line 431) — violates project rule "No raw git anywhere in jj-port". |
| `get-shit-done/references/dispatch-cwd-safety.md` | Renamed; backend-agnostic; referrers updated | VERIFIED | 91-line doc, no asymmetry admissions, all live referrers updated. |
| `get-shit-done/bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` | Single delegation; ADR-0004 preserved | VERIFIED | Body collapsed to reconstructHandle → fanIn → classify; `_deps={}` seam intact; WR-02 fix included. |
| `tests/quick-md-parallel-dispatch.test.cjs` | Pin CR-02 + CR-03 invariants on quick.md AND execute-phase.md carry-over | EXISTS, NARROW | Pins all three CR-02 sub-defects on QUICK and the CR-03 + HANDLE_OK guard on EXEC. **Does NOT pin the plan-shape or `--phase` shape on EXEC**, which is why the new BLOCKERs slipped through (IN-01 in 11-REVIEW). |
| `tests/jj-parallel-no-manifest-write.test.cjs` | Pin WR-01 closure | EXISTS, NARROW | Greps for specific filename patterns rather than asserting "no disk writes in jj/parallel.ts" behaviorally (WR-04 in 11-REVIEW — info-level only). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| workspace-assert-dispatched-cwd.ts | jj workspace name → fs path | `vcsExec(repoCwd, 'jj', [..., 'workspace', 'root', '--name', name])` | WIRED | Subprocess shell-out, defensive null return on non-zero exit. |
| workspace-assert-dispatched-cwd.ts | vcs.workspace.list() | createVcsAdapter(cwd).workspace.list() | WIRED | Confirmed end-to-end on both backends via cmd-workspace-assert-dispatched-cwd.test.ts. |
| workspace-parallel-dispatch.ts | vcs.workspace.parallel.dispatch | createVcsAdapter(cwd).workspace.parallel.dispatch({...}) | WIRED | Confirmed. |
| workspace-parallel-fan-in.ts | vcs.workspace.parallel.fanIn | createVcsAdapter(cwd).workspace.parallel.fanIn(handle, results) | WIRED | Confirmed. |
| execute-phase.md | workspace.parallel.dispatch | gsd-sdk query workspace.parallel.dispatch ... | **BROKEN** | Plan JSON empty (undef var); `--phase` literal placeholder. Verb returns ok:false on every invocation. |
| execute-phase.md | workspace.parallel.fan-in | gsd-sdk query workspace.parallel.fan-in --handle @$HANDLE_FILE --results @- | DEAD CODE | Fan-in wiring correct in shape, but $HANDLE_JSON carries reason payload (no .workspaces[]) so the iteration body produces zero entries; MERGED_COUNT=0; wave silently completes with zero merged. |
| quick.md | workspace.parallel.dispatch | gsd-sdk query workspace.parallel.dispatch ... | WIRED | Confirmed by tests/quick-md-parallel-dispatch.test.cjs. |
| quick.md | workspace.parallel.fan-in | gsd-sdk query workspace.parallel.fan-in ... | WIRED | Confirmed. |
| gsd-executor.md | workspace.assert-dispatched-cwd | gsd-sdk query workspace.assert-dispatched-cwd --cwd . | WIRED | Single invocation at task_commit_protocol step 0. |
| gsd-executor.md | (FATAL recovery) repo root | `git rev-parse --show-toplevel` chain | RAW-GIT | Violates project rule; bypasses SDK adapter on read-side. |
| worktree-safety.cjs::executeWorktreeWaveCleanupPlan | vcs.workspace.parallel.fanIn | _deps.vcs ?? createVcsAdapter(...).workspace.parallel.fanIn(handle, results) | WIRED | ADR-0004 seam preserved. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| workspace-assert-dispatched-cwd.ts | matched workspace path | `resolveJjWorkspacePath(cwd, entry.path)` → `safeRealpath(fsPath)` | YES on both backends after CR-01 closure | FLOWING |
| execute-phase.md dispatch | $HANDLE_JSON | `gsd-sdk query workspace.parallel.dispatch` with `$WAVE_WORKTREE_PLANS_JSON` (UNDEFINED) and `--phase "{phase_number}"` (LITERAL) | NO — receives `{ok:false, reason:'plan_json_parse_failed'}` OR `{ok:false, reason:'phase_number_required'}` depending on which check fires first inside the verb body | HOLLOW (silent zero-workspace dispatch caught by new HANDLE_OK guard, but path is structurally broken) |
| quick.md dispatch | $HANDLE_JSON | `gsd-sdk query workspace.parallel.dispatch --phase 0 ...` with valid `$QUICK_PLAN_JSON` | YES | FLOWING |
| gsd-executor.md FATAL | $REPO_ROOT | `git rev-parse --show-toplevel \|\| jj workspace root \|\| echo "<unresolvable>"` | YES (git branch always wins on colocated) | FLOWING (but via raw git — defect) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Verb CLI invokes on jj backend | `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` (in repo root) | Per Plan 11-07 SUMMARY + cmd-workspace-assert-dispatched-cwd.test.ts: returns `{ok:false, workspaceName:'default', workspacePath:<abs>, isPrimary:true}` on primary jj workspace | PASS — backend-opaque output shape with isPrimary correctly resolved |
| Dispatch verb rejects non-numeric --phase | `printf '[]' \| gsd-sdk query workspace.parallel.dispatch --phase "{phase_number}" --main-bookmark trunk --plan @-` | Per workspace-parallel-dispatch.ts:63-65: `{ok:false, reason:'phase_number_required'}` (Number("{phase_number}") is NaN) | PASS (defensive) — confirms execute-phase.md's literal-placeholder path is rejected |
| Dispatch verb rejects empty plan JSON | `printf '' \| gsd-sdk query workspace.parallel.dispatch --phase 5 --main-bookmark trunk --plan @-` | Per workspace-parallel-dispatch.ts:74-85: `{ok:false, reason:'plan_json_parse_failed', error:'Unexpected end of JSON…'}` | PASS — confirms `$WAVE_WORKTREE_PLANS_JSON` empty expansion is caught |
| Test: tests/quick-md-parallel-dispatch.test.cjs (7 tests) | `node --test tests/quick-md-parallel-dispatch.test.cjs` | Per 11-08-SUMMARY: 7/7 green | PASS — but coverage is narrower than needed (see SC-2 gap; missing EXEC plan-shape + --phase carry-overs) |
| Quick.md and execute-phase.md end-to-end dispatch on a colocated jj checkout | (would require live wave) | SKIP — would mutate state | SKIP (route to operator if needed) |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| (no `scripts/*/tests/probe-*.sh` declared by Phase 11 plans) | n/a | n/a | SKIPPED — phase did not declare probe-based verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VCS-20 | 11-02, 11-04, 11-07 | workspace.assert-dispatched-cwd SDK verb backend-opaque | SATISFIED | jj-side resolver landed (Plan 11-07 CR-01 closure); test pins parity. |
| PROMPT-06 | 11-05 | Delete raw-git in execute-phase.md:521-810; replace with verbs | **BLOCKED** | Structural collapse landed but dispatch line non-functional due to undefined plan-JSON variable + literal phase-number placeholder. NEW BLOCKERs from 11-REVIEW CR-01/02. |
| PROMPT-07 | 11-06, 11-08 | Delete raw-git in quick.md:660-810; replace with verbs | SATISFIED | All CR-02 sub-defects closed by Plan 11-08; regression-pinned. |
| PROMPT-08 | 11-04, 11-07 | Collapse gsd-executor.md:412-555 four blocks to one verb call; backend kind never exposed | **BLOCKED** | Structural collapse landed and verb works on jj. **But** the Plan 11-07 CR-04 diagnostic-dump closure introduced a raw `git rev-parse` invocation (line 431) — the agent prompt now contains an explicit `git` invocation that fires on every FATAL recovery. The "backend kind never exposed" intent is intact at the dispatched-cwd-check layer, but violated at the recovery-diagnostic layer. |
| PROMPT-09 | 11-04 | Rename worktree-path-safety.md → dispatch-cwd-safety.md; rewrite backend-agnostic; update referrers | SATISFIED | Confirmed via SC-3 verification. |
| PARALLEL-06 | 11-02, 11-05, 11-06, 11-08 | `dispatch({plan, maxConcurrency})` honored end-to-end; default undefined | PARTIALLY SATISFIED | Field plumbed at SDK contract level; no workflow call site exercises it per D-07; acceptable for Phase 11, full exposure deferred to Phase 14. Quick.md side functional; execute-phase.md side blocked by SC-2 dispatch failure. |

**Orphaned requirements:** None — every Phase 11 requirement ID is claimed by at least one plan.

REQUIREMENTS.md table at lines 114-123 marks all six Phase 11 requirements as "Complete", which is inconsistent with the BLOCKED status of PROMPT-06 and PROMPT-08 above. The REQUIREMENTS.md update appears to have been auto-applied by Plan 11-08's summary without verifier sign-off — that file needs to revert PROMPT-06 to "In Progress" until SC-2 is fully closed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| get-shit-done/workflows/execute-phase.md | 536 | Reference to undefined shell variable `$WAVE_WORKTREE_PLANS_JSON` | Blocker | Every parallel-dispatch invocation in execute-phase fails with `{ok:false, reason:'plan_json_parse_failed'}`. (REVIEW CR-01) |
| get-shit-done/workflows/execute-phase.md | 538 | Literal template-placeholder syntax `"{phase_number}"` inside a bash code block (where `{...}` is not substituted) | Blocker | Every parallel-dispatch invocation fails with `{ok:false, reason:'phase_number_required'}` (NaN). (REVIEW CR-02) |
| agents/gsd-executor.md | 431 | Raw `git rev-parse --show-toplevel` invocation in agent prompt — violates project rule "No raw git anywhere in jj-port" | Blocker | Direct rule violation; misleading REPO_ROOT on colocated jj workspaces nested outside git toplevel. (REVIEW CR-03) |
| tests/quick-md-parallel-dispatch.test.cjs | 48-53 | EXEC carry-over describe-block omits plan-shape + numeric-phase assertions | Warning | Regression net too narrow — the two execute-phase.md BLOCKERs above bypassed CI. (REVIEW IN-01) |
| sdk/src/query/workspace-assert-dispatched-cwd.ts | 101-114 | N+1 subprocess pattern (one `jj workspace root --name` per workspace) | Warning | Latency cost; quadratic in worst case at high N. Fix is a one-line change to `parseJjWorkspaceList` to carry `fsRoot`. (REVIEW WR-02) |
| get-shit-done/references/dispatch-cwd-safety.md | 54-60 | "protected-ref deny-list is implied" claim — verb does not inspect HEAD ref | Warning | Documentation overstates the guarantee; the retired `<worktree_branch_check>` defense was in-depth and is now by assumption only. (REVIEW WR-01) |
| get-shit-done/bin/lib/worktree-safety.cjs | 485-491 | `cleanFanIn` predicate duplicated literal expression at two sites | Warning | Drift risk between per-entry `ok` and outer return-level `ok`. (REVIEW WR-04) |
| tests/jj-parallel-no-manifest-write.test.cjs | 42-50 | Filename-based grep instead of behavioral assertion | Warning | Future re-introduction with a different filename slips past. WR-01 guard is narrower than the D-01 invariant it claims to defend. (REVIEW CR-04 — flagged Critical there, downgraded here because the current file has no writes at all) |
| tests/wave-cleanup-executor.test.cjs | 60-220 | No combined `conflicted: true` + `failedReaped.length > 0` test case | Warning | Single-failure-mode coverage; a refactor that short-circuits one branch under the other could silently drop `crashed_agent` entries. (REVIEW WR-05) |
| agents/gsd-executor.md | 417 | Docstring claims "single backend-opaque precondition check" but no test pins backend-opacity as an INVARIANT (only as parity) | Info | Future refactor reintroducing a `kind === 'git'` early-return would pass both backends' scenarios independently. (REVIEW WR-03) |
| get-shit-done/references/dispatch-cwd-safety.md | 86-92 | Recovery section omits orchestrator-side retry guidance | Info | Doc claims recovery is the orchestrator's responsibility but execute-phase.md and quick.md have no retry loop wired in. (REVIEW IN-02) |
| sdk/src/vcs/jj/parallel.ts | 15-19, 233-239 + worktree-safety.cjs:411-412 + tests/jj-parallel-no-manifest-write.test.cjs:8-13 | Four copies of "Phase 11 D-01 retired the manifest" rationale | Info | Single-source-of-truth concern; documentation hygiene. (REVIEW IN-03) |
| .planning/REQUIREMENTS.md | 119-122 | PROMPT-06 and PROMPT-08 marked "Complete" while structurally blocked | Info | Documentation drift — the requirements table got updated by Plan 11-08 SUMMARY before the verifier signed off. |

### Human Verification Required

None identified. All gaps are observable from static analysis of the codebase — the two execute-phase.md BLOCKERs are mechanical (single-line shell variable + single-arg fix), and the raw-`git` violation in gsd-executor.md is a known project rule that the project's own MEMORY records as universally enforced.

### Gaps Summary

Phase 11's structural goal (`-440` LOC raw-git deletion + four guards → one call + reference rename + cleanup-plan body shrink) is essentially LANDED. Plans 11-07/08/09 closed every prior BLOCKER. But the second pass surfaces TWO new defect-clusters introduced BY the gap-closure work:

1. **execute-phase.md dispatch line is non-functional (BLOCKER, two independent root causes):**
   - `$WAVE_WORKTREE_PLANS_JSON` (line 536) is referenced but never constructed in execute-phase.md, per-plan-worktree-gate.md, or any other file. `grep -rn 'WAVE_WORKTREE_PLANS_JSON'` returns one hit — the use site. Plan 11-08 SUMMARY explicitly self-describes the dispatch line as "already correct from Plan 11-05" (`11-08-SUMMARY.md:111`); the author chose not to touch it. Plan 11-05 SUMMARY also makes no claim of constructing this variable, and `grep -c 'phase_number' 11-05-SUMMARY.md` returns 0.
   - `--phase "{phase_number}"` (line 538) is the workflow's orchestrator-substitution placeholder syntax that ONLY fires inside agent prompt literals where the orchestrator runtime substitutes before spawn (see lines 565, 573, 695 for legitimate uses). Inside a `bash` shebang block the placeholder is NOT expanded — `Number(\"{phase_number}\") === NaN`, and the verb returns `phase_number_required`. The bash-variable form `${PHASE_NUMBER}` is the established convention at lines 312, 806, 1059, 1098.
   - The new HANDLE_OK guard (Plan 11-08 closure) catches the resulting `{ok:false}` from either failure mode and prints a clean FATAL — so the user sees a clean error, but the parallel-execution path is unconditionally broken on the orchestrator side.

2. **Raw `git rev-parse` re-introduced in agent prompt (BLOCKER, project-rule violation):**
   - `gsd-executor.md:431` runs `git rev-parse --show-toplevel || jj workspace root || echo "<unresolvable>"` in the dispatched-cwd FATAL recovery (added by Plan 11-07 CR-04 closure).
   - Project rule from CLAUDE.md + MEMORY `project_no_raw_git`: "VCS adapter must cover read AND write; lint guard is whole-repo default-deny on `git`, not just mutating verbs; even `git status` perturbs colocated jj state." The chain falls back to jj only if git fails — on the project's own colocated git+jj checkout (`vcs.adapter: jj`), the git branch ALWAYS WINS and the jj fallback is dead code.
   - Concrete safety concern: on a non-default jj workspace whose fs path is outside the git toplevel (jj workspaces can sit as siblings to the colocated `.git`), `git rev-parse --show-toplevel` reports the git toplevel — not the correct workspace root.

Both defects share a structural cause: the closure plans focused on fixing the SPECIFIC symptom (the original verifier's CR-N markers) without exercising the SUPERSET of analog defects. The execute-phase.md dispatch line had the same shape as the quick.md dispatch line, but Plan 11-08 only fixed quick.md AND ONLY ADDED THE GUARDS to execute-phase.md. The CR-04 diagnostic dump fixed the "no triage data" gap by introducing the wrong KIND of triage data (raw git).

**Recommended planner action:** Group these into two focused closure plans —

1. **Plan 11-10 (PROMPT-06 / SC-2a closure):**
   - Construct `WAVE_WORKTREE_PLANS_JSON` from the `WAVE_WORKTREE_PLANS` accumulator before the dispatch (one-line `jq` shell pipeline).
   - Replace `--phase "{phase_number}"` with `--phase "${PHASE_NUMBER}"` at line 538.
   - Extend `tests/quick-md-parallel-dispatch.test.cjs`'s `EXEC` describe block with the missing plan-shape + numeric-phase carry-overs (3 new assertions) so neither BLOCKER can regress.

2. **Plan 11-11 (PROMPT-08 raw-git removal):**
   - Replace `gsd-executor.md:431`'s `git rev-parse --show-toplevel` chain with an SDK-verb-based resolver (likely `gsd-sdk query workspace.list --pick 'workspaces[0].path'` or a small new `workspace.repo-root` verb).
   - Add a regression test under `tests/` that fails on any `\bgit\b` token in `agents/gsd-executor.md` — the project's deny-list intent enforced at file-level.

These can land in parallel; both touch independent files and have non-overlapping test surfaces. Optional Plan 11-12 could fold in the WR-class items (N+1 jj subprocess, protected-ref doc-overstatement, dispatch-cwd-safety recovery section, REQUIREMENTS.md status revert) but none are individually goal-blocking.

---

_Verified: 2026-05-16T18:00:00Z (re-verification pass 2)_
_Verifier: Claude (gsd-verifier)_
