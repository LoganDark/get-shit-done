# Phase 16: Workflow + invariant tooling - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Two file-disjoint invariant-tooling additions that close the v1.4 workflow-lint coverage gap and the v14 orphan-dir cleanup-contract gap. Pure tooling + cleanup work; no adapter-surface change (those shipped in Phase 15).

1. **LINT-06 / Plan 16.01:** `scripts/lint-vcs-parallel-call-presence.cjs` — content-driven CI lint that requires workflow markdown declaring `workspace.parallel.dispatch` / `fan-in` literals in shell fences to call the paired verb somewhere in the same file. Mirrors `lint-vcs-no-raw-git.cjs` shape; reuses `audit-workflow-raw-git.cjs` fence walker; per-entry `{path|glob, reason, owner}` allowlist via `scripts/lib/allowlist-parser.cjs`; CI step in `.github/workflows/parallel-e2e.yml` adjacent to existing `audit-workflow-raw-git.cjs` (D-07 CI-only precedent — NOT promoted to `npm pretest`).

2. **CLEANUP-02 / Plan 16.02:** orphan `.claude/jj-workspaces/phase-*-subagent-*` FS-dir reap on (a) the `performJjParallelFanIn` clean-path success branch via the shared `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?)` helper Phase 15 extracted, AND (b) `scripts/dogfood-restore.sh` as an idempotent post-restore step via a new CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts`. **Conflicted-branch behavior UNCHANGED** per Pitfall AP-5 — only the clean-path branch reaps; W3 (a) joint-assertion contract preserves workspaces on disk for human inspection on the conflicted branch.

Requirements: LINT-06, CLEANUP-02.

</domain>

<decisions>
## Implementation Decisions

### Carried Forward (from Phase 15 CONTEXT.md + Phase 15 SUMMARY 15-04 + ROADMAP Phase 16 entry)

These were settled by Phase 15 execution + roadmap creation; downstream agents MUST NOT re-litigate.

- **CF-01:** Helper signature LOCKED — `cleanupSubagentWorkspaces(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[]): CleanupSubagentWorkspacesResult` at `sdk/src/vcs/jj/workspace-cleanup.ts` (Phase 15 CONTEXT D-05, amended 2026-05-24 to 3-arg form per Open Q1 RESOLVED). Return shape `{abandoned: readonly string[], failedReaped: readonly string[]}`. UPSTREAM-02 sidecar discipline — does NOT import from `backends/jj.ts`; uses `vcsExec` from `../exec.js` + `node:fs` `rmSync`. Idempotent by contract per D-03/D-06.
- **CF-02:** CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` ships in Phase 16 (NOT 15) per Phase 15 CONTEXT D-08 informational note + Phase 15 SUMMARY 15-04 line 300 "No further helper-API change required." Three-site registration: `command-static-catalog-domain.ts` + `command-manifest.non-family.ts` + `command-aliases.generated.ts` (CF-07 precedent). Bridge wraps any wildcard/enumeration logic on its side — helper signature unchanged.
- **CF-03:** Conflicted-branch behavior is UNCHANGED per ROADMAP SC4 + Pitfall AP-5. `performJjParallelFanIn` conflicted branch preserves workspaces on disk for human inspection (W3 (a) joint-assertion contract). Only the clean-path branch reaps. Documented inline at the code site.
- **CF-04:** Lint shape locked by ROADMAP SC1: content-driven detection via literal substring match in `bash`/`sh`/`zsh` fences (NOT heading-based tagging per Pitfall 7); per-entry `{path|glob, reason, owner}` allowlist via `scripts/lib/allowlist-parser.cjs` (no `expires` per `feedback_solo_dev_no_expires`); inline escape annotation `vcs-lint:allow-parallel-call-absent-here <reason>` reserved literal; fixture-based unit test under `tests/scripts/`.
- **CF-05:** CI placement per ROADMAP SC2 — new step in `.github/workflows/parallel-e2e.yml` adjacent to the existing `audit-workflow-raw-git.cjs` CI-06 step; required-blocking on jj-colocated; NOT promoted to `npm pretest` (mirrors `audit-workflow-raw-git.cjs` D-07 CI-only precedent).
- **CF-06:** Reuse `scripts/audit-workflow-raw-git.cjs` fence-aware walker shape — same `FENCE_OPEN` / `FENCE_CLOSE` regex constants (`/^\s*(```+|~~~+)\s*(bash|sh|zsh)\b/i` + close), same `SCAN_ROOTS = ['get-shit-done/workflows', …]`-style walk. Pitfall 7 "How to avoid" path 3: share the fence detection rather than re-implement it (creates a v1.2-style "audit + lint must cover the same regex surface" coverage gap if duplicated).
- **CF-07:** Plans 16.01 and 16.02 are file-disjoint and ROADMAP-declared parallel-safe within phase. (Wave-parallel execution is moot under the project's current `parallelization: false` configuration per `project_no_parallelization_yet` — execute-phase still runs sequentially. No requirement to flip the knob for Phase 16.)

### Lint Pairing Scope (Plan 16.01 / Pitfall 7)

- **D-01:** Pairing scope is **FILE-level**. If any bash/sh/zsh shell fence in a workflow .md file contains the `workspace.parallel.dispatch` literal substring, some shell fence in the same file MUST contain the `workspace.parallel.fan-in` literal substring (and vice versa). The pairing is bidirectional and file-scoped — NOT fence-scoped, NOT section-scoped, NOT proximity-scoped.

  **Rationale (Pitfall 7 empirical falsification):**
  - SAME-FENCE scope (option D) empirically fires on both canonical workflows: `get-shit-done/workflows/execute-phase.md` puts dispatch at line 682 and fan-in at line 775 in DIFFERENT fences under DIFFERENT `##` headings; `quick.md` has the same separation. The fork→wait-for-Agent()→merge lifecycle deliberately splits the calls across procedural steps.
  - SECTION-level scope (option B) empirically fires on `execute-phase.md` because dispatch lives under `## 3. Spawn executors` and fan-in lives under `## 5.5 Workspace fan-in` — different `##` sections.
  - FENCE-PROXIMITY with N-line threshold (option C) requires N ≥ 215 to pass current workflows, which collapses to FILE-level while adding an arbitrary tuning knob that must grow as workflows evolve.
  - FILE-level (option A) is the only scope that matches the empirical structure AND emits zero false-positives on the 24 prose-only workflows that mention "wave"/"parallel"/"Task(" without containing the literal substrings in any fence. Future split-across-files workflows (none exist today) can be admitted via explicit `{path, reason, owner}` allowlist entries — the per-entry schema is exactly the escape hatch for this case.

- **D-02:** Pairing is bidirectional — file with dispatch literal in a fence but NO fan-in literal in any fence → lint exits 1; file with fan-in literal but NO dispatch literal → lint exits 1. ROADMAP SC1 phrasing "fan-in literal is present but dispatch is missing (or vice versa)" makes this explicit.

- **D-03:** Lint applies to `get-shit-done/workflows/` files only. Non-workflow markdown (docs, .planning, agents) is out of scope by walker root selection — mirrors `audit-workflow-raw-git.cjs:51` `SCAN_ROOTS` convention.

### CLI Bridge Phase-Resolution (Plan 16.02 / IP-5)

- **D-04:** Bridge `sdk/src/query/cleanup-subagent-workspaces.ts` supports **both** `--phase <N>` AND `--all-phases` modes (mutually exclusive). Matches the explicit-flag norm of the three existing parallel-domain CLI bridges (`workspace-parallel-dispatch.ts`, `-fan-in.ts`, `-cancel.ts` — all require explicit flags, fail loud on absence). Mutual-exclusion check rejects `--phase 16 --all-phases` early. `scripts/dogfood-restore.sh` consumer uses `--all-phases` (self-documenting); any future single-phase TS-side consumer uses `--phase N` (the helper already accepts a Handle-authoritative workspaces list, so the surface is symmetric).

- **D-05:** `--all-phases` semantics: bridge enumerates `.claude/jj-workspaces/` via `readdirSync`, filters by regex `^phase-(\d+)-subagent-\d+$`, extracts the unique set of phase numbers, calls the helper once per phase. The bridge keeps the enumeration logic; the helper stays single-phase per its locked signature (CF-01).

- **D-06:** Cross-phase merge envelope: bridge returns a **single merged** `{abandoned: readonly string[], failedReaped: readonly string[]}` envelope across all enumerated phases (NOT a per-phase array of envelopes). Workspace names are already phase-prefixed (`phase-16-subagent-1`, `phase-15-subagent-3`) so concatenation introduces no collisions; the merged shape matches the helper's own return type and gives the dogfood-restore.sh consumer the aggregate count it needs for its post-restore diagnostic without further envelope-shape transformation. Idempotency is inherited transparently — re-invoking `--all-phases` after a successful cleanup returns `{abandoned: [], failedReaped: []}` from every per-phase helper call, merged to the same all-empty envelope.

- **D-07:** Bridge invocation in the fanIn clean-path branch is the TS-side direct call `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, handle.workspaces)` from `sdk/src/vcs/jj/parallel.ts` (NOT via the CLI bridge — bridge is for bash consumers only). Handle's `workspaces[*]` carries `{name, path, baseRev, agentId, …}` per `sdk/src/vcs/types.ts:518-536`; the helper's `workspaces?` parameter takes precedence over the `readdirSync` fallback per Phase 15 D-05 Pitfall 4 mitigation (custom `workspacePath` overrides don't leak).

### Allowlist Seeding + IP-2 Edge (Plan 16.01)

- **D-08:** Initial allowlist file `scripts/lint-vcs-parallel-call-presence.allow.json` ships with `entries: []` (empty) plus a `$schema_version: 2` field and a `$comment_ip2_cancel_exclusion` narrative stub documenting (verbatim from PITFALLS.md §IP-2) that "this lint enforces dispatch ⇔ fan-in pairing presence; cancel and fanIn-only workflows are NOT in scope today — when a real consumer emerges, the lint scope rule is revisited then." No speculative entries. The fence-scope-only scan (D-01) is the structural defense against `code-review.md` / `audit-fix.md` prose-only false positives — defending it twice with `.planning/**` globs would violate the per-entry schema's anti-hollowing intent (`allowlist-parser.cjs:26`).

- **D-09:** IP-2 cancel/fanIn-only edge handling: **defer entirely, NO `vcs-lint:allow-parallel-call-absent-here` annotation reserved**. Pure YAGNI per user pick — the lint regex does NOT recognize the annotation today; when a real cancel-only workflow (or any workflow that legitimately wants to opt out at line scope) emerges, both the lint regex and the annotation syntax get added together in a follow-up commit. Diverges from the agent's recommendation to pre-reserve the annotation; the user's reasoning is dead-code avoidance + matching the precedent that `vcs-lint:allow-git-here` was added when `lint-vcs-no-raw-git.cjs` actually needed an escape hatch, not preemptively.

- **D-10:** Lint script docblock documents (a) what fences are scanned (bash/sh/zsh, reusing `audit-workflow-raw-git.cjs:48` `FENCE_OPEN` verbatim per Pitfall 7 path 3); (b) the per-entry allowlist as the only opt-out mechanism in v1.4 (no inline escape today per D-09); (c) the cancel-only and fanIn-only exclusions cited as IP-2 with a one-line cross-reference to `.planning/research/PITFALLS.md` §IP-2 — not a verbose rationale dump (canonical reasoning lives in PITFALLS.md; duplicating invites drift).

### dogfood-restore.sh Integration Ordering (Plan 16.02)

- **D-11:** Cleanup step placement: **LAST step in the script**, after `tar -xf "$TARBALL_PATH" -C .` and after the existing "complete" diagnostic echo. Preserves Pitfall 2 ordering invariant (`jj op restore` → `tar -xf` with tar last so its content wins) by construction — cleanup is appended downstream and physically cannot perturb the ordering. Matches ROADMAP SC5 "post-restore" wording read literally as "after the entire restore is complete." Coexists cleanly with Plan 18.02's future WR-01 precondition (`[ -f .planning/STATE.md ]` before tar) — cleanup is well downstream of any addition between op-restore and tar.

- **D-12:** Error handling: **trap CLI-bridge call with `… || echo "WARN: orphan cleanup failed" >&2`** and continue with exit 0. The cleanup is recovery hygiene, NOT blocking the restore. A non-zero exit after `jj op restore` and `tar -xf` both succeeded would misleadingly signal "restore failed" to an operator who actually got a clean restore plus a cosmetic-cleanup miss. `scripts/dogfood-rehearse.sh:131` invokes the restore under `set -e`, so trapping the bridge call also keeps the rehearsal harness green when the SDK is mid-rebuild and the bridge is temporarily flaky.

- **D-13:** A second diagnostic echo fires AFTER the cleanup step (`echo "dogfood-restore: orphan-workspace cleanup complete (abandoned=$N, failedReaped=$M)" >&2`) so operators see the cleanup outcome on the same operator-visible status line as the restore. Counts come from the bridge's merged envelope (D-06).

### Test Coverage Shape (Plan 16.01 + 16.02)

- **D-14:** LINT-06 fixture-based unit test lives at `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` (mirrors `tests/lint-vcs-no-raw-git-fixture.test.cjs` shape — Pattern B `mkdtemp` isolation; passes `--scan-root <tmpdir>` to the lint script; never touches the production allowlist). Fixture covers: (i) paired-fan-in-and-dispatch passes (positive); (ii) dispatch-only fence fails (negative); (iii) fan-in-only fence fails (negative); (iv) prose-only mention of "wave"/"parallel" in a non-fence section passes (Pitfall 7 false-positive guard); (v) allowlist entry suppresses a known-opt-out file.

- **D-15:** CLEANUP-02 cross-backend test lives in `sdk/src/vcs/__tests__/` (alongside other VCS-fixture-driven cross-backend tests) using `vcs-fixture.ts` Pattern B `mkdtemp`. Asserts `existsSync(ws.path) === false` for every workspace in the handle after `performJjParallelFanIn` clean-path returns. Git-cell coverage is included per ROADMAP SC3 wording "cross-backend test … covers both jj-cell and git-cell paths" — git's existing `worktree remove --force` already handles teardown so the assertion just confirms no regression on git side (no orphan-dirs on git is the existing invariant per Phase 15 deferred-ideas note "Promote `cleanupSubagentWorkspaces` to cross-backend — defer until git-side orphan-dirs become a problem").

- **D-16:** `scripts/dogfood-restore.sh` integration test: synthetic `jj op restore` + orphan-survival fixture asserts dirs are gone after the script completes. Test fixture seeds two phase numbers (e.g., `phase-15-subagent-1` and `phase-16-subagent-2`) to verify `--all-phases` enumeration covers cross-phase orphans correctly.

### Cleanup-Contract Documentation Site

- **D-17:** Inline JSDoc on `sdk/src/vcs/jj/workspace-cleanup.ts::cleanupSubagentWorkspaces` already documents the three consumers (cancel verb, fanIn clean-path, dogfood-restore.sh) per Phase 15. Plan 16.02 ADDS a one-line cross-reference at the helper docblock pointing to this CONTEXT.md as the "consumer-completion record" — confirms all three consumers are wired post-Phase-16. No separate `.planning/intel/` doc needed (the helper docblock + this CONTEXT + the ROADMAP SC are sufficient surfaces per v14-orphan-jj-workspace-dirs todo acceptance criterion).

### Claude's Discretion

These are planner-level details NOT pinned at discuss-phase:

- Exact bridge argv parser style (manual `process.argv` walk vs. helper from `sdk/src/query/cli/argv.ts` if it exists — planner picks). Three-site registration shape is locked (CF-02).
- Exact lint script variable naming (`PARALLEL_DISPATCH_RE`, `PARALLEL_FAN_IN_RE`, etc. — follow `lint-vcs-no-raw-git.cjs` SHELL_GIT_RE precedent).
- Whether the bridge's `--all-phases` enumeration ignores or reports phases with zero matched workspaces (recommendation: skip silently — idempotent no-op semantics; planner confirms).
- Exact wording of the lint docblock IP-2 cross-reference line (D-10).
- Whether `dogfood-restore.sh` invokes the bridge via `gsd-sdk query cleanup-subagent-workspaces --all-phases` or via a fully-qualified path; matches the existing script's tooling conventions.

### Folded Todos

- **`v14-orphan-jj-workspace-dirs.md`** (folded into CLEANUP-02 scope per REQUIREMENTS.md traceability + user pick). Acceptance criteria fully covered by D-04..D-17:
  - "Decide ownership: dispatcher fan-in cleanup OR recovery-script post-restore cleanup OR BOTH" → **BOTH** per ROADMAP SC3 + SC5; single owner per IP-5 via shared helper (CF-01).
  - "If dispatcher: `vcs.workspace.parallel.fan-in` clean-path `rm -rf`'s each agent's workspace dir" → D-07 direct TS-side helper call from `performJjParallelFanIn` clean-path branch.
  - "If recovery: `scripts/dogfood-restore.sh` appends `rm -rf …phase-*-subagent-*` as final step (idempotent)" → D-11/D-12 via CLI bridge `--all-phases` mode (D-04..D-06).
  - "Tests cover both jj-cell AND git-cell paths via `vcs-fixture.ts` Pattern B mkdtemp" → D-15.
  - "Document the cleanup contract in `.planning/intel/` or the parallel-dispatch surface README" → D-17 (helper JSDoc cross-references this CONTEXT.md; no separate intel doc needed).
  - "Confirm no regression on Phase 11's `project_no_orchestrator_sidecar_state` memory" → workspace dirs ARE ephemeral subagent state (per `project_ephemeral_subagent_workspaces`), so reaping them is consistent with the constraint. Idempotency invariant (D-03/D-06) is the in-VCS-only contract — bridge introduces no on-disk sidecar state.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authoritative scope (locked requirements + roadmap)

- `.planning/REQUIREMENTS.md` §"Deferred-Item Harvest (Workflow Lint)" + §"Test Isolation" — verbatim acceptance criteria for LINT-06 + CLEANUP-02.
- `.planning/ROADMAP.md` §"Phase 16: Workflow + invariant tooling" — Success Criteria 1-5 are the contract; do not narrow or widen.
- `.planning/PROJECT.md` §"Current Milestone: v1.4" — milestone framing + Out of Scope clauses.

### Research (v1.4-specific synthesis)

- `.planning/research/SUMMARY.md` §"Phase 16 — Workflow + invariant tooling" + §"Research Flags" — flags 3 + 5 resolved here (file-level pairing scope; content-driven detection).
- `.planning/research/PITFALLS.md` §"Pitfall 7" (workflow call-presence lint false-positives — directly governs D-01..D-03), §"Pitfall 11" (cleanup ownership ambiguity — resolved by IP-5 shared helper), §"Anti-Pattern 5" (conflicted-branch inspection contract — CF-03), §"IP-2" (cancel/fanIn-only lint exclusion — D-09/D-10), §"IP-5" (three-consumer cleanup helper sequencing — CF-01/D-07).
- `.planning/research/ARCHITECTURE.md` §"Per-Item" — file-change tables for LINT-06 + CLEANUP-02.
- `.planning/research/FEATURES.md` — industry precedents: `actionlint` + `lint-vcs-no-raw-git` for the call-presence lint.

### Phase 15 inheritance (helper + bridge precedent)

- `.planning/phases/15-adapter-surface-extensions-rename/15-CONTEXT.md` D-04..D-08 — helper location, signature, three-consumer design; D-08 is the "Phase 16 picks this up" informational marker.
- `.planning/phases/15-adapter-surface-extensions-rename/15-04-SUMMARY.md` lines 100, 298-300, 361-362 — "no further helper-API change required" + Phase 16 inheritance handoff.
- `sdk/src/vcs/jj/workspace-cleanup.ts:80-200` — locked helper signature + body + JSDoc; D-07 direct-call consumer site.
- `sdk/src/query/workspace-parallel-cancel.ts` — Phase 15 CLI bridge precedent; same three-site registration pattern + explicit-flag norm.
- `sdk/src/vcs/types.ts:518-536` — `ParallelDispatchHandle.workspaces[*]` shape (`{name, path, baseRev, agentId, …}`) — feeds D-07 direct call.

### Lint precedents (Plan 16.01)

- `scripts/lint-vcs-no-raw-git.cjs` — full lint shape; `parseAllowlist` call site at line 49; `SHELL_GIT_RE` at line 87 (analog of `PARALLEL_DISPATCH_RE` to add).
- `scripts/lint-vcs-no-raw-git.allow.json` — per-entry `{path|glob, reason, owner}` schema v2; `$schema_version` / `$migration_note` / `$comment_*` narrative pattern that D-08 follows.
- `scripts/audit-workflow-raw-git.cjs` lines 39-50 + 98-130 — `FENCE_OPEN` / `FENCE_CLOSE` regex + `SCAN_ROOTS` walker shape that 16.01 shares (CF-06).
- `scripts/lib/allowlist-parser.cjs` — shared parser; `parseAllowlist(json, name) → {files, globRegexes}` (lint imports + applies).
- `tests/lint-vcs-no-raw-git-fixture.test.cjs` — Pattern B `mkdtemp` fixture test shape that D-14 mirrors.

### CI integration (Plan 16.01)

- `.github/workflows/parallel-e2e.yml` lines 125-127 — existing `audit-workflow-raw-git.cjs` CI-06 step; new lint step lands adjacent (CF-05). Line 40 `paths-filter` may need an additional entry for `scripts/lint-vcs-parallel-call-presence.cjs` to gate the workflow on lint changes.

### Cleanup integration (Plan 16.02)

- `sdk/src/vcs/jj/parallel.ts` — `performJjParallelFanIn` clean-path branch is the D-07 insertion site for the direct TS-side helper call. Existing function around lines 289+; clean-path branch is the `!conflicted` arm.
- `scripts/dogfood-restore.sh` — current 61-line script; D-11 appends cleanup step AFTER line 60 diagnostic echo; D-12 traps the CLI-bridge call.
- `scripts/dogfood-rehearse.sh` line 131 — restore invocation under `set -e`; D-12's `|| echo` trap keeps the rehearsal harness green.
- `.planning/intel/v1.3-dogfood-metrics.md` — durable Recovery Anchor; the orphan-survival empirical observation that motivated CLEANUP-02 lives in §Deviations of Phase 14 SUMMARY.
- `sdk/src/vcs/__tests__/vcs-fixture.ts` — Pattern B `mkdtemp` fixture pattern that D-15 uses.

### CLI bridge registration sites (Plan 16.02)

- `sdk/src/query/cli/command-static-catalog-domain.ts` — catalog-domain registration site (CF-02 site 1).
- `sdk/src/query/cli/command-manifest.non-family.ts` — manifest.non-family registration site (CF-02 site 2).
- `sdk/src/query/cli/command-aliases.generated.ts` — aliases.generated registration site (CF-02 site 3).

### Memory directives that apply here

- `project_no_parallelization_yet` — phase parallelization knob OFF; Plans 16.01/16.02 are file-disjoint per ROADMAP but execute-phase still runs sequentially (CF-07).
- `feedback_solo_dev_no_expires` — allowlist entries are `{path|glob, reason, owner}`; no `expires` field (CF-04).
- `feedback_avoid_jj_auto_tracked_output` — bridge + lint must be stdout-only; never write output files into the colocated-jj working tree.
- `project_ephemeral_subagent_workspaces` — workspaces are created, worked on, merged/reaped, gone; CLEANUP-02 enforces the "gone" guarantee (D-17 cross-references this).
- `project_no_orchestrator_sidecar_state` — bridge introduces no on-disk sidecar; folded-todo coverage confirms.
- `feedback_vitest_extend_over_free_fn` — if any custom matcher is needed in D-14/D-15, use `expect.extend` not free-function.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`cleanupSubagentWorkspaces` helper** at `sdk/src/vcs/jj/workspace-cleanup.ts:134` — locked 3-arg signature with `workspaces?` Handle-authoritative override; D-07 direct call from `parallel.ts`; D-04 wrapped call from bridge. Already idempotent per D-03/D-06 of Phase 15.
- **`scripts/lib/allowlist-parser.cjs::parseAllowlist`** — schema-v2 per-entry parser; lint imports verbatim (CF-04).
- **`scripts/audit-workflow-raw-git.cjs` fence walker** — `FENCE_OPEN` / `FENCE_CLOSE` / `SCAN_ROOTS` constants + recursive walker; lint shares (CF-06 — `audit + lint must agree on what counts as a fence` precedent).
- **`scripts/lint-vcs-no-raw-git.cjs` parseArgv + `--scan-root` flag** at lines 30-38 — Pattern B fixture-test isolation pattern that D-14 mirrors.
- **Phase 15 cancel bridge** at `sdk/src/query/workspace-parallel-cancel.ts` — explicit-flag precedent + three-site registration template that the new cleanup bridge follows (CF-02).
- **`scripts/dogfood-restore.sh` ordering invariant** (lines 13-23) — Pitfall 2 documentation; D-11 cleanup step preserves the invariant by construction.

### Established Patterns

- **Fence-aware FILE-level scan** (Pitfall 7 path 1) — share `audit-workflow-raw-git.cjs` walker; per-file aggregation; pairing check at file scope (D-01).
- **Explicit-flag CLI bridges** — `--phase`, `--handle`, `--results` all REQUIRED + fail-loud on absence; `cleanup-subagent-workspaces.ts` continues the norm via mutually-exclusive `--phase N` / `--all-phases` (D-04).
- **Single merged envelope on cross-axis aggregation** — bridge merges arrays per D-06; matches helper return shape; matches `FanInResult.failedReaped` precedent of "one envelope for the whole batch."
- **Three-site CLI bridge registration** — `command-static-catalog-domain.ts` + `command-manifest.non-family.ts` + `command-aliases.generated.ts` (CF-02). Missing any one breaks runtime verb resolution per Phase 11 plan 02 audit.
- **Pitfall 2 ordering invariant in `dogfood-restore.sh`** — op-restore → tar -xf with tar LAST; cleanup is appended downstream (D-11 preserves by construction).
- **`set -e` script with stderr-only diagnostics** — match existing `dogfood-restore.sh` style; D-13 second diagnostic echo follows the line 60 pattern.

### Integration Points

- **New row in capability matrix?** — `sdk/src/vcs/backends.ts:75-95` capability matrix already lists `'workspace.parallel.cancel'` (Phase 15). CLEANUP-02 doesn't add a new verb (the helper is internal sidecar; the bridge is a CLI verb but it's NOT a `VcsAdapter` method). Question for planner: does `cleanup-subagent-workspaces` need a capability-matrix entry? Likely NOT — capability matrix tracks `VcsAdapter` methods, not internal cleanup helpers. Confirm during planning.
- **New CLI bridge** `sdk/src/query/cleanup-subagent-workspaces.ts` registered at 3 sites (CF-02 / D-04).
- **New lint** `scripts/lint-vcs-parallel-call-presence.cjs` + `scripts/lint-vcs-parallel-call-presence.allow.json` + new CI step in `parallel-e2e.yml` (CF-04/CF-05).
- **`performJjParallelFanIn` clean-path branch** in `sdk/src/vcs/jj/parallel.ts` — D-07 direct call site; CF-03 conflicted branch UNCHANGED.
- **`scripts/dogfood-restore.sh`** — D-11 appends cleanup step + D-13 diagnostic; D-12 trap.

</code_context>

<specifics>
## Specific Ideas

- **File-level pairing makes the lint output line-anchored to the FILE, not a specific fence.** Diagnostic format: `<path>:1: missing paired call (has dispatch literal but no fan-in literal in any fence)` — point at line 1 since the violation is file-scoped. Mirrors `lint-vcs-no-raw-git.cjs` per-violation diagnostic shape.
- **The lint's two literal patterns ARE the contract surface.** `PARALLEL_DISPATCH_RE = /workspace\.parallel\.dispatch/` and `PARALLEL_FAN_IN_RE = /workspace\.parallel\.fan-in/` — bare literal substrings; no regex anchors needed because the fence walker already scopes to bash content. Hyphenated `fan-in` per the existing literal in `execute-phase.md` line 775.
- **Cross-phase merge in the bridge is order-preserving.** D-06 envelope concatenates per-phase results in phase-number ascending order so the bridge output is deterministic across invocations (helps test fixture assertions).
- **`--all-phases` enumeration is on `.claude/jj-workspaces/`, not on `.planning/phases/`.** D-05 enumerates the materialized workspace dirs (where orphans live), not the planning phase dirs. A phase number with no materialized workspaces is invisible to the bridge — correct behavior, no work to do.
- **D-13 second diagnostic echo includes counts.** Format: `dogfood-restore: orphan-workspace cleanup complete (abandoned=$N, failedReaped=$M)` — operator sees the merged envelope contents inline.
- **The lint script's docblock cross-references PITFALLS.md §IP-2 by exact line.** D-10 — one-line cross-reference, not a verbose rationale dump. Trade-off documented in Claude's Discretion.

</specifics>

<deferred>
## Deferred Ideas

These came up during synthesis and belong in OTHER phases or future milestones. Do not lose them; do not act on them in Phase 16.

- **`vcs-lint:allow-parallel-call-absent-here <reason>` inline escape annotation** — D-09 deferred per user pick (pure YAGNI). When a real cancel-only or fanIn-only workflow emerges, add the regex constant + docblock entry + an allowlist entry simultaneously. The annotation literal is reserved in name (ROADMAP SC1) but not implemented in v1.4.
- **Extending the lint to recognize `dispatch ⇔ cancel` as a valid pairing** — speculative per D-09; conflates two distinct semantic patterns (dispatch-then-fanIn vs cancel-someone-else's-dispatch). Wait for a real consumer.
- **Promoting `cleanupSubagentWorkspaces` to a cross-backend helper** — per Phase 15 deferred-ideas; git-side `worktree remove --force` already handles teardown so no orphan-dirs risk exists today. Defer until git-side orphan-dirs become a problem.
- **A separate `.planning/intel/cleanup-contract.md` doc** — D-17 settles on the helper JSDoc + this CONTEXT + ROADMAP SC as sufficient documentation surface. If a future operator or contributor needs a single landing page for the cleanup contract, factor it then.
- **Capability-matrix entry for `cleanup-subagent-workspaces`** — flagged for planner confirmation in Integration Points; likely NOT required (matrix tracks `VcsAdapter` methods, not internal sidecar bridges).
- **Promoting the lint to `npm pretest`** — CF-05 explicitly keeps it CI-only per `audit-workflow-raw-git.cjs` D-07 precedent. Future workflow expansion may revisit.

### Reviewed Todos (not folded)

The 5 v14-* todos in `.planning/todos/pending/` matched on keyword coincidence at score 0.6 but only `v14-orphan-jj-workspace-dirs.md` is mapped to Phase 16 by REQUIREMENTS.md traceability — the others belong elsewhere:

- `v14-transition-md-update-gap.md` → CLEANUP-01 → Phase 18 (workflow gate)
- `v14-review-followups.md` → CLEANUP-03..07 → Phase 18 (Phase 14 code-review WR-01..05 hardening)
- `v14-jj-reap-test-flake.md` → TEST-17 → Phase 18 (narrow-scope test flake)
- `v14-docs-verify-only-followups.md` → DOCS-01..09 → Phase 17 (drift cleanup)

These were considered during cross_reference_todos but not folded — kept here so future phases (17/18) confirm the same mapping holds.

</deferred>

---

*Phase: 16-Workflow + invariant tooling*
*Context gathered: 2026-05-24*
