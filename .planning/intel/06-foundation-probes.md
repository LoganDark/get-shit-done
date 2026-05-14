# Phase 6 Foundation Probes — Empirical Evidence

**Captured:** 2026-05-14 (plan 06-01)
**Purpose:** Close RESEARCH Assumptions A1 + A5 + A6 with real-binary evidence so plans 06-02 and 06-03 can hard-code regexes and revset operators around them.

**Environment:** macOS (M4 Max), jj 0.41.0 (per PROJECT.md Phase 3 CI pin).

## A1 — jj change_id alphabet excludes hex digits

**Test:** `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts`

**Result:** PASS (2/2 assertions).

- jj 0.41 change_ids match `/^[k-z]+$/` exclusively (no `0-9`, no `a-j`).
- jj 0.41 commit_ids match `/^[0-9a-f]+$/` exclusively (standard hex).
- The two character sets are **disjoint** — there is no overlap between any
  valid change_id character and any valid commit_id character.

**Implication:** Plan 06-02's two regexes — `/[0-9a-f]{7,40}/` for git SHA
detection and `/[k-z]{8,12}/` for jj change_id detection — cannot
mis-classify across alphabets. Mixed-alphabet strings are neither (and the
rewriter can reject them). No manual collision review needed during the
`.planning/` SHA→change_id rewrite.

## A5 — jj `x+` operator returns ONLY direct children

**Test:** `sdk/src/vcs/__tests__/jj-children-probe.test.ts`

**Result:** PASS (3/3 assertions).

In a 3-commit lineage A → B → C built via `jj squash -B @ -k -m`:
- `<A>+` returns `{B}` only (not `C`).
- `<B>+` returns `{C}` only.
- `<A>::` (descendants, for contrast) returns `{A, B, C}` — establishes
  that `x+` is strictly stricter than `x::`.

**Implication:** Plan 06-02's `orphan.ts:resolveAncestor` can rely on
`expr.children` (translated by plan-01 Task 2 to `<inner>+`) to enumerate
direct children for the migration report's "direct-children-of-ancestor"
column without filtering transitive descendants in JS.

## A6 — jj `x-` operator returns ONLY direct parents

**Test:** `sdk/src/vcs/__tests__/jj-parents-probe.test.ts`

**Result:** PASS (3/3 assertions).

Same A → B → C lineage:
- `(<B>)-` returns `{A}` only (length 1 — not root, not C).
- `(<C>)-` returns `{B}` only (length 1 — not A, not C).
- `::<C>` (ancestors, for contrast) returns `{A, B, C}` — establishes
  that `x-` is strictly stricter than `::x`.

**Implication:** Plan 06-02's orphan walker uses
`vcs.log({ rev: expr.parents(expr.rev(cursor)), maxCount: 1 })` and takes
`entries[0]` as the first parent. On linear histories this is exact. On
merge commits, jj returns all parents and the walker takes the first;
that matches git's `<rev>^@` semantics translated by plan-01 Task 2's
`git-rev.ts`. This probe closes the symmetric assumption that A5
establishes for children — the walker can step one parent at a time
without filtering transitive ancestors in JS.

## Evidence files

- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts`
- `sdk/src/vcs/__tests__/jj-children-probe.test.ts`
- `sdk/src/vcs/__tests__/jj-parents-probe.test.ts`
- `jj --version` at probe time: `jj 0.41.0` (matches PROJECT.md Phase 3 CI pin)

## How to re-verify

```bash
cd sdk
pnpm exec vitest run src/vcs/__tests__/jj-id-alphabet-probe.test.ts
pnpm exec vitest run src/vcs/__tests__/jj-children-probe.test.ts
pnpm exec vitest run src/vcs/__tests__/jj-parents-probe.test.ts
```

All three must exit 0 against the installed jj binary. If any probe
fails after a jj upgrade, plans 06-02 / 06-03 assumptions are stale and
the regex shapes / revset operator translations must be re-audited
before any code in those plans is trusted.

## Format-migration tracker entry (CONTEXT D-19)

This probe doc records `jj --version` and change_id values **in
test-output context only** — those are intel about jj, not
GSD-persisted state. Net-new `.planning/`-encoded-revision-id surfaces
introduced by this plan: **zero**.
