---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
fixed_at: 2026-06-10T17:40:00Z
review_path: .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
deferred: 0
status: complete
---

# Phase 19: Code Review Fix Report

**Source review:** `19-REVIEW.md` (3 Critical, 10 Warning in scope; 7 Info skipped per scope)
**Result:** all 13 in-scope findings fixed, one atomic jj commit per finding, stacked on the working copy above `vpzlrrlv` (no history rewrites, no bookmark moves).

**Session-wide verification (after all fixes):**
- `pnpm run build:lib` — exit 0 after every individual fix
- `npx vitest run src/vcs/__tests__ --reporter=basic` — 56 files, 578 passed, 11 skipped, 0 failed
- `node scripts/run-tests.cjs --files "tests/vcs-adapter-contract.test.cjs tests/vcs-cjs-smoke.test.cjs tests/bridge-commit-files.test.cjs tests/bug-685-windowshide-spawn.test.cjs"` with `GSD_TEST_BACKENDS=git,jj` — 30 pass, 0 fail; re-run with `GSD_TEST_BACKENDS=git,jj-colocated` to force the jj contract lane — 32 pass, 0 fail (note: `jj` is not a declared backend key; the contract lane key is `jj-colocated`)
- All four lint gates pass: `lint-vcs-no-raw-git` (1073 files, 0 violations), `lint-vcs-no-commit-id` (1026 files, 0 violations), `audit-workflow-raw-git` (230-hit frozen baseline, 0 regressions), `lint-vcs-parallel-call-presence` (107 files, 0 violations)

## Fixed Issues

### CR-01: cmdCommit crashed with unhandled VcsNotImplementedError on jj when a branching strategy is configured

**Files modified:** `src/commands.cts`, `src/vcs/backends.cts`, `src/vcs/backends/jj.cts`
**Commit:** `oylnvyqo`
**Applied fix:** jj-aware behavior (per Phase 14.1 D-02 precedent — bookmark-less `@` is first-class): the branching block in `cmdCommit` now narrows on `branchVcs.kind === 'git'` before any `refs.bookmarks.switch` attempt; on jj the pre-commit branch switch is intentionally skipped. Stale rationale comments updated in `backends.cts` (allowlist entry) and `jj.cts` (the `switch` stub) to name the live guard instead of the expired "callers pin kind:'git'" claim.
**Verification:** e2e probe — tmp jj repo with `branching_strategy: phase` configured: `gsd-tools commit --files …` returns `{"committed":true,"id":"p","reason":"committed"}` (no stack trace).

### CR-02: roadmap-upgrade rollback was a silent no-op on jj

**Files modified:** `src/roadmap-upgrade.cts`
**Commit:** `ntmvypqo`
**Applied fix:** the rollback baseline is captured BEFORE mutations begin and, on jj, is `@-` (`vcs.log({ rev: expr.parent(), maxCount: 1 })`) — the parent of the working-copy commit, i.e. the last landed state — instead of `@`'s change_id, which jj auto-snapshots the half-migrated WC into (making `jj restore --from <@>` restore the WC from itself). git keeps HEAD (immutable, already correct). The rollback and manual-recovery comments were updated to describe the `@-` baseline; the manual-recovery instructions (`jj restore --from ${headRev} -- .planning/`) are now effective because `headRev` is the pre-mutation revision on both backends.
**Verification:** build green; vitest vcs suite green. The capture-ordering is structural (capture happens before the mutation `try` block, unchanged position; only the revision selector changed).

### CR-03: /gsd:undo final commit dropped or unstaged the staged revert

**Files modified:** `gsd-core/workflows/undo.md`, `gsd-core/bin/gsd-tools.cjs`, `src/commands.cts`
**Commit:** `stytmmzy`
**Applied fix:** three coordinated changes:
1. `gsd-tools.cjs` commit case now parses `--respect-staged` and threads it to `cmdCommit` (the flag was documented in docs/CLI-TOOLS.md and implemented in cmdCommit since #3522 but never parsed from the CLI — a silent no-op).
2. `cmdCommit` skips the #2014 `fs.existsSync` path filter under `respectStaged` — a staged DELETION's path is legitimately absent from disk, and respectStaged never runs `git add`, so the hazard the filter guards against cannot occur.
3. `undo.md` finalize step is now backend-aware and envelope-checked: capture `.backend` from the revert envelopes; on jj skip the finalize entirely (`jj abandon` is self-contained) and resolve `REVERT_HASH` via `query head-ref`; on git collect the staged paths via `query diff --cached --name-only` and commit with `query commit "<msg>" --respect-staged --files <paths>` (commits the staged index state verbatim — no `read-tree` reset, no `.planning/` default scope). The workflow must check `jq -e '.committed == true'` and abort with explicit recovery guidance (including the `skipped_commit_docs_false` reason) instead of printing "UNDO COMPLETE" on faith. Success criteria updated to pin both behaviors.
**Verification:** e2e probe — tmp git repo: `query revert --no-commit <hash-of-add-commit>` then `query commit "revert: …" --respect-staged --files added.txt` returns `{"committed":true,…}` and the staged DELETION lands in the commit (`added.txt` gone from HEAD and from disk) — exactly the case the old exists-filter dropped. `node -c gsd-core/bin/gsd-tools.cjs` clean; `audit-workflow-raw-git` 0 regressions.

### WR-01: git status() bypassed the exec seam (no windowsHide, no timeout)

**Files modified:** `src/vcs/backends/git.cts`, `tests/bug-685-windowshide-spawn.test.cjs`
**Commit:** `vqwoxymu`
**Applied fix:** `statusTrimEnd`'s raw `spawnSync` now sets `windowsHide: true` and `timeout: DEFAULT_VCS_TIMEOUT_MS` (imported from `../exec.cjs`), restoring the exec-seam contract at the one deliberate bypass site. The bug-685 completeness test's `listDir` is now a recursive walk over `hooks/` and `src/` (excluding `__tests__` and `node_modules`), so `src/vcs/**` is covered by the invariant that previously missed it.
**Verification:** `node --test tests/bug-685-windowshide-spawn.test.cjs` — 11/11 pass (the recursive walk found no other offenders).

### WR-02: jj commit() bookmark advance bypassed validateRefname and `--`

**Files modified:** `src/vcs/backends/jj.cts`
**Commit:** `rrlxvzkr`
**Applied fix:** `validateRefname(bmName)` before argv build, and the advance argv reshaped to `jjArgv('bookmark', 'set', '-r', '@-', '--allow-backwards', '--', bmName)` — the D-24 defense-in-depth pair used by every other bookmark write site.
**Verification:** empirically probed `jj bookmark set -r @- --allow-backwards -- <name>` on jj 0.41 in a scratch repo before the edit — exit 0, bookmark lands on `@-`. Contract suite (jj-colocated lane) green.

### WR-03: git bookmarks.switch / workspace.add accepted unvalidated names at argv positions

**Files modified:** `src/vcs/backends/git.cts`
**Commit:** `zxmskvsp`
**Applied fix:** `bookmarks.switch` applies `validateRefname(name)` (no `--` — checkout interprets `--` as the revs/paths divider, same rationale documented at `bookmarks.exists`; the validator's leading-dash rejection is the guard). `workspace.add` validates `input.name` via `validateRefname` and rejects `-`-leading `input.path` before the positional slot.
**Verification:** build green; contract + vitest suites green (every existing switch/add caller uses refname-conformant names).

### WR-04: cmdCommit --amend / --respect-staged crashed with an unhandled typed error on jj

**Files modified:** `src/commands.cts`
**Commit:** `mtokvxzo`
**Applied fix:** the `vcs.commit(...)` dispatch is wrapped in try/catch; `VcsNotImplementedError` maps to `{committed:false, id:null, reason:'not_supported_on_jj', error: e.message}` via `output(...)` (exit 0, envelope contract); other errors rethrow.
**Verification:** e2e probe — tmp jj repo: `gsd-tools commit "x" --amend` prints `{"committed":false,"reason":"not_supported_on_jj"}` instead of a stack trace.

### WR-05: --range HEAD~N resolution via log-row index was wrong on merge-bearing histories

**Files modified:** `src/vcs/expr.cts`, `src/vcs/parse/git-rev.cts`, `src/vcs/parse/jj-rev.cts`, `src/vcs-command-router.cts`
**Commit:** `oqqqtvqy`
**Applied fix:** new `expr.ancestor(n)` factory (encoded `ancestor:<n>`, non-negative integer validated); git translator emits `HEAD~N` (backend resolves first-parent ancestry); jj translator emits `@` + n×`-` (documented caveat: jj has no first-parent operator, so on merges `<rev>-` is the parent SET — still strictly better than the log-index approximation which was wrong on both backends). `parseSingle` returns `expr.ancestor(n)` for `HEAD~N`/`@~N` and no longer needs the adapter; the `vcs` parameter was dropped from `parseSingle`/`parseRangeArg` and both call sites updated.
**Verification:** build green; vitest expr/parse suites green (32 expr tests, 8 git-rev tests pass).

### WR-06: revert verb's jj path passed the user-supplied rev unvalidated and skipped the mandatory flag set

**Files modified:** `src/vcs-command-router.cts`
**Commit:** `utrtlumz`
**Applied fix:** the jj branch validates `rev` via `expr.rev(rev)` (id-shape regex; rejects single-dash tokens) and returns an `ok:false` envelope on rejection; the abandon argv now carries `['--no-pager','--color','never','--quiet','abandon', (--ignore-immutable), '--', rev]` — the adapter's mandatory flag set plus the end-of-options separator.
**Verification:** empirically probed `jj --no-pager --color never --quiet abandon -- <change_id>` on jj 0.41 in a scratch repo — exit 0, change abandoned. Build green.

### WR-07: jj workspace.remove could rm -rf the wrong directory (basename traversal)

**Files modified:** `src/vcs/backends/jj.cts`
**Commit:** `vnmuxowx`
**Applied fix:** (a) rejects `name` values of `.`/`..`/anything containing a path separator (the `basename('..') === '..'` case would have made the rm target `cwd/.claude`); (b) explicit path-containment check — the resolved rm target must sit strictly inside `resolve(cwd, '.claude/jj-workspaces') + sep`; (c) when the caller passes a real on-disk PATH (not a `workspace.list()` name) that does not resolve to the derived layout target, the function now throws ("refusing to guess an rm -rf target") instead of silently deleting the same-named directory under the layout.
**Verification:** build green; contract suite jj-colocated lane green (workspace verbs exercised).

### WR-08: git workspace.reap basename filter broke on Windows paths

**Files modified:** `src/vcs/backends/git.cts`
**Commit:** `umkqkzyn`
**Applied fix:** `entry.path.split('/').pop()` replaced with `path.basename(entry.path)` (handles both separators), so the `phaseNamePrefix` inclusion filter matches on Windows instead of silently no-oping.
**Verification:** build green; contract suite green.

### WR-09: manifest worktree_path reached git argv positions unvalidated; probe failure mislabeled

**Files modified:** `src/worktree-safety.cts`
**Commit:** `nwmrorsp`
**Applied fix:** `normalizeCleanupManifestEntry` rejects `worktree_path` values starting with `-` (they were spliced into `git worktree remove/unlock` positionals); the `git status --porcelain` probe-failure branch now reports `reason: 'status_probe_failed'` instead of `'worktree_dirty'` (dirtiness was never determined).
**Verification:** `node --test tests/worktree-safety.test.cjs` — 41/41 pass (all existing `worktree_dirty` assertions target the genuinely-dirty exit-0 case, unaffected).

### WR-10: isGitSubcommand missed chained/compound commands — guard hooks bypassable

**Files modified:** `hooks/lib/git-cmd.js`
**Commit:** `lmpsrutl`
**Applied fix:** new quote-aware `splitOnShellOperators(cmd)` splits on unquoted `;`, `&&`, `||`, `|`, `&`, and newlines; `isGitSubcommand` runs the token-walk (extracted into `segmentIsGitSubcommand`) on each segment and returns true if any matches. Residual limits documented in the JSDoc: command substitution `$(…)`/backticks, subshell grouping, and `bash -c '…'` are not recursed into. `splitOnShellOperators` exported alongside the existing surface.
**Verification:** `node -c` clean; 12-case behavioral probe all pass, including `true && git commit -m x` → true, `cd /tmp && git commit -m "a; b"` → true (quoted operator does not split), `echo '&& git commit'` → false, `git log | head` → false for 'commit'; consumer test `tests/bug-3129-validate-commit-git-bypass.test.cjs` — 0 failures.

## Skipped / Deferred Issues

None — all 13 in-scope findings were fixed. Info findings (IN-01..IN-07) were out of scope per the fix request.

---

_Fixed: 2026-06-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
