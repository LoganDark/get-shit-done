# Pitfalls Research

**Domain:** Unified-revision-model cleanup on dual-backend (git + jj) `VcsAdapter` in TypeScript SDK + CJS-runtime hybrid (GSD jj-port fork)
**Researched:** 2026-05-14
**Confidence:** HIGH (codebase-grounded; jj community + Mercurial Evolve + Sapling prior art consulted)
**Scope qualifier:** This file catalogues mistakes specific to ADDING the v1.2 unified-revision flip to THIS dogfooded codebase. Generic "refactoring is hard" pitfalls are out of scope; every entry is tied to either a concrete file path, a concrete prior incident in this repo's history, or a documented prior-art incident in another VCS-tooling project.

---

## Critical Pitfalls

### Pitfall 1: Silent stable-identity semantic flip (snapshot-stable → rebase-stable)

**What goes wrong:**
A caller stores `LogEntry.hash` (today: `commit_id`, snapshot-stable — never moves) and re-uses it later as a "pointer to this exact tree state." After the v1.2 flip the same field returns `change_id` (rebase-stable — moves with rewrites; tracks "the same change" not "the same snapshot"). Code that treated the stored id as an immutable snapshot identity now silently dereferences the *current head of an evolving change*, which can be a different tree, a different parent, or in the divergent-change case (jj allows two visible commits with the same change_id) an *ambiguity error* at lookup time rather than a silent miss.

The trap is asymmetric: on git the semantics are unchanged (commit_id is the only id), so all parameterized tests pass on git. On jj, the rebased-out-from-under-the-stored-id scenario only manifests when something rewrites between store and re-use — exactly the kind of timing-dependent bug that escapes unit tests and surfaces in real workflows (e.g. parallel agent dispatch, mid-phase rebase, hotfix-on-top).

**Why it happens:**
- The two ids look syntactically interchangeable in TypeScript (`string`). The compiler enforces no distinction.
- `LogEntry.hash` field name (carrying "hash" semantic) historically encoded the snapshot-stable expectation; the flip changes the field's meaning without renaming it (per SEED-001, the rename is *optional* in the seed proposal).
- The stable-id distinction is invisible at the call site — it's a property of *what the caller does later* with the id, not of the call itself.
- Real-world prior-art evidence: Gerrit's Change-Id has the same semantic split; the jj↔Gerrit integration design doc explicitly calls out that "the merged commits from the GH PR do not include any trailing Change-Id… [causing] tracking issues when rebasing." That is the same class of bug, externalised.

**How to avoid:**
- **Audit-first before flip** (already in the v1.2 plan): the audit phase MUST classify every `.hash` / `commit_id` reachable read site as one of `{snapshot-needed, rebase-stable-needed, indifferent}`. Output: `.planning/intel/id-namespace-audit.md` (per PROJECT.md Active scope).
- **Rename `LogEntry.hash`** (SEED-001 Task 3 suggests this). Either `id` (with prominent `// rebase-stable on jj, snapshot-stable on git`) or split into `LogEntry.changeId` / `LogEntry.commitId`. Renaming forces every call-site to be re-considered at compile time — a free audit pass.
- **Brand the type** at the TS level: `type Revision = string & { readonly __brand: 'Revision' }`. Cheap, catches `entries[0].hash === storedSha` mismatches when storedSha is an unbranded string.
- **Runtime guard at the boundary** for cross-time storage: if a caller stores an id in `.planning/` or in a manifest that survives across rebase windows, document the storage-stability requirement in the schema (e.g. `STATE.md` bookkeeping fields).

**Warning signs:**
- A test that "works on git, flakes on jj only after a rebase happens between two assertions"
- `jj log -r <stored-id>` returning a *different* tree than the original store time (silent for tools that don't compare trees)
- jj error: "ambiguous change id" or "no such change" when looking up a previously valid stored id (divergent-change fork case)
- Mismatched diffs between two captures of "the same change" across rebase

**Phase to address:**
Audit phase (Task 1 per SEED-001 Phase shape). Verification: every `LogEntry.hash` consumer in the audit doc has a written rationale `{snapshot|rebase|indifferent}`.

---

### Pitfall 2: Hex-prefix matching silently always-misses against change_id alphabet

**What goes wrong:**
Code that does `id.startsWith(prefix)` with a hex prefix (or `id.match(/^[0-9a-f]+/)`, or implicit substring comparison against a known-hex constant) silently returns `false` on jj after the flip. The change_id alphabet is `[k-z]` — the 16-letter reverse-base32 set per jj 0.41 (per `sdk/src/vcs/format-migration/rewrite.ts:63` and confirmed by Plan 06-01 A1 probe: "alphabet is disjoint from `[0-9a-f]` — there is zero risk of jj_CID matching a hex SHA"). After the flip, every hex-prefix comparison returns `false`/null, not an error. *No exception is thrown.* The failure is silent.

This is the most dangerous failure mode in the v1.2 flip because:
1. Tests that *check the prefix matches* will fail loudly on jj (good)
2. Tests that *check the prefix is unique* or *check `not.toMatch`* will pass deceptively (bad — coverage holes)
3. Production code that treats "no match" as a not-found case will quietly fall through to a no-op, a default, or a "create new" branch

Concrete example from this repo: `sdk/src/query/verify.ts:683` does `(e.hash || '').slice(0, 7)` — this is a *display* slice, harmless. But `sdk/src/query/log.ts:72` does `expr.rev(entries[n].hash)` — which is a *reuse*, and `expr.rev` validates shape and rejects non-hex non-jj-alphabet strings at runtime (see `sdk/src/vcs/expr.ts:92`: "expr.rev: not a hex-SHA or change-id shaped string"). After the flip, an old jj LogEntry-hash-as-hex assumption would either be silently re-shaped (if `expr.rev` widens) or throw at the wrong stack-frame.

**Why it happens:**
- Hex prefixes are *visually* indistinguishable from short jj prefixes until you look at the alphabet — `abc1234` is unambiguously hex; `xyznopr` is unambiguously change_id; but a developer reading code sees only "id-shaped string."
- Many tests use literal hex prefixes pasted from a baseline run; after the flip the literals are wrong-alphabet but compile + run.
- The jj community has already encountered the related class: prefix-uniqueness assumptions break on divergent changes (jj issue #2476: "`jj log -r <change id prefix>` can miss some commits in divergent change"). The takeaway: prefix lookup against change_ids is *strictly less reliable* than against commit_ids even when the alphabet is correct.

**How to avoid:**
- **Lint guard pattern** (extend `lint-vcs-no-raw-git`'s default-deny to a parallel `lint-vcs-no-hex-id-shape`): scan for the regex `/[0-9a-f]{7,40}/` inside string literals AND template literals reachable from jj-routed code paths. False positives (commit URLs, fixture hex constants in *git-only* fixtures) go in an annotated allowlist.
- **Boundary-only hex assumptions:** any code that intentionally needs hex must route through `vcs.jjOnly.commitIdOf(rev)` (the SEED-001 escape hatch — but kept private/audited per PROJECT.md "no escape hatch on cross-backend surface").
- **Test coverage:** add a parameterized test that asserts `LogEntry.hash` does NOT match `/^[0-9a-f]/` on jj (positive assertion of the new shape), placed in the contract suite at `sdk/src/vcs/__tests__/adapter-contract.test.ts`. Cheap, catches regressions.
- **Audit pass for slice/substring-of-id literals:** `grep -n "\.slice(0, 7)\|\.slice(0, 8)\|\.slice(0, 12)" sdk/src` — every match against an id-bearing field needs a per-call decision (display vs reuse).

**Warning signs:**
- New jj test failures clustered in code that previously passed git
- "No commit found" / "no match" log lines appearing on jj where git-side returns a result
- `expr.rev(...)` throws in stack frames downstream of `LogEntry.hash` consumers
- `if (id.startsWith(prefix))` branches that *never enter the true arm* on jj (silent — no error, just dead code on one backend)

**Phase to address:**
Audit phase (find them) + flip phase (fix them) + lint phase (prevent regression).

---

### Pitfall 3: Cross-backend test-equality over-broad relaxation hides regressions

**What goes wrong:**
Plan 02 of Phase 7 already hit this: a parameterized test had `expect(workspace.merge.result).toEqual(bookmarks.list().rev)` and had to relax to *presence-only* (`expect(rev).toBeTruthy()`) because the two values are in different namespaces. The relaxation is correct in isolation, but the *pattern* — "I'll just check it's truthy" — propagated through several test files in v1.1 (per `07-02-SUMMARY.md` Deviations §2). After v1.2 there will be *more* such mismatches during the migration window: callers that previously matched on git will diverge from jj by id-shape, even when the underlying *meaning* still matches.

The trap: a presence-only assertion catches "the field exists" but misses "the field points to the right commit." A test that's relaxed to `expect(rev).toBeTruthy()` will pass even if the implementation returns `'placeholder-id'` or a stale value.

**Why it happens:**
- Path-of-least-resistance during test-suite triage when a parameterized test fails on one backend.
- Real architectural divergence (genuinely different namespaces) makes strict equality wrong, but the relaxation overshoots by losing the *referential* check, not just the *shape* check.
- v1.1 Plan 05 ("strict-green") shipped *despite* this gap because the relaxation was noted in the deviation log but not fixed.

**How to avoid:**
- **Resolve at the boundary** for cross-backend comparisons: when comparing a `change_id`-flavoured value against a `commit_id`-flavoured value across backends in a test, route both through `vcs.refs.resolveTo({ kind: 'change' | 'commit' })` (or equivalent normalization) and assert on the normalized form. This recovers referential equality.
- **Per-backend expected fixtures:** for tests where the id-shape genuinely differs and that's the point, store per-backend baselines (`__fixtures__/git/` vs `__fixtures__/jj/`) rather than a single golden.
- **Id-shape-agnostic matchers:** custom vitest matcher `expect(rev).toBeRevisionOf(expectedCommit)` that resolves both sides via the adapter and compares semantically. One central implementation, used everywhere.
- **Forbid bare `.toBeTruthy()` on id-bearing fields** in CI: a lint pattern that flags `expect(...rev|...hash|...id).toBeTruthy()` and requires either an annotated waiver or a richer matcher. Mirrors the `lint-vcs-no-raw-git` discipline.
- **Track the deviation list** explicitly: every relaxation made during the v1.2 phase goes into a single LEARNINGS-style table; close-gate requires every entry to be either fixed or have a written justification.

**Warning signs:**
- Tests that pass on both backends but assert nothing meaningful (visual review of `expect()` calls in changed test files)
- The number of `toBeTruthy()` calls in `__tests__/*` increasing without a corresponding decrease in `toEqual()` calls
- Rising count of "deviation: relaxed assertion" notes in plan SUMMARY.md files

**Phase to address:**
Test-migration phase (write the matchers/fixtures up-front, before flipping production code).

---

### Pitfall 4: External-link emission boundary leak (escape-hatch contagion)

**What goes wrong:**
GitHub URLs require commit_id (`github.com/owner/repo/commit/<sha>`) — the canonical example is `scripts/changeset/github-release-notes.cjs:154` which builds `https://github.com/${normalizedSlug}/compare/${fromRef}...${toRef}`. After the flip, the cross-backend adapter no longer volunteers commit_id on jj; the link emitter must use the v1.2 boundary-I/O accessor (the `vcs.jjOnly.commitIdOf(rev)` of SEED-001, *re-scoped per PROJECT.md as a backend-private accessor*).

The trap: once the accessor exists, *other* callers ask for one. "Just for the GitHub URL case" becomes "and also for the cache-key case" becomes "and also for this ad-hoc display case." Each new use-site weakens the architectural invariant ("workflows must not branch on `vcs.kind` for id reasons" — PROJECT.md Key Decisions). In TypeScript/Node modules this contagion is especially hard to bound because:
1. **Re-exports:** an internal accessor exported from `vcs/jj/internal.ts` becomes accessible by anyone who `import { commitIdOf } from '../vcs/jj/internal.js'` — no compile error, no lint flag, just an architectural smell that's invisible to grep.
2. **Transitive imports:** workflow code rarely imports from `vcs/jj/*` directly today, but a helper module added to `vcs/util/*` *can* import from `vcs/jj/*` and then *that* helper gets imported by workflow code. Two import hops bypass any "don't import from jj/" rule that scans direct imports only.
3. **Dynamic require:** `require(\`./vcs/${kind}/internal\`)` defeats static analysis entirely (already used elsewhere in the SDK for backend selection — `sdk/src/vcs/backends.ts`).

**Why it happens:**
- Any escape hatch in a tightly-disciplined codebase becomes attractive precisely *because* it solves a hard problem cleanly. Other hard problems get rerouted through it.
- TypeScript module visibility is module-scoped, not architectural-layer-scoped. There is no built-in "this export is only consumable by sibling modules" mechanism.
- Prior art from this codebase's own history: the `vcs.gitOnly` namespace introduced in Phase 2.1 is the cautionary example — it was meant for one or two narrow needs and grew. PROJECT.md still notes the orchestrator parallelization gap is "the only acknowledged exception" for raw-git, but `gitOnly` itself has 4+ documented narrow uses already (`sdk/src/vcs/types.ts:433`, `:441`, `:457`, etc.).

**How to avoid:**
- **Single-callsite invariant:** the boundary-I/O accessor has *exactly one* import in the entire repo (the GitHub link emitter). Enforced by lint: count occurrences of the import; CI fails if > 1.
- **Per-callsite justification with PR-blocking review:** every new caller that wants the accessor must add an entry to a tracked allowlist with a written rationale; the lint guard fails CI if a new entry is added without a code-owner approval. Mirrors the `scripts/lint-vcs-no-raw-git.allow.json` discipline (per the `$comment` field in that file: "Phase 2 will REMOVE bin/lib/*.cjs entries as each call site migrates to the adapter" — the allowlist is *append-rare, remove-aggressive*).
- **Prefer alternatives that skip the problem:** SEED-001 explicitly suggests using *tag/release URLs* instead of commit URLs where possible (release URLs accept tag names, not commit ids — no namespace problem). PROJECT.md Active scope echoes: "prefer tag/release URLs to skip the problem."
- **Module-private export pattern:** keep the accessor as a *non-public* export — i.e. not in any `index.ts` barrel re-export. Importers must use a deep path (`from '../vcs/backends/jj-internal-commit-id.js'`) which is itself a code-review red flag. Pair with an ESLint `no-restricted-imports` rule listing the deep path as restricted-with-allowlist.
- **No dynamic-require escape hatch:** the boundary accessor is statically imported only. Lint rule: forbid `require(...vcs/jj...)` and `import(...vcs/jj...)` dynamic forms anywhere outside the backend factory.

**Warning signs:**
- A second PR proposing to use the boundary accessor (the *first* "let's add one more case")
- A new `vcs/util/` helper that imports the accessor (transitive-import hop)
- Discussion in PR review that includes the phrase "we already have an escape for X, can we just"

**Phase to address:**
Flip phase (introduce the accessor + the single-callsite invariant simultaneously) + lint phase (encode the invariant).

---

### Pitfall 5: Mid-phase `.planning/` cutover writes mixed-shape ids

**What goes wrong:**
The v1.2 phase dogfoods on this very repo's own `.planning/` directory. As the surface flip lands mid-phase, in-flight `.planning/` files written *before* the flip encode commit_id-shape ids (40-char hex on jj); files written *after* the flip encode change_id-shape ids (12-char `[k-z]`). The result: `STATE.md`, `SUMMARY.md`, `CONTEXT.md` files inside the v1.2 phase directory itself contain ids in *both* shapes, and the rewriter at `sdk/src/vcs/format-migration/rewrite.ts` may or may not handle the mixed state cleanly depending on the direction it's run in.

Specific failure modes:
- B-07's rewriter (`rewrite.ts`) rewrites *eligible zones* (backtick spans + YAML frontmatter on allowlisted keys per `COMMIT_KEY_ALLOWLIST`); a mid-phase rewrite of the v1.2 phase directory's own files may rewrite ids that were *just-written* by the in-flight phase as `commit_id` → `change_id`, but the original commit may no longer exist as a `commit_id` on jj after a rewrite (working-copy snapshot timing).
- The rewriter's `kind='ancestor'` branch emits `<targetId> + [was sha:<orig>]` annotations; mid-phase running of the rewriter will sprinkle these across files that workflow code is *currently editing*, causing merge-style conflicts when the agent re-saves.

**Why it happens:**
- Dogfooded migrations don't have the luxury of a quiescent target — the migration is happening *to* files that are being actively appended to.
- The rewriter is pure (per `rewrite.ts:1` "NO I/O"), but the *invocation* (via `run.ts`) is not. Running the rewriter mid-phase touches files; touching files invalidates assumptions made by in-flight workflow code.
- B-07 (Phase 6) was a *one-time* migration on a quiescent target and didn't need to handle this; v1.2 needs a different cutover model.

**How to avoid:**
- **Phase boundary marker (recommended):** the v1.2 phase commits its own files in *commit_id shape* (the pre-flip shape) for the entire duration of the phase. The rewriter pass runs *exactly once* at phase close, as part of the close-gate, against the entire `.planning/phases/<v1.2>/` directory. No mid-phase rewrites.
- **Frontmatter pin:** add `id_shape_at_write: commit_id` (or `change_id`) to the frontmatter of every file written during the v1.2 phase. The rewriter consults this pin to know which direction to migrate, avoiding ambiguity (currently the rewriter relies on alphabet disjointness — safe but loses provenance).
- **Pre-flip dump:** before the flip lands, capture a snapshot of every `commit_id` reachable via the adapter into a sidecar file (`.planning/phases/<v1.2>/pre-flip-id-snapshot.json`) so post-flip rewrites have an authoritative lookup table even if the working-copy rewrites have moved things around.
- **Idempotency invariant test:** the rewriter's CONTEXT D-04.2 invariant ("when content contains no source-shape tokens IN ELIGIBLE ZONES, the output is byte-identical to input") is the safety net — verify it holds for the v1.2 phase directory specifically before running the close-gate rewrite.

**Prior art:**
This repo's own Phase 6 B-07 is the closest prior art (planning-file SHA→change_id rewriter). The model worked because Phase 6 wasn't dogfooded *on the rewriter itself*. v1.2 IS dogfooded on the surface flip — different problem.

**Warning signs:**
- v1.2 phase directory contains ids in both shapes mid-phase (visible in `git diff` review)
- The rewriter's orphan output (`Orphan[]` per `format-migration/types.ts`) growing during mid-phase runs
- Workflow re-saves clobber rewriter annotations (i.e. `[was sha:...]` markers disappear)

**Phase to address:**
Migration phase (close-gate-only rewriter pass) + phase-shape design (decide pin-or-snapshot before phase opens).

---

### Pitfall 6: Markdown / prose hex leaks survive lint (lint scans code, not prose)

**What goes wrong:**
Workflow `.md` files in `.planning/`, `get-shit-done/workflows/*.md`, and `commands/*.md` embed example ids in prose ("e.g. commit `abc1234`") and in fenced code blocks (`$ git log abc1234`). The B-07 rewriter explicitly *does not* touch fenced code blocks or free-form prose (per `rewrite.ts:30-33`: "Prose paragraphs (even with whitespace-delimited hex-looking words…) and Fenced code blocks ``` ... ```… are non-eligible by construction"). After the v1.2 flip, agent prompts and runbooks that still have hex-shape examples will either:
1. *Mislead the agent* into expecting hex-shape output from `LogEntry.hash`, prompting hex-prefix matching code that fails per Pitfall 2, or
2. *Fall stale* — the example still works on git but is never re-run on jj because the example assumes hex.

The lint guard `scripts/lint-vcs-no-raw-git.cjs` skips markdown by default (`SCAN_EXT = /\.(cjs|js|mjs|ts|yml|yaml|sh|bash)$/` — note: no `.md`), and the allowlist explicitly lists `docs/**` and `.planning/**` as blanket-allowed (per `lint-vcs-no-raw-git.allow.json` globs). So *prose-shape drift* is invisible to the existing tooling.

**Why it happens:**
- Markdown linting is harder than code linting (false positives are 10x more common — every "I gave it the SHA `aabbccdd`" sentence in a writeup is potentially a flag).
- The B-07 rewriter's deliberately conservative scope (eligible zones only) is correct for *content migration* but leaves *prose drift* unfixed.
- Workflows and commands evolve faster than docs; nobody routinely re-reads command markdown for stale examples.

**How to avoid:**
- **Prose-aware lint pass** (separate tool, not the same lint guard): a markdown scanner that flags hex-shape strings *only* in workflow/command markdown (not in `.planning/phases/*/SUMMARY.md` historical artifacts where hex was correct at write time). Allowlist by *file path*, not by *zone*.
- **Date-based suppression:** any `.md` file whose hex examples predate the v1.2 flip date is grandfathered (with a tag in a sidecar file); only post-flip additions are scrutinised.
- **Examples as fixtures:** workflow markdown that contains example output blocks should reference fixture files (`<!-- @example-from: fixtures/log-output-jj.txt -->`), not embedded examples. The fixtures are regenerated against the live adapter periodically; drift becomes a fixture diff, not a prose archaeology problem.
- **Search baseline at phase close:** at v1.2 close-gate, run `grep -E '[0-9a-f]{7,40}' get-shit-done/workflows/*.md commands/*.md` and require every hit to be either justified (in a per-file checklist) or migrated to a non-hex example.

**Prior art:**
Phase 6 B-07 explicitly carved out prose from the rewriter scope; this is the *known* gap. The v1.2 flip is the first time the gap matters because pre-v1.2 the prose-shape and live-shape *agreed*.

**Warning signs:**
- Agent runs that produce hex-prefix-matching code on jj despite the production code being clean (the agent is reading stale docs)
- Workflow `.md` files modified post-flip that still contain `[0-9a-f]{7,40}` — visible in diff

**Phase to address:**
Lint phase (separate prose-lint tool) + close-gate sweep.

---

### Pitfall 7: Lint guard rollout — allowlist becomes write-only

**What goes wrong:**
The new `lint-vcs-no-commit-id` guard (parallel to `lint-vcs-no-raw-git`) lands with an initial allowlist sized to the audit results. Without process discipline, the allowlist grows monotonically: every PR that hits a new `commit_id` reference adds an entry "to unblock CI"; entries are added without justification; nobody removes entries. Within 6 months the allowlist is a list of "places where this rule doesn't apply" — i.e. the rule has been hollowed out to a slogan.

Common-mistake taxonomy specific to this codebase:
1. **Too-narrow regex** — e.g. catches `commit_id` symbol but misses `'commit_id'` inside template literals, `${"commit_id"}`, or jj template strings like `'commit_id ++ "\\n"'` (which appear at `sdk/src/vcs/backends/jj.ts:225,946,965,978` and are exactly the leak surface to lint against).
2. **Too-broad allowlist** — every test file gets blanket-added (the existing allowlist already does this with `sdk/src/vcs/__tests__/**` glob, which is appropriate for *raw-git* but is *too broad* for *commit_id* because tests should also be id-namespace-disciplined).
3. **No per-entry justification** — the existing `lint-vcs-no-raw-git.allow.json` has only top-level `$comment` fields explaining categories of entries, not per-entry rationale. Re-using this shape for commit_id allowlist will reproduce the gap.
4. **No CI gate on allowlist additions** — adding a file to the JSON requires no special review. CI doesn't distinguish "PR that adds an allowlist entry" from "PR that doesn't."
5. **No removal pressure** — entries persist after the underlying issue is fixed. Existing `$comment_2_1_09` field in the current allowlist documents one removal sweep; that's the *only* removal sweep recorded.

**Why it happens:**
- Allowlists are dependency-direction reversed: the rule depends on the allowlist (what to skip), not vice versa. So expanding the allowlist *weakens* the rule, but the lint output looks identical (still 0 violations).
- "Just unblock CI" pressure is real and routine; per-entry justification is a high-friction process that gets bypassed.
- The lint guard is itself code; reviewers focus on the *rule* and not the *allowlist diff*.

**How to avoid:**
- **Per-entry schema with required `reason` and `expires` fields:**
  ```json
  { "path": "sdk/src/vcs/backends/jj.ts", "reason": "internal commit_id template — boundary-only use", "expires": "2026-12-31", "owner": "@LoganDark" }
  ```
  CI rejects entries without these fields. Expired entries fail CI (forcing re-justification or removal).
- **CI label/path-filter for allowlist diffs:** any PR that modifies `lint-vcs-no-commit-id.allow.json` requires a special label (`allowlist-change`) which triggers an additional human review gate. Prior art: GitHub's own `CODEOWNERS` per-path requirement.
- **Deny by template-literal-aware regex:** the regex must match `commit_id` as both a bare identifier AND inside string/template literals AND inside jj-template strings (the `'commit_id ++ ...'` pattern). Test the regex against the known-leak sites in jj.ts as fixtures.
- **Removal-pressure mechanism:** quarterly automated PR (or close-gate of every milestone) that lists allowlist entries unchanged for >90 days and asks the owner to either re-justify or remove. Prior art: this repo's own `$comment_2_1_09` style of recording removal sweeps in the JSON itself.
- **Differentiate test allowlist from production allowlist:** two separate JSONs (`...allow-prod.json`, `...allow-test.json`); test allowlist can be coarser (glob-based) but production must be file-specific. Mirrors the production-vs-test distinction `lint-vcs-no-raw-git` *implicitly* makes via globs vs files.

**Warning signs:**
- Allowlist file growing in monthly diff
- New entries added in the same PR that triggers them (no separate "audit + add to allowlist" PR step)
- Allowlist entries with no per-entry comment

**Phase to address:**
Lint phase (design the allowlist schema before adding the first entry).

---

### Pitfall 8: `expr.commit(sha)` rename — silent semantic widening + fixture rot

**What goes wrong:**
Per SEED-001 Task 3 and PROJECT.md Active scope: `expr.commit(sha)` deprecates in favour of `expr.rev(id)` (canonical factory). Common mistakes:

1. **Silent semantic shift via input domain widening:** `expr.commit(sha)` historically required hex-SHA input; `expr.rev(id)` per `sdk/src/vcs/expr.ts:92` accepts both `'hex-SHA or change-id shaped string'`. A caller that switches `expr.commit(sha)` → `expr.rev(sha)` *and* later passes a non-SHA value (e.g. a bookmark name, a tag) will hit the runtime validator only on the wider-domain input. The deprecation seems mechanical but the input contract changes.
2. **Test fixtures hard-coded to `expr.commit`:** fixtures and snapshots that reference `expr.commit(...)` in their expected-call traces will silently pass after a deprecation alias (because the alias still works) but never exercise the new factory. The codebase has many of these (per `expr.test.ts` at line 96, the rename was *partially* done in 2.1-01 already; remnants likely linger).
3. **Deprecation aliasing masks the rename in stack traces:** if `expr.commit = expr.rev` (alias-style deprecation), errors thrown from inside the factory show `expr.rev` in the stack but the *call site* says `expr.commit`. Debuggers and grep-based archaeology get confused.
4. **TypeScript declaration files in `dist-cjs/`** (see git status: 9 modified `dist-cjs/vcs/*.d.ts.map` files in the working tree right now): generated `.d.ts` files that still export the old name make downstream consumers (the `.cjs` runtime; external tooling that imports from `dist-cjs/`) silently keep using the old name. Grep on `src/` will look clean while `dist-cjs/` keeps the symbol alive.

**Why it happens:**
- Deprecation aliases are the path of least resistance and seem polite; they preserve backwards compat at the cost of architectural clarity.
- The Phase 2.1 rename (per `expr.test.ts:96` comment) already happened *partially* — there's a precedent in the repo of "rename done but not finished" for exactly this symbol.
- Hybrid TS-source + CJS-runtime build means symbols can persist in build artifacts (`dist-cjs/`) even after src removal — there's an extra layer to clean.

**How to avoid:**
- **Hard-rename, no alias:** delete `expr.commit` outright in the same commit that introduces the rename. Compile errors at every call site are *desired* — they're the audit pass.
- **Codemod the call sites in the same PR:** ts-morph or jscodeshift script to mechanically rewrite `expr.commit(x)` → `expr.rev(x)` across all `.ts` files. Single PR, single review surface.
- **Verify dist-cjs** rebuild + clean: explicit `rm -rf dist-cjs && pnpm build && grep -r 'expr\.commit' dist-cjs/` should return zero matches before merge.
- **Input-domain test:** add a *negative* test that `expr.rev` *is now* the only entry point — `expect(expr.commit).toBeUndefined()` style. Prevents accidental re-introduction.
- **No `@deprecated` JSDoc tag-only deprecation:** the tag is a documentation contract, not a runtime gate. If the symbol has to live for one release, gate it on a runtime assertion (`throw new Error('removed; use expr.rev')`) — NOT on a no-op or alias.

**Warning signs:**
- Stack traces mentioning `expr.commit` in code that "was migrated"
- `dist-cjs/` containing `expr.commit` after `src/` doesn't
- New PRs introducing `expr.commit(...)` calls (autocomplete or muscle memory; the fix is to delete the symbol so autocomplete stops offering it)

**Phase to address:**
Flip phase (do the rename in one mechanical pass; codemod + delete).

---

### Pitfall 9: Boundary-I/O exception bloat (covered jointly with Pitfall 4)

See Pitfall 4 for the architectural prevention. Stand-alone summary: the `vcs.jjOnly.commitIdOf` accessor (or whatever its v1.2 final name is) **must** be a single-callsite invariant enforced by lint, with PR-blocking review on every new caller. The escape hatch is the highest-leverage architectural risk in the v1.2 surface design.

---

### Pitfall 10: Performance traps — audit, lint, and per-test branching costs

**What goes wrong:**

**A) Audit phase cost (LOW concern):** Brute-force `grep`/`rg` scan over `sdk/src` + `get-shit-done/bin/lib` + `scripts` is fast (<5s for this repo size). Use `node:fs` + a streaming line-reader if you want a structured output; using ts-morph to do AST-aware scanning is *correct* (catches `commit_id` in template literals AND in JSDoc comments) but ~30-60s for a full repo scan. Tradeoff: AST scan once at audit time is cheap, AST scan in CI per-PR is *not*.

**B) Lint guard CI cost (MEDIUM concern):** The existing `lint-vcs-no-raw-git.cjs` is regex-based and fast. Extending to commit_id detection at the same regex layer is also fast (<2s). Risk: if the new lint moves to AST analysis to catch template-literal cases, CI time can grow noticeably (vitest already dominates CI time per `project_test_perf_pain_vitest`; lint additions are perceptible).

**C) Per-test fixture-id-shape branching (MEDIUM concern):** If parameterized tests grow `if (vcs.kind === 'jj') { expect(...) } else { expect(...) }` branches at every id-equality assertion, three failure modes appear:
1. **Test-runtime cost:** branching itself is free, but separate fixture loads per backend can add measurable I/O (already a vitest-suite pain point).
2. **Duplicated assertion logic:** drift between the branches (per Pitfall 3 — over-broad relaxation hides regressions).
3. **Test-harness complexity:** the existing `vcs-fixture.ts` and `__tests__/adapter-contract.test.ts` already manage backend-aware dispatch; adding id-shape branching at every assertion bloats per-test setup.

**D) Runtime guard cost (LOW concern):** A type-brand at the TS layer (per Pitfall 1 prevention) is zero-runtime-cost. A runtime assertion at the boundary accessor (e.g. `commitIdOf` validates input is a known-good rev before resolving) costs one regex test per call — negligible.

**Why it happens:**
- Performance regressions in CI / test suites are death-by-1000-cuts; each individual addition is "negligible" but accumulates.
- This repo specifically has known vitest-perf pain (per `project_test_perf_pain_vitest`); v1.2 should not add to it.
- Audit phase has no perf budget at all (it's a one-shot intel run, not part of CI).

**How to avoid:**
- **Audit:** AST-aware scan ONCE during the audit phase; emit `.planning/intel/id-namespace-audit.md` + a JSON sidecar that the lint guard *consumes* as its initial allowlist. After audit, lint stays regex-only.
- **Lint:** stay regex-based for production CI. AST audit is dev-only / phase-only. Pair with the per-entry allowlist schema (Pitfall 7) so the regex is permissive but the allowlist is strict.
- **Per-test branching:** centralize id-shape handling in a custom matcher (`expect(rev).toBeRevisionOf(commit)` per Pitfall 3) instead of inline branches. One implementation, one place to optimize.
- **Measure baseline before and after:** capture CI lint+test time pre-v1.2 as a phase-open artifact; close-gate compares. Prior art: `.planning/phases/03.1-…` baseline harness pattern (per `feedback_baseline_is_correctness_not_perf` memory — though that one was correctness-focused, the same harness shape applies for perf).

**Warning signs:**
- CI time creeping up post-v1.2 lint addition
- New tests adding inline `if (vcs.kind === ...)` branches at assertion sites (refactor into matcher)
- Audit script being added to pre-commit by mistake (it's phase-only)

**Phase to address:**
Audit phase (one-shot AST run) + lint phase (regex-based for CI) + close-gate (perf delta check).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Deprecation alias `expr.commit = expr.rev` instead of hard rename | No CI breakage during PR | Symbol persists in `dist-cjs/`, autocomplete keeps offering it, prose docs stay stale | **Never** for v1.2 — hard rename + codemod (Pitfall 8) |
| `expect(rev).toBeTruthy()` instead of normalised cross-backend comparison | Test passes immediately | Tests pass but assert nothing meaningful (Pitfall 3) | Only when paired with a tracked deviation table entry that lists a fix-by date |
| Adding files to lint allowlist without per-entry justification | PR unblocked | Allowlist becomes write-only; rule hollowed out (Pitfall 7) | **Never** — schema requires `reason` + `expires` fields |
| Shipping `vcs.jjOnly.commitIdOf` as a public verb (not backend-private) | Solves the link-emit case cleanly | Other callers gravitate to it (Pitfall 4) | **Never** for cross-backend exposure; backend-private only |
| Letting v1.2 phase directory contain mixed-shape ids mid-phase | No need to design the cutover up front | Rewriter clobbers in-flight files; provenance lost (Pitfall 5) | Only with explicit `id_shape_at_write` frontmatter pin |
| Skipping prose lint because "examples don't matter" | Saves writing the markdown scanner | Agents read stale docs and produce wrong-shape code (Pitfall 6) | Only for grandfathered pre-flip files |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub commit URLs | Using `vcs.refs.resolveShort()` → emits change_id post-flip → URL 404s | Route through boundary-I/O accessor (`vcs.jjOnly.commitIdOf`) OR prefer release-tag URLs (PROJECT.md Active scope guidance) |
| GitHub release notes (`scripts/changeset/github-release-notes.cjs`) | Using `expr.rev(refname)` for tag/branch names (rejected per Plan 04 Phase 7 deviation) | `expr.bookmark(name)` for refnames; `expr.rev(id)` only for SHA/change_id-shaped strings |
| Pre-commit hook id capture (A3 colocated gap, deferred) | Storing `commit_id` from a pre-commit hook context that fires post-squash | Use `change_id` — pre-commit fires before the commit_id is final (jj squash semantics); change_id is stable across the squash |
| `jj log -r <change_id_prefix>` lookups in workflow code | Assuming prefix uniqueness; jj has divergent-change ambiguity (jj issue #2476) | Always pass full change_id from a controlled source; never construct a prefix in workflow code |
| Cross-backend manifest schema (e.g. WAVE-01's manifest) | Fields named `commit` or `sha` carrying change_id post-flip | Rename to `rev` with a documented "active backend canonical id" semantic; mirror Phase 7 D-05 mergeBase precedent |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| AST-based lint in CI per-PR | CI lint step time growing 30-60s | Keep lint regex-based; AST is audit-phase-only | Any repo where lint runs every PR + repo grows past ~50k LOC |
| Inline `if (vcs.kind === 'jj')` branches at every test assertion | Per-test setup cost grows; assertion logic drift | Centralize in custom vitest matcher | Once parameterized test count exceeds ~50 with id-bearing assertions |
| Per-backend fixture I/O on every test run | Vitest-suite time grows (already this repo's pain point) | Single fixture file with backend-keyed data; load once per suite | Once fixture file count exceeds suite count |
| Audit AST scan in pre-commit hook | Slow commits | Audit is phase-only artifact; never wire to pre-commit | Always (audit is not CI/hook material) |
| Boundary-I/O accessor doing full `jj show` per call | Slow link emission for release notes (N commits = N jj invocations) | Batch resolution: one `jj log -r 'commits'` call returning a map | Once release notes span >20 commits |

---

## Security Mistakes

(Lower priority for this milestone — no crypto/secrets surface added — but worth recording.)

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging full change_id in error messages without truncation | Change_ids reveal divergent-change relationships in shared logs (information leak in multi-tenant setups; not relevant for solo-dev but worth noting) | Truncate to short form (8 chars) in logs; full form in dev-only paths |
| Trusting user-supplied id strings without `expr.rev` validation | Command injection via crafted id passed to `jj`/`git` invocation | Always route through `expr.rev` factory (already enforced by `expr.ts:92` — verify no bypass added in v1.2) |
| Assuming change_id stability under untrusted rebase | An untrusted upstream rebase could re-write change_id mappings | Out of scope for v1.2 — single-developer repo — but document as future-milestone constraint if multi-contributor mode opens |

---

## UX Pitfalls (Developer UX — there are no end-users here)

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Error messages that say "invalid revision" without showing the input shape | Developer can't tell if it's a hex/change_id/refname mismatch | Echo the input + the expected alphabet pattern in the error |
| Renaming `LogEntry.hash` → `LogEntry.id` without a deprecation window | Every external consumer (the CJS runtime, scripts/) breaks at once | Either accept the breakage (single-developer repo, fast turnaround) OR provide one release of dual-field emission with a typed-deprecation flag |
| Audit doc (`.planning/intel/id-namespace-audit.md`) without a verdict-per-entry | Reader has to re-do the classification work | Each entry: `{site, current shape, post-flip shape, classification, justification}` — copy SEED-001's per-call-site format |
| `vcs.kind === 'jj'` narrowing in workflow code "for id reasons" persisting after v1.2 | The whole point of v1.2 (per PROJECT.md Active: "workflows must not branch on `vcs.kind` for id reasons") is defeated | Audit identifies these; phase deletes them; lint rule prevents re-introduction |

---

## "Looks Done But Isn't" Checklist

- [ ] **Surface flip:** All 7 SEED-001 surfaces flipped — verify by grep for `commit_id ++` and `commit_id.short()` templates in `sdk/src/vcs/backends/jj.ts`; should all be inside the boundary-I/O accessor only
- [ ] **`dist-cjs/` rebuild:** `dist-cjs/vcs/backends/jj.js` recompiled; grep for old `commit_id` templates returns zero hits in the dist artifacts (per Pitfall 8 — generated files lag source)
- [ ] **`expr.commit` deletion:** symbol is undefined at runtime, not just deprecated; no autocomplete suggestions
- [ ] **PITFALL 1 doc updated:** `sdk/src/vcs/backends/jj.ts:327` no longer claims "LogEntry.hash is commit_id NEVER change_id" (per SEED-001 Phase shape Task 5)
- [ ] **`.planning/` v1.2 directory rewriter pass:** ran exactly once at close-gate; idempotency invariant verified by re-running it (second run is byte-identical)
- [ ] **Workflow / command markdown sweep:** post-flip date-range hex grep on `get-shit-done/workflows/*.md` + `commands/*.md` + `agents/*.md` returns zero unjustified hits
- [ ] **Lint allowlist hygiene:** every entry has `reason` + `expires` + `owner`; no entries added in unrelated PRs since the lint landed
- [ ] **Cross-backend test parity:** every previously-relaxed `toBeTruthy()` from v1.1 Plan 02 has been either upgraded to a normalised matcher OR justified in writing
- [ ] **Boundary-I/O accessor single-callsite:** lint reports exactly one importer (the GitHub URL emitter)
- [ ] **No new `vcs.kind === 'jj'` narrowing for id reasons:** count of `vcs.kind === 'jj'` checks in workflow code is *down* relative to v1.1 baseline
- [ ] **Skip-count baseline guard:** no test newly skipped to dodge id-shape pain (per `scripts/check-skip-count.cjs` discipline)
- [ ] **Strict-green on both backends:** matches v1.1 Plan 05 close-gate posture

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Hex-prefix matching silently false (Pitfall 2) | LOW | Grep + audit + fix per-site; no data loss |
| Stable-identity flip caused production wrong-tree dereference (Pitfall 1) | MEDIUM-HIGH | Restore from snapshot via `vcs.jjOnly.commitIdOf` if pre-flip ids preserved; otherwise reconstruct via `jj op log` history |
| `.planning/` mid-phase mixed-shape corruption (Pitfall 5) | MEDIUM | Restore from a pre-flip snapshot in `.planning/phases/<v1.2>/pre-flip-id-snapshot.json`; re-run rewriter from clean state; if no snapshot, walk `jj op log` to recover |
| Lint allowlist bloat (Pitfall 7) | LOW (process), MEDIUM (effort) | Run a removal sweep — for each entry, verify the underlying issue is fixed; if not, re-justify with new expiry; pattern is `$comment_2_1_09` style entry in the JSON |
| Boundary-I/O accessor sprawl (Pitfall 4 / 9) | HIGH | Each new caller must be re-routed to a non-leak path; if the accessor has 5+ callers it's already a parallel namespace and needs an architectural rethink |
| Markdown prose drift (Pitfall 6) | LOW | Date-windowed grep + manual rewrite; pair with fixture-extraction pattern to prevent recurrence |
| Mid-phase test relaxation (Pitfall 3) | MEDIUM | LEARNINGS-style table at phase close; each entry resolved before next milestone opens |

---

## Pitfall-to-Phase Mapping

Suggested phase shape: **Audit → Flip → Migrate → Lint → Close-gate**.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Stable-identity semantic flip | Audit (classify every read site) + Flip (rename `LogEntry.hash` to force compile-error audit) | Audit doc has verdict-per-entry; rename PR triggers compile errors at exactly the audited sites |
| 2 — Hex-prefix silent miss | Audit (find them) + Flip (fix them) + Lint (prevent regression) | Contract test asserts `LogEntry.hash` does NOT match `/^[0-9a-f]/` on jj |
| 3 — Test-equality over-relaxation | Pre-Flip test-prep (write matcher up-front) + Close-gate (deviation table review) | Custom matcher is the only id-equality path in changed tests; deviation table empty or fully justified |
| 4 — External-link boundary leak | Flip (introduce accessor with single-callsite invariant) + Lint (encode invariant) | Lint counts importers; CI fails on >1 |
| 5 — Mid-phase `.planning/` cutover | Phase-shape design (decide pin-or-snapshot before phase opens) + Migrate (close-gate-only rewriter pass) | Idempotency test: re-run rewriter; output is byte-identical |
| 6 — Markdown prose hex leaks | Lint (separate prose-lint tool) + Close-gate (date-windowed grep sweep) | Sweep returns zero unjustified hits in post-flip-date `.md` changes |
| 7 — Lint allowlist hollowing | Lint (design schema with `reason`/`expires`/`owner` before adding first entry) | CI rejects entries without required fields; expired entries fail CI |
| 8 — `expr.commit` rename rot | Flip (hard rename + codemod in single PR, verify `dist-cjs/`) | `grep -r 'expr\.commit' .` returns zero |
| 9 — Boundary accessor sprawl | (Same as Pitfall 4) | Same as Pitfall 4 |
| 10 — Perf traps | Audit (one-shot AST), Lint (regex-only in CI), Close-gate (perf delta check) | CI time delta < 5% vs v1.1 baseline |

---

## Sources

**This codebase (file:line — primary evidence):**
- `sdk/src/vcs/backends/jj.ts:225,327,946,965,978,1083` — the leak surface
- `sdk/src/vcs/format-migration/rewrite.ts:53,63,73-86` — alphabet disjointness probe + COMMIT_KEY_ALLOWLIST + zone-targeting
- `sdk/src/vcs/expr.ts:38,92` — `expr.rev` factory + input-domain validator
- `sdk/src/query/log.ts:72`, `sdk/src/query/verify.ts:683` — current `.hash` consumers
- `scripts/lint-vcs-no-raw-git.cjs:48-69`, `scripts/lint-vcs-no-raw-git.allow.json` — existing lint discipline (model + anti-pattern)
- `scripts/changeset/github-release-notes.cjs:154` — the canonical external-link emission case
- `.planning/seeds/SEED-001-change-id-only-on-jj-adapter-surface.md` — surface inventory and phase shape sketch
- `.planning/MILESTONES.md` v1.1 Plan 02 deviations + Plan 04 deviation — prior-incident evidence for cross-namespace pain and `expr.rev` input-domain widening

**Project memory:**
- `project_planning_id_migration` — B-07 SHA→change_id rewriter precedent
- `project_test_perf_pain_vitest` — vitest perf budget context for Pitfall 10
- `feedback_baseline_is_correctness_not_perf` — close-gate baseline pattern

**External — VCS prior art:**
- [Jujutsu Glossary — change_id vs commit_id semantics](https://docs.jj-vcs.dev/latest/glossary/) — change_id is rebase-stable, commit_id is snapshot-stable
- [Jujutsu Divergent Changes guide](https://docs.jj-vcs.dev/latest/guides/divergence/) — divergent change_id requires `/0` `/1` offset disambiguation; pure-prefix lookup can be ambiguous
- [Jujutsu issue #2476 — `jj log -r <change id prefix>` can miss some commits in divergent change](https://github.com/jj-vcs/jj/issues/2476) — concrete prior incident for prefix-uniqueness assumption breakage
- [Jujutsu Revset language reference](https://jj-vcs.github.io/jj/latest/revsets/) — change_id alphabet `^[k-z]*$`, prefix-non-unique-is-error semantics
- [Jujutsu FAQ — change_id vs commit_id behavior on rewrite](https://jj-vcs.github.io/jj/latest/FAQ/) — "Rewriting a commit results in a new commit ID, but the change ID generally remains the same"
- [Gerrit ↔ Jujutsu integration design doc](https://www.gerritcodereview.com/design-docs/support-jujutsu-use-cases.html) — concrete prior-art incident: "merged commits from the GH PR do not include any trailing Change-Id… [causing] tracking issues when rebasing" (the same class as Pitfall 1)
- [Mercurial ChangesetEvolution](https://www.mercurial-scm.org/wiki/ChangesetEvolution) — obsolescence markers as the hg-equivalent prior art for tracking-rebased-identity
- [Sapling Visibility and mutation](https://sapling-scm.com/docs/dev/internals/visibility-and-mutation/) — Sapling's mutation-record approach as a third prior-art point

**External — lint discipline prior art:**
- [ESLint custom rules — meta.schema for options validation](https://eslint.org/docs/latest/extend/custom-rules) — schema-required option pattern that prevents allowlist write-only rot

---

*Pitfalls research for: GSD jj-port v1.2 unified-revision-model cleanup*
*Researched: 2026-05-14*
