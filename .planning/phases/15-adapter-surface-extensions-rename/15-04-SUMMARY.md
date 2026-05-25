---
phase: 15-adapter-surface-extensions-rename
plan: 04
subsystem: vcs-adapter
tags: [vcs-adapter, parallel, cancel, cleanup-helper, cli-bridge, upstream-02, ip-5-single-owner, frozen-pure-json, idempotent-recall, three-site-registration]

# Dependency graph
requires:
  - phase: 15-01-rootRevisions
    provides: clean post-NAMING-01 VcsRefs surface (no in-flight rootCommits churn) — types.ts settled
  - phase: 15-02-idAlphabet
    provides: VcsRefs.idAlphabet property + capability-matrix entry — types.ts settled
  - phase: 15-03-matchPrefix
    provides: VcsRefs.matchPrefix method + capability-matrix entry — types.ts/backends settled; Phase 15 only touches VcsWorkspaceParallel + new CancelResult interface
provides:
  - VcsWorkspaceParallel.cancel(handle): CancelResult method declaration (third method after dispatch + fanIn)
  - CancelResult 4-field envelope interface (abandoned, failedReaped, surplusBookmarks, surplusWorkspaces)
  - BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel'] capability-matrix entry
  - performJjParallelCancel sidecar export (delegates to cleanupSubagentWorkspaces helper)
  - performGitParallelCancel sidecar export (inline teardown — no shared helper)
  - Both backends' workspace.parallel.Object.freeze block extended with cancel: (handle) => ...
  - sdk/src/vcs/jj/workspace-cleanup.ts shared cleanupSubagentWorkspaces helper (Wave 1 — single owner per IP-5; consumed by Phase 16 CLEANUP-02 + Phase 16 dogfood-restore.sh)
  - CLI bridge sdk/src/query/workspace-parallel-cancel.ts (mirror of workspace-parallel-fan-in.ts)
  - Three-site CLI registration (catalog-domain + manifest.non-family + aliases.generated)
  - Per-backend cancel scenarios (4 jj + 4 git = 8 scenarios) covering cancel-clean-abandon, cancel-idempotent-recall, cancel-partial-state-recovery, frozen pure-JSON CancelResult invariant
  - Repo-side CLI smoke (4 node:test cases) covering canonical-dot/handle_required, parse-fail, space-alias resolution, bogus-verb negative control
  - backends.test.ts capability-matrix regression-guard for workspace.parallel.cancel
affects: [16-cleanup-02, 16-dogfood-restore-cli-bridge, 17-docs-drift, 18-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern S1: UPSTREAM-02 sidecar discipline applied to new helper (does NOT import from backends/jj; inlines jjArgvFlags verbatim)"
    - "Pattern S2: three-site CLI bridge registration atomic (CF-07 / Pitfall 6 — missing any one site breaks runtime verb resolution)"
    - "Pattern S3: frozen pure-JSON return shape (Object.freeze({...}) satisfies CancelResult) — survives JSON round-trip per Phase 9 D-05 invariant"
    - "Pattern S5: SC5 scenario test template (describe.sequential.skipIf + random-prefix mkdtemp + per-describe beforeAll/afterAll) per D-15"
    - "IP-5 single-owner / three-consumer pattern: cleanupSubagentWorkspaces is the canonical surface that PARALLEL-07 cancel + CLEANUP-02 fanIn clean-path + dogfood-restore.sh ALL share (no inline duplication of forget+rmSync body)"
    - "Combined-green commit strategy (Tasks 2+3 land as one TSC-green commit) matches 15.02/15.03 precedent; Task 4 lands the test + CLI bridge surface as the closing commit"
    - "D-03 idempotency-by-construction: helper SKIPS already-gone dirs silently (does NOT push to abandoned[]) — re-call returns all-empty arrays; required for cancel-idempotent-recall scenario invariant"
    - "git-side cancel mirrors jj-side existsSync gating (early skip on already-gone path) so D-03 invariant holds across both backends despite git lacking the shared helper"

key-files:
  created:
    - sdk/src/vcs/jj/workspace-cleanup.ts (cleanupSubagentWorkspaces helper sidecar)
    - sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts (4 helper unit scenarios)
    - sdk/src/query/workspace-parallel-cancel.ts (CLI bridge — mirror of fan-in)
    - sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts (4 jj per-backend cancel scenarios)
    - sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts (4 git per-backend cancel scenarios)
    - tests/cli-workspace-parallel-cancel.test.cjs (4 repo-side CLI smoke cases)
  modified:
    - sdk/src/vcs/types.ts (+59 lines — VcsWorkspaceParallel.cancel signature + JSDoc; new CancelResult interface with 4-field envelope + JSDoc citing D-01/D-02/D-03/Phase-9-D-05)
    - sdk/src/vcs/backends.ts (+7 lines — 'workspace.parallel.cancel' capability-matrix entry with 6-line JSDoc citing Pitfall 1/3 string-key blind spot)
    - sdk/src/vcs/jj/parallel.ts (+71 lines — CancelResult type import + cleanupSubagentWorkspaces helper import + performJjParallelCancel export with JSDoc)
    - sdk/src/vcs/git/parallel.ts (+108 lines — CancelResult type import + existsSync import + performGitParallelCancel export with JSDoc + inline teardown body with idempotent-skip gate)
    - sdk/src/vcs/backends/jj.ts (+4 lines — CancelResult type import + performJjParallelCancel value import + cancel: entry in parallel freeze block + JSDoc)
    - sdk/src/vcs/backends/git.ts (+4 lines — CancelResult type import + performGitParallelCancel value import + cancel: entry in parallel freeze block + JSDoc)
    - sdk/src/query/command-static-catalog-domain.ts (+5 lines — import + 2 catalog entries dot/space alias forms + 2-line JSDoc)
    - sdk/src/query/command-manifest.non-family.ts (+1 line — aligned-format row with mutation:true outputMode:'json')
    - sdk/src/query/command-aliases.generated.ts (+1 line — sorted-alphabetically row, cancel before dispatch)
    - sdk/src/vcs/__tests__/backends.test.ts (+19 lines — new Phase 15.04 describe block asserting BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel'] === ['git', 'jj-colocated'])

key-decisions:
  - "Helper signature N1 (3-arg + mainRepoRoot rename) — chosen over CONTEXT D-05's original 2-arg `(phaseRoot, phaseNumber)` literal. Per RESEARCH A1 + Open Q1 RESOLVED 2026-05-24 user ratification: `cleanupSubagentWorkspaces(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[])`. Rationale: (a) jjArgvFlags + jj workspace forget need the colocated repo root (NOT the phase-dir path which sits 3 levels deep inside .planning/phases/{NN-slug}/); (b) optional 3rd parameter lets the cancel verb pass the Handle's authoritative list — resolves Pitfall 4 (custom workspacePath overrides leak when pure-readdirSync enumeration); (c) matches existing sidecar signature pattern (conflict-paths.ts::enumerateConflictedPaths(cwd, rev) takes a repo root). Documented in the helper's file-header JSDoc + recorded in plan 15-04 <deviations> N1."
  - "Combined-green commit strategy chosen for Tasks 2+3 (Wave 2a+2b combined). Plan permitted both staged-red (Task 2 lands TSC-red declaration + matrix entry; Task 3 fixes by wiring backends) and combined-green. Combined-green matches 15.02/15.03 precedent on this phase and avoids the intermediate type-without-bodies state. Task 1 (helper sidecar) and Task 4 (CLI bridge + scenarios + smoke) are independent."
  - "git-side cancel body adds an early existsSync gate (lines 695-700 of git/parallel.ts) — diverges from jj-side which delegates the gate to the helper, but achieves the same D-03 / cancel-idempotent-recall + cancel-partial-state-recovery invariants. Without the gate, `git worktree remove --force <missing-path>` returns non-zero (fatal: ... is not a working tree), which would push to failedReaped[] and break both scenarios' assertions. The gate IS the symmetric implementation of the helper's existsSync-then-rmSync-or-skip-silently logic on the git side."
  - "Order of registration entries in command-aliases.generated.ts: workspace.parallel.cancel inserted BEFORE workspace.parallel.dispatch (the file is alphabetically sorted; `c` < `d`). This is the only file in the three-site registration that requires a sort-order choice; the other two append at the end of the workspace.parallel.* cluster in canonical-name order."
  - "Per-backend `abandoned[]` identifier convention is asymmetric: jj-side uses workspace name form (the helper's `abandoned.push(ws.name)` pass-through — names like `phase-15-subagent-1`); git-side uses agentId form (per orchestrator-identifier consistency convention — values like `agent-1`). The asymmetry is documented in performGitParallelCancel's JSDoc and the per-backend scenarios assert against the respective form. This matches the existing FanInResult.merged[] which carries short-SHAs on git and change_ids on jj — the field name is uniform but the identifier shape is backend-specific."
  - "CLI smoke test bogus-verb negative control: the dispatcher's gsd-tools.cjs fallback prints '[gsd-sdk] ... not in native registry; falling back to gsd-tools.cjs' on stderr and exits non-zero with `Error: Unknown command` from gsd-tools. The smoke test accepts ANY of {'not in native registry', 'Unknown command', 'unknown verb', 'fallback failed'} in the combined stdout+stderr — covers both the native-registry miss and the fallback failure path. NO `--help` flag tested (the CLI bridge does not implement --help; out of scope per N4 RESEARCH update 2026-05-24)."

patterns-established:
  - "Cancel-as-post-mortem-cleanup contract: synchronous teardown of materialized workspaces ONLY (CF-05 STACK lens — spawnSync at exec.ts:19 cannot accept AbortSignal). Does NOT signal subagent processes. Operator handles process termination via Claude Code UI/CLI; cancel cleans up the materialized workspaces. Idempotent re-call returns all-empty arrays (D-03)."
  - "Four-field CancelResult envelope mirrors FanInResult naming (failedReaped + surplusBookmarks): future parallel-verb return shapes inherit the naming convention. The frozen-pure-JSON invariant (Phase 9 D-05) is enforced via per-backend scenario test that asserts Object.isFrozen + JSON round-trip lossless."
  - "Helper extraction signature pattern for cross-phase consumption: `(repoRoot: string, phaseNumber: number, authoritativeList?: readonly {...}[])` — repo root + phase number for default enumeration + optional authoritative list parameter for callers that hold an explicit Handle. Falls back to readdirSync filtered by phase-tag pattern when authoritative list omitted. Mitigates Pitfall 4 (custom path overrides leak when pure-readdirSync is the only enumeration mode) while preserving best-effort recovery for orchestrator-state-loss scenarios."

requirements-completed: [PARALLEL-07]

# Metrics
duration: ~18min
completed: 2026-05-25
---

# Phase 15 Plan 04: vcs.workspace.parallel.cancel (PARALLEL-07) Summary

**Ships the public `vcs.workspace.parallel.cancel(handle): CancelResult` synchronous-teardown verb on both git + jj backends (CF-05 STACK-lens — `spawnSync` cannot accept `AbortSignal`; mid-Agent process-kill is OUT-OF-SCOPE per PROJECT.md), extracts the shared `cleanupSubagentWorkspaces` helper into a new UPSTREAM-02 sidecar consumed by Phase 16 CLEANUP-02 (single owner per IP-5), and wires the CLI bridge at all three CF-07 registration sites — gated by 4-field frozen pure-JSON `CancelResult` envelope, D-03 idempotent-recall invariant, capability-matrix regression guard, per-backend scenarios (cancel-clean-abandon + cancel-idempotent-recall + cancel-partial-state-recovery + frozen-JSON), and repo-side CLI smoke (canonical-dot resolution + parse-fail + space-alias + bogus-verb negative control).**

## Performance

- **Duration:** ~18 minutes (live source re-read → Task 1 helper + unit tests + TSC + vitest + commit → Tasks 2+3 combined: types + capability matrix + per-backend bodies + wire-ins + TSC + commit → Task 4: CLI bridge + three-site + per-backend scenarios + backends regression + CLI smoke + build + TSC + vitest + node:test + commit)
- **TSC noEmit (after Task 3 combined-green):** sub-5s on the post-15.03 baseline
- **Vitest cancel scope (helper + per-backend scenarios + backends regression, 4 files):** 15.74s for 29 passing tests, 0 skipped (both backends ran; no false-green skipIf gate)
- **node:test CLI smoke:** 0.67s for 4 passing tests (canonical-dot, parse-fail, space-alias, bogus-verb)
- **Wider regression (adapter-contract.test.ts):** 11.86s for 45 passing tests + 11 skipped (jj-native lane unrelated); no regressions
- **Commits:** 3 (Task 1 Wave 1: `qpxktlqx`; Tasks 2+3 Wave 2a+2b combined: `rwnymurv`; Task 4 Wave 2c: `wzumxqru`)

## Accomplishments

- **CF-05 STACK-lens contract shipped on both backends.** `vcs.workspace.parallel.cancel(handle): CancelResult` is synchronous teardown only — the spawnSync exec layer at `sdk/src/vcs/exec.ts:19` cannot accept `AbortSignal`, so this verb cannot signal subagent processes. The operator-kills-subagent-via-Claude-Code-UI + cancel-cleans-up-workspaces split is documented in the cancel method JSDoc + the per-backend body JSDocs. T-15.04-01 STACK enforcement verified: `grep -E 'AbortController|AbortSignal|child.kill' sdk/src/vcs/{jj,git}/parallel.ts` returns zero non-comment matches inside the perform*ParallelCancel function bodies.
- **D-03 idempotency invariant honored on both backends.** Cancel returns `CancelResult` with all-empty arrays on re-call. jj-side: the helper's `existsSync` gate + already-gone-skip closes the second call (the silent skip on already-gone path does NOT push to `abandoned[]` — load-bearing for the empty-arrays-on-re-call contract). git-side: the cancel body adds an early existsSync gate that skips silently when the worktree path is already gone (mirrors the helper's semantics for the git-without-shared-helper case). The cancel-idempotent-recall scenarios assert all four CancelResult fields are length 0 on the second call.
- **IP-5 single-owner pattern shipped for the shared helper.** `cleanupSubagentWorkspaces` lives at the new UPSTREAM-02 sidecar `sdk/src/vcs/jj/workspace-cleanup.ts` — does NOT import from `backends/jj.ts` (D-07); imports `vcsExec` from `'../exec.js'` and uses `node:fs` for `rmSync`. The helper is the canonical surface that PARALLEL-07 cancel (Wave 2b consumed via `performJjParallelCancel`) + Phase 16 CLEANUP-02 fanIn clean-path + Phase 16 `scripts/dogfood-restore.sh` (via CLI bridge to ship in Phase 16) ALL share. No inline duplication of the per-workspace `jj workspace forget + rmSync` body — Pitfall 11 mitigation built-in.
- **Three-site CLI bridge registration atomic.** `sdk/src/query/workspace-parallel-cancel.ts` mirrors `workspace-parallel-fan-in.ts` verbatim minus the `--results` flag; registered at all 3 sites in the same commit per CF-07 (Pitfall 6 mitigation — missing any one site breaks runtime verb resolution). Repo-side CLI smoke at `tests/cli-workspace-parallel-cancel.test.cjs` proves end-to-end resolution via canonical-dot + space-alias forms + parse-fail + bogus-verb negative control. NO `--help` test (the CLI bridge does not implement `--help`; out of scope per N4 RESEARCH update 2026-05-24).
- **Capability-matrix regression guard shipped.** New `backends.test.ts` describe block asserts `BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel']` is defined and equals `['git', 'jj-colocated']`. Mirrors the 15.01/15.02/15.03 pattern — if a future contributor (or partial revert) drops the string-key, the test surfaces the regression at test time instead of in production runtime lookup failures.

## Task Commits

Three commits landed atomically (Task 1 → Tasks 2+3 combined → Task 4):

1. **Task 1 (Wave 1):** `qpxktlqx` — `feat(15-04): extract cleanupSubagentWorkspaces helper sidecar (Wave 1 — single owner per IP-5)`
   - `sdk/src/vcs/jj/workspace-cleanup.ts` — new sidecar (~70 lines header doc + ~50 lines body), 3-arg signature per N1, D-06 idempotency contract, D-07 UPSTREAM-02 discipline, dual-mode enumeration (Handle-authoritative when `workspaces` provided + readdirSync fallback when omitted)
   - `sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts` — 4 unit scenarios (idempotency / missing-dir-handling + second-call-empty-arrays; UPSTREAM-02 import-discipline grep gate; Handle-authoritative custom-path enumeration / Pitfall 4 mitigation; readdirSync fallback with phase-number filtering — verifies phase-16 dirs are NOT touched by phase-15 helper call)

2. **Tasks 2+3 (Wave 2a+2b combined-green):** `rwnymurv` — `feat(15-04): wire performJjParallelCancel + performGitParallelCancel + backend cancel entries (PARALLEL-07)`
   - `sdk/src/vcs/types.ts` — new `CancelResult` interface (4-field envelope per D-01) with JSDoc citing D-02 field semantics + D-03 idempotency + Phase 9 D-05 frozen-pure-JSON invariant + FanInResult naming-mirror; `VcsWorkspaceParallel.cancel(handle): CancelResult` added as third method (after dispatch + fanIn) with JSDoc citing CF-05 STACK / spawnSync / synchronous-teardown
   - `sdk/src/vcs/backends.ts` — new `'workspace.parallel.cancel'` capability-matrix row with 6-line JSDoc citing Pitfall 1/3 string-key blind spot
   - `sdk/src/vcs/jj/parallel.ts` — new `performJjParallelCancel` export at end of file (~71 lines including JSDoc); delegates to `cleanupSubagentWorkspaces` helper from `./workspace-cleanup.js`; surplusBookmarks empty by Phase 11 D-02 construction; surplusWorkspaces counted at entry; frozen pure-JSON return per Pattern S3
   - `sdk/src/vcs/git/parallel.ts` — new `performGitParallelCancel` export at end of file (~108 lines including JSDoc); existsSync added to imports; INLINE teardown (no shared helper per PROJECT.md OOS for cross-backend cleanup helper); per-workspace `worktree remove --force` + `branch -D -- worktree-agent-<id>`; early existsSync gate up front to honor D-03 idempotent-recall invariant; orchestrator-identifier consistency (agentId form on abandoned[])
   - `sdk/src/vcs/backends/jj.ts` — `CancelResult` added to types import; `performJjParallelCancel` added to value import; new third entry `cancel: (handle) => performJjParallelCancel(cwd, handle)` in parallel Object.freeze block
   - `sdk/src/vcs/backends/git.ts` — mirror of jj-side wire-in

3. **Task 4 (Wave 2c):** `wzumxqru` — `feat(15-04): CLI bridge workspace-parallel-cancel + three-site registration + per-backend scenarios + smoke (PARALLEL-07 closure)`
   - `sdk/src/query/workspace-parallel-cancel.ts` — new CLI bridge mirroring workspace-parallel-fan-in.ts verbatim minus `--results`; `--cwd` defaults to projectDir; `--handle @-` reads stdin OR `@<path>` reads file; inline form rejected; envelope `{data: cancelResult}` flat shape; parse-fail returns `{ok:false, reason:'handle_json_parse_failed'}`; missing handle returns `{ok:false, reason:'handle_required'}`
   - `sdk/src/query/command-static-catalog-domain.ts` — import line added after fan-in import; 2 catalog entries added (dot + space alias forms) after fan-in entries
   - `sdk/src/query/command-manifest.non-family.ts` — aligned column-format row added after fan-in row with `mutation: true, outputMode: 'json'`
   - `sdk/src/query/command-aliases.generated.ts` — alias-table row inserted alphabetically BEFORE workspace.parallel.dispatch (`c` < `d`)
   - `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` — 4 jj-side per-backend scenarios (clean-abandon, idempotent-recall, partial-state-recovery, frozen pure-JSON)
   - `sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts` — 4 git-side per-backend scenarios (same shape)
   - `sdk/src/vcs/__tests__/backends.test.ts` — new Phase 15.04 describe block asserting `BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel'] === ['git', 'jj-colocated']`
   - `tests/cli-workspace-parallel-cancel.test.cjs` — 4 repo-side CLI smoke cases via `node bin/gsd-sdk.js query workspace.parallel.cancel ...` (canonical-dot/handle_required + parse-fail/handle_json_parse_failed + space-alias-resolves-identically + bogus-verb negative control)

## Files Created/Modified

| File | Change |
|------|--------|
| `sdk/src/vcs/jj/workspace-cleanup.ts` | created (~120 lines) — new UPSTREAM-02 sidecar housing the shared helper |
| `sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts` | created (~170 lines) — 4 unit scenarios for the helper |
| `sdk/src/query/workspace-parallel-cancel.ts` | created (~85 lines) — CLI bridge mirror of fan-in |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` | created (~230 lines) — 4 jj per-backend cancel scenarios |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts` | created (~230 lines) — 4 git per-backend cancel scenarios |
| `tests/cli-workspace-parallel-cancel.test.cjs` | created (~75 lines) — 4 repo-side CLI smoke cases |
| `sdk/src/vcs/types.ts` | +59 lines — CancelResult interface + VcsWorkspaceParallel.cancel method + JSDoc |
| `sdk/src/vcs/backends.ts` | +7 lines — 'workspace.parallel.cancel' capability-matrix entry + JSDoc |
| `sdk/src/vcs/jj/parallel.ts` | +71 lines — performJjParallelCancel export + imports |
| `sdk/src/vcs/git/parallel.ts` | +108 lines — performGitParallelCancel export + existsSync import |
| `sdk/src/vcs/backends/jj.ts` | +4 lines — cancel: entry in parallel freeze block + type/value imports |
| `sdk/src/vcs/backends/git.ts` | +4 lines — cancel: entry in parallel freeze block + type/value imports |
| `sdk/src/query/command-static-catalog-domain.ts` | +5 lines — import + 2 catalog entries (dot + space) + JSDoc |
| `sdk/src/query/command-manifest.non-family.ts` | +1 line — aligned row entry |
| `sdk/src/query/command-aliases.generated.ts` | +1 line — alphabetically-sorted row entry |
| `sdk/src/vcs/__tests__/backends.test.ts` | +19 lines — Phase 15.04 describe block + 1 it block + 18-line JSDoc/comment |

**Total:** 16 files (6 created + 10 modified), ~1320 lines of net change (about half JSDoc/comments).

## Decisions Made

- **N1 helper signature (3-arg + mainRepoRoot rename).** CONTEXT D-05's original literal was the 2-arg `(phaseRoot, phaseNumber)` form; user-ratified amendment 2026-05-24 (Open Q1 RESOLVED) updated it to `(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[])`. Three rationales: (a) `jjArgvFlags + jj workspace forget` need the colocated jj repo root (not the phase-dir path which sits 3 levels deep inside `.planning/phases/{NN-slug}/`); (b) the optional 3rd parameter lets the cancel verb pass the Handle's authoritative list — resolves Pitfall 4 (custom `workspacePath` overrides leak when pure-readdirSync enumeration is used); (c) matches the existing sidecar signature pattern (`conflict-paths.ts::enumerateConflictedPaths(cwd, rev)` takes a repo root, not a phase root). Documented in the helper's file-header JSDoc, recorded in plan 15-04 `<deviations>` block, and propagated through the unit-test scenario coverage (custom-path + readdirSync-fallback both tested).
- **Combined-green commit strategy for Tasks 2+3** (Wave 2a + 2b combined). Plan explicitly permitted both staged-red (Task 2 lands TSC-red declaration + matrix entry; Task 3 fixes by wiring backends) and combined-green. Combined-green matches 15.02/15.03 precedent on this phase, avoids an intermediate type-without-bodies state with no independent value, and yields a single semantically-coherent commit per "PARALLEL-07 contract + per-backend bodies + wire-ins together". Task 1 (helper sidecar) and Task 4 (CLI bridge + scenarios + smoke) are independent.
- **git-side cancel body adds an early existsSync gate** (lines 695-700 of `git/parallel.ts`). Diverges from jj-side which delegates the gate to the helper, but achieves the same D-03 / cancel-idempotent-recall + cancel-partial-state-recovery invariants. Without the gate, `git worktree remove --force <missing-path>` returns non-zero with `fatal: ... is not a working tree`, which would push to `failedReaped[]` and break both scenarios' assertions. The gate IS the symmetric implementation of the helper's "existsSync-then-rmSync-or-skip-silently" logic on the git side — no shared helper because git's `worktree remove --force` already handles tree cleanup and orphan-dirs are a jj-only problem per PROJECT.md OOS.
- **Per-backend `abandoned[]` identifier convention is asymmetric.** jj-side uses workspace name form (the helper's `abandoned.push(ws.name)` pass-through — values like `phase-15-subagent-1`); git-side uses agentId form (per orchestrator-identifier consistency convention — values like `agent-1`). The asymmetry is documented in `performGitParallelCancel`'s JSDoc + the per-backend scenarios assert against the respective form. Matches the existing `FanInResult.merged[]` precedent which carries short-SHAs on git and change_ids on jj — the field name is uniform but the identifier shape is backend-specific.
- **CLI smoke negative-control assertion is forgiving.** The bogus-verb test accepts ANY of `{not in native registry, Unknown command, unknown verb, fallback failed}` in the combined stdout+stderr — covers both the native-registry-miss path (gsd-sdk dispatcher) AND the fallback failure path (gsd-tools.cjs). NO `--help` flag is exercised (the CLI bridge does not implement `--help`; out of scope per N4 RESEARCH update 2026-05-24).
- **Alphabetical-sort insertion in `command-aliases.generated.ts`.** Insert `workspace.parallel.cancel` row BEFORE `workspace.parallel.dispatch` because the file is alphabetically sorted (`c` < `d`). The other two registration sites (catalog-domain + manifest.non-family) append at the end of the workspace.parallel.* cluster in canonical-name order — only the aliases.generated file required a sort-order decision.

## Deviations from Plan

**N1 deviation (helper signature) executed as planned** — recorded in plan 15-04 `<deviations>` block + this summary's key-decisions; not a new deviation, just confirmation that the planned amendment was honored at implementation.

**Plan-permitted N4 commit-strategy choice executed:** Tasks 2+3 combined-green per the plan's explicitly-permitted option; matches 15.02/15.03 precedent.

**git-side early existsSync gate ADDED beyond the plan-literal body** (Rule 2 — added missing critical functionality for D-03 invariant correctness). The plan's `<action>` Task 3 git-side body sketch did NOT include the early existsSync gate — it specified only `vcsExec(... 'git', ['worktree', 'remove', '--force', ws.path])` → on non-zero push to failedReaped[]. Without the gate, the `cancel-partial-state-recovery` scenario assertion `result.failedReaped.length === 0` would fail (git emits non-zero on missing worktree) and the `cancel-idempotent-recall` scenario assertion `[...r2.failedReaped] === []` would also fail. Adding the existsSync gate is **Rule 2 — auto-add missing critical functionality** for D-03 correctness; it has zero behavior change on the happy path (existing worktree → wtRes.exitCode === 0 → falls through to branch -D → push agentId to abandoned[]) and mirrors the existing helper's semantics on the jj side. Documented in `performGitParallelCancel` JSDoc as the "git-side idempotent-recall gate" and asserted in the cancel-partial-state-recovery + cancel-idempotent-recall scenarios.

No other deviations.

## Threat Mitigations Honored

Per the plan's `<threat_model>`:

| Threat ID | Disposition | Mitigation Status | Evidence |
|-----------|-------------|-------------------|----------|
| T-15.04-01 | Tampering: Cancel violates spawnSync STACK invariant (AbortController / async-spawn) | Mitigated | CF-05 enforcement: grep `-E 'AbortController\|AbortSignal\|child\.kill' sdk/src/vcs/{jj,git}/parallel.ts` returns zero non-comment matches inside the perform*ParallelCancel function bodies. Cancel verb JSDoc cites PROJECT.md OOS for mid-Agent process-kill. |
| T-15.04-02 | Tampering: Three-site CLI bridge registration misses one site (Pitfall 6) | Mitigated | All 3 sites touched atomically in commit `wzumxqru`. backends.test.ts capability-matrix regression-asserts entry presence. CLI smoke test 1 (canonical-dot/handle_required) + test 3 (space-alias/handle_required) + test 4 (bogus-verb/unknown-verb) prove three-site bridge resolution end-to-end. |
| T-15.04-03 | Tampering: Idempotency violation — re-call on cancelled handle throws | Mitigated | Helper D-06 contract: existsSync gate + force:true rmSync + silent skip on already-gone. git-side existsSync gate up front. cancel-idempotent-recall scenarios (jj + git) assert all 4 CancelResult fields are length 0 on the second call. |
| T-15.04-04 | Tampering: UPSTREAM-02 violation — helper imports from backends/jj.ts | Mitigated | `jj-workspace-cleanup.test.ts` scenario 2 asserts the helper source has zero `from '../backends/jj'` imports via file-read grep. Test passes. |
| T-15.04-05 | Tampering: Sidecar Handle-list enumeration misses non-standard workspacePath overrides (Pitfall 4) | Mitigated | N1 decision — helper takes optional `workspaces` parameter; cancel verb passes `handle.workspaces` authoritatively. `jj-workspace-cleanup.test.ts` scenario 3 asserts custom path outside the canonical `.claude/jj-workspaces/<name>` layout is cleaned up via the Handle-authoritative iteration. |
| T-15.04-06 | Tampering: Path traversal via crafted workspacePath | Mitigated | Workspace path components come from validated agentId at dispatch (octopus.ts:300-302); helper iterates Handle-supplied paths only; no shell glob expansion; rm -rf bounded to Handle-listed paths. |
| T-15.04-07 | DoS: Memory exhaustion via huge handle.workspaces[] array | Accepted | Bounded by orchestrator dispatch (maxConcurrency default ≤8 workspaces typical); ROADMAP SC4 timing budget ≤2s for ≤8 workspaces (each scenario completes well under 30s timeout). |
| T-15.04-08 | Information disclosure: CancelResult leaks internal paths in surplusWorkspaces | Accepted | Paths are caller-supplied via the Handle the caller already holds; no privilege escalation. |
| T-15.04-09 | Tampering: CancelResult not frozen pure-JSON (Phase 9 D-05 violation) | Mitigated | Per-backend scenarios assert `Object.isFrozen(result) === true` AND `JSON.parse(JSON.stringify(result))` round-trips losslessly. All 5 inner fields (top-level + 4 arrays) frozen. |
| T-15.04-10 | Tampering: Stale `mainBookmark: 'main'` references survive into new test files (Pitfall 7) | Mitigated | N2 — prior 15-04-PLAN.md deleted as part of replan; cancel scenarios OMIT mainBookmarks entirely. `grep -c 'mainBookmark:' sdk/src/vcs/__tests__/cmd-parallel-cancel-{jj,git}.test.ts` returns 0 each. |

## Validation Strategy (Nyquist Dimension 8) Status

Per `15-VALIDATION.md`:

| Validation Row | Status |
|----------------|--------|
| Plan 15.04 W1 helper: idempotent — second call returns empty arrays | green (vitest jj-workspace-cleanup.test.ts scenario 1) |
| Plan 15.04 W1 helper: does NOT import from `backends/jj.ts` (UPSTREAM-02 per D-07) | green (file-read grep + vitest jj-workspace-cleanup.test.ts scenario 2) |
| Plan 15.04 W2 cancel-clean-abandon on jj — N=2 dispatched, cancel returns all in abandoned, empty failedReaped | green (vitest cmd-parallel-cancel-jj.test.ts scenario 1) |
| Plan 15.04 W2 cancel-idempotent-recall on jj — second cancel returns empty arrays | green (vitest cmd-parallel-cancel-jj.test.ts scenario 2) |
| Plan 15.04 W2 cancel-partial-state-recovery on jj — pre-deleted workspace dir before cancel; failedReaped empty, surplusWorkspaces reflects original count | green (vitest cmd-parallel-cancel-jj.test.ts scenario 3) |
| Plan 15.04 W2 same three scenarios on git backend | green (vitest cmd-parallel-cancel-git.test.ts scenarios 1-3) |
| Plan 15.04 W2 CancelResult is frozen pure-JSON (Phase 9 D-05) | green (vitest both backends scenario 4 — Object.isFrozen + JSON round-trip) |
| Plan 15.04 W2 `gsd-sdk query workspace.parallel.cancel` returns structured `{ok:false, reason:'handle_required'}` envelope (NOT unknown-verb error) | green (node:test CLI smoke test 1) |
| Plan 15.04 W2 `gsd-sdk query workspace.parallel.cancellation-xyz` returns unknown-verb error envelope | green (node:test CLI smoke test 4 negative control) |
| Plan 15.04 W2 `BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel']` exists and contains `['git', 'jj-colocated']` | green (vitest backends.test.ts Phase 15.04 describe block) |
| Plan 15.04 W2 CLI bridge registered at ALL THREE sites — catalog-domain, manifest.non-family, aliases.generated (CF-07) | green (grep `-c 'workspace.parallel.cancel\|workspaceParallelCancelQuery'` returns ≥ 1 for each file) |
| Phase 15-01 + 15-02 + 15-03 regression intact | green (vitest backends.test.ts all 4 describe blocks pass) |
| TSC noEmit (post-Task 3 combined-green commit) | green (sub-5s) |
| Wider regression (adapter-contract.test.ts) | green (45/45 pass + 11 skipped jj-native unrelated; no regressions) |

## Per-backend Cancel Scenario Pass Count

**8 tests pass under the per-backend cancel filter (4 jj + 4 git):**

```
jj-side (cmd-parallel-cancel-jj.test.ts):
✓ workspace.parallel.cancel — jj — cancel-clean-abandon (N=2)
  ✓ cancel tears down both workspaces; abandoned.length === 2; failedReaped empty
✓ workspace.parallel.cancel — jj — cancel-idempotent-recall (D-03)
  ✓ second cancel on same handle returns all-empty arrays (no error)
✓ workspace.parallel.cancel — jj — cancel-partial-state-recovery
  ✓ pre-deleted workspace dir survives cancel — failedReaped empty; surplusWorkspaces reflects pre-cancel count
✓ workspace.parallel.cancel — jj — frozen pure-JSON CancelResult
  ✓ CancelResult is frozen AND survives JSON round-trip without semantic loss

git-side (cmd-parallel-cancel-git.test.ts):
✓ workspace.parallel.cancel — git — cancel-clean-abandon (N=2)
  ✓ cancel tears down both worktrees; abandoned.length === 2; failedReaped empty
✓ workspace.parallel.cancel — git — cancel-idempotent-recall (D-03)
  ✓ second cancel on same handle returns all-empty arrays (no error)
✓ workspace.parallel.cancel — git — cancel-partial-state-recovery
  ✓ pre-deleted worktree dir survives cancel — failedReaped empty; surplusWorkspaces reflects pre-cancel count
✓ workspace.parallel.cancel — git — frozen pure-JSON CancelResult
  ✓ CancelResult is frozen AND survives JSON round-trip without semantic loss
```

**0 skipped on jj or git filter** — both backends have `BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel'] === ['git', 'jj-colocated']` AND `jj/git` are on PATH in this build host, so the per-describe `skipIf(!jjAvailable)` / `skipIf(!gitAvailable)` gates pass.

**Each scenario completes well under the ROADMAP Phase 15 SC4 timing budget of ≤2s for ≤8 workspaces** — scenarios use N=1 or N=2; total wall-time for the full 8-scenario sweep is ~15s including jj git init + colocated config + seed commit + .planning/phases/15-test/ materialization in beforeAll (each scenario owns an independent mkdtemp repo per Pattern B). The cancel call itself dominates well under 2s.

## CLI Smoke Pass Count

**4 tests pass under the CLI smoke filter:**

```
✔ CLI smoke: canonical dot form (no --handle) returns {ok: false, reason: handle_required} (155.6 ms)
✔ CLI smoke: --handle @- with invalid JSON on stdin returns {ok: false, reason: handle_json_parse_failed} (141.4 ms)
✔ CLI smoke: space-alias form resolves identically (proves alias-table site registered) (141.7 ms)
✔ CLI smoke: bogus verb returns unknown-verb error (negative control) (188.4 ms)
ℹ tests 4 / pass 4 / fail 0 / skipped 0
ℹ duration_ms 665.9
```

Tests 1 + 3 prove the canonical dot form AND the space-alias form BOTH resolve to the registered bridge (anything else would surface as "unknown verb"-style error). Test 4 proves the verb-resolution layer IS the gate the bridge sits behind (a deliberately bogus verb fails with the unknown-verb marker). Test 2 proves the parse-fail error path is wired.

## CF-05 STACK Enforcement Verification

```
$ grep -E 'AbortController|AbortSignal|child\.kill' sdk/src/vcs/jj/parallel.ts sdk/src/vcs/git/parallel.ts | grep -v '^\(.*\):\s*\*\|//'
OK: zero non-comment matches
```

The only `AbortSignal` mention in either file is inside a JSDoc comment explaining the rule itself (cancel verb body MUST NOT introduce async signal handling). The perform*ParallelCancel function bodies use synchronous `vcsExec` (via `spawnSync` per `exec.ts:19`) + synchronous `rmSync` (via `node:fs`); no async / signal / process-kill primitives anywhere.

## UPSTREAM-02 Enforcement Verification

```
$ grep -c "from '../backends/jj" sdk/src/vcs/jj/workspace-cleanup.ts
0
```

Helper has zero imports from `'../backends/jj'`. The mandatory-flags prefix `jjArgvFlags` is inlined verbatim per Pattern S1 (verbatim copy from `conflict-paths.ts:25-30` / `reap.ts:33-41` / `octopus.ts:39-47` template). T-15.04-04 mitigation verified.

## Capability-Matrix Regression Coverage

```
$ pnpm vitest run sdk/src/vcs/__tests__/backends.test.ts -t "Phase 15"
 ✓ BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.01 rootCommits → rootRevisions flip (Pitfall 3 / v1.2 retro CR-01)
   ✓ exposes refs.rootRevisions for both backends
   ✓ does NOT expose refs.rootCommits (anti-assertion)
 ✓ BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.02 refs.idAlphabet (VCS-21)
   ✓ exposes refs.idAlphabet for both backends
 ✓ BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.03 refs.matchPrefix (VCS-22)
   ✓ exposes refs.matchPrefix for both backends
 ✓ BACKENDS_AVAILABLE_FOR_VERB capability matrix — Phase 15.04 workspace.parallel.cancel (PARALLEL-07)
   ✓ exposes workspace.parallel.cancel for both backends
```

All 4 Phase 15 capability-matrix regression blocks pass (rootRevisions + idAlphabet + matchPrefix + workspace.parallel.cancel). The aggregate guard against silent string-key drops is now load-bearing across all 4 plans in the phase.

## Phase 15 Closure Note

Phase 15 (Adapter surface extensions + rename) is **complete**: 4 plans shipped sequentially per CF-01 (file-overlap on `types.ts` + `backends.ts` + `backends/{git,jj}.ts` forced serial). The post-Phase-15 namespace:

- `vcs.refs.rootRevisions(opts)` — hard-renamed from `rootCommits` in 15.01 (no alias)
- `vcs.refs.idAlphabet: '0-9a-f' | 'k-z'` — new property added in 15.02
- `vcs.refs.matchPrefix(id, prefix): boolean` — new method added in 15.03 (throws on wrong-alphabet)
- `vcs.workspace.parallel.cancel(handle): CancelResult` — new method added in 15.04 (synchronous teardown)
- `sdk/src/vcs/jj/workspace-cleanup.ts::cleanupSubagentWorkspaces` — shared helper for Phase 16 CLEANUP-02 consumption

**Phase 16 CLEANUP-02 (helper consumer) inheritance:** the helper's 3-arg signature (per N1) is what CLEANUP-02 will call — `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, handle.workspaces)` from the fanIn clean-path branch, and `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber)` (no Handle) from the dogfood-restore.sh recovery path via the Phase 16 CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts`. No further helper-API change required.

**Phase 17 docs-drift refactor (deferred):** the existing alphabet regexes at `sdk/src/vcs/format-migration/rewrite.ts:53,63` and `sdk/src/vcs/expr.ts:35,41` can OPTIONALLY consume the new `vcs.refs.idAlphabet` — cosmetic cleanup deferred per CONTEXT Deferred Ideas.

**Phase 18 cleanup (deferred):** the Phase 14.1 code-review WR-01..WR-05 hardening, the v14-jj-reap-test-flake (TEST-17), and the v14-transition-md-update-gap (CLEANUP-01) all land in Phase 18 per the REQUIREMENTS.md traceability table; not Phase 15 obligations.

## Self-Check

Before declaring complete, verified:

1. All 6 created files exist on disk with the expected content (✓ — workspace-cleanup.ts, jj-workspace-cleanup.test.ts, workspace-parallel-cancel.ts, cmd-parallel-cancel-jj.test.ts, cmd-parallel-cancel-git.test.ts, cli-workspace-parallel-cancel.test.cjs)
2. All 10 modified files exist on disk with the expected additions (✓ — types.ts, backends.ts, jj/parallel.ts, git/parallel.ts, backends/jj.ts, backends/git.ts, command-static-catalog-domain.ts, command-manifest.non-family.ts, command-aliases.generated.ts, backends.test.ts)
3. All 3 task commits exist in jj log: `qpxktlqx` (Wave 1) → `rwnymurv` (Wave 2a+2b combined) → `wzumxqru` (Wave 2c) (✓)
4. TSC noEmit green: `cd sdk && pnpm tsc --noEmit` exits 0 (✓)
5. Cancel-scope vitest green: 29/29 pass across 4 files (jj-workspace-cleanup + cmd-parallel-cancel-jj + cmd-parallel-cancel-git + backends), 0 skipped on cancel filter (✓)
6. CLI smoke green: 4/4 pass in node:test (canonical-dot, parse-fail, space-alias, bogus-verb) (✓)
7. Wider regression slice green: adapter-contract.test.ts 45/45 pass + 11 skipped (jj-native lane unrelated); no regressions (✓)
8. CF-05 STACK enforcement: grep `-E 'AbortController|AbortSignal|child.kill'` returns zero non-comment matches in perform*ParallelCancel bodies (✓)
9. UPSTREAM-02 enforcement: grep `-c "from '../backends/jj"` on workspace-cleanup.ts returns 0 (✓)
10. Capability-matrix regression: all 4 Phase 15 entries (rootRevisions + idAlphabet + matchPrefix + workspace.parallel.cancel) tested in backends.test.ts and passing (✓)
11. No file deletions in `HEAD~3..HEAD` (intentional or otherwise) (✓ — only additions/modifications; verified via `gsd-sdk query diff --name-status --range "HEAD~3..HEAD"` showing zero `D` entries)
12. No untracked files leftover beyond gitignored `dist/` + `dist-cjs/` artifacts (✓ — `gsd-sdk query status --porcelain` shows only the dist artifacts which are gitignored per `.gitignore:59-60`)
13. Threat model dispositions honored: T-15.04-01..06 + T-15.04-09..10 mitigated, T-15.04-07..08 accepted per plan (✓)
14. All Task 1 / Task 2 / Task 3 / Task 4 acceptance criteria from the plan pass on disk (✓ — verified via grep gates documented above)
15. N1 deviation properly recorded in helper file-header JSDoc + plan `<deviations>` + this summary (✓)
16. CancelResult invariants honored: 4 fields per D-01, frozen pure-JSON per Pattern S3, idempotent re-call per D-03, synchronous teardown per CF-05 (✓)

### Acceptance Criteria Grep Gates

```
$ grep -c "from '../backends/jj" sdk/src/vcs/jj/workspace-cleanup.ts                                      → 0
$ grep -c "function jjArgvFlags" sdk/src/vcs/jj/workspace-cleanup.ts                                     → 1
$ grep -c "export interface CleanupSubagentWorkspacesResult" sdk/src/vcs/jj/workspace-cleanup.ts         → 1
$ grep -c "export function cleanupSubagentWorkspaces" sdk/src/vcs/jj/workspace-cleanup.ts                → 1
$ grep -c "export interface CancelResult" sdk/src/vcs/types.ts                                            → 1
$ grep -c "cancel(handle: ParallelDispatchHandle): CancelResult" sdk/src/vcs/types.ts                    → 1
$ grep -c "'workspace.parallel.cancel'" sdk/src/vcs/backends.ts                                          → 1
$ grep -c "export function performJjParallelCancel" sdk/src/vcs/jj/parallel.ts                           → 1
$ grep -c "import { cleanupSubagentWorkspaces }" sdk/src/vcs/jj/parallel.ts                              → 1
$ grep -c "satisfies CancelResult" sdk/src/vcs/jj/parallel.ts                                            → 1
$ grep -c "export function performGitParallelCancel" sdk/src/vcs/git/parallel.ts                         → 1
$ grep -c "worktree.*remove.*--force" sdk/src/vcs/git/parallel.ts                                        → 6
$ grep -c "satisfies CancelResult" sdk/src/vcs/git/parallel.ts                                            → 1
$ grep -c "performJjParallelCancel(cwd, handle)" sdk/src/vcs/backends/jj.ts                              → 1
$ grep -c "performGitParallelCancel(cwd, handle)" sdk/src/vcs/backends/git.ts                            → 1
$ grep -c "workspaceParallelCancelQuery" sdk/src/query/workspace-parallel-cancel.ts                      → 1
$ grep -c "handle_required" sdk/src/query/workspace-parallel-cancel.ts                                   → 1
$ grep -c "handle_json_parse_failed" sdk/src/query/workspace-parallel-cancel.ts                          → 1
$ grep -c "workspace.parallel.cancel" sdk/src/query/command-static-catalog-domain.ts                     → 4   (2 catalog entries + 2 JSDoc mentions)
$ grep -c "workspace.parallel.cancel" sdk/src/query/command-manifest.non-family.ts                       → 1
$ grep -c "workspace.parallel.cancel" sdk/src/query/command-aliases.generated.ts                         → 1
$ grep -c 'mainBookmark:' sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts                           → 0   (Pitfall 7 / N2 mitigation)
$ grep -c 'mainBookmark:' sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts                          → 0   (Pitfall 7 / N2 mitigation)
```

All 23 grep gates pass.

## Self-Check: PASSED

## Next Plan Readiness

- **Phase 15 closure:** all 4 plans shipped sequentially per CF-01. Clean `rootRevisions` / `idAlphabet` / `matchPrefix` / `workspace.parallel.cancel` surface on both backends. Helper sidecar single-owner-ready for Phase 16 consumption.
- **Phase 16 CLEANUP-02 inheritance:** the `cleanupSubagentWorkspaces` helper is the canonical surface that CLEANUP-02 will consume from the fanIn clean-path branch (delegating per-workspace teardown to the helper instead of inlining). The signature is settled (N1 decision recorded); the contract is settled (D-03/D-06 idempotency + UPSTREAM-02 import-discipline gate); the CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` for the dogfood-restore.sh consumer will ship in Phase 16 (NOT Phase 15 — D-08 informational note honored).
- **Phase 17 docs-drift (deferred):** the optional refactor of `expr.ts:41` + `format-migration/rewrite.ts:53,63` to consume the new `vcs.refs.idAlphabet` is a cosmetic cleanup per CONTEXT Deferred Ideas — not a Phase 15 obligation, deferable to Phase 17 docs-drift batch or later.
- **Phase 18 cleanup (deferred):** v14-* todos (CLEANUP-01..07, TEST-17, DOCS-01..09) all map to Phases 16/17/18 per REQUIREMENTS.md traceability — not Phase 15 obligations.

---
*Phase: 15-adapter-surface-extensions-rename*
*Completed: 2026-05-25*
