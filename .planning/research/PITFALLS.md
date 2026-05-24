# Pitfalls Research — v1.4 cleanup-before-upstream-pull

**Domain:** Long-running fork cleanup milestone; deferred-item harvest, public-API rename, parallel-dispatcher cancellation, drift-control tests against an already-drifted corpus, alphabet-aware short-prefix matching, doc reconciliation
**Researched:** 2026-05-24
**Confidence:** HIGH (all codebase-specific pitfalls cite per-incident artifacts in `.planning/`; integration pitfalls inferred from cross-reading the six v1.4 areas against v1.2/v1.3 retros)

---

## Scope note

v1.4 has six distinct work areas that interact in non-obvious ways. The pitfalls below are organized so each work area's pitfalls cluster together, with a final **Integration Pitfalls** section calling out the cross-cuts. Generic process pitfalls ("write tests first") are deliberately omitted — only pitfalls that have actually fired or are highly likely to fire on THIS codebase in THIS milestone.

---

## Critical Pitfalls

### Pitfall 1: Scope creep from "cleanup" into "refactor"

**What goes wrong:**
The v1.4 charter is "drive every outstanding fork-internal todo, deferred item, and known drift to zero." That is structurally open-ended — there is no closed acceptance set; any nearby code can be argued into scope under "the rename touches X, so X should also be modernized." By Phase N of v1.4, the rename plan grows tendrils into the unrelated `refs.bookmarks` API, the parallel.cancel plan grows tendrils into a new `cancellation-token` namespace abstraction, etc.

**Why it happens:**
- "Cleanup" milestones don't have an external user story to push back against scope (unlike v1.3's "subagent dispatch works" which had a binary success criterion).
- The five-item-per-theme structure (5 todos + 5 deferreds + drift control) feels small at roadmap time, so each individual plan has room to expand.
- Every cleanup naturally surfaces adjacent cleanup opportunities — the v1.2 retro's lesson "Plan 1 audit row count (101) vs final post-fix audit row count (79)" shows audit scope drift even on a tighter milestone.

**How to avoid:**
- **Lock the closed acceptance set at roadmap time.** Each of the 5 todos has a `## Acceptance criteria for the fix plan` section in its frontmatter — verbatim-promote those bullets into the milestone REQUIREMENTS.md. Do not add bullets at plan-phase.
- **Refuse "while we're here" deltas.** Each deferred item maps to ≤1 new public verb (matchPrefix, idAlphabet, parallel.cancel) and ≤1 new lint or ≤1 mechanical rename. Any new verb proposal needs a new REQ-ID, not an inline extension.
- **Adopt v1.2's "Plan 1 audit row count drift" pattern as a v1.4 warning sign**: if the requirement count grows after roadmap, that is a scope-creep signal, not a planning improvement.
- **Carry-forward checklist:** the v14-* todo files in `.planning/todos/pending/` ARE the spec. If something isn't in that filename set, it doesn't ship in v1.4.

**Warning signs:**
- Any plan PLAN.md whose `must_haves` count exceeds the source todo's `Acceptance criteria` count.
- Any new file under `sdk/src/vcs/` that isn't covered by a pre-existing REQ-ID.
- Discussion of "we should also ..." during discuss-phase.

**Phase to address:**
v1.4 roadmap-phase (closed acceptance set at REQUIREMENTS.md write time) + every discuss-phase (re-confirm "this plan covers only the listed REQ-IDs").

---

### Pitfall 2: Phase-14 false-clean-WC pattern re-introduced by NEW workflow surfaces

**What goes wrong:**
Phase 14's `--no-transition --auto` chain emitted "PHASE COMPLETE / Working copy is clean" while `gsd-sdk query phase.complete 14` had mutated `.planning/ROADMAP.md` and `.planning/STATE.md` on disk WITHOUT a commit. The quick task at `.planning/quick/260523-ovw-investigate-how-that-happened-and-potent/` fixed three sites (`execute-phase.md:1477`, `plan-phase.md:1519`+`1533`) and added `assert_clean_wc` final gates. **`transition.md:166` was NOT fixed** — v14-transition-md-update-gap explicitly carries the same HIGH-RISK pattern.

The repeat-failure mode for v1.4: NEW workflow markdown surfaces added by v1.4 (e.g., a new step in execute-phase.md that calls the new `parallel.cancel` verb, or a new docs-update flow that mutates many translation files) re-introduce the same "mutating verb followed by deferred commit" pattern, and the existing `assert_clean_wc` gate doesn't catch them because it only checks for `.planning/`-pattern paths.

**Why it happens:**
- The quick-task fix is path-scoped (`grep -E '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$'`) — files outside that scope mutated by a new step would not trip the gate.
- v1.4 work touches docs translations (`docs/{ja-JP,ko-KR,pt-BR}/...`) which are NOT under `.planning/`.
- Per the `feedback_workflow_assert_clean_wc` memory, the global install (`~/.claude/get-shit-done/workflows/`) still has the OLD workflow until reinstall — local-fork edits are not automatically propagated to the running session.

**How to avoid:**
- **Fix `transition.md:166` FIRST in v1.4 (the v14-transition-md-update-gap todo).** It is the same HIGH-RISK pattern documented in the audit table; close it before any new workflow surface lands.
- **Broaden the `assert_clean_wc` scope.** Per the recent commit `3fe538c0 fix(workflow): broaden assert_clean_wc gate to ALL uncommitted paths, not just .planning/`, the gate now covers all uncommitted paths. Verify the broadened gate is present in `execute-phase.md` AND `plan-phase.md` AND (after the v14-transition-md-update-gap fix) `transition.md`. If v1.4 adds a new mutating workflow, that workflow ALSO needs the gate.
- **Every plan that adds a workflow step with `state.*` / `roadmap.*` / `phase.complete` mutation must include an adjacent `gsd-sdk query commit` call OR a pre-existing assert_clean_wc gate downstream.** Make this a plan-check rule, not a verifier rule (a verifier-only rule fires after the bug ships).
- **Apply the global-install caveat at roadmap time:** assume the operator is on the global install; the local-fork workflow only protects future installs. Until the operator runs `bin/install.js --global`, the v1.4 work executes with the buggy workflows. Document this in the milestone's "operator instructions."

**Warning signs:**
- New `gsd-sdk query state.*` / `roadmap.*` / `phase.complete` call in a workflow markdown without a `gsd-sdk query commit` within ~10 lines (look for the v14-transition-md-update-gap pattern).
- "PHASE COMPLETE" / "PLANNED" / similar terminal banner that fires before a final assert.
- Any workflow that touches `docs/` or `README*` mid-execution without an immediate commit.

**Phase to address:**
v1.4 first phase (close v14-transition-md-update-gap before any other workflow change lands).

---

### Pitfall 3: Public API rename leaves half-renamed surface (`rootCommits` → `rootRevisions`)

**What goes wrong:**
The rename has at minimum 13 known call sites surveyed during research:
- `sdk/src/vcs/types.ts:363` (interface)
- `sdk/src/vcs/backends.ts:79` (capability matrix)
- `sdk/src/vcs/backends/jj.ts:964` (jj implementation)
- `sdk/src/vcs/backends/git.ts:526, 564` (git implementation)
- `sdk/src/query/progress.ts:288, 293` (consumer)
- `get-shit-done/bin/lib/commands.cjs:998, 1005` (CJS consumer)
- `sdk/src/vcs/__tests__/git-backend.test.ts:414, 419` (test)
- `sdk/src/vcs/__tests__/jj-skeleton.test.ts:147, 148` (test)
- `sdk/src/vcs/__tests__/jj-refs.test.ts:215, 216, 220` (test)
- `sdk/src/vcs/__tests__/baseline-parity.test.ts:234, 238` (test)
- `tests/__tools__/capture-vcs-baselines.cjs:414` (baseline-capture)
- `sdk/dist-cjs/**` (built artifact, regenerates)
- `.planning/seeds/`, `.planning/intel/`, `.planning/milestones/v1.2-research/`, `.planning/PROJECT.md`, `.planning/STATE.md`, archived research (`.planning/research/.archive-pre-v1.4/ARCHITECTURE.md`) — prose references

The half-rename failure mode: TypeScript compiles cleanly because the interface and all TS consumers were renamed; tests pass because they were swept; but `commands.cjs:1005` was missed (CJS, no compiler enforcement). At runtime, `statsVcs.refs.rootCommits` is undefined → silent `TypeError: undefined is not a function` in `roadmap.analyze`. This is the **identical failure mode** caught by the v1.2 retro CR-01 (Plan 2's CJS-side `commands.cjs` miss after `LogEntry.hash` → `.id` hard rename).

**Why it happens:**
- TypeScript's compiler is the forcing function for `.ts` consumers, NOT `.cjs` consumers. This is verified-across-milestones per v1.2 retro: "CJS consumer sweeps need explicit grep-acceptance, not just compiler-trust."
- Workflow markdown and agent prompt files are not in any compiler's scope.
- The v1.2 `LogEntry.hash` → `.id` rename swept TS mechanically but the executor's SUMMARY reported the sweep was "wider than planned because the compiler kept surfacing more sites" — the same dynamic surfaces here, but the CJS consumers + prose consumers do NOT self-surface.

**How to avoid:**
- **Mandatory pre-rename grep audit, emitted as a JSON sidecar.** Before the rename plan executes, run `grep -rn '\brootCommits\b' --include='*.ts' --include='*.cjs' --include='*.js' --include='*.md' --include='*.json'` over the whole repo (excluding `node_modules`, `.git`, `.jj`, `dist-cjs/`). Emit the result as `.planning/phases/{NN}/rootCommits-rename-audit.json` so the rename plan has a closed call-site set. This is the v1.2 "JSON sidecar as build-pipeline seed" pattern (RETROSPECTIVE v1.2 Patterns Established).
- **No alias. Hard rename like v1.2's `LogEntry.hash` → `.id`.** Aliases create indefinite "should I use the new or old name?" debt and let the rename never actually complete. Compiler errors are the forcing function for TS; the grep audit is the forcing function for CJS + prose.
- **Per-extension grep-acceptance step in the executor's must-haves**, not just verifier-level: `grep -c '\brootCommits\b' get-shit-done/bin/lib/*.cjs` must equal 0 BEFORE commit. Same for `.md` files (excluding archived `.planning/`).
- **Treat archived `.planning/` files as historical prose** (the v1.2 "historical-prose" verdict from `scripts/audit-id-namespace.cjs`). Do not rewrite `.planning/milestones/v1.2-research/FEATURES.md` — it captures the historical decision and renaming it falsifies history. Add `.planning/**` to a per-rename allowlist OR explicitly skip with documentation.

**Warning signs:**
- TypeScript builds clean → assumption that rename is complete. (FALSE — CJS consumers + prose + workflow markdown not covered.)
- Any executor SUMMARY that says "rename complete; X sites swept" without a `grep -c` exit-0 audit attached.
- Capability matrix at `backends.ts:79` (`'refs.rootCommits': Object.freeze(['git', 'jj-colocated'])`) not renamed — capability matrix probes (e.g., from `gsd-sdk query backend.*`) silently fall through to a "capability unknown" path.

**Phase to address:**
The deferred-item-harvest phase that owns `rootCommits → rootRevisions`. Include the pre-rename audit as a Wave-1 plan; the actual rename as Wave-2.

---

### Pitfall 4: Drift-control tests added BEFORE the drift is fixed → first run reds CI

**What goes wrong:**
v1.4 ships `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` (Theme 6 of v14-docs-verify-only-followups). These tests LOCK prose counts in ARCHITECTURE.md / INVENTORY.md to live filesystem state. **The codebase ALREADY HAS DRIFT** — confirmed by direct inspection:
- en `docs/ARCHITECTURE.md`: now defers to INVENTORY.md for `commands` and `workflows` counts (line 121, 143), but still hardcodes `Total agents: 33` (line 181) and installer LOC (`~10,700 lines`, line 599 — close-ish to the actual 10,978 but stale).
- `docs/ja-JP/ARCHITECTURE.md:116`: still says `**コマンド総数:** 44` (actual: 68).
- `docs/ja-JP/ARCHITECTURE.md:127`: `**ワークフロー総数:** 46` (actual: 89).
- `docs/ja-JP/ARCHITECTURE.md:137`: `**エージェント総数:** 16` (actual: 33).
- `docs/ja-JP/ARCHITECTURE.md:427`: `インストーラー（bin/install.js、約3,000行）` (actual: 10,978).
- ko-KR, pt-BR translations similarly drifted.
- zh-CN ARCHITECTURE.md does NOT exist (just three translations: ja-JP, ko-KR, pt-BR per directory listing).

If the test ships first, CI fails red on the very first run, forcing a rushed prose-update under CI pressure rather than careful one-translation-at-a-time editing.

**Why it happens:**
- "Tests first" is a default pattern; without explicit ordering it's the natural reflex.
- The drift is distributed across 3+ files in 3 translations × 2 docs (`ARCHITECTURE.md` + `INVENTORY.md`) — multi-file fix that doesn't fit a single commit naturally.
- The audit-as-baseline pattern (Pitfall 5 v1.3 RETROSPECTIVE Patterns Established: "When a 'zero violations' goal is structurally unachievable, reframe as 'no regression beyond a frozen baseline'") is the right answer here too, but the obvious naive form is "tests assert current = filesystem" which IS structurally unachievable on day 1.

**How to avoid:**
- **Strict order at roadmap time: drift FIX → drift TEST.** The drift-control tests are LAST in their plan-wave, after every translation has been corrected. Encode as a same-PR coupling requirement (v1.3 D-09/D-10/D-11 pattern): the test plan's must-haves explicitly cite "the corresponding fix plan committed before this plan starts."
- **OR ship the tests in a graduated mode.** First ship them as `expect.soft` warnings (non-failing); only after all translations are fixed, flip to strict assertions. Avoids the day-1-red-CI but introduces "deferred strictness" debt — choose the strict-order approach if the translation fix is bounded (it is — ~5 numbers × 3 translations = 15 prose changes).
- **Audit-as-baseline pattern (the LINT-04 reframe in v1.3).** If the strict-fix order is infeasible (e.g., one translation needs human translator review), reframe the test as `tests/architecture-counts-no-regression.test.cjs` carrying a per-file frozen baseline matching today's wrong counts; the test fails only when a file's drift INCREASES. This converts the day-1-red into "we acknowledge the drift; we will not let it get worse." Then the drift-fix becomes incremental baseline-shrinks.
- **Decide the en/translation-strictness scope explicitly.** Translations naturally lag the English source. The test could scope to English-only and let translations remain advisory; document the trade-off so future contributors don't add to the drift.

**Warning signs:**
- Test plan's `must_haves` doesn't reference a "drift fix landed" gate.
- Roadmap shows test plan as Wave 1 or unspecified (rather than explicitly Wave 2 with Wave 1 = fix).
- Discussion of "the tests will catch translations as they're updated" without confirming they don't catch them on day 1.

**Phase to address:**
Drift-control + reconciliation phase, plan-phase. Plan ordering decision at discuss-phase.

---

### Pitfall 5: Mid-execution parallel.cancel partial-state cleanup races

**What goes wrong:**
v1.4 adds `vcs.workspace.parallel.cancel(handle)` for graceful mid-execution abandonment. The naive implementation is `for (ws of handle.workspaces) vcs.workspace.remove(ws.path)` — but the dispatcher's subagents may still be writing to those workspaces when cancel fires. Possible failure modes:
1. **jj-side: `jj squash` in flight while cancel removes the workspace** — the cancel `jj workspace forget` succeeds, but the subagent's `jj squash` (running in subprocess) errors on missing workspace metadata, returns a misleading exit code that the orchestrator may classify as "crashed-with-uncommitted-work" → false reap entry written to `incomplete-work.md`.
2. **git-side: `git worktree remove <path>` (non-force per PARALLEL-02 D-04) refuses if dirty** — the cancel returns partial success and leaves a half-removed workspace; the next dispatch may see name collision.
3. **Orphan FS dirs survive cancel** (same class of bug as v14-orphan-jj-workspace-dirs documented in `.planning/todos/pending/`) — `.claude/jj-workspaces/phase-{N}-subagent-*` directories that the jj backend doesn't know about because they were created by `octopus.createSubagentSlot` but cancel didn't run the matching cleanup.
4. **Cross-backend semantic gap:** the existing `fanIn` is "wait for all subagents and merge"; cancel is "stop and roll back." The cancel verb's `FanInResult`-equivalent return shape isn't defined — does cancel return `{cancelled, freedWorkspaces, leakedPaths}`? Without that, callers can't distinguish "cancelled cleanly" from "cancelled with partial leak."

**Why it happens:**
- The existing dispatch surface is "orchestrator awaits all `Agent()` resolutions before fanIn" (per `sdk/src/vcs/jj/parallel.ts` D-01: "the orchestrator awaits all `Agent()` resolutions before fanIn; the single orchestrator process never contends with itself"). Cancel breaks that invariant — by definition, cancel runs while at least one subagent is still running.
- jj's workspace removal is two-step (`jj workspace forget` + `rm -rf <dir>`); git's is one-step but with side effects. The asymmetry surfaces only under the race window cancel opens.
- v14-orphan-jj-workspace-dirs has already proven that FS dirs survive even when the operator's intent is cleanup (`jj op restore`); cancel + signal-killed subagent is a strictly harder version of the same problem.

**How to avoid:**
- **Define the cancel contract explicitly at RESEARCH/discuss-phase.** What does cancel return? Specifically, the equivalent of `FanInResult` shape for cancel — e.g., `CancelResult = {cancelled: WorkspaceInfo[], leakedPaths: string[], inFlightAtCancel: AgentResult[]}`. The Phase 11 verifier-induced lesson "Cross-backend types must carry no field that the consumer would conditionally branch on" applies here: the cancel return shape must be backend-opaque.
- **Cancel does NOT signal subagents.** It only marks the handle as cancelled and refuses subsequent `fanIn` calls. Subagents that subsequently finish their work commit to their workspace; cancel's job is to clean up workspaces whose subagents have terminated (signaled or finished). This matches the v1.3 PARALLEL-03 deferral rationale ("orchestrator-awaits-Agent() invariant makes liveness moot in production"). DOCUMENT this as a non-feature: cancel is NOT "kill the subagents"; it's "the orchestrator has decided to abandon the wave; tell the adapter to release resources."
- **Force-non-force divergence: cancel = `worktree remove --force` on git, jj `workspace forget` + `rm -rf` unconditionally on jj.** This trades the v1.3 D-04 "non-force only" git invariant FOR cancel-only ergonomics. Document as a deliberate carve-out at the cancel-verb body, NOT a relaxation of fanIn's non-force rule.
- **Cleanup contract test: cancel-then-list returns no workspaces from the cancelled handle.** Plus a parallel test that runs cancel WHILE a synthetic subagent is mid-write and asserts (a) the cancel returns success, (b) the subagent's eventual write fails with an explicit error (not a misleading silent-pass).
- **Reuse v14-orphan-jj-workspace-dirs cleanup work.** If that todo's fix is "the dispatcher's fanIn `rm -rf`s subagent workspace dirs," then cancel must do the SAME `rm -rf`. Same code path or shared helper — never two separate implementations of cleanup.

**Warning signs:**
- Cancel return type is `void` or `boolean`. (Backend-opaque contract requires a result shape.)
- Cancel implementation includes any code that signals subagents (e.g., `process.kill`). (That's a different feature; do not bundle.)
- Cancel tests run only on a "no in-flight subagents" fixture.
- No test for cancel-then-dispatch-same-name interaction.

**Phase to address:**
The deferred-item-harvest phase plan for `parallel.cancel`. RESEARCH must produce the cancel-result shape decision before plan-phase. Implementation phase must couple cancel with the v14-orphan-jj-workspace-dirs fix (or be sequenced after it).

---

### Pitfall 6: matchPrefix returns false on wrong-alphabet prefix (silent wrong-answer)

**What goes wrong:**
`vcs.refs.matchPrefix(id, prefix)` accepts an `id` (full revision) and a `prefix` (caller's short fragment) and returns boolean. The implicit contract is "does `id` start with `prefix` in the backend's alphabet?" On jj (k-z alphabet) calling `matchPrefix('mpqlrysvwxuk...', 'a1b2')` (hex prefix) silently returns `false` — but the CALLER probably intended this as an error (they would never legitimately produce a hex prefix on a jj backend; the bug is upstream of the matchPrefix call, but matchPrefix swallows it).

This is the v1.2 lesson "the lint guard that IS the architectural enforcer needs its own regex coverage audited explicitly" applied to a new domain: matchPrefix's alphabet check is the architectural enforcer for prefix shape, and if it silently returns false instead of throwing, callers can't tell their code is broken.

Secondary failure mode: empty-prefix semantics. `matchPrefix(anyId, '')` — does that return `true` (vacuous truth, JS `startsWith('')` returns true) or throw? Different callers will assume different answers.

Tertiary failure mode: case sensitivity. jj's k-z alphabet is by convention lowercase. `matchPrefix('mpql...', 'MPQL')` — does that match (case-insensitive) or not (case-sensitive)? `expr.rev` is already documented as "alphabet-permissive by design" (v1.2 retro: "Accepts `[0-9a-fA-F]{4,40}` OR `[k-z]{4,40}` with no backend-awareness check"); matchPrefix MUST be stricter than `expr.rev`.

**Why it happens:**
- JS's `String.prototype.startsWith` is the obvious building block; it returns `false` on mismatch, not throw.
- The v1.2 audit found only ONE production caller of `id.startsWith(prefix)` (in `baseline-parity.test.ts:298`) — so the API's design is being driven by hypothetical callers, not real ones, making contract decisions more ambiguous.
- jj's `change_id` alphabet (k-z reverse base32) is not commonly known; developers writing matchPrefix call sites may not realize the alphabet exists.

**How to avoid:**
- **Throw on wrong-alphabet prefix, don't return false.** The verb signature is `matchPrefix(id, prefix): boolean | throws WrongAlphabetError`. The throw IS the architectural enforcer — silent-false would be the v1.2 anti-pattern.
- **Couple matchPrefix's tests with idAlphabet's tests.** They are the same API contract from two sides: idAlphabet declares the alphabet; matchPrefix enforces it. Same test file: `sdk/src/vcs/__tests__/refs-alphabet.test.ts`. Test cases: matched-prefix-correct-alphabet → true; non-matched-prefix-correct-alphabet → false; correctly-shaped-but-wrong-alphabet-prefix → THROWS; empty prefix → THROWS (no vacuous-truth); mixed-case hex prefix → matches case-insensitive (hex convention); mixed-case k-z prefix → THROWS (k-z is lowercase by convention).
- **Document the alphabet rule on `idAlphabet` JSDoc.** `vcs.refs.idAlphabet` returns `'hex' | 'kz'`. JSDoc must state: hex is case-insensitive; k-z is lowercase. matchPrefix's JSDoc cross-references.
- **Audit existing `.startsWith(` callers before shipping matchPrefix.** Already done (3 production sites: `template.ts:82`, `phase-command-router.cjs:29`, `core.cjs:183` — none are id-prefix matching). If no real consumer exists, defer matchPrefix entirely (v1.2's original "drop the API if no callers" gate still applies). DO NOT ship matchPrefix as "we might need it someday" — that's the unused-API debt the v1.2 SEED-001 inversion warned against.

**Warning signs:**
- matchPrefix's return type is plain `boolean` (no error path documented).
- Tests use only valid inputs; no negative-case throws.
- `idAlphabet` ships separately from matchPrefix (the v1.2 "first consumer is matchPrefix" framing is broken).
- Empty-prefix behavior is not documented or tested.

**Phase to address:**
The deferred-item-harvest phase. Pair matchPrefix + idAlphabet in the same plan; reject if discuss-phase finds zero real callers.

---

## Moderate Pitfalls

### Pitfall 7: Workflow call-presence lint false-positives on workflows that legitimately don't dispatch

**What goes wrong:**
The new lint enforces "workflows that dispatch subagents in parallel must call `vcs.workspace.parallel.dispatch`." A naive implementation greps for "wave" or "parallel" or "Task(" and demands a `workspace.parallel.dispatch` call nearby. Survey of actual workflows shows:
- `execute-phase.md`: 112 "wave/subagent/Task(" mentions, 3 `workspace.parallel.dispatch` calls → PASSES
- `quick.md`: 16 mentions, 4 calls → PASSES
- `code-review.md`: 2 mentions, 0 calls → FAILS (false positive; code-review.md mentions "wave" only in prose)
- `audit-fix.md`: 2 mentions, 0 calls → FAILS (same)
- `analyze-dependencies.md`: 0 mentions, 0 calls → PASSES (no false positive, correctly excluded)

The false-positive risk is HIGH if the lint scope is grep-based. Many workflows discuss multi-agent patterns in prose without actually dispatching.

**Why it happens:**
- The v1.3 retro lesson "every envelope guard needs an explicit if-then-else form, no `//` shortcuts" applies to lint scope too: the lint's "should this file be scanned?" check needs an explicit allowlist or scope rule, not a heuristic grep.
- Workflow markdown is mixed prose + executable bash fences; "parallel" appears in both.

**How to avoid:**
- **Define the lint's scope by SHELL FENCE, not by prose mention.** The lint scans only `bash` / `sh` / `zsh` shell fences (same as `scripts/audit-workflow-raw-git.cjs:48` `FENCE_OPEN` regex) — if a shell fence contains an indicator of parallel dispatch (e.g., `Task(` opening a subagent invocation, OR a per-plan loop), the fence is "dispatch-relevant" and the file must call `workspace.parallel.dispatch` somewhere in the file.
- **Or: explicit per-file allowlist (the LINT-05 pattern), default-deny.** Author the lint against the closed set of workflows that legitimately dispatch (execute-phase.md, quick.md, possibly others) and require the call. Non-listed workflows are out of scope. This matches `lint-vcs-no-raw-git.allow.json`'s "$schema_version: 2 per-entry" model.
- **Reuse `scripts/audit-workflow-raw-git.cjs`'s fence-aware scanner verbatim** — that audit already correctly distinguishes fences from prose; the new lint should share the helper module rather than re-implement the fence regex (which would create a v1.2-style "audit + lint must cover the same regex surface" coverage gap).

**Warning signs:**
- Lint fires on `code-review.md` / `audit-fix.md` / similar workflows that mention "wave" or "parallel" only in prose.
- Lint regex is at top-level (e.g., scans full file content, not fence-aware).
- Lint scope is defined as "all workflows" rather than "workflows that dispatch."

**Phase to address:**
Deferred-item-harvest phase, plan for the call-presence lint. RESEARCH must enumerate the closed dispatch-relevant-workflows set before plan-phase.

---

### Pitfall 8: Doc reconciliation over-automation produces robotic prose

**What goes wrong:**
v1.4 reconciles PROJECT.md's `### Validated` section against MILESTONES.md and per-phase SUMMARYs. The temptation: write a script that scans all SUMMARYs and emits a deterministic Markdown table to replace the hand-curated narrative. Result: PROJECT.md becomes a generated wiki page — true but unreadable. The current PROJECT.md `### Validated` section (lines 51-99) is hand-curated; it groups requirements by phase and adds context like "(caveat: A3 colocated pre-commit gap remains open, see Active)" — a script would emit raw lists without that context.

The opposite failure mode (under-automation): leave reconciliation to manual editing; drift creeps back within one milestone. The v14-docs-verify-only-followups themes are EVIDENCE that manual maintenance fails — 45 distinct failures across 8 themes accumulated despite ongoing care.

**Why it happens:**
- "Automate everything" is a default reflex on a cleanup milestone.
- The current PROJECT.md has both machine-friendly (the V*-NN requirement IDs) and human-friendly (the prose synthesis around them) content.
- The PROJECT.md `### Validated` section is referenced as drifted in the PROJECT.md itself ("NOTE: `### Validated` carries pre-Phase-11 drift").

**How to avoid:**
- **Two-pass reconciliation: machine-generate the requirement-coverage table, human-edit the narrative.** Ship a script (e.g., `scripts/reconcile-project-validated.cjs`) that emits a pure-machine `.planning/intel/project-validated-truth.md` containing one bullet per REQ-ID present in `.planning/milestones/v*-REQUIREMENTS.md` with its current status from `STATE.md`. The HUMAN edit of PROJECT.md cites this truth-source and adds narrative; the script is the SoT but the prose synthesis is the artifact.
- **Apply the v1.2 "three-layer audit pattern" here too:** closed verdict enum (each REQ-ID has a status from a fixed enum) + JSON sidecar (the truth file) + lint allowlist (the prose can intentionally diverge for narrative reasons, with explicit annotation).
- **Preserve hand-curated narrative blocks.** PROJECT.md `### Validated` has phase-grouping headers ("v1.0 — Dual-backend foundation:", "v1.1 — first upstream sync (Phase 7):") and parenthetical context ("(caveat: A3 colocated pre-commit gap remains open, see Active)"). These are NOT generated; they're synthesis. Document the reconciliation as "the script verifies REQ-ID lists are complete and statuses are accurate; the prose around each list is human-edited."
- **Decide reconciliation cadence**: every milestone close? Every phase? At v1.4 close only? The v1.3 retro shows the `### Validated` drift accumulated over four milestones (v1.0 → v1.3); reconciliation at every milestone close is the proportional response.

**Warning signs:**
- Reconciliation plan ships a `scripts/regenerate-project-md.cjs` that overwrites PROJECT.md whole.
- The reconciled PROJECT.md has zero parentheticals or qualifying notes.
- The reconciliation doesn't address how future drift is prevented (one-shot fix is band-aid).

**Phase to address:**
Drift-control + reconciliation phase, plan for PROJECT.md reconciliation.

---

### Pitfall 9: jj-reap test flake "fix" overshoots into broader test-perf rewrite

**What goes wrong:**
v14-jj-reap-test-flake says explicitly: "Phase 14 didn't modify `jj-reap.test.ts` or any code paths it covers." The flake is `jj-reap.test.ts > inclusion-filter` timing out at 5s under parallel test load. Root cause is likely test isolation / vitest parallelism — see memory `project_test_perf_pain_vitest` ("sdk/ vitest is the slow suite; user wants parallelism as first lever"). The OUT-OF-SCOPE clause in PROJECT.md is explicit: "broader test-perf sweep — only the specific `jj-reap.test.ts > inclusion-filter` flake is in scope."

Pitfall: the executor, seeing the test-perf memory entry, expands the fix into a broader vitest reorganization (concurrent: false, retry: N, file parallelism flag, custom isolate, etc.). This trips multiple v1.3 invariants:
- v1.3 Phase 10 SC5: "no `retry: N` added to vitest config" — explicit prohibition.
- v1.3 Phase 10 SC5: "vitest skip-count baseline unchanged (`scripts/check-skip-count.cjs` green)" — adding `it.skip` or `describe.skip` to fix the flake regresses the baseline.

**Why it happens:**
- The acceptance criteria allow "switch the suite to `concurrent: false`" — applied too broadly, that's a broader-test-perf change masquerading as a flake fix.
- The memory entry `project_test_perf_pain_vitest` is fresh in mind and tempts the executor to "kill two birds."

**How to avoid:**
- **Acceptance criteria narrowly scoped: per-test fix, not per-file or per-suite.** Use the v14-jj-reap-test-flake bullet `(a) Mark jj-reap.test.ts > inclusion-filter with a higher it.timeout(15_000)` as default; reach for `(b) Switch the suite to concurrent: false` ONLY if (a) is verified insufficient via the bisection step.
- **Plan-check: verify the fix touches ≤1 file and adds ≤5 LOC.** If the diff exceeds that, it has expanded beyond flake-fix.
- **Run `scripts/check-skip-count.cjs` as plan must-have, not verifier-only.** v1.3 retro Phase 10 SC5 has the precedent.
- **Out-of-scope reaffirmation in CONTEXT.md.** The phase CONTEXT.md MUST cite the PROJECT.md OOS clause verbatim.

**Warning signs:**
- Fix plan touches `sdk/vitest.config.ts`.
- Fix plan touches more than `jj-reap.test.ts`.
- Discussion of "while we're here, let's also fix [other slow test]."
- `check-skip-count` not in the plan's must-have list.

**Phase to address:**
The tactical-cleanup phase plan for `v14-jj-reap-test-flake`.

---

### Pitfall 10: Phase 14 review WR-NN fixes batched, losing per-finding traceability

**What goes wrong:**
v14-review-followups has 5 warnings (WR-01..05) + 5 info findings. The natural impulse on a cleanup milestone is one big "fix all v1.4 review followups" commit. Result: when a future regression bisect lands on that commit, the bisect-er can't tell which of 10 changes caused the regression. The v1.2 retro CR-01 critical "CJS-side miss the TS compiler couldn't catch" was found because each iteration was a separate `--fix` round; same forensic value applies here.

Also: WR-05 (CONFIG-02 test tmpDirs leak) is in test code; WR-03 (Array.isArray guard) is in production code; WR-02 (tar overlay semantics) is in a script. These are different surfaces with different verification needs. Batching them dilutes verification.

**Why it happens:**
- "5 small warnings, just batch them" is the obvious efficiency move.
- The acceptance criteria literally says "Each WR-NN addressed via specific commit (5 commits or 1 batched)" — allowing the batch.

**How to avoid:**
- **Per-finding commit; cite WR-NN in commit message.** This is the v1.2 pattern "commit-message-mentions-both-IDs as the in-band signal for same-commit/same-PR coupling" applied to per-finding traceability.
- **Verification cell per commit.** WR-03 has a contract test (envelope return); WR-04 has a NaN-guard test; WR-05 has a leak-detection test (afterEach cleanup verifiable via tmpDir existence assertion).
- **Reorder: prod-code fixes (WR-03, WR-04) first, then script fixes (WR-01, WR-02), then test fixes (WR-05).** Highest blast-radius first; fix-the-code-before-fixing-the-test invariant.
- **Reject the 5-info findings during plan-phase if they're not adjacent to a touched file.** The acceptance criteria says "Info items addressed opportunistically when adjacent files are touched" — interpret this literally; do not force them into the milestone if no fix lands in their file.

**Warning signs:**
- Single PR/commit titled "v1.4 review followups" with diff across 5+ unrelated files.
- No per-WR test added.
- Info findings batched with WR findings.

**Phase to address:**
Tactical-cleanup phase plan for `v14-review-followups`.

---

### Pitfall 11: v14-orphan-jj-workspace-dirs ownership ambiguity (dispatcher vs recovery)

**What goes wrong:**
v14-orphan-jj-workspace-dirs explicitly says "Decide ownership: dispatcher fan-in cleanup OR recovery-script post-restore cleanup OR both." If the decision is "both," it must be coordinated — two separate `rm -rf .claude/jj-workspaces/phase-*-subagent-*` invocations in two different files create double-cleanup and potential races (one shells while the other reads the same dir).

If the decision is "dispatcher only" but the recovery script needs the dirs gone (because `jj op restore` revealed them), the recovery is broken.

If the decision is "recovery only" but the dispatcher leaks dirs on every successful fan-in, disk fills over many dogfood/test cycles.

**Why it happens:**
- The todo's threat model says "Disk-space impact is bounded (~3MB per agent per wave)" — so leak feels survivable, biasing toward "recovery only" decision.
- The cleanup contract is documented in the memory `project_ephemeral_subagent_workspaces` ("workspaces are created, worked on, merged/reaped, gone") but the memory is silent on WHO does the reap.

**How to avoid:**
- **Single owner: dispatcher fan-in cleanup.** The memory's contract ("merged/reaped, gone") puts the obligation on the dispatcher, not the recovery script. Recovery is for unplanned rollback; cleanup is a planned terminal step. Dispatcher must own the planned path; recovery may add a defensive `rm -rf` as belt-and-suspenders.
- **Shared cleanup helper.** `sdk/src/vcs/jj/workspace-cleanup.ts` (or `parallel-cleanup.ts`) exports `cleanupSubagentWorkspaces(phaseRoot, phaseNumber)` that BOTH the dispatcher's `fanIn` SUCCESS branch AND the recovery script call. One implementation, two consumers. Same code path, no drift.
- **Integration with v1.4 parallel.cancel (Pitfall 5).** Cancel is the THIRD legitimate consumer of this cleanup helper. Plan ordering: ship cleanup helper FIRST; then orphan-dirs todo + cancel verb both reuse it.
- **Test: post-fan-in, no `.claude/jj-workspaces/phase-*-subagent-*` dirs exist.** Also post-cancel; also post-recovery. Three places, one assertion shape.

**Warning signs:**
- Two separate `rm -rf` calls in two files.
- Cleanup helper not extracted; inline in both call sites.
- Cancel pitfall (Pitfall 5) implemented before cleanup-helper extraction.

**Phase to address:**
The tactical-cleanup phase plan for `v14-orphan-jj-workspace-dirs`. Couple sequencing with the parallel.cancel plan in roadmap.

---

### Pitfall 12: 45 docs-update verify-only failures fixed without acknowledging archived/historical-prose carve-outs

**What goes wrong:**
v14-docs-verify-only-followups Theme 5 (3 failures): `docs/test-triage/jj-bugs.md` references `03-07-PLAN.md`, `03-RESEARCH.md`, `03-06-PLAN.md` — all archived per the v1.0 phase-archive sweep. The naive fix is "remove the dead links." The CORRECT fix may be "rehydrate the phase-3 docs into an archive subdirectory" (option (a) from the acceptance criteria) — preserving forensic trail.

The same issue arises in Theme 3 (ADR drift): "ADRs are by-convention immutable but drift this large warrants either correction or explicit 'superseded by ...' notes." Updating an ADR in place violates the ADR convention; adding supersession notes preserves history.

Pitfall: fix all 45 failures uniformly without per-theme decisions about historical-prose carve-outs, breaking forensic traceability for future archeology.

**Why it happens:**
- 45 failures feels like "just batch the fix" cleanup work.
- The verifier doesn't distinguish "broken link to archived content" from "broken link to never-existed content."
- The v1.2 audit's "historical-prose" verdict pattern (`scripts/audit-id-namespace.cjs`) exists for exactly this distinction but isn't applied to docs.

**How to avoid:**
- **Triage-then-fix.** First pass: for each of the 8 themes, decide the fix strategy (rewrite vs supersession-note vs archive-rehydrate vs delete-and-document). Record decisions in the phase CONTEXT.md or a `.planning/intel/docs-update-fix-triage.md`.
- **ADRs are immutable; add supersession notes.** ADR 0009 + ADR 0010 (Theme 3) get a new "## Update YYYY-MM-DD" section appending corrections, NOT in-line edits. This preserves the "ADR represents the decision at the time" convention.
- **Phase 3 archived planning: do not rehydrate.** Update `jj-bugs.md` to reference the closure commits (the change_ids) instead — those are stable and not subject to archive sweeps. This matches the v1.2 SoT-as-change_id pattern.
- **Theme 6 drift-control tests: see Pitfall 4** (separate handling; ship-after-fix-not-before).
- **Per-theme acceptance: 8 themes, 8 acceptance-criteria bullets, 8 plan tasks** (or 8 commits in one plan). The 45 failures are not 45 independent fixes.

**Warning signs:**
- A bulk-edit commit titled "docs-update verify-only cleanup" touching 18 docs.
- ADR files modified in-place without supersession notes.
- Theme 5's missing-archive references "fixed" by deleting the references rather than re-anchoring to commits.

**Phase to address:**
Tactical-cleanup phase plan for `v14-docs-verify-only-followups`.

---

## Integration Pitfalls (cross-cuts between v1.4 items)

### IP-1: Rename + drift-control-test interaction

**What goes wrong:**
The drift-control test `tests/architecture-counts.test.cjs` may encode the OLD name `rootCommits` in its prose-count enumeration (e.g., listing public verbs). If the rename ships first, the test breaks on its first run for a SECOND reason (besides Pitfall 4's already-drifted counts). If the test ships first with the old name encoded, the rename plan can't fix all consumers because the test is a consumer.

**Prevention:**
- Roadmap-time sequencing: rename plan ships BEFORE drift-control-test plan (in the deferred-item-harvest phase, before the drift-control phase).
- OR: the drift-control test reads verb names from `sdk/src/vcs/types.ts` interface AST (using TypeScript Compiler API) rather than hardcoding them. Then the rename auto-propagates.

**Phase:** Cross-phase coupling enforced at roadmap level.

---

### IP-2: parallel.cancel + workflow call-presence lint interaction

**What goes wrong:**
The new lint enforces `workspace.parallel.dispatch` is called in dispatch-relevant workflows. If a workflow ALSO needs to call `workspace.parallel.cancel` (e.g., a future cancel-on-stall workflow), the lint must EITHER also require cancel OR be tolerant of cancel-with-no-dispatch (a workflow that cancels someone else's dispatch). The v1.4 cancel verb does not have an obvious caller in workflows today — it's adapter-facing — but if it grows one, the lint surface must accommodate it.

**Prevention:**
- Lint's scope rule covers `dispatch` only; cancel is excluded from the call-presence requirement.
- Documented in lint header: "this lint enforces dispatch-call presence; cancel/fanIn are not required in workflows that don't dispatch."

**Phase:** Deferred-item-harvest phase plans for call-presence lint AND cancel — same wave.

---

### IP-3: assert_clean_wc gate broadening + Theme-1-author-machine-path fix interaction

**What goes wrong:**
The Phase 14 false-clean fix (Pitfall 2) broadened `assert_clean_wc` to ALL uncommitted paths, not just `.planning/`. v14-docs-verify-only-followups Theme 1 fixes touch 14 sites in `docs/{ja-JP,ko-KR}/superpowers/plans/...`. If the docs-fix plan's execute step does the 14 edits but the orchestrator commits only the first, the broadened assert_clean_wc would catch the un-committed 13 files — GOOD.

But: if Theme 1 fix is done via a script that doesn't snapshot intermediate state, and the script is invoked from inside a workflow markdown step, the workflow-final assert_clean_wc gate would fire on the script's intermediate output IF the script writes files before the workflow's commit step. Need to verify the script's commit happens before the workflow's gate.

**Prevention:**
- Theme 1 fix is a single mechanical script, single commit, single workflow step. Do not spread across multiple steps.
- If the script is invoked from a workflow, the workflow MUST commit immediately after the script returns; assert_clean_wc gate runs LAST.

**Phase:** Tactical-cleanup phase, docs-update plan.

---

### IP-4: PROJECT.md reconciliation + matchPrefix/idAlphabet new-API addition

**What goes wrong:**
The PROJECT.md reconciliation pass enumerates the `### Validated` section against REQ-IDs. If matchPrefix and idAlphabet ship in v1.4 with new REQ-IDs (e.g., REFS-07, REFS-08), they must be in the reconciled `### Validated` for v1.4 — but the reconciliation pass may run BEFORE the matchPrefix/idAlphabet plans complete (because the reconciliation work is itself a v1.4 plan). Result: reconciled PROJECT.md misses v1.4's own additions.

**Prevention:**
- Reconciliation runs in the LAST wave of v1.4 (after all deferred-item-harvest plans complete).
- OR: the reconciliation script reads from STATE.md's current snapshot rather than a phase-bound snapshot.
- Cross-reference: the v1.3 retro lesson "verifier IS the integration test for the integration tests" — applied here, the reconciliation IS the verification that all v1.4 REQ-IDs are accounted for.

**Phase:** Roadmap-level: reconciliation phase LAST.

---

### IP-5: parallel.cancel + v14-orphan-jj-workspace-dirs + recovery-script ordering

**What goes wrong:**
Three different consumers of the same cleanup logic (Pitfall 11). If implemented out-of-order:
- orphan-dirs todo ships first with inline cleanup → cancel has to refactor it.
- cancel ships first with cleanup helper → orphan-dirs todo has to refactor to consume it.
- recovery-script post-restore cleanup added independently → drift.

**Prevention:**
- Wave 1: extract `cleanupSubagentWorkspaces(phaseRoot, phaseNumber)` helper as standalone plan (no consumer changes).
- Wave 2 (parallel): orphan-dirs todo + cancel verb plans both call the new helper. Same wave OK because file-disjoint.
- Wave 3: recovery script update if needed.

**Phase:** Roadmap-level: helper-first wave; consumer waves after.

---

## Technical Debt Patterns

Cleanup-milestone-specific debt patterns.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Aliases for renamed APIs (`rootCommits` exported as deprecated alias of `rootRevisions`) | No breaking change for downstream consumers | Indefinite "should I use the new or old name?" debt; the v1.2 retro proved compiler-as-forcing-function works better | NEVER on this fork (no external consumers; full hard-rename per v1.2 precedent) |
| Drift-control tests in "warn-only" mode | First run is green | Warning fatigue → tests become noise; v1.2 lint pattern proved enforcement-from-day-1 works | Only if a fix-then-test ordering is genuinely infeasible (it is feasible here) |
| Bulk-edit commit for 45 docs-update fixes | One commit, fast review | Forensic bisect failure for any future docs-related regression | Never; per-theme commits required (Pitfall 12) |
| Skip Theme 5 (rehydrate-or-update phase-3 archived references) | No work | jj-bugs.md remains a doc with dangling pointers, drifting further over time | Acceptable IF the doc is itself archived rather than maintained |
| Inline duplication of workspace-cleanup logic (dispatcher + recovery + cancel) | Faster initial ship | Three-way drift surface; one bug-fix needs three commits (Pitfall 11) | Never; extract helper (Pitfall 11 prevention) |
| matchPrefix returning false on wrong-alphabet (instead of throw) | Familiar `String.startsWith` semantics | Silent wrong-answer bugs that don't surface until production (Pitfall 6) | Never on this codebase given v1.2 unified-revision-model invariants |

---

## Integration Gotchas

Cross-phase + cross-tool gotchas specific to v1.4's surfaces.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `assert_clean_wc` workflow gate (existing) + new mutating workflow step (v1.4) | New step assumes the existing gate covers it | Every new step that mutates `.planning/` or `docs/` MUST commit adjacent OR have a downstream gate; plan-check rule, not verifier-only |
| `rootRevisions` rename + `backends.ts` capability matrix | Rename the implementation, forget the matrix | Pre-rename grep audit MUST include `backends.ts:79` capability map (string-quoted, not type-checked) |
| `parallel.cancel` (new) + existing `fanIn` retry-after-cancel | Caller cancels then re-invokes `fanIn` on same handle | Cancel MUST set a flag on the handle; fanIn MUST refuse cancelled handles with explicit error |
| Drift-control tests + en-vs-translation strictness | Tests assert all 4 locales (en + 3 translations) match | Decide en-strict + translation-advisory at roadmap; translations naturally lag |
| docs-update fix + ADR immutability convention | In-place ADR edit | Append "## Update YYYY-MM-DD" section; never modify above the line |
| matchPrefix + `expr.rev` alphabet permissiveness | Match `expr.rev`'s alphabet-permissive surface (v1.2 known footgun) | matchPrefix MUST be stricter; throw on wrong alphabet (Pitfall 6) |

---

## Performance Traps

v1.4 doesn't add performance-sensitive surfaces; only the test-flake item touches perf. Listed for completeness.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Drift-control test reads whole filesystem on every CI run | Slow CI lane | Scope to specific dirs (`get-shit-done/workflows/`, `get-shit-done/commands/`, `agents/`); cache the count | Repo grows; >1000 files in scan dir |
| jj-reap test flake fix turns into broader vitest reorg | Slow test suite changes baseline | Per-test fix only; check-skip-count in must-haves (Pitfall 9) | When acceptance criteria allow concurrent: false (immediate) |
| matchPrefix invocations on hot path | If matchPrefix is called per-log-entry | matchPrefix is for prefix matching in tooling, NOT for tight loops; document on JSDoc | Never expected on this codebase (no log-traversal tooling exists yet) |

---

## Security Mistakes

Limited surface in v1.4; only the workflow-mutation gate and recovery script touch security-adjacent surfaces.

| Mistake | Risk | Prevention |
|---------|------|------------|
| `assert_clean_wc` gate bypassed by `GSD_SKIP_ASSERT_CLEAN_WC` env var | Devs disable safety check during debugging, forget to re-enable | NO env opt-out for assert_clean_wc; the v1.3 `GSD_HOOK_SKIP_COLOCATED` precedent is for backend-specific behavior, not safety gates |
| Recovery script `dogfood-restore.sh` runs without project-root assertion (WR-01) | `tar -xf` writes outside intended dir | WR-01 fix lands in v14-review-followups; verify before any other recovery surface ships |
| `parallel.cancel` with `--force` removal kills user's uncommitted work | Data loss | Cancel does NOT signal subagents (Pitfall 5); cancel cleanup is scoped to dispatcher-owned workspaces only |
| matchPrefix's prefix coming from untrusted input + boundary-io | If matchPrefix is called from CLI-arg processing | Validate prefix shape at CLI bridge BEFORE calling matchPrefix; matchPrefix is internal-only verb |

---

## UX Pitfalls

v1.4 is internal cleanup, but two operator-facing UX surfaces are touched: error messages and recovery flow.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| matchPrefix throws `WrongAlphabetError` with cryptic message | Operator sees stack trace, doesn't know what to fix | Throw message MUST say "Backend uses {alphabet} alphabet; got prefix '{prefix}' which is {detected-alphabet}; check that backend selection matches caller intent" |
| `assert_clean_wc` aborts with `git diff --name-only` raw output | Operator sees 50 file names, can't tell which class to fix | Group by class (`.planning/` mutations vs `docs/` translations vs source files); cite the v1.4 quick-task's error message format as precedent |
| Cancel reports `{cancelled: 3, leakedPaths: ['/...']}` without recovery hint | Operator knows there's a leak, doesn't know what to do | Append `recovery: 'Run dogfood-restore.sh or rm -rf .claude/jj-workspaces/phase-*-subagent-*'` field |

---

## "Looks Done But Isn't" Checklist

v1.4-specific. Run before declaring milestone close.

- [ ] **rootCommits rename:** `grep -rn '\brootCommits\b' --include='*.cjs' --include='*.ts' --include='*.js'` excluding `dist-cjs/` returns 0 hits. Compiler pass is NOT sufficient (Pitfall 3).
- [ ] **rootCommits rename:** `sdk/src/vcs/backends.ts` capability matrix entry renamed (`refs.rootRevisions: ...`). Easy to miss because it's a string literal, not a typed reference.
- [ ] **assert_clean_wc:** present in `transition.md` (v14-transition-md-update-gap closed). The Phase 14 quick-task fix covered only execute-phase + plan-phase.
- [ ] **assert_clean_wc:** broadened gate (not just `.planning/` scope) verified in execute-phase, plan-phase, transition. Commit `3fe538c0` should be the witness.
- [ ] **parallel.cancel:** does NOT signal subagents. Verify by reading the implementation; cancel surface is "release adapter resources," not "kill subagents."
- [ ] **parallel.cancel:** return shape includes `leakedPaths` field (or equivalent backend-opaque cleanup-incomplete indicator).
- [ ] **Orphan workspace dirs:** post-fanIn-success, `.claude/jj-workspaces/phase-*-subagent-*` does not exist. Test asserted, not just code-written.
- [ ] **matchPrefix:** throws on wrong-alphabet prefix (Pitfall 6); NOT returns false.
- [ ] **matchPrefix:** empty-prefix behavior documented and tested.
- [ ] **idAlphabet:** ships in same plan as matchPrefix (paired API).
- [ ] **Workflow call-presence lint:** does NOT fire on `code-review.md`, `audit-fix.md`, or other prose-only workflows (Pitfall 7 false positives).
- [ ] **Drift-control tests:** all translations either (a) corrected before tests ship, or (b) excluded from the test scope with explicit doc. Day-1 CI red did NOT occur.
- [ ] **docs-update Theme 3 ADRs:** updated via append-only supersession notes, NOT in-place edit.
- [ ] **docs-update Theme 5 phase-3 refs:** anchored to commits, NOT just deleted.
- [ ] **PROJECT.md reconciliation:** includes v1.4's own additions (matchPrefix, idAlphabet, cancel, rename, drift-tests). Reconciliation phase ran AFTER deferred-item-harvest phase.
- [ ] **Per-finding commits for WR-01..05:** each WR has its own commit OR clearly-delimited section of a single commit, with verification test added per WR.
- [ ] **jj-reap test flake fix:** touches only `jj-reap.test.ts`; `check-skip-count.cjs` green; `vitest.config.ts` untouched.
- [ ] **Cleanup helper:** single `cleanupSubagentWorkspaces` function consumed by dispatcher fanIn + recovery script + cancel verb. NOT three inline implementations.
- [ ] **Global install caveat:** documented in v1.4 close commit OR milestone-close prose that the operator must run `bin/install.js --global` to get the new workflow gates.
- [ ] **REQ-ID coverage:** every v1.4 REQ-ID is in PROJECT.md `### Validated` after reconciliation phase.

---

## Recovery Strategies

When pitfalls occur despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Rename half-completes (CJS consumer missed, runtime TypeError) | LOW | Identify via runtime error; grep-and-rename; add the missed call site to the audit script's grep coverage |
| assert_clean_wc fires false positive on a legit uncommitted file | LOW | Verify file is intentional; commit it as a separate prepatch; do NOT add env opt-out |
| matchPrefix returns wrong answer because wrong-alphabet check was forgotten | MEDIUM | Add throw to the impl; update tests; audit callers for silent-false-handling assumptions |
| Drift-control test reds CI day 1 because translation not fixed | LOW–MEDIUM | Revert the test ship; do the translation fix; re-ship test |
| parallel.cancel leaks workspaces because subagent was mid-write | MEDIUM | Run `scripts/dogfood-restore.sh` if recovery anchor exists; otherwise `rm -rf .claude/jj-workspaces/phase-*-subagent-*` |
| docs-update fix breaks ADR immutability convention | LOW | Revert the in-place edit; re-apply as append-only supersession note |
| Workflow call-presence lint false-fires on code-review.md | LOW | Add the workflow to the lint's allowlist (or scope to fence-only); push the rule decision back to plan-phase |
| PROJECT.md reconciliation produces robotic prose | MEDIUM | Hand-edit the narrative back; commit the truth source (`.planning/intel/project-validated-truth.md`) as the SoT; PROJECT.md cites the truth source but is human-written |
| v14-orphan-jj-workspace-dirs implemented twice (drift) | MEDIUM | Extract shared helper; refactor both consumers to call it; add test for the helper |
| Phase 14 false-clean pattern re-emerges in a new workflow | HIGH | Repeat the quick-task pattern: audit, fix, gate; mark in PITFALLS for v1.5 |

---

## Pitfall-to-Phase Mapping

Recommended roadmap structure for v1.4.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 (Scope creep) | All phases — closed acceptance at REQUIREMENTS.md write time | Plan must-haves count matches todo acceptance bullets count |
| 2 (Phase 14 false-clean repeat) | Tactical-cleanup phase, FIRST plan = transition.md gate | grep verification + workflow audit table updated |
| 3 (Rename ripple) | Deferred-item-harvest phase, rootRevisions plan | Pre-rename JSON audit + post-rename `grep -c` exit 0 across .ts, .cjs, .md (excl archived) |
| 4 (Drift-tests before drift-fix) | Drift-control phase, with strict Wave 1 = fix, Wave 2 = test ordering | Wave 2 must-haves cite Wave 1 completion |
| 5 (parallel.cancel races) | Deferred-item-harvest phase, cancel plan | Cancel contract test: cancel-while-in-flight asserts no false-reap entry |
| 6 (matchPrefix wrong-alphabet silent false) | Deferred-item-harvest phase, matchPrefix+idAlphabet plan | Test asserts throw on hex-prefix-against-jj-id |
| 7 (Call-presence lint false positives) | Deferred-item-harvest phase, lint plan | Lint scope decision documented; false-positive workflows enumerated |
| 8 (Doc reconciliation over-automation) | Drift-control phase, PROJECT.md reconcile plan | Reconciled PROJECT.md retains hand-curated parentheticals; truth source committed separately |
| 9 (jj-reap flake fix overshoot) | Tactical-cleanup phase, jj-reap flake plan | Diff ≤5 LOC, single-file, check-skip-count green |
| 10 (WR-NN fixes batched) | Tactical-cleanup phase, WR-NN plan | Per-WR commit OR per-WR delimited section; per-WR verification test |
| 11 (Orphan-dirs ownership ambiguity) | Tactical-cleanup phase, with cleanup-helper Wave 1, consumers Wave 2 | Single helper module; three call sites |
| 12 (Docs-update bulk fix loses history) | Tactical-cleanup phase, docs-update plan | Per-theme decisions in CONTEXT.md; ADR append-only; phase-3 refs anchored to commits |
| IP-1 (Rename + drift-test) | Roadmap-level sequencing | Rename ships before drift-control-tests OR test reads names from AST |
| IP-2 (cancel + call-presence lint) | Same wave; lint excludes cancel from required-presence | Lint documented scope |
| IP-3 (assert_clean_wc + docs-fix) | Theme 1 fix is single-step single-commit | grep verification post-commit |
| IP-4 (Reconciliation + new REQ-IDs) | Reconciliation phase LAST | v1.4's own REQ-IDs in reconciled PROJECT.md |
| IP-5 (Cleanup helper across 3 consumers) | Helper extraction Wave 1; consumers Wave 2 | Same helper imported in all three call sites; no inline duplicates |

---

## Sources

**Codebase-specific (HIGH confidence):**

- `.planning/PROJECT.md` (current state, Key Decisions, milestone scope) — read in full
- `.planning/MILESTONES.md` (v1.0/v1.1/v1.2/v1.3 key accomplishments) — read in full
- `.planning/RETROSPECTIVE.md` (v1.2 + v1.3 retros — "What Was Inefficient," "Patterns Established," "Key Lessons") — read in full
- `.planning/milestones/v1.3-ROADMAP.md` (Phase 9–14 success criteria, plan structure, Pitfall 10) — read in full
- `.planning/todos/pending/v14-transition-md-update-gap.md` — Phase 14 false-clean repeat surface
- `.planning/todos/pending/v14-orphan-jj-workspace-dirs.md` — cleanup contract gap
- `.planning/todos/pending/v14-review-followups.md` — WR-01..05 + 5 info findings
- `.planning/todos/pending/v14-jj-reap-test-flake.md` — test isolation flake
- `.planning/todos/pending/v14-docs-verify-only-followups.md` — 45 failures, 8 themes
- `.planning/quick/260523-ovw-investigate-how-that-happened-and-potent/SUMMARY.md` — the Phase 14 quick-task audit table with HIGH-RISK classifications (verbatim source for Pitfall 2)
- `.planning/intel/v1.3-dogfood-metrics.md` — baseline + recovery anchor structure
- `scripts/audit-workflow-raw-git.cjs` — LINT-04 reference implementation; baseline-regression-guard model for Pitfall 4's audit-as-baseline reframe
- `scripts/lint-vcs-no-raw-git.cjs` + `lint-vcs-no-raw-git.allow.json` — per-entry allowlist v2 schema, default-deny model, reference for call-presence lint shape (Pitfall 7)
- `sdk/src/vcs/types.ts:363, 405–456` — current `rootCommits` interface + `VcsWorkspaceParallel` cancel insertion point
- `sdk/src/vcs/jj/parallel.ts:1–100, 270–425` — jj-side fanIn body; cancel must couple here
- `sdk/src/vcs/git/parallel.ts:1–60` — git-side adapter sidecar; cancel must couple here
- `sdk/src/vcs/backends.ts:79` — capability matrix entry for `refs.rootCommits` (Pitfall 3 hidden site)
- `sdk/src/vcs/__tests__/baseline-parity.test.ts:298` — only production-style `.startsWith` caller (Pitfall 6 scope check)
- `docs/ARCHITECTURE.md:121, 143, 181, 599` + `docs/ja-JP/ARCHITECTURE.md:116, 127, 137, 427` + ko-KR / pt-BR mirrors — drift evidence for Pitfall 4
- Memory `feedback_workflow_assert_clean_wc` — Phase 14 incident memory; broadened gate caveat
- Memory `project_ephemeral_subagent_workspaces` — cleanup contract for Pitfall 11
- Memory `project_no_orchestrator_sidecar_state` — no-on-disk-handle rule (Pitfall 5 contract)
- Memory `project_test_perf_pain_vitest` — Pitfall 9 scope-creep tempting context
- Memory `feedback_solo_dev_no_expires` — solo-dev allowlist schema (Pitfall 7 lint design)
- Recent commit `3fe538c0 fix(workflow): broaden assert_clean_wc gate to ALL uncommitted paths` — broadened-scope verifier for Pitfall 2

**Personal experience / known issues:**

- v1.2 retro CR-01 critical: CJS-side rename miss (`commands.cjs`) after TS hard rename — the direct precedent for Pitfall 3.
- v1.3 retro Phase 11 inflation: 5 verifier-induced closure plans; verifier-as-integration-test pattern — the precedent for "fix the test that should have caught this" (Pitfalls 5, 6).
- v1.3 retro Phase 14 latent `jq .ok // "true"` bug — the precedent for "every envelope guard needs explicit if-then-else" (Pitfall 7's call-presence lint scope rule).
- v14-orphan-jj-workspace-dirs todo + Phase 14 dogfood empirical observation — direct precedent for Pitfall 11 ownership decision.

---
*Pitfalls research for: v1.4 cleanup-before-upstream-pull*
*Researched: 2026-05-24*
