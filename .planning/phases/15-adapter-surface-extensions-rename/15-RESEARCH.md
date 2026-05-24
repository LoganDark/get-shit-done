# Phase 15: Adapter surface extensions + rename — Research

**Researched:** 2026-05-24 (FORCE-REFRESH after Phase 14.1 PARALLEL-08 landed; supersedes prior 15-RESEARCH.md)
**Domain:** Cross-backend VcsAdapter surface (TypeScript SDK)
**Confidence:** HIGH (entire research is grounded in live source reads of the post-14.1 codebase; zero `[ASSUMED]` package claims — no new dependencies are added)

## Summary

Phase 15 is **pure adapter-surface work** on `sdk/src/vcs/`. Three new public verbs (`vcs.refs.idAlphabet`, `vcs.refs.matchPrefix`, `vcs.workspace.parallel.cancel`) and one hard rename (`rootCommits` → `rootRevisions`). Four sequential plans (15.01 → 15.04) — file overlap on `types.ts` + `backends/{git,jj}.ts` forbids wave parallelism. The `cleanupSubagentWorkspaces` helper extracted as 15.04 Wave 1 is the canonical single-owner surface that Phase 16 CLEANUP-02 consumes (IP-5).

The biggest delta vs. the previous research pass: **Phase 14.1 (commits `tvkykqy` + `vlmlsqq` + `rwrpszp` shipped 2026-05-24) revised the `ParallelDispatchOpts` / `ParallelDispatchHandle` contract while this RESEARCH was being built.** `mainBookmark: string` is now `mainBookmarks?: readonly string[]` (optional, plural, frozen). The CR-03 lint flipped polarity. SC5 scenarios shipped 3 per backend. Six observable consequences for Phase 15 (especially 15.04 `cancel`):

1. The dispatch contract is **already bookmark-free at the surface level** — `cancel(handle)` does NOT need to validate a bookmark field. The handle carries `mainBookmarks?: readonly string[]` but cancel operates on the **workspace SET** only.
2. **`Object.freeze([...(mainBookmarks ?? [])])`** pattern (jj/parallel.ts:251, git/parallel.ts:260) is the precedent for any new frozen-array Handle field. `CancelResult` does not need new array fields — but if 15.04 plan emits any, this is the freeze idiom.
3. **`FanInResult` is 6 fields**, not 5 as the previous research implied: `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` (`sdk/src/vcs/types.ts:552-560`). The CONTEXT D-01 `CancelResult` envelope shape (4-field) is correct — it borrows only the `failedReaped` and `surplusBookmarks` field names from `FanInResult`, not the whole shape.
4. **`validateMainBookmark` (jj/parallel.ts:120) and `validateRefname` (`sdk/src/vcs/refs-validator.ts`) have different strictness** — jj's regex `/^[A-Za-z0-9._/-]+$/` accepts `..`; git's `validateRefname` rejects `..` per `git-check-ref-format(1)`. The cancel verb does not validate anything bookmark-related, but the matchPrefix verb (15.03) must apply the SAME alphabet-discipline gates.
5. Three new SC5 scenarios per backend (lines `cmd-parallel-jj.test.ts:475-700`, `cmd-parallel-git.test.ts:737-958`) demonstrate the **"setup → dispatch → simulate work → fan-in → assert state"** test pattern. 15.04 cancel scenarios should mirror this exactly (substitute `cancel(handle)` for `fanIn(handle, results)`).
6. **Stale references in 15-04-PLAN.md flagged by Phase 14.1 verifier** at lines 151 and 404 use `mainBookmark: 'main'` shape. These will TSC-fail when 15.04 executes; the executor must translate to `mainBookmarks: ['main']` or omit entirely.

**Primary recommendation:** Execute plans in strict 15.01 → 15.02 → 15.03 → 15.04 order (CF-01). Adopt the Phase 14.1 frozen-shallow-copy + Object.freeze pattern verbatim for any new Handle fields. Apply CF-02 two-pass all-or-nothing validate-then-mutate idiom anywhere the cancel verb iterates over a non-empty list. Patch the two `15-04-PLAN.md` stale references (lines 151, 404) at the top of 15.04 execution before TSC fires.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried Forward from ROADMAP + research synthesis:**

- **CF-01:** Sequential plan order within phase: 15.01 rename → 15.02 idAlphabet → 15.03 matchPrefix → 15.04 cancel. File-overlap on `types.ts` + `backends/{git,jj}.ts` forces serial, NOT parallel waves.
- **CF-02:** 15.01 `rootCommits` → `rootRevisions` is a hard rename, no deprecation alias (v1.2 NAMING-01 `LogEntry.hash → .id` precedent). Archived `.planning/research/.archive-pre-v1.4/` + `.planning/milestones/v1.2-research/` are historical-prose carve-outs. The `sdk/src/vcs/backends.ts:79` capability matrix STRING LITERAL `'refs.rootCommits'` MUST flip.
- **CF-03:** 15.02 `vcs.refs.idAlphabet` returns opaque `readonly string` — `'0-9a-f'` (git) / `'k-z'` (jj). FEATURES.md's structured `{kind, chars, minLen, maxLen}` alternative REJECTED — YAGNI.
- **CF-04:** 15.03 `vcs.refs.matchPrefix(id: RevisionExpr, prefix: string): boolean` — throws on wrong-alphabet, throws on empty prefix, returns `false` on `prefix.length > id.length`, hex case-insensitive, k-z lower-only. Test cross-product mandatory.
- **CF-05:** 15.04 `vcs.workspace.parallel.cancel(handle: ParallelDispatchHandle): CancelResult` — synchronous teardown only (STACK lens / Pitfall 5). Does NOT signal subagents. `vcsExecAsync` is OOS.
- **CF-06:** 15.04 cancel cleanup mechanics: `workspace.forget` + `rm -rf` (jj) or `worktree remove --force` (git) + `bookmarks.delete({force:true})`. Reuses shared `cleanupSubagentWorkspaces` helper extracted as 15.04 Wave 1.
- **CF-07:** New CLI bridge `sdk/src/query/workspace-parallel-cancel.ts` registered at all three sites.
- **CF-08:** No fold-in of pending todos.

**Envelope shape (CancelResult):**

- **D-01:** `CancelResult = { abandoned: readonly string[]; failedReaped: readonly string[]; surplusBookmarks: readonly string[]; surplusWorkspaces: readonly string[] }`. **4-field envelope.** Mirrors `FanInResult.failedReaped` naming verbatim.
- **D-02:** Field semantics: `abandoned` = workspace identifiers fully torn down; `failedReaped` = identifiers that resisted teardown (length 0 on clean); `surplusBookmarks` = bookmark names that needed force-delete; `surplusWorkspaces` = workspace paths still on disk pre-cancel.
- **D-03:** Cancel is **idempotent** — re-call returns `CancelResult` with empty arrays.

**Helper location:**

- **D-04:** Helper lives at **`sdk/src/vcs/jj/workspace-cleanup.ts`** (new sidecar). Matches v1.3 sidecar pattern.
- **D-05:** Signature: `cleanupSubagentWorkspaces(phaseRoot: string, phaseNumber: number): CleanupSubagentWorkspacesResult` where `CleanupSubagentWorkspacesResult = { abandoned: readonly string[]; failedReaped: readonly string[] }`.
- **D-06:** Helper is **idempotent** by contract — missing dirs are not errors.
- **D-07:** UPSTREAM-02 sidecar discipline: does NOT import from `backends/jj.ts`. Imports `vcsExec` from `../exec.js`; uses `node:fs` for `rmSync`.
- **D-08:** Phase 16 adds CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` (NOT Phase 15).

**rootCommits audit JSON schema:**

- **D-09:** Audit at `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` with grouped-by-extension schema (see CONTEXT for the literal layout).
- **D-10:** Per-extension `grep -c '\brootCommits\b'` (excluding carveOuts) must exit 0 BEFORE commit.
- **D-11:** `specialCases` field surfaces the `backends.ts:79` capability matrix string literal.
- **D-12:** `idempotencyHash` (MD5 over sorted `{file, line}` tuples + per-extension counts).
- **D-13:** Audit generator lives at `scripts/audit-root-commits-rename.cjs`. Stdout-only per `feedback_avoid_jj_auto_tracked_output`.

### Claude's Discretion

Planner-level details NOT pinned at discuss-phase:
- Exact JSDoc wording on the new `idAlphabet` / `matchPrefix` / `cancel` methods.
- Whether `CancelResult.abandoned` carries agentId, workspace name, or workspace path (recommendation: agentId).
- Test fixture choice (Pattern B random-prefix `mkdtemp` is the v1.3 default).
- Helper internal: `readdirSync` + suffix filter vs. `jj workspace list --quiet` + name-prefix filter (recommendation: filesystem-first).
- Exact JSON serialization order in the audit sidecar (sorted-keys recommended).

### Deferred Ideas (OUT OF SCOPE)

- **`vcsExecAsync` async-exec primitive** — would enable mid-Agent signal-based cancellation. Defer to a future milestone.
- **Workflow-callable cancel verb** — cancel is adapter-facing only in v1.4.
- **`gsd-sdk query refs.match-prefix` CLI bridge** — no production caller in v1.4.
- **Refactor `expr.ts:41` + `format-migration/rewrite.ts:53,63` to consume new `idAlphabet`** — Phase 17 docs-drift batch or later.
- **CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts`** — ships in Phase 16, NOT Phase 15.
- **Widen `idAlphabet` to structured `{kind, chars, minLen, maxLen}`** — YAGNI.
- **Promote `cleanupSubagentWorkspaces` to cross-backend** — defer until git-side orphan-dirs become a problem.

The 5 v14-* todos in `.planning/todos/pending/` are mapped to Phases 16/17/18 via REQUIREMENTS.md, NOT Phase 15.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAMING-01 | `rootCommits` → `rootRevisions` cosmetic rename across SDK adapter surface, both backends, production callers, tests, baseline helper, capability matrix string literal. Hard rename, no deprecation alias. Pre-rename JSON sidecar audit. | Standard Stack + Architecture Patterns §"Pattern 1 Hard rename" + Code Examples §"rootCommits rename atomic-commit shape" |
| VCS-21 | `vcs.refs.idAlphabet` public introspection on both backends — `readonly idAlphabet: string` returning `'0-9a-f'` (git) / `'k-z'` (jj). Replaces 3 ad-hoc duplications. | Architecture Patterns §"Pattern 2 Opaque-string property" + Code Examples §"idAlphabet body shape" |
| VCS-22 | `vcs.refs.matchPrefix(id: RevisionExpr, prefix: string): boolean` alphabet-aware short-prefix matching on both backends. Throws on wrong-alphabet, throws on empty prefix, returns false on prefix.length > id.length, hex case-insensitive, k-z lower-only. | Architecture Patterns §"Pattern 3 Alphabet-aware probe" + Code Examples §"matchPrefix body shape" |
| PARALLEL-07 | `vcs.workspace.parallel.cancel(handle)` synchronous teardown of materialized workspaces from prior `dispatch` call. Composes `workspace.forget` + `rm -rf` (jj) / `worktree remove --force` (git) + `bookmarks.delete({force:true})`. Does NOT signal subagent processes. Reuses `cleanupSubagentWorkspaces` helper. Returns rich CancelResult envelope. | Architecture Patterns §"Pattern 4 Synchronous-teardown verb" + §"Pattern 5 Sidecar helper extraction" + Code Examples §"cancel body shape" + §"helper shape" |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `vcs.refs.idAlphabet` property | SDK adapter (`backends/{git,jj}.ts` refs namespace) | — | Pure metadata; per-backend constant; no exec call. Cross-backend surface unified per `project_unified_revision_model`. |
| `vcs.refs.matchPrefix(id, prefix)` | SDK adapter | — | Pure compute over the input string (no `jj`/`git` shell-out needed). Backend chooses validation alphabet from its own `idAlphabet`. |
| `vcs.workspace.parallel.cancel(handle)` | SDK adapter (`backends/{git,jj}.ts` workspace.parallel namespace) | UPSTREAM-02 sidecar (`jj/parallel.ts` orchestration + new `jj/workspace-cleanup.ts` helper) | Composition over `workspace.forget` / `workspace.remove` + helper; orchestration lives in sidecar, wire-in lives in backends. |
| `cleanupSubagentWorkspaces` helper | UPSTREAM-02 sidecar (`sdk/src/vcs/jj/workspace-cleanup.ts`) | — | Per CONTEXT D-04. Helper isolates from `reap.ts`'s W3(a) inspection contract; consumed by 15.04 cancel body + 16.02 fanIn clean-branch + 16.02 dogfood-restore.sh (single owner / IP-5). |
| `rootRevisions` rename audit JSON | One-shot script (`scripts/audit-root-commits-rename.cjs`) | — | Discardable post-milestone; stdout-only per `feedback_avoid_jj_auto_tracked_output`. |
| CLI bridge `workspace-parallel-cancel.ts` | SDK query layer (`sdk/src/query/`) | Three-site registration (catalog + manifest + aliases) | Standard CLI bridge precedent established by Phase 11 plan 02 + Phase 14.1's reuse for `workspace-parallel-dispatch.ts`. |

**Tier ownership note for cancel:** The CONTEXT-locked design correctly assigns `parallel.cancel` to the same `vcs.workspace.parallel.*` sub-sub-namespace as `dispatch` and `fanIn` — not top-level `vcs.cancel`. This honors the namespace lock-in from v1.3 (`vcs.workspace.parallel.*` per CONTEXT canonical_refs). Wire-in pattern: `backends/jj.ts:1257-1264` and `backends/git.ts:738-745` show the existing `Object.freeze({dispatch, fanIn})` shape — cancel adds as the third entry.

## Standard Stack

### Core

This phase adds **ZERO new dependencies**. All work is type-contract + body implementation in existing SDK modules.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.7.0` | Type contract in `sdk/src/vcs/types.ts` | Per `sdk/package.json` [VERIFIED]; SDK is `^5.7.0` per `engines` + `devDependencies`; no upgrade needed for Phase 15 |
| Node.js | `>= 22.0.0` | Runtime; `node:fs.rmSync`, `node:fs.readdirSync` for helper | Per `sdk/package.json` `engines.node` [VERIFIED]; live env at `v25.9.0` |
| vitest | `^3.1.1` | Test framework (adapter-contract.test, cmd-parallel-{jj,git}.test, jj-id-alphabet-probe.test) | Per `sdk/package.json` [VERIFIED]; SDK test files are `.test.ts` |
| `node --test` (`node:test`) | Built-in | Repo-level tests in `tests/` (e.g., `quick-md-parallel-dispatch.test.cjs`) | Per existing repo convention; `tests/` uses node-test for `.cjs`, `sdk/src/vcs/__tests__/` uses vitest for `.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` | Built-in | `rmSync({recursive: true, force: true})`, `readdirSync`, `existsSync` in `workspace-cleanup.ts` helper | All filesystem ops in the new helper |
| `node:path` | Built-in | `join(phaseRoot, '.claude/jj-workspaces', name)` | Workspace path derivation in helper |
| `crypto` (`node:crypto`) | Built-in | MD5 hash for `idempotencyHash` field in audit JSON (D-12) | Audit script only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hard rename of `rootCommits` | Deprecation alias (`rootCommits = rootRevisions`) | Rejected per CF-02 — v1.2 `LogEntry.hash → .id` precedent shipped without alias; saves shimming ~26 production callers twice. The alias would defeat Pitfall 3's "force the audit gate" benefit. |
| Opaque `idAlphabet` string | Structured `{kind: 'hex' \| 'reverse-base32', chars: string, minLen: number, maxLen: number}` | Rejected per CF-03 — YAGNI; would force callers to switch on `vcs.kind`-equivalent fields (defeats unified-revision-model). Widen later if a real consumer needs length bounds. |
| `matchPrefix` returns `false` on wrong-alphabet | Throws on wrong-alphabet | Per CF-04: THROW — silent-false would mask caller bugs (e.g. accidentally passing a hex prefix to a jj-backed adapter). |
| `cancel` signals subagent processes | `void` return + `AbortController` thread-through | Rejected per CF-05 — `spawnSync` exec layer at `sdk/src/vcs/exec.ts:19-126` cannot accept `AbortSignal`. Phase 9 D-01 orchestrator-awaits-`Agent()` invariant makes mid-flight cancel a non-problem. |
| Helper at `sdk/src/vcs/jj/reap.ts` | Extend `reap.ts` with `cleanupSubagentWorkspaces` | Rejected per CONTEXT D-04 — reap's W3(a) contract says "leave conflicted workspaces for inspection"; cancel's "tear down everything explicitly requested" diverges. File boundary makes the divergence enforceable. |
| Helper at `sdk/src/vcs/jj/parallel.ts` | Co-locate with cancel call site | Rejected per CONTEXT D-04 — file already >500 LOC; conflates wave-orchestration with arbitrary-phaseRoot teardown. |

**Installation:** None required. All TypeScript edits hit existing modules.

**Version verification (run during 15-execute, not now):**
```bash
node --version       # expect >= v22
jj --version         # expect 0.41+
git --version        # expect 2.50+
cd sdk && pnpm tsc --noEmit  # expect EXIT=0 after each plan
```

## Package Legitimacy Audit

> **N/A — Phase 15 installs no new packages.** All work is type-contract additions + body implementations on existing modules. The Package Legitimacy Gate protocol is skipped per `package_legitimacy_protocol` "whenever this phase installs external packages" trigger.

If a future scope expansion (out of scope for v1.4 per CONTEXT Deferred Ideas) added a CLI bridge consumer that needed a new dependency, the gate would apply — but the planned 15.04 CLI bridge re-uses `node:fs` + the existing `createVcsAdapter` factory.

## Architecture Patterns

### System Architecture Diagram

Phase 15 work flows through four sequential plans, each touching a small surface of the existing adapter:

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                  Phase 15 Execution                      │
                    └─────────────────────────────────────────────────────────┘

15.01 (rename)                  15.02 (idAlphabet)            15.03 (matchPrefix)            15.04 (cancel)
─────────────────                ───────────────────            ─────────────────              ──────────────────────
  ① audit script                  ① types.ts (VcsRefs)         ① types.ts (VcsRefs)           ① WAVE 1: helper extract
    runs (stdout)                   add `idAlphabet`             add `matchPrefix(id,p)`        sdk/src/vcs/jj/
       │                            (readonly string)            method signature              workspace-cleanup.ts
       ▼                              │                            │                             │
  ② audit JSON                       ▼                             ▼                             ▼
    sidecar written                 ② backends/git.ts            ② backends/git.ts           ② WAVE 2: types.ts
       │                              add `idAlphabet:'0-9a-f'`   add matchPrefix body         add CancelResult interface
       ▼                              backends/jj.ts               (case-insensitive            add cancel() method
  ③ types.ts                          add `idAlphabet:'k-z'`       hex; throws on wrong         to VcsWorkspaceParallel
    rootCommits→rootRevisions          │                           alphabet/empty)               │
    (1 site)                          ▼                            backends/jj.ts                ▼
       │                            ③ backends.ts (capability      add matchPrefix body         ③ backends/git.ts +
       ▼                              matrix)                       (lower-only k-z;             backends/jj.ts
  ④ backends/git.ts                   add 'refs.idAlphabet'         throws on wrong               wire cancel into
    backends/jj.ts                    row                          alphabet/empty)                workspace.parallel.*
    rename body (4 sites)              │                            │                             namespace; jj-side
    backends.ts:79                     ▼                            ▼                             delegates to new
    string literal flip               ④ adapter-contract.test.ts  ③ backends.ts                  performJjParallelCancel
    (capability matrix)              + cross-backend test:         row 'refs.matchPrefix'         in jj/parallel.ts that
       │                              both backends return          (capability matrix)            invokes the helper
       ▼                              expected literal               │                             │
  ⑤ commands.cjs                                                    ▼                             ▼
    progress.ts                                                  ④ cross-product test            ④ CLI bridge
    capture-vcs-baselines.cjs                                     2 backends × 5 rules =          sdk/src/query/
    test files (5 sites)                                          10 cases minimum;                workspace-parallel-cancel.ts
       │                                                          uses toBeIdOf matcher            │
       ▼                                                                                          ▼
  ⑥ TSC green +                                                                                 ⑤ THREE-SITE register
    grep -c '\brootCommits\b' === 0                                                              command-static-catalog-domain.ts
    (per extension)                                                                              command-manifest.non-family.ts
                                                                                                  command-aliases.generated.ts
                                                                                                    │
                                                                                                    ▼
                                                                                                  ⑥ scenario tests
                                                                                                  jj + git cmd-parallel-*.ts
                                                                                                  (cancel-clean-N=2,
                                                                                                  cancel-idempotent,
                                                                                                  cancel-failed-reap)
```

Data flow at consumption time (post-Phase-15):

```
ParallelDispatchHandle (frozen JSON)
   │
   ▼ vcs.workspace.parallel.cancel(handle)
backend wire-in (Object.freeze({dispatch, fanIn, cancel}))
   │
   ▼ jj backend
performJjParallelCancel(mainRepoRoot, handle)
   │
   ▼
cleanupSubagentWorkspaces(handle.phaseRoot, handle.phaseNumber)
   │   ┌─── readdirSync('.claude/jj-workspaces/')
   │   │     filter /^phase-{NN}-subagent-/
   │   │       │
   │   │       ▼ per dir:
   │   │   `jj workspace forget -- {name}` (idempotent — missing OK)
   │   │       │
   │   │       ▼
   │   │   `rm -rf {path}` (force; missing OK)
   │   │       │
   │   │       ▼
   │   │   on success: push to abandoned[]
   │   │   on failure: push to failedReaped[]
   │   └────────────────────────────────────
   │
   ▼ plus surplusBookmarks loop (git-side only, mirrors fanIn)
   │
   ▼
CancelResult (frozen pure JSON)
   {abandoned, failedReaped, surplusBookmarks, surplusWorkspaces}
```

### Recommended Project Structure

```
sdk/src/vcs/
├── types.ts                         # MODIFIED: rename rootCommits→rootRevisions; add idAlphabet, matchPrefix, cancel, CancelResult
├── backends.ts                      # MODIFIED: flip 'refs.rootCommits' literal; add 'refs.idAlphabet', 'refs.matchPrefix', 'workspace.parallel.cancel' rows
├── backends/
│   ├── git.ts                       # MODIFIED: rootRevisions body, idAlphabet:'0-9a-f', matchPrefix body, cancel wire-in
│   └── jj.ts                        # MODIFIED: same set; jj cancel delegates to jj/parallel.ts new export
├── jj/
│   ├── parallel.ts                  # MODIFIED: add performJjParallelCancel export (uses the new helper)
│   ├── workspace-cleanup.ts         # NEW (15.04 WAVE 1): cleanupSubagentWorkspaces helper
│   ├── reap.ts                      # UNTOUCHED: D-04 contract divergence
│   ├── octopus.ts                   # UNTOUCHED
│   ├── conflict-paths.ts            # UNTOUCHED (sidecar precedent ref)
│   ├── incomplete-work.ts           # UNTOUCHED (sidecar precedent ref)
│   ├── lock.ts                      # UNTOUCHED
│   └── pre-push.ts                  # UNTOUCHED
└── git/
    └── parallel.ts                  # MODIFIED: add performGitParallelCancel export (inline teardown — no jj-side helper)

sdk/src/query/
├── workspace-parallel-dispatch.ts   # UNTOUCHED (Phase 14.1 already revised)
├── workspace-parallel-fan-in.ts     # UNTOUCHED
├── workspace-parallel-cancel.ts     # NEW (15.04 CLI bridge)
├── command-static-catalog-domain.ts # MODIFIED (CF-07 site 1)
├── command-manifest.non-family.ts   # MODIFIED (CF-07 site 2)
└── command-aliases.generated.ts     # MODIFIED (CF-07 site 3)

scripts/
└── audit-root-commits-rename.cjs    # NEW (15.01 one-shot; discarded post-milestone)

.planning/phases/15-adapter-surface-extensions-rename/
└── rootCommits-rename-audit.json    # NEW (15.01 audit sidecar; D-09 schema; discarded post-milestone)

sdk/src/vcs/__tests__/
├── cmd-parallel-jj.test.ts          # MODIFIED: add cancel-* scenarios (mirror SC5 pattern at :475-700)
├── cmd-parallel-git.test.ts         # MODIFIED: add cancel-* scenarios (mirror SC5 pattern at :737-958)
├── adapter-contract.test.ts         # MODIFIED: assert idAlphabet returns expected literal on each backend
├── jj-workspace-cleanup.test.ts     # NEW (15.04 WAVE 1): helper unit tests
└── git-backend.test.ts / jj-refs.test.ts / etc. # MODIFIED: rootCommits→rootRevisions test renames + matchPrefix cross-product
```

### Pattern 1: Hard rename without deprecation alias (CF-02)

**What:** When renaming a public surface symbol, do a single atomic commit that touches every call site simultaneously. Do NOT ship a transitional alias.

**When to use:** When the symbol set is fully enumerated by a pre-commit audit (Pitfall 3 gate) AND when the renamer is willing to take a single TSC-red moment that resolves in the same commit.

**Example:** Phase 14.1 plan 01 Task 1 hard-renamed `mainBookmark: string` → `mainBookmarks?: readonly string[]` across 15 sites in a single commit (`tvkykqy`). TSC closure was the audit trail. SUMMARY.md line 100-101 records the technique.

**Apply this to 15.01:** Single Task-commit touches all 11 in-scope files identified by the audit script. The audit JSON's `idempotencyHash` (D-12) blocks a second commit landing between audit and rename — if any new `rootCommits` reference appears, regenerate the audit and re-commit atomically.

```typescript
// Source: sdk/src/vcs/types.ts:363 (pre-rename — 1 of 26 sites)
rootCommits(opts: { rev?: RevisionExpr }): string[];
// AFTER 15.01:
rootRevisions(opts: { rev?: RevisionExpr }): string[];
```

### Pattern 2: Opaque-string property on backend (CF-03)

**What:** A `readonly` property on `VcsRefs` whose value is a per-backend constant string. No exec call; no compute; pure metadata returned from a closure-bound constant.

**When to use:** For backend-discriminator surfaces that consumers compose into regex / parsers WITHOUT needing structured access. Cross-backend unification per `project_unified_revision_model`.

**Example:** Mirrors the `readonly head: RevisionExpr` and `readonly parent: RevisionExpr` properties on `VcsRefs` already declared at `sdk/src/vcs/types.ts:337-338`. Same shape.

```typescript
// Source: sdk/src/vcs/types.ts:336-367 (existing shape — pattern to mirror)
export interface VcsRefs {
  readonly head: RevisionExpr;
  readonly parent: RevisionExpr;
  // ... add HERE:
  readonly idAlphabet: string;  // '0-9a-f' (git) / 'k-z' (jj)
  // ... (other methods)
}

// Source: sdk/src/vcs/backends/jj.ts:964 (style guide — same module wires the property)
const refs: VcsRefs = Object.freeze({
  head: expr.head(),
  parent: expr.parent(),
  idAlphabet: 'k-z',           // ← new
  // ... rest
});
```

### Pattern 3: Alphabet-aware probe (matchPrefix; CF-04)

**What:** A method whose behavior branches on the alphabet of the inputs — but the branching is done via the `idAlphabet` constant from Pattern 2, NOT via `vcs.kind` checks. Consumes the same backend it lives on.

**When to use:** For string-matching that has to be backend-aware (because git's hex is case-insensitive while jj's k-z is lower-only) WITHOUT exposing backend identity to the caller.

**Throwing pattern:** Throws `Error` (not a typed `VcsExecError`) on wrong-alphabet or empty prefix — these are **caller-bug** conditions, not exec failures. Returns `false` (truthy boolean discrimination) on legitimate no-match cases.

```typescript
// Pseudo-code shape — actual JSDoc is planner-discretion (CONTEXT)
matchPrefix(id: RevisionExpr, prefix: string): boolean {
  if (prefix.length === 0) {
    throw new Error('vcs.refs.matchPrefix: empty prefix is a caller bug');
  }
  // toJjRev / toGitRev decode the branded RevisionExpr into a raw id string
  const rawId = decode(id);
  if (prefix.length > rawId.length) {
    return false; // no possible match — well-defined no-match
  }
  const expectedAlphabet = this.idAlphabet; // '0-9a-f' or 'k-z'
  // Wrong-alphabet check uses a regex built from expectedAlphabet:
  const validPrefixRe = new RegExp(`^[${expectedAlphabet}${expectedAlphabet === '0-9a-f' ? 'A-F' : ''}]+$`);
  if (!validPrefixRe.test(prefix)) {
    throw new Error(
      `vcs.refs.matchPrefix: prefix '${prefix}' contains chars outside backend alphabet [${expectedAlphabet}]`,
    );
  }
  // Compare with backend-appropriate case discipline
  const cmp = expectedAlphabet === '0-9a-f'
    ? rawId.toLowerCase().startsWith(prefix.toLowerCase()) // hex case-insensitive (matches git core.abbrev)
    : rawId.startsWith(prefix);                            // k-z lower-only (matches jj prefix index)
  return cmp;
}
```

### Pattern 4: Synchronous-teardown verb (CF-05)

**What:** A verb whose entire effect is to undo state that prior verbs created. Returns a structured envelope describing what it tore down. Does NOT signal external processes (the STACK lens — `spawnSync` blocks; orchestrator awaits Agent() before fanIn/cancel).

**Why no async / signaling:** `sdk/src/vcs/exec.ts:106` uses `spawnSync` — there is no `AbortSignal` plumbing path to a child process. Cancel runs **between** dispatch and fan-in (or after fan-in if a partial run aborted) — never **during** an agent's execution.

**Example precedent:** `vcs.workspace.remove(path, opts?: {force?: boolean}): void` at `backends/{git,jj}.ts` is the closest precedent — composite forget + rm-rf on jj; `worktree remove --force` on git. Cancel extends this to a batch + adds the structured return envelope.

```typescript
// Source: backends/jj.ts:1245-1264 (existing parallel namespace — wire pattern to extend)
parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performJjParallelFanIn(cwd, handle, results),
  // ── NEW (15.04): cancel as third entry ─────────────────────────
  cancel: (handle: ParallelDispatchHandle): CancelResult =>
    performJjParallelCancel(cwd, handle),
}),
```

### Pattern 5: Sidecar helper extraction (CF-06, D-04)

**What:** Extract a shared helper into its own sidecar file (`sdk/src/vcs/jj/<name>.ts`) when 2+ consumers need the same code path. Sidecar follows UPSTREAM-02 discipline: does NOT import from `backends/jj.ts`.

**When to use:** When the helper's contract diverges from a related but distinct file's contract (here: `reap.ts` preserves conflicted workspaces for inspection; `workspace-cleanup.ts` tears down everything requested).

**Precedent:** `sdk/src/vcs/jj/conflict-paths.ts` extracted from `backends/jj.ts:524-557` in Phase 9 plan 02. Same shape, same discipline, two consumers (`reap.ts` + `parallel.ts`).

```typescript
// Source: jj/conflict-paths.ts:20-30 (precedent template to mirror)
import { vcsExec } from '../exec.js';

// Inline mandatory-flags prefix — copy of backends/jj.ts::jjArgv's flag portion.
// UPSTREAM-02: avoids the backends import.
function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

### Pattern 6: Three-site CLI bridge registration (CF-07)

**What:** Any new SDK query verb must be registered in THREE files; missing any one site breaks runtime verb resolution (catalog handler, manifest entry, alias entry).

**Sites:**

1. `sdk/src/query/command-static-catalog-domain.ts:23-127` — maps canonical name → handler import. New: add `['workspace.parallel.cancel', workspaceParallelCancelQuery]` AND `['workspace parallel.cancel', workspaceParallelCancelQuery]` (space form alias, mirrors existing entries at :71-74).
2. `sdk/src/query/command-manifest.non-family.ts:57-62` — declares mutation flag + outputMode. New: add `{ canonical: 'workspace.parallel.cancel', aliases: ['workspace parallel.cancel'], mutation: true, outputMode: 'json' }`.
3. `sdk/src/query/command-aliases.generated.ts:155-157` — generated alias lookup. New: add `{ canonical: 'workspace.parallel.cancel', aliases: ['workspace parallel.cancel'], mutation: true }`.

**Verify:** After registering, `gsd-sdk query workspace.parallel.cancel --help` should resolve (not error "unknown verb"). The Phase 11 plan 02 audit established this pattern.

### Pattern 7: Two-pass all-or-nothing validate-then-mutate (CF-02 / 14.1 idiom)

**What:** When iterating over a non-empty list of inputs that triggers side effects, run a validation pass FIRST (throws on first invalid input; zero side effects); only then run the mutation pass.

**When to use:** Any verb that iterates over caller-supplied identifiers and runs per-identifier exec calls. Prevents partial-state on bad input.

**Precedent:** Phase 14.1 jj/parallel.ts:429-449 (fan-in bookmark advance two-pass).

```typescript
// Source: jj/parallel.ts:429-449 (verbatim — precedent for any cancel-side iteration)
const mainBookmarks = handle.mainBookmarks ?? [];
if (mainBookmarks.length > 0) {
  // Pass 1: validate every name. Throws on first invalid; no side effects yet.
  for (const name of mainBookmarks) {
    validateMainBookmark(name);
  }
  // Pass 2: advance each. Partial-state on mid-iteration failure is documented
  // above; no atomic rollback at this layer.
  for (const name of mainBookmarks) {
    const setArgs = [
      ...jjArgvFlags(mainRepoRoot),
      'bookmark', 'set', name, '-r', '@',
    ];
    const setRes = vcsExec(mainRepoRoot, 'jj', setArgs);
    if (setRes.exitCode !== 0) {
      throw new Error(
        `parallel.fanIn: main-bookmark advance (${name}) failed: ${setRes.stderr || setRes.stdout}`,
      );
    }
  }
}
```

Note: **cancel does NOT need this idiom for its primary path** — the input is `handle.workspaces` (already-validated at dispatch time) plus the surplus-bookmark sweep (where validation is unnecessary because the names come from `git for-each-ref` output). The idiom is documented here as a tool for any optional pre-flight validation 15.04 planner chooses to add.

### Pattern 8: Frozen pure-JSON return shape (Phase 9 D-05 invariant)

**What:** Every return value from a `workspace.parallel.*` verb must survive `JSON.stringify` → `JSON.parse` round-trip with no semantic loss. No closures, methods, Symbols, or class instances.

**Mechanism:** `Object.freeze({...})` at the top, `Object.freeze([...].slice()) as readonly string[]` for nested arrays.

**Precedent:** Both `performJjParallelFanIn` (jj/parallel.ts:500-507) and `performGitParallelFanIn` (git/parallel.ts:617-625) use this exact pattern.

```typescript
// Source: jj/parallel.ts:500-507 (FanInResult freeze pattern — apply to CancelResult)
return Object.freeze({
  merged: Object.freeze(merged.slice()) as readonly string[],
  conflicted,
  conflictedPaths: Object.freeze(conflictedPaths.slice()) as readonly string[],
  incompleteQueued,
  failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
  surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
}) satisfies FanInResult;

// CancelResult mirror (15.04):
return Object.freeze({
  abandoned: Object.freeze(abandoned.slice()) as readonly string[],
  failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
  surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
  surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()) as readonly string[],
}) satisfies CancelResult;
```

### Anti-Patterns to Avoid

- **TypeScript-compiler-protects-everything trap.** TS catches `interface` field renames in `.ts` files only. CJS (`commands.cjs`), capability matrix string literals (`backends.ts:79`), workflow markdown (`.md`), and JSON files are invisible to TSC. This is Pitfall 3 + the v1.2 retro CR-01 case (a `commands.cjs:1005` reference to `LogEntry.hash` was missed when TS-renamed to `.id`, surfacing only as a runtime failure). **Mitigation:** the rootCommits-rename-audit.json's `specialCases` field MUST surface `backends.ts:79` explicitly so reviewers cannot miss it.
- **Cancel signals subagent processes.** CF-05 explicitly rejects this. The verb is **post-mortem cleanup**, not in-flight cancellation. Any documentation that suggests otherwise is contradicting STACK constraints — flag at code review.
- **`AbortController` thread-through.** Implies async exec; defeats the `spawnSync` contract. Out of scope.
- **In-line teardown duplicated across cancel + fanIn-clean-branch + dogfood-restore.sh.** This was the IP-5 motivation for the helper extraction. Three call sites, one body — no drift.
- **Reap-as-cancel.** Calling `vcs.workspace.reap()` from cancel would inherit reap's W3(a) inspection-contract (leave conflicted workspaces alone). Cancel violates that contract by design. Do not compose reap into cancel.
- **Bookmark-required preflight for cancel.** Phase 14.1 dropped the analogous preflight from `dispatch` + `fanIn`. Cancel must NOT introduce a similar gate on `handle.mainBookmarks` — empty/undefined is first-class (CF-04 alignment).
- **Sidecar imports from `backends/jj.ts`.** UPSTREAM-02 violation — would force a merge conflict on every upstream-rebase cycle. Inline `jjArgvFlags` (and any other backend-internal constants) per the existing sidecar template (conflict-paths.ts:25-30, reap.ts:33-41, incomplete-work.ts:8-12).
- **Writing the audit JSON sidecar from inside the audit script.** Per `feedback_avoid_jj_auto_tracked_output` memory — audit script emits stdout only; the Plan 15.01 task uses shell redirection to write the JSON. Otherwise `jj` auto-tracks the script output file.
- **Adding new `rootCommits` references between audit and rename commit.** The `idempotencyHash` (D-12) catches this. Plan 15.01's audit-generation and rename steps MUST be adjacent in commit order.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Refname validation (idAlphabet/matchPrefix prefix-shape check) | Inline regex in matchPrefix | Reuse `sdk/src/vcs/refs-validator.ts` `validateBookmarkName` for bookmark inputs; compose alphabet regex from `idAlphabet` for prefix inputs | The validator module is the single source of truth for refname rules; per `feedback_vitest_extend_over_free_fn` and the v1.2 lint module |
| Conflict-paths enumeration | Hand-roll `jj resolve --list` parsing | Use existing `sdk/src/vcs/jj/conflict-paths.ts::enumerateConflictedPaths` | Existing sidecar; WR-04 sentinel handling already correct |
| Workspace dir enumeration | Inline glob with `fs.glob` | `readdirSync(dir).filter((d) => /^phase-{NN}-subagent-\d+$/.test(d))` | Glob is overkill; `readdirSync` + suffix filter is the existing pattern; survives partial jj state (filesystem-first per CONTEXT Discretion recommendation) |
| Pre-rename audit JSON | Custom YAML/TOML serialization | `JSON.stringify(obj, sortKeys, 2)` + shell `>` redirect | `.planning/intel/id-namespace-audit.json` precedent (v1.2) uses JSON; D-09 schema is JSON-only |
| MD5 hash for idempotencyHash | npm crypto-js / sha-js | `node:crypto.createHash('md5').update(...).digest('hex')` | Built-in; zero new deps |
| CancelResult shape | Custom error-laden envelope | Frozen pure-JSON per Pattern 8 above | Phase 9 D-05 invariant; CLI bridge JSON round-trip requires it |
| CLI bridge argv parser | yargs / commander | Inline `for (let i = 0; ...) { if (args[i] === '--cwd' && args[i+1]) cwd = args[++i]; }` | Matches `workspace-parallel-{dispatch,fan-in}.ts` precedent; sub-1KB of code; zero deps |
| Workspace teardown (`jj workspace forget + rm -rf`) | Compose `vcs.workspace.remove()` per workspace | Re-use the bare `vcsExec(... 'jj', ['workspace', 'forget', '--', name])` + `rmSync` pattern from `reap.ts:174-189` (also UPSTREAM-02 sidecar discipline) | Avoids the `vcs.kind === 'jj'` narrowing; sidecar pattern lets helper own its exec calls |
| Surplus-bookmark enumeration (git side) | Add a probe call | Reuse the existing `git for-each-ref --format=%(refname:short) refs/heads/worktree-agent-*` pattern from `git/parallel.ts:603` | Pattern already exists in fanIn; cancel can call the same |
| Cross-product test enumeration for matchPrefix | Loop nested in single test body | Vitest `describe.each(...)` over backends × rules | vitest 3.x supports it natively; existing tests use the pattern |

**Key insight:** This entire phase is about adding small, well-bounded primitives. Resist the urge to add abstraction layers ("validation framework", "result-envelope DSL"). The cancel verb is ~80 LOC + the helper is ~60 LOC. Idempotent by contract, frozen by convention, three-site registered by checklist.

## Runtime State Inventory

> This phase modifies the public adapter surface (a code edit), not stored data or live service config. The rootCommits→rootRevisions rename is the only naming change with broad reach. The cancel verb introduces no persistent state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — no databases, datastores, or external service stores hold `rootCommits` as a key, collection name, ID, or content reference. Verified by grep across `.planning/` (only docs hit, which are carved out per CF-02 archive carve-outs) + `sdk/` (only type/code hits, all in scope of the rename audit). | None |
| **Live service config** | None — no n8n workflows, Datadog dashboards, Tailscale ACLs, or Cloudflare Tunnels reference these symbols. Confirmed by file-set scope: this is a single-repo SDK refactor. | None |
| **OS-registered state** | None — no Windows Task Scheduler tasks, pm2 processes, launchd plists, or systemd units reference these symbols. Single-repo dev work. | None |
| **Secrets / env vars** | None — no SOPS keys, .env files, or CI env-var names reference `rootCommits` or the new verbs. Confirmed by grep. | None |
| **Build artifacts / installed packages** | One conditional: `sdk/dist-cjs/` is the compiled CJS output. After the rename lands in `sdk/src/`, the `pnpm build:cjs` step regenerates `dist-cjs/`. The audit script's grep MUST exclude `dist-cjs/` (per ROADMAP SC1 exclusion list) and the post-rename grep gate runs against `src/` not `dist-cjs/`. No manual artifact cleanup needed — `tsc` overwrites. | Run `pnpm -F @gsd-build/sdk build:cjs` after 15.01 rename commit; verify dist-cjs/ contains `rootRevisions` and zero `rootCommits` references. Standard build step, no special handling. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old `rootCommits` name cached, stored, or registered?*

**Answer:** None. This is a pure compile-time symbol rename on a private SDK adapter. There are no live consumers outside the repo (the SDK is consumed by the in-tree CJS layer at `get-shit-done/bin/lib/`, which is rebuilt from source per release). The `dist-cjs/` regeneration is mechanical; no migration script needed.

## Common Pitfalls

### Pitfall 1: CJS / markdown / capability-matrix invisible-to-TSC silent miss

**What goes wrong:** TS rename of `rootCommits` → `rootRevisions` lands clean in `.ts`. `commands.cjs:1005`, `backends.ts:79` string literal, or a workflow `.md` shell-fence reference is missed. TSC closes green. Runtime fails on first call with `TypeError: vcs.refs.rootCommits is not a function`. (This is the v1.2 retro CR-01 case.)

**Why it happens:** TypeScript's safety net does not extend to `.cjs`, `.md`, or string-key object access. `backends.ts:79`'s `'refs.rootCommits': Object.freeze(['git', 'jj-colocated'] as const)` is a string property name — TSC sees `string`, not the renamed symbol.

**How to avoid:** Plan 15.01 ships the pre-rename JSON sidecar audit FIRST. The audit's `specialCases` field surfaces `backends.ts:79` explicitly. The per-extension `grep -c '\brootCommits\b'` gate must exit 0 BEFORE the rename commit lands. The `idempotencyHash` (D-12) catches any new reference added between audit and rename.

**Warning signs:** Audit script returns N hits; rename commit shows fewer than N hits in the diff. Mismatch = something silently survived.

### Pitfall 2: Cancel violates the `spawnSync` STACK invariant

**What goes wrong:** Planner adds `AbortController` to `cancel(handle, { signal })` thinking it can interrupt running agents. Wires through `vcsExecAsync` or `child_process.spawn`. Breaks the existing exec contract; introduces a parallel exec surface; doubles maintenance.

**Why it happens:** Reading "cancel" in isolation suggests interruption semantics. The Tokio JoinSet / GitHub Actions matrix precedents in FEATURES.md do support mid-run cancellation — but those run async. GSD's exec layer is synchronous by design (`sdk/src/vcs/exec.ts:106` `spawnSync`).

**How to avoid:** Re-read CF-05 verbatim. Cancel is **post-mortem cleanup**, not signaling. Operator kills subagents via Claude Code UI/CLI; cancel cleans up the workspaces left behind. The PROJECT.md "Out of scope" entry for "Mid-Agent process-kill cancellation" is the canonical reference.

**Warning signs:** PR diff introduces `AbortController`, `AbortSignal`, `spawn` (non-Sync), or `child.kill(...)`. Any of these = STACK violation.

### Pitfall 3: matchPrefix silent-false on wrong alphabet

**What goes wrong:** Caller passes a hex prefix `'abc'` to a jj-backed `matchPrefix(id, 'abc')`. Implementation returns `false` because 'abc' contains 'b' which is in k-z (lower) but 'a' is not. Caller assumes "no match in this repo" and skips the workspace. Bug becomes invisible.

**Why it happens:** Returning `false` on wrong-alphabet looks like a graceful no-match. But the caller's intent was "match this prefix"; supplying a wrong-alphabet input is a caller bug, not a no-match condition.

**How to avoid:** Throw. CF-04 specifies the contract: wrong-alphabet → `throw`, empty prefix → `throw`, prefix longer than id → `false` (legitimate no-match). The cross-product test enforces this with 10 cases minimum (5 rules × 2 backends).

**Warning signs:** matchPrefix test body has `expect(...).toBe(false)` for wrong-alphabet cases (should be `expect(() => ...).toThrow(...)`).

### Pitfall 4: Helper directory enumeration misses workspaces with non-standard paths

**What goes wrong:** `cleanupSubagentWorkspaces` uses `readdirSync('.claude/jj-workspaces/')`. But a caller of `dispatch()` passed `workspacePath: '/tmp/custom-dir/foo'` per the optional `WorkspaceAdd.workspacePath` field (octopus.ts:296-302 default path → user override). Helper enumeration misses these dirs; cancel fails to clean them.

**Why it happens:** The default path is `'.claude/jj-workspaces/phase-{NN}-subagent-{idx}'` (octopus.ts:302) for jj and `'.gsd-workspaces/phase-{NN}-subagent-{idx}'` (git/parallel.ts:190) for git, but `dispatch()` allows per-item path override.

**How to avoid:** The helper enumerates **from the Handle's `workspaces[]` array**, not from `readdirSync`. The Handle is the source of truth (per `project_no_orchestrator_sidecar_state` memory + CONTEXT D-04 paragraph "no sidecar manifest"). Use `readdirSync` only as a fallback / cross-check, not as the primary enumeration.

**Updated guidance for D-04 helper:**
```typescript
// Primary enumeration: iterate Handle.workspaces (authoritative)
// (helper signature is (phaseRoot, phaseNumber) — caller passes the Handle into cancel(),
//  then performJjParallelCancel iterates handle.workspaces and calls the helper per-item
//  OR the helper takes a workspaces[] array directly — planner's choice)
//
// Recommendation: helper takes (phaseRoot, phaseNumber, workspaces?: readonly {path:string,name:string}[])
//   — when workspaces is provided, iterate that list (authoritative)
//   — when omitted, fall back to readdirSync (best-effort recovery, used by dogfood-restore.sh)
```

**Warning signs:** Cancel scenario test passes `workspacePath: '/tmp/...'` to dispatch but cancel fails to find the dir. Helper enumeration path is the bug.

### Pitfall 5: Idempotency contract not honored on already-cancelled handle

**What goes wrong:** Caller invokes `cancel(handle)` twice in a row. First call cleans up successfully. Second call throws because `jj workspace forget` fails on already-forgotten workspace, or `rm -rf` fails on missing dir.

**Why it happens:** Forgetting to handle the "missing" case in helper. `jj workspace forget` returns non-zero on unknown workspace name; `rm -rf` returns non-zero on permission errors (but not on missing files due to `force: true`).

**How to avoid:** Per D-03 + D-06, helper is idempotent by contract:
- `existsSync(path)` gate before any operation
- `rmSync(path, {recursive: true, force: true})` — `force: true` makes ENOENT a no-op
- Wrap `jj workspace forget` non-zero in `failedReaped` push (not throw) when the workspace is already gone (best-effort)
- Bookmark deletion uses `force: true` per CF-06

**Warning signs:** Second-call cancel test fails with thrown error; should return `{abandoned: [], failedReaped: [], surplusBookmarks: [], surplusWorkspaces: []}` (all empty).

### Pitfall 6: Three-site CLI bridge registration misses one site

**What goes wrong:** New CLI bridge file `workspace-parallel-cancel.ts` written. Imported into `command-static-catalog-domain.ts`. But the `command-aliases.generated.ts` entry is forgotten. Runtime `gsd-sdk query workspace.parallel.cancel` fails to resolve.

**Why it happens:** The three sites have similar names but live in three modules; easy to update two and miss the third. The Phase 11 plan 02 audit established the pattern but didn't enforce it via lint.

**How to avoid:** Audit-confirm all three sites are touched in the 15.04 commit diff. Add the verb to all three files in the same Task (atomic).

**Warning signs:** Test calling `gsd-sdk query workspace.parallel.cancel --help` returns "unknown verb" error.

### Pitfall 7: Stale `mainBookmark` references in 15.04 plan documentation

**What goes wrong:** `15-04-PLAN.md:151` and `:404` still carry `mainBookmark: string` and `mainBookmark: 'main'` literals from before Phase 14.1 landed. When 15.04 executor mechanically writes the test code from the plan, TSC fires red because `mainBookmark` is no longer a property of `ParallelDispatchOpts`.

**Why it happens:** Phase 14.1 was an emergency gap-closure that shipped after 15.04 plan was written. The plan was never re-amended.

**How to avoid:** **Phase 15.04 executor's FIRST task** is to patch the plan's two references — substitute `mainBookmarks?: readonly string[]` (line 151 type-doc) and `mainBookmarks: ['main']` or omit (line 404 test fixture). Better: amend before execute starts so the plan content matches the runtime contract.

**Warning signs:** TSC red after writing 15.04 test fixtures; error message names `mainBookmark` not on `ParallelDispatchOpts`.

### Pitfall 8: Audit JSON sidecar tracked by jj

**What goes wrong:** Audit script writes the JSON sidecar directly via `fs.writeFileSync(auditPath, ...)`. `jj`'s auto-snapshot picks it up; the next `jj squash` includes the audit file in the working-copy diff. Audit file becomes part of the rename commit instead of a separate provenance artifact.

**Why it happens:** Per `feedback_avoid_jj_auto_tracked_output` memory — `jj` auto-tracks any file modification in the working tree. Script-written outputs are immediately part of the commit unless intentionally separated.

**How to avoid:** Audit script (D-13) emits stdout only; the Plan 15.01 task uses shell redirection to write the JSON:

```bash
node scripts/audit-root-commits-rename.cjs > .planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json
```

Then the task commits the JSON file in a SEPARATE step from the rename commit. The script itself never writes to the colocated working tree.

**Warning signs:** Audit JSON appears in the same commit as the rename; should be a sibling commit (audit → rename, two adjacent commits).

## Code Examples

### Example 1: rootCommits → rootRevisions atomic rename per file

```typescript
// Source: sdk/src/vcs/types.ts:363 (BEFORE — current state)
rootCommits(opts: { rev?: RevisionExpr }): string[];
// AFTER 15.01:
rootRevisions(opts: { rev?: RevisionExpr }): string[];

// Source: sdk/src/vcs/backends.ts:79 (BEFORE — capability matrix string literal)
'refs.rootCommits': Object.freeze(['git', 'jj-colocated'] as const),
// AFTER 15.01 — load-bearing: TSC does NOT catch this string-key rename
'refs.rootRevisions': Object.freeze(['git', 'jj-colocated'] as const),

// Source: sdk/src/vcs/backends/jj.ts:964-980 (BEFORE)
rootCommits: ({ rev }: { rev?: RevisionExpr }): string[] => {
  const target = rev ? toJjRev(rev) : '@';
  const args = jjArgv(
    'log',
    '-r',
    `root() & ::${target}`,
    '-T',
    'change_id ++ "\\n"',
    '--no-graph',
  );
  // ...
}
// AFTER 15.01:
rootRevisions: ({ rev }: { rev?: RevisionExpr }): string[] => {
  // ...same body...
}

// Source: get-shit-done/bin/lib/commands.cjs:1005 (BEFORE — CJS surface, NOT caught by TSC)
const roots = statsVcs.refs.rootCommits({ rev: statsVcs.refs.head });
// AFTER 15.01:
const roots = statsVcs.refs.rootRevisions({ rev: statsVcs.refs.head });
```

### Example 2: idAlphabet body shape

```typescript
// Source: sdk/src/vcs/types.ts (15.02 ADD after line 338, before line 339)
export interface VcsRefs {
  readonly head: RevisionExpr;
  readonly parent: RevisionExpr;
  /**
   * 15.02 (VCS-21): per-backend canonical id alphabet substring.
   * Git: '0-9a-f' (hex commit_id). Jj: 'k-z' (reverse-base32 change_id).
   * Consumers compose into regex patterns: `new RegExp('^[' + vcs.refs.idAlphabet + ']+$')`.
   * Replaces three ad-hoc duplications in expr.ts:41, format-migration/rewrite.ts:53,63.
   */
  readonly idAlphabet: string;
  bookmarks: VcsBookmarks;
  // ... rest unchanged
}

// Source: sdk/src/vcs/backends/jj.ts (15.02 ADD inside the refs Object.freeze block)
const refs: VcsRefs = Object.freeze({
  head: expr.head(),
  parent: expr.parent(),
  idAlphabet: 'k-z',  // ← new (15.02)
  bookmarks: bookmarksNamespace,
  // ... rest unchanged
});

// Source: sdk/src/vcs/backends/git.ts (15.02 ADD inside the refs Object.freeze block)
const refs: VcsRefs = Object.freeze({
  head: expr.head(),
  parent: expr.parent(),
  idAlphabet: '0-9a-f',  // ← new (15.02)
  bookmarks: bookmarksNamespace,
  // ... rest unchanged
});

// Source: sdk/src/vcs/backends.ts (15.02 ADD to capability matrix)
'refs.idAlphabet': Object.freeze(['git', 'jj-colocated'] as const),
```

### Example 3: matchPrefix body shape

```typescript
// Source: sdk/src/vcs/types.ts (15.03 ADD to VcsRefs interface)
/**
 * 15.03 (VCS-22): alphabet-aware short-prefix matcher.
 *   - Throws on empty prefix (caller bug).
 *   - Throws on wrong-alphabet prefix (e.g. hex prefix on jj backend) — Pitfall 6.
 *   - Returns false on `prefix.length > id.length` (no possible match).
 *   - Hex matching case-insensitive (matches git core.abbrev).
 *   - K-z matching lower-only (matches jj prefix index).
 * Consumes the backend's own idAlphabet — no vcs.kind narrowing required.
 */
matchPrefix(id: RevisionExpr, prefix: string): boolean;

// Source: sdk/src/vcs/backends/jj.ts (15.03 ADD inside refs Object.freeze)
matchPrefix: (id: RevisionExpr, prefix: string): boolean => {
  if (prefix.length === 0) {
    throw new Error('vcs.refs.matchPrefix: empty prefix is a caller bug');
  }
  // Decode the RevisionExpr to its raw id form. parse/jj-rev.ts handles
  // the rev:<id> shape (the only shape an idAlphabet-bound id should have).
  const rawId = toJjRev(id); // returns the change_id string
  if (prefix.length > rawId.length) {
    return false; // well-defined no-match
  }
  // jj alphabet: k-z lower-only. Wrong-alphabet test: any char outside k-z.
  if (!/^[k-z]+$/.test(prefix)) {
    throw new Error(
      `vcs.refs.matchPrefix: prefix '${prefix}' contains chars outside jj alphabet [k-z]`,
    );
  }
  return rawId.startsWith(prefix);
}

// Source: sdk/src/vcs/backends/git.ts (15.03 ADD — case-insensitive variant)
matchPrefix: (id: RevisionExpr, prefix: string): boolean => {
  if (prefix.length === 0) {
    throw new Error('vcs.refs.matchPrefix: empty prefix is a caller bug');
  }
  const rawId = toGitRev(id); // returns the commit_id hex string
  if (prefix.length > rawId.length) {
    return false;
  }
  if (!/^[0-9a-fA-F]+$/.test(prefix)) {
    throw new Error(
      `vcs.refs.matchPrefix: prefix '${prefix}' contains chars outside git alphabet [0-9a-fA-F]`,
    );
  }
  // Hex case-insensitive (matches git core.abbrev / rev-parse behavior).
  return rawId.toLowerCase().startsWith(prefix.toLowerCase());
}

// Source: cross-product test pattern (sdk/src/vcs/__tests__/adapter-contract.test.ts)
// 5 rules × 2 backends = 10 cases minimum
describe.each([
  ['git', 'abc1234deadbeef'],   // a hex commit_id
  ['jj-colocated', 'klmnopqrstuv'], // a k-z change_id (note: alphabet excludes a-j)
])('matchPrefix cross-product on %s', (backend, sampleId) => {
  it('canonical-alphabet prefix → true', () => {
    expect(vcs.refs.matchPrefix(expr.rev(sampleId), sampleId.slice(0, 4))).toBe(true);
  });
  it('wrong-alphabet prefix → throws', () => {
    const wrongChar = backend === 'git' ? 'k' : '5';  // 'k' is wrong for hex; '5' is wrong for jj
    expect(() => vcs.refs.matchPrefix(expr.rev(sampleId), wrongChar)).toThrow(/outside .* alphabet/);
  });
  it('empty prefix → throws', () => {
    expect(() => vcs.refs.matchPrefix(expr.rev(sampleId), '')).toThrow(/empty prefix/);
  });
  it('prefix longer than id → false', () => {
    expect(vcs.refs.matchPrefix(expr.rev(sampleId), sampleId + sampleId)).toBe(false);
  });
  it('case-discipline matches backend', () => {
    if (backend === 'git') {
      expect(vcs.refs.matchPrefix(expr.rev(sampleId), sampleId.slice(0, 4).toUpperCase())).toBe(true);
    } else {
      // jj is lower-only; mixed-case prefix would fail the wrong-alphabet test (uppercase not in k-z)
      expect(() => vcs.refs.matchPrefix(expr.rev(sampleId), sampleId.slice(0, 4).toUpperCase())).toThrow();
    }
  });
});
```

### Example 4: CancelResult interface + cancel body shape

```typescript
// Source: sdk/src/vcs/types.ts (15.04 ADD after FanInResult at line 560)
/**
 * 15.04 (PARALLEL-07): result of `vcs.workspace.parallel.cancel(handle)`.
 * Mirrors FanInResult's failedReaped + surplusBookmarks naming verbatim
 * (sdk/src/vcs/types.ts:558-559). Pure-JSON; survives JSON round-trip
 * (Phase 9 D-05 invariant for parallel-domain return shapes).
 *
 * Field semantics:
 *   - abandoned: workspace identifiers fully torn down (recommend agentId
 *     per orchestrator-identifier consistency; planner picks).
 *   - failedReaped: identifiers that resisted teardown — caller can grep FS
 *     to confirm. On clean cancel, length is 0.
 *   - surplusBookmarks: bookmark names that needed force-delete (per
 *     FanInResult precedent at jj/parallel.ts; typically [] on jj clean
 *     branch by octopus construction; git side carries worktree-agent-*).
 *   - surplusWorkspaces: workspace paths still on disk pre-cancel (counted
 *     at entry, regardless of cleanup outcome).
 *
 * Idempotency: re-calling cancel on an already-cancelled handle returns
 * CancelResult with all-empty arrays (no error). Phase 11 D-01 "no
 * orchestrator sidecar state" — the handle's workspaces[] array is the
 * source of truth at call time.
 */
export interface CancelResult {
  abandoned: readonly string[];
  failedReaped: readonly string[];
  surplusBookmarks: readonly string[];
  surplusWorkspaces: readonly string[];
}

// Source: sdk/src/vcs/types.ts (15.04 EXTEND VcsWorkspaceParallel at line 453-456)
export interface VcsWorkspaceParallel {
  dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
  fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
  // 15.04 (PARALLEL-07): synchronous teardown of materialized workspaces.
  // Does NOT signal subagent processes (spawnSync exec layer can't accept
  // AbortSignal per sdk/src/vcs/exec.ts:19; Phase 9 D-01 orchestrator-awaits-
  // Agent invariant makes mid-flight cancel a non-problem in production).
  // See PROJECT.md Out-of-Scope "Mid-Agent process-kill cancellation".
  cancel(handle: ParallelDispatchHandle): CancelResult;
}

// Source: sdk/src/vcs/jj/parallel.ts (15.04 ADD new export — UPSTREAM-02 sidecar)
import { cleanupSubagentWorkspaces } from './workspace-cleanup.js';

export function performJjParallelCancel(
  mainRepoRoot: string,
  handle: ParallelDispatchHandle,
): CancelResult {
  // Count surplus workspaces at entry (per D-02 — counted regardless of cleanup outcome).
  const surplusWorkspaces: string[] = handle.workspaces
    .filter((ws) => existsSync(ws.path))
    .map((ws) => ws.path);

  // Delegate to the helper. The helper enumerates by reading from the handle
  // (authoritative) plus filesystem fallback for safety (Pitfall 4).
  const { abandoned, failedReaped } = cleanupSubagentWorkspaces(
    handle.phaseRoot,
    handle.phaseNumber,
    handle.workspaces,  // pass authoritative list
  );

  // surplusBookmarks: jj-side is [] by construction (Phase 11 D-02 retired
  // per-subagent agent-bookmarks). Reserve the field for future symmetry.
  const surplusBookmarks: string[] = [];

  return Object.freeze({
    abandoned: Object.freeze(abandoned.slice()) as readonly string[],
    failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
    surplusBookmarks: Object.freeze(surplusBookmarks) as readonly string[],
    surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()) as readonly string[],
  }) satisfies CancelResult;
}

// Source: sdk/src/vcs/git/parallel.ts (15.04 ADD new export — adapter-internal sidecar)
export function performGitParallelCancel(
  mainRepoRoot: string,
  handle: ParallelDispatchHandle,
): CancelResult {
  // git-side teardown is INLINE (no shared helper — git's `worktree remove --force`
  // already handles tree cleanup, and orphan-dirs are a jj-only problem per
  // PROJECT.md OOS for cross-backend cleanup helper).
  const surplusWorkspaces: string[] = handle.workspaces
    .filter((ws) => existsSync(ws.path))
    .map((ws) => ws.path);

  const abandoned: string[] = [];
  const failedReaped: string[] = [];
  const surplusBookmarks: string[] = [];

  for (const ws of handle.workspaces) {
    // Per CF-06: `git worktree remove --force <path>` + `git branch -D <name>`
    const wtRes = vcsExec(mainRepoRoot, 'git', ['worktree', 'remove', '--force', ws.path]);
    if (wtRes.exitCode !== 0) {
      // Best-effort: surface failure but continue
      failedReaped.push(ws.name);
      continue;
    }
    const branchName = `worktree-agent-${ws.agentId}`;
    const brRes = vcsExec(mainRepoRoot, 'git', ['branch', '-D', '--', branchName]);
    if (brRes.exitCode !== 0) {
      // Branch may already be gone — record as surplus, not failure
      surplusBookmarks.push(branchName);
    }
    abandoned.push(ws.agentId);
  }

  return Object.freeze({
    abandoned: Object.freeze(abandoned.slice()) as readonly string[],
    failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
    surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
    surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()) as readonly string[],
  }) satisfies CancelResult;
}

// Source: sdk/src/vcs/backends/jj.ts (15.04 WIRE-IN extending workspace.parallel)
parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performJjParallelFanIn(cwd, handle, results),
  cancel: (handle: ParallelDispatchHandle): CancelResult =>
    performJjParallelCancel(cwd, handle),  // ← new
}),

// Source: sdk/src/vcs/backends/git.ts (15.04 WIRE-IN — mirror)
parallel: Object.freeze({
  dispatch: ...,
  fanIn: ...,
  cancel: (handle: ParallelDispatchHandle): CancelResult =>
    performGitParallelCancel(cwd, handle),  // ← new
}),

// Source: sdk/src/vcs/backends.ts (15.04 ADD to capability matrix)
'workspace.parallel.cancel': Object.freeze(['git', 'jj-colocated'] as const),
```

### Example 5: cleanupSubagentWorkspaces helper shape

```typescript
// Source: sdk/src/vcs/jj/workspace-cleanup.ts (NEW — 15.04 WAVE 1)
/**
 * sdk/src/vcs/jj/workspace-cleanup.ts — Phase 15.04 Wave 1
 *
 * Shared helper for tearing down materialized subagent workspaces. Three
 * consumers per IP-5 (single-owner / three-consumer pattern):
 *   1. 15.04 cancel verb body (performJjParallelCancel)
 *   2. 16.02 fanIn clean-path branch (CLEANUP-02)
 *   3. 16.02 scripts/dogfood-restore.sh (via Phase 16 CLI bridge)
 *
 * Contract divergence from reap.ts:
 *   - reap.ts W3(a): "leave conflicted workspaces for inspection"
 *   - this file: "tear down every workspace caller explicitly requested"
 * File boundary makes the divergence enforceable.
 *
 * UPSTREAM-02 sidecar discipline: does NOT import from backends/jj.ts.
 * Imports vcsExec from ../exec.js; uses node:fs for rmSync.
 *
 * Idempotency contract (D-06): missing dirs are not errors; workspace.forget
 * is best-effort; failed rm-rf populates failedReaped.
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { vcsExec } from '../exec.js';

/**
 * Partial-CancelResult shape so the cancel verb body and the dispatcher
 * fanIn branch both unify the helper output into their respective envelopes
 * without re-enumerating disk state. (D-05.)
 */
export interface CleanupSubagentWorkspacesResult {
  abandoned: readonly string[];
  failedReaped: readonly string[];
}

/**
 * Inline mandatory-flags prefix. UPSTREAM-02 sidecar discipline — verbatim
 * copy from octopus.ts:39-47 / conflict-paths.ts:25-30 / reap.ts:33-41.
 */
function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

/**
 * Tear down every subagent workspace matching `phase-{NN}-subagent-*` under
 * `mainRepoRoot/.claude/jj-workspaces/` (the canonical jj-side path per
 * octopus.ts:302).
 *
 * Enumeration strategy (Pitfall 4):
 *   - When `workspaces` is provided: iterate that list (authoritative).
 *     Used by cancel(handle) where the Handle is the source of truth.
 *   - When `workspaces` is omitted: fall back to readdirSync (best-effort).
 *     Used by dogfood-restore.sh where no Handle survived the restore.
 *
 * Per-workspace teardown:
 *   1. `jj workspace forget -- <name>` (idempotent; missing → soft-fail)
 *   2. `rmSync(path, {recursive: true, force: true})` (idempotent)
 * Push to abandoned[] on success; push to failedReaped[] on failure.
 */
export function cleanupSubagentWorkspaces(
  mainRepoRoot: string,
  phaseNumber: number,
  workspaces?: readonly { name: string; path: string }[],
): CleanupSubagentWorkspacesResult {
  const phaseTag = String(phaseNumber).padStart(2, '0');

  // Build the iteration list.
  let iterList: readonly { name: string; path: string }[];
  if (workspaces && workspaces.length > 0) {
    iterList = workspaces;
  } else {
    const workspacesDir = join(mainRepoRoot, '.claude', 'jj-workspaces');
    if (!existsSync(workspacesDir)) {
      return { abandoned: [], failedReaped: [] };
    }
    const pattern = new RegExp(`^phase-${phaseTag}-subagent-\\d+$`);
    iterList = readdirSync(workspacesDir)
      .filter((d) => pattern.test(d))
      .map((d) => ({ name: d, path: join(workspacesDir, d) }));
  }

  const abandoned: string[] = [];
  const failedReaped: string[] = [];

  for (const ws of iterList) {
    // Step 1: jj workspace forget (best-effort)
    const forgetArgs = [...jjArgvFlags(mainRepoRoot), 'workspace', 'forget', '--', ws.name];
    const forgetRes = vcsExec(mainRepoRoot, 'jj', forgetArgs);
    // Non-zero is acceptable: workspace may already be forgotten.
    // We don't push to failedReaped on forget-failure alone — only on
    // rm-rf failure (the visible state-leak surface).

    // Step 2: rm -rf the on-disk dir (force makes ENOENT a no-op)
    if (existsSync(ws.path)) {
      try {
        rmSync(ws.path, { recursive: true, force: true });
        abandoned.push(ws.name);
      } catch (err) {
        failedReaped.push(ws.name);
      }
    } else {
      // Dir already gone — count as abandoned (idempotent re-call case)
      abandoned.push(ws.name);
    }
  }

  return { abandoned, failedReaped };
}
```

**Signature note vs. CONTEXT D-05:** The CONTEXT-literal signature is `(phaseRoot: string, phaseNumber: number)`. The body above uses `(mainRepoRoot: string, phaseNumber: number, workspaces?: ...)` because (a) jjArgvFlags + jj workspace forget need the **repo root**, not the phase root; (b) the optional `workspaces` parameter resolves Pitfall 4 (Handle-as-authoritative-source). Planner should reconcile during 15.04 plan refinement — either rename CONTEXT D-05 to `mainRepoRoot` (recommended; matches conflict-paths.ts/reap.ts signature pattern) or compute `mainRepoRoot` from `phaseRoot` via `join(phaseRoot, '..', '..', '..')` inside the helper body (works but brittle to phase-dir layout changes).

### Example 6: CLI bridge `workspace-parallel-cancel.ts`

```typescript
// Source: sdk/src/query/workspace-parallel-cancel.ts (NEW — 15.04)
/**
 * sdk/src/query/workspace-parallel-cancel.ts — Phase 15.04 (PARALLEL-07)
 *
 * CLI bridge for `vcs.workspace.parallel.cancel`. Mirrors workspace-parallel-
 * fan-in.ts's shape — Handle JSON via stdin or file flag, no inline form.
 *
 * Flags:
 *   --cwd <path>        optional; defaults to projectDir
 *   --handle <input>    required: ParallelDispatchHandle as JSON.
 *                       "@-"       → read from stdin
 *                       "@<path>"  → read from file
 *
 * Returns the `CancelResult` JSON via `{ data: cancelResult }` (flat envelope,
 * mirrors workspace.parallel.fan-in).
 *
 * Usage:
 *   gsd-sdk query workspace.parallel.cancel --handle @handle.json
 *   gsd-sdk query workspace.parallel.cancel --handle @-  < handle.json
 */

import { readFileSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import type { ParallelDispatchHandle } from '../vcs/types.js';
import type { QueryHandler } from './utils.js';

function resolveFileOrStdin(raw: string): string {
  if (raw === '@-') {
    return readFileSync(0, 'utf-8');
  }
  if (raw.startsWith('@')) {
    return readFileSync(raw.slice(1), 'utf-8');
  }
  throw new Error(
    `expected @<path> or @- but got inline string (inline JSON form is not accepted)`,
  );
}

export const workspaceParallelCancelQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let handleRaw: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--handle' && args[i + 1]) {
      handleRaw = args[++i];
    }
  }

  if (handleRaw === undefined) {
    return { data: { ok: false, reason: 'handle_required' } };
  }

  let handle: ParallelDispatchHandle;
  try {
    const handleText = resolveFileOrStdin(handleRaw);
    handle = JSON.parse(handleText);
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
  const cancelResult = vcs.workspace.parallel.cancel(handle);

  return { data: cancelResult };
};
```

### Example 7: Three-site CLI registration (CF-07)

```typescript
// Source: sdk/src/query/command-static-catalog-domain.ts (15.04 ADD after :74)
import { workspaceParallelCancelQuery } from './workspace-parallel-cancel.js';
// ... in DOMAIN_STATIC_CATALOG array:
['workspace.parallel.cancel', workspaceParallelCancelQuery],
['workspace parallel.cancel', workspaceParallelCancelQuery],

// Source: sdk/src/query/command-manifest.non-family.ts (15.04 ADD after :62)
{ canonical: 'workspace.parallel.cancel', aliases: ['workspace parallel.cancel'], mutation: true, outputMode: 'json' },

// Source: sdk/src/query/command-aliases.generated.ts (15.04 ADD after :157)
{ canonical: 'workspace.parallel.cancel', aliases: ['workspace parallel.cancel'], mutation: true },
```

### Example 8: Audit script shape (15.01 D-13)

```javascript
#!/usr/bin/env node
// scripts/audit-root-commits-rename.cjs — one-shot pre-rename audit (15.01)
// Stdout-only: caller redirects to .planning/phases/15-.../rootCommits-rename-audit.json
// Per feedback_avoid_jj_auto_tracked_output: never writes into colocated jj working tree.
// Discarded post-milestone (single-purpose; not a recurring CI lint).

const { execSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const PATTERN = '\\brootCommits\\b';
const EXCLUDES = [
  'node_modules', '.git', '.jj', 'dist-cjs/',
  '.planning/research/.archive-pre-v1.4/',
  '.planning/milestones/v1.2-research/',
];
const EXTENSIONS = ['ts', 'cjs', 'js', 'md', 'json'];

// Build grep args
const grepArgs = [
  '-rn', PATTERN,
  ...EXTENSIONS.map((ext) => `--include=*.${ext}`),
  ...EXCLUDES.flatMap((e) => ['--exclude-dir', e.replace(/\/$/, '')]),
  '.',
];

let raw;
try {
  raw = execSync(`grep ${grepArgs.map((a) => `'${a}'`).join(' ')}`, { encoding: 'utf-8' });
} catch (err) {
  // grep returns 1 when no matches — post-rename success case
  raw = err.stdout ? err.stdout.toString() : '';
}

const hits = raw.split('\n').filter(Boolean).map((line) => {
  const [file, lineNo, ...snippetParts] = line.split(':');
  return { file, line: Number(lineNo), snippet: snippetParts.join(':').trim() };
});

const byExtension = {};
for (const ext of EXTENSIONS) byExtension[ext] = [];
for (const hit of hits) {
  const ext = hit.file.split('.').pop();
  if (EXTENSIONS.includes(ext)) {
    byExtension[ext].push(hit);
  }
}

// Special cases — surface the capability matrix string literal explicitly
const specialCases = hits
  .filter((h) => h.file === './sdk/src/vcs/backends.ts' && h.line === 79)
  .map((h) => ({ ...h, kind: 'capability-matrix-string-literal' }));

// Idempotency hash — MD5 over sorted {file, line} tuples + per-extension counts
const hashInput = JSON.stringify({
  files: hits.map((h) => `${h.file}:${h.line}`).sort(),
  counts: Object.fromEntries(EXTENSIONS.map((e) => [e, byExtension[e].length])),
});
const idempotencyHash = createHash('md5').update(hashInput).digest('hex');

const out = {
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

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
```

### Example 9: Cancel scenario tests (mirror Phase 14.1 SC5 pattern)

```typescript
// Source: sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts (15.04 ADD after SC5 block)
describe.sequential.skipIf(!jjAvailable)(
  'workspace.parallel.cancel — clean abandon N=2 (PARALLEL-07 scenario 1)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = setupJjRepo();
      vcs = createJjAdapter(dir);
    });

    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('cancel(handle) tears down 2 dispatched workspaces; no agents run', { timeout: 30000 }, () => {
      const handle = vcs.workspace.parallel.dispatch({
        plan: [
          { agentId: 'a1', planId: 'p1' },
          { agentId: 'a2', planId: 'p2' },
        ],
        phaseNumber: 15,
        // Phase 14.1 (PARALLEL-08): no `mainBookmark: 'main'` — use
        // `mainBookmarks: ['main']` or OMIT entirely. The stale 15-04-PLAN.md
        // references at :151 and :404 must be patched before 15.04 executes.
      });

      // Both workspace dirs exist pre-cancel
      expect(existsSync(handle.workspaces[0].path)).toBe(true);
      expect(existsSync(handle.workspaces[1].path)).toBe(true);

      // Run cancel — no agents executed; expect clean abandon
      const result = vcs.workspace.parallel.cancel(handle);
      expect(result.abandoned.length).toBe(2);
      expect(result.surplusWorkspaces.length).toBe(2);
      expect(result.failedReaped.length).toBe(0);
      expect(result.surplusBookmarks.length).toBe(0);

      // Both dirs gone post-cancel
      expect(existsSync(handle.workspaces[0].path)).toBe(false);
      expect(existsSync(handle.workspaces[1].path)).toBe(false);
    });

    it('cancel(handle) is idempotent — second call returns all-empty arrays', { timeout: 30000 }, () => {
      const handle = vcs.workspace.parallel.dispatch({
        plan: [{ agentId: 'a3', planId: 'p3' }],
        phaseNumber: 15,
      });
      const first = vcs.workspace.parallel.cancel(handle);
      expect(first.abandoned.length).toBe(1);
      const second = vcs.workspace.parallel.cancel(handle);
      // Idempotent: second call sees no work to do; per D-03 returns empty
      expect(second.abandoned.length).toBe(0);
      expect(second.failedReaped.length).toBe(0);
      expect(second.surplusBookmarks.length).toBe(0);
      expect(second.surplusWorkspaces.length).toBe(0);
    });

    it('cancel(handle) returns frozen CancelResult — survives JSON round-trip', { timeout: 30000 }, () => {
      const handle = vcs.workspace.parallel.dispatch({
        plan: [{ agentId: 'a4', planId: 'p4' }],
        phaseNumber: 15,
      });
      const result = vcs.workspace.parallel.cancel(handle);
      // Phase 9 D-05 invariant
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.abandoned)).toBe(true);
      const roundTrip = JSON.parse(JSON.stringify(result));
      expect(roundTrip).toEqual(result);
    });
  },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ParallelDispatchOpts.mainBookmark: string` | `ParallelDispatchOpts.mainBookmarks?: readonly string[]` | Phase 14.1 (commit `tvkykqy`, 2026-05-24) | Cancel verb no longer needs to validate a bookmark field; bookmark-less and detached-HEAD working states are first-class for dispatch and fan-in |
| `current-branch` FATAL preflight in execute-phase.md + quick.md | Preflight removed; CR-03 lint asserts ABSENCE (polarity-flipped) | Phase 14.1 (commit `vlmlsqq`, 2026-05-24) | Cancel verb does NOT need an entry-time validation that mirrored the dropped preflight |
| 4-field `FanInResult` | 6-field `FanInResult` (already shipped Phase 9 D-08; the relevant fields for cancel are `failedReaped` + `surplusBookmarks`) | Phase 9 (2026-05-15) | CancelResult mirrors only the 2 relevant names; doesn't inherit the full FanInResult shape (which carries merge-specific fields) |
| Bookmark-required dispatch/fan-in | Optional `mainBookmarks?: readonly string[]` with all-or-nothing pre-validation | Phase 14.1 | Two-pass validate-then-mutate pattern is the established idiom (Pattern 7); use anywhere 15.04 has list iteration |
| Inline raw-git in workflow markdown for parallel orchestration | `vcs.workspace.parallel.{dispatch,fanIn}` SDK verbs | Phase 11 (closed v1.3) | Cancel naturally extends the same namespace; CLI bridge precedent established |
| `LogEntry.hash` / `CommitResult.hash` | `.id` (cross-backend unified) | Phase 8 (v1.2 NAMING) | Hard-rename methodology proven; CF-02 references this precedent for the rootCommits→rootRevisions rename |

**Deprecated / outdated:**
- Phase 11-era `WAVE_WORKTREE_MANIFEST` orchestrator-managed sidecar state — retired in jj/parallel.ts:234-240 (D-01) per `project_no_orchestrator_sidecar_state` memory. **Cancel should NOT introduce new sidecar state** — Handle is the source of truth.
- `lint-vcs-no-raw-git.allow.json` size pressure — Phase 13/14 collapsed workflow-markdown raw-git to zero; current allowlist is 24 entries (sdk/src/vcs/git/parallel.ts is +1). Phase 15 contributes **+0 entries** (the new helper sidecar uses `jj`, not `git`; the git cancel body is in `git/parallel.ts` which is already allowlisted).
- Manifest writer's `main_bookmark` row in `git/parallel.ts` — dropped in Phase 14.1 (no live reader). The remaining rows stay for parity.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Helper signature `(mainRepoRoot, phaseNumber, workspaces?)` is acceptable — adds the optional workspaces[] parameter beyond CONTEXT D-05's literal 2-arg `(phaseRoot, phaseNumber)` signature, AND renames `phaseRoot` to `mainRepoRoot` (the value the body actually needs for `jj workspace forget` + `jjArgvFlags`) | Pattern 5 + Pitfall 4 + Example 5 | If CONTEXT D-05 is strict-literal on the `phaseRoot` name, helper must derive `mainRepoRoot` from `phaseRoot` via `join(phaseRoot, '..', '..', '..')` — brittle to phase-dir layout changes. The 2-arg form still works; the 3-arg variant + rename is an additive safety improvement. Planner reconciles during 15.04 plan refinement. |
| A2 | The cross-product matchPrefix test can use `describe.each` with 10 cases minimum (5 rules × 2 backends) | Example 3 + Pattern 3 | If vitest 3.x `describe.each` is missing some feature needed, fall back to nested describes. Vitest 3.x supports `describe.each` natively per the existing usage in `cmd-parallel-{jj,git}.test.ts` (which uses `describe.sequential.skipIf`). |
| A3 | `mainRepoRoot` for git-side cancel is the wire-in `cwd` per `backends/git.ts:738` parallel namespace pattern — same as fanIn | Example 4 git cancel | Verified by reading the existing wire-in. No risk. |
| A4 | The `15-04-PLAN.md` stale references at :151 and :404 can be patched by the executor as an opening task | Pitfall 7 | If the planner instead amends the plan ahead of execute (recommended), the executor's first task is a no-op. Either path resolves the TSC-red risk. |

## Open Questions (RESOLVED)

1. **Helper signature: 2-arg or 3-arg? `phaseRoot` or `mainRepoRoot`?**
   - What we know: CONTEXT D-05 literal: `(phaseRoot: string, phaseNumber: number)`.
   - What's unclear: whether the additional `workspaces?: readonly {name, path}[]` parameter is a forbidden contract widening AND whether the first parameter should be `mainRepoRoot` (what the body actually needs) or `phaseRoot` (what the CONTEXT literal says).
   - RESOLVED: (user 2026-05-24, consumed by plan 15-04 + CONTEXT D-05 amendment) implement 3-arg with `workspaces?` optional AND rename the first param to `mainRepoRoot`. Document the dual-mode in the helper's JSDoc. This preserves D-05's intent (helper is a self-contained sidecar callable from cancel + fanIn + dogfood-restore.sh) while resolving the actual exec needs. The CONTEXT D-05 literal probably said "phaseRoot" because the example use case was the cancel body that already has `handle.phaseRoot`; in practice the body needs `mainRepoRoot`. Planner-level decision; document the rename in plan 15.04 CONTEXT amendment if reconciled.

2. **Idempotency semantic on already-cancelled handle: empty arrays or full mirror of the original?**
   - What we know: CONTEXT D-03 says re-call "returns CancelResult with empty arrays (no error)".
   - What's unclear: helper enumeration finds 0 dirs on second call (already torn down). Should `abandoned[]` be `[]` (literal interpretation of D-03) or should the helper consider the dirs "already abandoned" and include them?
   - RESOLVED: (consumed by plan 15-04 D-03 truth + idempotent-recall scenario) empty arrays per literal D-03 reading. The semantic is "what did this call DO?", not "what is the cumulative state?". An idempotent re-call did nothing; report nothing. Example 9 test asserts this.

3. **Cancel-on-conflicted state: cancel-after-fanIn-with-conflicts is allowed?**
   - What we know: fanIn returns `conflicted: true` when octopus merge produces in-tree conflicts. The conflicted workspaces are LEFT intact for review per reap's W3(a).
   - What's unclear: if the operator then calls `cancel(handle)`, should cancel respect the W3(a) preservation (skip the conflicted workspaces) or tear them down anyway?
   - RESOLVED: (consumed by plan 15-04 cancel JSDoc — diverges from reap by design per D-04) cancel tears them down. CONTEXT D-04 file boundary rationale explicitly says cancel's contract is "tear down everything explicitly requested" — diverges from reap. Document this in the cancel JSDoc.

4. **Surplus-bookmark cleanup on jj cancel: skip entirely or run a probe?**
   - What we know: Phase 11 D-02 retired the per-subagent jj agent-bookmark create loop. The jj-side `surplusBookmarks` in fanIn is `[]` by construction.
   - What's unclear: does jj cancel still need any bookmark cleanup, or is `surplusBookmarks: []` always correct?
   - RESOLVED: (consumed by plan 15-04 jj truth — surplusBookmarks always [] by Phase 11 D-02 retirement of per-subagent bookmarks) always `[]` on jj side. No probe needed. Document the asymmetry in JSDoc: "jj cancel returns surplusBookmarks: [] by construction (no per-subagent bookmarks); git cancel may return non-empty when worktree-agent-* refs outlive cleanup."

5. **15.04 plan stale references — pre-patch or executor-patch?**
   - What we know: 14.1-VERIFICATION.md lines 132-143 flagged `15-04-PLAN.md:151` and `:404` as carrying `mainBookmark` literals.
   - What's unclear: whether to amend the plan now (one-time edit, simpler) or leave the executor to patch (more honest about ordering).
   - RESOLVED: (N/A per N2 — prior 15-04-PLAN.md deleted as part of replan-from-scratch; no pre-patch required since new content is bookmark-clean by construction) pre-patch via a planner-level edit to 15-04-PLAN.md (`mainBookmark: string` → `mainBookmarks?: readonly string[]` at :151; `mainBookmark:'main'` → omit at :404 since cancel doesn't need it). Saves the executor's "first task" of patching the plan it's executing.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All SDK code | ✓ | v25.9.0 | — (Phase 15 requires Node ≥22 per `sdk/package.json` engines) |
| pnpm | Build + test | ✓ | (any 11+) | — |
| `jj` binary | jj backend tests + helper exec calls | ✓ | 0.41.0 | Tests `skipIf(!jjAvailable)`; audit script runs cross-platform via `grep` (no jj dep) |
| `git` binary | git backend tests + workflow | ✓ | 2.50.1 | Tests `skipIf(!gitAvailable)` |
| `grep` (POSIX) | Audit script (D-13) | ✓ | (system) | If unavailable, audit script could fall back to Node-side regex traversal; out-of-scope for plan body |
| `vitest` | SDK tests | ✓ (`^3.1.1`) | per `sdk/package.json` | — |
| `node --test` | Repo-level tests in `tests/` | ✓ (built-in) | per Node 22+ | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none required at this time.

## Validation Architecture

> `workflow.nyquist_validation: true` per `.planning/config.json`. Section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest ^3.1.1` (SDK side) + `node --test` (repo side `.cjs`) |
| Config file | `sdk/vitest.config.ts` (SDK); `tests/*.test.cjs` is self-contained for node-test |
| Quick run command | `cd sdk && pnpm vitest run --reporter=dot` (full SDK suite) |
| Per-file quick | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts` |
| Full suite command | `pnpm -r test` (workspace-wide; runs SDK vitest + repo node-test + lints) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAMING-01 (15.01) | `vcs.refs.rootRevisions(opts)` returns same shape as old `rootCommits` | unit + cross-backend | `cd sdk && pnpm vitest run src/vcs/__tests__/git-backend.test.ts src/vcs/__tests__/jj-refs.test.ts src/vcs/__tests__/baseline-parity.test.ts` | ✅ (rename in-place) |
| NAMING-01 (15.01) | Per-extension `grep -c '\brootCommits\b'` returns 0 post-rename | grep gate (one-shot, not a recurring test) | shell loop over extensions; runs from plan body | ❌ — gate script lives in plan body, not a standalone test |
| VCS-21 (15.02) | `vcs.refs.idAlphabet === '0-9a-f'` on git; `=== 'k-z'` on jj | unit cross-backend | `cd sdk && pnpm vitest run src/vcs/__tests__/adapter-contract.test.ts` | ✅ (add to existing file) |
| VCS-22 (15.03) | `vcs.refs.matchPrefix` cross-product: 5 rules × 2 backends = 10 cases minimum | unit cross-backend | `cd sdk && pnpm vitest run src/vcs/__tests__/adapter-contract.test.ts` (new describe block) | ✅ (add to existing file) |
| PARALLEL-07 (15.04) | `cancel(handle)` returns within ≤2s for ≤8 workspaces (performance smoke) | unit + perf assert | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts -t "cancel"` (vitest's `it('...', {timeout: 2000}, () => ...)` form) | ❌ — Wave 0 (new describe block in existing cmd-parallel-{jj,git}.test.ts) |
| PARALLEL-07 (15.04) | `cancel(handle)` is idempotent (second call returns empty arrays) | unit | same as above | ❌ — Wave 0 |
| PARALLEL-07 (15.04) | Three-site CLI bridge resolves: `gsd-sdk query workspace.parallel.cancel --help` exits 0 | integration | `gsd-sdk query workspace.parallel.cancel --help` | ❌ — Wave 0 (integration smoke test) |
| PARALLEL-07 (15.04) | Helper `cleanupSubagentWorkspaces` is idempotent + UPSTREAM-02 clean | unit | `cd sdk && pnpm vitest run src/vcs/__tests__/jj-workspace-cleanup.test.ts` (NEW file) | ❌ — Wave 0 (new test file) |

### Sampling Rate

- **Per task commit:** `cd sdk && pnpm tsc --noEmit && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts src/vcs/__tests__/adapter-contract.test.ts` (focused; ~30s)
- **Per wave merge:** `pnpm -r test` (full suite; ~5-10min)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts` — covers cleanupSubagentWorkspaces helper unit tests (idempotency, UPSTREAM-02 import check, partial-state handling)
- [ ] New describe blocks in `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` and `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` — covers PARALLEL-07 cancel scenarios (clean-abandon, idempotent re-call, frozen-JSON round-trip)
- [ ] New cross-backend describe block in `sdk/src/vcs/__tests__/adapter-contract.test.ts` — covers VCS-21 idAlphabet literal + VCS-22 matchPrefix cross-product (10 cases minimum)
- [ ] Integration smoke for CLI bridge: `tests/cli-workspace-parallel-cancel.test.cjs` (node --test) — covers three-site resolution + JSON envelope shape
- [ ] Wave 1 of 15.04 ships the helper file `sdk/src/vcs/jj/workspace-cleanup.ts` BEFORE Wave 2 wires the cancel verb that consumes it

*(Framework install: NOT required — vitest and node-test are already present in the repo.)*

## Security Domain

> `security_enforcement` not present in `.planning/config.json` — treated as enabled per default. Phase 15 surface is SDK-internal (no auth, no network, no PII), but standard input-validation discipline applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — SDK does not authenticate |
| V3 Session Management | no | n/a — no sessions |
| V4 Access Control | no | n/a — adapter has no privilege model beyond filesystem perms |
| V5 Input Validation | yes | matchPrefix throws on wrong-alphabet input (CF-04); refname validation reuses `sdk/src/vcs/refs-validator.ts` |
| V6 Cryptography | yes (limited) | MD5 in audit script's `idempotencyHash` — NOT a security primitive (collision-tolerant identity check only, like git's short-prefix). For an actual security MAC, would use SHA-256. MD5 is the correct choice for fingerprinting non-adversarial inputs. |
| V12 File Resources | yes | `rmSync({recursive: true, force: true})` — bounded by workspace path under `.claude/jj-workspaces/phase-{NN}-subagent-*` glob; no path-traversal vector because path components are derived from `handle.workspaces[].path` (validated at dispatch time via `validateAgentId` regex) |
| V13 API & Web Service | no | n/a — no network surface |

### Known Threat Patterns for SDK adapter surface

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `workspacePath` user input | Tampering | `validateAgentId` regex at dispatch time + helper uses `existsSync` gate + `rm -rf` with `force: true` is path-bounded by the helper's iteration list (no user-controlled glob expansion) |
| Argv injection via crafted refname (`mainBookmarks` reference) | Tampering | `validateMainBookmark` (jj) / `validateRefname` (git) at fan-in entry; cancel does NOT take a refname input — no vector |
| Memory exhaustion via huge `handle.workspaces[]` array | DoS | Bounded by orchestrator dispatch (max-concurrency knob defaults reasonable); no unbounded iteration in helper |
| MD5 collision on audit `idempotencyHash` | Tampering | Non-adversarial fingerprint — MD5 sufficient. If a contributor maliciously crafted a colliding file set, the per-extension `grep -c` gate (D-10) is the real safety net, not the hash |
| `jj workspace forget` argv injection via crafted workspace name | Tampering | Workspace names are derived from `phase-{NN}-subagent-{idx}` (validated at dispatch via `validateAgentId`); `--` separator before name argument is defense-in-depth (matches reap.ts:175-177) |
| Hooks fired during cancel (unintended side effects) | Tampering | `jj workspace forget` is NOT a commit; does not fire pre-commit/pre-push hooks. Confirmed by audit of `jj/lock.ts` idempotency notes (lock acquisition does not fire hooks; analogous for forget) |

## Sources

### Primary (HIGH confidence)

- **Live source reads (post-Phase-14.1 codebase, 2026-05-24):**
  - `sdk/src/vcs/types.ts:336-560` — VcsRefs / VcsWorkspace / VcsWorkspaceParallel / ParallelDispatch{Opts,Handle} / FanInResult interfaces (current state)
  - `sdk/src/vcs/backends.ts:42-138` — Capability matrix `BACKENDS_AVAILABLE_FOR_VERB`
  - `sdk/src/vcs/backends/jj.ts:964-980, 1245-1264` — jj backend rootCommits body + parallel namespace wire-in
  - `sdk/src/vcs/backends/git.ts:526-564, 738-745` — git backend rootCommits body + parallel namespace wire-in
  - `sdk/src/vcs/jj/parallel.ts:1-509` — UPSTREAM-02 sidecar pattern + Phase 14.1 mainBookmarks two-pass loop
  - `sdk/src/vcs/git/parallel.ts:1-626` — adapter-internal sidecar + Phase 14.1 STEP 1.5 update-ref loop
  - `sdk/src/vcs/jj/conflict-paths.ts, incomplete-work.ts, reap.ts` — sidecar template precedents
  - `sdk/src/vcs/exec.ts:1-134` — spawnSync STACK constraint
  - `sdk/src/query/workspace-parallel-{dispatch,fan-in}.ts` — CLI bridge precedents
  - `sdk/src/query/command-{static-catalog-domain,manifest.non-family,aliases.generated}.ts` — three-site CLI registration sites
  - `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:460-700, cmd-parallel-git.test.ts:716-958` — SC5 scenario test pattern
  - `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:1-77` — empirical alphabet-disjointness probe
  - `sdk/src/vcs/expr.ts:35-95` — existing SHA_OR_CHANGE_ID_RE pattern + RevisionExpr factories
  - `sdk/src/vcs/format-migration/rewrite.ts:53,63` — GIT_SHA_RE + JJ_CID_RE existing alphabet sources
- **Phase 14.1 closure docs:**
  - `.planning/phases/14.1-.../14.1-01-SUMMARY.md` — what shipped, what changed
  - `.planning/phases/14.1-.../14.1-VERIFICATION.md` — 12/12 must-haves + 15.04 plan stale-reference warning at lines 132-143
- **Phase 15 inputs:**
  - `.planning/phases/15-.../15-CONTEXT.md` — locked decisions D-01 through D-13
  - `.planning/phases/15-.../15-DISCUSSION-LOG.md` — option-tree for CancelResult shape, helper location, audit schema
  - `.planning/REQUIREMENTS.md` — NAMING-01, VCS-21, VCS-22, PARALLEL-07, PARALLEL-08 (closed)
  - `.planning/STATE.md` — milestone tracking, deferred items, Phase 14.1 close notes
  - `.planning/PROJECT.md` — milestone framing, OOS clauses
  - `.planning/config.json` — `workflow.nyquist_validation: true` confirms test section inclusion
- **Tool environment (verified live):**
  - `node --version`: v25.9.0
  - `jj --version`: 0.41.0
  - `git --version`: 2.50.1
  - `sdk/package.json`: TypeScript ^5.7.0, vitest ^3.1.1, Node engines ≥22

### Secondary (MEDIUM confidence)

- `sdk/src/vcs/refs-validator.ts` (referenced but not exhaustively read) — `validateRefname` is the strict git-side validator; `validateBookmarkName` is the looser jj-side validator. Used in matchPrefix consideration; planner should verify exports during 15.03 execute.
- `.planning/intel/id-namespace-audit.json` — v1.2 audit JSON precedent for the new rootCommits-rename-audit.json schema.
- `scripts/audit-workflow-raw-git.cjs:39-50,98-130` — fence-aware markdown walker shape; NOT consumed in Phase 15 (no markdown change), but referenced for audit-script style.

### Tertiary (LOW confidence — would be flagged for validation if relied upon)

- None. All claims in this research are grounded in either live source reads or CONTEXT.md decisions. No WebSearch was performed (no external info needed — this is a pure internal SDK refactor with established patterns).

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — zero new dependencies; existing TS/Node/vitest versions verified from `sdk/package.json`
- Architecture patterns: **HIGH** — all 8 patterns grounded in live source reads of existing sidecars (`conflict-paths.ts`, `incomplete-work.ts`, `reap.ts`, `parallel.ts`)
- Pitfalls: **HIGH** — 7 of 8 pitfalls are documented in CONTEXT/PITFALLS.md and verified against current codebase; Pitfall 4 (helper enumeration) is a NEW pitfall surfaced by this research pass after reviewing the Handle's `workspaces[]` authoritative-list-vs-readdirSync trade-off
- Post-Phase-14.1 deltas: **HIGH** — all 6 documented deltas verified by reading Phase 14.1's SUMMARY + VERIFICATION docs + the post-rename source files
- CancelResult envelope shape: **HIGH** — D-01 4-field is locked; mirrors FanInResult's `failedReaped` + `surplusBookmarks` naming verified at types.ts:558-559
- Three-site CLI registration: **HIGH** — verified via grep of all three files; existing `workspace.parallel.dispatch` + `workspace.parallel.fan-in` precedent shows exact shape
- Cross-backend asymmetries: **HIGH** — jj uses surplusBookmarks:[] by construction (Phase 11 D-02 retirement); git carries worktree-agent-* refs (load-bearing asymmetry per git/parallel.ts:14-28 JSDoc)

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days for stable adapter surface; flag for re-research if Phase 16 lands first and amends the helper signature)

---

*Research re-built post-Phase-14.1 — old 15-RESEARCH.md overwritten. Major delta from prior research pass: `ParallelDispatch{Opts,Handle}.mainBookmark: string` is now `mainBookmarks?: readonly string[]` (optional, plural, frozen); cancel verb body inherits the bookmark-free surface. The 15-04-PLAN.md stale references at lines 151 and 404 (flagged in 14.1-VERIFICATION.md) must be patched preemptively or by the 15.04 executor; verbatim `mainBookmark: 'main'` literals will TSC-fail otherwise.*
