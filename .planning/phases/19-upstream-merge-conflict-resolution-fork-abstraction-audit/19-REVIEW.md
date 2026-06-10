---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
reviewed: 2026-06-10T17:15:21Z
depth: standard
files_reviewed: 73
files_reviewed_list:
  - .github/ISSUE_TEMPLATE/config.yml
  - .github/workflows/parallel-e2e.yml
  - .github/workflows/test.yml
  - agents/gsd-code-fixer.md
  - agents/gsd-executor.md
  - agents/gsd-research-synthesizer.md
  - commands/gsd/migrate-vcs.md
  - docs/FEATURES.md
  - docs/INVENTORY-MANIFEST.json
  - docs/INVENTORY.md
  - docs/ja-JP/ARCHITECTURE.md
  - docs/ko-KR/ARCHITECTURE.md
  - docs/USER-GUIDE.md
  - gsd-core/bin/gsd-tools.cjs
  - gsd-core/bin/shared/config-schema.manifest.json
  - gsd-core/references/dispatch-cwd-safety.md
  - gsd-core/templates/config.json
  - gsd-core/workflows/_runtime-launcher.snippet.sh
  - gsd-core/workflows/code-review.md
  - gsd-core/workflows/complete-milestone.md
  - gsd-core/workflows/execute-phase.md
  - gsd-core/workflows/help/modes/full.md
  - gsd-core/workflows/migrate-vcs.md
  - gsd-core/workflows/new-milestone.md
  - gsd-core/workflows/new-project.md
  - gsd-core/workflows/plan-phase.md
  - gsd-core/workflows/quick.md
  - gsd-core/workflows/undo.md
  - hooks/lib/git-cmd.js
  - scripts/audit-id-namespace.cjs
  - scripts/audit-root-commits-rename.cjs
  - scripts/audit-workflow-raw-git.cjs
  - scripts/changeset/github-release-notes.cjs
  - scripts/dogfood-phase-14.sh
  - scripts/e2e-parallel-phase.sh
  - scripts/lint-vcs-no-commit-id.allow.json
  - scripts/lint-vcs-no-commit-id.cjs
  - scripts/lint-vcs-no-raw-git.allow.json
  - scripts/lint-vcs-no-raw-git.cjs
  - scripts/lint-vcs-parallel-call-presence.cjs
  - scripts/migr-06-close-gate.cjs
  - src/check-command-router.cts
  - src/commands.cts
  - src/core.cts
  - src/drift.cts
  - src/graphify.cts
  - src/init.cts
  - src/roadmap-upgrade.cts
  - src/shell-command-projection.cts
  - src/vcs-command-router.cts
  - src/vcs/backends.cts
  - src/vcs/backends/git.cts
  - src/vcs/backends/jj.cts
  - src/vcs/exec.cts
  - src/vcs/expr.cts
  - src/vcs/format-migration/run.cts
  - src/vcs/git/parallel.cts
  - src/vcs/hook-bridge.cts
  - src/vcs/index.cts
  - src/vcs/jj/parallel.cts
  - src/vcs/refs-validator.cts
  - src/vcs/types.cts
  - src/verify.cts
  - src/worktree-base-ref.cts
  - src/worktree-safety.cts
  - tests/bridge-commit-files.test.cjs
  - tests/bug-3097-3099-executor-worktree-path-safety.test.cjs
  - tests/bug-685-windowshide-spawn.test.cjs
  - tests/helpers.cjs
  - tests/scripts/lint-vcs-no-raw-git-fixture.test.cjs
  - tests/scripts/lint-vcs-parallel-call-presence.test.cjs
  - tests/vcs-adapter-contract.test.cjs
  - tests/vcs-cjs-smoke.test.cjs
findings:
  critical: 3
  warning: 10
  info: 7
  total: 20
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-06-10T17:15:21Z
**Depth:** standard
**Files Reviewed:** 73
**Status:** issues_found

## Summary

This review covers the Phase 19 upstream-merge + fork-abstraction port: the VcsAdapter layer (`src/vcs/**`), the migrated command modules (`src/*.cts`), the CLI bridge (`src/vcs-command-router.cts`, `gsd-core/bin/gsd-tools.cjs`), lint/audit tooling, shell harnesses, tests, and the workflow/agent markdown.

The five phase invariants were checked directly:

1. **No raw `git` outside allowlisted substrate** — holds. Every `spawnSync('git', …)` / `execGit` site found is inside an allowlisted module (`src/vcs/exec.cts`, `src/vcs/backends/git.cts`, `src/vcs/git/parallel.cts`, `src/shell-command-projection.cts`, `src/worktree-safety.cts`, `src/worktree-base-ref.cts`) and the allowlist files match the ledger.
2. **No commit_id leakage from jj paths** — holds in the adapter (`change_id` templates throughout `jj.cts`; `bookmark list` uses a custom `change_id` template; `merged[]`/`CommitResult.id` carry change_ids; `tests/bridge-commit-files.test.cjs` pins the envelope).
3. **CJS/CTS interop** — `export =` / `import = require` shapes are consistent; smoke test exercises the built artifact.
4. **Shell-injection safety** — all spawns use argv arrays; however several argv *option-injection* gaps exist where the codebase's own `validateRefname`/`--` discipline is not applied uniformly (WR-02, WR-03, WR-06, WR-09).
5. **Workflow/agent verb dispatch** — every `gsd-tools query <verb>` literal found in the reviewed markdown resolves to a verb in `VCS_VERB_TABLE` or an existing gsd-tools family.

However, three Critical defects were found: an unhandled-crash path on jj repos in `cmdCommit` (a verb the allowlist explicitly claims is unreachable on jj), a silently-no-op rollback in `roadmap-upgrade` on the jj backend, and an undo workflow whose final commit step drops the staged revert content. Documentation-heavy files (docs/*, large workflow markdown) were reviewed via targeted invariant scans (verb existence, raw-git baseline, commit_id leakage) rather than line-by-line prose reads.

## Critical Issues

### CR-01: `cmdCommit` crashes with unhandled `VcsNotImplementedError` on jj repos when a branching strategy is configured

**File:** `src/commands.cts:583-597` (with `src/vcs/backends/jj.cts:773-783`, `src/vcs/backends.cts:102`)
**Issue:** The 19-07 port deliberately removed the `{ kind: 'git' }` pin from cmdCommit's adapter ("Deviation from the 02-09-era fork annotations… AUTO-DETECT"). With `branching_strategy: phase|milestone` configured, the branching block calls `branchVcs.refs.bookmarks.switch(branchName, { create: true })`; the catch then retries `branchVcs.refs.bookmarks.switch(branchName)`. On the jj backend **both** calls throw `VcsNotImplementedError` ("no Phase 3 caller exercises this on jj backend (see 03-03-AUDIT.md)"). The second throw is uncaught, so `gsd-tools commit` crashes with a stack trace instead of committing or emitting an envelope. The `BACKENDS_AVAILABLE_FOR_VERB['refs.bookmarks.switch'] = ['git']` rationale ("both production callers pin kind:'git'") is now factually false — this call site no longer pins git. This is exactly the drift the per-verb allowlist was designed to prevent.
**Fix:**
```ts
// src/commands.cts — guard the jj backend before any switch attempt:
if (branchName && branchVcs.kind === 'git') {
  const currentBranch = branchVcs.refs.currentBookmarks()[0] ?? null;
  if (currentBranch !== null && currentBranch !== branchName) {
    try { branchVcs.refs.bookmarks.switch(branchName, { create: true }); }
    catch { branchVcs.refs.bookmarks.switch(branchName); }
  }
}
// (or implement refs.bookmarks.switch on jj and flip the allowlist entry)
```
Also update the stale rationale comments in `backends.cts:93-102` and `jj.cts:773-782`.

### CR-02: `roadmap-upgrade` rollback is a silent no-op on jj — "rolled back" message is false

**File:** `src/roadmap-upgrade.cts:506-515, 626-655`
**Issue:** `headRev` is captured via `vcs.log({ maxCount: 1 })[0].id`. On jj, the first log row is `@` — the *working-copy commit's change_id*. A change_id is a stable pointer to a **mutable** change: by the time the rollback runs, jj has auto-snapshotted the half-migrated working copy into `@`. `vcsExec(cwd, 'jj', ['restore', '--from', headRev, '--', '.planning/'])` therefore restores the working copy *from itself* — a no-op. The edits to ROADMAP.md / STATE.md / config.json are NOT rolled back, yet the function reports `Migration failed (rolled back to ${headRev})`, and the "manual recovery" instructions (`jj restore --from <headRev>`) are equally ineffective. On git the same code path is correct (HEAD is an immutable commit), which makes the jj defect easy to miss.
**Fix:** On jj, capture the rollback baseline as the *parent* of the working copy (`@-`), or better, capture a `jj op log` operation id before mutating and roll back via `jj op restore <op>`:
```ts
const headEntries = vcs.kind === 'jj'
  ? vcs.log({ rev: expr.parent(), maxCount: 1 })   // @- : immutable-ish baseline
  : vcs.log({ maxCount: 1 });                       // git HEAD
```
and update the manual-recovery text accordingly.

### CR-03: `/gsd:undo` final commit step cannot commit the staged revert — revert content is dropped or left uncommitted

**File:** `gsd-core/workflows/undo.md:262-279` (interacting with `src/commands.cts:518-714`, `src/vcs/backends/git.cts:145-185`)
**Issue:** After `gsd_run query revert --no-commit <hash>` stages the inverse diff (git backend), the workflow finalizes with `gsd_run query commit "revert(...): …"` with **no `--files`**. That routes to `cmdCommit`, whose default scope is `filesToCommit = ['.planning/']`:
- If the reverted commits touched only non-`.planning/` files, the pre-probe (`status.entries.filter(e => filesToCommit.some(...))`) finds nothing and returns `{committed:false, reason:'nothing_to_commit'}` — the staged revert is never committed, and the workflow proceeds to print "UNDO COMPLETE ✓".
- If they touched any `.planning/` file, the git backend's WC-state-capture path runs `git read-tree HEAD` (resetting the index — **unstaging the entire revert**) then `git add -A -- .planning/` and commits only the `.planning/` subset. The code revert is left as uncommitted worktree changes.
- Additionally, `cmdCommit` gates on `commit_docs`; with `commit_docs:false` the final commit is silently skipped altogether.
Either way the user is told the undo succeeded while the actual revert never lands in history. (jj is unaffected — `jj abandon` is self-contained.)
**Fix:** The finalize step must commit the full staged revert, e.g. dispatch the revert sequence's commit through a scope-complete call (`gsd_run query commit "<msg>" --files .` is still wrong because of the `read-tree` reset semantics) — the correct shape is to drop `--no-commit` and let each `query revert <hash>` create its own commit, or add an explicit "commit staged state verbatim" path (`--respect-staged` with the staged file list) to the finalize step. Whatever shape is chosen, the workflow must check the envelope's `committed` field instead of assuming success.

## Warnings

### WR-01: `status()` in the git backend bypasses the exec seam — no `windowsHide`, no timeout

**File:** `src/vcs/backends/git.cts:303-310`
**Issue:** `statusTrimEnd` calls `spawnSync('git', …, { cwd, stdio:'pipe', encoding:'utf-8' })` directly (to avoid `vcsExec`'s trim). It omits `windowsHide: true` — violating the very contract documented in `src/vcs/exec.cts:111-118` ("19-07 issue #685 parity… setting it here preserves that contract adapter-wide") — and omits any timeout, so a wedged git (locked index, hung NFS) hangs `vcs.status()` forever while every other adapter call is bounded at 10s. The guard test misses it: `tests/bug-685-windowshide-spawn.test.cjs:88-90` walks `src/*.cts` **non-recursively**, so nothing under `src/vcs/` is scanned by the "completeness" invariant.
**Fix:** Add `windowsHide: true` and `timeout: DEFAULT_VCS_TIMEOUT_MS` to the `statusTrimEnd` spawnSync options, and make the completeness test's `listDir` recursive over `src/`.

### WR-02: jj `commit()` bookmark advance bypasses `validateRefname` and the `--` separator

**File:** `src/vcs/backends/jj.cts:305-322`
**Issue:** `bmName` (from `input.bookmarkRaw`, or `gsd/`-prefixed `input.bookmark`) is placed directly into `jjArgv('bookmark', 'set', bmName, '-r', '@-', '--allow-backwards')` with neither `validateRefname(bmName)` nor a `--` separator. A caller-supplied name beginning with `-` (e.g. `--delete`, `-r`) is parsed as a flag by jj. Every other bookmark write site in this file (create/move/delete/exists) applies the D-24 validator + `--` pair; `types.cts` even documents `WorkspaceMergeOpts.mainBookmark` as "Validated via validateRefname before reaching argv". This is the one bookmark-write path that skips both layers.
**Fix:**
```ts
const bmName = input.bookmarkRaw !== undefined ? input.bookmarkRaw : addPrefix(input.bookmark!);
validateRefname(bmName);
const advArgs = jjArgv('bookmark', 'set', '-r', '@-', '--allow-backwards', '--', bmName);
```
(confirm jj accepts `--` before the positional; otherwise validator alone.)

### WR-03: git backend `bookmarks.switch` and `workspace.add` accept unvalidated names at argv positions

**File:** `src/vcs/backends/git.cts:456-462, 636-638`
**Issue:** `bookmarks.switch(name)` builds `['checkout', '-b', name]` / `['checkout', name]` without `validateRefname(name)` or `--`, unlike its create/move/delete siblings. `name` is derived from user-controlled config templates (`phase_branch_template` interpolated with the phase slug) via `cmdCommit` (`src/commands.cts:567-577`), so a template producing a `-`-leading token reaches `git checkout` as an option. Similarly `workspace.add` passes `input.name` to `-b` and `input.path` as a positional without validation or `--`.
**Fix:** Apply `validateRefname(name)` in `switch` (and validate `input.name` in `workspace.add`), mirroring the D-24 pattern used everywhere else in the file.

### WR-04: `cmdCommit --amend` / `--respect-staged` on jj crash with an unhandled typed error instead of an envelope

**File:** `src/commands.cts:683-687` (with `src/vcs/backends/jj.cts:172-185`)
**Issue:** On the jj backend, `vcs.commit({amend:true})` and `vcs.commit({respectStaged:true})` throw `VcsNotImplementedError`. `cmdCommit` does not catch them, so `gsd-tools commit --amend` on a jj repo exits via a raw stack trace rather than a `{committed:false, reason:…}` envelope, breaking the JSON-envelope contract workflows parse with jq. Same crash class as CR-01 but on explicit flags rather than ambient config.
**Fix:** Wrap the `vcs.commit(...)` call in try/catch and map `VcsNotImplementedError` to `{committed:false, reason:'not_supported_on_jj', error: e.message}` (exit 0, per the envelope contract).

### WR-05: `--range HEAD~N` resolution via `vcs.log()` index is wrong on histories containing merges

**File:** `src/vcs-command-router.cts:99-110`
**Issue:** `parseSingle` resolves `HEAD~N` as `vcs.log({maxCount: n+1})[n].id`. `git log` (and `jj log`) order is reverse-chronological across **all** parents, not first-parent ancestry — on any history with merge commits, `entries[n]` is generally NOT `HEAD~N`. `query log/diff --range HEAD~3..HEAD` can therefore silently diff/log against the wrong revision.
**Fix:** Resolve `HEAD~N` through the backend (`git rev-parse HEAD~N` analog) — e.g. add a `refs.resolveAncestor(n)` verb, or on git pass the literal `HEAD~N` through `toGitRev` via a dedicated `expr.ancestor(n)` factory instead of approximating with log order.

### WR-06: `revert` verb's jj path passes the user-supplied rev unvalidated and skips the mandatory jj flag set

**File:** `src/vcs-command-router.cts:795-797`
**Issue:** `vcsExec(cwd, 'jj', ['abandon', rev])` — (a) `rev` only filters `--`-prefixed argv tokens; a single-dash token (e.g. `-r`) is accepted as the positional and reinterpreted by jj as a flag; no `--` separator and no shape validation (`expr.rev`-style) is applied; (b) the invocation omits the `jjArgv` mandatory flags (`--no-pager --color never --quiet`) every adapter call uses, so output may include ANSI/pager behavior the envelope passes through verbatim.
**Fix:** Validate `rev` against the id-shape regex (or via `expr.rev`), use `['--no-pager','--color','never','--quiet','abandon','--', rev]`, and reject single-dash positionals.

### WR-07: jj `workspace.remove` derives the rm-rf target from `basename(input)` — wrong-directory deletion is possible

**File:** `src/vcs/backends/jj.cts:1339-1356`
**Issue:** `onDiskPath = join(cwd, '.claude/jj-workspaces', name)` where `name = matchByName?.path ?? basename(workspacePathOrName)`. The comment claims "no path traversal because name is either a workspace.list() entry path or a basename", but (a) `basename('..') === '..'` → `rmSync(join(cwd, '.claude'), {recursive, force})` deletes the whole `.claude` directory; (b) when the caller passes a real on-disk path that is *not* under the D-16 layout, the function silently deletes the same-named directory under `.claude/jj-workspaces/` instead of the one requested (or nothing), while the actual workspace dir survives.
**Fix:** Reject `name` values of `'.'`/`'..'`/containing separators after basename, and prefer resolving the on-disk path from the matched workspace entry rather than re-deriving it from the layout convention.

### WR-08: git `workspace.reap` basename filter breaks on Windows paths

**File:** `src/vcs/backends/git.cts:709`
**Issue:** `const name = entry.path.split('/').pop()` — `git worktree list --porcelain` paths on Windows use backslashes, so `split('/')` returns the full path and `name.startsWith(opts.phaseNamePrefix)` never matches: reap silently becomes a no-op on Windows. The codebase elsewhere normalizes separators (e.g. `worktree-safety.cts:593`).
**Fix:** `const name = path.basename(entry.path)` (or `entry.path.split(/[\\/]/).pop()`).

### WR-09: wave-cleanup manifest `worktree_path` reaches git argv positions unvalidated; status-probe failure mislabeled

**File:** `src/worktree-safety.cts:429-445, 692-806`
**Issue:** `normalizeCleanupManifestEntry` validates `branch` against `^worktree-agent-[A-Za-z0-9._/-]+$` but accepts any non-empty string for `worktree_path`, which is then spliced into `['-C', entry.worktree_path, …]`, `['worktree','remove', entry.worktree_path, '--force']`, etc. A crafted/corrupted manifest with a `-`-leading path injects options into `git worktree remove`/`unlock` (the `-C` uses are safe since `-C` consumes the value). The file is operator-supplied via `--manifest`, so impact is local, but it breaks the repo's otherwise-uniform `--`/validator discipline. Separately, when the `git status --porcelain` probe itself fails (line 749-757) the entry is reported with `reason: 'worktree_dirty'` — misleading; the tree's dirtiness was never determined.
**Fix:** Reject `worktree_path` values starting with `-` in `normalizeCleanupManifestEntry`; use a distinct `status_probe_failed` reason for the probe-failure branch.

### WR-10: `isGitSubcommand` misses chained/compound commands — guard hooks can be bypassed

**File:** `hooks/lib/git-cmd.js:74-159`
**Issue:** `tokenize` does not split on `;`, `&&`, `||`, `|`, `$(…)`, or newlines. `isGitSubcommand('true && git commit -m x', 'commit')` returns `false` (first token `true` is not `git`), so any PreToolUse guard built on this classifier (gsd-validate-commit.sh, gsd-workflow-guard.js per the header) is silently skipped for compound Bash commands — the most common shape agents emit (`cd x && git commit …`). Whether consumers pre-split is not guaranteed by this module's contract.
**Fix:** Split the command on unquoted `;`, `&&`, `||`, `|`, and newline boundaries and run the token-walk on each segment, returning true if any segment matches; document the residual limits (subshells, `bash -c`).

## Info

### IN-01: Dead helper `notImpl` in jj backend

**File:** `src/vcs/backends/jj.cts:131-135`
**Issue:** `notImpl` is declared but never called (all not-implemented verbs throw `VcsNotImplementedError` inline).
**Fix:** Delete the helper or route the inline throws through it.

### IN-02: Unused `expr` import in jj parallel sidecar

**File:** `src/vcs/jj/parallel.cts:52`
**Issue:** `import { expr } from '../expr.cjs'` has no usage in the module.
**Fix:** Remove the import (also confirms `noUnusedLocals` is not enforced on .cts — consider enabling).

### IN-03: gsd-tools `--help` / header docs omit the entire VCS verb family

**File:** `gsd-core/bin/gsd-tools.cjs:359-372` (TOP_LEVEL_USAGE), header docblock
**Issue:** The dispatcher routes `status, log, diff, head-ref, current-branch, branch-list, push, merge, reset, restore, revert, migrate-vcs, cleanup-subagent-workspaces, hooks, workspace`, but none of these appear in `TOP_LEVEL_USAGE` (whose own comment says the list "must enumerate every top-level command") or the file-header usage docs.
**Fix:** Append the Phase 19 verb families to the Commands line and header.

### IN-04: `migrate-vcs` with a garbage `vcs.adapter` value yields a confusing error

**File:** `src/vcs-command-router.cts:983-1000`
**Issue:** If `config.vcs.adapter` is an unexpected string (not git/jj/auto/absent), `target` stays `undefined` and the caller sees `invalid --target 'undefined'`.
**Fix:** Normalize unknown `currentAdapter` values to `'absent'` before the defaulting branch.

### IN-05: git `diff --name-status` parser emits `status: undefined` entries on malformed lines

**File:** `src/vcs/backends/git.cts:373-384`
**Issue:** `cols[0]` may be the empty string (line starting with a tab); `statusRaw[0]` is then `undefined` and an entry with `status: undefined` (violating the `DiffNameStatusEntry` union at runtime) is pushed.
**Fix:** `if (!statusRaw) continue;` before deriving `letter`.

### IN-06: `respectStaged` contract text not implemented by the git backend

**File:** `src/vcs/types.cts:73-91` vs `src/vcs/backends/git.cts:214-216`
**Issue:** The contract states the backend "MUST return a CommitResult with exitCode !== 0 AND stderr containing 'nothing staged'" when the index is empty within the pathspec. The git backend never synthesizes that string; the invariant is actually enforced one layer up in `cmdCommit` (`src/commands.cts:651-655`). Doc/impl drift — a future direct adapter consumer relying on the documented stderr will mis-handle the empty case.
**Fix:** Either implement the check in the backend or correct the JSDoc to name `cmdCommit` as the enforcement layer.

### IN-07: `createVcsAdapter` lock-in performs a read-modify-write of config.json on read-only queries

**File:** `src/vcs/index.cts:113-131`
**Issue:** Any read-only command that constructs an adapter without an explicit kind (e.g. `gitWorktreeInfoInternal`, `query status`) can rewrite `.planning/config.json` (B-09 lock-in). The write is atomic (temp+rename) but is a whole-file last-writer-wins replace based on a possibly-stale read — a concurrent `config-set` in another process can be silently clobbered, and read-only invocations dirty the working copy (extra noise in jj auto-snapshots).
**Fix:** Acceptable as a documented design, but consider acquiring the existing planning state-lock for the lock-in write, or restricting lock-in to explicitly mutating entry points.

---

_Reviewed: 2026-06-10T17:15:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
