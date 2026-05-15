# Feature Research — v1.2 unified revision model

**Domain:** dual-backend VCS adapter (git + jj 0.41) for a TypeScript SDK + CJS-runtime hybrid
**Researched:** 2026-05-14
**Confidence:** HIGH on industry patterns + per-surface migration table; MEDIUM on optimal anti-feature disposition (deprecate vs. delete vs. flip-rename)

## Scope-anchoring premise

v1.2 is **subsequent** to a fully-shipped dual-backend adapter (v1.0 + v1.1). All structural verbs already exist (`commit`, `log`, `diff`, `status`, `findConflicts`, `refs.{*}`, `workspace.{*}`, `gitOnly.*`). v1.2 does NOT add backend behavior — it refactors the **identity contract** of existing surfaces so that "a revision" has one meaning across backends. The defining premise: workflows must never branch on `vcs.kind` for id reasons; the jj backend never volunteers `commit_id` from any cross-backend verb.

Two existing precedents establish the architectural direction this milestone generalizes:
1. **Phase 4 D-06** — `IncompleteWorkEntry.changeIdShort` was change_id native from day 1 (`sdk/src/vcs/types.ts:226-231`).
2. **Phase 7 D-05** — `refs.mergeBase()` returns change_id on jj via `fork_point(x)` revset (`sdk/src/vcs/backends/jj.ts:887-900`). User overrode the recommendation despite the rebase-stability tradeoff. v1.2 generalizes this verdict to the rest of the read surface.

## Industry survey — how dual-backend VCS tools expose revision identity

### Pattern 1: "Pick the common shape, hide the rest" (volgo-vcs, Sapling)

Both git and Mercurial use **40-char hex** for revision identity, so [volgo-vcs](https://mbarbin.github.io/vcs/docs/explanation/mercurial-compatibility/) ducks the question — its `Rev` type is "the 40-char hex string both backends happen to produce." It explicitly declines a fully-abstracted VCS layer ("All types, names, and semantics in Vcs remain Git-centric"). This works for git+hg because the namespaces are *shape-compatible*. It does NOT work for git+jj — change_id uses a reverse-base32 alphabet (k–z, no 0–9 or a–f) precisely so it cannot be confused with a hex commit_id ([jj-vcs.dev architecture docs](https://docs.jj-vcs.dev/latest/technical/architecture/)). v1.2 cannot adopt this pattern.

[Sapling SCM](https://sapling-scm.com/docs/introduction/) (Meta's git+Mercurial-and-internal-backend tool) takes a similar approach: standard 40-char hex IDs work uniformly because both backends produce them. Sapling does NOT have to bridge a second namespace.

### Pattern 2: "Bridge with a translation table" (hg-git, git-remote-hg)

[hg-git](https://github.com/schacon/hg-git) maintains an explicit Mercurial-changeset-id ↔ git-commit-id mapping table on disk — enabling "lossless" round-trips. The translation is keyed on the **content-addressed** invariant that survives crossing the bridge (per [Mercurial wiki HgGit](https://www.mercurial-scm.org/wiki/HgGit)). This is the wrong primitive for v1.2: jj's commit_id IS the git commit_id when colocated; the namespaces aren't separate stores, they're parallel views of the same underlying object. There's nothing to bridge — only a question of which view the public API exposes.

### Pattern 3: "Native to the dominant backend; the other is an internal detail" (jj-fzf, lazyjj, jjui)

[jj-fzf](https://github.com/tim-janik/jj-fzf/blob/trunk/jj-fzf) uses **change_id as the primary user-facing reference** throughout — the interactive selection placeholder `{2}` is the change_id column. commit_id surfaces only when interfacing with **external tools that demand immutable hashes** (the script reaches for `commit_id` only when handing off to an LLM commit-message generator and when running `jj split` on a specific revision). Otherwise change_id is canonical.

[lazyjj](https://github.com/Cretezy/lazyjj) and [jjui](https://github.com/idursun/jjui) similarly drive their entire UX off change_id (per their default jj-template-driven log views). Neither tool was designed for cross-backend duty — they assume jj — but the design verdict generalizes: **inside a jj-aware surface, change_id is the right canonical id; commit_id is reserved for boundary I/O**.

### Pattern 4: jj's own CLI default

`jj log` default output shows BOTH ids in every row (verified locally on jj 0.41 in this repo: change_id `puktoqmq` next to commit_id `5c02d8c2`). The user-facing convention is "show both, but change_id is the one you cite when you mean *this work*; commit_id is the one you cite when you mean *this exact byte snapshot*." Per [jj docs templates](https://docs.jj-vcs.dev/latest/templates/) and [Why are jj's ID prefixes so short?](https://jonathan-frere.com/posts/jujutsu-shortest-ids/), jj computes the **shortest unambiguous prefix** independently for each namespace — they're treated as parallel addressing schemes, not interchangeable.

**Verdict for v1.2:** Pattern 3 (with explicit boundary-I/O accessor for Pattern 4's commit_id half) is the right model. Adapter surface returns canonical revision id (commit_id on git, change_id on jj). A separate, jj-backend-PRIVATE accessor exists for the rare boundary case (GitHub URL emission, hex-prefix matching) — never imported by workflow code, never reachable on the cross-backend surface.

## Feature Landscape

### Table Stakes (must ship to deliver "unified revision model")

Without these, the milestone hasn't met its goal — workflows still must branch on `vcs.kind` for id reasons.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Caller audit doc** (`.planning/intel/id-namespace-audit.md`) | Cannot safely flip surfaces without knowing every consumer's id assumption (range-stability, hex-prefix matching, external link emission, status-table propagation). Plan 02 of Phase 7 proved callers DO depend on commit_id semantics in some places. SEED-001 calls this "the load-bearing risk." | MEDIUM | Per-call-site classification: `change_id-safe` / `needs commit_id` / `needs both` / `unclear`. Eliminate-first stance per PROJECT.md — default verdict is "convert to revision." |
| **Flip `LogEntry.hash` on jj to change_id** | Single most-cited surface in workflow code; setting the precedent. PITFALL 1 doc at `sdk/src/vcs/backends/jj.ts:327-328` currently pins commit_id semantics — must invert. | MEDIUM | Field name carries hash-shape semantic ("hash"); see anti-features below for the rename question. |
| **Flip `refs.resolveShort()` on jj to change_id.shortest()** | Display surface; Phase 6 B-07 already uses change_id.shortest() internally. `sdk/src/vcs/backends/jj.ts:946`. | LOW | Template flip: `commit_id.short()` → `change_id.shortest()`. Note jj uses `.shortest()` for prefix-uniqueness optimization (per [jj templates docs](https://docs.jj-vcs.dev/latest/templates/)). |
| **Flip `refs.bookmarks.list()[].rev` on jj to change_id** | `Bookmark.rev` field shape; the cross-namespace pain Plan 07-02 hit (`workspace.merge` returns change_id, `bookmarks.list` returned commit_id, no `===` possible). | LOW | Template flip. |
| **Flip `workspace.list()[].rev` on jj to change_id** | Same `WorkspaceInfo.rev` consistency issue. `sdk/src/vcs/backends/jj.ts:1083`. | LOW | Template flip. |
| **Flip `refs.parent` / `refs.head` materialization on jj** | Used by mergeBase, log scoping, conflict resolution; if these stay commit_id while peers flip, callers re-derive via two paths. `sdk/src/vcs/backends/jj.ts:222-227`. | LOW | Template flip. |
| **Flip `refs.exists` / `countCommits` / `rootCommits` template scans on jj** | Internal consistency; these compose with the above. `sdk/src/vcs/backends/jj.ts:965, 978`. | LOW | Template flip; `exists` is shape-agnostic but the scan id used in revset construction must match the new canonical. |
| **`expr.rev(id)` as canonical revision factory; `expr.commit(sha)` deprecated** | Phase 2.1 already deleted `expr.commit` at the type level (per PROJECT.md Validated). v1.2 closes any ambient/runtime alias that survived (see anti-features). | LOW | The naming pun matters: `expr.commit` implies "this is a git commit hash" — wrong for the unified model. |
| **Lint guard parallel to `lint-vcs-no-raw-git`** | Architectural enforcement. Mirrors the existing whole-repo default-deny pattern that has already prevented git-backend leakage; without a parallel guard, the audit's verdict erodes over time. PROJECT.md explicitly calls this out. | MEDIUM | Default-deny `commit_id` template strings + `.commit_id` field accesses + hex-form id assumptions inside jj-routed code paths. Annotated allowlist for the boundary-I/O accessor's two implementation files. |
| **`.planning/` format pass — extends Phase 6 B-07** | Any remaining commit_id-encoded record in `.planning/` (status tables, intel docs, manifest fields) gets rewritten. Memory `project_planning_id_migration` tracks this surface. | LOW–MEDIUM | Audit step → rewriter pass; reuses B-07's existing `commitIdOf ↔ changeIdOf` translation pair from `sdk/src/vcs/format-migration/rewrite.ts`. |
| **Refactor every workflow that branches on `vcs.kind` for id reasons** | The whole point of v1.2. Branch deletions are evidence the abstraction works. PROJECT.md Active list. | MEDIUM | Delete the `if (vcs.kind === 'git') … else …` blocks; use the unified return value. Audit step locates them. |

### Differentiators (capabilities the unified model unlocks)

Capabilities split-namespace surface CANNOT deliver cleanly today.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Rebase-stable cross-backend caching** | Cache keys can use canonical revision id without losing referential meaning when an upstream rebase passes through. On jj, change_id survives `jj rebase`; on git, commit_id IS stable. Either way the cached entry stays addressable. Today, callers caching a `LogEntry.hash` on jj see cache misses after every rebase. | MEDIUM | Emerges from the flip — no new code, but a consequence worth documenting because consumers need to know the new stability guarantee. |
| **Verb composition without backend-aware bridging** | `mergeBase` → `diff` → `bookmarks.list` chains compose with `===` equality across the namespace. Today, Plan 07-02's strict-equivalence test had to relax to presence-only because the namespaces don't compare. SEED-001's "deeper benefit." | LOW (consequence-of-flip) | This is the design property that justifies the milestone. |
| **Cleaner workflow `.md` — no inline backend conditionals for ids** | PROMPT-04 in v1.1 already deleted 242 LOC of raw-git fallbacks. v1.2 lets us delete more `vcs.kind`-branched id-handling lines from the same files. | LOW | Audit produces the deletion list. |
| **Documented rebase-stability semantic on `LogEntry`** | Today PITFALL 1 doc at `jj.ts:327` warns "hash is commit_id, NEVER change_id." After v1.2, `LogEntry.id` (or whatever the post-rename field is) carries a documented dual-semantic: "stable across rewrites on jj, immutable snapshot on git." Consumers can rely on it for change-tracking without backend awareness. | LOW (doc work) | Replace PITFALL 1 with a positive contract. |
| **First-class `vcs.refs.idAlphabet`-aware short-prefix matching** | Today, `id.startsWith(prefix)` is a footgun on jj because change_id uses k-z alphabet — hex prefixes never match. After v1.2, callers use `vcs.refs.matchPrefix(id, prefix)` (or similar) which delegates to the backend's native short-prefix logic. | LOW–MEDIUM | Possibly out of scope for v1.2 if the audit reveals zero callers. Document as v1.3 candidate if so. |

### Anti-Features (do NOT belong in the unified model)

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| **`vcs.jjOnly.commitIdOf(rev)` on the cross-backend surface** | Originally proposed by SEED-001 as the symmetrical escape hatch. | **PROJECT.md explicitly inverts SEED-001 on this point.** Workflows must not branch on `vcs.kind` for id reasons. Exposing `vcs.jjOnly.commitIdOf` on the public adapter surface re-creates the branching pattern v1.2 deletes. Phase 2.1 D-01 narrowing convention (`if (vcs.kind === 'jj')` then access `vcs.jjOnly.*`) is appropriate for genuine git-vs-jj capability gaps (`gitOnly.createAnnotatedTag` etc.) — NOT for an id-reason branch. | Boundary-I/O accessor lives **jj-backend-PRIVATE** (file-private symbol or non-exported helper inside `sdk/src/vcs/backends/jj.ts`). It is reachable from `sdk/src/vcs/format-migration/rewrite.ts` (the B-07 rewriter, audit-justified) and from a single curated emission file (e.g., a future `sdk/src/vcs/external-link.ts` that builds GitHub URLs). It is NOT exported from `sdk/src/vcs/index.ts`. Lint guard's allowlist is the enforcement mechanism. |
| **`expr.commit(sha)` left as a soft alias for `expr.rev(id)`** | Backwards compatibility / migration-friendliness. | The name `expr.commit(sha)` *teaches the wrong model*. `commit` and `sha` both encode git-namespace assumptions. Keeping it as an alias means new callers learn it from old code and propagate the wrong mental model. Phase 2.1 audit already deleted it; v1.2 only needs to verify nothing reintroduced it. | **Delete; do not alias.** Verify via grep + lint guard that no `expr.commit` reference exists in the codebase. If the audit finds any, error-mode-not-deprecation. |
| **`LogEntry.hash` kept as field name with semantic flip** | Avoids a breaking rename across all consumers. | The field name *encodes the wrong semantic*. "hash" connotes content-addressed git SHA. After the flip, on jj it returns change_id which is NOT content-derived. Leaving the name preserves the very namespace confusion v1.2 is supposed to eliminate. | **Rename to `LogEntry.id`** (namespace-neutral, mirrors the new `expr.rev(id)` factory). Document the dual-semantic in the type doc. The mechanical rename is grep-able and the breaking change is discoverable at compile time (TypeScript `string` field; rename is a tsserver "rename symbol" operation). DO NOT split into `changeId` / `commitId` with one nullable per backend — that re-creates the namespace duality at the type level and forces every caller to handle both, which is the OPPOSITE of the unified-revision-model goal. |
| **`Bookmark.rev` / `WorkspaceInfo.rev` rename to match** | Symmetry with `LogEntry.id`. | These already use the namespace-neutral `rev` field name. No rename needed; only the value's shape flips. | Leave field names; flip values only. |
| **Public `vcs.refs.commitIdOf(rev)` that returns "the canonical id, but always hex"** | A "just in case" universal escape hatch. | Same problem as `vcs.jjOnly.commitIdOf`: it teaches callers there's an "escape" they should reach for, which means they reach for it. The lint guard cannot distinguish "audit-justified GitHub URL emission" from "callsite that hasn't been thought through." | Boundary I/O is rare enough that it should be **explicit at the file level** (a single, audit-named, lint-allowlisted module), not implicit at the API surface. |
| **Auto-coercion (e.g., `expr.rev` accepts both shapes and figures it out)** | Convenience. | Conflates the namespaces. `expr.rev` should validate against the active backend's id shape; mixing shapes silently is exactly the bug v1.2 prevents. Plan 07-04 (Phase 7) already saw this go wrong in the other direction — `expr.rev` validates hex, and the planner had to swap to `expr.bookmark` for git refnames (per `MILESTONES.md` v1.1 deviations). | Keep `expr.rev` validation strict to the active backend's shape. Add separate factories (`expr.bookmark`, `expr.tag`) for non-id revision expressions, as already exists. |
| **Removing `commit_id` from jj backend internal use** | "If we're going change-id-only, just use change_id everywhere." | jj's commit_id is an implementation detail that the backend MUST sometimes use internally — e.g., when constructing `jj git push` argv (which speaks git's namespace), when interfacing with colocated `.git` directly, or when re-deriving the boundary-I/O hex form. v1.2 is about the ADAPTER SURFACE, not jj's internals. | Internal commit_id use inside `jj.ts` private functions is fine. The lint guard targets `commit_id` template strings in code paths that compose into the **public adapter return value**, plus any field-access pattern that escapes the file. |

## Per-Surface Migration Table (current shape → target shape)

This is the spec the requirements step picks features off of. Each row is a cross-backend verb whose return value's id shape differs between v1.1 and v1.2 on the jj backend. Git column shape is unchanged — git uses commit_id natively for everything.

| # | Verb / field | File:line | v1.1 git shape | v1.1 jj shape | v1.2 jj target | Notes |
|---|--------------|-----------|----------------|---------------|----------------|-------|
| 1 | `LogEntry.hash` | `types.ts:110-111` + `jj.ts:327-339` | commit_id (40-char hex) | commit_id (40-char hex, PITFALL 1) | **change_id** (40-char k-z) | Field RENAME to `id` (anti-feature row 3). PITFALL 1 doc inverts. |
| 2 | `refs.resolveShort(rev)` | `types.ts:335` + `jj.ts:946` | commit_id.short() (~7 hex) | commit_id.short() (~7 hex) | **change_id.shortest()** (variable len, jj's auto-uniquing) | jj's `.shortest()` is preferred over fixed `.short()` per jj docs. |
| 3 | `refs.bookmarks.list()[].rev` | `types.ts:167-170, 344` + jj.ts (bookmark list parse) | commit_id (40-char hex) | commit_id (40-char hex) | **change_id** (40-char k-z) | The Plan 07-02 cross-namespace pain. |
| 4 | `workspace.list()[].rev` | `types.ts:172-176, 382` + `jj.ts:1083` | commit_id (40-char hex) | commit_id (40-char hex) | **change_id** (40-char k-z) | `WorkspaceInfo.rev` field shape. |
| 5 | `refs.parent` accessor | `types.ts:312` + `jj.ts:222-227` | commit_id | commit_id | **change_id** | Returned as `RevisionExpr`. |
| 6 | `refs.head` accessor | `types.ts:311` | commit_id | commit_id | **change_id** | Returned as `RevisionExpr`. |
| 7 | `refs.exists(rev)` template scan | `types.ts:338` + `jj.ts:965` | n/a (boolean) | scans commit_id template | **scans change_id template** | Return type is boolean; only the internal scan id changes. |
| 8 | `refs.countCommits(opts)` | `types.ts:336` + `jj.ts:965-978` | numeric | numeric (commit_id template scan) | **numeric (change_id template scan)** | Internal-only flip. |
| 9 | `refs.rootCommits(opts)` | `types.ts:337` + `jj.ts:978` | string[] of commit_ids | string[] of commit_ids | **string[] of change_ids** | Note function NAME `rootCommits` — anti-feature candidate for rename to `rootRevisions` later (defer; not blocking). |
| 10 | `expr.commit(sha)` factory (if any reference survives) | grep target across `sdk/src/query/*` | already deleted in Phase 2.1 | already deleted | **verify-and-delete-any-reintroduction** | Audit step. |
| 11 | `LogEntry.parents` array | `types.ts:112` | commit_id[] | commit_id[] | **change_id[]** | Composes with #1; same flip. |

### Surfaces that stay change_id (already correct — DO NOT FLIP)

| Verb / field | File:line | Status |
|--------------|-----------|--------|
| `vcs.commit() → CommitResult.hash` (jj only) | `types.ts:91` + `jj.ts:1180-1226` | Already returns commit_id on jj per current code (`jj.ts:222-227` post-squash probe). **AUDIT THIS:** SEED-001's table lists `vcs.commit()` returns as "already change_id" via `{ changeId }`, but the actual `CommitResult` field is `hash` and the post-squash code populates it from a `commit_id` template. Mismatch between the seed's claim and the code — resolve in audit. |
| `vcs.workspace.merge() → WorkspaceMergeResult.changeId` | `types.ts:217-222` + `jj.ts:1180-1226` | Already change_id (Phase 7 D-03). |
| `vcs.workspace.reap() → ReapResult.abandoned[].changeId` | `types.ts:244-249` | Already change_id (Phase 4 D-19). |
| `vcs.refs.mergeBase(a, b)` | `types.ts:328-331` + `jj.ts:887-900` | Already change_id (Phase 7 D-05 user override — the precedent). |
| `IncompleteWorkEntry.changeIdShort` | `types.ts:226-231` | Already change_id (Phase 4 D-06 — change_id native from day 1). |

### New surface: boundary-I/O accessor (jj-backend-PRIVATE)

NOT exported from `sdk/src/vcs/index.ts`. NOT reachable from workflow code.

| Symbol | Location | Purpose |
|--------|----------|---------|
| `__jjCommitIdOf(rev: RevisionExpr): string` | private to `sdk/src/vcs/backends/jj.ts` (or a sibling module under the same allowlist entry) | Resolve a rev to its 40-char commit_id for the rare boundary case (GitHub URL emission, content-addressed external reference). Lint-guard allowlist entry: this file + the curated single emission file. The B-07 rewriter at `sdk/src/vcs/format-migration/rewrite.ts` already has a working internal helper to lift here. |

**Strongly prefer**: route GitHub external links through tag/release URLs, not `/commit/<sha>` URLs, eliminating the need entirely for the audited surface to be reached. The MIGR-05 production consumer (`scripts/changeset/github-release-notes.cjs`) emits release-notes URLs — tag-keyed, not commit-keyed — so it likely stays clean post-flip without ever calling the boundary accessor. Audit verifies.

## Feature Dependencies

```
Caller audit doc (.planning/intel/id-namespace-audit.md)
    └──blocks──> ALL surface flips (#1–#11 above)
    └──blocks──> vcs.kind-branching deletions (workflow refactor)
    └──blocks──> .planning/ format pass

Surface flips (#1–#11)
    └──blocks──> Lint guard activation (allowlist needs the final list of audit-justified files)
    └──blocks──> .planning/ format pass (rewriter must know the new canonical shape)
    └──blocks──> Workflow vcs.kind-branching deletions (deletions assume the new shape)

Boundary-I/O accessor (private __jjCommitIdOf)
    └──enables──> Lint guard's allowlist entry
    └──enables──> any post-audit boundary callsite that survives

Rename: LogEntry.hash → LogEntry.id
    └──blocks──> any consumer touched by the audit (mechanical TS rename)
    └──independent of──> the value flip (could ship in same commit or staged)

Lint guard activation (default-deny commit_id in jj-routed paths)
    └──depends-on──> Audit complete + flips landed + boundary accessor in place
    └──finalizes──> the architectural enforcement; without it, the audit's verdict erodes
```

### Dependency Notes

- **Audit BEFORE flip:** the load-bearing risk per SEED-001. Plan 07-02 proved at least one cross-namespace caller exists (`bookmarks.list().rev` ↔ `workspace.merge().changeId` comparison). Without the audit, the flip surfaces silent bugs in any caller that stored a `LogEntry.hash` and later compared/joined on it.
- **Flip BEFORE lint:** the lint guard's allowlist needs the post-audit list of legitimate commit_id consumers (which should be ≤2 files: the boundary-I/O accessor's home, and any single curated emission module). Activating the guard before the flip means everything fails the guard.
- **Flip BEFORE workflow refactor:** the `vcs.kind`-branching deletions in workflow `.md` files assume the new shape. Deleting them before the flip means workflows on jj break.
- **`.planning/` format pass AFTER flip:** the rewriter needs to know the new canonical shape so it can validate post-rewrite correctness.
- **Rename `hash` → `id` is independent** of the value flip and can ship in a separate commit if planner prefers (mechanical, grep-able, TS-checkable). Bundling them in one commit is also fine — it's a single semantic change.
- **Boundary-I/O accessor MUST exist before lint guard activates** even if no consumer calls it yet. The lint guard's allowlist references its file path; without the file existing the allowlist is malformed.

## MVP Definition

### Launch With (v1.2)

Minimum viable v1.2 — what's needed to declare "unified revision model on cross-backend adapter."

- [ ] **Caller audit doc** at `.planning/intel/id-namespace-audit.md` — every commit_id reference reachable on jj-routed code paths classified.
- [ ] **All 11 cross-backend surface flips** (table above) landed; jj backend never volunteers commit_id from any of them.
- [ ] **`LogEntry.hash` → `LogEntry.id` rename** + PITFALL 1 doc inverted.
- [ ] **Boundary-I/O accessor** (`__jjCommitIdOf`) jj-backend-PRIVATE; lint-allowlisted in ≤2 files.
- [ ] **Lint guard parallel to `lint-vcs-no-raw-git`** — default-deny `commit_id` template strings + `.commit_id` field accesses + hex-form id assumptions in jj-routed code paths; tightened allowlist matches the audit verdict.
- [ ] **Workflow `vcs.kind`-branching deletions** for id reasons (the deletions are the evidence the abstraction works).
- [ ] **`.planning/` format pass** — extends Phase 6 B-07; any remaining commit_id-encoded record rewritten to change_id.
- [ ] **Validation:** `expr.commit(sha)` confirmed deleted (no reintroduction); strict-green on both backend lanes; no skip-count regressions.

### Add After Validation (v1.3+)

Features deferred from v1.2 because they're consequence-of-flip rather than required:

- [ ] **`vcs.refs.matchPrefix(id, prefix)`** — alphabet-aware short-prefix matching. Add only if v1.2 audit found callers doing `id.startsWith(prefix)`.
- [ ] **Rename `rootCommits` → `rootRevisions`** — for naming consistency with the unified model. Mechanical rename; defer to avoid scope creep.
- [ ] **Documented rebase-stability semantic** added to the new `LogEntry.id` JSDoc — captures the dual-semantic positive contract that replaces the inverted PITFALL 1.

### Future Consideration (v2+)

- [ ] **Public `vcs.refs.idAlphabet` introspection** — for tools that genuinely need to know whether they're working in hex or k-z space (formatters, validators). Defer until a real consumer asks.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Caller audit doc | HIGH (load-bearing — blocks everything else) | LOW–MEDIUM | P1 |
| 11 surface flips (jj backend) | HIGH (the milestone goal) | LOW per surface, MEDIUM aggregate | P1 |
| `LogEntry.hash` → `id` rename | MEDIUM (avoids name-encoded mental model) | LOW (TS-checkable, grep-able) | P1 |
| Boundary-I/O accessor (private) | MEDIUM (enables lint guard; rarely called in practice) | LOW (lift B-07 helper) | P1 |
| Lint guard activation | HIGH (architectural enforcement; without it, the verdict erodes) | MEDIUM (mirror existing `lint-vcs-no-raw-git` pattern) | P1 |
| Workflow `vcs.kind`-branching deletions | HIGH (evidence the abstraction works) | LOW–MEDIUM (audit produces the list) | P1 |
| `.planning/` format pass | MEDIUM (closes Phase 6 B-07 intent) | LOW (extends existing rewriter) | P1 |
| Verify `expr.commit(sha)` deleted | LOW (already deleted in Phase 2.1; verification only) | LOW | P1 (cheap) |
| `vcs.refs.matchPrefix(id, prefix)` | MEDIUM (only if audit reveals callers) | LOW–MEDIUM | P2 |
| `rootCommits` → `rootRevisions` rename | LOW (cosmetic) | LOW | P3 |
| Public `vcs.refs.idAlphabet` introspection | LOW (no consumer yet) | LOW | P3 |

## Competitor Feature Analysis

| Feature | jj-fzf | volgo-vcs | Sapling | hg-git | v1.2 GSD jj-port |
|---------|--------|-----------|---------|--------|-------------------|
| Canonical id on dual-backend surface | change_id (single-backend tool) | shape-overlap (40-char hex; both backends produce it) | shape-overlap (40-char hex) | bridge with translation table | **commit_id on git, change_id on jj** (Pattern 3 from survey) |
| Boundary I/O for external systems | reaches for commit_id locally inside helper script | n/a (Git-centric API) | n/a (presents Git layer) | bidirectional translation table | **jj-backend-PRIVATE accessor**, lint-allowlisted, never on public surface |
| `vcs.kind`-branching for id reasons | n/a | unavoidable (callers ARE git-centric) | hidden by uniform hex | unavoidable | **forbidden** (lint guard enforces) |
| Public type for "a revision" | string (jj's RevisionExpr equivalent) | `Rev.t` (40-char hex) | hash string | `Sha1` per backend | **branded `RevisionExpr`** (existing) — value shape flips per backend, type stays uniform |
| Rebase-stable id available | yes (change_id native) | no (hex only — git rebase invalidates) | no (Sapling has its own commit graph stability story; not exposed as a separate id) | no | **yes** (consequence of v1.2 flip) |

## Sources

### Industry / pattern references
- [volgo-vcs Mercurial Compatibility](https://mbarbin.github.io/vcs/docs/explanation/mercurial-compatibility/) — Pattern 1 (shape-overlap; declines full abstraction)
- [Sapling SCM Introduction](https://sapling-scm.com/docs/introduction/) and [Internal differences from Mercurial](https://sapling-scm.com/docs/dev/internals/internal-difference-hg/) — Pattern 1 + multi-backend abstraction
- [hg-git README (schacon/hg-git)](https://github.com/schacon/hg-git) and [Mercurial wiki HgGit](https://www.mercurial-scm.org/wiki/HgGit) — Pattern 2 (translation table)
- [jj-fzf source `tim-janik/jj-fzf:trunk/jj-fzf`](https://github.com/tim-janik/jj-fzf/blob/trunk/jj-fzf) — Pattern 3 (change_id canonical, commit_id reserved for boundary I/O — direct precedent for v1.2's design)
- [lazyjj on GitHub](https://github.com/Cretezy/lazyjj) and [jjui on GitHub](https://github.com/idursun/jjui) — Pattern 3 confirmation in TUI tooling
- [jj-vcs.dev community-built tools](https://docs.jj-vcs.dev/latest/community_tools/) — broader ecosystem survey

### jj architecture / template references
- [jj architecture docs](https://docs.jj-vcs.dev/latest/technical/architecture/) — change_id stored separately in `.jj/repo/store/extra/`; alphabet design forbids confusion with commit_id; storage-independent APIs principle
- [jj template language docs](https://docs.jj-vcs.dev/latest/templates/) — `change_id.shortest()` / `commit_id.shortest()` semantics; default formatters
- [Why are Jujutsu's ID Prefixes So Short? — Jonathan Frere](https://jonathan-frere.com/posts/jujutsu-shortest-ids/) — explains independent shortest-unique-prefix computation per namespace; reinforces "two parallel addressing schemes" design
- [jj configuration docs](https://docs.jj-vcs.dev/latest/config/) — `format_short_change_id` / `format_short_commit_id` template aliases (jj treats them as separately formattable, not interchangeable)
- [jj working with GitHub docs](https://docs.jj-vcs.dev/latest/github/) — confirms jj has no first-class story for commit_id-based GitHub URL emission (reinforces "boundary I/O is rare in practice if you stick to tag/release URLs")
- Local verification: `jj 0.41.0` `jj log` default output shows BOTH ids in every row, confirming "show both, change_id is canonical for *this work*, commit_id for *this byte snapshot*" convention

### In-tree references (file:line, repo-local — no URL)
- `sdk/src/vcs/types.ts:91, 110-116, 167-170, 172-176, 217-231, 244-249, 311-339` — current type shapes
- `sdk/src/vcs/backends/jj.ts:222-227, 327-339, 887-900, 946, 965, 978, 1083, 1180-1226` — every commit_id-returning surface (the Plan-table-of-contents)
- `.planning/seeds/SEED-001-change-id-only-on-jj-adapter-surface.md` — predecessor document v1.2 inverts on the escape-hatch question; per-surface table is the spine of the migration table above
- `.planning/MILESTONES.md` v1.1 — Plan 07-02 deviation §2 (cross-namespace pain), Plan 07-04 (`expr.rev` validates hex; `expr.bookmark` for refnames)
- `.planning/PROJECT.md` Active list + Key Decisions row 9 — v1.2 inversion of SEED-001's escape-hatch idea
- `sdk/src/vcs/format-migration/rewrite.ts` (per SEED-001 breadcrumbs) — existing `commitIdOf ↔ changeIdOf` helper to lift to `__jjCommitIdOf`

---
*Feature research for: dual-backend VCS adapter unified revision model (v1.2)*
*Researched: 2026-05-14*
