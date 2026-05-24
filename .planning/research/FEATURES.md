# FEATURES Research: GSD jj-port v1.4 — Cleanup + Deferred-Item Harvest

**Domain:** GSD jj-port fork v1.4 — fork-internal todo cleanup, deferred-item harvest, drift control before next upstream pull
**Researched:** 2026-05-23
**Confidence:** HIGH (verified against current SDK source, existing tests, current jj 0.41 docs, and 3 independent industry precedents)

---

## (a) Capabilities Grouped by Category

The 11 v1.4 target features cluster into **four** clean categories with bounded inter-category coupling:

### Category 1 — Tactical cleanup (5 v14-* todos)

Self-contained surgical fixes; no new public API. Each is one-or-two-commit work.

| Item | Source | Complexity | Justification |
|------|--------|------------|---------------|
| `v14-transition-md-update-gap` | `.planning/todos/pending/v14-transition-md-update-gap.md` | **S** | Copy proven `assert_clean_wc` block + reorder mutation/commit pair at one site (`transition.md:166`). Pattern already shipped in `execute-phase.md` + `plan-phase.md`. |
| `v14-orphan-jj-workspace-dirs` | `.planning/todos/pending/v14-orphan-jj-workspace-dirs.md` | **S–M** | `rm -rf` in `vcs.workspace.parallel.fanIn` success branch (cleanup contract), with optional belt-and-braces append to `dogfood-restore.sh`. Cross-backend test via `vcs-fixture.ts` Pattern B mkdtemp. |
| `v14-review-followups` (5 WR + 5 IN) | `.planning/todos/pending/v14-review-followups.md` | **S** | Mechanical: 5 single-block guards (project-root assertion, `Array.isArray` check, `Number.isNaN` guard, tar-overlay decision, `afterEach` rm). All file:line targeted. |
| `v14-jj-reap-test-flake` | (referenced from PROJECT.md, not in `pending/`) | **S** | Narrow scope: only `jj-reap.test.ts > inclusion-filter` 5s timeout under parallel-test load. Memory `project_test_perf_pain_vitest` explicitly out of scope. |
| `v14-docs-verify-only-followups` (45 failures, 8 themes) | `.planning/todos/pending/v14-docs-verify-only-followups.md` | **M** | 8 themes (14+7+7+5+3+3+3+3 failures). Most are find-replace; theme 3 (ADR drift) and theme 6 (drift-control tests claimed but missing) need decisions. |

### Category 2 — API additions (3 deferred items: cross-backend adapter surface)

New public verbs on `VcsAdapter`. Touch `sdk/src/vcs/types.ts` + both backends + tests.

| Item | Source | Complexity | Justification |
|------|--------|------------|---------------|
| `vcs.refs.idAlphabet` (introspection) | v1.2 API-01 deferred; PROJECT.md §Active L106; SEED-001 surface flip context | **S–M** | One read accessor per backend; literal/computed constant return. Shape decision (see ambiguity flag #1) drives the surface design. |
| `vcs.refs.matchPrefix(id, prefix)` | v1.2 TEST-13 deferred; PROJECT.md §Active L106; SEED-001 "hex-prefix matching" caller-audit risk | **M** | Logical depends on `idAlphabet` for alphabet-aware behavior; existing alphabet machinery at `expr.ts:41` + `format-migration/rewrite.ts:63` provides building blocks but no public composable accessor. |
| `vcs.workspace.parallel.cancel(handle)` | v1.3 open deferral; PROJECT.md §Active L106 | **L** | Mid-execution graceful abandonment of in-flight dispatch. No existing precedent on the adapter surface; spawns new threat model (partial-completion state, signal handling, jj-workspace teardown ordering). |

### Category 3 — Drift control + reconciliation (3 items)

Lock prose to filesystem state; close out PROJECT.md/MILESTONES.md inconsistencies before upstream pull.

| Item | Source | Complexity | Justification |
|------|--------|------------|---------------|
| `tests/architecture-counts.test.cjs` | PROJECT.md §Active L106; v14-docs-verify-only-followups theme 6 | **S** | **Direct prior art exists** — `tests/inventory-counts.test.cjs` is a 65-line vitest-via-`node:test` live-scan against INVENTORY.md's `## Family (N shipped)` headers. Architecture-counts is essentially the same template against ARCHITECTURE.md's count claims (commands/workflows/agents/lib modules/install.js LOC). |
| `tests/command-count-sync.test.cjs` | PROJECT.md §Active L106 + INVENTORY.md L9, L59 | **S** | Sub-shape of architecture-counts but scoped to commands/. May be subsumable into architecture-counts.test.cjs (see ambiguity flag #4). |
| ARCHITECTURE.md prose-count fixes across en + 4 translations (5 known drifts) | v14-docs-verify-only-followups largest informational drift | **M** | Forced by the two new tests above. Per-language fix; templates won't help because actual translations diverged independently. |
| PROJECT.md `### Validated` reconciliation against MILESTONES.md + per-phase SUMMARYs | PROJECT.md §Active L106 + L190 footer note | **M** | Separate workstream from docs cleanup per discuss. Pre-Phase-11 drift noted at v1.3 close. No prior art — bespoke review pass. |

### Category 4 — Workflow call-presence lint (1 deferred item)

New CI guard. Static analysis of workflow markdown.

| Item | Source | Complexity | Justification |
|------|--------|------------|---------------|
| Workflow call-presence lint (`vcs.parallel.*` called in dispatch sections) | v1.3 open deferral; PROJECT.md §Active L106 ("mirrors `lint-vcs-no-raw-git.cjs` shape") | **M** | New scanner. Detection problem ("workflow has dispatch section but lacks adapter call") needs precise definition (see ambiguity flag #5). Shape precedent from `lint-vcs-no-raw-git.cjs` (164 LOC, default-deny + allowlist) and `audit-workflow-raw-git.cjs` (fence-aware scan with frozen baseline). |

---

## (b) Industry Precedents (with citations)

### 2.1 — `vcs.workspace.parallel.cancel(handle)` — strongest precedents

**Three industry shapes, three different contracts:**

1. **Tokio `JoinSet::abort_all` / `shutdown` (Rust)** — Pure preemptive: `abort_all()` cancels every task immediately without removing them from the set; caller drains via `join_next()` to observe `JoinError::is_cancelled()` on each. `shutdown()` is `abort_all() + drain` composed. **No partial-completion concept** — tasks are either already-finished (returns the result) or cancelled (returns the cancellation error). Cleanup is the caller's job via the drain.
   Source: https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html
2. **GNU `parallel --halt-on-error N` (POSIX)** — Three-level dial: `--halt-on-error 1` = "stop launching new jobs but finish in-flight ones gracefully" (cooperative); `--halt-on-error 2` = "kill in-flight jobs immediately, no cleanup" (preemptive); default = "let everything finish, surface errors at end." **Partial completion is first-class**: jobs that completed before the halt are recorded as success.
   Source: https://www.gnu.org/software/parallel/parallel_tutorial.html
3. **GitHub Actions matrix `fail-fast` + `cancel-in-progress`** — Two-stage: `fail-fast: true` (default) cancels in-progress and queued matrix legs on any failure, but each leg gets a SIGTERM grace window; `cancel-in-progress: true` (on concurrency) is a stricter "always cancel the previous run" lane. Partial completion = whatever jobs reported `success` before the cancel triggered. **Notably, `continue-on-error: true` opts a single leg out of fail-fast** — letting one leg fail while siblings continue.
   Source: https://github.com/orgs/community/discussions/27192

**Synthesis for v1.4:** The user's specific question ("cooperative? preemptive? mixed?") maps directly to the GNU-parallel `--halt-on-error` shape. Recommendation: **mixed (SIGTERM-then-timeout-then-SIGKILL)** mirroring Node's documented child_process kill semantics (https://nodejs.org/api/child_process.html), with `FanInResult`-shape extension to record partial completion (`cancelled: readonly string[]` peer to `merged`/`failedReaped`/`incompleteQueued`). Cooperative-only is wrong because subagent shell-outs through `vcsExec` can ignore SIGTERM mid-`jj squash`. Preemptive-only is wrong because it leaves the `.jj/op_log` in an indeterminate state.

**Note** the STACK research arrived at the opposite recommendation (no signal-threading; cancel is synchronous teardown only) based on the constraint that `vcsExec` uses `spawnSync` which can't accept AbortSignal. **This conflict is real and is a critical discuss-phase decision point** — see ambiguity flag #2.

### 2.2 — `vcs.refs.matchPrefix(id, prefix)` and `vcs.refs.idAlphabet` — strongest precedents

1. **Git `core.abbrev` + `rev-parse --short`** — Minimum 4 chars, default from `core.abbrev`, **lengthens automatically to maintain uniqueness in the repo**. Caller does not pass alphabet — git infers from id shape (always hex).
   Source: https://git-scm.com/docs/git-rev-parse
2. **Jujutsu's ID prefix index** — Dynamically computes the **shortest unique prefix per change** by binary-searching neighbors in the sorted-id index; a partial "active" subset (configurable via `revsets.short-prefixes`) gets prefix-shrinking precedence so daily-driver commits get 1–2 char IDs. Alphabet is hardcoded `k-z` reverse-hex (16 letters); jj internally calls it `reverse_hex`. **No CLI surface for alphabet introspection** — callers infer from id shape via regex.
   Sources: https://jonathan-frere.com/posts/jujutsu-shortest-ids/, https://docs.jj-vcs.dev/latest/glossary/
3. **Internal precedent — `expr.ts:41` `SHA_OR_CHANGE_ID_RE`** — The fork already inlines `/^[0-9a-fA-F]{4,40}$|^[k-z]{4,40}$/` as the per-backend acceptance predicate; `format-migration/rewrite.ts:63` carries `JJ_CID_RE = /(?<![k-z])([k-z]{8,12})(?![k-z])/g` with a width-band of 8–12. The alphabet rule has been ad-hoc duplicated in **three** source locations. `idAlphabet` formalizes what's already there.

**Synthesis for v1.4:** `idAlphabet` returning a `{ kind: 'hex' | 'reverse-hex'; chars: string; minLen: number; maxLen: number }` object solves both display-and-validation use cases without committing to a 'hex'|'base32' enum that misrepresents jj's actual scheme (it's reverse-hex, not base32). `matchPrefix` should **return false (not throw)** when the prefix's alphabet doesn't match the id's alphabet — the operation is well-defined (definitely no match) and a false return composes cleanly in user code (`if (matchPrefix(id, userInput))`). Throw is correct for *malformed* prefixes (e.g., empty string, length > id length) — those are caller bugs, not user-input failures.

### 2.3 — Workflow call-presence lint — strongest precedents

1. **`actionlint`** — Reusable-workflow checker that verifies declared inputs/outputs/secrets are actually consumed; **closest match to "this section declares X but never calls Y"**. Static analysis; YAML-aware. Format: file:line:reason. Plus optional shellcheck for `run:` blocks.
   Source: https://github.com/rhysd/actionlint
2. **Internal — `scripts/lint-vcs-no-raw-git.cjs` (164 LOC)** — Default-deny pattern scanner with per-entry `{path|glob, reason, owner}` JSON allowlist (D-03/D-04), inline `// vcs-lint:allow-git-here <reason>` escape, separate JS/TS and shell-mode patterns. Stdout-only. Exit 0 = clean / Exit 1 = violations with `file:line:label`.
3. **Internal — `scripts/audit-workflow-raw-git.cjs`** — Fence-aware markdown scan (`bash`/`sh`/`zsh` fences only) with **frozen per-file baseline** allowing legacy debt while pinning regression. Plain `Object.freeze`d const + JSON output mode.

**Synthesis for v1.4:** Mirror `lint-vcs-no-raw-git.cjs` structure (default-deny + JSON allowlist + inline annotation), but reverse the polarity — instead of "deny raw-git", "require parallel call". Detection: any `.md` under `get-shit-done/workflows/` containing a section header tagged "dispatch" (e.g., `**Worktree mode**`, `### Dispatch`) MUST contain at least one `gsd-sdk query workspace.parallel.dispatch` or `gsd-sdk query workspace.parallel.fan-in` invocation in a bash/sh fence inside that section. Hard-fail in CI (mirrors `lint-vcs-no-raw-git`). Pre-existing files without dispatch sections are not in scope — there's no false-positive surface.

### 2.4 — Drift-control tests — strongest precedents

1. **Internal — `tests/inventory-counts.test.cjs` (65 LOC)** — Live-scan style: `describe('docs/INVENTORY.md headline counts match the filesystem')` loops over 6 families (Agents/Commands/Workflows/References/CLI Modules/Hooks), regex-extracts `## Family (N shipped)` from the markdown, `fs.readdirSync().filter().length` from the directory, `assert.strictEqual(documented, actual, …)`. **Both sides computed at test runtime — no hardcoded numbers, no snapshot files.** This is the exact pattern the user's question describes.
2. **Jest/Vitest snapshot style** — Inverted: serialize expected, store in `.snap` file, compare on subsequent runs. **Wrong fit** for this use case because the snapshot drifts silently (you accept the update, the count drift you wanted to catch never surfaces). Used by jest/vitest for component output, not for prose-count claims.
   Source: https://jestjs.io/docs/snapshot-testing
3. **Whitelist style (e.g., `lint-vcs-no-raw-git.allow.json`)** — Static stored expected count + filesystem source pattern. Easier to grep in PR review than live-scan, but requires updating both the test and the doc whenever a file is added. **Worse ergonomics** than live-scan when the truth source IS the filesystem.

**Synthesis for v1.4:** **Live-scan style, verbatim copy of `tests/inventory-counts.test.cjs`'s shape.** For `architecture-counts.test.cjs`, target ARCHITECTURE.md's specific count claims (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC). For `command-count-sync.test.cjs`, the question is whether it's redundant (architecture-counts already covers commands) — see ambiguity flag #4.

---

## (c) Dependencies Between v1.4 Items

```
Category 2 internal chain:
  vcs.refs.idAlphabet ───required by──> vcs.refs.matchPrefix
       (matchPrefix needs to know prefix's alphabet to validate it
        against id's alphabet — "alphabet-aware" is the load-bearing
        contract per milestone_context #2)
  
  vcs.refs.matchPrefix ───independent of──> vcs.workspace.parallel.cancel
       (different code paths, different threat models; no coupling)


Category 1 ↔ Category 3 coupling:
  v14-docs-verify-only theme 6 ──unblocks──> architecture-counts.test.cjs implementation
       (theme 6 is "drift-control tests claimed but missing" — implementing
        the tests resolves the doc claim AND surfaces the prose-count drifts)

  architecture-counts.test.cjs ──forces──> ARCHITECTURE.md prose-count fixes
       (test will RED until ARCHITECTURE.md is reconciled in en + 4 translations)

  v14-orphan-jj-workspace-dirs ──coupled to──> vcs.workspace.parallel.cancel
       (cancel(handle) MUST also reap orphan FS dirs — same cleanup contract;
        implementing cancel after the orphan-cleanup fix gives the cancel
        path a known-good teardown helper to call)


Category 4 standalone:
  workflow call-presence lint ──independent of──> all other items
       (new scanner; no prerequisite work, no consumers within v1.4)


Test-infrastructure dependency:
  vcs.workspace.parallel.cancel ──requires──> new test infrastructure
       (no existing test exercises mid-execution abandonment; need
        a vcs-fixture.ts pattern that spawns a dispatch then cancels
        mid-flight without race-flakiness; consider a deterministic
        "agent sleeps until signal X" fixture)

  vcs.refs.matchPrefix / vcs.refs.idAlphabet ──reuses──> jj-id-alphabet-probe.test.ts shape
       (existing alphabet probe at sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:49-65
        already validates [k-z]+ shape; matchPrefix tests extend this with
        prefix-of-{hex|reverse-hex} cross-product cases)

  Drift-control tests ──reuses──> tests/inventory-counts.test.cjs shape
       (verbatim template; no new infrastructure needed)


PROJECT.md reconciliation:
  PROJECT.md `### Validated` reconciliation ──independent of──> all other items
       (separate workstream per discuss; can ship in any phase order)
```

### Recommended phase ordering (roadmap implication)

**Phase A — Cleanup foundation:** All Category 1 items + Category 4 (workflow call-presence lint). No new public APIs; lowest blast radius; sets the doc baseline before drift-control tests fire.

**Phase B — Drift control:** `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` (or merged into one) + ARCHITECTURE.md prose-count fixes. The tests RED until the prose is reconciled, so they ship together.

**Phase C — API additions:** `vcs.refs.idAlphabet` → `vcs.refs.matchPrefix` → `vcs.workspace.parallel.cancel`. Strict ordering: idAlphabet first (matchPrefix depends on it), cancel last (the most invasive, benefits from orphan-cleanup contract landing in Phase A).

**Phase D — Reconciliation:** PROJECT.md `### Validated` reconciliation. Separate workstream; can run parallel to Phase C if useful.

---

## (d) Ambiguity Flags (require explicit discuss-phase resolution)

### Flag #1 — `idAlphabet` return shape — UNDECIDED

**Specific question:** Does `vcs.refs.idAlphabet` return `'hex' | 'reverse-hex'` (string enum), `string` (literal alphabet chars), `{ kind, chars, minLen, maxLen }` (structured), or all three (string convenience + structured detail)?

**Why ambiguous:** Three independent consumer patterns make this a real design choice — display (need chars), validation (need kind+regex), prefix expansion (need minLen/maxLen). PROJECT.md and SEED-001 don't pin this. Picking wrong forces a v1.5 widening.

**Recommended resolution path:** Discuss with user. Suggest: structured object with all four fields, since adding fields later requires consumer changes; offering all-four upfront commits to nothing the existing alphabet regexes don't already encode (`[0-9a-fA-F]{4,40}` and `[k-z]{4,40}` from `expr.ts:41`).

### Flag #2 — `vcs.workspace.parallel.cancel(handle)` cancellation semantics — UNDECIDED (sharp conflict between STACK and FEATURES research)

**Specific question:** Is cancel cooperative (signal subagents and wait for clean exit), preemptive (force-kill workspaces + reap), or mixed (SIGTERM-then-timeout-then-SIGKILL)? What's the contract for partial-completion state — specifically, does the returned envelope distinguish "agent completed before cancel arrived" from "agent was actively interrupted"?

**Why ambiguous:** Two research lenses arrived at OPPOSITE recommendations:

- **STACK lens:** `cancel` is synchronous batched teardown only — abandon already-completed scaffolding. The exec layer is `spawnSync` which can't accept AbortSignal, so promising signal-based interruption is a lie. The orchestrator-awaits-Agent invariant (Phase 9 D-01) makes mid-flight cancel a non-problem in production.
- **FEATURES lens:** Mixed model (SIGTERM-grace-then-SIGKILL) with partial-completion in the result envelope, matching GNU parallel `--halt-on-error 1`. Cooperative-only is wrong because shell-outs can ignore SIGTERM; preemptive-only leaves indeterminate `.jj/op_log` state.

The reconciling truth: the FEATURES recommendation assumes a different exec layer than what ships. If `cancel` operates only on `handle.workspaces[]` that were ALREADY materialized by `dispatch` (and `dispatch` already returned), there's nothing to signal-kill — the cancel is purely teardown of static scaffolding. The STACK lens is correct given the current exec surface.

**Recommended resolution path:** Adopt the STACK lens — `cancel(handle)` is synchronous teardown of already-materialized workspaces (forget + rm -rf + bookmark delete). No signal handling, no AbortController, no partial-completion enum. The "I want to interrupt mid-Agent" use case is OUT OF SCOPE for v1.4 and would require a separate `vcsExecAsync` exec primitive — defer to future milestone if ever needed.

### Flag #3 — Workflow call-presence lint failure mode + scope — PARTIALLY UNDECIDED

**Specific question:** (a) Hard-fail (exit 1, blocks CI) or warn (exit 0 + stderr message)? (b) Scan all workflows, or only workflows tagged "uses parallel dispatch" (and how is tagging defined — frontmatter? heading match? content match?)? (c) What's the exact detection rule that signals "this workflow declares dispatch but doesn't call the verb" — heading-section match? Bash-fence regex? Other?

**Why ambiguous:** PROJECT.md says "mirrors `lint-vcs-no-raw-git.cjs` shape" (= hard-fail), but the call-presence semantic is the opposite of a deny-list and the scope is fuzzier. Currently only 2 files use parallel dispatch (`execute-phase.md`, `quick.md`); scanning all 89 workflow files raises false-positive risk.

**Recommended resolution path:** Discuss with user. Suggest: hard-fail (CI-blocking, consistent with `lint-vcs-no-raw-git`), scope = "any .md under `get-shit-done/workflows/` that contains the literal substring `workspace.parallel.dispatch` or `workspace.parallel.fan-in` in any bash fence MUST also contain the matching paired call within the same fence-block-cluster" (eliminates need for tagging — content-driven). The 2 known consumers (`execute-phase.md`, `quick.md`) self-tag by their existing dispatch calls.

### Flag #4 — `command-count-sync.test.cjs` scope vs. `architecture-counts.test.cjs` — UNDECIDED

**Specific question:** Is `command-count-sync.test.cjs` distinct enough from `architecture-counts.test.cjs` to warrant a separate file, or should they merge into one architecture-counts file with multiple `describe` blocks?

**Why ambiguous:** v14-docs-verify-only-followups theme 6 lists both files as "claimed but missing" without distinguishing scope. INVENTORY.md (the only place they're claimed) doesn't disambiguate. `tests/inventory-counts.test.cjs` already exists as a single 65-LOC file covering 6 families.

**Recommended resolution path:** Quick discussion. Suggest: merge into `architecture-counts.test.cjs` as a single file with two `describe` blocks (one for ARCHITECTURE.md count claims, one for INVENTORY.md/architecture-counts cross-references). Removes the "two files for one concern" footgun and matches `inventory-counts.test.cjs` precedent. Update INVENTORY.md theme 6 fix to reference the single file.

### Flag #5 — `matchPrefix` behavior on empty / oversized prefix — PARTIALLY UNDECIDED

**Specific question:** Return false or throw when prefix is empty (length 0) or longer than the id itself? Case sensitivity for hex (e.g., `'abc'` prefix vs. `'ABC123…'` id)?

**Why ambiguous:** Git accepts case-insensitive hex (rev-parse normalizes); the fork's existing `SHA_OR_CHANGE_ID_RE` accepts `[0-9a-fA-F]` (mixed case). Jj's k-z alphabet is lower-only. Empty-prefix corner is undefined in milestone_context.

**Recommended resolution path:** Discuss; suggest: throw `Error` on empty prefix (caller bug — prefix should never be empty in any real flow); return false on `prefix.length > id.length` (no possible match); hex case-insensitive (match git); k-z lower-only (match jj). All three rules document inline at the verb's JSDoc and pin via a test cross-product.

---

## Files referenced

- `.planning/PROJECT.md` — milestone scope + `### Active` list
- `.planning/MILESTONES.md` — v1.0–v1.3 shipped history
- `.planning/todos/pending/v14-docs-verify-only-followups.md` — 45 doc failures across 8 themes
- `.planning/todos/pending/v14-orphan-jj-workspace-dirs.md` — cleanup contract
- `.planning/todos/pending/v14-review-followups.md` — 5 WR + 5 IN findings
- `.planning/todos/pending/v14-transition-md-update-gap.md` — workflow safety pattern
- `.planning/seeds/SEED-001-change-id-only-on-jj-adapter-surface.md` — superseded; documents the matchPrefix/idAlphabet design space
- `sdk/src/vcs/types.ts` — current adapter surface
- `sdk/src/vcs/parse/jj-id.ts` — change_id↔commit_id translators (the alphabet-aware string handling)
- `sdk/src/vcs/expr.ts` — `SHA_OR_CHANGE_ID_RE` at L41 (existing alphabet shape predicate)
- `sdk/src/vcs/format-migration/rewrite.ts` — `JJ_CID_RE` at L63 (existing alphabet width-band)
- `sdk/src/vcs/jj/parallel.ts` — current parallel dispatch (cancel will extend this surface)
- `sdk/src/vcs/git/parallel.ts` — git-side parallel
- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts` — alphabet probe test pattern
- `tests/inventory-counts.test.cjs` — **direct prior art** for drift-control tests (65 LOC live-scan template)
- `scripts/lint-vcs-no-raw-git.cjs` — shape precedent for call-presence lint (164 LOC default-deny + JSON allowlist)
- `scripts/audit-workflow-raw-git.cjs` — fence-aware markdown scan precedent (frozen baseline pattern)
- `get-shit-done/workflows/execute-phase.md` lines 510–795 — current dispatch section (call-presence lint's primary scan target)
- `get-shit-done/workflows/quick.md` — second dispatch consumer

## Sources (external)

- [GNU Parallel — Tutorial](https://www.gnu.org/software/parallel/parallel_tutorial.html)
- [Tokio `JoinSet` docs](https://docs.rs/tokio/latest/tokio/task/struct.JoinSet.html)
- [GitHub Actions `fail-fast` discussion](https://github.com/orgs/community/discussions/27192)
- [Git `rev-parse` docs](https://git-scm.com/docs/git-rev-parse)
- [Jonathan Frere — Why are Jujutsu's ID Prefixes So Short?](https://jonathan-frere.com/posts/jujutsu-shortest-ids/)
- [Jujutsu Glossary (change_id)](https://docs.jj-vcs.dev/latest/glossary/)
- [Node.js child_process — kill signal & timeout](https://nodejs.org/api/child_process.html)
- [actionlint](https://github.com/rhysd/actionlint)
- [Jest Snapshot Testing](https://jestjs.io/docs/snapshot-testing)

---

## Key Findings (Executive Summary)

1. **Two clean blocks of work, not eleven independent items.** Category 1 (tactical cleanup) + Category 4 (call-presence lint) are pure-cleanup and independent. Category 2 (3 API additions) has a strict internal chain: `idAlphabet → matchPrefix → cancel`. Category 3 (drift control) sequences as `tests → prose fixes → reconciliation`. Roadmap should structure phases along this 4-category split, not item-by-item.

2. **`tests/inventory-counts.test.cjs` is a verbatim template for both drift-control tests.** 65 LOC, live-scan style, no snapshots. This collapses Category 3's "tests" complexity from M to S and eliminates the "snapshot vs. whitelist vs. live-scan" decision the user flagged.

3. **`vcs.workspace.parallel.cancel(handle)` is the single ambiguous-spec item with real design weight.** Cooperative-vs-preemptive is a load-bearing call. Sharp conflict between STACK and FEATURES research recommendations (Flag #2). Reconciliation: STACK lens is correct given the current `spawnSync` exec surface — cancel is synchronous teardown only.

4. **`matchPrefix` is straightforward once `idAlphabet` returns a structured shape.** Most of the alphabet logic already exists in three internal source locations (`expr.ts:41`, `format-migration/rewrite.ts:63`, `parse/jj-id.ts`). The work is **factoring**, not greenfield design. False-on-alphabet-mismatch composes cleanly; throw-on-empty/oversized is the right error contract.

5. **The workflow call-presence lint has only 2 in-scope consumers today** (`execute-phase.md`, `quick.md`). Content-driven detection (scan for `workspace.parallel.dispatch` / `workspace.parallel.fan-in` literal substring and require paired call) is simpler than heading-based tagging and eliminates false-positive risk on the other 87 workflow files.
