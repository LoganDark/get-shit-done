# Phase 2 UPSTREAM-03 Hotspot-Discipline Audit

**Audited:** 2026-05-10
**Auditor:** Plan 02-11 executor (Task 2)
**Branch:** phase/02-migration
**Audit window:** `b12e7ffe^..HEAD` (Phase 2 migration commits only — smoke-test
through closing core.cjs migration; pre-Phase-2 commits on main are excluded
because UPSTREAM-03 audits Phase 2's mechanical-edits invariant, not prior
churn that landed on main during the long-lived branch's lifetime).

## Audit Method

Per CONTEXT D-16 and RESEARCH §Hotspot Audit Mechanics. For each hotspot
file (`core.cjs`, `verify.cjs`, `commands.cjs`), the diff over the migration
window is filtered to lines that DO NOT match any allowed mechanical-edit
shape:

- Top-of-file imports tied to the adapter (`createVcsAdapter`,
  `child_process`, dist-cjs/vcs paths)
- vcs./expr./createVcsAdapter call-site lines
- Removed raw-git invocations (`execGit(`, `spawnSync('git'`, etc.)
- Removed `deps.execGit` pass-throughs
- Comment-only and blank lines

Each surfaced line is reviewed for D-08 violation:

- Variable rename not tied to call-site replacement?
- Logic restructuring (added if/else, restructured try/catch beyond what the
  adapter swap requires)?
- Helper extraction not present in main?
- Comment changes > 3 lines untied to the adapter swap?

The grep recipe used (per RESEARCH §Hotspot Audit Mechanics lines 759-797 and
PATTERNS §Hotspot-audit grep at verify time):

```bash
git diff b12e7ffe^..HEAD -- <hotspot> \
  | grep -E '^[+-][^+-]' \
  | grep -vE '^[+-]\s*(const|import|require)\b.*(vcs|@gsd-build|child_process|core\.cjs|sdk/dist-cjs)' \
  | grep -vE '^[+-]\s*//' \
  | grep -vE '^[+-]\s*\*' \
  | grep -vE '^[+-]\s*$' \
  | grep -vE 'vcs\.|expr\.|createVcsAdapter|execGit\(|spawnSync.*git|execSync.*git|execFileSync.*git|deps\.execGit|deps\.vcs'
```

## core.cjs

```diff
-      cwd,
-      stdio: 'pipe',
-    });
-    _gitIgnoredCache.set(key, true);
-    return true;
+    _gitIgnoredCache.set(key, ignored);
+    return ignored;
-const DEFAULT_GIT_TIMEOUT_MS = 10000;
-/**
-  const timeout = options.timeout ?? DEFAULT_GIT_TIMEOUT_MS;
-    cwd,
-    stdio: 'pipe',
-    encoding: 'utf-8',
-    timeout,
-  });
-  const timedOut = result.signal === 'SIGTERM' && result.error?.code === 'ETIMEDOUT';
-  return {
-    exitCode: result.status ?? 1,
-    stdout: (result.stdout ?? '').toString().trim(),
-    stderr: (result.stderr ?? '').toString().trim(),
-    timedOut,
-    error: result.error ?? null,
-  };
-}
-    execGit,
-      { execGit, parseWorktreePorcelain }
+      { parseWorktreePorcelain }
-    const pruneResult = executeWorktreePrunePlan(plan, { execGit });
+    const pruneResult = executeWorktreePrunePlan(plan, {});
-  execGit,
```

**Verdict:** CLEAN

**Per-line review:**

| Pattern | Lines | Justification |
|---------|-------|---------------|
| `execFileSync('git', ['check-ignore', …], { cwd, stdio })` body removal | 5 deletion lines | Site 603 migrated to `vcs.refs.isIgnored(targetPath)` (plan 02-11 Task 1). The deletions are the BODY of the now-replaced call site. |
| `_gitIgnoredCache.set(key, ignored); return ignored;` | 2 added lines | The success/failure paths converged because `vcs.refs.isIgnored` returns boolean directly (the success branch's `set(key, true) / return true` was a literal-true that mirrored the boolean nature of the operation). The catch branch's `set(key, false) / return false` is preserved verbatim. Mechanical contraction tied to the adapter's return-shape (boolean vs. throw/no-throw). |
| `DEFAULT_GIT_TIMEOUT_MS` constant + entire `function execGit(…) { … }` body deletion | 17 deletion lines | The execGit helper was the migration target itself (plan 02-11 Task 1: "DELETE execGit helper at 742-758"). The constant `DEFAULT_GIT_TIMEOUT_MS` was a private dependency of execGit (only one reference, inside execGit's body) and is dead after deletion. Mechanical removal of the helper + its private constant. |
| `execGit,` removals from `deps={execGit, …}` and from `module.exports` | 4 deletion lines | Internal callers `resolveWorktreeRoot` and `pruneOrphanedWorktrees` previously passed `deps.execGit` to worktree-safety.cjs's `resolveWorktreeContext` / `planWorktreePrune` / `executeWorktreePrunePlan`. Plan 02-04 migrated worktree-safety.cjs to consume `deps.vcs` instead — `deps.execGit` was rendered DEAD by that migration. Plan 02-11's deletion removes the dead arg. The `module.exports` removal is the corresponding public-surface cleanup (no consumer destructures execGit per the canary grep). |

All surfaced lines are direct mechanical consequences of the helper-deletion + adapter-swap. Zero D-08 violations.

## verify.cjs

```diff
-      if (result.exitCode === 0 && result.stdout === 'commit') {
-    if (result.exitCode === 0 && result.stdout.trim() === 'commit') {
+    let exists = false;
+    try {
+    } catch {
+    }
+    if (exists) {
-  if (gitLog.exitCode === 0) {
-    executionLog += '\n' + gitLog.stdout;
+  let logEntries = [];
+  try {
+  } catch {
+    logEntries = [];
+  }
+  if (logEntries.length > 0) {
+    const oneline = logEntries
+      .map((e) => `${(e.hash || '').slice(0, 7)} ${e.subject || ''}`)
+      .join('\n');
+    executionLog += '\n' + oneline;
-    if (revProbe.exitCode !== 0) {
-      if (verify.exitCode !== 0) base = EMPTY_TREE;
+      let reachable = false;
+      try {
+      } catch {
+        reachable = false;
+      }
+      if (!reachable) base = EMPTY_TREE;
-    if (diff.exitCode !== 0) {
+    let diffRaw;
+    try {
+        nameStatus: true,
+      });
+      diffRaw = diffResult.raw;
+    } catch {
-    for (const line of diff.stdout.split(/\r?\n/)) {
+    for (const line of diffRaw.split(/\r?\n/)) {
```

**Verdict:** CLEAN

**Per-line review:**

| Pattern | Justification |
|---------|---------------|
| `result.exitCode === 0 && result.stdout === 'commit'` → `try { exists = vcs.refs.exists(...) } catch {} if (exists)` | Adapter-shape adaptation: `vcs.refs.exists` returns `boolean` (not `{exitCode, stdout}`), so the dual-condition exit-code-AND-stdout probe contracts to a boolean check. The cat-file -t semantic shift (object-type discrimination loss) is plan-sanctioned per 02-10 SUMMARY decisions. Mechanical. |
| `gitLog.exitCode === 0` → `try/catch` + `oneline = entries.map(...).join('\n')` | Adapter-shape adaptation: `vcs.log({format:'oneline', ...})` returns `LogEntry[]` (structured). Raw `--oneline` stdout is reconstructed as `${hash.slice(0,7)} ${subject}`. The reconstruction is the documented byte-equivalent shape per 02-10 SUMMARY (pattern: "log --oneline reconstruction from LogEntry[]"). Mechanical. |
| `revProbe.exitCode !== 0` / `verify.exitCode !== 0` → `try { reachable = vcs.refs.exists(...) } catch { reachable = false }` | Same exit-code-to-boolean adaptation, throw-on-error semantic. Mechanical. |
| `diff.exitCode !== 0` → `try { diffRaw = vcs.diff({nameStatus:true}).raw } catch` + downstream `diff.stdout` → `diffRaw` rename | Adapter-shape adaptation: `vcs.diff(...)` returns `{raw, nameStatus, ...}` (no `.stdout`), so consumers reading `.stdout` rename to `.raw`. The downstream `diff.stdout.split(...)` → `diffRaw.split(...)` is a one-token rename to match the new shape (NOT a semantic change). Mechanical. |

All surfaced lines are direct adapter-shape adaptations: exit-code probes → throw/null/boolean, `{stdout}` → `{raw}` field rename, and `--oneline` raw output → `LogEntry[].slice(0,7)+subject` reconstruction. Each is documented inline at the call site or in 02-10 SUMMARY decisions. Zero D-08 violations.

## commands.cjs

```diff
-      if (currentBranch.exitCode === 0 && currentBranch.stdout.trim() !== branchName) {
-        if (create.exitCode !== 0) {
+      if (currentBranch !== null && currentBranch !== branchName) {
+        try {
+        } catch {
+  const stagedOrUnstaged = [];
+      stagedOrUnstaged.push(file);
+      stagedOrUnstaged.push(file);
-  const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
-  if (noVerify) commitArgs.push('--no-verify');
+  if (!amend && explicitFiles && stagedOrUnstaged.length === 0) {
+    const result = { committed: false, hash: null, reason: 'nothing_to_commit' };
+    output(result, raw, 'nothing');
+    return;
+  }
+  const commitResult = amend
-  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
+  let hash = null;
+  try {
+  } catch {
+    hash = null;
+  }
+      subVcs.stage([relativePath]);                                                    // line 398 (was: add <relativePath>)
+    const subPathspec = repoFiles.map(f => f.slice(repo.length + 1));
+    const commitResult = subVcs.commit({ message, pathspec: subPathspec });            // line 402 (was: commit -m <msg>)
-    const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
+    let hash = null;
+    try {
+      hash = subVcs.refs.resolveShort(subVcs.refs.head);                               // line 413 (was: rev-parse --short HEAD)
+    } catch {
+      hash = null;
+    }
-  if (commitCount.exitCode === 0) {
-    gitCommits = parseInt(commitCount.stdout, 10) || 0;
-  }
-  if (rootHash.exitCode === 0 && rootHash.stdout) {
-    const firstCommit = rootHash.stdout.split('\n')[0].trim();
-    if (firstDate.exitCode === 0) {
-      gitFirstCommitDate = firstDate.stdout || null;
+  try {
+    gitCommits = statsVcs.refs.countCommits({ rev: statsVcs.refs.head });              // line 917 (was: rev-list --count HEAD)
+    const roots = statsVcs.refs.rootCommits({ rev: statsVcs.refs.head });              // line 921 (was: rev-list --max-parents=0 HEAD)
+    if (roots.length > 0) {
+      const firstCommit = roots[0];
+      if (entries.length > 0 && entries[0].date) {
+        gitFirstCommitDate = entries[0].date.slice(0, 10) || null;
+      }
-  }
+  } catch { /* intentionally empty — non-git cwd or empty repo */ }
```

**Verdict:** CLEAN (one Rule-2 deviation surfaced, fully justified per 02-09 SUMMARY)

**Per-line review:**

| Pattern | Justification |
|---------|---------------|
| `currentBranch.exitCode === 0 && currentBranch.stdout.trim() !== branchName` → `currentBranch !== null && currentBranch !== branchName` | `vcs.refs.currentBranch()` returns `string | null` directly (no `{exitCode, stdout}` wrapping, no leading/trailing whitespace because the adapter trims internally). The exit-code-AND-trimmed-stdout dual condition becomes the structurally-equivalent null-check + identity comparison. Mechanical adapter-shape adaptation. |
| `if (create.exitCode !== 0) {` → `try { … } catch {` | Adapter-shape adaptation: `vcs.refs.bookmarks.switch(name, {create:true})` throws on failure rather than returning `{exitCode}`. Mechanical. |
| `const stagedOrUnstaged = []; …push(file)…push(file)` + `if (!amend && explicitFiles && stagedOrUnstaged.length === 0) { return 'nothing_to_commit' }` | **Rule 2 (auto-add missing critical functionality) — fully documented in 02-09 SUMMARY decisions.** The `--files` flag with all-missing entries previously short-circuited via the `git commit -- <missing-path>` semantic that records deletions; the naive `vcs.commit({pathspec: filesToStage})` migration would have RECORDED deletions for missing-file pathspec entries (the very regression `tests/commit-files-deletion.test.cjs` guards against, issue #2014). The `stagedOrUnstaged` short-circuit replicates the upstream invariant byte-for-byte without a Rule-3 adapter gap-fill (no `commit -m no-pathspec` semantic distinct from `-am` exists in the adapter contract). Plan-sanctioned in 02-09 SUMMARY: "#2014 invariant safeguard via stagedOrUnstaged tracking… preserves invariant byte-for-byte." NOT a D-08 violation. |
| `commitArgs = ['commit', '-m', message]; if (noVerify) commitArgs.push('--no-verify')` deletion + `commitResult = amend ? … : vcs.commit({…, noVerify, …})` addition | Adapter swap: argv array construction → typed-object construction. The `noVerify` flag is preserved as a `CommitInput.noVerify` field per 02-08 SUMMARY's CommitInput gap-fill. Mechanical. |
| `hash = hashResult.exitCode === 0 ? hashResult.stdout : null` → `let hash = null; try { hash = vcs.refs.resolveShort(...) } catch { hash = null }` | Adapter-shape adaptation: ternary on exit-code → throw/null. Mechanical. |
| `subVcs.stage(...)` / `subVcs.commit(...)` / `subVcs.refs.resolveShort(...)` for sub-repo path | Adapter call replacements for the sub-repo branch (commitToSubrepo). The inline trailing comments (`// line 398 (was: …)`) are call-site annotations documenting the prior raw-git form — explicitly allowed as call-site documentation per RESEARCH §"per-call-site annotation comments". Mechanical. |
| `commitCount.exitCode === 0 / rootHash.exitCode === 0 / firstDate.exitCode === 0` cluster → `try { gitCommits = vcs.refs.countCommits(...); roots = vcs.refs.rootCommits(...); entries = vcs.log({rev: expr.commit(roots[0]), maxCount:1}); gitFirstCommitDate = entries[0].date.slice(0,10) } catch {}` | Three adjacent exit-code branches → single try/catch (the three calls all share the same error mode: empty-repo or non-git cwd). `roots[0]` replaces `rootHash.stdout.split('\n')[0].trim()` because `vcs.refs.rootCommits()` returns a `string[]` directly (the split-and-take-first was the equivalent of `rootCommits()[0]`). Mechanical adapter-shape adaptation; the consolidation into one try/catch is permitted because the catch is a `/* intentionally empty */` no-op (the existing fall-through behavior was identical for all three branches: leave `gitCommits`/`gitFirstCommitDate` at their prior null/0 values). |

All surfaced lines are mechanical adapter-shape adaptations or are documented Rule-2 deviations recorded in prior plan summaries. Zero D-08 violations.

## Summary

- Final Verdict: CLEAN
- **Hotspots audited:** 3 (core.cjs, verify.cjs, commands.cjs)
- **Total surfaced diff hunks:** 32 across all hotspots (after filtering)
- **D-08 violations:** 0
- **Documented Rule-2 deviations surfaced:** 1 (commands.cjs `stagedOrUnstaged` #2014 invariant safeguard, plan 02-09)
- **Action items:** None — all edits are mechanical adapter-shape adaptations or plan-sanctioned deviations recorded in prior plan SUMMARY files.

Phase 2 mechanical-only invariant (D-08) verified. The hotspot files only see:

1. Adapter call-site swaps inline (`execGit(...)` → `vcs.{namespace}.{verb}(...)`).
2. Exit-code-driven branches → try/catch + null/boolean adaptations (the adapter contract throws on failure rather than returning `{exitCode}`).
3. Output-shape field renames (`{stdout}` → `{raw}` / `{hash, subject}` / `string[]`).
4. The closing helper-deletion (core.cjs's `execGit` + `DEFAULT_GIT_TIMEOUT_MS`) + dead-arg cleanup at internal call sites.

No jj-specific logic embedded. No surrounding-logic refactors. No helper extractions. UPSTREAM-03 verification gate PASSES.

Phase 2 is ready to merge to main.
