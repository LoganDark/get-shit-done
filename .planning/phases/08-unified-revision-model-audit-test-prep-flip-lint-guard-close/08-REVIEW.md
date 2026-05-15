---
phase: 08-unified-revision-model-audit-test-prep-flip-lint-guard-close
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - .github/workflows/test.yml
  - get-shit-done/bin/lib/commands.cjs
  - get-shit-done/bin/lib/init.cjs
  - get-shit-done/bin/lib/worktree-safety.cjs
  - scripts/audit-id-namespace.cjs
  - scripts/lib/allowlist-parser.cjs
  - scripts/lib/glob-to-regex.cjs
  - scripts/lint-vcs-no-commit-id.allow.json
  - scripts/lint-vcs-no-commit-id.cjs
  - scripts/lint-vcs-no-raw-git.allow.json
  - scripts/lint-vcs-no-raw-git.cjs
  - scripts/migr-06-close-gate.cjs
  - scripts/seed-lint-allowlist.cjs
  - sdk/src/query/commit.ts
  - sdk/src/query/migrate-vcs.ts
  - sdk/src/types.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/format-migration/orphan.ts
  - sdk/src/vcs/format-migration/run.ts
  - sdk/src/vcs/format-migration/types.ts
  - sdk/src/vcs/parse/jj-bookmark.ts
  - sdk/src/vcs/parse/jj-id.ts
  - sdk/src/vcs/parse/jj-log.ts
  - sdk/src/vcs/parse/jj-workspace-list.ts
  - sdk/src/vcs/types.ts
  - sdk/tsconfig.json
  - sdk/vitest.config.ts
  - tests/__tools__/vitest-matchers.ts
  - tests/__tools__/vitest.d.ts
  - tests/scripts/allowlist-parser.test.cjs
  - tests/scripts/audit-id-namespace.test.cjs
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-05-15
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Phase 8 is the unified revision model close-out — a hard rename of `LogEntry.hash` → `LogEntry.id`, `CommitResult.hash` → `CommitResult.id`, jj backend template flips, a new audit/lint guard pair, a vitest custom matcher, and a one-shot MIGR-06 close-gate rewriter. Most consumer-sweep work landed cleanly: production handlers (`sdk/src/query/commit.ts`, `sdk/src/query/migrate-vcs.ts`), the git backend, NDJSON parsers, and the new lint infrastructure all converge on the unified `.id` contract.

The review surfaced ONE critical defect that breaks the `commit-to-subrepo` CLI's human-readable output: `cmdCommitToSubrepo` constructs every per-repo result object with a `hash:` field but the closing `output(...)` call reads `v.id`, so the rendered text always shows `repo:skip` regardless of success. This is a sweep-miss — the surrounding `cmdCommit` was renamed correctly; the sibling function was only partially updated. Five quality warnings and four info items round out the report.

## Critical Issues

### CR-01: cmdCommitToSubrepo renders every repo as ":skip" because of an inconsistent hash/id rename

**File:** `get-shit-done/bin/lib/commands.cjs:508` (with the producing sites at lines 484, 487, 500)
**Issue:** The hard-rename sweep is INCOMPLETE in `cmdCommitToSubrepo`. The per-repo result objects are still constructed with the old `hash:` field:

```js
// lines 484, 487
repos[repo] = { committed: false, hash: null, files: repoFiles, reason: 'nothing_to_commit' };
repos[repo] = { committed: false, hash: null, files: repoFiles, reason: 'error', error: commitResult.stderr };
// line 500
repos[repo] = { committed: true, hash, files: repoFiles };
```

…but the final non-raw rendering on line 508 reads `v.id`:

```js
output(result, raw, Object.entries(repos).map(([r, v]) => `${r}:${v.id || 'skip'}`).join(' '));
```

Because `v.id` is `undefined` on every entry, the short-form output renders `repo1:skip repo2:skip …` even when commits succeed. This is a user-visible regression for any caller depending on the non-`--raw` summary line (workflows piping the CLI's stdout to derive the new commit short-id).

The structured (`--raw` JSON) shape is also inconsistent — the FLIP-03 unified contract says `CommitResult.id`, but the API surface of cmdCommitToSubrepo still emits `repos[r].hash`. Downstream consumers (e.g. workflow scripts that consume the JSON shape) will see asymmetry between `cmdCommit` (already returns `id`) and `cmdCommitToSubrepo` (still returns `hash`). Pick one and apply it everywhere.

**Fix:** Rename `hash` → `id` on all three producer sites AND update the JSDoc/comments. Either:

```js
// lines 484/487 (the failure paths)
repos[repo] = { committed: false, id: null, files: repoFiles, reason: 'nothing_to_commit' };
repos[repo] = { committed: false, id: null, files: repoFiles, reason: 'error', error: commitResult.stderr };

// lines 491-500 (the success path)
// Get short id
let id = null;
try {
  id = subVcs.refs.resolveShort(subVcs.refs.head);
} catch {
  id = null;
}
repos[repo] = { committed: true, id, files: repoFiles };
```

Add a regression test that asserts the non-raw stdout includes the resolved short-id for each committed sub-repo. This same bug also exists implicitly in the FLIP audit allowlist: `scripts/lint-vcs-no-commit-id.cjs` won't catch the `hash:` literals because the lint denylists `commit_id` / `.commit_id` / hex-shape regexes — not the field name `hash`. Consider adding an audit pattern `\bhash\s*:` scoped to the FLIP-03 sweep zone, or grep manually post-rename to ensure no straggler call sites remain.

## Warnings

### WR-01: lint-vcs-no-commit-id.cjs allowlist path-resolution silently breaks when --scan-root points anywhere but REPO_ROOT

**File:** `scripts/lint-vcs-no-commit-id.cjs:82` (also applies to `scripts/lint-vcs-no-raw-git.cjs:119`)
**Issue:** `checkFile` computes `rel = path.relative(SCAN_ROOT, filepath)` for allowlist lookup, but the allowlist JSON's entries are repo-rooted paths (e.g. `sdk/src/types.ts`). When `--scan-root ./sdk` is passed, `rel` becomes `src/types.ts` and the allowlist no longer matches — every legitimately allowlisted file becomes a violation.

The raw-git lint script documents this as INTENTIONAL for its fixture test (the fixture file MUST be reported when scanned in isolation). The commit-id lint script mirrors that pattern without documenting WHY, and there's no equivalent fixture test wired up yet, so users who reach for `--scan-root` to localise a check will hit confusing "violations" on allowlisted files.

**Fix:** Either (a) document the `--scan-root` semantics with the same fixture-test rationale as raw-git lint (a comment block above `parseArgv`), or (b) make the allowlist lookup do TWO comparisons — `path.relative(SCAN_ROOT, …)` and `path.relative(REPO_ROOT, …)` — and `isAllowed` returns true on either match. Option (a) is lower-risk and matches the existing convention.

### WR-02: migr-06-close-gate.cjs duplicates SDK rewriter logic instead of consuming the canonical implementation

**File:** `scripts/migr-06-close-gate.cjs:52-193`
**Issue:** The script ports a subset of `sdk/src/vcs/format-migration/rewrite.ts` inline (GIT_SHA_RE, COMMIT_KEY_ALLOWLIST, findEligibleZones, migrateContent). The header comment justifies this as "rewrite.ts is ESM-only in dist/" and "avoids a dist build step", but:

1. The inline `findEligibleZones` body-zone offset math (line 95) reassembles content with `lines.slice(0, frontmatterEndLine + 1).join('\n').length + 1` — this presumes single-`\n` separators, but if any phase doc contains CRLF (e.g. an artifact copy-pasted from Windows tooling), the offsets won't match the original `content` byte positions and matches will be mis-placed inside backticks vs frontmatter zones.
2. The `COMMIT_KEY_ALLOWLIST` here is a SUBSET of the canonical set in `rewrite.ts`, and any drift between the two becomes silent bit-rot — the close-gate could skip frontmatter keys the canonical rewriter would have covered.
3. The script bypasses the adapter and shells `execFileSync('jj', …)` directly (line 148). Functionally fine (the lint script's `commit_id` denylist doesn't fire on a jj invocation), but it duplicates `sdk/src/vcs/parse/jj-id.ts::changeIdOf` and ages independently.

**Fix:** Consume the canonical SDK rewriter via tsx (`npx tsx -e 'import("./sdk/src/vcs/format-migration/rewrite.ts")…'`) or extend the SDK package to ship a CJS-compatible entrypoint for one-shot scripts. The "no build step" rationale is undercut by the maintenance burden of two divergent rewriters. If the inline approach must stay, copy the FULL `COMMIT_KEY_ALLOWLIST` from `rewrite.ts` and add a unit-test that asserts the close-gate's set is a superset of the canonical one.

### WR-03: lint-vcs-no-commit-id.cjs hex-regex pattern only matches JS regex literal form

**File:** `scripts/lint-vcs-no-commit-id.cjs:60`
**Issue:** The pattern `/\/\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/` requires a leading `/` (the JavaScript regex-literal opener). Code that constructs the same regex via `new RegExp('[0-9a-f]{40}')` or via a string template (`'^[0-9a-f]{40}$'` used with `.test()`) will sail past the lint and re-introduce `commit_id`-shape probes. The audit script's PATTERNS has the same gap.

**Fix:** Add a second pattern that matches the regex-as-string form, e.g. `/['"]\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/` (string-quoted `[0-9a-f]{N}` shape). Or expand the existing regex to allow either delimiter: `/['"\/]\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/`. Add a fixture line to a test file (or inline integration test) covering the string-form case.

### WR-04: migrateVcsQuery rejects `--cwd` with no value via a misleading "unknown flag" error

**File:** `sdk/src/query/migrate-vcs.ts:39-56`
**Issue:** The argv parser checks `args[i] === '--cwd' && args[i + 1]` first; if `--cwd` is the LAST arg (no value), that branch is false and the parser falls into `args[i].startsWith('--')` which returns "unknown flag '--cwd'". The flag IS known — it's missing its required value. Misleading error makes debugging harder.

Same issue applies to `--target` and `--workstream` (also two-arg flags). All three silently rewrite to "unknown flag" instead of "flag requires a value".

**Fix:** Distinguish the two cases:

```js
} else if (args[i] === '--cwd') {
  if (!args[i + 1]) return { data: { ok: false, error: `migrate-vcs: --cwd requires a path argument` } };
  cwd = args[i + 1];
  i++;
}
// same shape for --target, --workstream
```

### WR-05: git.ts diff() silently produces nonsensical nameOnly output when both nameOnly and nameStatus are passed

**File:** `sdk/src/vcs/backends/git.ts:336-355`
**Issue:** `DiffOpts.nameStatus` and `DiffOpts.nameOnly` are described in the type comment as "mutually exclusive at the git CLI level; if both are set, --name-status wins (callers should pick one)". The implementation appends BOTH `--name-only` and `--name-status` to the argv (lines 318, 323); git's CLI treats the LAST one as authoritative (`--name-status` wins for output format). Then on line 336 the adapter populates `result.nameOnly` from `r.stdout.split('\n').filter(Boolean)` — but stdout is now `--name-status` formatted (`M\tfoo`, `A\tbar`), not bare paths. `nameOnly` ends up as `['M\tfoo', 'A\tbar', …]` — caller gets garbage.

**Fix:** Either ignore `opts.nameOnly` when `opts.nameStatus` is set (don't append the flag, leave `result.nameOnly: []`), or throw a clear error when both are set. The comment promises "name-status wins" but the implementation contaminates the nameOnly output.

```js
if (opts.nameOnly && !opts.nameStatus) args.push('--name-only');
if (opts.nameStatus) args.push('--name-status');
// then later:
nameOnly: opts.nameOnly && !opts.nameStatus ? r.stdout.split('\n').filter(Boolean) : [],
```

## Info

### IN-01: migr-06-close-gate.cjs containment guard is redundant when walkMd starts at PHASE_DIR

**File:** `scripts/migr-06-close-gate.cjs:45-50, 218`
**Issue:** `assertInsidePhaseDir(file)` is called inside the main loop on every walked file, but `walkMd` is itself rooted at PHASE_DIR and joins names from `readdirSync` (which doesn't follow symlinks for entry classification). The guard is defense-in-depth but the only way to defeat it is to have a symlink inside PHASE_DIR pointing OUT — and `entry.isDirectory()` would still be true for the symlink, so recursion follows. The check would catch the resulting absolute path. So the guard does provide value against symlink escape. Document this with a comment so a future reader doesn't strip it as "dead code".

**Fix:** Append `// defense against symlinks inside PHASE_DIR pointing OUT — readdirSync sees the symlink target's stat` to the assertInsidePhaseDir docstring.

### IN-02: emitMarkdown produces unsafe pipe-escaping for table cell values

**File:** `scripts/audit-id-namespace.cjs:122`
**Issue:** The markdown table emitter escapes `|` characters in `callerUse` via `replace(/\|/g, '\\|')` but does NOT escape backslash, newlines, or backticks. A `callerUse` containing a literal backslash followed by `|` (e.g. `something\` then end-of-cell) becomes `something\\|` which is double-escape. Code containing backticks within the trimmed snippet renders as code-formatted inside the cell. None of these are correctness bugs — the audit table is human-read — but the escaping is partial. Either escape completely or document that the rendering is best-effort.

**Fix:** Either commit to full escaping (also escape `\` and replace `\n`/`\r` with `<br>` or space) or annotate the column with a footnote: "_(callerUse text is best-effort escaped; review the source file at file:line for the canonical line)_".

### IN-03: parseJjBookmarkRecord throws on non-array target instead of treating it as malformed

**File:** `sdk/src/vcs/parse/jj-bookmark.ts:72-82`
**Issue:** If `record.target` is, say, a string or null (contract drift), the code silently falls through to the empty-string default at line 81 — `rev: ''` — rather than throwing the contract-drift error the way the `record.name` check does. The JSDoc explicitly says length>1 throws; the implicit "length=0 or wrong type" path collapses silently. Inconsistent with the explicit `typeof record.name !== 'string'` contract check above.

**Fix:** Mirror the `record.name` check pattern:

```js
if (!Array.isArray(record.target)) {
  const preview = line.length > 80 ? line.slice(0, 80) + '...' : line;
  throw new Error(
    `parseJjBookmarkRecord: contract drift — record.target is not an array (got ${typeof record.target}): ${preview}`,
  );
}
```

### IN-04: seed-lint-allowlist.cjs has no idempotency assertion despite the JSDoc claim

**File:** `scripts/seed-lint-allowlist.cjs` (entire file)
**Issue:** The JSDoc says "Idempotent: re-running with the same audit JSON produces byte-identical output." But the script always issues `fs.writeFileSync(ALLOW_PATH, …)` regardless of whether the content changed. On a re-run, the file mtime advances even when bytes are identical — which means downstream consumers using mtime-based caching (e.g. `make` rules, `tup`) re-execute. A defensive check would compare existing content to new content and skip the write.

**Fix:** Wrap the write:

```js
const newContent = JSON.stringify(allow, null, 2) + '\n';
const existing = fs.existsSync(ALLOW_PATH) ? fs.readFileSync(ALLOW_PATH, 'utf8') : '';
if (existing === newContent) {
  console.log(`seed-lint-allowlist: no changes (${path.relative(REPO_ROOT, ALLOW_PATH)} already up to date)`);
} else {
  fs.writeFileSync(ALLOW_PATH, newContent);
  console.log(`seed-lint-allowlist: wrote ${allEntries.length} entries to ${path.relative(REPO_ROOT, ALLOW_PATH)}`);
}
```

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
