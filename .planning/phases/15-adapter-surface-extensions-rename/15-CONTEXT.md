# Phase 15: Adapter surface extensions + rename - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Three new public verbs ship on the cross-backend `VcsAdapter` surface (`vcs.refs.idAlphabet`, `vcs.refs.matchPrefix`, `vcs.workspace.parallel.cancel`) and the v1.2 NAMING-01 deferred `rootCommits` → `rootRevisions` rename completes across 26 production sites + the `sdk/src/vcs/backends.ts:79` capability matrix string literal. Pure adapter-surface work; no workflow markdown change, no CI lane change. Sequential 4-plan ordering forced by file-overlap on `sdk/src/vcs/types.ts` + `backends/{git,jj}.ts`. The `cleanupSubagentWorkspaces` shared helper extracted by 15.04 Wave 1 (PARALLEL-07) is consumed by Phase 16 CLEANUP-02 — single owner per IP-5, three call sites (15.04 cancel, 16.02 fanIn clean-path branch, 16.02 dogfood-restore.sh).

Requirements: NAMING-01, VCS-21, VCS-22, PARALLEL-07.

</domain>

<decisions>
## Implementation Decisions

### Carried Forward (from ROADMAP.md Phase 15 entry + `.planning/research/SUMMARY.md`)

These were settled by research + roadmap creation; downstream agents MUST NOT re-litigate.

- **CF-01:** Sequential plan order within phase: 15.01 rename → 15.02 idAlphabet → 15.03 matchPrefix → 15.04 cancel. File-overlap on `types.ts` + `backends/{git,jj}.ts` forces serial, NOT parallel waves. (ROADMAP Phase 15 Plans block.)
- **CF-02:** 15.01 `rootCommits` → `rootRevisions` is a hard rename, no deprecation alias (v1.2 NAMING-01 `LogEntry.hash → .id` precedent). Archived `.planning/research/.archive-pre-v1.4/` + `.planning/milestones/v1.2-research/` are historical-prose carve-outs (not renamed). The `sdk/src/vcs/backends.ts:79` capability matrix STRING LITERAL `'refs.rootCommits'` MUST flip (TS compiler does not catch string-keyed object access — Pitfall 3 / v1.2 retro CR-01 precedent).
- **CF-03:** 15.02 `vcs.refs.idAlphabet` returns opaque `readonly string` — `'0-9a-f'` (git) / `'k-z'` (jj). FEATURES.md's structured `{kind, chars, minLen, maxLen}` alternative REJECTED — YAGNI; consumers compose `^[${alphabet}]+$` themselves; widen to structured later if a real consumer needs it.
- **CF-04:** 15.03 `vcs.refs.matchPrefix(id: RevisionExpr, prefix: string): boolean` — **throws** on wrong-alphabet (Pitfall 6 — silent-false would mask caller bugs); throws on empty prefix (caller bug); returns `false` on `prefix.length > id.length` (no possible match); hex case-insensitive (matches git `core.abbrev` behavior); k-z lower-only (matches jj prefix index). Test cross-product mandatory (5 rules × 2 backends = 10 cases minimum).
- **CF-05:** 15.04 `vcs.workspace.parallel.cancel(handle: ParallelDispatchHandle): CancelResult` — **synchronous teardown only** (STACK lens / Pitfall 5). The `spawnSync` exec layer at `sdk/src/vcs/exec.ts:19` cannot accept `AbortSignal`; Phase 11 D-01 orchestrator-awaits-`Agent()` invariant + Phase 9 PARALLEL-03 deferral rationale make mid-flight cancel a non-problem in production. Cancel does NOT signal subagents (operator uses Claude Code UI/CLI to kill subagents; cancel only cleans up workspaces post-mortem). The FEATURES "interrupt mid-Agent" use case is OUT OF SCOPE for v1.4 and would require a separate `vcsExecAsync` primitive in a future milestone (see Deferred Ideas).
- **CF-06:** 15.04 cancel cleanup mechanics: `workspace.forget` + `rm -rf` (jj) or `worktree remove --force` (git) + `bookmarks.delete({force:true})`. Reuses the shared `cleanupSubagentWorkspaces` helper extracted as 15.04 Wave 1.
- **CF-07:** New CLI bridge `sdk/src/query/workspace-parallel-cancel.ts` registered at all three sites (catalog-domain + manifest.non-family + aliases.generated). Missing any one site breaks runtime verb resolution.
- **CF-08:** No fold-in of pending todos — all 5 v14-* todos in `.planning/todos/pending/` are mapped via REQUIREMENTS.md traceability to Phases 16/17/18, NOT Phase 15.

### CancelResult Envelope Shape

- **D-01:** `CancelResult = { abandoned: readonly string[]; failedReaped: readonly string[]; surplusBookmarks: readonly string[]; surplusWorkspaces: readonly string[] }`. **4-field envelope.** Mirrors `FanInResult.failedReaped` naming verbatim (v1.3 surface symmetry at `sdk/src/vcs/types.ts:539`). Pitfall 5's "leakedPaths-equivalent field" guidance is satisfied by `failedReaped` populated with workspace paths/names that resisted teardown — same data, single field. Pure JSON; no closures, methods, or Symbols (Phase 9 D-05 frozen-pure-JSON invariant for parallel-domain return shapes).
- **D-02:** Field semantics (JSDoc must spell out at landing time):
  - `abandoned`: workspace identifiers (path or agentId — planner picks; recommend agentId for orchestrator-identifier consistency) fully torn down.
  - `failedReaped`: workspace identifiers that resisted teardown (caller can grep FS to confirm). On clean cancel, length is 0.
  - `surplusBookmarks`: bookmark names that needed force-delete (per `FanInResult` precedent at parallel.ts; typically `[]` on jj clean branch by octopus construction; git side may carry `worktree-agent-*` entries).
  - `surplusWorkspaces`: workspace paths that were still on disk pre-cancel (counted at entry, regardless of cleanup outcome).
- **D-03:** Cancel is **idempotent** — re-calling on an already-cancelled handle returns `CancelResult` with empty arrays (no error). Matches Phase 11 D-01 "no orchestrator sidecar state" — the handle's `workspaces` array is the source of truth at call time.

### cleanupSubagentWorkspaces Helper Location

- **D-04:** Helper lives at **`sdk/src/vcs/jj/workspace-cleanup.ts`** (new sidecar). Matches v1.3 sidecar pattern (`conflict-paths.ts`, `incomplete-work.ts`). Isolates the helper from `reap.ts`'s W3 (a) "leave conflicted workspaces for inspection" contract — cancel's "tear down everything explicitly requested" contract diverges, and the file boundary makes the divergence enforceable.
- **D-05:** Signature: `cleanupSubagentWorkspaces(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly string[]): CleanupSubagentWorkspacesResult` where `CleanupSubagentWorkspacesResult = { abandoned: readonly string[]; failedReaped: readonly string[] }`. Returning a partial-CancelResult-shape (NOT void) lets the cancel verb body and the dispatcher fanIn branch both unify the helper output into their respective envelopes without re-enumerating disk state. (Amended 2026-05-24 from the original `(phaseRoot, phaseNumber)` 2-arg form per Open Q1 RESOLVED; `mainRepoRoot` is the colocated jj repo root not `.planning/phases/{NN}/`; optional `workspaces` lets the cancel verb pass the Handle's known list — mitigates Pitfall 4.)
- **D-06:** Helper is **idempotent** by contract — missing dirs are not errors; `workspace.forget` is best-effort; failed `rm -rf` populates `failedReaped`. Pattern-matches enumeration: `.claude/jj-workspaces/phase-${phaseNumber}-subagent-*` via `readdirSync` + suffix glob (no shell out).
- **D-07:** UPSTREAM-02 sidecar discipline: does NOT import from `backends/jj.ts`. Imports `vcsExec` from `../exec.js` for the `jj workspace forget` call; uses `node:fs` for the `rmSync({recursive: true, force: true})` call.
- **D-08:** For Phase 16 CLEANUP-02's `scripts/dogfood-restore.sh` consumer (bash → TS bridge): add a CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` in Phase 16 (NOT Phase 15 — Phase 15 ships only the TS helper + cancel CLI bridge). Bash invokes `gsd-sdk query cleanup-subagent-workspaces --phase N`. **This is a Phase 16 detail noted here for IP-5 single-owner coherence only; no Phase 15 obligation.**

### rootCommits Rename Audit JSON Schema

- **D-09:** Audit emitted at **`.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json`** with **grouped-by-extension** schema (amended 2026-05-24 from the original `.planning/phases/15/...` numeric-dir form to the slug-matched form per anchor A5 in RESEARCH.md — slug-matched matches the v1.4 phase-directory naming convention and prevents creating a sibling polluting `.planning/phases/`):

  ```json
  {
    "generatedAt": "<ISO timestamp>",
    "totalCount": 26,
    "byExtension": {
      "ts": [{ "file": "sdk/src/vcs/types.ts", "line": 363, "snippet": "  rootCommits(opts: { rev?: RevisionExpr }): string[];" }],
      "cjs": [{ "file": "...", "line": N, "snippet": "..." }],
      "md":  [{ "file": "...", "line": N, "snippet": "..." }],
      "json": []
    },
    "specialCases": [
      { "file": "sdk/src/vcs/backends.ts", "line": 79, "kind": "capability-matrix-string-literal", "snippet": "'refs.rootCommits': Object.freeze(['git', 'jj-colocated'] as const)," }
    ],
    "carveOuts": [
      { "path": ".planning/research/.archive-pre-v1.4/", "reason": "historical-prose, pre-rename research artifacts (ROADMAP Phase 15 SC1 carve-out)" },
      { "path": ".planning/milestones/v1.2-research/", "reason": "historical-prose, v1.2 deferred-item research (ROADMAP Phase 15 SC1 carve-out)" }
    ],
    "idempotencyHash": "<md5 of sorted file list + per-extension counts>"
  }
  ```

- **D-10:** Per-extension `grep -c '\brootCommits\b'` (excluding carveOuts) must exit 0 BEFORE commit (ROADMAP Phase 15 SC1 verification gate). The grouped `byExtension` structure makes this gate trivial — for each extension, the post-rename count MUST equal 0; the pre-rename count MUST equal `byExtension[ext].length`.
- **D-11:** `specialCases` field surfaces the `backends.ts:79` capability matrix string literal explicitly so reviewers/planners cannot miss it (Pitfall 3 / v1.2 retro CR-01 prevention — TS compiler does not catch object-key strings).
- **D-12:** `idempotencyHash` (MD5 over sorted `{file, line}` tuples + per-extension counts) catches the "someone added a new `rootCommits` reference between audit-generation and rename-commit" failure mode. Plan 15.01's audit-generation and rename steps must run in adjacency (no other commits between).
- **D-13:** Audit generator is a one-shot Node script (NOT a CI lint — single-purpose, runs once during 15.01 execute, never again). Lives at `scripts/audit-root-commits-rename.cjs` (lowercase, kebab-case, mirrors `scripts/audit-workflow-raw-git.cjs` shape). Stdout-only output per `feedback_avoid_jj_auto_tracked_output` memory; never writes into the colocated-jj working tree directly — the JSON sidecar is written by the script's caller (Plan 15.01 task), not by the audit generator itself. Discarded after milestone close.

### Claude's Discretion

These are planner-level details NOT pinned at discuss-phase:
- Exact JSDoc wording on the new `idAlphabet` / `matchPrefix` / `cancel` methods (planner judgment).
- Whether `CancelResult.abandoned` carries agentId, workspace name, or workspace path (recommendation: agentId, per orchestrator-identifier consistency; planner confirms).
- Test fixture choice (Pattern B random-prefix `mkdtemp` is the v1.3 default and should be honored, but exact test names are planner judgment).
- Helper internal: whether `cleanupSubagentWorkspaces` enumerates via `readdirSync` + suffix filter vs. `jj workspace list --quiet` + name-prefix filter (recommendation: filesystem-first since it survives partial jj state; planner picks).
- Exact JSON serialization order in the audit sidecar (sorted-keys recommended for deterministic re-runs; planner standard).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authoritative scope (locked requirements + roadmap)

- `.planning/REQUIREMENTS.md` §"Deferred-Item Harvest (API Additions/Parallel Verb/Rename)" — verbatim acceptance criteria for NAMING-01, VCS-21, VCS-22, PARALLEL-07.
- `.planning/ROADMAP.md` §"Phase 15: Adapter surface extensions + rename" — Success Criteria 1-5 are the contract; do not narrow or widen.
- `.planning/PROJECT.md` §"Current Milestone: v1.4" — milestone framing, OOS clauses (especially `vcsExecAsync` async-exec primitive is OOS).

### Research (v1.4-specific synthesis — extensive design pre-work)

- `.planning/research/SUMMARY.md` §"Phase 15 — Adapter surface extensions + rename" + §"Gaps to Address" — the 3-flag synthesis (cancel semantics, idAlphabet shape, drift-test file-count); discuss-phase adopted Pitfall 5's STACK lens for cancel.
- `.planning/research/STACK.md` — `spawnSync` is load-bearing; AbortController/AbortSignal are Node ≥22 native but cannot thread through `spawnSync`; zero net-new dependencies.
- `.planning/research/FEATURES.md` — industry precedents (Tokio JoinSet, GNU parallel, GitHub Actions matrix for cancel; Git `core.abbrev`, jj prefix index for matchPrefix; actionlint, lint-vcs-no-raw-git for the lint deferred to Phase 16).
- `.planning/research/ARCHITECTURE.md` §"Per-Item" — file-change tables; anti-patterns; three-site CLI registration pattern at exact file paths.
- `.planning/research/PITFALLS.md` Pitfalls 3, 5, 6, 11 — directly govern Phase 15; "Looks Done But Isn't" checklist applies to milestone-close gating.

### Adapter-surface insertion sites (read at planning time)

- `sdk/src/vcs/types.ts:336-518` — insertion points for new `idAlphabet` property, new `matchPrefix` method, new `cancel` method, and the `rootCommits` → `rootRevisions` rename target.
- `sdk/src/vcs/types.ts:533-541` — `FanInResult` interface (precedent for `CancelResult` field naming, especially `failedReaped`).
- `sdk/src/vcs/types.ts:453-456` — `VcsWorkspaceParallel` interface; `cancel` adds as the third method.
- `sdk/src/vcs/types.ts:493-518` — `ParallelDispatchHandle` interface (cancel input shape).
- `sdk/src/vcs/backends.ts:75-95` — capability matrix; `'refs.rootCommits'` string literal at :79 MUST flip; new `'refs.idAlphabet'`, `'refs.matchPrefix'`, `'workspace.parallel.cancel'` rows added.
- `sdk/src/vcs/backends/git.ts:554` — git `refs` namespace freeze (insertion site for new ref methods).
- `sdk/src/vcs/backends/jj.ts:776` — jj `refs` namespace freeze (insertion site for new ref methods).
- `sdk/src/vcs/exec.ts:1-54` — `spawnSync`-only exec surface; load-bearing constraint that forces synchronous-teardown-only cancel semantics.

### Sidecar precedent + adjacent files (15.04 helper extraction)

- `sdk/src/vcs/jj/parallel.ts` — composition layer (dispatch + fanIn); cancel adds as the third orchestration verb; helper is consumed here.
- `sdk/src/vcs/jj/reap.ts` — abandon+forget+rm-rf for orphan crashed agents; **does NOT host the new helper** (W3 (a) inspection-contract divergence — D-04).
- `sdk/src/vcs/jj/octopus.ts` — phase structure creation; sibling to the new `workspace-cleanup.ts`.
- `sdk/src/vcs/jj/conflict-paths.ts`, `sdk/src/vcs/jj/incomplete-work.ts` — v1.3 sidecar template pattern that `workspace-cleanup.ts` mirrors.

### Verification + rename audit

- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:49-75` — empirical alphabet-disjointness probe; `idAlphabet` impl must align.
- `sdk/src/vcs/format-migration/rewrite.ts:53,63` — existing `GIT_SHA_RE = /[0-9a-f]{7,40}/` + `JJ_CID_RE = /[k-z]{8,12}/` regex patterns are the de facto alphabet sources; `idAlphabet` is the canonical name for the bare alphabet substring.
- `sdk/src/vcs/expr.ts:35,41` — existing `SHA_OR_CHANGE_ID_RE = /^[0-9a-fA-F]{4,40}$|^[k-z]{4,40}$/` is a candidate consumer of the new `idAlphabet` (per SUMMARY §"three ad-hoc duplications").
- `scripts/audit-workflow-raw-git.cjs:39-50,98-130` — fence-aware markdown walker shape; **NOT consumed in Phase 15** (no markdown change), but referenced in audit-script style precedent.
- `.planning/intel/id-namespace-audit.json` — v1.2 audit JSON sidecar precedent that the `rootCommits-rename-audit.json` schema (D-09) follows.

### CLI bridge registration

- `sdk/src/query/cli/manifest.ts` — manifest.non-family registration site for the new `workspace-parallel-cancel` bridge.
- `sdk/src/query/cli/aliases.ts` — aliases.generated registration site.
- `sdk/src/query/cli/catalog.ts` (or equivalent) — catalog-domain registration site. (Plan 15.04 confirms exact paths from current source.)

### Memory directives that apply here

- `project_unified_revision_model` — `idAlphabet` is opaque, NOT discriminated; cross-backend surface stays single-typed.
- `project_no_orchestrator_sidecar_state` — `CancelResult` is pure frozen JSON; no Symbols/closures/methods.
- `project_squash_model` — irrelevant for Phase 15 (no commit-creation surface).
- `feedback_avoid_jj_auto_tracked_output` — audit script (D-13) is stdout-only; sidecar JSON is written by the plan task, not by the script.
- `project_planning_id_migration` — informs the `rootCommits` → `rootRevisions` symmetry analysis (rename is in same family of "fix terminology drift" work).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`FanInResult` interface** (`sdk/src/vcs/types.ts:533-541`) — direct precedent for `CancelResult` field naming (`failedReaped`, `surplusBookmarks`).
- **`vcs.workspace.parallel.fanIn` clean-path branch** in `sdk/src/vcs/jj/parallel.ts` — call site that Phase 16 CLEANUP-02 extends to consume the new `cleanupSubagentWorkspaces` helper.
- **`sdk/src/vcs/jj/reap.ts` abandon+forget+rm-rf flow** — reusable code patterns (NOT the file itself per D-04); the helper replicates the per-workspace teardown pattern with simpler classification (no diff probe).
- **`sdk/src/vcs/format-migration/rewrite.ts:53,63` alphabet regexes** — existing `[0-9a-f]` / `[k-z]` literals that `idAlphabet` is the canonical-source for; planner may refactor these to consume the new property (NOT mandatory in Phase 15 — refactor in Phase 17 docs-drift or later).
- **`sdk/src/vcs/expr.ts:35,41` SHA-or-changeId regex** — same pattern; same optional refactor.
- **v1.2 `.planning/intel/id-namespace-audit.json`** — schema precedent for the rename audit sidecar (D-09).

### Established Patterns

- **UPSTREAM-02 sidecar discipline** — `sdk/src/vcs/jj/*.ts` sidecars do NOT import from `backends/jj.ts`; helper at `workspace-cleanup.ts` must follow.
- **Three-site CLI bridge registration** (catalog-domain + manifest.non-family + aliases.generated) — load-bearing; missing any one breaks runtime verb resolution. Audit-confirmed at Phase 11 plan 02.
- **Hard-rename, no alias** — v1.2 NAMING-01 precedent (`LogEntry.hash` → `.id` shipped without alias; saved ~14 production + ~25 test consumers from being shimmed twice).
- **Pre-rename JSON sidecar audit** — Pitfall 3 invariant; v1.2 retro CR-01 (`commands.cjs:1005` miss) is the canonical "compiler doesn't catch CJS/markdown" failure mode.
- **Frozen pure JSON for parallel-domain return shapes** — Phase 9 D-05; `CancelResult` MUST be `Object.freeze`-compatible (no closures, methods, Symbols).
- **vitest custom matcher `toBeIdOf`** at `tests/__tools__/vitest-matchers.ts` — should be used in `matchPrefix` tests instead of raw hex regexes (per `feedback_vitest_extend_over_free_fn` memory).

### Integration Points

- New rows in `sdk/src/vcs/backends.ts` capability matrix for `'refs.idAlphabet'`, `'refs.matchPrefix'`, `'workspace.parallel.cancel'` (all `['git', 'jj-colocated']`).
- New CLI bridge `sdk/src/query/workspace-parallel-cancel.ts` registered at 3 sites.
- Optional: Phase 16 also adds CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` to feed `scripts/dogfood-restore.sh` (D-08 — noted here only for cross-phase coherence; NOT a Phase 15 obligation).
- Existing alphabet regexes at `expr.ts:41`, `format-migration/rewrite.ts:53,63` can OPTIONALLY consume the new `idAlphabet` (cosmetic refactor; deferred unless planner judgment otherwise).

</code_context>

<specifics>
## Specific Ideas

- **CancelResult must be JSON-serializable for the CLI bridge envelope** — the `gsd-sdk query workspace.parallel.cancel` CLI form emits the envelope as JSON; `readonly string[]` arrays serialize cleanly. No surprises here.
- **Test cross-product for matchPrefix is mandatory** — 5 rules (canonical-match, wrong-alphabet-throw, empty-prefix-throw, prefix-too-long-false, case-insensitivity-for-hex) × 2 backends = 10 cases minimum.
- **`carveOuts` field in the rename audit JSON** — explicitly lists `.planning/research/.archive-pre-v1.4/` and `.planning/milestones/v1.2-research/` as historical-prose carve-outs (provenance for reviewers).
- **Helper signature returns partial CancelResult** — `{abandoned, failedReaped}` (2 fields) so cancel can unify with bookmark cleanup output into the full 4-field CancelResult, and fanIn-clean-path can ignore the failedReaped or surface it via its own field path.

</specifics>

<deferred>
## Deferred Ideas

These came up during synthesis and belong in OTHER phases or future milestones. Do not lose them; do not act on them in Phase 15.

- **`vcsExecAsync` async-exec primitive** — would enable mid-Agent signal-based cancellation (the FEATURES.md "interrupt mid-Agent" use case). NOT justified by current callers (Phase 11 D-01 orchestrator-awaits-`Agent()` invariant). Defer to a future milestone if ever justified. Explicit OOS in PROJECT.md.
- **Workflow-callable cancel verb** — cancel is adapter-facing only in v1.4; future milestones can adopt at workflow level if a use case emerges. Explicit OOS in PROJECT.md.
- **`gsd-sdk query refs.match-prefix` CLI bridge** — no production caller in v1.4; not registering the bridge for `matchPrefix`. Defer until a production caller emerges. Explicit OOS in PROJECT.md.
- **Refactor `expr.ts:41` + `format-migration/rewrite.ts:53,63` to consume new `idAlphabet`** — cosmetic cleanup; can land in Phase 17 docs-drift batch or later. NOT a Phase 15 obligation.
- **CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts`** — needed by Phase 16 CLEANUP-02's `dogfood-restore.sh` consumer. Ships in Phase 16, NOT Phase 15. Noted in D-08 for IP-5 single-owner cross-phase coherence only.
- **Widen `idAlphabet` to structured `{kind, chars, minLen, maxLen}`** — FEATURES.md alternative; deferred until a real consumer needs length bounds. YAGNI applies (CF-03).
- **Promote `cleanupSubagentWorkspaces` to cross-backend** (currently jj-only because orphan-dirs are only a jj problem; git's `worktree remove --force` already handles teardown) — defer until git-side orphan-dirs become a problem.

### Reviewed Todos (not folded)

The 5 v14-* todos in `.planning/todos/pending/` matched on keyword coincidence at score 0.6 but are NOT folded into Phase 15 because each is already mapped via REQUIREMENTS.md traceability to a different phase:

- `v14-transition-md-update-gap.md` → CLEANUP-01 → Phase 18 (workflow gate)
- `v14-orphan-jj-workspace-dirs.md` → CLEANUP-02 → Phase 16 (consumes the helper extracted by Phase 15)
- `v14-review-followups.md` → CLEANUP-03..07 → Phase 18 (Phase 14 code-review WR-01..05 hardening)
- `v14-jj-reap-test-flake.md` → TEST-17 → Phase 18 (narrow-scope test flake)
- `v14-docs-verify-only-followups.md` → DOCS-01..09 → Phase 17 (drift cleanup)

</deferred>

---

*Phase: 15-Adapter surface extensions + rename*
*Context gathered: 2026-05-23*
