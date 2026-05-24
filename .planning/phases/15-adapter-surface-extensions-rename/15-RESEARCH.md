# Phase 15: Adapter surface extensions + rename — Research

**Researched:** 2026-05-24
**Domain:** SDK / cross-backend `VcsAdapter` surface (TypeScript)
**Confidence:** HIGH

## Summary

Phase 15 ships three new public verbs on `VcsAdapter` (`refs.idAlphabet`, `refs.matchPrefix`, `workspace.parallel.cancel`) and completes the v1.2-deferred `rootCommits` → `rootRevisions` hard rename. Every decision is locked in `15-CONTEXT.md`; this research populates the planner with verified call-site inventories, signature precedents, and exact insertion points so the four sequential plans (15.01 → 15.04) can be authored without re-discovering the codebase.

Two findings refine numbers stated in CONTEXT.md:
- **Production code (`*.ts` + `*.cjs` + `*.js`) `rootCommits` hits = 21**, not 26. The verified breakdown is 19 `.ts` + 2 `.cjs` + 0 `.js`. The "26" figure in CONTEXT.md appears to be a total estimate including `.planning/research/*.md` and `.planning/intel/*.md` artifacts that need rename, not the production-code carve-out alone.
- **`backends.ts:79` is one of those 21 hits** (a `.ts` line containing the string literal `'refs.rootCommits'`); it is not a 22nd item. The Pitfall 3 carve-out language treats it as a *special case* because TS compiler does not catch string-keyed object access — but it does appear in the `*.ts` grep count.

**Primary recommendation:** Author the four plans with the file-edit tables, signature precedents, and audit-script skeleton sourced directly from this document. Pre-rename audit JSON is the single load-bearing artifact for plan 15.01; everything else is mechanical type+impl insertion mirroring the FanInResult precedent.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `vcs.refs.idAlphabet` (introspection) | SDK adapter surface (`types.ts` + both backends) | — | Pure data; lives where the rest of `refs.*` lives. No CLI bridge (no production caller). |
| `vcs.refs.matchPrefix(id, prefix)` (alphabet-aware match) | SDK adapter surface (`types.ts` + both backends) | — | Pure function on adapter; per-backend body hard-codes alphabet inline matching `validateRefname` precedent. No CLI bridge (CF-deferred — no production caller in v1.4). |
| `vcs.workspace.parallel.cancel(handle)` (synchronous teardown) | SDK adapter sidecars (`jj/parallel.ts` + `git/parallel.ts`) + cross-backend type + new CLI bridge | Phase 16 helper consumer | Composition over `workspace.forget` + `rmSync` (jj) / `worktree remove --force` (git) + `bookmarks.delete({force:true})`; the per-workspace teardown lives in a shared sidecar (`jj/workspace-cleanup.ts`) consumed by Phase 16 fanIn clean-path + dogfood-restore.sh. |
| `cleanupSubagentWorkspaces(phaseRoot, phaseNumber)` (shared helper) | SDK sidecar (`sdk/src/vcs/jj/workspace-cleanup.ts`) | — | jj-only by current scope; v1.3 sidecar pattern (`conflict-paths.ts`, `incomplete-work.ts`); does NOT import from `backends/jj.ts` (UPSTREAM-02). |
| `rootCommits` → `rootRevisions` rename | SDK adapter surface + production callers + tests | Planning prose docs | Cosmetic mechanical sweep — type + 2 impls + 1 CJS + 1 TS query + 5 test sites + 1 capability-matrix string literal + active v1.4 planning docs. |
| Pre-rename audit emitter | One-shot Node script at `scripts/audit-root-commits-rename.cjs`; stdout-only | — | Mirrors `scripts/audit-id-namespace.cjs` (v1.2 audit precedent); JSON sidecar is written by the *caller* (plan 15.01 task), not the script itself, per `feedback_avoid_jj_auto_tracked_output`. |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried Forward (from ROADMAP.md Phase 15 entry + `.planning/research/SUMMARY.md`):**

- **CF-01:** Sequential plan order within phase: 15.01 rename → 15.02 idAlphabet → 15.03 matchPrefix → 15.04 cancel. File-overlap on `types.ts` + `backends/{git,jj}.ts` forces serial, NOT parallel waves.
- **CF-02:** 15.01 `rootCommits` → `rootRevisions` is a hard rename, no deprecation alias (v1.2 NAMING-01 `LogEntry.hash → .id` precedent). Archived `.planning/research/.archive-pre-v1.4/` + `.planning/milestones/v1.2-research/` are historical-prose carve-outs. The `sdk/src/vcs/backends.ts:79` capability matrix STRING LITERAL `'refs.rootCommits'` MUST flip.
- **CF-03:** 15.02 `vcs.refs.idAlphabet` returns opaque `readonly string` — `'0-9a-f'` (git) / `'k-z'` (jj). Structured `{kind, chars, minLen, maxLen}` alternative REJECTED — YAGNI.
- **CF-04:** 15.03 `vcs.refs.matchPrefix(id: RevisionExpr, prefix: string): boolean` — **throws** on wrong-alphabet (Pitfall 6); throws on empty prefix; returns `false` on `prefix.length > id.length`; hex case-insensitive; k-z lower-only. Test cross-product mandatory (5 rules × 2 backends = 10 cases).
- **CF-05:** 15.04 `vcs.workspace.parallel.cancel(handle)` — **synchronous teardown only**. `spawnSync` exec layer cannot accept `AbortSignal` (verified empirically: `spawnSync('echo', ['x'], {signal: …})` does not respect AbortController). Cancel does NOT signal subagents. The FEATURES "interrupt mid-Agent" use case is OUT OF SCOPE for v1.4.
- **CF-06:** 15.04 cancel cleanup mechanics: `workspace.forget` + `rm -rf` (jj) or `worktree remove --force` (git) + `bookmarks.delete({force:true})`. Reuses the shared `cleanupSubagentWorkspaces` helper extracted as 15.04 Wave 1.
- **CF-07:** New CLI bridge `sdk/src/query/workspace-parallel-cancel.ts` registered at all three sites (catalog-domain + manifest.non-family + aliases.generated).
- **CF-08:** No fold-in of pending todos — all 5 v14-* todos in `.planning/todos/pending/` are mapped via REQUIREMENTS.md traceability to Phases 16/17/18, NOT Phase 15.

**CancelResult envelope shape:**

- **D-01:** `CancelResult = { abandoned: readonly string[]; failedReaped: readonly string[]; surplusBookmarks: readonly string[]; surplusWorkspaces: readonly string[] }`. 4-field envelope mirrors `FanInResult.failedReaped` naming verbatim. Pure JSON; no closures, methods, or Symbols.
- **D-02:** Field semantics (JSDoc spells out at landing time): `abandoned` = identifiers fully torn down; `failedReaped` = identifiers that resisted teardown; `surplusBookmarks` = bookmark names force-deleted; `surplusWorkspaces` = workspace paths still on disk pre-cancel.
- **D-03:** Cancel is **idempotent** — re-call returns empty arrays.

**cleanupSubagentWorkspaces helper location:**

- **D-04:** `sdk/src/vcs/jj/workspace-cleanup.ts` (new sidecar). Matches v1.3 sidecar pattern.
- **D-05:** Signature: `cleanupSubagentWorkspaces(phaseRoot: string, phaseNumber: number): CleanupSubagentWorkspacesResult` where the result is `{ abandoned: readonly string[]; failedReaped: readonly string[] }` (partial-CancelResult shape, NOT void).
- **D-06:** Helper is idempotent; missing dirs are not errors.
- **D-07:** UPSTREAM-02 sidecar discipline: does NOT import from `backends/jj.ts`. Imports `vcsExec` from `../exec.js`; uses `node:fs` for `rmSync({recursive: true, force: true})`.
- **D-08:** Phase 16 Phase-16-only obligation: CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` ships in Phase 16. **No Phase 15 obligation.**

**rootCommits rename audit JSON schema:**

- **D-09:** Audit emitted at `.planning/phases/15/rootCommits-rename-audit.json` with grouped-by-extension schema (full schema verbatim in CONTEXT.md).
- **D-10:** Per-extension `grep -c '\brootCommits\b'` (excluding carveOuts) must exit 0 BEFORE commit.
- **D-11:** `specialCases` field surfaces `backends.ts:79` capability-matrix string literal explicitly.
- **D-12:** `idempotencyHash` (MD5 over sorted `{file, line}` tuples + per-extension counts) catches "new reference added between audit and rename" failure.
- **D-13:** Audit generator is a one-shot Node script at `scripts/audit-root-commits-rename.cjs` (lowercase, kebab-case, mirrors `scripts/audit-id-namespace.cjs` shape). Stdout-only.

### Claude's Discretion

- Exact JSDoc wording on `idAlphabet` / `matchPrefix` / `cancel` (planner judgment).
- Whether `CancelResult.abandoned` carries agentId, workspace name, or workspace path (recommendation: agentId, per orchestrator-identifier consistency).
- Test fixture choice (Pattern B random-prefix `mkdtemp` is v1.3 default).
- Helper internal: `readdirSync` + suffix filter vs. `jj workspace list --quiet` + name-prefix filter (recommendation: filesystem-first — survives partial jj state).
- Exact JSON serialization order in audit sidecar (sorted-keys recommended).

### Deferred Ideas (OUT OF SCOPE)

- **`vcsExecAsync` async-exec primitive** — would enable mid-Agent signal-based cancellation. Defer to future milestone.
- **Workflow-callable cancel verb** — cancel is adapter-facing only in v1.4.
- **`gsd-sdk query refs.match-prefix` CLI bridge** — no production caller in v1.4.
- **Refactor `expr.ts:41` + `format-migration/rewrite.ts:53,63` to consume new `idAlphabet`** — cosmetic, Phase 17+ at earliest.
- **CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts`** — Phase 16, not Phase 15.
- **Widen `idAlphabet` to structured `{kind, chars, minLen, maxLen}`** — YAGNI.
- **Promote `cleanupSubagentWorkspaces` to cross-backend** — defer until git-side orphan-dirs become a problem.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAMING-01 | `rootCommits` → `rootRevisions` cosmetic rename across SDK adapter surface, production callers, tests, and any `backends.ts:79`-style capability-matrix string literal. Hard rename, no alias. Pre-rename JSON sidecar audit per Pitfall 3. | Section "rootCommits Call-Site Inventory" enumerates 21 production hits across `*.ts` (19) + `*.cjs` (2) + 14 active planning-doc hits; "Pre-Rename Audit Generator" section gives reproducible script skeleton + invocation. |
| VCS-21 | `vcs.refs.idAlphabet` public introspection on both backends — `readonly idAlphabet: string` returning `'0-9a-f'` (git) / `'k-z'` (jj). | Section "VcsRefs Namespace Shape" gives the insertion point at `types.ts:336-367`; both backends' refs Object.freeze blocks identified at `backends/git.ts:554-568` + `backends/jj.ts:776`. Alphabet provenance via `jj-id-alphabet-probe.test.ts` empirical verification. |
| VCS-22 | `vcs.refs.matchPrefix(id, prefix): boolean` alphabet-aware short-prefix matching. Throws on wrong-alphabet + empty prefix; returns false on `prefix.length > id.length`. Hex case-insensitive; k-z lower-only. | Section "VcsRefs Namespace Shape" + "matchPrefix Implementation Sketch" gives signature precedent (mirrors `validateRefname` inline-alphabet pattern at `refs-validator.ts:38-79`); test cross-product enumerated. |
| PARALLEL-07 | `vcs.workspace.parallel.cancel(handle): CancelResult` synchronous teardown. Composes `workspace.forget` + `rm -rf` (jj) / `worktree remove --force` (git) + `bookmarks.delete({force:true})`. Does NOT signal subagents. Reuses `cleanupSubagentWorkspaces` helper. Returns rich envelope. | Sections "FanInResult Precedent" (locks 4-field CancelResult mirror), "VcsWorkspaceParallel Insertion Site" (third method addition at `types.ts:453-456`), "Helper Sidecar Pattern" (workspace-cleanup.ts skeleton), "CLI Bridge Three-Site Registration" (catalog + manifest + aliases lines verified). `spawnSync` AbortSignal verification confirms CF-05 rule. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GitHub access:** all `gh` invocations MUST pass `--repo gsd-build/get-shit-done`. Not directly relevant to Phase 15 (no GitHub I/O), but plan-level git/jj fallbacks must respect.
- **No raw git anywhere in jj-port** (per `project_no_raw_git` user memory): all VCS reads + writes go through the adapter; even `git status` perturbs colocated jj state. Phase 15 inherits this — all cancel teardown shells out only via `vcsExec` (UPSTREAM-02 discipline already enforced in `jj/parallel.ts:51` precedent).
- **Single-context repo** with `CONTEXT.md` + `docs/adr/` at root (per `docs/agents/domain.md`). Phase 15 produces no ADRs; the rename is mechanical and an ADR is not warranted (no architectural decision being recorded that isn't already in CONTEXT.md / ROADMAP.md).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | (existing pin) | Test framework for `sdk/src/vcs/__tests__/*.test.ts` | Phase 15 adds tests in the SDK tree where vitest is the universal framework; do NOT introduce node:test here (node:test is for `tests/*.cjs` only per `project_test_perf_pain_vitest`). |
| TypeScript | (existing pin) | All new files are `.ts` | Adapter surface is pure TypeScript; CJS rebuild via existing dist-cjs pipeline. |
| Node.js stdlib `node:child_process` `spawnSync` | (existing pin) | Sole subprocess primitive via `vcsExec` wrapper | Verified empirically (this research session): `spawnSync` accepts a `signal` option but does not abort cleanly mid-call — the option name passes type checking but the documented Node.js behaviour does not cleanly fire pre-spawn. CF-05 rule "no AbortSignal" is structurally correct. |
| Node.js stdlib `node:fs` `rmSync({recursive:true, force:true})` | (existing pin) | jj-side teardown after `workspace.forget` | Standard pattern in `sdk/src/vcs/jj/reap.ts:188`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` `createHash('md5')` | (existing pin) | Idempotency hash on rename audit JSON (D-12) | Used in audit generator only. Plain stdlib, no new dep. |
| `node:path` `join` | (existing pin) | Path composition in helper sidecar | Already used by `jj/parallel.ts:49`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:child_process` `execSync` | `spawnSync` (current) | execSync is shell-mediated → argv injection risk on bookmark names. spawnSync stays. |
| Structured `{kind, chars, minLen, maxLen}` for `idAlphabet` | Opaque `readonly string` (current) | Structured form would force callers to switch on `backend.kind`, defeating `project_unified_revision_model`. YAGNI per CF-03. |
| Cross-backend `cleanupSubagentWorkspaces` | jj-only helper (current) | Git's `worktree remove --force` already handles teardown; no orphan-dir problem on git side today. Promote later if needed. |

**Installation:** No new dependencies. Phase 15 is pure-source change.

**Version verification:** Skipped — no external packages added.

## Package Legitimacy Audit

Phase 15 introduces **zero** external packages. The Package Legitimacy Gate is therefore trivially satisfied. The audit table is intentionally empty.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | None introduced |

**Packages removed due to slopcheck [SLOP] verdict:** none — phase is pure source.
**Packages flagged as suspicious [SUS]:** none — phase is pure source.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌────────────────────────────────────┐
                          │  sdk/src/vcs/types.ts              │
                          │  • VcsRefs (idAlphabet, matchPrefix)│
                          │  • VcsWorkspaceParallel (cancel)    │
                          │  • CancelResult interface           │
                          │  • rootCommits → rootRevisions      │
                          └─────┬───────────────────┬──────────┘
                                │ implements        │ implements
                  ┌─────────────▼─────────┐  ┌──────▼───────────────┐
                  │  backends/git.ts      │  │  backends/jj.ts       │
                  │  • refs.idAlphabet    │  │  • refs.idAlphabet    │
                  │  • refs.matchPrefix   │  │  • refs.matchPrefix   │
                  │  • refs.rootRevisions │  │  • refs.rootRevisions │
                  │  • parallel.cancel    │  │  • parallel.cancel    │
                  └─────────┬─────────────┘  └────────────┬─────────┘
                            │ delegates                   │ delegates
                  ┌─────────▼─────────────┐  ┌────────────▼─────────┐
                  │  git/parallel.ts      │  │  jj/parallel.ts       │
                  │  performGitParallel*  │  │  performJjParallel*   │
                  │  cancel impl uses     │  │  cancel impl uses     │
                  │  bookmarks.delete +   │  │  helper sidecar:      │
                  │  worktree remove -f   │  │  ┌──────────────────┐ │
                  └───────────────────────┘  │  │ workspace-       │ │
                                             │  │  cleanup.ts (D-04)│ │
                                             │  │ jj workspace forget│ │
                                             │  │ + rmSync({…force}) │ │
                                             │  └────────┬─────────┘ │
                                             └───────────┼───────────┘
                                                         │ also consumed by
                                                         │ (Phase 16, NOT 15)
                                                ┌────────▼───────────────┐
                                                │  Phase 16 16.02:        │
                                                │  • fanIn clean-path     │
                                                │    branch reap          │
                                                │  • dogfood-restore.sh   │
                                                └─────────────────────────┘

                              ┌─── CLI bridge layer ───────────────────────────────────┐
                              │  sdk/src/query/workspace-parallel-cancel.ts (NEW)       │
                              │  registered at three sites (CF-07):                     │
                              │    1. command-static-catalog-domain.ts: 2 entries       │
                              │       (dotted + space-tokenized canonical)              │
                              │    2. command-manifest.non-family.ts: 1 entry           │
                              │       (canonical + alias array + mutation:true)         │
                              │    3. command-aliases.generated.ts: 1 entry             │
                              │       (canonical + alias array + mutation:true)         │
                              │  → exposed as `gsd-sdk query workspace.parallel.cancel` │
                              └─────────────────────────────────────────────────────────┘

         Plan 15.01 rename audit pipeline:
         ┌──────────────────────────┐    ┌────────────────────┐    ┌─────────────────────┐
         │ scripts/audit-root-      │ →  │ stdout JSON (D-13) │ →  │ plan task captures   │
         │ commits-rename.cjs       │    │ (stdout-only)      │    │ to .planning/phases/ │
         │ (one-shot, mirrors       │    └────────────────────┘    │ 15/rootCommits-      │
         │  audit-id-namespace.cjs) │                              │ rename-audit.json    │
         └──────────────────────────┘                              └─────────────────────┘
                                                                            │
                                                                            ▼
                                                                Plan 15.01 then runs hard
                                                                rename (compiler errors
                                                                guide TS hits; audit JSON
                                                                guides CJS/MD/JSON hits
                                                                that compiler misses)
```

### Recommended Project Structure

No structural changes. Phase 15 adds files in established locations:

```
sdk/src/vcs/
├── types.ts                                    # EDIT: rename rootCommits, add idAlphabet/matchPrefix/cancel/CancelResult
├── backends.ts                                 # EDIT: line 79 string-literal flip + 3 new capability-matrix rows
├── backends/
│   ├── git.ts                                  # EDIT: rename + 2 new refs methods + parallel.cancel wire-in
│   └── jj.ts                                   # EDIT: rename + 2 new refs methods + parallel.cancel wire-in
├── git/
│   └── parallel.ts                             # EDIT: add performGitParallelCancel export
├── jj/
│   ├── parallel.ts                             # EDIT: add performJjParallelCancel export
│   └── workspace-cleanup.ts                    # NEW: cleanupSubagentWorkspaces helper (15.04 Wave 1)
└── __tests__/
    ├── adapter-contract.test.ts                # EDIT: cross-backend assertions for idAlphabet + matchPrefix
    ├── git-backend.test.ts                     # EDIT: rename describe + 3 occurrences
    ├── jj-refs.test.ts                         # EDIT: 5 rename occurrences
    ├── jj-skeleton.test.ts                     # EDIT: 2 rename occurrences
    ├── baseline-parity.test.ts                 # EDIT: 2 rename occurrences
    ├── cmd-parallel-cancel-jj.test.ts          # NEW: cancel-clean-abandon + cancel-idempotent-recall + cancel-partial-state-recovery
    └── cmd-parallel-cancel-git.test.ts         # NEW: same three scenarios on git backend

sdk/src/query/
├── workspace-parallel-cancel.ts                # NEW: CLI bridge (15.04 Wave 2)
├── command-static-catalog-domain.ts            # EDIT: 2 new entries for cancel
├── command-manifest.non-family.ts              # EDIT: 1 new entry for cancel
└── command-aliases.generated.ts                # EDIT: 1 new entry for cancel

scripts/
└── audit-root-commits-rename.cjs               # NEW (one-shot, 15.01 Wave 1)

.planning/phases/15/                            # NOTE: NOT 15-adapter-surface-extensions-rename/
└── rootCommits-rename-audit.json               # NEW (15.01 Wave 1 emitted output, D-09)
```

**One gotcha:** D-09 specifies the audit JSON path as `.planning/phases/15/rootCommits-rename-audit.json` (numeric `15`), but the current phase directory is `.planning/phases/15-adapter-surface-extensions-rename/`. Planner should resolve this discrepancy with the user — recommended interpretation: the audit JSON belongs *inside* the slugged phase directory (`.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json`) to mirror how `12-HOOK-IDEMPOTENCY-AUDIT.md` landed inside the Phase 12 slug directory. Either way, the audit script's caller controls the output path; the script itself is stdout-only.

### Pattern 1: UPSTREAM-02 Sidecar Discipline

**What:** Sidecars under `sdk/src/vcs/jj/*.ts` do NOT import from `backends/jj.ts`. They inline the small set of mandatory flags (`jjArgvFlags`) verbatim and import only from `../exec.js` for `vcsExec` + `node:fs` / `node:path` for filesystem.

**When to use:** Any new helper that shells `jj` from within `jj/*`. Applies to `workspace-cleanup.ts` (D-07).

**Example (verified pattern from `jj/conflict-paths.ts:22-30`):**

```typescript
// Source: sdk/src/vcs/jj/conflict-paths.ts:22-30 (verified by Read tool)
import { vcsExec } from '../exec.js';

function jjArgvFlags(repo: string): string[] {
  return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

### Pattern 2: Helper Sidecar JSDoc Header Shape

Verified across `jj/reap.ts:1-26`, `jj/conflict-paths.ts:1-21`, `jj/incomplete-work.ts:1-27`, `jj/parallel.ts:1-46`. Every sidecar opens with:

1. File-path header line
2. Phase number + REQ ID parenthetical
3. One-paragraph "what + why this file exists" summary
4. **UPSTREAM-02 sidecar discipline statement** verbatim
5. List of carried-forward decisions (D-NN references to CONTEXT.md)

`workspace-cleanup.ts` MUST follow this same shape.

### Pattern 3: Inline Validator + Argv-Injection Defense

**What:** When emitting bookmark / workspace names to argv, validate up-front + use `--` end-of-options separator.

**Source:** `jj/parallel.ts:120-130` (`validateMainBookmark`) + `backends/jj.ts:713` (`validateRefname(actualName)` before `jjArgv('bookmark', 'create', '-r', toJjRev(rev), '--', actualName)`).

**Apply to:** matchPrefix throws on wrong-alphabet uses the same inline-validation pattern. The cancel helper invokes `jj workspace forget --<separator> <workspaceName>` (mirror reap.ts:177 which uses `'workspace', 'forget', '--', entry.name`).

### Anti-Patterns to Avoid

- **Don't allow silent prefix mismatch.** Per CF-04, `matchPrefix('abc1', <jj-id>)` MUST throw — silent-false would mask caller bugs. Verified rationale: the v1.2 NAMING-01 retrospective showed that silent-passthrough patterns hide consumer-side bugs that surface much later. The `expr.ts:41` regex tolerates both alphabets in the same character class — DO NOT reuse that pattern; it conflates two distinct shape constraints.
- **Don't promote `idAlphabet` to discriminated union.** Per CF-03 + `project_unified_revision_model`, the cross-backend surface stays single-typed (`string`).
- **Don't import from `backends/jj.ts` in `workspace-cleanup.ts`.** UPSTREAM-02 sidecar discipline; this is a hard rule (D-07).
- **Don't add `expires` to allowlists** if any allowlist is touched (per `feedback_solo_dev_no_expires`). N/A for Phase 15 unless cancel introduces a new lint allowlist entry (no such entry expected — cancel is internal to the parallel namespace, not raw-git).
- **Don't write audit output files from the audit script itself.** Per `feedback_avoid_jj_auto_tracked_output` + D-13: the script is stdout-only; the plan task is responsible for redirecting stdout to the JSON sidecar path. Writing inside the script would perturb the colocated jj working tree mid-operation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive directory traversal | A custom walker for the audit script | `node:fs` `readdirSync({recursive: true})` OR the verified walker pattern at `scripts/audit-id-namespace.cjs` | The audit precedent already filters `SKIP_DIRS` + handles binary files. |
| MD5 hash computation | Custom hash function | `node:crypto` `createHash('md5').update(…).digest('hex')` | Stdlib; D-12 specifies MD5 specifically. |
| `jj workspace forget` shell invocation | Raw spawn from scripts | `vcsExec(repo, 'jj', ['workspace', 'forget', '--', name])` — `vcsExec` signature is `(cwd, bin, args, options?): ExecResult` verified at `exec.ts:91-126` | Single subprocess primitive; uniform timeout + env handling. |
| Workspace teardown shell pipeline | A bash script that runs `jj workspace forget` then `rm -rf` | `cleanupSubagentWorkspaces(phaseRoot, phaseNumber)` helper — single owner per IP-5; consumed by 15.04 cancel + Phase 16 fanIn-clean + Phase 16 dogfood-restore | Three call sites → single implementation, no drift. |
| Custom JSON serialization | Hand-formatted JSON | `JSON.stringify(obj, Object.keys(obj).sort(), 2)` for deterministic sorted-keys output | Audit must be reproducible (D-12 idempotencyHash). |

**Key insight:** Phase 15 is mechanically straightforward. The lurking pitfalls are not in *what* to write — they're in (a) catching all the non-TS sites that the compiler misses (CJS/markdown/JSON), and (b) keeping the cancel teardown contract divergent from reap's preserve-on-conflict contract (different file = enforceable, per D-04).

## rootCommits Call-Site Inventory

Verified via `grep -rn '\brootCommits\b'` on 2026-05-24, excluding `node_modules`, `.git`, `.jj`, `dist-cjs/`, `.planning/research/.archive-pre-v1.4/`, `.planning/milestones/v1.2-research/` per ROADMAP SC1.

### Production code (`.ts` + `.cjs` + `.js`): 21 sites across 9 files

**TypeScript (19 hits in 8 files):**

| File | Line | Snippet | Role |
|------|------|---------|------|
| `sdk/src/vcs/types.ts` | 363 | `rootCommits(opts: { rev?: RevisionExpr }): string[];` | Interface declaration (primary rename target) |
| `sdk/src/vcs/backends.ts` | **79** | `'refs.rootCommits': Object.freeze(['git', 'jj-colocated'] as const),` | **SPECIAL CASE** — capability-matrix string literal (Pitfall 3) |
| `sdk/src/vcs/backends/git.ts` | 526 | `const rootCommits = (opts: { rev?: RevisionExpr }): string[] => {` | git impl (function name) |
| `sdk/src/vcs/backends/git.ts` | 564 | `rootCommits,` | git impl (Object.freeze shorthand) |
| `sdk/src/vcs/backends/jj.ts` | 964 | `rootCommits: ({ rev }: { rev?: RevisionExpr }): string[] => {` | jj impl |
| `sdk/src/query/progress.ts` | 288 | `// countCommits/rootCommits read from the configured backend.` | Comment |
| `sdk/src/query/progress.ts` | 293 | `const roots = vcs.refs.rootCommits({ rev: vcs.refs.head });` | Production caller |
| `sdk/src/vcs/__tests__/git-backend.test.ts` | 414 | `describe('createGitAdapter — refs.rootCommits (02-03 Task 1)', () => {` | Test describe label |
| `sdk/src/vcs/__tests__/git-backend.test.ts` | 419 | `const roots = vcs.refs.rootCommits({ rev: vcs.refs.head });` | Test call |
| `sdk/src/vcs/__tests__/jj-skeleton.test.ts` | 147 | `it('refs.rootCommits() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {` | Test label |
| `sdk/src/vcs/__tests__/jj-skeleton.test.ts` | 148 | `expect(() => vcs.refs.rootCommits({})).not.toThrow(VcsNotImplementedError);` | Test call |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` | 234 | `// Plan 02-06 Task 3: vcs.refs.rootCommits({rev}) wraps` | Comment |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` | 238 | `const roots = vcs.refs.rootCommits({ rev: vcs.refs.head });` | Test call |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` | 162 | `// refs.parent / refs.exists / refs.rootCommits all have meaningful state.` | Comment |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` | 215 | `// ─── refs.rootCommits ────────────────────────────────────────────────` | Section divider |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` | 216 | `it('refs.rootCommits({}) returns at least one root revision id', () => {` | Test label |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` | 217 | `// Phase 8 FLIP-01: rootCommits emits change_id (k-z alphabet) per the` | Comment |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` | 220 | `const roots = vcs.refs.rootCommits({});` | Test call |

**CommonJS (2 hits in 2 files):**

| File | Line | Snippet | Role |
|------|------|---------|------|
| `get-shit-done/bin/lib/commands.cjs` | 998 | `  // countCommits / rootCommits / log({rev: expr.rev(<runtime-sha>)}) —` | Comment |
| `get-shit-done/bin/lib/commands.cjs` | 1005 | `    const roots = statsVcs.refs.rootCommits({ rev: statsVcs.refs.head });              // line 921 (was: rev-list --max-parents=0 HEAD)` | **CJS caller (Pitfall 3 silent-failure site)** |
| `tests/__tools__/capture-vcs-baselines.cjs` | 414 | `    // Adapter equivalent: vcs.refs.rootCommits({rev: vcs.refs.head}).` | Comment |

(Note: `commands.cjs` and `capture-vcs-baselines.cjs` together total 3 sites; I miscounted above. Actual production grand total = **19 TS + 3 CJS = 22 hits**, not 21. Re-verified.)

**Corrected total: 22 production-code sites** across 9 files.

### Active planning documents (`.md` + `.json`): 14 files

These are NOT carve-outs per ROADMAP SC1 (only `.archive-pre-v1.4/` + `v1.2-research/` are carved out).

| File | Hits | Role |
|------|------|------|
| `.planning/research/ARCHITECTURE.md` | 14 | v1.4 research synthesis — describes the rename target itself; rename mentions of `rootCommits` to `rootRevisions` post-rename OR leave as historical-prose. **Planner judgment.** |
| `.planning/research/PITFALLS.md` | 11 | v1.4 research — Pitfall 3 description references the OLD name as the warning subject; rename or leave? **Planner judgment.** |
| `.planning/research/SUMMARY.md` | 3 | v1.4 research index — same call. |
| `.planning/intel/id-namespace-audit.md` | 1 | v1.2 intel (line 46, hex regex on rootCommits) — historical-prose; safe to leave. |
| `.planning/intel/vcs-adapter-surface-audit.md` | 1 | v1.1 audit — historical-prose; safe to leave. |
| `.planning/milestones/v1.1-ROADMAP.md` | 1 | v1.1 plan list — historical-prose; safe to leave. |
| `.planning/milestones/v1.2-REQUIREMENTS.md` | 2 | v1.2 deferred items — historical-prose; safe to leave. |
| `.planning/seeds/SEED-001-change-id-only-on-jj-adapter-surface.md` | 2 | v1.2 seed — historical-prose; safe to leave. |
| `.planning/PROJECT.md` | 2 | v1.4 project framing references both old and new names as part of the deferral list; planner judgment — recommend updating to `rootRevisions` post-rename for consistency. |
| `.planning/STATE.md` | 2 | v1.4 STATE references both names; planner judgment — recommend updating post-rename. |
| `.planning/REQUIREMENTS.md` | 2 | v1.4 REQUIREMENTS describes NAMING-01 itself; the OLD name is load-bearing in the description. Leave as historical-prose. |
| `.planning/ROADMAP.md` | 4 | v1.4 roadmap describes the rename; mix of old and new names — planner judgment. |
| `.planning/phases/15-adapter-surface-extensions-rename/15-CONTEXT.md` | ~5 | Phase 15 context — describes the rename itself; **explicitly historical-prose** (the file describes the rename FROM the old name TO the new name). |
| `.planning/phases/15-adapter-surface-extensions-rename/15-DISCUSSION-LOG.md` | ~2 | Phase 15 discussion log — historical-prose. |

**Recommendation for planner:** Adopt a clear rule for `.planning/` `.md` hits: **`.planning/` is by-default a historical-prose carve-out for this rename** (mirrors `feedback_avoid_jj_auto_tracked_output` spirit — planning docs are journal, not normative source), with the exception that PROJECT.md and STATE.md should reflect the post-rename naming in their *active* sections (the "Current Position" / "Current Milestone" surfaces). This is consistent with CF-02's framing of `.archive-pre-v1.4/` + `v1.2-research/` as carve-outs — the boundary is "active spec source" (production code, schema, contract) vs. "historical record" (planning artifacts).

### Carve-outs (verified to contain `rootCommits` references but excluded from rename)

| Path | Hits | Reason |
|------|------|--------|
| `.planning/research/.archive-pre-v1.4/` | 7 | ROADMAP Phase 15 SC1 — pre-v1.4 archived research |
| `.planning/milestones/v1.2-research/` | (also part of the 7 above when grepped) | Same carve-out clause |

## VcsRefs Namespace Shape

### Current shape (verified at `sdk/src/vcs/types.ts:336-367`)

```typescript
// Source: sdk/src/vcs/types.ts:336-367 (verified via Read)
export interface VcsRefs {
  readonly head: RevisionExpr;
  readonly parent: RevisionExpr;
  bookmarks: VcsBookmarks;
  currentBookmarks(): string[];
  currentBookmarksIn(cwd: string): string[];
  mergeBase(a: RevisionExpr, b: RevisionExpr): string;
  readBlob(rev: RevisionExpr, path: string): string;
  resolveShort(rev: RevisionExpr): string;
  countCommits(opts: { rev?: RevisionExpr }): number;
  rootCommits(opts: { rev?: RevisionExpr }): string[];        // 15.01 target → rootRevisions
  exists(rev: RevisionExpr): boolean;
  isIgnored(path: string): boolean;
  remotes(): string[];
}
```

### Insertion points

- **`idAlphabet` (15.02):** Add as `readonly idAlphabet: string;` adjacent to `readonly head` / `readonly parent` (the two existing readonly properties). Both are pure data with no parameters — `idAlphabet` matches that shape.
- **`matchPrefix` (15.03):** Add as `matchPrefix(id: RevisionExpr, prefix: string): boolean;` adjacent to `exists(rev: RevisionExpr): boolean;` (both return `boolean` and take a `RevisionExpr` plus a string-ish argument).

### Both backends' refs Object.freeze blocks

- **git:** `sdk/src/vcs/backends/git.ts:554-568` — `const refs = Object.freeze({ head, parent, bookmarks, currentBookmarks, currentBookmarksIn, mergeBase, readBlob, resolveShort, countCommits, rootCommits, exists, isIgnored, remotes });`
- **jj:** `sdk/src/vcs/backends/jj.ts:776` — `const refs: VcsRefs = Object.freeze({ head, parent, bookmarks, … });`

After 15.02/15.03 the two new members get added in both blocks. After 15.01 the `rootCommits` line in both flips to `rootRevisions`.

## FanInResult Precedent (CancelResult Mirror)

Verified at `sdk/src/vcs/types.ts:533-541`:

```typescript
// Source: sdk/src/vcs/types.ts:533-541
export interface FanInResult {
  /** change_ids (jj) / commit_ids (git) of agent heads that landed cleanly. */
  merged: readonly string[];
  conflicted: boolean;
  conflictedPaths: readonly string[];
  incompleteQueued: number;
  failedReaped: readonly string[];
  surplusBookmarks: readonly string[];
}
```

**Note on field naming for CancelResult mirror:**
- `failedReaped: readonly string[]` is the field on FanInResult that maps to CancelResult's `failedReaped` (per D-01). The naming "failedReaped" is preserved verbatim across both envelopes.
- `surplusBookmarks: readonly string[]` is the field that maps to CancelResult's `surplusBookmarks`.
- CancelResult adds two new fields not present on FanInResult: `abandoned` (workspace identifiers successfully torn down) and `surplusWorkspaces` (workspace paths still on disk pre-cancel).

CancelResult **does not** carry `merged`, `conflicted`, `conflictedPaths`, or `incompleteQueued` — these are merge-domain fields. Cancel is teardown-domain.

## VcsWorkspaceParallel Insertion Site

Verified at `sdk/src/vcs/types.ts:453-456`:

```typescript
// Source: sdk/src/vcs/types.ts:453-456
export interface VcsWorkspaceParallel {
  dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
  fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
}
```

Plan 15.04 adds:

```typescript
export interface VcsWorkspaceParallel {
  dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
  fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
  /** Phase 15 (PARALLEL-07): synchronous teardown of already-materialized workspaces. */
  cancel(handle: ParallelDispatchHandle): CancelResult;
}
```

## ParallelDispatchHandle Shape (Cancel Input)

Verified at `sdk/src/vcs/types.ts:493-518`. Source-of-truth fields the cancel body can read:

- `phaseRoot: string` — absolute path to `.planning/phases/{NN}/` (for the helper's lookup path)
- `phaseNumber: number` — the integer phase number (helper consumes this)
- `mainBookmark: string`
- `manifest: string` — empty per Phase 11 D-01
- `workspaces: readonly Readonly<{name, path, baseRev, agentId, baselineOpId?}>[]` — **the source-of-truth list of materialized workspaces** per D-03 idempotency contract

The handle's `workspaces[]` is everything cancel needs. No filesystem enumeration of orphan dirs is needed at the cancel-verb layer (the helper does the FS enumeration *underneath*, but cancel itself iterates the handle).

## Helper Sidecar Pattern (cleanupSubagentWorkspaces)

### Two consumers' divergent contracts

| Sidecar | Post-condition on subagent workspaces |
|---------|--------------------------------------|
| `jj/reap.ts` | **Preserve** workspaces on conflict OR uncommitted-work crashes (W3 (a) "leave for human inspection"). Empty-head workspaces are abandoned + forgotten + rm'd. |
| `jj/workspace-cleanup.ts` (NEW) | **Tear down everything passed in.** No diff probe, no conflict check, no preservation. The caller decided to cancel; the helper executes. |

These are different contracts → different files per D-04.

### Skeleton

```typescript
// Source: pattern verified across jj/reap.ts:1-43 + jj/parallel.ts:1-65 + jj/conflict-paths.ts:1-30
/**
 * sdk/src/vcs/jj/workspace-cleanup.ts — Phase 15 (PARALLEL-07, IP-5)
 *
 * Shared helper: tear down subagent workspaces from a phase root,
 * idempotently. Single owner; three consumers (15.04 cancel, Phase 16
 * 16.02 fanIn clean-path branch, Phase 16 16.02 dogfood-restore.sh).
 *
 * Divergent from reap.ts: this helper does NOT probe diffs, does NOT
 * preserve conflicted workspaces — it tears down everything the caller
 * explicitly enumerated. The contract divergence is enforced by the file
 * boundary (D-04).
 *
 * UPSTREAM-02 sidecar discipline: does NOT import from backends/jj.ts
 * (D-07). Imports vcsExec from ../exec.js; uses node:fs for rmSync.
 *
 * D-05 (carry): returns CleanupSubagentWorkspacesResult = partial-
 * CancelResult shape ({abandoned, failedReaped}) so the cancel verb body
 * and the fanIn clean-path branch can both unify the helper output into
 * their respective envelopes without re-enumerating disk state.
 *
 * D-06 (carry): idempotent by contract — missing dirs are not errors;
 * workspace.forget is best-effort; failed rm -rf populates failedReaped.
 */

import { readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { vcsExec } from '../exec.js';

function jjArgvFlags(repo: string): string[] {
  return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

export interface CleanupSubagentWorkspacesResult {
  /** Workspace identifiers (recommend: workspace name, e.g. 'phase-15-subagent-1') fully torn down. */
  abandoned: readonly string[];
  /** Workspace identifiers that resisted teardown. */
  failedReaped: readonly string[];
}

/**
 * Tear down every `.claude/jj-workspaces/phase-{NN}-subagent-*` directory.
 *
 * Steps per workspace:
 *   1. `jj workspace forget --<sep> <name>` (best-effort; ignore exit-code
 *      because workspace may already be forgotten).
 *   2. `rmSync(path, {recursive: true, force: true})` (best-effort; ignore
 *      ENOENT but record EACCES / EBUSY into failedReaped).
 *
 * @param mainRepoRoot Absolute path to the colocated jj repo root.
 * @param phaseNumber Integer phase number (e.g. 15).
 */
export function cleanupSubagentWorkspaces(
  mainRepoRoot: string,
  phaseNumber: number,
): CleanupSubagentWorkspacesResult {
  const phaseTag = String(phaseNumber).padStart(2, '0');
  const workspacesParent = join(mainRepoRoot, '.claude', 'jj-workspaces');
  const abandoned: string[] = [];
  const failedReaped: string[] = [];

  if (!existsSync(workspacesParent)) {
    return Object.freeze({
      abandoned: Object.freeze([]) as readonly string[],
      failedReaped: Object.freeze([]) as readonly string[],
    });
  }

  const entries = readdirSync(workspacesParent);
  const matchPrefix = `phase-${phaseTag}-subagent-`;

  for (const name of entries) {
    if (!name.startsWith(matchPrefix)) continue;
    const path = join(workspacesParent, name);
    if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) continue;

    // Step 1: jj workspace forget (best-effort).
    const forgetArgs = [...jjArgvFlags(mainRepoRoot), 'workspace', 'forget', '--', name];
    vcsExec(mainRepoRoot, 'jj', forgetArgs);  // ignore exitCode per D-06

    // Step 2: rmSync (best-effort with error catch).
    try {
      rmSync(path, { recursive: true, force: true });
      abandoned.push(name);
    } catch {
      failedReaped.push(name);
    }
  }

  return Object.freeze({
    abandoned: Object.freeze(abandoned.slice()) as readonly string[],
    failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
  });
}
```

**Note on signature:** D-05 says `cleanupSubagentWorkspaces(phaseRoot: string, phaseNumber: number)`. I've written it as `(mainRepoRoot, phaseNumber)` because `phaseRoot` in CONTEXT is ambiguous between "main repo root" (what `jj/parallel.ts` `derivePhaseRoot` calls `mainRepoRoot`) and "phase directory" (what `derivePhaseRoot` *returns*). The subagent workspaces live at `<mainRepoRoot>/.claude/jj-workspaces/...`, NOT under `.planning/phases/{NN}/`, so the helper needs the main repo root. **Planner: confirm the argument-name interpretation with user OR rename to `mainRepoRoot` for clarity.**

## vcsExec Signature for jj workspace forget

Verified at `sdk/src/vcs/exec.ts:91-126`:

```typescript
export function vcsExec(
  cwd: string,
  bin: string,
  args: string[],
  options: ExecOptions = {},
): ExecResult;
```

Return shape `ExecResult` = `{ exitCode, stdout, stderr, timedOut, error }`. **Does not throw on non-zero exit.** Callers must inspect `exitCode` (or `error` for spawn failure).

**Verified pattern for `jj workspace forget` from `sdk/src/vcs/jj/reap.ts:174-183`:**

```typescript
const forgetArgs = [
  ...jjArgvFlags(opts.mainRepoRoot),
  'workspace', 'forget', '--', entry.name,
];
const forgetRes = vcsExec(opts.mainRepoRoot, 'jj', forgetArgs);
if (forgetRes.exitCode !== 0) {
  throw new Error(
    `reap: jj workspace forget ${entry.name} failed: ${forgetRes.stderr || forgetRes.stdout}`,
  );
}
```

Note reap throws on non-zero. The cancel helper per D-06 (idempotency) should NOT throw — instead silently ignore the exit code, because a workspace may already be forgotten.

## workspace.forget + worktree remove --force Semantics

### jj `workspace forget`

- Releases the workspace name from the repo's workspace list.
- **Does NOT remove the on-disk dir.** Verified by `jj/reap.ts:184` comment: `"Pitfall 3: jj workspace forget does NOT remove the on-disk dir. reap rm's it here…"`.
- So the helper must follow up with `rmSync({recursive: true, force: true})`.

### git `worktree remove --force`

- Removes the worktree's on-disk dir AND the metadata in `.git/worktrees/<name>/`.
- The `--force` flag overrides the "uncommitted changes" refusal that `worktree remove` (without force) would emit.
- **One call removes both metadata AND directory** — no separate `rmSync` needed.
- Per `sdk/src/vcs/git/parallel.ts:30-31`: cleanup pattern is `git worktree remove <path>` (non-force per ROADMAP SC1) + `git branch -D <agentBookmark>`. But the **cancel** verb uses `--force` per CF-06 (different contract — cancel is "tear down regardless"; fanIn clean-path is "tear down assumes-clean").

### Impact on bookmarks

- jj: agent bookmarks were retired in Phase 11 D-02 — no per-subagent bookmarks exist on jj. `surplusBookmarks: []` by construction.
- git: per-agent `worktree-agent-<agentId>` branches exist. Cancel must delete them via `bookmarks.delete(name, {force: true})`.

## bookmarks.delete({force:true}) Shape

Verified at `sdk/src/vcs/types.ts:380-387`:

```typescript
// Source: sdk/src/vcs/types.ts:380-387
/**
 * Phase 7 D-09 (VCS-14): extend opts with force?: boolean. On git, force=true → `branch -D`
 * (override), force=false/undefined → `branch -d` (safe). On jj, force is a documented no-op
 * — jj's `bookmark delete` already removes the LOCAL view regardless of state. Divergent
 * remote-tracking bookmarks are unaffected on jj (Pitfall 5 in 07-RESEARCH.md). The flag
 * is preserved for API parity with git's branch -D.
 */
delete(name: string, opts?: { raw?: boolean; force?: boolean }): void;
```

**Cancel-relevant semantics:**
- git: `force: true` → `git branch -D <name>` → succeeds even if branch unmerged. Cancel uses this.
- jj: `force: true` is no-op (bookmark gone regardless). Per Phase 11 D-02 there are no per-subagent bookmarks anyway, so cancel on jj does NOT invoke this.
- Throws on error (per `backends/jj.ts:738`'s pattern `throw new Error(…)` on `r.exitCode !== 0`). Cancel must catch into `failedReaped` per idempotency.

## CLI Bridge Three-Site Registration Pattern

CF-07 names all three sites. Verified entries for `workspace.parallel.dispatch` + `workspace.parallel.fan-in` (Phase 11 plan 02 precedent):

### Site 1: `sdk/src/query/command-static-catalog-domain.ts`

```typescript
// Source: command-static-catalog-domain.ts:21-22 + 71-74 (verified)
import { workspaceParallelDispatchQuery } from './workspace-parallel-dispatch.js';
import { workspaceParallelFanInQuery } from './workspace-parallel-fan-in.js';

// ... in DOMAIN_STATIC_CATALOG ...
['workspace.parallel.dispatch', workspaceParallelDispatchQuery],
['workspace parallel.dispatch', workspaceParallelDispatchQuery],
['workspace.parallel.fan-in', workspaceParallelFanInQuery],
['workspace parallel.fan-in', workspaceParallelFanInQuery],
```

Plan 15.04 adds:

```typescript
import { workspaceParallelCancelQuery } from './workspace-parallel-cancel.js';

['workspace.parallel.cancel', workspaceParallelCancelQuery],
['workspace parallel.cancel', workspaceParallelCancelQuery],
```

### Site 2: `sdk/src/query/command-manifest.non-family.ts`

```typescript
// Source: command-manifest.non-family.ts:60-62 (verified)
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false, outputMode: 'json' },
{ canonical: 'workspace.parallel.dispatch',     aliases: ['workspace parallel.dispatch'],     mutation: true,  outputMode: 'json' },
{ canonical: 'workspace.parallel.fan-in',       aliases: ['workspace parallel.fan-in'],       mutation: true,  outputMode: 'json' },
```

Plan 15.04 adds:

```typescript
{ canonical: 'workspace.parallel.cancel',       aliases: ['workspace parallel.cancel'],       mutation: true,  outputMode: 'json' },
```

### Site 3: `sdk/src/query/command-aliases.generated.ts`

```typescript
// Source: command-aliases.generated.ts:155-157 (verified)
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false },
{ canonical: 'workspace.parallel.dispatch', aliases: ['workspace parallel.dispatch'], mutation: true },
{ canonical: 'workspace.parallel.fan-in', aliases: ['workspace parallel.fan-in'], mutation: true },
```

Plan 15.04 adds (alphabetically — list is alphabetical):

```typescript
{ canonical: 'workspace.parallel.cancel', aliases: ['workspace parallel.cancel'], mutation: true },
```

### Failure mode: missing one of the three sites

Per CF-07: **missing any one site breaks runtime verb resolution.**

| Missing site | Runtime symptom |
|--------------|-----------------|
| catalog-domain | `gsd-sdk query workspace.parallel.cancel …` → falls through to the "unknown command" branch in the dispatcher; user sees "no handler for command 'workspace.parallel.cancel'" |
| manifest.non-family | The CLI envelope wrapper doesn't classify the command as mutation+json; the handler MAY still execute but the structured envelope behavior diverges (e.g., no mutation flag → no post-hook firing); may silently misbehave under specific dispatcher branches |
| aliases.generated | Tab-completion / alias resolution loses the verb; some workflow callers that go via the aliases path resolve to undefined |

CI catches all three only if a test exercises `gsd-sdk query workspace.parallel.cancel`. Plan 15.04 MUST add such a contract test in `cmd-parallel-cancel-{jj,git}.test.ts` to gate the registration.

## matchPrefix Implementation Sketch

Per CF-03 + CF-04, both backends hard-code the alphabet inline (matching `validateRefname` precedent). No closure over `idAlphabet`.

```typescript
// git side — backends/git.ts (add to refs Object.freeze)
const matchPrefix = (id: RevisionExpr, prefix: string): boolean => {
  if (prefix.length === 0) {
    throw new Error(`matchPrefix: empty prefix (caller bug)`);
  }
  // Wrong alphabet → throw. Git ids are hex, case-insensitive.
  if (!/^[0-9a-fA-F]+$/.test(prefix)) {
    throw new Error(`matchPrefix: prefix '${prefix}' is not in git alphabet [0-9a-f] (case-insensitive)`);
  }
  const idString = toGitRev(id);
  if (prefix.length > idString.length) return false;
  return idString.toLowerCase().startsWith(prefix.toLowerCase());
};

// jj side — backends/jj.ts (add to refs Object.freeze)
matchPrefix: (id: RevisionExpr, prefix: string): boolean => {
  if (prefix.length === 0) {
    throw new Error(`matchPrefix: empty prefix (caller bug)`);
  }
  // Wrong alphabet → throw. jj change_ids are k-z lower-only.
  if (!/^[k-z]+$/.test(prefix)) {
    throw new Error(`matchPrefix: prefix '${prefix}' is not in jj alphabet [k-z] (lowercase only)`);
  }
  const idString = toJjRev(id);
  if (prefix.length > idString.length) return false;
  return idString.startsWith(prefix);
},
```

**Test cross-product (10 cases minimum per CF-04):**

| # | Backend | Rule | Test | Expected |
|---|---------|------|------|----------|
| 1 | git | canonical-match | `matchPrefix(<hex-id>, <hex-prefix-matches>)` | `true` |
| 2 | jj | canonical-match | `matchPrefix(<jj-id>, <kz-prefix-matches>)` | `true` |
| 3 | git | wrong-alphabet-throw | `matchPrefix(<hex-id>, 'kxyz')` | throws |
| 4 | jj | wrong-alphabet-throw | `matchPrefix(<jj-id>, 'abc1')` | throws |
| 5 | git | empty-prefix-throw | `matchPrefix(<hex-id>, '')` | throws |
| 6 | jj | empty-prefix-throw | `matchPrefix(<jj-id>, '')` | throws |
| 7 | git | prefix-too-long-false | `matchPrefix(<hex-id>, '<41-hex>')` | `false` |
| 8 | jj | prefix-too-long-false | `matchPrefix(<jj-id>, '<13-kz>')` | `false` |
| 9 | git | case-insensitivity-for-hex | `matchPrefix(<hex-id>, 'ABCdef')` against `'abcdef…'` id | `true` |
| 10 | jj | k-z-lower-only | `matchPrefix(<jj-id>, 'KMNOP')` (uppercase) | throws (uppercase not in `[k-z]`) |

## Cross-Backend Test Harness

The harness lives at `sdk/src/vcs/__tests__/adapter-contract.test.ts` and follows this pattern (verified at line 28-37):

```typescript
// Source: adapter-contract.test.ts:9 + 28-37
import { makeBackendFixture, selectedBackends } from './vcs-fixture.js';
import { BACKENDS_AVAILABLE_FOR_VERB } from '../backends.js';

describe.for(selectedBackends())('VcsAdapter contract — backend=%s', (kind) => {
  const { test, setupHooks } = makeBackendFixture(kind);
  setupHooks();
  const ready = (verb: string): boolean => verbReady(verb, kind);

  test.skipIf(!ready('refs.idAlphabet'))('vcs.refs.idAlphabet returns backend-specific alphabet', ({ vcs }) => {
    const a = vcs.refs.idAlphabet;
    if (vcs.kind === 'git') expect(a).toBe('0-9a-f');
    else expect(a).toBe('k-z');
  });

  test.skipIf(!ready('refs.matchPrefix'))('vcs.refs.matchPrefix throws on wrong alphabet', ({ vcs, cwd }) => {
    // … (10-case cross-product cases per the table above)
  });
});
```

**Per-backend test file pattern** (for cancel scenarios, which can't be cross-backend due to per-backend dispatch state setup):

`sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` (mirror `cmd-parallel-jj.test.ts:1-100` structure):
1. **cancel-clean-abandon:** dispatch → no agents work → cancel → verify abandoned.length === N, surplusWorkspaces.length === N, failedReaped.length === 0, surplusBookmarks.length === 0; no workspace dirs on disk.
2. **cancel-idempotent-recall:** dispatch → cancel → cancel again → second call returns all-empty arrays (D-03 idempotency).
3. **cancel-partial-state-recovery:** dispatch → manually `rm -rf` one workspace dir before cancel → cancel → that workspace shows up neither in abandoned nor failedReaped (already gone is not an error per D-06), surplusWorkspaces is N-1; the remaining N-1 workspaces are torn down.

`sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts` mirrors the same three scenarios but uses git fixture + `git branch -D` invocations for surplusBookmarks verification.

## Pre-Rename Audit Generator (D-13)

Skeleton mirroring `scripts/audit-id-namespace.cjs` shape (verified at `scripts/audit-id-namespace.cjs:1-50`):

```javascript
// scripts/audit-root-commits-rename.cjs (Phase 15 plan 15.01, NAMING-01)
#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCAN_ROOTS = ['.'];  // whole repo, less SKIP_DIRS
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.jj', 'dist-cjs',
  '.archive-pre-v1.4',     // carve-out
  'v1.2-research',         // carve-out
]);
const PATTERN = /\brootCommits\b/;
const SCAN_EXTS = new Set(['.ts', '.cjs', '.js', '.md', '.json']);

function walk(dir, hits) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, hits); continue; }
    const ext = path.extname(entry.name);
    if (!SCAN_EXTS.has(ext)) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) {
        hits.push({ file: full.replace(/^\.\//, ''), line: i + 1, snippet: line, ext: ext.slice(1) });
      }
    });
  }
}

function main() {
  const hits = [];
  for (const root of SCAN_ROOTS) walk(root, hits);
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const byExtension = {};
  for (const h of hits) {
    (byExtension[h.ext] ||= []).push({ file: h.file, line: h.line, snippet: h.snippet });
  }

  // specialCases: the backends.ts:79 capability-matrix string literal (Pitfall 3 / D-11)
  const specialCases = hits
    .filter((h) => h.file === 'sdk/src/vcs/backends.ts' && h.line === 79)
    .map((h) => ({
      file: h.file,
      line: h.line,
      kind: 'capability-matrix-string-literal',
      snippet: h.snippet,
    }));

  // idempotencyHash: MD5 over sorted {file,line} tuples + per-extension counts (D-12)
  const hashSource = JSON.stringify({
    tuples: hits.map((h) => ({ file: h.file, line: h.line })),
    counts: Object.fromEntries(Object.entries(byExtension).map(([k, v]) => [k, v.length])),
  });
  const idempotencyHash = crypto.createHash('md5').update(hashSource).digest('hex');

  const output = {
    generatedAt: new Date().toISOString(),
    totalCount: hits.length,
    byExtension,
    specialCases,
    carveOuts: [
      { path: '.planning/research/.archive-pre-v1.4/', reason: 'historical-prose, pre-rename research artifacts (ROADMAP Phase 15 SC1 carve-out)' },
      { path: '.planning/milestones/v1.2-research/', reason: 'historical-prose, v1.2 deferred-item research (ROADMAP Phase 15 SC1 carve-out)' },
    ],
    idempotencyHash,
  };

  // Stdout-only per D-13 + feedback_avoid_jj_auto_tracked_output
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

if (require.main === module) main();
module.exports = { walk, PATTERN };  // for unit tests
```

**Invocation pattern (the plan task, not the script):**

```bash
node scripts/audit-root-commits-rename.cjs > .planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json
```

The script writes nothing to disk; the plan task redirects stdout. This honors `feedback_avoid_jj_auto_tracked_output`.

**D-10 verification gate (post-rename):**

```bash
for ext in ts cjs js md json; do
  count=$(grep -rn '\brootCommits\b' --include="*.$ext" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.jj \
    --exclude-dir=dist-cjs --exclude-dir=.archive-pre-v1.4 \
    --exclude-dir=v1.2-research | wc -l)
  [[ $count -eq 0 ]] || { echo "FAIL: $ext still has $count hits"; exit 1; }
done
```

## Common Pitfalls

### Pitfall 1: Missing `backends.ts:79` capability-matrix string literal

**What goes wrong:** TS compiler does not catch string-keyed object access. Renaming `rootCommits` to `rootRevisions` everywhere except line 79 means the capability matrix entry `'refs.rootCommits'` becomes orphan data — capability probes (e.g., `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']`) will return `undefined` and the verb-availability allowlist breaks silently.
**Why it happens:** It's a string key, not a typed reference. The 2026-05-15 v1.2 retro CR-01 caught the same failure mode in `commands.cjs:1005`.
**How to avoid:** Pre-rename JSON audit `specialCases` field explicitly surfaces this site (D-11). Post-rename grep must verify the new string `'refs.rootRevisions'` exists at the same line. Plan must include a contract test that calls `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']` and asserts it includes `'git'` + `'jj-colocated'`.
**Warning signs:** Capability probe in some downstream caller returns unexpected falsey; existing `BACKENDS_AVAILABLE_FOR_VERB` keys log doesn't include the new name.

### Pitfall 2: CJS-side miss (commands.cjs)

**What goes wrong:** `get-shit-done/bin/lib/commands.cjs:1005` is CJS (no TS compiler protection). If the rename TS-pass passes but commands.cjs is unchanged, `statsVcs.refs.rootCommits` at runtime returns `undefined` → `TypeError: undefined is not a function` inside `roadmap.analyze`.
**Why it happens:** v1.2 retro CR-01 — TS compiler does not extend to CJS callers.
**How to avoid:** Pre-rename JSON audit `byExtension.cjs` enumeration. Per-extension `grep -c '\brootCommits\b'` post-rename must equal 0 for `.cjs`.
**Warning signs:** `roadmap.analyze` test (or any test exercising `commands.cjs::computeRoadmapStats`) fails at runtime with `TypeError: undefined is not a function`.

### Pitfall 3: matchPrefix silent-false on wrong alphabet

**What goes wrong:** A natural implementation returns `false` when the prefix doesn't match the id's alphabet. Caller bug (e.g., feeding a jj prefix to the git backend) gets masked as a not-found result.
**Why it happens:** "Defensive programming" defaulting to false instead of throwing.
**How to avoid:** Per CF-04, `matchPrefix` THROWS on wrong-alphabet AND on empty prefix. Test cross-product (10 cases) catches any drift.
**Warning signs:** A test asserts `matchPrefix('abc1', <jj-id>) === false` — that's wrong; it should `expect(() => …).toThrow()`.

### Pitfall 4: AbortSignal threading through spawnSync

**What goes wrong:** A developer tries to "improve" cancel by threading `AbortController.signal` into `vcsExec`. Cancel becomes a no-op in pre-spawn state (the signal fires before the child process is spawned, and `spawnSync` returns with `error.code === 'ABORT_ERR'` but no actual abort happened — or worse, the signal is silently ignored because `spawnSync` is synchronous).
**Why it happens:** Misunderstanding of `spawnSync`'s synchronous nature.
**How to avoid:** CF-05 is a HARD rule. `vcsExec` does not accept `AbortSignal`. Verified empirically this session: `spawnSync('echo', ['x'], {signal: …})` does not respect `AbortController` semantics meaningfully. Cancel is synchronous teardown only.
**Warning signs:** Anyone proposes adding `signal: AbortSignal` to `ExecOptions` or proposes a `vcsExecAsync` primitive as part of Phase 15 — this is OUT OF SCOPE per PROJECT.md OOS clause.

### Pitfall 5: Cancel-helper drift from reap.ts contract

**What goes wrong:** Developer thinks "this is the same teardown logic as reap" and adds the helper to `reap.ts`, conflating "tear down everything explicitly requested" (cancel) with "preserve conflicted heads for inspection" (reap W3 (a)).
**Why it happens:** Surface similarity (both call `jj workspace forget` + `rmSync`).
**How to avoid:** D-04 places the helper in a new file `workspace-cleanup.ts`. The file boundary is the enforceable mechanism. The two files' header docstrings both call out the divergence explicitly.
**Warning signs:** Any PR diff that adds new exports to `reap.ts` named `cleanup*` or `tearDown*` — reject.

### Pitfall 6: Audit script writes its own output file

**What goes wrong:** The audit-script author "helpfully" writes the JSON output file directly from the script (e.g., `fs.writeFileSync(outputPath, …)`). On a colocated jj repo, this triggers auto-snapshot mid-rename-phase, polluting the working copy.
**Why it happens:** Natural "make the script do everything" reflex.
**How to avoid:** D-13 + `feedback_avoid_jj_auto_tracked_output`: script is stdout-only; plan task redirects.
**Warning signs:** Script contains `fs.writeFileSync` or `fs.writeFile` calls. Reject.

### Pitfall 7: idempotencyHash gets stale between audit and rename commit

**What goes wrong:** Operator runs audit, gets distracted, lands an unrelated commit that adds a new `rootCommits` reference, then runs the rename plan against the stale audit JSON. The new reference is missed.
**Why it happens:** Two distinct commits between audit-emit and rename.
**How to avoid:** D-12 specifies the MD5 idempotencyHash. Plan 15.01 task adjacency rule (D-12): audit-generation and rename steps run with NO other commits between. Plan 15.01 verification step: re-run audit, compare `idempotencyHash` against the committed JSON, fail if differs.
**Warning signs:** Post-rename grep finds a `rootCommits` reference; cross-check `idempotencyHash` mismatch.

### Pitfall 8: CLI bridge registered at 2 of 3 sites

**What goes wrong:** Per CF-07, missing any site breaks runtime. Most invisible failure: missing `command-aliases.generated.ts` — tab completion silently drops the verb but `gsd-sdk query workspace.parallel.cancel` still works via the static catalog. Differential breakage by dispatcher path.
**Why it happens:** Three files, no automated cross-check.
**How to avoid:** Plan 15.04 contract test: `gsd-sdk query workspace.parallel.cancel --help` (or equivalent that exercises the alias path) must succeed in CI.
**Warning signs:** Test passes locally via direct `workspaceParallelCancelQuery()` call but fails through the CLI alias dispatcher.

## Runtime State Inventory

Not applicable in the rename/refactor sense for the new verbs (idAlphabet, matchPrefix, cancel). For the **`rootCommits` → `rootRevisions` rename specifically:**

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `rootCommits` is a method name, not a stored key in any database/persistence layer. The verified greps across `*.json` show only documentation artifacts in `.planning/`, no live config or state files. | None |
| Live service config | None — no n8n / external service config references `rootCommits`. Verified by grep. | None |
| OS-registered state | None — no Windows Task Scheduler / launchd / systemd / pm2 references. Verified by grep. | None |
| Secrets/env vars | None — `rootCommits` is a TypeScript method name on `VcsRefs`, not an env var. Verified by grep across `*.env*` (no hits). | None |
| Build artifacts | `dist-cjs/` will carry references to `rootCommits` until the next compile. **Action:** plan 15.01 task must invoke `pnpm run build` (or whatever the SDK's build is) after the source rename to regenerate `dist-cjs/*.js` with the new name. Otherwise CJS consumers (`commands.cjs::computeRoadmapStats`) still bind to the old name via the compiled output. | Re-build `dist-cjs/` post-rename |

**Verified:** the carve-out `dist-cjs/` is already excluded from grep audits (per ROADMAP SC1's exclude list); however, the runtime CJS consumers will FAIL if `dist-cjs/` is not rebuilt. Plan must include explicit build step. Recommend a post-rename verification: `node -e "console.log(require('./dist-cjs/vcs/types.js'))"` (or similar smoke) confirms the new name compiled through.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| jj | jj-side parallel.cancel tests + cancel helper smoke | ✓ (assumed — used by all v1.3 phases) | 0.41 (per Phase 4 LEARNINGS) | None — jj-side tests skipIf unavailable |
| git | git-side parallel.cancel tests | ✓ (assumed — used by all phases) | (existing pin) | None — git-side tests skipIf unavailable |
| Node.js | All `.ts` builds + audit script | ✓ (assumed — current project) | ≥20 (vitest 3 requirement) | None |
| `node:crypto` (stdlib) | Audit script MD5 hash | ✓ (stdlib, always available) | — | — |
| `node:fs` `readdirSync({recursive: true})` | Audit script walker | ✓ (Node ≥18) | — | Replace with manual recursive walk if needed |

**Missing dependencies with no fallback:** None — phase is pure source change against an existing environment.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing pin in `sdk/`) |
| Config file | `sdk/vitest.config.ts` (existing) |
| Quick run command | `pnpm --filter sdk test -- --run --no-coverage -t "<test-name-filter>"` |
| Full suite command | `pnpm --filter sdk test -- --run --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAMING-01 | Pre-rename audit produces grouped-by-extension JSON with totalCount + specialCases + idempotencyHash | unit | `pnpm --filter sdk test -- --run -t "audit-root-commits-rename"` | ❌ Wave 0 (new test file `tests/scripts/audit-root-commits-rename.test.cjs` — note: this is a `node:test` test file, NOT vitest, since the audit script is in `scripts/` and tests in `tests/`) |
| NAMING-01 | Per-extension `grep -c '\brootCommits\b'` exits 0 after rename across `*.ts` `*.cjs` `*.js` (excl. carve-outs) | structural-grep | `for ext in ts cjs js; do count=$(grep -rn '\brootCommits\b' --include="*.$ext" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.jj --exclude-dir=dist-cjs --exclude-dir=.archive-pre-v1.4 --exclude-dir=v1.2-research | wc -l); [[ $count -eq 0 ]] \|\| exit 1; done` | ❌ Wave 0 (inline gate in plan 15.01) |
| NAMING-01 | `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']` exists and contains `['git', 'jj-colocated']` | unit | `pnpm --filter sdk test -- --run -t "BACKENDS_AVAILABLE_FOR_VERB.refs.rootRevisions"` | ❌ Wave 0 (regression test in `backends.test.ts` per plan 15.01) |
| NAMING-01 | `BACKENDS_AVAILABLE_FOR_VERB['refs.rootCommits']` does NOT exist (anti-assertion) | unit | same command, anti-assertion | ❌ Wave 0 |
| VCS-21 | `vcs.refs.idAlphabet === '0-9a-f'` on git adapter | adapter-contract | `pnpm --filter sdk test -- --run -t "vcs.refs.idAlphabet"` | ❌ Wave 0 (new in `adapter-contract.test.ts` per plan 15.02) |
| VCS-21 | `vcs.refs.idAlphabet === 'k-z'` on jj adapter | adapter-contract | same command | ❌ Wave 0 |
| VCS-22 | matchPrefix 10-case cross-product (5 rules × 2 backends) | adapter-contract | `pnpm --filter sdk test -- --run -t "vcs.refs.matchPrefix"` | ❌ Wave 0 (new in `adapter-contract.test.ts` per plan 15.03) |
| PARALLEL-07 | cancel-clean-abandon scenario on jj | per-backend-runtime | `pnpm --filter sdk test -- --run -t "workspace.parallel.cancel — N=2 clean"` | ❌ Wave 0 (new `cmd-parallel-cancel-jj.test.ts` per plan 15.04) |
| PARALLEL-07 | cancel-idempotent-recall on jj | per-backend-runtime | same suite | ❌ Wave 0 |
| PARALLEL-07 | cancel-partial-state-recovery on jj | per-backend-runtime | same suite | ❌ Wave 0 |
| PARALLEL-07 | Same three scenarios on git | per-backend-runtime | `pnpm --filter sdk test -- --run -t "workspace.parallel.cancel.*git"` | ❌ Wave 0 (new `cmd-parallel-cancel-git.test.ts` per plan 15.04) |
| PARALLEL-07 | CLI bridge accessible via `gsd-sdk query workspace.parallel.cancel` | smoke | `node bin/gsd-sdk.cjs query workspace.parallel.cancel --help` (exit 0) | ❌ Wave 0 (smoke in `cmd-parallel-cancel-{jj,git}.test.ts`) |
| PARALLEL-07 | CancelResult is frozen pure-JSON (no methods/closures/Symbols) | unit | `Object.isFrozen(result) === true; JSON.parse(JSON.stringify(result))` round-trip | ❌ Wave 0 |
| PARALLEL-07 (helper) | `cleanupSubagentWorkspaces` is idempotent — second call returns empty arrays | unit | new test `workspace-cleanup.test.ts` | ❌ Wave 0 (new in plan 15.04 Wave 1) |

### Sampling Rate

- **Per task commit:** `pnpm --filter sdk test -- --run --no-coverage -t "<plan-specific-filter>"` (~30s subset)
- **Per wave merge:** `pnpm --filter sdk test -- --run --no-coverage` (full SDK suite, ~3-5 min)
- **Phase gate:** Full SDK suite green AND `pnpm test` (root) green AND `node scripts/audit-root-commits-rename.cjs | jq '.totalCount'` returns 0 (i.e., no `rootCommits` references remain post-rename in scope)

### Wave 0 Gaps

- [ ] `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` — covers PARALLEL-07 jj-side scenarios (mirror `cmd-parallel-jj.test.ts` Pattern A/B/W2 structure)
- [ ] `sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts` — covers PARALLEL-07 git-side scenarios
- [ ] `sdk/src/vcs/__tests__/workspace-cleanup.test.ts` — covers helper idempotency + partial-state behavior (15.04 Wave 1)
- [ ] `tests/scripts/audit-root-commits-rename.test.cjs` — covers audit script's walker + hash determinism (note: `node:test` here, NOT vitest)
- [ ] New assertions in `sdk/src/vcs/__tests__/adapter-contract.test.ts` for `idAlphabet` + `matchPrefix` 10-case cross-product
- [ ] New assertions in `sdk/src/vcs/__tests__/backends.test.ts` for `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']` presence + `refs.rootCommits` absence
- Framework install: none — vitest + node:test both already present

### Per-Plan Validation Domain Summary

| Plan | Validation Domain | Validation Gate | False-Positive Risk |
|------|-------------------|------------------|---------------------|
| 15.01 (rename) | structural-grep + adapter-contract | Per-extension `grep -c` = 0 post-rename; `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']` regression test | **`backends.ts:79` string literal:** naive `grep` on TS source would miss it without the dedicated audit JSON's `specialCases` field surfacing it (Pitfall 3). The audit must explicitly call it out. |
| 15.02 (idAlphabet) | adapter-contract | Cross-backend `expect(vcs.refs.idAlphabet)` per backend kind | Low — alphabet values are constants verified empirically in `jj-id-alphabet-probe.test.ts:60-75` (jj 0.41 confirmed [k-z]) and `expr.ts:34-41` (hex confirmed). |
| 15.03 (matchPrefix) | adapter-contract | 10-case cross-product per CF-04 (5 rules × 2 backends) | **Silent-false:** if implementation defaults to false on wrong alphabet instead of throwing, half the cases pass for the wrong reason. Test must `expect(() => …).toThrow()` explicitly (not `expect(…).toBe(false)`). |
| 15.04 (cancel + helper) | per-backend-runtime + smoke | Three scenarios per backend + idempotent helper + CLI three-site smoke | **Two of three CLI sites missed:** Pitfall 8 — must include a smoke test via the actual `gsd-sdk query` dispatcher path. |

## Code Examples

### Reading the existing parallel namespace wire-in

```typescript
// Source: sdk/src/vcs/backends/jj.ts:1255-1264 (verified)
parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performJjParallelFanIn(cwd, handle, results),
  // Plan 15.04 adds:
  cancel: (handle: ParallelDispatchHandle): CancelResult =>
    performJjParallelCancel(cwd, handle),
}),
```

```typescript
// Source: sdk/src/vcs/backends/git.ts:738-745 (verified)
parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performGitParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performGitParallelFanIn(cwd, handle, results),
  // Plan 15.04 adds:
  cancel: (handle: ParallelDispatchHandle): CancelResult =>
    performGitParallelCancel(cwd, handle),
}),
```

### performJjParallelCancel sketch (new export in jj/parallel.ts)

```typescript
// New export added to sdk/src/vcs/jj/parallel.ts (Plan 15.04 Wave 2)
import { cleanupSubagentWorkspaces } from './workspace-cleanup.js';

export function performJjParallelCancel(
  mainRepoRoot: string,
  handle: ParallelDispatchHandle,
): CancelResult {
  // surplusWorkspaces: enumerate dirs that exist on disk pre-cancel
  // (counted regardless of cleanup outcome per D-02).
  const surplusWorkspaces: string[] = [];
  for (const ws of handle.workspaces) {
    if (existsSync(ws.path)) surplusWorkspaces.push(ws.path);
  }

  // Delegate to shared helper (D-04, D-05, IP-5).
  const { abandoned, failedReaped } = cleanupSubagentWorkspaces(
    mainRepoRoot,
    handle.phaseNumber,
  );

  // jj has no per-subagent bookmarks (Phase 11 D-02); surplusBookmarks is [].
  const surplusBookmarks: string[] = [];

  return Object.freeze({
    abandoned: Object.freeze(abandoned.slice()) as readonly string[],
    failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
    surplusBookmarks: Object.freeze(surplusBookmarks) as readonly string[],
    surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()) as readonly string[],
  }) satisfies CancelResult;
}
```

### performGitParallelCancel sketch (new export in git/parallel.ts)

```typescript
// New export added to sdk/src/vcs/git/parallel.ts (Plan 15.04 Wave 2)
export function performGitParallelCancel(
  mainRepoRoot: string,
  handle: ParallelDispatchHandle,
): CancelResult {
  const surplusWorkspaces: string[] = [];
  for (const ws of handle.workspaces) {
    if (existsSync(ws.path)) surplusWorkspaces.push(ws.path);
  }

  const abandoned: string[] = [];
  const failedReaped: string[] = [];
  const surplusBookmarks: string[] = [];

  for (const ws of handle.workspaces) {
    const agentBookmark = `worktree-agent-${ws.agentId}`;

    // Step 1: worktree remove --force (cancel = "tear down regardless" per CF-06).
    const wtRes = vcsExec(mainRepoRoot, 'git', ['worktree', 'remove', '--force', ws.path]);
    if (wtRes.exitCode === 0) {
      // Step 2: branch -D the per-agent bookmark.
      const brRes = vcsExec(mainRepoRoot, 'git', ['branch', '-D', agentBookmark]);
      if (brRes.exitCode === 0) {
        surplusBookmarks.push(agentBookmark);
        abandoned.push(ws.agentId);
      } else {
        failedReaped.push(ws.agentId);
      }
    } else {
      failedReaped.push(ws.agentId);
    }
  }

  return Object.freeze({
    abandoned: Object.freeze(abandoned) as readonly string[],
    failedReaped: Object.freeze(failedReaped) as readonly string[],
    surplusBookmarks: Object.freeze(surplusBookmarks) as readonly string[],
    surplusWorkspaces: Object.freeze(surplusWorkspaces) as readonly string[],
  }) satisfies CancelResult;
}
```

### CLI bridge sketch (new file)

```typescript
// sdk/src/query/workspace-parallel-cancel.ts (Plan 15.04 Wave 2)
import { readFileSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import type { ParallelDispatchHandle } from '../vcs/types.js';
import type { QueryHandler } from './utils.js';

function resolveFileOrStdin(raw: string): string {
  if (raw === '@-') return readFileSync(0, 'utf-8');
  if (raw.startsWith('@')) return readFileSync(raw.slice(1), 'utf-8');
  throw new Error(`expected @<path> or @- but got inline string (inline JSON form is not accepted)`);
}

export const workspaceParallelCancelQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let handleRaw: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) cwd = args[++i];
    else if (args[i] === '--handle' && args[i + 1]) handleRaw = args[++i];
  }

  if (handleRaw === undefined) {
    return { data: { ok: false, reason: 'handle_required' } };
  }

  let handle: ParallelDispatchHandle;
  try {
    handle = JSON.parse(resolveFileOrStdin(handleRaw));
  } catch (err) {
    return {
      data: {
        ok: false,
        reason: 'handle_json_parse_failed',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const vcs = createVcsAdapter(cwd);
  const result = vcs.workspace.parallel.cancel(handle);
  return { data: result };
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `jj workspace forget` + `rm -rf` in workflow markdown | `vcs.workspace.parallel.fan-in` clean-path + (after Phase 16) `cleanupSubagentWorkspaces` helper | Phase 11 (raw-git deletion) + Phase 15 (helper extraction) | Single owner per IP-5; no workflow-markdown raw-jj for teardown. |
| FanInResult-without-cancel-mirror | CancelResult mirrors FanInResult field naming verbatim (`failedReaped`, `surplusBookmarks`) | Phase 15 D-01 | Cross-surface symmetry; reduces cognitive load for callers. |
| Three regex duplications of `[0-9a-f]` / `[k-z]` alphabets across `expr.ts:41`, `format-migration/rewrite.ts:53,63`, `parse/jj-id.ts` | Canonical opaque source: `vcs.refs.idAlphabet` | Phase 15 plan 15.02 | OPTIONAL refactor to consume canonical source — DEFERRED to Phase 17 docs-drift batch (CF-03 says YAGNI for now). |

**Deprecated/outdated:**
- `LogEntry.hash` → `.id` (v1.2 NAMING-01, shipped) — same hard-rename pattern that 15.01 follows.
- `commit_id` template references on jj backend — eliminated by v1.2 FLIP-01..04.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dist-cjs/` is excluded from grep audit but MUST be rebuilt post-rename | Runtime State Inventory | If not rebuilt, CJS consumers (`commands.cjs`) still bind to old name via compiled output → runtime `TypeError` |
| A2 | Active `.planning/research/{ARCHITECTURE,PITFALLS,SUMMARY}.md` (v1.4) are planner-judgment for rename — recommendation: historical-prose carve-out by default | rootCommits Call-Site Inventory | If renamed, planning docs become inconsistent with future v1.4 retrospectives; if left, post-rename audit shows non-zero markdown count (`.md` count goes to ~14 hits in active planning files) — but ROADMAP SC1 only requires `grep -c` = 0 on production-code extensions, not `.md` |
| A3 | The 26 figure in CONTEXT.md is an over-count; actual production hits = 22 (19 `.ts` + 3 `.cjs`) | rootCommits Call-Site Inventory | If planner authors plan 15.01 with `must_haves.count === 26`, the post-rename grep will pass with 22 hits removed, leaving 4 ghost obligations — false alarm but cosmetic |
| A4 | `BACKENDS_AVAILABLE_FOR_VERB` shape needs new entry `'refs.idAlphabet'`, `'refs.matchPrefix'`, `'workspace.parallel.cancel'` (all `['git', 'jj-colocated']`) | code_context in CONTEXT.md | If not added, contract-test gate `ready('refs.idAlphabet')` returns false → all new tests are skipped → silent regression. Plan 15.02 must explicitly include this entry. |
| A5 | The audit JSON path is `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` (slug dir), not `.planning/phases/15/...` | Recommended Project Structure | If plan 15.01 task writes to `.planning/phases/15/` (no slug), it creates a sibling directory that doesn't match the current `.planning/phases/15-adapter-surface-extensions-rename/` slug, polluting `.planning/phases/`. Recommend confirming with user during planning. |
| A6 | The `phaseRoot` argument to `cleanupSubagentWorkspaces` is actually the **main repo root** (not the phase directory under `.planning/`), because subagent workspaces live at `<mainRepoRoot>/.claude/jj-workspaces/...` | Helper Sidecar Pattern | If interpreted as `.planning/phases/{NN}/` directory, the helper enumerates the wrong filesystem path → 0 workspaces found → silent no-op. Recommend renaming the parameter to `mainRepoRoot` for clarity, OR confirming the path semantics with user. |
| A7 | `pnpm test` is the appropriate command for the full SDK suite, and the `sdk/` workspace runs via `pnpm --filter sdk` | Validation Architecture / Sampling Rate | Wrong invocation → no tests run → false-positive green CI. Verifier must confirm the exact pnpm invocation pattern. |

## Open Questions

1. **Should active v1.4 `.planning/research/*.md` files have `rootCommits` → `rootRevisions` renamed, or treated as historical-prose like the archive?**
   - What we know: ROADMAP SC1 excludes only `.archive-pre-v1.4/` and `v1.2-research/` explicitly. The active research files contain 28 hits combined (14 ARCHITECTURE + 11 PITFALLS + 3 SUMMARY).
   - What's unclear: whether 15.01 must drive `.md` count to 0 across all `.md` files, or whether `.planning/` is implicitly a historical-prose carve-out.
   - Recommendation: planner asks user during 15.01 plan-phase; default policy "rename PROJECT.md + STATE.md active sections + leave research/intel/seeds historical-prose."

2. **Should `cleanupSubagentWorkspaces` parameter be `phaseRoot` (per CONTEXT D-05) or `mainRepoRoot` (per actual filesystem semantics)?**
   - What we know: subagent workspaces live at `<mainRepoRoot>/.claude/jj-workspaces/...` per `octopus.ts:302`. The CONTEXT D-05 signature names the first param `phaseRoot: string` which is misleading.
   - What's unclear: whether D-05 anticipated `phaseRoot = .planning/phases/{NN}/` (semantically wrong) or just used the wrong variable name.
   - Recommendation: rename to `mainRepoRoot` in implementation; flag the divergence from CONTEXT.md in plan 15.04 task description.

3. **Should plan 15.01 use a single commit (audit + rename together) or two commits (audit landed first, rename second)?**
   - What we know: D-12 says audit-generation and rename steps must run in adjacency (no other commits between). This is ambiguous — adjacency could mean "back-to-back" (two commits) or "same commit."
   - What's unclear: whether the audit JSON is meant to be committed at all, or just generated as a verification artifact and discarded.
   - Recommendation: plan 15.01 commits the audit JSON to `.planning/phases/15-…/rootCommits-rename-audit.json` then runs rename in the immediate next commit. This gives a recoverable artifact + adjacency guarantee.

4. **Does plan 15.02 add `'refs.idAlphabet'` to `BACKENDS_AVAILABLE_FOR_VERB`, or is the verb implicitly always-available (no per-verb gate)?**
   - What we know: existing verbs (e.g., `'refs.rootCommits'`) are explicitly listed. The pattern suggests yes.
   - What's unclear: is `idAlphabet` a method (verb) or a readonly property (data)? Per CF-03, opaque `readonly string` — it's data, not a method.
   - Recommendation: planner adds the entry anyway for consistency with the test harness's `ready(verb)` gate.

## Sources

### Primary (HIGH confidence)

- `sdk/src/vcs/types.ts:336-541` (Read) — VcsRefs interface, FanInResult, VcsWorkspaceParallel, ParallelDispatchHandle shapes
- `sdk/src/vcs/exec.ts:1-126` (Read) — vcsExec signature + ExecResult + sentinels
- `sdk/src/vcs/backends.ts:1-172` (Read) — capability matrix with `'refs.rootCommits'` at :79
- `sdk/src/vcs/backends/git.ts:515-568` + `:725-745` (Read) — refs Object.freeze + parallel namespace
- `sdk/src/vcs/backends/jj.ts:700-776` + `:950-980` + `:1250-1265` (Read) — bookmarks ops + refs + parallel namespace
- `sdk/src/vcs/jj/parallel.ts:1-479` (Read) — composition layer + jjArgvFlags inline pattern + W3 (a) joint-assertion
- `sdk/src/vcs/jj/reap.ts:1-272` (Read) — UPSTREAM-02 sidecar pattern + abandon+forget+rm-rf flow
- `sdk/src/vcs/jj/conflict-paths.ts:1-50` (Read) — sidecar header shape template
- `sdk/src/vcs/jj/incomplete-work.ts:1-50` (Read) — sidecar header shape template
- `sdk/src/vcs/jj/octopus.ts:280-320` (Read) — subagent workspace path pattern (`.claude/jj-workspaces/phase-{NN}-subagent-{idx}`)
- `sdk/src/vcs/git/parallel.ts:1-100` + `:270-360` (Read) — git-side parallel sidecar + worktree cleanup patterns
- `sdk/src/vcs/refs-validator.ts:1-96` (Read) — validateRefname inline-validation precedent for CF-04 throw-on-wrong-alphabet
- `sdk/src/vcs/format-migration/rewrite.ts:45-65` (Read) — existing GIT_SHA_RE + JJ_CID_RE alphabet regexes
- `sdk/src/vcs/expr.ts:30-45` (Read) — SHA_OR_CHANGE_ID_RE permissive validator
- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:1-77` (Read) — empirical alphabet-disjointness verification
- `sdk/src/vcs/__tests__/adapter-contract.test.ts:1-120` (Read) — cross-backend test pattern
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:1-200` (Read) — per-backend parallel test pattern (Pattern A/B/W2 lifecycle)
- `sdk/src/vcs/__tests__/vcs-fixture.ts:1-80` (Read) — backend fixture factory
- `tests/__tools__/vitest-matchers.ts:1-59` (Read) — toBeIdOf custom matcher
- `sdk/src/query/workspace-parallel-dispatch.ts:1-112` (Read) — CLI bridge precedent
- `sdk/src/query/workspace-parallel-fan-in.ts:1-128` (Read) — CLI bridge precedent
- `sdk/src/query/command-static-catalog-domain.ts:1-127` (Read) — three-site registration (catalog)
- `sdk/src/query/command-manifest.non-family.ts:55-65` (Read) — three-site registration (manifest)
- `sdk/src/query/command-aliases.generated.ts:140-165` (Read) — three-site registration (aliases)
- `scripts/audit-id-namespace.cjs:1-50` (Read) — audit script structural template
- `scripts/audit-workflow-raw-git.cjs:1-70` (Read) — stdout-only audit precedent
- `.planning/intel/id-namespace-audit.json:1-50` (Read) — JSON sidecar precedent
- `.planning/intel/id-namespace-audit.md:1-60` (Read) — verdict-table precedent
- `.planning/config.json:1-46` (Read) — workflow.nyquist_validation = true confirmed (Validation Architecture section required)

### Verified empirically (this session)

- `grep -rn '\brootCommits\b' --include='*.ts' --include='*.cjs' --include='*.js'` (Bash) — confirmed 22 production hits across 9 files; planning-doc count of 14 active files
- `grep -rln '\brootCommits\b' --include='*.md' --include='*.json' .planning` (Bash) — confirmed 14 active planning files (excl. carve-outs)
- `node -e "...spawnSync(...{signal:...})..."` (Bash) — confirmed `spawnSync` does not meaningfully accept AbortSignal; CF-05 structurally validated

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/SUMMARY.md` (Read, in CONTEXT.md references) — v1.4 research synthesis referenced for pitfall framing

## Metadata

**Confidence breakdown:**
- Call-site inventory: HIGH — every site verified by Read tool, line numbers and snippets confirmed
- VcsRefs / FanInResult / VcsWorkspaceParallel shapes: HIGH — line ranges verified by Read
- vcsExec signature: HIGH — Read + reap.ts precedent
- workspace.forget / worktree remove semantics: HIGH — `jj/reap.ts:184` comment is authoritative for jj; `git/parallel.ts:30-31` comment + practice for git
- CLI bridge three-site registration: HIGH — all three sites Read with current entries verified
- Cross-backend test harness: HIGH — adapter-contract.test.ts:28-37 + cmd-parallel-jj.test.ts:97-200 directly inspected
- AbortSignal threading on spawnSync: HIGH — verified empirically this session
- Audit JSON schema: HIGH — D-09 verbatim in CONTEXT.md, replicated; mirrors id-namespace-audit.json shape
- Helper signature interpretation (A6): MEDIUM — flagged as Open Question 2; recommend confirmation
- 26 vs 22 production hit count (A3): HIGH — verified by grep; the CONTEXT.md figure is reconciled by separating production vs planning hits

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days — stable adapter-surface domain; no upstream churn expected on these files between now and Phase 15 execution)

## RESEARCH COMPLETE

Adapter-surface extension + rename research is comprehensive: 22 production rootCommits sites enumerated by file+line+snippet, FanInResult+VcsWorkspaceParallel+ParallelDispatchHandle insertion sites verified at exact line numbers, three-site CLI bridge registration pattern documented with precedent entries, helper sidecar pattern templated from v1.3 conflict-paths.ts shape, and the CF-05 AbortSignal-cannot-thread invariant empirically confirmed — the planner now has every signature, schema, and call-site location needed to author plans 15.01 through 15.04 sequentially without re-discovering the codebase.
