---
phase: 08-unified-revision-model-audit-test-prep-flip-lint-guard-close
fixed_at: 2026-05-15T00:00:00Z
review_path: .planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close/08-REVIEW.md
fix_scope: all
findings_in_scope: 10
fixed: 10
skipped: 0
iteration: 2
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-05-15
**Source review:** `.planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close/08-REVIEW.md`
**Iteration:** 2 (cumulative; iteration 1 covered the 6 critical+warning findings, iteration 2 extends to the 4 Info findings under `fix_scope=all`)

**Summary:**
- Findings in scope: 10 (1 Critical + 5 Warning + 4 Info)
- Fixed: 10 (6 from iteration 1, 4 fresh in iteration 2)
- Skipped: 0

All 10 review findings now have an applied fix on the branch. Iteration 1 closed the critical/warning scope (1 + 5); iteration 2 closes the four Info-tier findings (IN-01..IN-04). Project lints + targeted tests pass after iteration 2.

## Fixed Issues — Iteration 1 (already landed prior to this run)

### CR-01: cmdCommitToSubrepo renders every repo as ":skip" because of an inconsistent hash/id rename

**Files modified:** `get-shit-done/bin/lib/commands.cjs`
**Commit:** `54843ae7` (pre-existing, landed before iteration 1)
**Applied fix:** Renamed all 3 producer sites (`hash:` → `id:` on lines 484, 487, 500) plus the local var `hash` → `id` (lines 491-498). Verified by re-reading: producers emit `id:`, render at line 508 reads `v.id`, contract restored.

### WR-01: lint-vcs-no-commit-id.cjs allowlist path-resolution silently breaks when --scan-root points anywhere but REPO_ROOT

**Files modified:** `scripts/lint-vcs-no-commit-id.cjs`
**Commit:** `umuqqpnzvnwl` (iteration 1; combined with WR-03)
**Applied fix:** Option (a) from the review — added a documentation block above the `path.relative(SCAN_ROOT, …)` call explaining the fixture-test rationale, mirroring the existing convention in `scripts/lint-vcs-no-raw-git.cjs`. Allowlist semantics preserved; no code change.

### WR-02: migr-06-close-gate.cjs duplicates SDK rewriter logic instead of consuming the canonical implementation

**Files modified:** `scripts/migr-06-close-gate.cjs`, `tests/scripts/migr-06-close-gate.test.cjs` (new)
**Commit:** `oxxwxwtmwxmr` (iteration 1)
**Applied fix:** Kept the inline duplication, locked it with a unit test asserting the close-gate's `COMMIT_KEY_ALLOWLIST` is a superset of the canonical set in `sdk/src/vcs/format-migration/rewrite.ts`. Made the script export the allowlist via `module.exports` guarded by `require.main === module`.

### WR-03: lint-vcs-no-commit-id.cjs hex-regex pattern only matches JS regex literal form

**Files modified:** `scripts/lint-vcs-no-commit-id.cjs`, `scripts/audit-id-namespace.cjs`, `tests/scripts/audit-id-namespace.test.cjs`
**Commit:** `umuqqpnzvnwl` (iteration 1; combined with WR-01)
**Applied fix:** Expanded both PATTERNS character classes to accept backtick, single-quote, double-quote, OR forward-slash as the opening delimiter. Added 3 fixture tests covering JS regex-literal, single-quoted, and double-quoted hex regex forms.

### WR-04: migrateVcsQuery rejects `--cwd` with no value via a misleading "unknown flag" error

**Files modified:** `sdk/src/query/migrate-vcs.ts`
**Commit:** `vlspussqxttq` (iteration 1)
**Applied fix:** Split the three two-arg flags (`--cwd`, `--target`, `--workstream`) into explicit branches, each emitting a flag-specific error string when the value is missing.

### WR-05: git.ts diff() silently produces nonsensical nameOnly output when both nameOnly and nameStatus are passed

**Files modified:** `sdk/src/vcs/backends/git.ts`
**Commit:** `prtpnprmvwpn` (iteration 1)
**Applied fix:** Gated both the `--name-only` arg push and the `result.nameOnly` field population on `opts.nameOnly && !opts.nameStatus`. When both opts are set, the adapter now emits only `--name-status` and leaves `result.nameOnly: []`.

## Fixed Issues — Iteration 2 (this run, `fix_scope=all`)

### IN-01: migr-06-close-gate.cjs containment guard is redundant when walkMd starts at PHASE_DIR

**Files modified:** `scripts/migr-06-close-gate.cjs`
**Commit:** `mxswozzkvtqs` (iteration 2)
**Applied fix:** Appended an explanatory comment block above `assertInsidePhaseDir` describing the defense-in-depth rationale: `walkMd` is rooted at PHASE_DIR, but `entry.isDirectory()` returns true for a symlinked directory inside PHASE_DIR, so recursion would follow the link and produce absolute paths outside PHASE_DIR. The guard catches that case and aborts. The comment explicitly warns "Do NOT strip as dead code" so a future contributor doesn't remove it.
**Verification:** `node -c scripts/migr-06-close-gate.cjs` (syntax OK); both repo lints still exit 0.

### IN-02: emitMarkdown produces unsafe pipe-escaping for table cell values

**Files modified:** `scripts/audit-id-namespace.cjs`
**Commit:** `zzporsmvqwoo` (iteration 2)
**Applied fix:** Option (a) from the review (full escaping). Replaced the inline `.replace(/\|/g, '\\|')` with a dedicated `escapeMarkdownCell(s)` helper that, in order, escapes `\` first (so subsequent inserted backslashes are not re-escaped), then `|`, then `` ` ``, then collapses `\r\n` / `\r` / `\n` to `<br>` so embedded newlines no longer break the table row.
**Verification:** `node -c scripts/audit-id-namespace.cjs` (syntax OK); `node --test tests/scripts/audit-id-namespace.test.cjs` → 10/10 pass.

### IN-03: parseJjBookmarkRecord throws on non-array target instead of treating it as malformed

**Files modified:** `sdk/src/vcs/parse/jj-bookmark.ts`, `sdk/src/vcs/__tests__/jj-refs.test.ts`
**Commit:** `pqrlrutnxomx` (iteration 2)
**Applied fix:** Added a mirror of the `record.name` contract-drift check immediately before the existing length>1 divergence check — if `record.target` is not an array (string, null, missing, number, etc.), throw a typed `Error` with a 80-char preview and an explicit `(got <typeof>)` annotation. Simplified the subsequent divergence and first-target reads now that the `Array.isArray` invariant is established. Added 3 new vitest cases to the parser-level suite (`jj-refs.test.ts`) covering the string, null, and missing-key cases.
**Verification:** SDK builds clean (`tsc` + `tsc -p tsconfig.cjs.json`); `vitest run src/vcs/__tests__/jj-refs.test.ts` → 31/31 pass (28 prior + 3 new IN-03 cases).

### IN-04: seed-lint-allowlist.cjs has no idempotency assertion despite the JSDoc claim

**Files modified:** `scripts/seed-lint-allowlist.cjs`
**Commit:** `vouwuyoqqoll` (iteration 2)
**Applied fix:** Wrapped the `fs.writeFileSync` in a read-and-compare guard. The new content is computed once into `newContent`, the existing on-disk bytes are read (or treated as empty if the file doesn't exist), and the write is skipped when the byte sequences match. The log line on the skip path explicitly reports "no changes (… already up to date, N entries)" so the caller still gets actionable output.
**Verification:** `node -c scripts/seed-lint-allowlist.cjs` (syntax OK). Live mtime check: captured `stat -c %Y` before, slept 1 s, re-ran the seeder, captured `stat -c %Y` after — `delta=0` confirming the file was not touched and the JSDoc idempotency claim now holds.

## Verification Gates (post iteration 2)

All gates green after iteration 2:

- `node scripts/lint-vcs-no-commit-id.cjs` → ok, 1033 files scanned, 0 violations
- `node scripts/lint-vcs-no-raw-git.cjs` → ok, 1071 files scanned, 0 violations
- `pnpm --filter @gsd-build/sdk build` → exit 0 (tsc + tsc -p tsconfig.cjs.json)
- `node --test tests/scripts/*.test.cjs` → 20/20 pass (16 pre-existing + 3 WR-03 fixture cases + 1 WR-02 superset assertion)
- `pnpm --filter @gsd-build/sdk exec vitest run src/vcs/__tests__/jj-refs.test.ts` → 31/31 pass (28 prior + 3 new IN-03 cases)
- Live idempotency probe: re-running `node scripts/seed-lint-allowlist.cjs` against an existing identical allowlist leaves `stat -c %Y` unchanged.

---

_Fixed: 2026-05-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
