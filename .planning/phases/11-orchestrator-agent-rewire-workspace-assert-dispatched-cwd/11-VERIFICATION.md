---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
verified: 2026-05-16T12:05:00Z
status: gaps_found
score: 2/5 success criteria verified
overrides_applied: 0
gaps:
  - truth: "SC-1: workspace.assert-dispatched-cwd returns ok/fail backend-opaquely"
    status: failed
    reason: "Verb body assumes WorkspaceInfo.path is an fs path. On jj backend parseJjWorkspaceList projects record.name (workspace NAME, e.g. 'default', 'phase-11-subagent-1') into WorkspaceInfo.path, so safeRealpath(entries[i].path) either resolves to null or produces spurious matches against same-named relative paths in the agent cwd. The verb is broken on jj — every jj agent commit halts with FATAL. The 'backend-opaque' clause of SC-1 is violated. The 02-SUMMARY.md itself documents this as 'backend asymmetry' (line 83, line 100) and the dispatch-cwd-safety.md reference admits 'on jj this is the workspace name' (line 27-29). All four agent-side guard collapse claims (PROMPT-08, VCS-20) are therefore non-functional on jj."
    artifacts:
      - path: sdk/src/query/workspace-assert-dispatched-cwd.ts
        issue: "Line 57 calls safeRealpath(entries[i].path) — comparing fs realpaths against workspace names on jj. No branch on vcs.kind, no use of an absolute workspace-fs-root primitive that the jj adapter could expose."
      - path: sdk/src/vcs/parse/jj-workspace-list.ts
        issue: "Line 49-53 sets path: record.name ?? '' — the jj adapter's WorkspaceInfo.path is intentionally a workspace NAME (per the parser's own Open Question Q3 comment), but no Phase 11 work surfaced a separate absolute workspacePath field."
      - path: agents/gsd-executor.md
        issue: "Lines 419-427 invoke the broken verb and exit 1 on ok!=true with no diagnostic — every jj agent halts opaquely with isPrimary=$IS_PRIMARY only, no cwd dump, no verb payload dump."
    missing:
      - "Either narrow workspace-assert-dispatched-cwd.ts on vcs.kind and use a jj-specific fs-root resolver (e.g. jj workspace root --workspace <name>), or extend WorkspaceInfo with a guaranteed absolute workspacePath field populated by both backends."
      - "Until the verb works on jj, the Phase 11 collapse is git-only. The PROMPT-08 'backend kind is never exposed' claim must be relaxed or the verb fixed."

  - truth: "SC-2: execute-phase.md raw-git block replaced with workspace.parallel.dispatch + fan-in; same shape applied to quick.md"
    status: partial
    reason: "execute-phase.md side appears wired correctly (lines 521-810 region now invokes workspace.parallel.dispatch with numeric --phase \"{phase_number}\" and workspace.parallel.fan-in with handle-tmpfile + results-stdin). But the quick.md side is structurally wired AND silently broken: (a) the plan JSON shape is wrong, (b) the phase value is non-numeric, (c) no FATAL guard catches the {ok:false, reason} payload, and (d) no detached-HEAD/empty-branch pre-check exists. The verb's input contract is violated; every quick-task dispatch silently dispatches zero workspaces and reports success."
    artifacts:
      - path: get-shit-done/workflows/quick.md
        issue: "Line 670-672 builds {plans:[{id:$pid,planFile:$pfile}]} but workspace-parallel-dispatch.ts:73-76 declares plan as `readonly {agentId,planId,workspacePath?}[]` and does JSON.parse(planText). The {plans:[...]} wrapper plus id/planFile vs agentId/planId field-name mismatch means the parsed JSON is shape-incompatible. On jj, performJjParallelDispatch line 175-177 will run validateAgentId(undefined) and throw; on git the equivalent loop will misbehave."
      - path: get-shit-done/workflows/quick.md
        issue: "Line 674 passes --phase \"quick\" but workspace-parallel-dispatch.ts:53,63-65 does phaseNumber = Number(args[++i]) and returns {ok:false, reason:'phase_number_required'} on NaN. Plan 06's own SUMMARY.md line 95 explicitly acknowledges: 'Phase tag in dispatch | --phase \"{phase_number}\" (plan-formatted) | --phase \"quick\" (literal tag — quick mode has no phase number)' — confirming the value is a literal string, not a number."
      - path: get-shit-done/workflows/quick.md
        issue: "Line 675 only checks [ -z \"$HANDLE_JSON\" ] — the {ok:false, reason:'phase_number_required'} response is non-empty JSON, so this FATAL guard never fires. The downstream jq -r '.workspaces[]' iteration on the reason-payload produces zero entries; the executor Agent() is never spawned, fan-in's MERGED_COUNT=0, and quick mode reports success while having dispatched nothing."
      - path: get-shit-done/workflows/quick.md
        issue: "Line 668: EXPECTED_BRANCH=$(gsd-sdk query current-branch --cwd . --pick branch) is passed straight to --main-bookmark with no empty/HEAD pre-check. validateMainBookmark (jj/parallel.ts:116-126) throws on empty strings (length===0 || startsWith('-')), surfacing a stack trace instead of a clean fail-loud recovery message. execute-phase.md:530 has the same gap symmetrically."
    missing:
      - "Quick.md: build a plain JSON array of {agentId, planId} (NOT a {plans:[...]} wrapper); pass a numeric --phase sentinel (e.g. 0) OR widen the verb's --phase to accept non-numeric tags."
      - "Quick.md AND execute-phase.md: add a HANDLE_OK=$(echo \"$HANDLE_JSON\" | jq -r '.ok // \"true\"'); [ \"$HANDLE_OK\" = \"false\" ] && exit 1 guard after dispatch."
      - "Quick.md AND execute-phase.md: add a pre-dispatch [ -z \"$EXPECTED_BRANCH\" ] || [ \"$EXPECTED_BRANCH\" = \"HEAD\" ] FATAL guard."

  - truth: "SC-1 (companion): the four worktree-aware blocks at gsd-executor.md:412-555 collapse to ONE call to workspace.assert-dispatched-cwd"
    status: partial
    reason: "The structural collapse landed (one DISPATCH_CHECK invocation at lines 419-427 replaces ~71 lines of guards). But because the verb itself is broken on jj (per SC-1 gap above), the collapsed call sets ok=false unconditionally on the jj backend and the agent's exit 1 path fires with only isPrimary + workspaceName surfaced — no cwd dump, no verb payload, no recovery context. Combined with CR-04, jj agents will be opaquely impossible to triage in the field."
    artifacts:
      - path: agents/gsd-executor.md
        issue: "Lines 417 documentation claims the verb is 'backend-opaque' but the implementation is git-only. Lines 421-427 exit 1 with no diagnostic dump."
    missing:
      - "Either fix the verb (preferred — closes SC-1 jointly) or expand the agent's failure branch to dump verb payload + cwd + isPrimary + workspaceName so operators can diagnose."

  - truth: "Stale on-disk WAVE_WORKTREE_MANIFEST sidecar contradicts D-01 (no orchestrator sidecar state)"
    status: partial
    reason: "Phase 11 D-01 declared the WAVE_WORKTREE_MANIFEST sidecar eliminated; the SDK-side reconstructHandleFromLegacyPlan (worktree-safety.cjs:404-421) correctly sets manifest:''. But sdk/src/vcs/jj/parallel.ts:232-245 still mkdtempSync + writeFileSync the manifest file into tmpdir() on every dispatch and stores the path on handle.manifest. No consumer reads the new on-disk file; every jj dispatch leaks one tmpdir. The retirement claim and the implementation diverge."
    artifacts:
      - path: sdk/src/vcs/jj/parallel.ts
        issue: "Lines 226-254: VCS-19 manifest writer still runs unconditionally on every dispatch — orphaned write. Docstring at line 23 still describes the write as the contract."
    missing:
      - "Either remove the write entirely (parity with reconstructHandleFromLegacyPlan's manifest:'') OR tag the write 'diagnostic-only' with a cleanup hook AND update the docstring."
      - "If kept as diagnostic, ensure the directory does not leak between successive dispatches."
deferred: []
human_verification: []
---

# Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd Verification Report

**Phase Goal:** Workflows + agents call only the new cross-backend `vcs.workspace.parallel.*` verbs; the ~440 LOC of raw-git block in `execute-phase.md` (~290) and `quick.md` (~150) is deleted; subagent prompts never inspect backend kind.
**Verified:** 2026-05-16T12:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1a | `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` returns ok/fail **backend-opaquely** | FAILED | `workspace-assert-dispatched-cwd.ts:57` does `safeRealpath(entries[i].path)`; on jj, `parseJjWorkspaceList:49-53` projects workspace NAME into `WorkspaceInfo.path`; realpath comparison cannot match. 02-SUMMARY.md line 83 itself documents the broken behavior as "documented backend asymmetry". |
| SC-1b | `agents/gsd-executor.md` four worktree-aware blocks collapse to one verb call | PARTIAL | Lines 419-427 invoke the verb in a single block (structural collapse landed), but the invoked verb is git-only — so on jj the agent halts opaquely. |
| SC-2a | `execute-phase.md:521-810` raw-git deleted; replaced with one dispatch + one fan-in | VERIFIED | `execute-phase.md:527-535` calls `workspace.parallel.dispatch` with numeric `--phase`; `:740-757` calls `workspace.parallel.fan-in` with handle-tmpfile + results-stdin. WAVE_WORKTREE_MANIFEST mktemp deleted from this file. |
| SC-2b | Same shape applied to `quick.md:660-810` | FAILED | `quick.md:670-675` passes wrong plan shape (`{plans:[{id,planFile}]}` instead of `[{agentId,planId}]`), non-numeric `--phase "quick"`, AND only guards on empty stdout — every quick dispatch silently dispatches zero workspaces. |
| SC-3 | `worktree-path-safety.md` renamed to `dispatch-cwd-safety.md`; body rewritten backend-agnostic; referrers updated | VERIFIED | `worktree-path-safety.md` not present in references/; `dispatch-cwd-safety.md` present and backend-agnostic (lines 1-87 describe the verb shape + failure modes). Load-bearing referrers updated (`execute-phase.md:595`, `gsd-executor.md:417`). Stale references remain only in `.planning/` historical artifacts which the 04-SUMMARY decision documents as intentional. |
| SC-4 | `executeWorktreeWaveCleanupPlan` body shrinks to single delegation; ADR-0004 `_deps={}` preserved; public signature unchanged | VERIFIED | `worktree-safety.cjs:444-498` body is now: `reconstructHandleFromLegacyPlan` → `vcs.workspace.parallel.fanIn(handle, results)` → classify into pending. `_deps = {}` injection seam preserved at line 444. Signature `executeWorktreeWaveCleanupPlan(plan, _deps = {})` unchanged. |
| SC-5 | `dispatch({ plan, maxConcurrency })` honored end-to-end; default undefined | PARTIAL | `workspace-parallel-dispatch.ts:42-59,87-93` accepts `--max-concurrency` and passes it into the adapter dispatch call; default undefined. **But** no workflow call site (`execute-phase.md:527-535`, `quick.md:672-674`) actually passes `--max-concurrency` — the wiring is plumbed but not exercised. SUMMARY claims "workflow exposure is deferred to Phase 14 dogfood metrics", which is acceptable for PARALLEL-06 field-level honor, but "end-to-end from workflow call sites" in SC-5 is only honored at the contract level. |

**Score:** 2/5 success criteria fully verified (SC-2a, SC-3, SC-4). SC-1 FAILED. SC-2b FAILED. SC-5 PARTIAL. Combined SC-1a+SC-1b cluster = 1 blocker.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/src/query/workspace-assert-dispatched-cwd.ts` | Backend-opaque cwd→workspace match | EXISTS, STUB-on-jj | File exists, exports the handler, registered in catalog/manifest. Body is **git-only** (CR-01). |
| `sdk/src/query/workspace-parallel-dispatch.ts` | CLI bridge for `vcs.workspace.parallel.dispatch` | VERIFIED | Flat envelope; --phase / --main-bookmark / --plan (@-/@file/inline) / --max-concurrency plumbed; defensive missing-flag returns. |
| `sdk/src/query/workspace-parallel-fan-in.ts` | CLI bridge for `vcs.workspace.parallel.fanIn` | VERIFIED | Handle + results via @file/@- with disambiguation logic; defensive parse-failure returns. |
| `get-shit-done/workflows/execute-phase.md` | Raw-git block 521-810 replaced | VERIFIED | Replaced with SDK verb invocations; WAVE_WORKTREE_MANIFEST mktemp gone; sequential-dispatch warning preserved. |
| `get-shit-done/workflows/quick.md` | Raw-git block 660-810 replaced | EXISTS, BROKEN | Replaced structurally, but plan JSON shape + phase value + missing guards mean it silently no-ops (CR-02, CR-03). |
| `agents/gsd-executor.md` | Four worktree-aware blocks collapse to one call | EXISTS, EFFECTIVELY-STUB-on-jj | Single DISPATCH_CHECK invocation present, but verb is broken on jj — net effect is hard-exit with no diagnostic (CR-01, CR-04). |
| `get-shit-done/references/dispatch-cwd-safety.md` | Renamed from worktree-path-safety.md; backend-agnostic | VERIFIED | New file present, 87 lines, describes verb shape + failure modes + recovery; documents the jj name-asymmetry at line 27-29 (admission that the implementation is not actually backend-opaque). |
| `get-shit-done/bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` | Single delegation; ADR-0004 preserved | VERIFIED | Body collapsed to reconstructHandleFromLegacyPlan → fanIn → classify. `_deps={}` seam intact. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| workspace-assert-dispatched-cwd.ts | vcs.workspace.list() | createVcsAdapter(cwd).workspace.list() | WIRED (logically) but BROKEN | The call exists, but the consumer logic (realpath comparison) is incompatible with the jj adapter's list() output shape. |
| workspace-parallel-dispatch.ts | vcs.workspace.parallel.dispatch | createVcsAdapter(cwd).workspace.parallel.dispatch({...}) | WIRED | Confirmed. |
| workspace-parallel-fan-in.ts | vcs.workspace.parallel.fanIn | createVcsAdapter(cwd).workspace.parallel.fanIn(handle, results) | WIRED | Confirmed. |
| execute-phase.md | workspace.parallel.dispatch | gsd-sdk query workspace.parallel.dispatch ... | WIRED | --phase numeric, --main-bookmark plumbed, --plan @- stdin. |
| execute-phase.md | workspace.parallel.fan-in | gsd-sdk query workspace.parallel.fan-in --handle @$HANDLE_FILE --results @- | WIRED | Tmpfile dance per CLI's no-dual-stdin contract. |
| quick.md | workspace.parallel.dispatch | gsd-sdk query workspace.parallel.dispatch ... | WIRED-BUT-BROKEN | Plan shape wrong, --phase non-numeric, FATAL guard misses ok:false payload. |
| quick.md | workspace.parallel.fan-in | gsd-sdk query workspace.parallel.fan-in ... | WIRED but DEAD CODE | Fan-in is wired correctly, but $HANDLE_JSON contains a reason payload with no .workspaces[] so $RESULTS_ACCUM is empty and merged=0. |
| gsd-executor.md | workspace.assert-dispatched-cwd | gsd-sdk query workspace.assert-dispatched-cwd --cwd . | WIRED but BROKEN-on-jj | Single invocation present at task_commit_protocol step 0. |
| worktree-safety.cjs::executeWorktreeWaveCleanupPlan | vcs.workspace.parallel.fanIn | _deps.vcs ?? createVcsAdapter(...).workspace.parallel.fanIn(handle, results) | WIRED | ADR-0004 seam preserved. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| workspace-assert-dispatched-cwd.ts | entries | vcs.workspace.list() | YES on git, YES on jj — but jj's .path field carries workspace NAME, not fs path | STATIC-MISMATCH — data exists but is shape-incompatible with the consumer's realpath comparison |
| workspace-parallel-dispatch.ts | handle | vcs.workspace.parallel.dispatch({...}) | YES | FLOWING |
| workspace-parallel-fan-in.ts | fanInResult | vcs.workspace.parallel.fanIn(handle, results) | YES | FLOWING |
| quick.md dispatch site | $HANDLE_JSON | gsd-sdk query workspace.parallel.dispatch | NO — receives `{ok:false, reason:'phase_number_required'}` due to non-numeric phase | HOLLOW-PROP (silent zero-workspace dispatch) |
| execute-phase.md dispatch site | $HANDLE_JSON | gsd-sdk query workspace.parallel.dispatch | YES (assuming WAVE_WORKTREE_PLANS_JSON is built correctly upstream) | FLOWING (caveat: same missing OK-guard pattern would bite if upstream produces bad plan) |
| gsd-executor.md | $DISPATCH_CHECK | gsd-sdk query workspace.assert-dispatched-cwd | NO on jj — verb always returns ok:false | HOLLOW (all jj agents halt) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Verb CLI invokes without error in repo cwd | `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` | Per 02-SUMMARY line 83: returns `{"ok":false,"workspaceName":null,"workspacePath":null,"isPrimary":false}` on jj-colocated cwd that IS the main workspace | PASS (semantically correct for primary) — but cannot distinguish primary from any non-primary jj workspace |
| workspace.parallel.dispatch surfaces phase_number_required on non-numeric input | `printf '[]' \| gsd-sdk query workspace.parallel.dispatch --phase quick --main-bookmark trunk --plan @-` | Per workspace-parallel-dispatch.ts:63-65: `{ok:false, reason:'phase_number_required'}` | PASS — confirms the verb-side defensive return; this is what quick.md hits in production but doesn't check for |
| Quick.md dispatch end-to-end on a colocated jj checkout | (would require live quick task) | SKIP — would mutate state | SKIP (route to operator) |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| (no probes declared in Phase 11 PLANs or SUMMARYs) | n/a | n/a | SKIPPED — phase did not declare probe-based verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VCS-20 | 11-02, 11-04 | workspace.assert-dispatched-cwd SDK verb backend-opaque | BLOCKED | Verb shipped but body is git-only; "backend-opaque" claim violated (CR-01). |
| PROMPT-06 | 11-05 | Delete raw-git in execute-phase.md:521-810; replace with verbs | SATISFIED | Confirmed structurally; SC-2a verified. |
| PROMPT-07 | 11-06 | Delete raw-git in quick.md:660-810; replace with verbs | BLOCKED | Replacement landed structurally but is dysfunctional (CR-02/CR-03); SC-2b FAILED. |
| PROMPT-08 | 11-04 | Collapse gsd-executor.md:412-555 four blocks to one verb call | BLOCKED | Structural collapse landed; but verb's git-only body means the collapsed call halts every jj agent (CR-01). The PROMPT-08 "backend kind never exposed" intent fails because the verb's body silently depends on backend-shape. |
| PROMPT-09 | 11-04 | Rename worktree-path-safety.md → dispatch-cwd-safety.md; rewrite backend-agnostic; update referrers | SATISFIED | Confirmed via SC-3. |
| PARALLEL-06 | 11-02, 11-05, 11-06 | `dispatch({plan, maxConcurrency})` honored end-to-end; default undefined | PARTIALLY SATISFIED | Field is honored at the adapter contract level (workspace-parallel-dispatch.ts plumbs --max-concurrency); but no workflow call site exercises it. SC-5 partial. |

**Orphaned requirements:** None — every Phase 11 requirement ID is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| sdk/src/vcs/jj/parallel.ts | 232-245 | Orphaned writeFileSync of WAVE_WORKTREE_MANIFEST sidecar after D-01 retirement | Warning | tmpdir leak per dispatch; D-01 retirement claim contradicted by implementation (WR-01). |
| get-shit-done/bin/lib/worktree-safety.cjs | 489 | `ok` derivation excludes `incompleteQueued > 0` | Warning | Tests pin contradictory ok=true + pending non-empty intuitions; downstream consumers may mark ROADMAP complete when retries are queued (WR-02). |
| agents/gsd-executor.md | 417 | Claims verb is "backend-opaque" while implementation is git-only | Warning | Misleading documentation; CR-01 makes the claim false (WR-03). |
| agents/gsd-executor.md | 421-427 | exit 1 on failure with no verb-payload dump, no cwd dump | Warning | Operators cannot triage CR-01-induced failures from the field (CR-04). |
| get-shit-done/workflows/quick.md | 670-675 | Plan JSON shape mismatch + non-numeric --phase + FATAL guard misses {ok:false} payload | Blocker | Silent zero-workspace dispatch (CR-02). |
| get-shit-done/workflows/quick.md | 668 | No empty/HEAD pre-check on EXPECTED_BRANCH before passing to --main-bookmark | Blocker | validateMainBookmark throws on empty, surfacing stack trace not clean recovery (CR-03). |
| get-shit-done/workflows/execute-phase.md | 530 | Same missing empty/HEAD pre-check on EXPECTED_BRANCH | Warning | Symmetric to quick.md gap; surfaces only on detached-HEAD scenarios in execute-phase. |
| sdk/src/vcs/jj/parallel.ts | 139-147 | derivePhaseRoot returns non-existent path; callers must mkdir -p but contract is split | Info | Forward-compat trap; appendIncomplete may throw ENOENT in production if phase dir not pre-materialized (WR-05). |
| get-shit-done/bin/gsd-tools.cjs | 985-993 | worktree case still exists as dispatcher target | Info | Deprecation-error path bypassed for subcommands other than cleanup-wave (WR-04). |
| get-shit-done/bin/lib/worktree-safety.cjs | 404-421 | reconstructHandleFromLegacyPlan: baselineOpId: undefined drops on JSON.stringify roundtrip | Info | Forward-compat trap (IN-01). |
| get-shit-done/bin/gsd-tools.cjs | 368-376 | TOP_LEVEL_USAGE help text doesn't mention new workspace.* surface | Info | --help drift (IN-02). |

### Human Verification Required

None identified. All gaps are observable from static analysis of the codebase.

### Gaps Summary

Phase 11 lands the structural collapse goal (-440 LOC raw-git from `execute-phase.md` and `quick.md`; four agent guards merged into one SDK call; `worktree-path-safety.md` renamed; `executeWorktreeWaveCleanupPlan` body shrunk). But the goal's "backend-opaque" core — the actual user-facing promise that subagent prompts never inspect backend kind — is non-functional on the jj backend:

1. **CR-01 (BLOCKER):** `workspace-assert-dispatched-cwd.ts:57` does a realpath comparison against `WorkspaceInfo.path`, but the jj adapter's `parseJjWorkspaceList:49-53` populates that field with the workspace NAME (e.g. "default", "phase-11-subagent-1"), not an fs path. Every jj agent commit halts with FATAL. The 02-SUMMARY itself documents this as "documented backend asymmetry" but treats it as expected — it isn't. SC-1's "backend-opaquely" clause is violated.

2. **CR-02 (BLOCKER):** `quick.md:670-675` builds a wrong-shape plan JSON (`{plans:[{id,planFile}]}` instead of `[{agentId,planId}]`), passes a non-numeric `--phase "quick"` (the verb returns `{ok:false, reason:'phase_number_required'}` for any NaN phase), and the only FATAL guard checks for empty stdout — which the reason-payload doesn't trigger. Every quick task silently dispatches zero workspaces and reports success. Plan 06's own SUMMARY (line 95) acknowledges the `--phase "quick"` literal without flagging the verb-side rejection.

3. **CR-03 (BLOCKER):** Neither `quick.md` nor `execute-phase.md` pre-checks `$EXPECTED_BRANCH` for empty/"HEAD" before passing to `--main-bookmark`. `validateMainBookmark` (jj/parallel.ts:121-125) throws on empty strings, surfacing a stack trace to the user instead of a clean fail-loud guard.

4. **CR-04 (WARNING):** Agent's `exit 1` recovery emits only `isPrimary` + `workspaceName` — no cwd dump, no verb payload dump, no recovery instruction beyond a generic "cd into the workspace path the orchestrator passed". Combined with CR-01, jj agents will halt with diagnostically opaque output.

5. **WR-01 (WARNING):** D-01 declared the WAVE_WORKTREE_MANIFEST sidecar retired; `worktree-safety.cjs::reconstructHandleFromLegacyPlan` correctly sets `manifest:''`. But `sdk/src/vcs/jj/parallel.ts:232-245` still writes the sidecar to `mkdtemp` on every dispatch with no consumer. Contradicts the user's mental model that D-01 eliminated all sidecar state.

The cluster of related gaps shares one root cause: **the jj adapter's `WorkspaceInfo.path` is a workspace NAME, not an fs path**, and Phase 11 built consumers (the assert verb in particular) on the implicit assumption that `.path` was an fs path. The fix-shape choice is open (narrow on `vcs.kind`, or extend `WorkspaceInfo` with a guaranteed-absolute `workspacePath`), but until one lands, the Phase 11 collapse is git-only — exactly opposite the milestone's "Workflows never branch on `vcs.kind` for parallel-dispatch reasons" framing.

**Recommended planner action:** Group these into 2 closure plans —
1. **Plan A: jj-side assert-dispatched-cwd correctness.** Decide on the data-model fix (vcs.kind narrow vs WorkspaceInfo extension), implement, add a jj-colocated regression test that asserts `ok=true` from inside a non-primary jj workspace. Add the missing empty/HEAD pre-checks in both workflow files and the verb-payload dump in `gsd-executor.md`. Fixes CR-01, CR-03, CR-04 jointly.
2. **Plan B: quick.md dispatch correctness.** Build a valid plan-array JSON; choose a numeric-phase sentinel for quick mode (or widen the verb); add the OK-guard against `{ok:false}` payload; add an N=1 regression test that asserts `.workspaces[]` is non-empty after dispatch. Fixes CR-02.

WR-01 (manifest write) and the other warnings can be grouped into a third cleanup pass once the blockers close, or absorbed into Plan A/B as opportunistic fixes.

---

_Verified: 2026-05-16T12:05:00Z_
_Verifier: Claude (gsd-verifier)_
