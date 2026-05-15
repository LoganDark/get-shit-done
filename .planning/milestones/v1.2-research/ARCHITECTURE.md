# Architecture Research — v1.2 surface flip + audit + lint guard

**Confidence:** HIGH (every claim cites a current `file:line`, read live during research)

## Pre-emptive correction (saves a phase plan)

**SEED-001's "deprecate `expr.commit(sha)`" bullet is stale.** The factory was already renamed in Phase 2.1. `sdk/src/vcs/expr.ts:43` exports a frozen `expr` object whose factory is `rev` (not `commit`); `expr.rev` at lines 86-94 already accepts both hex-SHA and change-id-shaped strings (test: `sdk/src/vcs/__tests__/expr.test.ts:96-116`). PROJECT.md target-features bullet describing this work should be dropped from v1.2 scope — it's already validated under Phase 2.1.

The seed's "Should `RevisionExpr.commit(sha)` factory be deleted, deprecated as alias, or kept?" question collapses — there is no such factory.

---

## Integration Point #1 — The 7 commit_id template sites in jj.ts

Verified live. SEED-001's table is accurate; one minor disagreement on what line 222-227 represents:

| # | File:line | Verb | Today | Target |
|---|-----------|------|-------|--------|
| 1 | `sdk/src/vcs/backends/jj.ts:222-227` | `commit()` post-squash hash probe (NOT `refs.parent`/`refs.head` as SEED-001 implies — the comment at line 218-227 makes clear this is `commit()`'s internal hash resolution) | `jj log -r @- -T commit_id -n 1` writes `CommitResult.hash` | `change_id` template; `CommitResult.hash` semantic flips |
| 2 | `sdk/src/vcs/parse/jj-log.ts:26,56` (consumer: `jj.ts:330` `log()`) | `LogEntry.hash` from `record.commit_id ?? ''` | NDJSON template `json(self)` already emits both fields | Read `record.change_id` |
| 3 | `sdk/src/vcs/backends/jj.ts:946` | `refs.resolveShort()` | `commit_id.short()` | `change_id.short()` |
| 4 | `sdk/src/vcs/backends/jj.ts:965` | `refs.countCommits()` | `commit_id ++ "\n"` | `change_id ++ "\n"` (count invariant) |
| 5 | `sdk/src/vcs/backends/jj.ts:978` | `refs.rootCommits()` | `commit_id ++ "\n"` | `change_id ++ "\n"` |
| 6 | `sdk/src/vcs/parse/jj-workspace-list.ts:28,46` (consumer: `jj.ts:1089` `workspace.list()`) | `WorkspaceInfo.rev` from `record.target?.commit_id` | jj `workspace list -T 'json(self)'` template | `record.target?.change_id` (verify NDJSON schema in jj 0.41 — Risk 4 below) |
| 7 | `sdk/src/vcs/parse/jj-bookmark.ts:19-21` (consumer: `bookmarks.list()`) | `Bookmark.rev` | `target` array of commit_ids | Re-template to emit change_id |

**Already correct (do not touch):** `mergeBase` (jj.ts:887-918, returns change_id via `fork_point()` per Phase 7 D-05); `workspace.merge` (jj.ts:1175-1181 returns `changeId`); `commit()` return shape uses `changeId` field on `WorkspaceMergeResult` and `ReapResult.abandoned[].changeId` (types.ts:220, 246).

---

## Integration Point #2 — `LogEntry.hash` and `CommitResult.hash` rename

### `LogEntry.hash` (types.ts:109-116)

**Live consumer count:** 27 reads across `query/log.ts:72`, `query/verify.ts:683`, `query/progress.ts:300`, `query-raw-output-projection.ts:23`, `query/mutation-event-mapper.ts:68`, `format-migration/orphan.ts:77,103`, `format-migration/run.ts:152,335`, `verify.cjs:1296`, plus `entry.hash` in `findConflicts`/`reap` and tests.

**Recommendation: Rename `LogEntry.hash` → `LogEntry.id`.** Both arguments:

- *Keep + revise JSDoc:* zero churn but actively misleading on jj. The `(hash || '').slice(0, 7)` pattern at `verify.cjs:1296` and `verify.ts:683` works on hex but produces a semantically-different prefix on the `[k-z]` alphabet — a silent UX/correctness hazard.
- *Rename:* 27-site mechanical sweep. Folds naturally into the audit (every site is touched and verdict-classified in one pass). Compiler errors are the forcing function — no site can silently survive the flip with stale assumptions.

The rename is the strongest forcing function against `.slice(0, 7)` antipatterns surviving silently.

### `CommitResult.hash` (types.ts:91)

**Recommendation: rename to `CommitResult.id`.** Used by `commands.cjs:486,507` (post-commit announcements), `mutation-event-mapper.ts:68`, `format-migration/run.ts:152,335` (writes into rewriter `commitHash` field), `worktree-safety.cjs:505` (already prefers `merge.changeId` from VCS-12).

**Caveat:** `format-migration/run.ts:152,335` writes `commitResult.hash` into the SHA→change_id rewriter as `commitHash`. After the flip, on jj, this writes a change_id into a SHA-pattern matcher's input — but the rewriter's job is migration of legacy git→jj content, so on jj-native repos there are no SHAs to find and the path is moot. Audit verdict: `needs-rename` (rename internal `commitHash` field to `commitId` for clarity).

---

## Integration Point #3 — Boundary I/O suspect: `github-release-notes.cjs` is a false alarm

Read live. **The script does not emit any commit-id-shaped URL.**

- `validateGitRef` (`github-release-notes.cjs:46-63`) — accepts ref *names* (tag/branch), validates via `vcs.refs.exists(expr.bookmark(ref))`.
- `compareUrl` (lines 149-155) — emits `https://github.com/<slug>/compare/<fromRef>...<toRef>` with caller-supplied ref *names* (tag names like `v1.0.0`).
- `readBlob` (lines 78-81) — reads file content at a ref; no ID emission.
- `diff` (lines 69-73) — reads `nameOnly` paths; no IDs.

Phase 7 Plan 04 explicitly swapped `expr.rev` → `expr.bookmark` for this exact reason. **Audit verdict: `safe`. No boundary-I/O accessor needed for this file.**

### The actual boundary-I/O risk is internal display, not external integration

- `verify.cjs:90-91` — `vcs.refs.exists(expr.rev(hash))` against hashes scraped from prose by `/\b[0-9a-f]{7,40}\b/g`. `expr.rev` accepts both alphabets (Phase 2.1) and the jj backend resolves hex commit_ids natively. **No code change.** Audit note: regex is hex-only-shape; jj-native SUMMARY content post-v1.2 won't match — but `verify.cjs:113` treats "no hashes referenced" as vacuously OK.
- `verify.cjs:1296` — `(e.hash || '').slice(0, 7)` for `--oneline` reconstruction. Post-flip emits 7-char prefix of a 12-char change_id; visually fine, but jj convention is 8-char minimum. Audit verdict: `needs-resolveShort` (cosmetic).

---

## Integration Point #4 — `.planning/` state files

Phase 6 B-07 (`format-migration/rewrite.ts`) already pinned `.planning/` to change_id. Verified:

- `COMMIT_KEY_ALLOWLIST` at `rewrite.ts:73-86` covers all structured-store keys (`resolution_commit, commit, commit_hash, commit_id, source_commit, migration_commit, first_commit, last_commit, sha, hash, rev, revision`). Closed-set; new commit-bearing keys must be added here.
- The rewriter operates ONLY in backtick spans + frontmatter values (`findEligibleZones` at `rewrite.ts:240`). Hex tokens in PROSE in `.planning/STATE.md` / `LEARNINGS.md` are intentionally preserved (historical context).

**No new commit_id leak vector identified in `.planning/` writers** — they all flow through `commitResult.hash` (which v1.2 flips) or `merge.changeId` (already correct). One-time grep at v1.2 close to confirm prose hex tokens are historical-only.

---

## New Component: `.planning/intel/id-namespace-audit.md`

### Per-call-site row format

```markdown
| # | File:line | Surface | Today (git/jj) | Caller's use | Verdict | Owner phase | Allowlist entry |
|---|-----------|---------|----------------|--------------|---------|-------------|------------------|
| 1 | `verify.cjs:90` | `vcs.refs.exists(expr.rev(hash))` | hex/hex | feasibility probe | safe | n/a | n/a |
| 2 | `verify.cjs:1296` | `(e.hash || '').slice(0, 7)` | hex/change_id | display | needs-resolveShort | flip | n/a |
| 3 | `format-migration/run.ts:152,335` | `commitResult.hash` → rewriter input | hex/change_id | rewriter input | needs-rename | flip | n/a |
| ... | ... | ... | ... | ... | ... | ... | ... |
```

### Verdict enum (closed set)

- **`safe`** — input domain locked to refnames; no shape assumption.
- **`flip-clean`** — works correctly post-flip; no code change.
- **`needs-rename`** — name carries SHA-shape implication; rename for clarity.
- **`needs-resolveShort`** — uses `.slice(0, N)` on hex assumption; convert to `vcs.refs.resolveShort`.
- **`boundary-io`** — emits to external system requiring specific shape; MUST use a backend-private accessor — anticipate ZERO of these.
- **`historical-prose`** — `.planning/` prose mention; preserve.
- **`unclear`** — defer to phase-time investigation; do not flip.

### Linkage to enforcement

The `boundary-io` verdicts produce **exact allowlist entries** for the new lint script. Each entry's justification links back to the audit row number — the audit becomes the single source of truth for "why does this file have a `vcs-lint:allow-commit-id-here` annotation."

---

## New Component: `lint-vcs-no-commit-id` (the second lint guard)

### Same script, separate, or unified? — Separate, parallel.

1. **Different default-deny scopes.** `lint-vcs-no-raw-git` is whole-repo. The new one defaults to jj-routed code paths (git backend legitimately writes `commit_id` in argv, NDJSON templates, `expr.rev` validation).
2. **Different match patterns.** Existing matches `spawnSync('git'…)`. New matches the literal string `commit_id`, `.commit_id` field accesses, hex-shape regexes like `/^[0-9a-f]{40}$/`. Different false-positive surfaces.
3. **Independent CI signal.** A failure in one shouldn't cascade-mask the other.
4. **Lower review cost.** Cloning `lint-vcs-no-raw-git.cjs` is mechanical; unified linter requires new abstractions.

### Where it lives

- `scripts/lint-vcs-no-commit-id.cjs` — clone of `scripts/lint-vcs-no-raw-git.cjs` (lines 31-203 of existing script as the structural template).
- `scripts/lint-vcs-no-commit-id.allow.json` — same `{files, globs}` JSON shape, seeded from audit's `boundary-io` verdicts (expected: empty).
- CI integration: new step in `.github/workflows/*.yml` parallel to existing; required-blocking.

### Match patterns (initial draft)

```js
const COMMIT_ID_PATTERNS = [
  { re: /['"`]commit_id['"`]/, label: "literal 'commit_id'" },
  { re: /['"`]commit_id\.short\(\)['"`]/, label: "'commit_id.short()'" },
  { re: /\.commit_id\b/, label: ".commit_id field access" },
  { re: /\/\^?\[0-9a-f\]\{[0-9]+\}/, label: "hex-shape regex" },
  { re: /['"][0-9a-f]{40}['"]/, label: "40-char hex literal" },
];
```

40-char-hex pattern is high-noise (test fixtures); rely on annotations + glob-allowlist for tests.

### Inline annotation

`// vcs-lint:allow-commit-id-here <reason; audit-row-N>` — same shape as existing. The `audit-row-N` convention makes every exception traceable.

---

## New Component: Boundary-I/O accessor (conditional, expect to NOT build)

**Prior:** the audit will identify ZERO boundary-I/O sites needing a cross-backend `vcs.jjOnly.commitIdOf` accessor.

Reasons:
1. GitHub URLs use ref names (tags/branches) — verified by reading the only known production GitHub-link emitter (`github-release-notes.cjs`).
2. The internal `parse/jj-id.ts:33` `commitIdOf` already exists for backend-internal use (used by `format-migration/resolve.ts`); it is not exposed on the cross-backend surface.
3. Phase 6's B-07 rewriter is the only known caller; it is fully jj-aware sidecar code that imports the helper directly.

### If the audit finds a site

Then the accessor lives at **`sdk/src/vcs/backends/jj-internal.ts`** (new file):

```ts
export interface JjInternalOps {
  commitIdOf(rev: RevisionExpr): string;
  commitIdShort(rev: RevisionExpr): string;
}
```

**Enforcement that "never imported by workflow code":** add an import-pattern rule to `lint-vcs-no-commit-id.cjs` matching `from ['"].*backends/jj-internal['"]` with whole-repo default-deny except an explicit allowlist (one or two SDK-internal files only — never `bin/lib/*.cjs`, never workflow `.md` files). Type-system tricks (`__internalUseOnly: never` brand) are documentation-only — easily defeated.

**Recommendation:** Do NOT build the accessor speculatively. PROJECT.md explicitly inverts SEED-001's escape-hatch idea: "no escape hatch on cross-backend surface; commit_id leakage from jj is a defect." The audit IS the test of whether the inversion is sustainable.

---

## Data Flow Trace — 3 Representative Consumers

### Consumer 1: `verify.cjs:1290-1297` (post-commit `--oneline` reconstruction)

**Today (jj):**
```
vcs.log({maxCount:50, allRefs:true})
  → jj log -r 'all()' -T 'json(self) ++ "\n"' --no-graph -n 50
  → parseJjLog: entry.hash = record.commit_id    [jj-log.ts:56]
  → e.hash.slice(0, 7) → "ab12cde"
```

**Tomorrow (post-flip):**
```
vcs.log(...)                                     [unchanged — json(self) emits both]
  → parseJjLog: entry.id = record.change_id     [parser change]
  → e.id.slice(0, 7) → "kxnvqro"                [over [k-z] alphabet — visually fine, semantically a change_id prefix]
```

**Audit verdict:** `flip-clean` for grep correctness; `needs-resolveShort` if we want UX-correct 8-char change_id prefixes; field rename `e.hash → e.id` lands.

### Consumer 2: `commands.cjs:486-507` (post-commit announcements)

**Today (jj):**
```
subVcs.commit(...)
  → jj squash …; jj log -r @- -T commit_id -n 1   [jj.ts:222-227]
  → CommitResult.hash = <commit_id>
  → output: "repo:abc123def456…"
```

**Tomorrow (post-flip):**
```
subVcs.commit(...)
  → jj squash …; jj log -r @- -T change_id -n 1   [flipped]
  → CommitResult.id = <change_id>
  → output: "repo:kxnvqropmlkz"
```

**Audit verdict:** `flip-clean` + `needs-rename`. Observable to user (different alphabet) but architecturally clean.

### Consumer 3: `github-release-notes.cjs` — debunked above. **No commit_id reachable.** `safe`.

---

## Build Order — Audit → Flip → Lint guard, three plans within ONE phase

### Why this order

**Audit is a hard precondition for the flip.** The 27-site sweep depends on knowing field renames; test-baseline updates depend on knowing which sites change shape; the boundary-io exception list depends on the audit's verdicts. The flip MUST NOT happen before the audit — mid-flip, the test surface is inconsistent and the audit cannot accurately classify "today's shape."

**Lint guard last.** A lint guard added pre-flip would be noise (every site flags). Post-flip, its first run is a clean-room validation that the flip is complete — any leak at that point is a regression, not historical state.

### Plan structure

```
Plan 1 (Audit):
  - Static-grep every commit_id reference, .hash field access, hex-shape assertion.
  - Per-site verdict assignment.
  - Output: .planning/intel/id-namespace-audit.md (versioned), candidate file list for lint allowlist.
  - SIDE TASK: jj 0.41 NDJSON schema probe for `change_id` field availability (Risk 4 below).

Plan 2 (Flip):
  - Apply 7 template-string flips (Integration Point #1 table).
  - Rename LogEntry.hash → LogEntry.id; CommitResult.hash → CommitResult.id.
  - Sweep the 27+ consumer sites identified in Plan 1.
  - Update PITFALL 1 doc (jj.ts:327).
  - Re-record golden-parity baselines (one-shot via existing capture harness).
  - Strict-green on both backends.

Plan 3 (Lint guard):
  - Clone scripts/lint-vcs-no-raw-git.cjs structure.
  - Apply patterns from §New Component above.
  - Allowlist seeded from Plan 1 boundary-io verdicts (expected: empty).
  - CI step.
  - First run MUST be green (proves Plan 2 flip is complete).
```

### Parallelization opportunity

The lint guard's *script development* can happen during Plan 1 — patterns and allowlist mechanics don't depend on flip completion. Only the *first green run* gates on Plan 2 close.

### Splitting audit into a separate phase?

Defensible if audit takes >1 day. Static-grep gives ~20 SDK call sites + ~10 workflow `vcs.kind` branch sites — bounded enough to stay one phase. Default to one phase; if Plan 1 explodes scope, split into Phase 8.1 (audit) / Phase 8.2 (flip+lint) at planner discretion.

---

## Test Architecture Changes

### Parameterized backend matrix — no change

`tests/__tools__/vcs-fixture.ts` parameterizes on `GSD_TEST_BACKENDS` env. Backend dispatch is fixture-internal. Flip is fully transparent to the matrix.

### Cross-backend equality assertions become problematic

After flip, `expect(gitResult).toEqual(jjResult)` for any `LogEntry.id` / `CommitResult.id` / `WorkspaceInfo.rev` / `Bookmark.rev` / `resolveShort()` return WILL FAIL — different alphabets, different lengths.

**Architecture:** introduce test helper `expectIdShape(kind, value)`:

```ts
function expectIdShape(kind: VcsKind, value: string) {
  if (kind === 'git') expect(value).toMatch(/^[0-9a-f]{40}$/);
  else expect(value).toMatch(/^[k-z]{8,32}$/);
}
```

Existing precedent: `sdk/src/vcs/__tests__/jj-workspace.test.ts:417` already uses `expect(mainEntry?.rev).toMatch(/^[0-9a-f]{40}$/)`. Post-flip, the [k-z] alphabet matters. ~10-20 test sites need update; bounded sweep.

### Golden-parity baselines

`tests/__tools__/capture-vcs-baselines.cjs` and `sdk/src/vcs/__tests__/baseline-parity.test.ts` capture verb outputs as goldens. Goldens with commit_id-shape data on jj need re-recording post-flip. One-shot via existing capture script.

### Hex-prefix matching test sweep

Static-grep `.toMatch(/\^?\[0-9a-f\]/)` and `.slice(0, 7)` and similar across `sdk/src/vcs/__tests__/**/*.ts`. Per-hit decision:
- jj-backend post-flip: change to `[k-z]` alphabet
- cross-backend: replace with `expectIdShape(kind, value)`
- git-only: leave alone

### TEST-09..11 strict-green inheritance

v1.1's strict-green close gate (150/150 on both backends) MUST hold. Audit Plan 1 enumerates these test surfaces; Plan 2 sweeps them.

---

## Risk Inventory (v1.2-specific)

### Risk 1 — Cross-backend equality assertions diverge by id-shape

**Severity:** High. **Where:** `sdk/src/vcs/__tests__/baseline-parity.test.ts`, any `expect(gitResult.X).toEqual(jjResult.X)`. **Mitigation:** Audit enumerates; Plan 2 sweep replaces with `expectIdShape`. Plan 3 lint catches new violations.

### Risk 2 — Backwards-compat for in-flight `.planning/` state during v1.2 (we're dogfooding)

**Severity:** Medium. **Description:** v1.2 itself runs on the jj-port repo. If Plan 2 flips `commit()`'s return mid-phase, the SUMMARY-writing automation captures change_ids partway through. Mixed-shape data within a single `.planning/` file is OK — B-07 rewriter is idempotent on already-correct change_ids and only operates in backtick/frontmatter zones. **Mitigation:** Document in v1.2 phase CONTEXT.md; commits made BEFORE Plan 2 lands captured as commit_id (still resolvable on jj); after Plan 2, captures are change_id. No retroactive sweep.

### Risk 3 — Hex-shape regexes in production code wrong on jj post-flip

**Severity:** Medium. **Where:** `verify.cjs:85` (`/\b[0-9a-f]{7,40}\b/g`), other prose-scrape regexes. **Description:** `expr.rev` validation unchanged (still accepts both); regexes won't *find* change_ids in newer prose. **Mitigation:** Audit flags; widen regex during Plan 2 sweep (`/\b([0-9a-f]{7,40}|[k-z]{8,32})\b/g`), or accept that jj-native prose has no hex tokens to scrape (verify.cjs:113 treats vacuous result as OK).

### Risk 4 — jj 0.41 NDJSON template emits commit_id but not change_id field

**Severity:** Low (verifiable upfront, would-be blocker if missed). **Where:** `parse/jj-log.ts`, `parse/jj-workspace-list.ts`, `parse/jj-bookmark.ts`. **Description:** Parsers today read `record.commit_id`. Flip assumes `record.change_id` is also emitted by `json(self)`. **Mitigation:** Audit Plan 1 includes a one-liner "jj 0.41 NDJSON schema probe." If absent, switch parser to explicit template (`'json(self.change_id() ++ ...)'` or two-pass parse). Bounded.

### Risk 5 — `format-migration/run.ts` writes commit_id-named field with change_id data

**Severity:** Low (rewriter is one-way SHA→change_id; on jj-native repos no SHAs to find, path is moot). **Where:** `format-migration/run.ts:152,335`. **Mitigation:** Audit `needs-rename`; same-Plan-2 sweep.

### Risk 6 — ADR drift

**Severity:** Low. **Where:** `docs/adr/0004-*.md` and any ADR mentioning the dual `change_id`/`commit_id` adapter surface. **Mitigation:** Sweep ADRs in Plan 2; PROJECT.md already has the v1.2 row.

---

## Anti-Patterns to Avoid

- **`if (vcs.kind === 'jj') ... else ...` for id reasons.** PROJECT.md explicit prohibition. Instead: `vcs.refs.resolveShort(expr.rev(value))` returns backend-correct short form; `expr.rev` accepts both alphabets.
- **`id.slice(0, 7)` for short prefix.** Hard-coded git convention. Instead: `vcs.refs.resolveShort(expr.rev(id))` — backend chooses length and alphabet.
- **Cross-backend `expect(adapter1.X.id).toEqual(adapter2.X.id)`.** Different alphabets/lengths post-flip. Instead: `expectIdShape(kind, value)`.
- **Silent backwards-compat alias `LogEntry.hash = LogEntry.id`.** Defeats the audit; tech debt accretes. Hard rename — compiler errors are the forcing function.

---

## Files referenced (absolute paths)

- `.planning/PROJECT.md` (v1.2 scope)
- `.planning/seeds/SEED-001-change-id-only-on-jj-adapter-surface.md` (per-surface flip table; partly stale on `expr.commit`)
- `sdk/src/vcs/types.ts` (lines 91, 109-116, 167-176, 217-222, 246)
- `sdk/src/vcs/expr.ts` (lines 37-94 — confirms factory is `expr.rev`)
- `sdk/src/vcs/backends/jj.ts` (lines 222-227, 327-339, 887-918, 940-987, 1078-1094, 1144-1230)
- `sdk/src/vcs/parse/jj-log.ts` (lines 26, 56)
- `sdk/src/vcs/parse/jj-workspace-list.ts` (lines 28, 46)
- `sdk/src/vcs/parse/jj-id.ts` (lines 33-67 — internal `commitIdOf`/`changeIdOf`)
- `sdk/src/vcs/format-migration/rewrite.ts` (lines 73-86, 240-352)
- `scripts/lint-vcs-no-raw-git.cjs` (lines 31-203 — structural template)
- `scripts/lint-vcs-no-raw-git.allow.json` (allowlist JSON shape)
- `scripts/changeset/github-release-notes.cjs` (entire — confirms no boundary-I/O dependency)
- `get-shit-done/bin/lib/verify.cjs` (lines 60-126, 1270-1310)
- `get-shit-done/bin/lib/commands.cjs` (lines 398-507)

**Confidence: HIGH.** Every claim grounded in current source. The one item flagged for execute-time re-verification is Risk 4 (jj 0.41 `json(self)` template includes `change_id`) — a one-liner against the colocated repo confirms before Plan 2 lands.
