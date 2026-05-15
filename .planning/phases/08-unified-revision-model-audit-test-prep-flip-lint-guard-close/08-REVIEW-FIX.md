---
phase: 08-unified-revision-model-audit-test-prep-flip-lint-guard-close
fixed_at: 2026-05-15T00:00:00Z
review_path: .planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close/08-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 6
fixed: 5
skipped: 1
iteration: 1
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-05-15
**Source review:** `.planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close/08-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 Critical + 5 Warning; Info findings out of scope per `fix_scope=critical_warning`)
- Fixed: 5 (4 fresh + 1 already-fixed CR-01 verified)
- Skipped: 1 (CR-01 — verified already fixed in commit `54843ae7`; treated as fixed for status purposes, listed under Skipped for documentation completeness)

Note: `status: all_fixed` because CR-01 was already addressed by an upstream commit before this fix run (`54843ae7 — fix(08): sweep missed cmdCommitToSubrepo .hash to .id`). All 5 in-scope warnings (WR-01..WR-05) received fresh fixes in this iteration.

## Fixed Issues

### CR-01: cmdCommitToSubrepo renders every repo as ":skip" because of an inconsistent hash/id rename

**Files modified:** `get-shit-done/bin/lib/commands.cjs`
**Commit:** `54843ae7` (pre-existing; not re-committed)
**Applied fix:** Renamed all 3 producer sites (`hash:` → `id:` on lines 484, 487, 500) plus the local var `hash` → `id` (lines 491-498). Confirmed by reading the current file state — output line 508 reads `v.id`, producers emit `id`, render aligns.
**Verification:** Re-read `get-shit-done/bin/lib/commands.cjs:480-510` — current source shows `repos[repo] = { committed: false, id: null, … }` on the two error paths and `repos[repo] = { committed: true, id, … }` on the success path. The `output(...)` call at line 508 reads `v.id`. CR-01 contract is restored.

### WR-01: lint-vcs-no-commit-id.cjs allowlist path-resolution silently breaks when --scan-root points anywhere but REPO_ROOT

**Files modified:** `scripts/lint-vcs-no-commit-id.cjs`
**Commit:** `umuqqpnzvnwl` (combined with WR-03 — both same file)
**Applied fix:** Option (a) from the review — added a 4-line block comment above the `path.relative(SCAN_ROOT, …)` call documenting the fixture-test rationale, mirroring the existing comment in `scripts/lint-vcs-no-raw-git.cjs:115-118`. No code change. Allowlist semantics preserved.

### WR-02: migr-06-close-gate.cjs duplicates SDK rewriter logic instead of consuming the canonical implementation

**Files modified:** `scripts/migr-06-close-gate.cjs`, `tests/scripts/migr-06-close-gate.test.cjs` (new)
**Commit:** `oxxwxwtmwxmr`
**Applied fix:** Chose the lower-risk option from the review — kept the inline duplication, locked it with a unit test. Verified the inline `COMMIT_KEY_ALLOWLIST` is currently IDENTICAL to the canonical one in `sdk/src/vcs/format-migration/rewrite.ts:73-86` (both have the same 12 keys: `resolution_commit, commit, commit_hash, commit_id, source_commit, migration_commit, first_commit, last_commit, sha, hash, rev, revision`). Added a header comment explaining the superset invariant. Made the script export its allowlist via `module.exports` (guarded with `require.main === module` so direct invocation still works). New test `tests/scripts/migr-06-close-gate.test.cjs` spawns `npx tsx` against `rewrite.ts`, JSON-serializes the canonical Set, and asserts every canonical key is present in the close-gate's set — fails loudly on drift.
**Note on full canonical consumption:** Did not switch to consuming `rewrite.ts` via tsx (the more invasive option in the review) because (a) the script is one-shot and has already run for this phase, (b) adding a tsx hop to a close-gate script multiplies failure modes for marginal gain when the assertion test catches the drift the maintainer was worried about. Documented decision in commit message.

### WR-03: lint-vcs-no-commit-id.cjs hex-regex pattern only matches JS regex literal form

**Files modified:** `scripts/lint-vcs-no-commit-id.cjs`, `scripts/audit-id-namespace.cjs`, `tests/scripts/audit-id-namespace.test.cjs`
**Commit:** `umuqqpnzvnwl` (combined with WR-01)
**Applied fix:** Expanded both PATTERNS arrays (lint script line 60 and audit script line 36) — character class went from `/\/\^?…/` to `` /[`'"\/]\^?…/ ``, accepting backtick, single-quote, double-quote, OR forward-slash as the opening delimiter. The audit's `hex_regex` kind label is unchanged; the lint's label was renamed from `"hex-shape regex literal"` to `"hex-shape regex literal or string"` to reflect both forms. Added 3 fixture tests to `tests/scripts/audit-id-namespace.test.cjs`: JS regex-literal form `/^[0-9a-f]{40}$/`, single-quoted `'^[0-9a-f]{12}$'`, double-quoted `"[0-9a-f]{8}"`. All 3 fixtures emit a `hex_regex` row. The lint still passes against the whole repo (1033 files, 0 violations).

### WR-04: migrateVcsQuery rejects `--cwd` with no value via a misleading "unknown flag" error

**Files modified:** `sdk/src/query/migrate-vcs.ts`
**Commit:** `vlspussqxttq`
**Applied fix:** Split the three two-arg flags (`--cwd`, `--target`, `--workstream`) into explicit branches. Each branch first checks the literal flag name, then validates that `args[i + 1]` exists; on missing value it returns a flag-specific error string (e.g. `migrate-vcs: --cwd requires a path argument`, `… --target requires a value (git|jj)`, `… --workstream requires a name argument`) instead of falling through to the catch-all `unknown flag` branch. Built SDK clean; no TS errors.

### WR-05: git.ts diff() silently produces nonsensical nameOnly output when both nameOnly and nameStatus are passed

**Files modified:** `sdk/src/vcs/backends/git.ts`
**Commit:** `prtpnprmvwpn`
**Applied fix:** Gated BOTH the `--name-only` arg push (line 318) and the `result.nameOnly` field population (line 336) on `opts.nameOnly && !opts.nameStatus`. When both opts are set, the new behavior is: do NOT append `--name-only` to argv (so git's CLI sees only `--name-status`), and leave `result.nameOnly: []`. The `result.nameStatus` parser is untouched and still works. Added 5-line WR-05 comment block above the new arg gate explaining the precedence. Built SDK clean; no TS errors.

## Skipped Issues

### CR-01: cmdCommitToSubrepo renders every repo as ":skip" because of an inconsistent hash/id rename

**File:** `get-shit-done/bin/lib/commands.cjs:508` (with producer sites at 484, 487, 500)
**Reason:** Already fixed before this fix run. Commit `54843ae7 — fix(08): sweep missed cmdCommitToSubrepo .hash to .id (Plan 2 consumer-sweep gap; resolves REVIEW.md CR-01 BLOCKER)` was authored on 2026-05-15 and landed prior to this orchestration. Re-read of the current source confirms the rename is in place: producers emit `id:`, render reads `v.id`. No additional change required.
**Original issue:** The hard-rename sweep was INCOMPLETE — per-repo result objects were constructed with the legacy `hash:` field but the closing `output(...)` call read `v.id`, so the rendered text always showed `repo:skip` regardless of success.

## Verification

After all fixes were applied, the following gates were run and exit 0:

- `node scripts/lint-vcs-no-commit-id.cjs` → ok, 1033 files scanned, 0 violations
- `node scripts/lint-vcs-no-raw-git.cjs` → ok, 1071 files scanned, 0 violations
- `pnpm --filter @gsd-build/sdk build` → exit 0 (tsc + tsc -p tsconfig.cjs.json)
- `node --test tests/scripts/*.test.cjs` → 20 tests pass, 0 fail (16 pre-existing + 3 new WR-03 fixtures + 1 new WR-02 superset test)

## Out-of-Scope (Info findings — `fix_scope=critical_warning`)

The following 4 Info-tier findings were intentionally NOT fixed (scope limit per orchestrator config):
- IN-01: migr-06-close-gate.cjs containment guard comment (defense-in-depth docstring)
- IN-02: emitMarkdown unsafe pipe-escaping (annotate or fully-escape)
- IN-03: parseJjBookmarkRecord throws on non-array target (contract-drift consistency)
- IN-04: seed-lint-allowlist.cjs no idempotency assertion (mtime preservation)

These remain available for a future `fix_scope=all` pass.

---

_Fixed: 2026-05-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
