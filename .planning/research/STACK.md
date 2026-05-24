# STACK Research: v1.4 cleanup + deferred-item harvest

**Mode:** Project research (STACK focus only)
**Confidence:** HIGH
**Default lens:** prefer pure reuse; explicit anti-additions list

## Executive Summary

**Stack additions required for v1.4: ZERO net-new dependencies, ZERO version bumps, ZERO new tooling.** Every item in the v1.4 scope is pure-reuse-of-existing-stack work. The cleanup framing holds: this milestone consumes existing patterns (existing lint scaffolds, existing `node:test` drift-control idiom, existing `parallel.*` adapter surface, existing alphabet-aware string handling) rather than introducing anything new.

The only "version verification" worth recording is that **AbortController/AbortSignal are native on Node ≥22** (confirmed: `Node v25.9.0` runtime + Node 22 baseline both expose `AbortController`, `AbortSignal`, `AbortSignal.timeout`, `AbortSignal.abort` as globals) and `child_process.spawn`/`exec` accept `{signal}` since Node 14.17/15.5 — so the `cancel(handle)` verb body can use native Web-standard primitives without any polyfill or new dependency. **However**, the current adapter exec surface (`sdk/src/vcs/exec.ts:19,33,37-43`) is built on **`spawnSync`, which does NOT accept `AbortSignal`** (verified via Node.js docs). This is the single load-bearing constraint that shapes the cancel-verb design — see Item 2 below.

The drift-control tests question resolves cleanly: **`tests/inventory-counts.test.cjs:19-21,28-35` is the precedent** — it's a `node:test` file at the repo root that walks `commands/gsd`, `agents`, `get-shit-done/workflows`, `get-shit-done/references`, `get-shit-done/bin/lib`, and `hooks` directories and asserts ls counts against INVENTORY.md headlines. `tests/architecture-counts.test.cjs` and `tests/command-count-sync.test.cjs` belong in the same shape (already referenced in `docs/INVENTORY.md:9` as part of the drift-control test family — they're documented but not yet shipped).

The new workflow call-presence lint is the smallest possible cousin of `scripts/lint-vcs-no-raw-git.cjs` — same `node` + `node:fs` + `node:path` + `scripts/lib/allowlist-parser.cjs` + `scripts/lib/glob-to-regex.cjs` substrate, no new dependencies. The audit-script precedent (`scripts/audit-workflow-raw-git.cjs:39-50,98-130`) provides the fence-aware markdown walker the new lint will mirror.

---

## Per-Item Stack Analysis

### Item 1: Workflow call-presence lint (deferred v1.3)

**Goal:** new CI scanner that asserts `vcs.parallel.*` is called in workflow-markdown dispatch sections.

**(a) Net-new dependency:** None.

**(b) Existing-stack pattern to reuse — source of truth:**

| Reuse target | Location | Pattern role |
|---|---|---|
| `parseAllowlist`, per-entry schema `{path\|glob, reason, owner}` | `scripts/lib/allowlist-parser.cjs:34-61` | Per-entry allowlist for workflow files that don't need to call `parallel.*` (e.g., `add-todo.md`, `progress.md`). Drop `expires` per `feedback_solo_dev_no_expires`. |
| `globToRegExp` | `scripts/lib/glob-to-regex.cjs` (consumed transitively via parser) | If a glob is needed for `templates/**` patterns. |
| Recursive `.md` walker + fence-state machine + `SHELL_GIT_RE` style regex | `scripts/audit-workflow-raw-git.cjs:39-50,98-130` | Walk `get-shit-done/workflows/*.md`, find dispatch fences, regex-match presence of `gsd-sdk query workspace.parallel.dispatch` / `workspace.parallel.fan-in`. |
| `parseArgv` + `--scan-root` flag shape | `scripts/lint-vcs-no-raw-git.cjs:32-41` | Same fixture-test ergonomics; lets the unit test point at an isolated tmp tree. |
| CI integration step | `.github/workflows/parallel-e2e.yml` (Phase 13 plan 13-04) | New script slots in as a sibling step to the existing `audit-workflow-raw-git.cjs` CI-06 step. |
| Inline escape hatch annotation form | `scripts/lint-vcs-no-raw-git.cjs:54` (`vcs-lint:allow-git-here`) | New: `vcs-lint:dispatch-call-absent-here <reason>` annotation for one-off dispatch-omitting fences. |

**(c) Version probes:**

- Node ≥22 already required (`package.json:46-48`). `readdirSync({recursive:true})` (Node 22+) usable as a simplification over the explicit recursion in the audit script — both shapes valid.
- No external version probe.

**(d) NOT adding (anti-patterns + scope creep):**

- **NOT** a new shared lib module — the new lint script is small enough that it should live in `scripts/lint-vcs-parallel-call-presence.cjs` and consume the existing `scripts/lib/` modules. Do not refactor `audit-workflow-raw-git.cjs` to extract a shared "fence-aware walker" — premature abstraction; two consumers do not justify a third file.
- **NOT** promoted to `npm pretest`. Goes in `parallel-e2e.yml` only (matches the LINT-04 placement at the same gate; pretest stays at `lint:skill-deps` + `lint-vcs-no-commit-id.cjs` per `package.json:65`).
- **NOT** an `expires` field per `feedback_solo_dev_no_expires`. Schema is `{path|glob, reason, owner}`, byte-identical to the two existing lints.
- **NOT** an "ml-style fuzzy match" or AST parser. Plain regex over fence text — the dispatch sections are bash code, not parsed markdown.
- **NOT** scope-creep into checking that the `fan-in` is also present (paired-call invariant) unless trivially free. Single-verb-presence is the v1.4 deliverable; the paired check belongs to a follow-up if it ever becomes a real bug class.

---

### Item 2: `vcs.workspace.parallel.cancel(handle)` (deferred v1.3)

**Goal:** mid-execution graceful abandonment.

**(a) Net-new dependency:** None.

**(b) Existing-stack pattern to reuse — source of truth:**

| Reuse target | Location | Pattern role |
|---|---|---|
| `ParallelDispatchHandle` pure-JSON shape | `sdk/src/vcs/types.ts:493-518` | `cancel(handle)` takes the SAME handle `dispatch` returned; handle carries `phaseRoot`, `phaseNumber`, `mainBookmark`, `workspaces[]` — sufficient for full teardown. |
| `VcsWorkspaceParallel` interface | `sdk/src/vcs/types.ts:453-456` | Add `cancel(handle: ParallelDispatchHandle): CancelResult` as a third method. |
| `workspace.remove` + `workspace.forget` + `bookmarks.delete({force:true})` | `sdk/src/vcs/types.ts:387,407,437` | The teardown primitives `cancel` composes. jj side: `forget` + `rm -rf`. Git side: `worktree remove --force`. |
| Crash-classifier branch | `sdk/src/vcs/jj/reap.ts` (per Phase 9 plan 02 with the 3-branch classifier) | `cancel` does NOT need a new classifier — abandoned-by-user is a clean abandon, no incomplete-work queue entry. |
| `jj abandon` + `jj bookmark delete` for per-agent slots | `sdk/src/vcs/jj/parallel.ts:464` (existing `for (const a of reapResult.abandoned)` loop pattern) | Same teardown idiom; `cancel` walks `handle.workspaces[]` and abandons each. |
| `vcsExec` | `sdk/src/vcs/exec.ts:19` (`spawnSync`) | The sole subprocess primitive. Cancel's teardown is a sequence of synchronous shell-outs — `spawnSync` is correct here. |

**(c) Version probes (critical):**

- **AbortController/AbortSignal:** confirmed native on Node ≥22 (`AbortController`, `AbortSignal`, `AbortSignal.timeout`, `AbortSignal.abort` all `function`). Confidence HIGH. No polyfill needed.
- **`child_process.spawnSync` does NOT support `AbortSignal`** — confirmed via Node.js docs. This is load-bearing. `spawn` and `exec` (async forms) added `signal` support in Node v14.17/v15.5 (HIGH confidence). The existing adapter uses `spawnSync` exclusively (`sdk/src/vcs/exec.ts:19`). **Therefore: `cancel(handle)` cannot interrupt an in-flight subagent's `vcsExec` call**. The cancel semantics MUST be "abandon already-completed scaffolding," not "kill in-flight subprocesses." This matches the existing project posture: the orchestrator awaits all `Agent()` resolutions before fanIn per `sdk/src/vcs/jj/parallel.ts:38-39` (D-01/D-02 carry comment).
- jj 0.41 floor confirmed (`jj --version` → `jj 0.41.0-…`). No newer jj-native cancel primitive needed; `jj abandon` + `jj workspace forget` are stable since jj 0.30.

**(d) NOT adding (anti-patterns + scope creep):**

- **NOT** an `AbortController` + `AbortSignal`-threaded cancel that promises to interrupt in-flight subprocess calls. The exec layer is `spawnSync` — synchronous, signal-uninterruptible. Promising signal-based interruption is a lie.
- **NOT** a polling-based watchdog loop. `cancel` is a synchronous batched teardown of the handle's already-materialized workspaces — fits the `dispatch`/`fanIn` synchronous shape.
- **NOT** a new exec primitive (do not introduce `vcsExecAsync` for the sake of cancel — separate work, separate milestone if ever justified).
- **NOT** a partial-state recovery enum (`'cancelled' | 'aborted'`) on `IncompleteWorkEntry.reason`. The reason union is closed at 2 values per `sdk/src/vcs/types.ts:259`; user-cancelled abandons leave NO queue entry (clean abandon, not crash-recovery).
- **NOT** crossing into the "stop a running subagent" problem. The Phase 11 D-01 invariant "orchestrator awaits all `Agent()` resolutions before fanIn" makes mid-flight cancel a non-problem in production. `cancel` is for the "I started a wave, decided not to proceed" scenario, not "kill the spawned Claude session."
- **NOT** any interaction with `.git/config.lock` race serialization in the git backend — `cancel`'s teardown is per-workspace `git worktree remove --force` calls, which do not contend with new `worktree add` calls (none are issued during cancel). See `sdk/src/vcs/git/parallel.ts:163-193` for the existing serialization concern (write-side only).
- **NOT** removed `surplusBookmarks` reuse — keep the existing batched cleanup pattern for the per-agent bookmarks.

---

### Item 3: `vcs.refs.matchPrefix(id, prefix)` (deferred v1.2 TEST-13)

**Goal:** alphabet-aware short-prefix matching.

**(a) Net-new dependency:** None.

**(b) Existing-stack pattern to reuse — source of truth:**

| Reuse target | Location | Pattern role |
|---|---|---|
| Alphabet probe + disjointness assertion | `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:49-65,67-75` | Proves jj `change_id` is `^[k-z]+$` (NEVER hex), commit_id is `^[0-9a-f]+$` (NEVER `[g-z]`). The two alphabets are provably disjoint at jj 0.41. |
| `VcsRefs` interface insertion point | `sdk/src/vcs/types.ts:336-367` | Add `matchPrefix(id: RevisionExpr, prefix: string): boolean` as a sibling to `resolveShort(rev: RevisionExpr): string` at line 361. |
| Reverse-resolve helpers (boundary-io classification — KEEP) | `sdk/src/vcs/parse/jj-id.ts:36-70` | `commitIdOf` / `changeIdOf` are the only legitimate cross-namespace bridges in the SDK; `matchPrefix` does NOT need to touch this file — it works on the canonical id of the backend's own namespace. |
| Custom matcher pattern | `tests/__tools__/vitest-matchers.ts` (Phase 8 TEST-12 `toBeIdOf`) | The HIGH-confidence stack-precedent for backend-aware string assertions; `matchPrefix` tests SHOULD use `expect.extend` style matchers (`feedback_vitest_extend_over_free_fn`), not free functions. |

**Implementation note:** `matchPrefix('jj-change-id-here', 'kxyz')` is pure-string `id.startsWith(prefix)` — the alphabet awareness lives in the **caller** (who must know to pass `[k-z]`-shaped prefixes for jj, `[0-9a-f]` for git). The verb itself is a one-liner per backend; the value is the public contract that says "use this verb, never `.slice(0, N)` or hex-regex match." Verified: pure-TS implementation, no jj-native primitive needed.

**(c) Version probes:**

- jj 0.41 alphabet stability — already pinned by `jj-id-alphabet-probe.test.ts`. No new probe needed.
- No external version probe.

**(d) NOT adding (anti-patterns + scope creep):**

- **NOT** a new `jj` subprocess call. `matchPrefix` is pure-string; calling `jj log -r <prefix>` to do the matching would add latency for zero correctness benefit (and would re-introduce a commit_id/change_id resolution path that the v1.2 unification rules out — `feedback_sdk_commit_jj_safe` posture).
- **NOT** a `validatePrefix` that errors on hex chars in a jj prefix. The verb returns `false` for non-matches; alphabet-validity is the caller's contract, not the verb's job. (If callers regularly pass invalid-alphabet prefixes, that's a separate hardening pass — not v1.4.)
- **NOT** a re-export from `parse/jj-id.ts`. The matchPrefix verb belongs in the backend `refs.*` namespace, not the parse layer (which exists for the legitimate boundary-io reverse-resolve only, per `parse/jj-id.ts:7-11`).
- **NOT** any change to `expr.ts` or `RevisionExpr` branding. Input is `RevisionExpr & string`; output is `boolean`.

---

### Item 4: `vcs.refs.idAlphabet` (deferred v1.2 API-01)

**Goal:** public introspection.

**(a) Net-new dependency:** None.

**(b) Existing-stack pattern to reuse — source of truth:**

| Reuse target | Location | Pattern role |
|---|---|---|
| `VcsRefs` interface insertion point | `sdk/src/vcs/types.ts:336-367` | Add `readonly idAlphabet: string` (or `readonly idAlphabet: '0-9a-f' \| 'k-z'`) as a sibling to `readonly head` at line 337. Pure metadata, evaluated once per adapter instance. |
| Alphabet constants source-of-truth | `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:61-64` (jj: `/^[k-z]+$/`, NOT `[0-9a-j]`), `:73-74` (git: `/^[0-9a-f]+$/`, NOT `[g-z]`) | The probe test is the empirical source. The string literal `'k-z'` / `'0-9a-f'` is what the field returns. |
| Adapter-typed branching | `sdk/src/vcs/types.ts:600-610` (`GitVcsAdapter`, `JjVcsAdapter`, `VcsAdapter` discriminated union) | Each backend's `refs.idAlphabet` is statically-known at backend selection time. |

**(c) Version probes:**

- jj 0.41 alphabet probe — already locked. No new probe.

**(d) NOT adding (anti-patterns + scope creep):**

- **NOT** a function — it's `readonly`. The alphabet is backend-constant; computing it dynamically would be cargo-cult.
- **NOT** a regex shipped with the field. Callers wanting regex shapes use the bare alphabet string and compose `^[${alphabet}]+$` themselves. (Optional alternative: ship a sibling `readonly idShape: RegExp` if a real consumer needs it — but defer until that consumer exists. YAGNI.)
- **NOT** any cross-backend "normalized" alphabet — the WHOLE point is that the alphabets are different and the field exists to surface that.
- **NOT** an API.md doc update separately — landing this field implies updating the public surface docs in the same plan.

---

### Item 5: Drift-control tests (`tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`)

**Goal:** lock prose counts in ARCHITECTURE.md / INVENTORY.md to live filesystem state.

**(a) Net-new dependency:** None.

**(b) Existing-stack pattern to reuse — source of truth:**

| Reuse target | Location | Pattern role |
|---|---|---|
| **Test framework decision: `node:test`** | `tests/inventory-counts.test.cjs:19-21` (`require('node:test')`, `require('node:assert/strict')`) | `tests/` uses `node:test` exclusively (verified: `scripts/run-tests.cjs:18` invokes `node --test`). The new drift-control tests MUST be `node:test`. Repo convention is clear and bifurcated: `tests/` → `node:test`; `sdk/` → vitest. |
| **Framework runner** | `scripts/run-tests.cjs:14-18` | Recursive scan of `tests/**/*.test.cjs`. New tests are auto-discovered; no manifest update needed. |
| **Drift-control idiom** | `tests/inventory-counts.test.cjs:28-35,52-63` (the `FAMILIES` array + `headlineCount` regex + `fsCount` walker + per-family `test()` block) | Copy this exact shape. `architecture-counts.test.cjs` adds rows for the ARCHITECTURE.md headline counts (`44→68 commands`, `46→89 workflows`, `16→33 agents`, `17→60 lib modules`, `~3000→10,978 install.js LOC`). `command-count-sync.test.cjs` is referenced at `docs/INVENTORY.md:59` — its job is to lock the `## Commands` table row-count (not just headline). |
| **Cross-language docs** (en + ja-JP + ko-KR + pt-BR) | `docs/ARCHITECTURE.md`, `docs/ja-JP/ARCHITECTURE.md`, `docs/ko-KR/ARCHITECTURE.md`, `docs/pt-BR/ARCHITECTURE.md` (4 file paths verified via `find docs -name ARCHITECTURE.md`) | The drift-test walks ALL 4 paths and asserts each against the same live-FS count. |
| **Pattern B random-prefix mkdtemp** (if test needs isolated tree) | `tests/scripts/audit-workflow-raw-git.test.cjs:36-41` (TEST-16 / Pitfall 9 idiom) | For tests that materialize synthetic .md files — not needed here since the tests walk real filesystem against real docs. |

**(c) Version probes:**

- Node ≥22 `readdirSync({recursive: true})` already used in `scripts/run-tests.cjs:14`. Same pattern works in the new tests.
- No external version probe.

**(d) NOT adding (anti-patterns + scope creep):**

- **NOT** vitest. `tests/` is `node:test`-only. Adding a vitest file here would force a parallel test-runner invocation and breaks the `scripts/run-tests.cjs` cross-platform invariant.
- **NOT** a new lib helper for headline-regex parsing — `tests/inventory-counts.test.cjs:37-42` shows the inline 5-line idiom is preferable to extraction at this volume.
- **NOT** hardcoded counts. Both sides (documented number, filesystem ls count) are computed at test runtime per `tests/inventory-counts.test.cjs:14`. ARCHITECTURE.md numbers should be parsed from the prose, not constants in the test.
- **NOT** combined with the existing `tests/inventory-counts.test.cjs` — different doc, different headline shape, different lifetime. Keep them separate (single-responsibility, separate failure messages).
- **NOT** an attempt to fix the broken ARCHITECTURE.md numbers as part of writing the tests — the tests are what FORCE the fixes. Write tests first; let them red-fail; fix doc numbers in a separate plan (the v1.4 scope distinguishes "drift-control tests" from "ARCHITECTURE.md prose-count fixes" as two workstream items).
- **NOT** any check that the per-row content of the INVENTORY table matches the filesystem roster — that's `tests/inventory-source-parity.test.cjs` territory and already exists.

---

### Item 6: jj-reap.test.ts flake fix

**Goal:** narrow scope per `v14-jj-reap-test-flake.md` — fix the `> inclusion-filter` 5s timeout under parallel test load.

**(a) Net-new dependency:** None.

**(b) Existing-stack pattern to reuse — source of truth:**

| Reuse target | Location | Pattern role |
|---|---|---|
| `vitest` test-level options (`it.timeout`, `concurrent`) | `sdk/vitest.config.ts:7-26` (vitest config with `unit` + `integration` projects); vitest v3.1.1 supports `it.concurrent`, `it.skip`, `testTimeout` per-block. | Per-test timeout extension — `it('inclusion-filter: …', () => {...}, 15_000)` if fix (a) chosen. |
| Pattern B random-prefix mkdtemp for jj fixtures | `sdk/src/vcs/__tests__/jj-reap.test.ts:54` (`mkdtempSync(join(tmpdir(), 'gsd-jj-reap-'))`) | Already in use. No change. |
| `integration` project carve-out | `sdk/vitest.config.ts:17-23` (separate `integration` project with `testTimeout: 120_000`) | If fix (a) chosen and the test should NOT run under `unit`'s 5s default, move to `*.integration.test.ts` and let the existing 120_000ms project ceiling cover it. |
| `concurrent: false` opt-out idiom | vitest v3 supports `describe.concurrent` and `it.sequential` at block/test scope. | If fix (b) chosen: `describe('workspace.reap …', { concurrent: false }, () => {...})`. |

**(c) Version probes:**

- **vitest 3.1.1 → 4.1.7 available** (live npm registry, May 2026). NOT a v1.4 upgrade target — package-pinned `^3.1.1` resolves to latest 3.x; the upgrade is out-of-scope. MEDIUM confidence the test ergonomics needed (`it.timeout`, `concurrent:false`) are stable across 3.x/4.x. Stay on 3.1.1.
- Node ≥22 — no change.
- jj 0.41 — no change.

**(d) NOT adding (anti-patterns + scope creep):**

- **NOT** a `retry: N` knob in `sdk/vitest.config.ts`. The v1.3 plan 10-05 success criterion 5 explicitly states "no `retry: N` added to vitest config" — that constraint carries forward.
- **NOT** `--no-file-parallelism` as the global fix. That punishes the whole suite for one test's flakiness. The flake is per-test; the fix should be per-test (`it.timeout` or `concurrent: false` at the `it`/`describe` block).
- **NOT** a broader `project_test_perf_pain_vitest` rewrite. The todo (`v14-jj-reap-test-flake.md:35-43`) explicitly narrows scope; the longstanding perf pain is deferred per `PROJECT.md:28`.
- **NOT** moving the test to `node:test` to "escape vitest." `sdk/` is vitest-only; the bifurcation is by directory, not by test. Changing this test's framework would split the SDK test surface and break the contract-test integration with `toBeIdOf` and the rest of the unit project.
- **NOT** a vitest 4.x upgrade. Out of scope; v1.4 is cleanup, not framework migration. Defer to v1.5+ or after the next upstream pull (since vitest 4 has breaking config-shape changes per the v4 changelog).
- **NOT** moving the test to a new `*.serial.test.ts` extension with a third vitest project — the existing `unit`/`integration` two-project split is sufficient; if isolation is needed, the test moves to `*.integration.test.ts` (existing slot).

---

## Composite version-floor matrix (v1.4)

| Tool | Current floor | Verified | Action |
|------|---------------|----------|--------|
| Node | ≥22.0.0 | `package.json:46-48`, runtime `v25.9.0` | UNCHANGED. AbortController/AbortSignal native; `spawnSync` lacks `signal` support (load-bearing for Item 2). |
| pnpm | 11.0.8 | `package.json:49`, runtime `11.0.8` | UNCHANGED. |
| TypeScript | ^5.7.0 | `sdk/package.json:55` | UNCHANGED. |
| vitest | ^3.1.1 | `sdk/package.json:56` (latest published is 4.1.7 — out of v1.4 scope) | UNCHANGED. |
| jj | 0.41 | runtime `jj 0.41.0-…` | UNCHANGED. All v1.4 deferred items use stable jj primitives (`abandon`, `workspace forget`, `bookmark delete`, `log -r`). |
| @anthropic-ai/claude-agent-sdk | ^0.2.84 | `package.json:51` | UNCHANGED — no v1.4 item touches Agent SDK surface. |
| `node:test` | Node 22 native | `tests/*.test.cjs`, `scripts/run-tests.cjs:14-18` | UNCHANGED. Drift-control tests use this framework. |

---

## Aggregate "NOT adding" list (consolidated anti-pattern fence)

The cleanup-milestone framing requires this list be visible. Anything below would be scope creep dressed as v1.4 work:

1. **No new npm dependencies.** Period. Six items, zero additions.
2. **No new dev-dependencies.** All test infrastructure (`node:test`, vitest, c8) already present.
3. **No vitest 4.x upgrade.** Defer past v1.4 / past the next upstream pull.
4. **No new shared lib module under `scripts/lib/`.** The two existing modules (`allowlist-parser.cjs`, `glob-to-regex.cjs`) are sufficient.
5. **No `AbortController`-threaded async exec primitive (`vcsExecAsync`).** Item 2's cancel is synchronous batched teardown; the exec surface stays `spawnSync`.
6. **No new vitest config knobs** (`retry`, `concurrency`, `pool` changes). Item 6 is per-test fix only.
7. **No CI lane additions.** New lint slots into existing `parallel-e2e.yml`; new drift tests slot into existing `scripts/run-tests.cjs` invocation.
8. **No conversion of `tests/` → vitest** or `sdk/` → `node:test`. Bifurcation by directory is the convention.
9. **No new `RevisionExpr` brand-instance.** `matchPrefix` and `idAlphabet` use the existing brand.
10. **No new `IncompleteWorkEntry.reason` enum values.** User-cancellation leaves no queue entry.
11. **No new boundary-io accessor in `parse/jj-id.ts`.** SEED-001 inversion holds; `matchPrefix` is canonical-side only.
12. **No `expires` field** on the new lint's allowlist schema (per `feedback_solo_dev_no_expires`).
13. **No prose-pattern AST parser** for the workflow call-presence lint. Plain regex over bash fences is sufficient.
14. **No promotion of any new lint to `npm pretest`.** All new lints go to `parallel-e2e.yml` only.
15. **No `--ignore-working-copy` in any new jj invocation** (project-wide standing rule per `project_squash_model`).
16. **No raw git in any new script** (`project_no_raw_git`); cancel-verb teardown on git side uses adapter primitives only.

---

## Implications for Roadmap

**Phase structure recommendation (STACK lens only):** All six items can run in 1–2 phases without phase-level dependency complications because **none introduce new tooling, so there is no "wire up the new dep" gate**.

Suggested ordering by stack-coupling proximity (items that touch the same files cluster):

- **Cluster A — type-surface additions** (Items 3, 4): `sdk/src/vcs/types.ts:336-367` — `matchPrefix` and `idAlphabet` are sibling field additions. Both backends, both tests. One plan, two-three files per backend.
- **Cluster B — parallel-namespace addition** (Item 2): `sdk/src/vcs/types.ts:453-456` — `cancel` as third method on `VcsWorkspaceParallel`. Touches both backends (`backends/git.ts` parallel wire-in + `backends/jj.ts` parallel wire-in + `sdk/src/vcs/jj/parallel.ts` + new `sdk/src/vcs/git/parallel.ts` body). One plan.
- **Cluster C — drift-control + lint tooling** (Items 1, 5): `scripts/` and `tests/` only — no SDK surface touched. Two plans (separate files, separate verification posture).
- **Cluster D — test-flake fix** (Item 6): `sdk/src/vcs/__tests__/jj-reap.test.ts` only. One micro-plan, lowest priority per todo.

The roadmapper should expect Items 2 + 3 + 4 to share a phase (`vcs.*` surface adds), Items 1 + 5 to share a phase (CI tooling adds), and Item 6 to be a standalone micro-plan that can drop into any wave.

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Existing-stack reuse map (all 6 items) | HIGH | Every cited file:line verified to exist via Read/Bash; no claims made from training data alone. |
| AbortController native on Node 22 | HIGH | Live `node -e` probe at runtime confirmed. |
| `spawnSync` lacks signal support | HIGH | Node.js official docs fetched and verified. |
| jj 0.41 alphabet disjointness | HIGH | Empirical probe test exists at `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts`; user already has the binary. |
| `tests/` uses `node:test` exclusively | HIGH | Verified `scripts/run-tests.cjs:14-18` + `tests/inventory-counts.test.cjs:19-21`. |
| vitest 4.1.7 is current upstream | MEDIUM | npm registry fetch confirmed; semver-major upgrade out of v1.4 scope explicitly. |
| `tests/architecture-counts.test.cjs` and `command-count-sync.test.cjs` do not yet exist | HIGH | `ls` returned "No such file or directory" for both. They are referenced as future surfaces at `docs/INVENTORY.md:9`. |

---

## Open Questions (for requirements-author, NOT v1.4 stack)

- For Item 4 (`idAlphabet`): the field type — string literal (`'k-z'`/`'0-9a-f'`) vs. richer object (`{chars: string, regex: RegExp}`) — is an API-design decision, not a stack decision. Stack lens defaults to the smallest surface (bare string).
- For Item 2 (`cancel`): the return-shape (`{cancelled: number, workspaces: string[]}` vs `void`) is API design. Stack lens defers to existing `WorkspaceMergeResult`/`FanInResult` shape conventions (return rich result objects).

---

## File Reference Index (all verified live)

Every code reference in this research is `file_path:line_number` form, verified to exist at research time:

- `.planning/PROJECT.md:13-23,100-112` (project state + v1.4 scope)
- `.planning/MILESTONES.md` (v1.0–v1.3 history)
- `.planning/todos/pending/v14-jj-reap-test-flake.md:1-51`
- `.planning/todos/pending/v14-review-followups.md:1-44`
- `.planning/todos/pending/v14-orphan-jj-workspace-dirs.md`
- `.planning/todos/pending/v14-transition-md-update-gap.md`
- `.planning/todos/pending/v14-docs-verify-only-followups.md`
- `scripts/lint-vcs-no-raw-git.cjs:32-101,114-140`
- `scripts/lint-vcs-no-commit-id.cjs:30-114`
- `scripts/audit-workflow-raw-git.cjs:39-50,60-91,98-130,139-167,231-238`
- `scripts/lib/allowlist-parser.cjs:34-61`
- `scripts/lib/glob-to-regex.cjs` (referenced via allowlist-parser)
- `scripts/run-tests.cjs:14-18`
- `tests/inventory-counts.test.cjs:1-64` (drift-control idiom precedent)
- `tests/scripts/audit-workflow-raw-git.test.cjs:21-50` (Pattern B mkdtemp precedent)
- `sdk/src/vcs/types.ts:336-367` (VcsRefs surface — matchPrefix/idAlphabet insertion point)
- `sdk/src/vcs/types.ts:453-518` (VcsWorkspaceParallel + ParallelDispatchHandle — cancel insertion point)
- `sdk/src/vcs/types.ts:600-610` (Adapter discriminated union)
- `sdk/src/vcs/exec.ts:1-54` (spawnSync-based exec surface)
- `sdk/src/vcs/parse/jj-id.ts:1-70` (boundary-io reverse-resolve helpers)
- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:49-75` (alphabet disjointness probe)
- `sdk/src/vcs/__tests__/jj-reap.test.ts:46-94` (failing flake test location)
- `sdk/src/vcs/jj/parallel.ts:1-100,464` (jj-side cancel teardown reuse target)
- `sdk/src/vcs/git/parallel.ts:163-193,341-393,545-549` (git-side serialization context)
- `sdk/vitest.config.ts:1-27` (project bifurcation)
- `package.json:46-49,65` (Node/pnpm floors, pretest content)
- `sdk/package.json:34-57` (SDK floors)
- `docs/ARCHITECTURE.md:117-184` (drift-prone prose-count locations)
- `docs/INVENTORY.md:7-9` (drift-control test family declaration)
- `get-shit-done/workflows/execute-phase.md:557-561,757-772` (existing `parallel.*` call sites)
- `get-shit-done/workflows/quick.md:677-683,761-772` (existing `parallel.*` call sites)
